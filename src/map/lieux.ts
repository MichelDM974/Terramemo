// Index commun des zones d'une carte (étude J2, § 4.2) : pays (ou communes) et
// zones marines, par id. ecran, vise, montrer et marquer des trois rendus le
// lisent pour les uns comme pour les autres (noter aussi, lot 3a, partie C).
// Les ids des mers (8 lettres minuscules) ne recoupent aucun id de pays.json
// (tests/donnees-mers.test.ts).
import type { DonneesCarte } from './donnees';
import type { Forme, Lieu } from './types';

/** La couche d'une zone : celle des pays (donnees.entites) ou la couche marine (donnees.mers). */
export type CoucheLieu = 'pays' | 'mers';

export interface LieuIndexe {
  lieu: Lieu;
  forme: Forme;
  couche: CoucheLieu;
  /** Sa place dans donnees.entites ou donnees.mers (les calques du Canvas, les formes du maillage WebGL). */
  i: number;
}

/** id → zone, pays d'abord : un id commun aux deux couches (aucun aujourd'hui) resterait au pays. */
export function indexLieux(d: Pick<DonneesCarte<Lieu>, 'entites' | 'mers'>): Map<string, LieuIndexe> {
  const index = new Map<string, LieuIndexe>();
  d.entites.forEach((e, i) => index.set(e.pays.id, { lieu: e.pays, forme: e.forme, couche: 'pays', i }));
  d.mers.forEach((e, i) => {
    if (!index.has(e.pays.id)) index.set(e.pays.id, { lieu: e.pays, forme: e.forme, couche: 'mers', i });
  });
  return index;
}
