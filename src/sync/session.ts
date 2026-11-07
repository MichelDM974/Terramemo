// État de la synchro sur l'appareil (J1b, docs/etudes/2026-11-07-j1b-conception.md
// § 5.1) : base IndexedDB à part, `terramemo-synchro`, en version 1 pour de
// bon. `terramemo-journal` n'est ainsi jamais montée de version (sa base n'a
// pas d'onblocked, et l'APK de la semaine d'usage n'a aucune migration à
// faire). Trois magasins, tous créés dès la version 1 (une version 2 ne
// viendra pas) :
// - `lots` (clé [uid, id]) : les lots composés ou envoyés (lot 3) ;
// - `a_relire` (clé [uid, id]) : les lots lus en ligne qu'une version de
//   l'appli ne sait pas lire en entier, gardés bruts (lot 4) ;
// - `session` : une seule fiche, le dernier compte connecté (§ 2.5).
//
// Le lot 1 n'y écrit que la session. Sans IndexedDB, le même dépôt vit en
// mémoire le temps de la page (§ 5.1, « Repli sans IndexedDB »).

export const BASE_SYNCHRO = 'terramemo-synchro';
const VERSION = 1;
export const MAGASIN_LOTS = 'lots';
export const MAGASIN_A_RELIRE = 'a_relire';
export const MAGASIN_SESSION = 'session';
/** Clé de la seule fiche du magasin `session`. */
const CLE_SESSION = 'session';

/** Fournisseurs d'un compte (identités de Firebase Auth) que l'appli connaît. */
export type Fournisseur = 'password' | 'google.com';

/** La fiche `session` (§ 5.1) ; les champs des lots suivants y sont déjà, vides. */
export interface Session {
  /** Le dernier compte connecté sur l'appareil ; null pour un invité. */
  uid: string | null;
  fournisseurs: Fournisseur[];
  /** Adresse du compte (vue Compte d'une session perdue, reconnexion pré-remplie). */
  adresse: string | null;
  /** Lot 4 : instant serveur (`fin`) du dernier lot lu du compte `uid` ; null : tout est à lire. */
  marque: number | null;
  /**
   * Lot 2 : un pseudo ou un record de l'appareil pas encore dans le profil
   * du compte (hors ligne, refus des règles) ; levé après une synchro du
   * profil réussie (§ 5.4). Qui l'emporte pour le pseudo ne se lit pas ici,
   * mais dans le localStorage, à côté du pseudo (src/sync/profil.ts,
   * lireBasePseudo) : un drapeau écrit après le pseudo laisserait une passe
   * partir entre les deux.
   */
  profil_a_ecrire: boolean;
  /** 'voulue' pendant une déconnexion demandée : ce n'est pas une session perdue (§ 2.5, § 3.4). */
  deconnexion: 'voulue' | null;
  /** Lot 4 : uid dont l'effacement est en cours (déconnexion reprenable, § 3.4). */
  effacement: string | null;
  /** Lot 5 : uid dont la suppression est en cours (§ 7.1). */
  suppression: string | null;
  /**
   * Lot 4 : instant où une connexion à un compte existant a commencé, le
   * temps de la question de fusion (D22) ; null sinon. Appli tuée pendant la
   * question : le compte n'est pas pris (comptes.ts, etat()), rien ne part.
   */
  connexion: number | null;
  /** Version de l'appli qui a écrit la fiche. */
  version: string;
}

export function sessionVide(version: string): Session {
  return { uid: null, fournisseurs: [], adresse: null, marque: null, profil_a_ecrire: false, deconnexion: null, effacement: null, suppression: null, connexion: null, version };
}

export interface DepotSession {
  /** La fiche, ou null s'il n'y en a jamais eu ; rejette si la base ne s'ouvre pas. */
  lire(): Promise<Session | null>;
  ecrire(s: Session): Promise<void>;
}

/** Dépôt en mémoire (tests, repli sans IndexedDB) : copies, comme IndexedDB. */
export function depotSessionMemoire(depart: Session | null = null): DepotSession {
  let s = depart ? structuredClone(depart) : null;
  return {
    async lire() {
      return s ? structuredClone(s) : null;
    },
    async ecrire(n) {
      s = structuredClone(n);
    },
  };
}

/** Ouvre (et crée au besoin) la base `terramemo-synchro` en version 1, ses trois magasins compris. */
export function ouvrirBaseSynchro(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((ok, ko) => {
    let r: IDBOpenDBRequest;
    try {
      r = idb.open(BASE_SYNCHRO, VERSION);
    } catch (e) {
      return ko(e);
    }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(MAGASIN_LOTS)) db.createObjectStore(MAGASIN_LOTS, { keyPath: ['uid', 'id'] });
      if (!db.objectStoreNames.contains(MAGASIN_A_RELIRE)) db.createObjectStore(MAGASIN_A_RELIRE, { keyPath: ['uid', 'id'] });
      if (!db.objectStoreNames.contains(MAGASIN_SESSION)) db.createObjectStore(MAGASIN_SESSION);
    };
    r.onsuccess = () => {
      const db = r.result;
      // Une suppression de la base (réglages du navigateur) attend qu'on la ferme.
      db.onversionchange = () => db.close();
      ok(db);
    };
    r.onerror = () => ko(r.error);
    // Une version plus récente de l'appli ouverte ailleurs ne viendra pas (version 1 pour de bon).
    r.onblocked = () => ko(new Error(`${BASE_SYNCHRO} bloquée par un autre onglet`));
  });
}

function fabrique(idb?: IDBFactory): IDBFactory | undefined {
  try {
    return idb ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  } catch {
    return undefined; // accès refusé (iframe, cookies bloqués)
  }
}

/**
 * La session dans `terramemo-synchro`. Base ouverte à chaque opération et
 * refermée (une écriture par connexion ou déconnexion : rien à garder ouvert).
 * Sans IndexedDB : une session en mémoire, le temps de la page.
 */
export function depotSessionIndexedDb(idb?: IDBFactory): DepotSession {
  const f = fabrique(idb);
  if (!f) return depotSessionMemoire();
  async function avec<T>(mode: IDBTransactionMode, faire: (m: IDBObjectStore) => IDBRequest | null): Promise<T> {
    const db = await ouvrirBaseSynchro(f!);
    try {
      return await new Promise<T>((ok, ko) => {
        const tx = db.transaction(MAGASIN_SESSION, mode);
        const r = faire(tx.objectStore(MAGASIN_SESSION));
        tx.oncomplete = () => ok((r?.result ?? null) as T);
        tx.onabort = () => ko(tx.error ?? new Error('transaction annulée'));
      });
    } finally {
      db.close();
    }
  }
  return {
    async lire() {
      const s = await avec<Session | undefined | null>('readonly', (m) => m.get(CLE_SESSION));
      return s ?? null;
    },
    async ecrire(s) {
      await avec<unknown>('readwrite', (m) => m.put(structuredClone(s), CLE_SESSION));
    },
  };
}
