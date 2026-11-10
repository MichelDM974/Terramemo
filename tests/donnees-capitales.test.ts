import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoContains, geoDistance } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { ENCLAVES } from '../src/map/acceptes';
import { normaliser } from '../src/texte';
import { textes } from '../src/vues/textes';

// Capitales des pays (étude J2, § 2.1 ; geodata/capitales.mjs, lot 1) : tests sans réseau
// sur les fichiers versionnés, l'extrait Wikidata figé et la table à la main.

type Role = 'officielle' | 'siege' | 'economique';

interface Capitale {
  q: string;
  lon: number;
  lat: number;
  role: Role;
  p?: 1;
  e?: 1;
}

interface Ligne {
  pays: string;
  c: Capitale[];
  m?: 1;
  x?: string[];
}

interface Mesure {
  wikipedias: number;
  rang_wikipedias: number;
  vues_fr: number;
  rang_vues: number;
}

interface Main {
  pays: Record<string, { source: string }>;
  noms: Record<string, { nom: string; source: string }>;
  alias: Record<string, { alias: string[]; source: string }>;
  points: Record<string, { lon: number; lat: number; source: string }>;
  non_retenues: Record<string, { pays: string; nom: string; source: string }>;
  meme_nom: Record<string, string>;
  sans_leurre: Record<string, { x: string[]; source: string }>;
  epreuve: Record<string, { q: string; mesures: Record<string, Mesure>; source: string }>;
  items_pays: Record<string, { q: string; source: string }>;
  doublons: Record<string, string>;
}

interface SourceWikidata {
  url: string;
  licence: string;
  telecharge_le: string;
  requetes: { chemin: string; sha256: string };
  fichiers: { chemin: string; sha256: string }[];
}

interface Sources {
  sources: { url: string }[];
  traitement: { entrees: Record<string, string> };
}

type Props = { id: string };

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const empreinte = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

const texteCapitales = readFileSync('public/geo/capitales.json', 'utf8');
const texteFr = readFileSync('public/geo/capitales.fr.json', 'utf8');
const capitales = JSON.parse(texteCapitales) as Ligne[];
const { noms, alias } = JSON.parse(texteFr) as { noms: Record<string, string>; alias: Record<string, string[]> };
const main = lire<Main>('geodata/capitales-main.json');
const extrait = lire<{ extrait_le: string; date: string; requetes_sha256: string }>('geodata/wikidata/capitales.json');
const sources = lire<Sources>('public/geo/sources.json');
const pays = lire<{ id: string; statut: string; revendique_par?: string[] }[]>('public/geo/pays.json');
const nomsPays = lire<Record<string, string>>('public/geo/noms.fr.json');
const contestees = lire<{ id: string; dans: string[]; revendique_par: string[] }[]>('public/geo/contestees.json');

const parPays = new Map(capitales.map((l) => [l.pays, l]));
const nomsDe = (id: string) => (parPays.get(id)?.c ?? []).map((c) => noms[c.q]);
const toutes = capitales.flatMap((l) => l.c.map((c) => ({ ...c, pays: l.pays })));

// Les 12 pays à plusieurs réponses, figés (§ 2.1) : un changement de l'extrait ou de la table se voit.
const MULTIPLES: Record<string, string[]> = {
  BDI: ['Gitega', 'Bujumbura'],
  BEN: ['Porto-Novo', 'Cotonou'],
  BOL: ['Sucre', 'La Paz'],
  CIV: ['Yamoussoukro', 'Abidjan'],
  GNQ: ['Ciudad de la Paz', 'Malabo'],
  LKA: ['Sri Jayawardenapura Kotte', 'Colombo'],
  MYS: ['Kuala Lumpur', 'Putrajaya'],
  NLD: ['Amsterdam', 'La Haye'],
  PSE: ['Jérusalem-Est', 'Ramallah'],
  SWZ: ['Mbabane', 'Lobamba'],
  YEM: ['Sanaa', 'Aden'],
  ZAF: ['Pretoria', 'Le Cap', 'Bloemfontein'],
};

// D38 d : la capitale montrée en épreuve, la plus connue (Palestine : la principale), figée.
const EPREUVE: Record<string, string> = {
  BDI: 'Bujumbura',
  BEN: 'Porto-Novo',
  BOL: 'La Paz',
  CIV: 'Abidjan',
  GNQ: 'Malabo',
  LKA: 'Colombo',
  MYS: 'Kuala Lumpur',
  NLD: 'Amsterdam',
  PSE: 'Jérusalem-Est',
  SWZ: 'Mbabane',
  YEM: 'Sanaa',
  ZAF: 'Le Cap',
};

// D37 : les 9 pays dont la capitale porte le nom.
const MEME_NOM = ['DJI', 'GTM', 'KWT', 'LUX', 'MCO', 'PAN', 'SGP', 'SMR', 'VAT'];

describe('capitales (public/geo/capitales.json)', () => {
  it('197 entrées : les 195 jouables, le Kosovo et Taïwan, dans l’ordre de pays.json', () => {
    const jeu = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel').map((p) => p.id);
    expect(capitales.map((l) => l.pays)).toEqual(jeu);
    expect(capitales).toHaveLength(197);
    for (const id of ['XKX', 'TWN']) expect(parPays.has(id), id).toBe(true);
  });

  it('une principale officielle par pays, en tête ; des rôles connus ; 210 capitales justes (200 officielles, 9 sièges, 1 économique)', () => {
    for (const l of capitales) {
      expect(l.c.filter((c) => c.p).length, l.pays).toBe(1);
      expect(l.c[0]?.p, l.pays).toBe(1);
      expect(l.c[0]?.role, l.pays).toBe('officielle');
      for (const c of l.c) {
        expect(['officielle', 'siege', 'economique'], `${l.pays} ${c.q}`).toContain(c.role);
        expect(Object.keys(c).filter((k) => !['q', 'lon', 'lat', 'role', 'p', 'e'].includes(k)), c.q).toEqual([]);
      }
    }
    const roles: Record<string, number> = {};
    for (const c of toutes) roles[c.role] = (roles[c.role] ?? 0) + 1;
    expect(toutes).toHaveLength(210);
    expect(roles).toEqual({ officielle: 200, siege: 9, economique: 1 });
  });

  it('des items Wikidata bien formés, chacun dans un seul pays, et un nom non vide pour chacun', () => {
    for (const c of toutes) expect(c.q).toMatch(/^Q[1-9]\d*$/);
    expect(new Set(toutes.map((c) => c.q)).size).toBe(toutes.length);
    expect(Object.keys(noms).sort()).toEqual(toutes.map((c) => c.q).sort());
    for (const c of toutes) {
      expect(noms[c.q]?.trim(), c.q).toBeTruthy();
      expect(noms[c.q]?.[0], c.q).toBe(noms[c.q]?.[0]?.toLocaleUpperCase('fr'));
    }
    for (const [q, a] of Object.entries(alias)) {
      expect(noms[q], q).toBeDefined();
      expect(a.length, q).toBeGreaterThan(0);
      for (const x of a) expect(x.trim(), q).toBeTruthy();
    }
  });

  it('les 12 pays à plusieurs réponses, figés', () => {
    const multiples = Object.fromEntries(capitales.filter((l) => l.c.length > 1).map((l) => [l.pays, nomsDe(l.pays)]));
    expect(multiples).toEqual(MULTIPLES);
  });

  it('une capitale d’épreuve par pays : la principale quand il n’y en a qu’une, la plus connue sinon (D38 d), Palestine : la principale', () => {
    for (const l of capitales) {
      expect(l.c.filter((c) => c.e).length, l.pays).toBe(1);
      if (l.c.length === 1) expect(l.c[0]?.e, l.pays).toBe(1);
    }
    const epreuve = Object.fromEntries(capitales.filter((l) => l.c.length > 1).map((l) => [l.pays, noms[l.c.find((c) => c.e)!.q]]));
    expect(epreuve).toEqual(EPREUVE);
    // La règle, refaite sur les mesures figées dans la table : le plus petit rang combiné
    // (moyenne du rang par Wikipédias et du rang par vues), à égalité la principale.
    expect(Object.keys(main.epreuve).sort()).toEqual(Object.keys(MULTIPLES));
    for (const [id, t] of Object.entries(main.epreuve)) {
      const l = parPays.get(id)!;
      expect(l.c.find((c) => c.e)?.q, id).toBe(t.q);
      expect(Object.keys(t.mesures).sort(), id).toEqual(l.c.map((c) => c.q).sort());
      for (const m of Object.values(t.mesures)) {
        for (const r of [m.rang_wikipedias, m.rang_vues]) expect(r >= 1 && r <= 205, id).toBe(true);
      }
      const combine = (c: Capitale) => (t.mesures[c.q]!.rang_wikipedias + t.mesures[c.q]!.rang_vues) / 2;
      const plusConnue = [...l.c].sort((a, b) => combine(a) - combine(b) || (b.p ?? 0) - (a.p ?? 0))[0]!;
      const principale = l.c.find((c) => c.p)!;
      expect(t.q, id).toBe(id === 'PSE' ? principale.q : plusConnue.q);
      expect(t.source, id).toMatch(/^D38 d : /);
    }
    // La Palestine montre bien la principale alors que Ramallah est plus connue.
    const pse = main.epreuve.PSE!;
    expect(pse.mesures.Q158119!.rang_wikipedias + pse.mesures.Q158119!.rang_vues).toBeLessThan(
      pse.mesures.Q212938!.rang_wikipedias + pse.mesures.Q212938!.rang_vues,
    );
  });

  it('Israël : Jérusalem seule ; Palestine : Jérusalem-Est (principale) et Ramallah ; jamais l’une en leurre de l’autre', () => {
    expect(nomsDe('ISR')).toEqual(['Jérusalem']);
    expect(nomsDe('PSE')).toEqual(['Jérusalem-Est', 'Ramallah']);
    expect(parPays.get('PSE')?.c.map((c) => c.role)).toEqual(['officielle', 'siege']);
    expect(parPays.get('ISR')?.x).toEqual(['PSE']);
    expect(parPays.get('PSE')?.x).toEqual(['ISR']);
    expect(capitales.filter((l) => l.x).map((l) => l.pays)).toEqual(['ISR', 'PSE']);
  });

  it('Jérusalem et Jérusalem-Est à deux points distincts ; aucune capitale au point d’une autre', () => {
    const jer = parPays.get('ISR')!.c[0]!;
    const est = parPays.get('PSE')!.c[0]!;
    expect([jer.lon, jer.lat]).not.toEqual([est.lon, est.lat]);
    expect(geoDistance([jer.lon, jer.lat], [est.lon, est.lat]) * 6371).toBeGreaterThan(0.3);
    const points = toutes.map((c) => `${c.lon},${c.lat}`);
    expect(new Set(points).size).toBe(points.length);
  });

  it('coordonnées à 2 décimales, sauf un point de la table (Jérusalem-Est), gardé tel quel', () => {
    for (const c of toutes) {
      const pt = main.points[c.q];
      if (pt) expect([c.lon, c.lat], c.q).toEqual([pt.lon, pt.lat]);
      else expect([Number(c.lon.toFixed(2)), Number(c.lat.toFixed(2))], c.q).toEqual([c.lon, c.lat]);
      expect(Math.abs(c.lon) <= 180 && Math.abs(c.lat) <= 90, c.q).toBe(true);
    }
    expect(Object.keys(main.points)).toEqual(['Q212938']);
  });

  it('les 9 pays au nom de leur capitale (D37), marqués m', () => {
    expect(capitales.filter((l) => l.m).map((l) => l.pays)).toEqual(MEME_NOM);
    for (const id of MEME_NOM) {
      const n = normaliser(noms[parPays.get(id)!.c[0]!.q]!);
      const np = normaliser(nomsPays[id]!);
      // Le Vatican : « Cité du Vatican », dans « État de la Cité du Vatican ».
      if (id === 'VAT') expect(np.endsWith(n), id).toBe(true);
      else expect(n, id).toBe(np);
    }
    // Aucune autre capitale au nom de son pays (Tunis, Alger, Mexico restent des questions).
    for (const l of capitales.filter((x) => !x.m)) {
      for (const c of l.c) expect(normaliser(noms[c.q]!), l.pays).not.toBe(normaliser(nomsPays[l.pays]!));
    }
  });

  it('aucun homonyme exact entre pays ; aucun alias égal au nom d’une autre capitale ni à son propre nom', () => {
    const parNom = new Map<string, Set<string>>();
    for (const c of toutes) {
      const n = normaliser(noms[c.q]!);
      parNom.set(n, (parNom.get(n) ?? new Set()).add(c.pays));
    }
    expect([...parNom].filter(([, p]) => p.size > 1).map(([n]) => n)).toEqual([]);
    for (const [q, a] of Object.entries(alias)) {
      for (const x of a) {
        const n = normaliser(x);
        expect(n, `${q} ${x}`).not.toBe(normaliser(noms[q]!));
        const autres = toutes.filter((c) => c.q !== q && normaliser(noms[c.q]!) === n);
        expect(autres.map((c) => c.q), `${q} ${x}`).toEqual([]);
      }
    }
  });

  it('cas de D36 (défauts) et corrections de Wikidata', () => {
    const role = (id: string, nom: string) => parPays.get(id)?.c.find((c) => noms[c.q] === nom)?.role;
    expect(role('BDI', 'Bujumbura')).toBe('economique'); // a
    expect(nomsDe('TZA')).toEqual(['Dodoma']); // b
    expect(parPays.get('GNQ')?.c.map((c) => [noms[c.q], c.role, c.p ?? 0])).toEqual([
      ['Ciudad de la Paz', 'officielle', 1],
      ['Malabo', 'siege', 0],
    ]); // c
    expect(nomsDe('CHL')).toEqual(['Santiago']); // d
    expect(nomsDe('UKR')).toEqual(['Kiev']); // e
    expect(alias[parPays.get('UKR')!.c[0]!.q]).toContain('Kyiv');
    for (const [id, nom] of [
      ['IDN', 'Jakarta'],
      ['EGY', 'Le Caire'],
      ['MMR', 'Naypyidaw'],
      ['NRU', 'Yaren'],
      ['CHE', 'Berne'],
      ['KIR', 'Tarawa-Sud'],
      ['MNE', 'Podgorica'],
      ['HND', 'Tegucigalpa'],
      ['NIC', 'Managua'],
      ['NOR', 'Oslo'],
    ] as const) {
      expect(nomsDe(id), id).toEqual([nom]); // f, g, j et corrections
    }
    expect(alias[parPays.get('KIR')!.c[0]!.q]).toContain('Tarawa');
    expect(alias[parPays.get('HND')!.c[0]!.q]).toContain('Comayagüela');
    expect(parPays.get('NIC')?.c[0]?.q).toBe('Q3274');
    expect(noms[parPays.get('BOL')!.c.find((c) => c.p)!.q]).toBe('Sucre'); // h
    // Les capitales écartées (Natural Earth, D36) ne sont nulle part.
    for (const [q, n] of Object.entries(main.non_retenues)) {
      expect(toutes.some((c) => c.q === q), n.nom).toBe(false);
      expect(Object.values(noms).map(normaliser), n.nom).not.toContain(normaliser(n.nom));
    }
    // Usage français, graphies étrangères en alias.
    for (const [nom, a] of [
      ['Pékin', 'Beijing'],
      ['Dacca', 'Dhaka'],
    ] as const) {
      const c = toutes.find((x) => noms[x.q] === nom);
      expect(c, nom).toBeDefined();
      expect(alias[c!.q], nom).toContain(a);
    }
    for (const nom of ['Moscou', 'Le Caire', 'Asuncion', 'Bogota', 'Chișinău', 'Guatemala']) expect(Object.values(noms), nom).toContain(nom);
  });
});

describe('S38 : chaque capitale dans son pays ou près de lui (monde.topo.json)', () => {
  const topo = lire<Topology<{ pays: GeometryCollection<Props>; contestees: GeometryCollection<Props> }>>('public/geo/monde.topo.json');
  const formes = new Map(feature(topo, topo.objects.pays).features.map((f) => [f.properties.id, f]));
  const formesZ = new Map(feature(topo, topo.objects.contestees).features.map((f) => [f.properties.id, f]));
  const polys = (g: Geometry | null): Position[][][] =>
    !g ? [] : g.type === 'Polygon' ? [(g as Polygon).coordinates] : g.type === 'MultiPolygon' ? (g as MultiPolygon).coordinates : [];

  /** Distance (km) du point au bord de la forme (segments en plan local, comme tests/donnees.test.ts). */
  function distanceBordKm(f: Feature<Geometry | null, Props>, [x, y]: [number, number]): number {
    const k = Math.cos((y * Math.PI) / 180);
    const dlon = (lon: number) => (((lon - x + 540) % 360) - 180) * k;
    let min = Infinity;
    for (const p of polys(f.geometry))
      for (const r of p)
        for (let i = 1; i < r.length; i++) {
          const [a, b] = [r[i - 1] as [number, number], r[i] as [number, number]];
          const ax = dlon(a[0]);
          const ay = a[1] - y;
          const dx = dlon(b[0]) - ax;
          const dy = b[1] - y - ay;
          const l = dx * dx + dy * dy;
          const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
          min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
        }
    return ((min * Math.PI) / 180) * 6371.0088;
  }

  /**
   * Le tracé du pays et ses zones admises (décision « Zones contestées et enclaves »,
   * src/map/acceptes.ts) : zones hachurées qu'il tient ou revendique, entités qu'il
   * revendique, enclaves qu'il entoure.
   */
  function zones(id: string): Feature<Geometry, Props>[] {
    const ids = [
      ...contestees.filter((z) => z.dans.includes(id) || z.revendique_par.includes(id)).map((z) => formesZ.get(z.id)),
      ...pays.filter((p) => p.revendique_par?.includes(id)).map((p) => formes.get(p.id)),
      ...Object.entries(ENCLAVES)
        .filter(([, hote]) => hote === id)
        .map(([e]) => formes.get(e)),
    ];
    return [formes.get(id), ...ids].filter((f): f is Feature<Geometry, Props> => Boolean(f));
  }

  // Seuil mesuré le 11/11/2026 : 9,05 km au plus (Funafuti, atoll réduit par la
  // simplification à 2 km), puis Tarawa-Sud 7,7 km et Nukuʻalofa 3,8 km. L'étude
  // proposait 25 km ; 10 km suffit, sans exception, et attrape mieux une capitale
  // rattachée au mauvais pays.
  const SEUIL_KM = 10;

  it(`à moins de ${SEUIL_KM} km du tracé de son pays ou d’une de ses zones admises`, () => {
    const loin: string[] = [];
    let max = 0;
    for (const c of toutes) {
      const pt: [number, number] = [c.lon, c.lat];
      const z = zones(c.pays);
      expect(z.length, c.pays).toBeGreaterThan(0);
      const d = z.some((f) => geoContains(f, pt)) ? 0 : Math.min(...z.map((f) => distanceBordKm(f, pt)));
      max = Math.max(max, d);
      if (d > SEUIL_KM) loin.push(`${c.pays} ${noms[c.q]} ${d.toFixed(1)} km`);
    }
    expect(loin).toEqual([]);
    expect(max).toBeGreaterThan(5); // le seuil reste près de ce qu'il mesure
  });

  it('hors de son tracé et de ses zones admises, une capitale ne tombe dans aucun autre pays, sauf la Cité du Vatican (à 2 décimales, 400 m dans Rome)', () => {
    const jouables = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel').map((p) => p.id);
    const chez: string[] = [];
    for (const c of toutes) {
      const pt: [number, number] = [c.lon, c.lat];
      // Jérusalem-Est est dans le tracé d'Israël, mais dans une zone admise de la Palestine.
      if (zones(c.pays).some((f) => geoContains(f, pt))) continue;
      const autres = jouables.filter((id) => id !== c.pays && geoContains(formes.get(id)!, pt));
      if (autres.length) chez.push(`${c.pays} ${noms[c.q]} → ${autres.join(',')}`);
    }
    expect(chez).toEqual(['VAT Cité du Vatican → ITA']);
  });

  it('Jérusalem-Est tombe dans le tracé d’Israël, dans la zone NE_B98 que revendique la Palestine (zone admise)', () => {
    const est = parPays.get('PSE')!.c[0]!;
    const pt: [number, number] = [est.lon, est.lat];
    expect(geoContains(formes.get('ISR')!, pt)).toBe(true);
    expect(geoContains(formesZ.get('NE_B98')!, pt)).toBe(true);
    expect(contestees.find((z) => z.id === 'NE_B98')?.revendique_par).toContain('PSE');
  });
});

describe('fichiers, sources et reproduction', () => {
  it('les deux fichiers ≤ 6 000 octets compressés (gzip)', () => {
    expect(gzipSync(texteCapitales).length).toBeLessThanOrEqual(6000);
    expect(gzipSync(texteFr).length).toBeLessThanOrEqual(6000);
  });

  it('source Wikidata : CC0, extrait daté, empreintes de l’extrait et des requêtes égales aux fichiers', () => {
    const s = sources.sources.find((x) => x.url === 'https://www.wikidata.org') as SourceWikidata | undefined;
    if (!s) throw new Error('source Wikidata absente de sources.json');
    expect(s.licence).toContain('CC0');
    expect(s.telecharge_le).toBe(extrait.date);
    expect(s.requetes).toEqual({ chemin: 'geodata/wikidata/requetes.rq', sha256: empreinte('geodata/wikidata/requetes.rq') });
    expect(extrait.requetes_sha256).toBe(s.requetes.sha256);
    expect(s.fichiers).toEqual([{ chemin: 'geodata/wikidata/capitales.json', sha256: empreinte('geodata/wikidata/capitales.json') }]);
    for (const f of ['geodata/capitales.mjs', 'geodata/capitales-main.json']) expect(sources.traitement.entrees[f], f).toBe(empreinte(f));
  });

  it('crédits : Wikidata, CC0, à la date de l’extrait', () => {
    const w = textes.credits.donnees.find((c) => c.nom === 'Wikidata');
    if (!w) throw new Error('Wikidata absente des crédits');
    const [a, m, j] = extrait.date.split('-');
    expect(w.detail).toBe(`Capitales et notoriété des lieux · extrait du ${j}/${m}/${a}`);
    expect(w.licence).toContain('CC0');
  });

  it('table à la main : une source par ligne', () => {
    for (const section of ['items_pays', 'pays', 'noms', 'alias', 'points', 'non_retenues', 'sans_leurre', 'epreuve'] as const) {
      for (const [k, v] of Object.entries(main[section])) expect((v as { source: string }).source, `${section} ${k}`).toMatch(/\S{3}/);
    }
    for (const section of ['meme_nom', 'doublons'] as const) for (const [k, v] of Object.entries(main[section])) expect(v, `${section} ${k}`).toMatch(/\S{3}/);
  });

  it('reproduction : construireCapitales (npm run geodata -- --seulement capitales) redonne les fichiers commités et sources.json', async () => {
    type Resultat = { fichiers: Record<string, string>; source: unknown; entrees: Record<string, string>; notes: string[] };
    // Import dynamique sans types : le module est en JavaScript, sans déclaration.
    const m = (await import('../geodata/capitales.mjs' as string)) as {
      construireCapitales: (racine: string) => Promise<Resultat>;
      fusionnerSources: (s: Sources, c: Resultat) => Sources;
    };
    const r = await m.construireCapitales('.');
    expect(r.fichiers['capitales.json']).toBe(texteCapitales);
    expect(r.fichiers['capitales.fr.json']).toBe(texteFr);
    expect(JSON.stringify(m.fusionnerSources(sources, r), null, 2) + '\n').toBe(readFileSync('public/geo/sources.json', 'utf8'));
    // Aucune ligne inutile dans la table (un nom déjà égal au libellé de Wikidata).
    expect(r.notes.filter((n) => n.includes('ligne inutile'))).toEqual([]);
  });
});
