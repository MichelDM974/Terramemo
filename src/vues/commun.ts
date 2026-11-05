import type { CarteAffichee } from '../map/carte';
import type { DonneesCarte } from '../map/donnees';
import type { Statut } from '../map/types';
import type { Mesures } from '../mesure/mesures';
import type { Terrains } from '../terrains';

export interface ContexteVue {
  /** La carte du monde, toujours (explorer, saisie, pilote de mesure) ; un terrain : terrains. */
  carte: CarteAffichee;
  /** Les données du monde, toujours. */
  donnees: DonneesCarte;
  /** Le monde et les terrains locaux (l'île) : charger, montrer (src/terrains.ts). */
  terrains: Terrains;
  mesures: Mesures;
  /** Zone sous l'en-tête (main#app). */
  zone: HTMLElement;
}

export interface Vue {
  activer(): void;
  desactiver(): void;
  /** Un toucher sur la carte (x, y : px CSS relatifs à la carte). */
  toucher?(x: number, y: number, ev: PointerEvent): void;
}

export const LIBELLE_STATUT: Record<Statut, string> = {
  jouable: '',
  optionnel: 'paquet optionnel',
  territoire: 'territoire',
  conteste: 'statut contesté',
  autre: '',
};

export function creer<K extends keyof HTMLElementTagNameMap>(
  nom: K,
  attrs: Record<string, string> = {},
  ...enfants: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(nom);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...enfants);
  return e;
}

/**
 * Nom d'une zone dans les données de son terrain : t.donnees pour une vue qui
 * joue un terrain, ctx.donnees pour le monde (sinon une commune s'affiche
 * « 97407 »). Le contexte entier est encore accepté (noms du monde) tant
 * qu'essai.ts et chrono.ts ne passent pas les données de leur terrain.
 */
export function nomDe(d: { noms: Record<string, string> } | { donnees: { noms: Record<string, string> } }, id: string): string {
  const noms = 'noms' in d ? d.noms : d.donnees.noms;
  return noms[id] ?? id;
}

/**
 * Distance lisible : une décimale sous 10 km (« 2,4 km » : sur l'île, « 0 km »
 * ne dirait rien), l'entier au-delà (« 1 234 km »), espace insécable.
 */
export function fmtKm(km: number): string {
  const dixiemes = Math.round(km * 10) / 10;
  const txt =
    dixiemes < 10
      ? dixiemes.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : Math.round(km).toLocaleString('fr-FR');
  return `${txt}\u00a0km`;
}
