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
// Pas de Firebase importé ici : le serveur (serveurFirestore) vient du
// service déjà chargé par les comptes.
import type { Evenement } from '../srs/journal';
import type { EtatFiche } from '../srs/rejeu';
import { depotLotsIndexedDb, depotLotsMemoire, type DepotLots, type EtatLot, type FicheLot } from './depot-lots';
import { synchroCoupee } from './drapeaux';
import { codeErreur, remiseQuota } from './erreurs';
import type { Service } from './firebase';
import { composer, docDuLot, idsDuLot, problemeLot, trier, type DocLot, type Lot } from './lots';

/** Ce qui lance une passe d'envoi. */
export type Declencheur = 'ouverture' | 'cloture' | 'fond' | 'premier_plan' | 'reseau' | 'jeton' | 'reessayer' | 'minuterie';

/** Délais des nouveaux essais après une erreur de réseau (§ 5.2) : 30 s, 2 min, 10 min, puis 1 h. */
export const DELAIS_RESEAU: readonly number[] = [30_000, 120_000, 600_000, 3_600_000];
/** Un lot refusé par les règles se relance de lui-même au plus une fois par jour. */
export const RELANCE_REGLES = 86_400_000;
/** En arrière-plan, la séance en cours n'est pas envoyée plus d'une fois toutes les 2 min. */
export const FOND_MIN = 120_000;
/** Le verrou des passes, partagé par les onglets de l'origine. */
export const NOM_VERROU = 'terramemo-synchro';

/** Le serveur des lots : Firestore en vrai, un faux dans les tests. */
export interface Serveur {
  /** Crée le lot ; un lot qui existe déjà est refusé (création seule : permission-denied). */
  creer(uid: string, id: string, doc: DocLot): Promise<void>;
  /** Les champs du lot en ligne, ou null s'il n'existe pas ; lève si la lecture est refusée. */
  lire(uid: string, id: string): Promise<Record<string, unknown> | null>;
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
}

/** Le compte à qui envoyer, ou null (invité, anonyme, session perdue, déconnexion ou suppression en cours). */
export type CompteEnvoi = { uid: string; serveur: Serveur } | null;

export interface OptionsEnvoi {
  journal: JournalEnvoi;
  /** Le compte connecté ; lève si le service ne se charge pas (hors ligne). */
  compte(): Promise<CompteEnvoi>;
  /** La version de l'appli : un lot refusé se relance à chaque nouvelle version. */
  version: string;
  /** Défaut : terramemo-synchro (IndexedDB), en mémoire sans IndexedDB. */
  lots?: DepotLots;
  /** Défaut : synchroCoupee() (drapeaux du driver). */
  coupee?: () => boolean;
  maintenant?: () => number;
  /** Défaut : navigator.locks (Web Locks), sinon rien de plus que la file de la page. */
  verrou?: <T>(f: () => Promise<T>) => Promise<T>;
  /** Défaut : setTimeout et clearTimeout. */
  minuterie?: { poser(f: () => void, ms: number): unknown; retirer(id: unknown): void };
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
}

/** Les comptes du journal et des lots d'un compte (vue Compte, session perdue, pilote). */
export interface ComptesSynchro {
  /** Événements du journal. */
  evenements: number;
  /** Ids du journal dans aucun lot du compte. */
  horsLots: number;
  /** Séances en attente, refusées, et les deux ensemble (« reconnecte-toi pour envoyer {n} séances »). */
  attente: number;
  refusees: number;
  nonEnvoyees: number;
  /** Fiches par état. */
  lots: Record<EtatLot, number>;
}

export interface RapportEnvoi {
  derniere: ResultatEnvoi | null;
  erreurs: { code: string; message: string; quand: number }[];
  horsLigne: boolean;
  /** Fin de l'attente du quota de Spark (ms), ou null. */
  quota: number | null;
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
}

/** La séance d'un événement, pour les comptes : sa séance, ou « hors séance » de son appareil. */
const cleSeance = (e: Pick<Evenement, 'seance' | 'appareil'>) => e.seance ?? `hors:${e.appareil}`;

/** Les comptes d'un compte : le journal confronté à ses fiches de lots. */
export async function compter(journal: Pick<JournalEnvoi, 'tous'>, lots: DepotLots, uid: string): Promise<ComptesSynchro> {
  const [evts, fiches] = await Promise.all([journal.tous(), lots.tous(uid)]);
  const etatDe = new Map<string, EtatLot>();
  const parEtat: Record<EtatLot, number> = { a_envoyer: 0, envoye: 0, en_ligne: 0, refuse: 0 };
  for (const f of fiches) {
    parEtat[f.etat]++;
    for (const id of f.ids) etatDe.set(id, f.etat);
  }
  const attente = new Set<string>();
  const refusees = new Set<string>();
  let horsLots = 0;
  for (const e of evts) {
    const etat = etatDe.get(e.id);
    if (!etat) horsLots++;
    if (!etat || etat === 'a_envoyer') attente.add(cleSeance(e));
    else if (etat === 'refuse') refusees.add(cleSeance(e));
  }
  return { evenements: evts.length, horsLots, attente: attente.size, refusees: refusees.size, nonEnvoyees: new Set([...attente, ...refusees]).size, lots: parEtat };
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
  /** La minuterie seule : un lot en attente du réseau attend son heure. */
  minuterie: boolean;
}

export function creerEnvoi(o: OptionsEnvoi): Envoi {
  const journal = o.journal;
  const version = o.version;
  let lots = o.lots ?? depotLotsIndexedDb();
  const coupee = o.coupee ?? (() => synchroCoupee());
  const maintenant = o.maintenant ?? Date.now;
  const verrou = o.verrou ?? verrouParDefaut;
  const minuterie = o.minuterie ?? { poser: (f: () => void, ms: number) => setTimeout(f, ms), retirer: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  const rapport: RapportEnvoi = { derniere: null, erreurs: [], horsLigne: false, quota: null };
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

  /** Écrit des fiches ; IndexedDB qui refuse (quota plein) : le dépôt passe en mémoire pour la page (§ 5.1). */
  async function ecrireFiches(fs: readonly FicheLot[]): Promise<void> {
    if (!fs.length) return;
    try {
      await lots.ecrire(fs);
    } catch (e) {
      noter(e);
      lots = depotLotsMemoire([...connues.values()]);
      await lots.ecrire(fs);
    }
    for (const f of fs) connues.set(f.id, structuredClone(f));
  }

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
    if (evts.some((e) => !e)) return { ...f, version };
    const tries = trier(evts as Evenement[]);
    return fiche(f.uid, { id: tries[0]!.id, appareil: f.appareil, seance: f.seance, evenements: tries });
  }

  /** Le lot vaut-il un essai dans cette passe ? */
  function aEssayer(f: FicheLot, d: Drapeaux, t: number): boolean {
    if (f.etat === 'a_envoyer') return f.cause === 'quota' || (f.cause === 'reseau' && d.minuterie) ? t >= f.prochain : true;
    if (f.etat === 'refuse' && f.cause === 'regles') return d.relancer || f.version !== version || t >= f.prochain;
    return false;
  }

  type Arret = 'reseau' | 'quota' | null;

  /** Un lot envoyé, et ses issues (§ 5.2). Rend ce qui arrête la passe. */
  async function envoyer(uid: string, s: Serveur, f: FicheLot, parId: ReadonlyMap<string, Evenement>, r: ResultatEnvoi, t: number): Promise<Arret> {
    if (!f.doc) return null;
    try {
      await s.creer(uid, f.id, f.doc);
    } catch (e) {
      noter(e);
      const code = codeErreur(e);
      if (code === 'permission-denied') return relire(uid, s, f, parId, r, t);
      if (code === 'resource-exhausted') {
        rapport.quota = remiseQuota(new Date(t)).getTime();
        if (f.etat === 'a_envoyer') await ecrireFiches([{ ...f, cause: 'quota', essais: f.essais + 1, prochain: rapport.quota }]);
        return 'quota';
      }
      if (code === 'invalid-argument') {
        await ecrireFiches([{ ...f, etat: 'refuse', cause: 'invalide', essais: 0, prochain: 0, version, doc: null }]);
        r.refuses++;
        return null;
      }
      // Réseau (unavailable, deadline-exceeded, fetch qui échoue), ou toute autre erreur : plus tard.
      rapport.horsLigne = true;
      if (f.etat === 'a_envoyer') {
        const essais = f.essais + 1;
        await ecrireFiches([{ ...f, cause: 'reseau', essais, prochain: t + DELAIS_RESEAU[Math.min(essais, DELAIS_RESEAU.length) - 1]! }]);
      }
      return 'reseau';
    }
    rapport.horsLigne = false;
    await ecrireFiches([{ ...f, etat: 'envoye', cause: null, essais: 0, prochain: 0, version, doc: null }]);
    r.envoyes++;
    return null;
  }

  /**
   * Après un refus des règles, le lot relu : présent (un renvoi d'un lot déjà
   * accepté), ses ids sont envoyés, et ceux de la fiche qui n'y sont pas
   * forment un nouveau lot ; absent, ou lecture refusée (qui ne vaut jamais
   * « absent ») : refusé par les règles.
   */
  async function relire(uid: string, s: Serveur, f: FicheLot, parId: ReadonlyMap<string, Evenement>, r: ResultatEnvoi, t: number): Promise<Arret> {
    const refuser = async (): Promise<Arret> => {
      await ecrireFiches([{ ...f, etat: 'refuse', cause: 'regles', essais: 0, prochain: t + RELANCE_REGLES, version }]);
      r.refuses++;
      return null;
    };
    let lu: Record<string, unknown> | null;
    try {
      lu = await s.lire(uid, f.id);
    } catch (e) {
      noter(e);
      if (codeErreur(e) === 'permission-denied') return refuser();
      rapport.horsLigne = true;
      return 'reseau';
    }
    if (!lu) return refuser();
    let ids: string[];
    try {
      ids = idsDuLot(lu);
    } catch (e) {
      // Un lot à cet id, que cette version ne sait pas lire : relancé à la prochaine version.
      noter(e, 'terramemo/lot-illisible');
      return refuser();
    }
    r.presents++;
    const enLigne = new Set(ids);
    const restants = f.ids.filter((id) => !enLigne.has(id)).flatMap((id) => parId.get(id) ?? []);
    const suite = composer(restants).map((l) => fiche(uid, l));
    await ecrireFiches([{ ...f, ids, etat: 'envoye', cause: null, essais: 0, prochain: 0, version, doc: null }, ...suite]);
    r.composes += suite.length;
    for (const n of suite) {
      if (n.etat !== 'a_envoyer') continue;
      const a = await envoyer(uid, s, n, parId, r, t);
      if (a) return a;
    }
    return null;
  }

  /** La minuterie du prochain essai après une erreur de réseau. */
  function planifier(): void {
    if (reveil !== null) minuterie.retirer(reveil);
    reveil = null;
    let quand = Infinity;
    for (const f of connues.values()) if (f.etat === 'a_envoyer' && f.cause === 'reseau') quand = Math.min(quand, f.prochain);
    if (quand === Infinity) return;
    reveil = minuterie.poser(() => {
      reveil = null;
      void declencher('minuterie');
    }, Math.max(0, quand - maintenant()));
  }

  async function passe(d: Drapeaux): Promise<ResultatEnvoi> {
    const t = maintenant();
    const r: ResultatEnvoi = { etat: 'fait', composes: 0, envoyes: 0, presents: 0, refuses: 0, arret: null, quand: t };
    const fini = (etat: ResultatEnvoi['etat']) => {
      r.etat = etat;
      rapport.derniere = { ...r };
      return r;
    };
    if (coupee()) return fini('coupee');
    let c: CompteEnvoi;
    try {
      c = await o.compte();
    } catch (e) {
      // Le service ne se charge pas (site hors ligne, sans service worker : § 5.5).
      noter(e);
      rapport.horsLigne = true;
      r.arret = 'reseau';
      return fini('echec');
    }
    if (!c) return fini('sans_compte');
    const { uid, serveur } = c;
    await journal.attendre();
    const evts = await journal.tous();
    const parId = new Map(evts.map((e) => [e.id, e]));
    let fiches: FicheLot[];
    try {
      fiches = await lots.tous(uid);
    } catch (e) {
      noter(e);
      lots = depotLotsMemoire();
      fiches = [];
    }
    connues = new Map(fiches.map((f) => [f.id, f]));
    const dansUnLot = new Set(fiches.flatMap((f) => f.ids));

    // La séance en cours de la page : en arrière-plan seulement, et pas plus d'une fois toutes les 2 min.
    const enCours = journal.seanceEnCours();
    let gardee = enCours;
    if (enCours && d.fond && t - (fond.get(enCours) ?? -Infinity) >= FOND_MIN) {
      gardee = null;
      fond.set(enCours, t);
    }
    const nouvelles = composer(evts.filter((e) => !dansUnLot.has(e.id) && (gardee === null || e.seance !== gardee))).map((l) => fiche(uid, l));
    const recomposees = fiches.filter((f) => f.etat === 'refuse' && f.cause === 'invalide' && f.version !== version).map((f) => recomposer(f, parId));
    // La composition est écrite avant l'envoi : un renvoi envoie le même document.
    await ecrireFiches([...nouvelles, ...recomposees]);
    r.composes = nouvelles.length + recomposees.filter((f) => f.etat === 'a_envoyer').length;

    // Le quota du jour atteint (vu dans cette page, ou gardé par une fiche) : rien avant sa remise.
    const quota = Math.max(rapport.quota ?? 0, ...[...connues.values()].filter((f) => f.etat === 'a_envoyer' && f.cause === 'quota').map((f) => f.prochain));
    if (quota > t) {
      rapport.quota = quota;
      r.arret = 'quota';
    } else {
      rapport.quota = null;
      // Les lots en attente du réseau d'abord : la minuterie n'essaie rien si aucun n'est à son
      // heure, et les autres ne partent qu'après un succès (le premier échec arrête la passe).
      const essayer = [...connues.values()].filter((f) => aEssayer(f, d, t));
      const dus = essayer.filter((f) => f.cause === 'reseau').sort((a, b) => a.prochain - b.prochain);
      const autres = essayer.filter((f) => f.cause !== 'reseau').sort((a, b) => (a.id < b.id ? -1 : 1));
      const file = d.minuterie && !dus.length ? [] : [...dus, ...autres];
      for (const f of file) {
        // Une fiche mise à jour par un lot relu plus tôt dans la passe : sa dernière version.
        const actuelle = connues.get(f.id) ?? f;
        if (!aEssayer(actuelle, d, t)) continue;
        const a = await envoyer(uid, serveur, actuelle, parId, r, t);
        if (a) {
          r.arret = a;
          break;
        }
      }
    }
    planifier();
    return fini('fait');
  }

  let file: Promise<unknown> = Promise.resolve();
  let prochaine: { p: Promise<ResultatEnvoi>; d: Drapeaux } | null = null;

  function declencher(quoi: Declencheur): Promise<ResultatEnvoi> {
    const d: Drapeaux = { fond: quoi === 'fond', relancer: quoi === 'jeton' || quoi === 'reessayer', minuterie: quoi === 'minuterie' };
    if (prochaine) {
      prochaine.d.fond ||= d.fond;
      prochaine.d.relancer ||= d.relancer;
      prochaine.d.minuterie &&= d.minuterie;
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
        const r: ResultatEnvoi = { etat: 'echec', composes: 0, envoyes: 0, presents: 0, refuses: 0, arret: null, quand: maintenant() };
        rapport.derniere = r;
        return r;
      })
      .finally(() => abonnes.forEach((f) => f()));
    prochaine = suivante;
    file = suivante.p.catch(() => undefined);
    return suivante.p;
  }

  return {
    declencher,
    compter: (uid) => compter(journal, lots, uid),
    async etat(uid) {
      const c = await compter(journal, lots, uid);
      return { coupee: coupee(), attente: c.attente, refusees: c.refusees, horsLigne: rapport.horsLigne };
    },
    surPasse(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    rapport: () => structuredClone(rapport),
  };
}
