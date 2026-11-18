// Fiche d'un lieu jamais pendant une partie (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.8 et § 7) : une seule
// liste des barres de partie, que la règle de carte.css cite telle quelle ; une
// partie de Toucher quittée en cours de route attend sur la carte : ni faits,
// ni chevron, ni fiche tant qu'elle n'est pas finie (la vraie vue de Toucher et
// la vraie vue de la carte, sur le DOM factice).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lireFichesMonde, type FichierMonde, type FichierMondeLangue } from '../src/fiches/donnees';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import type { Pays } from '../src/map/types';
import { BARRES_PARTIE, barrePartieVisible, type ContexteVue } from '../src/vues/commun';
import { vueEssai } from '../src/vues/essai';
import { vueExplorer } from '../src/vues/explorer';
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
    await vi.waitFor(() => expect(v.faits()).toBe("Tokyo · 123 millions d'hab."));
    expect(v.chevron()).toBe(true);
    (v.el('#barre-fiche') as El).click();
    await vi.waitFor(() => expect(v.ouverte()).toBe(true));
    expect(v.gestes).toEqual(['quitter', 'pousser JPN']);
  });
});
