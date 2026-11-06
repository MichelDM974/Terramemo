// Teintes de la carte de la mémoire (J1a, #2) : chaque zone peut prendre un
// seau 0..NB_SEAUX-1, que les trois rendus peignent dans --memoire-<seau>
// (src/carte.css) ; absente, elle garde --terre (« jamais vu »). Les marques
// (choisi, juste, faux), les hachures et le contour de la zone fausse restent
// par-dessus. Posées par teinter() (CarteAffichee), à part des marques : un
// toucher (marquer, effacerMarques) ne les retire ni ne les retrace.

/** Seau de chaque zone, par id ; absente : pas de teinte. */
export type Teintes = ReadonlyMap<string, number>;

/**
 * Nombre de seaux (--memoire-0 à --memoire-4, classes .s0 à .s4) : défaut en
 * attente de l'utilisateur, #2 (D7 : 5 seaux de stabilité FSRS, docs/plan.md).
 */
export const NB_SEAUX = 5;

/** Les variables CSS des seaux, dans l'ordre (lireCouleurs du Canvas et du WebGL). */
export const VARIABLES_MEMOIRE: readonly string[] = Array.from({ length: NB_SEAUX }, (_, s) => `--memoire-${s}`);

/** Classe SVG d'un seau (.pays.s3, .pastille.s3 : carte.css). */
export const classeSeau = (s: number): string => `s${s}`;

/** Le seau d'une valeur, ou null : hors de 0..NB_SEAUX-1 ou pas entier, la zone n'est pas teintée. */
export function seau(s: number | undefined): number | null {
  return s !== undefined && Number.isInteger(s) && s >= 0 && s < NB_SEAUX ? s : null;
}

/**
 * Crochet d'essai ?teintes=demo (src/main.ts) : chaque id un seau tiré de son
 * hachage (FNV-1a 32 bits), le même à chaque chargement, pour les captures et
 * les mesures de la carte teintée avant que le J1a ne la colore.
 */
export function teintesDemo(ids: readonly string[]): Map<string, number> {
  const t = new Map<string, number>();
  for (const id of ids) {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
    t.set(id, (h >>> 0) % NB_SEAUX);
  }
  return t;
}
