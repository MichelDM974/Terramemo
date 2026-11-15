// Comptes du J1b (src/sync/comptes.ts), ce que l'émulateur Auth ne sait pas
// provoquer (tests/comptes.test.ts pour le reste) : quota du jour à l'oubli,
// session écrite avant le rafraîchissement du jeton, repli en mémoire quand
// IndexedDB refuse d'écrire. Le SDK est remplacé par un faux minimal.
import { describe, expect, it, vi } from 'vitest';
import { creerComptes } from '../src/sync/comptes';
import { traduire } from '../src/sync/erreurs';
import { creerJetonGoogle } from '../src/sync/google-apk';
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

describe('suppression d’un compte Google : la réauthentification (§ 7.1, étape 1)', () => {
  /**
   * Un compte Google connecté, dont la session est celle de l'appareil ; Firestore refuse (on ne teste que
   * l'étape 1). `deux` : le compte a aussi un mot de passe (adresse vérifiée, puis Google ajouté).
   */
  function google(deux = false) {
    const appels: string[] = [];
    const fournisseurs = deux ? (['password', 'google.com'] as const) : (['google.com'] as const);
    const u = {
      uid: 'g1',
      email: 'gael@gmail.com',
      isAnonymous: false,
      emailVerified: true,
      providerData: fournisseurs.map((providerId) => ({ providerId })),
      getIdToken: async () => 'jeton',
      getIdTokenResult: async () => ({ claims: { email_verified: true } }),
      reload: async () => undefined,
    };
    class GoogleAuthProvider {
      parametres: Record<string, string> = {};
      setCustomParameters(x: Record<string, string>) {
        this.parametres = x;
        return this;
      }
      static credential(idToken: string) {
        return { idToken };
      }
    }
    const auth = {
      onAuthStateChanged: () => () => undefined,
      GoogleAuthProvider,
      EmailAuthProvider: { credential: (email: string, mdp: string) => ({ email, mdp }) },
      reauthenticateWithPopup: async (_u: unknown, p: GoogleAuthProvider) => void appels.push(`popup:${p instanceof GoogleAuthProvider}:${p.parametres.login_hint}`),
      reauthenticateWithCredential: async (_u: unknown, c: { idToken?: string; mdp?: string }) => void appels.push(c.mdp ? `mdp:${c.mdp}` : `credential:${c.idToken}`),
    };
    // La lecture du profil (étape 3) échoue : la suppression s'arrête là, après la réauthentification.
    const fs = { doc: () => ({}), getDoc: async () => Promise.reject(err('permission-denied')) };
    const service = async () => ({ m: { auth, fs }, db: {}, a: { currentUser: u } }) as never;
    const session = depotSessionMemoire({ uid: 'g1', fournisseurs: [...fournisseurs], adresse: 'gael@gmail.com', marque: null, profil_a_ecrire: false, deconnexion: null, effacement: null, suppression: null, connexion: null, version: '' });
    return { appels, service, session };
  }

  it('un compte à mot de passe et Google : le mot de passe s’il est donné, sinon la fenêtre de Google ; dans l’APK sans plugin, le mot de passe', async () => {
    const g = google(true);
    const c = creerComptes({ session: g.session, service: g.service, natif: () => false });
    await expect(c.supprimer({ mot: 'supprimer', mdp: '' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(c.supprimer({ mot: 'supprimer', mdp: 'motdepasse' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(g.appels).toEqual(['popup:true:gael@gmail.com', 'mdp:motdepasse']);
    const apk = creerComptes({ session: g.session, service: g.service, natif: () => true });
    await expect(apk.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'auth/missing-password' });
  });

  it('la reprise d’une suppression d’un compte à mot de passe et Google, session perdue, sans mot de passe : par Google', async () => {
    const session = depotSessionMemoire({ uid: 'g1', fournisseurs: ['password', 'google.com'], adresse: 'gael@gmail.com', marque: null, profil_a_ecrire: false, deconnexion: null, effacement: null, suppression: 'g1', connexion: null, version: '' });
    const a = { currentUser: null as unknown };
    const u = { uid: 'g1', email: 'gael@gmail.com', isAnonymous: false, emailVerified: true, providerData: [{ providerId: 'password' }, { providerId: 'google.com' }], reload: async () => undefined };
    const connecter = vi.fn(async () => ((a.currentUser = u), { user: u }) as never);
    const fs = { doc: () => ({}), getDoc: async () => Promise.reject(err('permission-denied')) };
    const service = async () => ({ m: { auth: { onAuthStateChanged: () => () => undefined, getAdditionalUserInfo: () => ({ isNewUser: false }) }, fs }, db: {}, a }) as never;
    const c = creerComptes({ session, service, google: { connecter, lier: vi.fn(), reauthentifier: vi.fn(), credentialDe: () => null } });
    await expect(c.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(connecter).toHaveBeenCalledWith(expect.anything(), 'gael@gmail.com');
    expect((await session.lire())?.suppression).toBe('g1');
  });

  it('sur le site : la fenêtre de Google, pas de mot de passe', async () => {
    const g = google();
    const c = creerComptes({ session: g.session, service: g.service, natif: () => false });
    await expect(c.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(g.appels).toEqual(['popup:true:gael@gmail.com']);
    // Réauthentifié, puis le profil refusé avant la pierre tombale : rien d'irréversible, le drapeau
    // posé par cet appel est levé (sans quoi l'appareil resterait bloqué tant que les règles refusent).
    expect((await g.session.lire())?.suppression).toBeNull();
  });

  it('dans l’APK sans le plugin (lot 7) : « supprime-le depuis le site », rien de commencé', async () => {
    const g = google();
    const c = creerComptes({ session: g.session, service: g.service, natif: () => true });
    const e = await c.supprimer({ mot: 'supprimer' }).catch((x: unknown) => x);
    expect(traduire(e).texte).toBe("Dans l'appli, un compte Google se supprime depuis le site : terramemo-geo.web.app.");
    expect(g.appels).toEqual([]);
    expect((await g.session.lire())?.suppression).toBeNull();
  });

  it('dans l’APK avec le plugin : un nouvel idToken, par reauthenticateWithCredential', async () => {
    const g = google();
    const c = creerComptes({ session: g.session, service: g.service, natif: () => true, jetonGoogle: async () => 'id-token-du-plugin' });
    await expect(c.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(g.appels).toEqual(['credential:id-token-du-plugin']);
  });

  it('dans l’APK, par le vrai module du plugin (lot 7, plugin factice) : un idToken neuf à chaque essai ; la feuille refermée ne commence rien, sans message', async () => {
    const g = google();
    let n = 0;
    const plugin = { initialize: vi.fn(async () => undefined), signIn: vi.fn(async () => ({ idToken: `id-token-${++n}` })) };
    const jetonGoogle = creerJetonGoogle({ natif: () => true, plugin: async () => plugin as never });
    const c = creerComptes({ session: g.session, service: g.service, natif: () => true, jetonGoogle });
    expect(c.googleOffert()).toBe(true);
    await expect(c.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(c.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(g.appels).toEqual(['credential:id-token-1', 'credential:id-token-2']);
    expect(plugin.initialize).toHaveBeenCalledOnce();
    plugin.signIn.mockRejectedValueOnce(Object.assign(new Error('activity is cancelled by the user.'), { code: 'SIGN_IN_CANCELED' }));
    const e = await c.supprimer({ mot: 'supprimer' }).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'terramemo/google-annule' });
    expect(traduire(e).texte).toBeNull();
    expect(g.appels).toHaveLength(2);
    expect((await g.session.lire())?.suppression).toBeNull();
    // Le rapport du pilote garde le message du plugin.
    expect(c.rapport().erreurs.at(-1)).toMatchObject({ code: 'terramemo/google-annule', message: expect.stringContaining('activity is cancelled by the user.') });
  });

  it('sur le site, un jetonGoogle passé quand même n’est jamais appelé : la fenêtre de Google (le plugin hors du site, lot 7)', async () => {
    const g = google();
    const jetonGoogle = vi.fn(async () => 'id-token-du-plugin');
    const c = creerComptes({ session: g.session, service: g.service, natif: () => false, jetonGoogle });
    expect(c.googleOffert()).toBe(true);
    await expect(c.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(g.appels).toEqual(['popup:true:gael@gmail.com']);
    expect(jetonGoogle).not.toHaveBeenCalled();
  });

  it('une suppression inachevée dont la session est perdue, dans l’APK sans le plugin : « reconnecte-toi sur le site », rien de vidé', async () => {
    const effacer = vi.fn(async () => undefined);
    const session = depotSessionMemoire({ uid: 'g1', fournisseurs: ['google.com'], adresse: 'gael@gmail.com', marque: null, profil_a_ecrire: false, deconnexion: null, effacement: null, suppression: 'g1', connexion: null, version: '' });
    const service = async () => ({ m: { auth: { onAuthStateChanged: () => () => undefined }, fs: {} }, db: {}, a: { currentUser: null } }) as never;
    const c = creerComptes({ session, service, natif: () => true, appareil: { reponsesHorsCompte: async () => 0, nonEnvoyees: async () => 0, envoyerTout: async () => ({ nonEnvoyees: 0, refusees: 0 }), effacer } });
    expect(await c.etat()).toMatchObject({ etat: 'suppression', uid: 'g1', connecte: false, horsAuth: false });
    const e = await c.supprimer({ mot: 'supprimer' }).catch((x: unknown) => x);
    expect(traduire(e).texte).toBe('Ce compte se reconnecte sur le site : terramemo-geo.web.app.');
    expect(effacer).not.toHaveBeenCalled();
    expect((await session.lire())?.suppression).toBe('g1');
  });
});
