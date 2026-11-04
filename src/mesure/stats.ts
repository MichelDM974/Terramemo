// Statistiques des mesures (pures).

/** Quantile par interpolation linéaire entre rangs (type 7, celui de numpy et R). null si vide. */
export function quantile(valeurs: readonly number[], q: number): number | null {
  if (valeurs.length === 0) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  const a = v[bas] as number;
  const b = v[haut] as number;
  return a + (b - a) * (pos - bas);
}

export const mediane = (v: readonly number[]) => quantile(v, 0.5);

/** Intervalles successifs d'une suite d'horodatages. */
export function intervalles(horodatages: readonly number[]): number[] {
  const res: number[] = [];
  for (let i = 1; i < horodatages.length; i++) res.push((horodatages[i] as number) - (horodatages[i - 1] as number));
  return res;
}

/** Facteur au-delà duquel un intervalle compte comme une image perdue. */
export const FACTEUR_PERDUE = 1.5;

/**
 * À-coup (décision de l'utilisateur du 04/11/2026, ticket #1) : une image qui
 * tarde 25 ms ou plus, trois rafraîchissements d'un écran à 120 Hz, un et
 * demi à 60 i/s, quelle que soit la fréquence de l'écran. Le seuil est posé
 * vers 21 ms, loin des valeurs exactes que donne l'écran : 16,67 ms (deux
 * images à 120 Hz, une à 60) et 25 ms (trois à 120 Hz). Posé à 25 ms pile,
 * il comptait au hasard : l'arrondi au dixième donne 24,9, 25 ou 25,1 ms, et
 * avec ± 1 ms de gigue un quart de ces intervalles échappait (relecture du
 * critère v4). À 21 ms, ± 4 ms de gigue autour de 16,67 comme de 25 ms ne
 * changent rien. Compte aussi 22,2 ms (deux images à 90 Hz : une perdue) ;
 * 20,8 ms (trois images à 144 Hz) est à 0,2 ms du seuil, mais aucun écran
 * visé ne tourne à 144 Hz. Aucune période estimée n'y entre.
 */
export const SEUIL_ACOUP_MS = 21;
/** Verdict « pas de saccade » : NON au-delà de 3 à-coups par seconde, en moyenne par type de geste ou dans un seul geste… */
export const ACOUPS_PAR_S_MAX = 3;
/**
 * … dans un seul geste à partir de 2 à-coups : un à-coup isolé dans un geste
 * court (1 en 0,3 s : 3,3/s) ne compte pas (décision de l'utilisateur).
 */
export const ACOUPS_MIN_GESTE = 2;
/**
 * … ou dès un gel : une image qui tarde 50 ms (trois images à 60 Hz, six à
 * 120 Hz), visible seule (décision de l'utilisateur). Seuil posé vers 46 ms,
 * loin des valeurs exactes de l'écran, comme celui des à-coups : 41,67 ms
 * (cinq images à 120 Hz) et 50 ms. À 50 ms pile (v5 : « plus de 50 ms »), un
 * gel tranchait au hasard, une fois sur deux sous ± 0,5 ms de gigue
 * (relecture du critère v5 : seul, un intervalle de 50,1 ms faisait NON le
 * rendu canvas). À 46 ms, un gel de 50 ms sous ± 2 ms de gigue par
 * horodatage (46 à 54 ms) compte toujours, cinq images à 120 Hz (41,67 ±
 * 4 ms) jamais. 44,4 ms (quatre images à 90 Hz) est à 1,6 ms du seuil, mais
 * aucun écran visé ne tourne à 90 Hz.
 */
export const SEUIL_GEL_MS = 46;

/** Un intervalle est un à-coup : ≥ SEUIL_ACOUP_MS. */
export const estAcoup = (d: number) => d >= SEUIL_ACOUP_MS;

/** Un intervalle est un gel : ≥ SEUIL_GEL_MS (c'est aussi un à-coup). */
export const estGel = (d: number) => d >= SEUIL_GEL_MS;

/** À-coups par seconde de geste : à-coups × 1000 / durée (somme des intervalles) ; 0 sans durée. */
export const acoupsParSeconde = (acoups: number, duree_ms: number) => (duree_ms > 0 ? (acoups * 1000) / duree_ms : 0);

/** Ce qu'un geste apporte au verdict : à-coups, durée (somme des intervalles), gels. */
export interface CompteSaccade {
  acoups: number;
  duree_ms: number;
  gels: number;
}

/**
 * Un geste qui, à lui seul, fait dire NON : un gel, ou plus de 3 à-coups par
 * seconde de ce geste avec au moins 2 à-coups. Sans cette règle, les gestes
 * propres d'un type diluaient un geste qui saccade franchement (relecture du
 * critère v5 : un geste entier à 30 i/s parmi 14 gestes propres, 2 à-coups
 * par seconde en moyenne, passait).
 */
export const gesteSaccade = (g: CompteSaccade) =>
  g.gels > 0 || (g.acoups >= ACOUPS_MIN_GESTE && acoupsParSeconde(g.acoups, g.duree_ms) > ACOUPS_PAR_S_MAX);

/**
 * Verdict « pas de saccade » sur un type de geste (toutes ses répétitions,
 * quel que soit le rendu) : faux au-delà de 3 à-coups par seconde de geste en
 * moyenne (à-coups × 1000 / somme des durées), ou si un seul geste saccade
 * (gesteSaccade : un gel ≥ 46 ms, ou plus de 3 à-coups par seconde de ce geste
 * avec au moins 2). Compté par seconde et non par intervalle (v4 : 5 % des
 * intervalles), pour ne pas avantager le rendu le plus rapide : à 120 i/s,
 * 5 % des intervalles laissaient passer deux fois plus d'à-coups visibles
 * par seconde qu'à 60 i/s. 3 par seconde, c'est ces 5 % à 60 i/s. Monotone :
 * à durée fixe, des images plus rapides ne changent ni les comptes, ni la
 * durée. Recopié par le driver (run-cartographe : est_acoup, est_gel,
 * geste_saccade, sans_saccade, tenue des 120 i/s), confronté à celui-ci par
 * tests/mesure-driver.test.ts.
 */
export function sansSaccade(gestes: readonly CompteSaccade[]): boolean {
  const acoups = gestes.reduce((a, g) => a + g.acoups, 0);
  const duree = gestes.reduce((a, g) => a + g.duree_ms, 0);
  return !(acoupsParSeconde(acoups, duree) > ACOUPS_PAR_S_MAX) && !gestes.some(gesteSaccade);
}

/**
 * Tenue des 120 i/s : un intervalle d'au plus 12,5 ms (1,5 × 8,33, une image
 * à 120 Hz, gigue comprise) est une image à 120 i/s. Seuil fixe, sans période
 * estimée (v4 : 1,5 × la plus courte des périodes estimées, qui tombait à
 * 7,7 ou 6,94 ms sous ± 2 ms de gigue et rendait la tenue non monotone) : à
 * ± 2 ms de gigue, 8,33 reste dessous et 16,67 dessus, la part suit donc
 * exactement celle des images à 120 i/s. Rapportée sans verdict.
 */
export const SEUIL_120_MS = 12.5;

/** Part des intervalles ≤ SEUIL_120_MS, de 0 à 1 (0 sans intervalle). */
export const tenue120 = (iv: readonly number[]) => (iv.length ? iv.filter((d) => d <= SEUIL_120_MS).length / iv.length : 0);

export interface StatsImages {
  /** Nombre d'images (intervalles + 1). */
  images: number;
  mediane_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
  /** Intervalles plus longs que 1,5 × la période de l'écran (8,3 ms à 120 Hz → > 12,5 ms). */
  perdues: number;
  /** Images sautées au total : somme de (round(intervalle / période) − 1) sur les intervalles perdus. */
  vsync_manquees: number;
  /** Part des intervalles perdus, de 0 à 1. */
  part_perdues: number;
}

/**
 * Compte des images perdues sur une période ; les `tete` premiers intervalles
 * sont comptés sur periode_tete_ms (bascule de fréquence en tête de geste :
 * voir statsGeste).
 */
export function statsImages(iv: readonly number[], periode_ms: number, tete = 0, periode_tete_ms = periode_ms): StatsImages {
  let perdues = 0;
  let manquees = 0;
  iv.forEach((d, i) => {
    const p = i < tete ? periode_tete_ms : periode_ms;
    if (d > FACTEUR_PERDUE * p) {
      perdues++;
      manquees += Math.max(1, Math.round(d / p) - 1);
    }
  });
  return {
    images: iv.length === 0 ? 0 : iv.length + 1,
    mediane_ms: arrondi(mediane(iv)),
    p95_ms: arrondi(quantile(iv, 0.95)),
    max_ms: iv.length ? arrondi(Math.max(...iv)) : null,
    perdues,
    vsync_manquees: manquees,
    part_perdues: iv.length ? arrondi(perdues / iv.length, 3) ?? 0 : 0,
  };
}

/** Périodes connues (ms) : écrans à 144, 120, 90 et 60 Hz, et 30 images par seconde (moitié de 60). */
export const PERIODES_CONNUES: readonly number[] = [1000 / 144, 1000 / 120, 1000 / 90, 1000 / 60, 1000 / 30];
/** Écart relatif sous lequel l'estimation est calée sur la période connue (ou du repos) la plus proche. */
export const CALAGE_PERIODE = 0.06;
/**
 * Part des intervalles que la grappe basse doit réunir pour donner la période
 * du geste ; en deçà, quelques images courtes (fin de bascule, rattrapage) ne
 * font pas la période : on part de la médiane.
 */
export const PART_GRAPPE = 0.25;
/** Écart relatif entre la période d'un geste et celle du repos au-delà duquel on le signale. */
export const ECART_PERIODE = 0.25;

/** Médiane de la grappe d'intervalles ≤ 1,5 × p, recalculée trois fois à partir de p ; et sa taille. */
function grappe(iv: readonly number[], depart: number): { p: number; n: number } {
  let p = depart;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const g = iv.filter((d) => d <= FACTEUR_PERDUE * p);
    if (!g.length) break;
    p = mediane(g) as number;
    n = g.length;
  }
  return { p, n };
}

/**
 * Période de l'écran pendant un geste, estimée sur ses intervalles ; null sans
 * intervalle. Médiane de la grappe basse (intervalles ≤ 1,5 × la période,
 * partie du 10e centile et recalculée), puis calée sur la période connue la
 * plus proche (ou celle du repos) à 6 % près. Le 10e centile seul faisait une
 * falaise (8 % d'images à 120 Hz sur un geste à 60 : période 16,7 ms ; 12 % :
 * 9,2 ms, et 89 % d'images perdues) et descendait à 6,6 ms sous une gigue de
 * ± 2 ms à 120 Hz (relecture V2 du J0). La grappe basse tient tant qu'elle
 * réunit le quart des intervalles : une appli qui perd 40 % de ses images
 * garde sa période (la médiane, elle, deviendrait deux périodes).
 */
export function periodeGeste(iv: readonly number[], periode_repos_ms?: number | null): number | null {
  if (!iv.length) return null;
  let { p, n } = grappe(iv, quantile(iv, 0.1) as number);
  if (n < PART_GRAPPE * iv.length) p = grappe(iv, mediane(iv) as number).p;
  const connues = periode_repos_ms ? [...PERIODES_CONNUES, periode_repos_ms] : PERIODES_CONNUES;
  let calee = p;
  let ecart = CALAGE_PERIODE;
  for (const c of connues) {
    const e = Math.abs(p - c) / c;
    if (e <= ecart) [calee, ecart] = [c, e];
  }
  return arrondi(calee, 2);
}

export interface StatsGeste extends StatsImages {
  /**
   * Période de l'écran estimée sur les intervalles du geste (periodeGeste),
   * base de perdues, vsync_manquees et part_perdues ; null sans intervalle
   * (le compte se fait alors sur periode_repos_ms).
   */
  periode_geste_ms: number | null;
  /** Période du repos utilisée (ecran.periode_ms, 16,67 ms si non mesurée). */
  periode_repos_ms: number;
  /** La période du geste s'écarte de plus de 25 % de celle du repos (écran à fréquence variable, ou cadence de l'appli). */
  ecart_periode: boolean;
  /**
   * Sens de l'écart : 'plus_rapide', l'écran accélère pendant le geste (repos
   * à 60 Hz, geste à 120) ; 'plus_lent', geste à une cadence plus lente que
   * l'écran au repos (appli à 60 images par seconde sur 120 Hz, ou écran qui
   * ralentit) : une cadence (tenue), pas une saccade. null sans écart.
   */
  ecart_sens: 'plus_rapide' | 'plus_lent' | null;
  /**
   * Bascule de fréquence en tête de geste : nombre d'intervalles, avant le
   * premier à la période du geste, quand l'écran accélère vraiment
   * (ecart_sens 'plus_rapide' : il est encore à sa fréquence de repos) ; 0
   * sinon. Ils sont comptés
   * sur la période du repos, dans perdues comme dans perdues_repos.
   */
  bascule_images: number;
  /** Intervalles perdus comptés sur la période du repos (tous les intervalles). */
  perdues_repos: number;
  /** Part de ces intervalles, de 0 à 1. */
  part_perdues_repos: number;
  /** Durée du geste : somme des intervalles (ms). */
  duree_ms: number;
  /** À-coups : intervalles ≥ 21 ms (estAcoup), base du verdict « pas de saccade ». */
  acoups: number;
  /** À-coups par seconde de geste : acoups × 1000 / duree_ms (0 sans durée), arrondi au centième. */
  acoups_par_s: number;
  /** Gels : intervalles ≥ 46 ms (estGel), comptés aussi dans acoups. */
  gels: number;
  /**
   * Ce geste, à lui seul, fait dire NON (gesteSaccade) : un gel, ou plus de
   * 3 à-coups par seconde avec au moins 2 à-coups. Le verdict d'un type de
   * geste y ajoute la moyenne par seconde sur toutes ses répétitions
   * (sansSaccade).
   */
  saccade: boolean;
  /**
   * Tenue des 120 i/s : part des intervalles ≤ 12,5 ms (tenue120), de 0 à 1,
   * bascule de tête comprise. Seuil fixe : monotone avec la part d'images à
   * 120 i/s. Rapportée sans verdict, pour comparer les rendus.
   */
  tenue_120: number;
  /** Images par seconde du geste : intervalles × 1000 / leur somme ; null sans intervalle. */
  cadence_ips: number | null;
}

/**
 * Statistiques d'un geste. Le verdict « pas de saccade » se lit sur acoups,
 * duree_ms et gels (≥ 21 et ≥ 46 ms, sans période estimée : saccade pour ce
 * geste seul, sansSaccade pour un type de geste) ; la tenue des 120 i/s
 * (tenue_120, cadence_ips) se rapporte à part, sans verdict.
 * Restent, informatifs, deux comptes d'images perdues (plus d'une période et
 * demie). perdues : sur la période du geste, sauf la bascule de tête (sur
 * celle du repos) ; il voit une image sautée à 120 Hz sur un écran à 60 Hz au
 * repos, mais bascule avec l'estimation de la période (v3 : base du verdict,
 * d'où sa falaise sur les cadences mêlées). perdues_repos : sur la période du
 * repos ; il voit une appli tenue à 60 images par seconde sur un écran à
 * 120 Hz (période du geste 16,7 ms, 0 perdue).
 */
export function statsGeste(iv: readonly number[], periode_repos_ms: number): StatsGeste {
  const pg = periodeGeste(iv, periode_repos_ms);
  const p = pg ?? periode_repos_ms;
  const ecart = pg != null && Math.abs(pg - periode_repos_ms) > ECART_PERIODE * periode_repos_ms;
  const sens = !ecart ? null : (pg as number) < periode_repos_ms ? 'plus_rapide' : 'plus_lent';
  // Bascule de tête seulement si l'écran accélère vraiment (v3 : dès que la
  // période du geste passait sous celle du repos, 16,67 contre 16,7 ms : des
  // images perdues en tête comptées comme une bascule).
  let tete = 0;
  if (sens === 'plus_rapide') {
    while (tete < iv.length && (iv[tete] as number) > FACTEUR_PERDUE * p) tete++;
    if (tete === iv.length) tete = 0;
  }
  const repos = statsImages(iv, periode_repos_ms);
  const acoups = iv.filter(estAcoup).length;
  const gels = iv.filter(estGel).length;
  const somme = iv.reduce((a, d) => a + d, 0);
  return {
    ...statsImages(iv, p, tete, periode_repos_ms),
    periode_geste_ms: pg,
    periode_repos_ms: arrondi(periode_repos_ms, 2) ?? periode_repos_ms,
    ecart_periode: ecart,
    ecart_sens: sens,
    bascule_images: tete,
    perdues_repos: repos.perdues,
    part_perdues_repos: repos.part_perdues,
    duree_ms: arrondi(somme) ?? 0,
    acoups,
    acoups_par_s: arrondi(acoupsParSeconde(acoups, somme), 2) ?? 0,
    gels,
    saccade: gesteSaccade({ acoups, duree_ms: somme, gels }),
    tenue_120: arrondi(tenue120(iv), 3) ?? 0,
    cadence_ips: somme > 0 ? arrondi((iv.length * 1000) / somme) : null,
  };
}

export function arrondi(v: number | null | undefined, chiffres = 1): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** chiffres;
  return Math.round(v * f) / f;
}
