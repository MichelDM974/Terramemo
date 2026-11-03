import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoContains, geoDistance } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';

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
  note: string;
}

interface EntreeListe {
  id: string;
  a2: string;
  ne: string | string[];
  statut: 'jouable' | 'optionnel';
}

interface Sources {
  sources: { nom: string; url: string; version: string; licence: string; telecharge_le: string; fichiers: { url: string; sha256: string }[] }[];
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
    for (const p of pays) if (p.revendique_par) expect(['conteste', 'territoire'], p.id).toContain(p.statut);
    for (const [id, par] of [
      ['NE_SOL', ['SOM']],
      ['NE_CYN', ['CYP']],
      ['ESH', ['MAR']],
      ['NE_KAS', ['IND', 'PAK']],
      ['NE_BRT', []],
      ['FLK', ['ARG']],
      ['GIB', ['ESP']],
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
  it('liste figée : plus grand polygone < 1 000 km²', () => {
    expect(jeu.filter((p) => p.micro).map((p) => p.id)).toEqual([
      'AND', 'ATG', 'BHR', 'BRB', 'CPV', 'DMA', 'FSM', 'GRD', 'KIR', 'KNA', 'LCA', 'LIE', 'MCO',
      'MDV', 'MHL', 'MLT', 'NRU', 'PLW', 'SGP', 'SMR', 'STP', 'SYC', 'TON', 'TUV', 'VAT', 'VCT',
    ]);
    for (const p of pays) expect(p.micro, p.id).toBe(p.partie_max_km2 < 1000);
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

  it('sources datées, licences et empreintes égales au verrou', () => {
    expect(sources.sources).toHaveLength(2);
    for (const s of sources.sources) {
      expect(s.licence).toBeTruthy();
      expect(s.telecharge_le).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const f of s.fichiers) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const duVerrou = Object.values(verrou).flatMap((v) => Object.values(v.fichiers)).sort();
    const duFichier = sources.sources.flatMap((s) => s.fichiers.map((f) => f.sha256)).sort();
    expect(duFichier).toEqual(duVerrou);
  });
});
