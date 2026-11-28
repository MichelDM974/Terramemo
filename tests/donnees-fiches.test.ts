// Données des fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 2 et § 7 ; lots F1 et F2) : public/geo/fiches-monde.json et fiches-monde.fr.json, et les
// tableaux à relire docs/relectures/fiches-pays.md, produits par geodata/fiches.mjs (npm
// run fiches) depuis pays.json, les extraits figés (capitales, Wikidata, Banque mondiale),
// CLDR, tz et la table à la main geodata/fiches-main.json. Sans réseau. La
// reproduction lit CLDR et tz dans geodata/raw/ : elle ne tourne que là où ils sont (pas
// en CI) ; les autres tests lisent les fichiers commités et les extraits versionnés.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { sorteDeLieu } from '../src/fiches/sorte';
import { IDS_MERS } from '../src/map/mers';
import type { Pays } from '../src/map/types';

type Module = {
  construireFiches: (racine: string) => Promise<{ fichiers: Record<string, string>; relectures: { chemin: string; texte: string }[]; entrees: Record<string, string> }>;
  sorteEntite: (statut: string) => string | null;
};
type Decl = { id: string; rang: string; v: unknown; unite?: string; q: Record<string, string[]> };
type Regles = {
  superficieWikidata: (d: Decl[]) => number | null;
  sommetRetenu: (d: Decl[], ligne?: unknown) => { sommet: string | null; auto: string | null };
  coordSommet: (s: unknown) => [number, number] | null;
  distanceAuTrace: (f: GeoJSON.Feature, p: [number, number]) => number;
  zonesPres: (zones: GeoJSON.Feature[], coord: [number, number] | null, dist: number, id: string, tenuesPar: Map<string, Set<string>>) => { zone: string; km: number; dedans: boolean }[];
  plurielGentile: (g: string) => string;
  paysTouches: (entites: unknown[], contestees: unknown[]) => { id: string; part: number }[];
  languesCandidates: (info: unknown) => { code: string; pct: number; officielle: boolean }[];
};
// Import dynamique sans types : les modules sont en JavaScript, sans déclaration.
const module = import('../geodata/fiches.mjs' as string) as Promise<Module>;
const regles = import('../geodata/fiches-pays.mjs' as string) as Promise<Regles>;

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const brutMonde = readFileSync('public/geo/fiches-monde.json', 'utf8');
const brutFr = readFileSync('public/geo/fiches-monde.fr.json', 'utf8');
type FicheBrute = { s: string; h?: number; ha?: number; hs?: string; sup?: number; alt?: number; z?: string; nz?: number; m?: string[]; lo?: string[]; lp?: [string, number][]; f?: [number, number] };
type TexteBrut = { st?: string; wp?: string; ca?: string; g?: string; gp?: string; cu?: string; fn?: string };
const monde = JSON.parse(brutMonde) as { v: number; lieux: Record<string, FicheBrute> };
const fr = JSON.parse(brutFr) as { v: number; sous_regions: Record<string, string>; langues: Record<string, string>; monnaies: Record<string, string>; lieux: Record<string, TexteBrut> };
const pays = lire<Pays[]>('public/geo/pays.json');
const mers = lire<{ id: string }[]>('public/geo/mers.json');
const communes = lire<{ id: string }[]>('public/geo/reunion/communes.json');
type Ligne = Record<string, unknown> & { raison?: string };
const main = lire<{ sous_regions: Record<string, string>; wp: Record<string, { titre: string; raison: string }> } & Record<string, Record<string, Ligne>>>('geodata/fiches-main.json');
const lignes = (cle: string) => Object.entries(main[cle] ?? {}).filter(([k]) => !k.startsWith('_'));

describe('fiches du monde : une entrée par entité', () => {
  it('les 258 entités de pays.json ont leur entrée, dans les deux fichiers ; aucune pour un id inconnu', () => {
    const ids = pays.map((p) => p.id).sort();
    expect(ids).toHaveLength(258);
    expect(Object.keys(monde.lieux).sort()).toEqual(ids);
    expect(Object.keys(fr.lieux).sort()).toEqual(ids);
    expect(monde.v).toBe(1);
    expect(fr.v).toBe(1);
  });

  it('sorteDeLieu dit la sorte du fichier pour les 258, mer pour les 50 zones marines, commune pour les 24 de l’île (332 lieux)', () => {
    const compte: Record<string, number> = {};
    for (const p of pays) {
      const s = sorteDeLieu(p.id, 'monde', p.statut);
      expect(s, p.id).toBe(monde.lieux[p.id]?.s);
      compte[s!] = (compte[s!] ?? 0) + 1;
    }
    expect(compte).toEqual({ pays: 197, territoire: 48, zone: 12, continent: 1 });
    expect(mers.map((m) => m.id).sort()).toEqual([...IDS_MERS].sort());
    for (const m of mers) expect(sorteDeLieu(m.id, 'monde'), m.id).toBe('mer');
    expect(communes).toHaveLength(24);
    for (const c of communes) expect(sorteDeLieu(c.id, 'reunion', 'jouable'), c.id).toBe('commune');
    // Aucun id de la carte n'est pris pour une mer, et le script dit comme le code.
    for (const p of pays) expect(sorteDeLieu(p.id, 'monde', p.statut), p.id).not.toBe('mer');
    expect(sorteDeLieu('XYZ', 'monde')).toBeNull();
    // Un terrain local autre que l'île (le J6, sans fiche avant son lot 8) : rien, jamais un pays ni une commune.
    for (const t of ['departements', 'regions'] as const) expect(sorteDeLieu('2A', t, 'jouable')).toBeNull();
  });

  it('le script et le code s’accordent sur la sorte de chaque statut', async () => {
    const { sorteEntite } = await module;
    for (const s of ['jouable', 'optionnel', 'territoire', 'conteste', 'autre'] as const) expect(sorteEntite(s), s).toBe(sorteDeLieu('ABC', 'monde', s));
    expect(sorteEntite('inconnu')).toBeNull();
  });

  it('un titre de Wikipédia pour 257 lieux (tous sauf l’île Brésilienne) ; les champs d’une zone contestée et de l’Antarctique, et eux seuls (D57 a, lot F3)', () => {
    const compte: Record<string, number> = {};
    for (const p of pays) {
      const t = fr.lieux[p.id]!;
      const l = monde.lieux[p.id]!;
      const s = l.s;
      compte[s] = (compte[s] ?? 0) + 1;
      if (p.id !== 'NE_BRI') expect(t.wp, p.id).toBeTruthy();
      expect(t.wp ?? '', p.id).not.toMatch(/_|^https?:/);
      if (s === 'territoire') {
        expect(Object.keys(t).every((k) => ['st', 'wp', 'ca', 'g', 'gp', 'cu'].includes(k)), p.id).toBe(true);
        expect(Object.keys(l).every((k) => ['s', 'sv', 'fs', 'h', 'ha', 'hs', 'sup', 'alt', 'z', 'm', 'lo', 'lp'].includes(k)), p.id).toBe(true);
      } else if (s === 'zone') {
        // Une zone : ses habitants (sourcés), son statut et son lien ; ni superficie, ni langue, ni monnaie, ni fuseau, ni capitale, ni sommet.
        expect(Object.keys(t).every((k) => ['st', 'wp'].includes(k)), p.id).toBe(true);
        expect(Object.keys(l).every((k) => ['s', 'h', 'ha', 'hs'].includes(k)), p.id).toBe(true);
      } else if (s === 'continent') {
        expect(l, p.id).toEqual({ s, sup: 14_106_900, alt: 4892 });
        expect(t, p.id).toEqual({ wp: 'Antarctique', cu: 'massif Vinson' });
      }
    }
    expect(fr.lieux.NE_BRI).toEqual({ st: fr.lieux.NE_BRI!.st });
    expect(compte).toEqual({ pays: 197, territoire: 48, zone: 12, continent: 1 });
    // La table à la main : le titre du royaume pour le Danemark et les Pays-Bas ; celui des deux bases pour Akrotiri et Dhekelia.
    expect(fr.lieux.DNK?.wp).toBe('Danemark');
    expect(fr.lieux.NLD?.wp).toBe('Pays-Bas');
    expect([fr.lieux.NE_ESB?.wp, fr.lieux.NE_WSB?.wp]).toEqual(['Akrotiri et Dhekelia', 'Akrotiri et Dhekelia']);
    for (const [id, l] of Object.entries(main.wp).filter(([k]) => !k.startsWith('_'))) {
      expect(l.raison, id).toBeTruthy();
      expect(fr.lieux[id]?.wp, id).toBe(l.titre);
    }
  });

  it('les 23 sous-régions de pays.json ont leur nom, aucune de trop', () => {
    const presentes = new Set(pays.map((p) => p.sous_region));
    expect(presentes.size).toBe(23);
    expect(new Set(Object.keys(fr.sous_regions))).toEqual(presentes);
    for (const [k, v] of Object.entries(fr.sous_regions)) {
      expect(v, k).toBeTruthy();
      expect(v, k).not.toBe(k);
    }
    expect(fr.sous_regions['Eastern Asia']).toBe("Asie de l'Est");
    // « Amérique du Nord » reste le continent de l'appli : la sous-région s'en distingue.
    expect(fr.sous_regions['Northern America']).not.toBe('Amérique du Nord');
  });

  it('poids : 12 Ko compressés au plus pour chacun des deux fichiers (§ 2.7)', () => {
    expect(gzipSync(brutMonde, { level: 9 }).length).toBeLessThanOrEqual(12 * 1024);
    expect(gzipSync(brutFr, { level: 9 }).length).toBeLessThanOrEqual(12 * 1024);
  });

  const raw = [
    'geodata/raw/cldr/supplemental/territoryInfo.json',
    'geodata/raw/tz/tzdata2026e.tar.gz',
    'geodata/raw/natural-earth/ne_10m_admin_0_countries.shp',
    'geodata/raw/natural-earth/ne_10m_geography_marine_polys.shp',
  ];
  it.skipIf(!raw.every((f) => existsSync(f)))('reproduction : construireFiches (npm run fiches) redonne les fichiers commités, les tableaux à relire et les empreintes de sources.json (là où geodata/raw/ a CLDR, tz et Natural Earth)', async () => {
    const { construireFiches } = await module;
    const r = await construireFiches('.');
    expect(r.fichiers['fiches-monde.json']).toBe(brutMonde);
    expect(r.fichiers['fiches-monde.fr.json']).toBe(brutFr);
    // Lot F4 : les riverains par le tracé sont refaits depuis Natural Earth.
    expect(r.fichiers['fiches-mers.json']).toBe(readFileSync('public/geo/fiches-mers.json', 'utf8'));
    expect(r.fichiers['fiches-mers.fr.json']).toBe(readFileSync('public/geo/fiches-mers.fr.json', 'utf8'));
    // Lot F5 : le fichier de la langue des communes (leurs chiffres viennent de geodata/reunion.mjs).
    expect(r.fichiers['reunion/fiches.fr.json']).toBe(readFileSync('public/geo/reunion/fiches.fr.json', 'utf8'));
    expect(Object.keys(r.fichiers)).toEqual(['fiches-monde.json', 'fiches-monde.fr.json', 'fiches-mers.json', 'fiches-mers.fr.json', 'reunion/fiches.fr.json']);
    expect(r.relectures.map((x) => x.chemin)).toEqual([
      'docs/relectures/fiches-pays.md',
      'docs/relectures/fiches-territoires.md',
      'docs/relectures/fiches-territoires-chiffres.md',
      'docs/relectures/fiches-mers.md',
      'docs/relectures/fiches-communes.md',
    ]);
    for (const x of r.relectures) expect(x.texte, x.chemin).toBe(readFileSync(x.chemin, 'utf8'));
    const sources = lire<{ traitement: { entrees: Record<string, string> } }>('public/geo/sources.json');
    expect(Object.keys(r.entrees).sort()).toEqual([
      'geodata/fiches-autres.mjs',
      'geodata/fiches-communes.mjs',
      'geodata/fiches-main.json',
      'geodata/fiches-mers.mjs',
      'geodata/fiches-pays.mjs',
      'geodata/fiches-relecture.mjs',
      'geodata/fiches-sources.mjs',
      'geodata/fiches-territoires.mjs',
      'geodata/fiches.mjs',
      'geodata/mers-affectations.json',
    ]);
    for (const [f, h] of Object.entries(r.entrees)) {
      expect(h, f).toBe(createHash('sha256').update(readFileSync(f)).digest('hex'));
      expect(sources.traitement.entrees[f], f).toBe(h);
    }
    // ≈ 2 s seul (geoContains des zones horaires et des sommets) : plus de 5 s dans la suite entière.
  }, 60_000);
});

// --- Lot F2 : les chiffres des 197 pays (§ 2.1, § 7) -------------------------------------

const ids197 = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel').map((p) => p.id).sort();
const wd = lire<{ pays: Record<string, string>; lieux: Record<string, { superficies?: Decl[]; culminants?: Decl[] }>; sommets: Record<string, { fr: string | null; coordonnees?: { rang: string; v: [number, number] }[] }> }>('geodata/wikidata/fiches.json');

describe('fiches des 197 pays : les chiffres du lot F2', () => {
  it('chacun des 197 a tous ses champs ; les seuls absents sont ceux du § 2.1 (la fête du Royaume-Uni et, en attendant l’utilisateur, celle de la Bosnie-Herzégovine) et le sommet de la Somalie', () => {
    expect(ids197).toHaveLength(197);
    const requis: (keyof FicheBrute)[] = ['h', 'ha', 'sup', 'alt', 'z', 'm', 'lo', 'f'];
    const requisFr: (keyof TexteBrut)[] = ['wp', 'g', 'gp', 'cu', 'fn'];
    const absents: Record<string, string[]> = {};
    for (const id of ids197) {
      for (const c of requis) if (monde.lieux[id]![c] === undefined) (absents[c] ??= []).push(id);
      for (const c of requisFr) if (!fr.lieux[id]![c]) (absents[c] ??= []).push(id);
    }
    // Une liste qui ne change que par un commit qui la touche (§ 7) ; BIH sans fête est
    // écrit au § 2.1, à relire (fiches-main.json, fete) ; la Somalie n'a pas de sommet
    // et le Guyana (le Roraima, dans l'Essequibo) n'ont pas de sommet (décision du
    // 18/11/2026 : aucun point culminant dans une zone disputée).
    expect(absents).toEqual({ alt: ['GUY', 'SOM'], cu: ['GUY', 'SOM'], f: ['BIH', 'GBR'], fn: ['BIH', 'GBR'] });
  });

  it('habitants : la Banque mondiale en 2025, Taïwan (2026) et le Vatican (2024) par Wikidata ; superficie : Wikidata pour les 197, par la règle du choix (décision du 18/11/2026)', async () => {
    const { superficieWikidata } = await regles;
    for (const id of ids197) {
      const l = monde.lieux[id]!;
      expect(l.h, id).toBeGreaterThan(0);
      expect(Number.isInteger(l.h), id).toBe(true);
      // La superficie servie est celle de la règle, arrondie au km² (au centième sous 100).
      const v = superficieWikidata(wd.lieux[wd.pays[id]!]!.superficies ?? [])!;
      expect(l.sup, id).toBe(v >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    }
    const hors = ids197.filter((id) => monde.lieux[id]!.ha !== 2025 || monde.lieux[id]!.hs);
    expect(Object.fromEntries(hors.map((id) => [id, [monde.lieux[id]!.ha, monde.lieux[id]!.hs]]))).toEqual({ TWN: [2026, 'wd'], VAT: [2024, 'wd'] });
    expect(monde.lieux.VAT!.sup).toBe(0.44);
    // Aucune ligne par pays : la clé n'a que la liste des pays touchés.
    expect(lignes('superficie').map(([k]) => k)).toEqual(['touches']);
    const t = readFileSync('docs/relectures/fiches-pays.md', 'utf8');
    expect(t).toMatch(/\| Serbie \| 88\s499\skm² \| 77\s471 \| \+ 14,2 % \|/u);
  });

  it('pays à plusieurs superficies dans Wikidata : la liste et la valeur retenue sont figées (une valeur nouvelle dans un extrait se voit)', async () => {
    const { superficieWikidata } = await regles;
    const multiples: Record<string, [number, number | null]> = {};
    for (const [iso, q] of Object.entries(wd.pays)) {
      const s = (wd.lieux[q]!.superficies ?? []).filter((d) => d.unite === 'Q712226');
      if (s.length > 1) multiples[iso] = [s.length, superficieWikidata(s)];
    }
    expect(multiples).toEqual({
      AUS: [4, 7688287], BEL: [2, 30688], BIH: [3, 51209.2], BLR: [2, 207596.76], DEU: [3, 357587.77], ECU: [2, 257204.27],
      EST: [2, 45335], FIN: [7, 338478.34], HUN: [2, 93011.4], JPN: [2, 377973.68], LUX: [2, 2593.05], LVA: [6, 64593.77],
      NLD: [2, 37378], NOR: [12, 385207], SRB: [2, 88499], SVK: [3, 49033.720839], SWE: [4, 447425.16], TUR: [3, 783562],
    });
    // À égalité sur la date la plus récente (la Lettonie) : la plus grande, quel que soit
    // l'identifiant de la déclaration ; une valeur sans date est écartée s'il y en a de datées.
    const d = (id: string, v: number, date: string | null) => ({ id, v, unite: 'Q712226', rang: 'preferred', ...(date ? { q: { P585: [date] } } : {}) });
    for (const ordre of [['a', 'b'], ['b', 'a']]) {
      expect(superficieWikidata([d(ordre[0]!, 61760.39, '2026-01-01T00:00:00Z'), d(ordre[1]!, 64593.77, '2026-01-01T00:00:00Z')] as never)).toBe(64593.77);
    }
    expect(superficieWikidata([d('a', 900, null), d('b', 500, '2020-01-01T00:00:00Z')] as never)).toBe(500);
  });

  it('pays touchés par une zone disputée (D57) : la liste recalculée depuis contestees.json et revendique_par est celle de la table', async () => {
    const { paysTouches } = await regles;
    const contestees = lire<unknown[]>('public/geo/contestees.json');
    const t = paysTouches(pays, contestees);
    expect(t).toHaveLength(68);
    const touches = (main.superficie!.touches as { pays: string[] }).pays;
    expect(t.filter((x) => x.part >= 1).map((x) => x.id).sort()).toEqual([...touches].sort());
    expect(touches).toHaveLength(30);
  });

  it('heure locale : chaque zone se construit (Intl.DateTimeFormat, pas supportedValuesOf) ; S62 : la France a 5 fuseaux, heure légale au décalage d’hiver (États-Unis 6, Australie 5), la liste est figée', () => {
    for (const id of ids197) expect(() => new Intl.DateTimeFormat('fr', { timeZone: monde.lieux[id]!.z }), id).not.toThrow();
    const plusieurs = Object.fromEntries(ids197.filter((id) => monde.lieux[id]!.nz).map((id) => [id, monde.lieux[id]!.nz]));
    expect(plusieurs).toEqual({
      AUS: 5, BRA: 4, CAN: 6, CHL: 3, COD: 2, ECU: 2, ESP: 2, FRA: 5, FSM: 2, IDN: 3, KIR: 3, MEX: 4, MNG: 2, NLD: 2, NZL: 2, PNG: 2, PRT: 2, RUS: 11, USA: 6,
    });
    // Heure légale (décision du 18/11/2026) : la Chine à l'heure de Pékin seule (Asia/Urumqi
    // est une heure d'usage), la Nouvelle-Zélande sans Tokelau (lot F3) : deux lignes.
    expect(Object.fromEntries(lignes('fuseau').filter(([, l]) => l.nz != null).map(([id, l]) => [id, l.nz]))).toEqual({ CHN: 1, NZL: 2 });
    for (const n of Object.values(plusieurs)) expect(n).toBeGreaterThan(1);
    expect(monde.lieux.FRA!.z).toBe('Europe/Paris');
    expect(monde.lieux.XKX!.z).toBe('Europe/Belgrade');
    expect(monde.lieux.KAZ!.z).toBe('Asia/Almaty');
  });

  it('points culminants : altitude entre 1 et 8 850 m ; le Fuji à 3 776 m (S63) ; le Midžor pour la Serbie, le Kosciuszko pour l’Australie ; aucun dans une zone disputée', () => {
    for (const id of ids197) {
      if ((main.culminant![id] as { aucun?: boolean } | undefined)?.aucun) continue;
      expect(monde.lieux[id]!.alt, id).toBeGreaterThanOrEqual(1);
      expect(monde.lieux[id]!.alt, id).toBeLessThanOrEqual(8850);
      expect(Number.isInteger(monde.lieux[id]!.alt), id).toBe(true);
    }
    expect(monde.lieux.JPN!.alt).toBe(3776);
    expect([fr.lieux.SRB!.cu, monde.lieux.SRB!.alt]).toEqual(['Midžor', 2169]);
    expect([fr.lieux.AUS!.cu, monde.lieux.AUS!.alt]).toEqual(['mont Kosciuszko', 2228]);
    expect([fr.lieux.IND!.cu, monde.lieux.IND!.alt]).toEqual(['Kangchenjunga', 8586]);
    expect(fr.lieux.FRA!.cu).toBe('mont Blanc');
    // Sommets de frontière dont le pays n'a qu'un flanc : le point le plus haut de son tracé.
    expect([fr.lieux.FIN!.cu, monde.lieux.FIN!.alt]).toEqual(['versant sud du Halti', 1324]);
    expect(monde.lieux.POL!.alt).toBe(2499);
    // Gambie : « Red Rock » n'a qu'une source ; le Factbook récent, sans nom.
    expect([fr.lieux.GMB!.cu, monde.lieux.GMB!.alt]).toEqual(['point sans nom près de Sabi', 63]);
    // Décision du 18/11/2026 : Israël, le mont Méron (pas l'Hermon, dans le Golan) ; la
    // Somalie sans sommet (Shimbiris est dans le Somaliland) ; le Pakistan, le Tirich Mir
    // (le K2 est dans le Gilgit-Baltistan, à relire).
    expect([fr.lieux.ISR!.cu, monde.lieux.ISR!.alt]).toEqual(['mont Méron', 1208]);
    expect([fr.lieux.SOM!.cu, monde.lieux.SOM!.alt]).toEqual([undefined, undefined]);
    expect((main.culminant!.SOM as { aucun?: boolean }).aucun).toBe(true);
    expect([fr.lieux.PAK!.cu, monde.lieux.PAK!.alt]).toEqual(['Tirich Mir', 7708]);
    // Le Guyana : la part du Roraima est dans l'Essequibo (NE_B56), comme le K2 au Pakistan.
    expect([fr.lieux.GUY!.cu, monde.lieux.GUY!.alt]).toEqual([undefined, undefined]);
    expect(Object.entries(main.culminant!).filter(([, l]) => (l as { aucun?: boolean }).aucun).map(([k]) => k)).toEqual(['GUY', 'SOM']);
  });

  it('S56 : le sommet retenu tombe dans le tracé de son pays, ou à moins de 10 km, jamais dans une zone disputée ; les exceptions sont écrites', async () => {
    const { sommetRetenu, coordSommet, distanceAuTrace, zonesPres } = await regles;
    const tenuesPar = new Map(lire<{ id: string; dans?: string[] }[]>('public/geo/contestees.json').map((z) => [z.id, new Set(z.dans ?? [])]));
    const topo = lire<Topology>('public/geo/monde.topo.json');
    const formes = new Map((feature(topo, topo.objects.pays as never) as unknown as GeoJSON.FeatureCollection).features.map((f) => [f.properties!.id as string, f]));
    const zones = (feature(topo, topo.objects.contestees as never) as unknown as GeoJSON.FeatureCollection).features;
    const exceptions: Record<string, string> = {};
    const presZones: Record<string, string> = {};
    for (const id of ids197) {
      const ligne = main.culminant![id] as { coord?: [number, number]; hors_trace?: boolean; aucun?: boolean } | undefined;
      if (ligne?.aucun) continue;
      const { sommet } = sommetRetenu(wd.lieux[wd.pays[id]!]!.culminants ?? [], ligne);
      const coord = ligne?.coord ?? coordSommet(sommet ? wd.sommets[sommet] : null);
      if (!coord) {
        exceptions[id] = 'sans coordonnées';
        continue;
      }
      const d = distanceAuTrace(formes.get(id)!, coord);
      if (d > 10) exceptions[id] = `${Math.round(d)} km`;
      if (d === 0) expect(geoContains(formes.get(id)!, coord), id).toBe(true);
      for (const z of zones) expect(distanceAuTrace(z, coord), `${id} dans ${z.properties!.id}`).toBeGreaterThan(0);
      // Un sommet de frontière : sa part du pays (au plus près du tracé) jamais dans une zone.
      for (const z of zonesPres(zones, coord, d, id, tenuesPar)) {
        expect(z.dedans, `${id} : sa part dans ${z.zone}`).toBe(false);
        presZones[id] = `${z.zone} ${z.km} km`;
      }
    }
    // Gambie et Sénégal : sans coordonnées ; Marshall et Tuvalu : atolls que le tracé
    // simplifié n'a pas.
    expect(exceptions).toEqual({ GMB: 'sans coordonnées', MHL: '129 km', SEN: 'sans coordonnées', TUV: '154 km' });
    // Les sommets à 5 km ou moins d'une zone disputée (tracé simplifié) : à la relecture.
    expect(presZones).toEqual({ BLZ: 'NE_B51 0.5 km', BTN: 'NE_B75 2.7 km', SYR: 'NE_B16 2.8 km' });
    // Le Roraima de Wikidata (au Venezuela, à 7,2 km du tracé du Guyana et de NE_B56) : la
    // part du Guyana est dans la zone, que le contrôle voit ; il est sans ligne de sommet.
    const roraima = coordSommet(wd.sommets[sommetRetenu(wd.lieux[wd.pays.GUY!]!.culminants ?? [], undefined).sommet!]);
    expect(zonesPres(zones, roraima, distanceAuTrace(formes.get('GUY')!, roraima!), 'GUY', tenuesPar)).toEqual([{ zone: 'NE_B56', km: 0, dedans: true }]);
  });

  it('gentilés : masculin et pluriel pour les 197 ; le pluriel suit la règle sauf deux lignes de la table', async () => {
    const { plurielGentile } = await regles;
    const horsRegle: Record<string, string> = {};
    for (const id of ids197) {
      const t = fr.lieux[id]!;
      expect(t.g, id).toMatch(/^\p{Lu}/u);
      if (t.gp !== plurielGentile(t.g!)) horsRegle[id] = t.gp!;
    }
    expect(horsRegle).toEqual({ BFA: 'Burkinabè', PNG: 'Papouans-Néo-Guinéens' });
    expect(fr.lieux.GBR!.g).toBe('Britannique');
    expect(fr.lieux.FRA!.gp).toBe('Français');
    expect(() => plurielGentile('Provençal')).toThrow();
  });

  it('langues (D56 c) : la Norvège sans « no » ; chaque code a son nom ; les parlées à 10 % ou plus ; aucune officielle en double', async () => {
    expect(monde.lieux.NOR!.lo).toEqual(['nb', 'nn']);
    const codes = new Set<string>();
    for (const id of ids197) {
      const l = monde.lieux[id]!;
      expect(l.lo!.length, id).toBeGreaterThan(0);
      expect(new Set(l.lo).size, id).toBe(l.lo!.length);
      for (const c of l.lo!) codes.add(c);
      for (const [c, p] of l.lp ?? []) {
        expect(p, `${id} ${c}`).toBeGreaterThanOrEqual(10);
        expect(l.lo, `${id} ${c}`).not.toContain(c);
        codes.add(c);
      }
      expect([...l.lo!, ...(l.lp ?? []).map(([c]) => c)], id).not.toContain('no');
    }
    // Les noms servis : ceux des langues des pays et des territoires (lot F3), aucun de trop.
    for (const l of Object.values(monde.lieux)) for (const c of [...(l.lo ?? []), ...(l.lp ?? []).map(([x]) => x)]) codes.add(c);
    expect(new Set(Object.keys(fr.langues))).toEqual(codes);
    for (const [c, n] of Object.entries(fr.langues)) expect(n, c).toBeTruthy();
    expect(monde.lieux.IND!.lo).toEqual(['hi', 'en']);
    expect(monde.lieux.FRA!.lp).toBeUndefined();
    // Officielles relues contre CLDR (« de_facto_official », « official_regional ») : une
    // langue sans statut reste parlée, avec sa part ; les douze de l'Afrique du Sud.
    expect([monde.lieux.UKR!.lo, monde.lieux.UKR!.lp]).toEqual([['uk'], [['ru', 46]]]);
    expect([monde.lieux.SEN!.lo, monde.lieux.SEN!.lp?.[0]]).toEqual([['fr'], ['wo', 70]]);
    expect(monde.lieux.MDG!.lo).toEqual(['mg', 'fr']);
    expect([monde.lieux.NGA!.lo, monde.lieux.NGA!.lp?.map(([c]) => c)]).toEqual([['en'], ['pcm', 'ha', 'ig', 'yo']]);
    expect([monde.lieux.VAT!.lo, monde.lieux.VAT!.lp]).toEqual([['it'], undefined]);
    expect(monde.lieux.ZAF!.lo).toHaveLength(12);
    // Une part écrite à la main (recensement du Pakistan de 2023), l'ordre des officielles.
    expect(monde.lieux.PAK!.lp).toEqual([['pa', 37], ['ps', 18], ['sd', 14], ['skr', 12]]);
    expect(monde.lieux.KAZ!.lo).toEqual(['kk', 'ru']);
    // Chaque retrait de la table nomme une candidate de CLDR (le build le vérifie aussi).
    for (const [id, l] of lignes('langues')) {
      if (id === 'noms') continue;
      expect(l.raison, id).toBeTruthy();
      for (const [c, r] of Object.entries((l.retirer ?? {}) as Record<string, string>)) {
        expect(r, `${id} ${c}`).toBeTruthy();
        expect([...monde.lieux[id]!.lo!, ...(monde.lieux[id]!.lp ?? []).map(([x]) => x)], `${id} ${c}`).not.toContain(c);
      }
    }
  });

  it('monnaies : chaque code a son nom ; l’ordre des 7 pays à plusieurs monnaies est celui de la table', () => {
    const codes = new Set(Object.values(monde.lieux).flatMap((l) => l.m ?? []));
    expect(new Set(Object.keys(fr.monnaies))).toEqual(codes);
    const plusieurs = Object.fromEntries(ids197.filter((id) => monde.lieux[id]!.m!.length > 1).map((id) => [id, monde.lieux[id]!.m]));
    expect(plusieurs).toEqual(Object.fromEntries(lignes('monnaies').map(([id, l]) => [id, l.ordre])));
    expect(Object.keys(plusieurs)).toHaveLength(7);
    expect(monde.lieux.LSO!.m).toEqual(['LSL', 'ZAR']);
  });

  it('fêtes : jour 1 à 31, mois 1 à 12, un nom ; une ligne pour chacun des 197 pays, avec sa raison ; 19 où le Factbook donne plusieurs jours', () => {
    expect(lignes('fete').map(([id]) => id).sort()).toEqual(ids197);
    for (const id of ids197) {
      const f = monde.lieux[id]!.f;
      if (!f) continue;
      expect(f[0], id).toBeGreaterThanOrEqual(1);
      expect(f[0], id).toBeLessThanOrEqual(31);
      expect(f[1], id).toBeGreaterThanOrEqual(1);
      expect(f[1], id).toBeLessThanOrEqual(12);
    }
    expect(monde.lieux.FRA!.f).toEqual([14, 7]);
    expect(monde.lieux.CHE!.f).toEqual([1, 8]);
    expect(lignes('fete').filter(([, l]) => l.plusieurs === true)).toHaveLength(19);
  });

  it('chaque ligne des clés du lot F2 a sa raison et vise un pays', () => {
    const ids = new Set(ids197);
    for (const cle of ['superficie', 'gentile', 'culminant', 'fuseau', 'monnaies', 'langues', 'fete']) {
      expect(main[cle], cle).toBeTruthy();
      for (const [id, l] of lignes(cle)) {
        if ((cle === 'langues' && id === 'noms') || (cle === 'superficie' && id === 'touches')) continue;
        expect(ids.has(id), `${cle}.${id}`).toBe(true);
        expect(l.raison, `${cle}.${id}`).toBeTruthy();
      }
    }
  });

  it('chaque révision de Wikipédia citée par la table est dans sources.json (les valeurs qui en viennent sont servies)', () => {
    const texte = readFileSync('geodata/fiches-main.json', 'utf8');
    // Les révisions de Wikipédia (pas celle d'un item de Wikidata, citée « Wikidata Q… (révision … »).
    const citees = [...new Set([...texte.matchAll(/(?<!Wikidata Q\d+ \()révision (\d+)/g)].map((m) => Number(m[1])))].sort();
    expect(citees.length).toBeGreaterThan(5);
    const sources = lire<{ sources: { url: string; pages?: { revision: number }[] }[] }>('public/geo/sources.json');
    const wp = sources.sources.find((s) => s.url === 'https://fr.wikipedia.org');
    expect(wp?.pages?.map((p) => p.revision).sort()).toEqual(citees);
    // Le Factbook (fêtes, Gambie) et les noms de l'ISO 639 ont aussi leur ligne.
    for (const u of ['https://github.com/factbook/factbook.json', 'https://iso639-3.sil.org']) expect(sources.sources.some((s) => s.url === u), u).toBe(true);
  });

  it('les tableaux à relire sont commités, une section par table', () => {
    const t = readFileSync('docs/relectures/fiches-pays.md', 'utf8');
    for (const s of ['## 1. Fêtes nationales', '## 2. Gentilés', '## 3. Points culminants', '## 4. Langues', '## 5. Superficies', '## 6. Heure locale', '## 7. Monnaies']) expect(t).toContain(s);
    expect(t).not.toMatch(/undefined|NaN|\[object/);
    // Chaque langue à relire de la table (retrait ou ajout) est marquée dans son tableau.
    const marques = new Set([...t.matchAll(/^\| ([^|]+) \| ([a-z]{2,3}) \| .*\*\*à relire\*\* \|$/gmu)].map((m) => `${m[1]} ${m[2]}`));
    const noms = lire<Record<string, string>>('public/geo/noms.fr.json');
    const attendues = lignes('langues').flatMap(([id, l]) => (Array.isArray(l.a_relire) ? (l.a_relire as string[]).map((c) => `${noms[id]} ${c}`) : []));
    // Toutes relues par l'utilisateur le 18/11/2026 : plus aucune marque ; une marque reposée reste vérifiée ici.
    for (const a of attendues) expect(marques.has(a), a).toBe(true);
  });
});

// --- Lot F3 : les territoires, les zones contestées, l'Antarctique (§ 2.2, § 2.6, § 7) ----------

const idsDe = (sorte: string) => pays.filter((p) => monde.lieux[p.id]!.s === sorte).map((p) => p.id).sort();
const drapeauxT = lire<{ v: number; territoires: Record<string, string> }>('public/geo/drapeaux-territoires.json');

describe('fiches des territoires, des zones et de l’Antarctique : les chiffres du lot F3', () => {
  it('une ligne sans donnée n’est pas affichée : la liste des champs absents de chaque territoire est figée (§ 2.2)', () => {
    const T = idsDe('territoire');
    expect(T).toHaveLength(48);
    const champs: Record<string, (id: string) => boolean> = {
      habitants: (id) => monde.lieux[id]!.h !== undefined,
      superficie: (id) => monde.lieux[id]!.sup !== undefined,
      capitale: (id) => !!fr.lieux[id]!.ca,
      langues: (id) => !!(monde.lieux[id]!.lo?.length || monde.lieux[id]!.lp?.length),
      monnaie: (id) => !!monde.lieux[id]!.m?.length,
      gentile: (id) => !!fr.lieux[id]!.gp,
      heure: (id) => !!monde.lieux[id]!.z,
      culminant: (id) => monde.lieux[id]!.alt !== undefined && !!fr.lieux[id]!.cu,
      lien: (id) => !!fr.lieux[id]!.wp,
      drapeau: (id) => !!drapeauxT.territoires[id],
    };
    const absents = Object.fromEntries(Object.entries(champs).map(([c, a]) => [c, T.filter((id) => !a(id))]));
    // Les huit entités sans code ISO (Akrotiri, Dhekelia, Baïkonour, Guantánamo, les îles de la mer de Corail,
    // Ashmore-et-Cartier, Clipperton, Christmas et Cocos) n'ont ni langue, ni monnaie, ni drapeau.
    const sansCode = ['NE_ATC', 'NE_CLP', 'NE_CSI', 'NE_ESB', 'NE_IOA', 'NE_KAB', 'NE_USG', 'NE_WSB'];
    expect(absents).toEqual({
      // Sans chiffre dans les sources ; et, par la table (habitants_territoires, relecture du lot F3), cinq territoires sans
      // habitant permanent dont Wikidata compte le personnel (à relire).
      habitants: ['ATF', 'IOT', 'NE_CSI', 'NE_ESB', 'NE_IOA', 'NE_KAB', 'NE_USG', 'NE_WSB', 'SGS', 'UMI'],
      superficie: ['NE_IOA', 'NE_KAB'],
      capitale: ['HKG', 'HMD', 'MAC', 'NE_ATC', 'NE_CLP', 'NE_CSI', 'NE_ESB', 'NE_IOA', 'NE_KAB', 'NE_USG', 'NE_WSB', 'UMI'],
      langues: ['HMD', ...sansCode],
      monnaie: sansCode,
      gentile: ['ABW', 'AIA', 'ALA', 'ASM', 'ATF', 'COK', 'CUW', 'CYM', 'FLK', 'GGY', 'HMD', 'IMN', 'IOT', 'JEY', 'MAC', 'MNP', 'MSR', ...sansCode, 'NFK', 'NIU', 'PCN', 'SGS', 'SHN', 'SPM', 'SXM', 'TCA', 'UMI', 'VGB', 'VIR', 'WLF'],
      // Christmas et Cocos (NE_IOA) : deux heures, aucune pour l'ensemble d'ici la relecture.
      heure: ['HMD', 'NE_ATC', 'NE_CLP', 'NE_IOA', 'UMI'],
      culminant: ['AIA', 'BMU', 'CUW', 'CYM', 'FLK', 'GIB', 'IOT', 'JEY', 'MNP', 'MSR', 'NCL', 'NE_ATC', 'NE_CSI', 'NE_ESB', 'NE_IOA', 'NE_KAB', 'NE_USG', 'NE_WSB', 'NFK', 'PCN', 'SGS', 'SXM', 'UMI', 'VGB'],
      lien: [],
      drapeau: sansCode,
    });
    // Un drapeau pour chaque territoire qui a un code ISO, et pour eux seuls (la fiche lui réserve sa place).
    for (const id of T) expect(!!drapeauxT.territoires[id], id).toBe(!!pays.find((p) => p.id === id)!.a2);
  });

  it('habitants : année affichée ; 0 sans année, « aucun habitant permanent » (liste figée) ; aucun nombre positif sans année ; les 21 territoires de la Banque mondiale', () => {
    const autres = [...idsDe('territoire'), ...idsDe('zone')];
    const zero = autres.filter((id) => monde.lieux[id]!.h === 0).sort();
    expect(zero).toEqual(['HMD', 'NE_ATC', 'NE_BJN', 'NE_CLP', 'NE_SER']);
    for (const id of zero) expect(monde.lieux[id]!.ha, id).toBeUndefined();
    for (const id of autres.filter((x) => (monde.lieux[x]!.h ?? 0) > 0)) expect(monde.lieux[id]!.ha, id).toBeGreaterThanOrEqual(2000);
    const bm = lire<{ economies: Record<string, { v: number; annee: number }> }>('geodata/banque-mondiale/population.json').economies;
    const deBm = idsDe('territoire').filter((id) => bm[id]);
    expect(deBm).toHaveLength(21);
    for (const id of deBm) expect([monde.lieux[id]!.h, monde.lieux[id]!.ha, monde.lieux[id]!.hs], id).toEqual([bm[id]!.v, bm[id]!.annee, undefined]);
    // Les zones habitées, de Wikidata (D57 a : sourcées) : le Sahara occidental, Chypre du Nord, le Somaliland.
    expect(idsDe('zone').filter((id) => (monde.lieux[id]!.h ?? 0) > 0)).toEqual(['ESH', 'NE_CYN', 'NE_SOL']);
    for (const id of idsDe('zone')) if (monde.lieux[id]!.h !== undefined) expect(monde.lieux[id]!.hs, id).toBe('wd');
    // Relecture du lot F3 : cinq territoires sans habitant permanent (World Factbook) dont Wikidata compte le personnel n'ont
    // pas de ligne d'ici la réponse de l'utilisateur ; chaque ligne de la table a sa source et sa question.
    const sansPermanent = lignes('habitants_territoires');
    expect(sansPermanent.map(([id]) => id).sort()).toEqual(['ATF', 'IOT', 'NE_CSI', 'SGS', 'UMI']);
    const wd = lire<{ autres: Record<string, string>; lieux: Record<string, { habitants?: { v: number }[] }> }>('geodata/wikidata/fiches.json');
    for (const [id, l] of sansPermanent) {
      expect([l.aucun, !!l.source, !!l.a_relire], id).toEqual([true, true, true]);
      expect(monde.lieux[id]!.h, id).toBeUndefined();
      expect(wd.lieux[wd.autres[id]!]!.habitants!.some((d) => d.v > 0), id).toBe(true);
    }
  });

  it('heure : une ligne de la table par territoire, chaque zone se construit ; aucune pour les îles mineures des États-Unis ; le Groenland à Nuuk', () => {
    const t = lignes('zone_territoires');
    expect(t.map(([id]) => id).sort()).toEqual(idsDe('territoire'));
    for (const [id, l] of t) {
      expect(l.raison, id).toBeTruthy();
      if (l.aucune) expect(monde.lieux[id]!.z, id).toBeUndefined();
      else expect(monde.lieux[id]!.z, id).toBe(l.zone);
    }
    for (const id of idsDe('territoire')) {
      const z = monde.lieux[id]!.z;
      if (z) expect(() => new Intl.DateTimeFormat('fr', { timeZone: z }), id).not.toThrow();
      expect(monde.lieux[id]!.nz, id).toBeUndefined();
    }
    expect(monde.lieux.UMI!.z).toBeUndefined();
    // Relecture du lot F3 : l'heure est affichée sans clé de LIGNES_RELUES, donc aucune ligne « à relire » n'y passe
    // (Christmas et Cocos : pas d'heure d'ici la réponse) ; de même pour les habitants des territoires.
    for (const [cle, champ] of [['zone_territoires', 'z'], ['habitants_territoires', 'h']] as const) {
      for (const [id, l] of lignes(cle)) if (l.a_relire) expect(monde.lieux[id]![champ], `${cle}.${id}`).toBeUndefined();
    }
    expect(lignes('zone_territoires').filter(([, l]) => l.a_relire).map(([id]) => id)).toEqual(['NE_IOA']);
    expect(monde.lieux.GRL!.z).toBe('America/Nuuk');
    expect(monde.lieux.HKG!.z).toBe('Asia/Hong_Kong');
  });

  it('points culminants : altitude entre 1 et 8 850 m ; aucun pour une zone ; les Malouines et la Géorgie du Sud sans sommet (zones disputées) ; l’Antarctique au massif Vinson', () => {
    for (const id of [...idsDe('territoire'), 'ATA']) {
      const a = monde.lieux[id]!.alt;
      if (a !== undefined) expect(a, id).toBeGreaterThanOrEqual(1);
      if (a !== undefined) expect(a, id).toBeLessThanOrEqual(8850);
    }
    for (const id of idsDe('zone')) expect(monde.lieux[id]!.alt, id).toBeUndefined();
    expect([monde.lieux.FLK!.alt, monde.lieux.SGS!.alt]).toEqual([undefined, undefined]);
    expect([fr.lieux.GRL!.cu, monde.lieux.GRL!.alt]).toEqual(['Gunnbjørn', 3694]);
    expect([fr.lieux.ATA!.cu, monde.lieux.ATA!.alt]).toEqual(['massif Vinson', 4892]);
  });

  it('chaque ligne des clés du lot F3 a sa raison et vise un territoire (ou l’Antarctique pour un sommet)', () => {
    const T = new Set(idsDe('territoire'));
    for (const cle of ['capitale_territoires', 'habitants_territoires', 'zone_territoires', 'langues_territoires', 'gentile_territoires', 'culminant_territoires']) {
      expect(main[cle], cle).toBeTruthy();
      for (const [id, l] of lignes(cle)) {
        if (cle === 'langues_territoires' && id === 'noms') continue;
        expect(T.has(id) || (cle === 'culminant_territoires' && id === 'ATA'), `${cle}.${id}`).toBe(true);
        expect(l.raison, `${cle}.${id}`).toBeTruthy();
      }
    }
  });

  it('le tableau à relire des chiffres est commité, une section par table, et dit ce qui est tu', () => {
    const t = readFileSync('docs/relectures/fiches-territoires-chiffres.md', 'utf8');
    for (const x of ['## 1. Capitales', '## 2. Habitants', '## 3. Superficies', '## 4. Langues', '## 5. Monnaies', '## 6. Gentilés', '## 7. Heure locale', '## 8. Points culminants', '## 9. Liens']) expect(t).toContain(x);
    for (const k of ['capitale_territoires', 'habitants_zones', 'superficie_territoires', 'langues_territoires', 'gentile_territoires', 'culminant_territoires']) expect(t, k).toContain(`tant que \`${k}\``);
    expect(t).not.toMatch(/undefined|NaN|\[object/);
  });
});

// --- Lot F4 : les 50 océans et mers (§ 2.3, § 2.7, § 7) ------------------------------------

type FicheMerBrute = { s: string; sup?: number; ss?: string; p?: number; ps?: string; r?: string[] };
type Mer = { id: string; sorte: string; parents: string[]; enclavee?: boolean };
type ReglesMers = {
  superficieWikidata: (d: Decl[] | undefined, trace: number) => { v: number | null; comment: string };
  profondeurWikidata: (d: Decl[] | undefined) => { v: number | null; comment: string };
  riverainsTrace: (marine: GeoJSON.FeatureCollection, pays: GeoJSON.FeatureCollection, aff: { ne_id: number; id?: string }[]) => Record<string, Record<string, number>>;
  sousMers: (id: string, zones: Mer[]) => string[];
  chiffresMers: (e: Record<string, unknown>) => { lieux: Record<string, FicheMerBrute>; relecture: { riverains: { id: string; lignes: { mer: string; id: string; garde?: string[] }[] }[] } };
};
const reglesMers = import('../geodata/fiches-mers.mjs' as string) as Promise<ReglesMers>;
const brutMers = readFileSync('public/geo/fiches-mers.json', 'utf8');
const brutMersFr = readFileSync('public/geo/fiches-mers.fr.json', 'utf8');
const fichesMers = JSON.parse(brutMers) as { v: number; lieux: Record<string, FicheMerBrute> };
const fichesMersFr = JSON.parse(brutMersFr) as { v: number; lieux: Record<string, { wp?: string }> };
const zonesMers = lire<Mer[]>('public/geo/mers.json');
const oceans = zonesMers.filter((z) => z.sorte === 'océan').map((z) => z.id);

describe('fiches des océans et des mers : le lot F4', () => {
  it('les 50 zones ont leur entrée, dans les deux fichiers, dans l’ordre de mers.json ; sorte mer ; un titre de Wikipédia chacune', () => {
    expect(fichesMers.v).toBe(1);
    expect(fichesMersFr.v).toBe(1);
    expect(Object.keys(fichesMers.lieux)).toEqual(zonesMers.map((z) => z.id));
    expect(Object.keys(fichesMers.lieux).sort()).toEqual([...IDS_MERS].sort());
    expect(Object.keys(fichesMersFr.lieux)).toEqual(zonesMers.map((z) => z.id));
    for (const [id, l] of Object.entries(fichesMers.lieux)) {
      expect(l.s, id).toBe(sorteDeLieu(id, 'monde'));
      expect(Object.keys(l).every((k) => ['s', 'sup', 'ss', 'p', 'ps', 'r'].includes(k)), id).toBe(true);
      expect(fichesMersFr.lieux[id]?.wp, id).toMatch(/^[^_]+$/);
    }
    expect(fichesMersFr.lieux.medit?.wp).toBe('Mer Méditerranée');
  });

  it('aucun champ vide sans le vouloir : superficie pour les 50, à trois chiffres ; profondeur pour 49 (pas le golfe de Californie)', () => {
    for (const [id, l] of Object.entries(fichesMers.lieux)) {
      expect(l.sup, id).toBeGreaterThan(0);
      const p = 10 ** (Math.floor(Math.log10(l.sup!)) - 2);
      expect(l.sup! % p, id).toBe(0);
      if (l.ss !== undefined) expect(['ne', 'wp', 'noaa'], id).toContain(l.ss);
      if (l.ps !== undefined) expect(l.ps, id).toBe('wp');
      if (l.p !== undefined) {
        expect(l.p, id).toBeGreaterThan(1);
        expect(l.p, id).toBeLessThan(11_100);
      }
    }
    expect(Object.entries(fichesMers.lieux).filter(([, l]) => l.p === undefined).map(([id]) => id)).toEqual(['californ']);
    // Les océans d'après la NOAA ; les 4 mers sans valeur dans Wikidata, le tracé ; les 8 corrigées, Wikipédia.
    expect(oceans.map((o) => fichesMers.lieux[o]!.ss)).toEqual(['noaa', 'noaa', 'noaa', 'noaa', 'noaa']);
    const par = (s: string) => Object.entries(fichesMers.lieux).filter(([, l]) => l.ss === s).map(([id]) => id).sort();
    expect(par('ne')).toEqual(['guinee', 'ionienne', 'mozamb', 'oman']);
    expect(par('wp')).toEqual(['aden', 'baffin', 'beaufort', 'chineor', 'hudson', 'irlande', 'sargasse', 'tyrrhen']);
    expect(Object.entries(fichesMers.lieux).filter(([, l]) => l.ps).map(([id]) => id).sort()).toEqual(['groenl', 'oman', 'sargasse']);
  });

  it('riverains : aucun pour un océan ni pour la mer des Sargasses ; 44 listes ; chaque id est une entité de la carte, une fois', () => {
    const ids = new Set(pays.map((p) => p.id));
    const sans = Object.entries(fichesMers.lieux).filter(([, l]) => !l.r).map(([id]) => id);
    expect(sans.sort()).toEqual([...oceans, 'sargasse'].sort());
    for (const [id, l] of Object.entries(fichesMers.lieux)) {
      if (!l.r) continue;
      expect(l.r.length, id).toBeGreaterThan(0);
      expect([...l.r].sort(), id).toEqual(l.r);
      expect(new Set(l.r).size, id).toBe(l.r.length);
      for (const r of l.r) expect(ids.has(r), `${id} ${r}`).toBe(true);
    }
  });

  it('riverains : la règle (union, d’office, table) donne les cas du § 2.3', () => {
    const r = (id: string) => fichesMers.lieux[id]!.r ?? [];
    // Méditerranée : Malte (Wikidata seul) ; Gibraltar, Akrotiri et Dhekelia (tracé) ; ni le Royaume-Uni (d'office), ni
    // Saint-Marin (enclavé : ligne de l'Adriatique, qui vaut pour sa mère), ni la zone tampon de Chypre.
    expect(r('medit')).toContain('MLT');
    for (const x of ['GIB', 'NE_ESB', 'NE_WSB', 'SVN']) expect(r('medit'), x).toContain(x);
    for (const x of ['GBR', 'SMR', 'NE_CNM']) expect(r('medit'), x).not.toContain(x);
    expect(r('adriat')).toEqual(['ALB', 'BIH', 'GRC', 'HRV', 'ITA', 'MNE', 'SVN']);
    // D'office : les États-Unis par Porto Rico, le Royaume-Uni par ses territoires, la France par la Nouvelle-Calédonie, le Danemark par le Groenland.
    for (const [m, x] of [['caraibes', 'USA'], ['caraibes', 'GBR'], ['corail', 'FRA'], ['groenl', 'DNK']] as const) expect(r(m), `${m} ${x}`).not.toContain(x);
    // Un souverain que le tracé donne reste : la France sur le canal du Mozambique (Mayotte).
    expect(r('mozamb')).toContain('FRA');
    // Les faux positifs du tracé, retirés par la table.
    expect(r('japon')).not.toContain('CHN');
    expect(r('nord')).not.toContain('SWE');
    expect(r('laurent')).toEqual(['CAN', 'SPM']);
    // Les États disparus de Wikidata n'existent pas comme entités : la Russie reste, le Yémen aussi (par le tracé).
    expect(r('noire')).toContain('RUS');
    expect(r('arabie')).toContain('YEM');
  });

  it('chaque ligne des clés du lot F4 a sa raison et vise une zone (et, pour les riverains, une entité)', () => {
    const zones = new Set(zonesMers.map((z) => z.id));
    const ids = new Set(pays.map((p) => p.id));
    for (const cle of ['superficie_mers', 'profondeur_mers']) {
      expect(main[cle], cle).toBeTruthy();
      for (const [id, l] of lignes(cle)) {
        expect(zones.has(id), `${cle}.${id}`).toBe(true);
        expect(l.raison, `${cle}.${id}`).toBeTruthy();
      }
    }
    // Les cinq océans ont leur ligne de superficie (aucune valeur unique : les limites varient).
    for (const o of oceans) expect(main.superficie_mers?.[o]?.source, o).toBe('noaa');
    const riv = (main as unknown as { riverains_mers: Record<string, Record<string, { retire?: string; ajoute?: string }>> }).riverains_mers;
    let n = 0;
    for (const [m, l] of Object.entries(riv)) {
      if (m.startsWith('_')) continue;
      expect(zones.has(m) && !oceans.includes(m), m).toBe(true);
      for (const [id, x] of Object.entries(l)) {
        n++;
        expect(ids.has(id), `${m} ${id}`).toBe(true);
        expect(!!x.retire !== !!x.ajoute, `${m} ${id}`).toBe(true);
      }
    }
    expect(n).toBe(16);
    for (const [q, l] of lignes('riverains_items')) {
      expect(q).toMatch(/^Q\d+$/);
      expect(l.raison, q).toBeTruthy();
    }
  });

  it('règles : superficie (préférée, puis la plus proche du tracé ; mi² convertis) et profondeur (maximum, sinon la seule)', async () => {
    const { superficieWikidata, profondeurWikidata, sousMers } = await reglesMers;
    const d = (v: number, rang = 'normal', unite = 'Q712226', q: Record<string, string[]> = {}): Decl => ({ id: `x${v}`, rang, v, unite, q });
    expect(superficieWikidata([d(1_249_000, 'preferred'), d(750_000)], 741_112)).toMatchObject({ v: 1_249_000, comment: 'préférée' });
    expect(superficieWikidata([d(1_048_950), d(978_000)], 1_066_902)).toMatchObject({ v: 1_048_950, comment: 'la plus proche du tracé' });
    expect(superficieWikidata([d(2_000_000, 'normal', 'Q232291')], 3e6).v).toBeCloseTo(5_179_976, 0);
    expect(superficieWikidata(undefined, 1).v).toBeNull();
    const M = 'Q10578722';
    expect(profondeurWikidata([d(8605, 'normal', 'Q11573', { P1013: [M] }), d(3646, 'normal', 'Q11573', { P1013: ['Q202785'] })])).toMatchObject({ v: 8605, comment: 'maximum' });
    expect(profondeurWikidata([d(7235, 'normal', 'Q11573'), d(7235, 'normal', 'Q11573')])).toMatchObject({ v: 7235, comment: 'seule' });
    expect(profondeurWikidata([d(4800, 'normal', 'Q11573'), d(5600, 'normal', 'Q11573')])).toMatchObject({ v: null, comment: 'ambiguë' });
    expect(profondeurWikidata([d(2000, 'normal', 'Q11573', { P1013: ['Q2796622'] })])).toMatchObject({ v: null, comment: 'aucune' });
    expect(sousMers('medit', zonesMers).sort()).toEqual(['adriat', 'egee', 'ionienne', 'tyrrhen']);
    expect(sousMers('noire', zonesMers)).toEqual(['azov']);
  });

  it('une ligne « retire » d’une sous-mer vaut pour sa mère, sauf si une autre partie de la mère donne ce riverain', async () => {
    const { chiffresMers } = await reglesMers;
    // L'océan o ; la mère m, et ses deux filles a et b. Le tracé : S et X sur a, X sur b. La table retire S et X de a.
    const zones = [
      { id: 'o', sorte: 'océan', parents: [], superficie_km2: 100 },
      { id: 'm', sorte: 'mer', parents: ['o'], superficie_km2: 10 },
      { id: 'a', sorte: 'mer', parents: ['m'], superficie_km2: 5 },
      { id: 'b', sorte: 'mer', parents: ['m'], superficie_km2: 5 },
    ];
    const r = chiffresMers({
      zones,
      titres: {},
      wd: { etats: {}, mers: {}, lieux: {} },
      itemsCarte: new Map(),
      entites: [{ id: 'S' }, { id: 'X' }],
      trace: { o: {}, m: {}, a: { S: 5, X: 5 }, b: { X: 5 } },
      main: { souverain: {}, superficie_mers: {}, profondeur_mers: {}, riverains_mers: { a: { S: { retire: 'enclavé' }, X: { retire: 'pas sur a' } } }, riverains_items: {} },
    });
    expect(r.lieux.a!.r).toBeUndefined();
    expect(r.lieux.b!.r).toEqual(['X']);
    // S n'est donné que par a : retiré de m aussi ; X, donné par b, reste riverain de m (le tableau le dit).
    expect(r.lieux.m!.r).toEqual(['X']);
    expect(r.relecture.riverains.find((x) => x.id === 'm')!.lignes.find((l) => l.id === 'X')!.garde).toEqual(['b']);
  });

  it('règle du tracé : une côte à moins de 0,12° de la zone, en 2 points au moins', async () => {
    const { riverainsTrace } = await reglesMers;
    const carre = (x0: number, y0: number, x1: number, y1: number) => ({ type: 'Polygon' as const, coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
    const fc = (fs: { geometry: GeoJSON.Polygon; properties: Record<string, unknown> }[]) => ({ type: 'FeatureCollection' as const, features: fs.map((f) => ({ type: 'Feature' as const, ...f })) });
    const marine = fc([{ geometry: carre(0, 0, 1, 1), properties: { ne_id: 1 } }]);
    const pays2 = fc([
      { geometry: carre(1.05, 0, 2, 1), properties: { ADM0_A3: 'AAA', ISO_A3: 'AAA' } }, // côte à 0,05° : riverain
      { geometry: carre(1.5, 0, 2, 1), properties: { ADM0_A3: 'BBB', ISO_A3: 'BBB' } }, // à 0,5° : non
    ]);
    const r = riverainsTrace(marine as GeoJSON.FeatureCollection, pays2 as GeoJSON.FeatureCollection, [{ ne_id: 1, id: 'mer' }]);
    expect(Object.keys(r.mer!)).toEqual(['AAA']);
    expect(r.mer!.AAA).toBeGreaterThanOrEqual(2);
  });

  it('critère de fin du lot (§ 8) : la Méditerranée, l’Adriatique (sa mère), l’Atlantique (sans riverains), la mer des Sargasses', () => {
    expect(fichesMers.lieux.medit).toMatchObject({ s: 'mer', sup: 2_500_000, p: 5267 });
    expect(fichesMers.lieux.medit!.r).toHaveLength(26);
    expect(zonesMers.find((z) => z.id === 'adriat')!.parents).toEqual(['medit']);
    expect(fichesMers.lieux.adriat).toMatchObject({ sup: 139_000, p: 1233 });
    expect(fichesMers.lieux.atlant).toEqual({ s: 'mer', sup: 85_100_000, ss: 'noaa', p: 8605 });
    expect(fichesMers.lieux.sargasse).toEqual({ s: 'mer', sup: 3_000_000, ss: 'wp', p: 7000, ps: 'wp' });
  });

  it('poids : 3 Ko compressés au plus pour chacun des deux fichiers des mers (§ 2.7)', () => {
    expect(gzipSync(brutMers, { level: 9 }).length).toBeLessThanOrEqual(3 * 1024);
    expect(gzipSync(brutMersFr, { level: 9 }).length).toBeLessThanOrEqual(3 * 1024);
  });

  it('le tableau à relire des mers est commité, ses trois sections disent ce qui est tu', () => {
    const t = readFileSync('docs/relectures/fiches-mers.md', 'utf8');
    for (const x of ['## 1. Pays riverains', '## 2. Superficies', '## 3. Profondeurs']) expect(t).toContain(x);
    for (const k of ['riverains_mers', 'superficie_mers', 'profondeur_mers']) expect(t, k).toContain(`tant que \`${k}\``);
    expect(t).not.toMatch(/undefined|NaN|\[object/);
    // Une ligne par mer dans chaque section : 45 pour les riverains, 50 pour les superficies et les profondeurs.
    expect(t.match(/^\| mer Méditerranée/gm)).toHaveLength(3);
    const section = (n: number) => t.split(/^## /m).find((x) => x.startsWith(`${n}. `))!;
    const lignesDe = (x: string) => x.split('\n').filter((l) => /^\| (?!Mer \||Item \||---)/.test(l) && !/^\|---/.test(l));
    expect(lignesDe(section(1).split('Items de Wikidata')[0]!)).toHaveLength(45);
    expect(lignesDe(section(2))).toHaveLength(50);
    expect(lignesDe(section(3))).toHaveLength(50);
  });
});

// --- Lot F5 : les 24 communes de La Réunion (§ 2.4, § 7) -------------------------------------

type FicheCommune = { s: string; h: number; ha: number; sup: number; ic: string };
const brutIle = readFileSync('public/geo/reunion/fiches.json', 'utf8');
const brutIleFr = readFileSync('public/geo/reunion/fiches.fr.json', 'utf8');
const fichesIle = JSON.parse(brutIle) as { v: number; lieux: Record<string, FicheCommune> };
const fichesIleFr = JSON.parse(brutIleFr) as { v: number; intercommunalites: Record<string, string>; lieux: Record<string, { wp?: string; g?: string; gp?: string; gs?: string }> };
type ModuleCommunes = {
  chiffresCommunes: (o: Record<string, unknown>) => { lieux: Record<string, { wp?: string; g?: string; gp?: string }>; intercommunalites: Record<string, string>; fautes: string[] };
};
const reglesCommunes = import('../geodata/fiches-communes.mjs' as string) as Promise<ModuleCommunes>;

describe('fiches des communes de La Réunion : le lot F5', () => {
  const ids = communes.map((c) => c.id);

  it('les 24 communes ont leur entrée, dans les deux fichiers, dans l’ordre de communes.json ; sorte commune ; aucune pour un id inconnu', () => {
    expect(fichesIle.v).toBe(1);
    expect(fichesIleFr.v).toBe(1);
    expect(Object.keys(fichesIle.lieux)).toEqual(ids);
    expect(Object.keys(fichesIleFr.lieux)).toEqual(ids);
    for (const [id, l] of Object.entries(fichesIle.lieux)) {
      expect(l.s, id).toBe(sorteDeLieu(id, 'reunion'));
      expect(Object.keys(l), id).toEqual(['s', 'h', 'ha', 'sup', 'ic']);
    }
  });

  it('aucun champ vide : habitants (recensement de 2023), superficie, intercommunalité, titre, gentilé et son pluriel pour les 24 ; total de l’île 889 679', () => {
    for (const [id, l] of Object.entries(fichesIle.lieux)) {
      expect(Number.isInteger(l.h) && l.h > 0, id).toBe(true);
      expect(l.ha, id).toBe(2023);
      // Superficie cadastrale : des hectares, au centième de km².
      expect(l.sup, id).toBeGreaterThan(10);
      expect(Math.round(l.sup * 100) / 100, id).toBe(l.sup);
      expect(fichesIleFr.intercommunalites[l.ic], id).toBeTruthy();
      const t = fichesIleFr.lieux[id]!;
      expect(t.wp, id).toMatch(/^[^_]+$/);
      expect(t.g, id).toBeTruthy();
      expect(t.gp, id).toMatch(/s$/);
      expect(t.gs, id).toBeUndefined();
    }
    expect(Object.values(fichesIle.lieux).reduce((n, l) => n + l.h, 0)).toBe(889_679);
  });

  it('les cinq intercommunalités : leur sigle, leurs communes (CIVIS 6, CASUD 4, CIREST 6, TCO 5, CINOR 3)', () => {
    const membres = (sigle: string) => Object.entries(fichesIle.lieux).filter(([, l]) => fichesIleFr.intercommunalites[l.ic] === sigle).map(([id]) => id);
    expect(Object.values(fichesIleFr.intercommunalites).sort()).toEqual(['CASUD', 'CINOR', 'CIREST', 'CIVIS', 'TCO']);
    expect(membres('CIVIS')).toEqual(['97401', '97404', '97405', '97414', '97416', '97424']);
    expect(membres('CASUD')).toEqual(['97403', '97412', '97417', '97422']);
    expect(membres('CIREST')).toEqual(['97402', '97406', '97409', '97410', '97419', '97421']);
    expect(membres('TCO')).toEqual(['97407', '97408', '97413', '97415', '97423']);
    expect(membres('CINOR')).toEqual(['97411', '97418', '97420']);
    const sigles = lignes('epci');
    expect(sigles.map(([k]) => k).sort()).toEqual(Object.keys(fichesIleFr.intercommunalites).sort());
    for (const [k, l] of sigles) expect(l.raison, k).toBeTruthy();
  });

  it('gentilés : la forme de Wikidata au pluriel de la règle ; les 4 lignes à relire (Saint-Benoît, Petite-Île, L’Étang-Salé, Sainte-Marie) gardent la forme', () => {
    const g = (id: string) => fichesIleFr.lieux[id]!.gp;
    expect(g('97416')).toBe('Saint-Pierrois');
    expect(g('97411')).toBe('Dionysiens');
    expect(g('97410')).toBe('Bénédictins');
    expect(g('97405')).toBe('Petite-Îlois');
    expect(g('97404')).toBe('Étang-Saléens');
    expect(g('97418')).toBe('Sainte-Mariens');
    // Relu et validé tel quel par l'utilisateur le 18/11 : les quatre lignes « à relire » retirées, la forme de Wikidata prise.
    expect(lignes('gentile_communes')).toEqual([]);
  });

  it('règles : une ligne qui ne s’applique plus, un sigle sans intercommunalité, un nom de l’IGN changé : le build échoue', async () => {
    const { chiffresCommunes } = await reglesCommunes;
    const decl = (v: string) => [{ id: 'x', rang: 'normal', v, q: {} }];
    const base = () => ({
      fiches: { lieux: { A: { s: 'commune', h: 10, ha: 2023, sup: 1, ic: '1' } } },
      communes: [{ id: 'A', superficie_km2: 1 }],
      noms: { A: 'A' },
      sourcesIle: { traitement: { intercommunalites: { '1': 'CA Un (UN)' } } },
      wd: { communes: { A: 'Q1' }, lieux: { Q1: { fr: 'A', frwiki: 'A', gentiles: decl('Aïen') } } },
      main: { epci: { '1': { sigle: 'UN', nom_ign: 'CA Un (UN)', raison: 'r' } }, gentile_communes: {} as Record<string, unknown> },
    });
    const ok = chiffresCommunes(base());
    expect(ok.fautes).toEqual([]);
    expect(ok.lieux.A).toEqual({ wp: 'A', g: 'Aïen', gp: 'Aïens' });
    expect(ok.intercommunalites).toEqual({ '1': 'UN' });
    // Une forme masculine écrite égale à celle de Wikidata : ligne inutile.
    const inutile = base();
    inutile.main.gentile_communes = { A: { masculin: 'Aïen', raison: 'r' } };
    expect(chiffresCommunes(inutile).fautes.join()).toMatch(/ligne inutile/);
    // Une forme hors de Wikidata sans sa source.
    const sansSource = base();
    sansSource.main.gentile_communes = { A: { masculin: 'Aïon', raison: 'r' } };
    expect(chiffresCommunes(sansSource).fautes.join()).toMatch(/sa source à écrire/);
    // Le nom de l'IGN a changé : le sigle est à relire.
    const renomme = base();
    renomme.sourcesIle.traitement.intercommunalites['1'] = 'CA Deux';
    expect(chiffresCommunes(renomme).fautes.join()).toMatch(/sigle à relire/);
    // Une ligne d'intercommunalité que plus aucune commune ne cite.
    const orpheline = base();
    (orpheline.main.epci as Record<string, unknown>)['2'] = { sigle: 'DEUX', nom_ign: 'x', raison: 'r' };
    expect(chiffresCommunes(orpheline).fautes.join()).toMatch(/aucune commune/);
    // Deux formes dans Wikidata, sans ligne.
    const deux = base();
    deux.wd.lieux.Q1.gentiles = [...decl('Aïen'), { id: 'y', rang: 'normal', v: 'Aïois', q: {} }];
    expect(chiffresCommunes(deux).fautes.join()).toMatch(/à trancher/);
  });

  it('critère de fin du lot (§ 8) : Saint-Pierre a ses habitants de 2023, sa superficie, « les Saint-Pierrois », la CIVIS, ses voisines', () => {
    expect(fichesIle.lieux['97416']).toEqual({ s: 'commune', h: 85_038, ha: 2023, sup: 96, ic: '249740077' });
    expect(fichesIleFr.intercommunalites['249740077']).toBe('CIVIS');
    expect(fichesIleFr.lieux['97416']).toEqual({ wp: 'Saint-Pierre (La Réunion)', g: 'Saint-Pierrois', gp: 'Saint-Pierrois' });
    expect(lire<{ id: string; voisins: string[] }[]>('public/geo/reunion/communes.json').find((c) => c.id === '97416')!.voisins).toEqual(['97403', '97405', '97412', '97414', '97422']);
  });

  it('poids : 2 Ko compressés au plus pour chacun des deux fichiers des communes (§ 2.7)', () => {
    expect(gzipSync(brutIle, { level: 9 }).length).toBeLessThanOrEqual(2 * 1024);
    expect(gzipSync(brutIleFr, { level: 9 }).length).toBeLessThanOrEqual(2 * 1024);
  });

  it('le tableau à relire des communes est commité : les gentilés relus et affichés, les intercommunalités et les chiffres en ligne, une ligne par commune', () => {
    const t = readFileSync('docs/relectures/fiches-communes.md', 'utf8');
    for (const x of ['## 1. Gentilés', '## 2. Intercommunalités', '## 3. Habitants et superficies']) expect(t).toContain(x);
    expect(t).toContain('section relue et validée (`gentile_communes` à `true`');
    expect(t).not.toContain('tant que `gentile_communes`');
    expect(t).not.toMatch(/undefined|NaN|\[object/);
    expect(t.match(/^\| Saint-Pierre \|/gm)).toHaveLength(2);
    expect(t).not.toContain('**à relire**');
    expect(t).toMatch(/889\s679/);
  });
});
