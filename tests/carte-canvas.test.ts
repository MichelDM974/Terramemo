import { readFileSync } from 'node:fs';
import { geoContains, geoPath } from 'd3-geo';
import type { Polygon } from 'geojson';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { calque, calqueLeger, ILE_LEGERE_KM, parcourir, sommetsVisibles, type Calque } from '../src/map/carte-canvas';
import { ancre, decalages, image, MARGE_PX, passeCoupure, preparer, tracerPartie, visible, type ContexteTrace, type ImageTrace, type Partie } from '../src/map/dessin';
import { assembler, formesLegeres, type DonneesCarte } from '../src/map/donnees';
import { contient, versLonLat } from '../src/map/geo';
import { SuiviPointeurs } from '../src/map/geste';
import { calculerPastilles } from '../src/map/pastilles';
import { noter, pick, type ContexteCarte } from '../src/map/pick';
import type { Entite, Transfo } from '../src/map/types';
import {
  cadre,
  dePlan,
  ecartLon,
  facteurG,
  normaliserLon,
  placer,
  pointVirtuel,
  projectionDe,
  projectionEcran,
  regionVisible,
  suivrePoint,
  transfoDe,
  versPlan,
  vueDeTransfo,
  type VueGlobe,
} from '../src/map/vue';
import { ciblesEssai } from '../src/vues/cibles';

// Rendu Canvas : la carte qui tourne (vue.ts, dessin.ts), sur les données
// réelles, au format du téléphone de mesure (carte de 384 × 723 px CSS).

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const L = 384;
const H = 723;
const C = cadre(L, H);
const entite = (id: string): Entite => {
  const e = donnees.entites.find((en) => en.pays.id === id);
  if (!e) throw new Error(id);
  return e;
};

function contexte(v: VueGlobe): ContexteCarte {
  const proj = projectionDe(v.r, C);
  return { proj, t: transfoDe(v, C), entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, v.k) };
}

/** Point écran d'un [lon, lat] dans une vue. */
function ecran(v: VueGlobe, ll: [number, number]): [number, number] {
  const b = projectionDe(v.r, C)(ll) as [number, number];
  const t = transfoDe(v, C);
  return [t.k * b[0] + t.x, t.k * b[1] + t.y];
}

const centrer = (ll: [number, number], k: number) => placer(C, ll, L / 2, H / 2, k);

let graine = 7;
const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;

describe('vue qui tourne', () => {
  it('au zoom 1 : l’ovale entier centré, quelle que soit la rotation', () => {
    for (const r of [0, 90, 150, 180, -60]) {
      const v = placer(C, [r, 0], L / 2, H / 2, 1);
      expect(v.r).toBeCloseTo(normaliserLon(r), 9);
      expect(transfoDe(v, C)).toMatchObject({ k: 1, x: 0, y: 0 });
      // Un glissé vertical ne déplace pas l'ovale (plus bas que l'écran) ; il tourne toujours.
      const v2 = placer(C, pointVirtuel(v, C, 100, 300), 160, 500, 1);
      expect(v2.y).toBe(0);
      expect(ecartLon(v.r, v2.r)).toBeLessThan(0);
    }
  });

  it('glissé : le point de la sphère sous le doigt reste sous le doigt (zooms 1 à 400, toute rotation)', () => {
    let essais = 0;
    for (let i = 0; i < 400; i++) {
      const k = Math.exp(alea() * Math.log(400));
      const v = centrer([alea() * 360 - 180, alea() * 160 - 80], k);
      const [x0, y0] = [20 + alea() * (L - 40), 20 + alea() * (H - 40)];
      const ll = versLonLat(projectionDe(v.r, C), transfoDe(v, C), x0, y0);
      if (!ll || Math.abs(ll[1]) > 89.9) continue; // hors de l'ovale, ou sur la ligne d'un pôle (longitude mal définie à l'inverse)
      const [x1, y1] = [x0 + (alea() - 0.5) * 300, y0 + (alea() - 0.5) * 300];
      const v1 = placer(C, pointVirtuel(v, C, x0, y0), x1, y1, k);
      const [ex, ey] = ecran(v1, ll);
      // Un doigt sorti de l'ovale sur le parallèle du point : le point a fait le tour (un tour d'écart).
      const tour = 2 * Math.PI * k * C.s * facteurG(ll[1]);
      const dx = Math.abs(ex - x1) > tour / 2 ? Math.abs(Math.abs(ex - x1) - tour) : Math.abs(ex - x1);
      // y est borné (l'ovale reste à l'écran) : le doigt peut alors sortir de la ligne du point.
      if (Math.abs(v1.y - (y1 - y0 + v.y)) < 1e-6) expect(Math.hypot(dx, ey - y1)).toBeLessThan(1e-6);
      else expect(dx).toBeLessThan(1e-6);
      essais++;
    }
    expect(essais).toBeGreaterThan(200);
  });

  it('ailleurs qu’au parallèle du doigt, un point glisse de dx·G(φ)/G(φ du doigt)', () => {
    const v = centrer([0, 0], 2);
    const v1 = placer(C, pointVirtuel(v, C, L / 2, H / 2), L / 2 + 100, H / 2, 2); // 100 px sur l'équateur
    for (const [phi, rapport] of [[30, 0.94], [60, 0.75], [-60, 0.75]] as const) {
      const [a] = ecran(v, [10, phi]);
      const [b] = ecran(v1, [10, phi]);
      expect((b - a) / 100).toBeCloseTo(facteurG(phi) / facteurG(0), 9);
      expect((b - a) / 100).toBeCloseTo(rapport, 2);
    }
    expect(facteurG(90) / facteurG(0)).toBeCloseTo(0.59, 2);
  });

  it('tour complet : glisser de 2π·k·s·G(φ) px, en 50 pas, ramène la vue', () => {
    for (const [k, phi] of [[1, 0], [6, 45], [40, -30]] as const) {
      const v = centrer([37, phi], k);
      const ancre = pointVirtuel(v, C, L / 2, H / 2);
      const tour = 2 * Math.PI * k * C.s * facteurG(ancre[1]);
      let w = v;
      const rs: number[] = [];
      for (let i = 1; i <= 50; i++) {
        w = placer(C, ancre, L / 2 - (tour * i) / 50, H / 2, k);
        rs.push(w.r);
      }
      expect(ecartLon(v.r, w.r)).toBeCloseTo(0, 9);
      expect(w.y).toBeCloseTo(v.y, 9);
      // La vue est passée par toutes les longitudes, vers l'est (glissé vers la gauche).
      const pas = rs.map((r, i) => ecartLon(i ? (rs[i - 1] as number) : v.r, r));
      for (const d of pas) expect(d).toBeCloseTo(360 / 50, 6);
    }
  });

  it('pincement : le point entre les doigts reste entre les doigts, rotation comprise', () => {
    const v = centrer([12, 42], 3);
    const [a, b] = [[150, 300], [250, 380]] as const;
    const milieu: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ll = versLonLat(projectionDe(v.r, C), transfoDe(v, C), ...milieu) as [number, number];
    // Les doigts s'écartent ×2 et glissent ensemble de (-90, 40).
    const nouveau: [number, number] = [milieu[0] - 90, milieu[1] + 40];
    const v1 = placer(C, pointVirtuel(v, C, ...milieu), ...nouveau, 6);
    expect(v1.k).toBe(6);
    const [ex, ey] = ecran(v1, ll);
    expect(Math.hypot(ex - nouveau[0], ey - nouveau[1])).toBeLessThan(1e-6);
  });

  it('toucher : le point visé à la pose, rendu dans la vue du lever (carte tournée de 8 px)', () => {
    const v0 = centrer([150, -20], 20);
    const t0: Transfo = transfoDe(v0, C);
    const v1 = placer(C, pointVirtuel(v0, C, 200, 300), 208, 300, 20);
    const t1 = transfoDe(v1, C);
    const s = new SuiviPointeurs((de, vers, x, y) =>
      suivrePoint(C, { r: de.r ?? 0, k: de.k, y: de.y }, { r: vers.r ?? 0, k: vers.k, y: vers.y }, x, y),
    );
    s.bas(1, 200, 300, 0, t0);
    for (let i = 1; i <= 8; i++) s.bouge(1, 200 + i, 300);
    const p = s.haut(1, 208, 300, 120, t1);
    expect(p?.x).toBeCloseTo(208, 6);
    expect(p?.y).toBeCloseTo(300, 6);
  });

  it('transformation plane du pilote (zoomer) : le point qu’elle met au centre y est', () => {
    const v = placer(C, [0, 0], L / 2, H / 2, 1);
    const [px, py] = ecran(v, [2.35, 48.86]); // Paris au zoom 1
    const k = 20;
    const w = vueDeTransfo({ k, x: L / 2 - k * px, y: H / 2 - k * py }, C, v.r, 400);
    const [ex, ey] = ecran(w, [2.35, 48.86]);
    expect(Math.hypot(ex - L / 2, ey - H / 2)).toBeLessThan(1e-6);
    expect(w.k).toBe(20);
    // Une transformation déjà centrée (transfo()) revient telle quelle.
    const u = vueDeTransfo(transfoDe(w, C), C, 0, 400);
    expect(u.r).toBeCloseTo(w.r, 9);
    expect(u.y).toBeCloseTo(w.y, 9);
  });

  it('montrer : plan de van Wijk et Nuij aller-retour, longitude déroulée', () => {
    const v = centrer([178, -17.8], 30);
    const w = dePlan(versPlan(v, C), C, 400);
    expect(ecartLon(v.r, w.r)).toBeCloseTo(0, 9);
    expect(w.k).toBeCloseTo(30, 9);
    expect(w.y).toBeCloseTo(v.y, 6);
  });
});

/**
 * Enregistre les segments tracés (sous-chemins de moveTo en lineTo) ; sert aussi
 * de contexte à geoPath. remplir : chaque sous-chemin est refermé, comme fill().
 */
function enregistreur(remplir = false): ContexteTrace & { segments: [number, number, number, number][]; beginPath(): void; closePath(): void; arc(): void } {
  let dernier: [number, number] = [0, 0];
  let debut: [number, number] = [0, 0];
  const segments: [number, number, number, number][] = [];
  return {
    segments,
    moveTo(x, y) {
      if (remplir && (dernier[0] !== debut[0] || dernier[1] !== debut[1])) segments.push([dernier[0], dernier[1], debut[0], debut[1]]);
      dernier = debut = [x, y];
    },
    lineTo(x, y) {
      segments.push([dernier[0], dernier[1], x, y]);
      dernier = [x, y];
    },
    closePath() {
      segments.push([dernier[0], dernier[1], debut[0], debut[1]]);
      dernier = debut;
    },
    rect(x, y, l, h) {
      this.moveTo(x, y);
      this.lineTo(x + l, y);
      this.lineTo(x + l, y + h);
      this.lineTo(x, y + h);
      this.lineTo(x, y);
    },
    beginPath() {},
    arc() {},
  };
}

/** Le segment touche-t-il le rectangle [0, L] × [0, H] (Liang-Barsky) ? */
function toucheEcran([x0, y0, x1, y1]: [number, number, number, number]): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [p, q] of [[-dx, x0], [dx, L - x0], [-dy, y0], [dy, H - y0]] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

describe('dessin : découpage de ce qui est hors de l’écran', () => {
  const complet = calque(donnees);
  // Les polygones de chaque partie, dans l'ordre de preparer().
  const polygones: Polygon[][] = donnees.entites.map((e) => {
    const g = e.forme.geometry;
    return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((coordinates) => ({ type: 'Polygon', coordinates }));
  });

  it('rien de visible n’est sauté : une partie écartée n’a ni trait à l’écran ni coin de l’écran en elle (300 vues)', () => {
    // Vérité de terrain indépendante du tracé : geoPath de d3 (rotation, découpe à
    // l'antiméridien, rééchantillonnage) avec la même projection, à l'écran.
    let ecartees = 0;
    let gardees = 0;
    for (let i = 0; i < 300; i++) {
      const k = Math.exp(alea() * Math.log(400));
      const v = centrer([alea() * 360 - 180, alea() * 170 - 85], k);
      const im = image(v, C, regionVisible(v, C, MARGE_PX));
      const proj = projectionDe(v.r, C);
      const t = transfoDe(v, C);
      const projEcran = projectionEcran(v, C);
      const coins = [[0, 0], [L, 0], [0, H], [L, H], [L / 2, H / 2]]
        .map(([x, y]) => versLonLat(proj, t, x as number, y as number))
        .filter((ll): ll is [number, number] => ll !== null);
      complet.pays.forEach((ps, j) => {
        ps.forEach((p, n) => {
          if (visible(im, p)) {
            gardees++;
            return;
          }
          ecartees++;
          const rec = enregistreur();
          const poly = polygones[j]?.[n] as Polygon;
          geoPath(projEcran, rec as never)(poly);
          const trait = rec.segments.find(toucheEcran);
          if (trait) throw new Error(`vue ${JSON.stringify(v)} : ${donnees.entites[j]?.pays.id} partie ${n} écartée mais tracée à l'écran`);
          for (const ll of coins) if (geoContains(poly, ll)) throw new Error(`vue ${JSON.stringify(v)} : ${donnees.entites[j]?.pays.id} écartée mais sous un coin`);
        });
      });
    }
    // Le découpage sert : plus de la moitié des parties écartées sur l'ensemble des vues.
    expect(ecartees).toBeGreaterThan(gardees);
  }, 120_000);

  it('le tracé rapide (copies d’un tour, sommets sautés) remplit l’écran comme geoPath de d3 (24 vues)', () => {
    // Points d'une grille de l'écran : dedans pour l'un, dehors pour l'autre, seulement à moins de 1,5 px d'un bord.
    const tours = (segs: [number, number, number, number][], x: number, y: number) => {
      let w = 0;
      for (const [ax, ay, bx, by] of segs) {
        if (ay <= y) {
          if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++;
        } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--;
      }
      return w;
    };
    const distance = (segs: [number, number, number, number][], x: number, y: number) => {
      let d = Infinity;
      for (const [ax, ay, bx, by] of segs) {
        const [dx, dy] = [bx - ax, by - ay];
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        d = Math.min(d, Math.hypot(ax + u * dx - x, ay + u * dy - y));
      }
      return d;
    };
    let compares = 0;
    for (let i = 0; i < 24; i++) {
      const k = i < 6 ? 1 : Math.exp(alea() * Math.log(200));
      const v = centrer([alea() * 360 - 180, alea() * 140 - 70], k);
      // Une vue sur deux en mouvement : sommets sautés sous 1 px, minuscules sautées, contours effondrés en points.
      const im = image(v, C, regionVisible(v, C, MARGE_PX), i % 2 === 1);
      const projEcran = projectionEcran(v, C);
      const rapide = enregistreur(true);
      const d3 = enregistreur(true);
      complet.pays.forEach((ps, j) =>
        ps.forEach((p, n) => {
          if (!visible(im, p)) return;
          tracerPartie(rapide, im, p);
          rapide.closePath();
          geoPath(projEcran, d3 as never)(polygones[j]?.[n] as Polygon);
        }),
      );
      for (let gx = 0; gx < 24; gx++) {
        for (let gy = 0; gy < 45; gy++) {
          const [x, y] = [(gx + 0.5) * (L / 24), (gy + 0.5) * (H / 45)];
          // Hors de l'ovale, le clip efface tout : seuls comptent les points de la sphère.
          if (!versLonLat(projectionDe(v.r, C), transfoDe(v, C), x, y)) continue;
          compares++;
          const a = tours(rapide.segments, x, y) !== 0;
          const b = tours(d3.segments, x, y) !== 0;
          if (a !== b && distance(d3.segments, x, y) > 1.5) throw new Error(`vue ${JSON.stringify(v)} : (${x}, ${y}) ${a ? 'rempli' : 'vide'} au lieu de ${b ? 'rempli' : 'vide'}`);
        }
      }
    }
    expect(compares).toBeGreaterThan(10_000);
  }, 120_000);

  it('zoomé sur une région, la carte complète tient dans le budget des sommets', () => {
    const im = image(centrer([10, 50], 20), C, regionVisible(centrer([10, 50], 20), C, MARGE_PX));
    expect(sommetsVisibles(im, complet)).toBeLessThan(20_000);
    const im1 = image(centrer([0, 0], 1), C, regionVisible(centrer([0, 0], 1), C, MARGE_PX));
    expect(sommetsVisibles(im1, complet)).toBe(complet.sommets - complet.zones.flat().reduce((a, p) => a + p.points, 0));
  });

  it('coupure : une partie que le méridien opposé au centre traverse est tracée deux fois, décalée d’un tour', () => {
    const [ata] = preparer(entite('ATA').forme).sort((a, b) => b.points - a.points);
    expect(ata?.couture).toBe(true);
    expect(decalages(ata!, 0)).toHaveLength(1); // coupure à 180° : sur ses bords
    expect(decalages(ata!, 37)).toHaveLength(2);
    // La Russie : sa partie continentale s'arrête à 180° (couture), pas coupée à 150° E.
    const rus = preparer(entite('RUS').forme).sort((a, b) => b.points - a.points)[0]!;
    expect(rus.couture).toBe(true);
    expect(decalages(rus, 150)).toHaveLength(1);
    expect(decalages(rus, -80)).toHaveLength(2); // coupure à 100° E
  });

  it('les coutures (antiméridien, pôle) ne sont jamais tracées comme une frontière', () => {
    // Tchoukotka, coupée à 180° par Natural Earth ; à λ0 = 180°, ce méridien est la colonne du centre.
    const v = centrer([180, 66], 12);
    const im = image(v, C, regionVisible(v, C, MARGE_PX));
    const surLeMeridien = (segs: [number, number, number, number][]) =>
      segs.filter(([x0, y0, x1, y1]) => Math.abs(x0 - L / 2) < 1e-6 && Math.abs(x1 - L / 2) < 1e-6 && Math.abs(y1 - y0) > 0.5);
    let remplis = 0;
    for (const p of preparer(entite('RUS').forme)) {
      if (!p.couture || !visible(im, p)) continue;
      const contour = enregistreur();
      tracerPartie(contour, im, p, true);
      expect(surLeMeridien(contour.segments)).toEqual([]);
      const plein = enregistreur();
      tracerPartie(plein, im, p);
      remplis += surLeMeridien(plein.segments).length;
    }
    expect(remplis).toBeGreaterThan(0); // le remplissage, lui, suit la couture
  });
});

describe('dessin : bord de l’ovale', () => {
  it('une partie qui passe la coupure : son contour ne suit jamais le bord (Brésil à r = 145, Groenland au départ Pacifique, Russie et Antarctique vers r = 0)', () => {
    const PI = Math.PI;
    for (const [id, r] of [['BRA', 145], ['GRL', 150], ['RUS', -2], ['ATA', -2]] as const) {
      for (const k of [1]) {
        const v = placer(C, [r, 0], L / 2, H / 2, k);
        const im = image(v, C, regionVisible(v, C, MARGE_PX));
        let surLeBord = 0;
        let traits = 0;
        for (const p of preparer(entite(id).forme)) {
          const ds = decalages(p, v.r);
          if (ds.length < 2 || !visible(im, p)) continue;
          // Sommets ramenés sur le bord, calculés ici : au-delà de ±180° du centre dans une copie.
          const bord = new Set<string>();
          const cle = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`;
          for (const d of ds)
            for (const a of p.anneaux)
              for (let i = 0; i < a.length; i += 3) {
                const l = (a[i] as number) + d;
                if (Math.abs(l) > PI) bord.add(cle(im.cx + im.K * Math.sign(l) * PI * (a[i + 1] as number), im.y0 - im.K * (a[i + 2] as number)));
              }
          const surBord = (sg: [number, number, number, number]) => bord.has(cle(sg[0], sg[1])) && bord.has(cle(sg[2], sg[3])) && Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) > 1e-9;
          const contour = enregistreur();
          tracerPartie(contour, im, p, true);
          const fautifs = contour.segments.filter(surBord);
          if (fautifs.length) throw new Error(`${id} r=${r} k=${k} : ${fautifs.length} segments du contour sur le bord, ${JSON.stringify(fautifs[0])}`);
          traits += contour.segments.filter((sg) => toucheEcran(sg) && Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) > 1e-9).length;
          const plein = enregistreur();
          tracerPartie(plein, im, p);
          surLeBord += plein.segments.filter(surBord).length;
        }
        expect(surLeBord, `${id} r=${r} k=${k}`).toBeGreaterThan(0); // le remplissage, lui, suit le bord
        expect(traits, `${id} r=${r} k=${k}`).toBeGreaterThan(0); // ses frontières restent tracées
      }
    }
  });

  it('passeCoupure : la carte la trace avec les coutures, son contour à part', () => {
    const bra = preparer(entite('BRA').forme).sort((a, b) => b.points - a.points)[0]!;
    expect(passeCoupure(bra, 145)).toBe(true);
    expect(passeCoupure(bra, 0)).toBe(false);
    for (const r of [-180, -90, -35, 0, 37, 145, 150, 179.9]) expect(passeCoupure(bra, r), String(r)).toBe(decalages(bra, r).length > 1);
  });
});

describe('pick et noter, carte tournée', () => {
  it('Fidji entier à λ0 = 180° : d’un seul tenant au centre, tout toucher dans son tracé est juste', () => {
    for (const k of [1, 8, 40]) {
      const v = centrer([180, -17.5], k);
      expect(v.r).toBe(180);
      const ctx = contexte(v);
      const e = entite('FJI');
      const [o, s, est, n] = e.pays.bbox;
      const larg = (est < o ? est + 360 : est) - o;
      const xs: number[] = [];
      let dedans = 0;
      for (let i = 0; i <= 40; i++) {
        for (let j = 0; j <= 40; j++) {
          const ll: [number, number] = [normaliserLon(o + (larg * i) / 40), s + ((n - s) * j) / 40];
          if (!contient(e.forme, e.pays.bbox, ll)) continue;
          const [x, y] = ecran(v, ll);
          xs.push(x);
          dedans++;
          if (!noter(ctx, 'FJI', x, y).juste) throw new Error(`k=${k}, FJI en ${ll} : faux`);
        }
      }
      expect(dedans).toBeGreaterThan(5);
      // D'un seul tenant : l'emprise à l'écran ne fait pas le tour de l'ovale.
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(Math.min(L, 4 * larg * k));
    }
  });

  it('un toucher dans le tracé de la cible est toujours juste (cibles de l’essai, rotations 180, 90, −100, zooms 1 et 4)', () => {
    const cibles = ciblesEssai(donnees.entites.map((e) => e.pays));
    for (const r of [180, 90, -100]) {
      for (const k of [1, 4]) {
        const v = placer(C, [r, 0], L / 2, H / 2, k);
        const ctx = contexte(v);
        for (const c of cibles) {
          const e = entite(c);
          const [o, s, est, n] = e.pays.bbox;
          const larg = (est < o ? est + 360 : est) - o;
          for (let i = 0; i <= 12; i++) {
            for (let j = 0; j <= 12; j++) {
              const ll: [number, number] = [normaliserLon(o + (larg * i) / 12), s + ((n - s) * j) / 12];
              if (!contient(e.forme, e.pays.bbox, ll)) continue;
              const [x, y] = ecran(v, ll);
              if (x < 0 || x > L || y < 0 || y > H) continue;
              if (!noter(ctx, c, x, y).juste) throw new Error(`r=${r}, k=${k}, ${c} touché en ${ll} : faux (pick ${pick(ctx, x, y)?.id})`);
            }
          }
          // Le point où l'on touche la cible (pastille ou point d'étiquette) est juste.
          const p = ctx.pastilles.find((pa) => pa.id === c);
          const [px, py] = p ? [ctx.t.k * p.bx + ctx.t.x, ctx.t.k * p.by + ctx.t.y] : ecran(v, e.pays.point);
          if (px >= 0 && px <= L && py >= 0 && py <= H) expect(noter(ctx, c, px, py).juste, `r=${r}, k=${k}, ${c} en son point`).toBe(true);
        }
      }
    }
  }, 60_000);

  it('pick suit la rotation : le Brésil près du bord ouest à λ0 = 150°, Monaco par sa pastille à λ0 = −120°', () => {
    const v = placer(C, [150, 0], L / 2, H / 2, 1);
    const [bx, by] = ecran(v, entite('BRA').pays.point);
    expect(bx).toBeGreaterThan(L * 0.8); // à l'est du Pacifique
    expect(pick(contexte(v), bx, by)).toMatchObject({ id: 'BRA', via: 'trace' });
    const w = placer(C, [-120, 0], L / 2, H / 2, 1);
    const [mx, my] = ecran(w, entite('MCO').pays.point);
    expect(pick(contexte(w), mx, my)).toMatchObject({ id: 'MCO', via: 'pastille' });
  });
});

describe('hachures', () => {
  it('leur ancre suit la zone : le centre de sa plus grande partie, à l’écran, quelle que soit la rotation', () => {
    const complet = calque(donnees);
    const i = donnees.entites.findIndex((e) => e.pays.id === 'ESH');
    const ps = complet.pays[i] ?? [];
    const p = ps.reduce((a, b) => (b.taille > a.taille ? b : a));
    const centre: [number, number] = [(p.o + p.e) / 2, (p.s + p.n) / 2];
    for (const [r, k] of [[0, 1], [40, 1], [-170, 4], [150, 8]] as const) {
      const v = placer(C, [r, 20], L / 2, H / 2, k);
      const a = ancre(image(v, C, regionVisible(v, C, MARGE_PX), true), ps);
      const [x, y] = ecran(v, centre);
      expect(a?.[0]).toBeCloseTo(x, 6);
      expect(a?.[1]).toBeCloseTo(y, 6);
    }
    expect(ancre(image(centrer([0, 0], 1), C, regionVisible(centrer([0, 0], 1), C, MARGE_PX)), [])).toBeNull();
  });
});

describe('carte allégée', () => {
  const formes = formesLegeres(lire('monde-leger.topo.json'));
  const complet = calque(donnees);
  const leger = calqueLeger(donnees, complet, formes);
  const seules = (f: typeof formes): Calque => ({
    pays: donnees.entites.map((e) => {
      const forme = f.pays.get(e.pays.id);
      return forme ? preparer(forme) : [];
    }),
    zones: [],
    sommets: 0,
  });

  it('chaque polygone de la complète est dans l’allégée : le sien (au moins 40 km), ou celui de la complète (moins de 50 km)', () => {
    const ids = new Set(donnees.entites.map((e) => e.pays.id));
    for (const id of formes.pays.keys()) expect(ids.has(id), id).toBe(true);
    const allegees = seules(formes);
    donnees.entites.forEach((e, i) => {
      const ps = complet.pays[i] ?? [];
      const grandes = ps.filter((p) => p.km >= ILE_LEGERE_KM).length;
      // Les siennes (au moins 40 km à la source) couvrent les grandes de la complète ; les petites en viennent telles quelles.
      expect(allegees.pays[i]?.length ?? 0, e.pays.id).toBeGreaterThanOrEqual(grandes);
      expect(leger.pays[i]?.filter((p) => ps.includes(p)).length, e.pays.id).toBe(ps.length - grandes);
    });
    // Le Canada, l'Indonésie, les Maldives, la Polynésie : toutes leurs îles.
    for (const id of ['CAN', 'IDN', 'MDV', 'PYF', 'GRC', 'JPN', 'BHS', 'USA']) {
      const i = donnees.entites.findIndex((e) => e.pays.id === id);
      expect(leger.pays[i]?.length ?? 0, id).toBeGreaterThanOrEqual(complet.pays[i]?.length ?? 0);
    }
  });

  it('ses grandes parties : moins d’un huitième des sommets de la complète', () => {
    let n = 0;
    for (const ps of seules(formes).pays) for (const p of ps) n += p.points;
    expect(n).toBeLessThan(complet.sommets / 8);
  });
});

describe('îles pendant un geste', () => {
  // Règle : chaque polygone de la carte complète qui fait au moins 0,5 px à
  // l'écran au zoom k, ce qui est dessiné pendant un geste au zoom k (carte
  // allégée ou complète) en montre quelque chose au même endroit. Au lâcher,
  // la complète au repos le redessine ; rien ne doit clignoter entre les deux.
  const complet = calque(donnees);
  const formes = formesLegeres(lire('monde-leger.topo.json'));
  const leger = calqueLeger(donnees, complet, formes);

  /** Sommets à l'écran du contour extérieur (première copie) et leur emprise ; null si la partie passe la coupure. */
  function emprise(im: ImageTrace, p: Partie): { b: [number, number, number, number]; sommets: [number, number][] } | null {
    const ds = decalages(p, im.v.r);
    if (ds.length > 1) return null;
    const d = ds[0] as number;
    const a = p.anneaux[0] as Float64Array;
    const sommets: [number, number][] = [];
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < a.length; i += 3) {
      const x = im.cx + im.K * ((a[i] as number) + d) * (a[i + 1] as number);
      const y = im.y0 - im.K * (a[i + 2] as number);
      sommets.push([x, y]);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { b: [x0, y0, x1, y1], sommets };
  }

  /** Ce qu'un calque tracé montre : remplissage (règle non nulle) et traits, rangés par bandes de 4 px. */
  function trace(cq: Calque, im: ImageTrace) {
    const rec = enregistreur(true);
    parcourir(im, cq.pays, cq.groupes?.pays, (p) => tracerPartie(rec, im, p)); // comme CarteCanvas.dessiner
    rec.moveTo(0, 0); // referme le dernier sous-chemin
    const bandes = new Map<number, [number, number, number, number][]>();
    for (const sg of rec.segments) {
      const [a, b] = [Math.floor(Math.min(sg[1], sg[3]) / 4), Math.floor(Math.max(sg[1], sg[3]) / 4)];
      if (b - a > 400) continue; // hors de l'écran
      for (let r = a; r <= b; r++) {
        let l = bandes.get(r);
        if (!l) bandes.set(r, (l = []));
        l.push(sg);
      }
    }
    const rempli = (x: number, y: number) => {
      let w = 0;
      for (const [ax, ay, bx, by] of bandes.get(Math.floor(y / 4)) ?? []) {
        if (ay <= y) {
          if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++;
        } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--;
      }
      return w !== 0;
    };
    // Un trait d'au moins 0,5 px qui passe à moins de 0,25 px (frontière d'un pixel physique).
    const trait = (x: number, y: number) => {
      for (const [ax, ay, bx, by] of bandes.get(Math.floor(y / 4)) ?? []) {
        const [dx, dy] = [bx - ax, by - ay];
        const l2 = dx * dx + dy * dy;
        if (l2 < 0.25) continue;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        if (Math.hypot(ax + u * dx - x, ay + u * dy - y) < 0.25) return true;
      }
      return false;
    };
    // Points de l'emprise (grille de 9 × 9) et sommets de l'île (sur son bord : le
    // bord simplifié de l'allégée garde une partie des mêmes sommets).
    return (b: [number, number, number, number], sommets: [number, number][]) => {
      for (let i = 0; i <= 8; i++)
        for (let j = 0; j <= 8; j++) {
          const x = b[0] + ((b[2] - b[0]) * i) / 8;
          const y = b[1] + ((b[3] - b[1]) * j) / 8;
          if (rempli(x, y) || trait(x, y)) return true;
        }
      return sommets.some(([x, y]) => rempli(x, y) || trait(x, y));
    };
  }

  /**
   * Îles de la complète (polygones de 0,5 à 20 px, entièrement à l'écran) que le
   * tracé de cq en mouvement ne montre pas. Au-delà de 20 px, un polygone est
   * une terre que l'on voit de toute façon (et que la grille d'échantillons
   * pourrait manquer : Cuba, mince et en biais).
   */
  function perdues(v: VueGlobe, cq: Calque): string[] {
    const im = image(v, C, regionVisible(v, C, MARGE_PX), true);
    const voit = trace(cq, im);
    const res: string[] = [];
    complet.pays.forEach((ps, i) =>
      ps.forEach((p, j) => {
        if (!visible(im, p)) return;
        const e = emprise(im, p);
        if (!e) return;
        const { b } = e;
        if (b[0] < 0 || b[2] > L || b[1] < 0 || b[3] > H) return;
        const taille = Math.max(b[2] - b[0], b[3] - b[1]);
        if (taille < 0.5 || taille > 20) return;
        if (!voit(b, e.sommets)) res.push(`${donnees.entites[i]?.pays.id}#${j} (${(b[2] - b[0]).toFixed(1)}×${(b[3] - b[1]).toFixed(1)} px)`);
      }),
    );
    return res;
  }

  const VUES: [string, [number, number]][] = [
    ['Caraïbes', [-68, 16]],
    ['Grèce', [24.5, 38]],
    ['Indonésie', [120, -4]],
    ['Maldives', [73.4, 3.5]],
    ['Polynésie', [-146, -16]],
    ['Canada arctique', [-95, 74]],
  ];

  it('aucune île de 0,5 px ou plus ne disparaît : carte allégée et complète, archipels aux zooms 1, 2, 4, 8, 30 vues au hasard', () => {
    const fautes: string[] = [];
    const vues: [string, VueGlobe][] = [];
    for (const [nom, ll] of VUES) for (const k of [1, 2, 4, 8]) vues.push([`${nom} k=${k}`, centrer(ll, k)]);
    for (let i = 0; i < 30; i++) {
      const k = Math.exp(alea() * Math.log(30));
      vues.push([`hasard ${i}`, centrer([alea() * 360 - 180, alea() * 160 - 80], k)]);
    }
    for (const [nom, v] of vues) {
      for (const [quoi, cq] of [['allégée', leger], ['complète', complet]] as const) {
        const p = perdues(v, cq);
        if (p.length) fautes.push(`${nom} ${quoi} : ${p.slice(0, 5).join(', ')}${p.length > 5 ? ` (${p.length})` : ''}`);
      }
    }
    expect(fautes).toEqual([]);
  }, 120_000);

  it('le test voit une île perdue : l’allégée sans les îles de la complète en perd aux Maldives, au Canada, en Indonésie', () => {
    const seules: Calque = {
      pays: donnees.entites.map((e) => {
        const f = formes.pays.get(e.pays.id);
        return f ? preparer(f) : [];
      }),
      zones: [],
      sommets: 0,
    };
    for (const [nom, ll] of VUES.filter(([n]) => n !== 'Grèce' && n !== 'Caraïbes')) {
      expect(perdues(centrer(ll, 4), seules).length, nom).toBeGreaterThan(0);
    }
  }, 60_000);

  it('au zoom 1 en mouvement, l’allégée trace peu : la première île minuscule arrête sa liste, les autres en points', () => {
    const v = centrer([0, 0], 1);
    const im = image(v, C, regionVisible(v, C, MARGE_PX), true);
    const rec = enregistreur();
    let vues = 0;
    parcourir(im, leger.pays, leger.groupes?.pays, (p) => {
      vues++;
      tracerPartie(rec, im, p);
    });
    // 707 grandes parties et 3 719 îles de moins de 50 km : environ 1 500 regardées, pas toutes.
    expect(vues + im.minuscules).toBeLessThan(2000);
    expect(im.points).toBeGreaterThan(500);
    expect(im.parties).toBeLessThan(500);
    expect(im.emis).toBeLessThan(12_000);
  });
});
