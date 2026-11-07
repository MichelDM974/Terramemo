// Outil du propriétaire (J1b, lot 5b ; étude § 7.5, D33 a), scripts/admin/,
// lancé tel qu'à la main (node scripts/admin/outil.mjs … --json) sur les
// émulateurs Auth et Firestore (`npm run test:admin`). Le monde est écrit par
// le SDK Admin (hors des règles). Quatre preuves : à blanc, rien ne change ;
// --appliquer --attendu <empreinte> fait exactement le plan affiché à blanc
// (l'état d'après = l'état d'avant moins ce plan), et rien si le plan a
// changé depuis ; un pseudo voisin (casse, accents, masque des
// règles) garde sa place ; relancée, une commande n'a plus rien à faire.
// Plus les refus de cible (un seul émulateur, CI, clé absente, clé du dépôt,
// clé d'un autre projet), sans émulateurs, donc aussi dans npm test.
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const hoteAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const hoteFs = process.env.FIRESTORE_EMULATOR_HOST;
const PROJET = 'demo-terramemo';
const RACINE = fileURLToPath(new URL('..', import.meta.url));
const OUTIL = join(RACINE, 'scripts', 'admin', 'outil.mjs');
const JOUR = 86_400_000;
const HEURE = 3_600_000;
/** Un HOME vide : aucune clé ne peut y être trouvée. */
const MAISON_VIDE = mkdtempSync(join(tmpdir(), 'terramemo-admin-'));

interface Sortie {
  code: number;
  stdout: string;
  stderr: string;
}

/** Lance l'outil comme à la main ; `env` complète (ou retire, par undefined) l'environnement du test. */
function lancer(args: string[], env: Record<string, string | undefined> = {}): Promise<Sortie> {
  const e: Record<string, string | undefined> = { ...process.env, HOME: MAISON_VIDE, TERRAMEMO_CLE_ADMIN: undefined, TERRAMEMO_MAINTENANT: undefined, ...env };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return new Promise((ok) => {
    execFile('node', [OUTIL, ...args], { env: e as NodeJS.ProcessEnv, cwd: RACINE }, (err, stdout, stderr) => {
      ok({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr });
    });
  });
}

type Action =
  | { type: 'lots'; uid: string; chemins: string[] }
  | { type: 'doc'; quoi: string; chemin: string }
  | { type: 'comptes'; uids: string[] }
  | { type: 'bloquer'; uid: string }
  | { type: 'dater'; chemin: string };

interface Rendu {
  projet: string;
  emulateurs: boolean;
  applique: boolean;
  erreur?: string;
  taches: { tache: string; notes: string[]; actions: Action[]; faites: number; empreinte?: string; releve?: { uid: string; lots: number; octets?: number; compte: string; tombe?: boolean }[] }[];
}

describe('outil du propriétaire : cible', () => {
  it('refuse un seul émulateur, la CI, une clé absente, une clé du dépôt, une clé d’un autre projet', async () => {
    const sans = { FIRESTORE_EMULATOR_HOST: undefined, FIREBASE_AUTH_EMULATOR_HOST: undefined, CI: undefined };
    const seul = await lancer(['releve'], { ...sans, FIRESTORE_EMULATOR_HOST: '127.0.0.1:1' });
    expect(seul.code).toBe(2);
    expect(seul.stderr).toContain('sans FIREBASE_AUTH_EMULATOR_HOST');
    const ci = await lancer(['releve'], { ...sans, CI: 'true' });
    expect(ci.code).toBe(2);
    expect(ci.stderr).toContain('Pas de vrai projet en CI');
    const absente = await lancer(['releve'], sans);
    expect(absente.code).toBe(2);
    expect(absente.stderr).toContain('Aucune clé du compte de service');
    const depot = await lancer(['releve'], { ...sans, TERRAMEMO_CLE_ADMIN: join(RACINE, 'package.json') });
    expect(depot.code).toBe(2);
    expect(depot.stderr).toContain('est dans le dépôt git');
    // Un autre dépôt (le clone principal vu d'un worktree, par exemple) : refusé aussi.
    const autreDepot = join(MAISON_VIDE, 'autre-depot');
    mkdirSync(join(autreDepot, '.git'), { recursive: true });
    mkdirSync(join(autreDepot, 'scripts'));
    const cleAutreDepot = join(autreDepot, 'scripts', 'admin-cle.json');
    writeFileSync(cleAutreDepot, JSON.stringify({ type: 'service_account', project_id: 'terramemo-geo' }));
    const ailleurs = await lancer(['releve'], { ...sans, TERRAMEMO_CLE_ADMIN: cleAutreDepot });
    expect(ailleurs.code).toBe(2);
    expect(ailleurs.stderr).toContain(`est dans le dépôt git ${autreDepot}`);
    // Un lien hors de tout dépôt vers une clé d'un dépôt : refusé (le lien est suivi).
    const lien = join(MAISON_VIDE, 'lien.json');
    symlinkSync(cleAutreDepot, lien);
    const parLien = await lancer(['releve'], { ...sans, TERRAMEMO_CLE_ADMIN: lien });
    expect(parLien.code).toBe(2);
    expect(parLien.stderr).toContain(`est dans le dépôt git ${autreDepot}`);
    const introuvable = await lancer(['releve'], { ...sans, TERRAMEMO_CLE_ADMIN: join(MAISON_VIDE, 'absente.json') });
    expect(introuvable.code).toBe(2);
    expect(introuvable.stderr).toContain('Clé introuvable');
    const autre = join(MAISON_VIDE, 'autre.json');
    writeFileSync(autre, JSON.stringify({ type: 'service_account', project_id: 'autre-projet' }));
    const etrangere = await lancer(['releve'], { ...sans, TERRAMEMO_CLE_ADMIN: autre });
    expect(etrangere.code).toBe(2);
    expect(etrangere.stderr).toContain('pas de terramemo-geo');
    const horloge = await lancer(['releve'], { ...sans, TERRAMEMO_MAINTENANT: '2030-01-01' });
    expect(horloge.code).toBe(2);
    expect(horloge.stderr).toContain('TERRAMEMO_MAINTENANT');
    const tournee = await lancer(['tournee', '--appliquer', '--attendu', '0123456789ab'], sans);
    expect(tournee.code).toBe(2);
    expect(tournee.stderr).toContain('à blanc seulement');
    // --appliquer sans l'empreinte du plan relu : refusé avant toute lecture.
    const sansEmpreinte = await lancer(['demandes', '--appliquer'], sans);
    expect(sansEmpreinte.code).toBe(2);
    expect(sansEmpreinte.stderr).toContain('--appliquer --attendu <empreinte>');
  }, 30_000);
});

describe('outil du propriétaire : le SDK suit la cible', () => {
  /** Du JavaScript brut, sans types : importé par un chemin calculé. */
  const module = async <T>(nom: string) => (await import(pathToFileURL(join(RACINE, 'scripts', 'admin', nom)).href)) as T;
  type Ouvrir = (c: object) => Promise<{ app: { delete(): Promise<void> } }>;

  it('refuse d’ouvrir le SDK si process.env ne vise pas la cible lue (env injecté)', async () => {
    const { ouvrir } = await module<{ ouvrir: Ouvrir }>('connexion.mjs');
    const { principal } = await module<{ principal: (argv: string[], env: object, sortie: (s: string) => void) => Promise<number> }>('outil.mjs');
    const ailleurs = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:1', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:2' };
    // Des émulateurs que process.env ne nomme pas : le SDK irait ailleurs (au vrai projet, sans émulateurs posés).
    await expect(ouvrir({ emulateurs: true, projet: PROJET, hotes: { firestore: ailleurs.FIRESTORE_EMULATOR_HOST, auth: ailleurs.FIREBASE_AUTH_EMULATOR_HOST } })).rejects.toThrow('ne vise pas la cible');
    const dit: string[] = [];
    await expect(principal(['inactifs', '--appliquer', '--attendu', '0123456789ab'], ailleurs, (l) => dit.push(l))).rejects.toThrow('ne vise pas la cible');
    expect(dit).toEqual([]); // pas même « aux émulateurs : rien ne touche le vrai projet »
    // Le vrai projet alors que process.env pose les émulateurs.
    const garde = { ...process.env };
    Object.assign(process.env, ailleurs);
    try {
      await expect(ouvrir({ emulateurs: false, projet: 'terramemo-geo', cle: join(MAISON_VIDE, 'absente.json') })).rejects.toThrow('ne vise pas la cible');
    } finally {
      for (const k of Object.keys(ailleurs)) {
        if (garde[k] === undefined) delete process.env[k];
        else process.env[k] = garde[k];
      }
    }
  });
});

describe.skipIf(!hoteAuth || !hoteFs)('outil du propriétaire (émulateurs Auth et Firestore)', () => {
  let app: App;
  let auth: Auth;
  let db: Firestore;
  let T = 0;

  beforeAll(() => {
    process.env.METADATA_SERVER_DETECTION ??= 'none';
    app = initializeApp({ projectId: PROJET }, 'test-admin');
    auth = getAuth(app);
    db = getFirestore(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${hoteAuth}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
    await fetch(`http://${hoteFs}/emulator/v1/projects/${PROJET}/databases/(default)/documents`, { method: 'DELETE' });
    T = Date.now();
  });

  const ts = (ms: number) => Timestamp.fromMillis(ms);
  const lot = (uid: string, i: number) => db.doc(`joueurs/${uid}/lots/${String(i).padStart(36, '0')}`).set({ v: 1, appareil: 'a'.repeat(36), seance: null, fin: ts(T), n: 2, evenements: 'x'.repeat(100 * (i + 1)) });
  const profil = (uid: string, pseudo: string) => db.doc(`joueurs/${uid}`).set({ v: 1, pseudo, records: '{}', maj: ts(T) });
  const tombe = (uid: string, maj: number) => db.doc(`joueurs/${uid}`).set({ v: 1, maj: ts(maj), supprime: true });
  const place = (epreuve: string, periode: string, cle: string, pseudo: string, points: number, date: number) =>
    db.doc(`classements/${epreuve}/periodes/${periode}/scores/${cle}`).set({ pseudo, points, justes: 1, questions: 1, temps_ms: 5000, date: ts(date), bareme: 1 });

  /** Le monde commun : comptes et données de chaque cas des tâches. */
  async function monde() {
    await auth.createUser({ uid: 'actif', email: 'actif@x.fr', password: 'motdepasse' });
    await auth.createUser({ uid: 'enroute', email: 'enroute@x.fr', password: 'motdepasse' });
    await auth.createUser({ uid: 'abuseur', email: 'abuseur@x.fr', password: 'motdepasse' });
    await auth.createUser({ uid: 'invite' }); // sans fournisseur : un invité
    await profil('actif', 'Actif');
    for (const i of [0, 1]) await lot('actif', i);
    await profil('fantome', 'Fantome'); // plus de compte : orphelin
    for (const i of [0, 1, 2]) await lot('fantome', i);
    await lot('fantome2', 0); // des lots sans profil ni compte
    await tombe('parti', T - 2 * JOUR); // compte parti, lots vides : effacée
    await tombe('parti2', T - 2 * JOUR); // compte parti, lots restants
    for (const i of [0, 1]) await lot('parti2', i);
    await tombe('enroute', T - 2 * JOUR); // compte encore là : signalée
    await lot('enroute', 0);
    await tombe('recent', T - HEURE); // moins d'un jour : laissée
    await profil('abuseur', 'Abus');
    for (const i of [0, 1]) await lot('abuseur', i);
    // Demandes : « Élodie », et deux pour « Michel » (même clé : ensemble).
    await db.doc('demandes/parti').set({ pseudo: 'Élodie', cree: ts(T - 2 * JOUR) });
    await db.doc('demandes/parti2').set({ pseudo: 'michel', cree: ts(T - 2 * JOUR) });
    await db.doc('demandes/recent').set({ pseudo: 'Michel', cree: ts(T - HEURE) });
    await place('general', 'toujours', 'élodie', 'Élodie', 9000, T - 3 * JOUR);
    await place('general', 'toujours', 'ölodie', 'Élodie', 8000, T - 3 * JOUR); // masque des règles : même pseudo, autre clé
    await place('general', 'toujours', 'elodie', 'Elodie', 7000, T - 3 * JOUR); // sans accent
    await place('general', 'toujours', 'michel', 'Michel', 6000, T - 3 * JOUR);
    await place('general', 'toujours', 'MICHEL', 'MICHEL', 5000, T - 3 * JOUR); // casse (écrite hors des règles)
    await place('general', 'toujours', 'michél', 'Michél', 4000, T - 3 * JOUR);
    await place('general', 'toujours', 'michel2', 'Michel2', 3000, T - 3 * JOUR);
    await place('chrono:localiser:tous', 's2900', 'élodie', 'Élodie', 1000, T - 10 * JOUR); // une semaine passée
    await place('chrono:localiser:Africa', 'toujours', 'élodie', 'élodie', 2000, T); // après la demande : à juger
    await place('minute:localiser:reunion', 'toujours', 'michel', 'Michel', 10, T - 3 * JOUR);
  }

  /** L'état complet : chaque document (heure de sa dernière écriture) et chaque compte (bloqué ou non). */
  async function etat() {
    const docs: Record<string, string> = {};
    const noter = (d: FirebaseFirestore.QueryDocumentSnapshot) => (docs[d.ref.path] = d.updateTime.toDate().toISOString());
    for (const g of ['scores', 'lots']) (await db.collectionGroup(g).get()).docs.forEach(noter);
    for (const c of ['joueurs', 'demandes']) (await db.collection(c).get()).docs.forEach(noter);
    const comptes: Record<string, boolean> = {};
    for (const u of (await auth.listUsers()).users) comptes[u.uid] = u.disabled;
    return { docs, comptes };
  }

  /** L'état attendu après le plan : documents et comptes supprimés, comptes bloqués ; les pierres tombales redatées changent d'heure. */
  function apres(avant: Awaited<ReturnType<typeof etat>>, actions: Action[]) {
    const docs = { ...avant.docs };
    const comptes = { ...avant.comptes };
    const redatees: string[] = [];
    for (const a of actions) {
      if (a.type === 'lots') for (const c of a.chemins) delete docs[c];
      else if (a.type === 'doc') delete docs[a.chemin];
      else if (a.type === 'comptes') for (const u of a.uids) delete comptes[u];
      else if (a.type === 'bloquer') comptes[a.uid] = true;
      else redatees.push(a.chemin);
    }
    return { docs, comptes, redatees };
  }

  /** Comme à la main : la commande à blanc (son plan et son empreinte), puis --appliquer --attendu <empreinte>. */
  async function appliquer(args: string[], env: Record<string, string> = {}) {
    const blanc = JSON.parse((await lancer([...args, '--json'], env)).stdout) as Rendu;
    expect(blanc.taches).toHaveLength(1);
    const r = await lancer([...args, '--appliquer', '--attendu', blanc.taches[0]!.empreinte!, '--json'], env);
    const rendu = JSON.parse(r.stdout) as Rendu;
    expect(rendu.taches.map((t) => t.actions)).toEqual(blanc.taches.map((t) => t.actions));
    return r;
  }

  /** Applique une commande et vérifie que l'état d'après est l'état d'avant moins le plan ; puis qu'une relance n'a rien à faire. */
  async function exactEtIdempotent(args: string[], env: Record<string, string> = {}, relance = true) {
    const avant = await etat();
    const r = await appliquer(args, env);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    const rendu = JSON.parse(r.stdout) as Rendu;
    expect(rendu.applique).toBe(true);
    const actions = rendu.taches.flatMap((t) => t.actions);
    expect(rendu.taches.every((t) => t.faites === t.actions.length)).toBe(true);
    const attendu = apres(avant, actions);
    const reel = await etat();
    for (const c of attendu.redatees) {
      expect(reel.docs[c]).toBeDefined();
      expect(reel.docs[c]).not.toBe(avant.docs[c]);
      reel.docs[c] = avant.docs[c]!;
    }
    expect(reel.comptes).toEqual(attendu.comptes);
    expect(reel.docs).toEqual(attendu.docs);
    if (!relance) return { actions, notes: rendu.taches.flatMap((t) => t.notes), avant, apres: reel };
    const encore = await appliquer(args, env);
    expect(encore.code).toBe(0);
    const rendu2 = JSON.parse(encore.stdout) as Rendu;
    expect(rendu2.taches.flatMap((t) => t.actions)).toEqual([]);
    const fin = await etat();
    for (const c of attendu.redatees) fin.docs[c] = avant.docs[c]!;
    expect(fin).toEqual({ docs: reel.docs, comptes: reel.comptes });
    return { actions, notes: rendu.taches.flatMap((t) => t.notes), avant, apres: reel };
  }

  const chemins = (actions: Action[]) => actions.flatMap((a) => (a.type === 'lots' ? a.chemins : a.type === 'doc' || a.type === 'dater' ? [`${a.type}:${a.chemin}`] : a.type === 'comptes' ? a.uids.map((u) => `compte:${u}`) : [`bloquer:${a.uid}`]));

  it('à blanc, aucune commande ne change rien, et chacune dit sur quoi elle travaille', async () => {
    await monde();
    const avant = await etat();
    for (const args of [['inactifs'], ['tombes'], ['tombes', '--finir'], ['orphelins'], ['demandes'], ['demandes', '--uid', 'parti', '--avec-a-juger'], ['abus', 'abuseur'], ['releve'], ['tournee', '--trimestrielle']]) {
      const humain = await lancer(args);
      expect(humain.code, `${args.join(' ')} : ${humain.stderr}`).toBe(0);
      expect(humain.stdout).toContain(`Projet : ${PROJET}, aux émulateurs`);
      expect(humain.stdout).toContain('Mode : à blanc');
      const r = JSON.parse((await lancer([...args, '--json'])).stdout) as Rendu;
      expect(r).toMatchObject({ projet: PROJET, emulateurs: true, applique: false });
      expect(r.taches.every((t) => t.faites === 0)).toBe(true);
    }
    expect(await etat()).toEqual(avant);
  }, 120_000);

  it('--appliquer --attendu : rien n’est fait si le plan a changé depuis la lecture à blanc', async () => {
    await monde();
    const blanc = JSON.parse((await lancer(['demandes', '--json'])).stdout) as Rendu;
    const vue = blanc.taches[0]!.empreinte!;
    expect(vue).toMatch(/^[0-9a-f]{12}$/);
    const humain = await lancer(['demandes']);
    expect(humain.stdout).toContain(`Empreinte du plan : ${vue}`);
    expect(humain.stdout).toContain(`npm run admin -- demandes --appliquer --attendu ${vue}`);
    // Une demande arrivée après la lecture : son pseudo serait retiré sans avoir été montré.
    await place('general', 'toujours', 'actif', 'Actif', 2500, T - 3 * JOUR);
    await db.doc('demandes/fantome').set({ pseudo: 'Actif', cree: ts(T - 2 * JOUR) });
    const avant = await etat();
    const r = await lancer(['demandes', '--appliquer', '--attendu', vue, '--json']);
    expect(r.code).toBe(1);
    const rendu = JSON.parse(r.stdout) as Rendu;
    expect(rendu.erreur).toContain('le plan a changé depuis sa lecture');
    expect(rendu.taches[0]!.faites).toBe(0);
    expect(rendu.taches[0]!.empreinte).not.toBe(vue);
    expect(await etat()).toEqual(avant);
    // Une autre empreinte (d'une autre commande) ne vaut pas non plus.
    const tombes = JSON.parse((await lancer(['tombes', '--json'])).stdout) as Rendu;
    expect((await lancer(['demandes', '--appliquer', '--attendu', tombes.taches[0]!.empreinte!, '--json'])).code).toBe(1);
    expect(await etat()).toEqual(avant);
  }, 60_000);

  it('orphelins : lots et profil sans compte, pas les pierres tombales', async () => {
    await monde();
    const { actions } = await exactEtIdempotent(['orphelins']);
    expect(chemins(actions)).toEqual([...[0, 1, 2].map((i) => `joueurs/fantome/lots/${String(i).padStart(36, '0')}`), 'doc:joueurs/fantome', `joueurs/fantome2/lots/${'0'.repeat(36)}`]);
  }, 60_000);

  it('tombes : compte parti et lots vides, marquée à la première vue, effacée 2 h après ; lots d’abord sinon ; en route signalée, puis finie par --finir', async () => {
    await monde();
    const { actions, notes, apres: e } = await exactEtIdempotent(['tombes']);
    // « parti » : pierre tombale de deux jours, mais le compte peut n'être parti que depuis quelques minutes (un jeton vaut encore).
    expect(chemins(actions)).toEqual(['dater:joueurs/parti', ...[0, 1].map((i) => `joueurs/parti2/lots/${String(i).padStart(36, '0')}`), 'dater:joueurs/parti2']);
    expect(e.docs['joueurs/parti']).toBeDefined();
    const vue = await db.doc('joueurs/parti').get();
    expect(vue.get('supprime')).toBe(true);
    expect(vue.get('vu_sans_compte')).toBeInstanceOf(Timestamp);
    expect(notes.some((n) => n.startsWith('joueurs/enroute : suppression restée en route'))).toBe(true);
    expect(e.docs['joueurs/recent']).toBeDefined();
    expect(e.docs['joueurs/enroute']).toBeDefined();
    expect(e.comptes.enroute).toBe(false);
    const fini = await exactEtIdempotent(['tombes', '--finir']);
    expect(chemins(fini.actions)).toEqual([`joueurs/enroute/lots/${'0'.repeat(36)}`, 'compte:enroute', 'dater:joueurs/enroute']);
    // Marquées : laissées moins de 2 h après, effacées ensuite (le même jour).
    const bientot = await lancer(['tombes', '--json'], { TERRAMEMO_MAINTENANT: new Date(Date.now() + HEURE).toISOString() });
    expect((JSON.parse(bientot.stdout) as Rendu).taches[0]!.actions).toEqual([]);
    const suivante = await exactEtIdempotent(['tombes'], { TERRAMEMO_MAINTENANT: new Date(Date.now() + 3 * HEURE).toISOString() });
    expect(chemins(suivante.actions)).toEqual(['doc:joueurs/enroute', 'doc:joueurs/parti', 'doc:joueurs/parti2']);
    expect(suivante.apres.docs['joueurs/recent']).toBeDefined();
    // « recent » (moins d'un jour) : marquée à son tour plus tard.
    const jourSuivant = await exactEtIdempotent(['tombes'], { TERRAMEMO_MAINTENANT: new Date(Date.now() + 2 * JOUR).toISOString() }, false);
    expect(chemins(jourSuivant.actions)).toEqual(['dater:joueurs/recent']);
  }, 90_000);

  it('demandes : les places à la clé exacte du pseudo, chaque épreuve et période, jamais un pseudo voisin', async () => {
    await monde();
    const { actions, notes, apres: e } = await exactEtIdempotent(['demandes']);
    expect(chemins(actions).sort()).toEqual(
      [
        'doc:classements/chrono:localiser:tous/periodes/s2900/scores/élodie',
        'doc:classements/general/periodes/toujours/scores/élodie',
        'doc:classements/general/periodes/toujours/scores/michel',
        'doc:classements/minute:localiser:reunion/periodes/toujours/scores/michel',
        'doc:demandes/parti2',
        'doc:demandes/recent',
      ].sort(),
    );
    for (const voisin of ['ölodie', 'elodie', 'MICHEL', 'michél', 'michel2']) expect(e.docs[`classements/general/periodes/toujours/scores/${voisin}`], voisin).toBeDefined();
    // Écrite après la demande : à juger, et la demande reste.
    expect(e.docs['classements/chrono:localiser:Africa/periodes/toujours/scores/élodie']).toBeDefined();
    expect(e.docs['demandes/parti']).toBeDefined();
    expect(notes.some((n) => n.startsWith('à juger : classements/chrono:localiser:Africa/periodes/toujours/scores/élodie'))).toBe(true);
    // Tranché à la main : retirée aussi.
    const tranche = await exactEtIdempotent(['demandes', '--uid', 'parti', '--avec-a-juger']);
    expect(chemins(tranche.actions)).toEqual(['doc:classements/chrono:localiser:Africa/periodes/toujours/scores/élodie', 'doc:demandes/parti']);
    for (const voisin of ['ölodie', 'elodie', 'MICHEL', 'michél', 'michel2']) expect(tranche.apres.docs[`classements/general/periodes/toujours/scores/${voisin}`], voisin).toBeDefined();
  }, 90_000);

  it('demandes : --garder-a-juger retire la demande et garde la place à juger ; le plan montre rang, points et date', async () => {
    await monde();
    const blanc = JSON.parse((await lancer(['demandes', '--json'])).stdout) as Rendu;
    const general = blanc.taches[0]!.actions.find((a) => a.type === 'doc' && a.chemin === 'classements/general/periodes/toujours/scores/élodie') as { detail?: string } | undefined;
    expect(general?.detail?.replace(/\s/g, ' ')).toMatch(/^general, toujours : « Élodie », 1er sur 7, 9 000 points, le \d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
    const { actions, apres: e } = await exactEtIdempotent(['demandes', '--uid', 'parti', '--garder-a-juger']);
    expect(chemins(actions)).toEqual(['doc:classements/chrono:localiser:tous/periodes/s2900/scores/élodie', 'doc:classements/general/periodes/toujours/scores/élodie', 'doc:demandes/parti']);
    expect(e.docs['classements/chrono:localiser:Africa/periodes/toujours/scores/élodie']).toBeDefined();
    expect(e.docs['demandes/parti2']).toBeDefined(); // --uid : les autres demandes attendent
  }, 60_000);

  it('abus : lots et profil, puis le compte bloqué', async () => {
    await monde();
    const { actions, apres: e } = await exactEtIdempotent(['abus', 'abuseur']);
    expect(chemins(actions)).toEqual([...[0, 1].map((i) => `joueurs/abuseur/lots/${String(i).padStart(36, '0')}`), 'doc:joueurs/abuseur', 'bloquer:abuseur']);
    expect(e.comptes.abuseur).toBe(true);
  }, 60_000);

  it('releve : lots comptés sans être lus, puis taille par uid avec --taille, les plus gros d’abord ; plafond des lectures ; rien n’est écrit', async () => {
    await monde();
    const avant = await etat();
    type Ligne = NonNullable<Rendu['taches'][number]['releve']>[number];
    const releve = async (args: string[]) => {
      const r = JSON.parse((await lancer(['releve', ...args, '--json'])).stdout) as Rendu;
      return { lignes: r.taches[0]?.releve as (Ligne & { evenements?: number })[] | undefined, notes: r.taches[0]?.notes ?? [], erreur: r.erreur };
    };
    const uids = ['abuseur', 'actif', 'enroute', 'fantome', 'fantome2', 'parti', 'parti2', 'recent'];
    // Sans --taille (et dans la tournée) : le nombre de lots, ni événements ni octets.
    const compte = await releve([]);
    if (!compte.lignes) throw new Error(compte.erreur);
    expect(compte.lignes.map((l) => l.uid).sort()).toEqual(uids);
    expect(compte.lignes[0]).toMatchObject({ uid: 'fantome', lots: 3, compte: 'absent' });
    expect(compte.lignes.find((l) => l.uid === 'actif')).toMatchObject({ lots: 2, compte: 'actif' });
    expect(compte.lignes.find((l) => l.uid === 'parti')).toMatchObject({ lots: 0, tombe: true });
    expect(compte.lignes.every((l) => l.octets === undefined && l.evenements === undefined)).toBe(true);
    expect(compte.notes.join('\n')).toContain('Lectures : ≈');
    const tournee = JSON.parse((await lancer(['tournee', '--json'])).stdout) as Rendu;
    const deTournee = tournee.taches.find((t) => t.tache === 'releve')!.releve!;
    expect(deTournee.map((l) => [l.uid, l.lots])).toEqual(compte.lignes.map((l) => [l.uid, l.lots]));
    expect(deTournee.every((l) => l.octets === undefined)).toBe(true);
    // --taille : chaque lot lu.
    const { lignes } = await releve(['--taille']);
    if (!lignes) throw new Error('releve --taille');
    expect(lignes.map((l) => l.uid).sort()).toEqual(uids);
    expect(lignes[0]).toMatchObject({ uid: 'fantome', lots: 3, evenements: 6, compte: 'absent' });
    for (let i = 1; i < lignes.length; i++) expect(lignes[i - 1]!.octets!).toBeGreaterThanOrEqual(lignes[i]!.octets!);
    // 11 lots en tout : refusé sous ce plafond, avant de lire un seul lot ; un seul uid passe.
    const refus = await releve(['--taille', '--max-lectures', '10']);
    expect(refus.erreur).toContain('lirait 11 lots');
    expect(refus.lignes).toBeUndefined();
    const seul = await releve(['--taille', '--max-lectures', '10', '--uid', 'fantome']);
    expect(seul.lignes).toEqual([lignes[0]]);
    expect(await etat()).toEqual(avant);
  }, 60_000);

  it('inactifs : 2 ans sans jeton rafraîchi (pas la dernière connexion), invités exclus', async () => {
    const vieux = new Date(Date.UTC(2023, 0, 1)).toUTCString();
    await auth.importUsers([{ uid: 'vieuxg', email: 'g@x.fr', providerData: [{ providerId: 'google.com', uid: '1234', email: 'g@x.fr' }], metadata: { creationTime: vieux, lastSignInTime: vieux } }]);
    await auth.createUser({ uid: 'vieux', email: 'vieux@x.fr', password: 'motdepasse' });
    await auth.createUser({ uid: 'invite' });
    await profil('vieux', 'Vieux');
    for (const i of [0, 1]) await lot('vieux', i);
    await auth.createUser({ uid: 'fidele', email: 'fidele@x.fr', password: 'motdepasse' });
    await profil('fidele', 'Fidele');
    const cle = 'cle-factice';
    const connexion = (await (
      await fetch(`http://${hoteAuth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cle}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fidele@x.fr', password: 'motdepasse', returnSecureToken: true }),
      })
    ).json()) as { refreshToken: string };
    await new Promise((r) => setTimeout(r, 2100));
    const rafraichi = await fetch(`http://${hoteAuth}/securetoken.googleapis.com/v1/token?key=${cle}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${connexion.refreshToken}`,
    });
    expect(rafraichi.status).toBe(200);
    // La limite des 2 ans tombe entre la connexion du fidèle et son jeton rafraîchi.
    const m = (await auth.getUser('fidele')).metadata;
    const limite = Date.parse(m.lastSignInTime) + 1000;
    expect(Date.parse(m.lastRefreshTime!)).toBeGreaterThan(limite);
    expect(Date.parse((await auth.getUser('vieux')).metadata.lastSignInTime)).toBeLessThan(limite);
    const maintenant = new Date(limite);
    maintenant.setUTCFullYear(maintenant.getUTCFullYear() + 2);
    const env = { TERRAMEMO_MAINTENANT: maintenant.toISOString() };
    const { actions, apres: e } = await exactEtIdempotent(['inactifs'], env);
    const plan = chemins(actions);
    expect(plan.slice(0, 3)).toEqual([...[0, 1].map((i) => `joueurs/vieux/lots/${String(i).padStart(36, '0')}`), 'doc:joueurs/vieux']);
    expect(plan.slice(3).sort()).toEqual(['compte:vieux', 'compte:vieuxg']);
    expect(Object.keys(e.comptes).sort()).toEqual(['fidele', 'invite']);
    expect(e.docs['joueurs/fidele']).toBeDefined();
  }, 60_000);
});
