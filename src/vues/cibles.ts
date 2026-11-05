// Cibles de la vue « Toucher » (pur) : l'essai de précision du J0 et les autres séries.
import { REUNION, type DefTerrain } from '../map/terrain';
import type { NomTerrain, Pays } from '../map/types';

/**
 * Ce qu'une série peut demander : les 195 pays jouables (193 membres de l'ONU,
 * Vatican, Palestine) ; jamais un territoire ni une zone contestée. Le paquet
 * optionnel (Kosovo, Taïwan : décision « Pays et frontières ») n'est posé que
 * s'il est activé, réglage qui n'existe pas encore.
 */
export const estJouable = (p: Pays): boolean => p.statut === 'jouable';

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

/**
 * Série de Toucher et du Chrono : 'essai', 'tous' ou un continent (champ
 * continent de pays.json) dans le monde ; un terrain local (l'île) sinon.
 */
export interface Serie {
  id: string;
  terrain: NomTerrain;
  /** Cibles ; vide tant que le terrain n'est pas chargé (l'île) : t.jouables au départ. */
  ids: string[];
  /** Nombre affiché dans la liste (ids.length pour le monde, DefTerrain.n sinon). */
  n: number;
}

export const SERIE_ESSAI = 'essai';
export const SERIE_TOUS = 'tous';
export const SERIE_REUNION = 'reunion';

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
    .sort(([a], [b]) => nomContinent(a).localeCompare(nomContinent(b), 'fr'))
    .map(([id, ids]) => serieMonde(id, ids));
  return [serieMonde(SERIE_ESSAI, ciblesEssai(pays)), serieMonde(SERIE_TOUS, jouables.map((p) => p.id)), ...continents];
}

const serieMonde = (id: string, ids: string[]): Serie => ({ id, terrain: 'monde', ids, n: ids.length });

/**
 * La série d'un terrain local : toutes ses zones jouables, dans le désordre au
 * départ. Les ids viennent du terrain chargé ; avant, le nombre de la DefTerrain.
 */
export function serieTerrain(def: DefTerrain): Serie {
  return { id: def.nom, terrain: def.nom, ids: [], n: def.n };
}

/** Les séries de Toucher : celles du monde, puis l'île (une série de plus, en dernier). */
export function seriesToucher(pays: readonly Pays[], nomContinent: (c: string) => string): Serie[] {
  return [...series(pays, nomContinent), serieTerrain(REUNION)];
}
