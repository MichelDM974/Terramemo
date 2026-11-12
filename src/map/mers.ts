// Couche marine (océans et mers, étude J2, § 2.3 et § 4.2 ; lot 3a) : les
// quatre fichiers de public/geo (mers.topo.json, mers-leger.topo.json,
// mers.json, mers.fr.json), lus à la demande et une seule fois, comme l'île
// (src/terrains.ts) ; jamais au premier affichage (le smoke du pilote le
// vérifie). Les zones vont dans DonneesCarte.mers, jamais dans entites.
//
// Ce qu'une mer allumée montre : une seule fonction le dit (zonesAllumees),
// lue par les trois rendus et par la notation (lot 3a, partie C).
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Position } from 'geojson';
import type { Entite, Forme, Mer, SorteMer } from './types';

/** Une ligne de mers.json (geodata/mers.mjs). */
export interface MerBrute {
  id: string;
  sorte: SorteMer;
  parents: string[];
  interieure: boolean;
  bassin: string;
  enclavee?: boolean;
  superficie_km2: number;
  point: [number, number];
  bbox: [number, number, number, number];
  voisins: string[];
}

/** mers.fr.json : le nom de chaque zone (générique en minuscule), et ses autres noms (la recherche, lot 3b). */
export interface NomsMers {
  noms: Record<string, string>;
  alias: Record<string, string[]>;
}

/** Les fichiers lus, tels quels : le Web Worker du maillage des mers (WebGL) les analyse de son côté et en tire la clé de son cache. */
export interface TextesMers {
  topo: string;
  mers: string;
}

/** La couche marine chargée : de quoi la poser sur une carte (prendreMers). */
export interface CoucheMers {
  /** Les zones, dans l'ordre de mers.topo.json (le même que le Worker du maillage : index de forme). */
  mers: Entite<Mer>[];
  /** Formes de mers-leger.topo.json (50 km), par id : tracées pendant les gestes (Canvas). */
  leger: Map<string, Forme>;
  noms: Record<string, string>;
  alias: Record<string, string[]>;
  textes: TextesMers;
}

type ObjetsMers = { mers: GeometryCollection<{ id: string }> };

/** Une zone de mers.json en Lieu de la carte : jouable, jamais micro ; la superficie entière décide de sa taille à l'écran. */
export function versMer(b: MerBrute): Mer {
  const m: Mer = {
    id: b.id,
    statut: 'jouable',
    superficie_km2: b.superficie_km2,
    partie_max_km2: b.superficie_km2,
    point: b.point,
    bbox: b.bbox,
    micro: false,
    voisins: b.voisins,
    sorte: b.sorte,
    parents: b.parents,
    interieure: b.interieure,
    bassin: b.bassin,
  };
  if (b.enclavee) m.enclavee = true;
  return m;
}

/** Les zones de la topologie qui ont leur ligne dans mers.json, dans l'ordre de la topologie. */
export function entitesMers(topo: Topology<ObjetsMers>, brutes: readonly MerBrute[]): Entite<Mer>[] {
  const parId = new Map(brutes.map((b) => [b.id, b]));
  const res: Entite<Mer>[] = [];
  for (const forme of feature(topo, topo.objects.mers).features as Forme[]) {
    const b = parId.get(forme.properties.id);
    if (b && forme.geometry) res.push({ pays: versMer(b), forme });
  }
  return res;
}

/** Assemble la couche à partir des fichiers lus (sert aussi aux tests). */
export function assemblerMers(textes: { topo: string; leger: string; mers: string; fr: string }): CoucheMers {
  const topo = JSON.parse(textes.topo) as Topology<ObjetsMers>;
  const leger = JSON.parse(textes.leger) as Topology<ObjetsMers>;
  const brutes = JSON.parse(textes.mers) as MerBrute[];
  const fr = JSON.parse(textes.fr) as NomsMers;
  const formesLegeres = new Map((feature(leger, leger.objects.mers).features as Forme[]).filter((f) => f.geometry).map((f) => [f.properties.id, f]));
  return {
    mers: entitesMers(topo, brutes),
    leger: formesLegeres,
    noms: fr.noms,
    alias: fr.alias ?? {},
    textes: { topo: textes.topo, mers: textes.mers },
  };
}

/** Les quatre fichiers de la couche, dans l'ordre où assemblerMers les lit. */
export const FICHIERS_MERS = ['mers.topo.json', 'mers-leger.topo.json', 'mers.json', 'mers.fr.json'] as const;

/**
 * Un chargeur de la couche : lit les quatre fichiers une fois (promesse
 * gardée, comme l'île dans src/terrains.ts) ; un échec (hors ligne) ne reste
 * pas en cache, l'appel suivant relit tout.
 */
export function chargeurMers(lire: (nom: string) => Promise<string>): () => Promise<CoucheMers> {
  let enCours: Promise<CoucheMers> | null = null;
  return () => {
    if (enCours) return enCours;
    const p = Promise.all(FICHIERS_MERS.map(lire)).then(([topo = '', leger = '', mers = '', fr = '']) => assemblerMers({ topo, leger, mers, fr }));
    enCours = p;
    p.catch(() => {
      if (enCours === p) enCours = null;
    });
    return p;
  };
}

/** Lecture d'un fichier de public/geo, « <fichier> : HTTP xxx » levé comme chargerDonnees. */
export const lireGeo =
  (base = '/geo/') =>
  async (nom: string): Promise<string> => {
    const r = await fetch(base + nom);
    if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`);
    return r.text();
  };

/**
 * La couche marine du site : à la demande seulement (le premier toucher en mer
 * à l'accueil, le sujet des mers, une séance qui en a, la recherche, la carte
 * de la mémoire des mers : lot 3b ; ?mers=demo, src/main.ts).
 */
export const chargerMers = chargeurMers(lireGeo());

/**
 * Les zones qu'allume une marque posée sur la zone id (allumée, juste, fausse) :
 * elle, et, pour un océan, les mers qu'il enclave sans côte (enclavee, dont il
 * est un parent : la mer des Sargasses dans l'Atlantique), jamais ses mers
 * côtières (décision « Océans et mers », 12/11 : sinon un grand trou au milieu
 * de l'Atlantique allumé). La mer des Sargasses marquée seule n'allume
 * qu'elle. Un id qui n'est pas une zone marine : lui seul.
 */
export function zonesAllumees(id: string, mers: readonly Mer[]): string[] {
  const m = mers.find((x) => x.id === id);
  if (!m || m.sorte !== 'océan') return [id];
  return [id, ...mers.filter((x) => x.enclavee && x.parents.includes(id)).map((x) => x.id)];
}

/** Le point [lon, lat] est-il dans l'anneau (règle pair-impair, en degrés : les anneaux ne passent pas l'antiméridien) ? */
function dansAnneau(anneau: readonly Position[], [x, y]: readonly [number, number]): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = [anneau[i]?.[0] ?? 0, anneau[i]?.[1] ?? 0];
    const [xj, yj] = [anneau[j]?.[0] ?? 0, anneau[j]?.[1] ?? 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/**
 * Le contour d'une zone allumée (le contour faux) : celui de l'union qu'elle
 * montre (zonesAllumees). Une mer enclavée est un trou de son océan : les trous
 * de l'océan qui contiennent le point d'une mer qu'il allume sont ôtés, sinon
 * l'Atlantique faux aurait un anneau autour des Sargasses. Les autres zones :
 * leur forme.
 */
export function formeContour(e: Entite<Mer>, mers: readonly Entite<Mer>[]): Forme {
  const avec = zonesAllumees(e.pays.id, mers.map((m) => m.pays)).slice(1);
  if (!avec.length) return e.forme;
  const points = mers.filter((m) => avec.includes(m.pays.id)).map((m) => m.pays.point);
  const g = e.forme.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const sans = polys.map((poly) => poly.filter((anneau, i) => i === 0 || !points.some((p) => dansAnneau(anneau, p))));
  const geometry = g.type === 'Polygon' ? { type: 'Polygon' as const, coordinates: sans[0] ?? [] } : { type: 'MultiPolygon' as const, coordinates: sans };
  return { ...e.forme, geometry };
}
