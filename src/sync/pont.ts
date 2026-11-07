// Pont entre les vues du morceau principal et les comptes du J1b (morceau à
// part, src/sync/comptes.ts), sans rien charger de Firebase : un invité ne
// le charge jamais pour un record ou un pseudo (D9 b). Étude du J1b, § 5.4 :
// un record ou un pseudo nouveau va au profil du compte (`joueurs/{uid}`) ;
// main.ts branche le relais, qui ne fait rien pour un invité. Les vues lisent
// aussi ici l'état du compte connu de la page (zone du pseudo du classement,
// § 3.1), que les comptes tiennent à jour à chaque relecture.

/** Ce qui vient de changer sur l'appareil : le pseudo, ou des records. */
export type ChangementProfil = 'pseudo' | 'records';

let relais: ((c: ChangementProfil) => void) | null = null;

/** main.ts : le relais vers les comptes (chargés à la demande). */
export function brancherProfil(f: ((c: ChangementProfil) => void) | null): void {
  relais = f;
}

/** Un record ou un pseudo nouveau sur l'appareil : le profil du compte suivra (rien pour un invité). */
export function profilModifie(c: ChangementProfil): void {
  relais?.(c);
}

/** L'état du compte que la page connaît : invité tant que les comptes ne l'ont pas relu. */
export type EtatCompteConnu = 'invite' | 'compte' | 'perdue';

let connu: EtatCompteConnu = 'invite';

export const etatCompteConnu = (): EtatCompteConnu => connu;

/** Les comptes (src/sync/comptes.ts), à chaque état relu. */
export function poserEtatCompte(e: EtatCompteConnu): void {
  connu = e;
}
