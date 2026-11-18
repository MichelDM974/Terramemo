// Textes de la fiche d'un lieu (#34) et de la ligne de faits de sa barre, à part
// de textes.ts (décision « Langue », même règle) : seuls le morceau de la fiche
// (src/vues/fiche.ts, chargé à la demande) et ce qu'il importe les lisent, pour
// qu'ils ne pèsent pas sur le morceau principal (étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 6.1 et § 19). Un import
// statique de ce fichier depuis le morceau principal les y ramènerait.
import fr from './textes-fiche.fr.json';

export type TextesFiche = typeof fr;
export const textesFiche: TextesFiche = fr;
