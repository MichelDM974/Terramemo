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

export function arrondi(v: number | null | undefined, chiffres = 1): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** chiffres;
  return Math.round(v * f) / f;
}
