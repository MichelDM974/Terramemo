// Le sujet Drapeaux, du côté pur (étude J2 § 2.2, 5.3, lot 2) : le manifeste lu
// par src/map/drapeaux.ts sur le vrai fichier, le préchargement, le rendu du
// sujet (src/vues/sujets.ts : images, alt neutres, rien qui nomme le pays avant
// la réponse), les leurres de Reconnaître (qcm.choix : voisins d'abord, jamais
// le jumeau, jamais deux jumeaux ; les sosies en stratégie du quiz) et les
// jumeaux en zones admises du seul sujet Drapeaux (D41 d), notés par le vrai
// noter() sur la carte du monde. Les vues : nommer-vue, essai-reprise,
// chrono-vue, seance-vue, jouer.
import { existsSync, readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptesDe } from '../src/map/acceptes';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import {
  adresseDrapeau,
  chargerDrapeaux,
  drapeauxCharges,
  lireDrapeaux,
  oublierDrapeaux,
  prechargerDrapeaux,
  prechargerImages,
  prechargerJustes,
  attendreImages,
  type ManifesteDrapeaux,
} from '../src/map/drapeaux';
import { calculerPastilles } from '../src/map/pastilles';
import { noter, type ContexteCarte } from '../src/map/pick';
import { creerProjection } from '../src/map/projection';
import type { Transfo } from '../src/map/types';
import { optionsNoter, texteAdmis } from '../src/vues/commun';
import { choix, leurresParmi, leurresSosies, NB_CHOIX, SEUIL_SOSIE, sosiesDrapeau, type LieuQcm, type StrategieLeurres } from '../src/vues/qcm';
import { rendu } from '../src/vues/sujets';
import { textes } from '../src/vues/textes';

const MANIFESTE = JSON.parse(readFileSync('public/geo/drapeaux.json', 'utf8')) as ManifesteDrapeaux;
const DR = lireDrapeaux(MANIFESTE);
const NOMS = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
interface Zone extends LieuQcm {
  statut: string;
}
const PAYS = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Zone[];
const LIEUX = new Map(PAYS.map((p) => [p.id, p]));
const JOUABLES = new Set(PAYS.filter((p) => p.statut === 'jouable').map((p) => p.id));
const D = { noms: NOMS, drapeaux: DR };
const CAP = lireCapitales(
  JSON.parse(readFileSync('public/geo/capitales.json', 'utf8')) as LigneCapitales[],
  JSON.parse(readFileSync('public/geo/capitales.fr.json', 'utf8')) as NomsCapitales,
);
const JUMEAUX: [string, string][] = [
  ['IDN', 'MCO'],
  ['ROU', 'TCD'],
];

/** Générateur pseudo-aléatoire à graine (mulberry32). */
function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le texte d'un contenu et tout ce qu'il dirait d'un pays : alt, légende, adresse. */
const dit = (c: ReturnType<ReturnType<typeof rendu>['choix']>) => ('texte' in c ? c.texte : [c.alt, c.legende ?? '', c.image].join(' '));

describe('manifeste lu (src/map/drapeaux.ts)', () => {
  afterEach(() => oublierDrapeaux());

  it('chaque jouable a son drapeau montré, d[0], à une adresse faite de son empreinte seule, fichier présent', () => {
    for (const id of JOUABLES) {
      const d = DR.parPays.get(id);
      expect(d, id).toBeDefined();
      const ligne = MANIFESTE.pays.find((l) => l.pays === id)!;
      expect(d!.montre).toBe(adresseDrapeau(ligne.d[0]!));
      expect(d!.justes[0]).toBe(d!.montre);
      // L'adresse ne trahit pas le pays : ni son id, ni son code à deux lettres, seulement 8 chiffres hexadécimaux.
      expect(d!.montre).toMatch(/^\/geo\/drapeaux\/[0-9a-f]{8}\.svg$/);
      expect(existsSync(`public${d!.montre}`), d!.montre).toBe(true);
    }
  });

  it('D41 : Afghanistan et Bolivie ont deux drapeaux justes, le premier montré ; les jumeaux le sont l’un de l’autre', () => {
    for (const id of ['AFG', 'BOL']) {
      const d = DR.parPays.get(id)!;
      expect(d.justes).toHaveLength(2);
      expect(d.montre).toBe(adresseDrapeau(MANIFESTE.pays.find((l) => l.pays === id)!.d[0]!));
    }
    for (const [a, b] of JUMEAUX) {
      expect(DR.parPays.get(a)!.jumeaux).toEqual([b]);
      expect(DR.parPays.get(b)!.jumeaux).toEqual([a]);
    }
    expect(DR.parPays.get('BOL')!.sosies[0]).toEqual({ id: 'GHA', score: 0.04 });
    expect(DR.familles.get('croix-nordiques')).toContain('NOR');
    expect(() => lireDrapeaux({ pays: [{ pays: 'XXX', d: [], s: [] }], familles: {} })).toThrow(/XXX sans drapeau/);
  });

  it('chargerDrapeaux : le manifeste seul, lu une fois et gardé ; un échec ne reste pas en cache', async () => {
    const lus: string[] = [];
    let reussir = false;
    const lire = async (chemin: string) => {
      lus.push(chemin);
      if (!reussir) throw new Error('hors ligne');
      return MANIFESTE;
    };
    await expect(chargerDrapeaux(lire)).rejects.toThrow('hors ligne');
    expect(drapeauxCharges()).toBeNull();
    reussir = true;
    const [a, b] = await Promise.all([chargerDrapeaux(lire), chargerDrapeaux(lire)]);
    expect(a).toBe(b);
    expect(drapeauxCharges()).toBe(a);
    await chargerDrapeaux(lire);
    // Le manifeste seul : aucune image demandée au chargement.
    expect(lus).toEqual(['/geo/drapeaux.json', '/geo/drapeaux.json']);
    expect(a.parPays.get('FRA')!.montre).toBe(DR.parPays.get('FRA')!.montre);
  });

  it('préchargement : le drapeau montré de chaque pays, une seule fois par page ; rien sans manifeste ni hors d’une page', () => {
    const vus: string[] = [];
    const t = (a: string) => void vus.push(a);
    prechargerDrapeaux(['FRA'], null, t);
    expect(vus).toEqual([]);
    prechargerDrapeaux(['FRA', 'TCD', 'FRA', 'ZZZ'], DR, t);
    expect(vus).toEqual([DR.parPays.get('FRA')!.montre, DR.parPays.get('TCD')!.montre]);
    prechargerDrapeaux(['TCD', 'ROU', 'AFG'], DR, t);
    expect(vus.slice(2)).toEqual([DR.parPays.get('ROU')!.montre, DR.parPays.get('AFG')!.montre]);
    // Une séance (tous les justes : son énoncé de Trouver n'est tiré qu'à sa pose) : les deux drapeaux de la Bolivie.
    prechargerJustes(['BOL', 'FRA'], DR, t);
    expect(vus.slice(4)).toEqual([...DR.parPays.get('BOL')!.justes]);
    expect(vus.slice(4)).toHaveLength(2);
    // Une adresse (l'énoncé tiré, commun.ts prechargerEnonces) : une fois par page, comme les autres.
    prechargerImages([DR.parPays.get('AFG')!.justes[1]!, DR.parPays.get('BOL')!.justes[1]!], t);
    expect(vus.slice(6)).toEqual([DR.parPays.get('AFG')!.justes[1]]);
    // Sous node, sans Image : le défaut ne lève pas.
    expect(() => prechargerDrapeaux(['BEL'], DR)).not.toThrow();
    oublierDrapeaux();
    // Une page neuve : de nouveau demandé.
    prechargerDrapeaux(['FRA'], DR, t);
    expect(vus.at(-1)).toBe(DR.parPays.get('FRA')!.montre);
  });

  it('une partie attendue (décision « Images d’une épreuve ») : toutes ses images, dans l’ordre, une fois chacune ; le progrès n / N ; les échouées seules redemandées ; rien à attendre une fois toutes là', async () => {
    /** Les images factices demandées, chacune réussie ou échouée à la demande. */
    const faites: { a: string; ok: () => void; ko: () => void }[] = [];
    const charger = (a: string) =>
      new Promise<void>((ok, ko) => {
        faites.push({ a, ok, ko: () => ko(new Error('hors ligne')) });
      });
    const [a, b, c] = ['FRA', 'TCD', 'AFG'].map((id) => DR.parPays.get(id)!.montre) as [string, string, string];
    const progres: string[] = [];
    const p = attendreImages([a, b, a, c], (n, total) => void progres.push(`${n}/${total}`), charger)!;
    expect(faites.map((x) => x.a)).toEqual([a, b, c]);
    expect(progres).toEqual(['0/3']);
    // Une partie relancée pendant l'attente : les mêmes chargements, aucune nouvelle demande.
    const relance = attendreImages([c, a], undefined, charger)!;
    expect(faites).toHaveLength(3);
    faites[0]!.ok();
    faites[2]!.ok();
    faites[1]!.ko();
    expect(await p).toEqual([b]);
    expect(await relance).toEqual([]);
    expect(progres).toEqual(['0/3', '1/3', '2/3']);
    // De nouveau : seule l'échouée redemandée (une nouvelle image), les autres comptées d'avance.
    progres.length = 0;
    const q = attendreImages([a, b, c], (n, total) => void progres.push(`${n}/${total}`), charger)!;
    expect(faites.slice(3).map((x) => x.a)).toEqual([b]);
    faites[3]!.ok();
    expect(await q).toEqual([]);
    expect(progres).toEqual(['2/3', '3/3']);
    // Toutes là : rien à attendre, la partie part tout de suite ; hors d'une page (défaut, sans Image) non plus.
    expect(attendreImages([c, b, a], undefined, charger)).toBeNull();
    expect(faites).toHaveLength(4);
    expect(attendreImages([DR.parPays.get('BEL')!.montre])).toBeNull();
    // Une page neuve : tout se redemande.
    oublierDrapeaux();
    expect(attendreImages([a], undefined, charger)).not.toBeNull();
    expect(faites.at(-1)!.a).toBe(a);
  });

  it('une image attendue, dans une page : new Image(), son adresse, son décodage (decode)', async () => {
    const images: { src?: string; decoding?: string; onload?: () => void; onerror?: () => void }[] = [];
    let decode: () => Promise<void> = () => Promise.resolve();
    vi.stubGlobal(
      'Image',
      class {
        src?: string;
        decoding?: string;
        onload?: () => void;
        onerror?: () => void;
        constructor() {
          images.push(this);
        }
        decode() {
          return decode();
        }
      },
    );
    try {
      expect(await attendreImages([DR.parPays.get('NPL')!.montre])).toEqual([]);
      expect(images.map((i) => [i.src, i.decoding])).toEqual([[DR.parPays.get('NPL')!.montre, 'async']]);
      decode = () => Promise.reject(new Error('EncodingError'));
      // decode() rejette, mais l'image est chargée (un SVG sans width ni height, dans certains moteurs) : elle est arrivée.
      const che = attendreImages([DR.parPays.get('CHE')!.montre])!;
      images.at(-1)!.onload!();
      expect(await che).toEqual([]);
      // decode() rejette et le chargement échoue (hors ligne) : en échec.
      const dnk = attendreImages([DR.parPays.get('DNK')!.montre])!;
      images.at(-1)!.onerror!();
      expect(await dnk).toEqual([DR.parPays.get('DNK')!.montre]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('dans une page : new Image(), son adresse, décodage asynchrone', () => {
    const images: { src?: string; decoding?: string }[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src?: string;
        decoding?: string;
        constructor() {
          images.push(this);
        }
      },
    );
    try {
      prechargerDrapeaux(['NPL'], DR);
      expect(images).toEqual([{ src: DR.parPays.get('NPL')!.montre, decoding: 'async' }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('rendu du sujet Drapeaux (§ 5.3)', () => {
  const r = rendu('drapeaux', D);

  it('Trouver : « Pays de ce drapeau : » et l’image, alt « Drapeau à reconnaître », jamais le nom du pays', () => {
    for (const id of ['TCD', 'FRA', 'AFG', 'BOL']) {
      const e = r.enonce(id);
      expect(e.invite).toBe('Pays de ce drapeau : ');
      expect(e.objet).toEqual({ image: r.imageEnonce(id), alt: 'Drapeau à reconnaître' });
      expect(DR.parPays.get(id)!.justes).toContain(r.imageEnonce(id));
      expect(dit(e.objet)).not.toContain(NOMS[id]!);
      expect(dit(e.objet)).not.toContain(id);
    }
  });

  it('D41, décision « Drapeaux contestés et sosies » : en Trouver, l’Afghanistan et la Bolivie montrent l’un de leurs deux drapeaux au hasard, fixé pour la question ; en épreuve, le premier', () => {
    for (const id of ['AFG', 'BOL']) {
      const { justes, montre } = DR.parPays.get(id)!;
      expect(justes).toHaveLength(2);
      expect(justes[0]).toBe(montre);
      const vus = new Set<string>();
      for (let s = 1; s <= 30; s++) {
        const rs = rendu('drapeaux', D, { hasard: graine(s) });
        // Le préchargement (imageEnonce) d'abord, comme en Entraînement : l'énoncé posé ensuite montre le même.
        const a = rs.imageEnonce(id)!;
        expect(justes).toContain(a);
        for (let k = 0; k < 3; k++) expect(rs.enonce(id).objet).toEqual({ image: a, alt: 'Drapeau à reconnaître' });
        vus.add(a);
        // Le reste montre le premier, le même pour tous : bouton de Reconnaître, révélation (et carte retournée).
        expect(rs.choix(id, id)).toEqual({ image: montre, alt: '' });
        expect(rs.choix(id, 'FRA')).toEqual({ image: montre, alt: '' });
        expect(rs.revelation(id)).toEqual({ image: montre, alt: '', legende: NOMS[id] });
        // En épreuve classée : toujours le premier, quel que soit le hasard.
        const ep = rendu('drapeaux', D, { epreuve: true, hasard: graine(s) });
        expect(ep.enonce(id).objet).toEqual({ image: montre, alt: 'Drapeau à reconnaître' });
        expect(ep.imageEnonce(id)).toBe(montre);
      }
      expect(vus).toEqual(new Set(justes));
    }
    // Les deux bornes du hasard : le premier, puis le second.
    expect(rendu('drapeaux', D, { hasard: () => 0 }).imageEnonce('AFG')).toBe(DR.parPays.get('AFG')!.justes[0]);
    expect(rendu('drapeaux', D, { hasard: () => 0.999 }).imageEnonce('AFG')).toBe(DR.parPays.get('AFG')!.justes[1]);
    // Un pays à un seul drapeau : toujours lui ; sans image pour les autres sujets.
    expect(rendu('drapeaux', D, { hasard: () => 0.999 }).imageEnonce('FRA')).toBe(DR.parPays.get('FRA')!.montre);
    expect(rendu('pays', D).imageEnonce('FRA')).toBeNull();
    expect(rendu('capitales', { ...D, capitales: CAP }).imageEnonce('FRA')).toBeNull();
  });

  it('Reconnaître : « Quel est son drapeau ? », chaque choix l’image de son pays, alt vide ; visuel', () => {
    expect(r.consigneQcm('TCD')).toBe('Quel est son drapeau ?');
    expect(r.visuel).toBe(true);
    expect(rendu('pays', D).visuel).toBe(false);
    for (const id of ['TCD', 'ROU', 'IDN', 'MCO']) {
      const c = r.choix(id, 'FRA');
      expect(c).toEqual({ image: DR.parPays.get(id)!.montre, alt: '' });
      expect(dit(c)).not.toContain(NOMS[id]!);
    }
    // Le bon bouton : le drapeau montré (le tricolore de l'Afghanistan), jamais l'autre juste.
    expect(r.choix('AFG', 'AFG')).toEqual({ image: DR.parPays.get('AFG')!.montre, alt: '' });
    expect(r.choix('AFG', 'AFG')).not.toEqual(expect.objectContaining({ image: DR.parPays.get('AFG')!.justes[1] }));
  });

  it('après la réponse : « Révéler » montre le drapeau et nomme le pays ; rétroaction et bilans nomment le pays', () => {
    expect(r.revelation('BEN')).toEqual({ image: DR.parPays.get('BEN')!.montre, alt: '', legende: 'Bénin' });
    expect(r.retro('BEN')).toBe('Bénin');
    expect(r.nomChoix('ROU')).toBe('Roumanie');
    expect(r.nomBilan('BEN', 'nommer')).toBe('Bénin');
    expect(r.nomBilan('BEN', 'localiser')).toBe('Bénin');
    expect(r.textes.rate_oublie.replace('{nom}', r.nomBilan('BEN', 'nommer'))).toBe('Bénin : drapeau oublié');
    expect(r.point('BEN')).toBeNull();
    expect(r.points('BEN')).toEqual([]);
    expect(r.touche(null)).toBe('la mer');
    expect(r.lieu('MCO')).toBe('Monaco');
  });

  it('jumeaux : jamais leurres l’un de l’autre, jamais ensemble ; zones admises du seul sujet Drapeaux', () => {
    for (const [a, b] of JUMEAUX) {
      expect([...r.qcmExclus(a)]).toEqual([b]);
      expect(r.qcmPareils(a, b) && r.qcmPareils(b, a)).toBe(true);
      expect(r.admisEnPlus(a)).toEqual({ zones: [b], sorte: 'jumeau' });
    }
    expect(r.qcmPareils('FRA', 'BEL')).toBe(false);
    expect(r.admisEnPlus('FRA')).toBeNull();
    expect(r.qcmExclus('FRA').size).toBe(0);
    for (const s of ['pays', 'capitales', 'communes'] as const) {
      expect(rendu(s, { ...D, capitales: CAP }).admisEnPlus('IDN'), s).toBeNull();
      expect(rendu(s, { ...D, capitales: CAP }).qcmPareils('IDN', 'MCO'), s).toBe(false);
    }
    expect(texteAdmis(r, 'IDN', { zone: 'MCO', tenant: 'MCO', sorte: 'jumeau' })).toBe(' (même drapeau : Monaco)');
  });

  it('le manifeste en mémoire (chargerDrapeaux, comme sur le site) : les jumeaux sous Drapeaux seulement, pas sous Pays, Capitales ni Communes', async () => {
    oublierDrapeaux();
    await chargerDrapeaux(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
    try {
      expect(rendu('drapeaux', { noms: NOMS }).admisEnPlus('IDN')).toEqual({ zones: ['MCO'], sorte: 'jumeau' });
      for (const s of ['pays', 'capitales', 'communes'] as const) {
        expect(rendu(s, { noms: NOMS, capitales: CAP }).admisEnPlus('IDN'), s).toBeNull();
        expect(rendu(s, { noms: NOMS, capitales: CAP }).admisEnPlus('ROU'), s).toBeNull();
        // (Monaco reste exclu des leurres sous Capitales, mais pour une autre raison : au nom de sa capitale, D37 c.)
        expect(rendu(s, { noms: NOMS, capitales: CAP }).qcmPareils('IDN', 'MCO'), s).toBe(false);
      }
    } finally {
      oublierDrapeaux();
    }
  });

  it('chaque jouable se pose en QCM ; à défaut de manifeste, le rendu lève plutôt que de montrer un pays', () => {
    for (const id of JOUABLES) expect(r.qcmPosable(id), id).toBe(true);
    oublierDrapeaux();
    expect(() => rendu('drapeaux', { noms: NOMS })).toThrow(/manifeste pas chargé/);
  });
});

// Le vrai noter() sur la carte du monde (comme tests/acceptes.test.ts) : le
// doigt au centre de Monaco, la question demande l'Indonésie.
describe('jumeaux en Trouver (D41 d) : Monaco touché pour l’Indonésie, juste sous Drapeaux, faux sous Pays', () => {
  const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
  const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
  const L = 384;
  const H = 723;
  /** Un toucher au point d'étiquette de `zone` (zoom 40) noté pour `cible`, avec les options du rendu de ce sujet. */
  function toucher(sujet: 'drapeaux' | 'pays', cible: string, zone: string) {
    const proj = creerProjection('monde', L, H);
    const ll = donnees.entites.find((e) => e.pays.id === zone)!.pays.point;
    const b = proj(ll) as [number, number];
    const k = 40;
    const t: Transfo = { k, x: L / 2 - k * b[0], y: H / 2 - k * b[1] };
    const ctx: ContexteCarte = { proj, t, entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, k), acceptes: acceptesDe(donnees) };
    const rs = rendu(sujet, { noms: donnees.noms, drapeaux: DR });
    return noter(ctx, cible, L / 2, H / 2, optionsNoter(rs, { donnees }, cible));
  }

  it('Indonésie demandée, Monaco touché ; et l’inverse ; Roumanie et Tchad de même', () => {
    for (const [cible, zone] of [
      ['IDN', 'MCO'],
      ['MCO', 'IDN'],
      ['ROU', 'TCD'],
      ['TCD', 'ROU'],
    ] as const) {
      const sous = toucher('drapeaux', cible, zone);
      expect(sous, `${cible} ← ${zone}`).toMatchObject({ juste: true, distance_km: 0, admis: { zone, tenant: zone, sorte: 'jumeau' } });
      const pays = toucher('pays', cible, zone);
      expect(pays.juste, `${cible} ← ${zone} sous Pays`).toBe(false);
      expect(pays.admis).toBeNull();
    }
    // Un pays sans jumeau : la même note sous les deux sujets.
    expect(toucher('drapeaux', 'FRA', 'BEL').juste).toBe(false);
    expect(toucher('drapeaux', 'FRA', 'FRA').juste).toBe(true);
    // La table commune n'en sait rien : jamais Monaco pour l'Indonésie hors du sujet.
    expect(acceptesDe(donnees).get('IDN')?.some((z) => z.zone === 'MCO') ?? false).toBe(false);
  });
});

describe('leurres des drapeaux (qcm.choix)', () => {
  const r = rendu('drapeaux', D);
  const tirer = (id: string, g: () => number, strategie?: StrategieLeurres) =>
    choix(id, LIEUX, JOUABLES, g, { exclus: r.qcmExclus(id), pareils: r.qcmPareils, ...(strategie ? { strategie } : {}) });
  const sansJumeaux = (c: readonly string[]) => JUMEAUX.every(([a, b]) => !(c.includes(a) && c.includes(b)));

  it('Entraînement : les voisins d’abord, puis les plus proches ; jamais le jumeau de la cible, jamais deux jumeaux ; 4 pays distincts', () => {
    for (const id of JOUABLES) {
      for (let s = 1; s <= 3; s++) {
        const c = tirer(id, graine(s));
        expect(new Set(c).size, id).toBe(NB_CHOIX);
        expect(c).toContain(id);
        expect(sansJumeaux(c), `${id} : ${c.join(',')}`).toBe(true);
        const voisins = LIEUX.get(id)!.voisins.filter((v) => JOUABLES.has(v) && !r.qcmExclus(id).has(v));
        // Assez de voisins jouables : les 3 leurres en sont.
        if (voisins.length >= 3 && voisins.every((v) => !voisins.some((w) => r.qcmPareils(v, w)))) expect(c.filter((x) => x !== id).every((x) => voisins.includes(x)), id).toBe(true);
      }
    }
    // La France : Monaco, son voisin, en leurre possible ; l'Indonésie jamais avec lui.
    const vus = new Set<string>();
    for (let s = 1; s <= 40; s++) for (const x of tirer('FRA', graine(s))) vus.add(x);
    expect(vus.has('MCO')).toBe(true);
    expect(vus.has('IDN')).toBe(false);
  });

  it('jamais deux jumeaux parmi les 4, même proposés ensemble par une stratégie ; jamais le jumeau de la cible', () => {
    const forcee = [leurresParmi(() => ['IDN', 'MCO', 'ROU', 'TCD'])];
    for (let s = 1; s <= 30; s++) {
      const c = tirer('FRA', graine(s), forcee);
      expect(sansJumeaux(c), c.join(',')).toBe(true);
      expect(c.filter((x) => x === 'IDN' || x === 'MCO')).toHaveLength(1);
      expect(c.filter((x) => x === 'ROU' || x === 'TCD')).toHaveLength(1);
      // La cible Indonésie : jamais Monaco, ni par la stratégie ni par les plus proches.
      expect(tirer('IDN', graine(s), forcee)).not.toContain('MCO');
      expect(tirer('ROU', graine(s), forcee)).not.toContain('TCD');
    }
    // Sans l'option, la même stratégie les mettrait ensemble (ce que l'option empêche).
    const brut = choix('FRA', LIEUX, JOUABLES, graine(1), { strategie: [leurresParmi(() => ['IDN', 'MCO'])] });
    expect(brut).toEqual(expect.arrayContaining(['IDN', 'MCO']));
  });

  it('sosies (quiz moyen et au-delà, lot 4a) : mesurés sous le seuil, puis familles ; jamais un jumeau', () => {
    expect(SEUIL_SOSIE).toBe(0.3);
    expect(sosiesDrapeau(DR, 'MLI')).toEqual(['SEN', 'GIN', ...DR.familles.get('panafricaines')!.filter((x) => !['MLI', 'SEN', 'GIN'].includes(x))]);
    expect(sosiesDrapeau(DR, 'IDN')).toEqual(['SGP', 'POL', 'CHL']);
    expect(sosiesDrapeau(DR, 'NOR')).toEqual(expect.arrayContaining(['DNK', 'FIN', 'ISL', 'SWE']));
    for (const id of JOUABLES) {
      const s = sosiesDrapeau(DR, id);
      expect(s).not.toContain(id);
      for (const j of DR.parPays.get(id)!.jumeaux) expect(s).not.toContain(j);
    }
    // Trois sosies en leurres : pour le Mali, trois de ses sosies (Sénégal, Guinée, ou un drapeau panafricain).
    const duMali = sosiesDrapeau(DR, 'MLI');
    for (let s = 1; s <= 10; s++) {
      const c = tirer('MLI', graine(s), [leurresSosies(DR, 3)]);
      expect(c.filter((x) => x !== 'MLI').every((x) => duMali.includes(x)), c.join(',')).toBe(true);
      const i = tirer('IDN', graine(s), [leurresSosies(DR, 1)]);
      expect(i).not.toContain('MCO');
      expect(i.filter((x) => ['SGP', 'POL', 'CHL'].includes(x))).toHaveLength(1);
    }
  });

  it('les sosies ne servent pas en Entraînement : Reconnaître et Apprendre tirent avec la stratégie par défaut', () => {
    const src = readFileSync('src/vues/nommer.ts', 'utf8');
    expect(src).not.toMatch(/leurresSosies|sosiesDrapeau|strategie/);
  });
});
