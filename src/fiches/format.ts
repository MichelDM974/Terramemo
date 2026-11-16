// Nombres et listes des fiches des lieux (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.1 et § 6.5) : la langue
// en paramètre (décision « Langue » : les mots viennent de textes.fiche, les
// chiffres de toLocaleString), espace insécable avant l'unité, comme fmtKm
// (src/vues/commun.ts). La barre donne trois chiffres au plus (« 123
// millions », « 56 800 ») ; la fiche, le nombre entier.
import { remplir, textes } from '../vues/textes';

/** La locale des nombres et des listes, par langue des textes (le français seul pour l'instant). */
const LOCALES: Readonly<Record<string, string>> = { fr: 'fr-FR' };
const locale = (langue: string): string => LOCALES[langue] ?? langue;

/** Le nombre entier, groupé par milliers (« 123 366 734 »). */
export const fmtEntier = (n: number, langue = 'fr'): string => Math.round(n).toLocaleString(locale(langue));

/** Arrondi à trois chiffres significatifs (56 789 → 56 800 ; 5 412 345 → 5 410 000). */
export function troisChiffres(n: number): number {
  if (n === 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 2);
  return p >= 1 ? Math.round(n / p) * p : Math.round(n);
}

/**
 * Trois chiffres au plus : « 836 », « 56 800 », « 5,41 millions », « 68,7
 * millions », « 123 millions », « 1,42 milliard ». Le pluriel du mot à partir
 * de 2 (« 1,5 million »).
 */
export function fmtNombreCourt(n: number, langue = 'fr'): string {
  const T = textes.fiche.nombres;
  const r = troisChiffres(n);
  const loc = locale(langue);
  const mot = (x: number, un: string, plusieurs: string) => remplir(x >= 2 ? plusieurs : un, { n: x.toLocaleString(loc, { maximumFractionDigits: 2 }) });
  // r a déjà ses trois chiffres : deux décimales au plus suffisent à les dire tous.
  if (Math.abs(r) >= 1e9) return mot(r / 1e9, T.milliard, T.milliards);
  if (Math.abs(r) >= 1e6) return mot(r / 1e6, T.million, T.millions);
  return r.toLocaleString(loc);
}

/** Une liste lue : « La Paz et Sucre », « A, B et C » (Intl.ListFormat ; à défaut, des virgules). */
export function listeEt(elements: readonly string[], langue = 'fr'): string {
  try {
    return new Intl.ListFormat(locale(langue), { style: 'long', type: 'conjunction' }).format(elements);
  } catch {
    return elements.join(', ');
  }
}
