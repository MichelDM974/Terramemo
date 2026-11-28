// Lots de la synchro (J1b, lot 3 ; étude docs/etudes/2026-11-07-j1b-conception.md,
// § 5.2 et § 6, D32 et D35) : les événements du journal à envoyer, groupés par
// séance et par appareil, triés par (ts, id) et coupés par 200. Un lot est un
// document `joueurs/{uid}/lots/{lotId}` en création seule, dont l'id est celui
// de son premier événement (un uuid : unique, et le même à chaque
// recomposition). Pur : ni Firebase, ni IndexedDB.
//
// Encodage par position (D35 a) : `evenements` est une chaîne JSON, une liste
// de cartes, une carte par événement. Les règles bornent une chaîne (au plus
// n × 160 caractères), pas une carte d'une liste (D34). Une carte :
//   [id, t, tz, type, fiche, masque, ...valeurs]
// - id : un uuid en minuscules s'écrit en base64url (22 caractères) ; tout
//   autre id, tel quel derrière « = » (absent de l'alphabet base64url, donc
//   sans ambiguïté) ;
// - t : l'instant du premier événement du lot, puis l'écart à lui (ms) ;
// - type : son rang dans TYPES ;
// - masque : un bit par champ facultatif présent, dans l'ordre de
//   FACULTATIFS ; les valeurs des champs présents suivent, dans cet ordre
//   (null compris : présent et null n'est pas absent) ;
// - `v`, `appareil` et `seance` sont mis en facteur dans le lot.
// Ces listes sont le format v1 : on n'y ajoute qu'à la fin, et jamais
// pendant que v vaut 1 (un champ nouveau du journal demande v = 2).
//
// Format v2 (étude du J4, lot 0, D617 a) : la v1 plus `estime` à la fin de
// FACULTATIFS (le 10e bit du masque). compacter() écrit une carte v1 et une
// carte v2 de la même façon ; seul `v` change : 1 tant qu'aucun événement du
// lot n'a `estime` (le lot est alors octet pour octet celui d'avant la v2,
// lisible par une version plus ancienne), 2 sinon. deplier() lit les deux.
import { valider, type Evenement } from '../srs/journal';

/** Versions du format que cette version sait lire (`v` du document) ; lotValide des règles les accepte. */
export const VERSIONS_LOT: readonly number[] = [1, 2];
/** Événements par lot, au plus (règles : `n` de 1 à 200). */
export const N_MAX = 200;
/** Borne de la chaîne des règles : n × 160 caractères au plus. */
export const CARACTERES_PAR_EVENEMENT = 160;
/** Longueur d'un uuid : l'id d'un lot, son appareil, sa séance (règles). */
export const LONGUEUR_UUID = 36;

/** Le document d'un lot, sans `fin` (l'heure du serveur, posée à l'écriture). */
export interface DocLot {
  v: number;
  appareil: string;
  seance: string | null;
  n: number;
  evenements: string;
}

/** Un lot composé : son id (celui du premier événement) et ses événements triés. */
export interface Lot {
  id: string;
  appareil: string;
  seance: string | null;
  evenements: Evenement[];
}

// --- Format v1 : rangs figés -------------------------------------------------

const TYPES = ['reponse', 'connu', 'reinitialiser'] as const;
const MODES = ['qcm', 'rappel', 'revision', 'libre'] as const;
const VIAS = ['trace', 'pastille', 'proche'] as const;
const AIDES = ['voir', 'passer', 'connu'] as const;
const FACULTATIFS = ['mode', 'reponse', 'via', 'zoom', 'correct', 'aide', 'duree_ms', 'distance_km', 'note', 'estime'] as const;
type Facultatif = (typeof FACULTATIFS)[number];
/** Champs facultatifs de chaque version : les premiers de FACULTATIFS (la v1 ses neuf, la v2 `estime` en plus). */
const CHAMPS_DE_V: Readonly<Record<number, number>> = { 1: 9, 2: 10 };

/** La version d'un lot de ces événements : 2 si l'un porte `estime`, 1 sinon (la v1 d'avant, octet pour octet). */
export const versionLot = (evts: readonly Evenement[]): number => (evts.some((e) => e.estime !== undefined) ? 2 : 1);

/** Un rang d'une liste (enum), ou null pour null. */
const rang = (liste: readonly string[]) => ({
  encoder: (x: unknown) => (x === null ? null : liste.indexOf(x as string)),
  decoder: (x: unknown) => (x === null ? null : Number.isInteger(x) && (x as number) >= 0 && (x as number) < liste.length ? liste[x as number] : undefined),
});
const tel = { encoder: (x: unknown) => x, decoder: (x: unknown) => x };
/** correct : 1 ou 0. */
const booleen = { encoder: (x: unknown) => (x ? 1 : 0), decoder: (x: unknown) => (x === 1 ? true : x === 0 ? false : undefined) };

/** Encodage de chaque champ facultatif ; `decoder` rend undefined pour une valeur hors du format. */
const CODECS: Record<Facultatif, { encoder(x: unknown): unknown; decoder(x: unknown): unknown }> = {
  mode: { encoder: (x) => MODES.indexOf(x as (typeof MODES)[number]), decoder: (x) => (x === null ? undefined : rang(MODES).decoder(x)) },
  reponse: tel,
  via: rang(VIAS),
  zoom: tel,
  correct: booleen,
  aide: rang(AIDES),
  duree_ms: tel,
  distance_km: tel,
  note: tel,
  estime: tel,
};

// --- Ids ---------------------------------------------------------------------

const UUID_MINUSCULES = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL_22 = /^[A-Za-z0-9_-]{22}$/;
/** Préfixe d'un id écrit tel quel (pas un uuid en minuscules). */
const BRUT = '=';

function uuidVersBase64(u: string): string {
  const hex = u.replaceAll('-', '');
  let binaire = '';
  for (let i = 0; i < 32; i += 2) binaire += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(binaire).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64VersUuid(s: string): string | null {
  if (!BASE64URL_22.test(s)) return null;
  let binaire: string;
  try {
    binaire = atob(s.replaceAll('-', '+').replaceAll('_', '/') + '==');
  } catch {
    return null;
  }
  if (binaire.length !== 16) return null;
  const h = Array.from(binaire, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const u = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  // Une seule écriture par uuid : les 4 derniers bits du 22e caractère à zéro.
  return uuidVersBase64(u) === s ? u : null;
}

export function encoderId(id: string): string {
  return UUID_MINUSCULES.test(id) ? uuidVersBase64(id) : BRUT + id;
}

export function decoderId(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  if (x.startsWith(BRUT)) return x.length > 1 ? x.slice(1) : null;
  return base64VersUuid(x);
}

// --- Cartes ------------------------------------------------------------------

/** Trié par (ts, id) : l'ordre du lot, et son id (le premier). */
export function trier(evts: readonly Evenement[]): Evenement[] {
  return [...evts].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * La chaîne `evenements` d'un lot : ses cartes encodées par position. Les
 * événements sont ceux d'un lot (même appareil, même séance), triés.
 */
export function compacter(evts: readonly Evenement[]): string {
  const t0 = evts[0]?.ts ?? 0;
  const cartes = evts.map((e, i) => {
    let masque = 0;
    const valeurs: unknown[] = [];
    FACULTATIFS.forEach((k, b) => {
      const x = (e as unknown as Record<string, unknown>)[k];
      if (x === undefined) return;
      masque |= 1 << b;
      valeurs.push(CODECS[k].encoder(x));
    });
    return [encoderId(e.id), i === 0 ? e.ts : e.ts - t0, e.tz, TYPES.indexOf(e.type), e.fiche, masque, ...valeurs];
  });
  return JSON.stringify(cartes);
}

/** Les événements d'un lot lu, ou ce qui ne va pas (format inconnu, carte refusée par valider()). */
export type Deplie = { ok: true; evenements: Evenement[] } | { ok: false; probleme: string };

/**
 * Le lot déplié : chaque carte redevient un événement, validé. Un `v`
 * inconnu, un bit du masque hors de sa version (`estime` dans un lot v1) ou
 * une carte refusée rend le lot entier illisible pour cette version de
 * l'appli (il ira dans `a_relire`, lot 4).
 */
export function deplier(doc: Pick<DocLot, 'v' | 'appareil' | 'seance' | 'n' | 'evenements'>): Deplie {
  if (!VERSIONS_LOT.includes(doc.v)) return { ok: false, probleme: `version ${String(doc.v)}` };
  const champs = CHAMPS_DE_V[doc.v]!;
  if (typeof doc.evenements !== 'string') return { ok: false, probleme: 'evenements' };
  let cartes: unknown;
  try {
    cartes = JSON.parse(doc.evenements);
  } catch {
    return { ok: false, probleme: 'evenements illisibles' };
  }
  if (!Array.isArray(cartes) || cartes.length !== doc.n) return { ok: false, probleme: 'n' };
  const evenements: Evenement[] = [];
  let t0 = 0;
  for (const [i, c] of cartes.entries()) {
    if (!Array.isArray(c) || c.length < 6) return { ok: false, probleme: `carte ${i}` };
    const [idc, t, tz, type, fiche, masque, ...valeurs] = c as unknown[];
    const id = decoderId(idc);
    if (!id || !Number.isSafeInteger(t) || !Number.isSafeInteger(masque) || (masque as number) < 0 || (masque as number) >= 1 << champs)
      return { ok: false, probleme: `carte ${i}` };
    if (i === 0) t0 = t as number;
    const e: Record<string, unknown> = {
      v: 1,
      id,
      appareil: doc.appareil,
      ts: i === 0 ? t : t0 + (t as number),
      tz,
      seance: doc.seance,
      type: Number.isInteger(type) ? TYPES[type as number] : undefined,
      fiche,
    };
    let j = 0;
    for (const [b, k] of FACULTATIFS.slice(0, champs).entries()) {
      if (!((masque as number) & (1 << b))) continue;
      if (j >= valeurs.length) return { ok: false, probleme: `carte ${i} : ${k} manquant` };
      const x = CODECS[k].decoder(valeurs[j++]);
      if (x === undefined) return { ok: false, probleme: `carte ${i} : ${k}` };
      e[k] = x;
    }
    if (j !== valeurs.length) return { ok: false, probleme: `carte ${i} : valeurs en trop` };
    if (!valider(e)) return { ok: false, probleme: `carte ${i} refusée` };
    evenements.push(e);
  }
  return { ok: true, evenements };
}

/**
 * Les ids d'un lot lu en ligne, sans valider ses cartes : un renvoi refusé
 * parce que le lot existe déjà (§ 5.2, « présent ») les marque envoyés. Lève
 * si la chaîne n'est pas une liste de cartes à id.
 */
export function idsDuLot(doc: { evenements?: unknown }): string[] {
  const cartes: unknown = typeof doc.evenements === 'string' ? JSON.parse(doc.evenements) : null;
  if (!Array.isArray(cartes)) throw new Error('lot sans cartes');
  return cartes.map((c, i) => {
    const id = Array.isArray(c) ? decoderId(c[0]) : null;
    if (!id) throw new Error(`carte ${i} sans id`);
    return id;
  });
}

// --- Composition -------------------------------------------------------------

/**
 * Les lots de ces événements (§ 5.2) : un groupe par appareil et par séance
 * (`seance: null` forme le sien), trié par (ts, id), coupé par 200. Un lot a
 * l'id de son premier événement. Les lots viennent dans l'ordre de leur
 * premier événement.
 */
export function composer(evts: readonly Evenement[]): Lot[] {
  const groupes = new Map<string, Evenement[]>();
  for (const e of evts) {
    const cle = JSON.stringify([e.appareil, e.seance]);
    const g = groupes.get(cle);
    if (g) g.push(e);
    else groupes.set(cle, [e]);
  }
  const lots: Lot[] = [];
  for (const g of groupes.values()) {
    const tries = trier(g);
    for (let i = 0; i < tries.length; i += N_MAX) {
      const morceau = tries.slice(i, i + N_MAX);
      const premier = morceau[0]!;
      lots.push({ id: premier.id, appareil: premier.appareil, seance: premier.seance, evenements: morceau });
    }
  }
  return lots.sort((a, b) => a.evenements[0]!.ts - b.evenements[0]!.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Le document d'un lot composé, en v1 tant qu'aucun de ses événements n'a `estime` (versionLot). */
export function docDuLot(l: Lot): DocLot {
  return { v: versionLot(l.evenements), appareil: l.appareil, seance: l.seance, n: l.evenements.length, evenements: compacter(l.evenements) };
}

/**
 * Ce que les règles refuseraient (lotValide de firestore.rules, recopiée ;
 * tests/regles.test.ts confronte les deux), plus ce qu'elles ne peuvent pas
 * voir dans la chaîne : le lot se relit en entier (deplier), et sa première
 * carte porte son id. null si le lot passe.
 */
export function problemeLot(id: string, doc: DocLot): string | null {
  if (id.length !== LONGUEUR_UUID) return 'id';
  if (!VERSIONS_LOT.includes(doc.v)) return 'v';
  if (typeof doc.appareil !== 'string' || doc.appareil.length !== LONGUEUR_UUID) return 'appareil';
  if (doc.seance !== null && (typeof doc.seance !== 'string' || doc.seance.length !== LONGUEUR_UUID)) return 'seance';
  if (!Number.isInteger(doc.n) || doc.n < 1 || doc.n > N_MAX) return 'n';
  if (typeof doc.evenements !== 'string' || doc.evenements.length > doc.n * CARACTERES_PAR_EVENEMENT) return 'evenements';
  const d = deplier(doc);
  if (!d.ok) return d.probleme;
  if (d.evenements[0]?.id !== id) return 'premier id';
  return null;
}
