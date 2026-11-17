#!/usr/bin/env node
// Construit les données géographiques versionnées dans public/geo/ :
//   monde.topo.json  topologie TopoJSON (objets « pays » et « contestees », propriété id seule)
//   monde-leger.topo.json  la même, allégée : la carte Canvas pendant un geste (mêmes ids)
//   pays.json        attributs de chaque entité (statut, superficie, point, bbox, voisins,
//                    revendique_par et note_ne des entités contestées…)
//   contestees.json  zones contestées dessinées hachurées par-dessus les pays
//   noms.<langue>.json  { id: nom } pour chaque entité et chaque zone contestée
//   sources.json     sources, versions, licences, dates et empreintes
//   LICENSE-CLDR.txt texte de la Unicode License v3, qui doit accompagner noms.<langue>.json
//   capitales.json, capitales.fr.json  capitales des pays (geodata/capitales.mjs, étude J2 § 2.1),
//                    tirées d'un extrait figé de Wikidata (npm run wikidata) et d'une table à la main
//   drapeaux/<sha8>.svg, drapeaux.json, drapeaux-proches.json, licences/flag-icons.txt  drapeaux des pays
//                    (geodata/drapeaux.mjs, étude J2 § 2.2), tirés de flag-icons et d'une table à la main
//   mers.topo.json, mers-leger.topo.json, mers.json, mers.fr.json  océans et mers
//                    (geodata/mers.mjs, étude J2 § 2.3), tirés de la couche marine de Natural
//                    Earth et d'une table à la main ; témoin geodata/mers-affectations.json
//   notoriete.json   niveaux de notoriété des lieux du quiz (geodata/notoriete.mjs, étude J2
//                    § 2.4, D48 b), tirés des extraits figés de Wikidata et d'une table à la main
//   fiches-monde.json, fiches-monde.fr.json  fiches des lieux du monde (geodata/fiches.mjs, #34,
//                    étude fiche-lieu § 2), tirées de pays.json, des extraits figés (capitales,
//                    Wikidata, Banque mondiale), de CLDR, de tz et d'une table à la main ;
//                    et hors de public/, docs/relectures/fiches-pays.md, les tableaux à relire
//
// Usage : npm run geodata [-- --maj-empreintes] [-- --seulement capitales|drapeaux|mers|notoriete|fiches]
// --seulement capitales ne refait que les capitales (sans source ni mapshaper : il lit
// pays.json et noms.fr.json déjà construits) et leur part de sources.json ; --seulement
// drapeaux, les drapeaux (avec leurs seules sources, et pays.json) ; --seulement mers, les
// mers (la source Natural Earth vérifiée, sans --maj-empreintes : c'est celle des pays) ;
// --seulement notoriete, la notoriété (sans source : elle lit pays.json et capitales.json
// déjà construits) ; --seulement fiches (npm run fiches), les fiches des lieux (avec leurs
// seules sources, geodata/fiches-sources.mjs, et pays.json déjà construit) ; tout le build
// donne les mêmes fichiers.
// Les sources sont téléchargées dans geodata/raw/ (ignoré par git) puis vérifiées par
// SHA-256 contre geodata/sources.lock.json ; le script refuse une empreinte différente,
// sauf avec --maj-empreintes qui réécrit le verrou. Sans réseau si raw/ est rempli.
// Deux lancements donnent des fichiers identiques octet pour octet.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { geoArea, geoContains, geoDistance } from 'd3-geo';
import mapshaper from 'mapshaper';
import { feature, neighbors } from 'topojson-client';
import { construireCapitales, fusionnerSources } from './capitales.mjs';
import { construireDrapeaux, SOURCES_DRAPEAUX } from './drapeaux.mjs';
import { construireMers, fusionnerMers, NE_MERS } from './mers.mjs';
import { construireFiches } from './fiches.mjs';
import { SOURCES_FICHES } from './fiches-sources.mjs';
import { construireNotoriete } from './notoriete.mjs';
import { arrondi, aujourdhui, emprise, fusionnerPartie, km2, pointInterieur, polygones, R_TERRE_KM, sha256 } from './outils.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(RACINE, 'geodata', 'raw');
const VERROU = join(RACINE, 'geodata', 'sources.lock.json');
const LISTE = join(RACINE, 'geodata', 'liste.json');
const TEMOIN = join(RACINE, 'geodata', 'temoin-polygones.json');
const REVENDICATIONS_ZONES = join(RACINE, 'geodata', 'revendications.json');
const SORTIE = join(RACINE, 'public', 'geo');

// Langues des fichiers de noms (décision « Langue » : l'anglais s'ajoutera ici).
const LANGUES = ['fr'];

// Plus grand polygone sous ce seuil : micro-État, disque toujours dessiné. 2 000 km²
// depuis la décision « Cadrage et disques en séance » (06/11/2026) : Comores, Samoa et
// Maurice, archipels lointains qui ne passent 4 px à l'écran qu'au-delà du zoom 8.
const SEUIL_MICRO_KM2 = 2000;
const SIMPLIFICATION = 'visvalingam interval=2000 keep-shapes'; // 2 km
const QUANTIFICATION = 1e6;
// Carte allégée du rendu Canvas, tracée à chaque image pendant un geste (la complète
// au repos). Au zoom 1 du téléphone, 1 px vaut ~100 km : 15 km n'y change rien.
// Simplifiée d'un bloc par entité, elle perdait les îles sous la tolérance (573
// polygones gardés sur 4 274 : le Canada arctique, l'Indonésie, les Maldives
// disparaissaient pendant le geste). Elle ne garde donc que les polygones d'au moins
// ILE_LEGERE_KM (plus grand côté de l'emprise, etendueKm), chacun simplifié à part
// comme pour la complète (keep-shapes le garde au pire en triangle) ; le rendu
// reprend les plus petits dans la carte complète (carte-canvas.ts, ILE_LEGERE_KM =
// 50 : 10 km de recouvrement). Tous gardés, elle pesait 119 Ko compressés au lieu de 52.
const SIMPLIFICATION_LEGERE = process.env.LEGER ?? 'visvalingam interval=15000 keep-shapes';
const QUANTIFICATION_LEGERE = 1e5;
const ILE_LEGERE_KM = 40;

// --- Sources ----------------------------------------------------------------

const NE_TAG = 'v5.1.2';
const NE_COMMIT = 'f1890d9f152c896d250a77557a5751a93d494776';
const NE_RACINE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/`;
const NE_BASE = `${NE_RACINE}10m_cultural/`;
// La couche marine (geodata/mers.mjs) est dans 10m_physical/, même tag et même commit.
const NE_BASE_PHYSIQUE = `${NE_RACINE}10m_physical/`;
const NE_PAYS = 'ne_10m_admin_0_countries';
const NE_CONTESTEES = 'ne_10m_admin_0_disputed_areas';
const NE_EXTENSIONS = ['shp', 'shx', 'dbf', 'prj', 'cpg'];

const CLDR_TAG = '49.0.0';
const CLDR_COMMIT = 'a4b67247b446fd51b475991017a2481911210c60';
const CLDR_RACINE = `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_TAG}/`;
const CLDR_BASE = `${CLDR_RACINE}cldr-json/cldr-localenames-full/main/`;

// User-Agent générique, comme npm run wikidata : Wikimedia refuse les clients anonymes.
const UA = 'Terramemo-geodata/1.0 (+https://terramemo-geo.web.app)';

const SOURCES = [
  {
    cle: 'natural-earth',
    nom: 'Natural Earth, Admin 0 – Countries, Admin 0 – Breakaway, Disputed Areas et Marine Areas (geography_marine_polys) (1:10m)',
    url: 'https://github.com/nvkelso/natural-earth-vector',
    version: `${NE_TAG} (commit ${NE_COMMIT})`,
    licence: 'Domaine public (https://www.naturalearthdata.com/about/terms-of-use/), mention facultative « Made with Natural Earth »',
    fichiers: [
      [NE_PAYS, NE_BASE],
      [NE_CONTESTEES, NE_BASE],
      [NE_MERS, NE_BASE_PHYSIQUE],
    ].flatMap(([base, dossier]) =>
      NE_EXTENSIONS.map((ext) => ({
        chemin: `natural-earth/${base}.${ext}`,
        url: `${dossier}${base}.${ext}`,
      })),
    ),
  },
  {
    cle: 'cldr',
    nom: 'Unicode CLDR, noms des territoires (cldr-localenames-full)',
    url: 'https://github.com/unicode-org/cldr-json',
    version: `${CLDR_TAG} (commit ${CLDR_COMMIT})`,
    licence:
      'Unicode License v3, notice : « Copyright © 2015-2024 Unicode, Inc. » ; texte complet (notice de copyright ' +
      'et de permission, à joindre aux noms dérivés de CLDR) dans LICENSE-CLDR.txt, à côté de ce fichier',
    fichiers: [
      ...LANGUES.map((l) => ({
        chemin: `cldr/${l}/territories.json`,
        url: `${CLDR_BASE}${l}/territories.json`,
      })),
      { chemin: 'cldr/LICENSE', url: `${CLDR_RACINE}LICENSE` },
    ],
  },
];

// Toutes les sources téléchargées et verrouillées ; celles des drapeaux et des fiches ont
// leur part de sources.json écrite par geodata/drapeaux.mjs et geodata/fiches.mjs.
const TELECHARGEES = [...SOURCES, ...SOURCES_DRAPEAUX, ...SOURCES_FICHES];

// --- Tables d'exceptions (tout écart à une règle est écrit ici) --------------

// Identifiant maison quand la règle ISO_A3 → ISO_A3_EH → NE_<ADM0_A3> ne convient pas.
const ID_EXCEPTIONS = { KOS: 'XKX' };

// Statut imposé, avant la règle générale.
const STATUT_EXCEPTIONS = { ATA: 'autre' };

// Continent et sous-région quand NE dit « Seven seas (open ocean) » : classement M49 de
// l'ONU (Maurice et les Seychelles en Afrique de l'Est, les Maldives en Asie du Sud…).
const REGION_EXCEPTIONS = {
  ATF: ['Africa', 'Eastern Africa'],
  CLP: ['North America', 'Central America'],
  HMD: ['Oceania', 'Australia and New Zealand'],
  IOA: ['Oceania', 'Australia and New Zealand'],
  IOT: ['Africa', 'Eastern Africa'],
  MDV: ['Asia', 'Southern Asia'],
  MUS: ['Africa', 'Eastern Africa'],
  SGS: ['South America', 'South America'],
  SHN: ['Africa', 'Western Africa'],
  SYC: ['Africa', 'Eastern Africa'],
  UMI: ['Oceania', 'Micronesia'],
};

// Nom CLDR : variante courte quand le nom standard est une désignation administrative
// longue (« R.A.S. chinoise de Hong Kong », « Territoires palestiniens »).
const CLDR_VARIANTE = { HK: 'short', MO: 'short', PS: 'short' };

// Noms NE faux, absents ou pas en français, par langue (NE donne « Wake » aux îles
// Spratleys). Une zone contestée ne porte jamais le nom d'une entité (testé) : « Sahara
// occidental » désignait ESH (à l'est du mur) et la zone tenue par le Maroc, « Belize »
// le pays et sa partie revendiquée par le Guatemala.
const NOM_CORRECTIONS = {
  fr: {
    NE_PGA: 'Îles Spratleys',
    NE_BRI: 'Île Brésilienne', // NE : « Ilha Brasileira »
    NE_B05: 'Jammu-et-Cachemire', // NE : « Cachemire », qui est toute la région
    NE_B12: 'Malouines (zone revendiquée par l’Argentine)',
    NE_B14: 'Sources de la Lawa', // NE : « Lawa Headwaters »
    NE_B15: 'Sources de la Courantyne', // NE : « Courantyne River »
    NE_B17: 'Triangle d’Ilemi (administré par le Kenya)',
    NE_B19: 'Sahara occidental (administré par le Maroc)',
    NE_B44: 'Base de Diego Garcia', // NE : « Aéroport », c'est une base navale
    NE_B48: 'Île d’Aves', // NE : « Isla de Aves »
    NE_B50: 'Baie de Guantánamo (revendiquée par Cuba)',
    NE_B51: 'Sud du Belize (revendiqué par le Guatemala)',
    NE_B55: 'Gibraltar (revendiqué par l’Espagne)',
    NE_B66: 'Îles Matthew et Hunter', // NE : « Île Matthew »
    NE_B68: 'Îles Tiran et Sanafir', // NE : « Sanafir »
    NE_B69: 'Archipel des Chagos (hors Diego Garcia)',
    NE_B71: 'Île Swains',
    NE_B74: 'Triangle d’Ilemi (partie sud-soudanaise)',
    NE_B78: 'No man’s land de Latroun', // NE : « Fort du No Man's Land »
    NE_B95: 'Île de Šarengrad', // NE : « Isla Šarengrad »
    NE_B96: 'Île de Vukovar', // NE : « Isla Vukovar »
  },
};

// Zones contestées : une zone qui couvre presque toute une entité de la couche des
// pays (Kosovo, Taïwan, Israël, Somaliland…) n'est pas une zone hachurée à part :
// l'entité elle-même porte déjà le statut ou la question. Exception : un territoire
// revendiqué en entier (Malouines, Gibraltar) reste hachuré, aucune question ne le vise.
const PART_ENTITE_ENTIERE = 0.9;
// Morceaux d'une entité jouable que NE range parmi les zones disputées sans dire qui les
// revendique : la Palestine est un pays du jeu, pas une zone hachurée.
const CONTESTEES_EXCLUES = { B53: 'bande de Gaza (Palestine)', B54: 'Cisjordanie (Palestine)' };

// Litiges que NE range en « Geo subunit » sans « Claimed by », gardés quand même :
// Ceuta et Melilla, revendiquées par le Maroc comme Perejil, Vélez, Alhucemas et les
// Chafarinas (NE_B62 à B65, que NE note « Claimed by Morocco ») ; sans elles, un
// toucher sur Perejil comptait pour le Maroc, et pas un toucher sur Ceuta, à côté
// (relecture du lot 4).
const CONTESTEES_AJOUTEES = { B60: 'Ceuta', B61: 'Melilla' };

// Qui revendique une entité entière (ids de pays.json), pour toute entité « conteste »,
// pour les territoires dont NE note une revendication (NOTE_BRK « Claimed by… », reprise
// dans pays.json en note_ne) et pour Taïwan et le Kosovo (paquet optionnel). La notation (un toucher au Somaliland compte pour la
// Somalie : décision « Zones contestées et enclaves ») est dans src/map/acceptes.ts. Les
// revendications d'une partie d'entité (Crimée, Kouriles, Tromelin, Wake…) sont dans
// geodata/revendications.json, tenu à la main, reportées dans contestees.json.
const REVENDICATIONS = {
  ESH: ['MAR'], // NE : « Self admin.; Claimed by Morocco » (partie à l'est du mur)
  FLK: ['ARG'],
  GIB: ['ESP'],
  IOT: ['MUS', 'SYC'], // NE v5.1.2, avant le traité Royaume-Uni–Maurice de 2025
  NE_BJN: ['COL', 'JAM', 'NIC', 'USA'],
  NE_BRI: ['BRA', 'URY'],
  NE_BRT: [], // Bir Tawil : ni l'Égypte ni le Soudan ne le revendiquent
  NE_CNM: ['CYP'], // zone tampon de l'ONU, de jure chypriote (NOTE_BRK vide)
  NE_CYN: ['CYP'],
  NE_KAS: ['IND', 'PAK'], // glacier de Siachen, tenu par l'Inde
  NE_PGA: ['BRN', 'CHN', 'MYS', 'PHL', 'TWN', 'VNM'], // NE oublie le Viêt Nam
  NE_SCR: ['CHN', 'PHL', 'TWN'], // NOTE_BRK vide
  NE_SER: ['COL', 'HND', 'NIC', 'USA'],
  NE_SOL: ['SOM'],
  NE_SPI: ['ARG', 'CHL'], // frontière non tracée, les deux le revendiquent en partie
  NE_USG: ['CUB'],
  SGS: ['ARG'], // NE le note sur ses deux parties (B32, B33), pas sur l'entité
  // Pays du paquet optionnel, revendiqués en entier (réponse de l'utilisateur du 06/11 :
  // « juste, règle telle quelle ») : un toucher sur eux compte aussi pour le revendiquant.
  TWN: ['CHN'], // NE v5.1.2, zone disputée NE_B77 : « Self admin.; Claimed by China »
  XKX: ['SRB'], // NE v5.1.2, NE_B57 sans note ; la Serbie revendique le Kosovo (Constitution de 2006, préambule)
};

// Point (pastille, étiquette) pris dans le polygone le plus proche de « lieu » au lieu du
// plus grand, quand le plus grand est absurde pour un archipel étendu. Vérifiés avec les
// capitales (relecture du J0) : seul Kiribati en a besoin ; Majuro est dans le plus grand
// polygone des Marshall (même atoll, 38 km), Funafuti, Malé, Victoria, Palikir, Ngerulmud,
// Nuku'alofa, Praia, Moroni aussi (à moins de 20 km).
const POINT_EXCEPTIONS = {
  // Le plus grand polygone est Kiritimati (îles de la Ligne), à 3 290 km de la capitale.
  KIR: { lieu: [173.03, 1.33], nom: 'Tarawa-Sud' },
};

// Frontières terrestres réelles que la topologie ne voit pas : NE laisse 96 m entre Macao
// et la Chine, et ne fait se toucher le Botswana et la Zambie qu'en un point (Kazungula,
// frontière de ~150 m). Le cas Namibie–Zimbabwe (un point, sans frontière) n'est pas ajouté.
const VOISINS_AJOUTS = [
  ['BWA', 'ZMB'],
  ['CHN', 'MAC'],
];

// --- Outils -------------------------------------------------------------------

const majuscule = (s) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);
const estIso3 = (s) => typeof s === 'string' && /^[A-Z]{3}$/.test(s);
const estIso2 = (s) => typeof s === 'string' && /^[A-Z]{2}$/.test(s);
const parId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function echec(message) {
  console.error(`geodata : ${message}`);
  process.exit(1);
}

async function lireJson(chemin) {
  return JSON.parse(await readFile(chemin, 'utf8'));
}

async function ecrire(nom, contenu) {
  await writeFile(join(SORTIE, nom), contenu);
  const brut = Buffer.byteLength(contenu);
  const gz = gzipSync(contenu).length;
  console.log(`  ${nom.padEnd(18)} ${(brut / 1024).toFixed(1).padStart(8)} Ko  gzip ${(gz / 1024).toFixed(1).padStart(7)} Ko`);
}

// --- 1. Sources ---------------------------------------------------------------

/**
 * Télécharge (si absentes) et vérifie les sources ; cles : celles à traiter (toutes par
 * défaut), les autres gardent leur ligne du verrou telle quelle.
 */
async function sources(majEmpreintes, cles = null) {
  const verrou = existsSync(VERROU) ? await lireJson(VERROU) : {};
  const nouveau = {};
  let change = false;
  for (const source of TELECHARGEES) {
    if (cles && !cles.includes(source.cle)) {
      if (verrou[source.cle]) nouveau[source.cle] = verrou[source.cle];
      continue;
    }
    const ancien = verrou[source.cle] ?? { fichiers: {} };
    const empreintes = {};
    for (const { chemin, url } of source.fichiers) {
      const local = join(RAW, chemin);
      if (!existsSync(local)) {
        console.log(`  téléchargement ${url}`);
        const rep = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!rep.ok) echec(`${url} : HTTP ${rep.status}`);
        await mkdir(dirname(local), { recursive: true });
        await writeFile(local, Buffer.from(await rep.arrayBuffer()));
      }
      const h = sha256(await readFile(local));
      const attendu = ancien.fichiers?.[chemin];
      if (!majEmpreintes && attendu !== h) {
        echec(
          attendu
            ? `empreinte différente pour ${chemin} (attendu ${attendu}, lu ${h}) ; ` +
                `supprimer geodata/raw/${chemin} pour le retélécharger, ou --maj-empreintes si la source a vraiment changé`
            : `aucune empreinte pour ${chemin} dans sources.lock.json ; lancer avec --maj-empreintes`,
        );
      }
      empreintes[chemin] = h;
    }
    const meme =
      ancien.telecharge_le &&
      Object.keys(empreintes).length === Object.keys(ancien.fichiers ?? {}).length &&
      Object.entries(empreintes).every(([c, h]) => ancien.fichiers[c] === h);
    if (!meme) change = true;
    nouveau[source.cle] = {
      telecharge_le: meme ? ancien.telecharge_le : aujourdhui(),
      fichiers: empreintes,
    };
  }
  if (majEmpreintes && (change || JSON.stringify(verrou) !== JSON.stringify(nouveau))) {
    await writeFile(VERROU, JSON.stringify(nouveau, null, 2) + '\n');
    console.log('  sources.lock.json réécrit');
  }
  return nouveau;
}

// --- 2. Lecture des fichiers de forme -----------------------------------------

async function lireShapefile(base) {
  const entree = {};
  for (const ext of NE_EXTENSIONS) {
    entree[`${base}.${ext}`] = await readFile(join(RAW, 'natural-earth', `${base}.${ext}`));
  }
  const sortie = await mapshaper.applyCommands(
    `-i ${base}.shp encoding=utf8 -o ${base}.json format=geojson`,
    entree,
  );
  return JSON.parse(String(sortie[`${base}.json`])).features;
}

// --- 3. Géométrie (sur la géométrie non simplifiée) ---------------------------

/**
 * Plus grand côté (km) de l'emprise d'un anneau : longitudes × cos de la latitude
 * moyenne, ou latitudes. Même calcul que src/map/dessin.ts (etendueKm).
 */
function etendueKm(anneau) {
  let o = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [x, y] of anneau) {
    if (x < o) o = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return Math.max((e - o) * Math.cos(((s + n) / 2) * (Math.PI / 180)), n - s) * 111.2;
}

/** Polygones (tableaux d'anneaux) d'une géométrie déjà dans le sens de d3. */
const polysDe = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/**
 * Regroupe par id les parties simplifiées (géométries TopoJSON d'un polygone chacune),
 * dans l'ordre des items ; une entité dont aucune partie ne reste a type null.
 */
function regrouper(geometries, items) {
  const arcs = new Map(items.map((x) => [x.id, []]));
  for (const g of geometries) {
    const liste = arcs.get(g.properties.id);
    if (!liste) echec(`partie simplifiée d'id inconnu ${g.properties.id}`);
    if (g.type === 'Polygon') liste.push(g.arcs);
    else if (g.type === 'MultiPolygon') liste.push(...g.arcs);
  }
  return items.map(({ id }) => {
    const a = arcs.get(id);
    if (a.length === 0) return { type: null, properties: { id } };
    return a.length === 1 ? { arcs: a[0], type: 'Polygon', properties: { id } } : { arcs: a, type: 'MultiPolygon', properties: { id } };
  });
}

/** Aire sphérique (stéradians) d'une géométrie déjà dans le sens de d3. */
const aireSr = (geometrie) => geoArea(geometrie);

/** Indice du polygone dont un sommet extérieur est le plus près du lieu [lon, lat]. */
function polyPres(polys, lieu) {
  let iMin = 0;
  let min = Infinity;
  polys.forEach((p, i) => {
    for (const c of p[0]) {
      const d = geoDistance(c, lieu);
      if (d < min) {
        min = d;
        iMin = i;
      }
    }
  });
  return iMin;
}

// --- 4. Entités ---------------------------------------------------------------

function idMaison(p) {
  if (ID_EXCEPTIONS[p.ADM0_A3]) return ID_EXCEPTIONS[p.ADM0_A3];
  if (estIso3(p.ISO_A3)) return p.ISO_A3;
  // ISO_A3_EH seulement quand c'est le code de l'entité elle-même (France, Norvège :
  // ISO_A3 = -99 chez NE) ; les îles Ashmore ont AUS, qui est le code de l'Australie.
  if (estIso3(p.ISO_A3_EH) && p.ISO_A3_EH === p.ADM0_A3) return p.ISO_A3_EH;
  return `NE_${p.ADM0_A3}`;
}

function a2Maison(p, id) {
  if (id.startsWith('NE_')) return undefined;
  if (estIso2(p.ISO_A2)) return p.ISO_A2;
  if (estIso2(p.ISO_A2_EH)) return p.ISO_A2_EH; // France, Norvège, Kosovo (XK), Taïwan
  return undefined;
}

function statutNe(p) {
  if (STATUT_EXCEPTIONS[p.ADM0_A3]) return STATUT_EXCEPTIONS[p.ADM0_A3];
  // Souverain de l'entité : SOV_A3. Une entité qui est son propre souverain sans être
  // dans la liste (Somaliland, Chypre du Nord, Siachen, Sahara occidental, bancs et
  // récifs revendiqués…) est contestée ; les autres dépendent d'un État (Groenland,
  // Hong Kong, Porto Rico, Baïkonour loué à la Russie…) : territoire.
  return p.SOV_A3 === p.ADM0_A3 ? 'conteste' : 'territoire';
}

function regionNe(p) {
  const exc = REGION_EXCEPTIONS[p.ADM0_A3];
  if (exc) return exc;
  return [p.CONTINENT, p.SUBREGION];
}

// --- Capitales (geodata/capitales.mjs) -------------------------------------------

// Parties qu'on peut refaire seules (--seulement).
const PARTIES = ['capitales', 'drapeaux', 'mers', 'notoriete', 'fiches'];

/** Construit et écrit les capitales ; rend ce qui va dans sources.json. */
async function capitales() {
  console.log('Capitales');
  let res;
  try {
    res = await construireCapitales(RACINE);
  } catch (e) {
    echec(e.message);
  }
  for (const [nom, texte] of Object.entries(res.fichiers)) await ecrire(nom, texte);
  for (const n of res.notes) console.log(`  ${n}`);
  return res;
}

// --- Drapeaux (geodata/drapeaux.mjs) ---------------------------------------------

/**
 * Construit et écrit les drapeaux ; rend ce qui va dans sources.json. Le dossier
 * drapeaux/ ne garde que les fichiers de ce build : un drapeau changé y change de nom,
 * l'ancien s'en va.
 */
async function drapeaux() {
  console.log('Drapeaux');
  let res;
  try {
    res = await construireDrapeaux(RACINE);
  } catch (e) {
    echec(e.message);
  }
  const dossier = join(SORTIE, 'drapeaux');
  await mkdir(dossier, { recursive: true });
  await mkdir(join(SORTIE, 'licences'), { recursive: true });
  const voulus = new Set(Object.keys(res.svgs).map((h) => `${h}.svg`));
  for (const f of await readdir(dossier)) if (!voulus.has(f)) await rm(join(dossier, f));
  let brut = 0;
  let gz = 0;
  for (const [h, texte] of Object.entries(res.svgs)) {
    await writeFile(join(dossier, `${h}.svg`), texte);
    brut += Buffer.byteLength(texte);
    gz += gzipSync(texte).length;
  }
  console.log(`  drapeaux/          ${voulus.size} fichiers, ${(brut / 1024).toFixed(1)} Ko  gzip ${(gz / 1024).toFixed(1)} Ko`);
  for (const [nom, texte] of Object.entries(res.fichiers)) await ecrire(nom, texte);
  for (const n of res.notes) console.log(`  ${n}`);
  return res;
}

// --- Océans et mers (geodata/mers.mjs) ---------------------------------------------

/** Construit et écrit les mers et leur témoin ; rend ce qui va dans sources.json. */
async function mers() {
  console.log('Mers');
  let res;
  try {
    res = await construireMers(RACINE);
  } catch (e) {
    echec(e.message);
  }
  for (const [nom, texte] of Object.entries(res.fichiers)) await ecrire(nom, texte);
  await writeFile(join(RACINE, 'geodata', 'mers-affectations.json'), res.affectations);
  for (const n of res.notes) console.log(`  ${n}`);
  return res;
}

// --- Notoriété du quiz (geodata/notoriete.mjs) -------------------------------------

/** Construit et écrit la notoriété (après les capitales : elle lit capitales.json) ; rend ce qui va dans sources.json. */
async function notoriete() {
  console.log('Notoriété');
  let res;
  try {
    res = await construireNotoriete(RACINE);
  } catch (e) {
    echec(e.message);
  }
  for (const [nom, texte] of Object.entries(res.fichiers)) await ecrire(nom, texte);
  for (const n of res.notes) console.log(`  ${n}`);
  return res;
}

// --- Fiches des lieux (geodata/fiches.mjs) ----------------------------------------

/** Construit et écrit les fiches du monde (après pays.json) ; rend ce qui va dans sources.json. */
async function fiches() {
  console.log('Fiches');
  let res;
  try {
    res = await construireFiches(RACINE);
  } catch (e) {
    echec(e.message);
  }
  for (const [nom, texte] of Object.entries(res.fichiers)) await ecrire(nom, texte);
  for (const n of res.notes) console.log(`  ${n}`);
  return res;
}

async function ecrireSources(sources) {
  await ecrire('sources.json', JSON.stringify(sources, null, 2) + '\n');
}

// --- Programme ------------------------------------------------------------------

async function main() {
  const majEmpreintes = process.argv.includes('--maj-empreintes');
  const i = process.argv.indexOf('--seulement');
  if (i >= 0) {
    const partie = process.argv[i + 1];
    if (!PARTIES.includes(partie)) echec(`--seulement ${partie ?? ''} : attendu ${PARTIES.join(', ')}`);
    await mkdir(SORTIE, { recursive: true });
    const avant = await lireJson(join(SORTIE, 'sources.json'));
    if (partie === 'capitales') {
      await ecrireSources(fusionnerSources(avant, await capitales()));
    } else if (partie === 'notoriete') {
      await ecrireSources(fusionnerPartie(avant, await notoriete()));
    } else if (partie === 'fiches') {
      console.log('Sources');
      await sources(majEmpreintes, SOURCES_FICHES.map((s) => s.cle));
      await ecrireSources(fusionnerPartie(avant, await fiches()));
    } else if (partie === 'mers') {
      if (majEmpreintes) echec('--seulement mers sans --maj-empreintes : Natural Earth est aussi la source des pays, relancer tout le build');
      console.log('Sources');
      await sources(false, ['natural-earth']);
      await ecrireSources(fusionnerMers(avant, await mers()));
    } else {
      console.log('Sources');
      await sources(majEmpreintes, SOURCES_DRAPEAUX.map((s) => s.cle));
      await ecrireSources(fusionnerPartie(avant, await drapeaux()));
    }
    return;
  }
  console.log('Sources');
  const verrou = await sources(majEmpreintes);

  console.log('Lecture');
  const liste = (await lireJson(LISTE)).pays;
  const revendicationsZones = (await lireJson(REVENDICATIONS_ZONES)).zones;
  const ne = await lireShapefile(NE_PAYS);
  const neContestees = await lireShapefile(NE_CONTESTEES);
  const cldr = {};
  for (const l of LANGUES) {
    const j = await lireJson(join(RAW, 'cldr', l, 'territories.json'));
    cldr[l] = j.main[l].localeDisplayNames.territories;
  }

  // Liste : chaque sélecteur NE doit exister et n'être pris qu'une fois.
  const neParCode = new Map(ne.map((f) => [f.properties.ADM0_A3, f]));
  if (neParCode.size !== ne.length) echec('ADM0_A3 en double dans Natural Earth');
  const selection = new Map(); // ADM0_A3 → entrée de la liste
  for (const entree of liste) {
    const codes = Array.isArray(entree.ne) ? entree.ne : [entree.ne];
    for (const c of codes) {
      if (!neParCode.has(c)) echec(`liste.json : ${entree.id} → ${c} absent de Natural Earth`);
      if (selection.has(c)) echec(`liste.json : ${c} pris deux fois`);
      selection.set(c, entree);
    }
  }

  // Entités : une par entrée de la liste, plus une par entité NE restante.
  const entites = new Map(); // id → { id, statut, a2, props, polys }
  for (const f of ne) {
    const p = f.properties;
    const entree = selection.get(p.ADM0_A3);
    const id = entree ? entree.id : idMaison(p);
    if (entree && !Array.isArray(entree.ne) && idMaison(p) !== id) {
      echec(`liste.json : ${entree.id} ≠ identifiant calculé ${idMaison(p)} pour ${p.ADM0_A3}`);
    }
    const ent = entites.get(id);
    if (ent) {
      if (!entree) echec(`identifiant ${id} en double (${p.ADM0_A3})`);
      ent.polys.push(...polygones(f.geometry));
      continue;
    }
    const a2 = entree ? entree.a2 : a2Maison(p, id);
    if (entree && a2 !== a2Maison(p, id)) {
      console.log(`  note : ${id}, a2 de la liste ${a2} ≠ NE ${a2Maison(p, id)}`);
    }
    entites.set(id, {
      id,
      statut: entree ? entree.statut : statutNe(p),
      a2,
      props: p,
      polys: [...polygones(f.geometry)],
    });
  }
  for (const entree of liste) if (!entites.has(entree.id)) echec(`liste.json : ${entree.id} sans géométrie`);
  for (const id of Object.keys(POINT_EXCEPTIONS)) if (!entites.has(id)) echec(`POINT_EXCEPTIONS : ${id} inconnu`);
  for (const [id, ids] of Object.entries(REVENDICATIONS)) {
    for (const x of [id, ...ids]) if (!entites.has(x)) echec(`REVENDICATIONS : ${x} inconnu`);
  }
  for (const e of entites.values()) {
    const note = (e.props.NOTE_BRK ?? '').trim();
    if (e.statut === 'conteste' && !REVENDICATIONS[e.id]) echec(`${e.id} contesté sans REVENDICATIONS (NE : « ${note} »)`);
    if (/claimed by/i.test(note) && !REVENDICATIONS[e.id] && e.statut !== 'optionnel') {
      echec(`${e.id} : NE note « ${note} », absent de REVENDICATIONS`);
    }
  }

  // Attributs calculés sur la géométrie non simplifiée.
  const tous = [...entites.values()].sort(parId);
  for (const e of tous) {
    if (e.polys.length === 0) echec(`${e.id} : géométrie vide dans Natural Earth`);
    const aires = e.polys.map((poly) => km2(aireSr({ type: 'Polygon', coordinates: poly })));
    let iMax = 0;
    aires.forEach((a, i) => {
      if (a > (aires[iMax] ?? 0)) iMax = i;
    });
    // superficie_km2 : aire de la géométrie NE de fait, pas une superficie officielle
    // (Monaco ×9, Chypre −42 % sans le Nord, Maroc +33 % avec le Sahara, Somalie −26 %
    // sans le Somaliland) ; les superficies à apprendre viendront de Wikidata (P2046) au J4.
    e.superficie = aires.reduce((s, a) => s + a, 0);
    e.partieMax = aires[iMax] ?? 0;
    e.aires = aires;
    e.point = pointInterieur(e.polys[POINT_EXCEPTIONS[e.id] ? polyPres(e.polys, POINT_EXCEPTIONS[e.id].lieu) : iMax]);
    e.bbox = emprise(e.polys);
    e.geojson = {
      type: 'Feature',
      properties: { id: e.id },
      geometry:
        e.polys.length === 1
          ? { type: 'Polygon', coordinates: e.polys[0] }
          : { type: 'MultiPolygon', coordinates: e.polys },
    };
  }

  // Zones contestées : celles de NE qui sont de vrais litiges, sauf les entités entières.
  const contestees = [];
  const ecartees = [];
  for (const f of neContestees) {
    const p = f.properties;
    const litige =
      ['Disputed', 'Indeterminate', 'Breakaway'].includes(p.TYPE) ||
      /claimed by/i.test(p.NOTE_BRK ?? '') ||
      Boolean(CONTESTEES_AJOUTEES[p.BRK_A3]);
    if (!litige || !f.geometry) continue;
    const id = `NE_${p.BRK_A3}`;
    if (CONTESTEES_EXCLUES[p.BRK_A3]) {
      ecartees.push(`${id} ${CONTESTEES_EXCLUES[p.BRK_A3]}`);
      continue;
    }
    const polys = polygones(f.geometry);
    const geometrie =
      polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    const aire = km2(aireSr(geometrie));
    const entiere = tous.find((e) => e.props.ADM0_A3 === p.ADM0_A3);
    if (entiere && entiere.statut !== 'territoire' && aire >= PART_ENTITE_ENTIERE * entiere.superficie) {
      ecartees.push(`${id} ${p.BRK_NAME} (= ${entiere.id})`);
      continue;
    }
    let iMax = 0;
    const aires = polys.map((poly) => km2(aireSr({ type: 'Polygon', coordinates: poly })));
    aires.forEach((a, i) => {
      if (a > (aires[iMax] ?? 0)) iMax = i;
    });
    const point = pointInterieur(polys[iMax]);
    // Qui tient la zone : les entités de la couche des pays qui contiennent son point
    // intérieur (géométrie non simplifiée), ou, pour un îlot absent de cette couche,
    // tenu_par de revendications.json (l'ADMIN de NE). Ce n'est pas toujours ce que
    // donne un toucher sur la carte simplifiée : les îlots espagnols au ras de la côte
    // marocaine (NE_B62, NE_B63) y tombent sous le Maroc.
    const rev = revendicationsZones[id];
    if (!rev) echec(`${id} : absente de geodata/revendications.json`);
    const contenantes = tous.filter((e) => geoContains(e.geojson, point)).map((e) => e.id);
    if (rev.tenu_par && contenantes.length) echec(`${id} : tenu_par alors que ${contenantes.join(', ')} la contient`);
    const dans = rev.tenu_par ?? contenantes;
    if (!dans.length) echec(`${id} : personne ne la tient (tenu_par manque dans revendications.json)`);
    contestees.push({
      id,
      type: p.TYPE,
      rang: p.scalerank,
      superficie_km2: arrondi(aire, 2),
      point,
      dans,
      revendique_par: rev.revendique_par,
      note: (p.NOTE_BRK ?? '').trim(),
      props: p,
      geojson: { type: 'Feature', properties: { id }, geometry: geometrie },
    });
  }
  contestees.sort(parId);
  if (new Set(contestees.map((c) => c.id)).size !== contestees.length) echec('zones contestées en double');
  for (const id of Object.keys(revendicationsZones)) {
    if (!contestees.some((c) => c.id === id)) echec(`revendications.json : ${id} n'est pas une zone gardée`);
  }
  for (const c of contestees) {
    for (const r of [...c.dans, ...c.revendique_par]) {
      if (!tous.some((e) => e.id === r)) echec(`revendications.json : ${c.id} → ${r} inconnu`);
    }
  }

  // --- Simplification et topologie (mapshaper) ---
  // keep-shapes ne protège que le plus grand anneau de chaque forme : simplifiée d'un
  // bloc, Kiribati perdait Tarawa (29 polygones sur 35), les Maldives 175 sur 176, la
  // France Yeu, Ré et Ouessant. Chaque polygone part donc comme une forme à part (même
  // id), ce qui le protège, puis les parties sont regroupées par id dans la topologie.
  // La topologie est bâtie à l'import, avant la simplification : les parties d'une
  // entité et ses voisins gardent les mêmes arcs, les voisins ne changent pas.
  console.log('Simplification');
  const parties = (items) =>
    items.flatMap((x) =>
      polysDe(x.geojson.geometry).map((coordinates) => ({
        type: 'Feature',
        properties: { id: x.id },
        geometry: { type: 'Polygon', coordinates },
      })),
    );
  const entree = {
    'pays.json': JSON.stringify({ type: 'FeatureCollection', features: parties(tous) }),
    'contestees.json': JSON.stringify({ type: 'FeatureCollection', features: parties(contestees) }),
  };
  const sortie = await mapshaper.applyCommands(
    `-i pays.json contestees.json combine-files ` +
      `-simplify ${SIMPLIFICATION} ` +
      `-o monde.topo.json format=topojson quantization=${QUANTIFICATION}`,
    entree,
  );
  const topo = JSON.parse(String(sortie['monde.topo.json']));
  if (!topo.objects.pays || !topo.objects.contestees) echec('objets pays/contestees absents de la topologie');
  topo.objects.pays.geometries = regrouper(topo.objects.pays.geometries, tous);
  topo.objects.contestees.geometries = regrouper(topo.objects.contestees.geometries, contestees);
  const topoTexte = JSON.stringify(topo);
  const geomsPays = topo.objects.pays.geometries;
  // Point d'une zone : pris sur la géométrie source, il sort de la forme simplifiée de
  // quelques îlots (Europa NE_B26, Navassa NE_B34, Alhucemas NE_B64, Doumeira NE_B87,
  // Perejil…) : il est alors repris dans le plus grand polygone simplifié, celui qu'on voit.
  const formesZones = feature(topo, topo.objects.contestees).features;
  contestees.forEach((c, i) => {
    const f = formesZones[i];
    if (!f.geometry || geoContains(f, c.point)) return;
    const polys = polysDe(f.geometry);
    let iMax = 0;
    const aires = polys.map((poly) => aireSr({ type: 'Polygon', coordinates: poly }));
    aires.forEach((a, j) => {
      if (a > (aires[iMax] ?? 0)) iMax = j;
    });
    c.point = pointInterieur(polys[iMax]);
    if (!geoContains(f, c.point)) echec(`${c.id} : point hors de sa forme simplifiée`);
  });
  // Aucune partie ne doit disparaître (keep-shapes la garde au pire en triangle).
  const nParties = (g) => (g.type === 'Polygon' ? 1 : g.type === 'MultiPolygon' ? g.arcs.length : 0);
  for (const [items, geoms] of [
    [tous, geomsPays],
    [contestees, topo.objects.contestees.geometries],
  ]) {
    items.forEach((x, i) => {
      const n = polysDe(x.geojson.geometry).length;
      if (nParties(geoms[i]) !== n) echec(`${x.id} : ${nParties(geoms[i])} polygones après simplification sur ${n}`);
    });
  }

  // Carte allégée : les polygones d'au moins ILE_LEGERE_KM, un à un (voir plus haut).
  // Une entité qui n'en a aucun (micro-État, archipel de petites îles) y est vide
  // (type null) : le rendu prend toutes ses îles dans la complète.
  const grandes = (items) =>
    JSON.stringify({ type: 'FeatureCollection', features: parties(items).filter((f) => etendueKm(f.geometry.coordinates[0]) >= ILE_LEGERE_KM) });
  const sortieLegere = await mapshaper.applyCommands(
    `-i pays.json contestees.json combine-files ` +
      `-simplify ${SIMPLIFICATION_LEGERE} ` +
      `-o monde-leger.topo.json format=topojson quantization=${QUANTIFICATION_LEGERE}`,
    { 'pays.json': grandes(tous), 'contestees.json': grandes(contestees) },
  );
  const topoLeger = JSON.parse(String(sortieLegere['monde-leger.topo.json']));
  if (!topoLeger.objects.pays || !topoLeger.objects.contestees) echec('carte allégée : objets pays/contestees absents');
  topoLeger.objects.pays.geometries = regrouper(topoLeger.objects.pays.geometries, tous);
  topoLeger.objects.contestees.geometries = regrouper(topoLeger.objects.contestees.geometries, contestees);
  for (const [items, geoms] of [
    [tous, topoLeger.objects.pays.geometries],
    [contestees, topoLeger.objects.contestees.geometries],
  ]) {
    items.forEach((x, i) => {
      const n = polysDe(x.geojson.geometry).filter((poly) => etendueKm(poly[0]) >= ILE_LEGERE_KM).length;
      if (nParties(geoms[i]) !== n) echec(`carte allégée : ${x.id}, ${nParties(geoms[i])} polygones sur ${n}`);
    });
  }
  const topoLegerTexte = JSON.stringify(topoLeger);

  // Voisins sur la topologie finale (arcs partagés).
  const voisins = neighbors(geomsPays);
  const voisinsParId = new Map(
    geomsPays.map((g, i) => [g.properties.id, (voisins[i] ?? []).map((j) => geomsPays[j].properties.id)]),
  );
  for (const [a, b] of VOISINS_AJOUTS) {
    if (!voisinsParId.has(a) || !voisinsParId.has(b)) echec(`VOISINS_AJOUTS : ${a} ou ${b} inconnu`);
    if (voisinsParId.get(a).includes(b)) console.log(`  note : ${a}–${b} déjà voisins, ajout inutile`);
    else {
      voisinsParId.get(a).push(b);
      voisinsParId.get(b).push(a);
    }
  }
  for (const v of voisinsParId.values()) v.sort();

  // --- Écriture ---
  console.log('Écriture');
  await mkdir(SORTIE, { recursive: true });
  await ecrire('monde.topo.json', topoTexte);
  await ecrire('monde-leger.topo.json', topoLegerTexte);

  const lignes = tous.map((e) => {
    const [continent, sousRegion] = regionNe(e.props);
    const o = { id: e.id, statut: e.statut };
    if (e.a2) o.a2 = e.a2;
    Object.assign(o, {
      continent,
      sous_region: sousRegion,
      superficie_km2: arrondi(e.superficie, 2),
      partie_max_km2: arrondi(e.partieMax, 2),
      point: e.point,
      bbox: e.bbox,
      micro: e.partieMax < SEUIL_MICRO_KM2,
      voisins: voisinsParId.get(e.id) ?? [],
    });
    if (REVENDICATIONS[e.id]) o.revendique_par = REVENDICATIONS[e.id];
    const note = (e.props.NOTE_BRK ?? '').trim();
    if ((e.statut === 'conteste' || e.statut === 'territoire') && note) o.note_ne = note;
    return JSON.stringify(o);
  });
  await ecrire('pays.json', `[\n${lignes.join(',\n')}\n]\n`);

  // Témoin (versionné, non servi) : point intérieur et aire de chaque polygone source des
  // jouables et optionnels, pour que tests/donnees.test.ts vérifie sans les sources
  // qu'aucune île n'a disparu de la topologie simplifiée.
  const lignesT = tous
    .filter((e) => e.statut === 'jouable' || e.statut === 'optionnel')
    .map((e) => {
      const parts = e.polys.map((poly, i) => [...pointInterieur(poly).map((x) => arrondi(x, 4)), arrondi(e.aires[i], 2)]);
      return `${JSON.stringify(e.id)}:${JSON.stringify(parts)}`;
    });
  await writeFile(TEMOIN, `{\n${lignesT.join(',\n')}\n}\n`);
  console.log(`  geodata/temoin-polygones.json  ${lignesT.length} entités`);

  const lignesC = contestees.map((c) =>
    JSON.stringify({
      id: c.id,
      type: c.type,
      rang: c.rang,
      superficie_km2: c.superficie_km2,
      point: c.point,
      dans: c.dans,
      revendique_par: c.revendique_par,
      note: c.note,
    }),
  );
  await ecrire('contestees.json', `[\n${lignesC.join(',\n')}\n]\n`);

  for (const l of LANGUES) {
    for (const id of Object.keys(NOM_CORRECTIONS[l] ?? {})) {
      if (!entites.has(id) && !contestees.some((c) => c.id === id)) echec(`NOM_CORRECTIONS.${l} : ${id} inconnu`);
    }
    const noms = {};
    const corrections = NOM_CORRECTIONS[l] ?? {};
    for (const e of tous) {
      const t = cldr[l];
      const variante = e.a2 && CLDR_VARIANTE[e.a2] ? t[`${e.a2}-alt-${CLDR_VARIANTE[e.a2]}`] : undefined;
      const nomNe = e.props[`NAME_${l.toUpperCase()}`];
      noms[e.id] = corrections[e.id] ?? variante ?? (e.a2 ? t[e.a2] : undefined) ?? (nomNe ? majuscule(nomNe) : undefined);
      if (!noms[e.id]) echec(`${e.id} : aucun nom en ${l}`);
    }
    for (const c of contestees) {
      const nomNe = c.props[`NAME_${l.toUpperCase()}`];
      noms[c.id] = corrections[c.id] ?? (nomNe ? majuscule(nomNe.trim()) : undefined);
      if (!noms[c.id]) echec(`${c.id} : aucun nom en ${l}`);
    }
    const tri = Object.fromEntries(Object.entries(noms).sort(([a], [b]) => (a < b ? -1 : 1)));
    await ecrire(`noms.${l}.json`, JSON.stringify(tri, null, 1) + '\n');
  }

  // La Unicode License v3 demande que sa notice accompagne les copies : noms.<langue>.json
  // en dérive et est servi publiquement, le texte est donc servi à côté, tel quel.
  await ecrire('LICENSE-CLDR.txt', await readFile(join(RAW, 'cldr', 'LICENSE')));

  const meta = SOURCES.map((s) => ({
    nom: s.nom,
    url: s.url,
    version: s.version,
    licence: s.licence,
    telecharge_le: verrou[s.cle].telecharge_le,
    fichiers: s.fichiers.map((f) => ({ url: f.url, sha256: verrou[s.cle].fichiers[f.chemin] })),
  }));
  const traitement = {
    outil: 'mapshaper 0.6.110',
    simplification: `-simplify ${SIMPLIFICATION}, chaque polygone comme une forme à part (aucune île perdue), regroupés par id`,
    quantification: QUANTIFICATION,
    carte_allegee: `monde-leger.topo.json : polygones d'au moins ${ILE_LEGERE_KM} km (plus grand côté de l'emprise), -simplify ${SIMPLIFICATION_LEGERE} chacun à part, regroupés par id, quantification ${QUANTIFICATION_LEGERE}`,
    // Empreintes des entrées tenues à la main : tests/donnees.test.ts les compare aux
    // fichiers, la CI échoue donc si l'on change le script ou la liste sans relancer.
    entrees: {
      'geodata/build.mjs': sha256(await readFile(fileURLToPath(import.meta.url))),
      'geodata/outils.mjs': sha256(await readFile(join(RACINE, 'geodata', 'outils.mjs'))),
      'geodata/liste.json': sha256(await readFile(LISTE)),
      'geodata/revendications.json': sha256(await readFile(REVENDICATIONS_ZONES)),
    },
    superficies:
      `aire de la géométrie Natural Earth de fait, pas une superficie officielle (Monaco ×9, Chypre sans le Nord, ` +
      `Maroc avec le Sahara occidental) : géodésique, d3-geo geoArea × R², R = ${R_TERRE_KM} km, sur la géométrie non simplifiée`,
  };
  const cap = await capitales();
  const drap = await drapeaux();
  const mer = await mers();
  const noto = await notoriete();
  const fic = await fiches();
  await ecrireSources(fusionnerPartie(fusionnerPartie(fusionnerMers(fusionnerPartie(fusionnerSources({ sources: meta, traitement }, cap), drap), mer), noto), fic));

  // Résumé.
  const parStatut = {};
  for (const e of tous) parStatut[e.statut] = (parStatut[e.statut] ?? 0) + 1;
  console.log(`Entités : ${tous.length}`, parStatut);
  console.log(`Zones contestées : ${contestees.length} ; écartées : ${ecartees.length}`);
  for (const e of ecartees) console.log(`  écartée ${e}`);
}

await main();
