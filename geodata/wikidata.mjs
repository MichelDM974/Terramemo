#!/usr/bin/env node
// Extrait figé et daté de Wikidata (CC0) pour les capitales des pays (étude J2, § 2.1 et
// § 2.5) : geodata/wikidata/capitales.json, que geodata/capitales.mjs lit sans réseau.
//   1. SPARQL (requêtes figées de geodata/wikidata/requetes.rq) : items des pays par leur
//      code ISO (P298), leurs déclarations de capitale (P36) avec qualificatifs, puis les
//      coordonnées (P625) des capitales et des villes de la table à la main ;
//   2. API wbgetentities : libellés (fr, en), titre de la Wikipédia en français et nombre
//      de Wikipédias (sitelinks *wiki, hors Commons, Wikispecies, Meta, Wikidata et les
//      autres wikis de service) des pays et des villes ;
//   3. vues de la Wikipédia en français sur les 12 derniers mois complets (API REST
//      per-article, mensuelle, lecteurs humains), pour le rang combiné de la notoriété
//      (§ 2.4 ; D38 d : la capitale montrée en épreuve, « rang de D48 », vues sur 12
//      mois : 60 jours, la limite de l'API Action prop=pageviews, sont bruités).
//
// Usage : npm run wikidata. Seul script à toucher Wikidata, lancé à la main ; on relit
// le diff de l'extrait avant de le commettre, puis npm run geodata -- --seulement capitales.
// Portage en Node des scripts du relevé (wikidata.py, wikidata_sieges.py, vues.py,
// ~/Sauvegardes/terramemo/j2-conception/capitales/scripts/). User-Agent générique, sans
// adresse ni nom. Le point SPARQL était bridé à une requête par minute le 10/11/2026 :
// 65 s d'attente quand il le dit (429), 4 s entre deux requêtes de vues (§ 2.5).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aujourdhui, sha256 } from './outils.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'geodata', 'wikidata');
const REQUETES = join(DOSSIER, 'requetes.rq');
const EXTRAIT = join(DOSSIER, 'capitales.json');
const MAIN = join(RACINE, 'geodata', 'capitales-main.json');
const PAYS = join(RACINE, 'public', 'geo', 'pays.json');

const UA = 'Terramemo-geodata/1.0 (+https://terramemo-geo.web.app)';
const SPARQL = 'https://query.wikidata.org/sparql';
const API = 'https://www.wikidata.org/w/api.php';
const VUES = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user';
const ATTENTE_SPARQL_MS = 65_000;
const ATTENTE_VUES_MS = 4_000;
const MOIS_VUES = 12;
// Sitelinks en « wiki » qui ne sont pas une Wikipédia (§ 2.4 : ne compter que les Wikipédias).
const PAS_WIKIPEDIA = new Set([
  'commonswiki', 'specieswiki', 'metawiki', 'wikidatawiki', 'mediawikiwiki', 'sourceswiki',
  'outreachwiki', 'wikimaniawiki', 'foundationwiki', 'incubatorwiki', 'wikifunctionswiki',
  'testwiki', 'test2wiki', 'testwikidatawiki', 'labswiki', 'labstestwiki', 'nostalgiawiki',
  'otrs_wikiwiki', 'strategywiki', 'tenwiki', 'usabilitywiki', 'loginwiki', 'votewiki',
]);

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
// Lignes d'une section de la table à la main, sans sa note « _ » (comme capitales.mjs).
const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => k !== '_');

function echec(message) {
  console.error(`wikidata : ${message}`);
  process.exit(1);
}

/**
 * GET JSON, réessayé (429, 5xx, réseau) ; attente d'au moins `pause` ms sur un 429.
 * absent : la valeur rendue sur un 404 (l'API des vues n'a rien pour la page), échec sinon.
 */
async function lireJson(url, { pause, essais = 6, entetes = {}, absent }) {
  for (let essai = 1; essai <= essais; essai++) {
    let rep;
    try {
      rep = await fetch(url, { headers: { 'User-Agent': UA, ...entetes }, signal: AbortSignal.timeout(180_000) });
    } catch (e) {
      console.log(`  essai ${essai} : ${e.message}`);
      await attendre(10_000);
      continue;
    }
    if (rep.ok) return rep.json();
    if (rep.status === 404 && absent !== undefined) return absent;
    const reessayer = Number(rep.headers.get('retry-after')) * 1000 || 0;
    console.log(`  essai ${essai} : HTTP ${rep.status}`);
    if (rep.status !== 429 && rep.status < 500) echec(`${url.slice(0, 120)}… : HTTP ${rep.status}`);
    await attendre(rep.status === 429 ? Math.max(pause, reessayer) : 10_000 * essai);
  }
  echec(`${url.slice(0, 120)}… : injoignable après ${essais} essais`);
}

/** Les requêtes de requetes.rq, par nom de section (« #= nom »). */
function sections(texte) {
  const res = {};
  let nom = null;
  for (const ligne of texte.split('\n')) {
    const m = /^#= (\w+)$/.exec(ligne);
    if (m) {
      nom = m[1];
      res[nom] = '';
    } else if (nom && !ligne.startsWith('#')) res[nom] += `${ligne}\n`;
  }
  return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.trim()]));
}

let derniereSparql = 0;
async function sparql(requete) {
  // Une requête à la fois ; espacées de 65 s seulement si le point a répondu 429.
  const url = `${SPARQL}?${new URLSearchParams({ query: requete, format: 'json' })}`;
  derniereSparql = Date.now();
  const j = await lireJson(url, { pause: ATTENTE_SPARQL_MS, entetes: { Accept: 'application/sparql-results+json' } });
  return j.results.bindings;
}

async function entites(ids, props) {
  const res = {};
  const tries = [...new Set(ids)].sort();
  for (let i = 0; i < tries.length; i += 50) {
    const url = `${API}?${new URLSearchParams({ action: 'wbgetentities', ids: tries.slice(i, i + 50).join('|'), props, languages: 'fr|en', format: 'json' })}`;
    const j = await lireJson(url, { pause: ATTENTE_SPARQL_MS });
    Object.assign(res, j.entities);
    await attendre(1000);
  }
  return res;
}

/**
 * Les MOIS_VUES derniers mois complets avant `maintenant` (UTC) : premier jour du premier
 * mois et dernier jour du dernier, au format AAAAMMJJ de l'API des vues.
 */
function periodeVues(maintenant) {
  const p = (n) => String(n).padStart(2, '0');
  const a = maintenant.getUTCFullYear();
  const m = maintenant.getUTCMonth(); // 0-11 : le mois en cours, exclu
  const debut = new Date(Date.UTC(a, m - MOIS_VUES, 1));
  const fin = new Date(Date.UTC(a, m, 0)); // jour 0 : dernier jour du mois précédent
  const f = (d) => `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  return { du: f(debut), au: f(fin) };
}

/**
 * Vues de la Wikipédia en français par titre (somme des MOIS_VUES derniers mois complets,
 * lecteurs humains, tous accès), une requête par titre espacée de ATTENTE_VUES_MS ; null
 * pour une page sans vues connues. Les titres sont ceux des sitelinks : pas de redirection.
 */
async function vues(titres, maintenant) {
  const { du, au } = periodeVues(maintenant);
  const res = new Map();
  const mois = new Set();
  for (const t of [...new Set(titres)].sort()) {
    await attendre(ATTENTE_VUES_MS);
    const url = `${VUES}/${encodeURIComponent(t.replaceAll(' ', '_'))}/monthly/${du}/${au}`;
    const j = await lireJson(url, { pause: 60_000, absent: { items: [] } });
    for (const it of j.items) mois.add(it.timestamp.slice(0, 6));
    res.set(t, j.items.length ? j.items.reduce((s, it) => s + it.views, 0) : null);
  }
  const iso = (x) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`;
  return { parTitre: res, du: iso(du), au: iso(au), mois: mois.size };
}

const wikipedias = (e) => Object.keys(e?.sitelinks ?? {}).filter((s) => s.endsWith('wiki') && !PAS_WIKIPEDIA.has(s)).length;
const libelle = (e, l) => e?.labels?.[l]?.value ?? null;
const frwiki = (e) => e?.sitelinks?.frwiki?.title ?? null;

async function main() {
  const debut = Date.now();
  const texteRequetes = await readFile(REQUETES, 'utf8');
  const req = sections(texteRequetes);
  for (const n of ['pays', 'capitales', 'coordonnees']) if (!req[n]) echec(`requetes.rq : section ${n} absente`);
  const main = JSON.parse(await readFile(MAIN, 'utf8'));
  const ids = JSON.parse(await readFile(PAYS, 'utf8'))
    .filter((p) => p.statut === 'jouable' || p.statut === 'optionnel')
    .map((p) => p.id);

  console.log('SPARQL : items des pays (P298)');
  const extraitLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  // Date locale (La Réunion) prise au même instant : celle des crédits et de enCours
  // (capitales.mjs), pas celle de l'écriture, une vingtaine de minutes plus tard.
  const date = aujourdhui();
  const lignesPays = await sparql(req.pays.replace('{{codes}}', ids.map((c) => `"${c}"`).join(' ')));
  const itemsParCode = {};
  for (const b of lignesPays) (itemsParCode[b.code.value] ??= []).push(qid(b.pays.value));
  for (const v of Object.values(itemsParCode)) v.sort();
  const itemsPays = new Set([...Object.values(itemsParCode).flat(), ...sansNotes(main.items_pays).map(([, x]) => x.q)]);

  console.log(`SPARQL : capitales (P36) de ${itemsPays.size} items`);
  await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
  const lignesCaps = await sparql(req.capitales.replace('{{pays}}', [...itemsPays].sort().map((q) => `wd:${q}`).join(' ')));
  const decl = new Map();
  for (const b of lignesCaps) {
    const id = b.stmt.value.slice(b.stmt.value.lastIndexOf('/') + 1);
    const d = decl.get(id) ?? { id, pays: qid(b.pays.value), capitale: qid(b.cap.value), rang: b.rang.value.split('#')[1].replace('Rank', '').toLowerCase(), qualificatifs: {} };
    if (b.pq) {
      const v = b.qv.type === 'uri' ? qid(b.qv.value) : b.qv.value;
      const l = (d.qualificatifs[qid(b.pq.value)] ??= []);
      if (!l.includes(v)) l.push(v);
    }
    decl.set(id, d);
  }
  const declarations = [...decl.values()].sort((a, b) => (a.pays + a.id < b.pays + b.id ? -1 : 1));
  for (const d of declarations) {
    for (const l of Object.values(d.qualificatifs)) l.sort();
    d.qualificatifs = Object.fromEntries(Object.entries(d.qualificatifs).sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  // Villes : toutes les capitales déclarées (même finies, pour voir ce qui change), et
  // celles que nomme la table à la main (ajouts, noms, alias, écartées).
  const villesIds = new Set(declarations.map((d) => d.capitale));
  for (const [, p] of sansNotes(main.pays)) for (const q of Object.keys(p.ajouter ?? {})) villesIds.add(q);
  for (const s of ['noms', 'alias', 'points', 'non_retenues']) for (const [q] of sansNotes(main[s])) villesIds.add(q);
  console.log(`SPARQL : coordonnées de ${villesIds.size} villes`);
  await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
  const lignesCoord = await sparql(req.coordonnees.replace('{{villes}}', [...villesIds].sort().map((q) => `wd:${q}`).join(' ')));
  const coords = new Map();
  for (const b of lignesCoord) {
    const m = /^Point\(([-\d.e]+) ([-\d.e]+)\)$/.exec(b.coord.value);
    if (!m) continue; // coordonnée sur un autre globe
    const q = qid(b.ville.value);
    if (!coords.has(q)) coords.set(q, []);
    coords.get(q).push([Number(m[1]), Number(m[2])]);
  }

  console.log('API : libellés et sitelinks');
  const apiLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ent = await entites([...itemsPays, ...villesIds], 'labels|sitelinks');

  console.log('Vues de la Wikipédia en français');
  const titres = [...villesIds].map((q) => frwiki(ent[q])).filter(Boolean);
  const v = await vues(titres, new Date(extraitLe));

  const pays = {};
  for (const q of [...itemsPays].sort()) {
    const e = ent[q];
    pays[q] = { fr: libelle(e, 'fr'), en: libelle(e, 'en'), frwiki: frwiki(e), wikipedias: wikipedias(e) };
  }
  const villes = {};
  for (const q of [...villesIds].sort()) {
    const e = ent[q];
    if (!e || e.missing !== undefined) echec(`${q} : item absent de Wikidata`);
    // Plusieurs coordonnées au meilleur rang : la première dans l'ordre (lon, lat), stable.
    const c = (coords.get(q) ?? []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const t = frwiki(e);
    villes[q] = {
      fr: libelle(e, 'fr'),
      en: libelle(e, 'en'),
      frwiki: t,
      wikipedias: wikipedias(e),
      vues_fr: t ? (v.parTitre.get(t) ?? null) : null,
      lon: c[0]?.[0] ?? null,
      lat: c[0]?.[1] ?? null,
      ...(c.length > 1 ? { coordonnees: c.length } : {}),
    };
  }

  // Écriture : une ligne par entrée, pour que le diff d'un nouvel extrait se relise.
  const objet = (o) => `{\n${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}:${JSON.stringify(x)}`).join(',\n')}\n}`;
  const texte =
    `{\n"extrait_le":${JSON.stringify(extraitLe)},\n"date":${JSON.stringify(date)},\n"api_le":${JSON.stringify(apiLe)},\n` +
    `"requetes_sha256":${JSON.stringify(sha256(texteRequetes))},\n` +
    `"vues":${JSON.stringify({ du: v.du, au: v.au, mois: v.mois, source: 'fr.wikipedia.org, API REST des vues (per-article, mensuelle, lecteurs humains)' })},\n` +
    `"items_par_code":${objet(Object.fromEntries(Object.entries(itemsParCode).sort(([a], [b]) => (a < b ? -1 : 1))))},\n` +
    `"pays":${objet(pays)},\n` +
    `"declarations":[\n${declarations.map((d) => JSON.stringify(d)).join(',\n')}\n],\n` +
    `"villes":${objet(villes)}\n}\n`;
  await writeFile(EXTRAIT, texte);
  console.log(
    `${Object.keys(itemsParCode).length} codes, ${itemsPays.size} items pays, ${declarations.length} déclarations P36, ` +
      `${Object.keys(villes).length} villes, ${titres.length} titres (vues du ${v.du} au ${v.au}) ; ` +
      `${Math.round((Date.now() - debut) / 1000)} s`,
  );
}

await main();
