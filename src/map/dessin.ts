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
// bord coupe l'arc (sous le pixel au zoom 1, les sommets étant serrés). Le
// trait, lui, ne doit pas suivre le bord : tracés comme une frontière, ces
// segments ramenés y dessinaient un trait clair sur toute la bande de
// latitudes du pays, même au-dessus de la mer, qui s'allumait et s'éteignait
// pendant une rotation (le Brésil à r = 145, le Groenland au départ
// Pacifique). En mode « contour », un segment entre deux sommets ramenés sur
// le même bord est sauté, comme une couture.
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
// elle disparaissait pendant le geste et revenait au lâcher. Une partie dont
// la source (la partie de la complète, emprise majorée) fait moins de
// TAILLE_EXACTE_PX, ou dont le contour s'effondre, est donc tracée comme au
// repos : la géométrie de la complète, au seuil du repos (SEUIL_PX). Pendant
// le geste, une petite île montre exactement ce qu'elle montre au repos. Elle
// devenait avant un carré d'un pixel au plus, rempli puis cerclé du trait des
// frontières : au zoom 1, les Kouriles, les Aléoutiennes et l'Arctique
// s'allumaient en petits carrés pendant un glissé (vu au doigt le 06/11 sur
// l'A37), là où le repos ne montre qu'un trait d'un pixel physique. Taches
// du geste (outils/iles_px.py du skill run-terramemo, 16 vues d'archipels par
// zoom) aux zooms 1, 1,5, 2, 3, 4 et 8 : absentes au repos 0, 0, 0, 0, 1, 0
// avant comme après (la tache du zoom 4 est une côte de l'allégée au bord de
// la carte), mais renforcées (plus de deux fois l'encre du repos) 677, 796,
// 851, 848, 737, 397 avec les carrés, aucune ainsi ; aucune tache du repos
// n'y manque pendant le geste. Le comptage d'avant apparie le carré au trait
// (à 1 px CSS près) et ne voyait pas les îles au zoom 1 (il y prenait le
// fond de page pour la mer). Tracé JS de l'allégée au zoom 1 (Node sur le
// PC) : ~0,55 ms par image avant comme après, 12 000 → 25 000 sommets
// parcourus, 7 700 → 10 000 émis. Une partie de moins de TAILLE_MIN_PX
// (emprise majorée) est sautée sans regarder ses sommets : le repos n'en
// montre rien.
import type { Position } from 'geojson';
import type { Forme } from './types';
import { facteurG, normaliserLon, ordonneeBrute, rencontre, type Cadre, type Region, type VueGlobe } from './vue';

const RAD = Math.PI / 180;
/** Écart minimal (px, somme des écarts en x et en y) entre deux sommets tracés : au repos, en mouvement. */
export const SEUIL_PX = 0.5;
export const SEUIL_MOUVEMENT_PX = 1;
/**
 * Pendant un mouvement, une partie dont l'emprise à l'écran (majorée) fait
 * moins de ce côté n'est pas tracée : ses sommets sont à moins de 2 × 0,25 =
 * SEUIL_PX les uns des autres (somme des écarts en x et en y, celle du seuil),
 * si bien qu'au repos tracerPartie n'en émet que le premier et le dernier, le
 * même : ni trait ni aire. À 0,4 px, des îlots qui laissaient au repos un trait
 * de près d'un pixel étaient sautés pendant le geste (une dizaine par vue).
 */
export const TAILLE_MIN_PX = SEUIL_PX / 2;
/**
 * Pendant un mouvement, une partie dont la source (emprise majorée) fait moins
 * de ce côté est tracée comme au repos (géométrie de la complète, SEUIL_PX) :
 * au seuil du mouvement, son contour s'effondrerait.
 */
export const TAILLE_EXACTE_PX = 2;
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
  /**
   * Partie de la carte allégée (simplifiée à 15 km, au pire en triangle) : la
   * partie de la complète qu'elle remplace, que le repos montre ; tracée à sa
   * place pendant un geste quand elle est petite à l'écran (tracerPartie).
   * null ailleurs (calqueLeger).
   */
  source: Partie | null;
  /**
   * Contour extérieur, en px / K : majorant de l'écart (somme des écarts en x
   * et en y) du sommet le plus loin du premier, quelle que soit la place du
   * premier dans l'ovale. En dessous de SEUIL_PX, le repos ne montre pas la
   * partie : parcourir (carte-canvas.ts) l'écarte pendant un geste.
   */
  ecart: number;
  /** Centre de l'emprise : λ (radians), G(φ), ordonnée brute ; l'ancre des hachures. */
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
    const ecart = majorerEcart(anneaux[0]);
    return { o, s, e, n, anneaux, points, couture, taille, km, ecart, centre, source: null as Partie | null };
  });
}

/**
 * Pour un contour (triplets λ, G, ordonnée brute), à l'écran au facteur K = 1,
 * le premier sommet à λ'0 (sa longitude depuis le centre de la vue) : un
 * sommet est à x − x0 = (λ − λ0)·G + λ'0·(G − G0), y − y0 = −(Y − Y0). Majorant,
 * sur |λ'0| ≤ π, de l'écart (somme des écarts en x et en y) du sommet le plus
 * loin du premier.
 */
function majorerEcart(a: Float64Array | undefined): number {
  if (!a || a.length < 3) return 0;
  const [l0, g0, y0] = [a[0] as number, a[1] as number, a[2] as number];
  let ecart = 0;
  for (let i = 3; i < a.length; i += 3) {
    const g = a[i + 1] as number;
    ecart = Math.max(ecart, Math.abs(((a[i] as number) - l0) * g) + Math.PI * Math.abs(g - g0) + Math.abs((a[i + 2] as number) - y0));
  }
  return ecart;
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
}

/** Ce qu'une image partage entre toutes les parties tracées, et ses compteurs. */
export interface ImageTrace {
  v: VueGlobe;
  c: Cadre;
  region: Region;
  K: number;
  cx: number;
  y0: number;
  /** Image d'un mouvement : seuil SEUIL_MOUVEMENT_PX, parties minuscules sautées, petites parties tracées comme au repos. */
  mouvement: boolean;
  /** Sommets plus proches du dernier tracé (px) : sautés. */
  seuil: number;
  /**
   * Parties tracées, sommets parcourus, sommets émis (moveTo et lineTo),
   * copies d'un tour, parties tracées comme au repos pendant un mouvement
   * (petites, ou contour effondré), parties trop petites sautées.
   */
  parties: number;
  sommets: number;
  emis: number;
  copies: number;
  exactes: number;
  minuscules: number;
}

export function image(v: VueGlobe, c: Cadre, region: Region, mouvement = false): ImageTrace {
  const seuil = mouvement ? SEUIL_MOUVEMENT_PX : SEUIL_PX;
  return { v, c, region, K: v.k * c.s, cx: c.l / 2, y0: v.k * c.ty + v.y, mouvement, seuil, parties: 0, sommets: 0, emis: 0, copies: 0, exactes: 0, minuscules: 0 };
}

/**
 * Point de l'écran (px CSS) qui suit une entité ou une zone pendant un geste :
 * le centre de l'emprise de sa plus grande partie, dans la copie à moins de
 * 180° du centre de la vue (la rotation décale chaque parallèle de K·Δλ·G(φ),
 * aucune translation unique ne suit toute la carte) ; null sans partie. Les
 * hachures d'une zone contestée s'y ancrent (carte-canvas.ts).
 */
export function ancre(im: ImageTrace, ps: readonly Partie[]): [number, number] | null {
  let p: Partie | undefined;
  for (const q of ps) if (!p || q.taille > p.taille) p = q;
  if (!p) return null;
  const [lc, gc, yc] = p.centre;
  return [im.cx + im.K * (lc + decalageMilieu(p, im.v.r)) * gc, im.y0 - im.K * yc];
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

/** La partie passe-t-elle la coupure (deux copies, sommets ramenés sur le bord) ? Sans allocation (chaque image, chaque partie). */
export function passeCoupure(p: Partie, r: number): boolean {
  const milieu = (p.o + p.e) / 2;
  const d = normaliserLon(milieu - r) - milieu;
  return p.e + d > 180 + EPS || p.o + d < -180 - EPS;
}

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
 * « contour », ce qui n'est pas une frontière est sauté par des moveTo (à
 * tracer seulement : un remplissage fermerait chaque morceau) : les coutures
 * d'une partie, et les segments ramenés sur le bord de l'ovale d'une partie
 * qui passe la coupure. Pendant un mouvement, une partie dont la source fait
 * moins de TAILLE_MIN_PX est sautée ; moins de TAILLE_EXACTE_PX, elle est
 * tracée comme au repos (sa source, au seuil SEUIL_PX), de même qu'une partie
 * dont le contour extérieur, à l'écran, est réduit par les sommets sautés à
 * un segment (moveTo et deux lineTo au plus, sans aire).
 *
 * Deux économies, sans rien changer de ce que l'écran montre :
 * - un sommet à moins du seuil (SEUIL_PX au repos) du dernier tracé est sauté ;
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
  if (!im.mouvement) {
    tracerCopies(ctx, im, p, decalages(p, im.v.r), contour, im.seuil);
    return;
  }
  const q = p.source ?? p;
  if (im.K * q.taille < TAILLE_EXACTE_PX) {
    if (minuscule(im, q)) return;
    if (!contour) im.exactes++;
    tracerCopies(ctx, im, q, decalages(q, im.v.r), contour, SEUIL_PX);
    return;
  }
  const effondrees = tracerCopies(ctx, im, p, decalages(p, im.v.r), contour, im.seuil);
  if (!effondrees) return;
  // Les mêmes copies de la source : les décalages sont tous -r + 360·n (decalages).
  const ds = decalages(q, im.v.r);
  const memes = ds.filter((d) => effondrees.some((e) => Math.abs(e - d) < 1e-9));
  if (!memes.length) return;
  if (!contour) im.exactes++;
  tracerCopies(ctx, im, q, ds, contour, SEUIL_PX, memes);
}

/** Tampon des trois premiers ordres d'un contour extérieur (moveTo 0 ou lineTo 1, x, y), pendant un mouvement. */
const TAMPON = new Float64Array(9);
/** Ordres retenus dans TAMPON (0 à 3) ; -1 : émis directement. */
let tampon = -1;

/** Un ordre (moveTo, ou lineTo si ligne), retenu dans TAMPON tant qu'il y a moins de quatre ordres. */
function emettre(ctx: ContexteTrace, im: ImageTrace, ligne: boolean, x: number, y: number): void {
  if (tampon >= 0) {
    if (tampon < 3) {
      TAMPON[3 * tampon] = ligne ? 1 : 0;
      TAMPON[3 * tampon + 1] = x;
      TAMPON[3 * tampon + 2] = y;
      tampon++;
      return;
    }
    for (let t = 0; t < 9; t += 3) {
      if (TAMPON[t]) ctx.lineTo(TAMPON[t + 1] as number, TAMPON[t + 2] as number);
      else ctx.moveTo(TAMPON[t + 1] as number, TAMPON[t + 2] as number);
    }
    im.emis += 3;
    tampon = -1;
  }
  if (ligne) ctx.lineTo(x, y);
  else ctx.moveTo(x, y);
  im.emis++;
}

/**
 * Trace les copies d'une partie (decalages ds, ou seulement celles de
 * seules) au seuil donné. Pendant un mouvement, au-dessus du seuil du repos,
 * les trois premiers ordres du contour extérieur d'une copie dont le premier
 * sommet est à l'écran (élargi de MARGE_PX) attendent le quatrième : s'il ne
 * vient pas, le contour s'est effondré en un segment (ou un point), rien de
 * la copie n'est émis, et son décalage est rendu (la copie est alors
 * retracée comme au repos) ; null si aucune ne s'effondre. Émis, ce segment
 * entre deux sommets de l'allégée passait jusqu'à un pixel hors du tracé du
 * repos.
 */
function tracerCopies(ctx: ContexteTrace, im: ImageTrace, p: Partie, ds: readonly number[], contour: boolean, seuil: number, seules: readonly number[] = ds): number[] | null {
  const { K, cx, y0 } = im;
  const x0 = -MARGE_PX;
  const x1 = im.c.l + MARGE_PX;
  const yh = -MARGE_PX;
  const yb = im.c.h + MARGE_PX;
  const code = (x: number, y: number) => (x < x0 ? GAUCHE : x > x1 ? DROITE : 0) | (y < yh ? HAUT : y > yb ? BAS : 0);
  // Sommets ramenés sur le bord de l'ovale dès que la partie passe la coupure, même si une seule copie est tracée.
  const borner = ds.length > 1;
  const sauter = contour && (p.couture || borner);
  const PI = Math.PI;
  const attendre = im.mouvement && seuil > SEUIL_PX;
  let effondrees: number[] | null = null;
  im.parties++;
  im.copies += seules.length - 1;
  copies: for (const delta of seules) {
    for (let r = 0; r < p.anneaux.length; r++) {
      const a = p.anneaux[r] as Float64Array;
      const n = a.length;
      if (n < 9) continue;
      im.sommets += n / 3;
      let l0 = (a[0] as number) + delta;
      // Bord de l'ovale où le sommet précédent est ramené : 1 à l'est, -1 à l'ouest, 0 dans l'ovale.
      let bord = 0;
      if (borner) {
        if (l0 > PI) [l0, bord] = [PI, 1];
        else if (l0 < -PI) [l0, bord] = [-PI, -1];
      }
      let lx = cx + K * l0 * (a[1] as number);
      let ly = y0 - K * (a[2] as number);
      // Bords communs au dernier sommet tracé et aux sommets sautés depuis.
      let masque = code(lx, ly);
      tampon = attendre && r === 0 && masque === 0 ? 0 : -1;
      emettre(ctx, im, false, lx, ly);
      // Contour : crayon levé sur ce qui n'est pas une frontière ; le moveTo
      // attend le prochain trait (la copie ramenée sur le bord de la Russie ou
      // de l'Antarctique : des milliers de sommets, aucun moveTo).
      let leve = false;
      let attente = false;
      let ax = 0;
      let ay = 0;
      for (let i = 3; i < n; i += 3) {
        let lp = (a[i] as number) + delta;
        let b = 0;
        if (borner) {
          if (lp > PI) [lp, b] = [PI, 1];
          else if (lp < -PI) [lp, b] = [-PI, -1];
        }
        const x = cx + K * lp * (a[i + 1] as number);
        const y = y0 - K * (a[i + 2] as number);
        if (sauter) {
          const memeLon = a[i] === a[i - 3] && Math.abs(a[i] as number) >= Math.PI - EPS;
          const memePole = a[i + 2] === a[i - 1] && Math.abs(a[i + 2] as number) >= Y_POLE - EPS;
          // Deux sommets ramenés sur le même bord : le segment suit le bord, au-delà de la coupure.
          const memeBord = b !== 0 && b === bord;
          bord = b;
          if (memeLon || memePole || memeBord) {
            leve = true;
            lx = x;
            ly = y;
            masque = code(x, y);
            attente = false;
            continue;
          }
          if (leve) {
            emettre(ctx, im, false, lx, ly);
            leve = false;
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
          emettre(ctx, im, true, ax, ay);
          lx = ax;
          ly = ay;
          attente = false;
        }
        if (i < n - 3 && Math.abs(x - lx) + Math.abs(y - ly) < seuil) continue;
        emettre(ctx, im, true, x, y);
        lx = x;
        ly = y;
        masque = cd;
      }
      if (attente) emettre(ctx, im, true, ax, ay);
      if (tampon >= 0) {
        // Effondré : ni ce contour ni ses trous (plus petits encore).
        (effondrees ??= []).push(delta);
        tampon = -1;
        continue copies;
      }
    }
  }
  return effondrees;
}

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
