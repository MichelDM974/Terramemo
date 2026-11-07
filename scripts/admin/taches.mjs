// Tâches de l'outil du propriétaire (J1b, lot 5b ; étude
// docs/etudes/2026-11-07-j1b-conception.md, § 7.5 et D33 a). Chaque tâche
// lit d'abord, puis rend son plan : `{actions, notes}`. Le plan est ce que
// l'outil affiche à blanc, et exactement ce qu'il exécute avec --appliquer
// (executer), dans l'ordre, en s'arrêtant à la première erreur. Une tâche
// relancée après son plan exécuté ne trouve plus rien à faire (idempotente).
//
// Chemins et formats (firestore.rules, src/sync/profil.ts, src/sync/lots.ts,
// src/epreuve/classement.ts) :
// - joueurs/{uid} : le profil `{v, pseudo?, records?, maj}`, ou la pierre
//   tombale `{v, maj, supprime: true}` d'une suppression (§ 7.1), plus
//   `vu_sans_compte` (heure du serveur) quand l'outil l'a vue sans compte
//   dans Auth : écrit par le SDK Admin seul (profilValide des règles ne le
//   laisse pas écrire au client) ;
// - joueurs/{uid}/lots/{id} : les lots de la synchro, en création seule ;
// - demandes/{uid} : `{pseudo, cree}`, demande de retrait des places du
//   pseudo d'un compte qui s'est supprimé (D27 b) ;
// - classements/{épreuve}/periodes/{toujours | sNNNN}/scores/{clé} : la place
//   d'un pseudo, clé = clePseudo(pseudo) (src/epreuve/chrono.ts).
//
// Aucune tâche ne touche aux invités anonymes (sans fournisseur) : Firebase
// les supprime 30 jours après leur création (Identity Platform, § 4.4).
import { FieldPath, FieldValue } from 'firebase-admin/firestore';

/** Lots supprimés par lot d'écriture (Firestore en accepte 500), comme la suppression de l'appli (§ 7.1). */
const PAR_ECRITURE = 400;
/** deleteUsers en prend 1 000 au plus par appel. */
const PAR_SUPPRESSION_COMPTES = 1000;
/** getUsers en prend 100 au plus par appel. */
const PAR_LECTURE_COMPTES = 100;
/** Lecture des collections par pages. */
const PAGE = 1000;
const JOUR_MS = 86_400_000;
const HEURE_MS = 3_600_000;
/**
 * Délai entre la pierre tombale vue sans compte et son effacement : un jeton
 * d'identité vaut une heure au plus, et ne se rafraîchit plus le compte
 * parti ; la seconde heure est une marge (horloges).
 */
export const DELAI_SANS_COMPTE_MS = 2 * HEURE_MS;

/**
 * La place d'un pseudo au classement : src/epreuve/chrono.ts, clePseudo
 * (toLowerCase de JavaScript), recopiée ici (l'outil est du JavaScript brut).
 * Seule cette clé exacte est retirée : un pseudo voisin (« Elodie » pour
 * « Élodie », « ölodie » que le masque des règles laisse écrire sous
 * « Élodie », « MICHEL » écrit hors des règles) garde sa place.
 */
export const clePseudo = (pseudo) => pseudo.toLowerCase();

/** Une clé qui ne peut pas nommer un document de scores (pseudoValide de l'appli les refuse, pas les règles du profil). */
const cleImpossible = (cle) => cle.includes('/') || cle === '.' || cle === '..' || /^__.*__$/.test(cle);

const iso = (d) => (d ? `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '?');
const nombre = (n) => n.toLocaleString('fr-FR');
/** « 1 lot », « 0 lot », « 2 lots » (pluriel à partir de 2, en français). */
const des = (n, mot, pluriel = `${mot}s`) => `${nombre(n)} ${n > 1 ? pluriel : mot}`;
const morceaux = (t, n) => Array.from({ length: Math.ceil(t.length / n) }, (_, i) => t.slice(i * n, (i + 1) * n));

// --- Lectures --------------------------------------------------------------

/** Tous les comptes d'Auth, par pages de 1 000. */
async function tousLesComptes(auth) {
  const comptes = [];
  let jeton;
  do {
    const page = await auth.listUsers(1000, jeton);
    comptes.push(...page.users);
    jeton = page.pageToken;
  } while (jeton);
  return comptes;
}

/** Les comptes de ces uid qui existent dans Auth : uid → UserRecord. */
async function comptesExistants(auth, uids) {
  const m = new Map();
  for (const lot of morceaux(uids, PAR_LECTURE_COMPTES)) {
    const r = await auth.getUsers(lot.map((uid) => ({ uid })));
    for (const u of r.users) m.set(u.uid, u);
  }
  return m;
}

/** Les documents d'une collection, par pages (ordre des ids) : ces champs (`[]` : les références seules), ou tout (`null`). */
async function documents(col, champs = []) {
  const tous = [];
  let dernier = null;
  for (;;) {
    let q = (champs ? col.select(...champs) : col).orderBy(FieldPath.documentId()).limit(PAGE);
    if (dernier) q = q.startAfter(dernier);
    const page = await q.get();
    tous.push(...page.docs);
    if (page.size < PAGE) return tous;
    dernier = page.docs[page.size - 1];
  }
}

/** Les chemins des lots d'un compte. */
async function cheminsLots(db, uid) {
  return (await documents(db.collection('joueurs').doc(uid).collection('lots'))).map((d) => d.ref.path);
}

/** Les uid qui ont quelque chose sous joueurs/ (profil, ou seulement des lots : listDocuments voit les documents absents qui ont des sous-collections). */
async function uidsJoueurs(db) {
  return (await db.collection('joueurs').listDocuments()).map((r) => r.id);
}

async function lireDocs(db, chemins) {
  return chemins.length ? db.getAll(...chemins.map((c) => db.doc(c))) : [];
}

// --- Actions ---------------------------------------------------------------

/**
 * Les actions d'un plan :
 * - `{type: 'lots', uid, chemins}` : supprimer ces lots ;
 * - `{type: 'doc', quoi, chemin, pre?}` : supprimer ce document (profil,
 *   pierre tombale, place, demande) ; `pre` (l'heure de sa dernière
 *   écriture lue) : seulement s'il n'a pas changé depuis ;
 * - `{type: 'comptes', uids}` : supprimer ces comptes d'Auth (deleteUsers) ;
 * - `{type: 'bloquer', uid}` : updateUser(uid, {disabled: true}) ;
 * - `{type: 'dater', chemin, pre}` : `vu_sans_compte` de la pierre tombale
 *   à l'heure du serveur, si elle n'a pas changé depuis la lecture (le
 *   compte n'est plus dans Auth à ce moment : action après sa suppression,
 *   ou constatée à la lecture).
 */
export function decrire(a) {
  switch (a.type) {
    case 'lots':
      return `supprimer ${nombre(a.chemins.length)} lot${a.chemins.length > 1 ? 's' : ''} de joueurs/${a.uid}`;
    case 'doc':
      return `supprimer ${a.quoi} ${a.chemin}${a.detail ? ` (${a.detail})` : ''}`;
    case 'comptes':
      return `supprimer de Auth ${a.uids.length > 1 ? `${nombre(a.uids.length)} comptes` : 'le compte'} ${a.uids.length > 5 ? `${a.uids.slice(0, 5).join(', ')}…` : a.uids.join(', ')}`;
    case 'bloquer':
      return `bloquer le compte ${a.uid} (disabled)`;
    case 'dater':
      return `marquer la pierre tombale ${a.chemin} vue sans compte (effacée par tombes 2 h après, au plus tôt)`;
    default:
      throw new Error(`action inconnue : ${a.type}`);
  }
}

/** Une action telle que --json la rend (heures en ISO). */
export function enJson(a) {
  const { pre, ...reste } = a;
  return pre ? { ...reste, pre: pre.toDate().toISOString() } : reste;
}

/** Exécute un plan dans l'ordre ; `fait(a)` après chaque action. Lève à la première erreur : le reste n'est pas fait. */
export async function executer({ auth, db }, actions, fait = () => {}) {
  for (const a of actions) {
    if (a.type === 'lots') {
      for (const lot of morceaux(a.chemins, PAR_ECRITURE)) {
        const b = db.batch();
        for (const c of lot) b.delete(db.doc(c));
        await b.commit();
      }
    } else if (a.type === 'doc') {
      try {
        await db.doc(a.chemin).delete(a.pre ? { lastUpdateTime: a.pre } : undefined);
      } catch (e) {
        if (e.code === 9) throw new Error(`${a.chemin} a changé depuis la lecture : il est gardé, et rien de ce qui suit n'est fait. Relancer.`);
        throw e;
      }
    } else if (a.type === 'comptes') {
      for (const lot of morceaux(a.uids, PAR_SUPPRESSION_COMPTES)) {
        const r = await auth.deleteUsers(lot);
        if (r.failureCount) {
          const raisons = r.errors.map((x) => `${lot[x.index]} : ${x.error.code ?? x.error.message}`).join(' ; ');
          throw new Error(`${r.failureCount} compte(s) non supprimé(s) : ${raisons}`);
        }
      }
    } else if (a.type === 'bloquer') {
      await auth.updateUser(a.uid, { disabled: true });
    } else if (a.type === 'dater') {
      try {
        await db.doc(a.chemin).update({ vu_sans_compte: FieldValue.serverTimestamp() }, { lastUpdateTime: a.pre });
      } catch (e) {
        if (e.code === 9) throw new Error(`${a.chemin} a changé depuis la lecture : rien de ce qui suit n'est fait. Relancer.`);
        throw e;
      }
    } else {
      throw new Error(`action inconnue : ${a.type}`);
    }
    fait(a);
  }
}

// --- Tâches ----------------------------------------------------------------

/**
 * Comptes sans activité depuis 2 ans : `metadata.lastRefreshTime` (dernier
 * jeton rafraîchi), pas `lastSignInTime`, qui ne bouge pas tant que la
 * session dure (un joueur fidèle connecté une seule fois serait purgé) ;
 * sans rafraîchissement noté, la dernière connexion, puis la création. Leurs
 * lots et leur profil d'abord, puis deleteUsers par 1 000. Invités exclus.
 */
export async function inactifs({ auth, db, maintenant }) {
  const limite = new Date(maintenant);
  limite.setUTCFullYear(limite.getUTCFullYear() - 2);
  const comptes = await tousLesComptes(auth);
  let invites = 0;
  const vieux = [];
  for (const u of comptes) {
    if (u.providerData.length === 0) {
      invites++;
      continue;
    }
    const m = u.metadata;
    const activite = new Date(m.lastRefreshTime ?? m.lastSignInTime ?? m.creationTime);
    if (activite < limite) vieux.push({ u, activite });
  }
  const profils = await lireDocs(db, vieux.map(({ u }) => `joueurs/${u.uid}`));
  const actions = [];
  const notes = [`${des(comptes.length, 'compte')} dans Auth, dont ${des(invites, 'invité')} (laissés à Firebase) ; inactifs : aucune activité depuis le ${iso(limite)}.`];
  for (const [i, { u, activite }] of vieux.entries()) {
    const lots = await cheminsLots(db, u.uid);
    const fournisseurs = u.providerData.map((p) => p.providerId).join(', ');
    notes.push(`${u.uid} (${fournisseurs}${u.disabled ? ', bloqué' : ''}) : dernière activité le ${iso(activite)}, ${des(lots.length, 'lot')}${profils[i].exists ? ', un profil' : ''}.`);
    if (lots.length) actions.push({ type: 'lots', uid: u.uid, chemins: lots });
    if (profils[i].exists) actions.push({ type: 'doc', quoi: profils[i].get('supprime') === true ? 'la pierre tombale' : 'le profil', chemin: `joueurs/${u.uid}` });
  }
  for (const lot of morceaux(vieux.map(({ u }) => u.uid), PAR_SUPPRESSION_COMPTES)) actions.push({ type: 'comptes', uids: lot });
  return { actions, notes };
}

/**
 * Pierres tombales de plus d'un jour (§ 7.1) : effacée seulement si le compte
 * n'est plus dans Auth, si ses lots sont vides, et si l'outil l'a déjà vue
 * sans compte il y a plus de 2 heures (`vu_sans_compte`) ; l'effacer avant
 * rouvrirait l'écriture du compte à ses autres appareils (règle
 * `!tombe(uid)`, profil en `create`). `maj` date la pierre tombale, pas la
 * suppression du compte : une suppression reprise des jours après (appli
 * tuée, connexion trop ancienne) laisse un compte parti depuis quelques
 * minutes sous une pierre tombale ancienne, et un jeton du compte vaut
 * encore jusqu'à une heure après deleteUser. Donc, vue sans compte pour la
 * première fois : marquée. Compte parti, lots restants : les lots, puis la
 * pierre tombale marquée. Compte encore là : suppression restée en route,
 * signalée ; `finir` la finit (lots, puis le compte), pierre tombale
 * marquée. Marquée, elle est effacée par `tombes` relancée 2 heures après au
 * plus tôt (le même jour : la politique promet 30 jours au plus) ; relancée
 * tout de suite, la tâche n'a rien à faire. Une lecture par profil :
 * `supprime` n'est pas indexé (firestore.indexes.json), on lit tout joueurs/.
 */
export async function tombes({ auth, db, maintenant }, { finir = false } = {}) {
  const limite = new Date(maintenant.getTime() - JOUR_MS);
  const limiteVu = new Date(maintenant.getTime() - DELAI_SANS_COMPTE_MS);
  const profils = (await documents(db.collection('joueurs'), ['supprime', 'maj', 'vu_sans_compte'])).filter((d) => d.get('supprime') === true);
  const anciennes = [];
  let recentes = 0;
  for (const d of profils) {
    const maj = d.get('maj')?.toDate?.() ?? d.updateTime.toDate();
    if (maj < limite) anciennes.push({ d, maj });
    else recentes++;
  }
  const existants = await comptesExistants(auth, anciennes.map(({ d }) => d.id));
  const actions = [];
  const notes = [`${des(profils.length, 'pierre tombale', 'pierres tombales')}, dont ${nombre(recentes)} de moins d'un jour (laissées).`];
  const ensuite = 'pierre tombale effacée par tombes relancée 2 h après, au plus tôt';
  for (const { d, maj } of anciennes) {
    const uid = d.id;
    const lots = await cheminsLots(db, uid);
    const compte = existants.get(uid);
    const vu = d.get('vu_sans_compte')?.toDate?.() ?? null;
    const dater = { type: 'dater', chemin: d.ref.path, pre: d.updateTime };
    if (!compte && !lots.length && vu && vu < limiteVu) {
      actions.push({ type: 'doc', quoi: 'la pierre tombale', chemin: d.ref.path, detail: `du ${iso(maj)}, vue sans compte le ${iso(vu)}`, pre: d.updateTime });
    } else if (!compte && !lots.length && vu) {
      notes.push(`joueurs/${uid} : vue sans compte le ${iso(vu)} ; effacée à partir du ${iso(new Date(vu.getTime() + DELAI_SANS_COMPTE_MS))}.`);
    } else if (!compte && !lots.length) {
      notes.push(`joueurs/${uid} : compte parti, lots vides, vue sans compte pour la première fois (il peut n'être parti que depuis quelques minutes) ; ${ensuite}.`);
      actions.push(dater);
    } else if (!compte) {
      notes.push(`joueurs/${uid} : compte parti, ${des(lots.length, 'lot restant', 'lots restants')} ; ${ensuite}.`);
      actions.push({ type: 'lots', uid, chemins: lots }, dater);
    } else if (finir) {
      notes.push(`joueurs/${uid} : suppression finie ici (lots, puis le compte) ; ${ensuite}.`);
      if (lots.length) actions.push({ type: 'lots', uid, chemins: lots });
      actions.push({ type: 'comptes', uids: [uid] }, dater);
    } else {
      notes.push(`joueurs/${uid} : suppression restée en route depuis le ${iso(maj)} (compte encore dans Auth${compte.disabled ? ', bloqué' : ''}, ${des(lots.length, 'lot')}). --finir pour la finir.`);
    }
  }
  return { actions, notes };
}

/** Lots (et profil) sans compte dans Auth. Une pierre tombale est laissée à `tombes`. */
export async function orphelins({ auth, db }) {
  const uids = await uidsJoueurs(db);
  const existants = await comptesExistants(auth, uids);
  const sans = uids.filter((uid) => !existants.has(uid));
  const profils = await lireDocs(db, sans.map((uid) => `joueurs/${uid}`));
  const actions = [];
  const notes = [`${des(uids.length, 'uid', 'uid')} sous joueurs/, dont ${nombre(sans.length)} sans compte dans Auth.`];
  for (const [i, uid] of sans.entries()) {
    const p = profils[i];
    if (p.exists && p.get('supprime') === true) {
      notes.push(`joueurs/${uid} : pierre tombale, laissée à la tâche des pierres tombales.`);
      continue;
    }
    const lots = await cheminsLots(db, uid);
    if (lots.length) actions.push({ type: 'lots', uid, chemins: lots });
    if (p.exists) actions.push({ type: 'doc', quoi: 'le profil', chemin: p.ref.path });
  }
  return { actions, notes };
}

/** Le rang d'une place (1 = premier) et le nombre de classés : comme rangDe (src/epreuve/classement.ts). */
async function rang(col, epreuve, p) {
  const n = async (q) => (await q.count().get()).data().count;
  const comptes = await Promise.all([
    n(col.where('points', '>', p.points)),
    n(col.where('points', '==', p.points).where('temps_ms', '<', p.temps_ms)),
    ...(epreuve.startsWith('minute:') ? [n(col.where('points', '==', p.points).where('temps_ms', '==', p.temps_ms).where('questions', '<', p.questions))] : []),
  ]);
  return { rang: comptes.reduce((a, b) => a + b, 1), joueurs: await n(col) };
}

/** Toutes les périodes de tous les classements : [épreuve, période]. */
async function periodes(db) {
  const paires = [];
  for (const e of await db.collection('classements').listDocuments()) {
    for (const p of await e.collection('periodes').listDocuments()) paires.push([e.id, p.id]);
  }
  return paires;
}

/**
 * Demandes de retrait des places (D27 b) : pour chaque pseudo demandé, ses
 * places dans tous les classements (chaque épreuve, toujours et chaque
 * semaine), à la clé exacte de ce pseudo, puis la demande. Les demandes d'un
 * même pseudo vont ensemble : une seule fois par tournée. Le pseudo n'étant
 * pas réservé, chaque place est montrée (rang, points, date) ; une place
 * écrite plus d'une heure après la demande ne vient pas du compte supprimé
 * (son dernier jeton valait une heure au plus) : elle est « à juger » à la
 * main, et sa demande reste tant qu'on n'a pas tranché, par
 * `uid` + `avecAJuger` (la retirer aussi) ou `garderAJuger` (la garder).
 */
export async function demandes({ db }, { uid = null, avecAJuger = false, garderAJuger = false } = {}) {
  const lues = (await db.collection('demandes').get()).docs;
  const groupes = new Map();
  for (const d of lues) {
    const pseudo = String(d.get('pseudo') ?? '');
    const cle = clePseudo(pseudo);
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(d);
  }
  let choisis = [...groupes.entries()];
  if (uid) {
    choisis = choisis.filter(([, ds]) => ds.some((d) => d.id === uid));
    if (!choisis.length) return { actions: [], notes: [`Aucune demande demandes/${uid}.`] };
  }
  const actions = [];
  const notes = [`${des(lues.length, 'demande')}, ${des(groupes.size, 'pseudo')}.`];
  const paires = choisis.length ? await periodes(db) : [];
  for (const [cle, ds] of choisis) {
    ds.sort((a, b) => a.get('cree').toMillis() - b.get('cree').toMillis());
    const derniere = ds[ds.length - 1].get('cree').toDate();
    const seuil = new Date(derniere.getTime() + HEURE_MS);
    const qui = ds.map((d) => `demandes/${d.id} (« ${d.get('pseudo')} », le ${iso(d.get('cree').toDate())})`).join(', ');
    const aRetirer = [];
    const aJuger = [];
    if (cleImpossible(cle)) {
      notes.push(`${qui} : la clé « ${cle} » ne peut nommer aucune place.`);
    } else {
      const refs = paires.map(([e, p]) => db.collection('classements').doc(e).collection('periodes').doc(p).collection('scores').doc(cle));
      const places = refs.length ? await db.getAll(...refs) : [];
      for (const [i, s] of places.entries()) {
        if (!s.exists) continue;
        const [epreuve, periode] = paires[i];
        const p = { points: Number(s.get('points') ?? 0), temps_ms: Number(s.get('temps_ms') ?? 0), questions: Number(s.get('questions') ?? 0) };
        const { rang: r, joueurs } = await rang(s.ref.parent, epreuve, p);
        const date = s.get('date')?.toDate?.() ?? s.updateTime.toDate();
        const place = {
          type: 'doc',
          quoi: 'la place',
          chemin: s.ref.path,
          detail: `${epreuve}, ${periode} : « ${s.get('pseudo')} », ${r === 1 ? '1er' : `${r}e`} sur ${joueurs}, ${nombre(p.points)} points, le ${iso(date)}`,
          pre: s.updateTime,
        };
        (date > seuil ? aJuger : aRetirer).push(place);
      }
    }
    notes.push(`${qui} : ${des(aRetirer.length + aJuger.length, 'place')}${aJuger.length ? `, dont ${aJuger.length} à juger (écrites après le ${iso(seuil)})` : ''}.`);
    actions.push(...aRetirer);
    for (const p of aJuger) notes.push(`à juger : ${p.chemin} (${p.detail})`);
    if (aJuger.length && avecAJuger) actions.push(...aJuger);
    if (!aJuger.length || avecAJuger || garderAJuger) {
      for (const d of ds) actions.push({ type: 'doc', quoi: 'la demande', chemin: d.ref.path, pre: d.updateTime });
    } else {
      notes.push(`${qui} : gardée${ds.length > 1 ? 's' : ''} ; trancher par --uid ${ds[0].id} et --avec-a-juger (retirer aussi) ou --garder-a-juger (garder ces places).`);
    }
  }
  return { actions, notes };
}

/** Uid abusif : ses lots et son profil, puis le compte bloqué (updateUser disabled). */
export async function abus({ auth, db }, uid) {
  let compte = null;
  try {
    compte = await auth.getUser(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
  const lots = await cheminsLots(db, uid);
  const [profil] = await lireDocs(db, [`joueurs/${uid}`]);
  const actions = [];
  const notes = [];
  if (lots.length) actions.push({ type: 'lots', uid, chemins: lots });
  if (profil.exists) actions.push({ type: 'doc', quoi: profil.get('supprime') === true ? 'la pierre tombale' : 'le profil', chemin: profil.ref.path });
  if (!compte) notes.push(`${uid} n'est pas dans Auth : ses données seules.`);
  else if (compte.disabled) notes.push(`${uid} est déjà bloqué.`);
  else actions.push({ type: 'bloquer', uid });
  if (compte) notes.push('Relancer dans une heure : un jeton déjà donné vaut encore jusqu’à une heure (lots écrits entre-temps).');
  return { actions, notes };
}

/**
 * Taille d'un document dans Firestore (calcul de la doc « Storage size
 * calculations ») : le nom, les champs, 32 octets. Approchée (un entier et
 * un réel comptent 8, comme une heure).
 */
export function tailleDoc(chemin, data) {
  const octets = (s) => Buffer.byteLength(s, 'utf8') + 1;
  const valeur = (v) => {
    if (v === null || v === undefined || typeof v === 'boolean') return 1;
    if (typeof v === 'number') return 8;
    if (typeof v === 'string') return octets(v);
    if (Array.isArray(v)) return v.reduce((n, x) => n + valeur(x), 0);
    if (typeof v.toMillis === 'function') return 8;
    if (v instanceof Uint8Array) return v.length;
    if (typeof v.latitude === 'number') return 16;
    if (typeof v.path === 'string' && typeof v.firestore === 'object') return nom(v.path);
    return Object.entries(v).reduce((n, [k, x]) => n + octets(k) + valeur(x), 0);
  };
  const nom = (c) => c.split('/').reduce((n, s) => n + octets(s), 0) + 16;
  return nom(chemin) + valeur(data) + 32;
}

/** Plafond des lectures de `releve --taille` (une par lot) sans --max-lectures : le quota Spark est de 50 000 lectures par jour, partagé avec l'appli. */
export const MAX_LECTURES = 5000;

/**
 * Relevé par uid, les plus gros d'abord (surveillance du Gio, D34). Sans
 * `taille` : le nombre de lots par agrégation count() (une lecture par
 * tranche de 1 000 lots), jamais leur contenu ; `n` n'étant pas indexé
 * (firestore.indexes.json), les événements ne se comptent pas ainsi. Avec
 * `taille` : chaque lot lu (une lecture par lot) pour ses événements et ses
 * octets, refusé avant toute lecture des lots au-delà de `maxLectures`
 * lots ; `uid` : un seul compte.
 */
export async function releve({ auth, db }, { taille = false, uid = null, maxLectures = MAX_LECTURES } = {}) {
  const uids = uid ? [uid] : await uidsJoueurs(db);
  const existants = await comptesExistants(auth, uids);
  const profils = [];
  for (const lot of morceaux(uids, PAGE)) profils.push(...(await lireDocs(db, lot.map((u) => `joueurs/${u}`))));
  const colLots = (u) => db.collection('joueurs').doc(u).collection('lots');
  const nbLots = [];
  for (const u of uids) nbLots.push((await colLots(u).count().get()).data().count);
  const totalLots = nbLots.reduce((a, b) => a + b, 0);
  // listDocuments, profils, puis count() : une lecture au moins chacun.
  const lectures = 2 * uids.length + nbLots.reduce((n, c) => n + Math.max(1, Math.ceil(c / 1000)), 0);
  const notes = [];
  if (taille && totalLots > maxLectures) {
    throw new Error(
      `releve --taille lirait ${des(totalLots, 'lot')}, une lecture chacun, plus que le plafond de ${nombre(maxLectures)} (quota Spark : 50 000 lectures par jour, partagé avec l'appli). ` +
        'Le relevé sans --taille compte les lots sans les lire ; --uid U pour un seul compte, ou --max-lectures N.',
    );
  }
  const lignes = [];
  for (const [i, u] of uids.entries()) {
    const c = existants.get(u);
    const profil = profils[i];
    const ligne = { uid: u, compte: !c ? 'absent' : c.disabled ? 'bloqué' : 'actif', lots: nbLots[i], tombe: profil.exists && profil.get('supprime') === true };
    if (taille) {
      const lots = nbLots[i] ? await documents(colLots(u), null) : [];
      const octetsLots = lots.reduce((n, d) => n + tailleDoc(d.ref.path, d.data()), 0);
      ligne.lots = lots.length;
      ligne.evenements = lots.reduce((n, d) => n + Number(d.get('n') ?? 0), 0);
      ligne.octets_lots = octetsLots;
      ligne.octets = octetsLots + (profil.exists ? tailleDoc(profil.ref.path, profil.data()) : 0);
    }
    lignes.push(ligne);
  }
  lignes.sort((a, b) => (b.octets ?? 0) - (a.octets ?? 0) || b.lots - a.lots || a.uid.localeCompare(b.uid));
  const total = lignes.reduce((n, l) => n + l.lots, 0);
  notes.push(
    `${des(uids.length, 'uid', 'uid')}, ${des(total, 'lot')}` +
      (taille ? `, ≈ ${nombre(lignes.reduce((n, l) => n + l.octets, 0))} octets en tout.` : ' (comptés sans être lus ; --taille pour leurs événements et leurs octets).'),
    `Lectures : ≈ ${nombre(lectures + (taille ? totalLots : 0))}${taille ? ` (dont ${nombre(totalLots)} pour lire les lots)` : ''}.`,
  );
  return { actions: [], notes, releve: lignes };
}
