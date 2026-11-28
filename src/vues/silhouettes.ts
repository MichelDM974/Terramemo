// Les silhouettes du J4 (étude docs/etudes/2026-11-25-j4-conception.md, § 6, lot 1 ; D618 à D621), dans un morceau
// chargé à la demande (chargerSilhouettes de sujets.ts, avec public/geo/silhouettes.json) : rien au premier
// affichage (décision « Morceau JS principal sous 500 Ko »).
//
// Le dessin (§ 6.3, D620 a) : le tracé de la carte (monde.topo.json, ~2 km), déjà en mémoire, sans ses parties
// lointaines (silhouettes.json, geodata/silhouettes.mjs : la Guyane pour la France, Hawaï pour les États-Unis) ;
// une projection azimutale équivalente centrée sur le pays (l'Equal Earth du monde déformerait la Russie et le
// Canada), nord en haut, sans rotation, à sa propre échelle : chaque silhouette remplit son cadre (la taille
// serait un indice). Le tracé de fait, avec ses zones contestées hachurées comme sur la carte (celles qu'il
// tient : Contestee.dans). Chaque dessin est gardé ; tous se calculent d'avance en temps libre dès le chargement
// (prechauffer), un pays par moment libre, daté en performance.measure « silhouette:<id> » (S605 : le pilote y
// rattache un à-coup sur l'A37).
//
// Le rendu (sujets.ts, RenduSujet) : « Pays de cette silhouette : » et le dessin (Trouver, les épreuves) ; le
// dessin dans la barre au lieu de la zone allumée (Reconnaître, le QCM, la carte retournée : question()), quatre
// noms ; « Révéler » donne le nom ; une erreur montre les deux silhouettes nommées (comparaison(), D621 a). Ni
// flèche, ni distance au pays proposé, ni partie du jour (critique du 04/11, I1). Texte alternatif neutre
// (« Silhouette à reconnaître ») : jamais le nom avant la réponse ; une description de chaque forme n'est pas
// faite (§ 10), le « ? » des exercices le dit (aideSujet de jouer.ts).
// Leurres : en Entraînement, ceux de toujours (les voisins, puis les plus proches) ; au quiz difficile et
// expert, les formes proches (proches, generateurSilhouettes de quiz/generateurs.ts).
//
// Ce morceau n'importe rien du morceau principal ni de d3-geo, sinon des types : ce qu'il en emploie lui est
// donné à l'installation (Outils, sujets.ts chargerSilhouettes). Un import de valeur (d3-geo, sujets.ts,
// vignettes.ts, formes.ts…) faisait sortir les modules partagés dans des morceaux préchargés au démarrage
// (mesuré au build : le morceau principal baissait sans que rien ne parte à la demande).
import type { geoAzimuthalEqualArea, geoCentroid } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { DonneesCarte } from '../map/donnees';
import type { Entite, Forme, Lieu } from '../map/types';
import type { aSilhouette } from '../srs/fiches';
import type { formePays } from './formes';
import type { Contenu, Dessin, Fabrique, nomDe } from './sujets';
import type { remplir, Textes } from './textes';
import type { tracer } from './vignettes';

/** Ce que le morceau principal lui donne (sujets.ts) : d3-geo, le tracé des vignettes, les noms et les textes. */
export interface Outils {
  geoAzimuthalEqualArea: typeof geoAzimuthalEqualArea;
  geoCentroid: typeof geoCentroid;
  tracer: typeof tracer;
  nomDe: typeof nomDe;
  formePays: typeof formePays;
  remplir: typeof remplir;
  textes: Textes['silhouettes'];
  aSilhouette: typeof aSilhouette;
  sansSilhouette: ReadonlySet<string>;
}

/** Le cadre d'un dessin, en unités (viewBox carré) ; la marge laissée autour du pays. */
export const COTE = 100;
const MARGE = 2;
/** Simplification du tracé, en unités du cadre (≈ un pixel CSS à 96 px de côté) : un point à moins de TOLERANCE du précédent sauté, un îlot de moins d'AIRE_MIN retiré. */
const TOLERANCE = 0.4;
const AIRE_MIN = 0.15;

/** public/geo/silhouettes.json (geodata/silhouettes.mjs). */
export interface DonneesSilhouettes {
  v: 1;
  seuil: number;
  /** Par pays, les indices des polygones de sa forme retirés de sa silhouette (parties lointaines). */
  retirees: Readonly<Record<string, readonly number[]>>;
  /** Les paires de formes proches [A, B, recouvrement], A < B, une fois. */
  paires: readonly (readonly [string, string, number])[];
}

/** Les formes proches d'un pays, de la plus proche à la moins proche (puis par id) ; le recouvrement d'une paire (undefined : pas proches). */
export interface ProchesSilhouettes {
  seuil: number;
  de(id: string): readonly string[];
  score(a: string, b: string): number | undefined;
}

/** Ce que le morceau apporte au reste de l'appli, une fois installé sur ses données. */
export interface ModuleSilhouettes {
  donnees: DonneesSilhouettes;
  /** Le rendu du sujet (sujets.ts, FABRIQUES). */
  fabrique: Fabrique;
  proches: ProchesSilhouettes;
  /** Le dessin d'une entité ; null si elle n'a aucun tracé. */
  dessin(e: Entite<Lieu>, contestees: DonneesCarte['contestees']): Dessin | null;
  /** Calcule d'avance les dessins de ces entités, un par moment libre (gardés). */
  prechauffer(entites: readonly Entite<Lieu>[], contestees: DonneesCarte['contestees']): void;
}

/** silhouettes.json lu ; lève sur une version inconnue ou une forme fausse. */
export function lireSilhouettes(brut: unknown): DonneesSilhouettes {
  const d = brut as Partial<DonneesSilhouettes> | null;
  if (!d || d.v !== 1 || typeof d.seuil !== 'number' || !d.retirees || typeof d.retirees !== 'object' || !Array.isArray(d.paires)) {
    throw new Error('silhouettes.json : version ou forme inconnue');
  }
  return d as DonneesSilhouettes;
}

/** Les formes proches, rangées par pays. */
export function prochesDe(d: Pick<DonneesSilhouettes, 'seuil' | 'paires'>): ProchesSilhouettes {
  const par = new Map<string, { id: string; s: number }[]>();
  const ajouter = (a: string, b: string, s: number) => {
    let l = par.get(a);
    if (!l) par.set(a, (l = []));
    l.push({ id: b, s });
  };
  for (const [a, b, s] of d.paires) {
    ajouter(a, b, s);
    ajouter(b, a, s);
  }
  const ordre = new Map([...par].map(([id, l]) => [id, l.sort((x, y) => y.s - x.s || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))]));
  return {
    seuil: d.seuil,
    de: (id) => (ordre.get(id) ?? []).map((x) => x.id),
    score: (a, b) => ordre.get(a)?.find((x) => x.id === b)?.s,
  };
}

/** La forme d'une entité sans les polygones retirés (MultiPolygon) ; null s'il ne reste rien. */
export function formeGardee(forme: Forme, retirees: readonly number[] = []): Feature<MultiPolygon> | null {
  const g = forme.geometry;
  const polys: Polygon['coordinates'][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const r = new Set(retirees);
  const gardes = polys.filter((_, i) => !r.has(i));
  return gardes.length ? { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: gardes } } : null;
}

/** Le dessin d'une forme (sans ses parties retirées), et ses zones hachurées, dans un cadre de COTE × COTE. */
export function dessiner(o: Pick<Outils, 'geoAzimuthalEqualArea' | 'geoCentroid' | 'tracer'>, forme: Forme, retirees: readonly number[] = [], zones: readonly Forme[] = []): Dessin | null {
  const f = formeGardee(forme, retirees);
  if (!f) return null;
  const [lon, lat] = o.geoCentroid(f);
  const p = o
    .geoAzimuthalEqualArea()
    .rotate([-lon, -lat])
    .fitExtent(
      [
        [MARGE, MARGE],
        [COTE - MARGE, COTE - MARGE],
      ],
      f,
    );
  const trace = o.tracer(p, f, TOLERANCE, AIRE_MIN);
  if (!trace) return null;
  return { cadre: `0 0 ${COTE} ${COTE}`, trace, hachures: zones.map((z) => o.tracer(p, z, TOLERANCE, AIRE_MIN)).join('') };
}

/** Le morceau installé sur ses données (silhouettes.json lu) : rendu, formes proches, dessins gardés. */
export function installer(brut: unknown, o: Outils): ModuleSilhouettes {
  const { aSilhouette, formePays, nomDe, remplir } = o;
  const T = o.textes;
  const donnees = lireSilhouettes(brut);
  const proches = prochesDe(donnees);
  /** Les dessins faits, par forme (celles du monde chargé ; un autre jeu de données, les tests, a les siens). */
  const faits = new WeakMap<Forme, Dessin | null>();

  /** Les zones contestées que l'entité tient (hachurées sur sa silhouette, comme sur la carte). */
  const zonesDe = (id: string, contestees: DonneesCarte['contestees']) => contestees.filter((z) => z.info?.dans.includes(id)).map((z) => z.forme);

  function dessin(e: Entite<Lieu>, contestees: DonneesCarte['contestees']): Dessin | null {
    if (faits.has(e.forme)) return faits.get(e.forme) ?? null;
    const t0 = performance.now();
    const d = dessiner(o, e.forme, donnees.retirees[e.pays.id] ?? [], zonesDe(e.pays.id, contestees));
    faits.set(e.forme, d);
    try {
      performance.measure(`silhouette:${e.pays.id}`, { start: t0, end: performance.now() });
    } catch {
      // Sans performance.measure (vieux moteur) : pas de mesure, le dessin reste.
    }
    return d;
  }

  function prechauffer(entites: readonly Entite<Lieu>[], contestees: DonneesCarte['contestees']): void {
    const reste = entites.filter((e) => aSilhouette(e.pays.id) && e.pays.statut === 'jouable' && !faits.has(e.forme));
    const libre: (f: () => void) => void =
      typeof requestIdleCallback === 'function' ? (f) => void requestIdleCallback(f, { timeout: 2000 }) : (f) => void setTimeout(f, 50);
    const suivant = () => {
      const e = reste.shift();
      if (!e) return;
      dessin(e, contestees);
      libre(suivant);
    };
    libre(suivant);
  }

  const fabrique: Fabrique = (ts, d) => {
    const entites = d.entites;
    if (!entites) throw new Error('silhouettes : formes du terrain absentes');
    const contestees = d.contestees ?? [];
    const parId = new Map(entites.map((e) => [e.pays.id, e]));
    const nom = (id: string) => nomDe(d, id);
    const article = (id: string) => formePays(id, 'le') ?? nom(id);
    /** Le dessin du lieu, `alt` et `legende` ; son nom à défaut de tracé (jamais pour un des 166 : le test des données le vérifie). */
    const vue = (id: string, alt: string, legende?: string): Contenu => {
      const e = parId.get(id);
      const x = e ? dessin(e, contestees) : null;
      if (!x) return { texte: nom(id) };
      return legende === undefined ? { dessin: x, alt } : { dessin: x, alt, legende };
    };
    return {
      enonce: (id) => ({ invite: ts.enonce, objet: vue(id, T.alt) }),
      consigneQcm: () => ts.consigne_nommer,
      choix: (id) => ({ texte: nom(id) }),
      nomChoix: nom,
      visuel: false,
      revelation: (id) => ({ texte: nom(id) }),
      nomBilan: (id) => nom(id),
      lieu: nom,
      lieuArticle: article,
      // Le nom serait la réponse : jamais d'énoncé nommé au quiz facile.
      consigneNommee: () => null,
      touche: (id) => (id ? nom(id) : ts.la_mer),
      fauxSuite: (id) => remplir(ts.faux_suite, { cible: nom(id) }),
      expire: (id) => remplir(ts.expire, { cible: nom(id) }),
      // L'énoncé ne nommait pas le pays : la rétroaction le dit (« Juste : Cambodge »).
      retro: nom,
      point: () => null,
      points: () => [],
      imageEnonce: () => null,
      question: (id) => vue(id, T.alt),
      // Les deux silhouettes côte à côte, nommées (D621 a) ; l'alt vide : la légende les lit déjà.
      comparaison: (choisi, id) =>
        choisi !== id && parId.has(choisi) && parId.has(id) ? [vue(choisi, '', remplir(T.choisi, { nom: article(choisi) })), vue(id, '', remplir(T.etait, { nom: article(id) }))] : null,
      qcmPosable: (id) => aSilhouette(id) && parId.has(id),
      // Les 29 sans silhouette ne sont jamais leurres : on ne demande que des pays qui en ont une.
      qcmExclus: () => o.sansSilhouette,
      qcmPareils: () => false,
      qcmLeurres: () => undefined,
      admisEnPlus: () => null,
    };
  };

  return { donnees, fabrique, proches, dessin, prechauffer };
}
