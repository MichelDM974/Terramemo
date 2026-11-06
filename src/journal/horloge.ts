// Horloge réelle de l'appareil pour src/srs/ (pur : il la reçoit injectée,
// src/srs/jour.ts) : l'instant et le décalage local à cet instant, à l'est
// positif, stockés dans chaque événement.

import type { Horloge } from '../srs/jour';

export const horlogeAppareil: Horloge = () => {
  const d = new Date();
  // 0 - … : jamais -0 (UTC), et des minutes entières.
  return { ts: d.getTime(), tz: 0 - Math.round(d.getTimezoneOffset()) };
};

/**
 * Horloge de test (pilote, développement) : l'horloge `h` décalée de `jours`
 * jours (fraction permise). Le « lendemain » d'une séance sans attendre :
 * `?horloge=1` (main.ts, serveur de développement seulement).
 */
export function horlogeDecalee(h: Horloge, jours: number): Horloge {
  return () => {
    const i = h();
    return { ts: i.ts + Math.round(jours * 86_400_000), tz: i.tz };
  };
}

/** Le décalage en jours de `?horloge=` (« 1 », « -2 », « 0.5 ») ; null s'il est absent ou illisible. */
export function lireDecalage(valeur: string | null): number | null {
  if (valeur === null || !/^[-+]?\d+(\.\d+)?$/.test(valeur.trim())) return null;
  const n = Number(valeur);
  return Number.isFinite(n) && Math.abs(n) <= 3650 ? n : null;
}
