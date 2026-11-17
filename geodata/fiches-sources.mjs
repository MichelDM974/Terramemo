// Sources des chiffres des fiches (#34, lot F2, étude fiche-lieu § 2.5), sans effet à
// l'import. Deux sortes, comme pour le reste du build :
//   - téléchargées par le build (geodata/build.mjs, sources()) dans geodata/raw/ et
//     vérifiées par SHA-256 contre geodata/sources.lock.json : SOURCES_FICHES, CLDR 49.0.0
//     (territoryInfo, currencyData, noms français des langues et des monnaies) et la base
//     tz 2026e (archive de l'IANA, dont zone.tab) ;
//   - extraits versionnés, écrits à la main par leur script (npm run wikidata -- --fiches,
//     npm run banque-mondiale) : EXTRAITS_FICHES.
// sourcesFiches rend leurs lignes de public/geo/sources.json sans rien lire de raw/ (les
// tests le rejouent en CI, sans réseau) ; lireSourcesFiches lit et vérifie les fichiers
// téléchargés, pour geodata/fiches.mjs.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { lireTar, sha256 } from './outils.mjs';

// Même version et même commit que l'entrée « cldr » de geodata/build.mjs (noms des
// territoires), comparés par tests/donnees-extraits-fiches.test.ts.
export const CLDR_TAG = '49.0.0';
const CLDR_COMMIT = 'a4b67247b446fd51b475991017a2481911210c60';
const CLDR_RACINE = `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_TAG}/cldr-json/`;
export const TZ_VERSION = '2026e';

export const SOURCES_FICHES = [
  {
    cle: 'cldr-fiches',
    nom:
      'Unicode CLDR, langues et monnaies des pays (cldr-core, supplemental : territoryInfo, currencyData) et leurs noms ' +
      'en français (cldr-localenames-full : languages ; cldr-numbers-full : currencies)',
    url: 'https://cldr.unicode.org',
    version: `${CLDR_TAG} (commit ${CLDR_COMMIT})`,
    licence:
      'Unicode License v3, notice : « Copyright © 2015-2024 Unicode, Inc. » ; texte complet dans LICENSE-CLDR.txt, à côté de ce ' +
      'fichier (le même que pour les noms des territoires)',
    fichiers: [
      { chemin: 'cldr/supplemental/territoryInfo.json', url: `${CLDR_RACINE}cldr-core/supplemental/territoryInfo.json` },
      { chemin: 'cldr/supplemental/currencyData.json', url: `${CLDR_RACINE}cldr-core/supplemental/currencyData.json` },
      { chemin: 'cldr/fr/languages.json', url: `${CLDR_RACINE}cldr-localenames-full/main/fr/languages.json` },
      { chemin: 'cldr/fr/currencies.json', url: `${CLDR_RACINE}cldr-numbers-full/main/fr/currencies.json` },
    ],
  },
  {
    cle: 'tz',
    nom: 'IANA Time Zone Database (tzdata), zone.tab : zone de chaque pays',
    url: 'https://www.iana.org/time-zones',
    version: TZ_VERSION,
    licence: 'Domaine public (fichier LICENSE de l’archive : « Unless specified below, all files in the tz code and data (including this LICENSE file) are in the public domain. » ; les exceptions BSD visent le code, pas zone.tab)',
    fichiers: [{ chemin: `tz/tzdata${TZ_VERSION}.tar.gz`, url: `https://data.iana.org/time-zones/releases/tzdata${TZ_VERSION}.tar.gz` }],
  },
];

export const EXTRAITS_FICHES = {
  wikidata: 'geodata/wikidata/fiches.json',
  requetes: 'geodata/wikidata/requetes-fiches.rq',
  banqueMondiale: 'geodata/banque-mondiale/population.json',
};
const SCRIPT = 'geodata/fiches-sources.mjs';

// Sources des valeurs écrites à la main dans geodata/fiches-main.json : le build ne les lit
// pas, mais leurs valeurs sont servies (une altitude, une part, une date de fête, un nom de
// langue). Chaque révision de Wikipédia citée dans la table est ici (le test le vérifie).
const WP = (langue, titre, revision, du) => ({ titre, url: `https://${langue}.wikipedia.org/w/index.php?oldid=${revision}`, revision, du });
export const SOURCES_TABLE = [
  {
    nom: 'Wikipédia, pages lues pour la table à la main (sommets, fêtes, langues, gentilés)',
    url: 'https://fr.wikipedia.org',
    version: 'révisions citées, lues le 17/11/2026 (Tirich Mir : le 18/11/2026)',
    telecharge_le: '2026-11-17',
    licence: 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) pour le texte ; seuls des faits en sont repris (altitudes, parts, dates), chacun avec sa page',
    pages: [
      WP('fr', 'Liste des pays par point culminant', 240366193, '2026-10-14'),
      WP('fr', 'Liste de fêtes nationales', 240443042, '2026-10-17'),
      WP('fr', 'Guinée-Bissau', 240555154, null),
      WP('fr', 'Kirghizistan', 241251765, null),
      WP('fr', 'Lesotho', 240863543, null),
      WP('fr', 'Nouvelle-Zélande', 240223491, null),
      WP('fr', 'Papouasie-Nouvelle-Guinée', 240791569, null),
      WP('fr', 'Vatican', 241316685, null),
      WP('fr', 'Halti', 240977676, '2026-11-03'),
      WP('fr', 'Tirich Mir', 241380774, '2026-11-15'),
      WP('fr', 'Rysy', 241232180, '2026-11-11'),
      WP('fr', 'Kazakhstan', 241381747, '2026-11-15'),
      WP('fr', 'Ukraine', 240693733, '2026-10-25'),
      WP('fr', 'Sénégal', 241251513, '2026-11-11'),
      WP('fr', 'Madagascar', 241288817, '2026-11-12'),
      WP('fr', 'Nigeria', 241115666, '2026-11-07'),
      WP('fr', 'Langues en Afrique du Sud', 239514997, '2026-09-15'),
      WP('en', 'Languages of Pakistan', 1383926115, '2026-11-05'),
      WP('en', 'Geography of the Gambia', 1379067827, '2026-10-07'),
    ],
    fichiers: [],
  },
  {
    nom: 'CIA World Factbook, champ « National holiday » (pré-remplissage des fêtes) et « highest point » (Gambie)',
    url: 'https://github.com/factbook/factbook.json',
    version: 'miroir figé, commit 144d697 du 11/09/2026 (le Factbook est arrêté depuis février 2026)',
    telecharge_le: '2026-11-16',
    licence:
      'domaine public (S46 : « Factbook data […] is the public domain and may be copied freely without permission from the Central Intelligence Agency », ' +
      'copie Wayback du 05/12/2025 de la page « Copyright and Contributors » ; le sceau du CIA excepté) ; « d\'après le World Factbook, relu »',
    fichiers: [],
  },
  {
    nom: 'ISO 639-2 et ISO 639-3 (SIL International, autorité d\'enregistrement), noms anglais des langues que CLDR ne nomme pas en français',
    url: 'https://iso639-3.sil.org',
    version: 'codes et noms cités dans geodata/fiches-main.json (langues.noms)',
    telecharge_le: '2026-11-17',
    licence: 'des noms de langues seulement, traduits à la main ; conditions de SIL non relues (à relire)',
    fichiers: [],
  },
];

/**
 * Lignes de public/geo/sources.json des sources des fiches, et empreintes des entrées
 * (ce module). Lit le verrou et les extraits, jamais raw/. Lève si l'extrait de Wikidata
 * n'a plus l'empreinte de ses requêtes, ou si le verrou n'a pas une source téléchargée.
 */
export async function sourcesFiches(racine) {
  const lire = (c) => readFile(join(racine, c));
  const [verrouBrut, wdBrut, rqBrut, bmBrut, scriptBrut] = await Promise.all(
    ['geodata/sources.lock.json', EXTRAITS_FICHES.wikidata, EXTRAITS_FICHES.requetes, EXTRAITS_FICHES.banqueMondiale, SCRIPT].map(lire),
  );
  const verrou = JSON.parse(verrouBrut.toString('utf8'));
  const wd = JSON.parse(wdBrut.toString('utf8'));
  const bm = JSON.parse(bmBrut.toString('utf8'));
  if (wd.requetes_sha256 !== sha256(rqBrut)) {
    throw new Error(`${EXTRAITS_FICHES.requetes} a changé depuis l'extrait du ${wd.extrait_le} : relancer npm run wikidata -- --fiches`);
  }
  const telechargees = SOURCES_FICHES.map((s) => {
    const v = verrou[s.cle];
    if (!v) throw new Error(`sources.lock.json : pas d'entrée ${s.cle} ; lancer npm run geodata -- --maj-empreintes`);
    return {
      nom: s.nom,
      url: s.url,
      version: s.version,
      licence: s.licence,
      telecharge_le: v.telecharge_le,
      fichiers: s.fichiers.map((f) => ({ url: f.url, sha256: v.fichiers[f.chemin] })),
    };
  });
  const extraits = [
    {
      nom: 'Wikidata, chiffres des fiches des pays : superficies (P2046), gentilés (P1549), habitants (P1082), points culminants (P610, P2044, P625)',
      url: 'https://query.wikidata.org',
      version: `extrait du ${wd.extrait_le} (SPARQL), API du ${wd.api_le}`,
      licence: 'CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), aucune mention obligatoire : citée par courtoisie',
      telecharge_le: wd.date,
      requetes: { chemin: EXTRAITS_FICHES.requetes, sha256: sha256(rqBrut) },
      fichiers: [{ chemin: EXTRAITS_FICHES.wikidata, sha256: sha256(wdBrut) }],
    },
    {
      nom: `Banque mondiale, ${bm.source.nom}`,
      url: bm.source.url,
      version: `année ${bm.annee}, mise à jour du ${bm.source.mis_a_jour_le}`,
      licence:
        `CC BY 4.0 (${bm.source.licence_url}) ; conditions des jeux de données lues le ${bm.conditions.lu_le} (${bm.conditions.url}) : ` +
        `mention « The World Bank: <jeu>: <source> » et adresse de ces conditions avec les données servies`,
      telecharge_le: bm.date,
      fichiers: [{ chemin: EXTRAITS_FICHES.banqueMondiale, sha256: sha256(bmBrut) }],
    },
  ];
  return { sources: [...telechargees, ...extraits, ...SOURCES_TABLE], entrees: { [SCRIPT]: sha256(scriptBrut) } };
}

/**
 * Les fichiers téléchargés des fiches (geodata/raw/), vérifiés contre le verrou : CLDR
 * (JSON lus) et zone.tab (texte) avec la version lue dans l'archive. Lève sur une
 * empreinte différente ou absente (le build les télécharge : npm run fiches).
 */
export async function lireSourcesFiches(racine) {
  const verrou = JSON.parse(await readFile(join(racine, 'geodata', 'sources.lock.json'), 'utf8'));
  const brut = {};
  for (const s of SOURCES_FICHES) {
    for (const f of s.fichiers) {
      const b = await readFile(join(racine, 'geodata', 'raw', f.chemin));
      const attendu = verrou[s.cle]?.fichiers?.[f.chemin];
      if (sha256(b) !== attendu) throw new Error(`fiches : ${f.chemin}, empreinte ${sha256(b)} ≠ verrou ${attendu ?? '(absente)'}`);
      brut[f.chemin] = b;
    }
  }
  const json = (c) => JSON.parse(brut[c].toString('utf8'));
  const tar = lireTar(gunzipSync(brut[`tz/tzdata${TZ_VERSION}.tar.gz`]));
  const version = tar.get('version')?.toString('utf8').trim();
  if (version !== TZ_VERSION) throw new Error(`tz : version ${version} dans l'archive, ${TZ_VERSION} attendue`);
  const zoneTab = tar.get('zone.tab')?.toString('utf8');
  if (!zoneTab) throw new Error('tz : zone.tab absent de l’archive');
  return {
    territoryInfo: json('cldr/supplemental/territoryInfo.json').supplemental.territoryInfo,
    currencyData: json('cldr/supplemental/currencyData.json').supplemental.currencyData,
    languesFr: json('cldr/fr/languages.json').main.fr.localeDisplayNames.languages,
    monnaiesFr: json('cldr/fr/currencies.json').main.fr.numbers.currencies,
    zoneTab,
    tzVersion: version,
  };
}
