// La sorte d'un lieu qu'on peut toucher (fiche d'un lieu, #34 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.9) : pure, sans rien
// charger, pour que la barre sache quoi demander avant d'avoir les données
// (§ 6.1 : le fichier des fiches du monde, celui des mers, celui des
// communes). tests/donnees-fiches.test.ts la confronte aux fichiers des fiches.
import { estIdMer } from '../map/mers';
import type { NomTerrain, Statut } from '../map/types';

/**
 * Pays (les 195 jouables, plus Kosovo et Taïwan), territoire, zone contestée
 * (une entité de pays.json, jamais une des 77 zones hachurées, que pick ne
 * désigne pas), continent (l'Antarctique), océan ou mer, commune de l'île.
 */
export type SorteLieu = 'pays' | 'territoire' | 'zone' | 'continent' | 'mer' | 'commune';

/**
 * La sorte du lieu `id` touché sur `terrain` ; `statut` : celui de son entité
 * (pays.json), absent pour une mer. null : rien qu'une fiche sache dire (un
 * id du monde sans statut qui n'est pas une mer).
 */
export function sorteDeLieu(id: string, terrain: NomTerrain, statut?: Statut): SorteLieu | null {
  if (estIdMer(id)) return 'mer';
  if (terrain === 'reunion') return 'commune';
  switch (statut) {
    case 'jouable':
    case 'optionnel':
      return 'pays';
    case 'territoire':
      return 'territoire';
    case 'conteste':
      return 'zone';
    case 'autre':
      return 'continent';
    default:
      return null;
  }
}
