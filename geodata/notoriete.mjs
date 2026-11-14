// Notoriété des lieux du quiz général (étude J2, § 2.4 et § 9.2 ; D48 b), appelée par
// geodata/build.mjs (tout le build, ou --seulement notoriete) ; sans réseau, sans effet
// à l'import. Lit :
//   geodata/wikidata/notoriete.json  vues de la Wikipédia en français sur 12 mois des
//                      articles des pays (npm run wikidata -- --notoriete)
//   geodata/wikidata/capitales.json  nombre de Wikipédias des pays (même item) et, pour
//                      les capitales, Wikipédias et vues sur 12 mois (npm run wikidata)
//   geodata/wikidata/mers-entites.json, mers-vues.json, mers-vues-complement.json
//                      Wikipédias et vues sur 12 mois des océans et mers (relevé du 10/11)
//   geodata/mers.json  les 50 zones jouées et leur item Wikidata
//   geodata/notoriete-main.json  table de relecture à la main (niveau corrigé, raison ;
//                      titres : l'article dont on compte les vues, quand ce n'est pas
//                      celui de l'item du pays : le Danemark, les Pays-Bas)
//   public/geo/pays.json, capitales.json  les pays jouables et leurs capitales justes
//                      (sorties du build)
// Produit (identique octet pour octet d'un lancement à l'autre) :
//   notoriete.json     {v: 1, pays: {id: niveau}, capitales: {Qid: niveau},
//                      drapeaux: {id: niveau}, mers: {id: niveau}}, un niveau de 1 (très
//                      connu : le quiz facile) à 3, chargé avec le quiz seul.
// Méthode (D48 b) : un rang combiné, la moyenne du rang par nombre de Wikipédias (sites
// *wiki, hors Commons, Wikispecies, Meta et Wikidata : wikidata.mjs) et du rang par vues
// de la Wikipédia en français sur 12 mois, coupé par effectifs (EFFECTIFS) ; puis la
// table à la main. Les capitales sont rangées entre elles, sans celles dont l'item est
// celui du pays (Monaco, Singapour, Cité du Vatican : son nombre de Wikipédias et ses
// vues sont ceux du pays) : elles prennent le niveau du pays. Un pays non jouable
// (Kosovo, Taïwan) n'a pas de niveau, ni ses capitales. Les drapeaux prennent le niveau
// de leur pays (pas de meilleure mesure, § 2.4).
// Échoue (exception) si les extraits et la table ne s'accordent plus : un lieu sans
// mesure, une ligne de la table qui vise un lieu inconnu ou qui ne change plus rien.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './outils.mjs';

export const CHEMINS = {
  script: 'geodata/notoriete.mjs',
  main: 'geodata/notoriete-main.json',
  vuesPays: 'geodata/wikidata/notoriete.json',
  capitales: 'geodata/wikidata/capitales.json',
  mersEntites: 'geodata/wikidata/mers-entites.json',
  mersVues: 'geodata/wikidata/mers-vues.json',
  mersVuesComplement: 'geodata/wikidata/mers-vues-complement.json',
  mers: 'geodata/mers.json',
};

/** Effectifs des niveaux 1 et 2 (D48 b) ; le reste est au niveau 3. */
export const EFFECTIFS = { pays: [40, 60], capitales: [30, 60], mers: [12, 11] };

const SECTIONS = ['pays', 'capitales', 'mers'];
const numero = (q) => Number(q.slice(1));
const parId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const parQ = (a, b) => numero(a) - numero(b);
const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));

/** Rang (1 = la plus grande valeur) de chaque clé, ex aequo au même rang ; une valeur absente compte 0. */
export function rangs(valeurs) {
  const v = [...valeurs.values()].map((x) => x ?? 0);
  return new Map([...valeurs].map(([k, x]) => [k, 1 + v.filter((y) => y > (x ?? 0)).length]));
}

/**
 * Le rang combiné (D48 b) : mesures, Map id → {wikipedias, vues} ; rend les ids du plus
 * connu au moins connu, avec leur rang combiné (moyenne des deux rangs) ; à égalité, le
 * plus de Wikipédias, puis l'id (ordre stable).
 */
export function classer(mesures, ordreIds = parId) {
  const rw = rangs(new Map([...mesures].map(([k, m]) => [k, m.wikipedias])));
  const rv = rangs(new Map([...mesures].map(([k, m]) => [k, m.vues])));
  return [...mesures.keys()]
    .map((id) => ({ id, rang: (rw.get(id) + rv.get(id)) / 2, ...mesures.get(id) }))
    .sort((a, b) => a.rang - b.rang || (b.wikipedias ?? 0) - (a.wikipedias ?? 0) || ordreIds(a.id, b.id));
}

/** Les niveaux d'un classement coupé par effectifs : les n1 premiers au niveau 1, les n2 suivants au 2, le reste au 3. */
export function couper(classes, [n1, n2]) {
  return new Map(classes.map((c, i) => [c.id, i < n1 ? 1 : i < n1 + n2 ? 2 : 3]));
}

/**
 * Les niveaux à partir des données lues (sans fichier : les tests s'en servent aussi).
 * d : {pays (pays.json), capitales (capitales.json servi), vuesPays, extrait (capitales),
 * mersEntites, mersVues, mersComplement, mers (table), main}. Rend { niveaux: {pays,
 * capitales, drapeaux, mers} (Map), classes (avant la table), fautes, notes }.
 */
export function calculer(d) {
  const fautes = [];
  const notes = [];
  const jouables = d.pays.filter((p) => p.statut === 'jouable').map((p) => p.id);
  const ensJouables = new Set(jouables);

  // Les titres corrigés à la main : l'extrait des vues doit les avoir suivis (sinon : npm run wikidata -- --notoriete).
  for (const [id, t] of sansNotes(d.main.titres)) {
    if (!t.raison) fautes.push(`${CHEMINS.main}, titres : ${id} sans raison`);
    if (d.vuesPays.pays[id]?.frwiki !== t.frwiki) fautes.push(`${CHEMINS.vuesPays} : ${id} a les vues de « ${d.vuesPays.pays[id]?.frwiki} », la table dit « ${t.frwiki} » (relancer npm run wikidata -- --notoriete)`);
  }

  // Pays : Wikipédias de l'extrait des capitales (même item), vues de l'extrait de la notoriété.
  const itemPays = new Map();
  const mesuresPays = new Map();
  for (const id of jouables) {
    const v = d.vuesPays.pays[id];
    const w = v && d.extrait.pays[v.q];
    if (!v || !w || typeof w.wikipedias !== 'number' || typeof v.vues_fr !== 'number') {
      fautes.push(`pays ${id} : sans item, sans Wikipédias ou sans vues`);
      continue;
    }
    itemPays.set(id, v.q);
    mesuresPays.set(id, { wikipedias: w.wikipedias, vues: v.vues_fr });
  }

  // Capitales : celles des pays jouables, rangées entre elles sauf celles dont l'item est celui du pays.
  const mesuresCaps = new Map();
  const commeLePays = new Map(); // Qid → pays
  for (const l of d.capitales) {
    if (!ensJouables.has(l.pays)) continue;
    for (const c of l.c) {
      if (c.q === itemPays.get(l.pays)) {
        commeLePays.set(c.q, l.pays);
        continue;
      }
      const v = d.extrait.villes[c.q];
      if (!v || typeof v.wikipedias !== 'number') {
        fautes.push(`capitale ${c.q} (${l.pays}) : sans mesure dans l'extrait`);
        continue;
      }
      mesuresCaps.set(c.q, { wikipedias: v.wikipedias, vues: v.vues_fr ?? 0 });
    }
  }

  // Mers : les 50 zones de la table, Wikipédias et vues du relevé.
  const mesuresMers = new Map();
  for (const z of d.mers.zones) {
    const e = d.mersEntites[z.q];
    const v = d.mersVues[z.q] ?? d.mersComplement[z.q];
    if (!e || typeof e.wikipedias !== 'number' || !v) {
      fautes.push(`mer ${z.id} (${z.q}) : sans Wikipédias ou sans vues`);
      continue;
    }
    mesuresMers.set(z.id, { wikipedias: e.wikipedias, vues: v.vues_12_mois });
  }

  const classes = {
    pays: classer(mesuresPays),
    capitales: classer(mesuresCaps, parQ),
    mers: classer(mesuresMers),
  };
  const niveaux = {
    pays: couper(classes.pays, EFFECTIFS.pays),
    capitales: couper(classes.capitales, EFFECTIFS.capitales),
    mers: couper(classes.mers, EFFECTIFS.mers),
  };

  // La table à la main : chaque ligne vise un lieu classé et change son niveau.
  for (const s of SECTIONS) {
    for (const [id, ligne] of sansNotes(d.main[s])) {
      const avant = niveaux[s].get(id);
      if (avant === undefined) fautes.push(`${CHEMINS.main}, ${s} : ${id} n'est pas classé`);
      else if (![1, 2, 3].includes(ligne.niveau)) fautes.push(`${CHEMINS.main}, ${s} : ${id}, niveau ${ligne.niveau} (attendu 1, 2 ou 3)`);
      else if (!ligne.raison) fautes.push(`${CHEMINS.main}, ${s} : ${id} sans raison`);
      else if (ligne.niveau === avant) fautes.push(`${CHEMINS.main}, ${s} : ${id} est déjà au niveau ${avant} (ligne à retirer)`);
      else niveaux[s].set(id, ligne.niveau);
    }
  }

  // Les capitales qui sont le pays (Monaco…) : le niveau du pays, après sa correction.
  for (const [q, p] of commeLePays) niveaux.capitales.set(q, niveaux.pays.get(p));
  niveaux.drapeaux = new Map(niveaux.pays);

  for (const s of SECTIONS) {
    const n = [1, 2, 3].map((k) => [...niveaux[s].values()].filter((x) => x === k).length);
    notes.push(`${s} : ${n.join(' / ')} aux niveaux 1, 2, 3`);
  }
  return { niveaux, classes, fautes, notes };
}

/** Le fichier servi : une entrée par ligne, les sections dans l'ordre, les ids triés. */
export function texte(niveaux) {
  const section = (nom, m, tri) => {
    const lignes = [...m].sort(([a], [b]) => tri(a, b)).map(([k, v]) => `${JSON.stringify(k)}:${v}`);
    return `${JSON.stringify(nom)}:{\n${lignes.join(',\n')}\n}`;
  };
  return (
    `{"v":1,\n${section('pays', niveaux.pays, parId)},\n${section('capitales', niveaux.capitales, parQ)},\n` +
    `${section('drapeaux', niveaux.drapeaux, parId)},\n${section('mers', niveaux.mers, parId)}\n}\n`
  );
}

/**
 * Construit le fichier servi. racine : la racine du dépôt. Rend { fichiers: {nom: texte},
 * sources: [], entrees, notes } : entrees va dans public/geo/sources.json
 * (fusionnerPartie d'outils.mjs ; la source Wikidata est celle des capitales, même
 * extrait), notes s'affichent au build.
 */
export async function construireNotoriete(racine) {
  const lire = (c) => readFile(join(racine, c));
  const json = async (c) => JSON.parse((await lire(c)).toString('utf8'));
  const bruts = Object.fromEntries(await Promise.all(Object.entries(CHEMINS).map(async ([k, c]) => [k, await lire(c)])));
  const lu = (k) => JSON.parse(bruts[k].toString('utf8'));
  const r = calculer({
    pays: await json('public/geo/pays.json'),
    capitales: await json('public/geo/capitales.json'),
    vuesPays: lu('vuesPays'),
    extrait: lu('capitales'),
    mersEntites: lu('mersEntites'),
    mersVues: lu('mersVues'),
    mersComplement: lu('mersVuesComplement'),
    mers: lu('mers'),
    main: lu('main'),
  });
  if (r.fautes.length) throw new Error(`notoriété :\n  ${r.fautes.join('\n  ')}`);
  const vp = lu('vuesPays');
  const entrees = {
    [CHEMINS.script]: sha256(bruts.script),
    [CHEMINS.main]: sha256(bruts.main),
    [CHEMINS.vuesPays]: sha256(bruts.vuesPays),
  };
  return {
    fichiers: { 'notoriete.json': texte(r.niveaux) },
    sources: [],
    entrees,
    notes: [`vues des pays du ${vp.vues.du} au ${vp.vues.au} (extrait du ${vp.extrait_le})`, ...r.notes],
  };
}
