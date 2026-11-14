// La forme d'une partie par difficulté (étude J2 § 9.2 ; D49 a avec d, décision
// « Quiz général ») : les lieux, les formes sur 20, les délais. Les leurres de
// chaque difficulté sont dans generateurs.ts, qui lit LEURRES.
import type { Difficulte, Niveau } from './types';

export interface RegleDifficulte {
  /** Les lieux jusqu'à ce niveau de notoriété : 1 au facile, 2 au moyen, tous au-delà. */
  niveauMax: Niveau;
  /** Questions à 4 choix sur les 20 ; le reste se joue au toucher. */
  qcm: number;
  /** Délai d'une question à 4 choix, et au toucher (ms). */
  delai_qcm_ms: number;
  delai_toucher_ms: number;
}

/**
 * D49 a : 20 + 0 en facile, 10 + 10 en moyen, 8 + 12 en difficile et en
 * expert ; 10 et 15 s, 6 et 10 s en expert (à caler à l'essai, S31).
 */
export const REGLES: Readonly<Record<Difficulte, RegleDifficulte>> = {
  facile: { niveauMax: 1, qcm: 20, delai_qcm_ms: 10_000, delai_toucher_ms: 15_000 },
  moyen: { niveauMax: 2, qcm: 10, delai_qcm_ms: 10_000, delai_toucher_ms: 15_000 },
  difficile: { niveauMax: 3, qcm: 8, delai_qcm_ms: 10_000, delai_toucher_ms: 15_000 },
  expert: { niveauMax: 3, qcm: 8, delai_qcm_ms: 6_000, delai_toucher_ms: 10_000 },
};

/**
 * Les leurres d'une difficulté (§ 9.2) :
 * - connus : 3 lieux connus (du niveau de la difficulté), du même continent
 *   d'abord (D49 d) ; drapeaux : 3 éloignés (aucune paire proche avec le juste) ;
 * - voisin : 1 voisin, puis 2 lieux du niveau (du même continent d'abord) ;
 *   drapeaux : 1 sosie, 2 éloignés ;
 * - voisins : les voisins, puis les plus proches (ceux de l'Entraînement) ;
 *   drapeaux : 3 sosies.
 * Au facile et au moyen, jamais un leurre au nom proche du juste (Kingston et
 * Kingstown, § 2.1) ; au-delà, ce sont de bons leurres.
 */
export type SorteLeurres = 'connus' | 'voisin' | 'voisins';
export const LEURRES: Readonly<Record<Difficulte, SorteLeurres>> = { facile: 'connus', moyen: 'voisin', difficile: 'voisins', expert: 'voisins' };

/** Noms proches écartés des leurres : au facile et au moyen seulement. */
export const sansNomsProches = (d: Difficulte): boolean => d === 'facile' || d === 'moyen';
