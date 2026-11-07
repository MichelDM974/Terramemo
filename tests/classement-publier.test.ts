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
const s = (points: number, temps_ms: number, questions = 12): ScoreEpreuve => ({ points, justes: Math.floor(points / 1000), questions, temps_ms });

beforeEach(() => {
  etat.refus = null;
  etat.place = null;
  etat.ecrits = [];
});

describe('publier() après un refus', () => {
  it('accepté : la place du pseudo en minuscules reçoit le score et le pseudo tel quel', async () => {
    expect(await publier(E, 'toujours', 'Élodie', s(11_000, 60_000))).toBe(true);
    expect(etat.ecrits).toEqual([
      { chemin: `classements/${E}/periodes/toujours/scores/élodie`, donnees: { pseudo: 'Élodie', points: 11_000, justes: 11, questions: 12, temps_ms: 60_000, date: 'maintenant', bareme: 1 } },
    ]);
  });

  it('refusé, mais la place égale ou bat déjà le score : ce n’est pas un refus', async () => {
    etat.refus = { code: 'permission-denied' };
    // Le même score sous une autre casse (pseudo stocké « michel »).
    etat.place = { pseudo: 'michel', ...s(11_000, 60_000) };
    expect(await publier(E, 'toujours', 'Michel', s(11_000, 60_000))).toBe(true);
    // Mieux en ligne (un autre appareil du pseudo).
    etat.place = { pseudo: 'Michel', ...s(11_000, 50_000) };
    expect(await publier(E, 'toujours', 'Michel', s(11_000, 60_000))).toBe(true);
  });

  it('refusé et la place est moins bonne, ou absente : un vrai refus', async () => {
    etat.refus = { code: 'permission-denied' };
    etat.place = { pseudo: 'Michel', ...s(10_000, 60_000) };
    expect(await publier(E, 'toujours', 'Michel', s(11_000, 60_000))).toBe(false);
    etat.place = null;
    expect(await publier(E, 'toujours', 'Ⓜichel', s(11_000, 60_000))).toBe(false);
  });

  it('hors ligne : il lève (l’envoi attend dans la file de src/vues/classement.ts)', async () => {
    etat.refus = { code: 'unavailable' };
    await expect(publier(E, 'toujours', 'Michel', s(11_000, 60_000))).rejects.toEqual({ code: 'unavailable' });
  });
});
