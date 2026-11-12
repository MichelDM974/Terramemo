// publier() (src/epreuve/classement.ts) après un refus des règles : il relit
// la place et ne compte pas comme refusé un score qu'elle égale ou bat déjà
// (un autre appareil du même pseudo, ou le même score republié sous une
// autre casse, que les règles refusent depuis le 07/11 : le pseudo stocké
// reste à score égal). Firestore est remplacé : rien ne part sur le réseau.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreEpreuve } from '../src/epreuve/bareme';

const etat = {
  refus: null as null | { code: string },
  place: null as null | Record<string, unknown>,
  ecrits: [] as { chemin: string; donnees: Record<string, unknown> }[],
};
const fs = {
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (col: string, id: string) => ({ chemin: `${col}/${id}`, id }),
  serverTimestamp: () => 'maintenant',
  setDoc: async (ref: { chemin: string }, donnees: Record<string, unknown>) => {
    if (etat.refus) throw etat.refus;
    etat.ecrits.push({ chemin: ref.chemin, donnees });
  },
  getDoc: async (ref: { id: string }) => ({ id: ref.id, exists: () => etat.place !== null, data: () => etat.place ?? {} }),
};
vi.mock('../src/sync/firebase', () => ({
  charger: async () => ({ db: 'db', m: { fs } }),
  compte: async () => 'uid',
}));

const { publier } = await import('../src/epreuve/classement');
const E = 'chrono:localiser:South America';
/** Un score du barème 2 : points = justes. */
const s = (justes: number, temps_ms: number, questions = 12): ScoreEpreuve => ({ points: justes, justes, questions, temps_ms });

beforeEach(() => {
  etat.refus = null;
  etat.place = null;
  etat.ecrits = [];
});

describe('publier() après un refus', () => {
  it('accepté : la place du pseudo en minuscules reçoit le score et le pseudo tel quel', async () => {
    expect(await publier(E, 'toujours', 'Élodie', s(11, 60_000))).toBe(true);
    expect(etat.ecrits).toEqual([
      { chemin: `classements/${E}/periodes/toujours/scores/élodie`, donnees: { pseudo: 'Élodie', points: 11, justes: 11, questions: 12, temps_ms: 60_000, date: 'maintenant', bareme: 2 } },
    ]);
  });

  it('refusé, mais la place égale ou bat déjà le score : ce n’est pas un refus', async () => {
    etat.refus = { code: 'permission-denied' };
    // Le même score sous une autre casse (pseudo stocké « michel »).
    etat.place = { pseudo: 'michel', ...s(11, 60_000), bareme: 2 };
    expect(await publier(E, 'toujours', 'Michel', s(11, 60_000))).toBe(true);
    // Mieux en ligne (un autre appareil du pseudo).
    etat.place = { pseudo: 'Michel', ...s(11, 50_000), bareme: 2 };
    expect(await publier(E, 'toujours', 'Michel', s(11, 60_000))).toBe(true);
  });

  it('refusé et la place est moins bonne, ou absente : un vrai refus', async () => {
    etat.refus = { code: 'permission-denied' };
    etat.place = { pseudo: 'Michel', ...s(10, 60_000), bareme: 2 };
    expect(await publier(E, 'toujours', 'Michel', s(11, 60_000))).toBe(false);
    etat.place = null;
    expect(await publier(E, 'toujours', 'Ⓜichel', s(11, 60_000))).toBe(false);
  });

  // Barème 2 (décision « Barème et classements » du 12/11/2026, #30) : une
  // place du barème 1 (~1 000 points par juste) se compare en justes, comme
  // les règles la jugent (progresse) ; sinon publier conclurait « déjà mieux »
  // sans rien dire, à un score qu'elle ne bat pas.
  it('refusé devant une place du barème 1 : comparée en justes, jamais en points de proximité', async () => {
    etat.refus = { code: 'permission-denied' };
    // 189 justes (200 000 points au barème 1) ne battent pas 190 justes : un vrai refus.
    etat.place = { pseudo: 'Michel', points: 200_000, justes: 189, questions: 195, temps_ms: 900_000, bareme: 1 };
    expect(await publier(E, 'toujours', 'Michel', s(190, 900_000, 195))).toBe(false);
    // Sans barème (avant qu'il ne soit écrit) : de même.
    etat.place = { pseudo: 'Michel', points: 200_000, justes: 189, questions: 195, temps_ms: 900_000 };
    expect(await publier(E, 'toujours', 'Michel', s(190, 900_000, 195))).toBe(false);
    // 190 justes plus rapides en ligne : déjà mieux.
    etat.place = { pseudo: 'Michel', points: 190_351, justes: 190, questions: 195, temps_ms: 800_000, bareme: 1 };
    expect(await publier(E, 'toujours', 'Michel', s(190, 900_000, 195))).toBe(true);
  });

  it('hors ligne : il lève (l’envoi attend dans la file de src/vues/classement.ts)', async () => {
    etat.refus = { code: 'unavailable' };
    await expect(publier(E, 'toujours', 'Michel', s(11, 60_000))).rejects.toEqual({ code: 'unavailable' });
  });
});
