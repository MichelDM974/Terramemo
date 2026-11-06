// Seul module qui importe ts-fsrs (5.4.2, FSRS-6, MIT ; décision D10 en
// attente de l'utilisateur, #2) : le reste de src/srs/ parle en jours locaux
// (jour.ts) et en notes (note.ts). Changer de version ou de bibliothèque ne
// touche que ce fichier, puis le journal se rejoue (rien n'est migré).
//
// Dates synthétiques : ts-fsrs compte les jours écoulés en jours civils UTC
// (dateDiffInDays sur getUTCDate). On lui passe donc, pour le jour local j,
// la date j × 86 400 000 + 12 h : ses écarts de jours sont exactement ceux
// de jour(), quel que soit le fuseau (à New York, 20 h puis 18 h le
// lendemain font bien 1 jour, et non 0 comme en jours UTC). Son échéance
// (date + intervalle en jours entiers, enable_short_term false) retombe à
// midi d'un jour j' : echeance() le relit par division entière.

import { createEmptyCard, fsrs, type Card, type FSRS, type FSRSParameters, type Grade } from 'ts-fsrs';
import { MS_JOUR } from './jour';
import type { Note } from './note';

/**
 * Paramètres du planificateur. Rétention visée 0,9 ; pas d'étapes courtes
 * (une note par fiche et par jour, les reprises dans la séance sont hors
 * FSRS) ; pas de flou (rejeu déterministe, tests lisibles) ; intervalle
 * maximal et poids w par défaut de ts-fsrs.
 */
export type ParamsFsrs = Readonly<Partial<FSRSParameters>>;

export const PARAMS_FSRS: ParamsFsrs = Object.freeze({
  request_retention: 0.9,
  enable_short_term: false,
  enable_fuzz: false,
});

/** Mémoire d'une fiche selon FSRS (Card de ts-fsrs ; ses dates sont synthétiques, voir plus haut). */
export type CarteFsrs = Card;

const MIDI = MS_JOUR / 2;

/** Date synthétique passée à ts-fsrs pour le jour local j. */
export function dateDuJour(j: number): Date {
  return new Date(j * MS_JOUR + MIDI);
}

/** Jour local d'une date synthétique. */
export function jourDeDate(d: Date): number {
  return Math.floor(d.getTime() / MS_JOUR);
}

export interface Planificateur {
  /** Carte jamais revue, créée le jour j. */
  neuve(j: number): CarteFsrs;
  /** Carte après une note donnée le jour j (la carte reçue n'est pas modifiée). */
  noter(carte: CarteFsrs, j: number, note: Note): CarteFsrs;
}

/** Planificateur FSRS pour des paramètres donnés (par défaut PARAMS_FSRS). */
export function planificateur(params: ParamsFsrs = PARAMS_FSRS): Planificateur {
  const f: FSRS = fsrs({ ...params });
  return {
    neuve: (j) => createEmptyCard(dateDuJour(j)),
    noter: (carte, j, note) => f.next(carte, dateDuJour(j), note as Grade).card,
  };
}

/** Jour local où la fiche redevient due. */
export function echeance(carte: CarteFsrs): number {
  return jourDeDate(carte.due);
}

/** Stabilité S en jours (le temps pour que le rappel tombe à 90 %). */
export function stabilite(carte: CarteFsrs): number {
  return carte.stability;
}
