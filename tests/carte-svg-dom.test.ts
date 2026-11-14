import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Carte } from '../src/map/carte';
import { UNITE } from '../src/map/traces';
import { CHOIX_LIGNES, lignesDe, NOM } from '../src/map/lignes';
import { textes } from '../src/vues/textes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { assemblerMers, zonesAllumees } from '../src/map/mers';
import { calculerPastilles } from '../src/map/pastilles';
import { anneauPrincipal, centreEmprise, contourEmprise, empriseEcran, emprisesSeCroisent, partVisible, versEcran, type Emprise } from '../src/map/geo';
import type { ContexteCarte } from '../src/map/pick';
import type { Entite } from '../src/map/types';
import { cadrageNommer } from '../src/vues/nommer';

// Carte (le rendu SVG, g par défaut, et css) sur un faux DOM : des éléments
// qui retiennent leurs attributs, d3-zoom et d3-transition tels quels, leur
// horloge (d3-timer : setTimeout, sans fenêtre au chargement, et
// performance.now) avancée par les faux minuteurs de vitest. Au format du téléphone de mesure,
// barre de Nommer comprise, comme tests/carte-canvas-dom.test.ts.

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const L = 384;
const H = 723;
const HV = H - 219;
const entite = (id: string): Entite => {
  const e = donnees.entites.find((en) => en.pays.id === id);
  if (!e) throw new Error(id);
  return e;
};

/** Un élément : attributs, classes, enfants, écouteurs ; assez pour Carte, d3-selection et d3-zoom. */
class FauxElement {
  attrs = new Map<string, string>();
  enfants: FauxElement[] = [];
  parent: FauxElement | null = null;
  dataset: Record<string, string> = {};
  style = { transform: '', setProperty: () => undefined, removeProperty: () => undefined };
  clientWidth = L;
  clientHeight = H;
  clientLeft = 0;
  clientTop = 0;
  ecouteurs: [string, (ev: unknown) => void][] = [];
  private classes = new Set<string>();
  classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    contains: (c: string) => this.classes.has(c),
  };
  get className() {
    return [...this.classes].join(' ');
  }
  set className(v: string) {
    this.classes = new Set(v.split(' ').filter(Boolean));
  }
  get isConnected() {
    return this.parent !== null;
  }
  setAttribute(k: string, v: string) {
    if (k === 'class') this.className = v;
    else this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  append(...es: FauxElement[]) {
    for (const e of es) {
      e.parent = this;
      this.enfants.push(e);
    }
  }
  prepend(...es: FauxElement[]) {
    for (const e of es) e.parent = this;
    this.enfants.unshift(...es);
  }
  replaceChildren() {
    this.enfants = [];
  }
  remove() {
    if (this.parent) this.parent.enfants = this.parent.enfants.filter((e) => e !== this);
    this.parent = null;
  }
  addEventListener(type: string, l: (ev: unknown) => void) {
    this.ecouteurs.push([type, l]);
  }
  removeEventListener(type: string, l: (ev: unknown) => void) {
    this.ecouteurs = this.ecouteurs.filter(([t, x]) => t !== type || x !== l);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: L, height: H };
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  // d3-timer a gardé l'objet performance du chargement : son now suit la fausse horloge.
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.stubGlobal('document', { createElement: () => new FauxElement(), createElementNS: () => new FauxElement() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: L, innerHeight: H });
});
afterEach(() => {
  // Les vols en cours vont à leur terme sous la fausse horloge : sinon d3-timer
  // (un seul pour tout le fichier) garde une image demandée à une horloge
  // disparue (son drapeau frame), et plus aucun minuteur ne part au test suivant.
  vi.advanceTimersByTime(10_000);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function carte(): { c: Carte; hote: FauxElement } {
  const hote = new FauxElement();
  const c = new Carte({ hote: hote as unknown as HTMLElement, donnees, projection: 'monde', rendu: 'g' });
  c.rendre();
  return { c, hote };
}

/** Un cran de molette au centre de la carte : un geste de d3-zoom (il interrompt un vol). */
function molette(hote: FauxElement): void {
  const ev = { type: 'wheel', deltaY: -100, deltaMode: 0, clientX: L / 2, clientY: H / 2, currentTarget: hote, button: 0, ctrlKey: false, preventDefault() {}, stopImmediatePropagation() {} };
  for (const [t, l] of hote.ecouteurs) if (t === 'wheel') l.call(hote, ev);
}

/** Part de l'emprise du polygone principal dans la partie visible (au-dessus de la barre), dans le contexte ctx. */
function partDe(ctx: ContexteCarte, id: string): number {
  const e = entite(id);
  const emp = empriseEcran(anneauPrincipal(e.forme, e.pays.point), (ll) => {
    const b = ctx.proj(ll);
    return b ? versEcran(ctx.t, b[0], b[1]) : null;
  });
  return emp ? partVisible(emp, L, HV) : 0;
}

describe('Carte (SVG) : une réponse en plein vol, la question suivante cadrée sur l’arrivée (#16)', () => {
  // Comme en Canvas : l'Italie demandée au zoom 1, la carte vole jusqu'à elle ;
  // répondue en moins d'une seconde, la question suivante s'allume en plein vol.
  it('la vue d’arrivée décide : la France (cachée à l’arrivée) fait voler, la Suisse (visible) non ; à la fin, chacune est à l’écran', () => {
    for (const [id, vole] of [
      ['FRA', true],
      ['CHE', false],
    ] as const) {
      const { c } = carte();
      c.montrer('ITA', HV);
      vi.advanceTimersByTime(900);
      // Le vol est bien en cours : la vue du moment n'est pas celle d'arrivée.
      expect(c.contexte().t.k).toBeGreaterThan(1);
      expect(c.contexteFinal().t).not.toEqual(c.contexte().t);
      const e = entite(id);
      const r = cadrageNommer(c, e.pays, e.forme, L, HV);
      expect([id, r.vole]).toEqual([id, vole]);
      if (r.vole) c.montrer(id, HV);
      vi.advanceTimersByTime(4000);
      expect(c.contexteFinal().t).toEqual(c.contexte().t);
      expect([id, partDe(c.contexte(), id) >= 0.9]).toEqual([id, true]);
      expect(cadrageNommer(c, e.pays, e.forme, L, HV).vole).toBe(false);
    }
  });

  it('l’arrivée s’efface à la fin du vol, quand un geste l’interrompt et quand zoomer() l’interrompt', () => {
    const { c, hote } = carte();
    expect(c.contexteFinal().t).toEqual(c.contexte().t);
    c.montrer('NOR', HV);
    vi.advanceTimersByTime(300);
    const arrivee = c.contexteFinal().t;
    expect(arrivee).not.toEqual(c.contexte().t);
    vi.advanceTimersByTime(4000);
    // Arrivé : la vue est celle annoncée, puis un geste la déplace (sans vol à interrompre).
    expect(c.contexte().t).toEqual(arrivee);
    molette(hote);
    vi.advanceTimersByTime(500);
    expect(Number.isFinite(c.contexte().t.x)).toBe(true);
    expect(c.contexte().t.k).toBeGreaterThan(arrivee.k);
    expect(c.contexteFinal().t).toEqual(c.contexte().t);
    // Un geste en plein vol : la carte reste où le geste la met.
    c.montrer('ESP', HV);
    vi.advanceTimersByTime(300);
    expect(c.contexteFinal().t).not.toEqual(c.contexte().t);
    molette(hote);
    vi.advanceTimersByTime(500);
    expect(c.contexteFinal().t).toEqual(c.contexte().t);
    // zoomer() en plein vol.
    c.montrer('GRC', HV);
    vi.advanceTimersByTime(300);
    c.zoomer({ k: 2, x: 0, y: 0 });
    expect(c.contexteFinal().t).toEqual({ k: 2, x: 0, y: 0 });
    vi.advanceTimersByTime(4000);
    expect(c.contexte().t).toEqual({ k: 2, x: 0, y: 0 });
  });
});

describe('Carte SVG : le contour de la zone fausse est entier, par-dessus les voisines (#17)', () => {
  const tous = (e: FauxElement): FauxElement[] => [e, ...e.enfants.flatMap(tous)];
  const classe = (e: FauxElement, c: string) => e.className.split(' ').includes(c);

  it('un path.contour-faux, même tracé que la zone, sur une couche après toutes les zones et les hachures ; retiré avec les marques, refait au redessin', () => {
    const { c, hote } = carte();
    c.marquer('ESP', 'juste');
    c.marquer('FRA', 'faux');
    const elements = tous(hote);
    const contours = elements.filter((e) => classe(e, 'contour-faux'));
    expect(contours.length).toBe(1);
    const [contour] = contours as [FauxElement];
    const zone = elements.find((e) => classe(e, 'pays') && e.getAttribute('data-id') === 'FRA') as FauxElement;
    expect(contour.getAttribute('d')).toBe(zone.getAttribute('d'));
    expect(contour.getAttribute('data-id')).toBe('FRA');
    // Dans l'ordre du document : après le dernier path.pays et la dernière hachure (donc par-dessus).
    const ordre = (e: FauxElement) => elements.indexOf(e);
    const derniere = Math.max(...elements.filter((e) => classe(e, 'pays') || classe(e, 'hachure')).map(ordre));
    expect(ordre(contour)).toBeGreaterThan(derniere);
    // Le juste n'a pas de contour ; un second marquer faux n'en ajoute pas.
    c.marquer('FRA', 'faux');
    expect(tous(hote).filter((e) => classe(e, 'contour-faux')).length).toBe(1);
    // Retiré avec les marques.
    c.effacerMarques();
    expect(tous(hote).filter((e) => classe(e, 'contour-faux')).length).toBe(0);
    // Refait quand la carte est redessinée (redimensionnement : rendre() repart de zéro).
    c.marquer('MAR', 'faux');
    c.rendre();
    const apres = tous(hote).filter((e) => classe(e, 'contour-faux'));
    expect(apres.map((e) => e.getAttribute('data-id'))).toEqual(['MAR']);
  });

  it('carte.css : le contour sans remplissage, de 3 px (TRAIT_FAUX_PX), joints ronds, sans pointeur ; la zone fausse garde sa frontière', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toContain('.pastille.faux, .contour-faux { stroke: var(--text); stroke-width: 3px; }');
    expect(css).toMatch(/\.contour-faux \{ fill: none; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; \}/);
    expect(css).not.toMatch(/\.pays\.faux[^{]*\{[^}]*stroke-width/);
  });
});

describe('Carte SVG : anneauEn, un anneau au point d’une ville (D53 c)', () => {
  const tous = (e: FauxElement): FauxElement[] => [e, ...e.enfants.flatMap(tous)];
  it('un cercle .anneau au point projeté, comme anneau() autour du point d’une zone ; retiré avec les marques', () => {
    const { c, hote } = carte();
    const LA_PAZ: [number, number] = [-68.13, -16.5];
    c.anneauEn(LA_PAZ, 'juste');
    c.anneau('BOL', 'choisi');
    const cercles = tous(hote).filter((e) => e.className.split(' ').includes('anneau'));
    expect(cercles.map((e) => e.className)).toEqual(['anneau juste', 'anneau choisi']);
    const [x, y] = c.projection(LA_PAZ) as [number, number];
    expect(Number(cercles[0]!.getAttribute('cx'))).toBeCloseTo(x, 6);
    expect(Number(cercles[0]!.getAttribute('cy'))).toBeCloseTo(y, 6);
    const bol = c.projection(donnees.entites.find((e) => e.pays.id === 'BOL')!.pays.point) as [number, number];
    expect(Number(cercles[1]!.getAttribute('cx'))).toBeCloseTo(bol[0], 6);
    c.effacerMarques();
    expect(tous(hote).filter((e) => e.className.split(' ').includes('anneau'))).toHaveLength(0);
  });
});

describe('Carte SVG : les teintes de la carte de la mémoire, à part des marques (#2)', () => {
  const tous = (e: FauxElement): FauxElement[] => [e, ...e.enfants.flatMap(tous)];
  const classes = (e: FauxElement | undefined) => (e?.className ?? '').split(' ').filter(Boolean);
  const pays = (hote: FauxElement, id: string) => tous(hote).find((e) => classes(e).includes('pays') && e.getAttribute('data-id') === id);
  const pastille = (hote: FauxElement, id: string) => tous(hote).find((e) => classes(e).includes('pastille') && e.getAttribute('data-id') === id);

  it('posées, gardées par effacerMarques, sous la marque, reposées par rendre(), changées puis retirées', () => {
    const { c, hote } = carte();
    c.teinter(new Map([['FRA', 3], ['ESP', 0], ['DEU', 7], ['ITA', 1.5]]));
    expect(classes(pays(hote, 'FRA'))).toContain('s3');
    expect(classes(pays(hote, 'ESP'))).toContain('s0');
    // Hors des seaux ou pas entier : pas de teinte.
    expect(classes(pays(hote, 'DEU')).filter((x) => /^s\d$/.test(x))).toEqual([]);
    expect(classes(pays(hote, 'ITA')).filter((x) => /^s\d$/.test(x))).toEqual([]);
    // Une marque s'ajoute sans retirer la teinte ; effacerMarques ne retire qu'elle.
    c.marquer('FRA', 'juste');
    expect(classes(pays(hote, 'FRA'))).toEqual(expect.arrayContaining(['s3', 'juste']));
    c.effacerMarques();
    expect(classes(pays(hote, 'FRA'))).toContain('s3');
    expect(classes(pays(hote, 'FRA'))).not.toContain('juste');
    // rendre() recrée les tracés : la teinte y est reposée.
    c.rendre();
    expect(classes(pays(hote, 'FRA'))).toContain('s3');
    // Nouvelles teintes : l'ancienne classe retirée ; null : toutes.
    c.teinter(new Map([['FRA', 1]]));
    expect(classes(pays(hote, 'FRA')).filter((x) => /^s\d$/.test(x))).toEqual(['s1']);
    expect(classes(pays(hote, 'ESP'))).not.toContain('s0');
    c.teinter(null);
    expect(tous(hote).filter((e) => classes(e).some((x) => /^s\d$/.test(x)))).toEqual([]);
  });

  it('les pastilles des micro-États prennent la teinte de leur pays, aussi quand rendre() les recrée', () => {
    const { c, hote } = carte();
    expect(pastille(hote, 'MLT')).toBeDefined();
    c.teinter(new Map([['MLT', 4]]));
    expect(classes(pastille(hote, 'MLT'))).toContain('s4');
    c.marquer('MLT', 'faux');
    c.effacerMarques();
    expect(classes(pastille(hote, 'MLT'))).toEqual(['pastille', 's4']);
    c.rendre();
    expect(classes(pastille(hote, 'MLT'))).toContain('s4');
  });

  it('carte.css : --memoire-0 à 4 dans :root, .pays.sN et .pastille.sN déclarées avant les marques (qui l’emportent)', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    const racine = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? '';
    for (let s = 0; s < 5; s++) {
      expect(racine).toMatch(new RegExp(`--memoire-${s}: #[0-9a-f]{6};`));
      expect(css).toContain(`.pays.s${s}, .pastille.s${s} { fill: var(--memoire-${s}); }`);
      expect(css.indexOf(`.pays.s${s},`)).toBeLessThan(css.indexOf('.pays.choisi'));
    }
  });
});

describe('Carte SVG : la carte de la mémoire « Mers » sans pastilles (choix de l’utilisateur du 12/11, #27)', () => {
  const tous = (e: FauxElement): FauxElement[] => [e, ...e.enfants.flatMap(tous)];
  const cercles = (hote: FauxElement) => tous(hote).filter((e) => e.className.split(' ').includes('pastille'));
  const anneaux = (hote: FauxElement) => tous(hote).filter((e) => e.className.split(' ').includes('anneau'));
  /** En mer (la mer Ionienne), à 3,6 px au sud-est du disque de Malte au zoom 1 : dans sa cible, sur aucun tracé (comme en Canvas). */
  const pres = (c: Carte): [number, number] => {
    const [mx, my] = c.ecran('MLT') as [number, number];
    return [mx + 3, my + 2];
  };

  it('le défaut est inchangé : les pastilles de calculerPastilles, un cercle par disque, Malte touchée par la sienne', () => {
    const { c, hote } = carte();
    const ctx = c.contexte();
    expect(ctx.pastilles).toEqual(calculerPastilles(donnees.entites, ctx.proj, ctx.t.k));
    expect(cercles(hote)).toHaveLength(ctx.pastilles.filter((p) => p.visible).length);
    expect(hote.dataset.disques).toBe(String(cercles(hote).length));
    expect(cercles(hote).length).toBeGreaterThan(50);
    expect(c.pick(...pres(c))).toMatchObject({ id: 'MLT', via: 'pastille' });
  });

  it('cachées : aucun cercle, ni pick, ni noter, 0 sur l’hôte ; les anneaux et les marques restent ; un zoom ne les rend pas ; rendues : les mêmes qu’avant', () => {
    const { c, hote } = carte();
    const avant = c.contexte().pastilles;
    const nb = cercles(hote).length;
    const p = pres(c);
    c.anneau('MLT', 'choisi');
    c.cacherPastilles(true);
    expect(cercles(hote)).toEqual([]);
    expect(anneaux(hote)).toHaveLength(1);
    expect(c.nbPastilles).toBe(0);
    expect(hote.dataset).toMatchObject({ pastilles: '0', disques: '0' });
    expect(c.pick(...p)?.id).not.toBe('MLT');
    expect(c.noter('MLT', ...p).juste).toBe(false);
    // Une marque sur Malte : son tracé seul.
    c.marquer('MLT', 'choisi');
    expect(cercles(hote)).toEqual([]);
    c.effacerMarques();
    // Un zoom (fin de geste : majPastilles) et un retracé (rendre) : toujours aucune.
    c.zoomerDe(2);
    vi.advanceTimersByTime(400);
    expect(c.transfo.k).toBeCloseTo(2, 9);
    expect(c.contexte().pastilles).toEqual([]);
    c.rendre();
    expect(cercles(hote)).toEqual([]);
    c.vueEntiere();
    vi.advanceTimersByTime(1000);
    c.cacherPastilles(false);
    expect(c.contexte().pastilles).toEqual(avant);
    expect(cercles(hote)).toHaveLength(nb);
    expect(c.pick(...p)).toMatchObject({ id: 'MLT', via: 'pastille' });
  });

  it('cachées avant le premier rendre() : il n’en dessine aucune', () => {
    const hote = new FauxElement();
    const c = new Carte({ hote: hote as unknown as HTMLElement, donnees, projection: 'monde', rendu: 'g' });
    c.cacherPastilles(true);
    c.rendre();
    expect(cercles(hote)).toEqual([]);
    expect(hote.dataset.disques).toBe('0');
  });
});

describe('Carte (SVG) : boutons de zoom, un cran et toute la carte (#23)', () => {
  /** Le point de base (px au zoom 1) au centre de la carte. */
  const auCentre = (t: { k: number; x: number; y: number }): [number, number] => [(L / 2 - t.x) / t.k, (H / 2 - t.y) / t.k];

  it('un cran zoome de 2 en 250 ms, le centre au centre ; deux crans rapprochés : de 4 ; dézoomer revient d’autant', () => {
    const { c } = carte();
    c.zoomerSur('ITA');
    const t0 = c.transfo;
    const centre = auCentre(t0);
    c.zoomerDe(2);
    vi.advanceTimersByTime(120);
    expect(c.transfo.k).toBeGreaterThan(t0.k);
    expect(c.transfo.k).toBeLessThan(2 * t0.k);
    // Le second cran pendant le vol du premier part de son arrivée.
    expect(c.contexteFinal().t.k).toBeCloseTo(2 * t0.k, 9);
    c.zoomerDe(2);
    vi.advanceTimersByTime(400);
    expect(c.transfo.k).toBeCloseTo(4 * t0.k, 9);
    const [bx, by] = auCentre(c.transfo);
    expect(Math.abs(bx - centre[0])).toBeLessThan(1e-6);
    expect(Math.abs(by - centre[1])).toBeLessThan(1e-6);
    c.zoomerDe(0.5);
    vi.advanceTimersByTime(400);
    expect(c.transfo.k).toBeCloseTo(2 * t0.k, 9);
  });

  it('dézoomer depuis un bord garde la carte dans la borne des gestes : au zoom 1, la vue du départ', () => {
    const { c } = carte();
    // Zoom 2, la carte poussée hors de la borne (zoomer ne la borne pas).
    c.zoomer({ k: 2, x: -5 * L, y: 3 * H });
    c.zoomerDe(0.5);
    vi.advanceTimersByTime(400);
    const t = c.transfo;
    expect(t.k).toBe(1);
    expect(Math.abs(t.x)).toBeLessThan(1e-6);
    expect(Math.abs(t.y)).toBeLessThan(1e-6);
  });

  it('au zoom 1, − ne fait rien ; pendant un geste (molette), les boutons non plus', () => {
    const { c, hote } = carte();
    c.zoomerDe(0.5);
    vi.advanceTimersByTime(400);
    expect(c.transfo).toEqual({ k: 1, x: 0, y: 0 });
    molette(hote);
    vi.advanceTimersByTime(50);
    const t = c.transfo;
    c.zoomerDe(2);
    c.vueEntiere();
    vi.advanceTimersByTime(20);
    expect(c.contexteFinal().t).toEqual(t);
    // Le geste fini (150 ms sans molette), un cran repart.
    vi.advanceTimersByTime(300);
    c.zoomerDe(2);
    vi.advanceTimersByTime(400);
    expect(c.transfo.k).toBeCloseTo(2 * t.k, 9);
  });

  it('toute la carte : la vue du départ, en vol, depuis n’importe où', () => {
    const { c } = carte();
    c.zoomerSur('JPN');
    c.vueEntiere();
    vi.advanceTimersByTime(100);
    expect(c.transfo.k).toBeGreaterThan(1);
    expect(c.contexteFinal().t).toEqual({ k: 1, x: 0, y: 0 });
    vi.advanceTimersByTime(1000);
    expect(c.transfo).toEqual({ k: 1, x: 0, y: 0 });
  });
});

describe('Carte SVG : océans et mers (lot 3a, étude J2, § 4.3)', () => {
  const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
  const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
  const tous = (e: FauxElement): FauxElement[] => [e, ...e.enfants.flatMap(tous)];
  const classes = (e: FauxElement | undefined) => (e?.className ?? '').split(' ').filter(Boolean);
  const mer = (hote: FauxElement, id: string) => tous(hote).find((e) => classes(e).includes('mer') && e.getAttribute('data-id') === id);
  const couche_ = (hote: FauxElement, c: string) => tous(hote).find((e) => classes(e).includes(c)) as FauxElement;
  function carteMers(): { c: Carte; hote: FauxElement } {
    const hote = new FauxElement();
    const c = new Carte({ hote: hote as unknown as HTMLElement, donnees: { ...donnees, mers: [] }, projection: 'monde', rendu: 'g' });
    c.rendre();
    return { c, hote };
  }

  it('g.couche-mers entre path.sphere et g.couche-pays, un path.mer par zone ; rien avant la couche', () => {
    const { c, hote } = carteMers();
    expect(tous(hote).filter((e) => classes(e).includes('mer'))).toEqual([]);
    expect(c.ecran('atlant')).toBeNull();
    c.prendreMers(couche);
    const elements = tous(hote);
    const ordre = (e: FauxElement | undefined) => elements.indexOf(e as FauxElement);
    const mers = couche_(hote, 'couche-mers');
    const contours = couche_(hote, 'couche-contours-mers');
    const pays = couche_(hote, 'couche-pays');
    expect(mers.enfants.map((e) => e.getAttribute('data-id'))).toEqual(couche.mers.map((e) => e.pays.id));
    expect(mers.enfants.every((e) => classes(e).join(' ') === 'mer' && (e.getAttribute('d') ?? '').length > 10)).toBe(true);
    expect(ordre(elements.find((e) => classes(e).includes('sphere')))).toBeLessThan(ordre(mers));
    expect(ordre(mers)).toBeLessThan(ordre(contours));
    expect(ordre(contours)).toBeLessThan(ordre(pays));
    // Même parent que les pays : à la même échelle (centièmes de px).
    expect(mers.parent).toBe(pays.parent);
    expect(c.ecran('atlant')).not.toBeNull();
  });

  it('classes de seau et de marque ; l’océan allumé avec les Sargasses, jamais la mer côtière ; effacerMarques garde les teintes', () => {
    const { c, hote } = carteMers();
    c.teinter(new Map([['medit', 2], ['FRA', 1]]));
    c.marquer('atlant', 'choisi');
    c.prendreMers(couche);
    expect(classes(mer(hote, 'medit'))).toEqual(['mer', 's2']);
    expect(classes(mer(hote, 'atlant'))).toEqual(['mer', 'choisi']);
    expect(classes(mer(hote, 'sargasse'))).toEqual(['mer', 'choisi']);
    expect(classes(mer(hote, 'caraibes'))).toEqual(['mer']);
    c.effacerMarques();
    c.marquer('sargasse', 'juste');
    expect(classes(mer(hote, 'atlant'))).toEqual(['mer']);
    expect(classes(mer(hote, 'sargasse'))).toEqual(['mer', 'juste']);
    c.effacerMarques();
    expect(classes(mer(hote, 'sargasse'))).toEqual(['mer']);
    expect(classes(mer(hote, 'medit'))).toEqual(['mer', 's2']);
    c.teinter(null);
    expect(classes(mer(hote, 'medit'))).toEqual(['mer']);
  });

  it('le contour faux d’une mer sous les pays : l’union de l’océan et des Sargasses (sans leur bord commun) ; retiré avec les marques, refait au redessin', () => {
    const { c, hote } = carteMers();
    c.prendreMers(couche);
    c.marquer('atlant', 'faux');
    const contours = couche_(hote, 'couche-contours-mers');
    expect(contours.enfants.map((e) => [e.getAttribute('data-id'), classes(e).join(' ')])).toEqual([['atlant', 'contour-faux']]);
    const d = contours.enfants[0]?.getAttribute('d') ?? '';
    const dAtl = mer(hote, 'atlant')?.getAttribute('d') ?? '';
    const sousChemins = (x: string) => (x.match(/M/g) ?? []).length;
    expect(sousChemins(d)).toBe(sousChemins(dAtl) - 1);
    expect(tous(hote).filter((e) => classes(e).includes('contour-faux') && e.parent !== contours)).toEqual([]);
    c.effacerMarques();
    expect(contours.enfants).toEqual([]);
    c.marquer('medit', 'faux');
    c.rendre();
    const apres = couche_(hote, 'couche-contours-mers');
    expect(apres.enfants.map((e) => e.getAttribute('data-id'))).toEqual(['medit']);
    expect(classes(mer(hote, 'medit'))).toEqual(['mer', 'faux']);
  });

  // Le Pacifique, Béring, l'Austral et l'Arctique coupés à ±180 (Natural Earth) : en « pacifique », le
  // 180e méridien passe au milieu de la carte, et le contour faux n'y trace pas leur couture (comme le Canvas et le WebGL).
  it('le contour faux d’une mer coupée à ±180 ne suit pas le 180e méridien (projection pacifique)', () => {
    const hote = new FauxElement();
    const c = new Carte({ hote: hote as unknown as HTMLElement, donnees: { ...donnees, mers: [] }, projection: 'pacifique', rendu: 'g' });
    c.rendre();
    c.prendreMers(couche);
    const proj = c.contexte().proj;
    for (const id of ['pacif', 'bering', 'austral', 'arctique']) {
      c.marquer(id, 'faux');
      const d = couche_(hote, 'couche-contours-mers').enfants.find((e) => e.getAttribute('data-id') === id)?.getAttribute('d') ?? '';
      expect(d.length, id).toBeGreaterThan(100);
      // Les segments dont les deux bouts sont sur le 180e méridien, à 0,02° près (la côte des Fidji passe à 179,93°) ;
      // M et L absolus de geoPath, l relatif de traceDirect, en UNITE.
      let prec: number | null = null;
      let [x, y] = [0, 0];
      let surLaCouture = 0;
      for (const [, op, xs, ys] of d.matchAll(/([MLlZ])(-?\d+)?,?(-?\d+)?/g)) {
        if (op === 'Z') {
          prec = null;
          continue;
        }
        [x, y] = op === 'l' ? [x + Number(xs), y + Number(ys)] : [Number(xs), Number(ys)];
        const ll = proj.invert?.([x / UNITE, y / UNITE]);
        const lon = ll ? Math.abs(ll[0]) : 0;
        if (op !== 'M' && prec !== null && prec > 179.98 && lon > 179.98) surLaCouture++;
        prec = lon;
      }
      expect(surLaCouture, id).toBe(0);
      c.effacerMarques();
    }
  });

  // En « monde » (λ0 = 0), la couture du Pacifique est le bord de l'ovale, courbe : tracée par ses deux bouts seulement,
  // sa corde laissait un croissant non teinté entre la mer et le bord (vu au ?mers=demo du 12/11, rendus g et css).
  it('le remplissage d’une mer coupée à ±180 suit le bord de l’ovale : ses coutures densifiées, un sommet par degré', () => {
    const { c, hote } = carteMers();
    c.prendreMers(couche);
    const proj = c.contexte().proj;
    for (const id of ['pacif', 'austral']) {
      const d = mer(hote, id)?.getAttribute('d') ?? '';
      let [x, y] = [0, 0];
      let auBord = 0;
      for (const [, op, xs, ys] of d.matchAll(/([MLlZ])(-?\d+)?,?(-?\d+)?/g)) {
        if (op === 'Z') continue;
        [x, y] = op === 'l' ? [x + Number(xs), y + Number(ys)] : [Number(xs), Number(ys)];
        const ll = proj.invert?.([x / UNITE, y / UNITE]);
        if (ll && Math.abs(ll[0]) > 179.9) auBord++;
      }
      // Pacifique : ses coutures nord et sud couvrent plus de 100° de latitude ; sans densification, une poignée de sommets.
      expect(auBord, id).toBeGreaterThan(id === 'pacif' ? 100 : 20);
    }
  });

  it('carte.css : .mer sans remplissage ni trait ; teintes puis marques sur l’eau, tirées des jetons de :root', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    const racine = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? '';
    expect(css).toContain('.mer { fill: none; stroke: none; pointer-events: none; }');
    for (const [jeton, valeur] of [['--mer-choisie', 'var(--accent)'], ['--mer-juste', 'var(--good)'], ['--mer-fausse', 'var(--danger)']]) expect(racine).toContain(`${jeton}: ${valeur};`);
    for (let s = 0; s < 5; s++) {
      expect(racine).toContain(`--memoire-mer-${s}: var(--memoire-${s});`);
      expect(css).toContain(`.mer.s${s} { fill: var(--memoire-mer-${s}); }`);
      expect(css.indexOf(`.mer.s${s} `)).toBeLessThan(css.indexOf('.mer.choisi'));
    }
    expect(css).toContain('.mer.faux { fill: var(--mer-fausse); }');
  });
});

describe('Carte SVG : une mer se cadre par son emprise (lot 3a, étude J2, § 4.5)', () => {
  const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
  const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
  const bbox = (id: string) => couche.mers.find((e) => e.pays.id === id)!.pays.bbox;
  function carteMers(projection: 'monde' | 'pacifique'): Carte {
    const c = new Carte({ hote: new FauxElement() as unknown as HTMLElement, donnees: { ...donnees, mers: [] }, projection, rendu: 'g' });
    c.rendre();
    c.prendreMers(couche);
    return c;
  }
  /** Le contour de l'emprise à l'écran, dans le contexte de la carte. */
  const aLEcran = (c: Carte, e: Emprise) =>
    contourEmprise(e).map((ll) => {
      const ctx = c.contexte();
      const b = ctx.proj(ll) as [number, number];
      return versEcran(ctx.t, b[0], b[1]);
    });
  const dedans = (pts: [number, number][], h: number) => pts.every(([x, y]) => x >= -1 && x <= L + 1 && y >= -1 && y <= h + 1);

  it('le Pacifique entier au-dessus de la barre, en projection pacifique centré sur son milieu (vers 157° O) ; en projection monde, entier aussi', () => {
    const c = carteMers('pacifique');
    c.montrer('pacif', HV);
    vi.advanceTimersByTime(4000);
    const pts = aLEcran(c, bbox('pacif'));
    expect(dedans(pts, HV)).toBe(true);
    const [cx] = (() => {
      const ctx = c.contexte();
      const b = ctx.proj(centreEmprise(bbox('pacif'))) as [number, number];
      return versEcran(ctx.t, b[0], b[1]);
    })();
    expect(centreEmprise(bbox('pacif'))[0]).toBeCloseTo(-156.8, 0);
    expect(Math.abs(cx - L / 2)).toBeLessThan(0.05 * L);
    expect(c.contexte().t.k).toBeGreaterThan(1);
    const m = carteMers('monde');
    m.montrer('pacif', HV);
    vi.advanceTimersByTime(4000);
    expect(dedans(aLEcran(m, bbox('pacif')), HV)).toBe(true);
  });

  it('Béring, de part et d’autre de l’antiméridien, entier ; zoomerSur aussi, sans barre', () => {
    const c = carteMers('pacifique');
    c.montrer('bering', HV);
    vi.advanceTimersByTime(4000);
    expect(dedans(aLEcran(c, bbox('bering')), HV)).toBe(true);
    expect(c.contexte().t.k).toBeGreaterThan(2);
    c.zoomerSur('medit');
    expect(dedans(aLEcran(c, bbox('medit')), H)).toBe(true);
    expect(c.contexte().t.k).toBeGreaterThan(2);
  });

  it('l’Arctique et l’Austral, bandes de 360° : leur bande en latitude au-dessus de la barre, autour du méridien central, vue finie', () => {
    for (const projection of ['monde', 'pacifique'] as const) {
      for (const id of ['arctique', 'austral']) {
        const c = carteMers(projection);
        c.montrer(id, HV);
        vi.advanceTimersByTime(4000);
        const t = c.contexte().t;
        expect([projection, id, Number.isFinite(t.k) && Number.isFinite(t.x) && Number.isFinite(t.y), t.k >= 1]).toEqual([projection, id, true, true]);
        const [, s, , n] = bbox(id);
        const lon0 = projection === 'monde' ? 0 : 150;
        const ctx = c.contexte();
        for (const lat of [s, n]) {
          const b = ctx.proj([lon0, lat]) as [number, number];
          const [x, y] = versEcran(t, b[0], b[1]);
          expect([projection, id, lat, Math.abs(x - L / 2) < 1, y >= -1 && y <= HV + 1]).toEqual([projection, id, lat, true, true]);
        }
      }
    }
  });

  // Relecture du lot 3a : contexte() et contexteFinal() passent la couche
  // marine (mers, lieux) une fois posée ; sans elle, carte.noter(<mer>)
  // levait l'erreur même après prendreMers, sans qu'aucun test le voie.
  it('noter une mer sur la carte : une erreur avant prendreMers, juste au point de l’Atlantique après ; la couche dans contexteFinal pendant un vol', () => {
    const c = new Carte({ hote: new FauxElement() as unknown as HTMLElement, donnees: { ...donnees, mers: [] }, projection: 'monde', rendu: 'g' });
    c.rendre();
    expect(() => c.noter('atlant', L / 2, H / 2)).toThrow(/cible marine avant la couche marine/);
    c.prendreMers(couche);
    const [x, y] = c.ecran('atlant') as [number, number];
    expect(c.noter('atlant', x, y)).toMatchObject({ juste: true, pick: { id: 'atlant' } });
    expect(c.contexte().mers?.length).toBe(couche.mers.length);
    c.montrer('pacif', HV);
    vi.advanceTimersByTime(300);
    const fin = c.contexteFinal();
    expect(fin.t).not.toEqual(c.contexte().t);
    expect(fin.mers?.length).toBe(couche.mers.length);
    expect(fin.lieux?.get('pacif')?.couche).toBe('mers');
  });

  it('un pays : le cadrage d’avant (son point d’étiquette au centre de la partie visible)', () => {
    const c = carteMers('monde');
    c.zoomerSur('ITA');
    const p = c.ecran('ITA') as [number, number];
    expect(Math.abs(p[0] - L / 2)).toBeLessThan(1e-6);
    expect(Math.abs(p[1] - H / 2)).toBeLessThan(1e-6);
  });
});

describe('Carte SVG : lignes de repère (#11)', () => {
  const tous = (e: FauxElement): FauxElement[] => [e, ...e.enfants.flatMap(tous)];
  const de = (e: FauxElement, c: string) => e.className.split(' ').includes(c);
  const lignes = lignesDe(CHOIX_LIGNES, textes.lignes);

  it('un path.ligne-repere dans g.couche-lignes, entre les pays et les hachures ; une zone allumée copiée au-dessus (sans data-id) ; retirées avec []', () => {
    const { c, hote } = carte();
    expect(tous(hote).some((e) => de(e, 'ligne-repere'))).toBe(false);
    c.lignes(lignes);
    expect(c.nbLignes).toBe(lignes.length);
    expect(hote.dataset.lignes).toBe(String(lignes.length));
    const elements = tous(hote);
    const traits = elements.filter((e) => de(e, 'ligne-repere'));
    expect(traits).toHaveLength(1);
    expect((traits[0] as FauxElement).getAttribute('d')?.length).toBeGreaterThan(100);
    const ordre = (e: FauxElement) => elements.indexOf(e);
    const derniereZone = Math.max(...elements.filter((e) => de(e, 'pays')).map(ordre));
    const premiereHachure = Math.min(...elements.filter((e) => de(e, 'hachure')).map(ordre));
    expect(ordre(traits[0] as FauxElement)).toBeGreaterThan(derniereZone);
    expect(ordre(traits[0] as FauxElement)).toBeLessThan(premiereHachure);
    c.marquer('BRA', 'choisi');
    const apres = tous(hote);
    const allumees = apres.filter((e) => de(e, 'allumee'));
    expect(allumees).toHaveLength(1);
    const bra = apres.find((e) => de(e, 'pays') && e.getAttribute('data-id') === 'BRA') as FauxElement;
    expect((allumees[0] as FauxElement).getAttribute('d')).toBe(bra.getAttribute('d'));
    expect((allumees[0] as FauxElement).getAttribute('data-id')).toBeNull();
    expect(de(allumees[0] as FauxElement, 'choisi')).toBe(true);
    expect(apres.indexOf(allumees[0] as FauxElement)).toBeGreaterThan(apres.indexOf(apres.find((e) => de(e, 'ligne-repere')) as FauxElement));
    c.effacerMarques();
    expect(tous(hote).some((e) => de(e, 'allumee'))).toBe(false);
    // Refaites par rendre() (un redimensionnement).
    c.marquer('ARG', 'faux');
    c.rendre();
    expect(tous(hote).filter((e) => de(e, 'ligne-repere'))).toHaveLength(1);
    expect(tous(hote).filter((e) => de(e, 'allumee'))).toHaveLength(1);
    c.lignes([]);
    expect(tous(hote).some((e) => de(e, 'ligne-repere') || de(e, 'allumee'))).toBe(false);
  });

  it('une mer allumée : copiée au-dessus des lignes (path.mer, sa marque, sans data-id), masquée par les terres de son emprise', () => {
    const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
    const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
    const hote = new FauxElement();
    const c = new Carte({ hote: hote as unknown as HTMLElement, donnees: { ...donnees, mers: [] }, projection: 'monde', rendu: 'g' });
    c.rendre();
    c.prendreMers(couche);
    c.lignes(lignes);
    c.marquer('atlant', 'choisi');
    const elements = tous(hote);
    const allumees = elements.find((e) => de(e, 'couche-allumees')) as FauxElement;
    const copies = allumees.enfants.filter((e) => de(e, 'allumee-mer'));
    const zones = zonesAllumees('atlant', couche.mers.map((e) => e.pays));
    expect(zones.length).toBeGreaterThan(1); // l'Atlantique et les Sargasses
    expect(copies).toHaveLength(zones.length);
    const masque = allumees.enfants.find((e) => de(e, 'masque-terres')) as FauxElement;
    expect(masque.getAttribute('id')).toBe('terres-allumees');
    copies.forEach((p, i) => {
      const original = elements.find((e) => de(e, 'mer') && e.getAttribute('data-id') === zones[i]) as FauxElement;
      expect(p.getAttribute('d')).toBe(original.getAttribute('d'));
      expect(p.getAttribute('data-id')).toBeNull();
      expect(de(p, 'mer') && de(p, 'choisi')).toBe(true);
      expect(p.getAttribute('mask')).toBe('url(#terres-allumees)');
    });
    expect(elements.indexOf(copies[0] as FauxElement)).toBeGreaterThan(elements.indexOf(elements.find((e) => de(e, 'ligne-repere')) as FauxElement));
    // Le masque : les terres qui touchent l'Atlantique (le Brésil), pas les autres (la Mongolie).
    const trace = masque.enfants.find((e) => de(e, 'masque-terres-trace'))?.getAttribute('d') ?? '';
    const d = (id: string) => elements.find((e) => de(e, 'pays') && e.getAttribute('data-id') === id)?.getAttribute('d') ?? '?';
    expect(trace).toContain(d('BRA'));
    expect(trace).not.toContain(d('MNG'));
    c.effacerMarques();
    expect(allumees.enfants).toEqual([]);
  });

  it('emprisesSeCroisent : en latitude, en longitude, à cheval sur l’antiméridien', () => {
    expect(emprisesSeCroisent([-10, 0, 10, 10], [5, 5, 20, 20])).toBe(true);
    expect(emprisesSeCroisent([-10, 0, 10, 10], [5, 11, 20, 20])).toBe(false);
    expect(emprisesSeCroisent([-10, 0, 10, 10], [11, 0, 20, 10])).toBe(false);
    expect(emprisesSeCroisent([170, 0, -170, 10], [-175, 0, -160, 10])).toBe(true);
    expect(emprisesSeCroisent([170, 0, -170, 10], [160, 0, 175, 10])).toBe(true);
    expect(emprisesSeCroisent([170, 0, -170, 10], [0, 0, 20, 10])).toBe(false);
    expect(emprisesSeCroisent([114, -60, -68, 61], [100, 0, 140, 50])).toBe(true);
  });

  it('sans ligne, aucune copie d’une zone marquée (rien à couvrir)', () => {
    const { c, hote } = carte();
    c.marquer('BRA', 'choisi');
    expect(tous(hote).some((e) => de(e, 'allumee'))).toBe(false);
  });

  it('pick et noter ne voient pas les lignes ; leurs noms posés à l’arrêt (div.lignes-noms), cachés pendant un vol', () => {
    const { c: sans } = carte();
    const { c, hote } = carte();
    c.lignes(lignes);
    for (let x = 10; x < L; x += 37)
      for (let y = 200; y < 560; y += 29) {
        expect(c.pick(x, y)?.id ?? null).toBe(sans.pick(x, y)?.id ?? null);
        expect(c.noter('FRA', x, y).juste).toBe(sans.noter('FRA', x, y).juste);
      }
    const couche = hote.enfants.find((e) => de(e, 'lignes-noms')) as FauxElement & { hidden: boolean };
    expect(couche).toBeDefined();
    expect(couche.hidden).toBe(false);
    expect(couche.enfants.map((e) => e.dataset.ligne)).toContain('equateur');
    // Chaque état de la couche, retenu : cachée pendant le vol puis montrée à
    // l'arrivée, même si le vol part et finit au même tic.
    const etats: boolean[] = [];
    let cachee = couche.hidden;
    Object.defineProperty(couche, 'hidden', {
      get: () => cachee,
      set: (v: boolean) => {
        cachee = v;
        etats.push(v);
      },
    });
    c.zoomerDe(2);
    vi.advanceTimersByTime(450);
    expect(etats).toContain(true);
    expect(etats.indexOf(true)).toBeLessThan(etats.lastIndexOf(false));
    expect(couche.hidden).toBe(false);
  });

  it('carte.css : les jetons dans :root, le trait sans remplissage ni pointeur, la zone allumée prend la couleur de sa marque', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    for (const v of ['--ligne-repere:', '--ligne-repere-repos:', '--ligne-repere-texte:']) expect(css.slice(0, css.indexOf('}'))).toContain(v);
    expect(css).toMatch(/\.ligne-repere \{ fill: none; stroke: var\(--ligne-repere\);[^}]*pointer-events: none; \}/);
    expect(css).toContain('.allumee.choisi { fill: var(--accent); }');
    expect(css).toMatch(new RegExp(`\\.ligne-nom \\{[^}]*line-height: ${NOM.hauteur}px;`));
  });
});
