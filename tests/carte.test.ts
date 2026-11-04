import { readFileSync } from 'node:fs';
import { geoContains, geoPath, type GeoProjection } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { contient, dansEmprise, distanceAuBordKm, versLonLat } from '../src/map/geo';
import { estUnToucher, SuiviPointeurs } from '../src/map/geste';
import { aPastille, calculerPastilles, PASTILLE, pastilleLaPlusProche, tailleEcranPx } from '../src/map/pastilles';
import { noter, pick, type ContexteCarte } from '../src/map/pick';
import { creerProjection, garderVue } from '../src/map/projection';
import { traceDirect, UNITE } from '../src/map/traces';
import type { Entite, NomProjection, Transfo } from '../src/map/types';
import { ciblesEssai } from '../src/vues/cibles';

// Carte du J0 sur les données réelles de public/geo, au format du téléphone de
// mesure (carte de 384 × 723 px CSS sous l'en-tête).

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const L = 384;
const H = 723;
const entite = (id: string): Entite => {
  const e = donnees.entites.find((en) => en.pays.id === id);
  if (!e) throw new Error(id);
  return e;
};

function contexte(nom: NomProjection = 'monde', t: Transfo = { k: 1, x: 0, y: 0 }): ContexteCarte {
  const proj = creerProjection(nom, L, H);
  return { proj, t, entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, t.k) };
}

/** Point écran d'un [lon, lat] dans un contexte. */
function ecran(ctx: ContexteCarte, ll: [number, number]): [number, number] {
  const b = ctx.proj(ll) as [number, number];
  return [ctx.t.k * b[0] + ctx.t.x, ctx.t.k * b[1] + ctx.t.y];
}

/** Transformation qui centre [lon, lat] au zoom k. */
function centrer(proj: GeoProjection, ll: [number, number], k: number): Transfo {
  const b = proj(ll) as [number, number];
  return { k, x: L / 2 - k * b[0], y: H / 2 - k * b[1] };
}

const PARIS: [number, number] = [2.35, 48.86];
const MOSCOU: [number, number] = [37.62, 55.75];

describe('projections', () => {
  it('la sphère entière tient dans la carte au zoom 1', () => {
    for (const nom of ['monde', 'pacifique'] as const) {
      const [[x0, y0], [x1, y1]] = geoPath(creerProjection(nom, L, H)).bounds({ type: 'Sphere' });
      expect(x0).toBeGreaterThanOrEqual(-0.01);
      expect(x1).toBeLessThanOrEqual(L + 0.01);
      expect(y0).toBeGreaterThanOrEqual(-0.01);
      expect(y1).toBeLessThanOrEqual(H + 0.01);
      expect(x1 - x0).toBeCloseTo(L, 0);
    }
  });

  it.each(['FJI', 'KIR'])('pacifique : %s d’un seul tenant (coupé en « monde »)', (id) => {
    const largeur = (nom: NomProjection) => {
      const [[x0], [x1]] = geoPath(creerProjection(nom, L, H)).bounds(entite(id).forme);
      return x1 - x0;
    };
    expect(largeur('monde')).toBeGreaterThan(0.9 * L); // de part et d'autre de l'antiméridien
    expect(largeur('pacifique')).toBeLessThan(0.15 * L);
  });
});

describe('redimensionnement', () => {
  it('garde le point central et l’échelle à l’écran à travers un retracé', () => {
    const rome: [number, number] = [12.45, 41.9];
    for (const nom of ['monde', 'pacifique'] as const) {
      const avant = { proj: creerProjection(nom, L, H), l: L, h: H };
      const t = centrer(avant.proj, rome, 17);
      for (const [l, h] of [[L, 420], [600, 900], [300, H]] as const) {
        const apres = { proj: creerProjection(nom, l, h), l, h };
        const t2 = garderVue(t, avant, apres, 400);
        const b = apres.proj(rome) as [number, number];
        expect(t2.k * b[0] + t2.x).toBeCloseTo(l / 2, 6);
        expect(t2.k * b[1] + t2.y).toBeCloseTo(h / 2, 6);
        expect(t2.k * apres.proj.scale()).toBeCloseTo(t.k * avant.proj.scale(), 6);
      }
    }
  });

  it('au zoom 1, ou si l’échelle tombe sous la carte entière : l’identité ; borné au zoom maximal', () => {
    const avant = { proj: creerProjection('monde', L, H), l: L, h: H };
    const grand = { proj: creerProjection('monde', 2 * L, 2 * H), l: 2 * L, h: 2 * H };
    expect(garderVue({ k: 1, x: 0, y: 0 }, avant, avant, 400)).toEqual({ k: 1, x: 0, y: 0 });
    expect(garderVue({ k: 1.5, x: -10, y: -10 }, avant, grand, 400)).toEqual({ k: 1, x: 0, y: 0 });
    expect(garderVue({ k: 300, x: -300 * 200, y: -300 * 300 }, grand, avant, 400).k).toBe(400); // 300 × 2 → 600, borné
  });
});

describe('tracés directs', () => {
  it.each(['monde', 'pacifique'] as const)('%s : mêmes emprises que geoPath, repli seulement où la coupure passe', (nom) => {
    const proj = creerProjection(nom, L, H);
    const replis: string[] = [];
    let ecart = 0;
    for (const e of donnees.entites) {
      const d = traceDirect(proj, e.forme);
      if (d === null) {
        replis.push(e.pays.id);
        continue;
      }
      // Rejoue les commandes relatives pour retrouver l'emprise.
      let x = 0;
      let y = 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const m of d.matchAll(/([Ml])(-?\d+),(-?\d+)/g)) {
        if (m[1] === 'M') [x, y] = [Number(m[2]), Number(m[3])];
        else [x, y] = [x + Number(m[2]), y + Number(m[3])];
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
      const [[a0, b0], [a1, b1]] = geoPath(proj).bounds(e.forme);
      ecart = Math.max(ecart, Math.abs(x0 / UNITE - a0), Math.abs(y0 / UNITE - b0), Math.abs(x1 / UNITE - a1), Math.abs(y1 / UNITE - b1));
    }
    expect(ecart).toBeLessThan(0.02);
    expect(replis.sort()).toEqual(nom === 'monde' ? [] : ['ATA', 'GRL']);
  });
});

describe('pastilles', () => {
  const proj = creerProjection('monde', L, H);
  const s = proj.scale();

  it('tous les micro-États jouables en ont une au zoom 1', () => {
    const ids = new Set(calculerPastilles(donnees.entites, proj, 1).map((p) => p.id));
    for (const e of donnees.entites) if (e.pays.micro && e.pays.statut === 'jouable') expect(ids.has(e.pays.id)).toBe(true);
  });

  it('jamais pour un territoire ou une entité contestée', () => {
    for (const id of ['ABW', 'NCL', 'NE_SOL', 'ESH']) expect(aPastille(entite(id).pays, s, 1)).toBe(false);
  });

  it('un micro-État la perd quand sa forme atteint la taille de la cible (44 px)', () => {
    const and = entite('AND').pays;
    const k44 = PASTILLE.micro_jusqua_px / tailleEcranPx(and, s, 1);
    expect(aPastille(and, s, k44 * 0.99)).toBe(true);
    expect(aPastille(and, s, k44 * 1.01)).toBe(false);
    // Le Vatican (0,01 km² chez Natural Earth) la garde jusqu'au zoom maximal.
    expect(aPastille(entite('VAT').pays, s, 400)).toBe(true);
  });

  it('un grand pays n’en a pas ; la France en a une, sans disque, au zoom 1 du téléphone', () => {
    const p = calculerPastilles(donnees.entites, proj, 1);
    expect(p.some((pa) => pa.id === 'BRA')).toBe(false);
    expect(p.find((pa) => pa.id === 'FRA')?.visible).toBe(false);
    expect(p.find((pa) => pa.id === 'MCO')?.visible).toBe(true);
  });

  it('deux cibles qui se chevauchent : la plus proche du doigt gagne', () => {
    const t = { k: 1, x: 0, y: 0 };
    const deux = [
      { id: 'A', bx: 100, by: 100, visible: true },
      { id: 'B', bx: 120, by: 100, visible: true },
    ];
    expect(pastilleLaPlusProche(deux, t, 108, 100)?.id).toBe('A');
    expect(pastilleLaPlusProche(deux, t, 112, 100)?.id).toBe('B');
    expect(pastilleLaPlusProche(deux, t, 141, 100)?.id).toBe('B'); // 21 px de B
    expect(pastilleLaPlusProche(deux, t, 143, 100)).toBeNull(); // 23 px : hors cible
    // Au zoom 10, les cibles gardent 22 px de rayon à l'écran.
    const t10 = { k: 10, x: 0, y: 0 };
    expect(pastilleLaPlusProche(deux, t10, 1000 + 21, 1000)?.id).toBe('A');
  });

  it('Caraïbes au zoom 1 : chaque île est touchable par son point, la plus proche gagne', () => {
    const ctx = contexte();
    for (const id of ['ATG', 'KNA', 'DMA', 'LCA', 'VCT', 'GRD', 'BRB']) {
      const [x, y] = ecran(ctx, entite(id).pays.point);
      expect(pick(ctx, x, y)?.id).toBe(id);
    }
  });
});

describe('contient', () => {
  it('même réponse que geoContains sur la forme entière (500 points tirés, toutes les entités)', () => {
    let graine = 42;
    const alea = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
    let dedans = 0;
    for (let i = 0; i < 500; i++) {
      const ll: [number, number] = [alea() * 360 - 180, alea() * 180 - 90];
      for (const e of donnees.entites) {
        if (!dansEmprise(e.pays.bbox, ll[0], ll[1], 0.05)) continue;
        const attendu = geoContains(e.forme, ll);
        expect(contient(e.forme, e.pays.bbox, ll)).toBe(attendu);
        if (attendu) dedans++;
      }
    }
    expect(dedans).toBeGreaterThan(100); // assez de points sur terre pour que le test dise quelque chose
  });
});

describe('pick', () => {
  it('Monaco au zoom 1 : sa pastille, pas la France', () => {
    const ctx = contexte();
    const [x, y] = ecran(ctx, entite('MCO').pays.point);
    expect(pick(ctx, x, y)).toMatchObject({ id: 'MCO', via: 'pastille' });
  });

  it('le Brésil au zoom 1 reste le Brésil malgré la cible du Paraguay à 17 px', () => {
    const ctx = contexte();
    const [x, y] = ecran(ctx, entite('BRA').pays.point);
    expect(pick(ctx, x, y)).toMatchObject({ id: 'BRA', via: 'trace' });
  });

  it('Rome zoomée : l’Italie ; le Vatican à moins de 11 px de son centre', () => {
    const proj = creerProjection('monde', L, H);
    const ctx = contexte('monde', centrer(proj, [12.45, 41.9], 60));
    const [vx, vy] = ecran(ctx, entite('VAT').pays.point);
    expect(pick(ctx, vx, vy)?.id).toBe('VAT');
    expect(pick(ctx, vx + 8, vy)?.id).toBe('VAT');
    expect(pick(ctx, vx + 18, vy)).toMatchObject({ id: 'ITA', via: 'trace' });
  });

  it('le centre de la France au zoom 1 : la France, malgré le disque du Luxembourg à ~5 px ; Andorre près de son disque', () => {
    const ctx = contexte();
    const [fx, fy] = ecran(ctx, entite('FRA').pays.point);
    expect(pick(ctx, fx, fy)?.id).toBe('FRA');
    const [ax, ay] = ecran(ctx, entite('AND').pays.point);
    expect(pick(ctx, ax + 1, ay)?.id).toBe('AND');
  });

  it('Paris zoomé : la France par son tracé', () => {
    const proj = creerProjection('monde', L, H);
    const ctx = contexte('monde', centrer(proj, PARIS, 20));
    expect(pick(ctx, L / 2, H / 2)).toMatchObject({ id: 'FRA', via: 'trace', distance_px: 0 });
  });

  it('en mer près d’une côte : le pays proche ; au large : rien ; hors de la sphère : rien', () => {
    const proj = creerProjection('monde', L, H);
    const ctx = contexte('monde', centrer(proj, [-9.6, 39], 20)); // ~10 px au large du Portugal
    const r = pick(ctx, L / 2, H / 2);
    expect(r).toMatchObject({ id: 'PRT', via: 'proche' });
    const large = contexte('monde', centrer(proj, [-30, 0], 20)); // milieu de l'Atlantique
    expect(pick(large, L / 2, H / 2)).toBeNull();
    expect(pick(contexte(), 2, 2)).toBeNull(); // coin, hors du contour d'Equal Earth
    expect(versLonLat(proj, { k: 1, x: 0, y: 0 }, 2, 2)).toBeNull();
  });
});

describe('pick : règles de la relecture V1', () => {
  it('le point de chaque pays jouable le désigne (zooms 1, 2, 4 ; monde et pacifique)', () => {
    // Relecture V1 : un pays sans pastille ne faisait pas concourir son point, tout
    // disque à moins de 11 px gagnait (FRA → LUX au zoom 2, ITA → SMR, VEN → TTO au zoom 1).
    const fautifs: string[] = [];
    for (const nom of ['monde', 'pacifique'] as const) {
      for (const k of [1, 2, 4]) {
        const ctx = contexte(nom, { k, x: 0, y: 0 });
        for (const e of donnees.entites) {
          if (e.pays.statut !== 'jouable' && e.pays.statut !== 'optionnel') continue;
          const [x, y] = ecran(ctx, e.pays.point);
          const r = pick(ctx, x, y);
          if (r?.id !== e.pays.id) fautifs.push(`${nom} k=${k} ${e.pays.id} → ${r?.id}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
    const z1 = contexte();
    expect(pick(z1, ...ecran(z1, entite('VEN').pays.point))).toMatchObject({ id: 'VEN', via: 'trace' });
    const z2 = contexte('monde', { k: 2, x: 0, y: 0 });
    expect(pick(z2, ...ecran(z2, entite('FRA').pays.point))?.id).toBe('FRA');
    expect(pick(z2, ...ecran(z2, entite('ITA').pays.point))?.id).toBe('ITA');
  });

  it('en mer, la cible invisible d’un pays de 4 à 10 px le désigne (le Maroc au zoom 1, côté Atlantique)', () => {
    const ctx = contexte();
    const mar = ctx.pastilles.find((p) => p.id === 'MAR');
    expect(mar?.visible).toBe(false);
    const [fx, fy] = ecran(ctx, entite('MAR').pays.point);
    let vus = 0;
    for (let i = 0; i < 32; i++) {
      const a = (2 * Math.PI * i) / 32;
      const [x, y] = [fx + 15 * Math.cos(a), fy + 15 * Math.sin(a)];
      const ll = versLonLat(ctx.proj, ctx.t, x, y);
      if (!ll || donnees.entites.some((e) => contient(e.forme, e.pays.bbox, ll))) continue; // pas en mer
      if (pastilleLaPlusProche(ctx.pastilles, ctx.t, x, y)?.id !== 'MAR') continue;
      expect(pick(ctx, x, y)).toMatchObject({ id: 'MAR', via: 'pastille' });
      vus++;
    }
    expect(vus).toBeGreaterThan(0);
  });

  it('sur un tracé : un disque voisin gagne à moins de 11 px s’il est plus près que le point du pays ; sinon le disque du pays à moins de 22 px, sinon le tracé', () => {
    // Pastilles posées à la main sur le Brésil (au zoom 2, ~120 px de large).
    const base = contexte('monde', { k: 2, x: 0, y: 0 });
    const [bx, by] = ecran(base, entite('BRA').pays.point);
    const avec = (doigt: [number, number], voisin: [number, number]) => {
      const ctx: ContexteCarte = {
        ...base,
        pastilles: [
          { id: 'BRA', bx: bx / 2, by: by / 2, visible: true },
          { id: 'PRY', bx: voisin[0] / 2, by: voisin[1] / 2, visible: true },
        ],
      };
      return pick(ctx, ...doigt);
    };
    // Doigt à 15 px du point du Brésil (son disque), à 8 px d'un disque voisin : le voisin.
    expect(avec([bx + 15, by], [bx + 15, by + 8])).toMatchObject({ id: 'PRY', via: 'pastille' });
    // Voisin à 12 px (> 11) : le disque du Brésil, à 15 px (< 22).
    expect(avec([bx + 15, by], [bx + 15, by + 12])).toMatchObject({ id: 'BRA', via: 'pastille' });
    // Voisin à 12 px, point du Brésil à 25 px (> 22, vers le nord) : le tracé.
    expect(avec([bx, by - 25], [bx + 12, by - 25])).toMatchObject({ id: 'BRA', via: 'trace' });
    // Voisin plus près que 11 px mais plus loin que le point du pays : le pays.
    expect(avec([bx + 5, by], [bx + 5, by + 9])).toMatchObject({ id: 'BRA', via: 'pastille' });
  });

  it('en mer près d’une côte : les sondes de 8 et de 12 px trouvent le pays', () => {
    const proj = creerProjection('monde', L, H);
    const ctx = contexte('monde', centrer(proj, [-9.6, 39], 20)); // au large du Portugal
    const distances = new Set<number>();
    for (let x = L / 2; x > L / 2 - 40; x--) {
      const r = pick(ctx, x, H / 2);
      if (r?.via === 'proche') {
        expect(r.id).toBe('PRT');
        distances.add(r.distance_px);
      }
    }
    expect([...distances].sort((a, b) => a - b)).toEqual([4, 8, 12]);
  });
});

describe('noter', () => {
  const proj = creerProjection('monde', L, H);

  it('un point dans Paris : France juste', () => {
    const ctx = contexte('monde', centrer(proj, PARIS, 20));
    expect(noter(ctx, 'FRA', L / 2, H / 2)).toMatchObject({ juste: true, via: 'trace', distance_km: 0 });
  });

  it('le Vatican au zoom 1 : juste en son point, faux sur la pastille plus proche d’un autre pays', () => {
    const ctx = contexte();
    const [x, y] = ecran(ctx, entite('VAT').pays.point);
    expect(noter(ctx, 'VAT', x, y)).toMatchObject({ juste: true, via: 'trace' });
    // Hors de son tracé (0,01 km²) mais sur son disque : juste par la pastille.
    expect(noter(ctx, 'VAT', x + 3, y)).toMatchObject({ juste: true, via: 'pastille' });
    // À 15 px, dans sa cible de 22 px mais plus près de celle de la Bulgarie : la carte désigne la Bulgarie.
    const voisin = noter(ctx, 'VAT', x + 15, y);
    expect(voisin.pick?.id).not.toBe('VAT');
    expect(voisin.juste).toBe(false);
    const loin = noter(ctx, 'VAT', x + 40, y);
    expect(loin.juste).toBe(false);
    expect(loin.distance_km).toBeGreaterThan(100);
  });

  it('la Russie demandée, Paris touché : distance au bord le plus proche (Kaliningrad), pas au centre', () => {
    const ctx = contexte('monde', centrer(proj, PARIS, 20));
    const n = noter(ctx, 'RUS', L / 2, H / 2);
    expect(n.juste).toBe(false);
    // Paris → frontière ouest de l'oblast de Kaliningrad : ~1 200 km (le point de la Russie est à plus de 4 000 km).
    expect(n.distance_km).toBeGreaterThan(1000);
    expect(n.distance_km).toBeLessThan(1400);
  });

  it('essai du J0 : juste si et seulement si le point est dans la cible ou que pick() la désigne (zooms 1, 2, 4, 8)', () => {
    // Points visés : le point de chaque autre pays jouable (sa pastille ou son
    // point d'étiquette), et des couronnes autour de la cible (5 à 30 px). Un
    // point hors de la cible que pick() attribue à un autre pays n'est jamais juste.
    const cibles = ciblesEssai(donnees.entites.map((e) => e.pays));
    const autres = donnees.entites.filter((e) => e.pays.statut === 'jouable' || e.pays.statut === 'optionnel');
    let autrePays = 0;
    for (const k of [1, 2, 4, 8]) {
      const ctx = contexte('monde', { k, x: 0, y: 0 });
      for (const c of cibles) {
        const [cx, cy] = ecran(ctx, entite(c).pays.point);
        const pastille = ctx.pastilles.find((p) => p.id === c);
        const [px, py] = pastille ? [k * pastille.bx, k * pastille.by] : [cx, cy];
        // Les autres pays proches seulement (à moins de 60 px) : au-delà, aucune tolérance ne joue.
        const points = autres
          .filter((e) => e.pays.id !== c)
          .map((e) => ecran(ctx, e.pays.point))
          .filter(([x, y]) => Math.hypot(x - px, y - py) < 60);
        for (const r of [5, 12, 18, 25, 30]) for (let i = 0; i < 16; i++) points.push([px + r * Math.cos((i * Math.PI) / 8), py + r * Math.sin((i * Math.PI) / 8)]);
        for (const [x, y] of points) {
          const p = pick(ctx, x, y);
          const n = noter(ctx, c, x, y);
          expect(n.pick).toEqual(p);
          if (p && p.id !== c) autrePays++;
          const ll = versLonLat(ctx.proj, ctx.t, x, y);
          const dedans = ll !== null && contient(entite(c).forme, entite(c).pays.bbox, ll);
          if (n.juste !== (dedans || p?.id === c)) throw new Error(`k=${k}, cible ${c}, (${x.toFixed(1)}, ${y.toFixed(1)}) : pick ${p?.id ?? 'mer'}, noté ${n.juste ? 'juste' : 'faux'}`);
        }
        // Le point où l'on touche la cible (celui de window.cartographe.carte.ecran) est juste.
        expect(noter(ctx, c, px, py).juste, `k=${k}, ${c} touché en son point`).toBe(true);
      }
    }
    expect(autrePays).toBeGreaterThan(1000); // le test touche bien d'autres pays
  }, 60_000);

  it('dans le tracé de l’Italie, sur le disque du Vatican : juste pour l’Italie (plan : « dedans »), la carte désigne le Vatican', () => {
    const ctx = contexte('monde', centrer(proj, [12.45, 41.9], 60));
    const [vx, vy] = ecran(ctx, entite('VAT').pays.point);
    const n = noter(ctx, 'ITA', vx + 8, vy);
    expect(n.pick?.id).toBe('VAT');
    expect(n).toMatchObject({ juste: true, via: 'trace', distance_km: 0 });
    expect(noter(ctx, 'VAT', vx + 8, vy)).toMatchObject({ juste: true, via: 'pastille' });
  });

  it('un toucher dans le tracé de la cible est toujours juste (cibles de l’essai, zooms 1, 2, 4, 8)', () => {
    // Relecture du J0 : quand noter() suivait pick(), la cible invisible du Maroc
    // prenait le centre de l'Algérie au zoom 1 (2 406 points sur 3 632 notés faux).
    const cibles = ciblesEssai(donnees.entites.map((e) => e.pays));
    for (const k of [1, 2, 4, 8]) {
      const ctx = contexte('monde', { k, x: 0, y: 0 });
      for (const c of cibles) {
        const e = entite(c);
        const [o, s, est, n] = e.pays.bbox;
        const larg = (est < o ? est + 360 : est) - o;
        for (let i = 0; i <= 20; i++) {
          for (let j = 0; j <= 20; j++) {
            const lon = ((o + (larg * i) / 20 + 540) % 360) - 180;
            const ll: [number, number] = [lon, s + ((n - s) * j) / 20];
            if (!contient(e.forme, e.pays.bbox, ll)) continue;
            const [x, y] = ecran(ctx, ll);
            if (!noter(ctx, c, x, y).juste) throw new Error(`k=${k}, ${c} touché en (${ll[0].toFixed(2)}, ${ll[1].toFixed(2)}) : noté faux (pick ${pick(ctx, x, y)?.id})`);
          }
        }
      }
    }
  }, 60_000);

  it('une cible invisible ne prend pas le tracé d’un autre pays : Algérie, Venezuela, Papouasie indonésienne', () => {
    const z1 = contexte();
    const [ax, ay] = ecran(z1, [2, 28]); // centre de l'Algérie, à ~10 px de la cible du Maroc
    expect(pick(z1, ax, ay)).toMatchObject({ id: 'DZA', via: 'trace' });
    const [ix, iy] = ecran(z1, [139, -4.5]); // Papouasie (Indonésie), voisine de la Papouasie-Nouvelle-Guinée
    expect(pick(z1, ix, iy)?.id).toBe('IDN');
    expect(noter(z1, 'PNG', ix, iy).juste).toBe(false);
    const k8 = contexte('monde', centrer(proj, [-61.5, 10.4], 8));
    const [vx, vy] = ecran(k8, [-62.6, 10]); // delta de l'Orénoque, face à Trinité (cible invisible à 22 px)
    expect(pick(k8, vx, vy)?.id).toBe('VEN');
    expect(noter(k8, 'TTO', vx, vy).juste).toBe(false);
  });

  it('un point dans la Russie : juste, distance nulle', () => {
    const ctx = contexte('monde', centrer(proj, MOSCOU, 10));
    expect(noter(ctx, 'RUS', L / 2, H / 2)).toMatchObject({ juste: true, distance_km: 0 });
  });

  it('distance au bord géodésique : un point au bord est à ~0 km', () => {
    const fra = entite('FRA').forme;
    const g = fra.geometry;
    const premier = (g.type === 'Polygon' ? g.coordinates[0]?.[0] : g.coordinates[0]?.[0]?.[0]) as [number, number];
    expect(distanceAuBordKm(fra, premier)).toBeLessThan(0.01);
  });
});

describe('toucher ou déplacer', () => {
  it('seuils : un doigt, < 10 px, < 500 ms', () => {
    const base = { doigts_max: 1, deplacement_px: 3, duree_ms: 120, annule: false };
    expect(estUnToucher(base)).toBe(true);
    expect(estUnToucher({ ...base, deplacement_px: 10 })).toBe(false);
    expect(estUnToucher({ ...base, duree_ms: 500 })).toBe(false);
    expect(estUnToucher({ ...base, doigts_max: 2 })).toBe(false);
    expect(estUnToucher({ ...base, annule: true })).toBe(false);
  });

  it('suivi des pointeurs : le point où le doigt s’est posé, jamais un geste', () => {
    const s = new SuiviPointeurs();
    s.bas(1, 100, 100, 0);
    s.bouge(1, 104, 103);
    expect(s.haut(1, 105, 103, 150)).toEqual({ x: 100, y: 100 });

    s.bas(1, 100, 100, 1000);
    s.bouge(1, 115, 100); // glissé de 15 px puis revenu : déplacement quand même
    expect(s.haut(1, 101, 100, 1100)).toBeNull();

    s.bas(1, 100, 100, 2000); // pincement : deux doigts, même immobiles
    s.bas(2, 200, 100, 2010);
    expect(s.haut(2, 200, 100, 2100)).toBeNull();
    expect(s.haut(1, 100, 100, 2110)).toBeNull();

    s.bas(1, 100, 100, 3000); // appui long
    expect(s.haut(1, 100, 100, 3600)).toBeNull();

    s.bas(1, 100, 100, 4000);
    expect(s.haut(1, 100, 100, 4100)).toEqual({ x: 100, y: 100 }); // l'état se remet à zéro
  });

  it('glissé de 8 px (toucher) pendant lequel la carte a suivi le doigt : le point de la carte visé à la pose', () => {
    // Belgique zoomée : l'Allemagne sous le doigt, les Pays-Bas 8 px à gauche
    // (preuve du relecteur, souris.mjs). La carte suit le doigt de 8 px vers la droite.
    const proj = creerProjection('monde', L, H);
    const t0 = centrer(proj, [6.6, 51.2], 50);
    const t1 = { ...t0, x: t0.x + 8 };
    const avant = contexte('monde', t0);
    const apres = contexte('monde', t1);
    const s = new SuiviPointeurs();
    // Un point de terre dont le pays change 8 px à gauche.
    let vise: [number, number] | null = null;
    for (let x = 100; x < L - 100 && !vise; x += 2)
      for (let y = 200; y < H - 200 && !vise; y += 2) {
        const a = pick(avant, x, y);
        if (a?.via === 'trace' && pick(avant, x - 8, y)?.id !== a.id) vise = [x, y];
      }
    if (!vise) throw new Error('aucun point de frontière trouvé');
    const [x, y] = vise;
    s.bas(1, x, y, 0, t0);
    for (let i = 1; i <= 8; i++) s.bouge(1, x + i, y);
    const p = s.haut(1, x + 8, y, 120, t1);
    expect(p).toEqual({ x: x + 8, y });
    expect(pick(apres, p!.x, p!.y)?.id).toBe(pick(avant, x, y)?.id);
    // L'ancien point (celui de la pose, lu avec la transformation d'après) désignait le voisin.
    expect(pick(apres, x, y)?.id).not.toBe(pick(avant, x, y)?.id);
    // Carte immobile (doigt sous la tolérance du système) : le point de la pose.
    s.bas(1, x, y, 1000, t0);
    expect(s.haut(1, x + 8, y, 1100, t0)).toEqual({ x, y });
  });
});
