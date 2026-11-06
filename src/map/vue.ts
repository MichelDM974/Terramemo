// Modèle de vue du rendu Canvas (pur, sans DOM) : la carte qui tourne
// (décision « Carte qui tourne »). La vue tient en trois nombres :
// - r : longitude du méridien central (degrés, ]-180, 180]) ;
// - k : zoom (1 = l'ovale entier à l'écran) ;
// - y : décalage vertical à l'écran (le y de Transfo).
// L'ovale reste centré horizontalement (le méridien central passe toujours
// au milieu de l'écran) : un glissé horizontal fait tourner r au lieu de
// déplacer la carte, on fait le tour du monde sans bord, à tout zoom.
//
// Equal Earth sépare les variables : y ne dépend que de la latitude, et x est
// linéaire en longitude sur un parallèle (x = λ' · G(φ)). Tourner de Δλ
// déplace donc de k·s·G(φ)·Δλ tout le parallèle φ : le point sous le doigt
// reste exactement sous le doigt sur son parallèle ; ailleurs, un point
// glisse de dx·G(φ)/G(φ_doigt) (pour un glissé sur l'équateur : 0,94 fois
// à 30°, 0,75 à 60°, 0,59 au pôle).
import { geoEqualEarth, geoEqualEarthRaw, type GeoProjection } from 'd3-geo';
import type { Position } from 'geojson';
import { centreEmprise, contourEmprise, empriseEcran, versEcran, viser, type Emprise } from './geo';
import { creerProjection } from './projection';
import type { Transfo } from './types';

const RAD = Math.PI / 180;
export const ZOOM_MIN = 1;

export interface VueGlobe {
  r: number;
  k: number;
  y: number;
}

/** Géométrie de la projection de base (zoom 1) pour une taille de carte : la même à toute rotation. */
export interface Cadre {
  l: number;
  h: number;
  s: number;
  tx: number;
  ty: number;
}

export function cadre(l: number, h: number): Cadre {
  // fitSize sur la sphère : son contour ne dépend pas de la rotation.
  const p = creerProjection('monde', l, h);
  const [tx, ty] = p.translate();
  return { l: Math.max(1, l), h: Math.max(1, h), s: p.scale(), tx, ty };
}

/** Facteur horizontal d'Equal Earth sur le parallèle φ (degrés) : x = λ (radians) · G(φ). */
export function facteurG(phi: number): number {
  return geoEqualEarthRaw(1, phi * RAD)[0];
}

/** Ordonnée brute (sans échelle, vers le nord) du parallèle φ (degrés). */
export function ordonneeBrute(phi: number): number {
  return geoEqualEarthRaw(0, phi * RAD)[1];
}

const Y_POLE = ordonneeBrute(90);

/** Latitude (degrés) d'une ordonnée de base, bornée aux pôles (au-delà de l'ovale : le pôle). */
export function latitudeDeBase(c: Cadre, by: number): number {
  const yr = Math.max(-Y_POLE, Math.min(Y_POLE, (c.ty - by) / c.s));
  return (geoEqualEarthRaw.invert?.(0, yr)[1] ?? 0) / RAD;
}

/** Ordonnée de base d'une latitude. */
export function baseDeLatitude(c: Cadre, phi: number): number {
  return c.ty - c.s * ordonneeBrute(phi);
}

/** Longitude ramenée dans ]-180, 180]. */
export function normaliserLon(l: number): number {
  const m = (((l + 180) % 360) + 360) % 360 - 180;
  return m === -180 ? 180 : m;
}

/** Écart de longitude ramené dans ]-180, 180] (le plus court chemin de a vers b). */
export const ecartLon = (a: number, b: number): number => normaliserLon(b - a);

/** La projection tournée de la vue (repère de base : écran = k × base + (x, y)). */
export function projectionDe(r: number, c: Cadre): GeoProjection {
  return geoEqualEarth().rotate([-r, 0]).scale(c.s).translate([c.tx, c.ty]);
}

/** La projection directement à l'écran (dessin : traits d'épaisseur constante). */
export function projectionEcran(v: VueGlobe, c: Cadre): GeoProjection {
  return geoEqualEarth()
    .rotate([-v.r, 0])
    .scale(c.s * v.k)
    .translate([c.l / 2, v.k * c.ty + v.y]);
}

export function transfoDe(v: VueGlobe, c: Cadre): Transfo {
  return { k: v.k, x: c.l / 2 - v.k * c.tx, y: v.y, r: v.r };
}

/** Bornes verticales de l'ovale (base) : y0 au nord, y1 au sud. */
function bornesOvale(c: Cadre): [number, number] {
  return [c.ty - c.s * Y_POLE, c.ty + c.s * Y_POLE];
}

/**
 * Décalage vertical borné, comme translateExtent de d3-zoom : un ovale moins
 * haut que l'écran reste centré, sinon ses bords n'entrent jamais dans l'écran.
 */
export function bornerY(c: Cadre, k: number, y: number): number {
  const [y0, y1] = bornesOvale(c);
  if (k * (y1 - y0) <= c.h) return (c.h - k * (y0 + y1)) / 2;
  return Math.min(-k * y0, Math.max(c.h - k * y1, y));
}

export function bornerK(k: number, kMax: number): number {
  return Math.min(kMax, Math.max(ZOOM_MIN, k));
}

/**
 * Point « virtuel » [λ, φ] sous (sx, sy) : la latitude de la ligne de l'écran
 * (bornée aux pôles), la longitude sur ce parallèle, non ramenée (au-delà du
 * bord de l'ovale, elle continue au-delà de ±180° du méridien central). Défini
 * partout, même hors de l'ovale : c'est l'ancre des gestes.
 */
export function pointVirtuel(v: VueGlobe, c: Cadre, sx: number, sy: number): [number, number] {
  const phi = latitudeDeBase(c, (sy - v.y) / v.k);
  const lp = (sx - c.l / 2) / (v.k * c.s * facteurG(phi)) / RAD;
  return [v.r + lp, phi];
}

/**
 * La vue au zoom k où l'ancre [λ, φ] tombe en (sx, sy) : y la met sur la ligne
 * (puis borné, sauf libre), r la met sur la colonne, exactement sur son parallèle.
 */
export function placer(c: Cadre, ancre: readonly [number, number], sx: number, sy: number, k: number, libre = false): VueGlobe {
  const [lambda, phi] = ancre;
  const y0 = sy - k * baseDeLatitude(c, phi);
  const y = libre ? y0 : bornerY(c, k, y0);
  const lp = (sx - c.l / 2) / (k * c.s * facteurG(phi)) / RAD;
  return { r: normaliserLon(lambda - lp), k, y };
}

/**
 * Le point de l'écran visé à la pose (vue v0) rendu dans la vue v1 : sur la
 * ligne de sa latitude, à la colonne de sa longitude (rotation la plus courte
 * entre les deux vues). Sert au seuil toucher/déplacer (SuiviPointeurs).
 */
export function suivrePoint(c: Cadre, v0: VueGlobe, v1: VueGlobe, x: number, y: number): [number, number] {
  const [lambda, phi] = pointVirtuel(v0, c, x, y);
  const lp = lambda - v0.r + ecartLon(v1.r, v0.r);
  return [c.l / 2 + v1.k * c.s * facteurG(phi) * lp * RAD, v1.k * baseDeLatitude(c, phi) + v1.y];
}

/** Région de la sphère qui peut paraître à l'écran : bande de latitudes et intervalle de longitudes. */
export interface Region {
  sud: number;
  nord: number;
  /** Longitudes [ouest, est] ; ouest > est : l'intervalle passe l'antiméridien. Toutes : null. */
  lon: [number, number] | null;
  /** Rien de la sphère à l'écran. */
  vide: boolean;
}

/**
 * Région visible, élargie de marge px de chaque côté : surensemble de ce que
 * l'écran montre. Lignes de l'écran → latitudes (y ne dépend que de φ) ; sur
 * la bande, l'intervalle de longitudes le plus large est celui du parallèle le
 * plus proche d'un pôle (G décroît avec |φ|).
 */
export function regionVisible(v: VueGlobe, c: Cadre, marge: number): Region {
  const [y0, y1] = bornesOvale(c);
  const haut = (-marge - v.y) / v.k;
  const bas = (c.h + marge - v.y) / v.k;
  if (bas < y0 || haut > y1) return { sud: 0, nord: 0, lon: null, vide: true };
  const nord = latitudeDeBase(c, haut);
  const sud = latitudeDeBase(c, bas);
  const gMin = facteurG(Math.max(Math.abs(nord), Math.abs(sud)));
  const demi = (c.l / 2 + marge) / (v.k * c.s * gMin) / RAD;
  if (demi >= 180) return { sud, nord, lon: null, vide: false };
  return { sud, nord, lon: [normaliserLon(v.r - demi), normaliserLon(v.r + demi)], vide: false };
}

/** L'emprise [ouest, sud, est, nord] (ouest ≤ est, sans passer l'antiméridien) rencontre-t-elle la région ? */
export function rencontre(o: number, s: number, e: number, n: number, reg: Region): boolean {
  if (reg.vide || n < reg.sud || s > reg.nord) return false;
  if (!reg.lon) return true;
  const [a, b] = reg.lon;
  if (a <= b) return e >= a && o <= b;
  return e >= a || o <= b; // région à cheval sur l'antiméridien
}

/**
 * La vue qui montre une zone (« Voir », montrer de Nommer) : le cadrage de
 * viser() (geo.ts), celui de la carte SVG, calculé dans la projection tournée
 * sur la longitude de son point. Son point au centre de l × hVisible (la
 * partie au-dessus d'une barre), la zone (côté taille1 au zoom 1) sur un
 * quart du plus petit côté, au zoom kMax au plus ; avec anneau (le contour du
 * polygone principal), la zone longue fait baisser le zoom et la vue se
 * décale juste assez pour qu'il tienne. Le décalage horizontal devient une
 * rotation : le point reste où viser() le met, exactement sur son parallèle.
 * Libre (montrer) : y non borné, comme zoom.transform de d3-zoom en SVG, qui
 * n'applique translateExtent qu'aux gestes ; une zone très au sud (Argentine,
 * Australie) monte donc au-dessus de la barre, du vide sous l'ovale, et le
 * geste suivant ramène la vue dans la borne (placer).
 */
export function viserVue(
  c: Cadre,
  point: readonly [number, number],
  taille1: number,
  kMax: number,
  hVisible = c.h,
  anneau?: readonly Position[] | null,
  libre = false,
): VueGlobe {
  const h = Math.max(1, Math.min(hVisible, c.h));
  const lon = normaliserLon(point[0]);
  const proj = projectionDe(lon, c);
  const b = proj([point[0], point[1]]) ?? [c.tx, c.ty];
  const boite = anneau ? empriseEcran(anneau, (ll) => proj(ll)) : null;
  const t = viser([b[0], b[1]], taille1, c.l, h, kMax, boite);
  const [sx, sy] = versEcran(t, b[0], b[1]);
  return placer(c, point, sx, sy, bornerK(t.k, kMax), libre);
}

/**
 * La vue qui cadre une emprise [ouest, sud, est, nord] (une grappe de pays)
 * dans l × hVisible : le méridien de son milieu au centre (une emprise qui
 * passe l'antiméridien reste d'un seul tenant), aussi zoomée que possible
 * tant que son contour tient à l'écran (90 %, viser), au zoom kMax au plus et
 * 1 au moins. Libre : y non borné, comme le vol de montrer().
 */
export function viserEmprise(c: Cadre, e: Emprise, kMax: number, hVisible = c.h, libre = true): VueGlobe {
  // Une taille nulle : viser part de kMax, le contour fait baisser le zoom.
  return viserVue(c, centreEmprise(e), 0, kMax, hVisible, contourEmprise(e), libre);
}

/**
 * Coordonnées planes d'une vue pour l'interpolation de van Wijk et Nuij
 * (montrer) : [centre x, centre y, largeur vue], en px de base ; la longitude
 * au centre comptée sur l'équateur, non ramenée (r déroulé par l'appelant).
 */
export function versPlan(v: VueGlobe, c: Cadre): [number, number, number] {
  return [v.r * RAD * c.s * facteurG(0), (c.h / 2 - v.y) / v.k, Math.max(c.l, c.h) / v.k];
}

/** Libre : y non borné (vol de montrer, comme une transition de d3-zoom). */
export function dePlan(p: readonly [number, number, number], c: Cadre, kMax: number, libre = false): VueGlobe {
  const k = bornerK(Math.max(c.l, c.h) / p[2], kMax);
  const y = c.h / 2 - k * p[1];
  return { r: normaliserLon(p[0] / (c.s * facteurG(0)) / RAD), k, y: libre ? y : bornerY(c, k, y) };
}

/**
 * Une Transfo quelconque (pilote, zoomer) en vue : le point au centre de
 * l'écran reste au centre. Sans r, la rotation donnée par défaut.
 */
export function vueDeTransfo(t: Transfo, c: Cadre, rDefaut: number, kMax: number): VueGlobe {
  const r = t.r ?? rDefaut;
  const v0: VueGlobe = { r, k: t.k, y: t.y };
  // Centre de l'écran dans la vue plane donnée : ramené au méridien central par la rotation.
  const xCentre = c.l / 2 - (t.x - (c.l / 2 - t.k * c.tx));
  const centre = pointVirtuel(v0, c, xCentre, c.h / 2);
  return placer(c, centre, c.l / 2, c.h / 2, bornerK(t.k, kMax));
}
