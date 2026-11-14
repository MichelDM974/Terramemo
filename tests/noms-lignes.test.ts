import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoucheNoms } from '../src/map/noms-lignes';

// La couche des noms des lignes de repère (#11) : les largeurs mesurées valent
// jusqu'au chargement d'une police (Inter en font-display: swap).

/** Un élément : assez pour CoucheNoms. */
class Faux {
  className = '';
  hidden = false;
  textContent = '';
  dataset: Record<string, string> = {};
  style = { transform: '' };
  enfants: Faux[] = [];
  parent: Faux | null = null;
  setAttribute() {}
  append(...e: Faux[]) {
    for (const x of e) {
      x.parent = this;
      this.enfants.push(x);
    }
  }
  remove() {
    if (this.parent) this.parent.enfants = this.parent.enfants.filter((x) => x !== this);
    this.parent = null;
  }
  getContext() {
    // Inter, plus large que la police de secours, une fois chargée.
    return { font: '', measureText: (t: string) => ({ width: t.length * (charge ? 7 : 5) }) };
  }
}

let charge = false;

function monter() {
  const ecouteurs = new Map<string, () => void>();
  let pret: () => void = () => undefined;
  const fonts = {
    addEventListener: (t: string, l: () => void) => ecouteurs.set(t, l),
    removeEventListener: (t: string) => ecouteurs.delete(t),
    ready: new Promise<void>((r) => (pret = r)),
  };
  vi.stubGlobal('document', { createElement: () => new Faux(), fonts });
  vi.stubGlobal('getComputedStyle', () => ({ font: '600 10px Inter' }));
  const surPolice = vi.fn();
  const hote = new Faux();
  const noms = new CoucheNoms(hote as unknown as HTMLElement, surPolice);
  return { noms, surPolice, ecouteurs, pret: () => pret(), hote };
}

afterEach(() => {
  charge = false;
  vi.unstubAllGlobals();
});

describe('CoucheNoms : largeurs et police', () => {
  it('une largeur mesurée une fois, refaite quand une police arrive (loadingdone), et les noms reposés', () => {
    const { noms, surPolice, ecouteurs } = monter();
    expect(noms.largeur('Équateur')).toBe(8 * 5 + 1);
    charge = true;
    expect(noms.largeur('Équateur')).toBe(41); // gardée
    ecouteurs.get('loadingdone')?.();
    expect(surPolice).toHaveBeenCalledTimes(1);
    expect(noms.largeur('Équateur')).toBe(8 * 7 + 1);
  });

  it('fonts.ready : de même ; rien à refaire si rien n’a été mesuré, ni après detruire', async () => {
    const a = monter();
    a.pret();
    await Promise.resolve();
    expect(a.surPolice).not.toHaveBeenCalled();
    const b = monter();
    b.noms.largeur('30° N');
    b.pret();
    await Promise.resolve();
    expect(b.surPolice).toHaveBeenCalledTimes(1);
    b.noms.largeur('30° N');
    b.noms.detruire();
    expect(b.ecouteurs.has('loadingdone')).toBe(false);
    expect(b.hote.enfants).toEqual([]);
  });

  it('sans document.fonts (vieux navigateur, tests) : aucune erreur', () => {
    vi.stubGlobal('document', { createElement: () => new Faux() });
    vi.stubGlobal('getComputedStyle', () => ({ font: '' }));
    const noms = new CoucheNoms(new Faux() as unknown as HTMLElement);
    expect(noms.largeur('abc')).toBe(16);
  });
});
