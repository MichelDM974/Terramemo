// Fiche d'un lieu jamais pendant une partie (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.8 et § 7) : une seule
// liste des barres de partie, que la règle de carte.css cite telle quelle.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BARRES_PARTIE, barrePartieVisible } from '../src/vues/commun';
import { El, installerDom } from './dom-factice';

describe('une seule liste des barres de partie', () => {
  it('la règle de carte.css qui efface la recherche cite exactement BARRES_PARTIE, dans son ordre', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    const regles = css.split('}').filter((r) => /\.recherche\s*\{\s*visibility:\s*hidden/.test(r));
    expect(regles).toHaveLength(1);
    const cites = [...regles[0]!.matchAll(/#([\w-]+):not\(\[hidden\]\)/g)].map((m) => m[1]);
    expect(cites).toEqual([...BARRES_PARTIE]);
  });

  describe('barrePartieVisible', () => {
    beforeEach(() => installerDom());
    afterEach(() => vi.unstubAllGlobals());

    it('vrai dès qu’une barre de la liste est affichée, faux sinon (absente ou cachée)', () => {
      const barres = new Map<string, El>();
      const doc = { getElementById: (id: string) => barres.get(id) ?? null } as unknown as Document;
      expect(barrePartieVisible(doc)).toBe(false);
      for (const id of BARRES_PARTIE) {
        const b = new El('div');
        b.hidden = true;
        barres.set(id, b);
      }
      expect(barrePartieVisible(doc)).toBe(false);
      for (const id of BARRES_PARTIE) {
        barres.get(id)!.hidden = false;
        expect(barrePartieVisible(doc), id).toBe(true);
        barres.get(id)!.hidden = true;
      }
      // Une barre hors de la liste (celle de l'accueil) ne compte pas.
      const accueil = new El('div');
      barres.set('barre-carte', accueil);
      expect(barrePartieVisible(doc)).toBe(false);
    });
  });
});
