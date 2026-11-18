// La fiche d'un lieu (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 4.2 à § 4.5 et § 4.11 ; lot F1 : ce que le dépôt sait déjà). Un morceau à
// part (import() dynamique, § 6.1) : le morceau principal ne porte que la barre
// et le chargeur (explorer.ts, src/fiches/chargeur.ts) ; celui-ci se charge au
// premier toucher d'un lieu qui a une fiche, avec ses données (§ 19 : il porte
// aussi leur lecture, la ligne de faits de la barre, les nombres et les textes).
//
// Deux états : la barre, ou la feuille ouverte (pas de mi-hauteur). La feuille
// est posée dans #app, au-dessus de la carte et de la barre, opaque (--panel,
// sans flou : un flou se recalculerait dès que la carte change dessous) ; un
// voile transparent couvre la carte autour d'elle, et un toucher dessus la
// ferme sans rien toucher d'autre (sans lui, un pincement au bord zoomerait
// sous la fiche). Ni la barre, ni le voile, ni la feuille ne sont dans l'hôte
// de la carte : leurs événements ne l'atteignent pas.
//
// Lot F3 : un territoire a les lignes d'un pays qui s'appliquent (pas de fête,
// pas de nombre de fuseaux), son drapeau à part (drapeaux-territoires.json) et
// son statut écrit en tête ; une zone contestée, son statut, ses habitants,
// son continent, ses voisins et son lien, rien d'autre (D57 a) ; l'Antarctique,
// sa superficie et son sommet. Le statut écrit et les lignes à relire restent
// tus derrière leur clé de LIGNES_RELUES.
//
// Lot F4 : une mer a sa sorte en tête (« mer intérieure », « golfe »), la mer
// dont elle fait partie et son océan (des boutons dans leur ligne, comme un
// voisin), sa superficie et sa profondeur maximale, ses pays riverains (la
// section des voisins) ; ses données viennent de fiches-mers*.json et de
// mers.json (déjà lu avec la couche). Superficie, profondeur et riverains
// attendent leur relecture (LIGNES_RELUES).
//
// Lot F5 : une commune de La Réunion a ses habitants (avec l'année du
// recensement), sa superficie cadastrale, son gentilé (tu jusqu'à sa relecture),
// son intercommunalité, ses communes voisines (des boutons, sur l'île) et son
// lien ; ses données viennent de reunion/fiches*.json, ses voisines et son nom
// des données de l'île (déjà là avec la carte).
//
// Contenu, de haut en bas : la tête (« ‹ » s'il y a une fiche d'avant, « × »,
// le drapeau, le nom, le statut), les faits (lot F2 pour un pays, dans l'ordre
// du § 4.2 : capitale, habitants, superficie, langues, monnaie, gentilé, heure,
// continent, point culminant, fête), les voisins (des boutons), les lignes de
// la mémoire, puis le lien Wikipédia et les sources de ce que la fiche montre.
// Une ligne sans donnée n'existe pas ; celles dont la table attend la relecture
// restent tues (src/fiches/relues.ts). L'heure se refait toutes les 30 s tant
// que la fiche est ouverte, par le formateur gardé de sa zone (créé au repos,
// au toucher du pays : explorer.ts). Les photos viennent aux lots suivants.
//
// Lot F7 (§ 5) : sous les lignes de la mémoire (montrées même le réglage « Carte
// de la mémoire » coupé), « Apprendre ce lieu » : son état vient des comptes de
// la séance (src/vues/apprendre-lieu.ts, ApprendreModele), jamais d'une règle
// d'ici. Possible : le bouton, « avec 6 pays voisins » dessous ; pas
// aujourd'hui : pourquoi, et « Retenir ce lieu » (D58 b : sa région sera la
// prochaine grappe), puis « Noté » et « Annuler ».
import type { DonneesCapitales } from '../map/capitales';
import type { DonneesDrapeaux } from '../map/drapeaux';
import { oceansDeMer } from '../map/mers';
import type { Mer, NomTerrain, Pays } from '../map/types';
import type { DonneesFichesCommunes, DonneesFichesMers, DonneesFichesMonde, DrapeauxTerritoires, SourceLigne, SourceMer } from '../fiches/donnees';
import { fmtAltitude, fmtHabitants, fmtHabitantsRecensement, fmtHeureLieu, fmtJourMois, fmtPart, fmtProfondeur, fmtSuperficie, fmtSuperficieMer, listeEt } from '../fiches/format';
export { prechaufferFormats, prechaufferZone } from '../fiches/format';
// Ce que le morceau principal prend de ce morceau-ci (§ 19 de l'étude) : la lecture des fichiers des
// fiches (src/fiches/chargeur.ts) et la ligne de faits de la barre (explorer.ts).
export { lireDrapeauxTerritoires, lireFichesCommunes, lireFichesMers, lireFichesMonde } from '../fiches/donnees';
export { faitsCommune, faitsMer, faitsPays, faitsTerritoire } from '../fiches/barre';
import { LIGNES_RELUES, type LigneRelue } from '../fiches/relues';
import { sorteDeLieu, type SorteLieu } from '../fiches/sorte';
import type { ApprendreModele } from './apprendre-lieu';
import { creer, croix, LIBELLE_STATUT } from './commun';
import { remplir, textes } from './textes';
import { textesFiche } from './textes-fiche';

const T = textesFiche;

/** Un voisin dans la fiche : un bouton qui ouvre sa fiche. */
export interface VoisinFiche {
  id: string;
  /** Le texte du bouton : « Espagne », « Gibraltar (territoire) ». */
  texte: string;
  nom: string;
}

/**
 * Une ligne de faits ; `heure` : la ligne de l'heure, refaite toutes les 30 s (DELAI_HEURE_MS) ;
 * `liens` : des lieux qui se touchent comme un voisin (la mère et l'océan d'une mer, lot F4), la
 * valeur alors faite de leurs boutons.
 */
export interface FaitFiche {
  libelle: string;
  valeur: string;
  heure?: { zone: string; fuseaux: number };
  liens?: readonly { id: string; nom: string }[];
}

/** Ce que la fiche montre d'un lieu (composerFiche) : tout est déjà dit, rien n'y est calculé à l'affichage. */
export interface ModeleFiche {
  terrain: NomTerrain;
  id: string;
  sorte: SorteLieu;
  nom: string;
  /**
   * « territoire », « statut contesté », « continent » ; '' pour un pays. Un territoire ou une
   * zone : son statut écrit (lot F3) une fois relu (LIGNES_RELUES.statut).
   */
  statut: string;
  /** Un pays ou un territoire : ses drapeaux (le montré d'abord) ; vide tant que le manifeste n'est pas lu, ou sans drapeau. */
  drapeaux: readonly string[];
  /** Un pays, un territoire qui a un code ISO (les 40 drapeaux de territoires) : le drapeau a sa place (4:3), même avant le manifeste. */
  avecDrapeau: boolean;
  /** Les lignes « libellé · valeur » (dt, dd), sans ligne vide. */
  faits: readonly FaitFiche[];
  /** Les pays jouables d'abord (alphabétique), puis les autres entités avec leur statut. */
  voisins: readonly VoisinFiche[];
  /** Le titre de leur section : « Voisins », « Pays riverains » (une mer), « Communes voisines ». */
  titreVoisins: string;
  /** Une ligne par sujet ; null : pas de lignes (territoire, mémoire pas encore lue). */
  memoire: readonly string[] | null;
  /** « Apprendre ce lieu » (lot F7) ; null : ni bouton ni « Noté » (territoire, zone, Antarctique). */
  apprendre: ApprendreModele | null;
  /** L'adresse de l'article de Wikipédia, ou null. */
  wikipedia: string | null;
  /** Les sources de ce que la fiche montre (« Natural Earth », « Wikidata »…). */
  sources: readonly string[];
}

export interface DonneesComposition {
  /** Les entités du terrain (pays.json ; communes.json pour une commune). */
  entites: readonly Pays[];
  /** Le nom d'une entité (le rendu du sujet de la carte). */
  nom(id: string): string;
  fiches: DonneesFichesMonde;
  capitales: DonneesCapitales | null;
  drapeaux: DonneesDrapeaux | null;
  /** Les drapeaux des territoires (lot F3), lus à la première fiche de territoire ; absent : pas encore. */
  drapeauxTerritoires?: DrapeauxTerritoires | null;
  /** Les mers (lot F4) : leurs fiches, leurs zones (mers.json : sorte, parents) et leurs noms ; absent : pas de fiche de mer. */
  mers?: DonneesMers | null;
  /**
   * Les communes de La Réunion (lot F5) : leurs fiches ; `entites` et `nom` sont alors ceux de l'île. Absent : pas de
   * fiche de commune (le lieu est lu comme une entité du monde).
   */
  communes?: DonneesFichesCommunes | null;
  /** Les lignes de la mémoire du lieu (CarteMemoire.details) ; null : pas de section. */
  memoire(id: string, jouable: boolean): readonly string[] | null;
  /** « Apprendre ce lieu » (lot F7, ApprendreFiche.etat) ; absent : pas de bouton. */
  apprendre?(id: string): ApprendreModele | null;
  /** Les lignes relues (absent : LIGNES_RELUES ; les tests passent les deux états). */
  relues?: Readonly<Record<LigneRelue, boolean>>;
  /** L'instant de l'heure (absent : maintenant). */
  maintenant?: Date;
}

/** Ce que la fiche d'une mer lit (lot F4). */
export interface DonneesMers {
  fiches: DonneesFichesMers;
  zones: readonly Mer[];
  noms: Readonly<Record<string, string>>;
}

/** L'heure d'une fiche ouverte se refait toutes les 30 s (§ 4.2). */
export const DELAI_HEURE_MS = 30_000;

/** L'adresse d'un article de la Wikipédia de la langue (textes-fiche.fr.json, wikipedia_base), par son titre. */
export const adresseWikipedia = (titre: string): string => T.wikipedia_base + encodeURIComponent(titre.replace(/ /g, '_'));

/**
 * Le statut que la fiche dit en tête : pour un territoire ou une zone, son texte écrit (lot F3)
 * une fois relu, sinon le libellé de la barre ; « continent » pour l'Antarctique ; rien pour un pays.
 */
function statutFiche(sorte: SorteLieu, p: Pays, ecrit: string | undefined, relu: boolean): string {
  if (sorte === 'continent') return T.statut_continent;
  if (sorte === 'pays') return '';
  return relu && ecrit ? ecrit : LIBELLE_STATUT[p.statut];
}

/** Le nom d'une source de ligne écrite à la main hors de Wikidata. */
const sourceLigne = (s: SourceLigne): string => (s === 'fb' ? T.noms_sources.factbook : T.noms_sources.wikipedia);

/**
 * Ce que montre la fiche du lieu `id` du monde (une entité de pays.json, ou une mer : lot F4), ou
 * null s'il n'en a pas (absent des fiches). Pur : les données sont passées.
 */
export function composerFiche(id: string, d: DonneesComposition): ModeleFiche | null {
  if (d.mers?.zones.some((z) => z.id === id)) return composerFicheMer(id, d, d.mers);
  if (d.communes) return composerFicheCommune(id, d, d.communes);
  const p = d.entites.find((e) => e.id === id);
  const f = d.fiches.lieux.get(id);
  if (!p || !f) return null;
  const sorte = sorteDeLieu(id, 'monde', p.statut);
  if (!sorte || sorte === 'mer' || sorte === 'commune') return null;
  const faits: FaitFiche[] = [];
  const relues = d.relues ?? LIGNES_RELUES;
  const S = T.noms_sources;
  const sources = [S.natural_earth, S.cldr];
  const citer = (nom: string) => void (sources.includes(nom) || sources.push(nom));
  // Lot F3 : un territoire a les lignes d'un pays qui s'appliquent ; une zone contestée, ses habitants seuls (D57 a) ;
  // l'Antarctique, sa superficie et son sommet. Les lignes à relire de chacun ont leur clé (src/fiches/relues.ts).
  const pays = sorte === 'pays';
  const territoire = sorte === 'territoire';
  const zone = sorte === 'zone';
  const continent = sorte === 'continent';
  const caps = pays ? d.capitales?.parPays.get(id) : undefined;
  const capTerritoire = territoire && relues.capitale_territoires ? f.capitale : undefined;
  if (caps) {
    faits.push({ libelle: caps.justes.length > 1 ? T.capitales : T.capitale, valeur: listeEt(caps.justes.map((c) => c.nom)) });
    citer(S.wikidata);
  } else if (capTerritoire) {
    faits.push({ libelle: T.capitale, valeur: capTerritoire });
    citer(S.wikidata);
  }
  if (f.habitants && !continent && (!zone || relues.habitants_zones)) {
    const { n, annee } = f.habitants;
    faits.push({ libelle: T.habitants, valeur: annee === null ? T.aucun_habitant : fmtHabitants(n, annee) });
    citer(f.habitants.source === 'wd' ? S.wikidata : S.banque_mondiale);
  }
  if (f.superficie !== undefined && !zone && (pays ? relues.superficie : relues.superficie_territoires)) {
    faits.push({ libelle: T.superficie, valeur: fmtSuperficie(f.superficie) });
    citer(S.superficie);
  }
  if (f.langues && (pays ? relues.langues : territoire && relues.langues_territoires)) {
    // Les officielles d'abord, puis les langues du pays parlées par 10 % ou plus, avec leur part (D56 c).
    const { officielles, parlees } = f.langues;
    const valeur = [...(officielles.length ? [listeEt(officielles)] : []), ...parlees.map((l) => fmtPart(l.nom, l.part))].join(' · ');
    if (valeur) faits.push({ libelle: officielles.length + parlees.length > 1 ? T.langues : T.langue, valeur });
  }
  if (f.monnaies?.length && (pays || territoire)) faits.push({ libelle: f.monnaies.length > 1 ? T.monnaies : T.monnaie, valeur: listeEt(f.monnaies) });
  if (f.gentils && (pays ? relues.gentile : territoire && relues.gentile_territoires)) {
    faits.push({ libelle: T.gentile, valeur: remplir(T.gentile_valeur, { gentils: f.gentils }) });
    citer(S.wikidata);
    if (f.gentilsSource) citer(sourceLigne(f.gentilsSource));
  }
  if (f.heure && (pays || territoire)) {
    // Une zone que le navigateur ne connaît pas (RangeError) : pas de ligne (§ 4.2).
    try {
      const valeur = fmtHeureLieu(f.heure.zone, f.heure.fuseaux, d.maintenant ?? new Date());
      const capitale = caps?.principale.nom ?? capTerritoire;
      // « Heure au Caire » : la forme toute faite des données (aucune grammaire ici).
      const libelle = !capitale ? T.heure_locale : f.aCapitale ? remplir(T.heure_forme, { a_capitale: f.aCapitale }) : remplir(T.heure, { capitale });
      faits.push({ libelle, valeur, heure: f.heure });
      citer(S.tz);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
    }
  }
  const nomContinent = (textes.continents as Record<string, string>)[p.continent];
  const sousRegion = d.fiches.sousRegions[p.sous_region];
  if (nomContinent && sousRegion && nomContinent !== sousRegion) faits.push({ libelle: T.continent, valeur: remplir(T.continent_valeur, { continent: nomContinent, sous_region: sousRegion }) });
  else if (nomContinent ?? sousRegion) faits.push({ libelle: T.continent, valeur: (nomContinent ?? sousRegion)! });
  if (f.culminant && !zone && (pays ? relues.culminant : relues.culminant_territoires)) {
    faits.push({ libelle: T.culminant, valeur: remplir(T.culminant_valeur, { nom: f.culminant.nom, altitude: fmtAltitude(f.culminant.altitude) }) });
    citer(S.wikidata);
    if (f.culminant.source) citer(sourceLigne(f.culminant.source));
  }
  if (f.fete && pays && relues.fete) {
    faits.push({ libelle: T.fete, valeur: remplir(T.fete_valeur, { date: fmtJourMois(f.fete.jour, f.fete.mois), nom: f.fete.nom }) });
    citer(S.factbook);
  }
  // Le drapeau : un pays ; un territoire qui a un code ISO (les 40 de drapeaux-territoires.json, lot F3).
  const avecDrapeau = pays || (territoire && !!p.a2);
  const drapeauT = territoire ? d.drapeauxTerritoires?.get(id) : undefined;
  const drapeaux = pays ? (d.drapeaux?.parPays.get(id)?.justes ?? []) : drapeauT ? [drapeauT] : [];
  if (avecDrapeau) citer(S.flag_icons);
  if (f.wp) citer(S.wikidata);
  return {
    terrain: 'monde',
    id,
    sorte,
    nom: d.nom(id),
    statut: statutFiche(sorte, p, f.statut, relues.statut),
    drapeaux,
    avecDrapeau,
    faits,
    voisins: rangerVoisins(p.voisins, d),
    titreVoisins: T.voisins,
    memoire: d.memoire(id, p.statut === 'jouable'),
    apprendre: d.apprendre?.(id) ?? null,
    wikipedia: f.wp ? adresseWikipedia(f.wp) : null,
    sources,
  };
}

/**
 * Des voisins (ou des riverains) en boutons : les pays jouables d'abord, par ordre alphabétique, puis à
 * part les autres entités, avec leur statut (§ 2.1). Un id inconnu de la carte est sauté.
 */
function rangerVoisins(ids: readonly string[], d: DonneesComposition): VoisinFiche[] {
  const parNom = (a: VoisinFiche, b: VoisinFiche) => a.nom.localeCompare(b.nom, 'fr');
  const voisins = ids.flatMap((v) => {
    const e = d.entites.find((x) => x.id === v);
    if (!e) return [];
    const nom = d.nom(v);
    const statut = e.statut === 'jouable' ? '' : LIBELLE_STATUT[e.statut];
    return [{ id: v, nom, texte: statut ? remplir(T.voisin_statut, { nom, statut }) : nom, jouable: e.statut === 'jouable' }];
  });
  return [...voisins.filter((v) => v.jouable).sort(parNom), ...voisins.filter((v) => !v.jouable).sort(parNom)].map(({ id: i, nom, texte }) => ({ id: i, nom, texte }));
}

/** La sorte d'une mer dite en tête de sa fiche : « océan », « mer intérieure », « golfe intérieur », « mer sans côte ». */
export function statutMer(z: Mer): string {
  const sortes: Readonly<Record<string, string>> = T.sortes_mer;
  const interieures: Readonly<Record<string, string>> = T.sortes_mer_interieure;
  if (z.enclavee) return T.mer_sans_cote;
  if (z.interieure && interieures[z.sorte]) return interieures[z.sorte]!;
  return sortes[z.sorte] ?? z.sorte;
}

/**
 * La fiche d'une mer (lot F4, § 4.2) : sa sorte en tête ; la mer dont elle fait partie et son océan,
 * des lieux qui se touchent ; sa superficie (« environ … », à trois chiffres) et sa profondeur
 * maximale ; ses pays riverains. Les trois dernières attendent leur relecture (LIGNES_RELUES).
 */
function composerFicheMer(id: string, d: DonneesComposition, M: DonneesMers): ModeleFiche | null {
  const z = M.zones.find((x) => x.id === id);
  const f = M.fiches.get(id);
  if (!z || !f) return null;
  const relues = d.relues ?? LIGNES_RELUES;
  const S = T.noms_sources;
  const sources = [S.natural_earth];
  const citer = (nom: string) => void (sources.includes(nom) || sources.push(nom));
  const nomMer = (x: string) => M.noms[x] ?? x;
  const faits: FaitFiche[] = [];
  const lien = (ids: readonly string[]) => ids.map((x) => ({ id: x, nom: nomMer(x) }));
  const meres = z.parents.filter((x) => M.zones.find((y) => y.id === x)?.sorte !== 'océan');
  if (meres.length) faits.push({ libelle: T.mere, valeur: listeEt(meres.map(nomMer)), liens: lien(meres) });
  const oceans = oceansDeMer(id, M.zones);
  if (oceans.length) faits.push({ libelle: oceans.length > 1 ? T.oceans : T.ocean, valeur: listeEt(oceans.map(nomMer)), liens: lien(oceans) });
  const source = (s: SourceMer | undefined, wikidata: string): string => (s === 'wp' ? S.wikipedia : s === 'noaa' ? S.noaa : s === 'ne' ? S.trace : wikidata);
  if (f.superficie && relues.superficie_mers) {
    faits.push({ libelle: T.superficie, valeur: fmtSuperficieMer(f.superficie.km2, true) });
    citer(source(f.superficie.source, S.superficie));
  }
  if (f.profondeur && relues.profondeur_mers) {
    faits.push({ libelle: T.profondeur, valeur: fmtProfondeur(f.profondeur.m) });
    citer(source(f.profondeur.source, S.wikidata));
  }
  const riverains = relues.riverains_mers ? rangerVoisins(f.riverains, d) : [];
  if (riverains.length) {
    citer(S.wikidata);
    citer(S.cldr);
  }
  if (f.wp) citer(S.wikidata);
  return {
    terrain: 'monde',
    id,
    sorte: 'mer',
    nom: nomMer(id),
    statut: statutMer(z),
    drapeaux: [],
    avecDrapeau: false,
    faits,
    voisins: riverains,
    titreVoisins: T.riverains,
    memoire: d.memoire(id, true),
    apprendre: d.apprendre?.(id) ?? null,
    wikipedia: f.wp ? adresseWikipedia(f.wp) : null,
    sources,
  };
}

/**
 * La fiche d'une commune de La Réunion (lot F5, § 4.2) : ses habitants (« 85 038 (recensement de 2023) »), sa superficie
 * cadastrale, son gentilé une fois relu (LIGNES_RELUES.gentile_communes), son intercommunalité (le sigle), ses communes
 * voisines et son lien. Pas de statut ni de drapeau. Les sources : l'IGN (le tracé, les voisines, la superficie,
 * l'intercommunalité), le recensement de l'INSEE pour les habitants, Wikidata pour le gentilé et le lien.
 */
function composerFicheCommune(id: string, d: DonneesComposition, C: DonneesFichesCommunes): ModeleFiche | null {
  const p = d.entites.find((e) => e.id === id);
  const f = C.get(id);
  if (!p || !f) return null;
  const relues = d.relues ?? LIGNES_RELUES;
  const S = T.noms_sources;
  const sources = [S.ign, S.insee];
  const citer = (nom: string) => void (sources.includes(nom) || sources.push(nom));
  const faits: FaitFiche[] = [
    { libelle: T.habitants, valeur: fmtHabitantsRecensement(f.habitants.n, f.habitants.annee) },
    { libelle: T.superficie, valeur: fmtSuperficie(f.superficie) },
  ];
  if (f.gentils && relues.gentile_communes) {
    faits.push({ libelle: T.gentile, valeur: remplir(T.gentile_valeur, { gentils: f.gentils }) });
    citer(S.wikidata);
    if (f.gentilsSource) citer(sourceLigne(f.gentilsSource));
  }
  if (f.intercommunalite) faits.push({ libelle: T.intercommunalite, valeur: f.intercommunalite });
  if (f.wp) citer(S.wikidata);
  return {
    terrain: 'reunion',
    id,
    sorte: 'commune',
    nom: d.nom(id),
    statut: '',
    drapeaux: [],
    avecDrapeau: false,
    faits,
    voisins: rangerVoisins(p.voisins, d),
    titreVoisins: T.voisines,
    memoire: d.memoire(id, true),
    apprendre: d.apprendre?.(id) ?? null,
    wikipedia: f.wp ? adresseWikipedia(f.wp) : null,
    sources,
  };
}

/** Ce que la feuille demande à la carte : chaque geste passe par l'historique (§ 4.4). */
export interface ActionsFiche {
  /** « × », le glissé vers le bas : toutes les fiches fermées, la carte rendue (nav.quitterFiches). */
  fermer(): void;
  /**
   * Un toucher sur le voile : comme fermer(), sauf la popup ⚙ ouverte, que ce
   * toucher ne fait que refermer (son écouteur, main.ts ; § 4.2 : elle
   * s'ouvre par-dessus la fiche sans la fermer).
   */
  voile(): void;
  /** « ‹ » : un pas en arrière (history.back()) ; la première fiche ouverte depuis un bilan : le bilan (nav.retour()). */
  avant(): void;
  /** Un voisin touché (ou la mère, l'océan, un riverain d'une mer) : sa fiche, une entrée de plus (nav.pousserFiche). */
  voisin(id: string): void;
  /** « Apprendre ce lieu » (lot F7) : la séance ; « Retenir ce lieu » ; « Annuler » (D58 b). */
  apprendre?(geste: 'lancer' | 'retenir' | 'oublier'): void;
}

export interface Feuille {
  /**
   * Montre ce modèle (remplace la fiche affichée) ; `avant` : « ‹ » montré ; `bilan` : il dit « Retour au bilan »
   * (la première fiche ouverte depuis un bilan, lot F6) ; `focus` : le titre reçoit le focus.
   */
  montrer(m: ModeleFiche, o: { avant: boolean; bilan?: boolean; focus: boolean }): void;
  /** Le drapeau arrivé après coup (le manifeste lu) : la tête seule est refaite. */
  drapeaux(adresses: readonly string[]): void;
  fermer(): void;
  readonly element: HTMLElement;
  readonly voile: HTMLElement;
}

/** Seuil du glissé vers le bas qui ferme, commencé sur la tête (§ 4.3). */
export const GLISSE_FERMER_PX = 60;

/**
 * La feuille et son voile, posés dans `zone` (#app), cachés. Un seul
 * exemplaire par page : la carte le garde.
 */
export function creerFeuille(zone: HTMLElement, actions: ActionsFiche): Feuille {
  const voile = creer('div', { class: 'fiche-voile', id: 'fiche-voile', 'aria-hidden': 'true' });
  voile.hidden = true;
  voile.addEventListener('click', () => actions.voile());
  const feuille = creer('section', { class: 'fiche', id: 'fiche-lieu', role: 'dialog', 'aria-labelledby': 'fiche-titre' });
  feuille.hidden = true;
  // « Noté » dit au lecteur d'écran (lot F7) : une région live posée vide une fois pour toutes, hors de la fiche
  // refaite à chaque montrer() (une région créée avec son texte n'est en général pas annoncée).
  const annonce = creer('span', { class: 'barre-annonce', id: 'fiche-annonce', 'aria-live': 'polite' });
  zone.append(voile, feuille, annonce);
  // will-change: transform le temps de la montée seulement (§ 6.4) : la feuille composée à part pendant
  // l'animation (carte.css : fiche-monte), sans garder un calque pour elle une fois ouverte.
  const finMontee = () => void (feuille.style.willChange = '');
  feuille.addEventListener('animationend', finMontee);
  feuille.addEventListener('animationcancel', finMontee);

  let modele: ModeleFiche | null = null;
  let avecAvant = false;
  let versBilan = false;
  /** Les lignes de l'heure de la fiche montrée, et leur minuteur (arrêté à la fermeture, ou par la fiche suivante). */
  let heures: { ligne: HTMLElement; dd: HTMLElement; heure: NonNullable<FaitFiche['heure']> }[] = [];
  let minuteur: ReturnType<typeof setInterval> | null = null;
  function arreterHeure(): void {
    if (minuteur !== null) clearInterval(minuteur);
    minuteur = null;
    heures = [];
  }
  /** L'heure refaite (le formateur de la zone gardé : rien de créé ici) ; une zone qui lève : sa ligne retirée. */
  function refaireHeure(): void {
    const t = new Date();
    heures = heures.filter((h) => {
      try {
        h.dd.textContent = fmtHeureLieu(h.heure.zone, h.heure.fuseaux, t);
        return true;
      } catch {
        h.ligne.remove();
        return false;
      }
    });
    if (!heures.length) arreterHeure();
  }
  const drapeauxEl = creer('div', { class: 'fiche-drapeaux' });

  /** Les drapeaux de la tête : la place grise (4:3) tant qu'ils ne sont pas là. */
  function poserDrapeaux(m: ModeleFiche): void {
    drapeauxEl.hidden = !m.avecDrapeau;
    drapeauxEl.replaceChildren(
      ...(m.drapeaux.length
        ? m.drapeaux.map((src) => {
            const img = creer('img', { class: 'drapeau', src, alt: remplir(T.drapeau, { nom: m.nom }), draggable: 'false' });
            img.addEventListener('load', () => img.classList.add('charge'));
            return img;
          })
        : [creer('span', { class: 'drapeau', 'aria-hidden': 'true' })]),
    );
  }

  function tete(m: ModeleFiche): HTMLElement {
    const libelle = versBilan ? T.avant_bilan : T.avant;
    const avant = creer('button', { type: 'button', class: versBilan ? 'fiche-avant fiche-avant-bilan' : 'fiche-avant', 'aria-label': libelle, title: libelle }, '‹');
    avant.hidden = !avecAvant;
    avant.addEventListener('click', () => actions.avant());
    const titre = creer('h2', { class: 'fiche-titre', id: 'fiche-titre', tabindex: '-1' }, m.nom);
    poserDrapeaux(m);
    const statut = m.statut ? [creer('p', { class: 'fiche-statut' }, m.statut)] : [];
    const t = creer('header', { class: 'fiche-tete' }, croix(() => actions.fermer()), avant, drapeauxEl, titre, ...statut);
    // Glissé vers le bas de 60 px ou plus, commencé sur la tête : la fiche se ferme (la feuille ne suit pas le doigt).
    let depart: number | null = null;
    t.addEventListener('pointerdown', (e) => {
      depart = (e as PointerEvent).clientY;
    });
    t.addEventListener('pointerup', (e) => {
      if (depart !== null && (e as PointerEvent).clientY - depart >= GLISSE_FERMER_PX) actions.fermer();
      depart = null;
    });
    t.addEventListener('pointercancel', () => {
      depart = null;
    });
    return t;
  }

  /** Un bouton du bloc « Apprendre ce lieu », décrit par la ligne qui le suit (aria-describedby). */
  function boutonApprendre(id: string, texte: string, geste: 'lancer' | 'retenir' | 'oublier', secondaire: boolean, detail?: string): HTMLElement[] {
    const b = creer('button', { type: 'button', id, ...(secondaire ? { class: 'secondary' } : {}), ...(detail ? { 'aria-describedby': `${id}-detail` } : {}) }, texte);
    b.addEventListener('click', () => {
      actions.apprendre?.(geste);
      // La fiche est refaite sur place (explorer.ts) : « Noté » annoncé après « Retenir », l'annonce vidée après « Annuler ».
      if (geste !== 'lancer') annonce.textContent = geste === 'retenir' ? T.retenu : '';
    });
    return [b, ...(detail ? [creer('p', { class: 'hint fiche-apprendre-detail', id: `${id}-detail` }, detail)] : [])];
  }

  /**
   * « Apprendre ce lieu » (lot F7, § 5.4) : le bouton et ce qu'il apprend, ou pourquoi pas aujourd'hui et
   * « Retenir ce lieu » ; le lieu retenu, « Noté » et « Annuler » (D58 b, § 5.6). Appris : rien (les lignes suffisent).
   */
  function blocApprendre(a: ApprendreModele): HTMLElement[] {
    const e = a.lieu;
    if (e?.etat === 'appris' || e?.etat === 'sans_grappe') return [];
    const el: HTMLElement[] = [];
    if (e?.etat !== 'attendre') {
      const parts: string[] = [];
      if (e?.etat === 'possible') {
        if (e.revisions) parts.push(remplir(e.revisions > 1 ? T.apprendre_apres : T.apprendre_apres_un, { n: e.revisions }));
        const avec = T.apprendre_avec[a.sujet];
        if (e.voisins) parts.push(remplir(e.voisins > 1 ? avec.n : avec.un, { n: e.voisins }));
      }
      el.push(...boutonApprendre('fiche-apprendre', T.apprendre, 'lancer', false, parts.join(' · ') || undefined));
      if (!a.garde) el.push(creer('p', { class: 'hint fiche-apprendre-avis' }, textes.seance.non_garde));
    } else {
      const r = e.raison;
      const pourquoi = r === 'dues' ? T.apprendre_dues : r === 'plafond' ? textes.seance.plafond : r === 'introductions' ? textes.seance.introductions : r === 'grappe_faite' ? T.apprendre_grappe_faite : T.apprendre_autre;
      el.push(creer('p', { class: 'hint fiche-apprendre-pourquoi' }, pourquoi));
      if (!a.retenu) el.push(...boutonApprendre('fiche-retenir', T.retenir, 'retenir', true, T.retenir_detail));
    }
    if (a.retenu) el.push(creer('p', { class: 'fiche-apprendre-retenu' }, T.retenu), ...boutonApprendre('fiche-oublier', T.annuler, 'oublier', true));
    return [creer('div', { class: 'fiche-apprendre' }, ...el)];
  }

  function rendre(m: ModeleFiche): HTMLElement {
    const enfants: HTMLElement[] = [tete(m)];
    if (m.faits.length) {
      const lignes = m.faits.map((f) => {
        // La mère et l'océan d'une mer (lot F4) : des boutons, qui ouvrent leur fiche comme un voisin.
        const dd = f.liens?.length
          ? creer(
              'dd',
              { class: 'fiche-liens' },
              ...f.liens.map((l) => {
                const b = creer('button', { type: 'button', class: 'secondary fiche-voisin', 'data-id': l.id, title: remplir(T.voisin_titre, { nom: l.nom }) }, l.nom);
                b.addEventListener('click', () => actions.voisin(l.id));
                return b;
              }),
            )
          : creer('dd', {}, f.valeur);
        const ligne = creer('div', { class: 'fiche-fait' }, creer('dt', {}, f.libelle), dd);
        if (f.heure) heures.push({ ligne, dd, heure: f.heure });
        return ligne;
      });
      enfants.push(creer('dl', { class: 'fiche-faits' }, ...lignes));
    }
    if (m.voisins.length) {
      const liste = creer(
        'ul',
        { class: 'fiche-voisins-liste' },
        ...m.voisins.map((v) => {
          const b = creer('button', { type: 'button', class: 'secondary fiche-voisin', 'data-id': v.id, title: remplir(T.voisin_titre, { nom: v.nom }) }, v.texte);
          b.addEventListener('click', () => actions.voisin(v.id));
          return creer('li', {}, b);
        }),
      );
      enfants.push(creer('section', { class: 'fiche-section fiche-voisins', 'aria-labelledby': 'fiche-voisins-titre' }, creer('h3', { id: 'fiche-voisins-titre' }, m.titreVoisins), liste));
    }
    if (m.memoire?.length || m.apprendre) {
      enfants.push(
        creer(
          'section',
          { class: 'fiche-section fiche-memoire', 'aria-labelledby': 'fiche-memoire-titre' },
          creer('h3', { id: 'fiche-memoire-titre' }, T.memoire),
          ...(m.memoire?.length ? [creer('ul', {}, ...m.memoire.map((l) => creer('li', {}, l)))] : []),
          ...(m.apprendre ? blocApprendre(m.apprendre) : []),
        ),
      );
    }
    const pied: (HTMLElement | string)[] = [];
    if (m.wikipedia) pied.push(creer('p', {}, creer('a', { class: 'fiche-wikipedia', href: m.wikipedia, target: '_blank', rel: 'noopener' }, T.wikipedia)));
    pied.push(creer('p', { class: 'fiche-sources' }, remplir(T.sources, { sources: m.sources.join(' · ') }), ' · ', creer('a', { href: '#credits', class: 'fiche-credits' }, T.credits)));
    enfants.push(creer('footer', { class: 'fiche-pied' }, ...pied));
    return creer('div', { class: 'fiche-contenu' }, ...enfants);
  }

  /** Ce qui prend le focus dans la fiche, dans un ordre fixe (le même pour la même fiche refaite). */
  function focusables(): HTMLElement[] {
    return ['button', 'a', '[tabindex]'].flatMap((sel) => [...feuille.querySelectorAll<HTMLElement>(sel)]);
  }

  return {
    element: feuille,
    voile,
    montrer(m, o) {
      // La même fiche refaite (rafraichir : la mémoire relue) : le focus et le défilement gardés, sinon le focus
      // tomberait sur body en pleine lecture au clavier. L'élément retrouvé à la même place dans la fiche nouvelle.
      // Aucune lecture ni écriture de la mise en page après replaceChildren (§ 6.4) : elle forçait la mise en page de
      // toute la fiche nouvelle dans la même tâche (12 ms sur l'A37, un gel de 50 ms à l'ouverture, S41, 16/11).
      const ouverture = feuille.hidden;
      const meme = !o.focus && feuille.dataset.id === m.id && !ouverture;
      if (!meme) annonce.textContent = '';
      const actif = document.activeElement as HTMLElement | null;
      const rangFocus = meme && actif && actif !== feuille && feuille.contains(actif) ? focusables().indexOf(actif) : -1;
      const defile = meme ? feuille.scrollTop : 0;
      // En haut de la fiche nouvelle (un voisin remplace la fiche défilée) : remise à zéro avant le remplacement,
      // tant que la mise en page est à jour. Une feuille cachée n'a rien à remettre : fermer() l'a remise en haut.
      if (o.focus && !ouverture && feuille.scrollTop) feuille.scrollTop = 0;
      // Une ouverture (la feuille était cachée) : l'animation de carte.css part, sauf mouvement réduit.
      if (ouverture && globalThis.matchMedia?.('(prefers-reduced-motion: no-preference)').matches) feuille.style.willChange = 'transform';
      modele = m;
      avecAvant = o.avant;
      versBilan = !!o.bilan;
      feuille.dataset.id = m.id;
      feuille.dataset.sorte = m.sorte;
      arreterHeure();
      feuille.replaceChildren(rendre(m));
      if (heures.length) minuteur = setInterval(refaireHeure, DELAI_HEURE_MS);
      voile.hidden = false;
      feuille.hidden = false;
      if (o.focus) {
        // Le focus au titre : le lecteur d'écran dit son nom. Le titre est en haut, rien à faire défiler.
        feuille.querySelector<HTMLElement>('#fiche-titre')?.focus({ preventScroll: true });
      } else if (meme) {
        feuille.scrollTop = defile;
        if (rangFocus >= 0) focusables()[rangFocus]?.focus();
      }
    },
    drapeaux(adresses) {
      if (!modele) return;
      modele = { ...modele, drapeaux: adresses };
      poserDrapeaux(modele);
    },
    fermer() {
      finMontee();
      arreterHeure();
      modele = null;
      // Remise en haut avant d'être cachée : Chromium garde le défilement d'un élément caché et le rend quand il
      // réapparaît ; montrer() n'y touche plus à l'ouverture (aucune mise en page forcée, § 6.4).
      if (feuille.scrollTop) feuille.scrollTop = 0;
      feuille.hidden = true;
      voile.hidden = true;
      annonce.textContent = '';
      feuille.replaceChildren();
      delete feuille.dataset.id;
    },
  };
}
