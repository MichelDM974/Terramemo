/**
 * Rapport des mesures du J0 (v: 4), rendu par window.cartographe.rapport() et
 * par « Copier le rapport » (⚙ → mesures). Contrat lu par le driver du skill
 * run-cartographe : chaque champ est documenté sur son type ci-dessous. Toutes
 * les durées sont en millisecondes, les instants en ms depuis
 * performance.timeOrigin (l'origine de la navigation), arrondis au dixième.
 *
 * Critères du J0 (plan) et champs qui les tranchent :
 * - « rendu < 1 s » → chargement.total_ms ;
 * - « pas de saccade au déplacement » → gestes[].stats.saccades (décision de
 *   l'utilisateur du 04/11/2026) : une saccade est un à-coup visible même à
 *   60 images par seconde, un intervalle ≥ 1,5 × 16,67 = 25 ms (à 0,5 ms
 *   près), quelle que soit la fréquence de l'écran ; verdict sansSaccade
 *   (stats.ts) : NON au-delà de 5 % de saccades sur un type de geste ou d'un
 *   intervalle de plus de 50 ms (stats.part_saccades, stats.max_ms). Il est
 *   monotone : une appli plus souvent à 120 images par seconde ne peut pas
 *   être jugée pire. Aussi p95_ms, longues_images, et dessin_ms (rendu
 *   Canvas : script de chaque image) ;
 * - tenue de la cadence de l'écran, rapportée à part, SANS verdict, pour
 *   comparer les rendus → stats.cadence_ips (images par seconde, monotone) et
 *   stats.tenue (part des intervalles à stats.periode_ecran_ms, la période
 *   la plus courte de l'écran vue au repos ou pendant le geste : 120 Hz sur
 *   le Galaxy A37) ; stats.ecart_sens, bascule_images, perdues et
 *   perdues_repos la détaillent ;
 * - fin du geste (en mode css, le coût se paie au lever du doigt, après le
 *   dernier intervalle compté) → gestes[].fin.event_timing_ms selon
 *   fin.event_timing_etat ; fin.close_par_entree_suivante repère l'entrée
 *   qui ne s'est close qu'avec l'image d'une entrée suivante (voir Geste.fin) ;
 * - « toucher → réponse < 100 ms » → touchers[].event_timing.duree_ms (Event
 *   Timing API : de l'entrée matérielle à l'image présentée qui suit les
 *   gestionnaires), selon touchers[].event_timing_etat. fin_fil_principal_ms
 *   ne vaut pas mesure de ce critère : il s'arrête avant rastérisation et
 *   présentation (voir Toucher).
 *
 * Changements de v3 à v4 (critère de saccade de l'utilisateur, relecture
 * VM du J0 : le verdict sur stats.perdues, compté sur la période estimée du
 * geste, basculait d'un coup quand le quart des intervalles passait à
 * 8,33 ms, et jugeait pire une appli plus souvent à 120 images par seconde) :
 * - gestes[].stats.saccades, part_saccades : ajoutés, base du verdict ;
 * - gestes[].stats.periode_ecran_ms, tenue, cadence_ips : ajoutés (tenue de
 *   la cadence de l'écran, sans verdict) ;
 * - gestes[].stats.bascule_images : compté seulement si ecart_sens vaut
 *   'plus_rapide' (v3 : dès que la période du geste était sous celle du
 *   repos, même sans écart, 16,67 contre 16,7 ms : des images perdues en
 *   tête comptées comme une bascule) ;
 * - gestes[].stats.perdues, perdues_repos : inchangés, mais informatifs (plus
 *   la base du verdict).
 *
 * Changements de v2 à v3 :
 * - gestes[].stats.perdues, vsync_manquees, part_perdues : comptés sur la
 *   période du geste (v2 : sur la plus courte de celle du geste et de celle
 *   du repos), les intervalles de bascule en tête sur celle du repos ;
 * - gestes[].stats.periode_geste_ms : médiane de la grappe basse calée sur
 *   une période connue (v2 : 10e centile des intervalles) ;
 * - gestes[].stats.periode_ms retiré (v2 : base du compte, le min des deux
 *   périodes) ; ajoutés periode_repos_ms, ecart_sens, bascule_images,
 *   perdues_repos, part_perdues_repos ;
 * - gestes[].fin.event_timing_etat : 'en_attente' ajouté ; 'sous_seuil' ne
 *   se dit plus que si une entrée Event Timing postérieure à la fin est
 *   arrivée (v2 : dès qu'aucune entrée n'était trouvée) ;
 * - gestes[].fin.t_evenement_ms, entree_suivante_ms, close_par_entree_suivante
 *   et gestes[].dessin_ms ajoutés ; rendu peut valoir 'canvas'.
 *
 * Changements de v1 à v2 : touchers[].latence_peinte_ms renommé
 * fin_fil_principal_ms ; touchers[].event_timing_etat ajouté ;
 * gestes[].fin.event_timing_ms ajouté ; gestes[].stats.periode_ms (base du
 * compte, la plus courte de la période du geste et de celle du repos) et
 * ecart_periode ajoutés ; gestes[].k_debut relevé à l'événement start (v1 :
 * au premier mouvement).
 *
 * Les entrées Event Timing arrivent après la présentation de l'image (quelques
 * images plus tard) : lire le rapport au moins 0,5 s après le dernier geste.
 * Ça ne suffit pas quand la fin ne change aucun pixel (rendu g à certaines
 * vues) : son entrée attend la prochaine image présentée, d'où 'en_attente' ;
 * faire suivre une entrée (un toucher) avant de lire le rapport la clôt.
 * Le panneau des mesures, s'il est affiché, la clôt aussi : sa mise à jour
 * (250 ms après) présente une image, et une telle fin vaut alors ~270 ms en g
 * (au PC, k 14,5 → 36), close_par_entree_suivante faux. Mesurer sans panneau
 * (?mesures=0), comme le driver ; une capture d'écran la clôt de même.
 *
 * window.cartographe (src/main.ts) :
 *   version: string ;
 *   pret: Promise<void>              carte peinte (aussi document.body.dataset.pret = '1') ;
 *   repos: Promise<number>           période de l'écran mesurée au repos, ~0,5 s après pret
 *                                    (aussi document.body.dataset.repos = '1') : attendre
 *                                    avant de rejouer des gestes ;
 *   rapport(): Rapport ;
 *   reinitialiser(): void            vide gestes, touchers, longues images, interactions et
 *                                    entrées suivies (garde chargement et écran) ;
 *   carte: AideCarte                 aides au pilote (voir src/main.ts).
 */
import type { Rendu } from '../map/types';

/**
 * Rendu de la carte : 'g' et 'css' (SVG), 'canvas' (carte qui tourne). Union
 * avec Rendu (src/map/types.ts) : 'canvas' est accepté avant comme après son
 * ajout à Rendu.
 */
export type RenduMesure = Rendu | 'canvas';

export interface Rapport {
  v: 4;
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
  rendu: RenduMesure;
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
  rendu: RenduMesure;
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
   * Statistiques des intervalles (statsGeste, src/mesure/stats.ts) :
   * - images, mediane_ms, p95_ms, max_ms : sur tous les intervalles ;
   * - periode_geste_ms : période de l'écran pendant le geste, médiane de la
   *   grappe basse (intervalles ≤ 1,5 × la période) calée à 6 % près sur 144,
   *   120, 90, 60 Hz, 30 images par seconde ou la période du repos ; null
   *   sans intervalle ;
   * - periode_repos_ms : ecran.periode_ms (16,67 si non mesurée) ;
   * - perdues, vsync_manquees (images sautées : somme de round(intervalle /
   *   période) − 1), part_perdues (de 0 à 1) : sur periode_geste_ms, sauf les
   *   bascule_images premiers intervalles, sur periode_repos_ms ;
   * - bascule_images : quand ecart_sens vaut 'plus_rapide', les intervalles
   *   avant le premier à la période du geste (l'écran monte de 60 à 120 Hz au
   *   début du geste) ; 0 sinon ;
   * - perdues_repos, part_perdues_repos : sur periode_repos_ms, tous les
   *   intervalles ;
   * - ecart_periode : |periode_geste_ms − periode_repos_ms| > 25 % de
   *   periode_repos_ms ; ecart_sens : 'plus_rapide', 'plus_lent' ou null ;
   * - saccades, part_saccades : intervalles ≥ 25 ms (à 0,5 ms près), tous
   *   les intervalles, sans période estimée : la base du verdict « pas de
   *   saccade » (voir l'en-tête) ;
   * - periode_ecran_ms : min(periode_geste_ms, periode_repos_ms) ; tenue :
   *   part des intervalles ≤ 1,5 × periode_ecran_ms (de 0 à 1) ;
   *   cadence_ips : intervalles × 1000 / leur somme (null sans intervalle).
   *   Sans verdict ; tenue suit l'estimation de periode_geste_ms (grappe
   *   d'au moins 25 % des intervalles), cadence_ips non : comparer les
   *   rendus sur elle d'abord.
   */
  stats: import('./stats').StatsGeste;
  /** Long Animation Frames qui recouvrent le geste. */
  longues_images: { nombre: number; max_ms: number | null; blocage_total_ms: number };
  /**
   * Rendu Canvas : durée du script de chaque image dessinée entre les
   * événements start et end du geste (EcouteGestes.dessin, src/map/carte.ts ;
   * le dessin de la fin est dans fin.script_ms) : nombre, médiane, 95e
   * centile, maximum. null si aucun dessin rapporté (rendus SVG g et css).
   */
  dessin_ms: { images: number; mediane: number; p95: number; max: number } | null;
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
   * - event_timing_etat : 'mesure' (entrée trouvée) ; 'sous_seuil' (aucune
   *   entrée, mais une entrée Event Timing d'un événement postérieur est
   *   arrivée : l'image de la fin a été présentée en moins de 16 ms, le seuil
   *   de l'API) ; 'en_attente' (aucune entrée et rien de postérieur : l'image
   *   de la fin n'est peut-être pas encore présentée, sa durée est inconnue et
   *   peut dépasser la seconde ; à ne pas compter 16) ; 'non_pris_en_charge' ;
   *   'sans_evenement_de_fin' (molette) ;
   * - t_evenement_ms : event.timeStamp de l'événement de fin (= startTime de
   *   son entrée Event Timing) ; null sans événement de fin. fin_ms, lui, est
   *   pris dans le gestionnaire, plus tard (~30 ms au rejeu) ;
   * - entree_suivante_ms : timeStamp de la première entrée de l'utilisateur
   *   après la fin (pointerdown ou touchstart, écoutés en capture : geste ou
   *   toucher) ; null s'il n'y en a pas encore ;
   * - close_par_entree_suivante : t_evenement_ms + event_timing_ms ≥
   *   entree_suivante_ms, l'entrée de la fin ne s'est close qu'avec l'image
   *   d'une entrée suivante ; false sans entrée suivante ; null sans
   *   event_timing_ms. Seul, il ne prouve rien : une vraie fin lente (css, la
   *   rastérisation) donne la même signature. L'artefact (rendu g : la fin ne
   *   change aucun pixel, son entrée attend l'image suivante, captures
   *   identiques à l'octet, relecture V2) se prouve par rendu 'g' ET
   *   close_par_entree_suivante ET image_ms < 100 ET aucune longue image.
   */
  fin: {
    script_ms: number;
    image_ms: number | null;
    event_timing_ms: number | null;
    event_timing_etat: 'mesure' | 'sous_seuil' | 'en_attente' | 'non_pris_en_charge' | 'sans_evenement_de_fin';
    t_evenement_ms: number | null;
    entree_suivante_ms: number | null;
    close_par_entree_suivante: boolean | null;
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
