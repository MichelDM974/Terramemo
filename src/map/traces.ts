// Chaînes de tracés SVG (pur). geoPath de d3 passe chaque point par son flux
// (découpage à l'antiméridien, rééchantillonnage, arrondi décimal) : ~3 fois
// plus lent au premier appel que de projeter les anneaux directement. On
// projette donc directement tout anneau qui ne passe pas la coupure de la
// projection, et l'on garde geoPath pour les autres (sur les données : aucun
// en « monde », Natural Earth coupant déjà ses polygones à ±180° ; le Groenland
// et l'Antarctique en « pacifique »).
//
// Les tracés sont en entiers relatifs (« l12,-3 »), en centièmes de px de base
// (UNITE) : chaînes 2,4 fois plus courtes que des décimales absolues, donc
// plus rapides à produire et à analyser par le navigateur. Le <g> qui les
// contient porte scale(1 / UNITE).
import { geoPath, type GeoPermissibleObjects, type GeoProjection } from 'd3-geo';
import type { Position } from 'geojson';
import type { Forme } from './types';

/** Unités de tracé par px de base : 0,01 px, soit 4 px d'écran au zoom 400. */
export const UNITE = 100;

/** L'anneau passe-t-il la coupure (méridien opposé au centre, après rotation λ0) ? */
export function passeLaCoupure(anneau: readonly Position[], lambda0: number): boolean {
  let prec: number | null = null;
  for (const p of anneau) {
    // Même normalisation que la rotation de d3 : ±180° exacts restent de leur côté.
    let l = (p[0] ?? 0) + lambda0;
    if (l > 180) l -= 360;
    else if (l < -180) l += 360;
    if (prec !== null && Math.abs(l - prec) > 180) return true;
    prec = l;
  }
  return false;
}

/** Tracé d'une forme par projection directe, en UNITE ; null si un anneau passe la coupure. */
export function traceDirect(proj: GeoProjection, forme: Forme): string | null {
  const [lambda0, phi, gamma] = proj.rotate();
  if (phi !== 0 || gamma !== 0) return null;
  const g = forme.geometry;
  const polygones = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polygones) for (const anneau of poly) if (passeLaCoupure(anneau, lambda0)) return null;
  let d = '';
  for (const poly of polygones) {
    for (const anneau of poly) {
      let px = 0;
      let py = 0;
      let n = 0;
      // Le dernier point répète le premier : Z ferme l'anneau.
      for (let i = 0; i < anneau.length - 1; i++) {
        const q = proj(anneau[i] as [number, number]);
        if (!q) continue;
        const x = Math.round(q[0] * UNITE);
        const y = Math.round(q[1] * UNITE);
        if (n === 0) d += 'M' + x + ',' + y;
        else if (x !== px || y !== py) d += 'l' + (x - px) + ',' + (y - py);
        else continue;
        px = x;
        py = y;
        n++;
      }
      if (n > 0) d += 'Z';
    }
  }
  return d;
}

/**
 * Fabrique de tracés (en UNITE) pour une projection : directe si possible,
 * geoPath sinon, sur une copie de la projection agrandie UNITE fois. La copie
 * vient de creer(1, 1) (d3-geo n'a pas de copy()), échelle et translation
 * reposées ensuite : le monde passe (l, h) => creerProjection(nom, l, h), un
 * terrain local sa Mercator ajustée (terrain.ts).
 */
export function fabriqueTraces(creer: (l: number, h: number) => GeoProjection, proj: GeoProjection): (forme: Forme) => string {
  const grande = creer(1, 1);
  const [tx, ty] = proj.translate();
  grande.scale(proj.scale() * UNITE).translate([tx * UNITE, ty * UNITE]);
  const chemin = geoPath(grande).digits(0);
  return (forme) => traceDirect(proj, forme) ?? chemin(forme as GeoPermissibleObjects) ?? '';
}
