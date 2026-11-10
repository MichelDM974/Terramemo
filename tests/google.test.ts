// Google du J1b, lot 6, sur l'émulateur Auth (`npm run test:comptes`) : le
// vrai SDK et le vrai src/sync/comptes.ts. La fenêtre de Google ne s'ouvre pas
// dans node : Google passe par googleParJeton (src/sync/google.ts), la voie de
// l'APK au lot 7, avec le faux idToken que l'émulateur accepte (S9 : les
// claims en JSON strict, `{"sub":…,"email":…,"email_verified":…}`, donnés à
// GoogleAuthProvider.credential). Les cas : lien d'un invité (uid égal,
// identité google.com, S16) ; compte neuf, puis retrouvé ; compte existant au
// lien (credential-already-in-use) et sa question D22 ; même adresse qu'un
// compte à mot de passe (S5, un compte par adresse) ; pas de mot de passe
// ajouté à un compte Google (D19). La suppression d'un compte Google (et sa
// réauthentification) : tests/suppression.test.ts ; deux appareils :
// tests/synchro-emulateurs.test.ts. Sauté sans émulateur (npm test).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppareilComptes, ChoixFusion, QuestionFusion } from '../src/sync/comptes';

const hote = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJET = 'demo-terramemo';
const AUTH = `http://${hote}`;

/** L'API d'administration de l'émulateur (« Bearer owner »). */
async function admin(chemin: string, corps: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
  return (await r.json()) as Record<string, unknown>;
}

interface CompteAuth {
  localId: string;
  email?: string;
  emailVerified?: boolean;
  passwordHash?: string;
  providerUserInfo?: { providerId: string }[];
}

/** Le compte dans Auth (null s'il n'y est pas). */
async function dansAuth(uid: string): Promise<CompteAuth | null> {
  const r = (await admin('accounts:lookup', { localId: [uid] })) as { users?: CompteAuth[] };
  return r.users?.[0] ?? null;
}
const fournisseursAuth = (c: CompteAuth | null) => (c?.providerUserInfo ?? []).map((p) => p.providerId).sort();

describe.skipIf(!hote)('Google (émulateur Auth, faux idToken)', () => {
  let C: typeof import('../src/sync/comptes');
  let F: typeof import('../src/sync/firebase');
  let S: typeof import('../src/sync/session');
  let E: typeof import('../src/sync/erreurs');
  let G: typeof import('../src/sync/google');
  let A: typeof import('firebase/auth');
  let n = 0;
  /** Le compte Google que la « fenêtre » rend : ses claims, changés par chaque test. */
  let choisi: { sub: string; email: string; email_verified: boolean };
  const nouveauGoogle = (email = `google${++n}@gmail.com`, verifie = true) => (choisi = { sub: `sub-${++n}`, email, email_verified: verifie });
  /** Les progrès de l'appareil, tels que la question de fusion les voit. */
  let reponses = 0;
  let nonEnvoyees = 0;

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '?emulateurs' });
    F = await import('../src/sync/firebase');
    C = await import('../src/sync/comptes');
    S = await import('../src/sync/session');
    E = await import('../src/sync/erreurs');
    G = await import('../src/sync/google');
    A = await import('firebase/auth');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  let session: import('../src/sync/session').DepotSession;
  let comptes: import('../src/sync/comptes').Comptes;
  const appareil: AppareilComptes = {
    reponsesHorsCompte: async () => reponses,
    nonEnvoyees: async () => nonEnvoyees,
    envoyerTout: async () => ({ nonEnvoyees: 0, refusees: 0 }),
    effacer: async () => {
      reponses = 0;
    },
  };
  /** Les comptes d'une page : synchro coupée (le profil a ses tests), Google par le faux idToken de `choisi`. */
  const page = (s: import('../src/sync/session').DepotSession) =>
    C.creerComptes({ session: s, version: 'essai', coupee: () => true, appareil, google: G.googleParJeton(async () => JSON.stringify(choisi)) });

  beforeEach(async () => {
    const s = await F.charger();
    await A.signOut(s.a);
    await fetch(`${AUTH}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
    reponses = 0;
    nonEnvoyees = 0;
    nouveauGoogle();
    session = S.depotSessionMemoire();
    comptes = page(session);
  });

  async function texte(p: Promise<unknown>): Promise<string | null> {
    try {
      await p;
    } catch (e) {
      return E.traduire(e).texte;
    }
    throw new Error('aucune erreur');
  }

  it('lie l’invité anonyme : le même uid, l’identité google.com dans le jeton (S16), un compte neuf sans question', async () => {
    const s = await F.charger();
    const avant = await F.compte(s);
    reponses = 7;
    const choisir = vi.fn(async (): Promise<ChoixFusion> => 'annuler');
    const r = await comptes.google(choisir);
    expect(r).toMatchObject({ adresse: choisi.email, fusion: 'sans_question', nouveau: true });
    expect(choisir).not.toHaveBeenCalled();
    expect(s.a.currentUser?.uid).toBe(avant);
    expect(s.a.currentUser?.isAnonymous).toBe(false);
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid: avant, adresse: choisi.email, verifiee: true, fournisseurs: ['google.com'] });
    expect(await session.lire()).toMatchObject({ uid: avant, fournisseurs: ['google.com'], adresse: choisi.email, connexion: null, profil_a_ecrire: true });
    const j = comptes.rapport().jeton!;
    expect(Object.keys(j.identities)).toEqual(expect.arrayContaining(['google.com', 'email']));
    // Adresse vérifiée par Google : la condition des règles d'essai (email_verified).
    expect((await s.a.currentUser!.getIdTokenResult()).claims.email_verified).toBe(true);
    console.info(`S16 (émulateur) : lien Google d'un anonyme, sign_in_provider = ${j.sign_in_provider}, identities = ${JSON.stringify(j.identities)}`);
  });

  it('sans invité : un compte neuf ; déconnecté puis revenu, le même compte, pas neuf, sans question s’il n’y a rien', async () => {
    const r = await comptes.google();
    expect(r.nouveau).toBe(true);
    const { uid } = (await comptes.etat()) as { uid: string };
    expect(await comptes.deconnecter({ quandMeme: true })).toEqual({ fait: true });
    const r2 = await comptes.google(async () => 'annuler');
    expect(r2).toMatchObject({ nouveau: false, fusion: 'sans_question' });
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid });
  });

  it('compte Google existant au lien (credential-already-in-use) : connexion, la question D22, « Ajouter » ; l’invité laissé à Firebase', async () => {
    await comptes.google();
    const { uid } = (await comptes.etat()) as { uid: string };
    await comptes.deconnecter({ quandMeme: true });
    // L'appareil (ou un autre) joue en invité, publie un score (anonyme), puis « Continuer avec Google ».
    const s = await F.charger();
    const anonyme = await F.compte(s);
    reponses = 4;
    let q: QuestionFusion | null = null;
    const r = await comptes.google(async (x) => ((q = x), 'ajouter'));
    expect(q).toEqual({ sorte: 'appareil', reponses: 4, records: 0, seances: 0 });
    expect(r).toMatchObject({ adresse: choisi.email, fusion: 'ajoute', reponses: 4, nouveau: false });
    expect(s.a.currentUser?.uid).toBe(uid);
    expect(await session.lire()).toMatchObject({ uid, connexion: null });
    expect(comptes.rapport().erreurs.map((x) => x.code)).toContain('auth/credential-already-in-use');
    // L'anonyme reste dans Auth, sans rien (Firebase le supprime 30 jours après sa création).
    expect(await dansAuth(anonyme)).not.toBeNull();
    expect(anonyme).not.toBe(uid);
  });

  it('« Annuler » à la question : rien de pris, le compte existant intact ; « Ne pas les ajouter » : l’appareil effacé', async () => {
    await comptes.google();
    const { uid } = (await comptes.etat()) as { uid: string };
    await comptes.deconnecter({ quandMeme: true });
    reponses = 2;
    expect(await texte(comptes.google(async () => 'annuler'))).toBeNull();
    expect(await comptes.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect(await session.lire()).toMatchObject({ uid: null, connexion: null });
    expect(await dansAuth(uid)).not.toBeNull();
    const r = await comptes.google(async () => 'effacer');
    expect(r).toMatchObject({ fusion: 'efface', reponses: 0 });
    expect(reponses).toBe(0);
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid });
  });

  it('un compte neuf quitté par « Annuler » (séances d’une session perdue d’un autre compte) : supprimé de Auth, la session perdue reste', async () => {
    await session.ecrire({ ...S.sessionVide('essai'), uid: 'autre-compte', fournisseurs: ['password'], adresse: 'x@exemple.fr' });
    reponses = 5;
    nonEnvoyees = 2;
    let q: QuestionFusion | null = null;
    expect(await texte(comptes.google(async (x) => ((q = x), 'annuler')))).toBeNull();
    expect(q).toMatchObject({ sorte: 'autre_compte', seances: 2 });
    // Le compte que la fenêtre a créé n'est plus dans Auth : la même adresse en crée un neuf.
    const r = (await admin('accounts:query', { returnUserInfo: true })) as { userInfo?: CompteAuth[] };
    expect((r.userInfo ?? []).filter((u) => u.email === choisi.email)).toEqual([]);
    expect(await comptes.etat()).toMatchObject({ etat: 'perdue', uid: 'autre-compte' });
  });

  describe('même adresse qu’un compte à mot de passe (un compte par adresse, § 2.3, S5)', () => {
    /** Un compte à mot de passe à l'adresse `a`, déconnecté ; vérifiée ou non. */
    async function compteMotDePasse(a: string, verifiee: boolean): Promise<string> {
      await comptes.creer(a, 'motdepasse');
      const { uid } = (await comptes.etat()) as { uid: string };
      if (verifiee) await admin('accounts:update', { localId: uid, emailVerified: true });
      await comptes.deconnecter({ quandMeme: true });
      return uid;
    }

    it('adresse non vérifiée, Google de confiance : Google l’emporte, même uid, le mot de passe retiré', async () => {
      nouveauGoogle('gael@gmail.com');
      const uid = await compteMotDePasse('gael@gmail.com', false);
      const s = await F.charger();
      await F.compte(s); // un invité, qui tente le lien
      reponses = 4; // des progrès : la question D22, qui dit le mot de passe retiré avant le choix
      let posee: import('../src/sync/comptes').QuestionFusion | null = null;
      const r = await comptes.google(async (q) => ((posee = q), 'ajouter'));
      expect(r).toMatchObject({ adresse: 'gael@gmail.com', nouveau: false, mdpRetire: true });
      expect(posee).toMatchObject({ sorte: 'appareil', mdpRetire: true });
      expect(comptes.rapport().erreurs.map((x) => x.code)).toContain('auth/email-already-in-use');
      expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid, fournisseurs: ['google.com'], verifiee: true });
      const c = await dansAuth(uid);
      expect(fournisseursAuth(c)).toEqual(['google.com']);
      expect(c?.passwordHash).toBeUndefined();
      // Le mot de passe ne connecte plus.
      await comptes.deconnecter({ quandMeme: true });
      expect(await texte(comptes.connecter('gael@gmail.com', 'motdepasse'))).toBe('Adresse ou mot de passe incorrect');
    });

    it('Google l’emporte depuis un autre appareil : la session du premier suit les fournisseurs, et sa session perdue propose Google', async () => {
      nouveauGoogle('gael@gmail.com');
      await comptes.creer('gael@gmail.com', 'motdepasse');
      const { uid } = (await comptes.etat()) as { uid: string };
      expect(await session.lire()).toMatchObject({ uid, fournisseurs: ['password'] });
      // L'autre appareil (une autre session, le même Auth dans node) : « Continuer avec Google », même adresse.
      const autre = page(S.depotSessionMemoire());
      // Sans invité ni session, la fenêtre seule ne dit pas que le mot de passe est parti (pas d'avis).
      expect(await autre.google()).toMatchObject({ nouveau: false, mdpRetire: false });
      // Le premier relit son état : le compte n'a plus de mot de passe, la session le sait.
      expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid, fournisseurs: ['google.com'] });
      expect(await session.lire()).toMatchObject({ uid, fournisseurs: ['google.com'], adresse: 'gael@gmail.com' });
      await new Promise((r) => setTimeout(r, 1100));
      await admin('accounts:update', { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
      expect(await comptes.etat()).toEqual({ etat: 'perdue', uid, adresse: 'gael@gmail.com', fournisseurs: ['google.com'] });
    });

    it('session perdue d’un compte à mot de passe, « Se reconnecter avec Google » : le même compte, sans question, le mot de passe retiré dit', async () => {
      nouveauGoogle('noe@gmail.com');
      await comptes.creer('noe@gmail.com', 'motdepasse');
      const { uid } = (await comptes.etat()) as { uid: string };
      await new Promise((r) => setTimeout(r, 1100));
      await admin('accounts:update', { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
      expect(await comptes.etat()).toMatchObject({ etat: 'perdue', uid, fournisseurs: ['password'] });
      reponses = 3;
      const choisir = vi.fn(async () => 'ajouter' as const);
      expect(await comptes.google(choisir)).toMatchObject({ nouveau: false, mdpRetire: true, fusion: 'sans_question' });
      expect(choisir).not.toHaveBeenCalled();
      expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid, fournisseurs: ['google.com'] });
    });

    it('adresse vérifiée : Google s’ajoute au compte, même uid, le mot de passe gardé', async () => {
      nouveauGoogle('lia@gmail.com');
      const uid = await compteMotDePasse('lia@gmail.com', true);
      const r = await comptes.google();
      expect(r).toMatchObject({ nouveau: false, mdpRetire: false });
      expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid, fournisseurs: ['password', 'google.com'] });
      expect(fournisseursAuth(await dansAuth(uid))).toEqual(['google.com', 'password']);
      await comptes.deconnecter({ quandMeme: true });
      expect(await comptes.connecter('lia@gmail.com', 'motdepasse')).toMatchObject({ adresse: 'lia@gmail.com' });
    });

    it('Google pas de confiance pour l’adresse : « connecte-toi avec ton adresse », l’adresse dans l’erreur, rien de pris', async () => {
      nouveauGoogle('ana@yahoo.fr', false);
      const uid = await compteMotDePasse('ana@yahoo.fr', false);
      const s = await F.charger();
      const anonyme = await F.compte(s);
      const e = await comptes.google().catch((x: unknown) => x);
      expect(E.codeErreur(e)).toBe('auth/account-exists-with-different-credential');
      expect(E.traduire(e).texte).toBe('Ce compte se connecte par mot de passe : connecte-toi avec ton adresse');
      expect(E.adresseErreur(e)).toBe('ana@yahoo.fr');
      // L'invité de l'appareil reste, la session n'a rien pris.
      expect(s.a.currentUser?.uid).toBe(anonyme);
      expect(await session.lire()).toMatchObject({ uid: null, connexion: null });
      expect(fournisseursAuth(await dansAuth(uid))).toEqual(['password']);
      // Sans invité, pareil.
      await A.signOut(s.a);
      expect(E.codeErreur(await comptes.google().catch((x: unknown) => x))).toBe('auth/account-exists-with-different-credential');
    });
  });

  it('pas de mot de passe ajouté à un compte Google (D19) : ni changé, ni créé à son adresse', async () => {
    await comptes.google();
    const { uid } = (await comptes.etat()) as { uid: string };
    expect(await texte(comptes.changerMotDePasse('', 'nouveaumdp'))).toBe('Ce compte se connecte avec Google, sans mot de passe');
    await comptes.deconnecter({ quandMeme: true });
    expect(await texte(comptes.creer(choisi.email, 'motdepasse'))).toBe('Un compte existe déjà avec cette adresse : connecte-toi');
    expect(fournisseursAuth(await dansAuth(uid))).toEqual(['google.com']);
  });

  it('compte Google supprimé ailleurs, session perdue ici : « Se reconnecter avec Google » ne recrée pas de compte à son adresse (« n’existe plus »)', async () => {
    await comptes.google();
    const { uid } = (await comptes.etat()) as { uid: string };
    await admin('accounts:delete', { localId: uid });
    expect(await comptes.etat()).toEqual({ etat: 'perdue', uid, adresse: choisi.email, fournisseurs: ['google.com'] });
    reponses = 3;
    const choisir = vi.fn(async (): Promise<ChoixFusion> => 'ajouter');
    const e = await comptes.google(choisir).catch((x: unknown) => x);
    expect(E.codeErreur(e)).toBe('terramemo/compte-parti');
    expect(E.traduire(e).texte).toBe(`Le compte ${choisi.email} n'existe plus (supprimé ?) : continue sans compte, ou crée-en un.`);
    expect(choisir).not.toHaveBeenCalled();
    // Le compte que la fenêtre a créé n'est plus dans Auth, et la session perdue reste (l'appareil n'a rien envoyé).
    const r = (await admin('accounts:query', { returnUserInfo: true })) as { userInfo?: CompteAuth[] };
    expect((r.userInfo ?? []).filter((u) => u.email === choisi.email)).toEqual([]);
    expect(await comptes.etat()).toMatchObject({ etat: 'perdue', uid });
    expect(reponses).toBe(3);
  });

  it('session perdue d’un compte Google (compte désactivé ailleurs), puis reconnexion par Google au même compte, sans question', async () => {
    await comptes.google();
    const { uid } = (await comptes.etat()) as { uid: string };
    // Jetons révoqués (validSince), comme un compte désactivé puis réactivé, ou une révocation par l'outil du propriétaire.
    await new Promise((r) => setTimeout(r, 1100));
    await admin('accounts:update', { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
    expect(await comptes.etat()).toEqual({ etat: 'perdue', uid, adresse: choisi.email, fournisseurs: ['google.com'] });
    reponses = 3;
    const choisir = vi.fn(async (): Promise<ChoixFusion> => 'annuler');
    expect(await comptes.google(choisir)).toMatchObject({ nouveau: false, fusion: 'sans_question' });
    expect(choisir).not.toHaveBeenCalled();
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid });
  });
});
