import { readFileSync } from 'node:fs';
import type { Polygon, Position } from 'geojson';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { densifier, estCouture, mailler, maillerTraits, triangulerPolygone, PAS_DENSIFIER_DEG, projeterF32, projeterF64, tourDe, toursEnPlus, type Maillage } from '../src/map/maillage';
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

// Garde : un polygone de la forme Polygon reste accepté (types).
export type { Polygon };
