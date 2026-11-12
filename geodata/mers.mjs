// Océans et mers (étude J2, § 2.3, § 2.5 et § 4.5 ; décision « Océans et mers », liste du
// 12/11), appelé par geodata/build.mjs (tout le build, ou --seulement mers) ; sans réseau
// (la couche est téléchargée et vérifiée par build.mjs), sans effet à l'import. Lit :
//   geodata/raw/natural-earth/ne_10m_geography_marine_polys.*  Natural Earth v5.1.2,
//                      306 zones marines qui forment une partition (les mers découpées
//                      hors des océans, les sous-mers hors de leur mer)
//   geodata/mers.json  table à la main : les 50 zones retenues (ids, noms, sortes,
//                      parents, intérieures), les zones forcées et exclues, une raison
//                      par ligne
//   geodata/wikidata/mers-entites.json  libellés français de Wikidata (extrait figé
//                      du 10/11) : le nom de chaque zone doit y être égal
// Produit (identiques octet pour octet d'un lancement à l'autre) :
//   mers.topo.json     objet « mers », propriété id seule, simplifiée à 10 km
//   mers-leger.topo.json  la même à 50 km, pour les gestes (D45 a : seule chargée à l'accueil)
//   mers.json          [{id, sorte, parents, interieure, bassin, enclavee?, x?,
//                      superficie_km2, point, bbox, voisins}] dans l'ordre de la table ;
//                      x : les zones avec qui elle n'est jamais leurre (mer d'Arabie et
//                      golfe d'Oman, lu au lot 3b) ; enclavee : la mer sans côte qu'un
//                      océan allumé montre avec lui (la mer des Sargasses, 12/11)
//   mers.fr.json       {noms: {id: nom}, alias: {id: [...]}} (comme capitales.fr.json)
//   geodata/mers-affectations.json  témoin versionné, non servi : la zone retenue (ou
//                      l'exclusion) de chacune des 306 zones de Natural Earth, et pourquoi
// Chaîne (§ 2.3, étapes 1 à 5) : lecture en topologie (mapshaper 0.6.110) ; antiméridien
// recalé à ±180 exact (Natural Earth écrit 179.99989708894586, que estCouture ne
// reconnaît pas) et pôle à 90 exact ; affectation, puis -dissolve id ; simplification en
// topologie (les bords communs restent identiques) ; densification à 1° après la
// simplification, depuis la plus petite extrémité de chaque arête (comme
// maillage.densifier : les mêmes points des deux côtés d'un bord commun), coutures
// exceptées, sinon le grand cercle de d3 et la ligne droite du dessin divergent ;
// attributs sur la géométrie dissoute non simplifiée, comme pour les pays.
// Échoue (exception) si la table et la couche ne s'accordent plus : une zone ni affectée
// ni exclue, une mer non retenue sans ligne forcée, une mer sortie fondue ailleurs que
// dans un océan, un nom qui n'est plus le libellé de Wikidata.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { geoArea, geoContains, geoLength } from 'd3-geo';
import mapshaper from 'mapshaper';
import { feature, neighbors } from 'topojson-client';
import { arrondi, emprise, fusionnerPartie, km2, pointInterieur, polygones, R_TERRE_KM, sha256 } from './outils.mjs';

/** La couche marine de Natural Earth (10m_physical), ses fichiers dans geodata/raw/natural-earth/. */
export const NE_MERS = 'ne_10m_geography_marine_polys';
const NE_EXTENSIONS = ['shp', 'shx', 'dbf', 'prj', 'cpg'];

export const CHEMINS = {
  script: 'geodata/mers.mjs',
  table: 'geodata/mers.json',
  entites: 'geodata/wikidata/mers-entites.json',
  affectations: 'geodata/mers-affectations.json',
  raw: 'geodata/raw/natural-earth',
};

/** Sortes d'une zone, dans l'ordre du tableau du § 2.3. */
export const SORTES = ['océan', 'mer', 'golfe', 'baie', 'bras de mer'];

/** Ids : 3 à 8 lettres minuscules, sans accent ni tiret (les lots de la synchro, § 3.3). */
export const FORME_ID = /^[a-z]{3,8}$/;

const SIMPLIFICATION = 'visvalingam interval=10000 keep-shapes'; // 10 km, au repos
const SIMPLIFICATION_LEGERE = 'visvalingam interval=50000 keep-shapes'; // 50 km, pendant un geste
const QUANTIFICATION = 1e5;
/** Pas de la densification (degrés), comme PAS_DENSIFIER_DEG de src/map/maillage.ts. */
const PAS_DENSIFIER = 1;
/** Un sommet à moins de cet écart de ±180 est sur l'antiméridien (Natural Earth : 1,03e-4). */
const ECART_ANTIMERIDIEN = 2e-4;
/** Comme EPS de src/map/dessin.ts et maillage.ts (estCouture). */
const EPS = 1e-9;

const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => k !== '_');

/** Comparaison de noms sans accents, casse, tirets ni apostrophes (comme capitales.mjs). */
const normaliser = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[-‐‑–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// --- Table --------------------------------------------------------------------------

/**
 * Les fautes de la table (geodata/mers.json) seule : ids, sortes, parents sans cycle,
 * bassins, noms égaux aux libellés de l'extrait Wikidata, alias, x symétriques,
 * zones forcées vers un id connu, raisons écrites. entites : Qid → {fr}.
 */
export function fautesTable(table, entites) {
  const fautes = [];
  const zones = table.zones ?? [];
  const parId = new Map();
  for (const z of zones) {
    if (!FORME_ID.test(z.id)) fautes.push(`${z.id} : id hors de la forme ${FORME_ID}`);
    if (parId.has(z.id)) fautes.push(`${z.id} : id en double`);
    parId.set(z.id, z);
  }
  const estOcean = (id) => parId.get(id)?.sorte === 'océan';
  const nes = new Set();
  for (const z of zones) {
    if (!SORTES.includes(z.sorte)) fautes.push(`${z.id} : sorte ${z.sorte} inconnue`);
    if (!Array.isArray(z.parents)) fautes.push(`${z.id} : parents absents`);
    for (const p of z.parents ?? []) if (!parId.has(p) || p === z.id) fautes.push(`${z.id} : parent ${p} inconnu`);
    if (z.sorte === 'océan' && z.parents?.length) fautes.push(`${z.id} : un océan n'a pas de parent`);
    if (z.sorte !== 'océan' && !z.parents?.length && !estOcean(z.bassin)) fautes.push(`${z.id} : sans parent ni bassin (un océan)`);
    if (z.bassin !== undefined && z.parents?.length) fautes.push(`${z.id} : bassin posé à la main alors qu'un parent y mène`);
    for (const c of ['interieure', 'enclavee']) if (z[c] !== undefined && z[c] !== true) fautes.push(`${z.id} : ${c} vaut true ou rien`);
    if (z.enclavee && !(z.parents?.length === 1 && estOcean(z.parents[0]))) fautes.push(`${z.id} : enclavée, son seul parent doit être un océan`);
    if (!/^Q\d+$/.test(z.q ?? '')) fautes.push(`${z.id} : item Wikidata absent`);
    else if (!entites[z.q]) fautes.push(`${z.id} : ${z.q} absent de ${CHEMINS.entites}`);
    else if (entites[z.q].fr !== z.nom) fautes.push(`${z.id} : nom « ${z.nom} » ≠ libellé de Wikidata « ${entites[z.q].fr} »`);
    if (!z.ne?.length) fautes.push(`${z.id} : aucune zone Natural Earth`);
    for (const n of z.ne ?? []) {
      if (nes.has(n)) fautes.push(`${z.id} : zone Natural Earth ${n} déjà prise`);
      nes.add(n);
    }
    for (const a of z.alias ?? []) if (normaliser(a) === normaliser(z.nom)) fautes.push(`${z.id} : alias égal au nom`);
    for (const y of z.x ?? []) {
      if (!parId.has(y) || y === z.id) fautes.push(`${z.id} : x ${y} inconnu`);
      else if (!(parId.get(y).x ?? []).includes(z.id)) fautes.push(`${z.id} : x ${y} sans le retour`);
    }
  }
  // Pas de cycle : remonter les parents finit toujours (au plus autant de pas que de zones).
  for (const z of zones) {
    const vus = new Set();
    const pile = [z.id];
    while (pile.length) {
      const id = pile.pop();
      for (const p of parId.get(id)?.parents ?? []) {
        if (p === z.id) {
          fautes.push(`${z.id} : cycle de parents`);
          pile.length = 0;
          break;
        }
        if (!vus.has(p)) {
          vus.add(p);
          pile.push(p);
        }
      }
    }
  }
  for (const [nom, f] of sansNotes(table.forcees)) {
    if (!parId.has(f.id)) fautes.push(`forcees, ${nom} : id ${f.id} inconnu`);
    else if (f.sortie && !estOcean(f.id)) fautes.push(`forcees, ${nom} : mer sortie de la liste fondue dans ${f.id}, qui n'est pas un océan`);
    if (!/\S{3}/.test(f.raison ?? '')) fautes.push(`forcees, ${nom} : sans raison`);
    if (nes.has(nom)) fautes.push(`forcees, ${nom} : c'est une zone retenue`);
  }
  for (const [nom, raison] of sansNotes(table.exclues)) {
    if (!/\S{3}/.test(raison ?? '')) fautes.push(`exclues, ${nom} : sans raison`);
    if (nes.has(nom) || table.forcees?.[nom]) fautes.push(`exclues, ${nom} : retenue ou forcée`);
  }
  return fautes;
}

/** Le bassin d'une zone : l'océan atteint en remontant le premier parent, ou celui de la table. */
export function bassin(id, parId) {
  let z = parId.get(id);
  for (let i = 0; z && i <= parId.size; i++) {
    if (z.sorte === 'océan') return z.id;
    if (z.bassin) return z.bassin;
    z = parId.get(z.parents[0]);
  }
  return null;
}

// --- Affectation ----------------------------------------------------------------------

/**
 * Affecte chaque zone de Natural Earth à une zone retenue (§ 2.3, Fusion). zones :
 * [{nom, ne_id, cla, voisins: [[indice, km de bord commun]]}] ; table : geodata/mers.json.
 * Une zone citée par la table (par son nom, ou son ne_id en texte) est retenue, forcée
 * ou exclue ; une mer non retenue (cla « sea ») doit l'être ; les autres sont fondues,
 * tour après tour, dans la zone déjà affectée de leur plus long bord commun (affectées
 * avant le tour : l'ordre des zones n'y change rien ; à égalité, le plus petit indice).
 * Rend {cibles: id ou null (exclue), modes, via, fautes} ; une zone ni affectée ni
 * exclue (aucun bord vers une zone affectée) est une faute.
 */
export function affecter(zones, table) {
  const fautes = [];
  const cibles = zones.map(() => undefined);
  const modes = zones.map(() => undefined);
  const via = zones.map(() => undefined);
  const cles = (z) => [z.nom, String(z.ne_id)].filter(Boolean);
  const parCle = new Map();
  zones.forEach((z, i) => {
    for (const c of cles(z)) {
      if (!parCle.has(c)) parCle.set(c, []);
      parCle.get(c).push(i);
    }
  });
  const trouver = (cle, ou) => {
    const l = parCle.get(cle) ?? [];
    if (!l.length) fautes.push(`${ou} : zone Natural Earth « ${cle} » absente de la couche`);
    return l;
  };
  for (const z of table.zones) {
    for (const n of z.ne) {
      for (const i of trouver(n, z.id)) {
        if (cibles[i] !== undefined) fautes.push(`${z.id} : ${n} déjà affectée`);
        cibles[i] = z.id;
        modes[i] = 'retenue';
      }
    }
  }
  for (const [cle, f] of sansNotes(table.forcees)) {
    for (const i of trouver(cle, 'forcees')) {
      if (cibles[i] !== undefined) fautes.push(`forcees : ${cle} déjà ${modes[i]}`);
      cibles[i] = f.id;
      modes[i] = 'forcée';
    }
  }
  for (const [cle] of sansNotes(table.exclues)) {
    for (const i of trouver(cle, 'exclues')) {
      if (cibles[i] !== undefined) fautes.push(`exclues : ${cle} déjà ${modes[i]}`);
      cibles[i] = null;
      modes[i] = 'exclue';
    }
  }
  zones.forEach((z, i) => {
    if (cibles[i] === undefined && z.cla === 'sea') {
      fautes.push(`${z.nom || z.ne_id} : mer non retenue sans ligne dans forcees (jamais fondue au plus long bord)`);
      cibles[i] = null;
      modes[i] = 'faute';
    }
  });
  for (;;) {
    const avant = [...cibles];
    let change = false;
    zones.forEach((z, i) => {
      if (cibles[i] !== undefined) return;
      let choix = -1;
      let long = -1;
      for (const [j, km] of z.voisins) {
        if (typeof avant[j] !== 'string') continue;
        if (km > long || (km === long && j < choix)) {
          choix = j;
          long = km;
        }
      }
      if (choix < 0) return;
      cibles[i] = avant[choix];
      modes[i] = 'auto';
      via[i] = { zone: zones[choix].nom || String(zones[choix].ne_id), km: Math.round(long) };
      change = true;
    });
    if (!change) break;
  }
  zones.forEach((z, i) => {
    if (cibles[i] === undefined) fautes.push(`${z.nom || z.ne_id} (${z.ne_id}) : ni affectée ni exclue (aucun bord vers une zone affectée)`);
  });
  return { cibles, modes, via, fautes };
}

// --- Géométrie ------------------------------------------------------------------------

/** Arête le long de l'antiméridien ou d'un pôle (comme estCouture de src/map/dessin.ts). */
const estCouture = (a, b) => (Math.abs(a[0]) >= 180 - EPS && a[0] === b[0]) || (Math.abs(a[1]) >= 90 - EPS && a[1] === b[1]);
const avant = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * Anneau fermé densifié : une arête de plus de PAS_DENSIFIER (en longitude ou en
 * latitude) est coupée en parts égales, calculées depuis sa plus petite extrémité (les
 * mêmes nombres dans les deux sens de parcours) ; les coutures restent droites.
 */
export function densifierAnneau(anneau, pas = PAS_DENSIFIER) {
  const sortie = [];
  for (let i = 0; i < anneau.length - 1; i++) {
    const a = anneau[i];
    const b = anneau[i + 1];
    sortie.push(a);
    if (estCouture(a, b)) continue;
    const k = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / pas);
    if (k < 2) continue;
    const [p, q] = avant(a, b) ? [a, b] : [b, a];
    for (let j = 1; j < k; j++) {
      const t = (p === a ? j : k - j) / k;
      sortie.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  sortie.push(anneau[anneau.length - 1]);
  return sortie;
}

/** Polygones (tableaux d'anneaux) d'une géométrie GeoJSON. */
const polysDe = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/**
 * Aire sphérique (stéradians) d'un polygone, mesurée sur ses anneaux densifiés : d3 lit
 * une arête comme un grand cercle, et Natural Earth garde des bords droits de plusieurs
 * dizaines de degrés (60,53° S sur 146,5° de longitude pour l'Austral, 33,9° pour la mer
 * de Beaufort) qui, non coupés, plongent vers le pôle et faussent l'aire (l'Austral à
 * 4,7 M km² au lieu de 20,8 M). C'est le piège que l'étape 4 corrige pour le dessin.
 */
const aireDensifiee = (p) => geoArea({ type: 'Polygon', coordinates: p.map((r) => densifierAnneau(r)) });

/** Indice du polygone de plus grande aire (polygones déjà dans le sens de d3). */
function plusGrand(polys) {
  let iMax = 0;
  let max = -1;
  polys.forEach((p, i) => {
    const a = aireDensifiee(p);
    if (a > max) {
      max = a;
      iMax = i;
    }
  });
  return iMax;
}

// --- Construction ----------------------------------------------------------------------

/**
 * Étapes 1 et 2 : la couche marine lue en topologie (sans quantification), l'antiméridien
 * recalé à ±180 et le pôle à ±90 ; zones : ce qu'affecter() lit (nom, ne_id, featurecla,
 * aire, bords communs en km sur la topologie). racine : la racine du dépôt.
 */
export async function lireCouche(racine) {
  const entree = {};
  for (const ext of NE_EXTENSIONS) entree[`${NE_MERS}.${ext}`] = await readFile(join(racine, CHEMINS.raw, `${NE_MERS}.${ext}`));
  const lu = await mapshaper.applyCommands(`-i ${NE_MERS}.shp encoding=utf8 -o m.json format=topojson no-quantization`, entree);
  const topo = JSON.parse(String(lu['m.json']));
  const objet = topo.objects[NE_MERS];
  if (!objet) throw new Error(`mers : objet ${NE_MERS} absent de la topologie`);

  const recales = new Map();
  let poles = 0;
  for (const arc of topo.arcs) {
    for (const p of arc) {
      if (Math.abs(p[0]) !== 180 && Math.abs(p[0]) >= 180 - ECART_ANTIMERIDIEN) {
        recales.set(p[0], (recales.get(p[0]) ?? 0) + 1);
        p[0] = Math.sign(p[0]) * 180;
      }
      if (Math.abs(p[1]) !== 90 && Math.abs(p[1]) >= 90 - EPS) {
        p[1] = Math.sign(p[1]) * 90;
        poles++;
      }
    }
  }
  const note = `antiméridien : ${[...recales].map(([x, n]) => `${n} sommets à ${x}`).join(', ') || 'aucun sommet'} recalés à ±180 ; ${poles} au pôle recalés à ±90`;

  // Bords communs (km) sur la topologie de la couche.
  const geoms = objet.geometries;
  const longueur = topo.arcs.map((a) => geoLength({ type: 'LineString', coordinates: a }) * R_TERRE_KM);
  const arcsDe = (g) => {
    const s = new Set();
    const voir = (x) => (Array.isArray(x) ? x.forEach(voir) : s.add(x < 0 ? ~x : x));
    voir(g.arcs ?? []);
    return s;
  };
  const arcs = geoms.map(arcsDe);
  const parArc = new Map();
  arcs.forEach((s, i) => s.forEach((a) => (parArc.get(a) ?? parArc.set(a, []).get(a)).push(i)));
  const formes = feature(topo, objet).features;
  const zones = geoms.map((g, i) => {
    const bords = new Map();
    for (const a of arcs[i]) for (const j of parArc.get(a)) if (j !== i) bords.set(j, (bords.get(j) ?? 0) + longueur[a]);
    const aire = polygones(formes[i].geometry).reduce((s, p) => s + aireDensifiee(p), 0);
    const p = g.properties;
    return { nom: p.name ?? '', ne_id: p.ne_id, cla: p.featurecla, km2: km2(aire), voisins: [...bords] };
  });
  return { topo, objet, zones, note };
}

/**
 * Construit les fichiers servis et le témoin des affectations. racine : la racine du
 * dépôt. Rend { fichiers: {nom: texte} (public/geo/), affectations (texte du témoin),
 * entrees, traitement, notes } : entrees et traitement vont dans public/geo/sources.json
 * (fusionnerMers).
 */
export async function construireMers(racine) {
  const lire = (c) => readFile(join(racine, c));
  const [tableBrut, scriptBrut, entitesBrut] = await Promise.all([CHEMINS.table, CHEMINS.script, CHEMINS.entites].map(lire));
  const table = JSON.parse(tableBrut.toString('utf8'));
  const entites = JSON.parse(entitesBrut.toString('utf8'));
  const echec = (fautes) => {
    if (fautes.length) throw new Error(`mers :\n  ${fautes.join('\n  ')}`);
  };
  echec(fautesTable(table, entites));
  const parId = new Map(table.zones.map((z) => [z.id, z]));
  const ordre = new Map(table.zones.map((z, i) => [z.id, i]));

  // 1, 2. Lecture, antiméridien ; 3. affectation.
  const { topo, objet, zones, note } = await lireCouche(racine);
  const notes = [note];
  const geoms = objet.geometries;
  const aff = affecter(zones, table);
  echec(aff.fautes);
  const lignesAff = zones.map((z, i) =>
    JSON.stringify({
      ne_id: z.ne_id,
      nom: z.nom,
      cla: z.cla,
      km2: Math.round(z.km2),
      id: aff.cibles[i],
      mode: aff.modes[i],
      ...(aff.via[i] ? { via: aff.via[i].zone, bord_km: aff.via[i].km } : {}),
    }),
  );
  const affectations = `[\n${lignesAff.join(',\n')}\n]\n`;
  const compte = (m) => aff.modes.filter((x) => x === m).length;
  notes.push(`${zones.length} zones Natural Earth : ${compte('retenue')} retenues, ${compte('forcée')} forcées, ${compte('auto')} au plus long bord, ${compte('exclue')} exclues`);

  // Les zones exclues quittent la topologie ; les autres portent l'id de leur retenue.
  objet.geometries = geoms.filter((g, i) => {
    g.properties = { id: aff.cibles[i] };
    return aff.cibles[i] !== null;
  });
  const texteTopo = JSON.stringify(topo);

  // 4. Dissolution, simplification en topologie, densification, quantification.
  const rangees = (geometries) => {
    const ids = geometries.map((g) => g.properties?.id);
    if (ids.length !== table.zones.length || table.zones.some((z) => !ids.includes(z.id))) {
      throw new Error(`mers : ${ids.length} zones après dissolution (${ids.join(', ')})`);
    }
    return [...geometries].sort((a, b) => ordre.get(a.properties.id) - ordre.get(b.properties.id));
  };
  async function variante(simplification) {
    const a = await mapshaper.applyCommands(`-i m.json -dissolve id -simplify ${simplification} -o d.json format=geojson`, { 'm.json': texteTopo });
    const fc = JSON.parse(String(a['d.json']));
    for (const f of fc.features) for (const p of polysDe(f.geometry)) for (let k = 0; k < p.length; k++) p[k] = densifierAnneau(p[k]);
    const b = await mapshaper.applyCommands(`-i d.json name=mers -o t.json format=topojson quantization=${QUANTIFICATION}`, { 'd.json': JSON.stringify(fc) });
    const t = JSON.parse(String(b['t.json']));
    if (!t.objects.mers) throw new Error('mers : objet mers absent de la topologie simplifiée');
    t.objects.mers.geometries = rangees(t.objects.mers.geometries).map((g) => {
      if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') throw new Error(`mers : ${g.properties.id} vide après simplification`);
      return { ...g, properties: { id: g.properties.id } };
    });
    return t;
  }
  const topoFine = await variante(SIMPLIFICATION);
  const topoLegere = await variante(SIMPLIFICATION_LEGERE);

  // 5. Attributs sur la géométrie dissoute non simplifiée ; voisins par sa topologie.
  const d = await mapshaper.applyCommands(`-i m.json -dissolve id -o d.json format=geojson -o v.json format=topojson no-quantization`, { 'm.json': texteTopo });
  const dissoutes = new Map(JSON.parse(String(d['d.json'])).features.map((f) => [f.properties.id, polygones(f.geometry)]));
  const tv = JSON.parse(String(d['v.json']));
  const gv = Object.values(tv.objects)[0].geometries;
  const vois = neighbors(gv);
  const voisins = new Map(gv.map((g, i) => [g.properties.id, [...new Set(vois[i].map((j) => gv[j].properties.id))].sort()]));
  const formesFines = new Map(feature(topoFine, topoFine.objects.mers).features.map((f) => [f.properties.id, f]));
  const fautes = [];
  const lignes = table.zones.map((z) => {
    const polys = dissoutes.get(z.id) ?? [];
    if (!polys.length) fautes.push(`${z.id} : géométrie vide`);
    const superficie = polys.reduce((s, p) => s + km2(aireDensifiee(p)), 0);
    let point = pointInterieur(polys[plusGrand(polys)]);
    // Point pris dans la forme source : s'il sort de la forme simplifiée (une côte
    // découpée), il est repris dans son plus grand polygone, celui qu'on voit.
    const f = formesFines.get(z.id);
    if (!geoContains(f, point)) {
      const ps = polysDe(f.geometry);
      point = pointInterieur(ps[plusGrand(ps)]);
      notes.push(`${z.id} : point repris dans la forme simplifiée`);
      if (!geoContains(f, point)) fautes.push(`${z.id} : point hors de sa forme simplifiée`);
    }
    const v = voisins.get(z.id) ?? [];
    if (z.enclavee && (v.length !== 1 || v[0] !== z.parents[0])) fautes.push(`${z.id} : enclavée, mais voisine de ${v.join(', ')}`);
    const o = { id: z.id, sorte: z.sorte, parents: z.parents, interieure: Boolean(z.interieure), bassin: bassin(z.id, parId) };
    if (z.enclavee) o.enclavee = true;
    if (z.x) o.x = [...z.x].sort();
    Object.assign(o, { superficie_km2: Math.round(superficie), point, bbox: emprise(polys), voisins: v });
    return JSON.stringify(o);
  });
  echec(fautes);

  const noms = Object.fromEntries(table.zones.map((z) => [z.id, z.nom]));
  const alias = Object.fromEntries(table.zones.filter((z) => z.alias?.length).map((z) => [z.id, [...z.alias].sort((a, b) => a.localeCompare(b, 'fr'))]));
  const objetTexte = (o) => `{\n${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}`;
  const fichiers = {
    'mers.topo.json': JSON.stringify(topoFine),
    'mers-leger.topo.json': JSON.stringify(topoLegere),
    'mers.json': `[\n${lignes.join(',\n')}\n]\n`,
    'mers.fr.json': `{\n"noms":${objetTexte(noms)},\n"alias":${objetTexte(alias)}\n}\n`,
  };
  const traitement = {
    couche: `${NE_MERS} : ${zones.length} zones, ${table.zones.length} retenues (geodata/mers.json), les autres fondues dans la retenue de leur plus long bord commun, forcées ou exclues (geodata/mers-affectations.json)`,
    chaine:
      `mapshaper 0.6.110 en topologie : antiméridien recalé à ±180 et pôle à ±90 ; -dissolve id ; -simplify ${SIMPLIFICATION} ` +
      `(mers.topo.json) ou ${SIMPLIFICATION_LEGERE} (mers-leger.topo.json) ; densifiées à ${PAS_DENSIFIER}° hors coutures, depuis la plus petite extrémité ; quantification ${QUANTIFICATION}`,
    attributs: `superficie (d3-geo geoArea × R², R = ${R_TERRE_KM} km, anneaux densifiés à ${PAS_DENSIFIER}°), point (pôle d'inaccessibilité du plus grand polygone), emprise et voisins sur la géométrie dissoute non simplifiée`,
    poids_gzip: Object.fromEntries(['mers.topo.json', 'mers-leger.topo.json'].map((n) => [n, gzipSync(fichiers[n]).length])),
  };
  const entrees = {
    [CHEMINS.script]: sha256(scriptBrut),
    [CHEMINS.table]: sha256(tableBrut),
    [CHEMINS.entites]: sha256(entitesBrut),
  };
  const sommets = (t) => t.arcs.reduce((s, a) => s + a.length, 0);
  notes.push(`sommets : ${sommets(topoFine)} (10 km), ${sommets(topoLegere)} (50 km)`);
  return { fichiers, affectations, entrees, traitement, notes };
}

/**
 * public/geo/sources.json avec les empreintes des entrées des mers et leur traitement
 * (la source, Natural Earth, est celle des pays : build.mjs l'écrit). Le même chemin
 * pour tout le build et pour --seulement mers : les deux donnent le même fichier.
 */
export function fusionnerMers(sources, mers) {
  const s = fusionnerPartie(sources, { sources: [], entrees: mers.entrees });
  return { ...s, traitement: { ...s.traitement, mers: mers.traitement } };
}
