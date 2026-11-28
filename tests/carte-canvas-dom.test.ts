import { readFileSync } from 'node:fs';
import { geoDistance } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHOIX_LIGNES, lignesDe } from '../src/map/lignes';
import { textes } from '../src/vues/textes';
import { aCoupure, BUDGET_SOMMETS, calque, CarteCanvas, sommetsVisibles, TRAIT_FAUX_PX, type Calque, type CalquesMers, type Peintre } from '../src/map/carte-canvas';
import type { ReglageZone } from '../src/map/carte';
import { image as imageTrace, MARGE_PX } from '../src/map/dessin';
import { assembler, formesLegeres, type DonneesCarte } from '../src/map/donnees';
import { assemblerMers, empriseMer, zonesAllumees } from '../src/map/mers';
import { calculerPastilles } from '../src/map/pastilles';
import { teintesDemo } from '../src/map/teintes';
import { idsJouables } from '../src/terrains';
import { anneauPrincipal, centreEmprise, contient, contourEmprise, distanceAuBordKm, empriseEcran, partVisible, RAYON_TERRE_KM, versEcran, versLonLat, type Emprise } from '../src/map/geo';
import { bornerY, ecartLon, placer, regionVisible, type Cadre, type VueGlobe } from '../src/map/vue';
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
  // Sur l'eau (carte.css : var(--accent)…, que getComputedStyle résout) : d'autres valeurs ici, pour les distinguer.
  '--mer-choisie': '#6b8afe', '--mer-juste': '#34c77c', '--mer-fausse': '#f0686c',
  '--memoire-mer-0': '#854409', '--memoire-mer-1': '#a56005', '--memoire-mer-2': '#c37e01', '--memoire-mer-3': '#df9f01', '--memoire-mer-4': '#f8c20e',
  '--ligne-repere': '#84cdde',
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
  /** Remplissages et traits dans l'ordre, avec l'opération de composition du moment (les marques des mers). */
  const ordre: { type: 'fill' | 'stroke'; chemin: FauxChemin | 'courant'; style: string; op: string }[] = [];
  let arc: [number, number, number] | null = null;
  const etat = { effacees: 0 };
  const ctx = {
    fillStyle: '' as unknown,
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    setTransform: () => undefined,
    // Une nouvelle image : seule la dernière est gardée (un vol en fait cent).
    globalCompositeOperation: 'source-over',
    clearRect: () => {
      remplis.length = 0;
      traits.length = 0;
      ordre.length = 0;
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
      const style = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'motif';
      remplis.push({ chemin: chemin ?? 'courant', style });
      ordre.push({ type: 'fill', chemin: chemin ?? 'courant', style, op: ctx.globalCompositeOperation });
    },
    stroke(chemin?: FauxChemin) {
      traits.push({ chemin: chemin ?? 'courant', style: ctx.strokeStyle, largeur: ctx.lineWidth, joint: ctx.lineJoin, arc: chemin ? null : arc });
      ordre.push({ type: 'stroke', chemin: chemin ?? 'courant', style: ctx.strokeStyle, op: ctx.globalCompositeOperation });
    },
  };
  return { ctx, remplis, traits, etat, ordre };
}

let images: Map<number, FrameRequestCallback>;
let prochaine: number;
/** Contextes des canvas créés, dans l'ordre : la carte, sa couche du dessus, puis le motif des hachures. */
let contextes: ReturnType<typeof fauxCtx>[];
/** Les canvas créés, dans le même ordre (leurs écouteurs : contextrestored). */
let toiles: { ecouteurs: Map<string, () => void> }[];
let ctx2d: ReturnType<typeof fauxCtx>;
let ctxDessus: ReturnType<typeof fauxCtx>;
/** Le navigateur refuse le contexte du second canvas (la couche du dessus) : tout va sur la carte. */
let refuserDessus = false;

beforeEach(() => {
  images = new Map();
  prochaine = 1;
  contextes = [];
  toiles = [];
  refuserDessus = false;
  const fauxCanvas = () => {
    const f = fauxCtx();
    const rang = contextes.length;
    contextes.push(f);
    [ctx2d, ctxDessus] = contextes as [ReturnType<typeof fauxCtx>, ReturnType<typeof fauxCtx>];
    const toile = {
      className: '',
      style: {},
      width: 0,
      height: 0,
      isConnected: false,
      setAttribute: () => undefined,
      getContext: () => (refuserDessus && rang === 1 ? null : f.ctx),
      after: () => undefined,
      remove: () => undefined,
      // Assez d'un élément pour la couche des noms des lignes de repère (noms-lignes.ts).
      dataset: {} as Record<string, string>,
      hidden: false,
      textContent: '',
      append: () => undefined,
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
    ajoutes: [] as unknown[],
    append(...e: unknown[]) {
      this.ajoutes.push(...e);
    },
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

describe('CarteCanvas : océans et mers (lot 3a, étude J2, § 4.3)', () => {
  const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
  const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
  /** Une carte sur des données à elle : prendreMers remplit donnees.mers. */
  const carteMers = () => carte({ donnees: { ...donnees, mers: [] } });
  const styles = (f: ReturnType<typeof fauxCtx>) => f.remplis.map((r) => r.style);
  const MEMOIRE_MERS = [0, 1, 2, 3, 4].map((s) => VARS[`--memoire-mer-${s}`] as string);

  /** Le point (x, y) est-il dans le chemin (règle non nulle, chaque sous-chemin refermé) ? */
  const dedans = (ch: FauxChemin | 'courant' | undefined, [x, y]: [number, number]): boolean => {
    if (!ch || ch === 'courant') return false;
    let w = 0;
    let debut: [number, number] | null = null;
    let der: [number, number] = [0, 0];
    const seg = (a: [number, number], b: [number, number]) => {
      if (a[1] <= y) {
        if (b[1] > y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) > 0) w++;
      } else if (b[1] <= y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) < 0) w--;
    };
    for (const o of ch.ops) {
      if (o[0] === 'R') continue;
      if (o[0] === 'M') {
        if (debut) seg(der, debut);
        debut = der = [o[1], o[2]];
      } else {
        seg(der, [o[1], o[2]]);
        der = [o[1], o[2]];
      }
    }
    if (debut) seg(der, debut);
    return w !== 0;
  };

  it('le calque marin n’est tracé par la base que si une teinte de mer le demande, entre l’ovale et les terres', () => {
    const c = carteMers();
    const sans = styles(ctx2d);
    c.prendreMers(couche);
    image(16);
    expect(styles(ctx2d)).toEqual(sans);
    c.teinter(new Map([['FRA', 1]]));
    image(32);
    expect(styles(ctx2d).filter((x) => MEMOIRE_MERS.includes(x))).toEqual([]);
    const sommetsPays = c.dernier?.sommets ?? 0;
    c.teinter(new Map([['atlant', 2], ['medit', 4], ['FRA', 1]]));
    image(48);
    const st = styles(ctx2d);
    expect(st[0]).toBe(VARS['--mer']);
    const iMer = st.indexOf(MEMOIRE_MERS[2] as string);
    expect(iMer).toBeGreaterThan(0);
    expect(st).toContain(MEMOIRE_MERS[4]);
    expect(iMer).toBeLessThan(st.indexOf(VARS['--terre'] as string));
    // Un Path2D par seau : deux remplissages de mer.
    expect(st.filter((x) => MEMOIRE_MERS.includes(x))).toHaveLength(2);
    expect(c.nbTeintes).toBe(3);
    // Les sommets du calque comptent dans le dessin (parties tracées par la base).
    expect(c.dernier?.sommets ?? 0).toBeGreaterThan(sommetsPays);
    // Une marque de mer seule ne le fait pas tracer par la base.
    c.teinter(null);
    c.marquer('atlant', 'choisi');
    image(64);
    expect(styles(ctx2d).filter((x) => MEMOIRE_MERS.includes(x) || x === VARS['--mer-choisie'])).toEqual([]);
    expect(styles(ctxDessus)).toContain(VARS['--mer-choisie']);
  });

  it('les teintes demandées avant la couche : ses zones écartées alors, teintées à son arrivée', () => {
    const c = carteMers();
    c.teinter(new Map([['atlant', 0], ['FRA', 3]]));
    image(16);
    expect(c.nbTeintes).toBe(1);
    c.prendreMers(couche);
    image(32);
    expect(c.nbTeintes).toBe(2);
    expect(styles(ctx2d)).toContain(MEMOIRE_MERS[0]);
  });

  it('ordre de la couche du dessus : la mer, son effacement sous les terres, puis les marques des pays (un pays marqué avec une mer reste peint)', () => {
    const c = carteMers();
    c.prendreMers(couche);
    c.marquer('atlant', 'juste');
    c.marquer('ESP', 'faux');
    image(16);
    const o = ctxDessus.ordre;
    const iMer = o.findIndex((x) => x.type === 'fill' && x.style === VARS['--mer-juste'] && x.op === 'source-over');
    const iEff = o.findIndex((x) => x.op === 'destination-out');
    const iPays = o.findIndex((x) => x.type === 'fill' && x.style === VARS['--danger']);
    expect(iMer).toBeGreaterThanOrEqual(0);
    expect(iEff).toBeGreaterThan(iMer);
    expect(iPays).toBeGreaterThan(iEff);
    expect(o[iPays]?.op).toBe('source-over');
    // Rien n'efface après les marques des pays ; l'Espagne est dans son remplissage.
    expect(o.slice(iPays).filter((x) => x.op !== 'source-over')).toEqual([]);
    expect(dedans(o[iPays]?.chemin, c.ecran('ESP') as [number, number])).toBe(true);
    // Et la mer n'est jamais marquée sur la carte de base.
    expect(styles(ctx2d)).not.toContain(VARS['--mer-juste']);
  });

  it('marques effacées sous les terres de leur emprise : la Méditerranée allumée, effacée sur l’Italie et la Grèce, pas au Brésil', () => {
    const c = carteMers();
    c.prendreMers(couche);
    c.marquer('medit', 'choisi');
    image(16);
    const o = ctxDessus.ordre;
    const marque = o.find((x) => x.type === 'fill' && x.style === VARS['--mer-choisie']);
    const efface = o.find((x) => x.type === 'fill' && x.op === 'destination-out');
    const medit = c.ecran('medit') as [number, number];
    expect(dedans(marque?.chemin, medit)).toBe(true);
    expect(dedans(efface?.chemin, medit)).toBe(false);
    for (const id of ['ITA', 'GRC', 'TUN']) expect(dedans(efface?.chemin, c.ecran(id) as [number, number]), id).toBe(true);
    expect(dedans(efface?.chemin, c.ecran('BRA') as [number, number])).toBe(false);
    // La côte entière reste visible : l'effacement est aussi un trait du même chemin.
    expect(o.some((x) => x.type === 'stroke' && x.op === 'destination-out' && x.chemin === efface?.chemin)).toBe(true);
    // Après l'effacement, on revient à la composition normale.
    expect((ctxDessus.ctx as unknown as { globalCompositeOperation: string }).globalCompositeOperation).toBe('source-over');
  });

  it('un océan allumé allume la mer qu’il enclave sans côte (les Sargasses), jamais une mer côtière ; les Sargasses seules n’allument qu’elles', () => {
    const c = carteMers();
    c.prendreMers(couche);
    c.marquer('atlant', 'choisi');
    image(16);
    let marque = ctxDessus.ordre.find((x) => x.type === 'fill' && x.style === VARS['--mer-choisie']);
    expect(dedans(marque?.chemin, c.ecran('sargasse') as [number, number])).toBe(true);
    expect(dedans(marque?.chemin, c.ecran('atlant') as [number, number])).toBe(true);
    expect(dedans(marque?.chemin, c.ecran('caraibes') as [number, number])).toBe(false);
    c.effacerMarques();
    c.marquer('sargasse', 'choisi');
    image(32);
    marque = ctxDessus.ordre.find((x) => x.type === 'fill' && x.style === VARS['--mer-choisie']);
    expect(dedans(marque?.chemin, c.ecran('sargasse') as [number, number])).toBe(true);
    expect(dedans(marque?.chemin, c.ecran('atlant') as [number, number])).toBe(false);
  });

  it('l’océan faux : couleur fausse sur l’eau, contour du texte de 3 px autour de l’union, sans l’anneau des Sargasses, avant l’effacement', () => {
    const c = carteMers();
    c.prendreMers(couche);
    c.marquer('atlant', 'faux');
    image(16);
    const o = ctxDessus.ordre;
    expect(o.some((x) => x.type === 'fill' && x.style === VARS['--mer-fausse'])).toBe(true);
    const iContour = o.findIndex((x) => x.type === 'stroke' && x.style === VARS['--text']);
    expect(iContour).toBeGreaterThanOrEqual(0);
    expect(iContour).toBeLessThan(o.findIndex((x) => x.op === 'destination-out'));
    const t = ctxDessus.traits.find((x) => x.style === VARS['--text']);
    expect(t?.largeur).toBe(TRAIT_FAUX_PX);
    // Aucun sommet du contour au cœur des Sargasses (le bord commun avec l'Atlantique n'est pas tracé).
    const sar = couche.mers.find((e) => e.pays.id === 'sargasse')!.pays.bbox;
    const proj = c.contexte().proj;
    const [x0, y0] = proj([sar[0] + 2, sar[3] - 2]) as [number, number];
    const [x1, y1] = proj([sar[2] - 2, sar[1] + 2]) as [number, number];
    const contour = o[iContour]?.chemin as FauxChemin;
    const dans = contour.ops.filter((op) => op[0] !== 'R' && op[1] > Math.min(x0, x1) && op[1] < Math.max(x0, x1) && op[2] > Math.min(y0, y1) && op[2] < Math.max(y0, y1));
    expect(contour.ops.length).toBeGreaterThan(100);
    expect(dans).toEqual([]);
  });

  it('sans couche du dessus (getContext refusé) : la marque de mer sur la carte, sur l’ovale et sous les terres, rien d’effacé ; les pays marqués par-dessus', () => {
    refuserDessus = true;
    const c = carteMers();
    c.prendreMers(couche);
    c.marquer('medit', 'faux');
    c.marquer('ITA', 'juste');
    image(16);
    const o = ctx2d.ordre;
    // L'Italie, la Grèce, la Tunisie restent peintes : aucune opération d'effacement sur la carte.
    expect(o.filter((x) => x.op !== 'source-over')).toEqual([]);
    const iOvale = o.findIndex((x) => x.type === 'fill' && x.style === VARS['--mer']);
    const iMer = o.findIndex((x) => x.type === 'fill' && x.style === VARS['--mer-fausse']);
    const iContour = o.findIndex((x) => x.type === 'stroke' && x.style === VARS['--text']);
    const iTerre = o.findIndex((x) => x.type === 'fill' && x.style === VARS['--terre']);
    const iPays = o.findIndex((x) => x.type === 'fill' && x.style === VARS['--good']);
    expect(iOvale).toBe(0);
    expect(iMer).toBeGreaterThan(iOvale);
    expect(iContour).toBeGreaterThan(iMer);
    expect(iTerre).toBeGreaterThan(iContour);
    expect(iPays).toBeGreaterThan(iTerre);
    expect(dedans(o[iMer]?.chemin, c.ecran('medit') as [number, number])).toBe(true);
    // Un toucher de plus : la carte entière redessinée, la marque suivie.
    c.effacerMarques();
    image(32);
    expect(ctx2d.ordre.some((x) => x.style === VARS['--mer-fausse'])).toBe(false);
  });

  it('la bascule vers l’allégée ne compte les mers que si une teinte de mer les fait tracer', async () => {
    const leger = Promise.resolve(formesLegeres(lire('monde-leger.topo.json')));
    const c = carte({ donnees: { ...donnees, mers: [] }, leger });
    await leger;
    c.prendreMers(couche);
    const priv = c as unknown as { c: Cadre; v: VueGlobe; enMouvement: boolean; complet: Calque; mers: CalquesMers; dessiner(): void };
    // Une vue zoomée où la complète passe dans le budget, et ne passe plus avec le calque marin.
    let vue: VueGlobe | null = null;
    for (let r = -180; r < 180 && !vue; r += 10) {
      const v = placer(priv.c, [r, 30], L / 2, H / 2, 8);
      const im = imageTrace(v, priv.c, regionVisible(v, priv.c, MARGE_PX), true);
      if (sommetsVisibles(im, priv.complet) <= BUDGET_SOMMETS && sommetsVisibles(im, priv.complet, priv.mers.complet) > BUDGET_SOMMETS) vue = v;
    }
    expect(vue).not.toBeNull();
    priv.v = vue as VueGlobe;
    priv.enMouvement = true;
    // Couche posée, une teinte de pays seulement (une partie de pays) : la complète.
    c.teinter(new Map([['FRA', 1]]));
    priv.dessiner();
    expect(c.dernier?.leger).toBe(false);
    // Une teinte de mer : le calque marin compte, l'allégée.
    c.teinter(new Map([['FRA', 1], ['medit', 2]]));
    priv.dessiner();
    expect(c.dernier?.leger).toBe(true);
  });

  it('adopter : le peintre reçoit la couche marine une fois, posée avant l’adoption, pendant l’échange ou après', () => {
    const peintreFactice = () => {
      const recues: unknown[] = [];
      const p: Peintre = {
        preparer: () => undefined,
        dimensionner: () => undefined,
        dessiner: () => ({ trace_ms: 0, leger: false, parties: 0, sommets: 0, emis: 0, copies: 0 }),
        allegeEnMouvement: false,
        prendreMers: (x) => recues.push(x),
        detruire: () => undefined,
      };
      return { p, recues };
    };
    const toile = () => document.createElement('canvas');
    // Avant l'adoption.
    let c = carteMers();
    c.prendreMers(couche);
    let f = peintreFactice();
    void c.adopter(toile(), f.p);
    image(16);
    expect(f.recues).toEqual([couche]);
    // Entre l'appel et l'échange (l'image suivante).
    c = carteMers();
    f = peintreFactice();
    void c.adopter(toile(), f.p);
    c.prendreMers(couche);
    expect(f.recues).toEqual([]);
    image(32);
    expect(f.recues).toEqual([couche]);
    // Après l'adoption.
    c = carteMers();
    f = peintreFactice();
    void c.adopter(toile(), f.p);
    image(48);
    c.prendreMers(couche);
    expect(f.recues).toEqual([couche]);
  });

  it('ecran et zoomerSur trouvent une mer par l’index commun, une fois la couche posée', () => {
    const c = carteMers();
    expect(c.ecran('medit')).toBeNull();
    c.prendreMers(couche);
    expect(c.ecran('medit')).not.toBeNull();
    c.zoomerSur('medit');
    // Cadrée par son emprise (§ 4.5) : son milieu au milieu de la largeur, l'emprise entière à l'écran.
    const ctx = c.contexte();
    const e = couche.mers.find((m) => m.pays.id === 'medit')!.pays.bbox;
    const aLEcran = (ll: [number, number]) => {
      const b = ctx.proj(ll) as [number, number];
      return versEcran(ctx.t, b[0], b[1]);
    };
    expect(c.transfo.k).toBeGreaterThan(2);
    expect(Math.abs(aLEcran(centreEmprise(e))[0] - L / 2)).toBeLessThan(1e-6);
    for (const [x, y] of contourEmprise(e).map(aLEcran)) expect(x >= -1 && x <= L + 1 && y >= -1 && y <= H + 1).toBe(true);
  });

  describe('une mer se cadre par son emprise, la vue tournée vers son milieu (§ 4.5)', () => {
    const bbox = (id: string) => couche.mers.find((m) => m.pays.id === id)!.pays.bbox;
    const prive = (c: CarteCanvas) => c as unknown as { v: VueGlobe };
    /** Le contour de l'emprise à l'écran. */
    const aLEcran = (c: CarteCanvas, e: Emprise) =>
      contourEmprise(e).map((ll) => {
        const ctx = c.contexte();
        const b = ctx.proj(ll) as [number, number];
        return versEcran(ctx.t, b[0], b[1]);
      });
    const dedans = (pts: [number, number][], h: number) => pts.every(([x, y]) => x >= -1 && x <= L + 1 && y >= -1 && y <= h + 1);

    it.each([
      ['pacif', -156.8],
      ['bering', -177.4],
      ['caraibes', -74.1],
    ] as const)('%s : entier au-dessus de la barre, la vue tournée vers le milieu de son emprise (%f°)', (id, milieu) => {
      const c = carteMers();
      c.prendreMers(couche);
      c.montrer(id, HV);
      jouer(0, 2100);
      expect(centreEmprise(bbox(id))[0]).toBeCloseTo(milieu, 0);
      expect(Math.abs(ecartLon(prive(c).v.r, milieu))).toBeLessThan(1);
      expect(dedans(aLEcran(c, bbox(id)), HV)).toBe(true);
      expect(c.transfo.k).toBeGreaterThanOrEqual(1);
    });

    it('le Pacifique entier depuis n’importe quelle rotation, pas la moitié de son polygone principal', () => {
      for (const depart of ['FRA', 'JPN', 'BRA', 'NZL']) {
        const c = carteMers();
        c.prendreMers(couche);
        c.zoomerSur(depart);
        c.montrer('pacif', HV);
        jouer(0, 2100);
        expect([depart, dedans(aLEcran(c, bbox('pacif')), HV)]).toEqual([depart, true]);
        expect(Math.abs(ecartLon(prive(c).v.r, -156.85))).toBeLessThan(1);
      }
    });

    it('l’Arctique et l’Austral, bandes de 360° : la rotation du moment gardée, leur bande en latitude au-dessus de la barre, vue finie, zoom ≥ 1', () => {
      for (const depart of ['FRA', 'JPN', 'FJI', 'BRA']) {
        for (const id of ['arctique', 'austral']) {
          const c = carteMers();
          c.prendreMers(couche);
          c.zoomerSur(depart);
          jouer(0, 100);
          const r0 = prive(c).v.r;
          c.montrer(id, HV);
          jouer(200, 2300);
          const v = prive(c).v;
          expect([depart, id, Number.isFinite(v.r) && Number.isFinite(v.k) && Number.isFinite(v.y), v.k >= 1]).toEqual([depart, id, true, true]);
          expect(Math.abs(ecartLon(r0, v.r))).toBeLessThan(1e-6);
          const [, s, , n] = bbox(id);
          const ctx = c.contexte();
          for (const lat of [s, n]) {
            const b = ctx.proj([v.r, lat]) as [number, number];
            const [, y] = versEcran(ctx.t, b[0], b[1]);
            expect([depart, id, lat, y >= -1 && y <= HV + 1]).toEqual([depart, id, lat, true]);
          }
        }
      }
    }, 30_000); // ≈ 5 à 7 s sur le PC chargé (tout le monde en canvas, deux océans) : au-delà des 5 s par défaut de vitest
  });

  // Relecture du lot 3a : contexte() et contexteFinal() passent la couche
  // marine (mers, lieux) une fois posée ; sans elle, carte.noter(<mer>)
  // levait l'erreur même après prendreMers, sans qu'aucun test le voie.
  it('noter une mer sur la carte : une erreur avant prendreMers, juste au point de l’Atlantique après ; la couche dans contexteFinal pendant un vol', () => {
    const c = carteMers();
    image(0);
    expect(() => c.noter('atlant', L / 2, H / 2)).toThrow(/cible avant sa couche/);
    c.prendreMers(couche);
    image(16);
    const [x, y] = c.ecran('atlant') as [number, number];
    expect(c.noter('atlant', x, y)).toMatchObject({ juste: true, pick: { id: 'atlant' } });
    expect(c.contexte().mers?.length).toBe(couche.mers.length);
    c.montrer('pacif', HV);
    jouer(16, 200);
    const priv = c as unknown as { vol: unknown };
    expect(priv.vol).toBeTruthy();
    const fin = c.contexteFinal();
    expect(fin.mers?.length).toBe(couche.mers.length);
    expect(fin.lieux?.get('pacif')?.couche).toBe('mers');
  });

  // « Toucher dessiné = noté », lu sur le dessin lui-même (relecture du lot
  // 3a : le test de mers-toucher recopiait la règle de pickMer) : la marque
  // que peint la couche du dessus (peindreMarquesMers, zonesAllumees), moins
  // son effacement sous les terres (dessinerMarquesMers) : là, juste ; l'eau
  // d'une zone hors de la marque, et la terre de la carte de base à
  // plus de 12 px des zones allumées : faux. Grille de 10 px ; un point
  // compte s'il est du même côté des chemins que ses voisins à 2 px (ni le
  // bord d'un chemin ni le trait de l'effacement).
  it.each(['atlant', 'pacif', 'medit'])('toucher dessiné = noté, lu sur le dessin : %s, à plusieurs rotations (dont l’antiméridien) et deux zooms', (cible) => {
    const centres: Record<string, [number, number][]> = {
      atlant: [[-30, 20], [-60, 30], [10, 40]],
      pacif: [[-170, 10], [180, 40], [150, 0]],
      medit: [[18, 36], [5, 40], [28, 34]],
    };
    const allumees = zonesAllumees(cible, couche.mers.map((m) => m.pays));
    const formes = couche.mers.filter((m) => allumees.includes(m.pays.id));
    const PAS = 10;
    /** dedans(ch, ·) en index par rangées de 4 px (les chemins du monde entier ont des dizaines de milliers de segments). */
    const indexer = (chs: (FauxChemin | 'courant' | undefined)[]) => {
      const rangs = new Map<number, [number, number, number, number][]>();
      for (const ch of chs) {
        if (!ch || ch === 'courant') continue;
        let debut: [number, number] | null = null;
        let der: [number, number] = [0, 0];
        const seg = (a: [number, number], b: [number, number]) => {
          for (let r = Math.floor(Math.min(a[1], b[1]) / 4); r <= Math.floor(Math.max(a[1], b[1]) / 4); r++) {
            let l = rangs.get(r);
            if (!l) rangs.set(r, (l = []));
            l.push([a[0], a[1], b[0], b[1]]);
          }
        };
        for (const op of ch.ops) {
          if (op[0] === 'R') continue;
          if (op[0] === 'M') {
            if (debut) seg(der, debut);
            debut = der = [op[1], op[2]];
          } else {
            seg(der, [op[1], op[2]]);
            der = [op[1], op[2]];
          }
        }
        if (debut) seg(der, debut);
      }
      // Règle non nulle sur l'union des chemins : un point dedans l'un d'eux (ils ne se croisent pas en sens contraire).
      return (x: number, y: number): boolean => {
        let w = 0;
        for (const [ax, ay, bx, by] of rangs.get(Math.floor(y / 4)) ?? []) {
          if (ay <= y) {
            if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++;
          } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--;
        }
        return w !== 0;
      };
    };
    const ratees: string[] = [];
    const vus = { peint: 0, eau: 0, terre: 0 };
    // Une seule carte (ctxDessus est la couche du dessus de la première créée).
    const c = carteMers();
    c.prendreMers(couche);
    c.marquer(cible, 'choisi');
    const priv = c as unknown as { c: Cadre; poserProgramme(v: VueGlobe, libre: boolean): void };
    let ts = 0;
    for (const centre of centres[cible]!) {
      for (const k of [1, 3]) {
        priv.poserProgramme(placer(priv.c, centre, L / 2, H / 2, k, true), true);
        image((ts += 16));
        const o = ctxDessus.ordre;
        const marque = o.find((x) => x.type === 'fill' && x.style === VARS['--mer-choisie'] && x.op === 'source-over')?.chemin;
        const efface = o.find((x) => x.type === 'fill' && x.op === 'destination-out')?.chemin;
        // Les terres de la carte de base (l'effacement ne couvre que celles de l'emprise de la marque).
        const terres = ctx2d.ordre.filter((x) => x.type === 'fill' && x.style === VARS['--terre']).map((x) => x.chemin);
        expect(marque).toBeDefined();
        expect(terres.length).toBeGreaterThan(0);
        const ctx = c.contexte();
        const [dansMarque, dansEfface] = [indexer([marque]), indexer([efface])];
        const surTerre = (() => {
          const parChemin = terres.map((ch) => indexer([ch]));
          return (x: number, y: number) => parChemin.some((f) => f(x, y));
        })();
        const etat = (x: number, y: number) => [dansMarque(x, y) && !dansEfface(x, y), surTerre(x, y)] as const;
        const sur = (x: number, y: number) => etat(x, y).join();
        // Plus loin des zones allumées (géodésique) que tout point du cercle de 12 px, avec 10 % de marge.
        const loin = (x: number, y: number, ll: [number, number]) => {
          let rayon = 0;
          for (let a = 0; a < 2 * Math.PI; a += Math.PI / 16) {
            const l2 = versLonLat(ctx.proj, ctx.t, x + 12 * Math.cos(a), y + 12 * Math.sin(a));
            if (!l2) return false;
            rayon = Math.max(rayon, geoDistance(ll, l2) * RAYON_TERRE_KM);
          }
          return formes.every((z) => !contient(z.forme, z.pays.bbox, ll) && distanceAuBordKm(z.forme, ll) > 1.1 * rayon);
        };
        for (let y = PAS / 2; y < H; y += PAS) {
          for (let x = PAS / 2; x < L; x += PAS) {
            const ll = versLonLat(ctx.proj, ctx.t, x, y);
            if (!ll) continue;
            const [peinte, terre] = etat(x, y);
            const ici = [peinte, terre].join();
            const net = () => [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => sur(x + dx!, y + dy!) === ici);
            const ou = `${cible} [${centre}] k ${k} (${x}, ${y})`;
            if (peinte && net()) {
              vus.peint++;
              const n = c.noter(cible, x, y, { acceptes: false });
              if (!n.juste) ratees.push(`${ou} : peint, noté faux (${n.pick?.id})`);
            } else if (!peinte && !terre && couche.mers.some((z) => contient(z.forme, z.pays.bbox, ll)) && net()) {
              // L'eau d'une zone que la marque ne peint pas (une autre zone, ou une zone allumée oubliée).
              vus.eau++;
              const n = c.noter(cible, x, y, { acceptes: false });
              if (n.juste) ratees.push(`${ou} : eau non peinte, notée juste (${n.pick?.id})`);
            } else if (terre && !peinte && net() && loin(x, y, ll)) {
              vus.terre++;
              const n = c.noter(cible, x, y, { acceptes: false });
              if (n.juste) ratees.push(`${ou} : terre loin, notée juste (${n.pick?.id})`);
            }
          }
        }
      }
    }
    expect(ratees).toEqual([]);
    expect(vus.peint).toBeGreaterThan(40);
    expect(vus.eau).toBeGreaterThan(40);
    expect(vus.terre).toBeGreaterThan(40);
  }, 60_000);
});

describe('CarteCanvas : la carte de la mémoire « Mers » sans pastilles (choix de l’utilisateur du 12/11, #27)', () => {
  /** Les disques des pastilles dessinés sur la couche du dessus (les anneaux ont 16 px de rayon). */
  const disques = () => ctxDessus.traits.filter((t) => t.arc && t.arc[2] < 5);
  const hote = (c: CarteCanvas) => c.hote as unknown as { dataset: Record<string, string> };
  /**
   * En mer (la mer Ionienne), à 3,6 px au sud-est du disque de Malte au zoom 1 :
   * dans sa cible, sur aucun tracé, et aucune sonde du toucher « au plus près »
   * (4, 8, 12 px) sur l'île.
   */
  const pres = (c: CarteCanvas): [number, number] => {
    const [mx, my] = c.ecran('MLT') as [number, number];
    return [mx + 3, my + 2];
  };

  it('le défaut est inchangé : les pastilles de calculerPastilles, Malte touchée par la sienne', () => {
    const c = carte();
    image(0);
    const ctx = c.contexte();
    expect(ctx.pastilles).toEqual(calculerPastilles(donnees.entites, ctx.proj, ctx.t.k));
    expect(ctx.pastilles.some((p) => p.id === 'MLT' && p.visible)).toBe(true);
    expect(Number(hote(c).dataset.disques)).toBe(disques().length);
    expect(disques().length).toBeGreaterThan(50);
    expect(c.pick(...pres(c))).toMatchObject({ id: 'MLT', via: 'pastille' });
  });

  it('cachées : ni dessinées ni touchées (pick, noter, ecran), 0 sur l’hôte, une image redessinée ; les anneaux restent ; un zoom ne les rend pas ; rendues : les mêmes qu’avant', () => {
    const c = carte();
    image(0);
    const avant = c.contexte().pastilles;
    const nbDisques = disques().length;
    const p = pres(c);
    const [mx, my] = c.ecran('MLT') as [number, number];
    c.anneau('MLT', 'choisi');
    image(8);
    c.cacherPastilles(true);
    // Une seule image demandée, la couche du dessus seule (la carte garde sa signature).
    expect(images.size).toBe(1);
    const effacees = ctx2d.etat.effacees;
    image(16);
    expect(ctx2d.etat.effacees).toBe(effacees);
    expect(disques()).toEqual([]);
    expect(ctxDessus.traits.filter((t) => t.arc && t.arc[2] === 16)).toHaveLength(1);
    expect(c.nbPastilles).toBe(0);
    expect(c.contexte().pastilles).toEqual([]);
    expect(hote(c).dataset).toMatchObject({ pastilles: '0', disques: '0' });
    expect(c.pick(...p)?.id).not.toBe('MLT');
    expect(c.noter('MLT', ...p).juste).toBe(false);
    // Le point de Malte : celui de son lieu (le même que celui de sa pastille).
    expect(c.ecran('MLT')).toEqual([mx, my]);
    // Un second appel ne redessine rien.
    c.cacherPastilles(true);
    expect(images.size).toBe(0);
    // Un zoom recalcule la vue, sans pastille.
    c.zoomerDe(2);
    jouer(100, 500);
    expect(c.transfo.k).toBeCloseTo(2, 9);
    expect(c.contexte().pastilles).toEqual([]);
    expect(disques()).toEqual([]);
    c.vueEntiere();
    jouer(600, 1200);
    c.cacherPastilles(false);
    image(1300);
    expect(c.contexte().pastilles).toEqual(avant);
    expect(disques()).toHaveLength(nbDisques);
    expect(hote(c).dataset.disques).toBe(String(nbDisques));
    expect(c.pick(...p)).toMatchObject({ id: 'MLT', via: 'pastille' });
  });

  it('le peintre (WebGL) reçoit l’état sans pastilles : aucun disque à dessiner', () => {
    const recues: number[] = [];
    const peintre: Peintre = {
      preparer: () => undefined,
      dimensionner: () => undefined,
      dessiner: (e) => (recues.push(e.pastilles.length), { trace_ms: 0, leger: false, parties: 0, sommets: 0, emis: 0, copies: 0 }),
      allegeEnMouvement: false,
      detruire: () => undefined,
    };
    const c = carte();
    void c.adopter(document.createElement('canvas'), peintre);
    image(16);
    expect(recues.at(-1)).toBeGreaterThan(50);
    c.cacherPastilles(true);
    image(32);
    expect(recues.at(-1)).toBe(0);
    c.cacherPastilles(false);
    image(48);
    expect(recues.at(-1)).toBeGreaterThan(50);
  });
});

describe('lignes de repère sur la carte qui tourne (#11)', () => {
  const lignes = lignesDe(CHOIX_LIGNES, textes.lignes);
  const LIGNE = VARS['--ligne-repere'];
  /** La couche des noms, ajoutée à l'hôte par la première ligne. */
  const couche = (c: CarteCanvas) =>
    ((c.hote as unknown as { ajoutes: unknown[] }).ajoutes.find((e) => (e as { className?: string }).className === 'lignes-noms') ?? null) as { hidden: boolean; dataset: Record<string, string> } | null;

  it('sur la carte, après les terres, avant les hachures et les frontières, d’un seul trait couleur --ligne-repere ; jamais sur la couche du dessus', () => {
    const c = carte();
    image(0);
    expect(ctx2d.ordre.some((o) => o.style === LIGNE)).toBe(false);
    c.lignes(lignes);
    image(16);
    expect(c.nbLignes).toBe(lignes.length);
    expect((c.hote as unknown as { dataset: Record<string, string> }).dataset.lignes).toBe(String(lignes.length));
    const i = ctx2d.ordre.findIndex((o) => o.type === 'stroke' && o.style === LIGNE);
    expect(i).toBeGreaterThan(0);
    expect(ctx2d.ordre.filter((o) => o.style === LIGNE)).toHaveLength(1);
    const terres = ctx2d.ordre.map((o, j) => (o.type === 'fill' && o.style === VARS['--terre'] ? j : -1)).filter((j) => j >= 0);
    expect(Math.max(...terres)).toBeLessThan(i);
    const hachures = ctx2d.ordre.findIndex((o) => o.style === 'motif');
    const frontieres = ctx2d.ordre.findIndex((o) => o.type === 'stroke' && o.style === VARS['--frontiere-fine']);
    expect(hachures).toBeGreaterThan(i);
    expect(frontieres).toBeGreaterThan(i);
    // Une marque (zone allumée) et les pastilles, sur la couche du dessus, au-dessus d'elles ; aucune ligne là.
    c.marquer('BRA', 'choisi');
    image(32);
    expect(ctxDessus.ordre.some((o) => o.style === LIGNE)).toBe(false);
    expect(ctxDessus.remplis.some((r) => r.style === VARS['--accent'])).toBe(true);
    // Les retirer : plus de trait.
    c.lignes([]);
    image(48);
    expect(ctx2d.ordre.some((o) => o.style === LIGNE)).toBe(false);
  });

  it('les mêmes lignes : rien à redessiner ; d’autres : la carte retracée', () => {
    const c = carte();
    c.lignes(lignes);
    image(0);
    const avant = ctx2d.etat.effacees;
    c.lignes([...lignes]);
    image(16);
    expect(ctx2d.etat.effacees).toBe(avant);
    c.lignes(lignes.slice(0, 2));
    image(32);
    expect(ctx2d.etat.effacees).toBe(avant + 1);
  });

  it('pick, noter et ecran ne voient pas les lignes : mêmes réponses avec et sans, au zoom 1 et tourné', () => {
    const points: [number, number][] = [];
    for (let x = 4; x < L; x += 23) for (let y = 120; y < 620; y += 19) points.push([x, y]);
    for (const r of [0, 120]) {
      const lire = (c: CarteCanvas) => points.map(([x, y]) => [c.pick(x, y)?.id ?? null, c.noter('FRA', x, y).juste, c.noter('BRA', x, y).juste]);
      const sans = carte();
      sans.zoomer({ k: 1, x: 0, y: 0, r });
      image(0);
      const avec = carte();
      avec.zoomer({ k: 1, x: 0, y: 0, r });
      avec.lignes(lignes);
      image(16);
      expect(lire(avec)).toEqual(lire(sans));
      expect(avec.ecran('FRA')).toEqual(sans.ecran('FRA'));
      expect(Object.keys(avec.contexte())).toEqual(Object.keys(sans.contexte()));
    }
  });

  it('les noms : posés à l’arrêt, cachés pendant un vol (le geste allégé), reposés à l’arrivée', () => {
    const c = carte();
    c.lignes(lignes);
    image(0);
    const noms = couche(c);
    expect(noms).not.toBeNull();
    expect(noms?.hidden).toBe(false);
    expect(Number(noms?.dataset.noms)).toBeGreaterThan(3);
    c.zoomerDe(2);
    image(100);
    image(116);
    expect(noms?.hidden).toBe(true);
    jouer(132, 600);
    expect(noms?.hidden).toBe(false);
  });
});

describe('CarteCanvas : montrerZone, le zoom lent sur la zone (décision « Zone allumée montrée par un zoom lent »)', () => {
  // Les réglages du mécanisme, à part de ceux de la vue (ZONE_MONTREE, nommer.ts) : les ajuster ne change pas ces tests.
  const REGLAGE: ReglageZone = { centrer_ms: 500, zoomer_ms: 1500, part: 1 / 3, zoom_max: 40 };
  const prive = (c: CarteCanvas) => c as unknown as { v: VueGlobe; vol: unknown; enMouvement: boolean; debuter(s: Event, souris: number | null): void };
  /** L'emprise à l'écran d'un contour (polygone principal, emprise d'une mer), dans le contexte du moment. */
  const boite = (c: CarteCanvas, contour: readonly (readonly number[])[]) => {
    const ctx = c.contexte();
    return empriseEcran(contour, (ll) => {
      const b = ctx.proj(ll);
      return b ? versEcran(ctx.t, b[0], b[1]) : null;
    })!;
  };
  const contourPays = (id: string) => anneauPrincipal(entite(id).forme, entite(id).pays.point);
  /** Où est le point d'étiquette de la zone à l'écran. */
  const pointDe = (c: CarteCanvas, id: string): [number, number] => {
    const ctx = c.contexte();
    const b = ctx.proj(entite(id).pays.point) as [number, number];
    return versEcran(ctx.t, b[0], b[1]);
  };
  /** Part de la carte visible qu'occupe l'emprise, sur son côté le plus serré. */
  const part = ([x0, y0, x1, y1]: number[]) => Math.max((x1! - x0!) / L, (y1! - y0!) / HV);
  const milieu = ([x0, y0, x1, y1]: number[]): [number, number] => [(x0! + x1!) / 2, (y0! + y1!) / 2];

  it('la France depuis la vue du monde : centrée en 0,5 s au zoom 1, puis grossie sur place en 1,5 s jusqu’au tiers de la carte ; la vue finale annoncée dès l’appel', () => {
    const c = carte();
    c.montrerZone('FRA', HV, REGLAGE);
    const fin = c.contexteFinal().t;
    expect(fin.k).toBeGreaterThan(2);
    jouer(0, 496);
    expect(prive(c).vol).not.toBeNull();
    image(512);
    // Le centrage fini : le monde au zoom 1, la France au milieu de la partie visible.
    expect(c.transfo.k).toBe(1);
    const [mx, my] = milieu(boite(c, contourPays('FRA')));
    expect(Math.abs(mx - L / 2)).toBeLessThan(2);
    expect(Math.abs(my - HV / 2)).toBeLessThan(2);
    // Le zoom lent : la France grossit sur place (au milieu de la partie visible), le zoom ne fait que croître,
    // toujours en mouvement (la carte allégée, aucune image complète entre le centrage et le zoom).
    let k = 1;
    for (let ts = 528; ts < 2016; ts += 16) {
      image(ts);
      const [x, y] = milieu(boite(c, contourPays('FRA')));
      expect([ts, Math.abs(x - L / 2) < 2 && Math.abs(y - HV / 2) < 2, c.transfo.k >= k, prive(c).enMouvement]).toEqual([ts, true, true, true]);
      k = c.transfo.k;
    }
    image(2016);
    expect(prive(c).vol).toBeNull();
    expect(prive(c).enMouvement).toBe(false);
    expect(c.contexte().t).toEqual(fin);
    const b = boite(c, contourPays('FRA'));
    expect(part(b)).toBeCloseTo(1 / 3, 2);
    expect(Math.abs(milieu(b)[0] - L / 2)).toBeLessThan(2);
    expect(Math.abs(milieu(b)[1] - HV / 2)).toBeLessThan(2);
  });

  it('immense (la Russie, déjà au tiers de la carte au zoom 1) : centrée, à peine zoomée, jamais dézoomée ; minuscule (le Vatican) : arrêtée au zoom maximal, sa région autour', () => {
    const c = carte();
    c.zoomerSur('BRA');
    c.montrerZone('RUS', HV, REGLAGE);
    const fin = c.contexteFinal().t;
    expect(fin.k).toBeGreaterThanOrEqual(1);
    expect(fin.k).toBeLessThan(1.1);
    for (let ts = 0; ts <= 2100; ts += 16) {
      image(ts);
      expect(c.transfo.k).toBeGreaterThanOrEqual(1);
    }
    expect(prive(c).vol).toBeNull();
    expect(c.contexte().t).toEqual(fin);
    expect(Math.abs(milieu(boite(c, contourPays('RUS')))[0] - L / 2)).toBeLessThan(2);
    c.montrerZone('VAT', HV, REGLAGE);
    expect(c.contexteFinal().t.k).toBe(REGLAGE.zoom_max);
    jouer(1000, 3100);
    expect(c.transfo.k).toBe(REGLAGE.zoom_max);
    const [x, y] = pointDe(c, 'VAT');
    expect(Math.abs(x - L / 2)).toBeLessThan(2);
    expect(Math.abs(y - HV / 2)).toBeLessThan(2);
  });

  it.each(['FJI', 'KIR', 'NZL'])('%s, près de l’antiméridien : la vue tournée vers elle, d’un seul tenant au milieu de la partie visible', (id) => {
    const c = carte();
    c.montrerZone(id, HV, REGLAGE);
    jouer(0, 2100);
    const v = prive(c).v;
    expect([v.r, v.k, v.y].every(Number.isFinite)).toBe(true);
    expect(Math.abs(ecartLon(v.r, entite(id).pays.point[0]))).toBeLessThan(15);
    const b = boite(c, contourPays(id));
    expect(b[2] - b[0]).toBeLessThan(L / 2);
    expect(Math.abs(milieu(b)[0] - L / 2)).toBeLessThan(3);
    expect(Math.abs(milieu(b)[1] - HV / 2)).toBeLessThan(3);
  });

  it('sous la barre (l’Afrique du Sud, l’Argentine) : montée au milieu de la partie visible, la vue libre', () => {
    for (const id of ['ZAF', 'ARG']) {
      const c = carte();
      expect(pointDe(c, id)[1]).toBeGreaterThan(HV / 2);
      c.montrerZone(id, HV, REGLAGE);
      jouer(0, 2100);
      const b = boite(c, contourPays(id));
      expect([id, b[1] >= 0 && b[3] <= HV, Math.abs(milieu(b)[1] - HV / 2) < 2]).toEqual([id, true, true]);
    }
  });

  it('depuis la vue zoomée d’une question précédente : la vue du monde posée d’emblée (le centrage ne tasse pas en 0,5 s un recul du zoom), le centrage au zoom 1, puis le zoom lent', () => {
    const c = carte();
    c.montrerZone('JPN', HV, REGLAGE);
    jouer(0, 2100);
    expect(c.transfo.k).toBeGreaterThan(2);
    c.montrerZone('BRA', HV, REGLAGE);
    const fin = c.contexteFinal().t;
    expect(c.transfo.k).toBe(1);
    for (let ts = 3000; ts <= 3496; ts += 16) {
      image(ts);
      expect([ts, c.transfo.k <= 1]).toEqual([ts, true]);
    }
    image(3512);
    expect(c.transfo.k).toBe(1);
    expect(Math.abs(milieu(boite(c, contourPays('BRA')))[0] - L / 2)).toBeLessThan(2);
    jouer(3528, 5100);
    expect(c.contexte().t).toEqual(fin);
  });

  it('interrompu proprement : un geste au centrage annule le zoom lent ; zoomer() ou la question suivante en plein zoom l’arrêtent où il en est', () => {
    let c = carte();
    c.montrerZone('FRA', HV, REGLAGE);
    jouer(0, 240);
    prive(c).debuter({} as Event, null);
    const arret = c.contexte().t;
    expect(c.contexteFinal().t).toEqual(arret);
    jouer(256, 3000);
    expect(c.contexte().t).toEqual(arret);
    expect(c.transfo.k).toBeLessThanOrEqual(1);
    c = carte();
    c.montrerZone('FRA', HV, REGLAGE);
    jouer(0, 1200);
    c.zoomer({ k: 2, x: 0, y: 0 });
    jouer(1216, 3000);
    expect(c.transfo.k).toBe(2);
    expect(prive(c).vol).toBeNull();
    c = carte();
    c.montrerZone('FRA', HV, REGLAGE);
    jouer(0, 1200);
    c.montrerZone('EGY', HV, REGLAGE);
    const fin = c.contexteFinal().t;
    jouer(1216, 4000);
    expect(c.contexte().t).toEqual(fin);
    expect(Math.abs(milieu(boite(c, contourPays('EGY')))[0] - L / 2)).toBeLessThan(2);
  });

  // Le quiz : une question au toucher après un QCM remet la vue du monde (vueEntiere) en plein zoom lent ; la vue d'arrivée
  // (arriveeVol) est alors celle de la fin du zoom, pas du centrage, sans quoi un bouton de zoom partirait du zoom 1.
  it('en plein zoom lent : vueEntiere() remet la vue du monde, zoomerDe() part de la vue finale du zoom', () => {
    let c = carte();
    c.montrerZone('FRA', HV, REGLAGE);
    jouer(0, 1000);
    expect(prive(c).vol).not.toBeNull();
    expect(c.transfo.k).toBeGreaterThan(1);
    c.vueEntiere();
    jouer(1016, 2600);
    expect(c.transfo.k).toBe(1);
    expect(prive(c).vol).toBeNull();
    expect(c.contexteFinal().t).toEqual(c.contexte().t);
    c = carte();
    c.montrerZone('FRA', HV, REGLAGE);
    const fin = c.contexteFinal().t;
    jouer(3000, 4000);
    expect(c.transfo.k).toBeLessThan(fin.k);
    c.zoomerDe(2);
    expect(c.contexteFinal().t.k).toBeCloseTo(2 * fin.k, 6);
    jouer(4016, 5000);
    expect(prive(c).vol).toBeNull();
    expect(c.transfo.k).toBeCloseTo(2 * fin.k, 6);
  });

  it('le système réduit les animations : la vue finale d’emblée, sans vol', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const c = carte();
    c.montrerZone('FRA', HV, REGLAGE);
    expect(prive(c).vol).toBeNull();
    expect(part(boite(c, contourPays('FRA')))).toBeCloseTo(1 / 3, 2);
  });

  describe('une mer, par son emprise entière (contourZone)', () => {
    const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
    const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
    const contourMer = (id: string) => contourEmprise(empriseMer(id, couche.mers.map((m) => m.pays))!);

    it('la Méditerranée au tiers de la carte ; le Pacifique centré seulement ; la mer de Béring, à cheval sur l’antiméridien, d’un seul tenant au milieu', () => {
      for (const [id, zoomee] of [
        ['medit', true],
        ['pacif', false],
        ['bering', true],
      ] as const) {
        const c = carte({ donnees: { ...donnees, mers: [] } });
        c.prendreMers(couche);
        c.montrerZone(id, HV, REGLAGE);
        expect([id, c.contexteFinal().t.k > 1]).toEqual([id, zoomee]);
        jouer(0, 2100);
        const b = boite(c, contourMer(id));
        expect([id, Math.abs(milieu(b)[0] - L / 2) < 3, Math.abs(milieu(b)[1] - HV / 2) < 3]).toEqual([id, true, true]);
        if (zoomee) expect([id, part(b)]).toEqual([id, expect.closeTo(1 / 3, 1)]);
        else expect(part(b)).toBeGreaterThan(1 / 3);
      }
    });
  });
});
