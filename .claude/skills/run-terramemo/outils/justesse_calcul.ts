// Justesse des prévisions de FSRS (#4, lot 6 de l'étude J2, § 12) : le
// journal de l'appareil se rejoue avec le code de l'appli (ordonner() et
// appliquer() de src/srs/rejeu.ts, ts-fsrs aux paramètres PARAMS_FSRS de
// src/srs/fsrs.ts, mêmes dates synthétiques que dateDuJour()) ; pour chaque
// révision d'une fiche déjà apprise, la probabilité de rappel que FSRS
// prévoyait ce jour-là (get_retrievability de l'état d'avant la note, le
// même R que ts-fsrs prend pour calculer la note suivante) est confrontée
// au résultat réel. Module pur : justesse.mjs l'empaquette (rolldown) pour la
// ligne de commande, tests/justesse-outil.test.ts l'importe tel quel.
//
// Ce qui compte comme révision : un événement 'reponse' à note FSRS (note
// non null : modes rappel et revision, dont la carte retournée) que le rejeu
// de l'appli applique (la première note de la fiche ce jour local, pas
// datée d'avant la dernière appliquée), sur une fiche qui a déjà un état
// (au moins une note depuis sa dernière réinitialisation). Hors compte :
// - la première note d'une fiche (rappel d'une grappe nouvelle,
//   introduction d'une fiche nommer en carte retournée, première note après
//   'reinitialiser') : FSRS n'a encore rien prévu ;
// - les réponses à note null : QCM d'Apprendre, reprises en fin de séance,
//   seconde réponse du jour à une fiche, parties libres (Jouer : Toucher,
//   Chrono, séries, épreuves, quiz), aucune n'entre dans FSRS ;
// - les notes que le rejeu ignore (même jour local qu'une note déjà
//   appliquée, second appareil compris ; jour antérieur, fuseau changé).
// Réussite : note différente d'Again (1), la règle de note.ts (juste au
// premier toucher sans « Voir » ni « Passer » ; « je savais » en carte
// retournée) : ce que FSRS lui-même prend pour un rappel.
import { fsrs } from 'ts-fsrs';
import { analyser } from '../../../../src/srs/fiches';
import { dateDuJour, PARAMS_FSRS, planificateur, type ParamsFsrs } from '../../../../src/srs/fsrs';
import { jour } from '../../../../src/srs/jour';
import { appliquer, ordonner, type EtatFiche } from '../../../../src/srs/rejeu';

/** En dessous, l'écart prévu/réel n'est pas encore mesurable (critère de fin de #4). */
export const SEUIL = 300;
/** Bornes des tranches de probabilité prévue (la rétention visée est 0,9). */
export const BORNES_P: readonly number[] = [0.5, 0.7, 0.8, 0.85, 0.9, 0.95];
/** Bornes des tranches de jours écoulés depuis la note précédente. */
export const BORNES_JOURS: readonly number[] = [2, 4, 8, 16];
/** Un sous-groupe (sujet, sens) n'a ses tranches détaillées qu'à partir de ce compte. */
export const SEUIL_DETAIL = SEUIL;

/** Une révision comptée : jamais sortie du module (ni fiche, ni date). */
export interface Revision {
  domaine: string;
  sens: string;
  /** Probabilité de rappel prévue par FSRS ce jour-là. */
  p: number;
  reussi: boolean;
  /** Jours locaux écoulés depuis la note précédente appliquée. */
  jours: number;
  /** Le jour atteint ou dépasse l'échéance que FSRS avait fixée. */
  due: boolean;
  /** rappel (étape d'Apprendre, d'ordinaire une première note) ou revision. */
  mode: string;
  /** La note précédente appliquée à la fiche était un Again. */
  apres_echec: boolean;
}

export interface Tranche {
  libelle: string;
  n: number;
  reussites: number;
  prevu: number | null;
  observe: number | null;
  /** observé − prévu : > 0, FSRS pessimiste ; < 0, optimiste. */
  ecart: number | null;
  /** Intervalle de Wilson à 95 % du taux observé. */
  ic95: [number, number] | null;
}

export interface Agregat {
  n: number;
  reussites: number;
  prevu: number | null;
  observe: number | null;
  /** Intervalle de Wilson à 95 % du taux observé. */
  ic95: [number, number] | null;
  /** observé − prévu moyen. */
  biais: number | null;
  /** Écart absolu moyen entre prévu et observé par tranche, pondéré par l'effectif (ECE). */
  ece: number | null;
  /** Score de Brier, et celui d'une prévision constante au taux observé (référence). */
  brier: number | null;
  brier_ref: number | null;
  /** Log-loss (nats), et sa référence au taux observé. */
  logloss: number | null;
  logloss_ref: number | null;
  tranches: Tranche[];
}

export interface Mesure {
  seuil: number;
  /** null au-dessus du seuil. */
  avertissement: string | null;
  comptes: {
    /** Événements reçus, puis gardés par ordonner() (valides, sans doublon d'id). */
    evenements: number;
    valides: number;
    /** Réponses à note FSRS, et parmi elles celles que le rejeu applique. */
    notes: number;
    appliquees: number;
    /** Premières notes d'une fiche (hors compte). */
    premieres: number;
    /** Notes ignorées par le rejeu (même jour, jour antérieur). */
    ignorees: number;
    /** Révisions comptées. */
    revisions: number;
    /** Réponses hors FSRS (note null), par mode ; reprises : mode rappel ou revision. */
    hors_fsrs: Record<string, number>;
    /** Jours locaux distincts où une révision a été comptée. */
    jours: number;
  };
  global: Agregat;
  par_domaine: Record<string, Agregat>;
  par_sens: Record<string, Agregat>;
  /** Par mode de l'étape : revision, ou rappel sur une fiche qui avait déjà un état. */
  par_mode: Record<string, Agregat>;
  /** Révisions faites à l'échéance ou après, et en avance (avant l'échéance). */
  echeance: { dues: Agregat; en_avance: Agregat };
  /** Selon la note précédente de la fiche : un Again (fiche réapprise), ou une réussite. */
  apres: { echec: Agregat; reussite: Agregat };
  /** Les mêmes, par sens : « localiser après échec »… */
  par_sens_apres: Record<string, Agregat>;
  /** Par jours écoulés depuis la note précédente. */
  par_jours: Tranche[];
}

const pc = (x: number): string => `${(100 * x).toFixed(0)} %`;
const etiquette = (bornes: readonly number[], i: number, f: (x: number) => string): string => {
  if (i === 0) return `< ${f(bornes[0]!)}`;
  if (i === bornes.length) return `≥ ${f(bornes[bornes.length - 1]!)}`;
  return `${f(bornes[i - 1]!)} à ${f(bornes[i]!)}`;
};
const indice = (bornes: readonly number[], x: number): number => {
  let i = 0;
  while (i < bornes.length && x >= bornes[i]!) i++;
  return i;
};

/** Intervalle de Wilson à 95 % pour k succès sur n. */
export function wilson(k: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const EPS = 1e-6;
const ln = (p: number): number => Math.log(Math.min(1 - EPS, Math.max(EPS, p)));
const moyenne = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function tranche(libelle: string, rs: readonly Revision[]): Tranche {
  const k = rs.filter((r) => r.reussi).length;
  const prevu = moyenne(rs.map((r) => r.p));
  const observe = rs.length ? k / rs.length : null;
  return { libelle, n: rs.length, reussites: k, prevu, observe, ecart: prevu === null || observe === null ? null : observe - prevu, ic95: wilson(k, rs.length) };
}

/** Révisions rangées par tranches de bornes (sur la valeur que `cle` en tire). */
function trancher(rs: readonly Revision[], bornes: readonly number[], cle: (r: Revision) => number, f: (x: number) => string): Tranche[] {
  const groupes: Revision[][] = Array.from({ length: bornes.length + 1 }, () => []);
  for (const r of rs) groupes[indice(bornes, cle(r))]!.push(r);
  return groupes.map((g, i) => tranche(etiquette(bornes, i, f), g));
}

/** Les écarts d'un ensemble de révisions. */
export function agreger(rs: readonly Revision[], bornes: readonly number[] = BORNES_P): Agregat {
  const n = rs.length;
  const t = tranche('', rs);
  const tranches = trancher(rs, bornes, (r) => r.p, pc);
  if (!n) return { n, reussites: 0, prevu: null, observe: null, ic95: null, biais: null, ece: null, brier: null, brier_ref: null, logloss: null, logloss_ref: null, tranches };
  const o = t.observe!;
  const y = (r: Revision): number => (r.reussi ? 1 : 0);
  return {
    n,
    reussites: t.reussites,
    prevu: t.prevu,
    observe: o,
    ic95: t.ic95,
    biais: t.ecart,
    ece: tranches.reduce((s, x) => s + (x.n ? x.n * Math.abs(x.ecart!) : 0), 0) / n,
    brier: moyenne(rs.map((r) => (r.p - y(r)) ** 2)),
    brier_ref: o * (1 - o),
    logloss: moyenne(rs.map((r) => -(y(r) * ln(r.p) + (1 - y(r)) * ln(1 - r.p)))),
    logloss_ref: -(o * ln(o) + (1 - o) * ln(1 - o)),
    tranches,
  };
}

/** Rejoue le journal comme l'appli et rend chaque révision comptée, avec les comptes. */
export function rejouer(evenements: readonly unknown[], params: ParamsFsrs = PARAMS_FSRS): { revisions: Revision[]; comptes: Mesure['comptes'] } {
  const p = planificateur(params);
  const f = fsrs({ ...params });
  const fiches = new Map<string, EtatFiche>();
  /** Dernière note appliquée de chaque fiche (l'état du rejeu ne la garde pas). */
  const derniere = new Map<string, number>();
  const ordonnes = ordonner(evenements);
  const revisions: Revision[] = [];
  const jours = new Set<number>();
  const comptes: Mesure['comptes'] = { evenements: evenements.length, valides: ordonnes.length, notes: 0, appliquees: 0, premieres: 0, ignorees: 0, revisions: 0, hors_fsrs: {}, jours: 0 };
  for (const e of ordonnes) {
    if (e.type === 'reponse' && e.note == null) {
      const m = e.mode ?? '?';
      comptes.hors_fsrs[m] = (comptes.hors_fsrs[m] ?? 0) + 1;
    }
    const note = e.type === 'reponse' && e.note != null;
    const avant = fiches.get(e.fiche);
    const j = jour(e.ts, e.tz);
    // La prévision se prend avant d'appliquer : l'état d'avant la note, au jour de la note.
    const prevu = note && avant ? f.get_retrievability(avant.carte, dateDuJour(j), false) : null;
    const applique = appliquer(fiches, e, p);
    if (!note) continue;
    comptes.notes++;
    if (!applique) {
      comptes.ignorees++;
      continue;
    }
    comptes.appliquees++;
    const precedente = derniere.get(e.fiche);
    derniere.set(e.fiche, e.note!);
    if (!avant || prevu === null) {
      comptes.premieres++;
      continue;
    }
    const a = analyser(e.fiche);
    revisions.push({ domaine: a?.domaine ?? '?', sens: a?.sens ?? '?', p: prevu, reussi: e.note !== 1, jours: j - avant.dernier_jour, due: j >= avant.echeance_jour, mode: e.mode ?? '?', apres_echec: precedente === 1 });
    jours.add(j);
  }
  comptes.revisions = revisions.length;
  comptes.jours = jours.size;
  return { revisions, comptes };
}

/** Libellé de la tranche i de BORNES_JOURS : « 1 j », « 2 à 3 j »…, « ≥ 16 j » (des jours entiers). */
function libelleJours(i: number): string {
  const b = BORNES_JOURS;
  if (i === b.length) return `≥ ${b[i - 1]!} j`;
  const de = i === 0 ? 1 : b[i - 1]!;
  const a = b[i]! - 1;
  return de === a ? `${de} j` : `${de} à ${a} j`;
}

const grouper = (rs: readonly Revision[], cle: (r: Revision) => string, bornes: readonly number[]): Record<string, Agregat> => {
  const g = new Map<string, Revision[]>();
  for (const r of rs) {
    const k = cle(r);
    const liste = g.get(k);
    if (liste) liste.push(r);
    else g.set(k, [r]);
  }
  return Object.fromEntries([...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, agreger(v, bornes)]));
};

/** La mesure complète (aussi la sortie --json de justesse.mjs) : des agrégats seulement. */
export function mesurer(evenements: readonly unknown[], o: { bornes?: readonly number[]; params?: ParamsFsrs } = {}): Mesure {
  const bornes = o.bornes ?? BORNES_P;
  const { revisions, comptes } = rejouer(evenements, o.params);
  return {
    seuil: SEUIL,
    avertissement: revisions.length < SEUIL ? `${revisions.length} révisions comptées, moins de ${SEUIL} : écart indicatif, pas encore mesurable (critère de fin de #4)` : null,
    comptes,
    global: agreger(revisions, bornes),
    par_domaine: grouper(revisions, (r) => r.domaine, bornes),
    par_sens: grouper(revisions, (r) => r.sens, bornes),
    par_mode: grouper(revisions, (r) => r.mode, bornes),
    echeance: { dues: agreger(revisions.filter((r) => r.due), bornes), en_avance: agreger(revisions.filter((r) => !r.due), bornes) },
    apres: { echec: agreger(revisions.filter((r) => r.apres_echec), bornes), reussite: agreger(revisions.filter((r) => !r.apres_echec), bornes) },
    par_sens_apres: grouper(revisions, (r) => `${r.sens} après ${r.apres_echec ? 'échec' : 'réussite'}`, bornes),
    par_jours: trancher(revisions, BORNES_JOURS, (r) => r.jours, String).map((t, i) => ({ ...t, libelle: libelleJours(i) })),
  };
}

const p1 = (x: number | null): string => (x === null ? '—' : `${(100 * x).toFixed(1).replace('.', ',')} %`);
const pts = (x: number | null): string => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(100 * x).toFixed(1).replace('.', ',')} pt`);
const d3 = (x: number | null): string => (x === null ? '—' : x.toFixed(3).replace('.', ','));
const ic = (x: [number, number] | null): string => (x === null ? '—' : `${(100 * x[0]).toFixed(0)}–${(100 * x[1]).toFixed(0)} %`);

function lignesTranches(ts: readonly Tranche[], titre: string): string[] {
  const l = [`  ${titre.padEnd(12)} ${'n'.padStart(5)}  ${'prévu'.padStart(8)}  ${'observé'.padStart(8)}  ${'écart'.padStart(9)}  IC 95 %`];
  for (const t of ts) if (t.n) l.push(`  ${t.libelle.padEnd(12)} ${String(t.n).padStart(5)}  ${p1(t.prevu).padStart(8)}  ${p1(t.observe).padStart(8)}  ${pts(t.ecart).padStart(9)}  ${ic(t.ic95)}`);
  return l;
}

const resume = (a: Agregat): string =>
  `n ${a.n}, prévu ${p1(a.prevu)}, observé ${p1(a.observe)} (IC 95 % ${ic(a.ic95)}), biais ${pts(a.biais)}, ECE ${p1(a.ece)}, Brier ${d3(a.brier)} (réf. ${d3(a.brier_ref)}), log-loss ${d3(a.logloss)} (réf. ${d3(a.logloss_ref)})`;

/** La mesure en texte, pour la console. */
export function rapport(m: Mesure): string {
  const c = m.comptes;
  const hors = Object.entries(c.hors_fsrs).map(([k, v]) => `${k} ${v}`).join(', ') || 'aucune';
  const l: string[] = [
    `Événements : ${c.evenements} (${c.valides} valides, sans doublon). Notes FSRS : ${c.notes}, dont ${c.appliquees} appliquées par le rejeu (${c.ignorees} ignorées : même jour ou jour antérieur).`,
    `Premières notes (hors compte) : ${c.premieres}. Révisions comptées : ${c.revisions}, sur ${c.jours} jours. Hors FSRS (note null) : ${hors}.`,
  ];
  if (m.avertissement) l.push(`ATTENTION : ${m.avertissement}.`);
  l.push('', `Global : ${resume(m.global)}`, ...lignesTranches(m.global.tranches, 'prévu'));
  l.push('', 'Par sujet :');
  for (const [k, a] of Object.entries(m.par_domaine)) l.push(`  ${k.padEnd(10)} ${resume(a)}`);
  l.push('Par sens (localiser : Trouver au toucher ; nommer : carte retournée) :');
  for (const [k, a] of Object.entries(m.par_sens)) l.push(`  ${k.padEnd(10)} ${resume(a)}`);
  l.push('Par mode (rappel : étape d\'Apprendre sur une fiche qui avait déjà un état) :');
  for (const [k, a] of Object.entries(m.par_mode)) l.push(`  ${k.padEnd(10)} ${resume(a)}`);
  for (const [k, a] of [...Object.entries(m.par_domaine), ...Object.entries(m.par_sens)]) {
    if (a.n >= SEUIL_DETAIL && a.n < m.global.n) l.push('', `${k} :`, ...lignesTranches(a.tranches, 'prévu'));
  }
  l.push('', `À l'échéance ou après : ${resume(m.echeance.dues)}`, `En avance : ${resume(m.echeance.en_avance)}`);
  l.push(`Après un échec (Again) : ${resume(m.apres.echec)}`, `Après une réussite : ${resume(m.apres.reussite)}`);
  for (const [k, a] of Object.entries(m.par_sens_apres)) l.push(`  ${k.padEnd(25)} ${resume(a)}`);
  l.push('', ...lignesTranches(m.par_jours, 'écoulés'));
  l.push('', 'Écart > 0 : FSRS pessimiste (on se rappelle mieux que prévu) ; < 0 : optimiste. ECE : écart absolu moyen par tranche, pondéré.');
  return l.join('\n');
}
