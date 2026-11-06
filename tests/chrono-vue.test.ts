// Vue des épreuves (src/vues/chrono.ts) sur un DOM factice : quitter la vue,
// ou toucher « Abandonner », pendant une partie (#16, défaut 3) ; Sans faute et
// Minute (#14) ; la partie lancée depuis Jouer et les retours vers lui (#18,
// décision « Écran Jouer »). La carte, les mesures et le bloc du classement
// sont remplacés ; chaque toucher est juste, sauf ceux que `faux` désigne. Les
// minuteries et performance.now() sont factices : le temps de réponse est
// celui qu'on avance.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEBUT_ACCEPTES_EPREUVES } from '../src/epreuve/bareme';
import { idEpreuve, lireRecords } from '../src/epreuve/chrono';
import type { Pays } from '../src/map/types';
import { installerDom, installerStockage, El } from './dom-factice';

const blocClassement = vi.fn((_epreuve: string, _titre: string, _apres?: (pseudo: string) => Promise<unknown>) => new El('section'));
vi.mock('../src/vues/classement', () => ({
  blocClassement: (...a: Parameters<typeof blocClassement>) => blocClassement(...a),
  publierPartie: vi.fn(),
}));

const { vueChrono } = await import('../src/vues/chrono');
const { textes } = await import('../src/vues/textes');
const { catalogue } = await import('../src/vues/cibles');
const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const AMS = 'South America';
/** Ses exercices dans Jouer : là où ramène l'abandon. */
const EXERCICES_AMS = `jouer/classe/pays/${AMS}`;

/** Les touchers à rendre faux (leur numéro, à partir de 1). */
let faux = new Set<number>();
let touchers = 0;
/** Les options de chaque appel à noter() (règle des zones contestées et des enclaves). */
let optionsNoter: unknown[] = [];
/** La zone admise que noter() rend au prochain toucher juste (Note.admis). */
let admisSuivant: unknown = null;

function contexte(maintenant?: () => number) {
  const zone = new El('main');
  const entites = pays.map((p) => ({ pays: p }));
  const consigne = () => zone.querySelector('#barre-chrono .essai-consigne')?.dataset.cible;
  const carte = {
    effacerMarques() {},
    marquer() {},
    anneau() {},
    zoomer() {},
    noter: (id: string, _x: number, _y: number, o?: unknown) => (optionsNoter.push(o), faux.has(++touchers) ? { pick: { id: 'BRA' }, juste: false, distance_km: 120 } : { pick: { id }, juste: true, distance_km: 0, admis: admisSuivant }),
    projection: { scale: () => 1 },
    transfo: { k: 1 },
  };
  const monde = { nom: 'monde', carte, donnees: { noms: { RUS: 'Russie', KAZ: 'Kazakhstan', NE_KAB: 'Baïkonour' }, entites }, jouables: [], credit: null };
  const terrains = { monde, actif: 'monde', montrer: vi.fn(), deja: () => null, charger: vi.fn() };
  const mesures = { toucher: (_ev: unknown, _x: number, _y: number, f: () => unknown) => f() };
  const ctx = { carte, donnees: monde.donnees, terrains, mesures, zone };
  const versJouer = vi.fn<(cible: string, message?: string) => void>();
  const v = vueChrono(ctx as unknown as Parameters<typeof vueChrono>[0], { versJouer, maintenant });
  /** L'épreuve et sa série choisies dans Jouer : la vue s'ouvre, la partie part. */
  const lancer = (mode: 'chrono' | 'sansfaute' | 'minute' = 'chrono', serie = AMS) => {
    const s = catalogue(pays).find((x) => x.id === serie)!;
    v.activer();
    v.lancer({ branche: 'classe', sujet: 'pays', serie, mode }, s, monde as never, [...s.ids]);
  };
  return { v, zone, consigne, versJouer, lancer };
}

beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
  blocClassement.mockClear();
  faux = new Set();
  touchers = 0;
  optionsNoter = [];
  admisSuivant = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Chrono : quitter la vue', () => {
  /** L'Amérique du Sud (12 pays) jouée juste, jusqu'à la dernière réponse (pause de sa rétroaction en cours). */
  function jouerJusquaLaDerniere() {
    const { v, zone, consigne, versJouer, lancer } = contexte();
    lancer();
    const vues = new Set<string>();
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(i ? 1_000 : 0); // la pause (0,9 s) de la réponse d'avant, puis 0,1 s pour répondre
      const c = consigne();
      expect(c).toBeTruthy();
      vues.add(c!);
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    expect(vues.size).toBe(12);
    return { v, zone, versJouer };
  }

  it('pendant la pause qui suit la dernière réponse : la partie va au bilan et se publie, au lieu d’être abandonnée', () => {
    const { v, zone, versJouer } = jouerJusquaLaDerniere();
    v.desactiver(); // l'onglet Carte, avant la fin de la pause
    vi.advanceTimersByTime(5_000);
    expect(v.aMontrer?.()).toBe(true);
    expect(v.redirection?.()).toBeNull(); // le bilan est à montrer : pas de renvoi à Jouer
    v.activer();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    expect(zone.querySelector('#chrono-bilan')?.innerText).toContain('12 000');
    // Le record est gardé, et le bloc du classement a de quoi publier la partie.
    expect(lireRecords(localStorage).get(idEpreuve(AMS))?.points).toBe(12_000);
    expect(blocClassement).toHaveBeenCalledWith(idEpreuve(AMS), expect.any(String), expect.any(Function));
    // Au retour suivant, le bilan encore (il était affiché) ; « Autre série » ramène aux séries des pays.
    v.desactiver();
    expect(v.redirection?.()).toBeNull();
    v.activer();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    zone.querySelector('#chrono-autre')?.click();
    expect(versJouer).toHaveBeenCalledWith('jouer/classe/pays');
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(true);
    v.desactiver();
    // Revenu sans partie ni bilan : Jouer, aux exercices de la série ; rien à montrer (le « × » de Jouer ne la rouvre pas).
    expect(v.aMontrer?.()).toBe(false);
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: '' });
  });

  it('« Abandonner » pendant la pause qui suit la dernière réponse : la partie va au bilan, au lieu d’être jetée', () => {
    const { v, zone, versJouer } = jouerJusquaLaDerniere();
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(false); // le bouton est encore à portée
    zone.querySelector('#chrono-abandonner')?.click();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    expect(versJouer).not.toHaveBeenCalled();
    expect(zone.querySelector('#chrono-bilan')?.innerText).toContain('12 000');
    expect(lireRecords(localStorage).get(idEpreuve(AMS))?.points).toBe(12_000);
    expect(blocClassement).toHaveBeenCalledWith(idEpreuve(AMS), expect.any(String), expect.any(Function));
    // La fin de la pause ne repose rien : le bilan reste.
    vi.advanceTimersByTime(5_000);
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    v.desactiver();
  });

  it('« Abandonner » avec une question encore à poser : la partie est abandonnée, retour aux exercices de la série dans Jouer, qui le dit', () => {
    const { v, zone, versJouer, lancer } = contexte();
    lancer();
    vi.advanceTimersByTime(100);
    v.toucher?.(0, 0, {} as PointerEvent);
    zone.querySelector('#chrono-abandonner')?.click();
    expect(versJouer).toHaveBeenCalledWith(EXERCICES_AMS, textes.chrono.abandon);
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(true);
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(true);
    expect(lireRecords(localStorage).size).toBe(0);
    expect(blocClassement).not.toHaveBeenCalled();
  });

  it('une question encore à poser : la partie quittée reste abandonnée ; y revenir renvoie à Jouer, qui le dit (une fois)', () => {
    const { v, zone, lancer } = contexte();
    lancer();
    vi.advanceTimersByTime(100);
    v.toucher?.(0, 0, {} as PointerEvent);
    v.desactiver();
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(true);
    expect(v.aMontrer?.()).toBe(false); // sans effet de bord : le message reste à dire
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: textes.chrono.abandon });
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: '' });
    expect(lireRecords(localStorage).size).toBe(0);
    expect(blocClassement).not.toHaveBeenCalled();
  });

  it('atteinte sans aucune partie (adresse tapée) : Jouer', () => {
    const { v } = contexte();
    expect(v.redirection?.()).toEqual({ cible: 'jouer', message: '' });
  });
});

describe('Sans faute et Minute (décision « Sans faute et Minute »)', () => {
  /** L'épreuve et l'Amérique du Sud (12 pays) choisies dans Jouer. */
  function partir(mode: 'sansfaute' | 'minute') {
    const { v, zone, consigne, lancer } = contexte();
    lancer(mode);
    const bilan = () => zone.querySelector('#chrono-bilan')!;
    return { v, zone, consigne, bilan };
  }

  it('Jouer choisit l’épreuve et la série : la partie part tout de suite, comptée à la façon de l’épreuve', () => {
    const { zone, consigne, lancer } = contexte();
    const compte = () => zone.querySelector('#barre-chrono .essai-compte')?.textContent;
    lancer('chrono');
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(false);
    expect(consigne()).toBeTruthy();
    expect(compte()).toBe('1 / 12 · 0 pts');
    lancer('minute');
    expect(compte()).toBe('0 juste · 0 erreur');
    lancer('sansfaute');
    expect(compte()).toBe("1 / 12 · 0 d'affilée");
  });

  it('« Rejouer » du bilan relance la même épreuve sur la même série', () => {
    faux = new Set([1]);
    const { zone, bilan, consigne, v } = partir('sansfaute');
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    vi.advanceTimersByTime(1_800);
    expect(bilan().hidden).toBe(false);
    expect(bilan().querySelector('h2')?.textContent).toBe('Sans faute · Amérique du Sud');
    zone.querySelector('#chrono-rejouer')?.click();
    expect(bilan().hidden).toBe(true);
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(false);
    expect(consigne()).toBeTruthy();
    expect(zone.querySelector('#barre-chrono .essai-compte')?.textContent).toBe("1 / 12 · 0 d'affilée");
  });

  it('Sans faute s’arrête à la première erreur : les justes d’affilée, record et classement de l’épreuve', () => {
    faux = new Set([4]);
    const { v, consigne, bilan } = partir('sansfaute');
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(i ? 900 + 2_000 : 2_000);
      expect(consigne()).toBeTruthy();
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    expect(bilan().hidden).toBe(true); // la rétroaction de l'erreur d'abord
    vi.advanceTimersByTime(1_800);
    expect(bilan().hidden).toBe(false);
    expect(bilan().innerText).toContain("3 d'affilée sur 12");
    const e = idEpreuve(AMS, 'sansfaute');
    expect(lireRecords(localStorage).get(e)).toMatchObject({ points: 3, justes: 3, questions: 4, temps_ms: 6_000 });
    expect(lireRecords(localStorage).has(idEpreuve(AMS))).toBe(false);
    expect(blocClassement).toHaveBeenCalledWith(e, expect.any(String), expect.any(Function));
  });

  it('Sans faute : le temps écoulé finit la partie', () => {
    const { v, bilan } = partir('sansfaute');
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    vi.advanceTimersByTime(900 + 15_000 + 1_800);
    expect(bilan().hidden).toBe(false);
    expect(lireRecords(localStorage).get(idEpreuve(AMS, 'sansfaute'))).toMatchObject({ points: 1, questions: 2, temps_ms: 1_000 });
  });

  it('Minute : une erreur passe à la suivante ; la rétroaction ne compte pas dans la minute', () => {
    faux = new Set([2]);
    const { v, consigne, bilan } = partir('minute');
    for (const pause of [0, 900, 1_800]) {
      vi.advanceTimersByTime(pause + 5_000);
      expect(consigne()).toBeTruthy();
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    // 15 s de réponses : il reste 45 s, après la rétroaction (0,9 s).
    vi.advanceTimersByTime(900 + 44_999);
    expect(bilan().hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(bilan().hidden).toBe(false);
    expect(bilan().innerText).toContain('2 justes en une minute');
    expect(bilan().innerText).toContain('1 erreur');
    const e = idEpreuve(AMS, 'minute');
    expect(lireRecords(localStorage).get(e)).toMatchObject({ points: 2, justes: 2, questions: 3, temps_ms: 60_000 });
    expect(blocClassement).toHaveBeenCalledWith(e, expect.any(String), expect.any(Function));
  });

  it('Minute : la série vidée avant la fin arrête la partie, au temps passé', () => {
    const { v, consigne, bilan } = partir('minute');
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(i ? 900 + 1_000 : 1_000);
      expect(consigne()).toBeTruthy();
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    vi.advanceTimersByTime(900);
    expect(bilan().hidden).toBe(false);
    expect(bilan().innerText).toContain('série vidée en 12');
    expect(lireRecords(localStorage).get(idEpreuve(AMS, 'minute'))).toMatchObject({ points: 12, questions: 12, temps_ms: 12_000 });
  });

  it('Minute quittée en cours : abandonnée, rien n’est gardé', () => {
    const { v } = partir('minute');
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    v.desactiver();
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: textes.chrono.abandon });
    expect(lireRecords(localStorage).size).toBe(0);
  });
});

describe('zones contestées et enclaves : à partir du lundi 09/11/2026 0 h UTC', () => {
  /** Une partie partie à t (horloge injectée), deux touchers dont le second après la date. */
  function deuxTouchers(t0: number) {
    let t = t0;
    const { v, lancer } = contexte(() => t);
    lancer();
    v.toucher?.(0, 0, {} as PointerEvent);
    t = DEBUT_ACCEPTES_EPREUVES + 3_600_000;
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    return optionsNoter;
  }

  it('partie lancée avant : notée de fait strict, jusqu’au bout (une seule règle par partie)', () => {
    expect(deuxTouchers(DEBUT_ACCEPTES_EPREUVES - 60_000)).toEqual([{ acceptes: false }, { acceptes: false }]);
  });

  it('partie lancée à la date ou après : zones contestées et enclaves admises', () => {
    expect(deuxTouchers(DEBUT_ACCEPTES_EPREUVES)).toEqual([{ acceptes: true }, { acceptes: true }]);
  });
});

describe('rétroaction d’une zone admise', () => {
  it('Chrono : « Juste (zone contestée, tenue par Russie) · +1000 » ; Sans faute : « Juste (enclave : Baïkonour) »', () => {
    const { v, zone, consigne, lancer } = contexte(() => DEBUT_ACCEPTES_EPREUVES);
    lancer('chrono');
    admisSuivant = { zone: 'NE_B89', tenant: 'RUS', sorte: 'contestee' };
    v.toucher?.(0, 0, {} as PointerEvent);
    const retro = () => zone.querySelector('#barre-chrono .essai-retro')?.textContent ?? '';
    expect(retro()).toMatch(/^Juste \(zone contestée, tenue par Russie\) · \+1/);
    vi.advanceTimersByTime(1_000);
    admisSuivant = null;
    v.toucher?.(0, 0, {} as PointerEvent);
    expect(retro()).toMatch(/^Juste · \+/);
    const s = lancer as (m: 'sansfaute') => void;
    s('sansfaute');
    admisSuivant = { zone: 'NE_KAB', tenant: 'NE_KAB', sorte: 'enclave' };
    v.toucher?.(0, 0, {} as PointerEvent);
    expect(retro()).toBe('Juste (enclave : Baïkonour)');
  });
});
