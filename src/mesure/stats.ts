// Statistiques des mesures (pures).

/** Quantile par interpolation linéaire entre rangs (type 7, celui de numpy et R). null si vide. */
export function quantile(valeurs: readonly number[], q: number): number | null {
  if (valeurs.length === 0) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  const a = v[bas] as number;
  const b = v[haut] as number;
  return a + (b - a) * (pos - bas);
}

export const mediane = (v: readonly number[]) => quantile(v, 0.5);

/** Intervalles successifs d'une suite d'horodatages. */
export function intervalles(horodatages: readonly number[]): number[] {
  const res: number[] = [];
  for (let i = 1; i < horodatages.length; i++) res.push((horodatages[i] as number) - (horodatages[i - 1] as number));
  return res;
}

/** Facteur au-delà duquel un intervalle compte comme une image perdue. */
export const FACTEUR_PERDUE = 1.5;

/**
 * Saccade (décision de l'utilisateur du 04/11/2026, ticket #1) : un à-coup
 * visible même à 60 images par seconde, une image qui tarde 1,5 fois une
 * image à 60 i/s, soit 25 ms, quelle que soit la fréquence de l'écran. Le
 * seuil ne dépend d'aucune période estimée : une appli plus souvent à
 * 120 i/s ne peut pas compter plus de saccades (le compte sur la période du
 * geste basculait d'un coup entre 60 et 120 Hz, relecture VM du J0).
 */
export const SEUIL_SACCADE_MS = (FACTEUR_PERDUE * 1000) / 60;
/**
 * Tolérance de mesure du seuil : 25 ms, ce sont trois périodes d'un écran à
 * 120 Hz, que l'arrondi des horodatages au dixième donne 24,9, 25 ou 25,1 ms.
 * Une comparaison stricte jugerait au hasard ; elles comptent toutes (une
 * image tenue 1,5 fois plus qu'à 60 i/s), sans toucher à 22,2 ms (deux
 * périodes à 90 Hz) ni à 16,7 ms et sa gigue.
 */
export const TOLERANCE_SACCADE_MS = 0.5;
/** Verdict « pas de saccade » : NON au-delà de 5 % d'intervalles en saccade sur un type de geste… */
export const SACCADE_PART = 0.05;
/** … ou dès un intervalle de plus de 50 ms (trois images à 60 i/s). */
export const SACCADE_MAX_MS = 50;

/** Un intervalle est une saccade : ≥ 25 ms, à la mesure près. */
export const estSaccade = (d: number) => d > SEUIL_SACCADE_MS - TOLERANCE_SACCADE_MS;

/**
 * Verdict « pas de saccade » sur un ensemble d'intervalles (un geste, ou tous
 * ceux d'un type de geste) : faux si plus de 5 % sont des saccades ou si le
 * plus long dépasse 50 ms. Monotone : ajouter des images rapides (≤ 25 ms) ne
 * change ni le compte ni le maximum et baisse la part, donc ne peut pas faire
 * passer de OK à NON. Recopié par le driver (run-cartographe, resumer).
 */
export function sansSaccade(saccades: number, intervalles: number, max_ms: number | null): boolean {
  return !(intervalles > 0 && saccades / intervalles > SACCADE_PART) && !((max_ms ?? 0) > SACCADE_MAX_MS);
}

export interface StatsImages {
  /** Nombre d'images (intervalles + 1). */
  images: number;
  mediane_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
  /** Intervalles plus longs que 1,5 × la période de l'écran (8,3 ms à 120 Hz → > 12,5 ms). */
  perdues: number;
  /** Images sautées au total : somme de (round(intervalle / période) − 1) sur les intervalles perdus. */
  vsync_manquees: number;
  /** Part des intervalles perdus, de 0 à 1. */
  part_perdues: number;
}

/**
 * Compte des images perdues sur une période ; les `tete` premiers intervalles
 * sont comptés sur periode_tete_ms (bascule de fréquence en tête de geste :
 * voir statsGeste).
 */
export function statsImages(iv: readonly number[], periode_ms: number, tete = 0, periode_tete_ms = periode_ms): StatsImages {
  let perdues = 0;
  let manquees = 0;
  iv.forEach((d, i) => {
    const p = i < tete ? periode_tete_ms : periode_ms;
    if (d > FACTEUR_PERDUE * p) {
      perdues++;
      manquees += Math.max(1, Math.round(d / p) - 1);
    }
  });
  return {
    images: iv.length === 0 ? 0 : iv.length + 1,
    mediane_ms: arrondi(mediane(iv)),
    p95_ms: arrondi(quantile(iv, 0.95)),
    max_ms: iv.length ? arrondi(Math.max(...iv)) : null,
    perdues,
    vsync_manquees: manquees,
    part_perdues: iv.length ? arrondi(perdues / iv.length, 3) ?? 0 : 0,
  };
}

/** Périodes connues (ms) : écrans à 144, 120, 90 et 60 Hz, et 30 images par seconde (moitié de 60). */
export const PERIODES_CONNUES: readonly number[] = [1000 / 144, 1000 / 120, 1000 / 90, 1000 / 60, 1000 / 30];
/** Écart relatif sous lequel l'estimation est calée sur la période connue (ou du repos) la plus proche. */
export const CALAGE_PERIODE = 0.06;
/**
 * Part des intervalles que la grappe basse doit réunir pour donner la période
 * du geste ; en deçà, quelques images courtes (fin de bascule, rattrapage) ne
 * font pas la période : on part de la médiane.
 */
export const PART_GRAPPE = 0.25;
/** Écart relatif entre la période d'un geste et celle du repos au-delà duquel on le signale. */
export const ECART_PERIODE = 0.25;

/** Médiane de la grappe d'intervalles ≤ 1,5 × p, recalculée trois fois à partir de p ; et sa taille. */
function grappe(iv: readonly number[], depart: number): { p: number; n: number } {
  let p = depart;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const g = iv.filter((d) => d <= FACTEUR_PERDUE * p);
    if (!g.length) break;
    p = mediane(g) as number;
    n = g.length;
  }
  return { p, n };
}

/**
 * Période de l'écran pendant un geste, estimée sur ses intervalles ; null sans
 * intervalle. Médiane de la grappe basse (intervalles ≤ 1,5 × la période,
 * partie du 10e centile et recalculée), puis calée sur la période connue la
 * plus proche (ou celle du repos) à 6 % près. Le 10e centile seul faisait une
 * falaise (8 % d'images à 120 Hz sur un geste à 60 : période 16,7 ms ; 12 % :
 * 9,2 ms, et 89 % d'images perdues) et descendait à 6,6 ms sous une gigue de
 * ± 2 ms à 120 Hz (relecture V2 du J0). La grappe basse tient tant qu'elle
 * réunit le quart des intervalles : une appli qui perd 40 % de ses images
 * garde sa période (la médiane, elle, deviendrait deux périodes).
 */
export function periodeGeste(iv: readonly number[], periode_repos_ms?: number | null): number | null {
  if (!iv.length) return null;
  let { p, n } = grappe(iv, quantile(iv, 0.1) as number);
  if (n < PART_GRAPPE * iv.length) p = grappe(iv, mediane(iv) as number).p;
  const connues = periode_repos_ms ? [...PERIODES_CONNUES, periode_repos_ms] : PERIODES_CONNUES;
  let calee = p;
  let ecart = CALAGE_PERIODE;
  for (const c of connues) {
    const e = Math.abs(p - c) / c;
    if (e <= ecart) [calee, ecart] = [c, e];
  }
  return arrondi(calee, 2);
}

export interface StatsGeste extends StatsImages {
  /**
   * Période de l'écran estimée sur les intervalles du geste (periodeGeste),
   * base de perdues, vsync_manquees et part_perdues ; null sans intervalle
   * (le compte se fait alors sur periode_repos_ms).
   */
  periode_geste_ms: number | null;
  /** Période du repos utilisée (ecran.periode_ms, 16,67 ms si non mesurée). */
  periode_repos_ms: number;
  /** La période du geste s'écarte de plus de 25 % de celle du repos (écran à fréquence variable, ou cadence de l'appli). */
  ecart_periode: boolean;
  /**
   * Sens de l'écart : 'plus_rapide', l'écran accélère pendant le geste (repos
   * à 60 Hz, geste à 120) ; 'plus_lent', geste à une cadence plus lente que
   * l'écran au repos (appli à 60 images par seconde sur 120 Hz, ou écran qui
   * ralentit) : une cadence (tenue), pas une saccade. null sans écart.
   */
  ecart_sens: 'plus_rapide' | 'plus_lent' | null;
  /**
   * Bascule de fréquence en tête de geste : nombre d'intervalles, avant le
   * premier à la période du geste, quand l'écran accélère vraiment
   * (ecart_sens 'plus_rapide' : il est encore à sa fréquence de repos) ; 0
   * sinon. Ils sont comptés
   * sur la période du repos, dans perdues comme dans perdues_repos.
   */
  bascule_images: number;
  /** Intervalles perdus comptés sur la période du repos (tous les intervalles). */
  perdues_repos: number;
  /** Part de ces intervalles, de 0 à 1. */
  part_perdues_repos: number;
  /** Intervalles en saccade (estSaccade : ≥ 25 ms à 0,5 ms près), base du verdict « pas de saccade ». */
  saccades: number;
  /** Part de ces intervalles, de 0 à 1. Le plus long : max_ms. */
  part_saccades: number;
  /**
   * Période la plus courte de l'écran vue pour ce geste : min(periode_geste_ms,
   * periode_repos_ms) (8,33 ms sur un écran à 120 Hz, qu'il y soit au repos ou
   * qu'il y monte pendant le geste).
   */
  periode_ecran_ms: number;
  /**
   * Tenue de la cadence de l'écran : part des intervalles ≤ 1,5 ×
   * periode_ecran_ms, de 0 à 1 (bascule de tête comprise : l'écran n'y est
   * pas encore). Rapportée sans verdict, pour comparer les rendus. Sa base
   * suit l'estimation de la période du geste (grappe d'au moins 25 % des
   * intervalles) : comparer les rendus d'abord par cadence_ips, monotone.
   */
  tenue: number;
  /** Images par seconde du geste : intervalles × 1000 / leur somme ; null sans intervalle. */
  cadence_ips: number | null;
}

/**
 * Statistiques d'un geste. Le verdict « pas de saccade » se lit sur
 * saccades (≥ 25 ms, sans période estimée : sansSaccade) ; la tenue de la
 * cadence de l'écran (tenue, cadence_ips) se rapporte à part, sans verdict.
 * Restent, informatifs, deux comptes d'images perdues (plus d'une période et
 * demie). perdues : sur la période du geste, sauf la bascule de tête (sur
 * celle du repos) ; il voit une image sautée à 120 Hz sur un écran à 60 Hz au
 * repos, mais bascule avec l'estimation de la période (v3 : base du verdict,
 * d'où sa falaise sur les cadences mêlées). perdues_repos : sur la période du
 * repos ; il voit une appli tenue à 60 images par seconde sur un écran à
 * 120 Hz (période du geste 16,7 ms, 0 perdue).
 */
export function statsGeste(iv: readonly number[], periode_repos_ms: number): StatsGeste {
  const pg = periodeGeste(iv, periode_repos_ms);
  const p = pg ?? periode_repos_ms;
  const ecart = pg != null && Math.abs(pg - periode_repos_ms) > ECART_PERIODE * periode_repos_ms;
  const sens = !ecart ? null : (pg as number) < periode_repos_ms ? 'plus_rapide' : 'plus_lent';
  // Bascule de tête seulement si l'écran accélère vraiment (v3 : dès que la
  // période du geste passait sous celle du repos, 16,67 contre 16,7 ms : des
  // images perdues en tête comptées comme une bascule).
  let tete = 0;
  if (sens === 'plus_rapide') {
    while (tete < iv.length && (iv[tete] as number) > FACTEUR_PERDUE * p) tete++;
    if (tete === iv.length) tete = 0;
  }
  const repos = statsImages(iv, periode_repos_ms);
  const saccades = iv.filter(estSaccade).length;
  const ecran = Math.min(p, periode_repos_ms);
  const somme = iv.reduce((a, d) => a + d, 0);
  return {
    ...statsImages(iv, p, tete, periode_repos_ms),
    periode_geste_ms: pg,
    periode_repos_ms: arrondi(periode_repos_ms, 2) ?? periode_repos_ms,
    ecart_periode: ecart,
    ecart_sens: sens,
    bascule_images: tete,
    perdues_repos: repos.perdues,
    part_perdues_repos: repos.part_perdues,
    saccades,
    part_saccades: iv.length ? arrondi(saccades / iv.length, 3) ?? 0 : 0,
    periode_ecran_ms: arrondi(ecran, 2) ?? ecran,
    tenue: iv.length ? arrondi(iv.filter((d) => d <= FACTEUR_PERDUE * ecran).length / iv.length, 3) ?? 0 : 0,
    cadence_ips: somme > 0 ? arrondi((iv.length * 1000) / somme) : null,
  };
}

export function arrondi(v: number | null | undefined, chiffres = 1): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** chiffres;
  return Math.round(v * f) / f;
}
