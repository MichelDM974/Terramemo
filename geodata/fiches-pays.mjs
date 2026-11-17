// Chiffres des fiches des 197 pays (#34, lot F2 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2.1 et § 2.5), appelé par
// geodata/fiches.mjs ; sans réseau, sans effet à l'import. Les règles du choix vivent ici,
// une fonction par champ ; la table à la main (geodata/fiches-main.json) les corrige, et
// chacune de ses lignes doit encore s'appliquer : sinon une faute, et le build échoue.
// Ce module ne lit aucun fichier : fiches.mjs lui passe les extraits figés (Wikidata,
// Banque mondiale), les fichiers téléchargés et vérifiés (CLDR, tz) et le tracé de
// la carte (public/geo/monde.topo.json). Il rend des chiffres et des codes (sans langue),
// des textes (de la langue) et, pour les tableaux à relire (fiches-relecture.mjs), ce que
// chaque règle a vu et retenu.

import { geoContains } from 'd3-geo';
import { R_TERRE_KM } from './outils.mjs';

const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
const parId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// --- Wikidata : règles du choix entre plusieurs déclarations -------------------------------

const KM2 = 'Q712226';
const METRE = 'Q11573';
const PIED = 'Q3710';
const PIED_EN_M = 0.3048; // pied international
const date = (d) => d.q?.P585?.[0] ?? null;

/**
 * Le choix d'une valeur parmi plusieurs déclarations (§ 2.1, règle du prototype,
 * donnees-pays/scripts/t_proto.py:20-25) : celles de rang préféré s'il y en a, sinon
 * toutes ; parmi elles, la plus récente si elles sont datées (P585) ; sinon, `sinon`
 * (la plus grande pour une superficie). Les dépréciées ne sont jamais dans l'extrait.
 * Rend la déclaration retenue, ou null s'il n'y en a aucune.
 */
export function choisir(decl, sinon) {
  if (!decl?.length) return null;
  const pref = decl.filter((d) => d.rang === 'preferred');
  const pool = pref.length ? pref : decl;
  const datees = pool.filter(date);
  if (datees.length) return [...datees].sort((a, b) => parId(date(b), date(a)) || parId(a.id, b.id))[0];
  return sinon(pool);
}

/** Superficie de Wikidata (km²) : rang préféré, la plus récente, sinon la plus grande. */
export function superficieWikidata(decl) {
  const km2 = (decl ?? []).filter((d) => d.unite === KM2);
  const d = choisir(km2, (pool) => [...pool].sort((a, b) => b.v - a.v || parId(a.id, b.id))[0]);
  return d ? d.v : null;
}

/** Habitants de Wikidata et leur année : rang préféré, la plus récente ; sinon la seule. */
export function habitantsWikidata(decl) {
  const d = choisir(decl, (pool) => (pool.length === 1 ? pool[0] : null));
  if (!d) return null;
  return { v: d.v, annee: date(d) ? Number(date(d).slice(0, 4)) : null };
}

/**
 * Altitude d'un sommet en mètres (§ 2.1) : la valeur de rang préféré ; sinon la plus
 * récente si elles sont datées ; sinon la seule ; arrondie au mètre. L'unité est lue
 * (pieds convertis) : deux valeurs égales une fois converties et arrondies n'en font
 * qu'une (le mont Afadjato : 2 904 ft et 885 m). Rend {m, valeurs} ou {m: null} si le
 * choix n'est pas unique (une ligne de la table tranche alors).
 */
export function altitude(decl) {
  const conv = (decl ?? [])
    .filter((d) => d.unite === METRE || d.unite === PIED)
    .map((d) => ({ ...d, m: Math.round(d.unite === PIED ? d.v * PIED_EN_M : d.v) }));
  const valeurs = conv.map((d) => `${d.v} ${d.unite === PIED ? 'ft' : 'm'}${d.rang === 'preferred' ? ' (préféré)' : ''}${date(d) ? ` (${date(d).slice(0, 10)})` : ''}`);
  const d = choisir(conv, (pool) => (new Set(pool.map((x) => x.m)).size === 1 ? pool[0] : null));
  return { m: d ? d.m : null, valeurs };
}

/**
 * Le sommet retenu d'un pays (§ 2.1) : celui de la ligne de la table (sommet), aucun pour
 * un sommet hors de Wikidata (hors_wikidata) ou un pays sans ligne de sommet (aucun) ; sinon le seul déclaré (P610), ou le seul
 * de rang préféré. Rend {sommet, auto} : auto, le choix de la règle sans la table.
 */
export function sommetRetenu(decl, ligne) {
  const pref = (decl ?? []).filter((d) => d.rang === 'preferred');
  const auto = decl?.length === 1 ? decl[0].v : pref.length === 1 ? pref[0].v : null;
  if (ligne?.sommet) return { sommet: ligne.sommet, auto };
  if (ligne?.hors_wikidata || ligne?.aucun) return { sommet: null, auto };
  return { sommet: auto, auto };
}

/** Coordonnées [lon, lat] d'un sommet de l'extrait : la préférée, sinon la première. */
export const coordSommet = (s) => (s?.coordonnees?.length ? (s.coordonnees.find((c) => c.rang === 'preferred') ?? s.coordonnees[0]).v : null);

// --- Le tracé de la carte -------------------------------------------------------------------

/**
 * Distance en km d'un point [lon, lat] au tracé d'une entité (0 s'il est dedans) : au plus
 * proche de ses segments, dans une projection plane locale (cosinus de la latitude du
 * point), juste à mieux que 1 % sous 100 km. Sert aux 50 km d'une zone en mer et aux
 * 10 km d'un sommet (§ 2.1).
 */
export function distanceAuTrace(f, [lon, lat]) {
  if (geoContains(f, [lon, lat])) return 0;
  const k = Math.cos((lat * Math.PI) / 180);
  const kmDeg = (Math.PI / 180) * R_TERRE_KM;
  // Écart en longitude ramené dans [-180, 180] : un sommet d'un segment l'est par rapport
  // au point, l'autre par rapport au premier, pour qu'un segment près de l'antiméridien
  // ne traverse pas toute la carte (Kwajalein se trouvait à 47 km de la Guinée).
  const tour = (dx) => (dx > 180 ? dx - 360 : dx < -180 ? dx + 360 : dx);
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let min = Infinity;
  for (const anneaux of polys) {
    for (const r of anneaux) {
      let ax = tour(r[0][0] - lon);
      let a = [ax * k * kmDeg, (r[0][1] - lat) * kmDeg];
      for (let i = 1; i < r.length; i++) {
        const bx = ax + tour(r[i][0] - r[i - 1][0]);
        const b = [bx * k * kmDeg, (r[i][1] - lat) * kmDeg];
        const [ux, uy] = [b[0] - a[0], b[1] - a[1]];
        const l2 = ux * ux + uy * uy;
        const t = l2 ? Math.max(0, Math.min(1, -(a[0] * ux + a[1] * uy) / l2)) : 0;
        min = Math.min(min, Math.hypot(a[0] + t * ux, a[1] + t * uy));
        ax = tour(bx);
        a = [ax * k * kmDeg, b[1]];
      }
    }
  }
  return min;
}

// --- Fuseaux (base tz, zone.tab) ------------------------------------------------------------

/** Coordonnées ISO 6709 de zone.tab (±DDMM[SS]±DDDMM[SS]) → [lon, lat]. */
export function coordZoneTab(t) {
  const m = t.match(/^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/);
  if (!m) throw new Error(`zone.tab : coordonnées illisibles ${t}`);
  const v = (s, d, mi, se) => (s === '-' ? -1 : 1) * (Number(d) + Number(mi) / 60 + Number(se ?? 0) / 3600);
  return [v(m[5], m[6], m[7], m[8]), v(m[1], m[2], m[3], m[4])];
}

/** Les lignes de zone.tab : {cc, point, zone, commentaire}. */
export function lireZoneTab(texte) {
  return texte
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [cc, co, zone, commentaire = ''] = l.split('\t');
      return { cc, point: coordZoneTab(co), zone, commentaire };
    });
}

// Dates du décompte des fuseaux (§ 2.1) : le 1er janvier et le 1er juillet de l'année de
// la base tz. Les décalages sont ceux de l'ICU de Node (Intl), dont la base tz peut
// précéder 2026e : une zone qu'il ne connaît pas lève, et le build échoue.
const JOURS_DECOMPTE = [Date.UTC(2026, 0, 1, 12), Date.UTC(2026, 6, 1, 12)];

/** Décalage de la zone à l'instant t, en minutes à l'est d'UTC. */
export function decalage(zone, t) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return (Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - t) / 60000;
}

const MER_KM = 50;

/**
 * Chaque zone de zone.tab rangée dans l'entité de la carte dont le tracé contient son
 * point ; un point en mer prend l'entité la plus proche, à MER_KM au plus ; plus loin, la
 * zone ne compte pour personne (§ 2.1). Rend {zones: Map id → [zone], horsTrace: [...]}.
 */
/**
 * Emprise [o, s, e, n] d'un tracé avec sa marge en km, ou null près de l'antiméridien (le
 * monde entier). pres : un point [lon, lat] dans l'emprise ; hors d'elle, il n'est ni dedans
 * ni à moins de la marge.
 */
export function emprise(f, km) {
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const a of polys) for (const r of a) for (const [x, y] of r) [o, s, e, n] = [Math.min(o, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  return e - o > 180 ? null : { b: [o, s, e, n], marge: km / 111 + 0.01 };
}
export function pres(em, [x, y]) {
  if (!em) return true;
  const { b, marge } = em;
  const k = Math.max(Math.cos((y * Math.PI) / 180), 0.05);
  return x >= b[0] - marge / k && x <= b[2] + marge / k && y >= b[1] - marge && y <= b[3] + marge;
}

export function zonesParTrace(lignes, formes) {
  const zones = new Map();
  const horsTrace = [];
  const emprises = formes.map((f) => emprise(f, MER_KM));
  for (const z of lignes) {
    const proches = formes.filter((f, i) => pres(emprises[i], z.point));
    let ids = proches.filter((f) => geoContains(f, z.point)).map((f) => f.properties.id);
    let mer = null;
    if (!ids.length) {
      let best = { d: Infinity, id: null };
      for (const f of proches) {
        const d = distanceAuTrace(f, z.point);
        if (d < best.d) best = { d, id: f.properties.id };
      }
      if (best.d <= MER_KM) {
        ids = [best.id];
        mer = Math.round(best.d * 10) / 10;
      } else horsTrace.push({ zone: z.zone, plusProche: best.id, km: Number.isFinite(best.d) ? Math.round(best.d) : null });
    }
    for (const id of ids) {
      if (!zones.has(id)) zones.set(id, []);
      zones.get(id).push({ ...z, mer });
    }
  }
  return { zones, horsTrace };
}

/**
 * Décalage normal d'une zone (heure d'hiver), en minutes : le plus petit des deux jours du
 * décompte. L'heure d'été ajoute toujours, dans les deux hémisphères ; compter le plus
 * grand des deux jours comptait Adak (UTC−9 l'été, comme l'Alaska) ou Lord Howe en plus.
 */
export const decalageNormal = (zone) => Math.min(...JOURS_DECOMPTE.map((t) => decalage(zone, t)));

/** Nombre de fuseaux : décalages normaux distincts des zones (États-Unis 6, Australie 5). */
export function nombreFuseaux(zones) {
  return new Set(zones.map((z) => decalageNormal(z.zone))).size;
}

/** Les décalages distincts au 1er janvier, au 1er juillet, et les normaux, en heures (pour la relecture). */
export function decalagesFuseaux(zones) {
  const h = (m) => (m / 60).toString();
  const distincts = (f) => [...new Set(zones.map(f))].sort((a, b) => a - b).map(h);
  return [...JOURS_DECOMPTE.map((t) => distincts((z) => decalage(z.zone, t))), distincts((z) => decalageNormal(z.zone))];
}

// --- Gentilés --------------------------------------------------------------------------------

const MASCULINS = new Set(['Q499327', 'Q6581097', 'Q47088290']); // masculin (deux items), masculin singulier
const PLURIELS = new Set(['Q146786', 'Q47088292', 'Q47088295']); // pluriel, masculin pluriel, féminin pluriel
const SINGULIERS = new Set(['Q110786', 'Q47088290', 'Q47088293']); // singulier, masculin singulier, féminin singulier
const FEMININS = new Set(['Q1775415', 'Q6581072', 'Q47088293']); // féminin (deux items), féminin singulier

/**
 * Les formes masculines singulières d'un gentilé de Wikidata (P1549, en français) : une
 * déclaration au genre masculin (P518 ou P5185) qui n'est pas un pluriel seul (P518 ou
 * P11054) ; à défaut, les formes sans aucune marque de genre ni de nombre. Majuscule
 * initiale (« allemand » → « Allemand »), doublons retirés. Rend les formes triées.
 */
export function gentilesMasculins(decl) {
  const marques = (d) => [...(d.q?.P518 ?? []), ...(d.q?.P5185 ?? []), ...(d.q?.P11054 ?? [])];
  // Pluriel seul : une marque de pluriel sans marque de singulier (« Japonais », masculin
  // singulier et masculin pluriel, reste un singulier).
  const plurielSeul = (d) => marques(d).some((q) => PLURIELS.has(q)) && !marques(d).some((q) => SINGULIERS.has(q));
  const masc = (decl ?? []).filter((d) => marques(d).some((q) => MASCULINS.has(q)) && !plurielSeul(d));
  const nues = (decl ?? []).filter((d) => !marques(d).some((q) => MASCULINS.has(q) || FEMININS.has(q) || PLURIELS.has(q)));
  const formes = (masc.length ? masc : nues).map((d) => d.v.charAt(0).toUpperCase() + d.v.slice(1));
  return [...new Set(formes)].sort(parId);
}

/**
 * Le pluriel d'un gentilé (§ 2.1) : un « s », sauf après s, x ou z. Une forme en -al ou
 * -eau (pluriel irrégulier) lève : la table doit donner son pluriel.
 */
export function plurielGentile(g) {
  if (/(al|eau)$/.test(g)) throw new Error(`gentilé « ${g} » : pluriel irrégulier, à écrire dans la table (pluriel)`);
  return /[sxz]$/.test(g) ? g : `${g}s`;
}

// --- Langues et monnaies (CLDR) ----------------------------------------------------------

const OFFICIELS = new Set(['official', 'de_facto_official']);
export const SEUIL_LANGUE = 10; // % de la population (D56 c)
const base = (code) => code.split('_')[0];

/**
 * Langues candidates d'un territoire (CLDR territoryInfo) avant la table : un seul code
 * par langue (sr et sr_Latn : sr ; la plus grande part, et officielle si l'un l'est),
 * officielles d'abord, puis les autres à SEUIL_LANGUE % ou plus ; part décroissante,
 * puis code.
 */
export function languesCandidates(info) {
  const parCode = new Map();
  for (const [code, v] of Object.entries(info?.languagePopulation ?? {})) {
    const c = base(code);
    const pct = Number(v._populationPercent);
    const off = OFFICIELS.has(v._officialStatus);
    const avant = parCode.get(c);
    parCode.set(c, { code: c, pct: Math.max(pct, avant?.pct ?? 0), officielle: off || (avant?.officielle ?? false), statut: avant?.officielle ? avant.statut : off ? v._officialStatus : (avant?.statut ?? v._officialStatus ?? '') });
  }
  const tri = (a, b) => b.pct - a.pct || parId(a.code, b.code);
  const toutes = [...parCode.values()];
  return [...toutes.filter((l) => l.officielle).sort(tri), ...toutes.filter((l) => !l.officielle && l.pct >= SEUIL_LANGUE).sort(tri)];
}

/** Monnaies en cours d'un territoire (CLDR currencyData) : sans _to, et pas _tender « false ». */
export function monnaiesEnCours(region) {
  return (region ?? [])
    .map((o) => Object.entries(o)[0])
    .filter(([, v]) => !v._to && v._tender !== 'false')
    .map(([c]) => c);
}

// --- Tout le pays -------------------------------------------------------------------------

const lignes = (main, cle) => Object.fromEntries(sansNotes(main[cle]));

/** Distance d'un sommet à une zone disputée sous laquelle il va à la relecture, en km. */
const ZONE_KM = 5;

/** Superficie servie : au km² près, sauf sous 100 km² (le Vatican : 0,44), au centième. */
export const arrondiSuperficie = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 100) / 100);

/**
 * Les chiffres des 197 pays. Entrées : entites (pays.json, triées), formes (features du
 * tracé, monde.topo.json), zones (features des zones disputées, du même), capitales (capitales.json), wd (geodata/wikidata/fiches.json),
 * bm (Banque mondiale), cldr et zoneTab (lireSourcesFiches), contestees
 * (contestees.json), main (fiches-main.json). Rend {lieux, textes, langues, monnaies,
 * relecture, notes} ; lève sur toute faute (ligne qui ne s'applique plus, pays sans
 * valeur, nom manquant).
 */
export function chiffresPays({ entites, formes, zones = [], capitales, wd, bm, cldr, zoneTab, contestees, main }) {
  const erreurs = [];
  const faute = (m) => erreurs.push(m);
  const pays = entites.filter((e) => e.statut === 'jouable' || e.statut === 'optionnel');
  const ids = new Set(pays.map((e) => e.id));
  const forme = new Map(formes.map((f) => [f.properties.id, f]));
  const capitale = new Map(capitales.map((c) => [c.pays, c.c.find((x) => x.p) ?? c.c[0]]));
  const lieux = {};
  const textes = {};
  const langues = {};
  const monnaies = {};
  const R = { habitants: [], superficies: [], gentiles: [], culminants: [], fuseaux: [], fuseauxPlusieurs: [], horsTrace: [], monnaies: [], langues: [], languesRetraits: [], languesAjouts: [], languesParts: [], languesOrdres: [], fetes: [], languesNoms: [] };
  const table = {
    superficie: lignes(main, 'superficie'),
    gentile: lignes(main, 'gentile'),
    culminant: lignes(main, 'culminant'),
    fuseau: lignes(main, 'fuseau'),
    monnaies: lignes(main, 'monnaies'),
    langues: lignes(main, 'langues'),
    fete: lignes(main, 'fete'),
  };
  for (const [cle, t] of Object.entries(table)) {
    for (const [id, l] of Object.entries(t)) {
      if (cle === 'langues' && id === 'noms') continue;
      if (cle === 'superficie') {
        // Wikidata pour tous (décision du 18/11/2026) : la seule clé est la liste des touchés.
        if (id !== 'touches') faute(`fiches-main.json, superficie.${id} : pas de ligne par pays, Wikidata pour tous`);
        continue;
      }
      if (!ids.has(id)) faute(`fiches-main.json, ${cle} : ${id} n'est pas un pays de pays.json`);
      if (!l.raison) faute(`fiches-main.json, ${cle}.${id} : sans raison`);
    }
  }
  const utilisees = { noms: new Set() };
  const lignesTab = lireZoneTab(zoneTab);
  const { zones: zonesTrace, horsTrace } = zonesParTrace(lignesTab, formes);
  R.horsTrace = horsTrace;
  const nomsLangues = Object.fromEntries(sansNotes(table.langues.noms));
  // Emprise de chaque zone disputée, élargie de ZONE_KM : un sommet hors de l'emprise est loin.
  const empZones = zones.map((z) => emprise(z, ZONE_KM));

  for (const e of pays) {
    const id = e.id;
    const q = wd.pays[id];
    const w = q ? wd.lieux[q] : null;
    if (!w) {
      faute(`${id} : absent de l'extrait de Wikidata des fiches`);
      continue;
    }
    const L = {};
    const T = {};

    // Habitants : Banque mondiale 2025 ; à défaut Wikidata, avec son année (§ 2.1).
    const b = bm.economies[id];
    if (b && b.v != null) {
      L.h = b.v;
      L.ha = b.annee;
      R.habitants.push({ id, v: b.v, annee: b.annee, source: 'bm', nom: b.nom });
    } else {
      const h = habitantsWikidata(w.habitants);
      if (!h || !h.annee) faute(`${id} : ni Banque mondiale ni habitants datés dans Wikidata`);
      else {
        L.h = h.v;
        L.ha = h.annee;
        L.hs = 'wd';
        R.habitants.push({ id, v: h.v, annee: h.annee, source: 'wd' });
      }
    }

    // Superficie (D57, décision du 18/11/2026) : Wikidata pour tous les pays, citée « selon
    // Wikidata », par la règle du choix (§ 2.1) ; le tracé n'est montré qu'à la relecture.
    const wdKm2 = superficieWikidata(w.superficies);
    if (wdKm2 == null) faute(`${id} : pas de superficie dans Wikidata`);
    else L.sup = arrondiSuperficie(wdKm2);
    const declSup = (w.superficies ?? []).filter((d) => d.unite === KM2);
    R.superficies.push({ id, wd: wdKm2, retenue: L.sup ?? null, trace: e.superficie_km2, valeurs: declSup.map((d) => `${d.v}${d.rang === 'preferred' ? ' (préféré)' : ''}${date(d) ? ` (${date(d).slice(0, 10)})` : ''}`) });

    // Gentilé (§ 2.1) : le masculin de Wikidata ; une ligne pour plusieurs formes ou aucune.
    const formesG = gentilesMasculins(w.gentiles);
    const lg = table.gentile[id];
    let gentile = null;
    if (lg) {
      if (formesG.length === 1 && formesG[0] === lg.masculin && !lg.pluriel) faute(`fiches-main.json, gentile.${id} : « ${lg.masculin} » est la seule forme de Wikidata, ligne inutile`);
      if (!lg.masculin && formesG.length !== 1) faute(`fiches-main.json, gentile.${id} : un pluriel seul, mais ${formesG.length} formes dans Wikidata`);
      gentile = lg.masculin ?? formesG[0];
    } else if (formesG.length === 1) gentile = formesG[0];
    else faute(`${id} : ${formesG.length} formes masculines du gentilé dans Wikidata (${formesG.join(', ') || 'aucune'}), à trancher dans la table`);
    if (gentile) {
      T.g = gentile;
      let regle = null;
      try {
        regle = plurielGentile(gentile);
      } catch (err) {
        if (!lg?.pluriel) faute(`${id} : ${err.message}`);
      }
      if (lg?.pluriel && lg.pluriel === regle) faute(`fiches-main.json, gentile.${id} : le pluriel « ${lg.pluriel} » est celui de la règle, à retirer`);
      T.gp = lg?.pluriel ?? regle;
    }
    R.gentiles.push({ id, formes: formesG, retenu: gentile, pluriel: T.gp ?? null, ligne: lg ?? null });

    // Point culminant (§ 2.1) : le sommet déclaré (P610), le préféré s'il y en a plusieurs ;
    // la table tranche (« le plus haut point du tracé de fait de la carte ») ou corrige.
    const lc = table.culminant[id];
    const decl = w.culminants ?? [];
    const { sommet, auto } = sommetRetenu(decl, lc);
    if (lc?.sommet) {
      if (!decl.some((d) => d.v === lc.sommet)) faute(`fiches-main.json, culminant.${id} : ${lc.sommet} n'est pas un sommet déclaré par Wikidata`);
      if (lc.sommet === auto && !lc.nom && lc.alt == null) faute(`fiches-main.json, culminant.${id} : ${lc.sommet} est déjà le sommet retenu, ligne inutile`);
    } else if (!lc?.hors_wikidata && !lc?.aucun && !sommet && decl.length) {
      faute(`${id} : ${decl.length} sommets déclarés dans Wikidata, aucun préféré seul : à trancher dans la table`);
    }
    const s = sommet ? wd.sommets[sommet] : null;
    const alt = s ? altitude(s.altitudes) : { m: null, valeurs: [] };
    const coordWd = coordSommet(s);
    const nom = lc?.nom ?? s?.fr ?? null;
    const m = lc?.alt ?? alt.m;
    if (lc?.nom && s?.fr === lc.nom) faute(`fiches-main.json, culminant.${id} : « ${lc.nom} » est déjà le libellé de Wikidata`);
    if (lc?.alt != null && lc.alt === alt.m) faute(`fiches-main.json, culminant.${id} : ${lc.alt} m est déjà l'altitude de Wikidata`);
    if (lc?.alt != null && !lc.source) faute(`fiches-main.json, culminant.${id} : altitude sans source`);
    // La seconde source (§ 2.1, S63) : un autre sommet, ou une altitude à plus de 5 m de
    // celle retenue ; sinon la ligne ne dit rien de plus.
    if (lc?.seconde && !lc.seconde.nom && m != null && Math.abs(lc.seconde.m - m) <= 5 && !lc.sommet && !lc.nom && lc.alt == null && !lc.hors_trace) {
      faute(`fiches-main.json, culminant.${id} : seconde source à ${lc.seconde.m} m, à 5 m au plus de ${m} m, ligne inutile`);
    }
    if (lc?.seconde && !lc.seconde.source) faute(`fiches-main.json, culminant.${id} : seconde source sans source`);
    // aucun : pas de ligne de sommet (la Somalie, dont le sommet de Wikidata est dans le
    // Somaliland : aucun point culminant ne passe par une zone disputée, décision du 18/11).
    if (lc?.aucun && (lc.sommet || lc.nom || lc.alt != null || lc.hors_wikidata)) faute(`fiches-main.json, culminant.${id} : aucun, mais un sommet écrit`);
    if (!lc?.aucun) {
      if (!nom) faute(`${id} : point culminant sans nom (${sommet ?? 'aucun sommet'})`);
      if (m == null) faute(`${id} : altitude du sommet à trancher (${alt.valeurs.join(', ') || 'aucune'})`);
      else if (m < 1 || m > 8850) faute(`${id} : altitude ${m} m hors de 1 à 8 850`);
      L.alt = m;
      T.cu = nom;
    }
    const coord = lc?.coord ?? coordWd;
    const f = forme.get(id);
    const dist = coord && f ? Math.round(distanceAuTrace(f, coord) * 10) / 10 : null;
    if (lc?.hors_trace && dist != null && dist <= 10) faute(`fiches-main.json, culminant.${id} : hors_trace, mais le sommet est à ${dist} km du tracé`);
    const ecart = lc?.seconde && m != null ? Math.round(m - lc.seconde.m) : null;
    // Aucun point culminant ne passe par une zone disputée (décision du 18/11/2026) : un
    // sommet dans une zone de contestees.json est une faute ; à 5 km ou moins (le tracé est
    // simplifié), il va à la relecture.
    const presZones = [];
    if (coord && !lc?.aucun) {
      for (const z of zones.filter((x, i) => pres(empZones[i], coord))) {
        const d = distanceAuTrace(z, coord);
        if (d === 0) faute(`${id} : le sommet ${nom ?? sommet} est dans la zone disputée ${z.properties.id} (aucun point culminant n'y passe)`);
        else if (d <= ZONE_KM) presZones.push({ zone: z.properties.id, km: Math.round(d * 10) / 10 });
      }
    }
    R.culminants.push({ id, sommet, nom, m, ecart, altWd: alt.m, valeurs: alt.valeurs, declares: decl.map((d) => ({ q: d.v, rang: d.rang, nom: wd.sommets[d.v]?.fr ?? null, alt: altitude(wd.sommets[d.v]?.altitudes).m })), coord, dist, presZones, ligne: lc ?? null });

    // Heure locale : la zone de zone.tab du code du pays la plus proche de sa capitale ;
    // le nombre de fuseaux, par le tracé (§ 2.1).
    const lf = table.fuseau[id];
    const cap = capitale.get(id);
    const duCode = lignesTab.filter((z) => z.cc === e.a2);
    let zone = null;
    let plusProche = null;
    if (cap && duCode.length) {
      const d = (z) => Math.hypot((z.point[0] - cap.lon) * Math.cos((cap.lat * Math.PI) / 180), z.point[1] - cap.lat);
      plusProche = [...duCode].sort((a, b) => d(a) - d(b) || parId(a.zone, b.zone))[0].zone;
    }
    if (lf?.zone) {
      if (lf.zone === plusProche) faute(`fiches-main.json, fuseau.${id} : ${lf.zone} est déjà la zone la plus proche de la capitale`);
      if (!lignesTab.some((z) => z.zone === lf.zone)) faute(`fiches-main.json, fuseau.${id} : ${lf.zone} n'est pas une zone de zone.tab`);
      zone = lf.zone;
    } else zone = plusProche;
    if (!zone) faute(`${id} : aucune zone dans zone.tab (code ${e.a2}), à écrire dans la table`);
    else {
      try {
        decalage(zone, JOURS_DECOMPTE[0]);
        L.z = zone;
      } catch {
        faute(`${id} : zone ${zone} inconnue de l'ICU de Node`);
      }
    }
    const zt = zonesTrace.get(id) ?? [];
    const nzRegle = zt.length ? nombreFuseaux(zt) : 1;
    const nz = lf?.nz ?? nzRegle;
    if (lf?.nz != null && lf.nz === nzRegle) faute(`fiches-main.json, fuseau.${id} : ${lf.nz} fuseaux, déjà le compte de la règle`);
    if (nz > 1) L.nz = nz;
    R.fuseaux.push({ id, zone, plusProche, ligne: lf ?? null, capitale: cap?.q ?? null });
    if (nzRegle > 1 || lf?.nz != null) R.fuseauxPlusieurs.push({ id, nz, nzRegle, decalages: decalagesFuseaux(zt), zones: zt.map((z) => `${z.zone}${z.cc !== e.a2 ? ` (${z.cc})` : ''}${z.mer != null ? ` (en mer, ${z.mer} km)` : ''}`), ligne: lf ?? null });

    // Monnaies (CLDR) : l'ordre fixé à la main pour les pays à plusieurs monnaies.
    const enCours = monnaiesEnCours(cldr.currencyData.region[e.a2]);
    const lm = table.monnaies[id];
    let liste = enCours;
    if (lm) {
      if ([...lm.ordre].sort().join() !== [...enCours].sort().join()) faute(`fiches-main.json, monnaies.${id} : ${lm.ordre.join(', ')} ≠ monnaies en cours de CLDR (${enCours.join(', ')})`);
      liste = lm.ordre;
    } else if (enCours.length > 1) faute(`${id} : ${enCours.length} monnaies en cours (${enCours.join(', ')}), ordre à fixer dans la table`);
    if (!liste.length) faute(`${id} : aucune monnaie en cours dans CLDR`);
    for (const c of liste) {
      const n = cldr.monnaiesFr[c]?.displayName;
      if (!n) faute(`${id} : monnaie ${c} sans nom français dans CLDR`);
      else monnaies[c] = n;
    }
    L.m = liste;
    if (liste.length > 1) R.monnaies.push({ id, cldr: enCours, ordre: liste, ligne: lm });

    // Langues (D56 c) : les officielles, puis les langues du pays à 10 % ou plus avec leur
    // part ; la table retire (langue apprise, dialecte, double code) ou ajoute.
    const cand = languesCandidates(cldr.territoryInfo[e.a2]);
    const ll = table.langues[id] ?? {};
    const retirer = ll.retirer ?? {};
    const ajouter = ll.ajouter ?? {};
    for (const c of Object.keys(retirer)) if (!cand.some((l) => l.code === c)) faute(`fiches-main.json, langues.${id} : ${c} à retirer n'est pas une candidate de CLDR`);
    let finales = cand.filter((l) => !retirer[l.code]);
    for (const [code, a] of Object.entries(ajouter)) {
      const deja = finales.find((l) => l.code === code);
      if (deja && deja.officielle === Boolean(a.officielle)) faute(`fiches-main.json, langues.${id} : ${code} est déjà là`);
      if (!a.source) faute(`fiches-main.json, langues.${id}.ajouter.${code} : sans source`);
      const info = cldr.territoryInfo[e.a2]?.languagePopulation ?? {};
      const pct = Math.max(0, ...Object.entries(info).filter(([k]) => base(k) === code).map(([, v]) => Number(v._populationPercent)));
      finales = finales.filter((l) => l.code !== code);
      finales.push({ code, pct, officielle: Boolean(a.officielle), ajout: true });
    }
    // parts : une part écrite à la main, avec sa source, pour une langue parlée dont la part
    // de CLDR est fausse (le pendjabi au Pakistan : 70 % dans CLDR, 37 % au recensement).
    for (const [code, p] of Object.entries(ll.parts ?? {})) {
      const l = finales.find((x) => x.code === code);
      if (!l || l.officielle) faute(`fiches-main.json, langues.${id}.parts.${code} : pas une langue parlée de la liste`);
      else if (Math.round(l.pct) === p.pct) faute(`fiches-main.json, langues.${id}.parts.${code} : ${p.pct} %, déjà la part de CLDR`);
      if (!p.source) faute(`fiches-main.json, langues.${id}.parts.${code} : sans source`);
      if (l && !l.officielle) Object.assign(l, { pctCldr: l.pct, pct: p.pct, partMain: true });
    }
    const tri = (a, b) => b.pct - a.pct || parId(a.code, b.code);
    let officielles = finales.filter((l) => l.officielle).sort(tri);
    // ordre : l'ordre des officielles, quand la part n'est pas le bon ordre (le kazakh,
    // langue d'État, avant le russe, plus parlé).
    if (ll.ordre) {
      if ([...ll.ordre].sort().join() !== officielles.map((l) => l.code).sort().join()) faute(`fiches-main.json, langues.${id}.ordre : ${ll.ordre.join(', ')} ≠ officielles (${officielles.map((l) => l.code).join(', ')})`);
      else if (ll.ordre.join() === officielles.map((l) => l.code).join()) faute(`fiches-main.json, langues.${id}.ordre : déjà l'ordre des parts, ligne inutile`);
      else officielles = ll.ordre.map((c) => officielles.find((l) => l.code === c));
    }
    finales = [...officielles, ...finales.filter((l) => !l.officielle).sort(tri)];
    if (!finales.length) faute(`${id} : aucune langue après la table`);
    L.lo = finales.filter((l) => l.officielle).map((l) => l.code);
    const parlees = finales.filter((l) => !l.officielle).map((l) => [l.code, Math.round(l.pct)]);
    if (parlees.length) L.lp = parlees;
    for (const l of finales) {
      const n = nomsLangues[l.code]?.nom ?? cldr.languesFr[l.code];
      if (nomsLangues[l.code]) utilisees.noms.add(l.code);
      if (nomsLangues[l.code] && cldr.languesFr[l.code]) faute(`fiches-main.json, langues.noms.${l.code} : CLDR a déjà un nom (« ${cldr.languesFr[l.code]} »)`);
      if (!n) faute(`${id} : langue ${l.code} sans nom français (CLDR ni table)`);
      else langues[l.code] = n;
    }
    R.langues.push({ id, finales: finales.map((l) => ({ code: l.code, pct: l.pct, officielle: l.officielle, ajout: Boolean(l.ajout), partMain: Boolean(l.partMain) })), candidates: cand, ligne: table.langues[id] ?? null });
    for (const [code, p] of Object.entries(ll.parts ?? {})) R.languesParts.push({ id, code, pct: p.pct, cldr: finales.find((l) => l.code === code)?.pctCldr ?? null, source: p.source, raison: p.raison ?? ll.raison });
    if (ll.ordre) R.languesOrdres.push({ id, ordre: ll.ordre, raison: ll.raison_ordre ?? ll.raison, source: ll.source_ordre ?? null });
    for (const [code, raison] of Object.entries(retirer)) R.languesRetraits.push({ id, code, pct: cand.find((l) => l.code === code)?.pct ?? null, officielle: cand.find((l) => l.code === code)?.officielle ?? false, raison, a_relire: Boolean(ll.a_relire?.includes?.(code)) });
    for (const [code, a] of Object.entries(ajouter)) R.languesAjouts.push({ id, code, ...a, a_relire: Boolean(ll.a_relire?.includes?.(code)) });

    // Fête nationale (§ 2.1) : la table seule, pré-remplie par le World Factbook.
    const fe = table.fete[id];
    if (!fe) faute(`${id} : pas de ligne de fête nationale (fete)`);
    else if (!fe.aucune) {
      if (!(fe.jour >= 1 && fe.jour <= 31 && fe.mois >= 1 && fe.mois <= 12)) faute(`fiches-main.json, fete.${id} : jour ${fe.jour} et mois ${fe.mois} invalides`);
      if (!fe.nom) faute(`fiches-main.json, fete.${id} : sans nom`);
      L.f = [fe.jour, fe.mois];
      T.fn = fe.nom;
    }
    R.fetes.push({ id, ligne: fe ?? null });

    lieux[id] = L;
    textes[id] = T;
  }

  // Les noms de langues de la table : chacun sert.
  for (const code of Object.keys(nomsLangues)) if (!utilisees.noms.has(code)) faute(`fiches-main.json, langues.noms.${code} : nom d'une langue qu'aucun pays ne montre`);
  R.languesNoms = Object.entries(nomsLangues).map(([code, l]) => ({ code, ...l }));

  // Pays touchés par une zone disputée (§ 2.1, D57) : tenant ou revendiquant d'une zone de
  // contestees.json, ou revendiquant d'une entité de pays.json ; la part de ces zones dans
  // leur tracé, à 1 % ou plus. La liste de la table doit être celle des données.
  const touches = paysTouches(entites, contestees);
  const attendus = touches.filter((t) => t.part >= 1).map((t) => t.id);
  const ecrits = main.superficie?.touches?.pays ?? [];
  if ([...ecrits].sort().join() !== [...attendus].sort().join()) {
    faute(`fiches-main.json, superficie.touches : ${ecrits.length} pays écrits ≠ ${attendus.length} calculés (${attendus.join(', ')})`);
  }
  R.touches = touches;

  if (erreurs.length) throw new Error(`fiches, pays :\n  ${erreurs.join('\n  ')}`);
  const tri = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => parId(a, b)));
  return { lieux, textes, langues: tri(langues), monnaies: tri(monnaies), relecture: R };
}

/**
 * Pays touchés par une zone disputée (§ 2.1, correction/pays-touches.py) : la surface des
 * zones de contestees.json qu'ils tiennent ou revendiquent (dans, revendique_par) et des
 * entités de pays.json qu'ils revendiquent, rapportée à leur tracé (superficie_km2). Rend
 * [{id, km2, part}] des pays jouables et optionnels, part en % à un chiffre après la
 * virgule, de la plus grande à la plus petite.
 */
export function paysTouches(entites, contestees) {
  const geo = new Map(entites.map((e) => [e.id, e]));
  const a = new Map();
  const ajoute = (x, km2) => a.set(x, (a.get(x) ?? 0) + km2);
  for (const z of contestees) for (const x of new Set([...(z.dans ?? []), ...(z.revendique_par ?? [])])) ajoute(x, z.superficie_km2);
  for (const e of entites) for (const x of e.revendique_par ?? []) ajoute(x, e.superficie_km2);
  return [...a]
    .filter(([x]) => ['jouable', 'optionnel'].includes(geo.get(x)?.statut))
    .map(([id, km2]) => ({ id, km2: Math.round(km2), part: Math.round((km2 / geo.get(id).superficie_km2) * 1000) / 10 }))
    .sort((x, y) => y.part - x.part || parId(x.id, y.id));
}
