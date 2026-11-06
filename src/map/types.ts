// Types des données de la carte (public/geo/*, produits par geodata/build.mjs).
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type Statut = 'jouable' | 'optionnel' | 'territoire' | 'conteste' | 'autre';

/**
 * Ce que la carte demande d'une zone, pays ou commune : pick, noter,
 * pastilles, cadrage (pays.json du monde, communes.json d'un terrain local).
 */
export interface Lieu {
  id: string;
  statut: Statut;
  superficie_km2: number;
  /** Superficie du plus grand polygone : décide de la pastille. */
  partie_max_km2: number;
  /** [lon, lat] du point d'étiquette, dans le plus grand polygone. */
  point: [number, number];
  /** [ouest, sud, est, nord] ; ouest > est : l'emprise passe l'antiméridien. */
  bbox: [number, number, number, number];
  micro: boolean;
  voisins: string[];
}

/** Une entité de pays.json (une par ligne, triées par id). */
export interface Pays extends Lieu {
  a2?: string;
  continent: string;
  sous_region: string;
  /** Pays qui revendiquent l'entité entière (Somaliland : SOM) ; ids de pays.json. */
  revendique_par?: string[];
  /** NOTE_BRK de Natural Earth, pour les entités contestées et les territoires. */
  note_ne?: string;
}

/** Une zone de contestees.json (couche hachurée : pick ne la désigne jamais, noter l'admet pour qui la tient ou la revendique). */
export interface Contestee {
  id: string;
  type: string;
  rang: number;
  superficie_km2: number;
  point: [number, number];
  /**
   * Qui tient la zone : les entités qui contiennent son point dans les sources
   * (non simplifiées), ou l'ADMIN de NE pour un îlot absent de la couche des
   * pays (geodata/revendications.json). Presque toujours ce qu'un toucher y
   * donne ; pas pour les îlots espagnols au ras du Maroc (NE_B62, NE_B63), que
   * la carte simplifiée met aussi sous le Maroc.
   */
  dans: string[];
  /** Pays qui la revendiquent (geodata/revendications.json) ; vide si personne. */
  revendique_par: string[];
  note: string;
}

export type Forme = Feature<Polygon | MultiPolygon, { id: string }>;

/**
 * Une entité prête pour la carte : ses données et sa géométrie (sens de d3).
 * `pays` porte la zone, pays ou commune : nom de champ gardé (~140 usages),
 * le code du monde garde le défaut Pays.
 */
export interface Entite<L extends Lieu = Pays> {
  pays: L;
  forme: Forme;
}

/** Terrain de jeu : le monde, ou une carte locale (src/map/terrain.ts). */
export type NomTerrain = 'monde' | 'reunion';

/**
 * Transformation de la carte : écran = k × base + (x, y), la base étant la
 * projection au zoom 1 (d3-zoom en SVG). En Canvas, la carte tourne : r est
 * la longitude du méridien central (degrés), base = projection tournée de r,
 * et x découle de k (l'ovale reste centré : vue.ts). Absent : pas de rotation.
 */
export interface Transfo {
  k: number;
  x: number;
  y: number;
  r?: number;
}

export type NomProjection = 'monde' | 'pacifique';
export type Rendu = 'g' | 'css' | 'canvas' | 'webgl';
