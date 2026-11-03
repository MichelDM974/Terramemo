// pick et noter : la seule interface entre la carte et le reste. Fonctions pures
// (projection, transformation, géométries, pastilles) : un rendu Canvas de
// repli les réutiliserait telles quelles.
import type { GeoProjection } from 'd3-geo';
import { contient, distanceAuBordKm, versLonLat } from './geo';
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
 * 1. une cible de pastille (44 px), la plus proche du doigt si plusieurs ;
 *    mais sur le tracé d'un pays sans pastille (assez grand pour se toucher
 *    seul), la cible ne gagne qu'à moins de 11 px de son centre ;
 * 2. sinon le tracé qui contient le point ;
 * 3. sinon, en mer, le tracé le plus proche à moins de 12 px (sondes en couronnes) ;
 * null si rien.
 */
export function pick(ctx: ContexteCarte, x: number, y: number): ResultatPick | null {
  const p = pastilleLaPlusProche(ctx.pastilles, ctx.t, x, y);
  if (p && p.distance_px <= PASTILLE.rayon_sur_trace_px) return { id: p.id, via: 'pastille', distance_px: p.distance_px };
  const id = sousLePoint(ctx, x, y);
  if (p) {
    const surGrandPays = id !== null && id !== p.id && !ctx.pastilles.some((pa) => pa.id === id);
    if (!surGrandPays) return { id: p.id, via: 'pastille', distance_px: p.distance_px };
  }
  if (id) return { id, via: 'trace', distance_px: 0 };
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
  /** Ce qui rend la réponse juste ; null si fausse. */
  via: 'trace' | 'pastille' | null;
  /** 0 si juste, distance géodésique au bord de la cible sinon ; null hors de la sphère. */
  distance_km: number | null;
  lonlat: [number, number] | null;
}

/**
 * Notation par rapport à la cible demandée (plan, « Technique ») : juste si le
 * point est dans sa géométrie ou dans la cible de sa pastille affichée ; sinon,
 * distance au bord le plus proche de la cible.
 */
export function noter(ctx: ContexteCarte, cible: string, x: number, y: number): Note {
  const e = ctx.entites.find((en) => en.pays.id === cible);
  if (!e) throw new Error(`cible inconnue : ${cible}`);
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  if (ll && contient(e.forme, e.pays.bbox, ll)) return { juste: true, via: 'trace', distance_km: 0, lonlat: ll };
  const pastille = ctx.pastilles.filter((p) => p.id === cible);
  if (pastilleLaPlusProche(pastille, ctx.t, x, y, PASTILLE.rayon_cible_px)) {
    return { juste: true, via: 'pastille', distance_km: 0, lonlat: ll };
  }
  return { juste: false, via: null, distance_km: ll ? distanceAuBordKm(e.forme, ll) : null, lonlat: ll };
}
