// Vue « Saisie » : le clavier souffle-t-il des noms ? Un champ réglé contre les
// suggestions, un champ témoin sans réglage, et une variante type=url (Android
// coupe souvent les suggestions sur ce type), pour comparer demain sur le
// téléphone avec le clavier Samsung et Gboard.
import { suggestions } from '../texte';
import { creer, type ContexteVue, type Vue } from './commun';

const SANS_SUGGESTIONS: Record<string, string> = {
  type: 'text',
  autocomplete: 'off',
  autocorrect: 'off',
  autocapitalize: 'off',
  spellcheck: 'false',
  enterkeyhint: 'done',
  inputmode: 'text',
  'aria-autocomplete': 'list',
  'data-gramm': 'false',
};

export function vueSaisie(ctx: ContexteVue): Vue {
  const noms = ctx.donnees.entites
    .filter((e) => e.pays.statut === 'jouable' || e.pays.statut === 'optionnel')
    .map((e) => ctx.donnees.noms[e.pays.id] ?? e.pays.id);

  const liste = creer('ul', { class: 'saisie-liste', id: 'saisie-liste', 'aria-live': 'polite' });
  const champ = (id: string, libelle: string, attrs: Record<string, string>, note: string) => {
    const input = creer('input', { id, name: id, placeholder: 'Nom d’un pays', ...attrs });
    input.addEventListener('input', () => {
      liste.replaceChildren(...suggestions(input.value, noms).map((n) => creer('li', {}, n)));
    });
    return creer('div', { class: 'saisie-champ' }, creer('label', { for: id }, libelle), input, creer('p', { class: 'hint' }, note));
  };

  const section = creer(
    'section',
    { class: 'vue-saisie', id: 'vue-saisie' },
    creer(
      'div',
      { class: 'panel' },
      creer('h2', {}, 'Saisie'),
      creer(
        'p',
        { class: 'hint' },
        'Tape un début de nom dans chaque champ : le clavier ne doit rien souffler au-dessus des touches. Seule la liste sous les champs, faite par l’appli, propose des pays (sans accents ni casse).',
      ),
      champ('saisie-regle', 'Champ réglé', SANS_SUGGESTIONS, 'autocomplete, autocorrect, autocapitalize « off », spellcheck « false », enterkeyhint « done ».'),
      champ('saisie-temoin', 'Champ témoin', { type: 'text' }, 'Sans aucun réglage : le clavier y souffle ses mots.'),
      champ('saisie-url', 'Variante type=url', { ...SANS_SUGGESTIONS, type: 'url', inputmode: 'url' }, 'Les mêmes réglages sur un champ d’adresse : à essayer si le champ réglé ne suffit pas.'),
      creer('h2', { class: 'saisie-titre-liste' }, 'Pays qui commencent ainsi'),
      liste,
    ),
  );
  section.hidden = true;
  ctx.zone.append(section);

  return {
    activer() {
      section.hidden = false;
    },
    desactiver() {
      section.hidden = true;
    },
  };
}
