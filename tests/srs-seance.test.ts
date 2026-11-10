// Séquenceur d'une séance (src/srs/seance.ts) : ordre de la file, cadrages
// demandés, QCM et ses ratés, « Je connais déjà », reprises sans note, carte
// retournée, une note par fiche et par jour, événements valides.
import { describe, expect, it } from 'vitest';
import { probleme, type Evenement } from '../src/srs/journal';
import { AGAIN, EASY, GOOD } from '../src/srs/note';
import { DUREE_MAX_MS, PASSAGES_QCM, PASSAGES_REPRISE, Seance, type ContexteSeance, type PlanSeance, type ReponseSeance } from '../src/srs/seance';

function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TS = Date.UTC(2026, 10, 9, 8);
function ctx(g = 1): ContexteSeance {
  let n = 0;
  return { seance: 'seance-1', appareil: 'app-1', horloge: () => ({ ts: TS + n * 1000, tz: 240 }), nouvelId: () => `e${++n}`, hasard: graine(g) };
}

const juste: ReponseSeance = { correct: true, via: 'trace', zoom: 1, distance_km: 0, duree_ms: 1500 };
const faux = (reponse = 'XXX', km = 300): ReponseSeance => ({ correct: false, reponse, zoom: 2, distance_km: km, duree_ms: 2500 });

const PLAN: PlanSeance = {
  domaine: 'pays',
  revisions: ['pays:FRA:localiser', 'pays:DEU:nommer', 'pays:ITA:localiser'],
  introductions: ['pays:ESP:nommer'],
  nouveaux: ['BEN', 'TGO', 'GHA'],
};

/** Répond juste à tout, en relevant les étapes. */
function parcourir(s: Seance, r: (e: NonNullable<Seance['courante']>) => ReponseSeance = () => juste) {
  const vues: NonNullable<Seance['courante']>[] = [];
  const evts: Evenement[] = [];
  for (let k = 0; s.courante && k < 100; k++) {
    vues.push({ ...s.courante });
    evts.push(s.repondre(r(s.courante)));
  }
  return { vues, evts };
}

describe('séance : la file', () => {
  it('révisions (mélangées), introductions nommer, QCM puis rappel de la grappe', () => {
    const s = new Seance(PLAN, ctx());
    const { vues, evts } = parcourir(s);
    const sortes = vues.map((v) => v.etape);
    expect([...sortes.slice(0, 3)].sort()).toEqual(['retournee', 'revision', 'revision']);
    expect(sortes.slice(3)).toEqual(['retournee', 'qcm', 'qcm', 'qcm', 'rappel', 'rappel', 'rappel']);
    expect(new Set(vues.slice(0, 3).map((v) => v.fiche))).toEqual(new Set(PLAN.revisions));
    expect(vues[3]).toMatchObject({ fiche: 'pays:ESP:nommer', etape: 'retournee', forme: 'retournee', mode: 'rappel' });
    expect(vues.slice(4, 7).map((v) => [v.etape, v.forme, v.fiche.endsWith(':nommer')])).toEqual(Array(3).fill(['qcm', 'qcm', true]));
    expect(new Set(vues.slice(4, 7).map((v) => v.id))).toEqual(new Set(PLAN.nouveaux));
    expect(vues.slice(7).map((v) => [v.etape, v.forme, v.mode])).toEqual(Array(3).fill(['rappel', 'trouver', 'rappel']));
    expect(s.finie).toBe(true);
    expect(vues.every((v) => v.domaine === 'pays')).toBe(true);
    // Une révision nommer est une carte retournée, notée en mode revision.
    const deu = vues.find((v) => v.fiche === 'pays:DEU:nommer')!;
    expect([deu.etape, deu.forme, deu.mode]).toEqual(['retournee', 'retournee', 'revision']);
    // Tous les événements sont valides ; QCM hors FSRS, le reste Good.
    for (const e of evts) expect(probleme(e), JSON.stringify(e)).toBeNull();
    expect(evts.map((e) => e.note)).toEqual(vues.map((v) => (v.etape === 'qcm' ? null : GOOD)));
    expect(evts.every((e) => e.seance === 'seance-1' && e.appareil === 'app-1' && e.tz === 240)).toBe(true);
  });

  it('D37 c : sous Capitales, un pays au nom de sa capitale (Luxembourg) n’a pas de QCM dans sa grappe, seulement son rappel', () => {
    const { vues } = parcourir(new Seance({ domaine: 'capitales', revisions: [], introductions: [], nouveaux: ['BEL', 'LUX', 'NLD'] }, ctx()));
    expect(vues.filter((v) => v.etape === 'qcm').map((v) => v.id).sort()).toEqual(['BEL', 'NLD']);
    expect(vues.filter((v) => v.etape === 'rappel').map((v) => v.id).sort()).toEqual(['BEL', 'LUX', 'NLD']);
    expect(vues.every((v) => v.domaine === 'capitales')).toBe(true);
    // Sous Pays, le Luxembourg a son QCM.
    expect(parcourir(new Seance({ domaine: 'pays', revisions: [], introductions: [], nouveaux: ['BEL', 'LUX'] }, ctx())).vues.filter((v) => v.etape === 'qcm')).toHaveLength(2);
  });

  it('même graine, même file ; une autre graine mélange autrement', () => {
    const f = (g: number) => parcourir(new Seance(PLAN, ctx(g))).vues.map((v) => `${v.etape}:${v.fiche}`);
    expect(f(7)).toEqual(f(7));
    const autres = [1, 2, 3, 4, 5].map(f).map((x) => x.join());
    expect(new Set(autres).size).toBeGreaterThan(1);
  });

  it('cadrages : le monde avant le premier Trouver et après une carte retournée ou un QCM, la grappe au premier QCM et au premier rappel, rien sinon', () => {
    const s = new Seance({ domaine: 'pays', revisions: ['pays:FRA:localiser', 'pays:ITA:localiser'], introductions: ['pays:ESP:nommer'], nouveaux: ['BEN', 'TGO'] }, ctx());
    const { vues } = parcourir(s);
    const c = vues.map((v) => [v.etape, v.cadrage?.sorte ?? null]);
    expect(c).toEqual([
      ['revision', 'monde'],
      ['revision', null],
      ['retournee', null],
      ['qcm', 'grappe'],
      ['qcm', null],
      ['rappel', 'grappe'],
      ['rappel', null],
    ]);
    expect(vues[3]!.cadrage).toEqual({ sorte: 'grappe', ids: ['BEN', 'TGO'] });
    expect(vues[5]!.cadrage).toEqual({ sorte: 'grappe', ids: ['BEN', 'TGO'] });
    // Une révision Trouver après une carte retournée repart du monde.
    const t = new Seance({ domaine: 'pays', revisions: ['pays:DEU:nommer', 'pays:FRA:localiser'], introductions: [], nouveaux: [] }, ctx(3));
    const v2 = parcourir(t).vues;
    const fra = v2.find((v) => v.fiche === 'pays:FRA:localiser')!;
    expect(fra.cadrage).toEqual({ sorte: 'monde' });
  });

  it('après « Voir » : la question suivante repart du monde (révision) ou de la région de la grappe (rappel)', () => {
    const voir: ReponseSeance = { correct: false, aide: 'voir', duree_ms: 10 };
    const s = new Seance({ domaine: 'pays', revisions: ['pays:UKR:localiser', 'pays:POL:localiser', 'pays:MDA:localiser'], introductions: [], nouveaux: [] }, ctx());
    const v = parcourir(s, (e) => (e.passage === 1 ? voir : juste)).vues;
    expect(v.slice(0, 3).map((x) => x.cadrage)).toEqual([{ sorte: 'monde' }, { sorte: 'monde' }, { sorte: 'monde' }]);
    // La reprise qui suit une reprise trouvée sans aide : laissée au joueur.
    expect(v.slice(4).map((x) => x.cadrage)).toEqual([null, null]);
    const g = new Seance({ domaine: 'pays', revisions: [], introductions: [], nouveaux: ['BEN', 'TGO', 'GHA'] }, ctx());
    const r = parcourir(g, (e) => (e.etape === 'rappel' && e.passage === 1 ? voir : juste)).vues.filter((x) => x.etape === 'rappel');
    expect(r.map((x) => x.cadrage)).toEqual([0, 1, 2].map(() => ({ sorte: 'grappe', ids: ['BEN', 'TGO', 'GHA'] })));
  });

  it('séance vide : finie d’emblée', () => {
    const s = new Seance({ domaine: 'pays', revisions: [], introductions: [], nouveaux: [] }, ctx());
    expect(s.finie).toBe(true);
    expect(s.courante).toBeNull();
    expect(() => s.repondre(juste)).toThrow();
  });

  it('chaque étape porte le domaine de sa fiche : la grappe celui du plan, une révision le sien, même mêlés (étude J2 § 6.5)', () => {
    const plan: PlanSeance = { domaine: 'capitales', revisions: ['pays:FRA:localiser', 'capitales:DEU:nommer'], introductions: ['capitales:ESP:nommer'], nouveaux: ['BEN', 'TGO'] };
    const { vues, evts } = parcourir(new Seance(plan, ctx()));
    expect(new Map(vues.map((v) => [v.fiche, v.domaine]))).toEqual(
      new Map([
        ['pays:FRA:localiser', 'pays'],
        ['capitales:DEU:nommer', 'capitales'],
        ['capitales:ESP:nommer', 'capitales'],
        ['capitales:BEN:nommer', 'capitales'],
        ['capitales:TGO:nommer', 'capitales'],
        ['capitales:BEN:localiser', 'capitales'],
        ['capitales:TGO:localiser', 'capitales'],
      ]),
    );
    // Les nouveautés d'une grappe de capitales s'écrivent capitales:, jamais pays:.
    expect(evts.filter((e) => e.fiche.startsWith('pays:')).map((e) => e.fiche)).toEqual(['pays:FRA:localiser']);
    expect(evts.every((e) => probleme(e) === null)).toBe(true);
  });
});

describe('séance : QCM d’apprentissage et « Je connais déjà »', () => {
  const grappe: PlanSeance = { domaine: 'pays', revisions: [], introductions: [], nouveaux: ['BEN', 'TGO'] };

  it('un QCM raté revient en fin de QCM (avant le rappel), PASSAGES_QCM fois au plus ; note null, choix journalisé', () => {
    const s = new Seance(grappe, ctx());
    const premier = s.courante!.id;
    const { vues, evts } = parcourir(s, (e) => (e.etape === 'qcm' && e.id === premier ? faux('NGA') : juste));
    const qcm = vues.filter((v) => v.etape === 'qcm');
    expect(qcm.filter((v) => v.id === premier).map((v) => v.passage)).toEqual([1, 2, 3].slice(0, PASSAGES_QCM));
    // Tous les QCM avant le premier rappel.
    const iRappel = vues.findIndex((v) => v.etape === 'rappel');
    expect(vues.slice(0, iRappel).every((v) => v.etape === 'qcm')).toBe(true);
    const e = evts[0]!;
    expect([e.mode, e.note, e.correct, e.reponse, e.fiche]).toEqual(['qcm', null, false, 'NGA', `pays:${premier}:nommer`]);
    // Le rappel du pays reste noté normalement (le QCM est hors FSRS).
    expect(evts.filter((x) => x.fiche === `pays:${premier}:localiser`).map((x) => x.note)).toEqual([GOOD]);
  });

  it('« Je connais déjà » saute le QCM du pays ; son rappel juste vaut Easy (aide connu), faux Again', () => {
    for (const correct of [true, false]) {
      const s = new Seance(grappe, ctx());
      const id = s.courante!.id;
      const autre = id === 'BEN' ? 'TGO' : 'BEN';
      s.connu();
      const { vues, evts } = parcourir(s, (e) => (e.etape === 'rappel' && e.id === id && !correct ? faux() : juste));
      expect(vues.filter((v) => v.etape === 'qcm').map((v) => v.id)).toEqual([autre]);
      const r = evts.find((x) => x.fiche === `pays:${id}:localiser` && x.mode === 'rappel' && x.note !== null)!;
      expect([r.note, r.aide]).toEqual(correct ? [EASY, 'connu'] : [AGAIN, 'connu']);
      expect(evts.find((x) => x.fiche === `pays:${autre}:localiser`)?.note).toBe(GOOD);
    }
  });

  it('« Je connais déjà » sur un QCM reposé après un échec : sans effet, le rappel juste vaut Good', () => {
    const s = new Seance(grappe, ctx());
    const id = s.courante!.id;
    s.repondre(faux('NGA'));
    // Le QCM de l'autre pays, puis celui raté, reposé (passage 2).
    for (let k = 0; k < 5 && !(s.courante?.etape === 'qcm' && s.courante.id === id); k++) s.repondre(juste);
    expect([s.courante?.etape, s.courante?.id, s.courante?.passage]).toEqual(['qcm', id, 2]);
    s.connu();
    expect([s.courante?.etape, s.courante?.id, s.courante?.passage]).toEqual(['qcm', id, 2]);
    const { evts } = parcourir(s);
    const r = evts.find((x) => x.fiche === `pays:${id}:localiser` && x.note !== null)!;
    expect([r.note, r.aide]).toEqual([GOOD, null]);
  });

  it('« Je connais déjà » hors d’un QCM : sans effet', () => {
    const s = new Seance({ domaine: 'pays', revisions: ['pays:FRA:localiser'], introductions: [], nouveaux: [] }, ctx());
    s.connu();
    expect(s.courante?.fiche).toBe('pays:FRA:localiser');
  });
});

describe('séance : reprises et une note par fiche et par jour', () => {
  it('un raté (rappel, révision, carte retournée) revient en fin de séance sans nouvelle note, PASSAGES_REPRISE passages au plus', () => {
    const s = new Seance({ domaine: 'pays', revisions: ['pays:FRA:localiser', 'pays:DEU:nommer'], introductions: [], nouveaux: ['BEN'] }, ctx());
    const { vues, evts } = parcourir(s, (e) => (e.fiche === 'pays:FRA:localiser' ? faux('ESP', 120) : e.fiche === 'pays:DEU:nommer' && e.passage === 1 ? { correct: false, duree_ms: 900 } : juste));
    const fra = vues.map((v, i) => [v, evts[i]!] as const).filter(([v]) => v.fiche === 'pays:FRA:localiser');
    expect(fra.map(([v]) => [v.etape, v.passage])).toEqual([['revision', 1], ['reprise', 2], ['reprise', 3]].slice(0, PASSAGES_REPRISE));
    expect(fra.map(([, e]) => e.note)).toEqual([AGAIN, null, null].slice(0, PASSAGES_REPRISE));
    expect(fra.map(([, e]) => e.mode)).toEqual(Array(PASSAGES_REPRISE).fill('revision'));
    // Les reprises après toute la file prévue (la grappe comprise).
    const iRappel = vues.findIndex((v) => v.etape === 'rappel');
    const iReprise = vues.findIndex((v) => v.etape === 'reprise');
    expect(iReprise).toBeGreaterThan(iRappel);
    // La carte retournée ratée repasse une fois, juste, sans note.
    const deu = vues.map((v, i) => [v, evts[i]!] as const).filter(([v]) => v.fiche === 'pays:DEU:nommer');
    expect(deu.map(([v, e]) => [v.etape, v.forme, e.note, e.correct])).toEqual([
      ['retournee', 'retournee', AGAIN, false],
      ['reprise', 'retournee', null, true],
    ]);
    const b = s.bilan();
    expect(b.revisions).toEqual({ n: 2, premiers: 0 });
    expect(b.rates).toEqual([
      { fiche: 'pays:FRA:localiser', id: 'FRA', distance_km: 120 },
      { fiche: 'pays:DEU:nommer', id: 'DEU', distance_km: null },
    ]);
    expect(b.nouveaux).toEqual(['BEN']);
    expect(b.reponses).toBe(evts.length);
    // Une note par fiche : jamais deux notes non nulles pour la même fiche.
    const notees = evts.filter((e) => e.note !== null).map((e) => e.fiche);
    expect(new Set(notees).size).toBe(notees.length);
  });

  it('« Voir » ou « Passer » : Again (aide journalisée), reprise', () => {
    const s = new Seance({ domaine: 'pays', revisions: ['pays:FRA:localiser', 'pays:ITA:localiser'], introductions: [], nouveaux: [] }, ctx());
    const { evts } = parcourir(s, (e) =>
      e.passage > 1 ? juste : e.fiche === 'pays:FRA:localiser' ? { correct: false, aide: 'voir', duree_ms: 10 } : { correct: false, aide: 'passer', reponse: null, duree_ms: 10 },
    );
    expect(evts.map((e) => [e.fiche, e.aide, e.note])).toEqual(
      expect.arrayContaining([
        ['pays:FRA:localiser', 'voir', AGAIN],
        ['pays:ITA:localiser', 'passer', AGAIN],
      ]),
    );
    expect(evts.length).toBe(4);
  });

  it('les champs de l’événement : reponse si faux, via si juste, durée bornée, zoom et distance', () => {
    const s = new Seance({ domaine: 'pays', revisions: ['pays:FRA:localiser', 'pays:ITA:localiser'], introductions: [], nouveaux: [] }, ctx());
    const a = s.repondre({ correct: true, via: 'pastille', reponse: 'VAT', zoom: 3.5, distance_km: 0, duree_ms: 10 * DUREE_MAX_MS });
    const b = s.repondre({ correct: false, via: 'trace', reponse: 'ESP', zoom: 1, distance_km: 250.5, duree_ms: -3 });
    expect([a.reponse, a.via, a.zoom, a.duree_ms]).toEqual([null, 'pastille', 3.5, DUREE_MAX_MS]);
    expect([b.reponse, b.via, b.distance_km, b.duree_ms]).toEqual(['ESP', null, 250.5, 0]);
    expect(probleme(a)).toBeNull();
    expect(probleme(b)).toBeNull();
  });

  it('« Terminer » : finie, les réponses données comptent', () => {
    const s = new Seance(PLAN, ctx());
    s.repondre(juste);
    s.repondre(faux());
    expect(s.numero).toBe(3);
    s.terminer();
    expect(s.finie).toBe(true);
    expect(s.bilan().reponses).toBe(2);
    expect(s.bilan().revisions.n).toBe(2);
  });
});
