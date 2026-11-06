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
// au réseau ici (synchro : lot 6).

import { jourDe, type Horloge } from '../srs/jour';
import type { Evenement } from '../srs/journal';
import { PARAMS_FSRS, planificateur, type ParamsFsrs } from '../srs/fsrs';
import { appliquer, etat as rejouer, ordonner, type EtatFiche } from '../srs/rejeu';
import { depotMemoire, type Depot } from './depot';
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
  /** Le journal est chargé (Jouer redessine ses comptes). */
  surCharge?: () => void;
}

export function ouvrirMemoire(o: OptionsMemoire): Memoire {
  const p = planificateur(o.params ?? PARAMS_FSRS);
  let depot = o.depot;
  let fiches = new Map<string, EtatFiche>();
  let charge = false;
  let garde = true;
  let ecrits = 0;
  /** Écrits avant la fin du chargement : appliqués après le rejeu (une note par fiche et par jour : sans doublon). */
  let enAttente: Evenement[] = [];
  /** Les écritures se suivent dans l'ordre (un lot attend le précédent). */
  let file: Promise<void> = Promise.resolve();
  let averti = false;

  const echec = (e: unknown) => {
    garde = false;
    if (!averti) {
      averti = true;
      o.surAvis?.(e);
    }
  };

  const pret = (async () => {
    let evts: Evenement[] = [];
    try {
      evts = await depot.tous();
    } catch (e) {
      // Pas d'IndexedDB, base illisible : le journal vit en mémoire pour cette page.
      depot = depotMemoire();
      echec(e);
    }
    fiches = rejouer(evts, o.params ?? PARAMS_FSRS);
    for (const e of ordonner(enAttente)) appliquer(fiches, e, p);
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
    ecrire(evts) {
      if (!evts.length) return file;
      ecrits += evts.length;
      if (charge) for (const e of evts) appliquer(fiches, e, p);
      else enAttente.push(...evts);
      const lot = [...evts];
      // Après le chargement : un dépôt remplacé par le repli reçoit les écrits.
      file = file
        .then(() => (charge ? undefined : pret))
        .then(() => depot.ajouter(lot))
        .catch(echec);
      return file;
    },
  };
}
