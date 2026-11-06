// Géométrie pure (sans DOM) : passage écran ↔ sphère, appartenance, distance au bord.
import { geoContains, geoDistance, type GeoProjection } from 'd3-geo';
import type { Polygon, Position } from 'geojson';
import type { Forme, Lieu, Transfo } from './types';

export const RAYON_TERRE_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Point écran (px CSS, repère de la carte) → coordonnées de base (zoom 1). */
export function versBase(t: Transfo, x: number, y: number): [number, number] {
  return [(x - t.x) / t.k, (y - t.y) / t.k];
}

/** Coordonnées de base → point écran. */
export function versEcran(t: Transfo, bx: number, by: number): [number, number] {
  return [t.k * bx + t.x, t.k * by + t.y];
}

/** Rectangle [x0, y0, x1, y1], à l'écran (px CSS relatifs à la carte) ou en coordonnées de base. */
export type Rect = [number, number, number, number];

/** L'emprise d'un contour à l'écran (ou en base, selon versEcran) ; null s'il est vide ou qu'aucun sommet n'est projetable. */
export function empriseEcran(anneau: readonly (readonly number[])[], versEcran: (ll: [number, number]) => [number, number] | null): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of anneau) {
    const e = versEcran([p[0] ?? 0, p[1] ?? 0]);
    if (!e || !Number.isFinite(e[0]) || !Number.isFinite(e[1])) continue;
    if (e[0] < x0) x0 = e[0];
    if (e[0] > x1) x1 = e[0];
    if (e[1] < y0) y0 = e[1];
    if (e[1] > y1) y1 = e[1];
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

/** Part (0 à 1) de l'aire d'une emprise dans [0, l] × [0, hVisible] ; une emprise plate compte par sa longueur. */
export function partVisible(r: Rect, l: number, hVisible: number): number {
  const [x0, y0, x1, y1] = r;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const vx = Math.max(0, Math.min(x1, l) - Math.max(x0, 0));
  const vy = Math.max(0, Math.min(y1, hVisible) - Math.max(y0, 0));
  const fx = dx > 0 ? vx / dx : x0 >= 0 && x0 <= l ? 1 : 0;
  const fy = dy > 0 ? vy / dy : y0 >= 0 && y0 <= hVisible ? 1 : 0;
  return fx * fy;
}

/** Part de l'écran laissée autour d'une zone longue que viser() fait tenir (la Norvège jusqu'au cap Nord). */
const AJUSTE = 0.9;

/** Décale t (translation d'un axe) pour que [a, b] (déjà × k) tienne dans [0, L] s'il le peut, au plus près. */
function recaler(t: number, a: number, b: number, L: number): number {
  if (b - a > L) return t;
  const marge = Math.min(8, (L - (b - a)) / 2);
  if (t + a < marge) t = marge - a;
  if (t + b > L - marge) t = L - marge - b;
  return t;
}

/**
 * La transformation qui met le point de base b au centre de l × h px, la zone
 * (côté taille1 au zoom 1) sur un quart du plus petit côté, au zoom kMax au
 * plus et 1 au moins. h : la partie visible de la carte (au-dessus d'une
 * barre), pas forcément toute sa hauteur. boite (en base) : l'emprise de son
 * polygone principal, qui doit tenir à l'écran : une zone longue (la
 * Norvège, le Chili) fait baisser le zoom, et la vue se décale du point
 * d'étiquette juste assez pour qu'elle tienne.
 */
export function viser(b: readonly [number, number], taille1: number, l: number, h: number, kMax: number, boite?: Rect | null): Transfo {
  let k = Math.min(kMax, Math.max(1, Math.min(l, h) / 4 / Math.max(taille1, 1e-6)));
  if (!boite) return { k, x: l / 2 - k * b[0], y: h / 2 - k * b[1] };
  const [x0, y0, x1, y1] = boite;
  const ajuste = AJUSTE * Math.min(x1 > x0 ? l / (x1 - x0) : Infinity, y1 > y0 ? h / (y1 - y0) : Infinity);
  if (ajuste < k) k = Math.max(1, ajuste);
  return { k, x: recaler(l / 2 - k * b[0], k * x0, k * x1, l), y: recaler(h / 2 - k * b[1], k * y0, k * y1, h) };
}

/**
 * Point écran → [lon, lat], ou null hors de la sphère. L'inverse d'Equal Earth
 * rend des valeurs fausses hors du contour : on vérifie par l'aller-retour.
 */
export function versLonLat(proj: GeoProjection, t: Transfo, x: number, y: number): [number, number] | null {
  const b = versBase(t, x, y);
  const ll = proj.invert?.(b);
  if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return null;
  if (Math.abs(ll[0]) > 180 + 1e-9 || Math.abs(ll[1]) > 90 + 1e-9) return null;
  const retour = proj(ll);
  if (!retour) return null;
  if (Math.hypot(retour[0] - b[0], retour[1] - b[1]) > 0.5) return null;
  return [ll[0], ll[1]];
}

/** Le point est-il dans l'emprise [ouest, sud, est, nord] (antiméridien compris) ? */
export function dansEmprise(bbox: readonly [number, number, number, number], lon: number, lat: number, marge = 0): boolean {
  const [o, s, e, n] = bbox;
  if (lat < s - marge || lat > n + marge) return false;
  if (o <= e) return lon >= o - marge && lon <= e + marge;
  return lon >= o - marge || lon <= e + marge; // emprise à cheval sur l'antiméridien
}

interface Partie {
  o: number;
  s: number;
  e: number;
  n: number;
  polygone: Polygon;
}

const parties = new WeakMap<Forme, Partie[]>();

/**
 * Les polygones d'une forme avec leur emprise. Natural Earth coupe ses
 * polygones à ±180° : min/max des longitudes suffit ; un polygone qui fait le
 * tour du globe (l'Antarctique) est étendu jusqu'au pôle.
 */
function partiesDe(forme: Forme): Partie[] {
  let res = parties.get(forme);
  if (res) return res;
  const g = forme.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  res = polys.map((coordinates) => {
    let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const p of coordinates[0] ?? []) {
      const lon = p[0] ?? 0;
      const lat = p[1] ?? 0;
      if (lon < o) o = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
    if (e - o > 359) {
      if (s < -60) s = -90;
      if (n > 60) n = 90;
    }
    return { o, s, e, n, polygone: { type: 'Polygon', coordinates } };
  });
  parties.set(forme, res);
  return res;
}

/**
 * Le contour extérieur du polygone principal d'une forme : celui qui contient
 * le point d'étiquette (il est dans le plus grand polygone : la France
 * métropolitaine, pas la Guyane), à défaut celui de plus grande emprise.
 */
export function anneauPrincipal(forme: Forme, point: readonly [number, number]): readonly Position[] {
  const ps = partiesDe(forme);
  const [lon, lat] = point;
  const dedans = ps.find((p) => lon >= p.o && lon <= p.e && lat >= p.s && lat <= p.n && geoContains(p.polygone, [lon, lat]));
  const p = dedans ?? ps.reduce<Partie | undefined>((a, q) => (!a || (q.e - q.o) * (q.n - q.s) > (a.e - a.o) * (a.n - a.s) ? q : a), undefined);
  return p?.polygone.coordinates[0] ?? [];
}

/** Prépare l'index des polygones et chauffe geoContains (après la première image : le premier toucher n'en paie pas le prix). */
export function prechauffer(formes: readonly Forme[]): void {
  for (const f of formes) partiesDe(f);
  const premiere = formes[0];
  if (premiere) for (let i = 0; i < 20; i++) geoContains(premiere, [i, i]);
}

/**
 * geoContains précédé du filtre d'emprise de l'entité puis de chacun de ses
 * polygones : seuls ceux qui encadrent le point sont parcourus (la France
 * métropolitaine sans les DROM, une île de l'Indonésie…).
 */
export function contient(forme: Forme, bbox: readonly [number, number, number, number], ll: [number, number]): boolean {
  if (!dansEmprise(bbox, ll[0], ll[1], 0.05)) return false;
  const [lon, lat] = ll;
  const m = 1e-6;
  for (const p of partiesDe(forme)) {
    if (lon < p.o - m || lon > p.e + m || lat < p.s - m || lat > p.n + m) continue;
    if (geoContains(p.polygone, ll)) return true;
  }
  return false;
}

type Vec = [number, number, number];

function versVec(p: Position): Vec {
  const lon = (p[0] ?? 0) * RAD;
  const lat = (p[1] ?? 0) * RAD;
  const c = Math.cos(lat);
  return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)];
}

const scal = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vect = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angle = (a: Vec, b: Vec) => Math.atan2(Math.hypot(...vect(a, b)), scal(a, b));

/** Distance angulaire (radians) du point P à l'arc de grand cercle A→B. */
function distanceArc(p: Vec, a: Vec, b: Vec): number {
  const n = vect(a, b);
  const nn = Math.hypot(...n);
  if (nn < 1e-12) return angle(p, a);
  const u: Vec = [n[0] / nn, n[1] / nn, n[2] / nn];
  const d = scal(p, u);
  // Pied de la perpendiculaire sur le grand cercle : est-il entre A et B ?
  const c: Vec = [p[0] - d * u[0], p[1] - d * u[1], p[2] - d * u[2]];
  if (scal(vect(a, c), u) >= 0 && scal(vect(c, b), u) >= 0) return Math.abs(Math.asin(Math.max(-1, Math.min(1, d))));
  return Math.min(angle(p, a), angle(p, b));
}

/**
 * Distance géodésique (km) du point au bord le plus proche de la forme : sur
 * chaque segment de chaque anneau, pas au centre (pensez à la Russie).
 */
export function distanceAuBordKm(forme: Forme, ll: [number, number]): number {
  const p = versVec(ll);
  const g = forme.geometry;
  const polygones = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let min = Infinity;
  for (const poly of polygones) {
    for (const anneau of poly) {
      let prec: Vec | null = null;
      for (const pos of anneau) {
        const v = versVec(pos);
        if (prec) min = Math.min(min, distanceArc(p, prec, v));
        prec = v;
      }
    }
  }
  return min * RAYON_TERRE_KM;
}

/** Emprise [ouest, sud, est, nord] en degrés ; ouest > est : elle passe l'antiméridien (comme Lieu.bbox). */
export type Emprise = [number, number, number, number];

/**
 * Union d'emprises (une grappe de pays : le cadrage de son rappel) : en
 * latitude, de la plus au sud à la plus au nord ; en longitude, le plus
 * petit arc qui les couvre toutes, donc l'antiméridien franchi si c'est plus
 * court (l'Océanie : de l'Australie aux Samoa par Fidji, pas par l'Afrique).
 * null sans emprise.
 */
export function unionEmprises(emprises: readonly (readonly [number, number, number, number])[]): Emprise | null {
  if (!emprises.length) return null;
  let s = Infinity;
  let n = -Infinity;
  // Chaque emprise en arc [début, longueur] sur le cercle [0, 360).
  const arcs = emprises.map(([o, so, e, no]) => {
    s = Math.min(s, so);
    n = Math.max(n, no);
    const debut = (((o % 360) + 360) % 360);
    const long = o <= e ? e - o : e + 360 - o;
    return [debut, Math.min(360, long)] as [number, number];
  });
  if (arcs.some(([, l]) => l >= 360)) return [-180, s, 180, n];
  arcs.sort((a, b) => a[0] - b[0]);
  // Fusion des arcs qui se touchent, dans l'ordre, puis par-dessus 0° (le dernier sur le premier).
  const fusion: [number, number][] = [];
  for (const [d, l] of arcs) {
    const der = fusion[fusion.length - 1];
    if (der && d <= der[0] + der[1]) der[1] = Math.max(der[1], d + l - der[0]);
    else fusion.push([d, l]);
  }
  while (fusion.length > 1) {
    const der = fusion[fusion.length - 1]!;
    const pre = fusion[0]!;
    if (der[0] + der[1] - 360 < pre[0]) break;
    fusion.pop();
    fusion[0] = [der[0], Math.max(der[0] + der[1], pre[0] + pre[1] + 360) - der[0]];
  }
  if (fusion.some(([, l]) => l >= 360)) return [-180, s, 180, n];
  // Le plus grand trou entre deux arcs : l'union est son complément.
  let trou = -1;
  let apres = 0;
  for (let i = 0; i < fusion.length; i++) {
    const [d, l] = fusion[i]!;
    const suivant = fusion[(i + 1) % fusion.length]!;
    const ecart = fusion.length === 1 ? 360 - l : (((suivant[0] - (d + l)) % 360) + 360) % 360;
    if (ecart > trou) {
      trou = ecart;
      apres = suivant[0];
    }
  }
  const lon = (x: number) => (((x + 180) % 360) + 360) % 360 - 180;
  const ouest = lon(apres);
  const est = lon(apres + 360 - trou);
  return [ouest, s, est === -180 ? 180 : est, n];
}

/** Le contour d'une emprise (son bord, échantillonné en longitude et en latitude), à projeter pour son emprise à l'écran. */
export function contourEmprise([o, s, e, n]: Emprise, pas = 24): [number, number][] {
  const long = o <= e ? e - o : e + 360 - o;
  const r: [number, number][] = [];
  for (let i = 0; i <= pas; i++) {
    const lon = o + (long * i) / pas;
    r.push([lon, s], [lon, n]);
  }
  for (let i = 1; i < pas; i++) {
    const lat = s + ((n - s) * i) / pas;
    r.push([o, lat], [o + long, lat]);
  }
  return r;
}

/** Le centre [lon, lat] d'une emprise (au milieu de son arc de longitude, ramené dans [-180, 180]). */
export function centreEmprise([o, s, e, n]: Emprise): [number, number] {
  const long = o <= e ? e - o : e + 360 - o;
  const m = ((((o + long / 2) + 180) % 360) + 360) % 360 - 180;
  return [m, (s + n) / 2];
}

/**
 * Emprise [ouest, sud, est, nord] d'un contour (le polygone principal d'un
 * pays : anneauPrincipal) ; un contour qui couvre plus de 180° de longitude
 * est lu par-dessus l'antiméridien (ouest > est). null s'il est vide.
 */
export function empriseAnneau(anneau: readonly (readonly number[])[]): Emprise | null {
  if (!anneau.length) return null;
  let s = Infinity, n = -Infinity, o = Infinity, e = -Infinity, o2 = Infinity, e2 = -Infinity;
  for (const p of anneau) {
    const lon = p[0] ?? 0;
    const lat = p[1] ?? 0;
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    o = Math.min(o, lon);
    e = Math.max(e, lon);
    const l2 = lon < 0 ? lon + 360 : lon;
    o2 = Math.min(o2, l2);
    e2 = Math.max(e2, l2);
  }
  if (e - o <= 180 || e2 - o2 >= e - o) return [o, s, e, n];
  const lon = (x: number) => (x > 180 ? x - 360 : x);
  return [lon(o2), s, lon(e2), n];
}

/** Au-delà de cette superficie, un pays ne fait pas le cadrage de sa grappe (la Russie, le Canada, la Chine…). */
export const GEANT_KM2 = 3_000_000;
/** Ce qu'on garde d'un géant autour de son point le plus proche du reste de la grappe (demi-largeur, demi-hauteur, degrés). */
const BOITE_GEANT: readonly [number, number] = [8, 6];

/**
 * L'emprise à cadrer pour une grappe (rappel des pays nouveaux) : l'union
 * des polygones principaux de ses pays, sauf les géants, dont on ne garde
 * qu'un morceau, autour du point de leur contour le plus proche des autres :
 * la Russie de l'Europe de l'Est s'étend jusqu'au détroit de Béring, et
 * l'ovale entier s'afficherait avec la Pologne au bord. Un géant reste
 * touchable à l'écran ; ses voisins restent grands. Une grappe de géants
 * seuls : leurs polygones entiers.
 */
export function empriseGrappe(membres: readonly { forme: Forme; pays: Lieu }[]): Emprise | null {
  const emprise = (m: { forme: Forme; pays: Lieu }) => empriseAnneau(anneauPrincipal(m.forme, m.pays.point));
  const petits = membres.filter((m) => m.pays.superficie_km2 < GEANT_KM2);
  const tout = (ms: readonly { forme: Forme; pays: Lieu }[]) => unionEmprises(ms.map(emprise).filter((e): e is Emprise => e !== null));
  const base = tout(petits);
  if (!base) return tout(membres);
  const c = centreEmprise(base);
  const boites: Emprise[] = [base];
  for (const g of membres) {
    if (g.pays.superficie_km2 < GEANT_KM2) continue;
    let mieux: readonly number[] | null = null;
    let d = Infinity;
    for (const p of anneauPrincipal(g.forme, g.pays.point)) {
      const x = geoDistance([p[0] ?? 0, p[1] ?? 0], c);
      if (x < d) {
        d = x;
        mieux = p;
      }
    }
    if (!mieux) continue;
    const [lon, lat] = [mieux[0] ?? 0, mieux[1] ?? 0];
    const [dl, dp] = BOITE_GEANT;
    boites.push([lon - dl < -180 ? lon - dl + 360 : lon - dl, Math.max(-90, lat - dp), lon + dl > 180 ? lon + dl - 360 : lon + dl, Math.min(90, lat + dp)]);
  }
  return unionEmprises(boites);
}
