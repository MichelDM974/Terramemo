// Les règles du dépôt (firestore.rules) avec un autre corps pour essai()
// (étude du J1b, § 6) : `joueurs/` y est fermé jusqu'au lot 6 (`return
// false;`), puis ouvert aux seules adresses d'essai de l'utilisateur (lots 6
// et 7) ; les tests le remplacent au chargement, par `return true;` ou par
// une liste d'essai de test.
import { readFileSync } from 'node:fs';

export const REGLES = readFileSync('firestore.rules', 'utf8');

/** essai() de la version du dépôt, quel que soit son corps (sans accolade). */
export const ESSAI_DU_DEPOT = /function essai\(\) \{[^{}]*\}/;

/** Les adresses d'essai des lots 6 et 7 (données par l'utilisateur le 10/11). */
export const ADRESSES_D_ESSAI = ['micheldm0301@gmail.com', 'micheldm974@yahoo.fr'];

/** Les règles du dépôt, essai() rendant `corps` (une instruction return). */
export function reglesAvecEssai(corps: string): string {
  const r = REGLES.replace(ESSAI_DU_DEPOT, `function essai() {\n      ${corps}\n    }`);
  if (r === REGLES) throw new Error('essai() introuvable dans firestore.rules');
  return r;
}
