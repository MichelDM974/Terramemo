// Les données du quiz seul (étude J2 § 2.4, § 9.2), chargées avec lui et
// jamais au premier affichage (décision « Hébergement ») : la notoriété des
// lieux (public/geo/notoriete.json, geodata/notoriete.mjs, D48 b) et les
// paires de drapeaux proches (public/geo/drapeaux-proches.json,
// geodata/drapeaux.mjs ; décision « Leurres de drapeaux au quiz »).
import type { Niveau } from './types';

/** public/geo/notoriete.json : un niveau par lieu jouable de chaque sujet. */
export interface Notoriete {
  v: 1;
  /** Par id de pays jouable. */
  pays: Readonly<Record<string, Niveau>>;
  /** Par Qid de capitale juste d'un pays jouable (Taipei n'y est pas). */
  capitales: Readonly<Record<string, Niveau>>;
  /** Par id de pays jouable : le niveau du pays. */
  drapeaux: Readonly<Record<string, Niveau>>;
  /** Par id de zone marine. */
  mers: Readonly<Record<string, Niveau>>;
}

/** Les paires de drapeaux de score ≤ seuil (0 : pareils, 1 : rien de commun). */
export interface ProchesDrapeaux {
  seuil: number;
  /** Le score de la paire (symétrique) ; undefined : éloignés (au-dessus du seuil). */
  score(a: string, b: string): number | undefined;
  /** Les pays proches de celui-ci, du plus proche au moins proche (puis par id). */
  de(id: string): readonly { id: string; score: number }[];
}

interface ProchesBruts {
  v: number;
  seuil: number;
  paires: [string, string, number][];
}

/** La notoriété lue ; lève sur une version inconnue ou une section absente. */
export function lireNotoriete(brut: unknown): Notoriete {
  const n = brut as Partial<Notoriete> | null;
  if (!n || n.v !== 1 || !n.pays || !n.capitales || !n.drapeaux || !n.mers) throw new Error('notoriete.json : version ou section inconnue');
  return n as Notoriete;
}

/** Les paires proches lues ; lève sur une version inconnue. */
export function lireProches(brut: unknown): ProchesDrapeaux {
  const p = brut as Partial<ProchesBruts> | null;
  if (!p || p.v !== 1 || !Array.isArray(p.paires) || typeof p.seuil !== 'number') throw new Error('drapeaux-proches.json : version inconnue');
  const parPays = new Map<string, { id: string; score: number }[]>();
  const ajouter = (a: string, b: string, score: number) => {
    let l = parPays.get(a);
    if (!l) parPays.set(a, (l = []));
    l.push({ id: b, score });
  };
  for (const [a, b, s] of p.paires) {
    ajouter(a, b, s);
    ajouter(b, a, s);
  }
  for (const l of parPays.values()) l.sort((x, y) => x.score - y.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return {
    seuil: p.seuil,
    score: (a, b) => parPays.get(a)?.find((x) => x.id === b)?.score,
    de: (id) => parPays.get(id) ?? [],
  };
}

/** Lit un fichier JSON servi ; « <fichier> : HTTP xxx » levé comme les autres chargements. */
export type Lecteur = (chemin: string) => Promise<unknown>;

const lireHttp: Lecteur = async (chemin) => {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error(`${chemin.split('/').pop()} : HTTP ${r.status}`);
  return r.json();
};

export interface DonneesQuizBrutes {
  notoriete: Notoriete;
  proches: ProchesDrapeaux;
}

let chargees: DonneesQuizBrutes | null = null;
let enCours: Promise<DonneesQuizBrutes> | null = null;

/**
 * La notoriété et les paires proches, lues une fois (promesse gardée ; un
 * échec, hors ligne, ne reste pas en cache : la prochaine partie réessaie).
 * `lire` : les tests.
 */
export function chargerDonneesQuiz(lire: Lecteur = lireHttp, base = '/geo/'): Promise<DonneesQuizBrutes> {
  if (chargees) return Promise.resolve(chargees);
  if (!enCours) {
    const p = Promise.all([lire(`${base}notoriete.json`), lire(`${base}drapeaux-proches.json`)]).then(([n, d]) => {
      chargees = { notoriete: lireNotoriete(n), proches: lireProches(d) };
      return chargees;
    });
    enCours = p;
    p.then(
      () => (enCours = null),
      () => (enCours = null),
    );
  }
  return enCours;
}

/** Les données du quiz si elles sont déjà lues (sans réseau), null sinon. */
export const donneesQuizChargees = (): DonneesQuizBrutes | null => chargees;

/** Tests : oublie ce qui a été lu. */
export function oublierDonneesQuiz(): void {
  chargees = null;
  enCours = null;
}
