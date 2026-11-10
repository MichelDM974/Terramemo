// Noms et scores affichés des épreuves classées (décisions « Points et
// classement », « Sans faute et Minute ») : le Chrono compte des points,
// Sans faute les justes d'affilée, Minute les justes en une minute. Le même
// champ `points` les porte tous (src/epreuve/chrono.ts) ; seul l'affichage
// change, ici.
import { DELAI_CHRONO_MS, type ScoreEpreuve } from '../epreuve/bareme';
import { DUREE_MINUTE_MS, type ModeClasse, type ModeEpreuve } from '../epreuve/chrono';
import { remplir, textes } from './textes';

const E = textes.epreuves;

/** « Chrono », « Sans faute », « Minute ». */
export const nomMode = (m: ModeEpreuve): string => E[m].nom;

/** Secondes annoncées au départ et dans Jouer : par question (Chrono, Sans faute), ou la minute. */
export const secondesMode = (m: ModeEpreuve): number => (m === 'minute' ? DUREE_MINUTE_MS : DELAI_CHRONO_MS.localiser) / 1000;

export const fmtPts = (n: number): string => n.toLocaleString('fr-FR');

/** « 42 s », « 3 min 05 ». */
export function fmtTemps(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

/** « 0 erreur », « 1 erreur », « 2 erreurs » (le pluriel français commence à 2). */
const nombre = (n: number, un: string, plusieurs: string) => remplir(n >= 2 ? plusieurs : un, { n: fmtPts(n) });
export const fmtJustes = (n: number): string => nombre(n, E.juste_1, E.justes);
export const fmtErreurs = (n: number): string => nombre(n, E.erreur_1, E.erreurs);

/**
 * Le score en bref (départ, écran des classements) : « 12 450 pts », « 17
 * d'affilée », « 23 justes ». Le quiz, et un mode inconnu, comptent des
 * points comme le Chrono.
 */
export function scoreCourt(mode: ModeClasse | null, points: number): string {
  if (mode === 'sansfaute') return remplir(E.sansfaute.compte, { n: fmtPts(points) });
  if (mode === 'minute') return fmtJustes(points);
  return remplir(E.pts, { n: fmtPts(points) });
}

/**
 * Le score en entier (records du bilan) : « 12 450 points en 3 min 05 »,
 * « 17 d'affilée en 1 min 02 », « 23 justes · 2 erreurs » (« 24 justes en
 * 45 s · 0 erreur » quand la série est vidée avant la minute).
 */
export function scoreLong(mode: ModeEpreuve, s: ScoreEpreuve): string {
  const temps = fmtTemps(s.temps_ms);
  if (mode === 'sansfaute') return remplir(E.affilee_en, { n: fmtPts(s.points), temps });
  if (mode === 'minute') {
    const justes = s.temps_ms < DUREE_MINUTE_MS ? remplir(E.en_temps, { score: fmtJustes(s.justes), temps }) : fmtJustes(s.justes);
    return `${justes} · ${fmtErreurs(s.questions - s.justes)}`;
  }
  return remplir(E.points_en, { points: fmtPts(s.points), temps });
}

/**
 * Dernière colonne d'une ligne de classement, ce qui départage : le temps ; en
 * Minute, les erreurs (précédées du temps quand la série est vidée avant la minute).
 */
export function departage(mode: ModeClasse | null, s: ScoreEpreuve): string {
  if (mode !== 'minute') return fmtTemps(s.temps_ms);
  const erreurs = fmtErreurs(s.questions - s.justes);
  return s.temps_ms < DUREE_MINUTE_MS ? `${fmtTemps(s.temps_ms)} · ${erreurs}` : erreurs;
}
