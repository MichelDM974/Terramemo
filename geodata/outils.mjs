// Aides des scripts de données géographiques, sans effet à l'import (build.mjs lance
// main() dès qu'on l'importe : il ne s'importe pas). build.mjs, reunion.mjs,
// capitales.mjs, drapeaux.mjs et wikidata.mjs s'en servent ; son empreinte est dans les
// deux sources.json (public/geo/ et public/geo/reunion/) : le modifier demande de relancer
// npm run geodata et npm run geodata:reunion.
// tests/donnees-reunion.test.ts importe utmSudVersWgs84 pour le contrôler sur des
// points de référence.

import { createHash } from 'node:crypto';
import { geoArea } from 'd3-geo';
import polylabel from 'polylabel';

export const R_TERRE_KM = 6371.0088; // rayon moyen (IUGG)

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const arrondi = (x, n) => Number(x.toFixed(n));

/** Date locale du PC (La Réunion), au format AAAA-MM-JJ. */
export function aujourdhui() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// --- public/geo/sources.json --------------------------------------------------------

/**
 * public/geo/sources.json avec les sources et les empreintes des entrées d'une partie
 * du build (capitales, drapeaux…) : chaque source (même url) et chaque entrée est
 * remplacée à sa place si elle y est, ajoutée à la fin sinon. Tout le build et
 * --seulement <partie> donnent donc le même fichier, dans le même ordre.
 * partie : { sources: [{url, …}], entrees: {chemin: sha256} }.
 */
export function fusionnerPartie(sources, partie) {
  const liste = [...sources.sources];
  for (const s of partie.sources) {
    const i = liste.findIndex((x) => x.url === s.url);
    if (i >= 0) liste[i] = s;
    else liste.push(s);
  }
  return {
    sources: liste,
    traitement: { ...sources.traitement, entrees: { ...sources.traitement.entrees, ...partie.entrees } },
  };
}

// --- Archive tar (paquet npm) -----------------------------------------------------------

/**
 * Fichiers ordinaires d'une archive tar (POSIX ustar, en-têtes de 512 octets), sans
 * dépendance : Map chemin → Buffer, dans l'ordre de l'archive. Le chemin est le préfixe
 * ustar suivi du nom ; un en-tête pax (« x ») ou GNU (« L ») qui donne un chemin plus
 * long le remplace pour l'entrée suivante. Dossiers et liens ignorés. Lève sur un
 * en-tête dont la somme de contrôle est fausse (archive tronquée ou pas un tar).
 * Un .tgz se décompresse d'abord (zlib, gunzipSync).
 */
export function lireTar(buf) {
  const fichiers = new Map();
  const texte = (o, n) => {
    const b = buf.subarray(o, o + n);
    const fin = b.indexOf(0);
    return b.subarray(0, fin < 0 ? n : fin).toString('utf8');
  };
  const octal = (o, n) => parseInt(texte(o, n).trim() || '0', 8);
  let o = 0;
  let cheminLong = null;
  while (o + 512 <= buf.length) {
    const entete = buf.subarray(o, o + 512);
    if (entete.every((x) => x === 0)) break; // bloc nul : fin de l'archive
    let somme = 0;
    for (let i = 0; i < 512; i++) somme += i >= 148 && i < 156 ? 32 : entete[i];
    if (somme !== octal(o + 148, 8)) throw new Error(`tar : somme de contrôle fausse à l'octet ${o}`);
    const taille = octal(o + 124, 12);
    const type = String.fromCharCode(entete[156] || 48); // « \0 » vaut « 0 » (fichier)
    const prefixe = texte(o + 345, 155);
    const nom = cheminLong ?? (prefixe ? `${prefixe}/${texte(o, 100)}` : texte(o, 100));
    const contenu = buf.subarray(o + 512, o + 512 + taille);
    if (contenu.length !== taille) throw new Error(`tar : ${nom} tronqué`);
    cheminLong = null;
    if (type === 'x') {
      // Enregistrements pax « longueur clé=valeur\n » : seul path compte ici.
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(contenu.toString('utf8'));
      if (m) cheminLong = m[1];
    } else if (type === 'L') {
      cheminLong = texte(o + 512, taille);
    } else if (type === '0' || type === '7') {
      fichiers.set(nom, Buffer.from(contenu));
    }
    o += 512 + Math.ceil(taille / 512) * 512;
  }
  return fichiers;
}

// --- Géométrie ---------------------------------------------------------------------

/**
 * Polygones d'une géométrie GeoJSON (tableaux d'anneaux), remis dans le sens de d3-geo
 * (extérieur horaire) : la sortie GeoJSON de mapshaper suit la RFC 7946 (antihoraire),
 * que d3 lit comme « toute la sphère sauf le polygone ».
 */
export function polygones(geom) {
  if (!geom) return [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.map((anneaux) =>
    geoArea({ type: 'Polygon', coordinates: anneaux }) > 2 * Math.PI
      ? anneaux.map((r) => [...r].reverse())
      : anneaux,
  );
}

/** Stéradians → km² (aire géodésique sur la sphère de rayon moyen). */
export const km2 = (sr) => sr * R_TERRE_KM * R_TERRE_KM;

/** Point intérieur (pôle d'inaccessibilité) d'un polygone, en lon/lat corrigés du cosinus. */
export function pointInterieur(anneaux) {
  let s = Infinity;
  let n = -Infinity;
  let o = Infinity;
  let e = -Infinity;
  for (const [x, y] of anneaux[0]) {
    s = Math.min(s, y);
    n = Math.max(n, y);
    o = Math.min(o, x);
    e = Math.max(e, x);
  }
  const k = Math.max(Math.cos((((s + n) / 2) * Math.PI) / 180), 0.05);
  const plan = anneaux.map((r) => r.map(([x, y]) => [x * k, y]));
  const precision = Math.max((e - o) * k, n - s) / 1000;
  const [px, py] = polylabel(plan, precision);
  return [arrondi(px / k, 5), arrondi(py, 5)];
}

/**
 * Emprise [ouest, sud, est, nord] qui passe l'antiméridien quand c'est plus court :
 * ouest > est signifie que l'emprise traverse 180°.
 */
export function emprise(polys) {
  const intervalles = [];
  let s = Infinity;
  let n = -Infinity;
  for (const p of polys) {
    let o = Infinity;
    let e = -Infinity;
    for (const [x, y] of p[0]) {
      o = Math.min(o, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
    intervalles.push([o, e]);
  }
  intervalles.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Fusion des intervalles de longitude, puis plus grand trou sur le cercle.
  const fusion = [];
  for (const [o, e] of intervalles) {
    const der = fusion[fusion.length - 1];
    if (der && o <= der[1]) der[1] = Math.max(der[1], e);
    else fusion.push([o, e]);
  }
  const premier = fusion[0];
  const dernier = fusion[fusion.length - 1];
  // Trou qui passe par l'antiméridien (de la fin du dernier au début du premier).
  let trou = premier[0] + 180 + (180 - dernier[1]);
  let ouest = premier[0];
  let est = dernier[1];
  for (let i = 1; i < fusion.length; i++) {
    const t = fusion[i][0] - fusion[i - 1][1];
    if (t > trou) {
      trou = t;
      ouest = fusion[i][0];
      est = fusion[i - 1][1];
    }
  }
  if (trou <= 0) {
    ouest = -180;
    est = 180;
  }
  return [arrondi(ouest, 4), arrondi(s, 4), arrondi(est, 4), arrondi(n, 4)];
}

// --- GeoPackage (géométries en WKB) ---------------------------------------------

/**
 * Géométrie d'un blob GeoPackage (en-tête « GP », srs_id, enveloppe facultative, puis
 * WKB ; norme OGC 12-128r18 § 2.1.3) : { srs, type: 'Point' | 'Polygon' |
 * 'MultiPolygon', coordinates } dans le système du fichier, ou null si vide. Seuls ces
 * trois types en 2D : toute autre forme (Z, M, courbes) lève, plutôt que de lire des
 * coordonnées décalées sans le dire.
 */
export function lireGeometrieGpkg(blob) {
  const b = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  if (b[0] !== 0x47 || b[1] !== 0x50) throw new Error('blob GeoPackage sans en-tête GP');
  const drapeaux = b[3];
  const srs = drapeaux & 1 ? b.readInt32LE(4) : b.readInt32BE(4);
  const tailleEnveloppe = { 0: 0, 1: 32, 2: 48, 3: 48, 4: 64 }[(drapeaux >> 1) & 7];
  if (tailleEnveloppe === undefined) throw new Error(`enveloppe GeoPackage inconnue (drapeaux ${drapeaux})`);
  if (drapeaux & 0x10) return null; // géométrie vide
  let o = 8 + tailleEnveloppe;
  let le = true;
  const u32 = () => {
    const v = le ? b.readUInt32LE(o) : b.readUInt32BE(o);
    o += 4;
    return v;
  };
  const f64 = () => {
    const v = le ? b.readDoubleLE(o) : b.readDoubleBE(o);
    o += 8;
    return v;
  };
  // Chaque géométrie WKB (y compris les parties d'un multi) porte son ordre d'octets.
  const entete = (attendu) => {
    le = b[o] === 1;
    o += 1;
    const type = u32();
    if (type !== attendu) throw new Error(`WKB de type ${type}, attendu ${attendu} (2D seulement)`);
  };
  const point = () => [f64(), f64()];
  const anneaux = () => {
    const n = u32();
    const r = [];
    for (let i = 0; i < n; i++) {
      const m = u32();
      const anneau = [];
      for (let j = 0; j < m; j++) anneau.push(point());
      r.push(anneau);
    }
    return r;
  };
  le = b[o] === 1;
  const type = le ? b.readUInt32LE(o + 1) : b.readUInt32BE(o + 1);
  let g;
  if (type === 1) {
    entete(1);
    g = { srs, type: 'Point', coordinates: point() };
  } else if (type === 3) {
    entete(3);
    g = { srs, type: 'Polygon', coordinates: anneaux() };
  } else if (type === 6) {
    entete(6);
    const n = u32();
    const polys = [];
    for (let i = 0; i < n; i++) {
      entete(3);
      polys.push(anneaux());
    }
    g = { srs, type: 'MultiPolygon', coordinates: polys };
  } else {
    throw new Error(`WKB de type ${type} non lu (Point, Polygon, MultiPolygon 2D seulement)`);
  }
  if (o !== b.length) throw new Error(`WKB : ${b.length - o} octets non lus`);
  return g;
}

// --- UTM sud → WGS84 (contrôle de la reprojection de mapshaper) -----------------

// GRS80 (RGR92, confondu avec WGS84 au centimètre près : towgs84 nul pour l'EPSG).
const A_GRS80 = 6378137;
const F_GRS80 = 1 / 298.257222101;

/**
 * Coordonnées UTM de l'hémisphère sud (mètres, faux nord 10 000 km) → [lon, lat] en
 * degrés sur GRS80, par la série de Krüger à l'ordre n⁴ (Karney 2011, « Transverse
 * Mercator with an accuracy of a few nanometers », éq. 11-15 ; erreur < 1 mm à moins
 * de 4° du méridien central). Indépendante de mapshaper (proj4 en JavaScript) : les
 * deux doivent s'accorder sur chaque sommet, sinon l'une des deux est fausse.
 */
export function utmSudVersWgs84([x, y], zone) {
  const n = F_GRS80 / (2 - F_GRS80);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const A = (A_GRS80 / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  const beta = [
    n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
    n2 / 48 + n3 / 15 - (437 * n4) / 1440,
    (17 * n3) / 480 - (37 * n4) / 840,
    (4397 * n4) / 161280,
  ];
  const delta = [
    2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
    (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
    (56 * n3) / 15 - (136 * n4) / 35,
    (4279 * n4) / 630,
  ];
  const k0 = 0.9996;
  const xi = (y - 10_000_000) / (k0 * A);
  const eta = (x - 500_000) / (k0 * A);
  let xi1 = xi;
  let eta1 = eta;
  beta.forEach((b, i) => {
    const j = 2 * (i + 1);
    xi1 -= b * Math.sin(j * xi) * Math.cosh(j * eta);
    eta1 -= b * Math.cos(j * xi) * Math.sinh(j * eta);
  });
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let phi = chi;
  delta.forEach((d, i) => {
    phi += d * Math.sin(2 * (i + 1) * chi);
  });
  const lambda0 = (zone - 1) * 6 - 180 + 3;
  const lambda = lambda0 + (Math.atan2(Math.sinh(eta1), Math.cos(xi1)) * 180) / Math.PI;
  return [lambda, (phi * 180) / Math.PI];
}
