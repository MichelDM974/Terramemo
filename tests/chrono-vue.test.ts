// Vue du Chrono (src/vues/chrono.ts) sur un DOM factice : quitter la vue
// pendant une partie (#16, défaut 3). La carte, les mesures et le bloc du
// classement sont remplacés ; chaque toucher est juste.
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

function contexte() {
  const zone = new El('main');
  const entites = pays.map((p) => ({ pays: p }));
  const consigne = () => zone.querySelector('#barre-chrono .essai-consigne')?.dataset.cible;
  const carte = {
    effacerMarques() {},
    marquer() {},
    anneau() {},
    zoomer() {},
    noter: (id: string) => ({ pick: { id }, juste: true, distance_km: 0 }),
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
