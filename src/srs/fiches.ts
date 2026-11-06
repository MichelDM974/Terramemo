// Fiches de la répétition espacée (docs/plan.md : « une fiche = (fait, sens) »).
// Une fiche s'écrit `<domaine>:<id>:<sens>`, par exemple `pays:FRA:localiser`
// ou `communes:97411:localiser` ; `id` est celui de l'entité (pays.json,
// reunion/communes.json), sans « : » (ISO3, NE_…, code INSEE).

export type Domaine = 'pays' | 'communes';
/** localiser : « où est X ? » (Trouver) ; nommer : « quel est ce pays ? » (Reconnaître). */
export type Sens = 'localiser' | 'nommer';

export const DOMAINES: readonly Domaine[] = ['pays', 'communes'];
export const SENS: readonly Sens[] = ['localiser', 'nommer'];

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
  if (!(DOMAINES as readonly string[]).includes(domaine)) return null;
  if (!(SENS as readonly string[]).includes(sens)) return null;
  if (!id) return null;
  return { domaine: domaine as Domaine, id, sens: sens as Sens };
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
