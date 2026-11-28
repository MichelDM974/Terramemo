// Événements du journal refusés par probleme() de src/srs/journal.ts, la
// vraie règle de l'appli (pas une recopie) : le fichier est empaqueté à la
// volée par rolldown (celui de Vite), puis chargé ici. Sert à sauver_journal
// et restaurer_journal du driver, qui lisent la base brute d'un appareil dont
// l'appli n'expose pas cette règle (APK d'avant le lot 0 du J1b).
//
//   node outils/valider_journal.mjs < evenements.json
//
// Entrée : un tableau JSON d'événements. Sortie : un tableau JSON
// [{ "i": index, "id": id ou null, "probleme": texte }] des refusés.
import { rolldown } from 'rolldown';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../../../src/srs/journal.ts', import.meta.url));
// import.meta.env n'existe que sous Vite : un module de l'appli qui le lit au
// chargement (src/visibles.ts, importé par fiches.ts) planterait sous node.
// Valeurs d'un build.
const define = { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production', SSR: false, BASE_URL: '/' }) };
const paquet = await rolldown({ input: source, logLevel: 'silent', transform: { define } });
const { output } = await paquet.generate({ format: 'esm' });
await paquet.close();
const { probleme } = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));

let texte = '';
for await (const morceau of process.stdin) texte += morceau;
const evenements = JSON.parse(texte);
if (!Array.isArray(evenements)) throw new Error('un tableau d’événements est attendu');
const refuses = [];
evenements.forEach((e, i) => {
  const p = probleme(e);
  if (p !== null) refuses.push({ i, id: typeof e?.id === 'string' ? e.id : null, probleme: p });
});
process.stdout.write(JSON.stringify(refuses));
