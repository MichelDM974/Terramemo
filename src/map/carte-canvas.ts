// Carte Canvas qui tourne (décision « Carte qui tourne ») : la mappemonde garde
// son ovale (Equal Earth) et tourne sous le doigt comme un globe. Même API que
// la carte SVG (CarteAffichee) pour les vues et window.terramemo.carte.
//
// Gestes : suivi des doigts écrit ici plutôt que d3-zoom. d3-zoom tient une
// transformation plane (k, x, y) : son x devrait être converti en rotation et
// remis à zéro à chaque événement, et son pincement garde fixe un point du
// plan, pas un point de la sphère. Ici, chaque geste garde une ancre (le point
// de la sphère sous le doigt, ou entre les deux doigts, vue.pointVirtuel) et
// chaque mouvement calcule la vue qui la remet sous les doigts (vue.placer) :
// le zoom autour du pincement et la rotation viennent du même calcul. Les
// doigts sont lus dans les TouchEvent (comme d3-zoom) : les mesures
// (src/mesure) y lisent le nombre de doigts et le type du geste ; la souris
// par les PointerEvent, la molette par wheel. Pas d'inertie (d3-zoom n'en a
// pas non plus).
//
// Dessin : une fois par image au plus (requestAnimationFrame), quand la vue
// change ; la carte allégée pendant un mouvement si la complète a trop de
// sommets visibles, la complète au repos (redessinée dans la fin du geste).
// La carte allégée ne garde que les polygones d'au moins ILE_LEGERE_KM ; les
// îles plus petites y sont celles de la complète (peu de sommets chacune), si
// bien qu'aucune île visible au repos ne disparaît pendant le geste.
// Avec l'option peintre, un autre rendu dessine dans le même canvas (WebGL :
// carte-webgl.ts) ; gestes, vue, pick et noter restent ceux-ci. En ?rendu=webgl,
// le Canvas 2D dessine d'abord, puis adopter() passe la main au peintre WebGL
// (relais-webgl.ts) à la même vue, geste en cours compris : seul l'élément
// canvas change, l'état de la carte reste ici.
import { interpolateZoom } from 'd3-interpolate';
import { DUREE_CRAN_MS, DUREE_TOUT_MS, type ChronoRendu, type CarteAffichee, type OptionsCarte } from './carte';
import type { DonneesCarte } from './donnees';
import { ancre, image, MARGE_PX, minuscule, passeCoupure, preparer, SEUIL_PX, TAILLE_MIN_PX, tracerOvale, tracerPartie, visible, type ImageTrace, type Partie } from './dessin';
import { anneauPrincipal, RAYON_TERRE_KM, versEcran, type Emprise } from './geo';
import { SuiviPointeurs } from './geste';
import { indexLieux, type LieuIndexe } from './lieux';
import { formeContour, zonesAllumees, type CoucheMers } from './mers';
import { calculerPastilles, PASTILLE, tailleEcranPx, type Pastille } from './pastilles';
import { acceptesDe } from './acceptes';
import { noter, pick, type ContexteCarte, type Note, type OptionsNoter, type ResultatPick } from './pick';
import { ROTATIONS } from './projection';
import { seau, VARIABLES_MEMOIRE, VARIABLES_MEMOIRE_MERS, type Teintes } from './teintes';
import type { Forme, Mer, Transfo } from './types';
import {
  bornerK,
  bornerY,
  cadre,
  dePlan,
  ecartLon,
  placer,
  pointVirtuel,
  projectionDe,
  regionVisible,
  suivrePoint,
  transfoDe,
  versPlan,
  viserEmprise,
  viserVue,
  vueDeTransfo,
  type Cadre,
  type VueGlobe,
} from './vue';
import type { GeoProjection } from 'd3-geo';
import type { Position } from 'geojson';

/** Compteurs d'un dessin (sans sa durée, mesurée par CarteCanvas). */
export interface StatsDessin {
  trace_ms: number;
  leger: boolean;
  parties: number;
  sommets: number;
  /** Canvas : moveTo et lineTo émis ; WebGL : appels de dessin. */
  emis: number;
  copies: number;
  /** Canvas, pendant un mouvement : parties tracées comme au repos (petites, ou contour effondré), parties minuscules sautées (dessin.ts). */
  exactes?: number;
  minuscules?: number;
  /** WebGL : temps GPU d'une image récente (EXT_disjoint_timer_query_webgl2), null sans l'extension. */
  gpu_ms?: number | null;
  /** Canvas : script de la couche du dessus (marques, pastilles) ; carte : la carte a été redessinée (sinon, la couche seule). */
  dessus_ms?: number;
  carte?: boolean;
}

/** Un anneau de la couche du dessus : autour du point de la zone `id`, ou de `point` (anneauEn : la ville d'une capitale). */
export interface AnneauCarte {
  id: string;
  classe: string;
  rayon_px: number;
  point?: [number, number];
}

/** Le point [lon, lat] d'un anneau : le sien, ou celui de sa zone ; null si elle est inconnue. */
export function pointAnneau(a: AnneauCarte, entites: readonly { pays: { id: string; point: [number, number] } }[]): [number, number] | null {
  return a.point ?? entites.find((en) => en.pays.id === a.id)?.pays.point ?? null;
}

/** Ce qu'une image donne à dessiner à un peintre : la vue et ce qui se pose dessus. */
export interface EtatImage {
  v: VueGlobe;
  c: Cadre;
  t: Transfo;
  proj: GeoProjection;
  enMouvement: boolean;
  pastilles: readonly Pastille[];
  marques: ReadonlyMap<string, ReadonlySet<string>>;
  /** Autour du point de la zone `id`, ou de `point` s'il est donné (anneauEn). */
  anneaux: readonly AnneauCarte[];
  /**
   * Seau de la carte de la mémoire de chaque zone teintée (teintes.ts), null
   * sans teinte : un nouvel objet à chaque changement (teinter), si bien
   * qu'un peintre compare l'objet, sans parcourir ses 195 entrées à chaque image.
   */
  teintes: Teintes | null;
}

/** Un rendu qui dessine dans le canvas de CarteCanvas à la place du Canvas 2D (carte-webgl.ts). */
export interface Peintre {
  /** Prépare les géométries (dans chemins_ms du chargement). */
  preparer(): void;
  /** Nouvelle taille (px CSS) et densité ; le canvas a déjà sa taille en pixels physiques. */
  dimensionner(l: number, h: number, dpr: number): void;
  dessiner(e: EtatImage): StatsDessin;
  /** Le dessin du mouvement diffère du repos (carte allégée) : la fin du geste redessine. */
  readonly allegeEnMouvement: boolean;
  /** La couche marine posée sur la carte (CarteCanvas.prendreMers, ou à l'adoption) : son maillage, à part de celui des terres. */
  prendreMers?(c: CoucheMers): void;
  detruire(): void;
}

/** Crée le peintre sur le canvas de la carte ; redessiner demande une image (contexte WebGL rendu). */
export type FabriquePeintre = (canvas: HTMLCanvasElement, o: { donnees: DonneesCarte; redessiner: () => void }) => Peintre;

export const ZOOM_MAX = 400;
const ZOOM_MAX_MONTRER = 40;
const DUREE_MONTRER_MS = { min: 600, max: 2000 } as const;
/** Pas des hachures à l'écran (px), comme le SVG. */
const PAS_HACHURES = 6;
/**
 * Au-delà de ce nombre de sommets visibles de la carte complète, un mouvement
 * dessine la carte allégée : au zoom 1, la complète en montre 125 000 (3 ms de
 * tracé sur le PC, sans le remplissage), l'allégée 13 000 ; zoomé sur une
 * région (zoom 20), la complète tient seule dans le budget.
 */
export const BUDGET_SOMMETS = 20_000;
/** Fin d'un geste de molette : sans nouvel événement pendant ce délai (comme d3-zoom). */
const FIN_MOLETTE_MS = 150;

/**
 * Îles de la carte complète reprises dans l'allégée : celles dont le plus
 * grand côté fait moins de ce nombre de km, le seuil de geodata/build.mjs, qui
 * ne met dans monde-leger.topo.json que les polygones d'au moins 40 km
 * (chacun simplifié à part, aucun ne s'y perd). Le build mesure l'emprise sur
 * la géométrie source, ici sur la complète simplifiée à 2 km : une marge (50
 * km) devait absorber l'écart, mais chaque polygone de la complète d'au moins
 * 40 km a le sien dans l'allégée (tests/carte-canvas.test.ts le vérifie) ;
 * entre 40 et 50 km, 137 îles étaient dessinées deux fois. Les quelque 3 600
 * polygones de moins de 40 km ont peu de sommets ; au zoom 1 en mouvement,
 * plus de 900 sont sautés (minuscules, ou que le repos ne montre pas) et
 * environ 790 tracés comme au repos (dessin.ts, tests/carte-canvas.test.ts).
 */
export const ILE_LEGERE_KM = 40;
/** Majoration de la taille (px / K) d'une partie de la carte allégée : 2 × 15 km / rayon de la Terre. */
const MARGE_LEGERE = (2 * 15) / RAYON_TERRE_KM;

/**
 * Les petites îles d'une liste de parties (à partir de l'indice de, triées
 * par taille décroissante) : leur emprise commune et la plus grande taille.
 */
export interface Groupe {
  de: number;
  o: number;
  s: number;
  e: number;
  n: number;
  taille: number;
}

/** Les parties précalculées d'une carte, alignées sur donnees.entites et donnees.contestees. */
export interface Calque {
  pays: Partie[][];
  zones: Partie[][];
  sommets: number;
  /** Carte allégée : le groupe des petites îles de chaque liste (null : aucune). */
  groupes?: { pays: (Groupe | null)[]; zones: (Groupe | null)[] };
}

function compter(pays: Partie[][], zones: Partie[][]): Calque {
  let sommets = 0;
  for (const ps of [...pays, ...zones]) for (const p of ps) sommets += p.points;
  return { pays, zones, sommets };
}

/**
 * Appelle f(partie, indice de la liste) pour chaque partie à tracer : ni
 * minuscule (pendant un mouvement) ni hors de l'écran. Les petites îles d'une
 * liste de la carte allégée sont sautées d'un bloc si leur emprise commune est
 * hors de l'écran ou leur plus grande minuscule, et la première minuscule
 * arrête la liste (triée par taille) plutôt que de tester une à une ses
 * 3 600 îles de moins de 40 km : tracé JS de l'allégée sur le PC (Node, sans
 * Canvas), 0,50 → 0,41 ms au zoom 1, 0,22 → 0,08 ms zoomé sur la Polynésie.
 */
export function parcourir(im: ImageTrace, listes: Partie[][], groupes: (Groupe | null)[] | undefined, f: (p: Partie, i: number) => void): void {
  for (let i = 0; i < listes.length; i++) {
    const ps = listes[i] as Partie[];
    const g = groupes?.[i] ?? null;
    const de = g ? g.de : ps.length;
    const fin = g && ((im.mouvement && im.K * g.taille < TAILLE_MIN_PX) || !visible(im, g)) ? de : ps.length;
    for (let j = 0; j < fin; j++) {
      const p = ps[j] as Partie;
      if (minuscule(im, p)) {
        if (j >= de) break;
        continue;
      }
      // Une île que le repos ne montre pas (Partie.ecart, dessin.ts), écartée
      // sans appeler f : un millier au zoom 1, ni triées ni groupées par ce critère.
      if (im.mouvement && im.K * (p.source ?? p).ecart < SEUIL_PX) {
        im.minuscules++;
        continue;
      }
      if (visible(im, p)) f(p, i);
    }
  }
}

export function calque(donnees: DonneesCarte): Calque {
  return compter(
    donnees.entites.map((e) => preparer(e.forme)),
    donnees.contestees.map((z) => preparer(z.forme)),
  );
}

/**
 * La carte allégée (formes de monde-leger.topo.json), complétée des îles de
 * moins de ILE_LEGERE_KM de la complète (les mêmes parties, partagées). Une
 * entité sans forme allégée (toutes ses îles sous 40 km) n'a que celles-là.
 */
export function calqueLeger(donnees: DonneesCarte, complet: Calque, formes: { pays: Map<string, Forme>; zones: Map<string, Forme> }): Calque {
  const petites = (ps: Partie[] | undefined) => (ps ?? []).filter((p) => p.km < ILE_LEGERE_KM).sort((a, b) => b.taille - a.taille);
  // Une île réduite en triangle peut être plus petite que l'île : sa taille est
  // majorée de la tolérance de la simplification (15 km, comptée deux fois la
  // longueur à l'écran d'un arc de 15 km au pire des échelles d'Equal Earth),
  // pour qu'elle ne soit jamais sautée là où l'île se verrait.
  const siennes = (f: Forme | undefined, completes: Partie[] | undefined) => {
    const ps = f ? preparer(f, MARGE_LEGERE) : [];
    for (const p of ps) p.source = sourceDe(p, completes ?? []);
    return ps;
  };
  const listes = (fs: (Forme | undefined)[], completes: Partie[][]) => {
    const parties: Partie[][] = [];
    const groupes: (Groupe | null)[] = [];
    fs.forEach((f, i) => {
      const grandes = siennes(f, completes[i]);
      const ps = petites(completes[i]);
      parties.push([...grandes, ...ps]);
      if (!ps.length) return groupes.push(null);
      const g: Groupe = { de: grandes.length, o: Infinity, s: Infinity, e: -Infinity, n: -Infinity, taille: ps[0]?.taille ?? 0 };
      for (const p of ps) {
        g.o = Math.min(g.o, p.o);
        g.s = Math.min(g.s, p.s);
        g.e = Math.max(g.e, p.e);
        g.n = Math.max(g.n, p.n);
      }
      groupes.push(g);
    });
    return { parties, groupes };
  };
  const pays = listes(donnees.entites.map((e) => formes.pays.get(e.pays.id)), complet.pays);
  const zones = listes(donnees.contestees.map((z) => formes.zones.get(z.forme.properties.id)), complet.zones);
  return { ...compter(pays.parties, zones.parties), groupes: { pays: pays.groupes, zones: zones.groupes } };
}

/**
 * La partie de la complète qu'une partie de l'allégée remplace : parmi les
 * parties de la même entité, celle dont l'emprise ressemble le plus à la
 * sienne (aire commune sur aire réunie ; chaque polygone de l'allégée est
 * simplifié à part, il en a une). Le plus grand recouvrement ne suffit pas :
 * l'emprise du continent contient celle d'une île voisine. null si aucune ne
 * la rencontre.
 */
function sourceDe(p: Partie, completes: readonly Partie[]): Partie | null {
  const aire = (q: Partie) => (q.e - q.o) * (q.n - q.s);
  let meilleure: Partie | null = null;
  let score = -1;
  for (const q of completes) {
    if (p.o > q.e || q.o > p.e || p.s > q.n || q.s > p.n) continue;
    const a = Math.max(0, Math.min(p.e, q.e) - Math.max(p.o, q.o)) * Math.max(0, Math.min(p.n, q.n) - Math.max(p.s, q.s));
    const sc = a / (aire(p) + aire(q) - a + 1e-12);
    if (sc > score) [meilleure, score] = [q, sc];
  }
  return meilleure;
}

/**
 * La partie va avec les coutures (remplie, son contour tracé sans les côtés
 * qui suivent l'antiméridien, un pôle ou le bord de l'ovale) : elle, ou sa
 * source, qu'un geste trace à sa place quand elle est petite (dessin.ts) ; la
 * coupure peut passer dans l'emprise de l'une et pas de l'autre (relecture du
 * 06/11 : Brunei à λ0 = -66 prenait un trait le long du bord de l'ovale).
 */
export function aCoupure(p: Partie, r: number): boolean {
  const q = p.source ?? p;
  return p.couture || passeCoupure(p, r) || (q !== p && (q.couture || passeCoupure(q, r)));
}

/**
 * Sommets des parties visibles : le coût du tracé de ce calque, plus celui du
 * calque marin quand la couche de base le trace (mers : une teinte le demande ;
 * null sinon). La bascule vers la carte allégée (BUDGET_SOMMETS) compte ainsi
 * la mer avec les terres (étude J2, § 4.3).
 */
export function sommetsVisibles(im: ImageTrace, cq: Calque, mers: Calque | null = null): number {
  let n = 0;
  for (const ps of cq.pays) for (const p of ps) if (visible(im, p)) n += p.points;
  return mers ? n + sommetsVisibles(im, mers) : n;
}

/**
 * Le calque marin (lot 3a) : les parties de chaque zone (dans l'ordre de
 * CoucheMers.mers, dans Calque.pays ; Calque.zones vide), au repos (10 km,
 * mers.topo.json) et en mouvement (50 km, mers-leger.topo.json) ; le contour
 * de chaque zone allumée (formeContour : l'Atlantique sans l'anneau des
 * Sargasses), dans les deux. Préparés comme les pays (preparer).
 */
export interface CalquesMers {
  zones: Mer[];
  /** Index de chaque zone dans zones (et dans les calques), par id. */
  indices: Map<string, number>;
  complet: Calque;
  leger: Calque;
  contours: Partie[][];
  contoursLegers: Partie[][];
}

/**
 * Une forme dont les coutures de l'antiméridien reçoivent un sommet par degré
 * de latitude (PAS_COUTURE_DEG), restant à ±180 (estCouture les reconnaît
 * toujours). Le build des mers densifie tout sauf elles (étude J2, § 2.3) ; or
 * le méridien de 180° est courbe dans Equal Earth, et le tracé relie deux
 * sommets par une droite : à λ0 = 0, où la couture est le bord de l'ovale, la
 * corde de 43° de la couture du Pacifique Sud passait à une dizaine de pixels
 * à l'intérieur du bord, laissant un croissant de mer non teinté (le tracé
 * rapide comparé à geoPath, tests/carte-canvas.test.ts). Une couture des
 * pays (Russie, Fidji, Antarctique) est courte.
 */
export function densifierCoutures(forme: Forme): Forme {
  const g = forme.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let change = false;
  const dense = polys.map((poly) =>
    poly.map((anneau) => {
      const res: Position[] = [];
      anneau.forEach((q, i) => {
        const p = anneau[i - 1];
        const [lp, pp, lq, pq] = [p?.[0] ?? 0, p?.[1] ?? 0, q[0] ?? 0, q[1] ?? 0];
        const n = p && Math.abs(lp) >= 180 && lp === lq ? Math.ceil(Math.abs(pq - pp) / PAS_COUTURE_DEG) : 0;
        for (let j = 1; j < n; j++) res.push([lp, pp + ((pq - pp) * j) / n]);
        if (n > 1) change = true;
        res.push(q);
      });
      return res;
    }),
  );
  if (!change) return forme;
  const geometry = g.type === 'Polygon' ? { type: 'Polygon' as const, coordinates: dense[0] ?? [] } : { type: 'MultiPolygon' as const, coordinates: dense };
  return { ...forme, geometry };
}
const PAS_COUTURE_DEG = 1;

export function calquesMers(c: CoucheMers): CalquesMers {
  const formes = c.mers.map((e) => ({ pays: e.pays, forme: densifierCoutures(e.forme) }));
  const legeres = c.mers.map((e) => ({ pays: e.pays, forme: densifierCoutures(c.leger.get(e.pays.id) ?? e.forme) }));
  const complet = compter(formes.map((e) => preparer(e.forme)), []);
  const leger = compter(legeres.map((e) => preparer(e.forme)), []);
  // Le contour d'une zone est sa forme, sauf pour un océan qui enclave une mer : ses parties déjà préparées, sinon.
  const contours = (es: typeof legeres, cq: Calque) =>
    es.map((e, i) => {
      const f = formeContour(e, es);
      return f === e.forme ? (cq.pays[i] ?? []) : preparer(f);
    });
  return {
    zones: c.mers.map((e) => e.pays),
    indices: new Map(c.mers.map((e, i) => [e.pays.id, i])),
    complet,
    leger,
    contours: contours(formes, complet),
    contoursLegers: contours(legeres, leger),
  };
}

interface Couleurs {
  mer: string;
  terre: string;
  frontiere: string;
  hachure: string;
  pastille: string;
  bord: string;
  /** Contour de la zone fausse (.pays.faux du SVG). */
  texte: string;
  marques: Record<string, string>;
  /** Seaux de la carte de la mémoire (--memoire-0 à 4). */
  memoire: string[];
  /** Les marques et les seaux sur l'eau (--mer-choisie…, --memoire-mer-0 à 4). */
  marquesMers: Record<string, string>;
  memoireMers: string[];
  /** Épaisseur des frontières à l'arrêt (px CSS, --frontiere-repos) ; 0 : toujours d'un pixel physique. */
  repos: number;
}

function lireCouleurs(): Couleurs {
  const css = getComputedStyle(document.documentElement);
  const v = (nom: string) => css.getPropertyValue(nom).trim();
  return {
    mer: v('--mer'),
    terre: v('--terre'),
    frontiere: v('--frontiere-fine'),
    hachure: v('--hachure'),
    pastille: v('--pastille'),
    bord: v('--bg'),
    texte: v('--text'),
    // Classes de marquer() : les mêmes couleurs que .pays.choisi, .juste, .faux du SVG.
    marques: { choisi: v('--accent'), juste: v('--good'), faux: v('--danger') },
    memoire: VARIABLES_MEMOIRE.map(v),
    marquesMers: { choisi: v('--mer-choisie'), juste: v('--mer-juste'), faux: v('--mer-fausse') },
    memoireMers: VARIABLES_MEMOIRE_MERS.map(v),
    repos: parseFloat(v('--frontiere-repos')) || 0,
  };
}

/**
 * La zone fausse se distingue de la juste autrement que par la teinte
 * (daltonisme : carte.css, .pays.faux) : un contour couleur du texte, de cette
 * épaisseur (px CSS), autour de son tracé comme de sa pastille.
 */
export const TRAIT_FAUX_PX = 3;

const deuxImages = () => new Promise<number>((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
const TOUR = 2 * Math.PI;

export class CarteCanvas implements CarteAffichee {
  readonly hote: HTMLElement;
  /** L'élément qui montre la carte : celui du Canvas 2D, ou celui du peintre (adopter). */
  private elt: HTMLCanvasElement;
  /** Canvas 2D (gardé après adopter : revenirAuCanvas2D le remet), ou null quand un peintre dessine dès le départ. */
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas2d: HTMLCanvasElement | null = null;
  /**
   * Canvas 2D : la couche du dessus (marques, contour faux, anneaux,
   * pastilles), posée sur la carte. Un toucher ne change qu'elle : la carte
   * entière n'est ni retracée ni rastérisée pour colorer un pays (dessiner).
   */
  private dessus: HTMLCanvasElement | null = null;
  private ctxDessus: CanvasRenderingContext2D | null = null;
  /** Ce que montre la carte dessinée (vue, taille, allégée ou non) : inchangé, seule la couche du dessus est redessinée. */
  private signature = '';
  /** Index de chaque entité dans donnees.entites (et dans les calques), par id. */
  private readonly indices: Map<string, number>;
  private peintreActif: Peintre | null = null;
  private c: Cadre = cadre(1, 1);
  private v: VueGlobe;
  /**
   * La vue vient de montrer(), qui ignore la borne verticale : un changement de
   * taille la replace sans la borner, jusqu'au prochain geste ou pose bornée.
   * Gardé à part et non déduit de la vue : en paysage, la vue libre peut tomber
   * dans la borne, et le retour en portrait la bornerait.
   */
  private libre = false;
  private proj: GeoProjection;
  private dpr = 1;
  private complet: Calque | null = null;
  private leger: Calque | null = null;
  private couleurs: Couleurs;
  private motif: CanvasPattern | null = null;
  private pastilles: Pastille[] = [];
  private marques = new Map<string, Set<string>>();
  private anneaux: AnneauCarte[] = [];
  /**
   * Carte de la mémoire (teinter) : le seau de chaque zone teintée, et le même
   * par index d'entité (-1 : --terre), lu par le tracé de chaque partie. Peintes
   * sur la carte, pas sur la couche du dessus : un toucher ne les redessine
   * pas ; leur version entre dans la signature de la carte.
   */
  private teintes: Teintes | null = null;
  private seaux: Int8Array | null = null;
  private versionTeintes = 0;
  /** Les teintes du dernier teinter(), telles quelles : reprises par prendreMers (les ids des mers y étaient écartés avant la couche). */
  private teintesDemandees: Teintes | null = null;
  /** Couche marine (prendreMers) et ses calques ; le seau de chaque zone marine teintée (-1 : aucun), null sans teinte de mer : le calque marin n'est pas tracé. */
  private couche: CoucheMers | null = null;
  private mers: CalquesMers | null = null;
  private seauxMers: Int8Array | null = null;
  /** Index commun des pays et des mers (lieux.ts) : ecran, vise. */
  private lieux: Map<string, LieuIndexe>;
  private image = 0;
  /** Un mouvement (geste ou vol) est en cours : carte allégée possible. */
  private enMouvement = false;
  private masquee = false;
  private observateur: ResizeObserver;
  private ecouteurs: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  private suivi: SuiviPointeurs;
  /** Geste de l'utilisateur en cours : ancre et état des doigts. */
  private geste: {
    ancre: [number, number];
    ids: string;
    k0: number;
    d0: number;
    aBouge: boolean;
    souris: number | null;
    molette: number;
  } | null = null;
  /** Vol de montrer() en cours, avancé par l'image du dessin (une seule boucle d'images). */
  private vol: { interp: (u: number) => number[]; duree: number; t0: number | null; cible: VueGlobe; libre: boolean } | null = null;
  /** Dernier dessin : compteurs, pour le pilote et les mesures. */
  dernier: ({ ms: number } & StatsDessin) | null = null;

  constructor(
    private readonly o: OptionsCarte & {
      leger?: Promise<{ pays: Map<string, Forme>; zones: Map<string, Forme> } | null>;
      /** Un autre rendu que le Canvas 2D (WebGL) ; s'il lève une erreur, rien n'est attaché à l'hôte. */
      peintre?: FabriquePeintre;
    },
  ) {
    this.hote = o.hote;
    this.elt = CarteCanvas.element();
    if (o.peintre) this.peintreActif = o.peintre(this.elt, { donnees: o.donnees, redessiner: () => this.demander() });
    else {
      const ctx = this.elt.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D indisponible');
      this.ctx = ctx;
      this.canvas2d = this.elt;
      const dessus = document.createElement('canvas');
      dessus.className = 'carte-canvas carte-dessus';
      dessus.setAttribute('aria-hidden', 'true');
      // Les doigts vont au canvas de la carte (et à l'hôte), jamais à la couche du dessus.
      dessus.style.pointerEvents = 'none';
      this.ctxDessus = dessus.getContext('2d');
      if (this.ctxDessus) this.dessus = dessus;
    }
    this.indices = new Map(o.donnees.entites.map((e, i) => [e.pays.id, i]));
    this.lieux = indexLieux(o.donnees);
    this.hote.classList.add('carte');
    this.hote.dataset.rendu = o.rendu;
    this.hote.dataset.projection = o.projection;
    this.couleurs = lireCouleurs();
    // Point de départ de la rotation : le segment Projection (Monde 0°, Pacifique 150° E).
    this.v = { r: -ROTATIONS[o.projection][0], k: 1, y: 0 };
    this.proj = projectionDe(this.v.r, this.c);
    this.suivi = new SuiviPointeurs((de, vers, x, y) =>
      suivrePoint(this.c, { r: de.r ?? 0, k: de.k, y: de.y }, { r: vers.r ?? 0, k: vers.k, y: vers.y }, x, y),
    );

    const sur = <E extends Event>(cible: EventTarget, type: string, f: (ev: E) => void, opts?: AddEventListenerOptions) => {
      const l = f as EventListener;
      cible.addEventListener(type, l, opts);
      this.ecouteurs.push([cible, type, l, opts]);
    };
    // Seuil toucher/déplacer : les PointerEvent, doigt et souris, comme en SVG.
    sur<PointerEvent>(this.hote, 'pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const [x, y] = this.local(ev);
      this.suivi.bas(ev.pointerId, x, y, ev.timeStamp, this.transfo);
      if (ev.pointerType === 'mouse') this.sourisBas(ev);
    });
    sur<PointerEvent>(this.hote, 'pointermove', (ev) => {
      const [x, y] = this.local(ev);
      this.suivi.bouge(ev.pointerId, x, y);
      if (ev.pointerType === 'mouse' && this.geste?.souris === ev.pointerId) this.sourisBouge(ev);
    });
    sur<PointerEvent>(this.hote, 'pointercancel', (ev) => {
      this.suivi.annule(ev.pointerId);
      if (ev.pointerType === 'mouse' && this.geste?.souris === ev.pointerId) this.finir(ev);
    });
    sur<PointerEvent>(this.hote, 'pointerup', (ev) => {
      const [x, y] = this.local(ev);
      // Fin du geste de la souris d'abord : le toucher est lu dans la vue du lever.
      if (ev.pointerType === 'mouse' && this.geste?.souris === ev.pointerId) this.finir(ev);
      const toucher = this.suivi.haut(ev.pointerId, x, y, ev.timeStamp, this.transfo);
      if (toucher) this.o.surToucher?.(toucher.x, toucher.y, ev);
    });
    // Doigts : les TouchEvent donnent tous les doigts posés d'un coup.
    const doigts = (ev: TouchEvent) => this.doigts(ev);
    sur<TouchEvent>(this.hote, 'touchstart', doigts, { passive: true });
    sur<TouchEvent>(this.hote, 'touchmove', doigts, { passive: true });
    sur<TouchEvent>(this.hote, 'touchend', doigts, { passive: true });
    sur<TouchEvent>(this.hote, 'touchcancel', doigts, { passive: true });
    sur<WheelEvent>(this.hote, 'wheel', (ev) => this.molette(ev), { passive: false });
    // Contexte du Canvas 2D rendu par le navigateur (après une perte : mémoire du GPU
    // reprise) : ses canvas reviennent vides, la carte entière est à redessiner, et
    // son motif de hachures à refaire (la signature seule ne le verrait pas).
    const rendu = () => {
      this.motif = this.creerMotif();
      this.signature = '';
      this.demander();
    };
    for (const c of [this.canvas2d, this.dessus]) if (c) sur(c, 'contextrestored', rendu);

    this.observateur = new ResizeObserver(() => this.redimensionner());
    if (o.leger) this.prendreLeger(o.leger);
  }

  /**
   * Formes de la carte allégée, servies aux gestes dès qu'elles arrivent :
   * au départ (rendu canvas), ou plus tard (rendu webgl replié pour de bon
   * sur le Canvas 2D, src/main.ts). Une seule fois.
   */
  prendreLeger(formes: Promise<{ pays: Map<string, Forme>; zones: Map<string, Forme> } | null>): void {
    void formes.then((f) => {
      if (!f || this.leger) return;
      this.complet ??= calque(this.o.donnees);
      this.leger = calqueLeger(this.o.donnees, this.complet, f);
    });
  }

  /** Un élément canvas de la carte (celui du Canvas 2D, ou d'un peintre adopté plus tard). */
  static element(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.className = 'carte-canvas';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'Carte du monde');
    return c;
  }

  get canvas(): HTMLCanvasElement {
    return this.elt;
  }

  get peintre(): Peintre | null {
    return this.peintreActif;
  }

  /**
   * Le peintre (WebGL) prend le relais du Canvas 2D, à la vue du moment :
   * rotation, zoom, marques, pastilles, anneaux et geste en cours sont ceux de
   * cette carte, seul l'élément canvas change. Son canvas est d'abord dessiné
   * hors du document (le GPU fait là le travail de la première image), puis à
   * l'image suivante il prend la place de celui du Canvas 2D et dessine la vue
   * de cette image-là : l'échange et le dessin tombent dans la même image,
   * sans saut. Le Canvas 2D reste dans le document, masqué (display: none),
   * sa mémoire rendue (0 × 0 pixels) : un doigt posé dessus avant l'échange
   * garde lui pour cible jusqu'au lever, et un élément retiré du document ne
   * ferait plus remonter ses touchmove et touchend jusqu'à l'hôte (le geste
   * en cours se serait figé). Gardé aussi pour revenirAuCanvas2D.
   */
  adopter(canvas: HTMLCanvasElement, peintre: Peintre): Promise<void> {
    const dimensionner = () => {
      canvas.width = Math.round(this.c.l * this.dpr);
      canvas.height = Math.round(this.c.h * this.dpr);
      canvas.style.width = `${this.c.l}px`;
      canvas.style.height = `${this.c.h}px`;
      peintre.dimensionner(this.c.l, this.c.h, this.dpr);
    };
    dimensionner();
    if (this.couche) peintre.prendreMers?.(this.couche);
    peintre.dessiner(this.etatImage());
    return new Promise((ok) =>
      requestAnimationFrame(() => {
        if (canvas.width !== Math.round(this.c.l * this.dpr) || canvas.height !== Math.round(this.c.h * this.dpr)) dimensionner();
        if (this.elt.isConnected) this.elt.after(canvas);
        else this.hote.prepend(canvas);
        masquer(this.elt);
        // Le peintre dessine aussi marques et pastilles.
        if (this.dessus) masquer(this.dessus);
        this.signature = '';
        this.elt = canvas;
        this.peintreActif = peintre;
        this.dessiner();
        ok();
      }),
    );
  }

  /** Une image à la prochaine occasion (contexte WebGL rendu). */
  redessiner(): void {
    this.demander();
  }

  /** Retour au Canvas 2D gardé par adopter (contexte WebGL perdu pour de bon) ; le peintre est détruit. */
  revenirAuCanvas2D(): boolean {
    const c2d = this.canvas2d;
    if (!c2d || !this.ctx || !this.peintreActif) return false;
    this.peintreActif.detruire();
    this.peintreActif = null;
    // Le canvas du WebGL reste masqué dans le document : il est peut-être la cible d'un doigt posé (adopter).
    masquer(this.elt);
    c2d.style.display = '';
    if (!c2d.isConnected) this.hote.prepend(c2d);
    if (this.dessus) {
      this.dessus.style.display = '';
      c2d.after(this.dessus);
    }
    this.elt = c2d;
    this.complet ??= calque(this.o.donnees);
    this.dimensionner();
    this.dessiner();
    return true;
  }

  /** Prépare les géométries et dessine la carte entière. */
  rendre(): ChronoRendu {
    const t0 = performance.now();
    if (this.peintre) this.peintre.preparer();
    else if (!this.complet) this.complet = calque(this.o.donnees);
    const t1 = performance.now();
    this.dimensionner();
    this.poser(placer(this.c, [this.v.r, 0], this.c.l / 2, this.c.h / 2, 1), true);
    if (!this.canvas.isConnected) this.hote.prepend(this.canvas);
    if (this.dessus && !this.peintre && !this.dessus.isConnected) this.canvas.after(this.dessus);
    this.dessiner();
    const t2 = performance.now();
    this.observateur.observe(this.hote);
    return { chemins_ms: t1 - t0, insertion_ms: t2 - t1, caracteres_chemins: 0 };
  }

  get projection(): GeoProjection {
    return this.proj;
  }

  get transfo(): Transfo {
    return transfoDe(this.v, this.c);
  }

  get nbPastilles(): number {
    return this.pastilles.length;
  }

  contexte(): ContexteCarte {
    return { proj: this.proj, t: this.transfo, entites: this.o.donnees.entites, pastilles: this.pastilles, acceptes: acceptesDe(this.o.donnees) };
  }

  contexteFinal(): ContexteCarte {
    const cible = this.vol?.cible;
    if (!cible) return this.contexte();
    return { proj: projectionDe(cible.r, this.c), t: transfoDe(cible, this.c), entites: this.o.donnees.entites, pastilles: this.pastilles, acceptes: acceptesDe(this.o.donnees) };
  }

  pick(x: number, y: number): ResultatPick | null {
    return pick(this.contexte(), x, y);
  }

  noter(cible: string, x: number, y: number, options?: OptionsNoter): Note {
    return noter(this.contexte(), cible, x, y, options);
  }

  ecran(id: string): [number, number] | null {
    const t = this.transfo;
    const p = this.pastilles.find((pa) => pa.id === id);
    if (p) return versEcran(t, p.bx, p.by);
    const li = this.lieux.get(id);
    const b = li && this.proj(li.lieu.point);
    return b ? versEcran(t, b[0], b[1]) : null;
  }

  zoomerSur(id: string): void {
    const v = this.vise(id, ZOOM_MAX);
    if (v) this.poserProgramme(v);
  }

  /**
   * « Voir » : le globe tourne et zoome en même temps jusqu'au pays (cadré
   * comme en SVG : centré dans la partie visible hVisible, au-dessus de la
   * barre de Nommer, son polygone principal entier), par l'interpolation de van Wijk et Nuij sur un plan où la
   * longitude du centre est déroulée (le plus court chemin autour du globe) :
   * sur un long trajet, elle recule d'abord. Carte allégée pendant le vol.
   */
  montrer(id: string, hVisible?: number): void {
    const cible = this.vise(id, ZOOM_MAX_MONTRER, hVisible, true);
    if (cible) this.voler(cible);
  }

  /** Une emprise entière dans la partie visible : le globe tourne jusqu'à son milieu (l'Océanie d'un seul tenant). */
  cadrer(e: Emprise, hVisible?: number): void {
    this.voler(viserEmprise(this.c, e, ZOOM_MAX_MONTRER, hVisible ?? this.c.h));
  }

  zoomerDe(facteur: number): void {
    if (this.geste) return;
    const base = this.vol?.cible ?? this.v;
    const k = bornerK(base.k * facteur, ZOOM_MAX);
    if (k === base.k) return;
    // Le point au centre de la carte y reste (sur son parallèle, comme la molette), la vue bornée comme après un geste.
    const centre = pointVirtuel(base, this.c, this.c.l / 2, this.c.h / 2);
    this.voler(placer(this.c, centre, this.c.l / 2, this.c.h / 2, k), DUREE_CRAN_MS, false);
  }

  vueEntiere(): void {
    if (this.geste) return;
    const base = this.vol?.cible ?? this.v;
    // La vue du départ (constructeur) : le méridien du segment Projection, au zoom 1.
    const depart: VueGlobe = { r: -ROTATIONS[this.o.projection][0], k: 1, y: bornerY(this.c, 1, 0) };
    if (base.k === depart.k && base.y === depart.y && ecartLon(base.r, depart.r) === 0) return;
    this.voler(depart, DUREE_TOUT_MS, false);
  }

  /**
   * Le vol de montrer(), de cadrer() et des boutons de zoom jusqu'à la vue
   * cible, d'une durée bornée par duree (ms). Libre (montrer, cadrer) : la
   * vue ignore la borne verticale ; sinon (boutons), bornée à chaque image.
   */
  private voler(cible: VueGlobe, duree: { min: number; max: number } = DUREE_MONTRER_MS, libre = true): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return this.poserProgramme(cible, libre);
    this.arreterVol();
    const depart = { ...this.v };
    const arrivee = { ...cible, r: depart.r + ecartLon(depart.r, cible.r) };
    const interp = interpolateZoom(versPlan(depart, this.c), versPlan(arrivee, this.c));
    this.vol = { interp, duree: Math.min(duree.max, Math.max(duree.min, interp.duration)), t0: null, cible, libre };
    this.demander();
  }

  /** Une image du vol : la vue à l'instant ts (première image : départ). */
  private avancerVol(ts: number): void {
    const vol = this.vol;
    if (!vol) return;
    vol.t0 ??= ts;
    const u = Math.min(1, Math.max(0, (ts - vol.t0) / vol.duree));
    // Même courbe que d3-transition (easeCubicInOut).
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    if (u >= 1) {
      this.vol = null;
      this.enMouvement = false;
      this.poser(vol.cible, false, vol.libre);
      return;
    }
    this.enMouvement = true;
    this.poser(dePlan(vol.interp(e) as [number, number, number], this.c, ZOOM_MAX, vol.libre), false, vol.libre);
  }

  /**
   * La vue qui met le point d'un pays au centre de l × h (h : la partie
   * visible), son plus grand polygone sur un quart de l'écran ; entier (ce
   * polygone tient à l'écran) si demandé, pour montrer() : le cadrage du SVG
   * (viserVue), sans la borne verticale, que zoom.transform n'applique pas non
   * plus en SVG.
   */
  private vise(id: string, kMax: number, hVisible = this.c.h, entier = false): VueGlobe | null {
    const li = this.lieux.get(id);
    if (!li) return null;
    const anneau = entier ? anneauPrincipal(li.forme, li.lieu.point) : null;
    return viserVue(this.c, li.lieu.point, tailleEcranPx(li.lieu, this.c.s, 1), kMax, hVisible, anneau, entier);
  }

  /**
   * Pose une transformation (sans geste : non comptée dans les mesures). Avec
   * r, la rotation ; sans r, celle du moment. Un x qui ne garde pas l'ovale
   * centré (pilote écrit pour la carte plane) devient une rotation : le point
   * qu'il mettait au centre de l'écran y reste.
   */
  zoomer(t: Transfo): void {
    this.poserProgramme(vueDeTransfo(t, this.c, this.v.r, ZOOM_MAX));
  }

  marquer(id: string, classe: string): void {
    let s = this.marques.get(id);
    if (!s) this.marques.set(id, (s = new Set()));
    s.add(classe);
    this.demander();
  }

  effacerMarques(): void {
    this.marques.clear();
    this.anneaux = [];
    this.demander();
  }

  anneau(id: string, classe: string, rayon_px = 16): void {
    this.anneaux.push({ id, classe, rayon_px });
    this.demander();
  }

  anneauEn(point: [number, number], classe: string, rayon_px = 16): void {
    this.anneaux.push({ id: '', classe, rayon_px, point });
    this.demander();
  }

  get nbTeintes(): number {
    return this.teintes?.size ?? 0;
  }

  get nbAnneaux(): number {
    return this.anneaux.length;
  }

  /**
   * Les mêmes teintes qu'avant : rien à redessiner (la carte entière se retrace
   * sinon). Une zone marine teintée fait tracer le calque marin par la couche
   * de base (seauxMers) ; sans elle, une partie de pays ne paie rien des mers.
   */
  teinter(t: Teintes | null): void {
    this.teintesDemandees = t;
    const mers = this.mers;
    const valides = new Map<string, number>();
    for (const [id, s] of t ?? []) {
      const n = seau(s);
      if (n !== null && (this.indices.has(id) || mers?.indices.has(id))) valides.set(id, n);
    }
    const avant = this.teintes;
    if ((avant?.size ?? 0) === valides.size && [...valides].every(([id, n]) => avant?.get(id) === n)) return;
    let seaux: Int8Array | null = null;
    let seauxMers: Int8Array | null = null;
    for (const [id, n] of valides) {
      const i = this.indices.get(id);
      if (i !== undefined) (seaux ??= new Int8Array(this.o.donnees.entites.length).fill(-1))[i] = n;
      else if (mers) (seauxMers ??= new Int8Array(mers.zones.length).fill(-1))[mers.indices.get(id) as number] = n;
    }
    [this.teintes, this.seaux, this.seauxMers] = [valides.size ? valides : null, seaux, seauxMers];
    this.versionTeintes++;
    this.demander();
  }

  prendreMers(c: CoucheMers): void {
    if (this.couche) return;
    if (!this.o.donnees.mers.length) this.o.donnees.mers = c.mers;
    this.couche = c;
    this.mers = calquesMers(c);
    this.lieux = indexLieux({ entites: this.o.donnees.entites, mers: c.mers });
    this.peintreActif?.prendreMers?.(c);
    // Les teintes déjà demandées : leurs zones marines, écartées sans la couche, comptent maintenant.
    this.teinter(this.teintesDemandees);
    this.signature = '';
    this.demander();
  }

  masquer(oui: boolean): void {
    this.masquee = oui;
    if (!oui) {
      this.redimensionner();
      this.demander();
    }
  }

  detruire(): void {
    this.observateur.disconnect();
    this.vol = null;
    cancelAnimationFrame(this.image);
    for (const [cible, type, l, opts] of this.ecouteurs) cible.removeEventListener(type, l, opts);
    this.peintre?.detruire();
    this.canvas.remove();
    this.canvas2d?.remove();
    this.dessus?.remove();
  }

  // --- vue -------------------------------------------------------------------

  /**
   * Change la vue : projection tournée et pastilles recalculées (pick et noter
   * les lisent). libre : la vue ignore la borne verticale (montrer).
   */
  private poser(v: VueGlobe, forcer = false, libre = false): void {
    const rChange = forcer || v.r !== this.v.r;
    const kChange = v.k !== this.v.k;
    this.v = v;
    this.libre = libre;
    if (rChange) this.proj = projectionDe(v.r, this.c);
    if (rChange || kChange) {
      this.pastilles = calculerPastilles(this.o.donnees.entites, this.proj, v.k);
      this.hote.dataset.pastilles = String(this.pastilles.length);
      this.hote.dataset.disques = String(this.pastilles.filter((p) => p.visible).length);
    }
  }

  private poserProgramme(v: VueGlobe, libre = false): void {
    this.arreterVol();
    this.enMouvement = false;
    this.poser(v, false, libre);
    this.demander();
  }

  /** Arrête un vol où il en est ; sa dernière image était peut-être allégée : la complète. */
  private arreterVol(): void {
    if (!this.vol) return;
    this.vol = null;
    this.enMouvement = false;
    this.demander();
  }

  private dimensionner(): void {
    const l = this.hote.clientWidth || window.innerWidth;
    const h = this.hote.clientHeight || window.innerHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.c = cadre(l, h);
    this.canvas.width = Math.round(l * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${l}px`;
    this.canvas.style.height = `${h}px`;
    if (this.dessus && !this.peintre) {
      this.dessus.width = this.canvas.width;
      this.dessus.height = this.canvas.height;
      this.dessus.style.width = `${l}px`;
      this.dessus.style.height = `${h}px`;
    }
    this.signature = '';
    this.peintre?.dimensionner(l, h, this.dpr);
    this.motif = this.creerMotif();
    this.proj = projectionDe(this.v.r, this.c);
  }

  /**
   * Nouvelle taille : même point au centre, même échelle à l'écran (k × échelle
   * de la projection), bornée au zoom 1. Un canvas se retrace sans coût de
   * tracés SVG : pas de seuil de 15 % sur la hauteur ici. La vue de montrer
   * (this.libre) reste hors de la borne verticale : la barre d'adresse du
   * téléphone qui va et vient, ou un aller-retour en paysage, ne ramène pas
   * sous la barre de Nommer la zone du sud que le vol a montée (le même centre
   * sans borne : le retour à la taille d'avant rend la vue d'avant) ; le geste
   * suivant la borne, comme en SVG.
   */
  private redimensionner(): void {
    if (this.masquee) return;
    const l = this.hote.clientWidth;
    const h = this.hote.clientHeight;
    if (!l || !h || (l === this.c.l && h === this.c.h && (window.devicePixelRatio || 1) === this.dpr)) return;
    const avant = this.c;
    const centre = pointVirtuel(this.v, avant, avant.l / 2, avant.h / 2);
    const echelle = this.v.k * avant.s;
    const libre = this.libre;
    this.dimensionner();
    this.poser(placer(this.c, centre, this.c.l / 2, this.c.h / 2, bornerK(echelle / this.c.s, ZOOM_MAX), libre), true, libre);
    this.dessiner();
  }

  // --- gestes ----------------------------------------------------------------

  private local(ev: { clientX: number; clientY: number }): [number, number] {
    const r = this.hote.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  private debuter(source: Event, souris: number | null): void {
    this.arreterVol();
    this.geste = { ancre: [0, 0], ids: '', k0: this.v.k, d0: 0, aBouge: false, souris, molette: 0 };
    this.o.gestes?.debut?.(this.transfo, source);
  }

  /** Ancre le geste sur les points posés : leur centre, et l'écart des deux premiers. */
  private ancrer(points: [number, number][], ids: string): void {
    const g = this.geste;
    if (!g) return;
    const [cx, cy] = centre(points);
    g.ancre = pointVirtuel(this.v, this.c, cx, cy);
    g.ids = ids;
    g.k0 = this.v.k;
    g.d0 = points.length >= 2 ? ecart(points) : 0;
  }

  /** Un mouvement : la vue qui remet l'ancre sous les doigts, au zoom du pincement. */
  private suivre(points: [number, number][], source: Event): void {
    const g = this.geste;
    if (!g) return;
    const [cx, cy] = centre(points);
    const k = points.length >= 2 && g.d0 > 0 ? bornerK((g.k0 * ecart(points)) / g.d0, ZOOM_MAX) : this.v.k;
    const v = placer(this.c, g.ancre, cx, cy, k);
    if (v.r === this.v.r && v.k === this.v.k && v.y === this.v.y) return;
    g.aBouge = true;
    this.enMouvement = true;
    this.poser(v);
    this.o.gestes?.mouvement?.(this.transfo, source);
    this.demander();
  }

  private finir(source: Event): void {
    const g = this.geste;
    if (!g) return;
    clearTimeout(g.molette);
    this.geste = null;
    const t0 = performance.now();
    // La carte complète, tout de suite : le dessin de la fin est dans script_ms.
    // Un peintre sans carte allégée n'a rien à refaire : l'image en attente suffit.
    this.enMouvement = false;
    if (g.aBouge && (this.peintre?.allegeEnMouvement ?? true)) this.dessiner();
    const script_ms = performance.now() - t0;
    this.o.gestes?.fin?.({ a_bouge: g.aBouge, source, script_ms, image: deuxImages().then(() => performance.now() - t0) });
  }

  private doigts(ev: TouchEvent): void {
    const points: [number, number][] = [];
    const ids: number[] = [];
    // Deux doigts au plus, comme d3-zoom : un troisième ne change rien.
    for (let i = 0; i < Math.min(2, ev.touches.length); i++) {
      const t = ev.touches[i];
      if (!t) continue;
      points.push(this.local(t));
      ids.push(t.identifier);
    }
    if (!points.length) {
      if (this.geste && this.geste.souris === null) this.finir(ev);
      return;
    }
    if (!this.geste) this.debuter(ev, null);
    else if (this.geste.souris !== null) return;
    const cle = ids.join(',');
    if (cle !== this.geste?.ids) this.ancrer(points, cle);
    else if (ev.type === 'touchmove') this.suivre(points, ev);
  }

  private sourisBas(ev: PointerEvent): void {
    if (this.geste) return;
    this.hote.setPointerCapture?.(ev.pointerId);
    this.debuter(ev, ev.pointerId);
    this.ancrer([this.local(ev)], String(ev.pointerId));
  }

  private sourisBouge(ev: PointerEvent): void {
    this.suivre([this.local(ev)], ev);
  }

  private molette(ev: WheelEvent): void {
    ev.preventDefault();
    if (this.geste && this.geste.souris !== null) return;
    if (this.geste?.ids && this.geste.ids !== 'molette') return; // doigts posés
    if (!this.geste) this.debuter(ev, null);
    const g = this.geste;
    if (!g) return;
    const p = this.local(ev);
    // Le point sous la souris reste sous la souris ; même pas que d3-zoom.
    this.ancrer([p], 'molette');
    const facteur = Math.pow(2, -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.002));
    g.k0 = this.v.k;
    const v = placer(this.c, g.ancre, p[0], p[1], bornerK(this.v.k * facteur, ZOOM_MAX));
    if (v.k !== this.v.k || v.y !== this.v.y || v.r !== this.v.r) {
      g.aBouge = true;
      this.enMouvement = true;
      this.poser(v);
      this.o.gestes?.mouvement?.(this.transfo, ev);
      this.demander();
    }
    clearTimeout(g.molette);
    g.molette = window.setTimeout(() => this.finir(ev), FIN_MOLETTE_MS);
  }

  // --- dessin ----------------------------------------------------------------

  /** Un dessin à la prochaine image (un seul, quel que soit le nombre de demandes). */
  private demander(): void {
    if (this.image || this.masquee) return;
    this.image = requestAnimationFrame((ts) => {
      this.image = 0;
      this.avancerVol(ts);
      this.dessiner();
      if (this.geste?.aBouge && this.dernier) this.o.gestes?.dessin?.(this.dernier.ms);
      if (this.vol) this.demander();
    });
  }

  private creerMotif(): CanvasPattern | null {
    if (!this.ctx) return null;
    const cote = Math.max(1, Math.round(PAS_HACHURES * this.dpr));
    const m = document.createElement('canvas');
    m.width = cote;
    m.height = cote;
    const c = m.getContext('2d');
    if (!c) return null;
    // Un trait vertical de 1,2 px à 1 px du bord, tourné de 45° : le motif du SVG.
    c.strokeStyle = this.couleurs.hachure;
    c.lineWidth = 1.2 * this.dpr;
    c.beginPath();
    c.moveTo(this.dpr, 0);
    c.lineTo(this.dpr, cote);
    c.stroke();
    const motif = this.ctx.createPattern(m, 'repeat');
    // Le motif vit dans l'espace du contexte (mis à l'échelle du dpr) : pas constant à
    // l'écran ; tourné et ancré à chaque remplissage (dessiner).
    return motif;
  }

  /**
   * Dessine la vue courante (synchrone) : la carte, si ce qu'elle montre a
   * changé (vue, taille, allégée ou complète), puis la couche du dessus. Un
   * toucher (marquer, effacerMarques, anneau) ne change que celle-ci. Au
   * ralenti ×4 sur le PC, retracer et rastériser toute la carte pour colorer
   * un pays prenait ~16 ms de script et ~55 ms de commit (rastérisation
   * logicielle du canvas) : toucher 72 → 32 ms (Event Timing, médiane). Sur
   * l'A37 (GPU), le gain est moindre : par le vrai chemin d'Android (adb
   * shell input tap), Chrome 96 → 80 ms en médiane, ~15 ms d'entrée et ~45
   * ms d'affichage à 60 Hz restant après le script (06/11,
   * docs/mesures/j0/toucher/).
   */
  private dessiner(): void {
    if (this.masquee) return;
    if (this.peintre) return this.peindre(this.peintre);
    const ctx = this.ctx;
    if (!this.complet || !ctx) return;
    cancelAnimationFrame(this.image);
    this.image = 0;
    const t0 = performance.now();
    const { c, v } = this;
    const im = image(v, c, regionVisible(v, c, MARGE_PX), this.enMouvement);
    // Le calque marin tracé par la couche de base : une teinte de mer le demande.
    const mersTracees = this.seauxMers ? this.mers : null;
    const leger = this.enMouvement && this.leger !== null && sommetsVisibles(im, this.complet, mersTracees?.complet) > BUDGET_SOMMETS;
    const cq = leger && this.leger ? this.leger : this.complet;
    // Les mers suivent la bascule des terres : 50 km avec l'allégée, 10 km sinon.
    const cm = this.mers ? (leger ? this.mers.leger : this.mers.complet) : null;
    // En mouvement, la carte est tracée plus grossièrement (dessin.ts) : la fin d'un geste la retrace.
    const signature = `${v.r} ${v.k} ${v.y} ${c.l} ${c.h} ${this.dpr} ${leger ? 'leger' : 'complet'} ${im.mouvement} t${this.versionTeintes}`;
    const carte = signature !== this.signature || !this.ctxDessus;
    if (carte) this.dessinerCarte(ctx, im, cq, mersTracees && cm);
    this.signature = signature;
    const stats = { parties: im.parties, sommets: im.sommets, emis: im.emis, copies: im.copies, exactes: im.exactes, minuscules: im.minuscules };
    const t1 = performance.now();
    // Sans couche du dessus (getContext refusé), tout va sur la carte, par-dessus.
    const dessus = this.ctxDessus ?? ctx;
    if (this.ctxDessus) {
      this.ctxDessus.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctxDessus.clearRect(0, 0, c.l, c.h);
    }
    this.dessinerMarques(dessus, im, cq, cm);
    this.dessinerPastilles(dessus);
    const ms = performance.now() - t0;
    if (!carte && this.dernier) {
      // Couche du dessus seule : les compteurs de la carte restent ceux de son dernier dessin.
      this.dernier = { ...this.dernier, ms, dessus_ms: performance.now() - t1, carte: false };
      return;
    }
    this.dernier = { ms, trace_ms: this.traceCarte_ms, leger, ...stats, dessus_ms: performance.now() - t1, carte: true };
    this.hote.dataset.dessin = leger ? 'leger' : 'complet';
  }

  /** Durée du tracé (script, sans le dessin) du dernier dessin de la carte. */
  private traceCarte_ms = 0;

  /**
   * La carte : mer, zones marines teintées (cm : le calque marin, null quand
   * aucune teinte ne le demande), terres, hachures et frontières, sans marques
   * ni pastilles (couche du dessus).
   */
  private dessinerCarte(ctx: CanvasRenderingContext2D, im: ImageTrace, cq: Calque, cm: Calque | null): void {
    const t0 = performance.now();
    const { c, v } = this;
    const coul = this.couleurs;
    const entites = this.o.donnees.entites;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, c.l, c.h);
    const ovale = new Path2D();
    tracerOvale(ovale, im);
    ctx.fillStyle = coul.mer;
    ctx.fill(ovale);
    if (cm && this.seauxMers) this.peindreMers(ctx, im, cm, this.seauxMers);

    // Terres : un chemin pour tout ce qui n'a pas de couture (rempli puis tracé),
    // les coutures à part (remplies, tracées sans le côté qui suit l'antiméridien),
    // et de même les parties qui passent la coupure (tracées sans leurs segments
    // ramenés sur le bord de l'ovale, dessin.ts). Un chemin de chaque sorte par
    // couleur (indice 0 : --terre ; 1 + s : le seau s de la carte de la mémoire),
    // à la carte complète comme à l'allégée : un remplissage par couleur, et
    // chaque partie tracée une seule fois, ses frontières comprises (un trait
    // par chemin plutôt qu'un chemin de plus qui les réunirait : même nombre de
    // segments, sans retracer en JS les 125 000 sommets du zoom 1).
    const terres: Path2D[] = [new Path2D()];
    const coutures: Path2D[] = [];
    const couturesContour = new Path2D();
    const hachures = new Map<string, { chemin: Path2D; ancre: [number, number] | null }>();
    const seaux = this.seaux;
    let avecCoutures = false;
    parcourir(im, cq.pays, cq.groupes?.pays, (p, i) => {
      const e = entites[i];
      if (!e) return;
      const s = seaux ? (seaux[i] as number) + 1 : 0;
      if (aCoupure(p, v.r)) {
        avecCoutures = true;
        tracerPartie((coutures[s] ??= new Path2D()), im, p);
        tracerPartie(couturesContour, im, p, true);
      } else tracerPartie((terres[s] ??= new Path2D()), im, p);
      // Les entités au statut « conteste » ne sont pas dans la couche contestees : on les hachure aussi.
      if (e.pays.statut === 'conteste') this.hachurer(hachures, im, `p${i}`, i, p);
    });
    parcourir(im, cq.zones, cq.groupes?.zones, (p, i) => this.hachurer(hachures, im, `z${i}`, -1 - i, p));
    this.traceCarte_ms = performance.now() - t0;

    const couleur = (s: number) => (s ? (coul.memoire[s - 1] ?? coul.terre) : coul.terre);
    for (const chemins of [terres, coutures]) {
      chemins.forEach((chemin, s) => {
        ctx.fillStyle = couleur(s);
        ctx.fill(chemin);
      });
    }
    this.peindreHachures(ctx, hachures);
    this.tracerFrontieres(ctx, terres, avecCoutures ? couturesContour : null, im.mouvement);
  }

  /**
   * Le calque marin sur la couche de base, entre l'ovale et les terres : un
   * Path2D par seau, rempli, sans contour ni frontière entre mers (D45 b) ;
   * une zone sans teinte n'est pas tracée (l'ovale montre la mer).
   */
  private peindreMers(ctx: CanvasRenderingContext2D, im: ImageTrace, cm: Calque, seaux: Int8Array): void {
    const chemins: Path2D[] = [];
    parcourir(im, cm.pays, undefined, (p, i) => {
      const s = seaux[i] as number;
      if (s >= 0) tracerPartie((chemins[s] ??= new Path2D()), im, p);
    });
    // forEach saute les seaux sans zone à l'écran.
    chemins.forEach((chemin, s) => {
      ctx.fillStyle = this.couleurs.memoireMers[s] ?? this.couleurs.mer;
      ctx.fill(chemin);
    });
  }

  /**
   * Hachures : un chemin par entité ou zone (cle), son motif ancré sur elle
   * (ancre ; liste : i ≥ 0 une entité, -1 - i la zone i). Une partie de moins
   * d'un demi-pas à l'écran n'en montrerait pas un trait : sautée (au zoom 1,
   * une trentaine de remplissages en moins).
   */
  private hachurer(hachures: Map<string, { chemin: Path2D; ancre: [number, number] | null }>, im: ImageTrace, cle: string, liste: number, p: Partie): void {
    if (im.K * p.taille < PAS_HACHURES / 2 || !this.complet) return;
    let h = hachures.get(cle);
    if (!h) {
      const ps = liste >= 0 ? this.complet.pays[liste] : this.complet.zones[-1 - liste];
      hachures.set(cle, (h = { chemin: new Path2D(), ancre: ancre(im, ps ?? []) }));
    }
    tracerPartie(h.chemin, im, p);
  }

  /**
   * Le motif de chaque zone est ancré sur elle (au pixel physique près) : fixe
   * à l'écran, il glissait sous la carte pendant un geste. Ancré sur la carte
   * complète, il ne saute pas quand l'allégée prend le relais.
   */
  private peindreHachures(ctx: CanvasRenderingContext2D, hachures: Map<string, { chemin: Path2D; ancre: [number, number] | null }>): void {
    if (!this.motif) return;
    for (const { chemin, ancre: a } of hachures.values()) {
      const [ax, ay] = a ? [Math.round(a[0] * this.dpr) / this.dpr, Math.round(a[1] * this.dpr) / this.dpr] : [0, 0];
      this.motif.setTransform(new DOMMatrix().translateSelf(ax, ay).rotateSelf(45).scaleSelf(1 / this.dpr));
      ctx.fillStyle = this.motif;
      ctx.fill(chemin);
    }
  }

  /**
   * Frontières d'un pixel physique : sous 1 px, Skia trace un trait fin
   * (hairline) sans calculer d'enveloppe. Le trait de 0,6 px du SVG (1,7 px
   * physique, joints ronds) faisait perdre la moitié des images d'une
   * rotation au zoom 1 sur le PC (rastérisation logicielle de
   * chrome-headless-shell), 1 px aucune. Plus opaque (--frontiere-fine) pour
   * garder la même encre par unité de longueur. Ce trait fin reste celui du
   * mouvement ; à l'arrêt, les frontières prennent --frontiere-repos px CSS
   * (#28 : lisibles en plein soleil), une seule image à la fin du geste.
   */
  private tracerFrontieres(ctx: CanvasRenderingContext2D, chemins: readonly Path2D[], coutures: Path2D | null, mouvement: boolean): void {
    const epais = !mouvement && this.couleurs.repos * this.dpr > 1;
    ctx.strokeStyle = this.couleurs.frontiere;
    ctx.lineWidth = epais ? this.couleurs.repos : 1 / this.dpr;
    ctx.lineJoin = epais ? 'round' : 'miter';
    // forEach saute les trous du tableau (couleurs sans partie à l'écran).
    chemins.forEach((c) => ctx.stroke(c));
    if (coutures) ctx.stroke(coutures);
  }

  /**
   * Couche du dessus, marques : la couleur de chaque marque, les hachures qui
   * tombent dessus (une entité contestée marquée, ou une zone contestée en
   * elle : peintes sous ses frontières sur la carte, comme avant la couche du
   * dessus) et ses frontières, puis le contour de la zone fausse, entier,
   * par-dessus (en SVG, sa moitié extérieure peut passer sous une voisine).
   * Au repos comme pendant un geste, les parties sont celles de la carte
   * dessinée (allégée ou complète). Les marques des mers d'abord (cm : le
   * calque marin de cette image), effacées sous les terres, puis celles des
   * pays (dessinerMarquesMers).
   */
  private dessinerMarques(ctx: CanvasRenderingContext2D, im: ImageTrace, cq: Calque, cm: Calque | null): void {
    if (!this.marques.size) return;
    if (cm) this.dessinerMarquesMers(ctx, im, cq, cm);
    const coul = this.couleurs;
    const { v } = this;
    const parClasse = new Map<string, Path2D>();
    const toutes = new Path2D();
    const contour = new Path2D();
    const contourCoutures = new Path2D();
    let avecCoutures = false;
    let contourFaux: Path2D | null = null;
    // Emprise (degrés) des parties marquées : les hachures à repeindre.
    let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [id, classes] of this.marques) {
      const i = this.indices.get(id);
      if (i === undefined) continue;
      for (const p of cq.pays[i] ?? []) {
        // Ce que parcourir écarte : hors de l'écran, minuscule ou que le repos ne montre pas.
        if (!visible(im, p) || (im.mouvement && (im.K * p.taille < TAILLE_MIN_PX || im.K * (p.source ?? p).ecart < SEUIL_PX))) continue;
        for (const cl of classes) {
          if (!coul.marques[cl]) continue;
          let chemin = parClasse.get(cl);
          if (!chemin) parClasse.set(cl, (chemin = new Path2D()));
          tracerPartie(chemin, im, p);
        }
        tracerPartie(toutes, im, p);
        const coupure = aCoupure(p, v.r);
        if (coupure) {
          avecCoutures = true;
          tracerPartie(contourCoutures, im, p, true);
        } else tracerPartie(contour, im, p);
        if (classes.has('faux')) tracerPartie((contourFaux ??= new Path2D()), im, p, coupure);
        [o, s, e, n] = [Math.min(o, p.o), Math.min(s, p.s), Math.max(e, p.e), Math.max(n, p.n)];
      }
    }
    if (o > e) return;
    for (const [cl, chemin] of parClasse) {
      ctx.fillStyle = coul.marques[cl] as string;
      ctx.fill(chemin);
    }
    // Hachures sous les marques : seulement dans les parties marquées.
    const hachures = new Map<string, { chemin: Path2D; ancre: [number, number] | null }>();
    const rencontre = (p: Partie) => p.o <= e && p.e >= o && p.s <= n && p.n >= s;
    this.o.donnees.entites.forEach((en, i) => {
      if (en.pays.statut !== 'conteste') return;
      for (const p of cq.pays[i] ?? []) if (rencontre(p) && visible(im, p)) this.hachurer(hachures, im, `p${i}`, i, p);
    });
    cq.zones.forEach((ps, i) => {
      for (const p of ps) if (rencontre(p) && visible(im, p)) this.hachurer(hachures, im, `z${i}`, -1 - i, p);
    });
    if (hachures.size) {
      ctx.save();
      ctx.clip(toutes);
      this.peindreHachures(ctx, hachures);
      ctx.restore();
    }
    this.tracerFrontieres(ctx, [contour], avecCoutures ? contourCoutures : null, im.mouvement);
    if (contourFaux) {
      ctx.strokeStyle = coul.texte;
      ctx.lineWidth = TRAIT_FAUX_PX;
      ctx.lineJoin = 'round';
      ctx.stroke(contourFaux);
    }
  }

  /**
   * Couche du dessus, marques des mers (étude J2, § 4.3), dans cet ordre :
   * chaque zone marquée (et ce qu'elle allume : zonesAllumees) de la couleur
   * de sa marque sur l'eau, et le contour de la zone fausse ; puis leur
   * effacement sous les terres de leur emprise (destination-out : les terres
   * de la carte, leurs frontières et leurs hachures redeviennent visibles,
   * la côte entière) ; les marques des pays viennent ensuite. Dans l'autre
   * ordre, l'effacement retirerait une marque de pays déjà peinte. La mer
   * n'est pas marquée sur la carte de base : chaque toucher la redessinerait
   * entière.
   */
  private dessinerMarquesMers(ctx: CanvasRenderingContext2D, im: ImageTrace, cq: Calque, cm: Calque): void {
    const mers = this.mers;
    if (!mers) return;
    const coul = this.couleurs;
    const { v } = this;
    const contours = cm === mers.leger ? mers.contoursLegers : mers.contours;
    const parClasse = new Map<string, Path2D>();
    let contourFaux: Path2D | null = null;
    let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    const montree = (p: Partie) => visible(im, p) && !(im.mouvement && (im.K * p.taille < TAILLE_MIN_PX || im.K * (p.source ?? p).ecart < SEUIL_PX));
    for (const [id, classes] of this.marques) {
      const j = mers.indices.get(id);
      if (j === undefined) continue;
      for (const z of zonesAllumees(id, mers.zones)) {
        for (const p of cm.pays[mers.indices.get(z) as number] ?? []) {
          if (!montree(p)) continue;
          for (const cl of classes) {
            if (!coul.marquesMers[cl]) continue;
            let chemin = parClasse.get(cl);
            if (!chemin) parClasse.set(cl, (chemin = new Path2D()));
            tracerPartie(chemin, im, p);
          }
          [o, s, e, n] = [Math.min(o, p.o), Math.min(s, p.s), Math.max(e, p.e), Math.max(n, p.n)];
        }
      }
      // Le contour de l'union allumée (l'Atlantique et les Sargasses : un seul bord).
      if (classes.has('faux')) for (const p of contours[j] ?? []) if (montree(p)) tracerPartie((contourFaux ??= new Path2D()), im, p, aCoupure(p, v.r));
    }
    if (o > e) return;
    for (const [cl, chemin] of parClasse) {
      ctx.fillStyle = coul.marquesMers[cl] as string;
      ctx.fill(chemin);
    }
    if (contourFaux) {
      ctx.strokeStyle = coul.texte;
      ctx.lineWidth = TRAIT_FAUX_PX;
      ctx.lineJoin = 'round';
      ctx.stroke(contourFaux);
    }
    // Effacement sous les terres de l'emprise : remplies, et bordées de la largeur des frontières (la côte entière reste visible).
    const terres = new Path2D();
    let avecTerres = false;
    parcourir(im, cq.pays, cq.groupes?.pays, (p) => {
      if (p.o > e || p.e < o || p.s > n || p.n < s) return;
      avecTerres = true;
      tracerPartie(terres, im, p);
    });
    if (!avecTerres) return;
    const epais = !im.mouvement && coul.repos * this.dpr > 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fill(terres);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = epais ? coul.repos : 1 / this.dpr;
    ctx.lineJoin = epais ? 'round' : 'miter';
    ctx.stroke(terres);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Une image dessinée par le peintre ; sa durée est le script de l'image (mesures). */
  private peindre(p: Peintre): void {
    cancelAnimationFrame(this.image);
    this.image = 0;
    const t0 = performance.now();
    const stats = p.dessiner(this.etatImage());
    this.dernier = { ms: performance.now() - t0, ...stats };
    this.hote.dataset.dessin = 'complet';
  }

  private etatImage(): EtatImage {
    return {
      v: this.v,
      c: this.c,
      t: this.transfo,
      proj: this.proj,
      enMouvement: this.enMouvement,
      pastilles: this.pastilles,
      marques: this.marques,
      anneaux: this.anneaux,
      teintes: this.teintes,
    };
  }

  /**
   * Disques des pastilles (rayon constant à l'écran) et anneaux. Chaque disque
   * est rempli puis bordé avant le suivant, qui le recouvre, comme les cercles
   * du SVG et les instances du WebGL : remplis tous puis bordés tous, leurs
   * bords passaient sur les disques voisins (en Europe au zoom 1, des anneaux
   * noirs emmêlés). Une centaine de disques au plus à l'écran : deux appels
   * chacun.
   */
  private dessinerPastilles(ctx: CanvasRenderingContext2D): void {
    const { c } = this;
    const t = this.transfo;
    const coul = this.couleurs;
    const r = PASTILLE.rayon_visible_px;
    ctx.lineWidth = 1;
    ctx.strokeStyle = coul.bord;
    for (const p of this.pastilles) {
      if (!p.visible) continue;
      const [x, y] = versEcran(t, p.bx, p.by);
      if (x < -r || y < -r || x > c.l + r || y > c.h + r) continue;
      // La pastille d'un micro-État : la teinte de son pays, puis sa marque par-dessus.
      const s = this.teintes?.get(p.id);
      let couleur = (s !== undefined && coul.memoire[s]) || coul.pastille;
      const classes = this.marques.get(p.id);
      for (const cl of classes ?? []) couleur = coul.marques[cl] ?? couleur;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TOUR);
      ctx.fillStyle = couleur;
      ctx.fill();
      if (classes?.has('faux')) {
        ctx.lineWidth = TRAIT_FAUX_PX;
        ctx.strokeStyle = coul.texte;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = coul.bord;
      } else ctx.stroke();
    }
    for (const a of this.anneaux) {
      const ll = pointAnneau(a, this.o.donnees.entites);
      const b = ll && this.proj(ll);
      if (!b) continue;
      const [x, y] = versEcran(t, b[0], b[1]);
      ctx.beginPath();
      ctx.arc(x, y, a.rayon_px, 0, TOUR);
      ctx.lineWidth = 2;
      ctx.strokeStyle = coul.marques[a.classe] ?? coul.marques.juste ?? coul.pastille;
      ctx.stroke();
    }
  }
}

/** Un canvas qui ne dessine plus : masqué et sans pixels, mais toujours dans le document (adopter). */
function masquer(c: HTMLCanvasElement): void {
  c.style.display = 'none';
  c.width = 0;
  c.height = 0;
}

function centre(points: readonly [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

function ecart(points: readonly [number, number][]): number {
  const [a, b] = points;
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
}
