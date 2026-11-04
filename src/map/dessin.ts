// Tracé de la carte qui tourne dans un contexte Canvas 2D (pur : le contexte
// n'est qu'une suite de moveTo/lineTo, un enregistreur le remplace en test).
//
// La carte se retrace à chaque image : il faut aller vite. Equal Earth tournée
// autour de l'axe des pôles sépare les variables (vue.ts) : on précalcule pour
// chaque sommet λ (radians), G(φ) et l'ordonnée brute, et une image ne coûte
// plus que deux multiplications-additions par sommet :
//   X = l/2 + K·(λ + Δ)·G,  Y = Y0 − K·y,  K = k·s.
// Une partie que la coupure de la vue (le méridien opposé au centre)
// traverse est tracée deux fois, décalée d'un tour ; dans chaque copie, un
// sommet au-delà de ±180° du centre est ramené sur le bord de l'ovale, sur
// son parallèle (λ' borné à ±π). Ramener ainsi un contour sur le bord ne
// change pas le remplissage dans l'ovale (pour un point de l'ovale, le nombre
// de tours du contour ne change pas pendant qu'on le ramène), et rien ne
// déborde : les cordes entre deux points du bord restent dans l'ovale, qui
// est convexe. Seul écart : la corde entre deux sommets voisins ramenés sur le
// bord coupe l'arc (sous le pixel au zoom 1, les sommets étant serrés).
// geoPath de d3 découpait 30 fois plus lentement (rotation, découpe et
// rééchantillonnage de chaque sommet de l'Antarctique et de la Russie à chaque
// image : 8 ms sur le PC au zoom 1) ; un clip de l'ovale coûtait un tiers des
// images perdues au processeur ralenti 4× (rastérisation logicielle du PC).
//
// Ne sont tracées que les parties (polygones) dont l'emprise rencontre la
// région visible (vue.regionVisible) ; un sommet à moins de SEUIL_PX du
// précédent tracé est sauté (au zoom 1, des milliers de sommets tombent dans
// le même pixel).
//
// Pendant un mouvement (sommets sautés sous SEUIL_MOUVEMENT_PX), une île de
// moins d'un pixel ou deux se réduisait à un segment ou à un point, sans aire :
// elle disparaissait pendant le geste et revenait au lâcher. Une partie de
// moins de TAILLE_POINT_PX (emprise majorée, sans parcourir ses sommets) ou
// dont le contour s'effondre devient donc un point (tracerPoint). Une partie
// trop petite pour se voir même au repos (moins de TAILLE_MIN_PX) est sautée.
// Au zoom 1, la carte allégée trace ainsi ~950 points (les îles de 0,4 à
// 2 px) : sur le PC (chargé par ailleurs, chiffres bruités), son image passe
// de 0,8 à 1,0 ms de script, de 2,4-3,5 à 4 ms au processeur ralenti 4×.
import type { Position } from 'geojson';
import type { Forme } from './types';
import { facteurG, normaliserLon, ordonneeBrute, rencontre, type Cadre, type Region, type VueGlobe } from './vue';

const RAD = Math.PI / 180;
/** Écart minimal (px, somme des écarts en x et en y) entre deux sommets tracés : au repos, en mouvement. */
export const SEUIL_PX = 0.5;
export const SEUIL_MOUVEMENT_PX = 1;
/**
 * Pendant un mouvement, une partie dont l'emprise à l'écran (majorée) fait
 * moins de ce côté n'est pas tracée : au repos, ses sommets tombent à moins de
 * SEUIL_PX les uns des autres et son tracé n'a pas d'aire non plus.
 */
export const TAILLE_MIN_PX = 0.4;
/** Pendant un mouvement, une partie de moins de ce côté (emprise majorée) est un point. */
export const TAILLE_POINT_PX = 2;
/** Marge autour de l'écran (px) : région visible et sommets hors de l'écran (traits, cordes entre sommets). */
export const MARGE_PX = 4;
/** Pas du contour de l'ovale : nombre de segments par bord sur la bande visible. */
const PAS_OVALE = 64;
const EPS = 1e-9;

export interface Partie {
  /** Emprise en degrés (ouest ≤ est : Natural Earth coupe ses polygones à ±180°). */
  o: number;
  s: number;
  e: number;
  n: number;
  /** Par anneau : triplets (λ en radians, G(φ), ordonnée brute). */
  anneaux: Float64Array[];
  points: number;
  /**
   * Côté de l'emprise à l'écran au facteur K = 1 (px / K), majoré : écart de
   * longitude × G le plus grand sur la bande, plus le cisaillement d'Equal
   * Earth au bord de l'ovale (π × écart de G), ou hauteur.
   */
  taille: number;
  /** Plus grand côté de l'emprise en km (longitudes × cos de la latitude moyenne) : la carte allégée prend les îles en dessous dans la complète. */
  km: number;
  /** Centre de l'emprise : λ (radians), G(φ), ordonnée brute ; le point d'un contour effondré. */
  centre: [number, number, number];
  /**
   * Des côtés de la partie suivent l'antiméridien ou un pôle : coutures de
   * Natural Earth (la Russie et les Fidji coupées à 180°, l'Antarctique
   * refermé par le pôle). Une fois la carte tournée, elles passent au milieu
   * de l'ovale : remplies, mais jamais tracées comme une frontière.
   */
  couture: boolean;
}

function estCouture(a: Position, b: Position): boolean {
  const [la, pa] = [a[0] ?? 0, a[1] ?? 0];
  const [lb, pb] = [b[0] ?? 0, b[1] ?? 0];
  if (Math.abs(la) >= 180 - EPS && la === lb) return true;
  return Math.abs(pa) >= 90 - EPS && pa === pb;
}

/**
 * Les parties d'une forme, précalculées ; marge (px / K) : ajoutée à leur
 * taille (carte allégée, carte-canvas.ts). Toutes les parties ont la même
 * forme d'objet : des copies étendues ({ ...p }) en donnaient une seconde, et
 * le tracé de chaque image, devenu polymorphe, coûtait le double.
 */
export function preparer(forme: Forme, marge = 0): Partie[] {
  const g = forme.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((coordinates) => {
    let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    let points = 0;
    let couture = false;
    const anneaux = coordinates.map((anneau: Position[]) => {
      const a = new Float64Array(anneau.length * 3);
      anneau.forEach((p, i) => {
        const lon = p[0] ?? 0;
        const lat = p[1] ?? 0;
        if (lon < o) o = lon;
        if (lon > e) e = lon;
        if (lat < s) s = lat;
        if (lat > n) n = lat;
        a[3 * i] = lon * RAD;
        a[3 * i + 1] = facteurG(lat);
        a[3 * i + 2] = ordonneeBrute(lat);
        const prec = anneau[i - 1];
        if (prec && estCouture(prec, p)) couture = true;
      });
      points += anneau.length;
      return a;
    });
    const km = etendueKm(o, s, e, n);
    // Un polygone qui fait le tour du globe (l'Antarctique) entoure le pôle.
    if (e - o > 359) {
      if (s < -60) s = -90;
      if (n > 60) n = 90;
    }
    const gMax = facteurG(s > 0 ? s : n < 0 ? n : 0);
    const gMin = facteurG(Math.max(Math.abs(s), Math.abs(n)));
    const taille = Math.max((e - o) * RAD * gMax + Math.PI * (gMax - gMin), Math.abs(ordonneeBrute(n) - ordonneeBrute(s))) + marge;
    const phi = (s + n) / 2;
    const centre: [number, number, number] = [((o + e) / 2) * RAD, facteurG(phi), ordonneeBrute(phi)];
    return { o, s, e, n, anneaux, points, couture, taille, km, centre };
  });
}

/**
 * Plus grand côté (km) d'une emprise en degrés : même calcul que
 * geodata/build.mjs (etendueKm), qui ne met dans la carte allégée que les
 * polygones d'au moins ILE_LEGERE_KM (carte-canvas.ts).
 */
export function etendueKm(o: number, s: number, e: number, n: number): number {
  return Math.max((e - o) * Math.cos(((s + n) / 2) * RAD), n - s) * KM_PAR_DEGRE;
}
const KM_PAR_DEGRE = 111.2;

/** Ce que le tracé demande d'un contexte (CanvasRenderingContext2D en a davantage). */
export interface ContexteTrace {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  /** Sous-chemin fermé d'un rectangle (Path2D.rect) : les points des contours effondrés. */
  rect(x: number, y: number, l: number, h: number): void;
}

/** Ce qu'une image partage entre toutes les parties tracées, et ses compteurs. */
export interface ImageTrace {
  v: VueGlobe;
  c: Cadre;
  region: Region;
  K: number;
  cx: number;
  y0: number;
  /** Image d'un mouvement : seuil SEUIL_MOUVEMENT_PX, parties minuscules sautées, contours effondrés en points. */
  mouvement: boolean;
  /** Sommets plus proches du dernier tracé (px) : sautés. */
  seuil: number;
  /** Parties tracées, sommets parcourus, sommets émis (moveTo et lineTo), copies d'un tour, points, parties trop petites sautées. */
  parties: number;
  sommets: number;
  emis: number;
  copies: number;
  points: number;
  minuscules: number;
  /** Par chemin, pixels (x + 65 536 · y) qui ont un point dans cette image : 1, ou PIXEL_PLEIN s'il les couvre tous (tracerPoint). */
  pixels: Map<ContexteTrace, Map<number, number>>;
}

export function image(v: VueGlobe, c: Cadre, region: Region, mouvement = false): ImageTrace {
  const seuil = mouvement ? SEUIL_MOUVEMENT_PX : SEUIL_PX;
  return { v, c, region, K: v.k * c.s, cx: c.l / 2, y0: v.k * c.ty + v.y, mouvement, seuil, parties: 0, sommets: 0, emis: 0, copies: 0, points: 0, minuscules: 0, pixels: new Map() };
}

/** Décalage (radians) qui met le milieu d'une partie à moins de 180° du centre. */
function decalageMilieu(p: Partie, r: number): number {
  const milieu = (p.o + p.e) / 2;
  return (normaliserLon(milieu - r) - milieu) * RAD;
}

/**
 * Décalages (radians) des copies d'une partie : celui qui met son milieu à
 * moins de 180° du centre, plus un tour si elle déborde de l'ovale d'un côté.
 */
export function decalages(p: Partie, r: number): number[] {
  const milieu = (p.o + p.e) / 2;
  const d = normaliserLon(milieu - r) - milieu;
  const res = [d * RAD];
  if (p.e + d > 180 + EPS) res.push((d - 360) * RAD);
  if (p.o + d < -180 - EPS) res.push((d + 360) * RAD);
  return res;
}

/** La partie passe-t-elle la coupure (deux copies, sommets ramenés sur le bord) ? */
export const passeCoupure = (p: Partie, r: number): boolean => decalages(p, r).length > 1;

/** Partie sautée pendant un mouvement : moins de TAILLE_MIN_PX (comptée dans im.minuscules). */
export function minuscule(im: ImageTrace, p: Partie): boolean {
  if (!im.mouvement || im.K * p.taille >= TAILLE_MIN_PX) return false;
  im.minuscules++;
  return true;
}

export function visible(im: ImageTrace, p: { o: number; s: number; e: number; n: number }): boolean {
  return rencontre(p.o, p.s, p.e, p.n, im.region);
}

// Codes de position d'un point par rapport à l'écran élargi de MARGE_PX (Cohen-Sutherland).
const GAUCHE = 1;
const DROITE = 2;
const HAUT = 4;
const BAS = 8;

/**
 * Trace une partie visible (sans beginPath ni remplissage). En mode
 * « contour », les coutures d'une partie sont sautées par des moveTo (à
 * tracer seulement : un remplissage fermerait chaque morceau). Pendant un
 * mouvement, une partie de moins de TAILLE_MIN_PX est sautée ; une partie de
 * moins de TAILLE_POINT_PX, ou dont le contour extérieur est réduit par les
 * sommets sautés à moins de trois sommets (sans aire), devient un point
 * (tracerPoint).
 *
 * Deux économies, sans rien changer de ce que l'écran montre :
 * - un sommet à moins de SEUIL_PX du dernier tracé est sauté ;
 * - une suite de sommets tous au-delà d'un même bord de l'écran (élargi de
 *   MARGE_PX) est remplacée par son premier et son dernier : la corde et la
 *   suite restent dans le même demi-plan hors de l'écran, le remplissage à
 *   l'écran ne change pas (zoomé sur Moscou, le reste de la Russie ne coûte
 *   que quelques sommets).
 * On revient au premier sommet par lineTo, jamais closePath, qui coûtait
 * 20 µs dans Chrome (Path2D, chrome-headless-shell 153 : 87 ms par image au
 * zoom 1 pour 4 500 anneaux, contre 3 ms de tracé).
 */
export function tracerPartie(ctx: ContexteTrace, im: ImageTrace, p: Partie, contour = false): void {
  const { K, cx, y0, seuil } = im;
  const x0 = -MARGE_PX;
  const x1 = im.c.l + MARGE_PX;
  const yh = -MARGE_PX;
  const yb = im.c.h + MARGE_PX;
  const code = (x: number, y: number) => (x < x0 ? GAUCHE : x > x1 ? DROITE : 0) | (y < yh ? HAUT : y > yb ? BAS : 0);
  if (im.mouvement && K * p.taille < TAILLE_POINT_PX) {
    if (!minuscule(im, p)) tracerPoint(ctx, im, p, decalageMilieu(p, im.v.r), x0, x1, yh, yb);
    return;
  }
  const sauter = contour && p.couture;
  const ds = decalages(p, im.v.r);
  const borner = ds.length > 1;
  const PI = Math.PI;
  im.parties++;
  im.copies += ds.length - 1;
  for (const delta of ds) {
    for (let r = 0; r < p.anneaux.length; r++) {
      const a = p.anneaux[r] as Float64Array;
      const n = a.length;
      if (n < 9) continue;
      im.sommets += n / 3;
      const emis0 = im.emis;
      let l0 = (a[0] as number) + delta;
      if (borner) l0 = l0 > PI ? PI : l0 < -PI ? -PI : l0;
      let lx = cx + K * l0 * (a[1] as number);
      let ly = y0 - K * (a[2] as number);
      ctx.moveTo(lx, ly);
      im.emis++;
      // Bords communs au dernier sommet tracé et aux sommets sautés depuis.
      let masque = code(lx, ly);
      let attente = false;
      let ax = 0;
      let ay = 0;
      for (let i = 3; i < n; i += 3) {
        let lp = (a[i] as number) + delta;
        if (borner) lp = lp > PI ? PI : lp < -PI ? -PI : lp;
        const x = cx + K * lp * (a[i + 1] as number);
        const y = y0 - K * (a[i + 2] as number);
        if (sauter) {
          const memeLon = a[i] === a[i - 3] && Math.abs(a[i] as number) >= Math.PI - EPS;
          const memePole = a[i + 2] === a[i - 1] && Math.abs(a[i + 2] as number) >= Y_POLE - EPS;
          if (memeLon || memePole) {
            ctx.moveTo(x, y);
            im.emis++;
            lx = x;
            ly = y;
            masque = code(x, y);
            attente = false;
            continue;
          }
        }
        const cd = code(x, y);
        if (masque & cd) {
          masque &= cd;
          attente = true;
          ax = x;
          ay = y;
          continue;
        }
        if (attente) {
          ctx.lineTo(ax, ay);
          im.emis++;
          lx = ax;
          ly = ay;
          attente = false;
        }
        if (i < n - 3 && Math.abs(x - lx) + Math.abs(y - ly) < seuil) continue;
        ctx.lineTo(x, y);
        im.emis++;
        lx = x;
        ly = y;
        masque = cd;
      }
      if (attente) {
        ctx.lineTo(ax, ay);
        im.emis++;
      }
      // Contour extérieur effondré (moveTo et deux lineTo au plus : un segment) : un point, s'il est à l'écran.
      if (im.mouvement && r === 0 && im.emis - emis0 <= 3) tracerPoint(ctx, im, p, delta, x0, x1, yh, yb);
    }
  }
}

/**
 * Un carré centré sur le centre de l'emprise d'une partie (copie décalée de
 * delta), du côté de son emprise à l'écran, un pixel (px CSS) au plus, s'il
 * est dans l'écran élargi. Un carré d'un pixel entier rendait les îles de
 * moins d'un pixel plus visibles pendant le geste qu'au repos (Polynésie au
 * zoom 4 : des points qui s'allument au toucher). Un seul point par pixel et
 * par chemin (un pays marqué a le sien) : le second qui tombe dans un pixel
 * le remplit en entier (il couvre les deux centres), les suivants n'ajoutent
 * rien (au zoom 1, des îles par dizaines dans le même pixel).
 */
function tracerPoint(ctx: ContexteTrace, im: ImageTrace, p: Partie, delta: number, x0: number, x1: number, yh: number, yb: number): void {
  const [lc, gc, yc] = p.centre;
  const l = Math.max(-Math.PI, Math.min(Math.PI, lc + delta));
  const x = im.cx + im.K * l * gc;
  const y = im.y0 - im.K * yc;
  if (x < x0 || x > x1 || y < yh || y > yb) return;
  let pixels = im.pixels.get(ctx);
  if (!pixels) im.pixels.set(ctx, (pixels = new Map()));
  const [px, py] = [Math.floor(x), Math.floor(y)];
  const cle = px + 65_536 * py;
  const deja = pixels.get(cle);
  if (deja === PIXEL_PLEIN) return;
  const cote = Math.min(1, im.K * p.taille);
  if (deja === undefined && cote < 1) {
    pixels.set(cle, 1);
    ctx.rect(x - cote / 2, y - cote / 2, cote, cote);
  } else {
    pixels.set(cle, PIXEL_PLEIN);
    ctx.rect(px, py, 1, 1);
  }
  im.emis++;
  im.points++;
}

const PIXEL_PLEIN = 2;
const Y_POLE = ordonneeBrute(90);

/**
 * Contour de l'ovale sur la bande visible (sud → nord) : bord est du nord au
 * sud, bord ouest du sud au nord. Fermé par la ligne du pôle (droite dans
 * Equal Earth) ou par des horizontales hors de l'écran.
 */
export function tracerOvale(ctx: ContexteTrace, im: ImageTrace): void {
  const { K, cx, y0, region } = im;
  if (region.vide) return;
  const pas = (region.nord - region.sud) / PAS_OVALE;
  const bord = (phi: number, cote: number) => [cx + cote * K * Math.PI * facteurG(phi), y0 - K * ordonneeBrute(phi)] as const;
  for (let i = 0; i <= PAS_OVALE; i++) {
    const [x, y] = bord(region.nord - i * pas, 1);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = 0; i <= PAS_OVALE; i++) {
    const [x, y] = bord(region.sud + i * pas, -1);
    ctx.lineTo(x, y);
  }
}
