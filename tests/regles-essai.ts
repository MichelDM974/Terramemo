// Les règles du dépôt (firestore.rules) avec un autre corps pour essai()
// (étude du J1b, § 6) : `joueurs/` y est fermé jusqu'au lot 6 (`return
// false;`) ; les tests le remplacent au chargement, par `return true;` ou par
// la liste d'essai des lots 6 et 7.
import { readFileSync } from 'node:fs';

export const REGLES = readFileSync('firestore.rules', 'utf8');

/** Le corps d'essai() de la version du dépôt, fermée jusqu'au lot 6. */
export const ESSAI_DU_DEPOT = /function essai\(\) \{\n\s*return false;\n\s*\}/;

/** Les règles du dépôt, essai() rendant `corps` (une instruction return). */
export function reglesAvecEssai(corps: string): string {
  const r = REGLES.replace(ESSAI_DU_DEPOT, `function essai() {\n      ${corps}\n    }`);
  if (r === REGLES) throw new Error('essai() fermé introuvable dans firestore.rules');
  return r;
}
