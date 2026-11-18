// Statuts des territoires et des zones contestées (#34, lot F3 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2.2, § 8 et § 9, D57) : les textes
// écrits à la main dans geodata/fiches-main.json (formes_statut, souverain, tenant,
// statut), servis dans public/geo/fiches-monde*.json par geodata/fiches.mjs, et leur
// tableau à relire docs/relectures/fiches-territoires.md. Tout se lit dans les fichiers
// commités (en CI) ; seule la confrontation à SOV_A3 lit le .dbf brut de Natural Earth,
// là où il est (geodata/raw/, pas en CI).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type FormePays = { le: string; de: string };
type Ligne = Record<string, unknown> & { texte: string; raison: string; a_relire?: string; ajouts?: Record<string, { nom?: string; raison: string }>; retraits?: Record<string, string> };
type Souverain = Ligne & { pays: string; forme: string; ne: { sov: string; type: string }; hors_modele?: string; verifie_le?: string };
type Statut = Ligne & { source: string; verifie_le: string };
type Tenant = { par?: string[]; autres?: string[]; raison: string };
type Main = {
  formes_statut: Record<string, { libelle: string; modele: string; raison: string } | string>;
  souverain: Record<string, Souverain | string>;
  tenant: Record<string, Tenant | string>;
  statut: Record<string, Statut | string>;
};
type Module = {
  statutsLieux: (a: unknown) => { lieux: Record<string, { sv: string; fs: string }>; textes: Record<string, { st: string }>; relecture: unknown; fautes: string[] };
  texteRelectureTerritoires: (a: { R: unknown; noms: Record<string, string>; relues: Record<string, boolean> }) => string;
  formesCitees: (f: FormePays) => string[];
  remplirModele: (m: string, f: FormePays) => string;
  lireDbf: (b: Buffer) => Record<string, string>[];
  idNe: (p: Record<string, string>) => string;
  verifierNe: (e: Record<string, string>[], main: unknown) => string[];
  SOUVERAINS_NE: Record<string, string>;
  DBF_NE: string;
  CHEMIN_RELECTURE_TERRITOIRES: string;
};
// Import dynamique sans types : le module est en JavaScript, sans déclaration.
const module = import('../geodata/fiches-territoires.mjs' as string) as Promise<Module>;
const relecture = import('../geodata/fiches-relecture.mjs' as string) as Promise<{ lireRelues: (t: string) => Record<string, boolean> }>;

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
type Entite = { id: string; statut: string; revendique_par?: string[]; note_ne?: string };
const entites = lire<Entite[]>('public/geo/pays.json');
const contestees = lire<{ id: string; dans: string[]; revendique_par: string[]; note?: string }[]>('public/geo/contestees.json');
const noms = lire<Record<string, string>>('public/geo/noms.fr.json');
const formesPays = lire<{ formes_pays: Record<string, FormePays> }>('src/vues/textes.fr.json').formes_pays;
const main = lire<Main>('geodata/fiches-main.json');
const monde = lire<{ lieux: Record<string, { s: string; sv?: string; fs?: string }> }>('public/geo/fiches-monde.json');
const fr = lire<{ lieux: Record<string, { st?: string }> }>('public/geo/fiches-monde.fr.json');
const lignes = <T>(o: Record<string, T | string>): [string, T][] => Object.entries(o).filter((e): e is [string, T] => !e[0].startsWith('_'));
const territoires = entites.filter((e) => e.statut === 'territoire').map((e) => e.id).sort();
const zones = entites.filter((e) => e.statut === 'conteste').map((e) => e.id).sort();
const estPays = (id: string) => entites.some((e) => e.id === id && (e.statut === 'jouable' || e.statut === 'optionnel'));
const parId = new Map(entites.map((e) => [e.id, e]));

describe('statuts des territoires et des zones (lot F3, § 2.2)', () => {
  it('une ligne par territoire (souverain) et par zone (tenant, statut), aucune de trop ; 48 et 12', () => {
    expect(territoires).toHaveLength(48);
    expect(zones).toHaveLength(12);
    expect(lignes(main.souverain).map(([id]) => id).sort()).toEqual(territoires);
    expect(lignes(main.tenant).map(([id]) => id).sort()).toEqual(zones);
    expect(lignes(main.statut).map(([id]) => id).sort()).toEqual(zones);
  });

  it('chaque statut est servi : le texte dans fiches-monde.fr.json, le pays et la forme d’un territoire dans fiches-monde.json', () => {
    const souverain = Object.fromEntries(lignes(main.souverain));
    const statut = Object.fromEntries(lignes(main.statut));
    for (const id of territoires) {
      const l = souverain[id]!;
      expect(fr.lieux[id]?.st, id).toBe(l.texte);
      // Les chiffres du lot F3 suivent (tests/donnees-fiches.test.ts) : ici, la sorte, le pays et la forme.
      expect(monde.lieux[id], id).toMatchObject({ s: 'territoire', sv: l.pays, fs: l.forme });
      expect(estPays(l.pays), `${id} : ${l.pays}`).toBe(true);
      expect(main.formes_statut[l.forme], `${id} : ${l.forme}`).toBeTruthy();
    }
    for (const id of zones) expect(fr.lieux[id]?.st, id).toBe(statut[id]!.texte);
  });

  it('chaque ligne a sa raison ; une zone a sa source et sa date de vérification ; ajouts et retraits ont leur raison', () => {
    for (const [id, l] of [...lignes(main.souverain), ...lignes(main.statut)]) {
      expect(l.texte?.trim(), id).toBeTruthy();
      expect(l.raison, id).toBeTruthy();
      for (const [a, x] of Object.entries(l.ajouts ?? {})) expect(x.raison, `${id} ajout ${a}`).toBeTruthy();
      for (const [r, raison] of Object.entries(l.retraits ?? {})) expect(raison, `${id} retrait ${r}`).toBeTruthy();
    }
    for (const [id, l] of lignes(main.statut)) {
      expect(l.source, id).toBeTruthy();
      expect(l.verifie_le, id).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
    for (const [id, t] of lignes(main.tenant)) expect(t.raison, id).toBeTruthy();
  });

  it('aucun texte n’est une note de Natural Earth (note_ne de pays.json, note de contestees.json), ni ne la contient', () => {
    const notes = [...entites.map((e) => e.note_ne), ...contestees.map((c) => c.note)].filter((n): n is string => !!n).map((n) => n.trim().toLowerCase());
    expect(notes.length).toBeGreaterThan(30);
    for (const [id, l] of [...lignes(main.souverain), ...lignes(main.statut)]) {
      const t = l.texte.toLowerCase();
      for (const n of notes) expect(t.includes(n), `${id} : « ${n} »`).toBe(false);
    }
  });

  it('revendicants : le texte cite ceux de revendique_par (et des zones hachurées d’un territoire), plus les ajouts écrits, jamais un retrait', async () => {
    const { formesCitees } = await module;
    const cite = (texte: string, id: string) => formesCitees(formesPays[id]!).some((x) => texte.includes(x));
    const verifier = (id: string, l: Ligne, donnees: string[]) => {
      const retraits = Object.keys(l.retraits ?? {});
      for (const r of retraits) {
        expect(donnees, `${id} : retrait ${r}`).toContain(r);
        expect(cite(l.texte, r), `${id} cite ${r}, retiré`).toBe(false);
      }
      for (const r of donnees.filter((x) => !retraits.includes(x))) expect(cite(l.texte, r), `${id} ne cite pas ${r}`).toBe(true);
      for (const [a, x] of Object.entries(l.ajouts ?? {})) {
        expect(donnees, `${id} : ajout ${a}`).not.toContain(a);
        expect(estPays(a) ? cite(l.texte, a) : l.texte.includes(x.nom!), `${id} ne cite pas l’ajout ${a}`).toBe(true);
      }
    };
    for (const [id, l] of lignes(main.statut)) verifier(id, l, parId.get(id)?.revendique_par ?? []);
    for (const [id, l] of lignes(main.souverain)) {
      const dedans = contestees.filter((c) => c.dans.includes(id)).flatMap((c) => c.revendique_par);
      verifier(id, l, [...new Set([...(parId.get(id)?.revendique_par ?? []), ...dedans])]);
    }
    // Les ajouts et retraits écrits, figés : une ligne nouvelle se voit.
    const ecarts = (o: Record<string, Ligne | string>) => lignes(o).flatMap(([id, l]) => [...Object.keys(l.ajouts ?? {}).map((a) => `${id} +${a}`), ...Object.keys(l.retraits ?? {}).map((r) => `${id} -${r}`)]);
    expect([...ecarts(main.statut), ...ecarts(main.souverain)].sort()).toEqual(['ASM +TKL', 'ATF +COM', 'ATF -SYC', 'ESH +RASD', 'GRL -CAN', 'IOT +MDV', 'IOT -SYC', 'NE_BJN -NIC', 'NE_SER -NIC']);
  });

  it('tenants : chaque pays qui tient une zone est cité par son texte ; Bir Tawil n’a ni tenant ni revendicant', async () => {
    const { formesCitees } = await module;
    const statut = Object.fromEntries(lignes(main.statut));
    for (const [id, t] of lignes(main.tenant)) {
      for (const p of t.par ?? []) {
        expect(estPays(p), `${id} : ${p}`).toBe(true);
        expect(formesCitees(formesPays[p]!).some((x) => statut[id]!.texte.includes(x)), `${id} : ${p}`).toBe(true);
      }
    }
    const brt = Object.fromEntries(lignes(main.tenant)).NE_BRT!;
    expect(brt.par ?? []).toEqual([]);
    expect(brt.autres ?? []).toEqual([]);
    expect(parId.get('NE_BRT')?.revendique_par).toEqual([]);
  });

  it('le pays souverain : nommé avec son article ; le texte suit le modèle de sa forme, ou dit pourquoi ; chaque forme sert', async () => {
    const { formesCitees, remplirModele, SOUVERAINS_NE } = await module;
    const servies = new Set<string>();
    for (const [id, l] of lignes(main.souverain)) {
      const f = formesPays[l.pays]!;
      expect(formesCitees(f).some((x) => l.texte.includes(x)), `${id} : ${f.le}`).toBe(true);
      const forme = main.formes_statut[l.forme] as { modele: string };
      expect(l.texte.includes(remplirModele(forme.modele, f)) || !!l.hors_modele, id).toBe(true);
      // SOV_A3 de Natural Earth, recopié dans la ligne : converti, il donne le pays.
      expect(SOUVERAINS_NE[l.ne.sov] ?? l.ne.sov, id).toBe(l.pays);
      servies.add(l.forme);
    }
    expect([...servies].sort()).toEqual(lignes(main.formes_statut).map(([f]) => f).sort());
  });

  it('relus à la main : quelques statuts attendus (étude, § 8 « Fin »)', () => {
    const s = Object.fromEntries(lignes(main.souverain));
    expect([s.GRL!.pays, s.GRL!.forme]).toEqual(['DNK', 'partie_autonome']);
    expect([s.FRO!.pays, s.FRO!.forme]).toEqual(['DNK', 'partie_autonome']);
    expect([s.HKG!.pays, s.HKG!.forme]).toEqual(['CHN', 'region_administrative_speciale']);
    expect([s.ABW!.pays, s.ABW!.forme]).toEqual(['NLD', 'pays_constitutif']);
    expect([s.ALA!.pays, s.ALA!.forme]).toEqual(['FIN', 'region_autonome']);
    expect([s.COK!.forme, s.NIU!.forme]).toEqual(['etat_associe', 'etat_associe']);
    expect([s.NE_KAB!.pays, s.NE_USG!.pays, s.NE_KAB!.forme, s.NE_USG!.forme]).toEqual(['KAZ', 'CUB', 'loue', 'loue']);
    expect([s.NE_WSB!.forme, s.NE_ESB!.forme]).toEqual(['base', 'base']);
    expect(['FLK', 'GIB', 'IOT', 'SGS'].map((id) => s[id]!.forme)).toEqual(['revendique', 'revendique', 'revendique', 'revendique']);
    // Les Chagos : la date de vérification du traité de 2025, pas en vigueur ce jour-là.
    expect(s.IOT!.verifie_le).toBe('18/11/2026');
    expect(s.IOT!.texte).toContain("n'est pas en vigueur");
    // Le Sahara occidental : la RASD citée, la partie que la carte dessine dite.
    const z = Object.fromEntries(lignes(main.statut));
    expect(z.ESH!.texte).toContain('RASD');
    expect(z.ESH!.texte).toContain('le Maroc');
    expect(z.NE_BRT!.texte).toContain('aucun État');
  });

  it('le build des statuts, sur les fichiers commités : aucune faute, et les fichiers servis et le tableau à relire sont les siens', async () => {
    const { statutsLieux, texteRelectureTerritoires, CHEMIN_RELECTURE_TERRITOIRES } = await module;
    const r = statutsLieux({ entites, contestees, main, formesPays, noms });
    expect(r.fautes).toEqual([]);
    for (const [id, l] of Object.entries(r.lieux)) expect(monde.lieux[id], id).toMatchObject(l);
    for (const [id, t] of Object.entries(r.textes)) expect(fr.lieux[id]?.st, id).toBe(t.st);
    expect(CHEMIN_RELECTURE_TERRITOIRES).toBe('docs/relectures/fiches-territoires.md');
    const relues = (await relecture).lireRelues(readFileSync('src/fiches/relues.ts', 'utf8'));
    expect(texteRelectureTerritoires({ R: r.relecture, noms, relues })).toBe(readFileSync(CHEMIN_RELECTURE_TERRITOIRES, 'utf8'));
  });

  it('le build échoue sur un texte qui recopie une note, qui oublie un revendicant, qui cite un retrait ou qui oublie le pays', async () => {
    const { statutsLieux } = await module;
    const copie = (): Main => JSON.parse(JSON.stringify(main)) as Main;
    const fautes = (m: Main) => statutsLieux({ entites, contestees, main: m, formesPays, noms }).fautes;
    let m = copie();
    (m.statut.ESH as Statut).texte = parId.get('ESH')!.note_ne!;
    expect(fautes(m).join('\n')).toMatch(/ESH : le texte recopie une note/);
    m = copie();
    (m.statut.NE_KAS as Statut).texte = "Tenu par l'Inde depuis 1984";
    expect(fautes(m).join('\n')).toMatch(/NE_KAS : le texte ne cite pas Pakistan/);
    m = copie();
    (m.statut.NE_BJN as Statut).texte += ' et le Nicaragua';
    expect(fautes(m).join('\n')).toMatch(/NE_BJN : le texte cite Nicaragua, retiré/);
    m = copie();
    (m.souverain.GRL as Souverain).texte = 'Partie autonome';
    expect(fautes(m).join('\n')).toMatch(/souverain\.GRL : le texte ne nomme pas le Danemark/);
    m = copie();
    delete m.souverain.WLF;
    expect(fautes(m).join('\n')).toMatch(/souverain : WLF .* sans ligne/);
  });

  it('le tableau à relire : en-tête, règle, trois tables ; chaque ligne à relire y est marquée avec son doute', () => {
    const t = readFileSync('docs/relectures/fiches-territoires.md', 'utf8');
    expect(t).toContain('ne pas éditer ce fichier');
    expect(t).toContain('## Comment relire, comment corriger');
    expect(t).toContain('D57');
    for (const s of ['## 1. Les 12 zones contestées', '## 2. Les formes de statut', '## 3. Les 48 territoires']) expect(t).toContain(s);
    expect(t).not.toMatch(/undefined|NaN|\[object/);
    for (const [id, l] of [...lignes(main.statut), ...lignes(main.souverain)]) {
      if (l.a_relire) expect(t, id).toContain(`**à relire** : ${l.a_relire}`);
      expect(t, id).toContain(`« ${l.texte} »`);
    }
  });
});

const dbf = 'geodata/raw/natural-earth/ne_10m_admin_0_countries.dbf';
describe.skipIf(!existsSync(dbf))('SOV_A3 de Natural Earth (là où geodata/raw/ a le .dbf brut)', () => {
  it('chaque territoire a, dans le .dbf, le SOV_A3 et le TYPE de sa ligne, et SOV_A3 converti donne son pays', async () => {
    const { lireDbf, verifierNe, idNe, SOUVERAINS_NE } = await module;
    const enr = lireDbf(readFileSync(dbf));
    expect(enr).toHaveLength(258);
    expect(new Set(enr.map(idNe))).toEqual(new Set(entites.map((e) => e.id)));
    expect(verifierNe(enr, main)).toEqual([]);
    // Les codes à convertir sont ceux des territoires, aucun de trop (FI1 : Åland, en plus des dix de l'étude).
    const codes = new Set(enr.filter((p) => territoires.includes(idNe(p))).map((p) => p.SOV_A3!).filter((c) => !estPays(c)));
    expect([...codes].sort()).toEqual(Object.keys(SOUVERAINS_NE).sort());
  });
});
