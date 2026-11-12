// Notation des zones contestées et des enclaves (décision « Zones contestées et
// enclaves », 06/11/2026 ; src/map/acceptes.ts, noter() de src/map/pick.ts)
// sur les données réelles de public/geo, au format du téléphone de mesure.
import { readFileSync } from 'node:fs';
import type { GeoProjection } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { acceptesDe, acceptesEnPlus, construireAcceptes, ENCLAVES } from '../src/map/acceptes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { distanceAuBordKm } from '../src/map/geo';
import { calculerPastilles } from '../src/map/pastilles';
import { noter, pick, type ContexteCarte } from '../src/map/pick';
import { creerProjection } from '../src/map/projection';
import type { Entite, Transfo } from '../src/map/types';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const acceptes = construireAcceptes(donnees);
const L = 384;
const H = 723;

const entite = (id: string): Entite => {
  const e = donnees.entites.find((en) => en.pays.id === id);
  if (!e) throw new Error(id);
  return e;
};
const zone = (id: string) => {
  const z = donnees.contestees.find((c) => c.info?.id === id);
  if (!z?.info) throw new Error(id);
  return z.info;
};

function centrer(proj: GeoProjection, ll: [number, number], k: number): Transfo {
  const b = proj(ll) as [number, number];
  return { k, x: L / 2 - k * b[0], y: H / 2 - k * b[1] };
}

/** Le contexte d'une carte centrée sur ll au zoom k, avec les zones admises ; le doigt au centre. */
function au(ll: [number, number], k = 40): { ctx: ContexteCarte; x: number; y: number } {
  const proj = creerProjection('monde', L, H);
  const t = centrer(proj, ll, k);
  return { ctx: { proj, t, entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, k), acceptes }, x: L / 2, y: H / 2 };
}

/** La note d'un toucher en ll pour la cible. */
function noteEn(cible: string, ll: [number, number], options?: { acceptes?: boolean }, k?: number) {
  const { ctx, x, y } = au(ll, k);
  return noter(ctx, cible, x, y, options);
}

describe('zones contestées : juste pour qui la tient et pour chaque revendiquant', () => {
  const crimee = zone('NE_B89').point;

  it('Crimée : juste pour la Russie (son tracé) et pour l’Ukraine (zone admise), qui le dit', () => {
    expect(noteEn('RUS', crimee)).toMatchObject({ juste: true, via: 'trace', admis: null });
    const ukr = noteEn('UKR', crimee);
    expect(ukr).toMatchObject({ juste: true, via: 'trace', distance_km: 0, admis: { zone: 'NE_B89', tenant: 'RUS', sorte: 'contestee' } });
    expect(ukr.pick?.id).toBe('RUS'); // la carte désigne toujours la Russie : la rétroaction le montre
    // Option désactivée (épreuve d'avant la date) : le de fait strict d'avant.
    const strict = noteEn('UKR', crimee, { acceptes: false });
    expect(strict).toMatchObject({ juste: false, admis: null });
    expect(strict.distance_km).toBeGreaterThan(0);
  });

  it('Donetsk et Louhansk : dans l’Ukraine de Natural Earth (v5.1.2, qui n’a pas l’annexion de 2022) : justes pour elle, faux pour la Russie', () => {
    for (const id of ['NE_C02', 'NE_C03']) {
      expect(noteEn('UKR', zone(id).point), id).toMatchObject({ juste: true, via: 'trace', admis: null });
      expect(noteEn('RUS', zone(id).point).juste, id).toBe(false);
    }
  });

  it('Somaliland (entité) : juste pour la Somalie, faux pour l’Éthiopie', () => {
    const p = entite('NE_SOL').pays.point;
    expect(noteEn('SOM', p)).toMatchObject({ juste: true, admis: { zone: 'NE_SOL', tenant: 'NE_SOL', sorte: 'contestee' } });
    expect(noteEn('SOM', p).pick?.id).toBe('NE_SOL');
    expect(noteEn('ETH', p).juste).toBe(false);
    expect(noteEn('SOM', p, { acceptes: false }).juste).toBe(false);
  });

  it('Chypre du Nord et la zone tampon : justes pour Chypre, faux pour la Turquie', () => {
    expect(noteEn('CYP', entite('NE_CYN').pays.point)).toMatchObject({ juste: true, admis: { zone: 'NE_CYN', sorte: 'contestee' } });
    expect(noteEn('CYP', entite('NE_CNM').pays.point)).toMatchObject({ juste: true, admis: { zone: 'NE_CNM', sorte: 'contestee' } });
    expect(noteEn('TUR', entite('NE_CYN').pays.point).juste).toBe(false);
  });

  it('Sahara occidental : l’ouest du mur est marocain (tracé) ; l’est du mur (ESH) admis pour le Maroc ; faux pour la Mauritanie', () => {
    expect(noteEn('MAR', zone('NE_B19').point)).toMatchObject({ juste: true, via: 'trace', admis: null });
    const est = entite('ESH').pays.point;
    expect(noteEn('MAR', est)).toMatchObject({ juste: true, admis: { zone: 'ESH', tenant: 'ESH', sorte: 'contestee' } });
    expect(noteEn('MRT', est).juste).toBe(false);
  });

  it('îlots espagnols au ras du Maroc (Perejil) : justes pour l’Espagne qui les tient comme pour le Maroc', () => {
    const p = zone('NE_B62').point;
    expect(noteEn('ESP', p, undefined, 20_000).juste).toBe(true);
    expect(noteEn('MAR', p, undefined, 20_000).juste).toBe(true);
  });

  it('Ceuta et Melilla (« Geo subunit » sans note chez NE, gardées à la main) : justes pour l’Espagne et pour le Maroc', () => {
    for (const id of ['NE_B60', 'NE_B61']) {
      expect(zone(id)).toMatchObject({ dans: ['ESP'], revendique_par: ['MAR'] });
      const p = zone(id).point;
      expect(noteEn('ESP', p, undefined, 2_000).juste, id).toBe(true);
      expect(noteEn('MAR', p, undefined, 2_000), id).toMatchObject({ juste: true, admis: { zone: id, tenant: 'ESP' } });
      expect(noteEn('DZA', p, undefined, 2_000).juste, id).toBe(false);
    }
  });

  it('un pays qui ne revendique rien n’y gagne rien', () => {
    expect(noteEn('POL', zone('NE_B89').point).juste).toBe(false);
  });

  it.each([
    ['TWN', 'CHN', 'JPN'], // Taïwan : juste pour la Chine, faux pour le Japon
    ['XKX', 'SRB', 'ALB'], // Kosovo : juste pour la Serbie, faux pour l'Albanie
  ])('%s, pays du paquet optionnel revendiqué en entier : juste pour %s comme le Somaliland pour la Somalie, faux pour %s', (id, rev, voisin) => {
    expect(entite(id).pays).toMatchObject({ statut: 'optionnel', revendique_par: [rev] });
    const p = entite(id).pays.point;
    const n = noteEn(rev, p);
    expect(n).toMatchObject({ juste: true, distance_km: 0, admis: { zone: id, tenant: id, sorte: 'contestee' } });
    expect(n.pick?.id).toBe(id);
    // La question sur le pays lui-même reste juste par son tracé, sans règle à dire.
    expect(noteEn(id, p)).toMatchObject({ juste: true, via: 'trace', admis: null });
    expect(noteEn(voisin, p).juste).toBe(false);
    // Sans les zones admises (option acceptes: false de noter) : le de fait strict.
    expect(noteEn(rev, p, { acceptes: false })).toMatchObject({ juste: false, admis: null });
  });
});

describe('enclaves : comptent pour le pays qui les entoure', () => {
  it.each([
    ['NE_KAB', 'KAZ', 'RUS'], // Baïkonour, loué à la Russie
    ['NE_USG', 'CUB', 'USA'], // Guantánamo
    ['NE_WSB', 'CYP', 'GBR'], // Akrotiri
    ['NE_ESB', 'CYP', 'GBR'], // Dhekelia
  ])('%s : juste pour %s, faux pour %s', (enclave, hote, autre) => {
    expect(ENCLAVES[enclave]).toBe(hote);
    const p = entite(enclave).pays.point;
    const n = noteEn(hote, p, undefined, 400);
    expect(n).toMatchObject({ juste: true, distance_km: 0, admis: { zone: enclave, tenant: enclave, sorte: 'enclave' } });
    expect(n.pick?.id).toBe(enclave);
    expect(noteEn(autre, p, undefined, 400).juste).toBe(false);
    expect(noteEn(hote, p, { acceptes: false }, 400).juste).toBe(false);
  });

  it('Guantánamo, enclave et entité revendiquée par Cuba : la sorte dite est « enclave »', () => {
    expect(acceptes.get('CUB')?.[0]).toMatchObject({ zone: 'NE_USG', sorte: 'enclave' });
  });
});

describe('hors des zones admises', () => {
  it('un toucher hors zone reste faux : Moscou pour l’Ukraine, Ankara pour Chypre', () => {
    expect(noteEn('UKR', [37.62, 55.75]).juste).toBe(false);
    expect(noteEn('CYP', [32.86, 39.93], undefined, 8).juste).toBe(false);
  });

  it('distance d’un faux : au bord de l’union (la cible et ses zones admises)', () => {
    // En Mauritanie, au sud-est du Sahara occidental : le Maroc commence au bord d'ESH.
    const ll: [number, number] = [-11, 21];
    const n = noteEn('MAR', ll, undefined, 8);
    expect(n.juste).toBe(false);
    expect(n.pick?.id).toBe('MRT');
    const auMaroc = distanceAuBordKm(entite('MAR').forme, n.lonlat!);
    const aEsh = distanceAuBordKm(entite('ESH').forme, n.lonlat!);
    expect(aEsh).toBeLessThan(auMaroc);
    expect(n.distance_km).toBeCloseTo(aEsh, 6);
    // Sans la règle, au bord du Maroc seul.
    expect(noteEn('MAR', ll, { acceptes: false }, 8).distance_km).toBeCloseTo(auMaroc, 6);
  });

  it('une entité admise désignée par la carte sans le doigt dessus (sa côte à moins de 12 px) compte aussi', () => {
    // En mer, dans le golfe d'Aden, à ~4 px de la côte du Somaliland au zoom 8.
    const { ctx, x, y } = au([46, 11.2], 8);
    const p = pick(ctx, x, y);
    expect(p).toMatchObject({ id: 'NE_SOL', via: 'proche' });
    expect(noter(ctx, 'SOM', x, y)).toMatchObject({ juste: true, via: 'proche', admis: { zone: 'NE_SOL' } });
  });

  it('île hachurée touchée en mer près de sa côte : juste pour le revendiquant dès qu’elle l’est pour le tenant (Kouriles, Mayotte)', () => {
    const cas: [string, string, string, number, number][] = [
      ['NE_B29', 'RUS', 'JPN', 8, 3], // Kouriles du Sud, zoom 8, doigt à 3 px
      ['NE_B22', 'FRA', 'COM', 40, 4], // Mayotte, zoom 40, doigt à 4 px
    ];
    for (const [id, tenant, rev, k, d] of cas) {
      const { ctx, x, y } = au(zone(id).point, k);
      let justes = 0;
      for (let i = 0; i < 8; i++) {
        const a = (2 * Math.PI * i) / 8;
        const [xx, yy] = [x + d * Math.cos(a), y + d * Math.sin(a)];
        const t = noter(ctx, tenant, xx, yy);
        const r = noter(ctx, rev, xx, yy);
        if (t.juste) expect(r.juste, `${id} ${rev} direction ${i}`).toBe(true);
        if (r.juste) justes++;
        if (r.juste && r.via === 'proche') expect(r.admis).toMatchObject({ zone: id, tenant, sorte: 'contestee' });
      }
      expect(justes, id).toBeGreaterThanOrEqual(6);
      // Loin de toute côte (40 px), faux, et le de fait strict ne doit rien à la sonde.
      expect(noter(ctx, rev, x + 40, y + 40).juste).toBe(false);
      expect(noter(ctx, rev, x + d, y, { acceptes: false }).juste).toBe(false);
    }
  });

  it('sans ctx.acceptes (tests, terrains locaux), le de fait strict', () => {
    const { ctx, x, y } = au(zone('NE_B89').point);
    expect(noter({ ...ctx, acceptes: undefined }, 'UKR', x, y).juste).toBe(false);
  });
});

describe('construction', () => {
  it('acceptesDe : une fois par jeu de données ; vide sans zone ni revendication (terrain local)', () => {
    expect(acceptesDe(donnees)).toBe(acceptesDe(donnees));
    const local = { entites: donnees.entites.filter((e) => e.pays.id === 'FRA'), contestees: [] };
    expect(acceptesDe(local).size).toBe(0);
  });

  it('table : chaque revendiquant jouable des repères, et rien pour le pays qui n’a rien', () => {
    const zonesDe = (c: string) => (acceptes.get(c) ?? []).map((z) => z.zone);
    expect(zonesDe('UKR')).toEqual(expect.arrayContaining(['NE_B89', 'NE_C02', 'NE_C03']));
    expect(zonesDe('KAZ')).toEqual(['NE_KAB']);
    expect(zonesDe('CYP')).toEqual(expect.arrayContaining(['NE_WSB', 'NE_ESB', 'NE_CYN', 'NE_CNM']));
    expect(zonesDe('MAR')).toEqual(expect.arrayContaining(['ESH', 'NE_B19', 'NE_B62', 'NE_B63', 'NE_B64', 'NE_B65']));
    expect(zonesDe('ARG')).toEqual(expect.arrayContaining(['FLK', 'SGS', 'NE_B12']));
    expect(zonesDe('ISL')).toEqual(['NE_B31']); // Rockall
    expect(acceptes.get('BEL')).toBeUndefined();
  });
});

describe('zones en plus d’un sujet (OptionsNoter.acceptes, étude J2 § 2.2) : Jérusalem sous Capitales (D36 i)', () => {
  const RAMALLAH: [number, number] = [35.2, 31.9];
  const TEL_AVIV: [number, number] = [34.78, 32.08];

  it('Israël (« Jérusalem ») : un toucher en Palestine juste avec la table du sujet, et dit ; faux sans elle', () => {
    const plus = acceptesEnPlus(donnees, 'ISR', ['PSE'], 'capitale')!;
    expect(noteEn('ISR', RAMALLAH).juste).toBe(false);
    const n = noter(au(RAMALLAH).ctx, 'ISR', L / 2, H / 2, { acceptes: plus });
    expect(n).toMatchObject({ juste: true, distance_km: 0, admis: { zone: 'PSE', tenant: 'PSE', sorte: 'capitale' } });
    // La table du sujet s'ajoute à celle de la carte, sans la remplacer : la Crimée reste juste pour l'Ukraine.
    const crimee = au([34.1, 45.0]);
    expect(noter(crimee.ctx, 'UKR', crimee.x, crimee.y, { acceptes: acceptesEnPlus(donnees, 'UKR', ['PSE'], 'capitale')! }).juste).toBe(true);
  });

  it('Palestine (« Jérusalem-Est ») : Israël juste ; la table commune n’en sait rien (Pays, Chrono classé)', () => {
    expect(noteEn('PSE', TEL_AVIV).juste).toBe(false);
    const n = noter(au(TEL_AVIV).ctx, 'PSE', L / 2, H / 2, { acceptes: acceptesEnPlus(donnees, 'PSE', ['ISR'], 'capitale')! });
    expect(n).toMatchObject({ juste: true, admis: { zone: 'ISR', sorte: 'capitale' } });
    expect(acceptes.get('PSE')?.some((z) => z.zone === 'ISR') ?? false).toBe(false);
    expect(acceptes.get('ISR')?.some((z) => z.zone === 'PSE') ?? false).toBe(false);
    // Une table pour une autre cible ne change rien.
    expect(noter(au(TEL_AVIV).ctx, 'PSE', L / 2, H / 2, { acceptes: acceptesEnPlus(donnees, 'JOR', ['ISR'], 'capitale')! }).juste).toBe(false);
  });
});
