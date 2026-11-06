// Rejeu du journal : l'état FSRS de chaque fiche se recalcule à partir des
// événements (journal.ts), sans instantané. Coût mesuré sur le PC (Ryzen
// 3600) : ~15 000 notes (un an, 195 fiches) en 55 à 90 ms, dont ~16 ms de
// validation et tri, le reste dans ts-fsrs ; plusieurs fois plus sur le
// téléphone, et croissant avec l'âge du journal. Donc rejouer une fois à
// l'ouverture, puis appliquer chaque nouvelle note à l'état en mémoire (même
// règle d'une note par fiche et par jour), jamais un rejeu par réponse ; un
// instantané si le journal passe un an. Le résultat ne dépend que de l'ensemble des événements :
// ni de leur ordre, ni de leurs doublons, ni de l'appareil qui rejoue ; deux
// journaux s'unissent donc sans conflit (synchro du J1b).

import { echeance, planificateur, PARAMS_FSRS, type CarteFsrs, type ParamsFsrs } from './fsrs';
import { valider, type Evenement } from './journal';
import { jour } from './jour';

export interface EtatFiche {
  fiche: string;
  carte: CarteFsrs;
  /** Jour local de la première note FSRS (depuis la dernière réinitialisation). */
  introduite_jour: number;
  /** Jour local de la dernière note FSRS appliquée. */
  dernier_jour: number;
  /** Jour local où la fiche redevient due. */
  echeance_jour: number;
  /** Notes FSRS appliquées (une par jour au plus). */
  notes: number;
  /** Parmi elles, les Again. */
  echecs: number;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Contenu d'un événement sous une forme unique (champs triés par nom). */
function canonique(e: Evenement): string {
  return JSON.stringify(Object.keys(e).sort().map((k) => [k, (e as unknown as Record<string, unknown>)[k]]));
}

/**
 * Ordre total du rejeu : instant, puis appareil, puis id, puis contenu.
 * Le contenu ne départage que deux événements de même id, ts et appareil
 * mais différents (corruption, bug d'écriture, union de deux journaux) : le
 * gardé ne dépend alors pas de l'ordre d'arrivée.
 */
export function comparer(a: Evenement, b: Evenement): number {
  return a.ts - b.ts || cmp(a.appareil, b.appareil) || cmp(a.id, b.id) || cmp(canonique(a), canonique(b));
}

/**
 * Événements valides, sans doublon d'id, dans l'ordre du rejeu. Un id désigne
 * un seul événement : s'il revient (renvoi, union de deux journaux), le
 * premier dans l'ordre du rejeu est gardé. Les événements mal formés sont
 * ignorés (un journal abîmé ne bloque pas l'appli).
 */
export function ordonner(evenements: Iterable<unknown>): Evenement[] {
  const valides = [...evenements].filter(valider).sort(comparer);
  const vus = new Set<string>();
  return valides.filter((e) => (vus.has(e.id) ? false : (vus.add(e.id), true)));
}

/**
 * État de chaque fiche notée au moins une fois. Par fiche, seule la première
 * note FSRS (note != null) d'un jour local s'applique : les suivantes du même
 * jour (reprise dans la séance, second appareil) sont ignorées, ainsi qu'une
 * note datée d'un jour antérieur à la dernière appliquée (fuseau changé en
 * voyage). 'reinitialiser' remet la fiche à neuf (absente de l'état jusqu'à
 * sa prochaine note) ; 'connu' est réservé et sans effet au J1a.
 */
export function etat(evenements: Iterable<unknown>, params: ParamsFsrs = PARAMS_FSRS): Map<string, EtatFiche> {
  const p = planificateur(params);
  const fiches = new Map<string, EtatFiche>();
  for (const e of ordonner(evenements)) {
    if (e.type === 'reinitialiser') {
      fiches.delete(e.fiche);
      continue;
    }
    if (e.type !== 'reponse' || e.note == null) continue;
    const j = jour(e.ts, e.tz);
    const avant = fiches.get(e.fiche);
    if (avant && j <= avant.dernier_jour) continue;
    const carte = p.noter(avant?.carte ?? p.neuve(j), j, e.note);
    fiches.set(e.fiche, {
      fiche: e.fiche,
      carte,
      introduite_jour: avant?.introduite_jour ?? j,
      dernier_jour: j,
      echeance_jour: echeance(carte),
      notes: (avant?.notes ?? 0) + 1,
      echecs: (avant?.echecs ?? 0) + (e.note === 1 ? 1 : 0),
    });
  }
  return fiches;
}
