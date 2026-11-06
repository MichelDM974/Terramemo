import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CarteCanvas } from '../src/map/carte-canvas';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { anneauPrincipal, empriseEcran, partVisible, versEcran } from '../src/map/geo';
import type { ContexteCarte } from '../src/map/pick';
import type { Entite } from '../src/map/types';

// CarteCanvas elle-même (pas seulement vue.ts et dessin.ts) sur un faux DOM :
// un hôte, un Canvas 2D qui note ce qu'on lui demande, requestAnimationFrame
// avancé à la main (les images d'un vol de montrer()). Au format du téléphone
// de mesure (carte de 384 × 723 px CSS, densité 2,8125), barre de Nommer
// comprise (~211 px + 8, comme tests/ile.test.ts).

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const L = 384;
const H = 723;
const DPR = 2.8125;
const BARRE_NOMMER = 219;
const HV = H - BARRE_NOMMER;
const entite = (id: string): Entite => {
  const e = donnees.entites.find((en) => en.pays.id === id);
  if (!e) throw new Error(id);
  return e;
};

/** Couleurs de :root (style.css) lues par lireCouleurs. */
const VARS: Record<string, string> = {
  '--mer': '#0e1a2b', '--terre': '#23252b', '--frontiere-fine': '#55575e', '--hachure': '#ecf1fe47',
  '--pastille': '#8e939d', '--bg': '#080809', '--text': '#eff0f3', '--accent': '#6b8afd', '--good': '#34c77b', '--danger': '#f0686b',
};

/** Un chemin Path2D : ses sous-chemins (moveTo, lineTo, rect), assez pour compter ce qui est tracé. */
class FauxChemin {
  ops: (['M' | 'L', number, number] | ['R', number, number, number, number])[] = [];
  moveTo(x: number, y: number) {
    this.ops.push(['M', x, y]);
  }
  lineTo(x: number, y: number) {
    this.ops.push(['L', x, y]);
  }
  rect(x: number, y: number, l: number, h: number) {
    this.ops.push(['R', x, y, l, h]);
  }
}

interface Trait {
  chemin: FauxChemin | 'courant';
  style: string;
  largeur: number;
  joint: string;
  /** Le dernier arc du chemin courant (pastilles, anneaux). */
  arc: [number, number, number] | null;
}

/** Un faux Canvas 2D : remplissages et traits de la dernière image, notés avec leur style du moment. */
function fauxCtx() {
  const remplis: { chemin: FauxChemin | 'courant'; style: string }[] = [];
  const traits: Trait[] = [];
  let arc: [number, number, number] | null = null;
  const ctx = {
    fillStyle: '' as unknown,
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    setTransform: () => undefined,
    // Une nouvelle image : seule la dernière est gardée (un vol en fait cent).
    clearRect: () => {
      remplis.length = 0;
      traits.length = 0;
    },
    beginPath: () => (arc = null),
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: (x: number, y: number, r: number) => (arc = [x, y, r]),
    createPattern: () => null,
    fill(chemin?: FauxChemin) {
      remplis.push({ chemin: chemin ?? 'courant', style: String(ctx.fillStyle) });
    },
    stroke(chemin?: FauxChemin) {
      traits.push({ chemin: chemin ?? 'courant', style: ctx.strokeStyle, largeur: ctx.lineWidth, joint: ctx.lineJoin, arc: chemin ? null : arc });
    },
  };
  return { ctx, remplis, traits };
}

let images: Map<number, FrameRequestCallback>;
let prochaine: number;
let ctx2d: ReturnType<typeof fauxCtx>;

beforeEach(() => {
  images = new Map();
  prochaine = 1;
  ctx2d = fauxCtx();
  const fauxCanvas = () => ({
    className: '',
    style: {},
    width: 0,
    height: 0,
    isConnected: false,
    setAttribute: () => undefined,
    getContext: () => ctx2d.ctx,
    remove: () => undefined,
  });
  vi.stubGlobal('document', { documentElement: {}, createElement: fauxCanvas });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (n: string) => ` ${VARS[n] ?? ''} ` }));
  vi.stubGlobal('Path2D', FauxChemin);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    images.set(prochaine, f);
    return prochaine++;
  });
  vi.stubGlobal('cancelAnimationFrame', (n: number) => images.delete(n));
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('window', { devicePixelRatio: DPR, innerWidth: L, innerHeight: H, setTimeout, clearTimeout });
});
afterEach(() => vi.unstubAllGlobals());

/** Les images demandées, jouées à l'instant ts (ms). */
function image(ts: number): void {
  const fs = [...images.values()];
  images.clear();
  for (const f of fs) f(ts);
}

/** Les images d'un vol, de 0 à fin ms (toutes les 16 ms), comme le navigateur les donnerait. */
function jouer(debut: number, fin: number): void {
  for (let ts = debut; ts <= fin; ts += 16) image(ts);
}

function carte(): CarteCanvas {
  const hote = {
    classList: { add: () => undefined, remove: () => undefined },
    dataset: {},
    clientWidth: L,
    clientHeight: H,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    prepend: () => undefined,
  };
  const c = new CarteCanvas({ hote: hote as unknown as HTMLElement, donnees, projection: 'monde', rendu: 'canvas' });
  c.rendre();
  return c;
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

describe('CarteCanvas : montrer() de Nommer cadre comme le SVG (#16)', () => {
  const europe = donnees.entites.filter((e) => e.pays.continent === 'Europe' && e.pays.statut === 'jouable').map((e) => e.pays.id);

  // Hors de la liste : l'Argentine (53 %) et l'Australie (79 %), trop au sud
  // pour monter au-dessus de la barre : le bas de l'ovale ne quitte pas le bas
  // de l'écran (bornerY ; translateExtent de la sphère en SVG, la même borne).
  it('au-dessus de la barre, le polygone principal entier : au moins 90 % de lui (Europe, Chili, Norvège, Russie, Indonésie…)', () => {
    expect(europe.length).toBeGreaterThan(40);
    const c = carte();
    const rates: string[] = [];
    for (const id of [...europe, 'CHL', 'NOR', 'RUS', 'IDN', 'NZL', 'JPN', 'VNM']) {
      c.montrer(id, HV);
      jouer(0, 2100);
      const part = partDe(c.contexte(), id);
      if (part < 0.9) rates.push(`${id} ${(100 * part).toFixed(0)} % (k ${c.transfo.k.toFixed(1)})`);
      // Le point de la zone reste dans la partie visible.
      const p = c.ecran(id);
      if (!p || p[0] < 0 || p[0] > L || p[1] < 0 || p[1] > HV) rates.push(`${id} : point hors de la partie visible (${p})`);
    }
    expect(rates).toEqual([]);
  });

  it('zoomerSur (sans barre) reste centré sur le point, sur toute la hauteur', () => {
    const c = carte();
    c.zoomerSur('ITA');
    const p = c.ecran('ITA') as [number, number];
    expect(Math.abs(p[0] - L / 2)).toBeLessThan(1e-6);
    expect(Math.abs(p[1] - H / 2)).toBeLessThan(1e-6);
  });
});
