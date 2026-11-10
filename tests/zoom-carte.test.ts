// Boutons de zoom de la carte (#23, src/zoom-carte.ts) : +, − et « toute la
// carte », et les touches + et − du clavier ; DOM factice
// (tests/dom-factice.ts). Le zoom lui-même : tests/carte-canvas-dom.test.ts
// et tests/carte-svg-dom.test.ts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarteAffichee } from '../src/map/carte';
import { textes } from '../src/vues/textes';
import { brancherZoom, cranDeTouche, CRAN, VUES_ZOOM } from '../src/zoom-carte';
import { El, installerDom } from './dom-factice';

let body: El;
let zone: El;
let carte: { zoomerDe: ReturnType<typeof vi.fn>; vueEntiere: ReturnType<typeof vi.fn> } | null;

beforeEach(() => {
  body = installerDom();
  zone = new El('main');
  carte = { zoomerDe: vi.fn(), vueEntiere: vi.fn() };
  brancherZoom({ zone: zone as unknown as HTMLElement, carte: () => carte as unknown as CarteAffichee | null });
  body.dataset.vue = 'carte';
});
afterEach(() => vi.unstubAllGlobals());

/** Une touche frappée : rend vrai si l'appui a été pris (preventDefault). */
function frapper(key: string, o: { ctrlKey?: boolean; dans?: string } = {}): boolean {
  let pris = false;
  const target = { closest: (sel: string) => (o.dans && sel.split(',').some((s) => s.trim() === o.dans) ? {} : null) };
  (document as unknown as El).emettre('keydown', { key, ctrlKey: !!o.ctrlKey, metaKey: false, altKey: false, defaultPrevented: false, target, preventDefault: () => (pris = true) });
  return pris;
}

describe('boutons de zoom (#23)', () => {
  it('un groupe de trois boutons dans la zone de la carte, nommés pour un lecteur d’écran', () => {
    const g = zone.querySelector('#zoom-carte')!;
    expect(g.getAttribute('role')).toBe('group');
    expect(g.getAttribute('aria-label')).toBe(textes.zoom.groupe);
    const boutons = g.querySelectorAll('button');
    expect(boutons.map((b) => b.id)).toEqual(['zoom-plus', 'zoom-moins', 'zoom-tout']);
    expect(boutons.map((b) => b.getAttribute('aria-label'))).toEqual([textes.zoom.plus, textes.zoom.moins, textes.zoom.tout]);
    for (const b of boutons) {
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('title')).toBe(b.getAttribute('aria-label'));
    }
    expect(boutons[0]!.textContent).toBe('+');
    expect(boutons[1]!.textContent).toBe('−');
    expect(boutons[2]!.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('+ zoome d’un cran, − dézoome d’un cran, le troisième montre toute la carte', () => {
    expect(CRAN).toBe(2);
    zone.querySelector('#zoom-plus')!.click();
    zone.querySelector('#zoom-moins')!.click();
    expect(carte!.zoomerDe.mock.calls).toEqual([[2], [0.5]]);
    zone.querySelector('#zoom-tout')!.click();
    expect(carte!.vueEntiere).toHaveBeenCalledOnce();
  });

  it('avant que la carte soit chargée, un clic ne fait rien (sans erreur)', () => {
    carte = null;
    expect(() => zone.querySelector('#zoom-plus')!.click()).not.toThrow();
  });

  it('les touches : + et = zooment, − dézoome (trait d’union ou signe moins), les autres rien', () => {
    expect(['+', '=', '-', '−', 'a', '0', 'Enter'].map(cranDeTouche)).toEqual([2, 2, 0.5, 0.5, 0, 0, 0]);
    expect(frapper('+')).toBe(true);
    expect(frapper('=')).toBe(true);
    expect(frapper('-')).toBe(true);
    expect(frapper('a')).toBe(false);
    expect(carte!.zoomerDe.mock.calls).toEqual([[2], [2], [0.5]]);
  });

  it('les touches ne font rien dans un champ (la recherche), avec Ctrl (le zoom du navigateur), ni hors des vues de la carte', () => {
    expect(frapper('+', { dans: 'input' })).toBe(false);
    expect(frapper('-', { dans: 'textarea' })).toBe(false);
    expect(frapper('+', { ctrlKey: true })).toBe(false);
    for (const vue of ['jouer', 'classement', 'saisie', 'credits']) {
      body.dataset.vue = vue;
      expect([vue, frapper('+')]).toEqual([vue, false]);
    }
    expect(carte!.zoomerDe).not.toHaveBeenCalled();
    for (const vue of VUES_ZOOM) {
      body.dataset.vue = vue;
      expect([vue, frapper('+')]).toEqual([vue, true]);
    }
  });

  it('l’écran de connexion ouvert (ou attendu) : les touches ne zooment pas la carte figée derrière ; Confidentialité ouverte, rien à zoomer non plus', () => {
    body.dataset.vue = 'carte';
    for (const etat of ['attente', 'ouvert']) {
      body.dataset.accueil = etat;
      expect([etat, frapper('+')]).toEqual([etat, false]);
    }
    delete body.dataset.accueil;
    expect(frapper('+')).toBe(true);
    expect(carte!.zoomerDe.mock.calls).toEqual([[2]]);
  });

  it('carte.css : cachés par défaut, montrés hors d’un écran tactile (pas pointer: coarse) dans les vues de VUES_ZOOM seulement', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toMatch(/\.zoom-carte \{[^}]*display: none;/);
    const media = css.slice(css.indexOf('@media not all and (pointer: coarse) {'));
    expect(media.length).toBeLessThan(css.length);
    const regle = media.slice(0, media.indexOf('}') + 1);
    expect(regle).toContain('.zoom-carte { display: flex; }');
    const vues = [...regle.matchAll(/\[data-vue="(\w+)"\]/g)].map((m) => m[1]);
    expect(vues).toEqual([...VUES_ZOOM]);
  });
});
