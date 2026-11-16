// Données des fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 2.7 et § 6.1) : public/geo/fiches-monde.json et son fichier de langue
// fiches-monde.fr.json (geodata/fiches.mjs), lus une fois, au premier toucher
// d'un lieu du monde, jamais au premier affichage (le smoke du pilote le
// vérifie) : la barre en tire sa ligne de faits et son chevron. Sur le modèle
// des capitales (src/map/capitales.ts) : une promesse gardée, un échec (hors
// ligne) qui ne reste pas en cache, relancé au toucher suivant. Les mers et
// les communes auront leurs fichiers (lots F4 et F5) : qui ne touche que des
// pays ne les paie pas.
import type { SorteLieu } from './sorte';

/** La version du format, écrite par geodata/fiches.mjs (VERSION_FICHES). */
export const VERSION_FICHES = 1;

/** Ce que fiches-monde.json dit d'un lieu (sans langue). */
interface FicheBrute {
  s: SorteLieu;
}

/** Ce que fiches-monde.fr.json dit d'un lieu (de la langue). */
interface TexteBrut {
  /** Titre de la Wikipédia de la langue (les 197 pays ; les autres au lot F3). */
  wp?: string;
}

export interface FichierMonde {
  v: number;
  lieux: Record<string, FicheBrute>;
}

export interface FichierMondeLangue {
  v: number;
  sous_regions: Record<string, string>;
  lieux: Record<string, TexteBrut>;
}

/** La fiche d'un lieu du monde, telle que la barre et la fiche la lisent. */
export interface FicheMonde {
  sorte: SorteLieu;
  /** Titre de l'article de la Wikipédia de la langue, ou null (pas de lien). */
  wp: string | null;
}

export interface DonneesFichesMonde {
  /** Par id de pays.json : les 258 entités. Un lieu absent n'a pas de fiche. */
  lieux: ReadonlyMap<string, FicheMonde>;
  /** Nom de chaque sous-région de pays.json (« Eastern Asia » → « Asie de l'Est »). */
  sousRegions: Readonly<Record<string, string>>;
}

/** Les deux fichiers assemblés ; lève sur une autre version du format. */
export function lireFichesMonde(m: FichierMonde, fr: FichierMondeLangue): DonneesFichesMonde {
  if (m.v !== VERSION_FICHES || fr.v !== VERSION_FICHES) throw new Error(`fiches-monde : version ${m.v} / ${fr.v}, attendue ${VERSION_FICHES}`);
  const lieux = new Map<string, FicheMonde>();
  for (const [id, f] of Object.entries(m.lieux)) lieux.set(id, { sorte: f.s, wp: fr.lieux[id]?.wp ?? null });
  return { lieux, sousRegions: fr.sous_regions };
}

/** Lit un fichier JSON servi ; « <fichier> : HTTP xxx » levé comme les autres chargements. */
export type Lecteur = (chemin: string) => Promise<unknown>;

const lireHttp: Lecteur = async (chemin) => {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error(`${chemin.split('/').pop()} : HTTP ${r.status}`);
  return r.json();
};

let chargees: DonneesFichesMonde | null = null;
let enCours: Promise<DonneesFichesMonde> | null = null;

/**
 * Les fiches du monde, lues une fois (promesse gardée ; un échec ne reste
 * pas en cache : le prochain toucher réessaie). `lire` : les tests.
 */
export function chargerFichesMonde(lire: Lecteur = lireHttp, base = '/geo/'): Promise<DonneesFichesMonde> {
  if (chargees) return Promise.resolve(chargees);
  if (!enCours) {
    const p = Promise.all([lire(`${base}fiches-monde.json`), lire(`${base}fiches-monde.fr.json`)]).then(([m, fr]) => {
      chargees = lireFichesMonde(m as FichierMonde, fr as FichierMondeLangue);
      return chargees;
    });
    enCours = p;
    p.then(
      () => (enCours = null),
      () => (enCours = null),
    );
  }
  return enCours;
}

/** Les fiches du monde si elles sont déjà lues (sans réseau), null sinon. */
export const fichesMondeChargees = (): DonneesFichesMonde | null => chargees;

/** Tests : oublie ce qui a été lu (le prochain chargement relit). */
export function oublierFichesMonde(): void {
  chargees = null;
  enCours = null;
}
