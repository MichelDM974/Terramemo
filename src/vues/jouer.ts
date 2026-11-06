// Vue « Jouer » (décision « En-tête ») : le bouton de l'en-tête ouvre le choix
// de l'exercice, puis la série se choisit dans le départ de l'exercice (Toucher
// pour Trouver et Reconnaître, Chrono), au même endroit, sous le pouce. Choisir
// un exercice part d'une partie neuve (main.ts : nouvellePartie). Les exercices
// vont en deux groupes (décision « Noms des modes ») : « Entraînement », sans
// points, et « Classé », les épreuves notées du classement (Chrono, Sans faute,
// Minute : décision « Sans faute et Minute »). Les identifiants (localiser,
// nommer, chrono) restent ceux des records et du classement : seuls les noms
// affichés ont changé.
import { MODES_EPREUVE, type ModeEpreuve } from '../epreuve/chrono';
import { creer, type ContexteVue, type Vue } from './commun';
import { nomMode, secondesMode } from './scores';
import { remplir, textes } from './textes';

export type ModeJeu = 'localiser' | 'nommer' | ModeEpreuve;

/** Le mode est une épreuve classée (la vue des épreuves, chrono.ts) ; sinon un exercice de Toucher. */
export const estEpreuve = (m: ModeJeu): m is ModeEpreuve => (MODES_EPREUVE as readonly string[]).includes(m);

const J = textes.jouer;

/** Les groupes de l'écran Jouer, dans l'ordre affiché. */
export const GROUPES_JEU: readonly { titre: string; modes: readonly ModeJeu[] }[] = [
  { titre: J.groupe_entrainement, modes: ['localiser', 'nommer'] },
  { titre: J.groupe_classe, modes: MODES_EPREUVE },
];
export const MODES_JEU: readonly ModeJeu[] = GROUPES_JEU.flatMap((g) => g.modes);
const NOMS: Record<ModeJeu, string> = {
  localiser: textes.toucher.localiser,
  nommer: textes.toucher.nommer,
  chrono: nomMode('chrono'),
  sansfaute: nomMode('sansfaute'),
  minute: nomMode('minute'),
};
const DETAILS: Record<ModeJeu, string> = {
  localiser: J.localiser_detail,
  nommer: J.nommer_detail,
  chrono: remplir(J.chrono_detail, { s: secondesMode('chrono') }),
  sansfaute: remplir(J.sansfaute_detail, { s: secondesMode('sansfaute') }),
  minute: remplir(J.minute_detail, { s: secondesMode('minute') }),
};

export function vueJouer(ctx: ContexteVue, o: { choisir: (m: ModeJeu) => void; fermer: () => void }): Vue {
  const bouton = (m: ModeJeu) => {
    const b = creer(
      'button',
      { type: 'button', class: 'essai-serie', 'data-mode': m },
      creer('span', { class: 'essai-serie-nom' }, NOMS[m], creer('span', { class: 'essai-serie-detail' }, DETAILS[m])),
    );
    b.addEventListener('click', () => o.choisir(m));
    return b;
  };
  const groupes = GROUPES_JEU.map((g) =>
    creer(
      'section',
      { class: 'jouer-groupe' },
      creer('h3', {}, g.titre),
      creer('ul', { class: 'essai-series' }, ...g.modes.map((m) => creer('li', {}, bouton(m)))),
    ),
  );
  const fermer = creer('button', { type: 'button', class: 'depart-bouton', id: 'jouer-fermer', 'aria-label': J.fermer, title: J.fermer }, '×');
  fermer.addEventListener('click', () => o.fermer());
  const panneau = creer(
    'div',
    { class: 'essai-depart', id: 'jouer-depart' },
    creer('div', { class: 'depart-tete' }, creer('h2', {}, J.titre), fermer),
    creer('p', { class: 'hint' }, J.aide),
    ...groupes,
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
