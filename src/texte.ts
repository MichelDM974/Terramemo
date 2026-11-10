// Comparaison de noms sans accents ni casse (vue Saisie du J0, recherche de
// l'en-tête). Aucun mot n'est retiré : « république de » confondrait les deux
// Congo (plan, « Données »).

export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[-‐‑–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre de noms proposés au plus. */
export const MAX_SUGGESTIONS = 8;

/** Noms qui commencent par ce qui est tapé, dans l'ordre alphabétique français. */
export function suggestions(tape: string, noms: readonly string[], max = MAX_SUGGESTIONS): string[] {
  const n = normaliser(tape);
  if (!n) return [];
  return noms
    .filter((nom) => normaliser(nom).startsWith(n))
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .slice(0, max);
}

/**
 * Recherche de lieux (barre de l'en-tête) : ceux dont le nom commence par ce
 * qui est tapé, puis ceux dont un mot commence ainsi (« congo » : les deux
 * Congo, « denis » : Saint-Denis, « etang » : L'Étang-Salé), sans accents ni
 * casse ; à rang égal, l'ordre alphabétique français. Un lieu peut avoir des
 * alias (les capitales : Kyiv, Beijing), cherchés comme son nom.
 */
export function chercherLieux<T extends { nom: string; alias?: readonly string[] }>(tape: string, lieux: readonly T[], max = MAX_SUGGESTIONS): T[] {
  const n = normaliser(tape);
  if (!n) return [];
  const debut: T[] = [];
  const mot: T[] = [];
  for (const l of lieux) {
    // Le nom, puis ses autres graphies (« kyiv » trouve Kiev, « beijing » Pékin) : le meilleur rang des deux.
    const noms = [l.nom, ...(l.alias ?? [])].map(normaliser);
    if (noms.some((x) => x.startsWith(n))) debut.push(l);
    else if (noms.some((x) => x.includes(` ${n}`) || x.includes(`'${n}`))) mot.push(l);
  }
  const ordre = (a: T, b: T) => a.nom.localeCompare(b.nom, 'fr');
  return [...debut.sort(ordre), ...mot.sort(ordre)].slice(0, max);
}

/** Distance d'édition (Levenshtein) entre deux chaînes. */
function distanceEdition(a: string, b: string): number {
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const ligne = [i];
    for (let j = 1; j <= b.length; j++) ligne[j] = Math.min(prec[j]! + 1, ligne[j - 1]! + 1, prec[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prec = ligne;
  }
  return prec[b.length]!;
}

/** Longueur du début commun qui rend deux noms proches (« Saint-Georges », « Saint-John's »). */
export const DEBUT_PROCHE = 4;

/**
 * Deux noms se confondent-ils (étude J2 § 2.1, leurres du quiz facile et
 * moyen) : sans accents ni casse, une distance d'édition de 2 au plus
 * (Kingston et Kingstown, Budapest et Bucarest, Riga et Riyad), ou les mêmes
 * DEBUT_PROCHE premiers caractères. Un nom identique compte aussi.
 */
export function nomsProches(a: string, b: string): boolean {
  const x = normaliser(a);
  const y = normaliser(b);
  if (x.length >= DEBUT_PROCHE && y.length >= DEBUT_PROCHE && x.slice(0, DEBUT_PROCHE) === y.slice(0, DEBUT_PROCHE)) return true;
  return distanceEdition(x, y) <= 2;
}
