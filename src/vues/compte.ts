// Vue « Compte » (⚙ › Compte, #compte ; étude du J1b, § 3), lot 1 : invité,
// création d'un compte e-mail (lien de l'invité anonyme), connexion, mot de
// passe oublié, adresse non vérifiée (renvoi, non bloquante : D18 b),
// changement du mot de passe, déconnexion, session perdue. Morceau chargé à
// la demande avec src/sync/comptes.ts (vueCompteALaDemande, main.ts) : un
// invité ne charge jamais Firebase au démarrage (D9 b).
//
// Viendront ensuite : pseudo (lot 2), état de la synchro (lot 3), question de
// fusion, déconnexion reprenable et « Effacer cet appareil » (lot 4),
// export, suppression et lien vers la politique (lot 5), Google (lots 6 et
// 7). Les champs portent autocomplete et inputmode : le remplissage
// automatique d'Android marche ainsi dans la WebView (§ 3.2). Textes :
// textes.fr.json (compte), erreurs traduites par src/sync/erreurs.ts.
import type { Comptes, EtatCompte } from '../sync/comptes';
import { synchroCoupee } from '../sync/drapeaux';
import { codeErreur, traduire } from '../sync/erreurs';
import { creer, type ContexteVue, type Vue } from './commun';
import { remplir, textes } from './textes';

const T = textes.compte;

type Ecran = 'chargement' | 'echec' | 'invite' | 'creer' | 'connecter' | 'compte' | 'mdp' | 'perdue' | 'sans-compte';

export interface OptionsVueCompte {
  retour: () => void;
  /** Les comptes de la page (Firebase chargé au premier appel). */
  comptes: () => Promise<Comptes>;
  /** Séances du journal pas encore envoyées (session perdue, § 2.5) ; au lot 1, toutes celles du journal. */
  seances?: () => Promise<number>;
}

/** Le texte d'une session perdue : « {n} séances », au singulier pour une. */
export function textePerdue(n: number | null): string {
  if (!n) return T.perdue_aucune;
  return n === 1 ? T.perdue_une : remplir(T.perdue, { n });
}

export function vueCompte(ctx: ContexteVue, o: OptionsVueCompte): Vue {
  let ecran: Ecran = 'chargement';
  let etat: EtatCompte | null = null;
  let active = false;
  let occupe = false;
  /** Adresse gardée d'un formulaire à l'autre (création → connexion, session perdue → reconnexion). */
  let adresseSaisie = '';
  let seancesPerdue: number | null = null;
  let abonne = false;

  const message = creer('p', { class: 'status', id: 'compte-message', 'aria-live': 'polite' });
  const erreur = creer('p', { class: 'status error', id: 'compte-erreur', role: 'alert' });
  const contenu = creer('div', { class: 'compte-contenu', id: 'compte-contenu' });
  const synchro = creer('p', { class: 'hint', id: 'compte-synchro', 'aria-live': 'polite' }, T.synchro_coupee);
  const retour = creer('button', { type: 'button', class: 'secondary', id: 'compte-retour' }, T.retour);
  retour.addEventListener('click', () => o.retour());
  const section = creer(
    'section',
    { class: 'vue-compte', id: 'vue-compte' },
    creer('div', { class: 'panel' }, creer('h2', {}, T.titre), contenu, message, erreur, synchro, creer('div', { class: 'essai-actions compte-retour' }, retour)),
  );
  section.hidden = true;
  ctx.zone.append(section);

  const dire = (m: string) => {
    message.textContent = m;
    erreur.textContent = '';
  };
  const montrerErreur = (e: unknown) => {
    const t = traduire(e).texte;
    erreur.textContent = t ?? '';
  };
  const effacerAvis = () => {
    message.textContent = '';
    erreur.textContent = '';
  };

  /** Un bouton ; `principal` : le seul en accent plein de l'écran. */
  function bouton(id: string, texte: string, faire: () => void, sorte: 'principal' | 'secondaire' | 'lien' = 'secondaire', type: 'button' | 'submit' = 'button'): HTMLButtonElement {
    const b = creer('button', { type, id, ...(sorte === 'principal' ? {} : { class: sorte === 'lien' ? 'lien' : 'secondary' }) }, texte);
    if (type === 'button') b.addEventListener('click', () => faire());
    return b;
  }

  /**
   * Un champ : le libellé au-dessus, puis le champ (et son bouton « Montrer »)
   * sur une ligne. Le bouton reste hors du <label> : son texte n'entre pas dans
   * le nom du champ que lit le lecteur d'écran.
   */
  function champ(id: string, libelle: string, attrs: Record<string, string>, valeur = ''): { label: HTMLDivElement; input: HTMLInputElement; ligne: HTMLDivElement } {
    const input = creer('input', { id, ...attrs });
    input.value = valeur;
    const ligne = creer('div', { class: 'compte-ligne' }, input);
    const label = creer('div', { class: 'compte-champ' }, creer('label', { for: id }, libelle), ligne);
    return { label, input, ligne };
  }

  /** Champ de mot de passe, avec « Montrer » / « Masquer ». */
  function champMdp(id: string, libelle: string, autocomplete: string): { label: HTMLDivElement; input: HTMLInputElement; ligne: HTMLDivElement } {
    const c = champ(id, libelle, { type: 'password', name: id, autocomplete, minlength: '8', autocapitalize: 'off', spellcheck: 'false' });
    const voir = creer('button', { type: 'button', class: 'secondary compte-voir', id: `${id}-voir`, 'aria-controls': id, 'aria-pressed': 'false' }, T.montrer);
    voir.addEventListener('click', () => {
      const montre = c.input.getAttribute('type') === 'password';
      c.input.setAttribute('type', montre ? 'text' : 'password');
      voir.textContent = montre ? T.masquer : T.montrer;
      voir.setAttribute('aria-pressed', String(montre));
    });
    c.ligne.append(voir);
    return c;
  }

  const champAdresse = (valeur: string): { label: HTMLDivElement; input: HTMLInputElement } =>
    champ('compte-adresse', T.adresse, { type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', required: '' }, valeur);

  /** Un formulaire : Entrée l'envoie, le gestionnaire de mots de passe le reconnaît. */
  function formulaire(id: string, envoyer: () => void, ...enfants: Node[]): HTMLFormElement {
    const f = creer('form', { id, class: 'compte-form', novalidate: '' }, ...enfants);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      envoyer();
    });
    return f;
  }

  /** Une action : boutons désactivés le temps de l'appel, erreur traduite. */
  async function agir(faire: (c: Comptes) => Promise<void>): Promise<void> {
    if (occupe) return;
    occupe = true;
    erreur.textContent = '';
    for (const b of contenu.querySelectorAll('button')) b.disabled = true;
    try {
      await faire(await o.comptes());
    } catch (e) {
      montrerErreur(e);
      if (codeErreur(e) === 'auth/email-already-in-use' && ecran === 'creer') {
        // Ce compte existe déjà (§ 2.3) : vers « Se connecter », adresse pré-remplie, l'erreur gardée.
        const t = erreur.textContent;
        aller('connecter');
        erreur.textContent = t;
      }
    } finally {
      occupe = false;
      for (const b of contenu.querySelectorAll('button')) b.disabled = false;
    }
  }

  function aller(e: Ecran): void {
    ecran = e;
    rendre();
  }

  function rendre(): void {
    synchro.hidden = !synchroCoupee();
    contenu.replaceChildren(...ecranCourant());
  }

  function ecranCourant(): Node[] {
    switch (ecran) {
      case 'chargement':
        return [creer('p', { class: 'hint' }, T.chargement)];
      case 'echec':
        return [creer('p', { class: 'hint' }, T.chargement_echec), creer('div', { class: 'essai-actions' }, bouton('compte-recharger', T.reessayer, () => void rafraichir(), 'principal'))];
      case 'invite':
        return [
          creer('p', { class: 'hint' }, T.invite),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-vers-connecter', T.se_connecter_email, () => {
              effacerAvis();
              aller('connecter');
            }, 'principal'),
            bouton('compte-vers-creer', T.creer, () => {
              effacerAvis();
              aller('creer');
            }),
          ),
        ];
      case 'creer': {
        const a = champAdresse(adresseSaisie);
        const m = champMdp('compte-mdp', T.mdp, 'new-password');
        const envoyer = () => {
          adresseSaisie = a.input.value;
          void agir(async (c) => {
            const r = await c.creer(a.input.value, m.input.value);
            dire(r.verification ? remplir(T.cree, { adresse: r.adresse }) : T.cree_sans_email);
            await apres(c);
          });
        };
        return [
          creer('h3', {}, T.titre_creer),
          formulaire(
            'compte-form-creer',
            envoyer,
            a.label,
            m.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-creer-ok', T.creer_bouton, envoyer, 'principal', 'submit'),
              bouton('compte-annuler', T.annuler, () => annuler()),
            ),
          ),
          bouton('compte-deja', T.deja_compte, () => {
            adresseSaisie = a.input.value;
            effacerAvis();
            aller('connecter');
          }, 'lien'),
        ];
      }
      case 'connecter': {
        const a = champAdresse(adresseSaisie);
        const m = champMdp('compte-mdp', T.mdp, 'current-password');
        const envoyer = () => {
          adresseSaisie = a.input.value;
          void agir(async (c) => {
            const r = await c.connecter(a.input.value, m.input.value);
            dire(remplir(T.connecte, { adresse: r.adresse }));
            await apres(c);
          });
        };
        return [
          creer('h3', {}, T.titre_connecter),
          formulaire(
            'compte-form-connecter',
            envoyer,
            a.label,
            m.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-connecter-ok', T.connecter_bouton, envoyer, 'principal', 'submit'),
              bouton('compte-annuler', T.annuler, () => annuler()),
            ),
          ),
          creer(
            'div',
            { class: 'compte-liens' },
            bouton('compte-oubli', T.oubli, () => {
              adresseSaisie = a.input.value;
              void agir(async (c) => {
                await c.oublier(a.input.value);
                dire(T.oubli_envoye);
              });
            }, 'lien'),
            bouton('compte-vers-creer', T.pas_de_compte, () => {
              adresseSaisie = a.input.value;
              effacerAvis();
              aller('creer');
            }, 'lien'),
          ),
        ];
      }
      case 'compte': {
        const e = etat?.etat === 'compte' ? etat : null;
        if (!e) return [];
        const motDePasse = e.fournisseurs.includes('password');
        const nom = motDePasse ? (e.adresse ?? '') : remplir(T.compte_google, { adresse: e.adresse ?? '' });
        const lignes: Node[] = [creer('p', { class: 'compte-adresse', id: 'compte-adresse-connectee' }, nom)];
        if (!e.verifiee && motDePasse)
          lignes.push(
            creer(
              'p',
              { class: 'hint', id: 'compte-non-verifiee' },
              `${T.non_verifiee} · `,
              bouton('compte-renvoyer', T.renvoyer, () =>
                void agir(async (c) => {
                  const r = await c.renvoyer();
                  dire(remplir(T.renvoye, { adresse: r.adresse }));
                }), 'lien'),
            ),
          );
        lignes.push(
          creer(
            'div',
            { class: 'compte-actions' },
            ...(motDePasse ? [bouton('compte-vers-mdp', T.changer_mdp, () => {
              effacerAvis();
              aller('mdp');
            })] : []),
            bouton('compte-deconnecter', T.se_deconnecter, () =>
              void agir(async (c) => {
                await c.deconnecter();
                dire(T.deconnecte);
                await apres(c);
              })),
          ),
        );
        return lignes;
      }
      case 'mdp': {
        const e = etat?.etat === 'compte' ? etat : null;
        // L'identifiant du compte, caché : le gestionnaire de mots de passe met à jour le bon.
        const nom = creer('input', { type: 'email', name: 'email', autocomplete: 'username', hidden: '', readonly: '', tabindex: '-1', 'aria-hidden': 'true' });
        nom.value = e?.adresse ?? '';
        const ancien = champMdp('compte-mdp-actuel', T.mdp_actuel, 'current-password');
        const nouveau = champMdp('compte-mdp-nouveau', T.mdp_nouveau, 'new-password');
        const envoyer = () =>
          void agir(async (c) => {
            await c.changerMotDePasse(ancien.input.value, nouveau.input.value);
            dire(T.mdp_change);
            await apres(c);
          });
        return [
          creer('h3', {}, T.titre_mdp),
          formulaire(
            'compte-form-mdp',
            envoyer,
            nom,
            ancien.label,
            nouveau.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-mdp-ok', T.changer_bouton, envoyer, 'principal', 'submit'),
              bouton('compte-annuler', T.annuler, () => annuler()),
            ),
          ),
        ];
      }
      case 'perdue':
        return [
          creer('p', { id: 'compte-perdue' }, textePerdue(seancesPerdue)),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-reconnecter', T.se_reconnecter, () => {
              adresseSaisie = etat?.etat === 'perdue' ? (etat.adresse ?? '') : adresseSaisie;
              effacerAvis();
              aller('connecter');
            }, 'principal'),
            bouton('compte-sans-compte', T.continuer_sans, () => {
              effacerAvis();
              aller('sans-compte');
            }),
          ),
        ];
      case 'sans-compte':
        return [
          creer('p', {}, T.continuer_sans_confirmer),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-sans-compte-ok', T.continuer_sans_bouton, () =>
              void agir(async (c) => {
                await c.continuerSansCompte();
                dire(T.sans_compte);
                await apres(c);
              }), 'principal'),
            bouton('compte-annuler', T.annuler, () => aller('perdue')),
          ),
        ];
    }
  }

  /** L'écran de l'état du compte (formulaire refermé). */
  function ecranDe(e: EtatCompte): Ecran {
    return e.etat === 'compte' ? 'compte' : e.etat === 'perdue' ? 'perdue' : 'invite';
  }

  function annuler(): void {
    effacerAvis();
    aller(etat ? ecranDe(etat) : 'chargement');
  }

  /** Après une action réussie : l'état relu, son écran montré. */
  async function apres(c: Comptes): Promise<void> {
    etat = await c.etat();
    await lirePerdue();
    aller(ecranDe(etat));
  }

  async function lirePerdue(): Promise<void> {
    if (etat?.etat !== 'perdue' || !o.seances) return;
    try {
      seancesPerdue = await o.seances();
    } catch {
      seancesPerdue = null;
    }
  }

  /** L'état relu (ouverture, retour au premier plan, session perdue en cours de route). */
  async function rafraichir(): Promise<void> {
    if (occupe) return;
    if (!etat) aller('chargement');
    try {
      const c = await o.comptes();
      if (!abonne) {
        abonne = true;
        c.surChangement(() => {
          if (active && !occupe) void rafraichir();
        });
      }
      const avant = etat?.etat;
      etat = await c.etat();
      await lirePerdue();
      // Un formulaire ouvert reste tel quel, saisie comprise (retour d'une autre appli), sauf
      // si l'état a changé sous lui.
      const formulaireOuvert = ecran === 'creer' || ecran === 'connecter' || ecran === 'mdp' || ecran === 'sans-compte';
      if (!formulaireOuvert || avant !== etat.etat) aller(ecranDe(etat));
      else synchro.hidden = !synchroCoupee();
    } catch (e) {
      montrerErreur(e);
      if (!etat) aller('echec');
    }
  }

  const premierPlan = () => {
    if (active && (typeof document.visibilityState !== 'string' || document.visibilityState === 'visible')) void rafraichir();
  };

  return {
    activer() {
      active = true;
      effacerAvis();
      section.hidden = false;
      ctx.carte.masquer(true);
      document.addEventListener('visibilitychange', premierPlan);
      void rafraichir();
    },
    desactiver() {
      active = false;
      section.hidden = true;
      ctx.carte.masquer(false);
      document.removeEventListener('visibilitychange', premierPlan);
    },
  };
}
