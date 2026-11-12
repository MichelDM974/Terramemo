// Barème des épreuves classées (décision « Barème et classements » du
// 12/11/2026, #30) : chaque question est juste ou fausse, les points sont les
// justes, et le score se lit en pourcentage (src/vues/scores.ts), départagé
// par le temps. La distance d'une erreur ne reste que dans la rétroaction
// (« à 106 km du bord »). Pur : ni carte ni horloge ; la note d'un toucher
// vient de noter() (src/map/pick.ts).

/** Délai par question du Chrono, en ms (à caler à l'essai sur le téléphone). */
export const DELAI_CHRONO_MS = { localiser: 15_000, nommer: 10_000 } as const;

export interface ReponseChrono {
  juste: boolean;
  /** Distance au bord du pays demandé (km) ; null hors de la sphère ou sans toucher. */
  distance_km: number | null;
  /** Temps mis à répondre (ms) ; null si le délai s'est écoulé sans réponse. */
  temps_ms: number | null;
}

/** Points d'une question : 1 si juste dans le délai, 0 sinon (fausse, hors délai ou sans réponse). */
export function pointsQuestion(r: ReponseChrono, delai_ms: number): number {
  return r.juste && r.temps_ms != null && r.temps_ms <= delai_ms ? 1 : 0;
}

export interface ScoreEpreuve {
  /** Les justes, qui classent (barème 2, chrono.ts VERSION_BAREME) ; au barème 1, des points de proximité. */
  points: number;
  justes: number;
  questions: number;
  /** Temps total (ms), une question sans réponse comptant tout son délai : il départage. */
  temps_ms: number;
}

export function scoreEpreuve(reponses: readonly ReponseChrono[], delai_ms: number): ScoreEpreuve {
  let justes = 0;
  let temps_ms = 0;
  for (const r of reponses) {
    justes += pointsQuestion(r, delai_ms);
    temps_ms += r.temps_ms == null ? delai_ms : Math.min(r.temps_ms, delai_ms);
  }
  return { points: justes, justes, questions: reponses.length, temps_ms };
}

/**
 * Ordre du classement : le plus de points (de justes) d'abord, puis le temps
 * total le plus court, puis le moins de questions. Ce dernier ne départage
 * plus rien en ligne (le classement ne lit que points et temps,
 * src/epreuve/classement.ts) : le Chrono a le même nombre de questions pour
 * tous, et Sans faute ne peut pas finir à égalité de justes avec un nombre
 * de questions différent ; il ne reste qu'entre deux records d'un même
 * appareil (le général, à justes et temps égaux, moins d'erreurs).
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
