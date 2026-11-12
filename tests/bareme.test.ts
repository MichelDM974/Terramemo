import { describe, expect, it } from 'vitest';
import { comparerScores, DELAI_CHRONO_MS, pointsQuestion, scoreEpreuve, semaine, type ReponseChrono, type ScoreEpreuve } from '../src/epreuve/bareme';

// Barème 2 (décision « Barème et classements » du 12/11/2026, #30) : juste ou
// faux, les points sont les justes ; la distance ne reste que dans la
// rétroaction (« à 106 km du bord »), elle ne donne plus de points.
const D = DELAI_CHRONO_MS.localiser;
const faux = (km: number | null, temps_ms = 3000): ReponseChrono => ({ juste: false, distance_km: km, temps_ms });

describe('pointsQuestion', () => {
  it('1 si juste dans le délai, quel que soit le temps', () => {
    expect(pointsQuestion({ juste: true, distance_km: 0, temps_ms: 500 }, D)).toBe(1);
    expect(pointsQuestion({ juste: true, distance_km: 0, temps_ms: D }, D)).toBe(1);
  });

  it('0 hors délai ou sans réponse, même juste', () => {
    expect(pointsQuestion({ juste: true, distance_km: 0, temps_ms: D + 1 }, D)).toBe(0);
    expect(pointsQuestion({ juste: false, distance_km: null, temps_ms: null }, D)).toBe(0);
  });

  it('faux : 0, même tout près du bord (plus de points de proximité)', () => {
    expect(pointsQuestion(faux(0), D)).toBe(0);
    expect(pointsQuestion(faux(1), D)).toBe(0);
    expect(pointsQuestion(faux(106), D)).toBe(0);
    expect(pointsQuestion(faux(null), D)).toBe(0);
  });
});

describe('scoreEpreuve et comparerScores', () => {
  it('points = justes ; une question sans réponse compte tout son délai', () => {
    const s = scoreEpreuve(
      [{ juste: true, distance_km: 0, temps_ms: 2000 }, faux(106, 4000), { juste: true, distance_km: 0, temps_ms: 1000 }, { juste: false, distance_km: null, temps_ms: null }],
      D,
    );
    expect(s).toEqual({ points: 2, justes: 2, questions: 4, temps_ms: 2000 + 4000 + 1000 + D });
  });

  it('une juste après le délai : ni juste, ni plus que son délai au temps', () => {
    expect(scoreEpreuve([{ juste: true, distance_km: 0, temps_ms: D + 5000 }], D)).toEqual({ points: 0, justes: 0, questions: 1, temps_ms: D });
  });

  it('plus de justes d’abord, puis le temps le plus court', () => {
    const s = (justes: number, temps_ms: number): ScoreEpreuve => ({ points: justes, justes, questions: 12, temps_ms });
    const tries = [s(9, 50_000), s(12, 90_000), s(12, 60_000)].sort(comparerScores);
    expect(tries.map((x) => [x.points, x.temps_ms])).toEqual([
      [12, 60_000],
      [12, 90_000],
      [9, 50_000],
    ]);
  });
});

describe('semaine', () => {
  const t = (iso: string) => Date.parse(iso);
  it('repart le lundi à 0 h UTC', () => {
    expect(semaine(t('1970-01-05T00:00:00Z'))).toBe(0);
    expect(semaine(t('1970-01-04T23:59:59Z'))).toBe(-1);
    const lundi = semaine(t('2026-11-02T00:00:00Z'));
    expect(semaine(t('2026-11-08T23:59:59Z'))).toBe(lundi);
    expect(semaine(t('2026-11-09T00:00:00Z'))).toBe(lundi + 1);
  });

  it('à La Réunion, la semaine change le lundi à 4 h', () => {
    expect(semaine(t('2026-11-09T03:59:59+04:00'))).toBe(semaine(t('2026-11-08T12:00:00Z')));
    expect(semaine(t('2026-11-09T04:00:00+04:00'))).toBe(semaine(t('2026-11-08T12:00:00Z')) + 1);
  });
});
