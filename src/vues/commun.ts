import type { CarteAffichee } from '../map/carte';
import { tailleEcranPx } from '../map/pastilles';
import type { DonneesCarte } from '../map/donnees';
import type { Statut } from '../map/types';
import type { Mesures } from '../mesure/mesures';
import type { Terrain, Terrains } from '../terrains';
import type { Serie } from './cibles';
import { textes } from './textes';

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
 * « 97407 »).
 */
export function nomDe(d: { noms: Record<string, string> }, id: string): string {
  return d.noms[id] ?? id;
}

/** Durée lisible : « 1,2 s », espace insécable avant l'unité. */
export const fmtS = (ms: number): string => `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00a0s`;

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

/** Sous ce côté à l'écran (px CSS), un anneau entoure la zone (micro-États, petites îles). */
export const ANNEAU_SOUS_PX = 12;

/** La zone fait-elle moins de ANNEAU_SOUS_PX à l'écran, au zoom courant de la carte ? */
export function estPetite(t: Pick<Terrain, 'carte' | 'donnees'>, id: string): boolean {
  const e = t.donnees.entites.find((en) => en.pays.id === id);
  return !!e && tailleEcranPx(e.pays, t.carte.projection.scale(), t.carte.transfo.k) < ANNEAU_SOUS_PX;
}

/**
 * Un anneau autour de la zone si elle est petite à l'écran (le Vatican, Petite-Île
 * vue de loin) ; au-dessus, la zone colorée se voit seule, et l'anneau (16 px de
 * rayon) ne ferait que déborder sur ses voisines.
 */
export function anneauSiPetite(t: Pick<Terrain, 'carte' | 'donnees'>, id: string, classe: string): void {
  if (estPetite(t, id)) t.carte.anneau(id, classe);
}

/** Les cibles d'une série dans son terrain chargé : les siennes (monde), ou toutes les zones jouables (l'île). */
export const idsSerie = (s: Serie, t: Terrain): string[] => (s.ids.length ? [...s.ids] : [...t.jouables]);

/**
 * Le terrain d'une série choisie au départ, puis `suite` (avec ses cibles).
 * Déjà chargé (le monde, l'île au second choix) : tout de suite. Sinon
 * (l'île au premier choix) : boutons du départ désactivés et statut le temps
 * du chargement (un double clic ne lance pas deux parties) ; un échec (hors
 * ligne) l'écrit au statut, on reste sur le monde. `encore()` faux à
 * l'arrivée (vue quittée, autre choix) : pas de suite.
 */
export function avecTerrain(
  ctx: ContexteVue,
  s: Serie,
  o: { boutons: readonly HTMLButtonElement[]; statut: HTMLElement; encore: () => boolean },
  suite: (t: Terrain, ids: string[]) => void,
): void {
  const dire = (m: string) => {
    o.statut.textContent = m;
    o.statut.hidden = !m;
  };
  const deja = s.terrain === 'monde' ? ctx.terrains.monde : ctx.terrains.deja(s.terrain);
  if (deja) {
    dire('');
    return suite(deja, idsSerie(s, deja));
  }
  const actifs = o.boutons.filter((b) => !b.disabled);
  for (const b of actifs) b.disabled = true;
  dire(textes.toucher.chargement_terrain);
  const fin = (m: string) => {
    for (const b of actifs) b.disabled = false;
    dire(m);
  };
  ctx.terrains.charger(s.terrain).then(
    (t) => {
      fin('');
      if (o.encore()) suite(t, idsSerie(s, t));
    },
    () => fin(textes.toucher.echec_terrain),
  );
}
