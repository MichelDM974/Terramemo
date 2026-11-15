// Index commun des zones d'une carte (étude J2, § 4.2) : pays (ou communes) et
// zones marines, par id. ecran, vise, montrer et marquer des trois rendus le
// lisent pour les uns comme pour les autres, et noter (pick.ts), qui y trouve
// la couche de sa cible.
// Les ids des mers (8 lettres minuscules) ne recoupent aucun id de pays.json
// (tests/donnees-mers.test.ts).
import type { Position } from 'geojson';
import type { DonneesCarte } from './donnees';
import { anneauPrincipal, centreEmprise, contourEmprise, recentrerBande } from './geo';
import { empriseMer } from './mers';
import type { Forme, Lieu, Mer } from './types';

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

/**
 * Le point et le contour d'une zone à cadrer entière (montrerZone des trois
 * rendus) : un pays, son point d'étiquette et son polygone principal
 * (anneauPrincipal : la Sicile comprise, la Guyane non) ; une mer, le milieu
 * et le bord de son emprise entière (étude J2, § 4.5 : pas la moitié du
 * Pacifique), une bande de 360° (l'Arctique, l'Austral) recentrée sur lon,
 * la rotation du moment. null : une mer inconnue de la couche.
 */
export function contourZone(li: LieuIndexe, mers: readonly Mer[], lon: number): { point: [number, number]; contour: readonly Position[] } | null {
  if (li.couche === 'mers') {
    const e = empriseMer(li.lieu.id, mers);
    if (!e) return null;
    const b = recentrerBande(e, lon);
    return { point: centreEmprise(b), contour: contourEmprise(b) };
  }
  return { point: [li.lieu.point[0], li.lieu.point[1]], contour: anneauPrincipal(li.forme, li.lieu.point) };
}
