// Vue « Compte » (⚙ › Compte, #compte ; étude du J1b, § 3), lot 1 : invité,
// création d'un compte e-mail (lien de l'invité anonyme), connexion, mot de
// passe oublié, adresse non vérifiée (renvoi, non bloquante : D18 b),
// changement du mot de passe, déconnexion, session perdue. Morceau chargé à
// la demande avec src/sync/comptes.ts (vueCompteALaDemande, main.ts) : un
// invité ne charge jamais Firebase au démarrage (D9 b).
//
// Lot 2 : le pseudo du compte, modifiable (pseudoValide), écrit dans le
// profil `joueurs/{uid}` avec les records ; à la connexion, un pseudo de
// l'appareil remplacé par celui du compte est dit une fois (§ 2.3, étape 7).
// Lot 3 : l'état de la synchro du compte (§ 3.2, une ligne : à jour, séances
// en attente, hors ligne, séances refusées · « Réessayer »), et le nombre de
// séances pas encore envoyées d'une session perdue. Viendront ensuite :
// question de fusion, déconnexion reprenable et « Effacer cet appareil » (lot 4),
// export, suppression et lien vers la politique (lot 5), Google (lots 6 et
// 7). Les champs portent autocomplete et inputmode : le remplissage
// automatique d'Android marche ainsi dans la WebView (§ 3.2). Textes :
// textes.fr.json (compte), erreurs traduites par src/sync/erreurs.ts.
import { prendreAvisPseudo, pseudoValide } from '../epreuve/chrono';
import type { Comptes, EtatCompte, ResultatProfil } from '../sync/comptes';
import { synchroCoupee } from '../sync/drapeaux';
import type { Envoi, EtatSynchro } from '../sync/envoi';
import { codeErreur, traduire } from '../sync/erreurs';
import { lirePseudo } from './classement';
import { creer, type ContexteVue, type Vue } from './commun';
import { remplir, textes } from './textes';

const T = textes.compte;

type Ecran = 'chargement' | 'echec' | 'invite' | 'creer' | 'connecter' | 'compte' | 'mdp' | 'pseudo' | 'perdue' | 'sans-compte';

/** Ce que dit la connexion du pseudo : celui de l'appareil remplacé par celui du compte, dit une fois. */
export function textePseudoDuCompte(p: ResultatProfil | null | undefined): string {
  return p?.ancienPseudo && p.pseudo ? remplir(T.pseudo_du_compte, { pseudo: p.pseudo }) : '';
}

function stockageDeLaPage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Le profil a reçu le pseudo (ou l'avait déjà) ; sinon il attend sur l'appareil. */
const profilAJour = (p: ResultatProfil) => p.etat === 'a_jour' || p.etat === 'cree' || p.etat === 'ecrit';

export interface OptionsVueCompte {
  retour: () => void;
  /** Les comptes de la page (Firebase chargé au premier appel). */
  comptes: () => Promise<Comptes>;
  /**
   * L'envoi des séances (src/sync/envoi.ts, chargé avec les comptes) : état
   * de la synchro, « Réessayer », séances pas encore envoyées d'une session
   * perdue (§ 2.5).
   */
  envoi?: () => Promise<Pick<Envoi, 'etat' | 'compter' | 'declencher' | 'surPasse'>>;
}

/** La ligne de l'état de la synchro d'un compte (§ 3.2), sans « Réessayer ». */
export function texteSynchro(e: EtatSynchro): string {
  if (e.coupee) return T.synchro_coupee;
  if (e.refusees) return e.refusees === 1 ? T.synchro_refusee_une : remplir(T.synchro_refusees, { n: e.refusees });
  if (e.attente && e.horsLigne) return T.synchro_hors_ligne;
  if (e.attente) return e.attente === 1 ? T.synchro_attente_une : remplir(T.synchro_attente, { n: e.attente });
  return T.synchro_a_jour;
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
  let synchroLue: EtatSynchro | null = null;
  let abonne = false;
  let abonneEnvoi = false;

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
  /** L'avis d'un pseudo remplacé par celui du compte : dit par le message de la connexion, il ne se redit pas ailleurs. */
  const avisPseudoDit = () => void prendreAvisPseudo(stockageDeLaPage());

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
    rendreSynchro();
    contenu.replaceChildren(...ecranCourant());
  }

  /** La ligne de la synchro : l'état d'un compte sur son écran ; ailleurs, seulement « Synchro coupée ». */
  function rendreSynchro(): void {
    const e = ecran === 'compte' ? synchroLue : null;
    if (!e) {
      synchro.hidden = !synchroCoupee();
      synchro.replaceChildren(T.synchro_coupee);
      return;
    }
    synchro.hidden = false;
    synchro.replaceChildren(texteSynchro({ ...e, coupee: e.coupee || synchroCoupee() }));
    if (e.refusees && !e.coupee) synchro.append(' · ', bouton('compte-synchro-reessayer', T.synchro_reessayer, () => void reessayer(), 'lien'));
  }

  async function lireSynchro(): Promise<void> {
    if (etat?.etat !== 'compte' || !o.envoi) {
      synchroLue = null;
      return;
    }
    try {
      const e = await o.envoi();
      if (!abonneEnvoi) {
        abonneEnvoi = true;
        // Après chaque passe (clôture d'une séance, retour du réseau) : la ligne suit.
        e.surPasse(() => {
          if (active) void lireSynchro().then(rendreSynchro);
        });
      }
      synchroLue = etat?.etat === 'compte' ? await e.etat(etat.uid) : null;
    } catch {
      synchroLue = null;
    }
  }

  /** « Réessayer » : les lots refusés relancés, puis la ligne relue. */
  async function reessayer(): Promise<void> {
    if (!o.envoi) return;
    try {
      await (await o.envoi()).declencher('reessayer');
    } catch (e) {
      montrerErreur(e);
    }
    await lireSynchro();
    rendreSynchro();
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
            avisPseudoDit();
            dire([r.verification ? remplir(T.cree, { adresse: r.adresse }) : T.cree_sans_email, textePseudoDuCompte(r.profil)].filter(Boolean).join(' '));
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
            avisPseudoDit();
            dire([remplir(T.connecte, { adresse: r.adresse }), textePseudoDuCompte(r.profil)].filter(Boolean).join(' '));
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
        // Le pseudo du compte (§ 3.2) : celui du profil, recopié sur l'appareil.
        const pseudo = lirePseudo();
        lignes.push(
          creer(
            'p',
            { class: 'hint', id: 'compte-pseudo-actuel' },
            `${pseudo ? remplir(T.pseudo, { pseudo }) : T.pseudo_aucun} · `,
            bouton('compte-vers-pseudo', pseudo ? T.pseudo_changer : T.pseudo_choisir, () => {
              effacerAvis();
              aller('pseudo');
            }, 'lien'),
          ),
        );
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
      case 'pseudo': {
        const p = champ('compte-pseudo', T.pseudo_libelle, { type: 'text', name: 'pseudo', maxlength: '20', autocomplete: 'nickname', autocapitalize: 'words', spellcheck: 'false', required: '' }, lirePseudo() ?? '');
        const envoyer = () => {
          const v = pseudoValide(p.input.value);
          if (!v) {
            erreur.textContent = textes.chrono.pseudo_invalide;
            return;
          }
          void agir(async (c) => {
            const r = await c.changerPseudo(v);
            dire(profilAJour(r) ? remplir(T.pseudo_change, { pseudo: v }) : T.pseudo_garde);
            await apres(c);
          });
        };
        return [
          creer('h3', {}, T.titre_pseudo),
          creer('p', { class: 'hint' }, T.pseudo_aide),
          formulaire(
            'compte-form-pseudo',
            envoyer,
            p.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-pseudo-ok', T.pseudo_bouton, envoyer, 'principal', 'submit'),
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
    await lireSynchro();
    aller(ecranDe(etat));
  }

  /** Les séances pas encore acceptées du dernier compte (sans réseau : le journal et les lots de l'appareil). */
  async function lirePerdue(): Promise<void> {
    if (etat?.etat !== 'perdue' || !o.envoi) return;
    try {
      seancesPerdue = (await (await o.envoi()).compter(etat.uid)).nonEnvoyees;
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
      await lireSynchro();
      // Un pseudo remplacé par celui du compte à une ouverture de l'appli, que personne n'a lu : dit ici, une fois.
      const ancien = etat.etat === 'compte' && !message.textContent ? prendreAvisPseudo(stockageDeLaPage()) : null;
      if (ancien) dire(remplir(T.pseudo_du_compte, { pseudo: lirePseudo() ?? '' }));
      // Un formulaire ouvert reste tel quel, saisie comprise (retour d'une autre appli), sauf
      // si l'état a changé sous lui.
      const formulaireOuvert = ecran === 'creer' || ecran === 'connecter' || ecran === 'mdp' || ecran === 'pseudo' || ecran === 'sans-compte';
      if (!formulaireOuvert || avant !== etat.etat) aller(ecranDe(etat));
      else rendreSynchro();
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
