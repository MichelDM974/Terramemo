// Erreurs des comptes en français (étude du J1b, § 3.3) : textes de
// textes.fr.json (compte.erreurs), repris clé par clé de ceux d'une autre
// de mes applis, plus ceux du J1b. Le message anglais brut n'est jamais affiché : il va
// au pilote (window.terramemo.comptes()). Sans dépendance à Firebase : la vue
// Compte et les tests s'en servent sans charger le SDK.
import { remplir, textes } from '../vues/textes';

const E: Readonly<Record<string, string>> = textes.compte.erreurs;

/**
 * Codes qui ne s'affichent pas : un retour silencieux (fenêtre Google fermée)
 * ou un cas que l'appelant traite lui-même (lien Google à un compte qui
 * existe, § 2.3 ; session perdue, § 2.5).
 */
const SILENCIEUX: ReadonlySet<string> = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  // « Annuler » sur l'écran de consentement de Google (première connexion), ou « Accès bloqué »
  // refermé : un refus, pas une erreur.
  'auth/user-cancelled',
  'auth/credential-already-in-use',
  'auth/user-token-expired',
  // « Annuler » à la question de fusion (§ 2.3) : retour au formulaire, sans message.
  'terramemo/connexion-annulee',
  // La feuille de Google refermée dans l'APK (src/sync/google-apk.ts, lot 7) : comme la fenêtre du site.
  'terramemo/google-annule',
]);

export interface ErreurTraduite {
  /** Le texte à montrer ; null : rien à montrer. */
  texte: string | null;
  /** Le code d'origine (`auth/…`, `permission-denied`, `terramemo/…`), ou '' sans code. */
  code: string;
  /** Le message brut, pour le pilote seulement. */
  brut: string;
}

/** Code d'une erreur de Firebase (Auth : « auth/… » ; Firestore lite : « permission-denied »…) ou de l'appli (« terramemo/… »). */
export function codeErreur(err: unknown): string {
  const c = (err as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c : '';
}

/**
 * L'adresse qu'une erreur de Firebase Auth porte (`customData.email`) :
 * auth/account-exists-with-different-credential, celle du compte à mot de
 * passe qu'un compte Google rencontre (§ 2.3). null sans adresse.
 */
export function adresseErreur(err: unknown): string | null {
  const a = (err as { customData?: { email?: unknown } } | null)?.customData?.email;
  return typeof a === 'string' && a ? a : null;
}

function messageBrut(err: unknown): string {
  if (err instanceof Error) return err.message;
  const m = (err as { message?: unknown } | null)?.message;
  return typeof m === 'string' ? m : String(err);
}

/**
 * Le prochain minuit à Los Angeles : la remise à zéro des quotas de Firebase
 * (§ 3.3 et § 5.2), 12 h à La Réunion l'hiver boréal, 11 h l'été.
 */
export function remiseQuota(maintenant: Date = new Date()): Date {
  const la = (d: Date) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(d)
        .map((x) => [x.type, x.value]),
    );
    return Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  };
  // Les secondes écoulées depuis minuit à Los Angeles, puis la même chose au minuit visé :
  // un changement d'heure dans l'intervalle décale d'une heure, corrigé une fois.
  let minuit = new Date(maintenant.getTime() + (86400 - la(maintenant)) * 1000);
  const ecart = la(minuit);
  if (ecart !== 0) minuit = new Date(minuit.getTime() + (ecart > 43200 ? 86400 - ecart : -ecart) * 1000);
  return minuit;
}

/**
 * Minuit à Los Angeles en heure de l'appareil : « 12 h » à La Réunion l'hiver
 * boréal, « 11 h » l'été. `fuseau` : celui de l'affichage (défaut : celui de
 * l'appareil).
 */
export function heureRemiseQuota(maintenant: Date = new Date(), fuseau?: string): string {
  const minuit = remiseQuota(maintenant);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(fuseau ? { timeZone: fuseau } : {}) })
      .formatToParts(minuit)
      .map((x) => [x.type, x.value]),
  );
  const h = Number(p.hour);
  return p.minute === '00' ? `${h} h` : `${h} h ${p.minute}`;
}

/**
 * Le texte d'une erreur : `auth/*`, puis Firestore, puis l'appli (dont le
 * plugin Google de l'APK, traduit en `terramemo/google-…` par
 * src/sync/google-apk.ts, lot 7), puis « Erreur inattendue ({code}) ». `quand` et `fuseau` : pour l'heure de
 * remise du quota (tests).
 */
export function traduire(err: unknown, quand: Date = new Date(), fuseau?: string): ErreurTraduite {
  const code = codeErreur(err);
  const brut = messageBrut(err);
  if (SILENCIEUX.has(code)) return { texte: null, code, brut };
  const modele = E[code] ?? E[code.replace(/^firestore\//, '')];
  if (modele !== undefined) return { texte: remplir(modele, { heure: heureRemiseQuota(quand, fuseau), adresse: adresseErreur(err) ?? textes.compte.google_compte_attendu }), code, brut };
  return { texte: remplir(E.inattendue!, { code: code || 'sans code' }), code, brut };
}
