// pick et noter : la seule interface entre la carte et le reste. Fonctions pures
// (projection, transformation, géométries, pastilles) : un rendu Canvas de
// repli les réutiliserait telles quelles.
import type { GeoProjection } from 'd3-geo';
import { contient, distanceAuBordKm, versEcran, versLonLat } from './geo';
import { PASTILLE, pastilleLaPlusProche, type Pastille } from './pastilles';
import type { Entite, Transfo } from './types';

export interface ContexteCarte {
  proj: GeoProjection;
  t: Transfo;
  entites: readonly Entite[];
  /** Pastilles affichées au zoom courant. */
  pastilles: readonly Pastille[];
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

function sousLePoint(ctx: ContexteCarte, x: number, y: number): string | null {
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  if (!ll) return null;
  for (const e of ctx.entites) if (contient(e.forme, e.pays.bbox, ll)) return e.pays.id;
  return null;
}

/**
 * Ce qui est sous le doigt en (x, y), px CSS dans le repère de la carte :
 * 1. sur le tracé d'un pays, un disque dessiné (pastille visible) voisin à
 *    moins de 11 px, s'il est plus près du doigt que la cible du pays sous le
 *    doigt (son point) : le Vatican dans Rome, Andorre au zoom 1 ; mais le
 *    centre de la France y reste la France malgré le Luxembourg à 5 px ;
 * 2. sinon ce tracé ; mais sur celui d'un pays qui a lui-même un disque
 *    dessiné (une île de quelques pixels des Caraïbes au zoom 1), le disque le
 *    plus proche à moins de 22 px ;
 * 3. sinon, en mer, la cible la plus proche à moins de 22 px : un disque, ou la
 *    cible invisible d'un pays de moins de 10 px à l'écran ;
 * 4. sinon le tracé le plus proche à moins de 12 px (sondes en couronnes) ;
 * null si rien.
 * La cible invisible d'un autre pays ne l'emporte jamais sur un tracé sous le
 * doigt : au zoom 1, celle du Maroc prenait le centre de l'Algérie, celle de
 * Trinité une côte du Venezuela au zoom 8 (relecture du J0).
 */
export function pick(ctx: ContexteCarte, x: number, y: number): ResultatPick | null {
  const disques = ctx.pastilles.filter((p) => p.visible);
  const d = pastilleLaPlusProche(disques, ctx.t, x, y);
  const id = sousLePoint(ctx, x, y);
  if (id) {
    const propre = ctx.pastilles.find((p) => p.id === id);
    const [px, py] = propre ? versEcran(ctx.t, propre.bx, propre.by) : [Infinity, Infinity];
    const dPropre = Math.hypot(px - x, py - y);
    if (d && d.id !== id && d.distance_px <= PASTILLE.rayon_sur_trace_px && d.distance_px < dPropre) {
      return { id: d.id, via: 'pastille', distance_px: d.distance_px };
    }
    if (d && propre?.visible) return { id: d.id, via: 'pastille', distance_px: d.distance_px };
    return { id, via: 'trace', distance_px: 0 };
  }
  const p = pastilleLaPlusProche(ctx.pastilles, ctx.t, x, y);
  if (p) return { id: p.id, via: 'pastille', distance_px: p.distance_px };
  for (const r of SONDES_PROCHE.rayons_px) {
    for (let i = 0; i < SONDES_PROCHE.directions; i++) {
      const a = (2 * Math.PI * i) / SONDES_PROCHE.directions;
      const voisin = sousLePoint(ctx, x + r * Math.cos(a), y + r * Math.sin(a));
      if (voisin) return { id: voisin, via: 'proche', distance_px: r };
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
}

/**
 * Notation par rapport à la cible demandée (plan, « Technique » : « dedans, ou
 * dans la tolérance d'un micro-État ») : juste si le point est dans le tracé de
 * la cible, ou si pick(x, y) la désigne (son disque dessiné, sa cible en mer,
 * sa côte à moins de 12 px). Jamais juste sur le tracé d'un autre pays que la
 * carte désigne : avant, la cible de 22 px de la pastille jouait même là, et
 * l'essai du J0 comptait juste un toucher sur l'Albanie pour Andorre.
 * Dans le tracé de la cible mais à moins de 11 px du disque d'un micro-État
 * voisin (Rome et le Vatican) : juste, comme le dit le plan ; pick() y désigne
 * le micro-État, mais la rétroaction d'une réponse juste montre la cible.
 */
export function noter(ctx: ContexteCarte, cible: string, x: number, y: number): Note {
  const e = ctx.entites.find((en) => en.pays.id === cible);
  if (!e) throw new Error(`cible inconnue : ${cible}`);
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  const p = pick(ctx, x, y);
  if (ll && contient(e.forme, e.pays.bbox, ll)) return { juste: true, via: 'trace', distance_km: 0, lonlat: ll, pick: p };
  if (p?.id === cible) return { juste: true, via: p.via, distance_km: 0, lonlat: ll, pick: p };
  return { juste: false, via: null, distance_km: ll ? distanceAuBordKm(e.forme, ll) : null, lonlat: ll, pick: p };
}
