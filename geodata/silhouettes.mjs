// Silhouettes du J4 (étude docs/etudes/2026-11-25-j4-conception.md, § 6, lot 1 ; D618 à
// D621). Sans réseau, sans effet à l'import (les tests rappellent ses fonctions). Lit les
// sorties du build : public/geo/monde.topo.json, pays.json, noms.fr.json. Produit
// (identique octet pour octet d'un lancement à l'autre) :
//   public/geo/silhouettes.json  {v: 1, ecart_km, facteur_ecart, part_grande, cote, seuil,
//                      retirees: {id: [indices]}, paires: [[A, B, score]…]} : les parties
//                      lointaines retirées de chaque silhouette (indices des polygones de
//                      sa forme dans monde.topo.json), puis les paires de formes proches
//                      (leurres du quiz difficile et expert, D621), A < B, une fois.
//   docs/relectures/silhouettes-planche.svg  la planche de relecture : les 166
//                      silhouettes, les 29 pays sans silhouette, les paires proches, dessinées
//                      comme dans l'appli (docs/relectures/silhouettes.md).
//   docs/relectures/silhouettes.md  la relecture : ce que l'utilisateur a à trancher, puis
//                      les tableaux, chaque ligne avec la règle qui l'a produite.
// Usage : npm run silhouettes
//
// Règles (chacune ligne à ligne dans docs/relectures/silhouettes.md) :
// - la liste (D618 a) : les pays jouables, sans les 29 micro-États (micro: true, le plus
//   grand morceau sous 2 000 km² : SANS_SILHOUETTE de src/srs/fiches.ts, que le test
//   confronte à pays.json) ;
// - les parties lointaines : le plus grand morceau et les grandes parties (au moins
//   PART_GRANDE de lui : Bornéo pour la Malaisie, Sumatra pour l'Indonésie) sont gardés ;
//   puis, de proche en proche, une partie à moins d'un écart d'une partie gardée :
//   ECART_KM, ou FACTEUR_ECART fois le rayon du pays entier s'il est plus petit (un petit
//   pays ne porte pas d'îlot lointain : l'île Cocos du Costa Rica, Rotuma des Fidji), ou deux fois
//   le rayon de la partie s'il est plus grand (l'Alaska, à 830 km des États contigus :
//   1 380 km) : les îles d'un archipel, la Corse, la Crète, les Ryūkyū. Les
//   autres sont retirées (la Guyane, La Réunion pour la France ; Hawaï pour les
//   États-Unis ; les Galápagos ; les Açores et Madère ; les Canaries ; l'île de Pâques) :
//   à sa propre échelle (D620), une silhouette qui les garderait serait un point perdu
//   dans un cadre vide ;
// - les formes proches (D621 a) : chaque silhouette dessinée en COTE × COTE pixels par la
//   projection de l'appli (azimutale équivalente centrée sur elle, nord en haut, à sa
//   propre échelle, centrée), puis le recouvrement de deux silhouettes (intersection sur
//   union des pixels) ; une paire est proche à SEUIL au moins.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoAzimuthalEqualArea, geoCentroid, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const R_TERRE_KM = 6371;

/** Une partie plus loin que ceci (km, du sommet le plus proche d'une partie gardée) et que deux fois son rayon est retirée, sauf si elle est grande. */
export const ECART_KM = 500;
/** L'écart, au plus ce nombre de fois le rayon du pays entier (celui d'un disque de même aire). */
export const FACTEUR_ECART = 2.5;
/** Une partie d'au moins cette part du plus grand morceau est toujours gardée. */
export const PART_GRANDE = 0.25;
/** Côté du dessin des formes proches (pixels). */
export const COTE = 64;
/** Recouvrement (intersection sur union) à partir duquel deux silhouettes sont proches. */
export const SEUIL = 0.7;
/** Sommets au plus par partie pour la mesure des écarts (les autres sautés à pas régulier). */
const SOMMETS_ECART = 64;

/** Les polygones d'une forme (Polygon ou MultiPolygon), dans l'ordre de la géométrie. */
export function polygonesDe(forme) {
  const g = forme.geometry;
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

/** Un point [lon, lat] en vecteur unitaire. */
function vecteur([lon, lat]) {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

/** Quelques sommets de l'anneau extérieur d'un polygone, en vecteurs. */
function echantillon(polygone) {
  const anneau = polygone[0];
  const pas = Math.max(1, Math.floor(anneau.length / SOMMETS_ECART));
  const r = [];
  for (let i = 0; i < anneau.length; i += pas) r.push(vecteur(anneau[i]));
  return r;
}

/**
 * Les indices des polygones retirés d'une forme (les parties lointaines), triés ; [] si
 * tout est gardé. Le plus grand morceau et les grandes parties (PART_GRANDE) sont
 * toujours gardés ; puis, de proche en proche, une partie dont un sommet est à moins de
 * max(min(ECART_KM, FACTEUR_ECART × rayon du pays), 2 × son rayon) d'un
 * sommet d'une partie gardée (rayon : celui d'un disque de même aire).
 */
export function partiesRetirees(forme) {
  const polys = polygonesDe(forme);
  if (polys.length < 2) return [];
  const aires = polys.map((c) => geoArea({ type: 'Polygon', coordinates: c }));
  const principal = aires.indexOf(Math.max(...aires));
  const echantillons = polys.map(echantillon);
  // Deux points sont à moins de d km si leur produit scalaire (vecteurs unitaires) est au moins cos(d / R).
  const rayon = (a) => Math.sqrt(a / Math.PI) * R_TERRE_KM;
  const ecart = Math.min(ECART_KM, FACTEUR_ECART * rayon(aires.reduce((s, a) => s + a, 0)));
  const cosMin = aires.map((a) => Math.cos(Math.max(ecart, 2 * rayon(a)) / R_TERRE_KM));
  const gardees = new Set(polys.map((_, i) => i).filter((i) => i === principal || aires[i] >= PART_GRANDE * aires[principal]));
  let nouvelles = [...gardees];
  while (nouvelles.length) {
    const pool = nouvelles.flatMap((i) => echantillons[i]);
    nouvelles = [];
    for (let i = 0; i < polys.length; i++) {
      if (gardees.has(i)) continue;
      if (echantillons[i].some((a) => pool.some((b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= cosMin[i]))) {
        gardees.add(i);
        nouvelles.push(i);
      }
    }
  }
  return polys.map((_, i) => i).filter((i) => !gardees.has(i));
}

/** La forme réduite à ses parties gardées (MultiPolygon). */
export function formeGardee(forme, retirees) {
  const r = new Set(retirees);
  return { type: 'Feature', properties: forme.properties, geometry: { type: 'MultiPolygon', coordinates: polygonesDe(forme).filter((_, i) => !r.has(i)) } };
}

/**
 * La projection d'une silhouette (D620 a), celle de src/vues/silhouettes.ts : azimutale
 * équivalente centrée sur la forme gardée, nord en haut, sans rotation, ajustée à son
 * propre cadre (cote × cote, centrée).
 */
export function projectionSilhouette(forme, cote, marge = 0) {
  const [lon, lat] = geoCentroid(forme);
  return geoAzimuthalEqualArea()
    .rotate([-lon, -lat])
    .fitExtent(
      [
        [marge, marge],
        [cote - marge, cote - marge],
      ],
      forme,
    );
}

/** Le dessin en COTE × COTE pixels (1 dedans, 0 dehors), au centre de chaque pixel, règle pair-impair. */
export function masque(forme, cote = COTE) {
  const p = projectionSilhouette(forme, cote);
  const anneaux = polygonesDe(forme).flatMap((poly) => poly.map((anneau) => anneau.map((pt) => p(pt))).filter((a) => a.every(Boolean)));
  const m = new Uint8Array(cote * cote);
  for (let y = 0; y < cote; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (const a of anneaux) {
      for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
        const [x1, y1] = a[i];
        const [x2, y2] = a[j];
        if (y1 > yc !== y2 > yc) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const debut = Math.max(0, Math.ceil(xs[k] - 0.5));
      const fin = Math.min(cote - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = debut; x <= fin; x++) m[y * cote + x] = 1;
    }
  }
  return m;
}

/** Le recouvrement de deux dessins : intersection sur union, arrondi au centième. */
export function recouvrement(a, b) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    inter += a[i] & b[i];
    union += a[i] | b[i];
  }
  return union ? Math.round((inter / union) * 100) / 100 : 0;
}

/** Les données lues (sorties du build) : les pays, leurs formes, leurs noms. */
export function lireDonnees(racine = RACINE) {
  const lire = (f) => JSON.parse(readFileSync(join(racine, 'public', 'geo', f), 'utf8'));
  const topo = lire('monde.topo.json');
  const pays = lire('pays.json');
  const noms = lire('noms.fr.json');
  const formes = new Map(feature(topo, topo.objects.pays).features.map((f) => [f.properties.id, f]));
  const contestees = feature(topo, topo.objects.contestees).features;
  return { pays, noms, formes, contestees, infosContestees: lire('contestees.json') };
}

const parId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Les silhouettes : les pays jouables non micro, par id ; les exclus ; les parties retirées ; les paires proches. */
export function construire(d) {
  const jouables = d.pays.filter((p) => p.statut === 'jouable');
  const ids = jouables.filter((p) => !p.micro).map((p) => p.id).sort(parId);
  const exclus = jouables.filter((p) => p.micro).map((p) => p.id).sort(parId);
  const retirees = {};
  const gardees = new Map();
  for (const id of ids) {
    const f = d.formes.get(id);
    const r = partiesRetirees(f);
    if (r.length) retirees[id] = r;
    gardees.set(id, formeGardee(f, r));
  }
  const masques = new Map(ids.map((id) => [id, masque(gardees.get(id))]));
  const paires = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const s = recouvrement(masques.get(ids[i]), masques.get(ids[j]));
      if (s >= SEUIL) paires.push([ids[i], ids[j], s]);
    }
  paires.sort((a, b) => b[2] - a[2] || parId(a[0], b[0]) || parId(a[1], b[1]));
  return { ids, exclus, retirees, gardees, masques, paires };
}

/** Le texte de silhouettes.json : une paire par ligne. */
export function texteJson(c) {
  const entete = JSON.stringify({ v: 1, ecart_km: ECART_KM, facteur_ecart: FACTEUR_ECART, part_grande: PART_GRANDE, cote: COTE, seuil: SEUIL, retirees: c.retirees });
  return `${entete.slice(0, -1)},"paires":[\n${c.paires.map((p) => JSON.stringify(p)).join(',\n')}\n]}\n`;
}

/** Le nombre de sommets d'une forme (tous ses anneaux), au tracé de la carte (~2 km). */
export const sommets = (forme) => polygonesDe(forme).reduce((n, poly) => n + poly.reduce((m, a) => m + a.length, 0), 0);

/** Un flux projeté sans les points à moins de `tol` pixels du précédent gardé, ni les anneaux de moins d'un pixel (la planche reste légère). */
function eclaircir(sortie, tol) {
  let anneau = null;
  let polygone = false;
  return {
    point(x, y) {
      if (!anneau) return sortie.point(x, y);
      const d = anneau.at(-1);
      if (!d || (x - d[0]) ** 2 + (y - d[1]) ** 2 >= tol * tol) anneau.push([x, y]);
    },
    lineStart() {
      if (polygone) anneau = [];
      else sortie.lineStart();
    },
    lineEnd() {
      if (!anneau) return sortie.lineEnd();
      const a = anneau;
      anneau = null;
      const xs = a.map((q) => q[0]);
      const ys = a.map((q) => q[1]);
      if (a.length < 3 || Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 1) return;
      sortie.lineStart();
      for (const [x, y] of a) sortie.point(x, y);
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
    sphere: () => sortie.sphere?.(),
  };
}

/** La planche de relecture (SVG) : chaque silhouette dans sa case, son nom et son id dessous. */
function planche(d, c) {
  const CASE = 120;
  const DESSIN = 96;
  const PAR_LIGNE = 10;
  const morceaux = [];
  let y = 0;
  const titre = (t) => {
    y += 40;
    morceaux.push(`<text x="10" y="${y - 12}" class="titre">${t}</text>`);
  };
  const grille = (cases) => {
    cases.forEach((k, n) => {
      const x = (n % PAR_LIGNE) * CASE;
      const yy = y + Math.floor(n / PAR_LIGNE) * (CASE + 24);
      const p = projectionSilhouette(k.forme, DESSIN, 4);
      const trace = geoPath({ stream: (sortie) => p.stream(eclaircir(sortie, 1)) }).digits(0)(k.forme) ?? '';
      morceaux.push(`<g transform="translate(${x + (CASE - DESSIN) / 2} ${yy})"><rect width="${DESSIN}" height="${DESSIN}" class="cadre"/><path d="${trace}" class="forme"/></g>`);
      morceaux.push(`<text x="${x + CASE / 2}" y="${yy + DESSIN + 14}" class="nom">${k.legende}</text>`);
    });
    y += Math.ceil(cases.length / PAR_LIGNE) * (CASE + 24);
  };
  const nom = (id) => d.noms[id] ?? id;
  titre(`Les ${c.ids.length} silhouettes (D618 a), par id`);
  grille(c.ids.map((id) => ({ forme: c.gardees.get(id), legende: `${nom(id)} (${id})${c.retirees[id] ? ' *' : ''}` })));
  titre(`Les ${c.exclus.length} pays sans silhouette (micro-États), dessinés quand même`);
  grille(c.exclus.map((id) => ({ forme: d.formes.get(id), legende: `${nom(id)} (${id})` })));
  titre(`Les ${c.paires.length} paires de formes proches (recouvrement ≥ ${SEUIL})`);
  grille(c.paires.flatMap(([a, b, s]) => [a, b].map((id) => ({ forme: c.gardees.get(id), legende: `${nom(id)} · ${s}` }))));
  const largeur = PAR_LIGNE * CASE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${y + 20}" viewBox="0 0 ${largeur} ${y + 20}">
<style>
.titre { font: bold 18px sans-serif; fill: #eff0f3; }
.nom { font: 10px sans-serif; fill: #c8cad0; text-anchor: middle; }
.cadre { fill: #111214; }
.forme { fill: #eff0f3; }
</style>
<rect width="100%" height="100%" fill="#080809"/>
<text x="10" y="18" class="nom" style="text-anchor: start">* : parties lointaines retirées (docs/relectures/silhouettes.md). Généré par geodata/silhouettes.mjs.</text>
${morceaux.join('\n')}
</svg>
`;
}

const CONTINENTS = { Africa: 'Afrique', Asia: 'Asie', Europe: 'Europe', 'North America': 'Amérique du Nord', 'South America': 'Amérique du Sud', Oceania: 'Océanie' };

/** Un point [lon, lat] lisible : « 53° O, 4° N ». */
const ou = ([lon, lat]) => `${Math.abs(Math.round(lon))}° ${lon < 0 ? 'O' : 'E'}, ${Math.abs(Math.round(lat))}° ${lat < 0 ? 'S' : 'N'}`;

/** La relecture (docs/relectures/silhouettes.md) : ce qu'il y a à trancher, puis les tableaux, chaque ligne avec sa règle. */
function relecture(d, c) {
  const nom = (id) => d.noms[id] ?? id;
  const parPays = new Map(d.pays.map((p) => [p.id, p]));
  const n = (x) => Math.round(x).toLocaleString('fr-FR').replace(/\s/g, ' ');
  const virgule = (x) => String(x).replace('.', ',');
  const partie = (id, i) => {
    const poly = { type: 'Polygon', coordinates: polygonesDe(d.formes.get(id))[i] };
    return { km2: geoArea(poly) * R_TERRE_KM ** 2, ou: geoCentroid(poly) };
  };
  const avecRetrait = Object.keys(c.retirees);
  const plusPetits = [...c.ids].sort((a, b) => parPays.get(a).partie_max_km2 - parPays.get(b).partie_max_km2).slice(0, 10);
  const L = [];
  L.push(
    '# Silhouettes du J4 : la liste et les formes proches à relire',
    '',
    `*Écrit par \`npm run silhouettes\` (\`geodata/silhouettes.mjs\`) avec \`public/geo/silhouettes.json\` et la planche \`docs/relectures/silhouettes-planche.svg\` : ne pas éditer ce fichier, il est refait à chaque passage. Ticket #6, lot 1 ; étude \`docs/etudes/2026-11-25-j4-conception.md\`, § 6 (D618, D620, D621 ; S606, S610, S613).*`,
    '',
    "Le sujet Silhouettes est codé mais **caché** (`SILHOUETTES_RELUES = false`, `src/visibles.ts`) : ni dans Jouer, ni dans la mémoire, ni dans les épreuves, ni au quiz, et rien ne s'écrit au journal. Raison : un id de fiche (`silhouettes:FRA:nommer`) écrit au journal ne s'efface plus ; une silhouette retirée après coup laisserait des fiches orphelines. Une fois la liste validée, un seul commit la montre partout (`SILHOUETTES_RELUES = true`) ; les règles Firestore acceptent déjà ses épreuves. Pour la voir avant : le serveur de développement avec `?silhouettes` dans l'adresse (jamais au build), ou le pilote (`driver.py silhouettes`).",
    '',
    '## Ce que tu as à trancher',
    '',
    `1. **La liste (D618).** ${c.ids.length} pays ont une silhouette (tableau 1), ${c.exclus.length} n'en ont pas (tableau 2) : les micro-États, ceux dont le plus grand morceau fait moins de 2 000 km² (\`micro: true\` de \`pays.json\`). D'où le Cap-Vert, Samoa et Maurice exclus, le Luxembourg (2 600 km² d'un seul tenant) gardé. Les dessins de la planche (première partie : les ${c.ids.length} ; deuxième : les ${c.exclus.length}, dessinés quand même) montrent ce que donnerait chacun. Recommandation de l'étude : **garder ce critère (D618 a)**. Autres choix : sans les 5 archipels restants, Bahamas, Indonésie, Philippines, Salomon, Vanuatu (D618 b, 161 pays) ; les 195 (D618 c) ; ou une liste à la main.`,
    `2. **Les parties lointaines retirées** (une règle de ce lot, que l'étude ne disait pas). Chaque silhouette est dessinée à sa propre échelle (D620 a) : une île lointaine gardée réduirait le pays à un point dans un cadre vide. ${avecRetrait.length} pays perdent des parties (tableau 1, colonne « Parties retirées » ; marqués * sur la planche) : la Guyane, les Antilles, La Réunion et Mayotte pour la France ; Hawaï pour les États-Unis ; les Galápagos ; les Açores et Madère ; les Canaries ; les îles Andaman-et-Nicobar ; l'île de Pâques… L'Alaska reste aux États-Unis, le Svalbard à la Norvège, la Corse à la France, Okinawa au Japon. La règle : sont gardés le plus grand morceau et toute partie d'au moins ${virgule(PART_GRANDE * 100)} % de lui ; puis, de proche en proche, toute partie à moins de ${ECART_KM} km d'une partie gardée (moins pour un petit pays : ${virgule(FACTEUR_ECART)} fois le rayon d'un disque de sa superficie ; plus pour une grande partie : deux fois son propre rayon). D'accord avec ce qui est retiré ?`,
    "3. **La Crimée (S606).** Le tracé de fait de Natural Earth, celui de la carte, met la Crimée dans la Russie, en zone contestée hachurée : la silhouette de l'Ukraine est sans la Crimée, celle de la Russie l'a, hachurée. De même pour toute zone contestée : hachurée sur la silhouette de qui la tient (le Sahara occidental tenu par le Maroc, l'Aksai Chin par la Chine…). La silhouette ne tranche rien de plus que la carte. D'accord ?",
    `4. **Les formes proches (D621, S610).** ${c.paires.length} paires de recouvrement au moins ${virgule(SEUIL)} (tableau 3 ; troisième partie de la planche, côte à côte) : les leurres du quiz difficile et expert, complétés par les voisins. Le recouvrement : les deux silhouettes dessinées en ${COTE} × ${COTE} pixels, centrées, chacune à son échelle, puis la part commune (intersection sur union). Aucune paire ne dépasse 0,8 : des formes « en bloc » proches (Allemagne et Eswatini, Cambodge et Nigeria) plutôt que des sosies. Ces paires te paraissent-elles proches à l'œil ? Un autre seuil ?`,
    '',
    '## Comment corriger',
    '',
    "- La liste : `SANS_SILHOUETTE` de `src/srs/fiches.ts` (figée à la main ; `tests/donnees-silhouettes.test.ts` la confronte à `pays.json`), puis les tailles des épreuves (`TAILLES_SILHOUETTES` de `src/epreuve/chrono.ts`, la carte `silhouettes` de `tailles(cle)` dans `firestore.rules`, `BORNE_GENERAL`), et `npm run silhouettes`.",
    "- Les parties retirées : `ECART_KM`, `FACTEUR_ECART` et `PART_GRANDE` de `geodata/silhouettes.mjs`, puis `npm run silhouettes` ; une exception pour un pays se met dans la même fonction (`partiesRetirees`).",
    '- Les formes proches : `SEUIL` de `geodata/silhouettes.mjs`, puis `npm run silhouettes`.',
    '',
    `## 1. Les ${c.ids.length} silhouettes`,
    '',
    "Sommets : ceux du tracé de la carte (~2 km), parties retirées exclues ; l'appli en dessine moins (simplifié à ~1 pixel). La règle de chaque ligne : « gardé » (plus grand morceau d'au moins 2 000 km²), et ses parties retirées s'il en a.",
    '',
    '| Pays | Id | Continent | Superficie (km²) | Plus grand morceau (km²) | Sommets | Parties retirées | Règle |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const id of [...c.ids].sort((a, b) => nom(a).localeCompare(nom(b), 'fr'))) {
    const p = parPays.get(id);
    const r = c.retirees[id];
    const parties = r ? r.map((i) => partie(id, i)).sort((x, y) => y.km2 - x.km2) : [];
    const retire = r ? `${r.length}, ${n(parties.reduce((s, x) => s + x.km2, 0))} km² (la plus grande : ${n(parties[0].km2)} km², vers ${ou(parties[0].ou)})` : '—';
    L.push(`| ${nom(id)} | ${id} | ${CONTINENTS[p.continent] ?? p.continent} | ${n(p.superficie_km2)} | ${n(p.partie_max_km2)} | ${n(sommets(c.gardees.get(id)))} | ${retire} | gardé : plus grand morceau ≥ 2 000 km²${r ? ' ; parties lointaines retirées' : ''} |`);
  }
  L.push(
    '',
    `## 2. Les ${c.exclus.length} pays sans silhouette`,
    '',
    `Du plus grand au plus petit. S613 : leurs sommets au tracé de la carte, à comparer à ceux des 10 plus petits gardés (${plusPetits.map((id) => `${nom(id)} ${n(sommets(c.gardees.get(id)))}`).join(', ')}).`,
    '',
    '| Pays | Id | Superficie (km²) | Plus grand morceau (km²) | Sommets | Règle |',
    '|---|---|---|---|---|---|',
  );
  for (const id of [...c.exclus].sort((a, b) => parPays.get(b).superficie_km2 - parPays.get(a).superficie_km2)) {
    const p = parPays.get(id);
    L.push(`| ${nom(id)} | ${id} | ${n(p.superficie_km2)} | ${n(p.partie_max_km2)} | ${n(sommets(d.formes.get(id)))} | exclu : plus grand morceau < 2 000 km² (micro) |`);
  }
  L.push('', `## 3. Les ${c.paires.length} paires de formes proches`, '', 'De la plus proche à la moins proche.', '', '| Paire | Ids | Recouvrement | Règle |', '|---|---|---|---|');
  for (const [a, b, sc] of c.paires) L.push(`| ${nom(a)} et ${nom(b)} | ${a}, ${b} | ${virgule(sc)} | recouvrement ≥ ${virgule(SEUIL)} en ${COTE} × ${COTE} |`);
  return `${L.join('\n')}\n`;
}

/** Écrit silhouettes.json, la planche et la relecture. */
export function principal() {
  const d = lireDonnees();
  const c = construire(d);
  writeFileSync(join(RACINE, 'public', 'geo', 'silhouettes.json'), texteJson(c));
  writeFileSync(join(RACINE, 'docs', 'relectures', 'silhouettes-planche.svg'), planche(d, c));
  writeFileSync(join(RACINE, 'docs', 'relectures', 'silhouettes.md'), relecture(d, c));
  console.error(`silhouettes : ${c.ids.length} pays, ${c.exclus.length} sans silhouette, ${Object.keys(c.retirees).length} avec des parties retirées, ${c.paires.length} paires proches (≥ ${SEUIL})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
