// Profil d'un compte (J1b, lot 2 ; étude § 5.4) : la fusion pure
// (src/sync/profil.ts), puis la synchro des comptes (src/sync/comptes.ts) sur
// un faux Firebase en mémoire, pour ce que l'émulateur ne sait pas provoquer
// (hors ligne, refus des règles, changement pendant un envoi). Le vrai SDK,
// les vraies règles et deux appareils : tests/profil.test.ts (npm run test:comptes).
import { describe, expect, it, vi } from 'vitest';
import { epreuvesClassees, idEpreuve, lireRecords, periodeSemaine, prendreAvisPseudo, VERSION_BAREME, type RecordChrono } from '../src/epreuve/chrono';
import { creerComptes } from '../src/sync/comptes';
import { appliquer, fusionner, lireRecordsProfil, PROFIL_ABSENT, RECORDS_MAX, type ProfilLu } from '../src/sync/profil';
import { depotSessionMemoire, sessionVide, type Session } from '../src/sync/session';

const AMS = idEpreuve('South America');
const AFR = idEpreuve('Africa');
const EUR = idEpreuve('Europe');
const OCE = idEpreuve('Oceania');
const MAINTENANT = Date.UTC(2026, 10, 7, 8);
const SEMAINE = periodeSemaine(MAINTENANT);
const o = { pseudoLocal: false, periode: SEMAINE };

/** Un record de l'appareil (Amérique du Sud : 12 questions ; barème 2 : points = justes). */
const rec = (justes: number, temps_ms = 60_000, o: Partial<RecordChrono> = {}): RecordChrono => ({ points: justes, justes, questions: 12, temps_ms, date: MAINTENANT - 1000, bareme: VERSION_BAREME, ...o });
const lu = (pseudo: string | null, records: Record<string, unknown> | string | null): ProfilLu => ({
  existe: true,
  supprime: false,
  pseudo,
  records: records === null ? null : typeof records === 'string' ? records : JSON.stringify(records),
});
const recordsDuDoc = (f: { doc: { records?: string } | null }) => JSON.parse(f.doc?.records ?? '{}') as Record<string, RecordChrono>;

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
/** Le stockage d'un appareil ; `base` : le pseudo du compte à son dernier envoi (fusion à trois). */
const avecRecords = (records: Record<string, RecordChrono>, pseudo?: string, base?: { uid: string; pseudo: string | null }) => {
  const s = new Stockage();
  s.setItem('terramemo.chrono.records', JSON.stringify(records));
  if (pseudo) s.setItem('terramemo.pseudo', pseudo);
  if (base) s.setItem('terramemo.pseudo.compte', JSON.stringify(base));
  return s;
};

describe('fusion du profil (pure)', () => {
  it('profil absent : créé avec le pseudo et les records de l’appareil, sans publiable', () => {
    const local = { pseudo: 'Michel', records: new Map([[AMS, rec(11, 60_000, { publiable: { points: 1, justes: 1, questions: 1, temps_ms: 1, date: 1 } })]]) };
    const f = fusionner(PROFIL_ABSENT, local, o);
    expect(f.doc).toMatchObject({ v: 1, pseudo: 'Michel' });
    expect(recordsDuDoc(f)).toEqual({ [AMS]: { points: 11, justes: 11, questions: 12, temps_ms: 60_000, date: MAINTENANT - 1000, bareme: VERSION_BAREME } });
    expect([f.envoyes, f.recus]).toEqual([1, 0]);
    // Un appareil vierge crée quand même son profil (assurerProfil, idempotent).
    expect(fusionner(PROFIL_ABSENT, { pseudo: null, records: new Map() }, o).doc).toEqual({ v: 1 });
  });

  it('records croisés : le meilleur de chaque épreuve, des deux côtés, aucun perdu', () => {
    const enLigne = { [AMS]: rec(9), [AFR]: rec(12), [OCE]: rec(5) };
    const local = { pseudo: 'Michel', records: new Map([[AMS, rec(11)], [AFR, rec(10)], [EUR, rec(8)]]) };
    const f = fusionner(lu('Michel', enLigne), local, o);
    expect(Object.fromEntries(Object.entries(recordsDuDoc(f)).map(([k, r]) => [k, r.points]))).toEqual({ [AMS]: 11, [AFR]: 12, [EUR]: 8, [OCE]: 5 });
    expect([f.envoyes, f.recus]).toEqual([2, 2]);
    // L'appareil reçoit ce que le profil avait de mieux.
    const st = avecRecords(Object.fromEntries(local.records), 'Michel');
    appliquer(st, f, local, SEMAINE);
    expect(Object.fromEntries([...lireRecords(st)].map(([k, r]) => [k, r.points]))).toEqual({ [AMS]: 11, [AFR]: 12, [EUR]: 8, [OCE]: 5 });
    // Refaite sur le résultat : rien à écrire.
    expect(fusionner(lu('Michel', f.doc!.records!), { pseudo: 'Michel', records: lireRecords(st) }, o).doc).toBeNull();
  });

  it('à score égal, le record du profil reste (sa date comprise) : rien à écrire', () => {
    const f = fusionner(lu('Michel', { [AMS]: rec(11, 60_000, { date: 5 }) }), { pseudo: 'Michel', records: new Map([[AMS, rec(11, 60_000, { date: 9 })]]) }, o);
    expect(f.doc).toBeNull();
    expect(f.enLigne[AMS]).toMatchObject({ date: 5 });
    // Moins de temps à points égaux : l'appareil l'emporte.
    expect(fusionner(lu('Michel', { [AMS]: rec(11, 60_000) }), { pseudo: 'Michel', records: new Map([[AMS, rec(11, 50_000)]]) }, o).envoyes).toBe(1);
  });

  it('les semaines passées sont oubliées, des deux côtés ; la semaine en cours reste', () => {
    const vieille = `${AMS}@s1`;
    const courante = `${AMS}@${SEMAINE}`;
    const f = fusionner(lu('Michel', { [vieille]: rec(5), [courante]: rec(7) }), { pseudo: 'Michel', records: new Map([[`${AFR}@s2`, rec(6)]]) }, o);
    expect(Object.keys(recordsDuDoc(f))).toEqual([courante]);
  });

  it('un record d’une autre version : plus récent, gardé tel quel et prioritaire ; plus ancien, il cède au record de l’appareil', () => {
    const futur = { points: 3, mode: 'nouveau', bareme: VERSION_BAREME + 1 };
    const passe = { points: 99, bareme: VERSION_BAREME - 1 };
    const f = fusionner(lu('Michel', { [AMS]: futur, [AFR]: passe, [EUR]: passe }), { pseudo: 'Michel', records: new Map([[AMS, rec(12)], [AFR, rec(10)]]) }, o);
    expect(recordsDuDoc(f)).toEqual({ [AMS]: futur, [AFR]: { ...rec(10) }, [EUR]: passe });
    // Rien de l'autre version n'entre sur l'appareil.
    expect(f.recus).toBe(0);
    // Stable : la même fusion ne réécrit rien (deux versions ne se renvoient pas la balle).
    expect(fusionner(lu('Michel', f.doc!.records!), { pseudo: 'Michel', records: new Map([[AMS, rec(12)], [AFR, rec(10)]]) }, o).doc).toBeNull();
  });

  it('records abîmés du profil : ignorés ; une chaîne illisible ne perd pas ceux de l’appareil', () => {
    const abimes = { [AMS]: { ...rec(12), points: 'beaucoup' }, [AFR]: 'texte', [EUR]: { points: 1 }, [OCE]: { ...rec(12), justes: 13 } };
    const f = fusionner(lu('Michel', abimes), { pseudo: 'Michel', records: new Map([[AMS, rec(9)]]) }, o);
    expect(Object.keys(recordsDuDoc(f))).toEqual([AMS]);
    expect(recordsDuDoc(f)[AMS]!.points).toBe(9);
    expect(f.recus).toBe(0);
    expect(recordsDuDoc(fusionner(lu('Michel', '{pas du json'), { pseudo: null, records: new Map([[AMS, rec(9)]]) }, o))[AMS]!.points).toBe(9);
  });

  it('pseudo : celui du compte l’emporte ; celui de l’appareil s’il est en attente, ou si le profil n’en a pas', () => {
    const local = { pseudo: 'Bob', records: new Map<string, RecordChrono>() };
    expect(fusionner(lu('Michel', null), local, o)).toMatchObject({ pseudo: 'Michel', doc: null });
    expect(fusionner(lu('Michel', null), local, { ...o, pseudoLocal: true })).toMatchObject({ pseudo: 'Bob', doc: { pseudo: 'Bob' } });
    expect(fusionner(lu(null, null), local, o)).toMatchObject({ pseudo: 'Bob', doc: { pseudo: 'Bob' } });
    // Un pseudo du profil que l'appli refuse (« / ») ne s'impose pas.
    expect(fusionner(lu('a/b', null), local, o)).toMatchObject({ pseudo: 'Bob', doc: { pseudo: 'Bob' } });
    // Sans pseudo nulle part : aucun.
    expect(fusionner(lu(null, null), { pseudo: null, records: new Map() }, o)).toMatchObject({ pseudo: null, doc: null });
  });

  it('les 44 épreuves classées, capitales et drapeaux compris, plus les 22 de Minute (retiré, ses records restent), de toujours et de la semaine, aux nombres les plus longs : la chaîne reste sous RECORDS_MAX (étude J2 § 3.4)', () => {
    const classees = epreuvesClassees();
    expect(classees).toHaveLength(44);
    // Minute retiré le 12/11/2026 (décision « Barème et classements ») : ses records restent au profil, sans plus rien publier.
    const epreuves = [...classees, ...classees.filter((e) => e.startsWith('chrono:')).map((e) => e.replace('chrono:', 'minute:'))];
    expect(epreuves).toHaveLength(66);
    // Le pire : des points entiers (barème 2 : les justes), un temps à 17 chiffres (performance.now()), 195 questions, une date à 13 chiffres.
    const pire = (): RecordChrono => ({ points: 194, justes: 194, questions: 195, temps_ms: 2_924_999.9999999995, date: 1_794_787_199_999, bareme: VERSION_BAREME });
    const records = new Map<string, RecordChrono>();
    for (const e of epreuves) for (const k of [e, `${e}@${SEMAINE}`]) records.set(k, pire());
    const f = fusionner(PROFIL_ABSENT, { pseudo: 'Michel', records }, o);
    expect(f.tropGros).toBe(false);
    const n = f.doc!.records!.length;
    expect(Object.keys(recordsDuDoc(f))).toHaveLength(132);
    expect(n).toBeLessThan(RECORDS_MAX);
    // Mesuré : 18 115 caractères, 55 % de la borne (environ 137 par record). Les sujets suivants (mers 2, quiz 4 :
    // 72 épreuves au J2, Minute compris) y ajouteraient 12 records, environ 19 800 caractères au pire (60 %) : la marge tient.
    expect(n).toBeLessThan(RECORDS_MAX * 0.65);
    expect((n / 132) * 144).toBeLessThan(RECORDS_MAX * 0.7);
  });

  it('au-delà de la borne des règles : rien n’est écrit, l’appareil reçoit quand même', () => {
    const records = new Map<string, RecordChrono>();
    for (let i = 0; i < 400; i++) records.set(`${AMS}:${'x'.repeat(40)}${i}`, rec(11));
    const f = fusionner(lu('Michel', { [AFR]: rec(12) }), { pseudo: 'Michel', records }, o);
    expect(JSON.stringify(f.enLigne).length).toBeGreaterThan(RECORDS_MAX);
    expect(f).toMatchObject({ tropGros: true, doc: null, recus: 1 });
  });

  it('appliquer : un record fait pendant l’appel n’est pas écrasé ; un pseudo changé entre-temps reste', () => {
    const avant = { pseudo: 'Bob', records: new Map([[AMS, rec(9)]]) };
    const f = fusionner(lu('Michel', { [AMS]: rec(10), [AFR]: rec(8) }), avant, o);
    // Pendant l'appel : un record meilleur en Amérique du Sud, et le pseudo changé.
    const st = avecRecords({ [AMS]: rec(12) }, 'Zoé');
    const a = appliquer(st, f, avant, SEMAINE);
    expect(lireRecords(st).get(AMS)!.points).toBe(12);
    expect(lireRecords(st).get(AFR)!.points).toBe(8);
    expect(st.getItem('terramemo.pseudo')).toBe('Zoé');
    expect(a).toMatchObject({ pseudoPris: false, ancienPseudo: null, records: true });
    // Sans changement entre-temps : le pseudo du compte est pris, l'ancien est dit.
    const st2 = avecRecords({ [AMS]: rec(9) }, 'Bob');
    expect(appliquer(st2, f, avant, SEMAINE)).toMatchObject({ pseudoPris: true, ancienPseudo: 'Bob' });
    expect(st2.getItem('terramemo.pseudo')).toBe('Michel');
  });

  it('appliquer garde le meilleur score publiable : un record reçu trop rapide pour les règles ne l’efface pas', () => {
    // 12 justes en 1 s : les règles refuseraient ce score (moins de 0,2 s par question).
    const rapide = rec(12, 1_000);
    const avant = { pseudo: 'Michel', records: new Map([[AMS, rec(10)]]) };
    const f = fusionner(lu('Michel', { [AMS]: rapide }), avant, o);
    const st = avecRecords({ [AMS]: rec(10) }, 'Michel');
    appliquer(st, f, avant, SEMAINE);
    const r = lireRecords(st).get(AMS)!;
    expect(r.points).toBe(12);
    expect(r.publiable).toMatchObject({ points: 10 });
  });
});

// Barème 1 → 2 (décision « Barème et classements » du 12/11/2026, #30) : un
// profil écrit avant garde des records en points de proximité (~1 000 par
// juste) ; convertis à la lecture, jamais comparés à ceux de l'appareil
// (points = justes), jamais effacés.
describe('profil du barème 1, converti', () => {
  /** Un record du barème 1 au profil (Amérique du Sud, 12 questions). */
  const v1 = (points: number, justes: number, temps_ms = 60_000, date = MAINTENANT - 5000) => ({ points, justes, questions: 12, temps_ms, date, bareme: 1 });

  it('lireRecordsProfil : une entrée v1 relue à points = justes, au barème 2, le reste gardé ; une v1 illisible reste au barème 1', () => {
    const lus = lireRecordsProfil(JSON.stringify({ [AMS]: v1(11_351, 11), [AFR]: { points: 99, bareme: 1 }, [EUR]: { ...v1(8_000, 8), justes: '8' }, [OCE]: rec(5) }));
    expect(lus.get(AMS)).toEqual({ points: 11, justes: 11, questions: 12, temps_ms: 60_000, date: MAINTENANT - 5000, bareme: VERSION_BAREME });
    expect(lus.get(AFR)).toEqual({ points: 99, bareme: 1 });
    expect(lus.get(EUR)).toMatchObject({ points: 8_000, bareme: 1 });
    expect(lus.get(OCE)).toEqual(rec(5));
  });

  it('lireRecordsProfil : converti, un record de la semaine qui bat celui de toujours le remplace ; une semaine moins bonne, non', () => {
    // Toujours : 9 justes et des erreurs proches (10 200) ; la semaine : 10 justes et des erreurs lointaines (10 050).
    const lus = lireRecordsProfil(JSON.stringify({ [AMS]: v1(10_200, 9, 60_000, 1), [`${AMS}@${SEMAINE}`]: v1(10_050, 10, 70_000, 2), [AFR]: v1(11_000, 11), [`${AFR}@${SEMAINE}`]: v1(10_400, 10) }));
    const s10 = { points: 10, justes: 10, questions: 12, temps_ms: 70_000, date: 2, bareme: 2 };
    expect(lus.get(AMS)).toEqual(s10);
    expect(lus.get(`${AMS}@${SEMAINE}`)).toEqual(s10);
    expect(lus.get(AFR)).toMatchObject({ points: 11, justes: 11 });
  });

  it('une fusion profil v1 + appareil v2 ne compare jamais deux échelles : 9 justes v1 (10 200 points) ne battent pas 10 justes v2', () => {
    const f = fusionner(lu('Michel', { [AMS]: v1(10_200, 9) }), { pseudo: 'Michel', records: new Map([[AMS, rec(10, 70_000)]]) }, o);
    expect(recordsDuDoc(f)[AMS]).toEqual(rec(10, 70_000));
    expect([f.envoyes, f.recus]).toEqual([1, 0]);
    // Dans l'autre sens : 11 justes v1 (11 351 points) battent 10 justes v2, et l'appareil les reçoit en justes.
    const g = fusionner(lu('Michel', { [AMS]: v1(11_351, 11) }), { pseudo: 'Michel', records: new Map([[AMS, rec(10)]]) }, o);
    expect([g.envoyes, g.recus]).toEqual([0, 1]);
    const st = avecRecords({ [AMS]: rec(10) }, 'Michel');
    appliquer(st, g, { pseudo: 'Michel', records: new Map([[AMS, rec(10)]]) }, SEMAINE);
    expect(lireRecords(st).get(AMS)).toMatchObject({ points: 11, justes: 11, bareme: VERSION_BAREME, date: MAINTENANT - 5000 });
  });

  it('le profil réécrit est en v2, même quand il gagne partout ; une seconde fusion n’écrit rien (pas de va-et-vient)', () => {
    const profil = { [AMS]: v1(11_351, 11), [`${AFR}@${SEMAINE}`]: v1(7_420, 7), [EUR]: v1(9, 9) };
    const local = { pseudo: 'Michel', records: new Map([[AMS, rec(10)]]) };
    const f = fusionner(lu('Michel', profil), local, o);
    expect(f.doc).not.toBeNull();
    const ecrit = recordsDuDoc(f);
    // La semaine de l'Afrique, sans record de toujours, lui en donne un (lireRecordsProfil).
    expect(Object.values(ecrit).map((r) => r.bareme)).toEqual([2, 2, 2, 2]);
    expect(Object.fromEntries(Object.entries(ecrit).map(([k, r]) => [k, r.points]))).toEqual({ [AMS]: 11, [AFR]: 7, [`${AFR}@${SEMAINE}`]: 7, [EUR]: 9 });
    expect(ecrit[AMS]).toEqual({ points: 11, justes: 11, questions: 12, temps_ms: 60_000, date: MAINTENANT - 5000, bareme: 2 });
    // L'appareil reçoit les quatre, puis une seconde fusion sur le profil écrit ne change plus rien.
    const st = avecRecords({ [AMS]: rec(10) }, 'Michel');
    appliquer(st, f, local, SEMAINE);
    const g = fusionner(lu('Michel', f.doc!.records!), { pseudo: 'Michel', records: lireRecords(st) }, o);
    expect([g.doc, g.envoyes, g.recus]).toEqual([null, 0, 0]);
  });
});

// --- Synchro des comptes, sur un faux Firebase ---------------------------------

const err = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

/** Un faux Firestore lite : doc, getDoc, runTransaction (écritures appliquées au commit), serverTimestamp. */
function fauxFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const etat = { panne: null as string | null, lectures: 0, ecritures: 0, avantLecture: null as null | (() => Promise<void>) };
  const snap = (d: Record<string, unknown> | undefined) => ({ exists: () => d !== undefined, data: () => (d ? structuredClone(d) : undefined) });
  const lire = async (c: string) => {
    if (etat.avantLecture) await etat.avantLecture();
    if (etat.panne) throw err(etat.panne);
    etat.lectures++;
    return snap(docs.get(c));
  };
  const fs = {
    doc: (_db: unknown, ...chemin: string[]) => ({ chemin: chemin.join('/') }),
    getDoc: (r: { chemin: string }) => lire(r.chemin),
    serverTimestamp: () => 'heure-du-serveur',
    runTransaction: async (_db: unknown, f: (t: unknown) => Promise<unknown>) => {
      const ecrits: [string, Record<string, unknown>][] = [];
      const res = await f({ get: (r: { chemin: string }) => lire(r.chemin), set: (r: { chemin: string }, d: Record<string, unknown>) => void ecrits.push([r.chemin, d]) });
      if (etat.panne) throw err(etat.panne);
      for (const [c, d] of ecrits) {
        docs.set(c, structuredClone(d));
        etat.ecritures++;
      }
      return res;
    },
  };
  return { fs, docs, etat };
}

function fauxCompte(uid = 'u1', email = 'ana@exemple.fr') {
  return {
    uid,
    email,
    isAnonymous: false,
    emailVerified: true,
    providerData: [{ providerId: 'password' }],
    getIdToken: async () => 'jeton',
    getIdTokenResult: async () => ({ claims: { firebase: { identities: { email: [email] }, sign_in_provider: 'password' } } }),
    reload: async () => undefined,
  };
}

/** Un appareil : sa session, son stockage, ses comptes ; `ff` : le Firestore partagé. */
function appareil(ff: ReturnType<typeof fauxFirestore>, o: { connecte?: boolean; session?: Partial<Session>; stockage?: Stockage; coupee?: boolean } = {}) {
  const a = { currentUser: o.connecte === false ? null : (fauxCompte() as ReturnType<typeof fauxCompte> | null) };
  const auth = {
    onAuthStateChanged: () => () => undefined,
    createUserWithEmailAndPassword: async () => {
      a.currentUser = fauxCompte();
      return { user: a.currentUser };
    },
    sendEmailVerification: async () => undefined,
    signInWithEmailAndPassword: async () => {
      a.currentUser = fauxCompte();
      return { user: a.currentUser };
    },
    signOut: async () => {
      a.currentUser = null;
    },
  };
  const session = depotSessionMemoire(o.session === undefined ? { ...sessionVide('essai'), uid: 'u1', fournisseurs: ['password'], adresse: 'ana@exemple.fr' } : { ...sessionVide('essai'), ...o.session });
  const stockage = o.stockage ?? new Stockage();
  const republier = vi.fn(async () => undefined);
  const comptes = creerComptes({
    session,
    version: 'essai',
    service: async () => ({ m: { auth, fs: ff.fs }, db: {}, a }) as never,
    stockage: () => stockage,
    coupee: () => !!o.coupee,
    republier,
    maintenant: () => MAINTENANT,
  });
  return { comptes, session, stockage, republier, a };
}

const profilEnLigne = (ff: ReturnType<typeof fauxFirestore>, uid = 'u1') => ff.docs.get(`joueurs/${uid}`);

describe('synchro du profil (faux Firebase)', () => {
  it('invité (anonyme compris) : un record ne lit ni n’écrit rien en ligne, et ne pose aucun drapeau', async () => {
    const ff = fauxFirestore();
    const d = appareil(ff, { session: { uid: null } });
    expect(await d.comptes.profilModifie('records')).toBeNull();
    expect([ff.etat.lectures, ff.etat.ecritures]).toEqual([0, 0]);
    expect((await d.session.lire())?.profil_a_ecrire).toBe(false);
  });

  it('un record nouveau d’un compte : le profil le reçoit, le drapeau tombe', async () => {
    const ff = fauxFirestore();
    const d = appareil(ff, { stockage: avecRecords({ [AMS]: rec(11) }, 'Michel') });
    const r = await d.comptes.profilModifie('records');
    expect(r).toMatchObject({ etat: 'cree', pseudo: 'Michel', envoyes: 1 });
    expect(profilEnLigne(ff)).toMatchObject({ v: 1, pseudo: 'Michel', maj: 'heure-du-serveur' });
    expect(await d.session.lire()).toMatchObject({ profil_a_ecrire: false });
    // Une lecture, dans la transaction (§ 5.7 : 1 lecture et 1 écriture par record).
    expect([ff.etat.lectures, ff.etat.ecritures]).toEqual([1, 1]);
    // L'ouverture, rien de neuf : une lecture, aucune écriture.
    expect(await d.comptes.synchroniserProfil()).toMatchObject({ etat: 'a_jour' });
    expect([ff.etat.lectures, ff.etat.ecritures]).toEqual([2, 1]);
  });

  it('hors ligne : le drapeau reste, rien n’est perdu ; la synchro suivante envoie', async () => {
    const ff = fauxFirestore();
    const d = appareil(ff, { stockage: avecRecords({ [AMS]: rec(11) }, 'Michel') });
    ff.etat.panne = 'unavailable';
    expect(await d.comptes.profilModifie('records')).toMatchObject({ etat: 'echec' });
    expect(await d.session.lire()).toMatchObject({ profil_a_ecrire: true });
    expect(d.comptes.rapport().profil_a_ecrire).toBe(true);
    ff.etat.panne = null;
    expect(await d.comptes.synchroniserProfil()).toMatchObject({ etat: 'cree' });
    expect(await d.session.lire()).toMatchObject({ profil_a_ecrire: false });
  });

  it('refus des règles (joueurs/ fermé jusqu’au lot 6) : « refuse », le drapeau reste', async () => {
    const ff = fauxFirestore();
    const d = appareil(ff, { stockage: avecRecords({ [AMS]: rec(11) }) });
    ff.etat.panne = 'permission-denied';
    expect(await d.comptes.synchroniserProfil()).toMatchObject({ etat: 'refuse' });
    expect(await d.session.lire()).toMatchObject({ profil_a_ecrire: true });
    expect(d.comptes.rapport().erreurs.map((e) => e.code)).toContain('permission-denied');
  });

  it('synchro coupée (driver) : aucune lecture de joueurs/', async () => {
    const ff = fauxFirestore();
    const d = appareil(ff, { coupee: true, stockage: avecRecords({ [AMS]: rec(11) }) });
    expect(await d.comptes.profilModifie('records')).toMatchObject({ etat: 'coupee' });
    expect(ff.etat.lectures).toBe(0);
  });

  it('session perdue : le changement est noté, rien ne part ; il part à la reconnexion au même compte', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel' });
    const d = appareil(ff, { connecte: false, stockage: avecRecords({}, 'Michou', { uid: 'u1', pseudo: 'Michel' }) });
    expect(await d.comptes.profilModifie('pseudo')).toMatchObject({ etat: 'sans_compte' });
    expect(await d.session.lire()).toMatchObject({ profil_a_ecrire: true });
    expect(ff.etat.lectures).toBe(0);
    const r = await d.comptes.connecter('ana@exemple.fr', 'motdepasse');
    // Même compte : le pseudo choisi pendant la session perdue l'emporte.
    expect(r.profil).toMatchObject({ etat: 'ecrit', pseudo: 'Michou', ancienPseudo: null });
    expect(profilEnLigne(ff)).toMatchObject({ pseudo: 'Michou' });
  });

  it('connexion d’un autre appareil : le pseudo du compte remplace celui de l’appareil (dit une fois), records republiés sous lui', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel', records: JSON.stringify({ [AFR]: rec(12) }) });
    const d = appareil(ff, { connecte: false, session: { uid: null }, stockage: avecRecords({ [AMS]: rec(11) }, 'Bob') });
    const r = await d.comptes.connecter('ana@exemple.fr', 'motdepasse');
    expect(r.profil).toMatchObject({ etat: 'ecrit', pseudo: 'Michel', ancienPseudo: 'Bob', recus: 1, envoyes: 1 });
    expect(d.stockage.getItem('terramemo.pseudo')).toBe('Michel');
    expect([...lireRecords(d.stockage).keys()].sort()).toEqual([AFR, AMS].sort());
    expect(d.republier).toHaveBeenCalledWith('Michel');
  });

  it('un record seul en attente ne remet pas au compte un pseudo changé depuis sur un autre appareil', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel' });
    const telephone = appareil(ff, { stockage: avecRecords({}, 'Michel', { uid: 'u1', pseudo: 'Michel' }) });
    const pc = appareil(ff, { stockage: avecRecords({}, 'Michel', { uid: 'u1', pseudo: 'Michel' }) });
    // Le téléphone, hors ligne, fait un record ; le PC change le pseudo.
    ff.etat.panne = 'unavailable';
    telephone.stockage.setItem('terramemo.chrono.records', JSON.stringify({ [AMS]: rec(11) }));
    await telephone.comptes.profilModifie('records');
    ff.etat.panne = null;
    expect(await pc.comptes.changerPseudo('Michel D')).toMatchObject({ etat: 'ecrit', pseudo: 'Michel D' });
    // Le téléphone revient : son record part, il prend le pseudo du PC.
    expect(await telephone.comptes.synchroniserProfil()).toMatchObject({ etat: 'ecrit', pseudo: 'Michel D', ancienPseudo: 'Michel' });
    expect(profilEnLigne(ff)).toMatchObject({ pseudo: 'Michel D' });
    expect(JSON.parse(profilEnLigne(ff)!.records as string)[AMS].points).toBe(11);
  });

  it('un pseudo changé pendant un envoi en cours n’est pas perdu : une seconde passe l’envoie, puis le drapeau tombe', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel' });
    const d = appareil(ff, { stockage: avecRecords({ [AMS]: rec(11) }, 'Michel') });
    let lacher!: () => void;
    ff.etat.avantLecture = () => new Promise<void>((ok) => (lacher = ok));
    const premiere = d.comptes.profilModifie('records');
    await new Promise((r) => setTimeout(r, 0));
    // Pendant la lecture : le pseudo change sur l'appareil.
    d.stockage.setItem('terramemo.pseudo', 'Zoé');
    const seconde = d.comptes.profilModifie('pseudo');
    ff.etat.avantLecture = null;
    lacher();
    await premiere;
    expect(await seconde).toMatchObject({ pseudo: 'Zoé' });
    expect(profilEnLigne(ff)).toMatchObject({ pseudo: 'Zoé' });
    expect(d.stockage.getItem('terramemo.pseudo')).toBe('Zoé');
    expect(await d.session.lire()).toMatchObject({ profil_a_ecrire: false });
  });

  it('un pseudo écrit sur l’appareil juste avant le départ d’une passe, son drapeau pas encore posé : il l’emporte quand même', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel' });
    const d = appareil(ff, { stockage: avecRecords({}, 'Michel', { uid: 'u1', pseudo: 'Michel' }) });
    // Le pseudo est dans le localStorage, la passe part (ouverture) avant que profilModifie ait écrit la session.
    d.stockage.setItem('terramemo.pseudo', 'Zoé');
    expect(await d.comptes.synchroniserProfil()).toMatchObject({ etat: 'ecrit', pseudo: 'Zoé', ancienPseudo: null });
    expect(profilEnLigne(ff)).toMatchObject({ pseudo: 'Zoé' });
  });

  it('compte créé dont le profil n’a pas pu s’écrire : le pseudo du créateur reste celui du compte, même si un autre appareil écrit le profil avant', async () => {
    const ff = fauxFirestore();
    const pc = appareil(ff, { connecte: false, session: { uid: null }, stockage: avecRecords({ [AMS]: rec(11) }, 'Michel') });
    ff.etat.panne = 'permission-denied';
    expect((await pc.comptes.creer('ana@exemple.fr', 'motdepasse')).profil).toMatchObject({ etat: 'refuse' });
    expect(pc.comptes.rapport().profil_a_ecrire).toBe(true);
    ff.etat.panne = null;
    const tel = appareil(ff, { connecte: false, session: { uid: null }, stockage: avecRecords({}, 'Bob') });
    expect((await tel.comptes.connecter('ana@exemple.fr', 'motdepasse')).profil).toMatchObject({ etat: 'cree', pseudo: 'Bob' });
    // Le PC rouvre : son pseudo, choisi à la création, l'emporte, sans être remplacé ni republié.
    expect(await pc.comptes.demarrer()).toMatchObject({ etat: 'compte' });
    expect(pc.comptes.rapport().profil).toMatchObject({ etat: 'ecrit', pseudo: 'Michel', ancienPseudo: null });
    expect(pc.stockage.getItem('terramemo.pseudo')).toBe('Michel');
    expect(pc.republier).not.toHaveBeenCalled();
    // Le téléphone le suit à sa prochaine ouverture, et le dira une fois.
    await tel.comptes.demarrer();
    expect(tel.stockage.getItem('terramemo.pseudo')).toBe('Michel');
    expect(prendreAvisPseudo(tel.stockage)).toBe('Bob');
    expect(prendreAvisPseudo(tel.stockage)).toBeNull();
  });

  it('déconnexion hors ligne avec un pseudo pas encore parti : dite d’abord ; « quand même » l’efface de l’appareil, le compte garde le sien', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel' });
    const d = appareil(ff, { stockage: avecRecords({}, 'Michel', { uid: 'u1', pseudo: 'Michel' }) });
    ff.etat.panne = 'unavailable';
    expect(await d.comptes.changerPseudo('Neo')).toMatchObject({ etat: 'echec' });
    // § 3.4 : ce qui n'est pas parti est dit, rien n'est fait.
    expect(await d.comptes.deconnecter()).toMatchObject({ fait: false, profil: false });
    expect(d.stockage.getItem('terramemo.pseudo')).toBe('Neo');
    expect(await d.comptes.deconnecter({ quandMeme: true })).toEqual({ fait: true });
    // L'appareil repart en invité vierge : pseudo, base du pseudo et records effacés.
    expect(['terramemo.pseudo', 'terramemo.pseudo.compte', 'terramemo.chrono.records'].map((k) => d.stockage.getItem(k))).toEqual([null, null, null]);
    ff.etat.panne = null;
    const r = await d.comptes.connecter('ana@exemple.fr', 'motdepasse');
    expect(r.profil).toMatchObject({ pseudo: 'Michel' });
    expect(profilEnLigne(ff)).toMatchObject({ pseudo: 'Michel' });
  });

  it('un pseudo remplacé par celui du compte à une ouverture : l’ancien est gardé pour être dit une fois', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel D' });
    const d = appareil(ff, { stockage: avecRecords({}, 'Michel', { uid: 'u1', pseudo: 'Michel' }) });
    await d.comptes.demarrer();
    expect(d.stockage.getItem('terramemo.pseudo')).toBe('Michel D');
    expect(d.republier).toHaveBeenCalledWith('Michel D');
    expect(prendreAvisPseudo(d.stockage)).toBe('Michel');
  });

  it('pierre tombale : rien n’est écrit ni appliqué', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, supprime: true });
    const d = appareil(ff, { stockage: avecRecords({ [AMS]: rec(11) }, 'Michel') });
    expect(await d.comptes.profilModifie('records')).toMatchObject({ etat: 'supprime' });
    expect(profilEnLigne(ff)).toEqual({ v: 1, supprime: true });
    expect(ff.etat.ecritures).toBe(0);
  });

  it('connexion à un autre compte : le drapeau et le pseudo en attente de la session d’avant ne valent pas pour lui', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel' });
    const d = appareil(ff, { connecte: false, session: { uid: 'autre', profil_a_ecrire: true }, stockage: avecRecords({}, 'Bob', { uid: 'autre', pseudo: 'Robert' }) });
    const r = await d.comptes.connecter('ana@exemple.fr', 'motdepasse');
    expect(r.profil).toMatchObject({ pseudo: 'Michel', ancienPseudo: 'Bob' });
  });

  it('ouverture de l’appli (demarrer) : le profil relu, ce qu’un autre appareil a fait arrive', async () => {
    const ff = fauxFirestore();
    ff.docs.set('joueurs/u1', { v: 1, pseudo: 'Michel', records: JSON.stringify({ [AFR]: rec(12) }) });
    const d = appareil(ff, { stockage: avecRecords({}, 'Michel') });
    expect(await d.comptes.demarrer()).toMatchObject({ etat: 'compte' });
    expect(lireRecords(d.stockage).get(AFR)!.points).toBe(12);
    expect(d.comptes.rapport().profil).toMatchObject({ etat: 'a_jour', recus: 1 });
  });

  it('déconnexion : ce qui attend part d’abord, puis les drapeaux tombent', async () => {
    const ff = fauxFirestore();
    const d = appareil(ff, { session: { uid: 'u1', fournisseurs: ['password'], profil_a_ecrire: true }, stockage: avecRecords({ [AMS]: rec(11) }, 'Michel') });
    await d.comptes.deconnecter();
    expect(profilEnLigne(ff)).toMatchObject({ pseudo: 'Michel' });
    expect(await d.session.lire()).toMatchObject({ uid: null, profil_a_ecrire: false });
  });
});
