import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enregistrer, idEpreuve, lireRecords, PartieChrono, VERSION_BAREME } from '../src/epreuve/chrono';
import type { Pays } from '../src/map/types';
import { SERIE_TOUS, series } from '../src/vues/cibles';
import { seriesChrono } from '../src/vues/chrono';
import { textes } from '../src/vues/textes';

const D = 15_000;

/** Un localStorage en mémoire ; `plein` refuse les écritures. */
function stockage(plein = false) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (plein) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
    m,
  };
}

describe('PartieChrono', () => {
  it('pose les cibles dans l’ordre donné, une fois chacune, puis finit', () => {
    const p = new PartieChrono(['PER', 'BOL', 'CHL'], D);
    expect([p.courante, p.numero, p.finie]).toEqual(['PER', 1, false]);
    p.repondre('PER', true, 0, 2000);
    p.repondre('PER', false, 120, 4000);
    expect(p.courante).toBe('CHL');
    p.expirer();
    expect(p.finie).toBe(true);
    expect(p.courante).toBeUndefined();
    expect(() => p.expirer()).toThrow();
  });

  it('points au barème, temps écoulé à 0 et compté en entier', () => {
    const p = new PartieChrono(['LVA', 'SVK', 'NGA'], D);
    expect(p.repondre('LVA', true, 0, 3000).points).toBe(1000);
    expect(p.repondre('SVN', false, 310, 5000).points).toBe(178);
    const q = p.expirer();
    expect([q.points, q.touche, q.temps_ms]).toEqual([0, null, null]);
    expect(p.points).toBe(1178);
    expect(p.score()).toEqual({ points: 1178, justes: 1, questions: 3, temps_ms: 3000 + 5000 + D });
  });

  it('un toucher juste arrivé après le délai ne compte pas', () => {
    const p = new PartieChrono(['FRA'], D);
    expect(p.repondre('FRA', true, 0, D + 50).points).toBe(0);
  });
});

describe('records sur l’appareil', () => {
  const e = idEpreuve('Europe');
  const score = (points: number, temps_ms: number) => ({ points, justes: 0, questions: 44, temps_ms });

  it('premier score gardé, puis seulement ce qui le bat (points, puis temps)', () => {
    const s = stockage();
    const b1 = enregistrer(s, e, score(30_000, 400_000), 1);
    expect([b1.nouveau, b1.ancien]).toEqual([true, null]);
    expect(enregistrer(s, e, score(29_000, 100_000), 2).nouveau).toBe(false);
    expect(enregistrer(s, e, score(30_000, 500_000), 3).nouveau).toBe(false);
    const b4 = enregistrer(s, e, score(30_000, 300_000), 4);
    expect([b4.nouveau, b4.ancien?.temps_ms]).toEqual([true, 400_000]);
    const r = lireRecords(s).get(e);
    expect([r?.points, r?.temps_ms, r?.date, r?.bareme]).toEqual([30_000, 300_000, 4, VERSION_BAREME]);
  });

  it('une épreuve par série, sans mélange', () => {
    const s = stockage();
    enregistrer(s, idEpreuve('Africa'), score(50_000, 1), 1);
    enregistrer(s, e, score(10_000, 1), 1);
    expect([...lireRecords(s).keys()].sort()).toEqual([idEpreuve('Africa'), e].sort());
  });

  it('stockage absent, plein, illisible ou d’un autre barème : rien ne casse', () => {
    expect(enregistrer(null, e, score(1, 1), 1).nouveau).toBe(true);
    expect(enregistrer(stockage(true), e, score(1, 1), 1).nouveau).toBe(true);
    const s = stockage();
    s.m.set('cartographe.chrono.records', '{pas du json');
    expect(lireRecords(s).size).toBe(0);
    s.m.set('cartographe.chrono.records', JSON.stringify({ [e]: { ...score(9, 9), date: 1, bareme: VERSION_BAREME + 1 } }));
    expect(lireRecords(s).size).toBe(0);
    expect(enregistrer(s, e, score(1, 1), 2).nouveau).toBe(true);
  });
});

describe('séries du Chrono', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const continents = textes.continents as Record<string, string>;
  const s = seriesChrono(series(pays, (c) => continents[c] ?? c));

  it('les six continents, puis tous les pays ; pas l’essai du J0', () => {
    expect(s.map((x) => x.id)).toEqual(['Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania', SERIE_TOUS]);
    expect(s.at(-1)?.ids.length).toBe(195);
  });

  it('textes du Chrono : toutes les clés remplies par la vue existent', () => {
    for (const k of ['depart_aide', 'record', 'points', 'juste', 'faux', 'bilan_score', 'bilan_detail', 'bilan_faux', 'bilan_expire', 'record_a_battre', 'nouveau_record_bat'])
      expect(textes.chrono[k as keyof typeof textes.chrono], k).toBeTruthy();
  });
});
