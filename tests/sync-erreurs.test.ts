// Erreurs des comptes en français (src/sync/erreurs.ts, étude du J1b § 3.3) :
// chaque code du tableau a son texte, les cas silencieux ne montrent rien, le
// message anglais n'est jamais affiché, et l'heure de remise du quota est
// minuit à Los Angeles dans le fuseau de l'appareil.
import { describe, expect, it } from 'vitest';
import { adresseErreur, heureRemiseQuota, traduire } from '../src/sync/erreurs';
import { textes } from '../src/vues/textes';

const err = (code: string, message = `Firebase: Error (${code}).`) => Object.assign(new Error(message), { code });
const HIVER = new Date(Date.UTC(2026, 10, 7, 6)); // 7/11/2026, 10 h à La Réunion (Los Angeles en PST)
const ETE = new Date(Date.UTC(2026, 6, 7, 6)); // juillet (Los Angeles en PDT)

describe('traduire', () => {
  it('le tableau du § 3.3, repris de Light', () => {
    const attendus: Record<string, string> = {
      'auth/invalid-credential': 'Adresse ou mot de passe incorrect',
      'auth/user-not-found': 'Adresse ou mot de passe incorrect',
      'auth/wrong-password': 'Adresse ou mot de passe incorrect',
      'auth/invalid-email': 'Adresse e-mail invalide',
      'auth/missing-email': 'Saisis ton adresse e-mail',
      'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse : connecte-toi',
      'auth/weak-password': 'Mot de passe trop faible (8 caractères au moins)',
      // Politique de mot de passe du projet (ENFORCE, 8 caractères au moins) : PASSWORD_DOES_NOT_MEET_REQUIREMENTS,
      // dit comme la vérification locale (terramemo/mdp-court).
      'auth/password-does-not-meet-requirements': 'Mot de passe : 8 caractères au moins',
      'terramemo/mdp-court': 'Mot de passe : 8 caractères au moins',
      'auth/too-many-requests': 'Trop de tentatives : réessaie dans quelques minutes.',
      'auth/network-request-failed': 'Réseau injoignable',
      'auth/popup-blocked': 'Fenêtre de Google bloquée : touche encore le bouton (ou autorise les fenêtres pour ce site).',
      'auth/user-disabled': 'Compte désactivé',
      'permission-denied': 'Action non autorisée.',
      unavailable: 'Serveur injoignable',
      'auth/requires-recent-login': 'Pour ta sécurité, reconnecte-toi avant de continuer',
      'auth/provider-already-linked': 'Ce compte est déjà relié à ce moyen de connexion',
      'auth/account-exists-with-different-credential': 'Ce compte se connecte par mot de passe : connecte-toi avec ton adresse',
      'auth/operation-not-allowed': "Ce moyen de connexion n'est pas encore ouvert",
      'auth/unauthorized-domain': 'Connexion impossible depuis cette adresse du site',
      // Réauthentification Google avant une suppression (§ 7.1) : un autre compte Google choisi dans la fenêtre.
      'auth/user-mismatch': "Ce n'est pas le compte connecté : choisis le bon compte dans la fenêtre de Google.",
      NO_CREDENTIAL_AVAILABLE: 'Aucun compte Google sur ce téléphone.',
      PROVIDER_CONFIGURATION_ERROR: 'Services Google Play absents ou à mettre à jour.',
    };
    for (const [code, texte] of Object.entries(attendus)) expect(traduire(err(code)).texte, code).toBe(texte);
  });

  it('les cas silencieux ne montrent rien, mais gardent le code et le message brut', () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled', 'auth/credential-already-in-use', 'auth/user-token-expired']) {
      const t = traduire(err(code));
      expect(t.texte, code).toBeNull();
      expect(t.code).toBe(code);
      expect(t.brut).toMatch(/Firebase/);
    }
  });

  it('plugin Google : l’annulation par défaut est silencieuse, un autre message dit le réglage', () => {
    expect(traduire(err('SIGN_IN_CANCELED', 'The user canceled the sign-in flow.')).texte).toBeNull();
    expect(traduire(err('SIGN_IN_CANCELED', 'Account reauth failed.')).texte).toBe("Connexion Google impossible (réglage de l'appli).");
    expect(traduire(err('UNKNOWN_ERROR', 'boom')).texte).toBe('Connexion Google impossible : réessaie plus tard.');
  });

  it('quota du jour : l’heure de remise à La Réunion, 12 h l’hiver boréal et 11 h l’été', () => {
    expect(traduire(err('auth/quota-exceeded'), HIVER, 'Indian/Reunion').texte).toBe('Limite du jour atteinte : réessaie après 12 h.');
    expect(traduire(err('resource-exhausted'), ETE, 'Indian/Reunion').texte).toBe('Limite du jour atteinte : réessaie après 11 h.');
  });

  it('un code inconnu : « Erreur inattendue (code) », jamais le message anglais', () => {
    const t = traduire(err('auth/internal-error', 'Firebase: something broke'));
    expect(t.texte).toBe('Erreur inattendue (auth/internal-error)');
    expect(t.texte).not.toMatch(/broke/);
    expect(traduire(new Error('sans code')).texte).toBe('Erreur inattendue (sans code)');
    expect(traduire(err('not-found')).texte).toBe('Erreur inattendue (not-found)');
  });

  it('les codes propres à l’appli', () => {
    expect(traduire(err('terramemo/mdp-court')).texte).toBe('Mot de passe : 8 caractères au moins');
    expect(traduire(err('terramemo/mdp-actuel-faux')).texte).toBe('Mot de passe actuel incorrect');
    expect(traduire(err('terramemo/mdp-google')).texte).toBe('Ce compte se connecte avec Google, sans mot de passe');
    expect(traduire(err('terramemo/suppression-engagee')).texte).toBe("La suppression est déjà engagée : elle ne s'annule plus, reprends-la.");
  });

  it('Google sur le site (lot 6) : navigateur qui refuse la fenêtre, lien à refaire, APK sans plugin', () => {
    expect(traduire(err('auth/web-storage-unsupported')).texte).toBe("Ce navigateur refuse la fenêtre de Google (données de sites bloquées ?) : passe par l'e-mail.");
    // Sans nom de bouton : il s'appelle « Se reconnecter avec Google » sur l'écran de la session perdue.
    expect(traduire(err('terramemo/google-reessayer')).texte).toBe('Connexion Google interrompue : touche encore le bouton de Google.');
    expect(traduire(err('terramemo/google-apk-bientot')).texte).toBe("Google arrive bientôt dans l'appli : connecte-toi par e-mail, ou sur le site.");
  });

  it('le compte à choisir dans la fenêtre de Google est nommé (réauthentification, reprise d’une suppression)', () => {
    const avec = (code: string) => Object.assign(err(code), { customData: { email: 'ana@gmail.com' } });
    expect(traduire(avec('auth/user-mismatch')).texte).toBe("Ce n'est pas le compte connecté : choisis ana@gmail.com dans la fenêtre de Google.");
    expect(traduire(avec('terramemo/google-autre-compte')).texte).toBe("Ce n'est pas le compte à supprimer : choisis ana@gmail.com dans la fenêtre de Google.");
    expect(traduire(err('terramemo/google-autre-compte')).texte).toBe("Ce n'est pas le compte à supprimer : choisis le bon compte dans la fenêtre de Google.");
  });

  it('adresseErreur : l’adresse que Firebase met dans l’erreur (compte à mot de passe rencontré par Google)', () => {
    const e = Object.assign(err('auth/account-exists-with-different-credential'), { customData: { appName: '[DEFAULT]', email: 'ana@yahoo.fr' } });
    expect(adresseErreur(e)).toBe('ana@yahoo.fr');
    expect(adresseErreur(err('auth/popup-blocked'))).toBeNull();
    expect(adresseErreur(null)).toBeNull();
  });

  it('chaque texte de compte.erreurs est atteint par son code', () => {
    for (const code of Object.keys(textes.compte.erreurs).filter((c) => c !== 'inattendue' && c !== 'plugin'))
      expect(traduire(err(code)).texte, code).not.toMatch(/inattendue/);
  });
});

describe('heureRemiseQuota', () => {
  it('minuit à Los Angeles, dans le fuseau donné', () => {
    expect(heureRemiseQuota(HIVER, 'Indian/Reunion')).toBe('12 h');
    expect(heureRemiseQuota(ETE, 'Indian/Reunion')).toBe('11 h');
    expect(heureRemiseQuota(HIVER, 'America/Los_Angeles')).toBe('0 h');
    expect(heureRemiseQuota(HIVER, 'Asia/Kolkata')).toBe('13 h 30');
  });

  it('juste avant et juste après minuit à Los Angeles', () => {
    // 23 h 59 à Los Angeles (PST) : remise dans une minute, à 12 h à La Réunion.
    expect(heureRemiseQuota(new Date(Date.UTC(2026, 10, 8, 7, 59)), 'Indian/Reunion')).toBe('12 h');
    // 0 h 01 : la prochaine est le lendemain, toujours 12 h.
    expect(heureRemiseQuota(new Date(Date.UTC(2026, 10, 8, 8, 1)), 'Indian/Reunion')).toBe('12 h');
  });

  it('le jour du changement d’heure à Los Angeles', () => {
    // 1/11/2026 : passage à l'heure d'hiver (PDT → PST) ; la remise suivante est à 8 h UTC, 12 h à La Réunion.
    expect(heureRemiseQuota(new Date(Date.UTC(2026, 10, 1, 12)), 'Indian/Reunion')).toBe('12 h');
    // 8/03/2026 : passage à l'heure d'été ; minuit du 9 est à 7 h UTC, 11 h à La Réunion.
    expect(heureRemiseQuota(new Date(Date.UTC(2026, 2, 8, 12)), 'Indian/Reunion')).toBe('11 h');
  });
});
