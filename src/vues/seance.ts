// La séance vue de l'appli (étude J1a § 4 et 6) : le lien entre la mémoire de
// l'appareil (src/journal/memoire.ts), le séquenceur pur (src/srs/seance.ts)
// et Toucher (essai.ts, qui pose les questions). Ici : le programme du jour
// (Révision du jour, ou Apprendre sur une série : une grappe par jour et par
// domaine, révisions dues d'abord), le cadrage d'une grappe en
// emprise de carte, la ligne discrète après une réponse, le bilan (sans
// points : « Points et classement »), les comptes de la ligne de Jouer, et
// le journal des parties libres (D11 : mode 'libre', hors FSRS). Les
// communes de La Réunion (défaut D6) : Apprendre sous La Réunion (4 grappes
// de 6), leur propre budget d'une grappe par jour (décision « Apprendre et
// Révision du jour » : une de pays et une de communes le même jour), et leurs
// révisions en second bloc de la Révision du jour, sur l'île, avant la
// grappe de pays nouveaux.
//
// Le domaine d'une réponse vient du sujet lancé, jamais du terrain (étude J2
// § 6.5) : un Trouver de capitale, sur le monde, s'écrit `capitales:…`, pas
// `pays:…`. Seuls les domaines jouables de la version (DOMAINES_JOUABLES)
// se comptent et se posent ; les autres restent au journal.
//
// Plusieurs sujets (étude J2 § 6.3, défaut D46 b, le modèle des communes) :
// la Révision du jour pose en blocs par terrain 1. les révisions dues des
// jouables du monde, mêlées, puis leurs introductions « Reconnaître » (plafond
// commun du jour, D46 d) ; 2. une séance par grappe entamée ce jour par
// Apprendre dans un autre sujet du monde que les pays, qui la finit ; 3. l'île
// comme avant ; 4. la grappe de pays nouvelle, s'il ne reste aucune révision.
// Les grappes nouvelles des autres sujets ne s'ouvrent que par Apprendre.
// Tant que le monde n'a qu'un sujet jouable, les blocs sont ceux d'avant.
// Les océans et mers (lot 3b) : leurs grappes (grappesMers : les océans, puis
// les mers par bassin), sur le monde, la couche marine lue et posée sur la
// carte avant la séance ; aucun prérequis (D39 : rien pour les mers).
// Les silhouettes (J4, lot 1) : les grappes des pays qui en ont une (D618 a),
// leur morceau et silhouettes.json chargés avant la séance ; leurs fiches
// nommer en carte retournée sans zone allumée (retournee.ts, D623 a).
//
// « Apprendre ce lieu » (fiche d'un lieu, #34, lot F7, § 5) : Apprendre avec un
// lieu (DemandeSeance.lieu), dont la grappe passe en tête (planif.ts prefere),
// dans le même budget ; à défaut, le lieu retenu sur l'appareil pour le sujet
// (OptionsSeances.prefere, D58 b), aussi pour la grappe de pays de la Révision
// du jour. comptes() avec un lieu rend l'état du bouton et le refus
// qu'ouvrir() rendrait (refusDe, partagé) : la fiche ne lit que cela.
import { capitalesChargees, chargerCapitales } from '../map/capitales';
import { chargerDrapeaux, drapeauxCharges, prechargerJustes } from '../map/drapeaux';
import type { DonneesCarte } from '../map/donnees';
import { empriseGrappe, unionEmprises, type Emprise } from '../map/geo';
import { empriseMer } from '../map/mers';
import type { Lieu, NomTerrain } from '../map/types';
import type { Memoire } from '../journal/memoire';
import { analyser, aSilhouette, DOMAINES_JOUABLES, estDomaine, former, jouablesDu, type Domaine } from '../srs/fiches';
import { grappesCommunes, grappesMers, grappesPays, type Grappe } from '../srs/grappes';
import {
  dues,
  entreesDuJour,
  grappeEntamee,
  introduite,
  introductions,
  introductionsPermises,
  PREREQUIS,
  pretSelon,
  programme,
  revisionsPermises,
  type OptionsProgramme,
  type Programme,
} from '../srs/planif';
import { evenementReponse, Seance, type BilanSeance, type PlanSeance } from '../srs/seance';
import type { Terrain } from '../terrains';
import type { Lancement } from './arbre';
import { nomSerie, SERIE_TOUS } from './cibles';
import { creer, croix, fmtKm, ligneFiche } from './commun';
import type { DemandeSeance, FabriqueSeances, PiloteSeance, RefusSeance, ReponseJouee } from './essai';
import { chargerSilhouettes, rendu, silhouettesChargees, textesSujet } from './sujets';
import { remplir, textes } from './textes';

const S = textes.seance;

/** Ce que la ligne « Révision du jour » de Jouer affiche à droite. */
export interface ComptesSeance {
  /** Fiches dues aujourd'hui (dans le plafond du jour) et fiches nommer à introduire. */
  aRevoir: number;
  /** Pays nouveaux que la prochaine séance apprendrait (la grappe suivante, si le budget le permet). */
  nouveaux: number;
  /** Apprendre avec un lieu (la fiche, #34, lot F7, § 5.4) : le refus qu'ouvrir() rendrait à la même demande, ou null. */
  refus?: RefusSeance | null;
  /** Apprendre avec un lieu : ce que la séance ferait de lui (l'état du bouton « Apprendre ce lieu »). */
  lieu?: EtatLieu;
}

/**
 * « Apprendre ce lieu » (#34, lot F7, § 5.4), lu par la fiche dans comptes() : rien n'y est ouvert ni écrit.
 * - `sans_grappe` : aucune grappe du sujet ne le porte (territoire, zone) : pas de bouton ;
 * - `appris` : déjà introduit : pas de bouton ;
 * - `a_charger` : les données du sujet ne sont pas là (la couche des mers, l'île) : le bouton, la séance les charge ;
 * - `possible` : la séance apprend sa grappe, avec `voisins` autres lieux, après `revisions` révisions ;
 * - `attendre` : pas aujourd'hui, et pourquoi : des révisions d'abord (`dues`, `plafond`), la grappe du jour prise
 *   (`grappe_faite`), le reliquat (`introductions`), une autre grappe commencée qui se finit d'abord (`autre_grappe`).
 */
export type EtatLieu =
  | { etat: 'sans_grappe' | 'appris' | 'a_charger' }
  | { etat: 'possible'; voisins: number; revisions: number }
  | { etat: 'attendre'; raison: 'dues' | 'plafond' | 'grappe_faite' | 'introductions' | 'autre_grappe' };

/** « 12 à revoir · 6 nouveaux », « À jour ». */
export function texteComptes(c: ComptesSeance): string {
  const parts = [c.aRevoir ? remplir(S.a_revoir, { n: c.aRevoir }) : '', c.nouveaux ? remplir(S.nouveaux, { n: c.nouveaux }) : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : S.a_jour;
}

export interface Seances extends FabriqueSeances {
  /** Les comptes de cette demande aujourd'hui ; null tant que la mémoire n'est pas chargée. */
  comptes(d?: DemandeSeance): ComptesSeance | null;
  /**
   * Les domaines à données propres dont une grappe est commencée ce jour
   * sans leurs données (page rouverte en pleine grappe) : les communes sans
   * l'île, les capitales ou le manifeste des drapeaux pas lus. Les comptes de la ligne de Jouer (la
   * grappe à finir) en dépendent : main.ts les charge en fond (completer),
   * puis rafraîchit Jouer.
   */
  incertains(): Domaine[];
  /** Charge les données des domaines incertains, tous ensemble (un échec n'arrête pas les autres) ; null s'il n'en manque aucune. */
  completer(): Promise<unknown> | null;
  /**
   * Les domaines dont la demande a besoin des données, hors du monde
   * toujours là (chargées ou non) : les communes (Apprendre sous La Réunion,
   * communes dues, à introduire ou grappe de communes commencée ce jour), les
   * capitales, les drapeaux et la couche marine (de même).
   */
  besoins(d: DemandeSeance): Domaine[];
  /**
   * Le journal d'une partie libre (Trouver, Reconnaître hors séance : D11),
   * dans le domaine du sujet lancé (l'Essai J0 de ⚙ a le sien : pays) ; sans
   * Lancement (repli, plus atteint par aucune partie), celui du terrain. null
   * pour un sujet qui n'est pas un domaine.
   */
  libre(l: Lancement | null, t: Terrain): ((r: ReponseJouee) => void) | null;
}

export interface OptionsSeances {
  memoire: Memoire;
  /** Les données du monde : grappes, emprises, noms. */
  monde: DonneesCarte;
  /**
   * Les données de l'île si elle est chargée, null sinon : grappes, emprises
   * et noms des communes (Apprendre sous La Réunion, bloc des communes de la
   * Révision du jour). charger() la fait charger avant d'ouvrir une séance
   * qui en a besoin.
   */
  ile?: () => DonneesCarte<Lieu> | null;
  /** Charge un terrain (main.ts : terrains.charger) ; sans lui, une séance qui a besoin de l'île s'ouvre sans elle. */
  charger?: (t: NomTerrain) => Promise<unknown>;
  /** Lit les capitales (chargerCapitales par défaut ; les tests : un échec, une attente). */
  chargerCapitales?: () => Promise<unknown>;
  /** Lit le manifeste des drapeaux (chargerDrapeaux par défaut ; les tests : un échec, une attente). */
  chargerDrapeaux?: () => Promise<unknown>;
  /**
   * Lit la couche marine et la pose sur la carte du monde (main.ts :
   * commun.ts poserMers, donnees.mers rempli), avant une séance qui a des
   * fiches de mers ; sans lui, elles attendent (comme hors ligne).
   */
  chargerMers?: () => Promise<unknown>;
  /** Charge le morceau des silhouettes et silhouettes.json (chargerSilhouettes par défaut ; les tests : un échec, une attente). */
  chargerSilhouettes?: () => Promise<unknown>;
  /** Précharge les drapeaux de ces pays (prechargerJustes par défaut : tous leurs justes ; les tests : un espion). */
  prechargerDrapeaux?: (ids: readonly string[]) => void;
  /**
   * Les domaines jouables (DOMAINES_JOUABLES par défaut) : les tests y
   * mettent un sujet pas encore livré, pour mêler des domaines du monde sans
   * changer la version.
   */
  jouables?: readonly Domaine[];
  /** Hasard du mélange (tests : une graine). */
  hasard?: () => number;
  /**
   * Le lieu retenu sur l'appareil pour ce sujet (« Apprendre ce lieu », D58 b, § 5.6 : apprendre-lieu.ts), ou null :
   * sa grappe passe en tête d'Apprendre du sujet, et de la Révision du jour pour les pays. Sans lui, aucun.
   */
  prefere?: (sujet: Domaine) => string | null;
}

/** Ce qu'une séance sait d'un domaine : son terrain, ses données, ses grappes. */
interface InfoDomaine {
  domaine: Domaine;
  terrain: NomTerrain;
  donnees: DonneesCarte<Lieu>;
  toutes: Grappe[];
  /** L'emprise à cadrer au rappel d'une grappe (geo.ts empriseGrappe : les géants réduits à leur bord proche). */
  emprise(ids: readonly string[]): Emprise | null;
}

function infoDomaine(domaine: Domaine, terrain: NomTerrain, donnees: DonneesCarte<Lieu>, toutes: Grappe[]): InfoDomaine {
  const entites = new Map(donnees.entites.map((e) => [e.pays.id, e]));
  return { domaine, terrain, donnees, toutes, emprise: (ids) => empriseGrappe(ids.flatMap((id) => entites.get(id) ?? [])) };
}

/**
 * D'où une séance tient l'InfoDomaine d'un domaine : info() (null tant que
 * ses données manquent) et charger(), qui les charge (généralise l'île des
 * communes, et les capitales et le manifeste des drapeaux, lus pour ce que
 * montrent leurs questions ; plus tard la couche marine). `aCharger` : ses
 * données ne sont pas celles du monde, toujours là.
 */
interface SourceDomaine {
  info(): InfoDomaine | null;
  aCharger: boolean;
  charger(): Promise<unknown>;
}

/** Un bloc de la séance : un domaine, son programme et le séquenceur qui le pose. */
interface Bloc {
  info: InfoDomaine;
  plan: Omit<PlanSeance, 'domaine'>;
  /** Pourquoi il n'y a pas de grappe nouvelle, et la grappe entamée ailleurs (refus d'Apprendre). */
  p: Programme;
}

export function creerSeances(o: OptionsSeances): Seances {
  const m = o.memoire;
  const hasard = o.hasard ?? Math.random;
  const jouables = o.jouables ?? DOMAINES_JOUABLES;
  const estJouable = (s: string): s is Domaine => (jouables as readonly string[]).includes(s);
  const pays = infoDomaine('pays', 'monde', o.monde, grappesPays(o.monde.entites.map((e) => e.pays)));
  /** Les communes, une fois l'île chargée (grappes calculées une fois par chargement). */
  let communes: InfoDomaine | null = null;
  const infoCommunes = (): InfoDomaine | null => {
    const d = o.ile?.() ?? null;
    if (!d) return null;
    if (communes?.donnees !== d) communes = infoDomaine('communes', 'reunion', d, grappesCommunes(d.entites.map((e) => e.pays)));
    return communes;
  };
  /** Capitales et drapeaux : l'entité jouée est le pays, sur le monde, avec les grappes des pays (étude J2 § 3.1, 6.1). */
  const duPays = new Map<Domaine, InfoDomaine>();
  const commePays = (d: Domaine): InfoDomaine => {
    let i = duPays.get(d);
    if (!i) duPays.set(d, (i = infoDomaine(d, 'monde', o.monde, pays.toutes)));
    return i;
  };
  /** Les océans et mers, une fois la couche posée sur le monde (o.monde.mers) : leurs grappes et l'emprise de leurs zones. */
  let mers: InfoDomaine | null = null;
  const infoMers = (): InfoDomaine | null => {
    const zones = o.monde.mers ?? [];
    if (!zones.length) return null;
    if (!mers) {
      const ms = zones.map((e) => e.pays);
      // Le cadrage d'une grappe de mers : l'union de leurs emprises (empriseMer : un océan avec la mer qu'il enclave).
      const emprise = (ids: readonly string[]) => unionEmprises(ids.map((id) => empriseMer(id, ms)).filter((e): e is Emprise => e !== null));
      mers = { domaine: 'mers', terrain: 'monde', donnees: o.monde, toutes: grappesMers(ms), emprise };
    }
    return mers;
  };
  /** Les silhouettes (étude J4 § 7.5) : les grappes des pays qui en ont une (D618 a : sans les 29), sur le monde. */
  let silhouettes: InfoDomaine | null = null;
  const infoSilhouettes = (): InfoDomaine =>
    (silhouettes ??= infoDomaine('silhouettes', 'monde', o.monde, grappesPays(o.monde.entites.map((e) => e.pays).filter((p) => aSilhouette(p.id)))));
  const toujoursLa = (info: () => InfoDomaine): SourceDomaine => ({ info, aCharger: false, charger: () => Promise.resolve() });
  /** La source de chaque domaine ; null : pas encore posable. */
  function source(d: Domaine): SourceDomaine | null {
    switch (d) {
      case 'pays':
        return toujoursLa(() => pays);
      case 'capitales':
        // Les grappes des pays, sur le monde ; ce que montrent ses questions (capitales.json) se charge avant la séance.
        return { info: () => (capitalesChargees() ? commePays(d) : null), aCharger: true, charger: () => (o.chargerCapitales ?? chargerCapitales)() };
      case 'drapeaux':
        // De même : le manifeste (drapeaux.json) avant la séance ; ses images, préchargées à son ouverture (ouvrir).
        return { info: () => (drapeauxCharges() ? commePays(d) : null), aCharger: true, charger: () => (o.chargerDrapeaux ?? chargerDrapeaux)() };
      case 'communes':
        return { info: infoCommunes, aCharger: true, charger: () => o.charger?.('reunion') ?? Promise.reject(new Error('île : pas de chargeur')) };
      case 'mers':
        // Les grappes des mers et ce que montrent leurs questions : la couche marine, lue et posée sur la carte avant la séance.
        return { info: infoMers, aCharger: true, charger: () => o.chargerMers?.() ?? Promise.reject(new Error('mers : pas de chargeur')) };
      case 'silhouettes':
        // Ce que montrent ses questions (le dessin) : son morceau et silhouettes.json, chargés avant la séance.
        return {
          info: () => (silhouettesChargees() ? infoSilhouettes() : null),
          aCharger: true,
          charger: () => (o.chargerSilhouettes ?? (() => chargerSilhouettes(o.monde)))(),
        };
      case 'voisins':
      case 'villes':
      case 'habitants':
      case 'superficies':
      case 'fleuves':
      case 'montagnes':
      case 'deserts':
      case 'detroits':
      case 'departements':
      case 'regions':
      case 'prefectures':
      case 'numeros':
        // Lus (J4, J5, J6 : lot 0 commun), pas encore posables ; chaque sujet y mettra le chargement de ses données.
        return null;
    }
  }

  /** Le programme d'un domaine : ses grappes (celles d'une série pour Apprendre), son budget, ce qu'un bloc précédent a déjà pris dans la séance. */
  function bloc(info: InfoDomaine, grappes: readonly Grappe[], op: OptionsProgramme = {}): Bloc {
    const p = programme(m.etat(), m.jour(), grappes, info.domaine, info.toutes, op);
    return { info, p, plan: { revisions: p.revisions, introductions: p.introductions, nouveaux: p.nouveautes?.ids ?? [] } };
  }

  /** Ce que la séance sait du domaine d'un sujet jouable ; null pour un autre (ou ses données pas chargées). */
  function infoDe(sujet: string): InfoDomaine | null {
    if (!estJouable(sujet)) return null;
    return source(sujet)?.info() ?? null;
  }

  /**
   * Les blocs d'une demande. Apprendre : le domaine du sujet lancé (sur une
   * série : un continent, ou l'île), ses révisions dues puis sa grappe
   * suivante (capitales et drapeaux : de préférence une grappe dont les pays
   * sont appris, D39 b). La Révision du jour (étude J2 § 6.3) : 1. les
   * révisions des jouables du monde, mêlées, et leurs fiches nommer ; 2. la
   * grappe entamée ce jour de chaque autre sujet du monde (Apprendre l'a
   * ouverte), s'il n'en reste aucune révision ; 3. les communes (défaut D6 :
   * leurs révisions, leurs fiches nommer, et la grappe de communes commencée
   * ce jour s'il en reste), l'île seulement si elle est chargée ; 4. la
   * grappe de pays suivante, de retour sur le monde, et seulement si aucune
   * révision de communes ne reste après la séance (décision « Apprendre et
   * Révision du jour » : les révisions dues d'abord, partout ; quitter la
   * séance après les pays laisse la grappe pour plus tard, pas les communes
   * dues). Sans bloc 2 ni 3, un seul bloc, comme avant (la reprise d'un raté
   * vient après la grappe).
   */
  function blocs(d: DemandeSeance): Bloc[] | null {
    const etat = m.etat();
    const j = m.jour();
    if (d.sorte === 'apprendre') {
      const info = infoDe(d.sujet);
      if (!info) return null;
      const grappes = info.terrain === 'monde' && d.serie.id !== SERIE_TOUS ? info.toutes.filter((g) => g.continent === d.serie.id) : info.toutes;
      const pret = pretSelon(etat, j, info.domaine);
      // Le lieu de la fiche (#34, lot F7), sinon celui retenu sur l'appareil pour ce sujet (D58 b).
      const prefere = d.lieu ?? o.prefere?.(info.domaine) ?? undefined;
      return [bloc(info, grappes, { ...(pret ? { pret } : {}), ...(prefere ? { prefere } : {}) })];
    }
    const duMonde = jouablesDu('monde', jouables).flatMap((x) => infoDe(x) ?? []);
    const c = estJouable('communes') ? infoCommunes() : null;
    // Le plafond commun des introductions (D46 d) : les plus anciennes de tous les domaines de la séance, monde et île
    // confondus, puis chacune à son bloc. Sinon le monde se servait d'abord, et ses sujets affamaient les communes.
    const domainesSeance = [...duMonde.map((i) => i.domaine), ...(c ? [c.domaine] : [])];
    const introsPermises = new Set(introductions(etat, j, domainesSeance).slice(0, introductionsPermises(etat, j)));
    // Le pays retenu sur l'appareil (D58 b, § 5.6) : sa grappe est la prochaine des pays, seuls à ouvrir une grappe ici (D46).
    const prefere = o.prefere?.('pays') ?? undefined;
    const b1 = bloc(pays, pays.toutes, { domaines: duMonde.map((i) => i.domaine), introsPermises, ...(prefere ? { prefere } : {}) });
    const prises = { prises: b1.plan.revisions.length, introsPermises };
    // 2. La grappe qu'Apprendre a ouverte ce jour dans un autre sujet du monde, à finir : un bloc par grappe (Seance ne forme les nouveautés que d'un domaine).
    const entamees: Bloc[] = duMonde
      .filter((i) => i !== pays)
      .flatMap((i) => {
        const e = grappeEntamee(etat, j, i.toutes, i.domaine);
        if (!e || dues(etat, j, i.domaine).some((f) => !b1.plan.revisions.includes(f))) return [];
        const p: Programme = { revisions: [], introductions: [], restantes: 0, introRestantes: 0, nouveautes: e, sansNouveautes: null, entamee: null };
        return [{ info: i, p, plan: { revisions: [], introductions: [], nouveaux: e.ids } }];
      });
    if (!c && !entamees.length) return [b1];
    const reviser = { ...b1, plan: { ...b1.plan, nouveaux: [] } };
    const ile: Bloc[] = [];
    if (c) {
      const bc = bloc(c, c.toutes, prises);
      // Les nouveautés des communes : seulement la grappe commencée ce jour (Apprendre sous La Réunion en ouvre une).
      const entamee = grappeEntamee(etat, j, c.toutes, 'communes');
      if (!entamee || bc.p.nouveautes?.grappe !== entamee.grappe) bc.plan = { ...bc.plan, nouveaux: [] };
      ile.push(bc);
    }
    if (ile.some((b) => b.p.restantes > 0) || !b1.plan.nouveaux.length) return [reviser, ...entamees, ...ile];
    // Les révisions dues d'abord, partout : la grappe de pays vient après les autres blocs, dans un dernier (sur le monde).
    return [reviser, ...entamees, ...ile, { ...b1, plan: { revisions: [], introductions: [], nouveaux: b1.plan.nouveaux } }];
  }

  /**
   * Les domaines dont une grappe est commencée ce jour mais les données pas
   * chargées (page rouverte en pleine grappe) : sans elles, blocs() ne les
   * voit pas, et la ligne de Jouer ne compte pas leur grappe à finir (l'île
   * des communes ; les capitales, dont la séance attend les données).
   */
  function incertains(): Domaine[] {
    if (!m.charge) return [];
    const etat = m.etat();
    const j = m.jour();
    return jouables.filter((x) => !!source(x)?.aCharger && !source(x)?.info() && entreesDuJour(etat, j, x) > 0);
  }

  /** Charge ensemble les données des sources : attend la fin de toutes (allSettled), pour ne pas ouvrir sans l'une au premier échec de l'autre. */
  function chargerTout(sources: SourceDomaine[]): Promise<unknown> | null {
    return sources.length ? Promise.allSettled(sources.map((s) => s.charger())) : null;
  }

  /**
   * Les domaines à données propres dont la demande a besoin : celui
   * d'Apprendre ; pour la Révision du jour, ceux qui ont des fiches dues, à
   * introduire, ou une grappe commencée ce jour (les communes).
   */
  function besoins(d: DemandeSeance): Domaine[] {
    const aCharger = (x: string): x is Domaine => estJouable(x) && !!source(x)?.aCharger;
    if (d.sorte === 'apprendre') return aCharger(d.sujet) ? [d.sujet] : [];
    if (!m.charge) return [];
    const etat = m.etat();
    const j = m.jour();
    return jouables.filter((x) => aCharger(x) && (dues(etat, j, x).length > 0 || introductions(etat, j, x).length > 0 || entreesDuJour(etat, j, x) > 0));
  }

  /** Charge les données qui manquent à la demande (InfoDomaine) ; null s'il n'en manque aucune. */
  function charger(d: DemandeSeance): Promise<unknown> | null {
    return chargerTout(besoins(d).flatMap((x) => source(x) ?? []).filter((s) => !s.info()));
  }

  function comptes(d: DemandeSeance = { sorte: 'revision' }): ComptesSeance | null {
    if (!m.charge) return null;
    const etat = m.etat();
    const j = m.jour();
    // Les domaines jouables seuls : des fiches d'un sujet que cette version ne pose pas (venues d'une plus récente) ne se comptent pas.
    const domaines: readonly Domaine[] = d.sorte === 'apprendre' ? (estJouable(d.sujet) ? [d.sujet] : []) : jouables;
    const aRevoir =
      Math.min(dues(etat, j, domaines).length, revisionsPermises(etat, j)) + Math.min(introductions(etat, j, domaines).length, introductionsPermises(etat, j));
    const bs = blocs(d);
    const c: ComptesSeance = { aRevoir, nouveaux: (bs ?? []).reduce((n, b) => n + b.plan.nouveaux.length, 0) };
    if (d.sorte !== 'apprendre' || d.lieu === undefined) return c;
    const refus = refusDe(bs, d);
    return { ...c, refus, lieu: etatLieu(bs, d.sujet, d.lieu, refus) };
  }

  /**
   * L'état du bouton « Apprendre ce lieu » (§ 5.4), tiré des mêmes blocs et du même refus qu'ouvrir() : la fiche ne
   * promet jamais autre chose que la séance.
   */
  function etatLieu(bs: Bloc[] | null, sujet: string, lieu: string, refus: RefusSeance | null): EtatLieu {
    const info = infoDe(sujet);
    if (!info) return { etat: estJouable(sujet) ? 'a_charger' : 'sans_grappe' };
    if (!info.toutes.some((g) => g.membres.includes(lieu))) return { etat: 'sans_grappe' };
    if (introduite(m.etat(), info.domaine, lieu)) return { etat: 'appris' };
    const b = bs?.[0];
    if (!b) return { etat: 'a_charger' };
    const n = b.p.nouveautes;
    if (!refus && n && b.plan.nouveaux.includes(lieu)) return { etat: 'possible', voisins: n.ids.length - 1, revisions: b.plan.revisions.length + b.plan.introductions.length };
    const r = b.p.sansNouveautes;
    // Une autre grappe passe avant : commencée ce jour ailleurs (le refus « grappe entamée »), ou entamée dans la série.
    if (n || r === 'grappe_entamee' || r === 'tout_appris' || r === null) return { etat: 'attendre', raison: 'autre_grappe' };
    return { etat: 'attendre', raison: r };
  }

  /**
   * Le refus d'une demande (null : la séance s'ouvre), partagé par ouvrir() et comptes() (#34, lot F7, § 5.4) : la
   * fiche lit le même que la séance rendrait. `bs` : blocs(d).
   */
  function refusDe(bs: Bloc[] | null, d: DemandeSeance): RefusSeance | null {
    // Un sujet que cette version ne pose pas (Jouer ne le propose pas) : rien à faire, et pas le message de l'île.
    if (d.sorte === 'apprendre' && !estJouable(d.sujet)) return { refus: S.rien, reviser: 0 };
    // Apprendre sans les données du sujet (hors ligne) : l'île pour les communes, « les données » pour un sujet du monde.
    if (!bs) return { refus: d.sorte === 'apprendre' && d.sujet !== 'communes' ? textes.toucher.echec_sujet : textes.toucher.echec_terrain, reviser: 0 };
    const aFaire = bs.reduce((n, b) => n + b.plan.revisions.length + b.plan.introductions.length, 0);
    const nouveaux = bs.some((b) => b.plan.nouveaux.length);
    const p = bs[0]!.p;
    // Apprendre fait d'abord ce qui reste du sujet : ses révisions dues, ou ses introductions dans le plafond du jour (le reliquat attend demain).
    const reste = p.sansNouveautes === 'dues' || (p.sansNouveautes === 'introductions' && aFaire > 0);
    if (!nouveaux && (d.sorte === 'apprendre' ? !reste : aFaire === 0)) {
      // Apprendre sur une autre série que la grappe du jour du sujet, commencée et pas finie : la Révision du jour la reprend.
      // (Les communes n'ont qu'une série, La Réunion : leur grappe entamée s'y reprend toujours.)
      if (d.sorte === 'apprendre' && p.entamee) {
        return { refus: remplir(textesSujet(p.entamee.domaine).grappe_entamee, { serie: nomSerie(p.entamee.grappe.continent) }), reviser: aFaire, finir: p.entamee.ids.length };
      }
      const raison =
        p.sansNouveautes === 'plafond'
          ? S.plafond
          : p.sansNouveautes === 'introductions'
            ? S.introductions
            : d.sorte === 'revision'
              ? S.rien
              : p.sansNouveautes === 'tout_appris'
                ? textesSujet(bs[0]!.info.domaine).tout_appris
                : S.grappe_faite;
      return { refus: raison, reviser: d.sorte === 'apprendre' ? aFaire : 0 };
    }
    return null;
  }

  function ouvrir(d: DemandeSeance): PiloteSeance | RefusSeance {
    const bs = blocs(d);
    const refus = refusDe(bs, d);
    if (refus || !bs) return refus!;
    const p = bs[0]!.p;
    precharger(bs);
    const id = m.nouvelId();
    const ctx = { seance: id, appareil: m.appareil, horloge: m.horloge, nouvelId: () => m.nouvelId(), hasard };
    return pilote(
      bs.map((b) => ({ info: b.info, seance: new Seance({ domaine: b.info.domaine, ...b.plan }, ctx) })),
      d,
      d.sorte === 'apprendre' ? conseil(p) : null,
    );
  }

  /**
   * Les drapeaux des questions de la séance, demandés à son ouverture (étude
   * J2 § 6.3) : ceux de chaque pays à poser sous Drapeaux (révisions,
   * introductions, grappe nouvelle), dans le cache du navigateur quand sa
   * question le montre ; tous ses justes, car l'énoncé de Trouver tire le sien
   * à sa pose (D38 a : l'Afghanistan, la Bolivie). Les leurres d'un QCM
   * arrivent à leur affichage.
   */
  function precharger(bs: readonly Bloc[]): void {
    // Les révisions du monde mêlent les domaines dans un bloc (celui des pays) : chaque fiche dit le sien.
    const fiches = bs.flatMap((b) => [...b.plan.revisions, ...b.plan.introductions]).flatMap((f) => analyser(f) ?? []);
    const ids = [...fiches.filter((f) => f.domaine === 'drapeaux').map((f) => f.id), ...bs.filter((b) => b.info.domaine === 'drapeaux').flatMap((b) => b.plan.nouveaux)];
    if (ids.length) (o.prechargerDrapeaux ?? ((x: readonly string[]) => prechargerJustes(x)))([...new Set(ids)]);
  }

  /**
   * D39 b (étude J2 § 6.2) : la grappe d'Apprendre a été prise sans que ses
   * pays soient appris (aucune grappe de la série ne l'était) : « Les pays de
   * cette région ne sont pas encore appris : Pays › Afrique › Apprendre ».
   */
  function conseil(p: Programme): string | null {
    const n = p.nouveautes;
    const avant = n && !n.prete ? PREREQUIS[n.domaine] : undefined;
    if (!n || !avant) return null;
    const chemin = [textes.jouer.sujets[avant as keyof typeof textes.jouer.sujets]?.nom ?? avant, nomSerie(n.grappe.continent), textes.toucher.apprendre].join(' › ');
    return remplir(textesSujet(avant).conseil, { chemin });
  }

  /** La ligne discrète après une réponse notée : quand la fiche revient. */
  function ligneApres(fiche: string, correct: boolean, encore: boolean): string {
    if (!correct) return encore ? S.a_revoir_aujourdhui : '';
    const e = m.etat().get(fiche);
    if (!e) return '';
    const n = e.echeance_jour - m.jour();
    return n <= 1 ? S.revient_demain : remplir(S.revient, { n });
  }

  /** Les blocs d'une séance posés l'un après l'autre (les pays, les communes sur l'île, la grappe de pays) comme une seule séance. */
  function pilote(blocsSeance: { info: InfoDomaine; seance: Seance }[], d: DemandeSeance, conseil: string | null): PiloteSeance {
    /** Le bloc en cours : le premier qui n'est pas fini. */
    const courant = () => blocsSeance.find((b) => !b.seance.finie) ?? null;
    return {
      conseil,
      question() {
        const b = courant();
        const e = b?.seance.courante;
        if (!b || !e) return null;
        const c = e.cadrage;
        const cadrer = !c ? null : c.sorte === 'monde' ? ('monde' as const) : b.info.emprise(c.ids);
        return { id: e.id, forme: e.forme, cadrer, connu: e.etape === 'qcm' && e.passage === 1, terrain: b.info.terrain, domaine: e.domaine };
      },
      compte() {
        const b = courant();
        const avant = b ? blocsSeance.slice(0, blocsSeance.indexOf(b)).reduce((n, x) => n + x.seance.total, 0) : 0;
        const total = blocsSeance.reduce((n, x) => n + x.seance.total, 0);
        return `${avant + (b?.seance.numero ?? 0)} / ${total}`;
      },
      repondre(r) {
        const b = courant();
        const e = b?.seance.courante;
        if (!b || !e) return '';
        const evt = b.seance.repondre({ correct: r.correct, aide: r.aide, reponse: r.reponse, via: r.via, zoom: r.zoom, distance_km: r.distance_km, duree_ms: r.duree_ms });
        void m.ecrire([evt]);
        if (e.etape === 'qcm') return '';
        return ligneApres(e.fiche, r.correct && !r.aide, b.seance.reste(e.fiche));
      },
      connu: () => courant()?.seance.connu(),
      terminer: () => {
        for (const b of blocsSeance) b.seance.terminer();
        // Son bilan suit : la séance devient envoyable (§ 5.2).
        m.clore();
      },
      bilan(el, actions) {
        const bilans = blocsSeance.map((b) => ({ b: b.seance.bilan(), info: b.info }));
        const somme = (f: (x: BilanSeance) => number) => bilans.reduce((n, x) => n + f(x.b), 0);
        const revisions = { n: somme((x) => x.revisions.n), premiers: somme((x) => x.revisions.premiers) };
        // Chaque lieu nommé par le rendu de son sujet (sujets.ts) : le domaine de sa fiche, sur les données du terrain du bloc.
        const nouveaux = bilans.flatMap((x) => x.b.nouveaux.map((id) => rendu(x.info.domaine, x.info.donnees).nomBilan(id, 'localiser')));
        const rates = bilans.flatMap((x) =>
          x.b.rates.map((r) => {
            const f = analyser(r.fiche);
            const rs = rendu(f?.domaine ?? x.info.domaine, x.info.donnees);
            const sens = f?.sens ?? 'localiser';
            return { ...r, sens, nom: rs.nomBilan(r.id, sens), lieu: rs.lieu(r.id), terrain: x.info.terrain, ts: rs.textes };
          }),
        );
        const lignes: HTMLElement[] = [croix(actions.carte), creer('h2', {}, d.sorte === 'apprendre' ? remplir(S.titre_apprendre, { serie: nomSerie(d.serie.id) }) : S.titre_revision)];
        if (!m.garde) lignes.push(creer('p', { class: 'hint seance-avis' }, S.non_garde));
        if (revisions.n) lignes.push(creer('p', { class: 'seance-resume' }, remplir(S.bilan_revisions, { premiers: revisions.premiers, n: revisions.n })));
        if (nouveaux.length) lignes.push(creer('p', { class: 'seance-resume' }, remplir(S.bilan_nouveaux, { noms: nouveaux.join(', ') })));
        if (conseil) lignes.push(creer('p', { class: 'hint seance-conseil' }, conseil));
        if (!somme((x) => x.reponses)) lignes.push(creer('p', { class: 'hint' }, S.bilan_vide));
        if (rates.length)
          lignes.push(
            creer(
              'ul',
              { class: 'essai-rates' },
              // Une erreur touchée : la fiche de son lieu (le pays sous Capitales et Drapeaux), sur le terrain de son
              // bloc (#34, lot F6). « Nouveaux : … » reste du texte : ce ne sont pas des erreurs.
              ...rates.map((r) =>
                ligneFiche(
                  r.id,
                  r.lieu,
                  r.sens === 'nommer'
                    ? remplir(r.ts.rate_oublie, { nom: r.nom })
                    : r.distance_km != null
                      ? remplir(r.ts.rate_km, { nom: r.nom, km: fmtKm(r.distance_km) })
                      : remplir(r.ts.rate_trouver, { nom: r.nom }),
                  actions.fiche && (() => actions.fiche!(r.terrain, r.id)),
                ),
              ),
            ),
          );
        const reste = comptes(d);
        const encore = reste && (reste.aRevoir || reste.nouveaux);
        lignes.push(creer('p', { class: 'hint' }, encore && reste ? remplir(S.bilan_encore, { reste: texteComptes(reste) }) : S.bilan_fini));
        const boutons: HTMLElement[] = [];
        if (encore) {
          const c = creer('button', { type: 'button', id: 'seance-continuer' }, S.continuer);
          c.addEventListener('click', actions.continuer);
          boutons.push(c);
        }
        const carte = creer('button', { type: 'button', class: encore ? 'secondary' : '', id: 'seance-carte' }, S.carte);
        carte.addEventListener('click', actions.carte);
        boutons.push(carte);
        const autre = creer('button', { type: 'button', class: 'secondary', id: 'essai-autre' }, textes.toucher.autre_serie);
        autre.addEventListener('click', actions.autre);
        boutons.push(autre);
        el.replaceChildren(...lignes, creer('div', { class: 'essai-actions' }, ...boutons));
        el.dataset.seance = d.sorte;
      },
    };
  }

  function libre(l: Lancement | null, t: Terrain): ((r: ReponseJouee) => void) | null {
    // Le sujet lancé, même pas encore jouable en séance : la partie libre est hors FSRS (D11), et l'écrire sous le domaine du terrain fausserait une autre mémoire.
    const domaine: Domaine | null = l ? (estDomaine(l.sujet) ? l.sujet : null) : (jouablesDu(t.nom, jouables)[0] ?? null);
    if (!domaine) return null;
    const seance = m.nouvelId();
    return (r) => {
      let fiche: string;
      try {
        fiche = former(domaine, r.id, r.sens);
      } catch {
        return;
      }
      void m.ecrire([evenementReponse({ seance, appareil: m.appareil, horloge: m.horloge, nouvelId: () => m.nouvelId() }, fiche, 'libre', r, null)]);
    };
  }

  return { ouvrir, charger, besoins, incertains, completer: () => chargerTout(incertains().flatMap((x) => source(x) ?? [])), comptes, libre, clore: () => m.clore() };
}
