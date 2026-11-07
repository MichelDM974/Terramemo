// Comptes e-mail du J1b, lot 1, sur l'émulateur Auth (`npm run test:comptes` :
// firebase emulators:exec pose FIREBASE_AUTH_EMULATOR_HOST). Le vrai SDK, le
// vrai src/sync/comptes.ts : créer, lier un anonyme (uid égal avant et
// après), se connecter, mot de passe oublié, chaque erreur traduite, session
// perdue après un mot de passe changé depuis un second contexte (étude du
// J1b, § 9, lot 1). Sauté sans émulateur (npm test).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, updatePassword, signOut, type Auth } from 'firebase/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hote = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJET = 'demo-terramemo';
const AUTH = `http://${hote}`;

/**
 * Un mot de passe changé ne révoque que les jetons émis avant la seconde du
 * changement (validSince, à la seconde, comme Firebase) : une seconde
 * d'écart, sinon le jeton du premier appareil reste bon.
 */
const seconde = () => new Promise((r) => setTimeout(r, 1100));

/** Les e-mails que l'émulateur aurait envoyés (vérification, réinitialisation). */
async function emails(): Promise<{ email: string; requestType: string }[]> {
  const r = await fetch(`${AUTH}/emulator/v1/projects/${PROJET}/oobCodes`);
  return ((await r.json()) as { oobCodes: { email: string; requestType: string }[] }).oobCodes;
}

async function viderComptes(): Promise<void> {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
}

describe.skipIf(!hote)('comptes e-mail (émulateur Auth)', () => {
  let C: typeof import('../src/sync/comptes');
  let F: typeof import('../src/sync/firebase');
  let S: typeof import('../src/sync/session');
  let E: typeof import('../src/sync/erreurs');
  /** Le second contexte : un autre appareil du même compte. */
  let autre: Auth;
  let n = 0;
  const adresse = () => `essai${++n}@exemple.fr`;

  beforeAll(async () => {
    vi.stubGlobal('location', { search: '?emulateurs' });
    F = await import('../src/sync/firebase');
    C = await import('../src/sync/comptes');
    S = await import('../src/sync/session');
    E = await import('../src/sync/erreurs');
    const app2: FirebaseApp = initializeApp({ apiKey: 'cle-essai', authDomain: 'localhost', projectId: PROJET }, 'second');
    autre = getAuth(app2);
    connectAuthEmulator(autre, AUTH, { disableWarnings: true });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  let session: import('../src/sync/session').DepotSession;
  let comptes: import('../src/sync/comptes').Comptes;
  beforeEach(async () => {
    const s = await F.charger();
    await signOut(s.a);
    await signOut(autre);
    await viderComptes();
    session = S.depotSessionMemoire();
    // Le profil (lot 2) a son propre test, tests/profil.test.ts : ici, synchro coupée.
    comptes = C.creerComptes({ session, version: 'essai', coupee: () => true });
  });

  /** Le texte français d'un rejet. */
  async function texte(p: Promise<unknown>): Promise<string | null> {
    try {
      await p;
    } catch (e) {
      return E.traduire(e).texte;
    }
    throw new Error('aucune erreur');
  }

  it('crée un compte sans invité : un uid, la session gardée, l’e-mail de vérification parti', async () => {
    const a = adresse();
    const r = await comptes.creer(a, 'motdepasse');
    expect(r).toMatchObject({ adresse: a, verification: true });
    const e = await comptes.etat();
    expect(e).toMatchObject({ etat: 'compte', adresse: a, verifiee: false, fournisseurs: ['password'] });
    const s = await session.lire();
    expect(s).toMatchObject({ uid: (e as { uid: string }).uid, fournisseurs: ['password'], adresse: a, deconnexion: null, version: 'essai' });
    expect(await emails()).toContainEqual(expect.objectContaining({ email: a, requestType: 'VERIFY_EMAIL' }));
    // S16 : le jeton rafraîchi porte l'identité e-mail (les règles du lot 2 la liront).
    const j = comptes.rapport().jeton!;
    expect(j.identities.email).toEqual([a]);
    expect(j.sign_in_provider).toBe('password');
  });

  it('lie l’invité anonyme : le même uid avant et après (lien, pas copie)', async () => {
    const s = await F.charger();
    const avant = await F.compte(s);
    expect(s.a.currentUser?.isAnonymous).toBe(true);
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    expect(s.a.currentUser?.uid).toBe(avant);
    expect(s.a.currentUser?.isAnonymous).toBe(false);
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid: avant, adresse: a });
    expect((await session.lire())?.uid).toBe(avant);
    const j = comptes.rapport().jeton!;
    expect(j.identities.email).toEqual([a]);
    console.info(`S16 (émulateur) : sign_in_provider après le lien = ${j.sign_in_provider}`);
  });

  it('se déconnecte (ce qui n’est pas parti d’abord dit, lot 4) puis se reconnecte au même compte', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    const { uid } = (await comptes.etat()) as { uid: string };
    // Le profil n'a pas pu partir (joueurs/ fermé par les règles de ces essais) : la déconnexion le dit (§ 3.4).
    expect(await comptes.deconnecter()).toMatchObject({ fait: false, profil: false });
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid });
    expect(await comptes.deconnecter({ quandMeme: true })).toEqual({ fait: true });
    expect(await comptes.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect((await session.lire())?.uid).toBeNull();
    expect(await comptes.connecter(a, 'motdepasse')).toMatchObject({ adresse: a });
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid });
  });

  it('mot de passe oublié : l’e-mail part, et une adresse inconnue répond pareil', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    await comptes.deconnecter({ quandMeme: true });
    await comptes.oublier(a);
    expect(await emails()).toContainEqual(expect.objectContaining({ email: a, requestType: 'PASSWORD_RESET' }));
    await expect(comptes.oublier('personne@exemple.fr')).resolves.toBeUndefined();
    expect(await texte(comptes.oublier('  '))).toBe('Saisis ton adresse e-mail');
  });

  it('renvoie l’e-mail de vérification', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    const avant = (await emails()).filter((x) => x.email === a).length;
    expect(await comptes.renvoyer()).toEqual({ adresse: a });
    expect((await emails()).filter((x) => x.email === a && x.requestType === 'VERIFY_EMAIL').length).toBe(avant + 1);
  });

  it('chaque erreur atteignable est traduite, jamais le message anglais', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    await comptes.deconnecter({ quandMeme: true });
    expect(await texte(comptes.connecter(a, 'mauvais-mdp'))).toBe('Adresse ou mot de passe incorrect');
    // Le message brut (anglais) va au pilote seulement.
    const brut = comptes.rapport().erreurs.at(-1)!;
    expect(brut.code).toMatch(/^auth\/(invalid-credential|wrong-password)$/);
    expect(brut.message).toMatch(/Firebase/);
    expect(await texte(comptes.connecter('inconnu@exemple.fr', 'motdepasse'))).toBe('Adresse ou mot de passe incorrect');
    expect(await texte(comptes.connecter('pas-une-adresse', 'motdepasse'))).toBe('Adresse e-mail invalide');
    expect(await texte(comptes.connecter(a, ''))).toBe('Saisis ton mot de passe');
    expect(await texte(comptes.creer(a, 'motdepasse'))).toBe('Un compte existe déjà avec cette adresse : connecte-toi');
    expect(await texte(comptes.creer(adresse(), 'court'))).toBe('Mot de passe : 8 caractères au moins');
    expect(await texte(comptes.creer('', 'motdepasse'))).toBe('Saisis ton adresse e-mail');
    await comptes.connecter(a, 'motdepasse');
    expect(await texte(comptes.changerMotDePasse('mauvais-mdp', 'nouveaumdp'))).toBe('Mot de passe actuel incorrect');
    expect(await texte(comptes.changerMotDePasse('motdepasse', 'court'))).toBe('Mot de passe : 8 caractères au moins');
  });

  it('change le mot de passe : l’autre appareil passe en session perdue, sans rien effacer', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    const { uid } = (await comptes.etat()) as { uid: string };
    // Second contexte : le même compte, qui change le mot de passe.
    await signInWithEmailAndPassword(autre, a, 'motdepasse');
    await seconde();
    await updatePassword(autre.currentUser!, 'nouveaumdp');
    const vu = vi.fn();
    comptes.surChangement(vu);
    const e = await comptes.etat();
    expect(e).toEqual({ etat: 'perdue', uid, adresse: a });
    expect(comptes.rapport().erreurs.map((x) => x.code)).toContain('auth/user-token-expired');
    expect((await session.lire())?.uid).toBe(uid);
    // Reconnexion au même compte, avec le nouveau mot de passe : reprise.
    expect(await texte(comptes.connecter(a, 'motdepasse'))).toBe('Adresse ou mot de passe incorrect');
    await comptes.connecter(a, 'nouveaumdp');
    expect(await comptes.etat()).toMatchObject({ etat: 'compte', uid });
    expect(vu).toHaveBeenCalled();
  });

  it('session perdue → continuer sans compte : l’appareil redevient invité', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    await signInWithEmailAndPassword(autre, a, 'motdepasse');
    await seconde();
    await updatePassword(autre.currentUser!, 'nouveaumdp');
    expect((await comptes.etat()).etat).toBe('perdue');
    await comptes.continuerSansCompte();
    expect(await comptes.etat()).toEqual({ etat: 'invite', anonyme: false });
  });

  it('une déconnexion interrompue après le signOut se termine, sans session perdue', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    const s = await F.charger();
    await session.ecrire({ ...(await session.lire())!, deconnexion: 'voulue' });
    await signOut(s.a); // appli fermée ici
    expect(await comptes.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect((await session.lire())?.uid).toBeNull();
  });

  it('un anonyme créé pour publier pendant une session perdue n’y change rien', async () => {
    const a = adresse();
    await comptes.creer(a, 'motdepasse');
    const { uid } = (await comptes.etat()) as { uid: string };
    await signInWithEmailAndPassword(autre, a, 'motdepasse');
    await seconde();
    await updatePassword(autre.currentUser!, 'nouveaumdp');
    expect((await comptes.etat()).etat).toBe('perdue');
    await F.compte(await F.charger()); // une publication de score
    expect(await comptes.etat()).toEqual({ etat: 'perdue', uid, adresse: a });
  });
});
