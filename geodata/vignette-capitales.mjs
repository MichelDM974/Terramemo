#!/usr/bin/env node
// La vignette du sujet Capitales dans les tuiles de Jouer (src/vues/vignettes.ts,
// D53 a) : le monde et ses capitales en points. Le monde vient des données
// déjà chargées ; les points sont rangés dans le code (~2 Ko), projetés
// d'avance dans la projection de la vignette du monde (Equal Earth ajustée à
// 600 unités de large, vignettes.ts monde()), pour ne rien charger de
// capitales* à l'ouverture de Jouer (décision « Hébergement » ; le smoke du
// pilote le vérifie).
//
// Usage : npm run vignette-capitales. Lit public/geo/capitales.json (la
// principale de chaque pays) et public/geo/pays.json (les 195 jouables),
// écrit src/vues/vignette-capitales.ts. À relancer si les capitales changent.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoEqualEarth } from 'd3-geo';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => JSON.parse(readFileSync(join(RACINE, f), 'utf8'));
const jouables = new Set(lire('public/geo/pays.json').filter((p) => p.statut === 'jouable').map((p) => p.id));
/** La largeur de la vignette du monde (vignettes.ts, LARGEUR). */
const LARGEUR = 600;
const projection = geoEqualEarth().fitWidth(LARGEUR, { type: 'Sphere' });

const points = lire('public/geo/capitales.json')
  .filter((l) => jouables.has(l.pays))
  .map((l) => l.c.find((c) => c.p))
  .map((c) => projection([c.lon, c.lat]).map((v) => Math.round(v * 10) / 10));
if (points.length !== jouables.size) throw new Error(`vignette-capitales : ${points.length} points pour ${jouables.size} jouables`);

const sortie = `// Produit par geodata/vignette-capitales.mjs (npm run vignette-capitales)
// depuis public/geo/capitales.json : ne pas éditer à la main. La capitale
// principale de chaque pays jouable, projetée comme la vignette du monde
// (Equal Earth, ${LARGEUR} unités de large) : x, y à la suite.
export const POINTS_CAPITALES: readonly number[] = [${points.flat().join(',')}];
`;
writeFileSync(join(RACINE, 'src/vues/vignette-capitales.ts'), sortie);
