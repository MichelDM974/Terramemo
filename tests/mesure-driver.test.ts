// Le critère de saccade et la tenue des 120 i/s recopiés dans le driver
// (.claude/skills/run-terramemo/driver.py, resumer) ne doivent pas dériver
// de src/mesure/stats.ts : c'est le driver qui donne le verdict du J0. Ce test
// fabrique de petits JSON de `mesurer` (rapports v6, statsGeste), lance
// `python3 driver.py resumer --sec --json` et confronte chaque ligne aux
// fonctions de stats.ts, aux limites (21 ms, 46 ms, 12,5 ms, 3 à-coups par
// seconde entre 3 et 3,5, en moyenne par type et dans un seul geste, au
// moins 2 à-coups par geste), sur des durées qui ne tombent pas sur une
// seconde ronde et sur des cadences mêlées avec gigue ; et la fréquence de
// l'écran affichée (hz). Les rapports v3 à v5 (stats sans gels ni saccade,
// sans acoups avant la v5) doivent être relus et jugés comme un v6 : le
// driver recalcule tout depuis les intervalles. Enfin, sur le scénario du
// driver, le tour du monde a sa ligne (tourner), que la page fond dans
// glisser ; et le chargement et le relais du webgl, première visite à part.
// Enfin, la première visite de `mesurer` vide les caches du chargement sans
// jamais toucher aux données de l'utilisateur (journal, compte anonyme,
// localStorage) : vider_premiere_visite contre une fausse page CDP.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { CLE_APPAREIL } from '../src/journal/appareil';
import { BASE_JOURNAL, BASE_MAILLAGE } from '../src/journal/depot';

const DRIVER = fileURLToPath(new URL('../.claude/skills/run-terramemo/driver.py', import.meta.url));
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
  /** Version des rapports fabriqués (6 par défaut) : leurs stats n'ont que les champs de cette version. */
  v?: 3 | 4 | 5;
}

/**
 * Les stats d'un geste telles qu'un rapport v3 à v5 les donnait
 * (src/mesure/rapport.ts, changements de version) : v5 sans gels ni saccade
 * (v6) ; v4 sans acoups, acoups_par_s, duree_ms ni tenue_120 (v5), mais avec
 * saccades (≥ 24,5 ms), part_saccades, periode_ecran_ms et tenue ; v3 sans
 * ces quatre-là ni cadence_ips (v4).
 */
function statsAnciennes(iv: number[], v: 3 | 4 | 5 | 6): Record<string, unknown> {
  const s: Record<string, unknown> = { ...statsGeste(iv, P60) };
  const retirer = (...cles: string[]) => cles.forEach((c) => delete s[c]);
  if (v === 6) return s;
  retirer('gels', 'saccade');
  if (v === 5) return s;
  retirer('acoups', 'acoups_par_s', 'duree_ms', 'tenue_120');
  const saccades = iv.filter((d) => d >= 24.5).length;
  Object.assign(s, { saccades, part_saccades: saccades / iv.length, periode_ecran_ms: s.periode_geste_ms, tenue: 1 });
  if (v === 4) return s;
  retirer('saccades', 'part_saccades', 'periode_ecran_ms', 'tenue', 'cadence_ips');
  return s;
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
  // Rapports v3 à v5 : un gel seul dans un long geste (NON par la règle
  // par geste, que la moyenne laisserait passer : 0,95/s) et 4 à-coups de
  // 22 ms en ~1 s (NON ; ni « saccades » v4, ≥ 24,5 ms, ni gel). Un driver
  // qui lirait stats.gels, stats.acoups ou stats.saccade au lieu de les
  // recalculer jugerait ces deux lignes OK.
  ...([3, 4, 5] as const).map((v) => ({
    nom: `rapport v${v}, sans stats.gels ni saccade${v < 5 ? ' ni acoups' : ''} : relu et jugé comme un v6`,
    rapports: [{ glisser: [[50, ...rep(60, P60)]], pincer: [[22, 22, 22, 22, ...rep(56, P60)]] }],
    ok: { glisser: false, pincer: false },
    v,
  })),
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
    v: c.v ?? 6,
    rendu: 'g',
    ecran: { periode_ms: c.periode ?? P60 },
    chargement: null,
    touchers: [],
    gestes: (Object.entries(r) as [Type, number[][]][]).flatMap(([type, gestes]) =>
      gestes.map((iv) => ({
        type,
        rendu: 'g',
        intervalles_ms: iv,
        stats: statsAnciennes(iv, c.v ?? 6),
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
  dossier = mkdtempSync(join(tmpdir(), 'terramemo-driver-'));
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

// --- Scénario du driver, chargement et relais du webgl ---------------------

/** Le scénario de mesurer (SCENARIO de driver.py) : le tour du monde (tourner) est un glissé pour la page. */
const SCENARIO = ['pincer', 'glisser', 'glisser', 'pincer', 'glisser', 'pincer', 'pincer', 'glisser', 'glisser', 'pincer', 'pincer', 'tourner', 'tourner', 'tourner'] as const;
type Nom = (typeof SCENARIO)[number];

function geste(type: Type, iv: number[], rendu: string) {
  return {
    type,
    rendu,
    intervalles_ms: iv,
    stats: statsGeste(iv, P60),
    longues_images: { nombre: 0, max_ms: null, blocage_total_ms: 0 },
    dessin_ms: null,
    fin: { event_timing_etat: 'mesure', event_timing_ms: 20, image_ms: 10, close_par_entree_suivante: false },
  };
}

/** Un rapport du scénario : les intervalles de chaque geste selon son nom ; en webgl, l'état du relais. */
function rapportScenario(iv: Record<Nom, number[]>, total_ms: number, rendu = 'canvas', webgl?: Record<string, unknown>) {
  return {
    v: 6,
    rendu,
    ecran: { periode_ms: P60 },
    chargement: { total_ms },
    touchers: [],
    gestes: SCENARIO.map((n) => geste(n === 'tourner' ? 'glisser' : n, iv[n], rendu)),
    ...(webgl ? { webgl } : {}),
  };
}

/** L'état du relais (src/map/relais-webgl.ts, EtatRelais) tel que le rapport le copie. */
function relais(source: 'calcul' | 'cache' | null, cache: string | null, apres: number | null, etapes: [string, number][], repli?: string) {
  return {
    etape: repli ? 'repli' : 'webgl',
    raison: repli ?? null,
    gpu: 'ANGLE (essai)',
    logiciel: Boolean(repli),
    maillage: { source, cache, ecrit: null, worker: source ? { cle_ms: 1, lecture_ms: 1, analyse_ms: 50, maillage_ms: source === 'calcul' ? 250 : 0, total_ms: source === 'calcul' ? 350 : 40 } : null },
    temps: { apres_affichage_ms: apres, etapes: etapes.map(([nom, ms], i) => ({ nom, a_ms: 100 + i, ms })) },
  };
}

// Tour du monde : 3 gestes courts d'un à-coup chacun (25 ms + 17 × 16 ms,
// 297 ms : 3,37/s), aucun ne saccade seul (moins de 2 à-coups) ; leur
// moyenne, 3,37/s, fait NON. Fondus dans les glissés (5 × 38 images propres),
// 0,74/s : OK. Gestes plus courts que le vrai tour du monde (960 ms) : au-delà
// de ~0,67 s, un geste qui fait dépasser 3/s saccade aussi seul.
const propres = { pincer: rep(29, P60), glisser: rep(38, P60), tourner: [25, ...rep(17, 16)] };
const sc = {
  tour: { v: 6, cible: 'local', criteres: {}, touchers_vises: [], notes: [], rapports: [rapportScenario(propres, 400)] },
  webgl: {
    v: 6,
    cible: 'chrome',
    criteres: {},
    touchers_vises: [],
    notes: [],
    ralenti: 1,
    visites: [{ visite: 'premiere' }, { visite: 'suivante' }, { visite: 'suivante' }],
    rapports: [
      rapportScenario(propres, 950, 'webgl', relais('calcul', 'absent', 700, [['contexte', 150], ['nom du GPU', 110], ['premiere image', 47]])),
      rapportScenario(propres, 300, 'webgl', relais('cache', 'lu', 250, [['contexte', 20], ['nom du GPU', 5], ['premiere image', 12]])),
      rapportScenario(propres, 320, 'webgl', relais('cache', 'lu', 230, [['contexte', 25], ['nom du GPU', 4], ['premiere image', 14]])),
    ],
  },
  // Repli : le webgl demandé a fini en Canvas 2D (rendu canvas, etape repli) ; JSON d'avant les visites, téléphone.
  repli: {
    v: 6,
    cible: 'webview',
    criteres: {},
    touchers_vises: [],
    notes: [],
    rapports: [rapportScenario(propres, 500, 'canvas', relais(null, null, null, [['contexte', 30]], 'WebGL2 indisponible'))],
  },
  // Seule la première visite dépasse 1 s : le critère « rendu < 1 s » doit dire NON.
  lente: {
    v: 6,
    cible: 'chrome',
    criteres: {},
    touchers_vises: [],
    notes: [],
    visites: [{ visite: 'premiere' }, { visite: 'suivante' }, { visite: 'suivante' }],
    rapports: [
      rapportScenario(propres, 1050, 'webgl', relais('calcul', 'absent', 700, [['contexte', 150]])),
      rapportScenario(propres, 300, 'webgl', relais('cache', 'lu', 250, [['contexte', 20]])),
      rapportScenario(propres, 320, 'webgl', relais('cache', 'lu', 230, [['contexte', 25]])),
    ],
  },
  // Repli en cours de série : deux répétitions en webgl, la troisième en Canvas de repli.
  partiel: {
    v: 6,
    cible: 'chrome',
    criteres: {},
    touchers_vises: [],
    notes: [],
    visites: [{ visite: 'premiere' }, { visite: 'suivante' }, { visite: 'suivante' }],
    rapports: [
      rapportScenario(propres, 450, 'webgl', relais('calcul', 'absent', 600, [['contexte', 150]])),
      rapportScenario(propres, 300, 'webgl', relais('cache', 'lu', 250, [['contexte', 20]])),
      rapportScenario(propres, 310, 'canvas', relais(null, null, null, [['contexte', 30]], 'contexte perdu')),
    ],
  },
  // Première visite d'après le stockage vidé, mais maillage lu dans le cache : à signaler.
  cacheLu: {
    v: 6,
    cible: 'chrome',
    criteres: {},
    touchers_vises: [],
    notes: [],
    visites: [{ visite: 'premiere' }],
    rapports: [rapportScenario(propres, 300, 'webgl', relais('cache', 'lu', 200, [['contexte', 20]]))],
  },
};
interface Stats {
  mediane: number | null;
  min: number | null;
  max: number | null;
  n: number;
}
interface ResumeScenario {
  gestes: Record<string, Ligne & { gestes: number; rendu: string }>;
  chargement_ms: { ok: boolean; max: number; par_visite: Record<string, Stats> };
  relais_webgl: {
    gpu: string[];
    replis: { repetition: number; raison: string; logiciel: boolean }[];
    par_visite: Record<string, { n: number; maillage: Record<string, number>; apres_affichage_ms: Stats; etapes_ms: Record<string, Stats>; plus_longue_etape: { nom: string; ms: number } }>;
  } | null;
}
let scenario: Record<keyof typeof sc, ResumeScenario>;
let notesScenario: Record<keyof typeof sc, string[]>;

describe('driver.py resumer : scénario du driver, chargement et relais du webgl', () => {
  beforeAll(() => {
    const noms = Object.keys(sc) as (keyof typeof sc)[];
    const chemins = noms.map((n) => {
      const chemin = join(dossier, `scenario-${n}.json`);
      writeFileSync(chemin, JSON.stringify(sc[n]));
      return chemin;
    });
    const r = spawnSync('python3', [DRIVER, 'resumer', '--sec', '--json', ...chemins], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`driver.py resumer : code ${r.status}\n${r.stderr}\n${r.stdout}`);
    const resumes = JSON.parse(r.stdout).resumes as { resume: ResumeScenario; notes: string[] }[];
    scenario = Object.fromEntries(noms.map((n, i) => [n, resumes[i]!.resume])) as typeof scenario;
    notesScenario = Object.fromEntries(noms.map((n, i) => [n, resumes[i]!.notes])) as typeof notesScenario;
  });

  it('le tour du monde a sa ligne (tourner) : seul à dépasser 3 à-coups/s en moyenne, sans geste qui saccade seul, NON ; la page (glisser) dirait OK', () => {
    const g = scenario.tour.gestes;
    expect(Object.keys(g).sort()).toEqual(['glisser', 'pincer', 'tourner']);
    expect([g.pincer!.gestes, g.glisser!.gestes, g.tourner!.gestes]).toEqual([6, 5, 3]);
    const tours = Array.from({ length: 3 }, () => statsGeste(propres.tourner, P60));
    const glisses = Array.from({ length: 5 }, () => statsGeste(propres.glisser, P60));
    expect(tours.some((s) => s.saccade)).toBe(false);
    expect(g.tourner!.gestes_saccades).toBe(0);
    expect(g.tourner!.acoups_par_s).toBeGreaterThan(3);
    expect(g.tourner!.saccade_ok).toBe(sansSaccade(tours));
    expect(g.tourner!.saccade_ok).toBe(false);
    expect(g.glisser!.saccade_ok).toBe(true);
    expect(g.pincer!.saccade_ok).toBe(true);
    // Le panneau de la page range le tour du monde avec les glissés : OK.
    expect(sansSaccade([...glisses, ...tours])).toBe(true);
  });

  it('chargement : première visite et suivantes à part, le critère sur toutes (première comprise)', () => {
    const c = scenario.webgl.chargement_ms;
    expect(c.par_visite.premiere).toMatchObject({ n: 1, max: 950 });
    expect(c.par_visite.suivante).toMatchObject({ n: 2, min: 300, max: 320 });
    expect(c.ok).toBe(true);
    // JSON d'avant les visites : la répétition 1 du PC est une première visite (profil neuf).
    expect(Object.keys(scenario.tour.chargement_ms.par_visite)).toEqual(['premiere']);
    // … celle du téléphone, inconnue.
    expect(Object.keys(scenario.repli.chargement_ms.par_visite)).toEqual(['inconnue']);
    // Seule la première visite dépasse 1 s : NON (le critère la compte).
    const l = scenario.lente.chargement_ms;
    expect(l.par_visite.premiere).toMatchObject({ n: 1, max: 1050 });
    expect(l.par_visite.suivante).toMatchObject({ n: 2, max: 320 });
    expect(l.ok).toBe(false);
  });

  it('repli en cours de série : les gestes du Canvas de repli ont leurs lignes à part', () => {
    const g = scenario.partiel.gestes;
    expect(Object.keys(g).sort()).toEqual(['glisser', 'glisser (canvas)', 'pincer', 'pincer (canvas)', 'tourner', 'tourner (canvas)']);
    expect(g.pincer!.rendu).toBe('webgl');
    expect(g['pincer (canvas)']!.rendu).toBe('canvas');
    expect([g.pincer!.gestes, g['pincer (canvas)']!.gestes]).toEqual([12, 6]);
    expect(scenario.partiel.relais_webgl!.replis).toEqual([{ repetition: 3, raison: 'contexte perdu', gpu: 'ANGLE (essai)', logiciel: true }]);
  });

  it('première visite au maillage lu dans le cache : signalée (stockage pas vidé ?)', () => {
    expect(notesScenario.cacheLu.some((n) => n.includes('première visite, mais maillage lu dans le cache'))).toBe(true);
    expect(notesScenario.webgl.some((n) => n.includes('maillage lu dans le cache'))).toBe(false);
  });

  it('relais du webgl par visite : maillage calculé puis lu, apres_affichage_ms, étapes à surveiller', () => {
    const r = scenario.webgl.relais_webgl!;
    expect(r.gpu).toEqual(['ANGLE (essai)']);
    expect(r.replis).toEqual([]);
    const p = r.par_visite.premiere!;
    const s = r.par_visite.suivante!;
    expect(p.maillage).toEqual({ 'calcul/absent': 1 });
    expect(s.maillage).toEqual({ 'cache/lu': 2 });
    expect(p.apres_affichage_ms).toMatchObject({ n: 1, max: 700 });
    expect(s.apres_affichage_ms).toMatchObject({ n: 2, min: 230, max: 250 });
    expect(p.etapes_ms['contexte']).toMatchObject({ max: 150 });
    expect(p.etapes_ms['nom du GPU']).toMatchObject({ max: 110 });
    expect(p.etapes_ms['premiere image']).toMatchObject({ max: 47 });
    expect(p.plus_longue_etape).toMatchObject({ nom: 'contexte', ms: 150 });
    expect(scenario.tour.relais_webgl).toBeNull();
  });

  it('repli du webgl : relevé avec sa raison, lignes du Canvas de repli', () => {
    const r = scenario.repli.relais_webgl!;
    expect(r.replis).toEqual([{ repetition: 1, raison: 'WebGL2 indisponible', gpu: 'ANGLE (essai)', logiciel: true }]);
    expect(Object.keys(scenario.repli.gestes).sort()).toEqual(['glisser', 'pincer', 'tourner']);
    expect(scenario.repli.gestes.pincer!.rendu).toBe('canvas');
  });
});

// Fausse page CDP : IndexedDB.* n'agit que depuis un document de l'origine
// (« No document for given frame found » sinon, comme Chromium) ;
// Storage.clearDataForOrigin vide l'IndexedDB ou le localStorage entiers si
// on le lui demande, comme le vrai.
const FAUSSE_PAGE = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("driver", sys.argv[1])
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
cas = json.loads(sys.argv[2])
for k, v in cas.get("constantes", {}).items():
    setattr(d, k, tuple(v) if isinstance(v, list) else v)
class Page:
    def __init__(s):
        s.appels, s.bases, s.cles, s.url = [], set(cas["bases"]), list(cas["cles"]), "about:blank"
    def goto(s, url):
        s.appels.append(["goto", url])
        s.url = url
    def js(s, expression):
        return sorted(s.cles)
    def cdp(s, methode, **k):
        s.appels.append([methode, k])
        if methode.startswith("IndexedDB.") and not s.url.startswith(k["securityOrigin"] + "/"):
            raise RuntimeError(methode + " : No document for given frame found")
        if methode == "IndexedDB.requestDatabaseNames":
            return {"databaseNames": sorted(s.bases)}
        if methode == "IndexedDB.deleteDatabase":
            if not cas.get("suppression_sans_effet"):
                s.bases.discard(k["databaseName"])
            return {}
        if methode == "Storage.clearDataForOrigin":
            types = k["storageTypes"].split(",")
            if "all" in types or "indexeddb" in types:
                s.bases.clear()
            if "all" in types or "local_storage" in types:
                s.cles.clear()
            return {}
        raise RuntimeError("méthode inattendue " + methode)
p = Page()
r = d.vider_premiere_visite(p, cas["url"])
print(json.dumps({"stockage": r, "appels": p.appels, "constantes": {
    "STOCKAGE_VIDE": d.STOCKAGE_VIDE, "BASES_VIDEES": d.BASES_VIDEES, "BASES_GARDEES": d.BASES_GARDEES,
    "PAGE_SANS_APPLI": d.PAGE_SANS_APPLI}}))
`;

interface Vidage {
  stockage: { vide: boolean; origine: string; types: string | null; bases_supprimees: string[]; bases_gardees: string[] | null; cles_gardees: number | null; connexion_chaude: boolean; erreur: string | null };
  appels: [string, unknown][];
  constantes: { STOCKAGE_VIDE: string; BASES_VIDEES: string[]; BASES_GARDEES: string[]; PAGE_SANS_APPLI: string };
}

function vider(cas: { url: string; bases: string[]; cles: string[]; suppression_sans_effet?: boolean; constantes?: Record<string, unknown> }): { r: Vidage | null; status: number | null; stderr: string } {
  const r = spawnSync('python3', ['-c', FAUSSE_PAGE, DRIVER, JSON.stringify(cas)], { encoding: 'utf8' });
  return { r: r.status === 0 ? (JSON.parse(r.stdout) as Vidage) : null, status: r.status, stderr: r.stderr };
}

/** Clé de localStorage d'un fichier source (const CLE_… = 'terramemo.…'). */
const cleDe = (fichier: string, nom: string): string => {
  const m = readFileSync(fichier, 'utf8').match(new RegExp(`const ${nom} = '([^']+)'`));
  if (!m) throw new Error(`${nom} introuvable dans ${fichier}`);
  return m[1]!;
};

describe('driver.py mesurer : première visite sans perte des données de l’utilisateur', () => {
  // Les clés de progrès et réglages relues dans le code : un renommage ne passe pas inaperçu.
  const CLES = [
    CLE_APPAREIL,
    cleDe('src/epreuve/chrono.ts', 'CLE_RECORDS'),
    cleDe('src/vues/classement.ts', 'CLE_PSEUDO'),
    cleDe('src/vues/arbre.ts', 'CLE_DERNIERE'),
    cleDe('src/main.ts', 'CLE_MESURES'),
  ];
  const BASES = [BASE_MAILLAGE, BASE_JOURNAL, 'firebaseLocalStorageDb', 'firebase-heartbeat-database'];

  it('seule la base du maillage webgl est supprimée, depuis une page du site sans l’appli ; journal, compte et localStorage gardés', () => {
    const { r, stderr } = vider({ url: 'http://localhost:8064/', bases: BASES, cles: CLES });
    expect(r, stderr).not.toBeNull();
    const { stockage, appels, constantes } = r!;
    expect(stockage).toMatchObject({ vide: true, origine: 'http://localhost:8064', erreur: null, bases_supprimees: [BASE_MAILLAGE], cles_gardees: CLES.length, connexion_chaude: true });
    expect(stockage.bases_gardees).toEqual([BASE_JOURNAL, 'firebase-heartbeat-database', 'firebaseLocalStorageDb'].sort());
    const types = constantes.STOCKAGE_VIDE.split(',');
    for (const t of ['all', 'indexeddb', 'local_storage', 'cookies']) expect(types).not.toContain(t);
    expect(types).toEqual(expect.arrayContaining(['cache_storage', 'service_workers', 'shader_cache']));
    const suppressions = appels.filter(([m]) => m === 'IndexedDB.deleteDatabase').map(([, k]) => (k as { databaseName: string }).databaseName);
    expect(suppressions).toEqual([BASE_MAILLAGE]);
    // La page sans appli est chargée avant tout appel IndexedDB.
    expect(appels[0]).toEqual(['goto', `http://localhost:8064/${constantes.PAGE_SANS_APPLI}`]);
  });

  it('les listes du driver suivent le code : base du maillage du worker, base du journal et compte anonyme gardés, page sans appli publiée', () => {
    const { r } = vider({ url: 'http://localhost:8064/', bases: [], cles: [] });
    const c = r!.constantes;
    expect(c.BASES_VIDEES).toEqual([BASE_MAILLAGE]);
    expect(readFileSync('src/map/maillage.worker.ts', 'utf8')).toContain(`const BASE = '${BASE_MAILLAGE}';`);
    expect(c.BASES_GARDEES).toEqual(expect.arrayContaining([BASE_JOURNAL, 'firebaseLocalStorageDb']));
    expect(existsSync(`public/${c.PAGE_SANS_APPLI}`)).toBe(true);
    expect(r!.stockage).toMatchObject({ vide: true, bases_supprimees: [], bases_gardees: [] });
  });

  it('site en ligne sous une adresse avec requête : même origine, page sans appli à côté', () => {
    const { r } = vider({ url: 'https://terramemo.web.app/?rendu=webgl', bases: [BASE_JOURNAL], cles: CLES });
    expect(r!.appels[0]).toEqual(['goto', 'https://terramemo.web.app/geo/LICENSE-CLDR.txt']);
    expect(r!.stockage).toMatchObject({ vide: true, origine: 'https://terramemo.web.app', bases_supprimees: [], bases_gardees: [BASE_JOURNAL] });
  });

  it('base du maillage restée : pas une première visite sûre, erreur relevée', () => {
    const { r } = vider({ url: 'http://localhost:8064/', bases: BASES, cles: CLES, suppression_sans_effet: true });
    expect(r!.stockage.vide).toBe(false);
    expect(r!.stockage.erreur).toContain(BASE_MAILLAGE);
  });

  it('un vidage par type qui emporterait l’IndexedDB ou le localStorage est refusé avant tout appel', () => {
    for (const STOCKAGE_VIDE of ['indexeddb,shader_cache', 'all', 'local_storage']) {
      const { r, status, stderr } = vider({ url: 'http://localhost:8064/', bases: BASES, cles: CLES, constantes: { STOCKAGE_VIDE } });
      expect(r).toBeNull();
      expect(status).not.toBe(0);
      expect(stderr).toContain('données de l\'utilisateur');
    }
    const { r } = vider({ url: 'http://localhost:8064/', bases: BASES, cles: CLES, constantes: { BASES_VIDEES: [BASE_MAILLAGE, BASE_JOURNAL] } });
    expect(r).toBeNull();
  });

  it('une base ou une clé de l’utilisateur disparue est signalée (filet si le navigateur vidait plus que demandé)', () => {
    // Garde-fou levé à dessein : le contrôle d'après coup voit seul la perte.
    const tout = vider({ url: 'http://localhost:8064/', bases: BASES, cles: CLES, constantes: { STOCKAGE_VIDE: 'all', TYPES_INTERDITS: [] } }).r!;
    expect(tout.stockage.vide).toBe(false);
    expect(tout.stockage.erreur).toContain(BASE_JOURNAL);
    expect(tout.stockage.erreur).toContain(`localStorage ${CLE_APPAREIL}`);
  });
});
