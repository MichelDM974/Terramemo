// Vue Compte (src/vues/compte.ts, J1b lot 1) : écrans et parcours sur un
// DOM factice (tests/dom-factice.ts), avec des comptes remplacés (le vrai
// src/sync/comptes.ts est éprouvé sur l'émulateur, tests/comptes.test.ts).
// Puis vueALaDemande (src/vues/a-la-demande.ts) : le morceau chargé à
// l'ouverture, un avis et « Réessayer » s'il ne vient pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comptes, EtatCompte } from '../src/sync/comptes';
import { CLE_SANS_SYNCHRO } from '../src/sync/drapeaux';
import { vueALaDemande } from '../src/vues/a-la-demande';
import { textePerdue, vueCompte } from '../src/vues/compte';
import type { Vue } from '../src/vues/commun';
import { textes } from '../src/vues/textes';
import { installerDom, installerStockage, type El } from './dom-factice';

const T = textes.compte;
const attendre = () => new Promise((r) => setTimeout(r, 0));
const err = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

/** Des comptes en mémoire : un état, et chaque méthode espionnée. */
function fauxComptes(depart: EtatCompte = { etat: 'invite', anonyme: false }) {
  let etat = depart;
  const c = {
    etat: vi.fn(async () => etat),
    creer: vi.fn(async (adresse: string) => {
      etat = { etat: 'compte', uid: 'u1', adresse, verifiee: false, fournisseurs: ['password'] };
      return { adresse, verification: true };
    }),
    connecter: vi.fn(async (adresse: string) => {
      etat = { etat: 'compte', uid: 'u1', adresse, verifiee: true, fournisseurs: ['password'] };
      return { adresse };
    }),
    oublier: vi.fn(async () => undefined),
    renvoyer: vi.fn(async () => ({ adresse: 'a@exemple.fr' })),
    changerMotDePasse: vi.fn(async () => undefined),
    deconnecter: vi.fn(async () => {
      etat = { etat: 'invite', anonyme: false };
    }),
    continuerSansCompte: vi.fn(async () => {
      etat = { etat: 'invite', anonyme: false };
    }),
    surChangement: vi.fn(() => () => true),
    demarrer: vi.fn(async () => etat),
    rapport: vi.fn(() => ({ etat, jeton: null, erreurs: [] })),
    poser(e: EtatCompte) {
      etat = e;
    },
  };
  return c as typeof c & Comptes;
}

let zone: El;
let masquee: boolean[];
const ctx = () => ({ zone, carte: { masquer: (m: boolean) => masquee.push(m) } }) as never;
const $ = (sel: string) => zone.querySelector(sel);
const contenu = () => $('#compte-contenu')!.innerText;
const envoyer = (id: string) => $(id)!.emettre('submit', { preventDefault() {} });

beforeEach(() => {
  installerDom();
  installerStockage();
  zone = document.createElement('main') as unknown as El;
  masquee = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function ouvrir(c: Comptes, seances?: () => Promise<number>): Promise<Vue> {
  const v = vueCompte(ctx(), { retour: vi.fn(), comptes: async () => c, seances });
  v.activer();
  await attendre();
  await attendre();
  return v;
}

describe('vue Compte', () => {
  it('invité : ses progrès restent sur l’appareil, se connecter ou créer un compte ; pas de Google au lot 1', async () => {
    const c = fauxComptes();
    await ouvrir(c);
    expect(masquee).toEqual([true]);
    expect(contenu()).toContain(T.invite);
    expect($('#compte-vers-connecter')!.textContent).toBe(T.se_connecter_email);
    expect($('#compte-vers-connecter')!.className).toBe(''); // le bouton principal, en accent
    expect($('#compte-vers-creer')!.className).toBe('secondary');
    expect(contenu()).not.toContain(T.google);
    expect($('#compte-synchro')!.hidden).toBe(true);
  });

  it('créer : champs pour le remplissage automatique, mot de passe montré ou masqué', async () => {
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-vers-creer')!.click();
    const a = $('#compte-adresse')!;
    expect([a.getAttribute('type'), a.getAttribute('autocomplete'), a.getAttribute('inputmode')]).toEqual(['email', 'email', 'email']);
    const m = $('#compte-mdp')!;
    expect([m.getAttribute('type'), m.getAttribute('autocomplete')]).toEqual(['password', 'new-password']);
    $('#compte-mdp-voir')!.click();
    expect(m.getAttribute('type')).toBe('text');
    expect($('#compte-mdp-voir')!.textContent).toBe(T.masquer);
    $('#compte-mdp-voir')!.click();
    expect(m.getAttribute('type')).toBe('password');
  });

  it('créer : le compte, le message de l’e-mail parti, puis l’écran du compte (adresse non vérifiée)', async () => {
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-vers-creer')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-creer');
    await attendre();
    await attendre();
    expect(c.creer).toHaveBeenCalledWith('ana@exemple.fr', 'motdepasse');
    expect($('#compte-message')!.textContent).toBe('Compte créé. Un e-mail de vérification est parti à ana@exemple.fr.');
    expect($('#compte-adresse-connectee')!.textContent).toBe('ana@exemple.fr');
    expect($('#compte-non-verifiee')!.innerText).toContain(T.non_verifiee);
    $('#compte-renvoyer')!.click();
    await attendre();
    expect(c.renvoyer).toHaveBeenCalled();
    expect($('#compte-message')!.textContent).toBe('E-mail de vérification renvoyé à a@exemple.fr.');
  });

  it('créer une adresse déjà prise : vers « Se connecter », adresse pré-remplie, l’avis gardé', async () => {
    const c = fauxComptes();
    c.creer.mockRejectedValueOnce(err('auth/email-already-in-use'));
    await ouvrir(c);
    $('#compte-vers-creer')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-creer');
    await attendre();
    expect($('#compte-form-connecter')).not.toBeNull();
    expect($('#compte-adresse')!.value).toBe('ana@exemple.fr');
    expect($('#compte-mdp')!.getAttribute('autocomplete')).toBe('current-password');
    expect($('#compte-erreur')!.textContent).toBe('Un compte existe déjà avec cette adresse : connecte-toi');
  });

  it('une erreur traduite, les boutons rendus après l’appel', async () => {
    const c = fauxComptes();
    let rejeter!: (e: unknown) => void;
    c.connecter.mockImplementationOnce(() => new Promise((_, ko) => (rejeter = ko)));
    await ouvrir(c);
    $('#compte-vers-connecter')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'faux';
    envoyer('#compte-form-connecter');
    await attendre();
    expect($('#compte-connecter-ok')!.disabled).toBe(true);
    envoyer('#compte-form-connecter'); // un second envoi pendant l'appel : ignoré
    expect(c.connecter).toHaveBeenCalledTimes(1);
    rejeter(err('auth/invalid-credential'));
    await attendre();
    await attendre();
    expect($('#compte-erreur')!.textContent).toBe('Adresse ou mot de passe incorrect');
    expect($('#compte-connecter-ok')!.disabled).toBe(false);
    expect($('#compte-erreur')!.textContent).not.toMatch(/Firebase/);
  });

  it('se connecter, mot de passe oublié (message générique), lien vers la création', async () => {
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-vers-connecter')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-oubli')!.click();
    await attendre();
    expect(c.oublier).toHaveBeenCalledWith('ana@exemple.fr');
    expect($('#compte-message')!.textContent).toBe(T.oubli_envoye);
    $('#compte-vers-creer')!.click();
    expect($('#compte-form-creer')).not.toBeNull();
    expect($('#compte-adresse')!.value).toBe('ana@exemple.fr');
    $('#compte-deja')!.click();
    $('#compte-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-connecter');
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe('Connecté : ana@exemple.fr.');
    expect($('#compte-non-verifiee')).toBeNull();
  });

  it('compte : changer le mot de passe (identifiant caché pour le gestionnaire), se déconnecter', async () => {
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    await ouvrir(c);
    $('#compte-vers-mdp')!.click();
    const nom = zone.querySelector('input[autocomplete="username"]')!;
    expect(nom.value).toBe('ana@exemple.fr');
    expect($('#compte-mdp-actuel')!.getAttribute('autocomplete')).toBe('current-password');
    expect($('#compte-mdp-nouveau')!.getAttribute('autocomplete')).toBe('new-password');
    $('#compte-mdp-actuel')!.value = 'ancien-mdp';
    $('#compte-mdp-nouveau')!.value = 'nouveau-mdp';
    envoyer('#compte-form-mdp');
    await attendre();
    await attendre();
    expect(c.changerMotDePasse).toHaveBeenCalledWith('ancien-mdp', 'nouveau-mdp');
    expect($('#compte-message')!.textContent).toBe(T.mdp_change);
    $('#compte-deconnecter')!.click();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe(T.deconnecte);
    expect(contenu()).toContain(T.invite);
  });

  it('compte Google seul : ni mot de passe à changer ni adresse à vérifier', async () => {
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@gmail.com', verifiee: false, fournisseurs: ['google.com'] });
    await ouvrir(c);
    expect($('#compte-adresse-connectee')!.textContent).toBe('Compte Google (ana@gmail.com)');
    expect($('#compte-vers-mdp')).toBeNull();
    expect($('#compte-non-verifiee')).toBeNull();
  });

  it('session perdue : le nombre de séances, se reconnecter (adresse pré-remplie) ou continuer sans compte', async () => {
    const c = fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr' });
    await ouvrir(c, async () => 3);
    expect($('#compte-perdue')!.textContent).toBe('Session expirée : reconnecte-toi pour envoyer 3 séances.');
    $('#compte-reconnecter')!.click();
    expect($('#compte-adresse')!.value).toBe('ana@exemple.fr');
    $('#compte-annuler')!.click();
    $('#compte-sans-compte')!.click();
    expect(contenu()).toContain(T.continuer_sans_confirmer);
    $('#compte-sans-compte-ok')!.click();
    await attendre();
    await attendre();
    expect(c.continuerSansCompte).toHaveBeenCalled();
    expect($('#compte-message')!.textContent).toBe(T.sans_compte);
    expect(contenu()).toContain(T.invite);
  });

  it('textePerdue : singulier, pluriel, inconnu', () => {
    expect(textePerdue(1)).toBe('Session expirée : reconnecte-toi pour envoyer 1 séance.');
    expect(textePerdue(4)).toBe('Session expirée : reconnecte-toi pour envoyer 4 séances.');
    expect(textePerdue(0)).toBe(T.perdue_aucune);
    expect(textePerdue(null)).toBe(T.perdue_aucune);
  });

  it('Firebase injoignable : l’avis, puis « Réessayer »', async () => {
    const c = fauxComptes();
    let echoue = true;
    const v = vueCompte(ctx(), {
      retour: vi.fn(),
      comptes: async () => {
        if (echoue) throw err('auth/network-request-failed');
        return c;
      },
    });
    v.activer();
    await attendre();
    expect(contenu()).toContain(T.chargement_echec);
    expect($('#compte-erreur')!.textContent).toBe('Réseau injoignable');
    echoue = false;
    $('#compte-recharger')!.click();
    await attendre();
    await attendre();
    expect(contenu()).toContain(T.invite);
  });

  it('synchro coupée (drapeau du driver) : dit dans la vue', async () => {
    localStorage.setItem(CLE_SANS_SYNCHRO, '1');
    await ouvrir(fauxComptes());
    expect($('#compte-synchro')!.hidden).toBe(false);
    expect($('#compte-synchro')!.textContent).toBe(T.synchro_coupee);
  });

  it('retour au premier plan sous un formulaire ouvert : la saisie reste', async () => {
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-vers-creer')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'motdepasse';
    (document as unknown as El).emettre('visibilitychange');
    await attendre();
    expect(c.etat).toHaveBeenCalledTimes(2);
    expect($('#compte-adresse')!.value).toBe('ana@exemple.fr');
    expect($('#compte-mdp')!.value).toBe('motdepasse');
  });

  it('les avis ne restent pas : effacés à la réouverture et en quittant l’écran invité', async () => {
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    const v = await ouvrir(c);
    $('#compte-deconnecter')!.click();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe(T.deconnecte);
    $('#compte-vers-connecter')!.click();
    expect($('#compte-message')!.textContent).toBe('');
    v.desactiver();
    c.poser({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    $('#compte-erreur')!.textContent = 'ancienne erreur';
    v.activer();
    expect($('#compte-erreur')!.textContent).toBe('');
  });

  it('le libellé nomme le champ sans le bouton « Montrer » (hors du label)', async () => {
    await ouvrir(fauxComptes());
    $('#compte-vers-creer')!.click();
    const label = zone.querySelector('label[for="compte-mdp"]')!;
    expect(label.textContent).toBe(T.mdp);
    expect(label.querySelector('#compte-mdp-voir')).toBeNull();
  });

  it('relue au retour au premier plan, pas une fois fermée', async () => {
    const c = fauxComptes();
    const v = await ouvrir(c);
    expect(c.etat).toHaveBeenCalledTimes(1);
    (document as unknown as El).emettre('visibilitychange');
    await attendre();
    expect(c.etat).toHaveBeenCalledTimes(2);
    v.desactiver();
    expect(masquee).toEqual([true, false]);
    (document as unknown as El).emettre('visibilitychange');
    await attendre();
    expect(c.etat).toHaveBeenCalledTimes(2);
  });
});

describe('vueALaDemande', () => {
  const TX = { titre: 'Compte', chargement: 'Chargement…', echec: 'Hors ligne ?', reessayer: 'Réessayer', retour: 'Retour' };

  it('« Chargement… » tout de suite, puis la vue chargée', async () => {
    const vraie = { activer: vi.fn(), desactiver: vi.fn() };
    let livrer!: (v: Vue) => void;
    const charger = vi.fn(() => new Promise<Vue>((ok) => (livrer = ok)));
    const v = vueALaDemande(ctx(), 'compte', TX, charger, vi.fn());
    v.activer();
    expect($('#compte-attente')!.hidden).toBe(false);
    expect($('#compte-attente')!.innerText).toContain('Chargement…');
    livrer(vraie);
    await attendre();
    expect(vraie.activer).toHaveBeenCalledTimes(1);
    expect($('#compte-attente')!.hidden).toBe(true);
    v.desactiver();
    v.activer();
    expect(vraie.desactiver).toHaveBeenCalledTimes(1);
    expect(vraie.activer).toHaveBeenCalledTimes(2);
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('rouverte pendant le chargement : un seul chargement, une seule activation', async () => {
    const vraie = { activer: vi.fn(), desactiver: vi.fn() };
    let livrer!: (v: Vue) => void;
    const charger = vi.fn(() => new Promise<Vue>((ok) => (livrer = ok)));
    const v = vueALaDemande(ctx(), 'compte', TX, charger, vi.fn());
    v.activer();
    v.desactiver();
    v.activer();
    livrer(vraie);
    await attendre();
    expect(charger).toHaveBeenCalledTimes(1);
    expect(vraie.activer).toHaveBeenCalledTimes(1);
  });

  it('fermée pendant le chargement : la vue n’est pas ouverte en arrivant', async () => {
    const vraie = { activer: vi.fn(), desactiver: vi.fn() };
    let livrer!: (v: Vue) => void;
    const v = vueALaDemande(ctx(), 'compte', TX, () => new Promise<Vue>((ok) => (livrer = ok)), vi.fn());
    v.activer();
    v.desactiver();
    livrer(vraie);
    await attendre();
    expect(vraie.activer).not.toHaveBeenCalled();
    expect(masquee).toEqual([true, false]);
  });

  it('morceau absent (hors ligne) : l’avis et « Réessayer », qui recharge', async () => {
    const vraie = { activer: vi.fn(), desactiver: vi.fn() };
    const charger = vi.fn<() => Promise<Vue>>().mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module')).mockResolvedValueOnce(vraie);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const retour = vi.fn();
    const v = vueALaDemande(ctx(), 'compte', TX, charger, retour);
    v.activer();
    await attendre();
    expect($('#compte-attente')!.innerText).toContain('Hors ligne ?');
    expect($('#compte-reessayer')!.hidden).toBe(false);
    $('#compte-reessayer')!.click();
    await attendre();
    expect(vraie.activer).toHaveBeenCalled();
    expect(charger).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
