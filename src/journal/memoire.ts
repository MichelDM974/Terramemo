// La mémoire de l'appareil (étude J1a § 2 et 4) : le lien entre le dépôt du
// journal (depot.ts), l'id de l'appareil (appareil.ts), l'horloge et l'état
// FSRS rejoué (src/srs/rejeu.ts, pur). Au démarrage : le journal lu et rejoué
// UNE fois ; ensuite chaque événement écrit est appliqué à l'état gardé en
// mémoire (rejeu.ts appliquer), jamais un rejeu par réponse (55 à 90 ms pour
// 15 000 notes sur le PC, plusieurs fois plus sur le téléphone).
//
// Une erreur du dépôt ne bloque rien (étude § 8) : sans IndexedDB (navigation
// privée stricte, base qui ne s'ouvre pas), le journal vit en mémoire
// (depotMemoire) et `garde` passe à faux, que les vues disent par un avis
// discret ; l'état en mémoire suit quand même la séance. Rien n'est envoyé
// au réseau ici : l'envoi des lots (J1b, lot 3, src/sync/envoi.ts) lit le
// journal par tous(), et n'envoie la séance en cours de la page qu'en
// arrière-plan (seanceEnCours, clore : étude du J1b, § 5.2, « Séance close »).
//
// J1b, lot 4 (étude § 5.3 et § 3.4) : `fusionner` ajoute les événements lus
// en ligne (union par id, doublons ignorés) et rejette si le dépôt échoue,
// pour que rien ne soit marqué en ligne sans être gardé ici ; `effacer` vide
// le journal (déconnexion, « Ne pas les ajouter », « Effacer cet appareil »).
// Un rejeu complet (journal du dépôt ∪ événements de la page : rien d'écrit
// en mémoire seulement ne se perd) remplace l'application pas à pas quand un
// événement vient avant le dernier appliqué dans l'ordre du rejeu (union,
// horloge qui recule) ; il se fait au repos (requestIdleCallback) et jamais
// pendant une séance active, différé à sa clôture. Les onglets se préviennent
// par BroadcastChannel : un journal effacé ailleurs recharge la page
// (main.ts), une séance close ou une union ailleurs fait relire le journal.

import { jourDe, type Horloge } from '../srs/jour';
import { valider, type Evenement } from '../srs/journal';
import { PARAMS_FSRS, planificateur, type ParamsFsrs } from '../srs/fsrs';
import { appliquer, comparer, etat as rejouer, ordonner, type EtatFiche } from '../srs/rejeu';
import { depotMemoire, ErreurDepot, type Depot } from './depot';
import { uuid } from './uuid';

export interface Memoire {
  /** Résolue une fois le journal lu et rejoué ; jamais rejetée (repli en mémoire). */
  readonly pret: Promise<void>;
  /** Le journal est lu et rejoué. */
  readonly charge: boolean;
  /** Faux si le dépôt de l'appareil n'a pas pu s'ouvrir ou écrire : les progrès ne survivront pas à la page. */
  readonly garde: boolean;
  readonly appareil: string;
  readonly horloge: Horloge;
  /** État FSRS de chaque fiche notée (vide tant que le journal n'est pas chargé). */
  etat(): ReadonlyMap<string, EtatFiche>;
  /** Jour local de l'horloge (src/srs/jour.ts). */
  jour(): number;
  /** Nouvel uuid (événement, séance). */
  nouvelId(): string;
  /**
   * Ajoute des événements au journal et les applique à l'état en mémoire,
   * tout de suite (l'état suit même si le dépôt échoue ensuite). La promesse
   * dit l'écriture au dépôt ; elle n'est jamais rejetée (l'échec passe
   * `garde` à faux et prévient surAvis).
   */
  ecrire(evts: readonly Evenement[]): Promise<void>;
  /** Événements écrits depuis l'ouverture (pilote, tests). */
  readonly ecrits: number;
  /**
   * Tout le journal : celui du dépôt, plus les événements écrits par la page
   * qu'il n'a pas (file en cours, dépôt en échec, repli en mémoire). Attend
   * le chargement ; ne rejette pas (dépôt illisible : ceux de la page).
   */
  tous(): Promise<Evenement[]>;
  /**
   * La séance de la page en cours : celle du dernier événement écrit, tant
   * qu'elle n'est pas close (clore). Toute autre séance est close (étude du
   * J1b, § 5.2). null hors séance.
   */
  seanceEnCours(): string | null;
  /** La séance en cours est finie (bilan, « Terminer », vue quittée) : elle devient envoyable. */
  clore(): void;
  /**
   * Ajoute au journal des événements venus d'ailleurs (lots lus en ligne,
   * étude du J1b § 5.3), valides, par la même file que `ecrire` : un id déjà
   * connu est ignoré. Rejette si le dépôt n'a pas pu les écrire (l'appelant
   * ne les marque alors pas en ligne). Résolue une fois l'état à jour, sauf
   * pendant une séance active, où l'état suit à sa clôture.
   */
  fusionner(evts: readonly Evenement[]): Promise<void>;
  /**
   * Vide le journal (étude du J1b, § 3.4) : attend la file d'écriture, vide
   * le dépôt, l'état et ce que la page avait écrit, puis prévient les autres
   * onglets. Rejette si le dépôt de l'appareil n'a pas pu être vidé.
   */
  effacer(): Promise<void>;
  /** Le journal relu et rejoué en entier, au repos et hors d'une séance active (autre onglet). */
  recharger(): Promise<void>;
  /** Plus d'écoute des autres onglets (tests). */
  fermer(): void;
}

export interface OptionsMemoire {
  /** Le dépôt de l'appareil (depotIndexedDb en vrai ; depotMemoire dans les tests). */
  depot: Depot;
  appareil: string;
  horloge: Horloge;
  nouvelId?: () => string;
  params?: ParamsFsrs;
  /** Le dépôt a échoué (ouverture, lecture ou écriture) : un avis discret, une fois. */
  surAvis?: (e: unknown) => void;
  /** Le journal est chargé, ou rejoué en entier (Jouer et la carte de la mémoire se redessinent). */
  surCharge?: () => void;
  /** Une séance vient d'être close (clore) : l'envoi peut partir. */
  surCloture?: (seance: string) => void;
  /**
   * Attendu avant de lire le journal : une déconnexion interrompue (appli
   * tuée) finit d'effacer l'appareil avant tout le reste (étude du J1b,
   * § 3.4). Son échec n'empêche pas la lecture.
   */
  avant?: Promise<unknown>;
  /** Nom du BroadcastChannel des onglets ('terramemo' dans main.ts) ; null : aucun (défaut, tests). */
  canal?: string | null;
  /** Un autre onglet a effacé le journal (main.ts : la page se recharge). Défaut : l'état repart du dépôt. */
  surEffaceAilleurs?: () => void;
  /** Le rejeu complet attend le repos (défaut : requestIdleCallback, sinon setTimeout). */
  auRepos?: (f: () => void) => void;
}

/** Message des onglets : un journal effacé, ou un journal qui a changé (séance close, union). */
type MessageCanal = { type: 'efface' } | { type: 'journal' };

function reposParDefaut(f: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => unknown }).requestIdleCallback;
  if (typeof ric === 'function') ric(f, { timeout: 2000 });
  else setTimeout(f, 0);
}

/** Le dernier événement valide dans l'ordre du rejeu. */
function plusRecent(evts: Iterable<unknown>): Evenement | null {
  let m: Evenement | null = null;
  for (const e of evts) if (valider(e) && (!m || comparer(e, m) > 0)) m = e;
  return m;
}

export function ouvrirMemoire(o: OptionsMemoire): Memoire {
  const params = o.params ?? PARAMS_FSRS;
  const p = planificateur(params);
  /** Le dépôt de l'appareil, même remplacé par le repli : c'est lui qu'il faut vider. */
  const depotReel = o.depot;
  let depot = o.depot;
  let fiches = new Map<string, EtatFiche>();
  let charge = false;
  let garde = true;
  let ecrits = 0;
  /** Écrits avant la fin du chargement : rejoués avec le journal (sans doublon). */
  let enAttente: Evenement[] = [];
  /** Les écritures se suivent dans l'ordre (un lot attend le précédent). */
  let file: Promise<void> = Promise.resolve();
  let averti = false;
  /** Les événements écrits par la page, dans l'ordre (tous() les ajoute à ceux du dépôt). */
  const page = new Map<string, Evenement>();
  let enCours: string | null = null;
  let close = true;
  /** Les ids du journal connus de la page (chargés, écrits, fusionnés) : une union n'écrit que les nouveaux. */
  let ids = new Set<string>();
  /** Le dernier événement appliqué dans l'ordre du rejeu : un événement qui vient avant lui demande un rejeu complet. */
  let dernier: Evenement | null = null;
  /** Un rejeu complet attend (union, horloge qui recule, autre onglet) : au repos, hors d'une séance active. */
  let rejeuDu = false;
  let rejeu: Promise<void> | null = null;
  const auRepos = o.auRepos ?? reposParDefaut;

  const echec = (e: unknown) => {
    garde = false;
    if (!averti) {
      averti = true;
      o.surAvis?.(e);
    }
  };

  const actif = () => !close && enCours !== null;

  /** L'état refait du journal entier : dépôt ∪ page (un événement en mémoire seulement n'est pas perdu). */
  async function rejouerTout(): Promise<void> {
    rejeuDu = false;
    let gardes: Evenement[] = [];
    try {
      gardes = await depot.tous();
    } catch {
      // Dépôt illisible après coup : ceux de la page seulement.
    }
    // Synchrone dès ici : une écriture de la page venue pendant la lecture est dans `page`.
    const tout = [...gardes, ...page.values()];
    fiches = rejouer(tout, params);
    dernier = plusRecent(tout);
    ids = new Set(tout.map((e) => e.id));
    o.surCharge?.();
  }

  /** Un rejeu complet, au repos ; pendant une séance active, à sa clôture (clore). */
  function planifierRejeu(): Promise<void> {
    rejeuDu = true;
    if (!charge || actif()) return Promise.resolve();
    rejeu ??= new Promise<void>((ok) => auRepos(ok)).then(async () => {
      rejeu = null;
      if (rejeuDu && !actif()) await rejouerTout();
    });
    return rejeu;
  }

  /** Un événement appliqué pas à pas : s'il vient avant le dernier appliqué (horloge qui recule), rejeu complet. */
  function suivre(e: Evenement): void {
    ids.add(e.id);
    if (!valider(e)) return;
    const c = dernier ? comparer(e, dernier) : 1;
    if (c > 0) dernier = e;
    else if (c < 0) void planifierRejeu();
  }

  const canal = (() => {
    if (!o.canal || typeof BroadcastChannel === 'undefined') return null;
    try {
      const c = new BroadcastChannel(o.canal);
      c.onmessage = (ev: MessageEvent<MessageCanal>) => {
        if (ev.data?.type === 'efface') {
          if (o.surEffaceAilleurs) return o.surEffaceAilleurs();
          page.clear();
          enAttente = [];
          void rejouerTout();
        } else if (ev.data?.type === 'journal') void planifierRejeu();
      };
      // Node (tests) : le canal ne retient pas le processus.
      (c as { unref?: () => void }).unref?.();
      return c;
    } catch {
      return null;
    }
  })();
  const diffuser = (m: MessageCanal) => {
    try {
      canal?.postMessage(m);
    } catch {
      // Canal fermé : les autres onglets verront le journal à leur prochaine ouverture.
    }
  };

  const pret = (async () => {
    if (o.avant) await o.avant.catch(() => undefined);
    let evts: Evenement[] = [];
    try {
      evts = await depot.tous();
    } catch (e) {
      // Pas d'IndexedDB, base illisible : le journal vit en mémoire pour cette page.
      depot = depotMemoire();
      echec(e);
    }
    // Ce qui a été écrit pendant la lecture est rejoué avec le journal : le même état qu'un rejeu complet.
    const tout = [...evts, ...enAttente];
    fiches = rejouer(tout, params);
    dernier = plusRecent(tout);
    for (const e of tout) ids.add(e.id);
    enAttente = [];
    charge = true;
    o.surCharge?.();
  })();

  return {
    pret,
    get charge() {
      return charge;
    },
    get garde() {
      return garde;
    },
    appareil: o.appareil,
    horloge: o.horloge,
    etat: () => fiches,
    jour: () => jourDe(o.horloge()),
    nouvelId: o.nouvelId ?? uuid,
    get ecrits() {
      return ecrits;
    },
    async tous() {
      await pret;
      let gardes: Evenement[] = [];
      try {
        gardes = await depot.tous();
      } catch {
        // Dépôt illisible après coup : ceux de la page seulement.
      }
      const tout = new Map(gardes.map((e) => [e.id, e]));
      // Un événement que le dépôt refuserait (invalide) ne sort pas non plus d'ici.
      for (const [id, e] of page) if (!tout.has(id) && valider(e)) tout.set(id, structuredClone(e));
      return [...tout.values()];
    },
    seanceEnCours: () => (close ? null : enCours),
    clore() {
      if (close || !enCours) return;
      close = true;
      o.surCloture?.(enCours);
      diffuser({ type: 'journal' });
      if (rejeuDu) void planifierRejeu();
    },
    ecrire(evts) {
      if (!evts.length) return file;
      ecrits += evts.length;
      for (const e of evts) {
        page.set(e.id, structuredClone(e));
        if (e.seance !== null) {
          enCours = e.seance;
          close = false;
        }
      }
      if (charge)
        for (const e of evts) {
          appliquer(fiches, e, p);
          suivre(e);
        }
      else enAttente.push(...evts);
      const lot = [...evts];
      // Après le chargement : un dépôt remplacé par le repli reçoit les écrits.
      file = file
        .then(() => (charge ? undefined : pret))
        .then(() => depot.ajouter(lot))
        .catch(echec);
      return file;
    },
    async fusionner(evts) {
      await pret;
      // Une copie, et rien de ce que la page connaît déjà (le rejeu ne bougerait pas).
      const nouveaux = ordonner(evts.filter((e) => !ids.has(e.id))).map((e) => structuredClone(e));
      if (!nouveaux.length) return;
      const ecriture = file.then(() => depot.ajouter(nouveaux));
      file = ecriture.catch(() => undefined);
      await ecriture;
      diffuser({ type: 'journal' });
      // Après tout ce qui est appliqué : pas à pas, sinon un rejeu complet ; jamais pendant une séance active.
      if (!actif() && !rejeuDu && (!dernier || comparer(nouveaux[0]!, dernier) > 0)) {
        for (const e of nouveaux) {
          appliquer(fiches, e, p);
          suivre(e);
        }
        o.surCharge?.();
        return;
      }
      for (const e of nouveaux) ids.add(e.id);
      await planifierRejeu();
    },
    async effacer() {
      const avant = new Set(page.keys());
      const vidage = file
        .then(() => pret)
        .then(async () => {
          try {
            if (!depotReel.vider) throw new ErreurDepot('echec', 'dépôt sans effacement');
            await depotReel.vider();
          } catch (e) {
            // Sans IndexedDB du tout, rien n'a été gardé : le repli en mémoire suffit.
            if (!(e instanceof ErreurDepot && e.raison === 'indisponible' && depot !== depotReel)) throw e;
          }
          if (depot !== depotReel) await depot.vider?.();
        });
      file = vidage.catch(() => undefined);
      await vidage;
      // Ce que la page a écrit depuis le début de l'effacement est passé après lui dans la file : gardé.
      for (const id of avant) page.delete(id);
      const reste = [...page.values()];
      fiches = rejouer(reste, params);
      dernier = plusRecent(reste);
      ids = new Set(reste.map((e) => e.id));
      enAttente = [];
      rejeuDu = false;
      if (!reste.some((e) => e.seance === enCours)) {
        enCours = null;
        close = true;
      }
      diffuser({ type: 'efface' });
      o.surCharge?.();
    },
    async recharger() {
      await pret;
      await planifierRejeu();
    },
    fermer() {
      try {
        canal?.close();
      } catch {
        // déjà fermé
      }
    },
  };
}
