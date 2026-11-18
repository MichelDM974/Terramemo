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
// La fiche d'un lieu (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 4.4) : chaque fiche ouverte est une entrée d'historique sur la même adresse
// (#carte), posée ici et nulle part ailleurs (pousserFiche), avec la pile mise à
// jour comme pour une vue : un pushState posé hors d'ici laisserait la pile
// rendue à l'entrée d'avant, et un « Retour » remonterait vers une entrée #carte
// que router() prendrait pour la traversée en cours. Tous les gestes « retour »
// (« ‹ », Échap, le retour d'Android, celui du navigateur) font donc
// history.back() : la fiche d'avant, puis la barre ; le retour du navigateur ne
// fait plus sortir du site. La « × » remonte toutes les entrées de fiche d'un
// coup (quitterFiches). router() rend à la carte la fiche de l'entrée affichée
// (surFiche), ou null. Dans la pile, l'adresse d'une entrée de fiche porte une
// marque (MARQUE_FICHE) : la « × » d'une vue ouverte par-dessus une fiche
// (Jouer, 🏆, Crédits : remonter('carte')) va à l'entrée #carte d'avant les
// fiches, la carte seule (décision « Croix vers la carte », § 4.2 : changer de
// vue ferme la fiche) ; son « Retour » (retour()) prend l'entrée la plus
// proche, fiche comprise : la vue d'avant, un pas en arrière.
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
  /**
   * La fiche de l'entrée rendue (EntreeFiche), ou null, à chaque adresse de
   * l'accueil rendue, après son activer() : la carte l'ouvre ou la ferme
   * (VueExplorer.surFiche). Jamais appelé pour une autre vue : la quitter
   * ferme la fiche (desactiver).
   */
  surFiche?(fiche: EntreeFiche | null): void;
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
  /**
   * Ouvre la fiche de ce lieu sur la carte : une entrée d'historique de plus,
   * même adresse (une par fiche, voisins compris) ; surFiche la rend.
   */
  pousserFiche(lieu: LieuFiche): void;
  /** La « × » de la fiche : remonte d'un coup toutes les entrées de fiche du sommet ; surFiche(null) suit. */
  quitterFiches(): void;
  /** La fiche de l'entrée affichée, ou null. */
  fiche(): EntreeFiche | null;
  /** L'adresse affichée telle que la pile la garde (« toucher », « jouer/entrainement »), null avant le premier router(). */
  adresse(): string | null;
  /** Un history.go() de remonter(), retour() ou quitterFiches() est-il parti, pas encore arrivé ? */
  enRoute(): boolean;
}

/**
 * Le lieu d'une fiche : son terrain et son id ; `bilan` : la première fiche
 * ouverte depuis un bilan (#34, lot F6, § 4.6), dont « ‹ » dit « Retour au
 * bilan » et remonte à son adresse (main.ts : remonter ; la pile compte les
 * entrées de fiche).
 */
export interface LieuFiche {
  terrain: string;
  id: string;
  bilan?: boolean;
}

/** Une fiche dans l'historique : son lieu et son rang (1 : la première ouverte depuis la barre). */
export interface EntreeFiche extends LieuFiche {
  rang: number;
}

interface EtatHistorique {
  pile: string[];
  /** L'entrée d'une fiche ouverte sur la carte (§ 4.4). */
  fiche?: EntreeFiche;
}
const PILE_MAX = 40;
/** Ajoutée dans la pile à l'adresse d'une entrée qui porte une fiche (une adresse n'a jamais de « # »). */
const MARQUE_FICHE = '#fiche';

export function creerNavigation<V extends VueNavigable>(o: OptionsNavigation<V>): Navigation<V> {
  const h = o.history;
  /** L'adresse affichée (sans « # ») et la pile de son entrée. */
  let adresseRendue: string | null = null;
  let pileRendue: string[] = [];
  /** L'entrée rendue porte-t-elle une fiche (son adresse marquée dans les piles qui la suivent) ? */
  let ficheRendue = false;
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
  /**
   * Un quitterFiches() pas encore arrivé : les router() lus encore sur une
   * entrée de fiche sont ceux de son départ (le hashchange qui suit le
   * popstate d'une traversée #jouer → #carte, par exemple) ; la carte qui y
   * refuserait de nouveau la fiche (partie en suspens) redemanderait un go(),
   * et l'on remonterait trop loin. L'arrivée est toujours une entrée sans
   * fiche (go(-rang)).
   */
  let enQuittant = false;
  /**
   * Le premier router() de la page : history.state survit à un rechargement
   * (F5, un onglet repris par Android). Une entrée de fiche y est remontée au
   * lieu d'être rouverte, pour que rien de la fiche ne se charge au premier
   * affichage (§ 6.1) ; la carte seule, comme après la « × ».
   */
  let demarrage = true;

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

  /** L'adresse rendue telle que la pile des entrées suivantes la garde (marquée si l'entrée porte une fiche). */
  function adresseEmpilee(): string {
    const a = adresseRendue ?? o.accueil;
    return ficheRendue ? a + MARQUE_FICHE : a;
  }

  function router(): void {
    if (enQuittant) {
      if (etatHistorique()?.fiche) return;
      enQuittant = false;
    }
    if (traversee !== null) {
      if (o.ancre() === traversee) return;
      traversee = null;
    }
    if (demarrage) {
      demarrage = false;
      if (etatHistorique()?.fiche) return quitterFiches();
    }
    const e = etatHistorique();
    if (e) pileRendue = e.pile;
    else {
      pileRendue = adresseRendue === null ? [] : [...pileRendue, adresseEmpilee()].slice(-PILE_MAX);
      h.replaceState({ pile: pileRendue } satisfies EtatHistorique, '');
    }
    const { nom, segs } = demandee();
    adresseRendue = [nom, ...segs].join('/');
    ficheRendue = nom === o.accueil && !!e?.fiche;
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
    // La fiche de l'entrée (ou aucune), rendue à la carte après son activer().
    if (montre === o.accueil && v === vueActive) o.surFiche?.(nom === montre ? (e?.fiche ?? null) : null);
  }

  function pousser(a: string): void {
    traversee = null;
    enQuittant = false;
    if (a === adresseRendue) return router();
    h.pushState({ pile: [...pileRendue, adresseEmpilee()].slice(-PILE_MAX) } satisfies EtatHistorique, '', versAncre(a));
    router();
  }

  /**
   * `avecFiches` : une entrée de fiche convient aussi (le « Retour » d'une
   * vue : la vue d'avant, la fiche rouverte) ; sinon seule une entrée sans
   * fiche (la « × » : la carte seule, § 4.4).
   */
  function remonterVers(a: string, avecFiches: boolean): void {
    traversee = null;
    enQuittant = false;
    if (a === adresseRendue) return router();
    const sans = pasVers(pileRendue, a);
    const avec = avecFiches ? pasVers(pileRendue, a + MARQUE_FICHE) : 0;
    const n = sans && avec ? Math.min(sans, avec) : sans || avec;
    if (n) {
      traversee = o.ancre();
      return h.go(-n);
    }
    // À la place de l'entrée affichée (l'adresse n'est plus dans la pile : au-delà de PILE_MAX fiches, par exemple
    // « Retour au bilan » après 45 voisins, lot F6) : sans sa fiche, que la nouvelle adresse ne montre pas ; sinon un
    // rechargement sur elle remonterait toutes ses entrées de fiche (demarrage).
    const e = etatHistorique();
    h.replaceState(e?.fiche ? ({ pile: e.pile } satisfies EtatHistorique) : h.state, '', versAncre(a));
    router();
  }

  function remonter(a: string): void {
    remonterVers(a, false);
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
    remonterVers(v?.aMontrer && !v.aMontrer() ? durable : precedente, true);
  }

  function pousserFiche(lieu: LieuFiche): void {
    traversee = null;
    enQuittant = false;
    const ici = adresseRendue ?? o.accueil;
    const rang = (etatHistorique()?.fiche?.rang ?? 0) + 1;
    h.pushState(
      { pile: [...pileRendue, adresseEmpilee()].slice(-PILE_MAX), fiche: { terrain: lieu.terrain, id: lieu.id, rang, ...(lieu.bilan ? { bilan: true } : {}) } } satisfies EtatHistorique,
      '',
      versAncre(ici),
    );
    router();
  }

  function quitterFiches(): void {
    // Une traversée d'une entrée #carte à une autre : même ancre au départ et à l'arrivée, rien à ignorer.
    traversee = null;
    // Déjà en route (deux « × » de suite, le refus redit par le second événement d'une traversée) : un seul go().
    if (enQuittant) return;
    const rang = etatHistorique()?.fiche?.rang ?? 0;
    if (rang > 0) {
      enQuittant = true;
      h.go(-rang);
    }
  }

  function ouvrirPartie(nom: string): void {
    enLancement = true;
    try {
      pousser(nom);
    } finally {
      enLancement = false;
    }
  }

  return {
    router,
    pousser,
    remonter,
    versJouer,
    canoniser,
    retour,
    ouvrirPartie,
    active: () => vueActive,
    pousserFiche,
    quitterFiches,
    fiche: () => etatHistorique()?.fiche ?? null,
    adresse: () => adresseRendue,
    enRoute: () => traversee !== null || enQuittant,
  };
}

/**
 * Le chemin d'une erreur d'un bilan à la fiche de son lieu, et retour (#34,
 * lot F6, étude § 4.6 et § 19) : la colle de main.ts, ici pour être testée
 * avec la vraie navigation (tests/fiche-partie.test.ts).
 */
export interface CheminBilan {
  /**
   * La fiche du lieu juste d'une erreur : l'adresse du bilan retenue, la carte
   * (une entrée), puis le lieu et sa fiche (ouvrirFiche, une entrée de plus).
   * false, sans rien faire, pendant une partie (autorisee, § 4.8).
   */
  ouvrir(terrain: string, id: string): boolean;
  /**
   * « ‹ Retour au bilan » (et Échap) : à l'adresse du bilan, en remontant
   * l'historique (toutes les entrées de fiche et celle de la carte d'un coup).
   * Pas retour() : après un détour par une vue de passage (Crédits, 🏆) et son
   * « Retour », la vue d'avant serait la carte elle-même. Rien tant qu'un go()
   * est en route : un double toucher ne remonte pas au-delà du bilan.
   */
  retour(): void;
}

export function cheminBilan(
  nav: Pick<Navigation<VueNavigable>, 'adresse' | 'pousser' | 'remonter' | 'retour' | 'enRoute'>,
  o: { autorisee(): boolean; ouvrirFiche(terrain: string, id: string): void },
): CheminBilan {
  /** L'adresse du bilan d'où la dernière fiche est partie, telle que la pile la garde (nav.adresse()). */
  let adresse: string | null = null;
  return {
    ouvrir(terrain, id) {
      if (!o.autorisee()) return false;
      adresse = nav.adresse();
      nav.pousser('carte');
      o.ouvrirFiche(terrain, id);
      return true;
    },
    retour() {
      if (nav.enRoute()) return;
      if (adresse) nav.remonter(adresse);
      else nav.retour();
    },
  };
}
