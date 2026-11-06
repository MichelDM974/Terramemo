// Toucher (Localiser) : quitter la vue pendant une question puis y revenir
// garde ses essais, son « Voir » et sa distance au premier faux (ticket #16,
// défaut 2), et remontre son message et ses marques sur la carte ; la partie
// lancée depuis Jouer, son bilan et les retours vers Jouer (#18, décision
// « Écran Jouer »). La vue tourne sur le DOM factice des tests
// (l'environnement des tests est node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pays } from '../src/map/types';
import type { Lancement } from '../src/vues/arbre';
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
  const versJouer = vi.fn<(cible: string) => void>();
  const vue = vueEssai(ctx, { versJouer });
  const el = (sel: string) => zone.querySelector(sel) as El;
  const retro = el('#barre-essai .essai-retro');
  /** Trouver (ou cet exercice) sur « tous » (FRA, ESP), choisi dans Jouer : la vue s'ouvre, la partie part. */
  const lancer = (l: Partial<Lancement> = {}) => {
    vue.activer();
    vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'tous', mode: 'localiser', ...l }, { id: 'tous', terrain: 'monde', ids: ['FRA', 'ESP'], n: 2 }, monde as never, ['FRA', 'ESP']);
  };
  return {
    vue,
    zone,
    versJouer,
    lancer,
    marques,
    cible: () => el('#barre-essai .essai-consigne').dataset.cible as string,
    retro,
    voir: el('#essai-voir'),
    passer: el('#essai-passer'),
    terminer: el('#essai-terminer'),
    bilan: el('#essai-bilan'),
    barre: el('#barre-essai'),
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
    v.lancer();
    toucher(v.vue, false);
    toucher(v.vue, false);
    v.vue.desactiver();
    v.vue.activer();
    toucher(v.vue, true);
    expect(v.retro.textContent).toContain('3 essais');
  });

  it('garde « Voir » et la distance au premier faux : la note du bilan en dépend', () => {
    const v = monter();
    v.lancer();
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
    v.lancer();
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
    v.lancer();
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
    v.lancer();
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
    v.lancer();
    if (v.cible() !== 'ESP') v.passer.click();
    v.voir.click();
    expect(v.marques).toEqual(['ESP:juste', 'anneau ESP:juste']);
    v.vue.desactiver();
    v.vue.activer();
    expect(v.marques).toEqual(['ESP:juste', 'anneau ESP:juste']);
  });

  it('quitter pendant le « juste » affiché : ni son message ni sa marque à la question suivante', () => {
    const v = monter();
    v.lancer();
    toucher(v.vue, true);
    expect(v.retro.textContent).not.toBe('');
    v.vue.desactiver();
    v.vue.activer();
    expect(v.retro.textContent).toBe('');
    expect(v.marques).toEqual([]);
  });

  it('une nouvelle partie part sans les marques de la précédente', () => {
    const v = monter();
    v.lancer();
    v.voir.click();
    v.terminer.click();
    (v.bilan.querySelector('#essai-recommencer') as El).click();
    v.vue.desactiver();
    v.vue.activer();
    expect(v.marques).toEqual([]);
    expect(v.retro.textContent).toBe('');
  });
});

describe('Toucher : une partie choisie dans Jouer (décision « Écran Jouer »)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
    installerStockage();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('part tout de suite, sans choix de série dans la vue', () => {
    const v = monter();
    v.lancer();
    expect(v.barre.hidden).toBe(false);
    expect(['FRA', 'ESP']).toContain(v.cible());
    expect(v.zone.querySelector('#essai-depart')).toBeNull();
    expect(v.zone.querySelector('.essai-serie')).toBeNull();
    expect(v.vue.redirection?.()).toBeNull();
  });

  it('le bilan : « Recommencer » relance la même série, « Autre série » ramène aux séries de Jouer', () => {
    const v = monter();
    v.lancer();
    v.terminer.click();
    expect(v.bilan.hidden).toBe(false);
    expect(v.bilan.querySelector('h2')?.textContent).toBe('Bilan · Tous les pays');
    (v.bilan.querySelector('#essai-recommencer') as El).click();
    expect(v.bilan.hidden).toBe(true);
    expect(v.barre.hidden).toBe(false);
    expect(v.zone.querySelector('#barre-essai .essai-compte')?.textContent).toBe('1 / 2');
    v.terminer.click();
    (v.bilan.querySelector('#essai-autre') as El).click();
    expect(v.versJouer).toHaveBeenCalledWith('jouer/entrainement/pays');
  });

  it('le bilan revient avec la vue ; sans partie ni bilan, la vue renvoie à Jouer (aux exercices de la série, ou Jouer tout court)', () => {
    const v = monter();
    expect(v.vue.redirection?.()).toEqual({ cible: 'jouer' });
    v.lancer();
    v.terminer.click();
    v.vue.desactiver();
    expect(v.vue.redirection?.()).toBeNull();
    v.vue.activer();
    expect(v.bilan.hidden).toBe(false);
    (v.bilan.querySelector('#essai-autre') as El).click();
    v.vue.desactiver();
    expect(v.vue.redirection?.()).toEqual({ cible: 'jouer/entrainement/pays/tous' });
  });

  it('une autre partie lancée abandonne celle en cours : ni ses essais ni ses marques', () => {
    const v = monter();
    v.lancer();
    toucher(v.vue, false);
    expect(v.marques.length).toBeGreaterThan(0);
    v.vue.desactiver();
    v.lancer();
    expect(v.marques).toEqual([]);
    expect(v.retro.textContent).toBe('');
    toucher(v.vue, true);
    expect(v.retro.textContent).toContain('1 essai ');
  });
});
