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
   * ralentit) : une cadence, à juger, pas une saccade. null sans écart.
   */
  ecart_sens: 'plus_rapide' | 'plus_lent' | null;
  /**
   * Bascule de fréquence en tête de geste : nombre d'intervalles, avant le
   * premier à la période du geste, quand celle-ci est plus courte que celle
   * du repos (l'écran est encore à sa fréquence de repos). Ils sont comptés
   * sur la période du repos, dans perdues comme dans perdues_repos.
   */
  bascule_images: number;
  /** Intervalles perdus comptés sur la période du repos (tous les intervalles). */
  perdues_repos: number;
  /** Part de ces intervalles, de 0 à 1. */
  part_perdues_repos: number;
}

/**
 * Statistiques d'un geste, avec deux comptes d'images perdues. perdues : sur
 * la période du geste lui-même, sauf la bascule de tête (sur celle du repos) ;
 * il voit une image sautée à 120 Hz sur un écran à 60 Hz au repos (16,7 ms <
 * 25 ms, invisible sur la période du repos). perdues_repos : sur la période du
 * repos ; il voit une appli tenue à 60 images par seconde sur un écran à
 * 120 Hz (période du geste 16,7 ms, 0 perdue). Au lecteur de choisir selon
 * ecart_sens : 'plus_rapide' → perdues ; 'plus_lent' → une cadence à juger,
 * perdues_repos la chiffre ; sans écart, les deux se valent.
 */
export function statsGeste(iv: readonly number[], periode_repos_ms: number): StatsGeste {
  const pg = periodeGeste(iv, periode_repos_ms);
  const p = pg ?? periode_repos_ms;
  let tete = 0;
  if (p < periode_repos_ms) {
    while (tete < iv.length && (iv[tete] as number) > FACTEUR_PERDUE * p) tete++;
    if (tete === iv.length) tete = 0;
  }
  const repos = statsImages(iv, periode_repos_ms);
  const ecart = pg != null && Math.abs(pg - periode_repos_ms) > ECART_PERIODE * periode_repos_ms;
  return {
    ...statsImages(iv, p, tete, periode_repos_ms),
    periode_geste_ms: pg,
    periode_repos_ms: arrondi(periode_repos_ms, 2) ?? periode_repos_ms,
    ecart_periode: ecart,
    ecart_sens: !ecart ? null : (pg as number) < periode_repos_ms ? 'plus_rapide' : 'plus_lent',
    bascule_images: tete,
    perdues_repos: repos.perdues,
    part_perdues_repos: repos.part_perdues,
  };
}

export function arrondi(v: number | null | undefined, chiffres = 1): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** chiffres;
  return Math.round(v * f) / f;
}
