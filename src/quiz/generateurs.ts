// Les générateurs des sujets du J2 (étude J2 § 9.1 et § 9.2) : pays, capitales,
// drapeaux, océans et mers. Chacun est construit sur des données déjà
// chargées ; un sujet dont les données manquent n'a pas de générateur, et le
// quiz sort avec ceux qui sont prêts (generateurs). Les leurres suivent la
// difficulté (regles.ts, LEURRES) ; les exclusions sont celles de
// l'Entraînement (sujets.ts) : les 9 pays au nom de leur capitale jamais en
// QCM ni leurres (D37 c), Israël et la Palestine jamais leurres l'un de
// l'autre, les jumeaux d'un drapeau jamais ensemble (D41 d), une mer jamais
// avec ses ancêtres ni ses parties, la mer d'Arabie jamais avec le golfe
// d'Oman.
import type { DonneesCapitales } from '../map/capitales';
import type { DonneesDrapeaux } from '../map/drapeaux';
import { mersPareilles, parenteMer } from '../map/mers';
import type { Mer, Pays } from '../map/types';
import { aSilhouette, nommerPose, SANS_NOMMER, SANS_SILHOUETTE } from '../srs/fiches';
import { SILHOUETTES_VISIBLES } from '../visibles';
import type { ProchesSilhouettes } from '../vues/silhouettes';
import { nomsProches } from '../texte';
import { choix, LEURRES_VOISINS, leurresParmi, sosiesDrapeau, VOISINS, type LieuQcm, type OptionsChoix, type SourceLeurres, type StrategieLeurres } from '../vues/qcm';
import type { Notoriete, ProchesDrapeaux } from './donnees';
import { auHasard } from './hasard';
import { LEURRES, REGLES, sansNomsProches } from './regles';
import type { Difficulte, Forme, Generateur, Niveau, Question, SujetQuiz } from './types';

/** Ce dont les générateurs ont besoin, déjà chargé ; un sujet sans ses données n'a pas de générateur. */
export interface DonneesGenerateurs {
  /** Les entités de pays.json (jouables ou non : un voisin non jouable est sauté). */
  pays: readonly Pays[];
  /** Les noms des pays (noms.fr.json), pour écarter les noms proches. */
  noms: Readonly<Record<string, string>>;
  notoriete: Notoriete;
  capitales?: DonneesCapitales | null;
  drapeaux?: DonneesDrapeaux | null;
  /** Les paires de drapeaux proches (drapeaux-proches.json) : sans elles, pas de drapeaux. */
  proches?: ProchesDrapeaux | null;
  /** Les formes proches des silhouettes (silhouettes.json, le morceau des silhouettes chargé) : sans elles, pas de silhouettes. */
  silhouettes?: ProchesSilhouettes | null;
  /** Les 50 zones marines (mers.json) et leurs noms (mers.fr.json) : sans elles, pas de mers. */
  mers?: readonly Mer[] | null;
  nomsMers?: Readonly<Record<string, string>> | null;
}

/** Combien de lieux connus un leurre « connu » propose : de quoi tirer 3 leurres, ou 2 après un voisin. */
const N_LEURRES = 3;

const parId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Ce qu'un générateur précise de son sujet ; la question elle-même est commune (fabriquer). */
interface Sujet {
  sujet: SujetQuiz;
  niveau(id: string): Niveau | undefined;
  /** Le niveau d'un lieu au QCM, quand il n'est pas celui de niveau() : ce que montre son bouton (une capitale : la principale). */
  niveauQcm?(id: string): Niveau | undefined;
  /** Les lieux du sujet (tous niveaux), jouables et pourvus de leurs données. */
  ids: readonly string[];
  posable(id: string, forme: Forme): boolean;
  entites(id: string): readonly string[];
  /** Les lieux d'un QCM : ceux qui peuvent être leurres, et leur point et leurs voisins. */
  lieuxQcm: ReadonlyMap<string, LieuQcm>;
  jouables: ReadonlySet<string>;
  /** Le groupe d'un lieu (son continent ; pour une mer : océan ou non), d'où viennent d'abord les leurres connus. */
  groupe(id: string): string;
  /** Les leurres connus (niveau 1 au facile, jusqu'au 2 au moyen) d'abord du même groupe, puis d'ailleurs. */
  connus(d: Difficulte): readonly SourceLeurres[];
  /** La stratégie de leurres de la difficulté ; undefined : celle de LEURRES (connus, voisin, voisins). */
  strategie?(id: string, d: Difficulte): StrategieLeurres | undefined;
  exclus(id: string): ReadonlySet<string>;
  pareils?(a: string, b: string): boolean;
  /** Le nom montré d'un choix (pour écarter les noms proches) ; null : les choix sont des images. */
  nomChoix(id: string): string | null;
  /** La capitale montrée, s'il y en a une (Question.indice). */
  indice?(id: string, forme: Forme, d: Difficulte, hasard: () => number): string | undefined;
  /** Au facile, l'énoncé du QCM nomme le pays (D49 d) : capitales et drapeaux. */
  nommeAuFacile: boolean;
}

/** Les sources « connus » d'un sujet : `parmi(niveauMax)` lieux connus, du même groupe d'abord, `n` au plus chacune. */
function sourcesConnus(s: Pick<Sujet, 'groupe'>, connus: (niveauMax: Niveau) => readonly string[], niveauMax: Niveau, n: number, garder: (cible: string, id: string) => boolean = () => true): SourceLeurres[] {
  const liste = connus(niveauMax);
  return [
    leurresParmi((c) => liste.filter((id) => s.groupe(id) === s.groupe(c) && garder(c, id)), n),
    leurresParmi((c) => liste.filter((id) => garder(c, id)), n),
  ];
}

/** La stratégie de leurres de la difficulté pour un sujet « à la carte » (pays, capitales, mers). */
function strategieCommune(s: Sujet, id: string, d: Difficulte): StrategieLeurres {
  const propre = s.strategie?.(id, d);
  if (propre) return propre;
  switch (LEURRES[d]) {
    case 'connus':
      return s.connus(d);
    case 'voisin':
      return [{ ...VOISINS, n: 1 }, ...s.connus(d)];
    case 'voisins':
      return LEURRES_VOISINS;
  }
}

/** Le générateur d'un sujet : le tirage des lieux, la question et ses leurres. */
function fabriquer(s: Sujet): Generateur {
  return {
    sujet: s.sujet,
    lieux: (niveauMax, forme) => s.ids.filter((id) => ((forme === 'qcm' && s.niveauQcm ? s.niveauQcm(id) : s.niveau(id)) ?? 3) <= niveauMax),
    posable: s.posable,
    entites: s.entites,
    question(id, forme, d, hasard): Question {
      const regle = REGLES[d];
      const q: Question = {
        sujet: s.sujet,
        forme,
        cible: id,
        entites: s.entites(id),
        delai_ms: forme === 'qcm' ? regle.delai_qcm_ms : regle.delai_toucher_ms,
      };
      const indice = s.indice?.(id, forme, d, hasard);
      if (indice !== undefined) q.indice = indice;
      if (forme === 'qcm') {
        const nom = (x: string) => s.nomChoix(x);
        const o: OptionsChoix = {
          exclus: s.exclus(id),
          strategie: strategieCommune(s, id, d),
          ...(s.pareils ? { pareils: s.pareils } : {}),
          ...(sansNomsProches(d) && nom(id) !== null ? { proches: (a: string, b: string) => nomsProches(nom(a)!, nom(b) ?? '') } : {}),
        };
        q.choix = choix(id, s.lieuxQcm, s.jouables, hasard, o);
        if (d === 'facile' && s.nommeAuFacile) q.nomme = true;
      }
      return q;
    },
  };
}

/** Les pays jouables et leur continent : la base des trois sujets du monde. */
function monde(d: DonneesGenerateurs) {
  const jouables = d.pays.filter((p) => p.statut === 'jouable');
  const ids = jouables.map((p) => p.id).sort(parId);
  const continent = new Map(d.pays.map((p) => [p.id, p.continent]));
  return {
    ids,
    jouables: new Set(ids),
    lieuxQcm: new Map<string, LieuQcm>(d.pays.map((p) => [p.id, p])),
    groupe: (id: string) => continent.get(id) ?? '',
  };
}

/** Les pays : la zone allumée et son nom parmi 4, ou son nom et l'on touche. */
export function generateurPays(d: DonneesGenerateurs): Generateur {
  const m = monde(d);
  const niveau = (id: string) => d.notoriete.pays[id];
  const connus = (max: Niveau) => m.ids.filter((id) => (niveau(id) ?? 3) <= max);
  const s: Sujet = {
    sujet: 'pays',
    niveau,
    ...m,
    ids: m.ids.filter((id) => niveau(id) !== undefined),
    posable: () => true,
    entites: (id) => [id],
    connus: (df) => sourcesConnus(m, connus, REGLES[df].niveauMax, N_LEURRES),
    exclus: () => new Set(),
    nomChoix: (id) => d.noms[id] ?? id,
    nommeAuFacile: false,
  };
  return fabriquer(s);
}

/**
 * Les capitales : la cible est le pays. Son niveau : celui de la plus connue de
 * ses capitales justes (§ 2.4), celle que montre le toucher (la capitale
 * d'épreuve, D38 d) en moyen ; une juste au hasard au-delà. Au QCM, le bouton
 * juste montre la principale (§ 9.2), un leurre la principale de son pays
 * (sujets.ts) : le niveau d'un pays au QCM, cible ou leurre, est donc celui de
 * sa principale (l'Afrique du Sud est au moyen par Le Cap au toucher, au
 * difficile par Pretoria au QCM ; de même la Côte d'Ivoire, par Abidjan et
 * Yamoussoukro).
 */
export function generateurCapitales(d: DonneesGenerateurs): Generateur | null {
  const caps = d.capitales;
  if (!caps) return null;
  const m = monde(d);
  const niveau = (id: string): Niveau | undefined => {
    const ns = (caps.parPays.get(id)?.justes ?? []).map((c) => d.notoriete.capitales[c.q]).filter((n): n is Niveau => n !== undefined);
    return ns.length ? (Math.min(...ns) as Niveau) : undefined;
  };
  const ids = m.ids.filter((id) => caps.parPays.has(id) && niveau(id) !== undefined);
  const niveauQcm = (id: string): Niveau | undefined => {
    const p = caps.parPays.get(id)?.principale;
    return p ? (d.notoriete.capitales[p.q] ?? niveau(id)) : undefined;
  };
  const jamaisQcm = SANS_NOMMER.capitales ?? new Set<string>();
  const posableQcm = (id: string) => nommerPose('capitales', id) && caps.parPays.has(id);
  const connus = (max: Niveau) => ids.filter((id) => posableQcm(id) && (niveauQcm(id) ?? 3) <= max);
  const s: Sujet = {
    sujet: 'capitales',
    niveau,
    niveauQcm,
    ...m,
    ids,
    // Jouables aux leurres : celles qui se posent en QCM (jamais les 9 au nom du pays).
    jouables: new Set(ids.filter(posableQcm)),
    posable: (id, forme) => caps.parPays.has(id) && (forme === 'toucher' || posableQcm(id)),
    entites: (id) => [id, ...(caps.parPays.get(id)?.sansLeurre ?? [])],
    connus: (df) => sourcesConnus(m, connus, REGLES[df].niveauMax, N_LEURRES),
    exclus: (id) => new Set([...jamaisQcm, ...(caps.parPays.get(id)?.sansLeurre ?? [])]),
    nomChoix: (id) => caps.parPays.get(id)?.principale.nom ?? d.noms[id] ?? id,
    indice: (id, forme, df, hasard) => {
      const c = caps.parPays.get(id);
      if (!c) return undefined;
      if (forme === 'qcm') return c.principale.q;
      if (df === 'difficile' || df === 'expert') return (auHasard(c.justes, hasard) ?? c.epreuve).q;
      return c.epreuve.q;
    },
    nommeAuFacile: true,
  };
  return fabriquer(s);
}

/**
 * Les drapeaux : la cible est le pays ; on montre son premier drapeau (le même
 * pour tous). Leurres (décision « Leurres de drapeaux au quiz ») : au facile,
 * 3 drapeaux éloignés (aucune paire proche avec le juste) de pays connus du
 * même continent d'abord ; au moyen, 1 sosie et 2 éloignés ; au-delà, 3 sosies
 * (ceux du manifeste et des familles, puis les plus proches mesurés).
 */
export function generateurDrapeaux(d: DonneesGenerateurs): Generateur | null {
  const dr = d.drapeaux;
  const proches = d.proches;
  if (!dr || !proches) return null;
  const m = monde(d);
  const niveau = (id: string) => d.notoriete.drapeaux[id];
  const ids = m.ids.filter((id) => dr.parPays.has(id) && niveau(id) !== undefined);
  const jumeaux = (id: string) => dr.parPays.get(id)?.jumeaux ?? [];
  /** Éloigné : aucune paire proche avec le juste, et pas de sa famille écrite à la main (une famille est faite de sosies). */
  const eloigne = (cible: string, id: string) => proches.score(cible, id) === undefined && !sosiesDrapeau(dr, cible).includes(id);
  const connus = (max: Niveau) => ids.filter((id) => (niveau(id) ?? 3) <= max);
  /**
   * Les sosies, `n` au plus : ceux du manifeste (≤ 0,3) et des familles, complétés
   * par les plus proches mesurés jusqu'à n + 2 candidats (de la marge pour les
   * jumeaux et les exclus). Une seule source : deux sources de n chacune en
   * prendraient 2 n.
   */
  const sosies = (n: number): SourceLeurres[] => [
    leurresParmi((c) => {
      const l = sosiesDrapeau(dr, c).filter((x) => !jumeaux(c).includes(x));
      for (const x of proches.de(c)) {
        if (l.length >= n + 2) break;
        if (!l.includes(x.id) && !jumeaux(c).includes(x.id)) l.push(x.id);
      }
      return l;
    }, n),
  ];
  const eloignes = (max: Niveau, n: number): SourceLeurres[] => [...sourcesConnus(m, connus, max, n, eloigne), leurresParmi((c) => ids.filter((id) => eloigne(c, id)), n)];
  const s: Sujet = {
    sujet: 'drapeaux',
    niveau,
    ...m,
    ids,
    jouables: new Set(ids),
    posable: (id) => dr.parPays.has(id),
    entites: (id) => [id, ...jumeaux(id)],
    connus: (df) => eloignes(REGLES[df].niveauMax, N_LEURRES),
    strategie: (_id, df) => {
      switch (LEURRES[df]) {
        case 'connus':
          return eloignes(1, N_LEURRES);
        case 'voisin':
          return [...sosies(1), ...eloignes(2, N_LEURRES - 1)];
        case 'voisins':
          return sosies(N_LEURRES);
      }
    },
    exclus: (id) => new Set(jumeaux(id)),
    pareils: (a, b) => jumeaux(a).includes(b),
    nomChoix: () => null,
    nommeAuFacile: true,
  };
  return fabriquer(s);
}

/**
 * Les silhouettes (étude J4 § 6.4, § 7.4 ; D604 a, D621 a) : la cible est le
 * pays ; au QCM, sa silhouette et quatre noms ; au toucher, sa silhouette, et
 * l'on touche le pays. Les 166 qui ont une silhouette (D618 a), au niveau de
 * notoriété de leur pays (pas de meilleure mesure : notoriete.pays). Leurres :
 * au facile, des pays connus du même continent ; au moyen, une forme proche
 * puis des pays du niveau ; au difficile et à l'expert, les formes proches
 * (silhouettes.json : recouvrement d'au moins son seuil), complétées par les
 * voisins puis les plus proches. Les 29 sans silhouette jamais leurres.
 */
export function generateurSilhouettes(d: DonneesGenerateurs): Generateur | null {
  const formes = d.silhouettes;
  if (!formes) return null;
  const m = monde(d);
  const niveau = (id: string) => d.notoriete.pays[id];
  const ids = m.ids.filter((id) => aSilhouette(id) && niveau(id) !== undefined);
  const connus = (max: Niveau) => ids.filter((id) => (niveau(id) ?? 3) <= max);
  const proches = (n: number): SourceLeurres => leurresParmi((c) => formes.de(c), n);
  const s: Sujet = {
    sujet: 'silhouettes',
    niveau,
    ...m,
    ids,
    jouables: new Set(ids),
    posable: (id) => aSilhouette(id),
    entites: (id) => [id],
    connus: (df) => sourcesConnus(m, connus, REGLES[df].niveauMax, N_LEURRES),
    strategie: (_id, df) => {
      switch (LEURRES[df]) {
        case 'connus':
          return undefined;
        case 'voisin':
          return [proches(1), ...sourcesConnus(m, connus, REGLES[df].niveauMax, N_LEURRES)];
        case 'voisins':
          return [proches(N_LEURRES), VOISINS];
      }
    },
    exclus: () => SANS_SILHOUETTE,
    nomChoix: (id) => d.noms[id] ?? id,
    // Le nom serait la réponse : l'énoncé ne nomme jamais le pays.
    nommeAuFacile: false,
  };
  return fabriquer(s);
}

/**
 * Océans et mers : la zone allumée et son nom parmi 4, ou son nom et l'on
 * touche. Un océan allumé n'a que des océans en leurres (sujets.ts) ; une mer,
 * jamais un océan au facile et au moyen (des mers connues), ni ses ancêtres
 * ou ses parties, ni la paire Arabie et Oman. Les noms proches n'y sont pas
 * écartés : tous commencent par leur générique (« mer de », « océan »).
 */
export function generateurMers(d: DonneesGenerateurs): Generateur | null {
  const zones = d.mers;
  const noms = d.nomsMers;
  if (!zones?.length || !noms) return null;
  const niveau = (id: string) => d.notoriete.mers[id];
  const ids = zones.map((z) => z.id).filter((id) => niveau(id) !== undefined).sort(parId);
  const sorte = new Map(zones.map((z) => [z.id, z.sorte]));
  const oceans = ids.filter((id) => sorte.get(id) === 'océan');
  const groupe = (id: string) => (sorte.get(id) === 'océan' ? 'océan' : 'mer');
  const connus = (max: Niveau) => ids.filter((id) => (niveau(id) ?? 3) <= max);
  const memeGroupe = (max: Niveau, n: number): SourceLeurres[] => [leurresParmi((c) => connus(max).filter((id) => groupe(id) === groupe(c)), n)];
  const s: Sujet = {
    sujet: 'mers',
    niveau,
    ids,
    jouables: new Set(ids),
    lieuxQcm: new Map<string, LieuQcm>(zones.map((z) => [z.id, z])),
    groupe,
    posable: () => true,
    entites: (id) => [id],
    connus: (df) => memeGroupe(REGLES[df].niveauMax, N_LEURRES),
    // « Quel est cet océan ? » : les autres océans, à toute difficulté (sinon deux choix faux d'office).
    // Une mer au moyen : 1 voisin qui n'est pas un océan (un océan voisin n'est pas toujours un
    // ancêtre : l'océan Indien pour la mer de Chine méridionale), puis 2 mers du niveau.
    strategie: (id, df) => {
      if (sorte.get(id) === 'océan') return [leurresParmi(() => oceans.filter((o) => o !== id))];
      if (LEURRES[df] === 'voisin') return [{ candidats: (l) => l.voisins.filter((v) => sorte.get(v) !== 'océan'), n: 1 }, ...memeGroupe(REGLES[df].niveauMax, N_LEURRES)];
      return undefined;
    },
    exclus: (id) => parenteMer(id, zones),
    pareils: mersPareilles,
    // Pas d'écart des noms proches : « mer de … », « golfe de … », « océan … » commencent tous pareil.
    nomChoix: () => null,
    nommeAuFacile: false,
  };
  return fabriquer(s);
}

/** Les générateurs des sujets prêts, dans l'ordre de Jouer (décision « Ordre des sujets ») : ceux dont les données manquent sont absents. */
export function generateurs(d: DonneesGenerateurs): Generateur[] {
  // Les silhouettes, quand leur liste est relue (src/visibles.ts).
  return [generateurPays(d), generateurCapitales(d), generateurDrapeaux(d), SILHOUETTES_VISIBLES ? generateurSilhouettes(d) : null, generateurMers(d)].filter(
    (g): g is Generateur => g !== null,
  );
}
