// La séance vue de l'appli (src/vues/seance.ts) : programme du jour depuis la
// mémoire, événements écrits au dépôt (un par réponse), état mis à jour sans
// rejeu, ligne discrète, cadrage de la grappe, bilan, comptes de Jouer, refus
// d'Apprendre, parties libres (D11).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chargerCapitales, oublierCapitales } from '../src/map/capitales';
import { chargerDrapeaux, drapeauxCharges, oublierDrapeaux } from '../src/map/drapeaux';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { chargerMers, IDS_MERS, oublierMers } from '../src/map/mers';
import { assemblerTerrain } from '../src/map/donnees-terrain';
import type { Lieu, NomTerrain, Pays } from '../src/map/types';
import type { Domaine } from '../src/srs/fiches';
import { depotMemoire, type Depot } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import type { Evenement } from '../src/srs/journal';
import { GRAPPE_OCEANS, grappesCommunes, grappesMers, grappesPays } from '../src/srs/grappes';
import { INTRODUCTIONS_PAR_JOUR } from '../src/srs/planif';
import { etat } from '../src/srs/rejeu';
import { evenementReponse } from '../src/srs/seance';
import { catalogue, serieMers } from '../src/vues/cibles';
import type { DemandeSeance, PiloteSeance, RefusSeance, ReponseJouee } from '../src/vues/essai';
import { carteMemoire } from '../src/vues/carte-memoire';
import { creerSeances, texteComptes, type ComptesSeance } from '../src/vues/seance';
import { LIBELLE_STATUT, texteAdmis } from '../src/vues/commun';
import { curseurCharge, poserCurseur, poserVoisins, rendu } from '../src/vues/sujets';
import * as morceauVoisins from '../src/vues/voisins';
import * as morceauCurseur from '../src/vues/curseur';
import { lireGrandeurs } from '../src/exercices/grandeurs';
import type { FichierMonde } from '../src/fiches/donnees';
import { apprendreLieu, CLE_APPRENDRE, lirePrefere } from '../src/vues/apprendre-lieu';
import { garderDerniere, type Lancement } from '../src/vues/arbre';
import type { Serie } from '../src/vues/cibles';
import type { Memoire } from '../src/journal/memoire';
import { textesFiche } from '../src/vues/textes-fiche';
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
/** Le manifeste des drapeaux lu du fichier de public/geo. */
const lireDrapeaux = () => chargerDrapeaux(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
// Les capitales et le manifeste des drapeaux lus une fois, comme après le choix du sujet : la séance les pose.
beforeAll(async () => {
  await lireCapitales();
  await lireDrapeaux();
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
  o: {
    ile?: () => typeof ile | null;
    jouables?: readonly Domaine[];
    charger?: (t: NomTerrain) => Promise<unknown>;
    chargerCapitales?: () => Promise<unknown>;
    chargerDrapeaux?: () => Promise<unknown>;
    chargerCurseur?: () => Promise<unknown>;
    prechargerDrapeaux?: (ids: readonly string[]) => void;
    /** Un monde à soi (les mers : sa couche posée par chargerMers), au lieu du monde commun. */
    monde?: DonneesCarte;
    chargerMers?: () => Promise<unknown>;
    /** Le lieu retenu d'un sujet (D58 b, apprendre-lieu.ts lirePrefere). */
    prefere?: (sujet: Domaine) => string | null;
  } = {},
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
  const seances = creerSeances({ memoire, monde: o.monde ?? monde, hasard: graine(3),
    ...(o.chargerMers ? { chargerMers: o.chargerMers } : {}), ...(o.ile ? { ile: o.ile } : {}), ...(o.jouables ? { jouables: o.jouables } : {}), ...(o.charger ? { charger: o.charger } : {}),
    ...(o.chargerCapitales ? { chargerCapitales: o.chargerCapitales } : {}),
    ...(o.chargerDrapeaux ? { chargerDrapeaux: o.chargerDrapeaux } : {}),
    ...(o.chargerCurseur ? { chargerCurseur: o.chargerCurseur } : {}),
    ...(o.prechargerDrapeaux ? { prechargerDrapeaux: o.prechargerDrapeaux } : {}),
    ...(o.prefere ? { prefere: o.prefere } : {}),
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
    expect(m.seances.libre(sous('inconnu', 'Europe'), monde_)).toBeNull();
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

  it('des fiches voisins: au journal (J4, lot 2) : comptées et posées dans la Révision du jour, localiser à plusieurs touchers (forme « voisins »), nommer en Trouver sur la liste de ses voisins (D623 a)', async () => {
    poserVoisins(morceauVoisins, { texteAdmis, estPetite: () => false, statuts: LIBELLE_STATUT });
    try {
      // Les fiches de la première séance (des pays d'Europe de l'Est), recopiées sous voisins: : toutes ont des voisins.
      const { m2, seul } = await journalMixte([{ domaine: 'voisins' }]);
      expect(m2.seances.comptes({ sorte: 'revision' })!.aRevoir).toBeGreaterThan(seul.seances.comptes({ sorte: 'revision' })!.aRevoir);
      const { questions } = jouer(m2.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
      await m2.memoire.ecrire([]);
      // Une réponse écrite par question, dans l'ordre : la fiche de chacune.
      const ecrits = (await m2.depot.tous()).filter((e) => e.ts > T0 + JOUR_MS / 2);
      expect(ecrits.length).toBe(questions.length);
      const v = questions.map((q, k) => [q, ecrits[k]!.fiche] as const).filter(([q]) => (q as { domaine?: string }).domaine === 'voisins');
      const formes = (sens: string) => new Set(v.filter(([, f]) => f.endsWith(`:${sens}`)).map(([q]) => q.forme));
      expect(formes('localiser')).toEqual(new Set(['voisins']));
      expect(formes('nommer')).toEqual(new Set(['trouver']));
      expect(v.every(([q, f]) => f.startsWith(`voisins:${q.id}:`) && q.terrain === 'monde')).toBe(true);
      // Leur rendu : la liste écrite (le Trouver d'une fiche nommer), jamais le pays.
      expect(rendu('voisins', monde).enonce('POL').objet).toEqual({ texte: 'Allemagne, Biélorussie, Lituanie, Russie, Slovaquie, Tchéquie, Ukraine' });
    } finally {
      poserVoisins(null);
    }
  });

  it('des fiches habitants: au journal (J4, lot 3) : comptées et posées dans la Révision du jour, localiser au curseur (forme « curseur », `estime` au journal, rien d’un toucher), nommer en QCM (D623 a)', async () => {
    const fiches = JSON.parse(readFileSync('public/geo/fiches-monde.json', 'utf8')) as FichierMonde;
    const grandeurs = lireGrandeurs(fiches, monde.entites.map((e) => e.pays));
    let charges = 0;
    const chargerCurseur = async () => {
      charges++;
      poserCurseur(morceauCurseur, { estPetite: () => false, grandeurs });
    };
    try {
      // Les fiches de la première séance (des pays d'Europe de l'Est), recopiées sous habitants:.
      const { copies } = await journalMixte([{ domaine: 'habitants' }]);
      const depot = depotMemoire();
      await depot.ajouter(copies);
      const m = await monter(depot, { chargerCurseur });
      m.h.ts += JOUR_MS;
      const d = { sorte: 'revision' } as const;
      // Le morceau du curseur et les chiffres, demandés avant la séance (comme les capitales), une fois.
      expect(m.seances.besoins(d)).toContain('habitants');
      expect(curseurCharge()).toBeNull();
      await m.seances.charger!(d);
      expect(charges).toBe(1);
      expect(m.seances.charger!(d)).toBeNull();
      const p = m.seances.ouvrir(d) as PiloteSeance;
      const vus: { forme: string; domaine: string; fiche: string }[] = [];
      for (let k = 0; k < 200; k++) {
        const q = p.question();
        if (!q) break;
        // Le curseur : une valeur validée, pas un toucher (la vue écrit `estime`, ni reponse, ni via, ni zoom, ni distance).
        const r: ReponseJouee =
          q.forme === 'curseur'
            ? { id: q.id, sens: 'localiser', correct: false, aide: null, reponse: null, via: null, zoom: 1, distance_km: null, duree_ms: 4000, estime: 38_000_000 }
            : juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer');
        p.repondre(r);
        vus.push({ forme: q.forme, domaine: q.domaine ?? 'pays', fiche: '' });
      }
      await m.memoire.ecrire([]);
      const tous = (await m.depot.tous()).filter((e) => e.ts > T0 + JOUR_MS / 2);
      expect(tous.length).toBe(vus.length);
      tous.forEach((e, k) => (vus[k]!.fiche = e.fiche));
      // Les habitants (la grappe de pays nouvelle du journal sans pays vient après eux) : chacun sous son domaine.
      expect(vus.filter((v) => v.domaine === 'habitants').every((v) => v.fiche.startsWith('habitants:'))).toBe(true);
      const ecrits = tous.filter((e) => e.fiche.startsWith('habitants:'));
      expect(ecrits.length).toBeGreaterThan(0);
      const h = vus.filter((v) => v.domaine === 'habitants');
      const formes = (sens: string) => new Set(h.filter((v) => v.fiche.endsWith(`:${sens}`)).map((v) => v.forme));
      expect(formes('localiser')).toEqual(new Set(['curseur']));
      expect(formes('nommer')).toEqual(new Set(['qcm']));
      const auCurseur = ecrits.filter((e) => e.fiche.endsWith(':localiser'));
      expect(auCurseur.length).toBeGreaterThan(0);
      for (const e of auCurseur) expect([e.estime, e.reponse, e.via, e.zoom, e.distance_km, e.correct]).toEqual([38_000_000, null, null, null, null, false]);
      // Faux : Again à la première réponse de chaque fiche, ses reprises en fin de séance sans note (une note par jour).
      const premieres = new Map<string, number | null | undefined>();
      for (const e of auCurseur) if (!premieres.has(e.fiche)) premieres.set(e.fiche, e.note);
      expect(new Set(premieres.values())).toEqual(new Set([1]));
      // Le QCM noté (une révision), pas comme celui d'Apprendre ; sans `estime`.
      for (const e of ecrits.filter((x) => x.fiche.endsWith(':nommer'))) {
        expect(e.note).not.toBeNull();
        expect(e).not.toHaveProperty('estime');
      }
    } finally {
      poserCurseur(null);
    }
  });

  it('des fiches villes:, fleuves: et departements: au journal (lues dès le socle commun des J4, J5 et J6) : ni comptées, ni posées, ni teintées tant que leur domaine n’est pas jouable', async () => {
    const qid = (id: string) => `Q${id.charCodeAt(0)}${id.charCodeAt(1)}`;
    const fleuve = (id: string) => `f${id.toLowerCase()}`;
    const insee = (id: string) => String(id.charCodeAt(0) + id.charCodeAt(2));
    // Les voisins (lot 2 du J4), puis les habitants (lot 3), jouables, ont laissé leur place d'exemple aux villes.
    const { m2, seul, copies } = await journalMixte([{ domaine: 'villes', ent: qid }, { domaine: 'fleuves', ent: fleuve }, { domaine: 'departements', ent: insee }]);
    // Lues : dans l'état, intactes.
    const notees = copies.filter((e) => e.note !== null);
    expect(notees.length).toBeGreaterThan(0);
    expect(notees.every((e) => m2.memoire.etat().has(e.fiche))).toBe(true);
    // Comptées comme sans elles.
    for (const d of [{ sorte: 'revision' as const }, { sorte: 'apprendre' as const, sujet: 'pays', serie: serie('tous') }]) expect(m2.seances.comptes(d)).toEqual(seul.seances.comptes(d));
    for (const sujet of ['villes', 'fleuves', 'departements']) {
      expect(m2.seances.comptes({ sorte: 'apprendre', sujet, serie: serie('tous') })).toEqual({ aRevoir: 0, nouveaux: 0 });
      expect(m2.seances.ouvrir({ sorte: 'apprendre', sujet, serie: serie('tous') })).toEqual({ refus: S.rien, reviser: 0 });
    }
    // Posées : aucune de leurs fiches en Révision du jour.
    const { questions } = jouer(m2.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.some((q) => ['villes', 'fleuves', 'departements'].includes((q as { domaine?: string }).domaine ?? ''))).toBe(false);
    expect(questions.every((q) => q.terrain === 'monde')).toBe(true);
    await m2.memoire.ecrire([]);
    const ecrits = (await m2.depot.tous()).filter((e) => e.ts > T0 + JOUR_MS / 2);
    expect(ecrits.length).toBe(questions.length);
    expect(ecrits.some((e) => /^(villes|fleuves|departements):/.test(e.fiche))).toBe(false);
    // Teintées : ni le choix du sujet de la carte de la mémoire ni ses teintes ne les prennent.
    const carte = carteMemoire(m2.memoire, () => true);
    expect(carte.sujets('monde').some((d) => ['villes', 'fleuves'].includes(d))).toBe(false);
    expect([...(carte.teintes('monde') ?? new Map()).keys()].some((id) => /^(Q\d|f[a-z]|\d)/.test(id))).toBe(false);
    // Sur les terrains du J6 : aucun sujet, aucune teinte.
    for (const t of ['departements', 'regions'] as const) {
      expect(carte.sujets(t)).toEqual([]);
      expect(carte.sujet(t)).toBeNull();
    }
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

  /** Le texte du bilan ; `el` : y faire le bilan, `fiche` : l'action d'une erreur touchée (#34, lot F6). */
  const bilan = (p: PiloteSeance, el = new El('div'), fiche?: (terrain: string, id: string) => void) => {
    p.terminer();
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn(), ...(fiche ? { fiche } : {}) });
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
  async function bilanMixte(el?: El, fiche?: (terrain: string, id: string) => void) {
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
    return { texte: bilan(p, el, fiche), ids, rate };
  }

  it('pays et communes dans la même séance : chaque lieu nommé par le rendu de son domaine, sur les données de son terrain', async () => {
    const { texte, ids, rate } = await bilanMixte();
    for (const id of ids.monde) expect(texte).toContain(monde.noms[id]!);
    for (const id of ids.reunion) expect(texte).toContain(ile.noms[id]!);
    expect(texte).toContain(remplir(textes.sujets.communes.rate_km, { nom: ile.noms[rate]!, km: '300\u00a0km' }));
    sansBrut(texte, [...ids.monde, ...ids.reunion]);
  });

  it('une erreur est un bouton qui ouvre la fiche de son lieu, sur le terrain de son bloc (une commune sur l’île) ; « Nouveaux : … » reste du texte (#34, lot F6)', async () => {
    const el = new El('div');
    const fiches: string[] = [];
    const { rate } = await bilanMixte(el, (terrain, id) => void fiches.push(`${terrain}:${id}`));
    const boutons = el.querySelectorAll('.essai-rates li button.ligne-fiche');
    expect(boutons.map((b) => b.dataset.id)).toEqual([rate]);
    const texte = boutons[0]!.querySelector('.ligne-fiche-texte')!.textContent;
    expect(texte).toBe(remplir(textes.sujets.communes.rate_km, { nom: ile.noms[rate]!, km: '300\u00a0km' }));
    expect(boutons[0]!.getAttribute('aria-label')).toBe(remplir(textes.bilan.fiche_ligne, { nom: ile.noms[rate]!, texte }));
    boutons[0]!.click();
    expect(fiches).toEqual([`reunion:${rate}`]);
    // Les nouveaux ne sont pas des erreurs : aucune ligne touchable hors de la liste des ratés.
    expect(el.querySelectorAll('.seance-resume button')).toHaveLength(0);
    expect(el.querySelectorAll('.ligne-fiche')).toHaveLength(1);
  });

  it('sans l’action « fiche » (ctx.ouvrirFiche absent), les erreurs restent des lignes de texte', async () => {
    const el = new El('div');
    await bilanMixte(el);
    expect(el.querySelectorAll('.essai-rates li')).toHaveLength(1);
    expect(el.querySelectorAll('.ligne-fiche')).toHaveLength(0);
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

  it('Apprendre Capitales hors ligne : le refus dit les données du sujet, pas la carte de l’île', async () => {
    const m = await monter(undefined, { chargerCapitales: () => Promise.reject(new Error('hors ligne')) });
    const d = { sorte: 'apprendre' as const, sujet: 'capitales', serie: serie('Europe') };
    await m.seances.charger!(d);
    expect(m.seances.ouvrir(d)).toEqual({ refus: textes.toucher.echec_sujet, reviser: 0 });
    // Les communes sans l'île : son message, comme avant.
    const reunion = { sorte: 'apprendre' as const, sujet: 'communes', serie: serie('reunion') };
    expect(m.seances.ouvrir(reunion)).toEqual({ refus: textes.toucher.echec_terrain, reviser: 0 });
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

// Le sujet Drapeaux (lot 2) : Apprendre écrit drapeaux:, les grappes sont
// celles des pays, le conseil des pays pas appris, le bilan « Bénin : drapeau
// oublié », le préchargement des drapeaux de la séance ; le manifeste pas
// encore lu (page neuve), hors ligne compris.
describe('séance : le sujet Drapeaux (lot 2)', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());
  const grappes = grappesPays(monde.entites.map((e) => e.pays));
  const noter = (m: Awaited<ReturnType<typeof monter>>, fiches: string[], ts: number, note: 1 | 3 = 3) =>
    m.memoire.ecrire(fiches.map((f) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, f, 'rappel', { correct: note > 1, duree_ms: 1000 }, note)));

  it('Apprendre Drapeaux écrit drapeaux: seulement, sur la grappe des pays de la série ; le bilan nomme les pays, jamais un id', async () => {
    const m = await monter();
    const europe = grappes.find((g) => g.continent === 'Europe')!;
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'drapeaux', serie: serie('Europe') }) as PiloteSeance;
    const { questions } = jouer(p, { rate: europe.membres[0] });
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q) => (q as { domaine?: string }).domaine === 'drapeaux' && (q.terrain ?? 'monde') === 'monde')).toBe(true);
    // Les grappes des drapeaux sont celles des pays, telles quelles : la première d'Europe.
    expect(new Set(questions.map((q) => q.id))).toEqual(new Set(europe.membres));
    await m.memoire.ecrire([]);
    const evts = await m.depot.tous();
    expect(evts.length).toBe(questions.length);
    expect(evts.every((e) => e.fiche.startsWith('drapeaux:'))).toBe(true);
    p.terminer();
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    const txt = el.innerText;
    const nouveaux = /Nouveaux : ([^\n]+?)(Les pays|$)/.exec(txt)?.[1] ?? '';
    expect(nouveaux.split(', ').sort()).toEqual(europe.membres.map((id) => monde.noms[id]).sort());
    expect(txt).toContain(`${monde.noms[europe.membres[0]!]} : touché à 300`);
    sansBrut(txt, [...questions.map((q) => q.id)]);
  });

  it('carte retournée oubliée : « Bénin : drapeau oublié » au bilan de la Révision du jour', async () => {
    const m = await monter();
    await noter(m, ['drapeaux:BEN:localiser'], T0 - JOUR_MS);
    const p = m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    for (let q = p.question(); q; q = p.question()) p.repondre(q.forme === 'retournee' && q.id === 'BEN' ? faux(q.id, 'nommer') : juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    p.terminer();
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    expect(el.innerText).toContain('Bénin : drapeau oublié');
  });

  it('D39 b : le conseil des pays pas appris à l’ouverture d’Apprendre Drapeaux ; aucun une fois les pays de la grappe appris', async () => {
    const m = await monter();
    const p = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'drapeaux', serie: serie('Africa') }) as PiloteSeance;
    expect(p.conseil).toBe(remplir(textes.sujets.pays.conseil, { chemin: 'Pays › Afrique › Apprendre' }));
    const m2 = await monter();
    await noter(m2, grappes.find((g) => g.continent === 'Africa')!.membres.map((id) => `pays:${id}:localiser`), T0 - JOUR_MS);
    expect((m2.seances.ouvrir({ sorte: 'apprendre', sujet: 'drapeaux', serie: serie('Africa') }) as PiloteSeance).conseil).toBeNull();
  });

  it('préchargement : les drapeaux des questions de la séance demandés à son ouverture, une fois ; rien pour une séance sans drapeaux', async () => {
    const demandes: string[][] = [];
    const m = await monter(undefined, { prechargerDrapeaux: (ids) => void demandes.push([...ids]) });
    m.seances.ouvrir({ sorte: 'apprendre', sujet: 'drapeaux', serie: serie('Europe') });
    expect(demandes).toEqual([grappes.find((g) => g.continent === 'Europe')!.membres]);
    // La Révision du jour du lendemain : les drapeaux dus et à introduire, mêlés aux pays dans le bloc du monde.
    const m2 = await monter(undefined, { prechargerDrapeaux: (ids) => void demandes.push([...ids]) });
    await noter(m2, ['drapeaux:BEN:localiser', 'drapeaux:TGO:localiser', 'pays:FRA:localiser'], T0 - JOUR_MS, 1);
    demandes.length = 0;
    m2.seances.ouvrir({ sorte: 'revision' });
    expect(demandes).toHaveLength(1);
    expect([...demandes[0]!].sort()).toEqual(['BEN', 'TGO']);
    // Une Révision du jour qui n'a que des introductions (drapeaux:X:nommer, « Reconnaître » en carte retournée) : leurs drapeaux aussi.
    const m4 = await monter(undefined, { prechargerDrapeaux: (ids) => void demandes.push([...ids]) });
    await noter(m4, ['drapeaux:BEN:localiser', 'drapeaux:TGO:localiser'], T0 - JOUR_MS);
    demandes.length = 0;
    const p4 = m4.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance;
    expect(demandes).toHaveLength(1);
    expect([...demandes[0]!].sort()).toEqual(['BEN', 'TGO']);
    // Les drapeaux n'y sont que deux cartes retournées (le reste : la grappe de pays suivante, sans drapeau).
    const sous = jouer(p4).questions.filter((q) => (q as { domaine?: string }).domaine === 'drapeaux');
    expect(sous.map(cle)).toEqual(['monde:retournee:BEN', 'monde:retournee:TGO']);
    // Des pays seuls : rien.
    const m3 = await monter(undefined, { prechargerDrapeaux: (ids) => void demandes.push([...ids]) });
    demandes.length = 0;
    m3.seances.ouvrir({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') });
    expect(demandes).toEqual([]);
  });

  it('préchargement par défaut (D38 a, décision « Drapeaux contestés et sosies ») : tous les drapeaux justes de chaque pays, l’Afghanistan et la Bolivie compris, puisque l’énoncé de Trouver tire le sien à sa pose', async () => {
    // Une page neuve (aucune adresse déjà demandée), dont les images préchargées sont notées.
    oublierDrapeaux();
    await lireDrapeaux();
    const precharges: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(a: string) {
          precharges.push(a);
        }
      },
    );
    const m = await monter();
    await noter(m, ['AFG', 'BOL', 'FRA'].map((id) => `drapeaux:${id}:localiser`), T0 - JOUR_MS, 1);
    m.seances.ouvrir({ sorte: 'revision' });
    const justes = (id: string) => drapeauxCharges()!.parPays.get(id)!.justes;
    expect(justes('AFG')).toHaveLength(2);
    expect(justes('BOL')).toHaveLength(2);
    expect([...precharges].sort()).toEqual(['AFG', 'BOL', 'FRA'].flatMap(justes).sort());
  });

  it('plafond commun des 15 introductions (D46 d) tenu avec trois sujets du monde : pays, capitales et drapeaux mêlés, puis les communes', async () => {
    const m = await monter(undefined, { ile: () => ile });
    const idsCommunes = ile.entites.map((e) => e.pays.id);
    await noter(m, idsCommunes.slice(0, 4).map((id) => `communes:${id}:localiser`), T0 - 2 * JOUR_MS);
    const monde10 = grappes.flatMap((g) => g.membres).filter((id) => !['DJI', 'GTM', 'KWT', 'LUX', 'MCO', 'PAN', 'SGP', 'SMR', 'VAT'].includes(id)).slice(0, 10);
    await noter(m, monde10.map((id) => `drapeaux:${id}:localiser`), T0 - 2 * JOUR_MS);
    await noter(m, [...monde10.map((id) => `pays:${id}:localiser`), ...monde10.map((id) => `capitales:${id}:localiser`)], T0 - JOUR_MS);
    // 4 + 10 + 20 = 34 fiches « Reconnaître » à introduire : 15 aujourd'hui, les plus anciennes d'abord.
    expect(m.seances.comptes()?.aRevoir).toBe(INTRODUCTIONS_PAR_JOUR);
    const qs = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions.filter((q) => q.forme === 'retournee') as { terrain?: string; domaine?: string }[];
    expect(qs).toHaveLength(INTRODUCTIONS_PAR_JOUR);
    expect(qs.filter((q) => q.terrain === 'reunion')).toHaveLength(4);
    expect(qs.filter((q) => q.domaine === 'drapeaux')).toHaveLength(10);
    expect(qs.filter((q) => q.terrain === 'monde' && q.domaine !== 'drapeaux').map((q) => q.domaine)).toEqual(Array(1).fill('pays'));
  });
});

describe('séance : le manifeste des drapeaux pas encore lu (lot 2)', () => {
  beforeEach(() => {
    installerDom();
    oublierDrapeaux();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await lireDrapeaux();
  });
  const noter = (m: Awaited<ReturnType<typeof monter>>, fiches: string[], ts: number) =>
    m.memoire.ecrire(fiches.map((f) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, f, 'rappel', { correct: true, duree_ms: 1000 }, 3)));
  const drapeauxDe = (p: PiloteSeance) => (jouer(p).questions as { id: string; domaine?: string }[]).filter((q) => q.domaine === 'drapeaux').map((q) => q.id);

  it('Révision du jour avec des drapeaux à introduire : besoins() les demande, charger() lit le manifeste, puis la séance les pose', async () => {
    const lecteur = vi.fn(lireDrapeaux);
    const m = await monter(undefined, { chargerDrapeaux: lecteur });
    await noter(m, ['BEL', 'FRA'].map((id) => `drapeaux:${id}:localiser`), T0 - JOUR_MS);
    expect(m.seances.besoins({ sorte: 'revision' })).toEqual(['drapeaux']);
    expect(m.seances.besoins({ sorte: 'apprendre', sujet: 'drapeaux', serie: serie('Europe') })).toEqual(['drapeaux']);
    await m.seances.charger!({ sorte: 'revision' });
    expect(lecteur).toHaveBeenCalledTimes(1);
    expect(m.seances.charger!({ sorte: 'revision' })).toBeNull();
    expect(drapeauxDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).sort()).toEqual(['BEL', 'FRA']);
  });

  it('hors ligne : la séance s’ouvre sans les drapeaux (ils restent à introduire) ; Apprendre Drapeaux dit les données du sujet', async () => {
    const m = await monter(undefined, { chargerDrapeaux: () => Promise.reject(new Error('hors ligne')) });
    await noter(m, ['BEL', 'FRA'].map((id) => `drapeaux:${id}:localiser`), T0 - JOUR_MS);
    await expect(m.seances.charger!({ sorte: 'revision' })).resolves.toBeDefined();
    expect(drapeauxDe(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance)).toEqual([]);
    expect(m.seances.comptes()?.aRevoir).toBe(2);
    const d = { sorte: 'apprendre' as const, sujet: 'drapeaux', serie: serie('Europe') };
    await m.seances.charger!(d);
    expect(m.seances.ouvrir(d)).toEqual({ refus: textes.toucher.echec_sujet, reviser: 0 });
  });

  it('page rouverte en pleine grappe de drapeaux, manifeste pas encore lu : incertaine, chargée en fond', async () => {
    await lireDrapeaux();
    const depot = depotMemoire();
    const m = await monter(depot);
    const a = m.seances.ouvrir({ sorte: 'apprendre', sujet: 'drapeaux', serie: serie('Europe') }) as PiloteSeance;
    let rappels = 0;
    for (let q = a.question(); q && rappels < 2; q = a.question()) {
      if (q.forme === 'trouver') rappels++;
      a.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    a.terminer();
    await m.memoire.ecrire([]);
    const avec = m.seances.comptes();
    oublierDrapeaux();
    const m2 = await monter(depot, { chargerDrapeaux: lireDrapeaux });
    expect(m2.seances.incertains()).toEqual(['drapeaux']);
    await m2.seances.completer();
    expect(m2.seances.incertains()).toEqual([]);
    expect(m2.seances.comptes()).toEqual(avec);
  });
});

// Le sujet Océans et mers (lot 3b, partie A ; étude J2 § 6.1 et 6.3) : ses
// grappes (les océans d'abord, puis les mers par bassin), la couche marine
// lue et posée sur le monde avant la séance, des fiches mers: seulement, le
// bilan par les noms des mers ; ses grappes nouvelles s'ouvrent par Apprendre
// seul (défaut D46 b), aucun prérequis (D39 : rien pour les mers), et le
// plafond commun des introductions tient avec quatre sujets du monde.
describe('séance : le sujet Océans et mers (lot 3b)', () => {
  beforeEach(() => {
    installerDom();
    oublierMers(async (f) => readFileSync(`public/geo/${f}`, 'utf8'));
  });
  afterEach(() => {
    oublierMers();
    vi.unstubAllGlobals();
  });
  const grappes = grappesPays(monde.entites.map((e) => e.pays));
  const noter = (m: Awaited<ReturnType<typeof monter>>, fiches: string[], ts: number, note: 1 | 3 = 3) =>
    m.memoire.ecrire(fiches.map((f) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, f, 'rappel', { correct: note > 1, duree_ms: 1000 }, note)));
  /** Un monde à soi, sans mers, et le chargeur de main.ts : la couche lue (mers.ts), puis posée (donnees.mers). */
  function avecMers(depot?: Depot) {
    const d: DonneesCarte = { ...monde, mers: [] };
    const chargeur = vi.fn(async () => {
      d.mers = (await chargerMers()).mers;
    });
    return { d, chargeur, m: monter(depot, { monde: d, chargerMers: chargeur }) };
  }
  const APPRENDRE = { sorte: 'apprendre' as const, sujet: 'mers', serie: serieMers() };

  it('Apprendre Océans et mers : la couche lue et posée avant (besoins, charger), puis la grappe « Océans » ; mers: seulement ; le bilan par les noms', async () => {
    const { d, chargeur, m: mp } = avecMers();
    const m = await mp;
    expect(m.seances.besoins(APPRENDRE)).toEqual(['mers']);
    // Sans la couche : le message des données du sujet, jamais une séance à vide.
    expect(m.seances.ouvrir(APPRENDRE)).toEqual({ refus: textes.toucher.echec_sujet, reviser: 0 });
    await m.seances.charger!(APPRENDRE);
    expect(chargeur).toHaveBeenCalledTimes(1);
    expect(d.mers).toHaveLength(50);
    expect(m.seances.charger!(APPRENDRE)).toBeNull();
    const p = m.seances.ouvrir(APPRENDRE) as PiloteSeance;
    // Aucun prérequis (D39) : pas de conseil.
    expect(p.conseil).toBeNull();
    const oceans = grappesMers(d.mers.map((e) => e.pays))[0]!;
    expect(oceans.id).toBe(GRAPPE_OCEANS);
    const premiere = p.question()!;
    expect(premiere.forme).toBe('qcm');
    // Le rappel des océans cadré sur l'union de leurs emprises.
    expect(premiere.cadrer).not.toBeNull();
    const { questions } = jouer(p, { rate: 'indien' });
    expect(questions.every((q) => (q as { domaine?: string }).domaine === 'mers' && (q.terrain ?? 'monde') === 'monde')).toBe(true);
    expect(new Set(questions.map((q) => q.id))).toEqual(new Set(['atlant', 'pacif', 'indien', 'arctique', 'austral']));
    await m.memoire.ecrire([]);
    const evts = await m.depot.tous();
    expect(evts.length).toBe(questions.length);
    expect(evts.every((e) => e.fiche.startsWith('mers:'))).toBe(true);
    p.terminer();
    const el = new El('div');
    p.bilan(el as never, { continuer: vi.fn(), carte: vi.fn(), autre: vi.fn() });
    const txt = el.innerText;
    expect(txt).toContain('Apprendre · Océans et mers');
    expect(txt).toContain('océan Atlantique');
    // Sans accord (18 des 50 zones sont masculines : les océans, les golfes, le canal du Mozambique).
    expect(txt).toMatch(/océan Indien : à 300\s?km du bord/);
    expect(txt).not.toMatch(/touchée|vue ou passée/);
    sansBrut(txt, IDS_MERS);
    // La grappe du jour faite : la suivante demain (une grappe de mers par jour, à part de celle des pays).
    expect((m.seances.ouvrir(APPRENDRE) as RefusSeance).refus).toBe(S.grappe_faite);
    expect(m.seances.comptes({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') })?.nouveaux).toBeGreaterThan(0);
  });

  it('D46 b : la Révision du jour n’ouvre jamais une grappe de mers (celle des pays seule) ; elle reprend celle qu’Apprendre a entamée', async () => {
    const { m: mp } = avecMers();
    const m = await mp;
    await m.seances.charger!(APPRENDRE);
    const vierge = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions as { domaine?: string }[];
    expect(vierge.length).toBeGreaterThan(0);
    expect(vierge.every((q) => q.domaine === 'pays')).toBe(true);
    const { m: mp2 } = avecMers();
    const m2 = await mp2;
    await m2.seances.charger!(APPRENDRE);
    const a = m2.seances.ouvrir(APPRENDRE) as PiloteSeance;
    // Quittée après le QCM et un rappel : la grappe des océans entamée.
    let rappels = 0;
    for (let q = a.question(); q && rappels < 1; q = a.question()) {
      if (q.forme === 'trouver') rappels++;
      a.repondre(juste(q.id, q.forme === 'trouver' ? 'localiser' : 'nommer'));
    }
    a.terminer();
    const qs = jouer(m2.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions as { id: string; domaine?: string }[];
    const mers = qs.filter((q) => q.domaine === 'mers').map((q) => q.id);
    expect(mers.length).toBeGreaterThan(0);
    for (const id of mers) expect(['atlant', 'pacif', 'indien', 'arctique', 'austral']).toContain(id);
  });

  it('le lendemain : la Révision du jour charge la couche (besoins), pose les cartes retournées des mers ; plafond commun des 15 introductions tenu avec quatre sujets du monde', async () => {
    const { chargeur, m: mp } = avecMers();
    const m = await mp;
    const monde6 = grappes.flatMap((g) => g.membres).filter((id) => !['DJI', 'GTM', 'KWT', 'LUX', 'MCO', 'PAN', 'SGP', 'SMR', 'VAT'].includes(id)).slice(0, 6);
    await noter(m, [...['atlant', 'pacif', 'indien', 'arctique', 'austral'].map((id) => `mers:${id}:localiser`), ...monde6.map((id) => `drapeaux:${id}:localiser`)], T0 - 2 * JOUR_MS);
    await noter(m, ['pays', 'capitales'].flatMap((d) => monde6.map((id) => `${d}:${id}:localiser`)), T0 - JOUR_MS);
    expect(m.seances.besoins({ sorte: 'revision' })).toContain('mers');
    await m.seances.charger!({ sorte: 'revision' });
    expect(chargeur).toHaveBeenCalledTimes(1);
    // 5 + 6 + 12 = 23 fiches « Reconnaître » à introduire : 15 aujourd'hui, les plus anciennes (océans et drapeaux) d'abord.
    expect(m.seances.comptes()?.aRevoir).toBe(INTRODUCTIONS_PAR_JOUR);
    const qs = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions.filter((q) => q.forme === 'retournee') as { id: string; domaine?: string }[];
    expect(qs).toHaveLength(INTRODUCTIONS_PAR_JOUR);
    expect(qs.filter((q) => q.domaine === 'mers').map((q) => q.id).sort()).toEqual(['arctique', 'atlant', 'austral', 'indien', 'pacif']);
    expect(qs.filter((q) => q.domaine === 'drapeaux')).toHaveLength(6);
    expect(qs.filter((q) => q.domaine === 'pays' || q.domaine === 'capitales')).toHaveLength(4);
    // Le reliquat (8) attend demain : plus rien à revoir aujourd'hui.
    expect(m.seances.comptes()?.aRevoir).toBe(0);
  });

  it('hors ligne : la Révision du jour s’ouvre sans les mers (elles restent à introduire), sans lever', async () => {
    const d: DonneesCarte = { ...monde, mers: [] };
    const m = await monter(undefined, { monde: d, chargerMers: () => Promise.reject(new Error('hors ligne')) });
    await noter(m, ['atlant', 'pacif'].map((id) => `mers:${id}:localiser`), T0 - JOUR_MS);
    await expect(m.seances.charger!({ sorte: 'revision' })).resolves.toBeDefined();
    const qs = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance).questions as { domaine?: string }[];
    expect(qs.some((q) => q.domaine === 'mers')).toBe(false);
    expect(m.seances.comptes()?.aRevoir).toBe(2);
  });
});

// « Apprendre ce lieu » (#34, lot F7, étude fiche-lieu § 5 et § 7 « Mémoire ») : l'état du bouton lu dans
// comptes() (le refus partagé avec ouvrir()), le lancement par lancer() (apprendre-lieu.ts, comme main.ts), et
// le lieu retenu sur l'appareil quand la grappe du jour est prise (D58 b, § 5.6).
describe('séance : « Apprendre ce lieu » depuis la fiche (#34, lot F7)', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());
  const gs = grappesPays(monde.entites.map((e) => e.pays));
  const deMaurice = gs.find((g) => g.membres.includes('MUS'))!;
  const afriqueGs = gs.filter((g) => g.continent === 'Africa');
  const entites = new Map(monde.entites.map((e) => [e.pays.id, e.pays]));
  const AFRIQUE = { sorte: 'apprendre' as const, sujet: 'pays', serie: serie('Africa') };
  const noter = (m: { memoire: Memoire }, fiches: string[], ts: number, note: 1 | 3 = 3) =>
    m.memoire.ecrire(fiches.map((f) => evenementReponse({ seance: null, appareil: m.memoire.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.memoire.nouvelId() }, f, 'rappel', { correct: note > 1, duree_ms: 1000 }, note)));
  /** Le refus d'une ouverture, ou null pour une séance ouverte. */
  const refusDe = (r: PiloteSeance | RefusSeance) => ('refus' in r ? r : null);

  /** La séance montée comme main.ts : le lieu retenu lu par lirePrefere, la fiche par apprendreLieu, lancer() noté puis ouvert. */
  async function avecFiche(o: Parameters<typeof monter>[1] = {}, memoire?: (m: Memoire) => Pick<Memoire, 'charge' | 'garde' | 'etat'>) {
    const cles = new Map<string, string>();
    const stockage = { getItem: (k: string) => cles.get(k) ?? null, setItem: (k: string, v: string) => void cles.set(k, v), removeItem: (k: string) => void cles.delete(k) };
    let mem: Memoire | null = null;
    const m = await monter(undefined, { ...o, prefere: (sujet) => lirePrefere(stockage, mem!, sujet) });
    mem = m.memoire;
    const lances: { l: Lancement; s: Serie; r: PiloteSeance | RefusSeance }[] = [];
    const a = apprendreLieu({
      memoire: memoire ? memoire(m.memoire) : m.memoire,
      seances: m.seances,
      serie: (sujet, id) => (sujet === 'mers' ? serieMers() : CATALOGUE.find((x) => x.id === id)),
      entite: (id) => entites.get(id),
      stockage: () => stockage,
      // Comme essai.lancer : Apprendre sur la série, le lieu passé à la demande.
      lancer: (l, s) => void lances.push({ l, s, r: m.seances.ouvrir({ sorte: 'apprendre', sujet: l.sujet, serie: s, ...(l.lieu ? { lieu: l.lieu } : {}) }) }),
    });
    return { ...m, a, lances, cles };
  }

  it('critère du lot F7 : journal neuf, la fiche de Maurice lance sa grappe (8e sur 8 de l’Afrique) ; nom seul (pays:) ; le lendemain, plus de bouton ; grappe faite : le texte, pas de séance', async () => {
    expect([afriqueGs.length, afriqueGs.indexOf(deMaurice) + 1]).toEqual([8, 8]);
    const m = await avecFiche();
    expect(m.a.etat('monde', 'MUS')).toEqual({ sujet: 'pays', lieu: { etat: 'possible', voisins: deMaurice.membres.length - 1, revisions: 0 }, retenu: false, garde: true });
    m.a.lancer('monde', 'MUS');
    expect(m.lances).toHaveLength(1);
    expect(m.lances[0]!.l).toEqual({ branche: 'entrainement', sujet: 'pays', serie: 'Africa', mode: 'apprendre', lieu: 'MUS' });
    expect(m.lances[0]!.s).toBe(serie('Africa'));
    const { questions } = jouer(m.lances[0]!.r as PiloteSeance);
    expect(new Set(questions.map((q) => q.id))).toEqual(new Set(deMaurice.membres));
    expect(questions.some((q) => q.id === 'MUS' && q.forme === 'qcm')).toBe(true);
    await m.memoire.ecrire([]);
    const evts = await m.depot.tous();
    // Le pays par son nom seul (D58 a) : des fiches pays:, jamais capitales: ni drapeaux: ; aucun type d'événement nouveau.
    expect(evts.length).toBe(questions.length);
    expect(evts.every((e) => e.fiche.startsWith('pays:') && deMaurice.membres.includes(e.fiche.split(':')[1]!))).toBe(true);
    expect(new Set(evts.map((e) => e.type))).toEqual(new Set(['reponse']));
    // Appris : pas de bouton (la ligne de la mémoire suffit).
    expect(m.a.etat('monde', 'MUS')!.lieu).toEqual({ etat: 'appris' });
    // Un autre pays d'Afrique le même jour : la grappe du jour est prise ; le refus est celui qu'ouvrir() rend, pas de séance.
    const autre = afriqueGs[0]!.membres[0]!;
    expect(m.a.etat('monde', autre)!.lieu).toEqual({ etat: 'attendre', raison: 'grappe_faite' });
    const d = { ...AFRIQUE, lieu: autre };
    expect(m.seances.comptes(d)!.refus).toEqual({ refus: S.grappe_faite, reviser: 0 });
    expect(m.seances.ouvrir(d)).toEqual(m.seances.comptes(d)!.refus);
    // Le lendemain : Maurice appris, toujours pas de bouton ; l'autre pays, après les fiches « Reconnaître » de la grappe de Maurice.
    m.h.ts += JOUR_MS;
    expect(m.a.etat('monde', 'MUS')!.lieu).toEqual({ etat: 'appris' });
    expect(m.a.etat('monde', autre)!.lieu).toEqual({ etat: 'possible', voisins: afriqueGs[0]!.membres.length - 1, revisions: deMaurice.membres.length });
  });

  it('chaque ligne du § 5.4 : son état, et le refus toujours celui d’ouvrir() pour la même demande', async () => {
    const etats: Record<string, ComptesSeance['lieu']> = {};
    const verifier = (m: Awaited<ReturnType<typeof avecFiche>>, lieu: string, nom: string) => {
      const d = { ...AFRIQUE, lieu };
      const c = m.seances.comptes(d)!;
      expect(c.refus, nom).toEqual(refusDe(m.seances.ouvrir(d)));
      etats[nom] = c.lieu;
      return c;
    };
    // Possible, journal neuf.
    verifier(await avecFiche(), 'MUS', 'possible');
    // Une grappe d'Europe commencée aujourd'hui, pas finie : elle passe avant (refus « grappe entamée »).
    const e1 = await avecFiche();
    await noter(e1, gs[0]!.membres.slice(0, 2).map((id) => `pays:${id}:localiser`), T0);
    expect(verifier(e1, 'MUS', 'grappe entamée ailleurs').refus?.finir).toBeGreaterThan(0);
    // Une grappe d'Afrique entamée la veille (deux pays sur six) : elle se finit d'abord, la séance s'ouvre sur elle.
    const e2 = await avecFiche();
    await noter(e2, afriqueGs[0]!.membres.slice(0, 2).map((id) => `pays:${id}:localiser`), T0 - JOUR_MS);
    expect(verifier(e2, 'MUS', 'grappe entamée dans la série').refus).toBeNull();
    // Des révisions dues qui ne tiennent pas dans la séance : la séance les fait d'abord (pas de refus), sans le lieu.
    const autres = gs.flatMap((g) => g.membres).filter((id) => !deMaurice.membres.includes(id));
    const e3 = await avecFiche();
    await noter(e3, autres.slice(0, 30).map((id) => `pays:${id}:localiser`), T0 - JOUR_MS, 1);
    expect(verifier(e3, 'MUS', 'dues').refus).toBeNull();
    // Le plafond du jour atteint (60 révisions faites), des fiches encore dues.
    const e4 = await avecFiche();
    await noter(e4, autres.slice(0, 70).map((id) => `pays:${id}:localiser`), T0 - JOUR_MS, 1);
    await noter(e4, autres.slice(0, 60).map((id) => `pays:${id}:localiser`), T0);
    expect(verifier(e4, 'MUS', 'plafond').refus?.refus).toBe(S.plafond);
    // Le reliquat : 20 pays appris la veille, leurs 20 fiches « Reconnaître » à introduire ; 15 introduites aujourd'hui
    // (le plafond du jour), 5 attendent demain.
    const e5 = await avecFiche();
    await noter(e5, autres.slice(0, 20).map((id) => `pays:${id}:localiser`), T0 - JOUR_MS);
    await noter(e5, autres.slice(0, 15).map((id) => `pays:${id}:nommer`), T0);
    expect(verifier(e5, 'MUS', 'introductions').refus?.refus).toBe(S.introductions);
    // Un territoire : aucune grappe ne le porte.
    verifier(await avecFiche(), 'GRL', 'territoire');
    expect(etats).toEqual({
      possible: { etat: 'possible', voisins: deMaurice.membres.length - 1, revisions: 0 },
      'grappe entamée ailleurs': { etat: 'attendre', raison: 'autre_grappe' },
      'grappe entamée dans la série': { etat: 'attendre', raison: 'autre_grappe' },
      dues: { etat: 'attendre', raison: 'dues' },
      plafond: { etat: 'attendre', raison: 'plafond' },
      introductions: { etat: 'attendre', raison: 'introductions' },
      territoire: { etat: 'sans_grappe' },
    });
  });

  it('pas de mémoire, mémoire en lecture, pas gardée, données pas chargées : rien, le bouton sans compte, l’avis, le chargement', async () => {
    const m = await avecFiche();
    // Territoire, zone contestée, Taïwan et Kosovo (hors des pays jouables), l'Antarctique : ni bloc ni bouton.
    const sansMemoire = monde.entites.map((e) => e.pays).filter((p) => p.statut !== 'jouable');
    expect(sansMemoire.length).toBeGreaterThan(50);
    for (const p of sansMemoire) expect(m.a.etat('monde', p.id), p.id).toBeNull();
    expect(m.seances.comptes({ ...AFRIQUE, lieu: 'GRL' })!.lieu).toEqual({ etat: 'sans_grappe' });
    // La mémoire en lecture : comptes() rend null, le bouton sans compte.
    const lent: Depot = { tous: () => new Promise(() => undefined), ajouter: async () => undefined };
    const memoire = ouvrirMemoire({ depot: lent, appareil: 'a', horloge: () => ({ ts: T0, tz: 240 }) });
    const seances = creerSeances({ memoire, monde });
    const a = apprendreLieu({ memoire, seances, serie: (_s, id) => serie(id), entite: (id) => entites.get(id), stockage: () => null, lancer: vi.fn() });
    expect(a.etat('monde', 'MUS')).toEqual({ sujet: 'pays', lieu: null, retenu: false, garde: true });
    // Un terrain du J6 : aucun sujet à apprendre, pas même un pays au même id.
    expect(a.etat('departements', 'MUS')).toBeNull();
    // Pas gardée : le bouton, et l'avis (garde faux).
    const pg = await avecFiche({}, (mm) => ({ charge: true, garde: false, etat: () => mm.etat() }));
    expect(pg.a.etat('monde', 'MUS')).toMatchObject({ lieu: { etat: 'possible' }, garde: false });
    // Une mer, la couche marine pas posée : le bouton, la séance la chargera ; le refus est celui d'ouvrir().
    const d: DonneesCarte = { ...monde, mers: [] };
    oublierMers(async (f) => readFileSync(`public/geo/${f}`, 'utf8'));
    try {
      const mm = await avecFiche({ monde: d, chargerMers: async () => void (d.mers = (await chargerMers()).mers) });
      const dm = { sorte: 'apprendre' as const, sujet: 'mers', serie: serieMers(), lieu: 'medit' };
      expect(mm.a.etat('monde', 'medit')).toEqual({ sujet: 'mers', lieu: { etat: 'a_charger' }, retenu: false, garde: true });
      expect(mm.seances.comptes(dm)!.refus).toEqual(mm.seances.ouvrir(dm));
      await mm.seances.charger!(dm);
      const e = mm.a.etat('monde', 'medit')!;
      expect(e.lieu?.etat).toBe('possible');
      mm.a.lancer('monde', 'medit');
      expect(mm.lances[0]!.l).toEqual({ branche: 'entrainement', sujet: 'mers', serie: 'mers', mode: 'apprendre', lieu: 'medit' });
      const { questions } = jouer(mm.lances[0]!.r as PiloteSeance);
      const deLaMer = grappesMers(d.mers.map((x) => x.pays)).find((g) => g.membres.includes('medit'))!;
      expect(new Set(questions.map((q) => q.id))).toEqual(new Set(deLaMer.membres));
    } finally {
      oublierMers();
    }
  });

  it('une commune de l’île : Apprendre sous La Réunion, sa grappe à elle (et non la première)', async () => {
    const m = await avecFiche({ ile: () => ile });
    const gc = grappesCommunes(ile.entites.map((e) => e.pays));
    const derniere = gc[gc.length - 1]!;
    const id = derniere.membres[0]!;
    expect(m.a.etat('reunion', id)).toEqual({ sujet: 'communes', lieu: { etat: 'possible', voisins: derniere.membres.length - 1, revisions: 0 }, retenu: false, garde: true });
    m.a.lancer('reunion', id);
    expect(m.lances[0]!.l).toMatchObject({ sujet: 'communes', serie: 'reunion', lieu: id });
    const { questions } = jouer(m.lances[0]!.r as PiloteSeance);
    expect(new Set(questions.map((q) => q.id))).toEqual(new Set(derniere.membres));
    expect(questions.every((q) => q.terrain === 'reunion')).toBe(true);
  });

  it('D58 b : la grappe du jour prise, le lieu retenu (rien au journal) ; le lendemain, sa grappe en tête d’Apprendre et de la Révision du jour ; « Annuler » ; il s’éteint une fois appris', async () => {
    const m = await avecFiche();
    jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    await m.memoire.ecrire([]);
    const ecrits = (await m.depot.tous()).length;
    expect(m.a.etat('monde', 'MUS')).toEqual({ sujet: 'pays', lieu: { etat: 'attendre', raison: 'grappe_faite' }, retenu: false, garde: true });
    m.a.retenir('monde', 'MUS');
    expect([...m.cles]).toEqual([[`${CLE_APPRENDRE}.pays`, 'MUS']]);
    expect(m.a.etat('monde', 'MUS')!.retenu).toBe(true);
    // Le retenu d'un autre lieu du même sujet ne le montre pas ; « Annuler » l'oublie ; « Annuler » d'un autre lieu n'y touche pas.
    expect(m.a.etat('monde', 'MDG')!.retenu).toBe(false);
    m.a.oublier('monde', 'MDG');
    expect(m.cles.size).toBe(1);
    m.a.oublier('monde', 'MUS');
    expect(m.cles.size).toBe(0);
    expect(m.a.etat('monde', 'MUS')!.retenu).toBe(false);
    m.a.retenir('monde', 'MUS');
    await m.memoire.ecrire([]);
    expect((await m.depot.tous()).length).toBe(ecrits);
    // Le lendemain : la ligne de Jouer, Apprendre Afrique (sans lieu) et la Révision du jour prennent sa grappe.
    m.h.ts += JOUR_MS;
    expect(m.seances.comptes({ sorte: 'apprendre', sujet: 'pays', serie: serie('Africa') })!.nouveaux).toBe(deMaurice.membres.length);
    expect(m.seances.comptes()!.nouveaux).toBe(deMaurice.membres.length);
    // Hors de sa série, rien ne change : Apprendre Europe prend sa grappe suivante.
    expect(m.seances.comptes({ sorte: 'apprendre', sujet: 'pays', serie: serie('Europe') })!.nouveaux).not.toBe(0);
    const { questions } = jouer(m.seances.ouvrir({ sorte: 'revision' }) as PiloteSeance);
    expect(new Set(questions.filter((q) => q.forme === 'qcm').map((q) => q.id))).toEqual(new Set(deMaurice.membres));
    // Appris : la préférence s'éteint seule, la clé effacée.
    expect(lirePrefere({ getItem: (k) => m.cles.get(k) ?? null, setItem: () => undefined, removeItem: (k) => void m.cles.delete(k) }, m.memoire, 'pays')).toBeNull();
    expect(m.cles.size).toBe(0);
    expect(m.a.etat('monde', 'MUS')!.lieu).toEqual({ etat: 'appris' });
  });

  it('le lieu n’est jamais gardé dans « Rejouer » (garderDerniere) ; aucun type d’événement nouveau (TYPES du journal et des lots inchangés)', () => {
    const cles = new Map<string, string>();
    garderDerniere({ getItem: (k: string) => cles.get(k) ?? null, setItem: (k: string, v: string) => void cles.set(k, v), removeItem: () => undefined } as never, { branche: 'entrainement', sujet: 'pays', serie: 'Africa', mode: 'apprendre', lieu: 'MUS' });
    expect(JSON.parse([...cles.values()][0]!)).toEqual({ branche: 'entrainement', sujet: 'pays', serie: 'Africa', mode: 'apprendre' });
    expect(readFileSync('src/srs/journal.ts', 'utf8')).toContain("const TYPES: readonly string[] = ['reponse', 'connu', 'reinitialiser'];");
    expect(readFileSync('src/sync/lots.ts', 'utf8')).toContain("const TYPES = ['reponse', 'connu', 'reinitialiser'] as const;");
  });

  it('textes de la fiche : le bouton et sa ligne, au singulier et au pluriel, pour les trois sujets', () => {
    const T = textesFiche;
    expect(T.apprendre).toBe('Apprendre ce lieu');
    expect(remplir(T.apprendre_avec.pays.n, { n: 6 })).toBe('avec 6 pays voisins');
    for (const s of ['pays', 'mers', 'communes'] as const) {
      expect(T.apprendre_avec[s].un).toMatch(/^avec 1 /);
      expect(T.apprendre_avec[s].n).toContain('{n}');
    }
  });
});
