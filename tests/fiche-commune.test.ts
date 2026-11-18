// La fiche d'une commune de La Réunion (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2.4, § 4.1,
// § 4.2, § 4.5 et § 8 ; lot F5) : ce que la fiche compose (pure), puis la vue de l'accueil sur l'île : les fiches des
// communes au premier toucher sur l'île seulement, la barre « 85 000 hab. », la fiche, les communes voisines (des
// boutons qui restent sur l'île), « ‹ ». Les vraies données du dépôt (communes.json, reunion/fiches*.json), le DOM
// factice : la mise en page, le focus réel et le vol de la carte sont au pilote (ui_fiche).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chargerFichesCommunes, oublierFichesCommunes } from '../src/fiches/chargeur';
import { lireFichesCommunes, type DonneesFichesCommunes, type FichierCommunes, type FichierCommunesLangue } from '../src/fiches/donnees';
import { LIGNES_RELUES, type LigneRelue } from '../src/fiches/relues';
import type { Pays } from '../src/map/types';
import type { ContexteVue } from '../src/vues/commun';
import { vueExplorer, type OptionsFiche } from '../src/vues/explorer';
import { composerFiche, type ModeleFiche } from '../src/vues/fiche';
import { remplir, textes } from '../src/vues/textes';
import { textesFiche } from '../src/vues/textes-fiche';
import { El, installerDom } from './dom-factice';

const lire = <T>(f: string): T => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8')) as T;
const pays = lire<Pays[]>('pays.json');
const noms = lire<Record<string, string>>('noms.fr.json');
const communes = lire<Pays[]>('reunion/communes.json');
const nomsIle = lire<Record<string, string>>('reunion/noms.fr.json');
const COMMUNES: DonneesFichesCommunes = lireFichesCommunes(lire<FichierCommunes>('reunion/fiches.json'), lire<FichierCommunesLangue>('reunion/fiches.fr.json'));
const T = textesFiche;
const S = T.noms_sources;
const TOUTES = Object.fromEntries(Object.keys(LIGNES_RELUES).map((k) => [k, true])) as Record<LigneRelue, boolean>;
const AUCUNE = Object.fromEntries(Object.keys(LIGNES_RELUES).map((k) => [k, false])) as Record<LigneRelue, boolean>;
const SAINT_PIERRE = '97416';
/** Espaces insécables en espaces simples, pour comparer. */
const simple = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');

function composer(id: string, relues?: Record<LigneRelue, boolean>): ModeleFiche {
  const m = composerFiche(id, {
    entites: communes,
    nom: (x) => nomsIle[x] ?? x,
    fiches: { lieux: new Map(), sousRegions: {} },
    communes: COMMUNES,
    capitales: null,
    drapeaux: null,
    memoire: () => null,
    ...(relues ? { relues } : {}),
  });
  if (!m) throw new Error(`${id} : pas de fiche`);
  return m;
}
const lignesDe = (m: ModeleFiche) => m.faits.map((f) => simple(`${f.libelle} · ${f.valeur}`));

describe('la fiche d’une commune (composerFiche, pure)', () => {
  it('critère de fin du lot (§ 8) : Saint-Pierre, ses habitants de 2023, sa superficie, « les Saint-Pierrois », la CIVIS, ses voisines', () => {
    const m = composer(SAINT_PIERRE, TOUTES);
    expect(m).toMatchObject({ terrain: 'reunion', sorte: 'commune', nom: 'Saint-Pierre', statut: '', drapeaux: [], avecDrapeau: false, titreVoisins: T.voisines });
    expect(lignesDe(m)).toEqual([
      `${T.habitants} · 85 038 (recensement de 2023)`,
      `${T.superficie} · 96 km²`,
      `${T.gentile} · les Saint-Pierrois`,
      `${T.intercommunalite} · CIVIS`,
    ]);
    // Les voisines : des communes de l'île, par ordre alphabétique, sans statut.
    expect(m.voisins.map((v) => v.texte)).toEqual(['Entre-Deux', 'Le Tampon', 'Petite-Île', 'Saint-Joseph', 'Saint-Louis']);
    expect(m.voisins.map((v) => v.id)).toEqual(['97403', '97422', '97405', '97412', '97414']);
    expect(m.wikipedia).toBe(`${T.wikipedia_base}Saint-Pierre_(La_R%C3%A9union)`);
    expect(m.sources).toEqual([S.ign, S.insee, S.wikidata]);
  });

  it('avant la relecture (LIGNES_RELUES.gentile_communes) : pas de ligne « Gentilé » ; les habitants, la superficie, l’intercommunalité restent', () => {
    expect(LIGNES_RELUES.gentile_communes).toBe(false);
    const m = composer(SAINT_PIERRE);
    expect(lignesDe(m).map((l) => l.split(' · ')[0])).toEqual([T.habitants, T.superficie, T.intercommunalite]);
    expect(lignesDe(composer(SAINT_PIERRE, AUCUNE))).toEqual(lignesDe(m));
    // Wikidata reste cité : le lien vient de lui.
    expect(m.sources).toEqual([S.ign, S.insee, S.wikidata]);
  });

  it('les 24 communes ont leur fiche, aucune ligne vide ; la superficie est le cadastre (Entre-Deux 66,8 km², pas les 51,6 du tracé)', () => {
    for (const c of communes) {
      const m = composer(c.id, TOUTES);
      expect(m.faits.map((f) => f.libelle), c.id).toEqual([T.habitants, T.superficie, T.gentile, T.intercommunalite]);
      for (const f of m.faits) expect(f.valeur.trim(), `${c.id} ${f.libelle}`).not.toBe('');
      expect(m.voisins.length, c.id).toBeGreaterThan(0);
      expect(m.wikipedia, c.id).toMatch(/^https:\/\/fr\.wikipedia\.org\/wiki\//);
    }
    expect(lignesDe(composer('97403'))[1]).toBe(`${T.superficie} · 66,8 km²`);
    expect(lignesDe(composer('97411'))[0]).toBe(`${T.habitants} · 155 634 (recensement de 2023)`);
    // Les quatre gentilés à relire : la forme de Wikidata, au pluriel de la règle.
    const g = (id: string) => lignesDe(composer(id, TOUTES))[2];
    expect([g('97410'), g('97405'), g('97404'), g('97418')]).toEqual(['Bénédictins', 'Petite-Îlois', 'Étang-Saléens', 'Sainte-Mariens'].map((x) => `${T.gentile} · les ${x}`));
  });

  it('un id que les fiches des communes n’ont pas : pas de fiche', () => {
    expect(composerFiche('JPN', { entites: communes, nom: (x) => x, fiches: { lieux: new Map(), sousRegions: {} }, communes: COMMUNES, capitales: null, drapeaux: null, memoire: () => null })).toBeNull();
  });

  it('chargerFichesCommunes lit les deux fichiers de l’île une fois ; un échec n’est pas gardé', async () => {
    oublierFichesCommunes();
    const lus: string[] = [];
    let echec = true;
    const lecteur = async (c: string) => {
      lus.push(c);
      if (echec) throw new TypeError('hors ligne');
      return JSON.parse(readFileSync(`public${c}`, 'utf8')) as unknown;
    };
    await expect(chargerFichesCommunes(lecteur)).rejects.toThrow('hors ligne');
    echec = false;
    const d = await chargerFichesCommunes(lecteur);
    expect(d.get(SAINT_PIERRE)?.intercommunalite).toBe('CIVIS');
    await chargerFichesCommunes(lecteur);
    expect(lus.slice(-2).sort()).toEqual(['/geo/reunion/fiches.fr.json', '/geo/reunion/fiches.json']);
    expect(lus).toHaveLength(4);
    oublierFichesCommunes();
  });
});

// --- La vue de l'accueil, sur l'île ------------------------------------------------------------

const tenir = () => new Promise((r) => setTimeout(r, 0));

function monter(fiche: Partial<OptionsFiche> = {}) {
  installerDom();
  const zone = new El('main');
  let pick = 'FRA';
  const carte = (montres: string[]) => ({
    cacherPastilles() {},
    effacerMarques() {},
    marquer() {},
    anneau() {},
    anneauEn() {},
    teinter() {},
    pick: () => ({ id: pick, via: 'trace' }),
    hote: new El('div'),
    montrer: (id: string) => void montres.push(id),
    vueEntiere() {},
    contexteFinal: () => ({ proj: { scale: () => 100 }, t: { k: 50 } }),
    projection: { scale: () => 100 },
    transfo: { k: 1 },
  });
  const montresMonde: string[] = [];
  const montresIle: string[] = [];
  const donnees = { entites: pays.map((p) => ({ pays: p })), noms };
  const monde = { nom: 'monde', carte: carte(montresMonde), donnees, jouables: pays.filter((p) => p.statut === 'jouable').map((p) => p.id) };
  const ile = { nom: 'reunion', carte: carte(montresIle), donnees: { entites: communes.map((c) => ({ pays: c })), noms: nomsIle }, jouables: communes.map((c) => c.id) };
  let ileChargee = false;
  const terrainsMontres: string[] = [];
  const ctx = {
    carte: monde.carte,
    donnees,
    zone,
    terrains: {
      monde,
      montrer: (n: string) => void terrainsMontres.push(n),
      deja: (n: string) => (n === 'reunion' && ileChargee ? ile : null),
      charger: (n: string) => (n === 'reunion' ? ((ileChargee = true), Promise.resolve(ile)) : Promise.reject(new Error(n))),
    },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const charges: string[] = [];
  const options: OptionsFiche = {
    fiches: () => (charges.push('fiches'), Promise.reject(new Error('pas les fiches du monde ici'))),
    capitales: () => (charges.push('capitales'), Promise.reject(new Error('pas les capitales ici'))),
    drapeaux: () => (charges.push('drapeaux'), Promise.reject(new Error('pas de drapeaux ici'))),
    fichesCommunes: () => (charges.push('communes'), Promise.resolve(COMMUNES)),
    module: () => import('../src/vues/fiche'),
    relues: TOUTES,
    ...fiche,
  };
  const vue = vueExplorer(ctx, { fiche: options });
  const el = (sel: string) => zone.querySelector(sel);
  return {
    vue,
    zone,
    charges,
    montresIle,
    montresMonde,
    terrainsMontres,
    toucher(id: string) {
      pick = id;
      vue.toucher?.(1, 1, {} as PointerEvent);
    },
    nom: () => el('#barre-carte .barre-nom')!.textContent,
    faits: () => simple(el('#barre-carte .barre-faits')!.textContent),
    chevron: () => !el('#barre-carte .barre-chevron')!.hidden,
    bouton: () => el('#barre-fiche')!,
    ouverte: () => !!el('#fiche-lieu') && !el('#fiche-lieu')!.hidden,
    titre: () => el('#fiche-titre')?.textContent ?? null,
    lignes: () => (el('#fiche-lieu')?.querySelectorAll('.fiche-fait') ?? []).map((f) => simple(`${f.querySelector('dt')!.textContent} · ${f.querySelector('dd')!.textContent}`)),
    voisins: () => (el('#fiche-lieu')?.querySelectorAll('.fiche-voisins .fiche-voisin') ?? []).map((b) => b.textContent),
    titreVoisins: () => el('#fiche-voisins-titre')?.textContent ?? null,
    voisin: (nom: string) => (el('#fiche-lieu')!.querySelectorAll('.fiche-voisins .fiche-voisin').find((b) => b.textContent === nom) as unknown as { click(): void }).click(),
    avant: () => (el('#fiche-lieu .fiche-avant') as unknown as { click(): void }).click(),
    sources: () => simple(el('#fiche-lieu .fiche-sources')?.textContent),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('accueil : la fiche d’une commune (#34, lot F5)', () => {
  it('les fiches des communes partent au premier toucher sur l’île, jamais au premier affichage ni pour un pays ; la barre dit « 85 000 hab. »', async () => {
    const a = monter();
    a.vue.activer();
    a.toucher('FRA');
    await tenir();
    expect(a.charges).not.toContain('communes');
    // Ce que la France a demandé (les fiches du monde, les capitales) : rien de plus ne part pour une commune.
    const duMonde = a.charges.slice();
    // La recherche montre une commune : l'île chargée, la commune montrée (un toucher), ses fiches demandées.
    a.vue.montrerLieu('reunion', SAINT_PIERRE);
    await vi.waitFor(() => expect(a.chevron()).toBe(true));
    expect(a.nom()).toBe('Saint-Pierre');
    expect(a.faits()).toBe('85 000 hab.');
    expect(a.charges.filter((c) => c === 'communes')).toHaveLength(1);
    // Un autre toucher sur l'île : tout de suite, sans rien relire.
    a.toucher('97411');
    expect(a.nom()).toBe('Saint-Denis');
    expect(a.faits()).toBe('156 000 hab.');
    expect(a.chevron()).toBe(true);
    expect(a.charges.filter((c) => c === 'communes')).toHaveLength(1);
    // Ni les fiches du monde, ni les capitales, ni les drapeaux pour une commune : seules celles des communes en plus.
    expect(a.charges.filter((c) => c !== 'communes')).toEqual(duMonde);
  });

  it('sans fiches des communes (hors ligne) : pas de chevron, la barre n’ouvre rien ; le toucher suivant réessaie', async () => {
    let echec = true;
    const a = monter({ fichesCommunes: () => (echec ? Promise.reject(new TypeError('hors ligne')) : Promise.resolve(COMMUNES)) });
    a.vue.activer();
    a.vue.montrerLieu('reunion', SAINT_PIERRE);
    await vi.waitFor(() => expect(a.nom()).toBe('Saint-Pierre'));
    await tenir();
    expect(a.chevron()).toBe(false);
    expect(a.faits()).toBe('');
    (a.bouton() as unknown as { click(): void }).click();
    await tenir();
    expect(a.ouverte()).toBe(false);
    echec = false;
    a.toucher(SAINT_PIERRE);
    await vi.waitFor(() => expect(a.chevron()).toBe(true));
  });

  it('la fiche de Saint-Pierre : ses lignes, ses communes voisines ; une voisine s’ouvre sur l’île, la carte vole jusqu’à elle ; « ‹ » rend Saint-Pierre', async () => {
    const a = monter();
    a.vue.activer();
    a.vue.montrerLieu('reunion', SAINT_PIERRE);
    await vi.waitFor(() => expect(a.chevron()).toBe(true));
    (a.bouton() as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.ouverte()).toBe(true));
    expect(a.titre()).toBe('Saint-Pierre');
    expect(a.lignes()).toEqual([`${T.habitants} · 85 038 (recensement de 2023)`, `${T.superficie} · 96 km²`, `${T.gentile} · les Saint-Pierrois`, `${T.intercommunalite} · CIVIS`]);
    expect(a.titreVoisins()).toBe(T.voisines);
    expect(a.voisins()).toEqual(['Entre-Deux', 'Le Tampon', 'Petite-Île', 'Saint-Joseph', 'Saint-Louis']);
    expect(a.sources()).toBe(`${remplir(T.sources, { sources: [S.ign, S.insee, S.wikidata].join(' · ') })} · ${T.credits}`);
    a.voisin('Le Tampon');
    await vi.waitFor(() => expect(a.titre()).toBe('Le Tampon'));
    expect(a.lignes()[0]).toBe(`${T.habitants} · 82 579 (recensement de 2023)`);
    expect(a.lignes()[3]).toBe(`${T.intercommunalite} · CASUD`);
    // Le vol vers la voisine, sur la carte de l'île (deux images plus tard), jamais sur celle du monde.
    await vi.waitFor(() => expect(a.montresIle).toContain('97422'));
    expect(a.montresMonde).toEqual([]);
    a.avant();
    await vi.waitFor(() => expect(a.titre()).toBe('Saint-Pierre'));
    await vi.waitFor(() => expect(a.montresIle.at(-1)).toBe(SAINT_PIERRE));
  });

  it('« × » après une voisine : la fiche fermée, la voisine dans la barre, l’île gardée (rien sur la carte du monde)', async () => {
    const a = monter();
    a.vue.activer();
    a.vue.montrerLieu('reunion', SAINT_PIERRE);
    await vi.waitFor(() => expect(a.chevron()).toBe(true));
    (a.bouton() as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.titre()).toBe('Saint-Pierre'));
    a.voisin('Le Tampon');
    await vi.waitFor(() => expect(a.montresIle).toContain('97422'));
    (a.zone.querySelector('#fiche-lieu .croix') as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.ouverte()).toBe(false));
    expect(a.zone.querySelector('#barre-carte')!.dataset.id).toBe('97422');
    expect(a.nom()).toBe('Le Tampon');
    expect(a.faits()).toBe('82 600 hab.');
    expect(a.montresMonde).toEqual([]);
    expect(a.terrainsMontres).not.toContain('monde');
  });

  it('une entrée de fiche de l’île rendue depuis le monde, l’île pas encore chargée (un retour, § 4.4) : l’île chargée avec les fiches, la commune montrée, sa fiche', async () => {
    const a = monter();
    a.vue.activer();
    a.vue.surFiche({ terrain: 'reunion', id: SAINT_PIERRE, rang: 1 });
    await vi.waitFor(() => expect(a.titre()).toBe('Saint-Pierre'));
    expect(a.lignes()[3]).toBe(`${T.intercommunalite} · CIVIS`);
    await vi.waitFor(() => expect(a.montresIle).toContain(SAINT_PIERRE));
    expect(a.montresMonde).toEqual([]);
    expect(a.charges.filter((c) => c === 'communes')).toHaveLength(1);
  });

  it('avant la relecture : pas de ligne « Gentilé »', async () => {
    const a = monter({ relues: AUCUNE });
    a.vue.activer();
    a.vue.montrerLieu('reunion', '97410');
    await vi.waitFor(() => expect(a.chevron()).toBe(true));
    (a.bouton() as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.titre()).toBe('Saint-Benoît'));
    expect(a.lignes().map((l) => l.split(' · ')[0])).toEqual([T.habitants, T.superficie, T.intercommunalite]);
    expect(a.lignes()).toContain(`${T.intercommunalite} · CIREST`);
  });

  it('une commune sans fiches des communes branchées (les tests d’avant, ?teintes=demo) : ni chevron ni chargement', async () => {
    const a = monter({ fichesCommunes: undefined });
    a.vue.activer();
    a.vue.montrerLieu('reunion', SAINT_PIERRE);
    await vi.waitFor(() => expect(a.nom()).toBe('Saint-Pierre'));
    await tenir();
    expect(a.chevron()).toBe(false);
    expect(a.charges).toEqual([]);
  });
});
