// Dépôt du journal (src/journal/depot.ts) : une même suite de contrat sur
// depotMemoire et depotIndexedDb (IndexedDB de fake-indexeddb, une fabrique
// neuve par test) — idempotence, lot invalide refusé entier, ordre
// indifférent, copies, rejeu (etat() de src/srs/rejeu.ts) identique depuis
// les deux. Puis ce qui n'est qu'à IndexedDB : persistance demandée une fois,
// erreurs traduites, et la base 'terramemo' du maillage webgl jamais ouverte.
import { readFileSync } from 'node:fs';
import { IDBDatabase as FauxIDBDatabase, IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { BASE_JOURNAL, BASE_MAILLAGE, depotIndexedDb, depotMemoire, ErreurDepot, type Depot } from '../src/journal/depot';
import type { Evenement } from '../src/srs/journal';
import { AGAIN, GOOD, type Note } from '../src/srs/note';
import { etat } from '../src/srs/rejeu';

const JOUR = 86_400_000;
const T0 = Date.UTC(2026, 10, 6, 8); // 12 h à La Réunion

let n = 0;
function rep(fiche: string, ts: number, note: Note | null, plus: Partial<Evenement> = {}): Evenement {
  n++;
  return {
    v: 1, id: `e${String(n).padStart(5, '0')}`, appareil: 'A', ts, tz: 240, seance: 's1', type: 'reponse', fiche,
    mode: note == null ? 'qcm' : 'revision', correct: note !== AGAIN, aide: null, reponse: null, note, ...plus,
  };
}

/** Un petit journal sur trois semaines : notes, QCM, réinitialisation, deux appareils. */
function journal(): Evenement[] {
  const evts: Evenement[] = [];
  for (const [k, f] of ['pays:FRA:localiser', 'pays:ITA:localiser', 'pays:VAT:localiser', 'communes:97411:localiser'].entries()) {
    for (let j = 0; j < 21; j += 1 + k) {
      evts.push(rep(f, T0 + j * JOUR + k * 60_000, j % 5 === 3 ? AGAIN : GOOD, { appareil: j % 2 ? 'B' : 'A' }));
      evts.push(rep(f, T0 + j * JOUR + k * 60_000 + 1000, null));
    }
  }
  evts.push({ v: 1, id: 'reinit-ita', appareil: 'A', ts: T0 + 10 * JOUR, tz: 240, seance: null, type: 'reinitialiser', fiche: 'pays:ITA:localiser' });
  return evts;
}

/** Générateur à graine (mulberry32) et mélange. */
function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function melanger<T>(xs: readonly T[], alea: () => number): T[] {
  const r = [...xs];
  for (let i = r.length - 1; i > 0; i--) {
    const k = Math.floor(alea() * (i + 1));
    [r[i], r[k]] = [r[k]!, r[i]!];
  }
  return r;
}

const parId = (evts: readonly Evenement[]) => [...evts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const sansPersistance = () => Promise.resolve(false);
const IMPLEMENTATIONS: [string, () => Depot][] = [
  ['depotMemoire', () => depotMemoire()],
  ['depotIndexedDb (fake-indexeddb)', () => depotIndexedDb(BASE_JOURNAL, { idb: new IDBFactory(), persister: sansPersistance })],
];

describe.each(IMPLEMENTATIONS)('contrat du dépôt : %s', (_, fabrique) => {
  it('vide au départ ; un lot vide ne fait rien', async () => {
    const d = fabrique();
    expect(await d.tous()).toEqual([]);
    await d.ajouter([]);
    expect(await d.tous()).toEqual([]);
  });

  it('rend ce qui a été ajouté, à l’identique', async () => {
    const d = fabrique();
    const evts = journal();
    await d.ajouter(evts.slice(0, 10));
    await d.ajouter(evts.slice(10));
    expect(parId(await d.tous())).toEqual(parId(evts));
  });

  it('idempotent : un id déjà gardé n’est ni dupliqué ni réécrit, même dans un seul lot', async () => {
    const d = fabrique();
    const a = rep('pays:FRA:localiser', T0, GOOD);
    const b = rep('pays:ITA:localiser', T0, GOOD);
    await d.ajouter([a]);
    await d.ajouter([a, b]);
    await d.ajouter([b, b, { ...a, note: AGAIN, correct: false }]);
    const tous = parId(await d.tous());
    expect(tous).toEqual(parId([a, b]));
    expect(tous.find((e) => e.id === a.id)?.note).toBe(GOOD);
  });

  it('un événement invalide fait refuser tout le lot, sans rien écrire', async () => {
    const d = fabrique();
    const a = rep('pays:FRA:localiser', T0, GOOD);
    await d.ajouter([a]);
    const bon = rep('pays:ITA:localiser', T0, GOOD);
    const mauvais = { ...rep('pays:ESP:localiser', T0, GOOD), mode: 'qcm' } as Evenement; // note hors FSRS
    const inconnu = { ...rep('pays:PRT:localiser', T0, GOOD), surplus: 1 } as unknown as Evenement;
    for (const lot of [[bon, mauvais], [bon, inconnu]]) {
      const e = await d.ajouter(lot).then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(ErreurDepot);
      expect((e as ErreurDepot).raison).toBe('invalide');
    }
    expect(await d.tous()).toEqual([a]);
  });

  it('garde des copies : ni l’objet ajouté ni l’objet rendu ne le modifient après coup', async () => {
    const d = fabrique();
    const a = rep('pays:FRA:localiser', T0, GOOD);
    await d.ajouter([a]);
    a.note = AGAIN;
    const [lu] = await d.tous();
    expect(lu?.note).toBe(GOOD);
    lu!.note = AGAIN;
    expect((await d.tous())[0]?.note).toBe(GOOD);
  });

  it('ordre et découpage des lots indifférents : même contenu, même rejeu (10 tirages)', async () => {
    const evts = journal();
    const attendu = etat(evts);
    expect(attendu.size).toBeGreaterThan(2);
    for (let g = 1; g <= 10; g++) {
      const alea = graine(g);
      const d = fabrique();
      const melange = melanger(evts, alea);
      // Lots de taille tirée, avec des renvois (doublons) de lots déjà écrits.
      for (let i = 0; i < melange.length; ) {
        const k = 1 + Math.floor(alea() * 12);
        await d.ajouter(melange.slice(i, i + k));
        if (alea() < 0.3) await d.ajouter(melange.slice(Math.max(0, i - 5), i + k));
        i += k;
      }
      const tous = await d.tous();
      expect(tous).toHaveLength(evts.length);
      expect(parId(tous)).toEqual(parId(evts));
      expect(etat(tous)).toEqual(attendu);
    }
  });
});

describe('les deux dépôts rejouent pareil', () => {
  it('etat() identique depuis depotMemoire et depotIndexedDb, et égal au journal d’origine', async () => {
    const evts = journal();
    const [m, i] = IMPLEMENTATIONS.map(([, f]) => f()) as [Depot, Depot];
    await m.ajouter(evts);
    await i.ajouter(melanger(evts, graine(42)));
    const em = etat(await m.tous());
    expect(etat(await i.tous())).toEqual(em);
    expect(em).toEqual(etat(evts));
  });
});

describe('depotIndexedDb', () => {
  it('le journal survit à la fermeture : un autre dépôt sur la même base le relit', async () => {
    const idb = new IDBFactory();
    const evts = journal();
    await depotIndexedDb(BASE_JOURNAL, { idb, persister: sansPersistance }).ajouter(evts);
    expect(parId(await depotIndexedDb(BASE_JOURNAL, { idb }).tous())).toEqual(parId(evts));
  });

  it('magasin evenements, clé id, index seance', async () => {
    const idb = new IDBFactory();
    await depotIndexedDb(BASE_JOURNAL, { idb, persister: sansPersistance }).ajouter([rep('pays:FRA:localiser', T0, GOOD, { seance: 's9' })]);
    const db = await new Promise<IDBDatabase>((ok, ko) => {
      const r = idb.open(BASE_JOURNAL);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames]).toEqual(['evenements']);
    const m = db.transaction('evenements').objectStore('evenements');
    expect(m.keyPath).toBe('id');
    expect([...m.indexNames]).toEqual(['seance']);
    const n9 = await new Promise<number>((ok) => {
      const r = m.index('seance').count('s9');
      r.onsuccess = () => ok(r.result);
    });
    expect(n9).toBe(1);
    db.close();
  });

  it('persistance demandée une fois, au premier ajout réel ; refus et erreurs ignorés', async () => {
    for (const persister of [vi.fn(() => Promise.resolve(true)), vi.fn(() => Promise.reject(new Error('non'))), vi.fn((): Promise<unknown> => { throw new Error('absent'); })]) {
      const d = depotIndexedDb(BASE_JOURNAL, { idb: new IDBFactory(), persister });
      await d.ajouter([]);
      await d.ajouter([{ ...rep('pays:FRA:localiser', T0, GOOD), mode: 'qcm' }]).catch(() => undefined); // invalide
      expect(persister).not.toHaveBeenCalled();
      await d.ajouter([rep('pays:FRA:localiser', T0, GOOD)]);
      await d.ajouter([rep('pays:ITA:localiser', T0, GOOD)]);
      expect(persister).toHaveBeenCalledTimes(1);
      expect(await d.tous()).toHaveLength(2);
    }
  });

  it('sans IndexedDB (node, navigation privée) : ErreurDepot « indisponible », sans lever à la création', async () => {
    expect(typeof indexedDB).toBe('undefined');
    const d = depotIndexedDb();
    for (const op of [() => d.tous(), () => d.ajouter([rep('pays:FRA:localiser', T0, GOOD)])]) {
      const e = await op().then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(ErreurDepot);
      expect((e as ErreurDepot).raison).toBe('indisponible');
    }
  });

  it('ouverture refusée puis rétablie : erreur traduite, nouvel essai au prochain appel', async () => {
    const vraie = new IDBFactory();
    const echecs: string[] = ['SecurityError', 'QuotaExceededError', 'UnknownError'];
    const idb = {
      open(nom: string, version?: number) {
        const nomErreur = echecs.shift();
        if (!nomErreur) return vraie.open(nom, version);
        if (nomErreur === 'SecurityError') throw new DOMException('refusé', nomErreur);
        const r = { error: new DOMException('échec', nomErreur) } as unknown as IDBOpenDBRequest;
        setTimeout(() => r.onerror?.(new Event('error')), 0);
        return r;
      },
    } as unknown as IDBFactory;
    const d = depotIndexedDb(BASE_JOURNAL, { idb, persister: sansPersistance });
    const raisons: string[] = [];
    for (let i = 0; i < 3; i++) raisons.push(await d.tous().then(() => 'ok', (e: ErreurDepot) => e.raison));
    expect(raisons).toEqual(['indisponible', 'quota', 'echec']);
    await d.ajouter([rep('pays:FRA:localiser', T0, GOOD)]);
    expect(await d.tous()).toHaveLength(1);
  });

  it('quota dépassé à l’écriture : ErreurDepot « quota », rien d’écrit, le dépôt reste utilisable', async () => {
    const idb = new IDBFactory();
    const d = depotIndexedDb(BASE_JOURNAL, { idb, persister: sansPersistance });
    await d.ajouter([rep('pays:FRA:localiser', T0, GOOD)]);
    // Le navigateur annule la transaction avec QuotaExceededError : simulé en
    // annulant à la main, l'erreur posée sur la transaction.
    const transaction = vi.spyOn(FauxIDBDatabase.prototype, 'transaction').mockImplementationOnce(function (this: IDBDatabase, ...a) {
      transaction.mockRestore();
      const tx = this.transaction(...a);
      Object.defineProperty(tx, 'error', { value: new DOMException('plein', 'QuotaExceededError') });
      queueMicrotask(() => tx.abort());
      return tx;
    });
    const e = await d.ajouter([rep('pays:ITA:localiser', T0, GOOD)]).then(() => null, (x: unknown) => x);
    expect((e as ErreurDepot).raison).toBe('quota');
    expect(await d.tous()).toHaveLength(1);
    await d.ajouter([rep('pays:ESP:localiser', T0, GOOD)]);
    expect(await d.tous()).toHaveLength(2);
  });

  it('une suppression de la base (driver, réglages) n’est pas bloquée : le dépôt ferme puis recrée la base', async () => {
    const idb = new IDBFactory();
    const d = depotIndexedDb(BASE_JOURNAL, { idb, persister: sansPersistance });
    await d.ajouter([rep('pays:FRA:localiser', T0, GOOD)]);
    const issue = await new Promise<string>((ok) => {
      const r = idb.deleteDatabase(BASE_JOURNAL);
      r.onsuccess = () => ok('supprimée');
      r.onblocked = () => ok('bloquée');
      r.onerror = () => ok('erreur');
    });
    expect(issue).toBe('supprimée');
    expect(await d.tous()).toEqual([]);
    await d.ajouter([rep('pays:ITA:localiser', T0, GOOD)]);
    expect(await d.tous()).toHaveLength(1);
  });
});

describe('la base du maillage webgl (terramemo) n’est jamais ouverte', () => {
  it('BASE_MAILLAGE est bien la base de src/map/maillage.worker.ts, et le journal en a une autre', () => {
    const worker = readFileSync('src/map/maillage.worker.ts', 'utf8');
    expect(worker).toMatch(new RegExp(`const BASE = '${BASE_MAILLAGE}';`));
    expect(worker).toMatch(/indexedDB\.open\(BASE, 1\)/);
    expect(BASE_JOURNAL).not.toBe(BASE_MAILLAGE);
  });

  it('le dépôt refuse ce nom de base', () => {
    expect(() => depotIndexedDb(BASE_MAILLAGE)).toThrow(ErreurDepot);
  });

  it('à côté du cache du maillage (version 1) : le dépôt n’ouvre que sa base, celle du maillage reste intacte en version 1', async () => {
    const idb = new IDBFactory();
    // Le cache du maillage tel que le worker l'écrit (version 1, magasin maillages, clé webgl).
    const maillage = await new Promise<IDBDatabase>((ok, ko) => {
      const r = idb.open(BASE_MAILLAGE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('maillages');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    await new Promise<void>((ok) => {
      const tx = maillage.transaction('maillages', 'readwrite');
      tx.objectStore('maillages').put({ cle: 'k', m: 1 }, 'webgl');
      tx.oncomplete = () => ok();
    });
    const ouvertes: string[] = [];
    const open = idb.open.bind(idb);
    idb.open = (nom: string, version?: number) => (ouvertes.push(nom), open(nom, version));
    const d = depotIndexedDb(BASE_JOURNAL, { idb, persister: sansPersistance });
    await d.ajouter(journal());
    await d.tous();
    await depotIndexedDb(BASE_JOURNAL, { idb }).tous();
    expect(ouvertes).toEqual([BASE_JOURNAL, BASE_JOURNAL]);
    expect(new Map((await idb.databases()).map((b) => [b.name, b.version]))).toEqual(new Map([[BASE_MAILLAGE, 1], [BASE_JOURNAL, 1]]));
    // La connexion du worker n'a reçu aucun versionchange et lit toujours son cache.
    expect(maillage.version).toBe(1);
    const lu = await new Promise<unknown>((ok) => {
      const r = maillage.transaction('maillages').objectStore('maillages').get('webgl');
      r.onsuccess = () => ok(r.result);
    });
    expect(lu).toEqual({ cle: 'k', m: 1 });
    maillage.close();
  });
});
