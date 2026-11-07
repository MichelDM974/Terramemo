// Fiches des lots dans terramemo-synchro (src/sync/depot-lots.ts, J1b lot 3) :
// par compte (clé [uid, id]), remplacées à l'écriture ; repli en mémoire
// seulement si IndexedDB est inutilisable pour de bon, une erreur passagère
// remonte (l'envoi s'arrête et relira).
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeAll, describe, expect, it } from 'vitest';
import { depotLotsIndexedDb, type FicheLot } from '../src/sync/depot-lots';

const fiche = (uid: string, id: string, o: Partial<FicheLot> = {}): FicheLot => ({
  uid, id, seance: null, appareil: 'a', ids: [id], etat: 'a_envoyer', cause: null, essais: 0, prochain: 0, version: 'v1', doc: null, ...o,
});

// Le navigateur a IDBKeyRange en global ; Node non.
beforeAll(() => {
  (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange ??= IDBKeyRange;
});

describe('dépôt des fiches de lots', () => {
  it('par compte, remplacées à l’écriture, gardées d’une ouverture à l’autre', async () => {
    const idb = new IDBFactory();
    const d = depotLotsIndexedDb(idb);
    await d.ecrire([fiche('ana', 'x'), fiche('ana', 'y'), fiche('bob', 'x')]);
    await d.ecrire([fiche('ana', 'x', { etat: 'envoye' })]);
    const ana = await depotLotsIndexedDb(idb).tous('ana');
    expect(ana.map((f) => [f.id, f.etat]).sort()).toEqual([['x', 'envoye'], ['y', 'a_envoyer']]);
    expect((await d.tous('bob')).map((f) => f.id)).toEqual(['x']);
    expect(await d.tous('an')).toEqual([]);
  });

  it('IndexedDB inutilisable (SecurityError) : en mémoire pour la page ; erreur passagère : remonte', async () => {
    const qui = (nom: string) => ({ open: () => { throw new DOMException('non', nom); } }) as unknown as IDBFactory;
    const d = depotLotsIndexedDb(qui('SecurityError'));
    await d.ecrire([fiche('ana', 'x')]);
    expect((await d.tous('ana')).map((f) => f.id)).toEqual(['x']);
    await expect(depotLotsIndexedDb(qui('UnknownError')).tous('ana')).rejects.toThrow();
  });
});
