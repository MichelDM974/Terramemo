// Cibles de l'essai de précision du J0 (pur).
import type { Pays } from '../map/types';

const PACIFIQUE = new Set(['Melanesia', 'Micronesia', 'Polynesia']);
/** Quelques grands pays, pour comparer avec les petits. */
export const GRANDS = ['RUS', 'CAN', 'BRA', 'AUS', 'CHN', 'DZA'];

/** Tous les micro-États, les Caraïbes, le Pacifique et quelques grands pays (jouables), sans doublon. */
export function ciblesEssai(pays: readonly Pays[]): string[] {
  const jouables = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel');
  const ids = new Set<string>();
  for (const p of jouables) if (p.micro) ids.add(p.id);
  for (const p of jouables) if (p.sous_region === 'Caribbean') ids.add(p.id);
  for (const p of jouables) if (PACIFIQUE.has(p.sous_region)) ids.add(p.id);
  for (const id of GRANDS) if (jouables.some((p) => p.id === id)) ids.add(id);
  return [...ids];
}

export function melanger<T>(t: readonly T[], aleatoire: () => number = Math.random): T[] {
  const r = [...t];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1));
    [r[i], r[j]] = [r[j] as T, r[i] as T];
  }
  return r;
}
