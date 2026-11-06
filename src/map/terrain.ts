// Terrain local (pur) : une carte d'une région, hors du monde (l'île de La
// Réunion ; la France du J6 n'aura qu'une DefTerrain de plus). Ses données
// sont dans public/geo/<dossier>/ (geodata/reunion.mjs), chargées au choix de
// la série seulement (donnees-terrain.ts) ; la Carte SVG la dessine par un
// cadre (carte.ts), toujours en rendu « g », sans pastilles.
import { geoMercator, type GeoPermissibleObjects, type GeoProjection } from 'd3-geo';
import type { CadreCarte } from './carte';
import type { NomTerrain } from './types';

export interface DefTerrain {
  nom: Exclude<NomTerrain, 'monde'>;
  /** Dossier servi des quatre fichiers (communes.topo.json, communes.json, noms.fr.json, sources.json). */
  dossier: string;
  /** Objet de la topologie. */
  objet: string;
  /** Nombre de zones : affiché avant le chargement, testé égal à communes.json. */
  n: number;
  zoomMax: number;
  zoomMaxMontrer: number;
}

/**
 * L'île de La Réunion : 24 communes. Zoom 8 (1 px ≈ 22 m, ~8 km sur la
 * largeur du téléphone) ; montrer() borné à 4 (la commune et ses voisines).
 */
export const REUNION: DefTerrain = {
  nom: 'reunion',
  dossier: '/geo/reunion/',
  objet: 'communes',
  n: 24,
  zoomMax: 8,
  zoomMaxMontrer: 4,
};

/**
 * Marges du cadre (px) : en haut la mention de la source (div.carte-credit,
 * une ligne de 0,7rem, deux sous ~380 px de large : hautDeuxLignes sous
 * creditUneLigneDes, sinon l'île, remontée par basMin, passait dessous) ; en bas la barre des vues, Toucher ~120 px, Chrono
 * ~130, Nommer ~211 plus ses 8 px d'écart au bas de l'écran : basMin la
 * couvre à toute hauteur (sous ~750 px, 30 % n'y suffisent plus : à 375 × 667
 * le sud de l'île passait sous la barre et Nommer volait vers Petite-Île).
 * Le sud (Saint-Pierre, Saint-Joseph, Saint-Philippe) reste au-dessus ; sur
 * un petit écran l'île, qui tient par la largeur, remonte sans rétrécir.
 */
export const MARGES = { haut: 28, hautDeuxLignes: 42, creditUneLigneDes: 380, cotes: 12, basMin: 225, basPart: 0.3 } as const;

/** Marge haute d'une carte de l px de large : la mention de la source y tient sur une ou deux lignes. */
export function margeHaute(l: number): number {
  return l < MARGES.creditUneLigneDes ? MARGES.hautDeuxLignes : MARGES.haut;
}

/**
 * Mercator ajustée à l'emprise, dans le cadre moins les marges. Conforme ; sur
 * l'île (0,5° de latitude) son échelle ne varie que de 0,35 % : l'UTM 40S
 * officiel ne s'en distinguerait pas à l'écran. Rotation nulle : traceDirect
 * s'applique (55° E est loin de la coupure). Mercator garde la forme
 * « échelle + translation » : garderVue (projection.ts) reste affine.
 */
export function projectionLocale(l: number, h: number, emprise: GeoPermissibleObjects): GeoProjection {
  const x0 = MARGES.cotes;
  const y0 = margeHaute(l);
  // Bornes d'un cadre minuscule (copie à 1 × 1 de fabriqueTraces, hôte sans taille) : jamais négatives.
  const x1 = Math.max(x0 + 1, l - MARGES.cotes);
  const y1 = Math.max(y0 + 1, h - Math.max(MARGES.basMin, MARGES.basPart * h));
  return geoMercator().fitExtent(
    [
      [x0, y0],
      [x1, y1],
    ],
    emprise,
  );
}

/** Le cadre d'une Carte pour un terrain local : fond de l'hôte (CSS, --mer), pas de pastilles. */
export function cadreLocal(def: DefTerrain, emprise: GeoPermissibleObjects, libelle: string): CadreCarte {
  return {
    projection: (l, h) => projectionLocale(l, h, emprise),
    fond: null,
    borne: emprise,
    borneHauteurEcran: true,
    zoomMax: def.zoomMax,
    zoomMaxMontrer: def.zoomMaxMontrer,
    // La plus petite commune (Le Port, ~16 km²) fait ~22 px au zoom 1 du
    // téléphone, au-dessus du seuil des pastilles (10 px) : aucune n'en aurait,
    // et micro: true en donnerait à toutes (seuil de 2 000 km² des pays).
    pastilles: false,
    libelle,
  };
}
