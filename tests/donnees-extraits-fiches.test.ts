// Extraits et sources des chiffres des fiches (#34, lot F2, étude fiche-lieu § 2.1 et
// § 2.5) : extraits figés de Wikidata (geodata/wikidata/fiches.json, requêtes à part dans
// requetes-fiches.rq) et de la Banque mondiale, et les fichiers téléchargés et
// verrouillés (CLDR des langues et des monnaies, base tz). Sans réseau ; la lecture des
// fichiers téléchargés ne tourne que là où geodata/raw/ les a (pas en CI).
// La règle du choix (superficie, altitude, gentilé) est au build, testée avec lui : ici,
// ce que disent les extraits, figé pour qu'un nouvel extrait qui change se voie.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';

type Declaration = { id: string; rang: 'preferred' | 'normal'; v: number | string; unite?: string; q: Record<string, string[]>; prec?: number };
type ExtraitWikidata = {
  extrait_le: string;
  date: string;
  api_le: string;
  requetes_sha256: string;
  pays: Record<string, string>;
  autres: Record<string, string>;
  lieux: Record<string, { fr?: string | null; frwiki?: string | null; superficies?: Declaration[]; gentiles?: Declaration[]; habitants?: Declaration[]; culminants?: Declaration[]; capitales?: Declaration[] }>;
  sommets: Record<string, { fr: string | null; frwiki: string | null; altitudes: Declaration[]; coordonnees: Declaration[] }>;
  villes: Record<string, { fr: string | null; en: string | null; frwiki: string | null }>;
  libelles: Record<string, { fr: string | null; en: string | null }>;
};
type Source = { nom: string; url: string; version: string; licence: string; telecharge_le: string; requetes?: { chemin: string; sha256: string }; fichiers: { url?: string; chemin?: string; sha256: string }[] };
type Module = {
  SOURCES_FICHES: { cle: string; version: string; fichiers: { chemin: string; url: string }[] }[];
  sourcesFiches: (racine: string) => Promise<{ sources: Source[]; entrees: Record<string, string> }>;
  lireSourcesFiches: (racine: string) => Promise<{ territoryInfo: Record<string, unknown>; currencyData: { region: Record<string, unknown> }; languesFr: Record<string, string>; monnaiesFr: Record<string, unknown>; zoneTab: string; tzVersion: string }>;
};
// Import dynamique sans types : le module est en JavaScript, sans déclaration.
const module = import('../geodata/fiches-sources.mjs' as string) as Promise<Module>;

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const empreinte = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
const sources = lire<{ sources: Source[]; traitement: { entrees: Record<string, string> } }>('public/geo/sources.json');
const verrou = lire<Record<string, { telecharge_le: string; fichiers: Record<string, string> }>>('geodata/sources.lock.json');
const wd = lire<ExtraitWikidata>('geodata/wikidata/fiches.json');
const bm = lire<{ date: string; annee: number; source: { mis_a_jour_le: string; licence: string }; conditions: { url: string; lu_le: string; citations: string[] }; economies: Record<string, { v: number; annee: number }> }>(
  'geodata/banque-mondiale/population.json',
);
const ids = lire<Pays[]>('public/geo/pays.json')
  .filter((p) => p.statut === 'jouable' || p.statut === 'optionnel')
  .map((p) => p.id)
  .sort();
const lieuDe = (id: string) => wd.lieux[wd.pays[id]!]!;
const avec = (f: (id: string) => boolean) => ids.filter(f);

describe('extrait de Wikidata des fiches', () => {
  it('197 pays, chacun son item : celui de la table des capitales, sinon le seul de son code (comme fiches.mjs)', () => {
    expect(Object.keys(wd.pays).sort()).toEqual(ids);
    expect(ids).toHaveLength(197);
    const cap = lire<{ items_par_code: Record<string, string[]> }>('geodata/wikidata/capitales.json');
    const main = lire<{ items_pays: Record<string, { q: string }> }>('geodata/capitales-main.json');
    for (const id of ids) expect(wd.pays[id], id).toBe(main.items_pays[id]?.q ?? cap.items_par_code[id]?.[0]);
    // Lot F3 : les 61 autres entités (territoires, zones, Antarctique), par la clé qid de la table des fiches.
    const qid = lire<{ qid: Record<string, { q: string }> }>('geodata/fiches-main.json').qid;
    const autres = lire<Pays[]>('public/geo/pays.json').filter((p) => !ids.includes(p.id)).map((p) => p.id).sort();
    expect(autres).toHaveLength(61);
    expect(Object.keys(wd.autres).sort()).toEqual(autres);
    for (const id of autres) expect(wd.autres[id], id).toBe(qid[id]!.q);
    expect(Object.keys(wd.lieux).sort()).toEqual([...new Set([...Object.values(wd.pays), ...Object.values(wd.autres)])].sort());
  });

  it('lot F3 : la capitale (P36) des seuls territoires, nommée ; le libellé et l’article de chaque autre lieu', () => {
    const territoires = lire<Pays[]>('public/geo/pays.json').filter((p) => p.statut === 'territoire').map((p) => wd.autres[p.id]!);
    for (const [q, l] of Object.entries(wd.lieux)) if (l.capitales) expect(territoires, q).toContain(q);
    const avec = territoires.filter((q) => wd.lieux[q]!.capitales?.length);
    expect(avec).toHaveLength(36);
    for (const q of avec) for (const d of wd.lieux[q]!.capitales!) expect(wd.villes[d.v as string]?.fr, `${q} ${d.v}`).toBeTruthy();
    // Montserrat : deux capitales sans rang (la table tranche) ; la Géorgie du Sud : King Edward Point, préféré.
    expect(wd.lieux[wd.autres.MSR!]!.capitales!.map((d) => d.v).sort()).toEqual(['Q30990', 'Q31006']);
    expect(wd.lieux[wd.autres.SGS!]!.capitales!.filter((d) => d.rang === 'preferred').map((d) => d.v)).toEqual(['Q393878']);
    // Sans article en français : l'île Brésilienne, et Akrotiri et Dhekelia (la table donne celui des deux bases).
    expect(Object.entries(wd.autres).filter(([, q]) => !wd.lieux[q]!.frwiki).map(([id]) => id).sort()).toEqual(['NE_BRI', 'NE_ESB', 'NE_WSB']);
    expect(wd.lieux.Q51!.superficies!.map((d) => d.v)).toEqual([14_106_900]);
  });

  it('requêtes à part de requetes.rq : l’empreinte de requetes-fiches.rq est celle de l’extrait et de sources.json', () => {
    const s = sources.sources.find((x) => x.requetes?.chemin === 'geodata/wikidata/requetes-fiches.rq');
    if (!s) throw new Error('source Wikidata des fiches absente de sources.json');
    expect(wd.requetes_sha256).toBe(empreinte('geodata/wikidata/requetes-fiches.rq'));
    expect(s.requetes!.sha256).toBe(wd.requetes_sha256);
    expect(s.fichiers).toEqual([{ chemin: 'geodata/wikidata/fiches.json', sha256: empreinte('geodata/wikidata/fiches.json') }]);
    expect(s.telecharge_le).toBe(wd.date);
    expect(s.licence).toContain('CC0');
    // L'extrait des capitales garde, lui, l'empreinte de requetes.rq (tests/donnees-capitales.test.ts).
    expect(lire<{ requetes_sha256: string }>('geodata/wikidata/capitales.json').requetes_sha256).toBe(empreinte('geodata/wikidata/requetes.rq'));
  });

  it('couverture : superficie et habitants pour les 197 ; gentilé sauf le Vatican ; sommet sauf la Gambie', () => {
    expect(avec((id) => !lieuDe(id).superficies?.length)).toEqual([]);
    expect(avec((id) => !lieuDe(id).habitants?.length)).toEqual([]);
    expect(avec((id) => !lieuDe(id).gentiles?.length)).toEqual(['VAT']);
    expect(avec((id) => !lieuDe(id).culminants?.length)).toEqual(['GMB']);
  });

  it('superficies en km² ; les pays à plusieurs valeurs, figés (§ 2.1 : une valeur nouvelle se voit)', () => {
    const unites = new Set(ids.flatMap((id) => (lieuDe(id).superficies ?? []).map((d) => d.unite)));
    expect([...unites]).toEqual(['Q712226']);
    // Des hectares (Q35852) pour deux autres lieux (Heard-et-MacDonald, Bajo Nuevo) : la règle ne lit que les km².
    expect(Object.entries(wd.autres).filter(([, q]) => (wd.lieux[q]!.superficies ?? []).some((d) => d.unite !== 'Q712226')).map(([id]) => id).sort()).toEqual(['HMD', 'NE_BJN']);
    expect(wd.libelles.Q712226?.fr).toBe('kilomètre carré');
    expect(avec((id) => (lieuDe(id).superficies ?? []).length > 1)).toEqual(
      ['AUS', 'BEL', 'BIH', 'BLR', 'DEU', 'ECU', 'EST', 'FIN', 'HUN', 'JPN', 'LUX', 'LVA', 'NLD', 'NOR', 'SRB', 'SVK', 'SWE', 'TUR'],
    );
    expect(lieuDe('NOR').superficies).toHaveLength(12);
  });

  it('points culminants : les pays à plusieurs sommets et les altitudes hors du mètre, figés', () => {
    expect(avec((id) => (lieuDe(id).culminants ?? []).length > 1)).toEqual(['AUS', 'COL', 'FRA', 'IND', 'MDV', 'NLD', 'USA']);
    const sommetsDe = (id: string) => (lieuDe(id).culminants ?? []).map((d) => d.v as string);
    expect(sommetsDe('FRA')).toContain('Q583'); // mont Blanc
    expect(sommetsDe('IND')).toEqual(expect.arrayContaining(['Q82019', 'Q43512'])); // Kangchenjunga, K2
    const horsMetre = Object.entries(wd.sommets).flatMap(([q, s]) => s.altitudes.filter((a) => a.unite !== 'Q11573').map((a) => `${q} ${a.v} ${a.unite}`));
    expect(horsMetre).toEqual(['Q4380977 1332 Q3710', 'Q635179 2904 Q3710']); // mont Lamlam (Guam, lot F3) et mont Afadjato (Ghana), en pieds
    expect(wd.libelles.Q3710?.fr).toBe('pied');
    for (const id of ids) for (const q of sommetsDe(id)) expect(wd.sommets[q], `${id} ${q}`).toBeDefined();
    // Chaque sommet a une altitude, sauf le mont Agrihan (Mariannes du Nord, lot F3 : écarté par la table) ; tous ont des
    // coordonnées sur la Terre, sauf la falaise de Népin.
    expect(Object.entries(wd.sommets).filter(([, s]) => !s.altitudes.length).map(([q]) => q)).toEqual(['Q27728822']);
    expect(Object.entries(wd.sommets).filter(([, s]) => !s.coordonnees.length).map(([q]) => q)).toEqual(['Q98596662']);
    for (const s of Object.values(wd.sommets)) for (const c of s.coordonnees) expect((c as unknown as { globe: string }).globe).toBe('Q2');
  });

  it('habitants de Taïwan et du Vatican (absents de la Banque mondiale) datés par P585', () => {
    for (const id of ['TWN', 'VAT']) {
      const h = lieuDe(id).habitants ?? [];
      expect(h.length, id).toBeGreaterThan(0);
      expect(h.every((d) => d.q.P585?.length === 1 && typeof d.prec === 'number'), id).toBe(true);
    }
  });
});

describe('extrait de la Banque mondiale', () => {
  it('SP.POP.TOTL 2025 pour 195 des 197 pays (manquent Taïwan et le Vatican), CC BY 4.0, conditions lues et citées (S47)', () => {
    expect(bm.annee).toBe(2025);
    expect(avec((id) => !bm.economies[id])).toEqual(['TWN', 'VAT']);
    expect(avec((id) => !!bm.economies[id] && bm.economies[id]!.annee !== 2025)).toEqual([]);
    expect(bm.source.licence).toBe('CC BY-4.0');
    expect(bm.source.mis_a_jour_le).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bm.conditions.url).toBe('https://www.worldbank.org/ext/en/legal/terms-conditions/datasets');
    expect(bm.conditions.citations.join(' ')).toContain('Creative Commons Attribution 4.0');
    const s = sources.sources.find((x) => x.url === 'https://data.worldbank.org/indicator/SP.POP.TOTL');
    expect(s?.fichiers).toEqual([{ chemin: 'geodata/banque-mondiale/population.json', sha256: empreinte('geodata/banque-mondiale/population.json') }]);
    expect(s?.telecharge_le).toBe(bm.date);
    expect(s?.licence).toContain('CC BY 4.0');
  });
});

describe('sources téléchargées des fiches et lignes de sources.json', () => {
  it('CLDR (langues, monnaies) et tz 2026e au verrou, adresses épinglées sur leur version, lignes de sources.json égales au verrou', async () => {
    const { SOURCES_FICHES } = await module;
    expect(SOURCES_FICHES.map((s) => s.cle)).toEqual(['cldr-fiches', 'tz']);
    const [cldr, tz] = SOURCES_FICHES as [Module['SOURCES_FICHES'][number], Module['SOURCES_FICHES'][number]];
    // Même version et même commit que les noms des territoires (geodata/build.mjs).
    expect(cldr.version).toBe(sources.sources.find((s) => s.url === 'https://github.com/unicode-org/cldr-json')?.version);
    for (const f of cldr.fichiers) expect(f.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/unicode-org\/cldr-json\/49\.0\.0\/cldr-json\//);
    expect(tz.fichiers).toEqual([{ chemin: 'tz/tzdata2026e.tar.gz', url: 'https://data.iana.org/time-zones/releases/tzdata2026e.tar.gz' }]);
    for (const s of SOURCES_FICHES) {
      expect(Object.keys(verrou[s.cle]?.fichiers ?? {})).toEqual(s.fichiers.map((f) => f.chemin));
      const ligne = sources.sources.find((x) => x.fichiers.some((f) => f.url === s.fichiers[0]!.url));
      expect(ligne?.telecharge_le).toBe(verrou[s.cle]!.telecharge_le);
      expect(ligne?.fichiers).toEqual(s.fichiers.map((f) => ({ url: f.url, sha256: verrou[s.cle]!.fichiers[f.chemin] })));
    }
  });

  it('sourcesFiches (npm run fiches) redonne les lignes de sources.json et l’empreinte du module, sans lire raw/', async () => {
    const { sourcesFiches } = await module;
    const r = await sourcesFiches('.');
    // CLDR, tz, Wikidata (pays, puis mers : lot F4), Banque mondiale ; puis Wikipédia, Factbook, NOAA (océans, lot F4) et ISO 639 (table à la main).
    expect(r.sources).toHaveLength(9);
    for (const s of r.sources) expect(sources.sources.find((x) => x.url === s.url), s.url).toEqual(s);
    expect(r.entrees).toEqual({ 'geodata/fiches-sources.mjs': empreinte('geodata/fiches-sources.mjs') });
    expect(sources.traitement.entrees['geodata/fiches-sources.mjs']).toBe(r.entrees['geodata/fiches-sources.mjs']);
  });

  it.skipIf(!existsSync('geodata/raw/tz/tzdata2026e.tar.gz') || !existsSync('geodata/raw/cldr/supplemental/territoryInfo.json'))(
    'lireSourcesFiches : fichiers égaux au verrou, zone.tab de 2026e (418 zones), CLDR lisible (là où geodata/raw/ les a)',
    async () => {
      const { lireSourcesFiches } = await module;
      const r = await lireSourcesFiches('.');
      expect(r.tzVersion).toBe('2026e');
      expect(r.zoneTab.split('\n').filter((l) => l && !l.startsWith('#'))).toHaveLength(418);
      expect(r.languesFr.fr).toBe('français');
      expect(r.territoryInfo.FR).toBeDefined();
      expect(r.currencyData.region.FR).toBeDefined();
    },
  );
});

// --- Lot F4 : l'extrait des océans et des mers ------------------------------------------------

type ExtraitMers = {
  date: string;
  requetes_sha256: string;
  mers: Record<string, string>;
  lieux: Record<string, { superficies?: Declaration[]; profondeurs?: Declaration[]; pays?: (Declaration & { prop: string })[] }>;
  etats: Record<string, { fr: string | null; en: string | null; fin: string[] }>;
  libelles: Record<string, { fr: string | null; en: string | null }>;
};

describe('extrait de Wikidata des mers (lot F4)', () => {
  const wdm = lire<ExtraitMers>('geodata/wikidata/fiches-mers.json');
  const table = lire<{ zones: { id: string; q: string }[] }>('geodata/mers.json');

  it('les 50 zones de geodata/mers.json, par leur item ; requêtes à part (requetes-fiches-mers.rq), leur empreinte dans l’extrait et dans sources.json', () => {
    expect(wdm.mers).toEqual(Object.fromEntries(table.zones.map((z) => [z.id, z.q])));
    expect(Object.keys(wdm.lieux).sort()).toEqual([...new Set(table.zones.map((z) => z.q))].sort());
    expect(wdm.requetes_sha256).toBe(empreinte('geodata/wikidata/requetes-fiches-mers.rq'));
    const s = sources.sources.find((x) => x.requetes?.chemin === 'geodata/wikidata/requetes-fiches-mers.rq');
    expect(s?.requetes?.sha256).toBe(wdm.requetes_sha256);
    expect(s?.fichiers).toEqual([{ chemin: 'geodata/wikidata/fiches-mers.json', sha256: empreinte('geodata/wikidata/fiches-mers.json') }]);
    expect(s?.telecharge_le).toBe(wdm.date);
  });

  it('couverture du relevé R4 : superficie 46, profondeur 49, des pays pour 46 ; trois États disparus parmi les pays cités', () => {
    const n = (k: 'superficies' | 'profondeurs' | 'pays') => Object.values(wdm.lieux).filter((l) => l[k]?.length).length;
    expect([n('superficies'), n('profondeurs'), n('pays')]).toEqual([46, 49, 46]);
    const sans = (k: 'superficies' | 'profondeurs') => Object.entries(wdm.mers).filter(([, q]) => !wdm.lieux[q]![k]?.length).map(([id]) => id).sort();
    expect(sans('superficies')).toEqual(['guinee', 'ionienne', 'mozamb', 'oman']);
    expect(sans('profondeurs')).toEqual(['californ']);
    expect(Object.entries(wdm.etats).filter(([, e]) => e.fin.length).map(([q]) => q).sort()).toEqual(['Q15180', 'Q199841', 'Q34266']);
    for (const l of Object.values(wdm.lieux)) for (const d of l.pays ?? []) expect(['P17', 'P205']).toContain(d.prop);
  });
});
