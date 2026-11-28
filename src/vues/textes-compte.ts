// Textes de la vue Compte (J1b), à part de textes.ts (décision « Langue », même règle) : seuls ses morceaux chargés à
// la demande les lisent (src/vues/compte.ts, src/sync/erreurs.ts), pour qu'ils ne pèsent pas sur le morceau principal
// (décision « Morceau JS principal sous 500 Ko »). Ceux que lit le morceau principal restent dans textes.fr.json, sous
// compte. Un import statique de ce fichier depuis le morceau principal les y ramènerait (tests/morceau-principal.test.ts
// le refuse).
import fr from './textes-compte.fr.json';

export type TextesCompte = typeof fr;
export const textesCompte: TextesCompte = fr;
