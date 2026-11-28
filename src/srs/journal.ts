// Journal de la répétition espacée : des événements en ajout seul, la seule
// source de vérité (docs/plan.md, « Journal et synchro »). L'état FSRS s'en
// recalcule par rejeu (rejeu.ts) ; rien n'est jamais réécrit. Les noms de
// champs sont en ASCII (ils partent tels quels vers Firestore au lot 6).

import { analyser } from './fiches';
import type { Note } from './note';

export type TypeEvenement = 'reponse' | 'connu' | 'reinitialiser';
/** Étape qui a produit la réponse : QCM d'apprentissage, rappel (premier tour noté), révision, partie libre (hors FSRS). */
export type ModeEvenement = 'qcm' | 'rappel' | 'revision' | 'libre';
/** Comment la carte a désigné l'entité touchée : par son tracé, par sa pastille de micro-État, ou par proximité. */
export type Via = 'trace' | 'pastille' | 'proche';
/** Aide prise avant de répondre : « Voir », « Passer », « Je connais déjà ». */
export type Aide = 'voir' | 'passer' | 'connu';

export interface Evenement {
  v: 1;
  /** uuid de l'événement : clé de dédoublonnage du rejeu et de la synchro. */
  id: string;
  /** uuid de l'appareil qui l'a écrit. */
  appareil: string;
  /** Instant (ms depuis l'époque, UTC). */
  ts: number;
  /** Décalage local en minutes, à l'est positif (jour.ts) : le jour local se recalcule partout pareil. */
  tz: number;
  /** uuid de la séance, ou null hors séance (partie libre, réinitialisation). */
  seance: string | null;
  /**
   * reponse : une réponse à une fiche ; reinitialiser : la fiche repart à
   * neuf ; connu : réservé (« je connais déjà » sans le vérifier), aucun
   * effet au J1a — le bouton du J1a passe par un rappel noté (aide 'connu').
   */
  type: TypeEvenement;
  fiche: string;
  mode?: ModeEvenement;
  /**
   * Seulement si la réponse est fausse : l'id que la carte désigne au premier
   * toucher, ou le nom choisi au QCM (matrice des confusions). null si juste,
   * en mer ou passé : un toucher juste peut désigner un voisin (pastille du
   * Vatican sur l'Italie), qui serait une fausse confusion.
   */
  reponse?: string | null;
  via?: Via | null;
  /** Échelle de la carte au toucher (mesure du biais des pastilles au zoom faible). */
  zoom?: number | null;
  correct?: boolean;
  aide?: Aide | null;
  duree_ms?: number;
  /** Distance au bord de la cible (km), null sans toucher sur la sphère. */
  distance_km?: number | null;
  /**
   * Note FSRS figée à l'écriture (note.ts) ; null hors FSRS (QCM, partie
   * libre). Changer la règle de note plus tard ne réécrit pas le passé.
   */
  note?: Note | null;
  /**
   * La valeur estimée d'une question à curseur (Habitants, Superficies : étude
   * du J4, § 5 et D617 a), pour mesurer plus tard le calibrage ; absente
   * ailleurs. Un lot qui en porte une s'écrit au format v2 (sync/lots.ts).
   */
  estime?: number;
}

const TYPES: readonly string[] = ['reponse', 'connu', 'reinitialiser'];
const MODES: readonly string[] = ['qcm', 'rappel', 'revision', 'libre'];
const VIAS: readonly string[] = ['trace', 'pastille', 'proche'];
const AIDES: readonly string[] = ['voir', 'passer', 'connu'];
/** Modes dont les réponses entrent dans FSRS ; les autres ont une note null. */
export const MODES_NOTES: readonly ModeEvenement[] = ['rappel', 'revision'];

/** Longueur maximale d'un identifiant (uuid : 36). */
const LONGUEUR_ID = 64;
/** Fuseaux réels : de UTC−12 à UTC+14. */
const TZ_MIN = -12 * 60;
const TZ_MAX = 14 * 60;
/** Une réponse ne dure pas plus d'un jour (la vue borne bien avant). */
const DUREE_MAX_MS = 86_400_000;
/** Demi-tour de la Terre, arrondi au-dessus : aucune distance au bord ne le dépasse. */
const DISTANCE_MAX_KM = 20_100;
const ZOOM_MAX = 1e4;
/** Au-dessus de toute population (8,2 × 10⁹) et de toute superficie de pays (17,1 × 10⁶ km²). */
const ESTIME_MAX = 1e10;

const estId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= LONGUEUR_ID;
const entier = (x: unknown): x is number => Number.isSafeInteger(x);
const nombre = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const parmi = (x: unknown, liste: readonly string[]): boolean => typeof x === 'string' && liste.includes(x);

/** Ce qui ne va pas dans un événement (type et bornes), ou null s'il est valide. */
export function probleme(e: unknown): string | null {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return 'pas un objet';
  const o = e as Record<string, unknown>;
  if (o.v !== 1) return 'version';
  if (!estId(o.id)) return 'id';
  if (!estId(o.appareil)) return 'appareil';
  if (!entier(o.ts) || o.ts < 0) return 'ts';
  if (!entier(o.tz) || o.tz < TZ_MIN || o.tz > TZ_MAX) return 'tz';
  if (o.seance !== null && !estId(o.seance)) return 'seance';
  if (!parmi(o.type, TYPES)) return 'type';
  if (typeof o.fiche !== 'string' || !analyser(o.fiche)) return 'fiche';
  if (o.mode !== undefined && !parmi(o.mode, MODES)) return 'mode';
  if (o.reponse !== undefined && o.reponse !== null && !estId(o.reponse)) return 'reponse';
  if (o.via !== undefined && o.via !== null && !parmi(o.via, VIAS)) return 'via';
  if (o.zoom !== undefined && o.zoom !== null && !(nombre(o.zoom) && o.zoom > 0 && o.zoom <= ZOOM_MAX)) return 'zoom';
  if (o.correct !== undefined && typeof o.correct !== 'boolean') return 'correct';
  if (o.aide !== undefined && o.aide !== null && !parmi(o.aide, AIDES)) return 'aide';
  if (o.duree_ms !== undefined && !(entier(o.duree_ms) && o.duree_ms >= 0 && o.duree_ms <= DUREE_MAX_MS)) return 'duree_ms';
  if (o.distance_km !== undefined && o.distance_km !== null && !(nombre(o.distance_km) && o.distance_km >= 0 && o.distance_km <= DISTANCE_MAX_KM)) return 'distance_km';
  if (o.note !== undefined && o.note !== null && !(o.note === 1 || o.note === 2 || o.note === 3 || o.note === 4)) return 'note';
  if (o.estime !== undefined && !(nombre(o.estime) && o.estime > 0 && o.estime <= ESTIME_MAX)) return 'estime';
  const cles = new Set(Object.keys(o));
  for (const k of CHAMPS_CONNUS) cles.delete(k);
  if (cles.size) return `champ inconnu : ${[...cles].join(', ')}`;
  // Cohérence par type.
  if (o.type === 'reponse') {
    if (o.mode === undefined) return 'reponse sans mode';
    if (o.correct === undefined) return 'reponse sans correct';
    if (o.note === undefined) return 'reponse sans note';
    if (o.note !== null && !MODES_NOTES.includes(o.mode as ModeEvenement)) return `note hors FSRS en mode ${String(o.mode)}`;
    if (o.correct === true && o.reponse != null) return 'reponse remplie sur une réponse juste';
  } else if (o.note != null) {
    return `note sur un événement ${String(o.type)}`;
  }
  return null;
}

const CHAMPS_CONNUS: readonly string[] = [
  'v', 'id', 'appareil', 'ts', 'tz', 'seance', 'type', 'fiche', 'mode', 'reponse',
  'via', 'zoom', 'correct', 'aide', 'duree_ms', 'distance_km', 'note', 'estime',
];

/** Vrai si l'événement est bien formé (probleme() le dit sinon). */
export function valider(e: unknown): e is Evenement {
  return probleme(e) === null;
}
