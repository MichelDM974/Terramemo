// La ligne de faits de la barre du bas, et les habitants de la ligne du nom (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.1) : ce qu'elles disent d'un lieu, une fois ses données lues. Elle part avec le morceau de la
// fiche (src/vues/fiche.ts la réexporte), comme les nombres (format.ts) et les textes
// (textes-fiche.fr.json) qu'elle emploie : le chargeur demande ce morceau avec les données
// (src/fiches/chargeur.ts), la ligne n'attend donc rien de plus (§ 19). explorer.ts pose la ligne.
import type { FicheCommune, FicheMer, FicheMonde } from './donnees';
import { fmtHabitantsCourt, fmtSuperficieMer } from './format';
import { LIGNES_RELUES, type LigneRelue } from './relues';
import { remplir } from '../vues/textes';
import { textesFiche } from '../vues/textes-fiche';

type Relues = Readonly<Record<LigneRelue, boolean>>;

/** Une mer : « océan Atlantique · 2,5 millions de km² » ; un océan, sa superficie ; la superficie une fois relue (lot F4). */
export function faitsMer(f: FicheMer, oceans: readonly string[], relues: Relues = LIGNES_RELUES): string {
  const sup = f.superficie && relues.superficie_mers ? fmtSuperficieMer(f.superficie.km2, false) : '';
  return [oceans.join(', '), sup].filter(Boolean).join(' · ');
}

/** Une commune (lot F5) : « 85 000 hab. ». */
export const faitsCommune = (f: FicheCommune): string => fmtHabitantsCourt(f.habitants.n);

/**
 * Les habitants d'un pays ou d'un territoire, sur la ligne de son nom (18/11, choix de l'utilisateur : derrière
 * la capitale, on les croyait ceux de la capitale) : « 123 millions d'hab. », « aucun habitant permanent » ;
 * rien sans chiffre. explorer.ts les pose dans .barre-habitants.
 */
export function habitantsBarre(f: FicheMonde | undefined): string {
  const h = f?.habitants;
  return h ? (h.annee === null ? textesFiche.aucun_habitant : fmtHabitantsCourt(h.n)) : '';
}

/** « Capitale : Tokyo » ; plusieurs : « Capitales : La Paz, Sucre » ; aucune : rien. */
function ligneCapitales(noms: readonly string[]): string {
  if (!noms.length) return '';
  return remplir(noms.length > 1 ? textesFiche.barre_capitales : textesFiche.barre_capitale, { noms: noms.join(', ') });
}

/**
 * Un territoire (lot F3) : « Capitale : Nuuk », une fois relue, sinon rien (ses habitants sont sur la ligne
 * du nom) ; une zone contestée et l'Antarctique : rien (ils n'appellent pas cette fonction).
 */
export function faitsTerritoire(f: FicheMonde, relues: Relues = LIGNES_RELUES): string {
  return relues.capitale_territoires && f.capitale ? ligneCapitales([f.capitale]) : '';
}

/** Un pays : « Capitale : Tokyo » ; plusieurs capitales : « Capitales : La Paz, Sucre ». */
export function faitsPays(capitales: readonly string[]): string {
  return ligneCapitales(capitales);
}
