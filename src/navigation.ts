// Navigation par l'ancre (décisions « En-tête » et « Écran Jouer », #18) : la
// carte (l'accueil), Jouer (l'arbre : #jouer/classe/pays/Africa), Toucher et
// les épreuves (vue « chrono »), les classements (🏆), la Saisie (⚙). Sorti de
// main.ts pour être testé avec un historique factice (tests/navigation.test.ts) :
// l'historique, les redirections des vues de partie et le « × » de Jouer
// s'enchaînent, et un défaut de l'un ne se voit qu'avec les autres.
//
// L'historique : chaque niveau de Jouer est une entrée (un niveau sauté n'en a
// pas), et chaque entrée garde la pile des adresses d'avant (history.state),
// pour que « ‹ », « × », « Autre série » et le retour d'une partie remontent
// l'historique (pasVers) au lieu d'y empiler une entrée : le retour du
// navigateur (et celui d'Android dans l'APK : src/retour-android.ts) remonte
// alors l'arbre d'un niveau à la fois, sans jamais y redescendre. Une entrée
// sans état (le
// chargement, un lien de l'en-tête) reçoit la pile de l'entrée d'avant, plus
// l'adresse d'avant.
//
// Une adresse peut être retenue (écran de connexion de la première ouverture,
// src/vues/accueil.ts) : la carte se montre à sa place, sous le panneau,
// l'adresse reste affichée et l'historique la garde ; le router() suivant
// (panneau fermé) la rend telle quelle (#compte : la vue Compte).
import { depuisAncre, pasVers, versAncre } from './vues/arbre';

/** Ce que la navigation demande à window.history (un historique factice dans les tests). */
export interface Historique {
  readonly state: unknown;
  pushState(etat: unknown, inutilise: string, url?: string): void;
  replaceState(etat: unknown, inutilise: string, url?: string): void;
  go(delta: number): void;
}

/** Ce que la navigation demande à une vue (src/vues/commun.ts : Vue). */
export interface VueNavigable {
  activer(): void;
  desactiver(): void;
  redirection?(): { cible: string; message?: string } | null;
  aMontrer?(): boolean;
}

export interface OptionsNavigation<V extends VueNavigable> {
  history: Historique;
  /** L'ancre affichée (location.hash). */
  ancre(): string;
  /** Les vues, par le premier segment de l'ancre. */
  noms: readonly string[];
  /** L'accueil (la carte) : une vue inconnue, et la vue d'avant tant qu'il n'y en a pas d'autre. */
  accueil: string;
  /** Vues de passage (Jouer, 🏆) : leur « Retour » ramène à la vue d'avant elles. */
  passage: readonly string[];
  /** La vue à segments (Jouer) : ses segments vont à aller(). */
  arbre: string;
  vue(nom: string): V | undefined;
  /**
   * L'adresse de cette vue est-elle retenue (écran de connexion ouvert) ?
   * L'accueil se montre alors à sa place, sans redirection ni niveau de Jouer.
   */
  retenue?(nom: string): boolean;
  /** Chaque adresse rendue : la vue montrée (body.dataset.vue, bouton de l'en-tête). */
  surAdresse?(nom: string): void;
  /** Juste avant d'activer une vue (toute vue part du monde). */
  avantActiver?(): void;
  /** Le niveau de Jouer de ces segments (VueJouer.aller). */
  aller(segs: string[]): void;
  /** Un message au statut du prochain niveau de Jouer (VueJouer.annoncer). */
  annoncer(message: string): void;
  /** L'adresse canonique d'une adresse de Jouer (niveau sauté, adresse invalide). */
  canonique(cible: string): string;
}

export interface Navigation<V extends VueNavigable> {
  /** Rend l'adresse affichée (hashchange, popstate, démarrage). */
  router(): void;
  /** Va à cette adresse (vue, ou niveau de Jouer) : une entrée d'historique de plus. */
  pousser(a: string): void;
  /** Remonte à cette adresse : l'historique, si elle est dans la pile, sinon à la place de l'entrée affichée. */
  remonter(a: string): void;
  /** Vers ce niveau de Jouer (remis à sa forme canonique), ce message à son statut. */
  versJouer(cible: string, message?: string): void;
  /** L'adresse affichée remise à sa forme canonique, sans nouvelle entrée. */
  canoniser(a: string): void;
  /** « Retour » des classements, de Crédits… : la vue d'avant, en remontant l'historique (les « × » vont à la carte : remonter('carte'), #18). */
  retour(): void;
  /** Ouvre la vue d'une partie qu'on lance : sans redirection (elle n'a pas encore sa partie). */
  ouvrirPartie(nom: string): void;
  /** La vue affichée (les touchers de la carte vont à elle). */
  active(): V | null;
}

interface EtatHistorique {
  pile: string[];
}
const PILE_MAX = 40;

export function creerNavigation<V extends VueNavigable>(o: OptionsNavigation<V>): Navigation<V> {
  const h = o.history;
  /** L'adresse affichée (sans « # ») et la pile de son entrée. */
  let adresseRendue: string | null = null;
  let pileRendue: string[] = [];
  let vueActive: V | null = null;
  let nomActif: string | null = null;
  /** La dernière vue quittée qui n'était pas de passage. */
  let precedente = o.accueil;
  /**
   * La dernière vue quittée qui n'a pas de partie (la carte, la Saisie) : le
   * « × » de Jouer y va quand `precedente` est une vue de partie qui n'a plus
   * rien à montrer (partie abandonnée, bilan quitté par « Autre série »).
   * Sans elle, ce « × » rouvrait Toucher ou Chrono, qui renvoyaient aussitôt
   * à Jouer (redirection) : Jouer ne se fermait plus (relecture de #18).
   */
  let durable = o.accueil;
  /** Une partie se lance : sa vue s'ouvre sans redirection, la partie suit. */
  let enLancement = false;
  /**
   * L'ancre de l'entrée d'où part un history.go() pas encore arrivé. Une
   * traversée donne un popstate puis un hashchange (Chromium compris, et
   * Chromium donne aussi les deux pour un lien) : le second, qui arrive
   * avant le go() et lit encore la même ancre, relançait la redirection, donc
   * un second go(), et l'on remontait de deux niveaux (relecture de #18).
   */
  let traversee: string | null = null;

  function etatHistorique(): EtatHistorique | null {
    const e = h.state as Partial<EtatHistorique> | null;
    return e && Array.isArray(e.pile) ? (e as EtatHistorique) : null;
  }

  /** L'adresse demandée : la vue (premier segment), et pour Jouer ses segments. */
  function demandee(): { nom: string; segs: string[] } {
    const [tete = '', ...reste] = depuisAncre(o.ancre());
    const nom = o.noms.includes(tete) ? tete : o.accueil;
    return { nom, segs: nom === o.arbre ? reste : [] };
  }

  function router(): void {
    if (traversee !== null) {
      if (o.ancre() === traversee) return;
      traversee = null;
    }
    const e = etatHistorique();
    if (e) pileRendue = e.pile;
    else {
      pileRendue = adresseRendue === null ? [] : [...pileRendue, adresseRendue].slice(-PILE_MAX);
      h.replaceState({ pile: pileRendue } satisfies EtatHistorique, '');
    }
    const { nom, segs } = demandee();
    adresseRendue = [nom, ...segs].join('/');
    // Retenue : l'accueil à la place de la vue demandée, l'adresse gardée.
    const montre = o.retenue?.(nom) ? o.accueil : nom;
    o.surAdresse?.(montre);
    const v = o.vue(montre);
    if (!v) return;
    if (v !== vueActive) {
      // Toucher ou une épreuve sans partie à montrer : Jouer à sa place.
      const r = enLancement ? null : (v.redirection?.() ?? null);
      if (r) return versJouer(r.cible, r.message);
      if (nomActif && !o.passage.includes(nomActif)) {
        precedente = nomActif;
        if (!vueActive?.aMontrer) durable = nomActif;
      }
      vueActive?.desactiver();
      vueActive = v;
      nomActif = montre;
      o.avantActiver?.();
      v.activer();
    }
    if (montre === o.arbre) o.aller(segs);
  }

  function pousser(a: string): void {
    traversee = null;
    if (a === adresseRendue) return router();
    h.pushState({ pile: [...pileRendue, adresseRendue ?? o.accueil].slice(-PILE_MAX) } satisfies EtatHistorique, '', versAncre(a));
    router();
  }

  function remonter(a: string): void {
    traversee = null;
    if (a === adresseRendue) return router();
    const n = pasVers(pileRendue, a);
    if (n) {
      traversee = o.ancre();
      return h.go(-n);
    }
    h.replaceState(h.state, '', versAncre(a));
    router();
  }

  function versJouer(cible: string, message = ''): void {
    if (message) o.annoncer(message);
    remonter(o.canonique(cible));
  }

  function canoniser(a: string): void {
    h.replaceState(h.state, '', versAncre(a));
    adresseRendue = a;
  }

  function retour(): void {
    // Une vue de partie qui n'a plus rien à montrer renverrait à Jouer : la dernière vue sans partie.
    const v = o.vue(precedente);
    remonter(v?.aMontrer && !v.aMontrer() ? durable : precedente);
  }

  function ouvrirPartie(nom: string): void {
    enLancement = true;
    try {
      pousser(nom);
    } finally {
      enLancement = false;
    }
  }

  return { router, pousser, remonter, versJouer, canoniser, retour, ouvrirPartie, active: () => vueActive };
}
