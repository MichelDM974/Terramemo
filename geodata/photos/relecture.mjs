#!/usr/bin/env node
// Outil de relecture des photos (#34, lot P1 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.4 ; D60 a) : un serveur local sans
// dépendance qui sert une page sans cache (geodata/photos/relecture.html) et écrit le
// fichier des choix, geodata/photos/choix.json. Le script propose (candidats.json,
// npm run photos:candidats), l'utilisateur relit, le résultat est versionné : le modèle
// du niveau facile du quiz.
//
// Usage : npm run photos:relecture, puis http://localhost:8064/ dans le navigateur.
//   --reseau      écoute aussi sur le réseau local (relire depuis le téléphone, même
//                 Wi-Fi) ; l'adresse s'affiche au démarrage
//   --port <n>    autre port (8064 par défaut, dans la dizaine de Terramemo)
//   --choix <f>   autre fichier des choix (essais)
// Chaque action enregistre, par un fichier temporaire puis un renommage : fermer l'onglet
// ne perd rien, on reprend où l'on s'est arrêté. Les miniatures viennent de Commons,
// dans le navigateur de l'utilisateur : « rien d'externe » vaut pour le site, pas pour
// cet outil.
//
// choix.json : {v: 1, lieux: {id: entrée}}, dans l'ordre de candidats.json. Une entrée :
//   etat        « en_cours » (des gestes, pas encore validé) ou « relu » ;
//   relu_le     date et heure de la validation (UTC) ;
//   gardees     0 à 5 photos, dans l'ordre du carrousel : {fichier, sujet, point?: [x, y]
//               (point d'intérêt du recadrage, fractions de la largeur et de la hauteur),
//               licence, licence_url, auteur, titre, page} ;
//   ecartees    {fichier: raison} : les candidats écartés d'un geste, et pourquoi ;
//   aucune      la raison, quand aucune photo n'est gardée (D60 a : obligatoire) ;
//   pauvre      la raison, quand le lieu est marqué pauvre (touche P) ;
//   ajouts      candidats collés par « R » (titre de Commons), passés par la même règle,
//               avec le fichier qu'ils remplacent (remplace ; null : ajouté à la suite).
// D60 a : 3 à 5 photos visées, 1 ou 2 acceptées, aucune si rien de bon, avec la raison.

import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireLieux } from './lieux.mjs';
import { CHAMPS_META, fauxAuteur, licenceDe, perteRecadrage, verdict } from './regle.mjs';
import { client } from './reseau.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOSSIER = join(RACINE, 'geodata', 'photos');
export const MAX_GARDEES = 5;
export const VISEES = 3;
export const DELAI_CONFIRMATION_MS = 2000;

/**
 * La règle de relecture, écrite en haut de la page (§ 3.4). L'utilisateur peut la
 * changer ici. Elle suit la neutralité déjà actée (« Pays et frontières », « Zones
 * contestées et enclaves ») ; la liberté de panorama : le droit d'auteur d'un bâtiment
 * ou d'une œuvre récents survit à la licence libre de la photo dans les pays qui ne
 * l'ont pas.
 */
export const REGLE = [
  'Refuser les cartes, vues satellite, drapeaux, logos et schémas.',
  'Refuser les scènes de conflit, les victimes, les militaires et les armes, les réunions politiques.',
  'Refuser les visages en gros plan.',
  'Refuser une photo prise dans un autre lieu que celui de la fiche.',
  "Refuser une photo dont le sujet principal est un bâtiment ou une œuvre récents (auteur vivant ou mort depuis moins de 70 ans) dans un pays sans liberté de panorama (France, Italie, Belgique, Grèce, Ukraine, Émirats…) : leur auteur garde ses droits, quelle que soit la licence de la photo.",
  "Zone contestée ou territoire revendiqué : paysages et monuments seulement, sans drapeau ni signe d'une des parties.",
  'Garder 3 à 5 photos ; 1 ou 2 si le reste est mauvais ; aucune si rien de bon, en écrivant pourquoi.',
  "Une bande jaune : le recadrage 3:2 coupe plus de 30 % de l'image. Toucher la photo fixe le centre du recadrage.",
];

/** Raisons proposées pour écarter un candidat (touche X) : celles de la règle, puis le texte libre. */
export const RAISONS_ECART = ['carte, satellite, drapeau, logo ou schéma', 'conflit, militaires ou politique', 'visage en gros plan', 'autre lieu', 'liberté de panorama', 'signe d’une partie (zone contestée)', 'floue ou laide'];

/**
 * Contrôle une entrée de choix.json ; rend la liste des fautes (vide si elle est bonne).
 * Partagé par le serveur (refuse d'écrire une entrée fausse) et par les tests.
 */
export function fautesEntree(id, e) {
  const f = [];
  if (!e || typeof e !== 'object') return [`${id} : entrée absente`];
  if (!['en_cours', 'relu'].includes(e.etat)) f.push(`${id} : etat ${e.etat}`);
  const g = e.gardees ?? [];
  if (!Array.isArray(g)) return [...f, `${id} : gardees n'est pas une liste`];
  if (g.length > MAX_GARDEES) f.push(`${id} : ${g.length} photos gardées, ${MAX_GARDEES} au plus`);
  if (e.etat === 'relu') {
    if (!e.relu_le || Number.isNaN(Date.parse(e.relu_le))) f.push(`${id} : relu sans date`);
    if (g.length === 0 && !String(e.aucune ?? '').trim()) f.push(`${id} : aucune photo gardée, et aucune raison (D60 a)`);
  }
  const vus = new Set();
  for (const p of g) {
    if (!p.fichier || vus.has(p.fichier)) f.push(`${id} : fichier absent ou en double (${p.fichier})`);
    vus.add(p.fichier);
    const l = licenceDe(p.licence);
    if (!l) f.push(`${id} : ${p.fichier} : licence ${p.licence} hors de la liste`);
    else if ((l.famille === 'by' || l.famille === 'by-sa') && (p.auteur === null || fauxAuteur(p.auteur))) f.push(`${id} : ${p.fichier} : ${p.licence} sans auteur`);
    if (!String(p.page ?? '').startsWith('https://commons.wikimedia.org/wiki/File:')) f.push(`${id} : ${p.fichier} : page ${p.page}`);
    if (!String(p.sujet ?? '').trim() || /\.(jpe?g|png|tiff?|webp)$/i.test(p.sujet)) f.push(`${id} : ${p.fichier} : sujet « ${p.sujet} » (texte alternatif)`);
    if (p.point !== undefined && !(Array.isArray(p.point) && p.point.length === 2 && p.point.every((x) => typeof x === 'number' && x >= 0 && x <= 1))) f.push(`${id} : ${p.fichier} : point ${JSON.stringify(p.point)}`);
  }
  for (const [fichier, raison] of Object.entries(e.ecartees ?? {})) if (!String(raison).trim()) f.push(`${id} : ${fichier} écarté sans raison`);
  return f;
}

function options(argv) {
  const o = { port: 8064, reseau: false, choix: join(DOSSIER, 'choix.json') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--reseau') o.reseau = true;
    else if (a === '--choix') o.choix = argv[++i];
    else throw new Error(`option inconnue : ${a}`);
  }
  return o;
}

async function main() {
  const o = options(process.argv);
  const lireJson = async (c, defaut) => {
    try {
      return JSON.parse(await readFile(c, 'utf8'));
    } catch (e) {
      if (defaut !== undefined && e.code === 'ENOENT') return defaut;
      throw e;
    }
  };
  const candidats = await lireJson(join(DOSSIER, 'candidats.json'));
  let choix = await lireJson(o.choix, { v: 1, lieux: {} });
  const tous = await lireLieux(RACINE);
  const fichesMain = await lireJson(join(RACINE, 'geodata', 'fiches-main.json'));
  const extrait = await lireJson(join(RACINE, 'geodata', 'wikidata', 'capitales.json'));
  // L'ordre de la relecture (lieux.mjs) : celui des clés d'un objet JSON met les ids
  // numériques (les communes) en tête.
  const ordre = tous.map((l) => l.id).filter((id) => candidats.lieux[id]);
  // Libellé de l'item Wikidata à côté du nom de l'appli : la relecture de la table des QID (S58).
  const libelleWd = (id, q) => {
    const l = fichesMain.qid?.[id];
    if (l) return l.libelle ?? l.libelle_en ?? null;
    return extrait.pays?.[q]?.fr ?? null;
  };
  const reseau = client({ journal: (m) => console.log(m) });

  let ecriture = Promise.resolve();
  function enregistrer() {
    const lieux = Object.fromEntries([...ordre, ...Object.keys(choix.lieux).filter((id) => !ordre.includes(id))].filter((id) => choix.lieux[id]).map((id) => [id, choix.lieux[id]]));
    const texte = `{\n"v":1,\n"lieux":{\n${Object.entries(lieux).map(([id, e]) => `${JSON.stringify(id)}:${JSON.stringify(e)}`).join(',\n')}\n}\n}\n`;
    ecriture = ecriture.then(async () => {
      await writeFile(`${o.choix}.tmp`, texte);
      await rename(`${o.choix}.tmp`, o.choix);
    });
    return ecriture;
  }

  const page = () => readFile(join(DOSSIER, 'relecture.html'));
  const envoyer = (rep, code, type, corps) => {
    rep.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    rep.end(corps);
  };
  const json = (rep, code, x) => envoyer(rep, code, 'application/json; charset=utf-8', JSON.stringify(x));
  const corps = (req) =>
    new Promise((ok, ko) => {
      let s = '';
      req.on('data', (d) => {
        s += d;
        if (s.length > 1e6) ko(new Error('trop long'));
      });
      req.on('end', () => ok(s));
    });

  const serveur = createServer(async (req, rep) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const lecture = req.method === 'GET' || req.method === 'HEAD';
      if (lecture && (url.pathname === '/' || url.pathname === '/index.html')) return envoyer(rep, 200, 'text/html; charset=utf-8', await page());
      if (lecture && url.pathname === '/inter.woff2') return envoyer(rep, 200, 'font/woff2', await readFile(join(RACINE, 'public', 'vendor', 'inter', 'InterVariable.woff2')));
      if (lecture && url.pathname === '/api/etat') {
        const lieux = ordre.map((id) => {
          const c = candidats.lieux[id];
          return { id, ...c, libelle_wd: libelleWd(id, c.q) };
        });
        return json(rep, 200, { lieux, total: tous.length, choix: choix.lieux, regle: REGLE, raisons: RAISONS_ECART, max: MAX_GARDEES, visees: VISEES, delai_ms: DELAI_CONFIRMATION_MS });
      }
      const m = /^\/api\/lieu\/([\w-]+)$/.exec(url.pathname);
      if (req.method === 'POST' && m) {
        const id = m[1];
        if (!candidats.lieux[id]) return json(rep, 404, { erreur: `lieu inconnu : ${id}` });
        const e = JSON.parse(await corps(req));
        const fautes = fautesEntree(id, e);
        if (fautes.length) return json(rep, 400, { erreur: fautes.join(' ; ') });
        choix = { ...choix, lieux: { ...choix.lieux, [id]: e } };
        await enregistrer();
        return json(rep, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/remplacer') {
        // Un titre de Commons collé (« R ») : la même règle des licences que le script.
        const { titre } = JSON.parse(await corps(req));
        const fichier = decodeURIComponent(String(titre ?? '').trim().replace(/^.*\/wiki\//, '').replace(/^(File|Fichier):/i, '')).replaceAll('_', ' ');
        if (!fichier) return json(rep, 400, { erreur: 'titre vide' });
        const j = await reseau.commons({ action: 'query', titles: `File:${fichier}`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '500', iiextmetadatafilter: CHAMPS_META.join('|'), iiextmetadatalanguage: 'en' });
        const p = j.query?.pages?.[0];
        const ii = p?.imageinfo?.[0];
        const nom = (p?.title ?? `File:${fichier}`).replace(/^File:/, '');
        const info = ii ? { w: ii.width, h: ii.height, mime: ii.mime, meta: Object.fromEntries(Object.entries(ii.extmetadata ?? {}).map(([k, v]) => [k, String(v.value)])) } : null;
        const v = verdict(nom, info);
        if (!v.ok) return json(rep, 200, { refus: v.raison, fichier: nom });
        return json(rep, 200, {
          candidat: {
            fichier: nom, sources: ['remplace'], sujet: null, sujet_q: null, licence: v.licence, licence_url: v.licence_url, auteur: v.auteur, titre: v.titre, page: v.page,
            w: info.w, h: info.h, perte: Math.round(perteRecadrage(info.w, info.h) * 100) / 100, miniature: ii.thumburl ?? null,
          },
        });
      }
      return json(rep, 404, { erreur: 'introuvable' });
    } catch (e) {
      console.error(e);
      return json(rep, 500, { erreur: String(e.message ?? e) });
    }
  });
  const hote = o.reseau ? '0.0.0.0' : '127.0.0.1';
  serveur.listen(o.port, hote, () => {
    const relus = Object.values(choix.lieux).filter((e) => e.etat === 'relu').length;
    console.log(`Relecture des photos : http://localhost:${o.port}/ (${relus} lieux relus sur ${ordre.length} ; choix : ${o.choix})`);
    if (o.reseau) {
      for (const l of Object.values(networkInterfaces()).flat()) if (l && l.family === 'IPv4' && !l.internal) console.log(`  depuis le téléphone : http://${l.address}:${o.port}/`);
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
