import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUDGET_SOMMETS, calque, calqueLeger, calquesMers, parcourir, sommetsVisibles, type Calque } from '../src/map/carte-canvas';
import { image, MARGE_PX, tracerPartie, type ContexteTrace, type ImageTrace } from '../src/map/dessin';
import { assembler, formesLegeres, type DonneesCarte } from '../src/map/donnees';
import { assemblerMers } from '../src/map/mers';
import { cadre, placer, regionVisible } from '../src/map/vue';

// Fluidité des mers, étape 1 des mesures (étude J2, § 4.6) : sans navigateur.
// Ce que le calque marin ajoute au tracé du Canvas (sommets parcourus et
// émis, temps JS du tracé en Node), au repos et en mouvement, aux zooms 1, 2
// et 8, à 16 rotations, au format du téléphone de mesure (384 × 723 px CSS).
// Le calque n'est tracé par la base qu'avec une teinte de mer (carte de la
// mémoire des mers, ?mers=demo) : c'est ce cas qui est mesuré, contre la même
// carte sans mers. Rapport : docs/mesures/j2/2026-11-12-mers-trace.md.
// Les temps (console) dépendent du PC et de sa charge : seuls les sommets
// sont vérifiés.

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const donnees: DonneesCarte = assembler(lire('monde.topo.json'), lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const complet = calque(donnees);
const leger = calqueLeger(donnees, complet, formesLegeres(lire('monde-leger.topo.json')));
const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
const mers = calquesMers(couche);
const C = cadre(384, 723);
const ROTATIONS = [0, 17, 30, 60, 90, 120, 150, 163, 179, 180, -179, 210, 240, 270, 300, 330];
const ZOOMS = [1, 2, 8];
/** Centre des vues zoomées : l'Atlantique Nord (côtes, mers bordières, Méditerranée). */
const LATITUDE = 30;

/** Un contexte qui ne fait que compter : le coût JS du tracé, sans Canvas. */
const compteur = (): ContexteTrace & { n: number } => ({
  n: 0,
  moveTo() {
    this.n++;
  },
  lineTo() {
    this.n++;
  },
});

interface Ligne {
  zoom: number;
  mouvement: boolean;
  /** Carte allégée tracée (la bascule compte les mers), sans mers et avec. */
  leger_sans: number;
  leger_avec: number;
  /** Calque marin : sommets parcourus et émis (moyenne des 16 rotations). */
  parcourus: number;
  emis: number;
  /** Terres seules (même bascule que sans mers) : sommets émis. */
  emis_terres: number;
  /** Temps JS du tracé (ms, médiane des rotations, chacune la moyenne de REPETITIONS tracés), sans et avec mers. */
  ms_sans: number;
  ms_avec: number;
}

const REPETITIONS = 5;

/** Les terres (et les mers) d'une image, comme dessinerCarte : rend l'image (compteurs) et le calque des terres tracé. */
function tracer(im: ImageTrace, avecMers: boolean): { terres: Calque; mersIm: ImageTrace | null } {
  const bascule = im.mouvement && sommetsVisibles(im, complet, avecMers ? mers.complet : null) > BUDGET_SOMMETS;
  const terres = bascule ? leger : complet;
  const ctx = compteur();
  let mersIm: ImageTrace | null = null;
  if (avecMers) {
    // Le calque marin d'abord (entre l'ovale et les terres), ses compteurs à part.
    mersIm = image(im.v, im.c, im.region, im.mouvement);
    const cm = bascule ? mers.leger : mers.complet;
    parcourir(mersIm, cm.pays, undefined, (p) => tracerPartie(ctx, mersIm as ImageTrace, p));
  }
  parcourir(im, terres.pays, terres.groupes?.pays, (p) => tracerPartie(ctx, im, p));
  return { terres, mersIm };
}

const mediane = (xs: number[]) => {
  const t = [...xs].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)] as number;
};

describe('fluidité des mers, sans navigateur (étude J2, § 4.6, étape 1)', () => {
  it('sommets du calque marin et temps JS du tracé, au repos et en mouvement, zooms 1, 2 et 8, 16 rotations', () => {
    const lignes: Ligne[] = [];
    // Chauffe : le premier tracé paie la compilation du JIT.
    for (const r of ROTATIONS) {
      const v = placer(C, [r, 0], C.l / 2, C.h / 2, 1);
      for (const m of [false, true]) for (const a of [false, true]) tracer(image(v, C, regionVisible(v, C, MARGE_PX), m), a);
    }
    for (const zoom of ZOOMS) {
      for (const mouvement of [false, true]) {
        let [parcourus, emis, emisTerres, legerSans, legerAvec] = [0, 0, 0, 0, 0];
        const msSans: number[] = [];
        const msAvec: number[] = [];
        for (const r of ROTATIONS) {
          const v = placer(C, [r, zoom === 1 ? 0 : LATITUDE], C.l / 2, C.h / 2, zoom);
          const region = regionVisible(v, C, MARGE_PX);
          const sans = image(v, C, region, mouvement);
          const s = tracer(sans, false);
          const avec = image(v, C, region, mouvement);
          const a = tracer(avec, true);
          parcourus += a.mersIm?.sommets ?? 0;
          emis += a.mersIm?.emis ?? 0;
          emisTerres += sans.emis;
          legerSans += s.terres === leger ? 1 : 0;
          legerAvec += a.terres === leger ? 1 : 0;
          for (const [avecMers, ms] of [[false, msSans], [true, msAvec]] as const) {
            const t0 = performance.now();
            for (let i = 0; i < REPETITIONS; i++) tracer(image(v, C, region, mouvement), avecMers);
            ms.push((performance.now() - t0) / REPETITIONS);
          }
        }
        const n = ROTATIONS.length;
        lignes.push({
          zoom,
          mouvement,
          leger_sans: legerSans,
          leger_avec: legerAvec,
          parcourus: Math.round(parcourus / n),
          emis: Math.round(emis / n),
          emis_terres: Math.round(emisTerres / n),
          ms_sans: Math.round(mediane(msSans) * 100) / 100,
          ms_avec: Math.round(mediane(msAvec) * 100) / 100,
        });
      }
    }
    console.info(
      [
        `calque marin : ${mers.complet.sommets} sommets au repos (10 km), ${mers.leger.sommets} en mouvement (50 km) ; terres : complète ${complet.sommets}, allégée ${leger.sommets}`,
        'zoom | état | allégée (sans / avec mers, sur 16) | mers parcourus | mers émis | terres émis | JS sans mers (ms) | JS avec mers (ms)',
        ...lignes.map((l) => `${l.zoom} | ${l.mouvement ? 'mouvement' : 'repos'} | ${l.leger_sans} / ${l.leger_avec} | ${l.parcourus} | ${l.emis} | ${l.emis_terres} | ${l.ms_sans} | ${l.ms_avec}`),
      ].join('\n'),
    );
    // Au zoom 1, tout le calque est parcouru : 10 km au repos, 50 km en mouvement (la bascule vers l'allégée).
    const z1 = lignes.filter((l) => l.zoom === 1);
    // (les parties qui passent la coupure, deux fois : leurs deux copies).
    expect(z1.find((l) => !l.mouvement)?.parcourus).toBeGreaterThanOrEqual(mers.complet.sommets);
    expect(z1.find((l) => l.mouvement)?.leger_avec).toBe(ROTATIONS.length);
    // Le calque marin émis reste sous le budget des sommets de la bascule, en mouvement comme au repos.
    for (const l of lignes) expect(l.emis, `zoom ${l.zoom} ${l.mouvement ? 'mouvement' : 'repos'}`).toBeLessThan(BUDGET_SOMMETS);
  }, 120_000);
});
