// Capitales des pays (étude J2, § 2.1 et § 2.5), appelé par geodata/build.mjs (tout le
// build, ou --seulement capitales) ; sans réseau, sans effet à l'import. Lit :
//   geodata/wikidata/capitales.json  extrait figé et daté de Wikidata (npm run wikidata)
//   geodata/capitales-main.json      table à la main (corrections, rôles, noms, D36 à D38)
//   public/geo/pays.json, noms.fr.json  les pays jouables et optionnels (sortie du build)
// Produit (identiques octet pour octet d'un lancement à l'autre) :
//   capitales.json     [{pays, c: [{q, lon, lat, role, p?, e?}], m?, x?}] : q l'item
//                      Wikidata, coordonnées à 2 décimales (sauf un point de la table,
//                      gardé tel quel : Jérusalem-Est), p: 1 la principale, e: 1 la
//                      capitale montrée en épreuve (D38 d, une par pays), m: 1 une
//                      capitale au nom du pays (D37), x les pays dont la capitale n'est
//                      jamais un leurre (Israël ↔ Palestine) ;
//   capitales.fr.json  {noms: {Qid: nom}, alias: {Qid: [...]}} (décision « Langue »).
// Échoue (exception) si l'extrait et la table ne s'accordent plus : une ligne de la table
// qui ne s'applique plus, un pays sans capitale ou sans principale, un nom manquant.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arrondi, sha256 } from './outils.mjs';

export const CHEMINS = {
  script: 'geodata/capitales.mjs',
  main: 'geodata/capitales-main.json',
  extrait: 'geodata/wikidata/capitales.json',
  requetes: 'geodata/wikidata/requetes.rq',
};

/** Rôles d'une capitale juste, dans l'ordre d'affichage. */
export const ROLES = ['officielle', 'siege', 'economique'];

/** URL de la source Wikidata dans public/geo/sources.json (sa clé pour --seulement). */
export const URL_WIKIDATA = 'https://www.wikidata.org';

/** Comparaison de noms sans accents, casse, tirets ni apostrophes (comme src/texte.ts, normaliser). */
export const normaliser = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[-‐‑–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const numero = (q) => Number(q.slice(1));
const parQ = (a, b) => numero(a) - numero(b);
const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => k !== '_');

/**
 * Une date de qualificatif (xsd:dateTime) : AAAA-MM-JJ, ou null si valeur inconnue. Une
 * année négative (Memphis, Thinis) commence par « - », rangé avant tout chiffre.
 */
const jour = (v) => (/^-?\d{4,}-\d{2}-\d{2}T/.test(v) ? v.slice(0, v.indexOf('T')) : null);

/**
 * Une déclaration P36 vaut-elle à la date de l'extrait ? Fin (P582) passée ou de valeur
 * inconnue : non ; début (P580) à venir : non.
 */
function enCours(d, date) {
  const fins = d.qualificatifs.P582 ?? [];
  if (fins.some((v) => jour(v) === null || jour(v) <= date)) return false;
  const debuts = (d.qualificatifs.P580 ?? []).map(jour).filter(Boolean);
  return !debuts.some((v) => v > date);
}

/**
 * Rang (1 = le plus grand) de chaque clé selon une valeur, ex aequo au même rang.
 * Une valeur absente compte 0.
 */
function rangs(valeurs) {
  const v = [...valeurs.values()].map((x) => x ?? 0);
  return new Map([...valeurs].map(([k, x]) => [k, 1 + v.filter((y) => y > (x ?? 0)).length]));
}

/**
 * Notoriété des capitales (§ 2.4, rang combiné) : moyenne du rang par nombre de
 * Wikipédias et du rang par vues de la Wikipédia en français, sur les capitales des pays
 * jouables dont l'item n'est pas celui du pays (Monaco, Singapour, Vatican prennent le
 * niveau du pays). Rend Qid → {wikipedias, rang_wikipedias, vues_fr, rang_vues}.
 */
export function notoriete(lignes, villes) {
  const eligibles = new Set();
  for (const l of lignes) if (l.jouable) for (const c of l.c) if (c.q !== l.item) eligibles.add(c.q);
  const ids = [...eligibles].sort(parQ);
  const rw = rangs(new Map(ids.map((q) => [q, villes[q].wikipedias])));
  const rv = rangs(new Map(ids.map((q) => [q, villes[q].vues_fr])));
  return new Map(
    ids.map((q) => [q, { wikipedias: villes[q].wikipedias, rang_wikipedias: rw.get(q), vues_fr: villes[q].vues_fr ?? 0, rang_vues: rv.get(q) }]),
  );
}

/**
 * D38 d : la plus connue des capitales d'un pays par le rang combiné (le plus petit),
 * à égalité la principale, puis le plus petit Qid. mesures : Qid → {rang_wikipedias, rang_vues}.
 */
export function plusConnue(capitales, mesures) {
  const combine = (c) => (mesures[c.q].rang_wikipedias + mesures[c.q].rang_vues) / 2;
  return [...capitales].sort((a, b) => combine(a) - combine(b) || (b.p ?? 0) - (a.p ?? 0) || parQ(a.q, b.q))[0].q;
}

/**
 * Construit les deux fichiers servis. racine : la racine du dépôt. Rend
 * { fichiers: {nom: texte}, source, entrees, notes } : source et entrees vont dans
 * public/geo/sources.json (fusionnerSources), notes s'affichent au build.
 */
export async function construireCapitales(racine) {
  const lire = async (c) => readFile(join(racine, c));
  const lireJson = async (c) => JSON.parse(await readFile(join(racine, c), 'utf8'));
  const [extraitBrut, mainBrut, scriptBrut, requetesBrut] = await Promise.all(
    [CHEMINS.extrait, CHEMINS.main, CHEMINS.script, CHEMINS.requetes].map(lire),
  );
  const extrait = JSON.parse(extraitBrut.toString('utf8'));
  const main = JSON.parse(mainBrut.toString('utf8'));
  const pays = (await lireJson('public/geo/pays.json')).filter((p) => p.statut === 'jouable' || p.statut === 'optionnel');
  const nomsPays = await lireJson('public/geo/noms.fr.json');
  const notes = [];
  const erreurs = [];
  const faute = (m) => erreurs.push(m);

  if (extrait.requetes_sha256 !== sha256(requetesBrut)) {
    faute(`${CHEMINS.requetes} a changé depuis l'extrait du ${extrait.extrait_le} : relancer npm run wikidata`);
  }
  const date = extrait.date; // date locale de l'extrait (La Réunion), celle des crédits
  const villes = extrait.villes;
  const ids = new Set(pays.map((p) => p.id));
  for (const [s, cles] of [
    ['items_pays', sansNotes(main.items_pays).map(([k]) => k)],
    ['pays', sansNotes(main.pays).map(([k]) => k)],
    ['doublons', sansNotes(main.doublons).map(([k]) => k)],
    ['meme_nom', sansNotes(main.meme_nom).map(([k]) => k)],
    ['sans_leurre', sansNotes(main.sans_leurre).map(([k]) => k)],
    ['epreuve', sansNotes(main.epreuve).map(([k]) => k)],
  ]) {
    for (const id of cles) if (!ids.has(id)) faute(`${CHEMINS.main}, ${s} : pays ${id} inconnu (ni jouable ni optionnel)`);
  }

  // Déclarations P36 en cours, par item de pays.
  const declParItem = new Map();
  for (const d of extrait.declarations) {
    if (!enCours(d, date)) continue;
    if (!declParItem.has(d.pays)) declParItem.set(d.pays, []);
    declParItem.get(d.pays).push(d);
  }

  const lignes = [];
  for (const p of pays) {
    const id = p.id;
    const m = main.pays[id] ?? {};
    const candidats = main.items_pays[id] ? [main.items_pays[id].q] : (extrait.items_par_code[id] ?? []);
    if (candidats.length !== 1) {
      faute(`${id} : ${candidats.length} items Wikidata (${candidats.join(', ') || 'aucun'}) ; en choisir un dans items_pays`);
      continue;
    }
    const item = candidats[0];
    const caps = new Map(); // Qid → rôle
    let doublon = false;
    for (const d of declParItem.get(item) ?? []) {
      if (caps.has(d.capitale)) doublon = true;
      caps.set(d.capitale, 'officielle');
    }
    if (doublon !== Boolean(main.doublons?.[id])) {
      faute(doublon ? `${id} : capitale déclarée deux fois dans Wikidata, absente de doublons` : `${id} : doublons ne s'applique plus`);
    }
    for (const q of m.retirer ?? []) {
      if (!caps.delete(q)) faute(`${id} : retirer ${q}, qui n'est pas une capitale en cours dans Wikidata`);
    }
    for (const [q, role] of Object.entries(m.roles ?? {})) {
      if (!caps.has(q)) faute(`${id} : rôle de ${q}, qui n'est pas une capitale en cours dans Wikidata`);
      else caps.set(q, role);
    }
    for (const [q, role] of Object.entries(m.ajouter ?? {})) {
      if (caps.has(q)) faute(`${id} : ajouter ${q}, déjà capitale en cours dans Wikidata`);
      else if (!villes[q]) faute(`${id} : ajouter ${q}, absent de l'extrait`);
      else caps.set(q, role);
    }
    for (const role of caps.values()) if (!ROLES.includes(role)) faute(`${id} : rôle inconnu ${role}`);
    if (caps.size === 0) {
      faute(`${id} : aucune capitale (item ${item})`);
      continue;
    }
    const principale = m.principale ?? (caps.size === 1 ? [...caps.keys()][0] : null);
    if (!principale || !caps.has(principale)) {
      faute(`${id} : ${caps.size} capitales (${[...caps.keys()].join(', ')}), principale ${principale ?? 'absente'} à choisir parmi elles`);
      continue;
    }
    if (caps.get(principale) !== 'officielle') faute(`${id} : la principale ${principale} n'est pas officielle`);
    const c = [...caps]
      .map(([q, role]) => ({ q, role, ...(q === principale ? { p: 1 } : {}) }))
      .sort((a, b) => (b.p ?? 0) - (a.p ?? 0) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || parQ(a.q, b.q));
    lignes.push({ id, item, jouable: p.statut === 'jouable', c });
  }

  // Noms, alias, points.
  const noms = {};
  const alias = {};
  const retenues = new Set(lignes.flatMap((l) => l.c.map((c) => c.q)));
  for (const q of retenues) {
    const v = villes[q];
    if (!v) {
      faute(`${q} : absente des villes de l'extrait`);
      continue;
    }
    const corrige = main.noms?.[q]?.nom;
    if (corrige && corrige === v.fr) notes.push(`noms : ${q} « ${corrige} » est déjà le libellé de Wikidata, ligne inutile`);
    noms[q] = corrige ?? v.fr;
    if (!noms[q]) faute(`${q} : aucun nom français (libellé de Wikidata absent ; ajouter une ligne à noms)`);
  }
  for (const [q, a] of sansNotes(main.alias)) {
    if (!retenues.has(q)) faute(`alias : ${q} n'est pas une capitale retenue`);
    else if (a.alias.some((x) => normaliser(x) === normaliser(noms[q] ?? ''))) faute(`alias : ${q}, un alias égal à son nom`);
    else alias[q] = [...a.alias].sort((x, y) => x.localeCompare(y, 'fr'));
  }
  for (const [q] of sansNotes(main.noms)) if (!retenues.has(q)) faute(`noms : ${q} n'est pas une capitale retenue`);
  for (const [q] of sansNotes(main.points)) if (!retenues.has(q)) faute(`points : ${q} n'est pas une capitale retenue`);
  for (const [q, n] of sansNotes(main.non_retenues)) if (retenues.has(q)) faute(`non_retenues : ${n.nom} (${q}) est pourtant retenue`);
  for (const l of lignes) {
    for (const c of l.c) {
      const pt = main.points?.[c.q];
      const v = villes[c.q];
      if (pt) Object.assign(c, { lon: pt.lon, lat: pt.lat });
      else if (v && v.lon !== null) Object.assign(c, { lon: arrondi(v.lon, 2), lat: arrondi(v.lat, 2) });
      else faute(`${l.id} : ${c.q} sans coordonnées`);
    }
  }
  const points = new Map();
  for (const l of lignes) {
    for (const c of l.c) {
      const k = `${c.lon},${c.lat}`;
      if (points.has(k) && points.get(k) !== c.q) faute(`${c.q} et ${points.get(k)} au même point (${k}) : ajouter un point à la table`);
      points.set(k, c.q);
    }
  }

  // D37 : capitales au nom du pays.
  for (const l of lignes) {
    const egal = l.c.some((c) => normaliser(noms[c.q] ?? '') === normaliser(nomsPays[l.id] ?? ''));
    l.m = Boolean(main.meme_nom?.[l.id]);
    if (egal && !l.m) faute(`${l.id} : capitale au nom du pays, absente de meme_nom`);
  }
  // Israël ↔ Palestine.
  for (const l of lignes) {
    const x = main.sans_leurre?.[l.id]?.x;
    if (x) {
      for (const y of x) if (!ids.has(y)) faute(`sans_leurre : ${l.id} → ${y} inconnu`);
      l.x = [...x].sort();
    }
  }

  // D38 d : la capitale d'épreuve, la plus connue (figée dans la table) ; la principale
  // quand le pays n'en a qu'une. Le rang de l'extrait est recalculé pour le dire s'il a changé.
  const mesures = Object.fromEntries(notoriete(lignes, villes));
  for (const l of lignes) {
    const e = main.epreuve?.[l.id];
    if (l.c.length === 1) {
      if (e) faute(`epreuve : ${l.id} n'a qu'une capitale`);
      l.c[0].e = 1;
      continue;
    }
    if (!e) {
      faute(`epreuve : ${l.id} a ${l.c.length} capitales, choisir celle de l'épreuve (D38 d)`);
      continue;
    }
    const c = l.c.find((x) => x.q === e.q);
    if (!c) {
      faute(`epreuve : ${l.id} → ${e.q}, qui n'est pas une de ses capitales`);
      continue;
    }
    c.e = 1;
    for (const x of l.c) {
      if (JSON.stringify(e.mesures?.[x.q]) !== JSON.stringify(mesures[x.q])) {
        notes.push(`epreuve : ${l.id}, les mesures de ${x.q} dans la table ne sont pas celles de l'extrait du ${date} (table d'un autre extrait ?)`);
      }
    }
    if (l.id !== 'PSE' && l.c.every((x) => mesures[x.q])) {
      const q = plusConnue(l.c, mesures);
      if (q !== e.q) notes.push(`epreuve : ${l.id}, l'extrait du ${date} donne ${noms[q]} (${q}) plus connue que ${noms[e.q]} ; la table reste (D38 : fixe pour tous)`);
    }
  }
  if (erreurs.length) throw new Error(`capitales :\n  ${erreurs.join('\n  ')}`);

  // Sorties.
  const ligne = (l) => {
    const o = { pays: l.id, c: l.c.map(({ q, lon, lat, role, p, e }) => ({ q, lon, lat, role, ...(p ? { p } : {}), ...(e ? { e } : {}) })) };
    if (l.m) o.m = 1;
    if (l.x) o.x = l.x;
    return JSON.stringify(o);
  };
  const tri = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => parQ(a, b)));
  const objet = (o) => `{\n${Object.entries(tri(o)).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}`;
  const fichiers = {
    'capitales.json': `[\n${lignes.map(ligne).join(',\n')}\n]\n`,
    'capitales.fr.json': `{\n"noms":${objet(noms)},\n"alias":${objet(alias)}\n}\n`,
  };
  const source = {
    nom: 'Wikidata, capitales des pays (P36), sièges du gouvernement et notoriété des capitales (nombre de Wikipédias, vues de la Wikipédia en français)',
    url: URL_WIKIDATA,
    version: `extrait du ${extrait.extrait_le} (SPARQL), API du ${extrait.api_le}, vues du ${extrait.vues.du} au ${extrait.vues.au}`,
    licence: 'CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), aucune mention obligatoire : citée par courtoisie',
    telecharge_le: extrait.date,
    requetes: { chemin: CHEMINS.requetes, sha256: sha256(requetesBrut) },
    fichiers: [{ chemin: CHEMINS.extrait, sha256: sha256(extraitBrut) }],
  };
  const entrees = { [CHEMINS.script]: sha256(scriptBrut), [CHEMINS.main]: sha256(mainBrut) };
  const n = lignes.reduce((s, l) => s + l.c.length, 0);
  notes.unshift(`${lignes.length} pays, ${n} capitales, ${lignes.filter((l) => l.c.length > 1).length} pays à plusieurs réponses (extrait du ${extrait.extrait_le})`);
  return { fichiers, source, entrees, notes };
}

/**
 * public/geo/sources.json avec la source Wikidata et les empreintes des entrées des
 * capitales : remplacées si elles y sont, ajoutées à la fin sinon. Le même chemin pour
 * tout le build et pour --seulement capitales : les deux donnent le même fichier.
 */
export function fusionnerSources(sources, capitales) {
  const autres = sources.sources.filter((s) => s.url !== URL_WIKIDATA);
  const entrees = Object.fromEntries(Object.entries(sources.traitement.entrees).filter(([k]) => !(k in capitales.entrees)));
  return {
    sources: [...autres, capitales.source],
    traitement: { ...sources.traitement, entrees: { ...entrees, ...capitales.entrees } },
  };
}
