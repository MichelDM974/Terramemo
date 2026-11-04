import { readFileSync } from 'node:fs';
import type { Polygon, Position } from 'geojson';
import type { Topology } from 'topojson-specification';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EtatImage } from '../src/map/carte-canvas';
import { lireCouleurs, PeintreWebGL, uniformesVue, VERTEX_CARTE, type Couleurs } from '../src/map/carte-webgl';
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
} from '../src/map/maillage';
import { cadre, placer, projectionDe, transfoDe } from '../src/map/vue';

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

// --- Le vertex shader lui-même, et le dessin ------------------------------------

/**
 * VERTEX_CARTE traduit en JavaScript (le sous-ensemble de GLSL qu'il emploie :
 * flottants, vec2, vec4, asin, sin, cos, floor, int, ternaires), évalué en
 * Float64. Le test confronte ainsi le vrai texte du shader à projeterF32 et à
 * la projection de d3 : un shader ou un miroir qui dérive casse le test.
 */
function shaderEnJs(src: string) {
  const entrees: string[] = [];
  let js = src
    .replace(/^#version.*$/m, '')
    .replace(/^precision .*;$/gm, '')
    .replace(/^layout\(location = \d+\) in \w+ (\w+);$/gm, (_, n: string) => (entrees.push(n), ''))
    .replace(/^uniform \w+ (\w+);$/gm, (_, n: string) => (entrees.push(n), ''))
    .replace(/^(?:flat )?out \w+ (\w+);$/gm, 'let $1;')
    .replace(/^const (?:float|int) /gm, 'const ')
    .replace(/^(?:vec2|vec4|float|int|void) (\w+)\(([^)]*)\) \{/gm, (_, nom: string, ps: string) => `function ${nom}(${ps.split(',').map((x) => x.trim().split(' ').pop()).join(', ')}) {`)
    .replace(/\b(?:float|int|vec2|vec4) (\w+) =/g, 'let $1 =');
  js = js.replace(/\bint\(/g, 'Math.trunc(');
  expect(js).not.toMatch(/\b(float|vec2|vec4|uniform|layout|in|out|flat)\s+\w+\s*[;=]/);
  const corps = `const vec2 = (x, y) => ({ x, y }); const vec4 = (x, y, z, w) => ({ x, y, z, w });
    const { floor, asin, sin, cos } = Math; let gl_Position;\n${js}\nmain();\nreturn { gl_Position, vRef, vForme };`;
  const f = new Function(...entrees, corps) as (...a: unknown[]) => { gl_Position: { x: number; y: number }; vRef: { x: number; y: number }; vForme: number };
  expect(entrees).toEqual(['aLonLat', 'aMilieu', 'aForme', 'uR', 'uMode', 'uTour', 'uK', 'uCentre', 'uTaille']);
  return (o: { lon: number; lat: number; ml: number; mp?: number; forme?: number; r: number; mode: number; tour?: number; K: number; centre: [number, number]; l: number; h: number }) => {
    const res = f({ x: o.lon, y: o.lat }, { x: o.ml, y: o.mp ?? 0 }, o.forme ?? 0, o.r, o.mode, o.tour ?? 0, o.K, { x: o.centre[0], y: o.centre[1] }, { x: o.l, y: o.h });
    // Coordonnées de découpe → px CSS (l'inverse de gl_Position du shader).
    return { x: ((res.gl_Position.x + 1) / 2) * o.l, y: ((1 - res.gl_Position.y) / 2) * o.h, forme: res.vForme };
  };
}
const shader = shaderEnJs(VERTEX_CARTE);

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
  const dessins: { prog: object | null; vao: object | null; mode: number; n: number; decalage: number; u: Record<string, unknown> }[] = [];
  let prog: object | null = null;
  let vao: object | null = null;
  let elements = false;
  let texels: Uint8Array | null = null;
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
    },
    uniform1f: uniforme,
    uniform1i: uniforme,
    uniform2f: uniforme,
    uniform4fv: (loc: { nom: string; p: object } | null, v: number[]) => uniforme(loc, [...v]),
    texImage2D: (...a: unknown[]) => (texels = a[8] as Uint8Array),
    drawElements: (mode: number, n: number, _t: number, decalage: number) => dessins.push({ prog, vao, mode, n, decalage, u: { ...(prog && programmes.get(prog)) } }),
    drawArrays: (mode: number, _a: number, n: number) => dessins.push({ prog, vao, mode, n, decalage: 0, u: { ...(prog && programmes.get(prog)) } }),
    drawArraysInstanced: (mode: number, _a: number, _n: number, n: number) => dessins.push({ prog, vao, mode, n, decalage: 0, u: {} }),
  };
  function constante(nom: string): number {
    let c = constantes.get(nom);
    if (c === undefined) constantes.set(nom, (c = 0x1000 + constantes.size));
    return c;
  }
  const gl = new Proxy(cible, {
    get: (t, nom: string) => (nom in t ? t[nom] : /^[A-Z0-9_]+$/.test(nom) ? constante(nom) : () => undefined),
  });
  return { gl, dessins, indicesDuVao, texels: () => texels, constante };
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

describe('PeintreWebGL.dessiner (faux WebGL2)', () => {
  const arcs = donnees.traits();
  const tout: MaillagesCarte = { terres, zones, interieurs: maillerTraits(arcs.interieurs), cotes: maillerTraits(arcs.cotes) };
  const peintre = (couleurs?: Couleurs) => {
    const f = fauxWebGL();
    const canvas = { width: 1080, height: 2033, getContext: () => f.gl, addEventListener: () => undefined, removeEventListener: () => undefined };
    const p = new PeintreWebGL(canvas as unknown as HTMLCanvasElement, { donnees, redessiner: () => undefined, couleurs: couleurs ?? couleursEssai });
    p.charger(tout);
    p.dimensionner(L, H, 2.8125);
    return { p, f };
  };
  const etat = (r: number, k: number, marques = new Map<string, Set<string>>()): EtatImage => {
    const v = placer(C, [r, 0], L / 2, H / 2, k);
    return { v, c: C, t: transfoDe(v, C), proj: projectionDe(v.r, C), enMouvement: false, pastilles: [], marques, anneaux: [] };
  };
  const vaoDe = (f: ReturnType<typeof fauxWebGL>, n: number) => [...f.indicesDuVao].filter(([, k]) => k === n).map(([v]) => v);

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
