// Cadrage d'une grappe (décision « Cadrage et disques en séance ») : union
// des emprises des polygones principaux, antiméridien compris, puis la vue
// du globe qui la montre entière au-dessus de la barre.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assembler } from '../src/map/donnees';
import { anneauPrincipal, empriseAnneau, empriseGrappe, GEANT_KM2, unionEmprises } from '../src/map/geo';
import type { Pays } from '../src/map/types';
import { cadre, projectionEcran, viserEmprise } from '../src/map/vue';
import { grappesPays } from '../src/srs/grappes';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const donnees = assembler(lire('monde.topo.json'), lire('pays.json') as Pays[], lire('contestees.json'), lire('noms.fr.json'));
const entite = new Map(donnees.entites.map((e) => [e.pays.id, e]));
const empriseDe = (id: string) => {
  const e = entite.get(id)!;
  return empriseAnneau(anneauPrincipal(e.forme, e.pays.point))!;
};

describe('emprises', () => {
  it('union : le plus petit arc de longitude, par-dessus l’antiméridien s’il est plus court', () => {
    expect(unionEmprises([])).toBeNull();
    expect(unionEmprises([[0, 40, 10, 50], [20, 30, 25, 45]])).toEqual([0, 30, 25, 50]);
    // Fidji (177 E) et Samoa (172 O) : 15° par l'antiméridien, pas 345° par Greenwich.
    expect(unionEmprises([[177, -19, 179, -16], [-173, -14.5, -171, -13]])).toEqual([177, -19, -171, -13]);
    // Une emprise qui le passe déjà, plus une à l'est.
    expect(unionEmprises([[170, -10, -170, 0], [-160, -5, -150, 5]])).toEqual([170, -10, -150, 5]);
    // Imbriquées, et le monde entier.
    expect(unionEmprises([[0, 0, 100, 10], [10, 0, 20, 5]])).toEqual([0, 0, 100, 10]);
    expect(unionEmprises([[-180, -90, 180, 90]])).toEqual([-180, -90, 180, 90]);
  });

  it('emprise d’un contour : la France de l’Hexagone (pas la Guyane), Fidji d’un seul tenant', () => {
    const fra = empriseDe('FRA');
    expect(fra[0]).toBeGreaterThan(-6);
    expect(fra[2]).toBeLessThan(10);
    expect(empriseAnneau([[179, 0], [-179, 0], [-179, 1], [179, 1]])).toEqual([179, 0, -179, 1]);
    expect(empriseAnneau([])).toBeNull();
  });

  it('chaque grappe de pays tient entière à l’écran, au-dessus de la barre (384 × 723, 500 px visibles)', () => {
    const c = cadre(384, 723);
    const hVisible = 500;
    for (const g of grappesPays(donnees.entites.map((e) => e.pays))) {
      const u = unionEmprises(g.membres.map(empriseDe))!;
      const v = viserEmprise(c, u, 40, hVisible);
      const proj = projectionEcran(v, c);
      for (const id of g.membres) {
        const p = proj(entite.get(id)!.pays.point)!;
        expect(p[0], `${g.id} ${id}`).toBeGreaterThanOrEqual(-1);
        expect(p[0], `${g.id} ${id}`).toBeLessThanOrEqual(385);
        expect(p[1], `${g.id} ${id}`).toBeGreaterThanOrEqual(-1);
        expect(p[1], `${g.id} ${id}`).toBeLessThanOrEqual(hVisible + 1);
      }
      expect(v.k, g.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('cadrage d’une grappe : les pays entiers à l’écran, les géants par un morceau ; l’Europe de l’Est sans la Sibérie', () => {
    const c = cadre(384, 723);
    const hVisible = 500;
    const dans = (p: [number, number] | null) => !!p && p[0] >= -1 && p[0] <= 385 && p[1] >= -1 && p[1] <= hVisible + 1;
    for (const g of grappesPays(donnees.entites.map((e) => e.pays))) {
      const ms = g.membres.map((id) => entite.get(id)!);
      const v = viserEmprise(c, empriseGrappe(ms)!, 40, hVisible);
      const proj = projectionEcran(v, c);
      for (const m of ms) {
        if (m.pays.superficie_km2 < GEANT_KM2 || ms.every((x) => x.pays.superficie_km2 >= GEANT_KM2)) expect(dans(proj(m.pays.point)), `${g.id} ${m.pays.id}`).toBe(true);
        else expect(anneauPrincipal(m.forme, m.pays.point).some((q) => dans(proj([q[0]!, q[1]!]))), `${g.id} ${m.pays.id} (géant)`).toBe(true);
      }
    }
    const est = grappesPays(donnees.entites.map((e) => e.pays)).find((g) => g.membres.includes('RUS'))!;
    const e = empriseGrappe(est.membres.map((id) => entite.get(id)!))!;
    expect(e[2]).toBeLessThan(60); // pas jusqu'à Béring
    expect(viserEmprise(cadre(384, 723), e, 40, 500).k).toBeGreaterThan(5);
  });

  it('l’Océanie : le globe tourné vers le Pacifique, plus zoomé que le monde entier', () => {
    const oceanie = grappesPays(donnees.entites.map((e) => e.pays)).filter((g) => g.continent === 'Oceania');
    for (const g of oceanie) {
      const u = unionEmprises(g.membres.map(empriseDe))!;
      const v = viserEmprise(cadre(384, 723), u, 40, 500);
      expect(Math.abs(v.r) > 90, `${g.id} r=${v.r}`).toBe(true);
    }
  });
});
