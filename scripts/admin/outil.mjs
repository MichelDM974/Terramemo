#!/usr/bin/env node
// Outil du propriétaire de Terramemo (J1b, lot 5b ; étude
// docs/etudes/2026-11-07-j1b-conception.md, § 7.5 ; D33 a). Lancé à la main,
// sur le PC, jamais sur le Pi ni en CI. À blanc par défaut : il dit ce qu'il
// ferait, et l'empreinte de ce plan ; --appliquer --attendu <empreinte> le
// fait, exactement : le plan recalculé doit avoir l'empreinte du plan relu,
// sinon rien n'est fait. Mode d'emploi et tournées :
// .claude/skills/run-terramemo/SKILL.md, « Outil du propriétaire ».
//
//   npm run admin -- <commande> [options]
//   node scripts/admin/outil.mjs <commande> [options]
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { cible, ErreurUsage, ouvrir, phraseCible } from './connexion.mjs';

const AIDE = `Outil du propriétaire de Terramemo (à blanc sans --appliquer).

Commandes :
  inactifs              comptes sans activité depuis 2 ans (lastRefreshTime) : lots, profil, puis le compte ; invités exclus
  tombes [--finir]      pierres tombales de plus d'un jour (compte parti et lots vides) ; --finir : finit une suppression restée en route
  orphelins             lots et profils sans compte dans Auth
  demandes [--uid U] [--avec-a-juger | --garder-a-juger]
                        retire les places du pseudo de chaque demande (clé exacte), puis la demande
  abus <uid>            lots et profil de cet uid, puis son compte bloqué
  releve [--n N] [--uid U] [--taille [--max-lectures M]]
                        nombre de lots par uid (comptés sans être lus), les plus gros d'abord (N lignes, 20 par
                        défaut) ; --taille lit chaque lot (une lecture chacun) pour ses événements et ses octets,
                        refusé au-delà de M lots (5 000 par défaut)
  tournee [--trimestrielle]
                        à blanc seulement : demandes, tombes, orphelins, relevé (et inactifs si --trimestrielle)

Options : --appliquer --attendu E (exécuter le plan relu à blanc, d'empreinte E ; refusé s'il a changé depuis),
--json (sortie lisible par un programme).
Cible : les émulateurs si FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST sont posés, sinon le
vrai projet terramemo-geo, par la clé de ~/Sauvegardes/terramemo/admin/ (ou TERRAMEMO_CLE_ADMIN).`;

const COMMANDES = ['inactifs', 'tombes', 'orphelins', 'demandes', 'abus', 'releve', 'tournee'];
const DRAPEAUX = { '--appliquer': 'appliquer', '--json': 'json', '--finir': 'finir', '--avec-a-juger': 'avecAJuger', '--garder-a-juger': 'garderAJuger', '--trimestrielle': 'trimestrielle', '--taille': 'taille', '--aide': 'aide', '-h': 'aide', '--help': 'aide' };
const AVEC_VALEUR = { '--uid': 'uid', '--n': 'n', '--max-lectures': 'maxLectures', '--attendu': 'attendu' };

/** Les arguments : `{commande, uid?, options}` ; ErreurUsage si un mot est inconnu ou mal placé. */
export function lireArguments(argv) {
  const o = {};
  const libres = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a in DRAPEAUX) o[DRAPEAUX[a]] = true;
    else if (a in AVEC_VALEUR) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new ErreurUsage(`${a} attend une valeur.`);
      o[AVEC_VALEUR[a]] = v;
    } else if (a.startsWith('-')) throw new ErreurUsage(`Option inconnue : ${a}`);
    else libres.push(a);
  }
  if (o.aide) return { commande: 'aide', options: o };
  const [commande, ...reste] = libres;
  if (!commande) throw new ErreurUsage('Quelle commande ?');
  if (!COMMANDES.includes(commande)) throw new ErreurUsage(`Commande inconnue : ${commande}`);
  if (commande === 'abus' ? reste.length !== 1 : reste.length) throw new ErreurUsage(commande === 'abus' ? 'abus attend un uid, un seul.' : `De trop : ${reste.join(' ')}`);
  if (commande === 'tournee' && o.appliquer) throw new ErreurUsage('tournee est à blanc seulement : appliquer ensuite chaque commande, après lecture.');
  if (commande === 'releve' && o.appliquer) throw new ErreurUsage('releve ne change rien : pas de --appliquer.');
  if (o.appliquer && o.attendu === undefined) {
    throw new ErreurUsage("--appliquer exécute un plan relu : lancer d'abord la commande à blanc, qui affiche le plan et son empreinte, puis --appliquer --attendu <empreinte>.");
  }
  if (o.attendu !== undefined && (!o.appliquer || !/^[0-9a-f]{12}$/.test(o.attendu))) throw new ErreurUsage('--attendu : l’empreinte (12 caractères) que donne la commande à blanc, avec --appliquer.');
  if (o.finir && commande !== 'tombes') throw new ErreurUsage('--finir ne va qu’avec tombes.');
  if (o.uid && commande !== 'demandes' && commande !== 'releve') throw new ErreurUsage('--uid ne va qu’avec demandes ou releve.');
  if ((o.avecAJuger || o.garderAJuger) && commande !== 'demandes') throw new ErreurUsage('--avec-a-juger et --garder-a-juger ne vont qu’avec demandes.');
  if (o.taille && commande !== 'releve') throw new ErreurUsage('--taille ne va qu’avec releve (tournee compte les lots sans les lire).');
  if (o.maxLectures !== undefined && (!o.taille || !/^[1-9]\d*$/.test(o.maxLectures))) throw new ErreurUsage('--max-lectures : un entier positif, avec releve --taille.');
  if ((o.avecAJuger || o.garderAJuger) && !o.uid) throw new ErreurUsage('--avec-a-juger et --garder-a-juger se donnent pour une demande à la fois : --uid <uid>.');
  if (o.avecAJuger && o.garderAJuger) throw new ErreurUsage('--avec-a-juger ou --garder-a-juger, pas les deux.');
  if (o.trimestrielle && commande !== 'tournee') throw new ErreurUsage('--trimestrielle ne va qu’avec tournee.');
  if (o.n !== undefined && (commande !== 'releve' && commande !== 'tournee' || !/^[1-9]\d*$/.test(o.n))) throw new ErreurUsage('--n : un entier positif, avec releve ou tournee.');
  return { commande, uid: reste[0], options: o };
}

/** L'heure de référence : TERRAMEMO_MAINTENANT (émulateurs seulement, refusé ailleurs par cible), sinon maintenant. */
function heure(env) {
  if (!env.TERRAMEMO_MAINTENANT) return new Date();
  const d = new Date(env.TERRAMEMO_MAINTENANT);
  if (Number.isNaN(d.getTime())) throw new ErreurUsage(`TERRAMEMO_MAINTENANT illisible : ${env.TERRAMEMO_MAINTENANT}`);
  return d;
}

const nombre = (n) => n.toLocaleString('fr-FR');

/**
 * L'empreinte d'un plan : ce qu'il touche (cible, tâche, chemins, comptes,
 * heure lue de chaque document), pas ses textes (un rang qui bouge parce
 * qu'un autre joueur a joué ne change pas ce qui serait supprimé).
 */
export function empreinte(c, tache, actions) {
  const effet = actions.map(({ type, uid, uids, chemin, chemins, pre }) => ({ type, uid, uids, chemin, chemins, pre: pre ? pre.toDate().toISOString() : undefined }));
  return createHash('sha256').update(JSON.stringify({ projet: c.projet, emulateurs: c.emulateurs, tache, effet })).digest('hex').slice(0, 12);
}

function tableau(lignes, n) {
  const l = lignes.slice(0, n).map(
    (x) =>
      `  ${x.uid.padEnd(28)} ${x.compte.padEnd(7)} ${String(x.lots).padStart(6)} lots` +
      (x.octets === undefined ? '' : ` ${String(x.evenements).padStart(7)} évts ${nombre(x.octets).padStart(11)} octets`) +
      (x.tombe ? '  pierre tombale' : ''),
  );
  if (lignes.length > n) l.push(`  … et ${lignes.length - n} autres (--n pour en voir plus).`);
  return l;
}

export async function principal(argv = process.argv.slice(2), env = process.env, sortie = console.log) {
  const { commande, uid, options } = lireArguments(argv);
  if (commande === 'aide') {
    sortie(AIDE);
    return 0;
  }
  const c = cible(env);
  const maintenant = heure(env);
  const taches = await import('./taches.mjs');
  const json = !!options.json;
  const dire = json ? () => {} : sortie;
  dire(phraseCible(c));
  dire(
    options.appliquer
      ? `Mode : --appliquer (le plan ci-dessous est exécuté s'il a l'empreinte ${options.attendu}).`
      : 'Mode : à blanc (rien ne change ; relire le plan, puis --appliquer --attendu <son empreinte>).',
  );
  const sdk = await ouvrir(c);
  const ctx = { ...sdk, maintenant };
  const aFaire =
    commande === 'tournee'
      ? ['demandes', 'tombes', 'orphelins', ...(options.trimestrielle ? ['inactifs'] : []), 'releve']
      : [commande];
  const rendu = { projet: c.projet, emulateurs: c.emulateurs, applique: !!options.appliquer, maintenant: maintenant.toISOString(), taches: [] };
  let code = 0;
  try {
    for (const t of aFaire) {
      const plan =
        t === 'abus' ? await taches.abus(ctx, uid)
        : t === 'tombes' ? await taches.tombes(ctx, { finir: !!options.finir })
        : t === 'demandes' ? await taches.demandes(ctx, { uid: options.uid ?? null, avecAJuger: !!options.avecAJuger, garderAJuger: !!options.garderAJuger })
        : t === 'releve' ? await taches.releve(ctx, { taille: !!options.taille, uid: options.uid ?? null, maxLectures: Number(options.maxLectures ?? taches.MAX_LECTURES) })
        : await taches[t](ctx);
      dire(`\n== ${t} ==`);
      for (const n of plan.notes) dire(n);
      if (plan.releve) for (const l of tableau(plan.releve, Number(options.n ?? 20))) dire(l);
      if (t !== 'releve') {
        dire(plan.actions.length ? `Plan (${plan.actions.length} action${plan.actions.length > 1 ? 's' : ''}) :` : 'Rien à faire.');
        for (const a of plan.actions) dire(`  - ${taches.decrire(a)}`);
      }
      const entree = { tache: t, notes: plan.notes, actions: plan.actions.map(taches.enJson), faites: 0 };
      if (t !== 'releve') {
        entree.empreinte = empreinte(c, t, plan.actions);
        dire(`Empreinte du plan : ${entree.empreinte}`);
        if (!options.appliquer && plan.actions.length) {
          const commandeSeule = commande === 'tournee' ? [t] : argv.filter((a) => a !== '--json');
          dire(`Pour l'exécuter tel quel : npm run admin -- ${commandeSeule.join(' ')} --appliquer --attendu ${entree.empreinte}`);
        }
      }
      if (plan.releve) entree.releve = plan.releve;
      rendu.taches.push(entree);
      if (options.appliquer && entree.empreinte !== options.attendu) {
        throw new Error(
          `le plan a changé depuis sa lecture (empreinte ${entree.empreinte}, attendue ${options.attendu}) : rien n'est fait. ` +
            `Relire ce plan, puis --appliquer --attendu ${entree.empreinte}.`,
        );
      }
      if (options.appliquer && plan.actions.length) {
        await taches.executer(ctx, plan.actions, (a) => {
          entree.faites++;
          dire(`  fait : ${taches.decrire(a)}`);
        });
        dire(`${entree.faites} action${entree.faites > 1 ? 's' : ''} faite${entree.faites > 1 ? 's' : ''}.`);
      }
    }
  } catch (e) {
    rendu.erreur = String(e?.message ?? e);
    if (!json) console.error(`Erreur : ${rendu.erreur}`);
    code = 1;
  } finally {
    await sdk.app.delete();
  }
  if (json) sortie(JSON.stringify(rendu, null, 2));
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then(
    (code) => process.exit(code),
    (e) => {
      if (e instanceof ErreurUsage) {
        console.error(`${e.message}\n\n${AIDE}`);
        process.exit(2);
      }
      console.error(e);
      process.exit(1);
    },
  );
}
