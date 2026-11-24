// Construction du service worker (#22), lue par Node au build (plugin de
// vite.config.ts), jamais par le navigateur. Une fois le site écrit (dist/,
// ou le dossier de `driver.py serve --preview`), le manifeste se dresse
// d'après les fichiers sur le disque (ceux de public/ compris) et remplace
// MARQUEUR dans sw.js :
// - empreintes : chaque fichier servi, sauf sw.js, sous son chemin
//   ('/index.html' sous '/', la clé de la coquille) ;
// - prechargees : la coquille (index.html et ce qu'il référence de l'origine :
//   script, feuille de style, icône, police, morceaux pré-chargés, données
//   de la carte qu'il pré-charge) et EN_PLUS_PREMIERE_VISITE. Rien d'autre :
//   drapeaux, capitales, île, mers, morceaux à la demande s'y ajoutent à
//   l'usage (quota de Hosting) ;
// - version : l'empreinte de tout cela et du code de sw.js, d'où le nom du
//   cache : un fichier qui change, et c'est une nouvelle version.
// Les photos des fiches (photos/, #34 lot P2, § 3.6) n'y sont pas : elles ont
// leurs propres règles (src/sw/logique.ts), et le build ne les lit même pas
// (horsManifeste : 105 à 138 Mo de moins à lire à chaque build).
import { createHash } from 'node:crypto';
import { LONGUEUR_EMPREINTE, type Manifeste } from './logique';

/** La chaîne de src/sw/sw.ts que le manifeste remplace (entre guillemets, quels qu'ils soient après minification). */
export const MARQUEUR = '__TERRAMEMO_MANIFESTE_SW__';
/** Le fichier du service worker, à la racine (sa portée est tout le site). */
export const FICHIER_SW = 'sw.js';

/**
 * Lus au premier affichage sans être référencés par index.html : la carte
 * allégée du rendu canvas (par défaut), tracée pendant les gestes
 * (src/map/donnees.ts, chargerLeger). Les quatre autres fichiers de la carte
 * sont pré-chargés par index.html (<link rel="preload">), donc pris avec lui.
 */
export const EN_PLUS_PREMIERE_VISITE = ['/geo/monde-leger.topo.json'];

export function empreinteNode(contenu: Uint8Array | string): string {
  return createHash('sha256').update(contenu).digest('hex').slice(0, LONGUEUR_EMPREINTE);
}

/** Chemin servi d'un fichier du site ('index.html' → '/', 'geo/pays.json' → '/geo/pays.json'). */
export const cheminServi = (relatif: string): string => (relatif === 'index.html' ? '/' : '/' + relatif.split('\\').join('/'));

/** Les adresses de l'origine que référence index.html (src, href), en chemins servis. */
export function referencesDe(html: string): string[] {
  const vus = new Set<string>();
  for (const m of html.matchAll(/\s(?:src|href)\s*=\s*["']([^"'#?]+)/g)) {
    const a = m[1]!;
    if (a.startsWith('/') && !a.startsWith('//')) vus.add(a);
  }
  return [...vus];
}

/** Un fichier du build hors du manifeste (et jamais lu pour lui) : sous photos/ (les photos des fiches et leurs listes). */
export const horsManifeste = (relatif: string): boolean => /^photos[\\/]/.test(relatif);

/** Le manifeste du build, depuis ses fichiers (chemin relatif → contenu) et le code de sw.js avant injection. */
export function dresserManifeste(fichiers: ReadonlyMap<string, Uint8Array | string>, codeSw: string): Manifeste {
  const empreintes: Record<string, string> = {};
  for (const [relatif, contenu] of [...fichiers].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (relatif === FICHIER_SW || horsManifeste(relatif)) continue;
    empreintes[cheminServi(relatif)] = empreinteNode(contenu);
  }
  const index = fichiers.get('index.html');
  if (index === undefined) throw new Error('service worker : pas d’index.html dans le build');
  const html = typeof index === 'string' ? index : new TextDecoder().decode(index);
  const voulus = ['/', ...referencesDe(html), ...EN_PLUS_PREMIERE_VISITE];
  const absents = voulus.filter((c) => !(c in empreintes));
  if (absents.length) throw new Error(`service worker : à pré-charger mais absent du build : ${absents.join(', ')}`);
  const prechargees = [...new Set(voulus)];
  const version = empreinteNode(JSON.stringify({ empreintes, prechargees, code: empreinteNode(codeSw) }));
  return { version, empreintes, prechargees };
}

/** sw.js avec son manifeste à la place de MARQUEUR (une seule fois, sinon le build échoue). */
export function injecterManifeste(codeSw: string, m: Manifeste): string {
  const re = new RegExp(`(["'\`])${MARQUEUR}\\1`, 'g');
  const n = codeSw.match(re)?.length ?? 0;
  if (n !== 1) throw new Error(`service worker : ${n} marqueur(s) ${MARQUEUR} dans ${FICHIER_SW}, 1 attendu`);
  // Le JSON dans une chaîne JS (JSON.parse au démarrage du service worker) ; une fonction de
  // remplacement, pour qu'aucun « $ » du JSON ne soit pris pour un motif.
  return codeSw.replace(re, () => JSON.stringify(JSON.stringify(m)));
}

/**
 * Servi à /sw.js par le serveur de développement : un service worker qui se
 * retire (caches du site effacés, désinscrit, pages rechargées). Un build
 * servi avant à la même adresse (serve --preview, puis serve) y aurait laissé
 * le sien, qui servirait sa coquille à la place des modules de Vite : le
 * contrôle de mise à jour du navigateur le remplace par celui-ci.
 */
export const SW_DE_RETRAIT = `// Terramemo en développement : aucun service worker (src/sw/construction.ts).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const n of await caches.keys()) if (n.startsWith('terramemo-')) await caches.delete(n);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
`;
