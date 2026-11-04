// Pastilles des petits pays : un disque de taille constante à l'écran, avec une
// cible invisible de 44 px (taille de toucher minimale usuelle).
import type { GeoProjection } from 'd3-geo';
import { RAYON_TERRE_KM, versEcran } from './geo';
import type { Entite, Pays, Transfo } from './types';

export const PASTILLE = {
  /** Rayon du disque visible (px CSS) : 7 px de diamètre, lisible sans couvrir les Caraïbes. */
  rayon_visible_px: 3.5,
  /** Rayon de la cible invisible : 44 px de diamètre. */
  rayon_cible_px: 22,
  /** Sous cette taille à l'écran (côté du carré de même aire que le plus grand polygone), pastille. */
  seuil_px: 10,
  /**
   * Un micro-État (pays.json) garde sa pastille tant que sa forme n'atteint pas
   * la taille de la cible : au-delà, la forme se touche seule et la cible
   * empiéterait sur ses voisins (Andorre et Singapour en gardaient une même au
   * zoom maximal).
   */
  micro_jusqua_px: 44,
  /**
   * Le disque n'est dessiné que sous cette taille (ou pour un micro-État) : au-dessus,
   * la forme se voit et la cible reste invisible. Au zoom 1 sur le téléphone, 164 pays
   * ont une cible ; dessiner tous les disques couvrait l'Europe et l'Afrique de points.
   */
  visible_sous_px: 4,
  /**
   * Sur un tracé, un disque dessiné ne gagne que sous le doigt : son rayon
   * visible et ~3 px de marge (le Vatican dans Rome) ; une cible invisible,
   * jamais (pick.ts). Décision « Toucher sur la terre ferme » : ce qu'on voit
   * est ce qui compte. À 11 px, il prenait la moitié de l'Italie au zoom 4 et
   * comptait juste pour Trinité un toucher sur le Venezuela.
   */
  rayon_sur_trace_px: 6.5,
} as const;

/** Statuts qui reçoivent une pastille : ceux qu'on demandera de toucher. */
const AVEC_PASTILLE = new Set(['jouable', 'optionnel']);

/**
 * Taille à l'écran (px) du plus grand polygone. Equal Earth conserve les aires :
 * aire projetée = stéradians × échelle² (vérifié à 1e-4 près sur les données).
 */
export function tailleEcranPx(pays: Pays, echelle: number, k: number): number {
  return (Math.sqrt(pays.partie_max_km2) / RAYON_TERRE_KM) * echelle * k;
}

export function aPastille(pays: Pays, echelle: number, k: number): boolean {
  if (!AVEC_PASTILLE.has(pays.statut)) return false;
  const taille = tailleEcranPx(pays, echelle, k);
  return taille < PASTILLE.seuil_px || (pays.micro && taille < PASTILLE.micro_jusqua_px);
}

/** Une pastille : son pays et son centre en coordonnées de base (zoom 1). */
export interface Pastille {
  id: string;
  bx: number;
  by: number;
  /** Disque dessiné (sinon cible seule). */
  visible: boolean;
}

export function calculerPastilles(entites: readonly Entite[], proj: GeoProjection, k: number): Pastille[] {
  const echelle = proj.scale();
  const res: Pastille[] = [];
  for (const { pays } of entites) {
    if (!aPastille(pays, echelle, k)) continue;
    const p = proj(pays.point);
    const visible = pays.micro || tailleEcranPx(pays, echelle, k) < PASTILLE.visible_sous_px;
    if (p) res.push({ id: pays.id, bx: p[0], by: p[1], visible });
  }
  return res;
}

/** La pastille dont la cible contient le point ; si plusieurs, la plus proche du doigt. */
export function pastilleLaPlusProche(
  pastilles: readonly Pastille[],
  t: Transfo,
  x: number,
  y: number,
  rayon: number = PASTILLE.rayon_cible_px,
): { id: string; distance_px: number } | null {
  let meilleure: { id: string; distance_px: number } | null = null;
  for (const p of pastilles) {
    const [ex, ey] = versEcran(t, p.bx, p.by);
    const d = Math.hypot(ex - x, ey - y);
    if (d <= rayon && (!meilleure || d < meilleure.distance_px)) meilleure = { id: p.id, distance_px: d };
  }
  return meilleure;
}
