// L'écran « Jouer » (décision « Écran Jouer », ticket #18) : l'arbre (pur,
// src/vues/arbre.ts) — niveaux, saut d'un niveau à un seul choix, fil
// d'Ariane, « ‹ », adresses, Rejouer gardé —, puis la vue (src/vues/jouer.ts)
// sur le DOM factice (tests/dom-factice.ts), et l'Essai J0 dans ⚙.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enregistrerPartie, epreuvesClassees, EPREUVES_SUJETS, idEpreuve } from '../src/epreuve/chrono';
import { capitalesChargees, oublierCapitales } from '../src/map/capitales';
import { drapeauxCharges, oublierDrapeaux } from '../src/map/drapeaux';
import { FICHIERS_MERS, IDS_MERS, mersChargees, oublierMers } from '../src/map/mers';
import type { Pays } from '../src/map/types';
import {
  adresse,
  CLE_DERNIERE,
  creerArbre,
  depuisAncre,
  garderDerniere,
  lireDerniere,
  nombreSujet,
  pasVers,
  SUJETS,
  versAncre,
  type DefSujet,
  type Lancement,
  type Niveau,
} from '../src/vues/arbre';
import { catalogue, SERIE_ESSAI } from '../src/vues/cibles';
import { aideSujet, recordDe, regleExercice, remplirEssaiJ0, vueJouer, type OptionsJouer } from '../src/vues/jouer';
import { estSujetRendu } from '../src/vues/sujets';
import { textes } from '../src/vues/textes';
import { El, installerDom, installerStockage } from './dom-factice';

const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const CATALOGUE = catalogue(pays);
const arbre = creerArbre(CATALOGUE);
const SERIES_PAYS = ['tous', 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania'];
const a = (segs: string[]) => adresse(arbre.resoudre(segs));

describe('l’arbre (pur)', () => {
  it('niveaux : le quiz et deux branches, leurs sujets (D53 b : Communes en dernier ; Océans et mers dans les deux, lot 3b), les séries des pays, les exercices de chaque branche', () => {
    // Le quiz général en tête de la racine (étude J2 § 7.1), puis Entraînement et Classé.
    expect(arbre.choix({ type: 'racine' })).toEqual(['quiz', 'entrainement', 'classe']);
    expect(arbre.choix({ type: 'quiz' })).toEqual(['facile', 'moyen', 'difficile', 'expert']);
    expect(arbre.choix({ type: 'sujets', branche: 'entrainement' })).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    expect(arbre.choix({ type: 'sujets', branche: 'classe' })).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    // Capitales : les séries des pays, tailles comprises (D37 c).
    expect(arbre.choix({ type: 'series', branche: 'entrainement', sujet: 'capitales' })).toEqual(SERIES_PAYS);
    expect(arbre.series('capitales').map((x) => x.n)).toEqual(arbre.series('pays').map((x) => x.n));
    expect(arbre.modes('entrainement', 'capitales')).toEqual(['apprendre', 'localiser', 'nommer']);
    expect(arbre.choix({ type: 'series', branche: 'classe', sujet: 'pays' })).toEqual(SERIES_PAYS);
    expect(arbre.choix({ type: 'series', branche: 'classe', sujet: 'communes' })).toEqual(['reunion']);
    expect(arbre.modes('entrainement', 'pays')).toEqual(['apprendre', 'localiser', 'nommer']);
    // Apprendre : les pays et les communes (défaut D6 : sous La Réunion, ses grappes de communes).
    expect(arbre.modes('entrainement', 'communes')).toEqual(['apprendre', 'localiser', 'nommer']);
    // Classé : Chrono et Sans faute (Minute, retiré le 12/11/2026 : décision « Barème et classements »).
    expect(arbre.modes('classe', 'communes')).toEqual(['chrono', 'sansfaute']);
    // Drapeaux (lot 2) : les séries des pays, tailles comprises (« 54 drapeaux » en Afrique).
    expect(arbre.choix({ type: 'series', branche: 'entrainement', sujet: 'drapeaux' })).toEqual(SERIES_PAYS);
    expect(arbre.series('drapeaux').map((x) => x.n)).toEqual(arbre.series('pays').map((x) => x.n));
    expect(arbre.series('drapeaux').find((x) => x.id === 'Africa')!.n).toBe(54);
    expect(arbre.series('drapeaux').find((x) => x.id === 'tous')!.n).toBe(195);
    expect(arbre.modes('entrainement', 'drapeaux')).toEqual(['apprendre', 'localiser', 'nommer']);
    expect(arbre.modes('classe', 'drapeaux')).toEqual(['chrono', 'sansfaute']);
  });

  it('même ordre des séries partout : tous, les continents (ordre alphabétique français), l’île ; celui des épreuves et du 🏆', () => {
    expect(CATALOGUE.map((s) => s.id)).toEqual([...SERIES_PAYS, 'reunion']);
    expect(EPREUVES_SUJETS.filter((p) => p.sujet === 'pays' || p.sujet === 'communes').map((p) => p.serie)).toEqual(CATALOGUE.map((s) => s.id));
    // 🏆 « Toutes les épreuves » : mode par mode, chacun dans cet ordre ; les capitales, les drapeaux puis les mers entre
    // les pays et les communes (D53 b), dans l'ordre des sujets de Jouer et des séries.
    const localiser = (e: string) => e.split(':')[1] === 'localiser';
    expect(epreuvesClassees().filter(localiser).slice(0, 8)).toEqual(CATALOGUE.map((s) => idEpreuve(s.id)));
    expect(epreuvesClassees().filter(localiser).slice(8, 16)).toEqual(CATALOGUE.map((s) => idEpreuve(s.id, 'sansfaute')));
    expect(epreuvesClassees().slice(0, 43)).toEqual([
      ...SERIES_PAYS.map((x) => idEpreuve(x)),
      ...SERIES_PAYS.map((x) => idEpreuve(x, 'chrono', 'capitales')),
      ...SERIES_PAYS.map((x) => idEpreuve(x, 'chrono', 'drapeaux')),
      ...SERIES_PAYS.slice(0, -1).map((x) => idEpreuve(x, 'chrono', 'voisins')),
      ...SERIES_PAYS.map((x) => idEpreuve(x, 'chrono', 'habitants')),
      ...SERIES_PAYS.map((x) => idEpreuve(x, 'chrono', 'superficies')),
      idEpreuve('mers', 'chrono', 'mers'),
      idEpreuve('reunion'),
    ]);
    // Les sujets du catalogue des épreuves, dans l'ordre de Jouer (Classé).
    expect([...new Set(EPREUVES_SUJETS.map((p) => p.sujet))]).toEqual(arbre.choix({ type: 'sujets', branche: 'classe' }));
  });

  it('Habitants et Superficies (J4, lot 3) : après les voisins, les séries des pays (195, « 54 pays » en Afrique) ; Apprendre, Trouver, Reconnaître ; Chrono et Sans faute', () => {
    for (const s of ['habitants', 'superficies']) {
      expect(arbre.series(s).map((x) => x.id)).toEqual(SERIES_PAYS);
      expect(arbre.series(s).map((x) => x.n)).toEqual([195, 54, 23, 12, 48, 44, 14]);
      expect(arbre.modes('entrainement', s)).toEqual(['apprendre', 'localiser', 'nommer']);
      expect(arbre.modes('classe', s)).toEqual(['chrono', 'sansfaute']);
    }
  });

  it('Voisins (J4, lot 2) : après les drapeaux, les séries des pays sans l’Océanie (une seule question), sans les 39 qui n’ont aucun voisin jouable ; Apprendre, Trouver, Reconnaître ; Chrono et Sans faute', () => {
    const voisins = arbre.series('voisins');
    expect(voisins.map((x) => x.id)).toEqual(SERIES_PAYS.slice(0, -1));
    expect(voisins.map((x) => x.n)).toEqual([156, 48, 12, 12, 41, 42]);
    expect(voisins.find((x) => x.id === 'tous')!.ids).toContain('PNG');
    expect(voisins.find((x) => x.id === 'tous')!.ids).not.toContain('JPN');
    expect(arbre.modes('entrainement', 'voisins')).toEqual(['apprendre', 'localiser', 'nommer']);
    expect(arbre.modes('classe', 'voisins')).toEqual(['chrono', 'sansfaute']);
    expect(arbre.valide({ branche: 'classe', sujet: 'voisins', serie: 'Oceania', mode: 'chrono' })).toBe(false);
    expect(nombreSujet('voisins', voisins)).toBe('156 pays');
    // Le « ? » des épreuves : le délai par voisin (D607 a), pas « 15 s par question » ; et ce qui compte ou non.
    for (const m of ['chrono', 'sansfaute'] as const) {
      expect(regleExercice(m, 'voisins')).toContain('4 s plus 2 s par voisin');
      expect(regleExercice(m, 'voisins')).not.toContain('15 s');
      expect(regleExercice(m)).toContain('15 s par question');
    }
    expect(aideSujet('voisins', 'entrainement')).toContain('ne compte ni pour ni contre');
    expect(aideSujet('voisins', 'classe')).toBe(aideSujet('voisins', 'entrainement'));
  });

  it('Classé › Capitales (décision « Ouverture des épreuves d’un sujet », 12/11 : sans date) : les séries des pays (D37 c), les deux épreuves', () => {
    expect(arbre.choix({ type: 'series', branche: 'classe', sujet: 'capitales' })).toEqual(SERIES_PAYS);
    expect(arbre.modes('classe', 'capitales')).toEqual(['chrono', 'sansfaute']);
    expect(arbre.valide({ branche: 'classe', sujet: 'capitales', serie: 'Oceania', mode: 'chrono' })).toBe(true);
    expect(a(['classe', 'capitales', 'Oceania'])).toBe('jouer/classe/capitales/Oceania');
  });

  it('Classé › Océans et mers (lot 3b, décision « Ouverture des épreuves d’un sujet » : sans date) : sa série unique sautée (D44 a), les deux épreuves', () => {
    expect(SUJETS.find((s) => s.id === 'mers')!.modes.classe).toEqual(['chrono', 'sansfaute']);
    expect(EPREUVES_SUJETS.filter((p) => p.sujet === 'mers')).toEqual([{ sujet: 'mers', serie: 'mers' }]);
    expect(arbre.choix({ type: 'series', branche: 'classe', sujet: 'mers' })).toEqual(['mers']);
    expect(arbre.saute({ type: 'series', branche: 'classe', sujet: 'mers' })).toBe(true);
    expect(arbre.modes('classe', 'mers')).toEqual(['chrono', 'sansfaute']);
    expect(a(['classe', 'mers'])).toBe('jouer/classe/mers/mers');
    expect(a(['classe', 'mers', 'mers', 'chrono'])).toBe('jouer/classe/mers/mers');
    expect(adresse(arbre.enfant({ type: 'sujets', branche: 'classe' }, 'mers'))).toBe('jouer/classe/mers/mers');
    expect(arbre.valide({ branche: 'classe', sujet: 'mers', serie: 'mers', mode: 'chrono' })).toBe(true);
    expect(arbre.valide({ branche: 'classe', sujet: 'mers', serie: 'mers', mode: 'sansfaute' })).toBe(true);
    // Minute (retiré) n'y est pas plus qu'ailleurs ; la série « tous » n'est pas celle des mers (étude J2 § 3.2).
    expect(arbre.valide({ branche: 'classe', sujet: 'mers', serie: 'mers', mode: 'minute' as never })).toBe(false);
    expect(arbre.valide({ branche: 'classe', sujet: 'mers', serie: 'tous', mode: 'chrono' })).toBe(false);
    // Le fil : « Classé › Océans et mers », la série sautée y reste, au nom du sujet.
    expect(arbre.fil(arbre.resoudre(['classe', 'mers'])).map((c) => c.nom)).toEqual(['Classé', 'Océans et mers', 'Océans et mers']);
    // Un sujet qui n'est pas un domaine (essais) n'attend pas EPREUVES_SUJETS ; tous les domaines de SUJETS y sont.
    const essai: DefSujet[] = [{ id: 'essai', series: (c) => c.slice(0, 1), modes: { entrainement: [], classe: ['chrono'] } }];
    expect(creerArbre(CATALOGUE, essai).choix({ type: 'sujets', branche: 'classe' })).toEqual(['essai']);
    for (const s of SUJETS) expect(EPREUVES_SUJETS.some((p) => p.sujet === s.id), s.id).toBe(true);
  });

  it('Minute retiré (décision « Barème et classements ») : une adresse qui le nomme reste à ses exercices, sans partie', () => {
    expect(a(['classe', 'pays', 'Africa', 'minute'])).toBe('jouer/classe/pays/Africa');
    expect(arbre.valide({ branche: 'classe', sujet: 'pays', serie: 'Africa', mode: 'minute' as never })).toBe(false);
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
    expect(a(['classe', 'quiz'])).toBe('jouer/classe');
    expect(a(['classe', 'pays', 'Atlantide'])).toBe('jouer/classe/pays');
    expect(a(['classe', 'pays', 'Africa', 'chrono', 'encore'])).toBe('jouer/classe/pays/Africa');
    expect(a(['classe', 'communes', 'Africa'])).toBe('jouer/classe/communes/reunion');
    // Les ancres : chaque segment encodé, et relu tel quel.
    expect(versAncre('jouer/classe/pays/North America')).toBe('#jouer/classe/pays/North%20America');
    expect(depuisAncre('#jouer/classe/pays/North%20America')).toEqual(['jouer', 'classe', 'pays', 'North America']);
    expect(depuisAncre('#jouer/%E0')).toEqual(['jouer', '%E0']);
    expect(depuisAncre('')).toEqual(['']);
  });

  it('le quiz (étude J2 § 7.1) : #jouer/quiz, un segment de trop y retombe ; parent la racine, fil « Quiz général », jamais sauté', () => {
    expect(a(['quiz'])).toBe('jouer/quiz');
    expect(a(['quiz', 'xyz'])).toBe('jouer/quiz');
    expect(a(['quiz', 'facile', 'encore'])).toBe('jouer/quiz');
    expect(arbre.resoudre(['quiz'])).toEqual({ type: 'quiz' });
    expect(adresse(arbre.enfant({ type: 'racine' }, 'quiz'))).toBe('jouer/quiz');
    expect(arbre.enfant({ type: 'quiz' }, 'facile')).toEqual({ type: 'quiz' });
    expect(arbre.parent({ type: 'quiz' })).toEqual({ type: 'racine' });
    expect(arbre.saute({ type: 'quiz' })).toBe(false);
    expect(arbre.fil({ type: 'quiz' }).map((c) => [c.nom, adresse(c.niveau)])).toEqual([['Quiz général', 'jouer/quiz']]);
    // Le quiz n'est pas une branche : rien sous #jouer/quiz/<sujet>, et aucun sujet ne le propose.
    expect(a(['quiz', 'pays'])).toBe('jouer/quiz');
    expect(arbre.sujets('classe').map((x) => x.id)).not.toContain('quiz');
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
    for (const v of ['{pas du json', '42', 'null', '[]', JSON.stringify({ ...l, serie: 'Atlantide' }), JSON.stringify({ ...l, mode: 'localiser' }), JSON.stringify({ ...l, branche: 'autre' }), JSON.stringify({ ...l, serie: 7 }), JSON.stringify({ ...l, mode: 'minute' })]) {
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

  it('Rejouer, les deux formes de Lancement : une série, ou une difficulté du quiz ; une difficulté inconnue ignorée', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    garderDerniere(st, { quiz: 'moyen' });
    expect(JSON.parse(m.get(CLE_DERNIERE)!)).toEqual({ quiz: 'moyen' });
    expect(lireDerniere(st, arbre)).toEqual({ quiz: 'moyen' });
    expect(arbre.valide({ quiz: 'expert' })).toBe(true);
    for (const v of [{ quiz: 'enfer' }, { quiz: 3 }, { quiz: null }]) {
      m.set(CLE_DERNIERE, JSON.stringify(v));
      expect(lireDerniere(st, arbre), JSON.stringify(v)).toBeNull();
    }
    // Une ancienne valeur, celle d'une série, reste lisible.
    const l: Lancement = { branche: 'entrainement', sujet: 'capitales', serie: 'Europe', mode: 'nommer' };
    m.set(CLE_DERNIERE, JSON.stringify(l));
    expect(lireDerniere(st, arbre)).toEqual(l);
  });

  it('textes : chaque sujet et chaque branche ont leur nom', () => {
    for (const s of SUJETS) expect((textes.jouer.sujets as Record<string, { nom: string }>)[s.id]?.nom, s.id).toBeTruthy();
    // Et son rendu (sujets.ts) : ses textes, le compte de ses séries.
    for (const s of SUJETS) expect(estSujetRendu(s.id), s.id).toBe(true);
  });
});

// --- La vue ----------------------------------------------------------------

function monter(o: { charger?: () => Promise<unknown>; revision?: OptionsJouer['revision']; quiz?: OptionsJouer['quiz']; arbre?: typeof arbre } = {}) {
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
  // Sans pays : les vignettes des continents manquent, celles du monde et de l'île restent. La couche marine posée par prendreMers.
  const donnees = { entites: [], mers: [] as unknown[] };
  const carte = { prendreMers: vi.fn((c: { mers: unknown[] }) => void (donnees.mers = c.mers)) };
  const ctx = { zone, terrains, donnees, carte } as never;
  const opts = {
    lancer: vi.fn<OptionsJouer['lancer']>(),
    fermer: vi.fn<OptionsJouer['fermer']>(),
    pousser: vi.fn<OptionsJouer['pousser']>(),
    remonter: vi.fn<OptionsJouer['remonter']>(),
    canoniser: vi.fn<OptionsJouer['canoniser']>(),
    ...(o.revision ? { revision: o.revision } : {}),
    ...(o.quiz ? { quiz: o.quiz } : {}),
  };
  const v = vueJouer(ctx, o.arbre ?? arbre, opts);
  const panneau = zone.querySelector('#jouer-panneau')!;
  /** Ouvre Jouer à cette adresse (segments après « jouer »), comme le routeur de main.ts. */
  const ouvrir = (...segs: string[]) => {
    v.activer();
    v.aller(segs);
  };
  const attr = (a: string) => panneau.querySelectorAll(`button[${a}]`).map((b) => b.getAttribute(a));
  return { v, zone, panneau, opts, ouvrir, attr, charger, monde, ile, carte, donnees };
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
    // Le quiz en tête, pleine largeur (étude J2 § 7.1).
    expect(j.attr('data-racine')).toEqual(['quiz']);
    expect(j.panneau.querySelector('[data-racine="quiz"]')?.className).toContain('jouer-large');
    expect(j.panneau.innerText).toContain('Quiz général');
    expect(j.panneau.innerText).toContain('Pour apprendre, sans points');
    expect(j.panneau.querySelector('#jouer-rejouer')).toBeNull();
    expect(j.panneau.querySelector('#jouer-haut')).toBeNull();
    expect(j.panneau.innerText).not.toContain('Choisis un exercice');
    j.panneau.querySelector('#jouer-fermer')!.click();
    expect(j.opts.fermer).toHaveBeenCalled();
    j.panneau.querySelector('[data-branche="classe"]')!.click();
    expect(j.opts.pousser).toHaveBeenCalledWith('jouer/classe');
    j.panneau.querySelector('[data-racine="quiz"]')!.click();
    expect(j.opts.pousser).toHaveBeenLastCalledWith('jouer/quiz');
  });

  it('Quiz général : ses 4 difficultés, leur phrase et leur record (« 17/20 · 85 % »), les règles derrière « ? », « ‹ » vers la racine', () => {
    enregistrerPartie(localStorage, 'quiz:general:moyen', { points: 17, justes: 17, questions: 20, temps_ms: 90_000 }, 1);
    const lancer = vi.fn();
    const j = monter({ quiz: { preparer: () => null, lancer } });
    j.ouvrir('quiz');
    expect(j.panneau.dataset.niveau).toBe('quiz');
    expect(j.attr('data-difficulte')).toEqual(['facile', 'moyen', 'difficile', 'expert']);
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Quiz général');
    expect(j.panneau.innerText).toContain('Lieux très connus : 20 questions à 4 choix, 10 s chacune');
    expect(j.panneau.innerText).toContain('Comme difficile, en moins de temps : 8 à 4 choix (6 s), 12 sur la carte (10 s)');
    expect(j.panneau.querySelector('[data-difficulte="moyen"] .jouer-record')?.textContent).toContain('17/20 · 85\u00a0%');
    expect(j.panneau.querySelector('[data-difficulte="facile"] .jouer-record')).toBeNull();
    for (const b of j.panneau.querySelectorAll('[data-difficulte]')) expect(b.querySelector('.vignette-icone')).not.toBeNull();
    const aide = j.panneau.querySelector('#jouer-aide')!;
    expect(aide.getAttribute('aria-label')).toBe(textes.quiz.aide);
    expect(j.panneau.querySelector('#jouer-regles')!.hidden).toBe(true);
    aide.click();
    expect(j.panneau.querySelector('#jouer-regles')!.textContent).toContain('hors du général');
    j.panneau.querySelector('[data-difficulte="difficile"]')!.click();
    expect(lancer).toHaveBeenCalledWith('difficile');
    j.panneau.querySelector('#jouer-haut')!.click();
    expect(j.opts.remonter).toHaveBeenCalledWith('jouer');
  });

  it('Quiz général : ses données chargées dans Jouer (« Chargement… », boutons désactivés), puis la partie ; hors ligne, le message et rien ne part', async () => {
    let finir: (ok: boolean) => void = () => undefined;
    const preparer = vi.fn(() => new Promise<void>((res, rej) => (finir = (ok) => (ok ? res() : rej(new Error('hors ligne'))))));
    const lancer = vi.fn();
    const j = monter({ quiz: { preparer, lancer } });
    j.ouvrir('quiz');
    j.panneau.querySelector('[data-difficulte="facile"]')!.click();
    expect(j.panneau.querySelector('.jouer-statut')?.textContent).toBe(textes.toucher.chargement_sujet);
    for (const b of j.panneau.querySelectorAll('[data-difficulte]')) expect(b.disabled).toBe(true);
    finir(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(lancer).not.toHaveBeenCalled();
    expect(j.panneau.querySelector('.jouer-statut')?.textContent).toBe(textes.quiz.echec);
    for (const b of j.panneau.querySelectorAll('[data-difficulte]')) expect(b.disabled).toBe(false);
    j.panneau.querySelector('[data-difficulte="expert"]')!.click();
    finir(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(lancer).toHaveBeenCalledWith('expert');
    // Quitté pendant le chargement : rien ne part.
    j.panneau.querySelector('[data-difficulte="moyen"]')!.click();
    j.v.desactiver();
    finir(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(lancer).toHaveBeenCalledTimes(1);
  });

  it('Quiz général : la dernière partie (une difficulté) marquée à la racine et à son niveau', () => {
    localStorage.setItem(CLE_DERNIERE, JSON.stringify({ quiz: 'difficile' }));
    const j = monter();
    j.ouvrir();
    expect(j.panneau.querySelector('[data-racine="quiz"]')?.getAttribute('aria-current')).toBe('true');
    expect(j.panneau.querySelector('[data-branche="classe"]')?.getAttribute('aria-current')).toBeNull();
    j.ouvrir('quiz');
    expect(j.panneau.querySelector('[data-difficulte="difficile"]')?.getAttribute('aria-current')).toBe('true');
  });

  it('Classé : les sujets avec leur nombre ; Pays mène aux séries, Communes directement aux exercices de La Réunion', () => {
    const j = monter();
    j.ouvrir('classe');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
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

  it('Classé › Pays › Afrique : les deux épreuves, leur phrase courte et leur record en part de justes ; les règles derrière « ? »', () => {
    const j = monter();
    enregistrerPartie(localStorage, idEpreuve('Africa'), { points: 33, justes: 33, questions: 54, temps_ms: 200_000 }, 1);
    // Un record de Minute (retiré) resté sur l'appareil : plus de ligne où le montrer, rien ne casse.
    enregistrerPartie(localStorage, 'minute:localiser:Africa', { points: 23, justes: 23, questions: 25, temps_ms: 60_000 }, 1);
    j.ouvrir('classe', 'pays', 'Africa');
    expect(j.panneau.dataset.niveau).toBe('exercices');
    expect(j.attr('data-mode')).toEqual(['chrono', 'sansfaute']);
    const ligne = (m: string) => j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText;
    expect(ligne('chrono')).toContain('15 s par question, un seul toucher');
    // 33 sur 54 : 61,1 %, tronqué.
    expect(ligne('chrono')).toContain('33/54 · 61\u00a0%');
    expect(ligne('sansfaute')).not.toContain('record'); // pas encore de record
    expect(j.panneau.innerText).not.toContain('23');
    // Le record d'un autre sujet sur la même série n'est pas celui des pays (étude J2 § 3.2).
    expect(recordDe(new Map([[idEpreuve('Africa', 'chrono', 'capitales'), { points: 9, justes: 9, questions: 9, temps_ms: 9_000, date: 1, bareme: 2 }]]), 'chrono', 'Africa', 'pays')).toBe('');
    expect(recordDe(new Map([[idEpreuve('Africa', 'chrono', 'capitales'), { points: 9, justes: 9, questions: 9, temps_ms: 9_000, date: 1, bareme: 2 }]]), 'chrono', 'Africa', 'capitales')).toBe('9/9 · 100\u00a0%');
    // Sans faute : la part de la série (54 en Afrique), pas des questions jouées.
    expect(recordDe(new Map([[idEpreuve('Africa', 'sansfaute'), { points: 17, justes: 17, questions: 18, temps_ms: 9_000, date: 1, bareme: 2 }]]), 'sansfaute', 'Africa')).toBe('17/54 · 31\u00a0%');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Classé›Pays›Afrique');
    const regles = j.panneau.querySelector('#jouer-regles')!;
    expect(regles.hidden).toBe(true);
    j.panneau.querySelector('#jouer-aide')!.click();
    expect(regles.hidden).toBe(false);
    expect(regles.innerText).toContain('Chrono : toutes les questions de la série');
    expect(regles.innerText).toContain('ton score est la part de justes ; à égalité, le temps total départage');
    expect(regles.innerText).toContain('Sans faute : les lieux de la série');
    expect(regles.innerText).not.toContain('Minute');
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

  it('pas de Rejouer dans Jouer (il reste au bilan, choix du 10/11) ; les choix de la dernière partie marqués', () => {
    localStorage.setItem(CLE_DERNIERE, JSON.stringify({ branche: 'classe', sujet: 'pays', serie: 'Africa', mode: 'chrono' }));
    enregistrerPartie(localStorage, idEpreuve('Africa'), { points: 33, justes: 33, questions: 54, temps_ms: 200_000 }, 1);
    const j = monter();
    j.ouvrir();
    expect(j.panneau.querySelector('#jouer-rejouer')).toBeNull();
    expect(j.panneau.innerText).not.toContain('Rejouer');
    // Les premiers boutons du panneau : le quiz, puis les branches.
    expect(j.panneau.querySelectorAll('button.jouer-bouton')[0]?.getAttribute('data-racine')).toBe('quiz');
    expect(j.panneau.querySelectorAll('button.jouer-bouton')[1]?.getAttribute('data-branche')).toBe('entrainement');
    expect(j.panneau.querySelector('[data-branche="classe"]')?.getAttribute('aria-current')).toBe('true');
    expect(j.panneau.querySelector('[data-branche="entrainement"]')?.getAttribute('aria-current')).toBeNull();
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

  it('dernière partie d’une série disparue, de Minute (retiré) ou valeur illisible : rien de marqué', () => {
    const minute = JSON.stringify({ branche: 'classe', sujet: 'pays', serie: 'Africa', mode: 'minute' });
    for (const v of [JSON.stringify({ branche: 'classe', sujet: 'pays', serie: 'Atlantide', mode: 'chrono' }), minute, '{pas du json']) {
      localStorage.setItem(CLE_DERNIERE, v);
      const j = monter();
      j.ouvrir();
      expect(j.panneau.querySelector('[aria-current="true"]'), v).toBeNull();
    }
  });

  it('vignettes : une icône aux branches et aux exercices, une carte aux sujets et aux séries', () => {
    const j = monter();
    j.ouvrir();
    for (const b of j.panneau.querySelectorAll('[data-branche]')) expect(b.querySelector('.jouer-vignette .vignette-icone')).not.toBeNull();
    j.ouvrir('classe');
    // Pays : le monde (son ovale) ; Communes : l'île et les limites de ses communes.
    expect(j.panneau.querySelector('[data-sujet="pays"] .vignette-carte .vignette-mer')).not.toBeNull();
    expect(j.panneau.querySelector('[data-sujet="communes"] .vignette-carte .vignette-limites')).not.toBeNull();
    j.ouvrir('classe', 'pays', 'Africa');
    for (const b of j.panneau.querySelectorAll('[data-mode]')) expect(b.querySelector('.vignette-icone')).not.toBeNull();
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
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
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
    expect(b.innerText).toContain(textes.jouer.exercices.communes.apprendre);
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

// Le sujet Capitales (lot 1) : sous Entraînement seulement, ses séries (celles
// des pays), ses phrases, sa vignette (rangée dans le code), et ses données
// chargées au lancement d'une partie, pas avant (avecSujet, étude J2 § 4.2).
describe('la vue Jouer : le sujet Capitales', () => {
  /** Les réponses du réseau : null, hors ligne. */
  let reseau: Record<string, unknown> | null = null;
  const demandes: string[] = [];
  beforeEach(() => {
    installerDom();
    installerStockage();
    oublierCapitales();
    demandes.length = 0;
    reseau = {
      '/geo/capitales.json': JSON.parse(readFileSync('public/geo/capitales.json', 'utf8')),
      '/geo/capitales.fr.json': JSON.parse(readFileSync('public/geo/capitales.fr.json', 'utf8')),
    };
    vi.stubGlobal('fetch', async (url: string) => {
      demandes.push(url);
      if (!reseau) throw new TypeError('Failed to fetch');
      return { ok: url in reseau, status: url in reseau ? 200 : 404, json: async () => reseau![url] };
    });
  });
  afterEach(() => {
    oublierCapitales();
    vi.unstubAllGlobals();
  });
  const attendre = () => new Promise((r) => setTimeout(r, 0));

  it('Entraînement : Pays, Capitales, Drapeaux, Océans et mers, Communes ; sa vignette (le monde et ses capitales en points) sans rien charger ; ses séries « 54 capitales »', () => {
    const j = monter();
    j.ouvrir('entrainement');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    expect(j.panneau.querySelector('[data-sujet="capitales"]')!.innerText).toContain('Capitales');
    expect(j.panneau.querySelector('[data-sujet="capitales"]')!.innerText).toContain('195 capitales');
    expect(j.panneau.querySelector('[data-sujet="capitales"] .vignette-carte .vignette-points')).not.toBeNull();
    expect(j.panneau.querySelector('[data-sujet="pays"] .vignette-points')).toBeNull();
    j.ouvrir('entrainement', 'capitales');
    expect(j.attr('data-serie')).toEqual(SERIES_PAYS);
    expect(j.panneau.innerText).toContain('54 capitales');
    expect(j.panneau.querySelector('[data-serie="tous"] .vignette-points')).not.toBeNull();
    j.ouvrir('entrainement', 'capitales', 'Africa');
    expect(j.attr('data-mode')).toEqual(['apprendre', 'localiser', 'nommer']);
    for (const m of ['apprendre', 'localiser', 'nommer'] as const) expect(j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText).toContain(textes.jouer.exercices.capitales[m]);
    // Sous Classé aussi (partie C).
    j.ouvrir('classe');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    // Rien de capitales* demandé pour afficher Jouer.
    expect(demandes).toEqual([]);
    expect(capitalesChargees()).toBeNull();
  });

  it('chargement puis lancement : « Chargement… », boutons désactivés, puis la partie part ; la seconde fois, tout de suite', async () => {
    const j = monter();
    j.ouvrir('entrainement', 'capitales', 'Africa');
    const statut = () => j.panneau.querySelector('.jouer-statut')!;
    j.panneau.querySelector('[data-mode="localiser"]')!.click();
    expect(statut().textContent).toBe(textes.toucher.chargement_sujet);
    expect(j.panneau.querySelector('[data-mode="nommer"]')!.disabled).toBe(true);
    expect(j.opts.lancer).not.toHaveBeenCalled();
    await attendre();
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
    expect(j.opts.lancer.mock.calls[0]![0]).toEqual({ branche: 'entrainement', sujet: 'capitales', serie: 'Africa', mode: 'localiser' });
    expect(statut().hidden).toBe(true);
    expect(demandes.sort()).toEqual(['/geo/capitales.fr.json', '/geo/capitales.json']);
    j.panneau.querySelector('[data-mode="nommer"]')!.click();
    expect(j.opts.lancer).toHaveBeenCalledTimes(2);
    expect(demandes).toHaveLength(2);
  });

  it('échec puis message : hors ligne, rien ne part, on reste au niveau, boutons rendus ; le prochain choix réessaie', async () => {
    reseau = null;
    const j = monter();
    j.ouvrir('entrainement', 'capitales', 'Africa');
    j.panneau.querySelector('[data-mode="localiser"]')!.click();
    await attendre();
    expect(j.opts.lancer).not.toHaveBeenCalled();
    expect(j.panneau.querySelector('.jouer-statut')!.textContent).toBe(textes.toucher.echec_sujet);
    expect(j.panneau.querySelector('[data-mode="localiser"]')!.disabled).toBe(false);
    expect(j.panneau.dataset.niveau).toBe('exercices');
    reseau = {
      '/geo/capitales.json': JSON.parse(readFileSync('public/geo/capitales.json', 'utf8')),
      '/geo/capitales.fr.json': JSON.parse(readFileSync('public/geo/capitales.fr.json', 'utf8')),
    };
    j.panneau.querySelector('[data-mode="localiser"]')!.click();
    await attendre();
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
  });
});

// Les épreuves classées des capitales (lot 1, partie C) : Classé › Capitales,
// ses séries, ses trois épreuves avec leurs
// records, leurs phrases et leurs règles, et la partie lancée après le
// chargement des capitales.
describe('la vue Jouer : Classé › Capitales', () => {
  beforeEach(() => {
    installerDom();
    installerStockage();
    oublierCapitales();
    vi.stubGlobal('fetch', async (url: string) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(`public${url}`, 'utf8')) }));
  });
  afterEach(() => {
    oublierCapitales();
    vi.unstubAllGlobals();
  });

  it('Classé : Pays, Capitales, Drapeaux, Océans et mers, Communes', () => {
    const j = monter();
    j.ouvrir('classe');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    expect(j.panneau.querySelector('[data-sujet="capitales"] .vignette-points')).not.toBeNull();
  });

  it('Classé › Capitales › Océanie : Chrono, Sans faute, leur phrase, leur record (celui des capitales, pas des pays), « ? »', () => {
    enregistrerPartie(localStorage, idEpreuve('Oceania', 'chrono', 'capitales'), { points: 12, justes: 12, questions: 14, temps_ms: 70_000 }, 1);
    enregistrerPartie(localStorage, idEpreuve('Oceania', 'sansfaute'), { points: 9, justes: 9, questions: 10, temps_ms: 30_000 }, 1);
    const j = monter();
    j.ouvrir('classe', 'capitales', 'Oceania');
    expect(j.panneau.dataset.niveau).toBe('exercices');
    expect(j.attr('data-mode')).toEqual(['chrono', 'sansfaute']);
    const ligne = (m: string) => j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText;
    expect(ligne('chrono')).toContain('15 s par question, un seul toucher');
    expect(ligne('chrono')).toContain('12/14 · 85\u00a0%');
    expect(ligne('sansfaute')).not.toContain('9/14');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Classé›Capitales›Océanie');
    j.panneau.querySelector('#jouer-aide')!.click();
    expect(j.panneau.querySelector('#jouer-regles')!.innerText).toContain('Sans faute : les lieux de la série');
  });

  it('un Chrono des capitales : les capitales chargées dans Jouer, puis la partie part (branche classe, sujet capitales)', async () => {
    const j = monter();
    j.ouvrir('classe', 'capitales', 'Oceania');
    j.panneau.querySelector('[data-mode="chrono"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
    expect(j.opts.lancer.mock.calls[0]![0]).toEqual({ branche: 'classe', sujet: 'capitales', serie: 'Oceania', mode: 'chrono' });
    expect(j.opts.lancer.mock.calls[0]![3]).toHaveLength(14);
    expect(capitalesChargees()).not.toBeNull();
  });
});

// Le sujet Drapeaux (lot 2, parties B et C) : sous Entraînement et sous Classé
// (comme les capitales), son icône, ses séries
// « 54 drapeaux », ses exercices et leur « ? » (exercices visuels) ; son
// manifeste chargé dans Jouer, puis la partie part ; rien de drapeaux*
// demandé pour afficher Jouer.
describe('la vue Jouer : le sujet Drapeaux', () => {
  /** Les réponses du réseau : null, hors ligne. */
  let reseau: Record<string, unknown> | null = null;
  const demandes: string[] = [];
  const MANIFESTE = JSON.parse(readFileSync('public/geo/drapeaux.json', 'utf8'));
  beforeEach(() => {
    installerDom();
    installerStockage();
    oublierDrapeaux();
    demandes.length = 0;
    reseau = { '/geo/drapeaux.json': MANIFESTE };
    vi.stubGlobal('fetch', async (url: string) => {
      demandes.push(url);
      if (!reseau) throw new TypeError('Failed to fetch');
      return { ok: url in reseau, status: url in reseau ? 200 : 404, json: async () => reseau![url] };
    });
  });
  afterEach(() => {
    oublierDrapeaux();
    vi.unstubAllGlobals();
  });
  const attendre = () => new Promise((r) => setTimeout(r, 0));

  it('Entraînement : Pays, Capitales, Drapeaux, Océans et mers, Communes (D53 b) ; son icône (D53 a) sans rien charger ; « 195 drapeaux », « 54 drapeaux »', () => {
    const j = monter();
    j.ouvrir('entrainement');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    const tuile = j.panneau.querySelector('[data-sujet="drapeaux"]')!;
    expect(tuile.innerText).toContain('Drapeaux');
    expect(tuile.innerText).toContain('195 drapeaux');
    expect(tuile.querySelector('.vignette-icone')).not.toBeNull();
    expect(tuile.querySelector('.vignette-carte')).toBeNull();
    j.ouvrir('entrainement', 'drapeaux');
    expect(j.attr('data-serie')).toEqual(SERIES_PAYS);
    expect(j.panneau.innerText).toContain('54 drapeaux');
    // Les séries reprennent les vignettes des régions, sans les points des capitales.
    expect(j.panneau.querySelector('[data-serie="tous"] .vignette-carte')).not.toBeNull();
    expect(j.panneau.querySelector('[data-serie="tous"] .vignette-points')).toBeNull();
    j.ouvrir('entrainement', 'drapeaux', 'Africa');
    expect(j.attr('data-mode')).toEqual(['apprendre', 'localiser', 'nommer']);
    for (const m of ['apprendre', 'localiser', 'nommer'] as const) expect(j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText).toContain(textes.jouer.exercices.drapeaux[m]);
    // Le « ? » dit que l'exercice est visuel.
    const aide = j.panneau.querySelector('#jouer-aide')!;
    expect(aide.getAttribute('aria-label')).toBe(textes.jouer.aide);
    expect(j.panneau.querySelector('#jouer-regles')!.hidden).toBe(true);
    aide.click();
    // En Entraînement, les quatre choix des QCM (Apprendre, Reconnaître) et leurs touches.
    expect(j.panneau.querySelector('#jouer-regles')!.innerText).toBe(`${textes.jouer.visuel} ${textes.jouer.visuel_choix}`);
    expect(textes.jouer.visuel).toMatch(/visuels/);
    // Les autres sujets d'Entraînement : pas de « ? » (rien ne change pour eux).
    j.ouvrir('entrainement', 'capitales', 'Africa');
    expect(j.panneau.querySelector('#jouer-aide')).toBeNull();
    j.ouvrir('entrainement', 'pays', 'Africa');
    expect(j.panneau.querySelector('#jouer-aide')).toBeNull();
    j.ouvrir('classe');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    // Rien de drapeaux* demandé pour afficher Jouer.
    expect(demandes).toEqual([]);
    expect(drapeauxCharges()).toBeNull();
  });

  it('Habitants et Superficies (J4, lot 3) : leur icône, « 195 pays », leurs phrases ; le « ? » dit le curseur et le juste à ×1,5 (le tracé pour les superficies) ; Classé, 15 s au curseur ; rien chargé pour Jouer', () => {
    const j = monter();
    j.ouvrir('entrainement');
    for (const s of ['habitants', 'superficies'] as const) {
      const tuile = j.panneau.querySelector(`[data-sujet="${s}"]`)!;
      expect(tuile.innerText).toContain(textes.jouer.sujets[s].nom);
      expect(tuile.innerText).toContain('195 pays');
      expect(tuile.querySelector('.vignette-icone')).not.toBeNull();
    }
    j.ouvrir('entrainement', 'habitants', 'Africa');
    expect(j.attr('data-mode')).toEqual(['apprendre', 'localiser', 'nommer']);
    for (const m of ['apprendre', 'localiser', 'nommer'] as const) expect(j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText).toContain(textes.jouer.exercices.habitants[m]);
    j.panneau.querySelector('#jouer-aide')!.click();
    expect(j.panneau.querySelector('#jouer-regles')!.innerText).toBe(textes.jouer.grandeurs);
    j.ouvrir('entrainement', 'superficies', 'Africa');
    j.panneau.querySelector('#jouer-aide')!.click();
    expect(j.panneau.querySelector('#jouer-regles')!.innerText).toBe(`${textes.jouer.grandeurs} ${textes.jouer.grandeurs_trace}`);
    j.ouvrir('classe', 'habitants', 'Africa');
    expect(j.attr('data-mode')).toEqual(['chrono', 'sansfaute']);
    expect(j.panneau.querySelector('[data-mode="chrono"]')!.innerText).toContain('15 s par question, au curseur');
    expect(j.panneau.querySelector('[data-mode="chrono"]')!.innerText).not.toContain('toucher');
    j.panneau.querySelector('#jouer-aide')!.click();
    const regles = j.panneau.querySelector('#jouer-regles')!.innerText;
    expect(regles).toContain('15 s par question pour régler le curseur');
    expect(regles).not.toContain('un seul toucher');
    // Ni fiches-monde.json ni le morceau du curseur pour afficher Jouer.
    expect(demandes).toEqual([]);
  });

  it('chargement puis lancement : « Chargement… », boutons désactivés, le manifeste seul, puis la partie part ; la seconde fois, tout de suite', async () => {
    const j = monter();
    j.ouvrir('entrainement', 'drapeaux', 'Africa');
    const statut = () => j.panneau.querySelector('.jouer-statut')!;
    j.panneau.querySelector('[data-mode="nommer"]')!.click();
    expect(statut().textContent).toBe(textes.toucher.chargement_sujet);
    expect(j.panneau.querySelector('[data-mode="localiser"]')!.disabled).toBe(true);
    expect(j.opts.lancer).not.toHaveBeenCalled();
    await attendre();
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
    expect(j.opts.lancer.mock.calls[0]![0]).toEqual({ branche: 'entrainement', sujet: 'drapeaux', serie: 'Africa', mode: 'nommer' });
    expect(j.opts.lancer.mock.calls[0]![3]).toHaveLength(54);
    expect(statut().hidden).toBe(true);
    // Le manifeste seul : aucune image demandée au lancement.
    expect(demandes).toEqual(['/geo/drapeaux.json']);
    j.panneau.querySelector('[data-mode="localiser"]')!.click();
    expect(j.opts.lancer).toHaveBeenCalledTimes(2);
    expect(demandes).toHaveLength(1);
  });

  it('Classé › Drapeaux (partie C) : son icône, les séries des pays, Chrono, Sans faute, leur phrase, leur record (celui des drapeaux), « ? » : règles et exercices visuels', () => {
    enregistrerPartie(localStorage, idEpreuve('Oceania', 'chrono', 'drapeaux'), { points: 13, justes: 13, questions: 14, temps_ms: 60_000 }, 1);
    enregistrerPartie(localStorage, idEpreuve('Oceania', 'chrono', 'capitales'), { points: 12, justes: 12, questions: 14, temps_ms: 70_000 }, 1);
    enregistrerPartie(localStorage, idEpreuve('Oceania', 'sansfaute'), { points: 9, justes: 9, questions: 10, temps_ms: 60_000 }, 1);
    const j = monter();
    j.ouvrir('classe');
    const tuile = j.panneau.querySelector('[data-sujet="drapeaux"]')!;
    expect(tuile.querySelector('.vignette-icone')).not.toBeNull();
    j.ouvrir('classe', 'drapeaux');
    expect(j.attr('data-serie')).toEqual(SERIES_PAYS);
    j.ouvrir('classe', 'drapeaux', 'Oceania');
    expect(j.panneau.dataset.niveau).toBe('exercices');
    expect(j.attr('data-mode')).toEqual(['chrono', 'sansfaute']);
    const ligne = (m: string) => j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText;
    // La phrase de chaque épreuve : celle du sujet s'il en a une (jouer.exercices.drapeaux.<mode>), la générique sinon.
    expect(ligne('chrono')).toContain('15 s par question, un seul toucher');
    expect(ligne('sansfaute')).toContain("15 s par question, jusqu'à la première erreur");
    expect(ligne('chrono')).toContain('13/14 · 92\u00a0%');
    expect(ligne('chrono')).not.toContain('12/14');
    // Le Sans faute des pays n'est pas celui des drapeaux.
    expect(ligne('sansfaute')).not.toContain('9/14');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Classé›Drapeaux›Océanie');
    j.panneau.querySelector('#jouer-aide')!.click();
    const regles = j.panneau.querySelector('#jouer-regles')!.innerText;
    expect(regles).toContain('Sans faute : les lieux de la série');
    expect(regles).not.toContain('Minute');
    expect(regles).toContain(textes.jouer.visuel);
    // Les épreuves se jouent sur la carte : ni quatre choix ni touches 1 à 4.
    expect(regles).not.toContain(textes.jouer.visuel_choix);
    expect(regles).not.toMatch(/1 à 4/);
    expect(a(['classe', 'drapeaux', 'Oceania'])).toBe('jouer/classe/drapeaux/Oceania');
  });

  it('un Chrono des drapeaux : le manifeste chargé dans Jouer, puis la partie part (branche classe, sujet drapeaux, les 14 pays d’Océanie) ; aucune image demandée par Jouer', async () => {
    const j = monter();
    j.ouvrir('classe', 'drapeaux', 'Oceania');
    j.panneau.querySelector('[data-mode="chrono"]')!.click();
    expect(j.panneau.querySelector('.jouer-statut')!.textContent).toBe(textes.toucher.chargement_sujet);
    await attendre();
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
    expect(j.opts.lancer.mock.calls[0]![0]).toEqual({ branche: 'classe', sujet: 'drapeaux', serie: 'Oceania', mode: 'chrono' });
    expect(j.opts.lancer.mock.calls[0]![3]).toHaveLength(14);
    expect(drapeauxCharges()).not.toBeNull();
    expect(demandes).toEqual(['/geo/drapeaux.json']);
  });

  it('échec puis message : hors ligne, aucune partie à vide, on reste au niveau, boutons rendus ; le prochain choix réessaie', async () => {
    reseau = null;
    const j = monter();
    j.ouvrir('entrainement', 'drapeaux', 'Africa');
    j.panneau.querySelector('[data-mode="apprendre"]')!.click();
    await attendre();
    expect(j.opts.lancer).not.toHaveBeenCalled();
    expect(j.panneau.querySelector('.jouer-statut')!.textContent).toBe(textes.toucher.echec_sujet);
    expect(j.panneau.querySelector('[data-mode="apprendre"]')!.disabled).toBe(false);
    expect(j.panneau.dataset.niveau).toBe('exercices');
    reseau = { '/geo/drapeaux.json': MANIFESTE };
    j.panneau.querySelector('[data-mode="apprendre"]')!.click();
    await attendre();
    expect(j.opts.lancer).toHaveBeenCalledTimes(1);
    expect(drapeauxCharges()).not.toBeNull();
  });
});

// Le sujet Océans et mers (lot 3b) : sous Entraînement (partie A) et sous
// Classé (partie B), après Drapeaux et avant Communes (D53 b), sa vignette
// (les mers éclairées, rangée dans le code) et « 50 océans et mers » sans
// rien charger, sa série unique sautée (D44 a) ; la couche marine lue puis
// posée sur la carte (prendreMers) avant la partie, épreuves comprises,
// jamais une partie à vide ; hors ligne, le message.
describe('la vue Jouer : le sujet Océans et mers', () => {
  let reseau = true;
  const demandes: string[] = [];
  beforeEach(() => {
    installerDom();
    installerStockage();
    demandes.length = 0;
    reseau = true;
    vi.stubGlobal('fetch', async (url: string) => {
      demandes.push(url);
      if (!reseau) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, text: async () => readFileSync(`public${url}`, 'utf8') };
    });
    oublierMers();
  });
  afterEach(() => {
    oublierMers();
    vi.unstubAllGlobals();
  });

  it('Entraînement : après Drapeaux, avant Communes ; « 50 océans et mers » et sa vignette sans rien charger ; la série unique sautée ; Apprendre, Trouver, Reconnaître', () => {
    const j = monter();
    j.ouvrir('entrainement');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    const tuile = j.panneau.querySelector('[data-sujet="mers"]')!;
    expect(tuile.innerText).toContain('Océans et mers');
    expect(tuile.innerText).toContain('50 océans et mers');
    // Le monde aux mers éclairées sous les terres (vignette-mers.ts), dans l'ovale du monde.
    expect(tuile.querySelector('.vignette-carte .vignette-eaux')).not.toBeNull();
    expect(tuile.querySelector('.vignette-carte .vignette-mer')).not.toBeNull();
    // Une seule série (D44 a) : son niveau est sauté, comme celui de Communes.
    expect(a(['entrainement', 'mers'])).toBe('jouer/entrainement/mers/mers');
    j.ouvrir('entrainement', 'mers');
    expect(j.opts.canoniser).toHaveBeenCalledWith('jouer/entrainement/mers/mers');
    expect(j.panneau.dataset.niveau).toBe('exercices');
    expect(j.attr('data-mode')).toEqual(['apprendre', 'localiser', 'nommer']);
    for (const m of ['apprendre', 'localiser', 'nommer'] as const) expect(j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText).toContain(textes.jouer.exercices.mers[m]);
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Entraînement›Océans et mers›Océans et mers');
    expect(j.panneau.querySelector('#jouer-aide')).toBeNull();
    // Rien de mers* demandé pour afficher Jouer.
    expect(demandes).toEqual([]);
    expect(mersChargees()).toBeNull();
  });

  it('Classé › Océans et mers (partie B) : sa tuile, la série unique sautée, Chrono et Sans faute, leur phrase, leur record (celui des mers, pas des pays), « ? » des règles seules', () => {
    enregistrerPartie(localStorage, idEpreuve('mers', 'chrono', 'mers'), { points: 41, justes: 41, questions: 50, temps_ms: 300_000 }, 1);
    enregistrerPartie(localStorage, idEpreuve('tous', 'chrono'), { points: 150, justes: 150, questions: 195, temps_ms: 900_000 }, 1);
    enregistrerPartie(localStorage, idEpreuve('mers', 'sansfaute', 'mers'), { points: 17, justes: 17, questions: 18, temps_ms: 60_000 }, 1);
    const j = monter();
    j.ouvrir('classe');
    expect(j.attr('data-sujet')).toEqual(['pays', 'capitales', 'drapeaux', 'voisins', 'habitants', 'superficies', 'mers', 'communes']);
    const tuile = j.panneau.querySelector('[data-sujet="mers"]')!;
    expect(tuile.innerText).toContain('50 océans et mers');
    expect(tuile.querySelector('.vignette-carte .vignette-mer')).not.toBeNull();
    tuile.click();
    expect(j.opts.pousser).toHaveBeenCalledWith('jouer/classe/mers/mers');
    j.ouvrir('classe', 'mers');
    expect(j.opts.canoniser).toHaveBeenCalledWith('jouer/classe/mers/mers');
    expect(j.panneau.dataset.niveau).toBe('exercices');
    expect(j.attr('data-mode')).toEqual(['chrono', 'sansfaute']);
    const ligne = (m: string) => j.panneau.querySelector(`[data-mode="${m}"]`)!.innerText;
    // La phrase commune des épreuves (jouer.exercices.mers n'a pas la sienne : le repli), et le record des mers.
    expect(ligne('chrono')).toContain('15 s par question, un seul toucher');
    expect(ligne('sansfaute')).toContain("15 s par question, jusqu'à la première erreur");
    expect(ligne('chrono')).toContain('41/50 · 82\u00a0%');
    expect(ligne('chrono')).not.toContain('150/195');
    expect(ligne('sansfaute')).toContain('17/50');
    expect(j.panneau.querySelector('h2')?.textContent).toBe('Classé›Océans et mers›Océans et mers');
    // « ? » : les règles des deux épreuves, sans l'aide des exercices visuels (les drapeaux seuls).
    j.panneau.querySelector('#jouer-aide')!.click();
    const regles = j.panneau.querySelector('#jouer-regles')!.innerText;
    expect(regles).toContain('Sans faute : les lieux de la série');
    expect(regles).not.toContain(textes.jouer.visuel);
    expect(demandes).toEqual([]);
    expect(mersChargees()).toBeNull();
  });

  it('un Chrono et un Sans faute des mers : la couche lue puis posée sur la carte avant la partie (branche classe, sujet mers, ses 50 zones) ; hors ligne, le message et aucune partie', async () => {
    reseau = false;
    const j = monter();
    j.ouvrir('classe', 'mers', 'mers');
    const statut = () => j.panneau.querySelector('.jouer-statut')!;
    j.panneau.querySelector('[data-mode="chrono"]')!.click();
    expect(statut().textContent).toBe(textes.toucher.chargement_sujet);
    expect(j.panneau.querySelector('[data-mode="sansfaute"]')!.disabled).toBe(true);
    await vi.waitFor(() => expect(statut().textContent).toBe(textes.toucher.echec_sujet));
    expect(j.opts.lancer).not.toHaveBeenCalled();
    expect(j.carte.prendreMers).not.toHaveBeenCalled();
    expect(j.panneau.querySelector('[data-mode="chrono"]')!.disabled).toBe(false);
    reseau = true;
    j.panneau.querySelector('[data-mode="chrono"]')!.click();
    expect(j.opts.lancer).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(j.opts.lancer).toHaveBeenCalledTimes(1));
    // Posée avant le lancement : la vue des épreuves ne part qu'avec les mers sur la carte.
    expect(j.carte.prendreMers).toHaveBeenCalledTimes(1);
    expect(j.donnees.mers).toHaveLength(50);
    const [l, s, , ids] = j.opts.lancer.mock.calls[0]!;
    expect(l).toEqual({ branche: 'classe', sujet: 'mers', serie: 'mers', mode: 'chrono' });
    expect([s.id, s.n]).toEqual(['mers', 50]);
    expect([...ids].sort()).toEqual([...IDS_MERS].sort());
    j.panneau.querySelector('[data-mode="sansfaute"]')!.click();
    expect(j.opts.lancer).toHaveBeenCalledTimes(2);
    expect(j.opts.lancer.mock.calls[1]![0]).toEqual({ branche: 'classe', sujet: 'mers', serie: 'mers', mode: 'sansfaute' });
    expect(j.carte.prendreMers).toHaveBeenCalledTimes(1);
  });

  it('l’arbre créé au démarrage (creerArbre, serieMers) ne lit rien de mers* : le réseau espionné avant sa création', async () => {
    const neuf = creerArbre(CATALOGUE);
    expect(neuf.series('mers').map((x) => x.n)).toEqual([50]);
    expect(neuf.choix({ type: 'series', branche: 'entrainement', sujet: 'mers' })).toEqual(['mers']);
    await new Promise((r) => setTimeout(r, 0));
    expect(demandes).toEqual([]);
    expect(mersChargees()).toBeNull();
  });

  it('chargement puis lancement : « Chargement… », boutons désactivés, la couche lue puis posée sur la carte, puis la partie part sur ses 50 zones ; la seconde fois, tout de suite', async () => {
    const j = monter();
    j.ouvrir('entrainement', 'mers', 'mers');
    const statut = () => j.panneau.querySelector('.jouer-statut')!;
    j.panneau.querySelector('[data-mode="localiser"]')!.click();
    expect(statut().textContent).toBe(textes.toucher.chargement_sujet);
    expect(j.panneau.querySelector('[data-mode="nommer"]')!.disabled).toBe(true);
    expect(j.opts.lancer).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(j.opts.lancer).toHaveBeenCalledTimes(1));
    // Posée avant le lancement : noter et les rendus trouvent les mers (donnees.mers).
    expect(j.carte.prendreMers).toHaveBeenCalledTimes(1);
    expect(j.donnees.mers).toHaveLength(50);
    const [l, s, , ids] = j.opts.lancer.mock.calls[0]!;
    expect(l).toEqual({ branche: 'entrainement', sujet: 'mers', serie: 'mers', mode: 'localiser' });
    expect([s.id, s.terrain, s.n]).toEqual(['mers', 'monde', 50]);
    expect(ids).toHaveLength(50);
    expect(ids).toContain('medit');
    expect(statut().hidden).toBe(true);
    expect([...demandes].sort()).toEqual(FICHIERS_MERS.map((f) => `/geo/${f}`).sort());
    j.panneau.querySelector('[data-mode="nommer"]')!.click();
    expect(j.opts.lancer).toHaveBeenCalledTimes(2);
    expect(j.carte.prendreMers).toHaveBeenCalledTimes(1);
    expect(demandes).toHaveLength(4);
  });

  it('échec puis message : hors ligne, aucune partie à vide, on reste au niveau, boutons rendus ; le prochain choix réessaie', async () => {
    reseau = false;
    const j = monter();
    j.ouvrir('entrainement', 'mers', 'mers');
    j.panneau.querySelector('[data-mode="apprendre"]')!.click();
    await vi.waitFor(() => expect(j.panneau.querySelector('.jouer-statut')!.textContent).toBe(textes.toucher.echec_sujet));
    expect(j.opts.lancer).not.toHaveBeenCalled();
    expect(j.carte.prendreMers).not.toHaveBeenCalled();
    expect(j.panneau.querySelector('[data-mode="apprendre"]')!.disabled).toBe(false);
    expect(j.panneau.dataset.niveau).toBe('exercices');
    reseau = true;
    j.panneau.querySelector('[data-mode="apprendre"]')!.click();
    await vi.waitFor(() => expect(j.opts.lancer).toHaveBeenCalledTimes(1));
    expect(j.donnees.mers).toHaveLength(50);
  });
});
