// Textes du curseur des Habitants et des Superficies (J4, lot 3), à part de textes.ts (décision « Langue », même
// règle) : seul le morceau du curseur (src/vues/curseur.ts, chargé à la demande par chargerCurseur de commun.ts) les
// lit, pour qu'ils ne pèsent pas sur le morceau principal (décision « Morceau JS principal sous 500 Ko »). Un import
// statique de ce fichier depuis le morceau principal les y ramènerait (tests/morceau-principal.test.ts le refuse).
import fr from './textes-grandeurs.fr.json';

export type TextesGrandeurs = typeof fr;
export const textesGrandeurs: TextesGrandeurs = fr;
