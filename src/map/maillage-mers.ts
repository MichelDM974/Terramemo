// Maillage des océans et mers pour le rendu WebGL (lot 3a, étude J2, § 2.3 et
// § 4.3) : comme celui des terres (maillage.ts : densifié à 1°, coutures
// comprises, earcut et refine ; triangulé dans le plan d'Equal Earth, voir
// maillerMers), dans son module et son propre Web
// Worker (maillage-mers.worker.ts), gardé à part sur l'appareil (IndexedDB,
// 'webgl-mers'). Pourquoi à part : la clé du cache des terres comprend
// l'adresse de leur Worker, que Vite hache sur maillage.ts et ce qu'il importe ;
// les mers dans maillage.ts ou maillage.worker.ts feraient recalculer le
// maillage des terres chez chacun. Ce module importe maillage.ts sans le
// modifier.
import earcut, { refine } from 'earcut';
import { geoEqualEarthRaw } from 'd3-geo';
import { densifier, PAS_DENSIFIER_DEG, RECOUVREMENT_COUTURE_DEG, type Maillage, type MaillageEmballe, type PartieMaillee } from './maillage';
import { entitesMers, type MerBrute, type TextesMers } from './mers';
import type { Forme } from './types';

const RAD = Math.PI / 180;
const EPS = 1e-9;

/**
 * Maille les zones marines : une forme par zone, dans l'ordre de
 * CoucheMers.mers (index de forme = couleur de la zone). Le maillage des
 * terres (mailler), mais triangulé dans le plan d'Equal Earth (λ0 = 0) plutôt
 * qu'en longitude et latitude : la couture du Pacifique Sud suit le 180e
 * méridien sur 44° de latitude, ses sommets densifiés y sont alignés en
 * (λ, φ), et earcut tendait un long triangle de bout en bout de la couture ;
 * le méridien, courbe à l'écran, le retournait (29 triangles retournés à 16
 * rotations, jusqu'à 236 px² de mer mal couverte au zoom 1, et des aiguilles
 * dans la mer Rouge : tests/carte-webgl.test.ts). Dans le plan d'Equal Earth,
 * la couture est le bord convexe de l'ovale. Les sommets restent en λ, φ
 * (le shader projette), poussés hors de leur partie sur l'antiméridien comme
 * ceux des terres (RECOUVREMENT_COUTURE_DEG).
 */
export function maillerMers(formes: readonly Forme[], pas = PAS_DENSIFIER_DEG): Maillage {
  const lonlat: number[] = [];
  const milieu: number[] = [];
  const forme: number[] = [];
  const triangles: number[] = [];
  const parties: PartieMaillee[] = [];
  const plages: Maillage['formes'] = [];
  formes.forEach((f, fi) => {
    const debut = triangles.length;
    const g = f.geometry;
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      const plat: number[] = [];
      const trous: number[] = [];
      let exterieur = true;
      poly.forEach((anneau, i) => {
        const a = plat.length / 2;
        densifier(anneau, pas, plat);
        if (plat.length / 2 - a < 3) {
          plat.length = a * 2; // anneau dégénéré : ignoré (le polygone entier si c'est son contour)
          if (i === 0) exterieur = false;
          return;
        }
        if (i > 0) trous.push(a);
      });
      if (!exterieur || !plat.length) continue;
      const plan: number[] = [];
      for (let i = 0; i < plat.length; i += 2) plan.push(...geoEqualEarthRaw((plat[i] as number) * RAD, (plat[i + 1] as number) * RAD));
      const tri = earcut(plan, trous.length ? trous : null, 2);
      refine(tri, plan, 2);
      let o = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
      for (let i = 0; i < plat.length; i += 2) {
        const l = plat[i] as number;
        const p = plat[i + 1] as number;
        if (l < o) o = l;
        if (l > e) e = l;
        if (p < s) s = p;
        if (p > n) n = p;
      }
      const base = lonlat.length / 2;
      for (let i = 0; i < plat.length; i += 2) {
        let l = plat[i] as number;
        if (l >= 180 - EPS) l += RECOUVREMENT_COUTURE_DEG;
        else if (l <= -180 + EPS) l -= RECOUVREMENT_COUTURE_DEG;
        lonlat.push(l, plat[i + 1] as number);
        milieu.push((o + e) / 2, (s + n) / 2);
        forme.push(fi);
      }
      const t0 = triangles.length;
      for (const i of tri) triangles.push(base + i);
      parties.push({ forme: fi, o, e, t0, t1: triangles.length, l0: 0, l1: 0 });
    }
    plages.push({ t0: debut, t1: triangles.length, l0: 0, l1: 0 });
  });
  return {
    lonlat: new Float32Array(lonlat),
    milieu: new Float32Array(milieu),
    forme: new Float32Array(forme),
    triangles: new Uint32Array(triangles),
    traits: new Uint32Array(0),
    parties,
    formes: plages,
  };
}

/** Les formes des fichiers lus, dans l'ordre de la couche (assemblerMers) : ce que le Worker maille. */
export function formesDesTextes(t: TextesMers): Forme[] {
  return entitesMers(JSON.parse(t.topo), JSON.parse(t.mers) as MerBrute[]).map((e) => e.forme);
}

/** forme, o, e, t0, t1, l0, l1 de chaque partie (comme maillage.ts, dont l'emballage ne prend que les quatre maillages des terres). */
const PAR_PARTIE = 7;

/** Un maillage en tableaux typés seulement : transférable sans copie, rangé tel quel dans IndexedDB. */
export function emballerMaillage(m: Maillage): MaillageEmballe {
  const parties = new Float64Array(m.parties.length * PAR_PARTIE);
  m.parties.forEach((p, i) => parties.set([p.forme, p.o, p.e, p.t0, p.t1, p.l0, p.l1], i * PAR_PARTIE));
  const formes = new Uint32Array(m.formes.length * 4);
  m.formes.forEach((f, i) => formes.set([f.t0, f.t1, f.l0, f.l1], i * 4));
  return { lonlat: m.lonlat, milieu: m.milieu, forme: m.forme, triangles: m.triangles, traits: m.traits, parties, formes };
}

export function deballerMaillage(m: MaillageEmballe): Maillage {
  const parties: PartieMaillee[] = [];
  const p = m.parties;
  for (let i = 0; i < p.length; i += PAR_PARTIE) {
    parties.push({ forme: p[i] as number, o: p[i + 1] as number, e: p[i + 2] as number, t0: p[i + 3] as number, t1: p[i + 4] as number, l0: p[i + 5] as number, l1: p[i + 6] as number });
  }
  const formes: Maillage['formes'] = [];
  for (let i = 0; i < m.formes.length; i += 4) formes.push({ t0: m.formes[i] as number, t1: m.formes[i + 1] as number, l0: m.formes[i + 2] as number, l1: m.formes[i + 3] as number });
  return { lonlat: m.lonlat, milieu: m.milieu, forme: m.forme, triangles: m.triangles, traits: m.traits, parties, formes };
}

/** Les tampons d'un maillage emballé, chacun une fois (postMessage). */
export function tamponsMaillage(m: MaillageEmballe): ArrayBuffer[] {
  return [...new Set(Object.values(m).map((t) => (t as ArrayBufferView).buffer as ArrayBuffer))];
}

/** Un maillage emballé bien formé (lu d'IndexedDB : un enregistrement abîmé ou d'une autre version est écarté). */
export function estMaillageEmballe(x: unknown): x is MaillageEmballe {
  if (!x || typeof x !== 'object') return false;
  const types = { lonlat: Float32Array, milieu: Float32Array, forme: Float32Array, triangles: Uint32Array, traits: Uint32Array, parties: Float64Array, formes: Uint32Array };
  return Object.entries(types).every(([k, T]) => (x as Record<string, unknown>)[k] instanceof T);
}
