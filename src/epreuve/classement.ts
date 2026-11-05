// Classement en ligne du Chrono (#14, décision « Classements ») : Firestore
// (version lite : requêtes simples, sans cache ni temps réel, ~6 fois plus
// légère) et Auth anonyme de Firebase, chargés à la demande (import
// dynamique) pour que la carte n'attende jamais le SDK. Règles : firestore.rules. Chemin d'un
// score : classements/{epreuve}/periodes/{toujours | sNNNN}/scores/{uid}.
import type { ScoreEpreuve } from './bareme';
import { VERSION_BAREME } from './chrono';

/** Configuration publique de l'appli web du projet terramemo-geo (rien de secret). */
const CONFIG = {
  apiKey: 'AIzaSyDfBmTsvoNUg77tjTCVYrfPcWa610B8YiM',
  authDomain: 'terramemo-geo.firebaseapp.com',
  projectId: 'terramemo-geo',
  storageBucket: 'terramemo-geo.firebasestorage.app',
  messagingSenderId: '982564163014',
  appId: '1:982564163014:web:756f89b5b0f6428700b6c7',
};

/** Épreuve du classement général (somme des records de toutes les épreuves). */
export const GENERAL = 'general';

export interface Place {
  uid: string;
  pseudo: string;
  points: number;
  justes: number;
  questions: number;
  temps_ms: number;
}

export interface Tableau {
  /** Les premiers, dans l'ordre du classement. */
  places: Place[];
  /** Ma place si j'en ai une, et mon rang (1 = premier). */
  moi: Place | null;
  rang: number | null;
  /** Nombre de joueurs classés. */
  joueurs: number;
}

type Modules = {
  auth: typeof import('firebase/auth');
  fs: typeof import('firebase/firestore/lite');
};
interface Service {
  m: Modules;
  db: import('firebase/firestore/lite').Firestore;
  a: import('firebase/auth').Auth;
}

let service: Promise<Service> | null = null;

/**
 * Firebase prêt (SDK chargé à la première demande). `?emulateurs` (serveur
 * de dev seulement) : les émulateurs de firebase.json (Auth 8063, Firestore 8062).
 */
function charger(): Promise<Service> {
  service ??= (async () => {
    const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore/lite')]);
    const app = initializeApp(CONFIG);
    const a = auth.getAuth(app);
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
 * Le compte du joueur : celui que le navigateur garde, sinon un compte
 * anonyme créé seulement pour publier (lire un classement n'en crée pas).
 * Une seule création à la fois : les publications d'une partie partent
 * ensemble, et chacune créait son compte (le dernier gagnait, les autres
 * écritures étaient refusées).
 */
async function compte(s: Service, creer: boolean): Promise<string | null> {
  if (s.a.currentUser) return s.a.currentUser.uid;
  if (!creer) return null;
  creation ??= s.m.auth.signInAnonymously(s.a).then((c) => c.user.uid);
  creation.catch(() => {
    creation = null;
  });
  return creation;
}

const scores = (s: Service, epreuve: string, periode: string) => s.m.fs.collection(s.db, 'classements', epreuve, 'periodes', periode, 'scores');

/**
 * Publie un score ; false si les règles le refusent (il ne bat pas celui
 * déjà publié, ou n'est pas vraisemblable). Lève hors ligne.
 */
export async function publier(epreuve: string, periode: string, pseudo: string, score: ScoreEpreuve): Promise<boolean> {
  const s = await charger();
  const uid = await compte(s, true);
  if (!uid) return false;
  try {
    await s.m.fs.setDoc(s.m.fs.doc(scores(s, epreuve, periode), uid), {
      pseudo,
      points: Math.round(score.points),
      justes: score.justes,
      questions: score.questions,
      temps_ms: Math.round(score.temps_ms),
      date: s.m.fs.serverTimestamp(),
      bareme: VERSION_BAREME,
    });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied') return false;
    throw e;
  }
}

function enPlace(id: string, d: Record<string, unknown>): Place {
  return {
    uid: id,
    pseudo: String(d.pseudo ?? ''),
    points: Number(d.points ?? 0),
    justes: Number(d.justes ?? 0),
    questions: Number(d.questions ?? 0),
    temps_ms: Number(d.temps_ms ?? 0),
  };
}

/**
 * Les `n` premiers d'un classement, ma place et mon rang (sans compte : les
 * premiers seuls). Coût : n lectures, plus 1 pour le nombre de joueurs, plus
 * 3 (ma place, deux comptes) si je suis hors des n.
 */
export async function lireTableau(epreuve: string, periode: string, n = 10): Promise<Tableau> {
  const s = await charger();
  const uid = await compte(s, false);
  const { fs } = s.m;
  const col = scores(s, epreuve, periode);
  const [premiers, total] = await Promise.all([
    fs.getDocs(fs.query(col, fs.orderBy('points', 'desc'), fs.orderBy('temps_ms', 'asc'), fs.limit(n))),
    fs.getCount(col),
  ]);
  const places = premiers.docs.map((d) => enPlace(d.id, d.data()));
  const i = places.findIndex((p) => p.uid === uid);
  if (i >= 0) return { places, moi: places[i] ?? null, rang: i + 1, joueurs: total.data().count };
  if (!uid) return { places, moi: null, rang: null, joueurs: total.data().count };
  const mien = await fs.getDoc(fs.doc(col, uid));
  if (!mien.exists()) return { places, moi: null, rang: null, joueurs: total.data().count };
  const moi = enPlace(mien.id, mien.data());
  const [devant, egaux] = await Promise.all([
    fs.getCount(fs.query(col, fs.where('points', '>', moi.points))),
    fs.getCount(fs.query(col, fs.where('points', '==', moi.points), fs.where('temps_ms', '<', moi.temps_ms))),
  ]);
  return { places, moi, rang: devant.data().count + egaux.data().count + 1, joueurs: total.data().count };
}
