// Google dans l'APK (J1b, lot 7 ; étude docs/etudes/2026-11-07-j1b-conception.md,
// § 4.2, § 3.3 et « Précisions du lot 7 » au § 9) : un nouvel idToken de Google
// à chaque appel, par le plugin natif @capawesome/capacitor-google-sign-in
// 0.1.4 (Credential Manager d'Android, version figée, code lu avant
// l'adoption). Les comptes (src/sync/comptes.ts) le passent à
// googleParJeton (src/sync/google.ts) : GoogleAuthProvider.credential(idToken),
// puis signInWithCredential, linkWithCredential ou
// reauthenticateWithCredential, dans le SDK web, seul état d'auth de l'appli.
//
// Rien du paquet npm n'entre dans le site, pas même un morceau paresseux :
// - son index.js ne fait que registerPlugin('GoogleSignIn', { web }) ; on
//   fait le même registerPlugin, sans partie web, depuis @capacitor/core
//   (déjà chargé dans l'APK pour le bouton retour), et seulement dans l'APK ;
// - sa partie web (redirection OAuth vers accounts.google.com) n'est donc
//   jamais construite : elle ne peut ni se charger ni entrer au précache du
//   service worker (#22) ;
// - du paquet, on ne prend que les types (import type, effacé au build).
// Le natif est branché par `npx cap sync android` (capacitor.settings.gradle).
//
// Lu dans le code du plugin (Android, GoogleSignIn.java) :
// - initialize ne fait que garder le clientId (aucun appel réseau) : une fois
//   par page suffit, refaite après un échec ;
// - signIn pose GetSignInWithGoogleOption (la feuille « Se connecter avec
//   Google », qui propose aussi d'ajouter un compte) ; un nonce n'est posé que
//   s'il est passé. Sans nonce, l'idToken n'a pas de claim nonce, et Firebase
//   prend GoogleAuthProvider.credential(idToken) sans rawNonce ;
// - aucune permission (AndroidManifest vide), aucune télémétrie : le réseau
//   est celui des services Google Play ;
// - erreurs : SIGN_IN_CANCELED (l'annulation, mais aussi un client OAuth
//   Android manquant, que Play signale comme une annulation : README, S19),
//   NO_CREDENTIAL_AVAILABLE, PROVIDER_CONFIGURATION_ERROR ; tout le reste
//   sans code, le message « type: message » de Credential Manager.
import type { GoogleSignInPlugin } from '@capawesome/capacitor-google-sign-in';
import { dansApk } from '../retour-android';
import { ID_CLIENT_WEB } from './firebase';

/** Le plugin, ce qu'on en appelle (tests : un faux). */
export type PluginGoogle = Pick<GoogleSignInPlugin, 'initialize' | 'signIn'>;

/** Les codes de l'appli pour Google dans l'APK, traduits par src/sync/erreurs.ts (textes compte.erreurs). */
export const ERREURS_GOOGLE_APK = {
  /** « Annuler », retour, toucher hors de la feuille : rien à dire, comme la fenêtre fermée du site. */
  annule: 'terramemo/google-annule',
  /** Aucun compte Google sur le téléphone (NO_CREDENTIAL_AVAILABLE). */
  sansCompte: 'terramemo/google-sans-compte',
  /** Services Google Play absents, trop vieux ou désactivés (PROVIDER_CONFIGURATION_ERROR, TYPE_UNSUPPORTED). */
  services: 'terramemo/google-services',
  /**
   * L'appli mal réglée : client OAuth Android absent ou SHA-1 d'une autre clé
   * (S19 : une « annulation » qui dit Account reauth failed), client web
   * refusé (DEVELOPER_ERROR, 10), plugin absent du natif.
   */
  reglage: 'terramemo/google-reglage',
  /** Réseau coupé ou interrompu (GetCredentialInterruptedException : NETWORK_ERROR, TIMEOUT…). */
  reseau: 'terramemo/google-reseau',
  /** Tout le reste. */
  echec: 'terramemo/google-echec',
} as const;

/**
 * Une annulation qui n'en est pas une (S19) : d'après le README du plugin,
 * « [16] Account reauth failed » ou « [8] … UNREGISTERED_ON_API_CONSOLE »
 * quand le client Android manque ; « Developer console is not set up
 * correctly » (10, DEVELOPER_ERROR) et 28444 (piège de Light : clé changée).
 * Une vraie annulation porte « activity is cancelled by the user. »
 * (credentials-play-services-auth), ou le message par défaut du plugin.
 */
const ANNULATION_REGLAGE = /reauth|unregistered|developer|28444|\[10\]|(^|\D)10:/i;
/** Credential Manager : TYPE_INTERRUPTED (codes de Play que l'on peut retenter : NETWORK_ERROR 7, TIMEOUT…), ou un message qui dit le réseau. */
const RESEAU = /TYPE_INTERRUPTED|network|réseau|(^|\D)7:/i;
/** Services Google Play inutilisables (Credential Manager sans fournisseur). */
const SERVICES = /TYPE_UNSUPPORTED|TYPE_PROVIDER_CONFIGURATION/i;
/** Capacitor sans le plugin natif (APK construit sans cap sync), ou plugin pas initialisé. */
const PLUGIN_ABSENT = new Set(['UNIMPLEMENTED', 'UNAVAILABLE']);

/**
 * Le code de l'appli pour une erreur du plugin (`code` : celui du plugin ou de
 * Capacitor, souvent absent ; `message` : brut, en anglais). `enLigne` :
 * navigator.onLine, qui fait d'un échec sans code un échec du réseau.
 */
export function codeGoogleApk(e: unknown, enLigne = true): string {
  const code = typeof (e as { code?: unknown } | null)?.code === 'string' ? (e as { code: string }).code : '';
  const m = (e as { message?: unknown } | null)?.message;
  const message = typeof m === 'string' ? m : '';
  const E = ERREURS_GOOGLE_APK;
  if (code === 'SIGN_IN_CANCELED') return ANNULATION_REGLAGE.test(message) ? E.reglage : E.annule;
  if (code === 'NO_CREDENTIAL_AVAILABLE') return E.sansCompte;
  if (code === 'PROVIDER_CONFIGURATION_ERROR') return E.services;
  if (PLUGIN_ABSENT.has(code) || /not initialized/i.test(message)) return E.reglage;
  if (SERVICES.test(message)) return E.services;
  if (RESEAU.test(message) || !enLigne) return E.reseau;
  if (ANNULATION_REGLAGE.test(message)) return E.reglage;
  return E.echec;
}

/**
 * L'erreur que rend jetonGoogle : le code de l'appli, et pour le pilote
 * (rapport des comptes, message brut) le code et le message du plugin.
 */
export function erreurGoogleApk(e: unknown, enLigne = true): Error & { code: string; plugin: string } {
  const code = codeGoogleApk(e, enLigne);
  const c = (e as { code?: unknown } | null)?.code;
  const m = (e as { message?: unknown } | null)?.message;
  const plugin = `${typeof c === 'string' && c ? c : 'sans code'}: ${typeof m === 'string' ? m : String(e)}`;
  return Object.assign(new Error(`${code} (${plugin})`, { cause: e }), { name: 'ErreurGoogleApk', code, plugin });
}

export interface OptionsGoogleApk {
  /** Défaut : dansApk(). Hors de l'APK, rien ne se charge et l'appel lève. */
  natif?: () => boolean;
  /** Défaut : registerPlugin('GoogleSignIn') de @capacitor/core, chargé au premier appel. */
  plugin?: () => Promise<PluginGoogle>;
  /** Défaut : navigator.onLine. */
  enLigne?: () => boolean;
}

/** Le plugin natif enveloppé, enregistré une fois par page (voir pluginNatif). */
let natifEnregistre: Promise<PluginGoogle> | null = null;

/**
 * Le plugin natif, par le pont de Capacitor (même nom que l'index.js du paquet,
 * sans sa partie web), rendu dans un objet simple, jamais tel quel : le proxy
 * de registerPlugin rend une méthode pour toute propriété, `then` compris
 * (@capacitor/core, createPluginMethodWrapper). Rendu par une fonction async
 * ou par `await`, il serait pris pour une promesse : la résolution appellerait
 * GoogleSignIn.then(resolve, reject), méthode native introuvable, qui rejette
 * à part sans jamais appeler resolve ni reject, et jetonGoogle ne rendrait
 * jamais la main (boutons figés, feuille jamais ouverte). Enregistré une seule
 * fois : un second registerPlugin rend le même proxy, mais avec un
 * avertissement de Capacitor dans la console (après une initialisation manquée).
 */
function pluginNatif(): Promise<PluginGoogle> {
  return (natifEnregistre ??= import('@capacitor/core').then(
    ({ registerPlugin }) => {
      const g = registerPlugin<GoogleSignInPlugin>('GoogleSignIn');
      return { initialize: (x) => g.initialize(x), signIn: (x) => g.signIn(x) };
    },
    (e: unknown) => {
      natifEnregistre = null; // @capacitor/core pas chargé (réseau, morceau absent) : retenté au prochain appel
      throw e;
    },
  ));
}

/**
 * Le jeton Google de l'APK : un nouvel idToken à chaque appel (connexion,
 * lien, réauthentification avant une suppression), le plugin initialisé une
 * seule fois avec ID_CLIENT_WEB (le client web, même sur Android : c'est
 * l'audience de l'idToken que Firebase vérifie ; le client Android, créé par
 * Firebase avec l'appli Android et sa SHA-1, n'est jamais passé).
 */
export function creerJetonGoogle(o: OptionsGoogleApk = {}): () => Promise<string> {
  const natif = o.natif ?? (() => typeof window !== 'undefined' && dansApk());
  const charger = o.plugin ?? pluginNatif;
  const enLigne = o.enLigne ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  let pret: Promise<PluginGoogle> | null = null;
  return async () => {
    if (!natif()) throw erreurGoogleApk(Object.assign(new Error('Google par le plugin : dans l’APK seulement'), { code: 'UNIMPLEMENTED' }));
    const p = (pret ??= (async () => {
      const g = await charger();
      await g.initialize({ clientId: ID_CLIENT_WEB });
      return g;
    })());
    try {
      const g = await p;
      const r = await g.signIn();
      if (!r?.idToken) throw new Error('signIn sans idToken');
      return r.idToken;
    } catch (e) {
      // Une initialisation manquée se refait au prochain appel ; un signIn manqué ne la défait pas.
      if (await p.then(() => false, () => true)) pret = null;
      throw erreurGoogleApk(e, enLigne());
    }
  };
}

/** Celui de la page (main.ts le passe aux comptes, dans l'APK seulement). */
export const jetonGoogle = creerJetonGoogle();
