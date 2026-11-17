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
  construireFiches: (racine: string) => Promise<{ fichiers: Record<string, string>; relecture: { chemin: string; texte: string }; entrees: Record<string, string> }>;
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
type TexteBrut = { wp?: string; g?: string; gp?: string; cu?: string; fn?: string };
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
  });

  it('le script et le code s’accordent sur la sorte de chaque statut', async () => {
    const { sorteEntite } = await module;
    for (const s of ['jouable', 'optionnel', 'territoire', 'conteste', 'autre'] as const) expect(sorteEntite(s), s).toBe(sorteDeLieu('ABC', 'monde', s));
    expect(sorteEntite('inconnu')).toBeNull();
  });

  it('un titre de Wikipédia pour chacun des 197 pays, une entrée vide pour les 61 autres (sans QID ni chiffres avant le lot F3)', () => {
    let vides = 0;
    for (const p of pays) {
      const t = fr.lieux[p.id]!;
      if (monde.lieux[p.id]!.s === 'pays') {
        expect(t.wp, p.id).toBeTruthy();
        expect(t.wp, p.id).not.toMatch(/_|^https?:/);
      } else {
        expect(t, p.id).toEqual({});
        expect(monde.lieux[p.id], p.id).toEqual({ s: monde.lieux[p.id]!.s });
        vides++;
      }
    }
    expect(vides).toBe(61);
    // La table à la main : le titre du royaume pour le Danemark et les Pays-Bas.
    expect(fr.lieux.DNK?.wp).toBe('Danemark');
    expect(fr.lieux.NLD?.wp).toBe('Pays-Bas');
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

  const raw = ['geodata/raw/cldr/supplemental/territoryInfo.json', 'geodata/raw/tz/tzdata2026e.tar.gz'];
  it.skipIf(!raw.every((f) => existsSync(f)))('reproduction : construireFiches (npm run fiches) redonne les fichiers commités, les tableaux à relire et les empreintes de sources.json (là où geodata/raw/ a CLDR et tz)', async () => {
    const { construireFiches } = await module;
    const r = await construireFiches('.');
    expect(r.fichiers['fiches-monde.json']).toBe(brutMonde);
    expect(r.fichiers['fiches-monde.fr.json']).toBe(brutFr);
    expect(r.relecture.chemin).toBe('docs/relectures/fiches-pays.md');
    expect(r.relecture.texte).toBe(readFileSync(r.relecture.chemin, 'utf8'));
    const sources = lire<{ traitement: { entrees: Record<string, string> } }>('public/geo/sources.json');
    expect(Object.keys(r.entrees).sort()).toEqual(['geodata/fiches-main.json', 'geodata/fiches-pays.mjs', 'geodata/fiches-relecture.mjs', 'geodata/fiches-sources.mjs', 'geodata/fiches.mjs']);
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
    const codes = new Set(ids197.flatMap((id) => monde.lieux[id]!.m!));
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
    expect(attendues.length).toBeGreaterThan(15);
    for (const a of attendues) expect(marques.has(a), a).toBe(true);
  });
});
