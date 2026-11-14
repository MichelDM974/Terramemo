// Service worker du site (#22) : la logique de src/sw/logique.ts sur de faux
// caches (CacheStorage) et un faux serveur, le manifeste de
// src/sw/construction.ts dressé sur de faux builds, la page
// (src/sw/enregistrer.ts) et les fichiers qui en dépendent (sw.ts,
// firebase.json, index.html), puis un vrai `vite build` (dossier temporaire,
// comme tests/credits-vue.test.ts) : le sw.js qu'il écrit. Le vrai navigateur
// (enregistrement, rechargement hors ligne) : `driver.py smoke` sur un build
// (serve --preview).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dresserManifeste, EN_PLUS_PREMIERE_VISITE, empreinteNode, injecterManifeste, MARQUEUR, referencesDe, SW_DE_RETRAIT } from '../src/sw/construction';
import * as page from '../src/sw/enregistrer';
import {
  activer,
  aiguiller,
  cachesPerimes,
  empreinte,
  ENTETE_EMPREINTE,
  installer,
  MESSAGE_ACTIVER,
  MESSAGE_CHARGES,
  nomCache,
  PREFIXE_CACHE,
  releveAccordee,
  repondre,
  retenir,
  verifiee,
  type CacheMin,
  type CachesMin,
  type Manifeste,
  type Moteur,
} from '../src/sw/logique';

const ORIGINE = 'https://terramemo-geo.web.app';

// --- Faux navigateur ---

interface Rangee {
  corps: ArrayBuffer;
  status: number;
  entetes: [string, string][];
}

/** CacheStorage en mémoire : chaque match rend une réponse neuve (un corps se lit une fois). */
class FauxCaches implements CachesMin {
  readonly tous = new Map<string, Map<string, Rangee>>();
  async open(nom: string): Promise<CacheMin> {
    let c = this.tous.get(nom);
    if (!c) this.tous.set(nom, (c = new Map()));
    const cache = c;
    return {
      match: async (cle) => {
        const r = cache.get(cle);
        return r && new Response(r.corps.slice(0), { status: r.status, headers: r.entetes });
      },
      put: async (cle, rep) => {
        cache.set(cle, { corps: await rep.arrayBuffer(), status: rep.status, entetes: [...rep.headers] });
      },
      keys: async () => [...cache.keys()].map((u) => new Request(u)),
    };
  }
  async keys(): Promise<string[]> {
    return [...this.tous.keys()];
  }
  async delete(nom: string): Promise<boolean> {
    return this.tous.delete(nom);
  }
  /** Chemin → texte rangé, et l'empreinte posée en en-tête. */
  contenu(nom: string): Map<string, { texte: string; entete: string | undefined }> {
    const dec = new TextDecoder();
    return new Map(
      [...(this.tous.get(nom) ?? [])].map(([u, r]) => [new URL(u).pathname, { texte: dec.decode(r.corps), entete: new Map(r.entetes).get(ENTETE_EMPREINTE) }]),
    );
  }
}

/** Le serveur d'un build (fichiers relatifs → texte), coupé à volonté ; garde les appels. */
class FauxReseau {
  appels: { chemin: string; cache: RequestCache | undefined }[] = [];
  horsLigne = false;
  constructor(public fichiers: Map<string, string>) {}
  fetch = async (r: string | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof r === 'string' ? r : r.url);
    this.appels.push({ chemin: url.pathname, cache: init?.cache });
    if (this.horsLigne) throw new TypeError('Failed to fetch');
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const f = this.fichiers.get(rel);
    return f === undefined ? new Response('absent', { status: 404 }) : new Response(f, { status: 200, headers: { 'content-type': 'text/plain' } });
  };
  chemins = (): string[] => this.appels.map((a) => a.chemin);
}

const CODE_SW = `const m = JSON.parse('${MARQUEUR}');`;

/** Un build : la v1, puis la v2 qui change la coquille, pays.json, les capitales et le morceau du compte. */
function build(version: 1 | 2): Map<string, string> {
  const js = version === 1 ? 'index-a1.js' : 'index-a2.js';
  const compte = version === 1 ? 'compte-c1.js' : 'compte-c2.js';
  return new Map([
    [
      'index.html',
      `<!doctype html><link rel="icon" href="/assets/icone-i1.svg"><link rel="preload" href="/vendor/inter/InterVariable.woff2">` +
        `<link rel="preload" href="/geo/monde.topo.json"><link rel="preload" href="/geo/pays.json"><script type="module" src="/assets/${js}"></script>` +
        `<link rel="stylesheet" href="/assets/index-s1.css"><a href="#carte">carte</a><a href="https://example.org/x">ailleurs</a>`,
    ],
    [`assets/${js}`, `code ${version}`],
    ['assets/index-s1.css', 'body{}'],
    ['assets/icone-i1.svg', '<svg/>'],
    [`assets/${compte}`, `compte ${version}`],
    ['vendor/inter/InterVariable.woff2', 'police'],
    ['geo/monde.topo.json', 'carte du monde (inchangée)'],
    ['geo/monde-leger.topo.json', 'carte allégée'],
    ['geo/pays.json', `pays ${version}`],
    ['geo/capitales.json', `capitales ${version}`],
    ['geo/drapeaux/fra1.svg', '<svg>drapeau</svg>'],
    ['confidentialite.html', `<main>politique ${version}</main>`],
    ['documents.css', 'main{}'],
    ['sw.js', CODE_SW],
  ]);
}

function moteur(caches: FauxCaches, reseau: FauxReseau, manifeste: Manifeste): Moteur {
  return { caches, fetch: reseau.fetch, manifeste, origine: ORIGINE };
}

/** repondre, les tâches de fond (ranger) attendues. */
async function demander(mo: Moteur, chemin: string, mode: RequestMode = 'cors'): Promise<{ texte: string; status: number } | 'hors-sw'> {
  const url = ORIGINE + chemin;
  const a = aiguiller({ url, method: 'GET', mode }, ORIGINE, mo.manifeste);
  if (a.strategie === 'hors-sw') return 'hors-sw';
  const fond: Promise<unknown>[] = [];
  const r = await repondre(mo, new Request(url), a, (t) => fond.push(t));
  await Promise.all(fond);
  return { texte: await r.text(), status: r.status };
}

const M1 = dresserManifeste(build(1), CODE_SW);
const M2 = dresserManifeste(build(2), CODE_SW);

describe('service worker : aiguillage des requêtes', () => {
  const a = (url: string, o: { method?: string; mode?: RequestMode } = {}) =>
    aiguiller({ url: url.startsWith('/') ? ORIGINE + url : url, method: o.method ?? 'GET', mode: o.mode ?? 'cors' }, ORIGINE, M1);

  it('jamais pour une autre origine (Firestore, Auth, googleapis), une requête non GET, /__/ ni sw.js', () => {
    expect(a('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel').strategie).toBe('hors-sw');
    expect(a('https://identitytoolkit.googleapis.com/v1/accounts:signUp').strategie).toBe('hors-sw');
    expect(a('https://www.googleapis.com/x').strategie).toBe('hors-sw');
    expect(a('https://terramemo-geo.firebaseapp.com/geo/pays.json').strategie).toBe('hors-sw');
    expect(a('/geo/pays.json', { method: 'POST' }).strategie).toBe('hors-sw');
    expect(a('/geo/pays.json', { method: 'HEAD' }).strategie).toBe('hors-sw');
    expect(a('/__/auth/handler', { mode: 'navigate' }).strategie).toBe('hors-sw');
    expect(a('/__/firebase/init.json').strategie).toBe('hors-sw');
    expect(a('/sw.js').strategie).toBe('hors-sw');
  });

  it('navigations : la coquille pour /, ses paramètres et /index.html ; les pages statiques réseau d’abord ; le reste hors du SW', () => {
    for (const u of ['/', '/?rendu=webgl&mesures=0', '/index.html']) expect(a(u, { mode: 'navigate' })).toEqual({ strategie: 'coquille', chemin: '/' });
    expect(a('/confidentialite.html', { mode: 'navigate' })).toEqual({ strategie: 'reseau-dabord', chemin: '/confidentialite.html' });
    expect(a('/inconnue.html', { mode: 'navigate' }).strategie).toBe('hors-sw');
  });

  it('fichiers du build : cache d’abord, sauf la page de confidentialité et sa feuille de style ; hors du build ou avec paramètres : hors du SW', () => {
    expect(a('/assets/index-a1.js')).toEqual({ strategie: 'cache', chemin: '/assets/index-a1.js' });
    expect(a('/geo/drapeaux/fra1.svg').strategie).toBe('cache');
    expect(a('/confidentialite.html')).toEqual({ strategie: 'reseau-dabord', chemin: '/confidentialite.html' });
    expect(a('/documents.css').strategie).toBe('reseau-dabord');
    expect(a('/geo/absent.json').strategie).toBe('hors-sw');
    expect(a('/geo/pays.json?hors-ligne=1').strategie).toBe('hors-sw');
  });

  it('caches : un par version, seuls ceux du site sont périmés', () => {
    expect(nomCache('abc')).toBe(`${PREFIXE_CACHE}abc`);
    expect(cachesPerimes(['terramemo-v1', 'terramemo-v2', 'autre', 'firebase'], 'v2')).toEqual(['terramemo-v1']);
  });

  it('relève : accordée seulement à une fenêtre seule', () => {
    expect(releveAccordee(0)).toBe(true);
    expect(releveAccordee(1)).toBe(true);
    expect(releveAccordee(2)).toBe(false);
  });
});

describe('service worker : installation, usage, hors ligne', () => {
  it('première installation : la coquille et la carte du premier affichage, rien des drapeaux, des capitales ni des morceaux à la demande', async () => {
    const caches = new FauxCaches();
    const reseau = new FauxReseau(build(1));
    const { telecharges, repris } = await installer(moteur(caches, reseau, M1));
    expect(repris).toEqual([]);
    expect(telecharges.sort()).toEqual(
      ['/', '/assets/index-a1.js', '/assets/index-s1.css', '/assets/icone-i1.svg', '/vendor/inter/InterVariable.woff2', '/geo/monde.topo.json', '/geo/pays.json', '/geo/monde-leger.topo.json'].sort(),
    );
    // Les noms hachés se prennent au cache HTTP, les autres se revalident (304 s'ils n'ont pas changé).
    for (const { chemin, cache } of reseau.appels) expect(cache, chemin).toBe(chemin.startsWith('/assets/') ? 'default' : 'no-cache');
    const rangees = caches.contenu(nomCache(M1.version));
    for (const [chemin, r] of rangees) expect(r.entete, chemin).toBe(M1.empreintes[chemin]);
  });

  it('réponse rangée : son empreinte en en-tête, sans l’encodage ni la longueur du transfert (corps déjà décodé)', async () => {
    const mo = moteur(new FauxCaches(), new FauxReseau(build(1)), M1);
    const r = new Response('pays 1', { headers: { 'content-encoding': 'br', 'content-length': '3', 'content-type': 'application/json' } });
    const v = (await verifiee(mo, '/geo/pays.json', r))!;
    expect([...v.headers].sort()).toEqual([['content-type', 'application/json'], [ENTETE_EMPREINTE, M1.empreintes['/geo/pays.json']]].sort());
    expect(await v.text()).toBe('pays 1');
    expect(await verifiee(mo, '/geo/pays.json', new Response('pays 2'))).toBeNull();
    expect(await verifiee(mo, '/geo/pays.json', new Response('pays 1', { status: 404 }))).toBeNull();
    expect(await verifiee(mo, '/geo/absent.json', new Response('x'))).toBeNull();
  });

  it('un fichier pré-chargé d’une autre version (déploiement pendant l’installation) : l’installation échoue', async () => {
    const caches = new FauxCaches();
    const melange = new Map(build(1));
    melange.set('geo/pays.json', 'pays 2');
    await expect(installer(moteur(caches, new FauxReseau(melange), M1))).rejects.toThrow('/geo/pays.json');
  });

  it('cache d’abord : une seconde demande ne touche pas le réseau ; un fichier d’une autre version est servi mais pas rangé', async () => {
    const caches = new FauxCaches();
    const reseau = new FauxReseau(build(1));
    const mo = moteur(caches, reseau, M1);
    await installer(mo);
    reseau.appels = [];
    expect(await demander(mo, '/geo/drapeaux/fra1.svg')).toEqual({ texte: '<svg>drapeau</svg>', status: 200 });
    expect(await demander(mo, '/geo/drapeaux/fra1.svg')).toEqual({ texte: '<svg>drapeau</svg>', status: 200 });
    expect(reseau.chemins()).toEqual(['/geo/drapeaux/fra1.svg']);
    reseau.fichiers.set('geo/capitales.json', 'capitales 2');
    expect(await demander(mo, '/geo/capitales.json')).toEqual({ texte: 'capitales 2', status: 200 });
    expect(caches.contenu(nomCache(M1.version)).has('/geo/capitales.json')).toBe(false);
  });

  it('hors ligne après une première visite : la coquille (paramètres compris), la carte, la page de confidentialité déjà lue', async () => {
    const caches = new FauxCaches();
    const reseau = new FauxReseau(build(1));
    const mo = moteur(caches, reseau, M1);
    await installer(mo);
    expect(await demander(mo, '/confidentialite.html', 'navigate')).toEqual({ texte: '<main>politique 1</main>', status: 200 });
    reseau.horsLigne = true;
    expect(await demander(mo, '/?rendu=webgl', 'navigate')).toMatchObject({ texte: build(1).get('index.html') });
    for (const f of ['/assets/index-a1.js', '/geo/monde.topo.json', '/geo/pays.json', '/geo/monde-leger.topo.json', '/vendor/inter/InterVariable.woff2']) {
      expect(await demander(mo, f), f).toMatchObject({ status: 200 });
    }
    expect(await demander(mo, '/confidentialite.html')).toEqual({ texte: '<main>politique 1</main>', status: 200 });
    // Jamais lus : hors ligne, ils échouent comme sans service worker.
    await expect(demander(mo, '/geo/capitales.json')).rejects.toThrow();
    await expect(demander(mo, '/documents.css')).rejects.toThrow();
  });

  it('réseau d’abord : la page de confidentialité à jour quand le réseau répond', async () => {
    const caches = new FauxCaches();
    const reseau = new FauxReseau(build(1));
    const mo = moteur(caches, reseau, M1);
    await installer(mo);
    await demander(mo, '/confidentialite.html');
    reseau.appels = [];
    expect(await demander(mo, '/confidentialite.html')).toEqual({ texte: '<main>politique 1</main>', status: 200 });
    expect(reseau.chemins()).toEqual(['/confidentialite.html']);
  });

  it('ce que la première visite a chargé avant le service worker est rangé, du build et de l’origine seulement', async () => {
    const caches = new FauxCaches();
    const reseau = new FauxReseau(build(1));
    const mo = moteur(caches, reseau, M1);
    await installer(mo);
    const ranges = await retenir(mo, [
      `${ORIGINE}/?rendu=canvas`,
      `${ORIGINE}/assets/compte-c1.js`,
      `${ORIGINE}/assets/compte-c1.js`,
      `${ORIGINE}/assets/index-a1.js`,
      `${ORIGINE}/geo/absent.json`,
      'https://firestore.googleapis.com/x',
      'pas une adresse',
    ]);
    expect(ranges).toEqual(['/assets/compte-c1.js']);
  });
});

describe('service worker : une nouvelle version remplace l’ancienne sans cache périmé', () => {
  it('v1 en usage, puis la v2 : installée à côté sans toucher la v1, ce qui n’a pas changé repris sans réseau, la v1 effacée à l’activation', async () => {
    const caches = new FauxCaches();
    await caches.open('autre-chose'); // pas à nous : gardé
    const reseau = new FauxReseau(build(1));
    const mo1 = moteur(caches, reseau, M1);
    await installer(mo1);
    expect(await activer(mo1)).toEqual([]);
    // À l'usage sous la v1 : un drapeau, les capitales, le morceau du compte.
    for (const f of ['/geo/drapeaux/fra1.svg', '/geo/capitales.json', '/assets/compte-c1.js']) await demander(mo1, f);
    const v1 = caches.contenu(nomCache(M1.version));

    // Déploiement de la v2 ; le navigateur trouve le nouveau sw.js.
    expect(M2.version).not.toBe(M1.version);
    reseau.fichiers = build(2);
    reseau.appels = [];
    const mo2 = moteur(caches, reseau, M2);
    const { repris, telecharges } = await installer(mo2);
    // Seul ce qui a changé passe par le réseau.
    expect(telecharges.sort()).toEqual(['/', '/assets/index-a2.js', '/geo/pays.json']);
    expect(reseau.chemins().sort()).toEqual(['/', '/assets/index-a2.js', '/geo/pays.json']);
    expect(repris.sort()).toEqual(
      ['/assets/icone-i1.svg', '/assets/index-s1.css', '/geo/drapeaux/fra1.svg', '/geo/monde-leger.topo.json', '/geo/monde.topo.json', '/vendor/inter/InterVariable.woff2'].sort(),
    );
    // Pendant ce temps, la page ouverte sous la v1 a toujours tout son cache.
    expect(caches.contenu(nomCache(M1.version))).toEqual(v1);
    expect(await demander(mo1, '/assets/compte-c1.js')).toEqual({ texte: 'compte 1', status: 200 });

    // Relève : la v1 effacée, les autres caches gardés.
    expect(await activer(mo2)).toEqual([nomCache(M1.version)]);
    expect((await caches.keys()).sort()).toEqual(['autre-chose', nomCache(M2.version)].sort());
    // Rien de périmé : chaque fichier rangé est celui de la v2, ni l'ancien morceau du compte ni les anciennes capitales.
    const v2 = caches.contenu(nomCache(M2.version));
    for (const [chemin, r] of v2) {
      expect(r.entete, chemin).toBe(M2.empreintes[chemin]);
      expect(empreinteNode(r.texte), chemin).toBe(M2.empreintes[chemin]);
    }
    expect(v2.has('/assets/compte-c1.js')).toBe(false);
    expect(v2.has('/geo/capitales.json')).toBe(false);
    expect(v2.get('/')!.texte).toContain('index-a2.js');
    reseau.horsLigne = true;
    expect(await demander(mo2, '/geo/pays.json')).toEqual({ texte: 'pays 2', status: 200 });
    expect(await demander(mo2, '/', 'navigate')).toMatchObject({ texte: build(2).get('index.html') });
    // Un morceau de la v1 n'est plus du build : hors du service worker.
    expect(await demander(mo2, '/assets/compte-c1.js')).toBe('hors-sw');
  });

  it('une installation de la v2 qui échoue laisse la v1 en place, intacte', async () => {
    const caches = new FauxCaches();
    const reseau = new FauxReseau(build(1));
    const mo1 = moteur(caches, reseau, M1);
    await installer(mo1);
    await activer(mo1);
    const v1 = caches.contenu(nomCache(M1.version));
    reseau.fichiers = build(1); // sw.js de la v2, mais le serveur sert encore la v1
    await expect(installer(moteur(caches, reseau, M2))).rejects.toThrow();
    expect(caches.contenu(nomCache(M1.version))).toEqual(v1);
  });
});

describe('service worker : construction du manifeste et de sw.js', () => {
  it('empreintes de tout le build sauf sw.js, index.html sous « / » ; pré-chargés : index.html, ce qu’il référence de l’origine, la carte allégée', () => {
    expect(Object.keys(M1.empreintes)).not.toContain('/sw.js');
    expect(M1.empreintes['/']).toBe(empreinteNode(build(1).get('index.html')!));
    expect(M1.prechargees).toEqual([
      '/',
      '/assets/icone-i1.svg',
      '/vendor/inter/InterVariable.woff2',
      '/geo/monde.topo.json',
      '/geo/pays.json',
      '/assets/index-a1.js',
      '/assets/index-s1.css',
      ...EN_PLUS_PREMIERE_VISITE,
    ]);
  });

  it('version : la même pour le même build (quel que soit l’ordre des fichiers), une autre si un fichier ou le code de sw.js change', () => {
    expect(dresserManifeste(new Map([...build(1)].reverse()), CODE_SW)).toEqual(M1);
    const f = new Map(build(1));
    f.set('geo/drapeaux/fra1.svg', '<svg>autre</svg>');
    expect(dresserManifeste(f, CODE_SW).version).not.toBe(M1.version);
    expect(dresserManifeste(build(1), CODE_SW + '\n').version).not.toBe(M1.version);
  });

  it('un fichier à pré-charger absent du build fait échouer le build', () => {
    const f = new Map(build(1));
    f.delete('geo/monde-leger.topo.json');
    expect(() => dresserManifeste(f, CODE_SW)).toThrow('/geo/monde-leger.topo.json');
    f.set('geo/monde-leger.topo.json', 'x');
    f.delete('geo/pays.json');
    expect(() => dresserManifeste(f, CODE_SW)).toThrow('/geo/pays.json');
  });

  it('références de index.html : de l’origine, sans ancres, paramètres ni autres sites', () => {
    expect(referencesDe(`<a href="#carte"></a><img src="/a.svg"><link href='/b.css?v=1'><a href="//cdn.example/x"></a><a href="https://x.org/y"></a>`)).toEqual(['/a.svg', '/b.css']);
  });

  it('injection : le marqueur remplacé par le manifeste, entre guillemets simples ou doubles ; zéro ou deux marqueurs : erreur', () => {
    const m = { ...M1, version: 'a$&b$1' };
    for (const code of [`const m=JSON.parse('${MARQUEUR}');`, `const m=JSON.parse("${MARQUEUR}");`]) {
      const sortie = injecterManifeste(code, m);
      expect(sortie).not.toContain(MARQUEUR);
      expect(new Function(`${sortie.replace('const m=', 'return ')}`)()).toEqual(m);
    }
    expect(() => injecterManifeste('rien', M1)).toThrow('0 marqueur');
    expect(() => injecterManifeste(`'${MARQUEUR}' + '${MARQUEUR}'`, M1)).toThrow('2 marqueur');
  });

  it('empreinte : la même au build (Node) et dans le service worker (SubtleCrypto)', async () => {
    const contenu = 'carte du monde é';
    expect(await empreinte(new TextEncoder().encode(contenu).buffer as ArrayBuffer)).toBe(empreinteNode(contenu));
  });

  it('sw.ts : un seul marqueur, rien d’importé que logique.ts (sw.js d’un seul tenant), aucun export', () => {
    const src = readFileSync('src/sw/sw.ts', 'utf8');
    expect(src.split(`'${MARQUEUR}'`).length).toBe(2);
    expect([...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1])).toEqual(['./logique']);
    expect(src).not.toMatch(/^export /m);
    for (const f of ['src/sw/logique.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/^import /m);
  });

  it('serveur de développement : le service worker servi à /sw.js se retire et n’efface que les caches du site', () => {
    expect(SW_DE_RETRAIT).toContain(`startsWith('${PREFIXE_CACHE}')`);
    expect(SW_DE_RETRAIT).toContain('registration.unregister()');
    expect(SW_DE_RETRAIT).toContain('skipWaiting()');
  });
});

describe('service worker : la page et l’hébergement', () => {
  it('voulu en production sur le site seulement : ni dans l’APK, ni en développement, ni hors contexte sûr (http://<ip>)', () => {
    const base = { prod: true, apk: false, avecSw: true, contexteSur: true };
    expect(page.swVoulu(base)).toBe(true);
    expect(page.swVoulu({ ...base, apk: true })).toBe(false);
    expect(page.swVoulu({ ...base, prod: false })).toBe(false);
    expect(page.swVoulu({ ...base, avecSw: false })).toBe(false);
    expect(page.swVoulu({ ...base, contexteSur: false })).toBe(false);
  });

  it('messages : les mêmes des deux côtés (copies, aucun module partagé)', () => {
    expect(page.MESSAGE_ACTIVER).toBe(MESSAGE_ACTIVER);
    expect(page.MESSAGE_CHARGES).toBe(MESSAGE_CHARGES);
    expect(readFileSync('src/sw/enregistrer.ts', 'utf8')).not.toContain("from './logique'");
  });

  it('ce que la page a chargé : de son origine seulement', () => {
    expect(page.chargesDeLaPage(`${ORIGINE}/#jouer`, [`${ORIGINE}/geo/pays.json`, 'https://firestore.googleapis.com/x', 'data:,x'], ORIGINE)).toEqual([
      `${ORIGINE}/#jouer`,
      `${ORIGINE}/geo/pays.json`,
    ]);
  });

  it('main.ts : la relève au tout début, l’enregistrement après le premier affichage', () => {
    const src = readFileSync('src/main.ts', 'utf8');
    expect(src.indexOf('prendreMiseAJour();')).toBeGreaterThan(0);
    expect(src.indexOf('prendreMiseAJour();')).toBeLessThan(src.indexOf('async function demarrer'));
    expect(src.indexOf('enregistrerServiceWorker();')).toBeGreaterThan(src.indexOf("document.body.dataset.repos = '1';"));
  });

  it('firebase.json : /sw.js toujours revalidé (no-cache)', () => {
    const h = (JSON.parse(readFileSync('firebase.json', 'utf8')) as { hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] } }).hosting.headers;
    expect(h.find((x) => x.source === '/sw.js')?.headers).toEqual([{ key: 'Cache-Control', value: 'no-cache' }]);
  });

  it('index.html pré-charge des fichiers de public/geo/ ; la carte allégée du premier affichage existe et est bien lue par donnees.ts', () => {
    const geo = referencesDe(readFileSync('index.html', 'utf8')).filter((c) => c.startsWith('/geo/'));
    expect(geo.length).toBeGreaterThanOrEqual(4);
    for (const c of [...geo, ...EN_PLUS_PREMIERE_VISITE]) expect(existsSync(`public${c}`), c).toBe(true);
    expect(readFileSync('src/map/donnees.ts', 'utf8')).toContain("'monde-leger.topo.json'");
  });
});

describe('service worker : le sw.js d’un vrai build', () => {
  let sortie = '';
  let code = '';
  let m: Manifeste;
  beforeAll(() => {
    sortie = mkdtempSync(join(tmpdir(), 'terramemo-sw-'));
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', sortie, '--emptyOutDir', '--logLevel', 'error'], { stdio: 'pipe' });
    code = readFileSync(join(sortie, 'sw.js'), 'utf8');
    const litteral = /JSON\.parse\(("(?:[^"\\]|\\.)*")\)/.exec(code);
    m = JSON.parse(JSON.parse(litteral![1]!) as string) as Manifeste;
  }, 120_000);
  afterAll(() => {
    if (sortie) rmSync(sortie, { recursive: true, force: true });
  });

  it('un script classique : ni import ni export, le manifeste injecté', () => {
    expect(code).not.toContain(MARQUEUR);
    expect(code).not.toMatch(/(^|[;}\s])(import|export)\s*[{*"'(]/);
    expect(code).toContain('addEventListener');
  });

  it('manifeste : chaque fichier du build à sa vraie empreinte, la coquille et la carte du premier affichage pré-chargées, aucun drapeau', () => {
    const index = readFileSync(join(sortie, 'index.html'));
    expect(m.empreintes['/']).toBe(empreinteNode(index));
    for (const c of ['/geo/pays.json', '/geo/drapeaux.json', '/licences-tierces.txt', '/confidentialite.html']) {
      expect(m.empreintes[c], c).toBe(empreinteNode(readFileSync(join(sortie, c.slice(1)))));
    }
    expect(m.empreintes['/sw.js']).toBeUndefined();
    const script = /<script type="module" crossorigin src="([^"]+)"/.exec(index.toString())![1]!;
    expect(m.prechargees).toEqual(expect.arrayContaining(['/', script, '/geo/monde.topo.json', '/geo/pays.json', '/geo/contestees.json', '/geo/noms.fr.json', '/geo/monde-leger.topo.json', '/vendor/inter/InterVariable.woff2']));
    expect(m.prechargees.filter((c) => /drapeaux|capitales|reunion|mers|worker/.test(c))).toEqual([]);
    expect(m.version).toMatch(/^[0-9a-f]{16}$/);
  });
});
