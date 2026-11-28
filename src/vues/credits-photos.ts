// La rubrique « Photos » de l'écran Crédits (#34, lot P2 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.2) : chaque photo des fiches, lue dans
// photos/credits.json (écrit par le build, geodata/photos/listes.mjs, qui la trie). Décision
// « Photos de la fiche : carrousel et Crédits » : en tête le lieu et ce que montre la photo
// (« Japon · Préfecture de Kyoto »), puis le titre de Commons en petit, entre guillemets (souvent
// un nom de fichier qui ne dit pas le lieu, mais CC BY 2.0 à 3.0 demandent de le citer), puis
// auteur · licence · page sur Commons. Un credits.json d'avant (sans tête) : le titre en tête. Un morceau à part,
// chargé à la première ouverture du dépliant (credits.ts : import()) : le morceau principal
// était à 1,4 Ko de l'avertissement de Vite (500 Ko) ; ses textes sont ceux des photos de la
// fiche (textes-fiche.fr.json, bloc photos), partagés avec le morceau de la fiche.
import { creer } from './commun';
import { remplir as remplirTexte } from './textes';
import { textesFiche } from './textes-fiche';

const T = textesFiche.photos;
/** Les crédits des photos des fiches, écrits par le build. */
export const URL_CREDITS_PHOTOS = '/photos/credits.json';

/** Une ligne de photos/credits.json. */
export interface CreditPhoto {
  /** Le lieu, puis ce que montre la photo ; absent d'un credits.json d'avant la décision (le titre en tient lieu). */
  tete?: string;
  /** Le titre de Commons ; null s'il n'y en a pas. */
  titre: string | null;
  auteur: string | null;
  licence: string;
  licence_url: string | null;
  page: string;
}

const texte = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/**
 * Les lignes lues d'un JSON, sans celles mal formées : les mêmes contrôles que lireListe (fiche-photos.ts) pour les
 * photos des fiches, page de Commons et lien de licence en https, pour qu'aucun href ne vienne d'ailleurs.
 */
export function lireCredits(x: unknown): CreditPhoto[] {
  const l = (x as { photos?: unknown } | null)?.photos;
  return (Array.isArray(l) ? (l as CreditPhoto[]) : []).filter(
    (c) =>
      !!c &&
      (texte(c.tete) || texte(c.titre)) &&
      (c.tete === undefined || typeof c.tete === 'string') &&
      (c.titre === null || typeof c.titre === 'string') &&
      texte(c.licence) &&
      (c.auteur === null || typeof c.auteur === 'string') &&
      String(c.page).startsWith('https://commons.wikimedia.org/') &&
      (c.licence_url === null || String(c.licence_url).startsWith('https://')),
  );
}

/** Une photo de la rubrique : le lieu et son sujet, le titre de Commons entre guillemets, puis « auteur · licence · page sur Commons ». */
export function lignePhoto(c: CreditPhoto): HTMLLIElement {
  const lien = (href: string, t: string, cls: string) => creer('a', { href, target: '_blank', rel: 'noopener', class: cls }, t);
  const tete = texte(c.tete) ? c.tete : (c.titre ?? '');
  const titre = texte(c.tete) && texte(c.titre) ? [creer('span', { class: 'credits-titre' }, remplirTexte(T.credits_titre, { titre: c.titre }))] : [];
  return creer(
    'li',
    {},
    creer('span', { class: 'credits-nom' }, tete),
    ...titre,
    creer(
      'span',
      { class: 'hint credits-detail' },
      `${c.auteur ?? T.auteur_inconnu} · `,
      c.licence_url ? lien(c.licence_url, c.licence, 'credits-licence') : creer('span', { class: 'credits-licence' }, c.licence),
      ' · ',
      lien(c.page, T.credits_page, 'credits-page'),
    ),
  );
}

/** Les lignes de la rubrique (« Aucune photo pour l'instant » sans photo) ; rejetée si le réseau manque. */
export async function lignesPhotos(): Promise<HTMLLIElement[]> {
  const r = await fetch(URL_CREDITS_PHOTOS);
  if (!r.ok) throw new Error(`${URL_CREDITS_PHOTOS} : HTTP ${r.status}`);
  const l = lireCredits(await r.json());
  return l.length ? l.map(lignePhoto) : [creer('li', { class: 'hint' }, T.credits_aucune)];
}

/** Les listes déjà remplies, ou en cours : une ouverture suivante ne relit rien. */
const remplies = new WeakSet<HTMLElement>();

/**
 * Remplit la liste de la rubrique (credits.ts, à chaque ouverture du dépliant) : une fois ; hors ligne, `erreur`, et la
 * prochaine ouverture réessaie.
 */
export function remplir(liste: HTMLElement, erreur: string): Promise<void> {
  if (remplies.has(liste)) return Promise.resolve();
  remplies.add(liste);
  return lignesPhotos().then(
    (lignes) => liste.replaceChildren(...lignes),
    () => {
      remplies.delete(liste);
      liste.replaceChildren(creer('li', { class: 'hint' }, erreur));
    },
  );
}
