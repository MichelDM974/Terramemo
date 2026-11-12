// Chargement d'un terrain local (public/geo/<dossier>/, produit par
// geodata/reunion.mjs) : quatre petits fichiers, demandés au choix de la série
// seulement (décision « Hébergement » : rien au premier affichage, aucun
// preload). Même assemblage que le monde (donnees.ts), sans zones contestées.
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { DonneesCarte } from './donnees';
import type { DefTerrain } from './terrain';
import type { Entite, Forme, Lieu } from './types';

/** Une source de sources.json d'un terrain (forme de public/geo/sources.json, plus edition et mise_a_jour). */
export interface SourceTerrain {
  nom: string;
  url: string;
  version: string;
  /** AAAA-MM-JJ : date de l'édition du produit. */
  edition: string;
  /** AAAA-MM-JJ : dernière mise à jour des données, celle que la Licence Ouverte 2.0 demande de citer. */
  mise_a_jour?: string;
  licence: string;
  telecharge_le: string;
  fichiers: { url: string; sha256: string }[];
}

export interface SourcesTerrain {
  sources: SourceTerrain[];
  traitement: Record<string, unknown>;
}

type Objets = Record<string, GeometryCollection<{ id: string }>>;

/** Assemble les données d'un terrain à partir des fichiers déjà analysés (sert aussi aux tests). */
export function assemblerTerrain(topo: Topology<Objets>, objet: string, lieux: Lieu[], noms: Record<string, string>): DonneesCarte<Lieu> {
  const o = topo.objects[objet];
  if (!o) throw new Error(`objet absent de la topologie : ${objet}`);
  const formes = feature(topo, o).features as Forme[];
  const parId = new Map(lieux.map((l) => [l.id, l]));
  const entites: Entite<Lieu>[] = [];
  for (const forme of formes) {
    const l = parId.get(forme.properties.id);
    if (l && forme.geometry) entites.push({ pays: l, forme });
  }
  const traits = () => ({
    interieurs: mesh(topo, o, (a, b) => a !== b).coordinates,
    cotes: mesh(topo, o, (a, b) => a === b).coordinates,
  });
  return { entites, mers: [], contestees: [], noms, traits };
}

/** Les quatre fichiers du dossier, en parallèle ; « <fichier> : HTTP xxx » levé comme chargerDonnees. */
export async function chargerTerrain(def: DefTerrain): Promise<{ donnees: DonneesCarte<Lieu>; sources: SourcesTerrain }> {
  const lire = async <T>(nom: string): Promise<T> => {
    const r = await fetch(def.dossier + nom);
    if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`);
    return (await r.json()) as T;
  };
  const [topo, lieux, noms, sources] = await Promise.all([
    lire<Topology<Objets>>(`${def.objet}.topo.json`),
    lire<Lieu[]>(`${def.objet}.json`),
    lire<Record<string, string>>('noms.fr.json'),
    lire<SourcesTerrain>('sources.json'),
  ]);
  return { donnees: assemblerTerrain(topo, def.objet, lieux, noms), sources };
}

/**
 * Date de la mention de la source, au format JJ/MM/AAAA : la dernière mise à
 * jour (Licence Ouverte 2.0), à défaut l'édition ; null si aucune n'est lisible.
 */
export function dateCredit(sources: SourcesTerrain): string | null {
  const s = sources.sources[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.mise_a_jour ?? s?.edition ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}
