// Planification d'une séance (docs/plan.md : « révisions mélangées » puis
// « nouveautés par grappe régionale ») et seaux de la carte de la mémoire.
// Pur : lit l'état rejoué (rejeu.ts) et le jour local courant (jour.ts).
// Les plafonds sont des défauts en attente de l'utilisateur, #2 (D5).

import { analyser, fichesDe, former, SENS, SENS_ENTREE, soeur, type Domaine } from './fiches';
import { stabilite } from './fsrs';
import type { Grappe } from './grappes';
import type { EtatFiche } from './rejeu';

/** Défaut en attente de l'utilisateur, #2 (D5) : révisions au plus par séance (~5 min). */
export const REVISIONS_PAR_SEANCE = 25;
/** Défaut en attente de l'utilisateur, #2 (D5) : révisions au plus par jour local ; le reste attend le lendemain. */
export const REVISIONS_PAR_JOUR = 60;
/**
 * Défaut en attente de l'utilisateur, #2 (D5) : grappes de nouveautés au plus
 * par jour. L'unité est la grappe entière (5 à 9 entités), quelle que soit sa
 * taille : le budget ne coupe jamais une grappe.
 */
export const GRAPPES_PAR_JOUR = 1;

type Etat = ReadonlyMap<string, EtatFiche>;

/** Vrai si la sœur de la fiche a reçu une note FSRS ou a été introduite le jour j : les deux sens ne se révisent jamais le même jour. */
function soeurOccupee(etat: Etat, fiche: string, j: number): boolean {
  const s = soeur(fiche);
  const e = s ? etat.get(s) : undefined;
  return !!e && (e.dernier_jour === j || e.introduite_jour === j);
}

/**
 * Fiches dues le jour local j : échéance au plus tard ce jour-là, sauf celles
 * dont la sœur a été notée ou introduite ce jour ; les plus en retard
 * d'abord, puis par id. Si deux sœurs sont dues, seule la première l'est ce
 * jour (l'autre attend le lendemain). `domaine` restreint à un domaine.
 */
export function dues(etat: Etat, j: number, domaine?: Domaine): string[] {
  const candidates = [...etat.values()]
    .filter((e) => e.echeance_jour <= j && !soeurOccupee(etat, e.fiche, j))
    .filter((e) => !domaine || analyser(e.fiche)?.domaine === domaine)
    .sort((a, b) => a.echeance_jour - b.echeance_jour || (a.fiche < b.fiche ? -1 : a.fiche > b.fiche ? 1 : 0));
  const prises = new Set<string>();
  for (const e of candidates) {
    const s = soeur(e.fiche);
    if (!s || !prises.has(s)) prises.add(e.fiche);
  }
  return [...prises];
}

/** Révisions déjà faites le jour j : fiches notées ce jour et introduites avant (une note par fiche et par jour). */
export function revisionsFaites(etat: Etat, j: number): number {
  let n = 0;
  for (const e of etat.values()) if (e.dernier_jour === j && e.introduite_jour < j) n++;
  return n;
}

/** Une entité est introduite dès qu'une de ses fiches (un sens ou l'autre) a reçu une note FSRS. */
export function introduite(etat: Etat, domaine: Domaine, id: string): boolean {
  return SENS.some((s) => etat.has(former(domaine, id, s)));
}

/** Révisions encore permises le jour j par le plafond du jour (REVISIONS_PAR_JOUR moins celles faites). */
export function revisionsPermises(etat: Etat, j: number): number {
  return Math.max(0, REVISIONS_PAR_JOUR - revisionsFaites(etat, j));
}

/** Une entité de la grappe a eu sa fiche d'entrée (localiser) introduite le jour j. */
const commenceeLe = (etat: Etat, g: Grappe, j: number, domaine: Domaine): boolean =>
  g.membres.some((id) => etat.get(former(domaine, id, SENS_ENTREE))?.introduite_jour === j);

/**
 * Grappes commencées le jour j : au moins une entité y a eu sa fiche
 * d'entrée (localiser) introduite ce jour-là. L'introduction d'une fiche
 * nommer (le lendemain de sa sœur) ne commence pas de grappe.
 */
export function grappesCommencees(etat: Etat, j: number, grappes: readonly Grappe[], domaine: Domaine): number {
  return grappes.filter((g) => commenceeLe(etat, g, j, domaine)).length;
}

export interface Nouveautes {
  grappe: Grappe;
  /** Entités jamais introduites de la grappe, dans son ordre (superficie décroissante). */
  ids: string[];
  /** Leurs fiches à introduire : le sens d'entrée seul (localiser, fiches.ts SENS_ENTREE). */
  fiches: string[];
}

/**
 * Grappe suivante : la première (dans l'ordre reçu, celui de grappes.ts, D4)
 * qui a une entité jamais introduite, réduite à ces entités ; null si tout
 * est introduit. Ne regarde pas le budget du jour (programme() le fait).
 */
export function grappeSuivante(etat: Etat, grappes: readonly Grappe[], domaine: Domaine): Nouveautes | null {
  for (const g of grappes) {
    const ids = g.membres.filter((id) => !introduite(etat, domaine, id));
    if (ids.length) return { grappe: g, ids, fiches: ids.flatMap((id) => fichesDe(domaine, id)) };
  }
  return null;
}

/**
 * Fiches nommer à introduire le jour j (décision « Sens « quel est ce pays
 * ? » » : au plus tôt le lendemain du sens localiser) : celles des entités
 * dont la fiche localiser a été introduite un jour antérieur, sans fiche
 * nommer encore, et dont la sœur localiser n'est ni notée ce jour ni due
 * (elle passe d'abord ; les deux sens ne se voient jamais le même jour).
 * Les plus anciennes d'abord, puis par id.
 */
export function introductions(etat: Etat, j: number, domaine?: Domaine): string[] {
  const r: { fiche: string; jour: number }[] = [];
  for (const e of etat.values()) {
    const f = analyser(e.fiche);
    if (!f || f.sens !== SENS_ENTREE || (domaine && f.domaine !== domaine)) continue;
    const nommer = former(f.domaine, f.id, 'nommer');
    if (etat.has(nommer) || e.introduite_jour >= j || e.dernier_jour >= j || e.echeance_jour <= j) continue;
    r.push({ fiche: nommer, jour: e.introduite_jour });
  }
  return r.sort((a, b) => a.jour - b.jour || (a.fiche < b.fiche ? -1 : a.fiche > b.fiche ? 1 : 0)).map((x) => x.fiche);
}

/**
 * Pourquoi un programme n'a pas de nouveautés : des révisions restent après
 * la séance ('dues'), le plafond du jour est atteint avec des fiches encore
 * dues ('plafond'), la grappe du jour est déjà prise ('grappe_faite'), ou
 * tout est introduit ('tout_appris').
 */
export type SansNouveautes = 'dues' | 'plafond' | 'grappe_faite' | 'tout_appris';

export interface Programme {
  /** Révisions de la séance (les deux sens), dans l'ordre de dues(), au plus REVISIONS_PAR_SEANCE et ce que permet le plafond du jour. */
  revisions: string[];
  /** Fiches nommer à introduire après les révisions (introductions()), toutes : une grappe par jour au plus les borne. */
  introductions: string[];
  /** Fiches dues qui restent après cette séance (autre séance, ou le lendemain une fois le plafond du jour atteint). */
  restantes: number;
  /** Nouveautés après les révisions et les introductions, ou null. */
  nouveautes: Nouveautes | null;
  /** Pourquoi nouveautes est null (null s'il y en a). */
  sansNouveautes: SansNouveautes | null;
}

/**
 * Programme d'une séance le jour j (décision « Apprendre et Révision du jour
 * » : un seul budget). Les révisions dues d'abord (les deux sens, plafonds,
 * sœurs), puis les fiches nommer à introduire, puis une nouvelle grappe
 * seulement si la séance couvre toutes les révisions dues (aucune ne reste
 * après elle) et si moins de GRAPPES_PAR_JOUR grappes ont été commencées ce
 * jour-là ; la grappe commencée ce jour même se finit (elle n'est jamais
 * coupée : une séance quittée en plein rappel la reprend). `grappes` donne
 * l'ordre des nouveautés (celles d'une série pour Apprendre) ; le compte des
 * grappes commencées se fait sur `toutes` (par défaut les mêmes), pour
 * qu'un Apprendre lancé depuis une série ne contourne pas le budget.
 */
export function programme(
  etat: Etat,
  j: number,
  grappes: readonly Grappe[],
  domaine: Domaine,
  toutes: readonly Grappe[] = grappes,
): Programme {
  const d = dues(etat, j, domaine);
  const permis = Math.min(REVISIONS_PAR_SEANCE, revisionsPermises(etat, j));
  const revisions = d.slice(0, permis);
  const restantes = d.length - revisions.length;
  const intro = introductions(etat, j, domaine);
  let sansNouveautes: SansNouveautes | null = null;
  let nouveautes: Nouveautes | null = null;
  if (restantes > 0) sansNouveautes = permis === 0 ? 'plafond' : 'dues';
  else {
    const g = grappeSuivante(etat, grappes, domaine);
    if (!g) sansNouveautes = 'tout_appris';
    else if (grappesCommencees(etat, j, toutes, domaine) < GRAPPES_PAR_JOUR || commenceeLe(etat, g.grappe, j, domaine)) nouveautes = g;
    else sansNouveautes = 'grappe_faite';
  }
  return { revisions, introductions: intro, restantes, nouveautes, sansNouveautes };
}

// Carte de la mémoire.

/** Seau de stabilité : 0 (< 1 j), 1 (1-3 j), 2 (3-7 j), 3 (7-21 j), 4 (≥ 21 j, maîtrisé). « Jamais vu » : pas de seau. */
export type Seau = 0 | 1 | 2 | 3 | 4;
/** Bornes basses (jours) des seaux 1 à 4. */
export const SEUILS_SEAUX: readonly number[] = [1, 3, 7, 21];
export const SEAU_MAITRISE: Seau = 4;

/** Seau d'une stabilité S (jours). */
export function seau(s: number): Seau {
  let k = 0;
  while (k < SEUILS_SEAUX.length && s >= SEUILS_SEAUX[k]!) k++;
  return k as Seau;
}

/**
 * Seau de chaque entité introduite d'un domaine : celui de sa fiche la plus
 * faible (parmi ses fiches introduites ; un sens jamais introduit ne compte
 * pas). Une entité jamais vue est absente.
 */
export function seauxEntites(etat: Etat, domaine: Domaine): Map<string, Seau> {
  const m = new Map<string, Seau>();
  for (const e of etat.values()) {
    const f = analyser(e.fiche);
    if (!f || f.domaine !== domaine) continue;
    const s = seau(stabilite(e.carte));
    const avant = m.get(f.id);
    if (avant === undefined || s < avant) m.set(f.id, s);
  }
  return m;
}

/** Nombre d'entités maîtrisées (seau 4). */
export function maitrises(seaux: ReadonlyMap<string, Seau>): number {
  let n = 0;
  for (const s of seaux.values()) if (s === SEAU_MAITRISE) n++;
  return n;
}
