// Écran des classements (🏆, src/vues/general.ts) : mes places d'abord, puis les
// dix premiers d'une épreuve. mesPlaces() et lireTableau() remplacés, DOM
// factice (tests/dom-factice.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EPREUVES, idEpreuve, periodeSemaine } from '../src/epreuve/chrono';
import { installerDom, installerStockage, type El } from './dom-factice';

const mesPlaces = vi.fn();
const lireTableau = vi.fn();
vi.mock('../src/epreuve/classement', () => ({
  GENERAL: 'general',
  mesPlaces: (...a: unknown[]) => mesPlaces(...a),
  lireTableau: (...a: unknown[]) => lireTableau(...a),
  publier: vi.fn(),
  placesDuPseudo: vi.fn(),
}));

const { nomEpreuve, rangSur, vueGeneral } = await import('../src/vues/general');
const { textes } = await import('../src/vues/textes');
const T = textes.chrono;

const ILE = idEpreuve('reunion');
const AFR = idEpreuve('Africa');
const place = (epreuve: string, points: number, rang = 1, joueurs = 1) => ({
  epreuve,
  place: { cle: 'michel', pseudo: 'Michel', points, justes: 0, questions: 0, temps_ms: 0 },
  rang,
  joueurs,
});
const attendre = () => new Promise((r) => setTimeout(r, 0));

let racine: El;
let retour: ReturnType<typeof vi.fn<() => void>>;
function ouvrir(): El {
  retour = vi.fn<() => void>();
  const zone = document.createElement('div') as unknown as El;
  racine = zone;
  const v = vueGeneral({ zone } as never, { retour });
  v.activer();
  return zone.querySelector('#classement-general')!;
}
const lignes = (ul: string) => racine.querySelectorAll(`${ul} .essai-serie`).map((b) => b.dataset.epreuve);

beforeEach(() => {
  installerDom();
  installerStockage();
  mesPlaces.mockReset();
  lireTableau.mockReset();
  lireTableau.mockResolvedValue({ places: [], moi: null, rang: null, joueurs: 0 });
});
afterEach(() => vi.unstubAllGlobals());

describe('écran des classements', () => {
  it('noms et rangs', () => {
    expect([nomEpreuve('general'), nomEpreuve(AFR), nomEpreuve(ILE), nomEpreuve(idEpreuve('tous'))]).toEqual(['Général', 'Afrique', 'La Réunion', 'Tous les pays']);
    expect([rangSur(1, 3), rangSur(4, 12)]).toEqual(['1er sur 3', '4e sur 12']);
  });

  it('mes places d’abord (général, puis les épreuves), les autres derrière « Toutes les épreuves »', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    mesPlaces.mockResolvedValue([place('general', 53_277), place(AFR, 31_710), place(ILE, 21_567, 2, 3)]);
    const p = ouvrir();
    await attendre();
    expect(mesPlaces).toHaveBeenCalledWith('toujours', 'Michel');
    expect(lignes('#classements-mes')).toEqual(['general', AFR, ILE]);
    expect(p.innerText).toContain((53_277).toLocaleString('fr-FR'));
    expect(p.innerText).toContain('2e sur 3');
    const plus = p.querySelector('#classements-plus')!;
    expect(p.querySelector('#classements-autres')!.hidden).toBe(true);
    plus.click();
    expect(p.querySelector('#classements-autres')!.hidden).toBe(false);
    expect(lignes('#classements-autres')).toEqual(EPREUVES.filter((e) => e !== AFR && e !== ILE));
    expect(plus.textContent).toBe(T.masquer_epreuves);
  });

  it('une ligne ouvre les dix premiers de son épreuve, « ‹ Classements » ramène à la liste', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    mesPlaces.mockResolvedValue([place(ILE, 21_567)]);
    const p = ouvrir();
    await attendre();
    p.querySelector(`.essai-serie[data-epreuve="${ILE}"]`)!.click();
    await attendre();
    expect(p.querySelector('h2')!.textContent).toBe('La Réunion');
    expect(lireTableau).toHaveBeenCalledWith(ILE, 'toujours', 'Michel');
    p.querySelector('#classements-liste')!.click();
    await attendre();
    expect(p.querySelector('h2')!.textContent).toBe(T.classements_titre);
    p.querySelector('#classement-retour')!.click();
    expect(retour).toHaveBeenCalled();
  });

  it('« Cette semaine » relit mes places de la semaine, et l’épreuve ouverte s’y ouvre aussi', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    mesPlaces.mockResolvedValue([place(AFR, 31_710)]);
    const p = ouvrir();
    await attendre();
    p.querySelector('button[data-v="semaine"]')!.click();
    await attendre();
    const semaine = periodeSemaine(Date.now());
    expect(mesPlaces).toHaveBeenLastCalledWith(semaine, 'Michel');
    p.querySelector(`.essai-serie[data-epreuve="${AFR}"]`)!.click();
    await attendre();
    expect(lireTableau).toHaveBeenCalledWith(AFR, semaine, 'Michel');
  });

  it('sans pseudo : toutes les épreuves, sans lecture de places', async () => {
    const p = ouvrir();
    await attendre();
    expect(mesPlaces).not.toHaveBeenCalled();
    expect(lignes('#classements-mes')).toEqual(['general', ...EPREUVES]);
    expect(p.innerText).toContain(T.classements_sans_pseudo);
  });

  it('aucune place, ou hors ligne : le dire, et toutes les épreuves restent ouvrables', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    mesPlaces.mockResolvedValue([]);
    let p = ouvrir();
    await attendre();
    expect(p.innerText).toContain(T.classements_aucune);
    expect(lignes('#classements-mes')).toHaveLength(EPREUVES.length + 1);
    mesPlaces.mockRejectedValue(new Error('hors ligne'));
    p = ouvrir();
    await attendre();
    expect(p.innerText).toContain(T.indisponible);
    expect(lignes('#classements-mes')).toHaveLength(EPREUVES.length + 1);
  });
});
