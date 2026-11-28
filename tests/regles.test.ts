// Règles Firestore des classements (firestore.rules), sur l'émulateur :
// `npm run test:regles` (firebase emulators:exec pose FIRESTORE_EMULATOR_HOST).
// Sans émulateur (npm test), ces tests sont sautés. Puis le profil des
// comptes, `joueurs/{uid}` (J1b, lot 2, étude § 6), règles chargées avec
// essai() ouvert (tests/regles-essai.ts) : celles du dépôt le gardent fermé.
// Enfin les lots de la synchro, `joueurs/{uid}/lots/{lot}` (lot 3, § 5.2 et
// § 6), et la copie client de lotValide (problemeLot) confrontée aux règles ;
// les demandes de retrait des places d'un compte supprimé, `demandes/{uid}`
// (lot 5, § 7.1, D27 b).
// Les silhouettes du J4 (lot 1) visibles ici (src/visibles.ts remplacé) : les
// règles les acceptent d'avance, avant que le site ne les ouvre, et la borne
// du général des règles est celle du client qui les montre, avec les voisins
// du lot 2 (1 887).
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/visibles', () => ({ SILHOUETTES_VISIBLES: true }));
import { semaine } from '../src/epreuve/bareme';
import { BORNE_GENERAL, clePermise, clePseudo, formePseudo, idEpreuve, idQuiz, pseudoValide, TEMPS_CHRONO_VOISINS_MS, tempsMaxQuiz, vraisemblable } from '../src/epreuve/chrono';
import { DIFFICULTES } from '../src/quiz/types';
import type { Evenement } from '../src/srs/journal';
import { docDuLot, problemeLot, type DocLot } from '../src/sync/lots';
import { ESSAI_DU_DEPOT, REGLES, reglesAvecEssai } from './regles-essai';

const hote = process.env.FIRESTORE_EMULATOR_HOST;
const E = 'chrono:localiser:South America';

const score = (o: Record<string, unknown> = {}) => ({
  pseudo: 'Michel',
  points: 11,
  justes: 11,
  questions: 12,
  temps_ms: 60_000,
  date: serverTimestamp(),
  bareme: 2,
  ...o,
});
// La place du pseudo « Michel » par défaut : son nom en minuscules.
const place = (db: Firestore, cle = 'michel', periode = 'toujours', epreuve = E) => doc(db, 'classements', epreuve, 'periodes', periode, 'scores', cle);
const cetteSemaine = () => `s${semaine(Date.now())}`;

describe.skipIf(!hote)('règles des classements (émulateur)', () => {
  let env: RulesTestEnvironment;
  const db = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()) as unknown as Firestore;

  beforeAll(async () => {
    const [host, port] = (hote ?? '').split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-terramemo',
      firestore: { rules: REGLES, host, port: Number(port) },
    });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => env.clearFirestore());

  it('lecture ouverte à tous, même sans compte', async () => {
    await assertSucceeds(setDoc(place(db('ana')), score()));
    await assertSucceeds(getDoc(place(db(null))));
    await assertSucceeds(getDocs(collection(db(null), 'classements', E, 'periodes', 'toujours', 'scores')));
  });

  it('écrire demande un compte ; la place porte le nom du pseudo en minuscules', async () => {
    await assertFails(setDoc(place(db(null)), score()));
    await assertFails(setDoc(place(db('ana'), 'ana'), score()));
    // L'ancienne appli nommait la place par le compte : refusée.
    const uid = 'iZxOGkMd52OWTZ11yu54w677kow2';
    await assertFails(setDoc(place(db(uid), uid), score()));
    await assertSucceeds(setDoc(place(db('ana')), score()));
  });

  it('la clé est le pseudo en minuscules, sans autre place possible ; la forme du pseudo ; formePseudo et clePermise (pseudoValide) jugent comme les règles', async () => {
    // [clé, pseudo, acceptée] : chaque essai est une création sur une base vide (seules la clé et la forme du pseudo peuvent la refuser).
    const cas: [string, string, boolean][] = [
      ['michel', 'MICHEL', true],
      ['michel', 'Michou', false], // la place d'un autre, même longueur
      ['xxxxxx', 'Michel', false],
      ['Michel', 'Michel', false], // une majuscule dans la clé
      ['hélène', 'Hélène', true],
      ['hölène', 'Hélène', false],
      ['helene', 'Hélène', false],
      ['michel', 'Michél', false],
      // Majuscule non ASCII, que lower() des règles ne baisse pas.
      ['élodie', 'Élodie', true],
      ['œil de lynx', 'Œil de Lynx', true],
      ['ñandú 42', 'Ñandú 42', true],
      ['Élodie', 'Élodie', false],
      ['elodie', 'Élodie', false],
      ['élodiz', 'Élodie', false],
      ['michel', 'Ḿichel', false],
      // Un vrai « _ » ou « ~ » de la clé ne tient pas lieu d'un caractère non ASCII.
      ['_lodie', 'Élodie', false],
      ['~lodie', 'Élodie', false],
      ['jean_luc', 'JeanÉLuc', false],
      // À une place non ASCII, seule une lettre minuscule (sans la comparer) : ni emoji, ni contrôle, ni combinant.
      ['ölodie', 'Élodie', true],
      ['😀lodie', 'Élodie', false],
      ['́lodie', 'Élodie', false],
      ['‮lodie', 'Élodie', false],
      [' lodie', 'Élodie', false],
      ['\nlodie', 'Élodie', false],
      // Un saut de ligne ne cache pas une majuscule (clePermise) ; la forme du pseudo le refuse de toute façon (#25).
      ['é\nÉ', 'É\nÉ', false],
      ['é\né', 'É\nÉ', false],
      // Sans majuscule non ASCII, les caractères non ASCII sont ceux du pseudo.
      ['李明', '李明', true],
      ['李朋', '李明', false],
      ['राम', 'राम', true],
      ['michel ★', 'Michel ★', true],
      ['michel ☆', 'Michel ★', false],
      // Lettres de fantaisie et İ turc : la clé de l'appli est refusée, pseudoValide le dit d'avance.
      [clePseudo('Ⓜichel'), 'Ⓜichel', false],
      [clePseudo('𝐌𝐢𝐜𝐡𝐞𝐥'), '𝐌𝐢𝐜𝐡𝐞𝐥', false],
      [clePseudo('İrem'), 'İrem', false],
      [clePseudo('ΟΔΟΣ'), 'ΟΔΟΣ', true],
      [clePseudo('ǅemal'), 'ǅemal', true],
      [clePseudo('Straße'), 'Straße', true],
      // Forme du pseudo (audit du 07/11, #25) : les pseudos en ligne passent, et les mots séparés d'une espace simple.
      ['michel', 'Michel', true],
      ['wiwi', 'Wiwi', true],
      ['jean luc', 'Jean Luc', true],
      ['ana 😀', 'Ana 😀', true],
      // Un point de code non assigné (U+0378) passe : le \p{C} de RE2 n'a pas Cn, formePseudo non plus. Un usage privé, non.
      ['léa \u0378', 'Léa \u0378', true],
      ['mi\ue000chel', 'Mi\ue000chel', false],
      // Ni invisible (espace sans chasse, trait d'union conditionnel, joint sans chasse, inversion bidi), ni contrôle,
      // ni séparateur Unicode (insécable, fine, de ligne), ni espace au bord ou doublée ; la clé, elle, est permise.
      ['michel\u200b', 'Michel\u200b', false],
      ['mi\u00adchel', 'Mi\u00adchel', false],
      ['mi\u200dchel', 'Mi\u200dchel', false],
      ['\u202emichel', '\u202eMichel', false],
      ['mi\tchel', 'Mi\tchel', false],
      ['michel\u00a0d', 'Michel\u00a0D', false],
      ['michel\u2009d', 'Michel\u2009D', false],
      ['michel\u2028d', 'Michel\u2028D', false],
      [' michel', ' Michel', false],
      ['michel ', 'Michel ', false],
      ['michel  d', 'Michel  D', false],
      // La branche masquée de cleDuPseudo (majuscule non ASCII) : la forme s'y ajoute sans la changer.
      ['élodie\u200b', 'Élodie\u200b', false],
      ['élodie b', 'Élodie B', true],
    ];
    for (const [cle, pseudo, acceptee] of cas) {
      await env.clearFirestore();
      const ecrire = setDoc(place(db('ana'), cle), score({ pseudo }));
      if (acceptee) await assertSucceeds(ecrire);
      else await assertFails(ecrire);
      expect([cle, pseudo, formePseudo(pseudo) && clePermise(cle, pseudo)]).toEqual([cle, pseudo, acceptee]);
    }
    // Ceux que la forme refuse : leur clé est permise (seule la forme les arrête), sauf « é\nÉ » et sa majuscule.
    for (const [cle, pseudo] of cas.filter(([, p]) => !formePseudo(p))) expect([cle, pseudo, clePermise(cle, pseudo)]).toEqual([cle, pseudo, cle !== 'é\nÉ']);
    for (const p of ['Ⓜichel', '𝐌𝐢𝐜𝐡𝐞𝐥', 'İrem']) expect(pseudoValide(p)).toBeNull();
  });

  it('une place par pseudo : deux comptes (deux appareils) du même pseudo la partagent, le meilleur reste', async () => {
    await assertSucceeds(setDoc(place(db('telephone')), score({ points: 6, justes: 6, temps_ms: 98_000, questions: 12 })));
    await assertSucceeds(setDoc(place(db('pc')), score({ points: 11, justes: 11 })));
    await assertFails(setDoc(place(db('apk')), score({ points: 10, justes: 10 })));
    await assertSucceeds(setDoc(place(db('apk')), score({ pseudo: 'MICHEL', points: 11, justes: 11, temps_ms: 50_000 })));
    await assertFails(setDoc(place(db('telephone')), score({ points: 11, justes: 11 })));
    const d = await getDoc(place(db(null)));
    expect([d.get('pseudo'), d.get('points'), d.get('temps_ms')]).toEqual(['MICHEL', 11, 50_000]);
  });

  it('accents et majuscules : la clé du client (toLowerCase) passe les règles', async () => {
    for (const pseudo of ['Hélène', 'ÉLODIE', 'Œdipe ÇA', 'Zoë-María', 'ÀÂÄÈÊËÎÏÔÖÙÛÜŸ', 'Ñandú 42', 'Straße', 'Ève-Marie B', 'Jean_Luc ~2', 'Ζωή']) {
      expect(pseudoValide(pseudo)).toBe(pseudo);
      await assertSucceeds(setDoc(place(db('ana'), clePseudo(pseudo)), score({ pseudo })));
    }
  });

  it('de toujours et de la semaine en cours ; pas une semaine passée ou à venir', async () => {
    const n = semaine(Date.now());
    await assertSucceeds(setDoc(place(db('ana'), 'michel', cetteSemaine()), score()));
    await assertFails(setDoc(place(db('ana'), 'michel', `s${n - 1}`), score()));
    await assertFails(setDoc(place(db('ana'), 'michel', `s${n + 1}`), score()));
    await assertFails(setDoc(place(db('ana'), 'michel', 'demain'), score()));
  });

  it('bornes du barème 2 (points = justes) et taille de l’épreuve', async () => {
    const a = db('ana');
    // 11 justes et une erreur : 11 points, ni plus ni moins.
    await assertSucceeds(setDoc(place(a), score()));
    await env.clearFirestore();
    await assertFails(setDoc(place(a), score({ points: 12 })));
    await assertFails(setDoc(place(a), score({ points: 10 })));
    // Les points du barème 1 (1 000 par juste, jusqu'à 500 par erreur proche) : refusés.
    await assertFails(setDoc(place(a), score({ points: 11_000 })));
    await assertFails(setDoc(place(a), score({ points: 11_351 })));
    await assertFails(setDoc(place(a), score({ justes: 13, points: 13 })));
    await assertFails(setDoc(place(a), score({ questions: 13 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:localiser:Atlantide'), score()));
    await assertFails(setDoc(place(a), score({ temps_ms: 12 * 200 - 1 })));
    await assertFails(setDoc(place(a), score({ temps_ms: 12 * 15_000 + 1 })));
    await assertFails(setDoc(place(a), score({ points: 11.5 })));
  });

  it('épreuve de l’île : 24 communes, mêmes bornes du barème', async () => {
    const a = db('ana');
    const I = 'chrono:localiser:reunion';
    // 23 justes et une erreur : 23 points.
    const ile = (o: Record<string, unknown> = {}) => score({ questions: 24, justes: 23, points: 23, temps_ms: 120_000, ...o });
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', I), ile()));
    await env.clearFirestore();
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ points: 24 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ points: 22 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ points: 23_500 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ questions: 23, justes: 22, points: 22 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ questions: 25 })));
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', I), ile({ temps_ms: 100_000 })));
  });

  it('vraisemblable() du client juge comme les règles (un score qu’il écarte serait refusé, et inversement)', async () => {
    const I = 'chrono:localiser:reunion';
    const cas = [
      { questions: 24, justes: 24, points: 24, temps_ms: 4_800 },
      { questions: 24, justes: 24, points: 24, temps_ms: 4_799 },
      { questions: 24, justes: 24, points: 24, temps_ms: 1_433 },
      { questions: 24, justes: 0, points: 0, temps_ms: 360_000 },
      { questions: 24, justes: 0, points: 0, temps_ms: 360_001 },
      { questions: 24, justes: 23, points: 23, temps_ms: 120_000 },
      { questions: 24, justes: 23, points: 24, temps_ms: 120_000 },
      { questions: 24, justes: 23, points: 22, temps_ms: 120_000 },
      { questions: 24, justes: 23, points: 23_500, temps_ms: 120_000 },
    ];
    for (const [i, c] of cas.entries()) {
      const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', I), score({ ...c, pseudo: `Joueur ${i}` }));
      if (vraisemblable(c, I)) await assertSucceeds(ecrire);
      else await assertFails(ecrire);
    }
  });

  it('Sans faute : justes d’affilée (points = justes), l’erreur de la fin en plus, sauf la série vidée', async () => {
    const a = db('ana');
    const S = idEpreuve('South America', 'sansfaute');
    const sf = (o: Record<string, unknown> = {}) => score({ points: 7, justes: 7, questions: 8, temps_ms: 30_000, ...o });
    const ecrire = (o: Record<string, unknown> = {}, cle = 'michel') => setDoc(place(a, cle, 'toujours', S), sf({ pseudo: cle === 'michel' ? 'Michel' : cle, ...o }));
    await assertSucceeds(ecrire());
    await assertSucceeds(ecrire({ points: 12, justes: 12, questions: 12, temps_ms: 40_000 }, 'vide'));
    await assertSucceeds(ecrire({ points: 0, justes: 0, questions: 1, temps_ms: 0 }, 'zero'));
    for (const o of [
      { points: 7_000 }, // les points du Chrono au barème 1
      { questions: 9 }, // deux erreurs
      { questions: 7 }, // sans erreur, sans vider la série
      { points: 13, justes: 13, questions: 13 }, // plus que la série
      { temps_ms: 7 * 200 - 1 },
      { temps_ms: 7 * 15_000 + 1 },
    ])
      await assertFails(ecrire(o, 'faux'));
    await assertFails(setDoc(place(a, 'michel', 'toujours', 'sansfaute:localiser:Atlantide'), sf()));
    await assertFails(setDoc(place(a, 'michel', 'toujours', 'sansfaute:nommer:Europe'), sf()));
    // Progresse : plus de justes, ou autant plus vite.
    await assertFails(ecrire({ points: 6, justes: 6, questions: 7 }));
    await assertSucceeds(ecrire({ temps_ms: 25_000 }));
    await assertSucceeds(ecrire({ points: 8, justes: 8, questions: 9, temps_ms: 60_000 }));
  });

  it('Minute retiré (décision « Barème et classements », 12/11/2026) : « minute:… » refusé, en création comme en mise à jour, id réservé', async () => {
    const a = db('ana');
    const mi = (o: Record<string, unknown> = {}) => score({ points: 20, justes: 20, questions: 23, temps_ms: 60_000, ...o });
    for (const M of ['minute:localiser:Africa', 'minute:localiser:reunion', 'minute:capitales:Oceania', 'minute:drapeaux:tous', 'minute:mers:mers']) {
      await assertFails(setDoc(place(a, 'michel', 'toujours', M), mi()));
      await assertFails(setDoc(place(a, 'michel', cetteSemaine(), M), mi()));
    }
    // Une place de Minute d'avant (au barème 1) ne se réécrit plus, même mieux ; elle reste lisible.
    const M = 'minute:localiser:Africa';
    await env.withSecurityRulesDisabled(async (c) => void (await setDoc(place(c.firestore() as unknown as Firestore, 'michel', 'toujours', M), { ...mi({ bareme: 1 }), date: Timestamp.now() })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', M), mi({ points: 30, justes: 30, questions: 31 })));
    await assertSucceeds(getDoc(place(db(null), 'michel', 'toujours', M)));
  });

  it('vraisemblable() du client juge comme les règles pour Sans faute, et pour Minute retiré (toujours refusé)', async () => {
    const S = idEpreuve('reunion', 'sansfaute');
    const M = 'minute:localiser:reunion';
    const cas: [string, Record<string, number>][] = [
      [S, { questions: 18, justes: 17, points: 17, temps_ms: 60_000 }],
      [S, { questions: 18, justes: 17, points: 17, temps_ms: 3_399 }],
      [S, { questions: 18, justes: 17, points: 17, temps_ms: 255_001 }],
      [S, { questions: 19, justes: 17, points: 17, temps_ms: 60_000 }],
      [S, { questions: 1, justes: 0, points: 0, temps_ms: 0 }],
      [M, { questions: 23, justes: 20, points: 20, temps_ms: 60_000 }],
      [M, { questions: 0, justes: 0, points: 0, temps_ms: 60_000 }],
    ];
    for (const [i, [e, c]] of cas.entries()) {
      const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', e), score({ ...c, pseudo: `Joueur ${i}` }));
      if (vraisemblable(c as never, e)) await assertSucceeds(ecrire);
      else await assertFails(ecrire);
    }
  });

  it('forme du document : champs, pseudo, date du serveur, version du barème (2 seulement)', async () => {
    const a = db('ana');
    await assertFails(setDoc(place(a), { ...score(), triche: true }));
    const { bareme: _b, ...sansBareme } = score();
    await assertFails(setDoc(place(a), sansBareme));
    await assertFails(setDoc(place(a), score({ bareme: 1 })));
    await assertFails(setDoc(place(a), score({ bareme: 1, points: 11_351 })));
    await assertFails(setDoc(place(a), score({ bareme: 3 })));
    await assertFails(setDoc(place(a, 'm'), score({ pseudo: 'M' })));
    await assertFails(setDoc(place(a, 'x'.repeat(21)), score({ pseudo: 'x'.repeat(21) })));
    await assertFails(setDoc(place(a), score({ date: Timestamp.fromMillis(Date.now()) })));
    await assertSucceeds(setDoc(place(a), score({ bareme: 2 })));
  });

  it('un record ne se réécrit que s’il progresse ; à score égal, le pseudo stocké reste', async () => {
    const a = db('ana');
    const bob = db('bob');
    await assertSucceeds(setDoc(place(a), score()));
    await assertFails(setDoc(place(a), score({ points: 10, justes: 10 })));
    await assertFails(setDoc(place(a), score({ temps_ms: 61_000 })));
    // Le même score, réécrit tel quel (republication d'un appareil) : rien ne change.
    await assertSucceeds(setDoc(place(a), score()));
    // Un autre appareil ne renomme pas la place sans la battre, même à la casse près.
    await assertFails(setDoc(place(bob), score({ pseudo: 'MICHEL' })));
    await assertFails(setDoc(place(bob), score({ pseudo: 'Michou' })));
    await assertFails(setDoc(place(a), score({ pseudo: 'Michel D' })));
    expect((await getDoc(place(a))).data()?.pseudo).toBe('Michel');
    // En la battant, il y met sa casse.
    await assertSucceeds(setDoc(place(bob), score({ pseudo: 'MICHEL', temps_ms: 50_000 })));
    expect((await getDoc(place(a))).data()?.pseudo).toBe('MICHEL');
    await assertFails(setDoc(place(bob), score({ pseudo: 'Michou', points: 12, justes: 12, temps_ms: 90_000 })));
    await assertSucceeds(setDoc(place(a), score({ points: 12, justes: 12, temps_ms: 90_000 })));
  });

  it('moins de questions à points et temps égaux : plus un progrès (Minute retiré), le pseudo stocké reste', async () => {
    const a = db('ana');
    const general = (o: Record<string, unknown>) => setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 414, justes: 300, points: 300, temps_ms: 3_000_000, ...o }));
    await assertSucceeds(general({}));
    // Égalité visible au classement (points, puis temps) : pas de nouveau nom.
    await assertFails(general({ questions: 300, pseudo: 'MICHEL' }));
    await assertSucceeds(general({ questions: 300 }));
  });

  // Filet de progresse() (décision « Barème et classements », 12/11/2026) :
  // une place du barème 1 que la migration de l'outil du propriétaire n'a pas
  // encore réécrite se compare par ses justes ; sinon ses ~1 000 points par
  // juste ne seraient jamais battus par un score du barème 2.
  describe('une place du barème 1 (avant la migration) : comparée par ses justes', () => {
    const T = idEpreuve('tous');
    /**
     * Écrit, règles levées, la place v1 de « Michel » au Chrono de tous les
     * pays : 190 justes, 190 351 points ; `sansBareme` : sans le champ, comme
     * une place plus ancienne encore.
     */
    const ancienne = async (sansBareme = false) => {
      const d: Record<string, unknown> = { pseudo: 'Michel', points: 190_351, justes: 190, questions: 195, temps_ms: 900_000, date: Timestamp.now(), bareme: 1 };
      if (sansBareme) delete d.bareme;
      await env.withSecurityRulesDisabled(async (c) => void (await setDoc(place(c.firestore() as unknown as Firestore, 'michel', 'toujours', T), d)));
    };
    const v2 = (justes: number, temps_ms: number, o: Record<string, unknown> = {}) => score({ points: justes, justes, questions: 195, temps_ms, ...o });
    const ecrire = (s: Record<string, unknown>, periode = 'toujours') => setDoc(place(db('ana'), 'michel', periode, T), s);

    it('battue par 191 justes, par 190 justes plus rapides ; pas par 189 justes, ni par 190 plus lentes', async () => {
      await ancienne();
      await assertFails(ecrire(v2(189, 600_000)));
      await assertFails(ecrire(v2(190, 950_000)));
      await assertSucceeds(ecrire(v2(190, 850_000)));
      expect((await getDoc(place(db(null), 'michel', 'toujours', T))).data()).toMatchObject({ points: 190, justes: 190, temps_ms: 850_000, bareme: 2 });
      await ancienne();
      await assertSucceeds(ecrire(v2(191, 1_000_000)));
      expect((await getDoc(place(db(null), 'michel', 'toujours', T))).data()).toMatchObject({ points: 191, bareme: 2 });
    });

    it('sans champ bareme (une place plus ancienne encore) : de même', async () => {
      await ancienne(true);
      expect((await getDoc(place(db(null), 'michel', 'toujours', T))).data()?.bareme).toBeUndefined();
      await assertFails(ecrire(v2(189, 600_000)));
      await assertSucceeds(ecrire(v2(191, 1_000_000)));
    });

    it('le même score en justes, republié par le même pseudo, la réécrit au barème 2 ; un autre pseudo, non', async () => {
      await ancienne();
      await assertFails(ecrire(v2(190, 900_000, { pseudo: 'MICHEL' })));
      await assertSucceeds(ecrire(v2(190, 900_000)));
      expect((await getDoc(place(db(null), 'michel', 'toujours', T))).data()).toMatchObject({ points: 190, bareme: 2 });
    });

    it('le vieux score (~1 000 × justes) ne se publie plus, même sur une place vide', async () => {
      await assertFails(ecrire(score({ points: 190_351, justes: 190, questions: 195, temps_ms: 900_000 })));
      await assertFails(ecrire(score({ points: 190_351, justes: 190, questions: 195, temps_ms: 900_000, bareme: 1 })));
      await assertFails(ecrire(score({ points: 190_351, justes: 190, questions: 195, temps_ms: 900_000 }), cetteSemaine()));
    });
  });

  it('général : la somme des épreuves du Chrono des sujets ouverts, 1887 questions au plus (390 des pays + 24 de l’île + 390 des capitales + 390 des drapeaux + 50 des mers + 332 des silhouettes + 311 des voisins, D40 a, D603 a)', async () => {
    const a = db('ana');
    expect(BORNE_GENERAL).toBe(1887);
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1887, justes: 600, points: 600, temps_ms: 9_000_000 })));
    await env.clearFirestore();
    await assertFails(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1888, justes: 600, points: 600, temps_ms: 9_000_000 })));
    // 1576, la borne d'avant les voisins, et 1555, celle du client qui cache les silhouettes, restent acceptées.
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1576, justes: 600, points: 600, temps_ms: 8_000_000 })));
    await env.clearFirestore();
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1555, justes: 600, points: 600, temps_ms: 8_000_000 })));
    await env.clearFirestore();
    // 1244, la borne d'avant les silhouettes (et celle du client qui les cache), reste acceptée.
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1244, justes: 600, points: 600, temps_ms: 6_000_000 })));
    await env.clearFirestore();
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1245, justes: 600, points: 600, temps_ms: 6_000_000 })));
    await env.clearFirestore();
    // Points = justes au général aussi : la somme des points du barème 1, refusée.
    await assertFails(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1244, justes: 600, points: 600_000, temps_ms: 6_000_000 })));
    // Les anciennes bornes (414, puis 804 avec les capitales, 1194 avec les drapeaux) n'arrêtent plus rien.
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 415, justes: 300, points: 300, temps_ms: 3_000_000 })));
    await env.clearFirestore();
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 805, justes: 600, points: 600, temps_ms: 6_000_000 })));
    await env.clearFirestore();
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 1195, justes: 600, points: 600, temps_ms: 6_000_000 })));
  });

  it('vraisemblable() du client juge comme les règles pour le général (BORNE_GENERAL)', async () => {
    const cas = [
      { questions: 1244, justes: 600, points: 600, temps_ms: 6_000_000 },
      { questions: 1245, justes: 600, points: 600, temps_ms: 6_000_000 },
      { questions: 1244, justes: 1244, points: 1244, temps_ms: 1244 * 200 },
      { questions: 1244, justes: 1244, points: 1244, temps_ms: 1244 * 200 - 1 },
      { questions: 1244, justes: 0, points: 0, temps_ms: 1244 * 15_000 },
      { questions: 1244, justes: 0, points: 0, temps_ms: 1244 * 15_000 + 1 },
      { questions: 1244, justes: 600, points: 601, temps_ms: 6_000_000 },
      { questions: 1244, justes: 600, points: 600_000, temps_ms: 6_000_000 },
      { questions: 1194, justes: 600, points: 600, temps_ms: 6_000_000 },
      { questions: 1195, justes: 600, points: 600, temps_ms: 6_000_000 },
      { questions: 804, justes: 600, points: 600, temps_ms: 6_000_000 },
      { questions: 1576, justes: 600, points: 600, temps_ms: 8_000_000 },
      { questions: 1577, justes: 600, points: 600, temps_ms: 8_000_000 },
      { questions: 1887, justes: 600, points: 600, temps_ms: 9_000_000 },
      { questions: 1888, justes: 600, points: 600, temps_ms: 9_000_000 },
    ];
    for (const [i, c] of cas.entries()) {
      const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', 'general'), score({ ...c, pseudo: `Joueur ${i}` }));
      if (vraisemblable(c, 'general')) await assertSucceeds(ecrire);
      else await assertFails(ecrire);
    }
  });

  describe('épreuves des capitales (lot 1 du J2, étude § 8.2 ; D37 c : séries et tailles des pays)', () => {
    const CAP_AFR = idEpreuve('Africa', 'chrono', 'capitales');
    // 50 justes et 4 erreurs sur les 54 pays d'Afrique.
    const afrique = (o: Record<string, unknown> = {}) => score({ questions: 54, justes: 50, points: 50, temps_ms: 300_000, ...o });

    it('chrono:capitales:Africa : accepté à la bonne taille (54), refusé à une autre (53, celle de D37 a, ou 55)', async () => {
      const a = db('ana');
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', CAP_AFR), afrique()));
      await env.clearFirestore();
      await assertFails(setDoc(place(a, 'michel', 'toujours', CAP_AFR), afrique({ questions: 53, justes: 49, points: 49 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', CAP_AFR), afrique({ questions: 55 })));
      await assertSucceeds(setDoc(place(a, 'michel', cetteSemaine(), CAP_AFR), afrique()));
    });

    it('chaque série des capitales a la taille des pays : tous 195, Asie 48, Europe 44, Amérique du Nord 23, Océanie 14, Amérique du Sud 12', async () => {
      const a = db('ana');
      const tailles: Record<string, number> = { tous: 195, Africa: 54, Asia: 48, Europe: 44, 'North America': 23, Oceania: 14, 'South America': 12 };
      for (const [serie, n] of Object.entries(tailles)) {
        const e = idEpreuve(serie, 'chrono', 'capitales');
        await assertSucceeds(setDoc(place(a, 'michel', 'toujours', e), score({ questions: n, justes: n, points: n, temps_ms: n * 5_000 })));
        await assertFails(setDoc(place(a, 'autre', 'toujours', e), score({ pseudo: 'Autre', questions: n - 1, justes: n - 1, points: n - 1, temps_ms: n * 5_000 })));
      }
    });

    it('refusés : chrono:capitales:reunion (pas d’île sous Capitales), chrono:localiser:mers, chrono:capitales:mers, une clé inconnue', async () => {
      const a = db('ana');
      const ile = score({ questions: 24, justes: 23, points: 23, temps_ms: 120_000 });
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:capitales:reunion'), ile));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:localiser:mers'), score({ questions: 50, justes: 50, points: 50, temps_ms: 200_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:capitales:Atlantide'), afrique()));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:capitales:mers'), score({ questions: 50, justes: 50, points: 50, temps_ms: 200_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:xyz:Africa'), afrique()));
      // L'île des communes reste acceptée sous `localiser`.
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', idEpreuve('reunion')), ile));
    });

    it('Sans faute des capitales : ses bornes, la taille de la série des pays ; Minute retiré, refusé', async () => {
      const a = db('ana');
      const S = idEpreuve('Oceania', 'sansfaute', 'capitales');
      // Sans faute : 9 d'affilée puis une erreur ; l'Océanie vidée (14) ; jamais plus que la série.
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', S), score({ points: 9, justes: 9, questions: 10, temps_ms: 30_000 })));
      await assertSucceeds(setDoc(place(a, 'vide', 'toujours', S), score({ pseudo: 'Vide', points: 14, justes: 14, questions: 14, temps_ms: 40_000 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', S), score({ pseudo: 'Faux', points: 15, justes: 15, questions: 15, temps_ms: 40_000 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', S), score({ pseudo: 'Faux', points: 9_000, justes: 9, questions: 10, temps_ms: 30_000 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', 'sansfaute:capitales:reunion'), score({ pseudo: 'Faux', points: 9, justes: 9, questions: 10, temps_ms: 30_000 })));
      // Minute : ce qu'il acceptait avant (60 s pleines), refusé.
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'minute:capitales:Oceania'), score({ points: 12, justes: 12, questions: 14, temps_ms: 60_000 })));
    });

    it('vraisemblable() du client juge comme les règles pour les capitales (Chrono, Sans faute ; Minute retiré)', async () => {
      const C = idEpreuve('Oceania', 'chrono', 'capitales');
      const S = idEpreuve('Oceania', 'sansfaute', 'capitales');
      const M = 'minute:capitales:Oceania';
      const cas: [string, Record<string, number>][] = [
        [C, { questions: 14, justes: 14, points: 14, temps_ms: 2_800 }],
        [C, { questions: 14, justes: 14, points: 14, temps_ms: 2_799 }],
        [C, { questions: 14, justes: 12, points: 12, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 12, points: 13, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 12, points: 11, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 12, points: 13_000, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 0, points: 0, temps_ms: 210_000 }],
        [C, { questions: 14, justes: 0, points: 0, temps_ms: 210_001 }],
        [S, { questions: 10, justes: 9, points: 9, temps_ms: 30_000 }],
        [S, { questions: 10, justes: 9, points: 9, temps_ms: 9 * 200 - 1 }],
        [S, { questions: 11, justes: 9, points: 9, temps_ms: 30_000 }],
        [S, { questions: 14, justes: 14, points: 14, temps_ms: 40_000 }],
        [M, { questions: 14, justes: 12, points: 12, temps_ms: 60_000 }],
      ];
      for (const [i, [e, c]] of cas.entries()) {
        const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', e), score({ ...c, pseudo: `Joueur ${i}` }));
        if (vraisemblable(c as never, e)) await assertSucceeds(ecrire);
        else await assertFails(ecrire);
      }
    });
  });

  describe('épreuves des silhouettes (lot 1 du J4, D618 a, D603 a : les séries des pays sans les 29 micro-États)', () => {
    const SIL_AFR = idEpreuve('Africa', 'chrono', 'silhouettes');
    // 45 justes et 4 erreurs sur les 49 silhouettes d'Afrique.
    const afrique = (o: Record<string, unknown> = {}) => score({ questions: 49, justes: 45, points: 45, temps_ms: 300_000, ...o });

    it('chrono:silhouettes:Africa : accepté à 49 questions, refusé à 48, 50 ou 54 (la taille des pays)', async () => {
      const a = db('ana');
      expect(SIL_AFR).toBe('chrono:silhouettes:Africa');
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', SIL_AFR), afrique()));
      await env.clearFirestore();
      for (const questions of [48, 50, 54]) await assertFails(setDoc(place(a, 'michel', 'toujours', SIL_AFR), afrique({ questions })));
      await assertSucceeds(setDoc(place(a, 'michel', cetteSemaine(), SIL_AFR), afrique()));
    });

    it('chaque série : tous 166, Afrique 49, Asie 45, Europe 38, Amérique du Nord 16, Amérique du Sud 12, Océanie 6 ; ni l’île, ni Minute', async () => {
      const a = db('ana');
      const tailles: Record<string, number> = { tous: 166, Africa: 49, Asia: 45, Europe: 38, 'North America': 16, 'South America': 12, Oceania: 6 };
      for (const [serie, n] of Object.entries(tailles)) {
        for (const mode of ['chrono', 'sansfaute'] as const) {
          const e = idEpreuve(serie, mode, 'silhouettes');
          await assertSucceeds(setDoc(place(a, 'michel', 'toujours', e), score({ questions: n, justes: n, points: n, temps_ms: n * 5_000 })));
          await assertFails(setDoc(place(a, 'grand', 'toujours', e), score({ pseudo: 'Grand', questions: n + 1, justes: n + 1, points: n + 1, temps_ms: n * 5_000 })));
        }
      }
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:silhouettes:reunion'), score({ questions: 24, justes: 23, points: 23, temps_ms: 120_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'minute:silhouettes:Oceania'), score({ questions: 6, justes: 6, points: 6, temps_ms: 60_000 })));
    });
  });

  describe('épreuves des voisins (lot 2 du J4, § 3.4 ; D607 a, exception du 28/11 de « Barème et classements »)', () => {
    const VOI_EUR = idEpreuve('Europe', 'chrono', 'voisins');
    const europe = (o: Record<string, unknown> = {}) => score({ questions: 42, justes: 40, points: 40, temps_ms: 500_000, ...o });

    it('chrono:voisins:Europe : 500 s passe, 600 s non (au-delà de 518 s, la somme de ses délais), alors que 15 s par question l’admettraient', async () => {
      const a = db('ana');
      expect(VOI_EUR).toBe('chrono:voisins:Europe');
      expect(TEMPS_CHRONO_VOISINS_MS.Europe).toBe(518_000);
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', VOI_EUR), europe()));
      await env.clearFirestore();
      await assertFails(setDoc(place(a, 'michel', 'toujours', VOI_EUR), europe({ temps_ms: 600_000 })));
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', VOI_EUR), europe({ temps_ms: 518_000 })));
      await env.clearFirestore();
      await assertFails(setDoc(place(a, 'michel', 'toujours', VOI_EUR), europe({ temps_ms: 518_001 })));
    });

    it('sansfaute:voisins:Asia : 3 justes en 90 s passent (plus de 15 s par juste), en 100 s non (32 s par juste au plus)', async () => {
      const a = db('ana');
      const e = idEpreuve('Asia', 'sansfaute', 'voisins');
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', e), score({ questions: 4, justes: 3, points: 3, temps_ms: 90_000 })));
      await env.clearFirestore();
      await assertFails(setDoc(place(a, 'michel', 'toujours', e), score({ questions: 4, justes: 3, points: 3, temps_ms: 100_000 })));
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', e), score({ questions: 4, justes: 3, points: 3, temps_ms: 96_000 })));
      // Ailleurs, Sans faute garde ses 15 s par juste.
      await assertFails(setDoc(place(a, 'michel', 'toujours', idEpreuve('Asia', 'sansfaute', 'pays')), score({ questions: 4, justes: 3, points: 3, temps_ms: 90_000 })));
    });

    it('chaque série : tous 156, Afrique 48, Asie 41, Europe 42, Amérique du Nord 12, Amérique du Sud 12 ; ni l’Océanie, ni l’île, ni Minute', async () => {
      const a = db('ana');
      const tailles: Record<string, number> = { tous: 156, Africa: 48, Asia: 41, Europe: 42, 'North America': 12, 'South America': 12 };
      for (const [serie, n] of Object.entries(tailles)) {
        for (const mode of ['chrono', 'sansfaute'] as const) {
          const e = idEpreuve(serie, mode, 'voisins');
          await assertSucceeds(setDoc(place(a, 'michel', 'toujours', e), score({ questions: n, justes: n, points: n, temps_ms: n * 5_000 })));
          await assertFails(setDoc(place(a, 'grand', 'toujours', e), score({ pseudo: 'Grand', questions: n + 1, justes: n + 1, points: n + 1, temps_ms: n * 5_000 })));
        }
      }
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:voisins:Oceania'), score({ questions: 1, justes: 1, points: 1, temps_ms: 5_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:voisins:reunion'), score({ questions: 24, justes: 23, points: 23, temps_ms: 120_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'minute:voisins:Europe'), score({ questions: 42, justes: 42, points: 42, temps_ms: 60_000 })));
    });

    it('vraisemblable() du client juge comme les règles, Chrono et Sans faute des voisins', async () => {
      const cas: [string, { questions: number; justes: number; points: number; temps_ms: number }][] = [];
      for (const [serie, max] of Object.entries(TEMPS_CHRONO_VOISINS_MS)) {
        const n = { tous: 156, Africa: 48, Asia: 41, Europe: 42, 'North America': 12, 'South America': 12 }[serie]!;
        cas.push([idEpreuve(serie, 'chrono', 'voisins'), { questions: n, justes: n - 1, points: n - 1, temps_ms: max }]);
        cas.push([idEpreuve(serie, 'chrono', 'voisins'), { questions: n, justes: n - 1, points: n - 1, temps_ms: max + 1 }]);
      }
      for (const t of [3 * 32_000, 3 * 32_000 + 1, 3 * 15_000 + 1]) cas.push([idEpreuve('Africa', 'sansfaute', 'voisins'), { questions: 4, justes: 3, points: 3, temps_ms: t }]);
      for (const [i, [e, c]] of cas.entries()) {
        const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', e), score({ ...c, pseudo: `Joueur ${i}` }));
        if (vraisemblable(c, e)) await assertSucceeds(ecrire);
        else await assertFails(ecrire);
      }
    });
  });

  describe('épreuves des drapeaux (lot 2 du J2, étude § 8.2 : séries et tailles des pays, sans l’île)', () => {
    const DRA_AFR = idEpreuve('Africa', 'chrono', 'drapeaux');
    // 50 justes et 4 erreurs sur les 54 pays d'Afrique.
    const afrique = (o: Record<string, unknown> = {}) => score({ questions: 54, justes: 50, points: 50, temps_ms: 300_000, ...o });

    it('chrono:drapeaux:Africa : accepté à la bonne taille (54), refusé à une autre (53 ou 55)', async () => {
      const a = db('ana');
      expect(DRA_AFR).toBe('chrono:drapeaux:Africa');
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', DRA_AFR), afrique()));
      await env.clearFirestore();
      await assertFails(setDoc(place(a, 'michel', 'toujours', DRA_AFR), afrique({ questions: 53, justes: 49, points: 49 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', DRA_AFR), afrique({ questions: 55 })));
      await assertSucceeds(setDoc(place(a, 'michel', cetteSemaine(), DRA_AFR), afrique()));
    });

    it('chaque série des drapeaux a la taille des pays : tous 195, Afrique 54, Asie 48, Europe 44, Amérique du Nord 23, Océanie 14, Amérique du Sud 12', async () => {
      const a = db('ana');
      const tailles: Record<string, number> = { tous: 195, Africa: 54, Asia: 48, Europe: 44, 'North America': 23, Oceania: 14, 'South America': 12 };
      for (const [serie, n] of Object.entries(tailles)) {
        const e = idEpreuve(serie, 'chrono', 'drapeaux');
        await assertSucceeds(setDoc(place(a, 'michel', 'toujours', e), score({ questions: n, justes: n, points: n, temps_ms: n * 5_000 })));
        await assertFails(setDoc(place(a, 'autre', 'toujours', e), score({ pseudo: 'Autre', questions: n - 1, justes: n - 1, points: n - 1, temps_ms: n * 5_000 })));
        await assertFails(setDoc(place(a, 'grand', 'toujours', e), score({ pseudo: 'Grand', questions: n + 1, justes: n + 1, points: n + 1, temps_ms: n * 5_000 })));
      }
    });

    it('refusés : chrono:drapeaux:reunion (pas d’île sous Drapeaux), une série inconnue, les deux modes et Minute retiré', async () => {
      const a = db('ana');
      const ile = score({ questions: 24, justes: 23, points: 23, temps_ms: 120_000 });
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:drapeaux:reunion'), ile));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'sansfaute:drapeaux:reunion'), score({ points: 9, justes: 9, questions: 10, temps_ms: 30_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'minute:drapeaux:reunion'), score({ points: 20, justes: 20, questions: 22, temps_ms: 60_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'minute:drapeaux:Oceania'), score({ points: 12, justes: 12, questions: 14, temps_ms: 60_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:drapeaux:mers'), score({ questions: 50, justes: 50, points: 50, temps_ms: 200_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:drapeaux:Atlantide'), afrique()));
      // L'île des communes reste acceptée sous `localiser`.
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', idEpreuve('reunion')), ile));
    });

    it('Sans faute des drapeaux : ses bornes, la taille de la série des pays', async () => {
      const a = db('ana');
      const S = idEpreuve('Oceania', 'sansfaute', 'drapeaux');
      // Sans faute : 9 d'affilée puis une erreur ; l'Océanie vidée (14) ; jamais plus que la série.
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', S), score({ points: 9, justes: 9, questions: 10, temps_ms: 30_000 })));
      await assertSucceeds(setDoc(place(a, 'vide', 'toujours', S), score({ pseudo: 'Vide', points: 14, justes: 14, questions: 14, temps_ms: 40_000 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', S), score({ pseudo: 'Faux', points: 15, justes: 15, questions: 15, temps_ms: 40_000 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', S), score({ pseudo: 'Faux', points: 9_000, justes: 9, questions: 10, temps_ms: 30_000 })));
      // Tous les drapeaux : Sans faute vidé à 195.
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', idEpreuve('tous', 'sansfaute', 'drapeaux')), score({ points: 195, justes: 195, questions: 195, temps_ms: 600_000 })));
    });

    it('vraisemblable() du client juge comme les règles pour les drapeaux (Chrono, Sans faute ; Minute retiré)', async () => {
      const C = idEpreuve('Oceania', 'chrono', 'drapeaux');
      const S = idEpreuve('Oceania', 'sansfaute', 'drapeaux');
      const M = 'minute:drapeaux:Oceania';
      const cas: [string, Record<string, number>][] = [
        [C, { questions: 14, justes: 14, points: 14, temps_ms: 2_800 }],
        [C, { questions: 14, justes: 14, points: 14, temps_ms: 2_799 }],
        [C, { questions: 14, justes: 12, points: 12, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 12, points: 13, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 12, points: 11, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 12, points: 13_000, temps_ms: 70_000 }],
        [C, { questions: 14, justes: 0, points: 0, temps_ms: 210_000 }],
        [C, { questions: 14, justes: 0, points: 0, temps_ms: 210_001 }],
        [S, { questions: 10, justes: 9, points: 9, temps_ms: 30_000 }],
        [S, { questions: 10, justes: 9, points: 9, temps_ms: 9 * 200 - 1 }],
        [S, { questions: 11, justes: 9, points: 9, temps_ms: 30_000 }],
        [S, { questions: 14, justes: 14, points: 14, temps_ms: 40_000 }],
        [M, { questions: 14, justes: 12, points: 12, temps_ms: 60_000 }],
      ];
      for (const [i, [e, c]] of cas.entries()) {
        const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', e), score({ ...c, pseudo: `Joueur ${i}` }));
        if (vraisemblable(c as never, e)) await assertSucceeds(ecrire);
        else await assertFails(ecrire);
      }
    });
  });

  describe('épreuves des mers (lot 3b du J2, étude § 8.2 : une série unique, « mers », de 50 zones ; D44 a)', () => {
    const MERS = idEpreuve('mers', 'chrono', 'mers');
    const SF_MERS = idEpreuve('mers', 'sansfaute', 'mers');
    // 41 justes et 9 erreurs sur les 50 océans et mers.
    const mers = (o: Record<string, unknown> = {}) => score({ questions: 50, justes: 41, points: 41, temps_ms: 300_000, ...o });

    it('chrono:mers:mers : accepté à la bonne taille (50), refusé à 49 et à 51 ; de toujours et de la semaine', async () => {
      const a = db('ana');
      expect([MERS, SF_MERS]).toEqual(['chrono:mers:mers', 'sansfaute:mers:mers']);
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', MERS), mers()));
      await env.clearFirestore();
      await assertFails(setDoc(place(a, 'michel', 'toujours', MERS), mers({ questions: 49, justes: 40, points: 40 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', MERS), mers({ questions: 51 })));
      await assertSucceeds(setDoc(place(a, 'michel', cetteSemaine(), MERS), mers()));
      // Les 50 du premier coup, au plus vite (0,2 s chacune), et au plus lent (15 s chacune).
      await assertSucceeds(setDoc(place(a, 'vite', 'toujours', MERS), mers({ pseudo: 'Vite', justes: 50, points: 50, temps_ms: 50 * 200 })));
      await assertSucceeds(setDoc(place(a, 'lent', 'toujours', MERS), mers({ pseudo: 'Lent', justes: 0, points: 0, temps_ms: 50 * 15_000 })));
      await assertFails(setDoc(place(a, 'trop', 'toujours', MERS), mers({ pseudo: 'Trop', justes: 0, points: 0, temps_ms: 50 * 15_000 + 1 })));
    });

    it('Sans faute des mers : fin sur une erreur (12 d’affilée, puis la 13e fausse), la série vidée à 50 ; jamais plus que la série', async () => {
      const a = db('ana');
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', SF_MERS), score({ points: 12, justes: 12, questions: 13, temps_ms: 40_000 })));
      await assertSucceeds(setDoc(place(a, 'vide', 'toujours', SF_MERS), score({ pseudo: 'Vide', points: 50, justes: 50, questions: 50, temps_ms: 200_000 })));
      await assertSucceeds(setDoc(place(a, 'zero', 'toujours', SF_MERS), score({ pseudo: 'Zero', points: 0, justes: 0, questions: 1, temps_ms: 0 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', SF_MERS), score({ pseudo: 'Faux', points: 51, justes: 51, questions: 51, temps_ms: 200_000 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', SF_MERS), score({ pseudo: 'Faux', points: 49, justes: 49, questions: 49, temps_ms: 200_000 })));
      await assertFails(setDoc(place(a, 'faux', 'toujours', SF_MERS), score({ pseudo: 'Faux', points: 12, justes: 12, questions: 14, temps_ms: 40_000 })));
      await assertSucceeds(setDoc(place(a, 'michel', cetteSemaine(), SF_MERS), score({ points: 12, justes: 12, questions: 13, temps_ms: 40_000 })));
    });

    it('refusés : chrono:localiser:mers, chrono:mers:tous, chrono:capitales:mers, minute:mers:mers (Minute retiré), une série inconnue des mers', async () => {
      const a = db('ana');
      for (const e of ['chrono:localiser:mers', 'chrono:mers:tous', 'chrono:capitales:mers', 'chrono:drapeaux:mers', 'chrono:mers:Atlantide', 'chrono:mers:reunion']) {
        await assertFails(setDoc(place(a, 'michel', 'toujours', e), mers()));
      }
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'sansfaute:mers:tous'), score({ points: 12, justes: 12, questions: 13, temps_ms: 40_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'minute:mers:mers'), score({ points: 20, justes: 20, questions: 23, temps_ms: 60_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', 'minute:mers:mers'), mers()));
      // Tous les pays restent à 195 sous `localiser` : la série « mers » n'y prend rien.
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', idEpreuve('tous')), score({ questions: 195, justes: 150, points: 150, temps_ms: 900_000 })));
    });

    it('vraisemblable() du client juge comme les règles pour les mers (Chrono, Sans faute ; Minute retiré)', async () => {
      const cas: [string, Record<string, number>][] = [
        [MERS, { questions: 50, justes: 50, points: 50, temps_ms: 10_000 }],
        [MERS, { questions: 50, justes: 50, points: 50, temps_ms: 9_999 }],
        [MERS, { questions: 50, justes: 41, points: 41, temps_ms: 300_000 }],
        [MERS, { questions: 50, justes: 41, points: 42, temps_ms: 300_000 }],
        [MERS, { questions: 50, justes: 41, points: 40, temps_ms: 300_000 }],
        [MERS, { questions: 50, justes: 41, points: 41_000, temps_ms: 300_000 }],
        [MERS, { questions: 50, justes: 0, points: 0, temps_ms: 750_000 }],
        [MERS, { questions: 50, justes: 0, points: 0, temps_ms: 750_001 }],
        [SF_MERS, { questions: 13, justes: 12, points: 12, temps_ms: 40_000 }],
        [SF_MERS, { questions: 13, justes: 12, points: 12, temps_ms: 12 * 200 - 1 }],
        [SF_MERS, { questions: 13, justes: 12, points: 12, temps_ms: 12 * 15_000 + 1 }],
        [SF_MERS, { questions: 14, justes: 12, points: 12, temps_ms: 40_000 }],
        [SF_MERS, { questions: 50, justes: 50, points: 50, temps_ms: 200_000 }],
        [SF_MERS, { questions: 1, justes: 0, points: 0, temps_ms: 0 }],
        ['minute:mers:mers', { questions: 23, justes: 20, points: 20, temps_ms: 60_000 }],
      ];
      for (const [i, [e, c]] of cas.entries()) {
        const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', e), score({ ...c, pseudo: `Joueur ${i}` }));
        if (vraisemblable(c as never, e)) await assertSucceeds(ecrire);
        else await assertFails(ecrire);
      }
    });
  });

  describe('quiz général (lot 4b du J2, étude § 8.2 et § 9.4 ; barème 2 dès sa naissance ; ouvert, D50 c)', () => {
    const FACILE = idQuiz('facile');
    // 17 justes sur 20, en 90 s.
    const quiz = (o: Record<string, unknown> = {}) => score({ questions: 20, justes: 17, points: 17, temps_ms: 90_000, ...o });

    it('quiz:general:facile à expert : acceptés à 20 questions, points = justes ; de toujours et de la semaine', async () => {
      const a = db('ana');
      expect(DIFFICULTES.map(idQuiz)).toEqual(['quiz:general:facile', 'quiz:general:moyen', 'quiz:general:difficile', 'quiz:general:expert']);
      for (const d of DIFFICULTES) {
        await assertSucceeds(setDoc(place(a, 'michel', 'toujours', idQuiz(d)), quiz()));
        await assertSucceeds(setDoc(place(a, 'michel', cetteSemaine(), idQuiz(d)), quiz()));
      }
      // Jamais au barème 1 (1 000 par juste), ni des points autres que les justes.
      await assertFails(setDoc(place(a, 'mille', 'toujours', FACILE), quiz({ pseudo: 'Mille', points: 17_000 })));
      await assertFails(setDoc(place(a, 'plus', 'toujours', FACILE), quiz({ pseudo: 'Plus', points: 18 })));
      await assertFails(setDoc(place(a, 'moins', 'toujours', FACILE), quiz({ pseudo: 'Moins', points: 16 })));
      // 20 questions, ni plus ni moins ; pas plus de justes que de questions.
      await assertFails(setDoc(place(a, 'dixneuf', 'toujours', FACILE), quiz({ pseudo: 'Dixneuf', questions: 19 })));
      await assertFails(setDoc(place(a, 'vingtun', 'toujours', FACILE), quiz({ pseudo: 'Vingtun', questions: 21 })));
      await assertFails(setDoc(place(a, 'trop', 'toujours', FACILE), quiz({ pseudo: 'Trop', justes: 21, points: 21 })));
    });

    it('le temps : au moins 0,2 s par question, au plus le délai de chacune, au total, selon la difficulté (200, 250, 260 et 168 s)', async () => {
      const a = db('ana');
      await assertSucceeds(setDoc(place(a, 'vite', 'toujours', FACILE), quiz({ pseudo: 'Vite', justes: 20, points: 20, temps_ms: 20 * 200 })));
      await assertFails(setDoc(place(a, 'eclair', 'toujours', FACILE), quiz({ pseudo: 'Eclair', justes: 20, points: 20, temps_ms: 20 * 200 - 1 })));
      for (const d of DIFFICULTES) {
        const max = tempsMaxQuiz(d);
        // Le refus d'abord, sur une place neuve : une création que juge quizValide seul. Après celle à max, ce serait
        // une mise à jour, que progresse() refuse de toute façon (même score, plus de temps).
        await assertFails(setDoc(place(a, 'lent', 'toujours', idQuiz(d)), quiz({ pseudo: 'Lent', justes: 0, points: 0, temps_ms: max + 1 })));
        await assertSucceeds(setDoc(place(a, 'lent', 'toujours', idQuiz(d)), quiz({ pseudo: 'Lent', justes: 0, points: 0, temps_ms: max })));
      }
      expect(DIFFICULTES.map(tempsMaxQuiz)).toEqual([200_000, 250_000, 260_000, 168_000]);
    });

    it('refusés : une difficulté inconnue, un autre id que general (quiz:general2:…, réservé au changement de formule), un mode du Chrono sur la clé du quiz', async () => {
      const a = db('ana');
      for (const e of ['quiz:general:enfer', 'quiz:general', 'quiz:general2:facile', 'quiz:pays:facile', 'chrono:general:facile', 'sansfaute:quiz:facile', 'quiz:general:facile:x']) {
        await assertFails(setDoc(place(a, 'michel', 'toujours', e), quiz()));
      }
    });

    it('un record du quiz ne se réécrit que s’il progresse (plus de justes, puis moins de temps)', async () => {
      const a = db('ana');
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', FACILE), quiz()));
      await assertFails(setDoc(place(a, 'michel', 'toujours', FACILE), quiz({ justes: 16, points: 16, temps_ms: 50_000 })));
      await assertFails(setDoc(place(a, 'michel', 'toujours', FACILE), quiz({ temps_ms: 95_000 })));
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', FACILE), quiz({ temps_ms: 80_000 })));
      await assertSucceeds(setDoc(place(a, 'michel', 'toujours', FACILE), quiz({ justes: 18, points: 18, temps_ms: 150_000 })));
    });

    it('vraisemblable() du client juge comme les règles pour le quiz', async () => {
      const cas: [string, Record<string, number>][] = [
        [FACILE, { questions: 20, justes: 17, points: 17, temps_ms: 90_000 }],
        [FACILE, { questions: 20, justes: 20, points: 20, temps_ms: 4_000 }],
        [FACILE, { questions: 20, justes: 20, points: 20, temps_ms: 3_999 }],
        [FACILE, { questions: 20, justes: 0, points: 0, temps_ms: 200_000 }],
        [FACILE, { questions: 20, justes: 0, points: 0, temps_ms: 200_001 }],
        [idQuiz('moyen'), { questions: 20, justes: 0, points: 0, temps_ms: 250_000 }],
        [idQuiz('moyen'), { questions: 20, justes: 0, points: 0, temps_ms: 250_001 }],
        [idQuiz('difficile'), { questions: 20, justes: 3, points: 3, temps_ms: 260_000 }],
        [idQuiz('difficile'), { questions: 20, justes: 3, points: 3, temps_ms: 260_001 }],
        [idQuiz('expert'), { questions: 20, justes: 5, points: 5, temps_ms: 168_000 }],
        [idQuiz('expert'), { questions: 20, justes: 5, points: 5, temps_ms: 168_001 }],
        [FACILE, { questions: 20, justes: 17, points: 17_000, temps_ms: 90_000 }],
        [FACILE, { questions: 20, justes: 17, points: 18, temps_ms: 90_000 }],
        [FACILE, { questions: 19, justes: 17, points: 17, temps_ms: 90_000 }],
        [FACILE, { questions: 21, justes: 17, points: 17, temps_ms: 90_000 }],
        ['quiz:general:enfer', { questions: 20, justes: 17, points: 17, temps_ms: 90_000 }],
        ['quiz:general2:facile', { questions: 20, justes: 17, points: 17, temps_ms: 90_000 }],
      ];
      for (const [i, [e, c]] of cas.entries()) {
        const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', e), score({ ...c, pseudo: `Joueur ${i}` }));
        if (vraisemblable(c as never, e)) await assertSucceeds(ecrire);
        else await assertFails(ecrire);
      }
    });
  });

  it('personne ne retire une place depuis l’appli ; le reste de la base est fermé', async () => {
    await assertSucceeds(setDoc(place(db('ana')), score()));
    await assertFails(deleteDoc(place(db('bob'))));
    await assertFails(deleteDoc(place(db('ana'))));
    await assertFails(setDoc(doc(db('ana'), 'joueurs', 'ana'), { a: 1 }));
    await assertFails(getDoc(doc(db(null), 'joueurs', 'ana')));
    await assertFails(setDoc(doc(db('ana'), 'ailleurs', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(db('ana'), 'ailleurs', 'x')));
  });

  it('version du dépôt (ouverture du 11/11) : joueurs/ ouvert à tout compte chez lui, jamais à un invité ni chez un autre', async () => {
    const corps = REGLES.match(ESSAI_DU_DEPOT)?.[0] ?? '';
    expect(corps).toMatch(/return\s+true\s*;/);
    // Un compte e-mail vérifié ou non (D18 b : la vérification ne bloque pas), et un compte Google : son profil et ses lots.
    const comptes: Array<[string, Record<string, unknown>]> = [
      ['ana', jetonCompte({ verifiee: false })],
      ['bea', jetonCompte({ email: 'bea@exemple.fr', verifiee: true })],
      ['gus', jetonCompte({ email: 'gus@gmail.com', verifiee: true, fournisseur: 'google.com', identites: { 'google.com': ['123'], email: ['gus@gmail.com'] } })],
    ];
    for (const [uid, jeton] of comptes) {
      const f = env.authenticatedContext(uid, jeton as never).firestore() as unknown as Firestore;
      await assertSucceeds(setDoc(doc(f, 'joueurs', uid), profil()));
      await assertSucceeds(getDoc(doc(f, 'joueurs', uid)));
      const l = lot();
      await assertSucceeds(setDoc(doc(f, 'joueurs', uid, 'lots', l.id), l.doc));
      // Jamais chez un autre.
      await assertFails(setDoc(doc(f, 'joueurs', 'autre'), profil()));
      await assertFails(getDoc(doc(f, 'joueurs', uid === 'ana' ? 'bea' : 'ana')));
    }
    // Un invité anonyme : rien, ni profil ni lot.
    const anon = env.authenticatedContext('anon', JETON_ANONYME as never).firestore() as unknown as Firestore;
    await assertFails(setDoc(doc(anon, 'joueurs', 'anon'), profil()));
    const l = lot();
    await assertFails(setDoc(doc(anon, 'joueurs', 'anon', 'lots', l.id), l.doc));
    // Sans compte : aucune lecture.
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'joueurs', 'ana')));
  });
});

describe.skipIf(!hote)('compteur des pseudos d’invité, compteurs/invites (décision « Pseudo d’invité »)', () => {
  let env: RulesTestEnvironment;
  const anon = () => env.authenticatedContext('anon', JETON_ANONYME as never).firestore() as unknown as Firestore;
  const compteur = (f: Firestore) => doc(f, 'compteurs', 'invites');

  beforeAll(async () => {
    const [host, port] = (hote ?? '').split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-terramemo', firestore: { rules: REGLES, host, port: Number(port) } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => env.clearFirestore());

  it('un invité anonyme le crée à 1000, puis l’avance d’un seul pas', async () => {
    await assertFails(setDoc(compteur(anon()), { n: 1 }));
    await assertFails(setDoc(compteur(anon()), { n: 1000, autre: true }));
    await assertSucceeds(setDoc(compteur(anon()), { n: 1000 }));
    await assertSucceeds(getDoc(compteur(anon())));
    await assertFails(updateDoc(compteur(anon()), { n: 1002 }));
    await assertFails(updateDoc(compteur(anon()), { n: 999 }));
    await assertFails(updateDoc(compteur(anon()), { n: 1000 }));
    await assertSucceeds(updateDoc(compteur(anon()), { n: 1001 }));
    await assertFails(setDoc(compteur(anon()), { n: 1002, autre: true }));
    await assertFails(deleteDoc(compteur(anon())));
  });

  it('dans une transaction, comme l’appli : deux tirages, deux numéros qui se suivent', async () => {
    const f = anon();
    const tirer = () =>
      runTransaction(f, async (t) => {
        const d = await t.get(compteur(f));
        const n = d.exists() ? Number(d.data().n) + 1 : 1000;
        if (d.exists()) t.update(compteur(f), { n });
        else t.set(compteur(f), { n });
        return n;
      });
    expect(await tirer()).toBe(1000);
    expect(await tirer()).toBe(1001);
  });

  it('sans compte : ni lecture ni écriture', async () => {
    const f = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(setDoc(compteur(f), { n: 1000 }));
    await assertFails(getDoc(compteur(f)));
  });
});

/**
 * Les claims d'un compte (étude du J1b, § 6) : `firebase.identities` dit ce
 * que le compte possède, `sign_in_provider` la méthode de la session (que les
 * règles ne regardent pas). Par défaut, un compte e-mail non vérifié.
 */
function jetonCompte(o: { fournisseur?: string; identites?: Record<string, string[]>; email?: string; verifiee?: boolean } = {}) {
  const email = o.email ?? 'ana@exemple.fr';
  return {
    email,
    email_verified: o.verifiee ?? false,
    firebase: { sign_in_provider: o.fournisseur ?? 'password', identities: o.identites ?? { email: [email] } },
  };
}
/** Un invité anonyme : aucune identité. */
const JETON_ANONYME = { firebase: { sign_in_provider: 'anonymous', identities: {} } };

const profil = (o: Record<string, unknown> = {}) => ({ v: 1, pseudo: 'Michel', records: '{"chrono:localiser:tous":{"points":1000}}', maj: serverTimestamp(), ...o });

describe.skipIf(!hote)('profil joueurs/{uid} (J1b, lot 2 ; essai() ouvert)', () => {
  let env: RulesTestEnvironment;
  type Jeton = Record<string, unknown> | null;
  const db = (uid: string | null, jeton: Jeton = jetonCompte()) =>
    (uid ? env.authenticatedContext(uid, (jeton ?? undefined) as never).firestore() : env.unauthenticatedContext().firestore()) as unknown as Firestore;
  const moi = (d: Firestore, uid = 'ana') => doc(d, 'joueurs', uid);

  beforeAll(async () => {
    const [host, port] = (hote ?? '').split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-terramemo', firestore: { rules: reglesAvecEssai('return true;'), host, port: Number(port) } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => env.clearFirestore());

  it('les claims voulus arrivent aux règles (S8) : identités et méthode de la session', async () => {
    // Un compte Google sans identité « email » passe ; un anonyme, qui n'en a aucune, non.
    await assertSucceeds(setDoc(moi(db('ana', jetonCompte({ fournisseur: 'google.com', identites: { 'google.com': ['1234'] } }))), profil()));
    await assertFails(setDoc(moi(db('bob', JETON_ANONYME), 'bob'), profil()));
  });

  it('sans compte, un autre uid, un anonyme : rien (lecture, création, mise à jour, suppression)', async () => {
    await env.withSecurityRulesDisabled(async (c) => void (await setDoc(doc(c.firestore() as unknown as Firestore, 'joueurs', 'ana'), profil({ maj: Timestamp.now() }))));
    for (const d of [db(null), db('bob'), db('ana', JETON_ANONYME)]) {
      await assertFails(getDoc(moi(d)));
      await assertFails(setDoc(moi(d), profil()));
      await assertFails(deleteDoc(moi(d)));
    }
    await assertFails(setDoc(moi(db('bob', JETON_ANONYME), 'bob'), profil()));
  });

  it('compte e-mail, compte Google, anonyme lié (session « anonymous » avec l’identité email) : son profil', async () => {
    await assertSucceeds(setDoc(moi(db('ana')), profil()));
    await assertSucceeds(getDoc(moi(db('ana'))));
    await assertSucceeds(setDoc(moi(db('gael', jetonCompte({ fournisseur: 'google.com', identites: { 'google.com': ['1'], email: ['g@gmail.com'] }, verifiee: true })), 'gael'), profil()));
    // La règle ne dépend pas de la méthode de la session : un lien la laisse peut-être à « anonymous » (S16).
    await assertSucceeds(setDoc(moi(db('lia', jetonCompte({ fournisseur: 'anonymous' })), 'lia'), profil({ pseudo: 'Lia' })));
    // Mise à jour : pseudo changé, records sans pseudo, profil nu.
    await assertSucceeds(setDoc(moi(db('ana')), profil({ pseudo: 'Ana' })));
    await assertSucceeds(setDoc(moi(db('ana')), { v: 1, maj: serverTimestamp(), records: '{}' }));
    await assertSucceeds(setDoc(moi(db('ana')), { v: 1, maj: serverTimestamp() }));
  });

  it('forme du profil : champs, version, heure du serveur, pseudo de 2 à 20, records en chaîne de 32 768 au plus', async () => {
    const d = moi(db('ana'));
    for (const faux of [
      profil({ triche: true }),
      profil({ v: 2 }),
      profil({ v: '1' }),
      profil({ maj: Timestamp.fromMillis(Date.now()) }),
      { v: 1, pseudo: 'Michel' },
      { maj: serverTimestamp(), pseudo: 'Michel' },
      profil({ pseudo: 'M' }),
      profil({ pseudo: 'x'.repeat(21) }),
      profil({ pseudo: 42 }),
      profil({ records: 'x'.repeat(32_769) }),
      profil({ records: { 'chrono:localiser:tous': { points: 1000 } } }),
      profil({ records: ['un', 'deux'] }),
      profil({ supprime: false }),
      profil({ supprime: true }),
    ])
      await assertFails(setDoc(d, faux));
    await assertSucceeds(setDoc(d, profil({ records: 'x'.repeat(32_768), pseudo: 'x'.repeat(20) })));
    await assertSucceeds(setDoc(d, profil({ pseudo: 'Mi' })));
  });

  it('pierre tombale : posée par le propriétaire, puis plus aucune écriture du profil, même d’un 2e appareil du compte', async () => {
    await assertSucceeds(setDoc(moi(db('ana')), profil()));
    const tombe = { v: 1, maj: serverTimestamp(), supprime: true };
    await assertFails(setDoc(moi(db('bob'), 'ana'), tombe));
    await assertSucceeds(setDoc(moi(db('ana')), tombe));
    // Deux contextes du même uid : le téléphone et le PC du compte.
    for (const d of [db('ana'), db('ana', jetonCompte({ fournisseur: 'google.com', identites: { 'google.com': ['9'], email: ['ana@exemple.fr'] } }))]) {
      await assertFails(setDoc(moi(d), profil()));
      await assertFails(setDoc(moi(d), tombe));
      await assertFails(deleteDoc(moi(d)));
      await assertSucceeds(getDoc(moi(d)));
    }
    // Posée sur un profil absent (suppression reprise) : une création.
    await assertSucceeds(setDoc(moi(db('lia'), 'lia'), tombe));
    await assertFails(setDoc(moi(db('lia'), 'lia'), profil()));
  });

  it('pas de suppression du profil par le client ; pas de liste de joueurs/ ; demandes/ sans pierre tombale refusé', async () => {
    await assertSucceeds(setDoc(moi(db('ana')), profil()));
    await assertFails(deleteDoc(moi(db('ana'))));
    await assertFails(getDocs(collection(db('ana'), 'joueurs')));
    await assertFails(getDocs(collection(db(null), 'joueurs')));
    await assertFails(setDoc(doc(db('ana'), 'demandes', 'ana'), { pseudo: 'Michel', cree: serverTimestamp() }));
  });

  describe('demandes/{uid} (D27 b) : écrite avec la pierre tombale, en création seule', () => {
    const tombe = () => ({ v: 1, maj: serverTimestamp(), supprime: true });
    const demande = (o: Record<string, unknown> = {}) => ({ pseudo: 'Michel', cree: serverTimestamp(), ...o });
    /** La suppression du compte (§ 7.1, étapes 3 et 4) : la demande et la pierre tombale d'un coup. */
    function supprimer(d: Firestore, uid = 'ana', dem: Record<string, unknown> = demande()) {
      const b = writeBatch(d);
      b.set(doc(d, 'demandes', uid), dem);
      b.set(moi(d, uid), tombe());
      return b.commit();
    }

    it('le compte lui-même, avec sa pierre tombale et le pseudo de son profil : accepté', async () => {
      await assertSucceeds(setDoc(moi(db('ana')), profil()));
      await assertSucceeds(supprimer(db('ana')));
      const lia = db('lia', jetonCompte({ email: 'lia@exemple.fr' }));
      await assertSucceeds(setDoc(moi(lia, 'lia'), profil({ pseudo: 'x'.repeat(20) })));
      await assertSucceeds(supprimer(lia, 'lia', demande({ pseudo: 'x'.repeat(20) })));
    });

    it('un pseudo que le profil ne porte pas : refusé (profil d’un autre pseudo, sans pseudo, absent) ; la pierre tombale seule passe', async () => {
      await assertSucceeds(setDoc(moi(db('ana')), profil({ pseudo: 'Ana' })));
      // Le pseudo d'un autre joueur, à la casse près comme tout autre.
      await assertFails(supprimer(db('ana'), 'ana', demande({ pseudo: 'Michel' })));
      await assertFails(supprimer(db('ana'), 'ana', demande({ pseudo: 'ana' })));
      const { pseudo: _p, ...sansPseudo } = profil();
      await assertSucceeds(setDoc(moi(db('lia', jetonCompte({ email: 'lia@exemple.fr' })), 'lia'), sansPseudo));
      await assertFails(supprimer(db('lia', jetonCompte({ email: 'lia@exemple.fr' })), 'lia'));
      // Profil absent (jamais écrit) : pas de demande possible ; la pierre tombale seule, si.
      await assertFails(supprimer(db('zoe'), 'zoe'));
      await assertSucceeds(setDoc(moi(db('zoe'), 'zoe'), tombe()));
      // Le profil d'avant le lot (la pierre tombale, qui efface le pseudo, est dans le même lot).
      await assertSucceeds(supprimer(db('ana'), 'ana', demande({ pseudo: 'Ana' })));
    });

    it('sans compte, un autre uid, un anonyme : refusé', async () => {
      await assertFails(supprimer(db(null)));
      await assertFails(supprimer(db('bob'), 'ana'));
      await assertFails(supprimer(db('ana', JETON_ANONYME)));
    });

    it('forme : pseudo de 2 à 20 caractères, heure du serveur, rien d’autre', async () => {
      await assertSucceeds(setDoc(moi(db('ana')), profil()));
      for (const faux of [
        demande({ pseudo: 'M' }),
        demande({ pseudo: 'x'.repeat(21) }),
        demande({ pseudo: 42 }),
        demande({ cree: Timestamp.fromMillis(Date.now()) }),
        demande({ uid: 'ana' }),
        { pseudo: 'Michel' },
        { cree: serverTimestamp() },
      ])
        await assertFails(supprimer(db('ana'), 'ana', faux));
    });

    it('ni lecture, ni mise à jour, ni suppression ; pas de liste', async () => {
      await assertSucceeds(setDoc(moi(db('ana')), profil()));
      await assertSucceeds(supprimer(db('ana')));
      const d = doc(db('ana'), 'demandes', 'ana');
      await assertFails(getDoc(d));
      await assertFails(setDoc(d, demande({ pseudo: 'Autre' })));
      await assertFails(updateDoc(d, { pseudo: 'Autre' }));
      await assertFails(deleteDoc(d));
      await assertFails(getDocs(collection(db('ana'), 'demandes')));
    });
  });

  it('les classements ne changent pas pour un compte : sa place s’écrit comme celle d’un anonyme', async () => {
    await assertSucceeds(setDoc(place(db('ana')), score()));
    await assertSucceeds(setDoc(place(db('bob', JETON_ANONYME), 'lea'), score({ pseudo: 'Lea' })));
  });
});

let k = 0;
const APPAREIL = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const SEANCE = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
/** n réponses d'une séance, comme le journal les écrit (ids uuid croissants). */
function reponses(n: number): Evenement[] {
  return Array.from({ length: n }, (_, i) => ({
    v: 1 as const,
    id: `${(++k).toString(16).padStart(8, '0')}-3333-4444-8555-${String(i).padStart(12, '0')}`,
    appareil: APPAREIL,
    ts: 1_762_500_000_000 + i * 1000,
    tz: 240,
    seance: SEANCE,
    type: 'reponse' as const,
    fiche: 'communes:97411:localiser',
    mode: 'revision' as const,
    reponse: '97424',
    via: null,
    zoom: 0.00012345678901234567,
    correct: false,
    aide: 'passer' as const,
    duree_ms: 86_400_000,
    distance_km: 20_099.123456789012,
    note: 1 as const,
  }));
}
/** Un lot composé (src/sync/lots.ts) de n réponses, `fin` à l'heure du serveur ; en v2 avec `estime`. */
function lot(n = 1, o: Partial<DocLot> & Record<string, unknown> = {}, estime?: number): { id: string; doc: Record<string, unknown> } {
  // Avec `estime` : une réponse au curseur (Habitants : étude du J4, § 5.2), qui n'est pas un toucher.
  const e = reponses(n).map((x) => (estime === undefined ? x : { ...x, fiche: 'habitants:NGA:localiser', reponse: null, zoom: null, distance_km: null, estime }));
  const d = docDuLot({ id: e[0]!.id, appareil: APPAREIL, seance: SEANCE, evenements: e });
  return { id: e[0]!.id, doc: { ...d, fin: serverTimestamp(), ...o } };
}

describe.skipIf(!hote)('lots joueurs/{uid}/lots/{lot} (J1b, lot 3 ; essai() ouvert)', () => {
  let env: RulesTestEnvironment;
  type Jeton = Record<string, unknown> | null;
  const db = (uid: string | null, jeton: Jeton = jetonCompte()) =>
    (uid ? env.authenticatedContext(uid, (jeton ?? undefined) as never).firestore() : env.unauthenticatedContext().firestore()) as unknown as Firestore;
  const ref = (d: Firestore, id: string, uid = 'ana') => doc(d, 'joueurs', uid, 'lots', id);

  beforeAll(async () => {
    const [host, port] = (hote ?? '').split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-terramemo', firestore: { rules: reglesAvecEssai('return true;'), host, port: Number(port) } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => env.clearFirestore());

  it('compte e-mail, compte Google, anonyme lié : ses lots (création, lecture, liste, suppression)', async () => {
    for (const [uid, j] of [
      ['ana', jetonCompte()],
      ['gael', jetonCompte({ fournisseur: 'google.com', identites: { 'google.com': ['1'] } })],
      ['lia', jetonCompte({ fournisseur: 'anonymous' })],
    ] as const) {
      const d = db(uid, j);
      const l = lot();
      await assertSucceeds(setDoc(ref(d, l.id, uid), l.doc));
      await assertSucceeds(getDoc(ref(d, l.id, uid)));
      await assertSucceeds(getDocs(collection(d, 'joueurs', uid, 'lots')));
      await assertSucceeds(deleteDoc(ref(d, l.id, uid)));
    }
  });

  it('sans compte, un autre uid, un anonyme : rien (lecture, création, suppression) ; pas de liste de tous les lots', async () => {
    const l = lot();
    await env.withSecurityRulesDisabled(async (c) => void (await setDoc(ref(c.firestore() as unknown as Firestore, l.id), { ...l.doc, fin: Timestamp.now() })));
    const autre = lot();
    for (const d of [db(null), db('bob'), db('ana', JETON_ANONYME)]) {
      await assertFails(getDoc(ref(d, l.id)));
      await assertFails(getDocs(collection(d, 'joueurs', 'ana', 'lots')));
      await assertFails(setDoc(ref(d, autre.id), autre.doc));
      await assertFails(deleteDoc(ref(d, l.id)));
    }
    await assertFails(setDoc(ref(db('bob', JETON_ANONYME), autre.id, 'bob'), autre.doc));
  });

  it('création seule : un lot qui existe ne se réécrit pas, même à l’identique (renvoi)', async () => {
    const d = db('ana');
    const l = lot(2);
    await assertSucceeds(setDoc(ref(d, l.id), l.doc));
    await assertFails(setDoc(ref(d, l.id), l.doc));
    await assertFails(setDoc(ref(d, l.id), { n: 2 }, { merge: true }));
  });

  it('bornes : 1 et 200 réponses aux champs les plus longs passent ; n, chaîne, champs, heure, id refusés', async () => {
    const d = db('ana');
    for (const n of [1, 200]) {
      const l = lot(n);
      expect((l.doc.evenements as string).length).toBeLessThanOrEqual(n * 160);
      await assertSucceeds(setDoc(ref(d, l.id), l.doc));
    }
    const l = lot();
    const s = l.doc.evenements as string;
    for (const faux of [
      { n: 0 },
      { n: 201 },
      { n: 1.5 },
      { evenements: ' '.repeat(161 - s.length) + s },
      { evenements: [s] },
      { evenements: { cartes: s } },
      { v: 3 },
      { v: 0 },
      { v: '2' },
      { appareil: APPAREIL.slice(1) },
      { seance: 'courte' },
      { fin: Timestamp.now() },
      { triche: true },
    ])
      await assertFails(setDoc(ref(d, l.id), { ...l.doc, ...faux }));
    const manque = { ...l.doc };
    delete manque.seance;
    await assertFails(setDoc(ref(d, l.id), manque));
    await assertFails(setDoc(ref(d, l.id.slice(1)), l.doc));
    // Une séance nulle passe ; la chaîne à 160 caractères juste aussi.
    await assertSucceeds(setDoc(ref(d, l.id), { ...l.doc, seance: null, evenements: ' '.repeat(160 - s.length) + s }));
  });

  it('format v2 (étude du J4, lot 0, D617 a) : un lot qui porte `estime` s’écrit en v2 et passe, 200 compris ; un v3 non', async () => {
    const d = db('ana');
    for (const n of [1, 200]) {
      const l = lot(n, {}, 8_123_456_789.5);
      expect(l.doc.v).toBe(2);
      expect((l.doc.evenements as string).length).toBeLessThanOrEqual(n * 160);
      await assertSucceeds(setDoc(ref(d, l.id), l.doc));
    }
    // Sans `estime`, toujours v1.
    expect(lot().doc.v).toBe(1);
    const v3 = lot(1, { v: 3 }, 1000);
    expect(problemeLot(v3.id, (({ fin: _, ...x }) => x)(v3.doc) as unknown as DocLot)).toBe('v');
    await assertFails(setDoc(ref(d, v3.id), v3.doc));
  });

  it('problemeLot (client) juge comme les règles ce qu’elles voient', async () => {
    const d = db('ana');
    const cas: [string, Partial<DocLot>, ((id: string) => string)?][] = [
      ['juste', {}],
      ['n = 0', { n: 0 }],
      ['n = 201', { n: 201 }],
      ['n = 1,5', { n: 1.5 }],
      ['v = 2', { v: 2 }],
      ['v = 3', { v: 3 }],
      ['appareil court', { appareil: 'x'.repeat(35) }],
      ['séance longue', { seance: 'x'.repeat(37) }],
      ['séance nulle', { seance: null }],
      ['chaîne de 160', {}, undefined],
      ['chaîne de 161', {}, undefined],
      ['id de 35', {}, (id) => id.slice(1)],
    ];
    for (const [nom, o, idDe] of cas) {
      const l = lot(1, o);
      // La chaîne allongée d'espaces en tête (JSON.parse les ignore) : seule sa longueur change.
      if (nom.startsWith('chaîne')) l.doc.evenements = (l.doc.evenements as string).padStart(Number(nom.slice(-3)), ' ');
      const id = idDe ? idDe(l.id) : l.id;
      const { fin: _, ...sansFin } = l.doc;
      const client = problemeLot(id, sansFin as unknown as DocLot);
      // Seulement ce que les règles voient : la forme du document (elles ne relisent pas les cartes).
      const visible = client === null || ['n', 'v', 'appareil', 'seance', 'evenements', 'id'].includes(client);
      expect(visible, `${nom} : ${client}`).toBe(true);
      const accepte = await setDoc(ref(d, id), l.doc).then(() => true, () => false);
      expect(accepte, `${nom} : ${client}`).toBe(client === null);
    }
  });

  it('pierre tombale : plus aucun lot nouveau, même d’un 2e appareil du compte ; les lots se lisent et se suppriment', async () => {
    const l = lot();
    await assertSucceeds(setDoc(ref(db('ana'), l.id), l.doc));
    await assertSucceeds(setDoc(doc(db('ana'), 'joueurs', 'ana'), { v: 1, maj: serverTimestamp(), supprime: true }));
    for (const d of [db('ana'), db('ana', jetonCompte({ fournisseur: 'google.com', identites: { 'google.com': ['9'], email: ['ana@exemple.fr'] } }))]) {
      const n = lot();
      await assertFails(setDoc(ref(d, n.id), n.doc));
      await assertSucceeds(getDoc(ref(d, l.id)));
    }
    await assertSucceeds(deleteDoc(ref(db('ana'), l.id)));
  });
});

describe.skipIf(!hote)('règles d’essai des lots 6 et 7 : les adresses vérifiées de l’utilisateur seules', () => {
  let env: RulesTestEnvironment;
  const LISTE = 'return request.auth.token.email_verified == true && request.auth.token.email in [\'moi@exemple.fr\'];';
  beforeAll(async () => {
    const [host, port] = (hote ?? '').split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-terramemo', firestore: { rules: reglesAvecEssai(LISTE), host, port: Number(port) } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => env.clearFirestore());

  it('adresse hors de la liste, ou non vérifiée : refusé ; l’adresse vérifiée de la liste : son profil', async () => {
    const d = (uid: string, j: Record<string, unknown>) => doc(env.authenticatedContext(uid, j as never).firestore() as unknown as Firestore, 'joueurs', uid);
    await assertFails(setDoc(d('a', jetonCompte({ email: 'autre@exemple.fr', verifiee: true })), profil()));
    await assertFails(setDoc(d('b', jetonCompte({ email: 'moi@exemple.fr', verifiee: false })), profil()));
    await assertSucceeds(setDoc(d('c', jetonCompte({ email: 'moi@exemple.fr', verifiee: true })), profil()));
    await assertSucceeds(getDoc(d('c', jetonCompte({ email: 'moi@exemple.fr', verifiee: true }))));
    // Les lots, de même.
    const lotDe = (uid: string, j: Record<string, unknown>) => {
      const l = lot();
      return setDoc(doc(env.authenticatedContext(uid, j as never).firestore() as unknown as Firestore, 'joueurs', uid, 'lots', l.id), l.doc);
    };
    await assertFails(lotDe('a', jetonCompte({ email: 'autre@exemple.fr', verifiee: true })));
    await assertFails(lotDe('b', jetonCompte({ email: 'moi@exemple.fr', verifiee: false })));
    await assertSucceeds(lotDe('c', jetonCompte({ email: 'moi@exemple.fr', verifiee: true })));
  });
});
