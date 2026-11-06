// Écran Crédits (⚙ › Crédits et licences, src/vues/credits.ts) : les données,
// les bibliothèques embarquées et la police, chacune avec sa licence ; DOM
// factice (tests/dom-factice.ts). Les licences sont relues dans node_modules :
// une mise à jour qui en change une fait tomber le test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nomPaquets, vueCredits } from '../src/vues/credits';
import { textes } from '../src/vues/textes';
import { installerDom, type El } from './dom-factice';

const T = textes.credits;
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const licence = (p: string) => (JSON.parse(readFileSync(`node_modules/${p}/package.json`, 'utf8')) as { license: string }).license;
/**
 * Paquets que le build met réellement dans le site, relus à chaque passage dans
 * les sources des cartes d'un `vite build --sourcemap` (dossier temporaire,
 * moins d'une seconde) : une mise à jour de d3 ou de Firebase qui tire un
 * nouveau paquet fait tomber le test tant qu'il n'est pas crédité. Pour un
 * chemin node_modules imbriqué, le paquet est le dernier ; Firebase compte pour
 * tous ses @firebase/*.
 */
let embarques: string[] = [];
let sortie = '';
beforeAll(() => {
  sortie = mkdtempSync(join(tmpdir(), 'terramemo-credits-'));
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--sourcemap', '--outDir', sortie, '--emptyOutDir', '--logLevel', 'error'], { stdio: 'pipe' });
  const paquets = new Set<string>();
  const assets = join(sortie, 'assets');
  for (const f of readdirSync(assets).filter((f) => f.endsWith('.map'))) {
    for (const src of (JSON.parse(readFileSync(join(assets, f), 'utf8')) as { sources: string[] }).sources) {
      const p = [...src.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)].at(-1)?.[1];
      if (p) paquets.add(p.startsWith('@firebase/') ? 'firebase' : p);
    }
  }
  embarques = [...paquets].sort();
}, 120_000);
afterAll(() => {
  if (sortie) rmSync(sortie, { recursive: true, force: true });
});
/** Crédités sans être dans le site : le paquet natif de l'APK (ligne « Dans l'appli Android seulement »). */
const HORS_SITE = ['@capacitor/android'];

let zone: El;
let retour: ReturnType<typeof vi.fn<() => void>>;
let fetch: ReturnType<typeof vi.fn>;

function ouvrir(): El {
  retour = vi.fn<() => void>();
  zone = document.createElement('div') as unknown as El;
  const masquer = vi.fn();
  const v = vueCredits({ zone, carte: { masquer } } as never, { retour });
  v.activer();
  expect(masquer).toHaveBeenCalledWith(true);
  return zone.querySelector('#vue-credits')!;
}

beforeEach(() => {
  installerDom();
  fetch = vi.fn(async () => ({ ok: true, json: async () => JSON.parse(readFileSync('public/geo/reunion/sources.json', 'utf8')) }));
  vi.stubGlobal('fetch', fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('écran Crédits', () => {
  it('les données : Natural Earth (domaine public), Unicode CLDR (Unicode License v3), IGN ADMIN EXPRESS (Licence Ouverte 2.0, source et date)', async () => {
    const v = ouvrir();
    expect(v.hidden).toBe(false);
    const texte = v.querySelector('#credits-liste-donnees')!.innerText;
    for (const m of ['Natural Earth', 'v5.1.2', 'Domaine public', 'Unicode CLDR', 'Unicode License v3', 'IGN, ADMIN EXPRESS', 'Licence Ouverte 2.0']) expect(texte).toContain(m);
    // La date de mise à jour de l'IGN, lue dans le sources.json de l'île à l'ouverture.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).toHaveBeenCalledWith('/geo/reunion/sources.json');
    expect(v.querySelector('li[data-credit="ign"]')!.innerText).toContain('Source : IGN, à jour au 30/06/2026');
    // Les licences qui ont un texte : un lien vers lui (CLDR servi à côté des noms).
    const liens = v.querySelectorAll('#credits-liste-donnees a').map((a) => a.getAttribute('href'));
    expect(liens).toContain('/geo/LICENSE-CLDR.txt');
    expect(readFileSync('public/geo/LICENSE-CLDR.txt', 'utf8')).toContain('UNICODE LICENSE V3');
  });

  it('chaque dépendance du site et ses paquets embarqués, avec la licence de son package.json ; aucun outil de développement', () => {
    const v = ouvrir();
    const credites = T.bibliotheques.flatMap((b) => b.paquets.map((p) => [p, b.licence] as const));
    const noms = credites.map(([p]) => p);
    // Ce que le build embarque, rien de plus (hors l'APK), et chaque dépendance directe.
    expect(embarques).toContain('d3-geo');
    expect([...noms].sort()).toEqual([...embarques, ...HORS_SITE].sort());
    for (const p of Object.keys(pkg.dependencies)) expect(noms, p).toContain(p);
    for (const [p, l] of credites) expect(l, p).toBe(licence(p));
    for (const p of Object.keys(pkg.devDependencies)) expect(noms, p).not.toContain(p);
    // Une ligne par groupe, ses paquets avec leur version (dépendances directes) et sa licence.
    const lignes = v.querySelectorAll('#credits-bibliotheques li');
    expect(lignes.length).toBe(T.bibliotheques.length);
    const fsrs = v.querySelector('li[data-credit="ts-fsrs"]')!.innerText;
    expect(fsrs).toContain(`ts-fsrs ${pkg.dependencies['ts-fsrs']}`);
    expect(fsrs).toContain('MIT');
    expect(v.querySelector('li[data-credit="firebase"]')!.innerText).toContain('Apache-2.0');
    // d3-geo embarque du code dérivé de GeographicLib (MIT, Charles Karney), avis présent dans son LICENSE.
    expect(readFileSync('node_modules/d3-geo/LICENSE', 'utf8')).toContain('Charles Karney');
    const geo = v.querySelector('li[data-credit="d3-geo"]')!.innerText;
    for (const m of ['ISC', 'Mike Bostock', 'Charles Karney', 'GeographicLib (MIT)']) expect(geo).toContain(m);
    expect(nomPaquets(['d3-geo', 'd3-array'])).toBe(`d3-geo ${pkg.dependencies['d3-geo']}, d3-array`);
  });

  it('la police Inter (SIL OFL 1.1), son texte servi avec elle ; « Retour » ramène à la vue d’avant', () => {
    const v = ouvrir();
    expect(v.querySelector('#credits-police')!.innerText).toContain('SIL Open Font License 1.1');
    expect(v.querySelector('#credits-police a')!.getAttribute('href')).toBe('/vendor/inter/LICENSE.txt');
    expect(readFileSync('public/vendor/inter/LICENSE.txt', 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    v.querySelector('#credits-retour')!.click();
    expect(retour).toHaveBeenCalledOnce();
  });

  it('textes : espaces insécables avant « : » et « ; », comme la mention de la carte', () => {
    const tous = JSON.stringify(T);
    expect(tous).not.toMatch(/ [:;]/);
  });

  it('index.html : le lien de ⚙ vers l’écran, et la ligne des données', () => {
    const html = readFileSync('index.html', 'utf8');
    const popup = html.slice(html.indexOf('id="settings-popup"'));
    expect(popup).toContain('href="#credits" id="lien-credits"');
    expect(popup).toContain('id="credits-donnees"');
  });
});
