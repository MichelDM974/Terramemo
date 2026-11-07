// Critère de fin de #3 (J1b, lot 4 ; étude § 5.8, 1) : deux appareils, l'un
// hors ligne, au même état après reconnexion, à version égale de l'appli.
// `npm run test:synchro` (émulateurs Auth et Firestore, projet
// demo-terramemo, ports 8062 et 8063 : jamais en même temps que
// test:regles ni test:comptes). Sauté sans émulateurs (npm test).
//
// Montage : chaque appareil a sa fabrique fake-indexeddb (journal et
// terramemo-synchro), son initializeApp nommée, sa Memoire, son horloge, son
// verrou et son canal d'onglets ; les vrais src/sync/comptes.ts, envoi.ts,
// lots.ts et src/journal/memoire.ts, branchés comme dans main.ts ; les vrais
// jetons de l'émulateur Auth et les vraies règles (essai() ouvert, sauf (j)).
// « Hors ligne » : les appels de l'appareil à Firestore échouent comme un
// fetch coupé (un faux fetch global couperait les deux appareils, qui
// tournent dans le même processus) ; Auth reste joignable, comme un APK dont
// Firebase est chargé. Une « page » est une ouverture de l'appli sur les
// mêmes bases (redémarrage, nouvelle version, second onglet).
//
// Attendu (§ 5.8) : sur chaque appareil, memoire.etat() ≡ rejouer(journal) ;
// entre appareils, mêmes états et mêmes ids ; en ligne, chaque id local dans
// un lot, sans doublon ; après « Ne pas les ajouter », le journal égale les
// événements en ligne du compte.
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
import type { Note } from '../src/srs/note';
import { etat as rejouer } from '../src/srs/rejeu';
import { creerComptes, type AppareilComptes, type ChoixFusion } from '../src/sync/comptes';
import { depotARelireIndexedDb, depotLotsIndexedDb } from '../src/sync/depot-lots';
import { creerEnvoi, serveurFirestore, type Envoi, type Serveur } from '../src/sync/envoi';
import { deplier, type DocLot } from '../src/sync/lots';
import { depotSessionIndexedDb } from '../src/sync/session';
import { REGLES, reglesAvecEssai } from './regles-essai';

// Les plages de clés du dépôt des lots : celles de fake-indexeddb (Node n'a pas d'IndexedDB).
(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange ??= FauxIDBKeyRange;

const hoteAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const hoteFs = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-terramemo';
const JOUR = 86_400_000;
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

let napps = 0;

/**
 * Un appareil : ses bases, son Firebase, son id, son horloge (décalée), son
 * réseau ; `page()` l'ouvre (ou le rouvre) sur ces bases, à une version.
 */
function appareil(nom: string, o: { decalage?: number } = {}) {
  const idb = new IDBFactory();
  const app = initializeApp({ apiKey: 'cle-essai', authDomain: 'localhost', projectId: PROJET }, `synchro-${nom}-${++napps}`);
  const a = authM.getAuth(app);
  authM.connectAuthEmulator(a, `http://${hoteAuth}`, { disableWarnings: true });
  const db = fsM.getFirestore(app);
  const [host, port] = (hoteFs ?? '').split(':');
  fsM.connectFirestoreEmulator(db, host!, Number(port));
  const id = uuid();
  const stockage = new Stockage();
  const reseau = { coupe: false };
  const horloge = { decalage: o.decalage ?? 0 };
  const verrou = `synchro-${nom}-${napps}`;
  const canal = `terramemo-${nom}-${napps}`;

  /** Le serveur de l'appareil : Firestore, ou un fetch qui échoue quand le réseau est coupé. */
  const horsLigne = (s: Serveur): Serveur => {
    const coupe = () => {
      if (reseau.coupe) throw new TypeError('fetch failed');
    };
    return {
      creer: async (...x) => (coupe(), s.creer(...x)),
      lire: async (...x) => (coupe(), s.lire(...x)),
      lister: async (...x) => (coupe(), s.lister!(...x)),
    };
  };

  function page(version = 'v1', opt: { deplier?: (d: Record<string, unknown>) => ReturnType<typeof deplier> } = {}) {
    const depot = depotIndexedDb(BASE_JOURNAL, { idb, persister: async () => false });
    const passes: Promise<unknown>[] = [];
    let envoi: Envoi | null = null;
    const declencher = (q: Parameters<Envoi['declencher']>[0]) => {
      const p = envoi!.declencher(q);
      passes.push(p);
      return p;
    };
    const memoire = ouvrirMemoire({
      depot,
      appareil: id,
      horloge: () => ({ ts: Date.now() + horloge.decalage, tz: 240 }),
      auRepos: (f) => void setTimeout(f, 0),
      canal,
      surCloture: () => void declencher('cloture'),
    });
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
      effacer: (uids) => envoi!.effacer(uids, () => memoire.effacer()),
    };
    const comptes = creerComptes({
      session,
      version,
      service: async () => ({ m: { auth: authM, fs: fsM }, db, a }),
      stockage: () => stockage,
      coupee: () => false,
      republier: async () => undefined,
      appareil: appareilComptes,
    });
    envoi = creerEnvoi({
      journal: { tous: () => memoire.tous({ strict: true }), attendre: () => memoire.ecrire([]), seanceEnCours: () => memoire.seanceEnCours(), fusionner: (e) => memoire.fusionner(e) },
      lots,
      aRelire,
      marques: comptes.marques(),
      version,
      coupee: () => false,
      verrou: (f) => navigator.locks.request(verrou, f),
      compte: async () => {
        const x = await comptes.pourSynchro();
        return x && { uid: x.uid, serveur: horsLigne(serveurFirestore(x.service)), verifiee: x.verifiee };
      },
      ...(opt.deplier ? { deplier: opt.deplier } : {}),
    });
    comptes.surJeton((q) => void declencher(q));
    /** Toutes les passes lancées finies (y compris celles qu'une passe a fait partir). */
    async function fini(): Promise<void> {
      while (passes.length) await passes.shift();
      await pause();
    }
    /**
     * Une séance de `notes.length` réponses (fiches données, ou alternées),
     * à `ts` (défaut : l'horloge de l'appareil), close : elle part.
     */
    async function jouer(notes: Note[], o: { fiches?: string[]; ts?: number; seance?: string; ouverte?: boolean } = {}): Promise<Evenement[]> {
      await memoire.pret;
      const seance = o.seance ?? memoire.nouvelId();
      const t0 = o.ts ?? Date.now() + horloge.decalage;
      const evts: Evenement[] = notes.map((note, i) => ({
        v: 1,
        id: memoire.nouvelId(),
        appareil: id,
        ts: t0 + i * 1000,
        tz: 240,
        seance,
        type: 'reponse',
        fiche: o.fiches?.[i] ?? (i % 2 ? 'pays:FRA:localiser' : 'pays:ITA:nommer'),
        mode: 'revision',
        reponse: note === 1 ? 'BEL' : null,
        via: 'trace',
        zoom: 1,
        correct: note !== 1,
        aide: null,
        duree_ms: 1500 + i,
        distance_km: note === 1 ? 120 : null,
        note,
      }));
      await memoire.ecrire(evts);
      if (!o.ouverte) memoire.clore();
      return evts;
    }
    return { memoire, depot, lots, aRelire, session, comptes, envoi, declencher, fini, jouer, fermer: () => memoire.fermer() };
  }
  return { nom, idb, a, db, id, stockage, reseau, horloge, page };
}

type Page = ReturnType<ReturnType<typeof appareil>['page']>;

describe.skipIf(!hoteAuth || !hoteFs)('synchro de deux appareils (émulateurs Auth et Firestore)', () => {
  let env: RulesTestEnvironment;
  let k = 0;
  const adresse = () => `synchro${++k}@exemple.fr`;
  const [host, port] = (hoteFs ?? '').split(':');
  const charger = async (rules: string) => {
    await env?.cleanup();
    env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules, host, port: Number(port) } });
  };
  const ouvertes = reglesAvecEssai('return true;');

  /** Les lots en ligne d'un compte, lus sans les règles. */
  async function enLigne(uid: string): Promise<{ id: string; d: DocLot }[]> {
    let lots: { id: string; d: DocLot }[] = [];
    await env.withSecurityRulesDisabled(async (c) => {
      const { collection, getDocs } = await import('firebase/firestore');
      lots = (await getDocs(collection(c.firestore() as never, 'joueurs', uid, 'lots'))).docs.map((x) => ({ id: x.id, d: x.data() as DocLot }));
    });
    return lots;
  }
  const idsEnLigne = async (uid: string) =>
    (await enLigne(uid)).flatMap(({ d }) => {
      const r = deplier(d);
      if (!r.ok) throw new Error(r.probleme);
      return r.evenements.map((e) => e.id);
    });
  const trier = (x: string[]) => [...x].sort();
  const idsDe = async (p: Page) => trier((await p.depot.tous()).map((e) => e.id));

  /** Le critère du § 5.8 sur ces pages (un appareil chacune) d'un même compte. */
  async function memeEtat(uid: string, ...pages: Page[]): Promise<void> {
    for (const p of pages) await p.fini();
    await pause(50);
    const etats = [];
    for (const p of pages) {
      const e = new Map(p.memoire.etat());
      expect(e, 'memoire.etat() ≡ rejouer(journal)').toEqual(rejouer(await p.depot.tous()));
      etats.push(e);
    }
    for (const e of etats.slice(1)) expect(e, 'même état FSRS d’un appareil à l’autre').toEqual(etats[0]);
    const ids = await idsDe(pages[0]!);
    for (const p of pages.slice(1)) expect(await idsDe(p), 'mêmes ids').toEqual(ids);
    const enL = await idsEnLigne(uid);
    expect(enL.length, 'aucun doublon en ligne').toBe(new Set(enL).size);
    expect(trier(enL), 'chaque id local en ligne').toEqual(ids);
  }

  /** Un compte créé sur un appareil (page ouverte), son uid. */
  async function compteSur(p: Page, mail = adresse()): Promise<string> {
    await p.comptes.creer(mail, 'motdepasse');
    await p.fini();
    return (await p.comptes.etat() as { uid: string }).uid;
  }

  beforeAll(() => charger(ouvertes));
  afterAll(async () => env?.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    await fetch(`http://${hoteAuth}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
  });

  it('(a) lien e-mail d’un anonyme : même uid, claims relevés (S16), le journal de l’invité part', async () => {
    const A = appareil('a');
    const pa = A.page();
    const joue = await pa.jouer([3, 3, 1]);
    const anonyme = (await authM.signInAnonymously(A.a)).user.uid;
    await pa.fini();
    expect(await enLigne(anonyme)).toEqual([]);
    await pa.comptes.creer(adresse(), 'motdepasse');
    await pa.fini();
    expect(A.a.currentUser!.uid).toBe(anonyme);
    const j = pa.comptes.rapport().jeton!;
    expect(j.uid).toBe(anonyme);
    expect(Object.keys(j.identities)).toContain('email');
    expect(trier(await idsEnLigne(anonyme))).toEqual(trier(joue.map((e) => e.id)));
    await memeEtat(anonyme, pa);
    pa.fermer();
  });

  it('(b) un second appareil se connecte et répond « Ajouter » : les deux journaux s’unissent ; puis déconnexion et retour', async () => {
    const A = appareil('a');
    const B = appareil('b');
    const pa = A.page();
    const pb = B.page();
    const mail = adresse();
    const uid = await compteSur(pa, mail);
    await pa.jouer([3, 1, 4]);
    await pa.fini();
    await pb.jouer([1, 3]);
    let question: unknown = null;
    const r = await pb.comptes.connecter(mail, 'motdepasse', async (q) => ((question = q), 'ajouter'));
    expect(question).toEqual({ sorte: 'appareil', reponses: 2, records: 0, seances: 0 });
    expect(r).toMatchObject({ fusion: 'ajoute', reponses: 2 });
    await pb.fini();
    await pa.declencher('premier_plan');
    await memeEtat(uid, pa, pb);
    // Déconnexion de B : tout est parti, B repart vierge ; de retour, il relit tout (aucune question).
    expect(await pb.comptes.deconnecter()).toEqual({ fait: true });
    expect(await pb.depot.tous()).toEqual([]);
    expect(await pb.lots.tous(uid)).toEqual([]);
    expect(pb.memoire.etat().size).toBe(0);
    const r2 = await pb.comptes.connecter(mail, 'motdepasse', async () => 'annuler');
    expect(r2.fusion).toBe('sans_question');
    await memeEtat(uid, pa, pb);
    pa.fermer();
    pb.fermer();
  });

  it('(b’) « Ne pas les ajouter » : le journal de l’appareil égale les événements en ligne du compte', async () => {
    const A = appareil('a');
    const B = appareil('b');
    const pa = A.page();
    const pb = B.page();
    const mail = adresse();
    const uid = await compteSur(pa, mail);
    await pa.jouer([3, 4]);
    await pa.fini();
    const autres = await pb.jouer([1, 1, 1]);
    const r = await pb.comptes.connecter(mail, 'motdepasse', async (): Promise<ChoixFusion> => 'effacer');
    expect(r.fusion).toBe('efface');
    await pb.fini();
    expect(await idsDe(pb)).toEqual(trier(await idsEnLigne(uid)));
    for (const e of autres) expect(await idsDe(pb)).not.toContain(e.id);
    await memeEtat(uid, pa, pb);
    pa.fermer();
    pb.fermer();
  });

  for (const ordre of ['A puis B', 'B puis A'] as const)
    it(`(c) A joue hors ligne, B joue plus tard la même fiche le même jour, et une autre ; reconnexion ${ordre}`, async () => {
      const A = appareil('a');
      const B = appareil('b');
      const pa = A.page();
      const pb = B.page();
      const mail = adresse();
      const uid = await compteSur(pa, mail);
      await pb.comptes.connecter(mail, 'motdepasse');
      await pb.fini();
      const t = Date.now();
      A.reseau.coupe = true;
      await pa.jouer([1], { fiches: ['pays:FRA:localiser'], ts: t - 2 * 3_600_000 });
      await pa.fini();
      expect(await pa.envoi.etat(uid)).toMatchObject({ attente: 1, horsLigne: true });
      B.reseau.coupe = ordre === 'B puis A';
      await pb.jouer([3, 4], { fiches: ['pays:FRA:localiser', 'pays:DEU:localiser'], ts: t - 3_600_000 });
      await pb.fini();
      const premier = ordre === 'A puis B' ? [A, pa] as const : [B, pb] as const;
      const second = ordre === 'A puis B' ? [B, pb] as const : [A, pa] as const;
      premier[0].reseau.coupe = false;
      await premier[1].declencher('reseau');
      await premier[1].declencher('premier_plan');
      second[0].reseau.coupe = false;
      await second[1].declencher('reseau');
      await second[1].declencher('premier_plan');
      await premier[1].declencher('premier_plan');
      await memeEtat(uid, pa, pb);
      // La règle du rejeu : la première note du jour l'emporte (Again de A, à 9 h), partout (§ 5.6).
      expect(pa.memoire.etat().get('pays:FRA:localiser')).toMatchObject({ notes: 1, echecs: 1 });
      pa.fermer();
      pb.fermer();
    });

  it('(d) A et B hors ligne en même temps, puis reconnectés', async () => {
    const A = appareil('a');
    const B = appareil('b');
    const pa = A.page();
    const pb = B.page();
    const mail = adresse();
    const uid = await compteSur(pa, mail);
    await pb.comptes.connecter(mail, 'motdepasse');
    await pb.fini();
    A.reseau.coupe = true;
    B.reseau.coupe = true;
    await pa.jouer([3, 2, 1, 4]);
    await pb.jouer([4, 1, 3]);
    await pa.jouer([2], { fiches: ['pays:ESP:localiser'] });
    await Promise.all([pa.fini(), pb.fini()]);
    A.reseau.coupe = false;
    B.reseau.coupe = false;
    await Promise.all([pa.declencher('reseau'), pb.declencher('reseau')]);
    await Promise.all([pa.declencher('premier_plan'), pb.declencher('premier_plan')]);
    await memeEtat(uid, pa, pb);
    pa.fermer();
    pb.fermer();
  });

  it('(e) l’horloge de B a un jour d’avance', async () => {
    const A = appareil('a');
    const B = appareil('b', { decalage: JOUR });
    const pa = A.page();
    const pb = B.page();
    const mail = adresse();
    const uid = await compteSur(pa, mail);
    await pb.comptes.connecter(mail, 'motdepasse');
    await pb.jouer([3, 1], { fiches: ['pays:FRA:localiser', 'pays:ITA:localiser'] });
    await pb.fini();
    await pa.declencher('premier_plan');
    // A note maintenant les mêmes fiches : avant celles de B dans l'ordre du rejeu (rejeu complet, au repos).
    await pa.jouer([1, 4], { fiches: ['pays:FRA:localiser', 'pays:ITA:localiser'] });
    await pa.fini();
    await pb.declencher('premier_plan');
    await memeEtat(uid, pa, pb);
    expect(pa.memoire.etat().get('pays:FRA:localiser')?.notes).toBe(2);
    pa.fermer();
    pb.fermer();
  });

  it('(f) séance reprise après un envoi, état d’envoi perdu, recomposition : aucun id perdu, aucun doublon', async () => {
    const A = appareil('a');
    let pa = A.page();
    const uid = await compteSur(pa);
    const seance = uuid();
    await pa.jouer([3, 3, 1], { seance });
    await pa.fini();
    // La même séance reprise : un lot de plus.
    await pa.jouer([4, 2], { seance, ts: Date.now() + 10_000 });
    await pa.fini();
    expect((await enLigne(uid)).length).toBe(2);
    pa.fermer();
    // terramemo-synchro perd ses fiches (données du site effacées en partie), session gardée ; redémarrage.
    await depotLotsIndexedDb(A.idb).effacer!(uid);
    pa = A.page();
    await pa.memoire.pret;
    await pa.declencher('cloture');
    await pa.fini();
    expect((await enLigne(uid)).length).toBe(2);
    await memeEtat(uid, pa);
    // Puis une ouverture (lecture incrémentale et contrôle) : rien ne bouge.
    await pa.declencher('ouverture');
    await memeEtat(uid, pa);
    pa.fermer();
  });

  it('(g) un lot qu’une version ne sait pas lire : gardé dans a_relire, puis relu sans réseau après la mise à jour', async () => {
    const A = appareil('a');
    const B = appareil('b');
    // A est en retard : sa version ne connaît pas la fiche de l'Allemagne (comme un mode venu après elle).
    const ancien = (d: Record<string, unknown>) => (String(d.evenements).includes('DEU') ? { ok: false as const, probleme: 'fiche inconnue' } : deplier(d as unknown as DocLot));
    let pa = A.page('v1', { deplier: ancien });
    const pb = B.page('v2');
    const mail = adresse();
    const uid = await compteSur(pb, mail);
    await pb.jouer([3, 1], { fiches: ['pays:DEU:localiser', 'pays:FRA:localiser'] });
    await pb.jouer([4]);
    await pb.fini();
    await pa.comptes.connecter(mail, 'motdepasse');
    await pa.fini();
    expect(await pa.envoi.etat(uid)).toMatchObject({ aRelire: 2 });
    expect((await pa.aRelire.tous(uid)).length).toBe(1);
    expect((await pa.depot.tous()).length).toBe(1);
    pa.fermer();
    // Mise à jour, hors ligne : relu depuis l'appareil.
    A.reseau.coupe = true;
    pa = A.page('v2');
    await pa.memoire.pret;
    const r = await pa.declencher('cloture');
    expect(r.lecture).toMatchObject({ relus: 1 });
    expect(await pa.aRelire.tous(uid)).toEqual([]);
    A.reseau.coupe = false;
    await memeEtat(uid, pa, pb);
    pa.fermer();
    pb.fermer();
  });

  it('(h) deux onglets : deux mémoires sur les mêmes bases, des passes en même temps', async () => {
    const A = appareil('a');
    const B = appareil('b');
    const t1 = A.page();
    const t2 = A.page();
    const pb = B.page();
    const mail = adresse();
    const uid = await compteSur(t1, mail);
    await pb.comptes.connecter(mail, 'motdepasse');
    await Promise.all([t1.jouer([3, 1]), t2.jouer([4, 4, 2]), pb.jouer([1])]);
    await Promise.all([t1.declencher('reseau'), t2.declencher('reseau'), t1.declencher('premier_plan'), t2.declencher('premier_plan')]);
    await Promise.all([t1.fini(), t2.fini(), pb.fini()]);
    await pb.declencher('premier_plan');
    await t1.declencher('premier_plan');
    // Chaque onglet a vu les séances closes de l'autre (BroadcastChannel) : même état que le journal.
    await memeEtat(uid, t1, t2, pb);
    t1.fermer();
    t2.fermer();
    pb.fermer();
  });

  it('(i) session perdue (mot de passe changé depuis l’autre appareil), puis reconnexion sans question', async () => {
    const A = appareil('a');
    const B = appareil('b');
    const pa = A.page();
    const pb = B.page();
    const mail = adresse();
    const uid = await compteSur(pa, mail);
    await pb.comptes.connecter(mail, 'motdepasse');
    await pb.fini();
    // Un mot de passe changé ne révoque que les jetons émis avant sa seconde.
    await pause(1100);
    await pb.comptes.changerMotDePasse('motdepasse', 'nouveaumdp');
    expect(await pa.comptes.etat()).toMatchObject({ etat: 'perdue', uid });
    const perdues = await pa.jouer([1, 3]);
    await pa.fini();
    for (const e of perdues) expect(await idsEnLigne(uid)).not.toContain(e.id);
    expect((await pa.envoi.compter(uid)).nonEnvoyees).toBe(1);
    const choisir = async (): Promise<ChoixFusion> => 'annuler';
    expect((await pa.comptes.connecter(mail, 'nouveaumdp', choisir)).fusion).toBe('sans_question');
    await pa.fini();
    await pb.declencher('premier_plan');
    await memeEtat(uid, pa, pb);
    pa.fermer();
    pb.fermer();
  });

  it('(j) refus des règles (règles d’essai fermées), puis acceptation à une nouvelle version', async () => {
    const A = appareil('a');
    let pa = A.page('v1');
    const uid = await compteSur(pa);
    await charger(REGLES);
    try {
      const joue = await pa.jouer([3, 1, 2]);
      await pa.fini();
      expect(await pa.envoi.etat(uid)).toMatchObject({ refusees: 1 });
      await charger(ouvertes);
      pa.fermer();
      pa = A.page('v2');
      await pa.memoire.pret;
      await pa.declencher('ouverture');
      await pa.fini();
      expect(await pa.envoi.etat(uid)).toMatchObject({ refusees: 0, attente: 0 });
      expect(trier(await idsEnLigne(uid))).toEqual(trier(joue.map((e) => e.id)));
      await memeEtat(uid, pa);
    } finally {
      await charger(ouvertes);
      pa.fermer();
    }
  });
});
