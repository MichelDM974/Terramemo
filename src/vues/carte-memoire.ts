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
import { jouablesDu, type Domaine } from '../srs/fiches';
import { maitrises, memoireEntite, seauxEntites, type Seau } from '../srs/planif';
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

/**
 * Le domaine que la carte de la mémoire montre sur un terrain : le premier
 * jouable (DOMAINES_JOUABLES : les pays du monde, les communes de l'île),
 * jamais un sujet que cette version ne pose pas (étude J2 § 3.1, 6.5) ; le
 * choix du sujet viendra au lot 0c (D47). null : aucun sujet jouable là.
 */
export const domaineDe = (t: NomTerrain): Domaine | null => jouablesDu(t)[0] ?? null;

/** Ce que la vue Carte lit de la mémoire ; null partout quand le réglage est coupé ou la mémoire pas encore chargée. */
export interface CarteMemoire {
  /** Le seau de chaque zone vue du terrain (absente : jamais vue, elle garde --terre). */
  teintes(t: NomTerrain): Map<string, number> | null;
  /** « 3/195 maîtrisés » sur `total` zones jouables. */
  maitrises(t: NomTerrain, total: number): string | null;
  /** « Vu 4 fois · revient dans 5 j », « Jamais vu » ; null pour une zone qui ne se joue pas (territoire). */
  detail(t: NomTerrain, id: string, jouable: boolean): string | null;
}

export function carteMemoire(m: Memoire, actif: () => boolean): CarteMemoire {
  const pret = () => actif() && m.charge;
  /** Les seaux du domaine montré sur ce terrain (vides sans domaine jouable). */
  const seaux = (t: NomTerrain) => {
    const d = domaineDe(t);
    return d ? seauxEntites(m.etat(), d) : new Map<string, Seau>();
  };
  return {
    teintes(t) {
      return pret() ? seaux(t) : null;
    },
    maitrises(t, total) {
      return pret() ? remplir(M.maitrises, { n: maitrises(seaux(t)), total }) : null;
    },
    detail(t, id, jouable) {
      const d = domaineDe(t);
      if (!pret() || !jouable || !d) return null;
      const e = memoireEntite(m.etat(), d, id, m.jour());
      if (!e) return M.jamais_vu;
      const quand = e.dans <= 0 ? M.a_revoir : e.dans === 1 ? M.revient_demain : remplir(M.revient, { n: e.dans });
      return `${remplir(e.vu > 1 ? M.vu : M.vu_une, { n: e.vu })} · ${quand}`;
    },
  };
}
