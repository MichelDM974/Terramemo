// Relevé des bibliothèques Android que l'APK embarque (#20) : les artefacts
// Maven de la classpath d'exécution de :app (Gradle), écrits dans
// licences/android.json, que le fichier des licences tierces reprend
// (licences/tierces.ts). Les BOM (-bom) sont exclues : une liste de
// versions, pas du code embarqué.
//
//   npm run licences:android              # réécrit licences/android.json
//   node licences/android.mjs --verifier  # code 1 si le relevé a changé (CI Android, driver.py apk)
//
// Gradle demande le JDK 21 (JAVA_HOME) et un android/ synchronisé (npx cap
// sync android) ; une mise à jour de Capacitor ou d'AndroidX qui tire un
// nouvel artefact fait échouer --verifier tant que le relevé n'est pas
// refait, et le test des Crédits tant qu'il n'est pas rangé sous une ligne
// de textes.credits.android.
//
// Avis de tiers des AAR de Google (#31) : les services Google Play et googleid
// embarquent du code libre de tiers (Protocol Buffers, Checker Framework,
// Guava, Dagger…) dont les avis sont dans third_party_licenses.txt (index
// third_party_licenses.json : composant → octets de début et longueur), à la
// racine de chaque AAR. Le relevé les lit dans les AAR du cache de Gradle
// (modules-2, aux versions de android.json) et les écrit dédoublonnés dans
// licences/android-avis.json, commité : le build du site n'en dépend pas.
//
//   npm run licences:android              # aussi les avis (AAR téléchargés par un build de l'APK)
//   node licences/android.mjs --avis      # les avis seuls, sans Gradle, d'après android.json
//
// Un texte = un exemplaire, sous la liste des composants qui l'emploient
// (deux textes qui ne diffèrent que par les blancs n'en font qu'un). Les
// termes et conditions d'Apache 2.0 (de « TERMS AND CONDITIONS FOR USE » à
// « END OF TERMS AND CONDITIONS », mot pour mot aux blancs près) y sont
// remplacés par APACHE_ICI, que licences/tierces.ts rend par un renvoi au
// texte d'Apache 2.0 en fin de fichier : quarante copies de 11 ko sinon.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, 'android.json');
const SORTIE_AVIS = join(ICI, 'android-avis.json');
const CONFIGURATION = 'releaseRuntimeClasspath';

/** Les groupes Maven de Google dont les AAR portent third_party_licenses.txt (la ligne non libre de textes.credits.android). */
export const GROUPES_AVIS = ['com.google.android.gms', 'com.google.android.libraries.identity.googleid'];

/** La marque des termes d'Apache 2.0 retirés d'un avis (licences/tierces.ts la remplace par un renvoi). */
export const APACHE_ICI = '{{APACHE-2.0}}';

/** Les composants d'un AAR : [nom, texte] d'après third_party_licenses.json (octets) et .txt. */
export function composantsAar(index, texte) {
  return Object.entries(index).map(([nom, { start, length }]) => [nom, texte.subarray(start, start + length).toString('utf8')]);
}

const mots = (texte) => [...texte.matchAll(/\S+/g)].map((m) => ({ mot: m[0], debut: m.index, fin: m.index + m[0].length }));

/** Les mots des termes d'Apache 2.0 (de « TERMS AND CONDITIONS FOR USE » à « END OF TERMS AND CONDITIONS »). */
export function termesApache(apache) {
  const m = mots(apache).map((x) => x.mot);
  const debut = m.findIndex((x, i) => x === 'TERMS' && m[i + 4] === 'USE,');
  const fin = m.lastIndexOf('CONDITIONS');
  if (debut < 0 || m[fin - 4] !== 'END') throw new Error('apache-2.0.txt : termes introuvables');
  return m.slice(debut, fin + 1);
}

/** Le texte, chaque copie des termes d'Apache 2.0 (aux blancs près) remplacée par APACHE_ICI. */
export function factoriserApache(texte, termes) {
  const m = mots(texte);
  let sortie = '';
  let fait = 0;
  for (let i = 0; i < m.length; i++) {
    if (m[i].mot !== termes[0] || !termes.every((t, j) => m[i + j]?.mot === t)) continue;
    sortie += texte.slice(fait, m[i].debut) + APACHE_ICI;
    fait = m[i + termes.length - 1].fin;
    i += termes.length - 1;
  }
  return sortie + texte.slice(fait);
}

/**
 * Le relevé dédoublonné : par artefact, les indices de ses textes ; par texte
 * (trié par composant), ses composants. parArtefact : artefact → [nom, texte][].
 */
export function releveAvis(parArtefact, termes) {
  const parCle = new Map();
  const deArtefact = new Map();
  for (const [a, composants] of parArtefact) {
    const cles = new Set();
    for (const [nom, brut] of composants) {
      const texte = factoriserApache(brut.trim(), termes);
      if (!texte.trim()) throw new Error(`${a} : avis vide pour ${nom}`);
      const cle = texte.replace(/\s+/g, ' ');
      const t = parCle.get(cle) ?? parCle.set(cle, { composants: new Set(), texte }).get(cle);
      t.composants.add(nom);
      cles.add(cle);
    }
    deArtefact.set(a, cles);
  }
  const textes = [...parCle.entries()]
    .map(([cle, t]) => ({ cle, composants: [...t.composants].sort((x, y) => x.localeCompare(y, 'en')), texte: t.texte }))
    .sort((x, y) => x.composants[0].localeCompare(y.composants[0], 'en') || x.cle.localeCompare(y.cle));
  const indice = new Map(textes.map((t, i) => [t.cle, i]));
  return {
    artefacts: Object.fromEntries([...deArtefact].map(([a, cles]) => [a, [...cles].map((c) => indice.get(c)).sort((x, y) => x - y)])),
    textes: textes.map(({ composants, texte }) => ({ composants, texte })),
  };
}

/** L'AAR d'un artefact « groupe:nom:version » dans le cache de Gradle, null s'il n'y est pas. */
function aar(artefact) {
  const [groupe, nom, version] = artefact.split(':');
  const dossier = join(process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle'), 'caches', 'modules-2', 'files-2.1', groupe, nom, version);
  if (!existsSync(dossier)) return null;
  for (const empreinte of readdirSync(dossier)) {
    const f = join(dossier, empreinte, `${nom}-${version}.aar`);
    if (existsSync(f)) return f;
  }
  return null;
}

/** Les avis des AAR de Google de la liste, lus dans le cache de Gradle (unzip). */
function avis(liste) {
  const parArtefact = new Map();
  for (const a of liste.filter((x) => GROUPES_AVIS.includes(x.split(':')[0]))) {
    const f = aar(a);
    if (!f) throw new Error(`${a} : AAR absent du cache de Gradle (cd android && ./gradlew assembleDebug, puis relancer)`);
    const lire = (n) => execFileSync('unzip', ['-p', f, n], { maxBuffer: 64 * 1024 * 1024 });
    parArtefact.set(a, composantsAar(JSON.parse(lire('third_party_licenses.json').toString('utf8')), lire('third_party_licenses.txt')));
  }
  if (!parArtefact.size) throw new Error('aucun artefact de Google dans le relevé');
  return releveAvis(parArtefact, termesApache(readFileSync(join(ICI, 'apache-2.0.txt'), 'utf8')));
}

function ecrireAvis(liste) {
  const r = avis(liste);
  const contenu =
    JSON.stringify(
      {
        '_lisez-moi': `Avis de tiers (third_party_licenses.txt) des AAR de Google de android.json, relevés par licences/android.mjs : un exemplaire par texte, ses composants, et par artefact les indices de ses textes ; ${APACHE_ICI} : les termes d'Apache 2.0, renvoyés au texte de fin de fichier.`,
        ...r,
      },
      null,
      2,
    ) + '\n';
  writeFileSync(SORTIE_AVIS, contenu);
  const apache = r.textes.filter((t) => t.texte.includes(APACHE_ICI)).length;
  console.log(`${SORTIE_AVIS} : ${Object.keys(r.artefacts).length} artefacts, ${r.textes.length} textes (${apache} renvoient à Apache 2.0), ${contenu.length} caractères`);
}

/** Les artefacts résolus d'un arbre de `gradle dependencies` : « groupe:nom:version », triés, sans doublon ni BOM. */
export function artefacts(arbre) {
  const vus = new Set();
  for (const ligne of arbre.split('\n')) {
    if (ligne.includes('(c)')) continue; // contrainte, pas une dépendance
    const m = /--- ([\w.-]+):([\w.-]+)(?::([\w.-]+))?(?: -> ([\w.-]+))?/.exec(ligne);
    if (!m) continue;
    const [, groupe, nom, version, resolue] = m;
    if (nom.endsWith('-bom') || !(resolue ?? version)) continue;
    vus.add(`${groupe}:${nom}:${resolue ?? version}`);
  }
  return [...vus].sort();
}

function releve() {
  const env = { ...process.env, JAVA_HOME: process.env.JAVA_HOME ?? '/usr/lib/jvm/java-21-openjdk-amd64' };
  const arbre = execFileSync('./gradlew', ['-q', ':app:dependencies', '--configuration', CONFIGURATION], {
    cwd: join(ICI, '..', 'android'),
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const liste = artefacts(arbre);
  if (!liste.length) throw new Error(`aucun artefact dans ${CONFIGURATION} : sortie de Gradle inattendue`);
  return liste;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--avis')) {
  ecrireAvis(JSON.parse(readFileSync(SORTIE, 'utf8')).artefacts);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const liste = releve();
  const contenu =
    JSON.stringify(
      {
        '_lisez-moi': `Bibliothèques Android de l'APK (${CONFIGURATION} de :app), relevées par licences/android.mjs : npm run licences:android après une mise à jour de Capacitor ou d'AndroidX.`,
        artefacts: liste,
      },
      null,
      2,
    ) + '\n';
  if (process.argv.includes('--verifier')) {
    const avant = JSON.parse(readFileSync(SORTIE, 'utf8')).artefacts;
    const ajoutes = liste.filter((a) => !avant.includes(a));
    const retires = avant.filter((a) => !liste.includes(a));
    if (ajoutes.length || retires.length) {
      console.error(`licences/android.json périmé : + ${ajoutes.join(', ') || '∅'} ; − ${retires.join(', ') || '∅'}`);
      console.error('À refaire : npm run licences:android, puis npm test (lignes de textes.credits.android).');
      process.exit(1);
    }
    console.log(`licences/android.json à jour (${liste.length} artefacts)`);
  } else {
    writeFileSync(SORTIE, contenu);
    console.log(`${SORTIE} : ${liste.length} artefacts`);
    ecrireAvis(liste);
  }
}
