// Écran de connexion de la première ouverture (src/vues/accueil.ts, décision
// « Écran de connexion ») : quand il vient (choix gardé, session d'un compte,
// stockage en panne), le panneau (en-tête et carte inertes, focus, liens),
// l'invité et son pseudo (validé comme au classement), les écrans des
// comptes montés à la demande (remplacés ici : tests/compte-vue.test.ts les
// éprouve au panneau), et son retour après une déconnexion. DOM factice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effacerJoueurLocal } from '../src/sync/effacement';
import { accueilRequis, CLE_ACCUEIL, creerAccueil, garderChoix, lireChoix, type ComptesDuPanneau, type StockageAccueil } from '../src/vues/accueil';
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
}

/** Le panneau sur le DOM factice ; `echecs` : les premiers montages des comptes qui échouent (hors ligne). */
function monter(m: Montage = {}) {
  const entete = new El('header');
  const zone = new El('main');
  const rendre = vi.fn();
  let etatCompte: 'invite' | 'compte' | 'perdue' = 'invite';
  let echecs = m.echecs ?? 0;
  const element = new El('div');
  element.id = 'faux-comptes';
  const comptes = { element, activer: vi.fn(), desactiver: vi.fn() };
  let ctrl: { fini(): void; surEcran(choix: boolean): void } | null = null;
  const monterComptes = vi.fn(async (a: { fini(): void; surEcran(choix: boolean): void }) => {
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
    expect($('#accueil-invite-texte')!.textContent).toBe(T.invite_texte);
    expect(T.invite_texte).toContain('⚙ › Compte');
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
    expect(m.a.retient('jouer')).toBe(false);
  });

  it('« Retour » : les entrées reviennent, le focus sur « Continuer en invité »', async () => {
    const m = monter();
    await demarrer(m);
    $('#accueil-invite')!.click();
    $('#accueil-retour')!.click();
    expect($('#accueil-choix')!.hidden).toBe(false);
    expect($('#accueil-form-invite')!.hidden).toBe(true);
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
    m.ctrl().fini();
    expect(stockage.get(CLE_ACCUEIL)).toBe('compte');
    expect($('#accueil')).toBeNull();
    expect(m.comptes.desactiver).toHaveBeenCalledOnce();
    expect(m.entete.inert).toBe(false);
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

  it('stockage plein : le choix vaut pour la page, le panneau ne revient pas', async () => {
    const m = monter({ st: { getItem: (k) => stockage.get(k) ?? null, setItem: () => { throw new Error('QuotaExceededError'); } } });
    await demarrer(m);
    $('#accueil-invite')!.click();
    $('#accueil-pseudo')!.value = 'Ana';
    $('#accueil-form-invite')!.emettre('submit', { preventDefault() {} });
    expect($('#accueil')).toBeNull();
    expect(stockage.has(CLE_ACCUEIL)).toBe(false);
    expect(m.a.retient('carte')).toBe(false);
  });
});
