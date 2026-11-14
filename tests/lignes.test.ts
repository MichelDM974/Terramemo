import { describe, expect, it } from 'vitest';
import { geoEqualEarth } from 'd3-geo';
import { MARGE_PX } from '../src/map/dessin';
import {
  CHOIX_LIGNES,
  coordonnees,
  empriseDesLieux,
  LAT_POLAIRES,
  LAT_TROPIQUES,
  lignesDe,
  lignesQuiCroisent,
  NOM,
  nomDegres,
  placerNoms,
  repere,
  tracerLignes,
  type Boite,
  type LigneRepere,
} from '../src/map/lignes';
import { creerProjection } from '../src/map/projection';
import { cadre, placer, projectionDe, transfoDe } from '../src/map/vue';
import { textes } from '../src/vues/textes';

// Lignes de repère (#11, décision « Lignes de repère » du 14/11) : géométrie,
// tracé de la carte qui tourne, place des noms (le réglage de ⚙ :
// tests/reglage-lignes.test.ts).
// Au format du téléphone de mesure (carte de 384 × 723 px CSS).

const L = 384;
const H = 723;
const C = cadre(L, H);
const T = textes.lignes;
const tout = lignesDe(CHOIX_LIGNES, T);
const de = (id: string, ls: readonly LigneRepere[] = tout) => ls.find((l) => l.id === id);

describe('lignes de repère : géométrie', () => {
  it('équateur, tropiques (±23,44°), cercles polaires (±66,56°), Greenwich : leurs latitudes et longitudes exactes, et leurs noms', () => {
    expect(LAT_TROPIQUES).toBe(23.44);
    expect(LAT_POLAIRES).toBe(66.56);
    const nommees = lignesDe(['equateur', 'greenwich', 'tropiques', 'polaires'], T);
    expect(nommees.map((l) => [l.id, l.sorte, l.deg, l.nom])).toEqual([
      ['equateur', 'parallele', 0, 'Équateur'],
      ['cancer', 'parallele', 23.44, 'Tropique du Cancer'],
      ['capricorne', 'parallele', -23.44, 'Tropique du Capricorne'],
      ['arctique', 'parallele', 66.56, 'Cercle arctique'],
      ['antarctique', 'parallele', -66.56, 'Cercle antarctique'],
      ['greenwich', 'meridien', 0, 'Méridien de Greenwich'],
    ]);
    expect(nommees.every((l) => !l.grille)).toBe(true);
  });

  it('grille de 30° seule : 12 méridiens (−150° à 180°) et 5 parallèles (±60, ±30, 0), pas de pôle ; leurs degrés en nom', () => {
    const g = lignesDe(['grille'], T);
    const meridiens = g.filter((l) => l.sorte === 'meridien');
    const paralleles = g.filter((l) => l.sorte === 'parallele');
    expect(meridiens.map((l) => l.deg)).toEqual([-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180]);
    expect(paralleles.map((l) => l.deg)).toEqual([60, 30, 0, -30, -60]);
    expect(g.every((l) => l.grille)).toBe(true);
    expect(paralleles.map((l) => l.nom)).toEqual(['60° N', '30° N', '0°', '30° S', '60° S']);
    expect(meridiens.map((l) => l.nom)).toEqual(['150° O', '120° O', '90° O', '60° O', '30° O', '0°', '30° E', '60° E', '90° E', '120° E', '150° E', '180°']);
    expect(new Set(g.map((l) => l.id)).size).toBe(g.length);
  });

  it('l’équateur ou Greenwich coché, la grille ne redouble pas sa ligne de 0° ; les nommées d’abord (leurs noms passent avant)', () => {
    expect(de('p0')).toBeUndefined();
    expect(de('m0')).toBeUndefined();
    expect(tout.filter((l) => l.sorte === 'parallele' && l.deg === 0)).toHaveLength(1);
    expect(tout.filter((l) => l.sorte === 'meridien' && l.deg === 0)).toHaveLength(1);
    expect(tout).toHaveLength(6 + 12 + 5 - 2);
    const premiereGrille = tout.findIndex((l) => l.grille);
    expect(tout.slice(0, premiereGrille).every((l) => !l.grille)).toBe(true);
    expect(tout.slice(premiereGrille).every((l) => l.grille)).toBe(true);
    expect(lignesDe([], T)).toEqual([]);
  });

  it('nomDegres : N, S, E, O, 0° et 180°', () => {
    expect(nomDegres('parallele', 60, T.degres)).toBe('60° N');
    expect(nomDegres('parallele', -30, T.degres)).toBe('30° S');
    expect(nomDegres('meridien', 60, T.degres)).toBe('60° E');
    expect(nomDegres('meridien', -150, T.degres)).toBe('150° O');
    expect(nomDegres('meridien', 180, T.degres)).toBe('180°');
    expect(nomDegres('parallele', 0, T.degres)).toBe('0°');
  });

  it('La Réunion n’en croise aucune (rien à dessiner sur l’île) ; une emprise sur l’équateur et Greenwich les a, l’antiméridien compris', () => {
    // Emprise de l'île (communes.json : 55,2 à 55,9° E, 21,4 à 20,9° S), au large du tropique du Capricorne et de 60° E.
    const ile = empriseDesLieux([{ bbox: [55.21, -21.39, 55.84, -20.87] }, { bbox: [55.3, -21.2, 55.5, -21.0] }]);
    expect(ile).toEqual([55.21, -21.39, 55.84, -20.87]);
    expect(lignesQuiCroisent(tout, ile)).toEqual([]);
    expect(lignesQuiCroisent(tout, [-5, -5, 5, 5]).map((l) => l.id)).toEqual(['equateur', 'greenwich']);
    expect(lignesQuiCroisent(tout, [170, 10, -170, 20]).map((l) => l.id)).toEqual(['m180']);
  });

  it('coordonnées pour geoPath (SVG) : un parallèle de −180° à 180° à sa latitude, un méridien d’un pôle à l’autre', () => {
    const p = coordonnees(de('cancer') as LigneRepere);
    expect(p[0]).toEqual([-180, 23.44]);
    expect(p.at(-1)).toEqual([180, 23.44]);
    expect(p.every((q) => q[1] === 23.44)).toBe(true);
    const m = coordonnees(de('m-150') as LigneRepere);
    expect(m[0]).toEqual([-150, -90]);
    expect(m.at(-1)).toEqual([-150, 90]);
    expect(m.every((q) => q[0] === -150)).toBe(true);
  });
});

/** Un enregistreur de moveTo/lineTo : les polylignes tracées. */
function enregistreur() {
  const traits: [number, number][][] = [];
  return {
    traits,
    moveTo: (x: number, y: number) => traits.push([[x, y]]),
    lineTo: (x: number, y: number) => traits.at(-1)?.push([x, y]),
  };
}

/** Distance (px) d'un point à la courbe projetée par d3 d'une ligne (échantillonnée finement), sur la projection de l'écran. */
function ecartAD3(l: LigneRepere, ecran: (p: [number, number]) => [number, number] | null, x: number, y: number): number {
  let d = Infinity;
  for (let i = 0; i <= 3600; i++) {
    const u = -180 + i / 10;
    // Un méridien de 180° : d3 le met sur un bord de l'ovale, −180° sur l'autre.
    for (const lon of l.sorte === 'parallele' ? [u] : [l.deg, l.deg - 360]) {
      const q = ecran(l.sorte === 'parallele' ? [lon, l.deg] : [lon, u / 2]);
      if (q) d = Math.min(d, Math.hypot(q[0] - x, q[1] - y));
    }
  }
  return d;
}

describe('lignes de repère : tracé de la carte qui tourne (Canvas 2D)', () => {
  it('chaque sommet tracé est sur la ligne que d3 projette, à toute rotation et à plusieurs zooms (méridiens qui suivent la rotation)', () => {
    let pire = 0;
    let points = 0;
    for (const [r, lat, k] of [
      [0, 0, 1],
      [100, 20, 1],
      [-150, -30, 3],
      [179, 60, 8],
      [37, 10, 40],
    ] as const) {
      const v = placer(C, [r, lat], L / 2, H / 2, k);
      const t = transfoDe(v, C);
      const proj = projectionDe(v.r, C);
      const ecran = (p: [number, number]): [number, number] | null => {
        const b = proj(p);
        return b ? [t.k * b[0] + t.x, t.k * b[1] + t.y] : null;
      };
      const rep = repere(t, proj, L, H);
      for (const l of tout) {
        const e = enregistreur();
        tracerLignes(e, rep, [l], MARGE_PX);
        for (const tr of e.traits)
          for (const [x, y] of tr) {
            // Le bout d'un parallèle coupé au bord de l'écran : sur sa ligne aussi (d3 la projette entière).
            pire = Math.max(pire, ecartAD3(l, ecran, x, y));
            points++;
          }
      }
    }
    expect(points).toBeGreaterThan(500);
    // L'échantillon de d3 (0,1° de longitude, 0,05° de latitude) borne l'écart à quelques dixièmes de pixel au zoom 40.
    expect(pire).toBeLessThan(0.6);
    // ≈ 3 s seul (chaque sommet confronté à l'échantillon de d3) : au-delà des 5 s par défaut sous la charge de la suite complète.
  }, 30_000);

  it('un parallèle est un seul segment horizontal, d’un bord de l’ovale à l’autre au zoom 1 ; coupé à l’écran zoomé', () => {
    const v = placer(C, [20, 0], L / 2, H / 2, 1);
    const rep = repere(transfoDe(v, C), projectionDe(v.r, C), L, H);
    const e = enregistreur();
    tracerLignes(e, rep, [de('equateur') as LigneRepere], MARGE_PX);
    expect(e.traits).toHaveLength(1);
    const [[x0, y0], [x1, y1]] = e.traits[0] as [[number, number], [number, number]];
    expect(y0).toBe(y1);
    const b = geoEqualEarth().fitSize([L, H], { type: 'Sphere' });
    const largeur = (b([180, 0])?.[0] ?? 0) - (b([-180, 0])?.[0] ?? 0);
    expect(x1 - x0).toBeCloseTo(Math.min(largeur, L + 2 * MARGE_PX), 3);
    const zoom = placer(C, [20, 0], L / 2, H / 2, 20);
    const z = enregistreur();
    tracerLignes(z, repere(transfoDe(zoom, C), projectionDe(zoom.r, C), L, H), [de('equateur') as LigneRepere], MARGE_PX);
    expect(z.traits[0]?.[0]?.[0]).toBe(-MARGE_PX);
    expect(z.traits[0]?.[1]?.[0]).toBe(L + MARGE_PX);
  });

  it('hors de l’écran, rien : le cercle arctique et les méridiens loin du centre zoomé sur l’Afrique ne coûtent aucun sommet', () => {
    const v = placer(C, [20, 0], L / 2, H / 2, 20);
    const e = enregistreur();
    tracerLignes(e, repere(transfoDe(v, C), projectionDe(v.r, C), L, H), tout, MARGE_PX);
    // À 20° E, zoom 20 : l'équateur, et les méridiens de 0° et 30° E au plus près (les autres hors de l'écran).
    expect(e.traits.length).toBeLessThanOrEqual(3);
    expect(e.traits.length).toBeGreaterThanOrEqual(1);
  });

  it('un méridien sur la coupure de la vue (λ′ = 180°) est tracé sur les deux bords de l’ovale', () => {
    const v = placer(C, [0, 0], L / 2, H / 2, 1);
    const e = enregistreur();
    tracerLignes(e, repere(transfoDe(v, C), projectionDe(v.r, C), L, H), [de('m180') as LigneRepere], MARGE_PX);
    expect(e.traits).toHaveLength(2);
    const xs = e.traits.map((tr) => tr[Math.floor(tr.length / 2)]?.[0] ?? 0).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(L / 2);
    expect(xs[1]).toBeGreaterThan(L / 2);
  });

  it('repere() d’une carte SVG (projection fixe, d3-zoom) : le même écran que la projection, « pacifique » comprise', () => {
    for (const nom of ['monde', 'pacifique'] as const) {
      const proj = creerProjection(nom, L, H);
      const t = { k: 3, x: -250, y: -400 };
      const rep = repere(t, proj, L, H);
      const e = enregistreur();
      tracerLignes(e, rep, [de('greenwich') as LigneRepere, de('m-150') as LigneRepere], MARGE_PX);
      const ecran = (p: [number, number]): [number, number] | null => {
        const b = proj(p);
        return b ? [t.k * b[0] + t.x, t.k * b[1] + t.y] : null;
      };
      expect(e.traits.length).toBeGreaterThan(0);
      for (const tr of e.traits)
        for (const [x, y] of tr) {
          const d = Math.min(ecartAD3(de('greenwich') as LigneRepere, ecran, x, y), ecartAD3(de('m-150') as LigneRepere, ecran, x, y));
          expect(d, nom).toBeLessThan(0.3);
        }
    }
  });
});

const largeurEssai = (t: string) => t.length * 6;

describe('lignes de repère : noms', () => {
  it('au zoom 1 sur le téléphone : les noms nommés posés, aucun chevauchement, tous dans l’écran ; celui d’un parallèle juste au-dessus de lui', () => {
    const v = placer(C, [0, 0], L / 2, H / 2, 1);
    const t = transfoDe(v, C);
    const proj = projectionDe(v.r, C);
    const noms = placerNoms(repere(t, proj, L, H), tout, largeurEssai);
    const ids = noms.map((n) => n.id);
    for (const id of ['equateur', 'cancer', 'capricorne', 'arctique', 'antarctique', 'greenwich']) expect(ids).toContain(id);
    for (const n of noms) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + n.l).toBeLessThanOrEqual(L);
      expect(n.y + n.h).toBeLessThanOrEqual(H);
      expect(n.l).toBe(largeurEssai(n.texte));
    }
    for (const a of noms)
      for (const b of noms) {
        if (a === b) continue;
        const separes = a.x + a.l <= b.x || b.x + b.l <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(separes, `${a.id} / ${b.id}`).toBe(true);
      }
    const eq = noms.find((n) => n.id === 'equateur') as Boite;
    const yEq = (proj([0, 0]) as [number, number])[1] * t.k + t.y;
    expect(eq.y + eq.h).toBeCloseTo(yEq - NOM.ecart, 6);
    // Le nom d'un parallèle part du bord gauche de l'ovale (le monde entier tient en largeur).
    const bordGauche = (proj([-180, 0]) as [number, number])[0] * t.k + t.x;
    expect(eq.x).toBeCloseTo(Math.max(0, bordGauche) + NOM.retrait, 6);
  });

  it('le nom d’un méridien est centré sur lui, sous le haut de sa partie visible, et suit la rotation', () => {
    for (const r of [0, 75]) {
      const v = placer(C, [r, 0], L / 2, H / 2, 4);
      const t = transfoDe(v, C);
      const proj = projectionDe(v.r, C);
      const noms = placerNoms(repere(t, proj, L, H), [de('greenwich') as LigneRepere, de('m90') as LigneRepere], largeurEssai);
      for (const n of noms) {
        expect(n.y).toBe(NOM.ecart);
        const lon = n.id === 'greenwich' ? 0 : 90;
        // Le méridien au milieu de la boîte, à la latitude du milieu de sa hauteur.
        const lat = (proj.invert?.([(L / 2 - t.x) / t.k, (n.y + n.h / 2 - t.y) / t.k]) as [number, number])[1];
        const x = (proj([lon, lat]) as [number, number])[0] * t.k + t.x;
        expect(n.x + n.l / 2, `${n.id} à r = ${r}`).toBeCloseTo(x, 3);
      }
      expect(noms.map((n) => n.id)).toContain(r === 0 ? 'greenwich' : 'm90');
    }
  });

  it('un nom qui chevaucherait un obstacle (pastille, anneau) ou un nom déjà posé cherche une autre place, sinon est sauté', () => {
    const v = placer(C, [0, 0], L / 2, H / 2, 1);
    const rep = repere(transfoDe(v, C), projectionDe(v.r, C), L, H);
    const libres = placerNoms(rep, tout, largeurEssai);
    const eq = libres.find((n) => n.id === 'equateur') as Boite;
    // À gauche, une pastille : le nom passe au bord droit ; des deux côtés, il est sauté.
    const gauche = { x: eq.x + 2, y: eq.y + 2, l: 4, h: 4 };
    const adroite = placerNoms(rep, tout, largeurEssai, [gauche]).find((n) => n.id === 'equateur') as Boite;
    expect(adroite.x + adroite.l).toBeGreaterThan(L / 2);
    // Les deux bords pris au-dessus : le nom passe sous la ligne, au bord gauche.
    const droite = { x: adroite.x + 2, y: adroite.y + 2, l: 4, h: 4 };
    const dessous = placerNoms(rep, tout, largeurEssai, [gauche, droite]).find((n) => n.id === 'equateur') as Boite;
    expect(dessous.y).toBeGreaterThan(eq.y + eq.h);
    expect(dessous.x).toBe(eq.x);
    // Les quatre bords pris (tropiques au zoom 1 : Caraïbes, Asie du Sud, îles) : il glisse le long de la ligne, au-dessus.
    const bas = [{ ...gauche, y: dessous.y + 2 }, { ...droite, y: dessous.y + 2 }];
    const milieu = placerNoms(rep, tout, largeurEssai, [gauche, droite, ...bas]).find((n) => n.id === 'equateur') as Boite;
    expect(milieu.y).toBe(eq.y);
    expect(milieu.x).toBeGreaterThan(eq.x);
    expect(milieu.x + milieu.l).toBeLessThan(droite.x);
    // Toute la bande au-dessus et sous la ligne prise : sauté.
    const bande = { x: 0, y: eq.y - 1, l: L, h: dessous.y + dessous.h - eq.y + 2 };
    expect(placerNoms(rep, tout, largeurEssai, [bande]).map((n) => n.id)).not.toContain('equateur');
    // Trois lignes à 1° l'une de l'autre : aucun nom n'en chevauche un autre.
    const proche = (id: string, deg: number): LigneRepere => ({ id, sorte: 'parallele', deg, nom: 'Un nom assez long', grille: false });
    const serres = placerNoms(rep, [proche('a', 10), proche('b', 11), proche('c', 11.5)], largeurEssai);
    for (const [i, a] of serres.entries()) for (const b of serres.slice(i + 1)) expect(a.x + a.l <= b.x || b.x + b.l <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  });
});
