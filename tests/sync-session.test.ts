// Session du J1b (src/sync/session.ts, étude § 5.1) : base terramemo-synchro
// en version 1 avec ses trois magasins dès le départ, une seule fiche
// session, repli en mémoire sans IndexedDB ; terramemo-journal jamais touché.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { BASE_JOURNAL, depotIndexedDb } from '../src/journal/depot';
import { BASE_SYNCHRO, depotSessionIndexedDb, depotSessionMemoire, ouvrirBaseSynchro, sessionVide, type Session } from '../src/sync/session';

describe('session', () => {
  it('base v1, trois magasins créés dès la première ouverture', async () => {
    const idb = new IDBFactory();
    const db = await ouvrirBaseSynchro(idb);
    expect(db.name).toBe(BASE_SYNCHRO);
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames].sort()).toEqual(['a_relire', 'lots', 'session']);
    const lots = db.transaction('lots').objectStore('lots');
    expect(lots.keyPath).toEqual(['uid', 'id']);
    db.close();
  });

  it('aucune fiche au départ, puis la dernière écrite', async () => {
    const idb = new IDBFactory();
    const d = depotSessionIndexedDb(idb);
    expect(await d.lire()).toBeNull();
    const s = { ...sessionVide('0.0.0'), uid: 'u1', fournisseurs: ['password' as const], adresse: 'a@exemple.fr' };
    await d.ecrire(s);
    await d.ecrire({ ...s, deconnexion: 'voulue' });
    expect(await d.lire()).toEqual({ ...s, deconnexion: 'voulue' });
    // Une autre page (autre dépôt, même base) lit la même fiche.
    expect((await depotSessionIndexedDb(idb).lire())?.uid).toBe('u1');
  });

  it('n’ouvre ni ne crée terramemo-journal', async () => {
    const idb = new IDBFactory();
    await depotSessionIndexedDb(idb).ecrire(sessionVide('x'));
    expect((await idb.databases()).map((b) => b.name)).toEqual([BASE_SYNCHRO]);
    await depotIndexedDb(BASE_JOURNAL, { idb, persister: async () => false }).tous();
    expect((await idb.databases()).map((b) => b.name).sort()).toEqual([BASE_JOURNAL, BASE_SYNCHRO].sort());
  });

  it('les fiches sont des copies', async () => {
    for (const d of [depotSessionMemoire(), depotSessionIndexedDb(new IDBFactory())]) {
      const s: Session = { ...sessionVide('x'), fournisseurs: ['password'] };
      await d.ecrire(s);
      s.fournisseurs.push('google.com');
      const lue = (await d.lire())!;
      expect(lue.fournisseurs).toEqual(['password']);
      lue.fournisseurs.push('google.com');
      expect((await d.lire())!.fournisseurs).toEqual(['password']);
    }
  });

  it('sans IndexedDB : en mémoire, le temps de la page', async () => {
    const d = depotSessionIndexedDb(undefined);
    await d.ecrire({ ...sessionVide('x'), uid: 'u' });
    expect((await d.lire())?.uid).toBe('u');
  });
});
