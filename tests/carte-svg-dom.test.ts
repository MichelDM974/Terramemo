import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Carte } from '../src/map/carte';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { assemblerMers } from '../src/map/mers';
import { anneauPrincipal, empriseEcran, partVisible, versEcran } from '../src/map/geo';
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
