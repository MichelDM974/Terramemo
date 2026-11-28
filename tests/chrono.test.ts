import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLE_SUJET,
  cleSujet,
  clePseudo,
  enregistrer,
  enregistrerPartie,
  BORNE_GENERAL,
  epreuvesClassees,
  epreuvesDuGeneral,
  EPREUVES_SUJETS,
  difficulteQuiz,
  idEpreuve,
  idQuiz,
  convertirRecord,
  convertirStockage,
  ecrireRecords,
  lireRecords,
  modeEpreuve,
  MODES_EPREUVE,
  MODES_RETIRES,
  PartieChrono,
  PartieSansFaute,
  periodeSemaine,
  formePseudo,
  pseudoValide,
  recordDe,
  recordPubliable,
  sujetEpreuve,
  sujetOuvert,
  tailleEpreuve,
  TEMPS_CHRONO_VOISINS_MS,
  TEMPS_MAX_JUSTE_VOISINS_MS,
  tempsMaxQuiz,
  totalGeneral,
  type RecordChrono,
  VERSION_BAREME,
  vraisemblable,
} from '../src/epreuve/chrono';
import { comparerScores } from '../src/epreuve/bareme';
import { delaiVoisins } from '../src/exercices/voisins';
import type { Pays } from '../src/map/types';
import { catalogue, SERIE_REUNION, SERIE_TOUS, serieMers } from '../src/vues/cibles';
import { IDS_MERS } from '../src/map/mers';
import { textes } from '../src/vues/textes';

const D = 15_000;
/** Les séries des épreuves des pays et des communes, dans l'ordre de partout. */
const SERIES_PAYS_ILE = ['tous', 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania', 'reunion'];

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

  it('juste ou faux (barème 2) : points = justes, temps écoulé à 0 et compté en entier', () => {
    const p = new PartieChrono(['LVA', 'SVK', 'NGA'], D);
    expect(p.repondre('LVA', true, 0, 3000).points).toBe(1);
    expect(p.repondre('SVN', false, 310, 5000).points).toBe(0);
    const q = p.expirer();
    expect([q.points, q.touche, q.temps_ms]).toEqual([0, null, null]);
    expect(p.points).toBe(1);
    expect(p.score()).toEqual({ points: 1, justes: 1, questions: 3, temps_ms: 3000 + 5000 + D });
  });

  it('la distance d’une erreur reste dans la question jouée (rétroaction), sans points, au monde comme sur l’île', () => {
    const ile = new PartieChrono(['97411', '97416'], D);
    const q = ile.repondre('97415', false, 1, 3000);
    expect([q.distance_km, q.points]).toEqual([1, 0]);
    expect(ile.repondre('97416', true, 0, 4000).points).toBe(1);
    expect(ile.score()).toEqual({ points: 1, justes: 1, questions: 2, temps_ms: 7000 });
    const monde = new PartieChrono(['LVA'], D);
    expect(monde.repondre('LTU', false, 106, 3000)).toMatchObject({ distance_km: 106, points: 0 });
  });

  it('un toucher juste arrivé après le délai ne compte pas', () => {
    const p = new PartieChrono(['FRA'], D);
    expect(p.repondre('FRA', true, 0, D + 50).points).toBe(0);
  });
});

describe('PartieSansFaute (décision « Barème et classements »)', () => {
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

describe('records sur l’appareil', () => {
  const e = idEpreuve('Europe');
  const score = (justes: number, temps_ms: number) => ({ points: justes, justes, questions: 44, temps_ms });

  it('premier score gardé, puis seulement ce qui le bat (justes, puis temps)', () => {
    const s = stockage();
    const b1 = enregistrer(s, e, score(30, 400_000), 1);
    expect([b1.nouveau, b1.ancien]).toEqual([true, null]);
    expect(enregistrer(s, e, score(29, 100_000), 2).nouveau).toBe(false);
    expect(enregistrer(s, e, score(30, 500_000), 3).nouveau).toBe(false);
    const b4 = enregistrer(s, e, score(30, 300_000), 4);
    expect([b4.nouveau, b4.ancien?.temps_ms]).toEqual([true, 400_000]);
    const r = lireRecords(s).get(e);
    expect([r?.points, r?.temps_ms, r?.date, r?.bareme]).toEqual([30, 300_000, 4, VERSION_BAREME]);
  });

  it('une épreuve par série, sans mélange', () => {
    const s = stockage();
    enregistrer(s, idEpreuve('Africa'), score(50, 1), 1);
    enregistrer(s, e, score(10, 1), 1);
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

describe('séries des épreuves', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const continents = textes.continents as Record<string, string>;
  const s = catalogue(pays, (c) => continents[c] ?? c);

  it('tous les pays, les six continents, puis l’île, dans l’ordre de partout (EPREUVES_SUJETS) ; pas l’essai du J0', () => {
    expect(s.map((x) => x.id)).toEqual([SERIE_TOUS, 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania', SERIE_REUNION]);
    expect(s.map((x) => x.id)).toEqual(SERIES_PAYS_ILE);
    expect(EPREUVES_SUJETS.filter((p) => p.sujet === 'pays' || p.sujet === 'communes').map((p) => p.serie)).toEqual(s.map((x) => x.id));
    expect(s.find((x) => x.id === SERIE_TOUS)?.ids.length).toBe(195);
    // L'île : ses 24 communes viennent du terrain chargé ; son épreuve.
    const ile = s.at(-1);
    expect([ile?.terrain, ile?.ids.length, ile?.n]).toEqual(['reunion', 0, 24]);
    expect(idEpreuve(ile!.id)).toBe('chrono:localiser:reunion');
  });

  it('textes des épreuves : toutes les clés remplies par la vue existent', () => {
    for (const k of ['bilan_titre', 'bilan_detail', 'bilan_expire', 'record_a_battre', 'nouveau_record_bat'])
      expect(textes.chrono[k as keyof typeof textes.chrono], k).toBeTruthy();
    for (const t of ['pays', 'communes'] as const) expect(textes.sujets[t].expire, t).toBeTruthy();
    const E = textes.epreuves;
    for (const k of ['juste', 'faux', 'bilan_faux'] as const) expect(E[k], k).toBeTruthy();
    for (const m of MODES_EPREUVE) for (const k of ['nom', 'aide'] as const) expect(E[m][k], `${m}.${k}`).toBeTruthy();
    for (const k of ['compte', 'score', 'parfait', 'detail'] as const) expect(E.sansfaute[k], k).toBeTruthy();
  });
});


// Barème 1 → 2 (décision « Barème et classements » du 12/11/2026, #30) : les
// records d'avant sont convertis à la lecture (points = justes), jamais
// effacés ; sinon monter VERSION_BAREME aurait vidé l'appareil de tous ses
// records, Sans faute compris.
describe('records du barème 1, convertis au barème 2', () => {
  const C = idEpreuve('tous');
  const S = idEpreuve('Europe', 'sansfaute');
  const v1 = (points: number, justes: number, questions: number, temps_ms: number, date = 5, reste: Partial<RecordChrono> = {}) => ({ points, justes, questions, temps_ms, date, bareme: 1, ...reste });
  const lire = (objet: Record<string, unknown>) => {
    const s = stockage();
    s.m.set('terramemo.chrono.records', JSON.stringify(objet));
    return { s, r: lireRecords(s) };
  };

  it('un Chrono v1 (190 351 points, 190 justes) relu à 190 points, au barème 2, date et temps gardés', () => {
    const { r } = lire({ [C]: v1(190_351, 190, 195, 900_000) });
    expect(r.get(C)).toEqual({ points: 190, justes: 190, questions: 195, temps_ms: 900_000, date: 5, bareme: VERSION_BAREME });
    expect(VERSION_BAREME).toBe(2);
  });

  it('un Sans faute v1 : seulement le barème change (ses points valaient déjà ses justes)', () => {
    const { r } = lire({ [S]: v1(17, 17, 18, 60_000, 7) });
    expect(r.get(S)).toEqual({ points: 17, justes: 17, questions: 18, temps_ms: 60_000, date: 7, bareme: 2 });
  });

  it('les records de la semaine (@sNNNN) et du général aussi ; un record v2 tel quel', () => {
    const v2 = { points: 11, justes: 11, questions: 12, temps_ms: 60_000, date: 9, bareme: 2 };
    const { r } = lire({ [`${C}@s2914`]: v1(150_420, 150, 195, 800_000), [`general@s2914`]: v1(300_000, 290, 400, 2_000_000), [idEpreuve('South America')]: v2 });
    expect(r.get(`${C}@s2914`)).toMatchObject({ points: 150, justes: 150, bareme: 2 });
    expect(r.get(`general@s2914`)).toMatchObject({ points: 290, justes: 290, bareme: 2 });
    expect(r.get(idEpreuve('South America'))).toEqual(v2);
  });

  it('le publiable d’un record v1 est converti avec lui', () => {
    const ile = idEpreuve('reunion');
    // L'île jouée trop vite (refusée par les règles), à côté d'un score publiable.
    const { r } = lire({ [ile]: v1(24_000, 24, 24, 1_433, 4, { publiable: { points: 20_351, justes: 20, questions: 24, temps_ms: 60_000, date: 3 } }) });
    expect(r.get(ile)).toEqual({ points: 24, justes: 24, questions: 24, temps_ms: 1_433, date: 4, bareme: 2, publiable: { points: 20, justes: 20, questions: 24, temps_ms: 60_000, date: 3 } });
    expect(recordPubliable(r.get(ile)!, ile)).toEqual({ points: 20, justes: 20, questions: 24, temps_ms: 60_000 });
  });

  it('un publiable qui, compté en justes, bat le record devient le record, sans publiable', () => {
    const A = idEpreuve('South America');
    // 9 justes et des erreurs proches (10 200 points, que les règles refusaient) devant 10 justes (10 000 points), au barème 1.
    const record = v1(10_200, 9, 12, 60_000, 2, { publiable: { points: 10_000, justes: 10, questions: 12, temps_ms: 70_000, date: 1 } }) as RecordChrono;
    const attendu = { points: 10, justes: 10, questions: 12, temps_ms: 70_000, date: 1, bareme: 2 };
    expect(convertirRecord(record)).toEqual(attendu);
    expect(lire({ [A]: record }).r.get(A)).toEqual(attendu);
  });

  it('convertirRecord laisse un record v2 tel quel', () => {
    const r: RecordChrono = { points: 11, justes: 11, questions: 12, temps_ms: 60_000, date: 9, bareme: 2 };
    expect(convertirRecord(r)).toBe(r);
  });

  it('un v1 illisible (points ou justes qui ne sont pas des nombres, publiable compris) est écarté, comme une version future', () => {
    const { r } = lire({
      [C]: { ...v1(0, 190, 195, 900_000), points: '190351' },
      [S]: { ...v1(17, 0, 18, 60_000), justes: null },
      [idEpreuve('Asia')]: v1(40_000, 40, 48, 300_000, 5, { publiable: { points: 'x', justes: 30, questions: 48, temps_ms: 300_000, date: 1 } as never }),
      [idEpreuve('Africa')]: v1(50, 50, 54, 300_000, 5, { bareme: 3 }),
      [idEpreuve('Oceania')]: v1(14_000, 14, 14, 60_000),
    });
    expect([...r.keys()]).toEqual([idEpreuve('Oceania')]);
  });

  it('la conversion s’écrit avec le prochain record : le stockage relu est tout en v2', () => {
    const { s } = lire({ [C]: v1(190_351, 190, 195, 900_000), [`${S}@s2914`]: v1(17, 17, 18, 60_000) });
    // Relu sans rien écrire : le stockage garde le v1, la lecture le convertit encore.
    expect(JSON.parse(s.m.get('terramemo.chrono.records')!)[C].bareme).toBe(1);
    enregistrer(s, idEpreuve('Asia'), { points: 40, justes: 40, questions: 48, temps_ms: 300_000 }, 10);
    const ecrit = JSON.parse(s.m.get('terramemo.chrono.records')!) as Record<string, RecordChrono>;
    // La semaine de Sans faute, sans record de toujours, lui en donne un (lireRecords).
    expect(Object.keys(ecrit).sort()).toEqual([C, S, `${S}@s2914`, idEpreuve('Asia')].sort());
    expect(Object.values(ecrit).map((x) => x.bareme)).toEqual([2, 2, 2, 2]);
    expect(ecrit[C]).toMatchObject({ points: 190, justes: 190, temps_ms: 900_000, date: 5 });
    // Relue, la conversion ne change plus rien.
    const relu = lireRecords(s);
    ecrireRecords(s, relu);
    expect(lireRecords(s)).toEqual(relu);
  });

  // Au barème 1, toujours et la semaine étaient choisis aux points de
  // proximité : convertis clé par clé, le record de toujours pourrait rester
  // sous celui de la semaine (le 🏆 et Jouer le montreraient, le général de
  // toujours additionnerait moins que celui de la semaine).
  it('converti, un record de la semaine qui bat celui de toujours le remplace ; sinon, toujours reste', () => {
    // A, il y a deux semaines : 100 justes et des erreurs proches (128 500) ; B, cette semaine : 110 justes et des erreurs lointaines (118 500).
    const { r } = lire({ [C]: v1(128_500, 100, 195, 900_000, 1), [`${C}@s2966`]: v1(118_500, 110, 195, 800_000, 8) });
    const b = { points: 110, justes: 110, questions: 195, temps_ms: 800_000, date: 8, bareme: 2 };
    expect(r.get(C)).toEqual(b);
    expect(r.get(`${C}@s2966`)).toEqual(b);
    // Plus de justes de toujours : rien ne bouge.
    const { r: r2 } = lire({ [C]: v1(120_000, 120, 195, 900_000, 1), [`${C}@s2966`]: v1(118_500, 110, 195, 800_000, 8) });
    expect(r2.get(C)).toEqual({ points: 120, justes: 120, questions: 195, temps_ms: 900_000, date: 1, bareme: 2 });
  });

  it('élevé à une semaine trop rapide, le record de toujours garde le meilleur publiable des deux', () => {
    // 120 justes en 10 s (les règles le refusent), à côté d'un publiable de 110 justes ; toujours : 100 justes.
    const semaine = v1(120_000, 120, 195, 10_000, 8, { publiable: { points: 110_300, justes: 110, questions: 195, temps_ms: 800_000, date: 7 } });
    const { r } = lire({ [C]: v1(100_000, 100, 195, 900_000, 1), [`${C}@s2966`]: semaine });
    expect(r.get(C)).toEqual({ points: 120, justes: 120, questions: 195, temps_ms: 10_000, date: 8, bareme: 2, publiable: { points: 110, justes: 110, questions: 195, temps_ms: 800_000, date: 7 } });
    expect(recordPubliable(r.get(C)!, C)).toMatchObject({ justes: 110 });
  });

  it('convertirStockage écrit la conversion et rend les clés converties, une fois', () => {
    const v2 = { points: 11, justes: 11, questions: 12, temps_ms: 60_000, date: 9, bareme: 2 };
    const { s } = lire({ [C]: v1(190_351, 190, 195, 900_000), [`${S}@s2914`]: v1(17, 17, 18, 60_000), [idEpreuve('South America')]: v2, [idEpreuve('Asia')]: v1(1, 'x' as never, 48, 1) });
    expect(convertirStockage(s).sort()).toEqual([C, `${S}@s2914`].sort());
    const ecrit = JSON.parse(s.m.get('terramemo.chrono.records')!) as Record<string, RecordChrono>;
    expect(Object.values(ecrit).every((x) => x.bareme === 2)).toBe(true);
    expect(ecrit[C]).toMatchObject({ points: 190, justes: 190 });
    expect(convertirStockage(s)).toEqual([]);
    expect(convertirStockage(null)).toEqual([]);
  });
});

describe('records de la semaine et classement général', () => {
  const score = (points: number, justes: number, questions: number, temps_ms: number) => ({ points, justes, questions, temps_ms });
  /** Un score du barème 2 : points = justes. */
  const sc = (justes: number, questions: number, temps_ms: number) => score(justes, justes, questions, temps_ms);
  const lundi = Date.parse('2026-11-02T00:00:00Z');
  const lundiSuivant = Date.parse('2026-11-09T00:00:00Z');

  it('une partie compte pour toujours et pour la semaine ; les semaines passées sont oubliées', () => {
    const s = stockage();
    const a = idEpreuve('South America');
    const b1 = enregistrerPartie(s, a, sc(11, 12, 60_000), lundi);
    expect([b1.toujours.nouveau, b1.semaine.nouveau, b1.periode]).toEqual([true, true, periodeSemaine(lundi)]);
    // La semaine suivante : moins bien que le record de toujours, mais premier de la semaine.
    const b2 = enregistrerPartie(s, a, sc(9, 12, 70_000), lundiSuivant);
    expect([b2.toujours.nouveau, b2.semaine.nouveau]).toEqual([false, true]);
    const r = lireRecords(s);
    expect(recordDe(r, a, 'toujours')?.points).toBe(11);
    expect(recordDe(r, a, periodeSemaine(lundiSuivant))?.points).toBe(9);
    expect(recordDe(r, a, periodeSemaine(lundi))).toBeNull();
    expect([...r.keys()].filter((k) => k.includes('@'))).toEqual([`${a}@${periodeSemaine(lundiSuivant)}`]);
  });

  it('le général additionne les records de la période, toutes épreuves', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), sc(11, 12, 60_000), lundi);
    enregistrerPartie(s, idEpreuve('Oceania'), sc(12, 14, 90_000), lundi);
    const r = lireRecords(s);
    expect(totalGeneral(r, 'toujours')).toEqual(sc(23, 26, 150_000));
    expect(totalGeneral(r, periodeSemaine(lundi))).toEqual(sc(23, 26, 150_000));
    expect(totalGeneral(r, periodeSemaine(lundiSuivant))).toBeNull();
    expect(totalGeneral(new Map(), 'toujours')).toBeNull();
  });

  it('le général d’un pseudo prend, par épreuve, le meilleur de l’appareil et de sa place en ligne (ses autres appareils)', () => {
    const s = stockage();
    const ams = idEpreuve('South America');
    const ile = idEpreuve('reunion');
    enregistrerPartie(s, ams, sc(11, 12, 60_000), lundi);
    enregistrerPartie(s, ile, sc(16, 24, 93_240), lundi);
    const r = lireRecords(s);
    // En ligne : l'île mieux jouée sur un autre appareil, l'Europe jouée seulement là-bas, l'Amérique du Sud moins bien.
    const enLigne = new Map([
      [ile, sc(21, 24, 92_501)],
      [idEpreuve('Europe'), sc(40, 44, 200_000)],
      [ams, sc(10, 12, 50_000)],
    ]);
    expect(totalGeneral(r, 'toujours', enLigne)).toEqual(sc(11 + 21 + 40, 12 + 24 + 44, 60_000 + 92_501 + 200_000));
    // Rien sur l'appareil : les places en ligne seules.
    expect(totalGeneral(new Map(), 'toujours', enLigne)?.points).toBe(71);
  });

  it('les épreuves des pays et des communes, inchangées ; deux modes, le général au Chrono seul', () => {
    const EPREUVES = SERIES_PAYS_ILE.map((x) => `chrono:localiser:${x}`);
    const localiser = (e: string) => e.split(':')[1] === 'localiser';
    expect(epreuvesDuGeneral().filter(localiser)).toEqual(EPREUVES);
    // Et le quiz en dernier, ses quatre difficultés (lot 4b).
    expect(epreuvesClassees()).toHaveLength(2 * EPREUVES_SUJETS.length + 4);
    expect(epreuvesClassees().slice(-4)).toEqual(['quiz:general:facile', 'quiz:general:moyen', 'quiz:general:difficile', 'quiz:general:expert']);
    expect(epreuvesDuGeneral().some((e) => e.startsWith('quiz:'))).toBe(false);
    expect(epreuvesClassees().filter(localiser)).toHaveLength(2 * SERIES_PAYS_ILE.length);
    expect(epreuvesClassees().filter(localiser).slice(0, SERIES_PAYS_ILE.length)).toEqual(EPREUVES);
    expect(idEpreuve('Africa', 'sansfaute')).toBe('sansfaute:localiser:Africa');
    expect(['general', idEpreuve('Asia'), `${idEpreuve('Asia')}@s2914`, idEpreuve('reunion', 'sansfaute')].map(modeEpreuve)).toEqual(['chrono', 'chrono', 'chrono', 'sansfaute']);
  });

  it('Minute retiré (décision « Barème et classements ») : son id réservé, hors des modes, jamais publié ni additionné', () => {
    expect(MODES_EPREUVE).toEqual(['chrono', 'sansfaute']);
    expect(MODES_RETIRES).toEqual(['minute']);
    for (const m of MODES_RETIRES) expect((MODES_EPREUVE as readonly string[]).includes(m)).toBe(false);
    for (const e of ['minute:localiser:Africa', 'minute:capitales:tous@s2914', 'minute:localiser:reunion']) {
      expect(modeEpreuve(e), e).toBeNull();
      expect(vraisemblable(score(23, 23, 25, 60_000), e), e).toBe(false);
    }
    expect(epreuvesClassees().some((e) => e.startsWith('minute:'))).toBe(false);
  });

  it('vraisemblable du Chrono (barème 2) : points = justes, 0,2 à 15 s par question, sur les valeurs arrondies que publier() envoie', () => {
    const C = idEpreuve('South America');
    expect(vraisemblable(sc(11, 12, 60_000), C)).toBe(true);
    // Au moins 0,2 s par question (4,8 s pour les 24 communes), 15 s au plus.
    expect(vraisemblable(sc(24, 24, 4_800), C)).toBe(true);
    expect(vraisemblable(sc(24, 24, 4_799.4), C)).toBe(false);
    expect(vraisemblable(sc(24, 24, 4_799.6), C)).toBe(true);
    expect(vraisemblable(sc(24, 24, 1_433), C)).toBe(false);
    expect(vraisemblable(sc(0, 12, 180_000), C)).toBe(true);
    expect(vraisemblable(sc(0, 12, 180_001), C)).toBe(false);
    // Points = justes : ni plus (les points de proximité du barème 1), ni moins ; justes entre 0 et questions.
    expect(vraisemblable(score(12, 11, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(score(10, 11, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(score(11_000, 11, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(score(11_351, 11, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(sc(13, 12, 60_000), C)).toBe(false);
    expect(vraisemblable(sc(0, 0, 0), C)).toBe(false);
    // Le général : les bornes du Chrono, BORNE_GENERAL questions au plus (chronoValide(d, 0)).
    expect(vraisemblable(sc(11, 12, 60_000), 'general')).toBe(true);
    expect(vraisemblable(score(11_000, 11, 12, 60_000), 'general')).toBe(false);
    expect(vraisemblable(sc(600, BORNE_GENERAL, 3_000_000), 'general')).toBe(true);
    expect(vraisemblable(sc(600, BORNE_GENERAL + 1, 3_000_000), 'general')).toBe(false);
    expect(vraisemblable(sc(600, BORNE_GENERAL + 1, 3_000_000), `general@s2914`)).toBe(false);
    // Une épreuve n'a pas cette borne (sa taille se juge sur le serveur).
    expect(vraisemblable(sc(600, BORNE_GENERAL + 1, 3_000_000), idEpreuve('tous'))).toBe(true);
  });

  it('vraisemblable de Sans faute : points = justes, l’erreur de la fin en plus, le temps des justes seules', () => {
    const S = idEpreuve('Europe', 'sansfaute');
    expect(vraisemblable(sc(17, 18, 60_000), S)).toBe(true);
    expect(vraisemblable(sc(17, 17, 60_000), S)).toBe(true); // la série vidée (sa taille : sur le serveur)
    expect(vraisemblable(sc(0, 1, 0), S)).toBe(true);
    expect(vraisemblable(sc(0, 0, 0), S)).toBe(false);
    expect(vraisemblable(sc(17, 19, 60_000), S)).toBe(false);
    expect(vraisemblable(score(17_000, 17, 18, 60_000), S)).toBe(false);
    expect(vraisemblable(sc(17, 18, 17 * 200 - 1), S)).toBe(false);
    expect(vraisemblable(sc(17, 18, 17 * 15_000 + 1), S)).toBe(false);
    // Une clé de record de la semaine juge comme l'épreuve.
    expect(vraisemblable(sc(17, 18, 60_000), `${S}@s2914`)).toBe(true);
  });

  it('ids avec le sujet : pays et communes gardent `localiser` (inchangés), les autres sujets leur nom (étude J2 § 3.2)', () => {
    expect(CLE_SUJET).toEqual({ pays: 'localiser', communes: 'localiser', capitales: 'capitales', drapeaux: 'drapeaux', mers: 'mers' });
    // Les sujets lus dès le socle commun des J4, J5 et J6 : leur nom ; aucune épreuve tant qu'ils ne sont pas dans EPREUVES_SUJETS.
    for (const d of ['villes', 'habitants', 'superficies', 'silhouettes', 'fleuves', 'montagnes', 'deserts', 'detroits', 'departements', 'regions', 'prefectures', 'numeros'] as const) {
      expect(cleSujet(d)).toBe(d);
      expect(idEpreuve('tous', 'chrono', d)).toBe(`chrono:${d}:tous`);
      expect(EPREUVES_SUJETS.some((p) => p.sujet === d)).toBe(false);
      expect(tailleEpreuve(idEpreuve('tous', 'chrono', d))).toBeNull();
    }
    // Les voisins (J4, lot 2) : leur nom, leurs épreuves ouvertes.
    expect([cleSujet('voisins'), idEpreuve('Europe', 'sansfaute', 'voisins'), tailleEpreuve('chrono:voisins:tous')]).toEqual(['voisins', 'sansfaute:voisins:Europe', 156]);
    expect([idEpreuve('Africa'), idEpreuve('Africa', 'chrono', 'pays'), idEpreuve('reunion', 'sansfaute', 'communes')]).toEqual(['chrono:localiser:Africa', 'chrono:localiser:Africa', 'sansfaute:localiser:reunion']);
    expect([idEpreuve('Africa', 'chrono', 'capitales'), idEpreuve('tous', 'sansfaute', 'drapeaux'), idEpreuve('mers', 'chrono', 'mers')]).toEqual([
      'chrono:capitales:Africa',
      'sansfaute:drapeaux:tous',
      'chrono:mers:mers',
    ]);
  });

  it('modeEpreuve : le quiz à part, le général au Chrono, null pour un préfixe inconnu ou retiré (étude J2 § 3.2, 9.4)', () => {
    expect(modeEpreuve('quiz:general:facile')).toBe('quiz');
    expect(modeEpreuve('quiz:general:expert@s2914')).toBe('quiz');
    expect(modeEpreuve('general')).toBe('chrono');
    expect(modeEpreuve('general@s2914')).toBe('chrono');
    expect(modeEpreuve('chrono:capitales:tous')).toBe('chrono');
    for (const e of ['xyz:localiser:Africa', 'xyz:capitales:tous@s2914', 'Chrono:localiser:Africa', '', 'generale', 'minute:localiser:Africa']) expect(modeEpreuve(e)).toBeNull();
  });

  it('le général n’additionne que les épreuves de epreuvesDuGeneral : les Chrono des capitales, des drapeaux et des mers (lot 3b), pas leur Sans faute, ni le quiz, ni un mode inconnu', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), sc(11, 12, 60_000), lundi);
    enregistrerPartie(s, idEpreuve('tous', 'chrono', 'capitales'), sc(150, 186, 900_000), lundi);
    enregistrerPartie(s, idEpreuve('tous', 'chrono', 'drapeaux'), sc(150, 195, 900_000), lundi);
    enregistrerPartie(s, idEpreuve('mers', 'chrono', 'mers'), sc(40, 50, 300_000), lundi);
    enregistrerPartie(s, idEpreuve('mers', 'sansfaute', 'mers'), sc(12, 13, 100_000), lundi);
    // Reçus par le profil d'une version plus récente.
    enregistrerPartie(s, 'quiz:general:facile', sc(18, 20, 100_000), lundi);
    enregistrerPartie(s, 'xyz:localiser:Africa', sc(20, 54, 300_000), lundi);
    const r = lireRecords(s);
    expect(r.size).toBe(14);
    // Les Chrono des capitales, des drapeaux et des mers comptent (D40 a) ; ni Sans faute, ni le quiz, ni un mode inconnu.
    for (const p of ['toujours', periodeSemaine(lundi)]) expect(totalGeneral(r, p)).toEqual(sc(351, 443, 2_160_000));
    // Les places en ligne du pseudo aussi : celles des épreuves listées seules ; la meilleure des deux par épreuve.
    const enLigne = new Map([
      [idEpreuve('tous', 'chrono', 'capitales'), sc(150, 186, 900_000)],
      [idEpreuve('mers', 'chrono', 'mers'), sc(50, 50, 300_000)],
      [idEpreuve('mers', 'sansfaute', 'mers'), sc(50, 50, 300_000)],
      ['quiz:general:moyen', sc(15, 20, 100_000)],
    ]);
    expect(totalGeneral(r, 'toujours', enLigne)).toEqual(sc(361, 443, 2_160_000));
    expect(totalGeneral(new Map(), 'toujours', enLigne)).toEqual(sc(200, 236, 1_200_000));
    expect(totalGeneral(new Map(), 'toujours', new Map([['quiz:general:moyen', sc(15, 20, 100_000)]]))).toBeNull();
  });

  it('vraisemblable : le quiz aux bornes de quizValide (20 questions, points = justes, le temps borné par les délais de sa difficulté), un mode inconnu jamais', () => {
    const Q = 'quiz:general:facile';
    expect(vraisemblable(sc(18, 20, 100_000), Q)).toBe(true);
    expect(vraisemblable(score(19, 18, 20, 100_000), Q)).toBe(false);
    expect(vraisemblable(score(18_000, 18, 20, 100_000), Q)).toBe(false);
    expect(vraisemblable(sc(18, 19, 100_000), Q)).toBe(false);
    expect(vraisemblable(sc(18, 21, 100_000), Q)).toBe(false);
    expect(vraisemblable(sc(18, 20, 20 * 200 - 1), Q)).toBe(false);
    expect(vraisemblable(sc(18, 20, 20 * 15_000 + 1), Q)).toBe(false);
    expect(vraisemblable(sc(18, 20, 100_000), `${Q}@s2914`)).toBe(true);
    // Au plus le délai de chaque question, au total : 20 × 10 s au facile ; 10 × 10 + 10 × 15 s au moyen ; 8 × 6 + 12 × 10 s en expert.
    expect([tempsMaxQuiz('facile'), tempsMaxQuiz('moyen'), tempsMaxQuiz('difficile'), tempsMaxQuiz('expert')]).toEqual([200_000, 250_000, 260_000, 168_000]);
    for (const d of ['facile', 'moyen', 'difficile', 'expert'] as const) {
      expect(vraisemblable(sc(0, 20, tempsMaxQuiz(d)), idQuiz(d)), d).toBe(true);
      expect(vraisemblable(sc(0, 20, tempsMaxQuiz(d) + 1), idQuiz(d)), d).toBe(false);
    }
    // Une difficulté inconnue, ou un autre id que general : refusé.
    expect(vraisemblable(sc(18, 20, 100_000), 'quiz:general:enfer')).toBe(false);
    expect(vraisemblable(sc(18, 20, 100_000), 'quiz:general2:facile')).toBe(false);
    expect([difficulteQuiz('quiz:general:moyen@s2914'), difficulteQuiz('quiz:general:enfer'), difficulteQuiz(idEpreuve('Asia'))]).toEqual(['moyen', null, null]);
    // Un mode inconnu : refusé, quelles que soient les valeurs (les règles ne le connaissent pas).
    expect(vraisemblable(sc(11, 12, 60_000), 'xyz:localiser:Africa')).toBe(false);
    // Un Chrono d'un autre sujet : les bornes du Chrono (sa série se juge sur le serveur).
    expect(vraisemblable(sc(11, 12, 60_000), idEpreuve('Africa', 'chrono', 'capitales'))).toBe(true);
  });

  it('le général n’additionne que le Chrono : Sans faute n’y compte pas, ni un record de Minute resté sur l’appareil', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), sc(11, 12, 60_000), lundi);
    enregistrerPartie(s, idEpreuve('South America', 'sansfaute'), sc(12, 12, 30_000), lundi);
    enregistrerPartie(s, 'minute:localiser:Africa', sc(23, 25, 60_000), lundi);
    const r = lireRecords(s);
    expect(r.size).toBe(6);
    for (const p of ['toujours', periodeSemaine(lundi)]) expect(totalGeneral(r, p)).toEqual(sc(11, 12, 60_000));
    // Un record de Sans faute se juge à ses bornes : publiable ; celui de Minute, jamais.
    expect(recordPubliable(recordDe(r, idEpreuve('South America', 'sansfaute'), 'toujours')!, idEpreuve('South America', 'sansfaute'))).toEqual(sc(12, 12, 30_000));
    expect(recordPubliable(recordDe(r, 'minute:localiser:Africa', 'toujours')!, 'minute:localiser:Africa')).toBeNull();
  });

  it('un record que les règles refuseraient ne compte pas dans le général (sa somme ne fait pas tomber les autres)', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), sc(12, 12, 7_789), lundi);
    // L'île jouée par le pilote sans attendre : 1,4 s pour 24 questions, sous les 4,8 s des règles.
    enregistrerPartie(s, idEpreuve('reunion'), sc(24, 24, 1_433), lundi);
    const r = lireRecords(s);
    expect(totalGeneral(r, 'toujours')).toEqual(sc(12, 12, 7_789));
    expect(totalGeneral(r, periodeSemaine(lundi))).toEqual(sc(12, 12, 7_789));
    // Seul et refusé : pas de général du tout.
    const seul = stockage();
    enregistrerPartie(seul, idEpreuve('reunion'), sc(24, 24, 1_433), lundi);
    expect(totalGeneral(lireRecords(seul), 'toujours')).toBeNull();
  });

  it('un score trop rapide qui bat un record vraisemblable ne retire pas la série du général', () => {
    const s = stockage();
    const ile = idEpreuve('reunion');
    enregistrerPartie(s, ile, sc(24, 24, 11_946), lundi);
    enregistrerPartie(s, idEpreuve('South America'), sc(12, 12, 7_839), lundi);
    // L'île rejouée sans attendre : record de l'appareil, que les règles refuseraient.
    const vite = enregistrerPartie(s, ile, sc(24, 24, 1_100), lundi);
    expect([vite.toujours.nouveau, vite.toujours.progresPubliable]).toEqual([true, false]);
    expect(recordDe(lireRecords(s), ile, 'toujours')?.temps_ms).toBe(1_100);
    enregistrerPartie(s, idEpreuve('Oceania'), sc(14, 14, 9_136), lundi);
    const r = lireRecords(s);
    for (const p of ['toujours', periodeSemaine(lundi)]) {
      expect(totalGeneral(r, p)).toEqual(sc(50, 50, 11_946 + 7_839 + 9_136));
      expect(recordPubliable(recordDe(r, ile, p)!, ile)).toEqual(sc(24, 24, 11_946));
    }
  });

  it('un score vraisemblable qui bat le record publiable, sans battre celui de l’appareil, le remplace', () => {
    const s = stockage();
    const ile = idEpreuve('reunion');
    enregistrerPartie(s, ile, sc(20, 24, 60_000), lundi);
    enregistrerPartie(s, ile, sc(24, 24, 1_100), lundi);
    // Moins bien que le record de l'appareil, mieux que ce que le classement a reçu.
    const b = enregistrerPartie(s, ile, sc(22, 24, 50_000), lundi);
    expect([b.toujours.nouveau, b.toujours.progresPubliable]).toEqual([false, true]);
    const r = recordDe(lireRecords(s), ile, 'toujours')!;
    expect(r.temps_ms).toBe(1_100);
    expect(recordPubliable(r, ile)).toEqual(sc(22, 24, 50_000));
    // Moins bien que les deux : rien ne change.
    const b2 = enregistrerPartie(s, ile, sc(21, 24, 50_000), lundi);
    expect([b2.toujours.nouveau, b2.toujours.progresPubliable]).toEqual([false, false]);
    expect(recordPubliable(recordDe(lireRecords(s), ile, 'toujours')!, ile)?.points).toBe(22);
    // Seul et trop rapide : rien de publiable.
    const seul = stockage();
    enregistrerPartie(seul, ile, sc(24, 24, 1_100), lundi);
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
    expect(pseudoValide('Hélène')).toBe('Hélène');
    expect(clePseudo('Michel')).toBe(clePseudo('MICHEL'));
    expect(clePseudo(pseudoValide('  Hélène   D ')!)).toBe('hélène d');
  });

  it('pseudo : sans caractère invisible ni séparateur Unicode, la forme que les règles exigent (formePseudo, audit du 07/11, #25)', () => {
    // Les pseudos en ligne, et la branche masquée de cleDuPseudo (majuscule non ASCII).
    for (const p of ['Michel', 'Wiwi', 'Élodie', 'Œil de Lynx', 'Ñandú 42', 'Jean_Luc ~2', '李明', 'Michel ★', 'Ana 😀', 'Ζωή', 'राम']) {
      expect([p, pseudoValide(p)]).toEqual([p, p]);
      expect(formePseudo(p)).toBe(true);
    }
    // Un point de code non assigné (U+0378) passe, comme aux règles (le \p{C} de RE2 n'a pas Cn) : un emoji
    // plus récent que l'Unicode de l'appareil ne fait pas perdre son pseudo au joueur.
    expect(formePseudo('Léa \u0378')).toBe(true);
    expect(pseudoValide('Léa \u{1F970}')).toBe('Léa \u{1F970}');
    // Invisibles (espace sans chasse, trait d'union conditionnel, joint sans chasse, inversion bidi), contrôles.
    for (const p of ['Michel​', 'Mi­chel', 'Mi‍chel', '‮Michel', 'Mi\u0007chel', 'Élodie​']) expect([p, pseudoValide(p)]).toEqual([p, null]);
    // Les espaces Unicode sont resserrés en une espace simple par pseudoValide, mais refusés tels quels par la forme.
    expect(pseudoValide('Michel D')).toBe('Michel D');
    expect(pseudoValide('Michel　 D')).toBe('Michel D');
    expect(pseudoValide('﻿Michel')).toBe('Michel');
    for (const p of [' Michel', 'Michel ', 'Michel  D', 'Michel D', 'Michel\tD', 'Michel\nD', '', 'Michel D']) expect([p, formePseudo(p)]).toEqual([p, false]);
  });
});

describe('catalogue des épreuves et ouverture des capitales, des drapeaux et des mers, sans date (étude J2 § 3.2, décision « Ouverture des épreuves d’un sujet »)', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  // Les séries des pays et de l'île (le catalogue), et la série unique des mers (serieMers, D44 a).
  const tailleDe = new Map([...catalogue(pays), serieMers()].map((x) => [x.id, x.n]));
  const regles = readFileSync('firestore.rules', 'utf8');
  const corps = regles.slice(regles.indexOf('function tailles(cle)'), regles.indexOf('function epreuveConnue'));
  /** Les cartes de tailles(cle) des règles, dans l'ordre : mers, capitales, drapeaux, silhouettes (prête d'avance, J4 lot 1), voisins (lot 2), localiser. */
  const cartes = [...corps.matchAll(/\{([^{}]*)\}/g)].map((m) => Object.fromEntries([...m[1]!.matchAll(/'([^']+)': (\d+)/g)].map((x) => [x[1]!, Number(x[2])])));
  const ORDRE_CARTES = ['mers', 'capitales', 'drapeaux', 'silhouettes', 'voisins', 'localiser'];
  const taillesRegles = (cle: string): Record<string, number> => cartes[ORDRE_CARTES.indexOf(cle)] ?? {};
  /** Les séries des voisins (J4, lot 2), mesurées sur pays.json : les jouables qui ont un voisin jouable. */
  const jouables = new Set(pays.filter((p) => p.statut === 'jouable').map((p) => p.id));
  const posables = pays.filter((p) => jouables.has(p.id) && p.voisins.some((v) => jouables.has(v)));
  const tailleVoisins = (serie: string) => (serie === 'tous' ? posables.length : posables.filter((p) => p.continent === serie).length);
  /** La taille attendue d'une série sous une clé de sujet : celle du catalogue, sauf pour les voisins. */
  const tailleAttendue = (cle: string, serie: string) => (cle === 'voisins' ? tailleVoisins(serie) : tailleDe.get(serie));

  it('EPREUVES_SUJETS : Pays, Capitales (les séries des pays, D37 c), Drapeaux (de même), Océans et mers (sa série unique, D44 a), puis Communes (D53 b) ; chaque sujet retrouvé par son id', () => {
    const SERIES_PAYS = SERIES_PAYS_ILE.slice(0, -1);
    expect(EPREUVES_SUJETS.map((p) => `${p.sujet}:${p.serie}`)).toEqual([
      ...SERIES_PAYS.map((x) => `pays:${x}`),
      ...SERIES_PAYS.map((x) => `capitales:${x}`),
      ...SERIES_PAYS.map((x) => `drapeaux:${x}`),
      // Les voisins (J4, lot 2), sans l'Océanie (une seule question) ; les silhouettes, cachées ici, viendraient avant.
      ...SERIES_PAYS.filter((x) => x !== 'Oceania').map((x) => `voisins:${x}`),
      'mers:mers',
      'communes:reunion',
    ]);
    expect(sujetEpreuve('chrono:voisins:Oceania')).toBeNull();
    for (const p of EPREUVES_SUJETS) for (const m of MODES_EPREUVE) expect(sujetEpreuve(idEpreuve(p.serie, m, p.sujet))).toBe(p.sujet);
    expect([sujetEpreuve(`${idEpreuve('Africa', 'chrono', 'capitales')}@s2914`), sujetEpreuve('general'), sujetEpreuve('quiz:general:facile'), sujetEpreuve('chrono:capitales:reunion')]).toEqual([
      'capitales',
      null,
      null,
      null,
    ]);
    expect([sujetEpreuve(`${idEpreuve('Oceania', 'sansfaute', 'drapeaux')}@s2914`), sujetEpreuve('chrono:drapeaux:reunion')]).toEqual(['drapeaux', null]);
    // Les mers : leur série seule (« mers », pas « tous » : étude J2 § 3.2), et la clé mers seule.
    expect(['chrono:mers:mers', 'sansfaute:mers:mers@s2914', 'chrono:mers:tous', 'chrono:localiser:mers', 'chrono:capitales:mers', 'minute:mers:mers'].map(sujetEpreuve)).toEqual([
      'mers',
      'mers',
      null,
      null,
      null,
      'mers',
    ]);
  });

  it('sujetOuvert, sans date (décision « Ouverture des épreuves d’un sujet », 12/11) : un sujet de EPREUVES_SUJETS, les mers comprises (lot 3b) ; pas le quiz', () => {
    for (const su of ['pays', 'capitales', 'drapeaux', 'voisins', 'mers', 'communes']) expect(sujetOuvert(su)).toBe(true);
    for (const su of ['quiz', 'xyz']) expect(sujetOuvert(su)).toBe(false);
  });

  it('les capitales et les drapeaux : leurs 14 épreuves classées chacun (Chrono et Sans faute), le Chrono au général ; les mers : leurs 2 (D44 a), entre les drapeaux et l’île', () => {
    const de = (cle: string) => (e: string) => e.split(':')[1] === cle;
    for (const cle of ['capitales', 'drapeaux']) {
      expect(epreuvesClassees().filter(de(cle))).toHaveLength(14);
      expect(epreuvesDuGeneral().filter(de(cle))).toHaveLength(7);
    }
    expect(epreuvesClassees().filter(de('mers'))).toEqual(['chrono:mers:mers', 'sansfaute:mers:mers']);
    expect(epreuvesDuGeneral().filter(de('mers'))).toEqual(['chrono:mers:mers']);
    // Les voisins : 6 séries (sans l'Océanie), 12 épreuves, 6 au général.
    expect(epreuvesClassees().filter(de('voisins'))).toHaveLength(12);
    expect(epreuvesDuGeneral().filter(de('voisins'))).toHaveLength(6);
    expect(epreuvesDuGeneral()).toEqual([
      ...SERIES_PAYS_ILE.slice(0, -1).map((x) => idEpreuve(x)),
      ...SERIES_PAYS_ILE.slice(0, -1).map((x) => idEpreuve(x, 'chrono', 'capitales')),
      ...SERIES_PAYS_ILE.slice(0, -1).map((x) => idEpreuve(x, 'chrono', 'drapeaux')),
      ...SERIES_PAYS_ILE.slice(0, -2).map((x) => idEpreuve(x, 'chrono', 'voisins')),
      idEpreuve('mers', 'chrono', 'mers'),
      idEpreuve('reunion'),
    ]);
    // Et les 4 du quiz (lot 4b), en dernier.
    expect(epreuvesClassees()).toHaveLength(2 * 29 + 4);
    // Mode par mode, puis sujet par sujet (§ 8.3).
    expect(epreuvesClassees().slice(0, 29)).toEqual(epreuvesDuGeneral());
    expect(epreuvesClassees().slice(29, 58).every((e) => modeEpreuve(e) === 'sansfaute')).toBe(true);
    expect(epreuvesClassees().slice(58).every((e) => modeEpreuve(e) === 'quiz')).toBe(true);
  });

  it('tailleEpreuve : les questions de la série (les 100 %), celles du catalogue et de tailles(cle) des règles ; null hors du catalogue', () => {
    // Le quiz n'a pas de série : ses 20 questions font les 100 % (scores.ts, totalDe).
    for (const e of epreuvesClassees().filter((x) => modeEpreuve(x) !== 'quiz')) {
      const [, cle, serie] = e.split(':') as [string, string, string];
      expect(tailleEpreuve(e), e).toBe(tailleAttendue(cle, serie));
      expect(tailleEpreuve(e), e).toBe(taillesRegles(cle)[serie]);
      expect(tailleEpreuve(`${e}@s2914`), e).toBe(tailleAttendue(cle, serie));
    }
    expect([tailleEpreuve(idEpreuve('tous')), tailleEpreuve(idEpreuve('reunion', 'sansfaute', 'communes'))]).toEqual([195, 24]);
    // Les mers : les 50 zones de leur série unique (IDS_MERS), la couche non chargée.
    expect([tailleEpreuve('chrono:mers:mers'), tailleEpreuve('sansfaute:mers:mers@s2914')]).toEqual([IDS_MERS.length, 50]);
    for (const e of ['general', 'general@s2914', 'quiz:general:facile', 'minute:localiser:Africa', 'minute:capitales:tous@s2914', 'minute:mers:mers', 'xyz:localiser:Africa', 'chrono:mers:tous', 'chrono:localiser:mers', 'chrono:capitales:reunion'])
      expect(tailleEpreuve(e), e).toBeNull();
  });

  it('BORNE_GENERAL : la somme des tailles des Chrono du général (1 555 = 390 + 24 + 390 + 390 + 311 + 50), celle de chronoValide des règles', () => {
    const somme = epreuvesDuGeneral().reduce((n, e) => n + (tailleAttendue(e.split(':')[1]!, e.split(':')[2]!) ?? NaN), 0);
    expect(somme).toBe(1555);
    // Et la somme des tailles du catalogue (tailleEpreuve), sujet par sujet.
    expect(epreuvesDuGeneral().reduce((n, e) => n + (tailleEpreuve(e) ?? NaN), 0)).toBe(BORNE_GENERAL);
    expect(BORNE_GENERAL).toBe(somme);
    // Les règles acceptent d'avance les Chrono des silhouettes (166 + 166), cachées ici (src/visibles.ts) : tests/silhouettes.test.ts.
    expect(regles).toContain(`n == 0 ? d.questions <= ${BORNE_GENERAL + 332} :`);
  });

  it('les tailles des règles (tailles(cle)) : celles du catalogue, par clé ; les capitales (D37 c) et les drapeaux celles des pays, sans l’île ; les mers leur série unique de 50 (§ 8.2)', () => {
    expect(cartes).toHaveLength(6);
    const [mers, capitales, drapeaux, silhouettes, voisins, localiser] = cartes;
    const attendu = (sujets: string[]) => Object.fromEntries(EPREUVES_SUJETS.filter((p) => sujets.includes(p.sujet)).map((p) => [p.serie, tailleDe.get(p.serie)]));
    expect(mers).toEqual(attendu(['mers']));
    expect(mers).toEqual({ mers: 50 });
    expect(capitales).toEqual(attendu(['capitales']));
    expect(drapeaux).toEqual(attendu(['drapeaux']));
    expect(localiser).toEqual(attendu(['pays', 'communes']));
    for (const c of [capitales, drapeaux]) expect(c).toEqual({ Africa: 54, Asia: 48, Europe: 44, 'North America': 23, Oceania: 14, 'South America': 12, tous: 195 });
    // Les silhouettes, prêtes avant d'être ouvertes (cachées ici : EPREUVES_SUJETS ne les a pas ; tests/silhouettes.test.ts).
    expect(silhouettes).toEqual({ Africa: 49, Asia: 45, Europe: 38, 'North America': 16, Oceania: 6, 'South America': 12, tous: 166 });
    // Les voisins (lot 2) : les pays qui ont un voisin jouable, sans l'Océanie.
    expect(voisins).toEqual(Object.fromEntries(EPREUVES_SUJETS.filter((p) => p.sujet === 'voisins').map((p) => [p.serie, tailleAttendue('voisins', p.serie)])));
    expect(voisins).toEqual({ Africa: 48, Asia: 41, Europe: 42, 'North America': 12, 'South America': 12, tous: 156 });
    // Chaque carte sous sa clé : « cle == 'mers' ? {…} : cle == 'capitales' ? {…} : cle == 'drapeaux' ? {…} : {…} ».
    expect(corps.indexOf("cle == 'mers'")).toBeLessThan(corps.indexOf("cle == 'capitales'"));
    expect(corps.indexOf("cle == 'capitales'")).toBeLessThan(corps.indexOf("cle == 'drapeaux'"));
    expect(corps.indexOf("cle == 'drapeaux'")).toBeLessThan(corps.indexOf("cle == 'silhouettes'"));
    expect(corps.indexOf("cle == 'silhouettes'")).toBeLessThan(corps.indexOf("cle == 'voisins'"));
    expect(regles).toMatch(/p\[1\] in \['localiser', 'capitales', 'drapeaux', 'silhouettes', 'voisins', 'mers'\]/);
    // Minute retiré : les règles ne connaissent plus que le Chrono et Sans faute.
    expect(regles).toMatch(/p\[0\] in \['chrono', 'sansfaute'\]/);
  });
});

describe('les Voisins (J4, lot 2 ; D607 a, exception du 28/11 de « Barème et classements »)', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const jouables = new Set(pays.filter((p) => p.statut === 'jouable').map((p) => p.id));
  const posables = pays.filter((p) => jouables.has(p.id) && p.voisins.some((v) => jouables.has(v)));
  const n = (p: Pays) => p.voisins.filter((v) => jouables.has(v)).length;
  const regles = readFileSync('firestore.rules', 'utf8');
  const sc = (justes: number, questions: number, temps_ms: number) => ({ points: justes, justes, questions, temps_ms });

  it('délai : 4 s plus 2 s par voisin (Portugal 6 s, Hongrie 18 s, Chine 32 s)', () => {
    expect([1, 7, 14].map(delaiVoisins)).toEqual([6_000, 18_000, 32_000]);
    const de = (id: string) => n(pays.find((p) => p.id === id)!);
    expect(['PRT', 'HUN', 'CHN'].map((id) => delaiVoisins(de(id)))).toEqual([6_000, 18_000, 32_000]);
    // Le plus long, celui de la Chine et de la Russie : la borne de Sans faute par juste.
    expect(Math.max(...posables.map((p) => delaiVoisins(n(p))))).toBe(TEMPS_MAX_JUSTE_VOISINS_MS);
  });

  it('le temps maximal de chaque série : la somme de ses délais (1 872 s pour « tous »), celui des règles (tempsVoisins)', () => {
    const somme = (ps: Pays[]) => ps.reduce((t, p) => t + delaiVoisins(n(p)), 0);
    const attendu = Object.fromEntries(
      EPREUVES_SUJETS.filter((p) => p.sujet === 'voisins').map((p) => [p.serie, somme(p.serie === 'tous' ? posables : posables.filter((x) => x.continent === p.serie))]),
    );
    expect(TEMPS_CHRONO_VOISINS_MS).toEqual(attendu);
    expect(TEMPS_CHRONO_VOISINS_MS.tous).toBe(1_872_000);
    const corps = regles.slice(regles.indexOf('function tempsVoisins()'), regles.indexOf('function semaineCourante'));
    const carte = Object.fromEntries([...corps.matchAll(/'([^']+)': (\d+)/g)].map((x) => [x[1]!, Number(x[2])]));
    expect(carte).toEqual(TEMPS_CHRONO_VOISINS_MS);
    // Toujours sous 15 s par question en moyenne : le général garde sa borne par question.
    for (const [serie, t] of Object.entries(TEMPS_CHRONO_VOISINS_MS)) expect(t / tailleEpreuve(`chrono:voisins:${serie}`)!, serie).toBeLessThan(15_000);
    expect(regles).toContain("sansFauteValide(d, tailles(p[1])[p[2]], p[1] == 'voisins' ? 32000 : 15000)");
  });

  it('vraisemblable le suit : le Chrono borné à la somme de ses délais, Sans faute à 32 s par juste (15 s ailleurs)', () => {
    const e = idEpreuve('Europe', 'chrono', 'voisins');
    expect(vraisemblable(sc(40, 42, 500_000), e)).toBe(true);
    expect(vraisemblable(sc(40, 42, 518_000), e)).toBe(true);
    expect(vraisemblable(sc(40, 42, 518_001), e)).toBe(false);
    expect(vraisemblable(sc(40, 42, 600_000), e)).toBe(false);
    // Sous 15 s par question, mais au-delà des délais : refusé quand même ; la même chose pour les pays passe.
    expect(vraisemblable(sc(40, 42, 600_000), idEpreuve('Europe'))).toBe(true);
    const sf = idEpreuve('Asia', 'sansfaute', 'voisins');
    expect(vraisemblable({ points: 3, justes: 3, questions: 4, temps_ms: 90_000 }, sf)).toBe(true);
    expect(vraisemblable({ points: 3, justes: 3, questions: 4, temps_ms: 96_000 }, sf)).toBe(true);
    expect(vraisemblable({ points: 3, justes: 3, questions: 4, temps_ms: 100_000 }, sf)).toBe(false);
    expect(vraisemblable({ points: 3, justes: 3, questions: 4, temps_ms: 90_000 }, idEpreuve('Asia', 'sansfaute'))).toBe(false);
    // Une clé de record de la semaine : les mêmes bornes.
    expect(vraisemblable(sc(40, 42, 518_001), `${e}@s2914`)).toBe(false);
  });

  it('une partie au délai par question : chaque réponse bornée par le sien, un juste hors de son délai compte faux', () => {
    const p = new PartieChrono(['PRT', 'CHN'], 32_000, [6_000, 32_000]);
    expect(p.delaiCourant).toBe(6_000);
    p.repondre('PRT', true, null, 7_000);
    expect(p.delaiCourant).toBe(32_000);
    p.repondre('CHN', true, null, 20_000);
    expect(p.score()).toEqual({ points: 1, justes: 1, questions: 2, temps_ms: 6_000 + 20_000 });
    const s = new PartieSansFaute(['CHN', 'PRT'], 32_000, [32_000, 6_000]);
    s.repondre('CHN', true, null, 30_000);
    expect(s.finie).toBe(false);
    s.expirer();
    expect(s.score()).toEqual({ points: 1, justes: 1, questions: 2, temps_ms: 30_000 });
  });
});
