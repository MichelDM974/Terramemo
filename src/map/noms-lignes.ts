// Les noms des lignes de repère (#11) : une couche de texte au-dessus de la
// carte (div.lignes-noms dans son hôte), la même pour les rendus canvas, webgl,
// g et css. Posés à l'arrêt seulement (placerNoms, lignes.ts), cachés pendant
// un geste ou un vol (décision « Critère de saccade » : rien à recalculer ni à
// repeindre par image). Sous l'en-tête, les barres des parties et la légende,
// frères de l'hôte posés après lui : un nom ne les couvre jamais. Les
// pastilles et les anneaux sont des obstacles : un nom qui les chevaucherait
// est sauté.
import { NOM, type NomPose } from './lignes';

export class CoucheNoms {
  private readonly el: HTMLDivElement;
  private readonly spans: HTMLSpanElement[] = [];
  private readonly largeurs = new Map<string, number>();
  private mesure: CanvasRenderingContext2D | null | undefined;

  constructor(hote: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'lignes-noms';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    hote.append(this.el);
  }

  /** Largeur (px CSS) d'un nom à la police de .ligne-nom, mesurée une fois ; sans Canvas 2D, une estimation. */
  largeur(texte: string): number {
    const deja = this.largeurs.get(texte);
    if (deja !== undefined) return deja;
    if (this.mesure === undefined) {
      try {
        const span = document.createElement('span');
        span.className = 'ligne-nom';
        this.el.append(span);
        const police = getComputedStyle(span).font;
        span.remove();
        this.mesure = document.createElement('canvas').getContext('2d');
        if (this.mesure && police) this.mesure.font = police;
      } catch {
        this.mesure = null;
      }
    }
    const m = this.mesure?.measureText?.(texte).width;
    const w = Math.ceil(typeof m === 'number' && m > 0 ? m : texte.length * 0.6 * NOM.hauteur) + 1;
    this.largeurs.set(texte, w);
    return w;
  }

  /** Les noms à leur place (les autres retirés) ; la couche se montre. */
  poser(noms: readonly NomPose[]): void {
    while (this.spans.length < noms.length) {
      const s = document.createElement('span');
      s.className = 'ligne-nom';
      this.el.append(s);
      this.spans.push(s);
    }
    while (this.spans.length > noms.length) this.spans.pop()?.remove();
    noms.forEach((n, i) => {
      const s = this.spans[i] as HTMLSpanElement;
      if (s.textContent !== n.texte) s.textContent = n.texte;
      s.dataset.ligne = n.id;
      s.style.transform = `translate(${Math.round(n.x)}px, ${Math.round(n.y)}px)`;
    });
    this.el.dataset.noms = String(noms.length);
    this.el.hidden = !noms.length;
  }

  /** Pendant un geste ou un vol : rien de montré (les noms restent prêts). */
  cacher(): void {
    this.el.hidden = true;
  }

  detruire(): void {
    this.el.remove();
  }
}
