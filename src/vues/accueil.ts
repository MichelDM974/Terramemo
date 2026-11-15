// Écran de connexion de la première ouverture (décision « Écran de
// connexion » du 10/11, #3 ; étude du J1b, § 9, « Écran de connexion ») : un
// panneau par-dessus la carte, figée et visible derrière un voile ; l'en-tête
// n'est pas utilisable (inert) tant qu'on n'a pas choisi. Trois entrées :
// « Continuer avec Google » (le site ; l'APK au lot 7), l'e-mail (se
// connecter, créer un compte, mot de passe oublié), « Continuer en invité »
// avec un pseudo d'invité, validé comme au classement (pseudoValide,
// clePermise) et rangé là où il le lit (terramemo.pseudo). Le lien
// Confidentialité se lit sans avoir choisi : la vue s'ouvre, le panneau
// s'efface, et son retour le ramène.
//
// Les entrées des comptes ne sont pas recopiées ici : ce sont les écrans de
// la vue Compte (accueilCompte, src/vues/compte.ts), dans leur morceau à la
// demande (sans le SDK de Firebase, qui ne vient qu'au premier signe
// d'intérêt). Ce petit fichier est dans le morceau principal : il montre le
// panneau, « Continuer en invité » et Confidentialité tout de suite, même si
// le morceau ne vient pas (hors ligne) ; on n'est jamais bloqué.
//
// Le choix est gardé (CLE_ACCUEIL) : ensuite, on arrive directement sur la
// carte. Il n'est pas demandé à un appareil dont la session connaît un compte
// (choix « compte » gardé alors). Il est au joueur : une déconnexion, « Effacer
// cet appareil » ou la fin d'une suppression le retirent avec le pseudo
// (src/sync/effacement.ts), et le panneau revient à la vue suivante (sauf
// Compte et Confidentialité), comme sur un appareil neuf. Stockage illisible
// (refusé, absent) : pas de panneau, le jeu s'ouvre comme avant (un choix
// qu'on ne peut pas garder reviendrait à chaque ouverture) ; illisible
// seulement en écriture (plein) : le choix vaut pour la page, jusqu'à un
// effacement (surEffacementJoueur), qui l'oublie aussi.
//
// Une session perdue (mot de passe ou adresse changés ailleurs, compte
// supprimé ailleurs ; étude du J1b, § 2.5) ramène le panneau (décision « Écran
// de connexion », remplacée le 15/11) : on ne joue que connecté ou en invité,
// jamais dans un entre-deux muet. Il porte alors l'écran de la session perdue
// de la vue Compte (accueilCompte, `perdue`) : « Session expirée :
// reconnecte-toi. », Google ou l'e-mail selon le compte, « Continuer sans
// compte » (l'invité garde les progrès de l'appareil, choix « invite »),
// « Effacer cet appareil » en petit (puis le panneau du premier affichage,
// comme après une déconnexion). main.ts le dit (perdue) au démarrage et à
// chaque changement des comptes ; il vient tout de suite, sauf pendant une
// partie (vues `parties`) : alors à la vue suivante, la partie finie ou son
// bilan quitté. Une fois par perte : refermé sans que la session soit réglée,
// il ne revient pas avant qu'elle l'ait été (pas de boucle). Hors ligne au
// démarrage, la session ne se sait pas perdue : rien ne change.
//
// L'invité n'appelle rien de Firebase : ni compte anonyme (créé à la première
// publication, décision « Comptes »), ni publication de ses records sous le
// pseudo donné ici (ils partent avec les prochains, ou par « Changer » du
// classement).
import { garderPseudoDans, lirePseudoDe } from '../epreuve/chrono';
import { surEffacementJoueur } from '../sync/effacement';
import { champPseudo } from './classement';
import { creer } from './commun';
import { textes } from './textes';

const T = textes.accueil;

/** Le choix gardé de la première ouverture (localStorage) : 'invite' ou 'compte'. */
export const CLE_ACCUEIL = 'terramemo.accueil';
export type ChoixAccueil = 'invite' | 'compte';

/** Ce que le panneau lit et écrit du localStorage. */
export type StockageAccueil = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Le choix gardé : 'invite' ou 'compte' (toute autre valeur non vide compte
 * pour un choix : jamais de panneau de trop), null s'il n'y en a pas,
 * undefined si le stockage est illisible (refusé, absent).
 */
export function lireChoix(st: Pick<Storage, 'getItem'> | null): ChoixAccueil | null | undefined {
  if (!st) return undefined;
  try {
    const v = st.getItem(CLE_ACCUEIL);
    return v ? (v as ChoixAccueil) : null;
  } catch {
    return undefined;
  }
}

/** Garde le choix ; faux s'il n'a pas pu l'être (stockage plein ou refusé). */
export function garderChoix(st: Pick<Storage, 'setItem'> | null, c: ChoixAccueil): boolean {
  if (!st) return false;
  try {
    st.setItem(CLE_ACCUEIL, c);
    return true;
  } catch {
    return false;
  }
}

/** Le panneau vient-il ? Comptes visibles, aucun choix gardé (stockage lisible), aucun compte dans la session. */
export function accueilRequis(o: { visibles: boolean; choix: ChoixAccueil | null | undefined; compte: boolean }): boolean {
  return o.visibles && o.choix === null && !o.compte;
}

/** Ce que montre le panneau : le premier affichage, ou une session perdue. */
export type ModeAccueil = 'premier' | 'perdue';

/** Les écrans des comptes montés dans le panneau (accueilCompte). */
export interface ComptesDuPanneau {
  element: HTMLElement;
  activer(): void;
  desactiver(): void;
  /** Le retour d'Android : vrai si un sous-écran s'est refermé (formulaire, question D22). */
  retour?(): boolean;
}

export interface OptionsAccueil {
  /** Où poser le panneau : hors de la zone de la carte (document.body), qui devient inerte. */
  hote: HTMLElement;
  /** L'en-tête : inerte tant qu'on n'a pas choisi, Confidentialité ouverte comprise. */
  entete: HTMLElement | null;
  /** La zone de la carte et des vues (main#app) : inerte quand le panneau se montre. */
  zone: HTMLElement;
  /** Le corps : data-accueil (attente, ouvert, suspendu), lu par les touches de zoom. */
  corps: HTMLElement;
  stockage(): StockageAccueil | null;
  /** L'icône de l'en-tête, devant le titre. */
  logo?: string | null;
  /**
   * Monte les écrans des comptes (morceau à la demande) ; rejette s'il ne
   * vient pas. `perdue` : l'écran de la session perdue, dont `fini` dit la
   * sortie (« compte » reconnecté, « invite » sans compte ou effacé).
   */
  monterComptes(o: { fini(choix?: ChoixAccueil): void; surEcran(choix: boolean): void; occupe(oui: boolean): void; perdue?: boolean }): Promise<ComptesDuPanneau>;
  /**
   * Session perdue, écrans des comptes absents (hors ligne) : « Continuer
   * sans compte » des comptes (comptes.continuerSansCompte), pour ne pas
   * rester sous le panneau. Absent : seul « Réessayer » reste.
   */
  sansCompte?(): Promise<void>;
  /** Les vues d'une partie (et de son bilan) : une session perdue y attend la vue suivante. */
  parties?: readonly string[];
  /** La navigation rend l'adresse affichée (nav.router) : le panneau ouvert ou fermé. */
  rendre(): void;
  /** L'état du compte connu de la page (src/sync/pont.ts) : un compte connecté ne revoit pas le panneau. */
  etatCompte(): 'invite' | 'compte' | 'perdue';
}

/** L'attente de la session au démarrage, au plus (accueil.demarrer). */
export const DELAI_SESSION = 3000;

/** inactif : jamais de panneau (comptes cachés, stockage illisible) ; ferme : pas maintenant, revu à chaque vue. */
export type EtatAccueil = 'inactif' | 'attente' | 'ouvert' | 'ferme';

export interface Accueil {
  /**
   * Au démarrage, une fois l'effacement laissé en route fini : `compte` dit si
   * la session de l'appareil connaît un compte. Le panneau s'ouvre, ou
   * l'en-tête est rendu. Une session qui ne répond pas en `delai` ms
   * (IndexedDB pendue) compte pour un invité : le panneau s'ouvre, l'en-tête
   * ne reste pas inerte pour toujours.
   */
  demarrer(compte: Promise<boolean>, delai?: number): Promise<void>;
  /**
   * La navigation, à chaque adresse : est-elle retenue (la carte à sa place,
   * le panneau par-dessus) ? Confidentialité ne l'est jamais. Un choix retiré
   * (déconnexion) rouvre ici le panneau, sauf sur Compte et Confidentialité.
   */
  retient(nom: string): boolean;
  /** La vue montrée : sur Confidentialité, le panneau s'efface (l'en-tête reste inerte) ; ailleurs il revient. */
  suivre(vue: string): void;
  /**
   * Le retour d'Android (src/retour-android.ts), le panneau montré : 'fait'
   * s'il a refermé un sous-écran, 'reduire' à ses entrées ; null sinon
   * (panneau fermé, ou Confidentialité ouverte : l'historique y ramène).
   */
  retour(): 'fait' | 'reduire' | null;
  /**
   * main.ts, au démarrage des comptes et à chacun de leurs changements : la
   * session est-elle perdue (§ 2.5) ? Vrai : le panneau de la session perdue,
   * tout de suite hors d'une partie, sinon à la vue suivante ; faux : rien
   * n'est plus dû, et une perte suivante le ramènera.
   */
  perdue(oui: boolean): void;
  etat(): EtatAccueil;
  /** Ce que le panneau montre (ou a montré en dernier). */
  mode(): ModeAccueil;
}

/**
 * Le panneau. Créé au démarrage, avant la navigation : sans choix gardé,
 * l'en-tête est inerte tout de suite (attente), le temps de lire la session.
 */
export function creerAccueil(o: OptionsAccueil): Accueil {
  let etat: EtatAccueil = 'inactif';
  /** Le choix de la page, quand le stockage ne l'a pas pris (plein). */
  let memoire: ChoixAccueil | null = null;
  let section: HTMLElement | null = null;
  let comptes: ComptesDuPanneau | null = null;
  let suspendu = false;
  let mode: ModeAccueil = 'premier';
  /** Une session perdue sue (perdue(vrai)), dont le panneau n'est pas encore venu. */
  let perdueDue = false;
  /** Le panneau de cette perte déjà montré : refermé sans qu'elle soit réglée, il ne revient pas (pas de boucle). */
  let perdueVue = false;
  /** La vue montrée (suivre) : une partie retarde le panneau d'une session perdue. */
  let vueCourante = '';
  // Le choix tenu en mémoire s'oublie avec ce qui est au joueur (déconnexion, « Effacer cet appareil », suppression).
  surEffacementJoueur(() => {
    memoire = null;
  });
  /** Le lien de Confidentialité suivi (pied du panneau, ou celui du formulaire « Créer ») : le focus y revient. */
  let lienSuivi: HTMLElement | null = null;

  const choixCourant = (): ChoixAccueil | null | undefined => {
    const c = lireChoix(o.stockage());
    return c === null ? memoire : c;
  };

  function inertes(entete: boolean, zone: boolean): void {
    if (o.entete) o.entete.inert = entete;
    o.zone.inert = zone;
  }

  function marquer(m: 'attente' | 'ouvert' | 'suspendu' | null): void {
    if (m) o.corps.dataset.accueil = m;
    else delete o.corps.dataset.accueil;
  }

  function garder(c: ChoixAccueil): void {
    if (!garderChoix(o.stockage(), c)) memoire = c;
  }

  function focaliser(e: HTMLElement | null | undefined): void {
    if (typeof e?.focus === 'function') e.focus();
  }

  /** Le panneau, construit à chaque ouverture (retiré de la page à la fermeture). */
  function construire(): HTMLElement {
    const st = o.stockage();
    const titre = creer(
      'h2',
      { class: 'accueil-titre', id: 'accueil-titre', tabindex: '-1' },
      ...(o.logo ? [creer('img', { class: 'logo', src: o.logo, width: '40', height: '40', alt: '' })] : []),
      T.titre,
    );
    const perdue = mode === 'perdue';
    const accroche = creer('p', { class: 'accueil-accroche', id: 'accueil-accroche' }, perdue ? textes.compte.perdue_aucune : T.accroche);

    // Les comptes : « Chargement… », puis leurs écrans ; s'ils ne viennent pas, un avis et « Réessayer ».
    const avis = creer('p', { class: 'hint', id: 'accueil-comptes-avis', 'aria-live': 'polite' }, T.chargement);
    const reessayer = creer('button', { type: 'button', class: 'secondary', id: 'accueil-comptes-reessayer' }, T.reessayer);
    reessayer.hidden = true;
    const attente = creer('div', { class: 'accueil-comptes-attente' }, avis, reessayer);
    const zoneComptes = creer('div', { class: 'accueil-comptes', id: 'accueil-comptes' }, attente);

    // Session perdue : l'invité passe par « Continuer sans compte » de l'écran des comptes ; ce bouton-ci
    // ne se montre que s'ils ne viennent pas (hors ligne), et ce sont alors les comptes qui le font.
    const invite = creer('button', { type: 'button', class: 'secondary accueil-invite', id: 'accueil-invite' }, perdue ? textes.compte.continuer_sans : T.invite);
    const partieInvite = creer('div', { class: 'accueil-partie-invite', id: 'accueil-partie-invite' }, creer('p', { class: 'accueil-ou', 'aria-hidden': 'true' }, T.ou), invite);
    partieInvite.hidden = perdue;
    const choix = creer('div', { class: 'accueil-choix', id: 'accueil-choix' }, zoneComptes, partieInvite);

    // L'invité : son pseudo seul (celui de l'appareil pré-rempli : un joueur qui a déjà des progrès), validé comme
    // au classement. Rien d'autre à lire (demande de l'utilisateur, 12/11 : « trop de blabla ») : l'erreur ne
    // vient qu'à un pseudo refusé, et « Retour » est un lien.
    const erreur = creer('p', { class: 'status error', id: 'accueil-erreur', role: 'alert' });
    const pseudo = champPseudo({ id: 'accueil-pseudo', libelle: T.pseudo_libelle, valeur: lirePseudoDe(st) ?? '', erreur, entree: 'go' });
    const champ = pseudo.input;
    const commencer = creer('button', { type: 'submit', id: 'accueil-commencer' }, T.commencer);
    const retour = creer('button', { type: 'button', class: 'lien', id: 'accueil-retour' }, T.retour);
    const formInvite = creer(
      'form',
      { class: 'compte-form accueil-form-invite', id: 'accueil-form-invite', novalidate: '' },
      pseudo.bloc,
      erreur,
      creer('div', { class: 'compte-actions' }, commencer),
      creer('p', { class: 'accueil-liens' }, retour),
    );
    formInvite.hidden = true;

    const lien = creer('a', { href: '#confidentialite', id: 'accueil-confidentialite' }, textes.confidentialite.lien);
    // Le pied (Confidentialité) reste aux entrées ; il se tait pendant l'écran de l'invité.
    const pied = creer('p', { class: 'accueil-liens', id: 'accueil-pied' }, lien);
    const panneau = creer('div', { class: 'panel accueil-panneau' }, titre, accroche, choix, formInvite, pied);
    const s = creer('section', { class: 'accueil ecrans-compte', id: 'accueil', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'accueil-titre', 'aria-describedby': 'accueil-accroche' }, panneau);

    invite.addEventListener('click', () => {
      if (perdue) {
        invite.disabled = true;
        void (o.sansCompte?.() ?? Promise.reject(new Error('sans comptes'))).then(
          () => {
            if (section === s) fermer('invite');
          },
          (e: unknown) => {
            console.warn('Écran de connexion : continuer sans compte', e);
            invite.disabled = false;
            avis.textContent = T.comptes_echec_perdue;
          },
        );
        return;
      }
      choix.hidden = true;
      pied.hidden = true;
      formInvite.hidden = false;
      erreur.textContent = '';
      focaliser(champ);
    });
    retour.addEventListener('click', () => {
      formInvite.hidden = true;
      choix.hidden = false;
      pied.hidden = false;
      focaliser(invite);
    });
    formInvite.addEventListener('submit', (e) => {
      (e as Event).preventDefault?.();
      const p = pseudo.valider();
      if (!p) return;
      // Là où le classement le lit (lirePseudo) ; rien n'est publié d'ici (aucun appel à Firebase).
      garderPseudoDans(o.stockage(), p);
      fermer('invite');
    });

    const monter = () => {
      avis.textContent = T.chargement;
      reessayer.hidden = true;
      o.monterComptes({
        fini: (c = 'compte') => {
          // « Effacer cet appareil » d'une session perdue : le choix retiré avec le reste, le panneau du
          // premier affichage à la place, comme après une déconnexion.
          if (perdue && c === 'invite' && choixCourant() === null) return ouvrir(true, 'premier');
          fermer(c);
        },
        // « Continuer en invité » sous les entrées seulement (pas pendant un formulaire, la question D22, le pseudo).
        // Session perdue : jamais (« Continuer sans compte » est dans l'écran des comptes).
        surEcran: (c) => {
          partieInvite.hidden = perdue || !c;
        },
        // Pendant la fenêtre de Google ou une connexion : « Continuer en invité » désactivé (le compte se prendrait derrière).
        occupe: (oui) => {
          invite.disabled = oui;
        },
        ...(perdue ? { perdue: true } : {}),
      }).then(
        (c) => {
          if (section !== s) return c.desactiver();
          comptes = c;
          zoneComptes.replaceChildren(c.element);
          c.activer();
        },
        (e: unknown) => {
          console.warn('Écran de connexion : comptes non chargés', e);
          avis.textContent = perdue ? T.comptes_echec_perdue : T.comptes_echec;
          reessayer.hidden = false;
          if (perdue && o.sansCompte) partieInvite.hidden = false;
        },
      );
    };
    reessayer.addEventListener('click', monter);
    // Le lien de Confidentialité suivi, quel qu'il soit : son retour y ramène le focus.
    s.addEventListener('click', (ev) => {
      const t = (ev as Event).target as HTMLElement | null;
      const a = t?.closest?.('a[href="#confidentialite"]') as HTMLElement | null | undefined;
      if (a) lienSuivi = a;
    });
    monter();
    return s;
  }

  function ouvrir(rendre: boolean, m: ModeAccueil = 'premier'): void {
    etat = 'ouvert';
    suspendu = false;
    mode = m;
    if (m === 'perdue') {
      perdueDue = false;
      perdueVue = true;
    }
    comptes?.desactiver();
    comptes = null;
    section?.remove();
    section = construire();
    o.hote.append(section);
    marquer('ouvert');
    inertes(true, true);
    focaliser(section.querySelector<HTMLElement>('#accueil-titre'));
    if (rendre) o.rendre();
  }

  function fermer(c: ChoixAccueil): void {
    // La session réglée (reconnectée, invitée, effacée) : une perte suivante ramènera le panneau.
    if (o.etatCompte() !== 'perdue') perdueVue = false;
    garder(c);
    comptes?.desactiver();
    comptes = null;
    section?.remove();
    section = null;
    lienSuivi = null;
    etat = 'ferme';
    suspendu = false;
    marquer(null);
    inertes(false, false);
    o.rendre();
    // Le panneau parti avec le focus : le bouton Jouer de l'en-tête, rendu utilisable.
    focaliser(o.entete?.querySelector<HTMLElement>('#jouer-btn'));
  }

  /** Le panneau d'une session perdue peut-il venir sur cette vue ? Ni pendant une partie, ni sur Compte (qui le montre) ni Confidentialité. */
  const perdueSurVue = (nom: string): boolean =>
    etat === 'ferme' && perdueDue && !perdueVue && o.etatCompte() === 'perdue' && nom !== 'compte' && nom !== 'confidentialite' && !(o.parties ?? []).includes(nom);

  // Sans choix gardé, l'en-tête attend la lecture de la session (quelques ms) : rien ne se joue avant.
  const depart = choixCourant();
  if (depart === null) {
    etat = 'attente';
    marquer('attente');
    inertes(true, false);
  }

  return {
    async demarrer(compte, delai = DELAI_SESSION) {
      // Stockage illisible : jamais de panneau (le choix ne pourrait pas se garder).
      if (depart === undefined) return;
      const attendait = etat === 'attente';
      let aCompte = false;
      let minuterie: ReturnType<typeof setTimeout> | undefined;
      try {
        // Une session qui ne répond pas (indexedDB.open pendu, connu de WebKit) : un invité, comme une session illisible.
        aCompte = await Promise.race([compte, new Promise<boolean>((ok) => (minuterie = setTimeout(() => ok(false), delai)))]);
      } catch {
        // Session illisible : l'appareil est pris pour un invité.
      } finally {
        clearTimeout(minuterie);
      }
      // Relu : un effacement laissé en route (déconnexion) a pu retirer le choix entre-temps.
      const c = choixCourant();
      if (c === undefined) etat = 'inactif';
      else if (accueilRequis({ visibles: true, choix: c, compte: aCompte })) return ouvrir(true);
      else {
        if (c === null) garder('compte');
        etat = 'ferme';
      }
      if (attendait) {
        marquer(null);
        inertes(false, false);
        o.rendre();
      }
    },
    retient(nom) {
      if (perdueSurVue(nom)) ouvrir(false, 'perdue');
      else if (etat === 'ferme' && nom !== 'compte' && nom !== 'confidentialite' && choixCourant() === null && o.etatCompte() === 'invite') ouvrir(false);
      return (etat === 'ouvert' || etat === 'attente') && nom !== 'confidentialite';
    },
    retour() {
      if (etat !== 'ouvert' || !section || suspendu) return null;
      const retourInvite = section.querySelector<HTMLButtonElement>('#accueil-retour');
      const formInvite = section.querySelector<HTMLElement>('#accueil-form-invite');
      if (formInvite && !formInvite.hidden && retourInvite) {
        retourInvite.click();
        return 'fait';
      }
      return comptes?.retour?.() ? 'fait' : 'reduire';
    },
    suivre(vue) {
      vueCourante = vue;
      if (etat !== 'ouvert' || !section) return;
      const s = vue === 'confidentialite';
      if (s === suspendu) return;
      suspendu = s;
      section.hidden = s;
      marquer(s ? 'suspendu' : 'ouvert');
      inertes(true, !s);
      // Au retour de Confidentialité, le lien d'où l'on venait (pied du panneau, ou formulaire « Créer »).
      if (!s) focaliser(lienSuivi && section.contains(lienSuivi) ? lienSuivi : section.querySelector<HTMLElement>('#accueil-confidentialite'));
    },
    perdue(oui) {
      if (!oui) {
        perdueDue = perdueVue = false;
        return;
      }
      if (etat === 'inactif' || perdueVue) return;
      perdueDue = true;
      // Hors d'une partie, tout de suite ; sinon à la vue suivante (retient). Panneau du premier affichage
      // ouvert, ou en attente : à sa fermeture.
      if (perdueSurVue(vueCourante)) ouvrir(true, 'perdue');
    },
    etat: () => etat,
    mode: () => mode,
  };
}
