// Le dessin de la carte de situation (#34, lot F8 ; src/vues/situation.ts), sur les vraies formes du dépôt : les 258
// lieux du monde et les 50 mers et océans. Les tests de la fiche (fiche-vue.test.ts) disent l'état, la région,
// l'anneau et la présence des chemins ; ceux-ci disent ce qui se voit. Le DOM factice ne peint rien : chaque carte
// posée est pixellisée ici (règle de remplissage nonzero de SVG, les chemins dans leur ordre de peinture), et chaque
// polygone éclairci (decimer) a son aire sphérique (d3-geo) : un anneau retourné est lu par d3-geo comme son
// complément, la sphère entière moins l'îlot, et couvrait toute la carte (§ 21 de l'étude).
import { readFileSync } from 'node:fs';
import { geoArea } from 'd3-geo';
import type { Position } from 'geojson';
import type { Topology } from 'topojson-specification';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assembler } from '../src/map/donnees';
import { assemblerLegere } from '../src/map/mers';
import type { Contestee, Forme, Pays } from '../src/map/types';
import { creerSituation, decimer, type DemandeSituation } from '../src/vues/situation';
import { El, installerDom } from './dom-factice';

const lire = <T>(f: string): T => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8')) as T;
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const MONDE = assembler(lire<Topology<never>>('monde.topo.json'), lire<Pays[]>('pays.json'), lire<Contestee[]>('contestees.json'), lire<Record<string, string>>('noms.fr.json'));
const MERS = assemblerLegere({ leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });

/** Les couches de la carte, dans leur ordre de peinture (poser) ; l'anneau, un trait, ne couvre rien. */
const COUCHES = ['vignette-mer', 'situation-eau', 'vignette-fond', 'situation-lieu'] as const;
type Couche = (typeof COUCHES)[number] | 'vide';
/** La grille de la pixellisation (3:2, comme la place). */
const NX = 60;
const NY = 40;

/** Les anneaux d'un chemin SVG de d3 (M, L, Z seulement : geoPath n'écrit rien d'autre ici). */
function anneaux(d: string): number[][] {
  return d
    .split('M')
    .filter(Boolean)
    .map((s) => s.replace(/[LZ]/g, ' ').replace(/,/g, ' ').trim().split(/\s+/).map(Number));
}

/** Les pixels couverts par ce chemin (nonzero, comme SVG), par lignes de balayage au centre des pixels. */
function couvre(d: string, [bx, by, bw, bh]: number[]): Uint8Array {
  const sortie = new Uint8Array(NX * NY);
  const rs = anneaux(d);
  for (let j = 0; j < NY; j++) {
    const y = by! + ((j + 0.5) * bh!) / NY;
    const x: [number, number][] = [];
    for (const r of rs) {
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) % n;
        const [ax, ay, cx, cy] = [r[2 * i]!, r[2 * i + 1]!, r[2 * k]!, r[2 * k + 1]!];
        if (ay <= y !== cy <= y) x.push([ax + ((y - ay) * (cx - ax)) / (cy - ay), cy > ay ? 1 : -1]);
      }
    }
    x.sort((a, b) => a[0] - b[0]);
    let w = 0;
    let p = 0;
    for (let i = 0; i < NX; i++) {
      const px = bx! + ((i + 0.5) * bw!) / NX;
      while (p < x.length && x[p]![0] < px) w += x[p++]![1];
      if (w !== 0) sortie[j * NX + i] = 1;
    }
  }
  return sortie;
}

/** La part des pixels où chaque couche est dessus (ou le fond de la place, « vide »). */
function peinture(svg: El): Record<Couche, number> {
  const boite = svg.getAttribute('viewBox')!.split(' ').map(Number);
  const dessus: Couche[] = Array<Couche>(NX * NY).fill('vide');
  for (const c of COUCHES) {
    const d = svg.querySelector(`.${c}`)?.getAttribute('d');
    if (!d) continue;
    const px = couvre(d, boite);
    for (let i = 0; i < px.length; i++) if (px[i]) dessus[i] = c;
  }
  const part = Object.fromEntries([...COUCHES, 'vide'].map((c) => [c, 0])) as Record<Couche, number>;
  for (const c of dessus) part[c] += 1 / (NX * NY);
  return part;
}

/** requestIdleCallback tenu à la main, une tranche après l'autre ; chacune chronométrée. */
function repos() {
  const attente: ((e: { timeRemaining(): number; didTimeout: boolean }) => void)[] = [];
  vi.stubGlobal('requestIdleCallback', (f: (typeof attente)[number]) => attente.push(f));
  vi.stubGlobal('cancelIdleCallback', () => {});
  let max = 0;
  return {
    /** Les tranches jusqu'à la carte posée, d'un pas chacune (échéance nulle) ; la plus longue est retenue. */
    vider(): void {
      for (let k = 0; attente.length; k++) {
        if (k > 5000) throw new Error('le calcul ne finit pas');
        const t = performance.now();
        attente.shift()!({ timeRemaining: () => 0, didTimeout: false });
        max = Math.max(max, performance.now() - t);
      }
    },
    max: () => max,
  };
}

/** Les demandes de tous les lieux du monde (l'Antarctique en continent, comme sorteDeLieu) et de toutes les mers. */
const TOUS: DemandeSituation[] = [
  ...MONDE.entites.map((e): DemandeSituation => ({ terrain: 'monde', id: e.pays.id, sorte: e.pays.id === 'ATA' ? 'continent' : 'pays' })),
  ...MERS.zones.map((z): DemandeSituation => ({ terrain: 'monde', id: z.id, sorte: 'mer' })),
];

/** Chaque carte posée, pixellisée ; et la plus longue tranche du calcul. */
function dessiner(demandes: readonly DemandeSituation[]) {
  installerDom();
  const r = repos();
  const s = creerSituation({ monde: () => MONDE, ile: () => null, mers: () => ({ mers: MERS.mers, zones: MERS.zones }) });
  const cartes = demandes.map((d) => {
    const place = s.place(d) as unknown as El;
    s.lancer();
    r.vider();
    expect(place.dataset.etat, d.id).toBe('prete');
    return { d, region: place.dataset.region, part: peinture(place.querySelector('svg')!) };
  });
  return { cartes, tranche: r.max() };
}

afterEach(() => vi.unstubAllGlobals());

describe('le dessin de la carte de situation (lot F8)', () => {
  it('decimer garde le sens de chaque anneau : aucun polygone des 258 lieux ni des 50 mers ne devient son complément (aire < 2π sr)', () => {
    const formes: [string, Forme][] = [...MONDE.entites, ...MERS.mers].filter((e) => !!e.forme).map((e) => [e.pays.id, e.forme]);
    const retournes: string[] = [];
    // Les tolérances en degrés des cartes : du monde (lieu et fond, ≈ 0,39° et 0,78°) aux cadres de mers les plus serrés.
    for (const tol of [0.02, 0.05, 0.1, 0.2, 0.39, 0.78, 1.5])
      for (const [id, f] of formes) {
        const g = f.geometry as { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] };
        const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Position[][][];
        polys.forEach((p, i) => {
          const avant = geoArea({ type: 'Polygon', coordinates: p });
          for (const q of decimer([p], tol)) {
            const apres = geoArea({ type: 'Polygon', coordinates: q });
            if (avant < 2 * Math.PI && apres >= 2 * Math.PI) retournes.push(`${id} polygone ${i} à ${tol}° (${p[0]!.length} → ${q[0]!.length} points)`);
          }
        });
      }
    expect(retournes).toEqual([]);
  });

  it('la Russie et le Groenland (le monde) : le pays seul éclairé, pas tout l’ovale ; l’océan reste visible', () => {
    const { cartes } = dessiner(TOUS.filter((d) => d.id === 'RUS' || d.id === 'GRL'));
    for (const c of cartes) {
      expect(c.region, c.d.id).toBe('monde:0');
      // L'ovale (Equal Earth) fait ≈ 65 % de la boîte : la Russie ≈ 2 %, le Groenland moins de 1 % (66 % avant : tout l'ovale).
      expect(c.part['situation-lieu'], c.d.id).toBeGreaterThan(0);
      expect(c.part['situation-lieu'], c.d.id).toBeLessThan(0.08);
      expect(c.part['vignette-mer'], c.d.id).toBeGreaterThan(0.3);
    }
  });

  it('la Méditerranée (son cadre) et l’Atlantique (le monde) : l’eau éclairée se voit, sous les terres sans les couvrir toutes, de la couleur de la mer choisie', () => {
    const { cartes } = dessiner(TOUS.filter((d) => d.id === 'medit' || d.id === 'atlant'));
    const medit = cartes.find((c) => c.d.id === 'medit');
    const atlant = cartes.find((c) => c.d.id === 'atlant');
    expect(medit!.region).toBe('mer:medit');
    expect(medit!.part['situation-eau']).toBeGreaterThan(0.1);
    expect(medit!.part['vignette-fond']).toBeLessThan(0.85);
    expect(atlant!.region).toBe('monde:0');
    expect(atlant!.part['situation-eau']).toBeGreaterThan(0.08);
    // L'eau éclairée a sa couleur (l'accent, comme une mer choisie sur la carte), autre que la mer du fond.
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toMatch(/\n\.situation-eau \{ fill: var\(--mer-choisie\); \}/);
    expect(css).toMatch(/--mer-choisie: var\(--accent\);/);
    expect(css).toMatch(/\n\.fiche-situation \{[^}]*background: var\(--mer\);/);
  });

  it('les 258 lieux et les 50 mers : jamais toute la carte en terre ni l’ovale sans mer, le lieu jamais sur toute la carte, l’eau d’une mer toujours visible ; des tranches courtes', () => {
    const { cartes, tranche } = dessiner(TOUS);
    const fautes: string[] = [];
    let [terreMax, lieuMax, eauMin] = [0, 0, 1];
    let [terreQui, lieuQui, eauQui] = ['', '', ''];
    for (const { d, region, part } of cartes) {
      const terre = part['vignette-fond'] + part['situation-lieu'];
      if (terre > terreMax) [terreMax, terreQui] = [terre, d.id];
      if (terre > 0.93) fautes.push(`${d.id} (${region}) : ${Math.round(terre * 100)} % de terre`);
      // Le monde : l'ovale garde de la mer (≈ 28 % sous le Pacifique éclairé ; 0 quand un fond le couvrait).
      if (region?.startsWith('monde:') && part['vignette-mer'] < 0.05) fautes.push(`${d.id} (${region}) : l'ovale sans mer`);
      if (d.sorte === 'mer') {
        if (part['situation-eau'] < eauMin) [eauMin, eauQui] = [part['situation-eau'], d.id];
        if (part['situation-eau'] < 0.002) fautes.push(`${d.id} (${region}) : eau invisible (${(part['situation-eau'] * 100).toFixed(1)} %)`);
      } else if (d.id !== 'ATA') {
        if (part['situation-lieu'] > lieuMax) [lieuMax, lieuQui] = [part['situation-lieu'], d.id];
        if (part['situation-lieu'] > 0.5) fautes.push(`${d.id} (${region}) : le lieu couvre ${Math.round(part['situation-lieu'] * 100)} % de la carte`);
      }
    }
    // La mesure du pas le plus long (ce PC, un pas par tranche) : dite au § 21 de l'étude.
    console.info(`situation : terre ≤ ${(terreMax * 100).toFixed(1)} % (${terreQui}), lieu ≤ ${(lieuMax * 100).toFixed(1)} % (${lieuQui}), eau ≥ ${(eauMin * 100).toFixed(2)} % (${eauQui}), tranche ≤ ${tranche.toFixed(1)} ms`);
    expect(fautes).toEqual([]);
    expect(tranche).toBeLessThan(50);
  }, 120_000);
});
