// Classement en ligne du Chrono (#14, décision « Classements ») : Firestore
// (version lite : requêtes simples, sans cache ni temps réel, ~6 fois plus
// légère) et Auth anonyme de Firebase, chargés à la demande (import
// dynamique) pour que la carte n'attende jamais le SDK. Règles : firestore.rules. Chemin d'un
// score : classements/{epreuve}/periodes/{toujours | sNNNN}/scores/{clé du pseudo}.
// Une place par pseudo (décision du même nom) : tous les appareils qui jouent
// sous un pseudo partagent sa place, qui garde le meilleur score.
import { comparerScores, type ScoreEpreuve } from './bareme';
import { clePseudo, EPREUVES, VERSION_BAREME } from './chrono';

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
  /** Clé du pseudo (clePseudo), nom du document. */
  cle: string;
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
 * anonyme créé seulement pour publier (lire un classement n'en crée pas) ;
 * les règles n'acceptent un score que d'un compte. Une seule création à la
 * fois : les publications d'une partie partent ensemble, et chacune créait
 * son compte.
 */
async function compte(s: Service): Promise<string> {
  if (s.a.currentUser) return s.a.currentUser.uid;
  creation ??= s.m.auth.signInAnonymously(s.a).then((c) => c.user.uid);
  creation.catch(() => {
    creation = null;
  });
  return creation;
}

const scores = (s: Service, epreuve: string, periode: string) => s.m.fs.collection(s.db, 'classements', epreuve, 'periodes', periode, 'scores');

/**
 * Publie un score à la place du pseudo. true : la place a ce score, ou déjà
 * mieux (un autre appareil du même pseudo l'a battu, ce n'est pas un refus) ;
 * false si les règles le refusent (pas vraisemblable). Lève hors ligne.
 */
export async function publier(epreuve: string, periode: string, pseudo: string, score: ScoreEpreuve): Promise<boolean> {
  const s = await charger();
  await compte(s);
  const ref = s.m.fs.doc(scores(s, epreuve, periode), clePseudo(pseudo));
  const envoi = { points: Math.round(score.points), justes: score.justes, questions: score.questions, temps_ms: Math.round(score.temps_ms) };
  try {
    await s.m.fs.setDoc(ref, { pseudo, ...envoi, date: s.m.fs.serverTimestamp(), bareme: VERSION_BAREME });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code !== 'permission-denied') throw e;
  }
  // Refusé : seulement une lecture de plus, pour savoir si la place avait déjà mieux.
  const place = await s.m.fs.getDoc(ref);
  return place.exists() && comparerScores(enPlace(place.id, place.data()), envoi) <= 0;
}

/**
 * Les places d'un pseudo dans chaque épreuve pour une période (épreuve →
 * score) : ce que ses autres appareils ont publié, que le général additionne
 * (totalGeneral). Une lecture par épreuve. Lève hors ligne.
 */
export async function placesDuPseudo(periode: string, pseudo: string): Promise<Map<string, ScoreEpreuve>> {
  const s = await charger();
  const cle = clePseudo(pseudo);
  const lus = await Promise.all(EPREUVES.map(async (e) => [e, await s.m.fs.getDoc(s.m.fs.doc(scores(s, e, periode), cle))] as const));
  const places = new Map<string, ScoreEpreuve>();
  for (const [e, d] of lus) {
    if (!d.exists()) continue;
    const { points, justes, questions, temps_ms } = enPlace(d.id, d.data());
    places.set(e, { points, justes, questions, temps_ms });
  }
  return places;
}

function enPlace(id: string, d: Record<string, unknown>): Place {
  return {
    cle: id,
    pseudo: String(d.pseudo ?? ''),
    points: Number(d.points ?? 0),
    justes: Number(d.justes ?? 0),
    questions: Number(d.questions ?? 0),
    temps_ms: Number(d.temps_ms ?? 0),
  };
}

/**
 * Les `n` premiers d'un classement, la place de mon pseudo et son rang (sans
 * pseudo : les premiers seuls). Coût : n lectures, plus 1 pour le nombre de
 * joueurs, plus 3 (ma place, deux comptes) si je suis hors des n.
 */
export async function lireTableau(epreuve: string, periode: string, pseudo: string | null, n = 10): Promise<Tableau> {
  const s = await charger();
  const cle = pseudo === null ? null : clePseudo(pseudo);
  const { fs } = s.m;
  const col = scores(s, epreuve, periode);
  const [premiers, total] = await Promise.all([
    fs.getDocs(fs.query(col, fs.orderBy('points', 'desc'), fs.orderBy('temps_ms', 'asc'), fs.limit(n))),
    fs.getCount(col),
  ]);
  const places = premiers.docs.map((d) => enPlace(d.id, d.data()));
  const i = places.findIndex((p) => p.cle === cle);
  if (i >= 0) return { places, moi: places[i] ?? null, rang: i + 1, joueurs: total.data().count };
  if (cle === null) return { places, moi: null, rang: null, joueurs: total.data().count };
  const mien = await fs.getDoc(fs.doc(col, cle));
  if (!mien.exists()) return { places, moi: null, rang: null, joueurs: total.data().count };
  const moi = enPlace(mien.id, mien.data());
  const [devant, egaux] = await Promise.all([
    fs.getCount(fs.query(col, fs.where('points', '>', moi.points))),
    fs.getCount(fs.query(col, fs.where('points', '==', moi.points), fs.where('temps_ms', '<', moi.temps_ms))),
  ]);
  return { places, moi, rang: devant.data().count + egaux.data().count + 1, joueurs: total.data().count };
}
