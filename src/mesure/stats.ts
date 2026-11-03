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

export function statsImages(iv: readonly number[], periode_ms: number): StatsImages {
  let perdues = 0;
  let manquees = 0;
  for (const d of iv) {
    if (d > FACTEUR_PERDUE * periode_ms) {
      perdues++;
      manquees += Math.max(1, Math.round(d / periode_ms) - 1);
    }
  }
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

/**
 * Rang de quantile qui estime la période de l'écran sur les intervalles d'un
 * geste : un bas centile tient même si 40 % des images sont perdues (la
 * médiane, elle, deviendrait deux périodes).
 */
export const QUANTILE_PERIODE = 0.1;
/** Écart relatif entre la période d'un geste et celle du repos au-delà duquel on le signale. */
export const ECART_PERIODE = 0.25;

/** Période de l'écran estimée sur les intervalles d'un geste ; null sans intervalle. */
export function periodeGeste(iv: readonly number[]): number | null {
  return arrondi(quantile(iv, QUANTILE_PERIODE), 2);
}

export interface StatsGeste extends StatsImages {
  /**
   * Période estimée sur les intervalles du geste (bas centile), base du compte
   * des images perdues de ce geste ; null sans intervalle (compte fait alors
   * avec la période du repos).
   */
  periode_ms: number | null;
  /** La période du geste s'écarte de plus de 25 % de celle du repos (écran à fréquence variable). */
  ecart_periode: boolean;
}

/**
 * Statistiques d'un geste comptées avec SA période : un écran à 60 Hz au repos
 * et 120 Hz pendant le geste (fréquence adaptative) ne compterait pas, avec la
 * période du repos, une image sautée à 120 Hz (16,7 ms < 25 ms).
 */
export function statsGeste(iv: readonly number[], periode_repos_ms: number): StatsGeste {
  const p = periodeGeste(iv);
  return {
    ...statsImages(iv, p ?? periode_repos_ms),
    periode_ms: p,
    ecart_periode: p != null && Math.abs(p - periode_repos_ms) > ECART_PERIODE * periode_repos_ms,
  };
}

export function arrondi(v: number | null | undefined, chiffres = 1): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** chiffres;
  return Math.round(v * f) / f;
}
