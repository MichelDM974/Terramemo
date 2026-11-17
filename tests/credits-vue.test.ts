// Écran Crédits (⚙ › Crédits et licences, src/vues/credits.ts) : les données,
// les bibliothèques embarquées et la police, chacune avec sa licence ; DOM
// factice (tests/dom-factice.ts). Les licences sont relues dans node_modules :
// une mise à jour qui en change une fait tomber le test.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APACHE_ICI, artefacts, composantsAar, factoriserApache, GROUPES_AVIS, releveAvis, termesApache } from '../licences/android.mjs';
import { AVIS_ANDROID, artefactsAndroid, avisAndroid, FICHIER_LICENCES, LICENCES_A_PART, ligneAndroid, texteAvis, texteLicence, texteLicencePaquet, texteLicences } from '../licences/tierces';
import { nomPaquets, URL_LICENCES, vueCredits } from '../src/vues/credits';
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
/**
 * Crédités sans être dans le site : les paquets natifs de l'APK (lignes « Dans
 * l'appli Android seulement »). Le greffon Google (lot 7 du J1b) n'a rien
 * dans le build : src/sync/google-apk.ts passe par registerPlugin de
 * @capacitor/core et n'en importe que les types.
 */
const HORS_SITE = ['@capacitor/android', '@capawesome/capacitor-google-sign-in'];

let zone: El;
let retour: ReturnType<typeof vi.fn<() => void>>;
let versCarte: ReturnType<typeof vi.fn<() => void>>;
let fetch: ReturnType<typeof vi.fn>;

function ouvrir(): El {
  retour = vi.fn<() => void>();
  versCarte = vi.fn<() => void>();
  zone = document.createElement('div') as unknown as El;
  const masquer = vi.fn();
  const v = vueCredits({ zone, carte: { masquer } } as never, { retour, versCarte });
  v.activer();
  expect(masquer).toHaveBeenCalledWith(true);
  return zone.querySelector('#vue-credits')!;
}

/** Ce que rend le fetch factice pour le fichier des licences : le texte, ou un échec (hors ligne). */
let licencesServies: string | null = 'TEXTES DES LICENCES';

beforeEach(() => {
  installerDom();
  licencesServies = 'TEXTES DES LICENCES';
  fetch = vi.fn(async (url: string) =>
    url === URL_LICENCES
      ? licencesServies === null
        ? Promise.reject(new TypeError('Failed to fetch'))
        : { ok: true, text: async () => licencesServies }
      : { ok: true, json: async () => JSON.parse(readFileSync('public/geo/reunion/sources.json', 'utf8')) },
  );
  vi.stubGlobal('fetch', fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('écran Crédits', () => {
  it('les données : Natural Earth (domaine public), Unicode CLDR (Unicode License v3), IGN ADMIN EXPRESS (Licence Ouverte 2.0, source et date), Wikidata (CC0, date de l’extrait), flag-icons (MIT) et le drapeau de l’Émirat (Commons, domaine public)', async () => {
    const v = ouvrir();
    expect(v.hidden).toBe(false);
    const texte = v.querySelector('#credits-liste-donnees')!.innerText;
    for (const m of ['Natural Earth', 'v5.1.2', 'Domaine public', 'Unicode CLDR', 'Unicode License v3', 'IGN, ADMIN EXPRESS', 'Licence Ouverte 2.0', 'Wikidata', 'extrait du ', 'CC0 1.0']) expect(texte).toContain(m);
    for (const m of ['flag-icons', 'Drapeaux des pays · v7.6.0, Honduras mis à jour (2026)', 'MIT', '© 2013 Panayiotis Lipiridis', 'Wikimedia Commons', "Drapeau de l'Émirat islamique d'Afghanistan"]) expect(texte).toContain(m);
    // La date de mise à jour de l'IGN, lue dans le sources.json de l'île à l'ouverture.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).toHaveBeenCalledWith('/geo/reunion/sources.json');
    expect(v.querySelector('li[data-credit="ign"]')!.innerText).toContain('Source : IGN, à jour au 30/06/2026');
    // Les licences qui ont un texte : un lien vers lui (CLDR servi à côté des noms).
    const liens = v.querySelectorAll('#credits-liste-donnees a').map((a) => a.getAttribute('href'));
    expect(liens).toContain('/geo/LICENSE-CLDR.txt');
    expect(readFileSync('public/geo/LICENSE-CLDR.txt', 'utf8')).toContain('UNICODE LICENSE V3');
    // Le MIT de flag-icons, servi hors du dossier immuable des drapeaux (étude J2, § 2.2).
    expect(liens).toContain('/geo/licences/flag-icons.txt');
    expect(readFileSync('public/geo/licences/flag-icons.txt', 'utf8')).toContain('Copyright (c) 2013 Panayiotis Lipiridis');
  });

  it('les sources des fiches (lot F2, § 6.6) : à la fin des données, chacune avec la date ou la version de son extrait, lue dans son fichier', () => {
    const v = ouvrir();
    const json = <J,>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as J;
    /** « 2026-11-17 » → « 17/11/2026 ». */
    const date = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
    /** Espaces insécables en espaces simples, pour comparer. */
    const simple = (x: string) => x.replace(/[\u00a0\u202f]/g, ' ');
    const ligne = (nom: string) => {
      const c = T.donnees.find((d) => d.nom === nom);
      if (!c) throw new Error(`${nom} absent des crédits`);
      return { ...c, detail: simple(c.detail), licence: simple(c.licence) };
    };
    const sources = json<{ sources: { nom: string; version: string }[] }>('public/geo/sources.json').sources;
    const source = (debut: string) => sources.find((x) => x.nom.startsWith(debut))!.version;
    // Les lignes nouvelles à la fin (credits.ts lit l'IGN par son rang) ; l'IGN, la troisième.
    expect(T.donnees.map((d) => d.nom).slice(-3)).toEqual(['Banque mondiale', "Base de données des fuseaux horaires de l'IANA", 'CIA World Factbook']);
    expect(T.donnees[2]!.nom).toContain('IGN');
    // Unicode CLDR : les langues et les monnaies aussi, à la version des deux extraits.
    const cldr = ligne('Unicode CLDR');
    expect(cldr.detail).toBe(`Noms des pays, des langues et des monnaies ; langues et monnaies de chaque pays · v${source('Unicode CLDR, langues').split(' ')[0]}`);
    expect(source('Unicode CLDR, noms').split(' ')[0]).toBe(source('Unicode CLDR, langues').split(' ')[0]);
    // Wikidata : l'extrait des capitales, puis celui des fiches, chacun à sa date.
    const wd = ligne('Wikidata');
    expect(wd.detail).toBe(
      `Capitales et notoriété des lieux · extrait du ${date(json<{ date: string }>('geodata/wikidata/capitales.json').date)} ; ` +
        `superficies, gentilés, sommets, habitants de Taïwan et du Vatican, liens vers Wikipédia · extrait du ${date(json<{ date: string }>('geodata/wikidata/fiches.json').date)}`,
    );
    // La Banque mondiale, selon ses conditions : « The World Bank: <jeu>: <source> », CC BY 4.0, l'adresse des conditions en lien.
    const bm = json<{ date: string; annee: number; source: { nom: string }; conditions: { url: string; licence: string } }>('geodata/banque-mondiale/population.json');
    const banque = ligne('Banque mondiale');
    expect(banque.detail).toBe(`Habitants des pays, ${bm.annee} · World Development Indicators, extrait du ${date(bm.date)}`);
    expect(bm.conditions.licence).toContain('CC BY 4.0');
    expect(banque.licence).toContain('CC BY 4.0');
    expect(banque.lien).toBe(bm.conditions.url);
    expect(banque.auteur).toMatch(/^The World Bank: World Development Indicators, Population, total \(SP\.POP\.TOTL\): \S/);
    expect(bm.source.nom).toContain('Population, total (SP.POP.TOTL)');
    // La base tz à la version de zone.tab ; le Factbook à la date de son miroir figé ; tous deux du domaine public.
    const tz = ligne("Base de données des fuseaux horaires de l'IANA");
    expect(tz.detail).toBe(`Fuseau de chaque pays · ${source('IANA Time Zone Database')}`);
    expect(tz.licence).toBe('Domaine public');
    const cia = ligne('CIA World Factbook');
    expect(cia.detail.match(/miroir figé du (\d\d\/\d\d\/\d{4})$/)?.[1]).toBe(source('CIA World Factbook').match(/du (\d\d\/\d\d\/\d{4})/)?.[1]);
    expect(cia.licence).toBe('Domaine public');
    // Toutes à l'écran, la licence en lien.
    const texte = simple(v.querySelector('#credits-liste-donnees')!.innerText);
    for (const c of [cldr, wd, banque, tz, cia]) for (const m of [c.nom, c.detail, c.licence]) expect(texte, c.nom).toContain(m);
    const liens = v.querySelectorAll('#credits-liste-donnees a').map((a) => a.getAttribute('href'));
    for (const c of [banque, tz, cia]) expect(liens, c.nom).toContain(c.lien);
    // Aucune ligne de l'Annuaire démographique de l'ONU (écarté le 18/11 : ses conditions interdisent la redistribution).
    expect(texte).not.toMatch(/Annuaire|Demographic Yearbook/i);
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

  it('« × » (#18) : la carte, pas la vue d’avant', () => {
    const v = ouvrir();
    const x = v.querySelector('.panel .croix')!;
    expect(x.getAttribute('aria-label')).toBe(textes.croix.carte);
    x.click();
    expect(versCarte).toHaveBeenCalledOnce();
    expect(retour).not.toHaveBeenCalled();
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

describe('licences tierces (#20)', () => {
  const version = (p: string) => (JSON.parse(readFileSync(`node_modules/${p}/package.json`, 'utf8')) as { version: string }).version;
  let fichier = '';
  beforeAll(() => {
    fichier = readFileSync(join(sortie, FICHIER_LICENCES), 'utf8');
  });

  it('le build sert le fichier à la racine, celui de texteLicences(), à l’adresse que l’écran demande', () => {
    expect(URL_LICENCES).toBe(`/${FICHIER_LICENCES}`);
    expect(fichier).toBe(texteLicences());
    expect(fichier.startsWith(T.fichier_titre)).toBe(true);
  });

  it('chaque paquet embarqué (et celui de l’APK) avec sa version et le texte entier de son LICENSE ; Firebase, sans LICENSE, renvoie au texte d’Apache', () => {
    for (const p of [...embarques, ...HORS_SITE]) {
      expect(fichier, p).toContain(`${p} ${version(p)}`);
      const texte = texteLicencePaquet(p);
      if (texte) expect(fichier, p).toContain(texte);
      else expect(licence(p), p).toBe('Apache-2.0');
    }
    expect(texteLicence('node_modules/firebase')).toBeNull();
    expect(fichier).toContain(`firebase ${version('firebase')} (et ses paquets @firebase/*)\nLicence\u202f: Apache-2.0`);
    // Les avis que le test des Crédits exigeait à l'écran sont dans les textes : GeographicLib, Robert Penner.
    expect(fichier).toContain('Copyright 2008-2012 Charles Karney');
    expect(fichier).toContain('Copyright 2001 Robert Penner');
    // Un exemplaire par texte : les d3 sous la licence de Mike Bostock ne la répètent pas
    // (elle ne revient qu'à l'intérieur d'un autre texte, celui de d3-geo, qui la complète de GeographicLib).
    const isc = texteLicence('node_modules/d3-zoom')!;
    const textes = new Set([...embarques, ...HORS_SITE].map((p) => texteLicencePaquet(p)).filter((t) => t?.includes(isc)));
    expect(textes.size).toBe(2);
    expect(fichier.split(isc).length - 1).toBe(textes.size);
  });

  it('le greffon Google de l’APK (lot 7 du J1b) : sans LICENSE sur npm, la copie de celui de son dépôt (MIT, Robin Genz), dans le fichier', () => {
    const p = '@capawesome/capacitor-google-sign-in';
    expect(texteLicence(`node_modules/${p}`)).toBeNull();
    expect(licence(p)).toBe('MIT');
    const texte = texteLicencePaquet(p)!;
    expect(texte).toBe(readFileSync(`licences/${LICENCES_A_PART[p]}`, 'utf8').trim());
    expect(texte).toMatch(/^MIT License\n\nCopyright \(c\) 2026 Robin Genz\n/);
    expect(fichier).toContain(`${p} ${version(p)}\nLicence\u202f: MIT\n`);
    expect(fichier).toContain(texte);
  });

  it('section « Données » : le texte MIT de flag-icons, celui que le site sert sous /geo/licences/, après les bibliothèques Android', () => {
    const mit = readFileSync('public/geo/licences/flag-icons.txt', 'utf8').trimEnd();
    expect(mit).toContain('Permission is hereby granted');
    const donnees = fichier.indexOf(`\n${T.fichier_donnees}\n`);
    expect(donnees).toBeGreaterThan(fichier.indexOf(`\n${T.fichier_android}\n`));
    expect(fichier.indexOf(`flag-icons · ${T.donnees.find((d) => d.nom === 'flag-icons')!.detail}\nLicence\u202f: MIT\n`)).toBeGreaterThan(donnees);
    expect(fichier.split(mit).length - 1).toBe(1);
    expect(fichier.indexOf(mit)).toBeGreaterThan(donnees);
    // Seules les données dont le texte est servi sous /geo/licences/ y sont (pas CLDR ni Natural Earth).
    expect(T.donnees.filter((d) => d.lien.startsWith('/geo/licences/')).map((d) => d.nom)).toEqual(['flag-icons']);
  });

  it('le texte d’Apache 2.0 une fois, en fin de fichier', () => {
    const apache = readFileSync('licences/apache-2.0.txt', 'utf8').trimEnd();
    expect(apache).toContain('Apache License');
    expect(apache).toContain('END OF TERMS AND CONDITIONS');
    expect(fichier.split(apache).length - 1).toBe(1);
    expect(fichier.trimEnd().endsWith(apache)).toBe(true);
  });

  it('chaque bibliothèque Android relevée, sous une seule ligne des Crédits, avec les avis (NOTICE) de Cordova et de Kotlin', () => {
    const liste = artefactsAndroid();
    expect(liste).toContain('org.apache.cordova:framework:14.0.1');
    expect(liste.some((a) => a.startsWith('androidx.webkit:webkit:'))).toBe(true);
    for (const a of liste) {
      const lignes = T.android.filter((l) => ligneAndroid(a, [l]) === 0);
      expect([a, lignes.length]).toEqual([a, 1]);
      expect(fichier).toContain(`\n${a}\n`);
    }
    // Chaque ligne couvre au moins un artefact, sous Apache-2.0 (texte en fin de fichier), sauf les
    // services Google Play et googleid (lot 7 du J1b) : licence du SDK Android, lien de ses conditions.
    for (const [i, l] of T.android.entries()) {
      expect([l.nom, liste.some((a) => ligneAndroid(a) === i)]).toEqual([l.nom, true]);
      if (l.licence !== 'Apache-2.0') expect([l.nom, 'lien' in l && l.lien]).toEqual([l.nom, 'https://developer.android.com/studio/terms']);
    }
    expect(T.android.filter((l) => l.licence !== 'Apache-2.0').map((l) => l.groupes)).toEqual([['com.google.android.gms', 'com.google.android.libraries.identity.googleid']]);
    for (const a of ['com.google.android.gms:play-services-auth:21.5.0', 'com.google.android.libraries.identity.googleid:googleid:1.1.1', 'androidx.credentials:credentials:1.5.0']) expect(liste).toContain(a);
    expect(fichier).toContain('Services Google Play, Sign in with Google\nLicence\u202f: Licence du SDK Android (non libre), https://developer.android.com/studio/terms\n');
    for (const f of Object.values(AVIS_ANDROID)) expect(fichier).toContain(readFileSync(`licences/${f}`, 'utf8').trimEnd());
    expect(fichier).toContain('Apache Cordova\nCopyright 2015-2020 The Apache Software Foundation');
  });

  it('avis de tiers des AAR de Google (#31) : chaque artefact Google relevé a les siens, aucun texte vide, chacun une fois sous leur ligne', () => {
    const google = artefactsAndroid().filter((a) => GROUPES_AVIS.includes(a.split(':')[0]!));
    expect(T.android.filter((l) => l.licence !== 'Apache-2.0').flatMap((l) => l.groupes)).toEqual(GROUPES_AVIS);
    expect(google.length).toBe(10);
    const avis = avisAndroid();
    // Le relevé des avis suit android.json : un artefact Google mis à jour sans relevé fait tomber le test.
    expect(Object.keys(avis.artefacts).sort()).toEqual(google);
    for (const a of google) {
      expect([a, avis.artefacts[a]!.length > 0]).toEqual([a, true]);
      for (const n of avis.artefacts[a]!) expect([a, n, n >= 0 && n < avis.textes.length]).toEqual([a, n, true]);
    }
    const utilises = new Set(Object.values(avis.artefacts).flat());
    const debut = fichier.indexOf(`\n${T.fichier_avis_google}\u202f:\n`);
    expect(debut).toBeGreaterThan(fichier.indexOf('Services Google Play, Sign in with Google\nLicence'));
    const fin = fichier.indexOf(`\n${T.fichier_donnees}\n`);
    for (const [n, t] of avis.textes.entries()) {
      expect([n, utilises.has(n)]).toEqual([n, true]);
      expect([n, t.composants.length > 0 && t.composants.every((c) => c.trim().length > 0)]).toEqual([n, true]);
      expect([t.composants.join(', '), t.texte.replaceAll(APACHE_ICI, '').trim().length > 0]).toEqual([t.composants.join(', '), true]);
      // Encadré de ses filets : un texte qui en commence un autre (les deux de Kotlin) n'y est compté qu'une fois.
      const rendu = `${t.composants.join(', ')}\n${'-'.repeat(36)}\n\n${texteAvis(t.texte).trimEnd()}\n\n`;
      const encadres = [`${rendu}${'-'.repeat(36)}\n`, `${rendu}\n${'='.repeat(36)}\n`];
      const places = encadres.map((r) => fichier.indexOf(r)).filter((x) => x >= 0);
      const fois = encadres.reduce((n, r) => n + fichier.split(r).length - 1, 0);
      expect(fois, t.composants.join(', ')).toBe(1);
      expect(places[0]).toBeGreaterThan(debut);
      expect(places[0]).toBeLessThan(fin);
    }
    // Un exemplaire par texte (aux blancs près) ; les termes d'Apache renvoyés au texte de fin de fichier.
    const cles = avis.textes.map((t) => t.texte.replace(/\s+/g, ' '));
    expect(new Set(cles).size).toBe(cles.length);
    expect(fichier).not.toContain(APACHE_ICI);
    expect(fichier).toContain(T.fichier_avis_apache);
    const composants = avis.textes.flatMap((t) => t.composants);
    for (const c of ['Protocol Buffers', 'Checker Framework Annotations', 'Dagger', 'Guava JDK5', 'Kotlin']) expect(composants).toContain(c);
  });

  it('le relevé des avis : octets de l’index, termes d’Apache 2.0 retirés aux blancs près, textes identiques aux blancs près mis en commun', () => {
    const txt = Buffer.from('\n\nÉté:\nMIT © Zoé\n\nB:\nBSD');
    const i = txt.indexOf('MIT');
    expect(composantsAar({ Été: { start: i, length: Buffer.byteLength('MIT © Zoé') }, B: { start: txt.indexOf('BSD'), length: 3 } }, txt)).toEqual([
      ['Été', 'MIT © Zoé'],
      ['B', 'BSD'],
    ]);
    const termes = termesApache(readFileSync('licences/apache-2.0.txt', 'utf8'));
    expect(termes.slice(0, 5).join(' ')).toBe('TERMS AND CONDITIONS FOR USE,');
    expect(termes.slice(-5).join(' ')).toBe('END OF TERMS AND CONDITIONS');
    const corps = termes.join(' ');
    const aLaLigne = termes.join('\n   ');
    expect(factoriserApache(`Copyright X\n\n Apache License\n${aLaLigne}\n\nAPPENDIX`, termes)).toBe(`Copyright X\n\n Apache License\n${APACHE_ICI}\n\nAPPENDIX`);
    // Un mot de différence : le texte reste entier.
    const autre = corps.replace('Definitions.', 'Definition.');
    expect(factoriserApache(autre, termes)).toBe(autre);
    const r = releveAvis(
      new Map<string, [string, string][]>([
        ['g:a:1', [['Guava', `Apache\n${corps}`], ['Protobuf', 'BSD  3']]],
        ['g:b:1', [['Dagger', `Apache ${aLaLigne}`], ['Protobuf', 'BSD\n3\n']]],
      ]),
      termes,
    );
    expect(r.textes).toEqual([
      { composants: ['Dagger', 'Guava'], texte: `Apache\n${APACHE_ICI}` },
      { composants: ['Protobuf'], texte: 'BSD  3' },
    ]);
    expect(r.artefacts).toEqual({ 'g:a:1': [0, 1], 'g:b:1': [0, 1] });
  });

  it('le relevé de Gradle : artefacts résolus, sans contrainte, BOM ni projet', () => {
    const arbre = [
      '+--- androidx.appcompat:appcompat:1.7.1',
      '|    +--- androidx.core:core:1.13.0 -> 1.17.0 (*)',
      '|    +--- org.jetbrains.kotlin:kotlin-stdlib -> 2.0.21 (*)',
      '|    +--- org.jetbrains.kotlinx:kotlinx-coroutines-bom:1.8.1',
      '|    \\--- androidx.appcompat:appcompat-resources:1.7.1 (c)',
      '+--- project :capacitor-android',
      '|    +--- androidx.core:core:1.17.0 (*)',
    ].join('\n');
    expect(artefacts(arbre)).toEqual(['androidx.appcompat:appcompat:1.7.1', 'androidx.core:core:1.17.0', 'org.jetbrains.kotlin:kotlin-stdlib:2.0.21']);
  });

  it('l’écran : les bibliothèques de l’APK, puis les textes dépliés à la demande, téléchargés une fois ; un échec se retente', async () => {
    const v = ouvrir();
    const android = v.querySelectorAll('#credits-android li');
    expect(android.length).toBe(T.android.length);
    expect(v.querySelector('li[data-credit="androidx.*"]')!.innerText).toContain('Apache-2.0');
    const details = v.querySelector('#credits-licences') as El & { open?: boolean };
    const texte = v.querySelector('#credits-licences-texte')!;
    expect(details.querySelector('summary')!.textContent).toBe(T.licences_resume);
    const lus = () => fetch.mock.calls.filter(([u]) => u === URL_LICENCES).length;
    // Fermé : rien n'est demandé.
    details.emettre('toggle');
    expect(lus()).toBe(0);
    // Hors ligne : le message, puis un nouvel essai à la réouverture.
    licencesServies = null;
    details.open = true;
    details.emettre('toggle');
    await new Promise((r) => setTimeout(r, 0));
    expect(texte.textContent).toBe(T.licences_erreur);
    licencesServies = 'MIT License\nCopyright (c) Exemple';
    details.open = false;
    details.emettre('toggle');
    details.open = true;
    details.emettre('toggle');
    await new Promise((r) => setTimeout(r, 0));
    expect(texte.textContent).toBe('MIT License\nCopyright (c) Exemple');
    expect(lus()).toBe(2);
    // Lus : refermer et rouvrir ne les redemande pas.
    details.open = false;
    details.emettre('toggle');
    details.open = true;
    details.emettre('toggle');
    expect(lus()).toBe(2);
  });
});

