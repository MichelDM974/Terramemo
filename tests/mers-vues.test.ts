// Le sujet Océans et mers dans les vues (étude J2, § 5.1 et § 5.4 ; lot 3b,
// parties A et B) : Trouver, Reconnaître et les épreuves classées
// (vues/chrono.ts : Chrono et Sans faute, le chemin de rendu et de notation
// de Trouver) passent par le rendu des mers, sur la couche réelle
// (mers.fr.json) ; aucun id brut
// affiché, bilans compris ; la partie d'une mer dite « Juste : mer des
// Caraïbes, dans l'Atlantique » ; ce qu'on a touché nommé (« mer Noire »,
// un pays), jamais « la mer ». La carte est factice : noter() rend la note
// qu'on lui dit.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chargerMers, IDS_MERS, oublierMers, parenteMer, type CoucheMers } from '../src/map/mers';
import { lireRecords } from '../src/epreuve/chrono';
import type { Lancement } from '../src/vues/arbre';
import type { ContexteVue } from '../src/vues/commun';
import { vueEssai } from '../src/vues/essai';
import { cadrageNommer, ZONE_MONTREE } from '../src/vues/nommer';
import { vueRetournee } from '../src/vues/retournee';
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
    montrerZone() {},
    vueEntiere() {},
    cadrer() {},
    zoomer() {},
    projection: { scale: () => 100 },
    transfo: { k: 1 },
    hote: new El('div'),
    contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
    noter: (_id: string, _x: number, _y: number, o?: unknown) => (options.push(o), note),
  };
  // Les cadrages demandés (vol vers une zone, zoom) : une épreuve des mers n'en fait aucun (il donnerait la réponse).
  const cadrages: string[] = [];
  carte.cadrer = (...a: unknown[]) => void cadrages.push(`cadrer ${JSON.stringify(a[0])}`);
  carte.zoomer = (...a: unknown[]) => void cadrages.push(`zoomer ${JSON.stringify(a[0])}`);
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
  return { ctx, t, zone, marques, cadrages };
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
    expect(bilan.innerText).toContain('océan Atlantique · tu avais choisi : ');
    expect(bilan.innerText).toContain('mer Adriatique · tu avais choisi : ');
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

/**
 * La carte cadrée sur la moitié est du Pacifique (de −180° à −68°) : une
 * projection plate où les longitudes est (> 0) partent à gauche de l'écran
 * (200 × 200 px au-dessus de la barre). Le polygone principal de pacif y
 * tient entier ; son emprise (de 114° E à 68° W) n'y tient qu'aux trois quarts.
 * montrer() et montrerZone() comptés : la carte vole-t-elle, zoome-t-elle sur la zone ?
 */
function moitieDuPacifique(m: ReturnType<typeof monde>) {
  const montrer = vi.fn();
  const montrerZone = vi.fn();
  const proj = Object.assign(([lon, lat]: [number, number]): [number, number] => [(lon > 0 ? lon - 360 : lon) + 200, 100 - lat], { scale: () => 100 });
  Object.assign(m.t.carte, { montrer, montrerZone, contexteFinal: () => ({ proj, t: { k: 1, x: 0, y: 0 } }) });
  (m.t.carte.hote as El).getBoundingClientRect = () => ({ x: 0, y: 0, width: 200, height: 400, top: 0, left: 0, right: 200, bottom: 400 }) as never;
  // La barre de la vue (Reconnaître, carte retournée) commence à 200 px.
  vi.spyOn(El.prototype, 'getBoundingClientRect').mockImplementation(function (this: El) {
    const haut = this.id.startsWith('barre-') ? 200 : 0;
    return { x: 0, y: haut, width: 200, height: 100, top: haut, left: 0, right: 200, bottom: haut + 100 } as never;
  });
  return { montrer, montrerZone };
}

describe('cadrage d’une mer allumée sur son emprise (Reconnaître, carte retournée)', () => {
  afterEach(() => vi.restoreAllMocks());

  // Sur le monde, la zone se montre par le zoom lent (montrerZone, décision « Zone allumée montrée par un zoom
  // lent »), qui cadre une mer sur son emprise entière (contourZone, tests/carte-canvas-dom.test.ts), pas sur son
  // polygone principal (une moitié du Pacifique), qui tient ici à l'écran.
  it('le Pacifique, dont la moitié est à l’écran : le zoom lent le montre (son emprise entière), jamais montrer()', () => {
    const m = monde();
    const { montrer, montrerZone } = moitieDuPacifique(m);
    const pacif = couche.mers.find((e) => e.pays.id === 'pacif')!;
    expect(cadrageNommer(m.t.carte as never, pacif.pays, pacif.forme, 200, 200).vole).toBe(false);
    const v = vueEssai(m.ctx, { versJouer: vi.fn() });
    v.activer();
    v.lancer({ branche: 'entrainement', sujet: 'mers', serie: 'mers', mode: 'nommer' }, serieMers(), m.t as never, ['pacif']);
    expect(m.zone.querySelector('#barre-nommer .essai-consigne')!.dataset.cible).toBe('pacif');
    expect(montrerZone).toHaveBeenCalledWith('pacif', 200, ZONE_MONTREE);
    expect(montrer).not.toHaveBeenCalled();
  });

  it('carte retournée : « Quel est cet océan ? » puis « Quelle est cette mer ? », la zone allumée par son lieu marin (sans anneau pour un océan, à son point pour l’Azov), cadrée sur son emprise ; « Révéler » donne le nom', () => {
    const m = monde();
    const { montrerZone } = moitieDuPacifique(m);
    const r = vueRetournee(m.ctx);
    const crochets = { compte: () => '1 / 3', surReponse: () => '', surFin: vi.fn(), terminer: vi.fn() };
    const consigne = () => m.zone.querySelector('#barre-retournee .essai-consigne')!;
    const nomRevele = () => m.zone.querySelector('#barre-retournee .retournee-nom')!;
    r.poser(m.t as never, 'mers', 'pacif', crochets);
    expect(consigne().textContent).toBe('Quel est cet océan ?');
    expect(m.marques).toEqual(['pacif:choisi']);
    // Le zoom lent sur la zone, à la question seulement : « Révéler » la rallume sans le relancer.
    expect(montrerZone).toHaveBeenCalledWith('pacif', 200, ZONE_MONTREE);
    expect(nomRevele().textContent).toBe('');
    (m.zone.querySelector('#retournee-reveler') as El).click();
    expect(nomRevele().textContent).toBe('océan Pacifique');
    expect(m.marques).toEqual(['pacif:choisi']);
    expect(montrerZone).toHaveBeenCalledTimes(1);
    r.poser(m.t as never, 'mers', 'egee', crochets);
    expect(consigne().textContent).toBe('Quelle est cette mer ?');
    expect(m.marques[0]).toBe('egee:choisi');
    expect(m.marques.some((x) => x.startsWith('anneau egee'))).toBe(false);
    (m.zone.querySelector('#retournee-reveler') as El).click();
    expect(nomRevele().textContent).toBe(nom('egee'));
    // L'Azov, petite : un anneau à son point (anneauEn), jamais carte.anneau (cherché parmi les pays).
    r.poser(m.t as never, 'mers', 'azov', crochets);
    expect(m.marques[0]).toBe('azov:choisi');
    expect(m.marques.some((x) => x.startsWith('anneauEn ') && x.endsWith(':choisi'))).toBe(true);
    expect(m.marques.some((x) => x.startsWith('anneau azov'))).toBe(false);
    sansBrut(`${consigne().textContent} ${nomRevele().textContent}`, IDS_MERS);
  });
});

describe('une épreuve des mers (vues/chrono.ts : le chemin de rendu et de notation de Trouver)', () => {
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

  /** Une épreuve des mers lancée comme Jouer la lance (Classé › Océans et mers), sur ces cibles. */
  function epreuve(mode: 'chrono' | 'sansfaute', ids: string[]) {
    const m = monde();
    const v = vueChrono(m.ctx as unknown as Parameters<typeof vueChrono>[0], { versJouer: vi.fn() });
    v.activer();
    v.lancer({ branche: 'classe', sujet: 'mers', serie: 'mers', mode }, serieMers(), m.t as never, ids);
    const consigne = () => m.zone.querySelector('#barre-chrono .essai-consigne')!;
    const retro = () => m.zone.querySelector('#barre-chrono .essai-retro')!.textContent;
    const toucher = (n: Record<string, unknown>) => {
      note = n;
      v.toucher?.(1, 1, {} as PointerEvent);
    };
    const bilan = () => m.zone.querySelector('#chrono-bilan')!;
    return { ...m, v, consigne, retro, toucher, bilan };
  }
  const CARAIBES = { juste: true, via: 'trace', pick: { id: 'caraibes', via: 'trace' }, distance_km: 0, admis: { zone: 'caraibes', tenant: 'caraibes', sorte: 'partie' } };
  const NOIRE = { juste: false, via: null, pick: { id: 'noire', via: 'trace' }, distance_km: 0, admis: null };

  it('Chrono des 50 : « Touche : » et le nom à chaque question ; la vue ne se cadre jamais sur la mer demandée ; bilan « Chrono · Océans et mers », record sous chrono:mers:mers', () => {
    const p = epreuve('chrono', [...IDS_MERS]);
    const vues = new Set<string>();
    let fausses = 0;
    for (let q = 0; q < 50; q++) {
      vi.advanceTimersByTime(q ? 2_000 : 0);
      const cible = p.consigne().dataset.cible as string;
      vues.add(cible);
      expect(p.consigne().textContent).toBe(`Touche : ${nom(cible)}`);
      if (cible === 'atlant') {
        p.toucher(CARAIBES);
        expect(p.retro()).toBe("Juste : mer des Caraïbes, dans l'Atlantique");
      } else if (cible === 'medit') {
        fausses++;
        p.toucher(NOIRE);
        expect(p.retro()).toBe('Faux : mer Noire, à 0,0 km du bord');
      } else p.toucher({ juste: true, via: 'trace', pick: { id: cible, via: 'trace' }, distance_km: 0, admis: null });
    }
    expect(vues).toEqual(new Set(IDS_MERS));
    // Ni vol vers la mer demandée, ni zoom : une épreuve ne donne pas la réponse (comme pour les pays).
    expect(p.cadrages).toEqual([]);
    vi.advanceTimersByTime(5_000);
    const b = p.bilan();
    expect(b.hidden).toBe(false);
    expect(b.querySelector('h2')!.textContent).toBe('Chrono · Océans et mers');
    expect(b.innerText).toContain('49/50 · 98 %');
    sansBrut(b.innerText, IDS_MERS);
    const r = lireRecords(localStorage).get('chrono:mers:mers')!;
    expect([r.points, r.justes, r.questions, fausses]).toEqual([49, 49, 50, 1]);
  });

  it('Sans faute : la mer des Caraïbes pour l’Atlantique, juste ; la mer Noire pour l’Atlantique, fausse et nommée, la partie finie ; bilan « Sans faute · Océans et mers », record sous sansfaute:mers:mers', () => {
    const p = epreuve('sansfaute', ['atlant', 'atlant']);
    expect(p.consigne().textContent).toBe('Touche : océan Atlantique');
    p.toucher(CARAIBES);
    expect(p.retro()).toBe("Juste : mer des Caraïbes, dans l'Atlantique");
    // Les parties de l'Atlantique passées à noter() (OptionsNoter.acceptes), comme en Trouver.
    const acceptes = (options[0] as { acceptes: ReadonlyMap<string, readonly { zone: string; sorte: string }[]> }).acceptes;
    expect(acceptes.get('atlant')!.map((z) => z.zone)).toContain('caraibes');
    expect(acceptes.get('atlant')!.map((z) => z.zone)).not.toContain('noire');
    vi.advanceTimersByTime(1_000);
    expect(p.consigne().textContent).toBe('Touche : océan Atlantique');
    p.toucher(NOIRE);
    expect(p.retro()).toBe('Faux : mer Noire, à 0,0 km du bord');
    expect(p.marques).toEqual(['atlant:juste', 'noire:faux']);
    expect(p.cadrages).toEqual([]);
    vi.advanceTimersByTime(2_000);
    const b = p.bilan();
    expect(b.hidden).toBe(false);
    expect(b.querySelector('h2')!.textContent).toBe('Sans faute · Océans et mers');
    expect(b.innerText).toContain("1 d'affilée sur 50");
    expect(b.innerText).toContain('océan Atlantique → mer Noire, à 0,0 km');
    sansBrut(b.innerText, IDS_MERS);
    const r = lireRecords(localStorage).get('sansfaute:mers:mers')!;
    expect([r.points, r.justes, r.questions]).toEqual([1, 1, 2]);
  });

  it('les options de noter() en épreuve sont celles de Trouver (mêmes zones admises ; la terre à 12 px et le halo des petites mers se jugent dans le même noter())', () => {
    const p = epreuve('chrono', ['medit']);
    p.toucher(NOIRE);
    const enEpreuve = options.at(-1) as { acceptes: ReadonlyMap<string, readonly unknown[]> };
    const m = monde();
    const v = vueEssai(m.ctx, { versJouer: vi.fn() });
    v.activer();
    v.lancer({ branche: 'entrainement', sujet: 'mers', serie: 'mers', mode: 'localiser' }, serieMers(), m.t as never, ['medit']);
    note = NOIRE;
    v.toucher?.(1, 1, {} as PointerEvent);
    const enTrouver = options.at(-1) as { acceptes: ReadonlyMap<string, readonly unknown[]> };
    expect(enEpreuve).not.toBe(enTrouver);
    // La Méditerranée : ses sous-mers (l'Adriatique) admises, dans les deux exercices.
    expect(enEpreuve.acceptes.get('medit')!.map((z) => (z as { zone: string }).zone)).toContain('adriat');
    expect([...enEpreuve.acceptes.entries()]).toEqual([...enTrouver.acceptes.entries()]);
  });

  it('la mer d’Azov expirée : son anneau à son point (une mer de 2 px au zoom 1), sans cadrage', () => {
    const p = epreuve('chrono', ['azov']);
    vi.advanceTimersByTime(15_000);
    expect(p.marques).toContain('azov:juste');
    expect(p.marques.some((x) => x.startsWith('anneauEn ') && x.endsWith(':juste'))).toBe(true);
    expect(p.cadrages).toEqual([]);
  });
});

describe('une épreuve des pays : jamais les parties d’une mer (une mer n’y est jamais cible)', () => {
  it('Chrono des pays : noter() sans les zones admises des mers (sorte « partie »)', () => {
    const m = monde();
    const v = vueChrono(m.ctx as unknown as Parameters<typeof vueChrono>[0], { versJouer: vi.fn() });
    v.activer();
    v.lancer({ branche: 'classe', sujet: 'pays', serie: 'Europe', mode: 'chrono' }, { id: 'Europe', terrain: 'monde', ids: ['ITA'], n: 1 }, m.t as never, ['ITA']);
    note = { juste: false, via: null, pick: { id: 'medit', via: 'trace' }, distance_km: 10, admis: null };
    v.toucher?.(1, 1, {} as PointerEvent);
    // La table commune de la carte seule (zones contestées et enclaves) : rien du sujet des mers.
    expect(options.at(-1)).toEqual({ acceptes: true });
  });
});

describe('Apprendre Océans et mers refusé hors ligne, puis « Trouver » (essai.ts refuser) : la couche lue et posée avant la partie', () => {
  /** Chaque fichier de la couche attend `ouvrir()` ; `fermer()` le fait échouer. */
  function lecteurDiffere() {
    let ouvrir: () => void = () => undefined;
    let fermer: () => void = () => undefined;
    const porte = new Promise<void>((ok, ko) => ((ouvrir = ok), (fermer = () => ko(new Error('hors ligne')))));
    porte.catch(() => undefined);
    const lire = vi.fn(async (f: string) => (await porte, readFileSync(`public/geo/${f}`, 'utf8')));
    return { lire, ouvrir: () => ouvrir(), fermer: () => fermer() };
  }
  /** Le monde sans mers ; prendreMers les pose (donnees.mers) ; la séance refusée comme hors ligne. */
  function refusee() {
    const l = lecteurDiffere();
    oublierMers(l.lire);
    const m = monde();
    const d = m.t.donnees as { mers: CoucheMers['mers'] };
    d.mers = [];
    const prendreMers = vi.fn((c: CoucheMers) => void (d.mers = c.mers));
    Object.assign(m.t.carte, { prendreMers });
    const versCarte = vi.fn();
    const v = vueEssai(m.ctx, { versJouer: vi.fn(), versCarte, seances: { ouvrir: vi.fn(() => ({ refus: textes.toucher.echec_sujet, reviser: 0 })) } as never });
    v.activer();
    v.lancer({ branche: 'entrainement', sujet: 'mers', serie: 'mers', mode: 'apprendre' }, serieMers(), m.t as never, [...IDS_MERS]);
    const el = (s: string) => m.zone.querySelector(s) as El;
    expect(el('#essai-bilan').hidden).toBe(false);
    return { ...m, ...l, v, el, d, prendreMers, versCarte };
  }
  const attendre = async () => {
    for (let k = 0; k < 20; k++) await Promise.resolve();
  };
  afterEach(async () => {
    oublierMers(async (f) => readFileSync(`public/geo/${f}`, 'utf8'));
    await chargerMers();
  });

  it('« Trouver » attend la couche (bouton désactivé, aucune partie), la pose, puis lance une partie de mers nommée', async () => {
    const p = refusee();
    p.el('#seance-trouver').click();
    expect(p.el('#seance-trouver').disabled).toBe(true);
    expect(p.el('#barre-essai').hidden).toBe(true);
    p.ouvrir();
    await vi.waitFor(() => expect(p.prendreMers).toHaveBeenCalledTimes(1));
    await attendre();
    expect(p.d.mers).toHaveLength(50);
    expect(p.el('#barre-essai').hidden).toBe(false);
    const consigne = p.el('#barre-essai .essai-consigne');
    expect(consigne.textContent).toBe(`Touche : ${nom(consigne.dataset.cible as string)}`);
  });

  it('hors ligne : le message des données du sujet, le bouton rendu, aucune partie', async () => {
    const p = refusee();
    p.el('#seance-trouver').click();
    p.fermer();
    await attendre();
    expect(p.el('#essai-bilan').innerText).toContain(textes.toucher.echec_sujet);
    expect(p.el('#seance-trouver').disabled).toBe(false);
    expect(p.el('#barre-essai').hidden).toBe(true);
    expect(p.prendreMers).not.toHaveBeenCalled();
  });

  it('le bilan fermé (×) ou la vue quittée pendant le chargement : la couche arrive, aucune partie ne démarre', async () => {
    for (const partir of ['croix', 'quitter'] as const) {
      const p = refusee();
      p.el('#seance-trouver').click();
      if (partir === 'croix') p.el('#essai-bilan .croix').click();
      else p.v.desactiver();
      p.ouvrir();
      await vi.waitFor(() => expect(p.prendreMers).toHaveBeenCalledTimes(1));
      await attendre();
      expect(p.el('#barre-essai').hidden, partir).toBe(true);
      expect(p.v.aMontrer?.(), partir).toBe(partir === 'quitter');
      if (partir === 'quitter') {
        // Au retour : le refus remontré, « Trouver » rendu ; la couche là, la partie part tout de suite.
        p.v.activer();
        expect(p.el('#barre-essai').hidden).toBe(true);
        expect(p.el('#seance-trouver').disabled).toBe(false);
        p.el('#seance-trouver').click();
        expect(p.el('#barre-essai').hidden).toBe(false);
      } else expect(p.versCarte).toHaveBeenCalledTimes(1);
    }
  });
});
