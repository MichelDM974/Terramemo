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
// npm run wikidata -- --notoriete : seulement les vues sur 12 mois des articles des pays
// (geodata/wikidata/notoriete.json, notoriété du quiz, étude J2 § 2.4, D48 b), d'après
// les items et les titres de l'extrait des capitales ; puis npm run geodata -- --seulement
// notoriete.
// npm run wikidata -- --fiches : les chiffres des fiches des lieux (#34, étude fiche-lieu
// § 2.1, § 2.2 et § 2.5) des 197 pays (items de l'extrait des capitales), des 48
// territoires, des 12 zones contestées et de l'Antarctique (lot F3 : leurs items, clé qid
// de geodata/fiches-main.json), par les requêtes de geodata/wikidata/requetes-fiches.rq,
// dans geodata/wikidata/fiches.json ; puis npm run fiches.
// npm run wikidata -- --fiches-mers : les chiffres des fiches des 50 océans et mers (#34,
// lot F4, étude fiche-lieu § 2.3) : superficie (P2046), profondeur (P4511), pays (P17,
// P205) et, pour chaque pays cité, sa dissolution (P576) et ses libellés, par les requêtes
// de geodata/wikidata/requetes-fiches-mers.rq, dans geodata/wikidata/fiches-mers.json (les
// items : clé q de geodata/mers.json) ; puis npm run fiches.
// npm run wikidata -- --fiches-communes : les textes des fiches des 24 communes de La Réunion
// (#34, lot F5, étude fiche-lieu § 2.4) : leur item par le code INSEE (P374), leur gentilé
// (P1549), leur libellé et le titre de leur article de la Wikipédia en français, par les
// requêtes de geodata/wikidata/requetes-fiches-communes.rq, dans
// geodata/wikidata/fiches-communes.json (les codes : public/geo/reunion/communes.json) ;
// puis npm run fiches.
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
const EXTRAIT_NOTORIETE = join(DOSSIER, 'notoriete.json');
const REQUETES_FICHES = join(DOSSIER, 'requetes-fiches.rq');
const EXTRAIT_FICHES = join(DOSSIER, 'fiches.json');
const REQUETES_FICHES_MERS = join(DOSSIER, 'requetes-fiches-mers.rq');
const EXTRAIT_FICHES_MERS = join(DOSSIER, 'fiches-mers.json');
const TABLE_MERS = join(RACINE, 'geodata', 'mers.json');
const REQUETES_FICHES_COMMUNES = join(DOSSIER, 'requetes-fiches-communes.rq');
const EXTRAIT_FICHES_COMMUNES = join(DOSSIER, 'fiches-communes.json');
const COMMUNES = join(RACINE, 'public', 'geo', 'reunion', 'communes.json');
const MAIN_NOTORIETE = join(RACINE, 'geodata', 'notoriete-main.json');
const MAIN = join(RACINE, 'geodata', 'capitales-main.json');
const MAIN_FICHES = join(RACINE, 'geodata', 'fiches-main.json');
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

/** La valeur d'une ligne SPARQL : un item par son QID, sinon le texte. */
const valeur = (b) => (b.type === 'uri' ? qid(b.value) : b.value);

/**
 * Déclarations par item, d'après les lignes SPARQL (une ligne par qualificatif) : {id, rang,
 * ...champ(ligne), q: {Pxxx: [valeurs]}, prec?}, triées par id.
 */
function declarations(lignes, cleItem, champ) {
  const parId = new Map();
  for (const b of lignes) {
    const id = b.stmt.value.slice(b.stmt.value.lastIndexOf('/') + 1);
    const d =
      parId.get(id) ??
      {
        item: qid(b[cleItem].value),
        id,
        rang: b.rang.value.split('#')[1].replace('Rank', '').toLowerCase(),
        ...champ(b),
        q: {},
      };
    if (b.pq) {
      const l = (d.q[qid(b.pq.value)] ??= []);
      const v = valeur(b.qv);
      if (!l.includes(v)) l.push(v);
    }
    if (b.prec) d.prec = Number(b.prec.value);
    parId.set(id, d);
  }
  const res = {};
  for (const d of [...parId.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    for (const l of Object.values(d.q)) l.sort();
    d.q = Object.fromEntries(Object.entries(d.q).sort(([a], [b]) => (a < b ? -1 : 1)));
    const { item, ...reste } = d;
    (res[item] ??= []).push(reste);
  }
  return res;
}

async function entites(ids, props, sites = null) {
  const res = {};
  const tries = [...new Set(ids)].sort();
  for (let i = 0; i < tries.length; i += 50) {
    const params = { action: 'wbgetentities', ids: tries.slice(i, i + 50).join('|'), props, languages: 'fr|en', format: 'json' };
    if (sites) params.sitefilter = sites;
    const url = `${API}?${new URLSearchParams(params)}`;
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

/**
 * Les vues de la Wikipédia en français sur 12 mois des articles des pays jouables et
 * optionnels (D48 b : le rang combiné des pays ; leurs Wikipédias sont déjà dans l'extrait
 * des capitales, même item, même filtre des sites). L'item d'un pays : celui que la table
 * à la main choisit (items_pays), sinon le seul de son code ; son titre : le sitelink
 * frwiki de l'extrait des capitales, sans redirection, sauf ceux de la table de la
 * notoriété (notoriete-main.json, titres : l'item du pays jouable a pour article
 * « Pays-Bas (pays constitutif) », le lecteur lit « Pays-Bas »).
 */
async function notorietePays() {
  const debut = Date.now();
  const extrait = JSON.parse(await readFile(EXTRAIT, 'utf8'));
  const main = JSON.parse(await readFile(MAIN, 'utf8'));
  const titres = JSON.parse(await readFile(MAIN_NOTORIETE, 'utf8')).titres ?? {};
  const ids = JSON.parse(await readFile(PAYS, 'utf8'))
    .filter((p) => p.statut === 'jouable' || p.statut === 'optionnel')
    .map((p) => p.id)
    .sort();
  const extraitLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const date = aujourdhui();
  const items = {};
  for (const id of ids) {
    const choisi = main.items_pays?.[id]?.q;
    const parCode = extrait.items_par_code[id] ?? [];
    const q = choisi ?? (parCode.length === 1 ? parCode[0] : null);
    if (!q) echec(`${id} : ${parCode.length} items pour ce code, et aucun choisi (capitales-main.json, items_pays)`);
    const t = titres[id]?.frwiki ?? extrait.pays[q]?.frwiki;
    if (!t) echec(`${id} (${q}) : pas d'article dans la Wikipédia en français dans l'extrait des capitales`);
    items[id] = { q, frwiki: t };
  }
  console.log(`Vues de la Wikipédia en français : ${ids.length} pays`);
  const v = await vues(Object.values(items).map((x) => x.frwiki), new Date(extraitLe));
  const pays = Object.fromEntries(ids.map((id) => [id, { ...items[id], vues_fr: v.parTitre.get(items[id].frwiki) ?? null }]));
  const objet = (o) => `{\n${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}:${JSON.stringify(x)}`).join(',\n')}\n}`;
  const texte =
    `{\n"extrait_le":${JSON.stringify(extraitLe)},\n"date":${JSON.stringify(date)},\n` +
    `"items":${JSON.stringify(`ceux de geodata/wikidata/capitales.json (extrait du ${extrait.extrait_le})`)},\n` +
    `"vues":${JSON.stringify({ du: v.du, au: v.au, mois: v.mois, source: 'fr.wikipedia.org, API REST des vues (per-article, mensuelle, lecteurs humains)' })},\n` +
    `"pays":${objet(pays)}\n}\n`;
  await writeFile(EXTRAIT_NOTORIETE, texte);
  const sans = Object.entries(pays).filter(([, x]) => x.vues_fr === null).map(([id]) => id);
  console.log(`${ids.length} pays (vues du ${v.du} au ${v.au}, ${v.mois} mois)${sans.length ? ` ; sans vues : ${sans.join(', ')}` : ''} ; ${Math.round((Date.now() - debut) / 1000)} s`);
}

/**
 * Les chiffres des fiches (#34) des 197 pays : superficies, gentilés en français,
 * habitants, points culminants (sommet, altitude, coordonnées), tels que Wikidata les
 * déclare, sans rien choisir (la règle est au build, geodata/fiches.mjs). L'item d'un
 * pays : celui de la table des capitales (items_pays), sinon le seul de son code, comme
 * notorietePays. Lot F3 : les mêmes requêtes pour les items des territoires, des zones et
 * de l'Antarctique (clé qid de geodata/fiches-main.json, rangés dans autres), plus la
 * capitale (P36) des seuls territoires ; leurs libellés et le titre de leur article de la
 * Wikipédia en français (lieux[q].fr, lieux[q].frwiki ; les pays ont le leur dans l'extrait
 * des capitales), et ceux des capitales (villes). Une déclaration : {id, rang, v, unite?,
 * q: {Pxxx: [valeurs]}, prec?} ; q les qualificatifs (items par leur QID, dates en ISO),
 * prec la précision de P585.
 */
async function fichesPays() {
  const debut = Date.now();
  const texteRequetes = await readFile(REQUETES_FICHES, 'utf8');
  const req = sections(texteRequetes);
  const noms = ['superficies', 'gentiles', 'habitants', 'culminants', 'capitales', 'altitudes', 'coordonnees_sommets'];
  for (const n of noms) if (!req[n]) echec(`requetes-fiches.rq : section ${n} absente`);
  const extrait = JSON.parse(await readFile(EXTRAIT, 'utf8'));
  const main = JSON.parse(await readFile(MAIN, 'utf8'));
  const mainFiches = JSON.parse(await readFile(MAIN_FICHES, 'utf8'));
  const entitesCarte = JSON.parse(await readFile(PAYS, 'utf8'));
  const ids = entitesCarte
    .filter((p) => p.statut === 'jouable' || p.statut === 'optionnel')
    .map((p) => p.id)
    .sort();
  const items = {};
  for (const id of ids) {
    const parCode = extrait.items_par_code[id] ?? [];
    const q = main.items_pays?.[id]?.q ?? (parCode.length === 1 ? parCode[0] : null);
    if (!q) echec(`${id} : ${parCode.length} items pour ce code, et aucun choisi (capitales-main.json, items_pays)`);
    items[id] = q;
  }
  // Lot F3 : les 61 autres entités (48 territoires, 12 zones, l'Antarctique), par la clé qid de la table des fiches.
  const autresIds = entitesCarte.filter((p) => !ids.includes(p.id)).map((p) => p.id).sort();
  const autres = {};
  for (const id of autresIds) {
    const q = mainFiches.qid?.[id]?.q;
    if (!q) echec(`${id} : pas d'item dans geodata/fiches-main.json (clé qid)`);
    autres[id] = q;
  }
  const territoires = entitesCarte.filter((p) => p.statut === 'territoire').map((p) => autres[p.id]).sort();
  const lieux = [...new Set([...Object.values(items), ...Object.values(autres)])].sort();
  const extraitLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const date = aujourdhui();
  const nombre = (b) => Number(b.value);

  const valeursLieux = lieux.map((q) => `wd:${q}`).join(' ');
  const parRequete = {};
  for (const [n, champ] of [
    ['superficies', (b) => ({ v: nombre(b.v), unite: qid(b.unite.value) })],
    ['gentiles', (b) => ({ v: b.v.value })],
    ['habitants', (b) => ({ v: nombre(b.v) })],
    ['culminants', (b) => ({ v: qid(b.sommet.value) })],
  ]) {
    console.log(`SPARQL : ${n} de ${lieux.length} items`);
    await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
    parRequete[n] = declarations(await sparql(req[n].replace('{{lieux}}', valeursLieux)), 'lieu', champ);
  }
  // La capitale (P36) des seuls territoires (lot F3) : celle d'un pays est dans l'extrait des capitales.
  console.log(`SPARQL : capitales de ${territoires.length} territoires`);
  await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
  parRequete.capitales = declarations(await sparql(req.capitales.replace('{{territoires}}', territoires.map((q) => `wd:${q}`).join(' '))), 'lieu', (b) => ({ v: qid(b.ville.value) }));
  const villesIds = [...new Set(Object.values(parRequete.capitales).flat().map((d) => d.v))].sort();
  const sommetsIds = [...new Set(Object.values(parRequete.culminants).flat().map((d) => d.v))].sort();
  const valeursSommets = sommetsIds.map((q) => `wd:${q}`).join(' ');
  console.log(`SPARQL : altitudes de ${sommetsIds.length} sommets`);
  await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
  const altitudes = declarations(await sparql(req.altitudes.replace('{{sommets}}', valeursSommets)), 'sommet', (b) => ({ v: nombre(b.v), unite: qid(b.unite.value) }));
  console.log(`SPARQL : coordonnées de ${sommetsIds.length} sommets`);
  await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
  const coords = declarations(await sparql(req.coordonnees_sommets.replace('{{sommets}}', valeursSommets)), 'sommet', (b) => ({
    v: [Number(b.lon.value), Number(b.lat.value)],
    globe: qid(b.globe.value),
  }));

  // Libellés : sommets (fr, en, titre frwiki), unités et items cités en qualificatif
  // (genre et nombre des gentilés, méthodes…), pour relire l'extrait sans Wikidata ouvert.
  const cites = new Set();
  for (const decl of [...Object.values(parRequete).flatMap((o) => Object.values(o).flat()), ...Object.values(altitudes).flat()]) {
    if (decl.unite) cites.add(decl.unite);
    for (const l of Object.values(decl.q)) for (const v of l) if (/^Q\d+$/.test(v)) cites.add(v);
  }
  const autresQ = [...new Set(Object.values(autres))].sort();
  console.log(`API : libellés de ${sommetsIds.length} sommets, ${villesIds.length} capitales, ${autresQ.length} autres lieux et ${cites.size} items cités`);
  const apiLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ent = await entites([...sommetsIds, ...villesIds, ...autresQ, ...cites], 'labels|sitelinks', 'frwiki');

  const parLieu = {};
  for (const q of lieux) {
    const o = {};
    // Les autres lieux (lot F3) : leur libellé et leur article ; les pays ont les leurs dans l'extrait des capitales.
    if (autresQ.includes(q)) {
      const e = ent[q];
      if (!e || e.missing !== undefined) echec(`${q} : lieu absent de Wikidata`);
      Object.assign(o, { fr: libelle(e, 'fr'), en: libelle(e, 'en'), frwiki: frwiki(e) });
    }
    for (const n of ['superficies', 'gentiles', 'habitants', 'culminants', 'capitales']) if (parRequete[n][q]) o[n] = parRequete[n][q];
    parLieu[q] = o;
  }
  const villes = {};
  for (const q of villesIds) {
    const e = ent[q];
    if (!e || e.missing !== undefined) echec(`${q} : capitale absente de Wikidata`);
    villes[q] = { fr: libelle(e, 'fr'), en: libelle(e, 'en'), frwiki: frwiki(e) };
  }
  const sommets = {};
  for (const q of sommetsIds) {
    const e = ent[q];
    if (!e || e.missing !== undefined) echec(`${q} : sommet absent de Wikidata`);
    sommets[q] = { fr: libelle(e, 'fr'), en: libelle(e, 'en'), frwiki: frwiki(e), altitudes: altitudes[q] ?? [], coordonnees: coords[q] ?? [] };
  }
  const libelles = {};
  for (const q of [...cites].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) libelles[q] = { fr: libelle(ent[q], 'fr'), en: libelle(ent[q], 'en') };

  const objet = (o) => `{\n${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}:${JSON.stringify(x)}`).join(',\n')}\n}`;
  const texte =
    `{\n"extrait_le":${JSON.stringify(extraitLe)},\n"date":${JSON.stringify(date)},\n"api_le":${JSON.stringify(apiLe)},\n` +
    `"requetes_sha256":${JSON.stringify(sha256(texteRequetes))},\n` +
    `"items":${JSON.stringify(`pays : ceux de geodata/wikidata/capitales.json (extrait du ${extrait.extrait_le}) et de geodata/capitales-main.json (items_pays) ; autres : ceux de geodata/fiches-main.json (qid)`)},\n` +
    `"pays":${JSON.stringify(items)},\n` +
    `"autres":${JSON.stringify(autres)},\n` +
    `"lieux":${objet(parLieu)},\n` +
    `"sommets":${objet(sommets)},\n` +
    `"villes":${objet(villes)},\n` +
    `"libelles":${objet(libelles)}\n}\n`;
  await writeFile(EXTRAIT_FICHES, texte);
  const n = (k) => Object.values(parLieu).filter((o) => o[k]).length;
  console.log(
    `${lieux.length} items : superficie ${n('superficies')}, gentilé ${n('gentiles')}, habitants ${n('habitants')}, culminant ${n('culminants')}, capitale ${n('capitales')} ; ` +
      `${sommetsIds.length} sommets, ${villesIds.length} capitales ; ${Math.round((Date.now() - debut) / 1000)} s`,
  );
}

/**
 * Les chiffres des fiches des 50 océans et mers (#34, lot F4) : superficies, profondeurs,
 * pays (P17, P205) tels que Wikidata les déclare, sans rien choisir (la règle est au build,
 * geodata/fiches-mers.mjs) ; pour chaque item cité en pays, ses libellés et sa date de
 * dissolution (P576 : un État disparu est retiré au build). Les items des mers : clé q de
 * geodata/mers.json. Une déclaration : {id, rang, v, unite?, prop?, q: {Pxxx: [valeurs]}}.
 */
async function fichesMers() {
  const debut = Date.now();
  const texteRequetes = await readFile(REQUETES_FICHES_MERS, 'utf8');
  const req = sections(texteRequetes);
  for (const n of ['superficies', 'profondeurs', 'pays', 'etats']) if (!req[n]) echec(`requetes-fiches-mers.rq : section ${n} absente`);
  const table = JSON.parse(await readFile(TABLE_MERS, 'utf8'));
  const mers = Object.fromEntries(table.zones.map((z) => [z.id, z.q]));
  for (const [id, q] of Object.entries(mers)) if (!/^Q\d+$/.test(q ?? '')) echec(`${id} : pas d'item dans geodata/mers.json`);
  const items = [...new Set(Object.values(mers))].sort();
  const valeurs = items.map((q) => `wd:${q}`).join(' ');
  const extraitLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const date = aujourdhui();
  const nombre = (b) => Number(b.value);
  const parRequete = {};
  for (const [n, champ] of [
    ['superficies', (b) => ({ v: nombre(b.v), unite: qid(b.unite.value) })],
    ['profondeurs', (b) => ({ v: nombre(b.v), unite: qid(b.unite.value) })],
    ['pays', (b) => ({ prop: b.prop.value, v: qid(b.pays.value) })],
  ]) {
    console.log(`SPARQL : ${n} de ${items.length} mers`);
    await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
    parRequete[n] = declarations(await sparql(req[n].replace('{{mers}}', valeurs)), 'lieu', champ);
  }
  const etatsIds = [...new Set(Object.values(parRequete.pays).flat().map((d) => d.v))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  console.log(`SPARQL : dissolution de ${etatsIds.length} pays cités`);
  await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
  const fins = new Map();
  for (const b of await sparql(req.etats.replace('{{etats}}', etatsIds.map((q) => `wd:${q}`).join(' ')))) {
    const q = qid(b.etat.value);
    const l = fins.get(q) ?? [];
    if (b.fin && !l.includes(b.fin.value)) l.push(b.fin.value);
    fins.set(q, l);
  }
  // Libellés des pays cités, des unités et des items cités en qualificatif, pour relire l'extrait sans Wikidata ouvert.
  const cites = new Set();
  for (const d of Object.values(parRequete).flatMap((o) => Object.values(o).flat())) {
    if (d.unite) cites.add(d.unite);
    for (const l of Object.values(d.q)) for (const v of l) if (/^Q\d+$/.test(v)) cites.add(v);
  }
  console.log(`API : libellés de ${etatsIds.length} pays et de ${cites.size} items cités`);
  const apiLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ent = await entites([...etatsIds, ...cites], 'labels');
  const parLieu = {};
  for (const q of items) {
    const o = {};
    for (const n of ['superficies', 'profondeurs', 'pays']) if (parRequete[n][q]) o[n] = parRequete[n][q];
    parLieu[q] = o;
  }
  const etats = {};
  for (const q of etatsIds) {
    const e = ent[q];
    if (!e || e.missing !== undefined) echec(`${q} : pays cité absent de Wikidata`);
    etats[q] = { fr: libelle(e, 'fr'), en: libelle(e, 'en'), fin: (fins.get(q) ?? []).sort() };
  }
  const libelles = {};
  for (const q of [...cites].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) libelles[q] = { fr: libelle(ent[q], 'fr'), en: libelle(ent[q], 'en') };
  const objet = (o) => `{\n${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}:${JSON.stringify(x)}`).join(',\n')}\n}`;
  const texte =
    `{\n"extrait_le":${JSON.stringify(extraitLe)},\n"date":${JSON.stringify(date)},\n"api_le":${JSON.stringify(apiLe)},\n` +
    `"requetes_sha256":${JSON.stringify(sha256(texteRequetes))},\n` +
    `"items":${JSON.stringify('ceux de geodata/mers.json (q)')},\n` +
    `"mers":${JSON.stringify(mers)},\n` +
    `"lieux":${objet(parLieu)},\n` +
    `"etats":${objet(etats)},\n` +
    `"libelles":${objet(libelles)}\n}\n`;
  await writeFile(EXTRAIT_FICHES_MERS, texte);
  const n = (k) => Object.values(parLieu).filter((o) => o[k]).length;
  console.log(
    `${items.length} mers : superficie ${n('superficies')}, profondeur ${n('profondeurs')}, pays ${n('pays')} ; ` +
      `${etatsIds.length} pays cités, dont ${Object.values(etats).filter((e) => e.fin.length).length} dissous ; ${Math.round((Date.now() - debut) / 1000)} s`,
  );
}

/**
 * Les textes des fiches des 24 communes de La Réunion (#34, lot F5) : l'item de chaque code
 * INSEE (P374 ; un seul par code, sinon échec), ses gentilés (P1549, en français, avec leurs
 * qualificatifs), son libellé et le titre de son article de la Wikipédia en français, tels que
 * Wikidata les déclare, sans rien choisir (la règle est au build, geodata/fiches-communes.mjs).
 * Une déclaration : {id, rang, v, q: {Pxxx: [valeurs]}}.
 */
async function fichesCommunes() {
  const debut = Date.now();
  const texteRequetes = await readFile(REQUETES_FICHES_COMMUNES, 'utf8');
  const req = sections(texteRequetes);
  for (const n of ['communes', 'gentiles']) if (!req[n]) echec(`requetes-fiches-communes.rq : section ${n} absente`);
  const codes = JSON.parse(await readFile(COMMUNES, 'utf8')).map((c) => c.id).sort();
  const extraitLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const date = aujourdhui();
  console.log(`SPARQL : items de ${codes.length} communes (P374)`);
  const parCode = {};
  for (const b of await sparql(req.communes.replace('{{codes}}', codes.map((c) => JSON.stringify(c)).join(' ')))) {
    const l = (parCode[b.code.value] ??= []);
    const q = qid(b.lieu.value);
    if (!l.includes(q)) l.push(q);
  }
  const communes = {};
  for (const c of codes) {
    const l = parCode[c] ?? [];
    if (l.length !== 1) echec(`${c} : ${l.length} items pour ce code INSEE (${l.join(', ')})`);
    communes[c] = l[0];
  }
  const items = [...new Set(Object.values(communes))].sort();
  console.log(`SPARQL : gentilés de ${items.length} communes`);
  await attendre(Math.max(0, derniereSparql + 2000 - Date.now()));
  const gentiles = declarations(await sparql(req.gentiles.replace('{{communes}}', items.map((q) => `wd:${q}`).join(' '))), 'lieu', (b) => ({ v: b.v.value }));
  // Libellés des items cités en qualificatif (genre et nombre), pour relire l'extrait sans Wikidata ouvert.
  const cites = new Set();
  for (const d of Object.values(gentiles).flat()) for (const l of Object.values(d.q)) for (const v of l) if (/^Q\d+$/.test(v)) cites.add(v);
  console.log(`API : libellés et articles de ${items.length} communes, libellés de ${cites.size} items cités`);
  const apiLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ent = await entites([...items, ...cites], 'labels|sitelinks', 'frwiki');
  const parLieu = {};
  for (const q of items) {
    const e = ent[q];
    if (!e || e.missing !== undefined) echec(`${q} : commune absente de Wikidata`);
    parLieu[q] = { fr: libelle(e, 'fr'), frwiki: frwiki(e), ...(gentiles[q] ? { gentiles: gentiles[q] } : {}) };
  }
  const libelles = {};
  for (const q of [...cites].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) libelles[q] = { fr: libelle(ent[q], 'fr'), en: libelle(ent[q], 'en') };
  const objet = (o) => `{\n${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}:${JSON.stringify(x)}`).join(',\n')}\n}`;
  const texte =
    `{\n"extrait_le":${JSON.stringify(extraitLe)},\n"date":${JSON.stringify(date)},\n"api_le":${JSON.stringify(apiLe)},\n` +
    `"requetes_sha256":${JSON.stringify(sha256(texteRequetes))},\n` +
    `"items":${JSON.stringify('par le code INSEE (P374) des communes de public/geo/reunion/communes.json')},\n` +
    `"communes":${JSON.stringify(communes)},\n` +
    `"lieux":${objet(parLieu)},\n` +
    `"libelles":${objet(libelles)}\n}\n`;
  await writeFile(EXTRAIT_FICHES_COMMUNES, texte);
  const n = Object.values(parLieu).filter((o) => o.gentiles).length;
  console.log(`${items.length} communes : gentilé ${n}, article ${Object.values(parLieu).filter((o) => o.frwiki).length} ; ${Math.round((Date.now() - debut) / 1000)} s`);
}

if (process.argv.includes('--notoriete')) await notorietePays();
else if (process.argv.includes('--fiches-communes')) await fichesCommunes();
else if (process.argv.includes('--fiches-mers')) await fichesMers();
else if (process.argv.includes('--fiches')) await fichesPays();
else await main();
