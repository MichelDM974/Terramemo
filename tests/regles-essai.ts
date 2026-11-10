// Les règles du dépôt (firestore.rules) avec un autre corps pour essai()
// (étude du J1b, § 6) : `joueurs/` y est fermé jusqu'au lot 6 (`return
// false;`), puis aux seules adresses d'essai de l'utilisateur (lots 6 et 7),
// puis à tout compte depuis l'ouverture du 11/11 (`return true;`) ; les
// tests le remplacent au chargement, par `return true;` ou par une liste
// d'essai de test.
import { readFileSync } from 'node:fs';

export const REGLES = readFileSync('firestore.rules', 'utf8');

/** essai() de la version du dépôt, quel que soit son corps (sans accolade). */
export const ESSAI_DU_DEPOT = /function essai\(\) \{[^{}]*\}/;


/** Les règles du dépôt, essai() rendant `corps` (une instruction return). */
export function reglesAvecEssai(corps: string): string {
  if (!ESSAI_DU_DEPOT.test(REGLES)) throw new Error('essai() introuvable dans firestore.rules');
  return REGLES.replace(ESSAI_DU_DEPOT, `function essai() {\n      ${corps}\n    }`);
}
