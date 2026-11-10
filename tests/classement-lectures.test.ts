// Lectures Firestore du 🏆 à son ouverture (D52 b, étude J2 § 8.3) : avant,
// mesPlaces lisait le général et toutes les épreuves classées (25 lectures,
// 46 une fois les capitales ouvertes, plus 3 par place) ; maintenant, le
// général et les seules épreuves où l'appareil a un record, plus les places
// déjà vues (epreuvesALire, src/vues/general.ts). Firestore est remplacé par
// un compteur : rien ne part sur le réseau.
import { describe, expect, it, vi } from 'vitest';
import { epreuvesClassees, epreuvesDuGeneral, idEpreuve, reglerHorlogeEpreuves, type RecordChrono } from '../src/epreuve/chrono';

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

const APRES = Date.parse('2026-11-16T00:00:00Z');
const AVANT = APRES - 1;
const col = (e: string) => `classements/${e}/periodes/toujours/scores`;
const rec = (points: number): RecordChrono => ({ points, justes: 0, questions: 1, temps_ms: 1_000, date: 1, bareme: 1 });

describe('lectures à l’ouverture du 🏆 (D52 b)', () => {
  it('un joueur classé dans 3 épreuves (record sur l’appareil) et une place vue : 1 + 4 lectures, plus 3 par place, au lieu de 1 + 45', async () => {
    const AFR = idEpreuve('Africa');
    const ILE = idEpreuve('reunion');
    const CAP = idEpreuve('Oceania', 'chrono', 'capitales');
    const VUE = idEpreuve('tous', 'minute', 'capitales');
    for (const e of [GENERAL, AFR, ILE, CAP]) places.set(col(e), { pseudo: 'Michel', points: 1_000, justes: 1, questions: 1, temps_ms: 1_000 });
    const classees = epreuvesClassees(APRES);
    const records = new Map([AFR, ILE, CAP].map((e) => [e, rec(1_000)]));

    // Avant D52 b (D52 a) : tout lire.
    lectures = 0;
    const tout = await mesPlaces('toujours', 'Michel', [GENERAL, ...classees]);
    const avant = lectures;
    expect(tout).toHaveLength(4);
    expect(avant).toBe(1 + 45 + 3 * 4);

    // Après : le général, les épreuves à record, la place vue (une Minute sans place : une lecture, pas de rang).
    lectures = 0;
    const aLire = [GENERAL, ...epreuvesALire(classees, records, 'toujours', new Set([VUE]))];
    expect(aLire).toEqual([GENERAL, AFR, CAP, ILE, VUE]);
    const lues = await mesPlaces('toujours', 'Michel', aLire);
    const apres = lectures;
    expect(lues.map((p) => p.epreuve)).toEqual([GENERAL, AFR, CAP, ILE]);
    expect(apres).toBe(1 + 4 + 3 * 4);
    // 58 lectures avant, 17 après (25 avant la bascule, sans les capitales : 1 + 24 + 3 par place).
    expect([avant, apres]).toEqual([58, 17]);
    expect(epreuvesClassees(AVANT)).toHaveLength(24);
  });

  it('la semaine : les records de la semaine seulement ; rien à lire : aucune lecture', async () => {
    const AFR = idEpreuve('Africa');
    const records = new Map([
      [AFR, rec(1)],
      [`${idEpreuve('Asia')}@s2914`, rec(1)],
    ]);
    expect(epreuvesALire(epreuvesClassees(APRES), records, 's2914', new Set())).toEqual([idEpreuve('Asia')]);
    expect(epreuvesALire(epreuvesClassees(APRES), records, 'toujours', new Set())).toEqual([AFR]);
    // Une épreuve pas encore ouverte (les capitales avant le 16/11) ne se lit pas, même vue.
    expect(epreuvesALire(epreuvesClassees(AVANT), new Map(), 'toujours', new Set([idEpreuve('Oceania', 'chrono', 'capitales')]))).toEqual([]);
    lectures = 0;
    expect(await mesPlaces('toujours', 'Michel', [])).toEqual([]);
    expect(lectures).toBe(0);
  });

  it('le général se lit dans les Chrono des sujets ouverts : 8 lectures par période avant la bascule, 15 après', async () => {
    expect([epreuvesDuGeneral(AVANT).length, epreuvesDuGeneral(APRES).length]).toEqual([8, 15]);
    // placesDuPseudo (publication du général) suit la bascule : les Chrono des capitales ne se lisent qu'après.
    try {
      for (const [t, n] of [
        [AVANT, 8],
        [APRES, 15],
      ] as const) {
        reglerHorlogeEpreuves(() => t);
        lectures = 0;
        lus.length = 0;
        await placesDuPseudo('toujours', 'Michel');
        expect(lectures).toBe(n);
        expect(lus).toEqual(epreuvesDuGeneral(t).map(col));
      }
    } finally {
      reglerHorlogeEpreuves(() => Date.now());
    }
  });
});
