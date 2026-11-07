// Mesure de Q3 (docs/questions-j1a.md, #2) : l'outil du skill run-terramemo
// (.claude/skills/run-terramemo/outils/pastilles.py, python3 stdlib seule)
// compte, dans le journal de l'appareil sauvé par `driver.py sauver_journal`,
// la part des justes « par pastille » et par tranche de zoom. Ce test lui
// donne deux petites sauvegardes (APK et site) et confronte sa sortie --json
// aux comptes attendus : fusion sans doublon, sens « où est » seul, séances et
// parties libres à part, QCM et carte retournée ignorés, communes à part,
// tranches de zoom, fiches justes par pastille, filtre --depuis.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { Evenement } from '../src/srs/journal';
import { probleme } from '../src/srs/journal';

const OUTIL = fileURLToPath(new URL('../.claude/skills/run-terramemo/outils/pastilles.py', import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), 'pastilles-'));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

const T0 = Date.UTC(2026, 10, 7, 6); // 07/11/2026, 10 h à La Réunion
let n = 0;
function reponse(fiche: string, mode: Evenement['mode'], correct: boolean, via: Evenement['via'], zoom: number | null, o: Partial<Evenement> = {}): Evenement {
  n++;
  return {
    v: 1,
    id: `e${n}`,
    appareil: 'a',
    ts: T0 + n * 1000,
    tz: 240,
    seance: mode === 'libre' ? null : 's1',
    type: 'reponse',
    fiche,
    mode,
    reponse: correct ? null : 'ITA',
    via: correct ? via : null,
    zoom,
    correct,
    aide: null,
    duree_ms: 2000,
    distance_km: correct ? 0 : 120,
    note: mode === 'rappel' || mode === 'revision' ? (correct ? 3 : 1) : null,
    ...o,
  };
}

const apk = [
  reponse('pays:VAT:localiser', 'rappel', true, 'pastille', 1),
  reponse('pays:VAT:localiser', 'revision', true, 'pastille', 2.4),
  reponse('pays:VAT:localiser', 'revision', false, null, 1.2),
  reponse('pays:VAT:localiser', 'revision', true, 'trace', 16),
  reponse('pays:ITA:localiser', 'rappel', true, 'trace', 1),
  reponse('pays:LIE:localiser', 'revision', true, 'pastille', 5),
  reponse('pays:FJI:localiser', 'revision', true, 'proche', 1),
  reponse('pays:ITA:localiser', 'revision', true, 'trace', null),
  // Hors mesure : QCM, carte retournée (sens nommer), partie libre à part.
  reponse('pays:ITA:localiser', 'qcm', true, null, 1),
  reponse('pays:ITA:nommer', 'revision', true, null, 1),
  reponse('pays:MCO:localiser', 'libre', true, 'pastille', 1),
  reponse('communes:97411:localiser', 'rappel', true, 'trace', 1.1),
];
// Le site : un doublon de l'APK (même id) et une réponse de la veille.
const site = [apk[0]!, reponse('pays:SMR:localiser', 'revision', true, 'pastille', 1, { ts: T0 - 86_400_000 })];

writeFileSync(join(dossier, 'journal-apk.json'), JSON.stringify({ format: 1, origine: 'https://localhost', sauve_le: '2026-11-07T10:30:00+04:00', evenements: apk }));
writeFileSync(join(dossier, 'journal-site.json'), JSON.stringify({ format: 1, origine: 'https://terramemo-geo.web.app', evenements: site }));

function outil(...args: string[]) {
  const r = spawnSync('python3', [OUTIL, join(dossier, 'journal-apk.json'), join(dossier, 'journal-site.json'), '--json', ...args], { encoding: 'utf8', env: { ...process.env, TZ: 'Indian/Reunion' } });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout);
}

describe('outil pastilles.py (mesure de Q3)', () => {
  it('les événements fabriqués sont valides pour l’appli', () => {
    for (const e of [...apk, ...site]) expect(probleme(e)).toBeNull();
  });

  it('séances : part des justes par via et par tranche de zoom, le zoom faible à part', () => {
    const r = outil();
    expect(r.sources.map((s: { ajoutes: number }) => s.ajoutes)).toEqual([apk.length, 1]);
    // 8 séances de pays + SMR + 1 libre + 1 commune.
    expect(r.reponses).toBe(11);
    const s = r.domaines.pays.fsrs;
    expect(s.total).toMatchObject({ n: 9, justes: 8, faux: 1, trace: 3, pastille: 4, proche: 1 });
    expect(s.tranches['< 1,5']).toMatchObject({ n: 5, justes: 4, pastille: 2, trace: 1, proche: 1, faux: 1 });
    expect(s.tranches['1,5 à 3']).toMatchObject({ n: 1, pastille: 1 });
    expect(s.tranches['3 à 6']).toMatchObject({ n: 1, pastille: 1 });
    expect(s.tranches['≥ 12']).toMatchObject({ n: 1, trace: 1 });
    expect(s.tranches['sans zoom']).toMatchObject({ n: 1, trace: 1 });
    expect(s.tranches['6 à 12']).toBeUndefined();
    // Zoom < 3 : 5 justes, dont 3 par pastille (VAT ×2, SMR).
    expect(s.faible).toMatchObject({ n: 6, justes: 5, pastille: 3, pastille_pc: 60 });
    expect(r.domaines.pays.libre.total).toMatchObject({ n: 1, pastille: 1 });
    expect(r.domaines.communes.fsrs.total).toMatchObject({ n: 1, trace: 1 });
  });

  it('les fiches justes par pastille, la plus touchée par pastille d’abord', () => {
    const r = outil();
    expect(r.fiches.map((f: { id: string }) => f.id)).toEqual(['VAT', 'LIE', 'SMR']);
    expect(r.fiches[0]).toMatchObject({ n: 4, justes: 3, pastille: 2, trace: 1, faux: 1, zoom_pastille_median: 1.7 });
    expect(r.fiches[0].faible).toMatchObject({ n: 3, justes: 2, pastille: 2 });
  });

  it('--depuis écarte les réponses d’avant ; --tranches et --faible changent les bornes', () => {
    const r = outil('--depuis', '07/11/2026');
    expect(r.domaines.pays.fsrs.total.n).toBe(8);
    expect(r.fiches.map((f: { id: string }) => f.id)).toEqual(['VAT', 'LIE']);
    const b = outil('--tranches', '2,8', '--faible', '6');
    expect(Object.keys(b.domaines.pays.fsrs.tranches).sort()).toEqual(['2 à 8', '< 2', 'sans zoom', '≥ 8'].sort());
    expect(b.domaines.pays.fsrs.faible).toMatchObject({ justes: 6, pastille: 4 });
  });

  it('sortie lisible : le chiffre de Q3 et le tableau des fiches', () => {
    const r = spawnSync('python3', [OUTIL, join(dossier, 'journal-apk.json'), join(dossier, 'journal-site.json')], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('=> Q3 : au zoom < 3, 3 juste(s) sur 5 par pastille (60 % des justes)');
    expect(r.stdout).toMatch(/Vatican|VAT/);
  });
});
