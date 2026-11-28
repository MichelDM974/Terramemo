// Toucher et notation d'une zone marine (étude J2, § 4.4 ; lot 3a, partie C) :
// pickMer, noter par couche, l'océan noté avec ce qu'il allume (les Sargasses),
// sur les données réelles de public/geo, dans la vue du rendu par défaut (le
// globe qui tourne, vue.ts), au format du téléphone de mesure.
import { readFileSync } from 'node:fs';
import { geoDistance } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { acceptesDe, acceptesEnPlus, construireAcceptes } from '../src/map/acceptes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { contient, distanceAuBordKm, empriseEcran, RAYON_TERRE_KM, versEcran, versLonLat } from '../src/map/geo';
import { indexLieux } from '../src/map/lieux';
import { assemblerMers, zonesAllumees, zonesParties } from '../src/map/mers';
import { calculerPastilles, PASTILLE, tailleEcranPx } from '../src/map/pastilles';
import { noter, pickMer, type ContexteCarte } from '../src/map/pick';
import { cadre, placer, projectionDe, transfoDe, type VueGlobe } from '../src/map/vue';
import type { Entite, Mer } from '../src/map/types';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
const avecMers: DonneesCarte = { ...donnees, mers: couche.mers };
const lieux = indexLieux(avecMers);
const L = 384;
const H = 723;
const C = cadre(L, H);

const mer = (id: string): Entite<Mer> => {
  const e = couche.mers.find((m) => m.pays.id === id);
  if (!e) throw new Error(id);
  return e;
};

/** Le contexte de la vue v (Canvas et WebGL : contexte()), la couche marine posée ou non. */
function contexte(v: VueGlobe, posee = true): ContexteCarte {
  const proj = projectionDe(v.r, C);
  const ctx: ContexteCarte = { proj, t: transfoDe(v, C), entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, v.k), acceptes: acceptesDe(donnees) };
  return posee ? { ...ctx, mers: couche.mers, lieux } : ctx;
}

/** La vue au zoom k qui met ll au centre de l'écran (y libre : même au bord de l'ovale). */
const vueSur = (ll: [number, number], k: number): VueGlobe => placer(C, ll, L / 2, H / 2, k, true);

/** Point écran d'un [lon, lat]. */
function ecran(ctx: ContexteCarte, ll: [number, number]): [number, number] {
  const b = ctx.proj(ll) as [number, number];
  return versEcran(ctx.t, b[0], b[1]);
}

/** Le contexte centré sur ll au zoom k, et le doigt au centre. */
function au(ll: [number, number], k: number, r?: number): { ctx: ContexteCarte; x: number; y: number } {
  const v = vueSur(ll, k);
  const ctx = contexte(r === undefined ? v : { ...v, r });
  const [x, y] = ecran(ctx, ll);
  return { ctx, x, y };
}

const terre = (ll: [number, number]) => donnees.entites.find((e) => contient(e.forme, e.pays.bbox, ll)) ?? null;
const zoneDe = (ll: [number, number]) => couche.mers.find((e) => contient(e.forme, e.pays.bbox, ll)) ?? null;

/**
 * Aucun point de ces zones à 12 px ou moins de (x, y) à l'écran, sous une terre
 * ou non : le point est hors d'elles, et plus loin de leur bord (géodésique) que
 * tout point du cercle de 12 px (avec 10 % de marge).
 */
function loinDe(ctx: ContexteCarte, x: number, y: number, zones: readonly Entite<Mer>[]): boolean {
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  if (!ll) return false;
  let rayon = 0;
  for (let a = 0; a < 2 * Math.PI; a += Math.PI / 16) {
    const l2 = versLonLat(ctx.proj, ctx.t, x + 12 * Math.cos(a), y + 12 * Math.sin(a));
    if (l2) rayon = Math.max(rayon, geoDistance(ll, l2) * RAYON_TERRE_KM);
  }
  return zones.every((z) => !contient(z.forme, z.pays.bbox, ll) && distanceAuBordKm(z.forme, ll) > 1.1 * rayon);
}

describe('pickMer : la terre gagne au-delà de 12 px', () => {
  it('au milieu de l’Italie (zoom 20) : l’Italie, ni l’Adriatique ni la mer Tyrrhénienne ; faux, à la distance de la côte', () => {
    const { ctx, x, y } = au([12.6, 42.9], 20);
    for (const cible of ['adriat', 'tyrrhen', 'medit']) {
      const n = noter(ctx, cible, x, y);
      expect([cible, n.juste, n.pick?.id, n.pick?.via]).toEqual([cible, false, 'ITA', 'trace']);
      expect(n.distance_km).toBeGreaterThan(50);
    }
  });

  it('là où une zone déborde sur la terre (l’Algérie sous la Méditerranée, à 8 km de la côte), à plus de 12 px de la mer qu’on voit : la terre', () => {
    const ll: [number, number] = [-1, 35.6];
    expect(terre(ll)?.pays.id).toBe('DZA');
    expect(zoneDe(ll)?.pays.id).toBe('medit');
    const { ctx, x, y } = au(ll, 300);
    const n = noter(ctx, 'medit', x, y);
    expect([n.juste, n.pick?.id]).toEqual([false, 'DZA']);
    // Plus loin, au zoom 1, la côte est à moins de 12 px : juste, par la sonde.
    const loin = au(ll, 1);
    expect(noter(loin.ctx, 'medit', loin.x, loin.y)).toMatchObject({ juste: true, via: 'proche' });
  });

  it('la côte à 12 px : juste à 11 px de la mer, faux à 13 et plus (le Portugal, sa côte nord-sud, l’Atlantique à l’ouest)', () => {
    const { ctx, y } = au([-8.3, 40.6], 40);
    const vu = (x: number) => {
      const ll = versLonLat(ctx.proj, ctx.t, x, y) as [number, number];
      return zoneDe(ll)?.pays.id === 'atlant' && !terre(ll);
    };
    // Le bord de la mer qu'on voit sur la ligne du doigt : xb dans l'eau, le Portugal à moins d'1 px à l'est.
    let xb = L / 2;
    while (!vu(xb)) xb -= 0.25;
    expect(terre(versLonLat(ctx.proj, ctx.t, xb + 1, y) as [number, number])?.pays.id).toBe('PRT');
    for (const d of [1, 6, 11]) {
      const n = noter(ctx, 'atlant', xb + d, y);
      expect([d, n.juste, n.via, n.pick?.id]).toEqual([d, true, 'proche', 'atlant']);
    }
    for (const d of [13, 15, 30]) {
      const n = noter(ctx, 'atlant', xb + d, y);
      expect([d, n.juste, n.pick?.id]).toEqual([d, false, 'PRT']);
      expect(n.distance_km).toBeGreaterThan(0);
    }
  });

  it('le disque d’un micro-État n’est pas de la terre : sur le disque de Malte, hors de son tracé, c’est la Méditerranée', () => {
    const malte = donnees.entites.find((e) => e.pays.id === 'MLT')!;
    const ctx = contexte(vueSur([14.4, 35.9], 1));
    const [mx, my] = ecran(ctx, malte.pays.point);
    expect(ctx.pastilles.find((p) => p.id === 'MLT')?.visible).toBe(true);
    const [x, y] = [mx + 3, my];
    expect(terre(versLonLat(ctx.proj, ctx.t, x, y) as [number, number])).toBeNull();
    expect(noter(ctx, 'medit', x, y)).toMatchObject({ juste: true, via: 'trace', pick: { id: 'medit' } });
  });
});

describe('pickMer : la zone sous le doigt, la plus proche dans une fente', () => {
  it('une fente le long d’une côte (golfe de Syrte), ni terre ni zone : la zone la plus proche, par les sondes', () => {
    const ll: [number, number] = [19.8, 30.6];
    expect(terre(ll)).toBeNull();
    expect(zoneDe(ll)).toBeNull();
    const { ctx, x, y } = au(ll, 40);
    const p = pickMer(ctx, 'medit', x, y);
    expect(p).toMatchObject({ id: 'medit', via: 'proche' });
    expect(noter(ctx, 'medit', x, y)).toMatchObject({ juste: true, via: 'proche' });
    // Pour une autre mer, la fente est faux, au bord de cette mer.
    expect(noter(ctx, 'rouge', x, y)).toMatchObject({ juste: false, pick: { id: 'medit' } });
  });

  it('à 120° O sous 61° S : l’océan Austral, pas le Pacifique (qui s’arrête à 60,5° S)', () => {
    for (const k of [1, 8]) {
      const { ctx, x, y } = au([-120, -61], k);
      expect(pickMer(ctx, 'pacif', x, y)?.id).toBe('austral');
      expect(noter(ctx, 'austral', x, y)).toMatchObject({ juste: true, via: 'trace' });
      const n = noter(ctx, 'pacif', x, y);
      expect(n.juste).toBe(false);
      expect(n.distance_km).toBeGreaterThan(30);
      expect(n.distance_km).toBeLessThan(80);
    }
  });

  it('de part et d’autre de l’antiméridien : le Pacifique (à l’équateur) et Béring (à 58° N), à 179,9° E et à 179,9° O, à toutes les rotations', () => {
    for (const [cible, lat] of [['pacif', 0], ['bering', 58]] as const) {
      for (const lon of [179.9, -179.9, 179.99, -179.99]) {
        for (const r of [180, 0, 90, -90, 150, -150]) {
          for (const k of [1, 6]) {
            const { ctx, x, y } = au([lon, lat], k, r);
            if (!versLonLat(ctx.proj, ctx.t, x, y)) continue; // hors de l'écran à cette rotation
            const n = noter(ctx, cible, x, y);
            expect([cible, lon, r, k, n.juste]).toEqual([cible, lon, r, k, true]);
          }
        }
      }
    }
  });
});

describe('pickMer : une petite mer a un halo de 12 px, sur la terre et dans l’eau des autres mers', () => {
  const azov = mer('azov');

  /** Le point (x, y) est-il dans l'eau qu'on voit d'une de ces zones (hors des terres) ? */
  const eau = (ctx: ContexteCarte, x: number, y: number, zones: readonly Entite<Mer>[]) => {
    const ll = versLonLat(ctx.proj, ctx.t, x, y);
    return !!ll && zones.some((z) => contient(z.forme, z.pays.bbox, ll)) && !terre(ll);
  };

  /**
   * L'eau qu'on voit des zones visées, échantillonnée à 0,25 px sur leur
   * emprise à l'écran : la distance (px) d'un point à cette eau, à 0,2 px
   * près (indépendante des sondes de pickMer).
   */
  function eauDe(ctx: ContexteCarte, visees: readonly Entite<Mer>[]): (x: number, y: number) => number {
    const pts: [number, number][] = [];
    for (const z of visees) {
      const g = z.forme.geometry;
      const sommets = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat(2);
      const e = empriseEcran(sommets, (ll) => ecran(ctx, ll));
      if (!e) continue;
      for (let y = Math.floor(e[1]); y <= e[3]; y += 0.25) {
        for (let x = Math.floor(e[0]); x <= e[2]; x += 0.25) if (eau(ctx, x, y, [z])) pts.push([x, y]);
      }
    }
    return (x, y) => pts.reduce((m, [px, py]) => Math.min(m, Math.hypot(px - x, py - y)), Infinity);
  }

  /** Points (grille de pas px, à 30 px au plus de (cx, cy)) dans l'eau des zones touchées, avec leur distance à l'eau des zones visées. */
  function autour(ctx: ContexteCarte, cx: number, cy: number, touchees: readonly Entite<Mer>[], visees: readonly Entite<Mer>[], pas = 1): { x: number; y: number; d: number }[] {
    const distance = eauDe(ctx, visees);
    const res: { x: number; y: number; d: number }[] = [];
    for (let dy = -30; dy <= 30; dy += pas) {
      for (let dx = -30; dx <= 30; dx += pas) {
        const [x, y] = [Math.round(cx) + dx, Math.round(cy) + dy];
        if (eau(ctx, x, y, touchees)) res.push({ x, y, d: distance(x, y) });
      }
    }
    return res;
  }

  it('au zoom 1, Azov (moins de 10 px) touchée dans une autre mer : juste à 3 et 8 px de son eau, faux à 14 px et plus ; dans sa question seulement', () => {
    const ctx = contexte(vueSur([35, 45], 1));
    expect(tailleEcranPx(azov.pays, ctx.proj.scale(), 1)).toBeLessThan(PASTILLE.seuil_px);
    const [ax, ay] = ecran(ctx, azov.pays.point);
    const autres = couche.mers.filter((m) => m !== azov);
    const vus = { juste: 0, faux: 0 };
    for (const { x, y, d } of autour(ctx, ax, ay, autres, [azov])) {
      const touchee = zoneDe(versLonLat(ctx.proj, ctx.t, x, y)!)!.pays.id;
      if (Math.abs(d - 3) <= 0.5 || Math.abs(d - 8) <= 0.5) {
        vus.juste++;
        const n = noter(ctx, 'azov', x, y, { acceptes: false });
        expect([x, y, d, n.juste, n.via, n.pick?.id]).toEqual([x, y, d, true, 'proche', 'azov']);
        expect(n.pick!.distance_px).toBeLessThanOrEqual(Math.ceil(d) + 1);
        // Dans la question de la mer Noire, ce toucher dans la mer Noire est la mer Noire.
        if (touchee === 'noire') expect(noter(ctx, 'noire', x, y, { acceptes: false })).toMatchObject({ juste: true, via: 'trace', pick: { id: 'noire' } });
      } else if (d >= 14) {
        vus.faux++;
        const n = noter(ctx, 'azov', x, y, { acceptes: false });
        expect([x, y, d, n.juste, n.pick?.id]).toEqual([x, y, d, false, touchee]);
        expect(n.distance_km).toBeGreaterThan(0);
      }
    }
    expect(vus.juste).toBeGreaterThan(10);
    expect(vus.faux).toBeGreaterThan(10);
  });

  it('la mer Noire touchée pour Botnie (moins de 10 px au zoom 1) : faux, aucune eau de Botnie à 12 px', () => {
    const ctx = contexte(vueSur([30, 52], 1));
    expect(tailleEcranPx(mer('botnie').pays, ctx.proj.scale(), 1)).toBeLessThan(PASTILLE.seuil_px);
    const { x, y } = (() => {
      const [nx, ny] = ecran(ctx, mer('noire').pays.point);
      return { x: nx, y: ny };
    })();
    expect(eau(ctx, x, y, [mer('noire')])).toBe(true);
    expect(noter(ctx, 'botnie', x, y)).toMatchObject({ juste: false, pick: { id: 'noire', via: 'trace' } });
  });

  // Le halo ne joue que pour une cible de moins de 10 px : la mer Noire fait
  // ≈ 7 px au zoom 1, plus de 10 au zoom 2. La mer Égée touchée à 5 px de
  // l'eau de la mer Noire : juste au zoom 1, faux au zoom 2 (seule l'eau
  // qu'on voit compte). Une cible ignorée de sa taille (le halo pour toute
  // cible) fait échouer ce test.
  it('la mer Égée touchée à 5 px de la mer Noire, pour la mer Noire : juste au zoom 1 (≈ 7 px), faux au zoom 2 (plus de 10 px)', () => {
    const noire = mer('noire');
    for (const [k, juste] of [[1, true], [2, false]] as const) {
      const ctx = contexte(vueSur([28.5, 41], k));
      const taille = tailleEcranPx(noire.pays, ctx.proj.scale(), k);
      expect(taille < PASTILLE.seuil_px).toBe(juste);
      const [bx, by] = ecran(ctx, [29, 41.1]); // le Bosphore
      const points = autour(ctx, bx, by, [mer('egee')], [noire], 0.5).filter((p) => Math.abs(p.d - 5) <= 0.5);
      expect(points.length).toBeGreaterThan(2);
      for (const { x, y, d } of points) {
        const n = noter(ctx, 'noire', x, y, { acceptes: false });
        expect([k, x, y, d, n.juste, n.pick?.id]).toEqual([k, x, y, d, juste, juste ? 'noire' : 'egee']);
      }
    }
  });

  // Relecture : une fente (de l'eau qu'on voit, hors de toute zone) près
  // d'une petite mer suivait les sondes de pick sur les 50 zones, faux même à
  // 0,25 px de l'eau de la cible (l'Adriatique au zoom 1, prise par la mer
  // Ionienne à 4 px), juste avant le halo par la cible de 22 px.
  it.each([
    ['egee', 2, [199, 348.5]],
    ['adriat', 1, [190, 361.5]],
  ] as const)('le halo dans une fente aussi : %s au zoom %i, touchée dans une fente près de son eau, juste', (id, k, [x, y]) => {
    const ctx = contexte(vueSur(mer(id).pays.point, k));
    const ll = versLonLat(ctx.proj, ctx.t, x, y)!;
    expect([terre(ll), zoneDe(ll)]).toEqual([null, null]);
    expect(tailleEcranPx(mer(id).pays, ctx.proj.scale(), k)).toBeLessThan(PASTILLE.seuil_px);
    expect(noter(ctx, id, x, y, { acceptes: false })).toMatchObject({ juste: true, via: 'proche', pick: { id } });
  });

  it.each([
    ['egee', 2],
    ['adriat', 1],
    ['finlande', 1],
    ['botnie', 1],
  ] as const)('dans les fentes autour de %s (moins de 10 px, zoom %i) : juste à 10 px ou moins de son eau, faux à 13 px et plus', (id, k) => {
    const zone = mer(id);
    const ctx = contexte(vueSur(zone.pays.point, k));
    expect(tailleEcranPx(zone.pays, ctx.proj.scale(), k)).toBeLessThan(PASTILLE.seuil_px);
    const [cx, cy] = ecran(ctx, zone.pays.point);
    const distance = eauDe(ctx, [zone]);
    const vus = { juste: 0, faux: 0 };
    for (let dy = -30; dy <= 30; dy += 0.5) {
      for (let dx = -30; dx <= 30; dx += 0.5) {
        const [x, y] = [Math.round(cx) + dx, Math.round(cy) + dy];
        const ll = versLonLat(ctx.proj, ctx.t, x, y);
        if (!ll || terre(ll) || zoneDe(ll)) continue;
        const d = distance(x, y);
        if (d > 10 && d < 13) continue;
        const n = noter(ctx, id, x, y, { acceptes: false });
        vus[d <= 10 ? 'juste' : 'faux']++;
        expect([id, x, y, d, n.juste]).toEqual([id, x, y, d, d <= 10]);
      }
    }
    expect(vus.juste).toBeGreaterThan(5);
    expect(vus.faux).toBeGreaterThan(5);
  });

  it('jamais par-dessus une terre au-delà de 12 px : sur la terre à 14 à 21 px du point d’Azov et à plus de 12 px de son eau, faux (zoom 1 et 2)', () => {
    for (const k of [1, 2]) {
      const ctx = contexte(vueSur([35, 45], k));
      const [ax, ay] = ecran(ctx, azov.pays.point);
      let vus = 0;
      for (let a = 0; a < 2 * Math.PI; a += Math.PI / 16) {
        for (const d of [14, 18, 21]) {
          const [x, y] = [ax + d * Math.cos(a), ay + d * Math.sin(a)];
          const ll = versLonLat(ctx.proj, ctx.t, x, y);
          if (!ll || !terre(ll)) continue;
          // À plus de 12 px de la mer d'Azov : la terre.
          if (!loinDe(ctx, x, y, [azov])) continue;
          vus++;
          const n = noter(ctx, 'azov', x, y, { acceptes: false });
          expect([k, d, a, n.juste]).toEqual([k, d, a, false]);
        }
      }
      expect(vus).toBeGreaterThan(5);
    }
  });

  // Relecture : seules les sondes à 4, 8 et 12 px (8 directions) laissaient
  // passer une mer de 2 px entre elles, et rien n'était sondé sous 4 px : 40
  // touchers sur 61, sur la terre à 4 px ou moins de l'eau d'Azov, étaient
  // faux au zoom 1. La décision « Océans et mers » : la terre à moins de 12 px
  // de la mer demandée est juste.
  it.each([
    ['azov', [36, 46]],
    ['finlande', [25, 60]],
  ] as const)('la terre à 2 px ou moins de l’eau de %s, au zoom 1 et 2 : juste, par la sonde', (id, centre) => {
    const zone = mer(id);
    for (const k of [1, 2]) {
      const ctx = contexte(vueSur(centre as [number, number], k));
      const [ax, ay] = ecran(ctx, zone.pays.point);
      expect(eau(ctx, ax, ay, [zone])).toBe(true);
      let vus = 0;
      for (let a = 0; a < 2 * Math.PI; a += Math.PI / 32) {
        const [ux, uy] = [Math.cos(a), Math.sin(a)];
        // Le long du rayon, du point d'étiquette (dans l'eau) à la première terre.
        let d = 0;
        while (d < 40 && !terre(versLonLat(ctx.proj, ctx.t, ax + d * ux, ay + d * uy) as [number, number])) d += 0.25;
        if (d >= 40 || !eau(ctx, ax + (d - 0.25) * ux, ay + (d - 0.25) * uy, [zone])) continue;
        for (const plus of [0, 1, 2]) {
          const [x, y] = [ax + (d + plus) * ux, ay + (d + plus) * uy];
          if (!terre(versLonLat(ctx.proj, ctx.t, x, y) as [number, number])) continue;
          vus++;
          const n = noter(ctx, id, x, y, { acceptes: false });
          expect([id, k, a, plus, n.juste, n.via]).toEqual([id, k, a, plus, true, 'proche']);
        }
      }
      expect(vus).toBeGreaterThan(20);
    }
  });

  it('assez grande à l’écran (zoom 8), plus de halo : dans la mer Noire à 15 px du point d’Azov et à 3 px ou plus de son eau, faux', () => {
    const ctx = contexte(vueSur([36.5, 46], 8));
    expect(tailleEcranPx(azov.pays, ctx.proj.scale(), 8)).toBeGreaterThan(PASTILLE.seuil_px);
    const [ax, ay] = ecran(ctx, azov.pays.point);
    const distance = eauDe(ctx, [azov]);
    let essais = 0;
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 16) {
      const [x, y] = [ax + 15 * Math.cos(a), ay + 15 * Math.sin(a)];
      if (!eau(ctx, x, y, [mer('noire')]) || distance(x, y) < 3) continue;
      essais++;
      expect(noter(ctx, 'azov', x, y, { acceptes: false })).toMatchObject({ juste: false, pick: { id: 'noire', via: 'trace' } });
    }
    // Azov fait ~18 px au zoom 8 : peu de mer Noire à 15 px de son point, mais il y en a.
    expect(essais).toBeGreaterThan(0);
  });
});

describe('noter par couche', () => {
  it('une cible de pays ne parcourt jamais les mers : résultats inchangés, couche posée ou non', () => {
    const piege = new Proxy([] as Entite<Mer>[], {
      get() {
        throw new Error('les mers parcourues pour un pays');
      },
    });
    for (const [cible, ll, k] of [['FRA', [2.35, 48.86], 1], ['ITA', [12.6, 42.9], 4], ['ITA', [10, 43], 4], ['MLT', [14.4, 35.9], 1], ['PRT', [-9.5, 40.6], 10]] as const) {
      const v = vueSur(ll as [number, number], k);
      const sans = contexte(v, false);
      const avec = contexte(v);
      const [x, y] = ecran(sans, ll as [number, number]);
      const attendu = noter(sans, cible, x, y);
      expect(noter(avec, cible, x, y)).toEqual(attendu);
      expect(noter({ ...avec, mers: piege }, cible, x, y)).toEqual(attendu);
    }
  });

  it('cible inconnue : une erreur, comme toujours ; une cible marine avant la pose de la couche : une erreur qui le dit', () => {
    const avant = contexte(vueSur([0, 0], 1), false);
    expect(() => noter(avant, 'XXX', 10, 10)).toThrow('cible inconnue : XXX');
    expect(() => noter(avant, 'atlant', 10, 10)).toThrow(/cible avant sa couche : atlant/);
    const apres = contexte(vueSur([0, 0], 1));
    expect(() => noter(apres, 'XXX', 10, 10)).toThrow('cible inconnue : XXX');
    expect(() => noter(apres, 'nulpart', 10, 10)).toThrow('cible inconnue : nulpart');
    // Sans index commun (lieux), entites puis mers.
    const { lieux: _, ...sansIndex } = apres;
    const { x, y } = au([-30, 30], 1);
    expect(noter(sansIndex, 'atlant', x, y)).toMatchObject({ juste: true });
  });

  it('la note d’une mer : juste ou faux, la distance, ce que la carte désigne ; aucun point', () => {
    const { ctx, x, y } = au([-30, 30], 4);
    const juste = noter(ctx, 'atlant', x, y);
    expect(Object.keys(juste).sort()).toEqual(['admis', 'distance_km', 'juste', 'lonlat', 'pick', 'via']);
    expect(juste).toMatchObject({ juste: true, via: 'trace', distance_km: 0, admis: null, pick: { id: 'atlant', via: 'trace' } });
    const faux = noter(ctx, 'indien', x, y);
    expect(faux).toMatchObject({ juste: false, via: null, admis: null, pick: { id: 'atlant' } });
    expect(faux.distance_km).toBeCloseTo(distanceAuBordKm(mer('indien').forme, faux.lonlat!), 6);
    // Hors de la sphère : faux, sans distance.
    expect(noter(contexte(vueSur([0, 0], 1)), 'atlant', 1, 1)).toMatchObject({ juste: false, distance_km: null, pick: null });
  });
});

describe('l’océan noté avec ce qu’il allume : l’Atlantique et la mer des Sargasses', () => {
  const sargasse = mer('sargasse');

  it('la mer des Sargasses touchée pour l’Atlantique : juste via « trace », même sans zones admises', () => {
    const { ctx, x, y } = au(sargasse.pays.point, 4);
    expect(zoneDe(sargasse.pays.point)?.pays.id).toBe('sargasse');
    for (const acceptes of [true, false]) {
      expect(noter(ctx, 'atlant', x, y, { acceptes })).toMatchObject({ juste: true, via: 'trace', admis: null, pick: { id: 'sargasse' } });
    }
  });

  it('la mer des Sargasses demandée n’est qu’elle : l’Atlantique autour est faux, à la distance de son bord', () => {
    const ll: [number, number] = [-45, 28];
    expect(zoneDe(ll)?.pays.id).toBe('atlant');
    const { ctx, x, y } = au(ll, 4);
    const n = noter(ctx, 'sargasse', x, y);
    expect(n.juste).toBe(false);
    expect(n.distance_km).toBeCloseTo(distanceAuBordKm(sargasse.forme, n.lonlat!), 6);
  });

  // Ce que la couche du dessus peint d'une mer marquée (dessinerMarquesMers) :
  // les zones de zonesAllumees, effacées sous les tracés des pays. Là où elle
  // est peinte, noter est juste ; sur une terre à plus de 12 px de ces zones
  // (loinDe), faux. Grille de 10 px. Ici la règle sur les formes ; le même
  // test lu sur les chemins que peint la couche du dessus est dans
  // carte-canvas-dom.test.ts (relecture du lot 3a).
  it.each(['atlant', 'pacif', 'medit'])('toucher dessiné = noté : %s, à plusieurs rotations (dont l’antiméridien) et deux zooms', (cible) => {
    const allumees = zonesAllumees(cible, couche.mers.map((m) => m.pays)).map(mer);
    const centres: Record<string, [number, number][]> = {
      atlant: [[-30, 20], [-60, 30], [10, 40]],
      pacif: [[-170, 10], [180, 40], [150, 0]],
      medit: [[18, 36], [5, 40], [28, 34]],
    };
    const PAS = 10;
    const ratees: string[] = [];
    let justes = 0;
    let fausses = 0;
    for (const [lon, lat] of centres[cible]!) {
      for (const k of [1, 3]) {
        const ctx = contexte(vueSur([lon, lat], k));
        const peint: [number, number][] = [];
        const terres: [number, number][] = [];
        for (let y = PAS / 2; y < H; y += PAS) {
          for (let x = PAS / 2; x < L; x += PAS) {
            const ll = versLonLat(ctx.proj, ctx.t, x, y);
            if (!ll) continue;
            const sur = !!terre(ll);
            if (!sur && allumees.some((m) => contient(m.forme, m.pays.bbox, ll))) peint.push([x, y]);
            else if (sur) terres.push([x, y]);
          }
        }
        for (const [x, y] of peint) {
          justes++;
          const n = noter(ctx, cible, x, y, { acceptes: false });
          if (!n.juste) ratees.push(`${cible} r ${lon} k ${k} : peint en (${x}, ${y}), noté faux (${n.pick?.id})`);
        }
        for (const [x, y] of terres) {
          if (peint.some(([px, py]) => Math.hypot(px - x, py - y) <= 12) || !loinDe(ctx, x, y, allumees)) continue;
          fausses++;
          const n = noter(ctx, cible, x, y, { acceptes: false });
          if (n.juste) ratees.push(`${cible} r ${lon} k ${k} : terre loin en (${x}, ${y}), notée juste (${n.pick?.id})`);
        }
      }
    }
    expect(ratees).toEqual([]);
    expect(justes).toBeGreaterThan(40);
    expect(fausses).toBeGreaterThan(30);
  }, 60_000);
});

describe('un océan et ses mers : la sorte « partie » des zones admises (D43, § 4.4)', () => {
  const zones = couche.mers.map((m) => m.pays);
  /** Les zones admises du sujet Mers pour la cible (sa vue les passe à noter : OptionsNoter.acceptes, lot 3b). */
  const parties = (cible: string) => acceptesEnPlus(avecMers, cible, zonesParties(cible, zones), 'partie') ?? true;
  /** La note d'un toucher au point d'étiquette de la zone touchée, au zoom 8 ; avec les parties de la cible, ou non. */
  const touche = (cible: string, zone: string, avec = true) => {
    const { ctx, x, y } = au(mer(zone).pays.point, 8);
    expect(pickMer(ctx, zone, x, y)?.id).toBe(zone);
    return noter(ctx, cible, x, y, { acceptes: avec ? parties(cible) : false });
  };

  it('tirées des données (parents, interieure), dans l’ordre de mers.json : aucune liste écrite', () => {
    expect(zonesParties('atlant', zones)).toEqual(['nord', 'manche', 'irlande', 'gascogne', 'norvege', 'groenl', 'caraibes', 'sargasse', 'mexique', 'laurent', 'guinee', 'baffin', 'hudson']);
    expect(zonesParties('arctique', zones)).toEqual(['norvege', 'groenl', 'baffin', 'hudson', 'barents', 'kara', 'beaufort']);
    expect(zonesParties('pacif', zones)).toEqual(['bering', 'okhotsk', 'japon', 'jaune', 'chineor', 'chinemer', 'thailand', 'corail', 'californ']);
    expect(zonesParties('indien', zones)).toEqual(['arabie', 'oman', 'aden', 'bengale', 'andaman', 'mozamb']);
    expect(zonesParties('austral', zones)).toEqual([]);
    expect(zonesParties('medit', zones)).toEqual(['adriat', 'egee', 'ionienne', 'tyrrhen']);
    expect(zonesParties('noire', zones)).toEqual(['azov']);
    expect(zonesParties('baltique', zones)).toEqual(['botnie', 'finlande']);
    expect(zonesParties('barents', zones)).toEqual(['blanche']);
    expect(zonesParties('chinemer', zones)).toEqual(['thailand']);
    // La Caspienne pour elle seule : sans partie, partie de rien.
    expect(zonesParties('caspien', zones)).toEqual([]);
    for (const z of zones) expect(zonesParties(z.id, zones), z.id).not.toContain('caspien');
    // Une mer intérieure ne mène jamais à un océan, ni ce qui passe par elle.
    for (const o of zones.filter((z) => z.sorte === 'océan')) {
      for (const p of zonesParties(o.id, zones)) expect(zones.find((z) => z.id === p)?.interieure, `${o.id} ← ${p}`).toBe(false);
    }
  });

  it('acceptesEnPlus trouve les zones marines (donnees.mers) : chacune tenue par elle-même, désignable par pickMer', () => {
    const a = acceptesEnPlus(avecMers, 'atlant', ['caraibes', 'inconnue'], 'partie');
    expect(a?.get('atlant')).toEqual([{ zone: 'caraibes', tenant: 'caraibes', sorte: 'partie', forme: mer('caraibes').forme, bbox: mer('caraibes').pays.bbox, entite: true }]);
    // Avant la couche : rien à admettre.
    expect(acceptesEnPlus(donnees, 'atlant', ['caraibes'], 'partie')).toBeNull();
    // Jamais dans la table commune : sous Pays (et partout ailleurs que la vue du sujet Mers), rien ne change.
    expect([...construireAcceptes(avecMers).values()].flat().some((z) => z.sorte === 'partie')).toBe(false);
  });

  it.each([
    ['caraibes', 'atlant'],
    ['nord', 'atlant'],
    ['manche', 'atlant'],
    ['guinee', 'atlant'],
    ['thailand', 'chinemer'],
    ['thailand', 'pacif'],
    ['adriat', 'medit'],
    ['egee', 'medit'],
    ['azov', 'noire'],
    ['blanche', 'barents'],
    ['hudson', 'arctique'],
    ['hudson', 'atlant'],
    ['botnie', 'baltique'],
    ['finlande', 'baltique'],
    ['norvege', 'atlant'],
    ['norvege', 'arctique'],
    ['groenl', 'atlant'],
    ['groenl', 'arctique'],
  ])('%s touchée pour %s : juste, et Note.admis dit la partie', (zone, cible) => {
    const n = touche(cible, zone);
    expect(n).toMatchObject({ juste: true, via: 'trace', distance_km: 0, admis: { zone, tenant: zone, sorte: 'partie' }, pick: { id: zone } });
    // Sans les zones admises (acceptes: false) : la cible et ce qu'elle allume seulement.
    expect(touche(cible, zone, false).juste).toBe(false);
  });

  it.each([
    ['blanche', 'arctique'],
    ['medit', 'atlant'],
    ['noire', 'atlant'],
    ['baltique', 'atlant'],
    ['adriat', 'atlant'],
    ['azov', 'atlant'],
    ['botnie', 'atlant'],
    ['finlande', 'atlant'],
    ['rouge', 'indien'],
    ['persique', 'indien'],
    ['caspien', 'atlant'],
    ['caspien', 'noire'],
  ])('%s touchée pour %s : faux (une zone intérieure sur le chemin, ou aucun chemin)', (zone, cible) => {
    const n = touche(cible, zone);
    expect(n).toMatchObject({ juste: false, admis: null, pick: { id: zone } });
    expect(n.distance_km).toBeGreaterThan(0);
  });

  it('la Méditerranée près de Gibraltar, pour l’Atlantique : faux, à courte distance ; la mer des Sargasses : juste, sans zone admise', () => {
    const { ctx, x, y } = au([-4.5, 36.1], 8);
    const n = noter(ctx, 'atlant', x, y, { acceptes: parties('atlant') });
    expect([n.juste, n.pick?.id]).toEqual([false, 'medit']);
    expect(n.distance_km).toBeLessThan(250);
    expect(touche('atlant', 'sargasse')).toMatchObject({ juste: true, admis: null });
    expect(touche('atlant', 'sargasse', false)).toMatchObject({ juste: true, admis: null });
  });

  it('la côte d’une partie à moins de 12 px, la terre sous le doigt : juste par la sonde (la Floride sur le golfe du Mexique, pour l’Atlantique)', () => {
    const { ctx, y } = au([-82.5, 28], 20);
    // La terre au doigt, la mer qu'on voit à l'ouest : le golfe du Mexique.
    let x = L / 2;
    expect(terre(versLonLat(ctx.proj, ctx.t, x, y) as [number, number])?.pays.id).toBe('USA');
    while (!(zoneDe(versLonLat(ctx.proj, ctx.t, x, y) as [number, number])?.pays.id === 'mexique' && !terre(versLonLat(ctx.proj, ctx.t, x, y) as [number, number]))) x -= 0.25;
    const n = noter(ctx, 'atlant', x + 8, y, { acceptes: parties('atlant') });
    expect(n).toMatchObject({ juste: true, via: 'proche', admis: { zone: 'mexique', sorte: 'partie' } });
    expect(noter(ctx, 'atlant', x + 8, y, { acceptes: false }).juste).toBe(false);
  });
});
