// Envoi des séances du journal (J1b, lot 3 ; étude
// docs/etudes/2026-11-07-j1b-conception.md, § 5.1, 5.2, 5.5 et 5.7) : les
// événements que l'appareil n'a encore mis dans aucun lot partent en lots
// (src/sync/lots.ts), un document `joueurs/{uid}/lots/{lotId}` par lot, en
// création seule. Seulement pour un compte (D16 : rien pour un invité, anonyme
// compris), jamais quand la synchro est coupée, ni pendant une session perdue,
// une déconnexion ou une suppression (le compte rendu par `compte()` le dit).
// Jamais à chaque réponse : à la clôture d'une séance, à l'ouverture, au retour
// du réseau, au retour au premier plan, après une connexion, et au bouton
// « Réessayer » (main.ts et la vue Compte branchent ces déclencheurs). Un échec
// ne bloque rien : le journal de l'appareil fait foi.
//
// Une passe, sous le verrou `terramemo-synchro` (Web Locks : deux onglets ne
// composent jamais en même temps) :
// 1. la file d'écriture du journal attendue, puis le journal lu en entier ;
// 2. les événements dans aucun lot du compte composés en lots, sauf la séance
//    en cours de la page (en arrière-plan seulement, et pas plus d'une fois
//    toutes les 2 min), et les lots écrits (a_envoyer) **avant** l'envoi ;
// 3. chaque lot à essayer envoyé, avec ses issues (§ 5.2) : succès → envoye ;
//    réseau → nouvel essai à 30 s, 2 min, 10 min, puis 1 h, et à chaque
//    déclencheur ; quota de Spark → au premier déclencheur après minuit à Los
//    Angeles ; refus des règles → le lot relu : présent, ses ids sont envoyés
//    et le reste forme un nouveau lot ; absent, ou lecture refusée : refusé
//    (cause `regles`) ; lot que les règles refuseraient : jamais envoyé, cause
//    `invalide`, recomposé à chaque version.
//
// Lecture (lot 4, § 5.3), dans la même passe et sous le même verrou, avant de
// composer (un événement lu en ligne n'est jamais recomposé) : les lots du
// compte par pages de 100 (`orderBy('fin')`), depuis la marque moins 5 min
// (lecture incrémentale, à l'ouverture et au premier plan), ou tous (marque
// inconnue : connexion à un autre compte, reconnexion après une déconnexion,
// contrôle au démarrage qui trouve un id en ligne absent du journal). Chaque
// lot déplié va au journal (Memoire.fusionner) ; puis, seulement si
// l'union a réussi, sa fiche passe `en_ligne` et la marque avance. Un lot que
// cette version ne sait pas lire est gardé brut dans `a_relire`, et relu sans
// réseau à chaque nouvelle version. Jamais pendant une séance active : la
// lecture attend sa clôture. Un lot en attente dont des ids sont déjà en
// ligne ne part plus tel quel : son reste est recomposé (aucun doublon).
// Pas de Firebase importé ici : le serveur (serveurFirestore) vient du
// service déjà chargé par les comptes.
import type { Evenement } from '../srs/journal';
import type { EtatFiche } from '../srs/rejeu';
import { depotARelireIndexedDb, depotLotsIndexedDb, type DepotARelire, type DepotLots, type EtatLot, type FicheARelire, type FicheLot } from './depot-lots';
import { synchroCoupee } from './drapeaux';
import { codeErreur, remiseQuota } from './erreurs';
import type { Service } from './firebase';
import { composer, deplier, docDuLot, idsDuLot, problemeLot, trier, type Deplie, type DocLot, type Lot } from './lots';

/** Ce qui lance une passe d'envoi. */
export type Declencheur = 'ouverture' | 'cloture' | 'fond' | 'premier_plan' | 'reseau' | 'jeton' | 'reessayer' | 'minuterie' | 'connexion' | 'deconnexion';

/** Lots lus par page (§ 5.3). */
export const PAGE_LECTURE = 100;
/**
 * La lecture incrémentale repart de la marque moins 5 min : un lot écrit
 * pendant la lecture d'un autre appareil peut avoir un `fin` antérieur à la
 * marque (§ 5.3, « Bord de `fin` », S14). Les doublons sont ignorés.
 */
export const BORD_FIN = 5 * 60_000;

/** Délais des nouveaux essais après une erreur de réseau (§ 5.2) : 30 s, 2 min, 10 min, puis 1 h. */
export const DELAIS_RESEAU: readonly number[] = [30_000, 120_000, 600_000, 3_600_000];
/** Un lot refusé par les règles se relance de lui-même au plus une fois par jour. */
export const RELANCE_REGLES = 86_400_000;
/**
 * Une échéance (réseau, relance des refusés) à plus de deux jours vient d'une
 * horloge qui a reculé depuis (elle était en avance) : elle est tenue pour
 * échue, sinon elle bloquerait l'envoi. Celle du quota se juge à la remise
 * vue de l'horloge actuelle (remiseQuota).
 */
export const ECHEANCE_MAX = 2 * 86_400_000;
/** Une requête au serveur sans réponse dans ce délai est un échec du réseau : elle ne garde pas le verrou. */
export const DELAI_REQUETE = 30_000;
/** Le chargement du service (Firebase, compte) : plus long, le SDK pouvant se télécharger. */
export const DELAI_COMPTE = 60_000;
/** En arrière-plan, la séance en cours n'est pas envoyée plus d'une fois toutes les 2 min. */
export const FOND_MIN = 120_000;
/** Le verrou des passes, partagé par les onglets de l'origine. */
export const NOM_VERROU = 'terramemo-synchro';

/** Un lot lu en ligne : son id, l'heure du serveur à son écriture (ms), ses champs sans `fin`. */
export interface LotLu {
  id: string;
  fin: number;
  doc: Record<string, unknown>;
}

/** Une page de la lecture ; `suite` : de quoi lire la page d'après, null si c'était la dernière. */
export interface PageLue {
  lots: LotLu[];
  suite: unknown;
}

/** Le serveur des lots : Firestore en vrai, un faux dans les tests. */
export interface Serveur {
  /** Crée le lot ; un lot qui existe déjà est refusé (création seule : permission-denied). */
  creer(uid: string, id: string, doc: DocLot): Promise<void>;
  /** Les champs du lot en ligne, ou null s'il n'existe pas ; lève si la lecture est refusée. */
  lire(uid: string, id: string): Promise<Record<string, unknown> | null>;
  /**
   * Une page des lots du compte, par `fin` croissante : ceux dont `fin` est
   * après `depuis` (ms ; tous si null), après la page `apres` (la `suite` de
   * la page d'avant). Absent : le serveur ne sait pas lire (rien n'est lu).
   */
  lister?(uid: string, o: { depuis: number | null; apres: unknown; n: number }): Promise<PageLue>;
}

/** `fin` (Timestamp de Firestore) en ms ; 0 s'il manque. */
function finEnMs(x: unknown): number {
  const t = x as { toMillis?: () => number } | null;
  return typeof t?.toMillis === 'function' ? t.toMillis() : 0;
}

/** Les lots dans Firestore lite : `fin` est l'heure du serveur, posée à l'écriture. */
export function serveurFirestore(s: Service): Serveur {
  const { fs } = s.m;
  const ref = (uid: string, id: string) => fs.doc(s.db, 'joueurs', uid, 'lots', id);
  return {
    async creer(uid, id, doc) {
      await fs.setDoc(ref(uid, id), { ...doc, fin: fs.serverTimestamp() });
    },
    async lire(uid, id) {
      const d = await fs.getDoc(ref(uid, id));
      return d.exists() ? d.data() : null;
    },
    async lister(uid, { depuis, apres, n }) {
      const c: import('firebase/firestore/lite').QueryConstraint[] = [];
      // Index simple de `fin` (firestore.indexes.json) : ni index composite, ni lecture d'une autre clé.
      if (depuis !== null) c.push(fs.where('fin', '>', fs.Timestamp.fromMillis(Math.max(0, depuis))));
      c.push(fs.orderBy('fin'));
      // Le document de la fin de la page d'avant : les égalités de `fin` sont départagées par l'id.
      if (apres) c.push(fs.startAfter(apres));
      c.push(fs.limit(n));
      const r = await fs.getDocs(fs.query(fs.collection(s.db, 'joueurs', uid, 'lots'), ...c));
      const lots = r.docs.map((d) => {
        const { fin, ...doc } = d.data();
        return { id: d.id, fin: finEnMs(fin), doc };
      });
      return { lots, suite: r.docs.length === n ? r.docs[r.docs.length - 1] : null };
    },
  };
}

/** La marque de lecture d'un compte (§ 5.3 : instant serveur du dernier lot lu) ; dans la session en vrai. */
export interface Marques {
  lire(uid: string): Promise<number | null>;
  poser(uid: string, marque: number): Promise<void>;
}

function marquesMemoire(): Marques {
  const m = new Map<string, number>();
  return {
    async lire(uid) {
      return m.get(uid) ?? null;
    },
    async poser(uid, x) {
      m.set(uid, x);
    },
  };
}

/** Ce que l'envoi lit du journal de l'appareil (src/journal/memoire.ts). */
export interface JournalEnvoi {
  /** Tout le journal, événements de la page compris. */
  tous(): Promise<Evenement[]>;
  /** La file d'écriture du journal finie (sinon la dernière réponse partirait dans un lot de plus). */
  attendre(): Promise<void>;
  /** La séance de la page en cours, qui ne part qu'en arrière-plan. */
  seanceEnCours(): string | null;
  /**
   * Les événements lus en ligne, ajoutés au journal (Memoire.fusionner) ;
   * rejette si le journal ne les a pas gardés. Absent : rien n'est lu.
   */
  fusionner?(evts: readonly Evenement[]): Promise<void>;
}

/**
 * Le compte à qui envoyer, ou null (invité, anonyme, session perdue,
 * déconnexion ou suppression en cours). `verifiee` : l'adresse du compte est
 * vérifiée ; un lot refusé quand elle ne l'était pas se relance dès qu'elle
 * l'est (règles d'essai des lots 6 et 7, D18 a), sans attendre le jour.
 */
export type CompteEnvoi = { uid: string; serveur: Serveur; verifiee?: boolean } | null;

export interface OptionsEnvoi {
  journal: JournalEnvoi;
  /** Le compte connecté ; lève si le service ne se charge pas (hors ligne). */
  compte(): Promise<CompteEnvoi>;
  /** La version de l'appli : un lot refusé se relance à chaque nouvelle version. */
  version: string;
  /** Défaut : terramemo-synchro (IndexedDB), en mémoire sans IndexedDB. */
  lots?: DepotLots;
  /** Lots lus que cette version ne sait pas lire. Défaut : terramemo-synchro (IndexedDB). */
  aRelire?: DepotARelire;
  /** La marque de lecture de chaque compte. Défaut : en mémoire (main.ts : la session, par les comptes). */
  marques?: Marques;
  /** Défaut : deplier() de lots.ts (tests : une version plus ancienne, qui comprend moins). */
  deplier?: (doc: Record<string, unknown>) => Deplie;
  /** Défaut : synchroCoupee() (drapeaux du driver). */
  coupee?: () => boolean;
  maintenant?: () => number;
  /** Défaut : navigator.locks (Web Locks), sinon rien de plus que la file de la page. */
  verrou?: <T>(f: () => Promise<T>) => Promise<T>;
  /** Défaut : setTimeout et clearTimeout. */
  minuterie?: { poser(f: () => void, ms: number): unknown; retirer(id: unknown): void };
  /** Délais d'une requête et du chargement du compte (tests). */
  delais?: { requete: number; compte: number };
}

export interface ResultatEnvoi {
  /** fait : la passe a tourné (même arrêtée par le réseau) ; echec : le service ne s'est pas chargé. */
  etat: 'fait' | 'coupee' | 'sans_compte' | 'echec';
  /** Lots composés (nouveaux ou recomposés), acceptés, trouvés en ligne (renvoi), refusés. */
  composes: number;
  envoyes: number;
  presents: number;
  refuses: number;
  /** Ce qui a arrêté la passe avant la fin de sa file. */
  arret: 'reseau' | 'quota' | null;
  quand: number;
  /** La lecture de la passe (lot 4), ou null si elle n'a rien lu. */
  lecture: ResultatLecture | null;
}

/** Ce que la lecture d'une passe a fait (§ 5.3). */
export interface ResultatLecture {
  mode: 'incrementale' | 'complete';
  /** Lots lus en ligne, événements ajoutés au journal (nouveaux ou pas), lots gardés dans `a_relire`. */
  lots: number;
  evenements: number;
  illisibles: number;
  /** Lots de `a_relire` relus par cette version. */
  relus: number;
  /** Ce qui a arrêté la lecture : le réseau, le quota, un refus (règles), l'appareil qui n'a pas gardé l'union. */
  arret: 'reseau' | 'quota' | 'refus' | 'appareil' | null;
}

/** Ce que la vue Compte dit de la synchro (§ 3.2, « État de la synchro »). */
export interface EtatSynchro {
  coupee: boolean;
  /** Séances en attente d'envoi : pas encore dans un lot, ou dans un lot pas encore accepté. */
  attente: number;
  /** Séances dans un lot refusé par le serveur, gardées sur l'appareil. */
  refusees: number;
  /** Le dernier essai de la page a buté sur le réseau. */
  horsLigne: boolean;
  /** Réponses lues en ligne que cette version ne sait pas lire (« Mets à jour l'appli »). */
  aRelire: number;
}

/** Les comptes du journal et des lots d'un compte (vue Compte, session perdue, pilote). */
export interface ComptesSynchro {
  /** Événements du journal. */
  evenements: number;
  /** Ids du journal dans aucun lot du compte. */
  horsLots: number;
  /**
   * Séances en attente (pas encore dans un lot, lot pas encore accepté, ou
   * invalide jusqu'à la prochaine version), refusées par le serveur (cause
   * `regles`), et les deux ensemble (« reconnecte-toi pour envoyer {n} séances »).
   */
  attente: number;
  refusees: number;
  nonEnvoyees: number;
  /** Réponses du journal dans aucun lot du compte (question de la connexion, D22). */
  reponsesHorsLots: number;
  /** Fiches par état. */
  lots: Record<EtatLot, number>;
  /** Lots lus en ligne que cette version ne sait pas lire, et leurs réponses. */
  aRelire: { lots: number; reponses: number };
}

export interface RapportEnvoi {
  derniere: ResultatEnvoi | null;
  erreurs: { code: string; message: string; quand: number }[];
  horsLigne: boolean;
  /** Fin de l'attente du quota de Spark (ms), ou null. */
  quota: number | null;
  /** La dernière lecture (lot 4), et celle qui attend (séance active, échec), s'il en est. */
  lecture: ResultatLecture | null;
  lectureDue: 'incrementale' | 'complete' | null;
}

export interface Envoi {
  /** Une passe (les déclencheurs qui arrivent pendant une passe en partagent une seule, après elle). */
  declencher(d: Declencheur): Promise<ResultatEnvoi>;
  /** L'état de la synchro d'un compte, sans réseau. */
  etat(uid: string): Promise<EtatSynchro>;
  compter(uid: string): Promise<ComptesSynchro>;
  /** Après chaque passe (vue Compte). */
  surPasse(f: () => void): () => void;
  rapport(): RapportEnvoi;
  /**
   * Efface l'appareil (déconnexion, effacement : § 3.4), entre deux passes et
   * sous le verrou : `vider` (le journal) d'abord, puis l'état d'envoi et les
   * lots à relire de ces comptes. Rejette si `vider` rejette (rien d'autre
   * n'est alors effacé).
   */
  effacer(uids: readonly string[], vider: () => Promise<void>): Promise<void>;
}

/** La séance d'un événement, pour les comptes : sa séance, ou « hors séance » de son appareil. */
const cleSeance = (e: Pick<Evenement, 'seance' | 'appareil'>) => e.seance ?? `hors:${e.appareil}`;

/** Les comptes d'un compte : le journal confronté à ses fiches de lots (et ses lots à relire). */
export async function compter(journal: Pick<JournalEnvoi, 'tous'>, lots: DepotLots, uid: string, aRelire?: DepotARelire): Promise<ComptesSynchro> {
  const [evts, fiches, relire] = await Promise.all([journal.tous(), lots.tous(uid), aRelire ? aRelire.tous(uid).catch(() => []) : []]);
  const ficheDe = new Map<string, FicheLot>();
  const parEtat: Record<EtatLot, number> = { a_envoyer: 0, envoye: 0, en_ligne: 0, refuse: 0 };
  for (const f of fiches) {
    parEtat[f.etat]++;
    for (const id of f.ids) ficheDe.set(id, f);
  }
  const attente = new Set<string>();
  const refusees = new Set<string>();
  let horsLots = 0;
  let reponsesHorsLots = 0;
  for (const e of evts) {
    const f = ficheDe.get(e.id);
    if (!f) horsLots++;
    if (!f && e.type === 'reponse') reponsesHorsLots++;
    // Refusé par le serveur : cause `regles` seulement. Un lot invalide n'est jamais parti : il
    // attend une nouvelle version, comme un lot en attente (et « Réessayer » n'y peut rien).
    if (f?.etat === 'refuse' && f.cause === 'regles') refusees.add(cleSeance(e));
    else if (!f || f.etat === 'a_envoyer' || f.etat === 'refuse') attente.add(cleSeance(e));
  }
  const reponses = relire.reduce((t, f) => t + (Number.isSafeInteger(f.doc.n) ? (f.doc.n as number) : 0), 0);
  return {
    evenements: evts.length,
    horsLots,
    attente: attente.size,
    refusees: refusees.size,
    nonEnvoyees: new Set([...attente, ...refusees]).size,
    reponsesHorsLots,
    lots: parEtat,
    aRelire: { lots: relire.length, reponses },
  };
}

/**
 * L'empreinte de l'état FSRS (pilote : deux appareils au même état ont la
 * même) : FNV-1a 32 bits du JSON des fiches triées.
 */
export function empreinte(etat: ReadonlyMap<string, EtatFiche>): string {
  const texte = JSON.stringify([...etat].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** La promesse, ou un échec `deadline-exceeded` (traité comme le réseau) si elle tarde au-delà de `ms`. */
function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, ko) => {
    id = setTimeout(() => ko(Object.assign(new Error(`sans réponse après ${ms} ms`), { code: 'deadline-exceeded' })), ms);
  });
  return Promise.race([p, delai]).finally(() => clearTimeout(id));
}

function verrouParDefaut<T>(f: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks?.request ? (locks.request(NOM_VERROU, f) as Promise<T>) : f();
}

/** Les drapeaux d'une passe, fusionnés quand des déclencheurs la partagent. */
interface Drapeaux {
  /** Arrière-plan : la séance en cours part aussi. */
  fond: boolean;
  /** Changement de jeton, « Réessayer » : les lots refusés par les règles se relancent. */
  relancer: boolean;
  /** « Réessayer » : même pendant l'attente du quota (un essai de plus, demandé). */
  force: boolean;
  /** Posé dans la passe à la première création acceptée. */
  acceptee?: boolean;
  /** La minuterie seule : un lot en attente du réseau attend son heure. */
  minuterie: boolean;
  /** Lire les lots en ligne d'abord (lot 4) : depuis la marque, ou tous. */
  lecture: ModeLecture | null;
  /** Ouverture, connexion : un id en ligne absent du journal fait tout relire. */
  controle: boolean;
  /** Déconnexion : tout part, la séance en cours comprise, sans attendre ses 2 min. */
  tout: boolean;
}

type ModeLecture = 'incrementale' | 'complete';
/** La plus complète de deux lectures. */
const plusComplete = (a: ModeLecture | null, b: ModeLecture | null): ModeLecture | null => (a === 'complete' || b === 'complete' ? 'complete' : a ?? b);

export function creerEnvoi(o: OptionsEnvoi): Envoi {
  const journal = o.journal;
  const version = o.version;
  const lots = o.lots ?? depotLotsIndexedDb();
  const aRelire = o.aRelire ?? depotARelireIndexedDb();
  const marques = o.marques ?? marquesMemoire();
  const deplierLot = o.deplier ?? ((doc: Record<string, unknown>) => deplier(doc as unknown as DocLot));
  const coupee = o.coupee ?? (() => synchroCoupee());
  const maintenant = o.maintenant ?? Date.now;
  const verrou = o.verrou ?? verrouParDefaut;
  const minuterie = o.minuterie ?? { poser: (f: () => void, ms: number) => setTimeout(f, ms), retirer: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  const delais = o.delais ?? { requete: DELAI_REQUETE, compte: DELAI_COMPTE };
  const rapport: RapportEnvoi = { derniere: null, erreurs: [], horsLigne: false, quota: null, lecture: null, lectureDue: null };
  /** Une lecture qui n'a pas pu se faire (séance active, réseau, quota) : la passe suivante la fait. */
  let lectureDue: ModeLecture | null = null;
  const abonnes = new Set<() => void>();
  /** Dernier envoi en arrière-plan de chaque séance en cours. */
  const fond = new Map<string, number>();
  /** Les fiches connues de la dernière passe (minuterie, repli en mémoire). */
  let connues = new Map<string, FicheLot>();
  let reveil: unknown = null;

  const noter = (e: unknown, code = codeErreur(e)) => {
    rapport.erreurs.push({ code, message: e instanceof Error ? e.message : String(e), quand: maintenant() });
    rapport.erreurs.splice(0, Math.max(0, rapport.erreurs.length - 10));
  };

  /**
   * Fiches qu'IndexedDB n'a pas pu écrire (quota plein, erreur passagère),
   * gardées le temps de la page par-dessus celles du dépôt (§ 5.1, repli),
   * puis réécrites dès qu'une écriture passe. Une fiche du repli garde aussi
   * les ids que le dépôt sait en ligne sous le même id (un autre onglet a pu
   * y écrire le lot envoyé entre-temps) : sans quoi ils sembleraient hors de
   * tout lot, et repartiraient en double.
   */
  const repli = new Map<string, FicheLot>();
  const cleRepli = (f: Pick<FicheLot, 'uid' | 'id'>) => JSON.stringify([f.uid, f.id]);
  /** La fiche du repli, enrichie des ids que celle du dépôt sait en ligne. */
  const fusion = (x: FicheLot, d: FicheLot | undefined): FicheLot =>
    d && (d.etat === 'envoye' || d.etat === 'en_ligne') ? { ...structuredClone(x), ids: [...new Set([...x.ids, ...d.ids])] } : structuredClone(x);

  async function ecrireFiches(fs: readonly FicheLot[]): Promise<void> {
    if (!fs.length) return;
    let ecrites = false;
    try {
      await lots.ecrire(fs);
      ecrites = true;
    } catch (e) {
      noter(e);
      for (const f of fs) repli.set(cleRepli(f), structuredClone(f));
    }
    for (const f of fs) connues.set(f.id, structuredClone(f));
    if (!ecrites) return;
    for (const f of fs) repli.delete(cleRepli(f));
    // Le reste du repli, à part : son échec n'a rien à voir avec ces fiches-là, déjà écrites.
    if (repli.size) await viderRepli().catch(noter);
  }

  /** IndexedDB répond de nouveau : le repli y est réécrit (ce qui ne recule pas devant le dépôt). */
  async function viderRepli(): Promise<void> {
    for (const uid of new Set([...repli.values()].map((f) => f.uid))) {
      const depot = new Map((await lots.tous(uid)).map((f) => [f.id, f]));
      const a = [...repli.values()].filter((f) => f.uid === uid);
      await lots.ecrire(a.map((f) => fusion(f, depot.get(f.id))));
      for (const f of a) repli.delete(cleRepli(f));
    }
  }

  /** Les fiches du compte : celles du dépôt, et celles du repli par-dessus (fusion). Lève si le dépôt est illisible. */
  async function lireFiches(uid: string): Promise<FicheLot[]> {
    const m = new Map((await lots.tous(uid)).map((f) => [f.id, f]));
    for (const f of repli.values()) if (f.uid === uid) m.set(f.id, fusion(f, m.get(f.id)));
    return [...m.values()];
  }
  const vue: DepotLots = { tous: lireFiches, ecrire: ecrireFiches };

  /** La fiche d'un lot composé : à envoyer, ou refusée d'avance si les règles le refuseraient. */
  function fiche(uid: string, l: Lot): FicheLot {
    const doc = docDuLot(l);
    const p = problemeLot(l.id, doc);
    if (p) noter(new Error(`lot ${l.id} invalide : ${p}`), 'terramemo/lot-invalide');
    const ids = l.evenements.map((e) => e.id);
    return { uid, id: l.id, seance: l.seance, appareil: l.appareil, ids, etat: p ? 'refuse' : 'a_envoyer', cause: p ? 'invalide' : null, essais: 0, prochain: 0, version, doc: p ? null : doc };
  }

  /** Un lot invalide recomposé à une nouvelle version (le format ou les règles du client ont pu changer). */
  function recomposer(f: FicheLot, parId: ReadonlyMap<string, Evenement>): FicheLot {
    const evts = f.ids.map((id) => parId.get(id));
    // Journal lu en partie (dépôt illisible un instant) : rien n'est posé, la passe suivante recompose.
    if (evts.some((e) => !e)) return f;
    const tries = trier(evts as Evenement[]);
    return fiche(f.uid, { id: tries[0]!.id, appareil: f.appareil, seance: f.seance, evenements: tries });
  }

  /** L'échéance est-elle passée (ou trop lointaine : horloge reculée depuis) ? */
  const echue = (f: FicheLot, t: number) => t >= f.prochain || f.prochain > t + ECHEANCE_MAX;

  /**
   * Une échéance du quota est-elle passée, ou périmée ? Au-delà de la prochaine
   * remise vue de l'horloge actuelle, elle vient d'une horloge qui était en
   * avance (la seconde de marge : remiseQuota garde les millisecondes).
   */
  const quotaEchu = (q: number, t: number) => t >= q || q > remiseQuota(new Date(t)).getTime() + 1000;

  /**
   * Le lot vaut-il un essai dans cette passe ? `verifiee` : l'adresse du compte
   * l'est maintenant. `d.acceptee` : une création vient de passer dans cette
   * passe, les règles acceptent donc de nouveau ; les refusés suivent (sinon un
   * lot refusé attendrait un jour derrière les lots plus récents de son groupe,
   * et une recomposition après un état perdu les renverrait en double).
   */
  function aEssayer(f: FicheLot, d: Drapeaux, t: number, verifiee: boolean): boolean {
    if (f.etat === 'a_envoyer') {
      if (f.cause === 'quota') return d.force || quotaEchu(f.prochain, t);
      if (f.cause === 'reseau' && d.minuterie) return echue(f, t);
      return true;
    }
    if (f.etat === 'refuse' && f.cause === 'regles')
      return d.relancer || d.acceptee || f.version !== version || echue(f, t) || (verifiee && f.adresse_verifiee === false);
    return false;
  }

  type Arret = 'reseau' | 'quota' | null;

  /** Erreur du réseau (ou sans réponse) : nouvel essai à 30 s, 2 min, 10 min, puis 1 h. Un lot refusé garde son état. */
  async function attendreReseau(f: FicheLot, t: number): Promise<Arret> {
    rapport.horsLigne = true;
    if (f.etat === 'a_envoyer') {
      const essais = f.essais + 1;
      await ecrireFiches([{ ...f, cause: 'reseau', essais, prochain: t + DELAIS_RESEAU[Math.min(essais, DELAIS_RESEAU.length) - 1]! }]);
    }
    return 'reseau';
  }

  /** Quota de Spark (écritures ou lectures) : rien avant minuit à Los Angeles. */
  async function attendreQuota(f: FicheLot, t: number): Promise<Arret> {
    rapport.quota = remiseQuota(new Date(t)).getTime();
    if (f.etat === 'a_envoyer') await ecrireFiches([{ ...f, cause: 'quota', essais: f.essais + 1, prochain: rapport.quota }]);
    return 'quota';
  }

  /** Un lot envoyé, et ses issues (§ 5.2). Rend ce qui arrête la passe. */
  async function envoyer(c: NonNullable<CompteEnvoi>, f: FicheLot, parId: ReadonlyMap<string, Evenement>, r: ResultatEnvoi, t: number): Promise<Arret> {
    const { uid, serveur: s } = c;
    if (!f.doc) return null;
    try {
      await avecDelai(s.creer(uid, f.id, f.doc), delais.requete);
    } catch (e) {
      noter(e);
      const code = codeErreur(e);
      if (code === 'permission-denied') return relire(c, f, parId, r, t);
      if (code === 'resource-exhausted') return attendreQuota(f, t);
      if (code === 'invalid-argument') {
        await ecrireFiches([{ ...f, etat: 'refuse', cause: 'invalide', essais: 0, prochain: 0, version, doc: null }]);
        r.refuses++;
        return null;
      }
      // Réseau (unavailable, deadline-exceeded, fetch qui échoue), ou toute autre erreur : plus tard.
      return attendreReseau(f, t);
    }
    // Le serveur a accepté une écriture : ni le réseau ni le quota ne bloquent plus.
    rapport.horsLigne = false;
    rapport.quota = null;
    await ecrireFiches([{ ...f, etat: 'envoye', cause: null, essais: 0, prochain: 0, version, doc: null }]);
    r.envoyes++;
    return null;
  }

  /**
   * Après un refus des règles, le lot relu : présent (un renvoi d'un lot déjà
   * accepté), ses ids sont envoyés, et ceux de la fiche qui n'y sont pas
   * forment un nouveau lot ; absent, ou lecture refusée (qui ne vaut jamais
   * « absent ») : refusé par les règles. Les ids trouvés en ligne sortent
   * aussi des autres lots en attente (état de la synchro perdu, puis lots
   * recomposés autrement qu'en ligne) : sans quoi ils partiraient en double.
   * Les lots recomposés partent dans la même passe (file de passe()).
   */
  async function relire(c: NonNullable<CompteEnvoi>, f: FicheLot, parId: ReadonlyMap<string, Evenement>, r: ResultatEnvoi, t: number): Promise<Arret> {
    const { uid, serveur: s } = c;
    const refuser = async (): Promise<Arret> => {
      const adresse = c.verifiee === undefined ? {} : { adresse_verifiee: c.verifiee };
      await ecrireFiches([{ ...f, etat: 'refuse', cause: 'regles', essais: 0, prochain: t + RELANCE_REGLES, version, ...adresse }]);
      r.refuses++;
      return null;
    };
    let lu: Record<string, unknown> | null;
    try {
      lu = await avecDelai(s.lire(uid, f.id), delais.requete);
    } catch (e) {
      noter(e);
      const code = codeErreur(e);
      if (code === 'permission-denied') return refuser();
      if (code === 'resource-exhausted') return attendreQuota(f, t);
      return attendreReseau(f, t);
    }
    if (!lu) return refuser();
    let ids: string[];
    try {
      ids = idsDuLot(lu);
      // Un lot écrit par cette appli commence par l'événement qui lui donne son id.
      if (!ids.includes(f.id)) throw new Error(`lot ${f.id} en ligne sans sa première carte`);
    } catch (e) {
      // Un lot à cet id, que cette version ne sait pas lire : relancé à la prochaine version.
      noter(e, 'terramemo/lot-illisible');
      return refuser();
    }
    r.presents++;
    const enLigne = new Set(ids);
    // Ce qui est déjà en ligne : ce lot, et les lots que l'appareil sait envoyés.
    const envoyes = new Set(ids);
    for (const g of connues.values()) if (g.id !== f.id && (g.etat === 'envoye' || g.etat === 'en_ligne')) for (const id of g.ids) envoyes.add(id);
    /** Le reste d'une fiche (ses ids pas encore en ligne), recomposé à part : sous son id, s'il en est. */
    const reste = (x: FicheLot) => composer(x.ids.filter((id) => !envoyes.has(id)).flatMap((id) => parId.get(id) ?? [])).map((l) => fiche(uid, l));
    const maj: FicheLot[] = [{ ...f, ids, etat: 'envoye', cause: null, essais: 0, prochain: 0, version, doc: null }];
    const suite = reste(f);
    for (const g of connues.values()) {
      if (g.id === f.id || (g.etat !== 'a_envoyer' && g.etat !== 'refuse')) continue;
      if (!g.ids.some((id) => enLigne.has(id))) continue;
      const r2 = reste(g);
      // Sa fiche ne doit plus envoyer son document d'origine : remplacée par son reste (même id),
      // ou envoyée pour sa partie déjà en ligne.
      if (!r2.some((x) => x.id === g.id)) maj.push({ ...g, ids: g.ids.filter((id) => envoyes.has(id)), etat: 'envoye', cause: null, essais: 0, prochain: 0, version, doc: null });
      suite.push(...r2);
    }
    await ecrireFiches([...maj, ...suite]);
    r.composes += suite.length;
    return null;
  }

  // --- Lecture (lot 4, § 5.3) ---

  /** La fiche d'un lot lu en ligne : ses ids sont dans le compte. */
  const ficheEnLigne = (uid: string, id: string, evts: readonly Evenement[]): FicheLot => ({
    uid,
    id,
    seance: evts[0]?.seance ?? null,
    appareil: evts[0]?.appareil ?? '',
    ids: evts.map((e) => e.id),
    etat: 'en_ligne',
    cause: null,
    essais: 0,
    prochain: 0,
    version,
    doc: null,
  });

  /** Les champs d'un lot, gardés bruts (ce qui ne passe pas en JSON n'y entre pas). */
  function brut(doc: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /**
   * Une page lue : ses événements au journal, puis (l'union faite) ses fiches
   * `en_ligne` et ses lots illisibles dans `a_relire`, enfin la marque. Lève
   * si l'appareil ne garde pas l'union : la marque n'avance pas, la page sera
   * relue (les ids déjà gardés sont ignorés).
   */
  async function integrer(uid: string, lus: readonly LotLu[], marque: number | null, lu: ResultatLecture): Promise<number | null> {
    if (!lus.length) return marque;
    const evts: Evenement[] = [];
    const enLigne: FicheLot[] = [];
    const illisibles: FicheARelire[] = [];
    let fin = marque ?? -Infinity;
    for (const l of lus) {
      fin = Math.max(fin, l.fin);
      const d = deplierLot(l.doc);
      if (!d.ok) {
        illisibles.push({ uid, id: l.id, fin: l.fin, doc: brut(l.doc), version, probleme: d.probleme });
        continue;
      }
      evts.push(...d.evenements);
      enLigne.push(ficheEnLigne(uid, l.id, d.evenements));
    }
    await journal.fusionner!(evts);
    await ecrireFiches(enLigne);
    await aRelire.ecrire(illisibles);
    if (Number.isFinite(fin)) await marques.poser(uid, fin);
    lu.lots += lus.length;
    lu.evenements += evts.length;
    lu.illisibles += illisibles.length;
    return Number.isFinite(fin) ? fin : marque;
  }

  /** Les lots du compte, page par page : depuis la marque moins 5 min, ou tous. */
  async function lire(c: NonNullable<CompteEnvoi>, mode: ModeLecture, lu: ResultatLecture): Promise<void> {
    const { uid, serveur: s } = c;
    let marque = mode === 'complete' ? null : await marques.lire(uid).catch(() => null);
    lu.mode = marque === null ? 'complete' : 'incrementale';
    const depuis = marque === null ? null : marque - BORD_FIN;
    let apres: unknown = null;
    for (;;) {
      let page: PageLue;
      try {
        page = await avecDelai(s.lister!(uid, { depuis, apres, n: PAGE_LECTURE }), delais.requete);
      } catch (e) {
        noter(e);
        const code = codeErreur(e);
        if (code === 'permission-denied') lu.arret = 'refus';
        else if (code === 'resource-exhausted') {
          rapport.quota = remiseQuota(new Date(maintenant())).getTime();
          lu.arret = 'quota';
        } else {
          rapport.horsLigne = true;
          lu.arret = 'reseau';
        }
        return;
      }
      try {
        marque = await integrer(uid, page.lots, marque, lu);
      } catch (e) {
        noter(e);
        lu.arret = 'appareil';
        return;
      }
      if (!page.suite || !page.lots.length) return;
      apres = page.suite;
    }
  }

  /** Les lots de `a_relire` qu'une version d'avant n'a pas su lire : relus sans réseau. */
  async function relireARelire(uid: string, lu: ResultatLecture): Promise<void> {
    let fiches: FicheARelire[];
    try {
      fiches = (await aRelire.tous(uid)).filter((f) => f.version !== version);
    } catch (e) {
      noter(e);
      return;
    }
    if (!fiches.length) return;
    const evts: Evenement[] = [];
    const enLigne: FicheLot[] = [];
    const relus: string[] = [];
    const encore: FicheARelire[] = [];
    for (const f of fiches) {
      const d = deplierLot(f.doc);
      if (!d.ok) {
        encore.push({ ...f, version, probleme: d.probleme });
        continue;
      }
      evts.push(...d.evenements);
      enLigne.push(ficheEnLigne(uid, f.id, d.evenements));
      relus.push(f.id);
    }
    try {
      await journal.fusionner!(evts);
      await ecrireFiches(enLigne);
      await aRelire.retirer(uid, relus);
      await aRelire.ecrire(encore);
      lu.relus += relus.length;
    } catch (e) {
      noter(e);
    }
  }

  /** Un id que l'appareil sait en ligne manque-t-il au journal (base vidée, dépôt en mémoire à une page d'avant) ? */
  async function manqueAuJournal(uid: string): Promise<boolean> {
    const ids = new Set((await journal.tous()).map((e) => e.id));
    for (const f of await lireFiches(uid)) if ((f.etat === 'envoye' || f.etat === 'en_ligne') && f.ids.some((id) => !ids.has(id))) return true;
    return false;
  }

  /** La lecture d'une passe : `a_relire`, puis les lots en ligne si la passe (ou une d'avant) le demande. */
  async function lecture(c: NonNullable<CompteEnvoi>, d: Drapeaux, r: ResultatEnvoi, t: number): Promise<void> {
    const lu: ResultatLecture = { mode: 'incrementale', lots: 0, evenements: 0, illisibles: 0, relus: 0, arret: null };
    await relireARelire(c.uid, lu);
    let mode = plusComplete(d.lecture, lectureDue);
    if (mode && c.serveur.lister) {
      // Pendant l'attente du quota (sauf « Réessayer »), ou pendant une séance active : à la passe suivante.
      if ((rapport.quota !== null && rapport.quota > t && !d.force) || (mode === 'incrementale' && journal.seanceEnCours())) lectureDue = mode;
      else {
        if (mode === 'incrementale' && d.controle && (await manqueAuJournal(c.uid))) mode = 'complete';
        lectureDue = null;
        await lire(c, mode, lu);
        // Un refus des règles n'est pas relu à chaque passe : à la prochaine ouverture ou connexion.
        if (lu.arret && lu.arret !== 'refus') lectureDue = mode;
      }
    }
    rapport.lectureDue = lectureDue;
    if (lu.lots || lu.relus || lu.arret) {
      r.lecture = lu;
      rapport.lecture = { ...lu };
    }
  }

  /**
   * Les lots en attente dont des ids sont déjà en ligne (lus, ou envoyés par un
   * autre lot) : leur reste seulement est recomposé (sous leur id s'il en est),
   * sans quoi ces ids partiraient en double. Rend les fiches à écrire.
   */
  function sansDoublons(uid: string, parId: ReadonlyMap<string, Evenement>): FicheLot[] {
    const envoyes = new Set<string>();
    for (const g of connues.values()) if (g.etat === 'envoye' || g.etat === 'en_ligne') for (const id of g.ids) envoyes.add(id);
    const maj: FicheLot[] = [];
    for (const g of connues.values()) {
      if ((g.etat !== 'a_envoyer' && g.etat !== 'refuse') || !g.ids.some((id) => envoyes.has(id))) continue;
      const reste = composer(g.ids.filter((id) => !envoyes.has(id)).flatMap((id) => parId.get(id) ?? [])).map((l) => fiche(uid, l));
      if (!reste.some((x) => x.id === g.id)) maj.push({ ...g, ids: g.ids.filter((id) => envoyes.has(id)), etat: 'envoye', cause: null, essais: 0, prochain: 0, version, doc: null });
      maj.push(...reste);
    }
    return maj;
  }

  /**
   * La minuterie du prochain essai après une erreur de réseau. Rien pendant
   * l'attente du quota (le premier déclencheur après sa remise relance), et
   * jamais moins d'une seconde : une passe qui n'essaie rien ne repart pas
   * aussitôt.
   */
  function planifier(): void {
    if (reveil !== null) minuterie.retirer(reveil);
    reveil = null;
    const t = maintenant();
    if (rapport.quota !== null && rapport.quota > t) return;
    let quand = Infinity;
    for (const f of connues.values()) if (f.etat === 'a_envoyer' && f.cause === 'reseau') quand = Math.min(quand, echue(f, t) ? t : f.prochain);
    if (quand === Infinity) return;
    // Une échéance déjà passée (passe en échec) : le premier délai, pas une boucle.
    reveil = minuterie.poser(() => {
      reveil = null;
      void declencher('minuterie');
    }, quand > t ? quand - t : DELAIS_RESEAU[0]!);
  }

  async function passe(d: Drapeaux): Promise<ResultatEnvoi> {
    const t = maintenant();
    const r: ResultatEnvoi = { etat: 'fait', composes: 0, envoyes: 0, presents: 0, refuses: 0, arret: null, quand: t, lecture: null };
    const fini = (etat: ResultatEnvoi['etat']) => {
      r.etat = etat;
      rapport.derniere = { ...r };
      return r;
    };
    if (coupee()) return fini('coupee');
    let c: CompteEnvoi;
    try {
      c = await avecDelai(o.compte(), delais.compte);
    } catch (e) {
      // Le service ne se charge pas (site hors ligne, sans service worker : § 5.5).
      noter(e);
      rapport.horsLigne = true;
      r.arret = 'reseau';
      planifier();
      return fini('echec');
    }
    if (!c) return fini('sans_compte');
    const { uid } = c;
    const verifiee = c.verifiee ?? false;
    await journal.attendre();
    // Ce qui est en ligne d'abord (lot 4) : un événement lu n'est jamais recomposé.
    if (journal.fusionner) await lecture(c, d, r, t);
    const evts = await journal.tous();
    const parId = new Map(evts.map((e) => [e.id, e]));
    // Une lecture ratée ne vaut pas « aucune fiche » (tout le journal repartirait) : la passe s'arrête,
    // la suivante relira. Sans IndexedDB du tout, le dépôt est en mémoire depuis le début.
    let fiches = await lireFiches(uid);
    connues = new Map(fiches.map((f) => [f.id, f]));
    const propres = sansDoublons(uid, parId);
    if (propres.length) {
      await ecrireFiches(propres);
      fiches = [...connues.values()];
    }
    const dansUnLot = new Set(fiches.flatMap((f) => f.ids));

    // La séance en cours de la page : en arrière-plan seulement, et pas plus d'une fois toutes les 2 min
    // (à la déconnexion, toujours).
    const enCours = journal.seanceEnCours();
    let gardee = enCours;
    if (enCours && d.tout) gardee = null;
    else if (enCours && d.fond && t - (fond.get(enCours) ?? -Infinity) >= FOND_MIN) {
      gardee = null;
      fond.set(enCours, t);
    }
    const nouvelles = composer(evts.filter((e) => !dansUnLot.has(e.id) && (gardee === null || e.seance !== gardee))).map((l) => fiche(uid, l));
    const recomposees = fiches
      .filter((f) => f.etat === 'refuse' && f.cause === 'invalide' && f.version !== version)
      .map((f) => recomposer(f, parId))
      .filter((f) => f.version === version);
    // La composition est écrite avant l'envoi : un renvoi envoie le même document.
    await ecrireFiches([...nouvelles, ...recomposees]);
    r.composes = nouvelles.length + recomposees.filter((f) => f.etat === 'a_envoyer').length;

    // Le quota du jour atteint (vu dans cette page, ou gardé par une fiche) : rien avant sa remise,
    // sauf « Réessayer ». Une échéance périmée (horloge qui était en avance) ne compte pas.
    const echeances = [rapport.quota ?? 0, ...[...connues.values()].filter((f) => f.etat === 'a_envoyer' && f.cause === 'quota').map((f) => f.prochain)];
    const quota = Math.max(0, ...echeances.filter((q) => !quotaEchu(q, t)));
    rapport.quota = quota > t ? quota : null;
    if (rapport.quota !== null && !d.force) r.arret = 'quota';
    else {
      // Une file relue à chaque tour : un lot recomposé pendant la passe (relire) y entre, aucun
      // n'est essayé deux fois. Les lots en attente du réseau d'abord : la minuterie n'essaie rien si
      // aucun n'est à son heure, et les autres ne partent qu'après un succès (le premier échec du
      // réseau arrête la passe). Puis les lots jamais essayés, enfin les refusés, les plus anciens
      // relancés d'abord. Une relance refusée sert de sonde : les autres refusés attendent la
      // prochaine relance, dans leur ordre, et la sonde passe derrière eux (chaque relance sonde
      // un autre lot : aucun ne bloque les autres pour toujours).
      const tentes = new Set<string>();
      const rang = (f: FicheLot) => (f.cause === 'reseau' ? 0 : f.etat === 'a_envoyer' ? 1 : 2);
      // Les lots jamais essayés dans l'ordre de leur premier événement (celui de composer()) : après un
      // état perdu, la suite d'un lot relu (ses événements les plus anciens) part avant un lot qui
      // commence plus loin et que la relecture aurait couvert.
      const ts = (f: FicheLot) => parId.get(f.id)?.ts ?? 0;
      const avant = (f: FicheLot, m: FicheLot) => {
        if (rang(f) !== rang(m)) return rang(f) < rang(m);
        if (rang(f) === 1 ? ts(f) !== ts(m) : f.prochain !== m.prochain) return rang(f) === 1 ? ts(f) < ts(m) : f.prochain < m.prochain;
        return f.id < m.id;
      };
      const prochainLot = (): FicheLot | null => {
        let meilleur: FicheLot | null = null;
        for (const f of connues.values()) if (!tentes.has(f.id) && aEssayer(f, d, t, verifiee) && (!meilleur || avant(f, meilleur))) meilleur = f;
        return meilleur;
      };
      const reportes: FicheLot[] = [];
      let sonde: string | null = null;
      d.acceptee = false;
      let f = d.minuterie && prochainLot()?.cause !== 'reseau' ? null : prochainLot();
      for (; f; f = prochainLot()) {
        tentes.add(f.id);
        if (sonde && f.etat === 'refuse') {
          reportes.push(f);
          continue;
        }
        // Les règles refusent : un lot jamais essayé attend aussi la passe suivante (une sonde par passe).
        if (sonde && f.etat === 'a_envoyer' && f.cause === null) continue;
        const avant = r.envoyes;
        const a = await envoyer(c, f, parId, r, t);
        if (r.envoyes > avant) d.acceptee = true;
        const apres = connues.get(f.id);
        if (apres?.etat === 'refuse' && apres.cause === 'regles') sonde = f.id;
        if (a) {
          r.arret = a;
          break;
        }
      }
      const rangs = reportes.map((x, i) => ({ ...x, version, prochain: t + RELANCE_REGLES + i }));
      const s = sonde ? connues.get(sonde) : undefined;
      if (s && reportes.length) rangs.push({ ...s, prochain: t + RELANCE_REGLES + reportes.length });
      await ecrireFiches(rangs);
    }
    planifier();
    return fini('fait');
  }

  let file: Promise<unknown> = Promise.resolve();
  let prochaine: { p: Promise<ResultatEnvoi>; d: Drapeaux } | null = null;

  function declencher(quoi: Declencheur): Promise<ResultatEnvoi> {
    const d: Drapeaux = {
      fond: quoi === 'fond' || quoi === 'deconnexion',
      relancer: quoi === 'jeton' || quoi === 'reessayer' || quoi === 'connexion' || quoi === 'deconnexion',
      force: quoi === 'reessayer' || quoi === 'deconnexion',
      minuterie: quoi === 'minuterie',
      // Connexion : depuis la marque, qui est vide pour un compte que l'appareil n'a pas encore lu (tout est lu).
      lecture: quoi === 'ouverture' || quoi === 'premier_plan' || quoi === 'connexion' ? 'incrementale' : null,
      controle: quoi === 'ouverture' || quoi === 'connexion',
      tout: quoi === 'deconnexion',
    };
    if (prochaine) {
      prochaine.d.fond ||= d.fond;
      prochaine.d.relancer ||= d.relancer;
      prochaine.d.force ||= d.force;
      prochaine.d.minuterie &&= d.minuterie;
      prochaine.d.lecture = plusComplete(prochaine.d.lecture, d.lecture);
      prochaine.d.controle ||= d.controle;
      prochaine.d.tout ||= d.tout;
      return prochaine.p;
    }
    const suivante = { d, p: Promise.resolve(null as unknown as ResultatEnvoi) };
    suivante.p = file
      .then(() => {
        prochaine = null;
        return verrou(() => passe(suivante.d));
      })
      .catch((e: unknown) => {
        // Journal ou dépôt illisibles : rien n'est perdu, la passe suivante recommence.
        noter(e);
        planifier();
        const r: ResultatEnvoi = { etat: 'echec', composes: 0, envoyes: 0, presents: 0, refuses: 0, arret: null, quand: maintenant(), lecture: null };
        rapport.derniere = r;
        return r;
      })
      .finally(() => abonnes.forEach((f) => f()));
    prochaine = suivante;
    file = suivante.p.catch(() => undefined);
    return suivante.p;
  }

  function effacer(uids: readonly string[], vider: () => Promise<void>): Promise<void> {
    const p = file.then(() =>
      verrou(async () => {
        await vider();
        for (const uid of uids) {
          await lots.effacer?.(uid);
          await aRelire.retirer(uid);
          for (const [k, f] of repli) if (f.uid === uid) repli.delete(k);
        }
        connues = new Map([...connues].filter(([, f]) => !uids.includes(f.uid)));
        fond.clear();
        lectureDue = null;
        rapport.lectureDue = null;
        planifier();
      }),
    );
    file = p.catch(() => undefined);
    return p;
  }

  return {
    declencher,
    effacer,
    compter: (uid) => compter(journal, vue, uid, aRelire),
    async etat(uid) {
      const c = await compter(journal, vue, uid, aRelire);
      return { coupee: coupee(), attente: c.attente, refusees: c.refusees, horsLigne: rapport.horsLigne, aRelire: c.aRelire.reponses };
    },
    surPasse(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    rapport: () => structuredClone(rapport),
  };
}
