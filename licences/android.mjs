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
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, 'android.json');
const CONFIGURATION = 'releaseRuntimeClasspath';

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
  }
}
