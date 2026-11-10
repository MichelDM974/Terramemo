// La carte de la mémoire (étude J1a § 7, défaut D7) vue de l'accueil : le
// seau de chaque pays (ou commune) tiré de l'état FSRS de l'appareil
// (src/srs/planif.ts seauxEntites, la fiche la plus faible décide), la
// légende et la ligne « Vu 4 fois · revient dans 5 j » d'une zone touchée.
// Le réglage « Carte de la mémoire » (⚙) est gardé dans le navigateur,
// activé par défaut. Seule la vue Carte (explorer.ts) s'en sert : elle pose
// les teintes à son activer() et les retire à son desactiver(), si bien
// qu'aucune partie, séance ni épreuve ne les voit (elles trahiraient les
// pays jamais vus).
import type { Memoire } from '../journal/memoire';
import type { NomTerrain } from '../map/types';
import { DOMAINES_JOUABLES, jouablesDu, type Domaine } from '../srs/fiches';
import { maitrises, memoireEntite, seauxEntites, type Seau } from '../srs/planif';
import { textesSujet } from './sujets';
import { remplir, textes } from './textes';

const M = textes.memoire;

/** Défaut D7 (en attente de l'utilisateur, #2) : la carte de la mémoire est montrée à l'accueil tant qu'on ne la coupe pas dans ⚙. */
export const CARTE_MEMOIRE_PAR_DEFAUT = true;
/** Clé du réglage dans le stockage du navigateur ('1' ou '0'). */
export const CLE_CARTE_MEMOIRE = 'terramemo.carteMemoire';

export function lireReglageMemoire(s: Pick<Storage, 'getItem'> | null): boolean {
  let v: string | null = null;
  try {
    v = s?.getItem(CLE_CARTE_MEMOIRE) ?? null;
  } catch {
    /* stockage refusé : le défaut */
  }
  return v === null ? CARTE_MEMOIRE_PAR_DEFAUT : v === '1';
}

export function garderReglageMemoire(s: Pick<Storage, 'setItem'> | null, actif: boolean): void {
  try {
    s?.setItem(CLE_CARTE_MEMOIRE, actif ? '1' : '0');
  } catch {
    /* stockage refusé : le réglage vaut pour cette page */
  }
}

/** Clé du sujet choisi de la carte de la mémoire, suivie du terrain (« terramemo.sujetMemoire.monde ») : un domaine. */
export const CLE_SUJET_MEMOIRE = 'terramemo.sujetMemoire';

/**
 * Le domaine que la carte de la mémoire montre sur un terrain (étude J2
 * § 6.4, D47 a) : le sujet choisi s'il est jouable là, sinon le premier
 * jouable (DOMAINES_JOUABLES : les pays du monde, les communes de l'île),
 * jamais un sujet que cette version ne pose pas (§ 3.1, 6.5). null : aucun
 * sujet jouable là.
 */
export function domaineDe(t: NomTerrain, choix: string | null = null, jouables: readonly Domaine[] = DOMAINES_JOUABLES): Domaine | null {
  const ici = jouablesDu(t, jouables);
  return ici.find((d) => d === choix) ?? ici[0] ?? null;
}

/** Le sujet gardé pour ce terrain (null : aucun, ou stockage refusé). */
export function lireSujetMemoire(s: Pick<Storage, 'getItem'> | null, t: NomTerrain): string | null {
  try {
    return s?.getItem(`${CLE_SUJET_MEMOIRE}.${t}`) ?? null;
  } catch {
    return null;
  }
}

export function garderSujetMemoire(s: Pick<Storage, 'setItem'> | null, t: NomTerrain, d: Domaine): void {
  try {
    s?.setItem(`${CLE_SUJET_MEMOIRE}.${t}`, d);
  } catch {
    /* stockage refusé : le choix vaut pour cette page */
  }
}

/** Ce que la vue Carte lit de la mémoire ; null partout quand le réglage est coupé ou la mémoire pas encore chargée. */
export interface CarteMemoire {
  /**
   * Les sujets entre lesquels choisir dans la légende (D47 a) : les jouables
   * du terrain, vide tant qu'il n'en a qu'un (le choix est alors caché).
   */
  sujets(t: NomTerrain): Domaine[];
  /** Le sujet montré sur le terrain (Pays par défaut) ; null : aucun sujet jouable là. */
  sujet(t: NomTerrain): Domaine | null;
  /** Le choix du joueur, gardé sur l'appareil. */
  choisir(t: NomTerrain, d: Domaine): void;
  /** Le seau de chaque zone vue du terrain, dans le sujet montré (absente : jamais vue, elle garde --terre). */
  teintes(t: NomTerrain): Map<string, number> | null;
  /** « 3/195 maîtrisés » sur `total` zones jouables, dans le sujet montré. */
  maitrises(t: NomTerrain, total: number): string | null;
  /**
   * « Vu 4 fois · revient dans 5 j », « Jamais vu » ; à partir de deux sujets
   * jouables, le détail de chacun (« Pays : vu 4 fois · revient dans 5 j ·
   * Capitale : jamais vue »). null pour une zone qui ne se joue pas (territoire).
   */
  detail(t: NomTerrain, id: string, jouable: boolean): string | null;
}

export interface OptionsCarteMemoire {
  /** Où garder le sujet choisi (le localStorage) ; sans lui, le choix vaut pour la page. */
  stockage?: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Les domaines jouables (DOMAINES_JOUABLES par défaut ; les tests y mettent un sujet pas encore livré). */
  jouables?: readonly Domaine[];
}

/** « revient dans 5 j », « revient demain », « à revoir aujourd'hui ». */
const quand = (dans: number): string => (dans <= 0 ? M.a_revoir : dans === 1 ? M.revient_demain : remplir(M.revient, { n: dans }));

export function carteMemoire(m: Memoire, actif: () => boolean, o: OptionsCarteMemoire = {}): CarteMemoire {
  const jouables = o.jouables ?? DOMAINES_JOUABLES;
  const pret = () => actif() && m.charge;
  /** Le choix de la page, quand le stockage est refusé ou absent. */
  const choix = new Map<NomTerrain, Domaine>();
  const sujet = (t: NomTerrain): Domaine | null => domaineDe(t, choix.get(t) ?? lireSujetMemoire(o.stockage?.() ?? null, t), jouables);
  /** Les seaux du domaine montré sur ce terrain (vides sans domaine jouable). */
  const seaux = (t: NomTerrain) => {
    const d = sujet(t);
    return d ? seauxEntites(m.etat(), d) : new Map<string, Seau>();
  };
  return {
    sujets(t) {
      const ici = jouablesDu(t, jouables);
      return ici.length > 1 ? ici : [];
    },
    sujet,
    choisir(t, d) {
      if (!jouablesDu(t, jouables).includes(d)) return;
      choix.set(t, d);
      garderSujetMemoire(o.stockage?.() ?? null, t, d);
    },
    teintes(t) {
      return pret() ? seaux(t) : null;
    },
    maitrises(t, total) {
      return pret() ? remplir(M.maitrises, { n: maitrises(seaux(t)), total }) : null;
    },
    detail(t, id, jouable) {
      const d = sujet(t);
      if (!pret() || !jouable || !d) return null;
      // Les sujets qui jouent cette zone : sur le monde, le pays, sa capitale, son drapeau ; les mers ont leurs propres zones (lot 3b).
      const ici = jouablesDu(t, jouables).filter((x) => x !== 'mers');
      if (ici.length < 2) {
        // Un seul sujet : la ligne d'avant, telle quelle.
        const e = memoireEntite(m.etat(), d, id, m.jour());
        return e ? `${remplir(e.vu > 1 ? M.vu : M.vu_une, { n: e.vu })} · ${quand(e.dans)}` : M.jamais_vu;
      }
      return ici
        .map((x) => {
          const ts = textesSujet(x).memoire;
          const e = memoireEntite(m.etat(), x, id, m.jour());
          const detail = e ? `${remplir(e.vu > 1 ? ts.vu : ts.vu_une, { n: e.vu })} · ${quand(e.dans)}` : ts.jamais;
          return remplir(M.detail_sujet, { sujet: ts.nom, detail });
        })
        .join(' · ');
    },
  };
}
