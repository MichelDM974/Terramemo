// Les données des silhouettes du J4 (lot 1 ; D618, D620, D621) : la liste (166 pays, les 29 sans silhouette),
// public/geo/silhouettes.json refait à l'identique par geodata/silhouettes.mjs sur les données du dépôt (parties
// lointaines retirées, formes proches), et le dessin de chaque silhouette par le morceau de l'appli
// (src/vues/silhouettes.ts) : non vide, son cadre rempli, ses zones contestées hachurées.
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { assembler } from '../src/map/donnees';
import type { Forme, Pays } from '../src/map/types';
import { aSilhouette, SANS_SILHOUETTE } from '../src/srs/fiches';
import { COTE, dessiner, installer, lireSilhouettes, prochesDe } from '../src/vues/silhouettes';
import { outilsSilhouettes } from '../src/vues/sujets';

/** Ce que le test emploie de geodata/silhouettes.mjs (sans types : un .mjs de Node). */
interface Geodata {
  COTE: number;
  ECART_KM: number;
  SEUIL: number;
  lireDonnees(): unknown;
  construire(d: unknown): { ids: string[]; exclus: string[] };
  texteJson(c: unknown): string;
  partiesRetirees(f: Forme): number[];
  polygonesDe(f: Forme): [number, number][][][];
}
const { COTE: COTE_PROCHES, construire, ECART_KM, lireDonnees, partiesRetirees, polygonesDe, SEUIL, texteJson } = (await import('../geodata/silhouettes.mjs' as string)) as Geodata;

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const PAYS = lire('pays.json') as Pays[];
const JOUABLES = PAYS.filter((p) => p.statut === 'jouable');
const SIL = JOUABLES.filter((p) => aSilhouette(p.id));
const TEXTE = readFileSync('public/geo/silhouettes.json', 'utf8');
const DONNEES = lireSilhouettes(JSON.parse(TEXTE));
const monde = assembler(lire('monde.topo.json') as Topology<never>, PAYS, lire('contestees.json'), lire('noms.fr.json'));
const parId = new Map(monde.entites.map((e) => [e.pays.id, e]));
const outils = outilsSilhouettes();

/** Les nombres d'un tracé SVG, en points [x, y]. */
function points(d: string): [number, number][] {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const r: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) r.push([n[i]!, n[i + 1]!]);
  return r;
}

describe('la liste des silhouettes (D618 a)', () => {
  it('166 pays : les 195 jouables sans les 29 dont le plus grand morceau fait moins de 2 000 km² (micro: true), écrits dans SANS_SILHOUETTE', () => {
    expect(JOUABLES).toHaveLength(195);
    expect([...SANS_SILHOUETTE].sort()).toEqual(JOUABLES.filter((p) => p.micro).map((p) => p.id).sort());
    expect(SANS_SILHOUETTE.size).toBe(29);
    expect(SIL).toHaveLength(166);
    for (const p of SIL) expect(p.partie_max_km2, p.id).toBeGreaterThanOrEqual(2000);
    // Le Cap-Vert, Samoa et Maurice exclus par leur plus grand morceau ; le Luxembourg, d'un seul tenant, gardé (§ 6.1).
    for (const id of ['CPV', 'WSM', 'MUS']) expect(aSilhouette(id), id).toBe(false);
    for (const id of ['LUX', 'TTO', 'CYP', 'BRN', 'PSE']) expect(aSilhouette(id), id).toBe(true);
  });

  it('par continent : Afrique 49, Asie 45, Europe 38, Amérique du Nord 16, Amérique du Sud 12, Océanie 6 (les tailles des épreuves et des règles)', () => {
    const n: Record<string, number> = {};
    for (const p of SIL) n[p.continent] = (n[p.continent] ?? 0) + 1;
    expect(n).toEqual({ Africa: 49, Asia: 45, Europe: 38, 'North America': 16, 'South America': 12, Oceania: 6 });
    const regles = readFileSync('firestore.rules', 'utf8');
    const carte = regles.slice(regles.indexOf("cle == 'silhouettes'"), regles.indexOf('}', regles.indexOf("cle == 'silhouettes'")));
    expect(Object.fromEntries([...carte.matchAll(/'([^']+)': (\d+)/g)].map((x) => [x[1], Number(x[2])]))).toEqual({ ...n, tous: 166 });
  });
});

describe('silhouettes.json (geodata/silhouettes.mjs)', () => {
  const c = construire(lireDonnees());

  it('refait à l’identique sur les données du dépôt (un tracé refait sans lui le fait tomber)', () => {
    expect(c.ids).toEqual(SIL.map((p) => p.id).sort());
    expect(c.exclus).toEqual([...SANS_SILHOUETTE].sort());
    expect(texteJson(c)).toBe(TEXTE);
  });

  it('les parties retirées : jamais le plus grand morceau, des indices valides ; la Guyane et La Réunion hors de la France, Hawaï hors des États-Unis, l’Alaska gardé', () => {
    for (const [id, r] of Object.entries(DONNEES.retirees)) {
      expect(aSilhouette(id), id).toBe(true);
      const polys = polygonesDe(parId.get(id)!.forme);
      expect(r.every((i) => i >= 0 && i < polys.length), id).toBe(true);
      expect(r).toEqual(partiesRetirees(parId.get(id)!.forme));
    }
    expect(ECART_KM).toBe(500);
    const loin = (id: string) => (DONNEES.retirees[id] ?? []).map((i) => polygonesDe(parId.get(id)!.forme)[i]![0]![0]!);
    // La Guyane (vers -53°) et La Réunion (vers 55°) retirées de la France ; la Corse gardée.
    expect(loin('FRA').some(([lon]) => lon < -50 && lon > -55)).toBe(true);
    expect(loin('FRA').some(([lon]) => lon > 55 && lon < 56)).toBe(true);
    expect(loin('FRA').some(([lon, lat]) => lon > 8 && lon < 10 && lat > 41 && lat < 43)).toBe(false);
    // Hawaï (vers -155°, 20°) retiré des États-Unis ; l'Alaska (au nord de 55°) jamais.
    expect(loin('USA').some(([lon, lat]) => lon < -154 && lon > -161 && lat > 18 && lat < 23)).toBe(true);
    expect(loin('USA').some(([, lat]) => lat > 58)).toBe(false);
  });

  it('les formes proches : A < B, chaque paire une fois, deux pays qui ont une silhouette, au seuil au moins, de la plus proche à la moins proche', () => {
    expect(DONNEES.seuil).toBe(SEUIL);
    expect(COTE_PROCHES).toBe(64);
    const vues = new Set<string>();
    let avant = Infinity;
    for (const [a, b, s] of DONNEES.paires) {
      expect(a < b, `${a} ${b}`).toBe(true);
      expect(vues.has(`${a} ${b}`)).toBe(false);
      vues.add(`${a} ${b}`);
      expect(aSilhouette(a) && aSilhouette(b) && parId.has(a) && parId.has(b), `${a} ${b}`).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SEUIL);
      expect(s).toBeLessThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(avant);
      avant = s;
    }
    expect(DONNEES.paires.length).toBeGreaterThan(50);
    // Rangées par pays, symétriques.
    const p = prochesDe(DONNEES);
    for (const [a, b, s] of DONNEES.paires) {
      expect(p.score(a, b)).toBe(s);
      expect(p.score(b, a)).toBe(s);
      expect(p.de(a)).toContain(b);
      expect(p.de(b)).toContain(a);
    }
    expect(p.de('XXX')).toEqual([]);
  });

  it('lu, refusé sur une version inconnue ou une forme fausse', () => {
    expect(() => lireSilhouettes({ ...DONNEES, v: 2 })).toThrow(/version/);
    expect(() => lireSilhouettes({ v: 1, seuil: 0.7, retirees: {} })).toThrow(/version/);
    expect(() => lireSilhouettes(null)).toThrow(/version/);
  });
});

describe('le dessin de chaque silhouette (src/vues/silhouettes.ts, D620 a)', () => {
  it('chacune des 166 : un tracé non vide, dans son cadre, qu’elle remplit (à sa propre échelle), nord en haut', () => {
    for (const p of SIL) {
      const e = parId.get(p.id)!;
      const d = dessiner(outils, e.forme, DONNEES.retirees[p.id] ?? []);
      expect(d, p.id).not.toBeNull();
      expect(d!.cadre).toBe(`0 0 ${COTE} ${COTE}`);
      const pts = points(d!.trace);
      expect(pts.length, p.id).toBeGreaterThan(6);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      for (const v of [...xs, ...ys]) expect(v >= -0.1 && v <= COTE + 0.1, `${p.id} ${v}`).toBe(true);
      const l = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      // Le cadre moins ses marges (2 unités de chaque côté), à la simplification près : un îlot au bord, retiré à cette
      // taille, le laisse un peu en deçà (l'Italie sans Lampedusa, le Venezuela sans ses îles du nord : 85 au moins).
      expect(Math.max(l, h), p.id).toBeGreaterThan(84);
    }
    // Nord en haut, sans rotation : le Chili, tout en longueur du nord au sud, bien plus haut que large.
    const chl = points(dessiner(outils, parId.get('CHL')!.forme, DONNEES.retirees.CHL ?? [])!.trace);
    const l = Math.max(...chl.map((q) => q[0])) - Math.min(...chl.map((q) => q[0]));
    const h = Math.max(...chl.map((q) => q[1])) - Math.min(...chl.map((q) => q[1]));
    expect(h).toBeGreaterThan(4 * l);
  });

  it('les zones contestées que le pays tient, hachurées (comme sur la carte) : la Crimée sur la Russie, le Sahara occidental tenu sur le Maroc ; aucune ailleurs', () => {
    const m = installer(JSON.parse(TEXTE), outils);
    const tenues = (km2: number) => new Set(monde.contestees.filter((z) => (z.info?.superficie_km2 ?? 0) >= km2).flatMap((z) => z.info?.dans ?? []));
    for (const p of SIL) {
      const d = m.dessin(parId.get(p.id)!, monde.contestees);
      // Une zone d'au moins 1 000 km² se voit ; un îlot (les Senkaku, 5 km²) disparaît à cette taille, comme sur la carte.
      if (tenues(1000).has(p.id)) expect(d!.hachures, p.id).not.toBe('');
      if (!tenues(0).has(p.id)) expect(d!.hachures, p.id).toBe('');
    }
    for (const id of ['RUS', 'MAR', 'UKR', 'IND', 'CHN']) expect(tenues(1000).has(id), id).toBe(true);
    // La Crimée (NE_B89, tenue par la Russie, revendiquée par l'Ukraine) : dans la silhouette de fait de la Russie (S606).
    expect(monde.contestees.find((z) => z.info?.id === 'NE_B89')?.info?.dans).toEqual(['RUS']);
    // Gardés : le même objet au second appel, sans recalcul.
    expect(m.dessin(parId.get('FRA')!, monde.contestees)).toBe(m.dessin(parId.get('FRA')!, monde.contestees));
  });
});
