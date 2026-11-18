// Client réseau des scripts des photos (#34, lot P1 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.1) : Wikidata (SPARQL, API) et
// Commons (API), une requête à la fois, avec pause, et un cache sur disque hors de git
// repris d'un lancement à l'autre (relancer ne rappelle pas le réseau pour ce qui est
// déjà su). Sans effet à l'import.
//
// User-Agent générique du projet, comme geodata/wikidata.mjs : ni nom, ni adresse, ni
// identifiant de l'utilisateur. Le point SPARQL a été bridé à une requête par minute le
// 10/11/2026 : sur un 429, on attend ce qu'il dit (au moins 65 s).
//
// La date d'une réponse est celle du fichier du cache (son mtime : l'instant où le réseau
// l'a rendue) ; luLe(objet) la rend pour tout objet que json() a rendu. Une durée de vie
// (vie, en ms) fait relire une réponse plus vieille : les licences et les catégories d'un
// fichier changent sur Commons (une demande de suppression s'ouvre).

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const UA = 'Terramemo-geodata/1.0 (+https://terramemo-geo.web.app)';
export const SPARQL = 'https://query.wikidata.org/sparql';
export const API_WIKIDATA = 'https://www.wikidata.org/w/api.php';
export const API_COMMONS = 'https://commons.wikimedia.org/w/api.php';

/** Cache par défaut : hors de tout arbre de travail, donc partagé entre eux et gardé. */
export const CACHE_DEFAUT = process.env.PHOTOS_CACHE ?? join(homedir(), '.cache', 'terramemo', 'photos');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Délai dépassé (ou réponse de délai du point SPARQL) : le lieu est « à compléter ». */
export class DelaiDepasse extends Error {}

// Erreurs de MediaWiki rendues avec un statut 200 et une clé « error » : celles-ci
// passent en attendant (la charge, le débit), les autres (paramètre faux, trop de
// valeurs) remontent. Aucune ne va au cache.
const ERREURS_PASSAGERES = /^(ratelimited|maxlag|readonly|internal_api_error|backend-fail|unknownerror)/;

/**
 * Un client : json(url, options) rend le JSON de l'adresse, depuis le cache s'il l'a,
 * sinon par le réseau, une requête à la fois et pause ms au moins entre deux. Les
 * réponses en erreur (HTTP, ou clé « error » de MediaWiki) ne vont jamais au cache : un
 * lancement suivant les retente. stats compte les lectures du cache et du réseau (le
 * temps estimé des 332 lieux en sort). fetch et dormir se remplacent pour les tests.
 * frais : toute réponse du cache est relue (option --frais des scripts).
 */
export function client({ cache = CACHE_DEFAUT, pause = 1200, journal = () => {}, frais = false, fetch: chercher = globalThis.fetch, dormir = attendre } = {}) {
  let file = Promise.resolve();
  let derniere = 0;
  const stats = { cache: 0, reseau: 0, attente_ms: 0, reseau_ms: 0, perimees: 0 };
  const dates = new WeakMap();
  const dater = (x, d) => {
    if (x && typeof x === 'object') dates.set(x, d);
    return x;
  };

  async function depuisReseau(url, { delai, essais, accept }) {
    let derniereErreur;
    for (let essai = 1; essai <= essais; essai++) {
      const reste = derniere + pause - Date.now();
      if (reste > 0) {
        stats.attente_ms += reste;
        await dormir(reste);
      }
      const t0 = Date.now();
      let rep;
      try {
        rep = await chercher(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(delai) });
      } catch (e) {
        derniere = Date.now();
        stats.reseau_ms += derniere - t0;
        derniereErreur = e.name === 'TimeoutError' ? new DelaiDepasse(`délai de ${delai / 1000} s dépassé`) : e;
        journal(`  essai ${essai} : ${derniereErreur.message}`);
        if (!(derniereErreur instanceof DelaiDepasse)) await dormir(5000 * essai);
        continue;
      }
      const texte = await rep.text();
      derniere = Date.now();
      stats.reseau_ms += derniere - t0;
      stats.reseau++;
      if (rep.ok) {
        let j;
        try {
          j = JSON.parse(texte);
        } catch {
          // Une page d'erreur HTML avec un statut 200 (mandataire) : passagère.
          derniereErreur = new Error(`réponse illisible pour ${url.slice(0, 120)}…`);
          journal(`  essai ${essai} : ${derniereErreur.message}`);
          await dormir(10_000 * essai);
          continue;
        }
        const code = j && typeof j === 'object' && j.error ? String(j.error.code ?? '') : null;
        if (code === null) return j;
        derniereErreur = new Error(`erreur de l'API (${code}) : ${String(j.error.info ?? '').slice(0, 160)}`);
        journal(`  essai ${essai} : ${derniereErreur.message}`);
        if (!ERREURS_PASSAGERES.test(code)) throw derniereErreur;
        const retry = Number(rep.headers.get('retry-after')) * 1000 || 0;
        const ms = code === 'ratelimited' ? Math.max(65_000, retry) : Math.max(5_000 * essai, retry);
        stats.attente_ms += ms;
        await dormir(ms);
        continue;
      }
      // Le point SPARQL répond 500 avec une java.util.concurrent.TimeoutException quand
      // la requête dépasse son propre plafond : c'est un délai, pas une panne.
      if (/TimeoutException/.test(texte)) {
        derniereErreur = new DelaiDepasse('délai du point SPARQL dépassé');
        journal(`  essai ${essai} : ${derniereErreur.message}`);
        continue;
      }
      derniereErreur = new Error(`HTTP ${rep.status} pour ${url.slice(0, 120)}…`);
      journal(`  essai ${essai} : HTTP ${rep.status}`);
      if (rep.status !== 429 && rep.status < 500) throw derniereErreur;
      const retry = Number(rep.headers.get('retry-after')) * 1000 || 0;
      const ms = rep.status === 429 ? Math.max(65_000, retry) : 10_000 * essai;
      stats.attente_ms += ms;
      await dormir(ms);
    }
    throw derniereErreur;
  }

  /**
   * delai : plafond d'une requête (45 s pour le SPARQL, § 3.1) ; essais : 2 = retentée
   * une fois, puis l'erreur remonte (DelaiDepasse pour un délai) ; vie : âge (ms) au-delà
   * duquel une réponse du cache est relue (Infinity par défaut).
   */
  function json(url, { delai = 60_000, essais = 2, accept = 'application/json', vie = Infinity } = {}) {
    const tache = file.then(async () => {
      const cle = createHash('sha1').update(url).digest('hex');
      const chemin = join(cache, `${cle.slice(0, 2)}`, `${cle}.json`);
      try {
        const [texte, st] = await Promise.all([readFile(chemin, 'utf8'), stat(chemin)]);
        if (!frais && Date.now() - st.mtimeMs <= vie) {
          stats.cache++;
          return dater(JSON.parse(texte), st.mtime.toISOString().replace(/\.\d+Z$/, 'Z'));
        }
        stats.perimees++;
      } catch {
        // absent du cache (ou illisible) : le réseau
      }
      const j = await depuisReseau(url, { delai, essais, accept });
      await mkdir(join(cache, cle.slice(0, 2)), { recursive: true });
      await writeFile(`${chemin}.tmp`, JSON.stringify(j));
      await rename(`${chemin}.tmp`, chemin);
      return dater(j, new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
    });
    file = tache.catch(() => {});
    return tache;
  }

  return {
    stats,
    json,
    /** Date (ISO, UTC) où le réseau a rendu cet objet (une réponse, ou les lignes d'un SPARQL). */
    luLe: (x) => dates.get(x) ?? null,
    /** Lignes d'une requête SPARQL ; DelaiDepasse au-delà de 45 s, deux fois. */
    sparql: (requete, { delai = 45_000, essais = 2, vie } = {}) =>
      json(`${SPARQL}?${new URLSearchParams({ query: requete, format: 'json' })}`, {
        delai,
        essais,
        vie,
        accept: 'application/sparql-results+json',
      }).then((j) => dater(j.results.bindings, dates.get(j))),
    /** L'API de Commons (formatversion 2). */
    commons: (params, opts) => json(`${API_COMMONS}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`, opts),
    /** L'API de Wikidata (formatversion 2). */
    wikidata: (params, opts) => json(`${API_WIKIDATA}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`, opts),
  };
}
