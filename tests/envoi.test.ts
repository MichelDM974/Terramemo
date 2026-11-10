// Envoi des séances (J1b, lot 3 ; étude § 5.2 et § 9) sur les émulateurs
// Auth et Firestore (`npm run test:comptes`) : le vrai SDK, les vrais
// src/sync/comptes.ts et src/sync/envoi.ts, la vraie mémoire de l'appareil,
// les vraies règles (essai() ouvert ; celles du dépôt, fermées, pour le
// refus). Critère du lot 3 : rien pour un anonyme ; au lien, le journal part
// (uid gardé) ; aller-retour exact ; renvoi sans doublon ; hors ligne, puis
// au retour du réseau ; refus des règles gardé, puis relancé. Sauté sans
// émulateurs (npm test).
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp } from 'firebase/app';
import * as authM from 'firebase/auth';
import * as fsM from 'firebase/firestore/lite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { depotMemoire } from '../src/journal/depot';
import { ouvrirMemoire, type Memoire } from '../src/journal/memoire';
import { uuid } from '../src/journal/uuid';
import type { Evenement } from '../src/srs/journal';
import { creerComptes } from '../src/sync/comptes';
import { depotLotsMemoire, type DepotLots } from '../src/sync/depot-lots';
import { creerEnvoi, serveurFirestore } from '../src/sync/envoi';
import { deplier, type DocLot } from '../src/sync/lots';
import { depotSessionMemoire } from '../src/sync/session';
import { REGLES, reglesAvecEssai } from './regles-essai';

const hoteAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const hoteFs = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-terramemo';

class Stockage {
  readonly m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let n = 0;
/** Un appareil : son appli Firebase, sa mémoire (journal), sa session, ses comptes, son envoi branché comme dans main.ts. */
function appareil(lots: DepotLots = depotLotsMemoire(), version = 'essai') {
  const app = initializeApp({ apiKey: 'cle-essai', authDomain: 'localhost', projectId: PROJET }, `envoi-${++n}`);
  const a = authM.getAuth(app);
  authM.connectAuthEmulator(a, `http://${hoteAuth}`, { disableWarnings: true });
  const db = fsM.getFirestore(app);
  const [host, port] = (hoteFs ?? '').split(':');
  fsM.connectFirestoreEmulator(db, host!, Number(port));
  const service = async () => ({ m: { auth: authM, fs: fsM }, db, a });
  const stockage = new Stockage();
  const comptes = creerComptes({ session: depotSessionMemoire(), version, service, stockage: () => stockage, coupee: () => false, republier: async () => undefined });
  const appareilId = uuid();
  const memoire: Memoire = ouvrirMemoire({ depot: depotMemoire(), appareil: appareilId, horloge: () => ({ ts: Date.now(), tz: 240 }) });
  const envoi = creerEnvoi({
    journal: { tous: () => memoire.tous(), attendre: () => memoire.ecrire([]), seanceEnCours: () => memoire.seanceEnCours() },
    lots,
    version,
    coupee: () => false,
    verrou: (f) => f(),
    compte: async () => {
      const x = await comptes.pourSynchro();
      return x && { uid: x.uid, serveur: serveurFirestore(x.service) };
    },
  });
  const jetons: Promise<unknown>[] = [];
  comptes.surJeton(() => void jetons.push(envoi.declencher('jeton')));
  /** Une séance de `k` réponses, close. */
  async function jouer(k: number): Promise<Evenement[]> {
    const seance = memoire.nouvelId();
    const evts: Evenement[] = Array.from({ length: k }, (_, i) => ({
      v: 1,
      id: memoire.nouvelId(),
      appareil: appareilId,
      ts: Date.now() + i,
      tz: 240,
      seance,
      type: 'reponse',
      fiche: i % 2 ? 'pays:FRA:localiser' : 'pays:ITA:nommer',
      mode: i % 3 ? 'revision' : 'libre',
      reponse: i % 2 ? null : 'SMR',
      via: i % 2 ? 'trace' : null,
      zoom: i % 4 ? 1.5 + i / 7 : null,
      correct: i % 2 === 1,
      aide: i % 5 ? null : 'voir',
      duree_ms: 1234 + i,
      distance_km: i % 2 ? null : 12.345,
      note: i % 3 ? ((i % 4) + 1) as 1 | 2 | 3 | 4 : null,
    }));
    await memoire.ecrire(evts);
    memoire.clore();
    return evts;
  }
  return { a, db, comptes, memoire, envoi, lots, jouer, jetons, attendreJetons: () => Promise.all(jetons) };
}

describe.skipIf(!hoteAuth || !hoteFs)('envoi des séances (émulateurs Auth et Firestore)', () => {
  let env: RulesTestEnvironment;
  let k = 0;
  const adresse = () => `envoi${++k}@exemple.fr`;
  const reglesOuvertes = reglesAvecEssai('return true;');
  const [host, port] = (hoteFs ?? '').split(':');
  const charger = async (rules: string) => {
    env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules, host, port: Number(port) } });
  };
  /** Les lots en ligne d'un compte, lus sans les règles. */
  async function enLigne(uid: string): Promise<{ id: string; d: DocLot }[]> {
    let lots: { id: string; d: DocLot }[] = [];
    await env.withSecurityRulesDisabled(async (c) => {
      const { collection, getDocs } = await import('firebase/firestore');
      lots = (await getDocs(collection(c.firestore() as never, 'joueurs', uid, 'lots'))).docs.map((x) => ({ id: x.id, d: x.data() as DocLot }));
    });
    return lots;
  }
  const evenementsEnLigne = async (uid: string) =>
    (await enLigne(uid)).flatMap(({ d }) => {
      const r = deplier(d);
      if (!r.ok) throw new Error(r.probleme);
      return r.evenements;
    });
  /** Égaux au champ près, undefined compris comme absent. */
  const propres = (e: Evenement[]) => e.map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined))).sort((x, y) => (x.id < y.id ? -1 : 1));

  beforeAll(() => charger(reglesOuvertes));
  afterAll(async () => env?.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    await fetch(`http://${hoteAuth}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('un anonyme n’envoie rien ; au lien e-mail, même uid et le journal part : aller-retour exact', async () => {
    const tel = appareil();
    const joue = await tel.jouer(7);
    const anonyme = (await authM.signInAnonymously(tel.a)).user.uid;
    expect(await tel.envoi.declencher('cloture')).toMatchObject({ etat: 'sans_compte' });
    await tel.comptes.creer(adresse(), 'motdepasse');
    expect(tel.a.currentUser!.uid).toBe(anonyme);
    await tel.attendreJetons();
    expect(tel.envoi.rapport().derniere).toMatchObject({ etat: 'fait', envoyes: 1, refuses: 0 });
    const lots = await enLigne(anonyme);
    expect(lots.map((l) => l.id)).toEqual([joue[0]!.id]);
    expect(lots[0]!.d).toMatchObject({ v: 1, n: 7, seance: joue[0]!.seance, appareil: joue[0]!.appareil });
    expect(propres(await evenementsEnLigne(anonyme))).toEqual(propres(joue));
    // Les claims relevés après le lien (S16) : l'identité e-mail, quelle que soit la méthode.
    expect(Object.keys(tel.comptes.rapport().jeton!.identities)).toContain('email');
    expect(await tel.envoi.etat(anonyme)).toMatchObject({ attente: 0, refusees: 0, horsLigne: false });
  });

  it('renvoi d’un lot déjà accepté (état perdu) : trouvé en ligne, aucun doublon ; une séance de plus part seule', async () => {
    const mail = adresse();
    const pc = appareil();
    await pc.comptes.creer(mail, 'motdepasse');
    await pc.attendreJetons();
    const s1 = await pc.jouer(3);
    await pc.envoi.declencher('cloture');
    const uid = pc.a.currentUser!.uid;
    expect((await enLigne(uid)).length).toBe(1);
    // terramemo-synchro perdue (données du site effacées en partie) : une autre page, mêmes journal et compte.
    const vide = depotLotsMemoire();
    const page = creerEnvoi({
      journal: { tous: () => pc.memoire.tous(), attendre: () => pc.memoire.ecrire([]), seanceEnCours: () => null },
      lots: vide,
      version: 'essai',
      coupee: () => false,
      verrou: (f) => f(),
      compte: async () => {
        const x = await pc.comptes.pourSynchro();
        return x && { uid: x.uid, serveur: serveurFirestore(x.service), verifiee: x.verifiee };
      },
    });
    const s2 = await pc.jouer(2);
    const r = await page.declencher('ouverture');
    expect(r).toMatchObject({ presents: 1, envoyes: 1, refuses: 0 });
    const ids = (await evenementsEnLigne(uid)).map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
    expect(ids.sort()).toEqual([...s1, ...s2].map((e) => e.id).sort());
  });

  it('hors ligne : le lot attend sur l’appareil, puis part au retour du réseau', async () => {
    const pc = appareil();
    await pc.comptes.creer(adresse(), 'motdepasse');
    await pc.attendreJetons();
    const uid = pc.a.currentUser!.uid;
    const joue = await pc.jouer(4);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const r = await pc.envoi.declencher('cloture');
    expect(r).toMatchObject({ arret: 'reseau', envoyes: 0 });
    expect(await pc.envoi.etat(uid)).toMatchObject({ attente: 1, horsLigne: true });
    const [f] = await pc.lots.tous(uid);
    expect(f).toMatchObject({ etat: 'a_envoyer', cause: 'reseau', essais: 1 });
    vi.unstubAllGlobals();
    expect(await pc.envoi.declencher('reseau')).toMatchObject({ envoyes: 1, arret: null });
    expect(propres(await evenementsEnLigne(uid))).toEqual(propres(joue));
    expect(await pc.envoi.etat(uid)).toMatchObject({ attente: 0, horsLigne: false });
  });

  it('refusé par les règles (fermées, essai() faux) : gardé, puis relancé et accepté', async () => {
    const pc = appareil();
    await pc.comptes.creer(adresse(), 'motdepasse');
    await pc.attendreJetons();
    const uid = pc.a.currentUser!.uid;
    await charger(reglesAvecEssai('return false;'));
    try {
      await pc.jouer(2);
      expect(await pc.envoi.declencher('cloture')).toMatchObject({ refuses: 1, envoyes: 0 });
      expect(await pc.envoi.etat(uid)).toMatchObject({ refusees: 1 });
      expect((await pc.lots.tous(uid)).map((f) => [f.etat, f.cause])).toEqual([['refuse', 'regles']]);
    } finally {
      await charger(reglesOuvertes);
    }
    // Un déclencheur ordinaire ne le relance pas ; « Réessayer », si.
    expect(await pc.envoi.declencher('premier_plan')).toMatchObject({ envoyes: 0 });
    expect(await pc.envoi.declencher('reessayer')).toMatchObject({ envoyes: 1 });
    expect((await enLigne(uid)).length).toBe(1);
    expect(await pc.envoi.etat(uid)).toMatchObject({ refusees: 0, attente: 0 });
  });

  it('adresse vérifiée ailleurs (règles d’essai : adresse vérifiée exigée) : le jeton rafraîchi, les lots refusés relancés et acceptés', async () => {
    const mail = adresse();
    const pc = appareil();
    await pc.comptes.creer(mail, 'motdepasse');
    await pc.attendreJetons();
    const uid = pc.a.currentUser!.uid;
    await charger(reglesAvecEssai(`return request.auth.token.email_verified == true && request.auth.token.email in ['${mail}'];`));
    try {
      await pc.jouer(2);
      expect(await pc.envoi.declencher('cloture')).toMatchObject({ refuses: 1 });
      // Le lien de l'e-mail ouvert ailleurs (dans Gmail) : l'adresse est vérifiée côté Auth.
      const codes = (await (await fetch(`http://${hoteAuth}/emulator/v1/projects/${PROJET}/oobCodes`)).json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] };
      const lien = codes.oobCodes.find((c) => c.email === mail && c.requestType === 'VERIFY_EMAIL')!.oobLink;
      expect((await fetch(lien)).ok).toBe(true);
      // Le retour au premier plan : la passe relit le compte, voit l'adresse vérifiée, rafraîchit le jeton
      // et relance les lots refusés (passe « jeton »), sans ouvrir la vue Compte.
      await pc.envoi.declencher('premier_plan');
      await pc.attendreJetons();
      expect((await enLigne(uid)).length).toBe(1);
      expect(await pc.envoi.etat(uid)).toMatchObject({ refusees: 0 });
    } finally {
      await charger(reglesOuvertes);
    }
  });

  it('session perdue (mot de passe changé ailleurs) : rien ne part, les séances sont comptées', async () => {
    const mail = adresse();
    const pc = appareil();
    await pc.comptes.creer(mail, 'motdepasse');
    await pc.attendreJetons();
    const uid = pc.a.currentUser!.uid;
    // Le compte se déconnecte sans déconnexion voulue (jetons révoqués) : comme le SDK le fait seul.
    await authM.signOut(pc.a);
    expect((await pc.comptes.etat()).etat).toBe('perdue');
    await pc.jouer(2);
    expect(await pc.envoi.declencher('cloture')).toMatchObject({ etat: 'sans_compte' });
    expect((await pc.envoi.compter(uid)).nonEnvoyees).toBe(1);
    expect(await enLigne(uid)).toEqual([]);
  });
});
