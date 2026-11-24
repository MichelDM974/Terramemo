#!/usr/bin/env node
// npm run photos:restaurer (#34, lot P2 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3.8) : les WebP des photos sont hors de git (D59 ; public/photos/ est ignoré). Un arbre
// de travail neuf (un git worktree, la CI) n'en a aucun : ce script copie ceux que cite
// geodata/photos/licences.json depuis la copie du PC, ~/Sauvegardes/terramemo/photos/
// (v/ et p/, écrite par npm run photos:traiter), dans public/photos/, puis vérifie leurs
// empreintes, dimensions et poids (verifier.mjs). À lancer avant un build qui sera déployé :
// le predeploy (verifier.mjs --dist) refuse un dist/ où il en manque.
//
// Usage : npm run photos:restaurer [-- --depuis <dossier>] [-- --vers <dossier>]
//
// Rien n'est effacé : un fichier déjà là et juste est laissé, un fichier faux est remplacé
// par la copie. D59 d (l'archive des WebP jointe à une release GitHub, téléchargée quand la
// copie du PC manque) vient au lot P3, avec la CI de l'APK.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOSSIER_SITE, lireDonnees, webpAttendus } from './listes.mjs';
import { fautesWebp, RACINE } from './verifier.mjs';

export const SAUVEGARDE = join(homedir(), 'Sauvegardes', 'terramemo', 'photos');

const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** Copie les WebP de licences.json de `depuis` vers `vers` (le dossier photos/ de public/) ; rend {copies, deja, absents}. */
export function restaurer(licences, depuis, vers) {
  const r = { copies: 0, deja: 0, absents: [] };
  for (const a of webpAttendus(licences)) {
    const nom = `${a.nom}.webp`;
    const cible = join(vers, a.taille, nom);
    if (existsSync(cible) && sha256(cible) === a.sha256) {
      r.deja++;
      continue;
    }
    const source = join(depuis, a.taille, nom);
    if (!existsSync(source)) {
      r.absents.push(`${a.taille}/${nom} (${a.fichier})`);
      continue;
    }
    mkdirSync(join(vers, a.taille), { recursive: true });
    copyFileSync(source, cible);
    r.copies++;
  }
  return r;
}

function principal(argv) {
  let depuis = SAUVEGARDE;
  let vers = join(RACINE, 'public', DOSSIER_SITE);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--depuis') depuis = resolve(argv[++i]);
    else if (argv[i] === '--vers') vers = resolve(argv[++i]);
    else {
      console.error(`restaurer.mjs : argument inconnu ${argv[i]}`);
      return 2;
    }
  }
  const { licences } = lireDonnees();
  const n = Object.keys(licences.photos ?? {}).length;
  if (!n) {
    console.log('Photos : licences.json ne cite aucune photo, rien à restaurer.');
    return 0;
  }
  const r = restaurer(licences, depuis, vers);
  console.log(`Photos : ${r.copies} fichier(s) copié(s) depuis ${depuis}, ${r.deja} déjà en place, ${r.absents.length} absent(s) de la copie.`);
  for (const a of r.absents.slice(0, 20)) console.error(`  absent : ${a}`);
  const fautes = fautesWebp(resolve(vers, '..'), licences);
  for (const f of fautes.slice(0, 20)) console.error(`  ${f}`);
  return r.absents.length || fautes.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = principal(process.argv.slice(2));
