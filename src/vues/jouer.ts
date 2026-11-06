// Vue « Jouer » (décision « En-tête ») : le bouton de l'en-tête ouvre le choix
// de l'exercice, puis la série se choisit dans le départ de l'exercice (Toucher
// pour Localiser et Nommer, Chrono), au même endroit, sous le pouce. Choisir un
// exercice part d'une partie neuve (main.ts : nouvellePartie).
import { DELAI_CHRONO_MS } from '../epreuve/bareme';
import { creer, type ContexteVue, type Vue } from './commun';
import { remplir, textes } from './textes';

export type ModeJeu = 'localiser' | 'nommer' | 'chrono';
export const MODES_JEU: readonly ModeJeu[] = ['localiser', 'nommer', 'chrono'];

const J = textes.jouer;
const NOMS: Record<ModeJeu, string> = { localiser: textes.toucher.localiser, nommer: textes.toucher.nommer, chrono: J.chrono };
const DETAILS: Record<ModeJeu, string> = {
  localiser: J.localiser_detail,
  nommer: J.nommer_detail,
  chrono: remplir(J.chrono_detail, { s: DELAI_CHRONO_MS.localiser / 1000 }),
};

export function vueJouer(ctx: ContexteVue, o: { choisir: (m: ModeJeu) => void; fermer: () => void }): Vue {
  const boutons = MODES_JEU.map((m) => {
    const b = creer(
      'button',
      { type: 'button', class: 'essai-serie', 'data-mode': m },
      creer('span', { class: 'essai-serie-nom' }, NOMS[m], creer('span', { class: 'essai-serie-detail' }, DETAILS[m])),
    );
    b.addEventListener('click', () => o.choisir(m));
    return b;
  });
  const fermer = creer('button', { type: 'button', class: 'depart-bouton', id: 'jouer-fermer', 'aria-label': J.fermer, title: J.fermer }, '×');
  fermer.addEventListener('click', () => o.fermer());
  const panneau = creer(
    'div',
    { class: 'essai-depart', id: 'jouer-depart' },
    creer('div', { class: 'depart-tete' }, creer('h2', {}, J.titre), fermer),
    creer('p', { class: 'hint' }, J.aide),
    creer('ul', { class: 'essai-series' }, ...boutons.map((b) => creer('li', {}, b))),
  );
  panneau.hidden = true;
  ctx.zone.append(panneau);

  return {
    activer() {
      panneau.hidden = false;
    },
    desactiver() {
      panneau.hidden = true;
    },
  };
}
