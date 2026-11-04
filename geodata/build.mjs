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
//
// Usage : npm run geodata [-- --maj-empreintes]
// Les sources sont téléchargées dans geodata/raw/ (ignoré par git) puis vérifiées par
// SHA-256 contre geodata/sources.lock.json ; le script refuse une empreinte différente,
// sauf avec --maj-empreintes qui réécrit le verrou. Sans réseau si raw/ est rempli.
// Deux lancements donnent des fichiers identiques octet pour octet.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { geoArea, geoContains, geoDistance } from 'd3-geo';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';
import { neighbors } from 'topojson-client';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(RACINE, 'geodata', 'raw');
const VERROU = join(RACINE, 'geodata', 'sources.lock.json');
const LISTE = join(RACINE, 'geodata', 'liste.json');
const TEMOIN = join(RACINE, 'geodata', 'temoin-polygones.json');
const SORTIE = join(RACINE, 'public', 'geo');

// Langues des fichiers de noms (décision « Langue » : l'anglais s'ajoutera ici).
const LANGUES = ['fr'];

const R_TERRE_KM = 6371.0088; // rayon moyen (IUGG)
const SEUIL_MICRO_KM2 = 1000; // plus grand polygone sous ce seuil : pastille seulement
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
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/10m_cultural/`;
const NE_PAYS = 'ne_10m_admin_0_countries';
const NE_CONTESTEES = 'ne_10m_admin_0_disputed_areas';
const NE_EXTENSIONS = ['shp', 'shx', 'dbf', 'prj', 'cpg'];

const CLDR_TAG = '49.0.0';
const CLDR_COMMIT = 'a4b67247b446fd51b475991017a2481911210c60';
const CLDR_RACINE = `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_TAG}/`;
const CLDR_BASE = `${CLDR_RACINE}cldr-json/cldr-localenames-full/main/`;

const SOURCES = [
  {
    cle: 'natural-earth',
    nom: 'Natural Earth, Admin 0 – Countries et Admin 0 – Breakaway, Disputed Areas (1:10m)',
    url: 'https://github.com/nvkelso/natural-earth-vector',
    version: `${NE_TAG} (commit ${NE_COMMIT})`,
    licence: 'Domaine public (https://www.naturalearthdata.com/about/terms-of-use/), mention facultative « Made with Natural Earth »',
    fichiers: [NE_PAYS, NE_CONTESTEES].flatMap((base) =>
      NE_EXTENSIONS.map((ext) => ({
        chemin: `natural-earth/${base}.${ext}`,
        url: `${NE_BASE}${base}.${ext}`,
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

// Qui revendique une entité entière (ids de pays.json), pour toute entité « conteste » et
// pour les territoires dont NE note une revendication (NOTE_BRK « Claimed by… », reprise
// dans pays.json en note_ne). Le choix de notation (un toucher au Somaliland compte-t-il
// pour la Somalie ?) se fait au J1a, pas ici. Les revendications d'une partie d'entité
// (Kouriles, Tromelin, Wake…) sont dans contestees.json.
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

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const arrondi = (x, n) => Number(x.toFixed(n));
const majuscule = (s) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);
const estIso3 = (s) => typeof s === 'string' && /^[A-Z]{3}$/.test(s);
const estIso2 = (s) => typeof s === 'string' && /^[A-Z]{2}$/.test(s);
const parId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function aujourdhui() {
  // Date locale du PC (La Réunion), au format AAAA-MM-JJ.
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

async function sources(majEmpreintes) {
  const verrou = existsSync(VERROU) ? await lireJson(VERROU) : {};
  const nouveau = {};
  let change = false;
  for (const source of SOURCES) {
    const ancien = verrou[source.cle] ?? { fichiers: {} };
    const empreintes = {};
    for (const { chemin, url } of source.fichiers) {
      const local = join(RAW, chemin);
      if (!existsSync(local)) {
        console.log(`  téléchargement ${url}`);
        const rep = await fetch(url);
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
 * Polygones d'une géométrie GeoJSON (tableaux d'anneaux), remis dans le sens de d3-geo
 * (extérieur horaire) : la sortie GeoJSON de mapshaper suit la RFC 7946 (antihoraire),
 * que d3 lit comme « toute la sphère sauf le polygone ».
 */
function polygones(geom) {
  if (!geom) return [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.map((anneaux) =>
    geoArea({ type: 'Polygon', coordinates: anneaux }) > 2 * Math.PI
      ? anneaux.map((r) => [...r].reverse())
      : anneaux,
  );
}

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

const km2 = (sr) => sr * R_TERRE_KM * R_TERRE_KM;

/** Point intérieur (pôle d'inaccessibilité) d'un polygone, en lon/lat corrigés du cosinus. */
function pointInterieur(anneaux) {
  let s = Infinity;
  let n = -Infinity;
  let o = Infinity;
  let e = -Infinity;
  for (const [x, y] of anneaux[0]) {
    s = Math.min(s, y);
    n = Math.max(n, y);
    o = Math.min(o, x);
    e = Math.max(e, x);
  }
  const k = Math.max(Math.cos((((s + n) / 2) * Math.PI) / 180), 0.05);
  const plan = anneaux.map((r) => r.map(([x, y]) => [x * k, y]));
  const precision = Math.max((e - o) * k, n - s) / 1000;
  const [px, py] = polylabel(plan, precision);
  return [arrondi(px / k, 5), arrondi(py, 5)];
}

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

/**
 * Emprise [ouest, sud, est, nord] qui passe l'antiméridien quand c'est plus court :
 * ouest > est signifie que l'emprise traverse 180°.
 */
function emprise(polys) {
  const intervalles = [];
  let s = Infinity;
  let n = -Infinity;
  for (const p of polys) {
    let o = Infinity;
    let e = -Infinity;
    for (const [x, y] of p[0]) {
      o = Math.min(o, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
    intervalles.push([o, e]);
  }
  intervalles.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Fusion des intervalles de longitude, puis plus grand trou sur le cercle.
  const fusion = [];
  for (const [o, e] of intervalles) {
    const der = fusion[fusion.length - 1];
    if (der && o <= der[1]) der[1] = Math.max(der[1], e);
    else fusion.push([o, e]);
  }
  const premier = fusion[0];
  const dernier = fusion[fusion.length - 1];
  // Trou qui passe par l'antiméridien (de la fin du dernier au début du premier).
  let trou = premier[0] + 180 + (180 - dernier[1]);
  let ouest = premier[0];
  let est = dernier[1];
  for (let i = 1; i < fusion.length; i++) {
    const t = fusion[i][0] - fusion[i - 1][1];
    if (t > trou) {
      trou = t;
      ouest = fusion[i][0];
      est = fusion[i - 1][1];
    }
  }
  if (trou <= 0) {
    ouest = -180;
    est = 180;
  }
  return [arrondi(ouest, 4), arrondi(s, 4), arrondi(est, 4), arrondi(n, 4)];
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

// --- Programme ------------------------------------------------------------------

async function main() {
  const majEmpreintes = process.argv.includes('--maj-empreintes');
  console.log('Sources');
  const verrou = await sources(majEmpreintes);

  console.log('Lecture');
  const liste = (await lireJson(LISTE)).pays;
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
      ['Disputed', 'Indeterminate', 'Breakaway'].includes(p.TYPE) || /claimed by/i.test(p.NOTE_BRK ?? '');
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
    // Entités de la couche des pays qui contiennent la zone (son point intérieur) : ce
    // que donnerait un toucher dans la zone.
    const dans = tous.filter((e) => geoContains(e.geojson, point)).map((e) => e.id);
    contestees.push({
      id,
      type: p.TYPE,
      rang: p.scalerank,
      superficie_km2: arrondi(aire, 2),
      point,
      dans,
      note: (p.NOTE_BRK ?? '').trim(),
      props: p,
      geojson: { type: 'Feature', properties: { id }, geometry: geometrie },
    });
  }
  contestees.sort(parId);
  if (new Set(contestees.map((c) => c.id)).size !== contestees.length) echec('zones contestées en double');

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
      'geodata/liste.json': sha256(await readFile(LISTE)),
    },
    superficies:
      `aire de la géométrie Natural Earth de fait, pas une superficie officielle (Monaco ×9, Chypre sans le Nord, ` +
      `Maroc avec le Sahara occidental) : géodésique, d3-geo geoArea × R², R = ${R_TERRE_KM} km, sur la géométrie non simplifiée`,
  };
  await ecrire('sources.json', JSON.stringify({ sources: meta, traitement }, null, 2) + '\n');

  // Résumé.
  const parStatut = {};
  for (const e of tous) parStatut[e.statut] = (parStatut[e.statut] ?? 0) + 1;
  console.log(`Entités : ${tous.length}`, parStatut);
  console.log(`Zones contestées : ${contestees.length} ; écartées : ${ecartees.length}`);
  for (const e of ecartees) console.log(`  écartée ${e}`);
}

await main();
