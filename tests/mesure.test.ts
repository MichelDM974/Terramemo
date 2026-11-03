import { describe, expect, it } from 'vitest';
import { intervalles, mediane, periodeGeste, quantile, statsGeste, statsImages } from '../src/mesure/stats';

describe('statistiques des mesures', () => {
  it('quantiles par interpolation linéaire (type 7)', () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([5], 0.95)).toBe(5);
    expect(mediane([3, 1, 2])).toBe(2);
    expect(mediane([1, 2, 3, 4])).toBe(2.5);
    // 1..20 : rang (20 − 1) × 0,95 = 18,05 → 19 + 0,05.
    expect(quantile(Array.from({ length: 20 }, (_, i) => i + 1), 0.95)).toBeCloseTo(19.05, 10);
  });

  it('intervalles entre images', () => {
    expect(intervalles([0, 10, 25, 26])).toEqual([10, 15, 1]);
    expect(intervalles([5])).toEqual([]);
  });

  it('images perdues à 120 Hz : intervalle > 1,5 × 8,33 ms', () => {
    const s = statsImages([8.3, 8.4, 25, 8.3, 12.4, 12.6], 1000 / 120);
    expect(s.images).toBe(7);
    expect(s.perdues).toBe(2); // 25 et 12,6 (seuil 12,5)
    expect(s.vsync_manquees).toBe(3); // 25 ms = 3 périodes → 2 sautées ; 12,6 → arrondi 2 → 1
    expect(s.max_ms).toBe(25);
    expect(s.mediane_ms).toBe(10.4);
    expect(s.part_perdues).toBeCloseTo(0.333, 3);
  });

  it('à 60 Hz, 26 ms compte comme perdue (seuil 25 ms), 16,7 non', () => {
    const s = statsImages([16.7, 16.6, 26, 16.7], 1000 / 60);
    expect(s.perdues).toBe(1);
    expect(s.p95_ms).toBe(24.6);
  });

  it('aucun intervalle : rien de perdu, statistiques nulles', () => {
    expect(statsImages([], 8.33)).toMatchObject({ images: 0, mediane_ms: null, p95_ms: null, max_ms: null, perdues: 0 });
  });

  it('période d’un geste : un bas centile, qui tient même si la moitié des images est perdue', () => {
    const pire = [...Array(10).fill(16.7), ...Array(12).fill(33.4)];
    expect(mediane(pire)).toBe(33.4); // la médiane prendrait deux périodes
    expect(periodeGeste(pire)).toBe(16.7);
    expect(periodeGeste([])).toBeNull();
  });

  it('repos à 60 Hz, geste à 120 Hz : les images sautées à 120 Hz sont comptées, l’écart signalé', () => {
    const iv = [8.3, 8.4, 8.3, 16.7, 8.3, 8.4, 8.3, 8.3, 25, 8.3, 8.4, 8.3];
    expect(statsImages(iv, 16.7).perdues).toBe(0); // avec la seule période du repos : rien
    const s = statsGeste(iv, 16.7);
    expect(s.periode_ms).toBe(8.3);
    expect(s.perdues).toBe(2);
    expect(s.ecart_periode).toBe(true);
  });

  it('même période au repos et pendant le geste : pas d’écart ; sans intervalle, la période du repos', () => {
    const s = statsGeste([16.6, 16.7, 16.8, 33.4, 16.7, 16.6], 16.7);
    expect(s.ecart_periode).toBe(false);
    expect(s.perdues).toBe(1);
    expect(statsGeste([], 16.7)).toMatchObject({ periode_ms: null, ecart_periode: false, perdues: 0 });
  });
});
