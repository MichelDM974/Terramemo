import { readFileSync } from 'node:fs';
import type { Polygon, Position } from 'geojson';
import type { Topology } from 'topojson-specification';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EtatImage } from '../src/map/carte-canvas';
import { FRAG_DISQUES, FRAG_HACHURES, FRAG_TERRES, lireCouleurs, PeintreWebGL, uniformesVue, VERTEX_CARTE, VERTEX_DISQUES, type Couleurs, type Rvba } from '../src/map/carte-webgl';
import { ancre, image, MARGE_PX, preparer, tracerOvale } from '../src/map/dessin';
import { versEcran } from '../src/map/geo';
import { PASTILLE } from '../src/map/pastilles';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import {
  deballer,
  densifier,
  emballer,
  emprisesAPlat,
  estCouture,
  estEmballe,
  mailler,
  maillerTraits,
  pourChaqueCopie,
  tampons,
  triangulerPolygone,
  PAS_DENSIFIER_DEG,
  RECOUVREMENT_COUTURE_DEG,
  projeterF32,
  projeterF64,
  tourDe,
  toursEnPlus,
  type Maillage,
  type MaillagesCarte,
  type PartieMaillee,
} from '../src/map/maillage';
import { cadre, placer, projectionDe, regionVisible, transfoDe } from '../src/map/vue';

// Rendu WebGL : maillage (triangulation, couture) et projection du shader,
// sur les données réelles, au format du téléphone de mesure (384 × 723 px CSS).

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const L = 384;
const H = 723;
const C = cadre(L, H);
const debut = performance.now();
const terres: Maillage = mailler(donnees.entites.map((e) => e.forme));
const duree_ms = performance.now() - debut;
const zones: Maillage = mailler(donnees.contestees.map((z) => z.forme));
const ROTATIONS = [0, 17, 30, 60, 90, 120, 150, 163, 179, 180, -179, 210, 240, 270, 300, 330];

let graine = 11;
const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;

/** Aire d'un anneau en degrés² (lacet), sans le point de fermeture répété. */
function aireAnneau(a: readonly Position[]): number {
  let s = 0;
  for (let i = 0; i < a.length - 1; i++) {
    const p = a[i] as Position;
    const q = a[i + 1] as Position;
    s += (p[0] ?? 0) * (q[1] ?? 0) - (q[0] ?? 0) * (p[1] ?? 0);
  }
  return s / 2;
}

const sommet = (m: Maillage, i: number): [number, number] => [m.lonlat[2 * i] as number, m.lonlat[2 * i + 1] as number];

describe('projection du shader', () => {
  it('Float32 du shader = Equal Earth tournée de d3 (base de projectionDe), à 0,03 px près au zoom 400', () => {
    // λ et r en degrés Float32 : un pas de 1,5·10⁻⁵° vers 180° (0,006 px au zoom 400), sur λ, r et λ − r.
    const K = 400 * C.s;
    let pire = 0;
    for (let i = 0; i < 20_000; i++) {
      const r = alea() * 360 - 180;
      const lon = alea() * 360 - 180;
      const lat = alea() * 180 - 90;
      const tour = tourDe(r, lon);
      const [x, y] = projeterF32(lon, lat, r, tour);
      const [x64, y64] = projeterF64(lon, lat, r, tour);
      pire = Math.max(pire, K * Math.abs(x - x64), K * Math.abs(y - y64));
      // projeterF64 est bien la projection de la vue : la base de projectionDe (d3, rotation comprise).
      if (i % 50 === 0) {
        const b = projectionDe(r, C)([lon, lat]) as [number, number];
        expect(b[0]).toBeCloseTo(C.tx + C.s * x64, 6);
        expect(b[1]).toBeCloseTo(C.ty - C.s * y64, 6);
      }
    }
    expect(pire).toBeLessThan(0.03);
  });

  it('les deux bords d’une couture (180° et −180° + un tour) tombent sur le même nombre', () => {
    for (const r of ROTATIONS) {
      for (const lat of [-89, -60, -16.5, 0, 50, 66.6]) {
        const tour = tourDe(r, 179);
        expect(projeterF32(180, lat, r, tour)).toEqual(projeterF32(-180, lat, r, tour + 1));
      }
    }
  });
});

describe('maillage', () => {
  it('chaque entité et zone est maillée, plages contiguës, indices dans les sommets', () => {
    expect(terres.formes).toHaveLength(donnees.entites.length);
    expect(zones.formes).toHaveLength(donnees.contestees.length);
    const n = terres.lonlat.length / 2;
    expect(terres.milieu.length).toBe(2 * n);
    expect(terres.forme.length).toBe(n);
    expect(terres.triangles.reduce((a, b) => Math.max(a, b), 0)).toBeLessThan(n);
    terres.formes.forEach((f, i) => {
      expect(f.t1).toBeGreaterThan(f.t0);
      if (i) expect(f.t0).toBe((terres.formes[i - 1] as { t1: number }).t1);
    });
    for (const p of terres.parties) for (let t = p.t0; t < p.t1; t++) expect(terres.forme[terres.triangles[t] as number]).toBe(p.forme);
    console.info(
      `maillage des terres : ${n} sommets, ${terres.triangles.length / 3} triangles, ${terres.parties.length} parties, ${duree_ms.toFixed(0)} ms (Node)`,
    );
  });

  it('triangulation : l’aire des triangles est celle des polygones (trous ôtés), polygone par polygone', () => {
    let pire = 0;
    let n = 0;
    for (const f of [...donnees.entites.map((e) => e.forme), ...donnees.contestees.map((z) => z.forme)]) {
      const g = f.geometry;
      for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
        const tp = triangulerPolygone(poly);
        if (!tp) continue;
        let attendue = 0;
        poly.forEach((a, j) => (attendue += (j ? -1 : 1) * Math.abs(aireAnneau(a))));
        let aire = 0;
        const { plat, tri } = tp;
        for (let t = 0; t < tri.length; t += 3) {
          const [a, b, c] = [0, 1, 2].map((k) => [plat[2 * (tri[t + k] as number)] as number, plat[2 * (tri[t + k] as number) + 1] as number]) as [[number, number], [number, number], [number, number]];
          aire += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
        }
        pire = Math.max(pire, Math.abs(aire - attendue) / attendue);
        n++;
      }
    }
    // Écart de l'ordre de l'arrondi Float64 (sommets presque confondus qu'earcut écarte).
    expect(n).toBeGreaterThan(4000);
    expect(pire).toBeLessThan(1e-6);
  });

  it('aucun triangle retourné par la projection, à 16 rotations (sans refine : 113 à 201)', () => {
    // Un triangle dont l'orientation change entre (λ, φ) et l'écran couvrirait
    // le mauvais côté de son arête : trou d'un côté, double couche de l'autre.
    let retournes = 0;
    let aireRetournee = 0;
    for (const r of ROTATIONS) {
      for (const p of terres.parties) {
        const tours = toursEnPlus(p, r);
        for (const tour of tours.length ? tours : [tourDe(r, (p.o + p.e) / 2)]) {
          for (let t = p.t0; t < p.t1; t += 3) {
            const ll = [0, 1, 2].map((k) => sommet(terres, terres.triangles[t + k] as number));
            const [a, b, c] = ll as [[number, number], [number, number], [number, number]];
            const sa = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
            if (Math.abs(sa) < 1e-9) continue; // trois sommets alignés : aucune aire
            const [pa, pb, pc] = ll.map(([lon, lat]) => projeterF64(lon, lat, r, tour)) as [number, number][] as [[number, number], [number, number], [number, number]];
            if (Math.max(Math.abs(pa[0]), Math.abs(pb[0]), Math.abs(pc[0])) > 4) continue; // loin hors de l'ovale (copie)
            const sp = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
            if (Math.sign(sp) !== Math.sign(sa)) {
              retournes++;
              aireRetournee += (Math.abs(sp) / 2) * C.s * C.s;
            }
          }
        }
      }
    }
    expect({ retournes, aire_px2: aireRetournee }).toEqual({ retournes: 0, aire_px2: 0 });
  });

  it('couture : après déroulement, aucun triangle ne s’étire sur plus d’un sixième de la carte (5 rotations, toutes les copies)', () => {
    // Un triangle qui traverserait la coupure couvrirait toute la largeur ; le plus
    // large (l'intérieur de l'Antarctique, sans sommet) en fait 13 %.
    const largeur = 2 * projeterF64(180, 0, 0, 0)[0];
    let pire = 0;
    let ou = '';
    for (const r of [0, 90, 150, 180, 270]) {
      for (const [m] of [[terres], [zones]] as const) {
        for (const p of m.parties) {
          const tours = new Set([tourDe(r, (p.o + p.e) / 2), ...toursEnPlus(p, r)]);
          for (const tour of tours) {
            for (let t = p.t0; t < p.t1; t += 3) {
              const xs = [0, 1, 2].map((k) => projeterF64(...sommet(m, m.triangles[t + k] as number), r, tour)[0]);
              const w = (Math.max(...xs) - Math.min(...xs)) / largeur;
              if (w > pire) {
                pire = w;
                ou = `${donnees.entites[p.forme]?.pays.id ?? 'zone'} à λ0 = ${r}`;
              }
            }
          }
        }
      }
    }
    console.info(`triangle le plus large : ${(pire * 100).toFixed(1)} % de la carte (${ou})`);
    expect(pire).toBeLessThan(1 / 6);
  });

  it('densifier : aucune arête de plus d’un pas, mêmes sommets dans les deux sens (voisins sans fente)', () => {
    const anneau: Position[] = [[-141, 60], [-141, 69.6], [-130, 69.6], [-141, 60]];
    const aller = densifier(anneau);
    for (let i = 0; i < aller.length; i += 2) {
      const j = (i + 2) % aller.length;
      expect(Math.abs((aller[j] as number) - (aller[i] as number))).toBeLessThanOrEqual(PAS_DENSIFIER_DEG + 1e-12);
      expect(Math.abs((aller[j + 1] as number) - (aller[i + 1] as number))).toBeLessThanOrEqual(PAS_DENSIFIER_DEG + 1e-12);
    }
    // L'arête du 141° O parcourue dans l'autre sens (le voisin) : les mêmes nombres, à l'envers.
    const retour = densifier([[-141, 69.6], [-141, 60], [-150, 60], [-141, 69.6]]);
    const a = aller.slice(0, 2 * 10);
    const b = retour.slice(0, 2 * 10);
    const paires = (v: number[]) => Array.from({ length: v.length / 2 }, (_, i) => `${v[2 * i]},${v[2 * i + 1]}`);
    expect(paires(b).reverse().slice(0, 9)).toEqual(paires(a).slice(1, 10));
  });

  it('traits : frontières entre pays une seule fois, sans couture (antiméridien, pôle) ; côtes à part', () => {
    const t0 = performance.now();
    const arcs = donnees.traits();
    const interieurs = maillerTraits(arcs.interieurs);
    const cotes = maillerTraits(arcs.cotes);
    const ms = performance.now() - t0;
    for (const m of [interieurs, cotes]) {
      for (let i = 0; i < m.traits.length; i += 2) {
        const [la, pa] = sommet(m, m.traits[i] as number);
        const [lb, pb] = sommet(m, m.traits[i + 1] as number);
        expect(estCouture(la, pa, lb, pb)).toBe(false);
      }
    }
    // Chaque segment intérieur n'apparaît qu'une fois (dans un sens ou dans l'autre).
    const vus = new Set<string>();
    for (let i = 0; i < interieurs.traits.length; i += 2) {
      const a = sommet(interieurs, interieurs.traits[i] as number).join();
      const b = sommet(interieurs, interieurs.traits[i + 1] as number).join();
      const cle = a < b ? `${a}|${b}` : `${b}|${a}`;
      expect(vus.has(cle)).toBe(false);
      vus.add(cle);
    }
    // La frontière France–Espagne est intérieure, la côte bretonne non.
    const pres = (m: Maillage, lon: number, lat: number) => {
      for (let i = 0; i < m.lonlat.length; i += 2) if (Math.abs((m.lonlat[i] as number) - lon) < 0.3 && Math.abs((m.lonlat[i + 1] as number) - lat) < 0.15) return true;
      return false;
    };
    expect(pres(interieurs, 0.7, 42.7)).toBe(true);
    expect(pres(interieurs, -4.5, 48.4)).toBe(false);
    expect(pres(cotes, -4.5, 48.4)).toBe(true);
    console.info(`traits : ${interieurs.traits.length / 2} intérieurs, ${cotes.traits.length / 2} de côte, ${ms.toFixed(0)} ms (Node)`);
  });

  it('copies du bord : la Russie à λ0 = 0 tient dans l’ovale ; à λ0 = 180, Fidji et la Russie passent la coupure', () => {
    const parties = (id: string) => terres.parties.filter((p) => donnees.entites[p.forme]?.pays.id === id);
    const rus = parties('RUS');
    const plusGrande = rus.reduce((a, b) => (b.t1 - b.t0 > a.t1 - a.t0 ? b : a));
    expect(toursEnPlus(plusGrande, 0)).toEqual([]);
    // À λ0 = 0, la coupure est à 180° : la grande Russie (27° E → 180°) la touche, d'un côté seulement.
    expect(toursEnPlus(plusGrande, 100)).toEqual([]);
    expect(toursEnPlus(plusGrande, -60).length).toBe(2);
    const ata = parties('ATA').reduce((a, b) => (b.t1 - b.t0 > a.t1 - a.t0 ? b : a));
    for (const r of [17, 90, 180, -90]) expect(toursEnPlus(ata, r).length).toBe(2);
    // L'ovale est centré sur r : un point de chaque copie retombe dans [−180°, 180°] du centre.
    for (const r of ROTATIONS) {
      for (const p of terres.parties) {
        const n = tourDe(r, (p.o + p.e) / 2);
        expect(Math.abs((p.o + p.e) / 2 + n * 360 - r)).toBeLessThanOrEqual(180 + 1e-9);
      }
    }
  });

  it('pourChaqueCopie (chaque image, sans allocation) = toursEnPlus partie par partie', () => {
    const em = emprisesAPlat(terres.parties);
    for (const r of [...ROTATIONS, 0.5, -180, 359.9, 1000.3]) {
      const vite: [number, number][] = [];
      pourChaqueCopie(em, r, (i, tour) => vite.push([i, tour]));
      const attendu = terres.parties.flatMap((p, i) => toursEnPlus(p, r).map((t) => [i, t] as [number, number]));
      expect(vite).toEqual(attendu);
      if (r === 180) expect(vite.length).toBeGreaterThan(0);
    }
  });
});

describe('vue de la carte webgl', () => {
  it('écran du shader = écran de la vue (transfoDe, projectionDe), rotation comprise', () => {
    // Le shader : X = l/2 + k·s·x, Y = k·ty + y − k·s·y (carte-webgl.ts, uCentre et uK).
    for (const r of [0, 150, -100]) {
      const v = placer(C, [r, 20], L / 2, H / 2, 3);
      const t = transfoDe(v, C);
      for (const ll of [[2.35, 48.85], [178, -17.7], [-70, -33]] as [number, number][]) {
        const b = projectionDe(v.r, C)(ll) as [number, number];
        const [x, y] = projeterF64(ll[0], ll[1], v.r, tourDe(v.r, ll[0]));
        expect(L / 2 + v.k * C.s * x).toBeCloseTo(t.k * b[0] + t.x, 6);
        expect(v.k * C.ty + v.y - v.k * C.s * y).toBeCloseTo(t.k * b[1] + t.y, 6);
      }
    }
  });
});

// --- Les shaders eux-mêmes : traduits de GLSL en JavaScript, évalués ------------

/**
 * Traducteur GLSL ES 3.00 → JavaScript, pour le sous-ensemble qu'emploient les
 * shaders de la carte : scalaires (bool, int, float), vecteurs (vec2 à vec4,
 * ivec2) et leurs composantes (.xy, .rgb, .a…), opérateurs composante par
 * composante, division entière, fonctions, if/else, ternaires, fonctions
 * natives usuelles et texelFetch. Les types sont suivis comme par le
 * compilateur (int et float mêlés sans conversion : refusé) et tout ce qu'il ne
 * connaît pas lève une erreur : un shader qui sort du sous-ensemble casse le
 * test au lieu d'être mal traduit. Évalué en Float64 (highp), sur le vrai texte
 * des shaders : un shader qui dérive de ce qu'attendent les tests les casse.
 */
type TypeGlsl = 'void' | 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4' | 'ivec2' | 'sampler2D';
const COMPOSANTES: Partial<Record<TypeGlsl, number>> = { bool: 1, int: 1, float: 1, vec2: 2, vec3: 3, vec4: 4, ivec2: 2 };
const TYPES_GLSL = new Set<string>(['void', 'bool', 'int', 'float', 'vec2', 'vec3', 'vec4', 'ivec2', 'sampler2D']);
const PRECISIONS = new Set(['highp', 'mediump', 'lowp']);
const QUALIFICATIFS = new Set(['uniform', 'in', 'out', 'flat', 'smooth', ...PRECISIONS]);
const INTEGREES: Record<string, TypeGlsl> = { gl_Position: 'vec4', gl_VertexID: 'int', gl_FragCoord: 'vec4' };
const scalaire = (t: TypeGlsl) => COMPOSANTES[t] === 1;
const entier = (t: TypeGlsl) => t === 'int' || t === 'ivec2';

/** Texture RGBA8 lue par texelFetch : texels en octets, ligne après ligne. */
interface TextureGlsl {
  largeur: number;
  hauteur: number;
  texels: Uint8Array;
}
type ValeurGlsl = number | boolean | number[] | TextureGlsl;
type Varying = { type: TypeGlsl; flat: boolean };
interface ShaderJs {
  /** Ce que le shader lit : attributs, uniformes, in, gl_VertexID et gl_FragCoord s'il les emploie. */
  entrees: Record<string, TypeGlsl>;
  /** Ses in et out (et gl_Position), pour vérifier l'édition des liens entre deux étages. */
  ins: Record<string, Varying>;
  sorties: Record<string, Varying>;
  executer(valeurs: Record<string, ValeurGlsl>): Record<string, number | boolean | number[]>;
}

/** Fonctions du code traduit (préfixe $ : aucun nom de shader ne les masque). */
const RUNTIME_GLSL = (() => {
  type N = number | number[];
  const compo = (a: N, i: number) => (typeof a === 'number' ? a : (a[i] as number));
  // Une fonction scalaire appliquée composante par composante (scalaires diffusés).
  const cc =
    (f: (...x: number[]) => number) =>
    (...xs: N[]): N => {
      if (xs.every((x) => typeof x === 'number')) return f(...(xs as number[]));
      const n = Math.max(...xs.map((x) => (typeof x === 'number' ? 1 : x.length)));
      return Array.from({ length: n }, (_, i) => f(...xs.map((x) => compo(x, i))));
    };
  const ops: Record<string, (a: number, b: number) => number> = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b };
  return {
    $op: (op: string, a: N, b: N) => cc(ops[op] as (a: number, b: number) => number)(a, b),
    $sw: (v: number[], s: string) => {
      const r = [...s].map((k) => v['xyzwrgbastpq'.indexOf(k) % 4] as number);
      return r.length === 1 ? r[0] : r;
    },
    $ctor: (n: number, ent: boolean, ...args: N[]) => {
      let c = args.flat();
      if (args.length === 1 && typeof args[0] === 'number') c = Array<number>(n).fill(args[0]);
      else if (args.length === 1 ? c.length < n : c.length !== n) throw new Error(`GLSL : constructeur de ${n} composantes avec ${c.length}`);
      return c.slice(0, n).map((x) => (ent ? Math.trunc(x) : x));
    },
    $abs: cc(Math.abs),
    $floor: cc(Math.floor),
    $sin: cc(Math.sin),
    $cos: cc(Math.cos),
    $asin: cc(Math.asin),
    $min: cc(Math.min),
    $max: cc(Math.max),
    $mod: cc((x, y) => x - y * Math.floor(x / y)),
    $clamp: cc((x, a, b) => Math.min(Math.max(x, a), b)),
    $mix: cc((a, b, t) => a * (1 - t) + b * t),
    $distance: (a: N, b: N) => (typeof a === 'number' ? Math.abs(a - (b as number)) : Math.hypot(...a.map((x, i) => x - compo(b, i)))),
    $texelFetch: (t: TextureGlsl, p: number[], lod: number) => {
      const [x, y] = p as [number, number];
      // Hors de la texture, GLSL ne promet rien : une erreur ici.
      if (lod !== 0 || x < 0 || y < 0 || x >= t.largeur || y >= t.hauteur) throw new Error(`GLSL : texelFetch hors de la texture (${x}, ${y}, lod ${lod})`);
      const i = 4 * (y * t.largeur + x);
      return [...t.texels.subarray(i, i + 4)].map((o) => o / 255);
    },
  };
})();

/** Fonctions natives : nombre d'arguments et type du résultat. */
const NATIVES_GLSL: Record<string, { n: number; t: (a: TypeGlsl[]) => TypeGlsl }> = {
  ...Object.fromEntries(['abs', 'floor', 'sin', 'cos', 'asin'].map((f) => [f, { n: 1, t: (a: TypeGlsl[]) => a[0] as TypeGlsl }])),
  ...Object.fromEntries(['min', 'max', 'mod'].map((f) => [f, { n: 2, t: (a: TypeGlsl[]) => a[0] as TypeGlsl }])),
  clamp: { n: 3, t: (a) => a[0] as TypeGlsl },
  mix: { n: 3, t: (a) => a[0] as TypeGlsl },
  distance: { n: 2, t: () => 'float' },
  texelFetch: { n: 3, t: () => 'vec4' },
};

function jetonsGlsl(src: string): string[] {
  const s = src.replace(/^\s*#.*$/gm, '').replace(/\/\/.*$/gm, '');
  const re = /\s*(\d+\.\d*(?:[eE][+-]?\d+)?|\d*\.\d+(?:[eE][+-]?\d+)?|\d+|[A-Za-z_]\w*|<<|>>|<=|>=|==|!=|&&|\|\||[-+*/%<>=!?:;,.(){}&|^])\s*/y;
  const res: string[] = [];
  while (re.lastIndex < s.length) {
    const debut = re.lastIndex;
    const m = re.exec(s);
    if (!m) throw new Error(`GLSL : jeton inconnu à « ${s.slice(debut, debut + 20)} »`);
    res.push(m[1] as string);
  }
  return res;
}

function traduireGlsl(src: string): ShaderJs {
  const j = jetonsGlsl(src);
  let i = 0;
  const voir = (k = 0) => j[i + k];
  const prendre = (attendu?: string): string => {
    const t = j[i++];
    if (t === undefined || (attendu !== undefined && t !== attendu)) throw new Error(`GLSL : « ${attendu ?? 'un jeton'} » attendu, « ${t} » lu (jeton ${i - 1} : ${j.slice(Math.max(0, i - 6), i + 3).join(' ')})`);
    return t;
  };
  const exiger = (ok: boolean, quoi: string) => {
    if (!ok) throw new Error(`GLSL : ${quoi} (jeton ${i} : ${j.slice(Math.max(0, i - 6), i + 2).join(' ')})`);
  };
  const portees: Map<string, TypeGlsl>[] = [new Map(Object.entries(INTEGREES))];
  const typeDe = (nom: string): TypeGlsl => {
    for (let k = portees.length - 1; k >= 0; k--) {
      const t = portees[k]?.get(nom);
      if (t) return t;
    }
    throw new Error(`GLSL : « ${nom} » inconnu`);
  };
  const declarer = (nom: string, t: TypeGlsl) => (portees[portees.length - 1] as Map<string, TypeGlsl>).set(nom, t);
  const fonctions = new Map<string, TypeGlsl>();
  const entrees: Record<string, TypeGlsl> = {};
  const ins: Record<string, Varying> = {};
  const sorties: Record<string, Varying> = {};
  const integrees = new Set<string>();
  const type = (): TypeGlsl => {
    const t = prendre();
    exiger(TYPES_GLSL.has(t), `type inconnu « ${t} »`);
    return t as TypeGlsl;
  };

  type E = { js: string; t: TypeGlsl };
  const NIVEAUX = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  function operation(op: string, a: E, b: E): E {
    if (op === '||' || op === '&&') {
      exiger(a.t === 'bool' && b.t === 'bool', `${a.t} ${op} ${b.t}`);
      return { js: `(${a.js} ${op} ${b.js})`, t: 'bool' };
    }
    if (['|', '^', '&', '<<', '>>', '%'].includes(op)) {
      exiger(a.t === 'int' && b.t === 'int', `${a.t} ${op} ${b.t}`);
      return { js: `(${a.js} ${op} ${b.js})`, t: 'int' };
    }
    if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
      exiger(a.t === b.t && scalaire(a.t), `${a.t} ${op} ${b.t}`);
      return { js: `(${a.js} ${op === '==' ? '===' : op === '!=' ? '!==' : op} ${b.js})`, t: 'bool' };
    }
    // + - * / : int et float ne se mêlent pas ; vecteur et scalaire, composante par composante.
    exiger(entier(a.t) === entier(b.t) && a.t !== 'bool' && b.t !== 'bool', `${a.t} ${op} ${b.t} (sans conversion, refusé par le compilateur)`);
    exiger(scalaire(a.t) || scalaire(b.t) || a.t === b.t, `${a.t} ${op} ${b.t}`);
    const t = scalaire(a.t) ? b.t : a.t;
    if (scalaire(t)) return { js: op === '/' && t === 'int' ? `Math.trunc(${a.js} / ${b.js})` : `(${a.js} ${op} ${b.js})`, t };
    exiger(!(op === '/' && entier(t)), 'division de vecteurs entiers (non traduite)');
    return { js: `$op('${op}', ${a.js}, ${b.js})`, t };
  }
  function expression(): E {
    const c = binaire(0);
    if (voir() !== '?') return c;
    prendre('?');
    const a = expression();
    prendre(':');
    const b = expression();
    exiger(c.t === 'bool' && a.t === b.t, 'ternaire');
    return { js: `(${c.js} ? ${a.js} : ${b.js})`, t: a.t };
  }
  function binaire(niveau: number): E {
    const ops = NIVEAUX[niveau];
    if (!ops) return unaire();
    let g = binaire(niveau + 1);
    while (ops.includes(voir() as string)) {
      const op = prendre();
      g = operation(op, g, binaire(niveau + 1));
    }
    return g;
  }
  function unaire(): E {
    const op = voir();
    if (op !== '-' && op !== '+' && op !== '!') return composantes(primaire());
    prendre();
    const e = unaire();
    if (op === '!') {
      exiger(e.t === 'bool', '! sur un non-booléen');
      return { js: `(!${e.js})`, t: 'bool' };
    }
    exiger(e.t !== 'bool', `${op} sur un booléen`);
    if (op === '+') return e;
    return scalaire(e.t) ? { js: `(-${e.js})`, t: e.t } : { js: `$op('*', ${e.js}, -1)`, t: e.t };
  }
  function composantes(e: E): E {
    while (voir() === '.') {
      prendre('.');
      const s = prendre();
      const n = COMPOSANTES[e.t] ?? 0;
      exiger(n > 1 && /^(?:[xyzw]{1,4}|[rgba]{1,4}|[stpq]{1,4})$/.test(s) && [...s].every((k) => 'xyzwrgbastpq'.indexOf(k) % 4 < n), `.${s} sur ${e.t}`);
      const t = s.length === 1 ? (entier(e.t) ? 'int' : 'float') : `${entier(e.t) ? 'ivec' : 'vec'}${s.length}`;
      exiger(TYPES_GLSL.has(t), `type ${t} (non traduit)`);
      e = { js: `$sw(${e.js}, '${s}')`, t: t as TypeGlsl };
    }
    return e;
  }
  function primaire(): E {
    const t = prendre();
    if (t === '(') {
      const e = expression();
      prendre(')');
      return { js: `(${e.js})`, t: e.t };
    }
    if (/^[\d.]/.test(t)) return { js: t, t: /[.eE]/.test(t) ? 'float' : 'int' };
    if (t === 'true' || t === 'false') return { js: t, t: 'bool' };
    exiger(/^[A-Za-z_]\w*$/.test(t), `« ${t} » inattendu`);
    if (voir() === '(') return appel(t);
    if (t in INTEGREES) integrees.add(t);
    return { js: t, t: typeDe(t) };
  }
  function appel(nom: string): E {
    prendre('(');
    const args: E[] = [];
    while (voir() !== ')') {
      args.push(expression());
      if (voir() === ',') prendre(',');
    }
    prendre(')');
    const js = args.map((a) => a.js).join(', ');
    if (nom === 'float' || nom === 'int') {
      exiger(args.length === 1 && scalaire((args[0] as E).t), `${nom}(…)`);
      return { js: nom === 'int' ? `Math.trunc(${js})` : `(+${js})`, t: nom };
    }
    if (TYPES_GLSL.has(nom) && !scalaire(nom as TypeGlsl) && nom !== 'sampler2D' && nom !== 'void') {
      const t = nom as TypeGlsl;
      return { js: `$ctor(${COMPOSANTES[t]}, ${entier(t)}, ${js})`, t };
    }
    const nat = NATIVES_GLSL[nom];
    if (nat) {
      exiger(args.length === nat.n, `${nom} à ${args.length} arguments`);
      // Les natives de flottants refusent les entiers (texelFetch : coordonnées entières).
      if (nom !== 'texelFetch') exiger(args.every((a) => !entier(a.t) && a.t !== 'bool'), `${nom} sur des entiers`);
      else exiger(args.map((a) => a.t).join() === 'sampler2D,ivec2,int', 'texelFetch(sampler2D, ivec2, int)');
      return { js: `$${nom}(${js})`, t: nat.t(args.map((a) => a.t)) };
    }
    const f = fonctions.get(nom);
    exiger(f !== undefined, `fonction « ${nom} » inconnue`);
    return { js: `${nom}(${js})`, t: f as TypeGlsl };
  }

  function declaration(): string {
    const constante = voir() === 'const';
    if (constante) prendre();
    while (PRECISIONS.has(voir() as string)) prendre();
    const t = type();
    const parts: string[] = [];
    for (;;) {
      const nom = prendre();
      prendre('=');
      const e = expression();
      exiger(e.t === t, `${t} ${nom} = ${e.t}`);
      declarer(nom, t);
      parts.push(`${nom} = ${e.js}`);
      if (voir() !== ',') break;
      prendre(',');
    }
    prendre(';');
    return `${constante ? 'const' : 'let'} ${parts.join(', ')};`;
  }
  function bloc(): string {
    prendre('{');
    portees.push(new Map());
    const corps: string[] = [];
    while (voir() !== '}') corps.push(instruction());
    prendre('}');
    portees.pop();
    return `{\n${corps.join('\n')}\n}`;
  }
  function instruction(): string {
    const t = voir() as string;
    if (t === '{') return bloc();
    if (t === 'if') {
      prendre();
      prendre('(');
      const c = expression();
      prendre(')');
      exiger(c.t === 'bool', 'condition non booléenne');
      const alors = instruction();
      if (voir() !== 'else') return `if (${c.js}) ${alors}`;
      prendre();
      return `if (${c.js}) ${alors} else ${instruction()}`;
    }
    if (t === 'return') {
      prendre();
      if (voir() === ';') return (prendre(), 'return;');
      const e = expression();
      prendre(';');
      return `return ${e.js};`;
    }
    if (TYPES_GLSL.has(t) || t === 'const' || PRECISIONS.has(t)) return declaration();
    const nom = prendre();
    exiger(/^[A-Za-z_]\w*$/.test(nom), `instruction « ${nom} » (non traduite)`);
    if (nom in INTEGREES) integrees.add(nom);
    const tv = typeDe(nom);
    prendre('=');
    const e = expression();
    prendre(';');
    exiger(e.t === tv, `${nom} (${tv}) = ${e.t}`);
    return `${nom} = ${e.js};`;
  }
  function fonction(t: TypeGlsl, nom: string): string {
    prendre('(');
    const params: [string, TypeGlsl][] = [];
    if (voir() === 'void' && voir(1) === ')') prendre();
    while (voir() !== ')') {
      if (voir() === 'in') prendre();
      const pt = type();
      params.push([prendre(), pt]);
      if (voir() === ',') prendre(',');
    }
    prendre(')');
    fonctions.set(nom, t);
    portees.push(new Map(params));
    const corps = bloc();
    portees.pop();
    return `function ${nom}(${params.map((p) => p[0]).join(', ')}) ${corps}`;
  }

  const code: string[] = [];
  while (i < j.length) {
    if (voir() === 'precision') {
      while (prendre() !== ';');
      continue;
    }
    if (voir() === 'const') {
      code.push(declaration());
      continue;
    }
    if (voir() === 'layout') {
      prendre();
      prendre('(');
      while (prendre() !== ')');
    }
    const quals = new Set<string>();
    while (QUALIFICATIFS.has(voir() as string)) quals.add(prendre());
    const t = type();
    const nom = prendre();
    if (voir() === '(') {
      exiger(quals.size === 0, `qualificatifs sur la fonction ${nom}`);
      code.push(fonction(t, nom));
      continue;
    }
    prendre(';');
    declarer(nom, t);
    if (quals.has('uniform') || quals.has('in')) {
      entrees[nom] = t;
      if (quals.has('in')) ins[nom] = { type: t, flat: quals.has('flat') };
    } else {
      exiger(quals.has('out'), `variable globale ${nom} sans uniform, in ni out (non traduite)`);
      sorties[nom] = { type: t, flat: quals.has('flat') };
      code.push(`let ${nom};`);
    }
  }
  exiger(fonctions.get('main') === 'void', 'pas de void main()');
  for (const n of integrees) if (n !== 'gl_Position') entrees[n] = INTEGREES[n] as TypeGlsl;
  if (integrees.has('gl_Position')) sorties.gl_Position = { type: 'vec4', flat: false };
  const corps = [
    `const { ${Object.keys(RUNTIME_GLSL).join(', ')} } = $;`,
    integrees.has('gl_Position') ? 'let gl_Position;' : '',
    ...code,
    'main();',
    `return { ${Object.keys(sorties).join(', ')} };`,
  ].join('\n');
  const f = new Function('$', ...Object.keys(entrees), corps) as (...a: unknown[]) => Record<string, number | boolean | number[]>;
  return {
    entrees,
    ins,
    sorties,
    executer(valeurs) {
      const args = Object.entries(entrees).map(([nom, t]) => {
        const v = valeurs[nom];
        const n = COMPOSANTES[t];
        const ok =
          t === 'sampler2D' ? typeof v === 'object' && v !== null && 'texels' in v
          : t === 'bool' ? typeof v === 'boolean'
          : n === 1 ? typeof v === 'number' && (t !== 'int' || Number.isInteger(v))
          : Array.isArray(v) && v.length === n && (!entier(t) || v.every(Number.isInteger));
        if (!ok) throw new Error(`GLSL : entrée ${nom} (${t}) absente ou mal formée : ${JSON.stringify(v)}`);
        return v;
      });
      const res = f(RUNTIME_GLSL, ...args);
      for (const [nom, v] of Object.entries(sorties)) {
        const x = res[nom];
        const n = COMPOSANTES[v.type];
        if (n === 1 ? typeof x !== 'number' && typeof x !== 'boolean' : !Array.isArray(x) || x.length !== n) throw new Error(`GLSL : sortie ${nom} (${v.type}) non écrite : ${JSON.stringify(x)}`);
      }
      return res;
    },
  };
}

/** Coordonnées de découpe → px CSS (l'inverse de gl_Position des vertex shaders). */
const versCss = (p: number[], l: number, h: number): [number, number] => [(((p[0] as number) + 1) / 2) * l, ((1 - (p[1] as number)) / 2) * h];

const vertexCarte = traduireGlsl(VERTEX_CARTE);
const shader = (o: { lon: number; lat: number; ml: number; mp?: number; forme?: number; r: number; mode: number; tour?: number; K: number; centre: [number, number]; l: number; h: number }) => {
  const s = vertexCarte.executer({ aLonLat: [o.lon, o.lat], aMilieu: [o.ml, o.mp ?? 0], aForme: o.forme ?? 0, uR: o.r, uMode: o.mode, uTour: o.tour ?? 0, uK: o.K, uCentre: o.centre, uTaille: [o.l, o.h] });
  const [x, y] = versCss(s.gl_Position as number[], o.l, o.h);
  return { x, y, forme: s.vForme as number, ref: s.vRef as [number, number] };
};

describe('traducteur GLSL des tests', () => {
  it('lit les entrées de chaque shader, refuse int et float mêlés, et ce qu’il ne sait pas traduire', () => {
    expect(Object.keys(vertexCarte.entrees)).toEqual(['aLonLat', 'aMilieu', 'aForme', 'uR', 'uMode', 'uTour', 'uK', 'uCentre', 'uTaille']);
    expect(Object.keys(traduireGlsl(FRAG_TERRES).entrees)).toEqual(['uCouleurs', 'vForme']);
    expect(Object.keys(traduireGlsl(FRAG_HACHURES).entrees)).toEqual(['uCouleur', 'uDpr', 'uHauteur', 'vRef', 'gl_FragCoord']);
    expect(Object.keys(traduireGlsl(VERTEX_DISQUES).entrees)).toEqual(['aDisque', 'aCouleur', 'uTaille', 'gl_VertexID']);
    expect(Object.keys(traduireGlsl(FRAG_DISQUES).entrees)).toEqual(['uBord', 'uDpr', 'vP', 'vD', 'vC']);
    const essai = (corps: string) => () => traduireGlsl(`#version 300 es\nprecision highp float;\nout vec4 sortie;\nvoid main() {\n${corps}\n}`);
    expect(essai('float x = 1;')).toThrow(/float x = int/);
    expect(essai('float x = 2.0 * 3;')).toThrow(/sans conversion/);
    expect(essai('sortie = vec4(1.0); sortie += vec4(1.0);')).toThrow(/attendu/);
    expect(essai('sortie = fract(vec4(1.5));')).toThrow(/fract/);
    const s = essai('int a = 7 / 2; int b = -7 / 2; vec2 v = vec2(a, b) * 0.5; sortie = vec4(v.yx, mod(-1.0, 4.0), float(7 % 4));')().executer({});
    expect(s.sortie).toEqual([-1.5, 1.5, 3, 3]);
  });

  it('édition des liens : chaque in d’un fragment shader est un out de son vertex shader, même type, même flat', () => {
    const lier = (v: string, f: string) => {
      const sv = traduireGlsl(v).sorties;
      for (const [nom, x] of Object.entries(traduireGlsl(f).ins)) expect([nom, sv[nom]]).toEqual([nom, x]);
    };
    lier(VERTEX_CARTE, FRAG_TERRES);
    lier(VERTEX_CARTE, FRAG_HACHURES);
    lier(VERTEX_DISQUES, FRAG_DISQUES);
  });
});

describe('vertex shader (le texte GLSL, traduit et évalué)', () => {
  it('= projeterF32 (le miroir) et = la projection de d3 de la vue (uniformesVue, transfoDe, projectionDe)', () => {
    let pireMiroir = 0;
    let pireD3 = 0;
    let comparesD3 = 0;
    for (let i = 0; i < 4000; i++) {
      const v = placer(C, [alea() * 720 - 360, alea() * 140 - 70], L / 2, H / 2, 1 + alea() * 30);
      const { K, centre } = uniformesVue(v, C);
      const lon = alea() * 360 - 180;
      const lat = alea() * 180 - 90;
      const ml = Math.max(-180, Math.min(180, lon + alea() * 40 - 20));
      const e = shader({ lon, lat, ml, r: v.r, mode: 0, K, centre, l: L, h: H });
      const tour = tourDe(v.r, ml);
      const [x, y] = projeterF32(lon, lat, v.r, tour);
      pireMiroir = Math.max(pireMiroir, Math.abs(e.x - (centre[0] + K * x)), Math.abs(e.y - (centre[1] - K * y)));
      // d3 ramène la longitude dans [−180°, 180°] du centre : comparable quand le shader y est aussi.
      if (Math.abs(lon + tour * 360 - v.r) <= 179.9) {
        const t = transfoDe(v, C);
        const b = projectionDe(v.r, C)([lon, lat]) as [number, number];
        pireD3 = Math.max(pireD3, Math.abs(e.x - (t.k * b[0] + t.x)), Math.abs(e.y - (t.k * b[1] + t.y)));
        comparesD3++;
      }
    }
    expect(comparesD3).toBeGreaterThan(2000);
    // Float32 du miroir contre Float64 de l'évaluation : quelques millièmes de pixel au zoom 30.
    expect(pireMiroir).toBeLessThan(0.02);
    expect(pireD3).toBeLessThan(1e-6);
  });

  it('modes : 1 impose le tour uTour (copies du bord), 2 dessine dans le repère de la vue (ovale)', () => {
    const v = placer(C, [170, 10], L / 2, H / 2, 2);
    const { K, centre } = uniformesVue(v, C);
    for (const tour of [-1, 0, 1]) {
      const e = shader({ lon: -175, lat: 20, ml: -170, r: v.r, mode: 1, tour, K, centre, l: L, h: H });
      const [x, y] = projeterF32(-175, 20, v.r, tour);
      expect(e.x).toBeCloseTo(centre[0] + K * x, 3);
      expect(e.y).toBeCloseTo(centre[1] - K * y, 3);
    }
    const bord = shader({ lon: 180, lat: 0, ml: 0, r: v.r, mode: 2, K, centre, l: L, h: H });
    expect(bord.x).toBeCloseTo(centre[0] + K * projeterF64(180, 0, 0, 0)[0], 6);
  });

  it('couture à ±180° : les sommets du maillage y sont poussés vers l’extérieur, les deux bords se recouvrent (< 0,1 px au zoom 400)', () => {
    expect(RECOUVREMENT_COUTURE_DEG).toBeGreaterThan(0);
    let est = -Infinity;
    let ouest = Infinity;
    let pile = 0;
    for (let i = 0; i < terres.lonlat.length; i += 2) {
      const l = terres.lonlat[i] as number;
      est = Math.max(est, l);
      ouest = Math.min(ouest, l);
      if (Math.abs(l) === 180) pile++;
    }
    // Aucun sommet exactement sur l'antiméridien : tous poussés de RECOUVREMENT_COUTURE_DEG (en Float32).
    expect(pile).toBe(0);
    expect(est).toBe(Math.fround(180 + RECOUVREMENT_COUTURE_DEG));
    expect(ouest).toBe(Math.fround(-180 - RECOUVREMENT_COUTURE_DEG));
    // λ0 = 180 : la Russie (bord est à 180°) et la Tchoukotka (bord ouest à −180°) au centre de l'écran.
    for (const r of [180, 179.5, -180]) {
      const v = placer(C, [r, 66], L / 2, H / 2, 400);
      const { K, centre } = uniformesVue(v, C);
      for (const lat of [65, 66.5, 68, 70]) {
        const russie = shader({ lon: est, lat, ml: 100, r: v.r, mode: 0, K, centre, l: L, h: H });
        const tchoukotka = shader({ lon: ouest, lat, ml: -175, r: v.r, mode: 0, K, centre, l: L, h: H });
        const recouvrement = russie.x - tchoukotka.x;
        expect(recouvrement).toBeGreaterThan(0);
        expect(recouvrement).toBeLessThan(0.1);
      }
    }
  });

  it('milieux : chaque sommet porte le milieu de l’emprise de sa partie (tour du shader, origine des hachures)', () => {
    for (const m of [terres, zones]) {
      for (const p of m.parties) {
        const sommets = new Set<number>();
        for (let t = p.t0; t < p.t1; t++) sommets.add(m.triangles[t] as number);
        let s = Infinity;
        let n = -Infinity;
        for (const i of sommets) {
          s = Math.min(s, m.lonlat[2 * i + 1] as number);
          n = Math.max(n, m.lonlat[2 * i + 1] as number);
        }
        for (const i of sommets) {
          expect(m.milieu[2 * i]).toBe(Math.fround((p.o + p.e) / 2));
          expect(Math.abs((m.milieu[2 * i + 1] as number) - (s + n) / 2)).toBeLessThan(1e-3);
          expect(m.forme[i]).toBe(p.forme);
        }
      }
    }
  });
});

describe('maillage emballé (Worker, cache de l’appareil)', () => {
  it('emballer puis deballer rend le même maillage ; tableaux typés seulement, chaque tampon transféré une fois', () => {
    const tout: MaillagesCarte = { terres, zones, interieurs: maillerTraits([[[0, 0], [3, 2.5]]]), cotes: maillerTraits([]) };
    const e = emballer(tout);
    expect(estEmballe(e)).toBe(true);
    expect(estEmballe(structuredClone(e))).toBe(true);
    expect(estEmballe({ ...e, cotes: { ...e.cotes, parties: [] } })).toBe(false);
    expect(estEmballe(null)).toBe(false);
    const d = deballer(structuredClone(e));
    for (const n of ['terres', 'zones', 'interieurs', 'cotes'] as const) {
      expect(d[n].parties).toEqual(tout[n].parties);
      expect(d[n].formes).toEqual(tout[n].formes);
      expect(d[n].lonlat).toEqual(tout[n].lonlat);
      expect(d[n].triangles).toEqual(tout[n].triangles);
      expect(d[n].traits).toEqual(tout[n].traits);
    }
    const ts = tampons(e);
    expect(new Set(ts).size).toBe(ts.length);
    expect(ts.length).toBe(4 * 7);
  });
});

/**
 * Un faux WebGL2 : chaque appel est noté, les constantes sont des nombres
 * distincts ; drawElements et drawArrays retiennent le programme, le VAO et
 * les uniformes du moment. Assez pour vérifier ce que dessiner() demande.
 */
function fauxWebGL() {
  const constantes = new Map<string, number>();
  const programmes = new Map<object, Record<string, unknown>>();
  const indicesDuVao = new Map<object, number>();
  /** Premier tampon de sommets de chaque VAO (celui de l'attribut 0). */
  const sommetsDuVao = new Map<object, Float32Array>();
  const dessins: { prog: object | null; vao: object | null; mode: number; n: number; decalage: number; u: Record<string, unknown> }[] = [];
  let prog: object | null = null;
  let vao: object | null = null;
  let elements = false;
  let texture: TextureGlsl | null = null;
  let instances: Float32Array | null = null;
  let melange: [number, number] | null = null;
  const objet = (type: string) => ({ type });
  const uniforme = (loc: { nom: string; p: object } | null, ...v: unknown[]) => {
    if (loc) (programmes.get(loc.p) ?? programmes.set(loc.p, {}).get(loc.p))![loc.nom] = v.length === 1 ? v[0] : v;
  };
  const cible: Record<string, unknown> = {
    createProgram: () => objet('programme'),
    createShader: () => objet('shader'),
    createBuffer: () => objet('tampon'),
    createVertexArray: () => objet('vao'),
    createTexture: () => objet('texture'),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getExtension: () => null,
    getParameter: () => 'Faux GPU',
    isContextLost: () => false,
    getUniformLocation: (p: object, nom: string) => ({ p, nom }),
    useProgram: (p: object) => (prog = p),
    bindVertexArray: (v: object | null) => (vao = v),
    bindBuffer: (c: number) => (elements = c === constante('ELEMENT_ARRAY_BUFFER')),
    bufferData: (_c: number, d: ArrayBufferView | number) => {
      if (elements && vao && typeof d !== 'number') indicesDuVao.set(vao, d.byteLength / 4);
      if (!elements && vao && d instanceof Float32Array && !sommetsDuVao.has(vao)) sommetsDuVao.set(vao, d);
    },
    bufferSubData: (_c: number, _o: number, d: Float32Array, debut: number, n: number) => (instances = d.slice(debut, debut + n)),
    blendFunc: (a: number, b: number) => (melange = [a, b]),
    uniform1f: uniforme,
    uniform1i: uniforme,
    uniform2f: uniforme,
    uniform4fv: (loc: { nom: string; p: object } | null, v: number[]) => uniforme(loc, [...v]),
    texImage2D: (...a: unknown[]) => (texture = { largeur: a[3] as number, hauteur: a[4] as number, texels: a[8] as Uint8Array }),
    drawElements: (mode: number, n: number, _t: number, decalage: number) => dessins.push({ prog, vao, mode, n, decalage, u: { ...(prog && programmes.get(prog)) } }),
    drawArrays: (mode: number, _a: number, n: number) => dessins.push({ prog, vao, mode, n, decalage: 0, u: { ...(prog && programmes.get(prog)) } }),
    drawArraysInstanced: (mode: number, _a: number, _n: number, n: number) => dessins.push({ prog, vao, mode, n, decalage: 0, u: { ...(prog && programmes.get(prog)) } }),
  };
  function constante(nom: string): number {
    let c = constantes.get(nom);
    if (c === undefined) constantes.set(nom, (c = 0x1000 + constantes.size));
    return c;
  }
  const gl = new Proxy(cible, {
    get: (t, nom: string) => (nom in t ? t[nom] : /^[A-Z0-9_]+$/.test(nom) ? constante(nom) : () => undefined),
  });
  return { gl, dessins, indicesDuVao, sommetsDuVao, texels: () => texture?.texels ?? null, texture: () => texture, instances: () => instances, melange: () => melange, constante };
}

const couleursEssai: Couleurs = {
  mer: [1, 2, 3, 255],
  terre: [10, 20, 30, 255],
  frontiere: [200, 200, 200, 128],
  hachure: [5, 5, 5, 255],
  pastille: [9, 9, 9, 255],
  bord: [0, 0, 0, 255],
  marques: { choisi: [0, 0, 255, 255], juste: [0, 255, 0, 255], faux: [255, 0, 0, 255] },
};

const arcs = donnees.traits();
const tout: MaillagesCarte = { terres, zones, interieurs: maillerTraits(arcs.interieurs), cotes: maillerTraits(arcs.cotes) };
/** Un PeintreWebGL sur le faux WebGL2, au format du téléphone de mesure (dpr 2,8125 par défaut). */
const peintre = (couleurs?: Couleurs, dpr = 2.8125) => {
  const f = fauxWebGL();
  const canvas = { width: Math.round(L * dpr), height: Math.round(H * dpr), getContext: () => f.gl, addEventListener: () => undefined, removeEventListener: () => undefined };
  const p = new PeintreWebGL(canvas as unknown as HTMLCanvasElement, { donnees, redessiner: () => undefined, couleurs: couleurs ?? couleursEssai });
  p.charger(tout);
  p.dimensionner(L, H, dpr);
  return { p, f, canvas };
};
const etat = (r: number, k: number, marques = new Map<string, Set<string>>(), lat = 0): EtatImage => {
  const v = placer(C, [r, lat], L / 2, H / 2, k);
  return { v, c: C, t: transfoDe(v, C), proj: projectionDe(v.r, C), enMouvement: false, pastilles: [], marques, anneaux: [] };
};
const vaoDe = (f: ReturnType<typeof fauxWebGL>, n: number) => [...f.indicesDuVao].filter(([, k]) => k === n).map(([v]) => v);

describe('PeintreWebGL.dessiner (faux WebGL2)', () => {

  it('uniformes de la vue : uK et uCentre = uniformesVue, à chaque programme de la carte', () => {
    const { p, f } = peintre();
    const e = etat(37, 6);
    p.dessiner(e);
    const { K, centre } = uniformesVue(e.v, e.c);
    const carte = f.dessins.filter((d) => d.u.uK !== undefined);
    expect(carte.length).toBeGreaterThan(5);
    for (const d of carte) {
      expect(d.u.uK).toBe(K);
      expect(d.u.uCentre).toEqual(centre);
      expect(d.u.uR).toBe(e.v.r);
    }
  });

  it('terres d’un appel, puis leurs copies du bord (uMode 1, uTour) : celles de pourChaqueCopie, à λ0 = 180', () => {
    const { p, f } = peintre();
    const e = etat(180, 1);
    p.dessiner(e);
    const [vaoTerres] = vaoDe(f, terres.triangles.length);
    const surTerres = f.dessins.filter((d) => d.vao === vaoTerres && d.mode === f.constante('TRIANGLES'));
    const communs = surTerres.filter((d) => d.u.uMode === 0);
    expect(communs.map((d) => d.n)).toContain(terres.triangles.length);
    const attendues: string[] = [];
    pourChaqueCopie(emprisesAPlat(terres.parties), e.v.r, (i, tour) => {
      const pa = terres.parties[i];
      if (pa && pa.t1 > pa.t0) attendues.push(`${pa.t0 * 4}:${pa.t1 - pa.t0}:${tour}`);
    });
    expect(attendues.length).toBeGreaterThan(10);
    const copies = surTerres.filter((d) => d.u.uMode === 1).map((d) => `${d.decalage}:${d.n}:${d.u.uTour}`);
    // Les copies des terres, plus celles des parties contestées hachurées (même VAO, autre programme).
    for (const c of attendues) expect(copies).toContain(c);
  });

  it('frontières puis côtes, en traits (LINES) : tous leurs segments', () => {
    const { p, f } = peintre();
    p.dessiner(etat(0, 1));
    const lignes = f.dessins.filter((d) => d.mode === f.constante('LINES') && d.u.uMode === 0);
    const [vaoInt] = vaoDe(f, tout.interieurs.traits.length);
    const [vaoCotes] = vaoDe(f, tout.cotes.traits.length);
    expect(lignes.find((d) => d.vao === vaoInt)?.n).toBe(tout.interieurs.traits.length);
    expect(lignes.find((d) => d.vao === vaoCotes)?.n).toBe(tout.cotes.traits.length);
  });

  it('couleur de chaque pays : terre, ou sa marque (texture des couleurs)', () => {
    const { p, f } = peintre();
    const i = donnees.entites.findIndex((e) => e.pays.id === 'FRA');
    p.dessiner(etat(0, 1, new Map([['FRA', new Set(['faux'])]])));
    const t = f.texels();
    expect(t && [...t.slice(4 * i, 4 * i + 4)]).toEqual(couleursEssai.marques.faux);
    expect(t && [...t.slice(4 * (i + 1), 4 * (i + 1) + 4)]).toEqual(couleursEssai.terre);
    // La mer est la couleur de l'ovale (premier dessin, mode 2).
    const ovale = f.dessins[0];
    expect(ovale?.u.uMode).toBe(2);
    expect(ovale?.u.uCouleur).toEqual(couleursEssai.mer.map((x) => x / 255));
  });
});

// --- Les fragment shaders et les disques, contre le dessin du Canvas 2D ---------

/** Transformations affines 2D au format de DOMMatrix (x' = a·x + c·y + e, y' = b·x + d·y + f). */
type Affine = [number, number, number, number, number, number];
const composer = (...ms: Affine[]): Affine =>
  ms.reduce(([a, b, c, d, e, f], [A, B, CC, D, E, F]) => [a * A + c * B, b * A + d * B, a * CC + c * D, b * CC + d * D, a * E + c * F + e, b * E + d * F + f]);
const inverser = ([a, b, c, d, e, f]: Affine): Affine => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};
const appliquer = ([a, b, c, d, e, f]: Affine, [x, y]: readonly number[]): [number, number] => [a * (x as number) + c * (y as number) + e, b * (x as number) + d * (y as number) + f];
/** rotateSelf(deg) de DOMMatrix (et rotate() du Canvas 2D) : y vers le bas, sens des aiguilles d'une montre à l'écran. */
const rotation = (deg: number): Affine => {
  const t = (deg * Math.PI) / 180;
  return [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0];
};

/** Couleur du Canvas (octets non prémultipliés) en flottants prémultipliés, la sortie attendue d'un fragment shader. */
const premultipliee = (c: Rvba) => [(c[0] / 255) * (c[3] / 255), (c[1] / 255) * (c[3] / 255), (c[2] / 255) * (c[3] / 255), c[3] / 255];
const TRANSPARENT = [0, 0, 0, 0];
const ecartMax = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((x, k) => Math.abs(x - (b[k] as number))));

describe('fragment shaders et disques (le texte GLSL, traduit et évalué) = le dessin du Canvas 2D', () => {
  it('terres (FRAG_TERRES) : chaque pays de sa couleur, terre ou marque, posée sur la mer comme par le Canvas (prémultipliée, toutes les lignes de la texture)', () => {
    // Terre translucide : une couleur non prémultipliée se verrait. Plus de 256 entités : la seconde ligne de la texture sert.
    const couleurs: Couleurs = { ...couleursEssai, mer: [10, 30, 60, 255], terre: [35, 37, 43, 200] };
    const n = donnees.entites.length;
    expect(n).toBeGreaterThan(256);
    const marquees: [number, string][] = [[0, 'choisi'], [100, 'faux'], [254, 'juste'], [255, 'faux'], [256, 'juste'], [n - 1, 'choisi']];
    const marques = new Map(marquees.map(([i, cl]) => [donnees.entites[i]?.pays.id as string, new Set([cl])]));
    const { p, f } = peintre(couleurs);
    p.dessiner(etat(0, 1, marques));
    // Mélange du WebGL : source prémultipliée (ONE, ONE_MINUS_SRC_ALPHA) ; le Canvas 2D : source-over d'une couleur non prémultipliée.
    expect(f.melange()).toEqual([f.constante('ONE'), f.constante('ONE_MINUS_SRC_ALPHA')]);
    const mer = premultipliee(couleurs.mer);
    const surMerWebGL = (s: number[]) => [0, 1, 2].map((k) => (s[k] as number) + (mer[k] as number) * (1 - (s[3] as number)));
    const surMerCanvas = (c: Rvba) => [0, 1, 2].map((k) => ((c[k] as number) / 255) * (c[3] / 255) + (mer[k] as number) * (1 - c[3] / 255));
    const texture = f.texture() as TextureGlsl;
    const frag = traduireGlsl(FRAG_TERRES);
    const ecarts: string[] = [];
    donnees.entites.forEach((e, i) => {
      // Le Canvas remplit la terre puis, par-dessus, la couleur de chaque classe (opaques : la dernière se voit).
      const cl = [...(marques.get(e.pays.id) ?? [])].pop();
      const canvas = surMerCanvas(cl ? (couleurs.marques[cl] as Rvba) : couleurs.terre);
      const webgl = surMerWebGL(frag.executer({ uCouleurs: texture, vForme: i }).sortie as number[]);
      if (ecartMax(webgl, canvas) > 1e-9) ecarts.push(`${i} ${e.pays.id} : ${webgl.map((x) => x.toFixed(3))} au lieu de ${canvas.map((x) => x.toFixed(3))}`);
    });
    expect(ecarts).toEqual([]);
  });

  it('hachures (FRAG_HACHURES) = le motif du Canvas : traits à 45° montant vers la droite, au pas de 6 px, épais de 1,2 px, à 1 px de l’ancre', () => {
    const frag = traduireGlsl(FRAG_HACHURES);
    // Translucide comme --hachure : la couleur passe prémultipliée.
    const couleurs: Couleurs = { ...couleursEssai, hachure: [236, 241, 254, 71] };
    // dpr 2 et 3 : la tuile du Canvas fait alors juste 6 px CSS (à 2,8125, 17 px physiques, 6,04 px).
    for (const dpr of [2, 3]) {
      const { p, f, canvas } = peintre(couleurs, dpr);
      p.dessiner(etat(0, 3));
      const d = f.dessins.find((x) => x.u.uHauteur !== undefined);
      expect([d?.u.uDpr, d?.u.uHauteur]).toEqual([dpr, canvas.height]);
      const uCouleur = d?.u.uCouleur as number[];
      expect(ecartMax(uCouleur, premultipliee(couleurs.hachure))).toBeLessThan(1e-12);
      // Le motif du Canvas (carte-canvas.ts, creerMotif et dessiner) : une tuile de round(6·dpr) px physiques,
      // un trait vertical de 1,2·dpr px centré à dpr px de son bord gauche, posée par
      // translate(ancre)·rotate(45°)·scale(1/dpr), ancre arrondie au pixel physique.
      const ancre: [number, number] = [Math.round(151.3 * dpr) / dpr, Math.round(300.7 * dpr) / dpr];
      const cote = Math.round(6 * dpr);
      const versTuile = inverser(composer([1, 0, 0, 1, ancre[0], ancre[1]], rotation(45), [1 / dpr, 0, 0, 1 / dpr, 0, 0]));
      const distanceAuTrait = (q: [number, number]) => {
        const du = (((appliquer(versTuile, q)[0] - dpr) % cote) + cote) % cote;
        return Math.min(du, cote - du) / dpr;
      };
      const flou = 0.5 / dpr + 1e-3; // l'antialiasing : un pixel physique à cheval sur le bord du trait
      const ecarts: string[] = [];
      let traits = 0;
      let vides = 0;
      for (let i = Math.round((ancre[0] - 12) * dpr); i < (ancre[0] + 12) * dpr; i++) {
        for (let j = Math.round((ancre[1] - 12) * dpr); j < (ancre[1] + 12) * dpr; j++) {
          const q: [number, number] = [(i + 0.5) / dpr, (j + 0.5) / dpr];
          const dist = distanceAuTrait(q);
          const attendu = dist <= 0.6 - flou ? 1 : dist >= 0.6 + flou ? 0 : null;
          if (attendu === null) continue;
          const s = frag.executer({ uCouleur, uDpr: dpr, uHauteur: canvas.height, vRef: ancre, gl_FragCoord: [i + 0.5, canvas.height - (j + 0.5), 0.5, 1] }).sortie as number[];
          if (ecartMax(s, uCouleur.map((x) => x * attendu)) > 1e-9) ecarts.push(`dpr ${dpr}, (${q.map((x) => x.toFixed(2))}) à ${dist.toFixed(2)} px du trait : ${s[3]?.toFixed(3)}`);
          if (attendu) traits++;
          else vides++;
        }
      }
      expect(ecarts.slice(0, 5)).toEqual([]);
      expect(traits).toBeGreaterThan(200);
      expect(vides).toBeGreaterThan(1000);
    }
  });

  it('hachures ancrées comme celles du Canvas : vRef = ancre() de la zone (une seule partie), le même à chaque sommet', () => {
    let comparees = 0;
    let pire = 0;
    for (const [r, lat, k] of [[0, 20, 3], [150, -10, 8], [-100, 40, 2], [180, 60, 5]] as const) {
      const v = placer(C, [r, lat], L / 2, H / 2, k);
      const { K, centre } = uniformesVue(v, C);
      const im = image(v, C, regionVisible(v, C, MARGE_PX));
      donnees.contestees.forEach((z, iz) => {
        const ps = preparer(z.forme);
        const parts = zones.parties.filter((pa) => pa.forme === iz);
        if (ps.length !== 1 || parts.length !== 1) return;
        const pa = parts[0] as PartieMaillee;
        const sommets = new Set(Array.from(zones.triangles.subarray(pa.t0, pa.t1)));
        const refs = [...sommets].map((s) => shader({ lon: zones.lonlat[2 * s] as number, lat: zones.lonlat[2 * s + 1] as number, ml: zones.milieu[2 * s] as number, mp: zones.milieu[2 * s + 1] as number, r: v.r, mode: 0, K, centre, l: L, h: H }).ref);
        // Un seul vRef pour toute la partie : le motif ne change pas d'un triangle à l'autre.
        for (const x of refs) expect(x).toEqual(refs[0]);
        const a = ancre(im, ps) as [number, number];
        pire = Math.max(pire, ecartMax(refs[0] as number[], a));
        comparees++;
      });
    }
    expect(comparees).toBeGreaterThan(80);
    expect(pire).toBeLessThan(0.05);
  });

  it('ovale (la mer, uMode 2) : son contour suit le bord vrai d’Equal Earth au moins aussi près que celui du Canvas (tracerOvale)', () => {
    // Le bord de l'ovale ne se voit qu'aux petits zooms (au-delà de ~1,7, le bord au pôle sort de l'écran).
    // λ0 = 180 (atteint : normaliserLon rend 180 pour −180) : le tour du milieu (0, 0) y vaut 1, ignoré en uMode 2.
    for (const [r, k, lat] of [[180, 1, 0], [30, 1.3, 60], [-100, 1.6, -75]] as const) {
      const { p, f } = peintre();
      const e = etat(r, k, undefined, lat);
      expect(e.v.r).toBe(r);
      p.dessiner(e);
      const fan = f.dessins.find((d) => d.mode === f.constante('TRIANGLE_FAN'));
      expect(fan?.u.uMode).toBe(2);
      const sommets = f.sommetsDuVao.get(fan?.vao as object) as Float32Array;
      expect(fan?.n).toBe(sommets.length / 2);
      const { K, centre } = uniformesVue(e.v, e.c);
      // Contour du WebGL : les sommets du TRIANGLE_FAN (le premier est le centre) passés par VERTEX_CARTE.
      const webgl: [number, number][] = [];
      for (let i = 2; i < sommets.length; i += 2) {
        const s = shader({ lon: sommets[i] as number, lat: sommets[i + 1] as number, ml: 0, r: e.v.r, mode: 2, K, centre, l: L, h: H });
        webgl.push([s.x, s.y]);
      }
      const canvas: [number, number][] = [];
      const ctx = { moveTo: (x: number, y: number) => canvas.push([x, y]), lineTo: (x: number, y: number) => canvas.push([x, y]), rect: () => undefined };
      tracerOvale(ctx, image(e.v, C, regionVisible(e.v, C, MARGE_PX)));
      // Le bord vrai (d3, à ±180° du centre) ; écart horizontal d'un contour à la même hauteur, sur l'écran.
      const bord = (phi: number, cote: number) => {
        const [x, y] = projeterF64(180, phi, 0, 0);
        return [centre[0] + cote * K * x, centre[1] - K * y] as const;
      };
      const ecart = (pts: [number, number][]) => {
        let pire = 0;
        let mesures = 0;
        for (let i = 1; i < pts.length; i++) {
          const [a, b] = [pts[i - 1], pts[i]] as [[number, number], [number, number]];
          if (Math.abs(a[1] - b[1]) < 1e-9) continue; // le segment du pôle, plat
          for (let t = 0; t <= 1; t += 1 / 8) {
            const q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] as const;
            const cote = Math.sign(q[0] - centre[0]);
            if (q[1] < 0 || q[1] > H || q[0] < 0 || q[0] > L || !cote) continue;
            let [sud, nord] = [-90, 90];
            for (let n = 0; n < 60; n++) {
              const m = (sud + nord) / 2;
              if (bord(m, cote)[1] > q[1]) sud = m;
              else nord = m;
            }
            pire = Math.max(pire, Math.abs(bord((sud + nord) / 2, cote)[0] - q[0]));
            mesures++;
          }
        }
        expect(mesures).toBeGreaterThan(50);
        return pire;
      };
      // Chaque sommet du contour sur le bord vrai, à sa latitude et de son côté (est pour 180°, ouest pour −180°).
      let pireSommet = 0;
      for (let i = 2; i < sommets.length; i += 2) {
        const [x, y] = bord(sommets[i + 1] as number, Math.sign(sommets[i] as number));
        pireSommet = Math.max(pireSommet, ecartMax(webgl[i / 2 - 1] as [number, number], [x, y]));
      }
      expect(pireSommet).toBeLessThan(1e-3);
      const [eWebgl, eCanvas] = [ecart(webgl), ecart(canvas)];
      expect(eCanvas).toBeLessThan(0.1);
      expect(eWebgl).toBeLessThanOrEqual(eCanvas);
    }
  });

  it('pastilles et anneaux (VERTEX_DISQUES, FRAG_DISQUES) = les disques du Canvas : couleur au centre, bord de 1 px au rayon, rien au-delà ; le carré les contient', () => {
    const couleurs: Couleurs = { ...couleursEssai, pastille: [142, 147, 157, 255], bord: [8, 8, 9, 255] };
    const { p, f } = peintre(couleurs);
    const e = etat(10, 4, new Map([['MLT', new Set(['faux'])]]), 45);
    const base = (id: string) => e.proj(donnees.entites.find((x) => x.pays.id === id)?.pays.point as [number, number]) as [number, number];
    const pastilles = ['AND', 'MLT'].map((id) => ({ id, bx: base(id)[0], by: base(id)[1], visible: true }));
    p.dessiner({ ...e, pastilles, anneaux: [{ id: 'CHE', classe: 'juste', rayon_px: 16 }] });
    // Le Canvas (carte-canvas.ts, dessinerPastilles) : disque de rayon_visible_px rempli puis bordé d'un trait
    // de 1 px couleur du fond ; anneau : trait de 2 px. Dans le même ordre que les instances.
    const attendus = [
      ...pastilles.map((pa) => ({ centre: versEcran(e.t, pa.bx, pa.by), rayon: PASTILLE.rayon_visible_px, demiTrait: 0.5, plein: pa.id === 'MLT' ? couleurs.marques.faux : couleurs.pastille })),
      { centre: versEcran(e.t, ...base('CHE')), rayon: 16, demiTrait: 1, plein: null },
    ];
    const anneau = couleurs.marques.juste as Rvba;
    const canvas = (x: (typeof attendus)[number], d: number, flou: number) => {
      const bord = Math.abs(d - x.rayon);
      if (x.plein && d <= x.rayon - x.demiTrait - flou) return premultipliee(x.plein as Rvba);
      if (bord <= x.demiTrait - flou) return premultipliee(x.plein ? couleurs.bord : anneau);
      if (bord >= x.demiTrait + flou && (!x.plein || d > x.rayon)) return TRANSPARENT;
      return null;
    };
    const dessin = f.dessins.find((d) => d.mode === f.constante('TRIANGLE_STRIP'));
    expect(dessin?.n).toBe(attendus.length);
    const { uTaille, uBord, uDpr } = dessin?.u as { uTaille: number[]; uBord: number[]; uDpr: number };
    expect(uTaille).toEqual([L, H]);
    const flou = 0.5 / uDpr + 1e-3;
    const inst = f.instances() as Float32Array;
    const vert = traduireGlsl(VERTEX_DISQUES);
    const frag = traduireGlsl(FRAG_DISQUES);
    const ecarts: string[] = [];
    attendus.forEach((x, k) => {
      const aDisque = [...inst.subarray(8 * k, 8 * k + 4)];
      const aCouleur = [...inst.subarray(8 * k + 4, 8 * k + 8)];
      // Les quatre sommets du carré (TRIANGLE_STRIP : triangles 0-1-2 et 1-2-3) ; vP y est la position en px CSS.
      const sommets = [0, 1, 2, 3].map((id) => vert.executer({ aDisque, aCouleur, uTaille, gl_VertexID: id }));
      const coins = sommets.map((s) => versCss(s.gl_Position as number[], L, H));
      for (const [s, c] of sommets.map((s, i) => [s, coins[i]] as const)) expect(ecartMax(s.vP as number[], c as number[])).toBeLessThan(1e-9);
      const { vD, vC } = sommets[3] as { vD: number[]; vC: number[] };
      const dansTriangle = (q: readonly number[], a: readonly number[], b: readonly number[], c: readonly number[]) => {
        const s = (u: readonly number[], v: readonly number[]) => ((v[0] as number) - (u[0] as number)) * ((q[1] as number) - (u[1] as number)) - ((v[1] as number) - (u[1] as number)) * ((q[0] as number) - (u[0] as number));
        const [s1, s2, s3] = [s(a, b), s(b, c), s(c, a)];
        return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
      };
      const [c0, c1, c2, c3] = coins as [[number, number], [number, number], [number, number], [number, number]];
      const dansLeCarre = (q: readonly number[]) => dansTriangle(q, c0, c1, c2) || dansTriangle(q, c1, c2, c3);
      // Tout ce que le Canvas peint (jusqu'au bord extérieur du trait, plus l'antialiasing) tient dans le carré.
      for (let a = 0; a < 360; a += 5) {
        const q = [x.centre[0] + (x.rayon + x.demiTrait + flou) * Math.cos(a), x.centre[1] + (x.rayon + x.demiTrait + flou) * Math.sin(a)];
        if (!dansLeCarre(q)) ecarts.push(`instance ${k} : (${q.map((v) => v.toFixed(2))}) hors du carré`);
      }
      // Pixel par pixel : la sortie du fragment shader (rien hors du carré) = la couleur du Canvas, hors antialiasing.
      const vus = { plein: 0, bord: 0, vide: 0, horsCarre: 0 };
      const m = x.rayon + 4;
      for (let i = Math.floor((x.centre[0] - m) * uDpr); i < (x.centre[0] + m) * uDpr; i++) {
        for (let j = Math.floor((x.centre[1] - m) * uDpr); j < (x.centre[1] + m) * uDpr; j++) {
          const q = [(i + 0.5) / uDpr, (j + 0.5) / uDpr];
          const d = Math.hypot((q[0] as number) - x.centre[0], (q[1] as number) - x.centre[1]);
          const attendu = canvas(x, d, flou);
          if (!attendu) continue;
          const dedans = dansLeCarre(q);
          const s = dedans ? (frag.executer({ uBord, uDpr, vP: q, vD, vC }).sortie as number[]) : TRANSPARENT;
          if (ecartMax(s, attendu) > 1e-6) ecarts.push(`instance ${k}, à ${d.toFixed(2)} px du centre : ${s.map((v) => v.toFixed(3))} au lieu de ${attendu.map((v) => v.toFixed(3))}`);
          if (!dedans) vus.horsCarre++;
          else if (attendu === TRANSPARENT) vus.vide++;
          else if (d < x.rayon - x.demiTrait) vus.plein++;
          else vus.bord++;
        }
      }
      expect(ecarts.slice(0, 5)).toEqual([]);
      // Chaque cas vu : couleur pleine (pastille), trait, transparent dans le carré, hors du carré.
      expect(Math.min(vus.bord, vus.vide, vus.horsCarre, x.plein ? vus.plein : Infinity)).toBeGreaterThan(10);
    });
  });
});

describe('lireCouleurs (variables de :root)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('chaque couleur de la carte vient de sa variable', () => {
    const vars: Record<string, string> = {
      '--mer': '#010203', '--terre': '#0a141e', '--frontiere-fine': '#c8c8c8', '--hachure': '#050505',
      '--pastille': '#090909', '--bg': '#000000', '--accent': '#0000ff', '--good': '#00ff00', '--danger': '#ff0000',
    };
    const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)).concat(255);
    let style = '';
    const ctx = { clearRect: () => undefined, fillRect: () => undefined, set fillStyle(v: string) { style = v; }, getImageData: () => ({ data: hex(style) }) };
    vi.stubGlobal('document', { documentElement: {}, createElement: () => ({ getContext: () => ctx }) });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (n: string) => ` ${vars[n] ?? ''} ` }));
    const c = lireCouleurs();
    expect(c.mer).toEqual(hex('#010203'));
    expect(c.terre).toEqual(hex('#0a141e'));
    expect(c.frontiere).toEqual(hex('#c8c8c8'));
    expect(c.marques).toEqual({ choisi: hex('#0000ff'), juste: hex('#00ff00'), faux: hex('#ff0000') });
  });
});

// Garde : un polygone de la forme Polygon reste accepté (types).
export type { Polygon };
