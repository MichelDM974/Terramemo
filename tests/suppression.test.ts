// Suppression du compte (J1b, lot 5 ; étude § 7.1, D27 b) sur les émulateurs
// Auth et Firestore (`npm run test:comptes`) : les vrais src/sync/comptes.ts,
// envoi.ts et src/journal/memoire.ts, branchés comme dans main.ts, les vraies
// règles (essai() ouvert). Critère du lot 5 : suppression complète (compte
// dans Auth, lots par pages de 400, pierre tombale, demande de retrait des
// places, appareil vidé) ; reprise après une coupure à chaque étape (une
// « page » neuve sur les mêmes bases et la même session Auth, comme une appli
// rouverte) ; écriture d'un 2e appareil du compte refusée après la pierre
// tombale, qui dit « en cours de suppression » puis passe en session perdue.
// Sauté sans émulateurs (npm test).
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { IDBFactory, IDBKeyRange as FauxIDBKeyRange } from 'fake-indexeddb';
import { initializeApp } from 'firebase/app';
import * as authM from 'firebase/auth';
import * as fsM from 'firebase/firestore/lite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BASE_JOURNAL, depotIndexedDb } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import { uuid } from '../src/journal/uuid';
import type { Evenement } from '../src/srs/journal';
import { creerComptes, PAGE_SUPPRESSION, type AppareilComptes } from '../src/sync/comptes';
import { depotARelireIndexedDb, depotLotsIndexedDb } from '../src/sync/depot-lots';
import { terminerEffacement } from '../src/sync/effacement';
import { creerEnvoi, serveurFirestore, type Envoi } from '../src/sync/envoi';
import { composer, docDuLot } from '../src/sync/lots';
import { depotSessionIndexedDb } from '../src/sync/session';
import { reglesAvecEssai } from './regles-essai';

(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange ??= FauxIDBKeyRange;

const hoteAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const hoteFs = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-terramemo';
const MDP = 'motdepasse';
const pause = (ms = 30) => new Promise((r) => setTimeout(r, ms));

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

/** Les étapes où une suppression peut être coupée (réseau, appli tuée). */
type Etape = 'reauth' | 'profil' | 'tombe' | 'lots' | 'compte' | 'effacer';
const coupure = (quoi: string) => Object.assign(new TypeError(`coupure : ${quoi}`), { code: 'unavailable' });

let napps = 0;

/** Un appareil : ses bases (fake-indexeddb), son Firebase (sa session Auth), son stockage ; `page()` l'ouvre. */
function appareil(nom: string) {
  const idb = new IDBFactory();
  const app = initializeApp({ apiKey: 'cle-essai', authDomain: 'localhost', projectId: PROJET }, `suppression-${nom}-${++napps}`);
  const a = authM.getAuth(app);
  authM.connectAuthEmulator(a, `http://${hoteAuth}`, { disableWarnings: true });
  const db = fsM.getFirestore(app);
  const [host, port] = (hoteFs ?? '').split(':');
  fsM.connectFirestoreEmulator(db, host!, Number(port));
  const id = uuid();
  const stockage = new Stockage();
  /** L'étape coupée à la prochaine suppression (une fois). */
  const panne: { etape: Etape | null } = { etape: null };
  const couper = (e: Etape) => {
    if (panne.etape !== e) return;
    panne.etape = null;
    throw coupure(e);
  };
  // Le SDK, avec une coupure possible à chaque étape de la suppression (§ 7.1).
  const auth: typeof authM = {
    ...authM,
    reauthenticateWithCredential: async (...x: Parameters<typeof authM.reauthenticateWithCredential>) => (couper('reauth'), authM.reauthenticateWithCredential(...x)),
    deleteUser: async (u: authM.User) => (couper('compte'), authM.deleteUser(u)),
  };
  const fs: typeof fsM = {
    ...fsM,
    getDoc: (async (...x: Parameters<typeof fsM.getDoc>) => (couper('profil'), fsM.getDoc(...x))) as typeof fsM.getDoc,
    getDocs: (async (...x: Parameters<typeof fsM.getDocs>) => (couper('lots'), fsM.getDocs(...x))) as typeof fsM.getDocs,
    writeBatch: (d: fsM.Firestore) => {
      const b = fsM.writeBatch(d);
      const commit = b.commit.bind(b);
      b.commit = async () => (couper('tombe'), commit());
      return b;
    },
  };
  const service = async () => ({ m: { auth, fs }, db, a });

  function page() {
    const depot = depotIndexedDb(BASE_JOURNAL, { idb, persister: async () => false });
    const passes: Promise<unknown>[] = [];
    let envoi: Envoi | null = null;
    const declencher = (q: Parameters<Envoi['declencher']>[0]) => {
      const p = envoi!.declencher(q);
      passes.push(p);
      return p;
    };
    const memoire = ouvrirMemoire({ depot, appareil: id, horloge: () => ({ ts: Date.now(), tz: 240 }), auRepos: (f) => void setTimeout(f, 0), surCloture: () => void declencher('cloture') });
    const lots = depotLotsIndexedDb(idb);
    const aRelire = depotARelireIndexedDb(idb);
    const session = depotSessionIndexedDb(idb);
    const appareilComptes: AppareilComptes = {
      async reponsesHorsCompte(uid) {
        if (uid) return (await envoi!.compter(uid)).reponsesHorsLots;
        return (await memoire.tous({ strict: true })).filter((e) => e.type === 'reponse').length;
      },
      nonEnvoyees: async (uid) => (await envoi!.compter(uid)).nonEnvoyees,
      async envoyerTout(uid) {
        await declencher('deconnexion');
        const c = await envoi!.compter(uid);
        return { nonEnvoyees: c.nonEnvoyees, refusees: c.refusees };
      },
      effacer: (uids) => {
        couper('effacer');
        return envoi!.effacer(uids, () => memoire.effacer());
      },
    };
    const comptes = creerComptes({ session, version: 'v1', service, stockage: () => stockage, coupee: () => false, republier: async () => undefined, appareil: appareilComptes });
    envoi = creerEnvoi({
      journal: { tous: () => memoire.tous({ strict: true }), attendre: () => memoire.ecrire([]), seanceEnCours: () => memoire.seanceEnCours(), fusionner: (e) => memoire.fusionner(e) },
      lots,
      aRelire,
      marques: comptes.marques(),
      version: 'v1',
      coupee: () => false,
      verrou: (f) => f(),
      compte: async () => {
        const x = await comptes.pourSynchro();
        return x && { uid: x.uid, serveur: serveurFirestore(x.service), verifiee: x.verifiee };
      },
    });
    comptes.surJeton((q) => void declencher(q));
    async function fini(): Promise<void> {
      while (passes.length) await passes.shift();
      await pause();
    }
    /** Une séance de `n` réponses, close : elle part. */
    async function jouer(n: number): Promise<Evenement[]> {
      await memoire.pret;
      const seance = memoire.nouvelId();
      const t0 = Date.now();
      const evts: Evenement[] = Array.from({ length: n }, (_, i) => ({
        v: 1,
        id: memoire.nouvelId(),
        appareil: id,
        ts: t0 + i * 1000,
        tz: 240,
        seance,
        type: 'reponse',
        fiche: i % 2 ? 'pays:FRA:localiser' : 'pays:ITA:nommer',
        mode: 'revision',
        reponse: null,
        via: 'trace',
        zoom: 1,
        correct: true,
        aide: null,
        duree_ms: 1500 + i,
        distance_km: null,
        note: 3,
      }));
      await memoire.ecrire(evts);
      memoire.clore();
      return evts;
    }
    return { memoire, depot, lots, session, comptes, envoi, fini, jouer, fermer: () => memoire.fermer() };
  }
  return { nom, idb, a, db, id, stockage, panne, page };
}

describe.skipIf(!hoteAuth || !hoteFs)('suppression du compte (émulateurs Auth et Firestore)', () => {
  let env: RulesTestEnvironment;
  let k = 0;
  const adresse = () => `suppression${++k}@exemple.fr`;
  const [host, port] = (hoteFs ?? '').split(':');

  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules: reglesAvecEssai('return true;'), host, port: Number(port) } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    await fetch(`http://${hoteAuth}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
  });

  /** Un document lu sans les règles (null s'il n'existe pas). */
  async function lire(...chemin: string[]): Promise<Record<string, unknown> | null> {
    let d: Record<string, unknown> | null = null;
    await env.withSecurityRulesDisabled(async (c) => {
      const { doc, getDoc } = await import('firebase/firestore');
      const x = await getDoc(doc(c.firestore() as never, chemin.join('/')));
      d = x.exists() ? (x.data() as Record<string, unknown>) : null;
    });
    return d;
  }
  async function nbLots(uid: string): Promise<number> {
    let n = 0;
    await env.withSecurityRulesDisabled(async (c) => {
      const { collection, getDocs } = await import('firebase/firestore');
      n = (await getDocs(collection(c.firestore() as never, 'joueurs', uid, 'lots'))).size;
    });
    return n;
  }
  /** `n` lots de plus en ligne, posés sans les règles (comme d'autres appareils du compte). */
  async function semerLots(uid: string, n: number): Promise<void> {
    await env.withSecurityRulesDisabled(async (c) => {
      const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
      const d = c.firestore() as never;
      for (let i = 0; i < n; i += 400) {
        const b = writeBatch(d);
        for (let j = i; j < Math.min(n, i + 400); j++) {
          const [l] = composer([{ v: 1, id: uuid(), appareil: uuid(), ts: Date.now() + j, tz: 240, seance: null, type: 'connu', fiche: 'pays:FRA:localiser' }]);
          b.set(doc(d, 'joueurs', uid, 'lots', l!.id), { ...docDuLot(l!), fin: serverTimestamp() });
        }
        await b.commit();
      }
    });
  }
  /** Le compte est-il encore dans Auth ? (API d'administration de l'émulateur) */
  async function dansAuth(uid: string): Promise<boolean> {
    const r = await fetch(`http://${hoteAuth}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: [uid] }),
    });
    return ((await r.json()) as { users?: unknown[] }).users?.length === 1;
  }

  /** Un compte créé sur l'appareil, sous le pseudo Michel, avec une séance partie et `semes` lots de plus en ligne. */
  async function compteAvecLots(x: ReturnType<typeof appareil>, semes = 0) {
    x.stockage.setItem('terramemo.pseudo', 'Michel');
    const p = x.page();
    await p.memoire.pret;
    await p.comptes.creer(adresse(), MDP);
    await p.fini();
    await p.jouer(5);
    await p.fini();
    const uid = x.a.currentUser!.uid;
    expect(await nbLots(uid)).toBe(1);
    await semerLots(uid, semes);
    return { p, uid };
  }

  /** Tout est supprimé : le compte, ses lots ; restent la pierre tombale et la demande ; l'appareil est vidé. */
  async function toutSupprime(x: ReturnType<typeof appareil>, p: ReturnType<ReturnType<typeof appareil>['page']>, uid: string): Promise<void> {
    expect(await dansAuth(uid)).toBe(false);
    expect(x.a.currentUser).toBeNull();
    expect(await nbLots(uid)).toBe(0);
    expect(await lire('joueurs', uid)).toMatchObject({ v: 1, supprime: true });
    expect(Object.keys((await lire('joueurs', uid))!).sort()).toEqual(['maj', 'supprime', 'v']);
    expect(await lire('demandes', uid)).toMatchObject({ pseudo: 'Michel' });
    expect(await p.depot.tous()).toEqual([]);
    expect(await p.lots.tous(uid)).toEqual([]);
    expect(await p.session.lire()).toMatchObject({ uid: null, suppression: null, effacement: null, deconnexion: null });
    expect(x.stockage.getItem('terramemo.pseudo')).toBeNull();
    expect(await p.comptes.etat()).toEqual({ etat: 'invite', anonyme: false });
  }

  it(`suppression complète : compte, lots par pages de ${PAGE_SUPPRESSION}, pierre tombale, demande, appareil vidé`, async () => {
    const x = appareil('complet');
    const { p, uid } = await compteAvecLots(x, PAGE_SUPPRESSION);
    expect(await nbLots(uid)).toBe(PAGE_SUPPRESSION + 1);
    // Sans « supprimer », ou sans le bon mot de passe : rien ne part.
    await expect(p.comptes.supprimer({ mot: 'oui', mdp: MDP })).rejects.toMatchObject({ code: 'terramemo/suppression-mot' });
    await expect(p.comptes.supprimer({ mot: 'supprimer', mdp: 'mauvais-mdp' })).rejects.toMatchObject({ code: 'terramemo/mdp-faux' });
    await expect(p.comptes.supprimer({ mot: 'supprimer' })).rejects.toMatchObject({ code: 'auth/missing-password' });
    expect((await p.session.lire())?.suppression).toBeNull();
    expect(await lire('joueurs', uid)).not.toMatchObject({ supprime: true });
    // « Supprimer », casse et espaces comme au clavier du téléphone.
    await p.comptes.supprimer({ mot: ' Supprimer ', mdp: MDP });
    await toutSupprime(x, p, uid);
  });

  it('la demande porte le pseudo du profil en ligne, celui que pseudoDemande montre (un pseudo de l’appareil pas encore parti y va d’abord)', async () => {
    const x = appareil('pseudo');
    const { p, uid } = await compteAvecLots(x);
    expect(await p.comptes.pseudoDemande()).toEqual({ lu: true, pseudo: 'Michel' });
    // Le pseudo changé sur l'appareil sans être parti (hors ligne) : envoyé avant d'être montré.
    x.stockage.setItem('terramemo.pseudo', 'Ana');
    await p.session.ecrire({ ...(await p.session.lire())!, profil_a_ecrire: true });
    expect(await p.comptes.pseudoDemande()).toEqual({ lu: true, pseudo: 'Ana' });
    expect(await lire('joueurs', uid)).toMatchObject({ pseudo: 'Ana' });
    await p.comptes.supprimer({ mot: 'supprimer', mdp: MDP });
    expect(await lire('demandes', uid)).toMatchObject({ pseudo: 'Ana' });
  });

  it('un compte sans pseudo en ligne : pas de demande, la suppression aboutit', async () => {
    const x = appareil('sans-pseudo');
    const p = x.page();
    await p.memoire.pret;
    await p.comptes.creer(adresse(), MDP);
    await p.fini();
    const uid = x.a.currentUser!.uid;
    expect(await p.comptes.pseudoDemande()).toEqual({ lu: true, pseudo: null });
    await p.comptes.supprimer({ mot: 'supprimer', mdp: MDP });
    expect(await dansAuth(uid)).toBe(false);
    expect(await lire('joueurs', uid)).toMatchObject({ supprime: true });
    expect(await lire('demandes', uid)).toBeNull();
  });

  for (const etape of ['reauth', 'profil', 'tombe', 'lots', 'compte', 'effacer'] as const) {
    it(`reprise après une coupure à l’étape « ${etape} » : la page suivante finit la suppression`, async () => {
      const x = appareil(`reprise-${etape}`);
      const { p, uid } = await compteAvecLots(x, PAGE_SUPPRESSION + 3);
      x.panne.etape = etape;
      await expect(p.comptes.supprimer({ mot: 'supprimer', mdp: MDP })).rejects.toBeTruthy();
      p.fermer();
      // L'appli rouverte : mêmes bases, même session Auth.
      const p2 = x.page();
      if (etape === 'effacer') {
        // Coupée pendant l'effacement de l'appareil : fini au démarrage, avant de lire le journal (main.ts).
        expect(
          await terminerEffacement({ session: p2.session, viderJournal: () => p2.depot.vider!(), oublier: (u) => p2.lots.effacer!(u), stockage: x.stockage, version: 'v1' }),
        ).toBe(true);
        await toutSupprime(x, p2, uid);
        return;
      }
      await p2.memoire.pret;
      const e = await p2.comptes.etat();
      if (etape === 'reauth') expect(e).toMatchObject({ etat: 'compte', uid });
      // Le drapeau est resté, le compte encore là : « Suppression inachevée : reprendre ? ».
      else expect(e).toEqual({ etat: 'suppression', uid, adresse: expect.any(String), fournisseurs: ['password'], connecte: true });
      // Rien ne part plus d'un appareil en suppression : ni lots, ni profil.
      if (etape !== 'reauth') expect(await p2.comptes.pourSynchro()).toBeNull();
      await p2.comptes.supprimer({ mot: 'supprimer', mdp: MDP });
      await toutSupprime(x, p2, uid);
    });
  }

  it('une suppression déjà faite dans Auth (appli tuée juste après deleteUser) : la reprise vide l’appareil, sans mot de passe', async () => {
    const x = appareil('apres-auth');
    const { p, uid } = await compteAvecLots(x);
    // Ce que la page avait fait avant d'être tuée : drapeau, pierre tombale, lots, compte.
    await p.session.ecrire({ ...(await p.session.lire())!, suppression: uid });
    await authM.deleteUser(x.a.currentUser!);
    const p2 = x.page();
    await p2.memoire.pret;
    expect(await p2.comptes.etat()).toMatchObject({ etat: 'suppression', uid, connecte: false });
    // Pas de connexion ni de création tant que la suppression attend.
    await expect(p2.comptes.connecter(adresse(), MDP)).rejects.toMatchObject({ code: 'terramemo/suppression-inachevee' });
    await expect(p2.comptes.creer(adresse(), MDP)).rejects.toMatchObject({ code: 'terramemo/suppression-inachevee' });
    await p2.comptes.supprimer({ mot: 'supprimer' });
    expect(await p2.depot.tous()).toEqual([]);
    expect(await p2.session.lire()).toMatchObject({ uid: null, suppression: null, effacement: null });
    expect(await p2.comptes.etat()).toEqual({ etat: 'invite', anonyme: false });
  });

  it('un 2e appareil du compte : écritures refusées après la pierre tombale, « en cours de suppression », puis session perdue', async () => {
    const pc = appareil('pc');
    const tel = appareil('tel');
    const { p, uid } = await compteAvecLots(pc);
    const mail = (await p.session.lire())!.adresse!;
    const t = tel.page();
    await t.memoire.pret;
    await t.comptes.connecter(mail, MDP);
    await t.fini();
    // Le téléphone a relu la séance du PC.
    const lus = (await t.depot.tous()).length;
    expect(lus).toBe(5);
    // Le PC lance la suppression ; coupée après la pierre tombale (lots pas encore supprimés).
    pc.panne.etape = 'lots';
    await expect(p.comptes.supprimer({ mot: 'supprimer', mdp: MDP })).rejects.toBeTruthy();
    expect(await lire('joueurs', uid)).toMatchObject({ supprime: true });
    // Le téléphone écrit encore avec son jeton : sa séance close part, refusée par les règles, gardée sur
    // l'appareil ; le même lot écrit directement est refusé aussi.
    const [l] = composer(await t.jouer(3));
    await t.fini();
    expect((await t.envoi.compter(uid)).refusees).toBe(1);
    await expect(serveurFirestore({ m: { auth: authM, fs: fsM }, db: tel.db, a: tel.a }).creer(uid, l!.id, docDuLot(l!))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await t.depot.tous()).toHaveLength(lus + 3);
    tel.stockage.setItem('terramemo.pseudo', 'Autre');
    expect(await t.comptes.profilModifie('pseudo')).toMatchObject({ etat: 'supprime' });
    // À sa prochaine ouverture, il lit la pierre tombale.
    const t2 = tel.page();
    await t2.memoire.pret;
    expect(await t2.comptes.demarrer()).toMatchObject({ etat: 'compte', uid, supprime: true });
    expect(await t2.comptes.etat()).toMatchObject({ etat: 'compte', supprime: true });
    // Le PC finit la suppression ; le téléphone passe en session perdue, son journal gardé.
    await p.comptes.supprimer({ mot: 'supprimer', mdp: MDP });
    expect(await dansAuth(uid)).toBe(false);
    expect(await t2.comptes.etat()).toEqual({ etat: 'perdue', uid, adresse: mail });
    expect(await t2.depot.tous()).toHaveLength(lus + 3);
  });
});
