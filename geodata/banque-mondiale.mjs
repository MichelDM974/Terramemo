#!/usr/bin/env node
// Extrait figé et daté de la Banque mondiale (World Development Indicators, CC BY 4.0) :
// les habitants des pays (#34, étude fiche-lieu § 2.1 et § 2.5), dans
// geodata/banque-mondiale/population.json, que le build lit sans réseau.
//   1. API v2, liste des économies (country?per_page=400) : les agrégats (région « NA »,
//      Aggregates : monde, régions, groupes de revenu) sont écartés ;
//   2. API v2, SP.POP.TOTL (Population, total) de 2015 à ANNEE pour toutes les économies :
//      la valeur de ANNEE, sinon celle de la dernière année non vide, avec son année (une
//      valeur d'une autre année porte la sienne : on ne mêle pas les années en silence) ;
//   3. API v2, date de mise à jour de la source 2 (WDI, lastupdated) et métadonnées de
//      la série (licence, source des chiffres) : le script échoue si la licence n'est
//      plus CC BY 4.0.
// Les conditions (S47) sont celles de la page lue le jour de l'extrait, recopiées dans
// CONDITIONS : à relire et à redater si on relance le script un autre jour.
//
// Usage : npm run banque-mondiale. Lancé à la main ; on relit le diff de l'extrait avant
// de le commettre. Une requête à la fois (geodata/reseau.mjs), User-Agent générique.
// Les valeurs de 2025 sont des estimations de milieu d'année (modèle de la Division de
// la population de l'ONU pour la plupart des pays), pas des recensements (§ 2.1).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aujourdhui } from './outils.mjs';
import { attendre, telecharger } from './reseau.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'geodata', 'banque-mondiale', 'population.json');
const API = 'https://api.worldbank.org/v2';
const SERIE = 'SP.POP.TOTL';
const ANNEE = 2025;
const DEPUIS = 2015;

// Lu le 17/11/2026 (S47). L'ancienne adresse
// https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets y redirige.
const CONDITIONS = {
  url: 'https://www.worldbank.org/ext/en/legal/terms-conditions/datasets',
  lu_le: '2026-11-17',
  licence: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), avec une clause de médiation et d’arbitrage des litiges',
  citations: [
    'Unless specifically labeled otherwise, these Datasets are provided to you under a Creative Commons Attribution 4.0 International License (CC BY 4.0), with the additional terms below.',
    'You agree to provide attribution to The World Bank and its data providers in the following format: The World Bank: Dataset name: Data source (if known).',
    'When sharing or facilitating access to the Datasets, you agree to include the same acknowledgment requirement in any sub-licenses of the data that you grant, and a requirement that any sub-licensees do the same. You may meet this requirement by providing the uniform resource locator (URL) of these terms of use.',
  ],
  // Ce que ces conditions demandent à Terramemo, qui sert les chiffres (fiches-monde.json) :
  mention:
    'la mention au format « The World Bank: <jeu>: <source> » (ici : World Development Indicators, Population, total (SP.POP.TOTL), ' +
    'd’après World Population Prospects de la Division de la population de l’ONU et les instituts nationaux), et l’adresse de ces conditions ' +
    'à côté des données servies',
};

async function json(url) {
  const { corps } = await telecharger(url);
  await attendre(1500);
  return JSON.parse(corps.toString('utf8'));
}

async function main() {
  const extraitLe = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const date = aujourdhui();

  console.log('Banque mondiale : économies');
  const [entetePays, pays] = await json(`${API}/country?format=json&per_page=400`);
  if (Number(entetePays.pages) !== 1) throw new Error(`liste des économies sur ${entetePays.pages} pages`);
  const economies = new Map(pays.filter((p) => p.region?.id !== 'NA').map((p) => [p.id, p.name]));

  console.log(`Banque mondiale : ${SERIE}, ${DEPUIS} à ${ANNEE}`);
  const [entete, lignes] = await json(`${API}/country/all/indicator/${SERIE}?format=json&date=${DEPUIS}:${ANNEE}&per_page=20000`);
  if (Number(entete.pages) !== 1) throw new Error(`${SERIE} sur ${entete.pages} pages`);
  const [, [source]] = await json(`${API}/sources/2?format=json`);
  const meta = await json(`${API}/sources/2/series/${SERIE}/metadata?format=json`);
  const champs = Object.fromEntries(meta.source[0].concept[0].variable[0].metatype.map((m) => [m.id, m.value]));
  if (champs.License_Type !== 'CC BY-4.0') throw new Error(`${SERIE} : licence ${champs.License_Type}, plus CC BY 4.0`);

  // Par économie : la valeur de ANNEE, sinon la dernière non vide. Les lignes sans
  // countryiso3code sont des agrégats (le filtre des économies les écarte de toute façon).
  const parCode = new Map();
  for (const l of lignes) {
    const code = l.countryiso3code;
    if (!economies.has(code) || l.value === null) continue;
    const annee = Number(l.date);
    const avant = parCode.get(code);
    if (!avant || annee > avant.annee) parCode.set(code, { v: l.value, annee, ...(l.obs_status ? { statut: l.obs_status } : {}) });
  }
  const codes = [...economies.keys()].sort();
  const valeurs = {};
  const sans = [];
  for (const c of codes) {
    const x = parCode.get(c);
    if (!x) sans.push(c);
    else valeurs[c] = { nom: economies.get(c), ...x };
  }
  const autreAnnee = Object.entries(valeurs).filter(([, x]) => x.annee !== ANNEE).map(([c, x]) => `${c} ${x.annee}`);

  const objet = (o) => `{\n${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}:${JSON.stringify(x)}`).join(',\n')}\n}`;
  const texte =
    `{\n"extrait_le":${JSON.stringify(extraitLe)},\n"date":${JSON.stringify(date)},\n` +
    `"source":${JSON.stringify({
      nom: `${source.name} (${source.code}), ${champs.IndicatorName} (${SERIE})`,
      url: `https://data.worldbank.org/indicator/${SERIE}`,
      api: `${API}/country/all/indicator/${SERIE}?format=json&date=${DEPUIS}:${ANNEE}`,
      mis_a_jour_le: source.lastupdated,
      definition: champs.Longdefinition,
      donnees_de: champs.Source,
      licence: champs.License_Type,
      licence_url: champs.License_URL,
    })},\n` +
    `"conditions":${JSON.stringify(CONDITIONS)},\n` +
    `"annee":${ANNEE},\n` +
    `"sans_valeur":${JSON.stringify(sans)},\n` +
    `"economies":${objet(valeurs)}\n}\n`;
  await mkdir(dirname(SORTIE), { recursive: true });
  await writeFile(SORTIE, texte);
  console.log(
    `${codes.length} économies, ${Object.keys(valeurs).length} avec une valeur (${autreAnnee.length} d'une autre année que ${ANNEE}` +
      `${autreAnnee.length ? ` : ${autreAnnee.join(', ')}` : ''}) ; sans valeur : ${sans.join(', ') || 'aucune'} ; WDI mis à jour le ${source.lastupdated}`,
  );
}

await main();
