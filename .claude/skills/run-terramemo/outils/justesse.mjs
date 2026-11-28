// Justesse des prévisions de FSRS (#4) : rejoue le journal sauvé de
// l'appareil avec le code de l'appli et compare, révision par révision, la
// probabilité de rappel prévue à la réponse réelle (justesse_calcul.ts, empaqueté à
// la volée par rolldown, celui de Vite, comme valider_journal.mjs : pas de
// tsx dans le dépôt, et rien de FSRS n'est recopié).
//
//   node .claude/skills/run-terramemo/outils/justesse.mjs                # la dernière sauvegarde de chaque origine
//   node .claude/skills/run-terramemo/outils/justesse.mjs FICHIER... [--json] [--tranches 0.5,0.7,0.8,0.85,0.9,0.95]
//
// Sans fichier : dans ~/Sauvegardes/terramemo, la sauvegarde de
// `driver.py sauver_journal` la plus récente (sauve_le) de chaque origine
// (APK, site), fusionnées (le rejeu dédoublonne par id) ; celles du PC
// (cible « local », essais du driver) écartées. Un FICHIER peut aussi être
// une liste JSON d'événements. Sortie : des agrégats seulement (ni fiche, ni
// date), texte ou --json.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const source = fileURLToPath(new URL('./justesse_calcul.ts', import.meta.url));
// import.meta.env n'existe que sous Vite : un module de l'appli qui le lit au
// chargement (src/visibles.ts) planterait sous node. Valeurs d'un build.
const define = { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production', SSR: false, BASE_URL: '/' }) };
const paquet = await rolldown({ input: source, platform: 'node', logLevel: 'silent', transform: { define } });
const { output } = await paquet.generate({ format: 'esm' });
await paquet.close();
const { mesurer, rapport } = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));

const args = process.argv.slice(2);
const json = args.includes('--json');
let bornes;
const fichiers = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') continue;
  if (args[i] === '--tranches') {
    bornes = String(args[++i] ?? '').split(',').map(Number);
    if (!bornes.length || bornes.some((b, k) => !(b > 0 && b < 1) || (k && b <= bornes[k - 1]))) throw new Error('--tranches : des probabilités croissantes entre 0 et 1, séparées par des virgules');
  } else fichiers.push(args[i]);
}

function lire(f) {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

/** La sauvegarde la plus récente de chaque origine, hors cible « local » (même règle que pastilles.py). */
function dernieres(dossier) {
  const parOrigine = new Map();
  let noms = [];
  try {
    noms = readdirSync(dossier).filter((n) => /^journal-.*\.json$/.test(n));
  } catch {
    return [];
  }
  for (const n of noms) {
    const f = join(dossier, n);
    const e = lire(f);
    if (!e || Array.isArray(e) || typeof e !== 'object' || e.cible === 'local') continue;
    const cle = [String(e.sauve_le ?? ''), statSync(f).mtimeMs];
    const avant = parOrigine.get(e.origine);
    if (!avant || cle[0] > avant.cle[0] || (cle[0] === avant.cle[0] && cle[1] > avant.cle[1])) parOrigine.set(e.origine, { cle, f });
  }
  return [...parOrigine.values()].map((x) => x.f);
}

const choisis = fichiers.length ? fichiers : dernieres(join(homedir(), 'Sauvegardes/terramemo'));
if (!choisis.length) throw new Error('aucune sauvegarde du journal (driver.py sauver_journal) ni fichier donné');
const evenements = [];
const sources = [];
for (const f of choisis) {
  const brut = lire(f);
  if (brut === null) throw new Error(`${f} : JSON illisible`);
  const evts = Array.isArray(brut) ? brut : Array.isArray(brut?.evenements) ? brut.evenements : [];
  evenements.push(...evts);
  sources.push({ fichier: basename(f), cible: brut?.cible ?? null, origine: brut?.origine ?? null, sauve_le: brut?.sauve_le ?? null, appli: brut?.appli ?? null, evenements: evts.length });
}

const m = mesurer(evenements, bornes ? { bornes } : {});
if (json) process.stdout.write(JSON.stringify({ sources, ...m }, null, 2) + '\n');
else {
  for (const s of sources) process.stdout.write(`Source : ${s.fichier} (${s.cible ?? 'liste'}, ${s.origine ?? '?'}, sauvé le ${s.sauve_le ?? '?'}) : ${s.evenements} événements\n`);
  process.stdout.write(rapport(m) + '\n');
}
