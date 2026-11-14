// Les lignes de repère dans ⚙ (#11, décision « Lignes de repère » du 14/11) :
// une case par sorte de ligne, toutes décochées par défaut, le choix gardé sur
// l'appareil (terramemo.lignes). ?lignes=tout (ou une liste : ?lignes=equateur,grille ;
// ?lignes=0 : aucune) les coche pour la page seule, comme ?mers=demo : la
// mesure du pilote avec et sans lignes, sans toucher au choix gardé.
import { CHOIX_LIGNES, type ChoixLigne } from '../map/lignes';

/** Clé du réglage : les choix cochés, séparés par des virgules (« equateur,grille » ; vide : aucun). */
export const CLE_LIGNES = 'terramemo.lignes';

/** Les choix d'une liste « equateur,grille » (« tout » : tous) ; l'inconnu est ignoré, l'ordre est celui de ⚙. */
export function lireChoixLignes(texte: string): Set<ChoixLigne> {
  const mots = texte.split(',').map((m) => m.trim().toLowerCase());
  if (mots.includes('tout')) return new Set(CHOIX_LIGNES);
  return new Set(CHOIX_LIGNES.filter((c) => mots.includes(c)));
}

/** Le choix gardé sur l'appareil ; aucun (le défaut) sans réglage ou sans stockage. */
export function lireReglageLignes(s: Pick<Storage, 'getItem'> | null): Set<ChoixLigne> {
  try {
    return lireChoixLignes(s?.getItem(CLE_LIGNES) ?? '');
  } catch {
    return new Set();
  }
}

export function garderReglageLignes(s: Pick<Storage, 'setItem'> | null, choix: ReadonlySet<ChoixLigne>): void {
  try {
    s?.setItem(CLE_LIGNES, CHOIX_LIGNES.filter((c) => choix.has(c)).join(','));
  } catch {
    /* stockage refusé : le réglage vaut pour cette page */
  }
}

/** ?lignes= : le choix de la page seule ; null sans le paramètre (le choix gardé vaut). */
export function lignesDeLAdresse(params: URLSearchParams): Set<ChoixLigne> | null {
  const p = params.get('lignes');
  return p === null ? null : lireChoixLignes(p);
}

/**
 * Le choix au chargement : celui de ?lignes= pour la page seule (garder :
 * false, une case changée dans ⚙ ne touche pas au choix gardé), sinon le
 * choix gardé (garder : true).
 */
export function choixDeDepart(params: URLSearchParams, s: Pick<Storage, 'getItem'> | null): { choix: Set<ChoixLigne>; garder: boolean } {
  const adresse = lignesDeLAdresse(params);
  return adresse ? { choix: adresse, garder: false } : { choix: lireReglageLignes(s), garder: true };
}

/**
 * Les cases de ⚙ dans conteneur (le titre du groupe, puis une case par choix,
 * dans la forme de .case : l'entrée puis son nom), cochées selon choix ;
 * surChange reçoit le nouveau choix à chaque case changée.
 */
export function brancherCasesLignes(
  conteneur: HTMLElement,
  textes: { reglage: string; reglage_detail: string; cases: Record<ChoixLigne, string> },
  choix: ReadonlySet<ChoixLigne>,
  surChange: (choix: Set<ChoixLigne>) => void,
): void {
  const courant = new Set(choix);
  const titre = document.createElement('span');
  titre.className = 'reglage-nom';
  titre.id = 'reglage-lignes-nom';
  titre.textContent = textes.reglage;
  conteneur.replaceChildren(titre);
  conteneur.setAttribute('role', 'group');
  conteneur.setAttribute('aria-labelledby', titre.id);
  conteneur.title = textes.reglage_detail;
  for (const c of CHOIX_LIGNES) {
    const label = document.createElement('label');
    label.className = 'case';
    const entree = document.createElement('input');
    entree.type = 'checkbox';
    entree.id = `reglage-ligne-${c}`;
    entree.dataset.ligne = c;
    entree.checked = courant.has(c);
    entree.addEventListener('change', () => {
      if (entree.checked) courant.add(c);
      else courant.delete(c);
      surChange(new Set(courant));
    });
    const nom = document.createElement('span');
    nom.textContent = textes.cases[c];
    label.append(entree, ' ', nom);
    conteneur.append(label);
  }
}
