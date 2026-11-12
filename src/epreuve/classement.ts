// Classements en ligne des épreuves (#14, décisions « Classements », « Barème
// et classements ») : Firestore lite et Auth anonyme de Firebase, chargés à
// la demande par src/sync/firebase.ts (charger, compte), pour que la carte
// n'attende jamais le SDK. Règles : firestore.rules. Chemin d'un
// score : classements/{epreuve}/periodes/{toujours | sNNNN}/scores/{clé du pseudo}.
// Une place par pseudo (décision du même nom) : tous les appareils qui jouent
// sous un pseudo partagent sa place, qui garde le meilleur score.
import { charger, compte, type Service } from '../sync/firebase';
import { comparerScores, type ScoreEpreuve } from './bareme';
import { BAREME_1, clePseudo, epreuvesDuGeneral, pointsV2, VERSION_BAREME } from './chrono';

/** Épreuve du classement général (somme des records de toutes les épreuves du Chrono). */
export const GENERAL = 'general';

export interface Place {
  /** Clé du pseudo (clePseudo), nom du document. */
  cle: string;
  pseudo: string;
  /** Les justes (barème 2) ; une place du barème 1 est convertie à la lecture (enPlace). */
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
 * Les places d'un pseudo dans chaque épreuve du Chrono pour une période
 * (épreuve → score) : ce que ses autres appareils ont publié, que le général
 * additionne (totalGeneral). Une lecture par épreuve du général
 * (epreuvesDuGeneral). Lève hors ligne.
 */
export async function placesDuPseudo(periode: string, pseudo: string): Promise<Map<string, ScoreEpreuve>> {
  const s = await charger();
  const cle = clePseudo(pseudo);
  const lus = await Promise.all(epreuvesDuGeneral().map(async (e) => [e, await s.m.fs.getDoc(s.m.fs.doc(scores(s, e, periode), cle))] as const));
  const places = new Map<string, ScoreEpreuve>();
  for (const [e, d] of lus) {
    if (!d.exists()) continue;
    const { points, justes, questions, temps_ms } = enPlace(d.id, d.data());
    places.set(e, { points, justes, questions, temps_ms });
  }
  return places;
}

/**
 * Une place lue en ligne, au barème 2 : celle du barème 1 (`bareme: 1`, ou
 * sans barème) comptée en justes (pointsV2), comme la migration de l'outil
 * du propriétaire la réécrit (scripts/admin/taches.mjs, bareme) et comme les
 * règles la jugent (progresse) ; sinon le général additionnerait deux
 * échelles (totalGeneral) et une place d'avant semblerait imbattable.
 */
function enPlace(id: string, d: Record<string, unknown>): Place {
  const place: Place = {
    cle: id,
    pseudo: String(d.pseudo ?? ''),
    points: Number(d.points ?? 0),
    justes: Number(d.justes ?? 0),
    questions: Number(d.questions ?? 0),
    temps_ms: Number(d.temps_ms ?? 0),
  };
  return Number(d.bareme ?? BAREME_1) <= BAREME_1 ? pointsV2(place) : place;
}

type Scores = ReturnType<typeof scores>;

/**
 * Le rang d'une place (1 = premier) : ceux qui ont plus de points (de
 * justes), puis autant en moins de temps. Deux comptes.
 */
async function rangDe(s: Service, col: Scores, moi: Place): Promise<number> {
  const { fs } = s.m;
  const comptes = await Promise.all([
    fs.getCount(fs.query(col, fs.where('points', '>', moi.points))),
    fs.getCount(fs.query(col, fs.where('points', '==', moi.points), fs.where('temps_ms', '<', moi.temps_ms))),
  ]);
  return comptes.reduce((n, c) => n + c.data().count, 1);
}

/** Ma place dans un classement : la place, son rang et le nombre de joueurs classés. */
export interface MaPlace {
  epreuve: string;
  place: Place;
  rang: number;
  joueurs: number;
}

/**
 * Les places de mon pseudo pour une période dans ces classements (le général,
 * des épreuves), dans leur ordre, seulement ceux où il est classé. L'écran
 * des classements choisit lesquels lire (D52 b, src/vues/general.ts :
 * epreuvesALire). Coût : 1 lecture par classement demandé, plus 3 par place
 * (deux comptes pour le rang, un pour le nombre de joueurs).
 */
export async function mesPlaces(periode: string, pseudo: string, epreuves: readonly string[]): Promise<MaPlace[]> {
  if (!epreuves.length) return [];
  const s = await charger();
  const { fs } = s.m;
  const cle = clePseudo(pseudo);
  const lues = await Promise.all(
    epreuves.map(async (epreuve): Promise<MaPlace | null> => {
      const col = scores(s, epreuve, periode);
      const d = await fs.getDoc(fs.doc(col, cle));
      if (!d.exists()) return null;
      const place = enPlace(d.id, d.data());
      const [rang, total] = await Promise.all([rangDe(s, col, place), fs.getCount(col)]);
      return { epreuve, place, rang, joueurs: total.data().count };
    }),
  );
  return lues.filter((x): x is MaPlace => x !== null);
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
  const [premiers, total] = await Promise.all([fs.getDocs(fs.query(col, fs.orderBy('points', 'desc'), fs.orderBy('temps_ms', 'asc'), fs.limit(n))), fs.getCount(col)]);
  const places = premiers.docs.map((d) => enPlace(d.id, d.data()));
  const i = places.findIndex((p) => p.cle === cle);
  if (i >= 0) return { places, moi: places[i] ?? null, rang: i + 1, joueurs: total.data().count };
  if (cle === null) return { places, moi: null, rang: null, joueurs: total.data().count };
  const mien = await fs.getDoc(fs.doc(col, cle));
  if (!mien.exists()) return { places, moi: null, rang: null, joueurs: total.data().count };
  const moi = enPlace(mien.id, mien.data());
  return { places, moi, rang: await rangDe(s, col, moi), joueurs: total.data().count };
}
