// Ce qu'efface une déconnexion, « Effacer cet appareil » ou la fin d'une
// suppression du compte hors du journal (J1b, lots 4 et 5 ; étude
// docs/etudes/2026-11-07-j1b-conception.md, § 3.4 et § 7.1) :
// ce qui est au joueur (pseudo, records, file des scores à publier), pas à
// l'appareil (son id, ses réglages, le dernier jeu de « Rejouer »). Petit
// module du morceau principal : main.ts finit au démarrage un effacement que
// l'appli tuée a laissé en route, avant de lire le journal, sans charger les
// comptes.
import type { DepotSession, Session } from './session';

/**
 * Les clés du localStorage qui sont au joueur : pseudo (src/epreuve/chrono.ts),
 * records du Chrono et de ses épreuves, base du pseudo du compte
 * (src/sync/profil.ts), avis d'un pseudo remplacé, file des scores à publier
 * (src/vues/classement.ts), places déjà vues au 🏆 (src/vues/general.ts, D52 b),
 * choix de l'écran de connexion (src/vues/accueil.ts :
 * l'appareil vidé le revoit, comme un appareil neuf). tests/sync-fusion.test.ts
 * vérifie qu'après l'effacement les fonctions de ces modules ne les retrouvent plus.
 */
export const CLES_DU_JOUEUR: readonly string[] = ['terramemo.pseudo', 'terramemo.chrono.records', 'terramemo.pseudo.compte', 'terramemo.pseudo.remplace', 'terramemo.chrono.attente', 'terramemo.classements.vues', 'terramemo.accueil'];

const apresEffacement = new Set<() => void>();

/**
 * Prévenu à chaque effacement de ce qui est au joueur, pour ce que la page
 * en garde hors du stockage : le choix de l'écran de connexion tenu en
 * mémoire quand le stockage est plein (src/vues/accueil.ts). Rend de quoi se
 * désabonner.
 */
export function surEffacementJoueur(f: () => void): () => void {
  apresEffacement.add(f);
  return () => void apresEffacement.delete(f);
}

export function effacerJoueurLocal(stockage: Pick<Storage, 'removeItem'> | null): void {
  for (const k of CLES_DU_JOUEUR) {
    try {
      stockage?.removeItem(k);
    } catch {
      // Stockage refusé : rien à effacer.
    }
  }
  for (const f of apresEffacement) f();
}

/**
 * La session d'un appareil effacé : invité vierge. Une déconnexion voulue
 * reste notée, pour que les comptes finissent son signOut si l'appli a été
 * tuée avant (comptes.ts, etat()). Le drapeau d'une suppression du compte
 * (§ 7.1) n'est pas levé ici : seulement à la fin de cette suppression
 * (FIN_SUPPRESSION), jamais par une déconnexion ou un effacement d'un autre
 * onglet, qui en perdraient la trace.
 */
export const APRES_EFFACEMENT: Readonly<Partial<Session>> = { uid: null, fournisseurs: [], adresse: null, marque: null, profil_a_ecrire: false, effacement: null, connexion: null };

/** La fin d'une suppression du compte : son effacement fait, le drapeau levé. */
export const FIN_SUPPRESSION: Readonly<Partial<Session>> = { suppression: null };

export interface OptionsEffacement {
  session: DepotSession;
  /** Le journal de l'appareil vidé (Depot.vider) ; rejette s'il ne l'est pas. */
  viderJournal: () => Promise<void>;
  /** L'état d'envoi et les lots à relire de ce compte retirés de terramemo-synchro. */
  oublier: (uid: string) => Promise<void>;
  stockage: Pick<Storage, 'removeItem'> | null;
  version: string;
  /**
   * Prévient les autres onglets (BroadcastChannel 'terramemo', comme
   * Memoire.effacer) : `effacement` avant le vidage (ils cessent d'écrire),
   * `efface` après (ils se rechargent), `reprise` sur un échec.
   */
  diffuser?: (m: { type: 'effacement' | 'efface' | 'reprise' }) => void;
}

/**
 * Au démarrage (main.ts), avant de lire le journal : un effacement laissé en
 * route (appli tuée pendant une déconnexion ou « Effacer cet appareil ») est
 * fini. Rend vrai s'il y en avait un. Un échec laisse le drapeau : il sera
 * repris au démarrage suivant.
 */
export async function terminerEffacement(o: OptionsEffacement): Promise<boolean> {
  const s = await o.session.lire();
  if (!s?.effacement) return false;
  o.diffuser?.({ type: 'effacement' });
  try {
    await o.viderJournal();
    await o.oublier(s.effacement);
    effacerJoueurLocal(o.stockage);
    // L'effacement de l'étape 7 d'une suppression (`effacement` égal à `suppression`, posé après
    // deleteUser, ou par « Vider cet appareil ») : la suppression est finie avec lui.
    await o.session.ecrire({ ...s, ...APRES_EFFACEMENT, ...(s.suppression && s.suppression === s.effacement ? FIN_SUPPRESSION : {}), version: o.version });
  } catch (e) {
    o.diffuser?.({ type: 'reprise' });
    throw e;
  }
  o.diffuser?.({ type: 'efface' });
  return true;
}
