// Le critère de saccade et la tenue des 120 i/s recopiés dans le driver
// (.claude/skills/run-cartographe/driver.py, resumer) ne doivent pas dériver
// de src/mesure/stats.ts : c'est le driver qui donne le verdict du J0. Ce test
// fabrique de petits JSON de `mesurer` (rapports v6, statsGeste), lance
// `python3 driver.py resumer --sec --json` et confronte chaque ligne aux
// fonctions de stats.ts, aux limites (21 ms, 46 ms, 12,5 ms, 3 à-coups par
// seconde entre 3 et 3,5, en moyenne par type et dans un seul geste, au
// moins 2 à-coups par geste), sur des durées qui ne tombent pas sur une
// seconde ronde et sur des cadences mêlées avec gigue ; et la fréquence de
// l'écran affichée (hz).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACOUPS_MIN_GESTE,
  ACOUPS_PAR_S_MAX,
  acoupsParSeconde,
  estAcoup,
  estGel,
  gesteSaccade,
  sansSaccade,
  SEUIL_120_MS,
  SEUIL_ACOUP_MS,
  SEUIL_GEL_MS,
  statsGeste,
  tenue120,
} from '../src/mesure/stats';

const DRIVER = fileURLToPath(new URL('../.claude/skills/run-cartographe/driver.py', import.meta.url));
const P60 = 16.67;
const P120 = 8.33;
type Type = 'glisser' | 'pincer';
/** Un cas : des rapports, chacun des gestes par type (chaque geste, ses intervalles). */
interface Cas {
  nom: string;
  rapports: Partial<Record<Type, number[][]>>[];
  /** Verdict attendu par type, en dur (ancre le critère des deux côtés). */
  ok?: Partial<Record<Type, boolean>>;
  /** Période de l'écran au repos de chaque rapport (16,67 ms par défaut) et fréquence attendue (hz du driver). */
  periode?: number;
  hz?: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const rep = (n: number, v: number): number[] => Array(n).fill(v);
/** n intervalles dont une part f à 8,33 ms (Bresenham) parmi des 16,67, gigue ± a ms, arrondis au dixième. */
const mele = (n: number, f: number, a: number, graine: number) => {
  let s = graine;
  const alea = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, (_, i) => r1((Math.floor((i + 1) * f) > Math.floor(i * f) ? P120 : P60) + (i % 2 ? a : -a) * alea()));
};
/** k à-coups de 25 ms puis des intervalles entiers sous 21 ms, pour une durée exacte de duree ms (≥ 25 k). */
const parSeconde = (k: number, duree: number) => {
  const iv = rep(k, 25);
  let reste = duree - 25 * k;
  while (reste > 0) {
    const d = Math.min(17, reste);
    iv.push(d);
    reste -= d;
  }
  return iv;
};

const cas: Cas[] = [
  {
    nom: 'seuils : 15 à 27 ms et 10 à 15 ms par pas de 0,1',
    rapports: [
      {
        glisser: [Array.from({ length: 121 }, (_, i) => r1(15 + i / 10))],
        pincer: [Array.from({ length: 51 }, (_, i) => r1(10 + i / 10))],
      },
    ],
  },
  ...[0, 1, 2, 3, 4, 5].map((k) => ({
    nom: `${k} à-coups en 1 s (glisser), ${2 * k + 1} en 2 s (pincer)`,
    rapports: [{ glisser: [parSeconde(k, 1000)], pincer: [parSeconde(2 * k + 1, 2000)] }],
    ok: { glisser: k <= 3, pincer: 2 * k + 1 <= 6 },
  })),
  {
    nom: 'moyenne par type sur toutes les répétitions, chaque geste passant seul : 3 puis 3 à-coups en deux secondes, OK ; 3 en 1 s puis 1 en 0,3 s (3,08/s), NON',
    rapports: [
      { glisser: [parSeconde(3, 1000)], pincer: [parSeconde(3, 1000)] },
      { glisser: [parSeconde(3, 1000)], pincer: [parSeconde(1, 300)] },
    ],
    ok: { glisser: true, pincer: false },
  },
  {
    nom: 'limite entre 3 et 3,5 par seconde : 4 à-coups en 1290 ms (3,10/s) NON, en 1380 ms (2,90/s) OK',
    rapports: [{ glisser: [parSeconde(4, 1290)], pincer: [parSeconde(4, 1380)] }],
    ok: { glisser: false, pincer: true },
  },
  {
    nom: 'moyenne par type sur 8548 ms (gestes d’un seul à-coup, exemptés seuls) : 26 à-coups NON, 25 OK',
    rapports: [
      {
        glisser: Array.from({ length: 26 }, (_, i) => parSeconde(1, i ? 329 : 323)),
        pincer: Array.from({ length: 25 }, (_, i) => parSeconde(1, i ? 342 : 340)),
      },
    ],
    ok: { glisser: false, pincer: true },
  },
  {
    nom: 'un geste entier à 30 i/s parmi 14 gestes propres : NON (2/s en moyenne) ; à 60 i/s, OK',
    rapports: [
      {
        glisser: [rep(17, 33.3), ...Array.from({ length: 14 }, () => rep(34, P60))],
        pincer: [rep(34, P60), ...Array.from({ length: 14 }, () => rep(34, P60))],
      },
    ],
    ok: { glisser: false, pincer: true },
  },
  {
    nom: 'un à-coup isolé dans un geste de 0,3 s parmi 14 propres : OK ; deux : NON',
    rapports: [
      {
        glisser: [parSeconde(1, 300), ...Array.from({ length: 14 }, () => rep(34, P60))],
        pincer: [parSeconde(2, 300), ...Array.from({ length: 14 }, () => rep(34, P60))],
      },
    ],
    ok: { glisser: true, pincer: false },
  },
  {
    nom: 'un seul geste à la limite : 4 à-coups en 1290 ms parmi 14 propres NON, en 1380 ms OK',
    rapports: [
      {
        glisser: [parSeconde(4, 1290), ...Array.from({ length: 14 }, () => rep(34, P60))],
        pincer: [parSeconde(4, 1380), ...Array.from({ length: 14 }, () => rep(34, P60))],
      },
    ],
    ok: { glisser: false, pincer: true },
  },
  {
    nom: 'gel : de 46 à 54 ms par pas de 0,1, un par geste, tous comptés, NON ; 41,7 ± 4 ms (cinq images à 120 Hz) jamais, OK',
    rapports: [
      {
        glisser: Array.from({ length: 81 }, (_, i) => [r1(46 + i / 10), ...rep(60, P60)]),
        pincer: Array.from({ length: 81 }, (_, i) => [r1(37.7 + i / 10), ...rep(60, P60)]),
      },
    ],
    ok: { glisser: false, pincer: true },
  },
  {
    nom: 'gel isolé dans un long geste : 45,9 ms OK, 46 ms NON',
    rapports: [{ glisser: [[45.9, ...rep(60, 17)]], pincer: [[46, ...rep(60, 17)]] }],
    ok: { glisser: true, pincer: false },
  },
  {
    nom: 'même nombre d’à-coups à 60 et à 120 i/s : même verdict',
    rapports: [{ glisser: [[...rep(60, P60), ...rep(4, 33.3)]], pincer: [[...rep(120, P120), ...rep(4, 33.3)]] }],
    ok: { glisser: false, pincer: false },
  },
  ...[0, 0.25, 0.5, 0.75, 1].map((f, j) => ({
    nom: `cadences mêlées, ${f * 100} % à 120 i/s, gigue ± 2 ms, deux répétitions`,
    rapports: [
      { glisser: [mele(60, f, 2, 7 + j), mele(45, f, 2, 8 + j)], pincer: [mele(80, f, 2, 9 + j)] },
      { glisser: [mele(70, f, 2, 10 + j)], pincer: [[...mele(50, f, 2, 11 + j), 25, 33.3]] },
    ],
  })),
  // Fréquence affichée (hz) : calée à 6 % près sur 144, 120, 90, 60 ou 30 Hz,
  // sinon arrondie. La période du repos est la médiane des rapports, au dixième.
  ...(
    [
      [16.67, 60],
      [16.9, 60],
      [8.33, 120],
      [8.5, 120],
      [11.11, 90],
      [13.3, 75],
      [15.58, 64],
    ] as const
  ).map(([periode, hz]) => ({
    nom: `fréquence de l’écran : ${periode} ms → ${hz} Hz`,
    rapports: [{ glisser: [rep(30, P60)] }],
    periode,
    hz,
  })),
];

function fichier(c: Cas) {
  const rapports = c.rapports.map((r) => ({
    v: 6,
    rendu: 'g',
    ecran: { periode_ms: c.periode ?? P60 },
    chargement: null,
    touchers: [],
    gestes: (Object.entries(r) as [Type, number[][]][]).flatMap(([type, gestes]) =>
      gestes.map((iv) => ({
        type,
        rendu: 'g',
        intervalles_ms: iv,
        stats: statsGeste(iv, P60),
        longues_images: { nombre: 0, max_ms: null, blocage_total_ms: 0 },
        dessin_ms: null,
        fin: { event_timing_etat: 'mesure', event_timing_ms: 20, image_ms: 10, close_par_entree_suivante: false },
      })),
    ),
  }));
  return { v: 6, criteres: {}, touchers_vises: [], notes: [], rapports };
}

interface Ligne {
  intervalles: number;
  acoups: number;
  duree_ms: number;
  acoups_par_s: number;
  gels: number;
  gestes_saccades: number;
  geste_max_acoups_par_s: number | null;
  max_ms: number;
  saccade_ok: boolean;
  tenue_120: { part: number | null; cadence_ips: number | null };
}
let sortie: {
  criteres: Record<string, unknown>;
  resumes: { resume: { gestes: Record<string, Ligne>; saccade_ok: boolean; hz: number } }[];
};
let dossier: string;

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), 'cartographe-driver-'));
  const chemins = cas.map((c, i) => {
    const chemin = join(dossier, `cas-${i}.json`);
    writeFileSync(chemin, JSON.stringify(fichier(c)));
    return chemin;
  });
  const r = spawnSync('python3', [DRIVER, 'resumer', '--sec', '--json', ...chemins], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`driver.py resumer : code ${r.status}\n${r.stderr}\n${r.stdout}`);
  sortie = JSON.parse(r.stdout);
});

afterAll(() => rmSync(dossier, { recursive: true, force: true }));

describe('driver.py resumer : critère de saccade et tenue des 120 i/s identiques à stats.ts', () => {
  it('mêmes constantes', () => {
    expect(sortie.criteres).toMatchObject({
      acoup_des_ms: SEUIL_ACOUP_MS,
      acoups_par_s_max: ACOUPS_PAR_S_MAX,
      acoups_min_geste: ACOUPS_MIN_GESTE,
      gel_des_ms: SEUIL_GEL_MS,
      tenue_120_ms: SEUIL_120_MS,
    });
    expect(sortie.criteres).not.toHaveProperty('max_ms');
    expect(sortie.resumes).toHaveLength(cas.length);
  });

  cas.forEach((c, i) => {
    it(c.nom, () => {
      const res = sortie.resumes[i]!.resume;
      const types = Object.keys(c.rapports[0]!) as Type[];
      expect(Object.keys(res.gestes).sort()).toEqual([...types].sort());
      for (const type of types) {
        const gestes = c.rapports.flatMap((r) => r[type] ?? []);
        const stats = gestes.map((iv) => statsGeste(iv, P60));
        const tous = gestes.flat();
        const acoups = tous.filter(estAcoup).length;
        const duree = gestes.reduce((a, iv) => a + iv.reduce((b, d) => b + d, 0), 0);
        const max = Math.max(...stats.map((s) => s.max_ms ?? 0));
        const taux = stats.filter((s) => s.acoups >= ACOUPS_MIN_GESTE).map((s) => acoupsParSeconde(s.acoups, s.duree_ms));
        const ligne = res.gestes[type]!;
        const quoi = `${type} : ${JSON.stringify(ligne)}`;
        expect(ligne.intervalles, quoi).toBe(tous.length);
        expect(ligne.acoups, quoi).toBe(acoups);
        expect(ligne.duree_ms, quoi).toBeCloseTo(duree, 1);
        expect(ligne.acoups_par_s, quoi).toBeCloseTo(acoupsParSeconde(acoups, duree), 2);
        expect(ligne.gels, quoi).toBe(tous.filter(estGel).length);
        expect(ligne.gestes_saccades, quoi).toBe(stats.filter(gesteSaccade).length);
        expect(stats.filter((s) => s.saccade).length, quoi).toBe(ligne.gestes_saccades);
        if (taux.length) expect(ligne.geste_max_acoups_par_s, quoi).toBeCloseTo(Math.max(...taux), 2);
        else expect(ligne.geste_max_acoups_par_s, quoi).toBeNull();
        expect(ligne.max_ms, quoi).toBe(max);
        expect(ligne.saccade_ok, quoi).toBe(sansSaccade(stats));
        if (c.ok?.[type] !== undefined) expect(ligne.saccade_ok, quoi).toBe(c.ok[type]);
        expect(ligne.tenue_120.part, quoi).toBeCloseTo(tenue120(tous), 3);
      }
      expect(res.saccade_ok).toBe(types.every((t) => res.gestes[t]!.saccade_ok));
      if (c.hz !== undefined) expect(res.hz).toBe(c.hz);
    });
  });

  it('les cas aux limites tranchent bien des deux côtés', () => {
    const seuils = sortie.resumes[0]!.resume.gestes;
    expect(seuils.glisser!.acoups).toBe(61); // 21,0 à 27,0
    expect(seuils.pincer!.tenue_120.part).toBeCloseTo(26 / 51, 3); // 10,0 à 12,5
  });
});
