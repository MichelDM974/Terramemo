// Mesure de Q3 (docs/questions-j1a.md, #2) : l'outil du skill run-terramemo
// (.claude/skills/run-terramemo/outils/pastilles.py, python3 stdlib seule)
// compte, dans le journal de l'appareil sauvé par `driver.py sauver_journal`,
// la part des justes « par pastille » et par tranche de zoom. Ce test lui
// donne deux petites sauvegardes (APK et site) et confronte sa sortie --json
// aux comptes attendus : fusion sans doublon, sens « où est » seul, séances et
// parties libres à part, QCM et carte retournée ignorés, communes à part,
// tranches de zoom, fiches justes par pastille, filtre --depuis.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  reponse('pays:MLT:localiser', 'revision', true, 'pastille', 1), // île : disque en mer
  reponse('pays:ITA:localiser', 'revision', false, null, 1, { aide: 'passer', reponse: null }),
  // Reprise en fin de séance (note null) : hors FSRS, à part.
  reponse('pays:VAT:localiser', 'revision', true, 'pastille', 1, { note: null }),
  // Hors mesure : QCM et carte retournée (fiches :nommer).
  reponse('pays:ITA:nommer', 'qcm', true, null, 1, { note: null }),
  reponse('pays:ITA:nommer', 'revision', true, null, 1),
  reponse('pays:MCO:localiser', 'libre', true, 'pastille', 1),
  reponse('communes:97411:localiser', 'rappel', true, 'trace', 1.1),
];
// Le site : un doublon de l'APK (même id) et une réponse de la veille.
const site = [apk[0]!, reponse('pays:SMR:localiser', 'revision', true, 'pastille', 1, { ts: T0 - 86_400_000 })];

writeFileSync(join(dossier, 'journal-apk.json'), JSON.stringify({ format: 1, origine: 'https://localhost', sauve_le: '2026-11-07T10:30:00+04:00', evenements: apk }));
writeFileSync(join(dossier, 'journal-site.json'), JSON.stringify({ format: 1, origine: 'https://terramemo-geo.web.app', evenements: site }));
// Le dossier des sauvegardes : deux de l'APK (la plus récente gagne, par sauve_le), une du PC (écartée), une illisible.
const sauvegardes = join(dossier, 'sauvegardes');
mkdirSync(sauvegardes);
const sauvegarde = (nom: string, o: Record<string, unknown>) => writeFileSync(join(sauvegardes, nom), JSON.stringify({ format: 1, evenements: [], ...o }));
sauvegarde('journal-2026-11-07.json', { cible: 'webview', origine: 'https://localhost', sauve_le: '2026-11-07T12:00:00+04:00' });
sauvegarde('journal-2026-11-07-2.json', { cible: 'webview', origine: 'https://localhost', sauve_le: '2026-11-07T09:00:00+04:00' });
sauvegarde('journal-2026-11-07-3.json', { cible: 'chrome', origine: 'https://terramemo-geo.web.app', sauve_le: '2026-11-07T10:00:00+04:00' });
sauvegarde('journal-2026-11-07-4.json', { cible: 'local', origine: 'http://localhost:8060', sauve_le: '2026-11-07T13:00:00+04:00' });
writeFileSync(join(sauvegardes, 'journal-abime.json'), '{');

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
    // 10 réponses notées de pays + SMR, 1 reprise, 1 libre, 1 commune.
    expect(r.reponses).toBe(14);
    const s = r.domaines.pays.fsrs;
    expect(s.total).toMatchObject({ n: 11, justes: 9, faux: 2, trace: 3, pastille: 5, proche: 1 });
    expect(s.tranches['< 1,5']).toMatchObject({ n: 7, justes: 5, pastille: 3, trace: 1, proche: 1, faux: 2 });
    expect(s.tranches['1,5 à 3']).toMatchObject({ n: 1, pastille: 1 });
    expect(s.tranches['3 à 6']).toMatchObject({ n: 1, pastille: 1 });
    expect(s.tranches['≥ 12']).toMatchObject({ n: 1, trace: 1 });
    expect(s.tranches['sans zoom']).toMatchObject({ n: 1, trace: 1 });
    expect(s.tranches['6 à 12']).toBeUndefined();
    expect(s.faible).toMatchObject({ n: 8, justes: 6, pastille: 4 });
    expect(r.domaines.pays.reprises.total).toMatchObject({ n: 1, pastille: 1 });
    expect(r.domaines.pays.libre.total).toMatchObject({ n: 1, pastille: 1 });
    expect(r.domaines.communes.fsrs.total).toMatchObject({ n: 1, trace: 1 });
  });

  it('Q3 : les micro-États seuls, disque posé sur un pays (VAT, SMR) ou en mer (MLT), les grands pays à part', () => {
    const { q3 } = outil();
    expect(q3.voisin).toMatchObject({ n: 4, justes: 3, pastille: 3, pastille_pc: 100, justes_pc: 75 });
    expect(q3.mer).toMatchObject({ n: 1, justes: 1, pastille: 1 });
    expect(q3.tous_pays).toMatchObject({ n: 8, justes: 6, pastille: 4 });
  });

  it('les fiches justes par pastille, la plus touchée par pastille d’abord', () => {
    const r = outil();
    expect(r.fiches.map((f: { id: string }) => f.id)).toEqual(['VAT', 'LIE', 'SMR', 'MLT']);
    expect(r.fiches[0]).toMatchObject({ n: 4, justes: 3, pastille: 2, trace: 1, faux: 1, zoom_pastille_median: 1.7, sur_voisin: true });
    expect(r.fiches[3]).toMatchObject({ micro: true, sur_voisin: false });
    expect(r.fiches[0].faible).toMatchObject({ n: 3, justes: 2, pastille: 2 });
  });

  it('--depuis écarte les réponses d’avant ; --tranches et --faible changent les bornes', () => {
    const r = outil('--depuis', '07/11/2026');
    expect(r.domaines.pays.fsrs.total.n).toBe(10);
    expect(r.fiches.map((f: { id: string }) => f.id)).toEqual(['VAT', 'LIE', 'MLT']);
    const b = outil('--tranches', '2,8', '--faible', '6');
    expect(Object.keys(b.domaines.pays.fsrs.tranches).sort()).toEqual(['2 à 8', '< 2', 'sans zoom', '≥ 8'].sort());
    expect(b.domaines.pays.fsrs.faible).toMatchObject({ n: 9, justes: 7, pastille: 5 });
    const mauvais = spawnSync('python3', [OUTIL, join(dossier, 'journal-apk.json'), '--tranches', '0,3'], { encoding: 'utf8' });
    expect(mauvais.status).not.toBe(0);
  });

  it('dernières sauvegardes : la plus récente de chaque origine, sans celles du PC ni les illisibles', () => {
    const code = `import importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('p',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r,e=m.dernieres_sauvegardes(pathlib.Path(sys.argv[2]));print(json.dumps([sorted(f.name for f in r),[f.name for f in e]]))`;
    const r = spawnSync('python3', ['-c', code, OUTIL, sauvegardes], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([['journal-2026-11-07-3.json', 'journal-2026-11-07.json'], ['journal-2026-11-07-4.json']]);
  });

  it('événements que la sauvegarde dit invalides, ou sans id texte : écartés et comptés', () => {
    const f = join(dossier, 'journal-invalides.json');
    const bon = reponse('pays:VAT:localiser', 'revision', true, 'pastille', 1);
    writeFileSync(f, JSON.stringify({ origine: 'x', invalides: [{ i: 0, id: 'z', probleme: 'zoom' }], evenements: [{ ...bon, id: 'z', zoom: -1 }, { ...bon, id: 5 }, bon, null] }));
    const r = spawnSync('python3', [OUTIL, f, '--json'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.sources[0]).toMatchObject({ evenements: 4, ajoutes: 1, ecartes: 3 });
    expect(j.reponses).toBe(1);
  });

  it('Q3 : les Trouver de capitales et de drapeaux comptent avec ceux du pays (même disque), jamais les mers', () => {
    // Étude du J2, § 6.5 : la cible d'une capitale ou d'un drapeau est le pays.
    const f = join(dossier, 'journal-sujets.json');
    const evts = [
      reponse('pays:VAT:localiser', 'revision', true, 'trace', 1),
      reponse('capitales:VAT:localiser', 'revision', true, 'pastille', 1),
      reponse('drapeaux:VAT:localiser', 'rappel', false, null, 2),
      reponse('drapeaux:ITA:localiser', 'revision', true, 'trace', 1),
      reponse('mers:medit:localiser', 'revision', true, 'proche', 1),
    ];
    for (const e of evts) expect(probleme(e)).toBeNull();
    writeFileSync(f, JSON.stringify({ origine: 'https://localhost', evenements: evts }));
    const r = spawnSync('python3', [OUTIL, f, '--json'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.q3.voisin).toMatchObject({ n: 3, justes: 2, pastille: 1, trace: 1 });
    expect(j.q3.tous_pays).toMatchObject({ n: 4, justes: 3 });
    expect(j.fiches).toHaveLength(1);
    expect(j.fiches[0]).toMatchObject({ id: 'VAT', n: 3, domaines: { pays: 1, capitales: 1, drapeaux: 1 } });
    // Chaque sujet garde son propre tableau, les mers comprises.
    expect(Object.keys(j.domaines).sort()).toEqual(['capitales', 'drapeaux', 'mers', 'pays']);
    expect(j.domaines.mers.fsrs.total).toMatchObject({ n: 1, proche: 1 });
  });

  it('sortie lisible : le chiffre de Q3 et le tableau des fiches', () => {
    const r = spawnSync('python3', [OUTIL, join(dossier, 'journal-apk.json'), join(dossier, 'journal-site.json')], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('micro-États au disque posé sur un pays (le biais que vise B) : 4 réponse(s), 3 juste(s) (75 %), dont 3 par pastille (100 % des justes)');
    expect(r.stdout).toContain('Vatican (VAT)');
  });
});
