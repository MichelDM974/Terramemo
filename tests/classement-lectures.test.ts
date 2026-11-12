// Lectures Firestore du 🏆 à son ouverture (D52 b, étude J2 § 8.3) : avant,
// mesPlaces lisait le général et toutes les épreuves classées (47 lectures
// avec les capitales, les drapeaux et les mers, Minute retiré, plus 3 par place) ; maintenant, le
// général et les seules épreuves où l'appareil a un record, plus les places
// déjà vues (epreuvesALire, src/vues/general.ts). Firestore est remplacé par
// un compteur : rien ne part sur le réseau.
import { describe, expect, it, vi } from 'vitest';
import { epreuvesClassees, epreuvesDuGeneral, idEpreuve, type RecordChrono } from '../src/epreuve/chrono';

/** Les places en ligne du pseudo « michel » : chemin de la collection → place. */
const places = new Map<string, Record<string, unknown>>();
let lectures = 0;
/** Les collections lues par getDoc, dans l'ordre. */
const lus: string[] = [];
/** Les champs filtrés (where) et triés (orderBy) par les requêtes : ni l'un ni l'autre ne touche plus aux questions. */
const champs: string[] = [];
const fs = {
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (col: string, id: string) => ({ col, id }),
  query: (col: string) => col,
  where: (champ: string) => void champs.push(`where ${champ}`),
  orderBy: (champ: string) => void champs.push(`orderBy ${champ}`),
  limit: () => null,
  getDocs: async () => ({ docs: [] }),
  getDoc: async (ref: { col: string; id: string }) => {
    lectures++;
    lus.push(ref.col);
    const p = places.get(ref.col);
    return { id: ref.id, exists: () => !!p, data: () => p ?? {} };
  },
  getCount: async () => {
    lectures++;
    return { data: () => ({ count: 3 }) };
  },
};
vi.mock('../src/sync/firebase', () => ({
  charger: async () => ({ db: 'db', m: { fs } }),
  compte: async () => 'uid',
}));

const { GENERAL, lireTableau, mesPlaces, placesDuPseudo } = await import('../src/epreuve/classement');
const { epreuvesALire } = await import('../src/vues/general');

const col = (e: string) => `classements/${e}/periodes/toujours/scores`;
const rec = (justes: number): RecordChrono => ({ points: justes, justes, questions: justes, temps_ms: 1_000, date: 1, bareme: 2 });

describe('lectures à l’ouverture du 🏆 (D52 b)', () => {
  it('un joueur classé dans 4 épreuves (record sur l’appareil) et une place vue : 1 + 5 lectures, plus 3 par place, au lieu de 1 + 46', async () => {
    const AFR = idEpreuve('Africa');
    const ILE = idEpreuve('reunion');
    const CAP = idEpreuve('Oceania', 'chrono', 'capitales');
    const DRA = idEpreuve('Europe', 'chrono', 'drapeaux');
    const VUE = idEpreuve('tous', 'sansfaute', 'capitales');
    for (const e of [GENERAL, AFR, ILE, CAP, DRA]) places.set(col(e), { pseudo: 'Michel', points: 1, justes: 1, questions: 1, temps_ms: 1_000, bareme: 2 });
    const classees = epreuvesClassees();
    const records = new Map([AFR, ILE, CAP, DRA].map((e) => [e, rec(1)]));

    // Avant D52 b (D52 a) : tout lire.
    lectures = 0;
    const tout = await mesPlaces('toujours', 'Michel', [GENERAL, ...classees]);
    const avant = lectures;
    expect(tout).toHaveLength(5);
    expect(avant).toBe(1 + 46 + 3 * 5);

    // Après : le général, les épreuves à record, la place vue (un Sans faute sans place : une lecture, pas de rang).
    lectures = 0;
    const aLire = [GENERAL, ...epreuvesALire(classees, records, 'toujours', new Set([VUE]))];
    expect(aLire).toEqual([GENERAL, AFR, CAP, DRA, ILE, VUE]);
    const lues = await mesPlaces('toujours', 'Michel', aLire);
    const apres = lectures;
    expect(lues.map((p) => p.epreuve)).toEqual([GENERAL, AFR, CAP, DRA, ILE]);
    expect(apres).toBe(1 + 5 + 3 * 5);
    // 62 lectures avant, 21 après : les mers (lot 3b) n'ajoutent rien à l'ouverture sans record ni place des mers.
    expect([avant, apres]).toEqual([62, 21]);
    places.clear();
  });

  it('la semaine : les records de la semaine seulement ; rien à lire : aucune lecture', async () => {
    const AFR = idEpreuve('Africa');
    const records = new Map([
      [AFR, rec(1)],
      [`${idEpreuve('Asia')}@s2914`, rec(1)],
    ]);
    expect(epreuvesALire(epreuvesClassees(), records, 's2914', new Set())).toEqual([idEpreuve('Asia')]);
    expect(epreuvesALire(epreuvesClassees(), records, 'toujours', new Set())).toEqual([AFR]);
    // Une épreuve des drapeaux ou des mers (lot 3b) se lit avec son record, ou vue ; une hors du catalogue (le quiz, pas
    // encore classé), jamais, même vue ou avec un record.
    const DRA = idEpreuve('Oceania', 'sansfaute', 'drapeaux');
    expect(epreuvesALire(epreuvesClassees(), new Map([[DRA, rec(1)]]), 'toujours', new Set())).toEqual([DRA]);
    const MERS = idEpreuve('mers', 'chrono', 'mers');
    const SF_MERS = idEpreuve('mers', 'sansfaute', 'mers');
    expect(epreuvesALire(epreuvesClassees(), new Map([[MERS, rec(1)]]), 'toujours', new Set([SF_MERS]))).toEqual([MERS, SF_MERS]);
    const QUIZ = 'quiz:general:facile';
    expect(epreuvesALire(epreuvesClassees(), new Map([[QUIZ, rec(1)]]), 'toujours', new Set([QUIZ]))).toEqual([]);
    lectures = 0;
    expect(await mesPlaces('toujours', 'Michel', [])).toEqual([]);
    expect(lectures).toBe(0);
  });

  it('le général se lit dans les Chrono de tous les sujets, capitales, drapeaux et mers compris : 23 lectures par période', async () => {
    expect(epreuvesDuGeneral()).toHaveLength(23);
    lectures = 0;
    lus.length = 0;
    await placesDuPseudo('toujours', 'Michel');
    expect(lectures).toBe(23);
    expect(lus).toEqual(epreuvesDuGeneral().map(col));
    expect(lus.filter((c) => /:(capitales|drapeaux):/.test(c))).toHaveLength(14);
    // Les mers (lot 3b) : une lecture de plus par période, leur Chrono.
    expect(lus.filter((c) => c.includes(':mers:'))).toEqual([col('chrono:mers:mers')]);
  });

  // Barème 2 (décision « Barème et classements » du 12/11/2026, #30) : une
  // place écrite avant (bareme 1, ou sans barème) compte en justes, comme la
  // migration de l'outil du propriétaire la réécrira ; sinon ses ~1 000
  // points par juste fausseraient le général et paraîtraient imbattables.
  it('une place du barème 1 (bareme 1 ou absent) se lit à points = justes ; une du barème 2 telle quelle', async () => {
    const [AFR, ASI, EUR] = [idEpreuve('Africa'), idEpreuve('Asia'), idEpreuve('Europe')];
    places.set(col(AFR), { pseudo: 'Michel', points: 50_351, justes: 50, questions: 54, temps_ms: 300_000, bareme: 1 });
    places.set(col(ASI), { pseudo: 'Michel', points: 40_000, justes: 40, questions: 48, temps_ms: 250_000 });
    places.set(col(EUR), { pseudo: 'Michel', points: 30, justes: 30, questions: 44, temps_ms: 200_000, bareme: 2 });
    const lues = await placesDuPseudo('toujours', 'Michel');
    expect(Object.fromEntries(lues)).toEqual({
      [AFR]: { points: 50, justes: 50, questions: 54, temps_ms: 300_000 },
      [ASI]: { points: 40, justes: 40, questions: 48, temps_ms: 250_000 },
      [EUR]: { points: 30, justes: 30, questions: 44, temps_ms: 200_000 },
    });
    const [moi] = await mesPlaces('toujours', 'Michel', [AFR]);
    expect(moi?.place).toMatchObject({ cle: 'michel', pseudo: 'Michel', points: 50, justes: 50 });
    places.clear();
  });

  it('le rang et le tableau se lisent aux points (les justes), puis au temps : plus rien aux questions (Minute retiré)', async () => {
    const AFR = idEpreuve('Africa');
    places.set(col(AFR), { pseudo: 'Michel', points: 50_351, justes: 50, questions: 54, temps_ms: 300_000, bareme: 1 });
    champs.length = 0;
    lectures = 0;
    // Hors des premiers (getDocs vide) : ma place, puis son rang en deux comptes, plus le nombre de joueurs.
    const t = await lireTableau(AFR, 'toujours', 'Michel');
    expect(t.moi).toMatchObject({ points: 50, justes: 50 });
    expect(t.rang).toBe(1 + 3 + 3);
    expect(champs).toEqual(['orderBy points', 'orderBy temps_ms', 'where points', 'where points', 'where temps_ms']);
    champs.length = 0;
    await mesPlaces('toujours', 'Michel', [AFR]);
    expect(champs).toEqual(['where points', 'where points', 'where temps_ms']);
    places.clear();
  });
});
