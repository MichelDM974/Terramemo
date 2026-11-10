// Vue Compte (src/vues/compte.ts, J1b lots 1 à 6) : écrans et parcours sur un
// DOM factice (tests/dom-factice.ts), avec des comptes remplacés (le vrai
// src/sync/comptes.ts est éprouvé sur l'émulateur, tests/comptes.test.ts).
// Puis vueALaDemande (src/vues/a-la-demande.ts) : le morceau chargé à
// l'ouverture, un avis et « Réessayer » s'il ne vient pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChoixFusion, Comptes, EtatCompte, QuestionFusion, ResultatDeconnexion, ResultatProfil } from '../src/sync/comptes';
import { CLE_SANS_SYNCHRO } from '../src/sync/drapeaux';
import type { ComptesSynchro, EtatSynchro, ResultatEnvoi } from '../src/sync/envoi';
import { vueALaDemande } from '../src/vues/a-la-demande';
import { accueilCompte, adresseGmail, detailProgres, texteGoogle, textePerdue, textePseudoDuCompte, texteQuestion, texteSynchro, textesDeconnexion, vueCompte } from '../src/vues/compte';
import type { Vue } from '../src/vues/commun';
import { remplir, textes } from '../src/vues/textes';
import { installerDom, installerStockage, type El } from './dom-factice';

const T = textes.compte;
const attendre = () => new Promise((r) => setTimeout(r, 0));
const err = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

const PROFIL: ResultatProfil = { etat: 'a_jour', pseudo: null, ancienPseudo: null, recus: 0, envoyes: 0, quand: 0 };
let profilConnexion: ResultatProfil = PROFIL;
let etatChangement: ResultatProfil['etat'] = 'ecrit';
/** La question de fusion que la prochaine connexion pose (lot 4), et ce qu'une déconnexion n'a pas pu envoyer. */
let questionConnexion: QuestionFusion | null = null;
let resteDeconnexion: Extract<ResultatDeconnexion, { fait: false }> | null = null;
/** L'erreur que lève la connexion ou la création après la réponse à la question (lot 4). */
let echecApres: Error | null = null;
/** L'erreur d'une suppression coupée en route (lot 5) : le drapeau reste posé. */
let coupureSuppression: Error | null = null;
/** Le pseudo du profil en ligne que la demande de retrait portera (lot 5, comptes.pseudoDemande). */
let pseudoEnLigne: { lu: boolean; pseudo: string | null } = { lu: true, pseudo: null };
/** Lot 6 : Google se propose (site ; APK une fois le plugin branché), et ce que donne sa fenêtre. */
let googleOffert = true;
let googleNouveau = true;
let echecGoogle: Error | null = null;

/** Des comptes en mémoire : un état, et chaque méthode espionnée. */
function fauxComptes(depart: EtatCompte = { etat: 'invite', anonyme: false }) {
  let etat = depart;
  const c = {
    etat: vi.fn(async () => etat),
    creer: vi.fn(async (adresse: string, _mdp?: string, choisir?: (q: QuestionFusion) => Promise<ChoixFusion>) => {
      if (questionConnexion && choisir) {
        const choix = await choisir(questionConnexion);
        if (choix === 'annuler') throw Object.assign(new Error('annulée'), { code: 'terramemo/connexion-annulee' });
      }
      if (echecApres) throw echecApres;
      etat = { etat: 'compte', uid: 'u1', adresse, verifiee: false, fournisseurs: ['password'] };
      return { adresse, verification: true, fusion: 'sans_question' };
    }),
    connecter: vi.fn(async (adresse: string, _mdp?: string, choisir?: (q: QuestionFusion) => Promise<ChoixFusion>) => {
      const q = questionConnexion;
      const choix = q && choisir ? await choisir(q) : 'ajouter';
      if (choix === 'annuler') throw Object.assign(new Error('annulée'), { code: 'terramemo/connexion-annulee' });
      if (echecApres) throw echecApres;
      etat = { etat: 'compte', uid: 'u1', adresse, verifiee: true, fournisseurs: ['password'] };
      return { adresse, profil: profilConnexion, fusion: !q ? 'sans_question' : choix === 'effacer' ? 'efface' : 'ajoute', reponses: q?.reponses ?? 0 };
    }),
    /** Lot 6 : « Continuer avec Google » ; `echecGoogle` à la fenêtre, puis la question comme connecter. */
    google: vi.fn(async (choisir?: (q: QuestionFusion) => Promise<ChoixFusion>) => {
      if (echecGoogle) throw echecGoogle;
      const q = questionConnexion;
      const choix = q && choisir ? await choisir(q) : 'ajouter';
      if (choix === 'annuler') throw Object.assign(new Error('annulée'), { code: 'terramemo/connexion-annulee' });
      if (echecApres) throw echecApres;
      etat = { etat: 'compte', uid: 'g1', adresse: 'ana@gmail.com', verifiee: true, fournisseurs: ['google.com'] };
      const fusion = !q ? 'sans_question' : choix === 'effacer' ? 'efface' : 'ajoute';
      return { adresse: 'ana@gmail.com', profil: profilConnexion, fusion, reponses: q && choix === 'ajouter' ? q.reponses : 0, nouveau: googleNouveau };
    }),
    googleOffert: vi.fn(() => googleOffert),
    changerPseudo: vi.fn(async (pseudo: string) => {
      localStorage.setItem('terramemo.pseudo', pseudo);
      return { ...PROFIL, pseudo, etat: etatChangement };
    }),
    oublier: vi.fn(async () => undefined),
    renvoyer: vi.fn(async () => ({ adresse: 'a@exemple.fr' })),
    changerMotDePasse: vi.fn(async () => undefined),
    deconnecter: vi.fn(async (o: { quandMeme?: boolean } = {}): Promise<ResultatDeconnexion> => {
      if (resteDeconnexion && !o.quandMeme) return resteDeconnexion;
      etat = { etat: 'invite', anonyme: false };
      return { fait: true };
    }),
    effacerAppareil: vi.fn(async () => {
      etat = { etat: 'invite', anonyme: false };
    }),
    reponsesAppareil: vi.fn(async () => 42),
    continuerSansCompte: vi.fn(async () => {
      etat = { etat: 'invite', anonyme: false };
    }),
    /** Lot 5 : une suppression réussie rend l'appareil invité ; `coupureSuppression` la coupe en route. */
    supprimer: vi.fn(async (_c: { mot: string; mdp?: string }) => {
      if (coupureSuppression) {
        const u = etat.etat === 'compte' || etat.etat === 'suppression' ? etat.uid : 'u1';
        etat = { etat: 'suppression', uid: u, adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: true, horsAuth: false };
        throw coupureSuppression;
      }
      etat = { etat: 'invite', anonyme: false };
    }),
    pseudoDemande: vi.fn(async () => pseudoEnLigne),
    annulerSuppression: vi.fn(async () => {
      if (etat.etat === 'suppression') etat = { etat: 'compte', uid: etat.uid, adresse: etat.adresse, verifiee: true, fournisseurs: etat.fournisseurs };
    }),
    abandonnerSuppression: vi.fn(async () => {
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
  profilConnexion = PROFIL;
  etatChangement = 'ecrit';
  questionConnexion = null;
  resteDeconnexion = null;
  echecApres = null;
  coupureSuppression = null;
  pseudoEnLigne = { lu: true, pseudo: null };
  googleOffert = true;
  googleNouveau = true;
  echecGoogle = null;
  zone = document.createElement('main') as unknown as El;
  masquee = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Un envoi en mémoire (lot 3) : l'état de la synchro, les séances non envoyées, « Réessayer » qui relance tout. */
function fauxEnvoi(depart: Partial<EtatSynchro> = {}, nonEnvoyees = 0) {
  let etat: EtatSynchro = { coupee: false, attente: 0, refusees: 0, horsLigne: false, aRelire: 0, ...depart };
  const abonnes = new Set<() => void>();
  const passe = () => abonnes.forEach((f) => f());
  const fini: ResultatEnvoi = { etat: 'fait', composes: 0, envoyes: 1, presents: 0, refuses: 0, arret: null, quand: 0, lecture: null };
  return {
    etat: vi.fn(async (_uid: string) => etat),
    compter: vi.fn(async (_uid: string): Promise<ComptesSynchro> => ({ evenements: 9, horsLots: 0, attente: 0, refusees: 0, nonEnvoyees, reponsesHorsLots: 0, lots: { a_envoyer: 0, envoye: 0, en_ligne: 0, refuse: 0 }, aRelire: { lots: 0, reponses: 0 } })),
    declencher: vi.fn(async () => {
      etat = { ...etat, refusees: 0, attente: 0, horsLigne: false };
      passe();
      return fini;
    }),
    surPasse: vi.fn((f: () => void) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    }),
    /** Une passe venue d'ailleurs (clôture d'une séance) : l'état change, les abonnés sont prévenus. */
    poser(e: Partial<EtatSynchro>) {
      etat = { ...etat, ...e };
      passe();
    },
  };
}

async function ouvrir(c: Comptes, envoi?: ReturnType<typeof fauxEnvoi>): Promise<Vue> {
  const v = vueCompte(ctx(), { retour: vi.fn(), comptes: async () => c, envoi: envoi && (async () => envoi) });
  v.activer();
  await attendre();
  await attendre();
  return v;
}

describe('vue Compte', () => {
  it('invité : ses progrès restent sur l’appareil ; Google en premier (lot 6), se connecter par e-mail ou créer un compte', async () => {
    const c = fauxComptes();
    await ouvrir(c);
    expect(masquee).toEqual([true]);
    expect(contenu()).toContain(T.invite);
    const boutons = $('.compte-actions')!.querySelectorAll('button');
    expect(boutons.map((b) => b.id)).toEqual(['compte-google', 'compte-vers-connecter', 'compte-vers-creer']);
    expect($('#compte-google')!.textContent).toBe(T.google);
    expect($('#compte-google')!.className).toBe(''); // le seul bouton principal, en accent
    expect($('#compte-vers-connecter')!.textContent).toBe(T.se_connecter_email);
    expect($('#compte-vers-connecter')!.className).toBe('secondary');
    expect($('#compte-vers-creer')!.className).toBe('secondary');
    // La fenêtre de Google nomme le domaine de Firebase, pas Terramemo (marque non vérifiée, D30).
    expect($('#compte-google-aide')!.textContent).toBe(T.google_site);
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
    // La politique de confidentialité, avant de créer le compte (lot 5, § 3.2).
    expect($('#compte-politique')!.textContent).toBe(`${T.politique}${T.politique_lien}`);
    expect($('#compte-lien-politique')!.getAttribute('href')).toBe('#confidentialite');
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
    expect(c.creer).toHaveBeenCalledWith('ana@exemple.fr', 'motdepasse', expect.any(Function));
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

  it('compte : le pseudo du compte, changé depuis la vue (pseudoValide), puis enregistré ou gardé sur l’appareil', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    await ouvrir(c);
    expect($('#compte-pseudo-actuel')!.innerText).toContain('Pseudo : Michel');
    $('#compte-vers-pseudo')!.click();
    expect($('#compte-pseudo')!.value).toBe('Michel');
    expect($('#compte-pseudo')!.getAttribute('maxlength')).toBe('20');
    $('#compte-pseudo')!.value = 'M';
    envoyer('#compte-form-pseudo');
    await attendre();
    expect(c.changerPseudo).not.toHaveBeenCalled();
    expect($('#compte-erreur')!.textContent).toBe(textes.chrono.pseudo_invalide);
    $('#compte-pseudo')!.value = '  Michel   D ';
    envoyer('#compte-form-pseudo');
    await attendre();
    await attendre();
    expect(c.changerPseudo).toHaveBeenCalledWith('Michel D');
    expect($('#compte-message')!.textContent).toBe('Pseudo enregistré dans ton compte : Michel D.');
    expect($('#compte-pseudo-actuel')!.innerText).toContain('Pseudo : Michel D');
    // Hors ligne, ou joueurs/ encore fermé : gardé sur l'appareil, il partira plus tard.
    etatChangement = 'refuse';
    $('#compte-vers-pseudo')!.click();
    $('#compte-pseudo')!.value = 'Zoé';
    envoyer('#compte-form-pseudo');
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe(T.pseudo_garde);
  });

  it('un pseudo remplacé par celui du compte à une ouverture de l’appli : dit à l’ouverture de la vue, une fois', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    localStorage.setItem('terramemo.pseudo.remplace', 'Bob');
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    const v = await ouvrir(c);
    expect($('#compte-message')!.textContent).toBe('Ton pseudo est maintenant Michel (celui du compte).');
    expect(localStorage.getItem('terramemo.pseudo.remplace')).toBeNull();
    v.desactiver();
    v.activer();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe('');
  });

  it('compte sans pseudo : « Pas encore de pseudo », à choisir', async () => {
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    await ouvrir(c);
    expect($('#compte-pseudo-actuel')!.innerText).toContain(T.pseudo_aucun);
    expect($('#compte-vers-pseudo')!.textContent).toBe(T.pseudo_choisir);
  });

  it('connexion : le pseudo de l’appareil remplacé par celui du compte est dit, une fois', async () => {
    profilConnexion = { ...PROFIL, etat: 'ecrit', pseudo: 'Michel', ancienPseudo: 'Bob' };
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-vers-connecter')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-connecter');
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe('Connecté : ana@exemple.fr. Ton pseudo est maintenant Michel (celui du compte).');
    expect(textePseudoDuCompte({ ...PROFIL, pseudo: 'Michel' })).toBe('');
  });

  it('compte Google seul : ni mot de passe à changer ni adresse à vérifier', async () => {
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@gmail.com', verifiee: false, fournisseurs: ['google.com'] });
    await ouvrir(c);
    expect($('#compte-adresse-connectee')!.textContent).toBe('Compte Google (ana@gmail.com)');
    expect($('#compte-vers-mdp')).toBeNull();
    expect($('#compte-non-verifiee')).toBeNull();
  });

  it('session perdue : le nombre de séances, se reconnecter (adresse pré-remplie) ou continuer sans compte', async () => {
    const c = fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'] });
    const e = fauxEnvoi({}, 3);
    await ouvrir(c, e);
    expect(e.compter).toHaveBeenCalledWith('u1');
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

  it('état de la synchro du compte (lot 3) : à jour, en attente, hors ligne, refusées · Réessayer', async () => {
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    const e = fauxEnvoi();
    await ouvrir(c, e);
    expect(e.etat).toHaveBeenCalledWith('u1');
    const ligne = $('#compte-synchro')!;
    expect(ligne.hidden).toBe(false);
    expect(ligne.textContent).toBe(T.synchro_a_jour);
    e.poser({ attente: 2 });
    await attendre();
    expect(ligne.textContent).toBe("2 séances en attente d'envoi");
    e.poser({ horsLigne: true });
    await attendre();
    expect(ligne.textContent).toBe(T.synchro_hors_ligne);
    e.poser({ refusees: 1 });
    await attendre();
    expect(ligne.textContent).toBe(`${T.synchro_refusee_une} · ${T.synchro_reessayer}`);
    $('#compte-synchro-reessayer')!.click();
    await attendre();
    await attendre();
    expect(e.declencher).toHaveBeenCalledWith('reessayer');
    expect(ligne.textContent).toBe(T.synchro_a_jour);
    expect($('#compte-synchro-reessayer')).toBeNull();
  });

  it('avant l’ouverture, une adresse non vérifiée : la ligne dit que la synchro attend sa validation (essai du 10/11)', async () => {
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: false, fournisseurs: ['password'] });
    const e = fauxEnvoi({ refusees: 2 });
    await ouvrir(c, e);
    const ligne = $('#compte-synchro')!;
    expect(ligne.textContent).toBe(`${remplir(T.synchro_attend_verification_n, { n: 2 })} · ${T.synchro_reessayer}`);
    e.poser({ refusees: 0, attente: 0 });
    await attendre();
    // Rien en attente non plus : jamais « à jour » tant que l'adresse n'est pas validée.
    expect(ligne.textContent).toBe(T.synchro_attend_verification);
    expect($('#compte-non-verifiee')!.innerText).toContain(T.non_verifiee);
  });

  it('texteSynchro : l’attente de la validation passe avant « refusées » et « à jour », jamais avant « coupée »', () => {
    const base = { coupee: false, attente: 0, refusees: 0, horsLigne: false, aRelire: 0 };
    expect(texteSynchro({ ...base, refusees: 1 }, true)).toBe(T.synchro_attend_verification_une);
    expect(texteSynchro({ ...base, refusees: 2, attente: 1 }, true)).toBe(remplir(T.synchro_attend_verification_n, { n: 3 }));
    expect(texteSynchro(base, true)).toBe(T.synchro_attend_verification);
    expect(texteSynchro({ ...base, coupee: true }, true)).toBe(T.synchro_coupee);
    expect(texteSynchro({ ...base, refusees: 1 })).toBe(T.synchro_refusee_une);
  });

  it('la ligne de la synchro ne se montre que sur l’écran du compte (sauf « Synchro coupée »)', async () => {
    const e = fauxEnvoi({ attente: 4 });
    await ouvrir(fauxComptes(), e);
    expect($('#compte-synchro')!.hidden).toBe(true);
    expect(e.etat).not.toHaveBeenCalled();
  });

  it('texteSynchro : singulier, pluriel, et l’ordre des cas', () => {
    const e = (o: Partial<EtatSynchro>): EtatSynchro => ({ coupee: false, attente: 0, refusees: 0, horsLigne: false, aRelire: 0, ...o });
    expect(texteSynchro(e({}))).toBe(T.synchro_a_jour);
    expect(texteSynchro(e({ attente: 1 }))).toBe(T.synchro_attente_une);
    expect(texteSynchro(e({ attente: 3 }))).toBe("3 séances en attente d'envoi");
    expect(texteSynchro(e({ horsLigne: true }))).toBe(T.synchro_a_jour);
    expect(texteSynchro(e({ attente: 3, horsLigne: true }))).toBe(T.synchro_hors_ligne);
    expect(texteSynchro(e({ attente: 3, refusees: 2 }))).toBe('2 séances refusées par le serveur, gardées sur cet appareil');
    expect(texteSynchro(e({ refusees: 2, coupee: true }))).toBe(T.synchro_coupee);
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

describe('vue Compte, lot 6 : Google', () => {
  it('dans l’APK sans le plugin (lot 7) : pas de bouton Google, une ligne le dit ; l’e-mail redevient le bouton principal', async () => {
    googleOffert = false;
    const c = fauxComptes();
    const v = vueCompte(ctx(), { retour: vi.fn(), comptes: async () => c, natif: () => true });
    v.activer();
    await attendre();
    await attendre();
    expect($('#compte-google')).toBeNull();
    expect($('#compte-vers-connecter')!.className).toBe('');
    expect($('#compte-google-aide')!.textContent).toBe(T.google_bientot);
  });

  it('dans l’APK avec le plugin (lot 7) : le bouton, et la ligne du nom du projet (S18)', async () => {
    const c = fauxComptes();
    const v = vueCompte(ctx(), { retour: vi.fn(), comptes: async () => c, natif: () => true });
    v.activer();
    await attendre();
    await attendre();
    expect($('#compte-google')!.textContent).toBe(T.google);
    expect($('#compte-google-aide')!.textContent).toBe(T.google_apk);
  });

  it('un compte neuf (lien de l’invité) : « Fenêtre de Google ouverte… », puis « Connecté avec Google », puis l’écran du compte', async () => {
    const c = fauxComptes();
    let pendant: { message: string; desactives: boolean } | null = null;
    c.google.mockImplementationOnce(async () => {
      pendant = { message: $('#compte-message')!.textContent, desactives: $('#compte-contenu')!.querySelectorAll('button').every((b) => b.disabled) };
      c.poser({ etat: 'compte', uid: 'g1', adresse: 'ana@gmail.com', verifiee: true, fournisseurs: ['google.com'] });
      return { adresse: 'ana@gmail.com', profil: PROFIL, fusion: 'sans_question', reponses: 0, nouveau: true };
    });
    await ouvrir(c);
    $('#compte-google')!.click();
    await attendre();
    await attendre();
    expect(c.google).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
    expect(pendant).toEqual({ message: T.google_en_cours, desactives: true });
    expect($('#compte-message')!.textContent).toBe('Connecté avec Google : ana@gmail.com. Tes progrès vont dans ton compte.');
    expect($('#compte-adresse-connectee')!.textContent).toBe('Compte Google (ana@gmail.com)');
    expect($('#compte-vers-mdp')).toBeNull();
  });

  it('la fenêtre rendue : « Connexion… » pendant la suite, plus « Fenêtre de Google ouverte… »', async () => {
    const c = fauxComptes();
    let apres = '';
    c.google.mockImplementationOnce(async (_choisir?: unknown, rendue?: () => void) => {
      rendue?.();
      apres = $('#compte-message')!.textContent;
      c.poser({ etat: 'compte', uid: 'g1', adresse: 'ana@gmail.com', verifiee: true, fournisseurs: ['google.com'] });
      return { adresse: 'ana@gmail.com', profil: PROFIL, fusion: 'sans_question', reponses: 0, nouveau: true };
    });
    await ouvrir(c);
    $('#compte-google')!.click();
    await attendre();
    await attendre();
    expect(apres).toBe(T.connexion_en_cours);
  });

  it('un compte Google qui existait : la même question qu’à la connexion par e-mail, « Ajouter »', async () => {
    googleNouveau = false;
    questionConnexion = { sorte: 'appareil', reponses: 12, records: 0, seances: 0 };
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-google')!.click();
    await attendre();
    expect($('#compte-fusion-question')!.textContent).toBe('Ajouter les progrès de cet appareil (12 réponses) à ton compte ?');
    expect($('#compte-message')!.textContent).toBe('');
    $('#compte-fusion-ajouter')!.click();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe('Connecté : ana@gmail.com. Ton compte a reçu les progrès de cet appareil (12 réponses).');
    expect($('#compte-adresse-connectee')!.textContent).toBe('Compte Google (ana@gmail.com)');
  });

  it('« Ne pas les ajouter », confirmé : « Effacer et me connecter » ; « Annuler » ramène à l’écran de l’invité, sans message', async () => {
    googleNouveau = false;
    questionConnexion = { sorte: 'appareil', reponses: 3, records: 1, seances: 0 };
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-google')!.click();
    await attendre();
    $('#compte-fusion-annuler')!.click();
    await attendre();
    await attendre();
    expect(contenu()).toContain(T.invite);
    expect($('#compte-message')!.textContent).toBe('');
    expect($('#compte-erreur')!.textContent).toBe('');
    $('#compte-google')!.click();
    await attendre();
    $('#compte-fusion-ne-pas')!.click();
    expect($('#compte-fusion-confirmer')!.textContent).toContain('3 réponses et 1 record');
    $('#compte-fusion-effacer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe('Connecté : ana@gmail.com. Les progrès de cet appareil sont effacés, ceux du compte arrivent.');
  });

  it('un échec après la réponse : retour à l’écran de l’invité, l’erreur traduite', async () => {
    googleNouveau = false;
    questionConnexion = { sorte: 'appareil', reponses: 3, records: 0, seances: 0 };
    echecApres = err('auth/network-request-failed');
    const c = fauxComptes();
    await ouvrir(c);
    $('#compte-google')!.click();
    await attendre();
    $('#compte-fusion-ajouter')!.click();
    await attendre();
    await attendre();
    expect(contenu()).toContain(T.invite);
    expect($('#compte-erreur')!.textContent).toBe('Réseau injoignable');
  });

  it('fenêtre fermée : rien ne s’affiche, les boutons reviennent', async () => {
    // auth/user-cancelled : « Annuler » sur l'écran de consentement de Google.
    for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']) {
      echecGoogle = err(code);
      const c = fauxComptes();
      zone = document.createElement('main') as unknown as El;
      await ouvrir(c);
      $('#compte-google')!.click();
      await attendre();
      await attendre();
      expect($('#compte-message')!.textContent, code).toBe('');
      expect($('#compte-erreur')!.textContent, code).toBe('');
      expect(contenu()).toContain(T.invite);
      expect($('#compte-google')!.disabled).toBe(false);
    }
  });

  it('fenêtre bloquée, domaine non autorisé, navigateur qui refuse la fenêtre : expliqués', async () => {
    const attendus: Record<string, string> = {
      'auth/popup-blocked': 'Fenêtre de Google bloquée : touche encore le bouton (ou autorise les fenêtres pour ce site).',
      'auth/unauthorized-domain': 'Connexion impossible depuis cette adresse du site',
      'auth/web-storage-unsupported': T.erreurs['auth/web-storage-unsupported']!,
      'terramemo/google-reessayer': 'Connexion Google interrompue : touche encore le bouton de Google.',
    };
    for (const [code, texte] of Object.entries(attendus)) {
      echecGoogle = err(code);
      zone = document.createElement('main') as unknown as El;
      await ouvrir(fauxComptes());
      $('#compte-google')!.click();
      await attendre();
      await attendre();
      expect($('#compte-erreur')!.textContent, code).toBe(texte);
      expect($('#compte-message')!.textContent, code).toBe('');
      expect(contenu(), code).toContain(T.invite);
    }
  });

  it('l’adresse d’un compte à mot de passe (Google pas de confiance pour elle) : le formulaire de connexion, adresse pré-remplie', async () => {
    echecGoogle = Object.assign(err('auth/account-exists-with-different-credential'), { customData: { email: 'ana@yahoo.fr' } });
    await ouvrir(fauxComptes());
    $('#compte-google')!.click();
    await attendre();
    await attendre();
    expect($('#compte-form-connecter')).not.toBeNull();
    expect($('#compte-adresse')!.value).toBe('ana@yahoo.fr');
    expect($('#compte-erreur')!.textContent).toBe('Ce compte se connecte par mot de passe : connecte-toi avec ton adresse');
  });

  it('session perdue d’un compte Google : « Se reconnecter avec Google », sans formulaire d’e-mail', async () => {
    googleNouveau = false;
    const c = fauxComptes({ etat: 'perdue', uid: 'g1', adresse: 'ana@gmail.com', fournisseurs: ['google.com'] });
    await ouvrir(c);
    expect($('#compte-reconnecter')).toBeNull();
    expect($('#compte-google')!.textContent).toBe(T.google_reconnecter);
    expect($('#compte-google')!.className).toBe('');
    $('#compte-google')!.click();
    await attendre();
    await attendre();
    expect(c.google).toHaveBeenCalledOnce();
    expect($('#compte-message')!.textContent).toBe('Connecté : ana@gmail.com.');
    expect($('#compte-adresse-connectee')!.textContent).toBe('Compte Google (ana@gmail.com)');
  });

  it('session perdue d’un compte à mot de passe et Google : l’adresse d’abord, Google en second', async () => {
    await ouvrir(fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@gmail.com', fournisseurs: ['password', 'google.com'] }));
    expect($('.compte-actions')!.querySelectorAll('button').map((b) => b.id)).toEqual(['compte-reconnecter', 'compte-google', 'compte-sans-compte']);
    expect($('#compte-reconnecter')!.className).toBe('');
    expect($('#compte-google')!.className).toBe('secondary');
  });

  it('session perdue d’un compte à mot de passe : Google en second pour une adresse Gmail (Google a pu y prendre la place du mot de passe), pas pour une autre', async () => {
    await ouvrir(fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'Ana@GMail.com', fournisseurs: ['password'] }));
    expect($('.compte-actions')!.querySelectorAll('button').map((b) => b.id)).toEqual(['compte-reconnecter', 'compte-google', 'compte-sans-compte']);
    expect($('#compte-google')!.className).toBe('secondary');
    zone = document.createElement('main') as unknown as El;
    await ouvrir(fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'] }));
    expect($('#compte-google')).toBeNull();
    expect(adresseGmail('a@googlemail.com')).toBe(true);
    expect(adresseGmail('a@gmail.com.fr')).toBe(false);
    expect(adresseGmail(null)).toBe(false);
  });

  it('session perdue d’un compte Google dans l’APK sans le plugin : pas de reconnexion, la ligne le dit', async () => {
    googleOffert = false;
    await ouvrir(fauxComptes({ etat: 'perdue', uid: 'g1', adresse: 'ana@gmail.com', fournisseurs: ['google.com'] }));
    expect($('#compte-google')).toBeNull();
    expect($('#compte-reconnecter')).toBeNull();
    expect($('#compte-google-aide')!.textContent).toBe(T.google_bientot);
    expect($('#compte-sans-compte')).not.toBeNull();
  });

  it('suppression inachevée d’un compte Google, session perdue : la fenêtre de Google sur le site, le renvoi au site dans l’APK', async () => {
    const e: EtatCompte = { etat: 'suppression', uid: 'g1', adresse: 'ana@gmail.com', fournisseurs: ['google.com'], connecte: false, horsAuth: false };
    const c = fauxComptes(e);
    await ouvrir(c);
    expect($('#compte-suppression-reconnecter')!.textContent).toBe('Ta session a expiré en route : « Reprendre la suppression » ouvre la fenêtre de Google, où choisir ana@gmail.com.');
    expect($('#compte-supprimer-mdp')).toBeNull();
    $('#compte-supprimer-mot')!.value = 'supprimer';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect(c.supprimer).toHaveBeenCalledWith({ mot: 'supprimer' });
    googleOffert = false;
    zone = document.createElement('main') as unknown as El;
    await ouvrir(fauxComptes(e));
    expect($('#compte-suppression-reconnecter')!.textContent).toBe(T.suppression_reconnecter_site);
  });

  it('texteGoogle : compte neuf, neuf vidé, compte qui existait', () => {
    expect(texteGoogle({ adresse: 'a@gmail.com', fusion: 'sans_question', nouveau: true }, null)).toBe('Connecté avec Google : a@gmail.com. Tes progrès vont dans ton compte.');
    expect(texteGoogle({ adresse: 'a@gmail.com', fusion: 'efface', nouveau: true }, null)).toBe('Connecté : a@gmail.com. Les progrès de cet appareil sont effacés.');
    expect(texteGoogle({ adresse: 'a@gmail.com', fusion: 'sans_question', nouveau: false }, null)).toBe('Connecté : a@gmail.com.');
    // Google à la place du mot de passe (S5) : dit au message, et avant le choix à la question.
    expect(texteGoogle({ adresse: 'a@gmail.com', fusion: 'sans_question', nouveau: false, mdpRetire: true }, null)).toBe(`Connecté : a@gmail.com. ${T.google_mdp_retire}`);
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

describe('vue Compte, lot 4 : question de fusion, déconnexion reprenable, effacer l’appareil', () => {
  const Q: QuestionFusion = { sorte: 'appareil', reponses: 12, records: 3, seances: 0 };

  async function connecterAvecQuestion(c: Comptes) {
    $('#compte-vers-connecter')!.click();
    ($('#compte-adresse') as unknown as HTMLInputElement).value = 'ana@exemple.fr';
    ($('#compte-mdp') as unknown as HTMLInputElement).value = 'motdepasse';
    envoyer('#compte-form-connecter');
    await attendre();
    void c;
  }

  it('textes : le détail des progrès, la question, ce qui n’est pas parti', () => {
    expect(detailProgres(12, 0)).toBe('12 réponses');
    expect(detailProgres(1, 0)).toBe('1 réponse');
    expect(detailProgres(0, 3)).toBe('3 records');
    expect(detailProgres(12, 1)).toBe('12 réponses et 1 record');
    expect(texteQuestion(Q)).toBe('Ajouter les progrès de cet appareil (12 réponses et 3 records) à ton compte ?');
    expect(texteQuestion({ ...Q, sorte: 'autre_compte', seances: 2 })).toBe('2 séances d’un autre compte n’ont pas été envoyées. Les ajouter à ce compte ?'.replace(/’/g, "'"));
    expect(texteQuestion({ ...Q, mdpRetire: true })).toBe(`${T.google_mdp_retire} Ajouter les progrès de cet appareil (12 réponses et 3 records) à ton compte ?`);
    expect(textesDeconnexion({ fait: false, nonEnvoyees: 1, refusees: 0, profil: false })).toEqual([T.deconnexion_seance, T.deconnexion_profil]);
    expect(textesDeconnexion({ fait: false, nonEnvoyees: 3, refusees: 1, profil: true })).toEqual(['3 séances ne sont pas encore dans ton compte : elles seront perdues.']);
  });

  it('« Ajouter » : la question, puis le message des progrès reçus par le compte', async () => {
    questionConnexion = Q;
    const c = fauxComptes();
    await ouvrir(c);
    await connecterAvecQuestion(c);
    expect($('#compte-fusion-question')!.textContent).toBe(texteQuestion(Q));
    expect($('#compte-fusion-ajouter')!.className).toBe('');
    expect($('#compte-fusion-ne-pas')!.className).toBe('danger');
    expect($('#compte-fusion-annuler')!.className).toBe('secondary');
    $('#compte-fusion-ajouter')!.click();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe('Connecté : ana@exemple.fr. Ton compte a reçu les progrès de cet appareil (12 réponses et 3 records).');
    expect($('#compte-adresse-connectee')!.textContent).toBe('ana@exemple.fr');
  });

  it('« Ne pas les ajouter » : une seconde confirmation (avec « Retour »), puis l’appareil effacé', async () => {
    questionConnexion = Q;
    const c = fauxComptes();
    await ouvrir(c);
    await connecterAvecQuestion(c);
    $('#compte-fusion-ne-pas')!.click();
    expect($('#compte-fusion-confirmer')!.textContent).toBe('Les progrès de cet appareil (12 réponses et 3 records) seront effacés. Tu retrouveras seulement ce qui est déjà dans ton compte.');
    $('#compte-fusion-retour')!.click();
    expect($('#compte-fusion-question')).not.toBeNull();
    $('#compte-fusion-ne-pas')!.click();
    expect($('#compte-fusion-effacer')!.className).toBe('danger');
    $('#compte-fusion-effacer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe(T.connecte_efface.replace('{adresse}', 'ana@exemple.fr'));
  });

  it('« Annuler » : retour au formulaire, sans message, l’invité reste invité', async () => {
    questionConnexion = Q;
    const c = fauxComptes();
    await ouvrir(c);
    await connecterAvecQuestion(c);
    $('#compte-fusion-annuler')!.click();
    await attendre();
    await attendre();
    expect($('#compte-form-connecter')).not.toBeNull();
    expect($('#compte-erreur')!.textContent).toBe('');
    expect(await c.etat()).toEqual({ etat: 'invite', anonyme: false });
  });

  it('déconnexion : ce qui n’est pas parti est dit ; « Réessayer l’envoi », puis « Se déconnecter quand même »', async () => {
    resteDeconnexion = { fait: false, nonEnvoyees: 2, refusees: 1, profil: true };
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    await ouvrir(c);
    $('#compte-deconnecter')!.click();
    await attendre();
    expect($('#compte-deconnexion-0')!.textContent).toBe('2 séances ne sont pas encore dans ton compte : elles seront perdues.');
    $('#compte-deconnexion-reessayer')!.click();
    await attendre();
    expect(c.deconnecter).toHaveBeenCalledTimes(2);
    expect($('#compte-deconnexion-0')).not.toBeNull();
    expect($('#compte-deconnexion-quand-meme')!.className).toBe('danger');
    $('#compte-deconnexion-quand-meme')!.click();
    await attendre();
    await attendre();
    expect(c.deconnecter).toHaveBeenLastCalledWith({ quandMeme: true });
    expect($('#compte-message')!.textContent).toBe(T.deconnecte_quand_meme);
    expect(contenu()).toContain(T.invite);
  });

  it('déconnexion : « Annuler » garde le compte', async () => {
    resteDeconnexion = { fait: false, nonEnvoyees: 0, refusees: 0, profil: false };
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    await ouvrir(c);
    $('#compte-deconnecter')!.click();
    await attendre();
    expect($('#compte-deconnexion-0')!.textContent).toBe(T.deconnexion_profil);
    $('#compte-annuler')!.click();
    expect($('#compte-adresse-connectee')!.textContent).toBe('ana@exemple.fr');
  });

  it('session perdue : « Effacer cet appareil » confirme avec le nombre de réponses, puis invité', async () => {
    const c = fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'] });
    await ouvrir(c);
    expect($('#compte-effacer')!.className).toBe('danger');
    $('#compte-effacer')!.click();
    await attendre();
    expect($('#compte-effacer-texte')!.textContent).toBe('Les progrès de cet appareil (42 réponses), ton pseudo et tes records seront effacés. Les séances non envoyées seront perdues.');
    $('#compte-effacer-ok')!.click();
    await attendre();
    await attendre();
    expect(c.effacerAppareil).toHaveBeenCalledTimes(1);
    expect($('#compte-message')!.textContent).toBe(T.efface);
    expect(contenu()).toContain(T.invite);
  });

  it('la ligne de la synchro dit les réponses qu’une version plus récente a écrites', () => {
    const e = (o: Partial<EtatSynchro>): EtatSynchro => ({ coupee: false, attente: 0, refusees: 0, horsLigne: false, aRelire: 0, ...o });
    expect(texteSynchro(e({ aRelire: 5 }))).toBe('Mets à jour l\'appli : 5 réponses venues d\'un autre appareil attendent');
    expect(texteSynchro(e({ aRelire: 1 }))).toBe(T.synchro_a_relire_une);
    expect(texteSynchro(e({ aRelire: 5, refusees: 1 }))).toBe(T.synchro_refusee_une);
  });

  it('(V1) la réponse donnée : « Connexion… » sans boutons ; un échec ramène au formulaire avec l’erreur', async () => {
    questionConnexion = Q;
    let finir!: () => void;
    echecApres = null;
    const c = fauxComptes();
    const attente = new Promise<void>((ok) => (finir = ok));
    c.connecter.mockImplementationOnce(async (_a: string, _m?: string, choisir?: (q: QuestionFusion) => Promise<ChoixFusion>) => {
      await choisir!(Q);
      await attente;
      throw err('auth/network-request-failed');
    });
    await ouvrir(c);
    await connecterAvecQuestion(c);
    $('#compte-fusion-ajouter')!.click();
    expect($('#compte-attente')!.textContent).toBe(T.connexion_en_cours);
    expect($('#compte-contenu')!.querySelectorAll('button').length).toBe(0);
    finir();
    await attendre();
    await attendre();
    expect($('#compte-form-connecter')).not.toBeNull();
    expect($('#compte-erreur')!.textContent).toBe('Réseau injoignable');
  });

  it('(V1) création après la question, adresse déjà prise : bascule vers « Se connecter », l’erreur gardée', async () => {
    questionConnexion = { sorte: 'autre_compte', reponses: 3, records: 0, seances: 1 };
    echecApres = err('auth/email-already-in-use');
    const c = fauxComptes({ etat: 'perdue', uid: 'ux', adresse: 'x@exemple.fr', fournisseurs: ['password'] });
    await ouvrir(c);
    $('#compte-reconnecter')!.click();
    $('#compte-vers-creer')!.click();
    ($('#compte-adresse') as unknown as HTMLInputElement).value = 'x@exemple.fr';
    ($('#compte-mdp') as unknown as HTMLInputElement).value = 'motdepasse';
    envoyer('#compte-form-creer');
    await attendre();
    $('#compte-fusion-ajouter')!.click();
    await attendre();
    await attendre();
    expect($('#compte-form-connecter')).not.toBeNull();
    expect($('#compte-erreur')!.textContent).toBe('Un compte existe déjà avec cette adresse : connecte-toi');
  });

  it('(V3) l’écran de la déconnexion ne garde pas son nombre d’une ouverture à l’autre', async () => {
    resteDeconnexion = { fait: false, nonEnvoyees: 2, refusees: 0, profil: true };
    const c = fauxComptes({ etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] });
    const v = await ouvrir(c);
    $('#compte-deconnecter')!.click();
    await attendre();
    expect($('#compte-deconnexion-0')).not.toBeNull();
    v.desactiver();
    v.activer();
    await attendre();
    await attendre();
    expect($('#compte-deconnexion-0')).toBeNull();
    expect($('#compte-adresse-connectee')!.textContent).toBe('ana@exemple.fr');
  });
});

describe('vue Compte, lot 5 : suppression du compte', () => {
  const COMPTE: EtatCompte = { etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] };

  it('« Supprimer mon compte », en bas et à part, en style danger', async () => {
    const c = fauxComptes(COMPTE);
    await ouvrir(c);
    const b = $('#compte-vers-supprimer')!;
    expect(b.textContent).toBe(T.supprimer_lien);
    expect(b.className).toBe('danger');
    expect(b.parent!.className).toBe('compte-actions compte-separe');
    expect($('#compte-en-suppression')).toBeNull();
  });

  it('le texte de D27 b avant la confirmation ; « supprimer » et le mot de passe exigés ; puis « Compte supprimé. »', async () => {
    // Le pseudo de l'appareil n'est pas celui de la demande : le texte dit celui du profil en ligne.
    localStorage.setItem('terramemo.pseudo', 'Ana');
    pseudoEnLigne = { lu: true, pseudo: 'Michel' };
    const c = fauxComptes(COMPTE);
    await ouvrir(c);
    $('#compte-vers-supprimer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-supprimer-texte')!.textContent).toBe(T.supprimer_texte);
    expect(c.pseudoDemande).toHaveBeenCalledOnce();
    expect($('#compte-supprimer-classement')!.textContent).toBe(
      "Tes places au classement portent le pseudo de ton compte, Michel : elles seront retirées sous 30 jours, pour tous ceux qui jouent ce pseudo. Celles d'un pseudo que tu as quitté restent.",
    );
    // Le texte vient avant le formulaire de confirmation.
    const enfants = $('#compte-contenu')!.enfants as El[];
    expect(enfants.findIndex((x) => x.id === 'compte-supprimer-classement')).toBeLessThan(enfants.findIndex((x) => x.id === 'compte-form-supprimer'));
    const mot = $('#compte-supprimer-mot')!;
    expect([mot.getAttribute('autocomplete'), mot.getAttribute('autocapitalize')]).toEqual(['off', 'off']);
    expect($('#compte-supprimer-mdp')!.getAttribute('autocomplete')).toBe('current-password');
    expect(zone.querySelector('input[autocomplete="username"]')!.value).toBe('ana@exemple.fr');
    expect($('#compte-supprimer-ok')!.className).toBe('danger');
    // Sans le mot : rien ne part.
    mot.value = 'oui';
    envoyer('#compte-form-supprimer');
    await attendre();
    expect(c.supprimer).not.toHaveBeenCalled();
    expect($('#compte-erreur')!.textContent).toBe('Écris « supprimer » pour confirmer');
    // Avec la majuscule du clavier du téléphone.
    mot.value = 'Supprimer';
    $('#compte-supprimer-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect(c.supprimer).toHaveBeenCalledWith({ mot: 'Supprimer', mdp: 'motdepasse' });
    expect($('#compte-message')!.textContent).toBe(T.supprime);
    expect(contenu()).toContain(T.invite);
  });

  it('sans pseudo en ligne : aucune place retirée ; profil illisible : l’avertissement sans nom ; « Annuler » ramène au compte', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const c = fauxComptes(COMPTE);
    await ouvrir(c);
    $('#compte-vers-supprimer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-supprimer-classement')!.textContent).toBe(T.supprimer_classement_aucun);
    $('#compte-annuler')!.click();
    pseudoEnLigne = { lu: false, pseudo: null };
    $('#compte-vers-supprimer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-supprimer-classement')!.textContent).toBe(T.supprimer_classement_sans);
    $('#compte-annuler')!.click();
    expect($('#compte-adresse-connectee')!.textContent).toBe('ana@exemple.fr');
  });

  it('compte Google : pas de mot de passe, la fenêtre de Google le dit', async () => {
    const c = fauxComptes({ ...COMPTE, fournisseurs: ['google.com'] } as EtatCompte);
    await ouvrir(c);
    $('#compte-vers-supprimer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-supprimer-mdp')).toBeNull();
    expect($('#compte-supprimer-google')!.textContent).toBe(T.supprimer_google);
    $('#compte-supprimer-mot')!.value = 'supprimer';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect(c.supprimer).toHaveBeenCalledWith({ mot: 'supprimer' });
  });

  it('compte à mot de passe et Google : le mot de passe facultatif, Google sans lui ; dans l’APK sans plugin, le mot de passe seul', async () => {
    const e = { ...COMPTE, fournisseurs: ['password', 'google.com'] } as EtatCompte;
    const c = fauxComptes(e);
    await ouvrir(c);
    $('#compte-vers-supprimer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-supprimer-mdp')).not.toBeNull();
    expect($('#compte-supprimer-google')!.textContent).toBe(T.supprimer_google_ou_mdp);
    $('#compte-supprimer-mot')!.value = 'supprimer';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect(c.supprimer).toHaveBeenCalledWith({ mot: 'supprimer', mdp: '' });
    googleOffert = false;
    zone = document.createElement('main') as unknown as El;
    await ouvrir(fauxComptes(e));
    $('#compte-vers-supprimer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-supprimer-mdp')).not.toBeNull();
    expect($('#compte-supprimer-google')).toBeNull();
  });

  it('coupée en route : l’écran de la reprise, l’erreur traduite', async () => {
    coupureSuppression = err('auth/network-request-failed');
    const c = fauxComptes(COMPTE);
    await ouvrir(c);
    $('#compte-vers-supprimer')!.click();
    await attendre();
    await attendre();
    $('#compte-supprimer-mot')!.value = 'supprimer';
    $('#compte-supprimer-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect($('#compte-suppression-inachevee')!.textContent).toBe(T.suppression_inachevee);
    expect($('#compte-erreur')!.textContent).toBe('Réseau injoignable');
    expect($('#compte-message')!.textContent).toBe('');
    // La reprise : le mot et le mot de passe de nouveau (réauthentification).
    coupureSuppression = null;
    $('#compte-supprimer-mot')!.value = 'supprimer';
    $('#compte-supprimer-mdp')!.value = 'motdepasse';
    expect($('#compte-supprimer-ok')!.textContent).toBe(T.suppression_reprendre);
    expect($('#compte-annuler')).toBeNull();
    expect($('#compte-suppression-annuler')!.textContent).toBe(T.suppression_annuler);
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect(c.supprimer).toHaveBeenCalledTimes(2);
    expect($('#compte-message')!.textContent).toBe(T.supprime);
  });

  it('suppression inachevée à l’ouverture, compte encore là : « reprendre ? », avec le mot de passe, et « Annuler la suppression »', async () => {
    const c = fauxComptes({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: true, horsAuth: false });
    await ouvrir(c);
    expect($('#compte-suppression-inachevee')!.textContent).toBe(T.suppression_inachevee);
    expect($('#compte-supprimer-mdp')).not.toBeNull();
    expect($('#compte-suppression-appareil')).toBeNull();
    expect($('#compte-suppression-vider')).toBeNull();
    $('#compte-suppression-annuler')!.click();
    await attendre();
    await attendre();
    expect(c.annulerSuppression).toHaveBeenCalledOnce();
    expect($('#compte-message')!.textContent).toBe(T.suppression_annulee);
    expect($('#compte-adresse-connectee')!.textContent).toBe('ana@exemple.fr');
  });

  it('« Annuler la suppression » refusée (pierre tombale posée) : l’erreur, l’écran de la reprise reste', async () => {
    const c = fauxComptes({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: true, horsAuth: false });
    c.annulerSuppression.mockRejectedValueOnce(err('terramemo/suppression-engagee'));
    await ouvrir(c);
    $('#compte-suppression-annuler')!.click();
    await attendre();
    await attendre();
    expect($('#compte-erreur')!.textContent).toBe(T.erreurs['terramemo/suppression-engagee']);
    expect($('#compte-suppression-inachevee')).not.toBeNull();
  });

  it('suppression inachevée, session perdue en route : se reconnecter (mot de passe, « Mot de passe oublié ? »), « Effacer cet appareil » sans rien promettre', async () => {
    const c = fauxComptes({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: false, horsAuth: false });
    await ouvrir(c);
    // Pas « Le compte n'est plus en ligne » : rien ne le prouve.
    expect($('#compte-suppression-appareil')).toBeNull();
    expect($('#compte-suppression-reconnecter')!.textContent).toBe(T.suppression_reconnecter);
    expect($('#compte-supprimer-mdp')).not.toBeNull();
    expect(zone.querySelector('input[autocomplete="username"]')!.value).toBe('ana@exemple.fr');
    $('#compte-oubli')!.click();
    await attendre();
    expect(c.oublier).toHaveBeenCalledWith('ana@exemple.fr');
    expect($('#compte-suppression-vider-aide')!.textContent).toContain('le compte reste en ligne s');
    expect($('#compte-suppression-vider')!.className).toBe('danger');
    $('#compte-supprimer-mot')!.value = 'supprimer';
    $('#compte-supprimer-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect(c.supprimer).toHaveBeenCalledWith({ mot: 'supprimer', mdp: 'motdepasse' });
    expect($('#compte-message')!.textContent).toBe(T.supprime);
  });

  it('session perdue en route : « Effacer cet appareil » abandonne la suppression, le message ne dit pas « Compte supprimé. »', async () => {
    const c = fauxComptes({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: false, horsAuth: false });
    await ouvrir(c);
    $('#compte-suppression-vider')!.click();
    await attendre();
    await attendre();
    expect(c.abandonnerSuppression).toHaveBeenCalledOnce();
    expect(c.supprimer).not.toHaveBeenCalled();
    expect($('#compte-message')!.textContent).toBe(T.suppression_videe);
    expect(contenu()).toContain(T.invite);
  });

  it('une session perdue pendant la reprise : l’écran passe à la reconnexion', async () => {
    const c = fauxComptes({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: true, horsAuth: false });
    c.supprimer.mockImplementationOnce(async () => {
      c.poser({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: false, horsAuth: false });
      throw err('terramemo/mdp-faux');
    });
    await ouvrir(c);
    $('#compte-supprimer-mot')!.value = 'supprimer';
    $('#compte-supprimer-mdp')!.value = 'ancien-mdp';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect($('#compte-suppression-reconnecter')).not.toBeNull();
    expect($('#compte-erreur')!.textContent).toBe('Mot de passe incorrect');
  });

  it('une suppression menée dans un autre onglet : « Se déconnecter » refusé mène à sa reprise', async () => {
    const c = fauxComptes(COMPTE);
    c.deconnecter.mockImplementationOnce(async () => {
      c.poser({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: true, horsAuth: false });
      throw err('terramemo/suppression-inachevee');
    });
    await ouvrir(c);
    $('#compte-deconnecter')!.click();
    await attendre();
    await attendre();
    await attendre();
    expect($('#compte-suppression-inachevee')).not.toBeNull();
    expect($('#compte-erreur')!.textContent).toBe(T.erreurs['terramemo/suppression-inachevee']);
  });

  it('suppression inachevée, deleteUser abouti ici : il reste à vider l’appareil, sans mot de passe', async () => {
    const c = fauxComptes({ etat: 'suppression', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], connecte: false, horsAuth: true });
    await ouvrir(c);
    expect($('#compte-suppression-appareil')!.textContent).toBe(T.suppression_appareil);
    expect($('#compte-supprimer-mdp')).toBeNull();
    $('#compte-supprimer-mot')!.value = 'supprimer';
    envoyer('#compte-form-supprimer');
    await attendre();
    await attendre();
    expect(c.supprimer).toHaveBeenCalledWith({ mot: 'supprimer' });
    expect(contenu()).toContain(T.invite);
  });

  it('un autre appareil a lancé la suppression : « Ce compte est en cours de suppression », la suppression reste offerte', async () => {
    const c = fauxComptes({ ...COMPTE, supprime: true } as EtatCompte);
    await ouvrir(c);
    expect($('#compte-en-suppression')!.textContent).toBe(T.en_suppression);
    expect($('#compte-vers-supprimer')).not.toBeNull();
  });
});

describe('vue Compte, lot 5 : export des données', () => {
  const COMPTE: EtatCompte = { etat: 'compte', uid: 'u1', adresse: 'ana@exemple.fr', verifiee: true, fournisseurs: ['password'] };
  const Q: QuestionFusion = { sorte: 'appareil', reponses: 12, records: 3, seances: 0 };
  const FICHIER = { nom: 'terramemo-2026-11-07.json', contenu: '{"format":"terramemo-export"}\n' };

  async function ouvrirExport(c: Comptes, o: { natif?: boolean; echec?: Error } = {}) {
    const exporter = vi.fn(async () => {
      if (o.echec) throw o.echec;
      return FICHIER;
    });
    const telecharger = vi.fn();
    const v = vueCompte(ctx(), { retour: vi.fn(), comptes: async () => c, exporter, telecharger, natif: () => o.natif ?? false });
    v.activer();
    await attendre();
    await attendre();
    return { v, exporter, telecharger };
  }

  it('compte : « Exporter mes données », le fichier proposé, puis le message', async () => {
    const { exporter, telecharger } = await ouvrirExport(fauxComptes(COMPTE));
    expect($('#compte-exporter')!.textContent).toBe(T.exporter);
    $('#compte-exporter')!.click();
    await attendre();
    expect(exporter).toHaveBeenCalledOnce();
    expect(telecharger).toHaveBeenCalledWith(FICHIER.nom, FICHIER.contenu);
    expect($('#compte-message')!.textContent).toBe('Export prêt : terramemo-2026-11-07.json, dans les téléchargements.');
  });

  it('un invité exporte aussi ; une session perdue aussi', async () => {
    await ouvrirExport(fauxComptes());
    expect($('#compte-exporter')!.textContent).toBe(T.exporter);
    expect($('#compte-exporter')!.className).toBe('lien');
    zone = document.createElement('main') as unknown as El;
    await ouvrirExport(fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'] }));
    expect($('#compte-exporter')).not.toBeNull();
  });

  it('un échec : l’erreur traduite, rien de proposé', async () => {
    const { telecharger } = await ouvrirExport(fauxComptes(COMPTE), { echec: err('auth/network-request-failed') });
    $('#compte-exporter')!.click();
    await attendre();
    expect(telecharger).not.toHaveBeenCalled();
    expect($('#compte-erreur')!.textContent).toBe('Réseau injoignable');
  });

  it('dans l’APK (D26 a) : le renvoi au site, à la place du bouton', async () => {
    const { exporter } = await ouvrirExport(fauxComptes(COMPTE), { natif: true });
    expect($('#compte-exporter')).toBeNull();
    expect($('#compte-exporter-site')!.textContent).toBe('Exporte depuis le site : terramemo-geo.web.app');
    expect(exporter).not.toHaveBeenCalled();
  });

  it('« Ne pas les ajouter » : « Exporter d’abord » avant l’effacement, pendant la question', async () => {
    questionConnexion = Q;
    const c = fauxComptes();
    const { telecharger } = await ouvrirExport(c);
    $('#compte-vers-connecter')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-connecter');
    await attendre();
    $('#compte-fusion-ne-pas')!.click();
    const boutons = $('#compte-contenu')!.querySelectorAll('button').map((b) => b.id);
    expect(boutons).toEqual(['compte-exporter-dabord', 'compte-fusion-effacer', 'compte-fusion-retour']);
    expect($('#compte-exporter-dabord')!.textContent).toBe(T.exporter_dabord);
    $('#compte-exporter-dabord')!.click();
    await attendre();
    expect(telecharger).toHaveBeenCalledOnce();
    // La question reste posée : l'export n'y répond pas.
    expect($('#compte-fusion-confirmer')).not.toBeNull();
    $('#compte-fusion-effacer')!.click();
    await attendre();
    await attendre();
    expect($('#compte-message')!.textContent).toBe(T.connecte_efface.replace('{adresse}', 'ana@exemple.fr'));
  });

  it('dans l’APK, un invité ou une session perdue n’ont pas de renvoi au site (leur journal n’est que dans l’appli)', async () => {
    await ouvrirExport(fauxComptes(), { natif: true });
    expect($('#compte-exporter')).toBeNull();
    expect($('#compte-exporter-site')).toBeNull();
    zone = document.createElement('main') as unknown as El;
    await ouvrirExport(fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'] }), { natif: true });
    expect($('#compte-exporter')).toBeNull();
    expect($('#compte-exporter-site')).toBeNull();
  });

  it('un export partiel (séances en ligne pas toutes lues) : le message le dit', async () => {
    const telecharger = vi.fn();
    const v = vueCompte(ctx(), { retour: vi.fn(), comptes: async () => fauxComptes(COMPTE), exporter: async () => ({ ...FICHIER, complet: false }), telecharger, natif: () => false });
    v.activer();
    await attendre();
    await attendre();
    $('#compte-exporter')!.click();
    await attendre();
    expect(telecharger).toHaveBeenCalledOnce();
    expect($('#compte-message')!.textContent).toBe(`Export prêt : terramemo-2026-11-07.json, dans les téléchargements. ${T.exporte_partiel}`);
  });

  it('un export lent : « Ne pas les ajouter », « Se déconnecter quand même » et « Effacer » attendent qu’il ait fini', async () => {
    let finir: () => void = () => undefined;
    const ordre: string[] = [];
    const exporter = vi.fn(
      () =>
        new Promise<typeof FICHIER>((ok) => {
          finir = () => {
            ordre.push('export');
            ok(FICHIER);
          };
        }),
    );
    const ouvrirLent = async (c: Comptes) => {
      zone = document.createElement('main') as unknown as El;
      const v = vueCompte(ctx(), { retour: vi.fn(), comptes: async () => c, exporter, telecharger: vi.fn(), natif: () => false });
      v.activer();
      await attendre();
      await attendre();
    };
    // 1. La question de fusion.
    questionConnexion = Q;
    const c1 = fauxComptes();
    c1.connecter.mockImplementationOnce(async (adresse: string, _m?: string, choisir?: (q: QuestionFusion) => Promise<ChoixFusion>) => {
      const choix = await choisir!(Q);
      ordre.push(choix);
      return { adresse, profil: PROFIL, fusion: 'efface', reponses: 0 };
    });
    await ouvrirLent(c1);
    $('#compte-vers-connecter')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-connecter');
    await attendre();
    $('#compte-fusion-ne-pas')!.click();
    $('#compte-exporter-dabord')!.click();
    $('#compte-fusion-effacer')!.click();
    await attendre();
    expect(ordre).toEqual([]);
    finir();
    await attendre();
    await attendre();
    expect(ordre).toEqual(['export', 'effacer']);
    // 2. La déconnexion qui perdrait des séances.
    ordre.length = 0;
    questionConnexion = null;
    resteDeconnexion = { fait: false, nonEnvoyees: 2, refusees: 0, profil: true };
    const c2 = fauxComptes(COMPTE);
    await ouvrirLent(c2);
    $('#compte-deconnecter')!.click();
    await attendre();
    $('#compte-exporter-dabord')!.click();
    $('#compte-deconnexion-quand-meme')!.click();
    await attendre();
    expect(c2.deconnecter).toHaveBeenCalledTimes(1);
    finir();
    await attendre();
    await attendre();
    expect(c2.deconnecter).toHaveBeenLastCalledWith({ quandMeme: true });
    // 3. « Effacer cet appareil ».
    const c3 = fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'] });
    await ouvrirLent(c3);
    $('#compte-effacer')!.click();
    await attendre();
    $('#compte-exporter-dabord')!.click();
    $('#compte-effacer-ok')!.click();
    await attendre();
    expect(c3.effacerAppareil).not.toHaveBeenCalled();
    finir();
    await attendre();
    await attendre();
    expect(c3.effacerAppareil).toHaveBeenCalledOnce();
  });

  it('dans l’APK, pas d’« Exporter d’abord » à la question', async () => {
    questionConnexion = Q;
    const c = fauxComptes();
    await ouvrirExport(c, { natif: true });
    $('#compte-vers-connecter')!.click();
    $('#compte-adresse')!.value = 'ana@exemple.fr';
    $('#compte-mdp')!.value = 'motdepasse';
    envoyer('#compte-form-connecter');
    await attendre();
    $('#compte-fusion-ne-pas')!.click();
    expect($('#compte-exporter-dabord')).toBeNull();
    expect($('#compte-exporter-dabord-site')).toBeNull();
    $('#compte-fusion-retour')!.click();
    $('#compte-fusion-annuler')!.click();
    await attendre();
  });

  it('une déconnexion qui perdrait des séances : « Exporter d’abord », avant « Se déconnecter quand même »', async () => {
    resteDeconnexion = { fait: false, nonEnvoyees: 2, refusees: 0, profil: true };
    const { telecharger } = await ouvrirExport(fauxComptes(COMPTE));
    $('#compte-deconnecter')!.click();
    await attendre();
    const boutons = $('#compte-contenu')!.querySelectorAll('button').map((b) => b.id);
    expect(boutons).toEqual(['compte-deconnexion-reessayer', 'compte-exporter-dabord', 'compte-deconnexion-quand-meme', 'compte-annuler']);
    $('#compte-exporter-dabord')!.click();
    await attendre();
    expect(telecharger).toHaveBeenCalledOnce();
  });

  it('« Effacer cet appareil » (session perdue) : « Exporter d’abord » aussi', async () => {
    await ouvrirExport(fauxComptes({ etat: 'perdue', uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'] }));
    $('#compte-effacer')!.click();
    await attendre();
    expect($('#compte-contenu')!.querySelectorAll('button').map((b) => b.id)).toEqual(['compte-exporter-dabord', 'compte-effacer-ok', 'compte-annuler']);
  });
});

// Écran de connexion de la première ouverture (src/vues/accueil.ts) : les
// écrans des comptes montés dans son panneau par accueilCompte(), sans
// recopie ; ce qui change au panneau.
describe('écrans des comptes au panneau de la première ouverture', () => {
  async function monter(c: Comptes, o: { natif?: boolean } = {}) {
    const fini = vi.fn();
    const surEcran = vi.fn();
    const occupe = vi.fn();
    const prechauffer = vi.fn();
    const a = accueilCompte({ comptes: async () => c, fini, surEcran, occupe, prechauffer, natif: () => !!o.natif, exporter: async () => ({ nom: 'x.json', contenu: '{}' }) });
    zone.append(a.element as unknown as El);
    a.activer();
    await attendre();
    await attendre();
    return { a, fini, surEcran, occupe, prechauffer };
  }
  const derniereEntree = (f: ReturnType<typeof vi.fn>) => f.mock.calls.at(-1)?.[0];

  it('les entrées sans rien demander à Firebase : ni etat(), ni SDK ; id préfixés, ni « tes progrès restent… » ni export', async () => {
    const c = fauxComptes();
    const { surEcran, prechauffer } = await monter(c);
    expect(c.etat).not.toHaveBeenCalled();
    expect(prechauffer).not.toHaveBeenCalled();
    expect($('.accueil-compte .compte-actions')!.querySelectorAll('button').map((b) => b.id)).toEqual(['accueil-compte-google', 'accueil-compte-vers-connecter', 'accueil-compte-vers-creer']);
    expect($('#accueil-compte-google')!.className).toBe('');
    expect($('#accueil-compte-google-aide')!.textContent).toBe(T.google_site);
    expect($('#accueil-compte-contenu')!.innerText).not.toContain(T.invite);
    expect($('#accueil-compte-exporter')).toBeNull();
    expect($('#compte-contenu')).toBeNull();
    expect(derniereEntree(surEcran)).toBe(true);
  });

  it('le SDK préchauffé au premier signe d’intérêt : pointeur ou focus sur Google, formulaire ouvert', async () => {
    const { prechauffer, surEcran } = await monter(fauxComptes());
    $('#accueil-compte-google')!.emettre('pointerdown');
    expect(prechauffer).toHaveBeenCalledTimes(1);
    $('#accueil-compte-google')!.emettre('focus');
    expect(prechauffer).toHaveBeenCalledTimes(2);
    $('#accueil-compte-vers-connecter')!.click();
    expect(prechauffer).toHaveBeenCalledTimes(3);
    expect(derniereEntree(surEcran)).toBe(false); // « Continuer en invité » caché pendant le formulaire
    const a = $('#accueil-compte-adresse')!;
    expect([a.getAttribute('type'), a.getAttribute('autocomplete'), a.getAttribute('inputmode')]).toEqual(['email', 'email', 'email']);
    expect($('#accueil-compte-mdp')!.getAttribute('autocomplete')).toBe('current-password');
    expect($('label')!.getAttribute('for')).toBe('accueil-compte-adresse');
    expect($('#accueil-compte-oubli')).not.toBeNull();
    $('#accueil-compte-annuler')!.click();
    expect($('#accueil-compte-vers-creer')).not.toBeNull();
    expect(derniereEntree(surEcran)).toBe(true);
  });

  it('connexion d’un compte qui a un pseudo : le panneau se ferme (fini), sans écran de compte', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const c = fauxComptes();
    const { fini } = await monter(c);
    $('#accueil-compte-vers-connecter')!.click();
    $('#accueil-compte-adresse')!.value = 'ana@exemple.fr';
    $('#accueil-compte-mdp')!.value = 'motdepasse';
    envoyer('#accueil-compte-form-connecter');
    await attendre();
    await attendre();
    expect(c.connecter).toHaveBeenCalledWith('ana@exemple.fr', 'motdepasse', expect.any(Function));
    expect(fini).toHaveBeenCalledOnce();
    expect($('#accueil-compte-adresse-connectee')).toBeNull();
    expect($('#accueil-compte-deconnecter')).toBeNull();
  });

  it('un compte créé sans pseudo le choisit aussitôt (le message de la création gardé), validé comme au classement', async () => {
    const c = fauxComptes();
    const { fini, surEcran } = await monter(c);
    $('#accueil-compte-vers-creer')!.click();
    $('#accueil-compte-adresse')!.value = 'ana@exemple.fr';
    $('#accueil-compte-mdp')!.value = 'motdepasse';
    envoyer('#accueil-compte-form-creer');
    await attendre();
    await attendre();
    expect(fini).not.toHaveBeenCalled();
    expect($('#accueil-compte-form-pseudo')).not.toBeNull();
    expect(derniereEntree(surEcran)).toBe(false);
    expect($('#accueil-compte-message')!.textContent).toBe('Compte créé. Un e-mail de vérification est parti à ana@exemple.fr.');
    expect($('#accueil-compte-pseudo')!.getAttribute('autocomplete')).toBe('nickname');
    expect($('#accueil-compte-pseudo-plus-tard')!.textContent).toBe(T.pseudo_plus_tard);
    expect($('#accueil-compte-annuler')).toBeNull();
    $('#accueil-compte-pseudo')!.value = 'a/b';
    envoyer('#accueil-compte-form-pseudo');
    expect($('#accueil-compte-erreur')!.textContent).toBe(textes.chrono.pseudo_invalide);
    expect(c.changerPseudo).not.toHaveBeenCalled();
    $('#accueil-compte-pseudo')!.value = '  Ana   Lou ';
    envoyer('#accueil-compte-form-pseudo');
    await attendre();
    await attendre();
    expect(c.changerPseudo).toHaveBeenCalledWith('Ana Lou');
    expect(fini).toHaveBeenCalledOnce();
  });

  it('pendant la fenêtre de Google : le panneau le sait (occupe), « Continuer en invité » ne fermera pas en invité derrière', async () => {
    const c = fauxComptes();
    let rendre!: () => void;
    const fenetre = new Promise<void>((r) => (rendre = r));
    const google = c.google.getMockImplementation()!;
    c.google.mockImplementationOnce(async (...a: Parameters<typeof google>) => {
      await fenetre;
      return google(...a);
    });
    const { occupe } = await monter(c);
    $('#accueil-compte-google')!.click();
    await attendre();
    expect(occupe.mock.calls).toEqual([[true]]);
    rendre();
    await attendre();
    await attendre();
    expect(occupe.mock.calls).toEqual([[true], [false]]);
  });

  it('le focus suit l’écran dans le dialogue : premier champ, titre, bouton principal, et « Annuler » rend le bouton qui avait ouvert', async () => {
    const actif = () => (document as unknown as { activeElement?: El }).activeElement;
    localStorage.setItem('terramemo.pseudo', 'Ana');
    questionConnexion = { sorte: 'appareil', reponses: 3, records: 0, seances: 0 };
    await monter(fauxComptes());
    // Les entrées montées : le focus reste où le panneau l'a mis (son titre).
    expect(actif()).toBeUndefined();
    $('#accueil-compte-vers-connecter')!.click();
    expect(actif()).toBe($('#accueil-compte-adresse'));
    $('#accueil-compte-annuler')!.click();
    expect(actif()).toBe($('#accueil-compte-vers-connecter'));
    $('#accueil-compte-vers-creer')!.click();
    expect(actif()).toBe($('#accueil-compte-adresse'));
    $('#accueil-compte-annuler')!.click();
    expect(actif()).toBe($('#accueil-compte-vers-creer'));
    // La question D22 : son titre ; puis l'écran « fini » : « Continuer ».
    $('#accueil-compte-vers-connecter')!.click();
    $('#accueil-compte-adresse')!.value = 'ana@exemple.fr';
    $('#accueil-compte-mdp')!.value = 'motdepasse';
    envoyer('#accueil-compte-form-connecter');
    await attendre();
    expect(actif()!.tagName).toBe('h3');
    expect(actif()!.getAttribute('tabindex')).toBe('-1');
    expect(actif()!.textContent).toBe(T.titre_fusion);
    $('#accueil-compte-fusion-ajouter')!.click();
    await attendre();
    await attendre();
    expect(actif()).toBe($('#accueil-compte-continuer'));
  });

  it('l’écran du pseudo d’un compte qui n’en a pas : le focus sur son champ', async () => {
    const c = fauxComptes();
    await monter(c);
    $('#accueil-compte-google')!.click();
    await attendre();
    await attendre();
    expect((document as unknown as { activeElement?: El }).activeElement).toBe($('#accueil-compte-pseudo'));
  });

  it('« Plus tard » : le panneau se ferme, le compte sans pseudo', async () => {
    const c = fauxComptes();
    const { fini } = await monter(c);
    $('#accueil-compte-google')!.click();
    await attendre();
    await attendre();
    expect(c.google).toHaveBeenCalledOnce();
    $('#accueil-compte-pseudo-plus-tard')!.click();
    expect(fini).toHaveBeenCalledOnce();
    expect(c.changerPseudo).not.toHaveBeenCalled();
  });

  it('la question D22 au panneau aussi : « Ajouter », puis la fin', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    questionConnexion = { sorte: 'appareil', reponses: 12, records: 0, seances: 0 };
    const c = fauxComptes();
    const { fini, surEcran } = await monter(c);
    $('#accueil-compte-vers-connecter')!.click();
    $('#accueil-compte-adresse')!.value = 'ana@exemple.fr';
    $('#accueil-compte-mdp')!.value = 'motdepasse';
    envoyer('#accueil-compte-form-connecter');
    await attendre();
    expect($('#accueil-compte-fusion-question')!.textContent).toBe('Ajouter les progrès de cet appareil (12 réponses) à ton compte ?');
    expect(derniereEntree(surEcran)).toBe(false);
    $('#accueil-compte-fusion-ajouter')!.click();
    await attendre();
    await attendre();
    // Ce que la connexion a fait se lit avant la fermeture : « Continuer » ferme le panneau.
    expect(fini).not.toHaveBeenCalled();
    expect($('#accueil-compte-fini')!.textContent).toBe('Connecté : ana@exemple.fr. Ton compte a reçu les progrès de cet appareil (12 réponses).');
    expect($('#accueil-compte-continuer')!.getAttribute('aria-describedby')).toBe('accueil-compte-fini');
    expect($('#accueil-compte-message')!.textContent).toBe('');
    expect(derniereEntree(surEcran)).toBe(false);
    $('#accueil-compte-continuer')!.click();
    expect(fini).toHaveBeenCalledOnce();
  });

  it('le pseudo de l’appareil remplacé par celui du compte : dit avant la fermeture, pas perdu avec le panneau', async () => {
    localStorage.setItem('terramemo.pseudo', 'Michel');
    localStorage.setItem('terramemo.pseudo.remplace', 'Bob');
    profilConnexion = { ...PROFIL, pseudo: 'Michel', ancienPseudo: 'Bob' };
    const c = fauxComptes();
    const { fini } = await monter(c);
    $('#accueil-compte-vers-connecter')!.click();
    $('#accueil-compte-adresse')!.value = 'ana@exemple.fr';
    $('#accueil-compte-mdp')!.value = 'motdepasse';
    envoyer('#accueil-compte-form-connecter');
    await attendre();
    await attendre();
    expect(fini).not.toHaveBeenCalled();
    expect($('#accueil-compte-fini')!.textContent).toBe(`Connecté : ana@exemple.fr. ${remplir(T.pseudo_du_compte, { pseudo: 'Michel' })}`);
    $('#accueil-compte-continuer')!.click();
    expect(fini).toHaveBeenCalledOnce();
  });

  it('un compte créé par un joueur qui a un pseudo : « e-mail de vérification parti » lu avant la fermeture', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const c = fauxComptes();
    const { fini } = await monter(c);
    $('#accueil-compte-vers-creer')!.click();
    $('#accueil-compte-adresse')!.value = 'ana@exemple.fr';
    $('#accueil-compte-mdp')!.value = 'motdepasse';
    envoyer('#accueil-compte-form-creer');
    await attendre();
    await attendre();
    expect(fini).not.toHaveBeenCalled();
    expect($('#accueil-compte-fini')!.textContent).toBe('Compte créé. Un e-mail de vérification est parti à ana@exemple.fr.');
    $('#accueil-compte-continuer')!.click();
    expect(fini).toHaveBeenCalledOnce();
  });

  it('e-mail de vérification pas parti : au panneau, on le renvoie depuis ⚙ › Compte (pas « ci-dessous »)', async () => {
    localStorage.setItem('terramemo.pseudo', 'Ana');
    const c = fauxComptes();
    const cree = c.creer.getMockImplementation()!;
    c.creer.mockImplementationOnce(async (...a: Parameters<typeof cree>) => ({ ...(await cree(...a)), verification: false }));
    await monter(c);
    $('#accueil-compte-vers-creer')!.click();
    $('#accueil-compte-adresse')!.value = 'ana@exemple.fr';
    $('#accueil-compte-mdp')!.value = 'motdepasse';
    envoyer('#accueil-compte-form-creer');
    await attendre();
    await attendre();
    expect($('#accueil-compte-fini')!.textContent).toBe(T.cree_sans_email_panneau);
  });

  it('dans l’APK sans le plugin (lot 7) : l’e-mail seul, en bouton principal, et la ligne « Google arrive bientôt »', async () => {
    googleOffert = false;
    await monter(fauxComptes(), { natif: true });
    expect($('#accueil-compte-google')).toBeNull();
    expect($('#accueil-compte-vers-connecter')!.className).toBe('');
    expect($('#accueil-compte-google-aide')!.textContent).toBe(T.google_bientot);
  });

  it('la vue Compte et le panneau dans la même page : aucun id en double', async () => {
    const c = fauxComptes();
    await ouvrir(c);
    await monter(c);
    $('#compte-vers-connecter')!.click();
    $('#accueil-compte-vers-connecter')!.click();
    const ids = zone.querySelectorAll('[id]').map((e) => e.id);
    expect(ids).toContain('compte-adresse');
    expect(ids).toContain('accueil-compte-adresse');
    expect(new Set(ids).size).toBe(ids.length);
  });
});
