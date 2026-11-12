// Les mers à l'accueil (étude J2, § 2.3 et § 6.4 ; D45 a, D47 a ; lot 3b,
// partie A) : toucher l'eau du monde donne le nom de la mer, par la couche
// légère seule (mers-leger.topo.json, mers.json, mers.fr.json, jamais
// mers.topo.json), lue au premier toucher en mer seulement : rien au premier
// affichage, rien pour un toucher sur un pays ; la couche fine sert si elle
// est déjà lue ; rien d'autre à l'écran (aucun calque marin dessiné ni
// teinté). Avec « Mers » dans la carte de la mémoire : la couche posée, ses
// zones teintées. Une mer choisie dans la recherche : cadrée, allumée.
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptesDe } from '../src/map/acceptes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { contient, versEcran } from '../src/map/geo';
import { assemblerMers, chargerMers, oublierMers, type CoucheMers } from '../src/map/mers';
import { calculerPastilles } from '../src/map/pastilles';
import { pick, type ContexteCarte } from '../src/map/pick';
import { cadre, placer, projectionDe, transfoDe, type VueGlobe } from '../src/map/vue';
import type { CarteMemoire } from '../src/vues/carte-memoire';
import type { ContexteVue } from '../src/vues/commun';
import { vueExplorer } from '../src/vues/explorer';
import { textes } from '../src/vues/textes';
import { El, installerDom } from './dom-factice';

const lireJson = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const monde: DonneesCarte = assembler(lireJson('monde.topo.json') as Topology<never>, lireJson('pays.json'), lireJson('contestees.json'), lireJson('noms.fr.json'));
const fine: CoucheMers = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
const C = cadre(384, 723);
/** Le nom de la zone de la couche fine qui contient ll. */
const merEn = (ll: [number, number]) => fine.noms[fine.mers.find((e) => contient(e.forme, e.pays.bbox, ll))!.pays.id]!;

/** Les fichiers lus (sans le dossier). */
const lus: string[] = [];

function monter(memoire?: CarteMemoire) {
  const donnees: DonneesCarte = { ...monde, mers: [] };
  /** La vue de la carte : le monde au zoom 4 sur les Caraïbes (déplacée par voir()). */
  let v: VueGlobe = placer(C, [-60, 20], 192, 361, 4, true);
  const contexte = (): ContexteCarte => {
    const proj = projectionDe(v.r, C);
    return { proj, t: transfoDe(v, C), entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, v.k), acceptes: acceptesDe(donnees), mers: donnees.mers };
  };
  const marques: string[] = [];
  const teintes: (ReadonlyMap<string, number> | null)[] = [];
  const carte = {
    hote: new El('div'),
    contexte,
    contexteFinal: contexte,
    pick: (x: number, y: number) => pick(contexte(), x, y),
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    anneauEn: (p: [number, number], c: string) => void marques.push(`anneauEn ${p.join(',')}:${c}`),
    montrer: vi.fn(),
    teinter: (t: ReadonlyMap<string, number> | null) => void teintes.push(t),
    prendreMers: vi.fn((c: CoucheMers) => void (donnees.mers = c.mers)),
  };
  const zone = new El('main');
  const t = { nom: 'monde', carte, donnees, jouables: [], credit: null };
  const ctx = {
    carte,
    donnees,
    zone,
    terrains: { monde: t, montrer() {}, deja: () => null },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const vue = vueExplorer(ctx, memoire ? { memoire } : {});
  /** Touche le point [lon, lat], la carte centrée dessus au zoom k. */
  const toucher = (ll: [number, number], k = 8) => {
    v = placer(C, ll, 192, 361, k, true);
    const c = contexte();
    const b = c.proj(ll) as [number, number];
    const [x, y] = versEcran(c.t, b[0], b[1]);
    vue.toucher?.(x, y, {} as PointerEvent);
  };
  const nom = () => zone.querySelector('#barre-carte .barre-nom')!.textContent;
  const detail = () => zone.querySelector('#barre-carte .barre-detail')!.textContent;
  return { vue, carte, donnees, marques, teintes, toucher, nom, detail };
}

const CARAIBES: [number, number] = [-78, 14];
const FRANCE: [number, number] = [2.5, 46.5];
const PACIFIQUE: [number, number] = [-130, -40];
const MEDITERRANEE: [number, number] = [20, 34];

beforeEach(() => {
  installerDom();
  lus.length = 0;
  oublierMers(async (f) => (lus.push(f), readFileSync(`public/geo/${f}`, 'utf8')));
});
afterEach(() => {
  oublierMers();
  vi.unstubAllGlobals();
});

describe('accueil : le nom de la mer touchée (D45 a)', () => {
  it('rien de mers* au premier affichage ; un toucher sur un pays : son nom, rien de marin chargé', async () => {
    const a = monter();
    a.vue.activer();
    expect(a.nom()).toBe(textes.carte.touche);
    a.toucher(FRANCE);
    expect(a.nom()).toBe('France');
    await new Promise((r) => setTimeout(r, 10));
    expect(lus).toEqual([]);
    expect(a.carte.prendreMers).not.toHaveBeenCalled();
  });

  it('l’eau touchée : « Mer », puis le nom de la mer, par la couche légère seule (jamais mers.topo.json) ; rien de dessiné ni de posé', async () => {
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    expect(a.nom()).toBe(textes.carte.mer);
    await vi.waitFor(() => expect(a.nom()).toBe('mer des Caraïbes'));
    expect([...lus].sort()).toEqual(['mers-leger.topo.json', 'mers.fr.json', 'mers.json']);
    expect(a.carte.prendreMers).not.toHaveBeenCalled();
    expect(a.donnees.mers).toEqual([]);
    expect(a.marques).toEqual([]);
    expect(a.teintes.every((t) => t === null)).toBe(true);
    // Le suivant, tout de suite, sans rien relire.
    a.toucher(PACIFIQUE, 1);
    expect(a.nom()).toBe(merEn(PACIFIQUE));
    a.toucher(MEDITERRANEE);
    expect(a.nom()).toBe('mer Méditerranée');
    expect(lus).toHaveLength(3);
  });

  it('la couche fine déjà lue (une partie de mers) : elle sert, sans rien lire de plus', async () => {
    await chargerMers();
    lus.length = 0;
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    expect(a.nom()).toBe('mer des Caraïbes');
    expect(lus).toEqual([]);
  });

  it('un autre toucher (un pays) avant l’arrivée de la couche : le pays reste affiché', async () => {
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    a.toucher(FRANCE);
    await new Promise((r) => setTimeout(r, 20));
    expect(lus).toHaveLength(3);
    expect(a.nom()).toBe('France');
  });

  it('hors ligne : « Mer » reste, sans erreur ; le toucher suivant réessaie', async () => {
    oublierMers(async (f) => {
      lus.push(f);
      throw new TypeError('hors ligne');
    });
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    await new Promise((r) => setTimeout(r, 10));
    expect(a.nom()).toBe(textes.carte.mer);
    oublierMers(async (f) => (lus.push(f), readFileSync(`public/geo/${f}`, 'utf8')));
    a.toucher(CARAIBES);
    await vi.waitFor(() => expect(a.nom()).toBe('mer des Caraïbes'));
  });
});

describe('accueil : la mémoire des mers (D47 a) et une mer choisie dans la recherche', () => {
  /** La carte de la mémoire, sujet « Mers » choisi. */
  const memoireMers = (): CarteMemoire => ({
    sujets: () => ['pays', 'capitales', 'drapeaux', 'mers'],
    sujet: () => 'mers',
    choisir: () => undefined,
    teintes: () => new Map([['medit', 2]]),
    maitrises: () => '0/50 maîtrisées',
    detail: (_t, id) => (id === 'medit' ? 'Vu 1 fois · revient demain' : null),
  });

  it('« Mers » : la couche fine posée sur la carte, ses zones teintées (les pays neutres) ; une mer touchée allumée, avec sa mémoire', async () => {
    const a = monter(memoireMers());
    a.vue.activer();
    await vi.waitFor(() => expect(a.carte.prendreMers).toHaveBeenCalledTimes(1));
    expect(lus).toContain('mers.topo.json');
    const derniere = a.teintes.at(-1)!;
    expect([...derniere.keys()]).toEqual(['medit']);
    a.toucher(MEDITERRANEE);
    expect(a.nom()).toBe('mer Méditerranée');
    expect(a.detail()).toBe('Vu 1 fois · revient demain');
    expect(a.marques).toEqual(['medit:choisi']);
  });

  it('la recherche montre une mer : la couche fine posée, la zone allumée et cadrée, son nom', async () => {
    const a = monter();
    a.vue.activer();
    a.vue.montrerLieu('monde', 'manche');
    expect(a.detail()).toBe(textes.toucher.chargement_sujet);
    await vi.waitFor(() => expect(a.carte.montrer).toHaveBeenCalledTimes(1));
    expect(a.carte.prendreMers).toHaveBeenCalledTimes(1);
    expect(a.carte.montrer.mock.calls[0]![0]).toBe('manche');
    expect(a.marques).toContain('manche:choisi');
    expect(a.nom()).toBe('Manche');
    // La suivante : tout de suite (la couche est posée).
    a.vue.montrerLieu('monde', 'azov');
    expect(a.nom()).toBe("mer d'Azov");
    expect(a.marques).toContain('azov:choisi');
    // La mer d'Azov, minuscule : un anneau à son point.
    expect(a.marques.some((m) => m.startsWith('anneauEn '))).toBe(true);
  });
});
