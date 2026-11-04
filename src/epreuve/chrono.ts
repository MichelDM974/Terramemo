// Partie de Chrono (pur) : les pays d'une série, une question à la fois, un
// seul toucher, des points au barème (bareme.ts). Les records se gardent sur
// l'appareil (de toujours et de la semaine) ; classement.ts les publie.
import { comparerScores, pointsQuestion, scoreEpreuve, semaine, type ReponseChrono, type ScoreEpreuve } from './bareme';

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

// --- Semaine et classement général ------------------------------------------

/** Période du classement de la semaine : « s » + numéro de semaine (bareme.ts). */
export const periodeSemaine = (t_ms: number): string => `s${semaine(t_ms)}`;

/** Clé du record de la semaine d'une épreuve. */
const cleSemaine = (epreuve: string, periode: string) => `${epreuve}@${periode}`;

export interface BilanPartie {
  toujours: Bilan;
  semaine: Bilan;
  periode: string;
}

/**
 * Garde le score comme record de toujours et de la semaine (les semaines
 * passées sont oubliées) : ce que le classement de l'appareil sait publier.
 */
export function enregistrerPartie(stockage: Stockage | null, epreuve: string, score: ScoreEpreuve, date: number): BilanPartie {
  const periode = periodeSemaine(date);
  const toujours = enregistrer(stockage, epreuve, score, date);
  const sem = enregistrer(stockage, cleSemaine(epreuve, periode), score, date);
  const records = lireRecords(stockage);
  const anciens = [...records.keys()].filter((k) => k.includes('@') && !k.endsWith(`@${periode}`));
  if (anciens.length) {
    for (const k of anciens) records.delete(k);
    try {
      stockage?.setItem(CLE_RECORDS, JSON.stringify(Object.fromEntries(records)));
    } catch {
      // Sans stockage, rien à oublier.
    }
  }
  return { toujours, semaine: sem, periode };
}

/** Le record d'une épreuve pour une période ('toujours' ou la semaine). */
export function recordDe(records: Map<string, RecordChrono>, epreuve: string, periode: string): RecordChrono | null {
  return records.get(periode === 'toujours' ? epreuve : cleSemaine(epreuve, periode)) ?? null;
}

/**
 * Le score du classement général : la somme des records de toutes les
 * épreuves pour la période (décision « Classements ») ; null sans record.
 */
export function totalGeneral(records: Map<string, RecordChrono>, periode: string): ScoreEpreuve | null {
  const choisis = [...records].filter(([k]) => (periode === 'toujours' ? !k.includes('@') : k.endsWith(`@${periode}`))).map(([, r]) => r);
  if (!choisis.length) return null;
  return choisis.reduce(
    (t, r) => ({ points: t.points + r.points, justes: t.justes + r.justes, questions: t.questions + r.questions, temps_ms: t.temps_ms + r.temps_ms }),
    { points: 0, justes: 0, questions: 0, temps_ms: 0 },
  );
}

/** Pseudo public : espaces resserrés, 2 à 20 caractères ; null sinon. */
export function pseudoValide(brut: string): string | null {
  const p = brut.trim().replace(/\s+/g, ' ');
  return p.length >= 2 && p.length <= 20 ? p : null;
}
