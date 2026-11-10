// Google (J1b, lot 6 ; étude docs/etudes/2026-11-07-j1b-conception.md, § 2.2,
// § 2.3 et § 4) : ce que les comptes (src/sync/comptes.ts) demandent à Google,
// derrière une interface qu'on remplace.
// - Sur le site : la fenêtre de Google (signInWithPopup, linkWithPopup,
//   reauthenticateWithPopup), toujours lancée par un geste (bouton). Elle ne
//   s'essaie pas dans node : les tests la remplacent par googleParJeton.
// - Par un idToken : GoogleAuthProvider.credential(idToken), puis
//   signInWithCredential, linkWithCredential ou reauthenticateWithCredential.
//   C'est la voie de l'APK au lot 7 (idToken du plugin natif), et celle des
//   tests à l'émulateur Auth, qui accepte pour idToken les claims en JSON
//   strict (S9 : `{"sub":"…","email":"…","email_verified":true}`).
// Rien n'est importé de Firebase ici (types seulement) : le SDK est celui du
// service (charger(), src/sync/firebase.ts).
import type { Service } from './firebase';

type User = import('firebase/auth').User;
type UserCredential = import('firebase/auth').UserCredential;
type AuthCredential = import('firebase/auth').AuthCredential;

export interface Google {
  /** Connexion à un compte Google : celui qui existe déjà, sinon un compte neuf (isNewUser). */
  connecter(s: Service): Promise<UserCredential>;
  /** Lien de l'invité anonyme `u` à un compte Google : l'uid est gardé (§ 2.2). */
  lier(s: Service, u: User): Promise<UserCredential>;
  /** Réauthentification du compte `u` (suppression, § 7.1) ; auth/user-mismatch si un autre compte Google est choisi. */
  reauthentifier(s: Service, u: User): Promise<void>;
  /**
   * Après un lien refusé parce que le compte Google, ou son adresse, est déjà
   * à un compte (auth/credential-already-in-use, auth/email-already-in-use :
   * § 2.3) : le credential pour se connecter à ce compte, ou null.
   */
  credentialDe(s: Service, e: unknown): AuthCredential | null;
}

type ErreurAuth = Parameters<typeof import('firebase/auth').GoogleAuthProvider.credentialFromError>[0];

/**
 * La fenêtre de Google (site). Connexion et lien proposent toujours le choix
 * du compte (`prompt: select_account`) : sinon, le seul compte Google du
 * navigateur est pris sans rien demander, ce qui gêne sur un appareil
 * partagé. La réauthentification laisse Google proposer le compte connu.
 * Le credential d'un lien refusé vient de l'erreur (la popup demande
 * returnIdpCredential : l'idToken de Google y est).
 */
export function googlePopup(): Google {
  const choix = (s: Service) => {
    const p = new s.m.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  };
  return {
    connecter: (s) => s.m.auth.signInWithPopup(s.a, choix(s)),
    lier: (s, u) => s.m.auth.linkWithPopup(u, choix(s)),
    async reauthentifier(s, u) {
      await s.m.auth.reauthenticateWithPopup(u, new s.m.auth.GoogleAuthProvider());
    },
    credentialDe: (s, e) => s.m.auth.GoogleAuthProvider.credentialFromError(e as ErreurAuth),
  };
}

/**
 * Google par un idToken (`jeton` : un nouvel idToken à chaque appel ; APK au
 * lot 7, tests à l'émulateur). Un lien par linkWithCredential ne rend pas
 * l'idToken dans son erreur : le même sert à la connexion qui suit (S23).
 */
export function googleParJeton(jeton: () => Promise<string>): Google {
  let dernier: string | null = null;
  const credential = (s: Service, t: string) => s.m.auth.GoogleAuthProvider.credential(t);
  return {
    async connecter(s) {
      dernier = await jeton();
      return s.m.auth.signInWithCredential(s.a, credential(s, dernier));
    },
    async lier(s, u) {
      dernier = await jeton();
      return s.m.auth.linkWithCredential(u, credential(s, dernier));
    },
    async reauthentifier(s, u) {
      dernier = await jeton();
      await s.m.auth.reauthenticateWithCredential(u, credential(s, dernier));
    },
    credentialDe(s, e) {
      return s.m.auth.GoogleAuthProvider.credentialFromError(e as ErreurAuth) ?? (dernier ? credential(s, dernier) : null);
    },
  };
}
