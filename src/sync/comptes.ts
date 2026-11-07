// Comptes du J1b, lot 1 (docs/etudes/2026-11-07-j1b-conception.md, § 2 à 3) :
// e-mail et mot de passe, lien de l'invité anonyme, session perdue. Chargé à
// la demande avec la vue Compte (morceau à part), jamais au démarrage d'un
// invité (D9 b) ; pour un compte ou une session perdue, au démarrage, après
// le premier affichage de la carte (demarrer()).
//
// Quatre états (§ 2.1) : invité sans uid, invité anonyme (créé par compte()
// pour publier un score), compte (fournisseur password, plus tard
// google.com), session perdue (aucun compte, mais le dernier uid connu dans
// terramemo-synchro, sans déconnexion voulue). Rien n'est envoyé ni lu de
// `joueurs/` ici : profil (lot 2), envoi (lot 3), lecture, union et question
// de fusion (lot 4).
//
// Lien, pas copie (décision « Comptes ») : un anonyme devient un compte par
// linkWithCredential, qui garde son uid ; jamais de signOut avant le lien.
import { charger, type Service } from './firebase';
import { codeErreur } from './erreurs';
import { depotSessionIndexedDb, sessionVide, type DepotSession, type Fournisseur, type Session } from './session';

/** Mot de passe : 8 caractères au moins, sans autre exigence (D17, comme Light). */
export const MDP_MIN = 8;

export type EtatCompte =
  | { etat: 'invite'; anonyme: boolean }
  | { etat: 'compte'; uid: string; adresse: string | null; verifiee: boolean; fournisseurs: Fournisseur[] }
  | { etat: 'perdue'; uid: string; adresse: string | null };

/** Ce que le pilote relève (S16) : claims du dernier jeton rafraîchi, dernières erreurs brutes. */
export interface RapportComptes {
  etat: EtatCompte | null;
  jeton: { uid: string; identities: Record<string, unknown>; sign_in_provider: string | null } | null;
  erreurs: { code: string; message: string; quand: number }[];
}

export interface Comptes {
  /** L'état du compte ; recharge le compte (reload : adresse vérifiée, session révoquée ailleurs). */
  etat(): Promise<EtatCompte>;
  /** Crée un compte e-mail : lie l'invité anonyme s'il y en a un (uid gardé). verification : l'e-mail est parti. */
  creer(adresse: string, mdp: string): Promise<{ adresse: string; verification: boolean }>;
  connecter(adresse: string, mdp: string): Promise<{ adresse: string }>;
  /** Mot de passe oublié : sans dire si l'adresse a un compte (message générique). */
  oublier(adresse: string): Promise<void>;
  /** Renvoie l'e-mail de vérification. */
  renvoyer(): Promise<{ adresse: string }>;
  changerMotDePasse(ancien: string, nouveau: string): Promise<void>;
  /**
   * Lot 1 : déconnexion simple, le journal reste sur l'appareil (rien n'est
   * encore envoyé : l'effacer le perdrait). Le lot 4 la remplace par la
   * déconnexion reprenable du § 3.4 (D24 a).
   */
  deconnecter(): Promise<void>;
  /** Session perdue → invité : l'appareil garde son journal (§ 2.5). */
  continuerSansCompte(): Promise<void>;
  /** Appelé quand l'état peut avoir changé (connexion, session perdue en cours de route). */
  surChangement(f: () => void): () => void;
  /** Démarrage d'un compte ou d'une session perdue : SDK chargé, état surveillé. */
  demarrer(): Promise<EtatCompte>;
  rapport(): RapportComptes;
}

export interface OptionsComptes {
  session?: DepotSession;
  version?: string;
  service?: () => Promise<Service>;
}

/** Une erreur propre à l'appli, traduite comme celles de Firebase (textes compte.erreurs). */
export class ErreurCompte extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ErreurCompte';
  }
}

function fournisseursDe(u: { providerData: readonly { providerId: string }[] }): Fournisseur[] {
  const ids = new Set(u.providerData.map((p) => p.providerId));
  return (['password', 'google.com'] as const).filter((f) => ids.has(f));
}

/** Un compte au sens du J1b : un fournisseur password ou google.com (un anonyme n'en a aucun). */
const estCompte = (u: { isAnonymous: boolean; providerData: readonly { providerId: string }[] } | null) => !!u && !u.isAnonymous && fournisseursDe(u).length > 0;

export function creerComptes(o: OptionsComptes = {}): Comptes {
  const depot = o.session ?? depotSessionIndexedDb();
  const version = o.version ?? '';
  const service = o.service ?? charger;
  const abonnes = new Set<() => void>();
  const rapport: RapportComptes = { etat: null, jeton: null, erreurs: [] };
  let surveille = false;
  /** Repli du § 5.1 : une session que IndexedDB n'a pas pu écrire (quota plein) prime le temps de la page. */
  let sessionPage: Session | null = null;

  const prevenir = () => abonnes.forEach((f) => f());
  const noter = (e: unknown) => {
    rapport.erreurs.push({ code: codeErreur(e), message: e instanceof Error ? e.message : String(e), quand: Date.now() });
    rapport.erreurs.splice(0, Math.max(0, rapport.erreurs.length - 10));
  };
  /** Toute erreur passe par le rapport du pilote (message brut), puis remonte telle quelle. */
  async function suivi<T>(faire: () => Promise<T>): Promise<T> {
    try {
      return await faire();
    } catch (e) {
      noter(e);
      throw e;
    }
  }

  async function lireSession(): Promise<Session> {
    if (sessionPage) return structuredClone(sessionPage);
    try {
      return (await depot.lire()) ?? sessionVide(version);
    } catch {
      return sessionVide(version);
    }
  }
  async function ecrireSession(m: Partial<Session>): Promise<void> {
    const s = { ...(await lireSession()), ...m, version };
    try {
      await depot.ecrire(s);
      sessionPage = null;
    } catch (e) {
      // Écriture refusée (quota plein) : la fiche vit en mémoire le temps de la page (§ 5.1),
      // pour qu'une déconnexion ne se lise pas en session perdue.
      noter(e);
      sessionPage = s;
    }
  }

  /** Le jeton rafraîchi (claims à jour après un lien, S16), relevé pour le pilote. */
  async function rafraichir(u: import('firebase/auth').User): Promise<void> {
    await u.getIdToken(true);
    const r = await u.getIdTokenResult();
    const f = (r.claims.firebase ?? {}) as { identities?: Record<string, unknown>; sign_in_provider?: string };
    rapport.jeton = { uid: u.uid, identities: f.identities ?? {}, sign_in_provider: f.sign_in_provider ?? null };
  }

  /**
   * Après un lien, une création ou une connexion réussis : la session d'abord
   * (l'appli peut être tuée juste après), puis le jeton rafraîchi (§ 2.2 :
   * claims à jour). Un rafraîchissement raté (réseau) ne défait rien : le
   * compte est fait, le SDK rafraîchira plus tard.
   */
  async function connecte(u: import('firebase/auth').User): Promise<void> {
    await ecrireSession({ uid: u.uid, fournisseurs: fournisseursDe(u), adresse: u.email, deconnexion: null });
    try {
      await rafraichir(u);
    } catch (e) {
      noter(e);
    }
  }

  function surveiller(s: Service): void {
    if (surveille) return;
    surveille = true;
    // Un onAuthStateChanged(null) en cours de route : session perdue (jetons révoqués
    // par un mot de passe changé ailleurs) ou déconnexion voulue ; etat() tranche.
    // Vers « aucun compte », l'état est relu tout de suite (rapport du pilote juste, même
    // sans vue Compte ouverte), puis les abonnés sont prévenus.
    s.m.auth.onAuthStateChanged(s.a, (u) => {
      if (u) return prevenir();
      void etat().then(prevenir, (e: unknown) => {
        noter(e);
        prevenir();
      });
    });
  }

  async function etat(): Promise<EtatCompte> {
    const s = await service();
    surveiller(s);
    let u = s.a.currentUser;
    if (estCompte(u)) {
      try {
        // Adresse vérifiée dans un navigateur, ou session révoquée ailleurs (le SDK se déconnecte alors seul).
        await u!.reload();
      } catch (e) {
        noter(e);
      }
      u = s.a.currentUser;
    }
    const ses = await lireSession();
    let e: EtatCompte;
    if (u && estCompte(u)) {
      // Réparation d'une session pas écrite (échec d'IndexedDB). Jamais pendant une déconnexion
      // voulue : un autre onglet peut l'avoir lancée, et ce currentUser n'est pas encore à jour.
      if (ses.uid !== u.uid && !ses.deconnexion && s.a.currentUser === u)
        await ecrireSession({ uid: u.uid, fournisseurs: fournisseursDe(u), adresse: u.email, deconnexion: null });
      e = { etat: 'compte', uid: u.uid, adresse: u.email, verifiee: u.emailVerified, fournisseurs: fournisseursDe(u) };
    } else if (ses.uid && ses.deconnexion === 'voulue') {
      // Déconnexion interrompue après le signOut (appli fermée) : on la termine.
      await ecrireSession({ uid: null, fournisseurs: [], adresse: null, deconnexion: null });
      e = { etat: 'invite', anonyme: !!u?.isAnonymous };
    } else if (ses.uid) {
      // Plus de compte, sans déconnexion voulue : session perdue (§ 2.5). Un anonyme créé
      // depuis pour publier un score n'y change rien.
      e = { etat: 'perdue', uid: ses.uid, adresse: ses.adresse };
    } else {
      e = { etat: 'invite', anonyme: !!u?.isAnonymous };
    }
    rapport.etat = e;
    return e;
  }

  const verifierMdp = (mdp: string) => {
    if (mdp.length < MDP_MIN) throw new ErreurCompte('terramemo/mdp-court');
  };

  return {
    etat: () => suivi(etat),

    creer: (adresse, mdp) =>
      suivi(async () => {
        const a = adresse.trim();
        if (!a) throw new ErreurCompte('auth/missing-email');
        verifierMdp(mdp);
        const s = await service();
        surveiller(s);
        const { auth } = s.m;
        const avant = s.a.currentUser;
        if (estCompte(avant)) throw new ErreurCompte('terramemo/deja-connecte');
        // Lien de l'anonyme : même uid (§ 2.2) ; sans anonyme, la création donne un uid.
        const u = avant ? (await auth.linkWithCredential(avant, auth.EmailAuthProvider.credential(a, mdp))).user : (await auth.createUserWithEmailAndPassword(s.a, a, mdp)).user;
        await connecte(u);
        let verification = true;
        try {
          await auth.sendEmailVerification(u);
        } catch (e) {
          // Non bloquante (D18 b) : le compte est créé, l'e-mail se renvoie depuis la vue Compte.
          noter(e);
          verification = false;
        }
        prevenir();
        return { adresse: u.email ?? a, verification };
      }),

    connecter: (adresse, mdp) =>
      suivi(async () => {
        const a = adresse.trim();
        if (!a) throw new ErreurCompte('auth/missing-email');
        if (!mdp) throw new ErreurCompte('auth/missing-password');
        const s = await service();
        surveiller(s);
        const { user } = await s.m.auth.signInWithEmailAndPassword(s.a, a, mdp);
        await connecte(user);
        prevenir();
        return { adresse: user.email ?? a };
      }),

    oublier: (adresse) =>
      suivi(async () => {
        const a = adresse.trim();
        if (!a) throw new ErreurCompte('auth/missing-email');
        const s = await service();
        try {
          await s.m.auth.sendPasswordResetEmail(s.a, a);
        } catch (e) {
          // Sans protection contre l'énumération, l'adresse inconnue se dirait : même message que le succès.
          if (codeErreur(e) === 'auth/user-not-found') return noter(e);
          // Au-delà des 150 réinitialisations du jour (Spark), Firebase répond l'un ou l'autre (§ 2.4, S12).
          if (codeErreur(e) === 'auth/too-many-requests') {
            noter(e);
            throw new ErreurCompte('auth/quota-exceeded');
          }
          throw e;
        }
      }),

    renvoyer: () =>
      suivi(async () => {
        const s = await service();
        const u = s.a.currentUser;
        if (!estCompte(u)) throw new ErreurCompte('terramemo/sans-compte');
        await s.m.auth.sendEmailVerification(u!);
        return { adresse: u!.email ?? '' };
      }),

    changerMotDePasse: (ancien, nouveau) =>
      suivi(async () => {
        const s = await service();
        const u = s.a.currentUser;
        if (!u || !estCompte(u)) throw new ErreurCompte('terramemo/sans-compte');
        // Pas de mot de passe ajouté à un compte Google (D19, comme Light).
        if (!fournisseursDe(u).includes('password') || !u.email) throw new ErreurCompte('terramemo/mdp-google');
        verifierMdp(nouveau);
        const { auth } = s.m;
        try {
          await auth.reauthenticateWithCredential(u, auth.EmailAuthProvider.credential(u.email, ancien));
        } catch (e) {
          if (['auth/invalid-credential', 'auth/wrong-password', 'auth/missing-password'].includes(codeErreur(e))) {
            noter(e);
            throw new ErreurCompte('terramemo/mdp-actuel-faux');
          }
          throw e;
        }
        // Les sessions des autres appareils sont révoquées : elles passent en session perdue (§ 2.4).
        await auth.updatePassword(u, nouveau);
        await rafraichir(u);
      }),

    deconnecter: () =>
      suivi(async () => {
        const s = await service();
        await ecrireSession({ deconnexion: 'voulue' });
        await s.m.auth.signOut(s.a);
        await ecrireSession({ uid: null, fournisseurs: [], adresse: null, deconnexion: null });
        rapport.jeton = null;
        prevenir();
      }),

    continuerSansCompte: () =>
      suivi(async () => {
        await ecrireSession({ uid: null, fournisseurs: [], adresse: null, deconnexion: null });
        prevenir();
      }),

    surChangement(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },

    demarrer: () => suivi(etat),

    rapport: () => structuredClone(rapport),
  };
}

let unique: Comptes | null = null;

/** Les comptes de la page (une instance, la session de terramemo-synchro). */
export function comptes(version = ''): Comptes {
  unique ??= creerComptes({ version });
  return unique;
}
