// Seuil entre toucher et déplacer : un geste de déplacement ne compte jamais
// comme une réponse.
import { versBase, versEcran } from './geo';
import type { Transfo } from './types';

export const SEUIL_TOUCHER = {
  deplacement_px: 10,
  duree_ms: 500,
} as const;

export interface BilanPointeurs {
  /** Nombre maximal de doigts posés en même temps pendant le geste. */
  doigts_max: number;
  /** Plus grand écart (px) du premier doigt à son point de départ. */
  deplacement_px: number;
  duree_ms: number;
  /** Le geste a été annulé (pointercancel). */
  annule: boolean;
}

/** Un toucher = un seul doigt, déplacement < 10 px, durée < 500 ms. */
export function estUnToucher(b: BilanPointeurs): boolean {
  return (
    !b.annule &&
    b.doigts_max === 1 &&
    b.deplacement_px < SEUIL_TOUCHER.deplacement_px &&
    b.duree_ms < SEUIL_TOUCHER.duree_ms
  );
}

/** Rend un point de l'écran visé sous la transformation de, dans le repère de vers. */
export type Suivre = (de: Transfo, vers: Transfo, x: number, y: number) => [number, number];

/** Carte plane (SVG) : écran = k × base + (x, y). */
export const suivrePlan: Suivre = (de, vers, x, y) => versEcran(vers, ...versBase(de, x, y));

/**
 * Suit les pointeurs posés et dit, au lever du dernier, si c'était un toucher.
 * Sans DOM : on lui passe les champs des PointerEvent et la transformation de
 * la carte au moment de l'événement ; suivre dit comment un point de la carte
 * se déplace d'une transformation à l'autre (plan en SVG, carte qui tourne en
 * Canvas : vue.suivrePoint).
 */
export class SuiviPointeurs {
  constructor(private readonly suivre: Suivre = suivrePlan) {}

  private actifs = new Set<number>();
  private premier: { id: number; x: number; y: number; t: number; transfo: Transfo | null } | null = null;
  private bilan: BilanPointeurs = { doigts_max: 0, deplacement_px: 0, duree_ms: 0, annule: false };

  bas(id: number, x: number, y: number, t: number, transfo: Transfo | null = null): void {
    if (this.actifs.size === 0) {
      this.premier = { id, x, y, t, transfo: transfo && { ...transfo } };
      this.bilan = { doigts_max: 0, deplacement_px: 0, duree_ms: 0, annule: false };
    }
    this.actifs.add(id);
    this.bilan.doigts_max = Math.max(this.bilan.doigts_max, this.actifs.size);
  }

  bouge(id: number, x: number, y: number): void {
    if (this.premier && id === this.premier.id) {
      const d = Math.hypot(x - this.premier.x, y - this.premier.y);
      this.bilan.deplacement_px = Math.max(this.bilan.deplacement_px, d);
    }
  }

  annule(id: number): void {
    this.bilan.annule = true;
    this.actifs.delete(id);
  }

  /**
   * Au lever d'un doigt : si le geste entier était un toucher, le point de la
   * carte que le doigt visait en se posant, sinon null. Avec les transformations
   * de la pose et du lever, ce point est rendu dans le repère du lever : sous
   * 10 px de glissé, la carte a déjà suivi le doigt (d3-zoom à la souris à
   * chaque mouvement, au doigt au-delà de la tolérance du système ; le Canvas
   * dès le premier mouvement), et le point de l'écran où le doigt s'est posé
   * montrerait jusqu'à 10 px à côté.
   */
  haut(id: number, x: number, y: number, t: number, transfo: Transfo | null = null): { x: number; y: number } | null {
    this.bouge(id, x, y);
    const etaitActif = this.actifs.delete(id);
    if (!etaitActif || this.actifs.size > 0 || !this.premier) return null;
    const premier = this.premier;
    this.bilan.duree_ms = t - premier.t;
    this.premier = null;
    if (id !== premier.id || !estUnToucher(this.bilan)) return null;
    if (!premier.transfo || !transfo) return { x: premier.x, y: premier.y };
    const [x1, y1] = this.suivre(premier.transfo, transfo, premier.x, premier.y);
    return { x: x1, y: y1 };
  }

  dernierBilan(): BilanPointeurs {
    return { ...this.bilan };
  }
}
