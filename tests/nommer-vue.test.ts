// Reconnaître (src/vues/nommer.ts) sur le DOM factice : premier test de la
// vue (décision « Nommer ») et de ses crochets du J1a (journal, mode piloté
// d'une séance, « Je connais déjà »).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pays } from '../src/map/types';
import type { ContexteVue } from '../src/vues/commun';
import { vueNommer, type ReponseNommer } from '../src/vues/nommer';
import { El, installerDom } from './dom-factice';

const IDS = ['FRA', 'ESP', 'ITA', 'DEU', 'BEL'];
const pays = (id: string, i: number): Pays =>
  ({ id, statut: 'jouable', superficie_km2: 5e5, partie_max_km2: 5e5, point: [i * 5, 45], bbox: [0, 40, 1, 50], micro: false, voisins: IDS.filter((x) => x !== id), continent: 'Europe', sous_region: 'Western Europe' }) as Pays;

function monter() {
  const zone = new El('main');
  const marques: string[] = [];
  const carte = {
    hote: new El('div'),
    transfo: { k: 3 },
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    montrer: vi.fn(),
    zoomer: vi.fn(),
    cadrer: vi.fn(),
    // Tout est à l'écran, grand : pas de vol.
    contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
  };
  const donnees = { entites: IDS.map((id, i) => ({ pays: pays(id, i), forme: undefined })), noms: { FRA: 'France', ESP: 'Espagne', ITA: 'Italie', DEU: 'Allemagne', BEL: 'Belgique' } };
  const terrain = { nom: 'monde', carte, donnees, jouables: IDS };
  const ctx = { zone, terrains: { montrer() {} } } as unknown as ContexteVue;
  const bilan = new El('div');
  const actions = () => new El('div');
  const n = vueNommer(ctx, { bilan: bilan as never, actions: actions as never });
  const barre = zone.querySelector('#barre-nommer')!;
  const choix = () => barre.querySelectorAll('.nommer-choix');
  const cible = () => barre.querySelector('.essai-consigne')!.dataset.cible!;
  const repondre = (bon: boolean) => choix().find((b) => (b.dataset.id === cible()) === bon)!.click();
  return { n, zone, barre, bilan, terrain: terrain as never, marques, choix, cible, repondre, carte };
}

describe('Reconnaître : la vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('quatre noms dont la cible, la zone allumée ; juste en vert, faux en rouge avec la bonne ; puis la suivante ; le bilan', () => {
    const v = monter();
    v.n.demarrer(v.terrain, 'Europe', ['FRA', 'ESP']);
    expect(v.barre.hidden).toBe(false);
    expect(v.choix().length).toBe(4);
    expect(v.choix().map((b) => b.dataset.id)).toContain('FRA');
    expect(v.marques).toContain('FRA:choisi');
    expect(v.barre.querySelector('.essai-compte')?.textContent).toBe('1 / 2');
    expect(v.barre.querySelector('#nommer-connu')?.hidden).toBe(true);
    v.repondre(true);
    expect(v.choix().find((b) => b.dataset.id === 'FRA')?.className).toContain('juste');
    expect(v.barre.querySelector('.essai-retro')?.textContent).toContain('Juste');
    vi.advanceTimersByTime(900);
    expect(v.cible()).toBe('ESP');
    v.repondre(false);
    expect(v.barre.querySelector('.essai-retro')?.textContent).toContain('bonne réponse : Espagne');
    expect(v.marques.some((m) => m.endsWith(':faux'))).toBe(true);
    vi.advanceTimersByTime(1800);
    expect(v.barre.hidden).toBe(true);
    expect(v.bilan.hidden).toBe(false);
    expect(v.bilan.innerText).toContain('1 / 2 justes du premier coup');
    expect(v.n.enCours).toBe(false);
  });

  it('crochet cadrer (QCM d’une grappe) : la carte cadrée sur la région avant la zone, une seule fois, pas au retour dans la vue', () => {
    const v = monter();
    v.n.demarrer(v.terrain, '', ['ITA'], { cadrer: [5, 40, 20, 50], surFin: () => {} });
    expect(v.carte.cadrer).toHaveBeenCalledTimes(1);
    expect(v.carte.cadrer.mock.calls[0]![0]).toEqual([5, 40, 20, 50]);
    expect(v.marques).toContain('ITA:choisi');
    v.n.quitter();
    v.n.reprendre();
    expect(v.carte.cadrer).toHaveBeenCalledTimes(1);
    v.n.demarrer(v.terrain, '', ['ESP'], { surFin: () => {} });
    expect(v.carte.cadrer).toHaveBeenCalledTimes(1);
  });

  it('crochet surReponse : chaque réponse (choix, justesse, temps, échelle) ; sa ligne s’ajoute à la rétroaction', () => {
    const v = monter();
    const vues: ReponseNommer[] = [];
    v.n.demarrer(v.terrain, 'Europe', ['ITA'], { surReponse: (r) => (vues.push(r), 'Revient dans 3 j') });
    v.repondre(false);
    expect(vues.length).toBe(1);
    expect(vues[0]).toMatchObject({ id: 'ITA', juste: false, zoom: 3 });
    expect(vues[0]!.choisi).not.toBe('ITA');
    expect(v.barre.querySelector('.essai-retro')?.textContent).toContain('Revient dans 3 j');
  });

  it('mode piloté : son compte, pas de bilan (surFin), « Je connais déjà » et « Terminer » rendus à la séance', () => {
    const v = monter();
    const surFin = vi.fn();
    const connu = vi.fn();
    const terminer = vi.fn();
    v.n.demarrer(v.terrain, '', ['DEU'], { compte: () => '4 / 12', surFin, connu, terminer });
    expect(v.barre.querySelector('.essai-compte')?.textContent).toBe('4 / 12');
    const bouton = v.barre.querySelector('#nommer-connu')!;
    expect(bouton.hidden).toBe(false);
    v.repondre(true);
    expect(bouton.disabled).toBe(true); // après une réponse, plus de « Je connais déjà »
    vi.advanceTimersByTime(900);
    expect(surFin).toHaveBeenCalledTimes(1);
    expect(v.bilan.hidden).toBe(true);
    expect(v.n.enCours).toBe(false);
    // « Je connais déjà » : la question sautée sans réponse.
    const surReponse = vi.fn();
    v.n.demarrer(v.terrain, '', ['BEL'], { surFin, connu, terminer, surReponse });
    v.barre.querySelector('#nommer-connu')!.click();
    expect(connu).toHaveBeenCalledTimes(1);
    expect(surReponse).not.toHaveBeenCalled();
    expect(v.n.enCours).toBe(false);
    v.n.demarrer(v.terrain, '', ['BEL'], { surFin, connu, terminer });
    v.barre.querySelector('#nommer-terminer')!.click();
    expect(terminer).toHaveBeenCalledTimes(1);
    expect(v.bilan.hidden).toBe(true);
  });

  it('quittée pendant la rétroaction : la réponse compte, la reprise passe à la suite', () => {
    const v = monter();
    const surFin = vi.fn();
    const surReponse = vi.fn();
    v.n.demarrer(v.terrain, '', ['FRA'], { surFin, surReponse });
    v.repondre(true);
    v.n.quitter();
    vi.advanceTimersByTime(5000);
    expect(surFin).not.toHaveBeenCalled();
    v.n.reprendre();
    expect(surFin).toHaveBeenCalledTimes(1);
    expect(surReponse).toHaveBeenCalledTimes(1);
  });
});
