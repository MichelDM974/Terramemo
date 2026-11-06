// Dépôt du journal sur l'appareil (docs/plan.md, « Où vit le journal ») : les
// événements de src/srs/journal.ts, en ajout seul. Le reste de l'appli ne
// voit que l'interface Depot ; depotIndexedDb() en est la version réelle,
// depotMemoire() celle des tests et le repli quand IndexedDB manque.
//
// Base à part, 'terramemo-journal' : la base 'terramemo' est celle du cache
// du maillage webgl, ouverte en version 1 par src/map/maillage.worker.ts sans
// gérer de version plus haute. Y ajouter un magasin (version 2) casserait le
// cache ; le dépôt ne l'ouvre donc jamais (refusée par son nom).

import { probleme, valider, type Evenement } from '../srs/journal';

export interface Depot {
  /**
   * Ajoute des événements, tout le lot ou rien. Idempotent : un id déjà
   * gardé n'est ni dupliqué ni réécrit (le premier écrit reste, journal en
   * ajout seul). Un événement invalide (valider() de src/srs/journal.ts)
   * fait refuser le lot entier, sans rien écrire.
   */
  ajouter(evts: readonly Evenement[]): Promise<void>;
  /** Tous les événements gardés, valides, dans un ordre quelconque (le rejeu trie). */
  tous(): Promise<Evenement[]>;
}

/**
 * Pourquoi le dépôt a échoué : 'invalide' (lot refusé, un bug de l'appelant),
 * 'indisponible' (pas d'IndexedDB, navigation privée, base qui ne s'ouvre pas),
 * 'quota' (stockage plein), 'echec' (autre erreur d'IndexedDB). L'appelant
 * l'affiche ou continue en mémoire : une erreur du dépôt ne plante pas l'appli.
 */
export type CauseDepot = 'invalide' | 'indisponible' | 'quota' | 'echec';

export class ErreurDepot extends Error {
  constructor(
    readonly raison: CauseDepot,
    message: string,
  ) {
    super(message);
    this.name = 'ErreurDepot';
  }
}

export const BASE_JOURNAL = 'terramemo-journal';
/** Base du cache du maillage webgl (src/map/maillage.worker.ts) : jamais ouverte ici. */
export const BASE_MAILLAGE = 'terramemo';
const VERSION = 1;
const MAGASIN = 'evenements';
const INDEX_SEANCE = 'seance';

/** Refuse le lot entier au premier événement invalide. */
function verifier(evts: readonly Evenement[]): void {
  for (const [i, e] of evts.entries()) {
    const p = probleme(e);
    if (p) throw new ErreurDepot('invalide', `événement ${i} refusé : ${p}`);
  }
}

/** Dépôt en mémoire (tests, repli) : mêmes règles que depotIndexedDb, copies comprises. */
export function depotMemoire(): Depot {
  const evenements = new Map<string, Evenement>();
  return {
    async ajouter(evts) {
      verifier(evts);
      for (const e of evts) if (!evenements.has(e.id)) evenements.set(e.id, structuredClone(e));
    },
    async tous() {
      return [...evenements.values()].map((e) => structuredClone(e));
    },
  };
}

export interface OptionsIndexedDb {
  /** Fabrique d'IndexedDB (défaut : celle de la page ; fake-indexeddb dans les tests). */
  idb?: IDBFactory;
  /**
   * Demande de stockage persistant, faite une fois au premier ajout (défaut :
   * navigator.storage.persist, sans quoi le navigateur peut effacer la base
   * quand le disque manque). Au mieux : un refus ou une erreur est ignoré.
   */
  persister?: () => Promise<unknown>;
}

const persisterParDefaut = (): Promise<unknown> =>
  typeof navigator !== 'undefined' && navigator.storage?.persist ? navigator.storage.persist() : Promise.resolve(false);

/** Erreur d'IndexedDB (DOMException) traduite en ErreurDepot. */
function traduire(e: unknown, quoi: string): ErreurDepot {
  if (e instanceof ErreurDepot) return e;
  const nom = e instanceof Error || (typeof e === 'object' && e !== null && 'name' in e) ? String((e as { name: unknown }).name) : '';
  const texte = e instanceof Error ? e.message : String(e);
  const cause: CauseDepot = nom === 'QuotaExceededError' ? 'quota' : nom === 'InvalidStateError' || nom === 'SecurityError' ? 'indisponible' : 'echec';
  return new ErreurDepot(cause, `${quoi} : ${nom || 'erreur'}${texte && texte !== nom ? ` (${texte})` : ''}`);
}

/**
 * Dépôt IndexedDB : base `nom` (défaut 'terramemo-journal'), magasin
 * 'evenements' (clé id, index seance pour l'envoi par séance du lot 6).
 * Chaque opération rejette une ErreurDepot plutôt que de lever : pas
 * d'IndexedDB, base qui ne s'ouvre pas ou quota se voient au premier appel,
 * et l'ouverture est retentée au suivant.
 */
export function depotIndexedDb(nom: string = BASE_JOURNAL, options: OptionsIndexedDb = {}): Depot {
  if (nom === BASE_MAILLAGE) throw new ErreurDepot('invalide', `la base ${BASE_MAILLAGE} est celle du maillage webgl`);
  const persister = options.persister ?? persisterParDefaut;
  let ouverture: Promise<IDBDatabase> | null = null;
  let connexion: IDBDatabase | null = null;
  /** La connexion ne sert plus (fermée, ou à fermer) : rouvrir au prochain appel. */
  const oublier = (db: IDBDatabase | null) => {
    if (db && db !== connexion) return;
    connexion = null;
    ouverture = null;
  };
  let persistanceDemandee = false;

  const ouvrir = (): Promise<IDBDatabase> => {
    ouverture ??= new Promise<IDBDatabase>((ok, ko) => {
      let idb: IDBFactory | undefined;
      try {
        idb = options.idb ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
      } catch {
        idb = undefined; // accès refusé (iframe, cookies bloqués)
      }
      if (!idb) return ko(new ErreurDepot('indisponible', 'IndexedDB absent'));
      let r: IDBOpenDBRequest;
      try {
        r = idb.open(nom, VERSION);
      } catch (e) {
        return ko(traduire(e, `ouverture de ${nom}`));
      }
      r.onupgradeneeded = () => {
        const magasin = r.result.createObjectStore(MAGASIN, { keyPath: 'id' });
        magasin.createIndex(INDEX_SEANCE, 'seance');
      };
      r.onsuccess = () => {
        const db = r.result;
        // Une autre version qui monte la base, ou une suppression (driver,
        // réglages du navigateur), attend que celle-ci se ferme : on la
        // ferme et on rouvrira au prochain appel.
        db.onversionchange = () => {
          db.close();
          oublier(db);
        };
        db.onclose = () => oublier(db);
        connexion = db;
        ok(db);
      };
      // Pas de onblocked : la version 1 ne monte jamais une base déjà ouverte.
      r.onerror = () => ko(traduire(r.error, `ouverture de ${nom}`));
    }).catch((e: unknown) => {
      oublier(null);
      throw e;
    });
    return ouverture;
  };

  /** Une transaction sur le magasin, résolue à sa fin (complete), rejetée en ErreurDepot. */
  async function transaction<T>(mode: IDBTransactionMode, quoi: string, faire: (m: IDBObjectStore) => () => T): Promise<T> {
    const db = await ouvrir();
    return new Promise<T>((ok, ko) => {
      let tx: IDBTransaction;
      let resultat: () => T;
      try {
        tx = db.transaction(MAGASIN, mode);
        resultat = faire(tx.objectStore(MAGASIN));
      } catch (e) {
        // Connexion fermée sous nos pieds (InvalidStateError) : rouvrir la prochaine fois.
        if ((e as { name?: unknown } | null)?.name === 'InvalidStateError') oublier(db);
        return ko(traduire(e, quoi));
      }
      tx.oncomplete = () => ok(resultat());
      tx.onabort = () => ko(traduire(tx.error ?? new Error('transaction annulée'), quoi));
    });
  }

  return {
    async ajouter(evts) {
      verifier(evts);
      if (!evts.length) return;
      if (!persistanceDemandee) {
        persistanceDemandee = true;
        try {
          void persister().catch(() => undefined);
        } catch {
          // navigator.storage absent ou qui lève : sans persistance, tant pis.
        }
      }
      await transaction('readwrite', 'ajout au journal', (m) => {
        for (const e of evts) {
          const r = m.add(e);
          // Id déjà gardé : ignoré, sans annuler le reste du lot.
          r.onerror = (ev) => {
            if (r.error?.name === 'ConstraintError') {
              ev.preventDefault();
              ev.stopPropagation();
            }
          };
        }
        return () => undefined;
      });
    },
    async tous() {
      return transaction('readonly', 'lecture du journal', (m) => {
        const r = m.getAll();
        return () => (r.result as unknown[]).filter(valider);
      });
    },
  };
}
