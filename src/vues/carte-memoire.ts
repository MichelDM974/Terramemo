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
import type { Domaine } from '../srs/fiches';
import { maitrises, memoireEntite, seauxEntites } from '../srs/planif';
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

/** Le domaine des fiches d'un terrain : les pays du monde, les communes de l'île. */
export const domaineDe = (t: NomTerrain): Domaine => (t === 'monde' ? 'pays' : 'communes');

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
  return {
    teintes(t) {
      return pret() ? seauxEntites(m.etat(), domaineDe(t)) : null;
    },
    maitrises(t, total) {
      return pret() ? remplir(M.maitrises, { n: maitrises(seauxEntites(m.etat(), domaineDe(t))), total }) : null;
    },
    detail(t, id, jouable) {
      if (!pret() || !jouable) return null;
      const e = memoireEntite(m.etat(), domaineDe(t), id, m.jour());
      if (!e) return M.jamais_vu;
      const quand = e.dans <= 0 ? M.a_revoir : e.dans === 1 ? M.revient_demain : remplir(M.revient, { n: e.dans });
      return `${remplir(e.vu > 1 ? M.vu : M.vu_une, { n: e.vu })} · ${quand}`;
    },
  };
}
