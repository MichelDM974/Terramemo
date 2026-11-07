// Fiches des lots, magasin `lots` de la base `terramemo-synchro` (J1b, lot 3 ;
// étude docs/etudes/2026-11-07-j1b-conception.md, § 5.1) : ce que l'appareil
// a composé, envoyé, lu en ligne ou vu refuser, par compte (clé [uid, id]).
// « À envoyer » pour un compte = les événements du journal dont l'id n'est
// dans aucune de ses fiches, quel que soit leur état. La composition d'un lot
// est écrite ici (a_envoyer) avant l'envoi : un renvoi envoie le même
// document. Sans IndexedDB, le même dépôt vit en mémoire le temps de la page.
import type { DocLot } from './lots';
import { MAGASIN_LOTS, ouvrirBaseSynchro } from './session';

/**
 * a_envoyer : composé, pas encore accepté ; envoye : accepté, ou trouvé en
 * ligne avec ces ids ; en_ligne : lu en ligne (lot 4) ; refuse : cause
 * `regles` ou `invalide`.
 */
export type EtatLot = 'a_envoyer' | 'envoye' | 'en_ligne' | 'refuse';

/**
 * Pourquoi un lot attend : `reseau` (nouvel essai à 30 s, 2 min, 10 min,
 * puis 1 h, et à chaque déclencheur), `quota` (quota de Spark, jusqu'à
 * minuit à Los Angeles) ; ou pourquoi il est refusé : `regles` (relancé à
 * chaque version, changement de jeton, « Réessayer », et une fois par jour
 * au plus), `invalide` (lot que les règles refuseraient : jamais envoyé,
 * recomposé à chaque version).
 */
export type CauseLot = 'reseau' | 'quota' | 'regles' | 'invalide';

export interface FicheLot {
  uid: string;
  /** L'id du lot : celui de son premier événement. */
  id: string;
  seance: string | null;
  appareil: string;
  /** Les ids de ses événements (ceux du lot en ligne une fois envoyé). */
  ids: string[];
  etat: EtatLot;
  cause: CauseLot | null;
  /** Essais ratés de suite (réseau, quota). */
  essais: number;
  /** Instant du prochain essai (réseau, quota) ou de la relance du jour (refus des règles) ; 0 : tout de suite. */
  prochain: number;
  /** La version de l'appli qui a composé, envoyé ou refusé le lot. */
  version: string;
  /** Le document composé, gardé jusqu'à son acceptation (un renvoi envoie le même) ; null ensuite. */
  doc: DocLot | null;
}

export interface DepotLots {
  /** Les fiches d'un compte ; rejette si la base ne s'ouvre pas. */
  tous(uid: string): Promise<FicheLot[]>;
  /** Écrit (remplace) ces fiches, toutes ou aucune. */
  ecrire(fiches: readonly FicheLot[]): Promise<void>;
}

/** Dépôt en mémoire (tests, repli sans IndexedDB) : copies, comme IndexedDB. */
export function depotLotsMemoire(depart: readonly FicheLot[] = []): DepotLots {
  const m = new Map<string, FicheLot>();
  const cle = (f: Pick<FicheLot, 'uid' | 'id'>) => JSON.stringify([f.uid, f.id]);
  for (const f of depart) m.set(cle(f), structuredClone(f));
  return {
    async tous(uid) {
      return [...m.values()].filter((f) => f.uid === uid).map((f) => structuredClone(f));
    },
    async ecrire(fiches) {
      for (const f of fiches) m.set(cle(f), structuredClone(f));
    },
  };
}

function fabrique(idb?: IDBFactory): IDBFactory | undefined {
  try {
    return idb ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  } catch {
    return undefined; // accès refusé (iframe, cookies bloqués)
  }
}

/**
 * Les fiches dans `terramemo-synchro`. Base ouverte à chaque opération et
 * refermée : quelques opérations par passe d'envoi. Sans IndexedDB : en
 * mémoire, le temps de la page.
 */
export function depotLotsIndexedDb(idb?: IDBFactory): DepotLots {
  const f = fabrique(idb);
  if (!f) return depotLotsMemoire();
  async function avec<T>(mode: IDBTransactionMode, faire: (m: IDBObjectStore) => () => T): Promise<T> {
    const db = await ouvrirBaseSynchro(f!);
    try {
      return await new Promise<T>((ok, ko) => {
        const tx = db.transaction(MAGASIN_LOTS, mode);
        const r = faire(tx.objectStore(MAGASIN_LOTS));
        tx.oncomplete = () => ok(r());
        tx.onabort = () => ko(tx.error ?? new Error('transaction annulée'));
      });
    } finally {
      db.close();
    }
  }
  return {
    tous(uid) {
      // [uid] < [uid, id] < [uid, []] : un tableau vient après toute chaîne dans l'ordre des clés.
      return avec('readonly', (m) => {
        const r = m.getAll(IDBKeyRange.bound([uid], [uid, []]));
        return () => r.result as FicheLot[];
      });
    },
    async ecrire(fiches) {
      if (!fiches.length) return;
      await avec('readwrite', (m) => {
        for (const x of fiches) m.put(structuredClone(x));
        return () => undefined;
      });
    },
  };
}
