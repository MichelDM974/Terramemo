// Firebase partagé (J1b, docs/etudes/2026-11-07-j1b-conception.md, § 1 et
// lot 0) : le SDK chargé à la demande (import dynamique), pour que la carte
// n'attende jamais, puis gardé pour toute la page. Les classements (#14,
// src/epreuve/classement.ts) s'en servent depuis le J1a ; les comptes et la
// synchro du J1b s'y brancheront. Firestore en version lite : requêtes
// simples, sans cache ni temps réel, ~6 fois plus légère, avec runTransaction
// et writeBatch. Auth : firebase/auth entier ; getAuth() est gardé au J1b
// (§ 4.2 : sa persistance IndexedDB, firebaseLocalStorageDb, est celle de
// l'APK installé).

/** Configuration publique de l'appli web du projet terramemo-geo (rien de secret). */
const CONFIG = {
  apiKey: 'AIzaSyDfBmTsvoNUg77tjTCVYrfPcWa610B8YiM',
  authDomain: 'terramemo-geo.firebaseapp.com',
  projectId: 'terramemo-geo',
  storageBucket: 'terramemo-geo.firebasestorage.app',
  messagingSenderId: '982564163014',
  appId: '1:982564163014:web:756f89b5b0f6428700b6c7',
};

/**
 * Le client OAuth web du projet (public, comme la configuration), que le
 * plugin Google de l'APK reçoit (src/sync/google-apk.ts, étude du J1b, § 4.2) :
 * l'audience de l'idToken que Firebase vérifie. Le client Android
 * (982564163014-kmfrtojt…, créé par Firebase avec l'appli Android
 * io.github.micheldm974.terramemo et la SHA-1 de la clé unique, S2) n'est
 * jamais passé : Google le retrouve par le paquet et la signature de l'APK.
 */
export const ID_CLIENT_WEB = '982564163014-cpvnjv34131m5hjv8rgvk67dfedg01ae.apps.googleusercontent.com';

/**
 * Langue des e-mails de Firebase (vérification d'adresse, mot de passe
 * oublié) et de ses écrans : celle de l'interface (décision « Langue » :
 * français au départ).
 */
export const LANGUE_AUTH = 'fr';

type Modules = {
  auth: typeof import('firebase/auth');
  fs: typeof import('firebase/firestore/lite');
};
export interface Service {
  m: Modules;
  db: import('firebase/firestore/lite').Firestore;
  a: import('firebase/auth').Auth;
}

let service: Promise<Service> | null = null;

/**
 * Le code de l'erreur que rend charger() quand les morceaux du SDK n'ont pas
 * pu se télécharger (hors ligne) : l'erreur du navigateur n'a pas de code,
 * et son message change d'un navigateur à l'autre. Toute erreur sans code
 * de charger() le reçoit (rien d'autre n'y lève en pratique : configuration
 * fixe) ; une erreur de Firebase garde le sien. Le message d'origine reste.
 */
export const SDK_INDISPONIBLE = 'terramemo/sdk-indisponible';

/**
 * Firebase prêt (SDK chargé à la première demande). `?emulateurs` (serveur
 * de dev seulement) : les émulateurs de firebase.json (Auth 8063, Firestore 8062).
 */
export function charger(): Promise<Service> {
  service ??= (async () => {
    const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore/lite')]);
    const app = initializeApp(CONFIG);
    const a = auth.getAuth(app);
    a.languageCode = LANGUE_AUTH;
    const db = fs.getFirestore(app);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('emulateurs')) {
      auth.connectAuthEmulator(a, 'http://127.0.0.1:8063', { disableWarnings: true });
      fs.connectFirestoreEmulator(db, '127.0.0.1', 8062);
    }
    await a.authStateReady();
    return { m: { auth, fs }, db, a };
  })().catch((e: unknown) => {
    if (typeof (e as { code?: unknown } | null)?.code === 'string') throw e;
    throw Object.assign(new Error(e instanceof Error ? e.message : String(e), { cause: e }), { code: SDK_INDISPONIBLE });
  });
  // Un échec (hors ligne) ne reste pas en cache : la prochaine demande réessaie.
  service.catch(() => {
    service = null;
  });
  return service;
}

/** Le SDK a-t-il été demandé (charger) ? Le pilote vérifie qu'un invité ne le charge pas (window.terramemo.sdkDemande). */
export const sdkDemande = (): boolean => service !== null;

let creation: Promise<string> | null = null;

/**
 * Un compte qui n'existe plus côté serveur, vu au rafraîchissement de son
 * jeton ou à son lien : USER_NOT_FOUND donne `auth/user-token-expired` (le
 * SDK se déconnecte alors seul) ; l'émulateur Auth répond
 * INVALID_REFRESH_TOKEN (le SDK reste connecté, à un compte qui ne sert
 * plus). Pas `auth/network-request-failed` : hors ligne, le compte reste.
 */
const CODES_COMPTE_DISPARU: ReadonlySet<string> = new Set(['auth/user-token-expired', 'auth/invalid-refresh-token', 'auth/user-not-found', 'auth/invalid-user-token']);

export function compteDisparu(e: unknown): boolean {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' && CODES_COMPTE_DISPARU.has(c);
}

/**
 * Les erreurs du réseau, qu'un nouvel essai plus tard peut faire passer
 * (#25) : SDK pas téléchargé, Auth sans réseau, Firestore injoignable.
 * Firestore lite rend `unknown` quand fetch lui-même échoue (hors ligne :
 * l'erreur n'a pas de statut HTTP, mapCodeFromHttpStatus) et pour un HTTP
 * 500 ; `unavailable` pour un 503, `deadline-exceeded` pour un 504. Pas un
 * quota épuisé (`resource-exhausted`), ni une connexion anonyme refusée
 * (`auth/too-many-requests`, `auth/admin-restricted-operation`) : en
 * ligne, réessayer à chaque retour au premier plan n'y changerait rien.
 * Une erreur sans code (SyntaxError d'une page HTML de portail captif
 * rendue en 200) n'arrive pas jusqu'ici : Firestore lite en fait un
 * `unknown` (invokeRPC : tout ce qui n'est pas une FirebaseError) et Auth
 * un `auth/network-request-failed` (_performFetchWithErrorHandling). Sans
 * code, c'est donc un bogue de l'appli : il ne reste pas en file.
 */
const CODES_RESEAU: ReadonlySet<string> = new Set([SDK_INDISPONIBLE, 'auth/network-request-failed', 'unavailable', 'deadline-exceeded', 'unknown']);

export function erreurReseau(e: unknown): boolean {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' && CODES_RESEAU.has(c);
}

/**
 * Le compte du joueur : celui que le navigateur garde, sinon un compte
 * anonyme créé seulement pour publier (lire un classement n'en crée pas) ;
 * les règles n'acceptent un score que d'un compte. Une seule création à la
 * fois : les publications d'une partie partent ensemble, et chacune créait
 * son compte. La création finie (currentUser posé) ou échouée n'est pas
 * gardée : après une déconnexion, la publication suivante crée un anonyme
 * neuf au lieu de rendre l'uid d'avant, sans session.
 *
 * Un invité anonyme supprimé par Firebase (30 jours après sa création :
 * Identity Platform, autodeleteAnonymousUsers) : son jeton périmé ne se
 * rafraîchit plus, et il est remplacé par un anonyme neuf. Rien n'est en
 * ligne sous son uid (D16), et ses places au classement sont celles du
 * pseudo. Encore valable (moins d'une heure), son jeton suffit à Firestore,
 * qui ne demande pas si le compte existe. Un jeton en cache ne coûte aucune
 * requête ; un échec du réseau remonte (hors ligne).
 */
export async function compte(s: Service): Promise<string> {
  const u = s.a.currentUser;
  if (u && !u.isAnonymous) return u.uid;
  if (u) {
    try {
      await u.getIdToken();
      return u.uid;
    } catch (e) {
      if (!compteDisparu(e)) throw e;
      if (s.a.currentUser === u) await s.m.auth.signOut(s.a);
    }
  }
  // Une autre publication a pu recréer l'invité pendant ce temps.
  if (s.a.currentUser) return s.a.currentUser.uid;
  const p = (creation ??= s.m.auth.signInAnonymously(s.a).then((c) => c.user.uid));
  const oublier = () => {
    if (creation === p) creation = null;
  };
  p.then(oublier, oublier);
  return p;
}

/**
 * L'uid du compte que le navigateur garde (anonyme compris), ou null s'il
 * n'y en a pas : contrairement à compte(), n'en crée jamais. Charge le SDK
 * s'il ne l'est pas ; lève hors ligne comme charger().
 */
export async function uid(): Promise<string | null> {
  const s = await charger();
  return s.a.currentUser?.uid ?? null;
}
