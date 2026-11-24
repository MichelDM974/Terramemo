// Listes des photos des fiches (#34, lot P2 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3.5) : depuis les deux fichiers versionnés, geodata/photos/choix.json (la relecture,
// npm run photos:relecture) et geodata/photos/licences.json (le traitement, npm run
// photos:traiter), les fichiers que le build écrit dans le site :
//   photos/l/<id>.json   un petit fichier par lieu (≈ 0,3 Ko), lu à l'ouverture de sa fiche :
//                        {v: 1, photos: [{v, p, alt: {fr}, auteur, licence, licence_url, page}]},
//                        dans l'ordre du carrousel (celui de la relecture) ;
//   photos/credits.json  la rubrique « Photos » des Crédits, lue quand on la déplie :
//                        {v: 1, photos: [{titre, auteur, licence, licence_url, page}]}, une ligne
//                        par photo (une photo de deux lieux n'en a qu'une).
// Ce ne sont pas des fichiers gardés : le plugin de vite.config.ts les écrit à chaque build
// (et les sert au serveur de développement), pour que la CI et un arbre de travail neuf les
// aient, avec ou sans les WebP (hors de git, D59 : public/photos/ est ignoré).
//
// Seules les entrées relues (etat « relu ») comptent ; une photo gardée sans ligne dans
// licences.json (pas encore traitée) n'est dans aucune liste : `manquantes` la dit, et
// tests/donnees-photos.test.ts échoue tant qu'il en reste. Chacun des 332 lieux de
// candidats.json a sa liste, vide s'il n'a pas de photo (relu sans photo, D60 a, ou pas encore
// relu) : sa fiche n'a pas de carrousel, et le site ne répond jamais 404 à l'ouverture d'une
// fiche (une requête en échec à chaque fiche sans photo, que le pilote compte comme une faute).
//
// Le nom de chaque WebP : les 10 premiers caractères hexadécimaux de son SHA-256 (§ 3.3) ;
// la vignette et le plein écran ont chacun le leur (deux contenus, deux empreintes), sous
// photos/v/ et photos/p/.
//
// TERRAMEMO_PHOTOS_DONNEES=<dossier> lit choix.json et licences.json ailleurs (les
// lieux d'essai du pilote, tests/photos-essai/) ; sans lui, geodata/photos/.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOSSIER = dirname(fileURLToPath(import.meta.url));
/** Le nom d'un fichier WebP servi : le début de son SHA-256, en hexadécimal. */
export const LONGUEUR_NOM = 10;
export const NOM = /^[0-9a-f]{10}$/;
/** Où le site sert les photos (sous la racine de dist/ et de public/). */
export const DOSSIER_SITE = 'photos';
/** La langue des textes alternatifs (décision « Langue » : le français seul, pour l'instant). */
export const LANGUE = 'fr';

/** Le dossier de choix.json et de licences.json : TERRAMEMO_PHOTOS_DONNEES, sinon geodata/photos/. */
export const dossierDonnees = (env = process.env) => env.TERRAMEMO_PHOTOS_DONNEES || DOSSIER;

const lireJson = (f, defaut) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : defaut);

/** Les lieux qui ont une fiche et des candidats (geodata/photos/candidats.json, toujours celui du dépôt). */
export function lieuxConnus() {
  return Object.keys(lireJson(join(DOSSIER, 'candidats.json'), { lieux: {} }).lieux ?? {});
}

/** choix.json et licences.json d'un dossier ; licences.json absent : aucune photo traitée. */
export function lireDonnees(dossier = dossierDonnees()) {
  return {
    choix: lireJson(join(dossier, 'choix.json'), { v: 1, lieux: {} }),
    licences: lireJson(join(dossier, 'licences.json'), { v: 1, photos: {} }),
  };
}

/** Les photos gardées des lieux relus, dans l'ordre de choix.json : [id, gardee][]. */
export function gardeesRelues(choix) {
  const r = [];
  for (const [id, e] of Object.entries(choix.lieux ?? {})) {
    if (e?.etat !== 'relu') continue;
    for (const g of e.gardees ?? []) r.push([id, g]);
  }
  return r;
}

/**
 * Les listes par lieu et les crédits, depuis choix.json et licences.json.
 * Rend {listes: {id: liste}, credits, manquantes: [{id, fichier}]}.
 */
export function dresserListes(choix, licences) {
  const L = licences.photos ?? {};
  const listes = {};
  const manquantes = [];
  const vues = new Map();
  for (const [id, g] of gardeesRelues(choix)) {
    const l = L[g.fichier];
    if (!l) {
      manquantes.push({ id, fichier: g.fichier });
      continue;
    }
    (listes[id] ??= { v: 1, photos: [] }).photos.push({
      v: l.v,
      p: l.p,
      alt: { [LANGUE]: g.sujet },
      auteur: l.auteur ?? null,
      licence: l.licence,
      licence_url: l.licence_url ?? null,
      page: l.page,
    });
    if (!vues.has(g.fichier)) vues.set(g.fichier, { titre: l.titre || g.sujet, auteur: l.auteur ?? null, licence: l.licence, licence_url: l.licence_url ?? null, page: l.page });
  }
  const photos = [...vues.values()].sort((a, b) => a.titre.localeCompare(b.titre, 'fr') || a.page.localeCompare(b.page));
  return { listes, credits: { v: 1, photos }, manquantes };
}

/**
 * Les fichiers que le build écrit : [{fileName, source}] (chemins relatifs à la racine du site) ; une liste
 * par lieu de `ids` (vide sans photo) et par lieu qui a des photos.
 */
export function fichiersDuSite(donnees = lireDonnees(), ids = lieuxConnus()) {
  const { listes, credits } = dresserListes(donnees.choix, donnees.licences);
  const tous = [...new Set([...ids, ...Object.keys(listes)])].sort();
  return [
    ...tous.map((id) => ({ fileName: `${DOSSIER_SITE}/l/${id}.json`, source: JSON.stringify(listes[id] ?? { v: 1, photos: [] }) })),
    { fileName: `${DOSSIER_SITE}/credits.json`, source: JSON.stringify(credits) },
  ];
}

/** Les deux fichiers WebP de chaque photo de licences.json : [{fichier, taille: 'v' | 'p', nom, sha256}]. */
export function webpAttendus(licences) {
  const r = [];
  for (const [fichier, l] of Object.entries(licences.photos ?? {})) {
    r.push({ fichier, taille: 'v', nom: l.v, sha256: l.sha256_v });
    r.push({ fichier, taille: 'p', nom: l.p, sha256: l.sha256_p });
  }
  return r;
}
