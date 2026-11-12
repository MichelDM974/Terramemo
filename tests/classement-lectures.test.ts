// Lectures Firestore du 🏆 à son ouverture (D52 b, étude J2 § 8.3) : avant,
// mesPlaces lisait le général et toutes les épreuves classées (67 lectures
// avec les capitales et les drapeaux, plus 3 par place) ; maintenant, le
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
const fs = {
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (col: string, id: string) => ({ col, id }),
  query: (col: string) => col,
  where: () => null,
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

const { GENERAL, mesPlaces, placesDuPseudo } = await import('../src/epreuve/classement');
const { epreuvesALire } = await import('../src/vues/general');

const col = (e: string) => `classements/${e}/periodes/toujours/scores`;
const rec = (points: number): RecordChrono => ({ points, justes: 0, questions: 1, temps_ms: 1_000, date: 1, bareme: 1 });

describe('lectures à l’ouverture du 🏆 (D52 b)', () => {
  it('un joueur classé dans 4 épreuves (record sur l’appareil) et une place vue : 1 + 5 lectures, plus 3 par place, au lieu de 1 + 66', async () => {
    const AFR = idEpreuve('Africa');
    const ILE = idEpreuve('reunion');
    const CAP = idEpreuve('Oceania', 'chrono', 'capitales');
    const DRA = idEpreuve('Europe', 'chrono', 'drapeaux');
    const VUE = idEpreuve('tous', 'minute', 'capitales');
    for (const e of [GENERAL, AFR, ILE, CAP, DRA]) places.set(col(e), { pseudo: 'Michel', points: 1_000, justes: 1, questions: 1, temps_ms: 1_000 });
    const classees = epreuvesClassees();
    const records = new Map([AFR, ILE, CAP, DRA].map((e) => [e, rec(1_000)]));

    // Avant D52 b (D52 a) : tout lire.
    lectures = 0;
    const tout = await mesPlaces('toujours', 'Michel', [GENERAL, ...classees]);
    const avant = lectures;
    expect(tout).toHaveLength(5);
    expect(avant).toBe(1 + 66 + 3 * 5);

    // Après : le général, les épreuves à record, la place vue (une Minute sans place : une lecture, pas de rang).
    lectures = 0;
    const aLire = [GENERAL, ...epreuvesALire(classees, records, 'toujours', new Set([VUE]))];
    expect(aLire).toEqual([GENERAL, AFR, CAP, DRA, ILE, VUE]);
    const lues = await mesPlaces('toujours', 'Michel', aLire);
    const apres = lectures;
    expect(lues.map((p) => p.epreuve)).toEqual([GENERAL, AFR, CAP, DRA, ILE]);
    expect(apres).toBe(1 + 5 + 3 * 5);
    // 82 lectures avant, 21 après.
    expect([avant, apres]).toEqual([82, 21]);
  });

  it('la semaine : les records de la semaine seulement ; rien à lire : aucune lecture', async () => {
    const AFR = idEpreuve('Africa');
    const records = new Map([
      [AFR, rec(1)],
      [`${idEpreuve('Asia')}@s2914`, rec(1)],
    ]);
    expect(epreuvesALire(epreuvesClassees(), records, 's2914', new Set())).toEqual([idEpreuve('Asia')]);
    expect(epreuvesALire(epreuvesClassees(), records, 'toujours', new Set())).toEqual([AFR]);
    // Une épreuve des drapeaux se lit avec son record ; une d'un sujet sans épreuves classées (les mers, hors de
    // EPREUVES_SUJETS), jamais, même vue ou avec un record.
    const DRA = idEpreuve('Oceania', 'sansfaute', 'drapeaux');
    expect(epreuvesALire(epreuvesClassees(), new Map([[DRA, rec(1)]]), 'toujours', new Set())).toEqual([DRA]);
    const MERS = idEpreuve('mers', 'chrono', 'mers');
    expect(epreuvesALire(epreuvesClassees(), new Map([[MERS, rec(1)]]), 'toujours', new Set([MERS]))).toEqual([]);
    lectures = 0;
    expect(await mesPlaces('toujours', 'Michel', [])).toEqual([]);
    expect(lectures).toBe(0);
  });

  it('le général se lit dans les Chrono de tous les sujets, capitales et drapeaux compris : 22 lectures par période', async () => {
    expect(epreuvesDuGeneral()).toHaveLength(22);
    lectures = 0;
    lus.length = 0;
    await placesDuPseudo('toujours', 'Michel');
    expect(lectures).toBe(22);
    expect(lus).toEqual(epreuvesDuGeneral().map(col));
    expect(lus.filter((c) => /:(capitales|drapeaux):/.test(c))).toHaveLength(14);
  });
});
