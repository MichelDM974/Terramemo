#!/usr/bin/env node
// Vérification des photos des fiches (#34, lot P2 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.8 et § 7).
//
// Usage :
//   node geodata/photos/verifier.mjs --dist [dossier]   le site construit (dist/ par défaut),
//        lancé par le predeploy de firebase.json : `firebase deploy` retire du site ce qui
//        manque dans dist/, et les WebP sont hors de git (D59) : un arbre de travail sans
//        npm run photos:restaurer déploierait des fiches sans photos, ou des listes qui
//        citent des photos absentes. Échoue (code 1) si une photo de licences.json manque,
//        n'a pas son empreinte, sa taille ou ses dimensions, si un WebP n'est cité par
//        rien (orphelin : servi sans crédit), si une liste cite une photo absente, ou si une
//        photo gardée d'un lieu relu n'est pas traitée (sans ligne dans licences.json, elle
//        manquerait au site sans un mot : listes.mjs l'omet), ou qu'une ligne de licences.json
//        n'a pas sa licence, sa page de Commons ou un lien de licence en https (fautesDonnees).
//   node geodata/photos/verifier.mjs --public           pareil sur public/photos/ (avant un build).
//   --reseau : lot P3 (chaque fichier existe-t-il toujours sur Commons, avec la même licence).
//
// Les contrôles, partagés avec tests/donnees-photos.test.ts (fautesWebp) :
//   - chaque photo a ses deux fichiers, photos/v/<nom>.webp (480 × 320) et photos/p/<nom>.webp
//     (1 080 × 720), leurs dimensions lues dans l'en-tête WebP ;
//   - le nom est le début du SHA-256 du contenu, et le SHA-256 entier celui de licences.json ;
//   - vignette ≤ 60 Ko, plein écran ≤ 300 Ko ;
//   - aucun fichier .webp de photos/v/ ou photos/p/ qui ne soit cité.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOSSIER, DOSSIER_SITE, fautesDonnees, lireDonnees, NOM, webpAttendus } from './listes.mjs';

export const RACINE = resolve(DOSSIER, '..', '..');
/** Dimensions et poids au plus de chaque taille (§ 3.3, § 7). */
export const TAILLES = {
  v: { w: 480, h: 320, octets: 60 * 1024 },
  p: { w: 1080, h: 720, octets: 300 * 1024 },
};

/**
 * Largeur et hauteur d'un fichier WebP, lues dans son en-tête (VP8, VP8L ou VP8X), ou null
 * si ce n'est pas un WebP.
 */
export function dimensionsWebp(b) {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const morceau = b.toString('latin1', 12, 16);
  if (morceau === 'VP8 ') {
    // Trame clé : 3 octets d'étiquette, le code 9d 01 2a, puis largeur et hauteur sur 14 bits.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (morceau === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (morceau === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  return null;
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/**
 * Les fautes des WebP de `racine` (le dossier qui contient photos/ : dist/ ou public/) contre
 * licences.json ; vide si tout est bon.
 */
export function fautesWebp(racine, licences) {
  const f = [];
  const cites = { v: new Set(), p: new Set() };
  for (const a of webpAttendus(licences)) {
    const t = `${a.fichier} (${a.taille})`;
    if (!NOM.test(a.nom ?? '')) {
      f.push(`${t} : nom ${a.nom}`);
      continue;
    }
    cites[a.taille].add(a.nom);
    const chemin = join(racine, DOSSIER_SITE, a.taille, `${a.nom}.webp`);
    if (!existsSync(chemin)) {
      f.push(`${t} : ${DOSSIER_SITE}/${a.taille}/${a.nom}.webp absent`);
      continue;
    }
    const b = readFileSync(chemin);
    const h = sha256(b);
    if (!h.startsWith(a.nom)) f.push(`${t} : le nom ${a.nom} n'est pas le début de son SHA-256 (${h.slice(0, 10)})`);
    if (a.sha256 && h !== a.sha256) f.push(`${t} : SHA-256 ${h}, ${a.sha256} attendu`);
    const d = dimensionsWebp(b);
    const T = TAILLES[a.taille];
    if (!d) f.push(`${t} : pas un WebP`);
    else if (d.w !== T.w || d.h !== T.h) f.push(`${t} : ${d.w} × ${d.h}, ${T.w} × ${T.h} attendu`);
    if (b.length > T.octets) f.push(`${t} : ${b.length} octets, ${T.octets} au plus`);
  }
  for (const taille of ['v', 'p']) {
    const dossier = join(racine, DOSSIER_SITE, taille);
    if (!existsSync(dossier)) continue;
    for (const n of readdirSync(dossier)) {
      if (n.endsWith('.webp') && !cites[taille].has(n.slice(0, -5))) f.push(`${DOSSIER_SITE}/${taille}/${n} : orphelin (cité par aucune photo de licences.json)`);
    }
  }
  return f;
}

/** Les fautes des listes d'un site construit : chaque photo citée a ses deux fichiers. */
export function fautesListes(racine) {
  const f = [];
  const dossier = join(racine, DOSSIER_SITE, 'l');
  if (!existsSync(dossier)) return f;
  for (const n of readdirSync(dossier)) {
    const liste = JSON.parse(readFileSync(join(dossier, n), 'utf8'));
    for (const p of liste.photos ?? []) {
      for (const taille of ['v', 'p']) if (!existsSync(join(racine, DOSSIER_SITE, taille, `${p[taille]}.webp`))) f.push(`${DOSSIER_SITE}/l/${n} : ${DOSSIER_SITE}/${taille}/${p[taille]}.webp absent`);
    }
  }
  return f;
}

function principal(argv) {
  const donnees = lireDonnees();
  const { licences } = donnees;
  let racine = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist') racine = argv[i + 1] && !argv[i + 1].startsWith('--') ? resolve(argv[++i]) : join(RACINE, 'dist');
    else if (argv[i] === '--public') racine = join(RACINE, 'public');
    else if (argv[i] === '--reseau') {
      console.error('verifier.mjs --reseau : lot P3, pas encore écrit.');
      return 2;
    } else {
      console.error(`verifier.mjs : argument inconnu ${argv[i]} (--dist [dossier] | --public)`);
      return 2;
    }
  }
  if (!racine) {
    console.error('verifier.mjs : --dist [dossier] ou --public');
    return 2;
  }
  const n = Object.keys(licences.photos ?? {}).length;
  const fautes = [...fautesDonnees(donnees), ...fautesWebp(racine, licences), ...(racine.endsWith('public') ? [] : fautesListes(racine))];
  if (fautes.length) {
    console.error(`Photos : ${fautes.length} faute(s) dans ${racine} (${n} photo(s) dans licences.json)`);
    for (const x of fautes.slice(0, 50)) console.error(`  ${x}`);
    if (fautes.length > 50) console.error(`  … et ${fautes.length - 50} de plus`);
    console.error('Un arbre de travail neuf : npm run photos:restaurer, puis le build.');
    return 1;
  }
  console.log(`Photos : ${n} photo(s), ${2 * n} fichier(s) WebP vérifiés dans ${racine}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = principal(process.argv.slice(2));
