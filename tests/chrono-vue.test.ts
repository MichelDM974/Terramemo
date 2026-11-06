// Vue des épreuves (src/vues/chrono.ts) sur un DOM factice : quitter la vue,
// ou toucher « Abandonner », pendant une partie (#16, défaut 3) ; Sans faute et
// Minute (#14). La carte, les mesures et le bloc du classement sont remplacés ;
// chaque toucher est juste, sauf ceux que `faux` désigne. Les minuteries et
// performance.now() sont factices : le temps de réponse est celui qu'on avance.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];

/** Les touchers à rendre faux (leur numéro, à partir de 1). */
let faux = new Set<number>();
let touchers = 0;

function contexte() {
  const zone = new El('main');
  const entites = pays.map((p) => ({ pays: p }));
  const consigne = () => zone.querySelector('#barre-chrono .essai-consigne')?.dataset.cible;
  const carte = {
    effacerMarques() {},
    marquer() {},
    anneau() {},
    zoomer() {},
    noter: (id: string) => (faux.has(++touchers) ? { pick: { id: 'BRA' }, juste: false, distance_km: 120 } : { pick: { id }, juste: true, distance_km: 0 }),
    projection: { scale: () => 1 },
    transfo: { k: 1 },
  };
  const monde = { nom: 'monde', carte, donnees: { noms: {}, entites }, jouables: [], credit: null };
  const terrains = { monde, actif: 'monde', montrer: vi.fn(), deja: () => null, charger: vi.fn() };
  const mesures = { toucher: (_ev: unknown, _x: number, _y: number, f: () => unknown) => f() };
  const ctx = { carte, donnees: monde.donnees, terrains, mesures, zone };
  return { ctx: ctx as unknown as Parameters<typeof vueChrono>[0], zone, consigne };
}

beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
  blocClassement.mockClear();
  faux = new Set();
  touchers = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Chrono : quitter la vue', () => {
  /** L'Amérique du Sud (12 pays) jouée juste, jusqu'à la dernière réponse (pause de sa rétroaction en cours). */
  function jouerJusquaLaDerniere() {
    const { ctx, zone, consigne } = contexte();
    const v = vueChrono(ctx);
    v.activer();
    zone.querySelector('#chrono-depart .essai-serie[data-serie="South America"]')?.click();
    const vues = new Set<string>();
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(i ? 1_000 : 0); // la pause (0,9 s) de la réponse d'avant, puis 0,1 s pour répondre
      const c = consigne();
      expect(c).toBeTruthy();
      vues.add(c!);
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    expect(vues.size).toBe(12);
    return { v, zone };
  }

  it('pendant la pause qui suit la dernière réponse : la partie va au bilan et se publie, au lieu d’être abandonnée', () => {
    const { v, zone } = jouerJusquaLaDerniere();
    v.desactiver(); // l'onglet Carte, avant la fin de la pause
    vi.advanceTimersByTime(5_000);
    v.activer();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    expect(zone.querySelector('#chrono-depart')?.hidden).toBe(true);
    expect(zone.querySelector('#chrono-bilan')?.innerText).toContain('12 000');
    // Le record est gardé, et le bloc du classement a de quoi publier la partie.
    expect(lireRecords(localStorage).get(idEpreuve('South America'))?.points).toBe(12_000);
    expect(blocClassement).toHaveBeenCalledWith(idEpreuve('South America'), expect.any(String), expect.any(Function));
    // Au retour suivant, le départ comme d'habitude.
    v.desactiver();
    v.activer();
    expect(zone.querySelector('#chrono-depart')?.hidden).toBe(false);
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(true);
  });

  it('« Abandonner » pendant la pause qui suit la dernière réponse : la partie va au bilan, au lieu d’être jetée', () => {
    const { v, zone } = jouerJusquaLaDerniere();
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(false); // le bouton est encore à portée
    zone.querySelector('#chrono-abandonner')?.click();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    expect(zone.querySelector('#chrono-depart')?.hidden).toBe(true);
    expect(zone.querySelector('#chrono-bilan')?.innerText).toContain('12 000');
    expect(lireRecords(localStorage).get(idEpreuve('South America'))?.points).toBe(12_000);
    expect(blocClassement).toHaveBeenCalledWith(idEpreuve('South America'), expect.any(String), expect.any(Function));
    // La fin de la pause ne repose rien : le bilan reste.
    vi.advanceTimersByTime(5_000);
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    v.desactiver();
  });

  it('« Abandonner » avec une question encore à poser : la partie est abandonnée', () => {
    const { ctx, zone } = contexte();
    const v = vueChrono(ctx);
    v.activer();
    zone.querySelector('#chrono-depart .essai-serie[data-serie="South America"]')?.click();
    vi.advanceTimersByTime(100);
    v.toucher?.(0, 0, {} as PointerEvent);
    zone.querySelector('#chrono-abandonner')?.click();
    expect(zone.querySelector('#chrono-depart')?.hidden).toBe(false);
    expect(zone.querySelector('#chrono-depart .chrono-statut')?.textContent).toBe(textes.chrono.abandon);
    expect(lireRecords(localStorage).size).toBe(0);
    expect(blocClassement).not.toHaveBeenCalled();
  });

  it('une question encore à poser : la partie quittée reste abandonnée', () => {
    const { ctx, zone } = contexte();
    const v = vueChrono(ctx);
    v.activer();
    zone.querySelector('#chrono-depart .essai-serie[data-serie="South America"]')?.click();
    vi.advanceTimersByTime(100);
    v.toucher?.(0, 0, {} as PointerEvent);
    v.desactiver();
    v.activer();
    expect(zone.querySelector('#chrono-depart')?.hidden).toBe(false);
    expect(zone.querySelector('#chrono-depart .chrono-statut')?.textContent).toBe(textes.chrono.abandon);
    expect(lireRecords(localStorage).size).toBe(0);
    expect(blocClassement).not.toHaveBeenCalled();
  });
});

describe('Sans faute et Minute (décision « Sans faute et Minute »)', () => {
  const AMS = 'South America';
  /** L'épreuve choisie dans Jouer, puis l'Amérique du Sud (12 pays). */
  function partir(mode: 'sansfaute' | 'minute') {
    const { ctx, zone, consigne } = contexte();
    const v = vueChrono(ctx);
    v.activer();
    v.nouvellePartie(mode);
    zone.querySelector(`#chrono-depart .essai-serie[data-serie="${AMS}"]`)?.click();
    const bilan = () => zone.querySelector('#chrono-bilan')!;
    return { v, zone, consigne, bilan };
  }

  it('Jouer choisit l’épreuve : le départ prend son nom et son aide', () => {
    const { ctx, zone } = contexte();
    const v = vueChrono(ctx);
    v.activer();
    expect(zone.querySelector('#chrono-depart h2')?.textContent).toBe('Chrono');
    v.nouvellePartie('minute');
    expect(zone.querySelector('#chrono-depart h2')?.textContent).toBe('Minute');
    expect(zone.querySelector('#chrono-depart .hint')?.textContent).toContain('60 s');
    v.nouvellePartie('sansfaute');
    expect(zone.querySelector('#chrono-depart h2')?.textContent).toBe('Sans faute');
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
    const { v, zone } = partir('minute');
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    v.desactiver();
    v.activer();
    expect(zone.querySelector('#chrono-depart .chrono-statut')?.textContent).toBe(textes.chrono.abandon);
    expect(lireRecords(localStorage).size).toBe(0);
  });
});
