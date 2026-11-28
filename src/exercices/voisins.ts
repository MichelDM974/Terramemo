// Voisins (étude docs/etudes/2026-11-25-j4-conception.md, § 3, lot 2 ; D605 à D607), la partie pure : qui est
// voisin de qui, ce qui est neutre, ce que vaut un toucher, le délai d'une question. Ni DOM ni carte : la vue
// (src/vues/voisins.ts, morceau chargé à la demande) passe le jugement de la carte (noter) et ce qu'elle désigne
// (pick). Chargé avec elle : rien de ce fichier n'est au morceau principal (décision « Morceau JS principal sous
// 500 Ko »).
//
// Deux entités sont voisines si elles partagent une frontière sur la carte (pays.json, Lieu.voisins : symétrique,
// testé). Pour une question, sur les 195 pays jouables :
// - les voisins jouables sont demandés (156 pays en ont au moins un, 624 en tout : la Hongrie 7, la Chine 14) ;
// - un voisin non jouable (le Kosovo pour la Serbie, Hong Kong pour la Chine) n'est ni demandé ni fautif, et la
//   rétroaction le cite à part ;
// - un voisin par une zone admise (D605 a : décision « Zones contestées et enclaves » appliquée aux voisins) est
//   neutre aussi : si un toucher au Sahara occidental est juste pour le Maroc, la Mauritanie touche le Maroc ;
//   variante écartée : l'exiger, ce qui prendrait parti dans l'autre sens.
// Reconnaître (D606 a) donne la liste écrite des voisins et fait toucher le pays : quatre listes désignent deux pays
// chacune (ambigus), justes tous les deux.
import type { Statut } from '../map/types';

/**
 * Les voisins par une zone admise, neutres dans les deux sens : [pays, voisin, zone]. Mesurés, puis figés
 * (tests/voisins.test.ts les recalcule) :
 * - sur pays.json, les entités revendiquées par un pays jouable (revendique_par) et les enclaves (ENCLAVES de
 *   map/acceptes.ts), puis leurs voisins jouables qui ne sont pas voisins de fait du pays : les trois paires de
 *   l'étude (§ 3.2) ;
 * - sur les formes de monde.topo.json (S612), les zones hachurées de contestees.json qui partagent un bord avec un
 *   pays jouable que l'un de leurs tenants (dans, revendique_par) ne borde pas : dix de plus, que l'étude ne
 *   comptait pas (elle n'avait mesuré que les entités). Le Cachemire tenu par le Pakistan et revendiqué par l'Inde
 *   borde l'Afghanistan ; une île tenue par un pays et revendiquée par un autre fait de ce dernier un voisin neutre
 *   du tenant (Mayotte : les Comores et la France ; les Kouriles : le Japon et la Russie).
 * Rien n'est demandé ni écrit au journal d'après cette table : la changer ne touche aucune fiche.
 */
export const VOISINS_PAR_ZONE: readonly (readonly [string, string, string])[] = [
  ['MAR', 'MRT', 'ESH'],
  ['SOM', 'DJI', 'NE_SOL'],
  ['SRB', 'ALB', 'XKX'],
  ['IND', 'AFG', 'NE_B08'],
  ['CHN', 'JPN', 'NE_B18'],
  ['COM', 'FRA', 'NE_B22'],
  ['JPN', 'RUS', 'NE_B29'],
  ['DNK', 'GBR', 'NE_B31'],
  ['ISL', 'GBR', 'NE_B31'],
  ['JPN', 'KOR', 'NE_B39'],
  ['SAU', 'EGY', 'NE_B68'],
  ['ARE', 'IRN', 'NE_B73'],
  ['PHL', 'MYS', 'NE_C04'],
];

/** D607 a : le délai d'une question des Voisins, au Chrono comme à Sans faute : 4 s, plus 2 s par voisin à trouver. */
export const DELAI_BASE_MS = 4_000;
export const DELAI_PAR_VOISIN_MS = 2_000;
export const delaiVoisins = (n: number): number => DELAI_BASE_MS + DELAI_PAR_VOISIN_MS * n;

/** Ce que le voisinage lit d'une entité de la carte (pays.json). */
export interface LieuVoisin {
  id: string;
  statut: Statut;
  voisins: readonly string[];
}

/** Le voisinage des pays jouables d'une carte. */
export interface Voisinage {
  /** Les pays qui ont au moins un voisin jouable, dans l'ordre des données : ceux qu'une question peut poser. */
  readonly posables: readonly string[];
  /** Les voisins jouables à trouver ; [] pour un pays qui n'en a pas. */
  voisins(id: string): readonly string[];
  /** Les voisins non jouables (territoires, entités contestées, paquet optionnel) : neutres, cités à part. */
  autres(id: string): readonly string[];
  /** Les voisins par une zone admise (VOISINS_PAR_ZONE), jouables : neutres, cités à part. */
  parZone(id: string): readonly string[];
  /** Les autres pays qui ont exactement les mêmes voisins jouables (Reconnaître : justes aussi, jamais leurres). */
  ambigus(id: string): readonly string[];
}

/** Le voisinage tiré des entités d'une carte. */
export function voisinage(lieux: readonly LieuVoisin[]): Voisinage {
  const parId = new Map(lieux.map((l) => [l.id, l]));
  const jouable = (id: string) => parId.get(id)?.statut === 'jouable';
  const vus = (id: string) => (jouable(id) ? (parId.get(id)?.voisins ?? []) : []);
  const voisins = (id: string) => vus(id).filter(jouable);
  const zone = new Map<string, string[]>();
  for (const [a, b] of VOISINS_PAR_ZONE) {
    if (!jouable(a) || !jouable(b)) continue;
    zone.set(a, [...(zone.get(a) ?? []), b]);
    zone.set(b, [...(zone.get(b) ?? []), a]);
  }
  const posables = lieux.filter((l) => voisins(l.id).length > 0).map((l) => l.id);
  const cle = (id: string) => [...voisins(id)].sort().join(' ');
  const parCle = new Map<string, string[]>();
  for (const id of posables) parCle.set(cle(id), [...(parCle.get(cle(id)) ?? []), id]);
  return {
    posables,
    voisins,
    autres: (id) => vus(id).filter((v) => !jouable(v)),
    parZone: (id) => (voisins(id).length ? (zone.get(id) ?? []).filter((v) => !vus(id).includes(v)) : []),
    ambigus: (id) => (parCle.get(cle(id)) ?? []).filter((x) => x !== id),
  };
}

/**
 * Ce que vaut un toucher (D605 a, § 3.2) : un voisin trouvé ; un voisin déjà trouvé, le pays demandé lui-même, un
 * voisin neutre ou rien sous le doigt (la mer), qui ne comptent ni pour ni contre ; ou une faute, un pays qui
 * n'est pas voisin, qui finit la question.
 */
export type Coup =
  | { sorte: 'trouve'; id: string }
  | { sorte: 'deja'; id: string }
  | { sorte: 'lui' }
  | { sorte: 'neutre'; id: string }
  | { sorte: 'rien' }
  | { sorte: 'faute'; id: string };

/**
 * Une question « Touche les voisins de la Hongrie » (sens localiser). Le nombre de voisins est donné : la question
 * est juste quand tous sont trouvés sans faute (sans lui, il faudrait un « J'ai fini », et l'oubli d'un voisin ne se
 * distinguerait plus d'un doute). Une faute la finit, fausse, comme le seul essai de Reconnaître (décision
 * « Nommer ») ; « Voir », « Passer » et le temps écoulé l'arrêtent (arreter).
 */
export class QuestionVoisins {
  readonly trouves: string[] = [];
  /** Le pays touché à tort (la matrice des confusions : Evenement.reponse) ; null sans faute. */
  faute: string | null = null;
  private arretee = false;

  constructor(
    readonly id: string,
    /** Les voisins jouables à trouver. */
    readonly aTrouver: readonly string[],
    /** Les voisins neutres : non jouables, ou par une zone admise. */
    readonly neutres: ReadonlySet<string>,
  ) {}

  /** Les voisins pas encore trouvés, dans l'ordre de aTrouver. */
  get reste(): string[] {
    return this.aTrouver.filter((v) => !this.trouves.includes(v));
  }

  get finie(): boolean {
    return this.arretee || this.faute !== null || this.reste.length === 0;
  }

  /** Tous les voisins trouvés, sans faute ni arrêt. */
  get juste(): boolean {
    return !this.arretee && this.faute === null && this.reste.length === 0;
  }

  /**
   * Un toucher : `juge(v)`, le toucher compte-t-il pour v (noter de la carte, zones admises comprises : un toucher en
   * Crimée compte pour l'Ukraine) ; `pick`, l'entité que la carte y désigne (null : la mer). Les voisins à trouver
   * d'abord, dans l'ordre (le premier juste l'emporte), puis ceux déjà trouvés, puis le pays demandé. Sans effet sur
   * une question finie (rend « rien »).
   */
  jouer(juge: (v: string) => boolean, pick: string | null): Coup {
    if (this.finie) return { sorte: 'rien' };
    const v = this.reste.find(juge);
    if (v) {
      this.trouves.push(v);
      return { sorte: 'trouve', id: v };
    }
    const deja = this.trouves.find(juge);
    if (deja) return { sorte: 'deja', id: deja };
    if (juge(this.id)) return { sorte: 'lui' };
    if (!pick) return { sorte: 'rien' };
    if (this.neutres.has(pick)) return { sorte: 'neutre', id: pick };
    this.faute = pick;
    return { sorte: 'faute', id: pick };
  }

  /** « Voir », « Passer » ou le temps écoulé : la question finie, fausse (les voisins trouvés restent comptés au bilan). */
  arreter(): void {
    if (!this.finie) this.arretee = true;
  }
}
