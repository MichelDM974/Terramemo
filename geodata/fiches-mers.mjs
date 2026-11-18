// Fiches des 50 océans et mers (#34, lot F4, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 2.3, § 2.6 et § 2.7), appelé par geodata/fiches.mjs ; sans réseau, sans effet à l'import.
// Les règles :
//   - superficie : Wikidata (P2046 ; le rang préféré, sinon la valeur la plus proche du tracé) ;
//     si elle s'écarte de plus de 25 % du tracé de Natural Earth (sous-mers comprises), une
//     ligne de la table à la main (superficie_mers) la remplace, avec sa source ; sans valeur,
//     le tracé ; les océans, toujours à la main, d'après une source nommée. Arrondie à trois
//     chiffres significatifs ;
//   - profondeur maximale : Wikidata (P4511) : la valeur qualifiée « maximum », sinon la seule
//     valeur sans qualificatif ; plusieurs valeurs sans qualificatif, ou aucune : une ligne de
//     la table (profondeur_mers), qui peut aussi remplacer une valeur fausse (le golfe d'Oman) ou
//     la garder avec un doute (verifier) ;
//   - pays riverains (pas pour un océan) : l'union du tracé (un pays dont le trait de côte passe à
//     TOLERANCE_DEG de la zone, en POINTS_MIN points au moins, échantillonnés tous les PAS_DEG ;
//     repris de R4, mers-geo.mjs) et de Wikidata (P17, P205), sous-mers comprises ; les États
//     disparus (P576) retirés ; d'office, un souverain que seul Wikidata donne, quand un de ses
//     territoires est riverain par le tracé (le Royaume-Uni par Gibraltar) ; puis la table
//     (riverains_mers : retraits et ajouts, chacun avec sa raison ; une ligne d'une mer vaut
//     aussi pour les mers qui la contiennent, sauf un retrait d'un riverain qu'une autre partie de la mère donne) ; riverains_items : un item cité par Wikidata qui
//     n'est pas celui d'une entité de la carte.
// Échoue (fautes) si la table et les données ne s'accordent plus : une ligne qui ne s'applique
// plus, une mer à plus de 25 % sans ligne, un item cité inconnu.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { dansLaFiche } from './fiches-relecture.mjs';
import { idNe } from './fiches-territoires.mjs';
import { sha256 } from './outils.mjs';

export const CHEMIN_RELECTURE_MERS = 'docs/relectures/fiches-mers.md';
export const EXTRAIT_MERS = 'geodata/wikidata/fiches-mers.json';
export const REQUETES_MERS = 'geodata/wikidata/requetes-fiches-mers.rq';

/** Le tracé : un pays est riverain si sa côte passe à 0,12° (≈ 13 km) de la zone, en 2 points au moins (≈ 10 km), tous les 0,05°. */
export const TOLERANCE_DEG = 0.12;
export const PAS_DEG = 0.05;
export const POINTS_MIN = 2;
/** Écart au tracé au-delà duquel la superficie de Wikidata demande une ligne de la table. */
export const ECART_SUPERFICIE = 0.25;

const KM2 = 'Q712226';
const MI2 = 'Q232291';
const MI2_EN_KM2 = 2.589988110336;
const METRE = 'Q11573';
const MAXIMUM = 'Q10578722';
/** Les qualificatifs de « moyenne » (P1013) : Q202785 (moyenne), Q2796622 (moyenne arithmétique). */
const MOYENNES = new Set(['Q202785', 'Q2796622']);

const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
const parId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Arrondi à trois chiffres significatifs (comme troisChiffres de src/fiches/format.ts). */
export function troisChiffres(n) {
  if (n === 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 2);
  return p >= 1 ? Math.round(n / p) * p : Math.round(n);
}

// --- Le tracé ----------------------------------------------------------------------------

const NE = 'geodata/raw/natural-earth';
const PAYS_NE = 'ne_10m_admin_0_countries';
const MERS_NE = 'ne_10m_geography_marine_polys';

/**
 * Les deux couches de Natural Earth (pays, zones marines) en GeoJSON, lues dans geodata/raw/ et
 * vérifiées contre le verrou (geodata/sources.lock.json, entrée natural-earth).
 */
export async function lireCouchesNe(racine) {
  const verrou = JSON.parse(await readFile(join(racine, 'geodata', 'sources.lock.json'), 'utf8'))['natural-earth'];
  const couche = async (nom) => {
    const entree = {};
    for (const ext of ['shp', 'shx', 'dbf', 'prj', 'cpg']) {
      const b = await readFile(join(racine, NE, `${nom}.${ext}`));
      const attendu = verrou?.fichiers?.[`natural-earth/${nom}.${ext}`];
      if (sha256(b) !== attendu) throw new Error(`fiches des mers : ${nom}.${ext}, empreinte ${sha256(b)} ≠ verrou ${attendu ?? '(absente)'}`);
      entree[`${nom}.${ext}`] = b;
    }
    const lu = await mapshaper.applyCommands(`-i ${nom}.shp encoding=utf8 -o c.json format=geojson`, entree);
    return JSON.parse(String(lu['c.json']));
  };
  return { pays: await couche(PAYS_NE), marine: await couche(MERS_NE) };
}

function* anneaux(g) {
  if (!g) return;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const p of polys) for (const r of p) yield r;
}

/** Les points d'un anneau, un tous les PAS_DEG au plus (le dernier sommet, qui répète le premier, exclu). */
function* points(r) {
  for (let i = 0; i < r.length - 1; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[i + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / PAS_DEG));
    for (let k = 0; k < n; k++) yield [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n];
  }
}

/**
 * Les riverains par le tracé de chaque zone retenue (sans ses sous-mers) : {mer: {entité: points}}
 * (les points de la côte de l'entité à TOLERANCE_DEG de la zone ; seuls ceux à POINTS_MIN ou plus
 * comptent ensuite). marine, pays : les couches de Natural Earth (GeoJSON) ; affectations :
 * geodata/mers-affectations.json (la zone retenue de chaque zone de Natural Earth). L'id d'une
 * entité est celui de pays.json (idNe, comme geodata/build.mjs).
 */
export function riverainsTrace(marine, pays, affectations) {
  const merDe = new Map(affectations.filter((a) => a.id).map((a) => [a.ne_id, a.id]));
  const mers = [...new Set(merDe.values())].sort(parId);
  const rang = new Map(mers.map((m, i) => [m, i]));
  const T = TOLERANCE_DEG;
  const cle = (cx, cy) => `${cx},${cy}`;
  /** Les points des bords des zones, par case de T degrés : [x, y, rang de la mer]. */
  const grille = new Map();
  for (const f of marine.features) {
    const id = merDe.get(f.properties.ne_id);
    if (!id) continue;
    const r = rang.get(id);
    for (const a of anneaux(f.geometry)) {
      for (const [x, y] of points(a)) {
        const k = cle(Math.floor(x / T), Math.floor(y / T));
        let l = grille.get(k);
        if (!l) grille.set(k, (l = []));
        l.push(x, y, r);
      }
    }
  }
  const res = Object.fromEntries(mers.map((m) => [m, {}]));
  for (const f of pays.features) {
    const id = idNe(f.properties);
    const compte = new Array(mers.length).fill(0);
    const vus = new Set();
    for (const a of anneaux(f.geometry)) {
      for (const [x, y] of points(a)) {
        const cx = Math.floor(x / T);
        const cy = Math.floor(y / T);
        const c = Math.cos((y * Math.PI) / 180);
        vus.clear();
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const l = grille.get(cle(cx + dx, cy + dy));
            if (!l) continue;
            for (let i = 0; i < l.length; i += 3) {
              if (vus.has(l[i + 2])) continue;
              if (((l[i] - x) * c) ** 2 + (l[i + 1] - y) ** 2 <= T * T) vus.add(l[i + 2]);
            }
          }
        }
        for (const r of vus) compte[r]++;
      }
    }
    compte.forEach((n, r) => {
      if (n) res[mers[r]][id] = n;
    });
  }
  for (const m of mers) res[m] = Object.fromEntries(Object.entries(res[m]).sort(([a], [b]) => parId(a, b)));
  return res;
}

// --- Les règles ----------------------------------------------------------------------------

/** Une superficie de Wikidata en km² (km², mi²) ; null pour une autre unité. */
const enKm2 = (d) => (d.unite === KM2 ? d.v : d.unite === MI2 ? d.v * MI2_EN_KM2 : null);

/**
 * La superficie de Wikidata d'une mer : la déclaration de rang préféré, sinon la seule, sinon la
 * plus proche du tracé. Rend {v (km², non arrondie) | null, comment, valeurs: [km²]}.
 */
export function superficieWikidata(decls, trace) {
  const valeurs = (decls ?? []).map((d) => ({ v: enKm2(d), rang: d.rang })).filter((d) => d.v != null);
  if (!valeurs.length) return { v: null, comment: 'aucune', valeurs: [] };
  const pref = valeurs.filter((d) => d.rang === 'preferred');
  const distinctes = [...new Set(valeurs.map((d) => d.v))];
  if (pref.length === 1) return { v: pref[0].v, comment: distinctes.length > 1 ? 'préférée' : 'seule', valeurs: distinctes };
  if (distinctes.length === 1) return { v: distinctes[0], comment: 'seule', valeurs: distinctes };
  const v = distinctes.reduce((a, b) => (Math.abs(b - trace) < Math.abs(a - trace) ? b : a));
  return { v, comment: 'la plus proche du tracé', valeurs: distinctes };
}

/**
 * La profondeur maximale de Wikidata : la valeur qualifiée « maximum » (P1013) ; sinon, sans les
 * moyennes, la seule valeur. Rend {v | null, comment : 'maximum' | 'seule' | 'ambiguë' | 'aucune',
 * valeurs: [{v, critere}]} (en mètres).
 */
export function profondeurWikidata(decls) {
  const valeurs = (decls ?? []).filter((d) => d.unite === METRE).map((d) => ({ v: d.v, critere: d.q?.P1013?.[0] ?? null, rang: d.rang }));
  const max = [...new Set(valeurs.filter((d) => d.critere === MAXIMUM).map((d) => d.v))];
  if (max.length === 1) return { v: max[0], comment: 'maximum', valeurs };
  if (max.length > 1) return { v: null, comment: 'ambiguë', valeurs };
  const libres = [...new Set(valeurs.filter((d) => !d.critere).map((d) => d.v))];
  if (libres.length === 1) return { v: libres[0], comment: 'seule', valeurs };
  return { v: null, comment: libres.length ? 'ambiguë' : 'aucune', valeurs };
}

/** Les sous-mers d'une zone (ses filles d'un seul parent, et les leurs), comme les a vues R4 (sens.mjs). */
export function sousMers(id, zones) {
  const res = [];
  for (const z of zones) if (z.sorte !== 'océan' && z.parents.length === 1 && z.parents[0] === id) res.push(z.id, ...sousMers(z.id, zones));
  return res;
}

/** Les sources d'une ligne écrite à la main : Wikipédia, ou l'étude de la NOAA (Eakins et Sharman, 2010). */
export const SOURCES_LIGNE = ['wp', 'noaa'];

/**
 * Les fiches des 50 zones. zones : public/geo/mers.json ; titres : id → titre de la Wikipédia en
 * français (mers-entites.json) ; wd : geodata/wikidata/fiches-mers.json ; itemsCarte : QID →
 * id d'entité (les pays et les autres lieux de geodata/wikidata/fiches.json) ; entites :
 * pays.json ; trace : riverainsTrace(), ou null (geodata/raw/ absent : les riverains ne sont
 * pas refaits, rien n'est rendu) ; main : fiches-main.json. Rend {lieux, textes, relecture,
 * fautes}.
 */
export function chiffresMers({ zones, titres, wd, itemsCarte, entites, trace, main }) {
  const fautes = [];
  const faute = (m) => fautes.push(m);
  const ids = new Set(entites.map((e) => e.id));
  const souverainDe = new Map(sansNotes(main.souverain).map(([id, l]) => [id, l.pays]));
  const supMain = Object.fromEntries(sansNotes(main.superficie_mers));
  const profMain = Object.fromEntries(sansNotes(main.profondeur_mers));
  const rivMain = Object.fromEntries(sansNotes(main.riverains_mers));
  const itemsMain = Object.fromEntries(sansNotes(main.riverains_items));
  const parZone = new Map(zones.map((z) => [z.id, z]));
  const estOcean = (id) => parZone.get(id)?.sorte === 'océan';
  for (const [cle, t] of [['superficie_mers', supMain], ['profondeur_mers', profMain], ['riverains_mers', rivMain]]) {
    for (const [id, l] of Object.entries(t)) {
      if (!parZone.has(id)) faute(`${cle} : ${id} n'est pas une des 50 zones`);
      if (cle !== 'riverains_mers' && !l.raison) faute(`${cle} : ${id} sans raison`);
    }
  }
  const lieux = {};
  const textes = {};
  const R = { superficies: [], profondeurs: [], riverains: [], items: [] };

  // Les items cités par Wikidata : une entité de la carte, un État disparu, ou une ligne de riverains_items.
  const itemVers = new Map();
  for (const [q, e] of Object.entries(wd.etats)) {
    const l = itemsMain[q];
    if (e.fin.length) {
      if (l) faute(`riverains_items : ${q} (${e.fr}) est un État disparu (P576), retiré d'office : ligne inutile`);
      itemVers.set(q, null);
      R.items.push({ q, nom: e.fr, comment: `État disparu (${e.fin.map((d) => d.slice(0, 4)).join(', ')})`, id: null });
    } else if (itemsCarte.has(q)) {
      if (l) faute(`riverains_items : ${q} (${e.fr}) est déjà l'item de ${itemsCarte.get(q)} : ligne inutile`);
      itemVers.set(q, itemsCarte.get(q));
    } else if (l) {
      if (!l.raison) faute(`riverains_items : ${q} sans raison`);
      if (l.id != null && !ids.has(l.id)) faute(`riverains_items : ${q} → ${l.id}, entité inconnue`);
      itemVers.set(q, l.id ?? null);
      R.items.push({ q, nom: e.fr, comment: l.id ? `rapporté à ${l.id}` : 'ignoré', id: l.id ?? null, raison: l.raison, a_relire: l.a_relire });
    } else faute(`${q} (${e.fr}), cité par Wikidata comme pays d'une mer, n'est l'item d'aucune entité de la carte : une ligne de riverains_items (fiches-main.json)`);
  }
  for (const q of Object.keys(itemsMain)) if (!wd.etats[q]) faute(`riverains_items : ${q} n'est plus cité par l'extrait des mers`);

  // Riverains, par zone (sans ses sous-mers) : le tracé (POINTS_MIN points ou plus) et Wikidata.
  const traceDe = (id) => new Set(Object.entries(trace?.[id] ?? {}).filter(([, n]) => n >= POINTS_MIN).map(([e]) => e));
  const wdDe = (id) => {
    const res = { ids: new Set(), disparus: new Set() };
    for (const d of wd.lieux[wd.mers[id]]?.pays ?? []) {
      const v = itemVers.get(d.v);
      if (v) res.ids.add(v);
      else if (wd.etats[d.v]?.fin.length) res.disparus.add(wd.etats[d.v].fr);
    }
    return res;
  };
  const retenus = new Map();
  for (const z of zones) {
    if (z.sorte === 'océan') continue;
    const groupe = [z.id, ...sousMers(z.id, zones)];
    const T = new Set(groupe.flatMap((g) => [...traceDe(g)]));
    const W = new Set();
    const disparus = new Set();
    for (const g of groupe) {
      const w = wdDe(g);
      for (const x of w.ids) W.add(x);
      for (const x of w.disparus) disparus.add(x);
    }
    const union = new Set([...T, ...W]);
    // D'office : un souverain que seul Wikidata donne, quand un de ses territoires est riverain par le tracé.
    const office = [...W].filter((x) => !T.has(x) && [...T].some((t) => souverainDe.get(t) === x)).sort(parId);
    for (const x of office) union.delete(x);
    const base = new Set(union);
    // Ce que chaque partie du groupe donne d'elle-même (tracé, Wikidata, ses ajouts) : une ligne « retire » d'une
    // sous-mer ne retire pas de la mère un riverain qu'une autre partie donne (la Grèce retirée de l'Adriatique
    // resterait riveraine de la Méditerranée par la mer Égée).
    const apport = new Map(
      groupe.map((g) => [g, new Set([...traceDe(g), ...wdDe(g).ids, ...Object.entries(rivMain[g] ?? {}).filter(([e, l]) => !e.startsWith('_') && l.ajoute).map(([e]) => e)])]),
    );
    const lignes = [];
    for (const g of groupe) {
      const dessous = new Set([g, ...sousMers(g, zones)]);
      for (const [e, l] of Object.entries(rivMain[g] ?? {})) {
        if (e.startsWith('_')) continue;
        const sens = l.retire ? 'retire' : l.ajoute ? 'ajoute' : null;
        if (!sens) faute(`riverains_mers : ${g} ${e}, ni retire ni ajoute (la raison)`);
        if (!ids.has(e)) faute(`riverains_mers : ${g} ${e}, entité inconnue`);
        if (g === z.id) {
          if (sens === 'retire' && !base.has(e)) faute(`riverains_mers : ${g} ${e} à retirer, mais ni le tracé ni Wikidata ne le donnent : ligne inutile`);
          if (sens === 'ajoute' && base.has(e)) faute(`riverains_mers : ${g} ${e} à ajouter, mais il est déjà riverain : ligne inutile`);
        }
        const ailleurs = sens === 'retire' && g !== z.id ? groupe.filter((h) => !dessous.has(h) && apport.get(h).has(e)) : [];
        if (sens === 'retire' && !ailleurs.length) union.delete(e);
        if (sens === 'ajoute') union.add(e);
        lignes.push({ mer: g, id: e, sens, raison: l[sens], a_relire: l.a_relire, ...(ailleurs.length ? { garde: ailleurs } : {}) });
      }
    }
    const r = [...union].sort(parId);
    retenus.set(z.id, r);
    R.riverains.push({
      id: z.id,
      retenus: r,
      trace: [...T].sort(parId),
      wikidata: [...W].sort(parId),
      traceSeul: [...T].filter((x) => !W.has(x)).sort(parId),
      wikidataSeul: [...W].filter((x) => !T.has(x)).sort(parId),
      disparus: [...disparus].sort(),
      office,
      lignes,
      sous: groupe.slice(1),
    });
  }
  for (const id of Object.keys(rivMain)) if (estOcean(id)) faute(`riverains_mers : ${id} est un océan, sans liste`);

  for (const z of zones) {
    const q = wd.mers[z.id];
    const decl = wd.lieux[q] ?? {};
    const o = { s: 'mer' };
    // Superficie.
    const traceKm2 = [z.id, ...sousMers(z.id, zones)].reduce((s, g) => s + parZone.get(g).superficie_km2, 0);
    const sw = superficieWikidata(decl.superficies, traceKm2);
    const ligne = supMain[z.id];
    const ecart = sw.v != null ? (sw.v - traceKm2) / traceKm2 : null;
    const hors = z.sorte === 'océan' || (ecart != null && Math.abs(ecart) > ECART_SUPERFICIE);
    let sup;
    let source;
    if (ligne) {
      if (!hors) faute(`superficie_mers : ${z.id}, Wikidata (${Math.round(sw.v ?? 0)} km²) est à moins de 25 % du tracé (${traceKm2}) ou absente : ligne inutile`);
      if (!SOURCES_LIGNE.includes(ligne.source)) faute(`superficie_mers : ${z.id}, source ${ligne.source} inconnue (${SOURCES_LIGNE.join(', ')})`);
      if (!(ligne.km2 > 0)) faute(`superficie_mers : ${z.id}, km2 absent`);
      sup = ligne.km2;
      source = ligne.source;
    } else if (hors) {
      faute(`superficie_mers : ${z.id}, ${z.sorte === 'océan' ? 'un océan, toujours à la main' : `Wikidata (${Math.round(sw.v)} km²) à ${Math.round(ecart * 100)} % du tracé (${traceKm2} km²)`} : une ligne, avec sa source`);
    } else if (sw.v != null) {
      sup = sw.v;
    } else {
      sup = traceKm2;
      source = 'ne';
    }
    if (sup != null) {
      o.sup = troisChiffres(sup);
      if (source) o.ss = source;
    }
    R.superficies.push({ id: z.id, retenue: o.sup ?? null, source: source ?? 'wd', wikidata: sw, trace: traceKm2, ecart, ligne });
    // Profondeur.
    const pw = profondeurWikidata(decl.profondeurs);
    const lp = profMain[z.id];
    let p = pw.v;
    let ps;
    if (lp) {
      if (lp.verifier) {
        if (pw.v == null) faute(`profondeur_mers : ${z.id}, « verifier » sans valeur de Wikidata`);
      } else if (lp.aucun) {
        if (pw.v != null) faute(`profondeur_mers : ${z.id}, « aucun » alors que Wikidata a une valeur (${pw.v})`);
        p = null;
      } else {
        if (pw.v === lp.m) faute(`profondeur_mers : ${z.id}, ${lp.m} est déjà la valeur de Wikidata : ligne inutile, ou « verifier »`);
        if (!(lp.m > 0)) faute(`profondeur_mers : ${z.id}, m absent`);
        if (!SOURCES_LIGNE.includes(lp.source)) faute(`profondeur_mers : ${z.id}, source ${lp.source} inconnue`);
        p = lp.m;
        ps = lp.source;
      }
    } else if (pw.v == null) faute(`profondeur_mers : ${z.id}, Wikidata ${pw.comment} (${pw.valeurs.map((x) => x.v).join(', ') || 'rien'}) : une ligne`);
    if (p != null) {
      o.p = p;
      if (ps) o.ps = ps;
    }
    R.profondeurs.push({ id: z.id, retenue: p ?? null, source: ps ?? (p != null ? 'wd' : null), wikidata: pw, ligne: lp });
    // Riverains (pas pour un océan ; aucun pour la mer des Sargasses).
    const r = retenus.get(z.id);
    if (r?.length) o.r = r;
    lieux[z.id] = o;
    const titre = titres[z.id];
    if (!titre) faute(`${z.id} : pas de titre de la Wikipédia en français (mers-entites.json)`);
    textes[z.id] = titre ? { wp: titre } : {};
  }
  return { lieux, textes, relecture: R, fautes };
}

// --- Le tableau à relire ---------------------------------------------------------------------

const nb = (x) => (x == null ? '—' : Number(x).toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
const cel = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const aRelire = (l) => (l?.a_relire === true ? '**à relire**' : typeof l?.a_relire === 'string' ? `**à relire** : ${l.a_relire}` : '');
function tableau(entetes, lignes) {
  if (!lignes.length) return '_Aucune ligne._\n';
  return [`| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...lignes.map((l) => `| ${l.map(cel).join(' | ')} |`)].join('\n') + '\n';
}
const NOM_SOURCE = { wd: 'Wikidata', ne: 'tracé de Natural Earth', wp: 'Wikipédia (table)', noaa: 'NOAA (table)' };
/** « environ 2,5 millions de km² », comme la fiche (src/fiches/format.ts, fmtSuperficieEnviron). */
function environ(km2) {
  if (km2 == null) return '—';
  if (km2 >= 1e6) return `environ ${(km2 / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} million${km2 >= 2e6 ? 's' : ''} de km²`;
  return `environ ${km2.toLocaleString('fr-FR')} km²`;
}

/**
 * Le texte de docs/relectures/fiches-mers.md. R : la relecture de chiffresMers ; noms : noms des
 * entités (noms.fr.json) ; nomsMers : mers.fr.json (noms) ; zones : public/geo/mers.json ;
 * libelles : ceux de l'extrait des mers (unités, critères) ; sources : {wikidata, ne} (dates).
 */
export function texteRelectureMers({ R, noms, nomsMers, zones, entites, libelles, sources, relues }) {
  const nom = (id) => noms[id] ?? id;
  const mer = (id) => nomsMers[id] ?? id;
  const statut = new Map(entites.map((e) => [e.id, e.statut]));
  const parNom = (a, b) => nom(a).localeCompare(nom(b), 'fr');
  // Le statut comme la fiche le dit d'un voisin (src/vues/commun.ts, LIBELLE_STATUT) : « paquet optionnel » pour Taïwan.
  const LIBELLE = { territoire: 'territoire', conteste: 'statut contesté', optionnel: 'paquet optionnel' };
  const liste = (ids) => (ids.length ? [...ids].sort(parNom).map((id) => (statut.get(id) === 'jouable' ? nom(id) : `${nom(id)} (${LIBELLE[statut.get(id)] ?? statut.get(id)})`)).join(', ') : '—');
  const relireLignes = (lignes) => {
    const l = lignes.filter((x) => x.a_relire).map((x) => (typeof x.a_relire === 'string' ? `${nom(x.id)}, ${x.a_relire}` : nom(x.id)));
    return l.length ? `**à relire** : ${l.join(' ; ')}` : '';
  };
  const o = [];
  o.push('# Fiches des océans et des mers : tableaux à relire');
  o.push('');
  o.push(
    '*Écrit par le build (`npm run fiches`, `geodata/fiches-mers.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. ' +
      'Ticket #34, lot F4 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.3 et § 9 (« Relectures demandées »).*',
  );
  o.push('');
  o.push('## Comment relire, comment corriger');
  o.push('');
  o.push(
    '- Ce que montre la fiche d\'une mer : sa sorte (« mer intérieure », « golfe »…), la mer dont elle fait partie et son océan (des boutons, comme les voisins d\'un pays), ' +
      'sa superficie, sa profondeur maximale, ses pays riverains (des boutons) et le lien vers Wikipédia. Un océan n\'a pas de liste de riverains (une centaine de pays chacun) ; ' +
      'la mer des Sargasses non plus (elle n\'a pas de côte).',
  );
  o.push(
    '- Les trois sections sont **tues dans la fiche** tant que leur clé de `LIGNES_RELUES` (`src/fiches/relues.ts`) est à `false` (chaque section dit son état) : `riverains_mers`, `superficie_mers`, ' +
      '`profondeur_mers`. Une fois une section relue, passer sa clé à `true`. D\'ici là, la fiche d\'une mer montre sa sorte, sa mère, son océan, la mémoire et le lien, ' +
      'et sa barre ne dit que son océan.',
  );
  o.push(
    '- Pour corriger : la ligne de la mer dans `geodata/fiches-main.json` (clé donnée en tête de section, une raison par ligne), puis `npm run fiches`. Le build échoue si ' +
      'une ligne ne s\'applique plus (un pays à retirer que rien ne donne, un pays à ajouter déjà là, une superficie à moins de 25 % du tracé). ' +
      'Pour valider une ligne « à relire » : retirer son `a_relire`.',
  );
  o.push(
    `- Sources : Wikidata (extrait des mers du ${sources.wikidata}) ; Natural Earth 5.1.2 (zones marines et pays, au 1:10m) ; pour les lignes écrites à la main, ` +
      'la Wikipédia (révision citée dans la raison) et, pour les océans, la NOAA (Eakins et Sharman, 2010). Ces pages sont citées dans `public/geo/sources.json`.',
  );
  o.push('');

  // 1. Riverains.
  o.push('## 1. Pays riverains (clés `riverains_mers` et `riverains_items`)');
  o.push('');
  o.push(dansLaFiche('riverains_mers', relues));
  o.push('');
  o.push(
    `Règle : l'union de deux méthodes, sous-mers comprises (la Méditerranée a les riverains de l'Adriatique, de la mer Égée, de la mer Ionienne et de la mer Tyrrhénienne). ` +
      `**Le tracé** : un pays (ou un territoire) dont la côte passe à ${TOLERANCE_DEG.toLocaleString('fr-FR')}° (≈ 13 km) de la zone dessinée, en ${POINTS_MIN} points au moins (≈ 10 km de côte). ` +
      '**Wikidata** : les pays (P17) et pays du bassin (P205) déclarés pour la mer. Puis : les États disparus retirés ; d\'office, un pays que seul Wikidata donne quand un de ses ' +
      'territoires est riverain par le tracé (il est alors représenté par ce territoire) ; enfin les lignes de la table (retraits et ajouts, avec leur raison). ' +
      'Une ligne d\'une sous-mer vaut aussi pour sa mère (Saint-Marin retiré de l\'Adriatique l\'est de la Méditerranée), sauf un retrait d\'un pays qu\'une autre partie de la mère donne : il y reste. ' +
      'Les territoires et les zones contestées portent leur statut ; la fiche range les pays d\'abord, les autres à part, comme les voisins d\'un pays.',
  );
  o.push('');
  const accord = R.riverains.filter((r) => !r.traceSeul.length && !r.wikidataSeul.length && !r.lignes.length && !r.office.length);
  o.push(`${R.riverains.length} mers (les 5 océans à part) ; les deux méthodes s'accordent pour ${accord.length}, sans ligne de la table.`);
  o.push('');
  o.push(
    tableau(
      ['Mer', 'Riverains retenus', 'Par le tracé seul', 'Par Wikidata seul', 'Retirés d\'office', 'Lignes de la table', 'À relire'],
      R.riverains.map((r) => [
        `${mer(r.id)}${r.sous.length ? ` (avec ${r.sous.map(mer).join(', ')})` : ''}`,
        `${r.retenus.length} : ${liste(r.retenus)}`,
        liste(r.traceSeul),
        `${liste(r.wikidataSeul)}${r.disparus.length ? ` ; États disparus retirés : ${r.disparus.join(', ')}` : ''}`,
        liste(r.office),
        r.lignes.length
          ? r.lignes
              .map(
                (l) =>
                  `${l.sens === 'retire' ? 'retire' : 'ajoute'} ${nom(l.id)}${l.mer !== r.id ? ` (ligne de ${mer(l.mer)}${l.garde ? ` ; gardé ici, riverain par ${l.garde.map(mer).join(', ')}` : ''})` : ''} : ${l.raison}`,
              )
              .join(' ; ')
          : '—',
        relireLignes(r.lignes),
      ]),
    ),
  );
  o.push('');
  o.push('Items de Wikidata qui ne sont pas ceux d\'une entité de la carte :');
  o.push('');
  o.push(tableau(['Item', 'Nom dans Wikidata', 'Ce qu\'en fait le build', 'Raison'], R.items.map((i) => [i.q, i.nom, i.id ? `rapporté à ${nom(i.id)}` : i.comment, i.raison ?? 'règle : un État disparu (P576) est retiré'])));
  o.push('');

  // 2. Superficies.
  const zone = new Map(zones.map((z) => [z.id, z]));
  o.push('## 2. Superficies (clé `superficie_mers`)');
  o.push('');
  o.push(dansLaFiche('superficie_mers', relues));
  o.push('');
  o.push(
    'Règle : la valeur de Wikidata (le rang préféré ; sinon, s\'il y en a plusieurs, la plus proche du tracé) ; si elle s\'écarte de plus de 25 % de la superficie du tracé ' +
      '(la zone dessinée sur la carte, sous-mers comprises), une ligne de la table la remplace, avec sa source ; sans valeur dans Wikidata, le tracé. Les océans n\'ont pas de ' +
      'valeur unique (leurs limites varient) : une ligne chacun, d\'après une même source. La fiche arrondit à trois chiffres : « environ 2,5 millions de km² ».',
  );
  o.push('');
  o.push(
    tableau(
      ['Mer', 'Affichée', 'Source', 'Wikidata (km²)', 'Tracé (km²)', 'Écart', 'Raison', 'À relire'],
      R.superficies.map((s) => [
        mer(s.id) + (zone.get(s.id)?.sorte === 'océan' ? ' (océan)' : ''),
        environ(s.retenue),
        NOM_SOURCE[s.source],
        s.wikidata.valeurs.length
          ? s.wikidata.valeurs.map((v) => `${nb(Math.round(v))}${s.wikidata.valeurs.length > 1 && v === s.wikidata.v ? ` (celle de la règle : ${s.wikidata.comment})` : ''}`).join(' ; ')
          : 'aucune',
        nb(s.trace),
        s.ecart == null ? '—' : `${s.ecart >= 0 ? '+' : '−'} ${Math.abs(Math.round(s.ecart * 100))} %`,
        s.ligne?.raison ?? (s.source === 'ne' ? 'aucune valeur dans Wikidata : le tracé' : s.wikidata.valeurs.length > 1 ? `plusieurs valeurs dans Wikidata : ${s.wikidata.comment}` : 'règle'),
        aRelire(s.ligne) || (s.source === 'ne' ? '**à relire** : le tracé, faute de source' : ''),
      ]),
    ),
  );
  o.push('');

  // 3. Profondeurs.
  const critere = (c) => (c ? (libelles[c]?.fr ?? c) : 'sans qualificatif');
  o.push('## 3. Profondeurs maximales (clé `profondeur_mers`)');
  o.push('');
  o.push(dansLaFiche('profondeur_mers', relues));
  o.push('');
  o.push(
    'Règle : la valeur de Wikidata qualifiée « maximum » ; sinon, les moyennes écartées, la seule valeur. Plusieurs valeurs sans qualificatif, ou aucune : une ligne de la table. ' +
      'Les lignes « vérifier » gardent la valeur de Wikidata et disent l\'écart à une autre source.',
  );
  o.push('');
  o.push(
    tableau(
      ['Mer', 'Affichée (m)', 'Source', 'Valeurs de Wikidata (critère)', 'Comment', 'Raison', 'À relire'],
      R.profondeurs.map((p) => [
        mer(p.id),
        nb(p.retenue),
        p.source ? NOM_SOURCE[p.source] : '—',
        p.wikidata.valeurs.length ? p.wikidata.valeurs.map((v) => `${nb(v.v)} (${critere(v.critere)})`).join(' ; ') : 'aucune',
        p.ligne?.aucun ? 'pas de ligne de profondeur' : p.ligne?.m ? 'table' : `règle : ${p.wikidata.comment}`,
        p.ligne ? (p.ligne.verifier ? `${p.ligne.verifier} ; ${p.ligne.raison}` : p.ligne.raison) : '—',
        aRelire(p.ligne) || (p.ligne?.verifier ? '**à relire**' : ''),
      ]),
    ),
  );
  return o.join('\n');
}
