// Grappes d'apprentissage : les nouveautés arrivent par paquets de 5 à 9
// entités voisines (docs/plan.md : « nouveautés par grappe régionale »).
// Fonction pure et déterministe : mêmes entités (dans n'importe quel ordre),
// mêmes grappes. Elle sert aux pays (sous-régions ONU) comme aux communes de
// La Réunion (un seul groupe, découpé en paquets voisins).

import type { Lieu, Pays } from '../map/types';

/** Ce que le découpage lit d'une entité. */
export interface EntiteGrappe {
  id: string;
  /** [lon, lat] du point d'étiquette. */
  point: readonly [number, number];
  /** Groupe de départ (sous-région ONU pour les pays). */
  groupe: string;
  continent: string;
  superficie_km2: number;
}

export interface Grappe {
  /** Groupe(s) d'origine, plus « i/k » si le groupe a été découpé (« Western Africa 1/2 »). */
  id: string;
  continent: string;
  groupes: string[];
  /** Ids par superficie décroissante. */
  membres: string[];
  superficie_km2: number;
}

/** Taille visée d'une grappe : un groupe de plus de TAILLE_GRAPPE + 1 est découpé en ceil(n / TAILLE_GRAPPE). */
export const TAILLE_GRAPPE = 8;
/** Taille minimale : un groupe plus petit est fusionné avec le plus proche du même continent. */
export const TAILLE_MIN = 5;
/**
 * Communes de La Réunion : paquets de 6 (24 communes → 4 grappes). Défaut en
 * attente de l'utilisateur, #2 (D6 : communes au J1a, et comment).
 */
export const TAILLE_GRAPPE_COMMUNES = 6;

/**
 * Ordre des continents (défaut D4 en attente de l'utilisateur, #2) ; dans un
 * continent, les grappes vont par superficie totale décroissante. Un
 * continent absent de la liste vient après, par nom.
 */
export const ORDRE_CONTINENTS: readonly string[] = ['Europe', 'North America', 'South America', 'Africa', 'Asia', 'Oceania'];

type Vec = [number, number, number];
const RAD = Math.PI / 180;

function vecteur([lon, lat]: readonly [number, number]): Vec {
  const φ = lat * RAD;
  const λ = lon * RAD;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normer(v: Vec): Vec {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [1, 0, 0];
}
/** Centre moyen sur la sphère (moyenne des vecteurs unitaires) : juste de part et d'autre de l'antiméridien. */
function centre(es: readonly EntiteGrappe[]): Vec {
  const s: Vec = [0, 0, 0];
  for (const e of es) {
    const v = vecteur(e.point);
    s[0] += v[0];
    s[1] += v[1];
    s[2] += v[2];
  }
  return normer(s);
}
/** Distance angulaire (radians) entre deux points de la sphère. */
const distance = (a: Vec, b: Vec): number => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Tailles équilibrées de k paquets pour n entités (écart ≤ 1, les plus grands d'abord). */
function tailles(n: number, k: number): number[] {
  return Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
}

/**
 * Coupe en k paquets voisins de tailles équilibrées, par bissections : les
 * entités sont rangées le long du grand axe de leurs points (projetés sur le
 * plan tangent en leur centre, donc sans saut à l'antiméridien), puis coupées
 * en deux parts de floor(k/2) et k − floor(k/2) paquets, et ainsi de suite.
 */
function decouper(es: readonly EntiteGrappe[], k: number): EntiteGrappe[][] {
  if (k <= 1) return [[...es]];
  const c = centre(es);
  // Plan tangent : est (vers les longitudes croissantes) et nord.
  const est = normer(Math.hypot(c[0], c[1]) > 1e-9 ? [-c[1], c[0], 0] : [0, 1, 0]);
  const nord: Vec = [c[1] * est[2] - c[2] * est[1], c[2] * est[0] - c[0] * est[2], c[0] * est[1] - c[1] * est[0]];
  const xy = es.map((e) => {
    const v = vecteur(e.point);
    return [dot(v, est), dot(v, nord)] as const;
  });
  const mx = xy.reduce((s, p) => s + p[0], 0) / xy.length;
  const my = xy.reduce((s, p) => s + p[1], 0) / xy.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of xy) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  // Grand axe (vecteur propre de la covariance) ; θ dans ]−π/2, π/2] : l'axe pointe vers l'est.
  const θ = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const t = xy.map(([x, y]) => x * Math.cos(θ) + y * Math.sin(θ));
  const rangees = es.map((e, i) => ({ e, t: t[i]! })).sort((a, b) => a.t - b.t || cmp(a.e.id, b.e.id)).map((r) => r.e);
  const k1 = Math.floor(k / 2);
  const n1 = tailles(es.length, k).slice(0, k1).reduce((s, x) => s + x, 0);
  return [...decouper(rangees.slice(0, n1), k1), ...decouper(rangees.slice(n1), k - k1)];
}

/** Inertie d'un paquet : Σ |v − moyenne|² sur ses vecteurs unitaires = n − |Σ v|² / n. */
function inertie(somme: Vec, n: number): number {
  return n ? n - dot(somme, somme) / n : 0;
}

/**
 * Affine des paquets par échanges : tant qu'échanger deux entités de paquets
 * différents réduit l'inertie totale, le meilleur échange est fait (à gain
 * égal, le premier dans l'ordre des paquets et des ids). Les tailles ne
 * changent pas ; les bissections laissent parfois une entité du mauvais côté
 * d'une coupe droite (l'Azerbaïdjan avec l'Irak plutôt qu'avec l'Arménie).
 */
function affiner(paquets: EntiteGrappe[][]): EntiteGrappe[][] {
  const ps = paquets.map((p) => [...p].sort((a, b) => cmp(a.id, b.id)));
  const vec = new Map<string, Vec>();
  for (const p of ps) for (const e of p) vec.set(e.id, vecteur(e.point));
  const sommes = ps.map((p) =>
    p.reduce<Vec>((s, e) => {
      const v = vec.get(e.id)!;
      return [s[0] + v[0], s[1] + v[1], s[2] + v[2]];
    }, [0, 0, 0]),
  );
  for (let tour = 0; tour < 1000; tour++) {
    let meilleur: { a: number; i: number; b: number; j: number; gain: number } | null = null;
    for (let a = 0; a < ps.length; a++) {
      for (let b = a + 1; b < ps.length; b++) {
        const avant = inertie(sommes[a]!, ps[a]!.length) + inertie(sommes[b]!, ps[b]!.length);
        for (let i = 0; i < ps[a]!.length; i++) {
          const u = vec.get(ps[a]![i]!.id)!;
          for (let j = 0; j < ps[b]!.length; j++) {
            const w = vec.get(ps[b]![j]!.id)!;
            const d: Vec = [w[0] - u[0], w[1] - u[1], w[2] - u[2]];
            const sa: Vec = [sommes[a]![0] + d[0], sommes[a]![1] + d[1], sommes[a]![2] + d[2]];
            const sb: Vec = [sommes[b]![0] - d[0], sommes[b]![1] - d[1], sommes[b]![2] - d[2]];
            const gain = avant - inertie(sa, ps[a]!.length) - inertie(sb, ps[b]!.length);
            if (gain > 1e-12 && (!meilleur || gain > meilleur.gain + 1e-12)) meilleur = { a, i, b, j, gain };
          }
        }
      }
    }
    if (!meilleur) break;
    const { a, i, b, j } = meilleur;
    const ea = ps[a]![i]!;
    const eb = ps[b]![j]!;
    const u = vec.get(ea.id)!;
    const w = vec.get(eb.id)!;
    const sa = sommes[a]!;
    const sb = sommes[b]!;
    sommes[a] = [sa[0] + w[0] - u[0], sa[1] + w[1] - u[1], sa[2] + w[2] - u[2]];
    sommes[b] = [sb[0] + u[0] - w[0], sb[1] + u[1] - w[1], sb[2] + u[2] - w[2]];
    ps[a]![i] = eb;
    ps[b]![j] = ea;
    ps[a]!.sort((x, y) => cmp(x.id, y.id));
    ps[b]!.sort((x, y) => cmp(x.id, y.id));
  }
  return ps;
}

interface Groupe {
  cle: string;
  continent: string;
  groupes: string[];
  membres: EntiteGrappe[];
}

/**
 * Grappes d'un ensemble d'entités :
 * 1. un groupe par (continent, groupe) ;
 * 2. tant qu'un groupe a moins de `min` entités, le plus petit (puis par nom)
 *    est fusionné avec le groupe du même continent dont le centre moyen est
 *    le plus proche (seul de son continent : il reste tel quel) ;
 * 3. un groupe de plus de `taille` + 1 entités est découpé en
 *    k = ceil(n / taille) paquets voisins de tailles équilibrées (k réduit
 *    tant qu'un paquet aurait moins de `min`), par bissections puis
 *    échanges ; de `min` à `taille` + 1, il est gardé entier.
 * Pays : de 5 à 9 par grappe, un seul continent. Dans une grappe, superficie
 * décroissante ; grappes dans l'ordre ORDRE_CONTINENTS, puis par superficie
 * totale décroissante.
 */
export function grappes(
  entites: readonly EntiteGrappe[],
  { taille = TAILLE_GRAPPE, min = TAILLE_MIN }: { taille?: number; min?: number } = {},
): Grappe[] {
  const tries = [...entites].sort((a, b) => cmp(a.id, b.id));
  const parCle = new Map<string, Groupe>();
  for (const e of tries) {
    const cle = `${e.continent}\u0000${e.groupe}`;
    let g = parCle.get(cle);
    if (!g) parCle.set(cle, (g = { cle, continent: e.continent, groupes: [e.groupe], membres: [] }));
    g.membres.push(e);
  }
  let groupes = [...parCle.values()].sort((a, b) => cmp(a.cle, b.cle));

  // Fusion des petits groupes.
  const isoles = new Set<Groupe>();
  for (;;) {
    const petits = groupes
      .filter((g) => g.membres.length < min && !isoles.has(g))
      .sort((a, b) => a.membres.length - b.membres.length || cmp(a.cle, b.cle));
    const p = petits[0];
    if (!p) break;
    const cp = centre(p.membres);
    const proches = groupes
      .filter((g) => g !== p && g.continent === p.continent)
      .map((g) => ({ g, d: distance(cp, centre(g.membres)) }))
      .sort((a, b) => a.d - b.d || cmp(a.g.cle, b.g.cle));
    const cible = proches[0]?.g;
    if (!cible) {
      isoles.add(p);
      continue;
    }
    const fusion: Groupe = {
      cle: `${cible.cle} + ${p.groupes.join(' + ')}`,
      continent: p.continent,
      groupes: [...cible.groupes, ...p.groupes],
      membres: [...cible.membres, ...p.membres].sort((a, b) => cmp(a.id, b.id)),
    };
    groupes = [...groupes.filter((g) => g !== p && g !== cible), fusion].sort((a, b) => cmp(a.cle, b.cle));
  }

  // Découpage des grands groupes.
  const resultat: Grappe[] = [];
  for (const g of groupes) {
    const n = g.membres.length;
    let k = n > taille + 1 ? Math.ceil(n / taille) : 1;
    while (k > 1 && Math.floor(n / k) < min) k--;
    const nom = g.groupes.join(' + ');
    affiner(decouper(g.membres, k)).forEach((paquet, i) => {
      const membres = [...paquet].sort((a, b) => b.superficie_km2 - a.superficie_km2 || cmp(a.id, b.id));
      resultat.push({
        id: k > 1 ? `${nom} ${i + 1}/${k}` : nom,
        continent: g.continent,
        groupes: [...g.groupes],
        membres: membres.map((e) => e.id),
        superficie_km2: membres.reduce((s, e) => s + e.superficie_km2, 0),
      });
    });
  }
  const rang = (c: string): number => {
    const i = ORDRE_CONTINENTS.indexOf(c);
    return i < 0 ? ORDRE_CONTINENTS.length : i;
  };
  return resultat.sort(
    (a, b) => rang(a.continent) - rang(b.continent) || cmp(a.continent, b.continent) || b.superficie_km2 - a.superficie_km2 || cmp(a.id, b.id),
  );
}

/** Grappes des pays jouables (pays.json), par sous-région ONU. */
export function grappesPays(pays: readonly Pays[]): Grappe[] {
  return grappes(
    pays
      .filter((p) => p.statut === 'jouable')
      .map((p) => ({ id: p.id, point: p.point, groupe: p.sous_region, continent: p.continent, superficie_km2: p.superficie_km2 })),
  );
}

/** Grappes des communes jouables d'un terrain local (un seul groupe, paquets de TAILLE_GRAPPE_COMMUNES voisines). */
export function grappesCommunes(communes: readonly Lieu[], nom = 'La Réunion'): Grappe[] {
  return grappes(
    communes
      .filter((c) => c.statut === 'jouable')
      .map((c) => ({ id: c.id, point: c.point, groupe: nom, continent: nom, superficie_km2: c.superficie_km2 })),
    { taille: TAILLE_GRAPPE_COMMUNES },
  );
}
