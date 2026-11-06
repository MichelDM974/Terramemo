// La séance vue de l'appli (src/vues/seance.ts) : programme du jour depuis la
// mémoire, événements écrits au dépôt (un par réponse), état mis à jour sans
// rejeu, ligne discrète, cadrage de la grappe, bilan, comptes de Jouer, refus
// d'Apprendre, parties libres (D11).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assembler } from '../src/map/donnees';
import type { Pays } from '../src/map/types';
import { depotMemoire, type Depot } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import type { Evenement } from '../src/srs/journal';
import { etat } from '../src/srs/rejeu';
import { catalogue } from '../src/vues/cibles';
import type { PiloteSeance, RefusSeance, ReponseJouee } from '../src/vues/essai';
import { creerSeances, texteComptes } from '../src/vues/seance';
import { textes } from '../src/vues/textes';
import { El, installerDom } from './dom-factice';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const monde = assembler(lire('monde.topo.json'), lire('pays.json') as Pays[], lire('contestees.json'), lire('noms.fr.json'));
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

async function monter(depot: Depot = depotMemoire()) {
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
  const seances = creerSeances({ memoire, monde, hasard: graine(3) });
  return { memoire, seances, depot, h, lectures: () => lectures };
}

const juste = (id: string, sens: 'localiser' | 'nommer'): ReponseJouee => ({ id, sens, correct: true, aide: null, reponse: null, via: 'trace', zoom: 2, distance_km: 0, duree_ms: 1200 });
const faux = (id: string, sens: 'localiser' | 'nommer'): ReponseJouee => ({ id, sens, correct: false, aide: null, reponse: 'XXX', via: null, zoom: 2, distance_km: 300, duree_ms: 2400 });

/** Joue la séance : juste partout, sauf `rate` (faux au premier passage) ; « Je connais déjà » sur `connu`. */
function jouer(p: PiloteSeance, o: { rate?: string; connu?: string } = {}) {
  const lignes: string[] = [];
  const questions: { id: string; forme: string; cadrer: unknown }[] = [];
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
    const actions = { continuer: vi.fn(), carte: vi.fn() };
    p.bilan(el as never, actions);
    const txt = el.innerText;
    expect(txt).toContain('Révision du jour');
    expect(txt).toContain('Nouveaux : ');
    expect(txt).toContain(`${monde.noms[rate]} : touché à 300`);
    expect(txt).toContain(S.bilan_fini);
    expect(txt.toLowerCase()).not.toContain('point');
    expect(el.querySelector('#seance-continuer')).toBeNull();
    el.querySelector('#seance-carte')!.click();
    expect(actions.carte).toHaveBeenCalled();
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
    const afrique = m.seances.ouvrir({ sorte: 'apprendre', serie: serie('Africa') }) as PiloteSeance;
    expect(m.seances.comptes({ sorte: 'apprendre', serie: serie('Africa') })?.nouveaux).toBeGreaterThan(4);
    const { questions } = jouer(afrique);
    const ids = new Set(questions.map((q) => q.id));
    const continent = new Map(monde.entites.map((e) => [e.pays.id, e.pays.continent]));
    expect([...ids].every((id) => continent.get(id) === 'Africa')).toBe(true);
    // Même jour, autre série : la grappe du jour est prise.
    const refus = m.seances.ouvrir({ sorte: 'apprendre', serie: serie('Europe') }) as RefusSeance;
    expect(refus).toEqual({ refus: S.grappe_faite, reviser: 0 });
    // Révision du jour : rien à faire.
    expect(m.seances.ouvrir({ sorte: 'revision' })).toEqual({ refus: S.rien, reviser: 0 });
    // Le lendemain, Apprendre sur l'Europe : les introductions d'abord, puis la grappe d'Europe.
    m.h.ts += JOUR_MS;
    const europe = m.seances.ouvrir({ sorte: 'apprendre', serie: serie('Europe') }) as PiloteSeance;
    const q = jouer(europe).questions;
    expect(q.filter((x) => x.forme === 'retournee').length).toBe(ids.size);
    expect(q.filter((x) => x.forme === 'qcm').every((x) => continent.get(x.id) === 'Europe')).toBe(true);
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
