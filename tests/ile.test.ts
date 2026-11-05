import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { geoContains, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { cadreMonde } from '../src/map/carte';
import { assembler } from '../src/map/donnees';
import { assemblerTerrain, dateCredit, type SourcesTerrain } from '../src/map/donnees-terrain';
import { calculerPastilles, tailleEcranPx } from '../src/map/pastilles';
import { noter, pick, type ContexteCarte } from '../src/map/pick';
import { creerProjection, garderVue } from '../src/map/projection';
import { cadreLocal, margeHaute, MARGES, projectionLocale, REUNION } from '../src/map/terrain';
import { fabriqueTraces } from '../src/map/traces';
import type { Entite, Lieu, Transfo } from '../src/map/types';
import { anneauPrincipal, empriseEcran, partVisible, versEcran, viser } from '../src/map/geo';
import { doitCadrer } from '../src/vues/qcm';
import { fmtKm, nomDe } from '../src/vues/commun';
import { remplir, textes } from '../src/vues/textes';

// Carte de l'île (unité C du #15) sur les données réelles de public/geo/reunion/
// (geodata/reunion.mjs), au format du téléphone de mesure (384 × 723 px CSS
// sous l'en-tête) : projection ajustée, tailles au zoom 1, pick et noter.

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const lieux = lire('reunion/communes.json') as Lieu[];
const sources = lire('reunion/sources.json') as SourcesTerrain;
const ile = assemblerTerrain(lire('reunion/communes.topo.json') as Topology<never>, REUNION.objet, lieux, lire('reunion/noms.fr.json'));
const emprise: GeoPermissibleObjects = { type: 'FeatureCollection', features: ile.entites.map((e) => e.forme) };
const L = 384;
const H = 723;

const commune = (id: string): Entite<Lieu> => {
  const e = ile.entites.find((en) => en.pays.id === id);
  if (!e) throw new Error(id);
  return e;
};
const SAINT_DENIS = '97411';
const SAINT_PIERRE = '97416';
const LE_PORT = '97407';

function contexte(l = L, h = H, t: Transfo = { k: 1, x: 0, y: 0 }): ContexteCarte {
  // Comme Carte avec cadreLocal : pas de pastilles.
  return { proj: projectionLocale(l, h, emprise), t, entites: ile.entites, pastilles: [] };
}

function ecran(ctx: ContexteCarte, ll: [number, number]): [number, number] {
  const b = ctx.proj(ll) as [number, number];
  return [ctx.t.k * b[0] + ctx.t.x, ctx.t.k * b[1] + ctx.t.y];
}

describe('données de l’île', () => {
  it('REUNION.n = longueur de communes.json ; toutes jouables, toutes assemblées', () => {
    expect(lieux).toHaveLength(REUNION.n);
    expect(ile.entites).toHaveLength(REUNION.n);
    expect(ile.entites.every((e) => e.pays.statut === 'jouable' && !e.pays.micro)).toBe(true);
    expect(ile.contestees).toEqual([]);
    expect(REUNION.dossier).toBe('/geo/reunion/');
  });

  it('traits : frontières entre communes et côtes', () => {
    const { interieurs, cotes } = ile.traits();
    expect(interieurs.length).toBeGreaterThan(20);
    expect(cotes.length).toBeGreaterThan(0);
  });

  it('noms par nomDe sur les données du terrain (pas « 97407 »)', () => {
    expect(nomDe(ile, LE_PORT)).toBe('Le Port');
    expect(nomDe(ile, '97404')).toBe('L’Étang-Salé');
    expect(nomDe(ile, SAINT_DENIS)).toBe('Saint-Denis');
    expect(nomDe(ile, 'XXX')).toBe('XXX');
  });
});

describe('projection de l’île', () => {
  it.each([
    [384, 723],
    [1280, 700],
    [320, 560],
  ])('%i × %i : l’emprise tient dans le cadre moins les marges, centrée, et le remplit dans un sens', (l, h) => {
    const [[x0, y0], [x1, y1]] = geoPath(projectionLocale(l, h, emprise)).bounds(emprise);
    const cadre = { x0: MARGES.cotes, y0: margeHaute(l), x1: l - MARGES.cotes, y1: h - Math.max(MARGES.basMin, MARGES.basPart * h) };
    expect(x0).toBeGreaterThanOrEqual(cadre.x0 - 0.5);
    expect(x1).toBeLessThanOrEqual(cadre.x1 + 0.5);
    expect(y0).toBeGreaterThanOrEqual(cadre.y0 - 0.5);
    expect(y1).toBeLessThanOrEqual(cadre.y1 + 0.5);
    expect((x0 + x1) / 2).toBeCloseTo((cadre.x0 + cadre.x1) / 2, 0);
    expect((y0 + y1) / 2).toBeCloseTo((cadre.y0 + cadre.y1) / 2, 0);
    const remplit = Math.abs(x1 - x0 - (cadre.x1 - cadre.x0)) < 1 || Math.abs(y1 - y0 - (cadre.y1 - cadre.y0)) < 1;
    expect(remplit).toBe(true);
  });

  // Hôtes de la carte (écran moins l'en-tête de ~109 px) : Galaxy A37, puis
  // 375 × 667, 360 × 640 et 320 × 560 d'écran.
  it.each([
    [384, 723],
    [375, 558],
    [360, 531],
    [320, 451],
  ])('hôte %i × %i : l’île sous la mention de la source et au-dessus de la barre de Nommer (~211 px + 8)', (l, h) => {
    const BARRE_NOMMER = 219;
    // Bas de la mention : 6 px + 14,6 px par ligne (0,7rem × 1,3).
    const CREDIT = l < MARGES.creditUneLigneDes ? 6 + 2 * 14.6 : 6 + 14.6;
    const [[, y0], [, y1]] = geoPath(projectionLocale(l, h, emprise)).bounds(emprise);
    expect(y0).toBeGreaterThanOrEqual(CREDIT + 4);
    expect(y1).toBeLessThanOrEqual(h - BARRE_NOMMER);
  });

  it('384 × 723 : l’île tient par la largeur, ~5,6 px/km, ~320 px de haut', () => {
    const [[x0, y0], [x1, y1]] = geoPath(projectionLocale(L, H, emprise)).bounds(emprise);
    expect(x1 - x0).toBeCloseTo(L - 2 * MARGES.cotes, 0);
    expect(y1 - y0).toBeGreaterThan(300);
    expect(y1 - y0).toBeLessThan(340);
    // Saint-Denis → Saint-Pierre, ~43 km à vol d'oiseau entre leurs points.
    const p = projectionLocale(L, H, emprise);
    const [a, b] = [p(commune(SAINT_DENIS).pays.point)!, p(commune(SAINT_PIERRE).pays.point)!];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(200);
  });

  it('rotation nulle : chaque commune se trace en projection directe (pas par geoPath)', () => {
    const p = projectionLocale(L, H, emprise);
    expect(p.rotate()).toEqual([0, 0, 0]);
    const d = fabriqueTraces((l, h) => projectionLocale(l, h, emprise), p);
    for (const e of ile.entites) expect(d(e.forme)).toMatch(/^M-?\d+,-?\d+l/);
  });

  it('un cadre minuscule (copie 1 × 1 de fabriqueTraces, hôte sans taille) ne donne pas d’échelle négative', () => {
    const p = projectionLocale(1, 1, emprise);
    expect(p.scale()).toBeGreaterThan(0);
    expect(Number.isFinite(p.translate()[0])).toBe(true);
  });

  it('cadreLocal : fond du CSS, borne = emprise élargie à l’écran, zoom 8, montrer 4, sans pastilles', () => {
    const c = cadreLocal(REUNION, emprise, textes.terrains.reunion.libelle);
    expect(c).toMatchObject({ fond: null, borne: emprise, borneHauteurEcran: true, zoomMax: 8, zoomMaxMontrer: 4, pastilles: false, libelle: 'Carte de La Réunion' });
    expect(c.projection(L, H).scale()).toBeCloseTo(projectionLocale(L, H, emprise).scale(), 6);
    const m = cadreMonde('monde');
    expect(m).toMatchObject({ fond: { type: 'Sphere' }, borne: { type: 'Sphere' }, borneHauteurEcran: false, zoomMax: 400, zoomMaxMontrer: 40, pastilles: true, libelle: 'Carte du monde' });
  });
});

describe('tailles au zoom 1 : pas de pastilles', () => {
  it.each([
    [384, 723],
    [320, 560],
    [375, 558],
    [360, 531],
  ])('%i × %i : chaque commune fait au moins 15 px (Le Port ~21)', (l, h) => {
    const p = projectionLocale(l, h, emprise);
    const tailles = ile.entites.map((e) => [e.pays.id, tailleEcranPx(e.pays, p.scale(), 1)] as const);
    for (const [id, t] of tailles) expect(t, id).toBeGreaterThanOrEqual(15);
    const port = tailles.find(([id]) => id === LE_PORT)![1];
    if (l === L) {
      expect(port).toBeGreaterThan(19);
      expect(port).toBeLessThan(25);
    }
  });

  it('tailleEcranPx sous-estime l’aire Mercator de cos φ au plus (borne basse)', () => {
    const p = projectionLocale(L, H, emprise);
    const port = commune(LE_PORT);
    const vraie = Math.sqrt(geoPath(p).area(port.forme));
    const estimee = tailleEcranPx(port.pays, p.scale(), 1);
    expect(estimee).toBeLessThan(vraie);
    expect(estimee / vraie).toBeGreaterThan(0.92);
  });

  it('calculerPastilles est vide de toute façon (micro: false, toutes au-dessus du seuil), zooms 1 à 8', () => {
    const p = projectionLocale(L, H, emprise);
    for (const k of [1, 2, 4, 8]) expect(calculerPastilles(ile.entites, p, k)).toEqual([]);
  });
});

describe('pick et noter sur l’île', () => {
  it('le point de chaque commune la désigne par son tracé (zooms 1, 2, 4, 8)', () => {
    for (const k of [1, 2, 4, 8]) {
      for (const e of ile.entites) {
        const base = contexte();
        const b = base.proj(e.pays.point)!;
        // La commune au centre de l'écran.
        const ctx = contexte(L, H, { k, x: L / 2 - k * b[0], y: H / 2 - k * b[1] });
        expect(pick(ctx, L / 2, H / 2), `${e.pays.id} k=${k}`).toEqual({ id: e.pays.id, via: 'trace', distance_px: 0 });
      }
    }
  });

  it('en pleine mer (55,0° E, 21,1° S) : rien', () => {
    const ctx = contexte();
    expect(pick(ctx, ...ecran(ctx, [55.0, -21.1]))).toBeNull();
  });

  it('à 1 px de la côte de Saint-Denis, en mer : Saint-Denis (au plus près)', () => {
    const ctx = contexte();
    const g = commune(SAINT_DENIS).forme.geometry;
    const anneau = (g.type === 'Polygon' ? g.coordinates : g.coordinates[0]!)[0]!;
    // Le sommet le plus au nord de Saint-Denis est sur sa côte (la mer au nord).
    const nord = anneau.reduce((a, p) => ((p[1] ?? 0) > (a[1] ?? 0) ? p : a));
    const [x, y] = ecran(ctx, [nord[0]!, nord[1]!]);
    const r = pick(ctx, x, y - 1);
    expect(r?.id).toBe(SAINT_DENIS);
    expect(r?.via).toBe('proche');
  });

  it('noter : juste dans la cible ; faux chez chaque voisine, à une distance positive (moins de 15 km depuis Le Port)', () => {
    const ctx = contexte();
    for (const e of ile.entites) {
      const n = noter(ctx, e.pays.id, ...ecran(ctx, e.pays.point));
      expect(n.juste, e.pays.id).toBe(true);
      expect(n.distance_km).toBe(0);
      for (const v of e.pays.voisins) {
        const f = noter(ctx, e.pays.id, ...ecran(ctx, commune(v).pays.point));
        expect(f.juste, `${e.pays.id} chez ${v}`).toBe(false);
        expect(f.pick?.id).toBe(v);
        expect(f.distance_km, `${e.pays.id} chez ${v}`).toBeGreaterThan(0);
        // Saint-Benoît (229 km²) met son point à 18 km d'Entre-Deux : la borne de 15 km vaut pour une petite voisine.
        expect(f.distance_km!, `${e.pays.id} chez ${v}`).toBeLessThan(v === LE_PORT ? 15 : 30);
      }
    }
  });

  it('Saint-Pierre demandé, Saint-Denis touché : de 30 à 55 km du bord', () => {
    const ctx = contexte();
    const n = noter(ctx, SAINT_PIERRE, ...ecran(ctx, commune(SAINT_DENIS).pays.point));
    expect(n.juste).toBe(false);
    expect(n.distance_km!).toBeGreaterThan(30);
    expect(n.distance_km!).toBeLessThan(55);
  });

  it('les îlots (Petite-Île, Saint-Paul en MultiPolygon) ne gênent ni pick ni noter', () => {
    const ctx = contexte();
    for (const id of ['97405', '97415']) {
      expect(commune(id).forme.geometry.type).toBe('MultiPolygon');
      expect(geoContains(commune(id).forme, commune(id).pays.point)).toBe(true);
      expect(noter(ctx, id, ...ecran(ctx, commune(id).pays.point)).juste).toBe(true);
    }
  });
});

describe('redimensionnement de l’île', () => {
  it('garderVue : le point central et l’échelle à l’écran gardés (Mercator : échelle + translation, affine)', () => {
    const avant = { proj: projectionLocale(L, H, emprise), l: L, h: H };
    const point = commune(SAINT_DENIS).pays.point;
    const b0 = avant.proj(point)!;
    const t = { k: 5, x: L / 2 - 5 * b0[0], y: H / 2 - 5 * b0[1] };
    for (const [l, h] of [[L, 420], [600, 900], [1280, 700]] as const) {
      const apres = { proj: projectionLocale(l, h, emprise), l, h };
      const t2 = garderVue(t, avant, apres, REUNION.zoomMax);
      const b = apres.proj(point)!;
      if (t2.k > 1 && t2.k < REUNION.zoomMax) {
        expect(t2.k * b[0] + t2.x).toBeCloseTo(l / 2, 6);
        expect(t2.k * b[1] + t2.y).toBeCloseTo(h / 2, 6);
        expect(t2.k * apres.proj.scale()).toBeCloseTo(t.k * avant.proj.scale(), 4);
      }
    }
    // Borné au zoom 8 de l'île.
    expect(garderVue({ k: 8, x: 0, y: 0 }, avant, { proj: projectionLocale(L / 2, H, emprise), l: L / 2, h: H }, REUNION.zoomMax).k).toBe(8);
  });
});

describe('le monde ne change pas', () => {
  // Empreintes relevées avec fabriqueTraces(nom, proj) d'avant les terrains
  // (commit ba3235d), 384 × 723 : tous les tracés, la France, le Groenland
  // (coupé par geoPath en « pacifique »).
  const lireMonde = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
  const monde = assembler(lireMonde('monde.topo.json') as Topology<never>, lireMonde('pays.json'), lireMonde('contestees.json'), lireMonde('noms.fr.json'));
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const ATTENDU = {
    monde: {
      tout: 'e84b73e4882d4fe7434991fabd9e9f627493bea495eab16ed8e55cc3e7a549c2',
      FRA: '0af5f2a104322c1bb4c4ed3aa275f53ab0414944f2178ac7d49c66ae9e76219f',
      GRL: '8f0b754916c19a1c4f98ec0007aec7bd50353c8a14319752b51dd1c17bbd6f08',
    },
    pacifique: {
      tout: 'a080c66ae7d04b4fd7ff265ca5b48c66823b649b9e7eb1a9741c1928379190a1',
      FRA: 'd0a4ca7617edb6ce74a35fa53bdb2f24e5ac8394ad061e1f7f60057a45146ad9',
      GRL: '52e861fc4f23406711b0243c07587b3e71cab583cd66cae35505a354b2fed63b',
    },
  } as const;

  it.each(['monde', 'pacifique'] as const)('fabriqueTraces (%s) : les mêmes tracés qu’avant, France et Groenland compris', (nom) => {
    const d = fabriqueTraces((l, h) => creerProjection(nom, l, h), creerProjection(nom, L, H));
    const trace = (id: string) => d(monde.entites.find((e) => e.pays.id === id)!.forme);
    expect(sha(trace('FRA'))).toBe(ATTENDU[nom].FRA);
    expect(sha(trace('GRL'))).toBe(ATTENDU[nom].GRL);
    const tout = monde.entites.map((e) => d(e.forme)).join('|') + '#' + monde.contestees.map((z) => d(z.forme)).join('|');
    expect(sha(tout)).toBe(ATTENDU[nom].tout);
  });

  it('cadreMonde : la projection du monde, à l’identique', () => {
    for (const nom of ['monde', 'pacifique'] as const) {
      const a = cadreMonde(nom).projection(L, H);
      const b = creerProjection(nom, L, H);
      expect(a.scale()).toBe(b.scale());
      expect(a.translate()).toEqual(b.translate());
      expect(a.rotate()).toEqual(b.rotate());
    }
  });
});

describe('crédits et textes', () => {
  it('date de la mention : la dernière mise à jour de sources.json, en JJ/MM/AAAA', () => {
    expect(sources.sources[0]?.mise_a_jour).toBe('2026-06-30');
    expect(dateCredit(sources)).toBe('30/06/2026');
    const sansMaj: SourcesTerrain = { ...sources, sources: [{ ...sources.sources[0]!, mise_a_jour: undefined }] };
    expect(dateCredit(sansMaj)).toBe('01/01/2026');
    expect(dateCredit({ sources: [], traitement: {} })).toBeNull();
  });

  it('mention sur la carte : source, date et licence, une ligne courte', () => {
    const m = remplir(textes.credits.carte, { date: '30/06/2026' });
    expect(m).toBe('IGN, ADMIN EXPRESS, à jour au 30/06/2026 · Licence Ouverte 2.0');
    // ~353 px en Inter à 0,7rem (11,2 px) : tient à 384 px moins 2 × 8 px.
    // Au-delà de 62 caractères, à remesurer (fontTools sur InterVariable.woff2).
    expect(m.length).toBeLessThanOrEqual(62);
    expect(textes.credits.reglages).toContain('Natural Earth');
    expect(textes.credits.reglages).toContain('IGN');
  });

  it('bloc terrains : monde et reunion ont les mêmes clés, sauf serie, detail, libelle', () => {
    const cles = (o: object) => Object.keys(o).sort();
    const { serie, detail, libelle, ...reste } = textes.terrains.reunion;
    expect([serie, detail, libelle]).toEqual(['La Réunion', "carte de l'île", 'Carte de La Réunion']);
    expect(cles(reste)).toEqual(cles(textes.terrains.monde));
    expect(remplir(textes.terrains.reunion.n, { n: REUNION.n })).toBe('24 communes');
  });

  it('fmtKm : une décimale sous 10 km, l’entier au-delà', () => {
    expect(fmtKm(2.43)).toBe('2,4 km');
    expect(fmtKm(0.04)).toBe('0,0 km');
    expect(fmtKm(9.96)).toBe('10 km');
    expect(fmtKm(12.4)).toBe('12 km');
    expect(fmtKm(106.2)).toBe('106 km');
  });
});

describe('cadrage de Nommer : la zone allumée au-dessus de la barre', () => {
  // allumer() (nommer.ts) sans DOM : au zoom 1, doitCadrer avec l'emprise du
  // polygone principal ; s'il le faut, la vue de montrer(id, hVisible)
  // (viser, centrée au-dessus de la barre). La barre de Nommer : ~211 px + 8.
  const BARRE_NOMMER = 219;
  type Proj = ReturnType<typeof projectionLocale>;
  function apres(proj: Proj, e: Entite<Lieu>, l: number, h: number, kMax: number): { vole: boolean; part: number; k: number } {
    const hV = h - BARRE_NOMMER;
    const anneau = anneauPrincipal(e.forme, e.pays.point);
    const emp = (t: Transfo) =>
      empriseEcran(anneau, (ll) => {
        const b = proj(ll);
        return b ? versEcran(t, b[0], b[1]) : null;
      });
    const b = proj(e.pays.point)!;
    let t: Transfo = { k: 1, x: 0, y: 0 };
    const vole = doitCadrer(versEcran(t, b[0], b[1]), tailleEcranPx(e.pays, proj.scale(), 1), l, hV, emp(t));
    if (vole) t = viser([b[0], b[1]], tailleEcranPx(e.pays, proj.scale(), 1), l, hV, kMax, emp({ k: 1, x: 0, y: 0 }));
    return { vole, part: partVisible(emp(t)!, l, hV), k: t.k };
  }

  it.each([
    [384, 723],
    [375, 667],
    [360, 640],
  ])('île %i × %i : au zoom 1 aucune commune ne fait voler la carte, chacune entière au-dessus de la barre', (l, h) => {
    const proj = projectionLocale(l, h, emprise);
    for (const e of ile.entites) {
      const r = apres(proj, e, l, h, REUNION.zoomMaxMontrer);
      expect(r.vole, e.pays.id).toBe(false);
      expect(r.part, e.pays.id).toBe(1);
    }
  });

  const lireMonde = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
  const monde = assembler(lireMonde('monde.topo.json') as Topology<never>, lireMonde('pays.json'), lireMonde('contestees.json'), lireMonde('noms.fr.json'));
  const europe = monde.entites.filter((e) => e.pays.continent === 'Europe' && e.pays.statut === 'jouable');

  it.each([
    [384, 723],
    [360, 640],
  ])('Europe %i × %i : au moins 90 %% du pays allumé au-dessus de la barre (Italie, Grèce, Croatie comprises)', (l, h) => {
    const proj = creerProjection('monde', l, h);
    expect(europe.length).toBeGreaterThan(40);
    for (const e of europe) {
      const r = apres(proj, e as Entite<Lieu>, l, h, 40);
      expect(r.part, `${e.pays.id} k=${r.k.toFixed(1)}`).toBeGreaterThanOrEqual(0.9);
    }
    // L'Italie : la Sicile et les Pouilles étaient sous la barre (vol centré sur toute la hauteur).
    expect(apres(proj, monde.entites.find((e) => e.pays.id === 'ITA') as Entite<Lieu>, l, h, 40).vole).toBe(true);
  });
});
