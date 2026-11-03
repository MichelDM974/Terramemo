import type { Carte } from '../map/carte';
import type { DonneesCarte } from '../map/donnees';
import type { Statut } from '../map/types';
import type { Mesures } from '../mesure/mesures';

export interface ContexteVue {
  carte: Carte;
  donnees: DonneesCarte;
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

export function nomDe(ctx: ContexteVue, id: string): string {
  return ctx.donnees.noms[id] ?? id;
}
