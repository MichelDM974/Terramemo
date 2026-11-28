// Publication des scores des épreuves (src/vues/classement.ts) et ce que le bloc
// du classement en dit au joueur (#16, défaut 1) : publier(), placesDuPseudo()
// et lireTableau() remplacés, DOM factice (tests/dom-factice.ts). Les scores au
// barème 2 (décision « Barème et classements » du 12/11/2026, #30) : points =
// justes ; Minute retiré, ses ids (`minute:…`) ne partent plus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreEpreuve } from '../src/epreuve/bareme';
import { enregistrerPartie, idEpreuve, periodeSemaine } from '../src/epreuve/chrono';
import { COMPTES_OUVERTS } from '../src/sync/drapeaux';
import { installerDom, installerStockage, type El } from './dom-factice';

const publier = vi.fn<(epreuve: string, periode: string, pseudo: string, s: ScoreEpreuve) => Promise<boolean>>();
const placesDuPseudo = vi.fn<(periode: string, pseudo: string) => Promise<Map<string, ScoreEpreuve>>>();
const lireTableau = vi.fn();
const numeroInvite = vi.fn<() => Promise<string | null>>();
vi.mock('../src/epreuve/classement', () => ({
  GENERAL: 'general',
  numeroInvite: () => numeroInvite(),
  publier: (...a: Parameters<typeof publier>) => publier(...a),
  placesDuPseudo: (...a: Parameters<typeof placesDuPseudo>) => placesDuPseudo(...a),
  lireTableau: (...a: unknown[]) => lireTableau(...a),
}));

const { avisPublication, blocClassement, brancherRelance, champPseudo, inviteSansPseudo, lireAttente, publierPartie, publierTout, relancerAttente } = await import('../src/vues/classement');
const { textes } = await import('../src/vues/textes');
const { SDK_INDISPONIBLE } = await import('../src/sync/firebase');
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
  numeroInvite.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('publication d’une partie', () => {
  it('un record refusé par les règles n’emporte pas le général, et le refus est compté', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    const b = enregistrerPartie(localStorage, ILE, score(23, 23, 24, 90_000), maintenant);
    // Les règles refusent le record de l'île (de toujours), acceptent le reste.
    publier.mockImplementation(async (e, p) => !(e === ILE && p === 'toujours'));
    const r = await publierPartie('Ana', ILE, b);
    expect(r).toEqual({ refuses: 1, echecs: 0, locaux: 0 });
    const envois = publier.mock.calls.map(([e, p]) => `${e}/${p}`);
    expect(envois.sort()).toEqual([`${ILE}/toujours`, `${ILE}/${semaine}`, `general/toujours`, `general/${semaine}`].sort());
  });

  it('une partie du quiz (lot 4b) : ses deux records seuls, le général n’est pas touché (il ne compte jamais le quiz)', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    publier.mockResolvedValue(true);
    const QUIZ = 'quiz:general:difficile';
    const b = enregistrerPartie(localStorage, QUIZ, score(14, 14, 20, 180_000), maintenant);
    expect(await publierPartie('Ana', QUIZ, b)).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(publier.mock.calls.map(([e, p, , s]) => [e, p, s.points])).toEqual([
      [QUIZ, 'toujours', 14],
      [QUIZ, semaine, 14],
    ]);
    expect(placesDuPseudo).not.toHaveBeenCalled();
  });

  it('un échec réseau sur un score : les autres partent quand même, l’échec est compté à part', async () => {
    const b = enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    publier.mockImplementation(async (e, p) => {
      if (e === AMS && p === 'toujours') throw Object.assign(new Error('hors ligne'), { code: 'unavailable' });
      return true;
    });
    expect(await publierPartie('Ana', AMS, b)).toEqual({ refuses: 0, echecs: 1, locaux: 0 });
    expect(publier).toHaveBeenCalledTimes(4);
  });

  it('un record que les règles refuseraient n’est pas écrit, ni compté dans le général', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    // L'île en 1,4 s : moins de 0,2 s par question.
    const b = enregistrerPartie(localStorage, ILE, score(24, 24, 24, 1_433), maintenant);
    publier.mockResolvedValue(true);
    expect(await publierPartie('Ana', ILE, b)).toEqual({ refuses: 2, echecs: 0, locaux: 0 });
    // Deux écritures au lieu de quatre : les deux généraux, sans l'île.
    expect(publier.mock.calls.map(([e, p, , s]) => [e, p, s.points])).toEqual([
      ['general', 'toujours', 12],
      ['general', semaine, 12],
    ]);
  });

  it('Sans faute : ses deux records seuls, le général n’est pas touché', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    publier.mockResolvedValue(true);
    for (const [e, sc] of [
      [idEpreuve('Europe', 'sansfaute'), score(17, 17, 18, 60_000)],
      [idEpreuve('Africa', 'sansfaute'), score(23, 23, 24, 60_000)],
    ] as const) {
      publier.mockClear();
      const b = enregistrerPartie(localStorage, e, sc, maintenant);
      expect(await publierPartie('Ana', e, b)).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
      expect(publier.mock.calls.map(([x, p, , s]) => [x, p, s.points])).toEqual([
        [e, 'toujours', sc.points],
        [e, semaine, sc.points],
      ]);
    }
    expect(placesDuPseudo).not.toHaveBeenCalled();
  });

  it('au choix du pseudo : tous les records partent, et le général n’additionne que le Chrono', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    enregistrerPartie(localStorage, idEpreuve('Africa', 'sansfaute'), score(23, 23, 24, 60_000), maintenant);
    publier.mockResolvedValue(true);
    expect(await publierTout('Ana')).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    const generaux = publier.mock.calls.filter(([e]) => e === 'general').map(([, p, , s]) => [p, s.points]);
    expect(generaux).toEqual([
      ['toujours', 12],
      [semaine, 12],
    ]);
    expect(publier).toHaveBeenCalledTimes(6);
  });

  it('au choix du pseudo : un record d’épreuve inconnue (mode null, venu d’une version plus récente) ne part pas, et aucun refus n’est annoncé (étude J2 § 3.2)', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    // Reçus par le profil du compte : l'un passerait les bornes du Chrono, l'autre non.
    enregistrerPartie(localStorage, 'xyz:localiser:Africa', score(20, 20, 54, 300_000), maintenant);
    enregistrerPartie(localStorage, 'xyz:capitales:tous', score(186, 186, 186, 1_000), maintenant);
    publier.mockResolvedValue(true);
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(avisPublication(r)).toBe('');
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, 'general', 'general'].sort());
    expect(lireAttente()).toEqual([]);
  });

  it('au choix du pseudo : un record du quiz (classement ouvert au lot 4b, D50 c) part, de toujours et de la semaine, sans le général ; celui d’une formule à venir (quiz:general2:…) non, sans refus annoncé', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    const QUIZ = 'quiz:general:facile';
    enregistrerPartie(localStorage, QUIZ, score(18, 18, 20, 100_000), maintenant);
    // Reçu par le profil d'une version plus récente : les règles de cette version le refuseraient.
    const AUTRE = 'quiz:general2:facile';
    enregistrerPartie(localStorage, AUTRE, score(18, 18, 20, 100_000), maintenant);
    publier.mockResolvedValue(true);
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(avisPublication(r)).toBe('');
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, QUIZ, QUIZ, 'general', 'general'].sort());
  });

  it('les records des mers (lot 3b) partent au choix du pseudo, et le général compte leur Chrono (D40 a) ; une partie des mers publie son général, un Sans faute des mers non', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    const MERS = idEpreuve('mers', 'chrono', 'mers');
    const SF_MERS = idEpreuve('mers', 'sansfaute', 'mers');
    expect([MERS, SF_MERS]).toEqual(['chrono:mers:mers', 'sansfaute:mers:mers']);
    enregistrerPartie(localStorage, MERS, score(41, 41, 50, 300_000), maintenant);
    enregistrerPartie(localStorage, SF_MERS, score(23, 23, 24, 60_000), maintenant);
    publier.mockResolvedValue(true);
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, MERS, MERS, SF_MERS, SF_MERS, 'general', 'general'].sort());
    const general = publier.mock.calls.filter(([e]) => e === 'general').map(([, , , s]) => s);
    expect(general).toEqual([score(53, 53, 62, 360_000), score(53, 53, 62, 360_000)]);
    publier.mockClear();
    await publierPartie('Ana', MERS, enregistrerPartie(localStorage, MERS, score(44, 44, 50, 280_000), maintenant));
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([MERS, MERS, 'general', 'general'].sort());
    expect(publier.mock.calls.filter(([e]) => e === 'general').map(([, , , s]) => s.points)).toEqual([56, 56]);
    publier.mockClear();
    // La série vidée (50 sur 50, sans erreur) : le score maximal du Sans faute.
    await publierPartie('Ana', SF_MERS, enregistrerPartie(localStorage, SF_MERS, score(50, 50, 50, 200_000), maintenant));
    expect(publier.mock.calls.map(([e]) => e)).toEqual([SF_MERS, SF_MERS]);
  });

  it('les records des capitales et des drapeaux partent au choix du pseudo, et le général les compte (D40 a)', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    const CAP = idEpreuve('Oceania', 'chrono', 'capitales');
    const SF_CAP = idEpreuve('Oceania', 'sansfaute', 'capitales');
    const DRA = idEpreuve('Oceania', 'chrono', 'drapeaux');
    const SF_DRA = idEpreuve('Oceania', 'sansfaute', 'drapeaux');
    enregistrerPartie(localStorage, CAP, score(13, 13, 14, 80_000), maintenant);
    enregistrerPartie(localStorage, SF_CAP, score(9, 9, 10, 30_000), maintenant);
    enregistrerPartie(localStorage, DRA, score(12, 12, 14, 50_000), maintenant);
    enregistrerPartie(localStorage, SF_DRA, score(14, 14, 14, 40_000), maintenant);
    publier.mockResolvedValue(true);
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, CAP, CAP, SF_CAP, SF_CAP, DRA, DRA, SF_DRA, SF_DRA, 'general', 'general'].sort());
    const general = publier.mock.calls.filter(([e]) => e === 'general').map(([, , , s]) => s);
    expect(general).toEqual([score(37, 37, 40, 190_000), score(37, 37, 40, 190_000)]);
    // Une partie des capitales : son général aussi.
    publier.mockClear();
    const b = enregistrerPartie(localStorage, CAP, score(14, 14, 14, 70_000), maintenant);
    await publierPartie('Ana', CAP, b);
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([CAP, CAP, 'general', 'general'].sort());
    // Une partie des drapeaux de même ; un Sans faute des drapeaux, sans général.
    publier.mockClear();
    await publierPartie('Ana', DRA, enregistrerPartie(localStorage, DRA, score(13, 13, 14, 50_000), maintenant));
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([DRA, DRA, 'general', 'general'].sort());
    expect(publier.mock.calls.filter(([e]) => e === 'general').map(([, , , s]) => s.points)).toEqual([39, 39]);
    publier.mockClear();
    await publierPartie('Ana', SF_DRA, enregistrerPartie(localStorage, SF_DRA, score(14, 14, 14, 30_000), maintenant));
    expect(publier.mock.calls.map(([e]) => e)).toEqual([SF_DRA, SF_DRA]);
  });

  it('Sans faute seul au choix du pseudo : pas de général', async () => {
    enregistrerPartie(localStorage, idEpreuve('Africa', 'sansfaute'), score(23, 23, 24, 60_000), maintenant);
    publier.mockResolvedValue(true);
    await publierTout('Ana');
    expect(publier.mock.calls.map(([e]) => e)).toEqual([idEpreuve('Africa', 'sansfaute'), idEpreuve('Africa', 'sansfaute')]);
  });

  it('un record de Minute (retiré, décision « Barème et classements ») reste sur l’appareil sans partir, ni refus annoncé', async () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    enregistrerPartie(localStorage, 'minute:localiser:Africa', score(23, 23, 25, 60_000), maintenant);
    publier.mockResolvedValue(true);
    const r = await publierTout('Ana');
    expect(r).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(publier.mock.calls.map(([e]) => e).sort()).toEqual([AMS, AMS, 'general', 'general'].sort());
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
    await jouer(ILE, score(24, 24, 24, 11_946));
    await jouer(AMS, score(12, 12, 12, 7_839));
    expect(base.get('general/toujours')?.points).toBe(36);
    // L'île en 1,1 s : refusée, seule.
    expect((await jouer(ILE, score(24, 24, 24, 1_100))).refuses).toBeGreaterThan(0);
    expect(base.get(`${ILE}/toujours`)?.temps_ms).toBe(11_946);
    expect(await jouer(OCE, score(14, 14, 14, 9_136))).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(base.get('general/toujours')?.points).toBe(50);
    expect(base.get(`general/${semaine}`)?.points).toBe(50);
  });

  it('deux appareils, un pseudo : une place qui garde le meilleur, un général qui additionne les deux appareils', async () => {
    await jouer(ILE, score(21, 21, 24, 92_501));
    // L'autre appareil (stockage neuf), sous le même pseudo : l'île moins bien, puis l'Amérique du Sud.
    installerStockage();
    expect(await jouer(ILE, score(16, 16, 24, 93_240))).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(base.get(`${ILE}/toujours`)?.points).toBe(21);
    expect(base.get('general/toujours')?.points).toBe(21);
    await jouer(AMS, score(12, 12, 12, 7_839));
    expect(base.get('general/toujours')?.points).toBe(33);
    expect(base.get(`general/${semaine}`)?.points).toBe(33);
  });

  it('places en ligne illisibles (hors ligne) : les scores partent, le général compte un échec', async () => {
    placesDuPseudo.mockRejectedValue(Object.assign(new Error('hors ligne'), { code: 'unavailable' }));
    expect(await jouer(AMS, score(12, 12, 12, 7_839))).toEqual({ refuses: 0, echecs: 2, locaux: 0 });
    expect(base.get(`${AMS}/toujours`)?.points).toBe(12);
    expect(base.has('general/toujours')).toBe(false);
  });

  it('un nouveau pseudo atteint encore le record publiable de la série et le général', async () => {
    enregistrerPartie(localStorage, ILE, score(24, 24, 24, 11_946), maintenant);
    enregistrerPartie(localStorage, ILE, score(24, 24, 24, 1_100), maintenant);
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 7_839), maintenant);
    expect(await publierTout('Pilote')).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(base.get(`${ILE}/toujours`)).toEqual(score(24, 24, 24, 11_946));
    expect(base.get(`${ILE}/${semaine}`)?.temps_ms).toBe(11_946);
    expect(base.get('general/toujours')?.points).toBe(36);
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
    const b = enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant);
    expect(await publierPartie('Ana', AMS, b)).toEqual({ refuses: 0, echecs: 4, locaux: 0 });
    expect(cles()).toEqual([`${AMS}/toujours`, `${AMS}/${semaine}`, `general/toujours`, `general/${semaine}`].sort());
    // Toujours hors ligne : rien ne part, rien ne sort de la file.
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 4, locaux: 0 });
    expect(cles()).toHaveLength(4);
    // Une meilleure partie, hors ligne aussi : c'est elle qui partira.
    publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 59_000), maintenant));
    await attendre();
    reseau = true;
    publier.mockClear();
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(publier.mock.calls.map(([e, p, ps, s]) => [e, p, ps, s.points]).sort()).toEqual(
      [
        [AMS, 'toujours', 'Ana', 12],
        [AMS, semaine, 'Ana', 12],
        ['general', 'toujours', 'Ana', 12],
        ['general', semaine, 'Ana', 12],
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
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
    expect(lireAttente()).toEqual([]);
    publier.mockReset();
    publier.mockResolvedValue(true);
    // Une semaine passée, une entrée abîmée et un doublon : un seul envoi.
    localStorage.setItem('terramemo.chrono.attente', JSON.stringify([[AMS, 's1'], ['general', 's1'], [AMS, 'toujours'], 'abîmé', [AMS, 'toujours']]));
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(publier.mock.calls.map(([e, p]) => `${e}/${p}`)).toEqual([`${AMS}/toujours`]);
    expect(lireAttente()).toEqual([]);
  });

  // Audit du 07/11 (#25) : seules les erreurs du réseau (erreurReseau) promettent un départ.
  const erreur = (code: string) => Object.assign(new Error(code), { code });

  it('les erreurs du réseau entrent dans la file : unknown (fetch échoué de Firestore lite), Auth hors ligne, SDK pas téléchargé, 503, 504', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    for (const code of ['unknown', 'auth/network-request-failed', SDK_INDISPONIBLE, 'unavailable', 'deadline-exceeded']) {
      installerStockage();
      publier.mockImplementation(async () => {
        throw erreur(code);
      });
      placesDuPseudo.mockRejectedValue(erreur(code));
      const r = await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
      expect([code, r]).toEqual([code, { refuses: 0, echecs: 4, locaux: 0 }]);
      expect([code, cles()]).toEqual([code, [`${AMS}/toujours`, `${AMS}/${semaine}`, `general/toujours`, `general/${semaine}`].sort()]);
      expect(avisPublication(r)).toBe(T.publication_echec);
    }
  });

  it('une autre erreur (quota épuisé, connexion anonyme refusée) n’entre pas dans la file : comptée à part, sans promettre de départ', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    publier.mockImplementation(async (e) => {
      throw erreur(e === AMS ? 'resource-exhausted' : 'auth/too-many-requests');
    });
    placesDuPseudo.mockRejectedValue(erreur('auth/admin-restricted-operation'));
    const r = await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
    expect(r).toEqual({ refuses: 0, echecs: 0, locaux: 4 });
    expect(lireAttente()).toEqual([]);
    expect(avisPublication(r)).toBe(T.publication_locale);
    expect(T.publication_locale).not.toContain(T.publication_echec);
    // L'un et l'autre dans la même partie : chacun son avis.
    publier.mockImplementation(async (e) => {
      if (e === AMS) throw horsLigne();
      throw erreur('resource-exhausted');
    });
    placesDuPseudo.mockResolvedValue(new Map());
    const m = await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 59_000), maintenant));
    expect(m).toEqual({ refuses: 0, echecs: 2, locaux: 2 });
    expect(cles()).toEqual([`${AMS}/toujours`, `${AMS}/${semaine}`].sort());
    expect(avisPublication(m)).toBe(`${T.publication_echec} ${T.publication_locale}`);
  });

  it('une entrée de la file qui échoue sans que le réseau soit en cause en sort : elle ne repart plus à chaque retour au premier plan', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
    expect(cles()).toHaveLength(4);
    // En ligne, mais le quota de Firestore est épuisé.
    publier.mockImplementation(async () => {
      throw erreur('resource-exhausted');
    });
    placesDuPseudo.mockResolvedValue(new Map());
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 0, locaux: 4 });
    expect(lireAttente()).toEqual([]);
    publier.mockClear();
    expect(await relancerAttente()).toBeNull();
    expect(publier).not.toHaveBeenCalled();
  });

  it('hors ligne, stockage plein pour la file : l’avis ne promet pas de départ, le score reste sur l’appareil ; une entrée déjà en file y reste promise', async () => {
    const m = installerStockage();
    let plein = true;
    // Les records s'écrivent, la file non (QuotaExceededError), et rien n'est écrit à sa place.
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k === 'terramemo.chrono.attente' && plein) throw new Error('QuotaExceededError');
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    });
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const r = await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant));
    expect(r).toEqual({ refuses: 0, echecs: 0, locaux: 4 });
    expect(lireAttente()).toEqual([]);
    expect(avisPublication(r)).toBe(T.publication_locale);
    // La file a pu s'écrire une fois (le record de toujours), puis le stockage est plein : cette entrée reste promise.
    plein = false;
    publier.mockImplementation(async (e, p) => {
      if (e === AMS && p === 'toujours') throw horsLigne();
      return true;
    });
    placesDuPseudo.mockResolvedValue(new Map());
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 59_000), maintenant));
    expect(cles()).toEqual([`${AMS}/toujours`]);
    plein = true;
    publier.mockImplementation(async () => {
      throw horsLigne();
    });
    placesDuPseudo.mockRejectedValue(horsLigne());
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 1, locaux: 0 });
    expect(cles()).toEqual([`${AMS}/toujours`]);
  });

  it('le bloc d’un classement ne refait pas la file juste après une partie dont un envoi a échoué sans réseau en cause', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
    reseau = true;
    publier.mockClear();
    const b = blocClassement(ILE, 'Classement', async () => ({ refuses: 0, echecs: 0, locaux: 1 })) as unknown as El;
    await attendre();
    await attendre();
    expect(publier).not.toHaveBeenCalled();
    expect(b.innerText).toContain(T.publication_locale);
    expect(b.innerText).not.toContain(T.publication_echec);
  });

  it('sans pseudo, rien ne part ; un changement de pseudo refait tout et vide la file', async () => {
    const b = enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    await publierPartie('Ana', AMS, b);
    expect(await relancerAttente()).toBeNull();
    reseau = true;
    localStorage.setItem('terramemo.pseudo', 'Bea');
    expect(await publierTout('Bea')).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(lireAttente()).toEqual([]);
  });

  // Barème 2 (décision « Barème et classements » du 12/11/2026, #30) : entre
  // les règles du barème 2 et la mise à jour de l'appli, un score publié au
  // barème 1 est refusé et sort de la file ; au démarrage, les records
  // convertis y rentrent, pour que la place ne reste pas en dessous.
  it('au démarrage, les records du barème 1 sont convertis et repartent, une fois (toujours, la semaine, le général)', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const SF = idEpreuve('Africa', 'sansfaute');
    const v1 = (points: number, justes: number, questions: number, temps_ms: number) => ({ points, justes, questions, temps_ms, date: maintenant, bareme: 1 });
    localStorage.setItem(
      'terramemo.chrono.records',
      JSON.stringify({
        [AMS]: v1(11_351, 11, 12, 60_000),
        [`${AMS}@${semaine}`]: v1(11_351, 11, 12, 60_000),
        [`${AMS}@s1`]: v1(9_000, 9, 12, 60_000),
        [SF]: v1(23, 23, 24, 60_000),
        // Minute, retiré : converti sur l'appareil, mais ne part pas.
        'minute:localiser:Africa': v1(23, 23, 25, 60_000),
      }),
    );
    reseau = true;
    const minuteries: (() => void)[] = [];
    const cible = {
      addEventListener: (() => undefined) as Window['addEventListener'],
      setTimeout: ((f: () => void) => (minuteries.push(f), 1)) as unknown as Window['setTimeout'],
    };
    brancherRelance(cible);
    expect(cles()).toEqual([`${AMS}/toujours`, `${AMS}/${semaine}`, `${SF}/toujours`, 'general/toujours', `general/${semaine}`].sort());
    const ecrits = JSON.parse(localStorage.getItem('terramemo.chrono.records')!) as Record<string, { bareme: number }>;
    expect(Object.values(ecrits).map((r) => r.bareme)).toEqual([2, 2, 2, 2, 2]);
    minuteries[0]?.();
    await attendre();
    await attendre();
    expect(publier.mock.calls.map(([e, p, , sc]) => `${e}/${p}/${sc.points}`).sort()).toEqual(
      [`${AMS}/toujours/11`, `${AMS}/${semaine}/11`, `${SF}/toujours/23`, 'general/toujours/11', `general/${semaine}/11`].sort(),
    );
    expect(lireAttente()).toEqual([]);
    // Redémarrée, l'appli n'a plus rien à convertir ni à refaire.
    publier.mockClear();
    brancherRelance(cible);
    expect(lireAttente()).toEqual([]);
  });

  it('au démarrage, sans record du barème 1, la file ne change pas', () => {
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    brancherRelance({ addEventListener: (() => undefined) as Window['addEventListener'], setTimeout: (() => 1) as unknown as Window['setTimeout'] });
    expect(lireAttente()).toEqual([]);
  });

  it('un seul renvoi à la fois', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
    reseau = true;
    publier.mockClear();
    const [a, b] = [relancerAttente(), relancerAttente()];
    expect(a).toBe(b);
    await a;
    expect(publier).toHaveBeenCalledTimes(4);
  });

  it('au démarrage et à chaque retour du réseau (online), la file repart', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
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
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 50_000), maintenant));
    reseau = true;
    publier.mockClear();
    ecoutes.get('visibilitychange')?.();
    await attendre();
    await attendre();
    expect(publier).toHaveBeenCalledTimes(4);
  });

  it('une partie trop rapide ne retire pas de la file le record publiable qui attendait', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant));
    // 12 000 en 1 s : record de l'appareil, mais les règles le refuseraient ; il n'est pas écrit.
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 1_000), maintenant));
    expect(cles()).toContain(`${AMS}/toujours`);
    reseau = true;
    publier.mockClear();
    await relancerAttente();
    expect(publier.mock.calls.filter(([e]) => e === AMS).map(([, p, , s]) => [p, s.points]).sort()).toEqual(
      [
        ['toujours', 11],
        [semaine, 11],
      ].sort(),
    );
    expect(lireAttente()).toEqual([]);
  });

  it('un renvoi qui aboutit n’efface pas l’échec plus récent d’une meilleure partie', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant));
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
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 59_000), maintenant));
    liberer();
    await renvoi;
    expect(cles()).toEqual([`${AMS}/toujours`, `${AMS}/${semaine}`, `general/toujours`, `general/${semaine}`].sort());
  });

  it('un changement de pseudo attend la fin d’un renvoi sous l’ancien, qui n’efface pas ses échecs', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant));
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
    expect(await tout).toEqual({ refuses: 0, echecs: 4, locaux: 0 });
    expect(cles()).toHaveLength(4);
  });

  it('un changement de pseudo vide aussi de la file ce qu’il ne renvoie pas', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    reseau = true;
    enregistrerPartie(localStorage, idEpreuve('Africa', 'sansfaute'), score(23, 23, 24, 60_000), maintenant);
    localStorage.setItem('terramemo.chrono.attente', JSON.stringify([['general', 'toujours']]));
    await publierTout('Ana');
    expect(publier.mock.calls.map(([e]) => e)).not.toContain('general');
    expect(lireAttente()).toEqual([]);
  });

  it('une entrée de Minute (retiré) sort de la file sans envoi, ni refus, ni échec, même avec un score publiable gardé', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    reseau = true;
    enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant);
    // Un record de Minute qui garde un score publiable à côté (venu d'avant le retrait) : sans le filtre, il partirait, refusé.
    const records = JSON.parse(localStorage.getItem('terramemo.chrono.records')!) as Record<string, unknown>;
    records['minute:localiser:Africa'] = { ...score(30, 30, 31, 100), date: maintenant, bareme: 2, publiable: { ...score(23, 23, 25, 60_000), date: maintenant } };
    localStorage.setItem('terramemo.chrono.records', JSON.stringify(records));
    localStorage.setItem('terramemo.chrono.attente', JSON.stringify([['minute:localiser:Africa', 'toujours'], ['minute:localiser:Africa', semaine], [AMS, 'toujours']]));
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(publier.mock.calls.map(([e, p]) => `${e}/${p}`)).toEqual([`${AMS}/toujours`]);
    expect(lireAttente()).toEqual([]);
  });

  it('le bloc d’un classement refait la file avant de lire, sauf juste après un envoi échoué', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    await publierPartie('Ana', AMS, enregistrerPartie(localStorage, AMS, score(12, 12, 12, 60_000), maintenant));
    publier.mockClear();
    const apresEchec = blocClassement(ILE, 'Classement', async () => ({ refuses: 0, echecs: 1, locaux: 0 })) as unknown as El;
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
  const bloc = async (apres: () => Promise<{ refuses: number; echecs: number; locaux: number }>) => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const b = blocClassement(ILE, 'Classement', apres) as unknown as El;
    await attendre();
    await attendre();
    return b;
  };

  it('dit au joueur que son score est refusé, sans le cacher derrière « Personne n’est encore classé »', async () => {
    const b = await bloc(async () => ({ refuses: 1, echecs: 0, locaux: 0 }));
    expect(b.innerText).toContain(T.publication_refusee);
    expect(b.innerText).toContain(T.vide);
  });

  it('dit au joueur que la publication a échoué hors ligne', async () => {
    const b = await bloc(async () => ({ refuses: 0, echecs: 2, locaux: 0 }));
    expect(b.innerText).toContain(T.publication_echec);
    expect(b.innerText).not.toContain(T.publication_refusee);
  });

  it('rien de plus quand tout est publié', async () => {
    const b = await bloc(async () => ({ refuses: 0, echecs: 0, locaux: 0 }));
    expect(b.querySelector('.chrono-classement-avis')?.hidden).toBe(true);
    expect(avisPublication({ refuses: 0, echecs: 0, locaux: 0 })).toBe('');
    expect(avisPublication({ refuses: 1, echecs: 1, locaux: 0 })).toBe(`${T.publication_refusee} ${T.publication_echec}`);
  });
});

describe('tableau d’un classement (décision « Barème et classements »)', () => {
  const place = (cle: string, justes: number, questions: number, temps_ms: number) => ({ cle, pseudo: cle, points: justes, justes, questions, temps_ms });
  const lignes = async (epreuve: string, places: ReturnType<typeof place>[]) => {
    lireTableau.mockResolvedValue({ places, moi: null, rang: null, joueurs: places.length });
    const b = blocClassement(epreuve, 'Classement') as unknown as El;
    await attendre();
    await attendre();
    return b.querySelectorAll('.chrono-places li');
  };

  it('une épreuve : « 194/195 · 99 % » (tronqué), le pourcentage seul pour l’écran étroit, le temps qui départage', async () => {
    const [a, b] = await lignes(idEpreuve('tous'), [place('Ana', 195, 195, 600_000), place('Bea', 194, 195, 185_000)]);
    expect(a!.querySelector('.pts-entier')?.textContent).toBe('195/195 · 100\u00a0%');
    expect(b!.querySelector('.pts-entier')?.textContent).toBe('194/195 · 99\u00a0%');
    // Le pourcentage seul (carte.css, sous 400 px) : caché aux lecteurs d'écran, qui lisent le score entier ; celui-ci en title.
    const bref = b!.querySelector('.pts-bref')!;
    expect([bref.textContent, bref.getAttribute('aria-hidden')]).toEqual(['99\u00a0%', 'true']);
    expect(b!.querySelector('.pts')?.getAttribute('title')).toBe('194/195 · 99\u00a0%');
    expect(b!.querySelector('.temps')?.textContent).toBe('3\u00a0min\u00a005');
  });

  it('Sans faute : la part de la série (sa taille), pas des questions jouées', async () => {
    const [a] = await lignes(idEpreuve('Africa', 'sansfaute'), [place('Ana', 17, 18, 62_000)]);
    expect(a!.querySelector('.pts-entier')?.textContent).toBe("17 d'affilée sur 54 · 31\u00a0%");
    expect(a!.querySelector('.pts-bref')?.textContent).toBe('31\u00a0%');
  });

  it('le général : « 5,8 % », et « 91 justes sur 1 555 » (les voisins compris) en title et aux lecteurs d’écran', async () => {
    const [a, b] = await lignes('general', [place('Ana', 1554, 1555, 9_000_000), place('Bea', 91, 120, 600_000)]);
    expect(a!.querySelector('.pts')?.textContent).toMatch(/^99,9\u00a0%/);
    const pts = b!.querySelector('.pts')!;
    expect(pts.textContent).toBe('5,8\u00a0% · 91 justes sur 1\u202f555');
    expect(pts.querySelector('.pts-lu')?.textContent).toBe(' · 91 justes sur 1\u202f555');
    expect(pts.getAttribute('title')).toBe('91 justes sur 1\u202f555');
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

describe('pseudo d’invité : Guest-1000, puis Guest-1001… au premier score publié (décision « Pseudo d’invité »)', () => {
  const horsLigne = () => Object.assign(new Error('hors ligne'), { code: 'unavailable' });
  beforeEach(() => {
    // « Continuer en invité » choisi à l'écran de connexion, sans pseudo.
    localStorage.setItem('terramemo.accueil', 'invite');
    publier.mockResolvedValue(true);
  });
  afterEach(() => poserEtatCompte('invite'));
  const apresPartie = async (apres?: (pseudo: string) => Promise<{ refuses: number; echecs: number; locaux: number }>) => {
    const bp = enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant);
    const b = blocClassement(AMS, 'Classement', apres ?? ((p) => publierPartie(p, AMS, bp))) as unknown as El;
    for (let i = 0; i < 4; i++) await attendre();
    return b;
  };

  it('après sa première partie : ni formulaire ni pseudo à choisir ; le numéro tiré, gardé, et tous ses records publiés sous lui', async () => {
    numeroInvite.mockResolvedValue('Guest-1000');
    enregistrerPartie(localStorage, idEpreuve('Africa', 'sansfaute'), score(23, 23, 24, 60_000), maintenant);
    const b = await apresPartie();
    expect(numeroInvite).toHaveBeenCalledOnce();
    expect(localStorage.getItem('terramemo.pseudo')).toBe('Guest-1000');
    expect(new Set(publier.mock.calls.map(([, , p]) => p))).toEqual(new Set(['Guest-1000']));
    // Le record d'avant (Sans faute) part aussi, comme au choix d'un pseudo.
    expect(publier.mock.calls.some(([e]) => e === idEpreuve('Africa', 'sansfaute'))).toBe(true);
    const z = b.querySelector('.chrono-pseudo')!;
    expect(z.querySelector('input')).toBeNull();
    expect(z.innerText).toContain('Pseudo : Guest-1000');
    expect(b.querySelector('.chrono-classement-avis')?.hidden).toBe(true);
    expect(inviteSansPseudo()).toBe(false);
  });

  it('un bloc ouvert sans record : rien à tirer, rien à choisir', async () => {
    const b = blocClassement(ILE, 'Classement') as unknown as El;
    await attendre();
    await attendre();
    expect(numeroInvite).not.toHaveBeenCalled();
    expect(b.querySelector('.chrono-pseudo input')).toBeNull();
    expect(await relancerAttente()).toBeNull();
  });

  it('hors ligne : « il partira au retour du réseau », et il part, numéro compris, au retour', async () => {
    numeroInvite.mockRejectedValue(horsLigne());
    const b = await apresPartie();
    expect(b.innerText).toContain(T.publication_echec);
    expect(localStorage.getItem('terramemo.pseudo')).toBeNull();
    expect(publier).not.toHaveBeenCalled();
    numeroInvite.mockResolvedValue('Guest-1001');
    expect(await relancerAttente()).toEqual({ refuses: 0, echecs: 0, locaux: 0 });
    expect(localStorage.getItem('terramemo.pseudo')).toBe('Guest-1001');
    expect(publier.mock.calls.map(([e, p, ps]) => `${e}/${p}/${ps}`)).toContain(`${AMS}/toujours/Guest-1001`);
  });

  it('un autre échec (connexion anonyme refusée) : le score reste sur l’appareil, sans promesse de départ', async () => {
    numeroInvite.mockRejectedValue(Object.assign(new Error('refusé'), { code: 'auth/admin-restricted-operation' }));
    const b = await apresPartie();
    expect(b.innerText).toContain(T.publication_locale);
    expect(b.innerText).not.toContain(T.publication_echec);
    expect(localStorage.getItem('terramemo.pseudo')).toBeNull();
  });

  it('un seul tirage à la fois : le bloc et les relances partagent le même numéro', async () => {
    enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant);
    let rendre: (p: string) => void = () => undefined;
    numeroInvite.mockReturnValue(new Promise((r) => (rendre = r)));
    const a = relancerAttente();
    const b = relancerAttente();
    rendre('Guest-1000');
    await Promise.all([a, b]);
    expect(numeroInvite).toHaveBeenCalledOnce();
    expect(localStorage.getItem('terramemo.pseudo')).toBe('Guest-1000');
  });

  it('un pseudo choisi pendant le tirage l’emporte : le numéro tiré n’est pas gardé', async () => {
    enregistrerPartie(localStorage, AMS, score(11, 11, 12, 60_000), maintenant);
    numeroInvite.mockImplementation(async () => {
      localStorage.setItem('terramemo.pseudo', 'Zoé');
      return 'Guest-1000';
    });
    await relancerAttente();
    expect(localStorage.getItem('terramemo.pseudo')).toBe('Zoé');
    expect(new Set(publier.mock.calls.map(([, , p]) => p))).toEqual(new Set(['Zoé']));
  });

  it('pas un invité de l’écran de connexion (aucun choix gardé, ou un compte) : le formulaire comme avant, aucun tirage', async () => {
    localStorage.removeItem('terramemo.accueil');
    expect(inviteSansPseudo()).toBe(false);
    const b = await apresPartie();
    expect(b.querySelector('.chrono-pseudo input')).not.toBeNull();
    localStorage.setItem('terramemo.accueil', 'invite');
    poserEtatCompte('compte');
    expect(inviteSansPseudo()).toBe(false);
    expect(await relancerAttente()).toBeNull();
    // Synchro coupée (le pilote, à chaque essai) : un invité sans pseudo ne tire pas, rien ne part au vrai projet.
    poserEtatCompte('invite');
    expect(inviteSansPseudo()).toBe(true);
    localStorage.setItem('terramemo.sans-synchro', '1');
    expect(inviteSansPseudo()).toBe(false);
    expect(await relancerAttente()).toBeNull();
    expect(numeroInvite).not.toHaveBeenCalled();
  });

  it('« Guest- » et un numéro ne se tape pas, sauf le pseudo d’invité de l’appareil lui-même', async () => {
    localStorage.removeItem('terramemo.accueil');
    const b = blocClassement(ILE, 'Classement') as unknown as El;
    await attendre();
    const z = b.querySelector('.chrono-pseudo')!;
    z.querySelector('input')!.value = 'guest-1234';
    z.querySelectorAll('button').find((x) => x.innerText === T.publier)!.click();
    await attendre();
    expect(z.innerText).toContain(T.pseudo_reserve);
    expect(localStorage.getItem('terramemo.pseudo')).toBeNull();
    // Les autres « Guest… » restent libres.
    z.querySelector('input')!.value = 'Guest 1234';
    z.querySelectorAll('button').find((x) => x.innerText === T.publier)!.click();
    await attendre();
    expect(localStorage.getItem('terramemo.pseudo')).toBe('Guest 1234');
    // Le champ des comptes : de même, et le sien (Guest-1000) se garde.
    const erreur = document.createElement('p') as unknown as HTMLElement;
    const champ = champPseudo({ id: 'p', libelle: 'Pseudo', valeur: '', erreur, entree: 'done' });
    champ.input.value = 'Guest-1000';
    expect(champ.valider()).toBeNull();
    expect(erreur.textContent).toBe(T.pseudo_reserve);
    localStorage.setItem('terramemo.pseudo', 'Guest-1000');
    expect(champ.valider()).toBe('Guest-1000');
  });
});
