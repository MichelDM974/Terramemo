// Une vue chargée à la demande (morceau à part, import dynamique) : la vue
// Compte du J1b, qui emporte Firebase (étude du J1b, § 3.1 : jamais au
// démarrage d'un invité, D9 b). À l'ouverture, un « Chargement… » tout de
// suite ; si le morceau ne vient pas (site hors ligne sans service worker,
// #22), un avis, « Réessayer » et « Retour ». Seul ce petit fichier est dans
// le morceau principal.
import { creer, type ContexteVue, type Vue } from './commun';

export interface TextesALaDemande {
  titre: string;
  chargement: string;
  echec: string;
  reessayer: string;
  retour: string;
}

export function vueALaDemande(ctx: ContexteVue, id: string, t: TextesALaDemande, charger: () => Promise<Vue>, retour: () => void): Vue {
  let vue: Vue | null = null;
  let chargement: Promise<Vue> | null = null;
  let active = false;

  const avis = creer('p', { class: 'hint' }, t.chargement);
  const reessayer = creer('button', { type: 'button', id: `${id}-reessayer` }, t.reessayer);
  reessayer.hidden = true;
  const boutonRetour = creer('button', { type: 'button', class: 'secondary' }, t.retour);
  const attente = creer(
    'section',
    { class: 'vue-a-la-demande', id: `${id}-attente` },
    creer('div', { class: 'panel' }, creer('h2', {}, t.titre), avis, creer('div', { class: 'essai-actions' }, reessayer, boutonRetour)),
  );
  attente.hidden = true;
  ctx.zone.append(attente);
  boutonRetour.addEventListener('click', () => retour());

  function ouvrir(): void {
    avis.textContent = t.chargement;
    reessayer.hidden = true;
    // Un seul chargement à la fois, suivi une fois : rouverte pendant qu'il vient, la vue
    // n'est activée qu'une fois à son arrivée.
    if (chargement) return;
    const p = (chargement = charger());
    p.then(
      (v) => {
        vue = v;
        attente.hidden = true;
        if (active) v.activer();
      },
      (e: unknown) => {
        if (chargement === p) chargement = null;
        console.warn(`${id} : morceau non chargé`, e);
        avis.textContent = t.echec;
        reessayer.hidden = false;
      },
    );
  }
  reessayer.addEventListener('click', () => ouvrir());

  return {
    activer() {
      active = true;
      if (vue) return vue.activer();
      attente.hidden = false;
      ctx.carte.masquer(true);
      ouvrir();
    },
    desactiver() {
      active = false;
      if (vue) return vue.desactiver();
      attente.hidden = true;
      ctx.carte.masquer(false);
    },
  };
}
