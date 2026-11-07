// Comptes du J1b (src/sync/comptes.ts), ce que l'émulateur Auth ne sait pas
// provoquer (tests/comptes.test.ts pour le reste) : quota du jour à l'oubli,
// session écrite avant le rafraîchissement du jeton, repli en mémoire quand
// IndexedDB refuse d'écrire. Le SDK est remplacé par un faux minimal.
import { describe, expect, it, vi } from 'vitest';
import { creerComptes } from '../src/sync/comptes';
import { traduire } from '../src/sync/erreurs';
import { depotSessionMemoire, type DepotSession, type Session } from '../src/sync/session';

const err = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

interface FauxUtilisateur {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
  providerData: { providerId: string }[];
  getIdToken: (force?: boolean) => Promise<string>;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  reload: () => Promise<void>;
}

function faux(o: { reset?: () => Promise<void>; jeton?: () => Promise<string> } = {}) {
  const a = { currentUser: null as FauxUtilisateur | null };
  const utilisateur = (email: string): FauxUtilisateur => ({
    uid: 'u1',
    email,
    isAnonymous: false,
    emailVerified: false,
    providerData: [{ providerId: 'password' }],
    getIdToken: o.jeton ?? (async () => 'jeton'),
    getIdTokenResult: async () => ({ claims: { firebase: { identities: { email: [email] }, sign_in_provider: 'password' } } }),
    reload: async () => undefined,
  });
  const auth = {
    onAuthStateChanged: () => () => undefined,
    sendPasswordResetEmail: o.reset ?? (async () => undefined),
    createUserWithEmailAndPassword: async (_a: unknown, email: string) => {
      a.currentUser = utilisateur(email);
      return { user: a.currentUser };
    },
    sendEmailVerification: async () => undefined,
    signOut: async () => {
      a.currentUser = null;
    },
  };
  return { service: async () => ({ m: { auth, fs: {} }, db: {}, a }) as never, a };
}

describe('comptes, hors émulateur', () => {
  it('oubli au-delà du quota du jour : « Limite du jour atteinte », pas « quelques minutes » (§ 2.4)', async () => {
    const { service } = faux({ reset: async () => Promise.reject(err('auth/too-many-requests')) });
    const c = creerComptes({ session: depotSessionMemoire(), service });
    const e = await c.oublier('ana@exemple.fr').catch((x: unknown) => x);
    expect(traduire(e).texte).toMatch(/^Limite du jour atteinte : réessaie après \d+ h/);
    expect(c.rapport().erreurs.at(-1)?.code).toBe('auth/quota-exceeded');
  });

  it('jeton pas rafraîchi (réseau) : le compte est fait, la session écrite quand même', async () => {
    const { service } = faux({ jeton: async () => Promise.reject(err('auth/network-request-failed')) });
    const session = depotSessionMemoire();
    const c = creerComptes({ session, service });
    await expect(c.creer('ana@exemple.fr', 'motdepasse')).resolves.toMatchObject({ adresse: 'ana@exemple.fr', verification: true });
    expect((await session.lire())?.uid).toBe('u1');
    expect(c.rapport().erreurs.map((x) => x.code)).toContain('auth/network-request-failed');
  });

  it('IndexedDB qui refuse d’écrire (quota plein) : la session vit en mémoire, la déconnexion n’est pas une session perdue', async () => {
    const { service } = faux();
    let fiche: Session | null = null;
    const plein: DepotSession = {
      lire: async () => fiche,
      ecrire: async () => Promise.reject(Object.assign(new Error('plein'), { name: 'QuotaExceededError' })),
    };
    const c = creerComptes({ session: plein, service });
    await c.creer('ana@exemple.fr', 'motdepasse');
    expect(await c.etat()).toMatchObject({ etat: 'compte', uid: 'u1' });
    // Le profil n'a pas pu partir (faux SDK sans Firestore) : la déconnexion le dit d'abord (§ 3.4).
    expect(await c.deconnecter()).toMatchObject({ fait: false, profil: false, nonEnvoyees: 0 });
    expect(await c.etat()).toMatchObject({ etat: 'compte', uid: 'u1' });
    expect(await c.deconnecter({ quandMeme: true })).toEqual({ fait: true });
    expect(await c.etat()).toEqual({ etat: 'invite', anonyme: false });
    fiche = null;
  });
});
