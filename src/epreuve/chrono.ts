// Partie de Chrono (pur) : les pays d'une série, une question à la fois, un
// seul toucher, des points au barème (bareme.ts). Le record se garde sur
// l'appareil ; le classement en ligne viendra au J1a (#14), après le
// renommage (#10) : un score publié est lié à l'adresse du site.
import { pointsQuestion, scoreEpreuve, comparerScores, type ReponseChrono, type ScoreEpreuve } from './bareme';

/** Version du barème : un changement de formule repart de records vides. */
export const VERSION_BAREME = 1;

export interface QuestionJouee extends ReponseChrono {
  id: string;
  /** Pays que la carte désigne au toucher (pick) ; null en mer ou sans toucher. */
  touche: string | null;
  points: number;
}

export class PartieChrono {
  private i = 0;
  readonly jouees: QuestionJouee[] = [];

  /** `cibles` dans l'ordre où les poser (la vue les mélange). */
  constructor(
    readonly cibles: readonly string[],
    readonly delai_ms: number,
  ) {}

  get courante(): string | undefined {
    return this.cibles[this.i];
  }

  get numero(): number {
    return this.i + 1;
  }

  get finie(): boolean {
    return this.i >= this.cibles.length;
  }

  get points(): number {
    return this.jouees.reduce((s, q) => s + q.points, 0);
  }

  private jouer(q: Omit<QuestionJouee, 'id' | 'points'>): QuestionJouee {
    const id = this.courante;
    if (id === undefined) throw new Error('partie finie');
    const jouee = { id, ...q, points: pointsQuestion(q, this.delai_ms) };
    this.jouees.push(jouee);
    this.i++;
    return jouee;
  }

  /** Le toucher de la question courante : juste, ou la distance au bord du pays demandé. */
  repondre(touche: string | null, juste: boolean, distance_km: number | null, temps_ms: number): QuestionJouee {
    return this.jouer({ touche, juste, distance_km, temps_ms });
  }

  /** Délai écoulé sans toucher : 0 point, tout le délai compté. */
  expirer(): QuestionJouee {
    return this.jouer({ touche: null, juste: false, distance_km: null, temps_ms: null });
  }

  score(): ScoreEpreuve {
    return scoreEpreuve(this.jouees, this.delai_ms);
  }
}

// --- Records sur l'appareil ---------------------------------------------

export interface RecordChrono extends ScoreEpreuve {
  /** Date du record (ms depuis 1970). */
  date: number;
  bareme: number;
}

/** Identifiant d'une épreuve : mode, exercice, série (un continent, ou 'tous'). */
export const idEpreuve = (serie: string): string => `chrono:localiser:${serie}`;

const CLE_RECORDS = 'cartographe.chrono.records';

type Stockage = Pick<Storage, 'getItem' | 'setItem'>;

/** Les records gardés, ceux d'un autre barème écartés ; vide sans stockage ou s'il est illisible. */
export function lireRecords(stockage: Stockage | null): Map<string, RecordChrono> {
  try {
    const brut = stockage?.getItem(CLE_RECORDS);
    const objet = brut ? (JSON.parse(brut) as Partial<Record<string, RecordChrono>>) : {};
    return new Map(Object.entries(objet).filter((e): e is [string, RecordChrono] => e[1]?.bareme === VERSION_BAREME));
  } catch {
    return new Map();
  }
}

export interface Bilan {
  record: RecordChrono;
  /** Le score bat l'ancien record (ou il n'y en avait pas). */
  nouveau: boolean;
  ancien: RecordChrono | null;
}

/**
 * Garde le score s'il bat le record de l'épreuve (plus de points, puis moins
 * de temps). Une partie abandonnée ne passe pas ici. Sans stockage, le bilan
 * reste juste pour cette partie.
 */
export function enregistrer(stockage: Stockage | null, epreuve: string, score: ScoreEpreuve, date: number): Bilan {
  const records = lireRecords(stockage);
  const ancien = records.get(epreuve) ?? null;
  const candidat: RecordChrono = { ...score, date, bareme: VERSION_BAREME };
  const nouveau = ancien === null || comparerScores(score, ancien) < 0;
  if (!nouveau) return { record: ancien, nouveau, ancien };
  records.set(epreuve, candidat);
  try {
    stockage?.setItem(CLE_RECORDS, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // Stockage plein ou refusé : le record vaut pour cette visite seulement.
  }
  return { record: candidat, nouveau, ancien };
}
