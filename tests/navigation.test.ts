// Navigation (src/navigation.ts, décision « Écran Jouer », #18) : l'historique
// de Jouer, les redirections des vues de partie et le « × », enchaînés comme
// dans le navigateur. L'historique est factice : history.go() est différé
// (comme dans un vrai navigateur) et chaque traversée donne un popstate puis
// un hashchange, comme Chromium. Toucher et les épreuves sont les vraies vues
// (DOM factice), Jouer un double qui canonise son adresse comme VueJouer.aller.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pays } from '../src/map/types';
import { creerNavigation, type Historique, type Navigation, type VueNavigable } from '../src/navigation';
import { adresse, creerArbre, depuisAncre, versAncre } from '../src/vues/arbre';
import { installerDom, installerStockage, El } from './dom-factice';

vi.mock('../src/vues/classement', () => ({ blocClassement: () => new El('section'), publierPartie: vi.fn() }));
// La carte factice n'a pas de projection : une zone allumée (QCM du quiz) ne cadre rien.
vi.mock('../src/vues/nommer', async (orig) => ({ ...(await orig()), allumerZone: () => false }));

const { vueChrono } = await import('../src/vues/chrono');
const { vueQuiz } = await import('../src/vues/quiz');
const { vueEssai } = await import('../src/vues/essai');
const { textes } = await import('../src/vues/textes');
const { catalogue } = await import('../src/vues/cibles');
const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const CATALOGUE = catalogue(pays);
const arbre = creerArbre(CATALOGUE);
const AMS = 'South America';
const EXERCICES_AMS = `jouer/classe/pays/${AMS}`;

/** window.history et location.hash : des entrées, la courante, les go() en attente. */
class FauxHistorique implements Historique {
  entrees: { etat: unknown; ancre: string }[] = [{ etat: null, ancre: '' }];
  i = 0;
  /** Chaque go() demandé (pour compter les remontées). */
  gos: number[] = [];
  private enAttente: number[] = [];
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
    this.gos.push(n);
    this.enAttente.push(n);
  }
  prochain(): number | undefined {
    return this.enAttente.shift();
  }
}

/** Une vue sans partie (la carte, la Saisie, les classements). */
function vueSimple(): VueNavigable & { active: boolean } {
  const v = {
    active: false,
    activer: () => void (v.active = true),
    desactiver: () => void (v.active = false),
  };
  return v;
}

/** `retenue` : l'écran de connexion (src/vues/accueil.ts : Accueil.retient). */
function monter(o: { retenue?: (nom: string) => boolean } = {}) {
  const h = new FauxHistorique();
  const zone = new El('main');
  // La carte et les terrains des parties : juste ce que Toucher et les épreuves demandent.
  const carte = {
    cacherPastilles() {},
    effacerMarques() {},
    marquer() {},
    anneau() {},
    zoomer() {},
    cadrer() {},
    montrer() {},
    noter: (id: string) => ({ pick: { id }, juste: true, distance_km: 0 }),
    vueEntiere() {},
    projection: { scale: () => 1 },
    transfo: { k: 1 },
    hote: new El('div'),
  };
  const monde = { nom: 'monde', carte, donnees: { noms: {}, entites: pays.map((p) => ({ pays: p })) }, jouables: [], credit: null };
  const ctx = {
    carte,
    donnees: monde.donnees,
    zone,
    terrains: { monde, actif: 'monde', montrer() {}, deja: () => null, charger: vi.fn() },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => unknown) => f() },
  };
  // Jouer : son niveau canonique (un niveau sauté mène plus bas), l'adresse remplacée sans entrée.
  const messages: string[] = [];
  // Comme VueJouer : le niveau déjà rendu ne se redessine pas, sauf message à dire.
  const jouer = {
    active: false,
    rendue: '',
    statut: '',
    activer: () => void ((jouer.active = true), (jouer.rendue = '')),
    desactiver: () => void (jouer.active = false),
    aller(segs: string[]) {
      const a = adresse(arbre.resoudre(segs));
      if (a !== ['jouer', ...segs].join('/')) nav.canoniser(a);
      if (a === jouer.rendue && !messages.length) return;
      jouer.rendue = a;
      jouer.statut = messages.splice(0).join(' ');
    },
  };
  const carteVue = vueSimple();
  const classement = vueSimple();
  const confidentialite = vueSimple();
  const compte = vueSimple();
  let nav!: Navigation<VueNavigable>;
  const versJouer = (cible: string, message?: string) => nav.versJouer(cible, message);
  // « × » (#18) : comme main.ts, l'accueil en remontant l'historique.
  const versCarte = () => nav.remonter('carte');
  const chrono = vueChrono(ctx as never, { versJouer, versCarte });
  // Le quiz : 20 questions des pays d'Amérique du Sud et d'Europe, à 4 choix (le tirage est testé à part, tests/quiz.test.ts).
  const lieux = pays.filter((p) => p.statut === 'jouable' && (p.continent === AMS || p.continent === 'Europe')).map((p) => p.id);
  const quiz = vueQuiz(ctx as never, {
    versJouer,
    versCarte,
    tirer: () => lieux.slice(0, 20).map((id) => ({ sujet: 'pays' as const, forme: 'qcm' as const, cible: id, entites: [id], choix: [id, ...lieux.filter((x) => x !== id).slice(0, 3)], delai_ms: 10_000 })),
  });
  // La Révision du jour : une séance d'une question de Trouver (la France), son bilan avec « Carte ».
  let finie = false;
  const seances = {
    ouvrir: () => {
      finie = false;
      return {
        question: () => (finie ? null : { id: 'FRA', forme: 'trouver' as const, cadrer: 'monde' as const, connu: false }),
        compte: () => '1 / 1',
        repondre: () => ((finie = true), 'Revient dans 3 j'),
        connu: () => undefined,
        terminer: () => void (finie = true),
        bilan: (el: HTMLElement, a: { carte(): void }) => {
          const b = new El('button');
          b.id = 'seance-carte';
          b.addEventListener('click', a.carte);
          (el as unknown as El).replaceChildren(b);
        },
      };
    },
  };
  const toucher = vueEssai(ctx as never, { versJouer, seances, versCarte });
  const vues = new Map<string, VueNavigable>([
    ['carte', carteVue],
    ['jouer', jouer],
    ['toucher', toucher],
    ['chrono', chrono],
    ['quiz', quiz],
    ['classement', classement],
    ['confidentialite', confidentialite],
    ['compte', compte],
  ]);
  nav = creerNavigation({
    history: h,
    ancre: () => h.ancre,
    noms: ['carte', 'jouer', 'toucher', 'chrono', 'quiz', 'classement', 'confidentialite', 'compte'],
    accueil: 'carte',
    passage: ['jouer', 'classement', 'confidentialite', 'compte'],
    retenue: o.retenue,
    arbre: 'jouer',
    vue: (n) => vues.get(n),
    aller: (segs) => jouer.aller(segs),
    annoncer: (m) => void messages.push(m),
    canonique: (c) => adresse(arbre.resoudre(depuisAncre(c).slice(1))),
  });

  /** Les événements d'une traversée (Chromium : popstate puis hashchange, même pour un lien), puis les go() demandés. */
  const evenements = () => {
    nav.router();
    nav.router();
    for (let n = h.prochain(); n !== undefined; n = h.prochain()) {
      h.i = Math.max(0, Math.min(h.entrees.length - 1, h.i + n));
      nav.router();
      nav.router();
    }
  };
  /** location.hash = … (un lien, l'adresse tapée). */
  const lien = (a: string) => {
    h.pushState(null, '', versAncre(a));
    evenements();
  };
  /** Le bouton retour du navigateur. */
  const retourNavigateur = () => {
    h.i--;
    evenements();
  };
  /** Une action de l'appli, puis les traversées qu'elle a demandées. */
  const faire = (f: () => void) => {
    f();
    for (let n = h.prochain(); n !== undefined; n = h.prochain()) {
      h.i = Math.max(0, Math.min(h.entrees.length - 1, h.i + n));
      nav.router();
      nav.router();
    }
  };
  const ici = () => depuisAncre(h.ancre).join('/') || 'carte';
  /** Comme main.ts : la vue de la partie s'ouvre (une entrée), la partie part. */
  const lancerChrono = (serie = AMS) => {
    const s = CATALOGUE.find((x) => x.id === serie)!;
    nav.ouvrirPartie('chrono');
    chrono.lancer({ branche: 'classe', sujet: 'pays', serie, mode: 'chrono' }, s, monde as never, [...s.ids]);
  };
  /** Comme main.ts : la vue du quiz s'ouvre (une entrée), la partie part. */
  const lancerQuiz = () => {
    nav.ouvrirPartie('quiz');
    quiz.lancer('facile');
  };
  const lancerToucher = () => {
    const s = CATALOGUE.find((x) => x.id === 'Europe')!;
    nav.ouvrirPartie('toucher');
    toucher.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'Europe', mode: 'localiser' }, s, monde as never, s.ids.slice(0, 2));
  };
  /** Comme main.ts : la Révision du jour s'ouvre comme une partie, sans adresse dans l'arbre. */
  const lancerRevision = () => {
    nav.ouvrirPartie('toucher');
    toucher.reviser();
  };
  /** La carte, puis Jouer par l'en-tête, puis l'arbre au doigt jusqu'à ces segments. */
  const descendre = (...segs: string[]) => {
    lien('carte');
    lien('jouer');
    for (let k = 1; k <= segs.length; k++) faire(() => nav.pousser(['jouer', ...segs.slice(0, k)].join('/')));
  };
  return { h, nav, zone, jouer, chrono, quiz, lancerQuiz, carteVue, classement, confidentialite, compte, ici, lien, retourNavigateur, faire, versCarte, lancerChrono, lancerToucher, lancerRevision, descendre };
}

beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('navigation : les niveaux de Jouer dans l’historique', () => {
  it('un niveau par entrée ; le retour arrière et « ‹ » remontent d’un niveau, sans redescendre', () => {
    const m = monter();
    m.descendre('classe', 'pays', 'Africa');
    expect(m.ici()).toBe('jouer/classe/pays/Africa');
    expect(m.jouer.rendue).toBe('jouer/classe/pays/Africa');
    const n = m.h.entrees.length;
    m.retourNavigateur();
    expect(m.ici()).toBe('jouer/classe/pays');
    m.faire(() => m.nav.remonter('jouer/classe'));
    expect(m.ici()).toBe('jouer/classe');
    expect(m.h.gos).toEqual([-1]);
    expect(m.h.entrees.length).toBe(n); // rien d'empilé en remontant
  });

  it('un niveau sauté (Communes : La Réunion seule) n’a pas d’entrée : le retour arrière revient aux sujets', () => {
    const m = monter();
    m.descendre('entrainement', 'communes');
    expect(m.ici()).toBe('jouer/entrainement/communes/reunion');
    m.retourNavigateur();
    expect(m.ici()).toBe('jouer/entrainement');
  });

  it('une adresse invalide retombe sur le niveau valide le plus proche, à la place de l’entrée', () => {
    const m = monter();
    m.lien('carte');
    const n = m.h.entrees.length;
    m.lien('jouer/classe/pays/Atlantide');
    expect(m.ici()).toBe('jouer/classe/pays');
    expect(m.h.entrees.length).toBe(n + 1);
  });

  it('#toucher et #chrono sans partie : Jouer, sans entrée de plus', () => {
    const m = monter();
    m.lien('carte');
    m.lien('chrono');
    expect(m.ici()).toBe('jouer');
    expect(m.jouer.active).toBe(true);
    m.lien('toucher');
    expect(m.ici()).toBe('jouer');
  });
});

describe('navigation : les parties et le « × » de Jouer', () => {
  it('« Abandonner » : les exercices de la série, qui le disent une fois ; « × » ferme Jouer (la carte)', () => {
    const m = monter();
    m.descendre('classe', 'pays', AMS);
    m.lancerChrono();
    expect(m.ici()).toBe('chrono'); // pas de redirection au lancement
    m.faire(() => m.zone.querySelector('#chrono-abandonner')?.click());
    expect(m.ici()).toBe(EXERCICES_AMS);
    expect(m.jouer.statut).toBe(textes.chrono.abandon);
    m.faire(() => m.nav.retour());
    expect(m.ici()).toBe('carte');
    expect(m.carteVue.active).toBe(true);
    expect(m.jouer.active).toBe(false);
  });

  it('Toucher, bilan, « Autre série » : les séries ; « × » ferme Jouer au lieu de redescendre aux exercices', () => {
    const m = monter();
    m.descendre('entrainement', 'pays', 'Europe');
    m.lancerToucher();
    m.zone.querySelector('#essai-terminer')?.click();
    m.faire(() => m.zone.querySelector('#essai-autre')?.click());
    expect(m.ici()).toBe('jouer/entrainement/pays');
    m.faire(() => m.nav.retour());
    expect(m.ici()).toBe('carte');
    expect(m.carteVue.active).toBe(true);
  });

  it('le « Retour » du 🏆 ouvert depuis Jouer après une partie abandonnée : la carte, pas Jouer', () => {
    const m = monter();
    m.descendre('classe', 'pays', AMS);
    m.lancerChrono();
    m.faire(() => m.zone.querySelector('#chrono-abandonner')?.click());
    m.lien('classement');
    m.faire(() => m.nav.retour());
    expect(m.ici()).toBe('carte');
  });

  it('une partie de Toucher en cours, Jouer par l’en-tête, « × » : la partie, qui reprend', () => {
    const m = monter();
    m.descendre('entrainement', 'pays', 'Europe');
    m.lancerToucher();
    m.lien('jouer');
    expect(m.zone.querySelector('#barre-essai')?.hidden).toBe(true);
    m.faire(() => m.nav.retour());
    expect(m.ici()).toBe('toucher');
    expect(m.zone.querySelector('#barre-essai')?.hidden).toBe(false);
  });

  it('une épreuve en cours, Jouer par l’en-tête : elle est abandonnée, « × » ramène à la carte', () => {
    const m = monter();
    m.descendre('classe', 'pays', AMS);
    m.lancerChrono();
    m.lien('jouer');
    m.faire(() => m.nav.retour());
    expect(m.ici()).toBe('carte');
  });

  it('retour arrière vers une épreuve quittée : une seule remontée malgré popstate puis hashchange, aux exercices de la série', () => {
    const m = monter();
    m.descendre('classe', 'pays', AMS);
    m.lancerChrono();
    m.lien('classement'); // 🏆 en pleine partie : elle est abandonnée
    m.h.gos.length = 0;
    m.retourNavigateur(); // vers l'entrée #chrono
    expect(m.h.gos).toEqual([-1]);
    expect(m.ici()).toBe(EXERCICES_AMS);
    expect(m.jouer.statut).toBe(textes.chrono.abandon);
  });
});

describe('navigation : le quiz général (étude J2 § 7.1), ouvert comme une partie depuis #jouer/quiz', () => {
  it('#quiz sans partie : les difficultés dans Jouer, sans entrée de plus', () => {
    const m = monter();
    m.lien('carte');
    m.lien('quiz');
    expect(m.ici()).toBe('jouer/quiz');
    expect(m.jouer.active).toBe(true);
  });

  it('« Abandonner » après la première question (D55 a) : le bilan, sans quitter #quiz ; « Autre difficulté » remonte aux difficultés ; le retour arrière à la racine', () => {
    const m = monter();
    m.descendre('quiz');
    m.lancerQuiz();
    expect(m.ici()).toBe('quiz');
    m.faire(() => m.zone.querySelector('#quiz-abandonner')?.click());
    expect(m.ici()).toBe('quiz');
    expect(m.zone.querySelector('#quiz-bilan')?.hidden).toBe(false);
    m.faire(() => m.zone.querySelector('#quiz-autre')?.click());
    expect(m.ici()).toBe('jouer/quiz');
    // L'entrée #quiz n'est pas empilée de nouveau : un retour arrière remonte à la racine de Jouer.
    m.retourNavigateur();
    expect(m.ici()).toBe('jouer');
  });

  it('une partie en cours, Jouer par l’en-tête : elle compte (D55 a), son bilan reste à revoir par le retour arrière ; « × » ramène à la carte', () => {
    const m = monter();
    m.descendre('quiz');
    m.lancerQuiz();
    m.lien('jouer');
    expect(m.zone.querySelector('#barre-quiz')?.hidden).toBe(true);
    expect(m.quiz.aMontrer?.()).toBe(true);
    m.retourNavigateur();
    expect(m.ici()).toBe('quiz');
    expect(m.zone.querySelector('#quiz-bilan')?.hidden).toBe(false);
    m.faire(() => m.zone.querySelector('#quiz-bilan .croix')?.click());
    expect(m.ici()).toBe('carte');
    expect(m.carteVue.active).toBe(true);
  });
});

describe('navigation : la Révision du jour, ouverte comme une partie', () => {
  it('pas d’adresse dans l’arbre : #toucher ; le retour arrière revient à Entraînement ; « × » de Jouer la reprend', () => {
    const m = monter();
    m.descendre('entrainement');
    m.lancerRevision();
    expect(m.ici()).toBe('toucher');
    expect(m.zone.querySelector('#barre-essai')?.hidden).toBe(false);
    // Jouer par l'en-tête en pleine séance, puis « × » : la séance reprend.
    m.lien('jouer');
    m.faire(() => m.nav.retour());
    expect(m.ici()).toBe('toucher');
    expect(m.zone.querySelector('#barre-essai')?.hidden).toBe(false);
    // « × » a remonté l'historique jusqu'à la séance : le retour arrière revient à Entraînement.
    m.retourNavigateur();
    expect(m.ici()).toBe('jouer/entrainement');
  });

  it('le bilan, « Carte » : l’accueil, en remontant l’historique ; #toucher ensuite mène à Jouer', () => {
    const m = monter();
    m.descendre('entrainement');
    m.lancerRevision();
    m.faire(() => m.zone.querySelector('#essai-terminer')?.click());
    expect(m.zone.querySelector('#essai-bilan')?.hidden).toBe(false);
    const n = m.h.entrees.length;
    m.faire(() => m.zone.querySelector('#seance-carte')?.click());
    expect(m.ici()).toBe('carte');
    expect(m.carteVue.active).toBe(true);
    expect(m.h.entrees.length).toBe(n);
    m.lien('toucher');
    expect(m.ici()).toBe('jouer');
  });
});

describe('navigation : « × » ramène à la carte (#18)', () => {
  it('« × » de Jouer, au fond de l’arbre : la carte, en remontant l’historique (pas d’entrée de plus)', () => {
    const m = monter();
    m.descendre('classe', 'pays', AMS);
    const n = m.h.entrees.length;
    m.faire(m.versCarte);
    expect(m.ici()).toBe('carte');
    expect(m.carteVue.active).toBe(true);
    expect(m.h.entrees.length).toBe(n);
  });

  it('une partie de Toucher en cours, Jouer par l’en-tête, « × » : la carte, pas la partie (que le retour arrière reprend)', () => {
    const m = monter();
    m.descendre('entrainement', 'pays', 'Europe');
    m.lancerToucher();
    m.lien('jouer');
    m.faire(m.versCarte);
    expect(m.ici()).toBe('carte');
    expect(m.zone.querySelector('#barre-essai')?.hidden).toBe(true);
  });

  it('bilan de Toucher, « × » : #carte, le bilan fermé pour de bon (#toucher ensuite mène à Jouer)', () => {
    const m = monter();
    m.descendre('entrainement', 'pays', 'Europe');
    m.lancerToucher();
    m.zone.querySelector('#essai-terminer')?.click();
    const x = m.zone.querySelector('#essai-bilan .croix');
    expect(x?.getAttribute('aria-label')).toBe(textes.croix.carte);
    m.faire(() => x?.click());
    expect(m.ici()).toBe('carte');
    expect(m.h.ancre).toBe('#carte');
    expect(m.zone.querySelector('#essai-bilan')?.hidden).toBe(true);
    m.lien('toucher');
    expect(m.ici()).toBe('jouer/entrainement/pays/Europe');
  });

  it('bilan d’une épreuve, « × » : #carte, le bilan fermé pour de bon', () => {
    const m = monter();
    m.descendre('classe', 'pays', AMS);
    m.lancerChrono();
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(i ? 1_000 : 0);
      m.chrono.toucher?.(0, 0, {} as PointerEvent);
    }
    vi.advanceTimersByTime(5_000);
    expect(m.zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    m.faire(() => m.zone.querySelector('#chrono-bilan .croix')?.click());
    expect(m.ici()).toBe('carte');
    expect(m.h.ancre).toBe('#carte');
    expect(m.zone.querySelector('#chrono-bilan')?.hidden).toBe(true);
    expect(m.chrono.aMontrer?.()).toBe(false);
  });
});

describe('navigation : une adresse retenue par l’écran de connexion', () => {
  it('la carte à la place de la vue demandée, l’adresse gardée ; rendue telle quelle une fois le panneau fermé', () => {
    let ouvert = true;
    const m = monter({ retenue: (n) => ouvert && n !== 'confidentialite' });
    m.lien('jouer/classe/pays');
    expect(m.ici()).toBe('jouer/classe/pays');
    expect(m.carteVue.active).toBe(true);
    expect(m.jouer.active).toBe(false);
    expect(m.jouer.rendue).toBe(''); // aucun niveau de Jouer rendu sous le panneau
    m.lien('compte');
    expect(m.compte.active).toBe(false);
    expect(m.carteVue.active).toBe(true);
    // Le panneau fermé (main.ts : nav.router) : l'adresse affichée, telle quelle.
    ouvert = false;
    m.nav.router();
    expect(m.compte.active).toBe(true);
    expect(m.carteVue.active).toBe(false);
  });

  it('Confidentialité se lit sans avoir choisi ; son « Retour » ramène à la carte, sous le panneau', () => {
    const m = monter({ retenue: (n) => n !== 'confidentialite' });
    m.lien('carte');
    m.lien('confidentialite');
    expect(m.confidentialite.active).toBe(true);
    m.faire(() => m.nav.retour());
    expect(m.ici()).toBe('carte');
    expect(m.carteVue.active).toBe(true);
    expect(m.h.gos).toEqual([-1]);
  });

  it('#toucher retenu : pas de redirection vers Jouer (la carte, l’adresse gardée)', () => {
    const m = monter({ retenue: (n) => n !== 'confidentialite' });
    m.lien('toucher');
    expect(m.ici()).toBe('toucher');
    expect(m.carteVue.active).toBe(true);
    expect(m.jouer.active).toBe(false);
  });
});
