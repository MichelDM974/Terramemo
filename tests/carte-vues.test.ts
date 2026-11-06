import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depotMemoire } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import type { Evenement } from '../src/srs/journal';
import { evenementReponse } from '../src/srs/seance';
import { CARTE_MEMOIRE_PAR_DEFAUT, carteMemoire, CLE_CARTE_MEMOIRE, garderReglageMemoire, lireReglageMemoire, type CarteMemoire } from '../src/vues/carte-memoire';
import type { ContexteVue } from '../src/vues/commun';
import { vueEssai } from '../src/vues/essai';
import { vueExplorer } from '../src/vues/explorer';
import { El, installerDom, installerStockage } from './dom-factice';
import type { Pays } from '../src/map/types';
import { normaliser, suggestions } from '../src/texte';
import { REUNION } from '../src/map/terrain';
import { catalogue, ciblesEssai, nomSerie, SERIE_ESSAI, SERIE_REUNION, SERIE_TOUS, serieEssai, seriesMonde, serieTerrain } from '../src/vues/cibles';
import { anneauSiPetite, estPetite, fmtKm, fmtS, idsSerie, nomDe, texteAdmis } from '../src/vues/commun';
import { projectionLocale } from '../src/map/terrain';
import { creerProjection } from '../src/map/projection';
import { remplir, textes } from '../src/vues/textes';

// Vues d'essai du J0 : cibles de l'essai « Toucher », suggestions de la « Saisie ».

const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const noms = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
const statut = (id: string) => pays.find((p) => p.id === id)?.statut;

describe('essai et saisie', () => {
  it('cibles de l’essai : micro-États, Caraïbes, Pacifique, quelques grands, sans doublon ni territoire', () => {
    const c = ciblesEssai(pays);
    expect(new Set(c).size).toBe(c.length);
    for (const p of pays) if (p.micro && p.statut === 'jouable') expect(c).toContain(p.id);
    for (const id of ['CUB', 'JAM', 'FJI', 'KIR', 'TON', 'WSM', 'PNG', 'RUS', 'BRA']) expect(c).toContain(id);
    for (const id of c) expect(statut(id)).toBe('jouable');
  });

  it('séries du monde : tous les pays en tête (195, sans le paquet optionnel), puis un continent par nom du fichier de langue, dans l’ordre alphabétique', () => {
    const continents = textes.continents as Record<string, string>;
    const s = seriesMonde(pays, (c) => continents[c] ?? c);
    expect(s.map((x) => x.id)).toEqual([SERIE_TOUS, 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania']);
    expect(s.map((x) => nomSerie(x.id))).toEqual(['Tous les pays', 'Afrique', 'Amérique du Nord', 'Amérique du Sud', 'Asie', 'Europe', 'Océanie']);
    // L'essai du J0 à part (un outil, dans ⚙), intact.
    const essai = serieEssai(pays);
    // 45 : les micro-États à moins de 2 000 km² (Comores et Maurice en plus ; Samoa y était, au Pacifique).
    expect([essai.id, essai.terrain, essai.ids, essai.n]).toEqual([SERIE_ESSAI, 'monde', ciblesEssai(pays), 45]);
    expect(nomSerie(SERIE_ESSAI)).toBe('Essai J0');
    const jouables = pays.filter((p) => p.statut === 'jouable');
    expect(new Set(s[0]?.ids)).toEqual(new Set(jouables.map((p) => p.id)));
    expect(s[0]?.ids.length).toBe(195);
    // Kosovo et Taïwan (paquet optionnel) ne sont posés dans aucune série.
    for (const id of ['XKX', 'TWN']) {
      expect(statut(id)).toBe('optionnel');
      for (const x of s) expect(x.ids, x.id).not.toContain(id);
    }
    expect(s.find((x) => x.id === 'Africa')?.ids.length).toBe(54);
    // Les continents se partagent tous les pays, sans territoire ni zone contestée.
    const parContinent = s.slice(1).flatMap((x) => x.ids);
    expect(parContinent.length).toBe(195);
    expect(new Set(parContinent)).toEqual(new Set(s[0]?.ids));
    // Chaque continent de pays.json a son nom en français.
    for (const p of pays) expect(continents[p.continent], p.continent).toBeTruthy();
  });

  it('textes : modèles remplis, clé inconnue laissée telle quelle', () => {
    expect(remplir(textes.terrains.monde.n, { n: 54 })).toBe('54 pays');
    expect(remplir('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });

  it('normalisation sans accents ni casse, sans retrait de mots', () => {
    expect(normaliser('  Côte d’Ivoire ')).toBe("cote d'ivoire");
    expect(normaliser('Saint-Vincent-et-les Grenadines')).toBe('saint vincent et les grenadines');
    expect(normaliser('ÉTATS-UNIS')).toBe('etats unis');
  });

  it('suggestions : les noms qui commencent par ce qui est tapé', () => {
    expect(suggestions('cote', Object.values(noms))).toContain('Côte d’Ivoire');
    expect(suggestions('CONGO', Object.values(noms))).toEqual(['Congo-Brazzaville', 'Congo-Kinshasa']);
    expect(suggestions('saint vin', Object.values(noms))).toEqual(['Saint-Vincent-et-les Grenadines']);
    expect(suggestions('', Object.values(noms))).toEqual([]);
  });
});

// La Réunion et Nommer (#15, conception docs/etudes/2026-11-06-reunion.md §§ 4 et 5).
describe('séries de l’île et textes des terrains', () => {
  const continents = textes.continents as Record<string, string>;
  const nomContinent = (c: string) => continents[c] ?? c;
  const communes = JSON.parse(readFileSync('public/geo/reunion/communes.json', 'utf8')) as { id: string }[];
  const nomsIle = JSON.parse(readFileSync('public/geo/reunion/noms.fr.json', 'utf8')) as Record<string, string>;

  it('les séries du monde portent leur terrain et leur nombre', () => {
    for (const x of seriesMonde(pays, nomContinent)) {
      expect(x.terrain, x.id).toBe('monde');
      expect(x.n, x.id).toBe(x.ids.length);
    }
  });

  it('le catalogue : les 7 séries du monde, puis l’île en dernier (ids résolus au départ), sans l’essai', () => {
    const s = catalogue(pays, nomContinent);
    expect(s.map((x) => x.id)).toEqual([...seriesMonde(pays, nomContinent).map((x) => x.id), SERIE_REUNION]);
    expect(s.map((x) => x.id)).not.toContain(SERIE_ESSAI);
    const ile = s.at(-1);
    expect(ile).toEqual({ id: 'reunion', terrain: 'reunion', ids: [], n: 24 });
    expect(serieTerrain(REUNION)).toEqual(ile);
    expect(REUNION.n).toBe(communes.length);
  });

  it('les cibles d’une série : les siennes dans le monde, toutes les zones jouables de l’île', () => {
    const monde = seriesMonde(pays, nomContinent)[0]!;
    const t = { jouables: ['A', 'B'] } as unknown as Parameters<typeof idsSerie>[1];
    expect(idsSerie(monde, t)).toEqual(monde.ids);
    expect(idsSerie(serieTerrain(REUNION), t)).toEqual(['A', 'B']);
  });

  it('textes : le monde et l’île ont les mêmes clés (sauf série, libellé), toutes remplies', () => {
    const { monde, reunion } = textes.terrains;
    const propres = new Set(['serie', 'libelle']);
    expect(Object.keys(reunion).filter((k) => !propres.has(k)).sort()).toEqual(Object.keys(monde).sort());
    for (const k of ['n', 'consigne_nommer', 'faux_suite', 'expire']) {
      expect(monde[k as keyof typeof monde], `monde.${k}`).toBeTruthy();
      expect(reunion[k as keyof typeof reunion], `reunion.${k}`).toBeTruthy();
    }
    for (const k of ['serie', 'libelle']) expect(reunion[k as keyof typeof reunion], k).toBeTruthy();
    expect(remplir(reunion.n, { n: 24 })).toBe('24 communes');
    expect(remplir(monde.n, { n: 195 })).toBe('195 pays');
  });

  it('textes de Toucher et de Nommer : chaque clé lue par les vues existe', () => {
    const cles = [
      'localiser', 'nommer', 'chargement_terrain', 'echec_terrain', 'serie_essai', 'serie_essai_detail', 'consigne', 'voir', 'passer',
      'terminer', 'recommencer', 'autre_serie', 'juste', 'via_pastille', 'via_proche', 'essai_un', 'essais', 'faux', 'faux_ou', 'la_mer',
      'bilan_titre', 'bilan_resume', 'bilan_vide', 'rate', 'rate_vu', 'rate_passe', 'rate_distance', 'nommer_juste',
      'nommer_faux', 'bilan_nommer_titre', 'bilan_nommer', 'bilan_nommer_temps', 'bilan_nommer_faux',
    ];
    for (const k of cles) expect(textes.toucher[k as keyof typeof textes.toucher], k).toBeTruthy();
    // Le temps écoulé du Chrono dépend du terrain : il n'est plus dans chrono.
    expect('expire' in textes.chrono).toBe(false);
  });

  it('textes de Jouer, de la Carte et de la recherche : chaque clé lue par les vues existe', () => {
    const lues = {
      jouer: ['titre', 'fermer', 'remonter', 'fil', 'regles', 'rejouer', 'record', 'essai_aide'],
      carte: ['touche', 'touche_ile', 'mer', 'par_pastille', 'au_plus_pres', 'monde', 'monde_titre'],
      recherche: ['placeholder', 'placeholder_court', 'placeholder_tres_court', 'aucun', 'commune'],
    } as const;
    for (const [partie, cles] of Object.entries(lues))
      for (const k of cles) expect((textes as unknown as Record<string, Record<string, string>>)[partie]?.[k], `${partie}.${k}`).toBeTruthy();
    for (const m of ['localiser', 'nommer', 'chrono', 'sansfaute', 'minute'] as const) expect(textes.jouer.exercices[m], m).toBeTruthy();
    for (const b of ['entrainement', 'classe'] as const) expect([textes.jouer.branches[b].nom, textes.jouer.branches[b].detail].every(Boolean), b).toBe(true);
    expect(remplir(textes.jouer.exercices.chrono, { s: 15 })).toBe('15 s par question, un seul toucher');
    expect(remplir(textes.jouer.exercices.minute, { s: 60 })).toBe('Le plus de justes en 60 s');
  });

  it('textes de Toucher : la rétroaction du monde reste mot pour mot celle d’avant', () => {
    const T = textes.toucher;
    expect(
      remplir(T.faux, { touche: 'Italie', ou: remplir(T.faux_ou, { km: fmtKm(12.4) }), suite: textes.terrains.monde.faux_suite }),
    ).toBe('Faux : Italie, à 12\u00a0km du bord. Le bon pays est en vert : touche-le.');
    expect(remplir(T.juste, { via: T.via_proche, essais: remplir(T.essais, { n: 2 }), temps: fmtS(1234) })).toBe(
      'Juste (au plus près) · 2 essais · 1,2\u00a0s',
    );
    expect(remplir(T.faux, { touche: T.la_mer, ou: '', suite: textes.terrains.reunion.faux_suite })).toBe(
      'Faux : la mer. La bonne commune est en vert : touche-la.',
    );
    expect(remplir(T.bilan_nommer_faux, { cible: 'Saint-Leu', choisi: 'Les Avirons' })).toBe('Saint-Leu : tu as choisi Les Avirons');
  });

  it('texteAdmis : pourquoi une zone admise est juste (décision « Zones contestées et enclaves »)', () => {
    const d = { noms };
    // Crimée (hachure tenue par la Russie) pour l'Ukraine.
    expect(texteAdmis(d, 'UKR', { zone: 'NE_B89', tenant: 'RUS', sorte: 'contestee' })).toBe(' (zone contestée, tenue par Russie)');
    // Une entité contestée se tient elle-même dans les données : son nom.
    expect(texteAdmis(d, 'SOM', { zone: 'NE_SOL', tenant: 'NE_SOL', sorte: 'contestee' })).toBe(' (zone contestée : Somaliland)');
    // Taïwan pour la Chine, le Kosovo pour la Serbie : de même.
    expect(texteAdmis(d, 'CHN', { zone: 'TWN', tenant: 'TWN', sorte: 'contestee' })).toBe(' (zone contestée : Taïwan)');
    expect(texteAdmis(d, 'SRB', { zone: 'XKX', tenant: 'XKX', sorte: 'contestee' })).toBe(' (zone contestée : Kosovo)');
    expect(texteAdmis(d, 'KAZ', { zone: 'NE_KAB', tenant: 'NE_KAB', sorte: 'enclave' })).toBe(' (enclave : Baïkonour)');
    // La cible tient la zone (une île hachurée touchée en mer) : rien à expliquer.
    expect(texteAdmis(d, 'JPN', { zone: 'NE_B29', tenant: 'JPN', sorte: 'contestee' })).toBe('');
    expect(texteAdmis(d, 'FRA', null)).toBe('');
    for (const k of ['admis_contestee', 'admis_contestee_zone', 'admis_enclave'] as const) expect(textes.toucher[k]).toBeTruthy();
  });

  it('fmtKm : une décimale sous 10 km, l’entier au-delà', () => {
    expect(fmtKm(2.43)).toBe('2,4\u00a0km');
    expect(fmtKm(0.04)).toBe('0,0\u00a0km');
    expect(fmtKm(9.96)).toBe('10\u00a0km');
    expect(fmtKm(12.4)).toBe('12\u00a0km');
    expect(fmtKm(1517.2)).toBe('1\u202f517\u00a0km');
  });

  it('nomDe : les noms du terrain passé (une commune n’est pas « 97407 »)', () => {
    expect(nomDe({ noms: nomsIle }, '97407')).toBe('Le Port');
    expect(nomDe({ noms }, 'CHE')).toBe('Suisse');
    expect(nomDe({ noms }, 'ZZZ')).toBe('ZZZ');
  });
});

describe('anneau seulement autour d’une zone petite à l’écran', () => {
  // L'île au zoom 1 (384 × 723) : toutes les communes ≥ 15 px, aucun anneau (Petite-Île
  // en aurait un qui déborde sur la mer et Saint-Pierre) ; au monde, le Vatican en a un.
  const communes = JSON.parse(readFileSync('public/geo/reunion/communes.json', 'utf8')) as Pays[];
  const proj = projectionLocale(384, 723, { type: 'MultiPoint', coordinates: [[55.21, -21.39], [55.84, -20.87]] });
  function terrain(lieux: Pays[], echelle: number, k: number) {
    const poses: string[] = [];
    const carte = { projection: { scale: () => echelle }, transfo: { k, x: 0, y: 0 }, anneau: (id: string) => poses.push(id) };
    const t = { carte, donnees: { entites: lieux.map((l) => ({ pays: l })) } } as unknown as Parameters<typeof estPetite>[0];
    return { t, poses };
  }
  it('île au zoom 1 : aucune commune petite, aucun anneau posé', () => {
    const { t, poses } = terrain(communes, proj.scale(), 1);
    for (const c of communes) {
      expect(estPetite(t, c.id), c.id).toBe(false);
      anneauSiPetite(t, c.id, 'juste');
    }
    expect(poses).toEqual([]);
  });
  it('monde au zoom 1 : le Vatican a son anneau, la Russie non', () => {
    const { t, poses } = terrain(pays, creerProjection('monde', 384, 723).scale(), 1);
    anneauSiPetite(t, 'VAT', 'juste');
    anneauSiPetite(t, 'RUS', 'juste');
    expect(poses).toEqual(['VAT']);
  });
});

// Carte de la mémoire à l'accueil (J1a, étude § 7, D7) : teintes posées par la
// vue Carte, retirées en partant (aucune partie ne les voit), légende, ligne
// de la zone touchée, réglage de ⚙.
describe('carte de la mémoire à l’accueil', () => {
  beforeEach(() => installerDom());
  afterEach(() => vi.unstubAllGlobals());

  const T0 = Date.UTC(2026, 10, 9, 8);
  const JOUR_MS = 86_400_000;

  /** Une mémoire où FRA a été appris (rappel juste) il y a 10 jours puis revu juste il y a 4 jours, ESP raté aujourd'hui. */
  async function memoire(h = { ts: T0 }) {
    let n = 0;
    const m = ouvrirMemoire({
      depot: depotMemoire(),
      appareil: '00000000-0000-4000-8000-00000000a001',
      horloge: () => ({ ts: h.ts, tz: 240 }),
      nouvelId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    });
    await m.pret;
    const evt = (fiche: string, ts: number, note: 1 | 3) =>
      evenementReponse({ seance: null, appareil: m.appareil, horloge: () => ({ ts, tz: 240 }), nouvelId: () => m.nouvelId() }, fiche, 'rappel', { correct: note > 1, duree_ms: 1000 }, note);
    await m.ecrire([evt('pays:FRA:localiser', T0 - 10 * JOUR_MS, 3), evt('pays:FRA:localiser', T0 - 4 * JOUR_MS, 3), evt('pays:ESP:localiser', T0, 1)]);
    return m;
  }

  function monter(o: { memoire?: CarteMemoire } = {}) {
    const zone = new El('main');
    const teintes: (Map<string, number> | null)[] = [];
    const carte = {
      effacerMarques() {},
      marquer() {},
      anneau() {},
      teinter(t: Map<string, number> | null) {
        teintes.push(t);
      },
      pick: (_x: number, _y: number) => ({ id: pickSuivant, via: 'trace' }),
      hote: new El('div'),
      montrer() {},
      contexteFinal: () => ({ proj: { scale: () => 100 }, t: { k: 1 } }),
      projection: { scale: () => 100 },
      transfo: { k: 1 },
    };
    const entites = (['FRA', 'ESP', 'ITA', 'GIB'] as const).map((id) => ({ pays: { id, statut: id === 'GIB' ? 'territoire' : 'jouable', partie_max_km2: 1e5 } }));
    const donnees = { entites, noms: { FRA: 'France', ESP: 'Espagne', ITA: 'Italie', GIB: 'Gibraltar' } };
    const monde = { nom: 'monde', carte, donnees, jouables: ['FRA', 'ESP', 'ITA'] };
    const ctx = {
      carte,
      donnees,
      zone,
      terrains: { monde, montrer() {}, deja: () => null },
      mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
    } as unknown as ContexteVue;
    const vue = vueExplorer(ctx, o);
    const legende = zone.querySelector('#legende-memoire')!;
    const detail = () => zone.querySelector('#barre-carte .barre-detail')!.textContent;
    return { vue, teintes, derniere: () => teintes.at(-1), legende, detail, ctx, monde };
  }
  let pickSuivant = 'FRA';

  it('posées à l’activer (la fiche la plus faible décide), retirées au desactiver ; légende et maîtrisés', async () => {
    const m = await memoire();
    const v = monter({ memoire: carteMemoire(m, () => true) });
    v.vue.activer();
    const t = v.derniere()!;
    expect(t).toBeInstanceOf(Map);
    // FRA : S de plusieurs jours (seau 1 ou plus) ; ESP raté aujourd'hui : seau 0 ; ITA jamais vu : sans teinte.
    expect(t.get('ESP')).toBe(0);
    expect(t.get('FRA')).toBeGreaterThan(0);
    expect(t.has('ITA')).toBe(false);
    expect(v.legende.hidden).toBe(false);
    expect(v.legende.innerText).toBe(`${textes.memoire.jamais_vu} · ${textes.memoire.faible}${textes.memoire.maitrise} · 0/3 maîtrisés`);
    v.vue.desactiver();
    expect(v.derniere()).toBeNull();
    expect(v.legende.hidden).toBe(true);
  });

  it('toucher un pays : « Vu N fois · revient dans N j », « Jamais vu » ; rien pour un territoire', async () => {
    const m = await memoire();
    const v = monter({ memoire: carteMemoire(m, () => true) });
    v.vue.activer();
    pickSuivant = 'FRA';
    v.vue.toucher?.(1, 1, {} as PointerEvent);
    expect(v.detail()).toMatch(/^Vu 2 fois · revient (dans \d+ j|demain)$/);
    pickSuivant = 'ESP';
    v.vue.toucher?.(1, 1, {} as PointerEvent);
    expect(v.detail()).toMatch(/^Vu 1 fois · revient (dans \d+ j|demain)$/);
    pickSuivant = 'ITA';
    v.vue.toucher?.(1, 1, {} as PointerEvent);
    expect(v.detail()).toBe(textes.memoire.jamais_vu);
    pickSuivant = 'GIB';
    v.vue.toucher?.(1, 1, {} as PointerEvent);
    expect(v.detail()).not.toContain('Vu');
    expect(v.detail()).not.toContain(textes.memoire.jamais_vu);
  });

  it('absentes en partie : Toucher (Trouver) trouve la carte sans teinte, et n’en pose aucune', async () => {
    const m = await memoire();
    const v = monter({ memoire: carteMemoire(m, () => true) });
    v.vue.activer();
    expect(v.derniere()).not.toBeNull();
    // Le routeur : la vue Carte part, Toucher arrive.
    v.vue.desactiver();
    const n = v.teintes.length;
    const essai = vueEssai(v.ctx, { versJouer: () => {} });
    essai.activer();
    essai.lancer({ branche: 'entrainement', sujet: 'pays', serie: 'tous', mode: 'localiser' }, { id: 'tous', terrain: 'monde', ids: ['FRA'], n: 1 }, v.monde as never, ['FRA']);
    expect(v.derniere()).toBeNull();
    expect(v.teintes.length).toBe(n);
  });

  it('réglage de ⚙ : activé par défaut, gardé ; coupé, ni teinte ni légende ni ligne ; rafraichir() suit', async () => {
    const s = installerStockage();
    expect(CARTE_MEMOIRE_PAR_DEFAUT).toBe(true);
    expect(lireReglageMemoire(localStorage)).toBe(true);
    expect(lireReglageMemoire(null)).toBe(true);
    garderReglageMemoire(localStorage, false);
    expect(s.get(CLE_CARTE_MEMOIRE)).toBe('0');
    expect(lireReglageMemoire(localStorage)).toBe(false);
    const m = await memoire();
    let actif = false;
    const v = monter({ memoire: carteMemoire(m, () => actif) });
    v.vue.activer();
    expect(v.derniere()).toBeNull();
    expect(v.legende.hidden).toBe(true);
    pickSuivant = 'FRA';
    v.vue.toucher?.(1, 1, {} as PointerEvent);
    expect(v.detail()).toBe('');
    actif = true;
    v.vue.rafraichir();
    expect(v.derniere()?.get('ESP')).toBe(0);
    expect(v.detail()).toMatch(/^Vu 2 fois/);
    expect(v.legende.hidden).toBe(false);
    // Hors de l'accueil, rafraichir() ne pose rien.
    v.vue.desactiver();
    const n = v.teintes.length;
    v.vue.rafraichir();
    expect(v.teintes.length).toBe(n);
  });

  it('mémoire en lecture : rien, puis les teintes une fois chargée', async () => {
    let lire!: () => void;
    const depot = depotMemoire();
    const lent = { tous: () => new Promise<Evenement[]>((ok) => (lire = () => void depot.tous().then(ok))), ajouter: depot.ajouter };
    const m = ouvrirMemoire({ depot: lent, appareil: '00000000-0000-4000-8000-00000000a001', horloge: () => ({ ts: T0, tz: 240 }) });
    const v = monter({ memoire: carteMemoire(m, () => true) });
    v.vue.activer();
    expect(v.derniere()).toBeNull();
    lire();
    await m.pret;
    v.vue.rafraichir();
    expect(v.derniere()).toEqual(new Map());
    expect(v.legende.innerText).toContain('0/3 maîtrisés');
  });

  it('sans mémoire (?teintes=demo, anciens tests) : la vue ne touche pas aux teintes', () => {
    const v = monter();
    v.vue.activer();
    v.vue.desactiver();
    expect(v.teintes).toEqual([]);
  });
});
