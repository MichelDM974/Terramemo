/**
 * Rapport des mesures du J0 (v: 1), rendu par window.cartographe.rapport() et
 * par « Copier le rapport » (⚙ → mesures). Toutes les durées sont en
 * millisecondes, les instants en ms depuis performance.timeOrigin (l'origine de
 * la navigation), arrondis au dixième.
 *
 * Critères du J0 (plan) et champs qui les tranchent :
 * - « rendu < 1 s » → chargement.total_ms ;
 * - « pas de saccade au déplacement » → gestes[].stats (perdues, p95_ms,
 *   max_ms) et longues_images ; ecran.periode_ms donne la période de l'écran
 *   mesurée au repos (8,3 ms à 120 Hz), base du compte des images perdues ;
 * - « toucher → réponse < 100 ms » → touchers[].event_timing.duree_ms (Event
 *   Timing API : de l'entrée matérielle à l'image peinte qui suit les
 *   gestionnaires ; null = sous 16 ms, seuil de l'API, ou non pris en charge)
 *   et touchers[].latence_peinte_ms (mesure maison, voir Toucher).
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
  v: 1;
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
  k_debut: number;
  k_fin: number;
  /** Intervalles entre images (requestAnimationFrame) du premier mouvement à la fin. */
  intervalles_ms: number[];
  /** Calculées avec ecran.periode_ms (16,7 ms si non mesurée). */
  stats: import('./stats').StatsImages;
  /** Long Animation Frames qui recouvrent le geste. */
  longues_images: { nombre: number; max_ms: number | null; blocage_total_ms: number };
  /** Fin du geste : script (en mode css, la transformation posée sur le SVG) et image suivante. */
  fin: { script_ms: number; image_ms: number | null };
}

export interface Toucher {
  /** event.timeStamp du pointerup. */
  t_ms: number;
  /** Point du toucher, px CSS relatifs à la carte. */
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
  /** De event.timeStamp à un message posté dans ce rAF, reçu après le rendu de l'image : approche de la peinture. */
  latence_peinte_ms: number | null;
  /** Entrée Event Timing du pointerup ; null = sous 16 ms (seuil de l'API) ou non prise en charge. */
  event_timing: { duree_ms: number; attente_ms: number; traitement_ms: number; presentation_ms: number; interaction: number } | null;
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
