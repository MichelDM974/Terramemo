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

/** La source d'une ligne écrite à la main hors de Wikidata : Wikipédia, CIA World Factbook. */
export type SourceLigne = 'wp' | 'fb';

/** Ce que fiches-monde.json dit d'un lieu (sans langue) ; geodata/fiches.mjs en décrit chaque clé. */
interface FicheBrute {
  s: SorteLieu;
  /** Territoire (lot F3) : l'id du pays souverain, la forme de son statut (clé formes_statut de geodata/fiches-main.json). */
  sv?: string;
  fs?: string;
  /** Habitants, leur année ; hs « wd » : de Wikidata (sinon la Banque mondiale). */
  h?: number;
  ha?: number;
  hs?: 'wd';
  /** Superficie en km², de Wikidata (D57). */
  sup?: number;
  /** Altitude du point culminant, en m ; cs : une ligne écrite à la main d'après Wikipédia (wp) ou le World Factbook (fb). */
  alt?: number;
  cs?: SourceLigne;
  /** Zone IANA de l'heure locale ; nombre de fuseaux s'il y en a plusieurs. */
  z?: string;
  nz?: number;
  /** Codes ISO 4217 des monnaies, dans l'ordre. */
  m?: readonly string[];
  /** Codes des langues officielles ; langues parlées par 10 % ou plus, [code, part en %] (D56 c). */
  lo?: readonly string[];
  lp?: readonly (readonly [string, number])[];
  /** Fête nationale [jour, mois]. */
  f?: readonly [number, number];
}

/** Ce que fiches-monde.fr.json dit d'un lieu (de la langue). */
interface TexteBrut {
  /** Territoire ou zone contestée (lot F3) : le statut affiché, écrit en entier (D57). */
  st?: string;
  /** Titre de la Wikipédia de la langue (les 197 pays ; les autres au lot F3). */
  wp?: string;
  /** Gentilé masculin, et son pluriel tout fait (aucune règle de grammaire dans le code). */
  g?: string;
  gp?: string;
  /** Un masculin qui n'est pas une forme de Wikidata : sa source (wp, Wikipédia). */
  gs?: SourceLigne;
  /** Le complément du libellé de l'heure, tout fait, quand « à <capitale> » serait faux (« au Caire »). */
  hc?: string;
  /** Nom du point culminant. */
  cu?: string;
  /** Nom de la fête nationale. */
  fn?: string;
}

export interface FichierMonde {
  v: number;
  lieux: Record<string, FicheBrute>;
}

export interface FichierMondeLangue {
  v: number;
  sous_regions: Record<string, string>;
  langues: Record<string, string>;
  monnaies: Record<string, string>;
  lieux: Record<string, TexteBrut>;
}

/**
 * La fiche d'un lieu du monde, telle que la barre et la fiche la lisent : les
 * noms déjà résolus. Un champ absent : pas de ligne (§ 4.2).
 */
export interface FicheMonde {
  sorte: SorteLieu;
  /** Titre de l'article de la Wikipédia de la langue, ou null (pas de lien). */
  wp: string | null;
  /** source « wd » : Wikidata (Taïwan, Vatican), sinon la Banque mondiale. */
  habitants?: { n: number; annee: number; source: 'bm' | 'wd' };
  superficie?: number;
  /** Les officielles, puis les langues du pays parlées par 10 % ou plus, avec leur part (D56 c). */
  langues?: { officielles: readonly string[]; parlees: readonly { nom: string; part: number }[] };
  monnaies?: readonly string[];
  /** Le pluriel du gentilé (« Japonais ») ; sa source hors de Wikidata. */
  gentils?: string;
  gentilsSource?: SourceLigne;
  /** Zone IANA et nombre de fuseaux (1 sans la clé nz). */
  heure?: { zone: string; fuseaux: number };
  /** « au Caire » : le libellé de l'heure tout fait (sinon « à » et le nom de la capitale). */
  aCapitale?: string;
  /** source : hors de Wikidata, en plus (le pied « Sources » la nomme). */
  culminant?: { nom: string; altitude: number; source?: SourceLigne };
  fete?: { jour: number; mois: number; nom: string };
}

export interface DonneesFichesMonde {
  /** Par id de pays.json : les 258 entités. Un lieu absent n'a pas de fiche. */
  lieux: ReadonlyMap<string, FicheMonde>;
  /** Nom de chaque sous-région de pays.json (« Eastern Asia » → « Asie de l'Est »). */
  sousRegions: Readonly<Record<string, string>>;
}

/** Les noms d'une liste de codes ; un code sans nom est sauté (le test des données en exige un pour chacun). */
const nommer = (codes: readonly string[], noms: Readonly<Record<string, string>>): string[] => codes.flatMap((c) => (noms[c] ? [noms[c]] : []));

/** Une entrée des deux fichiers, les noms résolus ; seuls les champs présents (et complets) sont posés. */
function lireLieu(b: FicheBrute, t: TexteBrut, fr: FichierMondeLangue): FicheMonde {
  const f: FicheMonde = { sorte: b.s, wp: t.wp ?? null };
  if (b.h !== undefined && b.ha !== undefined) f.habitants = { n: b.h, annee: b.ha, source: b.hs === 'wd' ? 'wd' : 'bm' };
  if (b.sup !== undefined) f.superficie = b.sup;
  if (b.lo?.length || b.lp?.length) {
    const parlees = (b.lp ?? []).flatMap(([c, part]) => (fr.langues[c] ? [{ nom: fr.langues[c], part }] : []));
    f.langues = { officielles: nommer(b.lo ?? [], fr.langues), parlees };
  }
  if (b.m?.length) f.monnaies = nommer(b.m, fr.monnaies);
  if (t.gp) f.gentils = t.gp;
  if (t.gp && t.gs) f.gentilsSource = t.gs;
  if (b.z) f.heure = { zone: b.z, fuseaux: b.nz ?? 1 };
  if (t.hc) f.aCapitale = t.hc;
  if (b.alt !== undefined && t.cu) f.culminant = { nom: t.cu, altitude: b.alt, ...(b.cs ? { source: b.cs } : {}) };
  if (b.f && t.fn) f.fete = { jour: b.f[0], mois: b.f[1], nom: t.fn };
  return f;
}

/** Les deux fichiers assemblés ; lève sur une autre version du format. */
export function lireFichesMonde(m: FichierMonde, fr: FichierMondeLangue): DonneesFichesMonde {
  if (m.v !== VERSION_FICHES || fr.v !== VERSION_FICHES) throw new Error(`fiches-monde : version ${m.v} / ${fr.v}, attendue ${VERSION_FICHES}`);
  const lieux = new Map<string, FicheMonde>();
  for (const [id, f] of Object.entries(m.lieux)) lieux.set(id, lireLieu(f, fr.lieux[id] ?? {}, fr));
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
