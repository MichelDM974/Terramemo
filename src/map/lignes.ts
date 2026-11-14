// Lignes de repère (#11, décision « Lignes de repère » du 14/11) : équateur,
// méridien de Greenwich, tropiques, cercles polaires et grille de 30°, cochés
// dans ⚙. Pur (sans DOM) : la géométrie, le tracé de la carte qui tourne et la
// place des noms ; le DOM des noms est dans noms-lignes.ts.
//
// Equal Earth tournée autour de l'axe des pôles sépare les variables (vue.ts) :
// à l'écran, X = cx + K·λ'·G(φ) et Y = y0 − K·y(φ), λ' la longitude depuis le
// méridien central. Un parallèle y est donc un segment horizontal, d'un bord de
// l'ovale à l'autre (deux sommets suffisent, au Canvas comme en WebGL), et un
// méridien une courbe d'un pôle à l'autre, qui suit la rotation par λ' seul.
// Le même repère (K, cx, y0, r) décrit la carte SVG (projection fixe, zoom de
// d3-zoom) : repere() le tire d'une transformation et d'une projection.
//
// Les lignes ne sont que du dessin : ni pick ni noter ne les voient (elles ne
// sont pas dans ContexteCarte), le toucher et la notation restent ceux d'avant.
import { geoEqualEarthRaw, type GeoProjection } from 'd3-geo';
import type { Position } from 'geojson';
import type { ContexteTrace } from './dessin';
import type { Transfo } from './types';
import { facteurG, normaliserLon, ordonneeBrute } from './vue';

const RAD = Math.PI / 180;

/** Les cases de ⚙, dans leur ordre : une case par sorte de ligne (les deux tropiques ensemble, les deux cercles polaires ensemble). */
export type ChoixLigne = 'equateur' | 'greenwich' | 'tropiques' | 'polaires' | 'grille';
export const CHOIX_LIGNES: readonly ChoixLigne[] = ['equateur', 'greenwich', 'tropiques', 'polaires', 'grille'];

/** Latitude des tropiques et des cercles polaires (degrés, ± ; obliquité de l'écliptique arrondie au centième). */
export const LAT_TROPIQUES = 23.44;
export const LAT_POLAIRES = 66.56;
/** Pas de la grille (degrés) : parallèles à ±30 et ±60 et l'équateur (pôles exclus), 12 méridiens. */
export const PAS_GRILLE = 30;

export type SorteLigne = 'parallele' | 'meridien';

export interface LigneRepere {
  /** « equateur », « cancer »… ; ceux de la grille : « p30 », « p-60 », « m-150 », « m180 ». */
  id: string;
  sorte: SorteLigne;
  /** Latitude d'un parallèle, longitude d'un méridien (degrés, ]-180, 180]). */
  deg: number;
  /** Ce qu'affiche la carte : « Équateur », « Tropique du Cancer », « 30° N », « 60° E »… */
  nom: string;
  grille: boolean;
}

/** Les textes des noms (textes.lignes.noms et .degres, textes.fr.json) : {n} reçoit les degrés. */
export interface TextesLignes {
  noms: Record<'equateur' | 'greenwich' | 'cancer' | 'capricorne' | 'arctique' | 'antarctique', string>;
  degres: Record<'nord' | 'sud' | 'est' | 'ouest' | 'zero' | 'oppose', string>;
}

/** « 30° N », « 60° S », « 120° E », « 150° O », « 0° », « 180° ». */
export function nomDegres(sorte: SorteLigne, deg: number, t: TextesLignes['degres']): string {
  const n = Math.abs(deg);
  if (n === 0) return t.zero;
  if (sorte === 'meridien' && n === 180) return t.oppose;
  const modele = sorte === 'parallele' ? (deg > 0 ? t.nord : t.sud) : deg > 0 ? t.est : t.ouest;
  return modele.replace('{n}', String(n));
}

/**
 * Les lignes des cases cochées, dans l'ordre où leurs noms se posent (les
 * nommées d'abord, parallèles puis Greenwich : un nom de la grille qui
 * gênerait le leur est sauté).
 * L'équateur ou Greenwich coché, la grille ne redouble pas sa ligne de 0°.
 */
export function lignesDe(choix: Iterable<ChoixLigne>, t: TextesLignes): LigneRepere[] {
  const c = new Set(choix);
  const res: LigneRepere[] = [];
  const nommee = (id: keyof TextesLignes['noms'], sorte: SorteLigne, deg: number) => res.push({ id, sorte, deg, nom: t.noms[id], grille: false });
  if (c.has('equateur')) nommee('equateur', 'parallele', 0);
  if (c.has('tropiques')) {
    nommee('cancer', 'parallele', LAT_TROPIQUES);
    nommee('capricorne', 'parallele', -LAT_TROPIQUES);
  }
  if (c.has('polaires')) {
    nommee('arctique', 'parallele', LAT_POLAIRES);
    nommee('antarctique', 'parallele', -LAT_POLAIRES);
  }
  // Greenwich après les parallèles : au zoom 1, son nom sous la ligne du pôle nord couvrirait celui du cercle arctique ; il passe alors en bas.
  if (c.has('greenwich')) nommee('greenwich', 'meridien', 0);
  if (c.has('grille')) {
    for (let lat = 90 - PAS_GRILLE; lat > -90; lat -= PAS_GRILLE) {
      if (lat === 0 && c.has('equateur')) continue;
      res.push({ id: `p${lat}`, sorte: 'parallele', deg: lat, nom: nomDegres('parallele', lat, t.degres), grille: true });
    }
    for (let lon = -180 + PAS_GRILLE; lon <= 180; lon += PAS_GRILLE) {
      if (lon === 0 && c.has('greenwich')) continue;
      res.push({ id: `m${lon}`, sorte: 'meridien', deg: lon, nom: nomDegres('meridien', lon, t.degres), grille: true });
    }
  }
  return res;
}

/**
 * Lignes qui passent dans l'emprise [ouest, sud, est, nord] (degrés ; ouest >
 * est : à cheval sur l'antiméridien) : une carte locale (l'île de La Réunion)
 * ne dessine que celles-là, aucune si elle n'en croise pas.
 */
export function lignesQuiCroisent(lignes: readonly LigneRepere[], [o, s, e, n]: readonly [number, number, number, number]): LigneRepere[] {
  return lignes.filter((l) => {
    if (l.sorte === 'parallele') return l.deg >= s && l.deg <= n;
    const lon = normaliserLon(l.deg);
    return o <= e ? lon >= o && lon <= e : lon >= o || lon <= e;
  });
}

/** L'emprise [ouest, sud, est, nord] de zones qui ne passent pas l'antiméridien (les communes d'une île). */
export function empriseDesLieux(lieux: readonly { bbox: readonly [number, number, number, number] }[]): [number, number, number, number] {
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { bbox } of lieux) {
    o = Math.min(o, bbox[0]);
    s = Math.min(s, bbox[1]);
    e = Math.max(e, bbox[2]);
    n = Math.max(n, bbox[3]);
  }
  return [o, s, e, n];
}

/** Une ligne en coordonnées [λ, φ], pour geoPath (rendus SVG) : un sommet par degré, d3 coupe à l'antiméridien. */
export function coordonnees(l: LigneRepere): Position[] {
  const pts: Position[] = [];
  if (l.sorte === 'parallele') for (let lon = -180; lon <= 180; lon++) pts.push([lon, l.deg]);
  else for (let lat = -90; lat <= 90; lat++) pts.push([l.deg, lat]);
  return pts;
}

/**
 * Le repère de l'écran (px CSS) : X = cx + K·λ'·G(φ), Y = y0 − K·y(φ), λ'
 * (radians) la longitude depuis le méridien central r (degrés).
 */
export interface Repere {
  K: number;
  cx: number;
  y0: number;
  r: number;
  l: number;
  h: number;
}

/**
 * Repère d'une carte en Equal Earth tournée seulement en longitude : écran = k ×
 * base + (x, y), base = proj (CarteCanvas : transfo et projection de la vue ;
 * Carte SVG : celles de d3-zoom et du monde, « pacifique » centrée sur 150° E).
 */
export function repere(t: Transfo, proj: GeoProjection, l: number, h: number): Repere {
  const [tx, ty] = proj.translate();
  return { K: t.k * proj.scale(), cx: t.x + t.k * tx, y0: t.y + t.k * ty, r: -proj.rotate()[0], l, h };
}

const Y_POLE = ordonneeBrute(90);

/** Latitude (degrés) d'une ordonnée brute, bornée aux pôles. */
function latitude(yr: number): number {
  const b = Math.max(-Y_POLE, Math.min(Y_POLE, yr));
  return (geoEqualEarthRaw.invert?.(0, b)[1] ?? 0) / RAD;
}

/** Bande de latitudes [sud, nord] que l'écran (élargi de marge px) montre ; null si l'ovale en est sorti. */
export function bandeVisible(rep: Repere, marge: number): [number, number] | null {
  const haut = (rep.y0 + marge) / rep.K;
  const bas = (rep.y0 - rep.h - marge) / rep.K;
  if (haut < -Y_POLE || bas > Y_POLE) return null;
  return [latitude(bas), latitude(haut)];
}

/** Sommets d'un méridien sur la bande visible : assez pour qu'une corde reste sous le dixième de pixel. */
export const PAS_MERIDIEN = 64;

/**
 * Trace les lignes (sans beginPath ni trait) au Canvas 2D : un parallèle en un
 * segment, coupé à l'écran élargi de marge ; un méridien en PAS_MERIDIEN cordes
 * sur la bande visible (au zoom 400, la bande ne fait que quelques degrés).
 * Un méridien sur le bord de l'ovale (λ' = ±180°) est tracé sur les deux bords.
 */
export function tracerLignes(ctx: ContexteTrace, rep: Repere, lignes: readonly LigneRepere[], marge: number): void {
  const bande = bandeVisible(rep, marge);
  if (!bande || !lignes.length) return;
  const [sud, nord] = bande;
  const { K, cx, y0 } = rep;
  let gs: Float64Array | null = null;
  let ys: Float64Array | null = null;
  const gMax = facteurG(sud > 0 ? sud : nord < 0 ? nord : 0);
  const gMin = facteurG(Math.max(Math.abs(sud), Math.abs(nord)));
  for (const l of lignes) {
    if (l.sorte === 'parallele') {
      if (l.deg < sud || l.deg > nord) continue;
      const y = y0 - K * ordonneeBrute(l.deg);
      const demi = K * Math.PI * facteurG(l.deg);
      const x0 = Math.max(cx - demi, -marge);
      const x1 = Math.min(cx + demi, rep.l + marge);
      if (x1 <= x0) continue;
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      continue;
    }
    const lp = normaliserLon(l.deg - rep.r);
    for (const b of Math.abs(lp) >= 180 - 1e-9 ? [Math.PI, -Math.PI] : [lp * RAD]) {
      // Hors de l'écran sur toute la bande : x est monotone en G, compris entre ses deux extrêmes.
      const xa = cx + K * b * gMax;
      const xb = cx + K * b * gMin;
      if (Math.max(xa, xb) < -marge || Math.min(xa, xb) > rep.l + marge) continue;
      if (!gs || !ys) {
        gs = new Float64Array(PAS_MERIDIEN + 1);
        ys = new Float64Array(PAS_MERIDIEN + 1);
        for (let i = 0; i <= PAS_MERIDIEN; i++) {
          const phi = nord - (i * (nord - sud)) / PAS_MERIDIEN;
          gs[i] = facteurG(phi);
          ys[i] = y0 - K * ordonneeBrute(phi);
        }
      }
      for (let i = 0; i <= PAS_MERIDIEN; i++) {
        const x = cx + K * b * (gs[i] as number);
        if (i === 0) ctx.moveTo(x, ys[i] as number);
        else ctx.lineTo(x, ys[i] as number);
      }
    }
  }
}

/** Un rectangle de l'écran (px CSS). */
export interface Boite {
  x: number;
  y: number;
  l: number;
  h: number;
}

/** Un nom posé : sa ligne, son texte, et sa boîte (coin haut gauche). */
export interface NomPose extends Boite {
  id: string;
  texte: string;
}

/** Hauteur d'un nom (px CSS : la ligne de .ligne-nom, carte.css), écart à sa ligne, retrait du bord, marge entre deux noms. */
export const NOM = { hauteur: 12, ecart: 2, retrait: 6, espace: 3 } as const;

const chevauche = (a: Boite, b: Boite, m: number) => a.x < b.x + b.l + m && b.x < a.x + a.l + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

/**
 * Où poser les noms, à l'arrêt : celui d'un parallèle au-dessus de lui, au bord
 * gauche de sa partie visible, sinon au bord droit ; celui d'un méridien centré
 * sur lui, sous le haut de sa partie visible (le bord de l'écran, ou la ligne
 * du pôle nord), sinon au-dessus du bas (le bord, ou la ligne du pôle sud),
 * sinon juste sous l'équateur (au zoom 1 sur le téléphone, les cercles polaires
 * passent à une quinzaine de pixels des pôles : leurs noms y prennent la place).
 * Dans l'ordre des lignes (les nommées d'abord), la première place libre : un
 * nom qui chevaucherait partout un autre ou un obstacle (pastille, anneau), ou
 * sortirait de l'écran ou de l'ovale, est sauté. largeur : px CSS d'un texte
 * (mesurée par le DOM).
 */
export function placerNoms(rep: Repere, lignes: readonly LigneRepere[], largeur: (texte: string) => number, obstacles: readonly Boite[] = []): NomPose[] {
  const { K, cx, y0 } = rep;
  const H = NOM.hauteur;
  const poses: NomPose[] = [];
  const demiOvale = (phi: number) => K * Math.PI * facteurG(phi);
  const libre = (b: Boite) =>
    b.x >= 0 && b.y >= 0 && b.x + b.l <= rep.l && b.y + b.h <= rep.h && !poses.some((p) => chevauche(p, b, NOM.espace)) && !obstacles.some((o) => chevauche(o, b, 1));
  const nord = y0 - K * Y_POLE;
  const sud = y0 + K * Y_POLE;
  for (const l of lignes) {
    const w = largeur(l.nom);
    const places: Boite[] = [];
    if (l.sorte === 'parallele') {
      const y = y0 - K * ordonneeBrute(l.deg) - NOM.ecart - H;
      const demi = demiOvale(l.deg);
      const gauche = Math.max(cx - demi, 0) + NOM.retrait;
      const droite = Math.min(cx + demi, rep.l) - NOM.retrait;
      if (gauche + w <= droite) places.push({ x: gauche, y, l: w, h: H }, { x: droite - w, y, l: w, h: H });
    } else {
      const lp = normaliserLon(l.deg - rep.r);
      if (Math.abs(lp) < 179) {
        for (const haut of [Math.max(nord, 0) + NOM.ecart, Math.min(sud, rep.h) - NOM.ecart - H, y0 + NOM.ecart]) {
          if (haut < nord || haut + H > sud) continue;
          const phi = latitude((y0 - haut - H / 2) / K);
          const x = cx + K * lp * RAD * facteurG(phi);
          const demi = demiOvale(phi);
          if (x - w / 2 >= cx - demi && x + w / 2 <= cx + demi) places.push({ x: x - w / 2, y: haut, l: w, h: H });
        }
      }
    }
    const b = places.find(libre);
    if (b) poses.push({ id: l.id, texte: l.nom, ...b });
  }
  return poses;
}
