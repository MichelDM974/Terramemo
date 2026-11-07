// Comptes du J1b, lot 1 (docs/etudes/2026-11-07-j1b-conception.md, § 2 à 3) :
// e-mail et mot de passe, lien de l'invité anonyme, session perdue. Chargé à
// la demande avec la vue Compte (morceau à part), jamais au démarrage d'un
// invité (D9 b) ; pour un compte ou une session perdue, au démarrage, après
// le premier affichage de la carte (demarrer()).
//
// Quatre états (§ 2.1) : invité sans uid, invité anonyme (créé par compte()
// pour publier un score), compte (fournisseur password, plus tard
// google.com), session perdue (aucun compte, mais le dernier uid connu dans
// terramemo-synchro, sans déconnexion voulue).
//
// Lot 2, profil `joueurs/{uid}` (§ 5.4, src/sync/profil.ts) : pseudo et
// records, lus et fusionnés à chaque connexion (assurerProfil, idempotent :
// création, lien, reconnexion) et à chaque ouverture de l'appli, écrits par
// transaction au premier besoin, et à chaque record ou pseudo nouveau
// (profilModifie, par le pont du morceau principal). `session.profil_a_ecrire`
// garde ce qui n'est pas parti (hors ligne, refus des règles : `joueurs/` est
// fermé en production jusqu'au lot 6). Rien pour un invité, anonyme compris
// (D16), ni quand la synchro est coupée. Lecture, union et question de fusion
// (lot 4) : la question D22 dira au lot 4 si les records de l'appareil vont
// au compte ; d'ici là, ils y vont.
//
// Lot 3, envoi des séances (src/sync/envoi.ts, branché par main.ts) : les
// comptes lui disent à qui envoyer (pourSynchro) et quand le jeton change
// (surJeton : création, lien, connexion, adresse vérifiée), pour relancer les
// lots refusés par les règles. Comme les records, le journal d'un appareil
// part au compte à toute connexion, jusqu'à la question D22 du lot 4.
//
// Lien, pas copie (décision « Comptes ») : un anonyme devient un compte par
// linkWithCredential, qui garde son uid ; jamais de signOut avant le lien.
import { garderPseudoDans, periodeSemaine, poserAvisPseudo, pseudoValide } from '../epreuve/chrono';
import { synchroCoupee } from './drapeaux';
import { charger, type Service } from './firebase';
import { codeErreur } from './erreurs';
import { poserEtatCompte, type ChangementProfil } from './pont';
import { appliquer, ecrireBasePseudo, ecrireProfil, fusionner, lireBasePseudo, lireLocal, lireProfil, pseudoChangeIci, type Fusion, type ProfilLocal, type ProfilLu } from './profil';
import { depotSessionIndexedDb, sessionVide, type DepotSession, type Fournisseur, type Session } from './session';

/** Mot de passe : 8 caractères au moins, sans autre exigence (D17, comme Light). */
export const MDP_MIN = 8;

export type EtatCompte =
  | { etat: 'invite'; anonyme: boolean }
  | { etat: 'compte'; uid: string; adresse: string | null; verifiee: boolean; fournisseurs: Fournisseur[] }
  | { etat: 'perdue'; uid: string; adresse: string | null };

/**
 * La dernière synchro du profil (§ 5.4). `etat` : a_jour (rien à écrire),
 * cree ou ecrit (le profil a reçu ce que l'appareil avait de nouveau), coupee
 * (sans-synchro), sans_compte (invité, session perdue), supprime (pierre
 * tombale, § 7.1), refuse (refus des règles), echec (réseau), trop_gros
 * (records au-delà de la borne des règles).
 */
export interface ResultatProfil {
  etat: 'a_jour' | 'cree' | 'ecrit' | 'coupee' | 'sans_compte' | 'supprime' | 'refuse' | 'echec' | 'trop_gros';
  /** Le pseudo retenu (celui de l'appareil quand rien n'a été lu). */
  pseudo: string | null;
  /** Le pseudo de l'appareil, remplacé par celui du compte : dit une fois (§ 2.3, étape 7). */
  ancienPseudo: string | null;
  /** Records de l'appareil battus ou ajoutés par le compte, et l'inverse. */
  recus: number;
  envoyes: number;
  quand: number;
}

/** Ce que le pilote relève (S16) : claims du dernier jeton rafraîchi, dernières erreurs brutes, profil. */
export interface RapportComptes {
  etat: EtatCompte | null;
  jeton: { uid: string; identities: Record<string, unknown>; sign_in_provider: string | null } | null;
  erreurs: { code: string; message: string; quand: number }[];
  profil: ResultatProfil | null;
  /** Le drapeau de la session : un pseudo ou un record pas encore dans le profil ; null avant toute écriture de la session. */
  profil_a_ecrire: boolean | null;
}

export interface Comptes {
  /** L'état du compte ; recharge le compte (reload : adresse vérifiée, session révoquée ailleurs). */
  etat(): Promise<EtatCompte>;
  /**
   * Crée un compte e-mail : lie l'invité anonyme s'il y en a un (uid gardé).
   * verification : l'e-mail est parti ; profil : son premier envoi (pseudo
   * et records de l'appareil).
   */
  creer(adresse: string, mdp: string): Promise<{ adresse: string; verification: boolean; profil: ResultatProfil }>;
  /** Se connecte ; profil : pseudo et records du compte fusionnés avec ceux de l'appareil. */
  connecter(adresse: string, mdp: string): Promise<{ adresse: string; profil: ResultatProfil }>;
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
  /**
   * Le profil relu, fusionné avec l'appareil, et écrit s'il le faut (§ 5.4) ;
   * ne rejette jamais. 'ecrire' : par transaction d'emblée (un changement à
   * envoyer) ; 'lire' (défaut, l'ouverture) : une lecture d'abord.
   */
  synchroniserProfil(mode?: 'lire' | 'ecrire'): Promise<ResultatProfil>;
  /**
   * Un record ou un pseudo nouveau sur l'appareil (pont du morceau principal) :
   * noté dans la session s'il y a un compte, ou une session perdue, puis
   * envoyé si un compte est connecté. null pour un invité (rien en ligne, D16).
   */
  profilModifie(c: ChangementProfil): Promise<ResultatProfil | null>;
  /** Vue Compte : le pseudo du compte changé (appareil, profil), puis les records republiés sous ce pseudo. */
  changerPseudo(pseudo: string): Promise<ResultatProfil>;
  /** Appelé quand l'état peut avoir changé (connexion, session perdue en cours de route). */
  surChangement(f: () => void): () => void;
  /**
   * Le compte à qui envoyer les lots (src/sync/envoi.ts) : un compte connecté
   * (pas un invité, anonyme compris : D16), connu de la session, sans
   * déconnexion, effacement ni suppression en cours ; null sinon, session
   * perdue comprise, sans charger Firebase pour un invité. Lève si le service
   * ne se charge pas (hors ligne).
   */
  pourSynchro(): Promise<{ uid: string; service: Service } | null>;
  /** Le jeton du compte vient de changer (création, lien, connexion, adresse vérifiée). */
  surJeton(f: () => void): () => void;
  /** Démarrage d'un compte ou d'une session perdue : SDK chargé, état surveillé. */
  demarrer(): Promise<EtatCompte>;
  rapport(): RapportComptes;
}

/** Ce que le profil lit et écrit sur l'appareil (pseudo, records) : le localStorage de la page. */
export type StockageProfil = Pick<Storage, 'getItem' | 'setItem'>;

export interface OptionsComptes {
  session?: DepotSession;
  version?: string;
  service?: () => Promise<Service>;
  /** Défaut : le localStorage de la page (null s'il est refusé). */
  stockage?: () => StockageProfil | null;
  /** Défaut : synchroCoupee() (drapeaux du driver). */
  coupee?: () => boolean;
  /**
   * Les records de l'appareil publiés sous un pseudo que le compte vient de
   * lui donner (§ 2.3, étape 7) : publierTout du classement, par défaut.
   */
  republier?: (pseudo: string) => Promise<unknown>;
  maintenant?: () => number;
}

function stockageDeLaPage(): StockageProfil | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
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
  const stockage = o.stockage ?? stockageDeLaPage;
  const coupee = o.coupee ?? (() => synchroCoupee());
  const republier = o.republier ?? ((p: string) => import('../vues/classement').then((m) => m.publierTout(p)));
  const maintenant = o.maintenant ?? Date.now;
  const abonnes = new Set<() => void>();
  const jetons = new Set<() => void>();
  const rapport: RapportComptes = { etat: null, jeton: null, erreurs: [], profil: null, profil_a_ecrire: null };
  let surveille = false;
  let reseauEcoute = false;
  /** Repli du § 5.1 : une session que IndexedDB n'a pas pu écrire (quota plein) prime le temps de la page. */
  let sessionPage: Session | null = null;

  const prevenir = () => abonnes.forEach((f) => f());
  const jetonChange = () => jetons.forEach((f) => f());
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
      // Les champs qu'une fiche plus ancienne n'a pas prennent leur valeur vide.
      const lue = await depot.lire();
      return lue ? { ...sessionVide(version), ...lue } : sessionVide(version);
    } catch {
      return sessionVide(version);
    }
  }
  /**
   * Les modifications de la session, une à la fois (relue, modifiée, écrite) :
   * le profil pose et lève ses drapeaux pendant qu'une connexion écrit l'uid,
   * et deux lectures croisées perdraient l'une des deux écritures. `f` rend
   * ce qu'il faut changer, ou null pour ne rien écrire.
   */
  let fileSession: Promise<unknown> = Promise.resolve();
  function modifierSession(f: (s: Session) => Partial<Session> | null): Promise<void> {
    const p = fileSession.then(async () => {
      const avant = await lireSession();
      const m = f(avant);
      if (!m) return;
      const s = { ...avant, ...m, version };
      try {
        await depot.ecrire(s);
        sessionPage = null;
      } catch (e) {
        // Écriture refusée (quota plein) : la fiche vit en mémoire le temps de la page (§ 5.1),
        // pour qu'une déconnexion ne se lise pas en session perdue.
        noter(e);
        sessionPage = s;
      }
      rapport.profil_a_ecrire = s.profil_a_ecrire;
    });
    fileSession = p.catch(() => undefined);
    return p;
  }
  const ecrireSession = (m: Partial<Session>) => modifierSession(() => m);
  /** Le drapeau du profil levé : rien n'attend plus (envoi fait, autre compte, déconnexion). */
  const SANS_PROFIL_A_ECRIRE: Partial<Session> = { profil_a_ecrire: false };

  /** Le jeton rafraîchi (claims à jour après un lien, S16), relevé pour le pilote. */
  async function rafraichir(u: import('firebase/auth').User): Promise<void> {
    await u.getIdToken(true);
    const r = await u.getIdTokenResult();
    const f = (r.claims.firebase ?? {}) as { identities?: Record<string, unknown>; sign_in_provider?: string };
    rapport.jeton = { uid: u.uid, identities: f.identities ?? {}, sign_in_provider: f.sign_in_provider ?? null };
  }

  /**
   * Adresse vérifiée (lien de l'e-mail, ouvert ailleurs ou appli fermée) mais
   * jeton d'avant : `reload()` ne rafraîchit pas l'ID token. Il est rafraîchi,
   * puis les lots refusés se relancent (§ 5.2 ; règles d'essai des lots 6 et
   * 7, qui exigent email_verified). Comparé à chaque appel, sans état de page :
   * une page neuve le voit, et un rafraîchissement raté se refait au suivant.
   */
  async function verifierJeton(u: import('firebase/auth').User): Promise<void> {
    if (!u.emailVerified) return;
    try {
      if ((await u.getIdTokenResult()).claims.email_verified === true) return;
      await rafraichir(u);
      jetonChange();
    } catch (e) {
      noter(e);
    }
  }

  /**
   * Après un lien, une création ou une connexion réussis : la session d'abord
   * (l'appli peut être tuée juste après), puis le jeton rafraîchi (§ 2.2 :
   * claims à jour). Un rafraîchissement raté (réseau) ne défait rien : le
   * compte est fait, le SDK rafraîchira plus tard.
   */
  async function connecte(u: import('firebase/auth').User, nouveau = false): Promise<ResultatProfil> {
    // Un autre compte que celui de la session : son drapeau du profil ne vaut pas pour celui-ci.
    // Un compte neuf (création, lien) : tout ce que l'appareil a est à lui envoyer.
    await modifierSession((s) => ({
      uid: u.uid,
      fournisseurs: fournisseursDe(u),
      adresse: u.email,
      deconnexion: null,
      ...(nouveau ? { profil_a_ecrire: true } : s.uid === u.uid ? {} : SANS_PROFIL_A_ECRIRE),
    }));
    // La base vide d'un compte neuf : le pseudo du créateur sera celui du compte, même si sa
    // première écriture échoue (joueurs/ fermé jusqu'au lot 6) et qu'un autre appareil écrit
    // le profil avant lui.
    if (nouveau) ecrireBasePseudo(stockage(), { uid: u.uid, pseudo: null });
    poserEtatCompte('compte');
    ecouterReseau();
    try {
      await rafraichir(u);
    } catch (e) {
      noter(e);
    }
    // Les lots refusés se relancent avec ce jeton ; le journal de l'appareil part (§ 2.2).
    jetonChange();
    return assurerProfil();
  }

  // --- Profil (§ 5.4) ---

  /** Incrémenté à chaque changement noté : une synchro ne lève le drapeau que si rien n'est venu depuis son début. */
  let generation = 0;
  let fileProfil: Promise<unknown> = Promise.resolve();
  /** La prochaine passe, pas encore commencée ; `ecrire` : d'emblée par transaction. */
  let prochaine: { p: Promise<ResultatProfil>; ecrire: boolean } | null = null;

  /**
   * Une synchro du profil à la fois. Un appel pendant une synchro en lance
   * une autre après elle (elle relira ce qui a changé entre-temps), et les
   * appels qui arrivent avant qu'elle commence la partagent. `ecrire` : un
   * changement à envoyer (record, pseudo, connexion), d'emblée par
   * transaction, soit une lecture et une écriture (§ 5.7) ; sinon
   * (ouverture), une lecture, et la transaction seulement s'il y a du neuf.
   */
  function synchroniserProfil(mode: 'lire' | 'ecrire' = 'lire'): Promise<ResultatProfil> {
    if (prochaine) {
      prochaine.ecrire ||= mode === 'ecrire';
      return prochaine.p;
    }
    const suivante = { ecrire: mode === 'ecrire', p: Promise.resolve(null as unknown as ResultatProfil) };
    suivante.p = fileProfil.then(() => {
      prochaine = null;
      return passeProfil(suivante.ecrire);
    });
    prochaine = suivante;
    fileProfil = suivante.p.catch(() => undefined);
    return suivante.p;
  }

  /** À la création, au lien et à chaque connexion (idempotent : un profil absent est créé). */
  const assurerProfil = () => synchroniserProfil('ecrire');

  async function passeProfil(ecrire: boolean): Promise<ResultatProfil> {
    const st = stockage();
    const periode = periodeSemaine(maintenant());
    // Ce que la passe lit de l'appareil, d'un coup et en synchrone : son pseudo, ses records et
    // la base de la fusion à trois du pseudo. La transaction refait la fusion avec eux, et
    // appliquer() ne remplace un pseudo que s'il n'a pas changé depuis. Un record ou un pseudo
    // venu pendant l'appel a son propre profilModifie, donc sa passe à lui, juste après.
    const local: ProfilLocal = lireLocal(st);
    const base = lireBasePseudo(st);
    const fini = (etat: ResultatProfil['etat'], f?: Fusion, ancienPseudo: string | null = null): ResultatProfil => {
      const r = { etat, pseudo: f ? f.pseudo : local.pseudo, ancienPseudo, recus: f?.recus ?? 0, envoyes: f?.envoyes ?? 0, quand: maintenant() };
      rapport.profil = r;
      return r;
    };
    if (coupee()) return fini('coupee');
    const gen = generation;
    let s: Service;
    try {
      s = await service();
    } catch (e) {
      noter(e);
      return fini('echec');
    }
    const u = s.a.currentUser;
    if (!u || !estCompte(u)) return fini('sans_compte');
    const o = { pseudoLocal: pseudoChangeIci(local.pseudo, base, u.uid), periode };
    const calculer = (lu: ProfilLu) => (lu.supprime ? null : { ...fusionner(lu, local, o), cree: !lu.existe });
    try {
      // La transaction relit le profil et refait la fusion : un autre appareil a pu écrire entre-temps.
      let f = ecrire ? await ecrireProfil(s, u.uid, calculer) : calculer(await lireProfil(s, u.uid));
      if (f && !ecrire && f.doc) f = await ecrireProfil(s, u.uid, calculer);
      if (!f) return fini('supprime');
      const a = appliquer(st, f, local, periode);
      if (a.ancienPseudo) poserAvisPseudo(st, a.ancienPseudo);
      if (f.tropGros) {
        noter(new ErreurCompte('terramemo/profil-trop-gros'));
        await ecrireSession({ profil_a_ecrire: true });
      } else {
        // Le compte a maintenant ce pseudo : la base de la prochaine fusion.
        ecrireBasePseudo(st, { uid: u.uid, pseudo: f.pseudo });
        await modifierSession(() => (gen === generation ? SANS_PROFIL_A_ECRIRE : null));
      }
      // Un pseudo donné par le compte : les records de l'appareil le rejoignent au classement.
      if (a.pseudoPris && f.pseudo) void republier(f.pseudo).catch(noter);
      return fini(f.tropGros ? 'trop_gros' : !f.doc ? 'a_jour' : f.cree ? 'cree' : 'ecrit', f, a.ancienPseudo);
    } catch (e) {
      noter(e);
      // Pas parti : à refaire à la prochaine ouverture, au retour du réseau ou au prochain changement.
      if (local.pseudo || local.records.size) await ecrireSession({ profil_a_ecrire: true });
      return fini(codeErreur(e) === 'permission-denied' ? 'refuse' : 'echec');
    }
  }

  async function profilModifie(_c: ChangementProfil): Promise<ResultatProfil | null> {
    let suivi = false;
    await modifierSession((ses) => {
      // Invité, anonyme compris : rien en ligne (D16). Session perdue : noté, envoyé à la reconnexion.
      if (!ses.uid) return null;
      suivi = true;
      generation++;
      return { profil_a_ecrire: true };
    });
    return suivi ? synchroniserProfil('ecrire') : null;
  }

  /** Au retour du réseau, ce qui attend repart (une écoute par page, posée à l'ouverture ou à la connexion). */
  function ecouterReseau(): void {
    if (reseauEcoute || typeof addEventListener !== 'function') return;
    reseauEcoute = true;
    addEventListener('online', () => {
      void lireSession().then((ses) => {
        if (ses.uid && ses.profil_a_ecrire) void synchroniserProfil('ecrire');
      });
    });
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
      await verifierJeton(u);
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
    poserEtatCompte(e.etat === 'compte' ? 'compte' : e.etat === 'perdue' ? 'perdue' : 'invite');
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
        const profil = await connecte(u, true);
        let verification = true;
        try {
          await auth.sendEmailVerification(u);
        } catch (e) {
          // Non bloquante (D18 b) : le compte est créé, l'e-mail se renvoie depuis la vue Compte.
          noter(e);
          verification = false;
        }
        prevenir();
        return { adresse: u.email ?? a, verification, profil };
      }),

    connecter: (adresse, mdp) =>
      suivi(async () => {
        const a = adresse.trim();
        if (!a) throw new ErreurCompte('auth/missing-email');
        if (!mdp) throw new ErreurCompte('auth/missing-password');
        const s = await service();
        surveiller(s);
        const { user } = await s.m.auth.signInWithEmailAndPassword(s.a, a, mdp);
        const profil = await connecte(user);
        prevenir();
        return { adresse: user.email ?? a, profil };
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
        // Ce qui attend part d'abord, si possible (§ 3.4, étape 1). Sinon il reste sur l'appareil
        // (lot 2 : rien n'est effacé) : les records se refusionnent à la reconnexion, et un pseudo
        // changé ici l'emporte encore sur ce compte (base du pseudo gardée). L'avertissement de ce
        // qui n'est pas parti vient avec la déconnexion reprenable (§ 3.4, lot 4).
        if ((await lireSession()).profil_a_ecrire) await synchroniserProfil('ecrire');
        await ecrireSession({ deconnexion: 'voulue' });
        await s.m.auth.signOut(s.a);
        await ecrireSession({ uid: null, fournisseurs: [], adresse: null, deconnexion: null, ...SANS_PROFIL_A_ECRIRE });
        rapport.jeton = null;
        poserEtatCompte('invite');
        prevenir();
      }),

    continuerSansCompte: () =>
      suivi(async () => {
        await ecrireSession({ uid: null, fournisseurs: [], adresse: null, deconnexion: null, ...SANS_PROFIL_A_ECRIRE });
        poserEtatCompte('invite');
        prevenir();
      }),

    synchroniserProfil,

    profilModifie,

    changerPseudo: (pseudo) =>
      suivi(async () => {
        const p = pseudoValide(pseudo);
        if (!p) throw new ErreurCompte('terramemo/pseudo-invalide');
        garderPseudoDans(stockage(), p);
        const r = (await profilModifie('pseudo')) ?? (await synchroniserProfil('ecrire'));
        // Le nouveau pseudo prend sa place au classement, comme au formulaire du classement.
        void republier(p).catch(noter);
        return r;
      }),

    surChangement(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },

    async pourSynchro() {
      const ses = await lireSession();
      // Sans compte dans la session (invité), rien à charger : la connexion l'écrit avant tout envoi.
      if (!ses.uid || ses.deconnexion || ses.effacement || ses.suppression) return null;
      const s = await service();
      const u = s.a.currentUser;
      if (!u || !estCompte(u)) return null;
      // Adresse pas encore vérifiée : relue à chaque passe (une requête à Auth, pas à Firestore),
      // pour qu'une vérification faite ailleurs relance les lots refusés sans ouvrir la vue Compte.
      if (!u.emailVerified) {
        try {
          await u.reload();
        } catch (e) {
          noter(e);
        }
        await verifierJeton(u);
      }
      return s.a.currentUser === u ? { uid: u.uid, service: s } : null;
    },

    surJeton(f) {
      jetons.add(f);
      return () => jetons.delete(f);
    },

    demarrer: () =>
      suivi(async () => {
        const e = await etat();
        ecouterReseau();
        // À chaque ouverture : le profil relu (1 lecture), fusionné, écrit s'il le faut.
        if (e.etat === 'compte') await synchroniserProfil();
        return e;
      }),

    rapport: () => structuredClone(rapport),
  };
}

let unique: Comptes | null = null;

/** Les comptes de la page (une instance, la session de terramemo-synchro). */
export function comptes(version = ''): Comptes {
  unique ??= creerComptes({ version });
  return unique;
}
