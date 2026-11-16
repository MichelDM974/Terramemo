// Justesse des prévisions de FSRS (#4, lot 6 de l'étude J2, § 12) : l'outil
// du skill run-terramemo (.claude/skills/run-terramemo/outils/justesse_calcul.ts,
// lancé par justesse.mjs) rejoue un journal comme l'appli et compare la
// probabilité de rappel prévue au résultat réel. Ce test vérifie ce qui
// compte comme révision sur un petit journal écrit à la main, la calibration
// sur des journaux fabriqués dont on connaît la réponse (joueur qui se
// rappelle avec la probabilité de FSRS, joueur plus oublieux, joueur
// parfait), puis la ligne de commande sur une sauvegarde et une liste.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import { afterAll, describe, expect, it } from 'vitest';
import { mesurer, rejouer, SEUIL, wilson } from '../.claude/skills/run-terramemo/outils/justesse_calcul';
import { dateDuJour, PARAMS_FSRS, planificateur } from '../src/srs/fsrs';
import { MS_JOUR } from '../src/srs/jour';
import type { Evenement } from '../src/srs/journal';
import type { Note } from '../src/srs/note';
import { appliquer, type EtatFiche } from '../src/srs/rejeu';

const OUTIL = fileURLToPath(new URL('../.claude/skills/run-terramemo/outils/justesse.mjs', import.meta.url));
const J0 = 20_400; // un jour local quelconque (novembre 2025)
const f = fsrs({ ...PARAMS_FSRS });

let n = 0;
/** Une réponse le jour local j (midi à La Réunion). */
function rep(fiche: string, j: number, mode: Evenement['mode'], note: Note | null, o: Partial<Evenement> = {}): Evenement {
  n++;
  const correct = note === null ? true : note !== 1;
  return {
    v: 1,
    id: `e${n}`,
    appareil: 'a',
    ts: j * MS_JOUR + 8 * 3_600_000 + n,
    tz: 240,
    seance: mode === 'libre' ? null : 's',
    type: 'reponse',
    fiche,
    mode,
    reponse: correct ? null : 'ESP',
    correct,
    aide: null,
    note,
    ...o,
  };
}

describe('ce qui compte comme révision', () => {
  const A = 'pays:FRA:localiser';
  const B = 'pays:ITA:nommer';
  const evts: unknown[] = [
    rep(A, J0, 'qcm', null), // QCM d'Apprendre : hors FSRS
    rep(A, J0, 'rappel', 3), // première note (grappe nouvelle) : hors compte
    rep(A, J0, 'rappel', null), // reprise : hors FSRS
    rep(A, J0, 'revision', 3), // seconde note du même jour : ignorée par le rejeu
    rep(B, J0 + 1, 'rappel', 3), // introduction en carte retournée : première note
    rep(A, J0 + 3, 'revision', 3), // comptée
    rep(B, J0 + 3, 'revision', 1), // comptée, échec
    rep('drapeaux:FRA:localiser', J0 + 3, 'libre', null), // partie libre : hors FSRS
    rep(B, J0 + 4, 'revision', 3), // comptée, après un échec
    rep(A, J0 + 6, 'revision', 1), // comptée, échec
  ];
  const doublon = { ...(evts[5] as Evenement) }; // même id, même contenu
  const reinit: Evenement = { v: 1, id: 'r1', appareil: 'a', ts: (J0 + 7) * MS_JOUR + 8 * 3_600_000, tz: 240, seance: null, type: 'reinitialiser', fiche: A };
  evts.push(doublon, { pas: 'un événement' }, reinit, rep(A, J0 + 8, 'rappel', 3));

  it('compte les révisions appliquées sur une fiche déjà notée, et rien d’autre', () => {
    const { revisions, comptes } = rejouer(evts);
    expect(comptes).toEqual({
      evenements: 14,
      valides: 12, // le doublon d'id et l'objet mal formé écartés
      notes: 8,
      appliquees: 7,
      premieres: 3, // A, B, puis A après sa réinitialisation
      ignorees: 1,
      revisions: 4,
      hors_fsrs: { qcm: 1, rappel: 1, libre: 1 },
      jours: 3,
    });
    expect(revisions.map((r) => [r.domaine, r.sens, r.reussi, r.jours, r.mode, r.apres_echec])).toEqual([
      ['pays', 'localiser', true, 3, 'revision', false],
      ['pays', 'nommer', false, 2, 'revision', false],
      ['pays', 'nommer', true, 1, 'revision', true],
      ['pays', 'localiser', false, 3, 'revision', false],
    ]);
  });

  it('prend la probabilité de ts-fsrs, état d’avant la note, au jour de la note', () => {
    const { revisions } = rejouer(evts);
    const carte = f.next(createEmptyCard(dateDuJour(J0)), dateDuJour(J0), Rating.Good).card;
    expect(revisions[0]!.p).toBeCloseTo(f.get_retrievability(carte, dateDuJour(J0 + 3), false), 12);
    const apres = f.next(carte, dateDuJour(J0 + 3), Rating.Good).card;
    expect(revisions[3]!.p).toBeCloseTo(f.get_retrievability(apres, dateDuJour(J0 + 6), false), 12);
  });

  it('avertit sous 300 révisions', () => {
    const m = mesurer(evts);
    expect(m.avertissement).toMatch(/4 révisions comptées, moins de 300/);
    expect(m.global.n).toBe(4);
    expect(m.par_sens.nommer!.n).toBe(2);
    expect([m.apres.echec.n, m.apres.reussite.n]).toEqual([1, 3]);
    expect(Object.keys(m.par_domaine)).toEqual(['pays']);
  });
});

/** Hasard reproductible (mulberry32). */
function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Journal d'un joueur assidu : `fiches` fiches introduites en Good le premier
 * jour (pays et drapeaux), puis chaque jour leurs révisions dues ; il se
 * rappelle avec la probabilité rappel(R), R celle de FSRS ce jour-là. Un
 * jour sur trois, une fiche sur cinq non due est aussi revue (en avance).
 */
function joueur(rappel: (r: number) => number, jours: number, fiches = 60, s = 7): Evenement[] {
  const hasard = graine(s);
  const p = planificateur();
  const etat = new Map<string, EtatFiche>();
  const evts: Evenement[] = [];
  const ids = Array.from({ length: fiches }, (_, i) => `${i % 2 ? 'drapeaux' : 'pays'}:P${i}:localiser`);
  const noter = (e: Evenement) => {
    evts.push(e);
    appliquer(etat, e, p);
  };
  for (const id of ids) noter(rep(id, J0, 'rappel', 3));
  for (let k = 1; k <= jours; k++) {
    const j = J0 + k;
    for (const id of ids) {
      const e = etat.get(id)!;
      if (e.echeance_jour > j && !(k % 3 === 0 && hasard() < 0.2)) continue;
      const r = f.get_retrievability(e.carte, dateDuJour(j), false);
      noter(rep(id, j, 'revision', hasard() < rappel(r) ? 3 : 1));
    }
  }
  return evts;
}

describe('calibration connue', () => {
  it('joueur qui se rappelle avec la probabilité de FSRS : écart nul aux erreurs d’échantillon près', () => {
    const m = mesurer(joueur((r) => r, 150, 200));
    expect(m.global.n).toBeGreaterThan(2000);
    expect(m.avertissement).toBeNull();
    expect(Math.abs(m.global.biais!)).toBeLessThan(0.015);
    expect(m.global.ece!).toBeLessThan(0.03);
    expect(m.global.brier!).toBeLessThan(m.global.brier_ref!);
    expect(m.global.logloss!).toBeLessThan(m.global.logloss_ref!);
    // Chaque tranche assez remplie : le prévu dans l'intervalle à 95 % de l'observé (1 pt de marge).
    for (const t of m.global.tranches.filter((x) => x.n >= 100)) {
      expect(t.ic95![0] - 0.01).toBeLessThanOrEqual(t.prevu!);
      expect(t.ic95![1] + 0.01).toBeGreaterThanOrEqual(t.prevu!);
    }
    expect(m.echeance.en_avance.n).toBeGreaterThan(100);
    expect(Object.keys(m.par_domaine).sort()).toEqual(['drapeaux', 'pays']);
  });

  it('joueur plus oublieux que prévu (R³) : FSRS trop optimiste, dans chaque tranche', () => {
    const m = mesurer(joueur((r) => r ** 3, 150, 200));
    expect(m.global.biais!).toBeLessThan(-0.1);
    for (const t of m.global.tranches) if (t.n >= 50) expect(t.ecart!).toBeLessThan(0);
    expect(m.global.ece!).toBeGreaterThan(0.1);
  });

  it('joueur parfait : observé 100 %, biais = 1 − prévu, Brier = moyenne de (1 − p)²', () => {
    const evts = joueur(() => 1, 60, 20);
    const { revisions } = rejouer(evts);
    const m = mesurer(evts);
    const moy = revisions.reduce((s, r) => s + r.p, 0) / revisions.length;
    expect(m.global.observe).toBe(1);
    expect(m.global.biais!).toBeCloseTo(1 - moy, 12);
    expect(m.global.brier!).toBeCloseTo(revisions.reduce((s, r) => s + (1 - r.p) ** 2, 0) / revisions.length, 12);
    expect(m.global.brier_ref).toBe(0);
    expect(m.global.tranches.reduce((s, t) => s + t.n, 0)).toBe(m.global.n);
    expect(m.par_jours.reduce((s, t) => s + t.n, 0)).toBe(m.global.n);
  });

  it('tranches à la demande, intervalle de Wilson', () => {
    const m = mesurer(joueur((r) => r, 40, 20), { bornes: [0.9] });
    expect(m.global.tranches.map((t) => t.libelle)).toEqual(['< 90 %', '≥ 90 %']);
    const [a, b] = wilson(8, 10)!;
    expect(a).toBeCloseTo(0.4902, 3);
    expect(b).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 0)).toBeNull();
  });
});

describe('ligne de commande', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'justesse-'));
  afterAll(() => rmSync(dossier, { recursive: true, force: true }));
  const evts = joueur((r) => r, 30, 10);
  const moitie = Math.floor(evts.length / 2);
  const sauvegarde = join(dossier, 'journal-2026-11-16.json');
  const liste = join(dossier, 'liste.json');
  // La seconde moitié recopie un événement de la première : la fusion ne le compte qu'une fois.
  writeFileSync(sauvegarde, JSON.stringify({ format: 1, sauve_le: '2026-11-16T10:00:00+04:00', cible: 'webview', origine: 'https://localhost', evenements: evts.slice(0, moitie) }));
  writeFileSync(liste, JSON.stringify([...evts.slice(moitie), evts[0]]));

  const lancer = (...args: string[]) => spawnSync(process.execPath, [OUTIL, ...args], { encoding: 'utf8' });

  it('--json : sources et mesure, la même qu’en mémoire', () => {
    const r = lancer(sauvegarde, liste, '--json');
    expect(r.status, r.stderr).toBe(0);
    const sortie = JSON.parse(r.stdout);
    expect(sortie.sources.map((s: { fichier: string; evenements: number }) => [s.fichier, s.evenements])).toEqual([
      ['journal-2026-11-16.json', moitie],
      ['liste.json', evts.length - moitie + 1],
    ]);
    const m = mesurer(evts);
    expect(sortie.comptes).toEqual({ ...m.comptes, evenements: evts.length + 1 });
    expect(sortie.global.n).toBe(m.global.n);
    expect(sortie.global.brier).toBeCloseTo(m.global.brier!, 12);
    expect(r.stdout).not.toMatch(/P\d|localiser:/); // des agrégats : aucune fiche
  });

  it('texte : avertissement sous le seuil, tranches', () => {
    const r = lancer(sauvegarde, liste, '--tranches', '0.8,0.9');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`moins de ${SEUIL}`));
    expect(r.stdout).toMatch(/80 % à 90 %/);
    expect(r.stdout).toMatch(/Source : journal-2026-11-16\.json \(webview/);
  });

  it('refuse des tranches mal formées', () => {
    const r = lancer(liste, '--tranches', '0.9,0.5');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--tranches/);
  });
});
