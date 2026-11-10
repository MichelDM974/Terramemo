// QCM de Nommer (pur : ni DOM ni carte) : les choix d'une question, la partie,
// et quand amener la zone à l'écran (décision « Nommer », conception
// docs/etudes/2026-11-06-reunion.md § 5). Sert le monde comme l'île.
import { geoDistance } from 'd3-geo';
import { partVisible, type Rect } from '../map/geo';

/** Quatre boutons : une grille 2 × 2 sous le pouce. */
export const NB_CHOIX = 4;

/**
 * Ce dont le QCM a besoin d'une zone : un Pays du monde comme une commune de
 * l'île le sont déjà (point d'étiquette [lon, lat], voisins par frontière).
 */
export interface LieuQcm {
  id: string;
  point: [number, number];
  voisins: readonly string[];
}

/** Sous ce côté (px CSS), la zone est trop petite pour être vue : on vole vers elle. */
const TAILLE_MIN_PX = 8;
/** Part de l'emprise à l'écran de la zone qui doit être visible (au-dessus de la barre) : sinon on vole vers elle. */
export const PART_VISIBLE_MIN = 0.9;

function melanger<T>(t: readonly T[], aleatoire: () => number): T[] {
  const r = [...t];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1));
    [r[i], r[j]] = [r[j] as T, r[i] as T];
  }
  return r;
}

/**
 * Une source de leurres d'une stratégie : les lieux qu'elle propose pour la
 * cible (choix() en retire la cible, les non jouables, les exclus, les noms
 * proches et ceux déjà pris), dont `n` au plus sont tirés au hasard (à
 * défaut, autant qu'il reste de places).
 */
export interface SourceLeurres {
  candidats(cible: LieuQcm): Iterable<string>;
  n?: number;
}

/**
 * Une stratégie de leurres (étude J2 § 5.1, 9.2) : ses sources dans l'ordre,
 * complétées par les jouables les plus proches s'il manque des leurres.
 * L'Entraînement (Reconnaître, QCM d'Apprendre) prend les voisins d'abord
 * (décision « Nommer », LEURRES_VOISINS) ; le quiz (lot 4a) compose les
 * siennes par difficulté : lieux connus du même continent (leurresParmi sur
 * un niveau et un groupe), un voisin puis deux du niveau, sosies ou drapeaux
 * éloignés (leurresParmi sur leurs scores).
 */
export type StrategieLeurres = readonly SourceLeurres[];

/** Les voisins jouables de la cible, au hasard. */
export const VOISINS: SourceLeurres = { candidats: (l) => l.voisins };
/** La stratégie de l'Entraînement : les voisins, puis les plus proches. */
export const LEURRES_VOISINS: StrategieLeurres = [VOISINS];

/** Une source tirée d'une liste par cible (lieux connus d'un groupe, sosies, éloignés…), `n` au plus. */
export function leurresParmi(candidats: (cible: string) => Iterable<string>, n?: number): SourceLeurres {
  return { candidats: (l) => candidats(l.id), ...(n === undefined ? {} : { n }) };
}

export interface OptionsChoix {
  /**
   * Jamais leurres (étude J2 § 5.1) : le pays de x pour Jérusalem, les 9 pays
   * au nom de leur capitale (D37 c), les jumeaux d'un drapeau, les ancêtres
   * et descendants d'une mer…
   */
  exclus?: ReadonlySet<string>;
  /** Par sujet et par difficulté ; LEURRES_VOISINS par défaut. */
  strategie?: StrategieLeurres;
  /**
   * Deux lieux dont les noms affichés se confondent (Kingston et Kingstown) :
   * aucun leurre proche de la cible. Au quiz facile et moyen seulement (§ 2.1) ;
   * en difficile, ce sont de bons leurres.
   */
  proches?: (cible: string, leurre: string) => boolean;
}

/**
 * Les choix d'une question : la cible et 3 leurres, mélangés. Leurres : ceux
 * de la stratégie (par défaut ses voisins jouables, 3 tirés au hasard s'il y
 * en a plus), complétés par les jouables les plus proches (geoDistance entre
 * points d'étiquette, puis id) ; jamais la cible, jamais deux fois le même,
 * jamais un exclu ni un nom proche. Lève si moins de 4 choix possibles.
 * Les voisins d'abord : confondre la Slovénie et la Croatie est l'erreur qui
 * apprend quelque chose ; les plus proches donnent des leurres à une île
 * sans voisin (Maurice) plutôt que des pays tirés au hasard à l'autre bout
 * du monde. `jouables` = tout le terrain, pas la série : un voisin hors de
 * la série reste un bon leurre ; un voisin non jouable (territoire) est sauté.
 * La réponse reste l'id choisi (choisi === cible) : seul l'affichage d'un
 * choix change d'un sujet à l'autre (sujets.ts).
 */
export function choix(
  cible: string,
  lieux: ReadonlyMap<string, LieuQcm>,
  jouables: ReadonlySet<string>,
  aleatoire: () => number = Math.random,
  o: OptionsChoix = {},
): string[] {
  const lieu = lieux.get(cible);
  if (!lieu) throw new Error(`choix : lieu inconnu ${cible}`);
  const permis = (id: string) => id !== cible && jouables.has(id) && lieux.has(id) && !o.exclus?.has(id) && !o.proches?.(cible, id);
  const candidats = [...jouables].filter(permis);
  if (candidats.length < NB_CHOIX - 1) throw new Error(`choix : ${candidats.length + 1} jouables, il en faut ${NB_CHOIX}`);
  const leurres: string[] = [];
  for (const s of o.strategie ?? LEURRES_VOISINS) {
    const places = NB_CHOIX - 1 - leurres.length;
    if (places <= 0) break;
    const pris = new Set(leurres);
    const proposes = [...new Set(s.candidats(lieu))].filter((id) => permis(id) && !pris.has(id));
    leurres.push(...melanger(proposes, aleatoire).slice(0, Math.min(places, s.n ?? places)));
  }
  if (leurres.length < NB_CHOIX - 1) {
    const pris = new Set(leurres);
    // Distance angulaire : le classement seul compte ; id en second pour un ordre stable.
    const proches = candidats
      .filter((id) => !pris.has(id))
      .map((id) => ({ id, d: geoDistance(lieu.point, (lieux.get(id) as LieuQcm).point) }))
      .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const p of proches.slice(0, NB_CHOIX - 1 - leurres.length)) leurres.push(p.id);
  }
  return melanger([cible, ...leurres], aleatoire);
}

/** Réponse donnée à une question. */
interface Reponse {
  id: string;
  choisi: string;
  temps_ms: number;
}

/**
 * Partie de Nommer : un seul essai par question, le bilan compte les justes du premier coup.
 * Un seul essai : avec quatre boutons, réessayer jusqu'au bon ferait toujours
 * « juste » au bout du compte, le bilan ne dirait rien.
 */
export class PartieNommer {
  private readonly cibles: readonly string[];
  private readonly reponses: Reponse[] = [];

  constructor(cibles: readonly string[]) {
    this.cibles = [...cibles];
  }

  /** La question en cours ; undefined une fois la partie finie. */
  get courante(): string | undefined {
    return this.cibles[this.reponses.length];
  }

  /** Numéro de la question en cours, à partir de 1 (« 3 / 24 ») ; n + 1 une fois finie. */
  get numero(): number {
    return this.reponses.length + 1;
  }

  get finie(): boolean {
    return this.reponses.length >= this.cibles.length;
  }

  /** Répond à la question en cours et passe à la suivante. Lève si la partie est finie. */
  repondre(choisi: string, temps_ms: number): { juste: boolean } {
    const id = this.courante;
    if (id === undefined) throw new Error('PartieNommer : partie finie');
    this.reponses.push({ id, choisi, temps_ms });
    return { juste: choisi === id };
  }

  /**
   * Justes sur questions répondues (une partie terminée avant la fin compte ce
   * qui a été répondu, comme l'essai) ; temps médian des justes seules, comme
   * le bilan de Toucher (une faute rapide n'est pas un temps à retenir) ; null
   * sans juste. Fautes dans l'ordre de la partie.
   */
  bilan(): { justes: number; n: number; temps_median_ms: number | null; fautes: { id: string; choisi: string }[] } {
    const justes = this.reponses.filter((r) => r.choisi === r.id);
    const t = justes.map((r) => r.temps_ms).sort((a, b) => a - b);
    const m = t.length / 2;
    const temps_median_ms = t.length === 0 ? null : t.length % 2 ? (t[Math.floor(m)] as number) : ((t[m - 1] as number) + (t[m] as number)) / 2;
    return {
      justes: justes.length,
      n: this.reponses.length,
      temps_median_ms,
      fautes: this.reponses.filter((r) => r.choisi !== r.id).map(({ id, choisi }) => ({ id, choisi })),
    };
  }
}

/**
 * La zone doit-elle être amenée à l'écran : hors de la partie visible
 * (au-dessus de la barre), en partie cachée (moins de 90 % de son emprise
 * visible : la Sicile sous la barre) ou plus petite que 8 px.
 * p : son point à l'écran (px CSS relatifs à la carte, `carte.ecran`), null
 * s'il n'est pas projetable ; l × hVisible : la carte jusqu'au haut de la
 * barre de Nommer ; emprise : celle de son polygone principal à l'écran
 * (`empriseEcran`), absente : le point seul décide. Les bords comptent comme visibles.
 */
export function doitCadrer(p: [number, number] | null, taille_px: number, l: number, hVisible: number, emprise?: Rect | null): boolean {
  if (!p) return true;
  const [x, y] = p;
  if (!(x >= 0 && x <= l && y >= 0 && y <= hVisible)) return true;
  if (emprise && partVisible(emprise, l, hVisible) < PART_VISIBLE_MIN) return true;
  return taille_px < TAILLE_MIN_PX;
}
