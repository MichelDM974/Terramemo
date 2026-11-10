// La séance vue de l'appli (src/vues/seance.ts) : programme du jour depuis la
// mémoire, événements écrits au dépôt (un par réponse), état mis à jour sans
// rejeu, ligne discrète, cadrage de la grappe, bilan, comptes de Jouer, refus
// d'Apprendre, parties libres (D11).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chargerCapitales, oublierCapitales } from '../src/map/capitales';
import { assembler } from '../src/map/donnees';
import { assemblerTerrain } from '../src/map/donnees-terrain';
import type { Lieu, NomTerrain, Pays } from '../src/map/types';
import type { Domaine } from '../src/srs/fiches';
import { depotMemoire, type Depot } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import type { Evenement } from '../src/srs/journal';
import { grappesPays } from '../src/srs/grappes';
import { INTRODUCTIONS_PAR_JOUR } from '../src/srs/planif';
import { etat } from '../src/srs/rejeu';
import { evenementReponse } from '../src/srs/seance';
import { catalogue } from '../src/vues/cibles';
import type { DemandeSeance, PiloteSeance, RefusSeance, ReponseJouee } from '../src/vues/essai';
import { carteMemoire } from '../src/vues/carte-memoire';
import { creerSeances, texteComptes } from '../src/vues/seance';
import { remplir, textes } from '../src/vues/textes';
import { El, installerDom } from './dom-factice';
import { code, remplaces, sansBrut, TEXTES_FACTICES } from './sujet-factice';

vi.mock('../src/vues/sujets', async (orig) => (await import('./sujet-factice')).avecFactice(await orig()));

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const monde = assembler(lire('monde.topo.json'), lire('pays.json') as Pays[], lire('contestees.json'), lire('noms.fr.json'));
const lireIle = (f: string) => JSON.parse(readFileSync(`public/geo/reunion/${f}`, 'utf8'));
const ile = assemblerTerrain(lireIle('communes.topo.json'), 'communes', lireIle('communes.json') as Lieu[], lireIle('noms.fr.json'));
const CATALOGUE = catalogue(monde.entites.map((e) => e.pays));
const serie = (id: string) => CATALOGUE.find((s) => s.id === id)!;
const S = textes.seance;

const JOUR_MS = 86_400_000;
/** Une version d'avant le lot 1 : les capitales lues au journal, pas posées. */
const SANS_CAPITALES: readonly Domaine[] = ['pays', 'communes'];

/** Les capitales lues des fichiers de public/geo (au lieu du réseau). */
const lireCapitales = () => chargerCapitales(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
// Les capitales lues une fois (src/map/capitales.ts), comme après le choix du sujet : la séance les pose.
beforeAll(async () => {
  await lireCapitales();
});
const T0 = Date.UTC(2026, 10, 9, 8); // 12 h à La Réunion

function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function monter(
  depot: Depot = depotMemoire(),
  o: { ile?: () => typeof ile | null; jouables?: readonly Domaine[]; charger?: (t: NomTerrain) => Promise<unknown>; chargerCapitales?: () => Promise<unknown> } = {},
) {
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
  const seances = creerSeances({ memoire, monde, hasard: graine(3), ...(o.ile ? { ile: o.ile } : {}), ...(o.jouables ? { jouables: o.jouables } : {}), ...(o.charger ? { charger: o.charger } : {}),
    ...(o.chargerCapitales ? { chargerCapitales: o.chargerCapitales } : {}),
  });
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
    expect(refus.refus).toBe(remplir(textes.sujets.pays.grappe_entamee, { serie: 'Europe' }));
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
    expect(m.seances.besoins({ sorte: 'apprendre', sujet: 'communes', serie: reunion })).toEqual(['communes']);
    expect(m.seances.besoins({ sorte: 'revision' })).toEqual([]);
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
    expect(m2.seances.besoins({ sorte: 'revision' })).toEqual(['communes']);
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
    expect(m.seances.besoins({ sorte: 'revision' })).toEqual(['communes']);
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
    expect(m2.seances.incertains()).toEqual(['communes']);
    expect(m2.seances.besoins({ sorte: 'revision' })).toEqual(['communes']);
    // Apprendre sur les pays n'en dépend pas (un budget par domaine).
    expect(m2.seances.besoins({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') })).toEqual([]);
    // Sans l'île, la ligne de Jouer ne compte que la grappe de pays : main.ts charge l'île en fond, puis la rafraîchit.
    expect(m2.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 5 });
    charge = ile;
    expect(m2.seances.incertains()).toEqual([]);
    expect(m2.seances.completer()).toBeNull();
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
  async function journalMixte(domaines: { domaine: string; ent?: (id: string) => string }[], jouables?: readonly Domaine[]) {
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
    const m2 = await monter(depot, jouables ? { jouables } : {});
    m2.h.ts += JOUR_MS;
    // Le même journal sans les copies : ce que les comptes doivent rester.
    const seulDepot = depotMemoire();
    await seulDepot.ajouter(pays);
    const seul = await monter(seulDepot, jouables ? { jouables } : {});
    seul.h.ts += JOUR_MS;
    return { m2, seul, copies };
  }

  it('des fiches capitales: (version d’avant le lot 1), drapeaux: et mers: au journal : lues, mais ni comptées, ni posées, ni teintées', async () => {
    const mer = (id: string) => `m${id.toLowerCase()}`;
    const { m2, seul, copies } = await journalMixte([{ domaine: 'capitales' }, { domaine: 'drapeaux' }, { domaine: 'mers', ent: mer }], SANS_CAPITALES);
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
    const carte = carteMemoire(m2.memoire, () => true, { jouables: SANS_CAPITALES });
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

// Mémoire à plusieurs sujets (étude J2 § 6.1 à 6.3, lot 0c) : les jouables
// injectés (capitales en plus des pays et des communes), le rendu factice à
// la place du leur (le vrai : « séance : le sujet Capitales », plus bas). La Révision du jour mêle les révisions du monde, n'ouvre que la
// grappe de pays, et finit la grappe qu'Apprendre a ouverte dans un autre
// sujet ; le plafond commun d'introductions étale le reliquat.
describe('séance : plusieurs sujets du monde (lot 0c)', () => {
  beforeEach(() => {
    installerDom();
    remplaces.add('capitales');
  });
  afterEach(() => {
    remplaces.clear();
    vi.unstubAllGlobals();
  });
  const AVEC_CAPITALES: readonly Domaine[] = ['pays', 'communes', 'capitales'];
  const continent = new Map(monde.entites.map((e) => [e.pays.id, e.pays.continent]));

  /** Joue la Révision du jour (ou une demande) : questions avec leur domaine. */
  const questionsDe = (p: PiloteSeance) => jouer(p).questions as { id: string; forme: string; terrain?: string; domaine?: string }[];

  it('deux domaines du monde mêlés : les fiches capitales: d’un journal factice révisées dans le même bloc que les pays, chacune sous son domaine', async () => {
    // Le journal d'une première Révision du jour (5 pays, POL ratée), recopié sous capitales:.
    const m = await monter();
    jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance, { rate: 'POL' });
    await m.memoire.ecrire([]);
    let n = 0;
    const pays = (await m.depot.tous()).map((e) => ({ ...e, id: `00000000-0000-4000-b000-${String(++n).padStart(12, '0')}` }));
    const capitales = pays.map((e) => ({ ...e, id: `00000000-0000-4000-9000-${String(++n).padStart(12, '0')}`, fiche: e.fiche.replace(/^pays:/, 'capitales:') }));
    const depot = depotMemoire();
    await depot.ajouter([...pays, ...capitales]);
    const seulDepot = depotMemoire();
    await seulDepot.ajouter(pays);
    const m2 = await monter(depot, { jouables: AVEC_CAPITALES });
    const seul = await monter(seulDepot);
    m2.h.ts += JOUR_MS;
    seul.h.ts += JOUR_MS;
    // Comptées : le double des pays à revoir ; une seule grappe nouvelle, celle des pays.
    const c = seul.seances.comptes()!;
    expect(m2.seances.comptes()).toEqual({ aRevoir: 2 * c.aRevoir, nouveaux: c.nouveaux });
    const { questions } = jouer(m2.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    const qs = questions as { forme: string; domaine?: string; terrain?: string }[];
    const avantGrappe = qs.slice(0, qs.findIndex((q) => q.forme === 'qcm'));
    expect(avantGrappe.length).toBe(2 * c.aRevoir);
    // Mêlées : des capitales entre des pays, pas un bloc après l'autre.
    const doms = avantGrappe.map((q) => q.domaine);
    expect(doms.filter((d) => d === 'capitales').length).toBe(c.aRevoir);
    expect(doms.join(',')).not.toBe([...doms].sort().join(','));
    expect(qs.every((q) => q.terrain === 'monde')).toBe(true);
    // La grappe nouvelle : des pays seuls.
    expect(qs.slice(avantGrappe.length).every((q) => q.domaine === 'pays')).toBe(true);
    await m2.memoire.ecrire([]);
    const ecrits = (await m2.depot.tous()).filter((e) => e.ts > T0 + JOUR_MS / 2);
    expect(ecrits.filter((e) => e.fiche.startsWith('capitales:')).length).toBe(c.aRevoir);
    expect(m2.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
  });

  it('journal vide : seule la grappe de pays s’ouvre dans la Révision du jour ; celle des capitales par Apprendre', async () => {
    const m = await monter(undefined, { jouables: AVEC_CAPITALES });
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 5 });
    expect(m.seances.comptes({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Europe') })).toEqual({ aRevoir: 0, nouveaux: 5 });
    const qs = questionsDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.domaine === 'pays')).toBe(true);
    // Après elle, la Révision du jour n'ouvre pas la grappe des capitales.
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
    expect(m.seances.ouvrir({ sorte: 'revision' })).toEqual({ refus: S.rien, reviser: 0 });
  });

  it('une grappe de capitales entamée par Apprendre : refus ailleurs, reprise par la Révision du jour avant la grappe de pays ; conseil des pays pas appris', async () => {
    const m = await monter(undefined, { jouables: AVEC_CAPITALES });
    const a = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Europe') }) as PiloteSeance;
    let rappels = 0;
    for (let q = a.question(); q && rappels < 2; q = a.question()) {
      expect(q.domaine).toBe('capitales');
      if (q.forme === 'trouver') rappels++;
      a.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    a.terminer();
    // Aucun pays d'Europe appris : la grappe est prise quand même, avec le conseil (D39 b).
    const el = new El('div');
    a.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    expect(el.innerText).toContain(remplir(textes.sujets.pays.conseil, { chemin: 'Pays › Europe › Apprendre' }));
    await m.memoire.ecrire([]);
    expect((await m.depot.tous()).every((e) => e.fiche.startsWith('capitales:'))).toBe(true);
    // Apprendre Capitales sur une autre série : la grappe entamée passe avant (texte du sujet).
    const refus = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Africa') }) as RefusSeance;
    expect(refus.refus).toBe(remplir(TEXTES_FACTICES.grappe_entamee, { serie: 'Europe' }));
    expect(refus.finir).toBe(3);
    // La Révision du jour : les 3 capitales à finir (QCM puis rappel), puis la grappe de pays (5).
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 8 });
    const qs = questionsDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(qs.slice(0, 6).map((q) => [q.domaine, q.forme])).toEqual([...Array(3).fill(['capitales', 'qcm']), ...Array(3).fill(['capitales', 'trouver'])]);
    expect(qs.slice(0, 6).every((q) => continent.get(q.id) === 'Europe')).toBe(true);
    expect(qs.slice(6).every((q) => q.domaine === 'pays')).toBe(true);
    expect(qs.slice(6).filter((q) => q.forme === 'trouver').length).toBe(5);
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
  });

  it('capitales : la grappe d’une région dont les pays sont appris passe avant la première de la série, sans conseil', async () => {
    const m = await monter(undefined, { jouables: AVEC_CAPITALES });
    // Les pays de la deuxième grappe d'Afrique appris la veille (la première, non).
    const afrique = grappesPays(monde.entites.map((e) => e.pays)).filter((g) => g.continent === 'Africa');
    const a1 = afrique[1]!.membres;
    const hier = () => ({ ts: T0 - JOUR_MS, tz: 240 });
    await m.memoire.ecrire(
      a1.map((id) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: hier, nouvelId: () => m.memoire.nouvelId() }, `pays:${id}:localiser`, 'rappel', { correct: true, duree_ms: 1000 }, 3)),
    );
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Africa') }) as PiloteSeance;
    const qs = questionsDe(p);
    const nouvelles = qs.filter((q) => q.domaine === 'capitales' && q.forme === 'qcm').map((q) => q.id);
    expect(new Set(nouvelles)).toEqual(new Set(a1));
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    expect(el.innerText).not.toContain(textes.sujets.pays.conseil.split(':')[0]!);
  });

  it('plafond commun d’introductions (D46) : un joueur qui revient retrouve ses fiches « Reconnaître » étalées, sans grappe nouvelle tant qu’il en reste', async () => {
    // 20 pays appris (rappel juste) la veille, leurs fiches nommer jamais introduites.
    const m = await monter();
    const ids = grappesPays(monde.entites.map((e) => e.pays)).flatMap((g) => g.membres).slice(0, 20);
    const avant = T0 - JOUR_MS;
    await m.memoire.ecrire(
      ids.map((id) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts: avant, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, `pays:${id}:localiser`, 'rappel', { correct: true, duree_ms: 1000 }, 3)),
    );
    const due = m.memoire.etat().get(`pays:${ids[0]}:localiser`)!.echeance_jour - m.memoire.jour();
    // Pas dues avant après-demain : le lendemain, rien d'autre que le reliquat.
    expect(due).toBeGreaterThan(1);
    expect(m.seances.comptes()).toEqual({ aRevoir: INTRODUCTIONS_PAR_JOUR, nouveaux: 0 });
    const qs = questionsDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(qs.map((q) => q.forme)).toEqual(Array(INTRODUCTIONS_PAR_JOUR).fill('retournee'));
    // Le reliquat attend demain : ni introduction, ni grappe nouvelle aujourd'hui.
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 0 });
    expect(m.seances.ouvrir({ sorte: 'revision' })).toEqual({ refus: S.introductions, reviser: 0 });
    expect(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('tous') })).toEqual({ refus: S.introductions, reviser: 0 });
    // Le lendemain : les 5 restantes, puis la grappe.
    m.h.ts += JOUR_MS;
    const c = m.seances.comptes()!;
    expect(c.aRevoir).toBe(20 - INTRODUCTIONS_PAR_JOUR);
    expect(c.nouveaux).toBeGreaterThan(0);
  });

  /** Écrit au journal un rappel noté (Good par défaut) de chaque fiche, à l'heure `ts`. */
  const noter = (m: Awaited<ReturnType<typeof monter>>, fiches: string[], ts: number, note: 1 | 3 = 3) =>
    m.memoire.ecrire(fiches.map((f) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, f, 'rappel', { correct: note === 3, duree_ms: 1000 }, note)));
  const grappes = grappesPays(monde.entites.map((e) => e.pays));
  const idsCommunes = ile.entites.map((e) => e.pays.id);

  it('Apprendre avec un reliquat : ses introductions dans le plafond du jour, seules, sans grappe ; puis le refus du reliquat', async () => {
    const m = await monter();
    await noter(m, grappes.flatMap((g) => g.membres).slice(0, 20).map((id) => `pays:${id}:localiser`), T0 - JOUR_MS);
    const qs = questionsDe(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') }) as PiloteSeance);
    expect(qs.map((q) => q.forme)).toEqual(Array(INTRODUCTIONS_PAR_JOUR).fill('retournee'));
    expect(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') })).toEqual({ refus: S.introductions, reviser: 0 });
  });

  it('plafond commun au monde et à l’île : les introductions des communes après celles des pays, 15 en tout dans la Révision du jour', async () => {
    const m = await monter(undefined, { ile: () => ile });
    await noter(m, [...grappes.flatMap((g) => g.membres).slice(0, 12).map((id) => `pays:${id}:localiser`), ...idsCommunes.slice(0, 6).map((id) => `communes:${id}:localiser`)], T0 - JOUR_MS);
    expect(m.seances.comptes()?.aRevoir).toBe(INTRODUCTIONS_PAR_JOUR);
    const qs = questionsDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).filter((q) => q.forme === 'retournee');
    expect(qs.map((q) => q.terrain)).toEqual([...Array(12).fill('monde'), ...Array(INTRODUCTIONS_PAR_JOUR - 12).fill('reunion')]);
    // Le reliquat des communes attend demain.
    expect(m.seances.comptes()?.aRevoir).toBe(0);
    expect(m.seances.ouvrir({ sorte: 'apprendre', sujet: 'communes', serie: serie('reunion') })).toEqual({ refus: S.introductions, reviser: 0 });
  });

  it('ordre des blocs : la grappe de capitales entamée, puis les communes sur l’île, puis la grappe de pays', async () => {
    const m = await monter(undefined, { ile: () => ile, jouables: AVEC_CAPITALES });
    await noter(m, idsCommunes.slice(0, 6).map((id) => `communes:${id}:localiser`), T0 - JOUR_MS);
    const a = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Europe') }) as PiloteSeance;
    let rappels = 0;
    for (let q = a.question(); q && rappels < 2; q = a.question()) {
      if (q.forme === 'trouver') rappels++;
      a.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    a.terminer();
    const qs = questionsDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(qs.map((q) => `${q.terrain}:${q.domaine}:${q.forme}`)).toEqual([
      ...Array(3).fill('monde:capitales:qcm'),
      ...Array(3).fill('monde:capitales:trouver'),
      ...Array(6).fill('reunion:communes:retournee'),
      ...Array(5).fill('monde:pays:qcm'),
      ...Array(5).fill('monde:pays:trouver'),
    ]);
  });

  it('grappe de capitales entamée : pas reprise tant que des capitales dues restent après le bloc des révisions', async () => {
    const m = await monter(undefined, { jouables: AVEC_CAPITALES });
    const europe = grappes.find((g) => g.continent === 'Europe')!;
    const ailleurs = grappes.filter((g) => g.continent !== 'Europe').flatMap((g) => g.membres).slice(0, 30);
    // 30 capitales ratées l'avant-veille (dues), une grappe d'Europe entamée ce jour (sur un autre appareil).
    await noter(m, ailleurs.map((id) => `capitales:${id}:localiser`), T0 - 2 * JOUR_MS, 1);
    await noter(m, europe.membres.slice(0, 2).map((id) => `capitales:${id}:localiser`), T0 - 3_600_000);
    const qs = questionsDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(qs.map((q) => q.forme)).toEqual(Array(25).fill('trouver'));
    // Les 5 dernières dues, puis la grappe entamée (ses 3 restantes, QCM puis rappel), puis celle des pays.
    const suite = questionsDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(suite.map((q) => `${q.domaine}:${q.forme}`)).toEqual([...Array(5).fill('capitales:trouver'), ...Array(3).fill('capitales:qcm'), ...Array(3).fill('capitales:trouver'), ...Array(5).fill('pays:qcm'), ...Array(5).fill('pays:trouver')]);
  });

  it('pays seuls, sans île : un seul bloc, la reprise d’une révision ratée vient après la grappe nouvelle', async () => {
    const m = await monter();
    jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance, { rate: 'POL' });
    m.h.ts += JOUR_MS;
    const qs = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance, { rate: 'POL' }).questions;
    const pol = qs.flatMap((q, k) => (q.id === 'POL' && q.forme === 'trouver' ? [k] : []));
    expect(pol.length).toBe(2);
    expect(qs.slice(pol[0]! + 1, pol[1]).some((q) => q.forme === 'qcm')).toBe(true);
    expect(pol[1]).toBe(qs.length - 1);
  });

  it('charger() : l’île demandée au chargeur une seule fois qu’elle manque ; rien à charger sans communes', async () => {
    let charge: typeof ile | null = null;
    const chargeur = vi.fn(async () => {
      charge = ile;
    });
    const m = await monter(undefined, { ile: () => charge, charger: chargeur });
    const reunion = { sorte: 'apprendre' as const, sujet: 'communes', serie: serie('reunion') };
    expect(m.seances.charger!({ sorte: 'revision' })).toBeNull();
    expect(m.seances.charger!({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') })).toBeNull();
    await m.seances.charger!(reunion);
    expect(chargeur).toHaveBeenCalledWith('reunion');
    expect(m.seances.charger!(reunion)).toBeNull();
    expect(m.seances.ouvrir(reunion)).toHaveProperty('question');
  });
});

// Le sujet Capitales jouable (lot 1) : ses vraies données (chargées plus haut)
// et son vrai rendu ; les jouables de la version, sans injection.
describe('séance : le sujet Capitales (lot 1)', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());
  const grappes = grappesPays(monde.entites.map((e) => e.pays));
  const idsCommunes = ile.entites.map((e) => e.pays.id);
  const noter = (m: Awaited<ReturnType<typeof monter>>, fiches: string[], ts: number) =>
    m.memoire.ecrire(fiches.map((f) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, f, 'rappel', { correct: true, duree_ms: 1000 }, 3)));

  it('Apprendre Capitales écrit capitales: seulement ; le bilan nomme ville et pays, jamais un Qid ni un id', async () => {
    const m = await monter();
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Europe') }) as PiloteSeance;
    const { questions } = jouer(p, { rate: grappes.find((g) => g.continent === 'Europe')!.membres[0] });
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q) => (q as { domaine?: string }).domaine === 'capitales')).toBe(true);
    await m.memoire.ecrire([]);
    const evts = await m.depot.tous();
    expect(evts.length).toBe(questions.length);
    expect(evts.every((e) => e.fiche.startsWith('capitales:'))).toBe(true);
    p.terminer();
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    const txt = el.innerText;
    // « Nouveaux : Kiev (Ukraine), … » : la principale (le bilan est fait d'un rendu neuf), puis le pays.
    expect(txt).toMatch(/Nouveaux : [^,]+ \([^)]+\)/);
    expect(txt).toContain('Kiev (Ukraine)');
    expect(txt).toMatch(/touché à 300/);
    expect(txt).not.toMatch(/\bQ\d+\b/);
    sansBrut(txt, [...questions.map((q) => q.id)]);
  });

  it('D39 b : le conseil dit à l’ouverture d’Apprendre (avant la première question) quand les pays ne sont pas appris ; aucun sinon', async () => {
    const m = await monter();
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Africa') }) as PiloteSeance;
    expect(p.conseil).toBe(remplir(textes.sujets.pays.conseil, { chemin: 'Pays › Afrique › Apprendre' }));
    // Pays ou communes : jamais de conseil.
    expect((m.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Africa') }) as PiloteSeance).conseil).toBeNull();
    // Les pays de la première grappe d'Afrique appris la veille : la grappe est prête, sans conseil.
    const m2 = await monter();
    await noter(m2, grappes.find((g) => g.continent === 'Africa')!.membres.map((id) => `pays:${id}:localiser`), T0 - JOUR_MS);
    expect((m2.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Africa') }) as PiloteSeance).conseil).toBeNull();
  });

  it('D37 c : un pays au nom de sa capitale (Luxembourg) appris sous Capitales n’a jamais de fiche Reconnaître à introduire', async () => {
    const m = await monter();
    await noter(m, ['LUX', 'BEL', 'MCO', 'FRA'].map((id) => `capitales:${id}:localiser`), T0 - JOUR_MS);
    const qs = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions.filter((q) => q.forme === 'retournee');
    expect(qs.map((q) => q.id).sort()).toEqual(['BEL', 'FRA']);
  });

  it('plafond par âge (D46 d) : les 15 plus anciennes de tous les domaines, monde et île confondus, puis réparties ; deux sujets du monde n’affament pas les communes', async () => {
    const m = await monter(undefined, { ile: () => ile });
    // Les communes apprises l'avant-veille ; 10 pays et 10 capitales la veille : 26 fiches nommer à introduire.
    await noter(m, idsCommunes.slice(0, 6).map((id) => `communes:${id}:localiser`), T0 - 2 * JOUR_MS);
    const monde10 = grappes.flatMap((g) => g.membres).filter((id) => !['DJI', 'GTM', 'KWT', 'LUX', 'MCO', 'PAN', 'SGP', 'SMR', 'VAT'].includes(id)).slice(0, 10);
    await noter(m, [...monde10.map((id) => `pays:${id}:localiser`), ...monde10.map((id) => `capitales:${id}:localiser`)], T0 - JOUR_MS);
    expect(m.seances.comptes()?.aRevoir).toBe(INTRODUCTIONS_PAR_JOUR);
    const qs = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions.filter((q) => q.forme === 'retournee') as { terrain?: string; domaine?: string }[];
    expect(qs).toHaveLength(INTRODUCTIONS_PAR_JOUR);
    // Les 6 communes, les plus anciennes, toutes ; puis 9 du monde (à âge égal, les pays d'abord).
    expect(qs.filter((q) => q.terrain === 'reunion')).toHaveLength(6);
    expect(qs.filter((q) => q.terrain === 'monde').map((q) => q.domaine)).toEqual(Array(9).fill('pays'));
  });
});

// Les capitales pas encore lues (page neuve) : le chemin réel d'une séance,
// besoins() puis charger(), hors ligne compris ; et la page rouverte en
// pleine grappe de capitales, qui les charge en fond (main.ts : completer).
describe('séance : les capitales pas encore lues (lot 1)', () => {
  beforeEach(() => {
    installerDom();
    oublierCapitales();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await lireCapitales();
  });
  const noter = (m: Awaited<ReturnType<typeof monter>>, fiches: string[], ts: number) =>
    m.memoire.ecrire(fiches.map((f) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, f, 'rappel', { correct: true, duree_ms: 1000 }, 3)));
  const capitalesDe = (p: PiloteSeance) => (jouer(p).questions as { id: string; domaine?: string }[]).filter((q) => q.domaine === 'capitales').map((q) => q.id);

  it('Révision du jour avec des capitales à introduire : besoins() les demande, charger() les lit, puis la séance les pose', async () => {
    const lecteur = vi.fn(lireCapitales);
    const m = await monter(undefined, { chargerCapitales: lecteur });
    await noter(m, ['BEL', 'FRA'].map((id) => `capitales:${id}:localiser`), T0 - JOUR_MS);
    expect(m.seances.besoins({ sorte: 'revision' })).toEqual(['capitales']);
    expect(m.seances.besoins({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Europe') })).toEqual(['capitales']);
    const chargement = m.seances.charger!({ sorte: 'revision' });
    expect(chargement).not.toBeNull();
    await chargement;
    expect(lecteur).toHaveBeenCalledTimes(1);
    expect(m.seances.charger!({ sorte: 'revision' })).toBeNull();
    expect(capitalesDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).sort()).toEqual(['BEL', 'FRA']);
  });

  it('hors ligne : la séance s’ouvre sans les capitales (elles restent à introduire), sans lever', async () => {
    const m = await monter(undefined, { chargerCapitales: () => Promise.reject(new Error('hors ligne')) });
    await noter(m, ['BEL', 'FRA'].map((id) => `capitales:${id}:localiser`), T0 - JOUR_MS);
    await expect(m.seances.charger!({ sorte: 'revision' })).resolves.toBeDefined();
    const p = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    expect(capitalesDe(p)).toEqual([]);
    expect(m.seances.comptes()?.aRevoir).toBe(2);
  });

  it('l’île et les capitales chargées ensemble : un échec rapide des capitales n’ouvre pas la séance avant l’île', async () => {
    let charge: typeof ile | null = null;
    let finirIle: () => void = () => undefined;
    const chargeur = vi.fn(() => new Promise<void>((ok) => (finirIle = () => ((charge = ile), ok()))));
    const m = await monter(undefined, { ile: () => charge, charger: chargeur, chargerCapitales: () => Promise.reject(new Error('hors ligne')) });
    const idsCommunes = ile.entites.map((e) => e.pays.id);
    await noter(m, [...idsCommunes.slice(0, 2).map((id) => `communes:${id}:localiser`), 'capitales:BEL:localiser'], T0 - JOUR_MS);
    expect(m.seances.besoins({ sorte: 'revision' }).sort()).toEqual(['capitales', 'communes']);
    let fini = false;
    const fin = () => void (fini = true);
    m.seances.charger!({ sorte: 'revision' })!.then(fin, fin);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(fini).toBe(false);
    finirIle();
    await vi.waitFor(() => expect(fini).toBe(true));
    const qs = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions as { terrain?: string }[];
    expect(qs.filter((q) => q.terrain === 'reunion').length).toBe(2);
  });

  it('page rouverte en pleine grappe de capitales, pas encore lues : incertaine, chargée en fond, la ligne de Jouer compte la grappe à finir', async () => {
    await lireCapitales();
    const depot = depotMemoire();
    const m = await monter(depot);
    const a = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'capitales', serie: serie('Europe') }) as PiloteSeance;
    let rappels = 0;
    for (let q = a.question(); q && rappels < 2; q = a.question()) {
      if (q.forme === 'trouver') rappels++;
      a.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    a.terminer();
    await m.memoire.ecrire([]);
    // Les 3 capitales à finir, puis la grappe de pays (5).
    expect(m.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 8 });
    expect(m.seances.incertains()).toEqual([]);
    oublierCapitales();
    const m2 = await monter(depot, { chargerCapitales: lireCapitales });
    expect(m2.seances.incertains()).toEqual(['capitales']);
    // Sans les capitales, la ligne de Jouer ne compte que la grappe de pays : main.ts les charge en fond, puis la rafraîchit.
    expect(m2.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 5 });
    await m2.seances.completer();
    expect(m2.seances.incertains()).toEqual([]);
    expect(m2.seances.completer()).toBeNull();
    expect(m2.seances.comptes()).toEqual({ aRevoir: 0, nouveaux: 8 });
  });
});
