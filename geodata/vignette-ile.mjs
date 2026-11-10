#!/usr/bin/env node
// La vignette de l'île dans les tuiles de Jouer (src/vues/vignettes.ts) : son
// contour et les limites de ses 24 communes, simplifiés pour une tuile et
// projetés d'avance, tracés SVG prêts à poser. Rangés dans le code (~5 Ko,
// 2 compressés),
// parce que les données de l'île (public/geo/reunion/) ne se chargent qu'au
// choix de sa série, et que le tracé de la France du monde n'a que 18 points
// pour l'île (une tache).
//
// Usage : npm run vignette-ile. Lit public/geo/reunion/communes.topo.json (IGN
// Admin Express, Licence Ouverte : source citée dans l'écran Crédits), écrit
// src/vues/vignette-ile.ts. À relancer si les communes changent.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { merge, mesh } from 'topojson-client';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const topo = JSON.parse(readFileSync(join(RACINE, 'public/geo/reunion/communes.topo.json'), 'utf8'));
const communes = topo.objects.communes;

/** Largeur du tracé, en unités du viewBox ; un point à moins de TOLERANCE du précédent est sauté. */
const LARGEUR = 200;
const TOLERANCE = 3;

function simplifier(sortie) {
  let x0 = NaN;
  let y0 = NaN;
  let saute = null;
  return {
    point(x, y) {
      if ((x - x0) ** 2 + (y - y0) ** 2 < TOLERANCE * TOLERANCE) {
        saute = [x, y];
        return;
      }
      sortie.point(x, y);
      x0 = x;
      y0 = y;
      saute = null;
    },
    lineStart() {
      x0 = y0 = NaN;
      saute = null;
      sortie.lineStart();
    },
    lineEnd() {
      if (saute) sortie.point(...saute);
      sortie.lineEnd();
    },
    polygonStart() {
      sortie.polygonStart();
    },
    polygonEnd() {
      sortie.polygonEnd();
    },
    sphere() {},
  };
}

const contour = merge(topo, communes.geometries);
const limites = mesh(topo, communes, (a, b) => a !== b);
const projection = geoEqualEarth().rotate([-55.5, 0]).fitWidth(LARGEUR, contour);
const chemin = geoPath({ stream: (s) => projection.stream(simplifier(s)) }).digits(0);
const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(contour);
const m = Math.round(0.12 * Math.max(x1 - x0, y1 - y0));
const cadre = [Math.floor(x0) - m, Math.floor(y0) - m, Math.ceil(x1 - x0) + 2 * m, Math.ceil(y1 - y0) + 2 * m];

const sortie = `// Produit par geodata/vignette-ile.mjs (npm run vignette-ile) depuis
// public/geo/reunion/communes.topo.json (IGN Admin Express, Licence Ouverte) :
// ne pas éditer à la main. L'île et les limites de ses communes, projetées
// (Equal Earth centrée sur 55,5° E) et simplifiées pour la tuile de Jouer.
export const VIGNETTE_ILE = {
  cadre: [${cadre.join(', ')}] as [number, number, number, number],
  contour: '${chemin(contour)}',
  limites: '${chemin(limites)}',
};
`;
writeFileSync(join(RACINE, 'src/vues/vignette-ile.ts'), sortie);
console.log(`src/vues/vignette-ile.ts : ${sortie.length} caractères`);
