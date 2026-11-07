// Profil des comptes (J1b, lot 2 ; étude § 5.4 et § 9) sur les émulateurs
// Auth et Firestore (`npm run test:comptes`) : le vrai SDK, le vrai
// src/sync/comptes.ts, les vraies règles (essai() ouvert : celles du dépôt
// gardent joueurs/ fermé jusqu'au lot 6, essayées à la fin). Deux appareils
// (deux applis Firebase nommées, chacune son stockage et sa session) :
// records croisés, aucun perdu ; pseudo retrouvé sur le second. Sauté sans
// émulateurs (npm test).
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp } from 'firebase/app';
import * as authM from 'firebase/auth';
import * as fsM from 'firebase/firestore/lite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { idEpreuve, lireRecords, VERSION_BAREME, type RecordChrono } from '../src/epreuve/chrono';
import { creerComptes } from '../src/sync/comptes';
import { depotSessionMemoire } from '../src/sync/session';
import { REGLES, reglesAvecEssai } from './regles-essai';

const hoteAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const hoteFs = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-terramemo';
const AMS = idEpreuve('South America');
const AFR = idEpreuve('Africa');
const EUR = idEpreuve('Europe');
const OCE = idEpreuve('Oceania');

const rec = (points: number, temps_ms = 60_000): RecordChrono => ({ points, justes: Math.floor(points / 1000), questions: 12, temps_ms, date: Date.now(), bareme: VERSION_BAREME });
const points = (m: Map<string, RecordChrono>) => Object.fromEntries([...m].map(([k, r]) => [k, r.points]));

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
/** Un appareil : son appli Firebase (sa propre session Auth), son stockage, sa session, ses comptes. */
function appareil(pseudo: string | null, records: Record<string, RecordChrono>) {
  const app = initializeApp({ apiKey: 'cle-essai', authDomain: 'localhost', projectId: PROJET }, `appareil-${++n}`);
  const a = authM.getAuth(app);
  authM.connectAuthEmulator(a, `http://${hoteAuth}`, { disableWarnings: true });
  const db = fsM.getFirestore(app);
  const [host, port] = (hoteFs ?? '').split(':');
  fsM.connectFirestoreEmulator(db, host!, Number(port));
  const stockage = new Stockage();
  stockage.setItem('terramemo.chrono.records', JSON.stringify(records));
  if (pseudo) stockage.setItem('terramemo.pseudo', pseudo);
  const republier = vi.fn(async () => undefined);
  const comptes = creerComptes({
    session: depotSessionMemoire(),
    version: 'essai',
    service: async () => ({ m: { auth: authM, fs: fsM }, db, a }),
    stockage: () => stockage,
    coupee: () => false,
    republier,
  });
  return { comptes, stockage, republier, a, db, records: () => lireRecords(stockage), pseudo: () => stockage.getItem('terramemo.pseudo') };
}

describe.skipIf(!hoteAuth || !hoteFs)('profil des comptes (émulateurs Auth et Firestore)', () => {
  let env: RulesTestEnvironment;
  let k = 0;
  const adresse = () => `profil${++k}@exemple.fr`;
  /** Le profil en ligne, lu sans les règles. */
  async function enLigne(uid: string): Promise<{ pseudo?: string; records: Record<string, RecordChrono>; supprime?: boolean } | null> {
    let d: Record<string, unknown> | undefined;
    await env.withSecurityRulesDisabled(async (c) => {
      const { doc, getDoc } = await import('firebase/firestore');
      d = (await getDoc(doc(c.firestore() as never, 'joueurs', uid))).data();
    });
    return d ? { ...d, records: JSON.parse((d.records as string | undefined) ?? '{}') as Record<string, RecordChrono> } : null;
  }

  beforeAll(async () => {
    const [host, port] = (hoteFs ?? '').split(':');
    env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules: reglesAvecEssai('return true;'), host, port: Number(port) } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    await fetch(`http://${hoteAuth}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
  });

  it('deux appareils aux records croisés : chacun garde le meilleur de chaque épreuve, aucun perdu, même écrits en même temps', async () => {
    const pc = appareil('Michel', { [AMS]: rec(11_000), [AFR]: rec(10_000), [EUR]: rec(8_000) });
    const tel = appareil('Bob', { [AMS]: rec(9_000), [AFR]: rec(12_000), [OCE]: rec(5_000) });
    const mail = adresse();
    const cree = await pc.comptes.creer(mail, 'motdepasse');
    expect(cree.profil).toMatchObject({ etat: 'cree', pseudo: 'Michel', envoyes: 3 });
    const uid = pc.a.currentUser!.uid;

    const connexion = await tel.comptes.connecter(mail, 'motdepasse');
    expect(connexion.profil).toMatchObject({ etat: 'ecrit', pseudo: 'Michel', ancienPseudo: 'Bob', recus: 2, envoyes: 2 });
    expect(tel.republier).toHaveBeenCalledWith('Michel');
    const max = { [AMS]: 11_000, [AFR]: 12_000, [EUR]: 8_000, [OCE]: 5_000 };
    expect(points(tel.records())).toEqual(max);
    expect(points(new Map(Object.entries((await enLigne(uid))!.records)))).toEqual(max);

    // Le PC rouvre l'appli : il reçoit ce que le téléphone avait de mieux.
    await pc.comptes.demarrer();
    expect(points(pc.records())).toEqual(max);

    // Un record sur chaque appareil, envoyés en même temps : la transaction n'en efface aucun.
    pc.stockage.setItem('terramemo.chrono.records', JSON.stringify({ ...Object.fromEntries(pc.records()), [EUR]: rec(9_000) }));
    tel.stockage.setItem('terramemo.chrono.records', JSON.stringify({ ...Object.fromEntries(tel.records()), [OCE]: rec(7_000) }));
    const [a, b] = await Promise.all([pc.comptes.profilModifie('records'), tel.comptes.profilModifie('records')]);
    expect([a?.etat, b?.etat]).toEqual(['ecrit', 'ecrit']);
    const fin = { ...max, [EUR]: 9_000, [OCE]: 7_000 };
    expect(points(new Map(Object.entries((await enLigne(uid))!.records)))).toEqual(fin);
    await Promise.all([pc.comptes.demarrer(), tel.comptes.demarrer()]);
    expect(points(pc.records())).toEqual(fin);
    expect(points(tel.records())).toEqual(fin);
  });

  it('le pseudo retrouvé sur un second appareil, puis changé sur l’un et suivi par l’autre', async () => {
    const pc = appareil('Michel', {});
    const tel = appareil(null, {});
    const mail = adresse();
    await pc.comptes.creer(mail, 'motdepasse');
    const r = await tel.comptes.connecter(mail, 'motdepasse');
    // L'appareil n'avait pas de pseudo : il prend celui du compte, sans rien à dire.
    expect(r.profil).toMatchObject({ pseudo: 'Michel', ancienPseudo: null });
    expect(tel.pseudo()).toBe('Michel');
    expect(await pc.comptes.changerPseudo('Michel D')).toMatchObject({ etat: 'ecrit', pseudo: 'Michel D' });
    expect(pc.republier).toHaveBeenCalledWith('Michel D');
    await tel.comptes.demarrer();
    expect(tel.pseudo()).toBe('Michel D');
  });

  it('lien d’un invité anonyme : même uid, le profil part avec ; l’anonyme seul ne peut rien écrire', async () => {
    const tel = appareil('Lia', { [AMS]: rec(11_000) });
    const anonyme = (await authM.signInAnonymously(tel.a)).user.uid;
    // Un anonyme n'a aucune identité : la synchro le saute, et les règles le refusent de toute façon.
    expect(await tel.comptes.synchroniserProfil()).toMatchObject({ etat: 'sans_compte' });
    await expect(fsM.setDoc(fsM.doc(tel.db, 'joueurs', anonyme), { v: 1, maj: fsM.serverTimestamp() })).rejects.toMatchObject({ code: 'permission-denied' });
    const r = await tel.comptes.creer(adresse(), 'motdepasse');
    expect(tel.a.currentUser!.uid).toBe(anonyme);
    // Juste après le lien et le jeton rafraîchi, les règles voient l'identité email (S16, à l'émulateur).
    expect(Object.keys(tel.comptes.rapport().jeton!.identities)).toContain('email');
    expect(r.profil).toMatchObject({ etat: 'cree', pseudo: 'Lia' });
    expect(await enLigne(anonyme)).toMatchObject({ pseudo: 'Lia' });
  });

  it('pierre tombale posée : l’autre appareil n’écrit plus rien, et le dit', async () => {
    const pc = appareil('Michel', { [AMS]: rec(11_000) });
    const tel = appareil('Michel', {});
    const mail = adresse();
    await pc.comptes.creer(mail, 'motdepasse');
    await tel.comptes.connecter(mail, 'motdepasse');
    const uid = pc.a.currentUser!.uid;
    await fsM.setDoc(fsM.doc(pc.db, 'joueurs', uid), { v: 1, maj: fsM.serverTimestamp(), supprime: true });
    tel.stockage.setItem('terramemo.chrono.records', JSON.stringify({ [AMS]: rec(12_000) }));
    expect(await tel.comptes.profilModifie('records')).toMatchObject({ etat: 'supprime' });
    expect(await enLigne(uid)).toMatchObject({ supprime: true });
    expect((await enLigne(uid))!.records).toEqual({});
  });

  it('règles du dépôt (production jusqu’au lot 6) : profil refusé, drapeau posé, l’appareil garde tout', async () => {
    const [host, port] = (hoteFs ?? '').split(':');
    await env.cleanup();
    env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules: REGLES, host, port: Number(port) } });
    try {
      const pc = appareil('Michel', { [AMS]: rec(11_000) });
      const r = await pc.comptes.creer(adresse(), 'motdepasse');
      expect(r.profil).toMatchObject({ etat: 'refuse' });
      expect(pc.comptes.rapport().profil_a_ecrire).toBe(true);
      expect([pc.pseudo(), points(pc.records())]).toEqual(['Michel', { [AMS]: 11_000 }]);
    } finally {
      await env.cleanup();
      env = await initializeTestEnvironment({ projectId: PROJET, firestore: { rules: reglesAvecEssai('return true;'), host, port: Number(port) } });
    }
  });
});
