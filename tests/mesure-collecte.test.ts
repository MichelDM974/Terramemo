// Collecte des mesures (Mesures, src/mesure/mesures.ts) sans navigateur :
// window, requestAnimationFrame et PerformanceObserver sont simulés, pour
// éprouver ce que le rapport dit d'une fin de geste (état Event Timing, entrée
// suivante) et des dessins du rendu Canvas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinDeGeste } from '../src/map/carte';
import { Mesures } from '../src/mesure/mesures';

type Rappel = (liste: { getEntries(): unknown[] }) => void;
const observateurs = new Map<string, Rappel>();
class FauxObservateur {
  static supportedEntryTypes = ['event', 'long-animation-frame'];
  constructor(private readonly rappel: Rappel) {}
  observe(o: { type: string }) {
    observateurs.set(o.type, this.rappel);
  }
}
/** Livre des entrées Event Timing, comme le navigateur après la présentation de l'image. */
const livrer = (...entrees: { name: string; startTime: number; duration: number; interactionId?: number }[]) =>
  observateurs.get('event')?.({
    getEntries: () => entrees.map((e) => ({ interactionId: 0, processingStart: e.startTime, processingEnd: e.startTime, ...e })),
  });

const ecouteurs = new Map<string, ((e: { timeStamp: number }) => void)[]>();
/** Entrée de l'utilisateur (pointerdown, touchstart) vue par l'écouteur en capture. */
const entree = (type: string, timeStamp: number) => ecouteurs.get(type)?.forEach((f) => f({ timeStamp }));

let images: ((t: number) => void)[] = [];
const image = (t: number) => {
  const a = images;
  images = [];
  a.forEach((f) => f(t));
};

beforeEach(() => {
  observateurs.clear();
  ecouteurs.clear();
  images = [];
  vi.stubGlobal('PerformanceObserver', FauxObservateur);
  vi.stubGlobal('window', {
    innerWidth: 400,
    innerHeight: 800,
    devicePixelRatio: 2,
    addEventListener: (type: string, f: (e: { timeStamp: number }) => void) => ecouteurs.set(type, [...(ecouteurs.get(type) ?? []), f]),
  });
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => images.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => (images = []));
});
afterEach(() => vi.unstubAllGlobals());

const T = { k: 1, x: 0, y: 0 };
const doigt = { type: 'touchmove', touches: [{}] } as unknown as Event;
const fin = (timeStamp: number): FinDeGeste => ({
  a_bouge: true,
  source: { type: 'touchend', timeStamp } as Event,
  script_ms: 2,
  image: new Promise(() => {}),
});

function mesures(rendu: 'g' | 'css' | 'canvas' = 'g') {
  const m = new Mesures({ version: 't', rendu, projection: 'monde', carte: () => ({ largeur: 400, hauteur: 700 }) });
  m.periode_ms = 16.67;
  return m;
}

/** Un glissé de trois images, fini par un touchend à t_fin. */
function geste(m: Mesures, t_fin: number, dessins: number[] = []) {
  const e = m.ecouteGestes();
  e.debut?.(T, null);
  e.mouvement?.(T, doigt);
  for (const [i, ms] of dessins.entries()) {
    e.dessin?.(ms);
    image(t_fin - 100 + 16.67 * i);
  }
  for (let i = dessins.length; i < 3; i++) image(t_fin - 100 + 16.67 * i);
  e.fin?.(fin(t_fin));
}

describe('fin de geste : état Event Timing et entrée suivante', () => {
  it('sans entrée ni rien de postérieur : en attente, jamais sous le seuil', () => {
    const m = mesures();
    geste(m, 1000);
    expect(m.rapport().v).toBe(3);
    expect(m.rapport().gestes[0]?.fin).toMatchObject({
      event_timing_etat: 'en_attente',
      event_timing_ms: null,
      t_evenement_ms: 1000,
      entree_suivante_ms: null,
      close_par_entree_suivante: null,
    });
  });

  it('une entrée Event Timing postérieure prouve la présentation : sous le seuil', () => {
    const m = mesures();
    geste(m, 1000);
    livrer({ name: 'pointerup', startTime: 1000, duration: 24 }); // même instant : ne prouve rien
    expect(m.rapport().gestes[0]?.fin.event_timing_etat).toBe('en_attente');
    livrer({ name: 'pointerdown', startTime: 1400, duration: 24, interactionId: 3 });
    expect(m.rapport().gestes[0]?.fin.event_timing_etat).toBe('sous_seuil');
  });

  it('fin reportée : l’entrée de la fin se clôt avec l’image du toucher suivant', () => {
    const m = mesures();
    geste(m, 1000);
    entree('pointerdown', 900); // avant la fin : ignorée
    entree('pointerdown', 1580);
    entree('touchstart', 1580);
    livrer({ name: 'touchend', startTime: 1000, duration: 600 });
    expect(m.rapport().gestes[0]?.fin).toMatchObject({
      event_timing_etat: 'mesure',
      event_timing_ms: 600,
      entree_suivante_ms: 1580,
      close_par_entree_suivante: true,
    });
  });

  it('fin close avant l’entrée suivante, ou sans entrée suivante : pas close par elle', () => {
    const m = mesures();
    geste(m, 1000);
    livrer({ name: 'touchend', startTime: 1000, duration: 48 });
    expect(m.rapport().gestes[0]?.fin.close_par_entree_suivante).toBe(false);
    entree('touchstart', 1600);
    expect(m.rapport().gestes[0]?.fin).toMatchObject({ entree_suivante_ms: 1600, close_par_entree_suivante: false });
  });

  it('réinitialiser oublie les entrées suivies', () => {
    const m = mesures();
    entree('pointerdown', 1500);
    livrer({ name: 'pointerdown', startTime: 1500, duration: 24, interactionId: 1 });
    m.reinitialiser();
    geste(m, 1000);
    expect(m.rapport().gestes[0]?.fin).toMatchObject({ event_timing_etat: 'en_attente', entree_suivante_ms: null });
  });
});

describe('dessins du rendu Canvas', () => {
  it('chaque image dessinée pendant le geste : nombre, médiane, 95e centile, maximum', () => {
    const m = mesures('canvas');
    geste(m, 1000, [4, 6, 5, 12]);
    const g = m.rapport().gestes[0];
    expect(m.rapport().rendu).toBe('canvas');
    expect(g?.rendu).toBe('canvas');
    expect(g?.dessin_ms).toEqual({ images: 4, mediane: 5.5, p95: 11.1, max: 12 });
  });

  it('rendus SVG (aucun dessin rapporté) : null ; un geste sans mouvement n’en garde rien', () => {
    const m = mesures('css');
    geste(m, 1000);
    expect(m.rapport().gestes[0]?.dessin_ms).toBeNull();
    const e = m.ecouteGestes();
    e.debut?.(T, null);
    e.dessin?.(50);
    e.fin?.({ ...fin(2000), a_bouge: false });
    e.dessin?.(70); // hors geste
    geste(m, 3000, [3]);
    expect(m.rapport().gestes.map((g) => g.dessin_ms?.max ?? null)).toEqual([null, 3]);
  });
});
