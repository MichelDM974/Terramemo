// Règles Firestore des classements (firestore.rules), sur l'émulateur :
// `npm run test:regles` (firebase emulators:exec pose FIRESTORE_EMULATOR_HOST).
// Sans émulateur (npm test), ces tests sont sautés.
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { semaine } from '../src/epreuve/bareme';
import { clePermise, clePseudo, idEpreuve, pseudoValide, vraisemblable } from '../src/epreuve/chrono';

const hote = process.env.FIRESTORE_EMULATOR_HOST;
const E = 'chrono:localiser:South America';

const score = (o: Record<string, unknown> = {}) => ({
  pseudo: 'Michel',
  points: 11_000,
  justes: 11,
  questions: 12,
  temps_ms: 60_000,
  date: serverTimestamp(),
  bareme: 1,
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
      firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
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

  it('la clé est le pseudo en minuscules, sans autre place possible ; clePermise (pseudoValide) juge comme les règles', async () => {
    // [clé, pseudo, acceptée] : chaque essai est une création sur une base vide (seule la clé peut la refuser).
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
      ['é\nÉ', 'É\nÉ', false], // un saut de ligne ne cache pas une majuscule
      ['é\né', 'É\nÉ', true],
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
    ];
    for (const [cle, pseudo, acceptee] of cas) {
      await env.clearFirestore();
      const ecrire = setDoc(place(db('ana'), cle), score({ pseudo }));
      if (acceptee) await assertSucceeds(ecrire);
      else await assertFails(ecrire);
      expect([cle, pseudo, clePermise(cle, pseudo)]).toEqual([cle, pseudo, acceptee]);
    }
    for (const p of ['Ⓜichel', '𝐌𝐢𝐜𝐡𝐞𝐥', 'İrem']) expect(pseudoValide(p)).toBeNull();
  });

  it('une place par pseudo : deux comptes (deux appareils) du même pseudo la partagent, le meilleur reste', async () => {
    await assertSucceeds(setDoc(place(db('telephone')), score({ points: 7_540, justes: 6, temps_ms: 98_000, questions: 12 })));
    await assertSucceeds(setDoc(place(db('pc')), score({ points: 11_000, justes: 11 })));
    await assertFails(setDoc(place(db('apk')), score({ points: 10_500, justes: 10 })));
    await assertSucceeds(setDoc(place(db('apk')), score({ pseudo: 'MICHEL', points: 11_000, justes: 11, temps_ms: 50_000 })));
    await assertFails(setDoc(place(db('telephone')), score({ points: 11_000, justes: 11 })));
    const d = await getDoc(place(db(null)));
    expect([d.get('pseudo'), d.get('points'), d.get('temps_ms')]).toEqual(['MICHEL', 11_000, 50_000]);
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

  it('bornes du barème et taille de l’épreuve', async () => {
    const a = db('ana');
    // 11 justes et une erreur : 11 000 à 11 500 points.
    await assertSucceeds(setDoc(place(a), score({ points: 11_500 })));
    await env.clearFirestore();
    await assertFails(setDoc(place(a), score({ points: 11_501 })));
    await assertFails(setDoc(place(a), score({ points: 10_999 })));
    await assertFails(setDoc(place(a), score({ justes: 13, points: 13_000 })));
    await assertFails(setDoc(place(a), score({ questions: 13 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', 'chrono:localiser:Atlantide'), score()));
    await assertFails(setDoc(place(a), score({ temps_ms: 12 * 200 - 1 })));
    await assertFails(setDoc(place(a), score({ temps_ms: 12 * 15_000 + 1 })));
    await assertFails(setDoc(place(a), score({ points: 11_000.5 })));
  });

  it('épreuve de l’île : 24 communes, mêmes bornes du barème', async () => {
    const a = db('ana');
    const I = 'chrono:localiser:reunion';
    // 23 justes et une erreur : 23 000 à 23 500 points (l'échelle de 5 km ne
    // change pas le plafond de 500 par erreur).
    const ile = (o: Record<string, unknown> = {}) => score({ questions: 24, justes: 23, points: 23_500, temps_ms: 120_000, ...o });
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', I), ile()));
    await env.clearFirestore();
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ points: 23_501 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ points: 22_999 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ questions: 23, justes: 22, points: 22_000 })));
    await assertFails(setDoc(place(a, 'michel', 'toujours', I), ile({ questions: 25 })));
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', I), ile({ points: 23_000 })));
  });

  it('vraisemblable() du client juge comme les règles (un score qu’il écarte serait refusé, et inversement)', async () => {
    const I = 'chrono:localiser:reunion';
    const cas = [
      { questions: 24, justes: 24, points: 24_000, temps_ms: 4_800 },
      { questions: 24, justes: 24, points: 24_000, temps_ms: 4_799 },
      { questions: 24, justes: 24, points: 24_000, temps_ms: 1_433 },
      { questions: 24, justes: 0, points: 0, temps_ms: 360_000 },
      { questions: 24, justes: 0, points: 0, temps_ms: 360_001 },
      { questions: 24, justes: 23, points: 23_500, temps_ms: 120_000 },
      { questions: 24, justes: 23, points: 23_501, temps_ms: 120_000 },
      { questions: 24, justes: 23, points: 22_999, temps_ms: 120_000 },
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
      { points: 7_000 }, // les points du Chrono
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

  it('Minute : justes (points = justes) en 60 s ; moins de 60 s seulement la série vidée', async () => {
    const a = db('ana');
    const M = idEpreuve('Africa', 'minute');
    const mi = (o: Record<string, unknown> = {}) => score({ points: 20, justes: 20, questions: 23, temps_ms: 60_000, ...o });
    const ecrire = (o: Record<string, unknown> = {}, cle = 'michel', e = M) => setDoc(place(a, cle, 'toujours', e), mi({ pseudo: cle === 'michel' ? 'Michel' : cle, ...o }));
    await assertSucceeds(ecrire());
    await assertSucceeds(ecrire({ points: 0, justes: 0, questions: 0 }, 'zero'));
    // La Réunion vidée en 45 s : 24 questions.
    await assertSucceeds(ecrire({ points: 22, justes: 22, questions: 24, temps_ms: 45_000 }, 'ile', idEpreuve('reunion', 'minute')));
    for (const o of [
      { points: 20_000 },
      { temps_ms: 45_000 }, // arrêtée avant la minute sans vider la série
      { temps_ms: 60_001 },
      { questions: 55 }, // plus que l'Afrique
      { points: 0, justes: 0, questions: 301, temps_ms: 60_000 },
    ])
      await assertFails(ecrire(o, 'faux'));
    // Progresse : plus de justes ; à justes égales, moins de temps, puis moins d'erreurs.
    await assertFails(ecrire({ questions: 24 }));
    await assertSucceeds(ecrire({ questions: 22 }));
    await assertFails(ecrire({ points: 19, justes: 19, questions: 19 }));
    await assertSucceeds(ecrire({ points: 21, justes: 21, questions: 30 }));
  });

  it('vraisemblable() du client juge comme les règles pour Sans faute et Minute', async () => {
    const S = idEpreuve('reunion', 'sansfaute');
    const M = idEpreuve('reunion', 'minute');
    const cas: [string, Record<string, number>][] = [
      [S, { questions: 18, justes: 17, points: 17, temps_ms: 60_000 }],
      [S, { questions: 18, justes: 17, points: 17, temps_ms: 3_399 }],
      [S, { questions: 18, justes: 17, points: 17, temps_ms: 255_001 }],
      [S, { questions: 19, justes: 17, points: 17, temps_ms: 60_000 }],
      [S, { questions: 1, justes: 0, points: 0, temps_ms: 0 }],
      [M, { questions: 23, justes: 20, points: 20, temps_ms: 60_000 }],
      [M, { questions: 23, justes: 20, points: 20, temps_ms: 60_001 }],
      [M, { questions: 0, justes: 0, points: 0, temps_ms: 60_000 }],
      [M, { questions: 23, justes: 20, points: 21, temps_ms: 60_000 }],
    ];
    for (const [i, [e, c]] of cas.entries()) {
      const ecrire = setDoc(place(db('ana'), `joueur ${i}`, 'toujours', e), score({ ...c, pseudo: `Joueur ${i}` }));
      if (vraisemblable(c as never, e)) await assertSucceeds(ecrire);
      else await assertFails(ecrire);
    }
  });

  it('forme du document : champs, pseudo, date du serveur, version du barème', async () => {
    const a = db('ana');
    await assertFails(setDoc(place(a), { ...score(), triche: true }));
    const { bareme: _b, ...sansBareme } = score();
    await assertFails(setDoc(place(a), sansBareme));
    await assertFails(setDoc(place(a), score({ bareme: 2 })));
    await assertFails(setDoc(place(a, 'm'), score({ pseudo: 'M' })));
    await assertFails(setDoc(place(a, 'x'.repeat(21)), score({ pseudo: 'x'.repeat(21) })));
    await assertFails(setDoc(place(a), score({ date: Timestamp.fromMillis(Date.now()) })));
  });

  it('un record ne se réécrit que s’il progresse ; à score égal, le pseudo stocké reste', async () => {
    const a = db('ana');
    const bob = db('bob');
    await assertSucceeds(setDoc(place(a), score()));
    await assertFails(setDoc(place(a), score({ points: 10_500, justes: 10 })));
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
    await assertFails(setDoc(place(bob), score({ pseudo: 'Michou', points: 11_200, temps_ms: 90_000 })));
    await assertSucceeds(setDoc(place(a), score({ points: 11_200, temps_ms: 90_000 })));
  });

  it('moins de questions à points et temps égaux : un progrès en Minute seulement, ailleurs le pseudo stocké reste', async () => {
    const a = db('ana');
    const general = (o: Record<string, unknown>) => setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 414, justes: 300, points: 300_000, temps_ms: 3_000_000, ...o }));
    await assertSucceeds(general({}));
    // Égalité visible au classement (points, puis temps) : pas de nouveau nom.
    await assertFails(general({ questions: 300, pseudo: 'MICHEL' }));
    await assertSucceeds(general({ questions: 300 }));
    // Minute départage aux questions (moins d'erreurs) : c'est un vrai progrès.
    const M = idEpreuve('reunion', 'minute');
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', M), score({ questions: 23, justes: 20, points: 20, temps_ms: 60_000 })));
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', M), score({ questions: 22, justes: 20, points: 20, temps_ms: 60_000, pseudo: 'MICHEL' })));
  });

  it('général : la somme des épreuves du Chrono, 414 questions au plus (390 du monde + 24 de l’île)', async () => {
    const a = db('ana');
    await assertSucceeds(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 414, justes: 300, points: 300_000, temps_ms: 3_000_000 })));
    await env.clearFirestore();
    await assertFails(setDoc(place(a, 'michel', 'toujours', 'general'), score({ questions: 415, justes: 300, points: 300_000, temps_ms: 3_000_000 })));
  });

  it('personne ne retire une place depuis l’appli ; le reste de la base est fermé', async () => {
    await assertSucceeds(setDoc(place(db('ana')), score()));
    await assertFails(deleteDoc(place(db('bob'))));
    await assertFails(deleteDoc(place(db('ana'))));
    await assertFails(setDoc(doc(db('ana'), 'joueurs', 'ana'), { a: 1 }));
    await assertFails(getDoc(doc(db(null), 'joueurs', 'ana')));
  });
});
