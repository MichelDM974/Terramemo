// Le sujet Silhouettes (J4, lot 1 ; étude docs/etudes/2026-11-25-j4-conception.md, § 6, § 7 ; D600 à D604, D618
// à D623), rendu visible ici (src/visibles.ts remplacé), comme il le sera une fois sa liste relue : Jouer, la
// mémoire, les épreuves, le quiz ; son rendu (jamais le nom avant la réponse) ; ses leurres (jamais deux fois le
// même pays parmi 4) ; Reconnaître et la carte retournée sans zone allumée ; la séance (Apprendre, Révision du
// jour). Ce qu'il est tant qu'il reste caché : tests/silhouettes-cachees.test.ts.
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BORNE_GENERAL, epreuvesDuGeneral, EPREUVES_SUJETS, idEpreuve, sujetOuvert, tailleEpreuve } from '../src/epreuve/chrono';
import { depotMemoire } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import { assembler } from '../src/map/donnees';
import type { Pays } from '../src/map/types';
import { lireNotoriete } from '../src/quiz/donnees';
import { generateurs, generateurSilhouettes, type DonneesGenerateurs } from '../src/quiz/generateurs';
import { DIFFICULTES } from '../src/quiz/types';
import { aSilhouette, DOMAINES_JOUABLES, SANS_SILHOUETTE } from '../src/srs/fiches';
import { PREREQUIS } from '../src/srs/planif';
import { creerArbre, nombreSujet, SUJETS } from '../src/vues/arbre';
import { catalogue } from '../src/vues/cibles';
import { poserContenu, type ContexteVue } from '../src/vues/commun';
import { aideSujet } from '../src/vues/jouer';
import { vueNommer } from '../src/vues/nommer';
import { choix, NB_CHOIX } from '../src/vues/qcm';
import { vueRetournee } from '../src/vues/retournee';
import { creerSeances } from '../src/vues/seance';
import { installer } from '../src/vues/silhouettes';
import { outilsSilhouettes, poserSilhouettes, rendu } from '../src/vues/sujets';
import { textes } from '../src/vues/textes';
import { icone } from '../src/vues/vignettes';
import { ditsPar, El, installerDom } from './dom-factice';

vi.mock('../src/visibles', () => ({ SILHOUETTES_VISIBLES: true }));

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const PAYS = lire('pays.json') as Pays[];
const monde = assembler(lire('monde.topo.json') as Topology<never>, PAYS, lire('contestees.json'), lire('noms.fr.json'));
const NOMS = monde.noms;
const M = installer(lire('silhouettes.json'), outilsSilhouettes());
const SIL = PAYS.filter((p) => p.statut === 'jouable' && aSilhouette(p.id)).map((p) => p.id);
const JOUABLES = PAYS.filter((p) => p.statut === 'jouable').map((p) => p.id);
const T = textes.silhouettes;
const TS = textes.sujets.silhouettes;
const CATALOGUE = catalogue(PAYS);

function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Le morceau posé dès le chargement du fichier : les describe en tirent leur rendu à la collecte.
poserSilhouettes(M);
beforeAll(() => poserSilhouettes(M));
afterAll(() => poserSilhouettes(null));

describe('visibles (une seule constante, src/visibles.ts) : Jouer, la mémoire, les épreuves, le quiz', () => {
  it('un domaine jouable, après les drapeaux (D601 a) ; un sujet de Jouer, ses séries sans les 29 sans silhouette, ses exercices ; Pays en prérequis (D602 a)', () => {
    // Les voisins (lot 2) juste après (décision « Ordre des sujets »).
    expect(DOMAINES_JOUABLES).toEqual(['pays', 'capitales', 'drapeaux', 'silhouettes', 'voisins', 'mers', 'communes']);
    expect(SUJETS.map((s) => s.id)).toEqual(['pays', 'capitales', 'drapeaux', 'silhouettes', 'voisins', 'mers', 'communes']);
    const a = creerArbre(CATALOGUE);
    const series = a.series('silhouettes');
    expect(Object.fromEntries(series.map((s) => [s.id, s.n]))).toEqual({ tous: 166, Africa: 49, 'North America': 16, 'South America': 12, Asia: 45, Europe: 38, Oceania: 6 });
    for (const s of series) expect(s.ids.filter((id) => SANS_SILHOUETTE.has(id)), s.id).toEqual([]);
    expect(a.modes('entrainement', 'silhouettes')).toEqual(['apprendre', 'localiser', 'nommer']);
    expect(a.modes('classe', 'silhouettes')).toEqual(['chrono', 'sansfaute']);
    expect(nombreSujet('silhouettes', series)).toBe('166 silhouettes');
    expect(a.fil({ type: 'exercices', branche: 'entrainement', sujet: 'silhouettes', serie: 'Africa' }).map((x) => x.nom)).toEqual(['Entraînement', 'Silhouettes', 'Afrique']);
    expect(PREREQUIS.silhouettes).toBe('pays');
    // Le « ? » de ses exercices : la question est un dessin, que les lecteurs d'écran ne décrivent pas.
    expect(aideSujet('silhouettes', 'entrainement')).toBe(textes.jouer.visuel_silhouettes);
    expect(aideSujet('silhouettes', 'classe')).toBe(textes.jouer.visuel_silhouettes);
    installerDom();
    expect(icone('silhouettes')).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it('ses épreuves (D603 a) : 7 séries après les drapeaux, chrono:silhouettes:Africa à 49 ; le général monte à 1 887 avec les voisins, la borne des règles', () => {
    expect(sujetOuvert('silhouettes')).toBe(true);
    const sil = EPREUVES_SUJETS.filter((p) => p.sujet === 'silhouettes').map((p) => p.serie);
    expect(sil).toEqual(['tous', 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania']);
    const ordre = [...new Set(EPREUVES_SUJETS.map((p) => p.sujet))];
    expect(ordre).toEqual(['pays', 'capitales', 'drapeaux', 'silhouettes', 'voisins', 'mers', 'communes']);
    expect(idEpreuve('Africa', 'chrono', 'silhouettes')).toBe('chrono:silhouettes:Africa');
    expect(tailleEpreuve('chrono:silhouettes:Africa')).toBe(49);
    expect(tailleEpreuve('sansfaute:silhouettes:tous@s2914')).toBe(166);
    expect(tailleEpreuve('chrono:silhouettes:reunion')).toBeNull();
    expect(epreuvesDuGeneral().reduce((n, e) => n + (tailleEpreuve(e) ?? NaN), 0)).toBe(BORNE_GENERAL);
    expect(BORNE_GENERAL).toBe(1887);
    const regles = readFileSync('firestore.rules', 'utf8');
    expect(regles).toContain(`n == 0 ? d.questions <= ${BORNE_GENERAL} :`);
  });

  it('au quiz (D604 a) : un générateur de plus, dans l’ordre de Jouer, quand ses formes proches sont chargées', () => {
    const d = donneesQuiz();
    expect(generateurs(d).map((g) => g.sujet)).toEqual(['pays', 'silhouettes']);
    expect(generateurs({ ...d, silhouettes: null }).map((g) => g.sujet)).toEqual(['pays']);
  });
});

describe('le rendu des silhouettes (sujets.ts, silhouettes.ts)', () => {
  const r = rendu('silhouettes', monde);

  it('rien ne nomme le pays avant la réponse : l’énoncé et la question montrent son dessin, alt neutre ; les choix, la révélation et la rétroaction le nomment', () => {
    for (const id of SIL) {
      const e = r.enonce(id);
      expect(e.invite).toBe(TS.enonce);
      expect('dessin' in e.objet && e.objet.alt === T.alt, id).toBe(true);
      const q = r.question(id)!;
      expect('dessin' in q && q.alt === T.alt && q.legende === undefined, id).toBe(true);
      expect(JSON.stringify([e, q])).not.toContain(NOMS[id]!);
      expect(r.consigneQcm(id)).toBe('Quel est ce pays ?');
      expect(r.choix(id)).toEqual({ texte: NOMS[id] });
      expect(r.revelation(id)).toEqual({ texte: NOMS[id] });
      expect(r.retro(id)).toBe(NOMS[id]);
      expect(r.qcmPosable(id), id).toBe(true);
    }
    expect(r.visuel).toBe(false);
    expect(r.consigneNommee('FRA')).toBeNull();
    expect(r.imageEnonce('FRA')).toBeNull();
    for (const id of SANS_SILHOUETTE) expect(r.qcmPosable(id), id).toBe(false);
    expect(r.nomBilan('KHM', 'nommer')).toBe('Cambodge');
    expect(remplirOublie('KHM')).toBe('Cambodge : silhouette oubliée');
  });

  it('une erreur (D621 a) : les deux silhouettes nommées, « Tu as choisi : le Laos », « C’était : le Cambodge » ; rien pour la bonne réponse', () => {
    const c = r.comparaison('LAO', 'KHM')!;
    expect(c.map((x) => ('legende' in x ? x.legende : ''))).toEqual(['Tu as choisi : le Laos', "C'était : le Cambodge"]);
    expect(c.every((x) => 'dessin' in x && x.alt === '')).toBe(true);
    expect(r.comparaison('KHM', 'KHM')).toBeNull();
    expect(r.comparaison('XXX', 'KHM')).toBeNull();
  });

  it('dans la page : un SVG nommé « Silhouette à reconnaître » (jamais le pays), ses zones contestées hachurées d’un motif à lui ; caché aux lecteurs d’écran sous une légende', () => {
    installerDom();
    const el = new El('div');
    poserContenu(el as never, r.question('RUS')!);
    const svg = el.querySelector('svg')!;
    expect([svg.getAttribute('role'), svg.getAttribute('aria-label'), svg.getAttribute('class')]).toEqual(['img', T.alt, 'silhouette']);
    expect(ditsPar(el).join(' ')).not.toContain('Russie');
    const motif = svg.querySelector('pattern')!;
    expect(motif.getAttribute('id')).toMatch(/^silhouette-hachures-\d+$/);
    expect(svg.querySelectorAll('path').some((p) => p.getAttribute('fill') === `url(#${motif.getAttribute('id')})`)).toBe(true);
    const autre = new El('div');
    poserContenu(autre as never, r.question('RUS')!);
    expect(autre.querySelector('pattern')!.getAttribute('id')).not.toBe(motif.getAttribute('id'));
    const legende = new El('div');
    poserContenu(legende as never, r.comparaison('LAO', 'KHM')![0]);
    expect(legende.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(legende.innerText).toContain('Tu as choisi : le Laos');
    vi.unstubAllGlobals();
  });
});

describe('qcm : jamais deux fois le même pays ni la même forme parmi 4, jamais un pays sans silhouette', () => {
  const r = rendu('silhouettes', monde);
  const lieux = new Map(PAYS.map((p) => [p.id, p]));

  it('Entraînement (Reconnaître, QCM d’Apprendre) : les voisins, puis les plus proches, parmi les 166', () => {
    for (const id of SIL) {
      for (let s = 1; s <= 3; s++) {
        const c = choix(id, lieux, new Set(JOUABLES), graine(s), { exclus: r.qcmExclus(id), pareils: r.qcmPareils, strategie: r.qcmLeurres(id) });
        expect(new Set(c).size, id).toBe(NB_CHOIX);
        expect(c).toContain(id);
        expect(c.every(aSilhouette), `${id} : ${c.join(',')}`).toBe(true);
      }
    }
  });

  it('au quiz, à chaque difficulté : 4 pays distincts ; au difficile et à l’expert, les formes proches d’abord', () => {
    const g = generateurSilhouettes(donneesQuiz())!;
    for (const d of DIFFICULTES) {
      for (const id of g.lieux(3, 'qcm')) {
        const q = g.question(id, 'qcm', d, graine(7));
        expect(new Set(q.choix).size, `${d} ${id}`).toBe(NB_CHOIX);
        expect(q.choix!.every(aSilhouette), `${d} ${id}`).toBe(true);
        expect(q.choix).toContain(id);
        if (d === 'difficile' || d === 'expert') {
          const proches = M.proches.de(id);
          if (proches.length >= 3) expect(q.choix!.filter((x) => x !== id).every((x) => proches.includes(x)), `${d} ${id}`).toBe(true);
        }
      }
    }
  });
});

describe('quiz : le générateur des silhouettes, à graine fixe (D604 a)', () => {
  it('les 166 au niveau de leur pays ; la même graine, la même question ; jamais d’énoncé nommé ; les 29 jamais posés', () => {
    const d = donneesQuiz();
    const g = generateurSilhouettes(d)!;
    expect(g.sujet).toBe('silhouettes');
    expect(g.lieux(3)).toEqual([...SIL].sort());
    expect(g.lieux(1).every((id) => d.notoriete.pays[id] === 1)).toBe(true);
    expect(g.lieux(1).length).toBeGreaterThan(10);
    expect(g.posable('MCO', 'qcm')).toBe(false);
    expect(g.posable('KHM', 'toucher')).toBe(true);
    const a = g.question('KHM', 'qcm', 'facile', graine(42));
    const b = g.question('KHM', 'qcm', 'facile', graine(42));
    expect(a).toEqual(b);
    expect(a).toMatchObject({ sujet: 'silhouettes', forme: 'qcm', cible: 'KHM', entites: ['KHM'] });
    expect(a.nomme).toBeUndefined();
    expect(g.question('KHM', 'toucher', 'moyen', graine(42))).toMatchObject({ forme: 'toucher', cible: 'KHM' });
    expect(generateurSilhouettes({ ...d, silhouettes: null })).toBeNull();
  });
});

describe('vues : la silhouette dans la barre, aucune zone allumée avant la réponse (D619, D621, D623 a)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function monter() {
    const zone = new El('main');
    const marques: string[] = [];
    const carte = {
      hote: new El('div'),
      transfo: { k: 3 },
      cacherPastilles() {},
      effacerMarques: () => void (marques.length = 0),
      marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
      anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
      anneauEn: (p: [number, number], c: string) => void marques.push(`anneauEn ${p.join(',')}:${c}`),
      montrer: vi.fn(),
      montrerZone: vi.fn(),
      zoomer: vi.fn(),
      cadrer: vi.fn(),
      contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
    };
    const terrain = { nom: 'monde', carte, donnees: monde, jouables: JOUABLES } as never;
    const ctx = { zone, carte, terrains: { montrer() {} } } as unknown as ContexteVue;
    return { zone, carte, marques, terrain, ctx };
  }

  it('Reconnaître : le dessin, quatre noms, rien d’allumé ni de zoom ; faux : la carte vole sur le pays juste, les deux silhouettes nommées', () => {
    const v = monter();
    const n = vueNommer(v.ctx, { bilan: new El('div') as never, actions: (() => new El('div')) as never });
    n.demarrer(v.terrain, 'silhouettes', 'Asie', ['KHM', 'THA']);
    const barre = v.zone.querySelector('#barre-nommer')!;
    const dessin = barre.querySelector('.question-dessin')!;
    expect(dessin.hidden).toBe(false);
    expect(dessin.querySelector('svg')!.getAttribute('aria-label')).toBe(T.alt);
    expect(v.marques).toEqual([]);
    expect(v.carte.montrerZone).not.toHaveBeenCalled();
    // Rien dans la barre ne nomme le Cambodge avant la réponse (les boutons portent quatre noms, dont le sien).
    const boutons = barre.querySelectorAll('.nommer-choix');
    expect(boutons.map((b) => b.textContent).sort()).toEqual(boutons.map((b) => NOMS[b.dataset.id!]).sort());
    const horsBoutons = ditsPar(barre)
      .slice(1)
      .filter((x) => !boutons.some((b) => x === `aria-label=${b.textContent}`));
    expect(horsBoutons.join(' ')).not.toContain('Cambodge');
    const leurre = boutons.find((b) => b.dataset.id !== 'KHM')!;
    leurre.click();
    expect(v.carte.montrerZone).toHaveBeenCalledTimes(1);
    expect(v.carte.montrerZone.mock.calls[0]![0]).toBe('KHM');
    expect(v.marques).toContain('KHM:juste');
    expect(v.marques).toContain(`${leurre.dataset.id}:faux`);
    const comparaison = barre.querySelector('.comparaison')!;
    expect(comparaison.hidden).toBe(false);
    expect(comparaison.querySelectorAll('figure')).toHaveLength(2);
    expect(comparaison.innerText).toContain("C'était : le Cambodge");
    vi.advanceTimersByTime(1800);
    // La suivante : de nouveau rien d'allumé, la comparaison effacée.
    expect(barre.querySelector('.essai-consigne')!.dataset.cible).toBe('THA');
    expect(comparaison.hidden).toBe(true);
    expect(v.marques).toEqual([]);
  });

  it('les pays : la zone s’allume comme avant, sans dessin', () => {
    const v = monter();
    const n = vueNommer(v.ctx, { bilan: new El('div') as never, actions: (() => new El('div')) as never });
    n.demarrer(v.terrain, 'pays', 'Asie', ['KHM']);
    expect(v.zone.querySelector('.question-dessin')!.hidden).toBe(true);
    expect(v.marques).toContain('KHM:choisi');
  });

  it('carte retournée (Révision du jour) : le dessin, rien d’allumé ; « Révéler » donne le nom, puis allume le pays et y vole', () => {
    const v = monter();
    const rt = vueRetournee(v.ctx);
    rt.poser(v.terrain, 'silhouettes', 'KHM', { compte: () => '1 / 1', surReponse: () => '', surFin: () => {}, terminer: () => {} });
    const barre = v.zone.querySelector('#barre-retournee')!;
    expect(barre.querySelector('.question-dessin')!.hidden).toBe(false);
    expect(v.marques).toEqual([]);
    expect(v.carte.montrerZone).not.toHaveBeenCalled();
    expect(ditsPar(barre).join(' ')).not.toContain('Cambodge');
    barre.querySelector('#retournee-reveler')!.click();
    expect(barre.querySelector('.retournee-nom')!.textContent).toBe('Cambodge');
    expect(v.marques).toContain('KHM:choisi');
    expect(v.carte.montrerZone).toHaveBeenCalledTimes(1);
  });
});

describe('séance : Apprendre et la Révision du jour (D623 a)', () => {
  async function monterSeance() {
    const h = { ts: Date.UTC(2026, 10, 9, 8) };
    let n = 0;
    const memoire = ouvrirMemoire({
      depot: depotMemoire(),
      appareil: '00000000-0000-4000-8000-00000000a001',
      horloge: () => ({ ts: h.ts, tz: 240 }),
      nouvelId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    });
    await memoire.pret;
    return { h, memoire, seances: creerSeances({ memoire, monde, hasard: graine(3) }) };
  }

  it('Apprendre Silhouettes en Océanie : ses 6, sans les micro-États ; QCM puis Trouver, écrits silhouettes: ; le lendemain, la Révision du jour les pose en carte retournée et en Trouver', async () => {
    const { h, memoire, seances } = await monterSeance();
    const oceanie = creerArbre(CATALOGUE).serie('silhouettes', 'Oceania')!;
    const p = seances.ouvrir({ sorte: 'apprendre', sujet: 'silhouettes', serie: oceanie });
    if (!('question' in p)) throw new Error(`refus : ${p.refus}`);
    const vus: string[] = [];
    for (let k = 0; k < 60; k++) {
      const q = p.question();
      if (!q) break;
      expect(q.domaine).toBe('silhouettes');
      vus.push(`${q.forme}:${q.id}`);
      p.repondre({ id: q.id, sens: q.forme === 'trouver' ? 'localiser' : 'nommer', correct: true, aide: null, reponse: null, via: 'trace', zoom: 2, distance_km: 0, duree_ms: 1000 });
    }
    const ids = [...new Set(vus.map((x) => x.split(':')[1]!))];
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(ids.every(aSilhouette)).toBe(true);
    expect(vus.filter((x) => x.startsWith('qcm:'))).toHaveLength(ids.length);
    expect(vus.filter((x) => x.startsWith('trouver:'))).toHaveLength(ids.length);
    const fiches = (await memoire.tous()).map((e) => (e.type === 'reponse' ? e.fiche : ''));
    expect(fiches.every((f) => f.startsWith('silhouettes:'))).toBe(true);
    // Le lendemain : les fiches nommer à introduire, en carte retournée (sans zone allumée : la vue, plus haut).
    h.ts += 86_400_000;
    const r = seances.ouvrir({ sorte: 'revision' });
    if (!('question' in r)) throw new Error(`refus : ${r.refus}`);
    const formes = new Set<string>();
    for (let k = 0; k < 60; k++) {
      const q = r.question();
      if (!q) break;
      if (q.domaine === 'silhouettes') formes.add(q.forme);
      r.repondre({ id: q.id, sens: q.forme === 'trouver' ? 'localiser' : 'nommer', correct: true, aide: null, reponse: null, via: 'trace', zoom: 2, distance_km: 0, duree_ms: 1000 });
    }
    expect([...formes].sort()).toEqual(['retournee']);
  });

  it('le morceau pas chargé : besoins() le demande, charger() le charge, et Apprendre attend', async () => {
    poserSilhouettes(null);
    try {
      const { memoire } = await monterSeance();
      let charge = 0;
      const seances = creerSeances({ memoire, monde, chargerSilhouettes: async () => void (charge++, poserSilhouettes(M)) });
      const d = { sorte: 'apprendre' as const, sujet: 'silhouettes', serie: creerArbre(CATALOGUE).serie('silhouettes', 'Africa')! };
      expect(seances.besoins(d)).toEqual(['silhouettes']);
      expect('refus' in seances.ouvrir(d)).toBe(true);
      await seances.charger!(d);
      expect(charge).toBe(1);
      expect(seances.charger!(d)).toBeNull();
      expect('question' in seances.ouvrir(d)).toBe(true);
    } finally {
      poserSilhouettes(M);
    }
  });
});

/** Les données du quiz : les pays et leurs noms, la notoriété, les formes proches ; pas de capitales, drapeaux ni mers. */
function donneesQuiz(): DonneesGenerateurs {
  return { pays: PAYS, noms: NOMS, notoriete: lireNotoriete(lire('notoriete.json')), silhouettes: M.proches };
}

/** « Cambodge : silhouette oubliée » (le bilan d'une carte retournée oubliée). */
function remplirOublie(id: string): string {
  return TS.rate_oublie.replace('{nom}', NOMS[id]!);
}
