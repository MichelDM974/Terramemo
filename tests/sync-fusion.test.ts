// Question de fusion (D22), déconnexion reprenable (D24 a), effacement de
// l'appareil (J1b, lot 4 ; étude § 2.3, § 2.5, § 3.4), sur un faux SDK
// minimal : ce que l'émulateur ne sait pas provoquer (appli tuée pendant la
// question ou entre le drapeau et le signOut, effacement qui échoue). Le
// vrai SDK et deux appareils : tests/synchro-emulateurs.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { enregistrer, garderPseudoDans, lirePseudoDe, lireRecords, poserAvisPseudo, prendreAvisPseudo } from '../src/epreuve/chrono';
import { creerComptes, QUESTION_MAX, type AppareilComptes, type ChoixFusion, type QuestionFusion } from '../src/sync/comptes';
import { CLES_DU_JOUEUR, effacerJoueurLocal, terminerEffacement } from '../src/sync/effacement';
import { ecrireBasePseudo, lireBasePseudo } from '../src/sync/profil';
import { garderChoix, lireChoix } from '../src/vues/accueil';
import { depotSessionMemoire, sessionVide, type Session } from '../src/sync/session';

class Stockage {
  readonly m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

interface FauxUtilisateur {
  uid: string;
  email: string;
  isAnonymous: boolean;
  emailVerified: boolean;
  providerData: { providerId: string }[];
  getIdToken: () => Promise<string>;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  reload: () => Promise<void>;
}

/** Un faux Auth : un compte par adresse (uid tiré de l'adresse), signIn et signOut. */
function faux() {
  const a = { currentUser: null as FauxUtilisateur | null };
  const utilisateur = (email: string): FauxUtilisateur => ({
    uid: `uid-${email.split('@')[0]}`,
    email,
    isAnonymous: false,
    emailVerified: true,
    providerData: [{ providerId: 'password' }],
    getIdToken: async () => 'jeton',
    getIdTokenResult: async () => ({ claims: { email_verified: true, firebase: { identities: { email: [email] }, sign_in_provider: 'password' } } }),
    reload: async () => undefined,
  });
  const signOut = vi.fn(async () => {
    a.currentUser = null;
  });
  const auth = {
    onAuthStateChanged: () => () => undefined,
    signInWithEmailAndPassword: vi.fn(async (_a: unknown, email: string) => {
      a.currentUser = utilisateur(email);
      return { user: a.currentUser };
    }),
    createUserWithEmailAndPassword: async (_a: unknown, email: string) => {
      a.currentUser = utilisateur(email);
      return { user: a.currentUser };
    },
    sendEmailVerification: async () => undefined,
    signOut,
  };
  return { service: async () => ({ m: { auth, fs: {} }, db: {}, a }) as never, a, signOut, utilisateur };
}

function fauxAppareil(o: { reponses?: number; nonEnvoyees?: number; reste?: { nonEnvoyees: number; refusees: number }; effacer?: () => Promise<void> } = {}) {
  return {
    reponsesHorsCompte: vi.fn(async (_uid: string | null) => o.reponses ?? 0),
    nonEnvoyees: vi.fn(async (_uid: string) => o.nonEnvoyees ?? 0),
    envoyerTout: vi.fn(async (_uid: string) => o.reste ?? { nonEnvoyees: 0, refusees: 0 }),
    effacer: vi.fn(async (_uids: readonly string[]) => o.effacer?.()),
  } satisfies AppareilComptes;
}

function monter(o: { appareil?: ReturnType<typeof fauxAppareil>; session?: Session | null; t?: () => number; coupee?: boolean } = {}) {
  const f = faux();
  const session = depotSessionMemoire(o.session ?? null);
  const stockage = new Stockage();
  const appareil = o.appareil ?? fauxAppareil();
  const jetons: string[] = [];
  // Synchro coupée : le profil ne se lit pas (pas de Firestore dans ce faux SDK).
  const c = creerComptes({ session, service: f.service, stockage: () => stockage, coupee: () => o.coupee ?? true, appareil, version: 'v1', republier: async () => undefined, ...(o.t ? { maintenant: o.t } : {}) });
  c.surJeton((q) => jetons.push(q));
  return { ...f, session, stockage, appareil, c, jetons };
}

describe('question de fusion à la connexion (D22)', () => {
  it('des progrès sur l’appareil : la question avant tout envoi, le compte pas encore dans la session ; « Ajouter »', async () => {
    const m = monter({ appareil: fauxAppareil({ reponses: 5 }) });
    let vue: { q: QuestionFusion; pendant: unknown; session: Session | null } | null = null;
    const r = await m.c.connecter('ana@exemple.fr', 'motdepasse', async (q) => {
      vue = { q, pendant: await m.c.pourSynchro(), session: await m.session.lire() };
      return 'ajouter';
    });
    expect(vue!.q).toEqual({ sorte: 'appareil', reponses: 5, records: 0, seances: 0 });
    // Pendant la question : rien ne part, la session ne connaît pas le compte, mais note la question.
    expect(vue!.pendant).toBeNull();
    expect(vue!.session).toMatchObject({ uid: null });
    expect(vue!.session!.connexion).toEqual(expect.any(Number));
    expect(m.appareil.reponsesHorsCompte).toHaveBeenCalledWith('uid-ana');
    expect(r).toMatchObject({ fusion: 'ajoute', reponses: 5 });
    expect(await m.session.lire()).toMatchObject({ uid: 'uid-ana', connexion: null, marque: null });
    expect(m.jetons).toEqual(['connexion']);
    expect(m.appareil.effacer).not.toHaveBeenCalled();
    expect(await m.c.pourSynchro()).toMatchObject({ uid: 'uid-ana' });
  });

  it('« Annuler » : déconnecté du compte, la session d’avant intacte, rien n’est parti ni effacé', async () => {
    const m = monter({ appareil: fauxAppareil({ reponses: 5 }) });
    const e = await m.c.connecter('ana@exemple.fr', 'motdepasse', async () => 'annuler').catch((x: unknown) => x);
    expect((e as { code?: string }).code).toBe('terramemo/connexion-annulee');
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.a.currentUser).toBeNull();
    expect(await m.session.lire()).toMatchObject({ uid: null, connexion: null });
    expect(m.jetons).toEqual([]);
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
  });

  it('« Ne pas les ajouter » : journal, pseudo et records de l’appareil effacés avant la restauration', async () => {
    const m = monter({ appareil: fauxAppareil({ reponses: 0 }) });
    garderPseudoDans(m.stockage, 'Bob');
    enregistrer(m.stockage, 'chrono:localiser:afrique', { points: 3, justes: 3, questions: 54, temps_ms: 400_000 }, Date.UTC(2026, 10, 2));
    expect(lireRecords(m.stockage).size).toBeGreaterThan(0);
    const choisir = vi.fn(async (_q: QuestionFusion): Promise<ChoixFusion> => 'effacer');
    const r = await m.c.connecter('ana@exemple.fr', 'motdepasse', choisir);
    // Pas de réponse au journal, mais un record : c'est un progrès.
    expect(choisir.mock.calls[0]![0]).toMatchObject({ reponses: 0, records: expect.any(Number) });
    expect(choisir.mock.calls[0]![0].records).toBeGreaterThan(0);
    expect(r.fusion).toBe('efface');
    expect(m.appareil.effacer).toHaveBeenCalledWith(['uid-ana']);
    expect([lirePseudoDe(m.stockage), lireRecords(m.stockage).size]).toEqual([null, 0]);
    expect(m.jetons).toEqual(['connexion']);
  });

  it('pas de question : rien sur l’appareil, ou la session perdue de ce même compte (reprise)', async () => {
    const m = monter();
    const choisir = vi.fn(async (): Promise<ChoixFusion> => 'ajouter');
    expect((await m.c.connecter('ana@exemple.fr', 'motdepasse', choisir)).fusion).toBe('sans_question');
    const p = monter({ appareil: fauxAppareil({ reponses: 9 }), session: { ...sessionVide('v1'), uid: 'uid-ana', adresse: 'ana@exemple.fr', marque: 123 } });
    expect((await p.c.connecter('ana@exemple.fr', 'motdepasse', choisir)).fusion).toBe('sans_question');
    expect(choisir).not.toHaveBeenCalled();
    // Le même compte : sa marque de lecture reste (lecture incrémentale).
    expect(await p.session.lire()).toMatchObject({ uid: 'uid-ana', marque: 123 });
  });

  it('session perdue d’un autre compte avec des séances non envoyées : la question à part, et « Ne pas les ajouter » efface les deux', async () => {
    const appareil = fauxAppareil({ reponses: 7, nonEnvoyees: 2 });
    const m = monter({ appareil, session: { ...sessionVide('v1'), uid: 'uid-bob', adresse: 'bob@exemple.fr', marque: 99 } });
    let pendant: unknown = 'pas appelé';
    const choisir = vi.fn(async (_q: QuestionFusion): Promise<ChoixFusion> => {
      // La session est celle de bob, le compte connecté celui d'ana : rien ne part vers ana.
      pendant = await m.c.pourSynchro();
      return 'effacer';
    });
    await m.c.connecter('ana@exemple.fr', 'motdepasse', choisir);
    expect(pendant).toBeNull();
    expect(choisir.mock.calls[0]![0]).toEqual({ sorte: 'autre_compte', reponses: 7, records: 0, seances: 2 });
    expect(appareil.nonEnvoyees).toHaveBeenCalledWith('uid-bob');
    expect(appareil.effacer).toHaveBeenCalledWith(['uid-bob', 'uid-ana']);
    // Un autre compte : sa marque ne vaut pas (tout sera relu).
    expect(await m.session.lire()).toMatchObject({ uid: 'uid-ana', marque: null });
  });

  it('création depuis la session perdue d’un autre compte : la question avant de rien créer', async () => {
    const m = monter({ appareil: fauxAppareil({ reponses: 3 }), session: { ...sessionVide('v1'), uid: 'uid-bob', adresse: 'bob@exemple.fr' } });
    const e = await m.c.creer('ana@exemple.fr', 'motdepasse', async () => 'annuler').catch((x: unknown) => x);
    expect((e as { code?: string }).code).toBe('terramemo/connexion-annulee');
    expect(m.a.currentUser).toBeNull();
    expect((await m.c.creer('ana@exemple.fr', 'motdepasse', async () => 'ajouter')).fusion).toBe('ajoute');
    // Un invité qui crée un compte : jamais de question (lien, pas copie).
    const g = monter({ appareil: fauxAppareil({ reponses: 3 }) });
    const choisir = vi.fn(async (): Promise<ChoixFusion> => 'annuler');
    expect((await g.c.creer('ana@exemple.fr', 'motdepasse', choisir)).fusion).toBe('sans_question');
    expect(choisir).not.toHaveBeenCalled();
  });

  it('appli tuée pendant la question : une page suivante ne prend pas le compte (déconnecté une fois la question périmée)', async () => {
    let t = 1_000_000;
    const m = monter({ session: { ...sessionVide('v1'), connexion: t }, t: () => t });
    // Firebase a gardé le compte connecté (persistance d'Auth), la session ne l'a jamais pris.
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    // Récente : peut-être la question d'un autre onglet ; le compte n'est pas pris, rien ne part.
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect(m.signOut).not.toHaveBeenCalled();
    expect(await m.c.pourSynchro()).toBeNull();
    expect((await m.session.lire())?.uid).toBeNull();
    t += QUESTION_MAX + 1;
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(await m.session.lire()).toMatchObject({ uid: null, connexion: null });
  });
});

describe('déconnexion reprenable (D24 a)', () => {
  const connecte = (): Session => ({ ...sessionVide('v1'), uid: 'uid-ana', adresse: 'ana@exemple.fr', fournisseurs: ['password'], marque: 5 });

  it('ce qui n’est pas parti est dit, sans rien faire ; « quand même » : signOut, appareil effacé, invité vierge', async () => {
    const appareil = fauxAppareil({ reste: { nonEnvoyees: 2, refusees: 1 } });
    const m = monter({ appareil, session: connecte() });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    garderPseudoDans(m.stockage, 'Ana');
    expect(await m.c.deconnecter()).toEqual({ fait: false, nonEnvoyees: 2, refusees: 1, profil: true });
    expect(appareil.envoyerTout).toHaveBeenCalledWith('uid-ana');
    expect(m.signOut).not.toHaveBeenCalled();
    expect(await m.c.deconnecter({ quandMeme: true })).toEqual({ fait: true });
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(appareil.effacer).toHaveBeenCalledWith(['uid-ana']);
    expect(lirePseudoDe(m.stockage)).toBeNull();
    expect(await m.session.lire()).toMatchObject({ uid: null, deconnexion: null, effacement: null, marque: null, profil_a_ecrire: false });
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
  });

  it('tout est parti : déconnecté sans question', async () => {
    const m = monter({ session: connecte() });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    expect(await m.c.deconnecter()).toEqual({ fait: true });
    expect(m.appareil.effacer).toHaveBeenCalledWith(['uid-ana']);
  });

  it('effacement qui échoue : déconnecté quand même, le drapeau reste pour le démarrage suivant', async () => {
    const appareil = fauxAppareil({ effacer: () => Promise.reject(new Error('base bloquée')) });
    const m = monter({ appareil, session: connecte() });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    const e = await m.c.deconnecter().catch((x: unknown) => x);
    expect((e as { code?: string }).code).toBe('terramemo/effacement-inacheve');
    expect(m.a.currentUser).toBeNull();
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect(await m.session.lire()).toMatchObject({ effacement: 'uid-ana' });
  });

  it('appli tuée entre le drapeau et le signOut : la page suivante finit le signOut', async () => {
    const m = monter({ session: { ...connecte(), deconnexion: 'voulue', effacement: 'uid-ana' } });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(await m.c.pourSynchro()).toBeNull();
  });

  it('session perdue : « Effacer cet appareil » efface journal, état d’envoi, pseudo et records', async () => {
    const appareil = fauxAppareil({ reponses: 4 });
    const m = monter({ appareil, session: connecte() });
    expect(await m.c.etat()).toMatchObject({ etat: 'perdue', uid: 'uid-ana' });
    expect(await m.c.reponsesAppareil()).toBe(4);
    expect(appareil.reponsesHorsCompte).toHaveBeenCalledWith(null);
    garderPseudoDans(m.stockage, 'Ana');
    await m.c.effacerAppareil();
    expect(appareil.effacer).toHaveBeenCalledWith(['uid-ana']);
    expect(lirePseudoDe(m.stockage)).toBeNull();
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
  });

  it('marque de lecture : lue et posée pour le compte de la session seulement', async () => {
    const m = monter({ session: connecte() });
    const mq = m.c.marques();
    expect(await mq.lire('uid-ana')).toBe(5);
    expect(await mq.lire('uid-bob')).toBeNull();
    await mq.poser('uid-ana', 7);
    await mq.poser('uid-bob', 9);
    expect((await m.session.lire())?.marque).toBe(7);
  });
});

describe('relectures du lot 4 : rien ne part sans réponse, rien ne s’efface sans être parti', () => {
  const perdueX = (): Session => ({ ...sessionVide('v1'), uid: 'uid-x', adresse: 'x@exemple.fr', profil_a_ecrire: true });

  it('(C1) un record pendant la question : le profil du compte pas encore pris n’est ni lu ni écrit', async () => {
    // Synchro non coupée : sans la garde, la passe du profil irait au Firestore (absent du faux SDK : « echec »).
    const m = monter({ appareil: fauxAppareil({ reponses: 3 }), session: perdueX(), coupee: false });
    let pendant: unknown = null;
    await m.c.connecter('ana@exemple.fr', 'motdepasse', async () => {
      pendant = await m.c.profilModifie('records');
      return 'annuler';
    }).catch(() => undefined);
    expect(pendant).toMatchObject({ etat: 'sans_compte' });
    expect((await m.session.lire())?.profil_a_ecrire).toBe(true);
  });

  it('(C2) un échec après la connexion (effacement) : le compte est lâché, jamais pris par la réparation', async () => {
    const appareil = fauxAppareil({ reponses: 3, effacer: () => Promise.reject(new Error('base bloquée')) });
    const m = monter({ appareil, session: perdueX() });
    await expect(m.c.connecter('ana@exemple.fr', 'motdepasse', async () => 'effacer')).rejects.toThrow('base bloquée');
    expect(m.a.currentUser).toBeNull();
    expect(await m.c.etat()).toMatchObject({ etat: 'perdue', uid: 'uid-x' });
    expect(await m.c.pourSynchro()).toBeNull();
  });

  it('(C2) « Effacer cet appareil » après une question tuée : le compte resté connecté est lâché', async () => {
    const m = monter({ session: { ...perdueX(), connexion: Date.now() } });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    expect(await m.c.etat()).toMatchObject({ etat: 'perdue', uid: 'uid-x' });
    await m.c.effacerAppareil();
    expect(m.signOut).toHaveBeenCalled();
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
  });

  it('(C3) un effacement resté en route est fini avant de prendre un compte ; s’il échoue encore, pas de connexion', async () => {
    let echouer = true;
    const appareil = fauxAppareil({ effacer: async () => (echouer ? Promise.reject(new Error('base bloquée')) : undefined) });
    const m = monter({ appareil, session: { ...sessionVide('v1'), uid: 'uid-ana', adresse: 'ana@exemple.fr', fournisseurs: ['password'] } });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    await expect(m.c.deconnecter()).rejects.toMatchObject({ code: 'terramemo/effacement-inacheve' });
    expect(await m.c.etat()).toEqual({ etat: 'invite', anonyme: false });
    expect((await m.session.lire())?.effacement).toBe('uid-ana');
    await expect(m.c.connecter('bob@exemple.fr', 'motdepasse')).rejects.toMatchObject({ code: 'terramemo/effacement-inacheve' });
    expect(m.a.currentUser).toBeNull();
    echouer = false;
    await m.c.connecter('bob@exemple.fr', 'motdepasse');
    expect(appareil.effacer).toHaveBeenLastCalledWith(['uid-ana']);
    expect(await m.session.lire()).toMatchObject({ uid: 'uid-bob', effacement: null });
    expect(await m.c.pourSynchro()).toMatchObject({ uid: 'uid-bob' });
  });

  it('(vérif. C1) après une question tuée, une connexion ratée (mot de passe faux) ne laisse pas prendre le compte resté connecté', async () => {
    const m = monter({ appareil: fauxAppareil({ reponses: 3 }), session: { ...perdueX(), connexion: Date.now() - 60_000 } });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    expect(await m.c.etat()).toMatchObject({ etat: 'perdue', uid: 'uid-x' });
    const s = await (m.service as () => Promise<{ m: { auth: { signInWithEmailAndPassword: { mockRejectedValueOnce: (e: unknown) => void } } } }>)();
    s.m.auth.signInWithEmailAndPassword.mockRejectedValueOnce(Object.assign(new Error('faux'), { code: 'auth/wrong-password' }));
    await expect(m.c.connecter('x@exemple.fr', 'mauvais')).rejects.toMatchObject({ code: 'auth/wrong-password' });
    expect(m.a.currentUser).toBeNull();
    expect(await m.c.etat()).toMatchObject({ etat: 'perdue', uid: 'uid-x' });
    expect(await m.c.pourSynchro()).toBeNull();
  });

  it('(vérif. C2) une reconnexion au même compte laissée en route : le marqueur est levé, le profil repart', async () => {
    const m = monter({ session: { ...sessionVide('v1'), uid: 'uid-ana', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connexion: Date.now() - 1000 }, coupee: false });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    expect(await m.c.etat()).toMatchObject({ etat: 'compte', uid: 'uid-ana' });
    expect((await m.session.lire())?.connexion).toBeNull();
    // La passe du profil essaie bien d'écrire (faute de Firestore dans le faux SDK : « echec », pas « sans_compte »).
    expect((await m.c.synchroniserProfil('ecrire')).etat).toBe('echec');
  });

  it('(C4) après une question tuée, « Créer un compte » lâche le compte resté connecté au lieu de refuser', async () => {
    const m = monter({ session: { ...perdueX(), connexion: Date.now() } });
    m.a.currentUser = m.utilisateur('ana@exemple.fr');
    const r = await m.c.creer('neuf@exemple.fr', 'motdepasse', async () => 'ajouter');
    expect(r.adresse).toBe('neuf@exemple.fr');
    expect(m.signOut).toHaveBeenCalled();
    expect(await m.session.lire()).toMatchObject({ uid: 'uid-neuf' });
  });
});

describe('relectures du lot 4 : création de compte depuis une session perdue', () => {
  it('(V2) « Ne pas les ajouter », puis la création échoue (adresse prise) : l’appareil reste intact', async () => {
    const appareil = fauxAppareil({ reponses: 3, nonEnvoyees: 1 });
    const m = monter({ appareil, session: { ...sessionVide('v1'), uid: 'uid-x', adresse: 'x@exemple.fr' } });
    // La création refuse l'adresse.
    const s = await (m.service as () => Promise<{ m: { auth: Record<string, unknown> } }>)();
    s.m.auth.createUserWithEmailAndPassword = async () => Promise.reject(Object.assign(new Error('pris'), { code: 'auth/email-already-in-use' }));
    await expect(m.c.creer('x@exemple.fr', 'motdepasse', async () => 'effacer')).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
    expect(appareil.effacer).not.toHaveBeenCalled();
    expect(await m.session.lire()).toMatchObject({ uid: 'uid-x', connexion: null });
    expect(await m.c.etat()).toMatchObject({ etat: 'perdue', uid: 'uid-x' });
  });

  it('(V2) création réussie après « Ne pas les ajouter » : effacé après la création, puis le compte pris', async () => {
    const appareil = fauxAppareil({ reponses: 3 });
    const m = monter({ appareil, session: { ...sessionVide('v1'), uid: 'uid-x', adresse: 'x@exemple.fr' } });
    const r = await m.c.creer('neuf@exemple.fr', 'motdepasse', async () => 'effacer');
    expect(r.fusion).toBe('efface');
    expect(appareil.effacer).toHaveBeenCalledWith(['uid-x']);
    expect(await m.session.lire()).toMatchObject({ uid: 'uid-neuf', connexion: null });
  });
});

describe('effacement au démarrage, clés du joueur', () => {
  it('terminerEffacement : rien sans drapeau ; avec, journal, état d’envoi, clés du joueur, puis la session levée', async () => {
    const vider = vi.fn(async () => undefined);
    const oublier = vi.fn(async (_uid: string) => undefined);
    const st = new Stockage();
    const rien = depotSessionMemoire({ ...sessionVide('v1'), uid: 'uid-ana' });
    expect(await terminerEffacement({ session: rien, viderJournal: vider, oublier, stockage: st, version: 'v2' })).toBe(false);
    expect(vider).not.toHaveBeenCalled();
    garderPseudoDans(st, 'Ana');
    const s = depotSessionMemoire({ ...sessionVide('v1'), uid: 'uid-ana', deconnexion: 'voulue', effacement: 'uid-ana', marque: 4 });
    expect(await terminerEffacement({ session: s, viderJournal: vider, oublier, stockage: st, version: 'v2' })).toBe(true);
    expect(oublier).toHaveBeenCalledWith('uid-ana');
    expect(lirePseudoDe(st)).toBeNull();
    // La déconnexion voulue reste : les comptes finiront le signOut s'il n'a pas eu lieu.
    expect(await s.lire()).toMatchObject({ uid: null, effacement: null, marque: null, deconnexion: 'voulue', version: 'v2' });
    const casse = depotSessionMemoire({ ...sessionVide('v1'), effacement: 'uid-ana' });
    const messages: string[] = [];
    await expect(terminerEffacement({ session: casse, viderJournal: () => Promise.reject(new Error('non')), oublier, stockage: st, version: 'v2', diffuser: (x) => messages.push(x.type) })).rejects.toThrow('non');
    expect((await casse.lire())?.effacement).toBe('uid-ana');
    // Les autres onglets : gelés, puis repris sur l'échec ; gelés, puis rechargés sur la réussite.
    expect(messages).toEqual(['effacement', 'reprise']);
    messages.length = 0;
    await terminerEffacement({ session: casse, viderJournal: vider, oublier, stockage: st, version: 'v2', diffuser: (x) => messages.push(x.type) });
    expect(messages).toEqual(['effacement', 'efface']);
  });

  it('CLES_DU_JOUEUR : les clés des modules qui les écrivent, et plus rien à relire après l’effacement', () => {
    const source = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const cles = [
      ...source('epreuve/chrono.ts').matchAll(/const CLE_(?:RECORDS|PSEUDO|PSEUDO_REMPLACE) = '([^']+)'/g),
      ...source('sync/profil.ts').matchAll(/const CLE_PSEUDO_COMPTE = '([^']+)'/g),
      ...source('vues/classement.ts').matchAll(/const CLE_ATTENTE = '([^']+)'/g),
      ...source('vues/general.ts').matchAll(/const CLE_VUES = '([^']+)'/g),
      ...source('vues/accueil.ts').matchAll(/const CLE_ACCUEIL = '([^']+)'/g),
    ].map((x) => x[1]);
    expect([...cles].sort()).toEqual([...CLES_DU_JOUEUR].sort());
    const st = new Stockage();
    garderPseudoDans(st, 'Ana');
    ecrireBasePseudo(st, { uid: 'u', pseudo: 'Ana' });
    poserAvisPseudo(st, 'Bob');
    garderChoix(st, 'compte');
    st.setItem('terramemo.appareil', 'garde');
    effacerJoueurLocal(st);
    expect([lirePseudoDe(st), lireBasePseudo(st), prendreAvisPseudo(st), lireChoix(st)]).toEqual([null, null, null, null]);
    expect(st.getItem('terramemo.appareil')).toBe('garde');
  });
});
