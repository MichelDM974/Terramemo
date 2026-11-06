// Partie de Chrono (pur) : les lieux d'une série (pays ou communes), une question à la fois, un
// seul toucher, des points au barème (bareme.ts). Les records se gardent sur
// l'appareil (de toujours et de la semaine) ; classement.ts les publie.
import { comparerScores, ECHELLE_KM, POINTS_JUSTE, POINTS_PROCHE_MAX, pointsQuestion, scoreEpreuve, semaine, type ReponseChrono, type ScoreEpreuve } from './bareme';

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

  /**
   * `cibles` dans l'ordre où les poser (la vue les mélange) ; `echelle_km`,
   * celle du terrain de la série (bareme.ts, ECHELLES_KM), le monde par défaut.
   */
  constructor(
    readonly cibles: readonly string[],
    readonly delai_ms: number,
    readonly echelle_km: number = ECHELLE_KM,
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
    const jouee = { id, ...q, points: pointsQuestion(q, this.delai_ms, this.echelle_km) };
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
    return scoreEpreuve(this.jouees, this.delai_ms, this.echelle_km);
  }
}

// --- Records sur l'appareil ---------------------------------------------

export interface RecordChrono extends ScoreEpreuve {
  /** Date du record (ms depuis 1970). */
  date: number;
  bareme: number;
  /**
   * Quand ce record n'est pas vraisemblable (les règles le refuseraient) : le
   * meilleur score de l'épreuve qui l'est, celui que le classement peut
   * recevoir, que le général additionne et qu'un nouveau pseudo republie.
   */
  publiable?: ScoreEpreuve & { date: number };
}

const sansDate = ({ points, justes, questions, temps_ms }: ScoreEpreuve): ScoreEpreuve => ({ points, justes, questions, temps_ms });

const publiableDate = (r: RecordChrono): (ScoreEpreuve & { date: number }) | null => (vraisemblable(r) ? { ...sansDate(r), date: r.date } : (r.publiable ?? null));

/** Le meilleur score publiable d'un record : lui-même s'il est vraisemblable ; null s'il n'y en a pas. */
export function recordPubliable(r: RecordChrono): ScoreEpreuve | null {
  const p = publiableDate(r);
  return p && sansDate(p);
}

/** Identifiant d'une épreuve : mode, exercice, série (un continent, 'tous' ou 'reunion' : `chrono:localiser:reunion`). */
export const idEpreuve = (serie: string): string => `chrono:localiser:${serie}`;

/**
 * Toutes les épreuves du Chrono, celles que firestore.rules connaît
 * (tailles()) : les six continents, tous les pays et l'île. Le général d'un
 * pseudo se lit dans chacune (classement.ts, placesDuPseudo).
 */
export const EPREUVES: readonly string[] = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America', 'tous', 'reunion'].map(idEpreuve);

const CLE_RECORDS = 'terramemo.chrono.records';

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
  /** Le score bat le meilleur score publiable de l'épreuve (recordPubliable) : il est à publier. */
  progresPubliable: boolean;
}

/**
 * Garde le score s'il bat le record de l'épreuve (plus de points, puis moins
 * de temps). Un record que les règles refuseraient (vraisemblable) garde
 * à côté le meilleur score publiable, qu'un score vraisemblable peut encore
 * battre sans battre le record : sinon la série sortirait du général et le
 * général publié ne pourrait plus progresser. Une partie abandonnée ne passe
 * pas ici. Sans stockage, le bilan reste juste pour cette partie.
 */
export function enregistrer(stockage: Stockage | null, epreuve: string, score: ScoreEpreuve, date: number): Bilan {
  const records = lireRecords(stockage);
  const ancien = records.get(epreuve) ?? null;
  const publiableAvant = ancien && publiableDate(ancien);
  const nouveau = ancien === null || comparerScores(score, ancien) < 0;
  const progresPubliable = vraisemblable(score) && (!publiableAvant || comparerScores(score, publiableAvant) < 0);
  if (ancien && !nouveau && !progresPubliable) return { record: ancien, nouveau, ancien, progresPubliable };
  let record: RecordChrono;
  if (nouveau) {
    record = { ...sansDate(score), date, bareme: VERSION_BAREME };
    if (!progresPubliable && publiableAvant) record.publiable = publiableAvant;
  } else record = { ...ancien!, publiable: { ...sansDate(score), date } };
  records.set(epreuve, record);
  try {
    stockage?.setItem(CLE_RECORDS, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // Stockage plein ou refusé : le record vaut pour cette visite seulement.
  }
  return { record, nouveau, ancien, progresPubliable };
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

/** Bornes du temps par question que firestore.rules impose à un score publié (ms). */
export const TEMPS_MIN_QUESTION_MS = 200;
export const TEMPS_MAX_QUESTION_MS = 15_000;

/**
 * Le score passerait-il les bornes de firestore.rules (scoreValide), arrondi
 * comme publier() l'envoie ? Faux : les règles le refuseraient, inutile de
 * l'écrire, et le général prend à sa place le meilleur score publiable de
 * l'épreuve (recordPubliable). La taille de l'épreuve et la progression se
 * jugent sur le serveur seulement.
 */
export function vraisemblable(s: ScoreEpreuve): boolean {
  const points = Math.round(s.points);
  const temps = Math.round(s.temps_ms);
  const { justes, questions: q } = s;
  return (
    Number.isInteger(justes) &&
    Number.isInteger(q) &&
    q >= 1 &&
    justes >= 0 &&
    justes <= q &&
    points >= justes * POINTS_JUSTE &&
    points <= justes * POINTS_JUSTE + (q - justes) * POINTS_PROCHE_MAX &&
    temps >= q * TEMPS_MIN_QUESTION_MS &&
    temps <= q * TEMPS_MAX_QUESTION_MS
  );
}

/**
 * Le score du classement général : la somme des records de toutes les
 * épreuves pour la période (décision « Classements »), chacun pris à son
 * meilleur score publiable (recordPubliable) ; null sans record publiable.
 * `enLigne` (épreuve → place du pseudo au classement de la période) : les
 * records des autres appareils du même pseudo (décision « Une place par
 * pseudo ») ; chaque épreuve compte le meilleur des deux.
 */
export function totalGeneral(records: Map<string, RecordChrono>, periode: string, enLigne: ReadonlyMap<string, ScoreEpreuve> = new Map()): ScoreEpreuve | null {
  const meilleurs = new Map<string, ScoreEpreuve>();
  for (const [k, r] of records) {
    const [epreuve, sem] = k.split('@');
    if (!epreuve || (periode === 'toujours' ? sem !== undefined : sem !== periode)) continue;
    const p = recordPubliable(r);
    if (p) meilleurs.set(epreuve, p);
  }
  for (const [epreuve, s] of enLigne) {
    const ici = meilleurs.get(epreuve);
    if (!ici || comparerScores(s, ici) < 0) meilleurs.set(epreuve, sansDate(s));
  }
  if (!meilleurs.size) return null;
  return [...meilleurs.values()].reduce(
    (t, r) => ({ points: t.points + r.points, justes: t.justes + r.justes, questions: t.questions + r.questions, temps_ms: t.temps_ms + r.temps_ms }),
    { points: 0, justes: 0, questions: 0, temps_ms: 0 },
  );
}

/**
 * Pseudo public : espaces resserrés, 2 à 20 caractères ; null sinon. Il nomme
 * aussi la place au classement (clePseudo) : pas de « / », ni de nom que
 * Firestore refuse pour un document (« .. », « __…__ »).
 */
export function pseudoValide(brut: string): string | null {
  const p = brut.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (p.length < 2 || p.length > 20 || p.includes('/') || p === '..' || /^__.*__$/.test(p)) return null;
  return p;
}

/**
 * La place d'un pseudo au classement (nom de son document Firestore) : un
 * pseudo, une place, quel que soit l'appareil ; la casse ne compte pas.
 * firestore.rules exige la même clé (pseudo.lower()).
 */
export const clePseudo = (pseudo: string): string => pseudo.toLowerCase();
