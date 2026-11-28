// Vignettes des tuiles de Jouer (choix du 10/11, « Tuiles illustrées ») : une
// petite carte par série (sa région, ses pays éclairés sur le fond des autres)
// et par sujet (le monde pour Pays, l'île pour Communes, le monde et ses
// capitales en points pour Capitales, D53 a), une icône pour le reste
// (Entraînement, Classé, la Révision du jour, chaque exercice, et le sujet
// Drapeaux, D53 a : un drapeau dessiné, rien de drapeaux* à charger).
//
// Les cartes viennent des données du monde déjà en mémoire : rien de plus à
// télécharger (décision « Hébergement »). L'île, dont les données ne se
// chargent qu'au choix de sa série, a sa vignette toute faite dans le code
// (vignette-ile.ts, produit par geodata/vignette-ile.mjs) ; les capitales
// aussi (vignette-capitales.ts, geodata/vignette-capitales.mjs), pour ne rien
// charger de capitales* à l'ouverture de Jouer ; les mers de même
// (vignette-mers.ts, geodata/vignette-mers.mjs : le sujet Océans et mers, le
// monde aux mers éclairées sous des terres sombres, D53 a, rien de mers* à
// charger). Chaque vignette a sa projection (Equal Earth, centrée sur sa
// région, comme la carte) et ne trace que ce qui tombe près de son cadre, en
// unités de 600 de large, points à moins d'une unité du précédent sautés et
// anneaux de moins d'une unité carrée retirés : ~3 000 à 8 000 points par
// vignette au lieu des 109 000 du monde. Un SVG à viewBox suit la taille de la
// tuile sans retracer ; preserveAspectRatio « meet » garde le cadre entier, et
// la marge tracée autour (TOUR) remplit le reste. Chaque tracé est gardé : le
// premier affichage d'un niveau les calcule (quelques dizaines de ms), les
// suivants les réutilisent ; prechauffer() les calcule d'avance, en temps libre.
import { geoCentroid, geoDistance, geoEqualEarth, geoPath, type GeoProjection, type GeoStream } from 'd3-geo';
import type { Feature, MultiPoint } from 'geojson';
import type { DonneesCarte } from '../map/donnees';
import type { Pays } from '../map/types';
import { estJouable, SERIE_MERS, SERIE_REUNION, SERIE_TOUS, type Serie } from './cibles';
import { POINTS_CAPITALES } from './vignette-capitales';
import { VIGNETTE_ILE } from './vignette-ile';
import { VIGNETTE_MERS } from './vignette-mers';

const NS = 'http://www.w3.org/2000/svg';
/** Largeur du cadre en unités du tracé ; tolérance et aire minimale en unités. */
const LARGEUR = 600;
const TOLERANCE = 1;
const AIRE_MIN = 1;
/** Marge tracée autour du cadre (fraction de sa taille) : ce que montre « meet » quand la tuile est plus large ou plus haute que lui. */
const TOUR = 0.6;
/** Marge du cadre autour des pays de la série. */
const MARGE = 0.06;
/**
 * Un pays dont le point est plus loin du centre de la série que ECART fois la
 * distance médiane ne compte pas dans le cadre (il reste tracé, éclairé, s'il
 * y tombe) : la Russie, dont le point est en Sibérie, réduisait l'Europe à un
 * coin de sa tuile. L'Islande (3 fois la médiane) reste dans le cadre.
 */
const ECART = 4;

/**
 * Simplifie le flux projeté : un point à moins de `tolerance` (TOLERANCE) du
 * précédent gardé est sauté (le dernier d'un anneau reste), et un anneau de
 * moins de `aireMin` (AIRE_MIN) est retiré (îlots invisibles à cette taille).
 * Partagé avec la carte de situation de la fiche (situation.ts, lot F8).
 */
export function simplifier(sortie: GeoStream, tolerance = TOLERANCE, aireMin = AIRE_MIN): GeoStream {
  let anneau: number[] | null = null;
  let saute: [number, number] | null = null;
  let polygone = false;
  return {
    point(x, y) {
      if (!anneau) return sortie.point(x, y);
      const n = anneau.length;
      if (n >= 2 && (x - anneau[n - 2]!) ** 2 + (y - anneau[n - 1]!) ** 2 < tolerance * tolerance) {
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
        aire += a[i]! * a[j + 1]! - a[j]! * a[i + 1]!;
      }
      if (Math.abs(aire) / 2 < aireMin) return;
      sortie.lineStart();
      for (let i = 0; i < a.length; i += 2) sortie.point(a[i]!, a[i + 1]!);
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

/**
 * Le tracé d'une vignette : son cadre (viewBox), le fond (autres pays), la
 * série, l'ovale du monde s'il est entier, les limites des communes de l'île,
 * les mers éclairées sous les terres (le sujet Océans et mers).
 */
interface Trace {
  cadre: [number, number, number, number];
  fond: string;
  serie: string;
  sphere?: string;
  limites?: string;
  eaux?: string;
}

/** Rayon angulaire (radians) d'une emprise [ouest, sud, est, nord], antiméridien compris. */
function rayonEmprise([o, s, e, n]: Pays['bbox']): number {
  const est = e < o ? e + 360 : e;
  return geoDistance([o, s], [est, n]) / 2;
}

/** Les coins d'un pays autour de son point d'étiquette, à la taille de son plus grand polygone (cadre de la série). */
function coins(p: Pays): [number, number][] {
  const [lon, lat] = p.point;
  const r = Math.max(60, Math.sqrt(p.partie_max_km2) / 2) / 111;
  const rLon = Math.min(60, r / Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const rLat = Math.min(30, r);
  return [
    [lon - rLon, lat - rLat],
    [lon + rLon, lat - rLat],
    [lon - rLon, lat + rLat],
    [lon + rLon, lat + rLat],
    [lon, lat],
  ];
}

/** Le tracé simplifié d'une forme par cette projection (chemin SVG, au dixième d'unité). */
export function tracer(projection: GeoProjection, forme: Parameters<ReturnType<typeof geoPath>>[0], tolerance?: number, aireMin?: number): string {
  const chemin = geoPath({ stream: (s: GeoStream) => projection.stream(simplifier(s, tolerance, aireMin)) }).digits(1);
  return chemin(forme) ?? '';
}

/**
 * Le cadrage d'une région : sa projection (Equal Earth tournée sur elle, LARGEUR de large, coupée à TOUR autour du
 * cadre), son cadre (viewBox) ; seules passent par la projection les zones à moins de `rayon` de `centre` (proche).
 */
export interface Cadrage {
  projection: GeoProjection;
  cadre: [number, number, number, number];
  centre: [number, number];
  rayon: number;
}

/** Le cadrage autour de ces points, centré sur la longitude `lon` (degrés). */
export function cadrerPoints(points: [number, number][], lon: number): Cadrage {
  const nuage: Feature<MultiPoint> = { type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: points } };
  const p = geoEqualEarth().rotate([-lon, 0]);
  p.fitWidth(LARGEUR, nuage);
  const [[bx0, by0], [bx1, by1]] = geoPath(p).bounds(nuage);
  const m = MARGE * Math.max(bx1 - bx0, by1 - by0);
  const cadre: Cadrage['cadre'] = [bx0 - m, by0 - m, bx1 - bx0 + 2 * m, by1 - by0 + 2 * m];
  const [cx, cy, cw, ch] = cadre;
  const t = TOUR * Math.max(cw, ch);
  p.clipExtent([
    [cx - t, cy - t],
    [cx + cw + t, cy + ch + t],
  ]);
  const centre = geoCentroid(nuage) as [number, number];
  return { projection: p, cadre, centre, rayon: Math.max(...points.map((q) => geoDistance(centre, q))) * (1 + 2 * TOUR) };
}

/**
 * Le cadrage d'une région de pays (une série de Jouer) : sans ceux trop loin du centre (ECART), centré sur la moyenne
 * circulaire des longitudes (pas de coupure dans la région : l'Océanie) ; null sans pays.
 */
export function cadrerPays(tous: readonly Pays[]): Cadrage | null {
  if (!tous.length) return null;
  const milieu = geoCentroid({ type: 'MultiPoint', coordinates: tous.map((p) => p.point) });
  const ecarts = tous.map((p) => geoDistance(milieu, p.point));
  const mediane = [...ecarts].sort((a, b) => a - b)[Math.floor(ecarts.length / 2)] ?? 0;
  const pays = tous.filter((_, i) => (ecarts[i] ?? 0) <= ECART * mediane);
  const [sx, sy] = pays.reduce(([a, b], p) => [a + Math.cos((p.point[0] * Math.PI) / 180), b + Math.sin((p.point[0] * Math.PI) / 180)], [0, 0]);
  return cadrerPoints(pays.flatMap(coins), (Math.atan2(sy, sx) * 180) / Math.PI);
}

/** La zone tombe-t-elle près du cadre (à tracer) ? */
export const proche = (c: Cadrage, l: Pick<Pays, 'point' | 'bbox'>): boolean => geoDistance(c.centre, l.point) <= c.rayon + rayonEmprise(l.bbox);

export interface Vignettes {
  /**
   * La vignette d'une série (le monde, un continent, l'île) dans un sujet ;
   * null si elle n'en a pas. Les séries des capitales et des drapeaux
   * reprennent celles des pays (le même tracé, gardé une fois) ; sous
   * Capitales, « tous » porte en plus les capitales en points, et sert de
   * vignette au sujet (Drapeaux a son icône).
   */
  serie(id: string, sujet?: string): SVGSVGElement | null;
  /** Calcule d'avance les tracés de ces séries, une par moment libre. */
  prechauffer(ids: readonly string[]): void;
}

export function creerVignettes(donnees: DonneesCarte, series: readonly Serie[]): Vignettes {
  const traces = new Map<string, Trace | null>();
  const parId = new Map(donnees.entites.map((e) => [e.pays.id, e]));

  function monde(): Trace {
    const p = geoEqualEarth().fitWidth(LARGEUR, { type: 'Sphere' });
    const [[x0, y0], [x1, y1]] = geoPath(p).bounds({ type: 'Sphere' });
    let fond = '';
    let serie = '';
    for (const e of donnees.entites) {
      const d = tracer(p, e.forme);
      if (estJouable(e.pays)) serie += d;
      else fond += d;
    }
    return { cadre: [x0, y0, x1 - x0, y1 - y0], fond, serie, sphere: geoPath(p)({ type: 'Sphere' }) ?? '' };
  }

  function region(s: Serie): Trace | null {
    const c = cadrerPays(s.ids.map((id) => parId.get(id)?.pays).filter((p): p is Pays => !!p));
    if (!c) return null;
    const dedans = new Set(s.ids);
    let fond = '';
    let serie = '';
    for (const e of donnees.entites) {
      if (!proche(c, e.pays)) continue;
      const d = tracer(c.projection, e.forme);
      if (dedans.has(e.pays.id)) serie += d;
      else fond += d;
    }
    return { cadre: c.cadre, fond, serie };
  }

  /** L'île : sa vignette toute faite (contour et limites des communes). */
  const ile = (): Trace => ({ cadre: VIGNETTE_ILE.cadre, fond: '', serie: VIGNETTE_ILE.contour, limites: VIGNETTE_ILE.limites });

  /** Les océans et mers : le cadre et l'ovale du monde, ses 45 mers éclairées (vignette-mers.ts), toutes les terres sombres par-dessus. */
  const mers = (): Trace | null => {
    const m = trace(SERIE_TOUS);
    return m && { cadre: m.cadre, sphere: m.sphere ?? '', eaux: VIGNETTE_MERS, fond: m.fond + m.serie, serie: '' };
  };

  function trace(id: string): Trace | null {
    if (!traces.has(id)) {
      const s = series.find((x) => x.id === id);
      traces.set(id, id === SERIE_TOUS ? monde() : id === SERIE_REUNION ? ile() : id === SERIE_MERS ? mers() : s && s.terrain === 'monde' ? region(s) : null);
    }
    return traces.get(id) ?? null;
  }

  /** Les capitales en points (une ligne de longueur nulle chacune, bouts ronds : un disque à toute taille). */
  const points = (): string => {
    let d = '';
    for (let i = 0; i + 1 < POINTS_CAPITALES.length; i += 2) d += `M${POINTS_CAPITALES[i]} ${POINTS_CAPITALES[i + 1]}h0`;
    return d;
  };

  function serie(id: string, sujet = 'pays'): SVGSVGElement | null {
    const t = trace(id);
    if (!t) return null;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', t.cadre.map((v) => Math.round(v * 10) / 10).join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('vignette-carte');
    if (t.sphere) svg.classList.add('vignette-monde');
    for (const [classe, d] of [
      ['vignette-mer', t.sphere ?? ''],
      ['vignette-eaux', t.eaux ?? ''],
      ['vignette-fond', t.fond],
      ['vignette-serie', t.serie],
      ['vignette-limites', t.limites ?? ''],
      ['vignette-points', sujet === 'capitales' && id === SERIE_TOUS ? points() : ''],
    ] as const) {
      if (!d) continue;
      const chemin = document.createElementNS(NS, 'path');
      chemin.classList.add(classe);
      chemin.setAttribute('d', d);
      svg.append(chemin);
    }
    return svg;
  }

  function prechauffer(ids: readonly string[]): void {
    const reste = ids.filter((id) => !traces.has(id));
    const libre: (f: () => void) => void =
      typeof requestIdleCallback === 'function' ? (f) => void requestIdleCallback(f, { timeout: 2000 }) : (f) => void setTimeout(f, 50);
    const suivant = () => {
      const id = reste.shift();
      if (id === undefined) return;
      trace(id);
      libre(suivant);
    };
    libre(suivant);
  }

  return { serie, prechauffer };
}

/**
 * Icônes des tuiles et des lignes (24 × 24, traits de currentColor, comme le
 * 🏆 de l'en-tête) : Entraînement (un livre ouvert), Classé (la coupe de
 * l'en-tête), la Révision du jour (un calendrier coché), et chaque exercice.
 */
const ICONES: Record<string, string> = {
  entrainement: 'M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5zM12 6.5v13',
  classe: 'M8 21h8M12 16.5V21M7 3.5h10V9a5 5 0 0 1-10 0zM17 5.5h3V7a3.5 3.5 0 0 1-3.5 3.5M7 5.5H4V7a3.5 3.5 0 0 0 3.5 3.5',
  revision: 'M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1zM4 10h16M8.5 3.5v4M15.5 3.5v4M9 15l2 2 4-4',
  apprendre: 'M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.5v4c1.5 1.5 3.5 2 5.5 2s4-.5 5.5-2v-4M21.5 9.5v5',
  localiser: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  nommer: 'M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0zM8 8h.01',
  chrono: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M10 2.5h4M18.5 6.5 20 5',
  sansfaute: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  // Le sujet Drapeaux : un drapeau qui flotte au bout de sa hampe.
  drapeaux: 'M5 21V3.5M5 4.5c2.5-1.3 5-1.3 7 0s4.5 1.3 7 0v9c-2.5 1.3-5 1.3-7 0s-4.5-1.3-7 0',
  // Le sujet Silhouettes (étude J4 § 7.2) : le contour d'un pays, rien de silhouettes* à charger.
  silhouettes: 'M4.5 8 8 4.5l3 1.5 3.5-1.5L18 7l-.5 3.5 2.5 3-3 1.5-1 4-3.5-1-2.5 2.5-2.5-3L4 15l1.5-3z',
  // Le sujet Voisins (décision « Ordre des sujets ») : un pays allumé (plein, après « | ») et ses voisins cernés autour.
  voisins: 'M3.5 7.5 8 3.5l5 1 4.5-1 3 4-1 5 1.5 4-4 3.5-5-1-4.5 1.5-3-4 .5-5zM9.5 9.5 5.5 6M12 8.5V4.5M14.5 9.5 18 5M15 13l5 2M12 15v4M9 13l-4.4 1.5|M9.5 9.5 12 8.5l2.5 1L15 13l-3 2-3-2z',
  // Les Habitants (étude J4 § 7.2) : deux personnes ; les Superficies : un carré et ses deux côtés mesurés.
  habitants: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.3a3 3 0 0 1 0 5.4M18 14.2a4.5 4.5 0 0 1 2.5 4.3V20',
  superficies: 'M8 8h12v12H8zM4 8v12M3 9l1-1 1 1M3 19l1 1 1-1M8 4h12M9 3 8 4l1 1M19 3l1 1-1 1',
  // Le quiz général (étude J2 § 7.1) : un point d'interrogation dans une bulle ; ses difficultés, une à quatre barres montantes.
  quiz: 'M12 20.5a8.5 8.5 0 1 0-7.6-4.7L3.5 20.5l4.7-.9a8.5 8.5 0 0 0 3.8.9zM9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.6h.01',
  ...barres(),
};

/** Les icônes des difficultés du quiz (quiz-facile à quiz-expert) : 1 à 4 barres, de plus en plus hautes. */
function barres(): Record<string, string> {
  const barre = (i: number) => `M${3.5 + i * 4.5} 20v-${4 + i * 4}h3v${4 + i * 4}z`;
  return Object.fromEntries(['facile', 'moyen', 'difficile', 'expert'].map((d, n) => [`quiz-${d}`, Array.from({ length: n + 1 }, (_, i) => barre(i)).join('')]));
}

/** L'icône de ce nom (branche, exercice, « revision », les sujets Drapeaux, Silhouettes, Voisins, Habitants et Superficies, le quiz et ses difficultés) ; null si elle n'en a pas. */
export function icone(nom: string): SVGSVGElement | null {
  const d = ICONES[nom];
  if (!d) return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('vignette-icone');
  // Après « | », ce qui est plein (le pays allumé des Voisins).
  d.split('|').forEach((x, i) => {
    const chemin = document.createElementNS(NS, 'path');
    chemin.setAttribute('d', x);
    if (i) chemin.setAttribute('fill', 'currentColor');
    svg.append(chemin);
  });
  return svg;
}
