// Fiches de la répétition espacée (docs/plan.md : « une fiche = (fait, sens) »).
// Une fiche s'écrit `<domaine>:<id>:<sens>`, par exemple `pays:FRA:localiser`
// ou `communes:97411:localiser` ; `id` est celui de l'entité (pays.json,
// reunion/communes.json), sans « : » (ISO3, NE_…, code INSEE). Capitales et
// drapeaux prennent l'id du pays (`capitales:BOL:localiser`), les mers le
// leur, de 8 lettres au plus (`mers:medit:localiser` ; étude J2 § 3.1, 3.3).
import type { NomTerrain } from '../map/types';

/**
 * Un domaine = un sujet de Jouer, du même nom (étude J2 § 3.1). Ces noms vont
 * au journal, aux lots en ligne et à l'export : figés à vie.
 */
export type Domaine = 'pays' | 'communes' | 'capitales' | 'drapeaux' | 'mers';
/** localiser : « où est X ? » (Trouver) ; nommer : « quel est ce pays ? » (Reconnaître). */
export type Sens = 'localiser' | 'nommer';

/**
 * Les domaines que cette version sait LIRE (journal, lots, export, rejeu) :
 * tous ceux du J2, avant qu'aucune version ne les écrive, pour qu'un lot
 * mixte (une Révision du jour qui mêle pays et capitales) reste lisible
 * (étude J2 § 3.3). Lire n'est pas savoir poser : DOMAINES_JOUABLES.
 */
export const DOMAINES: readonly Domaine[] = ['pays', 'communes', 'capitales', 'drapeaux', 'mers'];

/**
 * Les domaines que cette version sait POSER : les sujets livrés (étude J2
 * § 3.1). Révision du jour, comptes de Jouer, introductions et carte de la
 * mémoire ne prennent qu'eux ; les fiches d'un autre domaine restent au
 * journal, intactes, et entrent en séance à la mise à jour qui livre leur
 * sujet. Capitales au lot 1, drapeaux au lot 2, mers au lot 3b. Dans
 * l'ordre des sujets de Jouer (D53 b) : celui du choix du sujet de la carte
 * de la mémoire.
 */
export const DOMAINES_JOUABLES: readonly Domaine[] = ['pays', 'capitales', 'drapeaux', 'mers', 'communes'];

/** Le terrain où se jouent les fiches d'un domaine : l'île pour les communes, le monde pour les autres. */
export const TERRAIN_DOMAINE: Readonly<Record<Domaine, NomTerrain>> = { pays: 'monde', communes: 'reunion', capitales: 'monde', drapeaux: 'monde', mers: 'monde' };

/** Le nom est-il celui d'un domaine (un sujet de Jouer qui a ses fiches) ? */
export const estDomaine = (x: string): x is Domaine => (DOMAINES as readonly string[]).includes(x);

/** Le domaine se pose-t-il dans cette version (DOMAINES_JOUABLES) ? */
export const domaineJouable = (d: string): d is Domaine => (DOMAINES_JOUABLES as readonly string[]).includes(d);

/**
 * Les domaines jouables d'un terrain, dans l'ordre de DOMAINES_JOUABLES (le
 * monde : pays ; l'île : communes). `jouables` : une autre liste (tests qui
 * mêlent un sujet pas encore livré).
 */
export const jouablesDu = (t: NomTerrain, jouables: readonly Domaine[] = DOMAINES_JOUABLES): Domaine[] => jouables.filter((d) => TERRAIN_DOMAINE[d] === t);

export const SENS: readonly Sens[] = ['localiser', 'nommer'];

/**
 * Les entités d'un domaine qui n'ont jamais de fiche nommer : D37 c, les 9
 * pays dont la capitale porte le nom (Reconnaître serait gratuit : Luxembourg
 * allumé, « Luxembourg » parmi 4). Ni introduites ni posées en QCM (Apprendre,
 * Reconnaître), ni prises en leurre ; elles restent en Trouver, dans les
 * séries et dans les épreuves. Écrites ici pour que la planification (pure)
 * les connaisse sans charger capitales.json ; le test les confronte à ses
 * lignes m: 1.
 */
export const SANS_NOMMER: Readonly<Partial<Record<Domaine, ReadonlySet<string>>>> = {
  capitales: new Set(['DJI', 'GTM', 'KWT', 'LUX', 'MCO', 'PAN', 'SGP', 'SMR', 'VAT']),
};

/** L'entité a-t-elle une fiche nommer dans ce domaine (posée en QCM, en carte retournée) ? */
export const nommerPose = (domaine: Domaine, id: string): boolean => !SANS_NOMMER[domaine]?.has(id);

/**
 * Sens révisés au J1a (décision « Sens « quel est ce pays ? » » du 06/11) :
 * localiser (Trouver) et nommer, qui se révise en carte retournée (la zone
 * s'allume, on pense au nom, « Révéler », puis « Je savais » ou « Je ne
 * savais pas ») en attendant la saisie du J1b.
 */
export const SENS_ACTIFS: readonly Sens[] = ['localiser', 'nommer'];

/**
 * Sens par lequel une entité entre dans la mémoire : sa grappe (QCM puis
 * rappel au toucher) introduit la fiche localiser ; la sœur nommer vient au
 * plus tôt le lendemain (planif.ts, introductions), jamais le même jour.
 */
export const SENS_ENTREE: Sens = 'localiser';

export interface Fiche {
  domaine: Domaine;
  id: string;
  sens: Sens;
}

/** Identifiant de fiche ; lève une erreur sur un id vide ou qui contient « : ». */
export function former(domaine: Domaine, id: string, sens: Sens): string {
  if (!id || id.includes(':')) throw new Error(`id d'entité invalide pour une fiche : « ${id} »`);
  return `${domaine}:${id}:${sens}`;
}

/** Fiche d'un identifiant, ou null s'il n'est pas de la forme `<domaine>:<id>:<sens>` connue. */
export function analyser(fiche: string): Fiche | null {
  const parts = fiche.split(':');
  if (parts.length !== 3) return null;
  const [domaine, id, sens] = parts as [string, string, string];
  if (!estDomaine(domaine)) return null;
  if (!(SENS as readonly string[]).includes(sens)) return null;
  if (!id) return null;
  return { domaine, id, sens: sens as Sens };
}

/**
 * Fiche sœur : la même entité dans l'autre sens. Deux sœurs ne sont jamais
 * dues le même jour (planif.ts). null si l'identifiant n'est pas une fiche.
 */
export function soeur(fiche: string): string | null {
  const f = analyser(fiche);
  if (!f) return null;
  return former(f.domaine, f.id, f.sens === 'localiser' ? 'nommer' : 'localiser');
}

/** Fiches d'une entité dans ces sens (par défaut le sens d'entrée seul : celles qu'une grappe introduit). */
export function fichesDe(domaine: Domaine, id: string, sens: readonly Sens[] = [SENS_ENTREE]): string[] {
  return sens.map((s) => former(domaine, id, s));
}
