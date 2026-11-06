// Jour local de la répétition espacée (docs/plan.md : « jour local, bascule à
// 4 h »). Pur : l'heure et le fuseau viennent de l'appelant (horloge injectée),
// jamais de l'horloge du système ; src/srs/ n'en lit aucune.

/** Heure locale où une journée bascule à la suivante : une séance à 1 h compte pour la veille. */
export const HEURE_BASCULE = 4;

export const MS_JOUR = 86_400_000;
const MS_MINUTE = 60_000;
const MS_HEURE = 3_600_000;

/**
 * Un instant tel que l'appareil le voit : `ts` en ms depuis l'époque (UTC),
 * `tz` le décalage de l'heure locale en minutes, à l'est positif
 * (= −Date.getTimezoneOffset() : +240 à La Réunion, −300 à New York l'hiver).
 * Le `tz` est stocké dans chaque événement du journal : le rejeu donne le
 * même jour sur tout appareil, quel que soit son fuseau.
 */
export interface Instant {
  ts: number;
  tz: number;
}

/** Horloge injectée (les vues lui passent l'heure de l'appareil ; les tests une heure fixe). */
export type Horloge = () => Instant;

/**
 * Numéro du jour local : jours entiers depuis le 1er janvier 1970, la journée
 * commençant à HEURE_BASCULE heure locale. Deux instants du même jour local
 * donnent le même entier, quel que soit leur fuseau.
 */
export function jour(ts: number, tz: number): number {
  return Math.floor((ts + tz * MS_MINUTE - HEURE_BASCULE * MS_HEURE) / MS_JOUR);
}

/** Jour local d'un Instant. */
export function jourDe(i: Instant): number {
  return jour(i.ts, i.tz);
}
