// Maillage de la carte pour le rendu WebGL (pur, sans DOM) : les polygones
// triangulés une fois au chargement, en longitude et latitude (degrés), et
// les traits des frontières ; la projection et la rotation se font dans le
// vertex shader (carte-webgl.ts), dont projeterF32 est le miroir testé.
//
// - Densifier : une arête de plus de PAS_DENSIFIER_DEG reçoit des sommets.
//   Les parallèles restent droits dans Equal Earth, mais un méridien (le
//   141° O entre l'Alaska et le Canada, les coutures à ±180°) est courbe :
//   la corde d'une arête de 10° de latitude s'en écarte d'un pixel au bord de
//   l'écran. Les sommets insérés sont calculés depuis la plus petite
//   extrémité (ordre lexicographique) : deux pays voisins, qui parcourent la
//   même arête en sens contraires, ont exactement les mêmes sommets (aucune
//   fente entre eux).
// - Trianguler : earcut, puis refine (vers la triangulation de Delaunay
//   contrainte). Sans refine, earcut laisse des triangles en aiguille (trois
//   sommets presque alignés en longitude et latitude) que la projection
//   retourne : 113 à 201 triangles retournés selon λ0, jusqu'à 77 px² de
//   carte mal couverte au zoom 1 (un trou de 23 px² au Brésil à λ0 = 120°,
//   × k² en zoomant). Avec refine : aucun sur 16 rotations (test).
// - Traits : pas les contours des polygones (une frontière partagée y est deux
//   fois), mais les arcs de la topologie (donnees.traits) : chaque frontière
//   une fois, les frontières entre pays à part des côtes, comme le Canvas les
//   montre (son trait commun à deux pays est tracé deux fois : plus marqué).
// - Couture de l'antiméridien : Natural Earth coupe ses polygones à ±180°, et
//   un triangle ne relie que des sommets de sa partie : aucun triangle ne
//   traverse la coupure. La carte tournée place chaque partie à moins de 180°
//   du centre (tour choisi dans le shader d'après le milieu de son emprise) ;
//   une partie qui déborde de l'ovale est redessinée décalée d'un tour, et la
//   découpe se fait au contour de l'ovale (stencil).
import earcut, { refine } from 'earcut';
import { geoEqualEarthRaw } from 'd3-geo';
import type { Position } from 'geojson';
import type { Forme } from './types';

/** Pas maximal d'une arête de contour (degrés, en λ comme en φ). */
export const PAS_DENSIFIER_DEG = 1;
/**
 * Les sommets sur l'antiméridien sont poussés vers l'extérieur de leur partie
 * de ce peu (degrés) : les deux bords d'une couture (la Russie et la Tchoukotka
 * à 180°) se recouvrent de 2·10⁻⁴° (0,09 px au zoom 400) au lieu de se
 * toucher ; un arrondi du GPU ne peut pas y ouvrir de fente.
 */
export const RECOUVREMENT_COUTURE_DEG = 1e-4;
const EPS = 1e-9;

/** Une partie (un polygone) du maillage : son emprise et ses plages dans les tampons. */
export interface PartieMaillee {
  /** Index de sa forme dans la liste maillée. */
  forme: number;
  /** Emprise en longitude (degrés, o ≤ e : jamais à cheval sur l'antiméridien). */
  o: number;
  e: number;
  /** Triangles : indices [t0, t1) de `triangles` ; traits : [l0, l1) de `traits`. */
  t0: number;
  t1: number;
  l0: number;
  l1: number;
}

export interface Maillage {
  /** Par sommet : λ, φ (degrés), en Float32 : ce que lit le shader. */
  lonlat: Float32Array;
  /** Par sommet : milieu de l'emprise de sa partie (λ, φ) : le tour choisi, l'origine des hachures. */
  milieu: Float32Array;
  /** Par sommet : index de sa forme (couleur par pays). */
  forme: Float32Array;
  /** Triangles (trois indices de sommets chacun). */
  triangles: Uint32Array;
  /** Traits (deux indices chacun), sans les coutures : seulement dans maillerTraits. */
  traits: Uint32Array;
  parties: PartieMaillee[];
  /** Par forme : plages de ses parties (contiguës) dans triangles et traits. */
  formes: { t0: number; t1: number; l0: number; l1: number }[];
}

/** Une arête qui suit l'antiméridien ou un pôle : couture de Natural Earth, jamais tracée (dessin.ts). */
export function estCouture(la: number, pa: number, lb: number, pb: number): boolean {
  if (Math.abs(la) >= 180 - EPS && la === lb) return true;
  return Math.abs(pa) >= 90 - EPS && pa === pb;
}

const avant = (a: Position, b: Position) => (a[0] ?? 0) < (b[0] ?? 0) || ((a[0] ?? 0) === (b[0] ?? 0) && (a[1] ?? 0) < (b[1] ?? 0));

/**
 * Un anneau densifié, à plat (λ0, φ0, λ1, φ1…), sans le point de fermeture :
 * les sommets d'origine et ceux insérés sur les arêtes de plus de `pas` degrés.
 * Une ligne ouverte (ferme = false) garde son dernier sommet.
 */
export function densifier(anneau: readonly Position[], pas = PAS_DENSIFIER_DEG, sortie: number[] = [], ferme = true): number[] {
  let n = anneau.length;
  const premier = anneau[0];
  const dernier = anneau[n - 1];
  if (ferme && n > 1 && premier && dernier && premier[0] === dernier[0] && premier[1] === dernier[1]) n--;
  for (let i = 0; i < n; i++) {
    const a = anneau[i] as Position;
    sortie.push(a[0] ?? 0, a[1] ?? 0);
    if (!ferme && i === n - 1) break;
    const b = anneau[(i + 1) % n] as Position;
    const dl = Math.abs((b[0] ?? 0) - (a[0] ?? 0));
    const dp = Math.abs((b[1] ?? 0) - (a[1] ?? 0));
    const k = Math.ceil(Math.max(dl, dp) / pas);
    if (k < 2) continue;
    // Depuis la plus petite extrémité : les mêmes nombres dans les deux sens de parcours.
    const [p, q] = avant(a, b) ? [a, b] : [b, a];
    const [pl, pp, ql, qp] = [p[0] ?? 0, p[1] ?? 0, q[0] ?? 0, q[1] ?? 0];
    for (let j = 1; j < k; j++) {
      const t = (p === a ? j : k - j) / k;
      sortie.push(pl + (ql - pl) * t, pp + (qp - pp) * t);
    }
  }
  return sortie;
}

/** Un polygone densifié et triangulé (Float64) : sommets à plat, anneaux [début, fin) en sommets, triangles ; null s'il est dégénéré. */
export function triangulerPolygone(
  poly: readonly (readonly Position[])[],
  pas = PAS_DENSIFIER_DEG,
): { plat: number[]; anneaux: [number, number][]; tri: number[] } | null {
  const plat: number[] = [];
  const trous: number[] = [];
  const anneaux: [number, number][] = [];
  let exterieur = true;
  poly.forEach((anneau, i) => {
    const a = plat.length / 2;
    densifier(anneau, pas, plat);
    const b = plat.length / 2;
    if (b - a < 3) {
      plat.length = a * 2; // anneau dégénéré : ignoré (le polygone entier si c'est son contour)
      if (i === 0) exterieur = false;
      return;
    }
    if (i > 0) trous.push(a);
    anneaux.push([a, b]);
  });
  if (!exterieur || !anneaux.length) return null;
  const tri = earcut(plat, trous.length ? trous : null, 2);
  refine(tri, plat, 2);
  return { plat, anneaux, tri };
}

/**
 * Maille des formes : sommets, triangles et traits de toutes leurs parties,
 * dans l'ordre des formes (plages contiguës par forme). Tampons extensibles
 * (number[]), typés à la fin : la taille n'est connue qu'après la triangulation.
 */
export function mailler(formes: readonly Forme[], pas = PAS_DENSIFIER_DEG): Maillage {
  const lonlat: number[] = [];
  const milieu: number[] = [];
  const forme: number[] = [];
  const triangles: number[] = [];
  const parties: PartieMaillee[] = [];
  const plages: Maillage['formes'] = [];
  formes.forEach((f, fi) => {
    const debut = triangles.length;
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      const tp = triangulerPolygone(poly, pas);
      if (!tp) continue;
      const { plat, tri } = tp;
      let o = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
      for (let i = 0; i < plat.length; i += 2) {
        const l = plat[i] as number;
        const p = plat[i + 1] as number;
        if (l < o) o = l;
        if (l > e) e = l;
        if (p < s) s = p;
        if (p > n) n = p;
      }
      const base = lonlat.length / 2;
      const ml = (o + e) / 2;
      const mp = (s + n) / 2;
      for (let i = 0; i < plat.length; i += 2) {
        let l = plat[i] as number;
        if (l >= 180 - EPS) l += RECOUVREMENT_COUTURE_DEG;
        else if (l <= -180 + EPS) l -= RECOUVREMENT_COUTURE_DEG;
        lonlat.push(l, plat[i + 1] as number);
        milieu.push(ml, mp);
        forme.push(fi);
      }
      const t0 = triangles.length;
      for (const i of tri) triangles.push(base + i);
      parties.push({ forme: fi, o, e, t0, t1: triangles.length, l0: 0, l1: 0 });
    }
    plages.push({ t0: debut, t1: triangles.length, l0: 0, l1: 0 });
  });
  return {
    lonlat: new Float32Array(lonlat),
    milieu: new Float32Array(milieu),
    forme: new Float32Array(forme),
    triangles: new Uint32Array(triangles),
    traits: new Uint32Array(0),
    parties,
    formes: plages,
  };
}

/**
 * Maille des lignes (arcs de la topologie) en traits : une partie par ligne
 * (son emprise choisit son tour, comme un polygone), sans les arêtes de
 * couture (antiméridien, pôle), jamais tracées comme une frontière.
 */
export function maillerTraits(lignes: readonly (readonly Position[])[], pas = PAS_DENSIFIER_DEG): Maillage {
  const lonlat: number[] = [];
  const milieu: number[] = [];
  const traits: number[] = [];
  const parties: PartieMaillee[] = [];
  const plat: number[] = [];
  for (const ligne of lignes) {
    plat.length = 0;
    densifier(ligne, pas, plat, false);
    const n = plat.length / 2;
    if (n < 2) continue;
    let o = Infinity, e = -Infinity, s = Infinity, nord = -Infinity;
    for (let i = 0; i < plat.length; i += 2) {
      const l = plat[i] as number;
      const p = plat[i + 1] as number;
      if (l < o) o = l;
      if (l > e) e = l;
      if (p < s) s = p;
      if (p > nord) nord = p;
    }
    const base = lonlat.length / 2;
    for (let i = 0; i < plat.length; i += 2) lonlat.push(plat[i] as number, plat[i + 1] as number), milieu.push((o + e) / 2, (s + nord) / 2);
    const l0 = traits.length;
    for (let i = 0; i + 1 < n; i++) {
      if (estCouture(plat[2 * i] as number, plat[2 * i + 1] as number, plat[2 * i + 2] as number, plat[2 * i + 3] as number)) continue;
      traits.push(base + i, base + i + 1);
    }
    if (traits.length > l0) parties.push({ forme: 0, o, e, t0: 0, t1: 0, l0, l1: traits.length });
  }
  return {
    lonlat: new Float32Array(lonlat),
    milieu: new Float32Array(milieu),
    forme: new Float32Array(lonlat.length / 2),
    triangles: new Uint32Array(0),
    traits: new Uint32Array(traits),
    parties,
    formes: [],
  };
}

/** Tour (nombre entier de 360°) qui met le milieu m d'une partie à moins de 180° du méridien central r : celui du shader. */
export const tourDe = (r: number, m: number): number => Math.floor((r - m) / 360 + 0.5);

/**
 * Tours où dessiner une partie à cheval sur le bord de l'ovale, en plus du
 * dessin commun ; vide si elle tient dans l'ovale. Son tour y est redessiné
 * aussi : le shader l'a choisi en Float32, peut-être autrement que nous à un
 * demi-tour près ; le dessin en double ne change rien (opaque, ou stencil).
 */
export function toursEnPlus(p: PartieMaillee, r: number): number[] {
  const n = tourDe(r, (p.o + p.e) / 2);
  const lo = p.o + n * 360 - r;
  const hi = p.e + n * 360 - r;
  if (hi <= 180 && lo >= -180) return [];
  const res = [n];
  if (hi > 180) res.push(n - 1);
  if (lo < -180) res.push(n + 1);
  return res;
}

/** Emprises (o, e) des parties à plat, pour pourChaqueCopie. */
export function emprisesAPlat(parties: readonly PartieMaillee[]): Float64Array {
  const em = new Float64Array(parties.length * 2);
  parties.forEach((p, i) => {
    em[2 * i] = p.o;
    em[2 * i + 1] = p.e;
  });
  return em;
}

/**
 * Les copies de toursEnPlus pour toutes les parties (emprises de
 * emprisesAPlat), f(index de la partie, tour) pour chacune : le même calcul,
 * en ligne et sans allocation. Le rendu webgl le fait à chaque image sur
 * ~10 000 parties (terres, frontières, côtes, zones) : un tableau rendu par
 * partie coûtait 0,24 ms par image sur le PC (~1 ms au processeur ralenti
 * 4×), l'essentiel du script de l'image.
 */
export function pourChaqueCopie(emprises: Float64Array, r: number, f: (i: number, tour: number) => void): void {
  for (let i = 0, n = emprises.length / 2; i < n; i++) {
    const o = emprises[2 * i] as number;
    const e = emprises[2 * i + 1] as number;
    const t = tourDe(r, (o + e) / 2);
    const lo = o + t * 360 - r;
    const hi = e + t * 360 - r;
    if (hi <= 180 && lo >= -180) continue;
    f(i, t);
    if (hi > 180) f(i, t - 1);
    if (lo < -180) f(i, t + 1);
  }
}

// --- Equal Earth du shader, en TypeScript (Float32 à chaque opération) ----------

const f = Math.fround;
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const RAD = Math.PI / 180;

/**
 * Le calcul du vertex shader (VERTEX_GLSL de carte-webgl.ts, même ordre
 * d'opérations), arrondi en Float32 comme sur le GPU : la longitude dans le
 * repère de la vue, λ + tour·360 − r, puis Equal Earth (formule polynomiale
 * de Šavrič, Patterson et Jenny, celle de d3) en unités de la projection,
 * y vers le nord. Les fonctions transcendantes du GPU sont moins précises que
 * Math : le test compare à d3 avec une tolérance sous le centième de pixel.
 */
export function projeterF32(lon: number, lat: number, r: number, tour: number): [number, number] {
  const u = f(f(f(lon) + f(tour * 360)) - f(r));
  const l = f(Math.asin(f(f(M) * f(Math.sin(f(f(lat) * f(RAD)))))));
  const l2 = f(l * l);
  const l6 = f(f(l2 * l2) * l2);
  const den = f(f(M) * f(f(A1) + f(f(f(3 * A2) * l2) + f(l6 * f(f(7 * A3) + f(f(9 * A4) * l2))))));
  const x = f(f(f(u * f(RAD)) * f(Math.cos(l))) / den);
  const y = f(l * f(f(A1) + f(f(f(A2) * l2) + f(l6 * f(f(A3) + f(f(A4) * l2))))));
  return [x, y];
}

/** La même en Float64, pour comparer : geoEqualEarthRaw de d3. */
export function projeterF64(lon: number, lat: number, r: number, tour: number): [number, number] {
  return geoEqualEarthRaw((lon + tour * 360 - r) * RAD, lat * RAD) as [number, number];
}
