// Textes des erreurs des comptes (étude du J1b, § 3.3), à part de textes.ts (décision « Langue », même règle) :
// seul src/sync/erreurs.ts les lit, et il n'est importé que par les morceaux des comptes, chargés à la demande
// (la vue Compte, comptes.ts, envoi.ts) : ils ne pèsent pas sur le morceau principal (décision « Morceau JS
// principal sous 500 Ko »). Un import statique de ce fichier depuis le morceau principal les y ramènerait
// (tests/morceau-principal.test.ts le refuse).
import fr from './textes-erreurs.fr.json';

export type TextesErreurs = typeof fr;
export const textesErreurs: TextesErreurs = fr;
