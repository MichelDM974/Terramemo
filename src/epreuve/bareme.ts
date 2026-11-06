// Barème des épreuves notées (décisions « Points et classement » et
// « Classements », docs/etudes/2026-11-04-points-classement.md). Pur : ni
// carte ni horloge ; la note d'un toucher vient de noter() (src/map/pick.ts).

/** Points d'une question juste. */
export const POINTS_JUSTE = 1000;

/**
 * Plafond d'une réponse fausse : la moitié. La distance se mesure au bord du
 * pays demandé, donc un toucher juste de l'autre côté de la frontière est à
 * quelques kilomètres : sans plafond, le voisin vaudrait la bonne réponse.
 */
export const POINTS_PROCHE_MAX = 500;

/**
 * Échelle de la distance par terrain : 500 × e^(−d / échelle). Le monde :
 * 300 km (Lituanie pour Lettonie, 106 km : 351). L'île (décision « Quiz de
 * La Réunion ») : 5 km, à la mesure de communes de 10 à 30 km de large (la
 * voisine à 1 km : 409, à 5 km : 184, à 10 km : 68) ; à 300 km, toute erreur
 * sur l'île vaudrait ~490 points. La formule du monde ne change pas : la
 * version du barème reste la même (chrono.ts, VERSION_BAREME).
 */
export const ECHELLES_KM = { monde: 300, reunion: 5 } as const;

/** Échelle du monde, par défaut partout où l'appelant n'en donne pas. */
export const ECHELLE_KM = ECHELLES_KM.monde;

/** Délai par question du Chrono, en ms (à caler à l'essai sur le téléphone). */
export const DELAI_CHRONO_MS = { localiser: 15_000, nommer: 10_000 } as const;

export interface ReponseChrono {
  juste: boolean;
  /** Distance au bord du pays demandé (km) ; null hors de la sphère ou sans toucher. */
  distance_km: number | null;
  /** Temps mis à répondre (ms) ; null si le délai s'est écoulé sans réponse. */
  temps_ms: number | null;
}

/** Points d'une question : 1 000 si juste, jusqu'à 500 selon la distance (à l'échelle du terrain) sinon, 0 hors délai. */
export function pointsQuestion(r: ReponseChrono, delai_ms: number, echelle_km: number = ECHELLE_KM): number {
  if (r.temps_ms == null || r.temps_ms > delai_ms) return 0;
  if (r.juste) return POINTS_JUSTE;
  if (r.distance_km == null) return 0;
  return Math.round(POINTS_PROCHE_MAX * Math.exp(-r.distance_km / echelle_km));
}

export interface ScoreEpreuve {
  points: number;
  justes: number;
  questions: number;
  /** Temps total (ms), une question sans réponse comptant tout son délai : il départage. */
  temps_ms: number;
}

export function scoreEpreuve(reponses: readonly ReponseChrono[], delai_ms: number, echelle_km: number = ECHELLE_KM): ScoreEpreuve {
  let points = 0;
  let justes = 0;
  let temps_ms = 0;
  for (const r of reponses) {
    const p = pointsQuestion(r, delai_ms, echelle_km);
    points += p;
    if (r.juste && p > 0) justes++;
    temps_ms += r.temps_ms == null ? delai_ms : Math.min(r.temps_ms, delai_ms);
  }
  return { points, justes, questions: reponses.length, temps_ms };
}

/**
 * Ordre du classement : le plus de points d'abord, puis le temps total le plus
 * court, puis le moins de questions. Ce dernier ne départage que Minute (à
 * justes égales, moins d'erreurs) : le Chrono a le même nombre de questions
 * pour tous, et Sans faute ne peut pas finir à égalité de justes avec un
 * nombre de questions différent.
 */
export function comparerScores(a: ScoreEpreuve, b: ScoreEpreuve): number {
  return b.points - a.points || a.temps_ms - b.temps_ms || a.questions - b.questions;
}

/** Lundi 5 janvier 1970 à 0 h UTC : début de la semaine 0. */
const LUNDI_0_MS = 345_600_000;
const SEMAINE_MS = 604_800_000;

/**
 * Numéro de la semaine du classement de la semaine, qui repart le lundi à
 * 0 h UTC (4 h à La Réunion). Un entier que les règles Firestore recalculent
 * depuis request.time, pour qu'une semaine passée ne se réécrive pas.
 */
export function semaine(t_ms: number): number {
  return Math.floor((t_ms - LUNDI_0_MS) / SEMAINE_MS);
}

/**
 * Lundi 9 novembre 2026 à 0 h UTC (4 h à La Réunion), début d'une semaine du
 * classement : à partir de là, les épreuves classées notent aussi les zones
 * contestées et les enclaves (décision « Zones contestées et enclaves » ;
 * src/map/acceptes.ts). Avant, le de fait strict d'avant la décision, pour
 * que les scores d'une même semaine se comparent. Le barème ne change pas
 * (VERSION_BAREME) : les records gardés restent.
 */
export const DEBUT_ACCEPTES_EPREUVES = Date.UTC(2026, 10, 9);

/** Une épreuve partie à t_ms admet-elle les zones contestées et les enclaves ? */
export const acceptesEnEpreuve = (t_ms: number): boolean => t_ms >= DEBUT_ACCEPTES_EPREUVES;
