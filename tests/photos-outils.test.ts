// Outils réseau des photos (#34, lot P1 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3.1 et § 3.2) : le client (geodata/photos/reseau.mjs : une requête à la fois, attente
// sur 429, erreurs jamais en cache, durée de vie) et la lecture de Commons
// (geodata/photos/commons.mjs : suites, fichiers absents ou non décrits). Sans réseau :
// fetch et l'attente sont factices.
import { mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// --- Client réseau --------------------------------------------------------------------

type Client = {
  json: (url: string, o?: { vie?: number; essais?: number }) => Promise<unknown>;
  commons: (p: Record<string, string>, o?: { vie?: number }) => Promise<unknown>;
  luLe: (x: unknown) => string | null;
  stats: { cache: number; reseau: number; perimees: number };
};
type Reseau = {
  client: (o: { cache: string; pause?: number; fetch: (u: string) => Promise<Response>; dormir: (ms: number) => Promise<void>; frais?: boolean }) => Client;
  DelaiDepasse: new (m: string) => Error;
};
const reseau = import('../geodata/photos/reseau.mjs' as string) as Promise<Reseau>;
const dossiers: string[] = [];
const cacheVide = () => {
  const d = mkdtempSync(join(tmpdir(), 'terramemo-photos-'));
  dossiers.push(d);
  return d;
};
afterAll(() => {
  for (const d of dossiers) rmSync(d, { recursive: true, force: true });
});
const fichiersDu = (d: string) => readdirSync(d, { recursive: true }).map(String).filter((f) => f.endsWith('.json'));
const rep = (corps: unknown, status = 200, entetes: Record<string, string> = {}) => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status, headers: entetes });

/** Un fetch factice qui rend les réponses dans l'ordre, et compte les appels en cours. */
function faux(reponses: (() => Response)[]) {
  const appels: string[] = [];
  let enCours = 0;
  let maxEnCours = 0;
  const f = async (u: string) => {
    appels.push(u);
    enCours++;
    maxEnCours = Math.max(maxEnCours, enCours);
    await new Promise((r) => setTimeout(r, 2));
    enCours--;
    const r = reponses.shift();
    if (!r) throw new Error('plus de réponse');
    return r();
  };
  return { f, appels, max: () => maxEnCours };
}

describe('client réseau (reseau.mjs)', () => {
  it('une requête à la fois, puis le cache ; la date de lecture suit chaque réponse', async () => {
    const { client } = await reseau;
    const d = cacheVide();
    const x = faux([() => rep({ a: 1 }), () => rep({ a: 2 }), () => rep({ a: 3 })]);
    const c = client({ cache: d, pause: 0, fetch: x.f, dormir: async () => {} });
    const r = await Promise.all(['u1', 'u2', 'u3'].map((u) => c.json(`https://x/${u}`)));
    expect(r).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(x.max()).toBe(1);
    expect(await c.json('https://x/u2')).toEqual({ a: 2 });
    expect(x.appels).toHaveLength(3);
    expect(c.stats).toMatchObject({ cache: 1, reseau: 3 });
    expect(c.luLe(r[0])).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });

  it('429 : attend au moins 65 s, puis réussit ; rien en cache avant le succès', async () => {
    const { client } = await reseau;
    const d = cacheVide();
    const attentes: number[] = [];
    const x = faux([() => rep('trop', 429, { 'retry-after': '30' }), () => rep({ ok: true })]);
    const c = client({ cache: d, pause: 0, fetch: x.f, dormir: async (ms) => void attentes.push(ms) });
    expect(await c.json('https://x/a')).toEqual({ ok: true });
    expect(Math.max(...attentes)).toBeGreaterThanOrEqual(65_000);
    expect(fichiersDu(d)).toHaveLength(1);
  });

  it('une erreur de MediaWiki (statut 200, clé error) n’est jamais mise en cache : passagère, retentée ; sinon remonte', async () => {
    const { client } = await reseau;
    const d = cacheVide();
    const x = faux([() => rep({ error: { code: 'ratelimited', info: 'trop vite' } }), () => rep({ query: { pages: [] } })]);
    const c = client({ cache: d, pause: 0, fetch: x.f, dormir: async () => {} });
    expect(await c.json('https://x/b')).toEqual({ query: { pages: [] } });
    expect(x.appels).toHaveLength(2);
    const d2 = cacheVide();
    const y = faux([() => rep({ error: { code: 'toomanyvalues', info: 'trop de titres' } })]);
    const c2 = client({ cache: d2, pause: 0, fetch: y.f, dormir: async () => {} });
    await expect(c2.json('https://x/c')).rejects.toThrow(/toomanyvalues/);
    expect(fichiersDu(d2)).toHaveLength(0);
  });

  it('500 TimeoutException du point SPARQL, deux fois : DelaiDepasse, et rien en cache', async () => {
    const { client, DelaiDepasse } = await reseau;
    const d = cacheVide();
    const x = faux([() => rep('java.util.concurrent.TimeoutException', 500), () => rep('java.util.concurrent.TimeoutException', 500)]);
    const c = client({ cache: d, pause: 0, fetch: x.f, dormir: async () => {} });
    await expect(c.json('https://x/s')).rejects.toBeInstanceOf(DelaiDepasse);
    expect(fichiersDu(d)).toHaveLength(0);
  });

  it('durée de vie : une réponse plus vieille est relue, et datée du jour', async () => {
    const { client } = await reseau;
    const d = cacheVide();
    const x = faux([() => rep({ v: 'vieille' }), () => rep({ v: 'neuve' })]);
    const c = client({ cache: d, pause: 0, fetch: x.f, dormir: async () => {} });
    await c.json('https://x/i');
    const [f] = fichiersDu(d);
    const ilYa40Jours = new Date(Date.now() - 40 * 86400_000);
    utimesSync(join(d, f!), ilYa40Jours, ilYa40Jours);
    const c2 = client({ cache: d, pause: 0, fetch: x.f, dormir: async () => {} });
    const vieille = await c2.json('https://x/i');
    expect(vieille).toEqual({ v: 'vieille' });
    expect(Date.parse(c2.luLe(vieille)!)).toBeLessThan(Date.now() - 39 * 86400_000);
    const neuve = await c2.json('https://x/i', { vie: 30 * 86400_000 });
    expect(neuve).toEqual({ v: 'neuve' });
    expect(c2.stats.perimees).toBe(1);
    expect(Date.parse(c2.luLe(neuve)!)).toBeGreaterThan(Date.now() - 60_000);
  });
});

// --- Lecture de Commons ---------------------------------------------------------------

type Commons = { lireFichiers: (r: Client, f: string[], o?: { vie?: number }) => Promise<Map<string, { categories: string[]; w: number; lu_le: string | null } | null>> };
const commons = import('../geodata/photos/commons.mjs' as string) as Promise<Commons>;

describe('lecture de Commons (commons.mjs)', () => {
  it('suit « continue » pour les catégories, garde l’imageinfo, range absents et non décrits à part', async () => {
    const { client } = await reseau;
    const { lireFichiers } = await commons;
    const ii = { width: 4000, height: 3000, mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/x.jpg', extmetadata: { LicenseShortName: { value: 'CC0' } } };
    const x = faux([
      () =>
        rep({
          continue: { clcontinue: '123|Foo', continue: '||imageinfo' },
          query: {
            normalized: [{ from: 'File:a b.jpg', to: 'File:A b.jpg' }],
            pages: [
              { title: 'File:A b.jpg', imageinfo: [ii], categories: [{ title: 'Category:Port of Royan' }] },
              { title: 'File:Absent.jpg', missing: true },
              { title: 'File:Muet.jpg' },
            ],
          },
        }),
      () => rep({ batchcomplete: true, query: { pages: [{ title: 'File:A b.jpg', categories: [{ title: 'Category:NoFoP-France' }] }, { title: 'File:Absent.jpg', missing: true }, { title: 'File:Muet.jpg' }] } }),
    ]);
    const c = client({ cache: cacheVide(), pause: 0, fetch: x.f, dormir: async () => {} });
    const m = await lireFichiers(c, ['a b.jpg', 'Absent.jpg', 'Muet.jpg']);
    expect(x.appels).toHaveLength(2);
    expect(x.appels[1]).toContain('clcontinue=123');
    expect(x.appels[0]).toContain('prop=imageinfo%7Ccategories');
    expect(m.get('a b.jpg')).toMatchObject({ w: 4000, categories: ['Port of Royan', 'NoFoP-France'] });
    expect(m.get('A b.jpg')).toBe(m.get('a b.jpg'));
    expect(m.get('a b.jpg')!.lu_le).toMatch(/Z$/);
    expect(m.get('Absent.jpg')).toBeNull();
    // Ni décrit ni absent : à compléter, pas refusé.
    expect(m.has('Muet.jpg')).toBe(false);
  });
});
