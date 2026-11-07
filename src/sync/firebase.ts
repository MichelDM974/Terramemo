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
  })();
  // Un échec (hors ligne) ne reste pas en cache : la prochaine demande réessaie.
  service.catch(() => {
    service = null;
  });
  return service;
}

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
