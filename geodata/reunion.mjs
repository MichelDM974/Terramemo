#!/usr/bin/env node
// Construit les données de La Réunion versionnées dans public/geo/reunion/ :
//   communes.topo.json  topologie TopoJSON (objet « communes », propriété id seule)
//   communes.json       attributs de chaque commune (forme de pays.json : superficie,
//                       point, bbox, voisins…)
//   noms.fr.json        { code INSEE: nom }
//   sources.json        source, édition, date de mise à jour, licence, empreintes
//
// Usage : npm run geodata:reunion [-- --maj-empreintes]
// Mêmes règles que build.mjs : la source est téléchargée dans geodata/raw/ign/ (ignoré
// par git) puis vérifiée par SHA-256 contre geodata/reunion.lock.json ; le script refuse
// une empreinte différente, sauf avec --maj-empreintes qui réécrit le verrou. Sans réseau
// si raw/ est rempli. Deux lancements donnent des fichiers identiques octet pour octet.
// Il demande 7z (p7zip) et Node 24 (node:sqlite) ; la CI n'en a pas besoin : les sorties
// sont versionnées et tests/donnees-reunion.test.ts ne lit qu'elles et le verrou.
// Verrou à part de sources.lock.json : build.mjs --maj-empreintes réécrit celui-là avec
// ses seules sources et effacerait la clé de l'IGN.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { geoArea, geoContains } from 'd3-geo';
import mapshaper from 'mapshaper';
import { feature, neighbors } from 'topojson-client';
import {
  arrondi,
  aujourdhui,
  emprise,
  km2,
  lireGeometrieGpkg,
  pointInterieur,
  polygones,
  sha256,
  utmSudVersWgs84,
} from './outils.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(RACINE, 'geodata', 'raw');
const VERROU = join(RACINE, 'geodata', 'reunion.lock.json');
const OUTILS = join(RACINE, 'geodata', 'outils.mjs');
const SORTIE = join(RACINE, 'public', 'geo', 'reunion');

// --- Source ---------------------------------------------------------------------

// ADMIN EXPRESS COG CARTO (version généralisée : 19 067 sommets pour les 24 communes,
// cinq fois moins que le COG complet, qui n'apporterait rien à 384 px de large), archive
// du territoire REU. L'édition 2026 n'existe qu'en GeoPackage (le shapefile s'arrête à
// la 3.2 de 2024), que mapshaper ne lit pas : lecture par node:sqlite et un décodeur WKB
// (outils.mjs). Coordonnées en RGR92 / UTM 40S (EPSG:2975), reprojetées par mapshaper.
// Les dates sont relues dans les métadonnées ISO de l'archive (échec si elles diffèrent) :
// la Licence Ouverte 2.0 demande la source (au moins le concédant) et la date de
// dernière mise à jour, que l'appli affiche.
const NOM_ARCHIVE = 'ADMIN-EXPRESS-COG-CARTO_4-0__GPKG_RGR92UTM40S_REU_2026-01-01';
const SOURCE = {
  cle: 'ign-admin-express',
  nom: 'IGN, ADMIN EXPRESS COG CARTO 4.0, communes de La Réunion (territoire REU)',
  url: 'https://data.geopf.fr/telechargement/resource/ADMIN-EXPRESS-COG-CARTO',
  concedant: 'IGN (Institut national de l’information géographique et forestière)',
  edition: '2026-01-01', // editionDate des métadonnées : COG de l'INSEE au 1er janvier
  mise_a_jour: '2026-06-30', // date de création (« traitement du … ») des métadonnées
  licence: 'Licence Ouverte 2.0 (Etalab) : mention de la source (IGN) et de la date de dernière mise à jour',
  fichiers: [
    {
      chemin: `ign/${NOM_ARCHIVE}.7z`,
      url: `https://data.geopf.fr/telechargement/download/ADMIN-EXPRESS-COG-CARTO/${NOM_ARCHIVE}/${NOM_ARCHIVE}.7z`,
    },
  ],
  table: 'commune',
  champs: { id: 'code_insee', departement: 'code_insee_du_departement', nom: 'nom_officiel', geometrie: 'geometrie' },
  // Chef-lieu de chaque commune (mairie) : contrôle de la reprojection et de la
  // simplification, il doit tomber dans sa commune.
  chefs_lieux: { table: 'chef_lieu_de_commune', id: 'code_insee_de_la_commune' },
  departement: '974',
  srs: 2975, // RGR92 / UTM zone 40S
  zone_utm: 40,
};
const N_COMMUNES = 24;

// Emprise de l'île (garde-fou de la reprojection) : un point dehors, c'est une
// projection fausse ou des axes inversés.
const ILE = { ouest: 55.1, est: 56.0, sud: -21.5, nord: -20.8 };

// Simplification : Douglas-Peucker, qui borne l'écart au tracé de l'IGN à 40 m ≈ 2 px au
// zoom 8 de l'île, 0,2 px au zoom 1 (5,6 px/km sur le téléphone) ; contrôlé sur chaque
// sommet source (ECART_SIMPLIFICATION_M). Visvalingam (interval = seuil d'aire, pas
// d'écart) s'en éloignait de 191 m sur la côte (jetée de Saint-Pierre) et de 74 m sur
// une frontière. Topologie d'un seul calque : les frontières sont des arcs partagés,
// donc ni trou ni recouvrement entre communes.
const SIMPLIFICATION = 'dp interval=40 keep-shapes';
// Écart maximal toléré d'un sommet source au tracé simplifié : 40 m, plus la quantification.
const ECART_SIMPLIFICATION_M = 41;
const QUANTIFICATION = 1e5; // ≈ 0,7 m sur l'emprise de l'île
// Écart toléré entre la reprojection de mapshaper et la série de Krüger (outils.mjs).
const ECART_PROJECTION_M = 0.01;

// --- Outils -------------------------------------------------------------------------

function echec(message) {
  console.error(`geodata:reunion : ${message}`);
  process.exit(1);
}

/**
 * Plus grand écart (m) d'un sommet des polygones source au contour simplifié de la même
 * commune (tous ses anneaux), dans un repère métrique local (cos de la latitude moyenne :
 * moins de 0,1 m d'erreur sur l'île).
 */
function ecartSimplification(polysSource, formeSimplifiee) {
  const g = formeSimplifiee.geometry;
  const anneaux = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
  const M = 111_195;
  const cosLat = Math.cos((-21.1 * Math.PI) / 180);
  const xy = ([lon, lat]) => [lon * cosLat * M, lat * M];
  const segments = [];
  for (const a of anneaux) for (let i = 1; i < a.length; i++) segments.push([xy(a[i - 1]), xy(a[i])]);
  let max = 0;
  let ou = null;
  for (const p of polysSource)
    for (const r of p)
      for (const s of r) {
        const [px, py] = xy(s);
        let d = Infinity;
        for (const [[ax, ay], [bx, by]] of segments) {
          const dx = bx - ax;
          const dy = by - ay;
          const l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
          d = Math.min(d, Math.hypot(px - ax - t * dx, py - ay - t * dy));
          if (d === 0) break;
        }
        if (d > max) {
          max = d;
          ou = s;
        }
      }
  return { max, ou };
}

async function lireJson(chemin) {
  return JSON.parse(await readFile(chemin, 'utf8'));
}

const poids = {};
async function ecrire(nom, contenu) {
  await writeFile(join(SORTIE, nom), contenu);
  const brut = Buffer.byteLength(contenu);
  const gz = gzipSync(contenu).length;
  poids[nom] = gz;
  console.log(`  ${nom.padEnd(18)} ${(brut / 1024).toFixed(1).padStart(8)} Ko  gzip ${(gz / 1024).toFixed(1).padStart(7)} Ko`);
}

// L'API de la Géoplateforme limite à une requête par seconde (en-tête ratelimit).
let derniereRequete = 0;
async function telecharger(url) {
  const attente = derniereRequete + 1000 - Date.now();
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  derniereRequete = Date.now();
  const rep = await fetch(url);
  if (!rep.ok) echec(`${url} : HTTP ${rep.status}`);
  return Buffer.from(await rep.arrayBuffer());
}

// --- 1. Source et verrou --------------------------------------------------------------

async function verifierSource(majEmpreintes) {
  const verrou = existsSync(VERROU) ? await lireJson(VERROU) : {};
  const ancien = verrou[SOURCE.cle] ?? { fichiers: {} };
  const empreintes = {};
  for (const { chemin, url } of SOURCE.fichiers) {
    const local = join(RAW, chemin);
    if (!existsSync(local)) {
      console.log(`  téléchargement ${url}`);
      const contenu = await telecharger(url);
      await mkdir(dirname(local), { recursive: true });
      await writeFile(local, contenu);
    }
    const h = sha256(await readFile(local));
    const attendu = ancien.fichiers?.[chemin];
    if (!majEmpreintes && attendu !== h) {
      echec(
        attendu
          ? `empreinte différente pour ${chemin} (attendu ${attendu}, lu ${h}) ; ` +
              `supprimer geodata/raw/${chemin} pour le retélécharger, ou --maj-empreintes si la source a vraiment changé`
          : `aucune empreinte pour ${chemin} dans reunion.lock.json ; lancer avec --maj-empreintes`,
      );
    }
    empreintes[chemin] = h;
  }
  const meme =
    ancien.telecharge_le &&
    Object.keys(empreintes).length === Object.keys(ancien.fichiers ?? {}).length &&
    Object.entries(empreintes).every(([c, h]) => ancien.fichiers[c] === h);
  const nouveau = { [SOURCE.cle]: { telecharge_le: meme ? ancien.telecharge_le : aujourdhui(), fichiers: empreintes } };
  if (majEmpreintes && JSON.stringify(verrou) !== JSON.stringify(nouveau)) {
    await writeFile(VERROU, JSON.stringify(nouveau, null, 2) + '\n');
    console.log('  reunion.lock.json réécrit');
  }
  return nouveau[SOURCE.cle];
}

// --- 2. Lecture de l'archive ------------------------------------------------------------

/**
 * Extrait l'archive dans un dossier temporaire (supprimé à la sortie) et rend le GeoPackage et
 * les métadonnées ISO. Les dossiers internes portent le numéro de commande de l'IGN
 * (1_DONNEES_LIVRAISON_2026-06-00516…) : fichiers trouvés par recherche, pas en dur.
 */
function extraire(archive) {
  const dossier = mkdtempSync(join(tmpdir(), 'terramemo-reunion-'));
  // echec() sort par process.exit, qui saute les finally : le ménage se fait à la sortie.
  process.on('exit', () => rmSync(dossier, { recursive: true, force: true }));
  execFileSync('7z', ['x', '-y', `-o${dossier}`, archive], { stdio: ['ignore', 'ignore', 'inherit'] });
  const fichiers = readdirSync(dossier, { recursive: true }).map(String);
  const unique = (motif, quoi) => {
    const t = fichiers.filter((f) => motif.test(f));
    if (t.length !== 1) echec(`archive : ${t.length} ${quoi} au lieu d'un (${t.join(', ')})`);
    return join(dossier, t[0]);
  };
  return {
    gpkg: unique(/1_DONNEES_LIVRAISON[^/]*\/.*\.gpkg$/, 'GeoPackage'),
    meta: unique(/2_METADONNEES_LIVRAISON[^/]*\/.*\.xml$/, 'fichier de métadonnées XML'),
  };
}

/** Dates et licence relues dans les métadonnées ISO 19115 de la livraison. */
function lireMetadonnees(xml) {
  const edition = /<gmd:editionDate>\s*<gco:Date>(\d{4}-\d{2}-\d{2})<\/gco:Date>/.exec(xml)?.[1];
  // Première date de la citation de la ressource, de type « creation » : la date du
  // traitement IGN (la dernière mise à jour des données), redite dans le titre.
  const creation =
    /<gmd:CI_Date>\s*<gmd:date>\s*<gco:Date>(\d{4}-\d{2}-\d{2})<\/gco:Date>\s*<\/gmd:date>\s*<gmd:dateType>\s*<gmd:CI_DateTypeCode[^>]*codeListValue="creation"/.exec(
      xml,
    )?.[1];
  const titre = /traitement du (\d{4}-\d{2}-\d{2})/.exec(xml)?.[1];
  if (!edition || !creation) echec('métadonnées : editionDate ou date de création introuvable');
  if (titre !== creation) echec(`métadonnées : traitement du ${titre} ≠ date de création ${creation}`);
  if (!/licence ouverte/i.test(xml)) echec('métadonnées : la Licence Ouverte n’y est plus citée, relire les conditions');
  return { edition, mise_a_jour: creation };
}

function lireGpkg(chemin) {
  const db = new DatabaseSync(chemin, { readOnly: true });
  try {
    const { table, champs, chefs_lieux: cl } = SOURCE;
    for (const t of [table, cl.table]) {
      const col = db.prepare('SELECT srs_id, z, m FROM gpkg_geometry_columns WHERE table_name = ?').get(t);
      if (!col || col.srs_id !== SOURCE.srs || col.z !== 0 || col.m !== 0) {
        echec(`GeoPackage : ${t} en ${col?.srs_id} (z ${col?.z}, m ${col?.m}), attendu EPSG:${SOURCE.srs} en 2D`);
      }
    }
    const lignes = db
      .prepare(
        `SELECT ${champs.id} AS id, ${champs.nom} AS nom, ${champs.geometrie} AS g FROM ${table} ` +
          `WHERE ${champs.departement} = ? ORDER BY ${champs.id}`,
      )
      .all(SOURCE.departement);
    const lieux = db.prepare(`SELECT ${cl.id} AS id, geometrie AS g FROM ${cl.table} ORDER BY ${cl.id}`).all();
    const geom = (l) => {
      const g = lireGeometrieGpkg(l.g);
      if (!g) echec(`${l.id} : géométrie vide`);
      if (g.srs !== SOURCE.srs) echec(`${l.id} : géométrie en ${g.srs}`);
      return g;
    };
    return {
      communes: lignes.map((l) => ({ id: String(l.id), nom: String(l.nom), utm: geom(l) })),
      chefsLieux: new Map(lieux.map((l) => [String(l.id), geom(l)])),
    };
  } finally {
    db.close();
  }
}

// --- 3. Reprojection --------------------------------------------------------------------

const polysDe = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/**
 * RGR92 / UTM 40S → WGS84 : chaque sommet est reprojeté par mapshaper (proj4), puis
 * contrôlé par la série de Krüger d'outils.mjs (deux calculs indépendants) et par
 * l'emprise de l'île. Les sommets partent en une liste de points (MultiPoint, ordre
 * gardé) et reprennent leur place dans la géométrie lue : rien n'est réordonné,
 * retourné ni nettoyé à ce stade, les sommets communs à deux communes restent égaux.
 */
async function reprojeter(communes) {
  const sommets = communes.flatMap((c) => polysDe(c.utm).flat(2));
  const sortie = await mapshaper.applyCommands(
    `-i utm.json -proj from=EPSG:${SOURCE.srs} wgs84 -o wgs84.json format=geojson`,
    { 'utm.json': JSON.stringify({ type: 'MultiPoint', coordinates: sommets }) },
  );
  const g = JSON.parse(String(sortie['wgs84.json']));
  const lus = (g.geometries ?? [g])[0]?.coordinates ?? [];
  if (lus.length !== sommets.length) echec(`reprojection : ${lus.length} sommets sur ${sommets.length}`);
  let ecartMax = 0;
  lus.forEach(([lon, lat], i) => {
    if (!(lon >= ILE.ouest && lon <= ILE.est && lat >= ILE.sud && lat <= ILE.nord)) {
      echec(`point [${lon}, ${lat}] hors de l'emprise de l'île (projection ou ordre des axes faux)`);
    }
    const [x, y] = utmSudVersWgs84(sommets[i], SOURCE.zone_utm);
    ecartMax = Math.max(ecartMax, Math.hypot((lon - x) * Math.cos((lat * Math.PI) / 180), lat - y) * 111_195);
  });
  if (!(ecartMax <= ECART_PROJECTION_M)) echec(`reprojection : écart de ${ecartMax} m avec la série de Krüger`);
  console.log(`  ${sommets.length} sommets, écart maximal mapshaper / Krüger : ${(ecartMax * 1000).toFixed(4)} mm`);
  let k = 0;
  for (const c of communes) {
    const polys = polysDe(c.utm).map((p) => p.map((r) => r.map(() => lus[k++])));
    c.geometrie = { type: 'MultiPolygon', coordinates: polys };
  }
}

// --- Programme ------------------------------------------------------------------------

async function main() {
  const majEmpreintes = process.argv.includes('--maj-empreintes');
  console.log('Source');
  const verrou = await verifierSource(majEmpreintes);

  console.log('Lecture');
  const { gpkg, meta } = extraire(join(RAW, SOURCE.fichiers[0].chemin));
  const dates = lireMetadonnees(await readFile(meta, 'utf8'));
  const { communes, chefsLieux } = lireGpkg(gpkg);
  for (const k of ['edition', 'mise_a_jour']) {
    if (dates[k] !== SOURCE[k]) echec(`métadonnées : ${k} ${dates[k]}, SOURCE dit ${SOURCE[k]} (mettre SOURCE à jour)`);
  }
  console.log(`  édition ${dates.edition}, mise à jour ${dates.mise_a_jour}`);

  // 24 communes exactement, codes INSEE 97401 à 97424.
  const attendus = Array.from({ length: N_COMMUNES }, (_, i) => `974${String(i + 1).padStart(2, '0')}`);
  const ids = communes.map((c) => c.id);
  if (JSON.stringify(ids) !== JSON.stringify(attendus)) echec(`communes : ${ids.join(', ')} au lieu de 97401…97424`);
  for (const id of ids) if (!chefsLieux.has(id)) echec(`${id} sans chef-lieu`);

  console.log('Reprojection');
  await reprojeter(communes);

  // Attributs calculés sur la géométrie non simplifiée, dans le sens de d3.
  for (const c of communes) {
    c.polys = polygones(c.geometrie);
    if (c.polys.length === 0) echec(`${c.id} : géométrie vide`);
    c.trous = c.polys.reduce((s, p) => s + p.length - 1, 0);
    const aires = c.polys.map((poly) => km2(geoArea({ type: 'Polygon', coordinates: poly })));
    let iMax = 0;
    aires.forEach((a, i) => {
      if (a > (aires[iMax] ?? 0)) iMax = i;
    });
    c.superficie = aires.reduce((s, a) => s + a, 0);
    c.partieMax = aires[iMax];
    c.aires = aires;
    c.point = pointInterieur(c.polys[iMax]);
    c.bbox = emprise(c.polys);
    c.geojson = {
      type: 'Feature',
      properties: { id: c.id },
      geometry: c.polys.length === 1 ? { type: 'Polygon', coordinates: c.polys[0] } : { type: 'MultiPolygon', coordinates: c.polys },
    };
    if (geoArea(c.geojson) > 0.001) echec(`${c.id} : forme retournée (aire ${geoArea(c.geojson)} sr)`);
    c.chefLieu = utmSudVersWgs84(chefsLieux.get(c.id).coordinates, SOURCE.zone_utm);
    if (!geoContains(c.geojson, c.chefLieu)) echec(`${c.id} : chef-lieu ${c.chefLieu} hors de la commune`);
  }

  // --- Simplification et topologie (mapshaper) ---
  // Un seul calque, une entité par commune : les frontières sont des arcs partagés,
  // simplifiés une fois pour les deux communes, sans trou ni recouvrement. keep-shapes
  // protège le plus grand anneau de chaque commune ; les îlots de Petite-Île et de
  // Saint-Paul n'en sont pas, d'où le compte des polygones plus bas (à 40 m, ils restent :
  // gardés, un toucher dessus compte pour leur commune).
  console.log('Simplification');
  const sortie = await mapshaper.applyCommands(
    `-i communes.json -simplify ${SIMPLIFICATION} -o communes.topo.json format=topojson quantization=${QUANTIFICATION}`,
    { 'communes.json': JSON.stringify({ type: 'FeatureCollection', features: communes.map((c) => c.geojson) }) },
  );
  const topo = JSON.parse(String(sortie['communes.topo.json']));
  const geoms = topo.objects.communes?.geometries;
  if (!geoms) echec('objet communes absent de la topologie');
  if (JSON.stringify(geoms.map((g) => g.properties?.id)) !== JSON.stringify(ids)) echec('topologie : ids ou ordre changés');
  const formes = feature(topo, topo.objects.communes).features;
  const perdus = [];
  communes.forEach((c, i) => {
    const g = formes[i].geometry;
    const n = g ? polysDe(g).length : 0;
    // Un îlot perdu à la simplification est noté (sous 0,1 km², ce n'est pas une cible) ;
    // une partie plus grande perdue est un échec.
    if (n !== c.polys.length) {
      const petits = c.aires.filter((a) => a < 0.1).length;
      if (c.polys.length - n > petits) echec(`${c.id} : ${n} polygones après simplification sur ${c.polys.length}`);
      perdus.push(`${c.id} : ${c.polys.length - n} îlot(s) de moins de 0,1 km² perdu(s)`);
    }
    if (!g || geoArea(formes[i]) > 0.001) echec(`${c.id} : forme simplifiée vide ou retournée`);
    if (!geoContains(formes[i], c.chefLieu)) echec(`${c.id} : chef-lieu hors de la forme simplifiée`);
    if (!geoContains(formes[i], c.point)) echec(`${c.id} : point d'étiquette hors de la forme simplifiée`);
  });
  for (const p of perdus) console.log(`  note : ${p}`);
  let ecart = { max: 0, id: '' };
  communes.forEach((c, i) => {
    const e = ecartSimplification(c.polys, formes[i]);
    if (e.max > ECART_SIMPLIFICATION_M) echec(`${c.id} : sommet ${e.ou} à ${e.max.toFixed(1)} m du tracé simplifié`);
    if (e.max > ecart.max) ecart = { max: e.max, id: c.id };
  });
  console.log(`  écart maximal au tracé de l'IGN : ${ecart.max.toFixed(1)} m (${ecart.id})`);

  // Voisins sur la topologie finale (arcs partagés).
  const voisins = neighbors(geoms);
  communes.forEach((c, i) => {
    c.voisins = (voisins[i] ?? []).map((j) => geoms[j].properties.id).sort();
    if (c.voisins.length === 0) echec(`${c.id} sans voisin`);
  });

  // --- Écriture ---
  console.log('Écriture');
  await mkdir(SORTIE, { recursive: true });
  await ecrire('communes.topo.json', JSON.stringify(topo));

  // statut et micro fixes : toutes les communes se jouent, et le seuil des micro-États
  // (1 000 km²) donnerait une pastille à presque toutes (la carte de l'île n'en a pas).
  const lignes = communes.map((c) =>
    JSON.stringify({
      id: c.id,
      statut: 'jouable',
      superficie_km2: arrondi(c.superficie, 2),
      partie_max_km2: arrondi(c.partieMax, 2),
      point: c.point,
      bbox: c.bbox,
      micro: false,
      voisins: c.voisins,
    }),
  );
  await ecrire('communes.json', `[\n${lignes.join(',\n')}\n]\n`);

  // Apostrophe typographique, comme les noms CLDR du monde (« L’Étang-Salé ») ;
  // normaliser() (src/texte.ts) rend les deux équivalentes pour la saisie.
  const noms = Object.fromEntries(communes.map((c) => [c.id, c.nom.normalize('NFC').replaceAll("'", '’')]));
  await ecrire('noms.fr.json', JSON.stringify(noms, null, 1) + '\n');

  const metaSources = {
    sources: [
      {
        nom: SOURCE.nom,
        url: SOURCE.url,
        version: SOURCE.edition,
        edition: SOURCE.edition,
        mise_a_jour: SOURCE.mise_a_jour,
        concedant: SOURCE.concedant,
        licence: SOURCE.licence,
        telecharge_le: verrou.telecharge_le,
        fichiers: SOURCE.fichiers.map((f) => ({ url: f.url, sha256: verrou.fichiers[f.chemin] })),
      },
    ],
    traitement: {
      outil: 'mapshaper 0.6.110',
      lecture: `GeoPackage lu par node:sqlite (table ${SOURCE.table}, ${SOURCE.champs.id}, ${SOURCE.champs.nom}), WKB décodé par geodata/outils.mjs`,
      projection:
        `EPSG:${SOURCE.srs} (RGR92 / UTM 40S) → WGS84 par mapshaper -proj, contrôlée sur chaque sommet par la série de ` +
        `Krüger (écart toléré ${ECART_PROJECTION_M * 1000} mm) et par le chef-lieu de chaque commune`,
      simplification:
        `-simplify ${SIMPLIFICATION} (Douglas-Peucker : écart au tracé de l'IGN borné à 40 m, ` +
        `${ecart.max.toFixed(1)} m mesurés sur les sommets source), un seul calque (frontières en arcs partagés)` +
        (perdus.length ? ` ; ${perdus.join(' ; ')}` : ' ; aucun polygone perdu'),
      quantification: QUANTIFICATION,
      noms: 'nom_officiel de l’IGN, apostrophe droite remplacée par l’apostrophe typographique',
      superficies:
        'aire de la géométrie IGN de fait, pas la superficie officielle : géodésique, d3-geo geoArea × R², ' +
        'R = 6371.0088 km, sur la géométrie non simplifiée. superficie_cadastrale (en hectares) n’est pas reprise : ' +
        'elle s’écarte du tracé (Entre-Deux 66,8 km² cadastraux contre 51,6 tracés, Le Tampon 165,4 contre 181,7)',
      // Poids compressés des sorties (sauf ce fichier) au dernier lancement, pour suivre
      // la cible de la conception (topologie ≤ 25 Ko).
      poids_gzip_octets: { ...poids },
      // Empreintes des scripts : tests/donnees-reunion.test.ts les compare aux fichiers,
      // la CI échoue donc si l'on change un script sans relancer.
      entrees: {
        'geodata/reunion.mjs': sha256(await readFile(fileURLToPath(import.meta.url))),
        'geodata/outils.mjs': sha256(await readFile(OUTILS)),
      },
    },
  };
  await ecrire('sources.json', JSON.stringify(metaSources, null, 2) + '\n');

  const total = communes.reduce((s, c) => s + c.superficie, 0);
  console.log(`Communes : ${communes.length}, ${total.toFixed(1)} km², trous ${communes.reduce((s, c) => s + c.trous, 0)}`);
}

await main();
