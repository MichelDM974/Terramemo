// Vue des épreuves (src/vues/chrono.ts) sur un DOM factice : quitter la vue,
// ou toucher « Abandonner », pendant une partie (#16, défaut 3) ; Sans faute et
// Minute (#14) ; la partie lancée depuis Jouer et les retours vers lui (#18,
// décision « Écran Jouer »). La carte, les mesures et le bloc du classement
// sont remplacés ; chaque toucher est juste, sauf ceux que `faux` désigne. Les
// minuteries et performance.now() sont factices : le temps de réponse est
// celui qu'on avance.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { capitalesChargees, chargerCapitales } from '../src/map/capitales';
import type { Topology } from 'topojson-specification';
import { acceptesDe } from '../src/map/acceptes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { chargerDrapeaux, drapeauxCharges, oublierDrapeaux } from '../src/map/drapeaux';
import { calculerPastilles } from '../src/map/pastilles';
import { noter } from '../src/map/pick';
import { creerProjection } from '../src/map/projection';
import { DEBUT_ACCEPTES_EPREUVES } from '../src/epreuve/bareme';
import { idEpreuve, lireRecords } from '../src/epreuve/chrono';
import type { Pays } from '../src/map/types';
import { ditsPar, installerDom, installerStockage, El } from './dom-factice';
import { code, FACTICE, sansBrut } from './sujet-factice';

const blocClassement = vi.fn((_epreuve: string, _titre: string, _apres?: (pseudo: string) => Promise<unknown>) => new El('section'));
vi.mock('../src/vues/classement', () => ({
  blocClassement: (...a: Parameters<typeof blocClassement>) => blocClassement(...a),
  publierPartie: vi.fn(),
}));
vi.mock('../src/vues/sujets', async (orig) => (await import('./sujet-factice')).avecFactice(await orig()));

const { vueChrono } = await import('../src/vues/chrono');
const { textes } = await import('../src/vues/textes');
const { catalogue } = await import('../src/vues/cibles');
const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const AMS = 'South America';
/** Ses exercices dans Jouer : là où ramène l'abandon. */
const EXERCICES_AMS = `jouer/classe/pays/${AMS}`;

/** Les touchers à rendre faux (leur numéro, à partir de 1). */
let faux = new Set<number>();
let touchers = 0;
/** Les options de chaque appel à noter() (règle des zones contestées et des enclaves). */
let optionsNoter: unknown[] = [];
/** La zone admise que noter() rend au prochain toucher juste (Note.admis). */
let admisSuivant: unknown = null;

const L = 384;
const H = 723;
/** Le doigt au centre de l'écran, la carte zoomée (40) sur le point d'étiquette de la zone touchée. */
function noterVrai(v: NoterVrai, cible: string, o: Parameters<typeof noter>[4]) {
  const proj = creerProjection('monde', L, H);
  const touchee = v.zone(cible);
  const b = proj(v.donnees.entites.find((e) => e.pays.id === touchee)!.pays.point) as [number, number];
  const k = 40;
  const ctx = { proj, t: { k, x: L / 2 - k * b[0], y: H / 2 - k * b[1] }, entites: v.donnees.entites, pastilles: pastillesK40(v.donnees, proj, k), acceptes: acceptesDe(v.donnees) };
  return noter(ctx, cible, L / 2, H / 2, o);
}
/** Les pastilles ne dépendent que de la projection et du zoom : calculées une fois. */
let pastilles: ReturnType<typeof calculerPastilles> | null = null;
const pastillesK40 = (d: DonneesCarte, proj: ReturnType<typeof creerProjection>, k: number) => (pastilles ??= calculerPastilles(d.entites, proj, k));

/**
 * Le vrai noter() sur la carte du monde (étude J2 § 2.2) : chaque question se
 * touche au point d'étiquette de la zone que `zone` désigne pour sa cible.
 */
interface NoterVrai {
  donnees: DonneesCarte;
  zone(cible: string): string;
}

function contexte(maintenant?: () => number, noms: Record<string, string> = { RUS: 'Russie', KAZ: 'Kazakhstan', NE_KAB: 'Baïkonour' }, vrai?: NoterVrai) {
  const zone = new El('main');
  const entites = vrai ? vrai.donnees.entites : pays.map((p) => ({ pays: p }));
  const consigne = () => zone.querySelector('#barre-chrono .essai-consigne')?.dataset.cible;
  const carte = {
    effacerMarques() {},
    marquer() {},
    anneau() {},
    zoomer() {},
    noter: (id: string, _x: number, _y: number, o?: unknown) => (
      optionsNoter.push(o),
      vrai
        ? noterVrai(vrai, id, o as never)
        : faux.has(++touchers)
          ? { pick: { id: 'BRA' }, juste: false, distance_km: 120 }
          : { pick: { id }, juste: true, distance_km: 0, admis: admisSuivant }
    ),
    projection: { scale: () => 1 },
    transfo: { k: 1 },
  };
  const monde = { nom: 'monde', carte, donnees: { noms, entites }, jouables: [], credit: null };
  const terrains = { monde, actif: 'monde', montrer: vi.fn(), deja: () => null, charger: vi.fn() };
  const mesures = { toucher: (_ev: unknown, _x: number, _y: number, f: () => unknown) => f() };
  const ctx = { carte, donnees: monde.donnees, terrains, mesures, zone };
  const versJouer = vi.fn<(cible: string, message?: string) => void>();
  const v = vueChrono(ctx as unknown as Parameters<typeof vueChrono>[0], { versJouer, maintenant });
  /** L'épreuve et sa série choisies dans Jouer : la vue s'ouvre, la partie part. */
  const lancer = (mode: 'chrono' | 'sansfaute' | 'minute' = 'chrono', serie = AMS, sujet = 'pays') => {
    const s = catalogue(pays).find((x) => x.id === serie)!;
    v.activer();
    v.lancer({ branche: 'classe', sujet, serie, mode }, s, monde as never, [...s.ids]);
  };
  return { v, zone, consigne, versJouer, lancer };
}

beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
  blocClassement.mockClear();
  faux = new Set();
  touchers = 0;
  optionsNoter = [];
  admisSuivant = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Chrono : quitter la vue', () => {
  /** L'Amérique du Sud (12 pays) jouée juste, jusqu'à la dernière réponse (pause de sa rétroaction en cours). */
  function jouerJusquaLaDerniere() {
    const { v, zone, consigne, versJouer, lancer } = contexte();
    lancer();
    const vues = new Set<string>();
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(i ? 1_000 : 0); // la pause (0,9 s) de la réponse d'avant, puis 0,1 s pour répondre
      const c = consigne();
      expect(c).toBeTruthy();
      vues.add(c!);
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    expect(vues.size).toBe(12);
    return { v, zone, versJouer };
  }

  it('pendant la pause qui suit la dernière réponse : la partie va au bilan et se publie, au lieu d’être abandonnée', () => {
    const { v, zone, versJouer } = jouerJusquaLaDerniere();
    v.desactiver(); // l'onglet Carte, avant la fin de la pause
    vi.advanceTimersByTime(5_000);
    expect(v.aMontrer?.()).toBe(true);
    expect(v.redirection?.()).toBeNull(); // le bilan est à montrer : pas de renvoi à Jouer
    v.activer();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    expect(zone.querySelector('#chrono-bilan')?.innerText).toContain('12 000');
    // Le record est gardé, et le bloc du classement a de quoi publier la partie.
    expect(lireRecords(localStorage).get(idEpreuve(AMS))?.points).toBe(12_000);
    expect(blocClassement).toHaveBeenCalledWith(idEpreuve(AMS), expect.any(String), expect.any(Function));
    // Au retour suivant, le bilan encore (il était affiché) ; « Autre série » ramène aux séries des pays.
    v.desactiver();
    expect(v.redirection?.()).toBeNull();
    v.activer();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    zone.querySelector('#chrono-autre')?.click();
    expect(versJouer).toHaveBeenCalledWith('jouer/classe/pays');
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(true);
    v.desactiver();
    // Revenu sans partie ni bilan : Jouer, aux exercices de la série ; rien à montrer (le « × » de Jouer ne la rouvre pas).
    expect(v.aMontrer?.()).toBe(false);
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: '' });
  });

  it('« Abandonner » pendant la pause qui suit la dernière réponse : la partie va au bilan, au lieu d’être jetée', () => {
    const { v, zone, versJouer } = jouerJusquaLaDerniere();
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(false); // le bouton est encore à portée
    zone.querySelector('#chrono-abandonner')?.click();
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    expect(versJouer).not.toHaveBeenCalled();
    expect(zone.querySelector('#chrono-bilan')?.innerText).toContain('12 000');
    expect(lireRecords(localStorage).get(idEpreuve(AMS))?.points).toBe(12_000);
    expect(blocClassement).toHaveBeenCalledWith(idEpreuve(AMS), expect.any(String), expect.any(Function));
    // La fin de la pause ne repose rien : le bilan reste.
    vi.advanceTimersByTime(5_000);
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(false);
    v.desactiver();
  });

  it('« Abandonner » avec une question encore à poser : la partie est abandonnée, retour aux exercices de la série dans Jouer, qui le dit', () => {
    const { v, zone, versJouer, lancer } = contexte();
    lancer();
    vi.advanceTimersByTime(100);
    v.toucher?.(0, 0, {} as PointerEvent);
    zone.querySelector('#chrono-abandonner')?.click();
    expect(versJouer).toHaveBeenCalledWith(EXERCICES_AMS, textes.chrono.abandon);
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(true);
    expect(zone.querySelector('#chrono-bilan')?.hidden).toBe(true);
    expect(lireRecords(localStorage).size).toBe(0);
    expect(blocClassement).not.toHaveBeenCalled();
  });

  it('une question encore à poser : la partie quittée reste abandonnée ; y revenir renvoie à Jouer, qui le dit (une fois)', () => {
    const { v, zone, lancer } = contexte();
    lancer();
    vi.advanceTimersByTime(100);
    v.toucher?.(0, 0, {} as PointerEvent);
    v.desactiver();
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(true);
    expect(v.aMontrer?.()).toBe(false); // sans effet de bord : le message reste à dire
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: textes.chrono.abandon });
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: '' });
    expect(lireRecords(localStorage).size).toBe(0);
    expect(blocClassement).not.toHaveBeenCalled();
  });

  it('atteinte sans aucune partie (adresse tapée) : Jouer', () => {
    const { v } = contexte();
    expect(v.redirection?.()).toEqual({ cible: 'jouer', message: '' });
  });
});

describe('Sans faute et Minute (décision « Sans faute et Minute »)', () => {
  /** L'épreuve et l'Amérique du Sud (12 pays) choisies dans Jouer. */
  function partir(mode: 'sansfaute' | 'minute') {
    const { v, zone, consigne, lancer } = contexte();
    lancer(mode);
    const bilan = () => zone.querySelector('#chrono-bilan')!;
    return { v, zone, consigne, bilan };
  }

  it('Jouer choisit l’épreuve et la série : la partie part tout de suite, comptée à la façon de l’épreuve', () => {
    const { zone, consigne, lancer } = contexte();
    const compte = () => zone.querySelector('#barre-chrono .essai-compte')?.textContent;
    lancer('chrono');
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(false);
    expect(consigne()).toBeTruthy();
    expect(compte()).toBe('1 / 12 · 0 pts');
    lancer('minute');
    expect(compte()).toBe('0 juste · 0 erreur');
    lancer('sansfaute');
    expect(compte()).toBe("1 / 12 · 0 d'affilée");
  });

  it('« Rejouer » du bilan relance la même épreuve sur la même série', () => {
    faux = new Set([1]);
    const { zone, bilan, consigne, v } = partir('sansfaute');
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    vi.advanceTimersByTime(1_800);
    expect(bilan().hidden).toBe(false);
    expect(bilan().querySelector('h2')?.textContent).toBe('Sans faute · Amérique du Sud');
    zone.querySelector('#chrono-rejouer')?.click();
    expect(bilan().hidden).toBe(true);
    expect(zone.querySelector('#barre-chrono')?.hidden).toBe(false);
    expect(consigne()).toBeTruthy();
    expect(zone.querySelector('#barre-chrono .essai-compte')?.textContent).toBe("1 / 12 · 0 d'affilée");
  });

  it('Sans faute s’arrête à la première erreur : les justes d’affilée, record et classement de l’épreuve', () => {
    faux = new Set([4]);
    const { v, consigne, bilan } = partir('sansfaute');
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(i ? 900 + 2_000 : 2_000);
      expect(consigne()).toBeTruthy();
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    expect(bilan().hidden).toBe(true); // la rétroaction de l'erreur d'abord
    vi.advanceTimersByTime(1_800);
    expect(bilan().hidden).toBe(false);
    expect(bilan().innerText).toContain("3 d'affilée sur 12");
    const e = idEpreuve(AMS, 'sansfaute');
    expect(lireRecords(localStorage).get(e)).toMatchObject({ points: 3, justes: 3, questions: 4, temps_ms: 6_000 });
    expect(lireRecords(localStorage).has(idEpreuve(AMS))).toBe(false);
    expect(blocClassement).toHaveBeenCalledWith(e, expect.any(String), expect.any(Function));
  });

  it('Sans faute : le temps écoulé finit la partie', () => {
    const { v, bilan } = partir('sansfaute');
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    vi.advanceTimersByTime(900 + 15_000 + 1_800);
    expect(bilan().hidden).toBe(false);
    expect(lireRecords(localStorage).get(idEpreuve(AMS, 'sansfaute'))).toMatchObject({ points: 1, questions: 2, temps_ms: 1_000 });
  });

  it('Minute : une erreur passe à la suivante ; la rétroaction ne compte pas dans la minute', () => {
    faux = new Set([2]);
    const { v, consigne, bilan } = partir('minute');
    for (const pause of [0, 900, 1_800]) {
      vi.advanceTimersByTime(pause + 5_000);
      expect(consigne()).toBeTruthy();
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    // 15 s de réponses : il reste 45 s, après la rétroaction (0,9 s).
    vi.advanceTimersByTime(900 + 44_999);
    expect(bilan().hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(bilan().hidden).toBe(false);
    expect(bilan().innerText).toContain('2 justes en une minute');
    expect(bilan().innerText).toContain('1 erreur');
    const e = idEpreuve(AMS, 'minute');
    expect(lireRecords(localStorage).get(e)).toMatchObject({ points: 2, justes: 2, questions: 3, temps_ms: 60_000 });
    expect(blocClassement).toHaveBeenCalledWith(e, expect.any(String), expect.any(Function));
  });

  it('Minute : la série vidée avant la fin arrête la partie, au temps passé', () => {
    const { v, consigne, bilan } = partir('minute');
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(i ? 900 + 1_000 : 1_000);
      expect(consigne()).toBeTruthy();
      v.toucher?.(0, 0, {} as PointerEvent);
    }
    vi.advanceTimersByTime(900);
    expect(bilan().hidden).toBe(false);
    expect(bilan().innerText).toContain('série vidée en 12');
    expect(lireRecords(localStorage).get(idEpreuve(AMS, 'minute'))).toMatchObject({ points: 12, questions: 12, temps_ms: 12_000 });
  });

  it('Minute quittée en cours : abandonnée, rien n’est gardé', () => {
    const { v } = partir('minute');
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    v.desactiver();
    expect(v.redirection?.()).toEqual({ cible: EXERCICES_AMS, message: textes.chrono.abandon });
    expect(lireRecords(localStorage).size).toBe(0);
  });
});

describe('zones contestées et enclaves : à partir du lundi 09/11/2026 0 h UTC', () => {
  /** Une partie partie à t (horloge injectée), deux touchers dont le second après la date. */
  function deuxTouchers(t0: number) {
    let t = t0;
    const { v, lancer } = contexte(() => t);
    lancer();
    v.toucher?.(0, 0, {} as PointerEvent);
    t = DEBUT_ACCEPTES_EPREUVES + 3_600_000;
    vi.advanceTimersByTime(1_000);
    v.toucher?.(0, 0, {} as PointerEvent);
    return optionsNoter;
  }

  it('partie lancée avant : notée de fait strict, jusqu’au bout (une seule règle par partie)', () => {
    expect(deuxTouchers(DEBUT_ACCEPTES_EPREUVES - 60_000)).toEqual([{ acceptes: false }, { acceptes: false }]);
  });

  it('partie lancée à la date ou après : zones contestées et enclaves admises', () => {
    expect(deuxTouchers(DEBUT_ACCEPTES_EPREUVES)).toEqual([{ acceptes: true }, { acceptes: true }]);
  });
});

describe('rétroaction d’une zone admise', () => {
  it('Chrono : « Juste (zone contestée, tenue par Russie) · +1000 » ; Sans faute : « Juste (enclave : Baïkonour) »', () => {
    const { v, zone, consigne, lancer } = contexte(() => DEBUT_ACCEPTES_EPREUVES);
    lancer('chrono');
    admisSuivant = { zone: 'NE_B89', tenant: 'RUS', sorte: 'contestee' };
    v.toucher?.(0, 0, {} as PointerEvent);
    const retro = () => zone.querySelector('#barre-chrono .essai-retro')?.textContent ?? '';
    expect(retro()).toMatch(/^Juste \(zone contestée, tenue par Russie\) · \+1/);
    vi.advanceTimersByTime(1_000);
    admisSuivant = null;
    v.toucher?.(0, 0, {} as PointerEvent);
    expect(retro()).toMatch(/^Juste · \+/);
    const s = lancer as (m: 'sansfaute') => void;
    s('sansfaute');
    admisSuivant = { zone: 'NE_KAB', tenant: 'NE_KAB', sorte: 'enclave' };
    v.toucher?.(0, 0, {} as PointerEvent);
    expect(retro()).toBe('Juste (enclave : Baïkonour)');
  });
});

describe('rendu par sujet (étude J2 § 5.1)', () => {
  const retro = (zone: El) => zone.querySelector('#barre-chrono .essai-retro')?.textContent ?? '';
  const barre = (zone: El) => zone.querySelector('#barre-chrono')?.innerText ?? '';

  it('pays et communes : « Touche : » et le nom, le temps écoulé de leur sujet', () => {
    for (const [sujet, fin] of [
      ['pays', 'Le bon pays est en vert.'],
      ['communes', 'La bonne commune est en vert.'],
    ] as const) {
      const { zone, consigne, lancer } = contexte();
      lancer('chrono', AMS, sujet);
      const id = consigne()!;
      expect(zone.querySelector('#barre-chrono .essai-consigne')?.textContent).toBe(`Touche : ${id}`);
      vi.advanceTimersByTime(15_000);
      expect(retro(zone)).toBe(`Temps écoulé · +0. ${fin}`);
      // En Sans faute, le temps écoulé ne compte aucun point : pas de « +0 » (la Minute finie va droit au bilan).
      const c = contexte();
      c.lancer('sansfaute', AMS, sujet);
      vi.advanceTimersByTime(15_000);
      expect(retro(c.zone)).toBe(`Temps écoulé. ${fin}`);
    }
  });

  it('un sujet factice : énoncé, « tu as touché », temps écoulé et bilan par son rendu, aucun id brut affiché', () => {
    const { v, zone, consigne, lancer } = contexte();
    faux = new Set([1]);
    lancer('chrono', AMS, FACTICE);
    const vus: string[] = [];
    // 1re question : un toucher faux (BRA désigné).
    const q1 = consigne()!;
    expect(zone.querySelector('#barre-chrono .essai-consigne')?.textContent).toBe(`Cherche : énoncé ${code(q1)}`);
    vi.advanceTimersByTime(100);
    v.toucher?.(0, 0, {} as PointerEvent);
    expect(retro(zone)).toMatch(new RegExp(`^Faux : touché ${code('BRA')}, à 120`));
    vus.push(barre(zone));
    // 2e : le temps écoulé.
    vi.advanceTimersByTime(1_800);
    const q2 = consigne()!;
    vus.push(barre(zone));
    vi.advanceTimersByTime(15_000);
    expect(retro(zone)).toBe(`sablier compté ${code(q2)}`);
    vus.push(barre(zone));
    vi.advanceTimersByTime(1_800);
    // Les 10 autres, justes ; la première dans une zone contestée tenue par la Russie, dite par le rendu du sujet.
    for (let i = 0; i < 10; i++) {
      vus.push(barre(zone));
      admisSuivant = i === 0 ? { zone: 'NE_B89', tenant: 'RUS', sorte: 'contestee' } : null;
      v.toucher?.(0, 0, {} as PointerEvent);
      if (i === 0) expect(retro(zone)).toMatch(new RegExp(`^Juste \\(zone contestée, tenue par lieu ${code('RUS')}\\) · \\+1`));
      vus.push(barre(zone));
      vi.advanceTimersByTime(900);
    }
    const bilan = zone.querySelector('#chrono-bilan')!;
    expect(bilan.hidden).toBe(false);
    expect(bilan.innerText).toContain(`bilan-localiser ${code(q1)} → touché ${code('BRA')}, à 120`);
    expect(bilan.innerText).toContain(`bilan-localiser ${code(q2)} : temps écoulé`);
    vus.push(bilan.innerText);
    const ids = catalogue(pays).find((x) => x.id === AMS)!.ids;
    for (const t of vus) sansBrut(t, [...ids, 'BRA', 'RUS', 'Russie', 'NE_B89']);
  });

  it('un sujet factice en Sans faute : le temps écoulé par son rendu, sans points', () => {
    const { zone, consigne, lancer } = contexte();
    lancer('sansfaute', AMS, FACTICE);
    const q = consigne()!;
    vi.advanceTimersByTime(15_000);
    expect(retro(zone)).toBe(`sablier ${code(q)}`);
  });
});

// Le sujet Capitales en épreuve (D38 d) : Classé › Capitales à partir du
// lundi 16/11/2026 (bascule datée de src/epreuve/chrono.ts) ; la vue les pose.
describe('le sujet Capitales en épreuve', () => {
  const NOMS_FR = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  const EPREUVE: Record<string, string> = { BOL: 'La Paz', ARG: 'Buenos Aires', PER: 'Lima' };
  beforeAll(async () => {
    await chargerCapitales(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
  });

  it('la capitale de l’épreuve, la même à chaque partie (La Paz pour la Bolivie) ; la rétroaction nomme le pays, sans anneau ; bilan « ville (pays) »', () => {
    for (let k = 0; k < 3; k++) {
      const { v, zone, consigne, lancer } = contexte(undefined, NOMS_FR);
      faux = new Set([1]);
      touchers = 0;
      lancer('chrono', AMS, 'capitales');
      const vus: string[] = [];
      for (let q = 0; q < 12; q++) {
        const id = consigne();
        if (!id) break;
        const c = zone.querySelector('#barre-chrono .essai-consigne')!;
        expect(c.textContent!.startsWith('Pays dont la capitale est : ')).toBe(true);
        expect(c.classList.contains('consigne-deux-lignes')).toBe(true);
        if (EPREUVE[id]) expect(c.querySelector('strong')!.textContent).toBe(EPREUVE[id]);
        vi.advanceTimersByTime(100);
        v.toucher?.(0, 0, {} as PointerEvent);
        const r = zone.querySelector('#barre-chrono .essai-retro')!.textContent!;
        if (id === 'BOL' && q > 0) expect(r).toMatch(/^Juste · \+[\d\u202f]+ · La Paz, siège du gouvernement \(Bolivie\)$/);
        if (q === 0) expect(r).toMatch(/^Faux : Brésil, à 120/);
        vus.push(zone.querySelector('#barre-chrono')!.innerText);
        vi.advanceTimersByTime(2_000);
      }
      const bilan = zone.querySelector('#chrono-bilan')?.innerText ?? zone.innerText;
      vus.push(bilan);
      expect(bilan).toMatch(/\S+ \([^)]+\) → Brésil/);
      for (const t of vus) expect(t).not.toMatch(/\bQ\d+\b/);
    }
  });
  /** Une partie entière du Chrono des capitales sur cette série, chaque toucher juste : la capitale montrée pour chaque pays. */
  function partieEntiere(serie: string, maintenant?: () => number) {
    const ctx = contexte(maintenant, NOMS_FR);
    ctx.lancer('chrono', serie, 'capitales');
    const montrees = new Map<string, string>();
    const options = new Map<string, unknown>();
    for (let q = 0; q < 200; q++) {
      const id = ctx.consigne();
      if (!id) break;
      montrees.set(id, ctx.zone.querySelector('#barre-chrono .essai-consigne strong')!.textContent!);
      vi.advanceTimersByTime(100);
      const avant = optionsNoter.length;
      ctx.v.toucher?.(0, 0, {} as PointerEvent);
      // La partie est finie : la consigne garde la dernière question, que ce
      // toucher ignoré ne doit pas écraser (Israël tiré en dernier en Asie).
      if (optionsNoter.length === avant) break;
      options.set(id, optionsNoter[avant]);
      vi.advanceTimersByTime(1_000);
    }
    return { ...ctx, montrees, options };
  }

  it('D38 d : deux parties du Chrono des capitales (Tous les pays) montrent les mêmes indices pour les 12 pays à plusieurs capitales, ceux de l’épreuve (e: 1)', () => {
    const cap = capitalesChargees()!;
    const plusieurs = [...cap.parPays.values()].filter((c) => c.justes.length > 1).map((c) => c.pays);
    const tous = catalogue(pays).find((x) => x.id === 'tous')!.ids;
    const douze = plusieurs.filter((id) => tous.includes(id));
    expect(douze).toHaveLength(12);
    // Deux tirages de l'ordre différents, et un hasard qui, hors épreuve, ferait varier la capitale montrée.
    const aleas = [0.01, 0.99];
    const parties = aleas.map((x) => {
      vi.spyOn(Math, 'random').mockReturnValue(x);
      try {
        return partieEntiere('tous');
      } finally {
        vi.restoreAllMocks();
      }
    });
    for (const p of parties) expect(p.montrees.size).toBe(195);
    const [a, b] = parties.map((p) => douze.map((id) => p.montrees.get(id)));
    expect(a).toEqual(b);
    expect(a).toEqual(douze.map((id) => cap.parPays.get(id)!.epreuve.nom));
    // La plus connue (La Paz, Abidjan), sauf la Palestine : la principale (Jérusalem-Est).
    const de = (id: string) => parties[0]!.montrees.get(id);
    expect([de('BOL'), de('CIV'), de('PSE')]).toEqual(['La Paz', 'Abidjan', 'Jérusalem-Est']);
    // Chaque pays, ses 195 indices : les mêmes d'une partie à l'autre.
    expect([...parties[0]!.montrees].sort()).toEqual([...parties[1]!.montrees].sort());
  });

  it('D36 i au Chrono des capitales : Jérusalem admet la Palestine, Jérusalem-Est Israël (zones admises de la question)', () => {
    const { options, montrees } = partieEntiere('Asia', () => Date.parse('2026-11-16T00:00:00Z'));
    expect([montrees.get('ISR'), montrees.get('PSE')]).toEqual(['Jérusalem', 'Jérusalem-Est']);
    const zones = (id: string) => ((options.get(id) as { acceptes: Map<string, { zone: string; sorte: string }[]> }).acceptes.get(id) ?? []).filter((z) => z.sorte === 'capitale').map((z) => z.zone);
    expect(zones('ISR')).toEqual(['PSE']);
    expect(zones('PSE')).toEqual(['ISR']);
    // Un pays à une seule capitale : aucune zone admise de plus pour le sujet.
    expect((options.get('JPN') as { acceptes: unknown }).acceptes).toBe(true);
  });

  it('bilan d’une épreuve des capitales : « Chrono · Capitales · Océanie » (nomEpreuve), son record sous chrono:capitales:Oceania, son classement', () => {
    const { zone } = partieEntiere('Oceania');
    expect(zone.querySelector('#chrono-bilan h2')!.textContent).toBe('Chrono · Capitales · Océanie');
    const e = idEpreuve('Oceania', 'chrono', 'capitales');
    expect(lireRecords(localStorage).get(e)?.questions).toBe(14);
    expect(lireRecords(localStorage).has(idEpreuve('Oceania'))).toBe(false);
    expect(blocClassement.mock.calls.at(-1)![0]).toBe(e);
  });
});

// Le sujet Drapeaux en épreuve (étude J2 § 2.2, 5.3 ; lot 2, partie C) : son
// rendu, la partie préchargée au départ, le temps qui attend un drapeau pas
// encore là, les jumeaux (D41 d), le bilan et le classement. Lancée ici
// directement, comme Jouer la lance après la bascule (tests/jouer.test.ts).
describe('le sujet Drapeaux en épreuve', () => {
  const NOMS_FR = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  beforeAll(async () => {
    await chargerDrapeaux(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
  });

  it('la barre montre le drapeau (alt « Drapeau à reconnaître »), jamais le pays avant la réponse ; la rétroaction le nomme ; le jumeau en zone admise du sujet', () => {
    const { v, zone, consigne, lancer } = contexte(undefined, NOMS_FR);
    faux = new Set([2]);
    lancer('chrono', AMS, 'drapeaux');
    for (let q = 0; q < 3; q++) {
      const id = consigne()!;
      const c = zone.querySelector('#barre-chrono .essai-consigne')!;
      expect(c.textContent).toBe('Pays de ce drapeau : ');
      expect(c.classList.contains('consigne-image')).toBe(true);
      const img = c.querySelector('strong img')!;
      expect(img.getAttribute('src')).toBe(drapeauxCharges()!.parPays.get(id)!.montre);
      expect(img.getAttribute('alt')).toBe('Drapeau à reconnaître');
      expect(img.getAttribute('title')).toBeNull();
      // La barre entière, attributs compris (title, aria-* de la consigne, de son <strong>, de l'image), data-* exceptés.
      sansBrut(ditsPar(zone.querySelector('#barre-chrono')!).join(' | '), [id, NOMS_FR[id]!]);
      vi.advanceTimersByTime(100);
      v.toucher?.(0, 0, {} as PointerEvent);
      const r = zone.querySelector('#barre-chrono .essai-retro')!.textContent!;
      if (q === 1) expect(r).toMatch(/^Faux : Brésil, à 120/);
      else expect(r).toMatch(new RegExp(`^Juste · \\+[\\d\\u202f]+ · ${NOMS_FR[id]}$`));
      vi.advanceTimersByTime(2_000);
    }
    // Les options de noter() : celles du sujet (aucun jumeau en Amérique du Sud).
    expect(optionsNoter.every((o) => (o as { acceptes: unknown }).acceptes === true)).toBe(true);
  });

  /** Une partie entière (chaque toucher juste, 0,1 s) : les cibles dans l'ordre des questions, et l'image montrée de chacune. */
  function partieEntiere(mode: 'chrono' | 'sansfaute' | 'minute', serie: string, vrai?: NoterVrai) {
    const ctx = contexte(() => Date.parse('2026-11-16T00:00:00Z'), NOMS_FR, vrai);
    ctx.lancer(mode, serie, 'drapeaux');
    const ordre: string[] = [];
    const images = new Map<string, string>();
    const retros = new Map<string, string>();
    for (let q = 0; q < 200; q++) {
      const id = ctx.consigne();
      if (!id || ctx.zone.querySelector('#barre-chrono')!.hidden) break;
      ordre.push(id);
      images.set(id, ctx.zone.querySelector('#barre-chrono .essai-consigne strong img')!.getAttribute('src')!);
      vi.advanceTimersByTime(100);
      const avant = optionsNoter.length;
      ctx.v.toucher?.(0, 0, {} as PointerEvent);
      if (optionsNoter.length === avant) break;
      retros.set(id, ctx.zone.querySelector('#barre-chrono .essai-retro')!.textContent!);
      // La pause d'une réponse juste (0,9 s), sans entamer la question suivante (la minute de Minute).
      vi.advanceTimersByTime(1_000);
    }
    return { ...ctx, ordre, images, retros };
  }

  it('bilan d’une épreuve des drapeaux : « Chrono · Drapeaux · Océanie » (nomEpreuve), son record sous chrono:drapeaux:Oceania, son classement ; le drapeau montré est d[0], le même pour tous', () => {
    const { zone, ordre, images } = partieEntiere('chrono', 'Oceania');
    expect(ordre).toHaveLength(14);
    expect(zone.querySelector('#chrono-bilan h2')!.textContent).toBe('Chrono · Drapeaux · Océanie');
    const e = idEpreuve('Oceania', 'chrono', 'drapeaux');
    expect(e).toBe('chrono:drapeaux:Oceania');
    expect(lireRecords(localStorage).get(e)).toMatchObject({ questions: 14, justes: 14, points: 14_000 });
    expect(lireRecords(localStorage).has(idEpreuve('Oceania'))).toBe(false);
    expect(lireRecords(localStorage).has(idEpreuve('Oceania', 'chrono', 'capitales'))).toBe(false);
    expect(blocClassement.mock.calls.at(-1)![0]).toBe(e);
    for (const id of ordre) expect(images.get(id)).toBe(drapeauxCharges()!.parPays.get(id)!.justes[0]);
  });

  it('D41 : deux drapeaux justes (Afghanistan, Bolivie), en épreuve le premier (d[0]) d’une partie à l’autre, quel que soit le tirage', () => {
    for (const x of [0.01, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(x);
      try {
        const { images } = partieEntiere('chrono', 'tous');
        expect(images.size).toBe(195);
        for (const id of ['AFG', 'BOL']) {
          const d = drapeauxCharges()!.parPays.get(id)!;
          expect(d.justes.length).toBeGreaterThan(1);
          expect(images.get(id)).toBe(d.justes[0]);
        }
      } finally {
        vi.restoreAllMocks();
      }
    }
  });

  it('préchargement (étude J2 § 2.2) : au départ, le drapeau de chaque question de la partie, dans l’ordre où elles viendront ; rien pour les pays', async () => {
    const srcs: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        set src(a: string) {
          srcs.push(a);
        }
      },
    );
    // Le manifeste relu : les demandes déjà faites par les tests d'avant sont oubliées avec lui.
    oublierDrapeaux();
    await chargerDrapeaux(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
    for (const mode of ['chrono', 'sansfaute', 'minute'] as const) {
      srcs.length = 0;
      // Une série par mode : une même adresse ne se demande qu'une fois par page.
      const serie = { chrono: 'Oceania', sansfaute: 'South America', minute: 'Europe' }[mode];
      const { v, consigne, lancer } = contexte(undefined, NOMS_FR);
      lancer(mode, serie, 'drapeaux');
      const premiere = consigne()!;
      const n = catalogue(pays).find((x) => x.id === serie)!.n;
      expect(srcs, mode).toHaveLength(n);
      expect(srcs[0], mode).toBe(drapeauxCharges()!.parPays.get(premiere)!.montre);
      expect(new Set(srcs).size).toBe(n);
      v.desactiver();
    }
    // Le Chrono des pays n'a pas d'image à précharger.
    srcs.length = 0;
    contexte().lancer('chrono', 'Africa', 'pays');
    expect(srcs).toEqual([]);
  });

  describe('un drapeau pas encore là quand sa question part : le gris 4:3 tient sa place, et le temps attend son décodage', () => {
    /** Les décodages en cours, dans l'ordre des images créées. */
    let decodages: { ok: () => void; ko: (e: unknown) => void }[] = [];
    beforeEach(() => {
      decodages = [];
      // Chaque <img> neuve n'est pas encore chargée : son décodage attend le test.
      const creerEl = document.createElement;
      document.createElement = ((t: string) => {
        const e = creerEl(t) as unknown as El;
        if (t === 'img') Object.assign(e, { complete: false, decode: () => new Promise<void>((ok, ko) => decodages.push({ ok, ko })) });
        return e;
      }) as typeof document.createElement;
    });

    it('aucun toucher ne compte et le délai ne court pas avant le décodage ; décodée, la question a ses 15 s entières', async () => {
      const { v, zone, consigne, lancer } = contexte(undefined, NOMS_FR);
      lancer('chrono', AMS, 'drapeaux');
      const barre = () => zone.querySelector('#barre-chrono')!;
      const retro = () => zone.querySelector('#barre-chrono .essai-retro')!.textContent;
      expect(barre().hidden).toBe(false);
      expect(zone.querySelector('#barre-chrono .essai-consigne strong img')).not.toBeNull();
      expect(zone.querySelector('.chrono-secondes')!.textContent).toBe('15\u00a0s');
      vi.advanceTimersByTime(2_000);
      v.toucher?.(0, 0, {} as PointerEvent);
      expect(optionsNoter).toHaveLength(0);
      expect(retro()).toBe('');
      expect(decodages).toHaveLength(1);
      decodages[0]!.ok();
      await vi.advanceTimersByTimeAsync(0);
      // 15 s entières à partir du décodage : rien d'écoulé à 14,9 s, écoulé à 15 s.
      vi.advanceTimersByTime(14_900);
      expect(retro()).toBe('');
      vi.advanceTimersByTime(200);
      expect(retro()).toMatch(/^Temps écoulé/);
      const premiere = consigne();
      // La question suivante : la même attente ; un toucher après le décodage compte, son temps depuis l'ouverture.
      vi.advanceTimersByTime(2_000);
      expect(consigne()).not.toBe(premiere);
      expect(decodages).toHaveLength(2);
      vi.advanceTimersByTime(1_000);
      decodages[1]!.ok();
      await vi.advanceTimersByTimeAsync(0);
      vi.advanceTimersByTime(300);
      v.toucher?.(0, 0, {} as PointerEvent);
      expect(optionsNoter).toHaveLength(1);
      expect(retro()).toMatch(/^Juste/);
      v.desactiver();
    });

    it('un échec du décodage ne bloque pas : la question part ; au-delà de ATTENTE_IMAGE_MS sans réponse, elle part aussi, une fois', async () => {
      const { ATTENTE_IMAGE_MS } = await import('../src/vues/chrono');
      const { v, zone, lancer } = contexte(undefined, NOMS_FR);
      lancer('chrono', AMS, 'drapeaux');
      const retro = () => zone.querySelector('#barre-chrono .essai-retro')!.textContent;
      decodages[0]!.ko(new Error('EncodingError'));
      await vi.advanceTimersByTimeAsync(0);
      vi.advanceTimersByTime(15_100);
      expect(retro()).toMatch(/^Temps écoulé/);
      // La deuxième question : son image ne vient jamais ; le temps part à ATTENTE_IMAGE_MS.
      // Après le temps écoulé (100 ms déjà passées) : 1,8 s de rétroaction, puis l'attente.
      vi.advanceTimersByTime(1_700 + ATTENTE_IMAGE_MS - 100);
      expect(retro()).toBe('');
      v.toucher?.(0, 0, {} as PointerEvent);
      expect(optionsNoter).toHaveLength(0);
      vi.advanceTimersByTime(100);
      v.toucher?.(0, 0, {} as PointerEvent);
      expect(optionsNoter).toHaveLength(1);
      // Un décodage arrivé après coup ne rouvre rien (la réponse est donnée, sa rétroaction reste).
      decodages[1]!.ok();
      await vi.advanceTimersByTimeAsync(0);
      expect(retro()).toMatch(/^Juste/);
      expect(optionsNoter).toHaveLength(1);
      v.desactiver();
    });

    it('Minute : la minute ne court pas pendant l’attente ; abandonner pendant l’attente ne lance rien', async () => {
      const { v, zone, versJouer, lancer } = contexte(undefined, NOMS_FR);
      lancer('minute', AMS, 'drapeaux');
      vi.advanceTimersByTime(2_500);
      decodages[0]!.ok();
      await vi.advanceTimersByTimeAsync(0);
      expect(zone.querySelector('.chrono-secondes')!.textContent).toBe('60\u00a0s');
      zone.querySelector('#chrono-abandonner')!.click();
      expect(versJouer).toHaveBeenCalledWith(`jouer/classe/drapeaux/${AMS}`, textes.chrono.abandon);
      // Partie neuve, abandonnée pendant l'attente : son décodage tardif n'ouvre rien.
      lancer('minute', AMS, 'drapeaux');
      zone.querySelector('#chrono-abandonner')!.click();
      decodages.at(-1)!.ok();
      await vi.advanceTimersByTimeAsync(0);
      v.toucher?.(0, 0, {} as PointerEvent);
      expect(optionsNoter).toHaveLength(0);
      expect(zone.querySelector('#barre-chrono')!.hidden).toBe(true);
    });

    it('une partie relancée avant le décodage du drapeau de l’abandonnée : ce décodage tardif n’ouvre pas sa question (la nouvelle attend le sien)', async () => {
      const { v, zone, lancer } = contexte(undefined, NOMS_FR);
      lancer('chrono', AMS, 'drapeaux');
      zone.querySelector('#chrono-abandonner')!.click();
      lancer('chrono', AMS, 'drapeaux');
      expect(decodages).toHaveLength(2);
      decodages[0]!.ok();
      await vi.advanceTimersByTimeAsync(0);
      v.toucher?.(0, 0, {} as PointerEvent);
      expect(optionsNoter).toHaveLength(0);
      vi.advanceTimersByTime(1_000);
      expect(zone.querySelector('.chrono-secondes')!.textContent).toBe('15 s');
      // Son propre décodage, lui, l'ouvre.
      decodages[1]!.ok();
      await vi.advanceTimersByTimeAsync(0);
      v.toucher?.(0, 0, {} as PointerEvent);
      expect(optionsNoter).toHaveLength(1);
      v.desactiver();
    });
  });

  // D41 d, § 2.2 : le vrai noter() sur la carte du monde, la question des jumeaux touchée sur l'autre.
  describe('jumeaux en épreuve (D41 d) : Monaco touché pour l’Indonésie juste au Chrono des drapeaux, faux au Chrono des pays ; Roumanie et Tchad de même', () => {
    const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
    const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
    const JUMEAU: Record<string, string> = { IDN: 'MCO', MCO: 'IDN', ROU: 'TCD', TCD: 'ROU' };
    /** Chaque question touchée au point de son pays, sauf les jumeaux : sur l'autre. */
    const vrai: NoterVrai = { donnees, zone: (c) => JUMEAU[c] ?? c };

    it('Chrono (Asie) : l’Indonésie demandée, Monaco touché : juste, « même drapeau : Monaco », 1 000 points ; au Chrono des pays : faux', () => {
      const d = partieEntiere('chrono', 'Asia', vrai);
      expect(d.ordre).toHaveLength(48);
      expect(d.retros.get('IDN')).toMatch(/^Juste \(même drapeau : Monaco\) · \+1[\u202f ]?000 · Indonésie$/);
      expect(lireRecords(localStorage).get(idEpreuve('Asia', 'chrono', 'drapeaux'))).toMatchObject({ justes: 48, points: 48_000 });
      // Sous Pays, la même partie : le toucher sur Monaco est faux, l'admis du sujet n'y est pas.
      const ctx = contexte(() => Date.parse('2026-11-16T00:00:00Z'), NOMS_FR, vrai);
      ctx.lancer('chrono', 'Asia', 'pays');
      for (let q = 0; q < 48; q++) {
        const id = ctx.consigne()!;
        vi.advanceTimersByTime(100);
        ctx.v.toucher?.(0, 0, {} as PointerEvent);
        if (id === 'IDN') expect(ctx.zone.querySelector('#barre-chrono .essai-retro')!.textContent).toMatch(/^Faux : Monaco, à /);
        vi.advanceTimersByTime(2_000);
      }
      expect(lireRecords(localStorage).get(idEpreuve('Asia'))?.justes).toBe(47);
    });

    it('Sans faute (Europe) : Monaco demandé, l’Indonésie touchée, la partie continue jusqu’à la série vidée ; sous Pays, elle s’arrête là', () => {
      const d = partieEntiere('sansfaute', 'Europe', vrai);
      expect(d.retros.get('MCO')).toMatch(/^Juste \(même drapeau : Indonésie\) · Monaco$/);
      expect(d.retros.get('ROU')).toMatch(/^Juste \(même drapeau : Tchad\) · Roumanie$/);
      expect(lireRecords(localStorage).get(idEpreuve('Europe', 'sansfaute', 'drapeaux'))).toMatchObject({ justes: 44, questions: 44 });
      const ctx = contexte(() => Date.parse('2026-11-16T00:00:00Z'), NOMS_FR, vrai);
      ctx.lancer('sansfaute', 'Europe', 'pays');
      const vus: string[] = [];
      for (let q = 0; q < 44 && !ctx.zone.querySelector('#barre-chrono')!.hidden; q++) {
        vus.push(ctx.consigne()!);
        vi.advanceTimersByTime(100);
        ctx.v.toucher?.(0, 0, {} as PointerEvent);
        vi.advanceTimersByTime(2_000);
      }
      // La première erreur finit la partie : Monaco ou la Roumanie, celui qui vient d'abord.
      expect(['MCO', 'ROU']).toContain(vus.at(-1));
      expect(lireRecords(localStorage).get(idEpreuve('Europe', 'sansfaute'))?.justes).toBe(vus.length - 1);
    });

    it('Minute (Afrique) : le Tchad demandé, la Roumanie touchée : juste', () => {
      const d = partieEntiere('minute', 'Africa', vrai);
      expect(d.retros.get('TCD')).toMatch(/^Juste \(même drapeau : Roumanie\) · Tchad$/);
      expect(lireRecords(localStorage).get(idEpreuve('Africa', 'minute', 'drapeaux'))).toMatchObject({ justes: 54, questions: 54 });
    });
  });
});
