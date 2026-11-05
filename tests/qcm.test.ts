import { readFileSync } from 'node:fs';
import { geoDistance } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { empriseEcran, partVisible } from '../src/map/geo';
import { choix, doitCadrer, NB_CHOIX, PartieNommer, type LieuQcm } from '../src/vues/qcm';

// QCM de Nommer (src/vues/qcm.ts) sur les vraies données : pays.json du monde
// et communes.json de l'île, comme les vues les passeront (tout le terrain).

interface Zone extends LieuQcm {
  statut: string;
}

function terrain(fichier: string): { lieux: Map<string, Zone>; jouables: Set<string> } {
  const zones = JSON.parse(readFileSync(fichier, 'utf8')) as Zone[];
  return {
    lieux: new Map(zones.map((z) => [z.id, z])),
    jouables: new Set(zones.filter((z) => z.statut === 'jouable').map((z) => z.id)),
  };
}

const monde = terrain('public/geo/pays.json');
const ile = terrain('public/geo/reunion/communes.json');

/** Générateur pseudo-aléatoire à graine (mulberry32) : des tirages reproductibles. */
function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('données', () => {
  it('195 pays jouables, 24 communes', () => {
    expect(monde.jouables.size).toBe(195);
    expect(ile.jouables.size).toBe(24);
    expect(NB_CHOIX).toBe(4);
  });
});

describe('choix', () => {
  for (const [nom, t] of [['monde', monde], ['île', ile]] as const) {
    it(`${nom} : pour chaque jouable, 4 ids distincts dont la cible, tous jouables`, () => {
      const alea = graine(1);
      for (const id of t.jouables) {
        const c = choix(id, t.lieux, t.jouables, alea);
        expect(c).toHaveLength(NB_CHOIX);
        expect(new Set(c).size).toBe(NB_CHOIX);
        expect(c).toContain(id);
        for (const x of c) expect(t.jouables.has(x), `${id} → ${x}`).toBe(true);
      }
    });

    it(`${nom} : les voisins jouables d'abord, puis les plus proches`, () => {
      const alea = graine(2);
      for (const id of t.jouables) {
        const lieu = t.lieux.get(id) as Zone;
        const voisins = lieu.voisins.filter((v) => t.jouables.has(v));
        const leurres = choix(id, t.lieux, t.jouables, alea).filter((x) => x !== id);
        if (voisins.length >= 3) {
          for (const x of leurres) expect(voisins, `${id} → ${x}`).toContain(x);
        } else {
          for (const v of voisins) expect(leurres, `${id} : voisin ${v}`).toContain(v);
          // Les autres leurres : aussi proches que tout jouable non retenu.
          const autres = leurres.filter((x) => !voisins.includes(x));
          const d = (x: string) => geoDistance(lieu.point, (t.lieux.get(x) as Zone).point);
          const pire = Math.max(...autres.map(d));
          for (const x of t.jouables) {
            if (x === id || leurres.includes(x) || voisins.includes(x)) continue;
            expect(d(x), `${id} : ${x} plus proche qu'un leurre`).toBeGreaterThanOrEqual(pire);
          }
        }
      }
    });
  }

  it('Maurice (sans voisin) : 4 choix quand même, les plus proches', () => {
    expect(monde.lieux.get('MUS')?.voisins).toEqual([]);
    const c = choix('MUS', monde.lieux, monde.jouables, graine(3));
    expect(c).toHaveLength(4);
    expect(c).toContain('MUS');
    // Ses voisines de l'océan Indien : Madagascar, les Seychelles, les Comores…
    const mus = (monde.lieux.get('MUS') as Zone).point;
    const proches = [...monde.jouables]
      .filter((x) => x !== 'MUS')
      .sort((a, b) => geoDistance(mus, (monde.lieux.get(a) as Zone).point) - geoDistance(mus, (monde.lieux.get(b) as Zone).point))
      .slice(0, 3);
    expect(c.filter((x) => x !== 'MUS').sort()).toEqual([...proches].sort());
    expect(c).toContain('MDG');
  });

  it('un pays à ≥ 3 voisins jouables (France) : les 3 leurres en sont', () => {
    const voisins = (monde.lieux.get('FRA') as Zone).voisins.filter((v) => monde.jouables.has(v));
    expect(voisins.length).toBeGreaterThanOrEqual(3);
    for (let s = 0; s < 20; s++) {
      const leurres = choix('FRA', monde.lieux, monde.jouables, graine(s)).filter((x) => x !== 'FRA');
      expect(leurres).toHaveLength(3);
      for (const x of leurres) expect(voisins).toContain(x);
    }
  });

  it('un voisin non jouable est sauté (Espagne : Gibraltar)', () => {
    const esp = monde.lieux.get('ESP') as Zone;
    const sautes = esp.voisins.filter((v) => !monde.jouables.has(v));
    expect(sautes).toContain('GIB');
    for (let s = 0; s < 20; s++) {
      const c = choix('ESP', monde.lieux, monde.jouables, graine(s));
      for (const v of sautes) expect(c).not.toContain(v);
    }
  });

  it('Le Port (97407, 2 voisins) : ses 2 voisins et la commune la plus proche', () => {
    const port = ile.lieux.get('97407') as Zone;
    expect([...port.voisins].sort()).toEqual(['97408', '97415']);
    const plusProche = [...ile.jouables]
      .filter((x) => !['97407', '97408', '97415'].includes(x))
      .sort((a, b) => geoDistance(port.point, (ile.lieux.get(a) as Zone).point) - geoDistance(port.point, (ile.lieux.get(b) as Zone).point))[0];
    for (let s = 0; s < 10; s++) {
      const c = choix('97407', ile.lieux, ile.jouables, graine(s));
      expect([...c].sort()).toEqual(['97407', '97408', '97415', plusProche].sort());
    }
  });

  it('aléatoire fixé → résultat déterministe', () => {
    for (const id of ['FRA', 'MUS', 'RUS', 'VAT']) {
      expect(choix(id, monde.lieux, monde.jouables, graine(42))).toEqual(choix(id, monde.lieux, monde.jouables, graine(42)));
    }
    expect(choix('97411', ile.lieux, ile.jouables, graine(7))).toEqual(choix('97411', ile.lieux, ile.jouables, graine(7)));
  });

  it('la cible est répartie entre les 4 places', () => {
    const places = [0, 0, 0, 0];
    const alea = graine(5);
    for (let i = 0; i < 400; i++) places[choix('97411', ile.lieux, ile.jouables, alea).indexOf('97411')]! += 1;
    // 100 attendus par place : large marge contre le hasard, pas de place jamais prise.
    for (const n of places) expect(n).toBeGreaterThan(60);
  });

  it('lève sous 4 jouables ou pour une cible inconnue', () => {
    const peu = new Set(['97407', '97408', '97415']);
    expect(() => choix('97407', ile.lieux, peu, graine(1))).toThrow();
    expect(() => choix('XXX', monde.lieux, monde.jouables, graine(1))).toThrow();
    // Tout juste 4 : ça passe.
    expect(choix('97407', ile.lieux, new Set([...peu, '97401']), graine(1))).toHaveLength(4);
  });
});

describe('PartieNommer', () => {
  it('une réponse par question, puis finie', () => {
    const p = new PartieNommer(['FRA', 'ESP', 'ITA']);
    expect(p.courante).toBe('FRA');
    expect(p.numero).toBe(1);
    expect(p.finie).toBe(false);
    expect(p.repondre('FRA', 1000)).toEqual({ juste: true });
    // Un seul essai : la question suivante arrive même après une faute.
    expect(p.courante).toBe('ESP');
    expect(p.numero).toBe(2);
    expect(p.repondre('PRT', 2000)).toEqual({ juste: false });
    expect(p.courante).toBe('ITA');
    expect(p.repondre('ITA', 3000)).toEqual({ juste: true });
    expect(p.finie).toBe(true);
    expect(p.courante).toBeUndefined();
    expect(() => p.repondre('ITA', 1)).toThrow();
  });

  it('bilan : justes du premier coup, fautes dans l’ordre, temps médian des justes', () => {
    const p = new PartieNommer(['A', 'B', 'C', 'D', 'E']);
    p.repondre('A', 1000);
    p.repondre('X', 500);
    p.repondre('C', 3000);
    p.repondre('Y', 800);
    p.repondre('E', 2000);
    expect(p.bilan()).toEqual({
      justes: 3,
      n: 5,
      temps_median_ms: 2000,
      fautes: [{ id: 'B', choisi: 'X' }, { id: 'D', choisi: 'Y' }],
    });
  });

  it('bilan : médiane paire, sans juste, partie arrêtée en cours', () => {
    const p = new PartieNommer(['A', 'B', 'C']);
    expect(p.bilan()).toEqual({ justes: 0, n: 0, temps_median_ms: null, fautes: [] });
    p.repondre('Z', 400);
    expect(p.bilan()).toEqual({ justes: 0, n: 1, temps_median_ms: null, fautes: [{ id: 'A', choisi: 'Z' }] });
    p.repondre('B', 1000);
    p.repondre('C', 2000);
    expect(p.bilan().temps_median_ms).toBe(1500);
  });

  it('les cibles sont copiées : changer la liste après coup ne change pas la partie', () => {
    const cibles = ['A', 'B'];
    const p = new PartieNommer(cibles);
    cibles.push('C');
    p.repondre('A', 1);
    p.repondre('B', 1);
    expect(p.finie).toBe(true);
  });
});

describe('doitCadrer', () => {
  const l = 384;
  const h = 500;
  it('dans la partie visible et assez grande : non, bords compris', () => {
    expect(doitCadrer([200, 250], 30, l, h)).toBe(false);
    expect(doitCadrer([0, 0], 30, l, h)).toBe(false);
    expect(doitCadrer([l, h], 30, l, h)).toBe(false);
    expect(doitCadrer([200, 250], 8, l, h)).toBe(false);
  });
  it('hors champ, sous la barre ou trop petite : oui', () => {
    expect(doitCadrer(null, 30, l, h)).toBe(true);
    expect(doitCadrer([-0.5, 250], 30, l, h)).toBe(true);
    expect(doitCadrer([l + 0.5, 250], 30, l, h)).toBe(true);
    expect(doitCadrer([200, -1], 30, l, h)).toBe(true);
    expect(doitCadrer([200, h + 1], 30, l, h)).toBe(true);
    expect(doitCadrer([200, 250], 7.9, l, h)).toBe(true);
    expect(doitCadrer([NaN, 250], 30, l, h)).toBe(true);
  });
});

describe('emprise de la zone à l’écran', () => {
  const l = 384;
  const h = 500;
  it('partVisible : part de l’aire dans [0, l] × [0, h]', () => {
    expect(partVisible([10, 10, 110, 110], l, h)).toBe(1);
    expect(partVisible([10, 450, 110, 550], l, h)).toBeCloseTo(0.5, 9);
    expect(partVisible([-50, 450, 50, 550], l, h)).toBeCloseTo(0.25, 9);
    expect(partVisible([10, 600, 110, 700], l, h)).toBe(0);
    // Plate : par sa longueur.
    expect(partVisible([10, 100, 110, 100], l, h)).toBe(1);
    expect(partVisible([10, 600, 110, 600], l, h)).toBe(0);
  });
  it('empriseEcran : min et max des sommets projetables', () => {
    const anneau = [
      [0, 0],
      [2, 1],
      [1, 3],
      [9, 9],
    ];
    expect(empriseEcran(anneau, ([x, y]) => (x === 9 ? null : [10 * x, 10 * y]))).toEqual([0, 0, 20, 30]);
    expect(empriseEcran([], () => [0, 0])).toBeNull();
    expect(empriseEcran(anneau, () => null)).toBeNull();
  });
  it('doitCadrer : point visible mais emprise cachée à plus de 10 % (la Sicile sous la barre) : oui', () => {
    expect(doitCadrer([200, 250], 30, l, h, [150, 200, 250, 300])).toBe(false);
    expect(doitCadrer([200, 250], 30, l, h, [150, 200, 250, 509])).toBe(false);
    expect(doitCadrer([200, 250], 30, l, h, [150, 200, 250, 560])).toBe(true);
    expect(doitCadrer([200, 250], 30, l, h, [150, -60, 250, 300])).toBe(true);
    expect(doitCadrer([200, 250], 30, l, h, null)).toBe(false);
  });
});
