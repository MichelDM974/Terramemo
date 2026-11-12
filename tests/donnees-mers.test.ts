import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoArea, geoContains } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';

// Océans et mers (étude J2, § 2.3 ; geodata/mers.mjs, lot 3a) : tests sur les fichiers
// versionnés. La reproduction du build, depuis la couche de Natural Earth, ne tourne que
// là où geodata/raw/ l'a (pas en CI, sans réseau).

interface Mer {
  id: string;
  sorte: string;
  parents: string[];
  interieure: boolean;
  bassin: string;
  enclavee?: true;
  x?: string[];
  superficie_km2: number;
  point: [number, number];
  bbox: [number, number, number, number];
  voisins: string[];
}

interface ZoneTable {
  id: string;
  nom: string;
  sorte: string;
  parents: string[];
  interieure?: true;
  enclavee?: true;
  bassin?: string;
  q: string;
  ne: string[];
  alias?: string[];
  x?: string[];
}

interface Table {
  zones: ZoneTable[];
  forcees: Record<string, { id: string; raison: string; sortie?: true }>;
  exclues: Record<string, string>;
}

interface Affectation {
  ne_id: number;
  nom: string;
  cla: string;
  km2: number;
  id: string | null;
  mode: 'retenue' | 'forcée' | 'auto' | 'exclue';
  via?: string;
  bord_km?: number;
}

interface ZoneNe {
  nom: string;
  ne_id: number;
  cla: string;
  voisins: [number, number][];
}

interface Sources {
  sources: { url: string; fichiers: { url?: string; sha256: string }[] }[];
  traitement: { entrees: Record<string, string>; mers: { poids_gzip: Record<string, number> } };
}

type Resultat = { fichiers: Record<string, string>; affectations: string; entrees: Record<string, string>; traitement: unknown };
type Module = {
  fautesTable: (table: Table, entites: Record<string, { fr: string }>) => string[];
  affecter: (zones: ZoneNe[], table: Table) => { cibles: (string | null)[]; modes: string[]; fautes: string[] };
  lireCouche: (racine: string) => Promise<{ zones: ZoneNe[] }>;
  construireMers: (racine: string) => Promise<Resultat>;
  fusionnerMers: (sources: Sources, r: Resultat) => Sources;
};
// Import dynamique sans types : le module est en JavaScript, sans déclaration.
const module = import('../geodata/mers.mjs' as string) as Promise<Module>;

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const empreinte = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

const mers = lire<Mer[]>('public/geo/mers.json');
const { noms, alias } = lire<{ noms: Record<string, string>; alias: Record<string, string[]> }>('public/geo/mers.fr.json');
const table = lire<Table>('geodata/mers.json');
const entites = lire<Record<string, { fr: string }>>('geodata/wikidata/mers-entites.json');
const rang = lire<{ retenues: string[] }>('geodata/wikidata/mers-rang.json');
const affectations = lire<Affectation[]>('geodata/mers-affectations.json');
const pays = lire<{ id: string }[]>('public/geo/pays.json');
const sources = lire<Sources>('public/geo/sources.json');
const verrou = lire<Record<string, { fichiers: Record<string, string> }>>('geodata/sources.lock.json');
const texteFin = readFileSync('public/geo/mers.topo.json', 'utf8');
const texteLeger = readFileSync('public/geo/mers-leger.topo.json', 'utf8');
type Props = { id: string };
type Topo = Topology<{ mers: GeometryCollection<Props> }>;
const topoFin = JSON.parse(texteFin) as Topo;
const topoLeger = JSON.parse(texteLeger) as Topo;
const formes = (t: Topo) => feature(t, t.objects.mers).features as Feature<Geometry, Props>[];
const formesFines = new Map(formes(topoFin).map((f) => [f.properties.id, f]));
const parId = new Map(mers.map((m) => [m.id, m]));

function polys(g: Geometry | null): Position[][][] {
  if (!g) return [];
  if (g.type === 'Polygon') return [(g as Polygon).coordinates];
  if (g.type === 'MultiPolygon') return (g as MultiPolygon).coordinates;
  return [];
}

const EPS = 1e-9;
/** Arête le long de l'antiméridien ou d'un pôle (estCouture de src/map/dessin.ts). */
const estCouture = (a: Position, b: Position) =>
  (Math.abs(a[0]!) >= 180 - EPS && a[0] === b[0]) || (Math.abs(a[1]!) >= 90 - EPS && a[1] === b[1]);

/** Les 50 zones du tableau du § 2.3 (liste du 12/11) : id, nom, sorte, parents (« Dans »), intérieure. */
const TABLEAU: [string, string, string, string[], boolean][] = [
  ['atlant', 'océan Atlantique', 'océan', [], false],
  ['pacif', 'océan Pacifique', 'océan', [], false],
  ['indien', 'océan Indien', 'océan', [], false],
  ['arctique', 'océan Arctique', 'océan', [], false],
  ['austral', 'océan Austral', 'océan', [], false],
  ['medit', 'mer Méditerranée', 'mer', ['atlant'], true],
  ['adriat', 'mer Adriatique', 'mer', ['medit'], false],
  ['egee', 'mer Égée', 'mer', ['medit'], false],
  ['ionienne', 'mer Ionienne', 'mer', ['medit'], false],
  ['tyrrhen', 'mer Tyrrhénienne', 'mer', ['medit'], false],
  ['noire', 'mer Noire', 'mer', ['atlant'], true],
  ['azov', "mer d'Azov", 'mer', ['noire'], true],
  ['caspien', 'mer Caspienne', 'mer', [], true],
  ['baltique', 'mer Baltique', 'mer', ['atlant'], true],
  ['botnie', 'golfe de Botnie', 'golfe', ['baltique'], false],
  ['finlande', 'golfe de Finlande', 'golfe', ['baltique'], false],
  ['nord', 'mer du Nord', 'mer', ['atlant'], false],
  ['manche', 'Manche', 'bras de mer', ['atlant'], false],
  ['irlande', "mer d'Irlande", 'mer', ['atlant'], false],
  ['gascogne', 'golfe de Gascogne', 'golfe', ['atlant'], false],
  ['norvege', 'mer de Norvège', 'mer', ['atlant', 'arctique'], false],
  ['groenl', 'mer du Groenland', 'mer', ['arctique', 'atlant'], false],
  ['caraibes', 'mer des Caraïbes', 'mer', ['atlant'], false],
  ['sargasse', 'mer des Sargasses', 'mer', ['atlant'], false],
  ['mexique', 'golfe du Mexique', 'golfe', ['atlant'], false],
  ['laurent', 'golfe du Saint-Laurent', 'golfe', ['atlant'], false],
  ['guinee', 'golfe de Guinée', 'golfe', ['atlant'], false],
  ['baffin', 'baie de Baffin', 'baie', ['arctique', 'atlant'], false],
  ['hudson', "baie d'Hudson", 'baie', ['arctique', 'atlant'], false],
  ['barents', 'mer de Barents', 'mer', ['arctique'], false],
  ['blanche', 'mer Blanche', 'mer', ['barents'], true],
  ['kara', 'mer de Kara', 'mer', ['arctique'], false],
  ['beaufort', 'mer de Beaufort', 'mer', ['arctique'], false],
  ['bering', 'mer de Béring', 'mer', ['pacif'], false],
  ['okhotsk', "mer d'Okhotsk", 'mer', ['pacif'], false],
  ['japon', 'mer du Japon', 'mer', ['pacif'], false],
  ['jaune', 'mer Jaune', 'mer', ['pacif'], false],
  ['chineor', 'mer de Chine orientale', 'mer', ['pacif'], false],
  ['chinemer', 'mer de Chine méridionale', 'mer', ['pacif'], false],
  ['thailand', 'golfe de Thaïlande', 'golfe', ['chinemer'], false],
  ['corail', 'mer de Corail', 'mer', ['pacif'], false],
  ['californ', 'golfe de Californie', 'golfe', ['pacif'], false],
  ['arabie', "mer d'Arabie", 'mer', ['indien'], false],
  ['oman', "golfe d'Oman", 'golfe', ['indien'], false],
  ['persique', 'golfe Persique', 'golfe', ['indien'], true],
  ['aden', "golfe d'Aden", 'golfe', ['indien'], false],
  ['rouge', 'mer Rouge', 'mer', ['indien'], true],
  ['bengale', 'golfe du Bengale', 'golfe', ['indien'], false],
  ['andaman', "mer d'Andaman", 'mer', ['indien'], false],
  ['mozamb', 'canal du Mozambique', 'bras de mer', ['indien'], false],
];

/** Les cinq mers sorties de la liste le 12/11 : leur océan, et un point au milieu de chacune. */
const SORTIES: [string, string, [number, number]][] = [
  ['Tasman Sea', 'pacif', [160, -38]],
  ['Java Sea', 'indien', [111, -5]],
  ['Laptev Sea', 'arctique', [125, 76]],
  ['Chukchi Sea', 'arctique', [-170, 70]],
  ['East Siberian Sea', 'arctique', [160, 73]],
];

describe('liste (geodata/mers.json, public/geo/mers.json)', () => {
  it('les 50 zones du tableau du § 2.3 : ids, noms, sortes, parents et intérieures, dans son ordre', () => {
    expect(mers.map((m) => [m.id, noms[m.id], m.sorte, m.parents, m.interieure])).toEqual(TABLEAU);
    expect(table.zones.map((z) => [z.id, z.nom, z.sorte, z.parents, Boolean(z.interieure)])).toEqual(TABLEAU);
  });

  it('les 45 mers retenues par le rang combiné (extrait figé) et les 5 océans, un item Wikidata chacune', () => {
    const qs = table.zones.map((z) => z.q);
    expect(new Set(qs).size).toBe(50);
    expect(qs.slice(5).sort()).toEqual([...rang.retenues].sort());
    expect(qs.slice(0, 5)).toEqual(['Q97', 'Q98', 'Q1239', 'Q788', 'Q7354']);
  });

  it('ids de 3 à 8 lettres, uniques, absents de pays.json (casse ignorée)', () => {
    const ids = mers.map((m) => m.id);
    for (const id of ids) expect(id).toMatch(/^[a-z]{3,8}$/);
    expect(new Set(ids).size).toBe(ids.length);
    const idsPays = new Set(pays.map((p) => p.id.toLowerCase()));
    for (const id of ids) expect(idsPays.has(id), id).toBe(false);
  });

  it('un nom pour chaque id, le libellé français de Wikidata (extrait figé du 10/11)', () => {
    expect(Object.keys(noms)).toEqual(mers.map((m) => m.id));
    for (const z of table.zones) {
      expect(noms[z.id], z.id).toBe(z.nom);
      expect(entites[z.q]?.fr, z.id).toBe(z.nom);
    }
  });

  it('« mer d’Oman » alias de la mer d’Arabie (recherche, lot 3b) ; la mer d’Arabie et le golfe d’Oman jamais leurres ensemble', () => {
    expect(alias).toEqual({ arabie: ["mer d'Oman"] });
    expect(parId.get('arabie')?.x).toEqual(['oman']);
    expect(parId.get('oman')?.x).toEqual(['arabie']);
    expect(mers.filter((m) => m.x).map((m) => m.id)).toEqual(['arabie', 'oman']);
  });

  it('parents connus, sans cycle ; océans et Caspienne sans parent ; bassin : l’océan du premier parent, la Caspienne à l’Atlantique', () => {
    for (const m of mers) {
      for (const p of m.parents) expect(parId.has(p), `${m.id} → ${p}`).toBe(true);
      const vus = new Set<string>();
      const pile = [...m.parents];
      while (pile.length) {
        const p = pile.pop()!;
        expect(p, `cycle par ${m.id}`).not.toBe(m.id);
        if (!vus.has(p)) {
          vus.add(p);
          pile.push(...(parId.get(p)?.parents ?? []));
        }
      }
    }
    expect(mers.filter((m) => !m.parents.length).map((m) => m.id)).toEqual(['atlant', 'pacif', 'indien', 'arctique', 'austral', 'caspien']);
    for (const m of mers) {
      let z = m;
      while (z.parents.length) z = parId.get(z.parents[0]!)!;
      expect(m.bassin, m.id).toBe(z.id === 'caspien' ? 'atlant' : z.id);
    }
    expect(parId.get('blanche')?.bassin).toBe('arctique');
    expect(parId.get('thailand')?.bassin).toBe('pacif');
  });

  it('baie d’Hudson non intérieure (D43 a) ; intérieures : Méditerranée, Noire, Azov, Caspienne, Baltique, Blanche, Persique, Rouge', () => {
    expect(parId.get('hudson')?.interieure).toBe(false);
    expect(mers.filter((m) => m.interieure).map((m) => m.id)).toEqual(['medit', 'noire', 'azov', 'caspien', 'baltique', 'blanche', 'persique', 'rouge']);
  });

  it('mer des Sargasses enclavée, entourée par l’Atlantique seul ; la seule enclavée', () => {
    expect(mers.filter((m) => m.enclavee).map((m) => m.id)).toEqual(['sargasse']);
    expect(parId.get('sargasse')).toMatchObject({ enclavee: true, parents: ['atlant'], voisins: ['atlant'] });
  });

  it('voisins symétriques, triés, connus ; la Caspienne sans voisin', () => {
    for (const m of mers) {
      expect(m.voisins, m.id).toEqual([...m.voisins].sort());
      for (const v of m.voisins) expect(parId.get(v)?.voisins, `${m.id} ↔ ${v}`).toContain(m.id);
    }
    expect(parId.get('caspien')?.voisins).toEqual([]);
    expect(parId.get('medit')?.voisins).toEqual(['atlant', 'egee', 'ionienne', 'noire', 'tyrrhen']);
  });

  it('superficies et emprises : le Pacifique passe l’antiméridien, l’Austral et l’Arctique en font le tour', () => {
    for (const m of mers) expect(m.superficie_km2, m.id).toBeGreaterThan(30_000);
    expect(parId.get('pacif')?.superficie_km2).toBeGreaterThan(150e6);
    const [o, , e] = parId.get('pacif')!.bbox;
    expect(o).toBeGreaterThan(e);
    expect(parId.get('austral')?.bbox).toMatchObject([-180, expect.any(Number), 180, expect.any(Number)]);
    expect(parId.get('arctique')?.bbox).toMatchObject([-180, expect.any(Number), 180, 90]);
  });

  it('table à la main : une raison pour chaque zone forcée et exclue, et aucune faute', async () => {
    for (const [k, f] of Object.entries(table.forcees)) if (k !== '_') expect(f.raison, k).toMatch(/\S{3}/);
    for (const [k, r] of Object.entries(table.exclues)) if (k !== '_') expect(r, k).toMatch(/\S{3}/);
    const { fautesTable } = await module;
    expect(fautesTable(table, entites)).toEqual([]);
  });
});

describe('affectations (geodata/mers-affectations.json)', () => {
  it('les 306 zones de Natural Earth, chacune affectée à une retenue ou exclue avec sa raison', () => {
    expect(affectations).toHaveLength(306);
    for (const a of affectations) {
      if (a.mode === 'exclue') {
        expect(a.id).toBeNull();
        expect(table.exclues[a.nom] ?? table.exclues[String(a.ne_id)], a.nom).toMatch(/\S{3}/);
      } else expect(parId.has(a.id ?? ''), `${a.nom} → ${a.id}`).toBe(true);
    }
    expect(affectations.filter((a) => a.mode === 'retenue')).toHaveLength(52);
    for (const z of table.zones) {
      expect(affectations.filter((a) => a.id === z.id && a.mode === 'retenue').map((a) => a.nom).sort(), z.id).toEqual([...z.ne].sort());
    }
  });

  it('une mer non retenue n’est jamais fondue au plus long bord : forcée (avec sa raison) ou exclue', () => {
    for (const a of affectations.filter((x) => x.cla === 'sea' && x.mode !== 'retenue')) {
      expect(['forcée', 'exclue'], a.nom).toContain(a.mode);
    }
    for (const [k, f] of Object.entries(table.forcees)) {
      const a = affectations.filter((x) => x.nom === k || String(x.ne_id) === k);
      expect(a.length, k).toBeGreaterThan(0);
      for (const x of a) expect([x.mode, x.id], k).toEqual(['forcée', f.id]);
    }
  });

  it('les cinq mers sorties le 12/11 vont à leur océan, jamais à une mer voisine', () => {
    const sorties = Object.entries(table.forcees).filter(([, f]) => f.sortie);
    expect(sorties.map(([k, f]) => [k, f.id])).toEqual(SORTIES.map(([k, id]) => [k, id]));
    for (const [nom, ocean] of SORTIES) expect(affectations.find((a) => a.nom === nom)?.id, nom).toBe(ocean);
    // Leurs golfes et détroits suivent : la mer des Laptev ne fait plus passer le golfe de Iana à la mer de Kara.
    expect(affectations.find((a) => a.nom === 'Gulf of Yana')?.id).toBe('arctique');
    expect(affectations.find((a) => a.nom === 'Kotzebue Sound')?.id).toBe('arctique');
  });

  it('les mers d’archipel suivent leur P361 (Pacifique ou Indien), jamais une mer retenue qui n’est pas leur parente ; les sous-mers de la Méditerranée vont à elle', () => {
    const vers = (n: string) => affectations.find((a) => a.nom === n)?.id;
    for (const n of ['Flores Sea', 'Bali Sea', 'Banda Sea', 'Celebes Sea', 'Sulu Sea', 'Molucca Sea', 'Ceram Sea', 'Halmahera Sea']) expect(vers(n), n).toBe('pacif');
    for (const n of ['Savu Sea', 'Timor Sea', 'Arafura Sea']) expect(vers(n), n).toBe('indien');
    for (const n of ['Alboran Sea', 'Balearic Sea', 'Ligurian Sea', 'Gulf of Sidra', 'Sea of Marmara']) expect(vers(n), n).toBe('medit');
    expect(vers('Sea of Crete')).toBe('egee');
  });

  it('mutants : une mer sortie fondue dans une voisine, une mer non retenue sans ligne, une zone sans bord font échouer', async () => {
    const { fautesTable, affecter } = await module;
    // Dans la vraie table : la mer des Laptev forcée vers la mer de Kara.
    const laptev = structuredClone(table);
    laptev.forcees['Laptev Sea'] = { ...laptev.forcees['Laptev Sea']!, id: 'kara' };
    expect(fautesTable(laptev, entites).join()).toMatch(/Laptev Sea : mer sortie de la liste fondue dans kara/);
    // Une petite couche : un océan, une mer retenue, une mer non retenue et un golfe isolé.
    const mini: Table = {
      zones: [
        { id: 'ocea', nom: 'o', sorte: 'océan', parents: [], q: 'Q1', ne: ['O'] },
        { id: 'mera', nom: 'm', sorte: 'mer', parents: ['ocea'], q: 'Q2', ne: ['M'] },
      ],
      forcees: { S: { id: 'ocea', raison: 'P361 : ocea', sortie: true } },
      exclues: {},
    };
    const couche: ZoneNe[] = [
      { nom: 'O', ne_id: 1, cla: 'ocean', voisins: [[1, 100], [2, 50]] },
      { nom: 'M', ne_id: 2, cla: 'sea', voisins: [[0, 100], [2, 900], [3, 10]] },
      { nom: 'S', ne_id: 3, cla: 'sea', voisins: [[0, 50], [1, 900]] },
      { nom: 'G', ne_id: 4, cla: 'gulf', voisins: [[1, 10]] },
    ];
    const bon = affecter(couche, mini);
    expect(bon.fautes).toEqual([]);
    expect(bon.cibles).toEqual(['ocea', 'mera', 'ocea', 'mera']);
    const sansLigne = affecter(couche, { ...mini, forcees: {} });
    expect(sansLigne.fautes.join()).toMatch(/S : mer non retenue sans ligne dans forcees/);
    const isolee = affecter([...couche, { nom: 'I', ne_id: 5, cla: 'bay', voisins: [] }], mini);
    expect(isolee.fautes.join()).toMatch(/I \(5\) : ni affectée ni exclue/);
  });
});

describe('géométries (mers.topo.json, mers-leger.topo.json)', () => {
  it('objet mers, propriété id seule, les 50 zones dans l’ordre de mers.json', () => {
    for (const t of [topoFin, topoLeger]) {
      expect(Object.keys(t.objects)).toEqual(['mers']);
      expect(t.objects.mers.geometries.map((g) => g.properties)).toEqual(mers.map((m) => ({ id: m.id })));
    }
  });

  it('aucune géométrie vide ni d’aire nulle ; chaque anneau extérieur dans le sens de d3 (geoArea < 2π)', () => {
    for (const t of [topoFin, topoLeger]) {
      for (const f of formes(t)) {
        const ps = polys(f.geometry);
        expect(ps.length, f.properties.id).toBeGreaterThan(0);
        for (const p of ps) {
          const a = geoArea({ type: 'Polygon', coordinates: [p[0]!] });
          expect(a, f.properties.id).toBeGreaterThan(0);
          expect(a, f.properties.id).toBeLessThan(2 * Math.PI);
        }
      }
    }
  });

  it('le point de chaque zone est dans sa forme (10 km)', () => {
    for (const m of mers) expect(geoContains(formesFines.get(m.id)!, m.point), m.id).toBe(true);
  });

  it('aucune arête de plus de 1,001° hors coutures (densifiées à 1° après la simplification)', () => {
    for (const t of [topoFin, topoLeger]) {
      let max = 0;
      for (const f of formes(t))
        for (const p of polys(f.geometry))
          for (const r of p)
            for (let i = 1; i < r.length; i++) {
              if (estCouture(r[i - 1]!, r[i]!)) continue;
              max = Math.max(max, Math.abs(r[i]![0]! - r[i - 1]![0]!), Math.abs(r[i]![1]! - r[i - 1]![1]!));
            }
      expect(max).toBeLessThanOrEqual(1.001);
    }
  });

  it('coupées à ±180 exact : Arctique, Austral, Pacifique, Béring ; seul l’Arctique touche le pôle', () => {
    for (const t of [topoFin, topoLeger]) {
      const coupees = new Set<string>();
      const pole = new Set<string>();
      for (const f of formes(t))
        for (const p of polys(f.geometry))
          for (const r of p)
            for (let i = 1; i < r.length; i++) {
              const [a, b] = [r[i - 1]!, r[i]!];
              if (Math.abs(a[0]!) >= 180 - EPS && a[0] === b[0]) coupees.add(f.properties.id);
              if (Math.abs(a[1]!) >= 90 - EPS && a[1] === b[1]) pole.add(f.properties.id);
              // Plus de bord à 179,9999 : recalé à ±180 (sinon estCouture ne le voit pas).
              expect(Math.abs(a[0]!) < 179.999 || Math.abs(a[0]!) >= 180 - EPS, `${f.properties.id} ${a[0]}`).toBe(true);
            }
      expect([...coupees].sort()).toEqual(['arctique', 'austral', 'bering', 'pacif']);
      expect([...pole]).toEqual(['arctique']);
    }
  });

  it('un point de chacune des cinq mers sorties tombe dans son océan', () => {
    for (const [nom, ocean, pt] of SORTIES) expect(mers.filter((m) => geoContains(formesFines.get(m.id)!, pt)).map((m) => m.id), nom).toEqual([ocean]);
  });

  it('une grille de 1° des points de mer (hors des terres de monde.topo.json) couverte à 99,5 % au moins, pondérée par cos φ', () => {
    type Part = { o: number; e: number; s: number; n: number; poly: Polygon };
    const parts = (g: Geometry | null): Part[] =>
      polys(g).map((p) => {
        let [o, e, s, n] = [Infinity, -Infinity, Infinity, -Infinity];
        for (const [x, y] of p[0]!) {
          o = Math.min(o, x!);
          e = Math.max(e, x!);
          s = Math.min(s, y!);
          n = Math.max(n, y!);
        }
        // Un polygone qui fait le tour du globe peut contenir le pôle : sa boîte va jusqu'à lui.
        if (e - o > 359) {
          if (s < -50) s = -90;
          if (n > 50) n = 90;
        }
        return { o, e, s, n, poly: { type: 'Polygon', coordinates: p } };
      });
    const dans = (ps: Part[], lon: number, lat: number) => ps.some((p) => lon >= p.o && lon <= p.e && lat >= p.s && lat <= p.n && geoContains(p.poly, [lon, lat]));
    const monde = lire<Topology<{ pays: GeometryCollection<Props>; contestees: GeometryCollection<Props> }>>('public/geo/monde.topo.json');
    const terres = [...feature(monde, monde.objects.pays).features, ...feature(monde, monde.objects.contestees).features].flatMap((f) => parts(f.geometry));
    const zones = [...formesFines.values()].flatMap((f) => parts(f.geometry));
    let mer = 0;
    let couverte = 0;
    for (let lat = -89.5; lat < 90; lat += 1) {
      const w = Math.cos((lat * Math.PI) / 180);
      for (let lon = -179.5; lon < 180; lon += 1) {
        if (dans(terres, lon, lat)) continue;
        mer += w;
        if (dans(zones, lon, lat)) couverte += w;
      }
    }
    expect(couverte / mer).toBeGreaterThanOrEqual(0.995);
  }, 60_000);

  it('budgets gzip : mers.topo.json ≤ 56 000 o, mers-leger.topo.json ≤ 24 000 o ; poids écrits dans sources.json', () => {
    const fin = gzipSync(texteFin).length;
    const leger = gzipSync(texteLeger).length;
    expect(fin).toBeLessThanOrEqual(56_000);
    expect(leger).toBeLessThanOrEqual(24_000);
    expect(sources.traitement.mers.poids_gzip).toEqual({ 'mers.topo.json': fin, 'mers-leger.topo.json': leger });
  });
});

describe('sources', () => {
  it('la couche marine dans la source Natural Earth (10m_physical, même tag), ses 5 empreintes égales au verrou ; entrées à jour (sinon : npm run geodata)', () => {
    const ne = sources.sources.find((s) => s.url === 'https://github.com/nvkelso/natural-earth-vector');
    const marins = ne?.fichiers.filter((f) => f.url?.includes('ne_10m_geography_marine_polys')) ?? [];
    expect(marins.map((f) => f.url)).toEqual(
      ['shp', 'shx', 'dbf', 'prj', 'cpg'].map((e) => `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/10m_physical/ne_10m_geography_marine_polys.${e}`),
    );
    for (const f of marins) expect(f.sha256).toBe(verrou['natural-earth']?.fichiers[`natural-earth/${f.url!.split('/').pop()}`]);
    for (const f of ['geodata/mers.mjs', 'geodata/mers.json', 'geodata/wikidata/mers-entites.json']) expect(sources.traitement.entrees[f], f).toBe(empreinte(f));
  });
});

describe('reproduction', () => {
  const raw = 'geodata/raw/natural-earth/ne_10m_geography_marine_polys.shp';
  it.skipIf(!existsSync(raw))(
    'construireMers (npm run geodata -- --seulement mers) redonne les fichiers commités, le témoin et sources.json (là où geodata/raw/ a la couche)',
    async () => {
      const { construireMers, fusionnerMers } = await module;
      const r = await construireMers('.');
      for (const n of ['mers.topo.json', 'mers-leger.topo.json', 'mers.json', 'mers.fr.json']) expect(r.fichiers[n], n).toBe(readFileSync(`public/geo/${n}`, 'utf8'));
      expect(r.affectations).toBe(readFileSync('geodata/mers-affectations.json', 'utf8'));
      expect(JSON.stringify(fusionnerMers(sources, r), null, 2) + '\n').toBe(readFileSync('public/geo/sources.json', 'utf8'));
    },
    60_000,
  );

  it.skipIf(!existsSync(raw))('mutant sur la vraie couche : sans sa ligne forcée, la mer des Laptev fait échouer l’affectation', async () => {
    const { lireCouche, affecter } = await module;
    const { zones } = await lireCouche('.');
    const t = structuredClone(table);
    delete t.forcees['Laptev Sea'];
    expect(affecter(zones, table).fautes).toEqual([]);
    expect(affecter(zones, t).fautes.join()).toMatch(/Laptev Sea : mer non retenue sans ligne dans forcees/);
  });
});
