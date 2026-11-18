// La carte de situation en tête de la fiche d'un lieu (#34, lot F8, D61 b : « Une carte de situation en tête de fiche
// montre où est le lieu » ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md, § 8 et § 21). Sur le modèle des
// vignettes des tuiles de Jouer (vignettes.ts, dont elle prend le cadrage d'une région, le tracé et sa simplification) :
// une projection par région, le lieu éclairé sur le fond des autres, rien de plus à télécharger. Ce module part avec
// le morceau de la fiche (import() dynamique) : vignettes.ts est au morceau principal, il n'y gagne que des exports.
//
// Chaque sorte de lieu :
// - un pays, un territoire, une zone contestée : la région de son continent (les pays jouables de ce continent, le
//   cadre de la série de Jouer, élargi en 3:2), si son point y tombe ; sinon ce cadre élargi à lui, s'il y compte
//   comme un pays de la série (la Polynésie française, le champ de glace Sud de Patagonie) ; sinon le monde (la
//   Russie, dont le point est en Sibérie ; le Groenland, les Malouines), centré sur l'Atlantique ou, au-delà de 120°
//   de longitude, sur le Pacifique ;
// - l'Antarctique : le monde ;
// - un océan : le monde (centré sur le milieu de son emprise), l'océan éclairé avec les mers qu'il allume sur la carte
//   (zonesAllumees) ; une mer : un cadre autour d'elle (7° de latitude et 10° de longitude au moins de chaque côté,
//   pour voir les côtes), éclairée sous les terres. Sa géométrie est celle que la carte a déjà lue (la couche fine ou
//   la légère) ; pas encore là : un nouvel essai un peu plus tard ;
// - une commune : l'île entière, la commune éclairée parmi les autres.
// Un lieu trop petit pour se voir à cette taille (micro, ou moins de SEUIL_ANNEAU de la largeur : ≈ 2,4 px sur 96)
// gagne un anneau.
//
// Fluidité (§ 6.4, décision « Fluidité de la fiche d'un lieu ») : la place (96 × 64, 3:2) est posée avec la tête, vide
// (la tête ne saute pas) ; la carte se calcule après l'animation d'ouverture (lancer(), appelé par la feuille), en temps
// libre (requestIdleCallback), par pas d'au plus MORCEAU points (éclaircis avant la projection : decimer), tant que
// l'échéance du navigateur le permet. Le fond
// d'une région est gardé (FONDS_MAX) : un autre lieu de la même région ne trace que lui. La carte d'un lieu est gardée
// (PLANS_MAX) : la fiche rouverte, ou refaite sur place, la montre tout de suite. Chaque pas est daté en
// performance.measure « situation:… » : le pilote y rattache un gel.
//
// Le lecteur d'écran ne la lit pas (aria-hidden) : elle ne dit rien que la fiche ne dise déjà par écrit (la ligne
// Continent d'un pays, d'un territoire ou d'une zone ; l'océan et la mère d'une mer ; l'intercommunalité d'une
// commune), et un nom « Où est … » ne dirait pas où.
import { geoEqualEarth, geoPath } from 'd3-geo';
import type { FeatureCollection, MultiPoint, MultiPolygon, Polygon, Position } from 'geojson';
import type { SorteLieu } from '../fiches/sorte';
import type { DonneesCarte } from '../map/donnees';
import { mersPourNommer, zonesAllumees } from '../map/mers';
import type { Entite, Forme, Lieu, Mer, NomTerrain, Pays } from '../map/types';
import { cadrerPays, cadrerPoints, proche, tracer, type Cadrage } from './vignettes';

const NS = 'http://www.w3.org/2000/svg';
/** Largeur du tracé en unités (celle des vignettes) ; la place est en 3:2. */
const LARGEUR = 600;
const RAPPORT = 3 / 2;
/**
 * Simplification du fond, en pixels de la place à sa plus grande taille (120 px de large) : un point à moins de 0,6 px
 * du précédent sauté, un îlot de moins de 0,3 px² retiré. Le lieu éclairé : la moitié, et aucun îlot retiré. En unités,
 * selon la largeur de la boîte (tolerance) : ≈ 40 à 70 Ko de tracé par fond, au lieu de 60 à 110 à 2 unités fixes.
 */
const TOLERANCE_PX = 0.6;
const AIRE_MIN_PX = 0.3;
const LARGEUR_PX = 120;
const tolerance = (b: readonly number[]): number => (b[2]! / LARGEUR_PX) * TOLERANCE_PX;
const aireMin = (b: readonly number[]): number => (b[2]! / LARGEUR_PX) ** 2 * AIRE_MIN_PX;
/** Un pas de calcul trace au plus ce nombre de points (un polygone plus grand : seul, en un pas). */
export const MORCEAU = 400;
/** Sans échéance du navigateur (pas de requestIdleCallback, ou son délai passé) : un pas de calcul dure au plus ceci. */
const TRANCHE_MS = 6;
/** Délai de requestIdleCallback : au-delà, le calcul avance quand même, une tranche à la fois. */
const DELAI_LIBRE_MS = 1000;
/** Un lieu plus petit que cette part de la largeur de la place gagne un anneau ; son rayon, en part de la largeur. */
export const SEUIL_ANNEAU = 0.025;
const RAYON_ANNEAU = 0.075;
/** Données pas encore là (l'île, la couche des mers) : un nouvel essai après ce délai, ESSAIS fois au plus. */
const ATTENTE_MS = 500;
const ESSAIS = 20;
/** Les fonds de région et les cartes de lieux gardés (les plus anciens oubliés au-delà). */
const FONDS_MAX = 8;
const PLANS_MAX = 40;
/** Rayon de la Terre (km) : la taille d'un lieu en unités, depuis sa superficie (Equal Earth est équivalente). */
const RAYON_TERRE_KM = 6371;
/** Une mer : au moins ces demi-largeurs autour d'elle (degrés), pour voir ses côtes. */
const MER_DEMI_LAT = 7;
const MER_DEMI_LON = 10;

/** Ce que la carte de situation lit des données déjà en mémoire. */
export interface SourceSituation {
  /** Le monde (pays.json et ses formes). */
  monde(): DonneesCarte | null;
  /** L'île, si elle est chargée. */
  ile(): DonneesCarte<Lieu> | null;
  /** Les mers dont la géométrie est lue, et leurs zones (défaut : mersPourNommer, la couche fine ou la légère). */
  mers?(): { mers: readonly Entite<Mer>[]; zones: readonly Mer[] } | null;
}

/** Le lieu d'une fiche. */
export interface DemandeSituation {
  terrain: NomTerrain;
  id: string;
  sorte: SorteLieu;
}

export interface Situation {
  /** La place de la carte de ce lieu, de taille fixe : remplie tout de suite si sa carte est gardée, sinon à lancer(). */
  place(d: DemandeSituation): HTMLElement;
  /** Calcule en temps libre la carte de la dernière place (rien si elle est déjà remplie). */
  lancer(): void;
  /** Arrête le calcul (la fiche fermée) ; le fond déjà tracé reste gardé. */
  arreter(): void;
}

/** Une échéance de requestIdleCallback (absente : setTimeout). */
interface Echeance {
  timeRemaining(): number;
  didTimeout?: boolean;
}

/** Un tracé fait en plusieurs pas, forme après forme, MORCEAU points au plus par pas. */
interface Trace {
  formes: readonly Forme[];
  i: number;
  j: number;
  d: string[];
  tolerance: number;
  aireMin: number;
}

/** Une région : son cadrage, la boîte montrée (3:2), l'ovale du monde s'il est entier, son fond (tracé en plusieurs pas). */
interface Fond {
  cadrage: Cadrage;
  boite: [number, number, number, number];
  sphere: string;
  trace: Trace;
  /** Le tracé du fond fini, d'un seul tenant (joint une fois). */
  texte?: string;
}

/** La carte d'un lieu, prête à poser. */
interface Plan {
  /** La région (« continent:Asia », « monde:0 », « mer:medit », « ile ») : dite en data-region, pour le pilote et les tests. */
  region: string;
  boite: [number, number, number, number];
  monde: boolean;
  sphere: string;
  eau: string;
  fond: string;
  lieu: string;
  anneau: [number, number, number] | null;
  /** Les formes éclairées (leurs id) : dites en data-eclaire, pour le pilote et les tests (le bon lieu, l'océan et ses mers enclavées). */
  eclaire: string;
}

const polygones = (f: Forme): Position[][][] => {
  const g = f.geometry as Polygon | MultiPolygon | null;
  return !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
};

const nouvelleTrace = (formes: readonly Forme[], tolerance: number, aireMin: number): Trace => ({ formes, i: 0, j: 0, d: [], tolerance, aireMin });

/**
 * Les anneaux de ces polygones sans les points à moins de `tol` degrés (en longitude et en latitude) du dernier gardé :
 * avant la projection, sans trigonométrie (un point projeté coûte ≈ 0,75 µs sur le PC, ≈ 6 sur l'A37). Le tracé en
 * garde à peine moins (simplifier le refait après la projection, à TOLERANCE près) ; un grand polygone (la Russie,
 * 5 482 points) passe d'un pas de ≈ 35 ms sur l'A37 à quelques ms. Un anneau réduit à moins de 4 points est retiré,
 * et le polygone avec lui si c'est son contour.
 *
 * Un anneau éclairci qui tourne dans l'autre sens que l'original (son aire plane, en degrés, change de signe : un îlot
 * réduit à un triangle retourné : 62 cas, polygone et tolérance, dans les 258 lieux) reste entier : d3-geo lirait ce
 * triangle comme son complément, la sphère entière moins l'îlot, et le peindrait sur toute la carte (la Russie et le
 * Groenland sur tout l'ovale, les terres du fond sur l'eau de chaque mer ; § 21 de l'étude). Le sens se compte en
 * passant (une multiplication de plus par point, sans trigonométrie) ; l'anneau gardé entier est petit (quelques
 * dizaines de points au plus). Un anneau réduit à moins de 4 points est retiré avant cette garde : son aire nulle
 * n'est pas un sens retourné (le garder entier, chaque îlot à pleine résolution, multipliait par 2 à 5 les points projetés
 * d'un fond du monde et allongeait les tranches jusqu'à ≈ 13 ms).
 */
export function decimer(polys: readonly Position[][][], tol: number): Position[][][] {
  const sortie: Position[][][] = [];
  for (const poly of polys) {
    const anneaux: Position[][] = [];
    for (const r of poly) {
      const g: Position[] = [r[0]!];
      const [x0, y0] = r[0]! as [number, number];
      let [lx, ly] = [x0, y0];
      // Les aires planes (doublées, depuis le premier point) de l'original et de l'éclairci : px, py le point d'avant.
      let aire = 0;
      let aireG = 0;
      let [px, py] = [x0, y0];
      for (let i = 1; i < r.length; i++) {
        const [x, y] = r[i]! as [number, number];
        aire += (px - x0) * (y - y0) - (x - x0) * (py - y0);
        px = x;
        py = y;
        if (i < r.length - 1 && Math.abs(x - lx) < tol && Math.abs(y - ly) < tol) continue;
        aireG += (lx - x0) * (y - y0) - (x - x0) * (ly - y0);
        g.push(r[i]!);
        lx = x;
        ly = y;
      }
      const garde = g.length < 4 || Math.sign(aireG) === Math.sign(aire) ? g : r;
      if (garde.length >= 4) anneaux.push(garde);
      else if (!anneaux.length) break;
    }
    if (anneaux.length) sortie.push(anneaux);
  }
  return sortie;
}

/** Un pas d'un tracé : des polygones de la forme courante, MORCEAU points au plus (un seul s'il est plus grand). Vrai : fini. */
function pasTrace(t: Trace, c: Cadrage): boolean {
  const f = t.formes[t.i];
  if (!f) return true;
  const polys = polygones(f);
  let k = t.j;
  let n = 0;
  while (k < polys.length) {
    const m = polys[k]!.reduce((a, r) => a + r.length, 0);
    if (k > t.j && n + m > MORCEAU) break;
    n += m;
    k++;
  }
  // La moitié de la tolérance, en degrés à l'échelle de la projection (Equal Earth : ≈ scale unités par radian).
  const tol = ((t.tolerance / c.projection.scale()) * 90) / Math.PI;
  if (k > t.j) t.d.push(tracer(c.projection, { type: 'MultiPolygon', coordinates: decimer(polys.slice(t.j, k), tol) }, t.tolerance, t.aireMin));
  t.j = k;
  if (t.j >= polys.length) {
    t.i++;
    t.j = 0;
  }
  return t.i >= t.formes.length;
}

const fini = (t: Trace): boolean => t.i >= t.formes.length;

/** La boîte 3:2 qui contient le cadre, centrée sur lui ; la projection coupée à elle (un peu plus large). */
function boiteDe(c: Cadrage): Fond['boite'] {
  let [x, y, w, h] = c.cadre;
  if (w / h < RAPPORT) {
    const l = h * RAPPORT;
    x -= (l - w) / 2;
    w = l;
  } else {
    const l = w / RAPPORT;
    y -= (l - h) / 2;
    h = l;
  }
  const m = 0.02 * w;
  c.projection.clipExtent([
    [x - m, y - m],
    [x + w + m, y + h + m],
  ]);
  return [x, y, w, h];
}

/** Le monde entier, centré sur la longitude `lon` : l'ovale, tout dedans. */
function cadrerMonde(lon: number): Cadrage {
  const projection = geoEqualEarth().rotate([-lon, 0]).fitWidth(LARGEUR, { type: 'Sphere' });
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds({ type: 'Sphere' });
  return { projection, cadre: [x0, y0, x1 - x0, y1 - y0], centre: [lon, 0], rayon: Infinity };
}

/** Le monde centré sur l'Atlantique, ou sur le Pacifique pour un lieu au-delà de 120° de longitude (comme la carte « pacifique »). */
const lonMonde = (lon: number): number => (Math.abs(lon) > 120 ? 150 : 0);

/** L'île entière, dans une boîte 3:2 de LARGEUR de large (sans formes, les tests : ses points). */
function cadrerIle(formes: readonly Forme[], points: [number, number][]): Cadrage {
  const lon = points.reduce((a, p) => a + p[0], 0) / Math.max(1, points.length);
  const collection: FeatureCollection | MultiPoint = formes.length ? { type: 'FeatureCollection', features: [...formes] } : { type: 'MultiPoint', coordinates: points };
  const h = LARGEUR / RAPPORT;
  const projection = geoEqualEarth()
    .rotate([-lon, 0])
    .fitExtent(
      [
        [0.06 * LARGEUR, 0.06 * h],
        [0.94 * LARGEUR, 0.94 * h],
      ],
      collection,
    );
  return { projection, cadre: [0, 0, LARGEUR, h], centre: [lon, 0], rayon: Infinity };
}

/** Le cadre d'une mer : son emprise, au moins MER_DEMI_LAT et MER_DEMI_LON degrés autour de son milieu. */
function cadrerMer(m: Mer): Cadrage {
  const [o, s, e0, n] = m.bbox;
  const e = e0 < o ? e0 + 360 : e0;
  const lon = (o + e) / 2;
  const lat = (s + n) / 2;
  const dLat = Math.max((n - s) / 2, MER_DEMI_LAT);
  const dLon = Math.max((e - o) / 2, MER_DEMI_LON / Math.max(0.3, Math.cos((lat * Math.PI) / 180)));
  const borne = (x: number) => Math.max(-85, Math.min(85, x));
  const points: [number, number][] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) points.push([lon + a * dLon, borne(lat + b * dLat)]);
  return cadrerPoints(points, lon);
}

/** Planifie `f` en temps libre ; rend de quoi l'annuler. */
function libre(f: (e?: Echeance) => void): () => void {
  const g = globalThis as { requestIdleCallback?: (f: (e: Echeance) => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  if (typeof g.requestIdleCallback === 'function') {
    const h = g.requestIdleCallback(f, { timeout: DELAI_LIBRE_MS });
    return () => g.cancelIdleCallback?.(h);
  }
  const h = setTimeout(() => f(), 50);
  return () => clearTimeout(h);
}

/** Date un pas en performance.measure (le pilote y rattache un gel) ; sans User Timing, rien. */
function dater(nom: string, debut: number): void {
  try {
    performance.measure(`situation:${nom}`, { start: debut, duration: performance.now() - debut });
  } catch {
    /* User Timing absent */
  }
}

const arrondi = (v: number) => Math.round(v * 10) / 10;

/** La carte posée dans sa place : un SVG à viewBox (la boîte), qui suit la taille de la place sans retracer. */
function poser(place: HTMLElement, p: Plan): void {
  // Une page démontée entre deux tranches (les tests, leur DOM factice retiré) : rien à poser.
  if (typeof document === 'undefined') return;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', p.boite.map(arrondi).join(' '));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('vignette-carte');
  for (const [classe, d] of [
    ['vignette-mer', p.sphere],
    ['situation-eau', p.eau],
    ['vignette-fond', p.fond],
    ['situation-lieu', p.lieu],
  ] as const) {
    if (!d) continue;
    const chemin = document.createElementNS(NS, 'path');
    chemin.classList.add(classe);
    chemin.setAttribute('d', d);
    svg.append(chemin);
  }
  if (p.anneau) {
    const [cx, cy, r] = p.anneau;
    const c = document.createElementNS(NS, 'circle');
    c.classList.add('situation-anneau');
    c.setAttribute('cx', String(arrondi(cx)));
    c.setAttribute('cy', String(arrondi(cy)));
    c.setAttribute('r', String(arrondi(r)));
    svg.append(c);
  }
  place.classList.toggle('situation-monde', p.monde);
  place.dataset.etat = 'prete';
  place.dataset.region = p.region;
  place.dataset.eclaire = p.eclaire;
  if (p.anneau) place.dataset.anneau = '';
  place.replaceChildren(svg);
}

/** Garde au plus `max` entrées, la plus récemment lue en dernier. */
function garder<T>(m: Map<string, T>, cle: string, v: T, max: number): void {
  m.delete(cle);
  m.set(cle, v);
  while (m.size > max) m.delete(m.keys().next().value!);
}

/** Ce que le calcul d'une demande a déjà fait (gardé tant que la même place est montrée). */
interface EnCours {
  d: DemandeSituation;
  cle: string;
  place: HTMLElement;
  /** La région choisie (sa clé), et le lieu (son entité, ses zones éclairées) ; null : pas encore résolu. */
  region: string | null;
  lieu: { formes: Forme[]; info: Lieu; eau: boolean; provisoire: boolean } | null;
  trace: Trace | null;
  essais: number;
}

export function creerSituation(source: SourceSituation): Situation {
  const fonds = new Map<string, Fond>();
  const plans = new Map<string, Plan>();
  let courant: EnCours | null = null;
  let annuler: (() => void) | null = null;
  let attente: ReturnType<typeof setTimeout> | null = null;

  const lireMers = () => (source.mers ? source.mers() : mersPourNommer());

  function stop(): void {
    annuler?.();
    annuler = null;
    if (attente !== null) clearTimeout(attente);
    attente = null;
  }

  /**
   * Le fond d'une région du monde ou de l'île, créé s'il manque (rien de tracé : les pas suivants) ; gardé, sauf
   * `garde` faux (un cadre à l'essai : gardé par l'appelant s'il sert).
   */
  function fond(cle: string, faire: () => { cadrage: Cadrage; formes: Forme[]; sphere?: boolean }, garde = true): Fond {
    let f = fonds.get(cle);
    if (!f) {
      const { cadrage, formes, sphere } = faire();
      const boite = boiteDe(cadrage);
      f = { cadrage, boite, sphere: sphere ? (geoPath(cadrage.projection)({ type: 'Sphere' }) ?? '') : '', trace: nouvelleTrace(formes, tolerance(boite), aireMin(boite)) };
    }
    if (garde) garder(fonds, cle, f, FONDS_MAX);
    return f;
  }

  const fondMonde = (m: DonneesCarte, lon: number) =>
    fond(`monde:${lon}`, () => ({ cadrage: cadrerMonde(lon), formes: m.entites.map((e) => e.forme).filter((f) => !!f), sphere: true }));

  /**
   * Le fond de la région du continent (ses pays jouables, comme la série de Jouer), ou null s'il n'en a pas ; avec
   * `lieu`, le cadre élargi à lui (compté comme un pays de la série), à l'essai : pas gardé.
   */
  function fondContinent(m: DonneesCarte, continent: string, lieu?: Pays): Fond | null {
    const cle = lieu ? `continent:${continent}+${lieu.id}` : `continent:${continent}`;
    if (!fonds.has(cle) && !m.entites.some((e) => e.pays.continent === continent && e.pays.statut === 'jouable')) return null;
    return fond(
      cle,
      () => {
        const pays = m.entites.filter((e) => e.pays.continent === continent && e.pays.statut === 'jouable').map((e) => e.pays);
        const cadrage = cadrerPays(lieu ? [...pays, lieu] : pays)!;
        return { cadrage, formes: m.entites.filter((e) => e.forme && proche(cadrage, e.pays)).map((e) => e.forme) };
      },
      !lieu,
    );
  }

  /** Le lieu tombe-t-il dans la boîte de la région (sans sa marge), sans être plus grand qu'elle ? */
  function dans(f: Fond, l: Lieu): boolean {
    const pt = f.cadrage.projection(l.point);
    if (!pt) return false;
    const [x, y, w, h] = f.boite;
    const m = 0.04 * w;
    const [px, py] = pt;
    return px >= x + m && px <= x + w - m && py >= y + m && py <= y + h - m && taille(f, l) <= 0.9 * w;
  }

  /** La taille du lieu en unités de la boîte (sa plus grande partie, Equal Earth étant équivalente). */
  const taille = (f: Fond, l: Lieu): number => (Math.sqrt(l.partie_max_km2) / RAYON_TERRE_KM) * f.cadrage.projection.scale();

  /**
   * Résout la région et le lieu d'une demande ; faux : les données manquent (l'île, la couche des mers), un nouvel
   * essai plus tard.
   */
  function resoudre(c: EnCours): boolean {
    const { d } = c;
    if (d.sorte === 'commune') {
      const ile = source.ile();
      const e = ile?.entites.find((x) => x.pays.id === d.id);
      if (!ile || !e) return false;
      fond('ile', () => {
        const formes = ile.entites.map((x) => x.forme).filter((f) => !!f);
        return { cadrage: cadrerIle(formes, ile.entites.map((x) => x.pays.point)), formes };
      });
      c.region = 'ile';
      c.lieu = { formes: e.forme ? [e.forme] : [], info: e.pays, eau: false, provisoire: false };
      return true;
    }
    const m = source.monde();
    if (!m) return false;
    if (d.sorte === 'mer') {
      const lu = lireMers();
      const z = lu?.zones.find((x) => x.id === d.id);
      if (!lu || !z) return false;
      const ids = new Set(zonesAllumees(d.id, lu.zones));
      const formes = lu.mers.filter((x) => ids.has(x.pays.id)).map((x) => x.forme);
      if (z.sorte === 'océan') {
        // Le milieu de son emprise, et non son point (celui du Pacifique est à 115° O : le Pacifique serait coupé).
        const [o, , e0] = z.bbox;
        const lon = lonMonde((((o + (e0 < o ? e0 + 360 : e0)) / 2 + 540) % 360) - 180);
        fondMonde(m, lon);
        c.region = `monde:${lon}`;
      } else {
        c.region = `mer:${d.id}`;
        fond(c.region, () => {
          const cadrage = cadrerMer(z);
          return { cadrage, formes: m.entites.filter((e) => e.forme && proche(cadrage, e.pays)).map((e) => e.forme) };
        });
      }
      c.lieu = { formes, info: z, eau: true, provisoire: !formes.length };
      return true;
    }
    const e = m.entites.find((x) => x.pays.id === d.id);
    if (!e) return false;
    const p: Pays = e.pays;
    const r = d.sorte === 'continent' ? null : fondContinent(m, p.continent);
    c.region = null;
    if (r && dans(r, p)) c.region = `continent:${p.continent}`;
    else if (r) {
      // Hors du cadre de son continent (au bord : le champ de glace de Patagonie ; au large : les Malouines) : le cadre
      // élargi à lui, s'il y compte comme un pays de la série (cadrerPays : à moins de 4 fois la distance médiane du
      // centre) et y tombe ; sinon le monde (la Russie, dont le point est en Sibérie).
      const large = fondContinent(m, p.continent, p)!;
      if (dans(large, p)) {
        c.region = `continent:${p.continent}+${p.id}`;
        garder(fonds, c.region, large, FONDS_MAX);
      }
    }
    if (!c.region) {
      const lon = lonMonde(p.point[0]);
      fondMonde(m, lon);
      c.region = `monde:${lon}`;
    }
    c.lieu = { formes: e.forme ? [e.forme] : [], info: p, eau: false, provisoire: false };
    return true;
  }

  /** La carte du lieu, son fond et son tracé finis. */
  function plan(c: EnCours, f: Fond): Plan {
    const l = c.lieu!;
    const d = c.trace!.d.join('');
    const [, , w] = f.boite;
    const pt = f.cadrage.projection(l.info.point);
    const petit = l.info.micro || !d || taille(f, l.info) < SEUIL_ANNEAU * w;
    return {
      region: c.region!,
      boite: f.boite,
      monde: !!f.sphere,
      sphere: f.sphere,
      eau: l.eau ? d : '',
      fond: (f.texte ??= f.trace.d.join('')),
      lieu: l.eau ? '' : d,
      anneau: petit && pt ? [pt[0], pt[1], RAYON_ANNEAU * w] : null,
      eclaire: l.formes.map((x) => x.properties.id).join(' '),
    };
  }

  /** Une tranche de calcul : des pas tant que l'échéance le permet (au moins un) ; puis la suivante, ou la carte posée. */
  function tranche(e?: Echeance): void {
    annuler = null;
    const c = courant;
    if (!c) return;
    const debut = performance.now();
    const budget = e && !e.didTimeout ? Math.max(0, e.timeRemaining() - 1) : TRANCHE_MS;
    // Ce que la tranche a fait (« region », « fond », « lieu », « pose »), pour le pilote : situation:fond+lieu.
    const quoi = new Set<string>();
    for (;;) {
      if (!c.lieu) {
        quoi.add('region');
        if (!resoudre(c)) {
          dater('attente', debut);
          if (++c.essais <= ESSAIS) attente = setTimeout(() => ((attente = null), planifier()), ATTENTE_MS);
          return;
        }
      } else {
        const f = fonds.get(c.region!);
        if (!f) {
          // Le fond oublié entre deux tranches (FONDS_MAX) : la région se résout de nouveau, le lieu se retrace.
          c.lieu = null;
          c.trace = null;
          continue;
        }
        if (!fini(f.trace)) {
          quoi.add('fond');
          pasTrace(f.trace, f.cadrage);
        } else {
          quoi.add('lieu');
          c.trace ??= nouvelleTrace(c.lieu.formes, tolerance(f.boite) / (c.lieu.eau ? 1 : 2), c.lieu.eau ? aireMin(f.boite) : 0);
          if (!fini(c.trace)) pasTrace(c.trace, f.cadrage);
          if (fini(c.trace)) {
            const p = plan(c, f);
            if (!c.lieu.provisoire) garder(plans, c.cle, p, PLANS_MAX);
            poser(c.place, p);
            quoi.add('pose');
            dater([...quoi].join('+'), debut);
            courant = null;
            return;
          }
        }
      }
      if (performance.now() - debut >= budget) break;
    }
    dater([...quoi].join('+'), debut);
    planifier();
  }

  function planifier(): void {
    if (annuler || attente !== null || !courant) return;
    annuler = libre(tranche);
  }

  return {
    place(d) {
      const cle = `${d.terrain}:${d.id}`;
      const el = document.createElement('div');
      el.className = 'fiche-situation';
      el.setAttribute('aria-hidden', 'true');
      el.dataset.lieu = d.id;
      el.dataset.etat = 'attente';
      const p = plans.get(cle);
      // La même demande refaite (la fiche refaite sur place) garde ce qu'elle a calculé.
      const avant = courant && courant.cle === cle ? courant : null;
      stop();
      if (p) {
        garder(plans, cle, p, PLANS_MAX);
        poser(el, p);
        courant = null;
      } else courant = avant ? { ...avant, place: el, essais: 0 } : { d, cle, place: el, region: null, lieu: null, trace: null, essais: 0 };
      return el;
    },
    lancer() {
      planifier();
    },
    arreter() {
      stop();
      courant = null;
    },
  };
}
