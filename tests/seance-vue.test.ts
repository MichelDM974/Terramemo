// La séance vue de l'appli (src/vues/seance.ts) : programme du jour depuis la
// mémoire, événements écrits au dépôt (un par réponse), état mis à jour sans
// rejeu, ligne discrète, cadrage de la grappe, bilan, comptes de Jouer, refus
// d'Apprendre, parties libres (D11).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assembler } from '../src/map/donnees';
import { assemblerTerrain } from '../src/map/donnees-terrain';
import type { Lieu, Pays } from '../src/map/types';
import { depotMemoire, type Depot } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import type { Evenement } from '../src/srs/journal';
import { etat } from '../src/srs/rejeu';
import { catalogue } from '../src/vues/cibles';
import type { DemandeSeance, PiloteSeance, RefusSeance, ReponseJouee } from '../src/vues/essai';
import { carteMemoire } from '../src/vues/carte-memoire';
import { creerSeances, texteComptes } from '../src/vues/seance';
import { remplir, textes } from '../src/vues/textes';
import { El, installerDom } from './dom-factice';
import { code, remplaces, sansBrut } from './sujet-factice';

vi.mock('../src/vues/sujets', async (orig) => (await import('./sujet-factice')).avecFactice(await orig()));

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const monde = assembler(lire('monde.topo.json'), lire('pays.json') as Pays[], lire('contestees.json'), lire('noms.fr.json'));
const lireIle = (f: string) => JSON.parse(readFileSync(`public/geo/reunion/${f}`, 'utf8'));
const ile = assemblerTerrain(lireIle('communes.topo.json'), 'communes', lireIle('communes.json') as Lieu[], lireIle('noms.fr.json'));
const CATALOGUE = catalogue(monde.entites.map((e) => e.pays));
const serie = (id: string) => CATALOGUE.find((s) => s.id === id)!;
const S = textes.seance;

const JOUR_MS = 86_400_000;
const T0 = Date.UTC(2026, 10, 9, 8); // 12 h à La Réunion

function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function monter(depot: Depot = depotMemoire(), o: { ile?: () => typeof ile | null } = {}) {
  let lectures = 0;
  const compte: Depot = { tous: () => (lectures++, depot.tous()), ajouter: (e) => depot.ajouter(e) };
  const h = { ts: T0 };
  let n = 0;
  const memoire = ouvrirMemoire({
    depot: compte,
    appareil: '00000000-0000-4000-8000-00000000a001',
    horloge: () => ({ ts: h.ts, tz: 240 }),
    nouvelId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  await memoire.pret;
  const seances = creerSeances({ memoire, monde, hasard: graine(3), ...(o.ile ? { ile: o.ile } : {}) });
  return { memoire, seances, depot, h, lectures: () => lectures };
}

const juste = (id: string, sens: 'localiser' | 'nommer'): ReponseJouee => ({ id, sens, correct: true, aide: null, reponse: null, via: 'trace', zoom: 2, distance_km: 0, duree_ms: 1200 });
const faux = (id: string, sens: 'localiser' | 'nommer'): ReponseJouee => ({ id, sens, correct: false, aide: null, reponse: 'XXX', via: null, zoom: 2, distance_km: 300, duree_ms: 2400 });

/** Les questions de la séance : forme, id et terrain (le monde si absent). */
const cle = (q: { forme: string; id: string; terrain?: string }) => `${q.terrain ?? 'monde'}:${q.forme}:${q.id}`;

/** Joue la séance : juste partout, sauf `rate` (faux au premier passage) ; « Je connais déjà » sur `connu`. */
function jouer(p: PiloteSeance, o: { rate?: string; connu?: string } = {}) {
  const lignes: string[] = [];
  const questions: { id: string; forme: string; cadrer: unknown; terrain?: string }[] = [];
  const vus = new Set<string>();
  for (let k = 0; k < 200; k++) {
    const q = p.question();
    if (!q) break;
    questions.push(q);
    if (q.forme === 'qcm' && q.id === o.connu) {
      p.connu();
      continue;
    }
    const sens = q.forme === 'trouver' ? 'localiser' : 'nommer';
    const cle = `${q.forme}:${q.id}`;
    const r = q.id === o.rate && q.forme === 'trouver' && !vus.has(cle) ? faux(q.id, sens) : juste(q.id, sens);
    vus.add(cle);
    lignes.push(p.repondre(r));
  }
  return { lignes, questions };
}

describe('séance : du programme au journal', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());

  it('Révision du jour sur un journal vide : la première grappe (QCM puis rappel cadré) ; un événement par réponse, état suivi sans rejeu', async () => {
    const m = await monter();
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 5 });
    expect(texteComptes(m.seances.comptes()!)).toBe('5 nouveaux');
    const p = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    expect('question' in p).toBe(true);
    const premiere = p.question()!;
    expect([premiere.forme, premiere.connu]).toEqual(['qcm', true]);
    expect(p.compte()).toBe('1 / 10');
    const rate = premiere.id === 'POL' ? 'UKR' : 'POL';
    const { lignes, questions } = jouer(p, { rate, connu: premiere.id });
    await m.memoire.ecrire([]); // les écritures au dépôt, dans l'ordre
    const evts = await m.depot.tous();
    // 4 QCM (un « Je connais déjà »), 5 rappels, une reprise : 10 réponses, 10 événements.
    expect(lignes.length).toBe(10);
    expect(evts.length).toBe(10);
    expect(m.memoire.ecrits).toBe(10);
    expect(m.lectures()).toBe(1);
    expect(new Map(m.memoire.etat())).toEqual(etat(evts));
    // Le premier rappel cadre la grappe (l'Europe de l'Est, sans la Sibérie) ; les autres non.
    const rappels = questions.filter((q) => q.forme === 'trouver');
    expect(Array.isArray(rappels[0]!.cadrer)).toBe(true);
    expect((rappels[0]!.cadrer as number[])[2]).toBeLessThan(60);
    expect(rappels.slice(1).every((q) => q.cadrer === null)).toBe(true);
    // Lignes : « À revoir aujourd'hui » pour le raté, « Revient dans… » pour les autres rappels, rien au QCM.
    expect(lignes).toContain(S.a_revoir_aujourdhui);
    expect(lignes.filter((l) => /^Revient/.test(l)).length).toBe(5);
    // Le connu : Easy (aide connu), un intervalle plus long.
    const easy = evts.find((e) => e.fiche === `pays:${premiere.id}:localiser` && e.note !== null)!;
    expect([easy.note, easy.aide]).toEqual([4, 'connu']);
    // Bilan : sans points, les nouveaux, le raté et sa distance ; plus rien à faire aujourd'hui.
    p.terminer();
    const el = new El('div');
    const actions = { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() };
    p.bilan(el as never, actions);
    const txt = el.innerText;
    expect(txt).toContain('Révision du jour');
    expect(txt).toContain('Nouveaux : ');
    expect(txt).toContain(`${monde.noms[rate]} : touché à 300`);
    expect(txt).toContain(S.bilan_fini);
    expect(txt.toLowerCase()).not.toContain('point');
    expect(el.querySelector('#seance-continuer')).toBeNull();
    el.querySelector('#seance-carte')!.click();
    expect(actions.carte).toHaveBeenCalledOnce();
    // « × » (#18) : comme « Carte ».
    el.querySelector('.croix')!.click();
    expect(actions.carte).toHaveBeenCalledTimes(2);
    el.querySelector('#essai-autre')!.click();
    expect(actions.autre).toHaveBeenCalled();
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
  });

  it('le lendemain : la révision due, puis les fiches nommer en carte retournée, puis la grappe suivante', async () => {
    const m = await monter();
    jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance, { rate: 'POL' });
    m.h.ts += JOUR_MS;
    // POL ratée : due ; ses quatre voisines : leur fiche nommer à introduire (POL nommer attend) ; puis la grappe suivante.
    expect(m.seances.comptes()).toEqual({ aRevoir: 5, nouveaux: 9 });
    const p = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    const formes: string[] = [];
    for (let q = p.question(); q && formes.length < 5; q = p.question()) {
      formes.push(`${q.forme}:${q.id}`);
      p.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    expect(formes[0]).toBe('trouver:POL');
    expect(formes.slice(1).every((f) => f.startsWith('retournee:'))).toBe(true);
    // Puis la grappe suivante (une par jour : celle d'hier est faite).
    expect(p.question()?.forme).toBe('qcm');
    await m.memoire.ecrire([]);
    const evts = await m.depot.tous();
    const nommer = evts.filter((e) => e.fiche.endsWith(':nommer') && e.mode === 'rappel');
    expect(nommer.length).toBe(4);
    expect(nommer.every((e) => e.note === 3)).toBe(true);
  });

  it('Apprendre : la grappe suivante de CETTE série ; grappe du jour déjà faite : refus, et les révisions proposées', async () => {
    const m = await monter();
    const afrique = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Africa') }) as PiloteSeance;
    expect(m.seances.comptes({ sorte: 'apprendre', sujet: 'pays', serie: serie('Africa') })?.nouveaux).toBeGreaterThan(4);
    const { questions } = jouer(afrique);
    const ids = new Set(questions.map((q) => q.id));
    const continent = new Map(monde.entites.map((e) => [e.pays.id, e.pays.continent]));
    expect([...ids].every((id) => continent.get(id) === 'Africa')).toBe(true);
    // Même jour, autre série : la grappe du jour est prise.
    const refus = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') }) as RefusSeance;
    expect(refus).toEqual({ refus: S.grappe_faite, reviser: 0 });
    // Révision du jour : rien à faire.
    expect(m.seances.ouvrir({ sorte: 'revision' })).toEqual({ refus: S.rien, reviser: 0 });
    // Le lendemain, Apprendre sur l'Europe : les introductions d'abord, puis la grappe d'Europe.
    m.h.ts += JOUR_MS;
    const europe = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') }) as PiloteSeance;
    const q = jouer(europe).questions;
    expect(q.filter((x) => x.forme === 'retournee').length).toBe(ids.size);
    expect(q.filter((x) => x.forme === 'qcm').every((x) => continent.get(x.id) === 'Europe')).toBe(true);
  });

  it('grappe du jour quittée en plein rappel : Apprendre sur une autre série renvoie à elle, la Révision du jour la reprend', async () => {
    const m = await monter();
    const continent = new Map(monde.entites.map((e) => [e.pays.id, e.pays.continent]));
    const eu = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') }) as PiloteSeance;
    let rappels = 0;
    for (let q = eu.question(); q && rappels < 2; q = eu.question()) {
      if (q.forme === 'trouver') rappels++;
      eu.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    eu.terminer();
    const refus = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Africa') }) as RefusSeance;
    expect(refus.refus).toBe(remplir(S.grappe_entamee, { serie: 'Europe' }));
    expect(refus.reviser).toBe(0);
    expect(refus.finir).toBeGreaterThan(0);
    expect(m.seances.comptes()?.nouveaux).toBe(refus.finir);
    const { questions } = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    const rappel = questions.filter((x) => x.forme === 'trouver');
    expect(rappel.length).toBe(refus.finir);
    expect(rappel.every((x) => continent.get(x.id) === 'Europe')).toBe(true);
    expect(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Africa') })).toEqual({ refus: S.grappe_faite, reviser: 0 });
  });

  it('parties libres (D11) : chaque réponse au journal, mode libre, hors FSRS, une séance par partie', async () => {
    const m = await monter();
    const monde_ = { nom: 'monde' } as never;
    const a = m.seances.libre(null, monde_)!;
    const b = m.seances.libre(null, monde_)!;
    a(juste('FRA', 'localiser'));
    a(faux('ESP', 'localiser'));
    b(juste('ITA', 'nommer'));
    m.seances.libre(null, { nom: 'reunion' } as never)!(juste('97411', 'localiser'));
    await m.memoire.ecrire([]);
    const evts: Evenement[] = await m.depot.tous();
    expect(evts.map((e) => [e.fiche, e.mode, e.note, e.correct])).toEqual([
      ['pays:FRA:localiser', 'libre', null, true],
      ['pays:ESP:localiser', 'libre', null, false],
      ['pays:ITA:nommer', 'libre', null, true],
      ['communes:97411:localiser', 'libre', null, true],
    ]);
    expect(evts[0]!.seance).toBe(evts[1]!.seance);
    expect(evts[2]!.seance).not.toBe(evts[0]!.seance);
    expect(evts[1]!.reponse).toBe('XXX');
    expect(m.memoire.etat().size).toBe(0);
  });

  it('comptes : null tant que la mémoire se charge ; « À jour » sans rien', async () => {
    const lent: Depot = { tous: () => new Promise(() => undefined), ajouter: async () => undefined };
    const memoire = ouvrirMemoire({ depot: lent, appareil: 'a', horloge: () => ({ ts: T0, tz: 240 }) });
    expect(creerSeances({ memoire, monde }).comptes()).toBeNull();
    expect(texteComptes({ aRevoir: 0, nouveaux: 0 })).toBe(S.a_jour);
    expect(texteComptes({ aRevoir: 12, nouveaux: 6 })).toBe('12 à revoir · 6 nouveaux');
  });
});

// Communes de La Réunion (défaut D6) : Apprendre sous La Réunion, leur propre
// budget d'une grappe par jour (décision « Apprendre et Révision du jour » :
// une de pays et une de communes le même jour), leurs révisions en second
// bloc de la Révision du jour, l'île chargée seulement quand il le faut.
describe('séance : les communes de La Réunion', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());
  const reunion = serie('reunion');
  const communes = new Set(ile.entites.map((e) => e.pays.id));

  it('Apprendre sous La Réunion : 6 communes voisines sur l’île (QCM, rappel cadré) ; les pays gardent leur grappe du jour', async () => {
    const m = await monter(undefined, { ile: () => ile });
    expect(m.seances.besoinIle!({ sorte: 'apprendre', sujet: 'communes', serie: reunion })).toBe(true);
    expect(m.seances.besoinIle!({ sorte: 'revision' })).toBe(false);
    expect(m.seances.comptes({ sorte: 'apprendre', sujet: 'communes', serie: reunion })).toEqual({ aRevoir: 0, nouveaux: 6 });
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion }) as PiloteSeance;
    expect(p.compte()).toBe('1 / 12');
    const { questions, lignes } = jouer(p);
    expect(questions.every((q) => q.terrain === 'reunion' && communes.has(q.id))).toBe(true);
    expect(questions.filter((q) => q.forme === 'qcm').length).toBe(6);
    const rappels = questions.filter((q) => q.forme === 'trouver');
    expect(rappels.length).toBe(6);
    expect(Array.isArray(rappels[0]!.cadrer)).toBe(true);
    expect(lignes.length).toBe(12);
    await m.memoire.ecrire([]);
    const evts = await m.depot.tous();
    expect(evts.length).toBe(12);
    expect(evts.every((e) => e.fiche.startsWith('communes:'))).toBe(true);
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    expect(el.innerText).toContain('Apprendre · La Réunion');
    expect(el.innerText).toContain(ile.noms[rappels[0]!.id]!);
    // Une grappe par jour et par domaine : plus d'autre grappe de l'île aujourd'hui, mais celle des pays reste à prendre.
    expect(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion })).toEqual({ refus: S.grappe_faite, reviser: 0 });
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 5 });
    const pp = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') }) as PiloteSeance;
    const { questions: qp } = jouer(pp);
    expect(qp.length).toBeGreaterThan(0);
    expect(qp.every((q) => q.terrain === 'monde')).toBe(true);
    expect(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') })).toEqual({ refus: S.grappe_faite, reviser: 0 });
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
  });

  it('pays d’abord appris : Apprendre sous La Réunion le même jour, sa grappe de communes', async () => {
    const m = await monter(undefined, { ile: () => ile });
    jouer(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') }) as PiloteSeance);
    expect(m.seances.comptes({ sorte: 'apprendre', sujet: 'communes', serie: reunion })).toEqual({ aRevoir: 0, nouveaux: 6 });
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion }) as PiloteSeance;
    const { questions } = jouer(p);
    expect(questions.every((q) => q.terrain === 'reunion' && communes.has(q.id))).toBe(true);
    expect(questions.filter((q) => q.forme === 'trouver').length).toBe(6);
    expect(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion })).toEqual({ refus: S.grappe_faite, reviser: 0 });
  });

  it('le lendemain, Révision du jour : les révisions (pays, puis communes sur l’île) avant la grappe de pays nouveaux, de retour sur le monde, une seule séance', async () => {
    let charge: typeof ile | null = ile;
    const m = await monter(undefined, { ile: () => charge });
    const { questions: q0 } = jouer(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion }) as PiloteSeance, { rate: '' });
    const raté = q0.find((q) => q.forme === 'trouver')!.id;
    // Refaite avec un raté : une autre mémoire, la première commune du rappel ratée.
    const m2 = await monter(undefined, { ile: () => charge });
    jouer(m2.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion }) as PiloteSeance, { rate: raté });
    m2.h.ts += JOUR_MS;
    // La commune ratée due, les cinq autres : leur fiche nommer à introduire ; les pays : leur première grappe (5).
    expect(m2.seances.comptes()).toEqual({ aRevoir: 6, nouveaux: 5 });
    // L'île n'est pas chargée (page rouverte) : Toucher doit la charger d'abord.
    charge = null;
    expect(m2.seances.besoinIle!({ sorte: 'revision' })).toBe(true);
    // Sans elle (hors ligne), la séance fait les pays seuls ; les communes restent dues.
    const seule = m2.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    expect(seule.compte()).toBe('1 / 10');
    seule.terminer();
    charge = ile;
    const p = m2.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    expect(p.compte()).toBe('1 / 16');
    const { questions } = jouer(p);
    const terrains = questions.map((q) => q.terrain);
    // Aucun pays à revoir : le bloc des communes d'abord (la commune ratée, due, et cinq cartes retournées), puis la grappe de pays (5 QCM, 5 rappels).
    expect(terrains.slice(0, 6).every((t) => t === 'reunion')).toBe(true);
    expect(terrains.slice(6).every((t) => t === 'monde')).toBe(true);
    expect(questions.slice(6).map((q) => q.forme)).toEqual([...Array(5).fill('qcm'), ...Array(5).fill('trouver')]);
    const ileQ = questions.slice(0, 6);
    expect(ileQ.map(cle)).toContain(`reunion:trouver:${raté}`);
    expect(ileQ.filter((q) => q.forme === 'retournee').length).toBe(5);
    await m2.memoire.ecrire([]);
    const evts = (await m2.depot.tous()).filter((e) => e.ts > T0 + JOUR_MS / 2);
    expect(evts.length).toBe(questions.length);
    expect(evts.filter((e) => e.fiche.startsWith('communes:')).length).toBe(6);
    // Une seule séance : les deux blocs sous le même id.
    expect(new Set(evts.map((e) => e.seance)).size).toBe(1);
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    expect(el.innerText).toContain(remplir(S.bilan_revisions, { premiers: 6, n: 6 }));
    expect(el.innerText).toContain('Nouveaux : ');
    expect(m2.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
  });

  it('grappe de communes quittée en plein rappel : Apprendre sur les pays ne l’attend pas, la Révision du jour la finit sur l’île sans en ouvrir une autre', async () => {
    const m = await monter(undefined, { ile: () => ile });
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion }) as PiloteSeance;
    let rappels = 0;
    for (let q = p.question(); q && rappels < 2; q = p.question()) {
      if (q.forme === 'trouver') rappels++;
      p.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    p.terminer();
    expect(m.seances.besoinIle!({ sorte: 'revision' })).toBe(true);
    // La Révision du jour : les 4 communes à finir, puis la grappe de pays nouveaux (5).
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 9 });
    const { questions: qp } = jouer(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') }) as PiloteSeance);
    expect(qp.every((q) => q.terrain === 'monde')).toBe(true);
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 4 });
    const { questions } = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(questions.every((q) => q.terrain === 'reunion')).toBe(true);
    expect(questions.filter((q) => q.forme === 'trouver').length).toBe(4);
    // La grappe finie : la Révision du jour n'en ouvre pas d'autre (Apprendre sous La Réunion le ferait, demain).
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
  });

  it('page rouverte en pleine grappe de communes, l’île pas encore chargée : incertaine, la Révision du jour la charge d’abord', async () => {
    const depot = depotMemoire();
    const m = await monter(depot, { ile: () => ile });
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: reunion }) as PiloteSeance;
    let rappels = 0;
    for (let q = p.question(); q && rappels < 2; q = p.question()) {
      if (q.forme === 'trouver') rappels++;
      p.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    p.terminer();
    await m.memoire.ecrire([]);
    let charge: typeof ile | null = null;
    const m2 = await monter(depot, { ile: () => charge });
    expect(m2.seances.ileIncertaine()).toBe(true);
    expect(m2.seances.besoinIle!({ sorte: 'revision' })).toBe(true);
    // Apprendre sur les pays n'en dépend pas (un budget par domaine).
    expect(m2.seances.besoinIle!({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') })).toBe(false);
    // Sans l'île, la ligne de Jouer ne compte que la grappe de pays : main.ts charge l'île en fond, puis la rafraîchit.
    expect(m2.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 5 });
    charge = ile;
    expect(m2.seances.ileIncertaine()).toBe(false);
    expect(m2.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 9 });
  });

  it('textes des communes : refus et phrase d’Apprendre', () => {
    expect(textes.sujets.communes.tout_appris).toBeTruthy();
  });
});


// Le piège principal du J2 (étude J2 § 6.5) : le domaine d'une réponse vient
// du sujet lancé, jamais du terrain (un Trouver de capitale, sur le monde,
// ne s'écrit pas pays:), et seuls les domaines jouables de la version se
// comptent, se posent et se teintent (§ 3.1) ; les autres restent au journal.
describe('séance : le sujet de bout en bout', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());
  const monde_ = { nom: 'monde' } as never;

  it('une partie libre lancée sous Capitales écrit capitales:, jamais pays: ; sous Pays et Communes, inchangé', async () => {
    const m = await monter();
    const sous = (sujet: string, serie: string) => ({ branche: 'entrainement' as const, sujet, serie, mode: 'localiser' as const });
    const capitales = m.seances.libre(sous('capitales', 'Africa'), monde_)!;
    capitales(juste('BOL', 'localiser'));
    capitales(faux('TCD', 'nommer'));
    m.seances.libre(sous('pays', 'Europe'), monde_)!(juste('FRA', 'localiser'));
    m.seances.libre(sous('communes', 'reunion'), { nom: 'reunion' } as never)!(juste('97411', 'localiser'));
    // Un sujet qui n'a pas de fiches : pas de journal, plutôt qu'un domaine pris au terrain.
    expect(m.seances.libre(sous('villes', 'Europe'), monde_)).toBeNull();
    await m.memoire.ecrire([]);
    expect((await m.depot.tous()).map((e) => [e.fiche, e.mode])).toEqual([
      ['capitales:BOL:localiser', 'libre'],
      ['capitales:TCD:nommer', 'libre'],
      ['pays:FRA:localiser', 'libre'],
      ['communes:97411:localiser', 'libre'],
    ]);
  });

  /** Les événements d'une première Révision du jour (POL ratée), recopiés sous d'autres domaines (l'id de l'entité changé par `ent`), puis le lendemain. */
  async function journalMixte(domaines: { domaine: string; ent?: (id: string) => string }[]) {
    const m = await monter();
    jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance, { rate: 'POL' });
    await m.memoire.ecrire([]);
    // Des ids neufs, partout : la mémoire du lendemain (monter) refait les mêmes ids que celle-ci.
    let n = 0;
    const pays = (await m.depot.tous()).map((e) => ({ ...e, id: `00000000-0000-4000-b000-${String(++n).padStart(12, '0')}` }));
    const copies = domaines.flatMap(({ domaine, ent = (x) => x }) =>
      pays.map((e) => {
        const [, id, sens] = e.fiche.split(':');
        return { ...e, id: `00000000-0000-4000-9000-${String(++n).padStart(12, '0')}`, fiche: `${domaine}:${ent(id!)}:${sens}` };
      }),
    );
    const depot = depotMemoire();
    await depot.ajouter([...pays, ...copies]);
    const m2 = await monter(depot);
    m2.h.ts += JOUR_MS;
    // Le même journal sans les copies : ce que les comptes doivent rester.
    const seulDepot = depotMemoire();
    await seulDepot.ajouter(pays);
    const seul = await monter(seulDepot);
    seul.h.ts += JOUR_MS;
    return { m2, seul, copies };
  }

  it('des fiches capitales:, drapeaux: et mers: au journal : lues, mais ni comptées, ni posées, ni teintées', async () => {
    const mer = (id: string) => `m${id.toLowerCase()}`;
    const { m2, seul, copies } = await journalMixte([{ domaine: 'capitales' }, { domaine: 'drapeaux' }, { domaine: 'mers', ent: mer }]);
    // Lues : au journal et dans l'état (une version qui sait poser le sujet les reprendra telles quelles).
    const notees = copies.filter((e) => e.note !== null);
    expect(notees.length).toBeGreaterThan(0);
    expect(notees.every((e) => m2.memoire.etat().has(e.fiche))).toBe(true);
    // Comptées : les pays seuls, comme sans elles (le test « le lendemain » ci-dessus).
    expect(m2.seances.comptes()).toEqual({ aRevoir: 5, nouveaux: 9 });
    for (const d of [{ sorte: 'revision' as const }, { sorte: 'apprendre' as const, sujet: 'pays', serie: serie('Europe') }, { sorte: 'apprendre' as const, sujet: 'pays', serie: serie('tous') }])
      expect(m2.seances.comptes(d)).toEqual(seul.seances.comptes(d));
    // Un sujet que cette version ne pose pas : ni compte, ni séance.
    for (const sujet of ['capitales', 'drapeaux', 'mers']) {
      expect(m2.seances.comptes({ sorte: 'apprendre', sujet, serie: serie('tous') })).toEqual({ aRevoir: 0, nouveaux: 0 });
      expect(m2.seances.ouvrir({ sorte: 'apprendre', sujet, serie: serie('tous') })).toEqual({ refus: S.rien, reviser: 0 });
    }
    // Posées : la Révision du jour ne pose que des fiches de pays, et n'écrit que pays:.
    const { questions } = jouer(m2.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q) => (q as { domaine?: string }).domaine === 'pays' && q.terrain === 'monde')).toBe(true);
    await m2.memoire.ecrire([]);
    const ecrits = (await m2.depot.tous()).filter((e) => e.ts > T0 + JOUR_MS / 2);
    expect(ecrits.length).toBe(questions.length);
    expect(ecrits.every((e) => e.fiche.startsWith('pays:'))).toBe(true);
    // Teintées : la carte de la mémoire du monde montre les pays seuls, aucune mer.
    const carte = carteMemoire(m2.memoire, () => true);
    const teintes = carte.teintes('monde')!;
    expect(teintes.size).toBeGreaterThan(0);
    expect([...teintes.keys()].some((id) => /^m[a-z]/.test(id))).toBe(false);
    expect(carte.detail('monde', mer('POL'), true)).toBe(textes.memoire.jamais_vu);
  });
});

// Le bilan de séance nomme chaque lieu par le rendu du sujet de sa fiche (étude
// J2 § 5.1 et 6.3), sur les données du terrain de son bloc ; le refus « tout
// appris » dit le sujet de la série. La séance ne pose que des domaines
// jouables : le sujet factice y prend la place des pays, ou des communes seules.
describe('séance : le bilan par le rendu du sujet', () => {
  beforeEach(() => installerDom());
  afterEach(() => {
    remplaces.clear();
    vi.unstubAllGlobals();
  });

  const bilan = (p: PiloteSeance) => {
    p.terminer();
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    return el.innerText;
  };

  it('pays : nouveaux, touché à 300 km, vu ou passé, nom oublié', async () => {
    const m = await monter();
    const p1 = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    const { questions } = jouer(p1, { rate: 'POL' });
    const t1 = bilan(p1);
    expect(t1).toMatch(/Nouveaux : [^,]+(, [^,]+)+/);
    for (const q of questions) expect(t1).toContain(monde.noms[q.id]);
    expect(t1).toContain(`${monde.noms.POL} : touché à 300\u00a0km du bord`);
    m.h.ts += JOUR_MS;
    const p2 = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    let oublie = '';
    for (let q = p2.question(); q && q.forme !== 'qcm'; q = p2.question()) {
      if (q.forme === 'trouver') p2.repondre({ ...faux(q.id, 'localiser'), aide: 'passer', distance_km: null });
      else if (!oublie) (oublie = q.id), p2.repondre({ ...faux(q.id, 'nommer'), reponse: null, distance_km: null });
      else p2.repondre(juste(q.id, 'nommer'));
    }
    const t2 = bilan(p2);
    expect(t2).toContain(`${monde.noms.POL} : vu ou passé`);
    expect(t2).toContain(`${monde.noms[oublie]} : nom oublié`);
  });

  it('un sujet factice : nouveaux, ratés de Trouver et carte retournée oubliée par son rendu, aucun id ni nom affiché', async () => {
    remplaces.add('pays');
    const m = await monter();
    const p1 = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    const { questions } = jouer(p1, { rate: 'POL' });
    const ids = [...new Set(questions.map((q) => q.id))];
    const t1 = bilan(p1);
    expect(t1).toMatch(/Nouveaux : bilan-localiser [\d-]+(, bilan-localiser [\d-]+)+/);
    for (const id of ids) expect(t1).toContain(`bilan-localiser ${code(id)}`);
    expect(t1).toContain(`bilan-localiser ${code('POL')} : manquée de 300\u00a0km`);
    m.h.ts += JOUR_MS;
    const p2 = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    let oublie = '';
    for (let q = p2.question(); q && q.forme !== 'qcm'; q = p2.question()) {
      ids.push(q.id);
      if (q.forme === 'trouver') p2.repondre({ ...faux(q.id, 'localiser'), aide: 'passer', distance_km: null });
      else if (!oublie) (oublie = q.id), p2.repondre({ ...faux(q.id, 'nommer'), reponse: null, distance_km: null });
      else p2.repondre(juste(q.id, 'nommer'));
    }
    const t2 = bilan(p2);
    expect(t2).toContain(`bilan-localiser ${code('POL')} : énigme vue ou passée`);
    expect(t2).toContain(`bilan-nommer ${code(oublie)} : énigme oubliée`);
    for (const t of [t1, t2]) sansBrut(t, [...ids, ...ids.map((id) => monde.noms[id]!)]);
  });

  /**
   * La Révision du jour qui mêle les deux domaines : la grappe de communes
   * entamée (deux rappels faits la veille) puis la grappe de pays ; une commune
   * touchée à 300 km. Rend le bilan et les ids de chaque domaine.
   */
  async function bilanMixte() {
    const m = await monter(undefined, { ile: () => ile });
    const a = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: serie('reunion') }) as PiloteSeance;
    let rappels = 0;
    for (let q = a.question(); q && rappels < 2; q = a.question()) {
      if (q.forme === 'trouver') rappels++;
      a.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    a.terminer();
    const p = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    const ids = { monde: new Set<string>(), reunion: new Set<string>() };
    let rate = '';
    for (let q = p.question(); q; q = p.question()) {
      const terrain = (q.terrain ?? 'monde') as 'monde' | 'reunion';
      ids[terrain].add(q.id);
      const sens = q.forme === 'trouver' ? 'localiser' : 'nommer';
      if (!rate && terrain === 'reunion' && q.forme === 'trouver') (rate = q.id), p.repondre(faux(q.id, sens));
      else p.repondre(juste(q.id, sens));
    }
    expect(ids.monde.size).toBeGreaterThan(0);
    expect(ids.reunion.size).toBeGreaterThan(0);
    expect(rate).toBeTruthy();
    return { texte: bilan(p), ids, rate };
  }

  it('pays et communes dans la même séance : chaque lieu nommé par le rendu de son domaine, sur les données de son terrain', async () => {
    const { texte, ids, rate } = await bilanMixte();
    for (const id of ids.monde) expect(texte).toContain(monde.noms[id]!);
    for (const id of ids.reunion) expect(texte).toContain(ile.noms[id]!);
    expect(texte).toContain(remplir(textes.sujets.communes.rate_km, { nom: ile.noms[rate]!, km: '300\u00a0km' }));
    sansBrut(texte, [...ids.monde, ...ids.reunion]);
  });

  it('un sujet factice à la place des communes seules : les communes par son rendu, les pays par le leur', async () => {
    remplaces.add('communes');
    const { texte, ids, rate } = await bilanMixte();
    for (const id of ids.monde) expect(texte).toContain(monde.noms[id]!);
    for (const id of ids.reunion) expect(texte).toContain(`bilan-localiser ${code(id)}`);
    expect(texte).toContain(`bilan-localiser ${code(rate)} : manquée de 300\u00a0km`);
    sansBrut(texte, [...ids.monde, ...ids.reunion, ...[...ids.reunion].map((id) => ile.noms[id]!)]);
  });

  /** Apprendre sur cette série, jour après jour, jusqu'à un refus autre que « grappe du jour faite ». */
  async function jusquauRefus(d: Extract<DemandeSeance, { sorte: 'apprendre' }>) {
    const m = await monter(undefined, { ile: () => ile });
    for (let k = 0; k < 40; k++) {
      const r = m.seances.ouvrir(d);
      if (!('refus' in r)) jouer(r);
      else if (r.refus === S.grappe_faite) m.h.ts += JOUR_MS;
      else return r.refus;
    }
    throw new Error('jamais tout appris');
  }

  it('tout appris : le refus d’Apprendre dit le sujet de la série (communes, pays)', async () => {
    expect(await jusquauRefus({ sorte: 'apprendre', sujet: 'communes', serie: serie('reunion') })).toBe(textes.sujets.communes.tout_appris);
    expect(await jusquauRefus({ sorte: 'apprendre', sujet: 'pays', serie: serie('South America') })).toBe(textes.sujets.pays.tout_appris);
  });
});
