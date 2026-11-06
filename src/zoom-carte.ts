// Boutons de zoom de la carte (#23), pour qui n'a pas de molette : +, − et
// « toute la carte », en bas à droite. Sur ordinateur seulement (carte.css :
// cachés sur un écran tactile, où le pincement suffit) et dans les vues où
// l'on manipule la carte (VUES_ZOOM). Les touches + et − du clavier font de
// même, hors d'un champ de saisie (la recherche de l'en-tête). Ils agissent
// sur la carte visible : le monde, ou l'île pendant une partie à La Réunion.
import type { CarteAffichee } from './map/carte';
import { creer } from './vues/commun';
import { textes } from './vues/textes';

const T = textes.zoom;

/** Les vues où la carte se manipule : l'accueil, Toucher (entraînement, séances) et les épreuves classées. */
export const VUES_ZOOM: readonly string[] = ['carte', 'toucher', 'chrono'];
/** Un cran de zoom : × 2 ou ÷ 2, comme un double clic dans les cartes en ligne. */
export const CRAN = 2;

/** Le cran d'une touche : + (ou =, la même touche sans Maj sur un clavier QWERTY) zoome, − dézoome ; 0 sinon. */
export function cranDeTouche(touche: string): number {
  if (touche === '+' || touche === '=') return CRAN;
  if (touche === '-' || touche === '−') return 1 / CRAN;
  return 0;
}

/** L'icône de « toute la carte » : quatre coins, le cadre entier (SVG, couleur du texte). */
function iconeTout(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 20 20', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }))
    svg.setAttribute(k, v);
  const chemin = document.createElementNS(ns, 'path');
  chemin.setAttribute('d', 'M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5');
  svg.append(chemin);
  return svg;
}

/**
 * Pose les boutons dans zone (au-dessus des cartes et des barres des vues,
 * posées avant) et écoute le clavier ; carte() : la carte visible, null tant
 * que le monde n'est pas chargé. Rend le groupe des boutons.
 */
export function brancherZoom(o: { zone: HTMLElement; carte: () => CarteAffichee | null }): HTMLElement {
  const bouton = (id: string, libelle: string, titre: string, ...contenu: (Node | string)[]) =>
    creer('button', { type: 'button', class: 'zoom-bouton', id, 'aria-label': libelle, title: titre }, ...contenu);
  const plus = bouton('zoom-plus', T.plus, T.plus, '+');
  const moins = bouton('zoom-moins', T.moins, T.moins, '−');
  const tout = bouton('zoom-tout', T.tout, T.tout, iconeTout());
  plus.addEventListener('click', () => o.carte()?.zoomerDe(CRAN));
  moins.addEventListener('click', () => o.carte()?.zoomerDe(1 / CRAN));
  tout.addEventListener('click', () => o.carte()?.vueEntiere());
  const groupe = creer('div', { class: 'zoom-carte', id: 'zoom-carte', role: 'group', 'aria-label': T.groupe }, plus, moins, tout);
  o.zone.append(groupe);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return; // Ctrl + : le zoom du navigateur
    const cran = cranDeTouche(e.key);
    if (!cran || !VUES_ZOOM.includes(document.body.dataset.vue ?? '')) return;
    const cible = e.target as Element | null;
    if (cible?.closest?.('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    o.carte()?.zoomerDe(cran);
  });
  return groupe;
}
