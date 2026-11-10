// La carte de la mémoire à plusieurs sujets (étude J2 § 6.4, D47 a, lot 0c) :
// le choix du sujet dans la légende, parmi les jouables du terrain, caché tant
// qu'il n'y en a qu'un ; gardé sur l'appareil, Pays par défaut ; teintes et
// maîtrisés dans le sujet choisi ; au toucher, le détail de chaque sujet à
// partir de deux. Les capitales, jouables depuis le lot 1, sont retirées des
// jouables injectés pour le cas d'un seul sujet (SANS_CAPITALES : une
// version d'avant), et rendues ici par le sujet factice (sujet-factice.ts) ;
// le vrai rendu des capitales : tests/capitales-vues.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depotMemoire } from '../src/journal/depot';
import { ouvrirMemoire, type Memoire } from '../src/journal/memoire';
import type { Domaine } from '../src/srs/fiches';
import { evenementReponse } from '../src/srs/seance';
import { carteMemoire, CLE_SUJET_MEMOIRE, domaineDe, garderSujetMemoire, lireSujetMemoire, type CarteMemoire } from '../src/vues/carte-memoire';
import type { ContexteVue } from '../src/vues/commun';
import { vueExplorer } from '../src/vues/explorer';
import { remplir, textes } from '../src/vues/textes';
import { El, installerDom } from './dom-factice';
import { remplaces, TEXTES_FACTICES } from './sujet-factice';

vi.mock('../src/vues/sujets', async (orig) => (await import('./sujet-factice')).avecFactice(await orig()));

const T0 = Date.UTC(2026, 10, 9, 8);
const JOUR_MS = 86_400_000;
const AVEC_CAPITALES: readonly Domaine[] = ['pays', 'communes', 'capitales'];
/** Une version d'avant le lot 1 : un seul sujet jouable par terrain. */
const SANS_CAPITALES: readonly Domaine[] = ['pays', 'communes'];
const M = textes.memoire;

/** FRA appris en pays il y a 10 jours puis revu il y a 4 ; ESP raté aujourd'hui en pays ; ITA appris en capitales aujourd'hui (Again), et ESP en capitales (Good). */
async function memoire(): Promise<Memoire> {
  let n = 0;
  const m = ouvrirMemoire({
    depot: depotMemoire(),
    appareil: '00000000-0000-4000-8000-00000000a001',
    horloge: () => ({ ts: T0, tz: 240 }),
    nouvelId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  await m.pret;
  const evt = (fiche: string, ts: number, note: 1 | 3) =>
    evenementReponse({ seance: null, appareil: m.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.nouvelId() }, fiche, 'rappel', { correct: note > 1, duree_ms: 1000 }, note);
  await m.ecrire([
    evt('pays:FRA:localiser', T0 - 10 * JOUR_MS, 3),
    evt('pays:FRA:localiser', T0 - 4 * JOUR_MS, 3),
    evt('pays:ESP:localiser', T0, 1),
    evt('capitales:ITA:localiser', T0, 1),
    evt('capitales:ESP:localiser', T0, 3),
  ]);
  return m;
}

/** Un stockage en mémoire. */
function stockage() {
  const m = new Map<string, string>();
  return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } };
}

describe('carte de la mémoire : le sujet montré', () => {
  afterEach(() => remplaces.clear());

  it('domaineDe : le choix s’il est jouable sur le terrain, sinon le premier jouable', () => {
    expect(domaineDe('monde')).toBe('pays');
    expect(domaineDe('reunion')).toBe('communes');
    expect(domaineDe('monde', 'capitales', SANS_CAPITALES)).toBe('pays'); // pas jouable dans cette version
    expect(domaineDe('monde', 'capitales')).toBe('capitales'); // jouable depuis le lot 1
    expect(domaineDe('monde', 'capitales', AVEC_CAPITALES)).toBe('capitales');
    expect(domaineDe('monde', 'communes', AVEC_CAPITALES)).toBe('pays'); // pas sur ce terrain
    expect(domaineDe('reunion', 'capitales', AVEC_CAPITALES)).toBe('communes');
  });

  it('teintes et maîtrisés par domaine : celles du sujet choisi', async () => {
    const m = await memoire();
    const c = carteMemoire(m, () => true, { jouables: AVEC_CAPITALES });
    expect(c.sujet('monde')).toBe('pays');
    const pays = c.teintes('monde')!;
    expect([...pays.keys()].sort()).toEqual(['ESP', 'FRA']);
    expect(pays.get('ESP')).toBe(0);
    c.choisir('monde', 'capitales');
    expect(c.sujet('monde')).toBe('capitales');
    const capitales = c.teintes('monde')!;
    expect([...capitales.keys()].sort()).toEqual(['ESP', 'ITA']);
    expect(capitales.get('ITA')).toBe(0);
    expect(capitales.get('ESP')).toBeGreaterThan(0);
    expect(c.maitrises('monde', 195)).toBe('0/195 maîtrisés');
    // L'île garde son sujet ; un sujet hors du terrain est ignoré.
    expect(c.sujet('reunion')).toBe('communes');
    c.choisir('monde', 'communes');
    expect(c.sujet('monde')).toBe('capitales');
  });

  it('choix caché tant qu’un terrain n’a qu’un sujet jouable ; détail au toucher inchangé', async () => {
    const m = await memoire();
    const seul = carteMemoire(m, () => true, { jouables: SANS_CAPITALES });
    expect(seul.sujets('monde')).toEqual([]);
    expect(seul.sujets('reunion')).toEqual([]);
    // Les fiches capitales: au journal ne teintent rien sans le sujet jouable.
    expect([...seul.teintes('monde')!.keys()].sort()).toEqual(['ESP', 'FRA']);
    expect(seul.detail('monde', 'FRA', true)).toMatch(/^Vu 2 fois · revient (dans \d+ j|demain)$/);
    expect(seul.detail('monde', 'ITA', true)).toBe(M.jamais_vu);
    const deux = carteMemoire(m, () => true, { jouables: AVEC_CAPITALES });
    expect(deux.sujets('monde')).toEqual(['pays', 'capitales']);
    expect(deux.sujets('reunion')).toEqual([]);
  });

  it('à deux sujets, le détail de chacun au toucher : « Pays : vu 2 fois · … · Capitale : jamais vue »', async () => {
    remplaces.add('capitales');
    const m = await memoire();
    const c = carteMemoire(m, () => true, { jouables: AVEC_CAPITALES });
    const P = textes.sujets.pays.memoire;
    const F = TEXTES_FACTICES.memoire;
    expect(c.detail('monde', 'FRA', true)).toMatch(new RegExp(`^${P.nom} : vu 2 fois · revient (dans \\d+ j|demain) · ${F.nom} : ${F.jamais}$`));
    expect(c.detail('monde', 'ITA', true)).toBe(`${P.nom} : ${P.jamais} · ${F.nom} : résolue 1 fois · ${M.revient_demain}`);
    // Le même détail quel que soit le sujet choisi ; rien pour un territoire.
    c.choisir('monde', 'capitales');
    expect(c.detail('monde', 'ITA', true)).toBe(`${P.nom} : ${P.jamais} · ${F.nom} : résolue 1 fois · ${M.revient_demain}`);
    expect(c.detail('monde', 'GIB', false)).toBeNull();
  });

  it('choix gardé sur l’appareil, par terrain ; Pays par défaut ; stockage refusé : pour la page', async () => {
    const m = await memoire();
    const { m: cles, s } = stockage();
    const c = carteMemoire(m, () => true, { jouables: AVEC_CAPITALES, stockage: () => s });
    expect(c.sujet('monde')).toBe('pays');
    c.choisir('monde', 'capitales');
    expect(cles.get(`${CLE_SUJET_MEMOIRE}.monde`)).toBe('capitales');
    // Relu par une autre page (une nouvelle carte de la mémoire, même stockage).
    expect(carteMemoire(m, () => true, { jouables: AVEC_CAPITALES, stockage: () => s }).sujet('monde')).toBe('capitales');
    // Une version où le sujet gardé n'est plus jouable : Pays.
    expect(carteMemoire(m, () => true, { jouables: SANS_CAPITALES, stockage: () => s }).sujet('monde')).toBe('pays');
    // Stockage refusé.
    const refuse = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
    };
    expect(lireSujetMemoire(refuse, 'monde')).toBeNull();
    expect(() => garderSujetMemoire(refuse, 'monde', 'pays')).not.toThrow();
    const r = carteMemoire(m, () => true, { jouables: AVEC_CAPITALES, stockage: () => refuse });
    r.choisir('monde', 'capitales');
    expect(r.sujet('monde')).toBe('capitales');
  });
});

describe('carte de la mémoire : le choix dans la légende de l’accueil', () => {
  beforeEach(() => installerDom());
  afterEach(() => {
    remplaces.clear();
    vi.unstubAllGlobals();
  });

  function monter(memoire: CarteMemoire) {
    const zone = new El('main');
    const teintes: (Map<string, number> | null)[] = [];
    let pick = 'ITA';
    const carte = {
      effacerMarques() {},
      marquer() {},
      anneau() {},
      teinter: (t: Map<string, number> | null) => void teintes.push(t),
      pick: () => ({ id: pick, via: 'trace' }),
      hote: new El('div'),
      montrer() {},
      contexteFinal: () => ({ proj: { scale: () => 100 }, t: { k: 1 } }),
    };
    const entites = (['FRA', 'ESP', 'ITA'] as const).map((id) => ({ pays: { id, statut: 'jouable', partie_max_km2: 1e5 } }));
    const donnees = { entites, noms: { FRA: 'France', ESP: 'Espagne', ITA: 'Italie' } };
    const monde = { nom: 'monde', carte, donnees, jouables: ['FRA', 'ESP', 'ITA'] };
    const ctx = {
      carte,
      donnees,
      zone,
      terrains: { monde, montrer() {}, deja: () => null },
      mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
    } as unknown as ContexteVue;
    const vue = vueExplorer(ctx, { memoire });
    return {
      vue,
      legende: zone.querySelector('#legende-memoire')!,
      choix: () => zone.querySelector('#legende-sujet'),
      derniere: () => teintes.at(-1),
      detail: () => zone.querySelector('#barre-carte .barre-detail')!.textContent,
      toucher: (id: string) => {
        pick = id;
        vue.toucher?.(1, 1, {} as PointerEvent);
      },
    };
  }

  it('un seul sujet jouable : pas de choix dans la légende', async () => {
    const v = monter(carteMemoire(await memoire(), () => true, { jouables: SANS_CAPITALES }));
    v.vue.activer();
    expect(v.choix()).toBeNull();
    expect(v.legende.innerText).toBe(`${M.jamais_vu} · ${M.faible}${M.maitrise} · 0/3 maîtrisés`);
  });

  it('deux sujets jouables : le choix en tête de la légende ; le changer reteint la carte, relit le détail et se garde', async () => {
    remplaces.add('capitales');
    const { m: cles, s } = stockage();
    const v = monter(carteMemoire(await memoire(), () => true, { jouables: AVEC_CAPITALES, stockage: () => s }));
    v.vue.activer();
    const choix = v.choix()!;
    expect(choix).not.toBeNull();
    expect(choix.querySelectorAll('option').map((o) => o.getAttribute('value'))).toEqual(['pays', 'capitales']);
    expect(choix.innerText).toBe(`${textes.jouer.sujets.pays.nom}${textes.jouer.sujets.capitales.nom}`);
    expect(choix.value).toBe('pays');
    expect([...v.derniere()!.keys()].sort()).toEqual(['ESP', 'FRA']);
    v.toucher('ITA');
    const avant = v.detail();
    expect(avant).toContain(`${TEXTES_FACTICES.memoire.nom} : résolue 1 fois`);
    choix.value = 'capitales';
    choix.emettre('change');
    expect([...v.derniere()!.keys()].sort()).toEqual(['ESP', 'ITA']);
    expect(cles.get(`${CLE_SUJET_MEMOIRE}.monde`)).toBe('capitales');
    expect(v.detail()).toBe(avant);
    // Revenue à l'accueil : le choix gardé.
    v.vue.desactiver();
    v.vue.activer();
    expect(v.choix()!.value).toBe('capitales');
  });
});

describe('carte de la mémoire : capitales réellement jouables (lot 1)', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());

  it('par défaut, le monde a deux sujets (Pays, Capitales) ; teintes, maîtrisés et détail des vraies capitales', async () => {
    const m = await memoire();
    const c = carteMemoire(m, () => true);
    expect(c.sujets('monde')).toEqual(['pays', 'capitales']);
    expect(c.sujets('reunion')).toEqual([]);
    expect(c.sujet('monde')).toBe('pays');
    c.choisir('monde', 'capitales');
    expect([...c.teintes('monde')!.keys()].sort()).toEqual(['ESP', 'ITA']);
    expect(c.maitrises('monde', 195)).toBe('0/195 maîtrisés');
    const P = textes.sujets.pays.memoire;
    const K = textes.sujets.capitales.memoire;
    expect(c.detail('monde', 'ITA', true)).toBe(`${P.nom} : ${P.jamais} · ${K.nom} : ${remplir(K.vu_une, { n: 1 })} · ${M.revient_demain}`);
    expect(c.detail('monde', 'FRA', true)).toMatch(new RegExp(`^${P.nom} : vu 2 fois · revient (dans \\d+ j|demain) · ${K.nom} : ${K.jamais}$`));
  });
});
