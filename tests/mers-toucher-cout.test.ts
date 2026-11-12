// Le coût de noter une mer, borné (lot 3a, partie C) : mêmes réponses que la
// méthode exacte sonde par sonde, pour un travail borné. Mesure de la session
// (12/11) : 384 sondes fines passaient chacune par geoContains sur des zones
// immenses (l'Atlantique, l'Arctique), jusqu'à 218 ms par toucher sur le PC
// (≈ 1 s sur l'A37). Ici l'équivalence avec les références (geoContains, la
// méthode d'avant gardée en copie), et le travail compté sur les pires cas.
import { readFileSync } from 'node:fs';
import { geoContains } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { contient, travail } from '../src/map/geo';
import { assemblerMers } from '../src/map/mers';
import type { Entite, Forme, Lieu } from '../src/map/types';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });

let graine = 2026;
const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;

/** Les polygones d'une forme. */
const polygones = (f: Forme) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);

/** Le travail de geoContains dans les références : sommets parcourus. */
const ref = { sommets: 0 };

/**
 * contient d'avant (copie exacte) : le filtre d'emprise de l'entité, puis de
 * chaque polygone, puis geoContains sur tout le polygone.
 */
function contientRef(forme: Forme, bbox: readonly [number, number, number, number], ll: [number, number]): boolean {
  const [lon, lat] = ll;
  const [o, s, e, n] = bbox;
  const mb = 0.05;
  if (lat < s - mb || lat > n + mb) return false;
  if (o <= e ? lon < o - mb || lon > e + mb : !(lon >= o - mb || lon <= e + mb)) return false;
  const m = 1e-6;
  for (const coordinates of polygones(forme)) {
    let po = Infinity, ps = Infinity, pe = -Infinity, pn = -Infinity;
    for (const p of coordinates[0] ?? []) {
      po = Math.min(po, p[0]!);
      pe = Math.max(pe, p[0]!);
      ps = Math.min(ps, p[1]!);
      pn = Math.max(pn, p[1]!);
    }
    if (pe - po > 359) {
      if (ps < -60) ps = -90;
      if (pn > 60) pn = 90;
    }
    if (lon < po - m || lon > pe + m || lat < ps - m || lat > pn + m) continue;
    for (const a of coordinates) ref.sommets += a.length;
    if (geoContains({ type: 'Polygon', coordinates }, ll)) return true;
  }
  return false;
}

describe('contient : la réponse de geoContains au bit près, sans parcourir tout le polygone', () => {
  const toutes: readonly Entite<Lieu>[] = [...couche.mers, ...donnees.entites];

  it('sur toutes les formes (mers et pays) : points au hasard dans l’emprise, sommets, points à 1e-10° à 1e-3° d’un sommet, sur son méridien', () => {
    const ecarts: string[] = [];
    let n = 0;
    let dedans = 0;
    for (const e of toutes) {
      const sommets = polygones(e.forme).flat(2);
      const [o, s, es, no] = e.pays.bbox;
      const largeur = o <= es ? es - o : es + 360 - o;
      const essais = Math.min(300, 30 + sommets.length / 4);
      for (let i = 0; i < essais; i++) {
        const v = sommets[Math.floor(alea() * sommets.length)]!;
        const r = alea();
        let ll: [number, number];
        if (r < 0.3) {
          const lon = o - 0.1 + alea() * (largeur + 0.2);
          ll = [lon > 180 ? lon - 360 : lon, s - 0.1 + alea() * (no - s + 0.2)];
        } else if (r < 0.45) ll = [v[0]!, v[1]!];
        else if (r < 0.65) ll = [v[0]!, v[1]! + (alea() - 0.5) * 2e-3];
        else {
          const ec = 10 ** (-3 - alea() * 7);
          ll = [v[0]! + (alea() - 0.5) * ec, v[1]! + (alea() - 0.5) * ec];
        }
        if (Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) continue;
        n++;
        const a = contient(e.forme, e.pays.bbox, ll);
        if (a) dedans++;
        if (a !== contientRef(e.forme, e.pays.bbox, ll)) ecarts.push(`${e.pays.id} [${ll}]`);
      }
    }
    expect(ecarts).toEqual([]);
    expect(n).toBeGreaterThan(30_000);
    expect(dedans).toBeGreaterThan(10_000);
  });

  it('les pôles, l’antiméridien, les zones qui font le tour du globe (Arctique, Austral, Antarctique)', () => {
    const ecarts: string[] = [];
    for (const id of ['arctique', 'austral', 'pacif', 'bering', 'ATA', 'RUS', 'FJI', 'USA']) {
      const e = toutes.find((x) => x.pays.id === id)!;
      for (const lon of [-180, -179.999999, -90, 0, 0.5, 90, 179.999999, 180]) {
        for (const lat of [-90, -89.9999, -85, -78, -61, -60.5, 0, 52, 58, 66, 80, 89.9999, 90]) {
          if (contient(e.forme, e.pays.bbox, [lon, lat]) !== contientRef(e.forme, e.pays.bbox, [lon, lat])) ecarts.push(`${id} [${lon}, ${lat}]`);
        }
      }
    }
    expect(ecarts).toEqual([]);
  });

  it('le travail : dans l’Atlantique, quelques dizaines d’arêtes examinées au lieu de ses 1 428 sommets', () => {
    const atlant = couche.mers.find((m) => m.pays.id === 'atlant')!;
    contient(atlant.forme, atlant.pays.bbox, [-30, 30]); // l'index, au premier point
    const avant = travail.aretes;
    let n = 0;
    for (let i = 0; i < 1000; i++) {
      const ll: [number, number] = [-70 + alea() * 80, -50 + alea() * 110];
      n++;
      contient(atlant.forme, atlant.pays.bbox, ll);
    }
    expect((travail.aretes - avant) / n).toBeLessThan(60);
  });
});
