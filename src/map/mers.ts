// Couche marine (océans et mers, étude J2, § 2.3 et § 4.2 ; lot 3a) : les
// quatre fichiers de public/geo (mers.topo.json, mers-leger.topo.json,
// mers.json, mers.fr.json), lus à la demande et une seule fois, comme l'île
// (src/terrains.ts) ; jamais au premier affichage (le smoke du pilote le
// vérifie). Les zones vont dans DonneesCarte.mers, jamais dans entites.
//
// Ce qu'une mer allumée montre : une seule fonction le dit (zonesAllumees),
// lue par les trois rendus et par la notation (lot 3a, partie C).
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Position } from 'geojson';
import { unionEmprises, type Emprise } from './geo';
import type { Entite, Forme, Mer, SorteMer } from './types';

/** Une ligne de mers.json (geodata/mers.mjs). */
export interface MerBrute {
  id: string;
  sorte: SorteMer;
  parents: string[];
  interieure: boolean;
  bassin: string;
  enclavee?: boolean;
  superficie_km2: number;
  point: [number, number];
  bbox: [number, number, number, number];
  voisins: string[];
}

/** mers.fr.json : le nom de chaque zone (générique en minuscule), et ses autres noms (la recherche, lot 3b). */
export interface NomsMers {
  noms: Record<string, string>;
  alias: Record<string, string[]>;
}

/** Les fichiers lus, tels quels : le Web Worker du maillage des mers (WebGL) les analyse de son côté et en tire la clé de son cache. */
export interface TextesMers {
  topo: string;
  mers: string;
}

/** La couche marine chargée : de quoi la poser sur une carte (prendreMers). */
export interface CoucheMers {
  /** Les zones, dans l'ordre de mers.topo.json (le même que le Worker du maillage : index de forme). */
  mers: Entite<Mer>[];
  /** Formes de mers-leger.topo.json (50 km), par id : tracées pendant les gestes (Canvas). */
  leger: Map<string, Forme>;
  noms: Record<string, string>;
  alias: Record<string, string[]>;
  textes: TextesMers;
}

type ObjetsMers = { mers: GeometryCollection<{ id: string }> };

/** Une zone de mers.json en Lieu de la carte : jouable, jamais micro ; la superficie entière décide de sa taille à l'écran. */
export function versMer(b: MerBrute): Mer {
  const m: Mer = {
    id: b.id,
    statut: 'jouable',
    superficie_km2: b.superficie_km2,
    partie_max_km2: b.superficie_km2,
    point: b.point,
    bbox: b.bbox,
    micro: false,
    voisins: b.voisins,
    sorte: b.sorte,
    parents: b.parents,
    interieure: b.interieure,
    bassin: b.bassin,
  };
  if (b.enclavee) m.enclavee = true;
  return m;
}

/** Les zones de la topologie qui ont leur ligne dans mers.json, dans l'ordre de la topologie. */
export function entitesMers(topo: Topology<ObjetsMers>, brutes: readonly MerBrute[]): Entite<Mer>[] {
  const parId = new Map(brutes.map((b) => [b.id, b]));
  const res: Entite<Mer>[] = [];
  for (const forme of feature(topo, topo.objects.mers).features as Forme[]) {
    const b = parId.get(forme.properties.id);
    if (b && forme.geometry) res.push({ pays: versMer(b), forme });
  }
  return res;
}

/** Assemble la couche à partir des fichiers lus (sert aussi aux tests). */
export function assemblerMers(textes: { topo: string; leger: string; mers: string; fr: string }): CoucheMers {
  const topo = JSON.parse(textes.topo) as Topology<ObjetsMers>;
  const leger = JSON.parse(textes.leger) as Topology<ObjetsMers>;
  const brutes = JSON.parse(textes.mers) as MerBrute[];
  const fr = JSON.parse(textes.fr) as NomsMers;
  const formesLegeres = new Map((feature(leger, leger.objects.mers).features as Forme[]).filter((f) => f.geometry).map((f) => [f.properties.id, f]));
  return {
    mers: entitesMers(topo, brutes),
    leger: formesLegeres,
    noms: fr.noms,
    alias: fr.alias ?? {},
    textes: { topo: textes.topo, mers: textes.mers },
  };
}

/** Les quatre fichiers de la couche, dans l'ordre où assemblerMers les lit. */
export const FICHIERS_MERS = ['mers.topo.json', 'mers-leger.topo.json', 'mers.json', 'mers.fr.json'] as const;

/**
 * Un chargeur de la couche : lit les quatre fichiers une fois (promesse
 * gardée, comme l'île dans src/terrains.ts) ; un échec (hors ligne) ne reste
 * pas en cache, l'appel suivant relit tout.
 */
export function chargeurMers(lire: (nom: string) => Promise<string>): () => Promise<CoucheMers> {
  let enCours: Promise<CoucheMers> | null = null;
  return () => {
    if (enCours) return enCours;
    const p = Promise.all(FICHIERS_MERS.map(lire)).then(([topo = '', leger = '', mers = '', fr = '']) => assemblerMers({ topo, leger, mers, fr }));
    enCours = p;
    p.catch(() => {
      if (enCours === p) enCours = null;
    });
    return p;
  };
}

/** Lecture d'un fichier de public/geo, « <fichier> : HTTP xxx » levé comme chargerDonnees. */
export const lireGeo =
  (base = '/geo/') =>
  async (nom: string): Promise<string> => {
    const r = await fetch(base + nom);
    if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`);
    return r.text();
  };

/**
 * La couche marine du site : à la demande seulement (le premier toucher en mer
 * à l'accueil, le sujet des mers, une séance qui en a, la recherche, la carte
 * de la mémoire des mers : lot 3b ; ?mers=demo, src/main.ts).
 */
export const chargerMers = chargeurMers(lireGeo());

/**
 * Les zones qu'allume une marque posée sur la zone id (allumée, juste, fausse) :
 * elle, et, pour un océan, les mers qu'il enclave sans côte (enclavee, dont il
 * est un parent : la mer des Sargasses dans l'Atlantique), jamais ses mers
 * côtières (décision « Océans et mers », 12/11 : sinon un grand trou au milieu
 * de l'Atlantique allumé). La mer des Sargasses marquée seule n'allume
 * qu'elle. Un id qui n'est pas une zone marine : lui seul.
 */
export function zonesAllumees(id: string, mers: readonly Mer[]): string[] {
  const m = mers.find((x) => x.id === id);
  if (!m || m.sorte !== 'océan') return [id];
  return [id, ...mers.filter((x) => x.enclavee && x.parents.includes(id)).map((x) => x.id)];
}

/**
 * Les zones qui comptent pour la cible comme ses parties (D43, étude J2,
 * § 4.4 ; sorte « partie » des zones admises, passées par la vue du sujet
 * Mers, jamais dans la table commune), tirées des données, dans l'ordre de
 * mers : une zone dont la cible est un ancêtre en remontant parents (la mer
 * des Caraïbes pour l'Atlantique, l'Adriatique pour la Méditerranée, le golfe
 * de Thaïlande pour la mer de Chine méridionale et pour le Pacifique) ; mais
 * un chemin qui passe par une zone intérieure (la zone touchée comprise) ne
 * mène jamais à un océan : la Méditerranée, la mer Noire, la Baltique, la
 * mer Rouge et le golfe Persique ne comptent pas pour leur océan, ni
 * l'Adriatique, Azov, le golfe de Botnie ou la mer Blanche (pour l'Arctique).
 * Un chemin compte s'il y arrive : la baie d'Hudson (deux parents) compte pour
 * l'Arctique et pour l'Atlantique. La cible elle-même n'en est pas.
 */
export function zonesParties(cible: string, mers: readonly Mer[]): string[] {
  const parId = new Map(mers.map((m) => [m.id, m]));
  const atteint = (z: Mer): boolean => {
    // Parcours des chemins vers le haut : [zone, une zone intérieure déjà sur le chemin].
    const pile: [Mer, boolean][] = [[z, z.interieure]];
    const vus = new Set<string>();
    while (pile.length) {
      const [m, interieur] = pile.pop() as [Mer, boolean];
      for (const id of m.parents) {
        const p = parId.get(id);
        if (!p) continue;
        if (id === cible) {
          if (!(interieur && p.sorte === 'océan')) return true;
          continue;
        }
        const suite = interieur || p.interieure;
        const cle = `${id} ${suite}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        pile.push([p, suite]);
      }
    }
    return false;
  };
  return mers.filter((z) => z.id !== cible && atteint(z)).map((z) => z.id);
}

/**
 * L'emprise à cadrer pour une zone marine (vise, montrer ; étude J2, § 4.5) :
 * celle de ce qu'elle allume (zonesAllumees, unionEmprises), ouest > est si
 * elle passe l'antiméridien (le Pacifique, Béring) ; [-180, s, 180, n] pour
 * une bande de 360° (l'Arctique, l'Austral : recentrerBande, geo.ts). null
 * si id n'est pas une zone marine.
 */
export function empriseMer(id: string, mers: readonly Mer[]): Emprise | null {
  if (!mers.some((m) => m.id === id)) return null;
  const ids = zonesAllumees(id, mers);
  return unionEmprises(mers.filter((m) => ids.includes(m.id)).map((m) => m.bbox));
}

/** Le point [lon, lat] est-il dans l'anneau (règle pair-impair, en degrés : les anneaux ne passent pas l'antiméridien) ? */
function dansAnneau(anneau: readonly Position[], [x, y]: readonly [number, number]): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = [anneau[i]?.[0] ?? 0, anneau[i]?.[1] ?? 0];
    const [xj, yj] = [anneau[j]?.[0] ?? 0, anneau[j]?.[1] ?? 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/**
 * Le contour d'une zone allumée (le contour faux) : celui de l'union qu'elle
 * montre (zonesAllumees). Une mer enclavée est un trou de son océan : les trous
 * de l'océan qui contiennent le point d'une mer qu'il allume sont ôtés, sinon
 * l'Atlantique faux aurait un anneau autour des Sargasses. Les autres zones :
 * leur forme.
 */
export function formeContour(e: Entite<Mer>, mers: readonly Entite<Mer>[]): Forme {
  const avec = zonesAllumees(e.pays.id, mers.map((m) => m.pays)).slice(1);
  if (!avec.length) return e.forme;
  const points = mers.filter((m) => avec.includes(m.pays.id)).map((m) => m.pays.point);
  const g = e.forme.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const sans = polys.map((poly) => poly.filter((anneau, i) => i === 0 || !points.some((p) => dansAnneau(anneau, p))));
  const geometry = g.type === 'Polygon' ? { type: 'Polygon' as const, coordinates: sans[0] ?? [] } : { type: 'MultiPolygon' as const, coordinates: sans };
  return { ...e.forme, geometry };
}

/** Une arête qui suit l'antiméridien ou un pôle (couture de Natural Earth : maillage.ts, dessin.ts). */
function estCouture(a: Position, b: Position): boolean {
  const [la, pa, lb, pb] = [a[0] ?? 0, a[1] ?? 0, b[0] ?? 0, b[1] ?? 0];
  if (Math.abs(la) >= 180 - 1e-9 && la === lb) return true;
  return Math.abs(pa) >= 90 - 1e-9 && pa === pb;
}

/**
 * Le contour d'une forme en lignes, sans ses coutures (le Pacifique, Béring,
 * l'Austral coupés à ±180, l'Arctique fermé par le pôle) : le contour faux du
 * SVG, que le Canvas (tracerPartie) et le WebGL (maillerTraits) tracent de
 * même. Un anneau sans couture reste une ligne fermée ; un anneau coupé part
 * du bout d'une couture, d'une seule ligne entre deux coutures.
 */
export function lignesContour(forme: Forme): Position[][] {
  const g = forme.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const lignes: Position[][] = [];
  for (const poly of polys) {
    for (const anneau of poly) {
      const n = anneau.length - 1; // arêtes : anneau[i] → anneau[i + 1], le dernier point répète le premier
      if (n < 1) continue;
      let k = -1;
      for (let i = 0; i < n && k < 0; i++) if (estCouture(anneau[i] as Position, anneau[i + 1] as Position)) k = i;
      if (k < 0) {
        lignes.push(anneau);
        continue;
      }
      let ligne: Position[] = [];
      for (let t = 1; t <= n; t++) {
        const i = (k + t) % n;
        const [a, b] = [anneau[i] as Position, anneau[i + 1] as Position];
        if (estCouture(a, b)) {
          if (ligne.length > 1) lignes.push(ligne);
          ligne = [];
          continue;
        }
        if (!ligne.length) ligne.push(a);
        ligne.push(b);
      }
      if (ligne.length > 1) lignes.push(ligne);
    }
  }
  return lignes;
}

/**
 * Une forme dont les coutures de l'antiméridien reçoivent un sommet par degré
 * de latitude (PAS_COUTURE_DEG), restant à ±180 (estCouture les reconnaît
 * toujours). Le build des mers densifie tout sauf elles (étude J2, § 2.3) ; or
 * le méridien de 180° est courbe dans Equal Earth, et le tracé relie deux
 * sommets par une droite : à λ0 = 0, où la couture est le bord de l'ovale, la
 * corde de 43° de la couture du Pacifique Sud passait à une dizaine de pixels
 * à l'intérieur du bord, laissant un croissant de mer non teinté (le tracé
 * rapide comparé à geoPath, tests/carte-canvas.test.ts). Le SVG relie ses
 * sommets projetés de même (traces.ts) : il la reçoit aussi (carte.ts,
 * tracerMers). Une couture des pays (Russie, Fidji, Antarctique) est courte.
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
