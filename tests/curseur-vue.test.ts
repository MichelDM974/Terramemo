// Les Habitants et les Superficies (J4, lot 3 ; étude docs/etudes/2026-11-25-j4-conception.md, § 5 ; D613 à D617) dans
// les vues, sur le DOM factice des tests : le curseur (src/vues/curseur.ts : aria-valuetext, flèches, − et + à ×1,1,
// départ au milieu, la valeur en mots), sa rétroaction (« Nigeria : 238 millions d'habitants (Banque mondiale, 2025) ;
// ta réponse : 150 millions d'habitants, 1,6 fois trop peu : faux » ; Chypre, les deux valeurs citées, D616 a), Trouver
// (essai.ts : `estime` au journal, la carte qui ne répond pas), Reconnaître (le QCM : la valeur dans la barre, aucune
// zone allumée, les leurres à ×3), le Chrono (15 s au curseur, le temps écoulé dit la valeur vraie, le bilan dit la
// valeur répondue). Le vrai morceau du curseur, sur les vraies données du monde ; la carte est factice.
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ECART_LEURRES, ecart, lireGrandeurs, PLAGES, position, valeurEn } from '../src/exercices/grandeurs';
import type { FichierMonde } from '../src/fiches/donnees';
import { assembler } from '../src/map/donnees';
import type { Contestee, Pays } from '../src/map/types';
import { El, installerDom, installerStockage, ditsPar } from './dom-factice';

const blocClassement = vi.fn(() => new El('section'));
vi.mock('../src/vues/classement', () => ({ blocClassement: () => blocClassement(), publierPartie: vi.fn() }));

const { vueEssai } = await import('../src/vues/essai');
const { vueChrono } = await import('../src/vues/chrono');
const { curseurCharge, poserCurseur, rendu } = await import('../src/vues/sujets');
const { textes } = await import('../src/vues/textes');
const { textesGrandeurs: TG } = await import('../src/vues/textes-grandeurs');
const { evenementReponse } = await import('../src/srs/seance');
const { docDuLot, CARACTERES_PAR_EVENEMENT, trier } = await import('../src/sync/lots');
const morceau = await import('../src/vues/curseur');
import type { ReponseJouee } from '../src/vues/essai';
import type { QuestionCurseur, ReponseCurseur } from '../src/vues/curseur';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const monde = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json') as Pays[], lire('contestees.json') as Contestee[], lire('noms.fr.json'));
const grandeurs = lireGrandeurs(lire('fiches-monde.json') as FichierMonde, monde.entites.map((e) => e.pays));
const JOUABLES = monde.entites.filter((e) => e.pays.statut === 'jouable').map((e) => e.pays.id);
/** Les espaces insécables du français (« 450 000 », « 9 240 ») en espaces simples, pour comparer. */
const esp = (t: string) => t.replace(/[  ]/g, ' ');

beforeAll(() => poserCurseur(morceau, { estPetite: () => false, grandeurs }));
afterAll(() => poserCurseur(null));
beforeEach(() => {
  vi.useFakeTimers();
  installerDom();
  installerStockage();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function monter() {
  const zone = new El('main');
  const marques: string[] = [];
  const carte = {
    cacherPastilles() {},
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    anneauEn() {},
    montrer: vi.fn(),
    montrerZone: vi.fn(),
    vueEntiere: vi.fn(),
    zoomer() {},
    cadrer() {},
    contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
    projection: { scale: () => 100 },
    transfo: { k: 1 },
    hote: new El('div'),
    pick: () => ({ id: 'FRA', via: 'trace', distance_px: 0 }),
    noter: vi.fn(() => ({ juste: true, via: 'trace', distance_km: 0, admis: null, lonlat: null, pick: { id: 'FRA', via: 'trace', distance_px: 0 } })),
  };
  const terrain = { nom: 'monde', carte, donnees: monde, jouables: JOUABLES, credit: null };
  const mesures: unknown[] = [];
  const ctx = {
    carte,
    donnees: monde,
    zone,
    terrains: { monde: terrain, actif: 'monde', montrer() {}, deja: () => null, charger: vi.fn() },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => unknown) => void mesures.push(f()) },
  };
  return { zone, carte, marques, terrain, ctx, mesures };
}

/** Une question au curseur posée seule (le module), sur la carte factice. */
function question(id: string, s: 'habitants' | 'superficies' = 'habitants') {
  const m = monter();
  const valides: ReponseCurseur[] = [];
  const q: QuestionCurseur = curseurCharge()!.question(m.terrain as never, id, s, rendu(s, monde), (r) => void valides.push(r));
  const el = q.el as unknown as El;
  const range = el.querySelector('.curseur-range')!;
  const touche = (key: string) => range.emettre('keydown', { key, preventDefault() {} });
  return { ...m, q, el, range, touche, valides, bouton: (c: string) => el.querySelector(`.${c}`)! };
}

describe('le curseur (curseur.ts, § 5.2, D614 a)', () => {
  it('départ au milieu de la plage (450 000 habitants), sa valeur en mots dans aria-valuetext et à l’écran ; le curseur nommé par le pays', () => {
    const c = question('NGA');
    expect(c.range.getAttribute('type')).toBe('range');
    expect(c.range.getAttribute('step')).toBe('any');
    // Au milieu (sur l'échelle logarithmique), la valeur arrondie à 2 chiffres : le curseur à sa position.
    expect(c.q.valeur).toBe(450_000);
    expect(Number(c.range.value)).toBeCloseTo(position(450_000, PLAGES.habitants) * 1000, 9);
    expect(Math.abs(Number(c.range.value) - 500)).toBeLessThan(1);
    expect(esp(c.range.getAttribute('aria-valuetext')!)).toBe('450 000 habitants');
    expect(esp(c.el.querySelector('.curseur-valeur')!.textContent)).toBe('450 000 habitants');
    expect(c.el.dataset.valeur).toBe('450000');
    expect(c.range.getAttribute('aria-label')).toBe('Habitants du Nigeria');
    // La valeur dite une seule fois au lecteur d'écran, par aria-valuetext : pas un <output> (rôle status, région
    // aria-live implicite, qui la redirait à chaque cran).
    const valeurEl = c.el.querySelector('.curseur-valeur')!;
    expect(valeurEl.tagName.toLowerCase()).toBe('span');
    expect(valeurEl.getAttribute('role')).toBeNull();
    expect(valeurEl.getAttribute('aria-live')).toBeNull();
    // Superficies : 1 400 km² au départ.
    const s = question('NGA', 'superficies');
    expect(s.q.valeur).toBe(1400);
    expect(esp(s.range.getAttribute('aria-valuetext')!)).toBe('1 400 km²');
    expect(s.range.getAttribute('aria-label')).toBe('Superficie du Nigeria');
  });

  it('les flèches du clavier et les boutons − et + : ×1,1 par cran, à 2 chiffres ; jamais au-delà de la plage', () => {
    const c = question('NGA');
    c.touche('ArrowRight');
    expect(c.q.valeur).toBe(500_000);
    c.touche('ArrowUp');
    expect(c.q.valeur).toBe(550_000);
    c.touche('ArrowLeft');
    expect(c.q.valeur).toBe(500_000);
    c.touche('ArrowDown');
    expect(c.q.valeur).toBe(450_000);
    c.bouton('curseur-plus').click();
    expect(c.q.valeur).toBe(500_000);
    c.bouton('curseur-moins').click();
    expect(c.q.valeur).toBe(450_000);
    expect(esp(c.range.getAttribute('aria-valuetext')!)).toBe('450 000 habitants');
    // Les boutons sont nommés pour un lecteur d'écran (« − » seul ne se lit pas).
    expect(c.bouton('curseur-moins').getAttribute('aria-label')).toBe(TG.moins);
    expect(c.bouton('curseur-plus').getAttribute('aria-label')).toBe(TG.plus);
    // Aux bords : la plage, jamais au-delà.
    c.q.regler(2e9);
    c.bouton('curseur-plus').click();
    expect(c.q.valeur).toBe(PLAGES.habitants.max);
    expect(esp(c.range.getAttribute('aria-valuetext')!)).toBe("2 milliards d'habitants");
    c.q.regler(1);
    c.touche('ArrowLeft');
    expect(c.q.valeur).toBe(PLAGES.habitants.min);
  });

  it('un glissé (l’événement input du curseur natif) : la valeur à cette position, arrondie à 2 chiffres', () => {
    const c = question('NGA');
    c.range.value = '1000';
    c.range.emettre('input');
    expect(c.q.valeur).toBe(2e9);
    c.range.value = String(0.9 * 1000);
    c.range.emettre('input');
    expect(c.q.valeur).toBe(Number(valeurEn(0.9, PLAGES.habitants).toPrecision(2)));
    expect(esp(c.range.getAttribute('aria-valuetext')!)).toMatch(/ millions d'habitants$/);
  });

  it('les cibles du doigt font 44 px au moins (§ 5.5) : − et +, le curseur, « Valider »', () => {
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toMatch(/\.curseur-pas \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(css).toMatch(/\.curseur-range \{[^}]*height: 44px;/);
    expect(css).toMatch(/\.curseur-valider \{[^}]*min-height: 44px;/);
  });

  it('Valider : la rétroaction de § 5.2, « 1,6 fois trop peu : faux » ; le curseur ne bouge plus ; le pays marqué', () => {
    const c = question('NGA');
    c.q.regler(150e6);
    c.bouton('curseur-valider').click();
    expect(c.valides).toHaveLength(1);
    const r = c.valides[0]!;
    expect([r.juste, r.estime]).toEqual([false, 150e6]);
    expect(esp(r.texte)).toBe("Nigeria : 238 millions d'habitants (Banque mondiale, 2025) ; ta réponse : 150 millions d'habitants, 1,6 fois trop peu : faux");
    expect(esp(r.detail)).toBe("150 millions d'habitants, 1,6 fois trop peu");
    expect(c.q.finie).toBe(true);
    for (const x of ['.curseur-range', '.curseur-moins', '.curseur-plus', '.curseur-valider']) expect(c.el.querySelector(x)!.disabled, x).toBe(true);
    c.touche('ArrowRight');
    expect(c.q.valeur).toBe(150e6);
    expect(c.q.valider()).toBeNull();
    expect(c.marques).toEqual(['NGA:faux']);
  });

  it('juste à ×1,5 (D613 b) : 240 millions pour le Nigeria ; Entrée valide aussi', () => {
    const c = question('NGA');
    c.q.regler(240e6);
    c.touche('Enter');
    expect(c.valides.map((r) => [r.juste, r.estime])).toEqual([[true, 240e6]]);
    expect(esp(c.valides[0]!.texte)).toBe("Nigeria : 238 millions d'habitants (Banque mondiale, 2025) ; ta réponse : 240 millions d'habitants, pile, à l'arrondi près : juste");
    expect(c.marques).toEqual(['NGA:juste']);
  });

  it('Chypre (D616 a) : juste à 6 000 km² par le tracé de la carte, à 10 000 par Wikidata, faux à 30 000 ; les deux valeurs citées', () => {
    const cite = 'Chypre : 9 240 km² (Wikidata), 5 400 km² sur le tracé de la carte';
    const essai = (v: number) => {
      const c = question('CYP', 'superficies');
      c.q.regler(v);
      return c.q.valider()!;
    };
    const t6 = essai(6000);
    expect(t6.juste).toBe(true);
    expect(esp(t6.texte)).toBe(`${cite} ; ta réponse : 6 000 km², 1,1 fois trop pour le tracé : juste`);
    const w10 = essai(10_000);
    expect(w10.juste).toBe(true);
    expect(esp(w10.texte)).toBe(`${cite} ; ta réponse : 10 000 km², 1,1 fois trop : juste`);
    const f30 = essai(30_000);
    expect(f30.juste).toBe(false);
    expect(esp(f30.texte)).toBe(`${cite} ; ta réponse : 30 000 km², 3,2 fois trop : faux`);
  });

  it('le temps écoulé (arreter) : la valeur vraie, le curseur bloqué', () => {
    const c = question('VAT');
    expect(esp(c.q.arreter(true))).toBe(`Temps écoulé · ${monde.noms.VAT} : 949 habitants (Wikidata, 2024)`);
    expect(c.q.finie).toBe(true);
    expect(c.valides).toEqual([]);
  });

  it('au clavier, la question suivante rend le focus au curseur (§ 5.5 : tout se joue au clavier)', () => {
    const a = question('NGA');
    a.touche('Enter');
    const b = question('FRA');
    b.q.poser(400);
    expect((document as unknown as { activeElement?: El }).activeElement).toBe(b.range);
  });

  it('le journal au pire (D617 a) : les bouts des plages, l’id de fiche le plus long ; `estime` tel qu’affiché, la carte sous la borne des lots', () => {
    const cas: [string, 'habitants' | 'superficies', number][] = [
      ['NGA', 'habitants', PLAGES.habitants.max],
      ['NGA', 'habitants', PLAGES.habitants.min],
      ['CYP', 'superficies', PLAGES.superficies.max],
      ['CYP', 'superficies', PLAGES.superficies.min],
      ['CYP', 'superficies', 1234.5678],
    ];
    const ctx = { seance: '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d', appareil: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', horloge: () => ({ ts: 1_794_787_199_999, tz: -720 }), nouvelId: () => 'ffffffff-ffff-4fff-bfff-ffffffffffff' };
    for (const [id, s, v] of cas) {
      const c = question(id, s);
      c.q.regler(v);
      const r = c.q.valider()!;
      expect(r.estime, `${s} ${v}`).toBe(Number(Math.min(Math.max(v, PLAGES[s].min), PLAGES[s].max).toPrecision(2)));
      const e = evenementReponse(ctx, `superficies:${id}:localiser`, 'revision', { correct: r.juste, duree_ms: 120_000, estime: r.estime }, 1);
      expect(e.estime).toBe(r.estime);
      const doc = docDuLot({ id: e.id, appareil: ctx.appareil, seance: ctx.seance, evenements: trier([e]) });
      expect(doc.v).toBe(2);
      expect(doc.evenements.length, doc.evenements).toBeLessThanOrEqual(CARACTERES_PAR_EVENEMENT);
    }
  });
});

describe('Trouver et Reconnaître (essai.ts)', () => {
  function essai(sujet: 'habitants' | 'superficies' = 'habitants') {
    const m = monter();
    const journal: ReponseJouee[] = [];
    const vue = vueEssai(m.ctx as never, { versJouer: vi.fn(), libre: () => (r) => void journal.push(r) });
    const lancer = (mode: 'localiser' | 'nommer', ids: string[]) => {
      vue.activer();
      vue.lancer({ branche: 'entrainement', sujet, serie: 'tous', mode }, { id: 'tous', terrain: 'monde', ids, n: ids.length }, m.terrain as never, ids);
    };
    const el = (s: string) => m.zone.querySelector(s) as El;
    return { ...m, vue, journal, lancer, el };
  }

  it('« Combien d’habitants : Nigeria » : le pays allumé, la carte sur lui, le curseur dans la barre, « Voir » caché ; la carte ne répond pas', () => {
    const e = essai();
    e.lancer('localiser', ['NGA']);
    expect(e.el('#barre-essai .essai-consigne').innerText).toBe(`${textes.sujets.habitants.enonce}Nigeria`);
    expect(e.el('#barre-essai .essai-consigne').dataset.cible).toBe('NGA');
    expect(e.marques).toEqual(['NGA:choisi']);
    expect(e.carte.montrer).toHaveBeenCalledWith('NGA', expect.any(Number));
    expect(e.el('#essai-curseur').hidden).toBe(false);
    expect(e.el('#essai-curseur .curseur')).not.toBeNull();
    expect(e.el('#essai-voir').hidden).toBe(true);
    expect(e.el('#essai-passer').hidden).toBe(false);
    e.vue.toucher!(10, 10, {} as PointerEvent);
    expect(e.mesures).toEqual([]);
    expect(e.carte.noter).not.toHaveBeenCalled();
  });

  it('une réponse fausse, puis une juste : leur rétroaction, `estime` au journal (rien d’un toucher), le bilan dit la valeur répondue', () => {
    const e = essai();
    e.lancer('localiser', ['NGA', 'FRA']);
    // L'ordre est tiré : la première question, quelle qu'elle soit, répondue à 20 000 (fausse pour les deux).
    const premiere = e.el('#barre-essai .essai-consigne').dataset.cible!;
    const seconde = premiere === 'NGA' ? 'FRA' : 'NGA';
    curseurOuvert(e).regler(20_000);
    e.el('#barre-essai .curseur-valider').click();
    const retro = e.el('#barre-essai .essai-retro');
    expect(retro.className).toBe('essai-retro faux');
    expect(esp(retro.textContent)).toMatch(/ ; ta réponse : 20 000 habitants, [\d ,]+ fois trop peu : faux$/);
    expect(e.journal).toEqual([expect.objectContaining({ id: premiere, sens: 'localiser', correct: false, aide: null, reponse: null, via: null, distance_km: null, estime: 20_000 })]);
    // Le temps de lire, puis la suivante.
    vi.advanceTimersByTime(4_000);
    expect(e.el('#barre-essai .essai-consigne').dataset.cible).toBe(seconde);
    const vraie = grandeurs.get(seconde)!.habitants;
    curseurOuvert(e).regler(vraie);
    e.el('#barre-essai .curseur-valider').click();
    expect(retro.className).toBe('essai-retro juste');
    expect(e.journal[1]).toMatchObject({ id: seconde, correct: true, estime: Number(vraie.toPrecision(2)) });
    vi.advanceTimersByTime(2_000);
    const bilan = esp(e.el('#essai-bilan').innerText);
    expect(e.el('#essai-bilan').hidden).toBe(false);
    expect(bilan).toContain('20 000 habitants, ');
  });

  it('« Passer » : la question manquée, sans `estime` ; le curseur bloqué', () => {
    const e = essai();
    e.lancer('localiser', ['NGA']);
    e.el('#essai-passer').click();
    expect(e.journal).toEqual([expect.objectContaining({ id: 'NGA', correct: false, aide: 'passer' })]);
    expect(e.journal[0]).not.toHaveProperty('estime');
  });

  it('Reconnaître : « Lequel compte environ » et la valeur dans la barre, aucune zone allumée ; quatre pays à ×3 ; juste : le pays et sa valeur', () => {
    const e = essai();
    e.lancer('nommer', ['NGA']);
    const barre = e.el('#barre-nommer');
    expect(barre.hidden).toBe(false);
    expect(barre.querySelector('.essai-consigne')!.textContent).toBe(textes.sujets.habitants.consigne_nommer);
    expect(esp(barre.querySelector('.question-dessin')!.textContent)).toBe("240 millions d'habitants ?");
    expect(e.marques).toEqual([]);
    expect(e.carte.montrerZone).not.toHaveBeenCalled();
    const boutons = barre.querySelectorAll('.nommer-choix');
    const ids = boutons.map((b) => b.dataset.id!);
    expect(ids).toHaveLength(4);
    expect(ids).toContain('NGA');
    // D615 a : à ×3 au moins de la cible et entre eux, du même continent (l'Afrique).
    for (const a of ids) for (const b of ids) if (a !== b) expect(ecart(grandeurs.get(a)!, grandeurs.get(b)!, 'habitants'), `${a} ${b}`).toBeGreaterThanOrEqual(ECART_LEURRES);
    expect(ids.every((x) => grandeurs.get(x)!.continent === 'Africa')).toBe(true);
    // Rien dans la barre ne nomme le Nigeria avant la réponse, hors de son bouton.
    expect(ditsPar(barre.querySelector('.question-dessin')!).join(' ')).not.toContain('Nigeria');
    boutons.find((b) => b.dataset.id === 'NGA')!.click();
    expect(esp(barre.querySelector('.essai-retro')!.textContent)).toMatch(/^Juste : Nigeria, 238 millions d'habitants \(Banque mondiale, 2025\) · /);
    expect(e.marques).toContain('NGA:juste');
    expect(e.journal).toEqual([expect.objectContaining({ id: 'NGA', sens: 'nommer', correct: true })]);
  });

  /** Le curseur de la question affichée (le module en garde l'objet ; la vue n'expose que son DOM). */
  function curseurOuvert(e: ReturnType<typeof essai>) {
    const range = e.el('#barre-essai .curseur-range');
    return {
      regler(v: number) {
        const p = PLAGES.habitants;
        range.value = String(((Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min))) * 1000);
        range.emettre('input');
      },
    };
  }
});

describe('Chrono et Sans faute (chrono.ts, § 5.5)', () => {
  function chrono() {
    const m = monter();
    const vue = vueChrono(m.ctx as never, { versJouer: vi.fn(), maintenant: () => Date.UTC(2026, 10, 28) });
    const lancer = (mode: 'chrono' | 'sansfaute', ids: string[], sujet: 'habitants' | 'superficies' = 'habitants') => {
      vue.activer();
      vue.lancer({ branche: 'classe', sujet, serie: 'South America', mode }, { id: 'South America', terrain: 'monde', ids, n: ids.length }, m.terrain as never, ids);
    };
    const el = (s: string) => m.zone.querySelector(s) as El;
    const regler = (v: number, s: 'habitants' | 'superficies' = 'habitants') => {
      const p = PLAGES[s];
      const range = el('#barre-chrono .curseur-range');
      range.value = String(((Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min))) * 1000);
      range.emettre('input');
    };
    return { ...m, vue, lancer, el, regler };
  }

  it('15 s par question au curseur : juste à ×1,5 dans le délai ; le temps écoulé dit la valeur vraie ; le bilan, la valeur répondue', () => {
    const c = chrono();
    c.lancer('chrono', ['BRA', 'ARG', 'CHL']);
    const cible = () => c.el('#barre-chrono .essai-consigne').dataset.cible!;
    expect(c.el('#chrono-curseur').hidden).toBe(false);
    // Une juste.
    const a = cible();
    c.regler(grandeurs.get(a)!.habitants);
    c.el('#barre-chrono .curseur-valider').click();
    expect(c.el('#barre-chrono .essai-retro').className).toBe('essai-retro juste');
    vi.advanceTimersByTime(900);
    // Une fausse (×10), dite avec la valeur vraie.
    const b = cible();
    expect(b).not.toBe(a);
    c.regler(grandeurs.get(b)!.habitants * 10);
    c.el('#barre-chrono .curseur-valider').click();
    expect(esp(c.el('#barre-chrono .essai-retro').textContent)).toMatch(/fois trop : faux$/);
    vi.advanceTimersByTime(3_000);
    // La dernière laissée au temps : 15 s, puis la valeur vraie.
    const d = cible();
    vi.advanceTimersByTime(14_900);
    expect(c.el('#barre-chrono .essai-retro').textContent).toBe('');
    vi.advanceTimersByTime(200);
    expect(esp(c.el('#barre-chrono .essai-retro').textContent)).toMatch(new RegExp(`^Temps écoulé · ${monde.noms[d]} : `));
    vi.advanceTimersByTime(3_000);
    const bilan = c.el('#chrono-bilan');
    expect(bilan.hidden).toBe(false);
    expect(esp(bilan.innerText)).toContain(`${monde.noms[b]} → `);
    expect(esp(bilan.innerText)).toMatch(/habitants, [\d,]+ fois trop/);
    expect(esp(bilan.innerText)).toContain(`${monde.noms[d]} : temps écoulé`);
  });

  it('Valider après la fin du délai (la minuterie en retard) : temps écoulé, et le pays marqué faux, pas juste', () => {
    const c = chrono();
    c.lancer('chrono', ['BRA', 'ARG', 'CHL']);
    const a = c.el('#barre-chrono .essai-consigne').dataset.cible!;
    c.regler(grandeurs.get(a)!.habitants);
    // 15,02 s écoulées sans que la minuterie de 15 s n'ait encore sonné.
    const t0 = performance.now();
    const now = vi.spyOn(performance, 'now').mockReturnValue(t0 + 15_020);
    c.el('#barre-chrono .curseur-valider').click();
    now.mockRestore();
    expect(c.el('#barre-chrono .essai-retro').className).toBe('essai-retro faux');
    expect(esp(c.el('#barre-chrono .essai-retro').textContent)).toMatch(new RegExp(`^Temps écoulé · ${monde.noms[a]} : `));
    expect(c.marques.filter((m) => m.startsWith(`${a}:`) || m.startsWith(`anneau ${a}:`))).not.toContainEqual(`${a}:juste`);
    expect(c.marques).toContain(`${a}:faux`);
  });

  it('Sans faute des superficies : la première erreur finit la partie', () => {
    const c = chrono();
    c.lancer('sansfaute', ['BRA', 'ARG'], 'superficies');
    const a = c.el('#barre-chrono .essai-consigne').dataset.cible!;
    c.regler(grandeurs.get(a)!.superficie / 10, 'superficies');
    c.el('#barre-chrono .curseur-valider').click();
    vi.advanceTimersByTime(3_000);
    expect(c.el('#chrono-bilan').hidden).toBe(false);
  });
});
