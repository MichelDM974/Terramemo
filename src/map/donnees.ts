// Chargement des fichiers de public/geo (servis à la racine par Vite, Firebase
// Hosting et Capacitor), avec la durée de chaque étape.
import type { Position } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Contestee, Entite, Forme, Lieu, Mer, Pays } from './types';

/** Données d'une carte : le monde (défaut Pays) ou un terrain local (Lieu, donnees-terrain.ts). */
export interface DonneesCarte<L extends Lieu = Pays> {
  entites: Entite<L>[];
  /**
   * Océans et mers (couche marine, mers.ts), dans l'ordre de mers.topo.json :
   * vide tant que la couche n'est pas chargée (chargerMers, à la demande,
   * jamais au premier affichage), puis posée par la carte (prendreMers).
   * Jamais dans entites (étude J2, § 4.2).
   */
  mers: Entite<Mer>[];
  /** Zones de la couche contestees (hachurées par-dessus, jamais touchées). */
  contestees: { info: Contestee | undefined; forme: Forme }[];
  noms: Record<string, string>;
  /**
   * Traits de la carte tirés des arcs de la topologie (rendu WebGL), calculés
   * à la demande : frontières entre deux pays (chacune une fois) et côtes.
   */
  traits(): { interieurs: Position[][]; cotes: Position[][] };
}

export interface ChronoChargement {
  telechargement_ms: number;
  analyse_ms: number;
  feature_ms: number;
  /** Caractères des trois fichiers lus (avant analyse). */
  caracteres: number;
}

type Objets = { pays: GeometryCollection<{ id: string }>; contestees: GeometryCollection<{ id: string }> };

/** Assemble les données à partir des fichiers déjà analysés (sert aussi aux tests). */
export function assembler(
  topo: Topology<Objets>,
  pays: Pays[],
  contestees: Contestee[],
  noms: Record<string, string>,
): DonneesCarte {
  const formes = feature(topo, topo.objects.pays).features as Forme[];
  const parId = new Map(pays.map((p) => [p.id, p]));
  const entites: Entite[] = [];
  for (const forme of formes) {
    const p = parId.get(forme.properties.id);
    if (p && forme.geometry) entites.push({ pays: p, forme });
  }
  const infos = new Map(contestees.map((c) => [c.id, c]));
  const zones = (feature(topo, topo.objects.contestees).features as Forme[])
    .filter((f) => f.geometry)
    .map((forme) => ({ info: infos.get(forme.properties.id), forme }));
  const traits = () => ({
    interieurs: mesh(topo, topo.objects.pays, (a, b) => a !== b).coordinates,
    cotes: mesh(topo, topo.objects.pays, (a, b) => a === b).coordinates,
  });
  return { entites, mers: [], contestees: zones, noms, traits };
}

/** Les fichiers lus, tels quels : le Web Worker du maillage webgl les analyse de son côté (maillage.worker.ts). */
export interface TextesCarte {
  topo: string;
  pays: string;
  contestees: string;
}

export async function chargerDonnees(base = '/geo/'): Promise<{ donnees: DonneesCarte; chrono: ChronoChargement; textes: TextesCarte }> {
  const t0 = performance.now();
  const lire = async (nom: string) => {
    const r = await fetch(base + nom);
    if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`);
    return r.text();
  };
  const [topoTxt, paysTxt, contTxt, nomsTxt] = await Promise.all([
    lire('monde.topo.json'),
    lire('pays.json'),
    lire('contestees.json'),
    lire('noms.fr.json'),
  ]);
  const t1 = performance.now();
  const topo = JSON.parse(topoTxt) as Topology<Objets>;
  const pays = JSON.parse(paysTxt) as Pays[];
  const contestees = JSON.parse(contTxt) as Contestee[];
  const noms = JSON.parse(nomsTxt) as Record<string, string>;
  const t2 = performance.now();
  const donnees = assembler(topo, pays, contestees, noms);
  const t3 = performance.now();
  return {
    donnees,
    textes: { topo: topoTxt, pays: paysTxt, contestees: contTxt },
    chrono: {
      telechargement_ms: t1 - t0,
      analyse_ms: t2 - t1,
      feature_ms: t3 - t2,
      caracteres: topoTxt.length + paysTxt.length + contTxt.length + nomsTxt.length,
    },
  };
}

/**
 * Formes de la carte allégée (monde-leger.topo.json), par id : les polygones
 * d'au moins 40 km de la complète, moins de sommets. Une entité sans aucun
 * (micro-État, archipel de petites îles) n'y est pas : le rendu prend ses îles
 * dans la complète (carte-canvas.ts, calqueLeger).
 */
export interface FormesLegeres {
  pays: Map<string, Forme>;
  zones: Map<string, Forme>;
}

export function formesLegeres(topo: Topology<Objets>): FormesLegeres {
  const parId = (o: GeometryCollection<{ id: string }>) =>
    new Map((feature(topo, o).features as Forme[]).filter((f) => f.geometry).map((f) => [f.properties.id, f]));
  return { pays: parId(topo.objects.pays), zones: parId(topo.objects.contestees) };
}

/** Carte allégée du rendu Canvas (tracée pendant les gestes) ; null si elle manque : la complète partout. */
export async function chargerLeger(base = '/geo/'): Promise<FormesLegeres | null> {
  try {
    const r = await fetch(base + 'monde-leger.topo.json');
    if (!r.ok) return null;
    return formesLegeres((await r.json()) as Topology<Objets>);
  } catch {
    return null;
  }
}
