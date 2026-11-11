// Ce qui compte juste pour une cible en plus de son tracé (décision « Zones
// contestées et enclaves », 06/11/2026) : la carte suit les frontières de fait
// (Natural Earth), mais un toucher dans une zone contestée est juste pour qui la
// tient ET pour chaque pays qui la revendique (Crimée : Russie et Ukraine ;
// Somaliland : Somalie ; Chypre du Nord : Chypre ; Sahara occidental : Maroc ;
// Taïwan : Chine ; Kosovo : Serbie, pays du paquet optionnel, réponse du 06/11),
// et une enclave compte pour le pays qui l'entoure (Baïkonour, Guantánamo,
// Akrotiri, Dhekelia). Préféré au de fait strict, qui prend parti.
// Pur : tiré des données (pays.json : revendique_par ; contestees.json : dans,
// revendique_par, faits à la main dans geodata/revendications.json).
import { geoBounds } from 'd3-geo';
import type { DonneesCarte } from './donnees';
import type { Entite, Forme, Lieu } from './types';

/**
 * contestee, enclave : la table commune (construireAcceptes). capitale : une
 * zone en plus du seul sujet Capitales (D36 i : Jérusalem juste aussi en
 * Palestine, Jérusalem-Est aussi en Israël) ; jumeau : du seul sujet Drapeaux
 * (D41 d : Monaco juste pour l'Indonésie, le Tchad pour la Roumanie, et
 * l'inverse), toutes deux passées par OptionsNoter.acceptes, jamais dans la
 * table commune (sous Pays, Monaco touché pour l'Indonésie reste faux).
 */
export type SorteAdmise = 'contestee' | 'enclave' | 'capitale' | 'jumeau';

/** Pourquoi un toucher hors du tracé de la cible est juste (Note.admis, pick.ts). */
export interface Admis {
  /** La zone touchée : une entité de pays.json (NE_SOL, NE_KAB…) ou une zone hachurée de contestees.json (NE_B89…). */
  zone: string;
  /**
   * Qui la tient de fait : dans[0] pour une zone hachurée (RUS pour la Crimée) ;
   * pour une entité, la zone elle-même (Somaliland, Baïkonour). Attention, ce
   * n'est alors pas toujours un pays : NE_KAS (Siachen, tenu par l'Inde), NE_CNM
   * (zone tampon de l'ONU), FLK (Royaume-Uni), et NE_USG pour la hachure NE_B50.
   * La rétroaction « Juste (…, tenue par X) » (lot 5b) doit donc soit recevoir
   * un vrai tenant pour ces entités, soit s'en passer pour elles.
   */
  tenant: string;
  sorte: SorteAdmise;
}

/** Une zone admise pour une cible, avec sa forme (sur la carte simplifiée, celle qu'on voit). */
export interface ZoneAdmise extends Admis {
  forme: Forme;
  bbox: [number, number, number, number];
  /** La zone est une entité de pays.json : pick() peut la désigner (tracé, sonde en mer). */
  entite: boolean;
}

/** Ce que lit construireAcceptes : DonneesCarte du monde ou d'un terrain local. */
export interface DonneesAcceptes {
  entites: readonly Entite<Lieu & { revendique_par?: string[] }>[];
  contestees: DonneesCarte['contestees'];
}

/** Cible → zones qui comptent juste pour elle, dans l'ordre où noter() les essaie. */
export type Acceptes = ReadonlyMap<string, readonly ZoneAdmise[]>;

/**
 * Enclaves (entités de pays.json, statut territoire) → pays qui les entoure.
 * Baïkonour est un trou du Kazakhstan, les autres sont hors du tracé de leur
 * hôte : sans elles, un toucher sur la côte sud de Chypre pouvait tomber dans
 * Akrotiri, sous le pixel au zoom 1, et compter faux.
 */
export const ENCLAVES: Readonly<Record<string, string>> = {
  NE_KAB: 'KAZ', // Baïkonour, loué à la Russie
  NE_USG: 'CUB', // base navale de Guantánamo (aussi revendiquée par Cuba)
  NE_WSB: 'CYP', // Akrotiri, base souveraine britannique
  NE_ESB: 'CYP', // Dhekelia, base souveraine britannique
};

/** Aucune zone admise : le de fait strict (épreuves classées avant DEBUT_ACCEPTES_EPREUVES, terrains locaux). */
export const AUCUN_ACCEPTE: Acceptes = new Map();

/**
 * Les zones admises de chaque cible. Ordre pour une même cible : les enclaves,
 * puis les entités revendiquées, puis les zones hachurées (Guantánamo est une
 * enclave avant d'être une entité revendiquée par Cuba, et sa hachure NE_B50
 * vient après). Une zone hachurée compte aussi pour qui la tient : les îlots
 * espagnols au ras du Maroc (NE_B62, NE_B63) tombent sous le Maroc sur la
 * carte simplifiée, ils restent justes pour l'Espagne.
 */
export function construireAcceptes(d: DonneesAcceptes): Acceptes {
  const res = new Map<string, ZoneAdmise[]>();
  const vus = new Set<string>();
  const ajouter = (cible: string, z: ZoneAdmise) => {
    const cle = `${cible} ${z.zone}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    const l = res.get(cible);
    if (l) l.push(z);
    else res.set(cible, [z]);
  };
  for (const { pays, forme } of d.entites) {
    const hote = ENCLAVES[pays.id];
    if (hote) ajouter(hote, { zone: pays.id, tenant: pays.id, sorte: 'enclave', forme, bbox: pays.bbox, entite: true });
  }
  for (const { pays, forme } of d.entites) {
    for (const r of pays.revendique_par ?? []) {
      ajouter(r, { zone: pays.id, tenant: pays.id, sorte: 'contestee', forme, bbox: pays.bbox, entite: true });
    }
  }
  for (const { info, forme } of d.contestees) {
    if (!info) continue;
    const tenant = info.dans[0];
    if (!tenant) continue;
    const bbox = emprise(forme);
    for (const c of [...info.dans, ...(info.revendique_par ?? [])]) {
      ajouter(c, { zone: info.id, tenant, sorte: 'contestee', forme, bbox, entite: false });
    }
  }
  return res;
}

/** [ouest, sud, est, nord] d'une forme ; ouest > est si elle passe l'antiméridien (geoBounds). */
function emprise(forme: Forme): [number, number, number, number] {
  const [[o, s], [e, n]] = geoBounds(forme);
  return [o, s, e, n];
}

const cache = new WeakMap<object, Acceptes>();

/** construireAcceptes, une fois par jeu de données (clé : son tableau d'entités) ; vide pour un terrain local. */
export function acceptesDe(d: DonneesAcceptes): Acceptes {
  let a = cache.get(d.entites);
  if (!a) cache.set(d.entites, (a = construireAcceptes(d)));
  return a;
}

/**
 * Des zones admises en plus pour une cible (OptionsNoter.acceptes) : les
 * entités `zones` du terrain, de cette sorte, chacune tenue par elle-même.
 * Une zone absente des données est sautée. Vide : aucune table (null).
 */
export function acceptesEnPlus(d: Pick<DonneesAcceptes, 'entites'>, cible: string, zones: readonly string[], sorte: SorteAdmise): Acceptes | null {
  const l: ZoneAdmise[] = zones.flatMap((z) => {
    const e = d.entites.find((en) => en.pays.id === z);
    return e ? [{ zone: z, tenant: z, sorte, forme: e.forme, bbox: e.pays.bbox, entite: true }] : [];
  });
  return l.length ? new Map([[cible, l]]) : null;
}
