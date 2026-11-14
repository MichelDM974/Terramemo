// Le tirage d'une partie (étude J2 § 9.2 ; D49 a) :
//   1. les sujets prêts se partagent les 20 questions à parts égales (5 chacun à
//      4 sujets ; à 3, 7, 7 et 6), le reste au hasard ;
//   2. les formes de la difficulté sont mélangées et réparties sur les questions ;
//   3. pour chaque question, un lieu au hasard parmi ceux du sujet et du niveau,
//      jamais deux fois la même entité, tous sujets confondus ;
//   4. l'ordre final est mélangé.
// Pourquoi des formes fixes : un QCM pris au hasard est juste une fois sur 4, un
// toucher presque jamais ; tirées, elles feraient peser la chance du tirage plus
// que le joueur. Pourquoi des parts égales : au prorata, les 50 mers
// disparaîtraient sous 195 pays × 3.
import { QUESTIONS_QUIZ } from '../epreuve/chrono';
import { melanger } from '../vues/cibles';
import { auHasard } from './hasard';
import { REGLES } from './regles';
import type { Difficulte, Forme, Generateur, Question } from './types';

/** Les parts de chaque générateur sur `n` questions : égales, le reste à des sujets tirés au hasard. */
export function parts(nGenerateurs: number, hasard: () => number, n = QUESTIONS_QUIZ): number[] {
  if (nGenerateurs < 1) throw new Error('quiz : aucun sujet prêt');
  const base = Math.floor(n / nGenerateurs);
  const p = Array.from({ length: nGenerateurs }, () => base);
  for (const i of melanger([...p.keys()], hasard).slice(0, n - base * nGenerateurs)) p[i]!++;
  return p;
}

/**
 * Les 20 questions d'une partie de cette difficulté, sur les générateurs des
 * sujets prêts. Un sujet dont le niveau n'a plus de lieu libre (toutes ses
 * entités déjà prises) puise dans tous ses lieux ; lève s'il n'en reste aucun.
 */
export function tirerPartie(gens: readonly Generateur[], d: Difficulte, hasard: () => number = Math.random): Question[] {
  const regle = REGLES[d];
  const p = parts(gens.length, hasard);
  const sujets = gens.flatMap((g, i) => Array.from({ length: p[i]! }, () => g));
  const formes = melanger(
    Array.from({ length: QUESTIONS_QUIZ }, (_, i): Forme => (i < regle.qcm ? 'qcm' : 'toucher')),
    hasard,
  );
  // Les questions dans un ordre tiré, pour qu'aucun sujet ne prenne d'office les entités des autres.
  const places = melanger(
    sujets.map((g, i) => ({ g, forme: formes[i]! })),
    hasard,
  );
  const prises = new Set<string>();
  const questions: Question[] = [];
  for (const { g, forme } of places) {
    const libre = (id: string) => g.posable(id, forme) && g.entites(id).every((e) => !prises.has(e));
    const id = auHasard(g.lieux(regle.niveauMax, forme).filter(libre), hasard) ?? auHasard(g.lieux(3).filter(libre), hasard);
    if (id === undefined) throw new Error(`quiz : plus de lieu libre pour ${g.sujet} (${forme})`);
    for (const e of g.entites(id)) prises.add(e);
    questions.push(g.question(id, forme, d, hasard));
  }
  return melanger(questions, hasard);
}
