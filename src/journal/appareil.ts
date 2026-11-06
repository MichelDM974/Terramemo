// Identifiant de l'appareil (champ appareil des événements, src/srs/journal.ts) :
// un uuid créé une fois et gardé dans le localStorage. Il départage deux
// événements du même instant au rejeu et distingue les appareils à la
// synchro. Effacer les données du site en donne un nouveau, comme le journal.

import { estUuid, uuid } from './uuid';

export const CLE_APPAREIL = 'terramemo.appareil';

type Stockage = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage, ou null s'il est refusé (navigation privée stricte, cookies bloqués). */
export function stockageLocal(): Stockage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * L'id de l'appareil : celui du stockage s'il en a un valide, sinon un
 * nouveau, gardé aussitôt. Sans stockage (ou s'il refuse d'écrire), un id
 * neuf à chaque appel : l'appelant le lit une fois au démarrage et le garde
 * pour la session.
 */
export function idAppareil(stockage: Stockage | null = stockageLocal(), nouveau: () => string = uuid): string {
  try {
    const garde = stockage?.getItem(CLE_APPAREIL);
    if (estUuid(garde)) return garde;
  } catch {
    // stockage illisible : comme absent
  }
  const id = nouveau();
  try {
    stockage?.setItem(CLE_APPAREIL, id);
  } catch {
    // quota, stockage refusé : l'id vaut pour cette session
  }
  return id;
}
