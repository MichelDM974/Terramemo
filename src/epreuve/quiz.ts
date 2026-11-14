// Une partie du quiz général (étude J2 § 9.3, pur) : 20 questions tirées
// (src/quiz/tirage.ts), à 4 choix ou au toucher, chacune avec son délai.
// Barème (décision « Barème et classements », 12/11 : le quiz naît au barème
// 2) : chaque question est juste ou fausse, le score est la part de justes
// (justes ÷ 20, « 17/20 · 85 % »), départagé par le temps total, où chaque
// temps est borné par le délai de sa question et où une question sans
// réponse compte tout son délai. Fin (D55 a, décision « Quiz général ») : une
// partie compte dès que sa première question est montrée ; un abandon publie
// le score acquis, les questions sans réponse valant 0 et tout leur délai.
// Sinon, comme « Rejouer » refait un tirage, on abandonnerait dès qu'une
// question difficile tombe jusqu'à un tirage facile.
import type { Question, SujetQuiz } from '../quiz/types';
import type { ScoreEpreuve } from './bareme';
import { PartieChrono, type QuestionJouee } from './chrono';

/** Identifiant du classement d'une difficulté (§ 9.4), dans chrono.ts avec les autres ids (epreuvesClassees les liste). */
export { idQuiz } from './chrono';

export class PartieQuiz extends PartieChrono {
  private montree = false;

  constructor(readonly questions: readonly Question[]) {
    super(
      questions.map((q) => q.cible),
      Math.max(0, ...questions.map((q) => q.delai_ms)),
    );
  }

  protected override delaiQuestion(i: number): number {
    return this.questions[i]?.delai_ms ?? this.delai_ms;
  }

  /** La question en cours ; undefined une fois la partie finie. */
  get question(): Question | undefined {
    return this.questions[this.i];
  }

  /** La question en cours est montrée (la vue l'appelle à l'affichage) : dès la première, la partie compte (D55 a). */
  montrer(): void {
    if (!this.finie) this.montree = true;
  }

  /** La partie compte-t-elle (bilan, record, classement) ? Dès sa première question montrée, même abandonnée ensuite. */
  get compte(): boolean {
    return this.montree;
  }

  /** Le choix d'une question à 4 choix : juste si c'est la cible. */
  repondreChoix(choisi: string, temps_ms: number): QuestionJouee {
    return this.repondre(choisi, choisi === this.courante, null, temps_ms);
  }

  /**
   * Le score sur les 20 questions : les justes dans leur délai ; le temps,
   * chaque réponse bornée par le délai de sa question, et tout le délai pour
   * une question expirée ou pas jouée (une partie abandonnée).
   */
  override score(): ScoreEpreuve {
    let justes = 0;
    let temps_ms = 0;
    this.questions.forEach((q, i) => {
      const j = this.jouees[i];
      justes += j?.points ?? 0;
      temps_ms += j?.temps_ms == null ? q.delai_ms : Math.min(j.temps_ms, q.delai_ms);
    });
    return { points: justes, justes, questions: this.questions.length, temps_ms };
  }

  /** Le détail par sujet du bilan (« Capitales 4/5 ») : justes et questions de chaque sujet, dans l'ordre de leur première question. */
  parSujet(): Map<SujetQuiz, { justes: number; questions: number }> {
    const m = new Map<SujetQuiz, { justes: number; questions: number }>();
    this.questions.forEach((q, i) => {
      const s = m.get(q.sujet) ?? { justes: 0, questions: 0 };
      s.questions++;
      s.justes += this.jouees[i]?.points ?? 0;
      m.set(q.sujet, s);
    });
    return m;
  }
}
