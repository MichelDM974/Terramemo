// Firebase partagé (src/sync/firebase.ts, lot 0 du J1b) : charger(), compte()
// et uid(), sortis de src/epreuve/classement.ts sans changer le comportement.
// Le SDK est remplacé : rien ne part sur le réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Utilisateur {
  uid: string;
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
    etat.courant = { uid: `anonyme-${etat.creations}` };
    return { user: etat.courant };
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

  it('un échec (hors ligne) n’est pas gardé : la demande suivante réessaie', async () => {
    etat.echecsChargement = 1;
    const { charger } = await module();
    await expect(charger()).rejects.toThrow('hors ligne');
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
