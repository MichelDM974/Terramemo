// Écran de connexion de la première ouverture (src/vues/accueil.ts, décision
// « Écran de connexion ») : quand il vient (choix gardé, session d'un compte,
// stockage en panne), le panneau (en-tête et carte inertes, focus, liens),
// l'invité et son pseudo (validé comme au classement), les écrans des
// comptes montés à la demande (remplacés ici : tests/compte-vue.test.ts les
// éprouve au panneau), son retour après une déconnexion, et celui d'une
// session perdue (quand, pas pendant une partie, ses sorties, pas de boucle).
// DOM factice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effacerJoueurLocal } from '../src/sync/effacement';
import { accueilRequis, CLE_ACCUEIL, creerAccueil, DELAI_SESSION, garderChoix, lireChoix, sessionPerdue, type ComptesDuPanneau, type StockageAccueil } from '../src/vues/accueil';
import { textes } from '../src/vues/textes';
import { El, installerDom, installerStockage } from './dom-factice';

const T = textes.accueil;
const attendre = () => new Promise((r) => setTimeout(r, 0));

let body: El;
let stockage: Map<string, string>;

beforeEach(() => {
  body = installerDom();
  stockage = installerStockage();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const $ = (sel: string) => body.querySelector(sel);

interface Montage {
  st?: StockageAccueil | null;
  echecs?: number;
  /** « Continuer sans compte » des comptes, quand leurs écrans ne viennent pas (session perdue). */
  sansCompte?: () => Promise<void>;
}

/** Le panneau sur le DOM factice ; `echecs` : les premiers montages des comptes qui échouent (hors ligne). */
function monter(m: Montage = {}) {
  const entete = new El('header');
  const jouer = new El('a');
  jouer.id = 'jouer-btn';
  entete.append(jouer);
  const zone = new El('main');
  const rendre = vi.fn();
  let etatCompte: 'invite' | 'compte' | 'perdue' = 'invite';
  let echecs = m.echecs ?? 0;
  const element = new El('div');
  element.id = 'faux-comptes';
  const comptes = { element, activer: vi.fn(), desactiver: vi.fn() };
  type Ctrl = { fini(choix?: 'compte' | 'invite'): void; surEcran(choix: boolean): void; occupe(oui: boolean): void; perdue?: boolean };
  let ctrl: Ctrl | null = null;
  const monterComptes = vi.fn(async (a: Ctrl) => {
    ctrl = a;
    if (echecs > 0) {
      echecs--;
      throw new Error('morceau absent');
    }
    return comptes as unknown as ComptesDuPanneau;
  });
  const st = m.st === undefined ? (localStorage as unknown as StockageAccueil) : m.st;
  const a = creerAccueil({
    hote: body as unknown as HTMLElement,
    entete: entete as unknown as HTMLElement,
    zone: zone as unknown as HTMLElement,
    corps: body as unknown as HTMLElement,
    stockage: () => st,
    logo: '/assets/icone.svg',
    monterComptes,
    rendre,
    etatCompte: () => etatCompte,
    parties: ['toucher', 'chrono', 'quiz'],
    ...(m.sansCompte ? { sansCompte: m.sansCompte } : {}),
  });
  return {
    a,
    entete: entete as El & { inert?: boolean },
    zone: zone as El & { inert?: boolean },
    rendre,
    comptes,
    monterComptes,
    ctrl: () => ctrl!,
    poserEtatCompte: (e: typeof etatCompte) => void (etatCompte = e),
  };
}

/** Démarrage d'un appareil : `compte` dit si sa session connaît un compte. */
async function demarrer(m: ReturnType<typeof monter>, compte = false) {
  await m.a.demarrer(Promise.resolve(compte));
  await attendre();
}

describe('le choix gardé', () => {
  it('lu, gardé ; stockage absent ou qui refuse la lecture : illisible (undefined)', () => {
    const st = new Map<string, string>();
    const s = { getItem: (k: string) => st.get(k) ?? null, setItem: (k: string, v: string) => void st.set(k, v) };
    expect(lireChoix(s)).toBeNull();
    expect(garderChoix(s, 'invite')).toBe(true);
    expect(st.get(CLE_ACCUEIL)).toBe('invite');
    expect(lireChoix(s)).toBe('invite');
    expect(lireChoix(null)).toBeUndefined();
    expect(lireChoix({ getItem: () => { throw new Error('SecurityError'); } })).toBeUndefined();
    expect(garderChoix({ setItem: () => { throw new Error('QuotaExceededError'); } }, 'compte')).toBe(false);
    expect(garderChoix(null, 'compte')).toBe(false);
  });

  it('le panneau vient : comptes visibles, aucun choix gardé (stockage lisible), aucun compte dans la session', () => {
    expect(accueilRequis({ visibles: true, choix: null, compte: false })).toBe(true);
    expect(accueilRequis({ visibles: false, choix: null, compte: false })).toBe(false);
    expect(accueilRequis({ visibles: true, choix: 'invite', compte: false })).toBe(false);
    expect(accueilRequis({ visibles: true, choix: 'compte', compte: false })).toBe(false);
    expect(accueilRequis({ visibles: true, choix: undefined, compte: false })).toBe(false);
    expect(accueilRequis({ visibles: true, choix: null, compte: true })).toBe(false);
  });
});

describe('démarrage', () => {
  it('première ouverture : l’en-tête inerte dès la création (attente), puis le panneau par-dessus la carte', async () => {
    const m = monter();
    expect(m.a.etat()).toBe('attente');
    expect(body.dataset.accueil).toBe('attente');
    expect(m.entete.inert).toBe(true);
    expect(m.zone.inert).toBe(false);
    expect(m.a.retient('jouer')).toBe(true);
    expect(m.a.retient('confidentialite')).toBe(false);
    expect($('#accueil')).toBeNull();
    await demarrer(m);
    expect(m.a.etat()).toBe('ouvert');
    const s = $('#accueil')!;
    expect(s.hidden).toBe(false);
    expect([s.getAttribute('role'), s.getAttribute('aria-modal'), s.getAttribute('aria-labelledby')]).toEqual(['dialog', 'true', 'accueil-titre']);
    expect($('#accueil-titre')!.textContent).toBe(T.titre);
    expect($('#accueil-titre img')!.getAttribute('src')).toBe('/assets/icone.svg');
    // Le titre et l'accroche de la décision « Écran de connexion » (accroche précisée le 11/11).
    expect([T.titre, T.accroche]).toEqual(['Terramemo', 'Deviens bon en géographie, un peu chaque jour.']);
    expect($('#accueil-accroche')!.textContent).toBe(T.accroche);
    expect(body.dataset.accueil).toBe('ouvert');
    expect([m.entete.inert, m.zone.inert]).toEqual([true, true]);
    expect((document as unknown as { activeElement?: El }).activeElement).toBe($('#accueil-titre'));
    // La navigation rend l'adresse : la carte sous le panneau, Confidentialité lisible.
    expect(m.rendre).toHaveBeenCalledOnce();
    expect(['carte', 'jouer', 'compte', 'classement', 'toucher'].map((n) => m.a.retient(n))).toEqual([true, true, true, true, true]);
    expect(m.a.retient('confidentialite')).toBe(false);
    // Les écrans des comptes, montés et activés ; « Continuer en invité » et Confidentialité tout de suite.
    expect(m.monterComptes).toHaveBeenCalledOnce();
    expect($('#accueil-comptes #faux-comptes')).not.toBeNull();
    expect(m.comptes.activer).toHaveBeenCalledOnce();
    expect($('#accueil-invite')!.textContent).toBe(T.invite);
    expect($('#accueil-confidentialite')!.getAttribute('href')).toBe('#confidentialite');
    expect($('#accueil-confidentialite')!.textContent).toBe(textes.confidentialite.lien);
  });

  it('un choix gardé : ni attente ni panneau, l’adresse rendue telle quelle', async () => {
    stockage.set(CLE_ACCUEIL, 'invite');
    const m = monter();
    expect(m.a.etat()).toBe('inactif');
    expect(m.entete.inert).toBeUndefined();
    await demarrer(m);
    expect(m.a.etat()).toBe('ferme');
    expect($('#accueil')).toBeNull();
    expect(m.rendre).not.toHaveBeenCalled();
    expect(m.a.retient('jouer')).toBe(false);
  });

  it('un appareil connecté à un compte ne le voit jamais : le choix « compte » gardé, l’en-tête rendu', async () => {
    const m = monter();
    await demarrer(m, true);
    expect($('#accueil')).toBeNull();
    expect(stockage.get(CLE_ACCUEIL)).toBe('compte');
    expect(m.a.etat()).toBe('ferme');
    expect([m.entete.inert, m.zone.inert, body.dataset.accueil]).toEqual([false, false, undefined]);
    expect(m.rendre).toHaveBeenCalledOnce();
    expect(m.monterComptes).not.toHaveBeenCalled();
  });

  it('session illisible : l’appareil est pris pour un invité, le panneau vient', async () => {
    const m = monter();
    await m.a.demarrer(Promise.reject(new Error('IndexedDB')));
    expect(m.a.etat()).toBe('ouvert');
  });

  it('session qui ne répond jamais (IndexedDB pendue) : invité au bout du délai, le panneau vient, l’en-tête ne reste pas inerte', async () => {
    vi.useFakeTimers();
    try {
      const m = monter();
      const fin = m.a.demarrer(new Promise<boolean>(() => undefined));
      await vi.advanceTimersByTimeAsync(DELAI_SESSION - 1);
      expect(m.a.etat()).toBe('attente');
      await vi.advanceTimersByTimeAsync(1);
      await fin;
      expect(m.a.etat()).toBe('ouvert');
      expect(body.dataset.accueil).toBe('ouvert');
      expect(m.rendre).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('une déconnexion laissée en route, finie au démarrage, retire le choix : le panneau vient', async () => {
    stockage.set(CLE_ACCUEIL, 'compte');
    const m = monter();
    expect(m.a.etat()).toBe('inactif');
    effacerJoueurLocal(localStorage);
    await demarrer(m);
    expect(m.a.etat()).toBe('ouvert');
    expect(m.rendre).toHaveBeenCalledOnce();
  });

  it('stockage absent ou qui refuse la lecture : jamais de panneau, le jeu s’ouvre comme avant', async () => {
    for (const st of [null, { getItem: () => { throw new Error('SecurityError'); }, setItem: () => undefined }]) {
      body.replaceChildren();
      delete body.dataset.accueil;
      const m = monter({ st });
      expect(m.a.etat()).toBe('inactif');
      expect(m.entete.inert).toBeUndefined();
      await demarrer(m);
      expect($('#accueil')).toBeNull();
      expect(m.a.retient('carte')).toBe(false);
      expect(m.rendre).not.toHaveBeenCalled();
    }
  });
});

describe('le panneau', () => {
  it('« Continuer en invité » : le pseudo (autocomplete), refusé comme au classement, puis gardé avec le choix', async () => {
    const m = monter();
    await demarrer(m);
    $('#accueil-invite')!.click();
    expect($('#accueil-choix')!.hidden).toBe(true);
    expect($('#accueil-form-invite')!.hidden).toBe(false);
    const champ = $('#accueil-pseudo')!;
    expect((document as unknown as { activeElement?: El }).activeElement).toBe(champ);
    expect([champ.getAttribute('autocomplete'), champ.getAttribute('maxlength'), champ.value]).toEqual(['nickname', '20', '']);
    expect($('label')!.getAttribute('for')).toBe('accueil-pseudo');
    // Le pseudo seul (12/11 : « trop de blabla ») : ni titre, ni paragraphe, ni aide ; le pied Confidentialité se tait.
    expect($('label')!.textContent).toBe(T.pseudo_libelle);
    expect($('#accueil-form-invite')!.querySelector('h3')).toBeNull();
    expect($('#accueil-form-invite')!.querySelector('.hint')).toBeNull();
    expect(champ.getAttribute('aria-describedby')).toBeNull();
    expect($('#accueil-pied')!.hidden).toBe(true);
    expect($('#accueil-retour')!.className).toBe('lien');
    // Trop court, « / », lettre de fantaisie que les règles refuseraient (clePermise).
    for (const faux of ['a', 'x/y', '𝐌ichel']) {
      champ.value = faux;
      $('#accueil-form-invite')!.emettre('submit', { preventDefault() {} });
      expect([faux, $('#accueil-erreur')!.textContent]).toEqual([faux, textes.chrono.pseudo_invalide]);
      expect(champ.getAttribute('aria-invalid')).toBe('true');
      expect($('#accueil')).not.toBeNull();
    }
    expect(stockage.has('terramemo.pseudo')).toBe(false);
    champ.emettre('input');
    expect([$('#accueil-erreur')!.textContent, champ.getAttribute('aria-invalid')]).toEqual(['', null]);
    champ.value = '  Zoé   Lou ';
    $('#accueil-form-invite')!.emettre('submit', { preventDefault() {} });
    expect(stockage.get('terramemo.pseudo')).toBe('Zoé Lou');
    expect(stockage.get(CLE_ACCUEIL)).toBe('invite');
    expect($('#accueil')).toBeNull();
    expect(m.a.etat()).toBe('ferme');
    expect([m.entete.inert, m.zone.inert, body.dataset.accueil]).toEqual([false, false, undefined]);
    expect(m.comptes.desactiver).toHaveBeenCalledOnce();
    expect(m.rendre).toHaveBeenCalledTimes(2); // ouverture, fermeture : l'adresse affichée rendue
    // Le panneau parti avec le focus : le bouton Jouer de l'en-tête.
    expect((document as unknown as { activeElement?: El }).activeElement).toBe(m.entete.querySelector('#jouer-btn'));
    expect(m.a.retient('jouer')).toBe(false);
  });

  it('« Retour » : les entrées reviennent, le focus sur « Continuer en invité »', async () => {
    const m = monter();
    await demarrer(m);
    $('#accueil-invite')!.click();
    $('#accueil-retour')!.click();
    expect($('#accueil-choix')!.hidden).toBe(false);
    expect($('#accueil-form-invite')!.hidden).toBe(true);
    expect($('#accueil-pied')!.hidden).toBe(false);
    expect((document as unknown as { activeElement?: El }).activeElement).toBe($('#accueil-invite'));
    expect(m.a.etat()).toBe('ouvert');
  });

  it('un joueur qui a déjà des progrès : son pseudo pré-rempli, gardé tel quel', async () => {
    stockage.set('terramemo.pseudo', 'Michel');
    stockage.set('terramemo.chrono.records', '{}');
    const m = monter();
    await demarrer(m);
    $('#accueil-invite')!.click();
    expect($('#accueil-pseudo')!.value).toBe('Michel');
    $('#accueil-form-invite')!.emettre('submit', { preventDefault() {} });
    expect(stockage.get('terramemo.pseudo')).toBe('Michel');
    expect(stockage.get(CLE_ACCUEIL)).toBe('invite');
  });

  it('les comptes : « Continuer en invité » sous les entrées seulement ; un compte connecté ferme le panneau (choix « compte »)', async () => {
    const m = monter();
    await demarrer(m);
    m.ctrl().surEcran(false);
    expect($('#accueil-partie-invite')!.hidden).toBe(true);
    m.ctrl().surEcran(true);
    expect($('#accueil-partie-invite')!.hidden).toBe(false);
    // Une action des comptes en cours (fenêtre de Google) : « Continuer en invité » désactivé.
    m.ctrl().occupe(true);
    expect($('#accueil-invite')!.disabled).toBe(true);
    $('#accueil-invite')!.click();
    expect($('#accueil-form-invite')!.hidden).toBe(true);
    m.ctrl().occupe(false);
    expect($('#accueil-invite')!.disabled).toBe(false);
    m.ctrl().fini();
    expect(stockage.get(CLE_ACCUEIL)).toBe('compte');
    expect($('#accueil')).toBeNull();
    expect(m.comptes.desactiver).toHaveBeenCalledOnce();
    expect(m.entete.inert).toBe(false);
  });

  it('le retour d’Android : le pseudo de l’invité, puis le sous-écran des comptes, se referment ; aux entrées, réduire', async () => {
    const m = monter();
    await demarrer(m);
    $('#accueil-invite')!.click();
    expect(m.a.retour()).toBe('fait');
    expect($('#accueil-form-invite')!.hidden).toBe(true);
    expect($('#accueil-choix')!.hidden).toBe(false);
    // Les comptes disent s'ils ont refermé un sous-écran (formulaire, question D22).
    const retour = vi.fn(() => true);
    (m.comptes as { retour?: () => boolean }).retour = retour;
    expect(m.a.retour()).toBe('fait');
    retour.mockReturnValue(false);
    expect(m.a.retour()).toBe('reduire');
    // Confidentialité ouverte : l'historique y ramène ; panneau fermé : rien du panneau.
    m.a.suivre('confidentialite');
    expect(m.a.retour()).toBeNull();
    m.a.suivre('carte');
    m.ctrl().fini();
    expect(m.a.retour()).toBeNull();
  });

  it('les comptes ne se chargent pas (hors ligne) : un avis et « Réessayer », l’invité toujours possible', async () => {
    const m = monter({ echecs: 1 });
    await demarrer(m);
    expect($('#accueil-comptes-avis')!.textContent).toBe(T.comptes_echec);
    expect($('#accueil-comptes-reessayer')!.hidden).toBe(false);
    expect($('#accueil-partie-invite')!.hidden).toBe(false);
    $('#accueil-comptes-reessayer')!.click();
    await attendre();
    expect(m.monterComptes).toHaveBeenCalledTimes(2);
    expect($('#accueil-comptes #faux-comptes')).not.toBeNull();
    expect($('#accueil-comptes-avis')).toBeNull();
  });

  it('Confidentialité se lit sans avoir choisi : le panneau s’efface, l’en-tête reste inerte ; au retour, le panneau et le lien', async () => {
    const m = monter();
    await demarrer(m);
    m.a.suivre('confidentialite');
    expect($('#accueil')!.hidden).toBe(true);
    expect([m.entete.inert, m.zone.inert, body.dataset.accueil]).toEqual([true, false, 'suspendu']);
    m.a.suivre('carte');
    expect($('#accueil')!.hidden).toBe(false);
    expect([m.entete.inert, m.zone.inert, body.dataset.accueil]).toEqual([true, true, 'ouvert']);
    expect((document as unknown as { activeElement?: El }).activeElement).toBe($('#accueil-confidentialite'));
  });

  it('Confidentialité suivie du formulaire « Créer » : au retour, le focus sur ce lien, pas sur celui du pied', async () => {
    const m = monter();
    await demarrer(m);
    const lien = new El('a');
    lien.setAttribute('href', '#confidentialite');
    lien.id = 'accueil-compte-lien-politique';
    m.comptes.element.append(lien);
    $('#accueil')!.emettre('click', { target: lien });
    m.a.suivre('confidentialite');
    m.a.suivre('carte');
    expect((document as unknown as { activeElement?: El }).activeElement).toBe(lien);
  });

  it('une déconnexion (choix retiré avec le pseudo) : le panneau revient à la vue suivante, pas sur Compte ni Confidentialité', async () => {
    const m = monter();
    await demarrer(m);
    m.ctrl().fini();
    expect(m.a.retient('carte')).toBe(false);
    effacerJoueurLocal(localStorage);
    expect(m.a.retient('compte')).toBe(false);
    expect(m.a.retient('confidentialite')).toBe(false);
    expect($('#accueil')).toBeNull();
    expect(m.a.retient('carte')).toBe(true);
    expect($('#accueil')).not.toBeNull();
    expect(m.monterComptes).toHaveBeenCalledTimes(2);
    // Rouvert depuis la navigation : pas de rendu de plus (elle est en train de rendre).
    expect(m.rendre).toHaveBeenCalledTimes(2);
  });

  it('un compte connecté (état de la page) sans choix gardé ne le revoit pas', async () => {
    const m = monter();
    await demarrer(m);
    m.ctrl().fini();
    stockage.delete(CLE_ACCUEIL);
    m.poserEtatCompte('compte');
    expect(m.a.retient('carte')).toBe(false);
    expect($('#accueil')).toBeNull();
  });

  it('stockage plein : le choix vaut pour la page, le panneau ne revient pas, sauf après un effacement', async () => {
    const m = monter({ st: { getItem: (k) => stockage.get(k) ?? null, setItem: () => { throw new Error('QuotaExceededError'); } } });
    await demarrer(m);
    $('#accueil-invite')!.click();
    $('#accueil-pseudo')!.value = 'Ana';
    $('#accueil-form-invite')!.emettre('submit', { preventDefault() {} });
    expect($('#accueil')).toBeNull();
    expect(stockage.has(CLE_ACCUEIL)).toBe(false);
    expect(m.a.retient('carte')).toBe(false);
    // Une déconnexion dans la même page : le choix en mémoire s'oublie aussi, le panneau revient.
    effacerJoueurLocal(localStorage);
    expect(m.a.retient('carte')).toBe(true);
    expect($('#accueil')).not.toBeNull();
  });
});

// Décision « Écran de connexion », remplacée le 15/11 : une session perdue
// ramène le panneau, avec l'écran de la session perdue des comptes.
describe('session perdue', () => {
  /** Un appareil dont la session connaît un compte (choix « compte » gardé), puis la carte affichée. */
  async function connecte(o: Montage = {}) {
    const m = monter(o);
    await demarrer(m, true);
    expect(m.a.etat()).toBe('ferme');
    expect(stockage.get(CLE_ACCUEIL)).toBe('compte');
    m.a.suivre('carte');
    // L'en-tête rendu une fois, la session lue.
    expect(m.rendre).toHaveBeenCalledOnce();
    m.rendre.mockClear();
    return m;
  }
  /** La session perdue, sue de la page (pont) et dite par main.ts ; les écrans des comptes montés. */
  async function perdre(m: ReturnType<typeof monter>) {
    m.poserEtatCompte('perdue');
    m.a.perdue(true);
    await attendre();
  }
  const ouvertPerdue = (m: ReturnType<typeof monter>) => m.a.etat() === 'ouvert' && m.a.mode() === 'perdue' && $('#accueil') !== null;

  it('ce que main.ts lui dit (sessionPerdue) : perdue pour la page et pour les comptes ; ni une suppression inachevée, ni un invité, ni un compte', () => {
    const PERDUE = { etat: 'perdue', uid: 'u1', adresse: null, fournisseurs: [] };
    expect(sessionPerdue('perdue', PERDUE)).toBe(true);
    // Une suppression inachevée : « perdue » pour la page, réglée dans ⚙ › Compte.
    expect(sessionPerdue('perdue', { etat: 'suppression' })).toBe(false);
    // « Continuer sans compte » ou l'effacement : la page invitée, l'état des comptes pas encore relu.
    expect(sessionPerdue('invite', PERDUE)).toBe(false);
    expect(sessionPerdue('compte', PERDUE)).toBe(false);
    expect(sessionPerdue('compte', { etat: 'compte' })).toBe(false);
    expect(sessionPerdue('invite', { etat: 'invite' })).toBe(false);
    // Les comptes pas encore lus.
    expect(sessionPerdue('perdue', null)).toBe(false);
    expect(sessionPerdue('perdue', undefined)).toBe(false);
  });

  it('à l’ouverture : le panneau par-dessus la carte figée, l’en-tête inerte, l’écran de la session perdue des comptes', async () => {
    const m = await connecte();
    expect(m.rendre).toHaveBeenCalledTimes(0);
    await perdre(m);
    expect(ouvertPerdue(m)).toBe(true);
    expect([m.entete.inert, m.zone.inert, body.dataset.accueil]).toEqual([true, true, 'ouvert']);
    // L'en-tête du panneau et Confidentialité comme au premier affichage ; l'accroche dit la session expirée.
    expect($('#accueil-titre')!.textContent).toBe(T.titre);
    expect($('#accueil-accroche')!.textContent).toBe('Session expirée : reconnecte-toi.');
    expect($('#accueil-confidentialite')).not.toBeNull();
    expect(m.monterComptes).toHaveBeenCalledOnce();
    expect(m.ctrl().perdue).toBe(true);
    expect($('#accueil-comptes #faux-comptes')).not.toBeNull();
    // Ni « ou » ni « Continuer en invité » : « Continuer sans compte » est dans l'écran des comptes.
    expect($('#accueil-partie-invite')!.hidden).toBe(true);
    m.ctrl().surEcran(true);
    expect($('#accueil-partie-invite')!.hidden).toBe(true);
    expect((document as unknown as { activeElement?: El }).activeElement).toBe($('#accueil-titre'));
    expect(m.rendre).toHaveBeenCalledOnce();
    expect(['carte', 'jouer', 'chrono'].map((n) => m.a.retient(n))).toEqual([true, true, true]);
    expect(m.a.retient('confidentialite')).toBe(false);
  });

  it('pendant une partie (Toucher, épreuve classée, quiz) : pas de panneau ; à sa fin, par-dessus le bilan, avant tout « Rejouer »', async () => {
    for (const partie of ['toucher', 'chrono', 'quiz']) {
      body = installerDom();
      stockage = installerStockage();
      const m = await connecte();
      m.a.suivre(partie);
      await perdre(m);
      expect(m.a.etat()).toBe('ferme');
      expect($('#accueil')).toBeNull();
      // La partie continue : la navigation dans sa vue ne l'interrompt pas.
      expect(m.a.retient(partie)).toBe(false);
      expect($('#accueil')).toBeNull();
      // Le bilan affiché (ctx.finDePartie) : le panneau, et la navigation rend la carte dessous (la vue de la
      // partie désactivée, « Rejouer » hors d'atteinte).
      m.a.finDePartie();
      expect(ouvertPerdue(m)).toBe(true);
      expect(m.rendre).toHaveBeenCalledOnce();
      expect(m.a.retient(partie)).toBe(true);
      expect([m.entete.inert, m.zone.inert]).toEqual([true, true]);
      // Une seconde fin (une autre vue qui le dirait) n'y change rien.
      m.a.finDePartie();
      expect(m.rendre).toHaveBeenCalledOnce();
    }
  });

  it('une partie quittée en route (vers Jouer, la carte) : le panneau à la vue suivante ; ni sur Compte ni sur Confidentialité', async () => {
    const m = await connecte();
    m.a.suivre('chrono');
    await perdre(m);
    // Ni sur Compte (qui montre la session perdue) ni sur Confidentialité.
    expect(m.a.retient('compte')).toBe(false);
    expect(m.a.retient('confidentialite')).toBe(false);
    expect($('#accueil')).toBeNull();
    expect(m.a.retient('jouer')).toBe(true);
    expect(ouvertPerdue(m)).toBe(true);
    // Rouvert depuis la navigation : pas de rendu de plus (elle est en train de rendre).
    expect(m.rendre).toHaveBeenCalledTimes(0);
  });

  it('une fin de partie sans session perdue, ou la session réglée entre-temps : pas de panneau', async () => {
    const m = await connecte();
    m.a.suivre('chrono');
    m.a.finDePartie();
    expect($('#accueil')).toBeNull();
    await perdre(m);
    m.poserEtatCompte('compte');
    m.a.perdue(false);
    m.a.finDePartie();
    expect($('#accueil')).toBeNull();
    expect(m.rendre).toHaveBeenCalledTimes(0);
  });

  it('reconnecté (Google ou e-mail, question D22 comprise) : le panneau se ferme, et ne revient pas', async () => {
    const m = await connecte();
    await perdre(m);
    m.poserEtatCompte('compte');
    m.ctrl().fini('compte');
    expect(m.a.etat()).toBe('ferme');
    expect($('#accueil')).toBeNull();
    expect([m.entete.inert, m.zone.inert, body.dataset.accueil]).toEqual([false, false, undefined]);
    expect(stockage.get(CLE_ACCUEIL)).toBe('compte');
    expect(m.comptes.desactiver).toHaveBeenCalledOnce();
    m.a.perdue(false);
    expect(['carte', 'jouer', 'classement'].map((n) => m.a.retient(n))).toEqual([false, false, false]);
    expect($('#accueil')).toBeNull();
    // Une nouvelle perte, plus tard dans la page : il revient.
    await perdre(m);
    expect(ouvertPerdue(m)).toBe(true);
  });

  it('« Continuer sans compte » : fermé, l’appareil invité avec ses progrès (choix « invite »), jamais de retour', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const m = await connecte();
    await perdre(m);
    m.poserEtatCompte('invite');
    m.ctrl().fini('invite');
    expect(m.a.etat()).toBe('ferme');
    expect($('#accueil')).toBeNull();
    expect(stockage.get(CLE_ACCUEIL)).toBe('invite');
    expect(localStorage.getItem('terramemo.pseudo')).toBe('Ana');
    m.a.perdue(false);
    expect(['carte', 'jouer'].map((n) => m.a.retient(n))).toEqual([false, false]);
    expect($('#accueil')).toBeNull();
  });

  it('« Effacer cet appareil » : le panneau du premier affichage à la place, comme après une déconnexion', async () => {
    const m = await connecte();
    await perdre(m);
    effacerJoueurLocal(localStorage);
    m.poserEtatCompte('invite');
    m.ctrl().fini('invite');
    expect(m.a.etat()).toBe('ouvert');
    expect(m.a.mode()).toBe('premier');
    expect($('#accueil-accroche')!.textContent).toBe(T.accroche);
    expect(m.monterComptes).toHaveBeenCalledTimes(2);
    expect(m.ctrl().perdue).toBeUndefined();
    expect($('#accueil-partie-invite')!.hidden).toBe(false);
    expect(m.comptes.desactiver).toHaveBeenCalledOnce();
    // Puis le choix de l'invité, comme sur un appareil neuf : fermé pour de bon.
    $('#accueil-invite')!.click();
    $('#accueil-pseudo')!.value = 'Lou';
    $('#accueil-form-invite')!.emettre('submit', { preventDefault() {} });
    expect($('#accueil')).toBeNull();
    expect(stockage.get(CLE_ACCUEIL)).toBe('invite');
    m.a.perdue(false);
    expect(m.a.retient('carte')).toBe(false);
  });

  it('refermé sans que la session soit réglée : pas de boucle, jusqu’à ce qu’elle l’ait été', async () => {
    const m = await connecte();
    await perdre(m);
    m.ctrl().fini('compte');
    expect($('#accueil')).toBeNull();
    expect(['carte', 'jouer', 'carte'].map((n) => m.a.retient(n))).toEqual([false, false, false]);
    m.a.perdue(true);
    expect($('#accueil')).toBeNull();
    // Réglée (reconnectée ailleurs), puis perdue à nouveau : le panneau revient.
    m.a.perdue(false);
    m.a.perdue(true);
    expect(ouvertPerdue(m)).toBe(true);
  });

  it('un invité ou un compte valide : jamais de panneau ; garde-fou : un perdue(vrai) que l’état de la page ne confirme plus, non plus', async () => {
    const m = await connecte();
    m.a.perdue(false);
    expect(m.a.retient('carte')).toBe(false);
    m.poserEtatCompte('compte');
    m.a.perdue(true);
    expect($('#accueil')).toBeNull();
    expect(m.a.retient('jouer')).toBe(false);
    m.poserEtatCompte('invite');
    expect(m.a.retient('carte')).toBe(false);
    expect($('#accueil')).toBeNull();
  });

  it('le panneau du premier affichage ouvert : la session perdue attend sa fermeture ; stockage illisible : jamais', async () => {
    const m = monter();
    await demarrer(m);
    m.a.suivre('carte');
    m.poserEtatCompte('perdue');
    m.a.perdue(true);
    expect(m.a.mode()).toBe('premier');
    m.ctrl().fini();
    expect(m.a.retient('carte')).toBe(true);
    expect(ouvertPerdue(m)).toBe(true);

    const n = monter({ st: null });
    await demarrer(n, true);
    n.poserEtatCompte('perdue');
    n.a.perdue(true);
    expect(n.a.etat()).toBe('inactif');
    expect(n.a.retient('carte')).toBe(false);
  });

  it('les écrans des comptes ne viennent pas (hors ligne) : « Réessayer », et « Continuer sans compte » des comptes', async () => {
    const sansCompte = vi.fn(async () => undefined);
    const m = await connecte({ echecs: 1, sansCompte });
    await perdre(m);
    await attendre();
    expect($('#accueil-comptes-avis')!.textContent).toBe(T.comptes_echec_perdue);
    expect($('#accueil-comptes-reessayer')!.hidden).toBe(false);
    expect($('#accueil-partie-invite')!.hidden).toBe(false);
    expect($('#accueil-invite')!.textContent).toBe(textes.compte.continuer_sans);
    $('#accueil-invite')!.click();
    expect(sansCompte).toHaveBeenCalledOnce();
    // Rien de demandé : pas de pseudo, les progrès restent.
    expect($('#accueil-form-invite')!.hidden).toBe(true);
    m.poserEtatCompte('invite');
    await attendre();
    expect($('#accueil')).toBeNull();
    expect(stockage.get(CLE_ACCUEIL)).toBe('invite');
  });

  it('« Continuer sans compte » qui échoue : le panneau reste, l’avis le dit', async () => {
    const m = await connecte({ echecs: 1, sansCompte: async () => { throw new Error('IndexedDB'); } });
    await perdre(m);
    await attendre();
    $('#accueil-invite')!.click();
    await attendre();
    expect(ouvertPerdue(m)).toBe(true);
    expect($('#accueil-invite')!.disabled).toBe(false);
    expect($('#accueil-comptes-avis')!.textContent).toBe(T.comptes_echec_perdue);
  });
});
