// Firebase partagé (src/sync/firebase.ts, lot 0 du J1b) : charger(), compte()
// et uid(), sortis de src/epreuve/classement.ts sans changer le comportement.
// Le SDK est remplacé : rien ne part sur le réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Utilisateur {
  uid: string;
  isAnonymous?: boolean;
  /** Le jeton : rendu, ou l'erreur du rafraîchissement (compte supprimé côté serveur, hors ligne). */
  getIdToken?: () => Promise<string>;
}
const etat = {
  courant: null as Utilisateur | null,
  /** Le compte que authStateReady restaure (persistance du navigateur), après un délai. */
  restaure: null as Utilisateur | null,
  creations: 0,
  echecs: 0,
  echecsChargement: 0,
  chargements: 0,
  emulateurs: [] as string[],
};

vi.mock('firebase/app', () => ({
  initializeApp: (config: unknown) => {
    etat.chargements++;
    if (etat.echecsChargement > 0) {
      etat.echecsChargement--;
      throw new Error('morceau du SDK introuvable (hors ligne)');
    }
    return { config };
  },
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    languageCode: null as string | null,
    get currentUser() {
      return etat.courant;
    },
    authStateReady: () =>
      new Promise<void>((ok) =>
        setTimeout(() => {
          if (etat.restaure) etat.courant = etat.restaure;
          ok();
        }, 5),
      ),
  }),
  signInAnonymously: async () => {
    await new Promise((r) => setTimeout(r, 5));
    if (etat.echecs > 0) {
      etat.echecs--;
      throw Object.assign(new Error('hors ligne'), { code: 'auth/network-request-failed' });
    }
    etat.creations++;
    etat.courant = { uid: `anonyme-${etat.creations}`, isAnonymous: true, getIdToken: async () => 'jeton' };
    return { user: etat.courant };
  },
  signOut: async () => {
    etat.courant = null;
  },
  connectAuthEmulator: (_a: unknown, url: string) => etat.emulateurs.push(url),
}));
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: () => ({}),
  connectFirestoreEmulator: (_db: unknown, hote: string, port: number) => etat.emulateurs.push(`${hote}:${port}`),
}));

async function module() {
  vi.resetModules();
  return import('../src/sync/firebase');
}

beforeEach(() => {
  Object.assign(etat, { courant: null, restaure: null, creations: 0, echecs: 0, echecsChargement: 0, chargements: 0, emulateurs: [] });
  vi.stubGlobal('location', { search: '' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('erreurReseau (#25)', () => {
  it('le réseau seul : SDK pas téléchargé, Auth hors ligne, Firestore injoignable (fetch échoué = unknown dans Firestore lite)', async () => {
    const { erreurReseau, SDK_INDISPONIBLE } = await module();
    for (const code of [SDK_INDISPONIBLE, 'auth/network-request-failed', 'unavailable', 'deadline-exceeded', 'unknown']) expect([code, erreurReseau({ code })]).toEqual([code, true]);
    for (const code of ['resource-exhausted', 'auth/too-many-requests', 'auth/admin-restricted-operation', 'permission-denied', 'internal', 'invalid-argument'])
      expect([code, erreurReseau({ code })]).toEqual([code, false]);
    for (const e of [new Error('bogue'), null, undefined, 'unknown', { code: 42 }]) expect(erreurReseau(e)).toBe(false);
  });
});

describe('charger', () => {
  it('une seule initialisation pour la page, Auth en français', async () => {
    const { charger, LANGUE_AUTH } = await module();
    const [a, b] = await Promise.all([charger(), charger()]);
    expect(a).toBe(b);
    expect(await charger()).toBe(a);
    expect(etat.chargements).toBe(1);
    expect(LANGUE_AUTH).toBe('fr');
    expect(a.a.languageCode).toBe('fr');
    expect(etat.emulateurs).toEqual([]);
  });

  it('un échec (hors ligne) n’est pas gardé : la demande suivante réessaie ; sans code, il porte SDK_INDISPONIBLE, une erreur du réseau (#25)', async () => {
    etat.echecsChargement = 1;
    const { charger, erreurReseau, SDK_INDISPONIBLE } = await module();
    const e = await charger().then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toMatchObject({ code: SDK_INDISPONIBLE, message: 'morceau du SDK introuvable (hors ligne)' });
    expect((e as Error).cause).toBeInstanceOf(Error);
    expect(erreurReseau(e)).toBe(true);
    await expect(charger()).resolves.toBeTruthy();
    expect(etat.chargements).toBe(2);
  });

  it('attend que la session gardée soit relue (authStateReady)', async () => {
    etat.restaure = { uid: 'garde' };
    const { charger, compte, uid } = await module();
    expect(await uid()).toBe('garde');
    expect(await compte(await charger())).toBe('garde');
    expect(etat.creations).toBe(0);
  });

  it('?emulateurs (serveur de dev) : Auth 8063 et Firestore 8062', async () => {
    vi.stubGlobal('location', { search: '?emulateurs' });
    const { charger } = await module();
    await charger();
    expect(etat.emulateurs).toEqual(['http://127.0.0.1:8063', '127.0.0.1:8062']);
  });
});

describe('compte', () => {
  it('garde le compte du navigateur sans en créer', async () => {
    etat.courant = { uid: 'garde' };
    const { charger, compte } = await module();
    expect(await compte(await charger())).toBe('garde');
    expect(etat.creations).toBe(0);
  });

  it('un seul anonyme pour des publications parties ensemble', async () => {
    const { charger, compte } = await module();
    const s = await charger();
    const uids = await Promise.all([compte(s), compte(s), compte(s)]);
    expect(uids).toEqual(['anonyme-1', 'anonyme-1', 'anonyme-1']);
    expect(etat.creations).toBe(1);
    expect(await compte(s)).toBe('anonyme-1');
  });

  it('après une déconnexion, un anonyme neuf (pas l’uid d’avant)', async () => {
    const { charger, compte } = await module();
    const s = await charger();
    expect(await compte(s)).toBe('anonyme-1');
    etat.courant = null; // signOut
    expect(await compte(s)).toBe('anonyme-2');
    expect(etat.creations).toBe(2);
  });

  it('une création échouée (hors ligne) se retente à la demande suivante', async () => {
    etat.echecs = 1;
    const { charger, compte } = await module();
    const s = await charger();
    await expect(compte(s)).rejects.toThrow('hors ligne');
    expect(await compte(s)).toBe('anonyme-1');
  });
});

describe('compte : invité anonyme supprimé par Firebase (30 jours)', () => {
  const refus = (code: string) => async () => Promise.reject(Object.assign(new Error(code), { code }));

  it('son jeton ne se rafraîchit plus : un anonyme neuf le remplace', async () => {
    const { charger, compte } = await module();
    const s = await charger();
    for (const code of ['auth/user-token-expired', 'auth/invalid-refresh-token']) {
      etat.courant = { uid: 'disparu', isAnonymous: true, getIdToken: refus(code) };
      const avant = etat.creations;
      expect(await compte(s), code).toBe(`anonyme-${avant + 1}`);
    }
  });

  it('jeton en cache : l’anonyme reste, sans création', async () => {
    etat.courant = { uid: 'garde', isAnonymous: true, getIdToken: async () => 'jeton' };
    const { charger, compte } = await module();
    expect(await compte(await charger())).toBe('garde');
    expect(etat.creations).toBe(0);
  });

  it('hors ligne : l’anonyme n’est pas remplacé, l’échec remonte', async () => {
    etat.courant = { uid: 'garde', isAnonymous: true, getIdToken: refus('auth/network-request-failed') };
    const { charger, compte } = await module();
    await expect(compte(await charger())).rejects.toMatchObject({ code: 'auth/network-request-failed' });
    expect(etat.courant?.uid).toBe('garde');
    expect(etat.creations).toBe(0);
  });

  it('des publications parties ensemble : un seul anonyme neuf', async () => {
    etat.courant = { uid: 'disparu', isAnonymous: true, getIdToken: refus('auth/user-token-expired') };
    const { charger, compte } = await module();
    const s = await charger();
    expect(await Promise.all([compte(s), compte(s), compte(s)])).toEqual(['anonyme-1', 'anonyme-1', 'anonyme-1']);
    expect(etat.creations).toBe(1);
  });
});

describe('uid', () => {
  it('null sans compte, et n’en crée pas', async () => {
    const { uid } = await module();
    expect(await uid()).toBeNull();
    expect(etat.creations).toBe(0);
  });

  it('l’uid du compte gardé, anonyme compris', async () => {
    const { charger, compte, uid } = await module();
    await compte(await charger());
    expect(await uid()).toBe('anonyme-1');
  });
});
