import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clePseudo,
  DUREE_MINUTE_MS,
  enregistrer,
  enregistrerPartie,
  EPREUVES,
  EPREUVES_CLASSEES,
  idEpreuve,
  lireRecords,
  modeEpreuve,
  PartieChrono,
  PartieMinute,
  PartieSansFaute,
  periodeSemaine,
  pseudoValide,
  recordDe,
  recordPubliable,
  SERIES_EPREUVES,
  totalGeneral,
  VERSION_BAREME,
  vraisemblable,
} from '../src/epreuve/chrono';
import { comparerScores, ECHELLES_KM } from '../src/epreuve/bareme';
import type { Pays } from '../src/map/types';
import { SERIE_REUNION, SERIE_TOUS, series, seriesToucher } from '../src/vues/cibles';
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

describe('PartieSansFaute (décision « Sans faute et Minute »)', () => {
  it('s’arrête à la première erreur : les justes d’affilée, au temps des justes seules', () => {
    const p = new PartieSansFaute(['PER', 'BOL', 'CHL', 'ARG']);
    expect(p.delai_ms).toBe(D);
    expect(p.repondre('PER', true, 0, 2000).points).toBe(1);
    expect(p.repondre('BOL', true, 0, 3000).points).toBe(1);
    expect(p.finie).toBe(false);
    expect(p.repondre('ARG', false, 40, 4000).points).toBe(0);
    expect(p.finie).toBe(true);
    expect(() => p.repondre('ARG', true, 0, 1000)).toThrow();
    expect(p.score()).toEqual({ points: 2, justes: 2, questions: 3, temps_ms: 5000 });
  });

  it('le temps écoulé est une erreur ; un toucher juste après le délai aussi', () => {
    const a = new PartieSansFaute(['PER', 'BOL']);
    a.repondre('PER', true, 0, 2000);
    a.expirer();
    expect([a.finie, a.score()]).toEqual([true, { points: 1, justes: 1, questions: 2, temps_ms: 2000 }]);
    const b = new PartieSansFaute(['PER', 'BOL']);
    expect(b.repondre('PER', true, 0, D + 50).points).toBe(0);
    expect(b.finie).toBe(true);
    expect(b.score()).toEqual({ points: 0, justes: 0, questions: 1, temps_ms: 0 });
  });

  it('la série vidée sans erreur : le score maximal', () => {
    const p = new PartieSansFaute(['PER', 'BOL']);
    p.repondre('PER', true, 0, 2000);
    p.repondre('BOL', true, 0, 2500);
    expect([p.finie, p.score()]).toEqual([true, { points: 2, justes: 2, questions: 2, temps_ms: 4500 }]);
  });
});

describe('PartieMinute (décision « Sans faute et Minute »)', () => {
  it('une erreur passe à la suivante ; la minute terminée, la question posée ne compte pas', () => {
    const p = new PartieMinute(['PER', 'BOL', 'CHL', 'ARG']);
    expect([p.duree_ms, p.reste]).toEqual([DUREE_MINUTE_MS, 60_000]);
    expect(p.repondre('PER', true, 0, 20_000).points).toBe(1);
    expect(p.repondre('ARG', false, 40, 25_000).points).toBe(0);
    expect([p.finie, p.reste, p.courante]).toEqual([false, 15_000, 'CHL']);
    p.terminer();
    expect(p.finie).toBe(true);
    expect(p.score()).toEqual({ points: 1, justes: 1, questions: 2, temps_ms: 60_000 });
    expect(() => new PartieMinute(['PER']).expirer()).toThrow();
  });

  it('la série vidée avant la fin : la partie s’arrête, au temps passé', () => {
    const p = new PartieMinute(['PER', 'BOL']);
    p.repondre('PER', true, 0, 2000);
    p.repondre('CHL', false, 300, 3000);
    expect([p.finie, p.score()]).toEqual([true, { points: 1, justes: 1, questions: 2, temps_ms: 5000 }]);
  });

  it('départage : plus de justes, puis la série vidée plus vite, puis moins d’erreurs', () => {
    const s = (justes: number, questions: number, temps_ms: number) => ({ points: justes, justes, questions, temps_ms });
    const tries = [s(20, 25, 60_000), s(20, 22, 60_000), s(24, 24, 45_000), s(24, 24, 50_000), s(21, 30, 60_000)].sort(comparerScores);
    expect(tries).toEqual([s(24, 24, 45_000), s(24, 24, 50_000), s(21, 30, 60_000), s(20, 22, 60_000), s(20, 25, 60_000)]);
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

  it('les six continents, tous les pays, puis l’île ; pas l’essai du J0', () => {
    expect(s.map((x) => x.id)).toEqual(['Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania', SERIE_TOUS, SERIE_REUNION]);
    expect(s.find((x) => x.id === SERIE_TOUS)?.ids.length).toBe(195);
    // L'île : ses 24 communes viennent du terrain chargé ; son épreuve et son échelle.
    const ile = s.at(-1);
    expect([ile?.terrain, ile?.ids.length, ile?.n]).toEqual(['reunion', 0, 24]);
    expect(idEpreuve(ile!.id)).toBe('chrono:localiser:reunion');
    expect(ECHELLES_KM[ile!.terrain]).toBe(5);
    for (const x of s.slice(0, -1)) expect(ECHELLES_KM[x.terrain], x.id).toBe(300);
  });

  it('seriesChrono garde l’île une seule fois, même si la liste reçue la porte déjà', () => {
    expect(seriesChrono(seriesToucher(pays, (c) => continents[c] ?? c)).filter((x) => x.id === SERIE_REUNION)).toHaveLength(1);
  });

  it('textes des épreuves : toutes les clés remplies par la vue existent', () => {
    for (const k of ['record', 'points', 'juste', 'faux', 'bilan_titre', 'bilan_score', 'bilan_detail', 'bilan_faux', 'bilan_expire', 'record_a_battre', 'nouveau_record_bat'])
      expect(textes.chrono[k as keyof typeof textes.chrono], k).toBeTruthy();
    for (const t of ['monde', 'reunion'] as const) {
      expect(textes.terrains[t].expire, t).toBeTruthy();
      expect(textes.terrains[t].expire_sans_points, t).toBeTruthy();
    }
    const E = textes.epreuves;
    for (const m of ['chrono', 'sansfaute', 'minute'] as const) for (const k of ['nom', 'aide'] as const) expect(E[m][k], `${m}.${k}`).toBeTruthy();
    for (const k of ['compte', 'score', 'parfait', 'detail'] as const) expect(E.sansfaute[k], k).toBeTruthy();
    for (const k of ['score', 'videe'] as const) expect(E.minute[k], k).toBeTruthy();
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

  it('le général d’un pseudo prend, par épreuve, le meilleur de l’appareil et de sa place en ligne (ses autres appareils)', () => {
    const s = stockage();
    const ams = idEpreuve('South America');
    const ile = idEpreuve('reunion');
    enregistrerPartie(s, ams, score(11_000, 11, 12, 60_000), lundi);
    enregistrerPartie(s, ile, score(17_087, 16, 24, 93_240), lundi);
    const r = lireRecords(s);
    // En ligne : l'île mieux jouée sur un autre appareil, l'Europe jouée seulement là-bas, l'Amérique du Sud moins bien.
    const enLigne = new Map([
      [ile, score(21_567, 21, 24, 92_501)],
      [idEpreuve('Europe'), score(40_000, 40, 44, 200_000)],
      [ams, score(10_000, 10, 12, 50_000)],
    ]);
    expect(totalGeneral(r, 'toujours', enLigne)).toEqual(score(11_000 + 21_567 + 40_000, 11 + 21 + 40, 12 + 24 + 44, 60_000 + 92_501 + 200_000));
    // Rien sur l'appareil : les places en ligne seules.
    expect(totalGeneral(new Map(), 'toujours', enLigne)?.points).toBe(71_567);
  });

  it('les séries des épreuves sont celles des règles Firestore (tailles()) ; trois modes, le général au Chrono seul', () => {
    const regles = readFileSync('firestore.rules', 'utf8');
    const tailles = [...regles.matchAll(/^\s+'([^']+)': \d+,?$/gm)].map((m) => m[1]);
    expect([...SERIES_EPREUVES].sort()).toEqual(tailles.sort());
    expect(EPREUVES).toEqual(SERIES_EPREUVES.map((x) => `chrono:localiser:${x}`));
    expect(EPREUVES_CLASSEES).toHaveLength(3 * SERIES_EPREUVES.length);
    expect(EPREUVES_CLASSEES.slice(0, SERIES_EPREUVES.length)).toEqual(EPREUVES);
    expect([idEpreuve('Africa', 'sansfaute'), idEpreuve('tous', 'minute')]).toEqual(['sansfaute:localiser:Africa', 'minute:localiser:tous']);
    expect(['general', idEpreuve('Asia'), `${idEpreuve('Asia', 'minute')}@s2914`, idEpreuve('reunion', 'sansfaute')].map(modeEpreuve)).toEqual(['chrono', 'chrono', 'minute', 'sansfaute']);
  });

  it('vraisemblable : les bornes de firestore.rules, sur les valeurs arrondies que publier() envoie', () => {
    const C = idEpreuve('South America');
    expect(vraisemblable(score(11_000, 11, 12, 60_000), C)).toBe(true);
    // Au moins 0,2 s par question (4,8 s pour les 24 communes), 15 s au plus.
    expect(vraisemblable(score(24_000, 24, 24, 4_800), C)).toBe(true);
    expect(vraisemblable(score(24_000, 24, 24, 4_799.4), C)).toBe(false);
    expect(vraisemblable(score(24_000, 24, 24, 4_799.6), C)).toBe(true);
    expect(vraisemblable(score(24_000, 24, 24, 1_433), C)).toBe(false);
    expect(vraisemblable(score(0, 0, 12, 180_000), C)).toBe(true);
    expect(vraisemblable(score(0, 0, 12, 180_001), C)).toBe(false);
    // 1 000 par juste, 500 au plus par erreur ; justes entre 0 et questions.
    expect(vraisemblable(score(11_500, 11, 12, 60_000), C)).toBe(true);
    expect(vraisemblable(score(11_501, 11, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(score(10_999, 11, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(score(13_000, 13, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(score(0, 0, 0, 0), C)).toBe(false);
    // Le général : les bornes du Chrono.
    expect(vraisemblable(score(11_000, 11, 12, 60_000), 'general')).toBe(true);
  });

  it('vraisemblable de Sans faute : points = justes, l’erreur de la fin en plus, le temps des justes seules', () => {
    const S = idEpreuve('Europe', 'sansfaute');
    expect(vraisemblable(score(17, 17, 18, 60_000), S)).toBe(true);
    expect(vraisemblable(score(17, 17, 17, 60_000), S)).toBe(true); // la série vidée (sa taille : sur le serveur)
    expect(vraisemblable(score(0, 0, 1, 0), S)).toBe(true);
    expect(vraisemblable(score(0, 0, 0, 0), S)).toBe(false);
    expect(vraisemblable(score(17, 17, 19, 60_000), S)).toBe(false);
    expect(vraisemblable(score(17_000, 17, 18, 60_000), S)).toBe(false);
    expect(vraisemblable(score(17, 17, 18, 17 * 200 - 1), S)).toBe(false);
    expect(vraisemblable(score(17, 17, 18, 17 * 15_000 + 1), S)).toBe(false);
    // Une clé de record de la semaine juge comme l'épreuve.
    expect(vraisemblable(score(17, 17, 18, 60_000), `${S}@s2914`)).toBe(true);
  });

  it('vraisemblable de Minute : points = justes, 60 s au plus, 0,2 s au moins par question', () => {
    const M = idEpreuve('Africa', 'minute');
    expect(vraisemblable(score(23, 23, 25, 60_000), M)).toBe(true);
    expect(vraisemblable(score(12, 11, 12, 30_000), M)).toBe(false);
    expect(vraisemblable(score(0, 0, 0, 60_000), M)).toBe(true);
    expect(vraisemblable(score(23, 23, 25, 60_001), M)).toBe(false);
    expect(vraisemblable(score(23, 23, 25, 25 * 200 - 1), M)).toBe(false);
    expect(vraisemblable(score(23, 24, 25, 60_000), M)).toBe(false);
  });

  it('le général n’additionne que le Chrono : Sans faute et Minute n’y comptent pas', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), score(11_000, 11, 12, 60_000), lundi);
    enregistrerPartie(s, idEpreuve('South America', 'sansfaute'), score(12, 12, 12, 30_000), lundi);
    enregistrerPartie(s, idEpreuve('Africa', 'minute'), score(23, 23, 25, 60_000), lundi);
    const r = lireRecords(s);
    expect(r.size).toBe(6);
    for (const p of ['toujours', periodeSemaine(lundi)]) expect(totalGeneral(r, p)).toEqual(score(11_000, 11, 12, 60_000));
    // Un record de Sans faute se juge à ses bornes : publiable.
    expect(recordPubliable(recordDe(r, idEpreuve('South America', 'sansfaute'), 'toujours')!, idEpreuve('South America', 'sansfaute'))).toEqual(score(12, 12, 12, 30_000));
  });

  it('un record que les règles refuseraient ne compte pas dans le général (sa somme ne fait pas tomber les autres)', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), score(12_000, 12, 12, 7_789), lundi);
    // L'île jouée par le pilote sans attendre : 1,4 s pour 24 questions, sous les 4,8 s des règles.
    enregistrerPartie(s, idEpreuve('reunion'), score(24_000, 24, 24, 1_433), lundi);
    const r = lireRecords(s);
    expect(totalGeneral(r, 'toujours')).toEqual(score(12_000, 12, 12, 7_789));
    expect(totalGeneral(r, periodeSemaine(lundi))).toEqual(score(12_000, 12, 12, 7_789));
    // Seul et refusé : pas de général du tout.
    const seul = stockage();
    enregistrerPartie(seul, idEpreuve('reunion'), score(24_000, 24, 24, 1_433), lundi);
    expect(totalGeneral(lireRecords(seul), 'toujours')).toBeNull();
  });

  it('un score trop rapide qui bat un record vraisemblable ne retire pas la série du général', () => {
    const s = stockage();
    const ile = idEpreuve('reunion');
    enregistrerPartie(s, ile, score(24_000, 24, 24, 11_946), lundi);
    enregistrerPartie(s, idEpreuve('South America'), score(12_000, 12, 12, 7_839), lundi);
    // L'île rejouée sans attendre : record de l'appareil, que les règles refuseraient.
    const vite = enregistrerPartie(s, ile, score(24_000, 24, 24, 1_100), lundi);
    expect([vite.toujours.nouveau, vite.toujours.progresPubliable]).toEqual([true, false]);
    expect(recordDe(lireRecords(s), ile, 'toujours')?.temps_ms).toBe(1_100);
    enregistrerPartie(s, idEpreuve('Oceania'), score(14_000, 14, 14, 9_136), lundi);
    const r = lireRecords(s);
    for (const p of ['toujours', periodeSemaine(lundi)]) {
      expect(totalGeneral(r, p)).toEqual(score(50_000, 50, 50, 11_946 + 7_839 + 9_136));
      expect(recordPubliable(recordDe(r, ile, p)!, ile)).toEqual(score(24_000, 24, 24, 11_946));
    }
  });

  it('un score vraisemblable qui bat le record publiable, sans battre celui de l’appareil, le remplace', () => {
    const s = stockage();
    const ile = idEpreuve('reunion');
    enregistrerPartie(s, ile, score(20_000, 20, 24, 60_000), lundi);
    enregistrerPartie(s, ile, score(24_000, 24, 24, 1_100), lundi);
    // Moins bien que le record de l'appareil, mieux que ce que le classement a reçu.
    const b = enregistrerPartie(s, ile, score(22_000, 22, 24, 50_000), lundi);
    expect([b.toujours.nouveau, b.toujours.progresPubliable]).toEqual([false, true]);
    const r = recordDe(lireRecords(s), ile, 'toujours')!;
    expect(r.temps_ms).toBe(1_100);
    expect(recordPubliable(r, ile)).toEqual(score(22_000, 22, 24, 50_000));
    // Moins bien que les deux : rien ne change.
    const b2 = enregistrerPartie(s, ile, score(21_000, 21, 24, 50_000), lundi);
    expect([b2.toujours.nouveau, b2.toujours.progresPubliable]).toEqual([false, false]);
    expect(recordPubliable(recordDe(lireRecords(s), ile, 'toujours')!, ile)?.points).toBe(22_000);
    // Seul et trop rapide : rien de publiable.
    const seul = stockage();
    enregistrerPartie(seul, ile, score(24_000, 24, 24, 1_100), lundi);
    expect(recordPubliable(recordDe(lireRecords(seul), ile, 'toujours')!, ile)).toBeNull();
  });

  it('pseudo : 2 à 20 caractères, espaces resserrés', () => {
    expect(pseudoValide('  Michel   D ')).toBe('Michel D');
    expect(pseudoValide('M')).toBeNull();
    expect(pseudoValide(' '.repeat(5))).toBeNull();
    expect(pseudoValide('x'.repeat(20))).toBe('x'.repeat(20));
    expect(pseudoValide('x'.repeat(21))).toBeNull();
  });

  it('pseudo : il nomme la place, donc sans « / » ni nom refusé par Firestore ; la casse ne compte pas', () => {
    expect(pseudoValide('A/B')).toBeNull();
    expect(pseudoValide('..')).toBeNull();
    expect(pseudoValide('__ab__')).toBeNull();
    expect(pseudoValide('_ab_')).toBe('_ab_');
    // é composé (e + accent) ou d'un seul caractère : le même pseudo.
    expect(pseudoValide('He\u0301le\u0300ne')).toBe('Hélène');
    expect(clePseudo('Michel')).toBe(clePseudo('MICHEL'));
    expect(clePseudo(pseudoValide('  Hélène   D ')!)).toBe('hélène d');
  });
});
