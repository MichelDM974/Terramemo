// Ordres de grandeur, Habitants et Superficies (J4, lot 3 ; étude docs/etudes/2026-11-25-j4-conception.md, § 5 ;
// D613 à D617), la partie pure sur les données réelles de public/geo : l'échelle du curseur (aller-retour, départ au
// milieu, pas à ×1,1), l'arrondi à 2 chiffres, le juste à ×1,5 bords compris (le Nigeria), l'union Wikidata ou tracé
// de fait (Chypre, les 30 pays touchés), le rapport de la rétroaction, les leurres de Reconnaître (aucun QCM douteux
// sur les 195 pays), les nombres en français, la lecture des chiffres et leur chargement.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  arrondi,
  CHIFFRES,
  depart,
  ECART_LEURRES,
  ecart,
  enMots,
  estSujetGrandeur,
  formater,
  juste,
  leurres,
  lireGrandeurs,
  noter,
  pas,
  PAYS_TOUCHES,
  PLAGES,
  position,
  questionQcm,
  rapport,
  rapportBrut,
  SUJETS_GRANDEUR,
  TOLERANCE,
  valeur,
  valeurCurseur,
  valeurEn,
  valeurs,
  type Grandeur,
  type SujetGrandeur,
} from '../src/exercices/grandeurs';
import { chargerGrandeurs, grandeursChargees, oublierGrandeurs } from '../src/fiches/chargeur';
import type { FichierMonde } from '../src/fiches/donnees';
import type { Pays } from '../src/map/types';
import { estimeJournal } from '../src/srs/seance';

const lire = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8')) as T;
const MONDE = lire<FichierMonde>('public/geo/fiches-monde.json');
const PAYS = lire<Pays[]>('public/geo/pays.json');
const MAIN = lire<{ superficie: { touches: { pays: string[] } } }>('geodata/fiches-main.json');
const T = lireGrandeurs(MONDE, PAYS);
const JOUABLES = PAYS.filter((p) => p.statut === 'jouable');
const g = (id: string): Grandeur => T.get(id)!;

function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le nombre de chiffres significatifs d'un nombre écrit en JavaScript (230000000 : 2 ; 0.44 : 2). */
const significatifs = (v: number): number => String(v).replace(/^0\.0*|\.|e.*$/g, '').replace(/0+$/, '').length;

describe('les données (fiches-monde.json, pays.json)', () => {
  it('les 195 pays jouables ont leurs habitants et leur superficie, dans la plage de leur curseur (D614 a)', () => {
    expect(JOUABLES).toHaveLength(195);
    expect(T.size).toBe(195);
    expect([...T.keys()]).toEqual(JOUABLES.map((p) => p.id));
    for (const s of SUJETS_GRANDEUR) {
      for (const x of T.values()) for (const v of valeurs(x, s)) expect(v >= PLAGES[s].min && v <= PLAGES[s].max, `${s} ${x.id} ${v}`).toBe(true);
    }
    // Les bouts de l'étude (§ 5.1) : le Vatican (Wikidata, 2024), l'Inde ; le Vatican, la Russie.
    expect(g('VAT')).toMatchObject({ habitants: 949, annee: 2024, source: 'wd', superficie: 0.44, superficieTrace: null });
    expect(g('NGA')).toMatchObject({ habitants: 237_527_782, annee: 2025, source: 'bm', continent: 'Africa' });
    const max = (s: SujetGrandeur) => [...T.values()].reduce((a, b) => (valeur(b, s) > valeur(a, s) ? b : a)).id;
    expect([max('habitants'), max('superficies')]).toEqual(['IND', 'RUS']);
  });

  it('D616 a : les 30 pays touchés par une zone disputée sont ceux que le build recalcule (geodata/fiches-main.json) ; eux seuls ont le tracé de fait', () => {
    expect([...PAYS_TOUCHES].sort()).toEqual([...MAIN.superficie.touches.pays].sort());
    expect(PAYS_TOUCHES.size).toBe(30);
    const trace = new Map(PAYS.map((p) => [p.id, p.superficie_km2]));
    for (const x of T.values()) expect(x.superficieTrace, x.id).toBe(PAYS_TOUCHES.has(x.id) ? trace.get(x.id) : null);
    // Calculée sur les formes de la carte (geodata/build.mjs, superficie_km2), jamais recopiée à la main.
    expect(g('CYP').superficieTrace).toBe(5395.5);
    expect(valeurs(g('CYP'), 'superficies')).toEqual([9242, 5395.5]);
    expect(valeurs(g('CYP'), 'habitants')).toEqual([1_370_754]);
    expect(valeurs(g('FRA'), 'superficies')).toHaveLength(1);
  });

  it('un pays sans chiffre n’est pas posable ; les entités non jouables non plus', () => {
    const t = lireGrandeurs({ lieux: { AAA: { s: 'pays', h: 5 }, BBB: { s: 'pays', h: 5, sup: 3 }, CCC: { s: 'pays', h: 5, sup: 3 } } }, [
      { id: 'AAA', statut: 'jouable', continent: 'Europe', superficie_km2: 1 },
      { id: 'BBB', statut: 'jouable', continent: 'Europe', superficie_km2: 1 },
      { id: 'CCC', statut: 'territoire', continent: 'Europe', superficie_km2: 1 },
      { id: 'DDD', statut: 'jouable', continent: 'Europe', superficie_km2: 1 },
    ]);
    expect([...t.keys()]).toEqual(['BBB']);
  });
});

describe('le curseur (D614 a)', () => {
  it('position ↔ valeur, aller-retour, bornes comprises ; hors de la plage, bornée', () => {
    for (const s of SUJETS_GRANDEUR) {
      const p = PLAGES[s];
      expect([position(p.min, p), position(p.max, p)]).toEqual([0, 1]);
      expect([valeurEn(0, p), valeurEn(1, p)]).toEqual([p.min, p.max]);
      for (let i = 0; i <= 1000; i++) expect(position(valeurEn(i / 1000, p), p)).toBeCloseTo(i / 1000, 12);
      for (const x of T.values()) expect(valeurEn(position(valeur(x, s), p), p) / valeur(x, s)).toBeCloseTo(1, 9);
      expect([position(p.min / 10, p), position(p.max * 10, p), position(0, p), position(-5, p)]).toEqual([0, 1, 0, 0]);
      expect([valeurEn(-1, p), valeurEn(2, p), valeurEn(Number.NaN, p)]).toEqual([p.min, p.max, p.min]);
    }
  });

  it('départ au milieu de la plage, sur l’échelle logarithmique, le même pour tous : 450 000 habitants, 1 400 km²', () => {
    expect(depart(PLAGES.habitants)).toBe(450_000);
    expect(depart(PLAGES.superficies)).toBe(1400);
    expect(position(Math.sqrt(PLAGES.habitants.min * PLAGES.habitants.max), PLAGES.habitants)).toBeCloseTo(0.5, 12);
  });

  it('la valeur affichée a 2 chiffres significatifs, reste dans la plage, et s’arrondit en elle-même', () => {
    expect(CHIFFRES).toBe(2);
    expect([arrondi(237_527_782), arrondi(0.437), arrondi(1_463_865_525), arrondi(9242), arrondi(5395.5)]).toEqual([240_000_000, 0.44, 1_500_000_000, 9200, 5400]);
    for (const s of SUJETS_GRANDEUR) {
      const p = PLAGES[s];
      for (let i = 0; i <= 2000; i++) {
        const v = valeurCurseur(i / 2000, p);
        expect(v >= p.min && v <= p.max).toBe(true);
        expect(significatifs(v), String(v)).toBeLessThanOrEqual(2);
        expect(arrondi(v)).toBe(v);
      }
    }
  });

  it('± : ×1,1 ou ÷1,1, arrondi à 2 chiffres ; jamais sur place sauf à un bord ; de bout en bout en ≈ 180 pas', () => {
    expect(pas(230_000_000, 1, PLAGES.habitants)).toBe(250_000_000);
    expect(pas(230_000_000, -1, PLAGES.habitants)).toBe(210_000_000);
    expect(pas(10, 1, PLAGES.superficies)).toBe(11);
    expect(pas(10, -1, PLAGES.superficies)).toBe(9.1);
    for (const s of SUJETS_GRANDEUR) {
      const p = PLAGES[s];
      expect([pas(p.max, 1, p), pas(p.min, -1, p)]).toEqual([p.max, p.min]);
      let v = p.min;
      let n = 0;
      for (; v < p.max; n++) {
        const w = pas(v, 1, p);
        expect(w).toBeGreaterThan(v);
        expect(w / v).toBeLessThanOrEqual(1.2);
        expect(pas(w, -1, p)).toBeLessThan(w);
        v = w;
      }
      // Monter de 7,3 ou 8,3 décades par ×1,1 : ln(max / min) / ln 1,1, l'arrondi faisant parfois un cran de plus.
      expect(n).toBeGreaterThanOrEqual(Math.floor(Math.log(p.max / p.min) / Math.log(1.1)) - 5);
      expect(n).toBeLessThanOrEqual(Math.ceil(Math.log(p.max / p.min) / Math.log(1.05)));
    }
  });

  it('`estime` au journal est la valeur affichée (estimeJournal de srs/seance.ts, au morceau principal, la même que arrondi)', () => {
    for (const s of SUJETS_GRANDEUR) {
      const p = PLAGES[s];
      for (let i = 0; i <= 2000; i++) {
        const brut = valeurEn(i / 2000, p);
        const v = valeurCurseur(i / 2000, p);
        expect(estimeJournal(v)).toBe(v);
        expect(estimeJournal(brut)).toBe(v);
        expect(formater(estimeJournal(brut)!)).toBe(formater(v));
      }
    }
    for (const x of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) expect(estimeJournal(x), String(x)).toBeNull();
  });
});

describe('le juste (D613 b, D616 a)', () => {
  it('Nigeria : juste de 237 527 782 / 1,5 à × 1,5, bords compris ; faux au-delà ; au curseur, 160 et 350 millions justes, 150 et 360 faux', () => {
    const v = g('NGA').habitants;
    expect(TOLERANCE).toBe(1.5);
    expect(juste(v / 1.5, [v])).toBe(true);
    expect(juste(v * 1.5, [v])).toBe(true);
    expect(juste((v / 1.5) * 0.999, [v])).toBe(false);
    expect(juste(v * 1.5 * 1.001, [v])).toBe(false);
    const n = (x: number) => noter(g('NGA'), 'habitants', x).juste;
    expect([n(150e6), n(160e6), n(240e6), n(350e6), n(360e6)]).toEqual([false, true, true, true, false]);
    expect([juste(0, [v]), juste(-v, [v]), juste(Number.NaN, [v]), juste(Number.POSITIVE_INFINITY, [v])]).toEqual([false, false, false, false]);
  });

  it('Chypre : juste à 6 000 km² (le tracé de fait, 5 396) comme à 10 000 (Wikidata, 9 242) ; faux à 3 500 et à 14 000 ; la France, Wikidata seul', () => {
    const c = (x: number) => noter(g('CYP'), 'superficies', x);
    expect([c(3500).juste, c(4000).juste, c(6000).juste, c(10_000).juste, c(13_000).juste, c(14_000).juste]).toEqual([false, true, true, true, true, false]);
    // La rétroaction cite les deux, Wikidata d'abord.
    expect(c(6000).rapports).toEqual([
      // 9 242 / 6 000 = 1,54 : faux contre Wikidata seul, donc « 1,55 fois », pas « 1,5 ».
      { valeur: 9242, trace: false, rapport: { fois: 1.55, sens: 'peu' } },
      { valeur: 5395.5, trace: true, rapport: { fois: 1.1, sens: 'trop' } },
    ]);
    // La France : son tracé de fait (543 000 km²) ne compte pas, elle n'est pas touchée.
    const fra = g('FRA').superficie;
    expect(noter(g('FRA'), 'superficies', fra * 1.6).juste).toBe(false);
    expect(noter(g('FRA'), 'superficies', fra * 1.6).rapports).toHaveLength(1);
  });

  it('l’estimation notée est arrondie comme affichée (2 chiffres)', () => {
    expect(noter(g('NGA'), 'habitants', 237_000_001.7).estime).toBe(240_000_000);
  });

  it('le hasard (un curseur tiré uniformément sur l’échelle logarithmique de la plage) : ≈ 4,8 % de justes aux habitants, ≈ 4,2 % aux superficies (§ 5.2)', () => {
    // Calcul exact : la part de la plage, en logarithme, qui tombe à ×1,5 d'une valeur admise (union des intervalles).
    const part = (s: SujetGrandeur, x: Grandeur) => {
      const p = PLAGES[s];
      const iv = valeurs(x, s)
        .map((v) => [Math.max(p.min, v / TOLERANCE), Math.min(p.max, v * TOLERANCE)] as const)
        .sort((a, b) => a[0] - b[0]);
      let l = 0;
      let fin = 0;
      for (const [a, b] of iv) {
        const debut = Math.max(a, fin);
        if (b > debut) l += Math.log(b / debut);
        fin = Math.max(fin, b);
      }
      return l / Math.log(p.max / p.min);
    };
    const moyenne = (s: SujetGrandeur) => [...T.values()].reduce((a, x) => a + part(s, x), 0) / T.size;
    expect(moyenne('habitants')).toBeCloseTo(0.048, 3);
    expect(moyenne('superficies')).toBeGreaterThan(0.042);
    expect(moyenne('superficies')).toBeLessThan(0.044);
    // Toujours la médiane (9,1 millions d'habitants) : ≈ 18 % (§ 5.2).
    const h = [...T.values()].map((x) => x.habitants).sort((a, b) => a - b);
    const med = arrondi(h[(h.length - 1) / 2]!);
    expect(med).toBe(9_100_000);
    const parMed = [...T.values()].filter((x) => noter(x, 'habitants', med).juste).length / T.size;
    expect(parMed).toBeGreaterThan(0.16);
    expect(parMed).toBeLessThan(0.2);
  });
});

describe('le rapport de la rétroaction', () => {
  it('toujours dans le sens qui dépasse 1 : « 1,6 fois trop peu », « 2 fois trop » ; la même valeur, égal', () => {
    expect(rapport(150e6, 237_527_782)).toEqual({ fois: 1.6, sens: 'peu' });
    expect(rapport(2000, 1000)).toEqual({ fois: 2, sens: 'trop' });
    expect(rapport(5, 5)).toEqual({ fois: 1, sens: 'egal' });
    expect(rapport(10_000, 1)).toEqual({ fois: 10_000, sens: 'trop' });
    expect(rapportBrut(2, 8)).toBe(4);
    expect(rapportBrut(8, 2)).toBe(4);
  });

  it('une réponse fausse ne s’affiche jamais à « 1,5 fois » (1,503 : « 1,51 fois ») ; une juste, jamais au-delà', () => {
    expect(rapport(1503, 1000)).toEqual({ fois: 1.51, sens: 'trop' });
    expect(rapport(1000, 1503)).toEqual({ fois: 1.51, sens: 'peu' });
    expect(rapport(1500, 1000).fois).toBe(1.5);
    for (let i = 0; i < 5000; i++) {
      const r = 1 + i / 1000;
      const f = rapport(1000 * r, 1000);
      expect(f.fois <= TOLERANCE, String(r)).toBe(juste(1000 * r, [1000]));
      expect(f.fois).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Reconnaître : les leurres (D615 a)', () => {
  it('aucun QCM douteux sur les 195 pays : trois leurres à ×3 au moins de la cible et entre eux, aucun à ×1,5 de l’énoncé ; du même continent, sauf quatre superficies d’Amérique du Sud prises aux Amériques', () => {
    expect(ECART_LEURRES).toBe(3);
    for (const s of SUJETS_GRANDEUR) {
      const horsContinent = new Set<string>();
      for (const graineN of [1, 2, 3]) {
        const h = graine(graineN);
        for (const c of T.values()) {
          const q = questionQcm(c.id, s, T, h)!;
          expect(q, `${s} ${c.id}`).not.toBeNull();
          expect(q.choix).toHaveLength(4);
          expect(new Set(q.choix).size).toBe(4);
          expect(q.choix.filter((x) => x === c.id)).toHaveLength(1);
          expect(q.enonce).toBe(arrondi(valeur(c, s)));
          const autres = q.choix.filter((x) => x !== c.id).map(g);
          for (const [i, a] of [c, ...autres].entries()) for (const b of [c, ...autres].slice(i + 1)) expect(ecart(a, b, s), `${s} ${c.id} : ${a.id} ${b.id}`).toBeGreaterThanOrEqual(3);
          // Le seul choix juste à ×1,5 de l'énoncé est la cible.
          expect(q.choix.filter((x) => juste(q.enonce, valeurs(g(x), s)))).toEqual([c.id]);
          for (const a of autres) {
            if (a.continent === c.continent) continue;
            horsContinent.add(c.id);
            expect(['North America', 'South America']).toContain(a.continent);
            expect(['North America', 'South America']).toContain(c.continent);
          }
        }
      }
      expect([...horsContinent].sort(), s).toEqual(s === 'habitants' ? [] : ['BOL', 'COL', 'PER', 'PRY']);
    }
  });

  it('les paires trop proches ne sont jamais ensemble (12 paires de voisins à moins de 10 % d’habitants, § 5.3) ; tirage reproductible à graine fixe', () => {
    const a = leurres('NGA', 'habitants', T, graine(7));
    expect(leurres('NGA', 'habitants', T, graine(7))).toEqual(a);
    expect(a).toHaveLength(3);
    for (const id of a!) expect(g(id).continent).toBe('Africa');
    // D'une graine à l'autre, les leurres changent.
    const vus = new Set(Array.from({ length: 20 }, (_, i) => leurres('NGA', 'habitants', T, graine(i + 1))!.join()));
    expect(vus.size).toBeGreaterThan(5);
    expect(leurres('XXX', 'habitants', T, graine(1))).toBeNull();
    expect(questionQcm('XXX', 'habitants', T, graine(1))).toBeNull();
  });

  it('la cible à toutes les places', () => {
    const places = new Set(Array.from({ length: 40 }, (_, i) => questionQcm('FRA', 'superficies', T, graine(i + 1))!.choix.indexOf('FRA')));
    expect([...places].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('les nombres en français (Intl.NumberFormat)', () => {
  it('« 230 millions », « 1,4 milliard », « 2 milliards », « 450 000 », « 0,44 » ; en mots dès un million', () => {
    const espace = (x: string) => x.replace(/[  ]/g, ' ');
    expect(formater(237_527_782)).toBe('240 millions');
    expect(formater(230e6)).toBe('230 millions');
    expect(formater(1.4e9)).toBe('1,4 milliard');
    expect(formater(1_463_865_525)).toBe('1,5 milliard');
    expect(formater(2e9)).toBe('2 milliards');
    expect(formater(1e6)).toBe('1 million');
    expect(espace(formater(450_000))).toBe('450 000');
    expect(espace(formater(9242))).toBe('9 200');
    expect(formater(0.44)).toBe('0,44');
    expect(formater(0.1)).toBe('0,1');
    expect(formater(949)).toBe('950');
    // La valeur vraie de la rétroaction, à 3 chiffres.
    expect(formater(237_527_782, 3)).toBe('238 millions');
    expect(espace(formater(5395.5, 3))).toBe('5 400');
    expect([enMots(990_000), enMots(995_000), enMots(1e6), enMots(17_098_246)]).toEqual([false, true, true, true]);
  });

  it('chaque position du curseur s’écrit sans « e » ni plus de 2 chiffres', () => {
    for (const s of SUJETS_GRANDEUR) {
      for (let i = 0; i <= 500; i++) {
        const t = formater(valeurCurseur(i / 500, PLAGES[s]));
        expect(t).not.toMatch(/e|E|\./);
        expect(t.replace(/\D/g, '').replace(/^0+/, '').replace(/0+$/, '').length, t).toBeLessThanOrEqual(2);
      }
    }
  });

  it('estSujetGrandeur', () => {
    expect(SUJETS_GRANDEUR.every(estSujetGrandeur)).toBe(true);
    expect(['pays', 'voisins', 'villes'].some(estSujetGrandeur)).toBe(false);
  });
});

describe('le chargement (fiches/chargeur.ts, à la demande)', () => {
  afterEach(() => oublierGrandeurs());

  it('fiches-monde.json et le morceau des grandeurs demandés ensemble, lus une fois ; un échec n’est pas gardé', async () => {
    const demandes: string[] = [];
    let echoue = true;
    const lireF = (chemin: string) => (demandes.push(chemin), echoue ? Promise.reject(new TypeError('hors ligne')) : Promise.resolve(MONDE));
    const morceau = () => (demandes.push('morceau'), import('../src/exercices/grandeurs'));
    await expect(chargerGrandeurs(PAYS, lireF, '/geo/', morceau)).rejects.toThrow('hors ligne');
    expect(grandeursChargees()).toBeNull();
    expect(demandes).toEqual(['morceau', '/geo/fiches-monde.json']);
    echoue = false;
    demandes.length = 0;
    const [a, b] = await Promise.all([chargerGrandeurs(PAYS, lireF, '/geo/', morceau), chargerGrandeurs(PAYS, lireF, '/geo/', morceau)]);
    expect(a).toBe(b);
    expect(grandeursChargees()).toBe(a);
    expect(a.size).toBe(195);
    expect(a.get('CYP')?.superficieTrace).toBe(5395.5);
    await chargerGrandeurs(PAYS, lireF, '/geo/', morceau);
    expect(demandes).toEqual(['morceau', '/geo/fiches-monde.json']);
  });
});
