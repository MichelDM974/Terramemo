import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoArea, geoContains } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature, merge, neighbors } from 'topojson-client';
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
      // Le seuil des micro-États (2 000 km²) donnerait une pastille à toutes.
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

  it('chefs-lieux de l’IGN reprojetés : chacun dans sa commune et dans aucune autre, les 24', () => {
    // Contrôle de la reprojection et de la correspondance code ↔ géométrie (pas
    // indépendant de la source : ce sont les mairies de la table chef_lieu_de_commune,
    // reprojetées à part par la formule de Snyder). Deux communes dont on échangerait
    // les géométries (Saint-André / Sainte-Suzanne, Saint-Leu / Les Trois-Bassins),
    // hors des repères ci-dessus, sont prises ici. Le plus proche du bord en est à
    // ~90 m (Saint-Leu), plus que l'écart de la simplification (40 m).
    const chefs: [string, [number, number]][] = [
      ['97401', [55.3334, -21.2419]],
      ['97402', [55.6762, -20.9952]],
      ['97403', [55.4703, -21.2488]],
      ['97404', [55.3669, -21.266]],
      ['97405', [55.566, -21.3558]],
      ['97406', [55.6258, -21.135]],
      ['97407', [55.2903, -20.9353]],
      ['97408', [55.3359, -20.9265]],
      ['97409', [55.6505, -20.9604]],
      ['97410', [55.7126, -21.034]],
      ['97411', [55.4478, -20.8794]],
      ['97412', [55.6193, -21.3786]],
      ['97413', [55.2869, -21.1662]],
      ['97414', [55.4092, -21.2866]],
      ['97415', [55.2696, -21.0097]],
      ['97416', [55.4778, -21.3418]],
      ['97417', [55.7677, -21.3594]],
      ['97418', [55.5493, -20.8969]],
      ['97419', [55.7933, -21.1276]],
      ['97420', [55.6075, -20.9056]],
      ['97421', [55.5391, -21.0276]],
      ['97422', [55.5153, -21.2782]],
      ['97423', [55.2949, -21.1058]],
      ['97424', [55.471, -21.1353]],
    ];
    expect(chefs.map(([id]) => id)).toEqual(communes.map((c) => c.id));
    for (const [id, p] of chefs) {
      expect(geoContains(forme(id), p), `${NOMS[id]} dans ${id}`).toBe(true);
      for (const autre of communes) if (autre.id !== id) expect(geoContains(forme(autre.id), p), `${NOMS[id]} hors de ${autre.id}`).toBe(false);
    }
  });

  it('points d’étiquette figés (pôle d’inaccessibilité du plus grand polygone source, à 1e-4° près)', () => {
    // Le point centre montrer(), sert de cible proche (pick.ts) et départage les leurres
    // de repli du QCM : un point décalé de 500 m resterait dans sa commune sans ce relevé.
    const attendus: [string, [number, number]][] = [
      ['97401', [55.34168, -21.23896]],
      ['97402', [55.58837, -21.03576]],
      ['97403', [55.48626, -21.21513]],
      ['97404', [55.37294, -21.25504]],
      ['97405', [55.56514, -21.34913]],
      ['97406', [55.64788, -21.14053]],
      ['97407', [55.30279, -20.94346]],
      ['97408', [55.36175, -20.94651]],
      ['97409', [55.6631, -20.95775]],
      ['97410', [55.68652, -21.0728]],
      ['97411', [55.4493, -20.92846]],
      ['97412', [55.64233, -21.33456]],
      ['97413', [55.33058, -21.15895]],
      ['97414', [55.42466, -21.22667]],
      ['97415', [55.32692, -21.03428]],
      ['97416', [55.47812, -21.30954]],
      ['97417', [55.74742, -21.30132]],
      ['97418', [55.53176, -20.9512]],
      ['97419', [55.76596, -21.2015]],
      ['97420', [55.60444, -20.93467]],
      ['97421', [55.50007, -21.04569]],
      ['97422', [55.55289, -21.24907]],
      ['97423', [55.28035, -21.11767]],
      ['97424', [55.45762, -21.14738]],
    ];
    expect(attendus.map(([id]) => id)).toEqual(communes.map((c) => c.id));
    for (const [id, [x, y]] of attendus) {
      const p = parId.get(id)?.point ?? [NaN, NaN];
      expect(Math.abs(p[0] - x), id).toBeLessThanOrEqual(1e-4);
      expect(Math.abs(p[1] - y), id).toBeLessThanOrEqual(1e-4);
    }
  });

  it('bbox : l’emprise de la forme, à l’arrondi et à l’écart de la simplification près', () => {
    // bbox vient de la géométrie source, arrondie à 1e-4° (~11 m) ; la forme simplifiée
    // (Douglas-Peucker, sommets source) s'en écarte de 40 m au plus vers l'intérieur.
    // Elle sert de préfiltre à pick et contient (geo.ts) : réduite, un toucher juste y
    // serait compté faux ; étendue, elle ne filtrerait plus rien.
    for (const c of communes) {
      let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of polys(forme(c.id).geometry))
        for (const [x = 0, y = 0] of p[0] ?? []) {
          o = Math.min(o, x);
          e = Math.max(e, x);
          s = Math.min(s, y);
          n = Math.max(n, y);
        }
      // Écart positif : la bbox déborde de la forme (vers l'extérieur).
      const ecarts = [o - c.bbox[0], s - c.bbox[1], c.bbox[2] - e, c.bbox[3] - n];
      for (const d of ecarts) {
        expect(d, c.id).toBeGreaterThanOrEqual(-1e-4);
        expect(d, c.id).toBeLessThanOrEqual(5e-4);
      }
    }
  });

  it('îlots : Petite-Île (l’îlet, 0,02 km²) et Saint-Paul (0,008 km²) gardés à la simplification', () => {
    // Deux parties dans la source ; keep-shapes ne protège que le plus grand anneau, mais
    // à 40 m (Douglas-Peucker) ils survivent, réduits à quelques sommets. Trop petits pour une cible
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

  it('égaux au recalcul par neighbors() sur la topologie, 50 paires', () => {
    // Nommer tire ses leurres des voisines (décision « Nommer ») : un voisinage retiré
    // des deux côtés passerait le test de symétrie.
    const geoms = topo.objects.communes.geometries;
    const ids = geoms.map((g) => (g.properties as Props | undefined)?.id ?? '');
    expect(ids).toEqual(communes.map((c) => c.id));
    const n = neighbors(geoms as Parameters<typeof neighbors>[0]);
    n.forEach((js, i) => expect(js.map((j) => ids[j]).sort(), ids[i]).toEqual(voisins(ids[i] ?? '')));
    // Relevé sur la géométrie source (COG CARTO comme COG complet) : 50 paires partagent un segment.
    expect(communes.reduce((s, c) => s + c.voisins.length, 0) / 2).toBe(50);
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

describe('fiches des communes (fiches.json, #34, lot F5)', () => {
  // Ce que le jeu lit depuis le lot de l'île (#15) : le lot F5 ajoute des colonnes à la lecture du GeoPackage et un
  // fichier, sans rien changer à ceux-là (relancer npm run geodata:reunion les refait à l'identique). sources.json change
  // (ses empreintes, la description des fiches) : il n'est pas dans la liste.
  it('les fichiers d’avant le lot F5 inchangés, octet pour octet', () => {
    const empreinte = (f: string) => createHash('sha256').update(readFileSync(DOSSIER + f)).digest('hex');
    expect(empreinte('communes.topo.json')).toBe('a48120187bc4c3e18f84b5c8dd60d40cdf7272784e42f14a59327cf09f24f891');
    expect(empreinte('communes.json')).toBe('b980eac2a2a932179fe2bae922036b4791e218c5e710dd61ac8da01cfb99d001');
    expect(empreinte('noms.fr.json')).toBe('4bed40ebe0ce872de13d76b1892cac49f4959fae6142f43c00b3bd33025072eb');
  });

  const fiches = lire<{ v: number; lieux: Record<string, { s: string; h: number; ha: number; sup: number; ic: string }> }>(DOSSIER + 'fiches.json');
  const traitement = lire<{ traitement: { fiches: string; intercommunalites: Record<string, string> } }>(DOSSIER + 'sources.json').traitement;

  it('une fiche par commune, dans l’ordre des codes : habitants du recensement de 2023 (total 889 679), superficie cadastrale, une intercommunalité', () => {
    expect(fiches.v).toBe(1);
    expect(Object.keys(fiches.lieux)).toEqual(communes.map((c) => c.id));
    const total = Object.values(fiches.lieux).reduce((s, f) => s + f.h, 0);
    expect(total).toBe(889_679);
    expect(traitement.fiches).toContain('889679');
    for (const [id, f] of Object.entries(fiches.lieux)) {
      expect(f.s, id).toBe('commune');
      expect(f.ha, id).toBe(2023);
      expect(traitement.intercommunalites[f.ic], id).toBeTruthy();
    }
    // Saint-Pierre (critère de fin du lot) ; l'Entre-Deux et Le Tampon : le cadastre, pas le tracé (§ 2.4).
    expect(fiches.lieux['97416']).toEqual({ s: 'commune', h: 85_038, ha: 2023, sup: 96, ic: '249740077' });
    expect(fiches.lieux['97403']?.sup).toBe(66.8);
    expect(parId.get('97403')?.superficie_km2).toBeCloseTo(51.55, 1);
    expect(fiches.lieux['97422']?.sup).toBe(165.4);
    // Superficies cadastrales : la même île que le tracé, à 1 % près.
    const cadastre = Object.values(fiches.lieux).reduce((s, f) => s + f.sup, 0);
    const trace = communes.reduce((s, c) => s + c.superficie_km2, 0);
    expect(Math.abs(cadastre / trace - 1)).toBeLessThan(0.01);
  });

  it('les cinq intercommunalités de l’IGN, leur nom officiel dans sources.json', () => {
    expect(Object.keys(traitement.intercommunalites)).toEqual(['249740077', '249740085', '249740093', '249740101', '249740119']);
    expect(traitement.intercommunalites['249740077']).toContain('CIVIS');
    expect(new Set(Object.values(fiches.lieux).map((f) => f.ic))).toEqual(new Set(Object.keys(traitement.intercommunalites)));
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
    // Dates relues dans les métadonnées ISO de l'archive (creation, editionDate) : la CI
    // ne relance pas le script, et la carte affiche mise_a_jour (Licence Ouverte).
    expect(s.edition).toBe('2026-01-01');
    expect(s.mise_a_jour).toBe('2026-06-30');
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
