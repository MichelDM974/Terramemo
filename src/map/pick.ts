// pick et noter : la seule interface entre la carte et le reste. Fonctions pures
// (projection, transformation, géométries, pastilles) : un rendu Canvas de
// repli les réutiliserait telles quelles.
import { geoDistance, type GeoProjection } from 'd3-geo';
import type { Acceptes, Admis, ZoneAdmise } from './acceptes';
import { contient, dansEmprise, distanceAuBordKm, RAYON_TERRE_KM, versEcran, versLonLat } from './geo';
import type { CoucheLieu, LieuIndexe } from './lieux';
import { zonesAllumees } from './mers';
import { PASTILLE, pastilleLaPlusProche, tailleEcranPx, type Pastille } from './pastilles';
import type { Entite, Lieu, Mer, Transfo } from './types';

export interface ContexteCarte {
  proj: GeoProjection;
  t: Transfo;
  entites: readonly Entite<Lieu>[];
  /** Pastilles affichées au zoom courant. */
  pastilles: readonly Pastille[];
  /**
   * Zones qui comptent juste pour une cible hors de son tracé (acceptes.ts :
   * zones contestées, enclaves) ; absent : aucune, le de fait strict.
   */
  acceptes?: Acceptes;
  /**
   * La couche marine posée sur la carte (prendreMers) : ses zones, dans
   * l'ordre de donnees.mers ; absente ou vide avant. Seule une cible marine
   * la parcourt (pickMer) : une partie de pays n'en paie rien.
   */
  mers?: readonly Entite<Mer>[];
  /**
   * L'index commun des pays et des mers (lieux.ts), où noter cherche la cible
   * et sa couche ; absent : entites, puis mers.
   */
  lieux?: ReadonlyMap<string, LieuIndexe>;
}

export type Via = 'pastille' | 'trace' | 'proche';

export interface ResultatPick {
  id: string;
  via: Via;
  /** Distance du doigt au centre de la pastille (pastille), 0 (trace), rayon de la sonde (proche). */
  distance_px: number;
}

/** Rayons (px) des sondes autour d'un toucher en mer, et nombre de directions. */
export const SONDES_PROCHE = { rayons_px: [4, 8, 12], directions: 8 } as const;

function sousLePoint(ctx: ContexteCarte, x: number, y: number): Entite<Lieu> | null {
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  if (!ll) return null;
  for (const e of ctx.entites) if (contient(e.forme, e.pays.bbox, ll)) return e;
  return null;
}

/**
 * Ce qui est sous le doigt en (x, y), px CSS dans le repère de la carte :
 * 1. sur le tracé d'un pays, un disque dessiné (pastille visible) voisin sous
 *    le doigt (à moins de PASTILLE.rayon_sur_trace_px de son centre : le
 *    disque de 7 px et ~3 px de marge), s'il est plus près du doigt que le
 *    point du pays sous le doigt (sa pastille, ou son point d'étiquette s'il
 *    n'en a pas) : le Vatican dans Rome ; mais le point de la France reste la
 *    France malgré le Luxembourg, celui du Venezuela le Venezuela malgré
 *    Trinité (relecture V1 : seul un pays à pastille faisait concourir son
 *    point, la Tanzanie et l'Arabie saoudite étaient intouchables au zoom 1) ;
 * 2. sinon ce tracé : via « pastille » si le doigt est aussi sur le disque du
 *    pays (même rayon), « trace » sinon ;
 * 3. en mer, la cible la plus proche à moins de 22 px : un disque, ou la
 *    cible invisible d'un pays de moins de 10 px à l'écran ;
 * 4. sinon le tracé le plus proche à moins de 12 px (sondes en couronnes) ;
 * null si rien.
 * Décision « Toucher sur la terre ferme » : sur un tracé, ce qu'on voit sous
 * le doigt est ce qui compte. Un disque voisin gagnait d'abord à 11 px de son
 * centre (7,5 px hors du disque dessiné) : il prenait la moitié de l'Italie
 * au zoom 4 (un tiers désormais), et pick, donc noter, comptait juste pour
 * Trinité un toucher sur le Venezuela. La cible invisible d'un autre pays ne
 * l'emporte jamais sur un tracé sous le doigt : au zoom 1, celle du Maroc
 * prenait le centre de l'Algérie, celle de Trinité une côte du Venezuela au
 * zoom 8 (relecture du J0). En mer, les cibles de 44 px restent.
 */
export function pick(ctx: ContexteCarte, x: number, y: number): ResultatPick | null {
  const disques = ctx.pastilles.filter((p) => p.visible);
  const d = pastilleLaPlusProche(disques, ctx.t, x, y);
  const e = sousLePoint(ctx, x, y);
  if (e) {
    const id = e.pays.id;
    const b = ctx.proj(e.pays.point);
    const [px, py] = b ? versEcran(ctx.t, b[0], b[1]) : [Infinity, Infinity];
    const dPropre = Math.hypot(px - x, py - y);
    if (d && d.id !== id && d.distance_px <= PASTILLE.rayon_sur_trace_px && d.distance_px < dPropre) {
      return { id: d.id, via: 'pastille', distance_px: d.distance_px };
    }
    const propre = disques.find((p) => p.id === id);
    if (propre && dPropre <= PASTILLE.rayon_sur_trace_px) return { id, via: 'pastille', distance_px: dPropre };
    return { id, via: 'trace', distance_px: 0 };
  }
  const p = pastilleLaPlusProche(ctx.pastilles, ctx.t, x, y);
  if (p) return { id: p.id, via: 'pastille', distance_px: p.distance_px };
  for (const [sx, sy, r] of sondes(x, y)) {
    const voisin = sousLePoint(ctx, sx, sy);
    if (voisin) return { id: voisin.pays.id, via: 'proche', distance_px: r };
  }
  return null;
}

/** Les points des sondes autour de (x, y), dans l'ordre où pick() les essaie : [x, y, rayon]. */
function* sondes(x: number, y: number): Generator<[number, number, number]> {
  for (const r of SONDES_PROCHE.rayons_px) {
    for (let i = 0; i < SONDES_PROCHE.directions; i++) {
      const a = (2 * Math.PI * i) / SONDES_PROCHE.directions;
      yield [x + r * Math.cos(a), y + r * Math.sin(a), r];
    }
  }
}

/**
 * Sondes fines d'un toucher sur la terre dans une question de mer : tous les
 * rayons de 1 à 12 px (le dernier de SONDES_PROCHE), du plus près au plus
 * loin, assez de directions pour moins de 1,5 px entre deux points (8 au
 * moins, celles de pick comprises) : [x, y, rayon]. Les seules couronnes de
 * 4, 8 et 12 px laissaient passer une mer de 2 px (Azov au zoom 1) entre
 * leurs points, et rien n'était sondé sous 4 px (relecture du lot 3a).
 */
function* sondesFines(x: number, y: number): Generator<[number, number, number]> {
  const max = SONDES_PROCHE.rayons_px[SONDES_PROCHE.rayons_px.length - 1]!;
  const pas = SONDES_PROCHE.directions;
  for (let r = 1; r <= max; r++) {
    const n = pas * Math.ceil((2 * Math.PI * r) / (pas * 1.5));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      yield [x + r * Math.cos(a), y + r * Math.sin(a), r];
    }
  }
}

/** Le disque de 12 px autour d'un toucher, sur la sphère : son rayon (km, 25 % de marge) et ses marges d'emprise (degrés). */
interface Disque {
  rayon: number;
  /** Marge de longitude d'aPortee (la latitude bornée à 89°). */
  marge: number;
  /** Marges sûres en latitude et en longitude (Infinity : le disque peut toucher un pôle, toutes les longitudes). */
  lat: number;
  lon: number;
}

/** Le disque de 12 px autour de (x, y), ll sous le doigt ; null si son cercle sort de la sphère. */
function disque(ctx: ContexteCarte, ll: [number, number], x: number, y: number): Disque | null {
  const max = SONDES_PROCHE.rayons_px[SONDES_PROCHE.rayons_px.length - 1]!;
  let rayon = 0;
  for (let i = 0; i < 16; i++) {
    const a = (2 * Math.PI * i) / 16;
    const l2 = versLonLat(ctx.proj, ctx.t, x + max * Math.cos(a), y + max * Math.sin(a));
    if (!l2) return null;
    rayon = Math.max(rayon, geoDistance(ll, l2) * RAYON_TERRE_KM);
  }
  rayon *= 1.25;
  // En degrés, assez large pour l'emprise (la longitude se resserre vers les pôles).
  const deg = (rayon / RAYON_TERRE_KM) * (180 / Math.PI);
  const haut = Math.abs(ll[1]) + deg;
  const lat = Math.min(89, haut);
  return { rayon, marge: deg / Math.cos((lat * Math.PI) / 180), lat: deg, lon: haut >= 89 ? Infinity : deg / Math.cos((haut * Math.PI) / 180) };
}

/**
 * Les zones qui peuvent avoir un point à 12 px ou moins de (x, y) : celles
 * qui contiennent ll (débordant sur la terre), ou dont le bord est plus près
 * (géodésique) que le cercle de 12 px, avec 25 % de marge ; toutes si ce
 * cercle sort de la sphère (d null). Les sondes fines ne parcourent qu'elles.
 */
function aPortee(zones: readonly Entite<Mer>[], ll: [number, number], d: Disque | null): readonly Entite<Mer>[] {
  if (!zones.length || !d) return zones;
  return zones.filter((m) => dansEmprise(m.pays.bbox, ll[0], ll[1], d.marge) && (contient(m.forme, m.pays.bbox, ll) || distanceAuBordKm(m.forme, ll) <= d.rayon));
}

/**
 * Les pays qui peuvent avoir un point dans le disque (leur emprise, avec la
 * marge de contient, croise la sienne, l'antiméridien passé : Wallis à 2° de
 * Fidji) ; tous s'il sort de la sphère. Une sonde ne cherche sa terre que
 * parmi eux, au lieu des 258 emprises.
 */
function terresAPortee(ctx: ContexteCarte, ll: [number, number], d: Disque | null): readonly Entite<Lieu>[] {
  if (!d) return ctx.entites;
  const [lat, lon] = [0.05 + d.lat, 0.05 + d.lon];
  return ctx.entites.filter(({ pays: { bbox } }) =>
    ll[1] >= bbox[1] - lat && ll[1] <= bbox[3] + lat && (lon >= 180 || dansEmprise(bbox, ll[0], ll[1], lon) || dansEmprise(bbox, ll[0] - 360, ll[1], lon) || dansEmprise(bbox, ll[0] + 360, ll[1], lon)),
  );
}

/** La zone marine qui contient le point [lon, lat] (la couche est une partition : une au plus, bords mis à part). */
function zoneMer(mers: readonly Entite<Mer>[], ll: [number, number]): Entite<Mer> | null {
  for (const m of mers) if (contient(m.forme, m.pays.bbox, ll)) return m;
  return null;
}

/**
 * La mer qu'on voit en (x, y) : la zone qui contient le point, hors des
 * terres. Les zones débordent sur 0,79 % des terres (étude J2, § 2.3) ; le
 * dessin les efface sous les tracés des pays (dessinerMarquesMers), un point
 * sous une terre n'est donc pas de la mer.
 */
function merVisible(ctx: ContexteCarte, mers: readonly Entite<Mer>[], x: number, y: number): Entite<Mer> | null {
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  const m = ll ? zoneMer(mers, ll) : null;
  return m && !sousLePoint(ctx, x, y) ? m : null;
}

/**
 * La première sonde fine (sondesFines : tous les rayons de 1 à 12 px, la plus
 * proche d'abord) qui tombe dans la mer qu'on voit d'une des zones, via
 * « proche » ; null si aucune. Les 384 sondes ne cherchent que parmi les
 * zones et les pays à portée du disque, et contient n'examine que les arêtes
 * de la tranche de longitude du point : ≈ 3 ms au pire sur le PC, au lieu de
 * 40 à 220 ms quand chaque sonde passait l'Atlantique ou l'Arctique entier
 * par geoContains (mesure du 12/11, tests/mers-toucher-cout.test.ts).
 */
function eauProche(ctx: ContexteCarte, zones: readonly Entite<Mer>[], ll: [number, number], x: number, y: number): ResultatPick | null {
  const d = zones.length ? disque(ctx, ll, x, y) : null;
  const vises = aPortee(zones, ll, d);
  if (!vises.length) return null;
  const terres = terresAPortee(ctx, ll, d);
  for (const [sx, sy, r] of sondesFines(x, y)) {
    const lls = versLonLat(ctx.proj, ctx.t, sx, sy);
    const m = lls ? zoneMer(vises, lls) : null;
    if (m && !terres.some((e) => contient(e.forme, e.pays.bbox, lls!))) return { id: m.pays.id, via: 'proche', distance_px: r };
  }
  return null;
}

/**
 * Ce que la carte désigne en (x, y) dans une question de mer (étude J2,
 * § 4.4) ; cible : la zone marine demandée ; compte : les zones qui comptent
 * pour elle (elle, ce qu'elle allume, ses zones admises : noter).
 * 1. le doigt dans l'eau d'une zone qui compte : elle, via « trace » ;
 * 2. le doigt sur une terre (le tracé d'un pays ; le disque d'un micro-État
 *    n'en est pas, Malte en pleine Méditerranée est en mer) : cette terre,
 *    sauf si une sonde à 12 px ou moins (sondesFines : tous les rayons de 1
 *    à 12 px, la plus proche d'abord) tombe dans la mer qu'on voit d'une zone
 *    qui compte : elle, via « proche », la tolérance de la côte d'un pays
 *    touchée en mer, sans laisser passer une petite mer. La terre gagne
 *    toujours au-delà de 12 px : un toucher au milieu de l'Italie n'est pas
 *    l'Adriatique, même là où une zone déborde sur la terre ;
 * 3. le doigt dans l'eau d'une autre zone : cette zone ; mais si la cible
 *    fait moins de 10 px à l'écran (tailleEcranPx, au zoom du moment : la
 *    mer d'Azov fait ≈ 2 px au zoom 1), le halo de 12 px d'abord : la règle
 *    de la terre, mêmes sondes, sur l'eau de cette autre zone (Azov touchée
 *    à 5 px de son eau dans la mer Noire est juste). Choix de l'utilisateur
 *    du 12/11 : un seul nombre, 12 px, comme la côte, au lieu d'une cible
 *    invisible de 22 px au point d'étiquette ; dès que la cible dépasse
 *    10 px (en zoomant), seule l'eau qu'on voit compte ;
 * 4. sinon (fentes le long des côtes : 0,20 % de la mer ; la couche légère,
 *    qui ne couvre que 99,39 %) le halo d'une petite cible d'abord, comme
 *    en 3 (une fente se voit comme de l'eau : l'Adriatique au zoom 1 touchée
 *    dans une fente à 0,25 px de son eau était fausse, relecture), puis la
 *    zone la plus proche par les sondes de pick ;
 * null hors de la sphère, ou loin de toute zone.
 */
export function pickMer(ctx: ContexteCarte, cible: string, x: number, y: number, compte: ReadonlySet<string> = new Set([cible])): ResultatPick | null {
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  if (!ll) return null;
  const mers = ctx.mers ?? [];
  const comptent = () => mers.filter((m) => compte.has(m.pays.id));
  const terre = sousLePoint(ctx, x, y);
  if (terre) {
    // Seules les zones qui comptent sont cherchées : la mer qu'on voit d'une
    // autre zone ne change rien (la terre reste la terre).
    return eauProche(ctx, comptent(), ll, x, y) ?? { id: terre.pays.id, via: 'trace', distance_px: 0 };
  }
  const m = zoneMer(mers, ll);
  if (m && compte.has(m.pays.id)) return { id: m.pays.id, via: 'trace', distance_px: 0 };
  const visee = mers.find((z) => z.pays.id === cible);
  const halo = visee && tailleEcranPx(visee.pays, ctx.proj.scale(), ctx.t.k) < PASTILLE.seuil_px ? eauProche(ctx, comptent(), ll, x, y) : null;
  if (halo) return halo;
  if (m) return { id: m.pays.id, via: 'trace', distance_px: 0 };
  for (const [sx, sy, r] of sondes(x, y)) {
    const v = merVisible(ctx, mers, sx, sy);
    if (v) return { id: v.pays.id, via: 'proche', distance_px: r };
  }
  return null;
}

export interface Note {
  juste: boolean;
  /** Ce qui rend la réponse juste : le tracé de la cible, ou pick() qui la désigne ; null si fausse. */
  via: Via | null;
  /** 0 si juste ; sinon distance géodésique au bord de la cible ; null hors de la sphère. */
  distance_km: number | null;
  lonlat: [number, number] | null;
  /**
   * Ce que la carte désigne en (x, y) : pick(), calculé une fois pour la note
   * et la rétroaction ; pickMer() pour une cible marine (une mer, ou la terre
   * touchée).
   */
  pick: ResultatPick | null;
  /**
   * Juste hors du tracé de la cible : la zone contestée ou l'enclave touchée
   * qui compte pour elle, ou la partie d'une mer (la mer des Caraïbes pour
   * l'Atlantique : rétroaction « Juste (…) ») ; null sinon.
   */
  admis: Admis | null;
}

export interface OptionsNoter {
  /**
   * Admettre les zones contestées et les enclaves de ctx.acceptes (défaut :
   * oui ; les épreuves classées aussi depuis le 09/11/2026, décision « Zones
   * contestées et enclaves »). Non : le de fait strict. Une table : celles de
   * ctx.acceptes, puis ces zones en plus, passées par la vue du sujet joué
   * (étude J2 § 2.2) et jamais mises dans la table commune : Jérusalem ↔
   * Jérusalem-Est sous Capitales (D36 i), les jumeaux d'un drapeau sous
   * Drapeaux (D41 d), les parties d'une mer sous Mers (D43, sorte partie :
   * zonesParties, mers.ts). Pour une cible marine, ce qu'elle allume compte
   * toujours, même avec false (l'Atlantique et la mer des Sargasses).
   */
  acceptes?: boolean | Acceptes;
}

/**
 * Notation par rapport à la cible demandée (plan, « Technique » : « dedans, ou
 * dans la tolérance d'un micro-État ») : juste si le point est dans le tracé de
 * la cible, ou si pick(x, y) la désigne (son disque dessiné, sa cible en mer,
 * sa côte à moins de 12 px). Jamais juste sur le tracé d'un autre pays que la
 * carte désigne : avant, la cible de 22 px de la pastille jouait même là, et
 * l'essai du J0 comptait juste un toucher sur l'Albanie pour Andorre.
 * Sur le tracé d'un voisin, la tolérance d'un micro-État est donc son disque
 * dessiné et ~3 px de marge (pick, règle 1) : dans Rome, à 5 px du centre du
 * disque du Vatican, juste pour le Vatican comme pour l'Italie (pick y désigne
 * le Vatican, la rétroaction d'une réponse juste montre la cible) ; à 8 px,
 * l'Italie seule.
 * Les zones de ctx.acceptes comptent aussi (décision « Zones contestées et
 * enclaves ») : un toucher en Crimée est juste pour l'Ukraine, à Baïkonour pour
 * le Kazakhstan, et Note.admis dit pourquoi. Faux, la distance est celle du
 * bord le plus proche de l'union (la cible et ses zones admises) : le Maroc
 * s'arrête au bord est du Sahara occidental.
 */
export function noter(ctx: ContexteCarte, cible: string, x: number, y: number, options: OptionsNoter = {}): Note {
  if (couche(ctx, cible) === 'mers') return noterMer(ctx, cible, x, y, options);
  const e = ctx.entites.find((en) => en.pays.id === cible);
  if (!e) throw new Error(`cible inconnue : ${cible}`);
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  const p = pick(ctx, x, y);
  const base = { lonlat: ll, pick: p };
  if (ll && contient(e.forme, e.pays.bbox, ll)) return { juste: true, via: 'trace', distance_km: 0, admis: null, ...base };
  if (p?.id === cible) return { juste: true, via: p.via, distance_km: 0, admis: null, ...base };
  const enPlus = typeof options.acceptes === 'object' ? (options.acceptes.get(cible) ?? []) : [];
  const zones = options.acceptes === false ? [] : [...(ctx.acceptes?.get(cible) ?? []), ...enPlus];
  const admis = (z: (typeof zones)[number]): Admis => ({ zone: z.zone, tenant: z.tenant, sorte: z.sorte });
  if (ll) {
    const z = zones.find((zo) => contient(zo.forme, zo.bbox, ll));
    if (z) return { juste: true, via: z.entite && p?.id === z.zone ? p.via : 'trace', distance_km: 0, admis: admis(z), ...base };
  }
  // Une entité admise que la carte désigne sans que le doigt y soit : sa côte
  // à moins de 12 px (sonde), comme pour la cible elle-même.
  const z = p ? zones.find((zo) => zo.entite && zo.zone === p.id) : undefined;
  if (z && p) return { juste: true, via: p.via, distance_km: 0, admis: admis(z), ...base };
  // En mer (rien sous le doigt ni disque), une zone hachurée admise que la
  // première sonde touche compte comme la côte du tenant (relecture du lot 4) :
  // une île des Kouriles à 3 px du doigt au zoom 8, que pick désigne « proche »
  // pour la Russie, est juste aussi pour le Japon, Mayotte pour les Comores.
  // Mêmes sondes, même ordre : à chaque point, la zone d'abord, puis le tracé
  // d'un autre pays, qui arrête (c'est lui que la carte désigne).
  if (zones.length > 0 && (!p || p.via === 'proche')) {
    for (const [sx, sy] of sondes(x, y)) {
      const lls = versLonLat(ctx.proj, ctx.t, sx, sy);
      if (!lls) continue;
      const zs = zones.find((zo) => !zo.entite && contient(zo.forme, zo.bbox, lls));
      if (zs) return { juste: true, via: 'proche', distance_km: 0, admis: admis(zs), ...base };
      if (ctx.entites.some((en) => contient(en.forme, en.pays.bbox, lls))) break;
    }
  }
  let distance_km: number | null = null;
  if (ll) {
    distance_km = distanceAuBordKm(e.forme, ll);
    for (const zo of zones) distance_km = Math.min(distance_km, distanceAuBordKm(zo.forme, ll));
  }
  return { juste: false, via: null, distance_km, admis: null, ...base };
}

/** Ids de mers.json : 3 à 8 lettres minuscules (étude J2, § 2.3) ; aucun id de pays.json ni de commune n'y ressemble. */
const ID_MER = /^[a-z]{3,8}$/;

/**
 * La couche de la cible, par l'index commun (lieux.ts) ; sans index, entites
 * puis mers. Une cible inconnue lève une erreur, comme toujours ; une cible
 * marine avant la pose de la couche aussi, qui le dit (une partie de mers ne
 * part qu'après chargerMers et prendreMers : lot 3b).
 */
function couche(ctx: ContexteCarte, cible: string): CoucheLieu {
  const li = ctx.lieux?.get(cible);
  if (li) return li.couche;
  if (ctx.entites.some((en) => en.pays.id === cible)) return 'pays';
  if (ctx.mers?.some((m) => m.pays.id === cible)) return 'mers';
  if (ID_MER.test(cible) && !ctx.mers?.length) throw new Error(`cible marine avant la couche marine : ${cible} (chargerMers puis prendreMers)`);
  throw new Error(`cible inconnue : ${cible}`);
}

/**
 * Notation d'une cible marine (étude J2, § 4.4) : juste si pickMer désigne
 * la cible ou ce qu'elle allume (zonesAllumees : l'Atlantique et la mer des
 * Sargasses, ce qui s'allume est ce qui est noté ; toujours, même sans zones
 * admises), ou une zone admise (OptionsNoter.acceptes : les parties d'une mer,
 * Note.admis). Faux, la distance est celle du bord le plus proche de l'union
 * (la cible, ce qu'elle allume, ses zones admises), comme pour le Maroc et le
 * Sahara occidental : la mer voisine touchée est à ≈ 0 km, la terre à la
 * distance de la côte grossière. Juste ou faux, sans points (décision
 * « Barème et classements », 12/11).
 */
function noterMer(ctx: ContexteCarte, cible: string, x: number, y: number, options: OptionsNoter): Note {
  const mers = ctx.mers ?? [];
  const allumees = zonesAllumees(cible, mers.map((m) => m.pays));
  const enPlus = typeof options.acceptes === 'object' ? (options.acceptes.get(cible) ?? []) : [];
  const zones: readonly ZoneAdmise[] = options.acceptes === false ? [] : [...(ctx.acceptes?.get(cible) ?? []), ...enPlus];
  const ll = versLonLat(ctx.proj, ctx.t, x, y);
  const p = pickMer(ctx, cible, x, y, new Set([...allumees, ...zones.map((z) => z.zone)]));
  const base = { lonlat: ll, pick: p };
  if (p && allumees.includes(p.id)) return { juste: true, via: p.via, distance_km: 0, admis: null, ...base };
  const z = p ? zones.find((zo) => zo.zone === p.id) : undefined;
  if (z && p) return { juste: true, via: p.via, distance_km: 0, admis: { zone: z.zone, tenant: z.tenant, sorte: z.sorte }, ...base };
  let distance_km: number | null = null;
  if (ll) {
    distance_km = Infinity;
    for (const m of mers) if (allumees.includes(m.pays.id)) distance_km = Math.min(distance_km, distanceAuBordKm(m.forme, ll));
    for (const zo of zones) distance_km = Math.min(distance_km, distanceAuBordKm(zo.forme, ll));
  }
  return { juste: false, via: null, distance_km, admis: null, ...base };
}
