// Publication des scores du Chrono (src/vues/classement.ts) et ce que le bloc
// du classement en dit au joueur (#16, défaut 1) : publier() et lireTableau()
// remplacés, DOM factice (tests/dom-factice.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreEpreuve } from '../src/epreuve/bareme';
import { enregistrerPartie, idEpreuve, periodeSemaine } from '../src/epreuve/chrono';
import { installerDom, installerStockage, type El } from './dom-factice';

const publier = vi.fn<(epreuve: string, periode: string, pseudo: string, s: ScoreEpreuve) => Promise<boolean>>();
const lireTableau = vi.fn();
vi.mock('../src/epreuve/classement', () => ({
  GENERAL: 'general',
  publier: (...a: Parameters<typeof publier>) => publier(...a),
  lireTableau: (...a: unknown[]) => lireTableau(...a),
}));

const { avisPublication, blocClassement, publierPartie } = await import('../src/vues/classement');
const { textes } = await import('../src/vues/textes');
const T = textes.chrono;

const score = (points: number, justes: number, questions: number, temps_ms: number) => ({ points, justes, questions, temps_ms });
const AMS = idEpreuve('South America');
const ILE = idEpreuve('reunion');
const maintenant = Date.now();
const semaine = periodeSemaine(maintenant);

/** Laisse passer les promesses en attente (publication, puis lecture du classement). */
const attendre = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  installerDom();
  installerStockage();
  publier.mockReset();
  lireTableau.mockReset();
  lireTableau.mockResolvedValue({ places: [], moi: null, rang: null, joueurs: 0 });
});
afterEach(() => vi.unstubAllGlobals());

describe('publication d’une partie', () => {
  it('un record refusé par les règles n’emporte pas le général, et le refus est compté', async () => {
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    const b = enregistrerPartie(localStorage, ILE, score(23_500, 23, 24, 90_000), maintenant);
    // Les règles refusent le record de l'île (de toujours), acceptent le reste.
    publier.mockImplementation(async (e, p) => !(e === ILE && p === 'toujours'));
    const r = await publierPartie('Ana', ILE, b);
    expect(r).toEqual({ refuses: 1, echecs: 0 });
    const envois = publier.mock.calls.map(([e, p]) => `${e}/${p}`);
    expect(envois.sort()).toEqual([`${ILE}/toujours`, `${ILE}/${semaine}`, `general/toujours`, `general/${semaine}`].sort());
  });

  it('un échec réseau sur un score : les autres partent quand même, l’échec est compté à part', async () => {
    const b = enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    publier.mockImplementation(async (e, p) => {
      if (e === AMS && p === 'toujours') throw Object.assign(new Error('hors ligne'), { code: 'unavailable' });
      return true;
    });
    expect(await publierPartie('Ana', AMS, b)).toEqual({ refuses: 0, echecs: 1 });
    expect(publier).toHaveBeenCalledTimes(4);
  });

  it('un record que les règles refuseraient n’est pas écrit, ni compté dans le général', async () => {
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    // L'île en 1,4 s : moins de 0,2 s par question.
    const b = enregistrerPartie(localStorage, ILE, score(24_000, 24, 24, 1_433), maintenant);
    publier.mockResolvedValue(true);
    expect(await publierPartie('Ana', ILE, b)).toEqual({ refuses: 2, echecs: 0 });
    // Deux écritures au lieu de quatre : les deux généraux, sans l'île.
    expect(publier.mock.calls.map(([e, p, , s]) => [e, p, s.points])).toEqual([
      ['general', 'toujours', 12_000],
      ['general', semaine, 12_000],
    ]);
  });
});

describe('bloc du classement après une partie', () => {
  const bloc = async (apres: () => Promise<{ refuses: number; echecs: number }>) => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const b = blocClassement(ILE, 'Classement', apres) as unknown as El;
    await attendre();
    await attendre();
    return b;
  };

  it('dit au joueur que son score est refusé, sans le cacher derrière « Personne n’est encore classé »', async () => {
    const b = await bloc(async () => ({ refuses: 1, echecs: 0 }));
    expect(b.innerText).toContain(T.publication_refusee);
    expect(b.innerText).toContain(T.vide);
  });

  it('dit au joueur que la publication a échoué hors ligne', async () => {
    const b = await bloc(async () => ({ refuses: 0, echecs: 2 }));
    expect(b.innerText).toContain(T.publication_echec);
    expect(b.innerText).not.toContain(T.publication_refusee);
  });

  it('rien de plus quand tout est publié', async () => {
    const b = await bloc(async () => ({ refuses: 0, echecs: 0 }));
    expect(b.querySelector('.chrono-classement-avis')?.hidden).toBe(true);
    expect(avisPublication({ refuses: 0, echecs: 0 })).toBe('');
    expect(avisPublication({ refuses: 1, echecs: 1 })).toBe(`${T.publication_refusee} ${T.publication_echec}`);
  });
});
