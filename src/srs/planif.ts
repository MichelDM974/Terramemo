// Planification d'une séance (docs/plan.md : « révisions mélangées » puis
// « nouveautés par grappe régionale ») et seaux de la carte de la mémoire.
// Pur : lit l'état rejoué (rejeu.ts) et le jour local courant (jour.ts).
// Les plafonds sont des défauts en attente de l'utilisateur, #2 (D5).

import { analyser, DOMAINES, fichesDe, former, nommerPose, SENS, SENS_ENTREE, soeur, type Domaine } from './fiches';
import { stabilite } from './fsrs';
import type { Grappe } from './grappes';
import type { EtatFiche } from './rejeu';

/** Défaut en attente de l'utilisateur, #2 (D5) : révisions au plus par séance (~5 min). */
export const REVISIONS_PAR_SEANCE = 25;
/** Défaut en attente de l'utilisateur, #2 (D5) : révisions au plus par jour local ; le reste attend le lendemain. */
export const REVISIONS_PAR_JOUR = 60;
/**
 * Défaut en attente de l'utilisateur, #2 (D5) : grappes de nouveautés au plus
 * par jour et par domaine (décision « Apprendre et Révision du jour » : les
 * pays et les communes ont chacun le leur). L'unité est la grappe entière (5
 * à 9 entités), quelle que soit sa taille : le budget ne coupe jamais une
 * grappe.
 */
export const GRAPPES_PAR_JOUR = 1;
/**
 * Défaut en attente du verdict de #2 (13/11), D46, #4 : fiches nommer
 * (« Reconnaître ») introduites au plus par jour local, tous domaines
 * confondus (D46 d : un plafond commun, pas un par sujet ; il s'écarte de
 * la « propre réserve » de chaque sujet, qui reste celle des grappes). Le
 * reliquat attend le lendemain, les plus anciennes d'abord, et un domaine
 * dont des introductions attendent n'ouvre pas de grappe nouvelle
 * ('introductions' : sinon le reliquat grossirait sans fin, étude J2 § 6.1,
 * 6.3). Il vaut aussi pour les pays et les communes, sans plafond avant.
 */
export const INTRODUCTIONS_PAR_JOUR = 15;

/**
 * D39 b (étude J2 § 6.2) : le domaine que la grappe d'un sujet devrait
 * suivre. Une préférence, jamais un blocage : Apprendre Capitales ou
 * Drapeaux prend d'abord la grappe dont les pays sont appris (pret), sinon
 * la suivante, avec un conseil. Rien pour les mers.
 */
export const PREREQUIS: Readonly<Partial<Record<Domaine, Domaine>>> = { capitales: 'pays', drapeaux: 'pays' };

type Etat = ReadonlyMap<string, EtatFiche>;

/** Un domaine, plusieurs (une séance qui les mêle : les jouables du monde), ou tous (absent). */
export type Domaines = Domaine | readonly Domaine[];

/** Le domaine d'une fiche est-il parmi `d` (tous si absent) ? */
function parmi(d: Domaines | undefined, x: Domaine): boolean {
  return d === undefined || (typeof d === 'string' ? d === x : d.includes(x));
}

/** Rang du domaine d'une fiche dans DOMAINES (les pays d'abord) ; une fiche illisible après tous. */
function rangDomaine(fiche: string): number {
  const f = analyser(fiche);
  return f ? DOMAINES.indexOf(f.domaine) : DOMAINES.length;
}

/**
 * Ordre de deux fiches à âge égal (même échéance, ou même jour
 * d'introduction) : par domaine dans l'ordre de DOMAINES, puis par id. Les
 * domaines mêlés de la Révision du jour ne se départagent pas par le préfixe
 * de l'id (capitales < drapeaux < mers < pays) : les pays passeraient
 * toujours après les autres sujets, dans les plafonds de révisions et
 * d'introductions, à rebours de l'ordre pays d'abord (étude J2 § 6.2).
 */
function departager(a: string, b: string): number {
  return rangDomaine(a) - rangDomaine(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Vrai si la sœur de la fiche a reçu une note FSRS ou a été introduite le jour j : les deux sens ne se révisent jamais le même jour. */
function soeurOccupee(etat: Etat, fiche: string, j: number): boolean {
  const s = soeur(fiche);
  const e = s ? etat.get(s) : undefined;
  return !!e && (e.dernier_jour === j || e.introduite_jour === j);
}

/**
 * Fiches dues le jour local j : échéance au plus tard ce jour-là, sauf celles
 * dont la sœur a été notée ou introduite ce jour ; les plus en retard
 * d'abord, puis par domaine (les pays d'abord, departager) et par id. Si
 * deux sœurs sont dues, seule la première l'est ce jour (l'autre attend le
 * lendemain). `domaine` restreint à un domaine, ou à plusieurs (mêlés,
 * toujours les plus en retard d'abord).
 */
export function dues(etat: Etat, j: number, domaine?: Domaines): string[] {
  const candidates = [...etat.values()]
    .filter((e) => e.echeance_jour <= j && !soeurOccupee(etat, e.fiche, j))
    .filter((e) => {
      if (domaine === undefined) return true;
      const f = analyser(e.fiche);
      return !!f && parmi(domaine, f.domaine);
    })
    .sort((a, b) => a.echeance_jour - b.echeance_jour || departager(a.fiche, b.fiche));
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
  /** Le domaine de la grappe (pays, communes). */
  domaine: Domaine;
  grappe: Grappe;
  /** Entités jamais introduites de la grappe, dans son ordre (superficie décroissante). */
  ids: string[];
  /** Leurs fiches à introduire : le sens d'entrée seul (localiser, fiches.ts SENS_ENTREE). */
  fiches: string[];
  /**
   * Faux si un prédicat `pret` a été donné et qu'aucune grappe ne le
   * remplissait : celle-ci est prise quand même (D39 b, une préférence), et
   * la séance donne le conseil d'apprendre d'abord ses pays (§ 6.2).
   */
  prete: boolean;
}

/** La grappe réduite à ses entités jamais introduites ; null si toutes le sont. */
function reste(etat: Etat, g: Grappe, domaine: Domaine): Nouveautes | null {
  const ids = g.membres.filter((id) => !introduite(etat, domaine, id));
  return ids.length ? { domaine, grappe: g, ids, fiches: ids.flatMap((id) => fichesDe(domaine, id)), prete: true } : null;
}

/**
 * Grappe suivante : d'abord une grappe entamée (une entité introduite, une
 * autre pas : une grappe n'est jamais coupée, celle quittée un jour se finit
 * avant d'en ouvrir une autre), sinon la première (dans l'ordre reçu, celui
 * de grappes.ts, D4) qui a une entité jamais introduite ; réduite à ces
 * entités ; null si tout est introduit. Avec `pret` (D39 b, § 6.2) : la
 * première de ces grappes qui le remplit, à défaut la première tout court,
 * marquée `prete: false` (le conseil). Ne regarde pas le budget du jour
 * (programme() le fait).
 */
export function grappeSuivante(etat: Etat, grappes: readonly Grappe[], domaine: Domaine, pret?: (g: Grappe) => boolean): Nouveautes | null {
  let premiere: Nouveautes | null = null;
  let prete: Nouveautes | null = null;
  for (const g of grappes) {
    const r = reste(etat, g, domaine);
    if (!r) continue;
    if (r.ids.length < g.membres.length) return r;
    premiere ??= r;
    if (pret && !prete && pret(g)) prete = r;
  }
  if (!pret || !premiere) return premiere;
  return prete ?? { ...premiere, prete: false };
}

/**
 * D39 b : le prédicat `pret` d'un domaine qui a un prérequis (PREREQUIS) le
 * jour j : tous les membres de la grappe ont leur fiche d'entrée du domaine
 * prérequis (pays:X:localiser) introduite un jour d'avant. undefined pour un
 * domaine sans prérequis (pays, communes, mers).
 */
export function pretSelon(etat: Etat, j: number, domaine: Domaine): ((g: Grappe) => boolean) | undefined {
  const avant = PREREQUIS[domaine];
  if (!avant) return undefined;
  return (g) => g.membres.every((id) => (etat.get(former(avant, id, SENS_ENTREE))?.introduite_jour ?? Infinity) < j);
}

/** La grappe commencée le jour j et pas finie (parmi `grappes`), réduite à ses entités restantes ; null s'il n'y en a pas. */
export function grappeEntamee(etat: Etat, j: number, grappes: readonly Grappe[], domaine: Domaine): Nouveautes | null {
  for (const g of grappes) {
    if (!commenceeLe(etat, g, j, domaine)) continue;
    const r = reste(etat, g, domaine);
    if (r) return r;
  }
  return null;
}

/**
 * Entités d'un domaine entrées dans la mémoire le jour j (fiche d'entrée,
 * localiser, introduite ce jour-là) : seule une grappe en fait entrer, donc
 * plus de 0 dit qu'une grappe de ce domaine a été commencée ce jour, même
 * sans connaître ses grappes (l'île pas encore chargée : src/vues/seance.ts
 * la fait charger pour savoir s'il reste des communes à finir).
 */
export function entreesDuJour(etat: Etat, j: number, domaine: Domaine): number {
  let n = 0;
  for (const e of etat.values()) {
    const f = analyser(e.fiche);
    if (f && f.domaine === domaine && f.sens === SENS_ENTREE && e.introduite_jour === j) n++;
  }
  return n;
}

export interface OptionsProgramme {
  /** Révisions déjà prises dans la même séance par un bloc précédent (les communes après les pays) : retirées des deux plafonds. */
  prises?: number;
  /** Introductions déjà prises dans la même séance par un bloc précédent : retirées du plafond du jour (INTRODUCTIONS_PAR_JOUR). */
  introsPrises?: number;
  /**
   * Les domaines dont la séance prend les révisions et les introductions,
   * mêlés, les plus anciennes d'abord (la Révision du jour : les jouables du
   * monde, étude J2 § 6.3) ; par défaut le seul `domaine`. Les nouveautés
   * restent celles de `domaine`.
   */
  domaines?: readonly Domaine[];
  /** D39 b : la grappe préférée (pretSelon) ; sans lui, l'ordre des grappes seul. */
  pret?: (g: Grappe) => boolean;
}

/**
 * Fiches nommer à introduire le jour j (décision « Sens « quel est ce pays
 * ? » » : au plus tôt le lendemain du sens localiser) : celles des entités
 * dont la fiche localiser a été introduite un jour antérieur, sans fiche
 * nommer encore, et dont la sœur localiser n'est ni notée ce jour ni due
 * (elle passe d'abord ; les deux sens ne se voient jamais le même jour).
 * Les plus anciennes d'abord, puis par domaine (les pays d'abord) et par
 * id : toutes, sans le plafond du jour (programme() le pose ; le reliquat
 * attend le lendemain, en tête).
 */
export function introductions(etat: Etat, j: number, domaine?: Domaines): string[] {
  const r: { fiche: string; jour: number }[] = [];
  for (const e of etat.values()) {
    const f = analyser(e.fiche);
    // Une entité sans fiche nommer (D37 c : les 9 pays au nom de leur capitale, sous Capitales) n'en introduit jamais.
    if (!f || f.sens !== SENS_ENTREE || !parmi(domaine, f.domaine) || !nommerPose(f.domaine, f.id)) continue;
    const nommer = former(f.domaine, f.id, 'nommer');
    if (etat.has(nommer) || e.introduite_jour >= j || e.dernier_jour >= j || e.echeance_jour <= j) continue;
    r.push({ fiche: nommer, jour: e.introduite_jour });
  }
  return r.sort((a, b) => a.jour - b.jour || departager(a.fiche, b.fiche)).map((x) => x.fiche);
}

/** Introductions déjà faites le jour j : fiches nommer notées pour la première fois ce jour, tous domaines confondus (le plafond est commun, D46 d). */
export function introductionsFaites(etat: Etat, j: number): number {
  let n = 0;
  for (const e of etat.values()) if (e.introduite_jour === j && analyser(e.fiche)?.sens === 'nommer') n++;
  return n;
}

/** Introductions encore permises le jour j (INTRODUCTIONS_PAR_JOUR moins celles faites). */
export function introductionsPermises(etat: Etat, j: number): number {
  return Math.max(0, INTRODUCTIONS_PAR_JOUR - introductionsFaites(etat, j));
}

/**
 * Pourquoi un programme n'a pas de nouveautés : des révisions restent après
 * la séance ('dues'), le plafond du jour est atteint avec des fiches encore
 * dues ('plafond'), la grappe du jour est déjà prise ('grappe_faite'), la
 * grappe du jour est commencée, pas finie, hors des grappes demandées (une
 * autre série d'Apprendre : 'grappe_entamee', elle passe avant), des
 * introductions du domaine attendent le lendemain, au-delà du plafond du
 * jour ('introductions' : la règle du reliquat, D46), ou tout est introduit
 * ('tout_appris').
 */
export type SansNouveautes = 'dues' | 'plafond' | 'grappe_faite' | 'grappe_entamee' | 'introductions' | 'tout_appris';

export interface Programme {
  /** Révisions de la séance (les deux sens), dans l'ordre de dues(), au plus REVISIONS_PAR_SEANCE et ce que permet le plafond du jour. */
  revisions: string[];
  /** Fiches nommer à introduire après les révisions (introductions()), les plus anciennes d'abord, au plus ce que permet INTRODUCTIONS_PAR_JOUR. */
  introductions: string[];
  /** Fiches dues qui restent après cette séance (autre séance, ou le lendemain une fois le plafond du jour atteint). */
  restantes: number;
  /** Fiches nommer à introduire qui restent après cette séance (le reliquat : le lendemain). */
  introRestantes: number;
  /** Nouveautés après les révisions et les introductions, ou null. */
  nouveautes: Nouveautes | null;
  /** Pourquoi nouveautes est null (null s'il y en a). */
  sansNouveautes: SansNouveautes | null;
  /** 'grappe_entamee' : la grappe du jour, ce qu'il en reste (la Révision du jour la reprend). */
  entamee: Nouveautes | null;
}

/**
 * Programme d'une séance le jour j dans un domaine (décision « Apprendre et
 * Révision du jour » : un budget par domaine, pays et communes ; une grappe
 * de chaque le même jour). Les révisions dues d'abord (les deux sens,
 * plafonds, sœurs), puis les fiches nommer à introduire (plafond commun du
 * jour, D46), puis une nouvelle grappe seulement si la séance couvre toutes
 * les révisions dues (aucune ne reste après elle), si aucune introduction du
 * domaine n'attend le lendemain (règle du reliquat) et si moins de
 * GRAPPES_PAR_JOUR grappes du domaine ont été commencées ce jour-là ; la
 * grappe commencée ce jour même se finit d'abord (elle n'est jamais coupée :
 * une séance quittée en plein rappel la reprend ; Apprendre sur une autre
 * série la renvoie : 'grappe_entamee'). `grappes` donne l'ordre des
 * nouveautés (celles d'une série pour Apprendre) ; le compte des grappes
 * commencées se fait sur `toutes` (par défaut les mêmes), pour qu'un
 * Apprendre lancé depuis une série ne contourne pas le budget. L'autre
 * domaine n'y entre pas : une grappe de communes, commencée ou finie, ne
 * retient ni ne précède celle des pays, et inversement. Les révisions dues
 * d'abord valent dans les domaines de la séance (`o.domaines`, par défaut
 * le seul `domaine`) : celles des communes ne retiennent pas la grappe de
 * pays d'Apprendre (la Révision du jour, qui fait les deux, les fait passer
 * avant elle-même : src/vues/seance.ts).
 */
export function programme(
  etat: Etat,
  j: number,
  grappes: readonly Grappe[],
  domaine: Domaine,
  toutes: readonly Grappe[] = grappes,
  o: OptionsProgramme = {},
): Programme {
  const domaines = o.domaines ?? [domaine];
  const d = dues(etat, j, domaines);
  const prises = o.prises ?? 0;
  const duJour = Math.max(0, revisionsPermises(etat, j) - prises);
  const permis = Math.min(Math.max(0, REVISIONS_PAR_SEANCE - prises), duJour);
  const revisions = d.slice(0, permis);
  const restantes = d.length - revisions.length;
  const aIntroduire = introductions(etat, j, domaines);
  const intro = aIntroduire.slice(0, Math.max(0, introductionsPermises(etat, j) - (o.introsPrises ?? 0)));
  // Le reliquat du domaine : ses introductions qui attendent le lendemain (celles des autres domaines mêlés ne retiennent pas sa grappe).
  const reliquat = aIntroduire.slice(intro.length).some((f) => analyser(f)?.domaine === domaine);
  let sansNouveautes: SansNouveautes | null = null;
  let nouveautes: Nouveautes | null = null;
  let entamee: Nouveautes | null = null;
  if (restantes > 0) sansNouveautes = duJour === 0 ? 'plafond' : 'dues';
  else {
    const g = grappeSuivante(etat, grappes, domaine, o.pret);
    // La grappe du domaine commencée ce jour et pas finie : elle passe avant (jamais coupée, même avec un reliquat).
    const e = grappeEntamee(etat, j, toutes, domaine);
    if (e && grappes.includes(e.grappe)) nouveautes = e;
    else if (!g) sansNouveautes = 'tout_appris';
    else if (e) {
      sansNouveautes = 'grappe_entamee';
      entamee = e;
    } else if (grappesCommencees(etat, j, toutes, domaine) >= GRAPPES_PAR_JOUR) sansNouveautes = 'grappe_faite';
    else if (reliquat) sansNouveautes = 'introductions';
    else nouveautes = g;
  }
  return { revisions, introductions: intro, restantes, introRestantes: aIntroduire.length - intro.length, nouveautes, sansNouveautes, entamee };
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

/** Ce que la carte de la mémoire dit d'une entité touchée : ses notes FSRS (les deux sens), et dans combien de jours elle revient. */
export interface MemoireEntite {
  /** Notes FSRS reçues, tous sens confondus (une par fiche et par jour au plus). */
  vu: number;
  /** Jours jusqu'à la plus proche échéance de ses fiches (0 ou moins : due). */
  dans: number;
}

/** La mémoire d'une entité le jour j ; null si elle n'a jamais été notée (« Jamais vu »). */
export function memoireEntite(etat: Etat, domaine: Domaine, id: string, j: number): MemoireEntite | null {
  let vu = 0;
  let echeance = Infinity;
  for (const s of SENS) {
    const e = etat.get(former(domaine, id, s));
    if (!e) continue;
    vu += e.notes;
    echeance = Math.min(echeance, e.echeance_jour);
  }
  return vu ? { vu, dans: echeance - j } : null;
}
