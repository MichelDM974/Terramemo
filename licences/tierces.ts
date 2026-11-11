// Fichier des licences tierces (#20) : le texte de licence et les avis de
// copyright de chaque bibliothèque que le site et l'APK embarquent, que MIT,
// ISC, BSD et Apache 2.0 demandent de joindre. Produit au build par le
// plugin de vite.config.ts (servi en /licences-tierces.txt, aussi par le
// serveur de développement) et déplié dans l'écran Crédits
// (src/vues/credits.ts). Lu par Node, jamais par le navigateur.
//
// - Les paquets npm : ceux des lignes de textes.credits.bibliotheques, que
//   tests/credits-vue.test.ts compare à chaque passage aux paquets que le
//   build embarque vraiment ; leur LICENSE lu dans node_modules, un seul
//   exemplaire pour les textes identiques (les d3). Sans LICENSE (Firebase),
//   seule Apache-2.0 est admise : son texte est en fin de fichier.
// - Les bibliothèques Android : licences/android.json (relevé de Gradle,
//   licences/android.mjs), rangées sous les lignes de textes.credits.android
//   par leur groupe Maven ; toutes Apache-2.0, avec les avis (NOTICE) que
//   Cordova, Kotlin et kotlinx.coroutines publient (Apache 2.0, § 4 d).
// - Les données dont la licence demande le texte avec toute copie : les lignes
//   de textes.credits.donnees dont le lien est un fichier de /geo/licences/
//   (flag-icons, MIT ; étude J2, § 2.5), sous « Données », le texte lu dans
//   public/ (celui que le site sert).
// Un paquet ou un artefact qu'aucune ligne ne couvre fait échouer le build.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fr from '../src/vues/textes.fr.json';

/** Son nom, servi à la racine du site (src/vues/credits.ts le demande). */
export const FICHIER_LICENCES = 'licences-tierces.txt';

const T = fr.credits;
// Le dossier licences/ (import.meta.url : celle du fichier d'origine aussi dans la config de Vite, regroupée).
const ICI = dirname(fileURLToPath(import.meta.url));

/** Le dossier servi des textes de licence des données (public/geo/licences/). */
export const DOSSIER_LICENCES_DONNEES = '/geo/licences/';

/** Avis (NOTICE) publiés par groupe Maven, relevés dans le dépôt de chacun à la version embarquée. */
export const AVIS_ANDROID: Readonly<Record<string, string>> = {
  'org.apache.cordova': 'NOTICE-cordova.txt',
  'org.jetbrains.kotlin': 'NOTICE-kotlin.txt',
  'org.jetbrains.kotlinx': 'NOTICE-kotlinx-coroutines.txt',
};

/** Le texte du LICENSE d'un dossier de paquet (LICENSE, LICENCE, .md, .txt), null s'il n'en a pas. */
export function texteLicence(dossier: string): string | null {
  const f = readdirSync(dossier).find((n) => /^licen[cs]e(\.(md|txt))?$/i.test(n));
  return f ? readFileSync(join(dossier, f), 'utf8').trim() : null;
}

/** L'indice de la ligne de textes.credits.android qui couvre un artefact « groupe:nom:version » (« androidx.* » : tout groupe androidx.…), -1 sinon. */
export function ligneAndroid(artefact: string, lignes: readonly { groupes: readonly string[] }[] = T.android): number {
  const groupe = artefact.split(':')[0] ?? '';
  return lignes.findIndex((l) => l.groupes.some((g) => (g.endsWith('.*') ? groupe.startsWith(g.slice(0, -1)) : groupe === g)));
}

/** Les artefacts Android relevés (licences/android.json). */
export function artefactsAndroid(): string[] {
  return (JSON.parse(readFileSync(join(ICI, 'android.json'), 'utf8')) as { artefacts: string[] }).artefacts;
}

// Filets de 36 caractères : ils tiennent sur une ligne du dépliant à 320 px (chasse fixe de 0,72 rem).
const TRAIT = '-'.repeat(36);
const DOUBLE = '='.repeat(36);
const VOIR_APACHE = `Apache-2.0 (${T.fichier_voir_apache})`;

/** L'en-tête d'une bibliothèque : ses paquets, sa licence, ses auteurs s'ils ne sont pas dans le texte. */
const tete = (noms: string, licence: string, auteur?: string): string[] => [TRAIT, noms, `Licence : ${licence}`, ...(auteur ? [auteur] : []), TRAIT, ''];

/** Le fichier entier ; racine : celle du projet (node_modules). */
export function texteLicences(racine = join(ICI, '..')): string {
  const sortie = [T.fichier_titre, DOUBLE, '', T.fichier_intro, ''];

  // Paquets npm, un exemplaire par texte de licence (sans texte : un par ligne de Crédits).
  const groupes = new Map<string, { noms: string[]; licence: string; texte: string | null; auteur: string }>();
  for (const b of T.bibliotheques)
    for (const p of b.paquets) {
      const dossier = join(racine, 'node_modules', p);
      const pkg = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8')) as { version: string; license: string };
      const texte = texteLicence(dossier);
      if (!texte && pkg.license !== 'Apache-2.0') throw new Error(`licences tierces : ${p} n'a pas de LICENSE (licence ${pkg.license})`);
      // Firebase compte pour tous ses @firebase/* (tests/credits-vue.test.ts).
      const nom = `${p} ${pkg.version}${p === 'firebase' ? ' (et ses paquets @firebase/*)' : ''}`;
      const cle = texte ?? `${pkg.license}\n${b.auteur}`;
      const g = groupes.get(cle);
      if (g) g.noms.push(nom);
      else groupes.set(cle, { noms: [nom], licence: pkg.license, texte, auteur: b.auteur });
    }
  for (const g of groupes.values()) {
    if (g.texte) sortie.push(...tete(g.noms.join(', '), g.licence), g.texte, '');
    else sortie.push(...tete(g.noms.join(', '), VOIR_APACHE, g.auteur));
  }

  // Bibliothèques Android, sous leur ligne de Crédits.
  const parLigne = T.android.map(() => [] as string[]);
  for (const a of artefactsAndroid()) {
    const i = ligneAndroid(a);
    if (i < 0) throw new Error(`licences tierces : ${a} (licences/android.json) n'est sous aucune ligne de textes.credits.android`);
    parLigne[i]!.push(a);
  }
  sortie.push('', DOUBLE, T.fichier_android, DOUBLE, '');
  T.android.forEach((l, i) => {
    if (l.licence !== 'Apache-2.0') throw new Error(`licences tierces : ${l.nom}, licence ${l.licence} sans texte`);
    sortie.push(...tete(l.nom, VOIR_APACHE, l.auteur), ...parLigne[i]!, '');
    const avis = [...new Set(parLigne[i]!.map((a) => AVIS_ANDROID[a.split(':')[0] ?? '']).filter((f): f is string => !!f))];
    for (const f of avis) sortie.push(`${T.fichier_avis} :`, '', readFileSync(join(ICI, f), 'utf8').trimEnd(), '');
  });

  // Données dont la licence demande le texte (servi sous /geo/licences/).
  sortie.push('', DOUBLE, T.fichier_donnees, DOUBLE, '');
  for (const d of T.donnees) {
    if (!d.lien.startsWith(DOSSIER_LICENCES_DONNEES)) continue;
    sortie.push(...tete(`${d.nom} · ${d.detail}`, d.licence), readFileSync(join(racine, 'public', d.lien), 'utf8').trimEnd(), '');
  }

  sortie.push('', DOUBLE, T.fichier_apache, DOUBLE, '', readFileSync(join(ICI, 'apache-2.0.txt'), 'utf8').trimEnd(), '');
  return sortie.join('\n');
}
