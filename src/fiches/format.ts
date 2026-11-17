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

/**
 * Les formateurs d'Intl, un par locale et par réglage, gardés : le premier créé charge ses données ICU
 * (Intl.ListFormat : 22 ms sur l'A37, à la première fiche, le 17/11), les suivants ne coûtent presque rien.
 * toLocaleString(locale, options) en recréait un à chaque nombre.
 */
const formateurs = new Map<string, Intl.NumberFormat | Intl.ListFormat | null>();
function formateur<F extends Intl.NumberFormat | Intl.ListFormat>(cle: string, creer: () => F): F | null {
  if (!formateurs.has(cle)) {
    let f: F | null = null;
    try {
      f = creer();
    } catch {
      f = null;
    }
    formateurs.set(cle, f);
  }
  return formateurs.get(cle) as F | null;
}
const nombres = (loc: string, decimales?: number): Intl.NumberFormat =>
  formateur(`n:${loc}:${decimales ?? ''}`, () => new Intl.NumberFormat(loc, decimales === undefined ? undefined : { maximumFractionDigits: decimales }))!;
const listes = (loc: string): Intl.ListFormat | null => formateur(`l:${loc}`, () => new Intl.ListFormat(loc, { style: 'long', type: 'conjunction' }));

/**
 * Les formateurs créés d'avance, au repos après le premier toucher d'un lieu (explorer.ts) : la première
 * fiche ne paie pas leur création pendant sa montée (§ 6.4).
 */
export function prechaufferFormats(langue = 'fr'): void {
  const loc = locale(langue);
  nombres(loc);
  nombres(loc, 2);
  listes(loc);
}

/** Le nombre entier, groupé par milliers (« 123 366 734 »). */
export const fmtEntier = (n: number, langue = 'fr'): string => nombres(locale(langue)).format(Math.round(n));

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
  const mot = (x: number, un: string, plusieurs: string) => remplir(x >= 2 ? plusieurs : un, { n: nombres(loc, 2).format(x) });
  // r a déjà ses trois chiffres : deux décimales au plus suffisent à les dire tous.
  if (Math.abs(r) >= 1e9) return mot(r / 1e9, T.milliard, T.milliards);
  if (Math.abs(r) >= 1e6) return mot(r / 1e6, T.million, T.millions);
  return nombres(loc).format(r);
}

/** Une liste lue : « La Paz et Sucre », « A, B et C » (Intl.ListFormat ; à défaut, des virgules). */
export function listeEt(elements: readonly string[], langue = 'fr'): string {
  const f = listes(locale(langue));
  return f ? f.format(elements) : elements.join(', ');
}
