// Drapeaux du J1b (docs/etudes/2026-11-07-j1b-conception.md, § 8) : rien
// des comptes n'est visible du public avant le lot 8, et un essai ne touche
// jamais la synchro du vrai projet.
//
// - Comptes : visibles en DEV, si COMPTES_OUVERTS, ou avec le drapeau
//   `terramemo.comptes` du localStorage, posé par `?comptes` et retiré par
//   `?comptes=0` (dans l'APK, qui n'a pas d'adresse à modifier, le pilote le
//   pose). Il ne protège rien : la clé d'API est publique, la protection est
//   dans les règles (`joueurs/` fermé, puis `essai()`, § 6).
// - Synchro coupée : `?sans-synchro` (cette page seulement), ou le drapeau
//   `terramemo.sans-synchro` du localStorage, posé par le driver du skill
//   run-terramemo et retiré par lui à la fin de chaque commande (ou par
//   `?sans-synchro=0`), lu en production aussi : il coupe envois et lectures
//   de `joueurs/`. Un `?sans-synchro` ne se garde pas : oublié, il couperait
//   la synchro de l'utilisateur sans qu'il le sache.
//
// Un paramètre de l'adresse l'emporte toujours sur le drapeau gardé, quelle
// que soit l'ordre des appels (poserDrapeaux peut ne pas avoir tourné, ou le
// stockage être refusé).

/**
 * Comptes et synchro ouverts au public (lot 8). Pas de défaut : faux
 * jusqu'à la réponse de l'utilisateur à D15 (décision « Confidentialité et
 * ouverture des comptes »).
 */
export const COMPTES_OUVERTS = false;

export const CLE_COMPTES = 'terramemo.comptes';
export const CLE_SANS_SYNCHRO = 'terramemo.sans-synchro';
const PARAM_COMPTES = 'comptes';
const PARAM_SANS_SYNCHRO = 'sans-synchro';

/** Ce que les drapeaux lisent et écrivent du localStorage. */
export type StockageDrapeaux = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function parametresDeLaPage(): URLSearchParams {
  return new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
}

/** Le localStorage, null s'il est refusé (navigation privée, données bloquées) ou absent. */
function stockageDeLaPage(): StockageDrapeaux | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Vrai pour `?x` et `?x=1`, faux pour `?x=0`, null sans `x`. */
function parametre(params: URLSearchParams, nom: string): boolean | null {
  const v = params.get(nom);
  return v === null ? null : v !== '0';
}

function lire(stockage: StockageDrapeaux | null, cle: string): boolean {
  try {
    return stockage?.getItem(cle) != null;
  } catch {
    return false;
  }
}

function ecrire(stockage: StockageDrapeaux | null, cle: string, pose: boolean): void {
  try {
    if (pose) stockage?.setItem(cle, '1');
    else stockage?.removeItem(cle);
  } catch {
    // Stockage refusé ou plein : le paramètre de l'adresse vaut pour la page.
  }
}

/**
 * À l'ouverture de la page (main.ts) : `?comptes` pose le drapeau des
 * comptes, `?comptes=0` le retire ; `?sans-synchro=0` retire celui de la
 * synchro coupée (`?sans-synchro` seul ne le pose pas).
 */
export function poserDrapeaux(params: URLSearchParams = parametresDeLaPage(), stockage: StockageDrapeaux | null = stockageDeLaPage()): void {
  const comptes = parametre(params, PARAM_COMPTES);
  if (comptes !== null) ecrire(stockage, CLE_COMPTES, comptes);
  if (parametre(params, PARAM_SANS_SYNCHRO) === false) ecrire(stockage, CLE_SANS_SYNCHRO, false);
}

/** Les comptes se montrent-ils (lien de ⚙, invites, vue Compte) ? */
export function comptesVisibles(
  params: URLSearchParams = parametresDeLaPage(),
  stockage: StockageDrapeaux | null = stockageDeLaPage(),
  dev: boolean = import.meta.env.DEV,
  ouverts: boolean = COMPTES_OUVERTS,
): boolean {
  if (dev || ouverts) return true;
  return parametre(params, PARAM_COMPTES) ?? lire(stockage, CLE_COMPTES);
}

/** La synchro est-elle coupée (aucun envoi, aucune lecture de `joueurs/`) ? */
export function synchroCoupee(params: URLSearchParams = parametresDeLaPage(), stockage: StockageDrapeaux | null = stockageDeLaPage()): boolean {
  return parametre(params, PARAM_SANS_SYNCHRO) ?? lire(stockage, CLE_SANS_SYNCHRO);
}
