// Web Worker du maillage des océans et mers (rendu webgl, lot 3a) : comme celui
// des terres (maillage.worker.ts, à part de lui : voir maillage-mers.ts), hors
// du fil principal, quand la couche marine arrive (chargerMers), jamais au
// premier affichage. Le relais WebGL du monde ne l'attend pas.
//
// Gardé sur l'appareil, à côté du maillage des terres (même base, même
// magasin, enregistrement 'webgl-mers') : sa clé est l'empreinte SHA-256 de
// l'adresse de ce script (que Vite hache sur son contenu : maillage-mers.ts,
// maillage.ts, mers.ts, earcut) et des deux fichiers lus. En dev (adresse
// fixe), le cache est coupé.
import { emballerMaillage, estMaillageEmballe, formesDesTextes, maillerMers, tamponsMaillage } from './maillage-mers';
import type { MaillageEmballe } from './maillage';

export interface DemandeMaillageMers {
  topo: string;
  mers: string;
  /** Lire le maillage gardé (false : ?maillage=0, recalculé et réécrit). */
  lireCache: boolean;
}

export type ReponseMaillageMers =
  | { type: 'maillage'; source: 'cache' | 'calcul'; m: MaillageEmballe; ms: number; cache: string; ecrira: boolean }
  | { type: 'ecrit'; ok: boolean; detail: string }
  | { type: 'erreur'; erreur: string };

const BASE = 'terramemo';
const MAGASIN = 'maillages';
export const CLE_ENREGISTREMENT_MERS = 'webgl-mers';

const portee = self as unknown as {
  onmessage: ((ev: MessageEvent<DemandeMaillageMers>) => void) | null;
  postMessage(m: ReponseMaillageMers, transfert?: Transferable[]): void;
  location: Location;
};

async function empreinte(parties: string[]): Promise<string> {
  const octets = new TextEncoder().encode(parties.join('\u0000'));
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', octets));
  return Array.from(h, (o) => o.toString(16).padStart(2, '0')).join('');
}

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

function lire(db: IDBDatabase): Promise<unknown> {
  return new Promise((ok, ko) => {
    const r = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(CLE_ENREGISTREMENT_MERS);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

/** Range le maillage (clonage synchrone à l'appel de put : les tampons peuvent être transférés juste après). */
function ecrire(db: IDBDatabase, cle: string, m: MaillageEmballe): Promise<void> {
  const tx = db.transaction(MAGASIN, 'readwrite');
  tx.objectStore(MAGASIN).put({ cle, m, date: new Date().toISOString() }, CLE_ENREGISTREMENT_MERS);
  return new Promise((ok, ko) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error ?? new Error('transaction annulée'));
  });
}

const texte = (e: unknown) => (e instanceof Error ? `${e.name} : ${e.message}` : String(e));

portee.onmessage = async (ev) => {
  const d = ev.data;
  const t0 = performance.now();
  try {
    const avecCache = !import.meta.env.DEV && typeof indexedDB !== 'undefined';
    let db: IDBDatabase | null = null;
    let cle = '';
    let cache = avecCache ? (d.lireCache ? 'absent' : 'ignore') : 'coupe';
    if (avecCache) {
      try {
        cle = await empreinte([portee.location.pathname, d.topo, d.mers]);
        db = await ouvrir();
        if (d.lireCache) {
          const rec = (await lire(db)) as { cle?: unknown; m?: unknown } | undefined;
          if (rec?.cle === cle && estMaillageEmballe(rec.m)) {
            portee.postMessage({ type: 'maillage', source: 'cache', m: rec.m, ms: performance.now() - t0, cache: 'lu', ecrira: false }, tamponsMaillage(rec.m));
            return;
          }
          if (rec) cache = 'perime';
        }
      } catch (e) {
        cache = `erreur : ${texte(e)}`;
        db = null;
      }
    }
    const m = emballerMaillage(maillerMers(formesDesTextes(d)));
    let ecriture: Promise<void> | null = null;
    if (db) {
      try {
        ecriture = ecrire(db, cle, m);
      } catch (e) {
        cache = `erreur : ${texte(e)}`;
      }
    }
    portee.postMessage({ type: 'maillage', source: 'calcul', m, ms: performance.now() - t0, cache, ecrira: ecriture !== null }, tamponsMaillage(m));
    // Le fil principal ne termine le Worker qu'après l'écriture (sinon la transaction serait perdue).
    ecriture?.then(
      () => portee.postMessage({ type: 'ecrit', ok: true, detail: 'gardé' }),
      (e: unknown) => portee.postMessage({ type: 'ecrit', ok: false, detail: texte(e) }),
    );
  } catch (e) {
    portee.postMessage({ type: 'erreur', erreur: texte(e) });
  }
};
