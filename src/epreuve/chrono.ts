// Parties des épreuves classées (pur) : les lieux d'une série (pays,
// capitales, drapeaux, mers ou communes), une question à la fois, un seul toucher. Chrono et Sans faute
// comptent les justes (bareme.ts, décision « Barème et classements » du
// 12/11/2026). Les records se gardent sur l'appareil (de toujours et de la
// semaine) ; classement.ts les publie.
import { REGLES } from '../quiz/regles';
import { DIFFICULTES, type Difficulte } from '../quiz/types';
import type { Domaine } from '../srs/fiches';
import { comparerScores, DELAI_CHRONO_MS, pointsQuestion, scoreEpreuve, semaine, type ReponseChrono, type ScoreEpreuve } from './bareme';

/**
 * Version du barème, portée par chaque record et chaque place en ligne. 2
 * (12/11/2026, #30) : juste ou faux, points = justes. Un score du barème 1
 * (BAREME_1) est converti à la lecture (versBareme2), jamais effacé
 * (décision « Barème et classements ») ; une version plus récente est
 * ignorée.
 */
export const VERSION_BAREME = 2;

/** Le barème d'avant le 12/11/2026 : 1 000 points par juste, jusqu'à 500 par erreur proche (proximité). */
export const BAREME_1 = 1;

export interface QuestionJouee extends ReponseChrono {
  id: string;
  /** Pays que la carte désigne au toucher (pick) ; null en mer ou sans toucher. */
  touche: string | null;
  /** 1 si juste dans le délai, 0 sinon (pointsQuestion). */
  points: number;
}

/**
 * Les épreuves classées (décisions « Points et classement », « Barème et
 * classements ») : chacune se joue en touchant la carte, dans les mêmes
 * séries.
 */
export type ModeEpreuve = 'chrono' | 'sansfaute';
export const MODES_EPREUVE: readonly ModeEpreuve[] = ['chrono', 'sansfaute'];

/**
 * Les modes retirés, dont les ids restent réservés à vie et ne sont jamais
 * réutilisés pour une autre épreuve : `minute:…` (Minute, retiré le
 * 12/11/2026, décision « Barème et classements »). Leurs records restent
 * sur l'appareil et au profil, sans plus rien publier ni additionner
 * (modeEpreuve : null).
 */
export const MODES_RETIRES: readonly string[] = ['minute'];

/**
 * Le mode d'un classement : une épreuve, ou le quiz général
 * (`quiz:general:<difficulté>`, étude J2 § 9.4), classé à part et hors du
 * général. MODES_EPREUVE ne change pas : il fait les exercices classés de
 * chaque série (src/vues/arbre.ts).
 */
export type ModeClasse = ModeEpreuve | 'quiz';

/** Délai par question de Sans faute : celui du Chrono au toucher. */
export const DELAI_SANS_FAUTE_MS = DELAI_CHRONO_MS.localiser;

export class PartieChrono {
  protected i = 0;
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

  /** Le délai de la question `i` (0 : la première) : le même pour toutes ici ; le quiz a le sien par question (quiz.ts). */
  protected delaiQuestion(_i: number): number {
    return this.delai_ms;
  }

  private jouer(q: Omit<QuestionJouee, 'id' | 'points'>): QuestionJouee {
    const id = this.courante;
    if (id === undefined || this.finie) throw new Error('partie finie');
    const jouee = { id, ...q, points: pointsQuestion(q, this.delaiQuestion(this.i)) };
    this.jouees.push(jouee);
    this.i++;
    return jouee;
  }

  /** Le toucher de la question courante : juste, ou la distance au bord du pays demandé. */
  repondre(touche: string | null, juste: boolean, distance_km: number | null, temps_ms: number): QuestionJouee {
    return this.jouer({ touche, juste, distance_km, temps_ms });
  }

  /** Délai écoulé sans toucher : une erreur, tout le délai compté. */
  expirer(): QuestionJouee {
    return this.jouer({ touche: null, juste: false, distance_km: null, temps_ms: null });
  }

  score(): ScoreEpreuve {
    return scoreEpreuve(this.jouees, this.delai_ms);
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

  override get finie(): boolean {
    return super.finie || this.jouees.some((q) => q.points === 0);
  }

  override score(): ScoreEpreuve {
    const justes = this.jouees.filter((q) => q.points > 0);
    const temps_ms = justes.reduce((t, q) => t + tempsBorne(q, this.delai_ms), 0);
    return { points: justes.length, justes: justes.length, questions: this.jouees.length, temps_ms };
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
 * Un score du barème 1 (BAREME_1) dans le barème 2 : ses points deviennent
 * ses justes. Au Chrono et au général, c'est tout le changement ; à Sans
 * faute (et à Minute, retiré), les points valaient déjà les justes. Sert aux
 * records de l'appareil (convertirRecord), à ceux du profil
 * (src/sync/profil.ts) et aux places lues en ligne (src/epreuve/classement.ts,
 * enPlace), pour ne jamais comparer deux échelles.
 */
export const pointsV2 = <S extends { points: number; justes: number }>(s: S): S => ({ ...s, points: s.justes });

/**
 * Un record de l'appareil au barème 2 : celui du barème 1 converti
 * (pointsV2, son `publiable` aussi), jamais effacé (décision « Barème et
 * classements ») ; les autres tels quels. Le publiable gardé à côté d'un
 * record non vraisemblable peut, compté en justes, battre ce record (9
 * justes et des erreurs proches devant 10 justes, au barème 1) : il devient
 * alors le record, comme garder() l'aurait fait au barème 2.
 */
export function convertirRecord(r: RecordChrono): RecordChrono {
  if (r.bareme !== BAREME_1) return r;
  const { publiable, ...reste } = r;
  const record: RecordChrono = { ...pointsV2(reste), bareme: VERSION_BAREME };
  if (!publiable) return record;
  const p = pointsV2(publiable);
  if (comparerScores(p, record) < 0) return { ...sansDate(p), date: p.date, bareme: VERSION_BAREME };
  return { ...record, publiable: p };
}

/** Champs numériques d'un score lu (stockage, profil) : de quoi le convertir sans NaN. */
const scoreLisible = (r: { points?: unknown; justes?: unknown }): boolean => typeof r.points === 'number' && typeof r.justes === 'number';

/**
 * La clé d'un sujet dans l'id de ses épreuves (étude J2 § 3.2) : `localiser`
 * pour les pays et les communes, inchangé (records, profils et classements
 * en dépendent), le nom du sujet pour les autres. Figée à vie, comme les
 * règles Firestore qui la lisent.
 */
export const CLE_SUJET: Readonly<Record<Domaine, string>> = { pays: 'localiser', communes: 'localiser', capitales: 'capitales', drapeaux: 'drapeaux', mers: 'mers' };

/**
 * Identifiant d'une épreuve : mode, clé du sujet, série (un continent, 'tous',
 * 'reunion', 'mers') : `chrono:localiser:reunion`, `sansfaute:localiser:Africa`,
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
 * Drapeaux ont les séries des pays, et leurs tailles ; Océans et mers, sa
 * série unique `mers` (D44 a, lot 3b : 50 zones). Un sujet y entre
 * quand ses épreuves classées ouvrent (décision « Ouverture des épreuves
 * d'un sujet », 12/11) : dès qu'il est livré, sans date de bascule, les
 * règles Firestore qui les acceptent parties avant le site. Seule source de
 * l'ouverture : un sujet de Jouer absent d'ici n'a pas d'épreuves classées,
 * ni dans Classé, ni au général, ni publiées, ni lues par le 🏆 ; ses
 * exercices d'Entraînement, si.
 */
export const EPREUVES_SUJETS: readonly PaireEpreuve[] = [
  ...SERIES_MONDE.map((serie): PaireEpreuve => ({ sujet: 'pays', serie })),
  ...SERIES_MONDE.map((serie): PaireEpreuve => ({ sujet: 'capitales', serie })),
  ...SERIES_MONDE.map((serie): PaireEpreuve => ({ sujet: 'drapeaux', serie })),
  { sujet: 'mers', serie: 'mers' },
  { sujet: 'communes', serie: 'reunion' },
];

/** Les épreuves classées de ce sujet sont-elles ouvertes ? Oui s'il est dans EPREUVES_SUJETS. */
export const sujetOuvert = (sujet: string): boolean => EPREUVES_SUJETS.some((p) => p.sujet === sujet);

/**
 * Les épreuves du Chrono que le général additionne (étude J2 § 3.2, l'ancien
 * EPREUVES) : celles de tous les sujets de EPREUVES_SUJETS (D40 a, décision « Général à
 * tous les sujets »). Il se lit dans chacune (classement.ts, placesDuPseudo).
 */
export const epreuvesDuGeneral = (): string[] => EPREUVES_SUJETS.map((p) => idEpreuve(p.serie, 'chrono', p.sujet));

/** Identifiant du classement d'une difficulté du quiz (étude J2 § 9.4) : stable tant que la formule ne change pas (D50 ; sinon `quiz:general2:…`). */
export const idQuiz = (d: Difficulte): string => `quiz:general:${d}`;

/** La difficulté d'un classement du quiz (`quiz:general:moyen`, ou sa clé de record `…@s2914`) ; null hors du quiz ou pour une difficulté inconnue. */
export function difficulteQuiz(epreuve: string): Difficulte | null {
  const [m, cle, d] = (epreuve.split('@')[0] ?? '').split(':');
  return m === 'quiz' && cle === 'general' && (DIFFICULTES as readonly (string | undefined)[]).includes(d) ? (d as Difficulte) : null;
}

/**
 * Les classements du quiz, un par difficulté (étude J2 § 9.4). Ouverts dès
 * le lot 4b (décision « Ouverture des épreuves d'un sujet » : les quatre
 * sujets du J2 sont livrés, D50 c) ; hors du général (epreuvesDuGeneral ne
 * les liste pas).
 */
export const epreuvesQuiz = (): string[] => DIFFICULTES.map(idQuiz);

/**
 * Toutes les épreuves classées (l'ancien EPREUVES_CLASSEES), mode
 * par mode, puis sujet par sujet, et le quiz en dernier : l'écran des
 * classements les liste ainsi (§ 8.3), et l'appareil publie ou relance
 * les records de ces seules épreuves.
 */
export const epreuvesClassees = (): string[] => [...MODES_EPREUVE.flatMap((m) => EPREUVES_SUJETS.map((p) => idEpreuve(p.serie, m, p.sujet))), ...epreuvesQuiz()];

/** Le sujet d'une épreuve du catalogue (`chrono:localiser:reunion` → communes) ; null hors du catalogue (le général, le quiz). */
export function sujetEpreuve(epreuve: string): Domaine | null {
  const [, cle, serie] = (epreuve.split('@')[0] ?? '').split(':');
  return EPREUVES_SUJETS.find((p) => p.serie === serie && CLE_SUJET[p.sujet] === cle)?.sujet ?? null;
}

/**
 * Les questions du général au plus (chronoValide de firestore.rules, n = 0) :
 * la somme des tailles des Chrono de epreuvesDuGeneral : 390 (pays : tous et les continents) +
 * 24 (l'île) + 390 (capitales, D37 c) + 390 (drapeaux) + 50 (mers, lot 3b) =
 * 1 244 (décision « Général à tous les sujets »). Chaque sujet ouvert la
 * monte, règles d'abord : une version d'avant publie un général plus bas,
 * que les règles refusent sans bruit (pas de progrès ; étude J2 § 3.2).
 * tests/chrono.test.ts la compare à la somme des tailles et aux règles.
 */
export const BORNE_GENERAL = 1244;

/** Questions de chaque série du monde : les 195 pays jouables (src/vues/cibles.ts), répartis en six continents. */
const TAILLES_MONDE: Readonly<Record<string, number>> = { tous: 195, Africa: 54, 'North America': 23, 'South America': 12, Asia: 48, Europe: 44, Oceania: 14 };

/**
 * Questions de chaque série, par sujet : celles de tailles(cle) dans
 * firestore.rules (tests/chrono.test.ts les confronte, et au catalogue).
 * Capitales et drapeaux ont les séries et les tailles des pays (D37 c) ;
 * les mers, leur série unique de 50 zones (IDS_MERS, D44 a).
 */
const TAILLES_SERIES: Readonly<Record<Domaine, Readonly<Record<string, number>>>> = {
  pays: TAILLES_MONDE,
  capitales: TAILLES_MONDE,
  drapeaux: TAILLES_MONDE,
  communes: { reunion: 24 },
  mers: { mers: 50 },
};

/**
 * Les questions de la série d'une épreuve classée (ou d'une clé de record),
 * celles qui font les 100 % : Sans faute n'en garde que les justes d'affilée
 * et l'erreur qui l'arrête (src/vues/scores.ts) ; null hors du catalogue (le
 * général, le quiz, un mode retiré ou inconnu).
 */
export function tailleEpreuve(epreuve: string): number | null {
  if (modeEpreuve(epreuve) === null) return null;
  const sujet = sujetEpreuve(epreuve);
  const serie = (epreuve.split('@')[0] ?? '').split(':')[2] ?? '';
  return sujet === null ? null : (TAILLES_SERIES[sujet][serie] ?? null);
}

const CLE_RECORDS = 'terramemo.chrono.records';
/** Le pseudo public de l'appareil (pour un compte, la copie de celui du profil : J1b, § 2.1). */
const CLE_PSEUDO = 'terramemo.pseudo';

type Stockage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Les records gardés, au barème 2 : ceux du barème 1 convertis
 * (convertirRecord), ceux d'un autre barème écartés ; vide sans stockage ou
 * s'il est illisible. La conversion n'est écrite qu'avec le prochain record
 * (ecrireRecords), ou au démarrage (convertirStockage) : relue d'ici là, elle
 * donne le même résultat. Convertis clé par clé, le record de toujours
 * pourrait rester sous celui d'une semaine : au barème 1, chacun avait été
 * choisi aux points de proximité (100 justes et des erreurs proches devant
 * 110 justes et des erreurs lointaines) ; un record de la semaine converti
 * qui bat celui de toujours le remplace donc (garder, publiable compris).
 */
export function lireRecords(stockage: Stockage | null): Map<string, RecordChrono> {
  try {
    const brut = stockage?.getItem(CLE_RECORDS);
    const objet = brut ? (JSON.parse(brut) as Partial<Record<string, RecordChrono>>) : {};
    const lus = new Map<string, RecordChrono>();
    const semaines: string[] = [];
    for (const [k, r] of Object.entries(objet)) {
      if (r?.bareme === VERSION_BAREME) lus.set(k, r);
      else if (r?.bareme === BAREME_1 && scoreLisible(r) && (!r.publiable || scoreLisible(r.publiable))) {
        lus.set(k, convertirRecord(r));
        if (k.includes('@')) semaines.push(k);
      }
    }
    for (const k of semaines) {
      const r = lus.get(k)!;
      const epreuve = k.split('@')[0]!;
      garder(lus, epreuve, sansDate(r), r.date);
      if (r.publiable) garder(lus, epreuve, sansDate(r.publiable), r.publiable.date);
    }
    return lus;
  } catch {
    return new Map();
  }
}

/**
 * Écrit au barème 2 les records du barème 1 de l'appareil (lireRecords les
 * convertit), une fois, au démarrage (src/vues/classement.ts,
 * brancherRelance) ; rend les clés converties, à republier : leurs places en
 * ligne ont pu être refusées par les règles du barème 2 pendant que
 * l'appareil jouait encore au barème 1. Vide s'il n'y en avait pas, sans
 * stockage ou s'il est illisible.
 */
export function convertirStockage(stockage: Stockage | null): string[] {
  try {
    const brut = stockage?.getItem(CLE_RECORDS);
    const objet = brut ? (JSON.parse(brut) as Partial<Record<string, RecordChrono>>) : {};
    const records = lireRecords(stockage);
    const converties = Object.entries(objet)
      .filter(([k, r]) => r?.bareme === BAREME_1 && records.has(k))
      .map(([k]) => k);
    if (converties.length) ecrireRecords(stockage, records);
    return converties;
  } catch {
    return [];
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
 * Le temps total le plus long d'une partie du quiz de cette difficulté (ms) :
 * le délai de chacune de ses questions (src/quiz/regles.ts ; PartieQuiz.score
 * borne chaque temps par le sien et compte tout le délai d'une question sans
 * réponse). La copie de tempsQuiz() dans firestore.rules :
 * tests/regles.test.ts les confronte.
 */
export function tempsMaxQuiz(d: Difficulte): number {
  const r = REGLES[d];
  return r.qcm * r.delai_qcm_ms + (QUESTIONS_QUIZ - r.qcm) * r.delai_toucher_ms;
}

/**
 * Le score de cette épreuve (ou clé de record) passerait-il les bornes de
 * firestore.rules (scoreValide), arrondi comme publier() l'envoie ? Faux : les
 * règles le refuseraient, inutile de l'écrire, et le général prend à sa place
 * le meilleur score publiable de l'épreuve (recordPubliable). La taille de
 * l'épreuve et la progression se jugent sur le serveur seulement, sauf la
 * borne du général (BORNE_GENERAL), recopiée. Le quiz :
 * les bornes de quizValide (20 questions, juste ou faux, le temps borné par
 * les délais de sa difficulté : tempsMaxQuiz) ;
 * un mode inconnu ou retiré (Minute) : faux.
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
    case 'chrono':
      // Le général : au plus BORNE_GENERAL questions, comme chronoValide(d, 0).
      return baremeChrono(points, justes, q, temps) && (epreuve.split('@')[0] !== ID_GENERAL || q <= BORNE_GENERAL);
    case 'quiz': {
      // quizValide : 20 questions, points = justes, au moins 0,2 s par question, au plus le délai de chacune.
      const d = difficulteQuiz(epreuve);
      return d !== null && q === QUESTIONS_QUIZ && points === justes && temps >= q * TEMPS_MIN_QUESTION_MS && temps <= tempsMaxQuiz(d);
    }
    case null:
      return false;
  }
}

/** Les bornes du barème du Chrono (chronoValide de firestore.rules) : points = justes, 0,2 à 15 s par question. */
function baremeChrono(points: number, justes: number, q: number, temps: number): boolean {
  return q >= 1 && points === justes && temps >= q * TEMPS_MIN_QUESTION_MS && temps <= q * TEMPS_MAX_QUESTION_MS;
}

/**
 * Le score du classement général : la somme des records des épreuves de
 * epreuvesDuGeneral pour la période (décisions « Classements », « Barème et
 * classements » : Sans faute n'y compte pas), chacun pris à son
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
): ScoreEpreuve | null {
  const dansLeGeneral = new Set(epreuvesDuGeneral());
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
 * plutôt qu'à chaque publication refusée. Ni caractère invisible
 * (formePseudo) : le classement le refuserait aussi.
 */
export function pseudoValide(brut: string): string | null {
  const p = brut.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (p.length < 2 || p.length > 20 || p.includes('/') || p === '..' || /^__.*__$/.test(p)) return null;
  if (!formePseudo(p) || !clePermise(clePseudo(p), p)) return null;
  return p;
}

const FORME_PSEUDO = /^[^\p{Z}\p{Cc}\p{Cf}\p{Co}\p{Cs}]+( [^\p{Z}\p{Cc}\p{Cf}\p{Co}\p{Cs}]+)*$/u;

/**
 * La forme d'un pseudo, la règle de scoreValide (firestore.rules) recopiée :
 * des mots séparés d'une espace simple, sans espace au bord, ni séparateur
 * Unicode (\p{Z} : espace insécable, espace fine…), ni caractère de
 * contrôle, de format ou invisible (\p{C} : U+200B, trait d'union
 * conditionnel, saut de ligne). Sans elle, un client modifié publiait
 * « Michel » + U+200B, une place à part qui s'affiche comme celle de
 * « Michel » (audit du 07/11, #25). Restent possibles les homoglyphes (« і »
 * cyrillique) et la forme NFD : sans serveur, on ne les arrête pas. Prix :
 * les emojis composés par U+200D (famille, drapeau arc-en-ciel) sont refusés.
 * Le \p{C} des règles (RE2) est Cc, Cf, Co et Cs, sans les points de code
 * non assignés (Cn) que le \p{C} de JS compte aussi : écrit en entier ici,
 * sinon un emoji plus récent que l'Unicode de la WebView (« Léa 🥰 » sur un
 * vieux téléphone) ferait perdre au joueur son pseudo, que les règles
 * acceptent.
 */
export const formePseudo = (p: string): boolean => FORME_PSEUDO.test(p);

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
