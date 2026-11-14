// Toucher (Localiser) : quitter la vue pendant une question puis y revenir
// garde ses essais, son « Voir » et sa distance au premier faux (ticket #16,
// défaut 2), et remontre son message et ses marques sur la carte ; la partie
// lancée depuis Jouer, son bilan et les retours vers Jouer (#18, décision
// « Écran Jouer »). La vue tourne sur le DOM factice des tests
// (l'environnement des tests est node).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chargerCapitales } from '../src/map/capitales';
import { chargerDrapeaux, drapeauxCharges, oublierDrapeaux } from '../src/map/drapeaux';
import type { Pays } from '../src/map/types';
import type { Lancement } from '../src/vues/arbre';
import type { ContexteVue, Vue } from '../src/vues/commun';
import { vueEssai, type OptionsEssai } from '../src/vues/essai';
import { textes } from '../src/vues/textes';
import { ditsPar, El, installerDom, installerStockage } from './dom-factice';
import { code, FACTICE, sansBrut } from './sujet-factice';

vi.mock('../src/vues/sujets', async (orig) => (await import('./sujet-factice')).avecFactice(await orig()));

const pays = (id: string): Pays =>
  ({ id, statut: 'jouable', superficie_km2: 1e5, partie_max_km2: 1e5, point: [0, 0], bbox: [0, 0, 1, 1], micro: false, voisins: [], continent: 'Europe', sous_region: 'Western Europe' }) as Pays;

/** Le toucher suivant est-il juste ? Les autres répondent faux, à 250 km. */
let justeSuivant = false;
/** Un toucher faux désigne-t-il l'autre pays (marqué en rouge) plutôt que la mer ? */
let fauxSurVoisin = false;
/** La zone admise que noter() rend au prochain toucher juste (Note.admis : zone contestée, enclave). */
let admisSuivant: unknown = null;

/** Les options de chaque appel à noter() (zones admises du sujet, D36 i). */
let optionsNotees: unknown[] = [];

function monter(o: Partial<OptionsEssai> = {}, terrain: { ids: string[]; noms: Record<string, string> } = { ids: ['FRA', 'ESP'], noms: { FRA: 'France', ESP: 'Espagne' } }) {
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
    anneauEn(p: [number, number], classe: string) {
      marques.push(`anneauEn ${p.join(',')}:${classe}`);
    },
    // Le vol de « Voir » : de près, plus rien n'est petit à l'écran.
    montrer() {
      carte.transfo.k = 1e6;
    },
    projection: { scale: () => 100 },
    transfo: { k: 1 },
    hote: new El('div'),
    // Reconnaître : tout est à l'écran, grand, pas de vol.
    contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
    noter: (id: string, _x: number, _y: number, opt?: unknown) => (
      optionsNotees.push(opt),
      justeSuivant
        ? { juste: true, pick: { id }, via: 'forme', distance_km: 0, admis: admisSuivant }
        : { juste: false, pick: fauxSurVoisin ? { id: id === 'FRA' ? 'ESP' : 'FRA' } : null, distance_km: 250 }
    ),
  };
  // ESP minuscule à l'écran (anneau, comme le Vatican), FRA non.
  const donnees = { entites: terrain.ids.map((id) => (id === 'ESP' ? { ...pays('ESP'), superficie_km2: 1, partie_max_km2: 1 } : pays(id))).map((p) => ({ pays: p })), noms: terrain.noms };
  const monde = { nom: 'monde', carte, donnees, jouables: terrain.ids };
  const ctx = {
    carte,
    donnees,
    zone,
    terrains: { monde, montrer() {}, deja: () => null },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const versJouer = vi.fn<(cible: string) => void>();
  const vue = vueEssai(ctx, { versJouer, ...o });
  const el = (sel: string) => zone.querySelector(sel) as El;
  const retro = el('#barre-essai .essai-retro');
  /** Trouver (ou cet exercice) sur « tous » (FRA, ESP), choisi dans Jouer : la vue s'ouvre, la partie part. */
  const lancer = (l: Partial<Lancement> = {}) => {
    vue.activer();
    vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'tous', mode: 'localiser', ...l }, { id: 'tous', terrain: 'monde', ids: terrain.ids, n: terrain.ids.length }, monde as never, terrain.ids);
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
    admisSuivant = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('juste dans une zone admise : la rétroaction dit pourquoi (zone contestée tenue par un autre, enclave)', () => {
    const v = monter();
    v.lancer();
    const cible = v.cible();
    const autre = cible === 'FRA' ? 'ESP' : 'FRA';
    admisSuivant = { zone: 'NE_B89', tenant: autre, sorte: 'contestee' };
    toucher(v.vue, true);
    expect(v.retro.textContent).toMatch(new RegExp(`^Juste \\(zone contestée, tenue par ${autre === 'FRA' ? 'la France' : "l'Espagne"}\\) · 1 essai`));
    vi.advanceTimersByTime(1200);
    admisSuivant = { zone: autre, tenant: autre, sorte: 'enclave' };
    toucher(v.vue, true);
    expect(v.retro.textContent).toMatch(new RegExp(`^Juste \\(enclave : ${autre === 'FRA' ? 'France' : 'Espagne'}\\)`));
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
    expect(v.vue.aMontrer?.()).toBe(true);
    expect(v.vue.redirection?.()).toBeNull();
    v.vue.activer();
    expect(v.bilan.hidden).toBe(false);
    (v.bilan.querySelector('#essai-autre') as El).click();
    v.vue.desactiver();
    expect(v.vue.aMontrer?.()).toBe(false);
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

  it('le journal de la partie libre reçoit le Lancement de la partie (son sujet : le domaine des fiches, étude J2 § 6.5), au départ comme à « Recommencer »', () => {
    const libre = vi.fn<NonNullable<OptionsEssai['libre']>>(() => null);
    const v = monter({ libre });
    v.lancer({ sujet: 'communes', serie: 'reunion' });
    expect(libre).toHaveBeenCalledTimes(1);
    expect(libre.mock.calls[0]![0]).toEqual({ branche: 'entrainement', sujet: 'communes', serie: 'reunion', mode: 'localiser' });
    v.terminer.click();
    (v.zone.querySelector('#essai-recommencer') as El).click();
    expect(libre).toHaveBeenCalledTimes(2);
    expect(libre.mock.calls[1]![0]).toMatchObject({ sujet: 'communes' });
  });
});

// --- Séance (J1a) : Toucher piloté par la séance, quitté puis repris -------

import type { FabriqueSeances, PiloteSeance, QuestionPilotee, ReponseJouee } from '../src/vues/essai';

const IDS5 = ['FRA', 'ESP', 'ITA', 'DEU', 'BEL'];

/** Une séance écrite d'avance : ces questions, dans l'ordre ; ce qu'elle reçoit. */
function piloteFactice(questions: QuestionPilotee[]) {
  const recues: ReponseJouee[] = [];
  let i = 0;
  let connus = 0;
  let finie = false;
  const p: PiloteSeance = {
    question: () => (finie ? null : (questions[i] ?? null)),
    compte: () => `${i + 1} / ${questions.length}`,
    repondre: (r) => {
      recues.push(r);
      i++;
      return r.correct ? 'Revient dans 3 j' : "À revoir aujourd'hui";
    },
    connu: () => void (connus++, i++),
    terminer: () => void (finie = true),
    bilan: (el, actions) => {
      const c = new El('button');
      c.id = 'seance-continuer';
      c.addEventListener('click', actions.continuer);
      const a = new El('button');
      a.id = 'essai-autre';
      a.addEventListener('click', actions.autre);
      (el as unknown as El).replaceChildren(`bilan : ${recues.length} réponses`, c, a);
    },
  };
  return { p, recues, connus: () => connus };
}

function monterSeance(ouvrir: FabriqueSeances['ouvrir']) {
  const zone = new El('main');
  const marques: string[] = [];
  const appels: string[] = [];
  const carte = {
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: () => undefined,
    montrer: () => void appels.push('montrer'),
    zoomer: (t: { k: number }) => void appels.push(`zoomer ${t.k}`),
    cadrer: (e: number[]) => void appels.push(`cadrer ${e.join(',')}`),
    contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
    projection: { scale: () => 100 },
    transfo: { k: 2 },
    hote: new El('div'),
    noter: (id: string) => (justeSuivant ? { juste: true, pick: { id }, via: 'trace', distance_km: 0 } : { juste: false, pick: { id: 'ESP' }, via: null, distance_km: 250 }),
  };
  const donnees = { entites: IDS5.map((id, k) => ({ pays: { ...pays(id), point: [k, 45], voisins: IDS5.filter((x) => x !== id) } })), noms: { FRA: 'France', ESP: 'Espagne', ITA: 'Italie', DEU: 'Allemagne', BEL: 'Belgique' } };
  const monde = { nom: 'monde', carte, donnees, jouables: IDS5 };
  const ctx = {
    carte,
    donnees,
    zone,
    terrains: { monde, montrer() {}, deja: () => null },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const versCarte = vi.fn();
  const fabrique = { ouvrir: vi.fn(ouvrir) };
  const versJouer = vi.fn<(cible: string) => void>();
  const vue = vueEssai(ctx, { versJouer, versCarte, seances: fabrique });
  const visible = (id: string) => !(zone.querySelector(`#${id}`) as El).hidden;
  return { vue, zone, monde, appels, marques, fabrique, versCarte, versJouer, visible, el: (s: string) => zone.querySelector(s) as El };
}

describe('Toucher : une séance quittée puis reprise', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
    installerStockage();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const QUESTIONS: QuestionPilotee[] = [
    { id: 'FRA', forme: 'trouver', cadrer: 'monde', connu: false },
    { id: 'ITA', forme: 'qcm', cadrer: null, connu: true },
    { id: 'DEU', forme: 'retournee', cadrer: null, connu: false },
    { id: 'BEL', forme: 'trouver', cadrer: [0, 40, 10, 50], connu: false },
  ];

  it('Trouver, QCM, carte retournée : chaque forme reprise telle quelle, une réponse par question, puis le bilan', () => {
    const f = piloteFactice(QUESTIONS);
    const s = monterSeance(() => f.p);
    s.vue.activer();
    s.vue.reviser();
    // Trouver : le monde entier d'abord (cadrage de la séance), sa consigne et le compte de la séance.
    expect(s.appels).toEqual(['zoomer 1']);
    expect(s.visible('barre-essai')).toBe(true);
    expect(s.el('#barre-essai .essai-compte').textContent).toBe('1 / 4');
    expect(s.vue.redirection?.()).toBeNull();
    toucher(s.vue, false);
    s.vue.desactiver();
    s.vue.activer();
    toucher(s.vue, true);
    expect(f.recues).toHaveLength(1);
    expect(f.recues[0]).toMatchObject({ id: 'FRA', sens: 'localiser', correct: false, reponse: 'ESP', distance_km: 250, zoom: 2 });
    expect(s.el('#barre-essai .essai-retro').textContent).toContain("À revoir aujourd'hui");
    // Quittée pendant le « juste » : la réponse ne repart pas, la question suivante vient au retour.
    s.vue.desactiver();
    s.vue.activer();
    expect(f.recues).toHaveLength(1);
    expect(s.visible('barre-nommer')).toBe(true);
    expect(s.visible('barre-essai')).toBe(false);
    const cible = () => s.el('#barre-nommer .essai-consigne').dataset.cible;
    expect(cible()).toBe('ITA');
    expect(s.visible('nommer-connu')).toBe(true);
    // Quittée au QCM : la même question au retour ; « Je connais déjà » la saute.
    s.vue.desactiver();
    s.vue.activer();
    expect(cible()).toBe('ITA');
    s.el('#nommer-connu').click();
    expect(f.connus()).toBe(1);
    expect(f.recues).toHaveLength(1);
    // Carte retournée : quittée révélée, reprise révélée ; « Je savais ».
    expect(s.visible('barre-retournee')).toBe(true);
    expect(s.el('#barre-retournee .essai-consigne').dataset.cible).toBe('DEU');
    expect(s.el('.retournee-reponses').hidden).toBe(true);
    s.el('#retournee-reveler').click();
    s.vue.desactiver();
    expect(s.vue.aMontrer?.()).toBe(true);
    s.vue.activer();
    expect(s.el('.retournee-nom').textContent).toBe('Allemagne');
    expect(s.el('.retournee-reponses').hidden).toBe(false);
    s.el('#retournee-savais').click();
    expect(f.recues[1]).toMatchObject({ id: 'DEU', sens: 'nommer', correct: true });
    expect(s.el('#barre-retournee .essai-retro').textContent).toBe('Revient dans 3 j');
    // Quittée pendant sa ligne : la suivante au retour, cadrée sur sa grappe.
    s.vue.desactiver();
    s.vue.activer();
    expect(s.visible('barre-essai')).toBe(true);
    expect(s.appels.at(-1)).toMatch(/^cadrer 0,40,10,50/);
    toucher(s.vue, true);
    vi.advanceTimersByTime(1200);
    // File vide : le bilan de la séance, qui revient avec la vue ; « Continuer » en relance une.
    expect(f.recues).toHaveLength(3);
    expect(s.visible('essai-bilan')).toBe(true);
    expect(s.el('#essai-bilan').textContent).toContain('bilan : 3 réponses');
    s.vue.desactiver();
    expect(s.vue.aMontrer?.()).toBe(true);
    s.vue.activer();
    expect(s.visible('essai-bilan')).toBe(true);
    s.el('#seance-continuer').click();
    expect(s.fabrique.ouvrir).toHaveBeenCalledTimes(2);
    expect(s.fabrique.ouvrir.mock.calls[1]![0]).toEqual({ sorte: 'revision' });
  });

  it('« Terminer » : le bilan tout de suite, les réponses données comptent', () => {
    const f = piloteFactice(QUESTIONS);
    const s = monterSeance(() => f.p);
    s.vue.activer();
    s.vue.reviser();
    toucher(s.vue, true);
    vi.advanceTimersByTime(1200);
    s.el('#nommer-terminer').click();
    expect(s.visible('essai-bilan')).toBe(true);
    expect(s.visible('barre-nommer')).toBe(false);
    expect(s.el('#essai-bilan').textContent).toContain('bilan : 1 réponses');
  });

  it('« Terminer » après un toucher faux ou « Voir », avant de trouver : la question compte (raté), une seule fois', () => {
    for (const aide of ['faux', 'voir'] as const) {
      const f = piloteFactice(QUESTIONS);
      const s = monterSeance(() => f.p);
      s.vue.activer();
      s.vue.reviser();
      if (aide === 'faux') toucher(s.vue, false);
      else s.el('#essai-voir').click();
      s.el('#essai-terminer').click();
      expect(s.visible('essai-bilan')).toBe(true);
      expect(f.recues).toHaveLength(1);
      expect(f.recues[0]).toMatchObject({ id: 'FRA', sens: 'localiser', correct: false, aide: aide === 'voir' ? 'voir' : 'passer' });
    }
    // Rien répondu : rien de rapporté ; juste encore affiché : rapporté une fois.
    const f = piloteFactice(QUESTIONS);
    const s = monterSeance(() => f.p);
    s.vue.activer();
    s.vue.reviser();
    s.el('#essai-terminer').click();
    expect(f.recues).toHaveLength(0);
    const g = piloteFactice(QUESTIONS);
    const t = monterSeance(() => g.p);
    t.vue.activer();
    t.vue.reviser();
    toucher(t.vue, true);
    t.el('#essai-terminer').click();
    expect(g.recues).toHaveLength(1);
    expect(g.recues[0]!.correct).toBe(true);
  });

  it('bilan de séance, « Autre série » : Entraînement pour la Révision du jour, les séries de Jouer pour Apprendre', () => {
    const s = monterSeance(() => piloteFactice(QUESTIONS).p);
    s.vue.activer();
    s.vue.reviser();
    s.el('#essai-terminer').click();
    s.el('#essai-bilan #essai-autre').click();
    expect(s.versJouer).toHaveBeenLastCalledWith('jouer/entrainement');
    expect(s.visible('essai-bilan')).toBe(false);
    const serie = { id: 'Europe', terrain: 'monde' as const, ids: IDS5, n: 5 };
    s.vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'apprendre' }, serie, {} as never, IDS5);
    s.el('#essai-terminer').click();
    s.el('#essai-bilan #essai-autre').click();
    expect(s.versJouer).toHaveBeenLastCalledWith('jouer/entrainement/pays');
  });

  it('Apprendre refusé (grappe du jour faite) : le dire ; « Trouver » lance la série, « Réviser » la révision', () => {
    const s = monterSeance((d) => (d.sorte === 'apprendre' ? { refus: 'La grappe du jour est déjà apprise : la suivante demain.', reviser: 3 } : piloteFactice(QUESTIONS).p));
    s.vue.activer();
    const serie = { id: 'Europe', terrain: 'monde' as const, ids: IDS5, n: 5 };
    s.vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'apprendre' }, serie, {} as never, IDS5);
    expect(s.visible('essai-bilan')).toBe(true);
    expect(s.el('#essai-bilan').innerText).toContain('Apprendre · Europe');
    expect(s.el('#essai-bilan').innerText).toContain('déjà apprise');
    expect(s.el('#seance-reviser').textContent).toBe('Réviser · 3');
    s.el('#seance-trouver').click();
    expect(s.visible('barre-essai')).toBe(true);
    expect(s.el('#barre-essai .essai-compte').textContent).toBe('1 / 5');
    s.vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'apprendre' }, serie, {} as never, IDS5);
    s.el('#seance-reviser').click();
    expect(s.fabrique.ouvrir.mock.calls.at(-1)![0]).toEqual({ sorte: 'revision' });
    expect(s.visible('barre-essai')).toBe(true);
  });

  it('Apprendre sous La Réunion : la séance demandée porte le sujet du Lancement (communes), jamais tiré du terrain (étude J2 § 6.5)', () => {
    const s = monterSeance(() => piloteFactice(QUESTIONS).p);
    s.vue.activer();
    const serie = { id: 'reunion', terrain: 'reunion' as const, ids: ['97411', '97415'], n: 2 };
    s.vue.lancer({ branche: 'entrainement', sujet: 'communes', serie: 'reunion', mode: 'apprendre' }, serie, {} as never, serie.ids);
    expect(s.fabrique.ouvrir).toHaveBeenCalledTimes(1);
    expect(s.fabrique.ouvrir.mock.calls[0]![0]).toEqual({ sorte: 'apprendre', sujet: 'communes', serie });
    const europe = { id: 'Europe', terrain: 'monde' as const, ids: IDS5, n: 5 };
    s.vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'apprendre' }, europe, {} as never, IDS5);
    expect(s.fabrique.ouvrir.mock.calls.at(-1)![0]).toEqual({ sorte: 'apprendre', sujet: 'pays', serie: europe });
  });

  it('Apprendre refusé (grappe du jour entamée ailleurs) : « Les finir » lance la Révision du jour', () => {
    const s = monterSeance((d) => (d.sorte === 'apprendre' ? { refus: 'Les pays voisins commencés aujourd’hui (Europe) ne sont pas finis : ils passent avant.', reviser: 0, finir: 3 } : piloteFactice(QUESTIONS).p));
    s.vue.activer();
    const serie = { id: 'Africa', terrain: 'monde' as const, ids: IDS5, n: 5 };
    s.vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Africa', mode: 'apprendre' }, serie, {} as never, IDS5);
    expect(s.el('#essai-bilan').innerText).toContain('ne sont pas finis');
    expect(s.el('#seance-finir').textContent).toBe('Les finir · 3');
    expect(s.el('#seance-trouver').className).toBe('secondary');
    s.el('#seance-finir').click();
    expect(s.fabrique.ouvrir.mock.calls.at(-1)![0]).toEqual({ sorte: 'revision' });
    expect(s.visible('barre-essai')).toBe(true);
  });
});

describe('Toucher : une séance qui passe sur l’île (communes, D6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
    installerStockage();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function carteFactice(nom: string, notees: string[]) {
    return {
      effacerMarques() {},
      marquer() {},
      anneau() {},
      montrer() {},
      zoomer() {},
      cadrer() {},
      projection: { scale: () => 100 },
      transfo: { k: 1 },
      hote: new El('div'),
      noter: (id: string) => (notees.push(`${nom}:${id}`), { juste: true, pick: { id }, via: 'trace', distance_km: 0, admis: null }),
    };
  }

  function monterIle(o: { echec?: boolean } = {}) {
    const zone = new El('main');
    const notees: string[] = [];
    const montres: string[] = [];
    const monde = { nom: 'monde', carte: carteFactice('monde', notees), donnees: { entites: [{ pays: pays('FRA') }], noms: { FRA: 'France' } }, jouables: ['FRA'] };
    const ile = { nom: 'reunion', carte: carteFactice('reunion', notees), donnees: { entites: [{ pays: pays('97411') }], noms: { '97411': 'Saint-Denis' } }, jouables: ['97411'] };
    let chargee = false;
    const charger = vi.fn(() => (o.echec ? Promise.reject(new Error('hors ligne')) : ((chargee = true), Promise.resolve(ile))));
    const ctx = {
      carte: monde.carte,
      donnees: monde.donnees,
      zone,
      terrains: { monde, montrer: (n: string) => void montres.push(n), deja: (n: string) => (n === 'reunion' && chargee ? ile : n === 'monde' ? monde : null), charger },
      mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
    } as unknown as ContexteVue;
    const f = piloteFactice([
      { id: 'FRA', forme: 'trouver', cadrer: 'monde', connu: false, terrain: 'monde' },
      { id: '97411', forme: 'trouver', cadrer: 'monde', connu: false, terrain: 'reunion' },
      // La grappe de pays nouveaux après le bloc des communes (Révision du jour) : de retour sur le monde.
      { id: 'FRA', forme: 'trouver', cadrer: 'monde', connu: false, terrain: 'monde' },
    ]);
    const fabrique = { ouvrir: vi.fn(() => f.p), charger: vi.fn(() => (chargee ? null : ctx.terrains.charger('reunion'))) };
    const vue = vueEssai(ctx, { versJouer: vi.fn(), seances: fabrique });
    return { vue, zone, notees, montres, charger, fabrique, f, el: (s: string) => zone.querySelector(s) as El };
  }

  it('l’île chargée d’abord (dit dans le panneau), puis les pays sur le monde, les communes sur l’île, la grappe de pays de retour sur le monde', async () => {
    const s = monterIle();
    s.vue.activer();
    s.vue.reviser();
    expect(s.charger).toHaveBeenCalledWith('reunion');
    expect(s.el('#essai-bilan').hidden).toBe(false);
    expect(s.el('#essai-bilan').innerText).toBe(textes.toucher.chargement_terrain);
    expect(s.fabrique.ouvrir).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.fabrique.ouvrir).toHaveBeenCalledTimes(1);
    expect(s.el('#essai-bilan').hidden).toBe(true);
    expect(s.el('#barre-essai .essai-consigne').innerText).toContain('France');
    justeSuivant = true;
    s.vue.toucher?.(1, 1, {} as PointerEvent);
    vi.advanceTimersByTime(1200);
    expect(s.montres.at(-1)).toBe('reunion');
    expect(s.el('#barre-essai .essai-consigne').innerText).toContain('Saint-Denis');
    // Quittée puis reprise : la question de l'île revient sur l'île.
    s.vue.desactiver();
    expect(s.montres.at(-1)).toBe('monde');
    s.vue.activer();
    expect(s.montres.at(-1)).toBe('reunion');
    s.vue.toucher?.(1, 1, {} as PointerEvent);
    vi.advanceTimersByTime(1200);
    expect(s.montres.at(-1)).toBe('monde');
    s.vue.toucher?.(1, 1, {} as PointerEvent);
    expect(s.notees).toEqual(['monde:FRA', 'reunion:97411', 'monde:FRA']);
  });

  it('l’île hors ligne : la séance part quand même (sans ses communes, que la séance ne pose pas)', async () => {
    const s = monterIle({ echec: true });
    s.vue.activer();
    s.vue.reviser();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.fabrique.ouvrir).toHaveBeenCalledTimes(1);
  });

  it('une séance lancée pendant le chargement de l’île remplace la précédente : une seule ouverte', async () => {
    const s = monterIle();
    s.vue.activer();
    s.vue.reviser();
    s.vue.reviser();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.fabrique.ouvrir).toHaveBeenCalledTimes(1);
  });
});

// --- Rendu par sujet (étude J2 § 5.1) : Trouver, Reconnaître, carte retournée et bilans par le rendu du sujet ---

describe('Toucher : le rendu du sujet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
    installerStockage();
  });
  afterEach(() => {
    fauxSurVoisin = false;
    admisSuivant = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const NOMS_FE: Record<string, string> = { FRA: 'France', ESP: 'Espagne' };

  it('pays et communes : « Touche : » et le nom, la suite d’un faux de leur sujet, le bilan par le nom', () => {
    for (const [sujet, suite] of [
      ['pays', 'Le bon pays est en vert : touche-le.'],
      ['communes', 'La bonne commune est en vert : touche-la.'],
    ] as const) {
      const v = monter();
      v.lancer({ sujet });
      const id = v.cible();
      expect(v.zone.querySelector('#barre-essai .essai-consigne')?.textContent).toBe(`Touche : ${NOMS_FE[id]}`);
      toucher(v.vue, false);
      expect(v.retro.textContent).toBe(`Faux : la mer, à 250\u00a0km du bord. ${suite}`);
      v.passer.click();
      v.terminer.click();
      expect(v.bilan.textContent).toContain(`${NOMS_FE[id]} : passé, premier toucher à 250`);
    }
  });

  it('un sujet factice en Trouver : énoncé, « tu as touché », zone admise et ratés du bilan par son rendu, aucun id brut affiché', () => {
    const v = monter();
    const vus: string[] = [];
    v.lancer({ sujet: FACTICE });
    const id = v.cible();
    const autre = id === 'FRA' ? 'ESP' : 'FRA';
    expect(v.zone.querySelector('#barre-essai .essai-consigne')?.textContent).toBe(`Cherche : énoncé ${code(id)}`);
    vus.push(v.barre.innerText);
    fauxSurVoisin = true;
    toucher(v.vue, false);
    expect(v.retro.textContent).toBe(`Faux : touché ${code(autre)}, à 250\u00a0km du bord. suite ${code(id)}.`);
    vus.push(v.barre.innerText);
    admisSuivant = { zone: 'NE_B89', tenant: autre, sorte: 'contestee' };
    toucher(v.vue, true);
    expect(v.retro.textContent).toMatch(new RegExp(`^Juste \\(zone contestée, tenue par lieu ${code(autre)}\\) · 2 essais`));
    vus.push(v.barre.innerText);
    vi.advanceTimersByTime(1200);
    v.passer.click();
    expect(v.bilan.hidden).toBe(false);
    expect(v.bilan.textContent).toContain(`bilan-localiser ${code(id)} : 2 essais`);
    expect(v.bilan.textContent).toContain(`bilan-localiser ${code(autre)} : passé`);
    vus.push(v.bilan.innerText);
    for (const t of vus) sansBrut(t, ['FRA', 'ESP', 'France', 'Espagne']);
  });

  it('un sujet factice en Reconnaître lancé de Jouer : consigne, boutons, rétroaction et bilan par son rendu, aucun id brut affiché', () => {
    const s = monterSeance(() => ({ refus: '', reviser: 0 }));
    const vus: string[] = [];
    s.vue.activer();
    s.vue.lancer({ branche: 'entrainement', sujet: FACTICE, serie: 'Europe', mode: 'nommer' }, { id: 'Europe', terrain: 'monde', ids: IDS5, n: 5 }, s.monde as never, IDS5);
    const cible = () => s.el('#barre-nommer .essai-consigne').dataset.cible!;
    const fautes: [string, string][] = [];
    for (let k = 0; k < IDS5.length; k++) {
      expect(s.el('#barre-nommer .essai-consigne').textContent).toBe('Quelle est cette énigme ?');
      const boutons = s.zone.querySelectorAll('#barre-nommer .nommer-choix');
      expect(boutons.map((b) => b.textContent).sort()).toEqual(boutons.map((b) => `bouton ${code(b.dataset.id!)}`).sort());
      const id = cible();
      // La première faute, les autres justes.
      const b = k === 0 ? boutons.find((x) => x.dataset.id !== id)! : boutons.find((x) => x.dataset.id === id)!;
      if (k === 0) fautes.push([id, b.dataset.id!]);
      b.click();
      vus.push(s.el('#barre-nommer').innerText);
      vi.advanceTimersByTime(1800);
    }
    const [[id, choisi]] = fautes as [[string, string]];
    expect(vus[0]).toContain(`bonne réponse : choix ${code(id)}`);
    expect(s.el('#essai-bilan').innerText).toContain(`bilan-localiser ${code(id)} : tu as choisi choix ${code(choisi)}`);
    vus.push(s.el('#essai-bilan').innerText);
    for (const t of vus) sansBrut(t, [...IDS5, 'France', 'Espagne', 'Italie', 'Allemagne', 'Belgique']);
  });

  it('une séance d’un sujet factice (QuestionPilotee.domaine) : Trouver, QCM et carte retournée par son rendu, aucun id brut affiché', () => {
    const f = piloteFactice([
      { id: 'FRA', forme: 'trouver', cadrer: null, connu: false, domaine: FACTICE as never },
      { id: 'ITA', forme: 'qcm', cadrer: null, connu: true, domaine: FACTICE as never },
      { id: 'DEU', forme: 'retournee', cadrer: null, connu: false, domaine: FACTICE as never },
    ]);
    const s = monterSeance(() => f.p);
    const vus: string[] = [];
    s.vue.activer();
    s.vue.reviser();
    expect(s.el('#barre-essai .essai-consigne').textContent).toBe(`Cherche : énoncé ${code('FRA')}`);
    toucher(s.vue, false);
    expect(s.el('#barre-essai .essai-retro').textContent).toBe(`Faux : touché ${code('ESP')}, à 250\u00a0km du bord. suite ${code('FRA')}.`);
    vus.push(s.el('#barre-essai').innerText);
    toucher(s.vue, true);
    vi.advanceTimersByTime(1200);
    expect(s.el('#barre-nommer .essai-consigne').textContent).toBe('Quelle est cette énigme ?');
    const boutons = s.zone.querySelectorAll('#barre-nommer .nommer-choix');
    expect(boutons.map((b) => b.textContent).sort()).toEqual(boutons.map((b) => `bouton ${code(b.dataset.id!)}`).sort());
    (boutons.find((b) => b.dataset.id !== 'ITA') as El).click();
    expect(s.el('#barre-nommer .essai-retro').textContent).toContain(`bonne réponse : choix ${code('ITA')}`);
    vus.push(s.el('#barre-nommer').innerText);
    vi.advanceTimersByTime(1800);
    expect(s.el('#barre-retournee .essai-consigne').textContent).toBe('Quelle est cette énigme ?');
    s.el('#retournee-reveler').click();
    expect(s.el('.retournee-nom').textContent).toBe(`révélé ${code('DEU')}`);
    vus.push(s.el('#barre-retournee').innerText);
    for (const t of vus) sansBrut(t, [...IDS5, 'France', 'Espagne', 'Italie', 'Allemagne', 'Belgique']);
  });
});

// Trouver et Reconnaître sous Capitales (étude J2 § 5.2) : les vraies données
// des capitales et les vrais noms des pays.
describe('Toucher : le sujet Capitales', () => {
  const NOMS_FR = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  beforeAll(async () => {
    await chargerCapitales(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
  });
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
    installerStockage();
    optionsNotees = [];
  });
  afterEach(() => {
    admisSuivant = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const consigne = (v: ReturnType<typeof monter>) => v.zone.querySelector('#barre-essai .essai-consigne')!;

  it('Trouver : « Pays dont la capitale est : » puis la ville (deux lignes) ; D38 a fixée à la reprise ; juste avec le pays et l’anneau ; bilan « ville (pays) »', () => {
    const vus = new Set<string>();
    for (let k = 0; k < 16; k++) {
      const v = monter({}, { ids: ['NLD'], noms: NOMS_FR });
      v.lancer({ sujet: 'capitales' });
      const c = consigne(v);
      const ville = c.querySelector('strong')!.textContent;
      vus.add(ville);
      expect(['Amsterdam', 'La Haye']).toContain(ville);
      expect(c.textContent).toBe(`Pays dont la capitale est : ${ville}`);
      expect(c.classList.contains('consigne-deux-lignes')).toBe(true);
      // Reprise de la question (vue quittée puis rouverte) : la même capitale.
      toucher(v.vue, false);
      expect(v.marques).toContain(ville === 'La Haye' ? 'anneauEn 4.31,52.08:juste' : 'anneauEn 4.88,52.37:juste');
      v.vue.desactiver();
      v.vue.activer();
      expect(consigne(v).querySelector('strong')!.textContent).toBe(ville);
      toucher(v.vue, true);
      expect(v.retro.textContent).toMatch(new RegExp(`^Juste : ${ville === 'La Haye' ? 'La Haye, siège du gouvernement \\(Pays-Bas\\)' : 'Amsterdam \\(Pays-Bas\\)'} · 2 essais`));
      expect(v.marques.some((m) => m.startsWith('anneauEn '))).toBe(true);
      vi.advanceTimersByTime(1200);
      expect(v.bilan.textContent).toContain(`${ville} (Pays-Bas) : 2 essais`);
      expect(`${v.barre.innerText}${v.bilan.innerText}`).not.toMatch(/\bQ\d+\b|\bNLD\b/);
    }
    expect([...vus].sort()).toEqual(['Amsterdam', 'La Haye']);
  });

  it('D36 i : Israël (« Jérusalem ») noté avec la Palestine en zone admise du sujet, et dit ; sous Pays, aucune', () => {
    const v = monter({}, { ids: ['ISR', 'PSE'], noms: NOMS_FR });
    v.lancer({ sujet: 'capitales' });
    if (v.cible() === 'PSE') v.passer.click();
    expect(v.cible()).toBe('ISR');
    expect(consigne(v).textContent).toBe('Pays dont la capitale est : Jérusalem');
    admisSuivant = { zone: 'PSE', tenant: 'PSE', sorte: 'capitale' };
    toucher(v.vue, true);
    expect(v.retro.textContent).toMatch(/^Juste \(capitale revendiquée aussi par la Palestine\) : Jérusalem \(Israël\) · 1 essai/);
    const o = optionsNotees.at(-1) as { acceptes: ReadonlyMap<string, { zone: string; sorte: string }[]> };
    expect([...o.acceptes.get('ISR')!].map((z) => [z.zone, z.sorte])).toEqual([['PSE', 'capitale']]);
    const p = monter({}, { ids: ['ISR'], noms: NOMS_FR });
    p.lancer({ sujet: 'pays' });
    toucher(p.vue, true);
    expect(optionsNotees.at(-1)).toEqual({ acceptes: true });
  });

  it('Reconnaître sous Capitales : les 9 pays au nom de leur capitale jamais posés (D37 c)', () => {
    const v = monter({}, { ids: ['BEL', 'LUX', 'NLD', 'FRA', 'DEU', 'MCO'], noms: NOMS_FR });
    v.lancer({ sujet: 'capitales', mode: 'nommer' });
    const poses: string[] = [];
    for (let k = 0; k < 6; k++) {
      const id = v.zone.querySelector('#barre-nommer .essai-consigne')?.dataset.cible;
      if (!id || v.zone.querySelector('#barre-nommer')!.hidden) break;
      poses.push(id);
      expect(v.zone.querySelectorAll('#barre-nommer .nommer-choix').map((b) => b.dataset.id)).not.toContain('LUX');
      v.zone.querySelectorAll('#barre-nommer .nommer-choix').find((b) => b.dataset.id === id)!.click();
      vi.advanceTimersByTime(900);
    }
    expect(poses.sort()).toEqual(['BEL', 'DEU', 'FRA', 'NLD']);
  });

  it('une séance qui attend les capitales seules : « Chargement… », pas le message de l’île ; avec les communes, celui de l’île', () => {
    for (const [besoins, attendu] of [
      [['capitales'], textes.toucher.chargement_sujet],
      [['communes', 'capitales'], textes.toucher.chargement_terrain],
    ] as const) {
      const f = piloteFactice([{ id: 'FRA', forme: 'trouver', cadrer: null, connu: false }]);
      const s = monterSeance(() => f.p);
      Object.assign(s.fabrique, { charger: () => new Promise(() => undefined), besoins: () => besoins });
      s.vue.activer();
      s.vue.reviser();
      expect(s.el('#essai-bilan').innerText).toBe(attendu);
    }
  });

  it('D39 b : le conseil d’Apprendre avant la première question ; « Commencer » la pose', () => {
    const f = piloteFactice([{ id: 'FRA', forme: 'trouver', cadrer: null, connu: false }]);
    const conseil = 'Les pays de cette région ne sont pas encore appris : Pays › Europe › Apprendre';
    const s = monterSeance(() => ({ ...f.p, conseil }));
    s.vue.activer();
    s.vue.lancer({ branche: 'entrainement', sujet: 'capitales', serie: 'Europe', mode: 'apprendre' }, { id: 'Europe', terrain: 'monde', ids: IDS5, n: 5 }, s.monde as never, IDS5);
    expect(s.visible('essai-bilan')).toBe(true);
    expect(s.el('#essai-bilan').innerText).toContain(conseil);
    expect(s.visible('barre-essai')).toBe(false);
    s.el('#seance-commencer').click();
    expect(s.visible('essai-bilan')).toBe(false);
    expect(s.visible('barre-essai')).toBe(true);
    // Sans conseil (pays, ou pays appris) : la première question tout de suite.
    const g = piloteFactice([{ id: 'FRA', forme: 'trouver', cadrer: null, connu: false }]);
    const t = monterSeance(() => g.p);
    t.vue.activer();
    t.vue.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'apprendre' }, { id: 'Europe', terrain: 'monde', ids: IDS5, n: 5 }, t.monde as never, IDS5);
    expect(t.visible('barre-essai')).toBe(true);
  });
});

// Le sujet Drapeaux (étude J2 § 5.3, lot 2) : son vrai manifeste, son vrai rendu,
// en Trouver, en Reconnaître lancé de Jouer et en séance (les trois formes).
describe('Toucher : le sujet Drapeaux', () => {
  const NOMS_FR = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  /** Les images préchargées (new Image()), dans l'ordre. */
  let precharges: string[] = [];
  beforeEach(async () => {
    vi.useFakeTimers();
    installerDom();
    installerStockage();
    optionsNotees = [];
    oublierDrapeaux();
    await chargerDrapeaux(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
    precharges = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(a: string) {
          precharges.push(a);
        }
      },
    );
  });
  afterEach(() => {
    admisSuivant = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const montre = (id: string) => drapeauxCharges()!.parPays.get(id)!.montre;
  const consigne = (v: ReturnType<typeof monter>) => v.zone.querySelector('#barre-essai .essai-consigne')!;

  it('Trouver : « Pays de ce drapeau : » et l’image (alt neutre), jamais le pays avant la réponse ; gardée à la reprise ; juste avec le pays ; bilan par le pays', () => {
    const v = monter({}, { ids: ['TCD', 'NER'], noms: NOMS_FR });
    v.lancer({ sujet: 'drapeaux' });
    const id = v.cible();
    const c = consigne(v);
    expect(c.textContent).toBe('Pays de ce drapeau : ');
    expect(c.classList.contains('consigne-image')).toBe(true);
    expect(c.classList.contains('consigne-deux-lignes')).toBe(false);
    const img = c.querySelector('strong img')!;
    expect(img.getAttribute('src')).toBe(montre(id));
    expect(img.getAttribute('alt')).toBe('Drapeau à reconnaître');
    expect(img.getAttribute('draggable')).toBe('false');
    expect(img.getAttribute('title')).toBeNull();
    // La barre entière, attributs compris (title, aria-* de la consigne, de son <strong>, de l'image), data-* exceptés.
    sansBrut(ditsPar(v.barre).join(' | '), ['TCD', 'NER', 'Tchad', 'Niger']);
    // Le drapeau de la question suivante, préchargé pendant celle-ci.
    expect(precharges).toEqual([montre(id === 'TCD' ? 'NER' : 'TCD')]);
    toucher(v.vue, false);
    expect(v.retro.textContent).toMatch(/^Faux : la mer, à 250\u00a0km du bord\. Le bon pays est en vert : touche-le\.$/);
    v.vue.desactiver();
    v.vue.activer();
    expect(consigne(v).querySelector('strong img')!.getAttribute('src')).toBe(montre(id));
    toucher(v.vue, true);
    expect(v.retro.textContent).toMatch(new RegExp(`^Juste : ${NOMS_FR[id]} · 2 essais`));
    vi.advanceTimersByTime(1200);
    v.passer.click();
    expect(v.bilan.textContent).toContain(`${NOMS_FR[id]} : 2 essais`);
    expect(`${v.barre.innerText}${v.bilan.innerText}`).not.toMatch(/\b(TCD|NER)\b/);
  });

  it('D41, décision « Drapeaux contestés et sosies » : Trouver montre l’un des deux drapeaux de l’Afghanistan et de la Bolivie au hasard, fixé pour la question (reprise comprise) ; le préchargement demande celui-là', () => {
    const justes = (id: string) => drapeauxCharges()!.parPays.get(id)!.justes;
    // Le hasard au plus bas, puis au plus haut : le premier drapeau, puis le second (un rendu qui montrerait toujours le premier échoue au second).
    for (const [x, k] of [
      [0.01, 0],
      [0.99, 1],
    ] as const) {
      vi.spyOn(Math, 'random').mockReturnValue(x);
      try {
        precharges = [];
        const v = monter({}, { ids: ['AFG', 'BOL'], noms: NOMS_FR });
        v.lancer({ sujet: 'drapeaux' });
        const id = v.cible();
        const autre = id === 'AFG' ? 'BOL' : 'AFG';
        const src = () => consigne(v).querySelector('strong img')!.getAttribute('src');
        expect(src(), `${x}`).toBe(justes(id)[k]);
        // Le drapeau de la question suivante préchargé : celui que son énoncé montrera, pas forcément le premier.
        expect(precharges, `${x}`).toEqual([justes(autre)[k]]);
        // La reprise de la question garde le même drapeau.
        v.vue.desactiver();
        v.vue.activer();
        expect(src()).toBe(justes(id)[k]);
        v.passer.click();
        expect(v.cible()).toBe(autre);
        expect(src(), `${x}`).toBe(justes(autre)[k]);
        v.vue.desactiver();
      } finally {
        vi.restoreAllMocks();
      }
    }
  });

  it('D41 d : l’Indonésie notée avec Monaco en zone admise du sujet, et dit ; sous Pays, aucune', () => {
    const v = monter({}, { ids: ['IDN', 'MCO'], noms: NOMS_FR });
    v.lancer({ sujet: 'drapeaux' });
    if (v.cible() === 'MCO') v.passer.click();
    expect(v.cible()).toBe('IDN');
    admisSuivant = { zone: 'MCO', tenant: 'MCO', sorte: 'jumeau' };
    toucher(v.vue, true);
    expect(v.retro.textContent).toMatch(/^Juste \(même drapeau que Monaco\) : Indonésie · 1 essai/);
    const o = optionsNotees.at(-1) as { acceptes: ReadonlyMap<string, { zone: string; sorte: string }[]> };
    expect([...o.acceptes.get('IDN')!].map((z) => [z.zone, z.sorte])).toEqual([['MCO', 'jumeau']]);
    // Sous Pays, Monaco au terrain aussi (sinon acceptesEnPlus ne le trouverait pas, et rendrait la table commune de lui-même).
    const p = monter({}, { ids: ['IDN', 'MCO'], noms: NOMS_FR });
    p.lancer({ sujet: 'pays' });
    if (p.cible() === 'MCO') p.passer.click();
    expect(p.cible()).toBe('IDN');
    toucher(p.vue, true);
    expect(optionsNotees.at(-1)).toEqual({ acceptes: true });
  });

  it('Reconnaître lancé de Jouer : la grille d’images ; le journal reçoit le Lancement des drapeaux', () => {
    const libre = vi.fn<NonNullable<OptionsEssai['libre']>>(() => null);
    const v = monter({ libre }, { ids: ['TCD', 'NER', 'NGA', 'CMR', 'CAF'], noms: NOMS_FR });
    v.lancer({ sujet: 'drapeaux', mode: 'nommer' });
    expect(libre.mock.calls[0]![0]).toMatchObject({ sujet: 'drapeaux', mode: 'nommer' });
    const barre = v.zone.querySelector('#barre-nommer')!;
    expect(barre.querySelector('.essai-consigne')!.textContent).toBe('Quel est son drapeau ?');
    const bs = barre.querySelectorAll('.nommer-choix');
    expect(bs.map((b) => b.getAttribute('aria-label'))).toEqual(['Choix 1', 'Choix 2', 'Choix 3', 'Choix 4']);
    expect(bs.every((b) => b.querySelector('img')!.getAttribute('src') === montre(b.dataset.id!))).toBe(true);
  });

  it('une séance (QuestionPilotee.domaine drapeaux) : Trouver, QCM et carte retournée en images ; « Révéler » montre le drapeau et nomme le pays', () => {
    const f = piloteFactice([
      { id: 'FRA', forme: 'trouver', cadrer: null, connu: false, domaine: 'drapeaux' },
      { id: 'ITA', forme: 'qcm', cadrer: null, connu: true, domaine: 'drapeaux' },
      { id: 'DEU', forme: 'retournee', cadrer: null, connu: false, domaine: 'drapeaux' },
    ]);
    const s = monterSeance(() => f.p);
    s.vue.activer();
    s.vue.reviser();
    expect(s.el('#barre-essai .essai-consigne').textContent).toBe('Pays de ce drapeau : ');
    expect(s.el('#barre-essai .essai-consigne strong img').getAttribute('src')).toBe(montre('FRA'));
    justeSuivant = true;
    s.vue.toucher?.(1, 1, {} as PointerEvent);
    expect(s.el('#barre-essai .essai-retro').textContent).toMatch(/^Juste : France · 1 essai/);
    vi.advanceTimersByTime(1200);
    expect(s.el('#barre-nommer .essai-consigne').textContent).toBe('Quel est son drapeau ?');
    const bs = s.zone.querySelectorAll('#barre-nommer .nommer-choix');
    expect(bs.map((b) => b.getAttribute('aria-label'))).toEqual(['Choix 1', 'Choix 2', 'Choix 3', 'Choix 4']);
    bs.find((b) => b.dataset.id === 'ITA')!.click();
    vi.advanceTimersByTime(900);
    const nom = s.el('#barre-retournee .retournee-nom');
    expect(s.el('#barre-retournee .essai-consigne').textContent).toBe('Quel est son drapeau ?');
    expect(nom.hidden).toBe(true);
    expect(nom.querySelector('img')).toBeNull();
    s.el('#retournee-reveler').click();
    expect(nom.hidden).toBe(false);
    expect(nom.querySelector('img')!.getAttribute('src')).toBe(montre('DEU'));
    expect(nom.querySelector('.contenu-legende')!.textContent).toBe('Allemagne');
    expect(nom.getAttribute('aria-live')).toBe('polite');
  });

  it('une séance mêlée : un Trouver de drapeau puis un Trouver de pays, la consigne quitte sa mise en page d’image', () => {
    const f = piloteFactice([
      { id: 'FRA', forme: 'trouver', cadrer: null, connu: false, domaine: 'drapeaux' },
      { id: 'ITA', forme: 'trouver', cadrer: null, connu: false },
    ]);
    const s = monterSeance(() => f.p);
    s.vue.activer();
    s.vue.reviser();
    const c = s.el('#barre-essai .essai-consigne');
    expect(c.classList.contains('consigne-image')).toBe(true);
    justeSuivant = true;
    s.vue.toucher?.(1, 1, {} as PointerEvent);
    vi.advanceTimersByTime(1200);
    expect(c.textContent).toBe(`${textes.sujets.pays.enonce}Italie`);
    expect(c.querySelector('img')).toBeNull();
    expect(c.classList.contains('consigne-image')).toBe(false);
  });

  it('D41, décision « Drapeaux contestés et sosies » : en séance aussi (Apprendre, Révision du jour), Trouver montre l’un des deux drapeaux de l’Afghanistan au hasard, fixé pour la question (reprise comprise) ; la carte retournée, le premier', () => {
    const justes = drapeauxCharges()!.parPays.get('AFG')!.justes;
    expect(justes).toHaveLength(2);
    // Le hasard au plus bas, puis au plus haut : le premier drapeau, puis le second (une séance qui montrerait toujours le premier échoue au second).
    for (const [x, k] of [
      [0.01, 0],
      [0.99, 1],
    ] as const) {
      vi.spyOn(Math, 'random').mockReturnValue(x);
      try {
        const f = piloteFactice([
          { id: 'AFG', forme: 'trouver', cadrer: null, connu: false, domaine: 'drapeaux' },
          { id: 'AFG', forme: 'retournee', cadrer: null, connu: false, domaine: 'drapeaux' },
        ]);
        const s = monterSeance(() => f.p);
        s.vue.activer();
        s.vue.reviser();
        const src = () => s.el('#barre-essai .essai-consigne strong img').getAttribute('src');
        expect(src(), `${x}`).toBe(justes[k]);
        s.vue.desactiver();
        s.vue.activer();
        expect(src(), `${x}`).toBe(justes[k]);
        justeSuivant = true;
        s.vue.toucher?.(1, 1, {} as PointerEvent);
        vi.advanceTimersByTime(1200);
        s.el('#retournee-reveler').click();
        expect(s.el('#barre-retournee .retournee-nom img').getAttribute('src'), `${x}`).toBe(montre('AFG'));
        s.vue.desactiver();
      } finally {
        vi.restoreAllMocks();
      }
    }
  });

  it('une séance qui attend les drapeaux seuls : « Chargement… », pas le message de l’île', () => {
    const f = piloteFactice([{ id: 'FRA', forme: 'trouver', cadrer: null, connu: false, domaine: 'drapeaux' }]);
    const s = monterSeance(() => f.p);
    Object.assign(s.fabrique, { charger: () => new Promise(() => undefined), besoins: () => ['drapeaux'] });
    s.vue.activer();
    s.vue.reviser();
    expect(s.el('#essai-bilan').innerText).toBe(textes.toucher.chargement_sujet);
  });
});
