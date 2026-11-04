/**
 * Rapport des mesures du J0 (v: 2), rendu par window.cartographe.rapport() et
 * par « Copier le rapport » (⚙ → mesures). Toutes les durées sont en
 * millisecondes, les instants en ms depuis performance.timeOrigin (l'origine de
 * la navigation), arrondis au dixième.
 *
 * Critères du J0 (plan) et champs qui les tranchent :
 * - « rendu < 1 s » → chargement.total_ms ;
 * - « pas de saccade au déplacement » → gestes[].stats (perdues, p95_ms,
 *   max_ms), comptées avec la période du geste lui-même (stats.periode_ms ;
 *   stats.ecart_periode signale un écart de plus de 25 % avec
 *   ecran.periode_ms, mesurée au repos), longues_images, et la fin du geste :
 *   gestes[].fin.event_timing_ms (en mode css, le coût se paie au lever du
 *   doigt, après le dernier intervalle compté) ;
 * - « toucher → réponse < 100 ms » → touchers[].event_timing.duree_ms (Event
 *   Timing API : de l'entrée matérielle à l'image présentée qui suit les
 *   gestionnaires), selon touchers[].event_timing_etat. fin_fil_principal_ms
 *   ne vaut pas mesure de ce critère : il s'arrête avant rastérisation et
 *   présentation (voir Toucher).
 *
 * Changements de v1 à v2 : touchers[].latence_peinte_ms renommé
 * fin_fil_principal_ms ; touchers[].event_timing_etat ajouté ;
 * gestes[].fin.event_timing_ms ajouté ; gestes[].stats.periode_ms et
 * ecart_periode ajoutés, et le compte des images perdues se fait avec la
 * période du geste ; gestes[].k_debut relevé à l'événement start (v1 : au
 * premier mouvement).
 *
 * Les entrées Event Timing arrivent après la présentation de l'image (quelques
 * images plus tard) : lire le rapport au moins 0,5 s après le dernier geste.
 *
 * window.cartographe (src/main.ts) :
 *   version: string ;
 *   pret: Promise<void>              carte peinte (aussi document.body.dataset.pret = '1') ;
 *   repos: Promise<number>           période de l'écran mesurée au repos, ~0,5 s après pret
 *                                    (aussi document.body.dataset.repos = '1') : attendre
 *                                    avant de rejouer des gestes ;
 *   rapport(): Rapport ;
 *   reinitialiser(): void            vide gestes, touchers, longues images et interactions
 *                                    (garde chargement et écran) ;
 *   carte: AideCarte                 aides au pilote (voir src/main.ts).
 */
export interface Rapport {
  v: 2;
  /** Version de l'appli (package.json). */
  version: string;
  /** Date ISO de la production du rapport. */
  date: string;
  agent: string;
  ecran: {
    /** Fenêtre, px CSS. */
    largeur: number;
    hauteur: number;
    dpr: number;
    /** Zone de la carte, px CSS. */
    carte: { largeur: number; hauteur: number };
    /** Médiane des intervalles requestAnimationFrame au repos ; null tant que non mesurée. */
    periode_ms: number | null;
    hz: number | null;
  };
  rendu: 'g' | 'css';
  projection: 'monde' | 'pacifique';
  /** Fonctions du navigateur disponibles pour les mesures. */
  capacites: { long_animation_frame: boolean; event_timing: boolean };
  chargement: Chargement | null;
  gestes: Geste[];
  touchers: Toucher[];
  /** Long Animation Frames (> 50 ms) depuis le chargement ou la dernière réinitialisation. */
  longues_images: LongueImage[];
  /** Entrées Event Timing (interactionId > 0) de tous les gestes, pas seulement des touchers. */
  interactions: Interaction[];
}

export interface Chargement {
  /** De performance.timeOrigin à la première image peinte de la carte (double rAF après insertion). */
  total_ms: number;
  /** Instant où le script principal commence (HTML, CSS et JS chargés). */
  debut_script_ms: number;
  etapes: {
    /** fetch des quatre fichiers de /geo/ en parallèle, jusqu'au texte reçu. */
    telechargement_ms: number;
    /** JSON.parse des quatre fichiers. */
    analyse_ms: number;
    /** topojson.feature (pays et zones contestées). */
    feature_ms: number;
    /** Génération des chaînes de tracés (geoPath). */
    chemins_ms: number;
    /** Création des éléments SVG et insertion dans le document. */
    insertion_ms: number;
    /** De la fin de l'insertion à la première image peinte (style, mise en page, peinture). */
    peinture_ms: number;
  };
  /** Ressources de /geo/ (Resource Timing) : octets transférés et décodés, durée. */
  ressources: { nom: string; transfert: number; decode: number; duree_ms: number }[];
  caracteres_chemins: number;
  /** Pastilles affichées au zoom 1. */
  pastilles: number;
}

export interface Geste {
  /** glisser (un doigt), pincer (deux doigts ou plus), souris, molette. */
  type: 'glisser' | 'pincer' | 'souris' | 'molette';
  rendu: 'g' | 'css';
  /** Premier mouvement (premier événement zoom de d3-zoom). */
  debut_ms: number;
  /** Événement end de d3-zoom. */
  fin_ms: number;
  doigts_max: number;
  /** Nombre d'événements zoom reçus. */
  evenements: number;
  /** Zoom à l'événement start de d3-zoom (avant tout mouvement). */
  k_debut: number;
  k_fin: number;
  /** Intervalles entre images (requestAnimationFrame) du premier mouvement à la fin. */
  intervalles_ms: number[];
  /**
   * Calculées avec stats.periode_ms, la plus courte de la période estimée sur
   * les intervalles du geste (stats.periode_geste_ms, 10e centile) et de
   * ecran.periode_ms (16,7 ms si non mesurée) : voir statsGeste.
   */
  stats: import('./stats').StatsGeste;
  /** Long Animation Frames qui recouvrent le geste. */
  longues_images: { nombre: number; max_ms: number | null; blocage_total_ms: number };
  /**
   * Fin du geste (événement end de d3-zoom) :
   * - script_ms : le script de fin (en mode css, la transformation posée sur
   *   le SVG ; les pastilles) ;
   * - image_ms : du début de ce script au deuxième requestAnimationFrame qui
   *   suit, soit le travail du fil principal de l'image de fin, sans
   *   rastérisation ni présentation : il sous-estime ce que l'on voit ;
   * - event_timing_ms : durée Event Timing (de l'entrée à la présentation de
   *   l'image) de l'événement qui finit le geste (touchend, pointerup ou
   *   mouseup), rattachée au geste par son horodatage ; null si aucune entrée.
   *   C'est le vrai coût de fin de geste : en mode css, la transformation posée
   *   au SVG, la nouvelle peinture et la rastérisation de toute la carte ;
   * - event_timing_etat : 'mesure', 'sous_seuil' (API présente, aucune entrée :
   *   sous 16 ms, ou rapport lu trop tôt), 'non_pris_en_charge', ou
   *   'sans_evenement_de_fin' (molette).
   */
  fin: {
    script_ms: number;
    image_ms: number | null;
    event_timing_ms: number | null;
    event_timing_etat: 'mesure' | 'sous_seuil' | 'non_pris_en_charge' | 'sans_evenement_de_fin';
  };
}

export interface Toucher {
  /** event.timeStamp du pointerup. */
  t_ms: number;
  /** Point de la carte visé à la pose du doigt, px CSS relatifs à la carte, dans le repère de la transformation au lever. */
  x: number;
  y: number;
  pointeur: string;
  /** Résultat de pick(x, y). */
  pick: { id: string; via: 'pastille' | 'trace' | 'proche'; distance_px: number } | null;
  /** Vue « Toucher » : la cible demandée et la note. */
  cible?: string;
  juste?: boolean;
  distance_km?: number | null;
  /** Script du gestionnaire : pick, noter et rétroaction (classes, texte). */
  traitement_ms: number;
  /** De event.timeStamp au rappel requestAnimationFrame suivant la rétroaction (avant peinture). */
  latence_raf_ms: number | null;
  /**
   * De event.timeStamp à un message posté dans ce rAF, reçu quand le fil
   * principal a fini l'image (style, mise en page, peinture enregistrée) :
   * avant rastérisation, compositeur et présentation. Ce n'est PAS une mesure
   * de la peinture ni un repli au critère « < 100 ms » (v1 : latence_peinte_ms).
   */
  fin_fil_principal_ms: number | null;
  /** Entrée Event Timing du pointerup ; null sauf si event_timing_etat vaut 'mesure'. */
  event_timing: { duree_ms: number; attente_ms: number; traitement_ms: number; presentation_ms: number; interaction: number } | null;
  /**
   * 'mesure' : entrée trouvée ; 'sous_seuil' : API présente mais aucune entrée,
   * donc sous son seuil de 16 ms (ou rapport lu avant son arrivée) ;
   * 'non_pris_en_charge' : pas d'Event Timing dans ce navigateur.
   */
  event_timing_etat: 'mesure' | 'sous_seuil' | 'non_pris_en_charge';
}

export interface LongueImage {
  debut_ms: number;
  duree_ms: number;
  blocage_ms: number;
  /** Début du rendu de l'image (renderStart). */
  rendu_ms: number;
  /** Les trois scripts les plus longs : origine et durée. */
  scripts: { origine: string; duree_ms: number }[];
}

export interface Interaction {
  nom: string;
  debut_ms: number;
  duree_ms: number;
  interaction: number;
}
