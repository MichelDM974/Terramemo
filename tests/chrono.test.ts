import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLE_SUJET,
  clePseudo,
  DUREE_MINUTE_MS,
  enregistrer,
  enregistrerPartie,
  BORNE_GENERAL,
  epreuvesClassees,
  epreuvesDuGeneral,
  EPREUVES_OUVERTES,
  EPREUVES_SUJETS,
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
  sujetEpreuve,
  sujetOuvert,
  totalGeneral,
  VERSION_BAREME,
  vraisemblable,
} from '../src/epreuve/chrono';
import { comparerScores, ECHELLES_KM } from '../src/epreuve/bareme';
import type { Pays } from '../src/map/types';
import { catalogue, SERIE_REUNION, SERIE_TOUS } from '../src/vues/cibles';
import { textes } from '../src/vues/textes';

const D = 15_000;
/** La bascule des épreuves des capitales et des drapeaux (décision « Ouverture des épreuves d'un sujet ») : avant, après. */
const OUVERTURE = Date.parse('2026-11-16T00:00:00Z');
const AVANT = OUVERTURE - 1;
const APRES = OUVERTURE;
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

describe('séries des épreuves', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const continents = textes.continents as Record<string, string>;
  const s = catalogue(pays, (c) => continents[c] ?? c);

  it('tous les pays, les six continents, puis l’île, dans l’ordre de partout (EPREUVES_SUJETS) ; pas l’essai du J0', () => {
    expect(s.map((x) => x.id)).toEqual([SERIE_TOUS, 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania', SERIE_REUNION]);
    expect(s.map((x) => x.id)).toEqual(SERIES_PAYS_ILE);
    expect(EPREUVES_SUJETS.filter((p) => p.sujet !== 'capitales' && p.sujet !== 'drapeaux').map((p) => p.serie)).toEqual(s.map((x) => x.id));
    expect(s.find((x) => x.id === SERIE_TOUS)?.ids.length).toBe(195);
    // L'île : ses 24 communes viennent du terrain chargé ; son épreuve et son échelle.
    const ile = s.at(-1);
    expect([ile?.terrain, ile?.ids.length, ile?.n]).toEqual(['reunion', 0, 24]);
    expect(idEpreuve(ile!.id)).toBe('chrono:localiser:reunion');
    expect(ECHELLES_KM[ile!.terrain]).toBe(5);
    for (const x of s.slice(0, -1)) expect(ECHELLES_KM[x.terrain], x.id).toBe(300);
  });

  it('textes des épreuves : toutes les clés remplies par la vue existent', () => {
    for (const k of ['points', 'juste', 'faux', 'bilan_titre', 'bilan_score', 'bilan_detail', 'bilan_faux', 'bilan_expire', 'record_a_battre', 'nouveau_record_bat'])
      expect(textes.chrono[k as keyof typeof textes.chrono], k).toBeTruthy();
    for (const t of ['pays', 'communes'] as const) {
      expect(textes.sujets[t].expire, t).toBeTruthy();
      expect(textes.sujets[t].expire_sans_points, t).toBeTruthy();
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

  it('les épreuves ouvertes avant la bascule : celles des pays et des communes, inchangées ; trois modes, le général au Chrono seul', () => {
    const EPREUVES = SERIES_PAYS_ILE.map((x) => `chrono:localiser:${x}`);
    expect(epreuvesDuGeneral(AVANT)).toEqual(EPREUVES);
    expect(epreuvesClassees(AVANT)).toHaveLength(3 * SERIES_PAYS_ILE.length);
    expect(epreuvesClassees(AVANT).slice(0, SERIES_PAYS_ILE.length)).toEqual(EPREUVES);
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
    // Le général : les bornes du Chrono, BORNE_GENERAL questions au plus (chronoValide(d, 0)).
    expect(vraisemblable(score(11_000, 11, 12, 60_000), 'general')).toBe(true);
    expect(vraisemblable(score(600_000, 600, 1194, 3_000_000), 'general')).toBe(true);
    expect(vraisemblable(score(600_000, 600, 1195, 3_000_000), 'general')).toBe(false);
    expect(vraisemblable(score(600_000, 600, 1195, 3_000_000), `general@s2914`)).toBe(false);
    // Une épreuve n'a pas cette borne (sa taille se juge sur le serveur).
    expect(vraisemblable(score(600_000, 600, 1195, 3_000_000), idEpreuve('tous'))).toBe(true);
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

  it('ids avec le sujet : pays et communes gardent `localiser` (inchangés), les autres sujets leur nom (étude J2 § 3.2)', () => {
    expect(CLE_SUJET).toEqual({ pays: 'localiser', communes: 'localiser', capitales: 'capitales', drapeaux: 'drapeaux', mers: 'mers' });
    expect([idEpreuve('Africa'), idEpreuve('Africa', 'chrono', 'pays'), idEpreuve('reunion', 'minute', 'communes')]).toEqual(['chrono:localiser:Africa', 'chrono:localiser:Africa', 'minute:localiser:reunion']);
    expect([idEpreuve('Africa', 'chrono', 'capitales'), idEpreuve('tous', 'sansfaute', 'drapeaux'), idEpreuve('mers', 'minute', 'mers')]).toEqual([
      'chrono:capitales:Africa',
      'sansfaute:drapeaux:tous',
      'minute:mers:mers',
    ]);
    // Avant la bascule du 16/11 : celles des pays et des communes, seules et inchangées.
    expect(epreuvesDuGeneral(AVANT).every((e) => e.split(':')[1] === 'localiser')).toBe(true);
    expect(epreuvesClassees(AVANT).every((e) => e.split(':')[1] === 'localiser')).toBe(true);
  });

  it('modeEpreuve : le quiz à part, le général au Chrono, null pour un préfixe inconnu (étude J2 § 3.2, 9.4)', () => {
    expect(modeEpreuve('quiz:general:facile')).toBe('quiz');
    expect(modeEpreuve('quiz:general:expert@s2914')).toBe('quiz');
    expect(modeEpreuve('general')).toBe('chrono');
    expect(modeEpreuve('general@s2914')).toBe('chrono');
    expect(modeEpreuve('chrono:capitales:tous')).toBe('chrono');
    for (const e of ['xyz:localiser:Africa', 'xyz:capitales:tous@s2914', 'Chrono:localiser:Africa', '', 'generale']) expect(modeEpreuve(e)).toBeNull();
  });

  it('le général n’additionne que les épreuves de epreuvesDuGeneral : ni un Chrono pas encore ouvert, ni le quiz, ni un mode inconnu', () => {
    const s = stockage();
    enregistrerPartie(s, idEpreuve('South America'), score(11_000, 11, 12, 60_000), lundi);
    // Reçus par le profil d'une version plus récente.
    enregistrerPartie(s, idEpreuve('tous', 'chrono', 'capitales'), score(150_000, 150, 186, 900_000), lundi);
    enregistrerPartie(s, 'quiz:general:facile', score(18_000, 18, 20, 100_000), lundi);
    enregistrerPartie(s, 'xyz:localiser:Africa', score(20_000, 20, 54, 300_000), lundi);
    enregistrerPartie(s, idEpreuve('tous', 'chrono', 'drapeaux'), score(150_000, 150, 195, 900_000), lundi);
    const r = lireRecords(s);
    expect(r.size).toBe(10);
    // Avant l'ouverture des capitales et des drapeaux : ni eux, ni le quiz, ni un mode inconnu.
    for (const p of ['toujours', periodeSemaine(lundi)]) expect(totalGeneral(r, p, new Map(), AVANT)).toEqual(score(11_000, 11, 12, 60_000));
    // Les places en ligne du pseudo aussi : celles des épreuves listées seules.
    const enLigne = new Map([
      [idEpreuve('tous', 'chrono', 'capitales'), score(150_000, 150, 186, 900_000)],
      ['quiz:general:moyen', score(15_000, 15, 20, 100_000)],
    ]);
    expect(totalGeneral(r, 'toujours', enLigne, AVANT)).toEqual(score(11_000, 11, 12, 60_000));
    expect(totalGeneral(new Map(), 'toujours', enLigne, AVANT)).toBeNull();
    // Après la bascule : les Chrono des capitales et des drapeaux comptent (D40 a), le reste toujours pas.
    expect(totalGeneral(r, 'toujours', new Map(), APRES)).toEqual(score(311_000, 311, 393, 1_860_000));
    expect(totalGeneral(new Map(), 'toujours', enLigne, APRES)).toEqual(score(150_000, 150, 186, 900_000));
  });

  it('vraisemblable : le quiz aux bornes de quizValide (20 questions, barème du Chrono), un mode inconnu jamais', () => {
    const Q = 'quiz:general:facile';
    expect(vraisemblable(score(18_000, 18, 20, 100_000), Q)).toBe(true);
    expect(vraisemblable(score(19_000, 18, 20, 100_000), Q)).toBe(true);
    expect(vraisemblable(score(19_001, 18, 20, 100_000), Q)).toBe(false);
    expect(vraisemblable(score(18_000, 18, 19, 100_000), Q)).toBe(false);
    expect(vraisemblable(score(18_000, 18, 21, 100_000), Q)).toBe(false);
    expect(vraisemblable(score(18_000, 18, 20, 20 * 200 - 1), Q)).toBe(false);
    expect(vraisemblable(score(18_000, 18, 20, 20 * 15_000 + 1), Q)).toBe(false);
    expect(vraisemblable(score(18_000, 18, 20, 100_000), `${Q}@s2914`)).toBe(true);
    // Un mode inconnu : refusé, quelles que soient les valeurs (les règles ne le connaissent pas).
    expect(vraisemblable(score(11_000, 11, 12, 60_000), 'xyz:localiser:Africa')).toBe(false);
    // Un Chrono d'un autre sujet : les bornes du Chrono (sa série se juge sur le serveur).
    expect(vraisemblable(score(11_000, 11, 12, 60_000), idEpreuve('Africa', 'chrono', 'capitales'))).toBe(true);
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

describe('catalogue des épreuves et ouverture datée des capitales et des drapeaux (étude J2 § 3.2, décision « Ouverture des épreuves d’un sujet »)', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const tailleDe = new Map(catalogue(pays).map((x) => [x.id, x.n]));

  it('EPREUVES_SUJETS : Pays, Capitales (les séries des pays, D37 c), Drapeaux (de même), puis Communes (D53 b) ; chaque sujet retrouvé par son id', () => {
    const SERIES_PAYS = SERIES_PAYS_ILE.slice(0, -1);
    expect(EPREUVES_SUJETS.map((p) => `${p.sujet}:${p.serie}`)).toEqual([
      ...SERIES_PAYS.map((x) => `pays:${x}`),
      ...SERIES_PAYS.map((x) => `capitales:${x}`),
      ...SERIES_PAYS.map((x) => `drapeaux:${x}`),
      'communes:reunion',
    ]);
    for (const p of EPREUVES_SUJETS) for (const m of ['chrono', 'sansfaute', 'minute'] as const) expect(sujetEpreuve(idEpreuve(p.serie, m, p.sujet))).toBe(p.sujet);
    expect([sujetEpreuve(`${idEpreuve('Africa', 'chrono', 'capitales')}@s2914`), sujetEpreuve('general'), sujetEpreuve('quiz:general:facile'), sujetEpreuve('chrono:capitales:reunion')]).toEqual([
      'capitales',
      null,
      null,
      null,
    ]);
    expect([sujetEpreuve(`${idEpreuve('Oceania', 'minute', 'drapeaux')}@s2914`), sujetEpreuve('chrono:drapeaux:reunion')]).toEqual(['drapeaux', null]);
  });

  it('une table sujet → date : les capitales et les drapeaux le même lundi 16/11/2026 à 0 h UTC (4 h à La Réunion), début d’une semaine du classement ; pas les mers', () => {
    expect(new Date(EPREUVES_OUVERTES.capitales!).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(new Date(EPREUVES_OUVERTES.drapeaux!).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(periodeSemaine(OUVERTURE)).not.toBe(periodeSemaine(OUVERTURE - 1));
    for (const su of ['capitales', 'drapeaux']) expect([sujetOuvert(su, AVANT), sujetOuvert(su, APRES)]).toEqual([false, true]);
    for (const su of ['pays', 'communes']) expect([sujetOuvert(su, 0), sujetOuvert(su, AVANT), sujetOuvert(su, APRES)]).toEqual([true, true, true]);
    for (const su of ['mers', 'quiz', 'xyz']) expect(sujetOuvert(su, APRES + 1e12)).toBe(false);
  });

  it('avant : rien des capitales ni des drapeaux (ni au général, ni classé) ; après : leurs 21 épreuves chacun, le Chrono au général', () => {
    const de = (cle: string) => (e: string) => e.split(':')[1] === cle;
    for (const cle of ['capitales', 'drapeaux']) {
      expect(epreuvesDuGeneral(AVANT).filter(de(cle))).toEqual([]);
      expect(epreuvesClassees(AVANT).filter(de(cle))).toEqual([]);
      expect(epreuvesClassees(APRES).filter(de(cle))).toHaveLength(21);
    }
    expect(epreuvesDuGeneral(APRES)).toEqual([
      ...SERIES_PAYS_ILE.slice(0, -1).map((x) => idEpreuve(x)),
      ...SERIES_PAYS_ILE.slice(0, -1).map((x) => idEpreuve(x, 'chrono', 'capitales')),
      ...SERIES_PAYS_ILE.slice(0, -1).map((x) => idEpreuve(x, 'chrono', 'drapeaux')),
      idEpreuve('reunion'),
    ]);
    expect(epreuvesClassees(APRES)).toHaveLength(3 * 22);
    // Mode par mode, puis sujet par sujet (§ 8.3).
    expect(epreuvesClassees(APRES).slice(0, 22)).toEqual(epreuvesDuGeneral(APRES));
    expect(epreuvesClassees(APRES).slice(22, 44).every((e) => modeEpreuve(e) === 'sansfaute')).toBe(true);
    expect(epreuvesClassees(APRES).slice(44).every((e) => modeEpreuve(e) === 'minute')).toBe(true);
  });

  it('BORNE_GENERAL : la somme des tailles des Chrono ouverts (1 194 = 390 + 24 + 390 + 390), celle de chronoValide des règles', () => {
    const somme = (t: number) => epreuvesDuGeneral(t).reduce((n, e) => n + (tailleDe.get(e.split(':')[2]!) ?? NaN), 0);
    expect(somme(AVANT)).toBe(414);
    expect(somme(APRES)).toBe(1194);
    expect(BORNE_GENERAL).toBe(somme(APRES));
    const regles = readFileSync('firestore.rules', 'utf8');
    expect(regles).toContain(`n == 0 ? d.questions <= ${BORNE_GENERAL} :`);
  });

  it('les tailles des règles (tailles(cle)) : celles du catalogue, par clé ; les capitales (D37 c) et les drapeaux celles des pays, sans l’île', () => {
    const regles = readFileSync('firestore.rules', 'utf8');
    const corps = regles.slice(regles.indexOf('function tailles(cle)'), regles.indexOf('function epreuveConnue'));
    const cartes = [...corps.matchAll(/\{([^{}]*)\}/g)].map((m) => Object.fromEntries([...m[1]!.matchAll(/'([^']+)': (\d+)/g)].map((x) => [x[1], Number(x[2])])));
    expect(cartes).toHaveLength(3);
    const [capitales, drapeaux, localiser] = cartes;
    const attendu = (sujets: string[]) => Object.fromEntries(EPREUVES_SUJETS.filter((p) => sujets.includes(p.sujet)).map((p) => [p.serie, tailleDe.get(p.serie)]));
    expect(capitales).toEqual(attendu(['capitales']));
    expect(drapeaux).toEqual(attendu(['drapeaux']));
    expect(localiser).toEqual(attendu(['pays', 'communes']));
    for (const c of [capitales, drapeaux]) expect(c).toEqual({ Africa: 54, Asia: 48, Europe: 44, 'North America': 23, Oceania: 14, 'South America': 12, tous: 195 });
    // Chaque carte sous sa clé : « cle == 'capitales' ? {…} : cle == 'drapeaux' ? {…} : {…} ».
    expect(corps.indexOf("cle == 'capitales'")).toBeLessThan(corps.indexOf("cle == 'drapeaux'"));
    expect(regles).toMatch(/p\[1\] in \['localiser', 'capitales', 'drapeaux'\]/);
  });

  it('l’horloge de la bascule se lit au moment du calcul : réglée (tests, ?horloge= au serveur de développement), elle change tout de suite les listes', async () => {
    const { reglerHorlogeEpreuves, maintenantEpreuves } = await import('../src/epreuve/chrono');
    try {
      reglerHorlogeEpreuves(() => AVANT);
      expect(maintenantEpreuves()).toBe(AVANT);
      expect(epreuvesDuGeneral()).toHaveLength(8);
      reglerHorlogeEpreuves(() => APRES);
      expect(epreuvesDuGeneral()).toHaveLength(22);
      expect([sujetOuvert('capitales'), sujetOuvert('drapeaux')]).toEqual([true, true]);
    } finally {
      reglerHorlogeEpreuves(() => Date.now());
    }
  });
});
