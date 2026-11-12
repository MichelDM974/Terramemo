#!/usr/bin/env node
// La vignette du sujet Océans et mers dans les tuiles de Jouer (src/vues/vignettes.ts,
// D53 a, étude J2 § 7.2) : le monde aux mers éclairées. Les terres et l'ovale du monde
// viennent des données déjà chargées (vignettes.ts, monde()) ; les 45 mers (tout sauf
// les cinq océans, qui sont l'ovale lui-même) sont rangées dans le code, fondues en un
// seul tracé sans frontière entre elles (D45 b), projetées d'avance dans la projection
// de la vignette du monde (Equal Earth ajustée à 600 unités de large) : rien de mers* à
// charger à l'ouverture de Jouer (décision « Hébergement »). Les terres se dessinent par-
// dessus : la côte grossière de la couche légère (50 km) ne se voit pas.
//
// Usage : npm run vignette-mers. Lit public/geo/mers-leger.topo.json et
// public/geo/mers.json (geodata/mers.mjs), écrit src/vues/vignette-mers.ts. À relancer si
// les mers changent. Branchée au lot 3b (sujet Océans et mers), nulle part avant.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { merge } from 'topojson-client';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => JSON.parse(readFileSync(join(RACINE, f), 'utf8'));
/** La largeur de la vignette du monde (vignettes.ts, LARGEUR). */
const LARGEUR = 600;
/**
 * Tolérance et aire minimale en unités, le double et le quadruple de vignettes.ts, et des
 * unités entières : une tuile montre ses 600 unités sur 150 à 200 px, la côte est sous
 * les terres. 8,9 Ko (3,7 compressés) au lieu de 23,8 (9,4) à la tolérance de 1 et au
 * dixième d'unité.
 */
const TOLERANCE = 2;
const AIRE_MIN = 4;

/**
 * Comme simplifier() de vignettes.ts : un point à moins de TOLERANCE du précédent gardé
 * est sauté (le dernier d'un anneau reste), un anneau de moins de AIRE_MIN est retiré.
 */
function simplifier(sortie) {
  let anneau = null;
  let saute = null;
  let polygone = false;
  return {
    point(x, y) {
      if (!anneau) return sortie.point(x, y);
      const n = anneau.length;
      if (n >= 2 && (x - anneau[n - 2]) ** 2 + (y - anneau[n - 1]) ** 2 < TOLERANCE * TOLERANCE) {
        saute = [x, y];
        return;
      }
      anneau.push(x, y);
      saute = null;
    },
    lineStart() {
      if (polygone) {
        anneau = [];
        saute = null;
      } else sortie.lineStart();
    },
    lineEnd() {
      if (!anneau) return sortie.lineEnd();
      const a = anneau;
      anneau = null;
      if (saute) a.push(...saute);
      if (a.length < 6) return;
      let aire = 0;
      for (let i = 0; i < a.length; i += 2) {
        const j = (i + 2) % a.length;
        aire += a[i] * a[j + 1] - a[j] * a[i + 1];
      }
      if (Math.abs(aire) / 2 < AIRE_MIN) return;
      sortie.lineStart();
      for (let i = 0; i < a.length; i += 2) sortie.point(a[i], a[i + 1]);
      sortie.lineEnd();
    },
    polygonStart() {
      polygone = true;
      sortie.polygonStart();
    },
    polygonEnd() {
      polygone = false;
      sortie.polygonEnd();
    },
    sphere() {
      sortie.sphere?.();
    },
  };
}

const topo = lire('public/geo/mers-leger.topo.json');
const sorte = new Map(lire('public/geo/mers.json').map((m) => [m.id, m.sorte]));
const geometries = topo.objects.mers.geometries.filter((g) => sorte.get(g.properties.id) !== 'océan');
if (geometries.length !== 45) throw new Error(`vignette-mers : ${geometries.length} mers au lieu de 45`);
const mers = merge(topo, geometries);
const projection = geoEqualEarth().fitWidth(LARGEUR, { type: 'Sphere' });
const chemin = geoPath({ stream: (s) => projection.stream(simplifier(s)) }).digits(0);
const trace = chemin(mers);

const sortie = `// Produit par geodata/vignette-mers.mjs (npm run vignette-mers) depuis
// public/geo/mers-leger.topo.json (Natural Earth, domaine public) : ne pas éditer à la
// main. Les 45 mers (sans les cinq océans), fondues en un tracé, projetées comme la
// vignette du monde (Equal Earth, ${LARGEUR} unités de large) : le sujet Océans et mers
// (D53 a), sous les terres.
export const VIGNETTE_MERS = '${trace}';
`;
writeFileSync(join(RACINE, 'src/vues/vignette-mers.ts'), sortie);
console.log(`src/vues/vignette-mers.ts : ${sortie.length} caractères, ${gzipSync(sortie).length} compressés`);
