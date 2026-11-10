import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aCoupure, calque, CarteCanvas, TRAIT_FAUX_PX } from '../src/map/carte-canvas';
import { assembler, formesLegeres, type DonneesCarte } from '../src/map/donnees';
import { teintesDemo } from '../src/map/teintes';
import { idsJouables } from '../src/terrains';
import { anneauPrincipal, empriseEcran, partVisible, versEcran } from '../src/map/geo';
import { bornerY, type Cadre, type VueGlobe } from '../src/map/vue';
import type { ContexteCarte } from '../src/map/pick';
import type { Entite } from '../src/map/types';
import { cadrageNommer } from '../src/vues/nommer';

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
  '--memoire-0': '#854408', '--memoire-1': '#a56004', '--memoire-2': '#c37e00', '--memoire-3': '#df9f00', '--memoire-4': '#f8c20d',
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

/** Un faux Canvas 2D : remplissages et traits de la dernière image, notés avec leur style du moment ; images effacées. */
function fauxCtx() {
  const remplis: { chemin: FauxChemin | 'courant'; style: string }[] = [];
  const traits: Trait[] = [];
  let arc: [number, number, number] | null = null;
  const etat = { effacees: 0 };
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
      etat.effacees++;
    },
    save: () => undefined,
    restore: () => undefined,
    clip: () => undefined,
    beginPath: () => (arc = null),
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: (x: number, y: number, r: number) => (arc = [x, y, r]),
    // Le motif des hachures : un objet (fillStyle non textuel), pour voir où il est peint.
    createPattern: () => ({ motif: true, setTransform: () => undefined }),
    fill(chemin?: FauxChemin) {
      remplis.push({ chemin: chemin ?? 'courant', style: typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'motif' });
    },
    stroke(chemin?: FauxChemin) {
      traits.push({ chemin: chemin ?? 'courant', style: ctx.strokeStyle, largeur: ctx.lineWidth, joint: ctx.lineJoin, arc: chemin ? null : arc });
    },
  };
  return { ctx, remplis, traits, etat };
}

let images: Map<number, FrameRequestCallback>;
let prochaine: number;
/** Contextes des canvas créés, dans l'ordre : la carte, sa couche du dessus, puis le motif des hachures. */
let contextes: ReturnType<typeof fauxCtx>[];
/** Les canvas créés, dans le même ordre (leurs écouteurs : contextrestored). */
let toiles: { ecouteurs: Map<string, () => void> }[];
let ctx2d: ReturnType<typeof fauxCtx>;
let ctxDessus: ReturnType<typeof fauxCtx>;

beforeEach(() => {
  images = new Map();
  prochaine = 1;
  contextes = [];
  toiles = [];
  const fauxCanvas = () => {
    const f = fauxCtx();
    contextes.push(f);
    [ctx2d, ctxDessus] = contextes as [ReturnType<typeof fauxCtx>, ReturnType<typeof fauxCtx>];
    const toile = {
      className: '',
      style: {},
      width: 0,
      height: 0,
      isConnected: false,
      setAttribute: () => undefined,
      getContext: () => f.ctx,
      after: () => undefined,
      remove: () => undefined,
      ecouteurs: new Map<string, () => void>(),
      addEventListener(type: string, l: () => void) {
        this.ecouteurs.set(type, l);
      },
      removeEventListener: () => undefined,
    };
    toiles.push(toile);
    return toile;
  };
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
  vi.stubGlobal(
    'DOMMatrix',
    class {
      translateSelf() {
        return this;
      }
      rotateSelf() {
        return this;
      }
      scaleSelf() {
        return this;
      }
    },
  );
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

function carte(o: Partial<ConstructorParameters<typeof CarteCanvas>[0]> = {}): CarteCanvas {
  const hote = {
    classList: { add: () => undefined, remove: () => undefined },
    dataset: {},
    clientWidth: L,
    clientHeight: H,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    prepend: () => undefined,
  };
  const c = new CarteCanvas({ hote: hote as unknown as HTMLElement, donnees, projection: 'monde', rendu: 'canvas', ...o });
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

  // L'Argentine et l'Australie, très au sud, ne montent au-dessus de la barre
  // que si le bas de l'ovale quitte le bas de l'écran : comme en SVG, où
  // zoom.transform n'applique pas translateExtent, le vol ignore la borne
  // verticale (bornée, l'Argentine n'était visible qu'à 53 %, l'Australie à 79 %).
  // Délai propre : ~3,5 s seul (un vol complet dessiné par zone), il passait
  // parfois les 5 s par défaut de vitest quand la suite entière tourne sur un PC chargé.
  it('au-dessus de la barre, le polygone principal entier : au moins 90 % de lui (Europe, Chili, Norvège, Argentine, Australie…)', () => {
    expect(europe.length).toBeGreaterThan(40);
    const c = carte();
    const rates: string[] = [];
    for (const id of [...europe, 'CHL', 'NOR', 'RUS', 'IDN', 'NZL', 'JPN', 'VNM', 'ARG', 'AUS', 'ZAF']) {
      c.montrer(id, HV);
      jouer(0, 2100);
      const part = partDe(c.contexte(), id);
      if (part < 0.9) rates.push(`${id} ${(100 * part).toFixed(0)} % (k ${c.transfo.k.toFixed(1)})`);
      // Le point de la zone reste dans la partie visible.
      const p = c.ecran(id);
      if (!p || p[0] < 0 || p[0] > L || p[1] < 0 || p[1] > HV) rates.push(`${id} : point hors de la partie visible (${p})`);
    }
    expect(rates).toEqual([]);
  }, 30_000);

  // La barre d'adresse du téléphone qui apparaît puis disparaît (56 px) : la
  // vue libre de montrer le reste, comme en SVG où d3-zoom ne la borne qu'au
  // geste suivant ; bornée, l'Argentine retombait à 53 % sous la barre.
  it('un changement de hauteur ne remet pas dans la borne la vue libre de montrer (Argentine)', () => {
    const c = carte();
    const hote = (c as unknown as { hote: { clientHeight: number } }).hote;
    const redimensionner = () => (c as unknown as { redimensionner(): void }).redimensionner();
    c.montrer('FRA', HV);
    jouer(0, 2100);
    c.montrer('ARG', HV);
    jouer(3000, 5100);
    expect(partDe(c.contexte(), 'ARG')).toBeGreaterThan(0.99);
    const avant = c.ecran('ARG') as [number, number];
    hote.clientHeight = H - 56;
    redimensionner();
    const p = c.ecran('ARG') as [number, number];
    // Le même point au centre : la zone reste au milieu de la partie visible, plus basse de 28 px.
    expect(Math.abs(p[1] - (avant[1] - 28))).toBeLessThan(1e-6);
    hote.clientHeight = H;
    redimensionner();
    expect(partDe(c.contexte(), 'ARG')).toBeGreaterThan(0.99);
    const apres = c.ecran('ARG') as [number, number];
    expect(Math.abs(apres[0] - avant[0]) + Math.abs(apres[1] - avant[1])).toBeLessThan(1e-6);
  });

  // Rotation pendant une question : en paysage (carte de 832 × 300), la vue
  // libre de montrer tombe dans la borne ; déduite de la vue, sa liberté s'y
  // perdait et le retour en portrait la bornait, le sud de l'Argentine sous la
  // barre. En SVG, le retour rend la vue d'avant.
  it('un aller-retour portrait → paysage → portrait rend la vue de montrer (Argentine)', () => {
    const c = carte();
    const prive = c as unknown as { hote: { clientWidth: number; clientHeight: number }; c: Cadre; v: VueGlobe; redimensionner(): void };
    c.montrer('FRA', HV);
    jouer(0, 2100);
    c.montrer('ARG', HV);
    jouer(3000, 5100);
    const avant = { ...prive.v };
    expect(avant.y).toBeLessThan(bornerY(prive.c, avant.k, avant.y) - 100);
    prive.hote.clientWidth = 832;
    prive.hote.clientHeight = 300;
    prive.redimensionner();
    // Le cas du constat : la vue de paysage est dans la borne.
    expect(prive.v.y).toBeCloseTo(bornerY(prive.c, prive.v.k, prive.v.y), 6);
    prive.hote.clientWidth = L;
    prive.hote.clientHeight = H;
    prive.redimensionner();
    expect(prive.v.k).toBeCloseTo(avant.k, 9);
    expect(prive.v.y).toBeCloseTo(avant.y, 6);
    expect(prive.v.r).toBeCloseTo(avant.r, 9);
    expect(partDe(c.contexte(), 'ARG')).toBeGreaterThan(0.99);
  });

  it('après montrer, une pose bornée (zoomerSur) rend la borne aux changements de taille', () => {
    const c = carte();
    const prive = c as unknown as { hote: { clientHeight: number }; c: Cadre; v: VueGlobe; redimensionner(): void };
    c.montrer('ARG', HV);
    jouer(0, 2100);
    c.zoomerSur('ARG');
    prive.hote.clientHeight = H + 200;
    prive.redimensionner();
    expect(prive.v.y).toBeCloseTo(bornerY(prive.c, prive.v.k, prive.v.y), 6);
  });

  it('une vue dans la borne y reste quand la hauteur change', () => {
    const c = carte();
    const prive = c as unknown as { hote: { clientHeight: number }; c: Cadre; v: VueGlobe; redimensionner(): void };
    // L'Argentine au zoom de zoomerSur : le bas de l'ovale au bas de l'écran.
    c.zoomerSur('ARG');
    expect(prive.v.y).toBeCloseTo(bornerY(prive.c, prive.v.k, prive.v.y - 1000), 6);
    prive.hote.clientHeight = H + 200;
    prive.redimensionner();
    // Le centre gardé seul laisserait 100 px de vide sous l'ovale.
    expect(prive.v.y).toBeCloseTo(bornerY(prive.c, prive.v.k, prive.v.y), 6);
  });

  it('zoomerSur (sans barre) reste centré sur le point, sur toute la hauteur', () => {
    const c = carte();
    c.zoomerSur('ITA');
    const p = c.ecran('ITA') as [number, number];
    expect(Math.abs(p[0] - L / 2)).toBeLessThan(1e-6);
    expect(Math.abs(p[1] - H / 2)).toBeLessThan(1e-6);
  });
});

describe('CarteCanvas : la zone fausse a le contour du SVG (daltonisme, #16)', () => {
  // carte.css : .pays.faux, .pastille.faux { stroke: var(--text); stroke-width: 3px }.
  const TEXTE = VARS['--text'];
  const boite = (ch: FauxChemin): [number, number, number, number] => {
    const xs = ch.ops.map((o) => o[1]);
    const ys = ch.ops.map((o) => o[2]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };

  it('TRAIT_FAUX_PX = l’épaisseur du contour de carte.css, et sa couleur celle du texte', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toContain(`.pastille.faux, .contour-faux { stroke: var(--text); stroke-width: ${TRAIT_FAUX_PX}px; }`);
  });

  it('le tracé : un trait de 3 px couleur du texte, joints ronds, par-dessus les frontières, autour de la zone fausse seule', () => {
    const c = carte();
    c.zoomerSur('FRA');
    image(0);
    expect(ctxDessus.traits.filter((t) => t.style === TEXTE)).toEqual([]);
    c.marquer('ESP', 'juste');
    c.marquer('FRA', 'faux');
    image(16);
    // Sur la couche du dessus, posée sur la carte (et ses frontières) : rien sur la carte.
    expect(ctx2d.traits.filter((t) => t.style === TEXTE)).toEqual([]);
    const contours = ctxDessus.traits.filter((t) => t.style === TEXTE);
    expect(contours.length).toBe(1);
    const [t] = contours as [Trait];
    expect([t.largeur, t.joint]).toEqual([3, 'round']);
    // Après les frontières des zones marquées (trait de 1 px physique), avant les pastilles.
    const frontieres = ctxDessus.traits.findIndex((x) => x.chemin !== 'courant' && x.style === VARS['--frontiere-fine']);
    expect(frontieres).toBeGreaterThanOrEqual(0);
    expect(ctxDessus.traits.indexOf(t)).toBeGreaterThan(frontieres);
    expect(ctxDessus.traits.findIndex((x) => x.arc !== null)).toBeGreaterThan(ctxDessus.traits.indexOf(t));
    // Son chemin : la France métropolitaine à l'écran (son point d'étiquette dans la boîte), pas l'Espagne.
    const [x0, y0, x1, y1] = boite(t.chemin as FauxChemin);
    const [fx, fy] = c.ecran('FRA') as [number, number];
    const [ex, ey] = c.ecran('ESP') as [number, number];
    expect(fx > x0 && fx < x1 && fy > y0 && fy < y1).toBe(true);
    expect(ey > y1).toBe(true);
    // Juste seule : pas de contour.
    c.effacerMarques();
    c.marquer('FRA', 'juste');
    image(32);
    expect(ctxDessus.traits.filter((x) => x.style === TEXTE)).toEqual([]);
  });

  it('la pastille : bordée de 3 px couleur du texte au lieu du bord de 1 px (Malte au zoom 1)', () => {
    const c = carte();
    c.marquer('MLT', 'faux');
    image(0);
    const [mx, my] = c.ecran('MLT') as [number, number];
    const surMalte = ctxDessus.traits.filter((t) => t.arc && Math.hypot(t.arc[0] - mx, t.arc[1] - my) < 1e-9);
    expect(surMalte.map((t) => [t.style, t.largeur])).toEqual([[TEXTE, 3]]);
    // Les autres pastilles gardent leur bord de 1 px couleur du fond.
    const autres = ctxDessus.traits.filter((t) => t.arc && t.arc[2] < 5 && !surMalte.includes(t));
    expect(autres.length).toBeGreaterThan(10);
    for (const t of autres) expect([t.style, t.largeur]).toEqual([VARS['--bg'], 1]);
  });
});

describe('CarteCanvas : un toucher ne redessine que la couche du dessus (J0, #1)', () => {
  const ACCENT = VARS['--accent'];
  it('marquer, effacerMarques, anneau : la couche du dessus seule ; la carte ne porte ni marque ni pastille', () => {
    const c = carte();
    image(0);
    const carteAvant = ctx2d.etat.effacees;
    const dessusAvant = ctxDessus.etat.effacees;
    expect(carteAvant).toBeGreaterThan(0);
    // La carte : terres, hachures, frontières ; ni marque, ni pastille (arcs).
    expect(ctx2d.traits.some((t) => t.arc)).toBe(false);
    c.effacerMarques();
    c.marquer('BRA', 'choisi');
    c.anneau('VAT', 'choisi');
    image(16);
    expect(ctx2d.etat.effacees).toBe(carteAvant);
    expect(ctxDessus.etat.effacees).toBe(dessusAvant + 1);
    expect(ctx2d.remplis.some((r) => r.style === ACCENT)).toBe(false);
    expect(ctxDessus.remplis.filter((r) => r.style === ACCENT && r.chemin !== 'courant').length).toBe(1);
    // Ses frontières par-dessus la couleur, puis pastilles et anneau.
    const couleur = ctxDessus.remplis.findIndex((r) => r.style === ACCENT);
    expect(couleur).toBeGreaterThanOrEqual(0);
    expect(ctxDessus.traits.some((t) => t.chemin !== 'courant' && t.style === VARS['--frontiere-fine'])).toBe(true);
    expect(ctxDessus.traits.some((t) => t.arc && t.arc[2] === 16)).toBe(true);
    expect(c.dernier?.carte).toBe(false);
    // Une nouvelle vue redessine la carte, et la marque reste sur la couche du dessus.
    c.zoomerSur('BRA');
    image(32);
    expect(ctx2d.etat.effacees).toBe(carteAvant + 1);
    expect(c.dernier?.carte).toBe(true);
    expect(ctx2d.remplis.some((r) => r.style === ACCENT)).toBe(false);
    expect(ctxDessus.remplis.some((r) => r.style === ACCENT)).toBe(true);
  });

  it('anneauEn (D53 c) : un anneau de 16 px au point donné (La Paz), sur la couche du dessus, effacé avec les marques', () => {
    const c = carte();
    image(0);
    const LA_PAZ: [number, number] = [-68.13, -16.5];
    c.anneauEn(LA_PAZ, 'juste');
    image(16);
    const [bx, by] = c.projection(LA_PAZ) as [number, number];
    const [x, y] = versEcran(c.transfo, bx, by);
    const arcs = ctxDessus.traits.filter((t) => t.arc && t.arc[2] === 16).map((t) => t.arc!);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]![0]).toBeCloseTo(x, 6);
    expect(arcs[0]![1]).toBeCloseTo(y, 6);
    expect(ctx2d.traits.some((t) => t.arc)).toBe(false);
    c.effacerMarques();
    ctxDessus.traits.length = 0;
    image(32);
    expect(ctxDessus.traits.some((t) => t.arc && t.arc[2] === 16)).toBe(false);
  });

  it('une zone contestée marquée : sa couleur, puis ses hachures repeintes par-dessus, puis ses frontières (Sahara occidental)', () => {
    const c = carte();
    c.zoomerSur('ESH');
    image(0);
    // La carte porte les hachures (motif) sous ses frontières.
    expect(ctx2d.remplis.some((r) => r.style === 'motif')).toBe(true);
    c.marquer('ESH', 'choisi');
    image(16);
    const i = ctxDessus.remplis.findIndex((r) => r.style === VARS['--accent']);
    const j = ctxDessus.remplis.findIndex((r) => r.style === 'motif');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThan(i);
    expect(ctxDessus.traits.some((t) => t.chemin !== 'courant' && t.style === VARS['--frontiere-fine'])).toBe(true);
  });

  it('contexte du Canvas 2D rendu (après une perte) : la carte est redessinée au toucher suivant', () => {
    const c = carte();
    image(0);
    const avant = ctx2d.etat.effacees;
    c.marquer('BRA', 'choisi');
    image(16);
    expect(ctx2d.etat.effacees).toBe(avant);
    toiles[0]?.ecouteurs.get('contextrestored')?.();
    image(32);
    expect(ctx2d.etat.effacees).toBe(avant + 1);
    expect(c.dernier?.carte).toBe(true);
  });

  it('la fin d’un geste retrace la carte au repos, même sans carte allégée', () => {
    const c = carte();
    c.zoomerSur('CHE');
    image(0);
    const avant = ctx2d.etat.effacees;
    // Une image de geste (enMouvement), puis le repos à la même vue (fin d'un geste dans le budget de la complète).
    const priv = c as unknown as { enMouvement: boolean; dessiner(): void };
    priv.enMouvement = true;
    priv.dessiner();
    expect(ctx2d.etat.effacees).toBe(avant + 1);
    // Même vue, au repos : la carte est retracée au seuil du repos (dessin.ts), pas seulement la couche du dessus.
    priv.enMouvement = false;
    priv.dessiner();
    expect(ctx2d.etat.effacees).toBe(avant + 2);
    expect(c.dernier?.carte).toBe(true);
  });
});

describe('Nommer : une réponse en plein vol, la question suivante cadrée sur l’arrivée (#16)', () => {
  // L'Italie demandée au zoom 1 : la carte vole jusqu'à elle (~1,6 s). Répondue
  // en moins d'une seconde, la question suivante s'allume après la pause de
  // 900 ms, vol en cours : vue reculée, ou pas encore arrivée.
  it('la vue d’arrivée décide : la France (cachée à l’arrivée) fait voler, la Suisse (visible) non ; à la fin, chacune est à l’écran', () => {
    for (const [id, vole] of [
      ['FRA', true],
      ['CHE', false],
    ] as const) {
      const c = carte();
      c.montrer('ITA', HV);
      jouer(0, 896);
      // Le vol est bien en cours : la vue du moment n'est pas celle d'arrivée.
      expect(c.contexteFinal().t).not.toEqual(c.contexte().t);
      const e = entite(id);
      const r = cadrageNommer(c, e.pays, e.forme, L, HV);
      expect([id, r.vole]).toEqual([id, vole]);
      // Ce que fait allumer() : le vol en cours continue, ou un nouveau part d'où il en est.
      if (r.vole) c.montrer(id, HV);
      jouer(912, 4000);
      expect(c.contexteFinal().t).toEqual(c.contexte().t);
      expect([id, partDe(c.contexte(), id) >= 0.9]).toEqual([id, true]);
      expect(cadrageNommer(c, e.pays, e.forme, L, HV).vole).toBe(false);
    }
  });

  it('sans vol, contexteFinal est le contexte du moment', () => {
    const c = carte();
    c.zoomerSur('ITA');
    expect(c.contexteFinal().t).toEqual(c.contexte().t);
    c.montrer('NOR', HV);
    jouer(0, 300);
    c.zoomer({ k: 2, x: 0, y: 0 });
    expect(c.contexteFinal().t).toEqual(c.contexte().t);
  });
});

describe('CarteCanvas : les teintes de la carte de la mémoire (#2)', () => {
  const M = [0, 1, 2, 3, 4].map((s) => VARS[`--memoire-${s}`] as string);
  const TERRE = VARS['--terre'] as string;
  const FRONTIERE = VARS['--frontiere-fine'];
  /** Sommets émis (moveTo, lineTo) par les remplissages de ces couleurs, ou par les frontières de la carte. */
  const sommets = (rs: { chemin: FauxChemin | 'courant'; style: string }[]) => rs.reduce((n, r) => n + (r.chemin === 'courant' ? 0 : r.chemin.ops.length), 0);
  const terres = () => ctx2d.remplis.filter((r) => r.style === TERRE || M.includes(r.style));
  const frontieres = () => ctx2d.traits.filter((t) => t.style === FRONTIERE);
  const priv = (c: CarteCanvas) => c as unknown as { enMouvement: boolean; dessiner(): void; etatImage(): { teintes: ReadonlyMap<string, number> | null } };

  it('sur la carte, un remplissage par seau : chaque partie tracée une fois, frontières comprises ; un toucher ne les retrace pas, les marques restent par-dessus', () => {
    const c = carte();
    image(0);
    const nues = { terres: sommets(terres()), frontieres: sommets(frontieres()), traits: frontieres().length };
    expect(terres().map((r) => r.style)).toEqual([TERRE, TERRE]); // terres, coutures (λ0 = 0 : Fidji, Russie)
    const avant = ctx2d.etat.effacees;
    c.teinter(teintesDemo(idsJouables(donnees)));
    image(16);
    // Une nouvelle version des teintes : la carte est retracée (signature), une fois.
    expect(ctx2d.etat.effacees).toBe(avant + 1);
    expect(c.dernier?.carte).toBe(true);
    // Terre (les non jouables) et les cinq seaux, pour les terres puis pour les coutures.
    const styles = terres().map((r) => r.style);
    expect(new Set(styles)).toEqual(new Set([TERRE, ...M]));
    expect(styles.filter((x) => x === TERRE).length).toBe(2);
    // Les mêmes sommets qu'une carte nue, répartis entre les couleurs : ni partie en double, ni oubliée.
    expect(sommets(terres())).toBe(nues.terres);
    expect(sommets(frontieres())).toBe(nues.frontieres);
    // Un trait par chemin des terres (--terre et les cinq seaux), plus celui des coutures (sans leur côté sur l'antiméridien).
    expect(nues.traits).toBe(2);
    expect(frontieres().length).toBe(1 + M.length + 1);
    // Rien sur la couche du dessus.
    expect(ctxDessus.remplis.some((r) => M.includes(r.style) && r.chemin !== 'courant')).toBe(false);
    // Un toucher : la couche du dessus seule ; la marque y est peinte par-dessus la teinte de la carte.
    c.marquer('FRA', 'juste');
    image(32);
    expect(ctx2d.etat.effacees).toBe(avant + 1);
    expect(c.dernier?.carte).toBe(false);
    expect(ctxDessus.remplis.some((r) => r.style === VARS['--good'] && r.chemin !== 'courant')).toBe(true);
    c.effacerMarques();
    image(48);
    expect(ctx2d.etat.effacees).toBe(avant + 1);
    // Les mêmes teintes (autre objet) : rien à redessiner, pas même une image demandée.
    const etat = priv(c).etatImage().teintes;
    c.teinter(new Map(teintesDemo(idsJouables(donnees))));
    expect(images.size).toBe(0);
    expect(priv(c).etatImage().teintes).toBe(etat);
    // Retirées : la carte nue, retracée ; l'état passé aux peintres change d'objet.
    c.teinter(null);
    image(64);
    expect(ctx2d.etat.effacees).toBe(avant + 2);
    expect(terres().map((r) => r.style)).toEqual([TERRE, TERRE]);
    expect(priv(c).etatImage().teintes).toBeNull();
  });

  it('les coutures de l’antiméridien prennent la teinte de leur pays (Fidji à λ0 = 0)', () => {
    const fji = donnees.entites.findIndex((e) => e.pays.id === 'FJI');
    const parts = calque(donnees).pays[fji] ?? [];
    expect(parts.some((p) => aCoupure(p, 0))).toBe(true);
    const c = carte();
    c.teinter(new Map([['FJI', 4]]));
    image(0);
    // Fidji seule au seau 4 : ses terres et ses coutures ; les coutures de --terre restent (Russie, Kiribati…).
    const styles = terres().map((r) => r.style);
    expect(styles.filter((x) => x === M[4]).length).toBe(parts.some((p) => !aCoupure(p, 0)) ? 2 : 1);
    expect(styles.lastIndexOf(M[4] as string)).toBeGreaterThan(styles.indexOf(TERRE, 1));
  });

  it('la carte allégée d’un geste est teintée comme la complète', async () => {
    const leger = Promise.resolve(formesLegeres(lire('monde-leger.topo.json')));
    const c = carte({ leger });
    await leger;
    c.teinter(teintesDemo(idsJouables(donnees)));
    image(0);
    priv(c).enMouvement = true;
    priv(c).dessiner();
    expect(c.dernier?.leger).toBe(true);
    expect(new Set(terres().map((r) => r.style))).toEqual(new Set([TERRE, ...M]));
    // Au repos : la complète, teintée.
    priv(c).enMouvement = false;
    priv(c).dessiner();
    expect(c.dernier?.leger).toBe(false);
    expect(new Set(terres().map((r) => r.style))).toEqual(new Set([TERRE, ...M]));
  });

  it('la pastille d’un micro-État prend la teinte de son pays, sa marque par-dessus (Malte au zoom 1)', () => {
    const c = carte();
    c.teinter(new Map([['MLT', 2]]));
    image(0);
    const [mx, my] = c.ecran('MLT') as [number, number];
    const disque = () => {
      const i = ctxDessus.traits.findIndex((t) => t.arc && Math.hypot(t.arc[0] - mx, t.arc[1] - my) < 1e-9);
      // Chaque disque est rempli (« courant ») juste avant d'être bordé.
      const remplis = ctxDessus.remplis.filter((r) => r.chemin === 'courant');
      const disques = ctxDessus.traits.filter((t) => t.arc && t.arc[2] < 5);
      return remplis[disques.indexOf(ctxDessus.traits[i] as Trait)]?.style;
    };
    expect(disque()).toBe(M[2]);
    // Les autres gardent --pastille.
    expect(ctxDessus.remplis.filter((r) => r.chemin === 'courant' && r.style === VARS['--pastille']).length).toBeGreaterThan(10);
    c.marquer('MLT', 'juste');
    image(16);
    expect(disque()).toBe(VARS['--good']);
  });
});

describe('CarteCanvas : boutons de zoom, un cran et toute la carte (#23)', () => {
  const prive = (c: CarteCanvas) => c as unknown as { c: Cadre; v: VueGlobe };

  it('un cran zoome de 2 en 250 ms, le point du centre au centre ; deux crans rapprochés : de 4', () => {
    const c = carte();
    c.zoomerSur('ITA');
    const k0 = c.transfo.k;
    c.zoomerDe(2);
    image(0);
    image(120);
    // En plein vol : entre les deux zooms.
    expect(c.transfo.k).toBeGreaterThan(k0);
    expect(c.transfo.k).toBeLessThan(2 * k0);
    jouer(140, 400);
    expect(c.transfo.k).toBeCloseTo(2 * k0, 9);
    let p = c.ecran('ITA') as [number, number];
    expect(Math.abs(p[0] - L / 2)).toBeLessThan(1e-6);
    expect(Math.abs(p[1] - H / 2)).toBeLessThan(1e-6);
    // Le second cran pendant le vol du premier part de son arrivée.
    c.zoomerDe(2);
    image(500);
    image(560);
    c.zoomerDe(2);
    jouer(600, 1000);
    expect(c.transfo.k).toBeCloseTo(8 * k0, 9);
    p = c.ecran('ITA') as [number, number];
    expect(Math.abs(p[0] - L / 2)).toBeLessThan(1e-6);
    // Dézoomer revient d'autant.
    c.zoomerDe(0.5);
    jouer(1100, 1500);
    expect(c.transfo.k).toBeCloseTo(4 * k0, 9);
  });

  it('au zoom 1, − ne fait rien ; au zoom maximal, + non plus', () => {
    const c = carte();
    const t0 = c.transfo;
    c.zoomerDe(0.5);
    jouer(0, 400);
    expect(c.transfo).toEqual(t0);
    c.zoomer({ ...t0, k: 400 });
    const t1 = c.transfo;
    c.zoomerDe(2);
    jouer(500, 900);
    expect(c.transfo).toEqual(t1);
  });

  it('dézoomer garde la vue dans la borne, à chaque image (pas de vide au-dessus du pôle)', () => {
    const c = carte();
    // La Norvège zoomée, puis la carte poussée au nord autant que la borne le permet.
    c.zoomerSur('NOR');
    const { c: cadreCarte } = prive(c);
    c.zoomer({ ...c.transfo, y: 1e6 });
    for (let i = 0; i < 6; i++) {
      c.zoomerDe(0.5);
      for (let ts = i * 400; ts <= i * 400 + 300; ts += 16) {
        image(ts);
        const v = prive(c).v;
        expect(v.y).toBeCloseTo(bornerY(cadreCarte, v.k, v.y), 6);
      }
    }
    expect(c.transfo.k).toBe(1);
  });

  it('toute la carte : la vue du départ (méridien du segment Projection, zoom 1), en vol, depuis n’importe où', () => {
    for (const projection of ['monde', 'pacifique'] as const) {
      const c = carte({ projection });
      const depart = c.transfo;
      c.zoomerSur('JPN');
      c.vueEntiere();
      image(0);
      image(100);
      expect(c.transfo.k).toBeGreaterThan(1);
      jouer(120, 1200);
      const t = c.transfo;
      expect([projection, t.k]).toEqual([projection, 1]);
      expect(t.r).toBeCloseTo(depart.r ?? 0, 9);
      expect(t.y).toBeCloseTo(depart.y, 9);
      expect(t.x).toBeCloseTo(depart.x, 9);
    }
  });
});

describe('CarteCanvas : frontières épaisses à l’arrêt, d’un pixel physique pendant un geste (#28)', () => {
  const FRONTIERE = VARS['--frontiere-fine'];
  const priv = (c: CarteCanvas) => c as unknown as { enMouvement: boolean; dessiner(): void };
  /** Largeur et joint des frontières de la carte (pas des pastilles ni des anneaux). */
  const traits = () => new Set(ctx2d.traits.filter((t) => t.style === FRONTIERE && t.chemin !== 'courant').map((t) => `${t.largeur} ${t.joint}`));
  afterEach(() => {
    delete VARS['--frontiere-repos'];
  });

  it('--frontiere-repos : à l’arrêt, ce trait en px CSS, joints ronds ; en mouvement, un pixel physique ; à la fin du geste, de nouveau épais', () => {
    VARS['--frontiere-repos'] = '1';
    const c = carte();
    image(0);
    expect(traits()).toEqual(new Set(['1 round']));
    priv(c).enMouvement = true;
    priv(c).dessiner();
    expect(traits()).toEqual(new Set([`${1 / DPR} miter`]));
    priv(c).enMouvement = false;
    priv(c).dessiner();
    expect(traits()).toEqual(new Set(['1 round']));
  });

  it('sans --frontiere-repos, ou plus fin qu’un pixel physique : toujours le trait d’un pixel', () => {
    carte();
    image(0);
    expect(traits()).toEqual(new Set([`${1 / DPR} miter`]));
    VARS['--frontiere-repos'] = '0.3';
    carte();
    image(16);
    expect(traits()).toEqual(new Set([`${1 / DPR} miter`]));
  });
});
