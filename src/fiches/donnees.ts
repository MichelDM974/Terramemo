// Données des fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 2.7 et § 6.1) : la forme de public/geo/fiches-monde.json et de son fichier de
// langue fiches-monde.fr.json (geodata/fiches.mjs), des fichiers des mers (lot F4)
// et des communes de La Réunion (lot F5), et leur lecture (lire*). Ce module part
// avec le morceau de la fiche (src/vues/fiche.ts les réexporte), jamais avec le
// morceau principal : le chargeur (src/fiches/chargeur.ts, au morceau principal)
// demande les fichiers et ce morceau ensemble, au premier toucher d'un lieu, puis
// les lit par lui (§ 19 de l'étude). Seuls des types s'en importent ailleurs.
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
  /** Habitants, leur année ; hs « wd » : de Wikidata (sinon la Banque mondiale). 0 sans année : aucun habitant permanent (lot F3). */
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
  /** Titre de la Wikipédia de la langue (257 lieux : tous sauf l'île Brésilienne). */
  wp?: string;
  /** Territoire (lot F3) : le nom de sa capitale (Wikidata P36) ; un pays a les siennes dans capitales.fr.json. */
  ca?: string;
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
  /** Territoire ou zone contestée (lot F3) : le statut écrit à la main, en entier (relu : LIGNES_RELUES.statut). */
  statut?: string;
  /** Territoire : le nom de sa capitale. */
  capitale?: string;
  /** Titre de l'article de la Wikipédia de la langue, ou null (pas de lien). */
  wp: string | null;
  /** source « wd » : Wikidata (Taïwan, Vatican, des territoires et des zones), sinon la Banque mondiale ; annee null : 0, aucun habitant permanent. */
  habitants?: { n: number; annee: number | null; source: 'bm' | 'wd' };
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
  if (t.st) f.statut = t.st;
  if (t.ca) f.capitale = t.ca;
  if (b.h !== undefined && (b.ha !== undefined || b.h === 0)) f.habitants = { n: b.h, annee: b.h === 0 ? null : b.ha!, source: b.hs === 'wd' ? 'wd' : 'bm' };
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

// --- Drapeaux des territoires (lot F3) --------------------------------------------------

/** Le manifeste public/geo/drapeaux-territoires.json (geodata/drapeaux.mjs) : l'empreinte du drapeau de chaque territoire. */
export interface ManifesteDrapeauxTerritoires {
  v: number;
  territoires: Record<string, string>;
}

/** L'adresse du drapeau de chaque territoire qui en a un (les 40 qui ont un code ISO). */
export type DrapeauxTerritoires = ReadonlyMap<string, string>;

/** Le manifeste lu : id → adresse du drapeau (base : « /geo/ »). */
export function lireDrapeauxTerritoires(m: ManifesteDrapeauxTerritoires, base = '/geo/'): DrapeauxTerritoires {
  if (m.v !== 1) throw new Error(`drapeaux-territoires : version ${m.v}, attendue 1`);
  return new Map(Object.entries(m.territoires).map(([id, h]) => [id, `${base}drapeaux-territoires/${h}.svg`]));
}

// --- Océans et mers (lot F4) -------------------------------------------------------------

/** La source d'une superficie ou d'une profondeur de mer hors de Wikidata : le tracé de Natural Earth, Wikipédia, la NOAA (océans). */
export type SourceMer = 'ne' | 'wp' | 'noaa';

/** Ce que fiches-mers.json dit d'une zone (geodata/fiches.mjs en décrit chaque clé). */
interface FicheMerBrute {
  s: 'mer';
  sup?: number;
  ss?: SourceMer;
  p?: number;
  ps?: SourceMer;
  r?: readonly string[];
}

export interface FichierMers {
  v: number;
  lieux: Record<string, FicheMerBrute>;
}

export interface FichierMersLangue {
  v: number;
  lieux: Record<string, { wp?: string }>;
}

/** La fiche d'une zone marine : ses chiffres ; sa sorte, sa mère et son océan viennent de mers.json (déjà là avec la couche). */
export interface FicheMer {
  /** Superficie en km², arrondie à trois chiffres ; source : hors de Wikidata. */
  superficie?: { km2: number; source?: SourceMer };
  /** Profondeur maximale en m. */
  profondeur?: { m: number; source?: SourceMer };
  /** Les pays riverains (ids de pays.json) ; vide pour un océan et la mer des Sargasses. */
  riverains: readonly string[];
  /** Titre de l'article de la Wikipédia de la langue, ou null. */
  wp: string | null;
}

export type DonneesFichesMers = ReadonlyMap<string, FicheMer>;

/** Les deux fichiers des mers assemblés ; lève sur une autre version du format. */
export function lireFichesMers(m: FichierMers, fr: FichierMersLangue): DonneesFichesMers {
  if (m.v !== VERSION_FICHES || fr.v !== VERSION_FICHES) throw new Error(`fiches-mers : version ${m.v} / ${fr.v}, attendue ${VERSION_FICHES}`);
  const res = new Map<string, FicheMer>();
  for (const [id, b] of Object.entries(m.lieux)) {
    const f: FicheMer = { riverains: b.r ?? [], wp: fr.lieux[id]?.wp ?? null };
    if (b.sup !== undefined) f.superficie = { km2: b.sup, ...(b.ss ? { source: b.ss } : {}) };
    if (b.p !== undefined) f.profondeur = { m: b.p, ...(b.ps ? { source: b.ps } : {}) };
    res.set(id, f);
  }
  return res;
}

// --- Communes de La Réunion (lot F5) -----------------------------------------------------

/** Ce que reunion/fiches.json dit d'une commune (geodata/reunion.mjs, d'après l'IGN). */
interface FicheCommuneBrute {
  s: 'commune';
  /** Habitants (population municipale du recensement de l'INSEE) et l'année du recensement. */
  h: number;
  ha: number;
  /** Superficie cadastrale, en km². */
  sup: number;
  /** SIREN de l'intercommunalité. */
  ic: string;
}

export interface FichierCommunes {
  v: number;
  lieux: Record<string, FicheCommuneBrute>;
}

export interface FichierCommunesLangue {
  v: number;
  /** Le sigle de chaque intercommunalité, par SIREN (CIVIS, TCO…). */
  intercommunalites: Record<string, string>;
  lieux: Record<string, { wp?: string; g?: string; gp?: string; gs?: SourceLigne }>;
}

/** La fiche d'une commune ; son nom et ses voisines viennent des données de l'île (déjà là avec la carte). */
export interface FicheCommune {
  /** Habitants et l'année de leur recensement (2023). */
  habitants: { n: number; annee: number };
  /** Superficie cadastrale en km² (le chiffre officiel, pas le tracé). */
  superficie: number;
  /** Le sigle de l'intercommunalité ; absent si le fichier de la langue n'en a pas. */
  intercommunalite?: string;
  /** Le pluriel du gentilé (« Saint-Pierrois ») ; sa source hors de Wikidata. */
  gentils?: string;
  gentilsSource?: SourceLigne;
  /** Titre de l'article de la Wikipédia de la langue, ou null. */
  wp: string | null;
}

export type DonneesFichesCommunes = ReadonlyMap<string, FicheCommune>;

/** Les deux fichiers des communes assemblés ; lève sur une autre version du format. */
export function lireFichesCommunes(m: FichierCommunes, fr: FichierCommunesLangue): DonneesFichesCommunes {
  if (m.v !== VERSION_FICHES || fr.v !== VERSION_FICHES) throw new Error(`fiches des communes : version ${m.v} / ${fr.v}, attendue ${VERSION_FICHES}`);
  const res = new Map<string, FicheCommune>();
  for (const [id, b] of Object.entries(m.lieux)) {
    const t = fr.lieux[id] ?? {};
    const f: FicheCommune = { habitants: { n: b.h, annee: b.ha }, superficie: b.sup, wp: t.wp ?? null };
    const sigle = fr.intercommunalites[b.ic];
    if (sigle) f.intercommunalite = sigle;
    if (t.gp) f.gentils = t.gp;
    if (t.gp && t.gs) f.gentilsSource = t.gs;
    res.set(id, f);
  }
  return res;
}
