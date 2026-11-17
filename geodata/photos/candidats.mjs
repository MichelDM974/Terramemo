#!/usr/bin/env node
// Candidats photos des 332 lieux (#34, lot P1 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.1 et § 3.2) : Wikidata et Commons,
// une requête à la fois, avec pause et cache sur disque hors de git (geodata/photos/reseau.mjs),
// puis la règle des licences (geodata/photos/regle.mjs). Sortie versionnée :
// geodata/photos/candidats.json, que l'outil de relecture lit (npm run photos:relecture).
// Rien de ce fichier n'est lu par le build ni servi par le site.
//
// Usage :
//   npm run photos:candidats                       les 332 lieux
//   npm run photos:candidats -- --lieux FRA,aden   quelques lieux (les autres sont gardés)
//   options : --cache <dossier> (défaut ~/.cache/terramemo/photos, ou PHOTOS_CACHE),
//             --pause <ms> entre deux requêtes (défaut 1 200),
//             --frais : tout relire sur le réseau, cache ignoré (puis réécrit)
// Relancer reprend le cache : seules les requêtes qui ont échoué repartent sur le réseau,
// et les fiches des fichiers de Commons (licence, auteur, catégories) lues il y a plus de
// 30 jours. Chaque lieu dit la date de la plus ancienne réponse qu'il a utilisée (lu_le),
// chaque candidat celle de sa fiche Commons : extrait_le n'est que la date du calcul.
//
// Sources, dans l'ordre où le script les prend (§ 3.1) :
//   pays          patrimoine mondial (P1435) du pays ; lieux notables, requête resserrée,
//                 seulement si le patrimoine donne moins de 10 sujets (elle dépasse le délai
//                 pour les grands pays, qui ont assez de patrimoine) ; image du lieu (P18) ;
//                 « Quality images of … » en complément ; catégorie Commons du lieu pour
//                 un lieu à moins de 3 candidats (les très petits pays : Tuvalu)
//   territoires,  les mêmes, situés dans le lieu (P131) plutôt que de son pays
//   zones, Antarctique
//   mers          propositions à la main (main.json) ; lieux de la côte (P206), États
//                 exclus ; catégorie Commons de la mer en dernier
//   communes      image de la commune (P18) ; lieux situés dans la commune (P131)
// « Featured pictures » n'est jamais pris : de belles photos sans rapport avec le lieu.
// Une requête qui dépasse 45 s est retentée une fois, puis sautée : le lieu est alors
// marqué « à compléter » (a_completer).
//
// Classement : propositions à la main, puis les sujets Wikidata par leur nombre de
// sitelinks (un site du patrimoine à plusieurs pays en bas), l'image du lieu, puis les
// fichiers sans sujet (Quality images, catégorie). 10 candidats par lieu, un par sujet
// d'abord. Un lieu à moins de 3 candidats avec sujet est « pauvre » : l'outil n'y coche
// rien d'avance (§ 3.4), comme pour un lieu sensible (lieux.mjs) ou un candidat sensible
// (sujet ou pays dans main.json, sujets_sensibles, ou lieu sensible lui-même).

import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../outils.mjs';
import { lireLieux } from './lieux.mjs';
import { lireFichiers } from './commons.mjs';
import { perteRecadrage, verdict } from './regle.mjs';
import { client, DelaiDepasse } from './reseau.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOSSIER = join(RACINE, 'geodata', 'photos');
const SORTIE = join(DOSSIER, 'candidats.json');
export const VERSION_CANDIDATS = 1;
export const PAR_LIEU = 10;
const SEUIL_NOTABLES = 10; // sujets du patrimoine sous lesquels on cherche les lieux notables
const SEUIL_PAUVRE = 3; // candidats avec sujet sous lesquels un lieu est pauvre

// Groupes de classement : le plus petit d'abord.
const GROUPE = { main: 0, lieu_commune: 1, sujet: 2, lieu: 3, transnational: 4, qi: 5, categorie: 6 };

/** Les requêtes de requetes.rq, par nom de section (« #= nom »), comme geodata/wikidata.mjs. */
export function sections(texte) {
  const res = {};
  let nom = null;
  for (const ligne of texte.split('\n')) {
    const m = /^#= (\w+)$/.exec(ligne);
    if (m) {
      nom = m[1];
      res[nom] = '';
    } else if (nom && !ligne.startsWith('#')) res[nom] += `${ligne}\n`;
  }
  return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.trim()]));
}

const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
/** Nom de fichier d'une valeur P18 (…/Special:FilePath/Nom%20du%20fichier.jpg). */
export function fichierDe(uri) {
  const i = uri.indexOf('/Special:FilePath/');
  const nom = i >= 0 ? uri.slice(i + '/Special:FilePath/'.length) : uri;
  return decodeURIComponent(nom).replaceAll('_', ' ');
}

/**
 * Classe et choisit les candidats d'un lieu. bruts : Map fichier → { groupe, sources,
 * sujet, sujet_q, n } ; acceptes : Map fichier → verdict ok. Rend les PAR_LIEU retenus
 * (un par sujet d'abord, puis les seconds fichiers des mêmes sujets) et le reste.
 */
export function choisir(bruts, acceptes) {
  const tries = [...bruts.entries()]
    .filter(([f]) => acceptes.has(f))
    .sort(([fa, a], [fb, b]) => a.groupe - b.groupe || (b.n ?? 0) - (a.n ?? 0) || (fa < fb ? -1 : fa > fb ? 1 : 0));
  const pris = [];
  const sujets = new Set();
  for (const [f, c] of tries) {
    if (pris.length >= PAR_LIEU) break;
    const cle = c.sujet_q ?? `fichier:${f}`;
    if (sujets.has(cle)) continue;
    sujets.add(cle);
    pris.push(f);
  }
  for (const [f] of tries) {
    if (pris.length >= PAR_LIEU) break;
    if (!pris.includes(f)) pris.push(f);
  }
  return { pris, reste: tries.length - pris.length };
}

function options(argv) {
  const o = { lieux: null, cache: undefined, pause: 1200, frais: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lieux') o.lieux = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--cache') o.cache = argv[++i];
    else if (a === '--pause') o.pause = Number(argv[++i]);
    else if (a === '--frais') o.frais = true;
    else throw new Error(`option inconnue : ${a}`);
  }
  return o;
}

async function main() {
  const debut = Date.now();
  const o = options(process.argv);
  const texteRequetes = await readFile(join(DOSSIER, 'requetes.rq'), 'utf8');
  const req = sections(texteRequetes);
  const brutMain = await readFile(join(DOSSIER, 'main.json'), 'utf8');
  const main = JSON.parse(brutMain);
  const tous = await lireLieux(RACINE);
  let lieux = tous;
  if (o.lieux) {
    const inconnus = o.lieux.filter((id) => !tous.some((l) => l.id === id));
    if (inconnus.length) throw new Error(`lieux inconnus : ${inconnus.join(', ')}`);
    lieux = tous.filter((l) => o.lieux.includes(l.id));
  }
  const reseau = client({ cache: o.cache, pause: o.pause, frais: o.frais, journal: (m) => console.log(m) });
  const plusAncienne = (dates) => dates.filter(Boolean).sort()[0] ?? null;
  const remplir = (r, valeurs) => r.replace(/\{\{(\w+)\}\}/g, (_, k) => valeurs[k]);

  // Items des communes, par leur code INSEE : une requête pour les 24.
  if (lieux.some((l) => l.sorte === 'commune')) {
    const codes = tous.filter((l) => l.sorte === 'commune').map((l) => `"${l.insee}"`).join(' ');
    const lignes = await reseau.sparql(remplir(req.communes, { codes }));
    const parCode = {};
    for (const b of lignes) (parCode[b.code.value] ??= []).push(qid(b.c.value));
    for (const l of lieux.filter((x) => x.sorte === 'commune')) {
      const qs = [...new Set(parCode[l.insee] ?? [])];
      if (qs.length !== 1) throw new Error(`commune ${l.insee} : ${qs.length} items pour son code INSEE (${qs.join(', ')})`);
      l.q = qs[0];
    }
  }

  // Image, catégorie et sitelinks des lieux eux-mêmes, par lots de 100.
  const infoLieu = new Map();
  for (let i = 0; i < lieux.length; i += 100) {
    const items = lieux.slice(i, i + 100).map((l) => `wd:${l.q}`).join(' ');
    const lignes = await reseau.sparql(remplir(req.lieux, { items }));
    for (const b of lignes) {
      const q = qid(b.s.value);
      const x = infoLieu.get(q) ?? { images: [], categorie: null, n: Number(b.n.value), lu_le: reseau.luLe(lignes) };
      if (b.img && !x.images.includes(fichierDe(b.img.value))) x.images.push(fichierDe(b.img.value));
      x.categorie ??= b.cat?.value ?? null;
      infoLieu.set(q, x);
    }
  }

  // Lieux et sujets sensibles : un candidat qui s'y rapporte n'est jamais coché d'avance.
  const sensibles = new Map(Object.entries(main.sujets_sensibles ?? {}).filter(([k]) => k !== '_'));
  for (const l of tous) if (l.sensible && l.q) sensibles.set(l.q, `${l.nom} : ${l.sensible}`);

  // fichier → info de Commons (ou null : absent), pour tout le lancement. Un fichier
  // que Commons n'a pas décrit (ni info, ni absent) n'y est pas : il reste « à compléter ».
  const infos = new Map();
  const tentes = new Set();
  async function imageinfo(fichiers) {
    const manque = [...new Set(fichiers)].filter((f) => !infos.has(f) && !tentes.has(f)).sort();
    for (const f of manque) tentes.add(f);
    for (const [f, v] of await lireFichiers(reseau, manque)) infos.set(f, v);
  }

  async function categorie(nom, limite, dates) {
    const j = await reseau.commons({ action: 'query', list: 'categorymembers', cmtitle: `Category:${nom}`, cmtype: 'file', cmlimit: String(limite) });
    dates.push(reseau.luLe(j));
    return (j.query?.categorymembers ?? []).map((m) => m.title.replace(/^File:/, ''));
  }

  const resultats = {};
  let n = 0;
  for (const l of lieux) {
    n++;
    const t0 = Date.now();
    const bruts = new Map();
    const aCompleter = [];
    const sourcesComptes = {};
    const dates = []; // dates des réponses utilisées pour ce lieu
    const ajouter = (f, source, groupe, x = {}) => {
      const c = bruts.get(f);
      sourcesComptes[source] = (sourcesComptes[source] ?? 0) + 1;
      if (c) {
        if (!c.sources.includes(source)) c.sources.push(source);
        if (groupe < c.groupe) Object.assign(c, { groupe, ...x });
        return;
      }
      bruts.set(f, { groupe, sources: [source], sujet: null, sujet_q: null, n: null, ...x });
    };
    const lignesSparql = async (section, source) => {
      try {
        const lignes = await reseau.sparql(remplir(req[section], { q: `wd:${l.q}` }));
        dates.push(reseau.luLe(lignes));
        return lignes;
      } catch (e) {
        if (!(e instanceof DelaiDepasse)) throw e;
        aCompleter.push(source);
        console.log(`  ${l.id} : ${source} sautée (${e.message})`);
        return [];
      }
    };
    const depuisLignes = (lignes, source, groupeDe) => {
      for (const b of lignes) {
        const sq = qid(b.s.value);
        const pays = b.pays?.value ? b.pays.value.split(' ').map(qid) : [];
        const sens = sensibles.get(sq) ?? pays.map((p) => sensibles.get(p)).find(Boolean) ?? null;
        ajouter(fichierDe(b.img.value), source, groupeDe(b), {
          sujet: b.l?.value ?? null,
          sujet_q: sq,
          n: Number(b.n.value),
          ...(b.np ? { np: Number(b.np.value) } : {}),
          ...(sens ? { sensible: sens } : {}),
        });
      }
    };
    const info = infoLieu.get(l.q) ?? { images: [], categorie: null, n: null, lu_le: null };
    dates.push(info.lu_le);
    const imagesLieu = (groupe) => {
      for (const f of info.images) ajouter(f, 'lieu', groupe, { sujet: l.nom, sujet_q: l.q, n: info.n });
    };
    const sujetsDe = () => new Set([...bruts.values()].filter((c) => c.groupe <= GROUPE.transnational && c.sujet_q && c.sujet_q !== l.q).map((c) => c.sujet_q)).size;

    if (['pays', 'territoire', 'zone', 'continent'].includes(l.sorte)) {
      const dans = l.sorte !== 'pays';
      const groupePatrimoine = (b) => (Number(b.np?.value ?? 1) > 1 ? GROUPE.transnational : GROUPE.sujet);
      depuisLignes(await lignesSparql(dans ? 'patrimoine_dans' : 'patrimoine', 'patrimoine'), 'patrimoine', groupePatrimoine);
      if (dans || sujetsDe() < SEUIL_NOTABLES) depuisLignes(await lignesSparql(dans ? 'notables_dans' : 'notables', 'notables'), 'notables', () => GROUPE.sujet);
      imagesLieu(GROUPE.lieu);
    } else if (l.sorte === 'mer') {
      for (const p of main.mers?.[l.id] ?? []) ajouter(p.fichier, 'main', GROUPE.main, { sujet: p.sujet ?? null, sujet_q: p.sujet_q ?? null, raison: p.raison });
      depuisLignes(await lignesSparql('cote', 'cote'), 'cote', () => GROUPE.sujet);
      imagesLieu(GROUPE.lieu);
    } else {
      imagesLieu(GROUPE.lieu_commune);
      depuisLignes(await lignesSparql('commune', 'commune'), 'commune', () => GROUPE.sujet);
    }
    await imageinfo([...bruts.keys()]);

    const acceptes = new Map();
    const refus = {};
    const sansInfo = new Set();
    const juger = () => {
      for (const f of bruts.keys()) {
        if (acceptes.has(f) || refus[f]) continue;
        if (!infos.has(f)) {
          sansInfo.add(f);
          continue;
        }
        sansInfo.delete(f);
        const v = verdict(f, infos.get(f));
        if (v.ok) acceptes.set(f, v);
        else refus[f] = v.raison;
      }
    };
    juger();
    // Candidats avec sujet, propositions à la main exclues : une mer complétée à la main
    // reste pauvre, rien n'y est coché d'avance.
    const avecSujet = () => [...acceptes.keys()].filter((f) => bruts.get(f).groupe > GROUPE.main && bruts.get(f).groupe <= GROUPE.transnational).length;
    // Compléments de Commons, sans sujet : Quality images, puis la catégorie du lieu.
    if (['pays', 'territoire', 'zone', 'continent'].includes(l.sorte) && info.categorie && acceptes.size < PAR_LIEU) {
      for (const f of await categorie(`Quality images of ${info.categorie}`, 100, dates)) ajouter(f, 'qi', GROUPE.qi);
      await imageinfo([...bruts.keys()]);
      juger();
    }
    const veutCategorie = l.sorte === 'mer' ? acceptes.size < PAR_LIEU : l.sorte !== 'commune' && avecSujet() < SEUIL_PAUVRE;
    if (veutCategorie && info.categorie) {
      for (const f of await categorie(info.categorie, 100, dates)) ajouter(f, 'categorie', GROUPE.categorie);
      await imageinfo([...bruts.keys()]);
      juger();
    }

    // Commons n'a pas décrit ces fichiers (ni info, ni absent) : ni acceptés ni refusés.
    if (sansInfo.size) aCompleter.push(`fiche Commons (${sansInfo.size} fichier${sansInfo.size > 1 ? 's' : ''})`);
    const { pris, reste } = choisir(bruts, acceptes);
    const refuses = {};
    for (const r of Object.values(refus)) refuses[r] = (refuses[r] ?? 0) + 1;
    const nSujet = avecSujet();
    const candidats = pris.map((f) => {
      const c = bruts.get(f);
      const v = acceptes.get(f);
      const i = infos.get(f);
      return {
        fichier: f,
        sources: c.sources,
        sujet: c.sujet,
        sujet_q: c.sujet_q,
        ...(c.n !== null ? { n: c.n } : {}),
        ...(c.np > 1 ? { pays_du_site: c.np } : {}),
        ...(c.sensible ? { sensible: c.sensible } : {}),
        ...(c.raison ? { raison: c.raison } : {}),
        licence: v.licence,
        licence_url: v.licence_url,
        auteur: v.auteur,
        ...(v.auteur_de ? { auteur_de: v.auteur_de } : {}),
        ...(v.nofop ? { nofop: v.nofop } : {}),
        titre: v.titre,
        page: v.page,
        w: i.w,
        h: i.h,
        perte: Math.round(perteRecadrage(i.w, i.h) * 100) / 100,
        miniature: i.miniature,
        lu_le: i.lu_le,
      };
    });
    for (const f of bruts.keys()) if (infos.get(f)) dates.push(infos.get(f).lu_le);
    resultats[l.id] = {
      terrain: l.terrain,
      sorte: l.sorte,
      nom: l.nom,
      q: l.q,
      ...(info.categorie ? { categorie: info.categorie } : {}),
      ...(l.sensible ? { sensible: l.sensible } : {}),
      ...(nSujet < SEUIL_PAUVRE ? { pauvre: `${nSujet} candidat${nSujet > 1 ? 's' : ''} avec un sujet Wikidata` } : {}),
      ...(aCompleter.length ? { a_completer: aCompleter } : {}),
      extrait_le: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      lu_le: plusAncienne(dates),
      comptes: { trouves: bruts.size, acceptes: acceptes.size, avec_sujet: nSujet, montres: candidats.length, en_reserve: reste, refuses, sources: sourcesComptes },
      candidats,
    };
    console.log(
      `${n}/${lieux.length} ${l.id} (${l.nom}) : ${bruts.size} trouvés, ${acceptes.size} acceptés (${nSujet} avec sujet), ${candidats.length} montrés` +
        `${aCompleter.length ? `, à compléter : ${aCompleter.join(', ')}` : ''} ; ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
  }

  // Écriture : les lieux d'avant gardés (lancement partiel), dans l'ordre de la relecture.
  let avant = { lieux: {} };
  try {
    avant = JSON.parse(await readFile(SORTIE, 'utf8'));
  } catch {
    // premier lancement
  }
  const fusion = { ...avant.lieux, ...resultats };
  const ordre = tous.map((l) => l.id).filter((id) => fusion[id]);
  const objet = (ids) => `{\n${ids.map((id) => `${JSON.stringify(id)}:${JSON.stringify(fusion[id])}`).join(',\n')}\n}`;
  const texte =
    `{\n"v":${VERSION_CANDIDATS},\n"ecrit_le":${JSON.stringify(new Date().toISOString().replace(/\.\d+Z$/, 'Z'))},\n` +
    `"requetes_sha256":${JSON.stringify(sha256(texteRequetes))},\n"regle_sha256":${JSON.stringify(sha256(await readFile(join(DOSSIER, 'regle.mjs'))))},\n` +
    `"main_sha256":${JSON.stringify(sha256(brutMain))},\n` +
    `"lieux_presents":${ordre.length},\n"lieux":${objet(ordre)}\n}\n`;
  await writeFile(`${SORTIE}.tmp`, texte);
  await rename(`${SORTIE}.tmp`, SORTIE);
  const s = reseau.stats;
  console.log(
    `${lieux.length} lieux en ${Math.round((Date.now() - debut) / 1000)} s ; requêtes : ${s.reseau} au réseau (${Math.round(s.reseau_ms / 1000)} s), ` +
      `${s.cache} du cache (${s.perimees} relues, trop vieilles), ${Math.round(s.attente_ms / 1000)} s de pause ; ${ordre.length} lieux dans candidats.json`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
