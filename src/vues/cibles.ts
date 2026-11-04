// Cibles de la vue « Toucher » (pur) : l'essai de précision du J0 et les autres séries.
import type { Pays } from '../map/types';

/**
 * Ce qu'une série peut demander : les jouables et le paquet optionnel (Kosovo,
 * Taïwan), comme l'essai du J0 ; jamais un territoire ni une zone contestée.
 */
export const estJouable = (p: Pays): boolean => p.statut === 'jouable' || p.statut === 'optionnel';

const PACIFIQUE = new Set(['Melanesia', 'Micronesia', 'Polynesia']);
/** Quelques grands pays, pour comparer avec les petits. */
export const GRANDS = ['RUS', 'CAN', 'BRA', 'AUS', 'CHN', 'DZA'];

/** Tous les micro-États, les Caraïbes, le Pacifique et quelques grands pays (jouables), sans doublon. */
export function ciblesEssai(pays: readonly Pays[]): string[] {
  const jouables = pays.filter(estJouable);
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

/** Série de la vue « Toucher » : 'essai', 'tous', ou un continent (champ continent de pays.json). */
export interface Serie {
  id: string;
  ids: string[];
}

export const SERIE_ESSAI = 'essai';
export const SERIE_TOUS = 'tous';

/**
 * Les séries proposées : l'essai du J0 (ce que vise le pilote de mesure), tous
 * les pays, puis chaque continent qui a au moins un pays, dans l'ordre de leur
 * nom affiché (nomContinent : fichier de langue). Les ids gardent l'ordre de
 * pays.json ; la partie les mélange au départ.
 */
export function series(pays: readonly Pays[], nomContinent: (c: string) => string): Serie[] {
  const jouables = pays.filter(estJouable);
  const parContinent = new Map<string, string[]>();
  for (const p of jouables) {
    const l = parContinent.get(p.continent);
    if (l) l.push(p.id);
    else parContinent.set(p.continent, [p.id]);
  }
  const continents = [...parContinent]
    .map(([id, ids]) => ({ id, ids }))
    .sort((a, b) => nomContinent(a.id).localeCompare(nomContinent(b.id), 'fr'));
  return [
    { id: SERIE_ESSAI, ids: ciblesEssai(pays) },
    { id: SERIE_TOUS, ids: jouables.map((p) => p.id) },
    ...continents,
  ];
}
