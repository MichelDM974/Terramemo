import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoArea, geoContains } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon as TopoMulti, Polygon as TopoPoly, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { normaliser } from '../src/texte';

// Données de La Réunion (geodata/reunion.mjs) : tests sans réseau ni source, sur les
// fichiers versionnés de public/geo/reunion/ et le verrou.

interface Commune {
  id: string;
  statut: string;
  superficie_km2: number;
  partie_max_km2: number;
  point: [number, number];
  bbox: [number, number, number, number];
  micro: boolean;
  voisins: string[];
}

interface Source {
  nom: string;
  url: string;
  version: string;
  edition: string;
  mise_a_jour: string;
  concedant: string;
  licence: string;
  telecharge_le: string;
  fichiers: { url: string; sha256: string }[];
}

type Props = { id: string };

const DOSSIER = 'public/geo/reunion/';
const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const texte = (f: string) => readFileSync(DOSSIER + f, 'utf8');

const communes = lire<Commune[]>(DOSSIER + 'communes.json');
const noms = lire<Record<string, string>>(DOSSIER + 'noms.fr.json');
const sources = lire<{ sources: Source[]; traitement: { entrees: Record<string, string> } }>(DOSSIER + 'sources.json');
const verrou = lire<Record<string, { telecharge_le: string; fichiers: Record<string, string> }>>('geodata/reunion.lock.json');
const nomsMonde = lire<Record<string, string>>('public/geo/noms.fr.json');
const topo = JSON.parse(texte('communes.topo.json')) as Topology<{ communes: GeometryCollection<Props> }>;
const formes = new Map<string, Feature<Geometry | null, Props>>(
  feature(topo, topo.objects.communes).features.map((f) => [f.properties.id, f]),
);
const parId = new Map(communes.map((c) => [c.id, c]));

const R_KM = 6371.0088;
const km2 = (g: Parameters<typeof geoArea>[0]) => geoArea(g) * R_KM * R_KM;
// Emprise de l'île [ouest, sud, est, nord] (garde-fou de geodata/reunion.mjs).
const ILE = [55.1, -21.5, 56.0, -20.8] as const;

function polys(g: Geometry | null): Position[][][] {
  if (!g) return [];
  if (g.type === 'Polygon') return [(g as Polygon).coordinates];
  if (g.type === 'MultiPolygon') return (g as MultiPolygon).coordinates;
  return [];
}

function forme(id: string): Feature<Geometry | null, Props> {
  const f = formes.get(id);
  if (!f) throw new Error(`${id} sans forme`);
  return f;
}

const voisins = (id: string) => parId.get(id)?.voisins ?? [];

// Table figée (conception § 1) : nom_officiel de l'IGN, apostrophe typographique.
const NOMS: Record<string, string> = {
  '97401': 'Les Avirons',
  '97402': 'Bras-Panon',
  '97403': 'Entre-Deux',
  '97404': 'L’Étang-Salé',
  '97405': 'Petite-Île',
  '97406': 'La Plaine-des-Palmistes',
  '97407': 'Le Port',
  '97408': 'La Possession',
  '97409': 'Saint-André',
  '97410': 'Saint-Benoît',
  '97411': 'Saint-Denis',
  '97412': 'Saint-Joseph',
  '97413': 'Saint-Leu',
  '97414': 'Saint-Louis',
  '97415': 'Saint-Paul',
  '97416': 'Saint-Pierre',
  '97417': 'Saint-Philippe',
  '97418': 'Sainte-Marie',
  '97419': 'Sainte-Rose',
  '97420': 'Sainte-Suzanne',
  '97421': 'Salazie',
  '97422': 'Le Tampon',
  '97423': 'Les Trois-Bassins',
  '97424': 'Cilaos',
};

describe('communes (communes.json, noms.fr.json)', () => {
  it('24 communes, codes INSEE 97401 à 97424, uniques, triés, dans l’ordre de la topologie', () => {
    const ids = communes.map((c) => c.id);
    expect(ids).toEqual(Array.from({ length: 24 }, (_, i) => `974${String(i + 1).padStart(2, '0')}`));
    expect(new Set(ids).size).toBe(24);
    expect(topo.objects.communes.geometries.map((g) => (g.properties as Props | undefined)?.id)).toEqual(ids);
  });

  it('attributs de la forme de pays.json : jouables, sans pastille', () => {
    for (const c of communes) {
      expect(Object.keys(c), c.id).toEqual(['id', 'statut', 'superficie_km2', 'partie_max_km2', 'point', 'bbox', 'micro', 'voisins']);
      expect(c.statut, c.id).toBe('jouable');
      // Le seuil des micro-États (1 000 km²) donnerait une pastille à toutes.
      expect(c.micro, c.id).toBe(false);
    }
  });

  it('noms exacts (table figée), en NFC, apostrophe typographique', () => {
    expect(noms).toEqual(NOMS);
    expect(Object.keys(noms)).toEqual(communes.map((c) => c.id));
    for (const n of Object.values(noms)) {
      expect(n).toBe(n.normalize('NFC'));
      expect(n).not.toContain("'");
    }
  });

  it('noms uniques une fois normalisés, et disjoints des noms du monde', () => {
    const normes = Object.values(noms).map(normaliser);
    expect(new Set(normes).size).toBe(24);
    const monde = new Set(Object.values(nomsMonde).map(normaliser));
    expect(normes.filter((n) => monde.has(n))).toEqual([]);
    // normaliser() rend l'apostrophe droite de l'IGN et la typographique équivalentes.
    expect(normaliser("L'Étang-Salé")).toBe(normaliser(noms['97404'] ?? ''));
  });
});

describe('géométries (communes.topo.json)', () => {
  it('une topologie, objet communes seul, propriété id seule', () => {
    expect(topo.type).toBe('Topology');
    expect(Object.keys(topo.objects)).toEqual(['communes']);
    for (const g of topo.objects.communes.geometries) expect(Object.keys(g.properties ?? {})).toEqual(['id']);
  });

  it('aucune forme vide ; chacune dans le sens de d3 (sinon d3 la lit comme la sphère moins la commune)', () => {
    for (const c of communes) {
      const f = forme(c.id);
      expect(polys(f.geometry).length, c.id).toBeGreaterThan(0);
      for (const p of polys(f.geometry)) expect(p[0]?.length ?? 0, c.id).toBeGreaterThanOrEqual(4);
      expect(geoArea(f), c.id).toBeLessThan(0.001);
    }
  });

  it('le point d’étiquette est dans sa commune, l’emprise et tous les sommets dans l’île', () => {
    for (const c of communes) {
      expect(geoContains(forme(c.id), c.point), c.id).toBe(true);
      const [o, s, e, n] = c.bbox;
      expect(o >= ILE[0] && s >= ILE[1] && e <= ILE[2] && n <= ILE[3] && o < e && s < n, c.id).toBe(true);
      for (const p of polys(forme(c.id).geometry))
        for (const r of p)
          for (const [x = 0, y = 0] of r) expect(x >= ILE[0] && x <= ILE[2] && y >= ILE[1] && y <= ILE[3], c.id).toBe(true);
    }
  });

  it('repères indépendants de la source : chaque bourg dans sa commune (reprojection juste)', () => {
    // Centres-bourgs pris hors des données (cartes publiques, à ~300 m près), à moins de
    // 400 m des chefs-lieux de l'IGN reprojetés : une projection fausse (fuseau, faux
    // nord, axes inversés) les mettrait dans la mer ou dans une autre commune.
    for (const [id, pt] of [
      ['97411', [55.4481, -20.879]], // Saint-Denis
      ['97416', [55.4781, -21.3417]], // Saint-Pierre
      ['97407', [55.2917, -20.9375]], // Le Port
      ['97424', [55.4711, -21.1342]], // Cilaos
      ['97417', [55.7675, -21.3583]], // Saint-Philippe
      ['97421', [55.5397, -21.0272]], // Salazie
      ['97422', [55.5153, -21.2781]], // Le Tampon
      ['97419', [55.7956, -21.1272]], // Sainte-Rose
      ['97406', [55.6278, -21.1356]], // La Plaine-des-Palmistes
      ['97403', [55.4719, -21.2464]], // Entre-Deux
    ] as const) {
      const p = pt as unknown as [number, number];
      expect(geoContains(forme(id), p), `${NOMS[id]} dans ${id}`).toBe(true);
      for (const autre of communes) if (autre.id !== id) expect(geoContains(forme(autre.id), p), `${NOMS[id]} hors de ${autre.id}`).toBe(false);
    }
  });

  it('îlots : Petite-Île (l’îlet, 0,02 km²) et Saint-Paul (0,008 km²) gardés à la simplification', () => {
    // Deux parties dans la source ; keep-shapes ne protège que le plus grand anneau, mais
    // à 40 m ils survivent (en quadrilatère et en triangle). Trop petits pour une cible
    // au doigt, inoffensifs : un toucher dessus compte pour leur commune.
    const multi = communes.filter((c) => polys(forme(c.id).geometry).length > 1).map((c) => c.id);
    expect(multi).toEqual(['97405', '97415']);
    for (const id of multi) {
      const [, ...ilots] = [...polys(forme(id).geometry)].sort((a, b) => km2({ type: 'Polygon', coordinates: b }) - km2({ type: 'Polygon', coordinates: a }));
      for (const p of ilots) expect(km2({ type: 'Polygon', coordinates: p }), id).toBeLessThan(0.1);
    }
  });
});

describe('superficies', () => {
  it('total de l’île et Le Port dans les ordres de grandeur officiels', () => {
    const total = communes.reduce((s, c) => s + c.superficie_km2, 0);
    expect(total).toBeGreaterThan(2450);
    expect(total).toBeLessThan(2560);
    const port = parId.get('97407')?.superficie_km2 ?? 0;
    expect(port).toBeGreaterThan(15);
    expect(port).toBeLessThan(20);
    for (const c of communes) {
      expect(c.partie_max_km2, c.id).toBeGreaterThan(0);
      expect(c.superficie_km2, c.id).toBeGreaterThanOrEqual(c.partie_max_km2);
    }
    // Le Port est la plus petite (la carte s'y règle : ≥ 15 px au zoom 1).
    expect(Math.min(...communes.map((c) => c.superficie_km2))).toBe(port);
  });

  it('formes simplifiées à 1 % des superficies (non simplifiées), commune par commune', () => {
    for (const c of communes) expect(Math.abs(km2(forme(c.id)) / c.superficie_km2 - 1), c.id).toBeLessThan(0.01);
  });

  it('ni trou ni recouvrement : la fusion des 24 communes est l’île, sans anneau intérieur', () => {
    // Aucune géométrie nulle (testé plus haut) : que des polygones et multipolygones.
    const ile = merge(topo, topo.objects.communes.geometries as (TopoPoly | TopoMulti)[]);
    const parts = [...ile.coordinates].sort((a, b) => km2({ type: 'Polygon', coordinates: b }) - km2({ type: 'Polygon', coordinates: a }));
    const [principal, ...ilots] = parts;
    // Un trou entre deux communes serait un anneau intérieur du polygone principal.
    expect(principal?.length).toBe(1);
    expect(ilots.length).toBeLessThanOrEqual(3);
    for (const p of ilots) expect(km2({ type: 'Polygon', coordinates: p })).toBeLessThan(0.1);
    // Un recouvrement compterait deux fois sa surface dans la somme, pas dans la fusion.
    const somme = communes.reduce((s, c) => s + km2(forme(c.id)), 0);
    const fusion = km2(ile);
    expect(Math.abs(somme - fusion) / fusion).toBeLessThan(0.001);
  });
});

describe('voisins', () => {
  it('symétriques, triés, ids connus, aucune commune sans voisin', () => {
    for (const c of communes) {
      expect(c.voisins.length, c.id).toBeGreaterThan(0);
      expect([...c.voisins].sort(), c.id).toEqual(c.voisins);
      expect(new Set(c.voisins).size, c.id).toBe(c.voisins.length);
      for (const v of c.voisins) {
        expect(v, c.id).not.toBe(c.id);
        expect(voisins(v), `${c.id}–${v}`).toContain(c.id);
      }
    }
  });

  it('voisins connus', () => {
    expect(voisins('97407')).toEqual(['97408', '97415']); // Le Port : La Possession, Saint-Paul
    expect(voisins('97411')).toEqual(['97408', '97418', '97421']); // Saint-Denis : La Possession, Sainte-Marie, Salazie
    expect(voisins('97417')).toEqual(['97412', '97419']); // Saint-Philippe : Saint-Joseph, Sainte-Rose
    expect(voisins('97404')).toEqual(['97401', '97414']); // L'Étang-Salé : Les Avirons, Saint-Louis
    // Salazie, le cirque : ses voisins font le tour du Piton des Neiges par le nord.
    expect(voisins('97421')).toEqual(['97402', '97408', '97409', '97410', '97411', '97418', '97420', '97424']);
  });

  it('La Possession et Cilaos : voisines par un seul segment de 88 m (deux sommets communs)', () => {
    // neighbors() voit un arc partagé, donc des voisines ; à l'écran, la frontière fait
    // moins d'un demi-pixel au zoom 1 (cible tactile nulle), mais elle existe dans les
    // données de l'IGN : gardée telle quelle, sans ajout ni retrait à la main.
    expect(voisins('97408')).toContain('97424');
    expect(voisins('97424')).toEqual(['97401', '97403', '97408', '97410', '97413', '97414', '97415', '97421', '97423']);
  });
});

describe('poids', () => {
  const gz = (f: string) => gzipSync(texte(f)).length;
  const fichiers = ['communes.topo.json', 'communes.json', 'noms.fr.json', 'sources.json'];

  it('topologie ≤ 25 000 octets compressés (gzip), les quatre fichiers ≤ 35 000', () => {
    expect(gz('communes.topo.json')).toBeLessThanOrEqual(25_000);
    expect(fichiers.reduce((s, f) => s + gz(f), 0)).toBeLessThanOrEqual(35_000);
  });
});

describe('sources', () => {
  it('une source, IGN, Licence Ouverte, édition et date de mise à jour datées', () => {
    expect(sources.sources).toHaveLength(1);
    const s = sources.sources[0];
    if (!s) throw new Error('aucune source');
    expect(s.nom).toContain('ADMIN EXPRESS');
    expect(s.concedant).toMatch(/^IGN/);
    expect(s.licence).toContain('Licence Ouverte');
    // La Licence Ouverte 2.0 demande la source et la date de dernière mise à jour.
    for (const d of [s.edition, s.mise_a_jour, s.telecharge_le]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.version).toBe(s.edition);
    expect(s.mise_a_jour >= s.edition).toBe(true);
    expect(s.telecharge_le >= s.mise_a_jour).toBe(true);
    for (const f of s.fichiers) {
      expect(f.url).toMatch(/^https:\/\/data\.geopf\.fr\//);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('empreintes égales au verrou (geodata/reunion.lock.json)', () => {
    expect(Object.keys(verrou)).toEqual(['ign-admin-express']);
    const duVerrou = Object.values(verrou).flatMap((v) => Object.values(v.fichiers)).sort();
    const duFichier = sources.sources.flatMap((s) => s.fichiers.map((f) => f.sha256)).sort();
    expect(duFichier).toEqual(duVerrou);
    expect(sources.sources[0]?.telecharge_le).toBe(verrou['ign-admin-express']?.telecharge_le);
  });

  it('sorties à jour : empreintes des scripts égales aux fichiers (sinon : npm run geodata:reunion)', () => {
    const empreinte = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
    expect(Object.keys(sources.traitement.entrees).sort()).toEqual(['geodata/outils.mjs', 'geodata/reunion.mjs']);
    for (const [f, h] of Object.entries(sources.traitement.entrees)) expect(empreinte(f), f).toBe(h);
  });
});

describe('reprojection (geodata/outils.mjs)', () => {
  type VersWgs84 = (p: [number, number], zone: number) => [number, number];
  // Import dynamique sans types : le module est en JavaScript, sans déclaration.
  const outils = import('../geodata/outils.mjs' as string) as Promise<{ utmSudVersWgs84: VersWgs84 }>;

  it('série de Krüger : UTM 40S → WGS84 égale à proj4 (mapshaper) au millimètre', async () => {
    const { utmSudVersWgs84 } = await outils;
    // Sorties de mapshaper 0.6.110 (-proj from=EPSG:2975 wgs84), à 1e-9° près : coins de
    // l'emprise de l'archive et un point du centre de l'île.
    for (const [utm, attendu] of [
      [[314677, 7634125], [55.212410302, -21.385569039]],
      [[379234, 7691258], [55.839017192, -20.874930684]],
      [[340000, 7660000], [55.459033734, -21.154289194]],
      // Méridien central (57° E) à l'équateur : exact par construction.
      [[500000, 10000000], [57, 0]],
    ] as const) {
      const [lon, lat] = utmSudVersWgs84(utm as unknown as [number, number], 40);
      // 1e-8° ≈ 1 mm.
      expect(Math.abs(lon - attendu[0]), String(utm)).toBeLessThan(1e-8);
      expect(Math.abs(lat - attendu[1]), String(utm)).toBeLessThan(1e-8);
    }
  });
});
