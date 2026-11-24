// Service worker du site (#22) : la logique, sans navigateur, que src/sw/sw.ts
// branche sur les événements du service worker et que
// tests/service-worker.test.ts joue sur de faux caches et un faux réseau.
// Jamais dans l'APK ni en développement (src/sw/enregistrer.ts) : l'APK sert
// déjà ses fichiers en local, et un cache y servirait l'ancien bundle après
// une mise à jour (étude critique du 04/11, I8).
//
// Un cache par version du build (`terramemo-<version>`), la version étant
// l'empreinte de tout ce que le build sert (src/sw/construction.ts) : elle
// change dès qu'un fichier change, et seulement alors.
//
// - Ce qui est mis en cache à l'installation (`prechargees`) : la coquille
//   (index.html, ce qu'il référence : script, feuille de style, icône, police)
//   et les données de la carte que la première visite charge. Les drapeaux,
//   les données des sujets non ouverts, les morceaux chargés à la demande :
//   en cache à l'usage seulement (le quota de Hosting, 360 Mo par jour).
// - Chaque fichier mis en cache est vérifié contre l'empreinte que le build a
//   notée pour lui (`empreintes`), puis rangé avec elle (ENTETE_EMPREINTE). Le
//   cache d'une version ne contient donc que des fichiers de cette version :
//   jamais une carte d'une version avec la coquille d'une autre (un /geo/
//   d'un autre déploiement, même à la même adresse, n'y entre pas). Un
//   fichier pré-chargé d'une autre version fait échouer l'installation (un
//   déploiement pendant l'installation) : le navigateur la retentera au
//   prochain contrôle, et l'ancienne version reste en place d'ici là.
// - Les fichiers de /geo/ n'ont pas d'empreinte dans leur nom (leur adresse
//   est celle que le code demande) : servis du cache de la version, ils ne se
//   retéléchargent à aucune visite ; une nouvelle version les reprend du cache
//   de l'ancienne quand leur empreinte n'a pas changé (aucun octet sur le
//   réseau), sinon les redemande en revalidant le cache HTTP (`no-cache` :
//   un 304 si le serveur a toujours le même), puis vérifie l'empreinte. Ce
//   choix plutôt qu'une simple revalidation à chaque visite (ETag) : la carte
//   s'ouvre hors ligne, sans un aller-retour par fichier, et le contenu suit
//   la coquille de sa version par construction.
// - La coquille (navigation vers /) : réseau d'abord (`/` est en no-cache :
//   un 304 qui ne coûte presque rien), la copie de la version si le réseau
//   est coupé ou flanche. Servie du cache d'abord, toute la première visite
//   après un déploiement tournerait sur l'ancienne coquille, dont les
//   morceaux à la demande jamais rangés ne sont plus sur Hosting (404) et
//   dont les /geo/ jamais rangés arriveraient de la nouvelle version. Si le
//   réseau sert une autre coquille que celle de la version, celle-ci est
//   dépassée (`EtatMoteur`) : ses fichiers passent alors au réseau d'abord
//   (la copie de la version s'il est coupé ou répond une erreur), pour que
//   la nouvelle coquille ait ses fichiers à elle et non ceux du cache, en
//   attendant que la nouvelle version prenne la relève. Hors ligne, la
//   coquille servie est celle du cache, et ses fichiers aussi. La dernière
//   navigation fait foi pour toutes les pages : un onglet de l'ancienne
//   coquille resté ouvert passe lui aussi au réseau (comme sans service
//   worker, la copie de sa version en plus quand le serveur ne l'a plus).
// - Jamais de cache pour une requête autre que GET, ni d'une autre origine
//   (Firestore, Auth, googleapis), ni pour /__/ (les pages de Firebase) ;
//   les pages statiques (confidentialité, suppression, leur feuille de
//   style) : réseau d'abord, la copie de la version hors ligne seulement.
//
// Mise à jour : prise au prochain chargement, pas tout de suite (pas de
// skipWaiting à l'installation). La nouvelle version s'installe en fond
// pendant que la page tourne, l'ancienne garde la main et son cache tant
// qu'elle a une page ouverte : une partie en cours ne perd ni sa coquille ni
// ses fichiers. Au chargement suivant, la page demande la relève
// (MESSAGE_ACTIVER, src/sw/enregistrer.ts) ; la nouvelle version ne la prend
// que si cette page est la seule ouverte (un autre onglet peut être en
// partie), efface à l'activation les caches des versions d'avant, et la page
// se recharge une fois, avant qu'on ait joué (la page ne la demande que
// dans ses premières secondes, DEMANDE_MAX_MS). Ce qui a été rangé dans
// l'ancien cache depuis l'installation et n'a pas changé est repris à
// l'activation, avant l'effacement. skipWaiting dès l'installation
// aurait effacé le cache sous une partie en cours, dont les morceaux à la
// demande ne sont plus sur le serveur après un déploiement.
//
// Les photos des fiches (#34, lot P2 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3.6) : tout /photos/ est hors du manifeste (2 400 entrées de plus le
// faisaient passer de 6 à 41 Ko compressés, payés à chaque visite après un
// déploiement), avec ses propres règles et son propre cache, CACHE_PHOTOS,
// hors du préfixe : ni effacé à l'activation d'une version (cachesPerimes),
// ni parcouru à l'installation (reprendre), ni compté par le smoke du pilote.
// - /photos/v/<nom>.webp et /photos/p/<nom>.webp : le cache d'abord, sinon le
//   réseau ; rangée seulement si le début du SHA-256 du contenu est le nom du
//   fichier (une photo ne change jamais sous un même nom). Borné à PHOTOS_MAX
//   fichiers : au-delà, les plus anciens partent (l'ordre des clés d'un cache
//   est celui de leur entrée, S57).
// - /photos/**/*.json (la liste d'un lieu, les crédits) : le réseau d'abord ;
//   la copie du cache s'il est coupé. Une liste périmée peut citer une photo
//   retirée : l'image manque, la fiche montre les autres.

/** Préfixe des caches du site : seuls ceux-là sont effacés (cachesPerimes). */
export const PREFIXE_CACHE = 'terramemo-';
/** En-tête posé sur chaque réponse rangée : l'empreinte de son contenu. */
export const ENTETE_EMPREINTE = 'x-terramemo-empreinte';
/** Messages de la page (src/sw/enregistrer.ts en a sa copie : aucun module partagé, sw.js reste d'un seul tenant). */
export const MESSAGE_ACTIVER = 'terramemo:activer';
export const MESSAGE_CHARGES = 'terramemo:charges';
/** Caractères hexadécimaux gardés du SHA-256 : 64 bits, contre une erreur, pas contre un adversaire. */
export const LONGUEUR_EMPREINTE = 16;
/** Le cache des photos des fiches : hors de PREFIXE_CACHE, gardé d'une version à l'autre (§ 3.6). */
export const CACHE_PHOTOS = 'photos-terramemo-1';
/** Fichiers gardés au plus dans CACHE_PHOTOS (listes comprises) ; au-delà, les plus anciens partent. */
export const PHOTOS_MAX = 400;
/** Une photo servie : /photos/v/ (vignette) ou /photos/p/ (plein écran), nommée par le début de son SHA-256. */
const RE_PHOTO = /^\/photos\/[vp]\/([0-9a-f]{10})\.webp$/;

export interface Manifeste {
  /** Empreinte du build (tous les fichiers servis et le code du service worker). */
  version: string;
  /** Chemin servi ('/' pour index.html, '/assets/…', '/geo/…') → empreinte de son contenu. */
  empreintes: Record<string, string>;
  /** Chemins mis en cache à l'installation (la coquille et la carte du premier affichage). */
  prechargees: string[];
}

export const nomCache = (version: string): string => PREFIXE_CACHE + version;

/** Les caches du site d'une autre version que `version` ; ceux d'autres noms ne sont pas à nous. */
export function cachesPerimes(noms: readonly string[], version: string): string[] {
  return noms.filter((n) => n.startsWith(PREFIXE_CACHE) && n !== nomCache(version));
}

/** Empreinte d'un contenu : début du SHA-256 en hexadécimal (le même que src/sw/construction.ts au build). */
export async function empreinte(contenu: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', contenu));
  return [...h].map((o) => o.toString(16).padStart(2, '0')).join('').slice(0, LONGUEUR_EMPREINTE);
}

/**
 * - hors-sw : le service worker ne répond pas (le navigateur va au réseau) ;
 * - coquille : index.html, du réseau d'abord, la copie de la version s'il est coupé (les navigations vers '/', '/?…', '/index.html') ;
 * - cache : du cache d'abord, sinon le réseau, rangé à l'usage (réseau d'abord si la version est dépassée) ;
 * - reseau-dabord : le réseau, la copie de la version s'il est coupé ;
 * - photo : une photo d'une fiche, CACHE_PHOTOS d'abord, sinon le réseau, rangée si son contenu est son nom ;
 * - liste-photos : la liste d'un lieu ou les crédits des photos, le réseau d'abord, CACHE_PHOTOS s'il est coupé.
 */
export type Strategie = 'hors-sw' | 'coquille' | 'cache' | 'reseau-dabord' | 'photo' | 'liste-photos';

export interface Aiguillage {
  strategie: Strategie;
  /** Clé dans le cache (chemin du manifeste) ; null hors du service worker. */
  chemin: string | null;
}

const HORS_SW: Aiguillage = { strategie: 'hors-sw', chemin: null };

/** Les pages statiques et leur feuille de style : réseau d'abord (elles changent sans le code). */
function pageStatique(chemin: string): boolean {
  return (chemin.endsWith('.html') && chemin !== '/index.html') || chemin === '/documents.css';
}

/** Ce que fait le service worker d'une requête (url absolue, méthode, mode de Request). */
export function aiguiller(r: { url: string; method: string; mode: string }, origine: string, m: Manifeste): Aiguillage {
  if (r.method !== 'GET') return HORS_SW;
  const u = new URL(r.url);
  if (u.origin !== origine) return HORS_SW;
  const chemin = u.pathname;
  if (chemin.startsWith('/__/') || chemin === '/sw.js') return HORS_SW;
  if (r.mode === 'navigate') {
    if (chemin === '/' || chemin === '/index.html') return { strategie: 'coquille', chemin: '/' };
    return pageStatique(chemin) && chemin in m.empreintes ? { strategie: 'reseau-dabord', chemin } : HORS_SW;
  }
  // Une requête avec paramètres n'est pas un fichier du build (sonde du pilote, contournement voulu).
  if (u.search) return HORS_SW;
  // Les photos des fiches, avant la règle du manifeste : elles n'y sont pas (§ 3.6).
  if (RE_PHOTO.test(chemin)) return { strategie: 'photo', chemin };
  if (chemin.startsWith('/photos/') && chemin.endsWith('.json')) return { strategie: 'liste-photos', chemin };
  if (!(chemin in m.empreintes)) return HORS_SW;
  return { strategie: pageStatique(chemin) ? 'reseau-dabord' : 'cache', chemin };
}

// --- Le moteur, sur des caches et un réseau donnés ---

/** Ce que le moteur utilise de Cache (le vrai, ou un faux dans les tests). */
export interface CacheMin {
  match(cle: string): Promise<Response | undefined>;
  put(cle: string, reponse: Response): Promise<void>;
  keys(): Promise<readonly Request[]>;
  delete(cle: string | Request): Promise<boolean>;
}

export interface CachesMin {
  open(nom: string): Promise<CacheMin>;
  keys(): Promise<string[]>;
  delete(nom: string): Promise<boolean>;
}

/**
 * Ce que le service worker a appris de la dernière navigation : la version
 * est dépassée si le réseau y a servi une autre coquille que la sienne (un
 * déploiement depuis), à jour s'il a servi la sienne ou si la coquille est
 * sortie du cache (hors ligne). Perdu quand le navigateur arrête le service
 * worker : on se rabat alors sur `nouvelleVersion`.
 */
export interface EtatMoteur {
  depassee?: boolean;
}

export interface Moteur {
  caches: CachesMin;
  fetch: (requete: string | Request, init?: RequestInit) => Promise<Response>;
  manifeste: Manifeste;
  /** Origine du site (celle du service worker). */
  origine: string;
  etat: EtatMoteur;
  /** Une version plus récente s'installe ou attend la relève (registration.installing, waiting). */
  nouvelleVersion?: () => boolean;
}

/** La version de ce service worker est-elle dépassée (un autre build déployé) ? */
export const depassee = (mo: Moteur): boolean => mo.etat.depassee ?? mo.nouvelleVersion?.() ?? false;

/** Garde le service worker en vie pour une tâche de fond (event.waitUntil). */
export type Garder = (tache: Promise<unknown>) => void;

const cle = (mo: Moteur, chemin: string): string => mo.origine + chemin;

/**
 * La réponse prête à ranger si son contenu est bien celui de la version
 * (empreinte du manifeste), avec l'empreinte en en-tête ; null sinon (autre
 * version, erreur HTTP, réponse d'une autre origine).
 */
export async function verifiee(mo: Moteur, chemin: string, r: Response): Promise<Response | null> {
  const attendue = mo.manifeste.empreintes[chemin];
  if (!attendue || !reponseDuSite(r)) return null;
  const contenu = await r.arrayBuffer();
  if ((await empreinte(contenu)) !== attendue) return null;
  return refaite(r, contenu, attendue);
}

const reponseDuSite = (r: Response): boolean => r.ok && (r.type === 'basic' || r.type === 'default');

/** `r` refaite sur son contenu lu, avec l'empreinte en en-tête si elle est de la version. */
function refaite(r: Response, contenu: ArrayBuffer, empreinteVersion: string | null): Response {
  // Le corps est déjà décodé : l'encodage et la longueur du transfert ne le décrivent plus.
  const entetes = new Headers(r.headers);
  entetes.delete('content-encoding');
  entetes.delete('content-length');
  if (empreinteVersion) entetes.set(ENTETE_EMPREINTE, empreinteVersion);
  return new Response(contenu, { status: r.status, statusText: r.statusText, headers: entetes });
}

/** Les fichiers immuables (nom haché) se prennent au cache HTTP ; les autres se revalident. */
const modeCacheHttp = (chemin: string): RequestCache => (chemin.startsWith('/assets/') ? 'default' : 'no-cache');

/**
 * Installation d'une version : reprend des caches des versions d'avant ce qui
 * n'a pas changé (même empreinte : pré-chargé ou rangé à l'usage), puis
 * télécharge le reste des pré-chargés. Lève si l'un d'eux n'est pas de cette
 * version : l'installation échoue, l'ancienne version reste. Les caches
 * d'avant ne sont que lus : la page ouverte s'en sert encore.
 */
export async function installer(mo: Moteur): Promise<{ repris: string[]; telecharges: string[] }> {
  const { manifeste } = mo;
  const cache = await mo.caches.open(nomCache(manifeste.version));
  const presents = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const repris = await reprendre(mo, cache, presents);
  const telecharges: string[] = [];
  for (const chemin of manifeste.prechargees) {
    if (presents.has(chemin)) continue;
    const r = await mo.fetch(cle(mo, chemin), { cache: modeCacheHttp(chemin) });
    const v = await verifiee(mo, chemin, r);
    if (!v) throw new Error(`${chemin} : pas le fichier de la version ${manifeste.version} (HTTP ${r.status})`);
    await cache.put(cle(mo, chemin), v);
    presents.add(chemin);
    telecharges.push(chemin);
  }
  return { repris, telecharges };
}

/**
 * Copie dans `cache` (celui de la version) ce que les caches des versions
 * d'avant ont de cette version (même empreinte), sauf ce qu'il a déjà ;
 * rend les chemins copiés. Les caches d'avant ne sont que lus.
 */
async function reprendre(mo: Moteur, cache: CacheMin, presents: Set<string>): Promise<string[]> {
  const repris: string[] = [];
  for (const nom of cachesPerimes(await mo.caches.keys(), mo.manifeste.version)) {
    const ancien = await mo.caches.open(nom);
    for (const r of await ancien.keys()) {
      const chemin = new URL(r.url).pathname;
      const attendue = mo.manifeste.empreintes[chemin];
      if (!attendue || presents.has(chemin)) continue;
      const rangee = await ancien.match(r.url);
      if (rangee?.headers.get(ENTETE_EMPREINTE) !== attendue) continue;
      await cache.put(cle(mo, chemin), rangee);
      presents.add(chemin);
      repris.push(chemin);
    }
  }
  return repris;
}

/**
 * Activation : reprend des caches des versions d'avant ce qui y a été rangé
 * depuis l'installation et n'a pas changé (la fin de la visite où elle s'est
 * installée), puis les efface ; rend leurs noms.
 */
export async function activer(mo: Moteur): Promise<string[]> {
  const cache = await mo.caches.open(nomCache(mo.manifeste.version));
  await reprendre(mo, cache, new Set((await cache.keys()).map((r) => new URL(r.url).pathname)));
  const perimes = cachesPerimes(await mo.caches.keys(), mo.manifeste.version);
  await Promise.all(perimes.map((n) => mo.caches.delete(n)));
  return perimes;
}

/** Range une copie de `r` (vérifiée) en fond ; `r` part tel quel à la page. */
function ranger(mo: Moteur, chemin: string, r: Response, garder: Garder): void {
  const copie = r.clone();
  garder(
    (async () => {
      const v = await verifiee(mo, chemin, copie);
      if (v) await (await mo.caches.open(nomCache(mo.manifeste.version))).put(cle(mo, chemin), v);
    })().catch(() => undefined),
  );
}

/**
 * La coquille : le réseau d'abord, lu en entier (quelques ko) pour savoir
 * avant de répondre si c'est celle de la version, et donc comment servir les
 * fichiers que la page va demander aussitôt. La copie de la version si le
 * réseau est coupé ou répond une erreur.
 */
async function coquille(mo: Moteur, requete: Request, cache: CacheMin, garder: Garder): Promise<Response> {
  const copie = async (): Promise<Response | undefined> => {
    const c = await cache.match(cle(mo, '/'));
    if (c) mo.etat.depassee = false;
    return c;
  };
  let r: Response;
  try {
    r = await mo.fetch(requete);
  } catch (e) {
    const c = await copie();
    if (c) return c;
    throw e;
  }
  if (r.type === 'opaqueredirect') return r;
  if (!reponseDuSite(r)) return (await copie()) ?? r;
  const contenu = await r.arrayBuffer();
  const attendue = mo.manifeste.empreintes['/']!;
  const aJour = (await empreinte(contenu)) === attendue;
  mo.etat.depassee = !aJour;
  if (aJour) {
    const v = refaite(r, contenu.slice(0), attendue);
    garder(
      (async () => {
        if (!(await cache.match(cle(mo, '/')))) await cache.put(cle(mo, '/'), v);
      })().catch(() => undefined),
    );
  }
  return refaite(r, contenu, null);
}

/** Le SHA-256 entier d'un contenu, en hexadécimal. */
async function sha256Hex(contenu: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', contenu));
  return [...h].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Retire de `cache` ses plus anciennes entrées au-delà de `max` (l'ordre de keys() est celui de leur entrée, S57). */
export async function borner(cache: CacheMin, max: number): Promise<number> {
  const cles = await cache.keys();
  const trop = cles.slice(0, Math.max(0, cles.length - max));
  for (const r of trop) await cache.delete(r);
  return trop.length;
}

/**
 * Une photo d'une fiche : CACHE_PHOTOS d'abord, sinon le réseau ; la copie rangée en fond si le
 * début du SHA-256 de son contenu est le nom du fichier (sinon c'est une erreur, ou autre chose
 * que la photo : rien n'est rangé), puis le cache borné.
 */
async function photo(mo: Moteur, requete: Request, chemin: string, garder: Garder): Promise<Response> {
  const cache = await mo.caches.open(CACHE_PHOTOS);
  const rangee = await cache.match(cle(mo, chemin));
  if (rangee) return rangee;
  const r = await mo.fetch(requete);
  const nom = RE_PHOTO.exec(chemin)?.[1];
  if (nom && reponseDuSite(r)) {
    const copie = r.clone();
    garder(
      (async () => {
        const contenu = await copie.arrayBuffer();
        if (!(await sha256Hex(contenu)).startsWith(nom)) return;
        await cache.put(cle(mo, chemin), refaite(copie, contenu, null));
        await borner(cache, PHOTOS_MAX);
      })().catch(() => undefined),
    );
  }
  return r;
}

/** La liste des photos d'un lieu, ou leurs crédits : le réseau d'abord, rangée ; la copie de CACHE_PHOTOS s'il est coupé. */
async function listePhotos(mo: Moteur, requete: Request, chemin: string, garder: Garder): Promise<Response> {
  const cache = await mo.caches.open(CACHE_PHOTOS);
  let r: Response;
  try {
    r = await mo.fetch(requete);
  } catch (e) {
    const c = await cache.match(cle(mo, chemin));
    if (c) return c;
    throw e;
  }
  if (reponseDuSite(r)) {
    const copie = r.clone();
    garder(
      (async () => {
        await cache.put(cle(mo, chemin), refaite(copie, await copie.arrayBuffer(), null));
        await borner(cache, PHOTOS_MAX);
      })().catch(() => undefined),
    );
  }
  return r;
}

/** La réponse du service worker à une requête aiguillée (pas hors-sw). */
export async function repondre(mo: Moteur, requete: Request, a: Aiguillage, garder: Garder): Promise<Response> {
  const chemin = a.chemin!;
  if (a.strategie === 'photo') return photo(mo, requete, chemin, garder);
  if (a.strategie === 'liste-photos') return listePhotos(mo, requete, chemin, garder);
  const cache = await mo.caches.open(nomCache(mo.manifeste.version));
  if (a.strategie === 'coquille') return coquille(mo, requete, cache, garder);
  if (a.strategie === 'reseau-dabord' || depassee(mo)) {
    // Version dépassée : la copie aussi quand le serveur ne l'a plus (un morceau à la demande d'une page restée ouverte).
    const erreurAussi = a.strategie === 'cache';
    try {
      const r = await mo.fetch(requete);
      if (r.ok) ranger(mo, chemin, r, garder);
      else if (erreurAussi) return (await cache.match(cle(mo, chemin))) ?? r;
      return r;
    } catch (e) {
      const copie = await cache.match(cle(mo, chemin));
      if (copie) return copie;
      throw e;
    }
  }
  const rangee = await cache.match(cle(mo, chemin));
  if (rangee) return rangee;
  const r = await mo.fetch(requete);
  if (r.ok) ranger(mo, chemin, r, garder);
  return r;
}

/**
 * Ce que la page a chargé avant que le service worker ne la contrôle (sa
 * première visite) : rangé s'il est du build et pas encore en cache, pris au
 * cache HTTP du navigateur (déjà téléchargé). Sans cela, un morceau chargé à
 * la demande pendant la première visite manquerait hors ligne.
 */
export async function retenir(mo: Moteur, urls: readonly string[]): Promise<string[]> {
  const cache = await mo.caches.open(nomCache(mo.manifeste.version));
  const ranges: string[] = [];
  for (const url of new Set(urls)) {
    let a: Aiguillage;
    try {
      a = aiguiller({ url, method: 'GET', mode: 'cors' }, mo.origine, mo.manifeste);
    } catch {
      continue;
    }
    if (a.strategie !== 'cache' || (await cache.match(cle(mo, a.chemin!)))) continue;
    try {
      const v = await verifiee(mo, a.chemin!, await mo.fetch(cle(mo, a.chemin!)));
      if (v) {
        await cache.put(cle(mo, a.chemin!), v);
        ranges.push(a.chemin!);
      }
    } catch {
      // hors ligne ou refusé : il sera rangé à son prochain usage
    }
  }
  return ranges;
}

/** La relève demandée par la page au chargement : prise seulement si elle est la seule fenêtre ouverte. */
export const releveAccordee = (fenetres: number): boolean => fenetres <= 1;
