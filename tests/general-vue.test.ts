// Écran des classements (🏆, src/vues/general.ts) : mes places d'abord, puis les
// dix premiers d'une épreuve ; les lectures de D52 b (les épreuves où
// l'appareil a un record, les places déjà vues, le reste sujet par sujet).
// mesPlaces() et lireTableau() remplacés, DOM factice (tests/dom-factice.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enregistrerPartie, epreuvesClassees, idEpreuve, periodeSemaine, reglerHorlogeEpreuves } from '../src/epreuve/chrono';
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

const { nomEpreuve, rangSur, titreEpreuve, vueGeneral } = await import('../src/vues/general');
const { remplir, textes } = await import('../src/vues/textes');
const { nomSujet } = await import('../src/vues/arbre');
const T = textes.chrono;

/** La bascule des épreuves des capitales (lundi 16/11/2026, 0 h UTC) : ces tests la veille, sauf ceux qui la passent. */
const OUVERTURE = Date.parse('2026-11-16T00:00:00Z');
const AVANT = OUVERTURE - 1;
reglerHorlogeEpreuves(() => AVANT);
const EPREUVES_CLASSEES = epreuvesClassees(AVANT);
const ILE = idEpreuve('reunion');
const AFR = idEpreuve('Africa');
const SF_EUR = idEpreuve('Europe', 'sansfaute');
const MIN_ILE = idEpreuve('reunion', 'minute');
const place = (epreuve: string, points: number, rang = 1, joueurs = 1) => ({
  epreuve,
  place: { cle: 'michel', pseudo: 'Michel', points, justes: 0, questions: 0, temps_ms: 0 },
  rang,
  joueurs,
});
const attendre = () => new Promise((r) => setTimeout(r, 0));
/** Un record de l'appareil dans ces épreuves (toujours et la semaine) : elles se lisent à l'ouverture. */
const records = (...epreuves: string[]) => {
  for (const e of epreuves) enregistrerPartie(localStorage, e, { points: 1, justes: 0, questions: 1, temps_ms: 1_000 }, Date.now());
};
/** mesPlaces() : les places de `places` parmi les épreuves demandées, dans leur ordre. */
const repondre = (places: ReturnType<typeof place>[]) =>
  mesPlaces.mockImplementation(async (_p: string, _pseudo: string, epreuves: string[]) => epreuves.flatMap((e) => places.filter((x) => x.epreuve === e)));

let racine: El;
let retour: ReturnType<typeof vi.fn<() => void>>;
let versCarte: ReturnType<typeof vi.fn<() => void>>;
function ouvrir(): El {
  retour = vi.fn<() => void>();
  versCarte = vi.fn<() => void>();
  const zone = document.createElement('div') as unknown as El;
  racine = zone;
  const v = vueGeneral({ zone } as never, { retour, versCarte });
  v.activer();
  return zone.querySelector('#classement-general')!;
}
const lignes = (ul: string) => racine.querySelectorAll(`${ul} .essai-serie`).map((b) => b.dataset.epreuve);
/** Les titres des groupes (un par mode) d'une liste. */
const groupes = (ul: string) => racine.querySelectorAll(`${ul} .classements-groupe h3`).map((h) => h.textContent);
/** Les titres des sujets (h4) d'une liste, mode après mode. */
const sujets = (ul: string) => racine.querySelectorAll(`${ul} .classements-sujet h4`).map((h) => h.textContent);

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
    expect([nomEpreuve('general'), nomEpreuve(AFR), nomEpreuve(ILE), nomEpreuve(idEpreuve('tous')), nomEpreuve(SF_EUR)]).toEqual(['Général', 'Afrique', 'La Réunion', 'Tous les pays', 'Europe']);
    expect([titreEpreuve('general'), titreEpreuve(AFR), titreEpreuve(SF_EUR), titreEpreuve(MIN_ILE)]).toEqual([
      'Classement général',
      'Chrono · Afrique',
      'Sans faute · Europe',
      'Minute · La Réunion',
    ]);
    expect([rangSur(1, 3), rangSur(4, 12)]).toEqual(['1er sur 3', '4e sur 12']);
  });

  it('noms avec le sujet : pays et communes inchangés, les autres sujets devant la série (étude J2 § 3.2)', () => {
    expect(nomEpreuve(idEpreuve('Africa', 'chrono', 'pays'))).toBe('Afrique');
    expect(nomEpreuve(idEpreuve('reunion', 'minute', 'communes'))).toBe('La Réunion');
    // Le nom du sujet vient de textes.jouer.sujets, qui l'aura au lot de chaque sujet ; d'ici là, son id.
    expect(nomEpreuve(idEpreuve('Africa', 'chrono', 'capitales'))).toBe(remplir(textes.chrono.epreuve_sujet, { sujet: nomSujet('capitales'), serie: 'Afrique' }));
    // Un mode que l'écran ne sait pas titrer (le quiz, au lot 4b) : son nom seul, sans planter.
    expect(titreEpreuve('quiz:general:facile')).toBe(nomEpreuve('quiz:general:facile'));
    expect(titreEpreuve(idEpreuve('Africa', 'sansfaute', 'capitales'))).toBe(`Sans faute · ${nomEpreuve(idEpreuve('Africa', 'chrono', 'capitales'))}`);
  });

  it('mes places d’abord (général, puis les épreuves, par mode puis par sujet), les autres derrière « Toutes les épreuves »', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    records(AFR, ILE, SF_EUR, MIN_ILE);
    repondre([place('general', 53_277), place(AFR, 31_710), place(ILE, 21_567, 2, 3), place(SF_EUR, 17), place(MIN_ILE, 1)]);
    const p = ouvrir();
    await attendre();
    // D52 b : le général et les épreuves où l'appareil a un record, seulement.
    expect(mesPlaces).toHaveBeenCalledWith('toujours', 'Michel', ['general', AFR, ILE, SF_EUR, MIN_ILE]);
    expect(lignes('#classements-mes')).toEqual(['general', AFR, ILE, SF_EUR, MIN_ILE]);
    expect(groupes('#classements-mes')).toEqual(['Chrono', 'Sans faute', 'Minute']);
    expect(sujets('#classements-mes')).toEqual(['Pays', 'Communes', 'Pays', 'Communes']);
    expect(p.innerText).toContain(`${(53_277).toLocaleString('fr-FR')} pts`);
    expect(p.innerText).toContain("17 d'affilée");
    expect(p.innerText).toContain('1 juste');
    expect(p.innerText).toContain('2e sur 3');
    const plus = p.querySelector('#classements-plus')!;
    expect(p.querySelector('#classements-autres')!.hidden).toBe(true);
    plus.click();
    expect(p.querySelector('#classements-autres')!.hidden).toBe(false);
    expect(lignes('#classements-autres')).toEqual(EPREUVES_CLASSEES.filter((e) => ![AFR, ILE, SF_EUR, MIN_ILE].includes(e)));
    expect(groupes('#classements-autres')).toEqual(['Chrono', 'Sans faute', 'Minute']);
    expect(sujets('#classements-autres')).toEqual(['Pays', 'Pays', 'Communes', 'Pays']);
    expect(plus.textContent).toBe(T.masquer_epreuves);
    // Les autres ne sont pas lues : ni rang, ni « pas encore classé », mais de quoi les chercher.
    expect(racine.querySelector(`#classements-autres .essai-serie[data-epreuve="${idEpreuve('Asia')}"]`)!.innerText).not.toContain(T.pas_classe);
    expect(racine.querySelectorAll('#classements-autres .classements-chercher').map((b) => b.dataset.sujet)).toEqual(['pays', 'pays', 'communes', 'pays']);
  });

  it('D52 b : à l’ouverture, 1 + 4 classements lus au lieu de 1 + 45 (les capitales ouvertes) ; « Chercher mes places » lit le reste, sujet par sujet', async () => {
    reglerHorlogeEpreuves(() => OUVERTURE);
    try {
      const tout = epreuvesClassees(OUVERTURE);
      expect(tout).toHaveLength(45);
      localStorage.setItem('terramemo.pseudo', 'Michel');
      const CAP_OCE = idEpreuve('Oceania', 'chrono', 'capitales');
      const SF_CAP = idEpreuve('tous', 'sansfaute', 'capitales');
      records(AFR, ILE, CAP_OCE);
      // Une place prise sur un autre appareil, sans record ici : seulement à la demande.
      repondre([place('general', 53_277), place(AFR, 31_710), place(CAP_OCE, 12_400), place(SF_CAP, 30)]);
      const p = ouvrir();
      await attendre();
      expect(mesPlaces).toHaveBeenCalledTimes(1);
      expect(mesPlaces.mock.calls[0]![2]).toEqual(['general', AFR, CAP_OCE, ILE]);
      expect(lignes('#classements-mes')).toEqual(['general', AFR, CAP_OCE]);
      expect(sujets('#classements-mes')).toEqual(['Pays', 'Capitales']);
      expect(p.innerText).toContain('Capitales · Océanie');
      // Lue sans place : « pas encore classé » ; pas lue : rien.
      const ligne = (e: string) => racine.querySelector(`#classements-autres .essai-serie[data-epreuve="${e}"]`)!.innerText;
      expect(ligne(ILE)).toContain(T.pas_classe);
      expect(ligne(SF_CAP)).not.toContain(T.pas_classe);
      // Les capitales, à la demande : leurs épreuves pas encore lues, les trois modes, rien d'autre.
      const chercher = racine.querySelector('#classements-autres .classements-chercher[data-sujet="capitales"]')!;
      expect(chercher.textContent).toBe(T.chercher_places);
      chercher.click();
      await attendre();
      expect(mesPlaces).toHaveBeenCalledTimes(2);
      const lues = mesPlaces.mock.calls[1]![2] as string[];
      expect(lues).toHaveLength(20);
      expect(lues.every((e) => e.split(':')[1] === 'capitales' && e !== CAP_OCE)).toBe(true);
      // La place trouvée passe dans mes places ; le bouton des capitales n'est plus là, celui des pays si.
      expect(lignes('#classements-mes')).toEqual(['general', AFR, CAP_OCE, SF_CAP]);
      expect(racine.querySelector('.classements-chercher[data-sujet="capitales"]')).toBeNull();
      expect(racine.querySelector('.classements-chercher[data-sujet="pays"]')).not.toBeNull();
      expect(ligne(idEpreuve('Africa', 'minute', 'capitales'))).toContain(T.pas_classe);
      // Gardée comme vue : à la prochaine ouverture, elle se lit d'office (sans record sur l'appareil).
      mesPlaces.mockClear();
      ouvrir();
      await attendre();
      expect(mesPlaces.mock.calls[0]![2]).toEqual(['general', AFR, CAP_OCE, ILE, SF_CAP]);
      // Un autre pseudo n'hérite pas des places vues de celui-ci.
      localStorage.setItem('terramemo.pseudo', 'Zoé');
      mesPlaces.mockClear();
      ouvrir();
      await attendre();
      expect(mesPlaces.mock.calls[0]![2]).toEqual(['general', AFR, CAP_OCE, ILE]);
    } finally {
      reglerHorlogeEpreuves(() => AVANT);
    }
  });

  it('« Chercher mes places » hors ligne : le bouton le dit et se réessaie', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    records(AFR);
    repondre([place(AFR, 31_710)]);
    ouvrir();
    await attendre();
    mesPlaces.mockRejectedValueOnce(new Error('hors ligne'));
    const b = () => racine.querySelector('#classements-autres .classements-chercher[data-sujet="communes"]')!;
    b().click();
    await attendre();
    expect(b().textContent).toBe(T.chercher_echec);
    expect(b().disabled).toBe(false);
    b().click();
    await attendre();
    expect(racine.querySelector('.classements-chercher[data-sujet="communes"]')).toBeNull();
  });

  it('avant le 16/11, rien des capitales ; après, leurs épreuves sous « Capitales », entre Pays et Communes', async () => {
    const p = ouvrir();
    await attendre();
    expect(p.innerText).not.toContain('Capitales');
    reglerHorlogeEpreuves(() => OUVERTURE);
    try {
      ouvrir();
      await attendre();
      expect(sujets('#classements-mes')).toEqual(['Pays', 'Capitales', 'Communes', 'Pays', 'Capitales', 'Communes', 'Pays', 'Capitales', 'Communes']);
      expect(lignes('#classements-mes')).toEqual(['general', ...epreuvesClassees(OUVERTURE)]);
    } finally {
      reglerHorlogeEpreuves(() => AVANT);
    }
  });

  it('une ligne ouvre les dix premiers de son épreuve, « ‹ Classements » ramène à la liste', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    records(ILE);
    repondre([place(ILE, 21_567)]);
    const p = ouvrir();
    await attendre();
    p.querySelector(`.essai-serie[data-epreuve="${ILE}"]`)!.click();
    await attendre();
    expect(p.querySelector('h2')!.textContent).toBe('Chrono · La Réunion');
    expect(lireTableau).toHaveBeenCalledWith(ILE, 'toujours', 'Michel');
    p.querySelector('#classements-liste')!.click();
    await attendre();
    expect(p.querySelector('h2')!.textContent).toBe(T.classements_titre);
    p.querySelector('#classement-retour')!.click();
    expect(retour).toHaveBeenCalled();
  });

  it('« × » (#18), sur la liste comme sur le détail d’une épreuve : la carte, pas la vue d’avant', async () => {
    const p = ouvrir();
    await attendre();
    const x = p.querySelector('.croix')!;
    expect([x.textContent, x.getAttribute('aria-label'), x.getAttribute('title')]).toEqual(['×', textes.croix.carte, textes.croix.carte]);
    x.click();
    p.querySelector(`.essai-serie[data-epreuve="${ILE}"]`)!.click();
    await attendre();
    p.querySelector('.croix')!.click();
    expect(versCarte).toHaveBeenCalledTimes(2);
    expect(retour).not.toHaveBeenCalled();
  });

  it('« Cette semaine » relit mes places de la semaine, et l’épreuve ouverte s’y ouvre aussi', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    records(AFR);
    repondre([place(AFR, 31_710)]);
    const p = ouvrir();
    await attendre();
    p.querySelector('button[data-v="semaine"]')!.click();
    await attendre();
    const semaine = periodeSemaine(Date.now());
    expect(mesPlaces).toHaveBeenLastCalledWith(semaine, 'Michel', ['general', AFR]);
    p.querySelector(`.essai-serie[data-epreuve="${AFR}"]`)!.click();
    await attendre();
    expect(lireTableau).toHaveBeenCalledWith(AFR, semaine, 'Michel');
  });

  it('sans pseudo : toutes les épreuves, sans lecture de places', async () => {
    const p = ouvrir();
    await attendre();
    expect(mesPlaces).not.toHaveBeenCalled();
    expect(lignes('#classements-mes')).toEqual(['general', ...EPREUVES_CLASSEES]);
    expect(groupes('#classements-mes')).toEqual(['Chrono', 'Sans faute', 'Minute']);
    expect(p.innerText).toContain(T.classements_sans_pseudo);
  });

  it('aucune place, ou hors ligne : le dire, et toutes les épreuves restent ouvrables', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    mesPlaces.mockResolvedValue([]);
    let p = ouvrir();
    await attendre();
    // Sans record ni place vue : le général seul est lu ; le reste se cherche sujet par sujet.
    expect(mesPlaces).toHaveBeenCalledWith('toujours', 'Michel', ['general']);
    expect(p.innerText).toContain(T.classements_aucune);
    expect(lignes('#classements-mes')).toHaveLength(EPREUVES_CLASSEES.length + 1);
    expect(racine.querySelectorAll('#classements-mes .classements-chercher').length).toBe(6);
    mesPlaces.mockRejectedValue(new Error('hors ligne'));
    p = ouvrir();
    await attendre();
    expect(p.innerText).toContain(T.indisponible);
    expect(lignes('#classements-mes')).toHaveLength(EPREUVES_CLASSEES.length + 1);
  });
});
