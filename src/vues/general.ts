// Vue « Classement général » (bouton de l'en-tête, décision « En-tête ») : la
// somme des records Chrono de toutes les séries, de toujours et de la semaine.
// Relu à chaque ouverture ; « Retour » ramène à la vue d'avant (main.ts).
import { GENERAL } from '../epreuve/classement';
import { blocClassement } from './classement';
import { creer, type ContexteVue, type Vue } from './commun';
import { textes } from './textes';

const T = textes.chrono;

export function vueGeneral(ctx: ContexteVue, o: { retour: () => void }): Vue {
  const panneau = creer('div', { class: 'essai-bilan panel', id: 'classement-general' });
  panneau.hidden = true;
  ctx.zone.append(panneau);

  return {
    activer() {
      const retour = creer('button', { type: 'button', class: 'secondary', id: 'classement-retour' }, T.retour);
      retour.addEventListener('click', () => o.retour());
      panneau.replaceChildren(
        creer('h2', {}, T.general_titre),
        creer('p', { class: 'hint' }, T.general_aide),
        blocClassement(GENERAL, T.classement_titre),
        creer('div', { class: 'essai-actions' }, retour),
      );
      panneau.hidden = false;
    },
    desactiver() {
      panneau.hidden = true;
    },
  };
}
