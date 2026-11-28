// Textes du sujet Voisins (J4, lot 2), à part de textes.ts (décision « Langue », même règle) : seul le morceau des
// voisins (src/vues/voisins.ts, chargé à la demande par chargerVoisins de sujets.ts) les lit, pour qu'ils ne pèsent
// pas sur le morceau principal (décision « Morceau JS principal sous 500 Ko »). Un import statique de ce fichier
// depuis le morceau principal les y ramènerait (tests/morceau-principal.test.ts le refuse).
import fr from './textes-voisins.fr.json';

export type TextesVoisins = typeof fr;
export const textesVoisins: TextesVoisins = fr;
