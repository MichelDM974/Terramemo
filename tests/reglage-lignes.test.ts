import { describe, expect, it } from 'vitest';
import { CHOIX_LIGNES } from '../src/map/lignes';
import { brancherCasesLignes, CLE_LIGNES, garderReglageLignes, lignesDeLAdresse, lireChoixLignes, lireReglageLignes } from '../src/vues/reglage-lignes';
import { textes } from '../src/vues/textes';

// Les lignes de repère dans ⚙ (#11) : toutes décochées par défaut, le choix
// gardé sur l'appareil (terramemo.lignes) et relu ; ?lignes= pour la page seule.

const T = textes.lignes;

/** Un stockage en mémoire, qui refuse tout si refuser. */
function stockage(refuser = false) {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => {
      if (refuser) throw new Error('refusé');
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (refuser) throw new Error('refusé');
      m.set(k, v);
    },
  };
}

describe('lignes de repère : réglage de ⚙ et ?lignes=', () => {
  it('toutes décochées par défaut ; le choix gardé puis relu (terramemo.lignes), dans l’ordre de ⚙ ; stockage refusé : aucune, sans erreur', () => {
    const s = stockage();
    expect([...lireReglageLignes(s)]).toEqual([]);
    expect([...lireReglageLignes(null)]).toEqual([]);
    garderReglageLignes(s, new Set(['grille', 'equateur']));
    expect(CLE_LIGNES).toBe('terramemo.lignes');
    expect(s.m.get('terramemo.lignes')).toBe('equateur,grille');
    expect([...lireReglageLignes(s)]).toEqual(['equateur', 'grille']);
    garderReglageLignes(s, new Set());
    expect([...lireReglageLignes(s)]).toEqual([]);
    const refus = stockage(true);
    expect(() => garderReglageLignes(refus, new Set(['grille']))).not.toThrow();
    expect([...lireReglageLignes(refus)]).toEqual([]);
  });

  it('?lignes=tout les coche toutes, une liste les siennes (l’inconnu ignoré), ?lignes=0 aucune ; sans paramètre, null (le choix gardé vaut)', () => {
    expect([...(lignesDeLAdresse(new URLSearchParams('lignes=tout')) ?? [])]).toEqual([...CHOIX_LIGNES]);
    expect([...(lignesDeLAdresse(new URLSearchParams('lignes=grille,tropiques,rien')) ?? [])]).toEqual(['tropiques', 'grille']);
    expect([...(lignesDeLAdresse(new URLSearchParams('lignes=0')) ?? ['x'])]).toEqual([]);
    expect(lignesDeLAdresse(new URLSearchParams('mers=demo'))).toBeNull();
    expect([...lireChoixLignes(' Equateur , polaires ')]).toEqual(['equateur', 'polaires']);
  });

  it('les cases de ⚙ : un titre, une case par choix (textes.lignes.cases), cochées selon le choix ; un changement rend le nouveau choix', () => {
    const elements: Record<string, unknown>[] = [];
    const element = (tag: string) => {
      const e: Record<string, unknown> & { enfants: unknown[]; ecouteurs: Record<string, () => void> } = {
        tag,
        enfants: [],
        ecouteurs: {},
        dataset: {},
        attributs: {},
        append(...x: unknown[]) {
          this.enfants.push(...x);
        },
        replaceChildren(...x: unknown[]) {
          this.enfants = [...x];
        },
        setAttribute(k: string, v: string) {
          (this.attributs as Record<string, string>)[k] = v;
        },
        addEventListener(type: string, f: () => void) {
          this.ecouteurs[type] = f;
        },
      };
      elements.push(e);
      return e;
    };
    const ancien = globalThis.document;
    globalThis.document = { createElement: element } as unknown as Document;
    try {
      const conteneur = element('div');
      const recus: string[][] = [];
      brancherCasesLignes(conteneur as unknown as HTMLElement, T, new Set(['tropiques']), (c) => recus.push([...c]));
      const enfants = conteneur.enfants as Record<string, unknown>[];
      expect(enfants[0]?.textContent).toBe(T.reglage);
      expect(conteneur.title).toBe(T.reglage_detail);
      const cases = elements.filter((e) => e.type === 'checkbox') as (Record<string, unknown> & { ecouteurs: Record<string, () => void> })[];
      expect(cases.map((c) => (c.dataset as Record<string, string>).ligne)).toEqual([...CHOIX_LIGNES]);
      expect(cases.map((c) => c.checked)).toEqual([false, false, true, false, false]);
      expect(enfants).toHaveLength(1 + CHOIX_LIGNES.length);
      const grille = cases[4] as (typeof cases)[number];
      grille.checked = true;
      grille.ecouteurs.change?.();
      const tropiques = cases[2] as (typeof cases)[number];
      tropiques.checked = false;
      tropiques.ecouteurs.change?.();
      expect(recus).toEqual([['tropiques', 'grille'], ['grille']]);
      const noms = elements.filter((e) => e.tag === 'span').map((e) => e.textContent);
      for (const c of CHOIX_LIGNES) expect(noms).toContain(T.cases[c]);
    } finally {
      globalThis.document = ancien;
    }
  });
});
