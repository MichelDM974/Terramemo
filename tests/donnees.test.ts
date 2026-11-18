import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoContains, geoDistance } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { ILE_LEGERE_KM } from '../src/map/carte-canvas';
import { etendueKm } from '../src/map/dessin';

// Données du J0 (geodata/build.mjs) : tests sans réseau sur les fichiers versionnés.

type Statut = 'jouable' | 'optionnel' | 'territoire' | 'conteste' | 'autre';

interface Pays {
  id: string;
  statut: Statut;
  a2?: string;
  continent: string;
  sous_region: string;
  superficie_km2: number;
  partie_max_km2: number;
  point: [number, number];
  bbox: [number, number, number, number];
  micro: boolean;
  voisins: string[];
  revendique_par?: string[];
  note_ne?: string;
}

interface Contestee {
  id: string;
  type: string;
  rang: number;
  superficie_km2: number;
  point: [number, number];
  dans: string[];
  revendique_par: string[];
  note: string;
}

interface EntreeListe {
  id: string;
  a2: string;
  ne: string | string[];
  statut: 'jouable' | 'optionnel';
}

interface Sources {
  // url pour une source téléchargée par le build (verrou) ; chemin pour un extrait versionné (Wikidata).
  sources: { nom: string; url: string; version: string; licence: string; telecharge_le: string; fichiers: { url?: string; chemin?: string; sha256: string }[] }[];
  traitement: { entrees: Record<string, string> };
}

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;

const liste = lire<{ pays: EntreeListe[] }>('geodata/liste.json').pays;
const pays = lire<Pays[]>('public/geo/pays.json');
const contestees = lire<Contestee[]>('public/geo/contestees.json');
const noms = lire<Record<string, string>>('public/geo/noms.fr.json');
const sources = lire<Sources>('public/geo/sources.json');
const verrou = lire<Record<string, { telecharge_le: string; fichiers: Record<string, string> }>>('geodata/sources.lock.json');
const topoTexte = readFileSync('public/geo/monde.topo.json', 'utf8');
// Point intérieur [lon, lat] et aire (km²) de chaque polygone source des jouables et optionnels.
const temoin = lire<Record<string, [number, number, number][]>>('geodata/temoin-polygones.json');
type Props = { id: string };
const topo = JSON.parse(topoTexte) as Topology<{
  pays: GeometryCollection<Props>;
  contestees: GeometryCollection<Props>;
}>;

const formes = new Map<string, Feature<Geometry | null, Props>>();
for (const f of feature(topo, topo.objects.pays).features) formes.set(f.properties.id, f);
const parId = new Map(pays.map((p) => [p.id, p]));
const jeu = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel');

function polys(g: Geometry | null): Position[][][] {
  if (!g) return [];
  if (g.type === 'Polygon') return [(g as Polygon).coordinates];
  if (g.type === 'MultiPolygon') return (g as MultiPolygon).coordinates;
  return [];
}

/** Distance (km) du point au bord de la forme (segments en plan local, assez juste sous 50 km). */
function distanceBordKm(f: Feature<Geometry | null, Props>, [x, y]: [number, number]): number {
  const k = Math.cos((y * Math.PI) / 180);
  const dlon = (lon: number) => (((lon - x + 540) % 360) - 180) * k;
  let min = Infinity;
  for (const p of polys(f.geometry))
    for (const r of p)
      for (let i = 1; i < r.length; i++) {
        const [a, b] = [r[i - 1] as [number, number], r[i] as [number, number]];
        const ax = dlon(a[0]);
        const ay = a[1] - y;
        const dx = dlon(b[0]) - ax;
        const dy = b[1] - y - ay;
        const l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
        min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
      }
  return ((min * Math.PI) / 180) * 6371.0088;
}

/** Distance (km) du point au sommet le plus proche de la forme. */
function distanceKm(f: Feature<Geometry | null, Props>, pt: [number, number]): number {
  let min = Infinity;
  for (const p of polys(f.geometry)) for (const r of p) for (const c of r) min = Math.min(min, geoDistance(c as [number, number], pt) * 6371.0088);
  return min;
}

function voisins(id: string): string[] {
  const p = parId.get(id);
  if (!p) throw new Error(`${id} absent de pays.json`);
  return p.voisins;
}

describe('liste des pays', () => {
  it('195 jouables (193 ONU + Vatican + Palestine) et 2 optionnels (Kosovo, Taïwan)', () => {
    expect(liste.filter((p) => p.statut === 'jouable')).toHaveLength(195);
    expect(liste.filter((p) => p.statut === 'optionnel').map((p) => p.id).sort()).toEqual(['TWN', 'XKX']);
    const ids = new Set(liste.map((p) => p.id));
    for (const id of ['VAT', 'PSE', 'FRA', 'SSD']) expect(ids.has(id)).toBe(true);
  });

  it('identifiants, a2 et sélecteurs uniques et bien formés', () => {
    expect(new Set(liste.map((p) => p.id)).size).toBe(liste.length);
    expect(new Set(liste.map((p) => p.a2)).size).toBe(liste.length);
    expect(new Set(liste.flatMap((p) => p.ne)).size).toBe(liste.flatMap((p) => p.ne).length);
    for (const p of liste) {
      expect(p.id).toMatch(/^[A-Z]{3}$/);
      expect(p.a2).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('chaque entrée se retrouve dans pays.json avec son statut et son a2', () => {
    for (const e of liste) {
      const p = parId.get(e.id);
      expect(p, e.id).toBeDefined();
      expect(p?.statut).toBe(e.statut);
      expect(p?.a2).toBe(e.a2);
    }
  });
});

describe('entités (pays.json)', () => {
  it('identifiants uniques, bien formés, dans le même ordre que la topologie', () => {
    const ids = pays.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^([A-Z]{3}|NE_[A-Z]{3})$/);
    expect(topo.objects.pays.geometries.map((g) => (g.properties as Props | undefined)?.id)).toEqual(ids);
  });

  it('chaque entité a un statut connu, et les comptes sont ceux de la liste', () => {
    const comptes: Record<string, number> = {};
    for (const p of pays) comptes[p.statut] = (comptes[p.statut] ?? 0) + 1;
    expect(Object.keys(comptes).sort()).toEqual(['autre', 'conteste', 'jouable', 'optionnel', 'territoire']);
    expect(comptes.jouable).toBe(195);
    expect(comptes.optionnel).toBe(2);
    expect(parId.get('ATA')?.statut).toBe('autre');
    for (const id of ['ESH', 'NE_SOL', 'NE_CYN', 'NE_CNM', 'NE_KAS']) expect(parId.get(id)?.statut, id).toBe('conteste');
    for (const id of ['GRL', 'NCL', 'PRI', 'HKG', 'MAC', 'PYF', 'NE_KAB']) expect(parId.get(id)?.statut, id).toBe('territoire');
  });

  it('les entités contestées disent qui les revendique (ids connus) et gardent la note NE', () => {
    for (const p of pays.filter((x) => x.statut === 'conteste')) {
      expect(p.revendique_par, p.id).toBeDefined();
      for (const v of p.revendique_par ?? []) {
        expect(parId.has(v), `${p.id} → ${v}`).toBe(true);
        expect(v).not.toBe(p.id);
      }
    }
    // Taïwan et le Kosovo, pays du paquet optionnel, aussi (réponse de l'utilisateur du 06/11).
    for (const p of pays) if (p.revendique_par) expect(['conteste', 'territoire', 'optionnel'], p.id).toContain(p.statut);
    for (const [id, par] of [
      ['NE_SOL', ['SOM']],
      ['NE_CYN', ['CYP']],
      ['ESH', ['MAR']],
      ['NE_KAS', ['IND', 'PAK']],
      ['NE_BRT', []],
      ['FLK', ['ARG']],
      ['GIB', ['ESP']],
      ['TWN', ['CHN']],
      ['XKX', ['SRB']],
    ] as const) {
      expect(parId.get(id)?.revendique_par, id).toEqual(par);
    }
    expect(parId.get('NE_SOL')?.note_ne).toBe('Self admin.; Claimed by Somalia');
    expect(parId.get('FRA')?.note_ne).toBeUndefined();
  });

  it('les DROM restent dans la France (Guyane : voisins Brésil et Suriname)', () => {
    const fra = formes.get('FRA');
    if (!fra) throw new Error('FRA sans forme');
    for (const [lieu, pt] of [
      ['La Réunion', [55.53, -21.11]],
      ['Mayotte', [45.15, -12.82]],
      ['Guyane', [-53.0, 4.0]],
      ['Martinique', [-61.0, 14.65]],
    ] as const) {
      expect(geoContains(fra, pt as unknown as [number, number]), lieu).toBe(true);
    }
  });

  it('cas négatifs : une ville voisine n’est pas dans le pays', () => {
    const dans = (id: string, pt: [number, number]) => {
      const f = formes.get(id);
      if (!f) throw new Error(`${id} sans forme`);
      return geoContains(f, pt);
    };
    for (const [lieu, pt, hors, dedans] of [
      ['Madrid', [-3.7038, 40.4168], 'FRA', 'ESP'],
      ['Rimini', [12.5683, 44.0678], 'SMR', 'ITA'],
      ['Rome (Colisée)', [12.4922, 41.8902], 'VAT', 'ITA'],
      ['Monaco-Ville', [7.4236, 43.7311], 'FRA', null],
    ] as const) {
      expect(dans(hors, pt as unknown as [number, number]), `${lieu} hors de ${hors}`).toBe(false);
      if (dedans) expect(dans(dedans, pt as unknown as [number, number]), `${lieu} dans ${dedans}`).toBe(true);
    }
    expect(dans('FRA', parId.get('MCO')?.point ?? [0, 0])).toBe(false);
  });

  it('continent et sous-région renseignés, sans « Seven seas »', () => {
    for (const p of pays) {
      expect(p.continent, p.id).toBeTruthy();
      expect(p.sous_region, p.id).toBeTruthy();
      expect(p.continent, p.id).not.toMatch(/Seven seas/);
      expect(p.sous_region, p.id).not.toMatch(/Seven seas/);
    }
    expect(parId.get('MUS')?.continent).toBe('Africa');
    expect(parId.get('MDV')?.continent).toBe('Asia');
  });

  it('superficies cohérentes', () => {
    for (const p of pays) {
      expect(p.partie_max_km2, p.id).toBeGreaterThan(0);
      expect(p.superficie_km2, p.id).toBeGreaterThanOrEqual(p.partie_max_km2);
    }
    // Ordres de grandeur connus (NE à 1:10m, à 3 % près).
    for (const [id, km2] of [
      ['RUS', 17_098_000],
      ['FRA', 640_000],
      ['DEU', 357_600],
      ['MUS', 2_040],
    ] as const) {
      expect(Math.abs((parId.get(id)?.superficie_km2 ?? 0) / km2 - 1), id).toBeLessThan(0.03);
    }
  });
});

describe('géométries (monde.topo.json)', () => {
  it('une seule topologie, objets pays et contestees, propriété id seule', () => {
    expect(topo.type).toBe('Topology');
    expect(Object.keys(topo.objects).sort()).toEqual(['contestees', 'pays']);
    for (const g of [...topo.objects.pays.geometries, ...topo.objects.contestees.geometries]) {
      expect(Object.keys(g.properties ?? {})).toEqual(['id']);
    }
  });

  it('aucune géométrie vide parmi les jouables et optionnels', () => {
    const vides = jeu.filter((p) => {
      const f = formes.get(p.id);
      return !f || polys(f.geometry).every((poly) => (poly[0]?.length ?? 0) < 4);
    });
    expect(vides.map((p) => p.id)).toEqual([]);
  });

  it('aucun polygone source perdu : autant de polygones que dans Natural Earth', () => {
    // Chaque polygone est simplifié comme une forme à part (keep-shapes le garde) : la
    // simplification d'un bloc effaçait 961 îles des jouables, dont Tarawa et 175 îles des Maldives.
    expect(Object.keys(temoin).sort()).toEqual(jeu.map((p) => p.id));
    const ecarts = jeu
      .map((p) => [p.id, polys(formes.get(p.id)?.geometry ?? null).length, temoin[p.id]?.length])
      .filter(([, n, m]) => n !== m);
    expect(ecarts).toEqual([]);
    expect(temoin.MDV).toHaveLength(176);
    expect(temoin.KIR).toHaveLength(35);
  });

  it('polygones sources (toutes aires) absents de la forme simplifiée : liste figée, vide', () => {
    // Absent : point intérieur hors de la forme et à plus de 10 km de son bord. Un atoll
    // réduit à un triangle (Maiana, Kiribati) s'écarte de 9 km de son point d'origine.
    const absents: string[] = [];
    for (const p of jeu) {
      const f = formes.get(p.id);
      if (!f) throw new Error(`${p.id} sans forme`);
      for (const [lon, lat, km2] of temoin[p.id] ?? []) {
        if (geoContains(f, [lon, lat]) || distanceBordKm(f, [lon, lat]) <= 10) continue;
        absents.push(`${p.id} ${km2} km² @${lon},${lat}`);
      }
    }
    expect(absents).toEqual([]);
  });

  it('points d’exception : Kiribati sur Tarawa, pas sur Kiritimati', () => {
    const tarawa: [number, number] = [173.03, 1.33];
    expect(geoDistance(parId.get('KIR')?.point ?? [0, 0], tarawa) * 6371).toBeLessThan(30);
    // Majuro est dans le plus grand polygone des Marshall : pas d'exception.
    expect(geoDistance(parId.get('MHL')?.point ?? [0, 0], [171.38, 7.09]) * 6371).toBeLessThan(50);
  });

  it('le point de chaque jouable est dans sa forme (micro-État : à moins de 5 km)', () => {
    const fautifs: string[] = [];
    for (const p of jeu) {
      const f = formes.get(p.id);
      if (!f) throw new Error(`${p.id} sans forme`);
      if (geoContains(f, p.point)) continue;
      if (p.micro && distanceKm(f, p.point) < 5) continue;
      fautifs.push(p.id);
    }
    expect(fautifs).toEqual([]);
  });

  it('budget de poids : ≤ 520 000 octets compressés (gzip)', () => {
    expect(gzipSync(topoTexte).length).toBeLessThanOrEqual(520_000);
  });

  it('carte allégée (rendu Canvas pendant un geste) : ≤ 60 000 octets compressés, mêmes ids, objets pays et contestees ; vide seulement sans grand polygone', () => {
    const texte = readFileSync('public/geo/monde-leger.topo.json', 'utf8');
    expect(gzipSync(texte).length).toBeLessThanOrEqual(60_000);
    const leger = JSON.parse(texte) as Topology<{ pays: GeometryCollection<Props>; contestees: GeometryCollection<Props> }>;
    expect(Object.keys(leger.objects).sort()).toEqual(['contestees', 'pays']);
    const ids = (o: GeometryCollection<Props>) => o.geometries.map((g) => (g.properties as Props | undefined)?.id);
    expect(ids(leger.objects.pays)).toEqual(ids(topo.objects.pays));
    expect(ids(leger.objects.contestees)).toEqual(ids(topo.objects.contestees));
    // Elle ne garde que les polygones d'au moins 40 km (geodata/build.mjs) : une
    // entité n'y est vide que si tous les siens sont plus petits (le rendu prend
    // alors ses îles dans la complète, sous ILE_LEGERE_KM, carte-canvas.ts).
    const vides: string[] = [];
    for (const f of feature(leger, leger.objects.pays).features) {
      if (polys(f.geometry).length) continue;
      vides.push(f.properties.id);
      for (const poly of polys(formes.get(f.properties.id)?.geometry ?? null)) {
        const lons = (poly[0] ?? []).map((p) => p[0] ?? 0);
        const lats = (poly[0] ?? []).map((p) => p[1] ?? 0);
        expect(etendueKm(Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)), f.properties.id).toBeLessThan(ILE_LEGERE_KM);
      }
    }
    // Les micro-États et les archipels de petites îles, jamais un pays continental.
    expect(vides).toEqual(expect.arrayContaining(['VAT', 'MCO', 'MDV']));
    expect(vides).not.toContain('FRA');
  });

  it('zones contestées : ids uniques, non vides, entités contenantes connues', () => {
    const ids = contestees.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(topo.objects.contestees.geometries.map((g) => (g.properties as Props | undefined)?.id)).toEqual(ids);
    for (const f of feature(topo, topo.objects.contestees).features) {
      expect(polys(f.geometry).length, f.properties.id).toBeGreaterThan(0);
    }
    for (const c of contestees) for (const d of c.dans) expect(parId.has(d), `${c.id} → ${d}`).toBe(true);
    // Repères : Crimée (de fait dans la Russie), Golan, Cachemire indien.
    const crimee = contestees.find((c) => c.id === 'NE_B89');
    expect(crimee?.dans).toEqual(['RUS']);
    expect(contestees.find((c) => c.id === 'NE_B16')?.dans).toEqual(['ISR']);
    expect(contestees.find((c) => c.id === 'NE_B05')?.dans).toEqual(['IND']);
  });

  it('le point de chaque zone est dans sa forme dessinée (Europa, Navassa, Alhucemas, Perejil… repris dans la forme simplifiée)', () => {
    const formesZ = new Map(feature(topo, topo.objects.contestees).features.map((f) => [f.properties.id, f]));
    const dehors = contestees.filter((c) => !geoContains(formesZ.get(c.id) as Feature<Geometry, Props>, c.point)).map((c) => c.id);
    expect(dehors).toEqual([]);
  });

  it('revendications : chaque zone a un tenant et ses revendiquants (ids connus), source écrite pour chacune', () => {
    const table = lire<{ zones: Record<string, { revendique_par: string[]; tenu_par?: string[]; source: string }> }>('geodata/revendications.json').zones;
    expect(Object.keys(table).sort()).toEqual(contestees.map((c) => c.id));
    for (const c of contestees) {
      const t = table[c.id]!;
      expect(c.revendique_par, c.id).toEqual(t.revendique_par);
      expect(c.dans.length, `${c.id} sans tenant`).toBeGreaterThan(0);
      if (t.tenu_par) expect(c.dans, c.id).toEqual(t.tenu_par);
      expect(t.source, c.id).toMatch(/^Natural Earth v5\.1\.2, NOTE_BRK : /);
      for (const r of c.revendique_par) expect(parId.has(r), `${c.id} → ${r}`).toBe(true);
      // NE dit « Claimed by » : un revendiquant, sauf deux cas écrits dans la source.
      if (/claimed by/i.test(c.note) && !['NE_B48', 'NE_B71'].includes(c.id)) expect(c.revendique_par.length, c.id).toBeGreaterThan(0);
    }
    // Repères de la décision « Zones contestées et enclaves ».
    const z = (id: string) => contestees.find((c) => c.id === id);
    expect([z('NE_B89')?.dans, z('NE_B89')?.revendique_par]).toEqual([['RUS'], ['UKR']]); // Crimée
    expect([z('NE_B19')?.dans, z('NE_B19')?.revendique_par]).toEqual([['MAR'], ['ESH']]); // Sahara, ouest du mur
    expect([z('NE_C02')?.dans, z('NE_C02')?.revendique_par]).toEqual([['UKR'], ['UKR']]); // Donetsk (NE v5.1.2)
    expect([z('NE_B62')?.dans, z('NE_B62')?.revendique_par]).toEqual([['ESP'], ['MAR']]); // Perejil
    expect(z('NE_B87')?.dans).toEqual(['ERI']); // Doumeira, absente de la couche des pays
    // Entités entières (pays.json) : Somaliland, Chypre du Nord, Sahara à l'est du mur.
    expect(parId.get('NE_SOL')?.revendique_par).toEqual(['SOM']);
    expect(parId.get('NE_CYN')?.revendique_par).toEqual(['CYP']);
    expect(parId.get('ESH')?.revendique_par).toEqual(['MAR']);
  });
});

describe('voisins', () => {
  it('relation symétrique, ids triés et connus', () => {
    for (const p of pays) {
      expect([...p.voisins].sort()).toEqual(p.voisins);
      for (const v of p.voisins) expect(voisins(v), `${p.id}–${v}`).toContain(p.id);
    }
  });

  it('voisins connus', () => {
    expect(voisins('FRA')).toEqual(expect.arrayContaining(['BRA', 'SUR', 'ESP', 'BEL', 'DEU', 'CHE', 'ITA', 'LUX', 'AND', 'MCO']));
    expect(voisins('DNK')).toEqual(['DEU']);
    expect(voisins('MUS')).toEqual([]);
    expect(voisins('CHN')).toEqual(
      expect.arrayContaining(['AFG', 'BTN', 'IND', 'KAZ', 'KGZ', 'LAO', 'MMR', 'MNG', 'NPL', 'PAK', 'PRK', 'RUS', 'TJK', 'VNM', 'HKG', 'MAC']),
    );
    expect(voisins('BWA')).toContain('ZMB');
    expect(voisins('VAT')).toEqual(['ITA']);
  });
});

describe('emprises (bbox)', () => {
  // [ouest, sud, est, nord] ; ouest > est quand l'emprise passe l'antiméridien.
  const entre = (x: number | undefined, a: number, b: number) => x !== undefined && x >= a && x <= b;

  it('Fidji, Kiribati, Russie passent l’antiméridien', () => {
    const fji = parId.get('FJI')?.bbox;
    const kir = parId.get('KIR')?.bbox;
    const rus = parId.get('RUS')?.bbox;
    expect(entre(fji?.[0], 174, 178) && entre(fji?.[2], -179.5, -178)).toBe(true);
    expect(entre(kir?.[0], 169, 170) && entre(kir?.[2], -152, -150)).toBe(true);
    expect(entre(rus?.[0], 19, 21) && entre(rus?.[2], -170, -168)).toBe(true);
    expect(entre(rus?.[3], 81, 82.5)).toBe(true);
  });

  it('une emprise ordinaire ne passe pas l’antiméridien', () => {
    const fra = parId.get('FRA')?.bbox;
    expect(fra).toEqual([expect.closeTo(-61.8, 1), expect.closeTo(-21.37, 1), expect.closeTo(55.85, 1), expect.closeTo(51.09, 1)]);
    for (const p of jeu) if (!['FJI', 'KIR', 'RUS', 'NZL', 'USA'].includes(p.id)) expect(p.bbox[0], p.id).toBeLessThanOrEqual(p.bbox[2]);
  });
});

describe('micro-États (pastilles)', () => {
  it('liste figée : plus grand polygone < 2 000 km² (décision « Cadrage et disques en séance » : Comores, Maurice, Samoa en plus)', () => {
    expect(jeu.filter((p) => p.micro).map((p) => p.id)).toEqual([
      'AND', 'ATG', 'BHR', 'BRB', 'COM', 'CPV', 'DMA', 'FSM', 'GRD', 'KIR', 'KNA', 'LCA', 'LIE', 'MCO',
      'MDV', 'MHL', 'MLT', 'MUS', 'NRU', 'PLW', 'SGP', 'SMR', 'STP', 'SYC', 'TON', 'TUV', 'VAT', 'VCT', 'WSM',
    ]);
    for (const p of pays) expect(p.micro, p.id).toBe(p.partie_max_km2 < 2000);
    // Juste au-dessus du seuil : le Luxembourg (2 600 km²), entouré de voisins, n'a pas de disque d'office.
    expect(parId.get('LUX')?.micro).toBe(false);
  });
});

describe('noms et sources', () => {
  it('un nom pour chaque entité et chaque zone contestée', () => {
    for (const id of [...pays.map((p) => p.id), ...contestees.map((c) => c.id)]) {
      expect(noms[id], id).toBeTruthy();
      expect(noms[id]?.[0], id).toBe(noms[id]?.[0]?.toLocaleUpperCase('fr'));
    }
    expect(Object.keys(noms)).toHaveLength(pays.length + contestees.length);
    expect(noms.FRA).toBe('France');
    expect(noms.PSE).toBe('Palestine');
    expect(noms.NE_PGA).toBe('Îles Spratleys');
  });

  it('noms uniques entre entités et zones contestées (accents, casse et ponctuation ignorés)', () => {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const parNom = new Map<string, string[]>();
    for (const [id, nom] of Object.entries(noms)) parNom.set(norm(nom), [...(parNom.get(norm(nom)) ?? []), id]);
    expect([...parNom.values()].filter((ids) => ids.length > 1)).toEqual([]);
    expect(noms.NE_B19).toBe('Sahara occidental (administré par le Maroc)');
    expect(noms.NE_B14).toBe('Sources de la Lawa');
  });

  it('la Unicode License v3 accompagne les noms dérivés de CLDR, texte complet et épinglé', () => {
    const texte = readFileSync('public/geo/LICENSE-CLDR.txt');
    expect(texte.toString('utf8')).toMatch(/^UNICODE LICENSE V3\n[\s\S]*Copyright © 2015-2024 Unicode, Inc\.[\s\S]*Permission is hereby granted/);
    expect(createHash('sha256').update(texte).digest('hex')).toBe(verrou.cldr?.fichiers['cldr/LICENSE']);
    expect(sources.sources.find((s) => s.url.includes('cldr-json'))?.licence).toContain('LICENSE-CLDR.txt');
  });

  it('sorties à jour : empreintes du script et de la liste égales aux fichiers (sinon : npm run geodata)', () => {
    const empreinte = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
    expect(Object.keys(sources.traitement.entrees).sort()).toEqual([
      'geodata/build.mjs',
      'geodata/capitales-main.json',
      'geodata/capitales.mjs',
      'geodata/drapeaux-main.json',
      'geodata/drapeaux.mjs',
      'geodata/fiches-autres.mjs',
      'geodata/fiches-main.json',
      'geodata/fiches-pays.mjs',
      'geodata/fiches-relecture.mjs',
      'geodata/fiches-sources.mjs',
      'geodata/fiches-territoires.mjs',
      'geodata/fiches.mjs',
      'geodata/liste.json',
      'geodata/mers.json',
      'geodata/mers.mjs',
      'geodata/notoriete-main.json',
      'geodata/notoriete.mjs',
      'geodata/outils.mjs',
      'geodata/revendications.json',
      'geodata/wikidata/mers-entites.json',
      'geodata/wikidata/notoriete.json',
    ]);
    for (const [f, h] of Object.entries(sources.traitement.entrees)) expect(empreinte(f), f).toBe(h);
  });

  it('sources datées, licences et empreintes égales au verrou', () => {
    // Natural Earth, CLDR, flag-icons, le drapeau de l'Émirat (Commons), et pour les
    // fiches CLDR (langues, monnaies) et tz, téléchargées par le build ; extraits versionnés :
    // Wikidata (capitales, fiches), Banque mondiale (tests/donnees-capitales.test.ts et
    // tests/donnees-extraits-fiches.test.ts comparent leurs empreintes aux fichiers) ; et,
    // sans fichier, les sources des valeurs écrites à la main dans fiches-main.json
    // (Wikipédia, Factbook, ISO 639).
    expect(sources.sources).toHaveLength(12);
    for (const s of sources.sources) {
      expect(s.licence).toBeTruthy();
      expect(s.telecharge_le).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const f of s.fichiers) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const telechargees = sources.sources.filter((s) => s.fichiers.length && s.fichiers.every((f) => f.url));
    expect(telechargees).toHaveLength(6);
    const duVerrou = Object.values(verrou).flatMap((v) => Object.values(v.fichiers)).sort();
    const duFichier = telechargees.flatMap((s) => s.fichiers.map((f) => f.sha256)).sort();
    expect(duFichier).toEqual(duVerrou);
  });
});
