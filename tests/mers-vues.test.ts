// Le sujet Océans et mers dans les vues (étude J2, § 5.1 et § 5.4 ; lot 3b,
// partie A) : Trouver, Reconnaître et une épreuve (vues/chrono.ts, dont le
// chemin de rendu est celui de Trouver : prêt pour la partie B) passent par
// le rendu des mers, sur la couche réelle (mers.fr.json) ; aucun id brut
// affiché, bilans compris ; la partie d'une mer dite « Juste : mer des
// Caraïbes, dans l'Atlantique » ; ce qu'on a touché nommé (« mer Noire »,
// un pays), jamais « la mer ». La carte est factice : noter() rend la note
// qu'on lui dit.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chargerMers, IDS_MERS, oublierMers, parenteMer, type CoucheMers } from '../src/map/mers';
import type { Lancement } from '../src/vues/arbre';
import type { ContexteVue } from '../src/vues/commun';
import { vueEssai } from '../src/vues/essai';
import { installerDom, installerStockage, El } from './dom-factice';
import { sansBrut } from './sujet-factice';

const blocClassement = vi.fn(() => new El('section'));
vi.mock('../src/vues/classement', () => ({ blocClassement: () => blocClassement(), publierPartie: vi.fn() }));
const { vueChrono } = await import('../src/vues/chrono');
const { textes } = await import('../src/vues/textes');

let couche: CoucheMers;
beforeAll(async () => {
  oublierMers(async (f) => readFileSync(`public/geo/${f}`, 'utf8'));
  couche = await chargerMers();
});

const nom = (id: string) => couche.noms[id]!;
/** La série unique des mers (D44 a), telle que Jouer la lance. */
const serieMers = () => ({ id: 'mers', terrain: 'monde' as const, ids: [...IDS_MERS], n: IDS_MERS.length });
/** La note du prochain toucher (Note de noter()). */
let note: Record<string, unknown> = {};
const options: unknown[] = [];

/** Le monde factice, la couche marine posée (donnees.mers), les noms des pays du monde. */
function monde() {
  const marques: string[] = [];
  const carte = {
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    anneauEn: (p: [number, number], c: string) => void marques.push(`anneauEn ${p.join(',')}:${c}`),
    montrer() {},
    cadrer() {},
    zoomer() {},
    projection: { scale: () => 100 },
    transfo: { k: 1 },
    hote: new El('div'),
    contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
    noter: (_id: string, _x: number, _y: number, o?: unknown) => (options.push(o), note),
  };
  const donnees = { entites: [], noms: { ITA: 'Italie' }, mers: couche.mers };
  const t = { nom: 'monde', carte, donnees, jouables: [], credit: null };
  const zone = new El('main');
  const ctx = {
    carte,
    donnees,
    zone,
    terrains: { monde: t, actif: 'monde', montrer() {}, deja: () => null, charger: vi.fn() },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => unknown) => f() },
  } as unknown as ContexteVue;
  return { ctx, t, zone, marques };
}

beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
  options.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Trouver sous Océans et mers', () => {
  function lancer(ids: string[], mode: Lancement['mode'] = 'localiser') {
    const m = monde();
    const v = vueEssai(m.ctx, { versJouer: vi.fn() });
    v.activer();
    v.lancer({ branche: 'entrainement', sujet: 'mers', serie: 'mers', mode }, serieMers(), m.t as never, ids);
    const el = (s: string) => m.zone.querySelector(s) as El;
    return { ...m, v, el };
  }
  const toucher = (v: { toucher?: (x: number, y: number, ev: PointerEvent) => void }, n: Record<string, unknown>) => {
    note = n;
    v.toucher?.(1, 1, {} as PointerEvent);
  };

  it('« Touche : océan Atlantique » ; la mer des Caraïbes touchée : « Juste : mer des Caraïbes, dans l’Atlantique · 1 essai · … » ; les parties passées à noter()', () => {
    const p = lancer(['atlant']);
    const consigne = p.el('#barre-essai .essai-consigne');
    expect(consigne.textContent).toBe('Touche : océan Atlantique');
    sansBrut(consigne.textContent, IDS_MERS);
    toucher(p.v, { juste: true, via: 'trace', pick: { id: 'caraibes', via: 'trace' }, distance_km: 0, admis: { zone: 'caraibes', tenant: 'caraibes', sorte: 'partie' } });
    expect(p.el('#barre-essai .essai-retro').textContent).toMatch(/^Juste : mer des Caraïbes, dans l'Atlantique · 1 essai · /);
    // Les zones admises du sujet (OptionsNoter.acceptes) : les parties de l'Atlantique, de sorte partie.
    const acceptes = (options[0] as { acceptes: ReadonlyMap<string, readonly { zone: string; sorte: string }[]> }).acceptes;
    const zones = acceptes.get('atlant')!;
    expect(zones.map((z) => z.zone)).toContain('caraibes');
    expect(zones.map((z) => z.zone)).not.toContain('medit');
    expect(new Set(zones.map((z) => z.sorte))).toEqual(new Set(['partie']));
  });

  it('faux : la mer touchée nommée (« mer Noire »), un pays par son nom, rien sous le doigt « hors de la carte », jamais « la mer » ; le bilan par les noms', () => {
    const p = lancer(['atlant']);
    const retro = () => p.el('#barre-essai .essai-retro').textContent;
    toucher(p.v, { juste: false, via: null, pick: { id: 'noire', via: 'trace' }, distance_km: 0, admis: null });
    expect(retro()).toBe('Faux : mer Noire, à 0,0 km du bord. La bonne mer est en vert : touche-la.');
    expect(p.marques).toEqual(['noire:faux', 'atlant:juste']);
    toucher(p.v, { juste: false, via: null, pick: { id: 'ITA', via: 'trace' }, distance_km: 12, admis: null });
    expect(retro()).toMatch(/^Faux : Italie, à 12 km du bord\./);
    toucher(p.v, { juste: false, via: null, pick: null, distance_km: null, admis: null });
    expect(retro()).toBe('Faux : hors de la carte. La bonne mer est en vert : touche-la.');
    expect(retro()).not.toContain(textes.sujets.pays.la_mer);
    p.el('#essai-passer').click();
    const bilan = p.el('#essai-bilan');
    expect(bilan.hidden).toBe(false);
    expect(bilan.innerText).toContain('océan Atlantique : ');
    expect(bilan.innerText).toContain('Océans et mers');
    sansBrut(bilan.innerText, IDS_MERS);
  });

  it('la mer d’Azov (2 px au zoom 1) : son anneau, à son point, avec « Voir »', () => {
    const p = lancer(['azov']);
    p.el('#essai-voir').click();
    expect(p.marques).toContain('azov:juste');
    expect(p.marques.some((x) => x.startsWith('anneauEn ') && x.endsWith(':juste'))).toBe(true);
  });

  it('Reconnaître : la zone allumée, « Quel est cet océan ? » ou « Quelle est cette mer ? », quatre noms sans parenté ; faux puis bilan, par les noms', () => {
    const p = lancer(['atlant', 'adriat'], 'nommer');
    const barre = p.el('#barre-nommer');
    for (let q = 0; q < 2; q++) {
      const cible = barre.querySelector('.essai-consigne')!.dataset.cible as string;
      expect(barre.querySelector('.essai-consigne')!.textContent).toBe(cible === 'atlant' ? 'Quel est cet océan ?' : 'Quelle est cette mer ?');
      expect(p.marques).toContain(`${cible}:choisi`);
      const boutons = barre.querySelectorAll('.nommer-choix');
      const ids = boutons.map((b) => b.dataset.id as string);
      expect(ids).toHaveLength(4);
      expect(ids).toContain(cible);
      const parente = parenteMer(cible, couche.mers.map((e) => e.pays));
      for (const x of ids) expect(parente.has(x), x).toBe(false);
      expect(boutons.map((b) => b.textContent)).toEqual(ids.map(nom));
      sansBrut(boutons.map((b) => b.textContent).join(' · '), IDS_MERS);
      // Un leurre choisi : faux, la bonne réponse nommée.
      const leurre = boutons.find((b) => b.dataset.id !== cible)!;
      leurre.click();
      expect(barre.querySelector('.essai-retro')!.textContent).toBe(`Faux · bonne réponse : ${nom(cible)}`);
      vi.advanceTimersByTime(2000);
    }
    const bilan = p.el('#essai-bilan');
    expect(bilan.hidden).toBe(false);
    expect(bilan.innerText).toContain('océan Atlantique : tu as choisi ');
    expect(bilan.innerText).toContain('mer Adriatique : tu as choisi ');
    sansBrut(bilan.innerText, IDS_MERS);
  });

  it('un océan allumé (« Quel est cet océan ? ») : ses trois leurres sont des océans, jamais une mer (l’Arctique sans la mer de Béring)', () => {
    const oceans = couche.mers.filter((e) => e.pays.sorte === 'océan').map((e) => e.pays.id);
    expect(oceans).toHaveLength(5);
    const p = lancer(oceans, 'nommer');
    const barre = p.el('#barre-nommer');
    for (let q = 0; q < oceans.length; q++) {
      const cible = barre.querySelector('.essai-consigne')!.dataset.cible as string;
      expect(barre.querySelector('.essai-consigne')!.textContent).toBe('Quel est cet océan ?');
      const ids = barre.querySelectorAll('.nommer-choix').map((b) => b.dataset.id as string);
      expect(ids).toHaveLength(4);
      for (const x of ids) expect(oceans, `${cible} : ${x}`).toContain(x);
      barre.querySelectorAll('.nommer-choix').find((b) => b.dataset.id === cible)!.click();
      vi.advanceTimersByTime(2000);
    }
  });
});

describe('une épreuve des mers (vues/chrono.ts : le chemin de rendu de Trouver, prêt pour la partie B)', () => {
  it('« Touche : » et le nom ; la partie touchée dite juste ; une autre mer nommée ; le bilan par les noms, aucun id brut', () => {
    const m = monde();
    const v = vueChrono(m.ctx as unknown as Parameters<typeof vueChrono>[0], { versJouer: vi.fn() });
    v.activer();
    v.lancer({ branche: 'classe', sujet: 'mers', serie: 'mers', mode: 'chrono' }, serieMers(), m.t as never, ['atlant', 'medit']);
    const consigne = () => m.zone.querySelector('#barre-chrono .essai-consigne')!;
    const retro = () => m.zone.querySelector('#barre-chrono .essai-retro')!.textContent;
    const vues: string[] = [];
    for (let q = 0; q < 2; q++) {
      vi.advanceTimersByTime(q ? 2_000 : 0);
      const cible = consigne().dataset.cible as string;
      vues.push(cible);
      expect(consigne().textContent).toBe(`Touche : ${nom(cible)}`);
      if (cible === 'atlant') {
        note = { juste: true, via: 'trace', pick: { id: 'caraibes', via: 'trace' }, distance_km: 0, admis: { zone: 'caraibes', tenant: 'caraibes', sorte: 'partie' } };
        v.toucher?.(1, 1, {} as PointerEvent);
        expect(retro()).toBe("Juste : mer des Caraïbes, dans l'Atlantique");
      } else {
        note = { juste: false, via: null, pick: { id: 'noire', via: 'trace' }, distance_km: 0, admis: null };
        v.toucher?.(1, 1, {} as PointerEvent);
        expect(retro()).toBe('Faux : mer Noire, à 0,0 km du bord');
      }
    }
    expect(vues.sort()).toEqual(['atlant', 'medit']);
    vi.advanceTimersByTime(5_000);
    const bilan = m.zone.querySelector('#chrono-bilan') ?? m.zone.querySelector('.essai-bilan');
    expect(bilan?.innerText).toContain('mer Méditerranée → mer Noire, à 0,0 km');
    sansBrut(bilan!.innerText, IDS_MERS);
  });
});
