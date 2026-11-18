// « Apprendre ce lieu » (#34, lot F7, étude docs/etudes/2026-11-16-fiche-lieu-conception.md, § 5) vu du
// morceau principal : le sujet et la série d'un lieu touché, l'état du bouton lu dans les comptes de la
// séance (src/vues/seance.ts : comptes() avec un lieu, jamais une règle à côté), le lancement par lancer()
// de main.ts (comme Jouer), et le lieu retenu sur l'appareil quand la grappe du jour est prise (D58 b,
// § 5.6). La fiche (src/vues/fiche.ts, un morceau à part) ne lit que ApprendreModele.
//
// Le lieu retenu : une clé par sujet (`terramemo.apprendre.<sujet>`), l'id du lieu, jamais celui d'une
// grappe (elles changent avec les données). Il n'est pas synchronisé (le site et l'APK ont chacun le leur),
// rien n'en va au journal. Il s'éteint seul une fois le lieu appris (lirePrefere).
import { estIdMer } from '../map/mers';
import type { NomTerrain, Pays } from '../map/types';
import type { Memoire } from '../journal/memoire';
import type { Domaine } from '../srs/fiches';
import { introduite } from '../srs/planif';
import type { Lancement } from './arbre';
import { SERIE_MERS, SERIE_REUNION, type Serie } from './cibles';
import type { EtatLieu, Seances } from './seance';

/** Préfixe de la clé du lieu retenu, suivi du sujet (« terramemo.apprendre.pays »). */
export const CLE_APPRENDRE = 'terramemo.apprendre';

type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Les sujets qu'un lieu touché fait apprendre : un pays par son nom seul (D58 a, § 5.3), une mer, une commune. */
export type SujetLieu = 'pays' | 'mers' | 'communes';

/** Ce que la fiche montre du bouton (§ 5.4) ; tout y est déjà dit. */
export interface ApprendreModele {
  sujet: SujetLieu;
  /** null : la mémoire se lit encore (le bouton, sans compte ; un toucher l'attend, comme lancer()). */
  lieu: EtatLieu | null;
  /** Le lieu est retenu sur l'appareil (D58 b) : « Noté : sa région sera ta prochaine grappe », et « Annuler ». */
  retenu: boolean;
  /** Faux : le dépôt de l'appareil est fermé, les progrès ne survivront pas à la page (l'avis de la séance). */
  garde: boolean;
}

/** Ce que la carte demande pour un lieu de la fiche ; terrain et id viennent de son entrée d'historique. */
export interface ApprendreFiche {
  /** null : pas de mémoire possible pour ce lieu (territoire, zone, Antarctique) : ni bloc, ni bouton. */
  etat(terrain: NomTerrain, id: string): ApprendreModele | null;
  /** La séance Apprendre sur la grappe du lieu, par lancer() (la vue de partie s'ouvre, la fiche se ferme). */
  lancer(terrain: NomTerrain, id: string): void;
  /** Le lieu retenu pour la prochaine grappe de son sujet (il remplace celui d'avant). */
  retenir(terrain: NomTerrain, id: string): void;
  /** « Annuler » : le lieu retenu oublié. */
  oublier(terrain: NomTerrain, id: string): void;
}

/** Le lieu retenu pour ce sujet, ou null (aucun, stockage refusé). */
export function lireRetenu(s: Pick<Storage, 'getItem'> | null, sujet: string): string | null {
  try {
    return s?.getItem(`${CLE_APPRENDRE}.${sujet}`) || null;
  } catch {
    return null;
  }
}

export function garderRetenu(s: Pick<Storage, 'setItem'> | null, sujet: string, id: string): void {
  try {
    s?.setItem(`${CLE_APPRENDRE}.${sujet}`, id);
  } catch {
    /* stockage refusé : rien de retenu */
  }
}

export function oublierRetenu(s: Pick<Storage, 'removeItem'> | null, sujet: string): void {
  try {
    s?.removeItem(`${CLE_APPRENDRE}.${sujet}`);
  } catch {
    /* stockage refusé : rien à oublier */
  }
}

/**
 * Le lieu retenu d'un sujet, pour la séance (OptionsSeances.prefere) : null une fois appris, et la clé
 * effacée alors (§ 5.6 : elle s'éteint seule). Avant la lecture de la mémoire, tel quel.
 */
export function lirePrefere(s: Stockage | null, m: Pick<Memoire, 'charge' | 'etat'>, sujet: Domaine): string | null {
  const id = lireRetenu(s, sujet);
  if (id && m.charge && introduite(m.etat(), sujet, id)) {
    oublierRetenu(s, sujet);
    return null;
  }
  return id;
}

export interface OptionsApprendreLieu {
  memoire: Pick<Memoire, 'charge' | 'garde' | 'etat'>;
  seances: Pick<Seances, 'comptes'>;
  /** Une série de Jouer (arbre.serie) : le continent d'un pays, « mers », « reunion ». */
  serie(sujet: string, id: string): Serie | undefined;
  /** Les entités du monde (pays.json) : statut et continent d'un pays. */
  entite(id: string): Pays | undefined;
  stockage(): Stockage | null;
  /** lancer() de main.ts : la mémoire attendue, la dernière partie gardée (sans le lieu), la vue de partie. */
  lancer(l: Lancement, s: Serie): void;
}

export function apprendreLieu(o: OptionsApprendreLieu): ApprendreFiche {
  /** Le sujet et la série d'un lieu ; null : aucun sujet ne le fait apprendre. */
  function demande(terrain: NomTerrain, id: string): { sujet: SujetLieu; serie: Serie } | null {
    const choix: [SujetLieu, string] | null =
      terrain === 'reunion'
        ? ['communes', SERIE_REUNION]
        : estIdMer(id)
          ? ['mers', SERIE_MERS]
          : o.entite(id)?.statut === 'jouable'
            ? ['pays', o.entite(id)!.continent]
            : null;
    const serie = choix && o.serie(choix[0], choix[1]);
    return choix && serie ? { sujet: choix[0], serie } : null;
  }
  return {
    etat(terrain, id) {
      const d = demande(terrain, id);
      if (!d) return null;
      const c = o.seances.comptes({ sorte: 'apprendre', sujet: d.sujet, serie: d.serie, lieu: id });
      const lieu = c?.lieu ?? null;
      if (lieu?.etat === 'sans_grappe') return null;
      return { sujet: d.sujet, lieu, retenu: lireRetenu(o.stockage(), d.sujet) === id && lieu?.etat !== 'appris', garde: o.memoire.garde };
    },
    lancer(terrain, id) {
      const d = demande(terrain, id);
      if (d) o.lancer({ branche: 'entrainement', sujet: d.sujet, serie: d.serie.id, mode: 'apprendre', lieu: id }, d.serie);
    },
    retenir(terrain, id) {
      const d = demande(terrain, id);
      if (d) garderRetenu(o.stockage(), d.sujet, id);
    },
    oublier(terrain, id) {
      const d = demande(terrain, id);
      if (d && lireRetenu(o.stockage(), d.sujet) === id) oublierRetenu(o.stockage(), d.sujet);
    },
  };
}
