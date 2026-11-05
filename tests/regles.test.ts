// Règles Firestore des classements (firestore.rules), sur l'émulateur :
// `npm run test:regles` (firebase emulators:exec pose FIRESTORE_EMULATOR_HOST).
// Sans émulateur (npm test), ces tests sont sautés.
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { semaine } from '../src/epreuve/bareme';

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
const place = (db: Firestore, uid: string, periode = 'toujours', epreuve = E) => doc(db, 'classements', epreuve, 'periodes', periode, 'scores', uid);
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
    await assertSucceeds(setDoc(place(db('ana'), 'ana'), score()));
    await assertSucceeds(getDoc(place(db(null), 'ana')));
    await assertSucceeds(getDocs(collection(db(null), 'classements', E, 'periodes', 'toujours', 'scores')));
  });

  it('chacun écrit sa place seulement, connecté', async () => {
    await assertFails(setDoc(place(db(null), 'ana'), score()));
    await assertFails(setDoc(place(db('bob'), 'ana'), score()));
    await assertSucceeds(setDoc(place(db('ana'), 'ana'), score()));
  });

  it('de toujours et de la semaine en cours ; pas une semaine passée ou à venir', async () => {
    const n = semaine(Date.now());
    await assertSucceeds(setDoc(place(db('ana'), 'ana', cetteSemaine()), score()));
    await assertFails(setDoc(place(db('ana'), 'ana', `s${n - 1}`), score()));
    await assertFails(setDoc(place(db('ana'), 'ana', `s${n + 1}`), score()));
    await assertFails(setDoc(place(db('ana'), 'ana', 'demain'), score()));
  });

  it('bornes du barème et taille de l’épreuve', async () => {
    const a = db('ana');
    // 11 justes et une erreur : 11 000 à 11 500 points.
    await assertSucceeds(setDoc(place(a, 'ana'), score({ points: 11_500 })));
    await env.clearFirestore();
    await assertFails(setDoc(place(a, 'ana'), score({ points: 11_501 })));
    await assertFails(setDoc(place(a, 'ana'), score({ points: 10_999 })));
    await assertFails(setDoc(place(a, 'ana'), score({ justes: 13, points: 13_000 })));
    await assertFails(setDoc(place(a, 'ana'), score({ questions: 13 })));
    await assertFails(setDoc(place(a, 'ana', 'toujours', 'chrono:localiser:Atlantide'), score()));
    await assertFails(setDoc(place(a, 'ana'), score({ temps_ms: 12 * 200 - 1 })));
    await assertFails(setDoc(place(a, 'ana'), score({ temps_ms: 12 * 15_000 + 1 })));
    await assertFails(setDoc(place(a, 'ana'), score({ points: 11_000.5 })));
  });

  it('épreuve de l’île : 24 communes, mêmes bornes du barème', async () => {
    const a = db('ana');
    const I = 'chrono:localiser:reunion';
    // 23 justes et une erreur : 23 000 à 23 500 points (l'échelle de 5 km ne
    // change pas le plafond de 500 par erreur).
    const ile = (o: Record<string, unknown> = {}) => score({ questions: 24, justes: 23, points: 23_500, temps_ms: 120_000, ...o });
    await assertSucceeds(setDoc(place(a, 'ana', 'toujours', I), ile()));
    await env.clearFirestore();
    await assertFails(setDoc(place(a, 'ana', 'toujours', I), ile({ points: 23_501 })));
    await assertFails(setDoc(place(a, 'ana', 'toujours', I), ile({ points: 22_999 })));
    await assertFails(setDoc(place(a, 'ana', 'toujours', I), ile({ questions: 23, justes: 22, points: 22_000 })));
    await assertFails(setDoc(place(a, 'ana', 'toujours', I), ile({ questions: 25 })));
    await assertSucceeds(setDoc(place(a, 'ana', 'toujours', I), ile({ points: 23_000 })));
  });

  it('forme du document : champs, pseudo, date du serveur, version du barème', async () => {
    const a = db('ana');
    await assertFails(setDoc(place(a, 'ana'), { ...score(), triche: true }));
    const { bareme: _b, ...sansBareme } = score();
    await assertFails(setDoc(place(a, 'ana'), sansBareme));
    await assertFails(setDoc(place(a, 'ana'), score({ bareme: 2 })));
    await assertFails(setDoc(place(a, 'ana'), score({ pseudo: 'M' })));
    await assertFails(setDoc(place(a, 'ana'), score({ pseudo: 'x'.repeat(21) })));
    await assertFails(setDoc(place(a, 'ana'), score({ date: Timestamp.fromMillis(Date.now()) })));
  });

  it('un record ne se réécrit que s’il progresse, ou pour changer de pseudo', async () => {
    const a = db('ana');
    await assertSucceeds(setDoc(place(a, 'ana'), score()));
    await assertFails(setDoc(place(a, 'ana'), score({ points: 10_500, justes: 10 })));
    await assertFails(setDoc(place(a, 'ana'), score({ temps_ms: 61_000 })));
    await assertSucceeds(setDoc(place(a, 'ana'), score({ pseudo: 'Michel D' })));
    await assertSucceeds(setDoc(place(a, 'ana'), score({ temps_ms: 50_000 })));
    await assertSucceeds(setDoc(place(a, 'ana'), score({ points: 11_200, temps_ms: 90_000 })));
  });

  it('général : la somme de toutes les épreuves, 414 questions au plus (390 du monde + 24 de l’île)', async () => {
    const a = db('ana');
    await assertSucceeds(setDoc(place(a, 'ana', 'toujours', 'general'), score({ questions: 414, justes: 300, points: 300_000, temps_ms: 3_000_000 })));
    await env.clearFirestore();
    await assertFails(setDoc(place(a, 'ana', 'toujours', 'general'), score({ questions: 415, justes: 300, points: 300_000, temps_ms: 3_000_000 })));
  });

  it('chacun peut retirer sa place ; le reste de la base est fermé', async () => {
    await assertSucceeds(setDoc(place(db('ana'), 'ana'), score()));
    await assertFails(deleteDoc(place(db('bob'), 'ana')));
    await assertSucceeds(deleteDoc(place(db('ana'), 'ana')));
    await assertFails(setDoc(doc(db('ana'), 'joueurs', 'ana'), { a: 1 }));
    await assertFails(getDoc(doc(db(null), 'joueurs', 'ana')));
  });
});
