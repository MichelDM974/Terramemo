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

/** Échelle de la distance : 500 × e^(−d / 300 km) (Lituanie pour Lettonie, 106 km : 351). */
export const ECHELLE_KM = 300;

/** Délai par question du Chrono, en ms (à caler à l'essai sur le téléphone). */
export const DELAI_CHRONO_MS = { localiser: 15_000, nommer: 10_000 } as const;

export interface ReponseChrono {
  juste: boolean;
  /** Distance au bord du pays demandé (km) ; null hors de la sphère ou sans toucher. */
  distance_km: number | null;
  /** Temps mis à répondre (ms) ; null si le délai s'est écoulé sans réponse. */
  temps_ms: number | null;
}

/** Points d'une question : 1 000 si juste, jusqu'à 500 selon la distance sinon, 0 hors délai. */
export function pointsQuestion(r: ReponseChrono, delai_ms: number): number {
  if (r.temps_ms == null || r.temps_ms > delai_ms) return 0;
  if (r.juste) return POINTS_JUSTE;
  if (r.distance_km == null) return 0;
  return Math.round(POINTS_PROCHE_MAX * Math.exp(-r.distance_km / ECHELLE_KM));
}

export interface ScoreEpreuve {
  points: number;
  justes: number;
  questions: number;
  /** Temps total (ms), une question sans réponse comptant tout son délai : il départage. */
  temps_ms: number;
}

export function scoreEpreuve(reponses: readonly ReponseChrono[], delai_ms: number): ScoreEpreuve {
  let points = 0;
  let justes = 0;
  let temps_ms = 0;
  for (const r of reponses) {
    const p = pointsQuestion(r, delai_ms);
    points += p;
    if (r.juste && p > 0) justes++;
    temps_ms += r.temps_ms == null ? delai_ms : Math.min(r.temps_ms, delai_ms);
  }
  return { points, justes, questions: reponses.length, temps_ms };
}

/** Ordre du classement : le plus de points d'abord, puis le temps total le plus court. */
export function comparerScores(a: ScoreEpreuve, b: ScoreEpreuve): number {
  return b.points - a.points || a.temps_ms - b.temps_ms;
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
