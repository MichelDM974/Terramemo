// Écran des classements (🏆, src/vues/general.ts) : mes places d'abord, puis les
// dix premiers d'une épreuve ; les lectures de D52 b (les épreuves où
// l'appareil a un record, les places déjà vues, le reste sujet par sujet).
// mesPlaces() et lireTableau() remplacés, DOM factice (tests/dom-factice.ts).
// Les scores en part de justes (décision « Barème et classements » du
// 12/11/2026, #30) ; Minute retiré, ses ids (`minute:…`) ni lus ni montrés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enregistrerPartie, epreuvesClassees, idEpreuve, periodeSemaine } from '../src/epreuve/chrono';
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

const EPREUVES_CLASSEES = epreuvesClassees();
const ILE = idEpreuve('reunion');
const AFR = idEpreuve('Africa');
const SF_EUR = idEpreuve('Europe', 'sansfaute');
/** Un record de Minute (retiré) resté sur l'appareil. */
const MIN_ILE = 'minute:localiser:reunion';
/** Une place (barème 2 : points = justes) sur `questions` questions. */
const place = (epreuve: string, justes: number, rang = 1, joueurs = 1, questions = justes, temps_ms = 0) => ({
  epreuve,
  place: { cle: 'michel', pseudo: 'Michel', points: justes, justes, questions, temps_ms },
  rang,
  joueurs,
});
const attendre = () => new Promise((r) => setTimeout(r, 0));
/** Un record de l'appareil dans ces épreuves (toujours et la semaine) : elles se lisent à l'ouverture. */
const records = (...epreuves: string[]) => {
  for (const e of epreuves) enregistrerPartie(localStorage, e, { points: 1, justes: 1, questions: 1, temps_ms: 1_000 }, Date.now());
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
    // Minute, retiré : plus de mode à nommer, la série seule (sans planter).
    expect([titreEpreuve('general'), titreEpreuve(AFR), titreEpreuve(SF_EUR), titreEpreuve(MIN_ILE)]).toEqual([
      'Classement général',
      'Chrono · Afrique',
      'Sans faute · Europe',
      'La Réunion',
    ]);
    expect([rangSur(1, 3), rangSur(4, 12)]).toEqual(['1er sur 3', '4e sur 12']);
  });

  it('noms avec le sujet : pays et communes inchangés, les autres sujets devant la série (étude J2 § 3.2)', () => {
    expect(nomEpreuve(idEpreuve('Africa', 'chrono', 'pays'))).toBe('Afrique');
    expect(nomEpreuve(idEpreuve('reunion', 'sansfaute', 'communes'))).toBe('La Réunion');
    // Le nom du sujet vient de textes.jouer.sujets, qui l'aura au lot de chaque sujet ; d'ici là, son id.
    expect(nomEpreuve(idEpreuve('Africa', 'chrono', 'capitales'))).toBe(remplir(textes.chrono.epreuve_sujet, { sujet: nomSujet('capitales'), serie: 'Afrique' }));
    // Un mode que l'écran ne sait pas titrer (le quiz, au lot 4b) : son nom seul, sans planter.
    expect(titreEpreuve('quiz:general:facile')).toBe(nomEpreuve('quiz:general:facile'));
    expect(titreEpreuve(idEpreuve('Africa', 'sansfaute', 'capitales'))).toBe(`Sans faute · ${nomEpreuve(idEpreuve('Africa', 'chrono', 'capitales'))}`);
  });

  it('mes places d’abord (général, puis les épreuves, par mode puis par sujet), les autres derrière « Toutes les épreuves »', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    // Le record de Minute (retiré) resté sur l'appareil : ni lu, ni montré.
    records(AFR, ILE, SF_EUR, MIN_ILE);
    repondre([place('general', 91, 2, 3, 120, 256_000), place(AFR, 31, 1, 1, 54, 185_000), place(ILE, 21, 2, 3, 24, 58_000), place(SF_EUR, 17, 1, 1, 18, 62_000), place(MIN_ILE, 1)]);
    const p = ouvrir();
    await attendre();
    // D52 b : le général et les épreuves où l'appareil a un record, seulement.
    expect(mesPlaces).toHaveBeenCalledWith('toujours', 'Michel', ['general', AFR, ILE, SF_EUR]);
    expect(lignes('#classements-mes')).toEqual(['general', AFR, ILE, SF_EUR]);
    expect(groupes('#classements-mes')).toEqual(['Chrono', 'Sans faute']);
    expect(sujets('#classements-mes')).toEqual(['Pays', 'Communes', 'Pays']);
    // Un petit tableau (choix du 12/11) : Rang · Score · Temps, chaque case sa valeur et son détail dessous. Le score en
    // part de justes, tronquée : le général à une décimale sur 1 194 ; Sans faute sur la taille de la série.
    const mille = (1194).toLocaleString('fr-FR');
    const cases = (e: string) =>
      racine.querySelectorAll(`#classements-mes .essai-serie[data-epreuve="${e}"] .place-case`).map((c) => [c.querySelector('b')!.textContent, c.querySelector('small')?.textContent ?? null]);
    expect(cases('general')).toEqual([['2e', 'sur 3'], ['7,6\u00a0%', `91/${mille}`], ['4\u00a0min\u00a016', null]]);
    expect(cases(AFR)).toEqual([['1er', 'sur 1'], ['57\u00a0%', '31/54'], ['3\u00a0min\u00a005', null]]);
    expect(cases(ILE)).toEqual([['2e', 'sur 3'], ['87\u00a0%', '21/24'], ['58\u00a0s', null]]);
    expect(cases(SF_EUR)).toEqual([['1er', 'sur 1'], ['38\u00a0%', '17/44'], ['1\u00a0min\u00a002', null]]);
    // Le général dit ses justes en entier au survol ; chaque ligne se lit d'une phrase.
    expect(racine.querySelector('#classements-mes .essai-serie[data-epreuve="general"] .place-score')!.title).toBe(`91 justes sur ${mille}`);
    const lu = (e: string) => racine.querySelector(`#classements-mes .essai-serie[data-epreuve="${e}"]`)!.getAttribute('aria-label');
    expect(lu('general')).toBe(`Général : 2e sur 3, 91 justes sur ${mille} · 7,6\u00a0%, 4\u00a0min\u00a016`);
    expect(lu(AFR)).toBe('Afrique : 1er sur 1, 31/54 · 57\u00a0%, 3\u00a0min\u00a005');
    // L'en-tête des colonnes, sur la ligne du titre de chaque mode qui a des places (visuel seul).
    const tetes = racine.querySelectorAll('#classements-mes .places-tete');
    expect(tetes.map((x) => x.querySelectorAll('.places-col').map((c) => c.textContent))).toEqual([
      [T.colonne_rang, T.colonne_score, T.colonne_temps],
      [T.colonne_rang, T.colonne_score, T.colonne_temps],
    ]);
    expect(tetes.every((x) => x.querySelectorAll('.places-col').every((c) => c.getAttribute('aria-hidden') === 'true'))).toBe(true);
    // Sans place, ni cases ni en-tête.
    expect(racine.querySelectorAll('#classements-autres .place-case')).toHaveLength(0);
    expect(racine.querySelectorAll('#classements-autres .places-tete')).toHaveLength(0);
    const plus = p.querySelector('#classements-plus')!;
    expect(p.querySelector('#classements-autres')!.hidden).toBe(true);
    plus.click();
    expect(p.querySelector('#classements-autres')!.hidden).toBe(false);
    expect(lignes('#classements-autres')).toEqual(EPREUVES_CLASSEES.filter((e) => ![AFR, ILE, SF_EUR].includes(e)));
    expect(groupes('#classements-autres')).toEqual(['Chrono', 'Sans faute']);
    expect(sujets('#classements-autres')).toEqual(['Pays', 'Capitales', 'Drapeaux', 'Pays', 'Capitales', 'Drapeaux', 'Communes']);
    expect(plus.textContent).toBe(T.masquer_epreuves);
    // Les autres ne sont pas lues : ni rang, ni « pas encore classé », mais de quoi les chercher.
    expect(racine.querySelector(`#classements-autres .essai-serie[data-epreuve="${idEpreuve('Asia')}"]`)!.innerText).not.toContain(T.pas_classe);
    expect(racine.querySelectorAll('#classements-autres .classements-chercher').map((b) => b.dataset.sujet)).toEqual([
      ...['pays', 'capitales', 'drapeaux'],
      ...['pays', 'capitales', 'drapeaux', 'communes'],
    ]);
  });

  it('D52 b : à l’ouverture, 1 + 5 classements lus au lieu de 1 + 44 ; « Chercher mes places » lit le reste, sujet par sujet', async () => {
    const tout = epreuvesClassees();
    expect(tout).toHaveLength(44);
    localStorage.setItem('terramemo.pseudo', 'Michel');
    const CAP_OCE = idEpreuve('Oceania', 'chrono', 'capitales');
    const SF_CAP = idEpreuve('tous', 'sansfaute', 'capitales');
    const DRA_OCE = idEpreuve('Oceania', 'chrono', 'drapeaux');
    const SF_DRA = idEpreuve('Europe', 'sansfaute', 'drapeaux');
    records(AFR, ILE, CAP_OCE, DRA_OCE);
    // Des places prises sur un autre appareil, sans record ici : seulement à la demande.
    repondre([place('general', 53), place(AFR, 31), place(CAP_OCE, 12), place(DRA_OCE, 13), place(SF_CAP, 30), place(SF_DRA, 21)]);
    const p = ouvrir();
    await attendre();
    expect(mesPlaces).toHaveBeenCalledTimes(1);
    expect(mesPlaces.mock.calls[0]![2]).toEqual(['general', AFR, CAP_OCE, DRA_OCE, ILE]);
    expect(lignes('#classements-mes')).toEqual(['general', AFR, CAP_OCE, DRA_OCE]);
    expect(sujets('#classements-mes')).toEqual(['Pays', 'Capitales', 'Drapeaux']);
    // Sous le titre de son sujet (h4), la série seule : « Océanie », pas « Capitales · Océanie ».
    const nom = (e: string) => racine.querySelector(`#classements-mes .essai-serie[data-epreuve="${e}"] .essai-serie-nom`)!.textContent;
    expect([nom(CAP_OCE), nom(DRA_OCE)]).toEqual(['Océanie', 'Océanie']);
    expect(p.innerText).not.toContain('Capitales · Océanie');
    // Lue sans place : « pas encore classé » ; pas lue : rien.
    const ligne = (e: string) => racine.querySelector(`#classements-autres .essai-serie[data-epreuve="${e}"]`)!.innerText;
    expect(ligne(ILE)).toContain(T.pas_classe);
    expect(ligne(SF_CAP)).not.toContain(T.pas_classe);
    // Les capitales, à la demande : leurs épreuves pas encore lues, les deux modes, rien d'autre.
    const chercher = racine.querySelector('#classements-autres .classements-chercher[data-sujet="capitales"]')!;
    expect(chercher.textContent).toBe(T.chercher_places);
    chercher.click();
    await attendre();
    expect(mesPlaces).toHaveBeenCalledTimes(2);
    const lues = mesPlaces.mock.calls[1]![2] as string[];
    expect(lues).toHaveLength(13);
    expect(lues.every((e) => e.split(':')[1] === 'capitales' && e !== CAP_OCE)).toBe(true);
    // La place trouvée passe dans mes places ; le bouton des capitales n'est plus là, celui des pays si.
    expect(lignes('#classements-mes')).toEqual(['general', AFR, CAP_OCE, DRA_OCE, SF_CAP]);
    expect(racine.querySelector('.classements-chercher[data-sujet="capitales"]')).toBeNull();
    expect(racine.querySelector('.classements-chercher[data-sujet="pays"]')).not.toBeNull();
    expect(ligne(idEpreuve('Africa', 'sansfaute', 'capitales'))).toContain(T.pas_classe);
    // Les drapeaux de même : leurs 13 épreuves pas encore lues, la place de Sans faute trouvée.
    racine.querySelector('#classements-autres .classements-chercher[data-sujet="drapeaux"]')!.click();
    await attendre();
    expect(mesPlaces).toHaveBeenCalledTimes(3);
    const luesD = mesPlaces.mock.calls[2]![2] as string[];
    expect(luesD).toHaveLength(13);
    expect(luesD.every((e) => e.split(':')[1] === 'drapeaux' && e !== DRA_OCE)).toBe(true);
    expect(lignes('#classements-mes')).toEqual(['general', AFR, CAP_OCE, DRA_OCE, SF_CAP, SF_DRA]);
    expect(racine.querySelector('.classements-chercher[data-sujet="drapeaux"]')).toBeNull();
    // Gardées comme vues : à la prochaine ouverture, elles se lisent d'office (sans record sur l'appareil).
    mesPlaces.mockClear();
    ouvrir();
    await attendre();
    expect(mesPlaces.mock.calls[0]![2]).toEqual(['general', AFR, CAP_OCE, DRA_OCE, ILE, SF_CAP, SF_DRA]);
    // Un autre pseudo n'hérite pas des places vues de celui-ci.
    localStorage.setItem('terramemo.pseudo', 'Zoé');
    mesPlaces.mockClear();
    ouvrir();
    await attendre();
    expect(mesPlaces.mock.calls[0]![2]).toEqual(['general', AFR, CAP_OCE, DRA_OCE, ILE]);
  });

  it('« Chercher mes places » hors ligne : le bouton le dit et se réessaie', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    records(AFR);
    repondre([place(AFR, 31)]);
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

  it('« Chercher mes places » de deux sujets à la fois : celui en cours reste en cours quand l’autre redessine, et son échec se voit', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    records(AFR);
    repondre([place(AFR, 31)]);
    ouvrir();
    await attendre();
    const reponses: { ok: (v: unknown) => void; ko: (e: unknown) => void }[] = [];
    mesPlaces.mockImplementation(() => new Promise((ok, ko) => reponses.push({ ok, ko })));
    const boutons = (sujet: string) => racine.querySelectorAll(`#classements-autres .classements-chercher[data-sujet="${sujet}"]`);
    boutons('pays')[0]!.click();
    // Tous les boutons des pays (un par mode) disent la lecture en cours.
    expect(boutons('pays').map((b) => [b.disabled, b.textContent])).toEqual(boutons('pays').map(() => [true, T.chargement]));
    boutons('communes')[0]!.click();
    expect(mesPlaces).toHaveBeenCalledTimes(3);
    // Les pays lus : la page se redessine, les communes toujours en cours, sans seconde lecture au toucher.
    reponses[0]!.ok([]);
    await attendre();
    expect(boutons('pays')).toHaveLength(0);
    const communes = boutons('communes');
    expect(communes.map((b) => [b.disabled, b.textContent])).toEqual(communes.map(() => [true, T.chargement]));
    communes[0]!.click();
    expect(mesPlaces).toHaveBeenCalledTimes(3);
    // Hors ligne : l'échec des communes se lit sur les boutons de la page, de nouveau actifs.
    reponses[1]!.ko(new Error('hors ligne'));
    await attendre();
    expect(boutons('communes').map((b) => [b.disabled, b.textContent])).toEqual(boutons('communes').map(() => [false, T.chercher_echec]));
  });

  it('les épreuves des capitales et des drapeaux sous « Capitales » et « Drapeaux », entre Pays et Communes ; rien d’un sujet sans épreuves classées (les mers), même avec un record sur l’appareil', async () => {
    records(idEpreuve('mers', 'chrono', 'mers'));
    ouvrir();
    await attendre();
    const parMode = ['Pays', 'Capitales', 'Drapeaux', 'Communes'];
    expect(sujets('#classements-mes')).toEqual([...parMode, ...parMode]);
    expect(lignes('#classements-mes')).toEqual(['general', ...epreuvesClassees()]);
  });

  it('une ligne ouvre les dix premiers de son épreuve, « ‹ Classements » ramène à la liste', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    records(ILE);
    repondre([place(ILE, 21)]);
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
    repondre([place(AFR, 31)]);
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
    expect(groupes('#classements-mes')).toEqual(['Chrono', 'Sans faute']);
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
    expect(racine.querySelectorAll('#classements-mes .classements-chercher').length).toBe(8);
    mesPlaces.mockRejectedValue(new Error('hors ligne'));
    p = ouvrir();
    await attendre();
    expect(p.innerText).toContain(T.indisponible);
    expect(lignes('#classements-mes')).toHaveLength(EPREUVES_CLASSEES.length + 1);
  });
});
