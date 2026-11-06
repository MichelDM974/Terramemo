// Toucher (Localiser) : quitter la vue pendant une question puis y revenir
// garde ses essais, son « Voir » et sa distance au premier faux (ticket #16,
// défaut 2). La vue tourne sur un faux DOM minimal (l'environnement des tests
// est node) : juste ce que vueEssai et vueNommer touchent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pays } from '../src/map/types';
import type { ContexteVue, Vue } from '../src/vues/commun';
import { vueEssai } from '../src/vues/essai';

class El {
  enfants: (El | string)[] = [];
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  className = '';
  hidden = false;
  disabled = false;
  private texte: string | null = null;
  private ecoutes = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  get id(): string {
    return this.attrs.get('id') ?? '';
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = v;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  append(...e: (El | string)[]): void {
    this.texte = null;
    this.enfants.push(...e);
  }
  replaceChildren(...e: (El | string)[]): void {
    this.texte = null;
    this.enfants = [...e];
  }
  set textContent(v: string) {
    this.enfants = [];
    this.texte = v;
  }
  get textContent(): string {
    return this.texte ?? this.enfants.map((e) => (typeof e === 'string' ? e : e.textContent)).join('');
  }
  classList = {
    toggle: (c: string, oui?: boolean) => {
      const l = new Set(this.className.split(' ').filter(Boolean));
      if (oui ?? !l.has(c)) l.add(c);
      else l.delete(c);
      this.className = [...l].join(' ');
    },
    add: (c: string) => this.classList.toggle(c, true),
  };
  addEventListener(type: string, f: () => void): void {
    this.ecoutes.set(type, [...(this.ecoutes.get(type) ?? []), f]);
  }
  click(): void {
    for (const f of this.ecoutes.get('click') ?? []) f();
  }
  getBoundingClientRect() {
    return { top: 0, left: 0, width: 400, height: 800 };
  }
  tous(): El[] {
    return [this, ...this.enfants.flatMap((e) => (typeof e === 'string' ? [] : e.tous()))];
  }
  querySelector(sel: string): El | null {
    return this.tous().find((e) => sel.startsWith('#') && e.id === sel.slice(1)) ?? null;
  }
}

const pays = (id: string): Pays =>
  ({ id, statut: 'jouable', superficie_km2: 1e5, partie_max_km2: 1e5, point: [0, 0], bbox: [0, 0, 1, 1], micro: false, voisins: [], continent: 'Europe', sous_region: 'Western Europe' }) as Pays;

/** Le toucher suivant est-il juste ? Les autres répondent faux, à 250 km. */
let justeSuivant = false;

function monter() {
  const zone = new El('main');
  const carte = {
    effacerMarques() {},
    marquer() {},
    anneau() {},
    montrer() {},
    projection: { scale: () => 100 },
    transfo: { k: 1 },
    hote: new El('div'),
    noter: (id: string) => (justeSuivant ? { juste: true, pick: { id }, via: 'forme', distance_km: 0 } : { juste: false, pick: null, distance_km: 250 }),
  };
  const donnees = { entites: [pays('FRA'), pays('ESP')].map((p) => ({ pays: p })), noms: { FRA: 'France', ESP: 'Espagne' } };
  const monde = { nom: 'monde', carte, donnees, jouables: ['FRA', 'ESP'] };
  const ctx = {
    carte,
    donnees,
    zone,
    terrains: { monde, montrer() {}, deja: () => null },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const vue = vueEssai(ctx);
  const el = (f: (e: El) => boolean) => zone.tous().find(f) as El;
  const barre = el((e) => e.id === 'barre-essai');
  return {
    vue,
    serie: (id: string) => el((e) => e.dataset.serie === id),
    retro: barre.tous().find((e) => e.className.startsWith('essai-retro')) as El,
    voir: el((e) => e.id === 'essai-voir'),
    terminer: el((e) => e.id === 'essai-terminer'),
    bilan: el((e) => e.id === 'essai-bilan'),
  };
}

function toucher(vue: Vue, juste: boolean): void {
  justeSuivant = juste;
  vue.toucher?.(10, 10, {} as PointerEvent);
}

describe('Toucher : retour dans la vue pendant une question', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { createElement: (t: string) => new El(t) });
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => {
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
});
