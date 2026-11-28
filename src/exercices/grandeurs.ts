// Ordres de grandeur, Habitants et Superficies (étude docs/etudes/2026-11-25-j4-conception.md, § 5, lot 3 ; D613 à
// D617), la partie pure : l'échelle logarithmique du curseur, l'arrondi de ce qu'il affiche, le pas des boutons ±, le
// juste à ×1,5, l'union Wikidata ou tracé de fait des pays touchés par une zone disputée, le rapport de la
// rétroaction, les leurres de Reconnaître, les nombres écrits en français, et la lecture des chiffres
// (fiches-monde.json). Ni DOM ni carte. Chargé à la demande (chargerGrandeurs, src/fiches/chargeur.ts), avec la vue
// du curseur : rien de ce fichier n'est au morceau principal (décision « Morceau JS principal sous 500 Ko »), et il
// n'importe du morceau principal que des types (un import de valeur ferait sortir des modules partagés dans un
// morceau préchargé, comme vu au lot 1).
//
// Tout reste en juste ou faux (décision « Barème et classements », D611 a) : l'écart n'est que dans la rétroaction
// et, par la valeur répondue (`estime`, D617 a), dans le journal.
import type { FichierMonde } from '../fiches/donnees';
import type { Pays } from '../map/types';

/** Les deux sujets, du nom de leur domaine (srs/fiches.ts) : l'entité est le pays (`habitants:NGA:localiser`). */
export type SujetGrandeur = 'habitants' | 'superficies';
export const SUJETS_GRANDEUR: readonly SujetGrandeur[] = ['habitants', 'superficies'];
export const estSujetGrandeur = (d: string): d is SujetGrandeur => d === 'habitants' || d === 'superficies';

/** La plage d'un curseur : la valeur la plus petite et la plus grande qu'il donne. */
export interface Plage {
  readonly min: number;
  readonly max: number;
}

/**
 * D614 a : une plage fixe, la même pour toutes les questions du sujet (une plage propre au pays serait un indice) :
 * 100 à 2 milliards d'habitants (le Vatican, 949 ; l'Inde, 1,46 milliard), 0,1 à 20 millions de km² (le Vatican,
 * 0,44 ; la Russie, 17,1 millions). Bornes à un chiffre : arrondies, elles restent elles-mêmes.
 */
export const PLAGES: Readonly<Record<SujetGrandeur, Plage>> = {
  habitants: { min: 100, max: 2e9 },
  superficies: { min: 0.1, max: 2e7 },
};

/** D613 b : juste à ×1,5 près, de −33 % à +50 %, bords compris (§ 5.2 : le curseur au hasard ≈ 5 % de justes). */
export const TOLERANCE = 1.5;
/** D615 a : les leurres de Reconnaître sont à ×3 au moins de la cible et entre eux (aucun choix douteux à ×1,5). */
export const ECART_LEURRES = 3;
/** D614 a : un appui sur − ou + (ou une flèche du clavier) multiplie ou divise la valeur par 1,1. */
export const PAS = 1.1;
/** D614 a : la valeur du curseur, celle de l'énoncé de Reconnaître et `estime` au journal, à 2 chiffres significatifs. */
export const CHIFFRES = 2;
/** Au-delà, un nombre s'écrit en mots (« 230 millions », « 1,4 milliard ») : le texte dit alors « de km² », « d'habitants ». */
export const SEUIL_MOTS = 1e6;
/** Marge des bords compris : un rapport calculé en flottants (237 527 782 / 1,5 × 1,5) ne sort pas de la tolérance. */
const EPS = 1e-9;

/** v à `chiffres` chiffres significatifs (2 : 237 527 782 → 240 000 000 ; 0,437 → 0,44), sans bruit de flottant. */
export const arrondi = (v: number, chiffres = CHIFFRES): number => (Number.isFinite(v) && v !== 0 ? Number(v.toPrecision(chiffres)) : v);

/** v ramené dans la plage. */
export const borner = (v: number, p: Plage): number => Math.min(p.max, Math.max(p.min, v));

/** La position d'une valeur sur le curseur, de 0 (min) à 1 (max), à l'échelle logarithmique ; bornée. */
export function position(v: number, p: Plage): number {
  if (!(v > 0)) return 0;
  const x = (Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min));
  return Math.min(1, Math.max(0, x));
}

/** La valeur exacte à une position (0 à 1, bornée) : l'inverse de position(). */
export function valeurEn(x: number, p: Plage): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
  if (t === 0) return p.min;
  if (t === 1) return p.max;
  return Math.exp(Math.log(p.min) + t * (Math.log(p.max) - Math.log(p.min)));
}

/** La valeur que le curseur affiche à une position : arrondie à 2 chiffres, dans la plage. C'est elle qui est notée et écrite au journal. */
export const valeurCurseur = (x: number, p: Plage): number => borner(arrondi(valeurEn(x, p)), p);

/** D614 a : le départ, le même pour tous, au milieu de la plage sur l'échelle logarithmique (450 000 habitants, 1 400 km²). */
export const depart = (p: Plage): number => valeurCurseur(0.5, p);

/**
 * Un pas des boutons ± ou des flèches (D614 a) : ×1,1 (sens 1) ou ÷1,1 (sens −1), arrondi à 2 chiffres, dans la
 * plage. Toujours un cran au moins à 2 chiffres (un dixième de la valeur fait au moins une unité du 2e chiffre) : le
 * curseur ne reste jamais sur place, sauf à un bord.
 */
export const pas = (v: number, sens: 1 | -1, p: Plage): number => borner(arrondi(sens > 0 ? v * PAS : v / PAS), p);

/** Le rapport de deux valeurs > 0, toujours ≥ 1. */
export const rapportBrut = (a: number, b: number): number => (a > b ? a / b : b / a);

/** D613 b : l'estimation est-elle à ×1,5 d'une des valeurs admises (bords compris) ? */
export const juste = (estime: number, vraies: readonly number[]): boolean =>
  estime > 0 && Number.isFinite(estime) && vraies.some((v) => v > 0 && rapportBrut(estime, v) <= TOLERANCE * (1 + EPS));

/** Le rapport de la rétroaction : « 1,6 fois trop peu », dans le sens qui dépasse 1 (§ 5.2). */
export interface Rapport {
  /** ≥ 1, à 2 chiffres ; jamais 1,5 pour une réponse fausse (« 1,51 fois trop ») : l'écran ne se contredit pas. */
  fois: number;
  /** trop : l'estimation dépasse ; peu : elle est en dessous ; egal : la même valeur. */
  sens: 'trop' | 'peu' | 'egal';
}

export function rapport(estime: number, vraie: number): Rapport {
  if (estime === vraie) return { fois: 1, sens: 'egal' };
  const r = rapportBrut(estime, vraie);
  let fois = arrondi(r);
  // Faux, mais arrondi à 1,5 ou moins : le centième au-dessus (1,503 → 1,51), qui reste au-delà de la tolérance.
  if (r > TOLERANCE * (1 + EPS) && fois <= TOLERANCE) fois = Math.ceil(r * 100) / 100;
  return { fois, sens: estime > vraie ? 'trop' : 'peu' };
}

// --- Données ----------------------------------------------------------------------------------------------------

/**
 * D616 a : les 30 pays touchés par une zone disputée qui pèse 1 % ou plus de leur tracé (étude fiche-lieu, § 2.1 ;
 * paysTouches de geodata/fiches-pays.mjs, recalculée par le build et figée dans geodata/fiches-main.json, clé
 * superficie.touches : tests/grandeurs.test.ts les confronte). Pour eux, la superficie de Wikidata suit tantôt le
 * revendiquant (la Serbie avec le Kosovo, l'Inde avec tout le Cachemire), tantôt l'ONU (le Maroc sans le Sahara
 * occidental) : est juste ce qui tombe à ×1,5 de Wikidata ou du tracé de fait (« juste pour qui tient et pour qui
 * revendique »), les deux cités. Les autres gardent Wikidata seul. Rien de cette liste n'est écrit au journal.
 */
export const PAYS_TOUCHES: ReadonlySet<string> = new Set(
  'ARG AZE BLZ BTN CHN COM CYP EGY GEO GTM GUY IND ISR JPN MAR MDA MHL MUS MYS PAK PHL PSE SDN SOM SRB SSD SUR SYC UKR VEN'.split(' '),
);

/** Ce que les grandeurs lisent d'une entité de la carte (pays.json) : superficie_km2 est l'aire de son tracé de fait. */
export type PaysGrandeur = Pick<Pays, 'id' | 'statut' | 'continent' | 'superficie_km2'>;

/** Les chiffres d'un pays jouable. */
export interface Grandeur {
  id: string;
  continent: string;
  /** Habitants (fiches-monde.json, h) et leur année ; source : la Banque mondiale (bm), sinon Wikidata (wd : le Vatican). */
  habitants: number;
  annee: number;
  source: 'bm' | 'wd';
  /** Superficie en km² selon Wikidata (sup, D57). */
  superficie: number;
  /** D616 a : l'aire du tracé de fait de la carte (pays.json), pour les PAYS_TOUCHES seuls ; null sinon. */
  superficieTrace: number | null;
}

/** Les chiffres des pays jouables, par id. */
export type Grandeurs = ReadonlyMap<string, Grandeur>;

/**
 * Les chiffres des pays jouables de la carte (dans son ordre), tirés de fiches-monde.json. Un pays sans habitants ou
 * sans superficie n'y est pas (aucun des 195 : tests/grandeurs.test.ts) : il ne serait pas posable.
 */
export function lireGrandeurs(f: Pick<FichierMonde, 'lieux'>, pays: readonly PaysGrandeur[]): Grandeurs {
  const t = new Map<string, Grandeur>();
  for (const p of pays) {
    if (p.statut !== 'jouable') continue;
    const b = f.lieux[p.id];
    if (!b || !(typeof b.h === 'number' && b.h > 0) || !(typeof b.sup === 'number' && b.sup > 0)) continue;
    t.set(p.id, {
      id: p.id,
      continent: p.continent,
      habitants: b.h,
      annee: b.ha ?? 0,
      source: b.hs === 'wd' ? 'wd' : 'bm',
      superficie: b.sup,
      superficieTrace: PAYS_TOUCHES.has(p.id) && p.superficie_km2 > 0 ? p.superficie_km2 : null,
    });
  }
  return t;
}

/** La valeur citée d'un pays (celle de l'énoncé de Reconnaître et de la rétroaction) : les habitants, la superficie de Wikidata. */
export const valeur = (g: Grandeur, s: SujetGrandeur): number => (s === 'habitants' ? g.habitants : g.superficie);

/** Les valeurs admises (D616 a) : la valeur citée, plus le tracé de fait pour une superficie touchée par une zone disputée. */
export const valeurs = (g: Grandeur, s: SujetGrandeur): number[] =>
  s === 'superficies' && g.superficieTrace !== null ? [g.superficie, g.superficieTrace] : [valeur(g, s)];

/** L'écart de deux pays pour les leurres : le plus petit rapport entre leurs valeurs admises (≥ 1). */
export const ecart = (a: Grandeur, b: Grandeur, s: SujetGrandeur): number =>
  Math.min(...valeurs(a, s).flatMap((x) => valeurs(b, s).map((y) => rapportBrut(x, y))));

/** Ce que la rétroaction d'une réponse au curseur montre et ce que le journal en garde. */
export interface Notation {
  juste: boolean;
  /** La valeur répondue, telle qu'affichée (2 chiffres) : `estime` au journal (D617 a). */
  estime: number;
  /** Chaque valeur admise et son rapport : la valeur citée d'abord, puis le tracé de fait (D616 a : les deux cités). */
  rapports: { valeur: number; trace: boolean; rapport: Rapport }[];
}

/** La note d'une réponse au curseur (Trouver, sens localiser) : la valeur affichée contre les valeurs admises. */
export function noter(g: Grandeur, s: SujetGrandeur, affichee: number): Notation {
  const estime = arrondi(affichee);
  const vs = valeurs(g, s);
  return { juste: juste(estime, vs), estime, rapports: vs.map((v, i) => ({ valeur: v, trace: i > 0, rapport: rapport(estime, v) })) };
}

// --- Reconnaître (D615 a) ---------------------------------------------------------------------------------------

/**
 * Où chercher des leurres quand le continent de la cible n'en a pas trois à ×3 les uns des autres : les Amériques
 * l'une pour l'autre (Superficies : la Bolivie, la Colombie, le Pérou et le Paraguay, au milieu des douze pays
 * d'Amérique du Sud), puis le monde. Mesuré sur les 195 pays (tests/grandeurs.test.ts) : aucun autre cas.
 */
const CONTINENTS_PROCHES: Readonly<Record<string, readonly string[]>> = { 'North America': ['South America'], 'South America': ['North America'] };

function melanger<T>(t: readonly T[], hasard: () => number): T[] {
  const r = [...t];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [r[i], r[j]] = [r[j] as T, r[i] as T];
  }
  return r;
}

/** Les premiers `n` de la liste (dans son ordre) à ×3 les uns des autres, ou null. Recherche exhaustive : les listes font au plus 194 pays. */
function compatibles(cands: readonly Grandeur[], n: number, s: SujetGrandeur): Grandeur[] | null {
  const pris: Grandeur[] = [];
  const chercher = (debut: number): boolean => {
    if (pris.length === n) return true;
    for (let i = debut; i < cands.length; i++) {
      const c = cands[i]!;
      if (pris.some((x) => ecart(x, c, s) < ECART_LEURRES)) continue;
      pris.push(c);
      if (chercher(i + 1)) return true;
      pris.pop();
    }
    return false;
  };
  return chercher(0) ? pris : null;
}

/**
 * D615 a : trois leurres pour la cible, du même continent, à ×3 au moins de la cible et entre eux (la réponse n'est
 * jamais douteuse à ×1,5), tirés par `hasard` ; si le continent n'en a pas trois, les continents proches, puis le
 * monde. null si la cible n'est pas dans la table (ou, jamais sur les données, si le monde n'en a pas trois).
 */
export function leurres(cible: string, s: SujetGrandeur, t: Grandeurs, hasard: () => number, n = 3): string[] | null {
  const c = t.get(cible);
  if (!c) return null;
  const loin = [...t.values()].filter((g) => g.id !== cible && ecart(g, c, s) >= ECART_LEURRES);
  const etages = [[c.continent], [c.continent, ...(CONTINENTS_PROCHES[c.continent] ?? [])], null];
  for (const e of etages) {
    const pool = e ? loin.filter((g) => e.includes(g.continent)) : loin;
    // Les pays du continent d'abord, dans un ordre tiré : le premier trio trouvé en prend le plus possible.
    const ordre = [...melanger(pool.filter((g) => g.continent === c.continent), hasard), ...melanger(pool.filter((g) => g.continent !== c.continent), hasard)];
    const r = compatibles(ordre, n, s);
    if (r) return r.map((g) => g.id);
  }
  return null;
}

/** Une question de Reconnaître : « Lequel compte environ 230 millions d'habitants ? », quatre pays, un seul juste. */
export interface QuestionQcm {
  /** La valeur de l'énoncé, à 2 chiffres (§ 5.3) : la valeur citée de la cible. */
  enonce: number;
  /** Les quatre pays, la cible à une place tirée. */
  choix: string[];
}

export function questionQcm(cible: string, s: SujetGrandeur, t: Grandeurs, hasard: () => number): QuestionQcm | null {
  const c = t.get(cible);
  const l = leurres(cible, s, t, hasard);
  if (!c || !l) return null;
  const choix = [...l];
  choix.splice(Math.floor(hasard() * (l.length + 1)), 0, cible);
  return { enonce: arrondi(valeur(c, s)), choix };
}

// --- Nombres en français ----------------------------------------------------------------------------------------

const formats = new Map<string, Intl.NumberFormat>();
function format(mots: boolean, chiffres: number): Intl.NumberFormat {
  const cle = `${mots}${chiffres}`;
  let f = formats.get(cle);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', mots ? { notation: 'compact', compactDisplay: 'long', maximumSignificantDigits: chiffres } : { maximumSignificantDigits: chiffres });
    formats.set(cle, f);
  }
  return f;
}

/**
 * Le nombre s'écrit-il en mots (« 230 millions ») ? Dès un million, si le moteur connaît la notation compacte
 * (sinon « 230 000 000 », et le texte dit « habitants », pas « d'habitants »).
 */
export const enMots = (v: number, chiffres = CHIFFRES): boolean =>
  Math.abs(arrondi(v, chiffres)) >= SEUIL_MOTS && (format(true, chiffres).resolvedOptions() as { notation?: string }).notation === 'compact';

/**
 * Un nombre à `chiffres` chiffres significatifs, en français (Intl.NumberFormat) : « 230 millions », « 1,4
 * milliard », « 2 milliards », « 450 000 », « 0,44 ». C'est ce que montrent le curseur, son aria-valuetext et
 * l'énoncé ; la rétroaction peut en demander 3 pour la valeur vraie (« 238 millions »).
 */
export const formater = (v: number, chiffres = CHIFFRES): string => format(enMots(v, chiffres), chiffres).format(arrondi(v, chiffres));
