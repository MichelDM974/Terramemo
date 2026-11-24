// La rubrique « Photos » de l'écran Crédits (#34, lot P2 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.2) : chaque photo des fiches, son
// titre de Commons ou son sujet, son auteur, sa licence et sa page, lus dans
// photos/credits.json (écrit par le build, geodata/photos/listes.mjs). Un morceau à part,
// chargé à la première ouverture du dépliant (credits.ts : import()) : le morceau principal
// était à 1,4 Ko de l'avertissement de Vite (500 Ko) ; ses textes sont ceux des photos de la
// fiche (textes-fiche.fr.json, bloc photos), partagés avec le morceau de la fiche.
import { creer } from './commun';
import { textesFiche } from './textes-fiche';

const T = textesFiche.photos;
/** Les crédits des photos des fiches, écrits par le build. */
export const URL_CREDITS_PHOTOS = '/photos/credits.json';

/** Une ligne de photos/credits.json. */
export interface CreditPhoto {
  titre: string;
  auteur: string | null;
  licence: string;
  licence_url: string | null;
  page: string;
}

/** Une photo de la rubrique : son titre ou son sujet, puis « auteur · licence · page sur Commons ». */
export function lignePhoto(c: CreditPhoto): HTMLLIElement {
  const lien = (href: string, t: string, cls: string) => creer('a', { href, target: '_blank', rel: 'noopener', class: cls }, t);
  return creer(
    'li',
    {},
    creer('span', { class: 'credits-nom' }, c.titre),
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
  const l = ((await r.json()) as { photos?: CreditPhoto[] }).photos ?? [];
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
