// Toucher (Localiser) : quitter la vue pendant une question puis y revenir
// garde ses essais, son « Voir » et sa distance au premier faux (ticket #16,
// défaut 2), et remontre son message et ses marques sur la carte. La vue
// tourne sur le DOM factice des tests (l'environnement des tests est node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pays } from '../src/map/types';
import type { ContexteVue, Vue } from '../src/vues/commun';
import { vueEssai } from '../src/vues/essai';
import { El, installerDom, installerStockage } from './dom-factice';

const pays = (id: string): Pays =>
  ({ id, statut: 'jouable', superficie_km2: 1e5, partie_max_km2: 1e5, point: [0, 0], bbox: [0, 0, 1, 1], micro: false, voisins: [], continent: 'Europe', sous_region: 'Western Europe' }) as Pays;

/** Le toucher suivant est-il juste ? Les autres répondent faux, à 250 km. */
let justeSuivant = false;
/** Un toucher faux désigne-t-il l'autre pays (marqué en rouge) plutôt que la mer ? */
let fauxSurVoisin = false;

function monter() {
  const zone = new El('main');
  /** Ce que la carte montre : « id:classe », « anneau id:classe » pour un anneau. */
  const marques: string[] = [];
  const carte = {
    effacerMarques() {
      marques.length = 0;
    },
    marquer(id: string, classe: string) {
      marques.push(`${id}:${classe}`);
    },
    anneau(id: string, classe: string) {
      marques.push(`anneau ${id}:${classe}`);
    },
    // Le vol de « Voir » : de près, plus rien n'est petit à l'écran.
    montrer() {
      carte.transfo.k = 1e6;
    },
    projection: { scale: () => 100 },
    transfo: { k: 1 },
    hote: new El('div'),
    noter: (id: string) =>
      justeSuivant
        ? { juste: true, pick: { id }, via: 'forme', distance_km: 0 }
        : { juste: false, pick: fauxSurVoisin ? { id: id === 'FRA' ? 'ESP' : 'FRA' } : null, distance_km: 250 },
  };
  // ESP minuscule à l'écran (anneau, comme le Vatican), FRA non.
  const donnees = { entites: [pays('FRA'), { ...pays('ESP'), superficie_km2: 1, partie_max_km2: 1 }].map((p) => ({ pays: p })), noms: { FRA: 'France', ESP: 'Espagne' } };
  const monde = { nom: 'monde', carte, donnees, jouables: ['FRA', 'ESP'] };
  const ctx = {
    carte,
    donnees,
    zone,
    terrains: { monde, montrer() {}, deja: () => null },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const vue = vueEssai(ctx);
  const el = (sel: string) => zone.querySelector(sel) as El;
  const retro = el('#barre-essai .essai-retro');
  return {
    vue,
    marques,
    cible: () => el('#barre-essai .essai-consigne').dataset.cible as string,
    serie: (id: string) => el(`.essai-serie[data-serie="${id}"]`),
    retro,
    voir: el('#essai-voir'),
    passer: el('#essai-passer'),
    terminer: el('#essai-terminer'),
    bilan: el('#essai-bilan'),
  };
}

function toucher(vue: Vue, juste: boolean): void {
  justeSuivant = juste;
  vue.toucher?.(10, 10, {} as PointerEvent);
}

describe('Toucher : retour dans la vue pendant une question', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
    installerStockage();
  });
  afterEach(() => {
    fauxSurVoisin = false;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('garde les essais déjà faits pour la question', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    toucher(v.vue, false);
    toucher(v.vue, false);
    v.vue.desactiver();
    v.vue.activer();
    toucher(v.vue, true);
    expect(v.retro.textContent).toContain('3 essais');
  });

  it('garde « Voir » et la distance au premier faux : la note du bilan en dépend', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    toucher(v.vue, false);
    v.voir.click();
    v.vue.desactiver();
    v.vue.activer();
    toucher(v.vue, true);
    vi.advanceTimersByTime(1200);
    v.terminer.click();
    const bilan = v.bilan.textContent;
    expect(bilan).toContain('0 / 1 justes du premier coup');
    expect(bilan).toContain('2 essais après « Voir »');
    expect(bilan).toContain('premier toucher à 250 km');
  });

  it('une nouvelle question repart de zéro', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    toucher(v.vue, false);
    toucher(v.vue, true);
    vi.advanceTimersByTime(1200);
    v.vue.desactiver();
    v.vue.activer();
    toucher(v.vue, true);
    expect(v.retro.textContent).toContain('1 essai ');
  });

  // Quitter pendant le « juste » affiché (1,2 s) valide la question (validerEnAttente,
  // i++) : la suivante n'hérite ni de ses essais, ni de « Voir », ni de son premier faux.
  it('quitter pendant le « juste » affiché : la question suivante repart de zéro', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    toucher(v.vue, false);
    toucher(v.vue, false);
    v.voir.click();
    toucher(v.vue, true);
    v.vue.desactiver();
    v.vue.activer();
    toucher(v.vue, true);
    expect(v.retro.textContent).toContain('1 essai ');
    vi.advanceTimersByTime(1200);
    v.terminer.click();
    const bilan = v.bilan.textContent;
    expect(bilan).toContain('1 / 2 justes du premier coup');
    expect(bilan.match(/premier toucher à/g)?.length ?? 0).toBe(1);
  });

  it('remontre le message et les marques d’un faux : la zone touchée en rouge, la cible en vert', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    fauxSurVoisin = true;
    toucher(v.vue, false);
    const message = v.retro.textContent;
    const avant = [...v.marques];
    expect(message).toContain('Faux');
    expect(avant).toContain(`${v.cible()}:juste`);
    expect(avant.some((m) => m.endsWith(':faux'))).toBe(true);
    v.vue.desactiver();
    expect(v.marques).toEqual([]);
    v.vue.activer();
    expect(v.retro.textContent).toBe(message);
    expect(v.retro.className).toBe('essai-retro faux');
    expect(v.marques).toEqual(avant);
  });

  // L'anneau tel que posé : rejugé après le vol (zoom), ESP ne serait plus petite et il disparaîtrait.
  it('remontre la cible révélée par « Voir », avec l’anneau posé avant le vol', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    if (v.cible() !== 'ESP') v.passer.click();
    v.voir.click();
    expect(v.marques).toEqual(['ESP:juste', 'anneau ESP:juste']);
    v.vue.desactiver();
    v.vue.activer();
    expect(v.marques).toEqual(['ESP:juste', 'anneau ESP:juste']);
  });

  it('quitter pendant le « juste » affiché : ni son message ni sa marque à la question suivante', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    toucher(v.vue, true);
    expect(v.retro.textContent).not.toBe('');
    v.vue.desactiver();
    v.vue.activer();
    expect(v.retro.textContent).toBe('');
    expect(v.marques).toEqual([]);
  });

  it('une nouvelle partie part sans les marques de la précédente', () => {
    const v = monter();
    v.vue.activer();
    v.serie('tous').click();
    v.voir.click();
    v.terminer.click();
    (v.bilan.querySelector('#essai-recommencer') as El).click();
    v.serie('tous').click();
    v.vue.desactiver();
    v.vue.activer();
    expect(v.marques).toEqual([]);
    expect(v.retro.textContent).toBe('');
  });
});
