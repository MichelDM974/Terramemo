// L'écran « Jouer » (décision « Écran Jouer », ticket #18) : l'arbre (pur,
// src/vues/arbre.ts) — niveaux, saut d'un niveau à un seul choix, fil
// d'Ariane, « ‹ », adresses, Rejouer gardé —, puis la vue (src/vues/jouer.ts)
// sur le DOM factice (tests/dom-factice.ts), et l'Essai J0 dans ⚙.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enregistrerPartie, EPREUVES_CLASSEES, idEpreuve, SERIES_EPREUVES } from '../src/epreuve/chrono';
import type { Pays } from '../src/map/types';
import {
  adresse,
  CLE_DERNIERE,
  creerArbre,
  depuisAncre,
  garderDerniere,
  lireDerniere,
  pasVers,
  SUJETS,
  versAncre,
  type DefSujet,
  type Lancement,
  type Niveau,
} from '../src/vues/arbre';
import { catalogue, SERIE_ESSAI } from '../src/vues/cibles';
import { remplirEssaiJ0, vueJouer, type OptionsJouer } from '../src/vues/jouer';
import { textes } from '../src/vues/textes';
import { El, installerDom, installerStockage } from './dom-factice';

const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const CATALOGUE = catalogue(pays);
const arbre = creerArbre(CATALOGUE);
const SERIES_PAYS = ['tous', 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania'];
const a = (segs: string[]) => adresse(arbre.resoudre(segs));

describe('l’arbre (pur)', () => {
  it('niveaux : deux branches, deux sujets, les séries des pays, les exercices de chaque branche', () => {
    expect(arbre.choix({ type: 'racine' })).toEqual(['entrainement', 'classe']);
    for (const b of ['entrainement', 'classe'] as const) expect(arbre.choix({ type: 'sujets', branche: b })).toEqual(['pays', 'communes']);
    expect(arbre.choix({ type: 'series', branche: 'classe', sujet: 'pays' })).toEqual(SERIES_PAYS);
    expect(arbre.choix({ type: 'series', branche: 'classe', sujet: 'communes' })).toEqual(['reunion']);
    expect(arbre.modes('entrainement', 'pays')).toEqual(['apprendre', 'localiser', 'nommer']);
    // Apprendre : les pays et les communes (défaut D6 : sous La Réunion, ses grappes de communes).
    expect(arbre.modes('entrainement', 'communes')).toEqual(['apprendre', 'localiser', 'nommer']);
    expect(arbre.modes('classe', 'communes')).toEqual(['chrono', 'sansfaute', 'minute']);
  });

  it('même ordre des séries partout : tous, les continents (ordre alphabétique français), l’île ; celui des épreuves et du 🏆', () => {
    expect(CATALOGUE.map((s) => s.id)).toEqual([...SERIES_PAYS, 'reunion']);
    expect(SERIES_EPREUVES).toEqual(CATALOGUE.map((s) => s.id));
    // 🏆 « Toutes les épreuves » : mode par mode, chacun dans cet ordre.
    expect(EPREUVES_CLASSEES.slice(0, 8)).toEqual(CATALOGUE.map((s) => idEpreuve(s.id)));
    expect(EPREUVES_CLASSEES.slice(8, 16)).toEqual(CATALOGUE.map((s) => idEpreuve(s.id, 'sansfaute')));
  });

  it('l’Essai J0 n’est dans aucune liste de Jouer', () => {
    for (const s of SUJETS) expect(arbre.series(s.id).map((x) => x.id)).not.toContain(SERIE_ESSAI);
    expect(a(['entrainement', 'pays', SERIE_ESSAI])).toBe('jouer/entrainement/pays');
    expect(arbre.valide({ branche: 'entrainement', sujet: 'pays', serie: SERIE_ESSAI, mode: 'localiser' })).toBe(false);
  });

  it('un niveau à un seul choix est sauté (Communes mène à La Réunion), règle générale', () => {
    expect(arbre.saute({ type: 'series', branche: 'classe', sujet: 'communes' })).toBe(true);
    expect(arbre.saute({ type: 'series', branche: 'classe', sujet: 'pays' })).toBe(false);
    expect(adresse(arbre.enfant({ type: 'sujets', branche: 'classe' }, 'communes'))).toBe('jouer/classe/communes/reunion');
    expect(a(['entrainement', 'communes'])).toBe('jouer/entrainement/communes/reunion');
    // Les exercices ne sont jamais sautés (ils lancent la partie) ; un sujet seul dans sa branche l'est.
    const seul: DefSujet[] = [{ id: 'pays', series: (c) => c.filter((s) => s.id === 'Europe'), modes: { entrainement: ['localiser'], classe: [] } }];
    const petit = creerArbre(CATALOGUE, seul);
    expect(adresse(petit.resoudre(['entrainement']))).toBe('jouer/entrainement/pays/Europe');
    expect(petit.parent(petit.resoudre(['entrainement']))).toEqual({ type: 'racine' });
    // Une branche sans exercice pour ce sujet ne le propose pas.
    expect(petit.choix({ type: 'sujets', branche: 'classe' })).toEqual([]);
  });

  it('« ‹ » remonte d’un niveau, au-delà des niveaux sautés', () => {
    const p = (n: Niveau) => {
      const r = arbre.parent(n);
      return r && adresse(r);
    };
    expect(p({ type: 'racine' })).toBeNull();
    expect(p({ type: 'sujets', branche: 'classe' })).toBe('jouer');
    expect(p({ type: 'series', branche: 'classe', sujet: 'pays' })).toBe('jouer/classe');
    expect(p({ type: 'exercices', branche: 'classe', sujet: 'pays', serie: 'Africa' })).toBe('jouer/classe/pays');
    expect(p({ type: 'exercices', branche: 'classe', sujet: 'communes', serie: 'reunion' })).toBe('jouer/classe');
  });

  it('fil d’Ariane : « Classé › Pays › Afrique » ; le niveau sauté y reste', () => {
    const fil = (segs: string[]) => arbre.fil(arbre.resoudre(segs)).map((c) => [c.nom, adresse(c.niveau)]);
    expect(fil([])).toEqual([]);
    expect(fil(['classe', 'pays', 'Africa'])).toEqual([
      ['Classé', 'jouer/classe'],
      ['Pays', 'jouer/classe/pays'],
      ['Afrique', 'jouer/classe/pays/Africa'],
    ]);
    expect(fil(['classe', 'communes'])).toEqual([
      ['Classé', 'jouer/classe'],
      ['Communes', 'jouer/classe/communes/reunion'],
      ['La Réunion', 'jouer/classe/communes/reunion'],
    ]);
  });

  it('adresses : une adresse invalide retombe sur le niveau valide le plus proche', () => {
    expect(a([])).toBe('jouer');
    expect(a(['rien'])).toBe('jouer');
    expect(a(['classe', 'drapeaux'])).toBe('jouer/classe');
    expect(a(['classe', 'pays', 'Atlantide'])).toBe('jouer/classe/pays');
    expect(a(['classe', 'pays', 'Africa', 'chrono', 'encore'])).toBe('jouer/classe/pays/Africa');
    expect(a(['classe', 'communes', 'Africa'])).toBe('jouer/classe/communes/reunion');
    // Les ancres : chaque segment encodé, et relu tel quel.
    expect(versAncre('jouer/classe/pays/North America')).toBe('#jouer/classe/pays/North%20America');
    expect(depuisAncre('#jouer/classe/pays/North%20America')).toEqual(['jouer', 'classe', 'pays', 'North America']);
    expect(depuisAncre('#jouer/%E0')).toEqual(['jouer', '%E0']);
    expect(depuisAncre('')).toEqual(['']);
  });

  it('historique : remonter jusqu’à l’entrée qui a cette adresse (la plus récente), 0 si elle n’y est pas', () => {
    const pile = ['carte', 'jouer', 'jouer/classe', 'jouer/classe/pays'];
    expect(pasVers(pile, 'jouer/classe/pays')).toBe(1);
    expect(pasVers(pile, 'jouer')).toBe(3);
    expect(pasVers(pile, 'carte')).toBe(4);
    expect(pasVers(pile, 'chrono')).toBe(0);
    expect(pasVers(['jouer', 'carte', 'jouer'], 'jouer')).toBe(1);
  });

  it('Rejouer : la dernière partie gardée, ignorée si invalide ou disparue de l’arbre', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(lireDerniere(st, arbre)).toBeNull();
    const l: Lancement = { branche: 'classe', sujet: 'pays', serie: 'Africa', mode: 'chrono' };
    garderDerniere(st, l);
    expect(JSON.parse(m.get(CLE_DERNIERE)!)).toEqual(l);
    expect(lireDerniere(st, arbre)).toEqual(l);
    for (const v of ['{pas du json', '42', 'null', '[]', JSON.stringify({ ...l, serie: 'Atlantide' }), JSON.stringify({ ...l, mode: 'localiser' }), JSON.stringify({ ...l, branche: 'autre' }), JSON.stringify({ ...l, serie: 7 })]) {
      m.set(CLE_DERNIERE, v);
      expect(lireDerniere(st, arbre), v).toBeNull();
    }
    // Sans stockage (refusé) : rien, sans exception.
    const refuse = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
    };
    expect(lireDerniere(refuse, arbre)).toBeNull();
    expect(() => garderDerniere(refuse, l)).not.toThrow();
    expect(lireDerniere(null, arbre)).toBeNull();
  });

  it('textes : chaque sujet et chaque branche ont leur nom', () => {
    for (const s of SUJETS) expect((textes.jouer.sujets as Record<string, { nom: string; n: string }>)[s.id]?.nom, s.id).toBeTruthy();
  });
});

// --- La vue ----------------------------------------------------------------

function monter(o: { charger?: () => Promise<unknown>; revision?: OptionsJouer['revision'] } = {}) {
  const zone = new El('main');
  const monde = { nom: 'monde', jouables: [] };
  const ile = { nom: 'reunion', jouables: ['97411', '97415'] };
  let ileChargee = false;
  const charger = vi.fn(
    o.charger ??
      (() => {
        ileChargee = true;
        return Promise.resolve(ile);
      }),
  );
  const terrains = { monde, deja: (n: string) => (n === 'reunion' && ileChargee ? ile : null), charger };
  const ctx = { zone, terrains } as never;
  const opts = {
    lancer: vi.fn<OptionsJouer['lancer']>(),
    fermer: vi.fn<OptionsJouer['fermer']>(),
    pousser: vi.fn<OptionsJouer['pousser']>(),
    remonter: vi.fn<OptionsJouer['remonter']>(),
    canoniser: vi.fn<OptionsJouer['canoniser']>(),
    ...(o.revision ? { revision: o.revision } : {}),
  };
  const v = vueJouer(ctx, arbre, opts);
  const panneau = zone.querySelector('#jouer-panneau')!;
  /** Ouvre Jouer à cette adresse (segments après « jouer »), comme le routeur de main.ts. */
  const ouvrir = (...segs: string[]) => {
    v.activer();
    v.aller(segs);
  };
  const attr = (a: string) => panneau.querySelectorAll(`button[${a}]`).map((b) => b.getAttribute(a));
  return { v, zone, panneau, opts, ouvrir, attr, charger, monde, ile };
}

describe('la vue Jouer', () => {
  beforeEach(() => {
    installerDom();
    installerStockage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Jouer : son titre, « × », les deux branches ; pas de Rejouer sur un appareil neuf, pas de ligne d’aide', () => {
    const j = monter();
    j.ouvrir();
    expect(j.panneau.hidden).toBe(false);
    expect(j.panneau.dataset.niveau).toBe('racine');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Jouer');
    expect(j.attr('data-branche')).toEqual(['entrainement', 'classe']);
    expect(j.panneau.innerText).toContain('Pour apprendre, sans points');
    expect(j.panneau.querySelector('#jouer-rejouer')).toBeNull();
    expect(j.panneau.querySelector('#jouer-haut')).toBeNull();
    expect(j.panneau.innerText).not.toContain('Choisis un exercice');
    j.panneau.querySelector('#jouer-fermer')!.click();
    expect(j.opts.fermer).toHaveBeenCalled();
    j.panneau.querySelector('[data-branche="classe"]')!.click();
    expect(j.opts.pousser).toHaveBeenCalledWith('jouer/classe');
  });

  it('Classé : les sujets avec leur nombre ; Pays mène aux séries, Communes directement aux exercices de La Réunion', () => {
    const j = monter();
    j.ouvrir('classe');
    expect(j.attr('data-sujet')).toEqual(['pays', 'communes']);
    expect(j.panneau.innerText).toContain('195 pays');
    expect(j.panneau.innerText).toContain('24 communes');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Classé');
    j.panneau.querySelector('[data-sujet="pays"]')!.click();
    j.panneau.querySelector('[data-sujet="communes"]')!.click();
    expect(j.opts.pousser.mock.calls).toEqual([['jouer/classe/pays'], ['jouer/classe/communes/reunion']]);
    j.panneau.querySelector('#jouer-haut')!.click();
    expect(j.opts.remonter).toHaveBeenCalledWith('jouer');
  });

  it('Classé › Pays : les 7 séries dans l’ordre, avec leur nombre, sans l’essai', () => {
    const j = monter();
    j.ouvrir('classe', 'pays');
    expect(j.panneau.dataset.niveau).toBe('series');
    expect(j.attr('data-serie')).toEqual(SERIES_PAYS);
    expect(j.panneau.innerText).toContain('54 pays');
    expect(j.panneau.innerText).not.toContain('Essai J0');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Classé›Pays');
    // Le fil : « Classé » mène aux sujets (en remontant l'historique).
    j.panneau.querySelector('h2 a')!.click();
    expect(j.opts.remonter).toHaveBeenCalledWith('jouer/classe');
    j.panneau.querySelector('[data-serie="North America"]')!.click();
    expect(j.opts.pousser).toHaveBeenCalledWith('jouer/classe/pays/North America');
  });

  it('Classé › Pays › Afrique : les trois épreuves, leur phrase courte et leur record ; les règles derrière « ? »', () => {
    const j = monter();
    enregistrerPartie(localStorage, idEpreuve('Africa'), { points: 31_710, justes: 33, questions: 54, temps_ms: 200_000 }, 1);
    enregistrerPartie(localStorage, idEpreuve('Africa', 'minute'), { points: 23, justes: 23, questions: 25, temps_ms: 60_000 }, 1);
    j.ouvrir('classe', 'pays', 'Africa');
    expect(j.panneau.dataset.niveau).toBe('exercices');
    expect(j.attr('data-mode')).toEqual(['chrono', 'sansfaute', 'minute']);
    const ligne = (m: string) => j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText;
    expect(ligne('chrono')).toContain('15 s par question, un seul toucher');
    expect(ligne('chrono')).toContain(`${(31_710).toLocaleString('fr-FR')} pts`);
    expect(ligne('minute')).toContain('23 justes');
    expect(ligne('sansfaute')).not.toContain('record'); // pas encore de record
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Classé›Pays›Afrique');
    const regles = j.panneau.querySelector('#jouer-regles')!;
    expect(regles.hidden).toBe(true);
    j.panneau.querySelector('#jouer-aide')!.click();
    expect(regles.hidden).toBe(false);
    expect(regles.innerText).toContain('Chrono : toutes les questions de la série');
    expect(regles.innerText).toContain('Minute : le plus de lieux justes en 60 s');
    // Ailleurs dans l'arbre (et en entraînement), pas de « ? ».
    j.ouvrir('entrainement', 'pays', 'Africa');
    expect(j.attr('data-mode')).toEqual(['apprendre', 'localiser', 'nommer']);
    expect(j.panneau.querySelector('#jouer-aide')).toBeNull();
    expect(j.panneau.innerText).not.toContain('record');
  });

  it('toucher un exercice lance la partie (le monde tout de suite)', () => {
    const j = monter();
    j.ouvrir('classe', 'pays', 'Europe');
    j.panneau.querySelector('[data-mode="sansfaute"]')!.click();
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
    const [l, s, t, ids] = j.opts.lancer.mock.calls[0]!;
    expect(l).toEqual({ branche: 'classe', sujet: 'pays', serie: 'Europe', mode: 'sansfaute' });
    expect([s.id, t, ids.length]).toEqual(['Europe', j.monde, 44]);
  });

  it('Entraînement › Communes : niveau sauté, adresse canonique, fil complet ; l’île se charge dans Jouer, puis la partie part', async () => {
    const j = monter();
    j.ouvrir('entrainement', 'communes');
    expect(j.opts.canoniser).toHaveBeenCalledWith('jouer/entrainement/communes/reunion');
    expect(j.panneau.dataset.niveau).toBe('exercices');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Entraînement›Communes›La Réunion');
    // « Communes » mène ici (niveau sauté) : du texte, pas un lien ; « ‹ » remonte aux sujets.
    expect(j.panneau.querySelectorAll('h2 a').map((x) => x.textContent)).toEqual(['Entraînement']);
    j.panneau.querySelector('#jouer-haut')!.click();
    expect(j.opts.remonter).toHaveBeenCalledWith('jouer/entrainement');
    j.panneau.querySelector('[data-mode="nommer"]')!.click();
    const statut = j.panneau.querySelector('.jouer-statut')!;
    expect(statut.hidden).toBe(false);
    expect(statut.textContent).toBe(textes.toucher.chargement_terrain);
    expect(j.panneau.querySelectorAll('[data-mode]').every((b) => b.disabled)).toBe(true);
    expect(j.opts.lancer).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
    const [l, s, t, ids] = j.opts.lancer.mock.calls[0]!;
    expect(l).toEqual({ branche: 'entrainement', sujet: 'communes', serie: 'reunion', mode: 'nommer' });
    expect([s.id, t, ids]).toEqual(['reunion', j.ile, ['97411', '97415']]);
  });

  it('l’île hors ligne : l’échec dit au niveau des exercices, rien ne part, on y reste', async () => {
    const j = monter({ charger: () => Promise.reject(new Error('hors ligne')) });
    j.ouvrir('classe', 'communes', 'reunion');
    j.panneau.querySelector('[data-mode="chrono"]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(j.panneau.querySelector('.jouer-statut')?.textContent).toBe(textes.toucher.echec_terrain);
    expect(j.panneau.querySelectorAll('[data-mode]').every((b) => !b.disabled)).toBe(true);
    expect(j.opts.lancer).not.toHaveBeenCalled();
    expect(j.panneau.dataset.niveau).toBe('exercices');
  });

  it('l’île arrivée après avoir quitté le niveau : rien ne part', async () => {
    const j = monter();
    j.ouvrir('classe', 'communes', 'reunion');
    j.panneau.querySelector('[data-mode="chrono"]')!.click();
    j.v.aller(['classe']);
    await Promise.resolve();
    await Promise.resolve();
    expect(j.opts.lancer).not.toHaveBeenCalled();
  });

  it('Rejouer : en tête de Jouer, la dernière partie et son record, relancée d’une touche ; les derniers choix marqués', () => {
    localStorage.setItem(CLE_DERNIERE, JSON.stringify({ branche: 'classe', sujet: 'pays', serie: 'Africa', mode: 'chrono' }));
    enregistrerPartie(localStorage, idEpreuve('Africa'), { points: 31_710, justes: 33, questions: 54, temps_ms: 200_000 }, 1);
    const j = monter();
    j.ouvrir();
    const r = j.panneau.querySelector('#jouer-rejouer')!;
    expect(r.innerText).toContain('↻ Rejouer · Chrono · Afrique');
    expect(r.innerText).toContain(`${(31_710).toLocaleString('fr-FR')} pts`);
    // Le premier bouton du panneau : Rejouer, puis les branches.
    expect(j.panneau.querySelectorAll('button.jouer-bouton')[0]).toBe(r);
    expect(j.panneau.querySelector('[data-branche="classe"]')?.getAttribute('aria-current')).toBe('true');
    expect(j.panneau.querySelector('[data-branche="entrainement"]')?.getAttribute('aria-current')).toBeNull();
    r.click();
    expect(j.opts.lancer.mock.calls[0]?.[0]).toEqual({ branche: 'classe', sujet: 'pays', serie: 'Africa', mode: 'chrono' });
    j.ouvrir('classe', 'pays');
    expect(j.panneau.querySelector('[data-serie="Africa"]')?.getAttribute('aria-current')).toBe('true');
    j.ouvrir('classe', 'pays', 'Africa');
    expect(j.panneau.querySelector('[data-mode="chrono"]')?.getAttribute('aria-current')).toBe('true');
    // Un autre choix fait à un niveau devient le marqué.
    j.ouvrir('classe', 'pays');
    j.panneau.querySelector('[data-serie="Asia"]')!.click();
    j.ouvrir('classe', 'pays');
    expect(j.panneau.querySelector('[data-serie="Asia"]')?.getAttribute('aria-current')).toBe('true');
    expect(j.panneau.querySelector('[data-serie="Africa"]')?.getAttribute('aria-current')).toBeNull();
  });

  it('Rejouer d’une série disparue ou d’une valeur illisible : pas de ligne', () => {
    for (const v of [JSON.stringify({ branche: 'classe', sujet: 'pays', serie: 'Atlantide', mode: 'chrono' }), '{pas du json']) {
      localStorage.setItem(CLE_DERNIERE, v);
      const j = monter();
      j.ouvrir();
      expect(j.panneau.querySelector('#jouer-rejouer'), v).toBeNull();
    }
  });

  it('un message annoncé (partie abandonnée) s’affiche au niveau suivant, une fois', () => {
    const j = monter();
    j.v.annoncer(textes.chrono.abandon);
    j.ouvrir('classe', 'pays', 'Africa');
    expect(j.panneau.querySelector('.jouer-statut')?.textContent).toBe(textes.chrono.abandon);
    j.v.aller(['classe', 'pays']);
    expect(j.panneau.querySelector('.jouer-statut')?.hidden).toBe(true);
  });

  it('Révision du jour : en tête d’Entraînement avec ses comptes, lancée d’une touche ; absente de Classé', () => {
    const comptes = { aRevoir: 12, nouveaux: 6 };
    const revision = { comptes: () => comptes, garde: () => true, lancer: vi.fn() };
    const j = monter({ revision });
    j.ouvrir('entrainement');
    const r = j.panneau.querySelector('#jouer-revision')!;
    expect(j.panneau.querySelectorAll('button.jouer-bouton')[0]).toBe(r);
    expect(r.innerText).toContain('Révision du jour');
    expect(r.innerText).toContain('12 à revoir · 6 nouveaux');
    expect(r.innerText).not.toContain('record');
    expect(r.disabled).toBe(false);
    expect(j.attr('data-sujet')).toEqual(['pays', 'communes']);
    r.click();
    expect(revision.lancer).toHaveBeenCalledTimes(1);
    // Pas d'adresse dans l'arbre : la ligne ne pousse rien.
    expect(j.opts.pousser).not.toHaveBeenCalled();
    expect(j.opts.lancer).not.toHaveBeenCalled();
    j.ouvrir('classe');
    expect(j.panneau.querySelector('#jouer-revision')).toBeNull();
    j.ouvrir();
    expect(j.panneau.querySelector('#jouer-revision')).toBeNull();
  });

  it('Révision du jour : désactivée pendant le chargement de la mémoire, redessinée une fois chargée ; « À jour » ; avis si rien n’est gardé', () => {
    let comptes: { aRevoir: number; nouveaux: number } | null = null;
    let garde = true;
    const revision = { comptes: () => comptes, garde: () => garde, lancer: vi.fn() };
    const j = monter({ revision });
    j.ouvrir('entrainement');
    const ligne = () => j.panneau.querySelector('#jouer-revision')!;
    expect(ligne().disabled).toBe(true);
    expect(ligne().innerText).toContain(textes.seance.chargement);
    ligne().click();
    expect(revision.lancer).not.toHaveBeenCalled();
    comptes = { aRevoir: 3, nouveaux: 0 };
    j.v.rafraichir();
    expect(ligne().disabled).toBe(false);
    expect(ligne().innerText).toContain('3 à revoir');
    expect(ligne().innerText).not.toContain('nouveaux');
    comptes = { aRevoir: 0, nouveaux: 0 };
    garde = false;
    // Au retour dans Jouer (activer) : les comptes relus.
    j.v.desactiver();
    j.ouvrir('entrainement');
    expect(ligne().innerText).toContain(textes.seance.a_jour);
    expect(ligne().disabled).toBe(true);
    expect(ligne().innerText).toContain(textes.seance.non_garde);
  });

  it('Apprendre : un exercice des séries de Pays, lancé comme les autres (Rejouer le relance)', () => {
    const j = monter();
    j.ouvrir('entrainement', 'pays', 'Europe');
    const b = j.panneau.querySelector('[data-mode="apprendre"]')!;
    expect(b.innerText).toContain('Apprendre');
    b.click();
    expect(j.opts.lancer.mock.calls[0]?.[0]).toEqual({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'apprendre' });
    const l: Lancement = { branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'apprendre' };
    garderDerniere(localStorage, l);
    expect(lireDerniere(localStorage, arbre)).toEqual(l);
    expect(arbre.valide({ ...l, sujet: 'communes', serie: 'reunion' })).toBe(true);
    expect(arbre.valide({ ...l, branche: 'classe' })).toBe(false);
  });

  it('Apprendre sous La Réunion : sa phrase dit les communes ; l’île se charge dans Jouer, puis la séance part sur elle', async () => {
    const j = monter();
    j.ouvrir('entrainement', 'communes', 'reunion');
    expect(j.attr('data-mode')).toEqual(['apprendre', 'localiser', 'nommer']);
    const b = j.panneau.querySelector('[data-mode="apprendre"]')!;
    expect(b.innerText).toContain(textes.jouer.exercices.apprendre_communes);
    const pays = (() => {
      const k = monter();
      k.ouvrir('entrainement', 'pays', 'Europe');
      return k.panneau.querySelector('[data-mode="apprendre"]')!.innerText;
    })();
    expect(pays).toContain(textes.jouer.exercices.apprendre);
    b.click();
    expect(j.opts.lancer).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    const [l, s, t] = j.opts.lancer.mock.calls[0]!;
    expect(l).toEqual({ branche: 'entrainement', sujet: 'communes', serie: 'reunion', mode: 'apprendre' });
    expect([s.id, t]).toEqual(['reunion', j.ile]);
  });

  it('Jouer quitté : le panneau se cache', () => {
    const j = monter();
    j.ouvrir();
    j.v.desactiver();
    expect(j.panneau.hidden).toBe(true);
  });
});

describe('l’Essai J0 dans ⚙', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());

  it('index.html lui donne sa place dans la popup des réglages, à côté de l’Essai des claviers', () => {
    const html = readFileSync('index.html', 'utf8');
    const popup = html.slice(html.indexOf('id="settings-popup"'), html.indexOf('</div>', html.indexOf('id="credits-donnees"')));
    expect(popup).toContain('id="lien-saisie"');
    expect(popup).toContain('id="reglage-essai"');
  });

  it('Trouver ou Reconnaître sur la série « essai »', () => {
    const p = new El('p');
    const lancer = vi.fn();
    remplirEssaiJ0(p as unknown as HTMLElement, lancer);
    expect(p.innerText).toContain('Essai J0');
    expect(p.querySelectorAll('button').map((b) => [b.dataset.mode, b.textContent])).toEqual([
      ['localiser', 'Trouver'],
      ['nommer', 'Reconnaître'],
    ]);
    p.querySelector('button[data-mode="nommer"]')!.click();
    expect(lancer).toHaveBeenCalledWith('nommer');
  });
});
