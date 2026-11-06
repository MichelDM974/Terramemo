// Règle de note d'une réponse (docs/plan.md : « FSRS démarre au premier
// rappel sans aide »). La note est calculée une fois, à l'écriture de
// l'événement, et figée dans le journal.

import type { Aide, ModeEvenement } from './journal';
import { MODES_NOTES } from './journal';

/** Note FSRS : 1 Again, 2 Hard, 3 Good, 4 Easy (valeurs de ts-fsrs, Rating). */
export type Note = 1 | 2 | 3 | 4;
export const AGAIN: Note = 1;
export const HARD: Note = 2;
export const GOOD: Note = 3;
export const EASY: Note = 4;

/** Ce qui décide de la note : juste ou non au premier toucher, et l'aide prise. */
export interface Reponse {
  correct: boolean;
  aide: Aide | null;
}

/**
 * Défaut en attente de l'utilisateur, #2 (D3) : faux au premier toucher (à
 * toute distance), « Voir » ou « Passer » → Again ; juste sans aide → Good ;
 * juste après « Je connais déjà » → Easy (faux après elle : Again, la
 * prétention est vérifiée). Jamais Hard : le temps sur une carte dépend du
 * zoom et des micro-États, et un faux proche n'est pas un rappel réussi.
 * Distance et durée restent dans le journal pour une autre règle plus tard.
 */
export function noter(r: Reponse): Note {
  if (!r.correct || r.aide === 'voir' || r.aide === 'passer') return AGAIN;
  return r.aide === 'connu' ? EASY : GOOD;
}

/** Note d'une étape : null hors FSRS (QCM d'apprentissage, partie libre). */
export function noteEtape(mode: ModeEvenement, r: Reponse): Note | null {
  return MODES_NOTES.includes(mode) ? noter(r) : null;
}
