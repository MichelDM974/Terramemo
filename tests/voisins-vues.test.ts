// Les Voisins (J4, lot 2) dans les vues, sur le DOM factice des tests : Trouver (essai.ts) touche chaque voisin, une
// faute finit la question, « Voir » montre les manqués ; Reconnaître est un Trouver sur la liste écrite (sens nommer au
// journal) ; Chrono et Sans faute (chrono.ts) au délai de chaque question, 4 s plus 2 s par voisin (D607 a). Le vrai
// morceau des voisins, sur les vraies données du monde ; la carte est factice : un toucher en x désigne ZONES[x], juste
// pour elle seule (noter avec ses zones admises : tests/voisins.test.ts).
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assembler } from '../src/map/donnees';
import type { Contestee, Pays } from '../src/map/types';
import { El, installerDom, installerStockage } from './dom-factice';

const blocClassement = vi.fn(() => new El('section'));
vi.mock('../src/vues/classement', () => ({ blocClassement: () => blocClassement(), publierPartie: vi.fn() }));

const { lireRecords } = await import('../src/epreuve/chrono');
const { LIBELLE_STATUT, texteAdmis } = await import('../src/vues/commun');
const { vueEssai } = await import('../src/vues/essai');
const { vueChrono } = await import('../src/vues/chrono');
const { poserVoisins } = await import('../src/vues/sujets');
const { remplir, textes } = await import('../src/vues/textes');
const { textesVoisins: T } = await import('../src/vues/textes-voisins');
const morceau = await import('../src/vues/voisins');
import type { ReponseJouee } from '../src/vues/essai';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const monde = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json') as Pays[], lire('contestees.json') as Contestee[], lire('noms.fr.json'));
/** Ce qu'un toucher en x désigne (pick) : un toucher en ZONES.indexOf('AUT') touche l'Autriche. */
const ZONES = ['AUT', 'POL', 'ESP', 'HUN', 'XKX', 'HRV', 'ROU', 'SRB', 'SVK', 'SVN', 'UKR', 'FRA'];
const en = (id: string) => ZONES.indexOf(id);

beforeAll(() => poserVoisins(morceau, { texteAdmis, estPetite: () => false, statuts: LIBELLE_STATUT }));
afterAll(() => poserVoisins(null));
beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function monter() {
  const zone = new El('main');
  const marques: string[] = [];
  const carte = {
    cacherPastilles() {},
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    anneauEn() {},
    montrer: vi.fn(),
    montrerZone() {},
    vueEntiere: vi.fn(),
    zoomer() {},
    cadrer() {},
    projection: { scale: () => 100 },
    transfo: { k: 1 },
    hote: new El('div'),
    pick: (x: number) => (ZONES[x] ? { id: ZONES[x], via: 'trace', distance_px: 0 } : null),
    noter: (c: string, x: number) => {
      const juste = ZONES[x] === c;
      return { juste, via: juste ? 'trace' : null, distance_km: juste ? 0 : 300, admis: null, lonlat: null, pick: ZONES[x] ? { id: ZONES[x], via: 'trace', distance_px: 0 } : null };
    },
  };
  const terrain = { nom: 'monde', carte, donnees: monde, jouables: [], credit: null };
  /** Ce que chaque toucher donne à sa mesure (ctx.mesures.toucher) : pick, cible, juste. */
  const mesures: Record<string, unknown>[] = [];
  const ctx = {
    carte,
    donnees: monde,
    zone,
    terrains: { monde: terrain, actif: 'monde', montrer() {}, deja: () => null, charger: vi.fn() },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => Record<string, unknown>) => void mesures.push(f()) },
  };
  return { zone, carte, marques, terrain, ctx, mesures };
}

describe('Trouver et Reconnaître (essai.ts)', () => {
  function essai() {
    const m = monter();
    const journal: ReponseJouee[] = [];
    const vue = vueEssai(m.ctx as never, { versJouer: vi.fn(), libre: () => (r) => void journal.push(r) });
    const lancer = (mode: 'localiser' | 'nommer', ids: string[]) => {
      vue.activer();
      vue.lancer({ branche: 'entrainement', sujet: 'voisins', serie: 'tous', mode }, { id: 'tous', terrain: 'monde', ids, n: ids.length }, m.terrain as never, ids);
    };
    const el = (s: string) => m.zone.querySelector(s) as El;
    const toucher = (id: string) => vue.toucher!(en(id), 0, {} as PointerEvent);
    return { ...m, vue, journal, lancer, el, toucher };
  }
  const compte = (n: number, total: number) => remplir(T.compte, { n, total });

  it('« Touche les 7 voisins de : Hongrie » : le pays allumé, la carte sur lui ; chaque voisin compté ; une faute finit la question, fausse, au journal', () => {
    const e = essai();
    e.lancer('localiser', ['HUN']);
    const consigne = e.el('#barre-essai .essai-consigne');
    expect(consigne.innerText).toBe(`${remplir(T.enonce, { n: 7 })}Hongrie`);
    expect(e.marques).toEqual(['HUN:choisi']);
    expect(e.carte.montrer).toHaveBeenCalledWith('HUN', expect.any(Number));
    e.toucher('AUT');
    const retro = e.el('#barre-essai .essai-retro');
    expect([retro.className, retro.textContent]).toEqual(['essai-retro juste', `Juste : Autriche · ${compte(1, 7)}`]);
    // La Hongrie elle-même, la mer : ni pour ni contre.
    e.toucher('HUN');
    expect(retro.className).toBe('essai-retro ');
    vi.advanceTimersByTime(10);
    e.vue.toucher!(99, 0, {} as PointerEvent);
    expect(retro.textContent).toBe(remplir(T.rien, { compte: compte(1, 7) }));
    e.toucher('HUN');
    expect(retro.textContent).toBe(`Hongrie : c'est le pays demandé · ${compte(1, 7)}`);
    expect(e.journal).toEqual([]);
    e.toucher('POL');
    expect(retro.className).toBe('essai-retro faux');
    expect(retro.textContent).toContain('Faux : Pologne, pas un voisin de la Hongrie · il manquait : Croatie, Roumanie, Serbie, Slovaquie, Slovénie, Ukraine');
    expect(e.journal).toEqual([expect.objectContaining({ id: 'HUN', sens: 'localiser', correct: false, aide: null, reponse: 'POL', distance_km: null })]);
    expect(e.marques).toEqual(expect.arrayContaining(['POL:faux', 'HRV:juste', 'anneau HRV:juste']));
    // Le temps de voir les manqués, puis le bilan (la série n'avait qu'elle) : « 1 sur 7, puis Pologne ».
    e.toucher('HRV');
    expect(e.journal).toHaveLength(1);
    vi.advanceTimersByTime(3_500);
    expect(e.el('#essai-bilan').hidden).toBe(false);
    expect(e.el('#essai-bilan').innerText).toContain(`Hongrie : ${remplir(T.bilan_faute, { compte: compte(1, 7), nom: 'Pologne' })}`);
  });

  it('la mesure des touchers : un voisin trouvé est un toucher juste sur lui, une faute un toucher faux pour le pays, le reste ni l’un ni l’autre', () => {
    const e = essai();
    e.lancer('localiser', ['HUN']);
    for (const id of ['AUT', 'AUT', 'HUN', 'POL']) e.toucher(id);
    e.vue.toucher!(99, 0, {} as PointerEvent);
    const vus = e.mesures.map(({ cible, juste }) => ({ cible, juste }));
    expect(vus.slice(0, 4)).toEqual([
      { cible: 'AUT', juste: true },
      { cible: 'AUT', juste: true },
      { cible: undefined, juste: undefined },
      { cible: 'HUN', juste: false },
    ]);
    expect(e.mesures[0]).toMatchObject({ pick: { id: 'AUT' } });
  });

  it('tous trouvés : juste du premier coup, quel que soit le nombre de touchers', () => {
    const e = essai();
    e.lancer('localiser', ['PRT']);
    e.toucher('ESP');
    expect(e.el('#barre-essai .essai-retro').textContent).toBe('Juste : le seul voisin du Portugal');
    expect(e.journal).toEqual([expect.objectContaining({ id: 'PRT', sens: 'localiser', correct: true, aide: null, reponse: null })]);
    vi.advanceTimersByTime(1_200);
    expect(e.el('#essai-bilan').hidden).toBe(false);
  });

  it('« Voir » : les manqués montrés, la question finie, aide « voir » ; « Passer » de même, aide « passer »', () => {
    const e = essai();
    e.lancer('localiser', ['HUN', 'PRT']);
    const premier = e.el('#barre-essai .essai-consigne').dataset.cible!;
    e.el('#essai-voir').click();
    expect(e.journal).toEqual([expect.objectContaining({ id: premier, correct: false, aide: 'voir' })]);
    expect(e.marques.some((x) => x.startsWith('anneau '))).toBe(true);
    vi.advanceTimersByTime(3_500);
    e.el('#essai-passer').click();
    expect(e.journal[1]).toEqual(expect.objectContaining({ correct: false, aide: 'passer' }));
  });

  it('Reconnaître : la liste écrite, on touche le pays (un Trouver, pas un QCM), au journal en sens nommer', () => {
    const e = essai();
    e.lancer('nommer', ['HUN']);
    expect(e.zone.querySelector('#barre-nommer')!.hidden).toBe(true);
    const consigne = e.el('#barre-essai .essai-consigne');
    expect(consigne.innerText).toBe(`${T.liste}Autriche, Croatie, Roumanie, Serbie, Slovaquie, Slovénie, Ukraine`);
    expect(consigne.innerText).not.toContain('Hongrie');
    e.toucher('HUN');
    expect(e.el('#barre-essai .essai-retro').textContent).toContain('Hongrie');
    expect(e.journal).toEqual([expect.objectContaining({ id: 'HUN', sens: 'nommer', correct: true })]);
  });
});

describe('Chrono et Sans faute (chrono.ts) : un délai par question, 4 s plus 2 s par voisin', () => {
  function epreuve(mode: 'chrono' | 'sansfaute', ids: string[]) {
    const m = monter();
    const vue = vueChrono(m.ctx as never, { versJouer: vi.fn(), maintenant: () => Date.UTC(2026, 10, 30, 8) });
    vue.activer();
    vue.lancer({ branche: 'classe', sujet: 'voisins', serie: 'Europe', mode }, { id: 'Europe', terrain: 'monde', ids, n: ids.length }, m.terrain as never, ids);
    const el = (s: string) => m.zone.querySelector(s) as El;
    const cible = () => el('#barre-chrono .essai-consigne').dataset.cible!;
    const toucher = (id: string) => vue.toucher!(en(id), 0, {} as PointerEvent);
    return { ...m, vue, el, cible, toucher };
  }

  it('Chrono : le Portugal juste en un toucher, la Hongrie au temps écoulé (18 s, pas 15) ; le score borne chaque temps par son délai', () => {
    const e = epreuve('chrono', ['PRT', 'HUN']);
    const reponses: Record<string, () => void> = {
      PRT: () => {
        vi.advanceTimersByTime(2_000);
        e.toucher('ESP');
      },
      HUN: () => {
        e.toucher('AUT');
        expect(e.el('#barre-chrono .essai-retro').textContent).toContain(`Juste : Autriche`);
        // Après 15 s, la question tient encore ; à 18 s, le temps est écoulé.
        vi.advanceTimersByTime(15_500);
        expect(e.el('#barre-chrono .essai-retro').className).not.toContain('faux');
        vi.advanceTimersByTime(2_600);
        expect(e.el('#barre-chrono .essai-retro').textContent).toContain('Temps écoulé');
      },
    };
    const premier = e.cible();
    reponses[premier]!();
    vi.advanceTimersByTime(2_000);
    const second = e.cible();
    expect(second).not.toBe(premier);
    reponses[second]!();
    vi.advanceTimersByTime(2_000);
    expect(e.el('#chrono-bilan').hidden).toBe(false);
    const r = lireRecords(localStorage).get('chrono:voisins:Europe')!;
    expect(r).toMatchObject({ points: 1, justes: 1, questions: 2 });
    // Le temps : tout le délai de la Hongrie (18 s), plus les quelque 2 s du Portugal (sous ses 6 s).
    expect(r.temps_ms - 18_000).toBeGreaterThanOrEqual(2_000);
    expect(r.temps_ms - 18_000).toBeLessThan(3_000);
  });

  it('Sans faute : une faute finit la question et la partie ; le bilan dit « Hongrie → Pologne », sans distance', () => {
    const e = epreuve('sansfaute', ['HUN']);
    e.toucher('AUT');
    e.toucher('POL');
    // La mesure : l'Autriche, un toucher juste sur elle ; la Pologne, un toucher faux pour la Hongrie.
    expect(e.mesures.map(({ cible, juste }) => [cible, juste])).toEqual([['AUT', true], ['HUN', false]]);
    vi.advanceTimersByTime(2_000);
    const bilan = e.el('#chrono-bilan');
    expect(bilan.hidden).toBe(false);
    expect(bilan.innerText).toContain(remplir(textes.epreuves.bilan_faux_touche, { pays: 'Hongrie', touche: 'Pologne' }));
  });
});
