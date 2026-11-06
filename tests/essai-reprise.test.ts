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
/** La zone admise que noter() rend au prochain toucher juste (Note.admis : zone contestée, enclave). */
let admisSuivant: unknown = null;

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
        ? { juste: true, pick: { id }, via: 'forme', distance_km: 0, admis: admisSuivant }
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
    expect(v.retro.textContent).toMatch(new RegExp(`^Juste \\(zone contestée, tenue par ${autre === 'FRA' ? 'France' : 'Espagne'}\\) · 1 essai`));
    vi.advanceTimersByTime(1200);
    admisSuivant = { zone: autre, tenant: autre, sorte: 'enclave' };
    toucher(v.vue, true);
    expect(v.retro.textContent).toMatch(new RegExp(`^Juste \\(enclave de ${autre === 'FRA' ? 'France' : 'Espagne'} dans ${v.cible() === 'FRA' ? 'France' : 'Espagne'}\\)`));
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
  return { vue, zone, appels, marques, fabrique, versCarte, versJouer, visible, el: (s: string) => zone.querySelector(s) as El };
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
