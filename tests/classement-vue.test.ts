// Publication des scores des épreuves (src/vues/classement.ts) et ce que le bloc
// du classement en dit au joueur (#16, défaut 1) : publier(), placesDuPseudo()
// et lireTableau() remplacés, DOM factice (tests/dom-factice.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreEpreuve } from '../src/epreuve/bareme';
import { enregistrerPartie, idEpreuve, periodeSemaine } from '../src/epreuve/chrono';
import { COMPTES_OUVERTS } from '../src/sync/drapeaux';
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

const { avisPublication, blocClassement, brancherRelance, lireAttente, publierPartie, publierTout, relancerAttente } = await import('../src/vues/classement');
const { textes } = await import('../src/vues/textes');
const { brancherProfil, poserEtatCompte } = await import('../src/sync/pont');
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

  it('au choix du pseudo : un record d’épreuve inconnue (mode null, venu d’une version plus récente) ne part pas, et aucun refus n’est annoncé (étude J2 § 3.2)', async () => {
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    // Reçus par le profil du compte : l'un passerait les bornes du Chrono, l'autre non.
    enregistrerPartie(localStorage, 'xyz:localiser:Africa', score(20_000, 20, 54, 300_000), maintenant);
    enregistrerPartie(localStorage, 'xyz:capitales:tous', score(186_000, 186, 186, 1_000), maintenant);
    publier.mockResolvedValue(true);
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0 });
    expect(avisPublication(r)).toBe('');
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, 'general', 'general'].sort());
    expect(lireAttente()).toEqual([]);
  });

  it('au choix du pseudo : un record du quiz (classement pas encore ouvert, § 9.5) ou d’un sujet sans épreuves classées (les mers, hors de EPREUVES_SUJETS) ne part pas, sans refus annoncé', async () => {
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    // Reçus par le profil d'une version plus récente, vraisemblables tous : les règles de cette version les refuseraient.
    const QUIZ = 'quiz:general:facile';
    const MERS = idEpreuve('mers', 'chrono', 'mers');
    const MIN_MERS = idEpreuve('mers', 'minute', 'mers');
    enregistrerPartie(localStorage, QUIZ, score(18_000, 18, 20, 100_000), maintenant);
    enregistrerPartie(localStorage, MERS, score(50_000, 50, 50, 300_000), maintenant);
    enregistrerPartie(localStorage, MIN_MERS, score(23, 23, 25, 60_000), maintenant);
    publier.mockImplementation(async (e) => ![QUIZ, MERS, MIN_MERS].includes(e));
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0 });
    expect(avisPublication(r)).toBe('');
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, 'general', 'general'].sort());
  });

  it('les records des capitales et des drapeaux partent au choix du pseudo, et le général les compte (D40 a)', async () => {
    enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    const CAP = idEpreuve('Oceania', 'chrono', 'capitales');
    const SF_CAP = idEpreuve('Oceania', 'sansfaute', 'capitales');
    const DRA = idEpreuve('Oceania', 'chrono', 'drapeaux');
    const MIN_DRA = idEpreuve('Oceania', 'minute', 'drapeaux');
    enregistrerPartie(localStorage, CAP, score(13_500, 13, 14, 80_000), maintenant);
    enregistrerPartie(localStorage, SF_CAP, score(9, 9, 10, 30_000), maintenant);
    enregistrerPartie(localStorage, DRA, score(12_000, 12, 14, 50_000), maintenant);
    enregistrerPartie(localStorage, MIN_DRA, score(14, 14, 14, 40_000), maintenant);
    publier.mockResolvedValue(true);
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0 });
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, CAP, CAP, SF_CAP, SF_CAP, DRA, DRA, MIN_DRA, MIN_DRA, 'general', 'general'].sort());
    const general = publier.mock.calls.filter(([e]) => e === 'general').map(([, , , s]) => s);
    expect(general).toEqual([score(37_500, 37, 40, 190_000), score(37_500, 37, 40, 190_000)]);
    // Une partie des capitales : son général aussi.
    publier.mockClear();
    const b = enregistrerPartie(localStorage, CAP, score(14_000, 14, 14, 70_000), maintenant);
    await publierPartie('Ana', CAP, b);
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([CAP, CAP, 'general', 'general'].sort());
    // Une partie des drapeaux de même ; une Minute des drapeaux, sans général.
    publier.mockClear();
    await publierPartie('Ana', DRA, enregistrerPartie(localStorage, DRA, score(13_000, 13, 14, 50_000), maintenant));
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([DRA, DRA, 'general', 'general'].sort());
    expect(publier.mock.calls.filter(([e]) => e === 'general').map(([, , , s]) => s.points)).toEqual([39_000, 39_000]);
    publier.mockClear();
    await publierPartie('Ana', MIN_DRA, enregistrerPartie(localStorage, MIN_DRA, score(14, 14, 14, 30_000), maintenant));
    expect(publier.mock.calls.map(([e]) => e)).toEqual([MIN_DRA, MIN_DRA]);
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

describe('envois en attente (hors ligne)', () => {
  const horsLigne = () => Object.assign(new Error('hors ligne'), { code: 'unavailable' });
  // Le réseau : coupé, puis rendu ; publier() lève hors ligne.
  let reseau = false;
  beforeEach(() => {
    reseau = false;
    publier.mockImplementation(async () => {
      if (!reseau) throw horsLigne();
      return true;
    });
    placesDuPseudo.mockImplementation(async () => {
      if (!reseau) throw horsLigne();
      return new Map();
    });
  });
  const cles = () => lireAttente().map(([e, p]) => `${e}/${p}`).sort();

  it('un record fait hors ligne attend, puis part seul au retour du réseau, à son meilleur score du moment', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const b = enregistrerPartie(localStorage, AMS, score(11_000, 11, 12, 60_000), maintenant);
    expect(await publierPartie('Ana', AMS, b)).toEqual({ refuses: 0, echecs: 4 });
    expect(cles()).toEqual([`${AMS}/toujours`, `${AMS}/${semaine}`, `general/toujours`, `general/${semaine}`].sort());
    // Toujours hors ligne : rien ne part, rien ne sort de la file.
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 4 });
    expect(cles()).toHaveLength(4);
    // Une meilleure partie, hors ligne aussi : c'est elle qui partira.
    publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 59_000), maintenant));
    await attendre();
    reseau = true;
    publier.mockClear();
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 0 });
    expect(publier.mock.calls.map(([e, p, ps, s]) => [e, p, ps, s.points]).sort()).toEqual(
      [
        [AMS, 'toujours', 'Ana', 12_000],
        [AMS, semaine, 'Ana', 12_000],
        ['general', 'toujours', 'Ana', 12_000],
        ['general', semaine, 'Ana', 12_000],
      ].sort(),
    );
    expect(lireAttente()).toEqual([]);
    expect(localStorage.getItem('terramemo.chrono.attente')).toBeNull();
    // Plus rien à refaire.
    publier.mockClear();
    expect(await relancerAttente()).toBeNull();
    expect(publier).not.toHaveBeenCalled();
  });

  it('un refus des règles n’attend pas ; une semaine passée sort de la file sans envoi', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    reseau = true;
    publier.mockResolvedValue(false);
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant));
    expect(lireAttente()).toEqual([]);
    publier.mockReset();
    publier.mockResolvedValue(true);
    // Une semaine passée, une entrée abîmée et un doublon : un seul envoi.
    localStorage.setItem('terramemo.chrono.attente', JSON.stringify([[AMS, 's1'], ['general', 's1'], [AMS, 'toujours'], 'abîmé', [AMS, 'toujours']]));
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 0 });
    expect(publier.mock.calls.map(([e, p]) => `${e}/${p}`)).toEqual([`${AMS}/toujours`]);
    expect(lireAttente()).toEqual([]);
  });

  it('sans pseudo, rien ne part ; un changement de pseudo refait tout et vide la file', async () => {
    const b = enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant);
    await publierPartie('Ana', AMS, b);
    expect(await relancerAttente()).toBeNull();
    reseau = true;
    localStorage.setItem('terramemo.pseudo', 'Bea');
    expect(await publierTout('Bea')).toEqual({ refuses: 0, echecs: 0 });
    expect(lireAttente()).toEqual([]);
  });

  it('un seul renvoi à la fois', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant));
    reseau = true;
    publier.mockClear();
    const [a, b] = [relancerAttente(), relancerAttente()];
    expect(a).toBe(b);
    await a;
    expect(publier).toHaveBeenCalledTimes(4);
  });

  it('au démarrage et à chaque retour du réseau (online), la file repart', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant));
    const ecoutes = new Map<string, () => void>();
    const minuteries: (() => void)[] = [];
    brancherRelance({
      addEventListener: ((type: string, f: () => void) => void ecoutes.set(type, f)) as Window['addEventListener'],
      setTimeout: ((f: () => void) => (minuteries.push(f), 1)) as unknown as Window['setTimeout'],
    });
    expect(minuteries).toHaveLength(1);
    // Encore hors ligne au démarrage : la file reste.
    minuteries[0]?.();
    await attendre();
    await attendre();
    expect(cles()).toHaveLength(4);
    reseau = true;
    publier.mockClear();
    ecoutes.get('online')?.();
    await attendre();
    await attendre();
    expect(publier).toHaveBeenCalledTimes(4);
    expect(lireAttente()).toEqual([]);
    // Retour au premier plan (APK sorti de l'arrière-plan) : la file repart aussi.
    reseau = false;
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 50_000), maintenant));
    reseau = true;
    publier.mockClear();
    ecoutes.get('visibilitychange')?.();
    await attendre();
    await attendre();
    expect(publier).toHaveBeenCalledTimes(4);
  });

  it('une partie trop rapide ne retire pas de la file le record publiable qui attendait', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(11_000, 11, 12, 60_000), maintenant));
    // 12 000 en 1 s : record de l'appareil, mais les règles le refuseraient ; il n'est pas écrit.
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 1_000), maintenant));
    expect(cles()).toContain(`${AMS}/toujours`);
    reseau = true;
    publier.mockClear();
    await relancerAttente();
    expect(publier.mock.calls.filter(([e]) => e === AMS).map(([, p, , s]) => [p, s.points]).sort()).toEqual(
      [
        ['toujours', 11_000],
        [semaine, 11_000],
      ].sort(),
    );
    expect(lireAttente()).toEqual([]);
  });

  it('un renvoi qui aboutit n’efface pas l’échec plus récent d’une meilleure partie', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(11_000, 11, 12, 60_000), maintenant));
    // Le renvoi part (réseau revenu), lent ; une meilleure partie finit pendant ce temps, et son envoi échoue.
    let liberer = () => {};
    const bloque = new Promise<void>((r) => (liberer = r));
    publier.mockImplementation(async () => {
      await bloque;
      return true;
    });
    const renvoi = relancerAttente();
    await attendre();
    publier.mockImplementation(async () => {
      throw horsLigne();
    });
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 59_000), maintenant));
    liberer();
    await renvoi;
    expect(cles()).toEqual([`${AMS}/toujours`, `${AMS}/${semaine}`, `general/toujours`, `general/${semaine}`].sort());
  });

  it('un changement de pseudo attend la fin d’un renvoi sous l’ancien, qui n’efface pas ses échecs', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(11_000, 11, 12, 60_000), maintenant));
    let liberer = () => {};
    const bloque = new Promise<void>((r) => (liberer = r));
    publier.mockImplementation(async (_e, _p, ps) => {
      if (ps === 'Ana') await bloque;
      else throw horsLigne();
      return true;
    });
    placesDuPseudo.mockResolvedValue(new Map());
    const renvoi = relancerAttente();
    await attendre();
    localStorage.setItem('terramemo.pseudo', 'Bea');
    const tout = publierTout('Bea');
    await attendre();
    expect(publier.mock.calls.some(([, , ps]) => ps === 'Bea')).toBe(false);
    liberer();
    await renvoi;
    expect(await tout).toEqual({ refuses: 0, echecs: 4 });
    expect(cles()).toHaveLength(4);
  });

  it('un changement de pseudo vide aussi de la file ce qu’il ne renvoie pas', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    reseau = true;
    enregistrerPartie(localStorage, idEpreuve('Africa', 'minute'), score(23, 23, 25, 60_000), maintenant);
    localStorage.setItem('terramemo.chrono.attente', JSON.stringify([['general', 'toujours']]));
    await publierTout('Ana');
    expect(publier.mock.calls.map(([e]) => e)).not.toContain('general');
    expect(lireAttente()).toEqual([]);
  });

  it('le bloc d’un classement refait la file avant de lire, sauf juste après un envoi échoué', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12_000, 12, 12, 60_000), maintenant));
    publier.mockClear();
    const apresEchec = blocClassement(ILE, 'Classement', async () => ({ refuses: 0, echecs: 1 })) as unknown as El;
    await attendre();
    await attendre();
    expect(publier).not.toHaveBeenCalled();
    expect(apresEchec.innerText).toContain(T.publication_echec);
    reseau = true;
    lireTableau.mockClear();
    const ouvert = blocClassement(ILE, 'Classement') as unknown as El;
    for (let i = 0; i < 4; i++) await attendre();
    expect(publier).toHaveBeenCalledTimes(4);
    expect(lireAttente()).toEqual([]);
    expect(ouvert.querySelector('.chrono-classement-avis')?.hidden).toBe(true);
    // Renvoyés avant la lecture du classement, qui les montre.
    expect(Math.max(...publier.mock.invocationCallOrder)).toBeLessThan(Math.min(...lireTableau.mock.invocationCallOrder));
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

describe('zone du pseudo et comptes (J1b, § 3.1)', () => {
  afterEach(() => {
    poserEtatCompte('invite');
    brancherProfil(null);
    vi.unstubAllEnvs();
  });
  const zone = async () => {
    const b = blocClassement(ILE, 'Classement') as unknown as El;
    await attendre();
    return b.querySelector('.chrono-pseudo')!;
  };

  it('compte : le pseudo du compte, et « Changer » mène à la vue Compte', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    poserEtatCompte('compte');
    const z = await zone();
    expect(z.innerText).toContain('Pseudo du compte : Ana');
    expect(z.querySelector('a.chrono-pseudo-compte')?.getAttribute('href')).toBe('#compte');
    expect(z.querySelector('.chrono-invite-compte')).toBeNull();
  });

  it('invité : une invitation discrète vers la vue Compte, sous le pseudo comme sous le formulaire', async () => {
    const sansPseudo = await zone();
    expect(sansPseudo.querySelector('input')).not.toBeNull();
    expect(sansPseudo.querySelector('.chrono-invite-compte a')?.getAttribute('href')).toBe('#compte');
    expect(sansPseudo.innerText).toContain(T.avec_compte);
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const avecPseudo = await zone();
    expect(avecPseudo.innerText).toContain('Pseudo : Ana');
    expect(avecPseudo.querySelectorAll('.chrono-invite-compte')).toHaveLength(1);
  });

  it('session perdue : le pseudo de l’appareil se change ici, sans invitation', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    poserEtatCompte('perdue');
    const z = await zone();
    expect(z.innerText).toContain('Pseudo : Ana');
    expect(z.querySelector('a.chrono-pseudo-compte')).toBeNull();
    expect(z.querySelector('.chrono-invite-compte')).toBeNull();
  });

  it('un pseudo choisi au classement prévient le profil du compte (pont du morceau principal)', async () => {
    const relais = vi.fn();
    brancherProfil(relais);
    publier.mockResolvedValue(true);
    const z = await zone();
    z.querySelector('input')!.value = 'Ana';
    z.querySelectorAll('button').find((b) => b.innerText === T.publier)!.click();
    await attendre();
    expect(relais).toHaveBeenCalledWith('pseudo');
    expect(localStorage.getItem('terramemo.pseudo')).toBe('Ana');
  });

  it('un pseudo remplacé par celui du compte : dit une fois sous le pseudo', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    localStorage.setItem('terramemo.pseudo.remplace', 'Bob');
    poserEtatCompte('compte');
    const z = await zone();
    expect(z.querySelector('.chrono-pseudo-avis')?.textContent).toBe('Ton pseudo est maintenant Michel (celui du compte).');
    expect(localStorage.getItem('terramemo.pseudo.remplace')).toBeNull();
    expect((await zone()).querySelector('.chrono-pseudo-avis')).toBeNull();
  });

  it('sans DEV ni drapeau : ouverts (11/11), le pseudo du compte ; fermés (urgence), rien ne change, même pour un compte', async () => {
    vi.stubEnv('DEV', false);
    localStorage.setItem('terramemo.pseudo', 'Ana');
    poserEtatCompte('compte');
    const z = await zone();
    if (COMPTES_OUVERTS) {
      expect(z.innerText).toContain('Pseudo du compte : Ana');
    } else {
      expect(z.innerText).toContain('Pseudo : Ana');
      expect(z.querySelector('a')).toBeNull();
      expect(z.innerText).not.toContain(T.avec_compte);
    }
  });
});
