// Google dans l'APK (J1b, lot 7 ; src/sync/google-apk.ts, pluginNatif) : le
// chemin par défaut, registerPlugin de @capacitor/core, avec un proxy qui imite
// celui de Capacitor 8 (createPluginMethodWrapper : une méthode pour toute
// propriété, `then` compris). Rendu tel quel par une fonction async, ce proxy
// serait pris pour une promesse et jetonGoogle ne rendrait jamais la main
// (relecture du lot 7). Fichier à part : le faux @capacitor/core ne vaut que
// pour lui.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const natif = vi.hoisted(() => ({
  initialize: vi.fn(async (_o: { clientId: string }) => undefined),
  signIn: vi.fn(async () => ({ idToken: 'id-token-natif' })),
  then: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(
    () =>
      new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === 'initialize') return natif.initialize;
            if (prop === 'signIn') return natif.signIn;
            // Toute autre propriété : une méthode native introuvable, qui ne règle jamais la promesse de l'appelant.
            if (prop === 'then') natif.then();
            return () => new Promise(() => {});
          },
        },
      ),
  ),
}));

import { registerPlugin } from '@capacitor/core';
import { creerJetonGoogle, ERREURS_GOOGLE_APK as E } from '../src/sync/google-apk';
import { ID_CLIENT_WEB } from '../src/sync/firebase';

/** La promesse réglée dans le délai, ou l'échec du test (une promesse pendante est le défaut cherché). */
const dansLeDelai = <T>(p: Promise<T>, ms = 1000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`pendante après ${ms} ms`)), ms))]);

describe('pluginNatif : le proxy de Capacitor jamais pris pour une promesse', () => {
  beforeEach(() => {
    natif.initialize.mockClear();
    natif.signIn.mockClear();
    natif.then.mockClear();
  });

  it('jetonGoogle se règle avec l’idToken, sans lire `then` du proxy ; registerPlugin une seule fois, même après une initialisation manquée', async () => {
    natif.initialize.mockRejectedValueOnce(Object.assign(new Error('clientId must be provided.'), {}));
    const jeton = creerJetonGoogle({ natif: () => true });
    await expect(dansLeDelai(jeton())).rejects.toMatchObject({ code: E.echec });
    expect(await dansLeDelai(jeton())).toBe('id-token-natif');
    expect(await dansLeDelai(creerJetonGoogle({ natif: () => true })())).toBe('id-token-natif');
    expect(natif.then).not.toHaveBeenCalled();
    expect(natif.initialize).toHaveBeenCalledWith({ clientId: ID_CLIENT_WEB });
    // Un second registerPlugin rendrait le même proxy, avec un avertissement de Capacitor dans la console.
    expect(registerPlugin).toHaveBeenCalledOnce();
    expect(registerPlugin).toHaveBeenCalledWith('GoogleSignIn');
  });
});
