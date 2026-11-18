// Fiche d'un lieu jamais pendant une partie (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.8 et § 7) : une seule
// liste des barres de partie, que la règle de carte.css cite telle quelle ; une
// partie de Toucher quittée en cours de route attend sur la carte : ni faits,
// ni chevron, ni fiche tant qu'elle n'est pas finie (la vraie vue de Toucher et
// la vraie vue de la carte, sur le DOM factice).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lireFichesCommunes, lireFichesMonde, type FichierCommunes, type FichierCommunesLangue, type FichierMonde, type FichierMondeLangue } from '../src/fiches/donnees';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import type { Pays } from '../src/map/types';
import { BARRES_PARTIE, barrePartieVisible, ligneFiche, type ContexteVue } from '../src/vues/commun';
import { textes } from '../src/vues/textes';
import { vueEssai } from '../src/vues/essai';
import { cheminBilan, creerNavigation, type VueNavigable } from '../src/navigation';
import { versAncre } from '../src/vues/arbre';
import { vueExplorer } from '../src/vues/explorer';
import { textesFiche } from '../src/vues/textes-fiche';
import { El, installerDom, installerStockage } from './dom-factice';

const lire = <T>(f: string): T => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8')) as T;

describe('une seule liste des barres de partie', () => {
  it('la règle de carte.css qui efface la recherche cite exactement BARRES_PARTIE, dans son ordre', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    const regles = css.split('}').filter((r) => /\.recherche\s*\{\s*visibility:\s*hidden/.test(r));
    expect(regles).toHaveLength(1);
    const cites = [...regles[0]!.matchAll(/#([\w-]+):not\(\[hidden\]\)/g)].map((m) => m[1]);
    expect(cites).toEqual([...BARRES_PARTIE]);
  });

  describe('barrePartieVisible', () => {
    beforeEach(() => installerDom());
    afterEach(() => vi.unstubAllGlobals());

    it('vrai dès qu’une barre de la liste est affichée, faux sinon (absente ou cachée)', () => {
      const barres = new Map<string, El>();
      const doc = { getElementById: (id: string) => barres.get(id) ?? null } as unknown as Document;
      expect(barrePartieVisible(doc)).toBe(false);
      for (const id of BARRES_PARTIE) {
        const b = new El('div');
        b.hidden = true;
        barres.set(id, b);
      }
      expect(barrePartieVisible(doc)).toBe(false);
      for (const id of BARRES_PARTIE) {
        barres.get(id)!.hidden = false;
        expect(barrePartieVisible(doc), id).toBe(true);
        barres.get(id)!.hidden = true;
      }
      // Une barre hors de la liste (celle de l'accueil) ne compte pas.
      const accueil = new El('div');
      barres.set('barre-carte', accueil);
      expect(barrePartieVisible(doc)).toBe(false);
    });
  });
});

describe('une partie de Toucher en suspens sur la carte', () => {
  beforeEach(() => {
    installerDom();
    installerStockage();
  });
  afterEach(() => vi.unstubAllGlobals());

  const tenir = () => new Promise((r) => setTimeout(r, 0));

  function monter() {
    const pays = lire<Pays[]>('pays.json');
    const zone = new El('main');
    let pickSuivant = 'JPN';
    const carte = {
      cacherPastilles() {},
      effacerMarques() {},
      marquer() {},
      anneau() {},
      anneauEn() {},
      teinter() {},
      montrer() {},
      montrerZone() {},
      cadrer() {},
      zoomer() {},
      vueEntiere() {},
      pick: () => ({ id: pickSuivant, via: 'trace' }),
      noter: (id: string) => ({ juste: false, pick: { id }, distance_km: 250 }),
      hote: new El('div'),
      contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
      projection: { scale: () => 100 },
      transfo: { k: 1 },
    };
    const donnees = { entites: pays.map((p) => ({ pays: p })), noms: lire<Record<string, string>>('noms.fr.json') };
    const monde = { nom: 'monde', carte, donnees, jouables: ['FRA', 'ESP'] };
    const ctx = {
      carte,
      donnees,
      zone,
      terrains: { monde, montrer() {}, deja: () => null },
      mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
    } as unknown as ContexteVue;
    const essai = vueEssai(ctx, { versJouer: () => undefined });
    const doc = { getElementById: (id: string) => zone.querySelector(`#${id}`) } as unknown as Document;
    // Comme ficheAutorisee de main.ts : aucune barre de partie visible, aucune partie de Toucher en suspens.
    const autorisee = () => !barrePartieVisible(doc) && !essai.enSuspens();
    const fiches = lireFichesMonde(lire<FichierMonde>('fiches-monde.json'), lire<FichierMondeLangue>('fiches-monde.fr.json'));
    const capitales = lireCapitales(lire<LigneCapitales[]>('capitales.json'), lire<NomsCapitales>('capitales.fr.json'));
    // L'historique (navigation.ts) : chaque geste noté ; une fiche demandée est rendue aussitôt, comme le fait router().
    const gestes: string[] = [];
    const historique = {
      pousser: (l: { terrain: string; id: string }) => {
        gestes.push(`pousser ${l.id}`);
        carteVue.surFiche({ ...l, rang: 1 });
      },
      quitter: () => void gestes.push('quitter'),
      retour: () => void gestes.push('retour'),
    };
    const carteVue = vueExplorer(ctx, {
      fiche: {
        fiches: () => Promise.resolve(fiches),
        capitales: () => Promise.resolve(capitales),
        drapeaux: () => Promise.reject(new Error('pas ici')),
        module: () => import('../src/vues/fiche'),
        autorisee,
        historique,
      },
    });
    const el = (sel: string) => zone.querySelector(sel)!;
    return {
      essai,
      carteVue,
      autorisee,
      gestes,
      toucherCarte: (id: string) => {
        pickSuivant = id;
        carteVue.toucher?.(1, 1, {} as PointerEvent);
      },
      faits: () => el('#barre-carte .barre-faits').textContent,
      chevron: () => !el('#barre-carte .barre-chevron').hidden,
      ouverte: () => !!zone.querySelector('#fiche-lieu') && !zone.querySelector('#fiche-lieu')!.hidden,
      el,
      /** Trouver sur la France et l'Espagne, lancé depuis Jouer : la vue de Toucher active, la carte quittée. */
      lancer: () => {
        carteVue.desactiver();
        essai.activer();
        essai.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'localiser' }, { id: 'Europe', terrain: 'monde', ids: ['FRA', 'ESP'], n: 2 }, monde as never, ['FRA', 'ESP']);
      },
      /** Le routeur : Toucher quittée pour la carte (le logo, la recherche), ou l'inverse. */
      versCarte: () => {
        essai.desactiver();
        carteVue.activer();
      },
      versToucher: () => {
        carteVue.desactiver();
        essai.activer();
      },
    };
  }

  it('pendant la question : une barre de partie visible, la fiche n’est pas autorisée', () => {
    const v = monter();
    v.lancer();
    expect(v.el('#barre-essai').hidden).toBe(false);
    expect(v.autorisee()).toBe(false);
  });

  it('quittée en cours de route : sur la carte, un toucher ne montre ni faits ni chevron, la fiche ne s’ouvre pas ; la partie finie et son bilan montré, tout revient', async () => {
    const v = monter();
    v.lancer();
    v.versCarte();
    // La barre de partie est cachée, mais la partie attend : en suspens.
    expect(v.el('#barre-essai').hidden).toBe(true);
    expect(v.essai.enSuspens()).toBe(true);
    expect(v.essai.aMontrer?.()).toBe(true);
    v.toucherCarte('JPN');
    await tenir();
    expect(v.el('#barre-carte .barre-nom').textContent).toBe('Japon');
    expect(v.faits()).toBe('');
    expect(v.chevron()).toBe(false);
    (v.el('#barre-fiche') as El).click();
    expect(v.gestes).toEqual([]);
    // Une entrée de fiche rendue par un retour (on y revient depuis Jouer) : refusée, et l'entrée rendue à
    // l'historique (§ 7 : le retour suivant montre la vue d'avant, aucune entrée orpheline).
    v.carteVue.surFiche({ terrain: 'monde', id: 'JPN', rang: 1 });
    await tenir();
    expect(v.ouverte()).toBe(false);
    expect(v.gestes).toEqual(['quitter']);
    // Retour à la partie, finie par « Terminer » : son bilan montré, plus rien en suspens.
    v.versToucher();
    expect(v.el('#barre-essai').hidden).toBe(false);
    (v.el('#essai-terminer') as El).click();
    expect(v.el('#essai-bilan').hidden).toBe(false);
    expect(v.essai.enSuspens()).toBe(false);
    // Le bilan reste à remontrer (aMontrer), sans rien en suspens.
    v.versCarte();
    expect(v.essai.aMontrer?.()).toBe(true);
    expect(v.essai.enSuspens()).toBe(false);
    v.toucherCarte('JPN');
    // La ligne de faits attend le morceau de la fiche, demandé avec les données (étude § 19) : importé la première fois.
    await vi.waitFor(() => expect(v.faits()).toBe('Capitale : Tokyo'));
    expect(v.chevron()).toBe(true);
    (v.el('#barre-fiche') as El).click();
    await vi.waitFor(() => expect(v.ouverte()).toBe(true));
    expect(v.gestes).toEqual(['quitter', 'pousser JPN']);
  });
});

// --- Depuis un bilan (lot F6, étude § 4.6, § 4.4 et § 7) ---------------------------------------------------------
// La vraie vue de Toucher (Trouver, Reconnaître), la vraie vue de la carte et la vraie navigation, sur un historique
// factice (go() différé, deux router() par traversée, comme Chromium) ; ctx.ouvrirFiche fait ce que fait main.ts
// (ficheDepuisBilan). Le DOM factice ne met rien en page : la hauteur des lignes et le focus réel sont au pilote
// (driver.py ui_fiche, partie « bilan »).

/** window.history et location.hash : des entrées, la courante, les go() en attente. */
class HistoriqueFactice {
  entrees: { etat: unknown; ancre: string }[] = [{ etat: null, ancre: '' }];
  i = 0;
  attente: number[] = [];
  get state(): unknown {
    return this.entrees[this.i]!.etat;
  }
  get ancre(): string {
    return this.entrees[this.i]!.ancre;
  }
  pushState(etat: unknown, _u: string, url?: string): void {
    this.entrees = [...this.entrees.slice(0, this.i + 1), { etat: structuredClone(etat), ancre: url ?? this.ancre }];
    this.i++;
  }
  replaceState(etat: unknown, _u: string, url?: string): void {
    this.entrees[this.i] = { etat: structuredClone(etat), ancre: url ?? this.ancre };
  }
  go(n: number): void {
    this.attente.push(n);
  }
}

describe('depuis un bilan : la fiche du lieu juste, et le retour au bilan (lot F6)', () => {
  beforeEach(() => {
    installerDom();
    installerStockage();
  });
  // Le focus rendu à la ligne repasse deux images plus tard (rendreFocusLigne) : ses requestAnimationFrame finis
  // avant que les globales factices ne tombent (sinon « requestAnimationFrame is not defined » sous charge).
  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    vi.unstubAllGlobals();
  });

  const tenir = () => new Promise((r) => setTimeout(r, 0));
  const pays = lire<Pays[]>('pays.json');
  const noms = lire<Record<string, string>>('noms.fr.json');
  const communes = lire<Pays[]>('reunion/communes.json');
  const nomsIle = lire<Record<string, string>>('reunion/noms.fr.json');
  const FICHES = lireFichesMonde(lire<FichierMonde>('fiches-monde.json'), lire<FichierMondeLangue>('fiches-monde.fr.json'));
  const CAPITALES = lireCapitales(lire<LigneCapitales[]>('capitales.json'), lire<NomsCapitales>('capitales.fr.json'));
  const COMMUNES = lireFichesCommunes(lire<FichierCommunes>('reunion/fiches.json'), lire<FichierCommunesLangue>('reunion/fiches.fr.json'));

  /** `horsLigne` : le morceau de la fiche ne vient pas (hors ligne, absent du cache). */
  function brancher(o: { horsLigne?: boolean } = {}) {
    const h = new HistoriqueFactice();
    const zone = new El('main');
    const carte = () => ({
      cacherPastilles() {},
      effacerMarques() {},
      marquer() {},
      anneau() {},
      anneauEn() {},
      teinter() {},
      montrer() {},
      montrerZone() {},
      cadrer() {},
      zoomer() {},
      vueEntiere() {},
      pick: () => null,
      // Chaque toucher d'une question est faux : le Brésil (sur l'île : Saint-Paul), à 250 km.
      noter: (_id: string) => ({ juste: false, pick: { id: 'BRA' }, distance_km: 250 }),
      hote: new El('div'),
      contexte: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
      contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
      projection: { scale: () => 100 },
      transfo: { k: 1 },
    });
    const donnees = { entites: pays.map((p) => ({ pays: p })), noms };
    const monde = { nom: 'monde', carte: carte(), donnees, jouables: pays.filter((p) => p.statut === 'jouable').map((p) => p.id) };
    const ile = { nom: 'reunion', carte: carte(), donnees: { entites: communes.map((c) => ({ pays: c })), noms: nomsIle }, jouables: communes.map((c) => c.id) };
    let ileChargee = false;
    /** Le terrain montré en dernier (terrains.montrer). */
    let montre = 'monde';
    let nav!: ReturnType<typeof creerNavigation<VueNavigable>>;
    let explorer!: ReturnType<typeof vueExplorer>;
    const ouvertes: string[] = [];
    // La colle de main.ts (navigation.ts : cheminBilan), avec la vraie navigation : l'adresse du bilan lue à la pile.
    let chemin!: ReturnType<typeof cheminBilan>;
    const ctx = {
      carte: monde.carte,
      donnees,
      zone,
      terrains: {
        monde,
        montrer: (n: string) => void (montre = n),
        deja: (n: string) => (n === 'reunion' && ileChargee ? ile : null),
        charger: (n: string) => (n === 'reunion' ? ((ileChargee = true), Promise.resolve(ile)) : Promise.reject(new Error(n))),
      },
      mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
      ouvrirFiche: (t: string, id: string) => {
        ouvertes.push(`${t}:${id}`);
        return chemin.ouvrir(t, id);
      },
    } as unknown as ContexteVue;
    const essai = vueEssai(ctx, { versJouer: () => undefined, versCarte: () => nav.remonter('carte') });
    const doc = { getElementById: (id: string) => zone.querySelector(`#${id}`) } as unknown as Document;
    const autorisee = () => !barrePartieVisible(doc) && !essai.enSuspens();
    /** Le retour du navigateur (et history.back()) : un pas, deux router(). */
    const retourNavigateur = () => {
      h.i--;
      nav.router();
      nav.router();
    };
    explorer = vueExplorer(ctx, {
      fiche: {
        fiches: () => Promise.resolve(FICHES),
        capitales: () => Promise.resolve(CAPITALES),
        drapeaux: () => Promise.reject(new Error('pas ici')),
        fichesCommunes: () => Promise.resolve(COMMUNES),
        module: () => (o.horsLigne ? Promise.reject(new Error('hors ligne')) : import('../src/vues/fiche')),
        historique: { pousser: (l) => nav.pousserFiche(l), quitter: () => nav.quitterFiches(), retour: retourNavigateur },
        autorisee,
        retourBilan: () => chemin.retour(),
      },
    });
    const classement = { activer() {}, desactiver() {} };
    const vues = new Map<string, VueNavigable>([
      ['carte', explorer],
      ['toucher', essai],
      ['classement', classement],
    ]);
    nav = creerNavigation({
      history: h,
      ancre: () => h.ancre,
      noms: ['carte', 'toucher', 'classement'],
      accueil: 'carte',
      passage: ['classement'],
      arbre: 'jouer',
      vue: (n) => vues.get(n),
      aller: () => undefined,
      surFiche: (f) => explorer.surFiche(f),
      annoncer: () => undefined,
      canonique: (c) => c,
    });
    chemin = cheminBilan(nav, { autorisee, ouvrirFiche: (t, id) => explorer.ouvrirFiche(t as never, id) });
    /** Les go() demandés, chacun une traversée (deux router()). */
    const traverser = () => {
      for (let n = h.attente.shift(); n !== undefined; n = h.attente.shift()) {
        h.i += n;
        nav.router();
        nav.router();
      }
    };
    const lien = (a: string) => {
      h.pushState(null, '', versAncre(a));
      nav.router();
      nav.router();
    };
    lien('classement');
    lien('carte');
    const el = (sel: string) => zone.querySelector(sel);
    return {
      h,
      nav,
      zone,
      essai,
      explorer,
      ouvertes,
      monde,
      ile,
      montre: () => montre,
      ouvrirFiche: (t: string, id: string) => ctx.ouvrirFiche!(t as never, id),
      traverser,
      retourNavigateur,
      ici: () => h.ancre.replace(/^#/, '') || 'carte',
      lien,
      el,
      bilan: () => el('#essai-bilan')!,
      lignes: () => zone.querySelectorAll('#essai-bilan .essai-rates li button.ligne-fiche'),
      ouverte: () => !!el('#fiche-lieu') && !el('#fiche-lieu')!.hidden,
      titre: () => el('#fiche-titre')?.textContent ?? null,
      avant: () => el('#fiche-lieu .fiche-avant')!,
      voisin: (id: string) => (el('#fiche-lieu')!.querySelectorAll('.fiche-voisins .fiche-voisin').find((b) => b.dataset.id === id) as El).click(),
      /** Une partie de Trouver lancée comme main.ts (une entrée), chaque question touchée faux puis passée, puis le bilan. */
      trouver(terrain: 'monde' | 'reunion', ids: string[]) {
        const t = terrain === 'monde' ? monde : ile;
        nav.ouvrirPartie('toucher');
        essai.lancer({ branche: 'entrainement', sujet: terrain === 'monde' ? 'pays' : 'communes', serie: 'x', mode: 'localiser' }, { id: 'x', terrain, ids, n: ids.length }, t as never, ids);
        for (let k = 0; k < ids.length; k++) {
          essai.toucher?.(1, 1, {} as PointerEvent);
          (el('#essai-passer') as El).click();
        }
      },
    };
  }

  it('Trouver : chaque erreur est un bouton de son lieu ; touchée, la carte et sa fiche ; deux voisins, puis « ‹ » ×2 et « ‹ Retour au bilan » rend le bilan, le focus à la ligne', async () => {
    const v = brancher();
    v.trouver('monde', ['FRA', 'ESP']);
    expect(v.bilan().hidden).toBe(false);
    expect(v.ici()).toBe('toucher');
    const lignes = v.lignes();
    expect(lignes.map((b) => b.dataset.id).sort()).toEqual(['ESP', 'FRA']);
    const france = lignes.find((b) => b.dataset.id === 'FRA')!;
    const avant = v.h.i;
    france.click();
    expect(v.ouvertes).toEqual(['monde:FRA']);
    // La carte (une entrée), puis la fiche (une de plus), marquée « bilan » ; le bilan caché, gardé pour le retour.
    expect(v.ici()).toBe('carte');
    expect(v.h.i).toBe(avant + 2);
    expect(v.nav.fiche()).toEqual({ terrain: 'monde', id: 'FRA', rang: 1, bilan: true });
    expect(v.bilan().hidden).toBe(true);
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    expect(v.el('#barre-carte')!.dataset.id).toBe('FRA');
    // « ‹ » dit « Retour au bilan » sur la première fiche.
    expect(v.avant().hidden).toBe(false);
    expect(v.avant().getAttribute('aria-label')).toBe(textesFiche.avant_bilan);
    // Deux voisins : « ‹ » redevient « Fiche d'avant ».
    v.voisin('ESP');
    await vi.waitFor(() => expect(v.titre()).toBe('Espagne'));
    v.voisin('PRT');
    await vi.waitFor(() => expect(v.titre()).toBe('Portugal'));
    expect(v.avant().getAttribute('aria-label')).toBe(textesFiche.avant);
    expect(v.nav.fiche()).toMatchObject({ id: 'PRT', rang: 3 });
    (v.avant() as El).click();
    await vi.waitFor(() => expect(v.titre()).toBe('Espagne'));
    (v.avant() as El).click();
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    expect(v.avant().getAttribute('aria-label')).toBe(textesFiche.avant_bilan);
    (v.avant() as El).click();
    v.traverser();
    // Le bilan rendu, sur son terrain, la fiche fermée ; le focus à la ligne touchée.
    expect(v.ici()).toBe('toucher');
    expect(v.h.i).toBe(avant);
    expect(v.bilan().hidden).toBe(false);
    expect(v.ouverte()).toBe(false);
    expect(v.montre()).toBe('monde');
    expect((document as unknown as { activeElement?: unknown }).activeElement).toBe(france);
  });

  it('« × » laisse la carte, le lieu montré, la fiche fermée ; le retour du navigateur rend ensuite le bilan', async () => {
    const v = brancher();
    v.trouver('monde', ['FRA']);
    const avant = v.h.i;
    v.lignes()[0]!.click();
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    v.voisin('ESP');
    await vi.waitFor(() => expect(v.titre()).toBe('Espagne'));
    (v.el('#fiche-lieu .croix') as El).click();
    v.traverser();
    expect(v.ici()).toBe('carte');
    expect(v.ouverte()).toBe(false);
    expect(v.nav.fiche()).toBeNull();
    expect(v.el('#barre-carte')!.dataset.id).toBe('ESP');
    expect(v.h.i).toBe(avant + 1);
    v.retourNavigateur();
    expect(v.ici()).toBe('toucher');
    expect(v.bilan().hidden).toBe(false);
  });

  it('un détour par une vue de passage (🏆, Crédits du pied de la fiche) puis son « Retour » : « ‹ Retour au bilan » rend toujours le bilan', async () => {
    const v = brancher();
    v.trouver('monde', ['FRA']);
    const avant = v.h.i;
    v.lignes()[0]!.click();
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    v.lien('classement');
    expect(v.ouverte()).toBe(false);
    v.nav.retour();
    v.traverser();
    expect(v.ici()).toBe('carte');
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    expect(v.avant().getAttribute('aria-label')).toBe(textesFiche.avant_bilan);
    (v.avant() as El).click();
    v.traverser();
    expect(v.ici()).toBe('toucher');
    expect(v.h.i).toBe(avant);
    expect(v.bilan().hidden).toBe(false);
    expect(v.ouverte()).toBe(false);
  });

  it('le retour du navigateur sur la première fiche la ferme (la carte, le lieu montré) ; le suivant rend le bilan', async () => {
    const v = brancher();
    v.trouver('monde', ['FRA']);
    v.lignes()[0]!.click();
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    v.retourNavigateur();
    expect(v.ici()).toBe('carte');
    expect(v.ouverte()).toBe(false);
    v.retourNavigateur();
    expect(v.ici()).toBe('toucher');
    expect(v.bilan().hidden).toBe(false);
  });

  it('l’île : une commune ratée ouvre sa fiche sur l’île ; « ‹ Retour au bilan » rend le bilan, l’île remontrée', async () => {
    const v = brancher();
    v.trouver('reunion', ['97416']);
    expect(v.montre()).toBe('reunion');
    const ligne = v.lignes()[0]!;
    expect(ligne.dataset.id).toBe('97416');
    expect(ligne.getAttribute('aria-label')).toContain('Fiche : Saint-Pierre. ');
    ligne.click();
    expect(v.ouvertes).toEqual(['reunion:97416']);
    await vi.waitFor(() => expect(v.titre()).toBe('Saint-Pierre'));
    expect(v.nav.fiche()).toEqual({ terrain: 'reunion', id: '97416', rang: 1, bilan: true });
    v.voisin('97422');
    await vi.waitFor(() => expect(v.titre()).toBe('Le Tampon'));
    expect(v.nav.fiche()).toMatchObject({ terrain: 'reunion', id: '97422', rang: 2 });
    (v.avant() as El).click();
    await vi.waitFor(() => expect(v.titre()).toBe('Saint-Pierre'));
    (v.avant() as El).click();
    v.traverser();
    expect(v.ici()).toBe('toucher');
    expect(v.bilan().hidden).toBe(false);
    expect(v.montre()).toBe('reunion');
  });

  it('Reconnaître : la faute ouvre la fiche de la cible, jamais celle du leurre choisi', async () => {
    const v = brancher();
    const ids = ['FRA'];
    v.nav.ouvrirPartie('toucher');
    v.essai.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'x', mode: 'nommer' }, { id: 'x', terrain: 'monde', ids, n: 1 }, v.monde as never, ids);
    const leurre = v.zone.querySelectorAll('#barre-nommer .nommer-choix').find((b) => b.dataset.id && b.dataset.id !== 'FRA')!;
    const choisi = leurre.dataset.id!;
    (leurre as El).click();
    (v.el('#nommer-terminer') as El).click();
    expect(v.bilan().hidden).toBe(false);
    const lignes = v.lignes();
    expect(lignes.map((b) => b.dataset.id)).toEqual(['FRA']);
    expect(lignes[0]!.querySelector('.ligne-fiche-texte')!.textContent).toContain(noms[choisi]!);
    lignes[0]!.click();
    expect(v.ouvertes).toEqual(['monde:FRA']);
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
  });

  it('pendant une question (une barre de partie visible), ctx.ouvrirFiche ne fait rien : ni carte, ni fiche, la partie reste', () => {
    const v = brancher();
    const ids = ['FRA', 'ESP'];
    v.nav.ouvrirPartie('toucher');
    v.essai.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'x', mode: 'localiser' }, { id: 'x', terrain: 'monde', ids, n: 2 }, v.monde as never, ids);
    expect(v.el('#barre-essai')!.hidden).toBe(false);
    const i = v.h.i;
    // Ceinture : les lignes touchables n'existent qu'au bilan ; appelé quand même, la garde (ficheAutorisee) refuse.
    v.ouvrirFiche('monde', 'FRA');
    expect(v.ouvertes).toEqual(['monde:FRA']);
    expect(v.h.i).toBe(i);
    expect(v.ici()).toBe('toucher');
    expect(v.el('#barre-essai')!.hidden).toBe(false);
    expect(v.nav.fiche()).toBeNull();
  });

  it('une partie de Trouver en suspens, puis le bilan d’une autre vue (Chrono, quiz) : la ligne touchée dit pourquoi la fiche ne s’ouvre pas', () => {
    const v = brancher();
    const ids = ['FRA', 'ESP'];
    v.nav.ouvrirPartie('toucher');
    v.essai.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'x', mode: 'localiser' }, { id: 'x', terrain: 'monde', ids, n: 2 }, v.monde as never, ids);
    // Quittée par un lien de l'en-tête : la partie attend sur la carte.
    v.lien('classement');
    expect(v.essai.enSuspens()).toBe(true);
    // Une ligne d'un bilan d'une autre vue (comme chrono.ts et quiz.ts la posent), touchée.
    const li = ligneFiche('ESP', 'Espagne', 'Espagne : 250 km', () => v.ouvrirFiche('monde', 'ESP')) as unknown as El;
    const i = v.h.i;
    (li.querySelector('button.ligne-fiche') as El).click();
    expect(v.h.i).toBe(i);
    expect(v.nav.fiche()).toBeNull();
    expect(li.querySelector('.ligne-fiche-refus')!.textContent).toBe(textes.bilan.fiche_refusee);
    expect(li.querySelector('.ligne-fiche-refus')!.getAttribute('role')).toBe('status');
  });

  it('hors ligne (le morceau de la fiche ne vient pas) : la carte, le lieu montré, la barre le dit ; le retour rend le bilan', async () => {
    const v = brancher({ horsLigne: true });
    v.trouver('monde', ['FRA']);
    const avant = v.h.i;
    v.lignes()[0]!.click();
    await vi.waitFor(() => expect(v.h.attente.length).toBeGreaterThan(0));
    v.traverser();
    expect(v.ici()).toBe('carte');
    expect(v.h.i).toBe(avant + 1);
    expect(v.ouverte()).toBe(false);
    expect(v.nav.fiche()).toBeNull();
    expect(v.el('#barre-carte')!.dataset.id).toBe('FRA');
    expect(v.el('#barre-carte .barre-faits')!.textContent).toBe(textes.carte.fiche_echec);
    v.retourNavigateur();
    expect(v.ici()).toBe('toucher');
    expect(v.bilan().hidden).toBe(false);
  });

  it('« ‹ Retour au bilan » touché deux fois avant l’arrivée (double toucher, Échap répété) : un seul go(), jamais au-delà du bilan', async () => {
    const v = brancher();
    v.trouver('monde', ['FRA']);
    const avant = v.h.i;
    v.lignes()[0]!.click();
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    (v.avant() as El).click();
    (v.avant() as El).click();
    expect(v.h.attente).toEqual([-2]);
    v.traverser();
    expect(v.ici()).toBe('toucher');
    expect(v.h.i).toBe(avant);
    expect(v.bilan().hidden).toBe(false);
  });
});
