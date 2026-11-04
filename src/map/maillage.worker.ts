// Web Worker du rendu webgl (décision « Chargement du rendu WebGL ») : le
// maillage de la carte (maillage.ts, ~250 ms au processeur du PC, 640 à
// 740 ms ralenti 4×, une seule longue tâche) se calcule ici, hors du fil
// principal, pendant que le rendu canvas montre déjà la carte ; relais-webgl.ts
// passe ensuite la main au WebGL.
//
// Le fil principal envoie les textes des fichiers déjà téléchargés (rien de
// plus à télécharger) ; on les analyse et on les assemble ici avec le même
// code que lui (donnees.assembler) : mêmes entités dans le même ordre, donc
// les mêmes index de forme (couleur par pays du shader).
//
// Gardé sur l'appareil (IndexedDB, un seul enregistrement, réécrit) : sa clé
// est l'empreinte SHA-256 des trois fichiers et de l'adresse de ce script.
// Vite nomme le script construit d'après le hachage de son contenu
// (assets/maillage.worker-XXXX.js), qui comprend maillage.ts, donnees.ts et
// earcut : un changement des données ou du code du maillage change la clé, et
// le maillage est recalculé. En dev (adresse fixe), le cache est coupé.
import { assembler } from './donnees';
import { emballer, estEmballe, maillerCarte, tampons, type MaillagesEmballes } from './maillage';

export interface DemandeMaillage {
  topo: string;
  pays: string;
  contestees: string;
  /** Lire le maillage gardé (false : ?maillage=0, recalculé et réécrit). */
  lireCache: boolean;
}

/** Durées dans le Worker (ms) : empreinte, lecture du cache, analyse JSON et assemblage, maillage, total. */
export interface DureesMaillage {
  cle_ms: number;
  lecture_ms: number;
  analyse_ms: number;
  maillage_ms: number;
  total_ms: number;
}

export type ReponseMaillage =
  | { type: 'maillage'; source: 'cache' | 'calcul'; m: MaillagesEmballes; ms: DureesMaillage; cache: string; ecrira: boolean }
  | { type: 'ecrit'; ok: boolean; ms: number; detail: string }
  | { type: 'erreur'; erreur: string };

const BASE = 'cartographe';
const MAGASIN = 'maillages';
const CLE_ENREGISTREMENT = 'webgl';

const portee = self as unknown as {
  onmessage: ((ev: MessageEvent<DemandeMaillage>) => void) | null;
  postMessage(m: ReponseMaillage, transfert?: Transferable[]): void;
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
    const r = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(CLE_ENREGISTREMENT);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

/** Range le maillage (clonage synchrone à l'appel de put : les tampons peuvent être transférés juste après). */
function ecrire(db: IDBDatabase, cle: string, m: MaillagesEmballes): Promise<void> {
  const tx = db.transaction(MAGASIN, 'readwrite');
  tx.objectStore(MAGASIN).put({ cle, m, date: new Date().toISOString() }, CLE_ENREGISTREMENT);
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
  const ms: DureesMaillage = { cle_ms: 0, lecture_ms: 0, analyse_ms: 0, maillage_ms: 0, total_ms: 0 };
  try {
    const avecCache = !import.meta.env.DEV && typeof indexedDB !== 'undefined';
    let db: IDBDatabase | null = null;
    let cle = '';
    let cache = avecCache ? (d.lireCache ? 'absent' : 'ignore') : 'coupe';
    if (avecCache) {
      try {
        cle = await empreinte([portee.location.pathname, d.topo, d.pays, d.contestees]);
        ms.cle_ms = performance.now() - t0;
        db = await ouvrir();
        if (d.lireCache) {
          const t1 = performance.now();
          const rec = (await lire(db)) as { cle?: unknown; m?: unknown } | undefined;
          ms.lecture_ms = performance.now() - t1;
          if (rec?.cle === cle && estEmballe(rec.m)) {
            ms.total_ms = performance.now() - t0;
            portee.postMessage({ type: 'maillage', source: 'cache', m: rec.m, ms, cache: 'lu', ecrira: false }, tampons(rec.m));
            return;
          }
          if (rec) cache = 'perime';
        }
      } catch (e) {
        cache = `erreur : ${texte(e)}`;
        db = null;
      }
    }
    const t2 = performance.now();
    const donnees = assembler(JSON.parse(d.topo), JSON.parse(d.pays), JSON.parse(d.contestees), {});
    const t3 = performance.now();
    const m = emballer(maillerCarte(donnees));
    const t4 = performance.now();
    ms.analyse_ms = t3 - t2;
    ms.maillage_ms = t4 - t3;
    let ecriture: Promise<void> | null = null;
    if (db) {
      try {
        ecriture = ecrire(db, cle, m);
      } catch (e) {
        cache = `erreur : ${texte(e)}`;
      }
    }
    ms.total_ms = performance.now() - t0;
    portee.postMessage({ type: 'maillage', source: 'calcul', m, ms, cache, ecrira: ecriture !== null }, tampons(m));
    if (ecriture) {
      const t5 = performance.now();
      ecriture.then(
        () => portee.postMessage({ type: 'ecrit', ok: true, ms: performance.now() - t5, detail: 'gardé' }),
        (e: unknown) => portee.postMessage({ type: 'ecrit', ok: false, ms: performance.now() - t5, detail: texte(e) }),
      );
    }
  } catch (e) {
    portee.postMessage({ type: 'erreur', erreur: texte(e) });
  }
};
