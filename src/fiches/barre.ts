// La ligne de faits de la barre du bas (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 4.1) : ce qu'elle dit d'un lieu, une fois ses données lues. Elle part avec le morceau de la
// fiche (src/vues/fiche.ts la réexporte), comme les nombres (format.ts) et les textes
// (textes-fiche.fr.json) qu'elle emploie : le chargeur demande ce morceau avec les données
// (src/fiches/chargeur.ts), la ligne n'attend donc rien de plus (§ 19). explorer.ts pose la ligne.
import type { FicheCommune, FicheMer, FicheMonde } from './donnees';
import { fmtHabitantsCourt, fmtSuperficieMer } from './format';
import { LIGNES_RELUES, type LigneRelue } from './relues';
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
 * Un territoire (lot F3) : « Nuuk · 56 800 hab. », la capitale une fois relue, sinon les habitants
 * seuls ; une zone contestée et l'Antarctique : rien (ils n'appellent pas cette fonction).
 */
export function faitsTerritoire(f: FicheMonde, relues: Relues = LIGNES_RELUES): string {
  const h = f.habitants;
  const capitale = relues.capitale_territoires ? f.capitale : undefined;
  return [capitale, h ? (h.annee === null ? textesFiche.aucun_habitant : fmtHabitantsCourt(h.n)) : ''].filter(Boolean).join(' · ');
}

/** Un pays : « Tokyo · 123 millions d'hab. » ; plusieurs capitales : « La Paz, Sucre · … ». */
export function faitsPays(capitales: readonly string[], f: FicheMonde | undefined): string {
  const h = f?.habitants;
  return [capitales.join(', '), h ? fmtHabitantsCourt(h.n) : ''].filter(Boolean).join(' · ');
}
