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
// se recharge une fois, avant qu'on ait joué. Ce qui a été rangé dans
// l'ancien cache depuis l'installation et n'a pas changé est repris à
// l'activation, avant l'effacement. skipWaiting dès l'installation
// aurait effacé le cache sous une partie en cours, dont les morceaux à la
// demande ne sont plus sur le serveur après un déploiement.

/** Préfixe des caches du site : seuls ceux-là sont effacés (cachesPerimes). */
export const PREFIXE_CACHE = 'terramemo-';
/** En-tête posé sur chaque réponse rangée : l'empreinte de son contenu. */
export const ENTETE_EMPREINTE = 'x-terramemo-empreinte';
/** Messages de la page (src/sw/enregistrer.ts en a sa copie : aucun module partagé, sw.js reste d'un seul tenant). */
export const MESSAGE_ACTIVER = 'terramemo:activer';
export const MESSAGE_CHARGES = 'terramemo:charges';
/** Caractères hexadécimaux gardés du SHA-256 : 64 bits, contre une erreur, pas contre un adversaire. */
export const LONGUEUR_EMPREINTE = 16;

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
 * - coquille : index.html de la version, du cache d'abord (les navigations vers '/', '/?…', '/index.html') ;
 * - cache : du cache d'abord, sinon le réseau, rangé à l'usage ;
 * - reseau-dabord : le réseau, la copie de la version s'il est coupé.
 */
export type Strategie = 'hors-sw' | 'coquille' | 'cache' | 'reseau-dabord';

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
  if (u.search || !(chemin in m.empreintes)) return HORS_SW;
  return { strategie: pageStatique(chemin) ? 'reseau-dabord' : 'cache', chemin };
}

// --- Le moteur, sur des caches et un réseau donnés ---

/** Ce que le moteur utilise de Cache (le vrai, ou un faux dans les tests). */
export interface CacheMin {
  match(cle: string): Promise<Response | undefined>;
  put(cle: string, reponse: Response): Promise<void>;
  keys(): Promise<readonly Request[]>;
}

export interface CachesMin {
  open(nom: string): Promise<CacheMin>;
  keys(): Promise<string[]>;
  delete(nom: string): Promise<boolean>;
}

export interface Moteur {
  caches: CachesMin;
  fetch: (requete: string | Request, init?: RequestInit) => Promise<Response>;
  manifeste: Manifeste;
  /** Origine du site (celle du service worker). */
  origine: string;
}

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
  if (!attendue || !r.ok || (r.type !== 'basic' && r.type !== 'default')) return null;
  const contenu = await r.arrayBuffer();
  if ((await empreinte(contenu)) !== attendue) return null;
  // Le corps est déjà décodé : l'encodage et la longueur du transfert ne le décrivent plus.
  const entetes = new Headers(r.headers);
  entetes.delete('content-encoding');
  entetes.delete('content-length');
  entetes.set(ENTETE_EMPREINTE, attendue);
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

/** La réponse du service worker à une requête aiguillée (pas hors-sw). */
export async function repondre(mo: Moteur, requete: Request, a: Aiguillage, garder: Garder): Promise<Response> {
  const chemin = a.chemin!;
  const cache = await mo.caches.open(nomCache(mo.manifeste.version));
  if (a.strategie === 'reseau-dabord') {
    try {
      const r = await mo.fetch(requete);
      if (r.ok) ranger(mo, chemin, r, garder);
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
