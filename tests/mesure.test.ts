import { describe, expect, it } from 'vitest';
import {
  ACOUPS_PAR_S_MAX,
  acoupsParSeconde,
  estAcoup,
  intervalles,
  mediane,
  periodeGeste,
  quantile,
  sansSaccade,
  SEUIL_120_MS,
  SEUIL_ACOUP_MS,
  statsGeste,
  statsImages,
  tenue120,
  type StatsGeste,
} from '../src/mesure/stats';

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

  it('période d’un geste : la grappe basse, qui tient même si plus de la moitié des images est perdue', () => {
    const pire = [...Array(10).fill(16.7), ...Array(12).fill(33.4)];
    expect(mediane(pire)).toBe(33.4); // la médiane prendrait deux périodes
    expect(periodeGeste(pire)).toBe(16.67); // calée sur 60 Hz
    expect(statsGeste(pire, 16.67).perdues).toBe(12);
    expect(periodeGeste([])).toBeNull();
  });

  it('période d’un geste : calée sur la période connue la plus proche, ou celle du repos', () => {
    expect(periodeGeste(Array.from({ length: 58 }, (_, i) => (i % 3 ? 8.3 : 8.4)))).toBe(8.33);
    expect(periodeGeste(Array(43).fill(11.1))).toBe(11.11); // 90 Hz
    expect(periodeGeste(Array(30).fill(13.3), 13.33)).toBe(13.33); // 75 Hz : celle du repos
    expect(periodeGeste(Array(30).fill(13.3))).toBe(13.3); // inconnue : pas de calage
  });

  it('repos à 60 Hz, geste à 120 Hz : les images sautées à 120 Hz sont comptées, l’écart signalé', () => {
    const iv = [8.3, 8.4, 8.3, 16.7, 8.3, 8.4, 8.3, 8.3, 25, 8.3, 8.4, 8.3];
    expect(statsImages(iv, 16.7).perdues).toBe(0); // avec la seule période du repos : rien
    const s = statsGeste(iv, 16.7);
    expect(s.periode_geste_ms).toBe(8.33);
    expect(s.perdues).toBe(2);
    expect(s.perdues_repos).toBe(0);
    expect(s).toMatchObject({ ecart_periode: true, ecart_sens: 'plus_rapide', bascule_images: 0 });
  });

  it('repos à 120 Hz, appli tenue à 60 images par seconde : une cadence, chiffrée sur le repos', () => {
    const s = statsGeste(Array(30).fill(16.7), 8.33);
    expect(s.periode_geste_ms).toBe(16.67);
    expect(s.periode_repos_ms).toBe(8.33);
    expect(s.perdues).toBe(0);
    expect(s.perdues_repos).toBe(30);
    expect(s.part_perdues_repos).toBe(1);
    expect(s).toMatchObject({ ecart_periode: true, ecart_sens: 'plus_lent' });
  });

  it('repos à 60 Hz, appli tenue à 30 images par seconde : cadence plus lente, toutes perdues sur le repos', () => {
    expect(statsGeste(Array(30).fill(33.3), 16.7)).toMatchObject({ periode_geste_ms: 33.33, perdues: 0, perdues_repos: 30, ecart_sens: 'plus_lent' });
  });

  it('même période au repos et pendant le geste : pas d’écart ; sans intervalle, la période du repos', () => {
    const s = statsGeste([16.6, 16.7, 16.8, 33.4, 16.7, 16.6], 16.7);
    expect(s).toMatchObject({ ecart_periode: false, ecart_sens: null, perdues: 1, perdues_repos: 1 });
    expect(statsGeste([], 16.7)).toMatchObject({ periode_geste_ms: null, periode_repos_ms: 16.7, ecart_periode: false, perdues: 0, bascule_images: 0 });
  });
});

// Cas de la relecture V2 du J0 (scratchpad relecture-3b/periode3.verif.ts et
// verdict.py) : téléphone à fréquence adaptative, gigue, cadence moitié.
describe('statsGeste, cas du téléphone (relecture V2)', () => {
  const rep = (n: number, v: number): number[] => Array(n).fill(v);
  // Pseudo-aléa reproductible et gigue alternée, comme la relecture.
  const gigue = (iv: number[], a: number) => {
    let s = 7;
    const alea = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return iv.map((v, i) => Math.round((v + (i % 2 ? a : -a) * alea()) * 10) / 10);
  };
  const P120 = 8.33;
  const P60 = 16.67;
  const cas: [string, number[], number, Partial<StatsGeste>][] = [
    ['1 repos 60, geste 120 parfait', rep(58, P120), P60, { periode_geste_ms: 8.33, perdues: 0, ecart_sens: 'plus_rapide' }],
    ['2 repos 60, geste 120, 20 % sautées', [...rep(46, P120), ...rep(12, P60)], P60, { perdues: 12, perdues_repos: 0, ecart_sens: 'plus_rapide' }],
    ['3 montée de 60 à 120 après 6 images (bascule), 0 sautée', [...rep(6, P60), ...rep(52, P120)], P60, { periode_geste_ms: 8.33, bascule_images: 6, perdues: 0 }],
    ['4 bascule lente (15 images à 60)', [...rep(15, P60), ...rep(36, P120)], P60, { bascule_images: 15, perdues: 0 }],
    ['5 120 Hz sur 8 % du geste, à la fin', [...rep(50, P60), ...rep(4, P120)], P60, { periode_geste_ms: 16.67, perdues: 0 }],
    ['6 120 Hz sur 12 % (la falaise du 10e centile)', [...rep(46, P60), ...rep(6, P120)], P60, { periode_geste_ms: 16.67, perdues: 0 }],
    ['7 repos 120, geste stable à 60', rep(29, P60), P120, { periode_geste_ms: 16.67, perdues: 0, perdues_repos: 29, ecart_sens: 'plus_lent' }],
    ['8 repos 120, geste à 60 avec 10 % de vraies pertes', [...rep(26, P60), ...rep(3, 33.3)], P120, { perdues: 3, perdues_repos: 29, ecart_sens: 'plus_lent' }],
    ['9 repos 60, geste à 60', rep(29, P60), P60, { perdues: 0, ecart_periode: false }],
    ['10 120 Hz, gigue ± 1 ms', gigue(rep(58, P120), 1), P120, { periode_geste_ms: 8.33, perdues: 0 }],
    ['11 120 Hz, gigue ± 2 ms', gigue(rep(58, P120), 2), P120, { periode_geste_ms: 8.33, perdues: 0, ecart_periode: false }],
    ['12 60 Hz, gigue ± 3 ms', gigue(rep(29, P60), 3), P60, { periode_geste_ms: 16.67, perdues: 0 }],
    ['13 repos 120, 8,3 et 16,7 en alternance', Array.from({ length: 40 }, (_, i) => (i % 2 ? P60 : P120)), P120, { periode_geste_ms: 8.33, perdues: 20 }],
    ['14 repos 60, geste 120, 1 image sur 3 sautée', Array.from({ length: 45 }, (_, i) => (i % 3 === 2 ? P60 : P120)), P60, { bascule_images: 0, perdues: 15 }],
    ['15 repos 120, geste à 90 Hz', rep(43, 11.1), P120, { periode_geste_ms: 11.11, perdues: 0, perdues_repos: 0, ecart_sens: 'plus_lent' }],
    ['16 geste à 60 avec un rattrapage de 8,3 ms', [...rep(7, P60), 8.3, ...rep(21, P60)], P60, { periode_geste_ms: 16.67, perdues: 0, bascule_images: 0 }],
    ['17 intervalles arrondis 8,3 / 8,4', Array.from({ length: 58 }, (_, i) => (i % 3 ? 8.3 : 8.4)), 8.33, { periode_geste_ms: 8.33, perdues: 0 }],
    ['18 12,6 ms à 120 Hz : juste au-delà de 1,5 période', [...rep(50, P120), ...rep(5, 12.6)], P120, { perdues: 5 }],
    ['19 bascule puis 20 % sautées à 120', [...rep(25, P60), ...Array.from({ length: 25 }, (_, i) => (i % 5 === 4 ? P60 : P120))], P60, { bascule_images: 25, perdues: 5 }],
    ['20 bascule en tête après une longue image : perdue sur le repos', [40, ...rep(5, P60), ...rep(40, P120)], P60, { bascule_images: 6, perdues: 1, perdues_repos: 1 }],
  ];
  for (const [nom, iv, repos, attendu] of cas) it(nom, () => expect(statsGeste(iv, repos)).toMatchObject(attendu));

  it('pas de falaise : la part d’images à 120 Hz en fin de geste ne fait jamais compter de perte', () => {
    for (let courts = 1; courts < 52; courts++) expect(statsGeste([...rep(52 - courts, P60), ...rep(courts, P120)], P60).perdues).toBe(0);
  });

  it('pas de falaise : bascule en tête de toute longueur, jamais de perte', () => {
    for (let tete = 0; tete < 52; tete++) expect(statsGeste([...rep(tete, P60), ...rep(52 - tete, P120)], P60).perdues).toBe(0);
  });
});

// Critère de saccade de l'utilisateur (04/11/2026, registre) : à-coup dès
// 21 ms, NON au-delà de 3 à-coups par seconde de geste ou d'un intervalle
// > 50 ms ; tenue des 120 i/s sur un seuil fixe de 12,5 ms. Cas de la
// relecture VM du J0 (cadences mêlées) et de la relecture du critère v4
// (tolérance par intervalle, seuil sur la grille, tenue non monotone,
// mutants survivants).
describe('à-coups (≥ 21 ms, par seconde de geste) et tenue des 120 i/s', () => {
  const rep = (n: number, v: number): number[] => Array(n).fill(v);
  const P120 = 8.33;
  const P60 = 16.67;
  /** n intervalles, une part f à 8,33 ms entrelacée régulièrement (Bresenham) dans des 16,67 ms. */
  const mele = (n: number, f: number) => Array.from({ length: n }, (_, i) => (Math.floor((i + 1) * f) > Math.floor(i * f) ? P120 : P60));
  /** Le même à durée fixe (~ 866,8 ms) : plus la part f est grande, plus il y a d'intervalles. */
  const meleDuree = (f: number, duree = 866.8) => {
    const iv: number[] = [];
    for (let i = 0, somme = 0; somme < duree; i++) {
      const d = Math.floor((i + 1) * f) > Math.floor(i * f) ? P120 : P60;
      iv.push(d);
      somme += d;
    }
    return iv;
  };
  /** Gigue alternée de ± a ms au plus, reproductible, arrondie au dixième comme les mesures. */
  const gigue = (iv: number[], a: number) => {
    let s = 11;
    const alea = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return iv.map((v, i) => Math.round((v + (i % 2 ? a : -a) * alea()) * 10) / 10);
  };
  const verdict = (s: StatsGeste) => sansSaccade(s.acoups, s.duree_ms, s.max_ms);
  const parts = Array.from({ length: 101 }, (_, i) => i / 100);

  it('seuil à 21 ms, loin de 16,67 et 25 ms : 25 ms et ses arrondis comptent, 16,7 et sa gigue non', () => {
    expect(SEUIL_ACOUP_MS).toBe(21);
    for (const d of [21, 21.1, 22.2, 24.9, 25, 25.1, 33.3, 50]) expect(estAcoup(d), `${d}`).toBe(true);
    for (const d of [8.3, 12.5, 16.7, 20.8, 20.9]) expect(estAcoup(d), `${d}`).toBe(false);
    // ± 4 ms de gigue autour des deux valeurs de la grille : jamais au hasard.
    for (let e = -4; e <= 4; e += 0.1) {
      expect(estAcoup(P60 + e), `16,67 ${e}`).toBe(false);
      expect(estAcoup(25 + e), `25 ${e}`).toBe(true);
    }
  });

  it('verdict : NON au-delà de 3 à-coups par seconde de geste, ou dès un intervalle de plus de 50 ms', () => {
    expect(ACOUPS_PAR_S_MAX).toBe(3);
    expect(sansSaccade(3, 1000, 33.3)).toBe(true);
    expect(sansSaccade(4, 1000, 33.3)).toBe(false);
    expect(sansSaccade(6, 2000, 33.3)).toBe(true);
    expect(sansSaccade(7, 2000, 33.3)).toBe(false);
    expect(sansSaccade(3, 999, 33.3)).toBe(false); // 3,003 par seconde
    expect(sansSaccade(1, 1000, 50)).toBe(true);
    expect(sansSaccade(1, 1000, 50.1)).toBe(false);
    expect(sansSaccade(0, 1000, 50.1)).toBe(false);
    expect(sansSaccade(0, 0, null)).toBe(true);
    expect(acoupsParSeconde(2, 0)).toBe(0);
  });

  it('même nombre d’à-coups sur une base à 60 et à 120 i/s, même durée : même verdict (v4 : 120 i/s en tolérait deux fois plus)', () => {
    for (let k = 0; k <= 8; k++) {
      const a60 = statsGeste([...rep(60, P60), ...rep(k, 33.3)], P60);
      const a120 = statsGeste([...rep(120, P120), ...rep(k, 33.3)], P60);
      expect(a60.acoups, `k = ${k}`).toBe(k);
      expect(a120.acoups, `k = ${k}`).toBe(k);
      expect(verdict(a120), `k = ${k}`).toBe(verdict(a60));
      expect(verdict(a60), `k = ${k}`).toBe(k <= 3); // 3 en 1,1 s : 2,7/s ; 4 en 1,13 s : 3,5/s
    }
  });

  for (const [repos, nom] of [[P60, '60'], [P120, '120']] as const) {
    for (const a of [0, 2]) {
      it(`cadences mêlées 8,33 / 16,67 ms de 0 à 100 %, gigue ± ${a} ms, repos à ${nom} Hz : aucun à-coup, OK, tenue = part d’images à 120 i/s`, () => {
        let avant = -1;
        for (const f of parts) {
          const iv = gigue(mele(60, f), a);
          const s = statsGeste(iv, repos);
          expect(s.acoups, `f = ${f}`).toBe(0);
          expect(verdict(s), `f = ${f}`).toBe(true);
          const courts = mele(60, f).filter((d) => d === P120).length;
          expect(s.tenue_120, `f = ${f}`).toBeCloseTo(courts / 60, 3);
          expect(s.tenue_120, `f = ${f}`).toBeGreaterThanOrEqual(avant);
          avant = s.tenue_120;
        }
      });
    }
  }

  it('tenue monotone à durée de geste fixe, gigue ± 2 ms : plus d’images à 120 i/s, jamais moins de tenue', () => {
    let avant = -1;
    for (const f of parts) {
      const t = statsGeste(gigue(meleDuree(f), 2), P60).tenue_120;
      expect(t, `f = ${f}`).toBeGreaterThanOrEqual(avant);
      avant = t;
    }
    expect(avant).toBe(1);
  });

  it('verdict constant à durée fixe, quelle que soit la part d’images à 120 i/s : 4 à-coups de 33 ms NON partout, 2 OK partout', () => {
    for (const [k, attendu] of [[4, false], [2, true]] as const) {
      for (const f of parts) {
        const iv = meleDuree(f);
        for (let j = 1; j <= k; j++) iv.splice(Math.floor((j * iv.length) / (k + 1)), 0, 33.3);
        expect(verdict(statsGeste(iv, P60)), `k = ${k}, f = ${f}`).toBe(attendu);
      }
    }
  });

  it('tenue aux limites : 12,5 ms compte (≤), 12,6 non ; sur les intervalles, pas sur les images', () => {
    expect(SEUIL_120_MS).toBe(12.5);
    expect(tenue120([12.5])).toBe(1);
    expect(tenue120([12.6])).toBe(0);
    expect(tenue120([])).toBe(0);
    // 3 intervalles, 4 images : 2/3 (et non 2/4).
    expect(statsGeste([8.3, 12.5, 12.6], P60)).toMatchObject({ images: 4, tenue_120: 0.667 });
    expect(statsGeste([8.3, 8.4, 16.7], P120).tenue_120).toBe(0.667);
  });

  it('à-coups par seconde sur la durée du geste (somme des intervalles), pas sur le nombre d’intervalles ni d’images', () => {
    const s = statsGeste([16.7, 33.3, 25, 8.3, 16.7], P60); // 2 à-coups en 100 ms
    expect(s).toMatchObject({ images: 6, duree_ms: 100, acoups: 2, acoups_par_s: 20, cadence_ips: 50 });
    expect(statsGeste([], P60)).toMatchObject({ duree_ms: 0, acoups: 0, acoups_par_s: 0, tenue_120: 0, cadence_ips: null });
  });

  it('repos à 60 Hz, geste à 120 : tenue entière ; repos à 120, appli à 60 i/s : tenue nulle, pas une saccade', () => {
    expect(statsGeste(rep(58, P120), P60)).toMatchObject({ acoups: 0, tenue_120: 1, cadence_ips: 120 });
    const lent = statsGeste(rep(29, P60), P120);
    expect(lent).toMatchObject({ acoups: 0, tenue_120: 0, cadence_ips: 60, ecart_sens: 'plus_lent' });
    expect(verdict(lent)).toBe(true); // v3 : « ? », une cadence à juger
    expect(statsGeste(rep(29, P60), P60)).toMatchObject({ acoups: 0, tenue_120: 0 }); // 60 Hz : 120 i/s hors d'atteinte
  });

  it('bascule de tête (6 ou 25 images à 60 avant 120) : aucun à-coup, tenue sans la bascule', () => {
    for (const tete of [6, 25]) {
      const s = statsGeste([...rep(tete, P60), ...rep(52, P120)], P60);
      expect(s).toMatchObject({ acoups: 0, bascule_images: tete });
      expect(s.tenue_120).toBeCloseTo(52 / (52 + tete), 3);
      expect(verdict(s)).toBe(true);
    }
  });

  it('fin de geste au doigt, l’écran redescend à 60 Hz : des « perdues » sur la période du geste, aucun à-coup', () => {
    const s = statsGeste([...rep(40, P120), ...rep(10, P60)], P60);
    expect(s.perdues).toBe(10);
    expect(s.acoups).toBe(0);
    expect(s.tenue_120).toBe(0.8);
    expect(verdict(s)).toBe(true);
    expect(statsGeste([...rep(40, P120), ...rep(10, P60)], P120).acoups).toBe(0);
  });

  it('intervalles de 25 ms à la cadence de 60 (trois périodes à 120 Hz) : des à-coups, que la période du geste ne voyait pas', () => {
    const iv = mele(60, 0.2).map((d, i) => (d === P60 && i % 8 < 3 ? 25 : d)); // 20 % à 8, ~30 % à 25, le reste à 16,7
    const s = statsGeste(iv, P120);
    expect(s.acoups).toBe(iv.filter((d) => d === 25).length);
    expect(s.acoups_par_s).toBeGreaterThan(3);
    expect(verdict(s)).toBe(false);
    // Arrondis au dixième et gigue : 24,9, 25,1, 23,5 et 26 comptent comme 25.
    expect(statsGeste([...rep(20, P60), 24.9, 25.1, 25, 23.5, 26], P120).acoups).toBe(5);
  });

  it('bascule_images seulement quand l’écran accélère vraiment : 16,67 contre 16,7 ms au repos, une perte en tête n’est pas une bascule', () => {
    const s = statsGeste([33.4, ...rep(29, P60)], 16.7);
    expect(s).toMatchObject({ periode_geste_ms: 16.67, ecart_sens: null, bascule_images: 0, perdues: 1, acoups: 1 });
  });
});
