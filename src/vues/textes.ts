// Textes de l'interface des vues (décision « Langue ») : le français seul pour
// l'instant ; une autre langue sera un textes.<langue>.json de même forme.
import fr from './textes.fr.json';

export type Textes = typeof fr;
export const textes: Textes = fr;

/** Remplace {cle} par sa valeur : « {n} pays » → « 54 pays ». */
export function remplir(modele: string, valeurs: Record<string, string | number>): string {
  return modele.replace(/\{(\w+)\}/g, (tout, cle: string) => (cle in valeurs ? String(valeurs[cle]) : tout));
}
