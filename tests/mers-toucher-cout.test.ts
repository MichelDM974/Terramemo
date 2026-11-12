// Le coût de noter une mer, borné (lot 3a, partie C) : mêmes réponses que la
// méthode exacte sonde par sonde, pour un travail borné. Mesure de la session
// (12/11) : 384 sondes fines passaient chacune par geoContains sur des zones
// immenses (l'Atlantique, l'Arctique), jusqu'à 218 ms par toucher sur le PC
// (≈ 1 s sur l'A37). Ici l'équivalence avec les références (geoContains, la
// méthode d'avant gardée en copie), et le travail compté sur les pires cas.
import { readFileSync } from 'node:fs';
import { geoContains, geoDistance } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { describe, expect, it, vi } from 'vitest';
import { acceptesDe, acceptesEnPlus, type ZoneAdmise } from '../src/map/acceptes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { contient, dansEmprise, distanceAuBordKm, RAYON_TERRE_KM, travail, versEcran, versLonLat } from '../src/map/geo';
import { indexLieux } from '../src/map/lieux';
import { assemblerMers, zonesAllumees, zonesParties } from '../src/map/mers';
import { calculerPastilles, PASTILLE, tailleEcranPx } from '../src/map/pastilles';
import { noter, SONDES_PROCHE, type ContexteCarte, type Note, type OptionsNoter, type ResultatPick } from '../src/map/pick';
import type { Entite, Forme, Lieu, Mer } from '../src/map/types';
import { cadre, placer, projectionDe, transfoDe, type VueGlobe } from '../src/map/vue';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });

/**
 * Sommets parcourus par geoContains, où qu'il soit appelé (src/ et les
 * références) : le travail de la méthode exacte, que travail (geo.ts) ne voit
 * pas. Sans lui, un retour à geoContains dans contient comptait 0 arête et
 * passait toutes les bornes de travail (relecture).
 */
const d3 = vi.hoisted(() => ({ sommets: 0 }));
vi.mock('d3-geo', async (original) => {
  const o = await original<typeof import('d3-geo')>();
  return {
    ...o,
    geoContains: (objet: Parameters<typeof o.geoContains>[0], point: [number, number]) => {
      // Les appelants (geo.ts, contientRef) ne passent que des Polygon.
      const anneaux = objet.type === 'Polygon' ? (objet as { coordinates: unknown[][] }).coordinates : [[0]];
      for (const a of anneaux) d3.sommets += a.length;
      return o.geoContains(objet, point);
    },
  };
});

let graine = 2026;
const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;

/** Les polygones d'une forme. */
const polygones = (f: Forme) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);

/** Le travail de geoContains dans les références : sommets parcourus. */
const ref = { sommets: 0 };

/**
 * contient d'avant (copie exacte) : le filtre d'emprise de l'entité, puis de
 * chaque polygone, puis geoContains sur tout le polygone.
 */
function contientRef(forme: Forme, bbox: readonly [number, number, number, number], ll: [number, number]): boolean {
  const [lon, lat] = ll;
  const [o, s, e, n] = bbox;
  const mb = 0.05;
  if (lat < s - mb || lat > n + mb) return false;
  if (o <= e ? lon < o - mb || lon > e + mb : !(lon >= o - mb || lon <= e + mb)) return false;
  const m = 1e-6;
  for (const coordinates of polygones(forme)) {
    let po = Infinity, ps = Infinity, pe = -Infinity, pn = -Infinity;
    for (const p of coordinates[0] ?? []) {
      po = Math.min(po, p[0]!);
      pe = Math.max(pe, p[0]!);
      ps = Math.min(ps, p[1]!);
      pn = Math.max(pn, p[1]!);
    }
    if (pe - po > 359) {
      if (ps < -60) ps = -90;
      if (pn > 60) pn = 90;
    }
    if (lon < po - m || lon > pe + m || lat < ps - m || lat > pn + m) continue;
    for (const a of coordinates) ref.sommets += a.length;
    if (geoContains({ type: 'Polygon', coordinates }, ll)) return true;
  }
  return false;
}

describe('contient : la réponse de geoContains au bit près, sans parcourir tout le polygone', () => {
  const toutes: readonly Entite<Lieu>[] = [...couche.mers, ...donnees.entites];

  it('sur toutes les formes (mers et pays) : points au hasard dans l’emprise, sommets, points à 1e-10° à 1e-3° d’un sommet, sur son méridien', () => {
    const ecarts: string[] = [];
    let n = 0;
    let dedans = 0;
    for (const e of toutes) {
      const sommets = polygones(e.forme).flat(2);
      const [o, s, es, no] = e.pays.bbox;
      const largeur = o <= es ? es - o : es + 360 - o;
      const essais = Math.min(300, 30 + sommets.length / 4);
      for (let i = 0; i < essais; i++) {
        const v = sommets[Math.floor(alea() * sommets.length)]!;
        const r = alea();
        let ll: [number, number];
        if (r < 0.3) {
          const lon = o - 0.1 + alea() * (largeur + 0.2);
          ll = [lon > 180 ? lon - 360 : lon, s - 0.1 + alea() * (no - s + 0.2)];
        } else if (r < 0.45) ll = [v[0]!, v[1]!];
        else if (r < 0.65) ll = [v[0]!, v[1]! + (alea() - 0.5) * 2e-3];
        else {
          const ec = 10 ** (-3 - alea() * 7);
          ll = [v[0]! + (alea() - 0.5) * ec, v[1]! + (alea() - 0.5) * ec];
        }
        if (Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) continue;
        n++;
        const a = contient(e.forme, e.pays.bbox, ll);
        if (a) dedans++;
        if (a !== contientRef(e.forme, e.pays.bbox, ll)) ecarts.push(`${e.pays.id} [${ll}]`);
      }
    }
    expect(ecarts).toEqual([]);
    expect(n).toBeGreaterThan(30_000);
    expect(dedans).toBeGreaterThan(10_000);
  });

  it('les pôles, l’antiméridien, les zones qui font le tour du globe (Arctique, Austral, Antarctique)', () => {
    const ecarts: string[] = [];
    for (const id of ['arctique', 'austral', 'pacif', 'bering', 'ATA', 'RUS', 'FJI', 'USA']) {
      const e = toutes.find((x) => x.pays.id === id)!;
      for (const lon of [-180, -179.999999, -90, 0, 0.5, 90, 179.999999, 180]) {
        for (const lat of [-90, -89.9999, -85, -78, -61, -60.5, 0, 52, 58, 66, 80, 89.9999, 90]) {
          if (contient(e.forme, e.pays.bbox, [lon, lat]) !== contientRef(e.forme, e.pays.bbox, [lon, lat])) ecarts.push(`${id} [${lon}, ${lat}]`);
        }
      }
    }
    expect(ecarts).toEqual([]);
  });

  it('le travail : dans l’Atlantique, quelques dizaines d’arêtes examinées au lieu de ses 1 428 sommets', () => {
    const atlant = couche.mers.find((m) => m.pays.id === 'atlant')!;
    contient(atlant.forme, atlant.pays.bbox, [-30, 30]); // l'index, au premier point
    const [avant, g0] = [travail.aretes, d3.sommets];
    let n = 0;
    for (let i = 0; i < 1000; i++) {
      const ll: [number, number] = [-70 + alea() * 80, -50 + alea() * 110];
      n++;
      contient(atlant.forme, atlant.pays.bbox, ll);
    }
    // Le travail compté, et nul autre : aucun geoContains, des arêtes examinées.
    expect(d3.sommets - g0).toBe(0);
    expect(travail.aretes - avant).toBeGreaterThan(n);
    expect((travail.aretes - avant) / n).toBeLessThan(60);
  });
});

// La méthode d'avant (pick.ts, a736060 : halo de 12 px compris, dans les
// fentes aussi depuis la relecture), copie exacte, sur contientRef : chaque sonde passe par geoContains sur tout le
// polygone de chaque zone à portée, et cherche sa terre parmi les 258 pays.
const R = (() => {
  function sousLePoint(ctx: ContexteCarte, x: number, y: number): Entite<Lieu> | null {
    const ll = versLonLat(ctx.proj, ctx.t, x, y);
    if (!ll) return null;
    for (const e of ctx.entites) if (contientRef(e.forme, e.pays.bbox, ll)) return e;
    return null;
  }
  function* sondes(x: number, y: number): Generator<[number, number, number]> {
    for (const r of SONDES_PROCHE.rayons_px) {
      for (let i = 0; i < SONDES_PROCHE.directions; i++) {
        const a = (2 * Math.PI * i) / SONDES_PROCHE.directions;
        yield [x + r * Math.cos(a), y + r * Math.sin(a), r];
      }
    }
  }
  function* sondesFines(x: number, y: number): Generator<[number, number, number]> {
    const max = SONDES_PROCHE.rayons_px[SONDES_PROCHE.rayons_px.length - 1]!;
    const pas = SONDES_PROCHE.directions;
    for (let r = 1; r <= max; r++) {
      const n = pas * Math.ceil((2 * Math.PI * r) / (pas * 1.5));
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        yield [x + r * Math.cos(a), y + r * Math.sin(a), r];
      }
    }
  }
  function aPortee(ctx: ContexteCarte, zones: readonly Entite<Mer>[], ll: [number, number], x: number, y: number): readonly Entite<Mer>[] {
    if (!zones.length) return zones;
    const max = SONDES_PROCHE.rayons_px[SONDES_PROCHE.rayons_px.length - 1]!;
    let rayon = 0;
    for (let i = 0; i < 16; i++) {
      const a = (2 * Math.PI * i) / 16;
      const l2 = versLonLat(ctx.proj, ctx.t, x + max * Math.cos(a), y + max * Math.sin(a));
      if (!l2) return zones;
      rayon = Math.max(rayon, geoDistance(ll, l2) * RAYON_TERRE_KM);
    }
    rayon *= 1.25;
    const deg = (rayon / RAYON_TERRE_KM) * (180 / Math.PI);
    const lat = Math.min(89, Math.abs(ll[1]) + deg);
    const marge = deg / Math.cos((lat * Math.PI) / 180);
    return zones.filter((m) => dansEmprise(m.pays.bbox, ll[0], ll[1], marge) && (contientRef(m.forme, m.pays.bbox, ll) || distanceAuBordKm(m.forme, ll) <= rayon));
  }
  function zoneMer(mers: readonly Entite<Mer>[], ll: [number, number]): Entite<Mer> | null {
    for (const m of mers) if (contientRef(m.forme, m.pays.bbox, ll)) return m;
    return null;
  }
  function merVisible(ctx: ContexteCarte, mers: readonly Entite<Mer>[], x: number, y: number): Entite<Mer> | null {
    const ll = versLonLat(ctx.proj, ctx.t, x, y);
    const m = ll ? zoneMer(mers, ll) : null;
    return m && !sousLePoint(ctx, x, y) ? m : null;
  }
  function eauProche(ctx: ContexteCarte, zones: readonly Entite<Mer>[], ll: [number, number], x: number, y: number): ResultatPick | null {
    const vises = aPortee(ctx, zones, ll, x, y);
    for (const [sx, sy, r] of vises.length ? sondesFines(x, y) : []) {
      const lls = versLonLat(ctx.proj, ctx.t, sx, sy);
      const m = lls ? zoneMer(vises, lls) : null;
      if (m && !sousLePoint(ctx, sx, sy)) return { id: m.pays.id, via: 'proche', distance_px: r };
    }
    return null;
  }
  function pickMer(ctx: ContexteCarte, cible: string, x: number, y: number, compte: ReadonlySet<string>): ResultatPick | null {
    const ll = versLonLat(ctx.proj, ctx.t, x, y);
    if (!ll) return null;
    const mers = ctx.mers ?? [];
    const comptent = () => mers.filter((m) => compte.has(m.pays.id));
    const terre = sousLePoint(ctx, x, y);
    if (terre) return eauProche(ctx, comptent(), ll, x, y) ?? { id: terre.pays.id, via: 'trace', distance_px: 0 };
    const m = zoneMer(mers, ll);
    if (m && compte.has(m.pays.id)) return { id: m.pays.id, via: 'trace', distance_px: 0 };
    const visee = mers.find((z) => z.pays.id === cible);
    const halo = visee && tailleEcranPx(visee.pays, ctx.proj.scale(), ctx.t.k) < PASTILLE.seuil_px ? eauProche(ctx, comptent(), ll, x, y) : null;
    if (halo) return halo;
    if (m) return { id: m.pays.id, via: 'trace', distance_px: 0 };
    for (const [sx, sy, r] of sondes(x, y)) {
      const v = merVisible(ctx, mers, sx, sy);
      if (v) return { id: v.pays.id, via: 'proche', distance_px: r };
    }
    return null;
  }
  function noterMer(ctx: ContexteCarte, cible: string, x: number, y: number, options: OptionsNoter): Note {
    const mers = ctx.mers ?? [];
    const allumees = zonesAllumees(cible, mers.map((m) => m.pays));
    const enPlus = typeof options.acceptes === 'object' ? (options.acceptes.get(cible) ?? []) : [];
    const zones: readonly ZoneAdmise[] = options.acceptes === false ? [] : [...(ctx.acceptes?.get(cible) ?? []), ...enPlus];
    const ll = versLonLat(ctx.proj, ctx.t, x, y);
    const p = pickMer(ctx, cible, x, y, new Set([...allumees, ...zones.map((z) => z.zone)]));
    const base = { lonlat: ll, pick: p };
    if (p && allumees.includes(p.id)) return { juste: true, via: p.via, distance_km: 0, admis: null, ...base };
    const z = p ? zones.find((zo) => zo.zone === p.id) : undefined;
    if (z && p) return { juste: true, via: p.via, distance_km: 0, admis: { zone: z.zone, tenant: z.tenant, sorte: z.sorte }, ...base };
    let distance_km: number | null = null;
    if (ll) {
      distance_km = Infinity;
      for (const m of mers) if (allumees.includes(m.pays.id)) distance_km = Math.min(distance_km, distanceAuBordKm(m.forme, ll));
      for (const zo of zones) distance_km = Math.min(distance_km, distanceAuBordKm(zo.forme, ll));
    }
    return { juste: false, via: null, distance_km, admis: null, ...base };
  }
  return { noterMer, sousLePoint, zoneMer };
})();

const avecMers: DonneesCarte = { ...donnees, mers: couche.mers };
const lieux = indexLieux(avecMers);
const acceptes = acceptesDe(donnees);
const L = 384;
const H = 723;
const C = cadre(L, H);
const zones = couche.mers.map((m) => m.pays);
const mer = (id: string) => couche.mers.find((m) => m.pays.id === id)!;

function contexte(v: VueGlobe): ContexteCarte {
  const proj = projectionDe(v.r, C);
  return { proj, t: transfoDe(v, C), entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, v.k), acceptes, mers: couche.mers, lieux };
}

/** Les options du sujet Mers (les parties de la cible : zonesParties, sorte « partie »), comme sa vue les passe à noter. */
const parties = (cible: string): OptionsNoter => ({ acceptes: acceptesEnPlus(avecMers, cible, zonesParties(cible, zones), 'partie') ?? true });

describe('noter une mer : les réponses de la méthode d’avant (sonde par sonde, geoContains), pour un travail borné', () => {
  // Touchers tirés au hasard (graine fixe) : la vue centrée sur un sommet de
  // la cible (sa côte, ou son bord avec une autre zone), à la rotation qui
  // la centre ou décalée, et à 0, 90 et 180 aux zooms 1 et 2 (l'ovale entier,
  // l'antiméridien dedans) ; le doigt n'importe où à l'écran aux zooms 1 et 2,
  // sinon à 40 px au plus du centre, ou à 15 px au plus d'un sommet de la cible.
  it('des milliers de touchers, zooms 1 à 300, sur la terre, dans l’eau (qui compte ou non), dans les fentes, hors de la sphère : la même note, au bit près', () => {
    const cibles = ['atlant', 'pacif', 'bering', 'arctique', 'austral', 'medit', 'azov', 'finlande', 'nord'];
    const vus = { hors: 0, terre: 0, eau: 0, fente: 0, proche: 0, halo: 0, juste: 0, faux: 0 };
    const ecarts: string[] = [];
    let n = 0;
    for (const k of [1, 2, 4, 8, 30, 300]) {
      for (const cible of cibles) {
        const sommets = polygones(mer(cible).forme).flat(2);
        for (let i = 0; i < 40; i++) {
          const s = sommets[Math.floor(alea() * sommets.length)]!;
          const ll: [number, number] = [s[0]!, s[1]!];
          const v = placer(C, ll, L / 2, H / 2, k, true);
          const r = k <= 2 && alea() < 0.5 ? [0, 90, 180][Math.floor(alea() * 3)]! : v.r + (alea() < 0.5 ? 0 : (alea() - 0.5) * (40 / k));
          const ctx = contexte({ ...v, r });
          let x: number;
          let y: number;
          const b = ctx.proj(ll);
          if (b && alea() < 0.5) {
            const [sx, sy] = versEcran(ctx.t, b[0], b[1]);
            [x, y] = [sx + (alea() - 0.5) * 30, sy + (alea() - 0.5) * 30];
          } else if (k <= 2) [x, y] = [alea() * L, alea() * H];
          else [x, y] = [L / 2 + (alea() - 0.5) * 80, H / 2 + (alea() - 0.5) * 80];
          const options = [parties(cible), {}, { acceptes: false }][i % 3]!;
          const lli = versLonLat(ctx.proj, ctx.t, x, y);
          if (!lli) vus.hors++;
          else if (R.sousLePoint(ctx, x, y)) vus.terre++;
          else if (R.zoneMer(couche.mers, lli)) vus.eau++;
          else vus.fente++;
          const attendu = R.noterMer(ctx, cible, x, y, options);
          // Le halo : le doigt dans l'eau d'une zone, la note par une sonde.
          if (lli && attendu.pick?.via === 'proche' && !R.sousLePoint(ctx, x, y) && R.zoneMer(couche.mers, lli)) vus.halo++;
          const note = noter(ctx, cible, x, y, options);
          n++;
          if (attendu.pick?.via === 'proche') vus.proche++;
          vus[attendu.juste ? 'juste' : 'faux']++;
          if (JSON.stringify(note) !== JSON.stringify(attendu)) ecarts.push(`${cible} k ${k} r ${r} (${x}, ${y}) : ${JSON.stringify(note.pick)} ≠ ${JSON.stringify(attendu.pick)}`);
        }
      }
    }
    expect(ecarts).toEqual([]);
    expect(n).toBe(2160);
    expect(vus.terre).toBeGreaterThan(400);
    expect(vus.eau).toBeGreaterThan(800);
    expect(vus.fente).toBeGreaterThan(5);
    expect(vus.hors).toBeGreaterThan(20);
    expect(vus.proche).toBeGreaterThan(200);
    expect(vus.halo).toBeGreaterThan(10);
    expect(vus.juste).toBeGreaterThan(600);
    expect(vus.faux).toBeGreaterThan(400);
  }, 300_000);
});

describe('noter une mer : le travail des pires cas, compté', () => {
  // Les pires touchers mesurés par la session (12/11) et par le banc de ce
  // lot : sur la terre, toutes les sondes sans eau passaient chacune par
  // geoContains sur des zones immenses. Le travail est compté (arêtes
  // examinées par contient, sommets parcourus par distanceAuBordKm et par
  // geoContains), pas chronométré ; une seule borne de temps, large.
  const pires: [string, string, [number, number], number][] = [
    ['le Chili, pour l’Atlantique, zoom 1', 'atlant', [-70.44, -31.92], 1],
    ['le Chili plus au nord, pour l’Atlantique, zoom 1', 'atlant', [-67.98, -23.22], 1],
    ['la Russie (Iougorski), pour l’Arctique, zoom 300', 'arctique', [60.37, 69.8], 300],
    ['l’Alaska (îles), pour le Pacifique, zoom 300', 'pacif', [-132.2, 56.01], 300],
    ['le Vanuatu, pour le Pacifique, zoom 300', 'pacif', [169.29, -19.44], 300],
    ['l’Algérie sous la Méditerranée (débordement), zoom 300', 'medit', [-1, 35.6], 300],
    ['la mer Noire pour Azov (halo), zoom 1', 'azov', [31, 43], 1],
    ['la fente du golfe de Syrte, pour la mer Rouge, zoom 40', 'rouge', [19.8, 30.6], 40],
  ];

  it.each(pires)('%s : la même note, au plus 60 000 arêtes et 10 000 sommets, dix fois moins de travail que geoContains sonde par sonde', (_nom, cible, ll, k) => {
    const ctx = contexte(placer(C, ll, L / 2, H / 2, k, true));
    const b = ctx.proj(ll)!;
    const [x, y] = versEcran(ctx.t, b[0], b[1]);
    const options = parties(cible);
    noter(ctx, cible, x, y, options); // les index des polygones touchés, construits au premier point
    const [a0, s0, g0] = [travail.aretes, travail.sommets, d3.sommets];
    const note = noter(ctx, cible, x, y, options);
    // geoContains compris (aucun attendu : contient n'y passe plus, hors du
    // premier point d'un polygone), pour qu'aucun retour à la méthode exacte
    // n'échappe au compte.
    const [aretes, sommets] = [travail.aretes - a0, travail.sommets - s0 + d3.sommets - g0];
    const [s1, r0] = [travail.sommets, ref.sommets];
    expect(note).toEqual(R.noterMer(ctx, cible, x, y, options));
    const avant = ref.sommets - r0 + (travail.sommets - s1);
    expect(aretes).toBeLessThanOrEqual(60_000);
    expect(sommets).toBeLessThanOrEqual(10_000);
    expect(aretes + sommets).toBeLessThan(Math.max(2000, avant / 10));
    // Le temps, large (≈ 3 ms sur le PC, 70 à 200 ms avant) : la médiane de 5.
    const temps: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      noter(ctx, cible, x, y, options);
      temps.push(performance.now() - t0);
    }
    expect(temps.sort((p, q) => p - q)[2]).toBeLessThan(40);
  });
});
