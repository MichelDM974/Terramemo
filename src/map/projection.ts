import { geoEqualEarth, type GeoProjection } from 'd3-geo';
import type { NomProjection } from './types';

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
