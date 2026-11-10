// Google (J1b, lot 6 ; étude § 2.2, § 2.3, § 4.1), sans émulateur : la
// fenêtre de Google (src/sync/google.ts, googlePopup) sur un faux SDK, puisque
// la popup ne s'ouvre pas dans node ; puis comptes.google() sur un faux SDK
// minimal, pour ce que l'émulateur ne sait pas provoquer (invité supprimé
// pendant le lien, erreur sans credential, appli de l'APK sans plugin). Le
// vrai SDK, à l'émulateur Auth : tests/google.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { creerComptes, type AppareilComptes, type ChoixFusion, type QuestionFusion } from '../src/sync/comptes';
import { googleParJeton, googlePopup, type Google } from '../src/sync/google';
import { depotSessionMemoire, sessionVide, type Session } from '../src/sync/session';

const err = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

class GoogleAuthProvider {
  parametres: Record<string, string> = {};
  setCustomParameters(p: Record<string, string>) {
    this.parametres = p;
    return this;
  }
  static credential(idToken: string) {
    return { idToken };
  }
  static credentialFromError(e: { customData?: { _tokenResponse?: { oauthIdToken?: string } } }) {
    const t = e.customData?._tokenResponse?.oauthIdToken;
    return t ? { idToken: t } : null;
  }
}

describe('googlePopup : la fenêtre de Google (site)', () => {
  function monter() {
    const appels: { f: string; p: GoogleAuthProvider; u?: unknown }[] = [];
    const a = { nom: 'auth' };
    const auth = {
      GoogleAuthProvider,
      signInWithPopup: async (x: unknown, p: GoogleAuthProvider) => (expect(x).toBe(a), appels.push({ f: 'signInWithPopup', p }), { user: { uid: 'g' } }),
      linkWithPopup: async (u: unknown, p: GoogleAuthProvider) => (appels.push({ f: 'linkWithPopup', p, u }), { user: u }),
      reauthenticateWithPopup: async (u: unknown, p: GoogleAuthProvider) => (appels.push({ f: 'reauthenticateWithPopup', p, u }), { user: u }),
    };
    return { appels, s: { m: { auth, fs: {} }, db: {}, a } as never };
  }

  it('toujours le choix du compte ; le compte attendu proposé (login_hint) à la réauthentification et à la reconnexion', async () => {
    const { appels, s } = monter();
    const g = googlePopup();
    const u = { uid: 'anonyme', email: null } as never;
    const compte = { uid: 'g', email: 'ana@gmail.com' } as never;
    await g.connecter(s);
    await g.lier(s, u);
    await g.reauthentifier(s, compte);
    await g.connecter(s, 'ana@gmail.com');
    await g.connecter(s, null);
    // Sans login_hint, le navigateur qui n'a plus que la session Google d'un autre compte le prendrait
    // sans rien montrer : auth/user-mismatch à chaque essai.
    expect(appels.map((x) => [x.f, x.p instanceof GoogleAuthProvider, x.p.parametres])).toEqual([
      ['signInWithPopup', true, { prompt: 'select_account' }],
      ['linkWithPopup', true, { prompt: 'select_account' }],
      ['reauthenticateWithPopup', true, { prompt: 'select_account', login_hint: 'ana@gmail.com' }],
      ['signInWithPopup', true, { prompt: 'select_account', login_hint: 'ana@gmail.com' }],
      ['signInWithPopup', true, { prompt: 'select_account' }],
    ]);
    expect(appels[1]!.u).toBe(u);
  });

  it('le credential d’un lien refusé vient de l’erreur (idToken rendu par la popup), sinon rien', () => {
    const { s } = monter();
    const g = googlePopup();
    const e = Object.assign(err('auth/credential-already-in-use'), { customData: { _tokenResponse: { oauthIdToken: 'id-google' } } });
    expect(g.credentialDe(s, e)).toEqual({ idToken: 'id-google' });
    expect(g.credentialDe(s, err('auth/credential-already-in-use'))).toBeNull();
  });
});

describe('googleParJeton : un idToken (APK au lot 7, émulateur)', () => {
  it('un jeton neuf à chaque appel ; après un lien refusé, le même jeton sert à se connecter (S23)', async () => {
    const vus: string[] = [];
    const auth = {
      GoogleAuthProvider,
      signInWithCredential: async (_a: unknown, c: { idToken: string }) => (vus.push(`connexion:${c.idToken}`), { user: {} }),
      linkWithCredential: async (_u: unknown, c: { idToken: string }) => {
        vus.push(`lien:${c.idToken}`);
        throw err('auth/credential-already-in-use');
      },
      reauthenticateWithCredential: async (_u: unknown, c: { idToken: string }) => void vus.push(`reauth:${c.idToken}`),
    };
    const s = { m: { auth, fs: {} }, db: {}, a: {} } as never;
    let n = 0;
    const g = googleParJeton(async () => `jeton-${++n}`);
    const e = await g.lier(s, {} as never).catch((x: unknown) => x);
    expect(g.credentialDe(s, e)).toEqual({ idToken: 'jeton-1' });
    await g.connecter(s);
    await g.reauthentifier(s, {} as never);
    expect(vus).toEqual(['lien:jeton-1', 'connexion:jeton-2', 'reauth:jeton-3']);
  });
});

// --- comptes.google() sur un faux SDK ---

interface FauxUtilisateur {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
  providerData: { providerId: string }[];
  metadata: { creationTime: string; lastSignInTime: string };
  getIdToken: () => Promise<string>;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  reload: () => Promise<void>;
}

const MAINTENANT = 'Tue, 10 Nov 2026 14:00:00 GMT';

/** `cree` : la date de création du compte (par défaut, celle de sa dernière connexion : un compte que la fenêtre vient de créer). */
function utilisateur(uid: string, o: { email?: string | null; anonyme?: boolean; jeton?: () => Promise<string>; cree?: string } = {}): FauxUtilisateur {
  const email = o.email === undefined ? `${uid}@gmail.com` : o.email;
  return {
    uid,
    email,
    isAnonymous: !!o.anonyme,
    emailVerified: !o.anonyme,
    providerData: o.anonyme ? [] : [{ providerId: 'google.com' }],
    metadata: { creationTime: o.cree ?? MAINTENANT, lastSignInTime: MAINTENANT },
    getIdToken: o.jeton ?? (async () => 'jeton'),
    getIdTokenResult: async () => ({ claims: { email_verified: true, firebase: { identities: o.anonyme ? {} : { 'google.com': ['1'] }, sign_in_provider: 'google.com' } } }),
    reload: async () => undefined,
  };
}

/** Un faux SDK et un faux Google : `fenetre` dit ce que donne la fenêtre (compte, neuf ou non, ou une erreur). */
function monter(o: { anonyme?: FauxUtilisateur; session?: Session; reponses?: number; natif?: boolean; jetonGoogle?: () => Promise<string>; google?: Google | null } = {}) {
  const a = { currentUser: (o.anonyme ?? null) as FauxUtilisateur | null };
  const journal: string[] = [];
  const session = depotSessionMemoire(o.session ?? null);
  const pendant: (Session | null)[] = [];
  const auth = {
    onAuthStateChanged: () => () => undefined,
    signOut: vi.fn(async () => {
      a.currentUser = null;
    }),
    deleteUser: vi.fn(async (u: FauxUtilisateur) => {
      journal.push(`supprime:${u.uid}`);
      a.currentUser = null;
    }),
    signInWithCredential: vi.fn(async (_a: unknown, c: { compte: FauxUtilisateur }) => {
      a.currentUser = c.compte;
      return { user: c.compte, neuf: false };
    }),
    getAdditionalUserInfo: (c: { neuf?: boolean }) => ({ isNewUser: !!c.neuf }),
  };
  const fenetre: { connecter: () => Promise<{ user: FauxUtilisateur; neuf: boolean }>; lier: (u: FauxUtilisateur) => Promise<{ user: FauxUtilisateur }>; credential: unknown } = {
    connecter: async () => ({ user: utilisateur('g1'), neuf: true }),
    lier: async (u) => {
      u.isAnonymous = false;
      u.providerData = [{ providerId: 'google.com' }];
      u.email = 'lie@gmail.com';
      return { user: u };
    },
    credential: null,
  };
  const google: Google = {
    connecter: vi.fn(async () => {
      pendant.push(await session.lire());
      const c = await fenetre.connecter();
      a.currentUser = c.user;
      return c as never;
    }),
    lier: vi.fn(async (_s, u) => {
      pendant.push(await session.lire());
      return (await fenetre.lier(u as never)) as never;
    }),
    reauthentifier: vi.fn(async () => undefined),
    credentialDe: vi.fn(() => fenetre.credential as never),
  };
  const appareil: AppareilComptes = {
    reponsesHorsCompte: async () => o.reponses ?? 0,
    nonEnvoyees: async () => 0,
    envoyerTout: async () => ({ nonEnvoyees: 0, refusees: 0 }),
    effacer: async () => undefined,
  };
  const c = creerComptes({
    session,
    service: async () => ({ m: { auth, fs: {} }, db: {}, a }) as never,
    stockage: () => null,
    coupee: () => true,
    appareil,
    version: 'v1',
    republier: async () => undefined,
    natif: () => o.natif ?? false,
    ...(o.jetonGoogle ? { jetonGoogle: o.jetonGoogle } : {}),
    google: o.google === undefined ? google : o.google,
  });
  return { a, auth, c, google, fenetre, session, pendant, journal };
}

describe('comptes.google() : lien, création, compte existant (faux SDK)', () => {
  it('sans invité, un compte neuf : pas de question ; `connexion` posé pendant la fenêtre, levé après', async () => {
    const m = monter({ reponses: 4 });
    const choisir = vi.fn(async (): Promise<ChoixFusion> => 'ajouter');
    const r = await m.c.google(choisir);
    expect(r).toMatchObject({ adresse: 'g1@gmail.com', fusion: 'sans_question', nouveau: true });
    expect(choisir).not.toHaveBeenCalled();
    expect(m.pendant[0]!.connexion).toEqual(expect.any(Number));
    expect(await m.session.lire()).toMatchObject({ uid: 'g1', fournisseurs: ['google.com'], connexion: null, profil_a_ecrire: true });
  });

  it('un invité anonyme : lié (même uid), sans `connexion` pendant la fenêtre (rien à demander)', async () => {
    const anonyme = utilisateur('anon', { anonyme: true, email: null });
    const m = monter({ anonyme, reponses: 4 });
    const r = await m.c.google(async () => 'annuler');
    expect(m.google.lier).toHaveBeenCalledOnce();
    expect(m.google.connecter).not.toHaveBeenCalled();
    expect(r).toMatchObject({ adresse: 'lie@gmail.com', fusion: 'sans_question', nouveau: true });
    expect(m.pendant[0]?.connexion ?? null).toBeNull();
    expect(await m.session.lire()).toMatchObject({ uid: 'anon', connexion: null });
  });

  it('compte Google existant au lien : connexion par le credential de l’erreur, la question, « Annuler » le lâche sans le supprimer', async () => {
    const anonyme = utilisateur('anon', { anonyme: true, email: null });
    const m = monter({ anonyme, reponses: 4 });
    const existant = utilisateur('g-ancien');
    m.fenetre.lier = async () => {
      throw err('auth/credential-already-in-use');
    };
    m.fenetre.credential = { compte: existant };
    let vu: { q: QuestionFusion; session: Session | null } | null = null;
    const e = await m.c
      .google(async (q) => {
        vu = { q, session: await m.session.lire() };
        return 'annuler';
      })
      .catch((x: unknown) => x);
    expect((e as { code?: string }).code).toBe('terramemo/connexion-annulee');
    expect(vu!.q).toEqual({ sorte: 'appareil', reponses: 4, records: 0, seances: 0 });
    // Pendant la question : la session ne connaît pas le compte, mais note la question.
    expect(vu!.session).toMatchObject({ uid: null, connexion: expect.any(Number) });
    expect(m.auth.signInWithCredential).toHaveBeenCalledWith(m.a, { compte: existant });
    expect(m.auth.deleteUser).not.toHaveBeenCalled();
    expect(m.auth.signOut).toHaveBeenCalled();
    expect(await m.session.lire()).toMatchObject({ uid: null, connexion: null });
  });

  it('un compte neuf quitté par « Annuler » (séances d’une session perdue d’un autre compte) : supprimé, rien ne reste', async () => {
    const m = monter({ reponses: 4, session: { ...sessionVide('v1'), uid: 'x', fournisseurs: ['password'], adresse: 'x@exemple.fr' } });
    const e = await m.c.google(async () => 'annuler').catch((x: unknown) => x);
    expect((e as { code?: string }).code).toBe('terramemo/connexion-annulee');
    expect(m.journal).toEqual(['supprime:g1']);
    expect(await m.session.lire()).toMatchObject({ uid: 'x', connexion: null });
    expect((await m.c.etat()).etat).toBe('perdue');
  });

  it('l’invité supprimé par Firebase, vu à son jeton avant la fenêtre : oublié, Google crée le compte', async () => {
    const anonyme = utilisateur('anon', { anonyme: true, email: null, jeton: async () => Promise.reject(err('auth/user-token-expired')) });
    const m = monter({ anonyme });
    const r = await m.c.google();
    expect(m.google.lier).not.toHaveBeenCalled();
    expect(m.google.connecter).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ nouveau: true });
    expect(m.a.currentUser?.uid).toBe('g1');
  });

  it('l’invité supprimé pendant le lien (jeton encore valable) : oublié, « touche encore » (la fenêtre ne se rouvre pas seule)', async () => {
    const anonyme = utilisateur('anon', { anonyme: true, email: null });
    const m = monter({ anonyme });
    m.fenetre.lier = async () => {
      throw err('auth/user-not-found');
    };
    await expect(m.c.google()).rejects.toMatchObject({ code: 'terramemo/google-reessayer' });
    expect(m.a.currentUser).toBeNull();
    expect(m.google.connecter).not.toHaveBeenCalled();
  });

  it('un lien refusé sans credential à reprendre : « touche encore », rien de pris', async () => {
    const anonyme = utilisateur('anon', { anonyme: true, email: null });
    const m = monter({ anonyme });
    m.fenetre.lier = async () => {
      throw err('auth/email-already-in-use');
    };
    await expect(m.c.google()).rejects.toMatchObject({ code: 'terramemo/google-reessayer' });
    expect(m.auth.signInWithCredential).not.toHaveBeenCalled();
    // Sans question possible (invité sans session), rien n'a été écrit dans la session.
    expect(await m.session.lire()).toBeNull();
  });

  it('fenêtre fermée : l’erreur remonte telle quelle (silencieuse à l’écran), la session intacte', async () => {
    const m = monter();
    m.fenetre.connecter = async () => {
      throw err('auth/popup-closed-by-user');
    };
    await expect(m.c.google()).rejects.toMatchObject({ code: 'auth/popup-closed-by-user' });
    expect(await m.session.lire()).toMatchObject({ uid: null, connexion: null });
    expect(m.c.rapport().erreurs.at(-1)?.code).toBe('auth/popup-closed-by-user');
  });

  it('session perdue d’un compte supprimé ailleurs : Google crée un compte neuf à son adresse, supprimé aussitôt, « n’existe plus », rien de repris', async () => {
    const anonyme = utilisateur('anon', { anonyme: true, email: null });
    const m = monter({ anonyme, reponses: 4, session: { ...sessionVide('v1'), uid: 'ancien', fournisseurs: ['google.com'], adresse: 'G1@gmail.com' } });
    const choisir = vi.fn(async (): Promise<ChoixFusion> => 'ajouter');
    await expect(m.c.google(choisir)).rejects.toMatchObject({ code: 'terramemo/compte-parti', customData: { email: 'G1@gmail.com' } });
    // L'invité des scores n'est pas lié : la fenêtre se connecte, et son compte neuf ne garde rien.
    expect(m.google.lier).not.toHaveBeenCalled();
    expect(m.google.connecter).toHaveBeenCalledWith(expect.anything(), 'G1@gmail.com');
    expect(m.journal).toEqual(['supprime:g1']);
    expect(choisir).not.toHaveBeenCalled();
    expect(await m.session.lire()).toMatchObject({ uid: 'ancien', connexion: null, profil_a_ecrire: false });
    expect((await m.c.etat()).etat).toBe('perdue');
  });

  it('session perdue, un autre compte Google (autre adresse) que la fenêtre crée : la question des séances, comme creer()', async () => {
    const m = monter({ reponses: 4, session: { ...sessionVide('v1'), uid: 'ancien', fournisseurs: ['google.com'], adresse: 'ana@gmail.com' } });
    let q: QuestionFusion | null = null;
    const r = await m.c.google(async (x) => ((q = x), 'ajouter'));
    expect(q).toMatchObject({ reponses: 4 });
    expect(r).toMatchObject({ adresse: 'g1@gmail.com', nouveau: true, fusion: 'ajoute' });
    expect(m.journal).toEqual([]);
  });

  it('isNewUser sans création récente (Google qui prendrait la place d’un compte existant, S5) : pas neuf, « Annuler » le lâche sans le supprimer', async () => {
    const m = monter({ reponses: 4, session: { ...sessionVide('v1'), uid: 'x', fournisseurs: ['password'], adresse: 'x@exemple.fr' } });
    m.fenetre.connecter = async () => ({ user: utilisateur('g-existant', { cree: 'Mon, 02 Nov 2026 09:00:00 GMT' }), neuf: true });
    let q: QuestionFusion | null = null;
    const e = await m.c.google(async (x) => ((q = x), 'annuler')).catch((z: unknown) => z);
    expect((e as { code?: string }).code).toBe('terramemo/connexion-annulee');
    expect(q).not.toBeNull();
    expect(m.auth.deleteUser).not.toHaveBeenCalled();
    expect(m.auth.signOut).toHaveBeenCalled();
    expect(m.a.currentUser).toBeNull();
  });

  it('un compte déjà connecté sur l’appareil : refusé', async () => {
    const m = monter();
    await m.c.google();
    await expect(m.c.google()).rejects.toMatchObject({ code: 'terramemo/deja-connecte' });
  });
});

describe('Google se propose-t-il ? (googleOffert)', () => {
  it('sur le site : oui (la fenêtre) ; dans l’APK : seulement avec le plugin du lot 7', async () => {
    expect(monter({ google: undefined }).c.googleOffert()).toBe(true);
    const sansPlugin = creerComptes({ session: depotSessionMemoire(), service: async () => ({}) as never, natif: () => true });
    expect(sansPlugin.googleOffert()).toBe(false);
    await expect(sansPlugin.google()).rejects.toMatchObject({ code: 'terramemo/google-apk-bientot' });
    const avecPlugin = creerComptes({ session: depotSessionMemoire(), service: async () => ({}) as never, natif: () => true, jetonGoogle: async () => 'id' });
    expect(avecPlugin.googleOffert()).toBe(true);
    expect(creerComptes({ session: depotSessionMemoire(), service: async () => ({}) as never, natif: () => false }).googleOffert()).toBe(true);
    expect(monter({ google: null }).c.googleOffert()).toBe(false);
  });
});
