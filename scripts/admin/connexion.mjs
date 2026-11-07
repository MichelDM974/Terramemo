// Connexion de l'outil du propriétaire (J1b, lot 5b ; étude
// docs/etudes/2026-11-07-j1b-conception.md, § 7.5) : SDK Admin de Firebase,
// soit aux émulateurs, soit au vrai projet, jamais un mélange des deux.
//
// - FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST posés tous les
//   deux (npm run test:admin, firebase emulators:exec) : les émulateurs,
//   sans clé. Un seul des deux est refusé : Firestore irait à l'émulateur et
//   Auth au vrai projet (ou l'inverse).
// - Aucun des deux : le vrai projet terramemo-geo, par la clé du compte de
//   service, lue dans ~/Sauvegardes/terramemo/admin/ (un seul .json) ou au
//   chemin de TERRAMEMO_CLE_ADMIN ; jamais une clé d'un dépôt git (celui-ci,
//   un autre clone ou worktree, ou atteinte par un lien), jamais en CI.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** Le vrai projet, le seul que la clé puisse viser. */
export const PROJET_REEL = 'terramemo-geo';
/** Le projet des émulateurs, sans GCLOUD_PROJECT (celui de npm run test:admin). */
export const PROJET_EMULATEURS = 'demo-terramemo';
/** Le dossier de la clé (décision « Confidentialité et ouverture des comptes »). */
export const DOSSIER_CLE = join(homedir(), 'Sauvegardes', 'terramemo', 'admin');

/** Erreur d'usage ou de configuration : message en français, code de sortie 2, rien n'a été lu ni écrit. */
export class ErreurUsage extends Error {}

/**
 * Où l'outil travaille, d'après l'environnement, sans rien ouvrir :
 * `{emulateurs, projet, cle?, hotes?}`. Lève ErreurUsage si c'est ambigu ou
 * interdit.
 */
export function cible(env = process.env) {
  const fs = env.FIRESTORE_EMULATOR_HOST;
  const auth = env.FIREBASE_AUTH_EMULATOR_HOST;
  if (fs && auth) {
    return { emulateurs: true, projet: env.GCLOUD_PROJECT || PROJET_EMULATEURS, hotes: { firestore: fs, auth } };
  }
  if (fs || auth) {
    throw new ErreurUsage(
      `${fs ? 'FIRESTORE_EMULATOR_HOST' : 'FIREBASE_AUTH_EMULATOR_HOST'} est posé sans ${fs ? 'FIREBASE_AUTH_EMULATOR_HOST' : 'FIRESTORE_EMULATOR_HOST'} : ` +
        "l'une des deux bases serait le vrai projet. Poser les deux (émulateurs) ou aucune (vrai projet).",
    );
  }
  if (env.CI) throw new ErreurUsage("Pas de vrai projet en CI : l'outil se lance à la main, sur le PC (§ 7.5).");
  if (env.TERRAMEMO_MAINTENANT) throw new ErreurUsage('TERRAMEMO_MAINTENANT ne vaut qu’aux émulateurs (tests).');
  return { emulateurs: false, projet: PROJET_REEL, cle: cheminCle(env) };
}

/** Le fichier de la clé : TERRAMEMO_CLE_ADMIN, sinon le seul .json de DOSSIER_CLE. */
function cheminCle(env) {
  let chemin = env.TERRAMEMO_CLE_ADMIN;
  if (!chemin) {
    let fichiers;
    try {
      fichiers = readdirSync(DOSSIER_CLE).filter((f) => f.endsWith('.json'));
    } catch {
      fichiers = [];
    }
    if (fichiers.length !== 1) {
      throw new ErreurUsage(
        fichiers.length
          ? `${fichiers.length} fichiers .json dans ${DOSSIER_CLE} : n'en garder qu'un, ou donner le chemin par TERRAMEMO_CLE_ADMIN.`
          : `Aucune clé du compte de service dans ${DOSSIER_CLE} (ni TERRAMEMO_CLE_ADMIN).`,
      );
    }
    chemin = join(DOSSIER_CLE, fichiers[0]);
  }
  const absolu = resolve(chemin);
  let reel;
  try {
    reel = realpathSync(absolu);
  } catch {
    throw new ErreurUsage(`Clé introuvable : ${absolu}.`);
  }
  // Le chemin donné et le fichier qu'il désigne (liens suivis) : ni l'un ni l'autre dans un dépôt git.
  for (const c of new Set([absolu, reel])) {
    const depot = depotDe(c);
    if (depot) throw new ErreurUsage(`La clé ${c} est dans le dépôt git ${depot} : la ranger dans ${DOSSIER_CLE}, jamais dans un dépôt.`);
  }
  return reel;
}

/** Le dépôt git qui contient ce fichier (un dossier parent avec un `.git`, dossier ou fichier d'un worktree), ou null. */
function depotDe(fichier) {
  for (let d = dirname(fichier); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return null;
  }
}

/** La clé lue et vérifiée : un compte de service du vrai projet. */
function lireCle(chemin) {
  let cle;
  try {
    cle = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    throw new ErreurUsage(`Clé illisible (${chemin}) : ${e.message}`);
  }
  if (cle?.type !== 'service_account') throw new ErreurUsage(`${chemin} n'est pas une clé de compte de service.`);
  if (cle.project_id !== PROJET_REEL) throw new ErreurUsage(`${chemin} est une clé du projet ${cle.project_id}, pas de ${PROJET_REEL}.`);
  return cle;
}

/** La phrase qui dit, avant tout, sur quoi l'outil travaille. */
export function phraseCible(c) {
  return c.emulateurs
    ? `Projet : ${c.projet}, aux émulateurs (Firestore ${c.hotes.firestore}, Auth ${c.hotes.auth}) : rien ne touche le vrai projet.`
    : `Projet : ${c.projet}, le VRAI projet (clé ${c.cle}).`;
}

/**
 * Le SDK Admin choisit émulateurs ou vrai projet d'après process.env, pas
 * d'après l'environnement que `cible` a lu (injectable) : les deux doivent
 * dire la même chose, sinon une cible « aux émulateurs » irait au vrai
 * projet (identifiants par défaut du PC), ou l'inverse.
 */
function verifierProcessus(c) {
  const fs = process.env.FIRESTORE_EMULATOR_HOST;
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const accord = c.emulateurs ? fs === c.hotes.firestore && auth === c.hotes.auth : !fs && !auth;
  if (!accord) {
    throw new ErreurUsage(
      `Le processus (FIRESTORE_EMULATOR_HOST=${fs ?? ''}, FIREBASE_AUTH_EMULATOR_HOST=${auth ?? ''}) ne vise pas la cible ` +
        `(${c.emulateurs ? `émulateurs ${c.hotes.firestore} et ${c.hotes.auth}` : 'le vrai projet, sans émulateur'}) : le SDK Admin suivrait le processus. Rien n'est ouvert.`,
    );
  }
}

/** Ouvre le SDK Admin sur la cible : `{auth, db}`. Chargé ici seulement, pour qu'une erreur d'usage n'attende pas le SDK. */
export async function ouvrir(c) {
  verifierProcessus(c);
  // Pas de recherche du serveur de métadonnées de Google Cloud (PC, pas GCE) :
  // elle attend plusieurs secondes et avertit pour rien.
  process.env.METADATA_SERVER_DETECTION ??= 'none';
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = c.emulateurs
    ? initializeApp({ projectId: c.projet }, 'terramemo-admin')
    : initializeApp({ credential: cert(lireCle(c.cle)), projectId: c.projet }, 'terramemo-admin');
  return { app, auth: getAuth(app), db: getFirestore(app) };
}
