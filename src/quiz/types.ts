// Le quiz général (étude J2 § 9 ; décision « Quiz général », 10/11/2026, barème
// du 12/11) : 20 questions tirées à parts égales dans les sujets livrés, une
// forme fixe par difficulté. Ce dossier est pur (ni DOM ni carte), testé avec
// une graine (tests/quiz.test.ts) ; la vue (src/vues/quiz.ts) vient au lot 4b.

/** Une question à 4 choix (la zone allumée), ou au toucher (on touche la zone). */
export type Forme = 'qcm' | 'toucher';

export type Difficulte = 'facile' | 'moyen' | 'difficile' | 'expert';
export const DIFFICULTES: readonly Difficulte[] = ['facile', 'moyen', 'difficile', 'expert'];

/** Niveau de notoriété d'un lieu (public/geo/notoriete.json, D48 b) : 1, très connu (le facile), à 3. */
export type Niveau = 1 | 2 | 3;

/** Les sujets du quiz : ceux du J2 (D51 : pas de communes de La Réunion), les silhouettes du J4 (D604 a). */
export type SujetQuiz = 'pays' | 'capitales' | 'drapeaux' | 'silhouettes' | 'mers';

export interface Question {
  sujet: SujetQuiz;
  forme: Forme;
  /** L'id du lieu à trouver : le pays (pays, capitales, drapeaux) ou la mer ; ce que note le toucher et que vaut le bon choix. */
  cible: string;
  /**
   * Les entités de la question, jamais deux fois dans une partie, tous sujets
   * confondus (§ 9.2 : « Bolivie » puis « La Paz » se répondraient) : le
   * pays et, pour une capitale, les pays dont elle n'est jamais un leurre
   * (Jérusalem et Jérusalem-Est : Israël et la Palestine) ; pour un drapeau,
   * ses jumeaux (l'Indonésie et Monaco montrent la même image) ; la mer.
   * La première est celle de la cible.
   */
  entites: readonly string[];
  /**
   * La capitale montrée (son Qid) : au toucher, l'énoncé (« Pays dont la
   * capitale est : … » : la plus connue en moyen, au hasard parmi les justes
   * au-delà) ; au QCM, le bouton juste (la principale, § 9.2). Rien pour les
   * autres sujets : le drapeau montré est le premier du manifeste.
   */
  indice?: string;
  /** QCM : 4 ids, la cible comprise, dans l'ordre des boutons. */
  choix?: readonly string[];
  /** Au QCM du facile, l'énoncé nomme le pays (D49 d : « Quelle est la capitale du Japon ? »), la zone allumée n'étant qu'une aide. */
  nomme?: true;
  /** Le temps de la question (ms) ; au-delà, elle est fausse et compte tout ce délai. */
  delai_ms: number;
}

/**
 * Le générateur d'un sujet (§ 9.1) : le quiz n'en connaît aucun en
 * particulier. Un sujet de plus = un générateur de plus, son rendu dans
 * sujets.ts et ses niveaux dans notoriete.json. Construit sur des données
 * déjà chargées (src/quiz/generateurs.ts) : la vue les charge avant le tirage.
 */
export interface Generateur {
  sujet: SujetQuiz;
  /**
   * Les lieux du sujet jusqu'à ce niveau (compris), dans un ordre stable ;
   * `forme` : le niveau de ce que la question montre sous cette forme (une
   * capitale : la plus connue au toucher, la principale au QCM).
   */
  lieux(niveauMax: Niveau, forme?: Forme): readonly string[];
  /** Le lieu se pose-t-il sous cette forme ? (Les 9 pays au nom de leur capitale jamais en QCM, D37 c.) */
  posable(id: string, forme: Forme): boolean;
  /** Les entités de sa question (Question.entites). */
  entites(id: string): readonly string[];
  question(id: string, forme: Forme, d: Difficulte, hasard: () => number): Question;
}
