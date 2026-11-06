// pick et noter : la seule interface entre la carte et le reste. Fonctions pures
// (projection, transformation, géométries, pastilles) : un rendu Canvas de
// repli les réutiliserait telles quelles.
import type { GeoProjection } from 'd3-geo';
import type { Acceptes, Admis } from './acceptes';
import { contient, distanceAuBordKm, versEcran, versLonLat } from './geo';
import { PASTILLE, pastilleLaPlusProche, type Pastille } from './pastilles';
import type { Entite, Lieu, Transfo } from './types';

export interface ContexteCarte {
  proj: GeoProjection;
  t: Transfo;
  entites: readonly Entite<Lieu>[];
  /** Pastilles affichées au zoom courant. */
  pastilles: readonly Pastille[];
  /**
   * Zones qui comptent juste pour une cible hors de son tracé (acceptes.ts :
   * zones contestées, enclaves) ; absent : aucune, le de fait strict.
   */
  acceptes?: Acceptes;
}

export type Via = 'pastille' | 'trace' | 'proche';

export interface ResultatPick {
  id: string;
  via: Via;
  /** Distance du doigt au centre de la pastille (pastille), 0 (trace), rayon de la sonde (proche). */
  distance_px: number;
}

/** Rayons (px) des sondes autour d'un toucher en mer, et nombre de directions. */
export const SONDES_PROCHE = { rayons_px: [4, 8, 12], directions: 8 } as const;

function sousLePoint(ctx: ContexteCarte, x: number, y: number): Entite<Lieu> | null {
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  if (!ll) return null;
  for (const e of ctx.entites) if (contient(e.forme, e.pays.bbox, ll)) return e;
  return null;
}

/**
 * Ce qui est sous le doigt en (x, y), px CSS dans le repère de la carte :
 * 1. sur le tracé d'un pays, un disque dessiné (pastille visible) voisin sous
 *    le doigt (à moins de PASTILLE.rayon_sur_trace_px de son centre : le
 *    disque de 7 px et ~3 px de marge), s'il est plus près du doigt que le
 *    point du pays sous le doigt (sa pastille, ou son point d'étiquette s'il
 *    n'en a pas) : le Vatican dans Rome ; mais le point de la France reste la
 *    France malgré le Luxembourg, celui du Venezuela le Venezuela malgré
 *    Trinité (relecture V1 : seul un pays à pastille faisait concourir son
 *    point, la Tanzanie et l'Arabie saoudite étaient intouchables au zoom 1) ;
 * 2. sinon ce tracé : via « pastille » si le doigt est aussi sur le disque du
 *    pays (même rayon), « trace » sinon ;
 * 3. en mer, la cible la plus proche à moins de 22 px : un disque, ou la
 *    cible invisible d'un pays de moins de 10 px à l'écran ;
 * 4. sinon le tracé le plus proche à moins de 12 px (sondes en couronnes) ;
 * null si rien.
 * Décision « Toucher sur la terre ferme » : sur un tracé, ce qu'on voit sous
 * le doigt est ce qui compte. Un disque voisin gagnait d'abord à 11 px de son
 * centre (7,5 px hors du disque dessiné) : il prenait la moitié de l'Italie
 * au zoom 4 (un tiers désormais), et pick, donc noter, comptait juste pour
 * Trinité un toucher sur le Venezuela. La cible invisible d'un autre pays ne
 * l'emporte jamais sur un tracé sous le doigt : au zoom 1, celle du Maroc
 * prenait le centre de l'Algérie, celle de Trinité une côte du Venezuela au
 * zoom 8 (relecture du J0). En mer, les cibles de 44 px restent.
 */
export function pick(ctx: ContexteCarte, x: number, y: number): ResultatPick | null {
  const disques = ctx.pastilles.filter((p) => p.visible);
  const d = pastilleLaPlusProche(disques, ctx.t, x, y);
  const e = sousLePoint(ctx, x, y);
  if (e) {
    const id = e.pays.id;
    const b = ctx.proj(e.pays.point);
    const [px, py] = b ? versEcran(ctx.t, b[0], b[1]) : [Infinity, Infinity];
    const dPropre = Math.hypot(px - x, py - y);
    if (d && d.id !== id && d.distance_px <= PASTILLE.rayon_sur_trace_px && d.distance_px < dPropre) {
      return { id: d.id, via: 'pastille', distance_px: d.distance_px };
    }
    const propre = disques.find((p) => p.id === id);
    if (propre && dPropre <= PASTILLE.rayon_sur_trace_px) return { id, via: 'pastille', distance_px: dPropre };
    return { id, via: 'trace', distance_px: 0 };
  }
  const p = pastilleLaPlusProche(ctx.pastilles, ctx.t, x, y);
  if (p) return { id: p.id, via: 'pastille', distance_px: p.distance_px };
  for (const r of SONDES_PROCHE.rayons_px) {
    for (let i = 0; i < SONDES_PROCHE.directions; i++) {
      const a = (2 * Math.PI * i) / SONDES_PROCHE.directions;
      const voisin = sousLePoint(ctx, x + r * Math.cos(a), y + r * Math.sin(a));
      if (voisin) return { id: voisin.pays.id, via: 'proche', distance_px: r };
    }
  }
  return null;
}

export interface Note {
  juste: boolean;
  /** Ce qui rend la réponse juste : le tracé de la cible, ou pick() qui la désigne ; null si fausse. */
  via: Via | null;
  /** 0 si juste ; sinon distance géodésique au bord de la cible ; null hors de la sphère. */
  distance_km: number | null;
  lonlat: [number, number] | null;
  /** Ce que la carte désigne en (x, y) : pick(), calculé une fois pour la note et la rétroaction. */
  pick: ResultatPick | null;
  /**
   * Juste hors du tracé de la cible : la zone contestée ou l'enclave touchée
   * qui compte pour elle (rétroaction « Juste (…) ») ; null sinon.
   */
  admis: Admis | null;
}

export interface OptionsNoter {
  /**
   * Admettre les zones contestées et les enclaves de ctx.acceptes (défaut :
   * oui). Non : le de fait strict, pour les épreuves classées d'avant
   * DEBUT_ACCEPTES_EPREUVES (src/epreuve/bareme.ts).
   */
  acceptes?: boolean;
}

/**
 * Notation par rapport à la cible demandée (plan, « Technique » : « dedans, ou
 * dans la tolérance d'un micro-État ») : juste si le point est dans le tracé de
 * la cible, ou si pick(x, y) la désigne (son disque dessiné, sa cible en mer,
 * sa côte à moins de 12 px). Jamais juste sur le tracé d'un autre pays que la
 * carte désigne : avant, la cible de 22 px de la pastille jouait même là, et
 * l'essai du J0 comptait juste un toucher sur l'Albanie pour Andorre.
 * Sur le tracé d'un voisin, la tolérance d'un micro-État est donc son disque
 * dessiné et ~3 px de marge (pick, règle 1) : dans Rome, à 5 px du centre du
 * disque du Vatican, juste pour le Vatican comme pour l'Italie (pick y désigne
 * le Vatican, la rétroaction d'une réponse juste montre la cible) ; à 8 px,
 * l'Italie seule.
 * Les zones de ctx.acceptes comptent aussi (décision « Zones contestées et
 * enclaves ») : un toucher en Crimée est juste pour l'Ukraine, à Baïkonour pour
 * le Kazakhstan, et Note.admis dit pourquoi. Faux, la distance est celle du
 * bord le plus proche de l'union (la cible et ses zones admises) : le Maroc
 * s'arrête au bord est du Sahara occidental.
 */
export function noter(ctx: ContexteCarte, cible: string, x: number, y: number, options: OptionsNoter = {}): Note {
  const e = ctx.entites.find((en) => en.pays.id === cible);
  if (!e) throw new Error(`cible inconnue : ${cible}`);
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  const p = pick(ctx, x, y);
  const base = { lonlat: ll, pick: p };
  if (ll && contient(e.forme, e.pays.bbox, ll)) return { juste: true, via: 'trace', distance_km: 0, admis: null, ...base };
  if (p?.id === cible) return { juste: true, via: p.via, distance_km: 0, admis: null, ...base };
  const zones = options.acceptes === false ? [] : (ctx.acceptes?.get(cible) ?? []);
  const admis = (z: (typeof zones)[number]): Admis => ({ zone: z.zone, tenant: z.tenant, sorte: z.sorte });
  if (ll) {
    const z = zones.find((zo) => contient(zo.forme, zo.bbox, ll));
    if (z) return { juste: true, via: z.entite && p?.id === z.zone ? p.via : 'trace', distance_km: 0, admis: admis(z), ...base };
  }
  // Une entité admise que la carte désigne sans que le doigt y soit : sa côte
  // à moins de 12 px (sonde), comme pour la cible elle-même.
  const z = p ? zones.find((zo) => zo.entite && zo.zone === p.id) : undefined;
  if (z && p) return { juste: true, via: p.via, distance_km: 0, admis: admis(z), ...base };
  let distance_km: number | null = null;
  if (ll) {
    distance_km = distanceAuBordKm(e.forme, ll);
    for (const zo of zones) distance_km = Math.min(distance_km, distanceAuBordKm(zo.forme, ll));
  }
  return { juste: false, via: null, distance_km, admis: null, ...base };
}
