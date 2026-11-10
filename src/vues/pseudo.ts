// Le champ du pseudo public, commun au panneau de la première ouverture
// (pseudo de l'invité, src/vues/accueil.ts) et à l'écran « pseudo » des
// comptes (src/vues/compte.ts) : mêmes attributs (remplissage automatique,
// clavier), même validation que le classement (pseudoValide), même avis qui
// s'efface dès qu'on corrige. Petit module du morceau principal : le panneau
// en a besoin sans le morceau des comptes.
import { pseudoValide } from '../epreuve/chrono';
import { creer } from './commun';
import { textes } from './textes';

export interface ChampPseudo {
  /** Le libellé, le champ et son aide (.compte-champ). */
  bloc: HTMLDivElement;
  input: HTMLInputElement;
  /** Le pseudo nettoyé, ou null : l'avis posé dans `erreur`, le champ marqué invalide et focalisé. */
  valider(): string | null;
}

export function champPseudo(o: {
  id: string;
  libelle: string;
  /** Sous le champ, lue avec lui (aria-describedby). */
  aide: string;
  valeur: string;
  /** Où dire le refus (role=alert). */
  erreur: HTMLElement;
  /** La touche Entrée du clavier virtuel : « go » (commencer), « done » (enregistrer). */
  entree: 'go' | 'done';
}): ChampPseudo {
  const idAide = `${o.id}-aide`;
  const input = creer('input', {
    type: 'text',
    id: o.id,
    name: 'pseudo',
    maxlength: '20',
    autocomplete: 'nickname',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: o.entree,
    required: '',
    'aria-describedby': idAide,
  });
  input.value = o.valeur;
  // L'avis d'un pseudo refusé s'efface dès qu'on le corrige.
  input.addEventListener('input', () => {
    o.erreur.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  const bloc = creer(
    'div',
    { class: 'compte-champ' },
    creer('label', { for: o.id }, o.libelle),
    creer('div', { class: 'compte-ligne' }, input),
    creer('p', { class: 'hint compte-champ-aide', id: idAide }, o.aide),
  );
  return {
    bloc,
    input,
    valider() {
      const p = pseudoValide(input.value);
      if (!p) {
        o.erreur.textContent = textes.chrono.pseudo_invalide;
        input.setAttribute('aria-invalid', 'true');
        if (typeof input.focus === 'function') input.focus();
        return null;
      }
      input.removeAttribute('aria-invalid');
      return p;
    },
  };
}
