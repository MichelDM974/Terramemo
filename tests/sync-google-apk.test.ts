// Google dans l'APK (J1b, lot 7 ; src/sync/google-apk.ts, étude § 4.2 et
// § 3.3) : le plugin natif remplacé par un faux, puisqu'il ne tourne que dans
// l'APK. Une seule initialisation, avec le client web ; un idToken neuf à
// chaque appel ; rien de chargé hors de l'APK ; chaque erreur du plugin (ses
// codes, et les messages de Credential Manager relevés dans
// credentials-play-services-auth et le README du plugin) traduite en un code
// de l'appli, puis en français. Le vrai plugin : essai réel sur l'A37
// (skill run-terramemo, « Essai réel de Google dans l'APK »).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { codeGoogleApk, creerJetonGoogle, ERREURS_GOOGLE_APK as E, erreurGoogleApk, type PluginGoogle } from '../src/sync/google-apk';
import { traduire } from '../src/sync/erreurs';
import { ID_CLIENT_WEB } from '../src/sync/firebase';
import { textes } from '../src/vues/textes';

/** Une erreur du plugin telle que Capacitor la rend (CapacitorException : message, et code s'il y en a un). */
const rejet = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});

function fauxPlugin() {
  let n = 0;
  const plugin = {
    initialize: vi.fn(async (_o: { clientId: string }) => undefined),
    signIn: vi.fn(async () => ({ idToken: `id-token-${++n}`, userId: 's', email: 'ana@gmail.com', displayName: null, givenName: null, familyName: null, imageUrl: null, accessToken: null, serverAuthCode: null })),
  };
  const charger = vi.fn(async () => plugin as unknown as PluginGoogle);
  return { plugin, charger };
}

describe('creerJetonGoogle : le plugin natif', () => {
  it('initialisé une seule fois, avec le client web ; un idToken neuf à chaque appel', async () => {
    const { plugin, charger } = fauxPlugin();
    const jeton = creerJetonGoogle({ natif: () => true, plugin: charger });
    expect(charger).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([jeton(), jeton()]);
    const c = await jeton();
    expect([a, b, c]).toEqual(['id-token-1', 'id-token-2', 'id-token-3']);
    expect(charger).toHaveBeenCalledOnce();
    expect(plugin.initialize).toHaveBeenCalledOnce();
    expect(plugin.initialize).toHaveBeenCalledWith({ clientId: ID_CLIENT_WEB });
    expect(ID_CLIENT_WEB).toBe('982564163014-cpvnjv34131m5hjv8rgvk67dfedg01ae.apps.googleusercontent.com');
    // Sans nonce : l'idToken n'en porte pas, et Firebase prend GoogleAuthProvider.credential(idToken).
    expect(plugin.signIn.mock.calls.every((x) => (x as unknown[]).length === 0)).toBe(true);
  });

  it('hors de l’APK : rien de chargé, l’appel lève (réglage), jamais de plugin', async () => {
    const { plugin, charger } = fauxPlugin();
    const jeton = creerJetonGoogle({ natif: () => false, plugin: charger });
    await expect(jeton()).rejects.toMatchObject({ code: E.reglage });
    expect(charger).not.toHaveBeenCalled();
    expect(plugin.signIn).not.toHaveBeenCalled();
  });

  it('une initialisation manquée se refait au prochain appel ; un signIn manqué ne la refait pas', async () => {
    const { plugin, charger } = fauxPlugin();
    plugin.initialize.mockRejectedValueOnce(rejet('clientId must be provided.'));
    const jeton = creerJetonGoogle({ natif: () => true, plugin: charger });
    await expect(jeton()).rejects.toMatchObject({ code: E.echec });
    expect(await jeton()).toBe('id-token-1');
    expect(plugin.initialize).toHaveBeenCalledTimes(2);
    plugin.signIn.mockRejectedValueOnce(rejet('The user canceled the sign-in flow.', 'SIGN_IN_CANCELED'));
    await expect(jeton()).rejects.toMatchObject({ code: E.annule });
    expect(await jeton()).toBe('id-token-2');
    expect(plugin.initialize).toHaveBeenCalledTimes(2);
  });

  it('un plugin qui se charge mal (natif absent) : réglage, et réessayé ensuite', async () => {
    const { plugin } = fauxPlugin();
    const charger = vi.fn<() => Promise<PluginGoogle>>().mockRejectedValueOnce(rejet('"GoogleSignIn" plugin is not implemented on android', 'UNIMPLEMENTED')).mockResolvedValue(plugin as unknown as PluginGoogle);
    const jeton = creerJetonGoogle({ natif: () => true, plugin: charger });
    await expect(jeton()).rejects.toMatchObject({ code: E.reglage });
    expect(await jeton()).toBe('id-token-1');
  });

  it('une réponse sans idToken : un échec, pas un jeton vide', async () => {
    const { plugin, charger } = fauxPlugin();
    plugin.signIn.mockResolvedValueOnce({ idToken: '' } as never);
    await expect(creerJetonGoogle({ natif: () => true, plugin: charger })()).rejects.toMatchObject({ code: E.echec });
  });

  it('hors ligne, un échec sans code est un échec du réseau', async () => {
    const { plugin, charger } = fauxPlugin();
    plugin.signIn.mockRejectedValue(rejet('androidx.credentials.TYPE_UNKNOWN'));
    let enLigne = true;
    const jeton = creerJetonGoogle({ natif: () => true, plugin: charger, enLigne: () => enLigne });
    await expect(jeton()).rejects.toMatchObject({ code: E.echec });
    enLigne = false;
    await expect(jeton()).rejects.toMatchObject({ code: E.reseau });
  });
});

describe('codeGoogleApk : chaque erreur du plugin, un code de l’appli', () => {
  it('le tableau', () => {
    const cas: [Error, string][] = [
      // Annulation : le message par défaut du plugin, et celui de credentials-play-services-auth (feuille refermée).
      [rejet('The user canceled the sign-in flow.', 'SIGN_IN_CANCELED'), E.annule],
      [rejet('activity is cancelled by the user.', 'SIGN_IN_CANCELED'), E.annule],
      // S19 (README du plugin) : un client Android manquant, que Play signale en annulation.
      [rejet('[16] Account reauth failed.', 'SIGN_IN_CANCELED'), E.reglage],
      [rejet('16: Account reauth failed.', 'SIGN_IN_CANCELED'), E.reglage],
      [rejet('[8] Unknown error [status=UNREGISTERED_ON_API_CONSOLE].', 'SIGN_IN_CANCELED'), E.reglage],
      [rejet('10: Developer console is not set up correctly.', 'SIGN_IN_CANCELED'), E.reglage],
      [rejet('No Google account is available on this device.', 'NO_CREDENTIAL_AVAILABLE'), E.sansCompte],
      [rejet('The credential provider is not configured correctly.', 'PROVIDER_CONFIGURATION_ERROR'), E.services],
      // Sans code : le type de Credential Manager en tête du message (createCredentialException).
      [rejet('android.credentials.GetCredentialException.TYPE_INTERRUPTED: 7: '), E.reseau],
      [rejet('android.credentials.GetCredentialException.TYPE_UNSUPPORTED'), E.services],
      [rejet('[28444] Developer console is not set up correctly.'), E.reglage],
      [rejet('Google Sign-In is not initialized. Call initialize() first.'), E.reglage],
      [rejet('"GoogleSignIn" plugin is not implemented on android', 'UNIMPLEMENTED'), E.reglage],
      [rejet('androidx.credentials.TYPE_UNKNOWN: boom'), E.echec],
      [rejet('Unexpected credential type.'), E.echec],
      [rejet('17: API unavailable'), E.echec],
    ];
    for (const [e, code] of cas) expect([e.message, codeGoogleApk(e)]).toEqual([e.message, code]);
    expect(codeGoogleApk(null)).toBe(E.echec);
    expect(codeGoogleApk('chaîne')).toBe(E.echec);
  });

  it('traduites : l’annulation silencieuse, comme la fenêtre fermée du site ; les autres en français, jamais le message du plugin', () => {
    expect(traduire(erreurGoogleApk(rejet('activity is cancelled by the user.', 'SIGN_IN_CANCELED'))).texte).toBeNull();
    const attendus: Record<string, string> = {
      [E.sansCompte]: "Aucun compte Google sur ce téléphone : ajoute-le dans les réglages d'Android (Comptes), ou connecte-toi par e-mail.",
      [E.services]: 'Services Google Play absents ou à mettre à jour : mets-les à jour depuis le Play Store, ou connecte-toi par e-mail.',
      [E.reglage]: "Connexion Google impossible (réglage de l'appli) : connecte-toi par e-mail en attendant.",
      [E.reseau]: 'Réseau injoignable : touche encore le bouton de Google une fois en ligne.',
      [E.echec]: 'Connexion Google impossible : réessaie plus tard.',
    };
    for (const [code, texte] of Object.entries(attendus)) {
      expect(textes.compte.erreurs[code as keyof typeof textes.compte.erreurs], code).toBe(texte);
      const e = Object.assign(new Error('Account reauth failed'), { code });
      expect(traduire(e).texte, code).toBe(texte);
    }
    // Chaque code de l'appli a son texte, sauf l'annulation (silencieuse).
    for (const code of Object.values(E)) if (code !== E.annule) expect(textes.compte.erreurs, code).toHaveProperty([code]);
  });

  it('le pilote garde le code et le message du plugin (rapport des comptes), l’écran ne les montre pas', () => {
    const e = erreurGoogleApk(rejet('[16] Account reauth failed.', 'SIGN_IN_CANCELED'));
    expect(e).toMatchObject({ code: E.reglage, plugin: 'SIGN_IN_CANCELED: [16] Account reauth failed.', name: 'ErreurGoogleApk' });
    const t = traduire(e);
    expect(t.brut).toContain('[16] Account reauth failed.');
    expect(t.texte).not.toMatch(/reauth/);
    expect(erreurGoogleApk(rejet('boom')).plugin).toBe('sans code: boom');
  });
});

describe('isolation du site : le plugin jamais importé', () => {
  it('dans src/, le paquet n’apparaît qu’en import type (effacé au build) ; registerPlugin de @capacitor/core, chargé à la demande', () => {
    const fichiers = (readdirSync('src', { recursive: true }) as string[]).filter((f) => /\.(ts|js|mts)$/.test(f));
    const lignes = fichiers.flatMap((f) =>
      readFileSync(join('src', f), 'utf8')
        .split('\n')
        .filter((l) => l.includes('@capawesome/capacitor-google-sign-in') && /\bimport\b|\brequire\b/.test(l))
        .map((l) => [f, l.trim()] as const),
    );
    expect(lignes).toEqual([['sync/google-apk.ts', "import type { GoogleSignInPlugin } from '@capawesome/capacitor-google-sign-in';"]]);
    const code = readFileSync('src/sync/google-apk.ts', 'utf8');
    // @capacitor/core chargé à la demande, jamais en import statique (le chemin réel : tests/sync-google-apk-natif.test.ts).
    expect(code).toMatch(/\bimport\(\s*'@capacitor\/core'\s*\)/);
    expect(code).not.toMatch(/^import\s+(?!type\b)[^;]*'@capacitor\/core'/m);
    expect(code).toContain("registerPlugin<GoogleSignInPlugin>('GoogleSignIn')");
    // Le module n'est demandé qu'à un endroit de main.ts (jetonGoogle, passé aux comptes dans l'APK seulement) ;
    // que le site ne l'appelle jamais, c'est le comportement des comptes (tests/sync-comptes.test.ts,
    // « sur le site, un jetonGoogle… »), et dist le prouve (tests/credits-vue.test.ts, cartes de source).
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main.match(/import\(\s*'\.\/sync\/google-apk'\s*\)/g)?.length).toBe(1);
  });
});
