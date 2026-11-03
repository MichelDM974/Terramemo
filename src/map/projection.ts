import { geoEqualEarth, type GeoProjection } from 'd3-geo';
import type { NomProjection, Transfo } from './types';

/**
 * Projections de la carte, ajustées pour que la sphère entière tienne dans
 * largeur × hauteur (zoom 1 = le monde entier).
 * - « monde » : Equal Earth centrée sur Greenwich (coupure à l'antiméridien :
 *   Fidji, Kiribati, la Russie de l'Est et l'Alaska y sont coupés) ;
 * - « pacifique » : la même centrée sur 150° E, coupure à 30° O : seuls le
 *   Groenland et Flores/Corvo (Açores) sont coupés ; 160° E couperait
 *   l'Islande, 155° E le Cap-Vert.
 */
export const ROTATIONS: Record<NomProjection, [number, number]> = {
  monde: [0, 0],
  pacifique: [-150, 0],
};

export function creerProjection(nom: NomProjection, largeur: number, hauteur: number): GeoProjection {
  return geoEqualEarth()
    .rotate(ROTATIONS[nom])
    .fitSize([Math.max(1, largeur), Math.max(1, hauteur)], { type: 'Sphere' });
}

export function estNomProjection(v: unknown): v is NomProjection {
  return v === 'monde' || v === 'pacifique';
}

/**
 * Transformation qui garde la vue à travers un retracé à une autre taille :
 * le même point de la sphère au centre de la carte, la même échelle à
 * l'écran (k × échelle de la projection), bornée à [1, kMax]. Les deux
 * projections ne diffèrent que par l'échelle et la translation (fitSize,
 * même rotation) : le passage d'un repère de base à l'autre est affine.
 * Au zoom 1 ou en dessous : la carte entière (identité).
 */
export function garderVue(
  t: Transfo,
  avant: { proj: GeoProjection; l: number; h: number },
  apres: { proj: GeoProjection; l: number; h: number },
  kMax: number,
): Transfo {
  const [s0, s1] = [avant.proj.scale(), apres.proj.scale()];
  const k = Math.min(kMax, (t.k * s0) / s1);
  if (k <= 1) return { k: 1, x: 0, y: 0 };
  const [tx0, ty0] = avant.proj.translate();
  const [tx1, ty1] = apres.proj.translate();
  // Centre de la carte : écran → base d'avant → base d'après.
  const bx = (((avant.l / 2 - t.x) / t.k - tx0) / s0) * s1 + tx1;
  const by = (((avant.h / 2 - t.y) / t.k - ty0) / s0) * s1 + ty1;
  return { k, x: apres.l / 2 - k * bx, y: apres.h / 2 - k * by };
}
