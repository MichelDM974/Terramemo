// Types des données de la carte (public/geo/*, produits par geodata/build.mjs).
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type Statut = 'jouable' | 'optionnel' | 'territoire' | 'conteste' | 'autre';

/** Une entité de pays.json (une par ligne, triées par id). */
export interface Pays {
  id: string;
  statut: Statut;
  a2?: string;
  continent: string;
  sous_region: string;
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

/** Une zone de contestees.json (couche hachurée, jamais touchée). */
export interface Contestee {
  id: string;
  type: string;
  rang: number;
  superficie_km2: number;
  point: [number, number];
  /** Entités qui contiennent la zone : ce qu'un toucher y donne. */
  dans: string[];
  note: string;
}

export type Forme = Feature<Polygon | MultiPolygon, { id: string }>;

/** Une entité prête pour la carte : ses données et sa géométrie (sens de d3). */
export interface Entite {
  pays: Pays;
  forme: Forme;
}

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
export type Rendu = 'g' | 'css' | 'canvas';
