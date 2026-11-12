// Noms et scores affichés des épreuves classées (décision « Barème et
// classements » du 12/11/2026, #30) : chaque question est juste ou fausse, le
// champ `points` porte les justes (src/epreuve/chrono.ts, barème 2), et le
// score se lit en part des questions qui font les 100 % : « 190/195 · 97 % »
// au Chrono, « 17/54 · 31 % » à Sans faute (les justes d'affilée sur la taille
// de la série), « 7,6 % » au général (sur BORNE_GENERAL). Le pourcentage est
// TRONQUÉ : 194/195 montre 99 %, jamais 100 % sans tout juste. Le classement
// se fait aux justes puis au temps ; seul l'affichage est ici.
import { DELAI_CHRONO_MS, type ScoreEpreuve } from '../epreuve/bareme';
import { BORNE_GENERAL, modeEpreuve, tailleEpreuve, type ModeEpreuve } from '../epreuve/chrono';
import { GENERAL } from '../epreuve/classement';
import { remplir, textes } from './textes';

const E = textes.epreuves;

/** « Chrono », « Sans faute ». */
export const nomMode = (m: ModeEpreuve): string => E[m].nom;

/** Secondes par question annoncées au départ et dans Jouer : celles du Chrono et de Sans faute (15 s). */
export const SECONDES_EPREUVE = DELAI_CHRONO_MS.localiser / 1000;

/** « 1 194 » : un nombre à la française (espace fine insécable des milliers). */
export const fmtNombre = (n: number): string => n.toLocaleString('fr-FR');

/** « 42 s », « 3 min 05 » (espaces insécables). */
export function fmtTemps(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

/** « 1 juste », « 2 justes » (le pluriel français commence à 2 ; 0 juste). */
export const fmtJustes = (n: number): string => remplir(n >= 2 ? E.justes : E.juste_1, { n: fmtNombre(n) });

/** La part entière, TRONQUÉE : « 97 % » pour 190/195, « 99 % » pour 194/195 ; 100 % seulement tout juste. */
export const fmtPourcent = (justes: number, total: number): string => remplir(E.pourcent, { n: total > 0 ? Math.floor((100 * justes) / total) : 0 });

/** « 190/195 · 97 % ». */
export const fmtPart = (justes: number, total: number): string => remplir(E.part, { justes: fmtNombre(justes), total: fmtNombre(total), pourcent: fmtPourcent(justes, total) });

/**
 * La part du général, à une décimale TRONQUÉE (« 7,6 % » pour 91 justes sur
 * 1 194, « 99,9 % » pour 1 193) : toutes les questions du Chrono de toutes
 * les séries ouvertes (BORNE_GENERAL) font les 100 %.
 */
export function fmtPourcentGeneral(justes: number): string {
  const dixiemes = Math.floor((1000 * justes) / BORNE_GENERAL);
  return remplir(E.pourcent, { n: (dixiemes / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
}

/** Le détail du général : « 91 justes sur 1 194 ». */
export const fmtJustesGeneral = (justes: number): string => remplir(E.general_detail, { justes: fmtJustes(justes), total: fmtNombre(BORNE_GENERAL) });

/** Le classement général (src/epreuve/classement.ts, GENERAL), de toujours ou d'une semaine. */
export const estGeneral = (epreuve: string): boolean => epreuve.split('@')[0] === GENERAL;

/**
 * Les questions qui font les 100 % d'un score d'épreuve : celles de la
 * partie (Chrono : toute la série ; le quiz de même, et un mode inconnu), la
 * taille de la série à Sans faute (tailleEpreuve), qui finit à la première
 * erreur ; null à Sans faute hors du catalogue.
 */
function totalDe(epreuve: string, s: ScoreEpreuve): number | null {
  return modeEpreuve(epreuve) === 'sansfaute' ? tailleEpreuve(epreuve) : s.questions;
}

/** Le pourcentage seul (« 97 % », « 7,6 % » au général) : la colonne étroite d'un tableau ; null sans total connu. */
export function pourcentDe(epreuve: string, s: ScoreEpreuve): string | null {
  if (estGeneral(epreuve)) return fmtPourcentGeneral(s.justes);
  const total = totalDe(epreuve, s);
  return total === null ? null : fmtPourcent(s.justes, total);
}

/** Les justes sur les questions qui font les 100 % (« 54/54 », « 91/1 194 » au général) : le détail d'une case de score du 🏆 ; null sans total connu. */
export function fractionDe(epreuve: string, s: ScoreEpreuve): string | null {
  const total = estGeneral(epreuve) ? BORNE_GENERAL : totalDe(epreuve, s);
  return total === null ? null : remplir(E.fraction, { justes: fmtNombre(s.justes), total: fmtNombre(total) });
}

/**
 * Le score en bref de cette épreuve (Jouer, 🏆, tableau d'un classement) :
 * « 190/195 · 97 % » (Chrono), « 17/54 · 31 % » (Sans faute ; « 17
 * d'affilée » hors du catalogue), « 7,6 % » (le général).
 */
export function scoreCourt(epreuve: string, s: ScoreEpreuve): string {
  if (estGeneral(epreuve)) return fmtPourcentGeneral(s.justes);
  const total = totalDe(epreuve, s);
  return total === null ? remplir(E.sansfaute.compte, { n: fmtNombre(s.justes) }) : fmtPart(s.justes, total);
}

/**
 * Le score dit en entier, sans le temps : « 190/195 · 97 % », « 17
 * d'affilée sur 54 · 31 % » (bilan de Sans faute), « 91 justes sur 1 194 »
 * (le général).
 */
export function scoreEntier(epreuve: string, s: ScoreEpreuve): string {
  if (estGeneral(epreuve)) return fmtJustesGeneral(s.justes);
  const total = totalDe(epreuve, s);
  if (modeEpreuve(epreuve) === 'sansfaute' && total !== null)
    return remplir(E.sansfaute.score, { n: fmtNombre(s.justes), total: fmtNombre(total), pourcent: fmtPourcent(s.justes, total) });
  return scoreCourt(epreuve, s);
}

/**
 * Le score avec son temps (records du bilan : « Record à battre : … ») :
 * « 190/195 · 97 % en 3 min 05 », « 17 d'affilée sur 54 · 31 % en 1 min 02 ».
 */
export const scoreLong = (epreuve: string, s: ScoreEpreuve): string => remplir(E.en_temps, { score: scoreEntier(epreuve, s), temps: fmtTemps(s.temps_ms) });
