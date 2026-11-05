import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enregistrer, enregistrerPartie, idEpreuve, lireRecords, PartieChrono, periodeSemaine, pseudoValide, recordDe, totalGeneral, VERSION_BAREME } from '../src/epreuve/chrono';
import { ECHELLES_KM } from '../src/epreuve/bareme';
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

  it('à l’échelle du terrain : l’île à 5 km, le monde par défaut', () => {
    const ile = new PartieChrono(['97411', '97416'], D, ECHELLES_KM.reunion);
    expect(ile.echelle_km).toBe(5);
    expect(ile.repondre('97415', false, 1, 3000).points).toBe(409);
    expect(ile.repondre('97407', false, 10, 4000).points).toBe(68);
    expect(ile.score()).toEqual({ points: 477, justes: 0, questions: 2, temps_ms: 7000 });
    const monde = new PartieChrono(['LVA'], D);
    expect(monde.echelle_km).toBe(300);
    expect(monde.repondre('LTU', false, 106, 3000).points).toBe(351);
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

  it('l’île a son épreuve, celle des règles Firestore', () => {
    expect(idEpreuve('reunion')).toBe('chrono:localiser:reunion');
  });

  it('stockage absent, plein, illisible ou d’un autre barème : rien ne casse', () => {
    expect(enregistrer(null, e, score(1, 1), 1).nouveau).toBe(true);
    expect(enregistrer(stockage(true), e, score(1, 1), 1).nouveau).toBe(true);
    const s = stockage();
    s.m.set('terramemo.chrono.records', '{pas du json');
    expect(lireRecords(s).size).toBe(0);
    s.m.set('terramemo.chrono.records', JSON.stringify({ [e]: { ...score(9, 9), date: 1, bareme: VERSION_BAREME + 1 } }));
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

describe('records de la semaine et classement général', () => {
  const score = (points: number, justes: number, questions: number, temps_ms: number) => ({ points, justes, questions, temps_ms });
  const lundi = Date.parse('2026-11-02T00:00:00Z');
  const lundiSuivant = Date.parse('2026-11-09T00:00:00Z');

  it('une partie compte pour toujours et pour la semaine ; les semaines passées sont oubliées', () => {
    const s = stockage();
    const a = idEpreuve('South America');
    const b1 = enregistrerPartie(s, a, score(11_000, 11, 12, 60_000), lundi);
    expect([b1.toujours.nouveau, b1.semaine.nouveau, b1.periode]).toEqual([true, true, periodeSemaine(lundi)]);
    // La semaine suivante : moins bien que le record de toujours, mais premier de la semaine.
    const b2 = enregistrerPartie(s, a, score(9_000, 9, 12, 70_000), lundiSuivant);
    expect([b2.toujours.nouveau, b2.semaine.nouveau]).toEqual([false, true]);
    const r = lireRecords(s);
    expect(recordDe(r, a, 'toujours')?.points).toBe(11_000);
    expect(recordDe(r, a, periodeSemaine(lundiSuivant))?.points).toBe(9_000);
    expect(recordDe(r, a, periodeSemaine(lundi))).toBeNull();
    expect([...r.keys()].filter((k) => k.includes('@'))).toEqual([`${a}@${periodeSemaine(lundiSuivant)}`]);
  });

  it('le général additionne les records de la période, toutes épreuves', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), score(11_000, 11, 12, 60_000), lundi);
    enregistrerPartie(s, idEpreuve('Oceania'), score(12_300, 12, 14, 90_000), lundi);
    const r = lireRecords(s);
    expect(totalGeneral(r, 'toujours')).toEqual(score(23_300, 23, 26, 150_000));
    expect(totalGeneral(r, periodeSemaine(lundi))).toEqual(score(23_300, 23, 26, 150_000));
    expect(totalGeneral(r, periodeSemaine(lundiSuivant))).toBeNull();
    expect(totalGeneral(new Map(), 'toujours')).toBeNull();
  });

  it('pseudo : 2 à 20 caractères, espaces resserrés', () => {
    expect(pseudoValide('  Michel   D ')).toBe('Michel D');
    expect(pseudoValide('M')).toBeNull();
    expect(pseudoValide(' '.repeat(5))).toBeNull();
    expect(pseudoValide('x'.repeat(20))).toBe('x'.repeat(20));
    expect(pseudoValide('x'.repeat(21))).toBeNull();
  });
});
