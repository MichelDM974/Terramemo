// Vue du quiz général (src/vues/quiz.ts, lot 4b ; étude J2 § 9.3, décisions
// « Quiz général » et « Images d'une épreuve ») sur le DOM factice : une
// partie de 20 questions à 4 choix ou au toucher, son bilan (« 17/20 ·
// 85 % », détail par sujet, record de la difficulté), « Rejouer » et « Autre
// difficulté » ; la fin selon D55 a (un abandon après la première question
// montrée écrit un record ; pendant le chargement des images, rien) ; les
// drapeaux attendus au départ. Les questions sont fixées (option `tirer`),
// la carte, les mesures et le bloc du classement remplacés ; allumerZone
// aussi (la carte factice n'a pas de projection). Minuteries et
// performance.now() factices : le temps de réponse est celui qu'on avance.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idQuiz, lireRecords, recordDe } from '../src/epreuve/chrono';
import { chargerCapitales, oublierCapitales } from '../src/map/capitales';
import { chargerDrapeaux, oublierDrapeaux, type ChargerImage } from '../src/map/drapeaux';
import type { Pays } from '../src/map/types';
import { REGLES } from '../src/quiz/regles';
import type { Difficulte, Question, SujetQuiz } from '../src/quiz/types';
import { El, installerDom, installerStockage } from './dom-factice';

const blocClassement = vi.fn((_epreuve: string, _titre: string, _apres?: (pseudo: string) => Promise<unknown>) => new El('section'));
vi.mock('../src/vues/classement', () => ({
  blocClassement: (...a: Parameters<typeof blocClassement>) => blocClassement(...a),
  publierPartie: vi.fn(),
}));
const allumerZone = vi.fn(() => false);
vi.mock('../src/vues/nommer', () => ({ allumerZone: (...a: unknown[]) => allumerZone(...(a as [])) }));

const { vueQuiz } = await import('../src/vues/quiz');
const { fmtTemps } = await import('../src/vues/scores');
const { remplir, textes } = await import('../src/vues/textes');
const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const NOMS = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
const Q = textes.quiz;
const lireFs = async (chemin: string) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')) as unknown;

/** 20 pays jouables d'Europe et d'Afrique, chacun une fois (tirage : jamais deux fois la même entité). */
const LIEUX = pays.filter((p) => p.statut === 'jouable' && (p.continent === 'Europe' || p.continent === 'Africa')).map((p) => p.id);

/** Une question : à 4 choix (la cible et 3 autres lieux) ou au toucher, du délai de sa difficulté. */
function question(sujet: SujetQuiz, cible: string, forme: 'qcm' | 'toucher', d: Difficulte, o: Partial<Question> = {}): Question {
  const r = REGLES[d];
  const autres = LIEUX.filter((x) => x !== cible).slice(0, 3);
  return {
    sujet,
    forme,
    cible,
    entites: [cible],
    delai_ms: forme === 'qcm' ? r.delai_qcm_ms : r.delai_toucher_ms,
    ...(forme === 'qcm' ? { choix: [autres[0]!, cible, autres[1]!, autres[2]!] } : {}),
    ...o,
  };
}

/** Une partie de cette difficulté sur des pays : ses QCM d'abord, puis ses touchers (la forme de REGLES). */
function partiePays(d: Difficulte): Question[] {
  const n = REGLES[d].qcm;
  return LIEUX.slice(0, 20).map((id, i) => question('pays', id, i < n ? 'qcm' : 'toucher', d));
}

/** Les touchers à rendre faux (leur numéro, à partir de 1). */
let faux = new Set<number>();
let touchers = 0;

function contexte(tirer: (d: Difficulte) => Question[], chargerImage?: ChargerImage) {
  const zone = new El('main');
  const carte = {
    effacerMarques: vi.fn(),
    marquer: vi.fn(),
    anneau() {},
    anneauEn() {},
    zoomer() {},
    vueEntiere: vi.fn(),
    noter: vi.fn((id: string) => (faux.has(++touchers) ? { pick: { id: 'BRA' }, juste: false, distance_km: 120 } : { pick: { id }, juste: true, distance_km: 0 })),
    projection: { scale: () => 1 },
    transfo: { k: 1 },
  };
  const donnees = { noms: NOMS, entites: pays.map((p) => ({ pays: p })) };
  const monde = { nom: 'monde', carte, donnees, jouables: LIEUX, credit: null };
  const terrains = { monde, actif: 'monde', montrer: vi.fn(), deja: () => null, charger: vi.fn() };
  const mesures = { toucher: (_ev: unknown, _x: number, _y: number, f: () => unknown) => f() };
  const ctx = { carte, donnees, terrains, mesures, zone };
  const versJouer = vi.fn<(cible: string, message?: string) => void>();
  const versCarte = vi.fn<() => void>();
  const tire = vi.fn(tirer);
  const v = vueQuiz(ctx as never, { versJouer, versCarte, tirer: tire, maintenant: () => Date.parse('2026-11-16T08:00:00Z'), ...(chargerImage ? { chargerImage } : {}) });
  const el = (sel: string) => zone.querySelector(sel)!;
  const consigne = () => zone.querySelector('#barre-quiz .essai-consigne');
  /** Le bouton de ce choix dans la grille. */
  const bouton = (id: string) => zone.querySelectorAll('#barre-quiz .nommer-choix').find((b) => b.dataset.id === id)!;
  /** Répond à la question posée, juste ou fausse, après `ms`. */
  const repondre = (juste = true, ms = 1_000) => {
    vi.advanceTimersByTime(ms);
    const id = consigne()!.dataset.cible!;
    if (consigne()!.dataset.forme === 'qcm') bouton(juste ? id : zone.querySelectorAll('#barre-quiz .nommer-choix').find((b) => b.dataset.id !== id)!.dataset.id!).click();
    else {
      if (!juste) faux.add(touchers + 1);
      v.toucher?.(0, 0, {} as PointerEvent);
    }
  };
  /** La pause de la rétroaction (1,8 s au plus). */
  const suivante = () => vi.advanceTimersByTime(1_800);
  /** La question est-elle montrée (énoncé, temps) ? */
  const montree = () => !el('#barre-quiz').hidden && !el('#barre-quiz .essai-ligne').hidden && consigne()?.dataset.cible !== undefined;
  const lancer = (d: Difficulte = 'moyen') => {
    v.activer();
    v.lancer(d);
  };
  return { v, zone, carte, el, consigne, bouton, repondre, suivante, montree, versJouer, versCarte, lancer, tire };
}

beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
  blocClassement.mockClear();
  allumerZone.mockClear();
  faux = new Set();
  touchers = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('une partie du quiz', () => {
  it('20 questions : le compte, la jauge à son délai (10 s à 4 choix, 15 s au toucher en moyen), la grille cachée pour un toucher, la vue du monde remise', () => {
    const p = contexte(partiePays);
    p.lancer('moyen');
    expect(p.montree()).toBe(true);
    expect(p.el('#barre-quiz .essai-compte').textContent).toBe(`1 / 20 · ${remplir(textes.epreuves.juste_1, { n: 0 })}`);
    expect(p.el('.chrono-secondes').textContent).toBe('10 s');
    expect(p.el('#barre-quiz .nommer-grille').hidden).toBe(false);
    expect(p.consigne()!.textContent).toBe(textes.sujets.pays.consigne_nommer);
    // QCM : la zone allumée ; un toucher de la carte n'y répond pas.
    expect(allumerZone).toHaveBeenCalledTimes(1);
    p.v.toucher?.(0, 0, {} as PointerEvent);
    expect(p.carte.noter).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) {
      p.repondre();
      p.suivante();
    }
    // Le premier toucher : la grille cachée, l'énoncé nomme le lieu, la vue du monde remise, 15 s.
    expect(p.el('#barre-quiz .nommer-grille').hidden).toBe(true);
    expect(p.consigne()!.dataset.forme).toBe('toucher');
    expect(p.consigne()!.textContent).toContain(NOMS[LIEUX[10]!]!);
    expect(p.carte.vueEntiere).toHaveBeenCalled();
    expect(p.el('.chrono-secondes').textContent).toBe('15 s');
    expect(p.el('#barre-quiz .essai-compte').textContent).toBe(`11 / 20 · ${remplir(textes.epreuves.justes, { n: 10 })}`);
  });

  it('jouée jusqu’au bout, 17 justes : bilan « 17/20 · 85 % », le temps, le détail par sujet, le premier record de la difficulté, les ratés', () => {
    const p = contexte(partiePays);
    p.lancer('moyen');
    const fausses = new Set([2, 11, 19]);
    for (let i = 0; i < 20; i++) {
      p.repondre(!fausses.has(i));
      p.suivante();
    }
    const bilan = p.el('#quiz-bilan');
    expect(bilan.hidden).toBe(false);
    expect(p.el('#barre-quiz').hidden).toBe(true);
    expect(bilan.querySelector('h2')!.textContent).toBe('Quiz général · Moyen');
    expect(bilan.querySelector('.chrono-score')!.textContent).toBe('17/20 · 85 %');
    expect(bilan.querySelector('.quiz-sujets')!.textContent).toBe('Pays 17/20');
    expect(bilan.querySelector('.quiz-abandon')).toBeNull();
    expect(bilan.querySelector('.chrono-record')!.textContent).toBe(Q.premier_record);
    expect(bilan.querySelectorAll('.essai-rates li')).toHaveLength(3);
    // Le record de toujours et de la semaine, sous l'id de la difficulté ; le classement de la difficulté.
    const r = lireRecords(localStorage);
    const rec = recordDe(r, idQuiz('moyen'), 'toujours')!;
    expect(rec).toMatchObject({ justes: 17, points: 17, questions: 20 });
    // Le temps de chaque réponse, la pause de la rétroaction exclue : au moins 1 s chacune.
    expect(rec.temps_ms).toBeGreaterThanOrEqual(20_000);
    expect(bilan.querySelectorAll('p.hint')[0]!.textContent).toBe(remplir(textes.chrono.bilan_detail, { temps: fmtTemps(rec.temps_ms) }));
    expect(blocClassement.mock.calls.at(-1)![0]).toBe('quiz:general:moyen');
  });

  it('« Rejouer » : un nouveau tirage de la même difficulté ; « Autre difficulté » : les difficultés dans Jouer ; « × » : la carte', () => {
    const p = contexte(partiePays);
    p.lancer('expert');
    for (let i = 0; i < 20; i++) {
      p.repondre(true, 500);
      p.suivante();
    }
    expect(p.tire).toHaveBeenCalledTimes(1);
    p.el('#quiz-rejouer').click();
    expect(p.tire).toHaveBeenCalledTimes(2);
    expect(p.tire).toHaveBeenLastCalledWith('expert');
    expect(p.montree()).toBe(true);
    expect(p.el('#quiz-bilan').hidden).toBe(true);
    // 6 s au QCM en expert.
    expect(p.el('.chrono-secondes').textContent).toBe('6 s');
    for (let i = 0; i < 20; i++) {
      p.repondre(true, 500);
      p.suivante();
    }
    // Le même score, pas plus rapide : « Record à battre : 20/20 · 100 % en 10 s ».
    expect(p.el('#quiz-bilan .chrono-record').textContent).toContain('20/20');
    p.el('#quiz-autre').click();
    expect(p.versJouer).toHaveBeenCalledWith('jouer/quiz');
    expect(p.el('#quiz-bilan').hidden).toBe(true);
    p.lancer('expert');
    for (let i = 0; i < 20; i++) {
      p.repondre(true, 500);
      p.suivante();
    }
    p.el('#quiz-bilan .croix').click();
    expect(p.versCarte).toHaveBeenCalled();
  });

  it('le délai écoulé : la question est fausse, la bonne réponse en vert, tout son délai compté', () => {
    const p = contexte(partiePays);
    p.lancer('facile');
    vi.advanceTimersByTime(10_000);
    const id = p.consigne()!.dataset.cible!;
    expect(p.bouton(id).classList.contains('juste')).toBe(true);
    expect(p.el('#barre-quiz .essai-retro').textContent).toBe(remplir(Q.expire_qcm, { cible: NOMS[id]! }));
    p.suivante();
    expect(p.el('#barre-quiz .essai-compte').textContent.startsWith('2 / 20')).toBe(true);
  });
});

describe('fin d’une partie (D55 a)', () => {
  it('un abandon après la première question écrit un record : le score acquis, les questions sans réponse à 0 et tout leur délai', () => {
    const p = contexte(partiePays);
    p.lancer('moyen');
    p.repondre(true, 3_000);
    p.suivante();
    p.el('#quiz-abandonner').click();
    const bilan = p.el('#quiz-bilan');
    expect(bilan.hidden).toBe(false);
    expect(bilan.querySelector('.chrono-score')!.textContent).toBe('1/20 · 5 %');
    expect(bilan.querySelector('.quiz-abandon')!.textContent).toBe(remplir(Q.abandonne, { n: 2 }));
    expect(recordDe(lireRecords(localStorage), idQuiz('moyen'), 'toujours')).toMatchObject({ justes: 1, questions: 20, temps_ms: 3_000 + 9 * 10_000 + 10 * 15_000 });
    expect(p.versJouer).not.toHaveBeenCalled();
    // La question sans réponse est dans les ratés.
    expect(bilan.querySelectorAll('.essai-rates li')[0]!.textContent).toBe(remplir(Q.bilan_sans_reponse, { cible: NOMS[LIEUX[1]!]! }));
  });

  it('dès la première question montrée, sans réponse : quitter la vue la fait compter (0/20), le bilan au retour', () => {
    const p = contexte(partiePays);
    p.lancer('facile');
    p.v.desactiver();
    expect(recordDe(lireRecords(localStorage), idQuiz('facile'), 'toujours')).toMatchObject({ justes: 0, questions: 20, temps_ms: 200_000 });
    expect(p.v.aMontrer?.()).toBe(true);
    expect(p.v.redirection?.()).toBeNull();
    p.v.activer();
    expect(p.el('#quiz-bilan').hidden).toBe(false);
    expect(p.el('#barre-quiz').hidden).toBe(true);
  });
});

describe('les drapeaux attendus au départ (décision « Images d’une épreuve »)', () => {
  let faites: { a: string; ok: () => void; ko: () => void }[] = [];
  const charger: ChargerImage = (a) =>
    new Promise<void>((ok, ko) => {
      faites.push({ a, ok, ko: () => ko(new Error('hors ligne')) });
    });
  beforeEach(async () => {
    faites = [];
    oublierDrapeaux();
    await chargerDrapeaux(lireFs);
  });
  /** Deux questions de drapeaux (un QCM à 4 images, un toucher à son image), le reste des pays. */
  const avecDrapeaux = (d: Difficulte) => partiePays(d).map((q, i) => (i === 0 || i === 19 ? { ...q, sujet: 'drapeaux' as const } : q));

  it('la première question n’apparaît qu’au dernier drapeau chargé (4 choix + 1 énoncé), « Chargement des drapeaux… n / N » au-delà de 150 ms', async () => {
    const p = contexte(avecDrapeaux, charger);
    p.lancer('moyen');
    expect(faites).toHaveLength(5);
    expect(p.el('#barre-quiz').hidden).toBe(true);
    vi.advanceTimersByTime(150);
    expect(p.el('#quiz-chargement').hidden).toBe(false);
    vi.advanceTimersByTime(100);
    expect(p.el('#quiz-chargement').textContent).toBe(remplir(textes.chrono.chargement_images, { n: 0, total: 5 }));
    for (const f of faites.slice(0, 4)) f.ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.montree()).toBe(false);
    // Rien ne compte tant qu'on attend : ni record, ni toucher.
    expect(lireRecords(localStorage).size).toBe(0);
    faites[4]!.ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.montree()).toBe(true);
    expect(p.el('#quiz-chargement').hidden).toBe(true);
    // Le QCM des drapeaux : des boutons-images nommés « Choix 1 » à « Choix 4 ».
    expect(p.zone.querySelectorAll('#barre-quiz .nommer-choix-image')).toHaveLength(4);
    expect(p.zone.querySelectorAll('#barre-quiz .nommer-choix')[0]!.getAttribute('aria-label')).toBe(remplir(textes.drapeaux.choix, { n: 1 }));
  });

  it('un drapeau en échec : « Réessayer », qui ne redemande que lui ; puis la partie part', async () => {
    const p = contexte(avecDrapeaux, charger);
    p.lancer('moyen');
    for (const f of faites.slice(0, 4)) f.ok();
    faites[4]!.ko();
    await vi.advanceTimersByTimeAsync(300);
    expect(p.el('#quiz-reessayer').hidden).toBe(false);
    expect(p.el('#quiz-chargement').classList.contains('echec')).toBe(true);
    const avant = faites.length;
    p.el('#quiz-reessayer').click();
    // Les déjà chargées ne repartent pas (drapeaux.ts, attendreImages).
    expect(faites.length - avant).toBeLessThanOrEqual(1);
    for (const f of faites.slice(avant)) f.ok();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.montree()).toBe(true);
  });

  it('un abandon pendant le chargement ne compte pas : retour aux difficultés, le message, aucun record', async () => {
    const p = contexte(avecDrapeaux, charger);
    p.lancer('difficile');
    vi.advanceTimersByTime(300);
    p.el('#quiz-abandonner').click();
    expect(p.versJouer).toHaveBeenCalledWith('jouer/quiz', Q.abandon_chargement);
    expect(lireRecords(localStorage).size).toBe(0);
    expect(p.el('#quiz-bilan').hidden).toBe(true);
    // Quitter la vue pendant le chargement : de même (le message à Jouer, par la redirection).
    p.lancer('difficile');
    p.v.desactiver();
    expect(lireRecords(localStorage).size).toBe(0);
    expect(p.v.aMontrer?.()).toBe(false);
    expect(p.v.redirection?.()).toEqual({ cible: 'jouer/quiz', message: Q.abandon_chargement });
  });
});

describe('les capitales (D49 d, § 9.2)', () => {
  beforeEach(async () => {
    oublierCapitales();
    await chargerCapitales(lireFs);
  });

  it('au facile, l’énoncé du QCM nomme le pays (« Quelle est la capitale du Japon ? ») ; au toucher, la capitale du tirage est celle qu’on montre', async () => {
    const { capitalesChargees } = await import('../src/map/capitales');
    const bol = capitalesChargees()!.parPays.get('BOL')!;
    const autre = bol.justes.find((c) => c.q !== bol.epreuve.q)!;
    const qs = partiePays('difficile').map((q, i) =>
      i === 0 ? question('capitales', 'JPN', 'qcm', 'difficile', { nomme: true, indice: capitalesChargees()!.parPays.get('JPN')!.principale.q }) : i === 8 ? question('capitales', 'BOL', 'toucher', 'difficile', { indice: autre.q }) : q,
    );
    const p = contexte(() => qs);
    p.lancer('difficile');
    expect(p.consigne()!.textContent).toBe('Quelle est la capitale du Japon ?');
    expect(p.bouton('JPN').textContent).toBe('Tokyo');
    for (let i = 0; i < 8; i++) {
      p.repondre();
      p.suivante();
    }
    expect(p.consigne()!.dataset.cible).toBe('BOL');
    expect(p.consigne()!.textContent).toContain(autre.nom);
  });
});
