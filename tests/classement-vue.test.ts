// Publication des scores des épreuves (src/vues/classement.ts) et ce que le bloc
// du classement en dit au joueur (#16, défaut 1) : publier(), placesDuPseudo()
// et lireTableau() remplacés, DOM factice (tests/dom-factice.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreEpreuve } from '../src/epreuve/bareme';
import { enregistrerPartie, idEpreuve, periodeSemaine } from '../src/epreuve/chrono';
import { installerDom, installerStockage, type El } from './dom-factice';

const publier = vi.fn<(epreuve: string, periode: string, pseudo: string, s: ScoreEpreuve) => Promise<boolean>>();
const placesDuPseudo = vi.fn<(periode: string, pseudo: string) => Promise<Map<string, ScoreEpreuve>>>();
const lireTableau = vi.fn();
vi.mock('../src/epreuve/classement', () => ({
  GENERAL: 'general',
  publier: (...a: Parameters<typeof publier>) => publier(...a),
  placesDuPseudo: (...a: Parameters<typeof placesDuPseudo>) => placesDuPseudo(...a),
  lireTableau: (...a: unknown[]) => lireTableau(...a),
}));

const { avisPublication, blocClassement, publierPartie, publierTout } = await import('../src/vues/classement');
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
  placesDuPseudo.mockReset();
  placesDuPseudo.mockResolvedValue(new Map());
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

  it('Sans faute et Minute : leurs deux records seuls, le général n’est pas touché', async () => {
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    publier.mockResolvedValue(true);
    for (const [e, sc] of [
      [idEpreuve('Europe', 'sansfaute'), score(17, 17, 18, 60_000)],
      [idEpreuve('Africa', 'minute'), score(23, 23, 25, 60_000)],
    ] as const) {
      publier.mockClear();
      const b = enregistrerPartie(localStorage, e, sc, maintenant);
      expect(await publierPartie('Ana', e, b)).toEqual({ refuses: 0, echecs: 0 });
      expect(publier.mock.calls.map(([x, p, , s]) => [x, p, s.points])).toEqual([
        [e, 'toujours', sc.points],
        [e, semaine, sc.points],
      ]);
    }
    expect(placesDuPseudo).not.toHaveBeenCalled();
  });

  it('au choix du pseudo : tous les records partent, et le général n’additionne que le Chrono', async () => {
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    enregistrerPartie(localStorage, idEpreuve('Africa', 'minute'), score(23, 23, 25, 60_000), maintenant);
    publier.mockResolvedValue(true);
    expect(await publierTout('Ana')).toEqual({ refuses: 0, echecs: 0 });
    const generaux = publier.mock.calls.filter(([e]) => e === 'general').map(([, p, , s]) => [p, s.points]);
    expect(generaux).toEqual([
      ['toujours', 12_000],
      [semaine, 12_000],
    ]);
    expect(publier).toHaveBeenCalledTimes(6);
  });

  it('Minute seule au choix du pseudo : pas de général', async () => {
    enregistrerPartie(localStorage, idEpreuve('Africa', 'minute'), score(23, 23, 25, 60_000), maintenant);
    publier.mockResolvedValue(true);
    await publierTout('Ana');
    expect(publier.mock.calls.map(([e]) => e)).toEqual([idEpreuve('Africa', 'minute'), idEpreuve('Africa', 'minute')]);
  });
});

describe('un score trop rapide sur une série déjà publiée', () => {
  const OCE = idEpreuve('Oceania');
  // Le serveur : la place du pseudo par épreuve et période, réécrite si le
  // score la bat (firestore.rules) ; publier() dit true quand elle a déjà mieux.
  let base: Map<string, ScoreEpreuve>;
  beforeEach(() => {
    base = new Map();
    publier.mockImplementation(async (e, p, _pseudo, s) => {
      const avant = base.get(`${e}/${p}`);
      if (!avant || s.points > avant.points || (s.points === avant.points && s.temps_ms < avant.temps_ms)) base.set(`${e}/${p}`, s);
      return true;
    });
    placesDuPseudo.mockImplementation(async (periode) => {
      const places = new Map<string, ScoreEpreuve>();
      for (const [k, s] of base) {
        const [e, p] = k.split('/');
        if (e && e !== 'general' && p === periode) places.set(e, s);
      }
      return places;
    });
  });
  const jouer = (e: string, s: ScoreEpreuve) => publierPartie('Pilote', e, enregistrerPartie(localStorage, e, s, maintenant));

  it('garde la série dans le général : les parties suivantes le font encore progresser', async () => {
    await jouer(ILE, score(24_000, 24, 24, 11_946));
    await jouer(AMS, score(12_000, 12, 12, 7_839));
    expect(base.get('general/toujours')?.points).toBe(36_000);
    // L'île en 1,1 s : refusée, seule.
    expect((await jouer(ILE, score(24_000, 24, 24, 1_100))).refuses).toBeGreaterThan(0);
    expect(base.get(`${ILE}/toujours`)?.temps_ms).toBe(11_946);
    expect(await jouer(OCE, score(14_000, 14, 14, 9_136))).toEqual({ refuses: 0, echecs: 0 });
    expect(base.get('general/toujours')?.points).toBe(50_000);
    expect(base.get(`general/${semaine}`)?.points).toBe(50_000);
  });

  it('deux appareils, un pseudo : une place qui garde le meilleur, un général qui additionne les deux appareils', async () => {
    await jouer(ILE, score(21_567, 21, 24, 92_501));
    // L'autre appareil (stockage neuf), sous le même pseudo : l'île moins bien, puis l'Amérique du Sud.
    installerStockage();
    expect(await jouer(ILE, score(17_087, 16, 24, 93_240))).toEqual({ refuses: 0, echecs: 0 });
    expect(base.get(`${ILE}/toujours`)?.points).toBe(21_567);
    expect(base.get('general/toujours')?.points).toBe(21_567);
    await jouer(AMS, score(12_000, 12, 12, 7_839));
    expect(base.get('general/toujours')?.points).toBe(33_567);
    expect(base.get(`general/${semaine}`)?.points).toBe(33_567);
  });

  it('places en ligne illisibles (hors ligne) : les scores partent, le général compte un échec', async () => {
    placesDuPseudo.mockRejectedValue(Object.assign(new Error('hors ligne'), { code: 'unavailable' }));
    expect(await jouer(AMS, score(12_000, 12, 12, 7_839))).toEqual({ refuses: 0, echecs: 2 });
    expect(base.get(`${AMS}/toujours`)?.points).toBe(12_000);
    expect(base.has('general/toujours')).toBe(false);
  });

  it('un nouveau pseudo atteint encore le record publiable de la série et le général', async () => {
    enregistrerPartie(localStorage, ILE, score(24_000, 24, 24, 11_946), maintenant);
    enregistrerPartie(localStorage, ILE, score(24_000, 24, 24, 1_100), maintenant);
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 7_839), maintenant);
    expect(await publierTout('Pilote')).toEqual({ refuses: 0, echecs: 0 });
    expect(base.get(`${ILE}/toujours`)).toEqual(score(24_000, 24, 24, 11_946));
    expect(base.get(`${ILE}/${semaine}`)?.temps_ms).toBe(11_946);
    expect(base.get('general/toujours')?.points).toBe(36_000);
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
