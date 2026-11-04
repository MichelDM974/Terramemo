import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  comparerScores,
  DELAI_CHRONO_MS,
  pointsQuestion,
  scoreEpreuve,
  semaine,
  type ReponseChrono,
  type ScoreEpreuve,
} from '../src/epreuve/bareme';
import { assembler } from '../src/map/donnees';
import { distanceAuBordKm } from '../src/map/geo';

const D = DELAI_CHRONO_MS.localiser;
const faux = (km: number | null, temps_ms = 3000): ReponseChrono => ({ juste: false, distance_km: km, temps_ms });

describe('pointsQuestion', () => {
  it('1 000 si juste, quel que soit le temps dans le délai', () => {
    expect(pointsQuestion({ juste: true, distance_km: 0, temps_ms: 500 }, D)).toBe(1000);
    expect(pointsQuestion({ juste: true, distance_km: 0, temps_ms: D }, D)).toBe(1000);
  });

  it('0 hors délai ou sans réponse, même juste', () => {
    expect(pointsQuestion({ juste: true, distance_km: 0, temps_ms: D + 1 }, D)).toBe(0);
    expect(pointsQuestion({ juste: false, distance_km: null, temps_ms: null }, D)).toBe(0);
  });

  it('faux : 500 × e^(−d/300 km), plafonné à la moitié', () => {
    expect(pointsQuestion(faux(0), D)).toBe(500);
    expect(pointsQuestion(faux(106), D)).toBe(351);
    expect(pointsQuestion(faux(300), D)).toBe(184);
    expect(pointsQuestion(faux(2000), D)).toBe(1);
    expect(pointsQuestion(faux(5000), D)).toBe(0);
  });

  it('faux hors de la sphère (toucher dans le vide) : 0', () => {
    expect(pointsQuestion(faux(null), D)).toBe(0);
  });
});

describe('scoreEpreuve et comparerScores', () => {
  it('somme les points ; une question sans réponse compte tout son délai', () => {
    const s = scoreEpreuve(
      [{ juste: true, distance_km: 0, temps_ms: 2000 }, faux(106, 4000), { juste: false, distance_km: null, temps_ms: null }],
      D,
    );
    expect(s).toEqual({ points: 1351, justes: 1, questions: 3, temps_ms: 2000 + 4000 + D });
  });

  it('plus de points d’abord, puis le temps le plus court', () => {
    const s = (points: number, temps_ms: number): ScoreEpreuve => ({ points, justes: 0, questions: 12, temps_ms });
    const tries = [s(9000, 50_000), s(12_000, 90_000), s(12_000, 60_000)].sort(comparerScores);
    expect(tries.map((x) => [x.points, x.temps_ms])).toEqual([
      [12_000, 60_000],
      [12_000, 90_000],
      [9000, 50_000],
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

// Le tableau de l'étude (docs/etudes/2026-11-04-points-classement.md, § 3),
// refait sur les données versionnées : toucher au point d'étiquette du pays
// confondu, distance au bord du pays demandé.
describe('barème sur les vraies frontières', () => {
  const lire = (n: string) => JSON.parse(readFileSync(`public/geo/${n}`, 'utf8'));
  const d = assembler(lire('monde.topo.json'), lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
  const parId = new Map(d.entites.map((e) => [e.pays.id, e]));
  const cas: [string, string, number][] = [
    ['DOM', 'HTI', 423],
    ['MKD', 'ALB', 412],
    ['LVA', 'LTU', 351],
    ['SWE', 'NOR', 327],
    ['AUT', 'CHE', 295],
    ['SVK', 'SVN', 178],
    ['MRT', 'MLI', 128],
    ['NGA', 'NER', 105],
    ['IRQ', 'IRN', 53],
    ['CHE', 'SWE', 1],
    ['AUT', 'AUS', 0],
  ];
  it.each(cas)('%s demandé, %s touché : %i points', (cible, touche, attendu) => {
    const c = parId.get(cible);
    const t = parId.get(touche);
    if (!c || !t) throw new Error(`pays absent : ${cible} ou ${touche}`);
    const km = distanceAuBordKm(c.forme, t.pays.point as [number, number]);
    // L'étude arrondit la distance au km : un point d'écart au plus.
    expect(Math.abs(pointsQuestion(faux(km), D) - attendu)).toBeLessThanOrEqual(1);
  });
});
