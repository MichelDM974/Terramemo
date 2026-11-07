// Fiches des lots, magasin `lots` de la base `terramemo-synchro` (J1b, lot 3 ;
// étude docs/etudes/2026-11-07-j1b-conception.md, § 5.1) : ce que l'appareil
// a composé, envoyé, lu en ligne ou vu refuser, par compte (clé [uid, id]).
// « À envoyer » pour un compte = les événements du journal dont l'id n'est
// dans aucune de ses fiches, quel que soit leur état. La composition d'un lot
// est écrite ici (a_envoyer) avant l'envoi : un renvoi envoie le même
// document. Sans IndexedDB, le même dépôt vit en mémoire le temps de la page.
import type { DocLot } from './lots';
import { MAGASIN_A_RELIRE, MAGASIN_LOTS, ouvrirBaseSynchro } from './session';

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
  /** Refus des règles : l'adresse du compte était-elle vérifiée ? Faux : relancé dès qu'elle l'est. */
  adresse_verifiee?: boolean;
}

export interface DepotLots {
  /** Les fiches d'un compte ; rejette si la base ne s'ouvre pas. */
  tous(uid: string): Promise<FicheLot[]>;
  /** Écrit (remplace) ces fiches, toutes ou aucune. */
  ecrire(fiches: readonly FicheLot[]): Promise<void>;
  /** Retire toutes les fiches d'un compte (déconnexion, effacement de l'appareil : lot 4, § 3.4). */
  effacer?(uid: string): Promise<void>;
}

/**
 * Un lot lu en ligne que cette version de l'appli ne sait pas lire en entier
 * (`v` inconnu, carte refusée par valider() : lot 4, § 5.3), magasin
 * `a_relire`, gardé brut et relu sans réseau à chaque nouvelle version.
 */
export interface FicheARelire {
  uid: string;
  id: string;
  /** Heure du serveur à son écriture (ms). */
  fin: number;
  /** Le document tel qu'il est en ligne, sans `fin`. */
  doc: Record<string, unknown>;
  /** La version de l'appli qui l'a lu sans le comprendre : relu dès qu'elle change. */
  version: string;
  /** Ce qui n'allait pas (pilote). */
  probleme: string;
}

export interface DepotARelire {
  tous(uid: string): Promise<FicheARelire[]>;
  ecrire(fiches: readonly FicheARelire[]): Promise<void>;
  /** Retire ces lots (relus), ou tous ceux du compte (ids absent : effacement de l'appareil). */
  retirer(uid: string, ids?: readonly string[]): Promise<void>;
}

/** Un magasin [uid, id] en mémoire (tests, repli sans IndexedDB) : copies, comme IndexedDB. */
function magasinMemoire<F extends { uid: string; id: string }>(depart: readonly F[] = []) {
  const m = new Map<string, F>();
  const cle = (f: Pick<F, 'uid' | 'id'>) => JSON.stringify([f.uid, f.id]);
  for (const f of depart) m.set(cle(f), structuredClone(f));
  return {
    async tous(uid: string): Promise<F[]> {
      return [...m.values()].filter((f) => f.uid === uid).map((f) => structuredClone(f));
    },
    async ecrire(fiches: readonly F[]): Promise<void> {
      for (const f of fiches) m.set(cle(f), structuredClone(f));
    },
    async retirer(uid: string, ids?: readonly string[]): Promise<void> {
      if (ids) for (const id of ids) m.delete(cle({ uid, id } as Pick<F, 'uid' | 'id'>));
      else for (const [k, f] of m) if (f.uid === uid) m.delete(k);
    },
  };
}

/** Dépôt en mémoire (tests, repli sans IndexedDB) : copies, comme IndexedDB. */
export function depotLotsMemoire(depart: readonly FicheLot[] = []): DepotLots {
  const m = magasinMemoire(depart);
  return { tous: m.tous, ecrire: m.ecrire, effacer: (uid) => m.retirer(uid) };
}

/** Lots à relire en mémoire (tests, repli sans IndexedDB). */
export function depotARelireMemoire(depart: readonly FicheARelire[] = []): DepotARelire {
  return magasinMemoire(depart);
}

function fabrique(idb?: IDBFactory): IDBFactory | undefined {
  try {
    return idb ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  } catch {
    return undefined; // accès refusé (iframe, cookies bloqués)
  }
}

/** IndexedDB inutilisable pour de bon (navigation privée stricte, accès refusé), pas une erreur passagère. */
const inutilisable = (e: unknown) => ['InvalidStateError', 'SecurityError'].includes(String((e as { name?: unknown } | null)?.name));

/** Les clés [uid, id] d'un compte : [uid] < [uid, id] < [uid, []] (un tableau vient après toute chaîne). */
const duCompte = (uid: string) => IDBKeyRange.bound([uid], [uid, []]);

/**
 * Un magasin [uid, id] de `terramemo-synchro`. Base ouverte à chaque
 * opération et refermée : quelques opérations par passe. Sans IndexedDB, ou
 * si elle refuse de s'ouvrir pour de bon : en mémoire, le temps de la page.
 * Une erreur passagère remonte (la passe s'arrête et relira à la suivante).
 */
function magasinIndexedDb<F extends { uid: string; id: string }>(nom: string, idb?: IDBFactory) {
  const f = fabrique(idb);
  let memoire: ReturnType<typeof magasinMemoire<F>> | null = f ? null : magasinMemoire<F>();
  async function avec<T>(mode: IDBTransactionMode, faire: (m: IDBObjectStore) => () => T, repli: (m: ReturnType<typeof magasinMemoire<F>>) => Promise<T>): Promise<T> {
    if (memoire) return repli(memoire);
    let db: IDBDatabase;
    try {
      db = await ouvrirBaseSynchro(f!);
    } catch (e) {
      if (!inutilisable(e)) throw e;
      memoire = magasinMemoire<F>();
      return repli(memoire);
    }
    try {
      return await new Promise<T>((ok, ko) => {
        const tx = db.transaction(nom, mode);
        const r = faire(tx.objectStore(nom));
        tx.oncomplete = () => ok(r());
        tx.onabort = () => ko(tx.error ?? new Error('transaction annulée'));
      });
    } finally {
      db.close();
    }
  }
  return {
    tous(uid: string): Promise<F[]> {
      return avec(
        'readonly',
        (m) => {
          const r = m.getAll(duCompte(uid));
          return () => r.result as F[];
        },
        (x) => x.tous(uid),
      );
    },
    async ecrire(fiches: readonly F[]): Promise<void> {
      if (!fiches.length) return;
      await avec(
        'readwrite',
        (m) => {
          for (const x of fiches) m.put(structuredClone(x));
          return () => undefined;
        },
        (x) => x.ecrire(fiches),
      );
    },
    async retirer(uid: string, ids?: readonly string[]): Promise<void> {
      if (ids && !ids.length) return;
      await avec(
        'readwrite',
        (m) => {
          if (ids) for (const id of ids) m.delete([uid, id]);
          else m.delete(duCompte(uid));
          return () => undefined;
        },
        (x) => x.retirer(uid, ids),
      );
    },
  };
}

/** Les fiches des lots dans `terramemo-synchro` (magasin `lots`). */
export function depotLotsIndexedDb(idb?: IDBFactory): DepotLots {
  const m = magasinIndexedDb<FicheLot>(MAGASIN_LOTS, idb);
  return { tous: m.tous, ecrire: m.ecrire, effacer: (uid) => m.retirer(uid) };
}

/** Les lots à relire dans `terramemo-synchro` (magasin `a_relire`). */
export function depotARelireIndexedDb(idb?: IDBFactory): DepotARelire {
  return magasinIndexedDb<FicheARelire>(MAGASIN_A_RELIRE, idb);
}
