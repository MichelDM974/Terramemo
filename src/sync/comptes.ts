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
// lots refusés par les règles.
//
// Lot 4 (§ 2.3, § 2.5, § 3.4) : à la connexion d'un compte existant, si
// l'appareil a des progrès qui ne sont pas déjà à ce compte, la question D22
// (« Ajouter », « Ne pas les ajouter », « Annuler ») vient avant que rien ne
// parte : ni lots, ni records. Le compte est connecté pour connaître son uid,
// mais la session ne le prend qu'après la réponse (pourSynchro n'envoie qu'au
// compte de la session) ; « Annuler » le déconnecte, et une appli tuée
// pendant la question ne le garde pas (`session.connexion`). Après la
// réponse : restauration du compte (lecture complète, déclencheur
// `connexion`), puis envoi de ce qui n'est pas en ligne. Déconnexion
// reprenable (D24 a) : tout ce qui attend part d'abord ; s'il reste quelque
// chose, rien ne se fait sans « Se déconnecter quand même » ; puis
// `deconnexion` et `effacement` posés, signOut, journal, état d'envoi,
// pseudo et records effacés, l'appareil repart en invité vierge. Une session
// perdue peut aussi « Effacer cet appareil ». L'appareil (journal, envoi)
// est vu par l'interface AppareilComptes, que main.ts branche.
//
// Lot 5 (§ 7.1, D27 b) : suppression du compte, reprenable. Réauthentifier
// (mot de passe ; Google : popup sur le site, idToken du plugin dans l'APK au
// lot 7), poser `session.suppression` (plus rien ne part), la demande de
// retrait des places du pseudo et la pierre tombale d'un coup, les lots
// supprimés par pages de 400, deleteUser, puis l'appareil effacé comme à la
// déconnexion. Chaque étape est idempotente : une suppression coupée reprend
// de l'étape 1 (« Suppression inachevée : reprendre ? »), ou directement à
// l'effacement si le compte n'est plus dans Auth. Un autre appareil du compte
// lit la pierre tombale à sa prochaine ouverture (« Ce compte est en cours de
// suppression »), puis passe en session perdue.
//
// Lien, pas copie (décision « Comptes ») : un anonyme devient un compte par
// linkWithCredential, qui garde son uid ; jamais de signOut avant le lien.
import { garderPseudoDans, periodeSemaine, poserAvisPseudo, pseudoValide } from '../epreuve/chrono';
import { synchroCoupee } from './drapeaux';
import { dansApk } from '../retour-android';
import { charger, compteDisparu, type Service } from './firebase';
import { codeErreur } from './erreurs';
import { APRES_EFFACEMENT, effacerJoueurLocal } from './effacement';
import type { Marques } from './envoi';
import { poserEtatCompte, type ChangementProfil } from './pont';
import type { CompteExport, ProfilExport } from './export';
import { appliquer, ecrireBasePseudo, ecrireProfil, fusionner, lireBasePseudo, lireLocal, lireProfil, lireRecordsProfil, pseudoChangeIci, V_PROFIL, type Fusion, type ProfilLocal, type ProfilLu } from './profil';
import { depotSessionIndexedDb, sessionVide, type DepotSession, type Fournisseur, type Session } from './session';

/** Mot de passe : 8 caractères au moins, sans autre exigence (D17, comme Light). */
export const MDP_MIN = 8;
/**
 * Une question de fusion plus vieille que ça, trouvée dans la session par une
 * page qui ne la pose pas : l'appli a été tuée pendant la question ; le
 * compte connecté n'est pas pris (signOut).
 */
export const QUESTION_MAX = 10 * 60_000;
/** Lots supprimés par page (§ 7.1, étape 5) : une lecture puis un lot d'écriture (500 au plus). */
export const PAGE_SUPPRESSION = 400;
/** Le mot à saisir pour confirmer la suppression du compte (§ 7.1). */
export const MOT_SUPPRESSION = 'supprimer';

/**
 * La confirmation d'une suppression (§ 7.1) : le mot saisi (« supprimer »,
 * sans tenir compte de la casse), et le mot de passe d'un compte `password`.
 */
export interface ConfirmationSuppression {
  mot: string;
  mdp?: string;
}

/**
 * La question de la connexion (§ 2.3, étape 1 ; D22) : `appareil`, les
 * progrès de cet appareil (invité, ou session perdue d'un autre compte qui a
 * tout envoyé) ; `autre_compte`, des séances d'une session perdue d'un autre
 * compte, pas encore envoyées. `reponses` : celles du journal que le compte
 * n'a pas déjà ; `records` : records de l'appareil ; `seances` : séances non
 * envoyées de l'autre compte.
 */
export interface QuestionFusion {
  sorte: 'appareil' | 'autre_compte';
  reponses: number;
  records: number;
  seances: number;
}
/** « Ajouter » ; « Ne pas les ajouter », confirmé (effacer l'appareil) ; « Annuler » (pas de connexion). */
export type ChoixFusion = 'ajouter' | 'effacer' | 'annuler';

/** Ce que la question a donné : pas de question, progrès ajoutés au compte, ou effacés de l'appareil. */
export type ResultatFusion = 'sans_question' | 'ajoute' | 'efface';

/**
 * Ce que la déconnexion (§ 3.4) a fait : `fait`, ou ce qui n'est pas parti
 * (séances, dont refusées par le serveur ; profil : pseudo ou records), qui
 * demande « Se déconnecter quand même ».
 */
export type ResultatDeconnexion = { fait: true } | { fait: false; nonEnvoyees: number; refusees: number; profil: boolean };

/** Le journal et l'état d'envoi de l'appareil, tels que les comptes en ont besoin (main.ts : la mémoire et l'envoi). */
export interface AppareilComptes {
  /** Réponses du journal dans aucun lot du compte (toutes si `uid` est null, ou pour un compte que l'appareil n'a jamais vu). */
  reponsesHorsCompte(uid: string | null): Promise<number>;
  /** Séances du journal pas encore dans ce compte (session perdue d'un autre compte : § 2.3). */
  nonEnvoyees(uid: string): Promise<number>;
  /** Tout ce qui attend part (§ 3.4, étape 1) ; rend ce qui n'est pas parti. */
  envoyerTout(uid: string): Promise<{ nonEnvoyees: number; refusees: number }>;
  /** Le journal vidé, puis l'état d'envoi de ces comptes ; rejette si le journal ne l'est pas. */
  effacer(uids: readonly string[]): Promise<void>;
}

/** Sans appareil branché (tests des lots 1 à 3) : rien à demander, rien à envoyer, rien à effacer. */
const APPAREIL_VIDE: AppareilComptes = {
  reponsesHorsCompte: async () => 0,
  nonEnvoyees: async () => 0,
  envoyerTout: async () => ({ nonEnvoyees: 0, refusees: 0 }),
  effacer: async () => undefined,
};

export type EtatCompte =
  | { etat: 'invite'; anonyme: boolean }
  /** `supprime` : le profil porte la pierre tombale (suppression lancée depuis un autre appareil, § 7.1). */
  | { etat: 'compte'; uid: string; adresse: string | null; verifiee: boolean; fournisseurs: Fournisseur[]; supprime?: boolean }
  | { etat: 'perdue'; uid: string; adresse: string | null }
  /**
   * Une suppression du compte inachevée sur cet appareil (`session.suppression`,
   * § 7.1) : `connecte`, le compte est encore là (reprise depuis la
   * réauthentification) ; sinon, il n'est plus dans Auth (il reste à effacer
   * l'appareil).
   */
  | { etat: 'suppression'; uid: string; adresse: string | null; fournisseurs: Fournisseur[]; connecte: boolean };

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
  creer(adresse: string, mdp: string, choisir?: (q: QuestionFusion) => Promise<ChoixFusion>): Promise<{ adresse: string; verification: boolean; profil: ResultatProfil; fusion: ResultatFusion }>;
  /**
   * Se connecte à un compte existant ; `choisir` pose la question de fusion
   * (D22) s'il le faut (sans lui : « Ajouter »). « Annuler » lève
   * terramemo/connexion-annulee, sans rien changer. profil : pseudo et
   * records du compte fusionnés avec ceux de l'appareil (s'ils sont gardés).
   */
  connecter(adresse: string, mdp: string, choisir?: (q: QuestionFusion) => Promise<ChoixFusion>): Promise<{ adresse: string; profil: ResultatProfil; fusion: ResultatFusion; reponses: number }>;
  /** Mot de passe oublié : sans dire si l'adresse a un compte (message générique). */
  oublier(adresse: string): Promise<void>;
  /** Renvoie l'e-mail de vérification. */
  renvoyer(): Promise<{ adresse: string }>;
  changerMotDePasse(ancien: string, nouveau: string): Promise<void>;
  /**
   * Déconnexion reprenable (§ 3.4, D24 a) : ce qui attend part d'abord ; s'il
   * reste quelque chose, rien n'est fait (`fait: false`) sauf `quandMeme`.
   * Puis signOut, et l'appareil effacé (journal, état d'envoi, pseudo,
   * records) ; un effacement inachevé lève terramemo/effacement-inacheve et
   * se finit au démarrage suivant.
   */
  deconnecter(o?: { quandMeme?: boolean }): Promise<ResultatDeconnexion>;
  /**
   * Supprime le compte (§ 7.1), ou reprend une suppression inachevée :
   * réauthentification, `session.suppression`, demande de retrait des places
   * (D27 b) et pierre tombale, lots, deleteUser, puis l'appareil effacé.
   * Lève terramemo/suppression-mot sans « supprimer », et
   * terramemo/effacement-inacheve si l'appareil n'a pas pu être vidé (fini
   * au démarrage suivant).
   */
  supprimer(c: ConfirmationSuppression): Promise<void>;
  /** Session perdue → invité : l'appareil garde son journal (§ 2.5). */
  continuerSansCompte(): Promise<void>;
  /** Session perdue → invité vierge : journal, état d'envoi, pseudo et records effacés (§ 2.5). */
  effacerAppareil(): Promise<void>;
  /** Réponses du journal de l'appareil (confirmation d'un effacement). */
  reponsesAppareil(): Promise<number>;
  /**
   * Ce que l'export (§ 7.2) dit du compte de la session : le compte connecté
   * (date de création comprise) et son profil en ligne s'il se lit, ou le
   * dernier compte d'une session perdue ; rien pour un invité. Ne rejette pas
   * hors ligne : l'export se fait avec ce que l'appareil a.
   */
  pourExport(): Promise<{ compte: CompteExport | null; profil: ProfilExport | null }>;
  /** La marque de lecture des lots, gardée dans la session pour le compte de la session (envoi). */
  marques(): Marques;
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
  pourSynchro(): Promise<{ uid: string; service: Service; verifiee: boolean } | null>;
  /**
   * Le jeton du compte vient de changer : `connexion` (création, lien,
   * connexion : le compte se relit, puis l'appareil envoie), `jeton` (adresse
   * vérifiée : les lots refusés se relancent).
   */
  surJeton(f: (quoi: 'connexion' | 'jeton') => void): () => void;
  /** Démarrage d'un compte ou d'une session perdue : SDK chargé, état surveillé. */
  demarrer(): Promise<EtatCompte>;
  rapport(): RapportComptes;
}

/** Ce que le profil lit et écrit sur l'appareil (pseudo, records) : le localStorage de la page. */
export type StockageProfil = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

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
  /** Le journal et l'envoi de l'appareil (main.ts) ; défaut : rien (tests des lots 1 à 3). */
  appareil?: AppareilComptes;
  /** Dans l'APK ? Défaut : dansApk() (pont natif de Capacitor). */
  natif?: () => boolean;
  /**
   * Dans l'APK, un nouvel idToken Google pour réauthentifier un compte Google
   * avant sa suppression (§ 7.1, étape 1) : le plugin du lot 7. Absent :
   * terramemo/google-apk (supprimer depuis le site).
   */
  jetonGoogle?: () => Promise<string>;
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
  const appareil = o.appareil ?? APPAREIL_VIDE;
  const natif = o.natif ?? (() => typeof window !== 'undefined' && dansApk());
  const abonnes = new Set<() => void>();
  const jetons = new Set<(quoi: 'connexion' | 'jeton') => void>();
  /** Cette page pose la question de fusion, ou se déconnecte : etat() ne la prend pas pour une appli tuée en route. */
  let questionIci = false;
  let deconnexionIci = false;
  /** Le compte dont le profil porte la pierre tombale, vu par la dernière synchro du profil (§ 7.1). */
  let tombeVue: string | null = null;
  const rapport: RapportComptes = { etat: null, jeton: null, erreurs: [], profil: null, profil_a_ecrire: null };
  let surveille = false;
  let reseauEcoute = false;
  /** Repli du § 5.1 : une session que IndexedDB n'a pas pu écrire (quota plein) prime le temps de la page. */
  let sessionPage: Session | null = null;

  const prevenir = () => abonnes.forEach((f) => f());
  const jetonChange = (quoi: 'connexion' | 'jeton') => jetons.forEach((f) => f(quoi));
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
      jetonChange('jeton');
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
    // Un autre compte que celui de la session : sa marque de lecture ne vaut pas non plus (tout est à lire).
    await modifierSession((s) => ({
      uid: u.uid,
      fournisseurs: fournisseursDe(u),
      adresse: u.email,
      deconnexion: null,
      connexion: null,
      ...(s.uid === u.uid ? {} : { marque: null }),
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
    // Le compte se relit (restauration, § 5.3), puis le journal de l'appareil part ; les lots refusés
    // se relancent avec ce jeton (§ 2.2, § 2.3).
    jetonChange('connexion');
    return assurerProfil();
  }

  // --- Question de fusion (§ 2.3, D22) et effacement de l'appareil (§ 3.4) ---

  /**
   * La question à poser avant que l'appareil ne rejoigne le compte `uid`, ou
   * null : session perdue de ce même compte (reprise sans question), ou rien
   * sur l'appareil que le compte n'ait déjà. `avant` : la session d'avant la
   * connexion ; `nouveau` : un compte qui vient d'être créé (il n'a rien).
   */
  async function question(uid: string | null, avant: Session): Promise<QuestionFusion | null> {
    if (uid !== null && avant.uid === uid) return null;
    const reponses = await appareil.reponsesHorsCompte(uid);
    const records = lireLocal(stockage()).records.size;
    if (!reponses && !records) return null;
    const seances = avant.uid ? await appareil.nonEnvoyees(avant.uid) : 0;
    return { sorte: seances > 0 ? 'autre_compte' : 'appareil', reponses, records, seances };
  }

  /** Le journal, l'état d'envoi de ces comptes, le pseudo et les records effacés de l'appareil. */
  async function effacerTout(uids: readonly (string | null)[]): Promise<void> {
    await appareil.effacer([...new Set(uids.filter((x): x is string => !!x))]);
    effacerJoueurLocal(stockage() as Pick<Storage, 'removeItem'> | null);
  }

  /**
   * Avant de prendre un compte : un effacement resté en route (déconnexion
   * ou « Effacer cet appareil » dont le journal n'a pas pu être vidé) est
   * fini d'abord. Sinon le compte pris n'enverrait rien (pourSynchro) et le
   * démarrage suivant effacerait ce qu'il aurait joué. Lève
   * terramemo/effacement-inacheve s'il échoue encore. Rend la session à jour.
   */
  async function finirEffacement(): Promise<Session> {
    const ses = await lireSession();
    if (!ses.effacement) return ses;
    try {
      await effacerTout([ses.effacement]);
    } catch (e) {
      noter(e);
      throw new ErreurCompte('terramemo/effacement-inacheve');
    }
    await ecrireSession({ ...APRES_EFFACEMENT, deconnexion: null });
    return lireSession();
  }

  /**
   * Un compte connecté dans Firebase que la session n'a pas pris (question de
   * fusion tuée en route) : déconnecté, pour ne jamais le prendre sans réponse
   * ni lier un compte à un autre.
   */
  async function lacherCompteNonPris(s: Service, ses: Session): Promise<void> {
    const u = s.a.currentUser;
    if (estCompte(u) && u!.uid !== ses.uid) await s.m.auth.signOut(s.a);
  }

  /**
   * Le lien de l'invité anonyme à un compte e-mail (§ 2.2), qui garde son
   * uid. Un anonyme que Firebase a supprimé (30 jours après sa création,
   * Identity Platform) ne se lie plus : USER_NOT_FOUND au lien, ou jeton qui
   * ne se rafraîchit plus. Il n'avait rien en ligne (D16) : le compte est
   * créé neuf, sans message d'erreur, et le journal de l'appareil part à lui
   * comme au lien.
   */
  async function lier(s: Service, avant: import('firebase/auth').User, adresse: string, mdp: string): Promise<import('firebase/auth').User> {
    const { auth } = s.m;
    try {
      return (await auth.linkWithCredential(avant, auth.EmailAuthProvider.credential(adresse, mdp))).user;
    } catch (e) {
      if (!avant.isAnonymous || !compteDisparu(e)) throw e;
      noter(e);
      if (s.a.currentUser === avant) await auth.signOut(s.a);
      return (await auth.createUserWithEmailAndPassword(s.a, adresse, mdp)).user;
    }
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
    // Le compte de la session seulement, comme pourSynchro : un compte connecté pendant la question
    // de fusion (D22), ou resté d'une question tuée, ne reçoit rien de l'appareil avant la réponse.
    const ses = await lireSession();
    // (Pas `connexion` : une question ne se pose que vers un autre compte que celui de la session.)
    if (ses.uid !== u.uid || ses.deconnexion || ses.effacement || ses.suppression) return fini('sans_compte');
    const o = { pseudoLocal: pseudoChangeIci(local.pseudo, base, u.uid), periode };
    const calculer = (lu: ProfilLu) => (lu.supprime ? null : { ...fusionner(lu, local, o), cree: !lu.existe });
    try {
      // La transaction relit le profil et refait la fusion : un autre appareil a pu écrire entre-temps.
      let f = ecrire ? await ecrireProfil(s, u.uid, calculer) : calculer(await lireProfil(s, u.uid));
      if (f && !ecrire && f.doc) f = await ecrireProfil(s, u.uid, calculer);
      if (!f) {
        // Supprimé depuis un autre appareil : la vue Compte le dit (« en cours de suppression »).
        tombeVue = u.uid;
        return fini('supprime');
      }
      if (tombeVue === u.uid) tombeVue = null;
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
    let ses = await lireSession();
    // Une suppression du compte inachevée sur cet appareil (§ 7.1) : elle prime, rien d'autre ne se répare.
    if (ses.suppression) {
      const e: EtatCompte = { etat: 'suppression', uid: ses.suppression, adresse: ses.adresse, fournisseurs: ses.fournisseurs, connecte: !!u && estCompte(u) && u.uid === ses.suppression };
      rapport.etat = e;
      poserEtatCompte('perdue');
      return e;
    }
    // Une question de fusion laissée en route (appli tuée, § 2.3) : le compte connecté n'est pas pris.
    // Récente, elle peut être celle d'un autre onglet : le compte attend sa réponse, sans être pris ici.
    let enQuestion = false;
    if (u && estCompte(u) && ses.connexion !== null && u.uid !== ses.uid && !questionIci) {
      if (maintenant() - ses.connexion > QUESTION_MAX || ses.connexion > maintenant()) {
        await s.m.auth.signOut(s.a).catch(noter);
        await ecrireSession({ connexion: null });
        u = s.a.currentUser;
        ses = await lireSession();
      } else enQuestion = true;
    }
    // Une déconnexion voulue que l'appli n'a pas finie avant le signOut : finie maintenant.
    if (u && estCompte(u) && ses.deconnexion === 'voulue' && !deconnexionIci) {
      await s.m.auth.signOut(s.a).catch(noter);
      u = s.a.currentUser;
    }
    // Une connexion au compte de la session laissée en route (appli tuée avant que connecte() lève le
    // marqueur) : rien à attendre, levé.
    if (u && estCompte(u) && ses.connexion !== null && u.uid === ses.uid && !questionIci) {
      await ecrireSession({ connexion: null });
      ses = await lireSession();
    }
    let e: EtatCompte;
    if (u && estCompte(u) && !enQuestion && !(ses.deconnexion === 'voulue' && !deconnexionIci)) {
      // Réparation d'une session pas écrite (échec d'IndexedDB). Jamais pendant une déconnexion
      // voulue (un autre onglet peut l'avoir lancée, et ce currentUser n'est pas encore à jour),
      // ni pendant la question de fusion de cette page (le compte n'est pas encore pris).
      if (ses.uid !== u.uid && !ses.deconnexion && ses.connexion === null && s.a.currentUser === u)
        await ecrireSession({ uid: u.uid, fournisseurs: fournisseursDe(u), adresse: u.email, deconnexion: null });
      if (ses.uid !== u.uid && questionIci) e = ses.uid ? { etat: 'perdue', uid: ses.uid, adresse: ses.adresse } : { etat: 'invite', anonyme: false };
      else e = { etat: 'compte', uid: u.uid, adresse: u.email, verifiee: u.emailVerified, fournisseurs: fournisseursDe(u), ...(tombeVue === u.uid ? { supprime: true } : {}) };
      if (e.etat === 'compte') await verifierJeton(u);
    } else if (enQuestion) {
      e = ses.uid ? { etat: 'perdue', uid: ses.uid, adresse: ses.adresse } : { etat: 'invite', anonyme: false };
    } else if (!ses.uid && ses.deconnexion && !deconnexionIci) {
      // Déconnexion finie (appareil effacé au démarrage), drapeau resté : levé.
      await ecrireSession({ deconnexion: null });
      e = { etat: 'invite', anonyme: !!u?.isAnonymous };
    } else if (ses.uid && ses.deconnexion === 'voulue') {
      // Déconnexion interrompue après le signOut (appli fermée) : on la termine. L'effacement de
      // l'appareil, s'il reste, se finit au démarrage suivant (main.ts, drapeau `effacement`).
      if (!deconnexionIci) await ecrireSession({ uid: null, fournisseurs: [], adresse: null, deconnexion: null });
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

  // --- Suppression du compte (§ 7.1) ---

  /** Une suppression inachevée sur l'appareil : rien d'autre ne commence avant elle (connexion, création). */
  async function sansSuppression(): Promise<void> {
    if ((await lireSession()).suppression) throw new ErreurCompte('terramemo/suppression-inachevee');
  }

  /**
   * Étape 1 : réauthentifier, toujours, plutôt que d'attendre
   * requires-recent-login. Mot de passe ; Google sur le site, la popup ; dans
   * l'APK, un nouvel idToken du plugin (lot 7).
   */
  async function reauthentifier(s: Service, u: import('firebase/auth').User, mdp: string | undefined): Promise<void> {
    const { auth } = s.m;
    const f = fournisseursDe(u);
    if (f.includes('password') && u.email) {
      if (!mdp) throw new ErreurCompte('auth/missing-password');
      try {
        await auth.reauthenticateWithCredential(u, auth.EmailAuthProvider.credential(u.email, mdp));
      } catch (e) {
        if (['auth/invalid-credential', 'auth/wrong-password'].includes(codeErreur(e))) {
          noter(e);
          throw new ErreurCompte('terramemo/mdp-faux');
        }
        throw e;
      }
      return;
    }
    if (!f.includes('google.com')) throw new ErreurCompte('terramemo/sans-compte');
    if (!natif()) {
      await auth.reauthenticateWithPopup(u, new auth.GoogleAuthProvider());
      return;
    }
    if (!o.jetonGoogle) throw new ErreurCompte('terramemo/google-apk');
    await auth.reauthenticateWithCredential(u, auth.GoogleAuthProvider.credential(await o.jetonGoogle()));
  }

  /**
   * Étapes 3 et 4 : la demande de retrait des places du pseudo (D27 b) et la
   * pierre tombale, dans un seul lot d'écriture (les règles de demandes/
   * exigent la pierre tombale avec elle) ; sautées si la pierre tombale est
   * déjà posée. Le pseudo : celui du profil, sinon celui de l'appareil.
   */
  async function poserTombe(s: Service, uid: string): Promise<void> {
    const { fs } = s.m;
    const lu = await lireProfil(s, uid);
    if (lu.supprime) return;
    const ici = lireLocal(stockage()).pseudo;
    const pseudo = (lu.pseudo !== null ? pseudoValide(lu.pseudo) : null) ?? (ici ? pseudoValide(ici) : null);
    const b = fs.writeBatch(s.db);
    if (pseudo) b.set(fs.doc(s.db, 'demandes', uid), { pseudo, cree: fs.serverTimestamp() });
    b.set(fs.doc(s.db, 'joueurs', uid), { v: V_PROFIL, maj: fs.serverTimestamp(), supprime: true });
    await b.commit();
  }

  /** Étape 5 : les lots du compte, par pages de 400 (une lecture, puis un lot d'écriture), jusqu'à une page vide. */
  async function supprimerLots(s: Service, uid: string): Promise<void> {
    const { fs } = s.m;
    const lots = fs.collection(s.db, 'joueurs', uid, 'lots');
    for (;;) {
      const page = await fs.getDocs(fs.query(lots, fs.limit(PAGE_SUPPRESSION)));
      if (page.empty) return;
      const b = fs.writeBatch(s.db);
      for (const d of page.docs) b.delete(d.ref);
      await b.commit();
    }
  }

  return {
    etat: () => suivi(etat),

    creer: (adresse, mdp, choisir) =>
      suivi(async () => {
        const a = adresse.trim();
        if (!a) throw new ErreurCompte('auth/missing-email');
        verifierMdp(mdp);
        const s = await service();
        surveiller(s);
        const { auth } = s.m;
        await sansSuppression();
        const ses = await finirEffacement();
        if (estCompte(s.a.currentUser) && s.a.currentUser!.uid === ses.uid && !ses.deconnexion) throw new ErreurCompte('terramemo/deja-connecte');
        // Un compte d'une question tuée : lâché, jamais lié (linkWithCredential ne vaut que pour un anonyme).
        await lacherCompteNonPris(s, ses);
        const avant = s.a.currentUser;
        // Un invité lie son journal au compte neuf, sans question (lien, pas copie : § 2.2). Une session
        // perdue d'un autre compte : la question d'abord (§ 2.5), avant de rien créer ; l'effacement de
        // « Ne pas les ajouter » seulement une fois le compte créé (une création ratée laisse l'appareil
        // intact), comme dans connecter().
        let fusion: ResultatFusion = 'sans_question';
        let choix: ChoixFusion = 'ajouter';
        const q = ses.uid ? await question(null, ses) : null;
        if (q) {
          choix = choisir ? await choisir(q) : 'ajouter';
          if (choix === 'annuler') throw new ErreurCompte('terramemo/connexion-annulee');
          fusion = choix === 'effacer' ? 'efface' : 'ajoute';
        }
        let u: import('firebase/auth').User;
        let profil: ResultatProfil;
        questionIci = !!q;
        try {
          // Appli tuée entre la création et la prise du compte : la page suivante ne le prend pas.
          if (q) await ecrireSession({ connexion: maintenant() });
          // Lien de l'anonyme : même uid (§ 2.2) ; sans anonyme, la création donne un uid.
          u = avant ? await lier(s, avant, a, mdp) : (await auth.createUserWithEmailAndPassword(s.a, a, mdp)).user;
          try {
            if (choix === 'effacer') await effacerTout([ses.uid]);
            profil = await connecte(u, true);
          } catch (e) {
            // Après une question, un échec avant que la session ait pris le compte neuf : lâché.
            if (q && (await lireSession()).uid !== u.uid) await auth.signOut(s.a).catch(noter);
            throw e;
          }
        } finally {
          questionIci = false;
          if (q) await modifierSession((x) => (x.connexion !== null ? { connexion: null } : null));
        }
        let verification = true;
        try {
          await auth.sendEmailVerification(u);
        } catch (e) {
          // Non bloquante (D18 b) : le compte est créé, l'e-mail se renvoie depuis la vue Compte.
          noter(e);
          verification = false;
        }
        prevenir();
        return { adresse: u.email ?? a, verification, profil, fusion };
      }),

    connecter: (adresse, mdp, choisir) =>
      suivi(async () => {
        const a = adresse.trim();
        if (!a) throw new ErreurCompte('auth/missing-email');
        if (!mdp) throw new ErreurCompte('auth/missing-password');
        const s = await service();
        surveiller(s);
        await sansSuppression();
        const avant = await finirEffacement();
        const courant = s.a.currentUser;
        if (estCompte(courant) && avant.uid === courant!.uid && !avant.deconnexion) throw new ErreurCompte('terramemo/deja-connecte');
        // Un compte d'une question tuée, encore connecté : lâché d'abord. Sinon un signIn raté (mot de
        // passe faux, réseau) le laisserait connecté, la question levée, et la réparation d'etat() le
        // prendrait sans réponse.
        await lacherCompteNonPris(s, avant);
        // § 2.3 : le compte est connecté pour connaître son uid, mais la session ne le prend qu'après
        // la réponse (pourSynchro n'envoie qu'au compte de la session). Appli tuée pendant la
        // question : `connexion` dit à la page suivante de ne pas le prendre.
        questionIci = true;
        try {
          await ecrireSession({ connexion: maintenant() });
          const { user } = await s.m.auth.signInWithEmailAndPassword(s.a, a, mdp);
          try {
            const q = await question(user.uid, avant);
            const choix = q ? (choisir ? await choisir(q) : 'ajouter') : 'ajouter';
            // L'état d'avant revient (invité, session perdue) : rien n'est parti, rien n'est effacé.
            if (choix === 'annuler') throw new ErreurCompte('terramemo/connexion-annulee');
            // « Ne pas les ajouter » : effacés maintenant, avant la restauration (§ 2.3, étape 3).
            if (choix === 'effacer') await effacerTout([avant.uid, user.uid]);
            const profil = await connecte(user);
            prevenir();
            const fusion: ResultatFusion = !q ? 'sans_question' : choix === 'effacer' ? 'efface' : 'ajoute';
            return { adresse: user.email ?? a, profil, fusion, reponses: q && choix === 'ajouter' ? q.reponses : 0 };
          } catch (e) {
            // « Annuler », ou un échec avant que la session ait pris le compte (effacement, lecture du
            // journal) : le compte est lâché, comme s'il n'avait jamais été connecté. Sans quoi la
            // réparation d'etat() le prendrait sans réponse.
            if ((await lireSession()).uid !== user.uid) await s.m.auth.signOut(s.a).catch(noter);
            throw e;
          }
        } finally {
          questionIci = false;
          await modifierSession((x) => (x.connexion !== null ? { connexion: null } : null));
          prevenir();
        }
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

    deconnecter: (o = {}) =>
      suivi(async (): Promise<ResultatDeconnexion> => {
        const s = await service();
        const ses = await lireSession();
        const u = s.a.currentUser;
        const uid = ses.uid ?? (estCompte(u) ? u!.uid : null);
        // 1. Ce qui attend part d'abord (lots, profil) ; 2. s'il reste quelque chose, rien sans « quand même ».
        if (!o.quandMeme && uid && estCompte(u) && u!.uid === uid) {
          const reste = await appareil.envoyerTout(uid);
          if ((await lireSession()).profil_a_ecrire) await synchroniserProfil('ecrire');
          const profil = !(await lireSession()).profil_a_ecrire;
          if (reste.nonEnvoyees > 0 || !profil) return { fait: false, nonEnvoyees: reste.nonEnvoyees, refusees: reste.refusees, profil };
        }
        deconnexionIci = true;
        try {
          // 3. Reprenable : appli tuée après ici, la page suivante finit le signOut (etat()) et
          // l'effacement (main.ts, avant de lire le journal).
          await ecrireSession({ deconnexion: 'voulue', effacement: uid });
          await s.m.auth.signOut(s.a);
          rapport.jeton = null;
          poserEtatCompte('invite');
          // 5. Le journal, l'état d'envoi de ce compte, le pseudo et les records.
          try {
            await effacerTout([uid]);
          } catch (e) {
            noter(e);
            throw new ErreurCompte('terramemo/effacement-inacheve');
          }
          // 6. Invité vierge.
          await ecrireSession({ ...APRES_EFFACEMENT, deconnexion: null });
        } finally {
          deconnexionIci = false;
          prevenir();
        }
        return { fait: true };
      }),

    effacerAppareil: () =>
      suivi(async () => {
        const ses = await lireSession();
        const s = await service();
        if (estCompte(s.a.currentUser) && s.a.currentUser!.uid === ses.uid && !ses.deconnexion) throw new ErreurCompte('terramemo/deja-connecte');
        // Un compte d'une question tuée, encore connecté : lâché d'abord (sinon, la question levée,
        // la réparation d'etat() le prendrait sans réponse).
        await lacherCompteNonPris(s, ses);
        // Reprenable comme la déconnexion : `effacement` posé d'abord.
        if (ses.uid) await ecrireSession({ effacement: ses.uid });
        try {
          await effacerTout([ses.uid]);
        } catch (e) {
          noter(e);
          throw new ErreurCompte('terramemo/effacement-inacheve');
        }
        await ecrireSession({ ...APRES_EFFACEMENT, deconnexion: null });
        poserEtatCompte('invite');
        prevenir();
      }),

    reponsesAppareil: () => appareil.reponsesHorsCompte(null),

    async pourExport() {
      const ses = await lireSession();
      // Un invité (anonyme compris) : son journal seulement, sans « compte ».
      if (!ses.uid) return { compte: null, profil: null };
      let s: Service | null = null;
      try {
        s = await service();
      } catch (e) {
        noter(e);
      }
      const u = s?.a.currentUser ?? null;
      const connecte = !!s && estCompte(u) && u!.uid === ses.uid && !ses.deconnexion;
      const creation = connecte ? new Date(u!.metadata.creationTime ?? '') : null;
      const compte: CompteExport = {
        uid: ses.uid,
        adresse: connecte ? u!.email : ses.adresse,
        fournisseurs: connecte ? fournisseursDe(u!) : [...ses.fournisseurs],
        cree_le: creation && !Number.isNaN(creation.getTime()) ? creation.toISOString() : null,
      };
      let profil: ProfilExport | null = null;
      if (connecte && !coupee()) {
        try {
          const lu = await lireProfil(s!, ses.uid);
          if (lu.existe && !lu.supprime) profil = { pseudo: lu.pseudo, records: Object.fromEntries(lireRecordsProfil(lu.records)) };
        } catch (e) {
          // Hors ligne, ou joueurs/ fermé par les règles : l'export se fait sans le profil en ligne.
          noter(e);
        }
      }
      return { compte, profil };
    },

    marques: () => ({
      lire: async (uid) => {
        const ses = await lireSession();
        return ses.uid === uid ? ses.marque : null;
      },
      // Seulement pour le compte de la session : un autre compte a pu se connecter pendant la lecture.
      poser: (uid, marque) => modifierSession((x) => (x.uid === uid ? { marque } : null)),
    }),

    supprimer: (c) =>
      suivi(async () => {
        if (c.mot.trim().toLocaleLowerCase('fr') !== MOT_SUPPRESSION) throw new ErreurCompte('terramemo/suppression-mot');
        const s = await service();
        surveiller(s);
        const ses = await lireSession();
        const u = s.a.currentUser;
        // Le compte de la session, ou celui d'une suppression en cours ; jamais un compte pris
        // pendant une question de fusion (D22), que la session n'a pas.
        const uid = ses.suppression ?? (estCompte(u) && u!.uid === ses.uid && !ses.deconnexion ? u!.uid : null);
        if (!uid) throw new ErreurCompte('terramemo/sans-compte');
        let present = estCompte(u) && u!.uid === uid;
        if (present) {
          try {
            // Déjà supprimé dans Auth (deleteUser fait, appli tuée avant l'effacement) : USER_NOT_FOUND.
            await u!.reload();
          } catch (e) {
            if (!compteDisparu(e)) throw e;
            noter(e);
            present = false;
          }
        }
        if (present && s.a.currentUser === u) {
          // 1. Réauthentifier ; 2. plus rien ne part de cet appareil (pourSynchro, profil).
          await reauthentifier(s, u!, c.mdp);
          await ecrireSession({ suppression: uid });
          prevenir();
          // 3 et 4. Demande de retrait des places et pierre tombale ; 5. les lots.
          await poserTombe(s, uid);
          await supprimerLots(s, uid);
          // 6. Le compte, dans Auth (le SDK se déconnecte ensuite).
          try {
            await s.m.auth.deleteUser(u!);
          } catch (e) {
            if (!compteDisparu(e)) throw e;
            noter(e);
          }
        } else if (!ses.suppression) throw new ErreurCompte('terramemo/sans-compte');
        // 7. L'appareil effacé comme à la déconnexion (§ 3.4), reprenable au démarrage (`effacement`).
        await ecrireSession({ suppression: uid, effacement: uid });
        rapport.jeton = null;
        tombeVue = null;
        try {
          await effacerTout([uid]);
        } catch (e) {
          noter(e);
          prevenir();
          throw new ErreurCompte('terramemo/effacement-inacheve');
        }
        await ecrireSession({ ...APRES_EFFACEMENT, deconnexion: null });
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
      // Un compte connecté que la session n'a pas pris (question de fusion en cours, D22) : rien ne part.
      if (!u || !estCompte(u) || u.uid !== ses.uid) return null;
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
      if (s.a.currentUser !== u) return null;
      // Vérifiée au sens des règles : d'après le jeton (rafraîchi par verifierJeton, ou pas encore).
      let verifiee = false;
      try {
        verifiee = (await u.getIdTokenResult()).claims.email_verified === true;
      } catch (e) {
        noter(e);
      }
      return { uid: u.uid, service: s, verifiee };
    },

    surJeton(f) {
      jetons.add(f);
      return () => jetons.delete(f);
    },

    demarrer: () =>
      suivi(async () => {
        const e = await etat();
        ecouterReseau();
        // À chaque ouverture : le profil relu (1 lecture), fusionné, écrit s'il le faut. Une pierre
        // tombale y est vue (suppression lancée ailleurs, § 7.1).
        if (e.etat !== 'compte') return e;
        const p = await synchroniserProfil();
        return p.etat === 'supprime' ? { ...e, supprime: true } : e;
      }),

    rapport: () => structuredClone(rapport),
  };
}

let unique: Comptes | null = null;

/**
 * Les comptes de la page (une instance, la session de terramemo-synchro). Le
 * premier appel fixe les options (main.ts : l'appareil, toujours le même).
 */
export function comptes(version = '', o: Omit<OptionsComptes, 'version'> = {}): Comptes {
  unique ??= creerComptes({ ...o, version });
  return unique;
}
