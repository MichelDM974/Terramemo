// Textes de l'écran Crédits et du fichier des licences tierces, à part de
// textes.ts (décision « Langue », même règle) : seuls le morceau de l'écran
// Crédits (src/vues/credits.ts, chargé à la demande par main.ts) et
// licences/tierces.ts (Node, au build) les lisent, pour qu'ils ne pèsent pas
// sur le morceau principal (décision « Morceau JS principal sous 500 Ko »).
// Un import statique de ce fichier depuis le morceau principal les y
// ramènerait (tests/morceau-principal.test.ts le refuse).
import fr from './textes-credits.fr.json';

/** Les textes de l'écran ; le titre, le retour et l'attente restent dans textes.credits (le morceau principal). */
export type TextesCredits = typeof fr;
export const textesCredits: TextesCredits = fr;
