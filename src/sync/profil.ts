// Profil d'un compte, `joueurs/{uid}` (J1b, lot 2 ; étude
// docs/etudes/2026-11-07-j1b-conception.md, § 5.4, D8 a et D21 a) : le
// pseudo (non réservé, « Une place par pseudo » inchangée) et les records de
// l'appareil, pour qu'ils suivent le compte d'un appareil à l'autre.
//
// Document : `{v: 1, pseudo?, records?, maj}` ; `records` est une chaîne JSON
// (les règles bornent une chaîne, pas une carte : 32 768 caractères au plus,
// ≈ 7 Ko pour 48 clés), clé d'épreuve → record de l'appareil sans
// `publiable` (la place en ligne du pseudo en tient lieu). `supprime: true`,
// sans pseudo ni records, est la pierre tombale d'une suppression (§ 7.1) :
// rien ne s'y lit ni ne s'y écrit plus.
//
// Fusion (pure, ici) : par clé, le meilleur record, dans l'ordre de chrono.ts
// (plus de points, puis moins de temps, puis moins de questions) ; à égalité,
// celui du profil reste, pour qu'une fusion déjà faite n'écrive rien. Les
// semaines passées sont oubliées. Un record du barème 1 (points de
// proximité, jusqu'au 12/11/2026) est converti à la lecture
// (lireRecordsProfil : points = justes, décision « Barème et classements »),
// pour ne jamais comparer deux échelles ; le profil le reçoit converti à la
// prochaine écriture. Un record d'un autre barème vient d'une autre version
// de l'appli : plus récent, il est gardé tel quel (cette version ne sait pas
// le comparer) ; plus ancien, il cède la place au record de l'appareil, et
// reste s'il n'y en a pas. Deux versions ne se renvoient
// ainsi jamais la balle à chaque ouverture. Le pseudo, par une fusion à
// trois : celui du compte l'emporte, sauf si l'appareil a changé le sien
// depuis son dernier envoi à ce compte (lireBasePseudo : le pseudo du compte
// à ce moment-là, gardé à côté du pseudo dans le localStorage, pour qu'un
// changement s'y voie aussitôt écrit) ; un profil sans pseudo prend celui de
// l'appareil. Une création de compte pose la base vide : le pseudo du
// créateur devient celui du compte, même si un autre appareil a écrit le
// profil le premier.
//
// Écriture par transaction (une lecture, une écriture : Firestore lite) : la
// fusion est refaite sur le profil relu, deux appareils ne s'effacent donc
// jamais un record. Les records reçus s'appliquent ensuite à l'appareil
// (appliquer), sur ses records du moment : un record fait pendant l'appel
// n'est pas écrasé.
import { comparerScores, type ScoreEpreuve } from '../epreuve/bareme';
import { BAREME_1, ecrireRecords, garder, garderPseudoDans, lirePseudoDe, lireRecords, oublierSemainesPassees, pointsV2, pseudoValide, VERSION_BAREME, type RecordChrono } from '../epreuve/chrono';
import type { Service } from './firebase';

/** Le pseudo du compte au dernier envoi réussi depuis cet appareil : la base de la fusion à trois du pseudo. */
const CLE_PSEUDO_COMPTE = 'terramemo.pseudo.compte';

export interface BasePseudo {
  uid: string;
  pseudo: string | null;
}

export function lireBasePseudo(stockage: Pick<Storage, 'getItem'> | null): BasePseudo | null {
  try {
    const b = JSON.parse(stockage?.getItem(CLE_PSEUDO_COMPTE) ?? 'null') as Partial<BasePseudo> | null;
    return b && typeof b.uid === 'string' && (typeof b.pseudo === 'string' || b.pseudo === null) ? { uid: b.uid, pseudo: b.pseudo } : null;
  } catch {
    return null;
  }
}

export function ecrireBasePseudo(stockage: Pick<Storage, 'setItem'> | null, b: BasePseudo): void {
  try {
    stockage?.setItem(CLE_PSEUDO_COMPTE, JSON.stringify(b));
  } catch {
    // Sans stockage : le pseudo du compte l'emportera, comme sur un nouvel appareil.
  }
}

/**
 * Le pseudo de l'appareil a-t-il changé depuis son dernier envoi au compte
 * `uid` ? Il l'emporte alors sur celui du compte. Sans base pour ce compte
 * (appareil qui le rejoint, autre compte avant), non : le pseudo du compte
 * l'emporte (§ 2.3, étape 7).
 */
export function pseudoChangeIci(local: string | null, base: BasePseudo | null, uid: string): boolean {
  return !!local && base?.uid === uid && base.pseudo !== local;
}

/** Version du document du profil (`v`). */
export const V_PROFIL = 1;

/** Borne de la chaîne des records : celle de profilValide() (firestore.rules). */
export const RECORDS_MAX = 32_768;

/** Le profil tel qu'il est en ligne, pas encore validé ; absent : `existe` faux. */
export interface ProfilLu {
  existe: boolean;
  supprime: boolean;
  pseudo: string | null;
  records: string | null;
}

export const PROFIL_ABSENT: ProfilLu = { existe: false, supprime: false, pseudo: null, records: null };

/** Ce que l'appareil a : son pseudo et ses records (localStorage). */
export interface ProfilLocal {
  pseudo: string | null;
  records: Map<string, RecordChrono>;
}

/** Le document à écrire, sans `maj` (l'heure du serveur, posée à l'écriture). */
export interface DocProfil {
  v: typeof V_PROFIL;
  pseudo?: string;
  records?: string;
}

export interface Fusion {
  /** Le pseudo retenu, pour l'appareil et pour le compte. */
  pseudo: string | null;
  /** Les records du profil après fusion (clé → record brut), ceux d'une autre version compris. */
  enLigne: Record<string, unknown>;
  /** À écrire ; null : le profil a déjà tout (ou la chaîne dépasserait la borne : tropGros). */
  doc: DocProfil | null;
  /** Records de l'appareil battus ou ajoutés par le profil. */
  recus: number;
  /** Records du profil battus ou ajoutés par l'appareil. */
  envoyes: number;
  /** La chaîne des records dépasse RECORDS_MAX : les règles la refuseraient, rien n'est écrit. */
  tropGros: boolean;
}

type Brut = Record<string, unknown> & { bareme: number };

/** Un record de ce barème, aux champs plausibles ; sinon il n'entre pas sur l'appareil. */
function recordValide(r: Brut): r is Brut & RecordChrono {
  const { points, justes, questions, temps_ms, date } = r as Partial<Record<string, unknown>>;
  return (
    r.bareme === VERSION_BAREME &&
    typeof points === 'number' &&
    Number.isFinite(points) &&
    points >= 0 &&
    Number.isInteger(justes) &&
    Number.isInteger(questions) &&
    (justes as number) >= 0 &&
    (questions as number) >= (justes as number) &&
    typeof temps_ms === 'number' &&
    Number.isFinite(temps_ms) &&
    temps_ms >= 0 &&
    typeof date === 'number' &&
    Number.isFinite(date)
  );
}

/**
 * Les records d'une chaîne du profil : les entrées qui ont un barème (les
 * autres sont jetées), celles du barème 1 converties au barème 2 (pointsV2)
 * quand leurs points et leurs justes sont des nombres ; sinon, elles restent
 * au barème 1 (une version plus ancienne, gardée telle quelle). Un record de
 * la semaine converti qui bat celui de toujours le remplace (au barème 1,
 * chacun avait été choisi aux points de proximité).
 */
export function lireRecordsProfil(brut: string | null): Map<string, Brut> {
  const lus = new Map<string, Brut>();
  if (!brut) return lus;
  let objet: unknown;
  try {
    objet = JSON.parse(brut);
  } catch {
    return lus;
  }
  if (!objet || typeof objet !== 'object' || Array.isArray(objet)) return lus;
  const semaines: string[] = [];
  for (const [k, r] of Object.entries(objet as Record<string, unknown>)) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || typeof (r as Brut).bareme !== 'number') continue;
    const b = r as Brut;
    const convertir = b.bareme === BAREME_1 && typeof b.points === 'number' && typeof b.justes === 'number';
    lus.set(k, convertir ? { ...pointsV2(b as Brut & { points: number; justes: number }), bareme: VERSION_BAREME } : b);
    if (convertir && k.includes('@')) semaines.push(k);
  }
  // Comme lireRecords (src/epreuve/chrono.ts) : converti, le record d'une semaine qui bat celui de toujours le remplace.
  for (const k of semaines) {
    const w = lus.get(k)!;
    const e = k.split('@')[0]!;
    const t = lus.get(e);
    if (recordValide(w) && (!t || (recordValide(t) && comparerScores(w, t) < 0))) lus.set(e, { ...scoreDe(w), date: w.date, bareme: VERSION_BAREME });
  }
  return lus;
}

const scoreDe = (r: ScoreEpreuve): ScoreEpreuve => ({ points: r.points, justes: r.justes, questions: r.questions, temps_ms: r.temps_ms });

/** Le record de l'appareil tel que le profil le garde : sans `publiable`, champs dans un ordre fixe. */
const pourProfil = (r: RecordChrono) => ({ ...scoreDe(r), date: r.date, bareme: r.bareme });

/**
 * La fusion du profil lu et de l'appareil (pure : sans effet, rejouable par
 * une transaction). `pseudoLocal` : le pseudo de l'appareil l'emporte (choisi
 * sur l'appareil, pas encore parti) ; `periode` : la semaine en cours.
 */
export function fusionner(lu: ProfilLu, local: ProfilLocal, o: { pseudoLocal: boolean; periode: string }): Fusion {
  const distants = lireRecordsProfil(lu.records);
  oublierSemainesPassees(distants, o.periode);
  const locaux = new Map(local.records);
  oublierSemainesPassees(locaux, o.periode);
  let recus = 0;
  for (const [k, r] of distants) if (recordValide(r) && garder(locaux, k, scoreDe(r), r.date).nouveau) recus++;

  const enLigne: Record<string, unknown> = {};
  let envoyes = 0;
  for (const k of [...new Set([...distants.keys(), ...locaux.keys()])].sort()) {
    const d = distants.get(k);
    const l = locaux.get(k);
    if (d && d.bareme > VERSION_BAREME) enLigne[k] = d; // d'une version plus récente : gardé tel quel
    else if (l) {
      if (d && recordValide(d) && comparerScores(scoreDe(l), d) >= 0) enLigne[k] = d;
      else {
        enLigne[k] = pourProfil(l);
        envoyes++;
      }
    } else if (d && d.bareme < VERSION_BAREME) enLigne[k] = d; // d'une version plus ancienne, sans record ici
  }

  const pd = lu.pseudo === null ? null : pseudoValide(lu.pseudo);
  const pseudo = o.pseudoLocal && local.pseudo ? local.pseudo : (pd ?? local.pseudo);
  const records = Object.keys(enLigne).length ? JSON.stringify(enLigne) : null;
  const tropGros = (records?.length ?? 0) > RECORDS_MAX;
  const change = !lu.existe || pseudo !== lu.pseudo || records !== lu.records;
  const doc: DocProfil | null = change && !tropGros ? { v: V_PROFIL, ...(pseudo ? { pseudo } : {}), ...(records ? { records } : {}) } : null;
  return { pseudo, enLigne, doc, recus, envoyes, tropGros };
}

/** Ce que l'application de la fusion a changé sur l'appareil. */
export interface Applique {
  /** Le pseudo de l'appareil avant d'être remplacé par celui du compte ; null s'il ne l'a pas été. */
  ancienPseudo: string | null;
  /** L'appareil avait un pseudo autre, ou aucun, et prend celui du compte. */
  pseudoPris: boolean;
  records: boolean;
}

/**
 * Applique la fusion à l'appareil : chaque record du profil, sur les records
 * du moment (garder : un record fait depuis la lecture n'est pas écrasé), et
 * le pseudo retenu, sauf si l'appareil en a changé depuis (`avant` : ce que
 * la fusion a lu de l'appareil).
 */
export function appliquer(stockage: Pick<Storage, 'getItem' | 'setItem'> | null, f: Fusion, avant: ProfilLocal, periode: string): Applique {
  const records = lireRecords(stockage);
  let change = oublierSemainesPassees(records, periode);
  for (const [k, r] of Object.entries(f.enLigne)) {
    const b = r as Brut;
    if (!b || typeof b !== 'object' || !recordValide(b)) continue;
    const bilan = garder(records, k, scoreDe(b), b.date);
    change ||= bilan.nouveau || bilan.progresPubliable;
  }
  if (change) ecrireRecords(stockage, records);
  const pseudoPris = !!f.pseudo && f.pseudo !== avant.pseudo && lirePseudoDe(stockage) === avant.pseudo;
  if (pseudoPris) garderPseudoDans(stockage, f.pseudo!);
  return { ancienPseudo: pseudoPris ? avant.pseudo : null, pseudoPris, records: change };
}

/** Ce que l'appareil a, relu à chaque appel. */
export function lireLocal(stockage: Pick<Storage, 'getItem' | 'setItem'> | null): ProfilLocal {
  return { pseudo: lirePseudoDe(stockage), records: lireRecords(stockage) };
}

const ref = (s: Service, uid: string) => s.m.fs.doc(s.db, 'joueurs', uid);

function profilDe(d: { exists(): boolean; data(): Record<string, unknown> | undefined }): ProfilLu {
  if (!d.exists()) return PROFIL_ABSENT;
  const x = d.data() ?? {};
  return {
    existe: true,
    supprime: x.supprime === true,
    pseudo: typeof x.pseudo === 'string' ? x.pseudo : null,
    records: typeof x.records === 'string' ? x.records : null,
  };
}

/** Le profil d'un compte : une lecture. Lève hors ligne, ou si les règles refusent (joueurs/ fermé jusqu'au lot 6). */
export async function lireProfil(s: Service, uid: string): Promise<ProfilLu> {
  return profilDe(await s.m.fs.getDoc(ref(s, uid)));
}

/**
 * La transaction : le profil relu, `calculer` refait (il peut l'être
 * plusieurs fois, Firestore rejouant une transaction en conflit : il doit
 * rester pur), puis le document écrit d'un coup si `calculer` en rend un.
 */
export async function ecrireProfil<T extends { doc: DocProfil | null }>(s: Service, uid: string, calculer: (lu: ProfilLu) => T | null): Promise<T | null> {
  const { fs } = s.m;
  return fs.runTransaction(s.db, async (t) => {
    const r = ref(s, uid);
    const fait = calculer(profilDe(await t.get(r)));
    if (fait?.doc) t.set(r, { ...fait.doc, maj: fs.serverTimestamp() });
    return fait;
  });
}
