// Parties des épreuves classées (pur) : les lieux d'une série (pays ou
// communes), une question à la fois, un seul toucher. Le Chrono note au barème
// (bareme.ts) ; Sans faute et Minute comptent les justes (décision « Sans
// faute et Minute »). Les records se gardent sur l'appareil (de toujours et de
// la semaine) ; classement.ts les publie.
import type { Domaine } from '../srs/fiches';
import { comparerScores, DELAI_CHRONO_MS, ECHELLE_KM, POINTS_JUSTE, POINTS_PROCHE_MAX, pointsQuestion, scoreEpreuve, semaine, type ReponseChrono, type ScoreEpreuve } from './bareme';

/** Version du barème : un changement de formule repart de records vides. */
export const VERSION_BAREME = 1;

export interface QuestionJouee extends ReponseChrono {
  id: string;
  /** Pays que la carte désigne au toucher (pick) ; null en mer ou sans toucher. */
  touche: string | null;
  points: number;
}

/**
 * Les épreuves classées (décisions « Points et classement », « Sans faute et
 * Minute ») : chacune se joue en touchant la carte, dans les mêmes séries.
 */
export type ModeEpreuve = 'chrono' | 'sansfaute' | 'minute';
export const MODES_EPREUVE: readonly ModeEpreuve[] = ['chrono', 'sansfaute', 'minute'];

/**
 * Le mode d'un classement : une épreuve, ou le quiz général
 * (`quiz:general:<difficulté>`, étude J2 § 9.4), classé à part et hors du
 * général. MODES_EPREUVE ne change pas : il fait les exercices classés de
 * chaque série (src/vues/arbre.ts).
 */
export type ModeClasse = ModeEpreuve | 'quiz';

/** Délai par question de Sans faute : celui du Chrono au toucher. */
export const DELAI_SANS_FAUTE_MS = DELAI_CHRONO_MS.localiser;

/** Durée de Minute : le temps de réponse compté, sans les rétroactions entre deux questions. */
export const DUREE_MINUTE_MS = 60_000;

export class PartieChrono {
  protected i = 0;
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

  /** Les points d'une réponse : le barème du Chrono. */
  protected pointsDe(q: ReponseChrono): number {
    return pointsQuestion(q, this.delai_ms, this.echelle_km);
  }

  private jouer(q: Omit<QuestionJouee, 'id' | 'points'>): QuestionJouee {
    const id = this.courante;
    if (id === undefined || this.finie) throw new Error('partie finie');
    const jouee = { id, ...q, points: this.pointsDe(q) };
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

/** Temps d'une réponse, borné à `max` ; une question sans réponse compte tout `max`. */
const tempsBorne = (q: QuestionJouee, max: number) => (q.temps_ms == null ? max : Math.min(q.temps_ms, max));

/**
 * Sans faute : les lieux de la série sans répétition, 15 s chacun, jusqu'à la
 * première erreur (ou le temps écoulé). Score : les justes d'affilée (points =
 * justes) ; départage au temps des justes seules, l'erreur qui finit la
 * partie n'y compte pas. La série vidée est le score maximal.
 */
export class PartieSansFaute extends PartieChrono {
  constructor(cibles: readonly string[], delai_ms: number = DELAI_SANS_FAUTE_MS) {
    super(cibles, delai_ms);
  }

  /** 1 si juste dans le délai, 0 sinon (une erreur). */
  protected override pointsDe(q: ReponseChrono): number {
    return q.juste && q.temps_ms != null && q.temps_ms <= this.delai_ms ? 1 : 0;
  }

  override get finie(): boolean {
    return super.finie || this.jouees.some((q) => q.points === 0);
  }

  override score(): ScoreEpreuve {
    const justes = this.jouees.filter((q) => q.points > 0);
    const temps_ms = justes.reduce((t, q) => t + tempsBorne(q, this.delai_ms), 0);
    return { points: justes.length, justes: justes.length, questions: this.jouees.length, temps_ms };
  }
}

/**
 * Minute : le plus de justes en 60 s de réponse ; une erreur passe à la
 * suivante, sans délai par question. Score : les justes (points = justes) ;
 * départage au temps (la série vidée avant la fin, plus tôt est mieux), puis
 * au moins de questions (moins d'erreurs à justes égales). La vue décompte la
 * minute (reste) et l'arrête (terminer) ; la question posée à ce moment ne
 * compte pas.
 */
export class PartieMinute extends PartieChrono {
  private terminee = false;

  constructor(
    cibles: readonly string[],
    readonly duree_ms: number = DUREE_MINUTE_MS,
  ) {
    super(cibles, duree_ms);
  }

  /** 1 si juste, 0 sinon. */
  protected override pointsDe(q: ReponseChrono): number {
    return q.juste ? 1 : 0;
  }

  /** Temps de réponse déjà passé (ms). */
  get ecoule(): number {
    return this.jouees.reduce((t, q) => t + tempsBorne(q, this.duree_ms), 0);
  }

  /** Ce qui reste de la minute (ms), au début de la question posée. */
  get reste(): number {
    return Math.max(0, this.duree_ms - this.ecoule);
  }

  override get finie(): boolean {
    return this.terminee || super.finie;
  }

  /** La minute est écoulée : la partie est finie, la question posée ne compte pas. */
  terminer(): void {
    this.terminee = true;
  }

  /** Minute n'a pas de délai par question : la fin de la minute est terminer(). */
  override expirer(): QuestionJouee {
    throw new Error('Minute : pas de délai par question (terminer)');
  }

  override score(): ScoreEpreuve {
    const justes = this.jouees.filter((q) => q.points > 0).length;
    // Minute pleine : 60 s pile pour tous ; série vidée : le temps passé.
    const temps_ms = this.terminee ? this.duree_ms : Math.min(this.ecoule, this.duree_ms);
    return { points: justes, justes, questions: this.jouees.length, temps_ms };
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

const publiableDate = (r: RecordChrono, epreuve: string): (ScoreEpreuve & { date: number }) | null =>
  vraisemblable(r, epreuve) ? { ...sansDate(r), date: r.date } : (r.publiable ?? null);

/** Le meilleur score publiable d'un record de cette épreuve : lui-même s'il est vraisemblable ; null s'il n'y en a pas. */
export function recordPubliable(r: RecordChrono, epreuve: string): ScoreEpreuve | null {
  const p = publiableDate(r, epreuve);
  return p && sansDate(p);
}

/**
 * La clé d'un sujet dans l'id de ses épreuves (étude J2 § 3.2) : `localiser`
 * pour les pays et les communes, inchangé (records, profils et classements
 * en dépendent), le nom du sujet pour les autres. Figée à vie, comme les
 * règles Firestore qui la lisent.
 */
export const CLE_SUJET: Readonly<Record<Domaine, string>> = { pays: 'localiser', communes: 'localiser', capitales: 'capitales', drapeaux: 'drapeaux', mers: 'mers' };

/**
 * Identifiant d'une épreuve : mode, clé du sujet, série (un continent, 'tous',
 * 'reunion', 'mers') : `chrono:localiser:reunion`, `minute:localiser:Africa`,
 * `chrono:capitales:Africa`.
 */
export const idEpreuve = (serie: string, mode: ModeEpreuve = 'chrono', sujet: Domaine = 'pays'): string => `${mode}:${CLE_SUJET[sujet]}:${serie}`;

/** Le classement général : la somme des records des épreuves de epreuvesDuGeneral (src/epreuve/classement.ts, GENERAL). */
const ID_GENERAL = 'general';

/**
 * Le mode d'un classement, ou d'une clé de record (`…@s2914`) : le général
 * (`general`) est du Chrono (il additionne ses records), `quiz:…` est le
 * quiz ; null pour un préfixe inconnu (une épreuve d'une version plus
 * récente), que rien ne publie ni n'additionne.
 */
export function modeEpreuve(epreuve: string): ModeClasse | null {
  const id = epreuve.split('@')[0] ?? '';
  if (id === ID_GENERAL) return 'chrono';
  const m = id.split(':')[0] ?? '';
  return m === 'quiz' || (MODES_EPREUVE as readonly string[]).includes(m) ? (m as ModeClasse) : null;
}

/** Une épreuve d'un sujet : le sujet (sa clé, CLE_SUJET, fait l'id) et la série. */
export interface PaireEpreuve {
  sujet: Domaine;
  serie: string;
}

/** Les séries du monde : tous les pays, puis les six continents (ordre alphabétique de leur nom français). */
const SERIES_MONDE: readonly string[] = ['tous', 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania'];

/**
 * Le catalogue des épreuves (étude J2 § 3.2), paires sujet et série, celles
 * que firestore.rules connaît (tailles(cle)), dans l'ordre de partout :
 * les sujets dans celui de Jouer (D53 b, décision « Ordre des sujets » :
 * Communes en dernier), les séries dans celui du catalogue
 * (src/vues/cibles.ts, décision « Écran Jouer »). Capitales (D37 c) et
 * Drapeaux ont les séries des pays, et leurs tailles. Un sujet n'y compte
 * qu'une fois ses épreuves ouvertes (EPREUVES_OUVERTES).
 */
export const EPREUVES_SUJETS: readonly PaireEpreuve[] = [
  ...SERIES_MONDE.map((serie): PaireEpreuve => ({ sujet: 'pays', serie })),
  ...SERIES_MONDE.map((serie): PaireEpreuve => ({ sujet: 'capitales', serie })),
  ...SERIES_MONDE.map((serie): PaireEpreuve => ({ sujet: 'drapeaux', serie })),
  { sujet: 'communes', serie: 'reunion' },
];

/**
 * L'ouverture des épreuves classées de chaque sujet (décision « Ouverture
 * des épreuves d'un sujet », 11/11) : une bascule datée, le lundi 0 h UTC
 * (4 h à La Réunion) qui suit la livraison du sujet, début d'une semaine du
 * classement. Avant, ses épreuves ne sont ni dans Classé, ni au général, ni
 * publiées, ni lues par le 🏆 ; ses exercices d'Entraînement, si. Les règles
 * Firestore qui les acceptent partent avant le site. Un sujet absent de la
 * table n'a pas d'épreuves (les mers : lot 3b). Pays et communes : depuis
 * toujours. Capitales (lot 1) et Drapeaux (lot 2) : la même bascule, le
 * lundi 16/11/2026 (choix de l'utilisateur, 11/11).
 */
export const EPREUVES_OUVERTES: Readonly<Partial<Record<Domaine, number>>> = {
  pays: 0,
  communes: 0,
  capitales: Date.UTC(2026, 10, 16),
  drapeaux: Date.UTC(2026, 10, 16),
};

/**
 * L'horloge de la bascule (ms depuis 1970), lue à chaque calcul : Jouer et
 * le 🏆 la relisent à chaque ouverture (un onglet resté ouvert bascule au
 * plus tard à sa prochaine ouverture de l'un ou de l'autre), le général et
 * la publication à chaque envoi. Date.now ; tests, et `?horloge=` avec
 * `?emulateurs` au serveur de développement (main.ts) : reglerHorlogeEpreuves.
 */
let horlogeEpreuves: () => number = () => Date.now();

export function reglerHorlogeEpreuves(h: () => number): void {
  horlogeEpreuves = h;
}

/** L'heure de la bascule des épreuves (horlogeEpreuves). */
export const maintenantEpreuves = (): number => horlogeEpreuves();

/** Les épreuves classées de ce sujet sont-elles ouvertes à l'instant `t` ? Jamais pour un sujet hors de EPREUVES_OUVERTES. */
export function sujetOuvert(sujet: string, t: number = maintenantEpreuves()): boolean {
  const debut = (EPREUVES_OUVERTES as Readonly<Record<string, number | undefined>>)[sujet];
  return debut !== undefined && t >= debut;
}

/** Les paires de EPREUVES_SUJETS dont le sujet est ouvert à l'instant `t`, dans leur ordre. */
export const pairesOuvertes = (t: number = maintenantEpreuves()): PaireEpreuve[] => EPREUVES_SUJETS.filter((p) => sujetOuvert(p.sujet, t));

/**
 * Les épreuves du Chrono que le général additionne (étude J2 § 3.2, l'ancien
 * EPREUVES) : celles de tous les sujets ouverts (D40 a, décision « Général à
 * tous les sujets »). Il se lit dans chacune (classement.ts, placesDuPseudo).
 */
export const epreuvesDuGeneral = (t: number = maintenantEpreuves()): string[] => pairesOuvertes(t).map((p) => idEpreuve(p.serie, 'chrono', p.sujet));

/**
 * Toutes les épreuves classées ouvertes (l'ancien EPREUVES_CLASSEES), mode
 * par mode, puis sujet par sujet : l'écran des classements les liste ainsi
 * (§ 8.3). Le quiz viendra au lot 4b.
 */
export const epreuvesClassees = (t: number = maintenantEpreuves()): string[] =>
  MODES_EPREUVE.flatMap((m) => pairesOuvertes(t).map((p) => idEpreuve(p.serie, m, p.sujet)));

/** Le sujet d'une épreuve du catalogue (`chrono:localiser:reunion` → communes) ; null hors du catalogue (le général, le quiz). */
export function sujetEpreuve(epreuve: string): Domaine | null {
  const [, cle, serie] = (epreuve.split('@')[0] ?? '').split(':');
  return EPREUVES_SUJETS.find((p) => p.serie === serie && CLE_SUJET[p.sujet] === cle)?.sujet ?? null;
}

/**
 * Les questions du général au plus (chronoValide de firestore.rules, n = 0) :
 * la somme des tailles des Chrono de epreuvesDuGeneral, une fois les
 * capitales et les drapeaux ouverts, 390 (pays : tous et les continents) +
 * 24 (l'île) + 390 (capitales, D37 c) + 390 (drapeaux) = 1 194. Chaque sujet
 * ouvert la monte (les mers : 1 244, D37 c), règles d'abord.
 * tests/chrono.test.ts la compare à la somme des tailles et aux règles.
 */
export const BORNE_GENERAL = 1194;

const CLE_RECORDS = 'terramemo.chrono.records';
/** Le pseudo public de l'appareil (pour un compte, la copie de celui du profil : J1b, § 2.1). */
const CLE_PSEUDO = 'terramemo.pseudo';

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

/** Écrit les records de l'appareil ; stockage plein ou refusé : ils valent pour cette visite seulement. */
export function ecrireRecords(stockage: Stockage | null, records: ReadonlyMap<string, RecordChrono>): void {
  try {
    stockage?.setItem(CLE_RECORDS, JSON.stringify(Object.fromEntries(records)));
  } catch {
    // Stockage plein ou refusé : le record vaut pour cette visite seulement.
  }
}

/** Le pseudo de l'appareil, s'il est encore valide (pseudoValide) ; null sinon. */
export function lirePseudoDe(stockage: Pick<Storage, 'getItem'> | null): string | null {
  try {
    return pseudoValide(stockage?.getItem(CLE_PSEUDO) ?? '');
  } catch {
    return null;
  }
}

export function garderPseudoDans(stockage: Pick<Storage, 'setItem'> | null, pseudo: string): void {
  try {
    stockage?.setItem(CLE_PSEUDO, pseudo);
  } catch {
    // Sans stockage, le pseudo vaut pour cette visite.
  }
}

/**
 * L'ancien pseudo de l'appareil, remplacé par celui du compte (J1b, § 2.3,
 * étape 7) : dit une fois, là où l'on regarde son pseudo (vue Compte, zone
 * du pseudo d'un classement), même quand le remplacement s'est fait à une
 * ouverture de l'appli, sans personne pour le lire.
 */
const CLE_PSEUDO_REMPLACE = 'terramemo.pseudo.remplace';

export function poserAvisPseudo(stockage: Pick<Storage, 'setItem'> | null, ancien: string): void {
  try {
    stockage?.setItem(CLE_PSEUDO_REMPLACE, ancien);
  } catch {
    // Sans stockage, l'avis n'est pas gardé.
  }
}

/** L'ancien pseudo à dire, retiré du stockage (dit une fois) ; null s'il n'y en a pas. */
export function prendreAvisPseudo(stockage: Pick<Storage, 'getItem' | 'removeItem'> | null): string | null {
  try {
    const a = stockage?.getItem(CLE_PSEUDO_REMPLACE) ?? null;
    if (a !== null) stockage?.removeItem(CLE_PSEUDO_REMPLACE);
    return a;
  } catch {
    return null;
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
 * Garde le score dans `records` (modifiés sur place) s'il bat le record de
 * l'épreuve (plus de points, puis moins de temps). Un record que les règles
 * refuseraient (vraisemblable) garde à côté le meilleur score publiable,
 * qu'un score vraisemblable peut encore battre sans battre le record : sinon
 * la série sortirait du général et le général publié ne pourrait plus
 * progresser. Pur : enregistrer() l'écrit, la fusion du profil d'un compte
 * (src/sync/profil.ts) s'en sert pour les records venus d'un autre appareil.
 */
export function garder(records: Map<string, RecordChrono>, epreuve: string, score: ScoreEpreuve, date: number): Bilan {
  const ancien = records.get(epreuve) ?? null;
  const publiableAvant = ancien && publiableDate(ancien, epreuve);
  const nouveau = ancien === null || comparerScores(score, ancien) < 0;
  const progresPubliable = vraisemblable(score, epreuve) && (!publiableAvant || comparerScores(score, publiableAvant) < 0);
  if (ancien && !nouveau && !progresPubliable) return { record: ancien, nouveau, ancien, progresPubliable };
  let record: RecordChrono;
  if (nouveau) {
    record = { ...sansDate(score), date, bareme: VERSION_BAREME };
    if (!progresPubliable && publiableAvant) record.publiable = publiableAvant;
  } else record = { ...ancien!, publiable: { ...sansDate(score), date } };
  records.set(epreuve, record);
  return { record, nouveau, ancien, progresPubliable };
}

/**
 * Garde le score s'il bat le record de l'épreuve (garder), sur l'appareil.
 * Une partie abandonnée ne passe pas ici. Sans stockage, le bilan reste juste
 * pour cette partie.
 */
export function enregistrer(stockage: Stockage | null, epreuve: string, score: ScoreEpreuve, date: number): Bilan {
  const records = lireRecords(stockage);
  const b = garder(records, epreuve, score, date);
  if (b.nouveau || b.progresPubliable) ecrireRecords(stockage, records);
  return b;
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
  if (oublierSemainesPassees(records, periode)) ecrireRecords(stockage, records);
  return { toujours, semaine: sem, periode };
}

/** Retire (sur place) les records des semaines autres que `periode` ; vrai s'il y en avait. */
export function oublierSemainesPassees(records: Map<string, unknown>, periode: string): boolean {
  const anciens = [...records.keys()].filter((k) => k.includes('@') && !k.endsWith(`@${periode}`));
  for (const k of anciens) records.delete(k);
  return anciens.length > 0;
}

/** Le record d'une épreuve pour une période ('toujours' ou la semaine). */
export function recordDe(records: Map<string, RecordChrono>, epreuve: string, periode: string): RecordChrono | null {
  return records.get(periode === 'toujours' ? epreuve : cleSemaine(epreuve, periode)) ?? null;
}

/** Bornes du temps par question que firestore.rules impose à un score publié (ms). */
export const TEMPS_MIN_QUESTION_MS = 200;
export const TEMPS_MAX_QUESTION_MS = 15_000;
/** Questions d'une partie du quiz général (quizValide de firestore.rules, étude J2 § 8.2). */
export const QUESTIONS_QUIZ = 20;

/**
 * Le score de cette épreuve (ou clé de record) passerait-il les bornes de
 * firestore.rules (scoreValide), arrondi comme publier() l'envoie ? Faux : les
 * règles le refuseraient, inutile de l'écrire, et le général prend à sa place
 * le meilleur score publiable de l'épreuve (recordPubliable). La taille de
 * l'épreuve et la progression se jugent sur le serveur seulement, sauf la
 * borne du général (BORNE_GENERAL), recopiée. Le quiz :
 * les bornes de quizValide (étude J2 § 8.2 : 20 questions, barème du Chrono) ;
 * un mode inconnu : faux.
 */
export function vraisemblable(s: ScoreEpreuve, epreuve: string): boolean {
  const points = Math.round(s.points);
  const temps = Math.round(s.temps_ms);
  const { justes, questions: q } = s;
  if (!Number.isInteger(justes) || !Number.isInteger(q) || justes < 0 || justes > q) return false;
  switch (modeEpreuve(epreuve)) {
    case 'sansfaute':
      // Les justes d'affilée, plus l'erreur qui a fini la partie (sauf série vidée) ; le temps des justes seules.
      return q >= 1 && q <= justes + 1 && points === justes && temps >= justes * TEMPS_MIN_QUESTION_MS && temps <= justes * TEMPS_MAX_QUESTION_MS;
    case 'minute':
      return points === justes && temps >= q * TEMPS_MIN_QUESTION_MS && temps <= DUREE_MINUTE_MS;
    case 'chrono':
      // Le général : au plus BORNE_GENERAL questions, comme chronoValide(d, 0).
      return baremeChrono(points, justes, q, temps) && (epreuve.split('@')[0] !== ID_GENERAL || q <= BORNE_GENERAL);
    case 'quiz':
      // Les bornes du Chrono, sur 20 questions.
      return q === QUESTIONS_QUIZ && baremeChrono(points, justes, q, temps);
    case null:
      return false;
  }
}

/** Les bornes du barème du Chrono (scoreValide de firestore.rules) : 1 000 par juste, 500 au plus par erreur, 0,2 à 15 s par question. */
function baremeChrono(points: number, justes: number, q: number, temps: number): boolean {
  return (
    q >= 1 &&
    points >= justes * POINTS_JUSTE &&
    points <= justes * POINTS_JUSTE + (q - justes) * POINTS_PROCHE_MAX &&
    temps >= q * TEMPS_MIN_QUESTION_MS &&
    temps <= q * TEMPS_MAX_QUESTION_MS
  );
}

/**
 * Le score du classement général : la somme des records des épreuves de
 * epreuvesDuGeneral (ouvertes à l'instant `t`) pour la période (décisions « Classements », « Sans faute et
 * Minute » : ni Sans faute ni Minute n'y comptent), chacun pris à son
 * meilleur score publiable (recordPubliable) ; null sans record publiable.
 * Les seules listées (étude J2 § 3.2) : ni le quiz, ni un Chrono que cette
 * version ne connaît pas (venu par le profil d'une version plus récente),
 * que les règles ne sauraient borner.
 * `enLigne` (épreuve → place du pseudo au classement de la période) : les
 * records des autres appareils du même pseudo (décision « Une place par
 * pseudo ») ; chaque épreuve compte le meilleur des deux.
 */
export function totalGeneral(
  records: Map<string, RecordChrono>,
  periode: string,
  enLigne: ReadonlyMap<string, ScoreEpreuve> = new Map(),
  t: number = maintenantEpreuves(),
): ScoreEpreuve | null {
  const dansLeGeneral = new Set(epreuvesDuGeneral(t));
  const meilleurs = new Map<string, ScoreEpreuve>();
  for (const [k, r] of records) {
    const [epreuve, sem] = k.split('@');
    if (!epreuve || !dansLeGeneral.has(epreuve) || (periode === 'toujours' ? sem !== undefined : sem !== periode)) continue;
    const p = recordPubliable(r, epreuve);
    if (p) meilleurs.set(epreuve, p);
  }
  for (const [epreuve, s] of enLigne) {
    if (!dansLeGeneral.has(epreuve)) continue;
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
 * Firestore refuse pour un document (« .. », « __…__ »), ni de pseudo dont
 * les règles refuseraient la clé (clePermise : lettres de fantaisie « 𝐌 »,
 * « Ⓜ », « Ⅻ », « İ » turc), que le joueur apprend ainsi tout de suite
 * plutôt qu'à chaque publication refusée.
 */
export function pseudoValide(brut: string): string | null {
  const p = brut.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (p.length < 2 || p.length > 20 || p.includes('/') || p === '..' || /^__.*__$/.test(p)) return null;
  if (!clePermise(clePseudo(p), p)) return null;
  return p;
}

/**
 * La place d'un pseudo au classement (nom de son document Firestore) : un
 * pseudo, une place, quel que soit l'appareil ; la casse ne compte pas.
 * firestore.rules (cleDuPseudo) n'accepte que cette clé, à peu de chose
 * près : clePermise.
 */
export const clePseudo = (pseudo: string): string => pseudo.toLowerCase();

const MAJUSCULE = /[\p{Lu}\p{Lt}]/u;
const masquer = (s: string, m: string) => s.replace(/[^ -~]/gu, m);
const horsAscii = (s: string) => s.replace(/[ -~]/gu, '');

/**
 * La règle cleDuPseudo de firestore.rules, recopiée (tests/regles.test.ts
 * les confronte sur l'émulateur) : la clé n'a aucune majuscule ; ses
 * caractères ASCII sont ceux du pseudo baissé (lower() des règles ne baisse
 * que l'ASCII), à la même place ; ses caractères non ASCII sont ceux du
 * pseudo, sauf si le pseudo a une majuscule non ASCII : chacune de ses
 * lettres non ASCII répond alors à une minuscule de la clé, quelle qu'elle soit.
 */
export function clePermise(cle: string, pseudo: string): boolean {
  if (MAJUSCULE.test(cle)) return false;
  for (const m of ['_', '~']) if (masquer(cle, m) !== masquer(pseudo, m).toLowerCase()) return false;
  const h = horsAscii(pseudo);
  const autres = horsAscii(cle);
  return MAJUSCULE.test(h) ? autres.replace(/\p{Ll}/gu, '?') === h.replace(/[\p{Lu}\p{Lt}\p{Ll}]/gu, '?') : autres === h;
}
