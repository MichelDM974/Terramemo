// Comparaison de noms sans accents ni casse (vue Saisie du J0). Aucun mot n'est
// retiré : « république de » confondrait les deux Congo (plan, « Données »).

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

/** Noms qui commencent par ce qui est tapé, dans l'ordre alphabétique français. */
export function suggestions(tape: string, noms: readonly string[], max = 8): string[] {
  const n = normaliser(tape);
  if (!n) return [];
  return noms
    .filter((nom) => normaliser(nom).startsWith(n))
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .slice(0, max);
}
