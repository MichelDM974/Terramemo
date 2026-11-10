import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { geoContains, geoDistance } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { ENCLAVES } from '../src/map/acceptes';
import { normaliser } from '../src/texte';
import { textes } from '../src/vues/textes';

// Capitales des pays (étude J2, § 2.1 ; geodata/capitales.mjs, lot 1) : tests sans réseau
// sur les fichiers versionnés, l'extrait Wikidata figé et la table à la main.

type Role = 'officielle' | 'siege' | 'economique';

interface Capitale {
  q: string;
  lon: number;
  lat: number;
  role: Role;
  p?: 1;
  e?: 1;
}

interface Ligne {
  pays: string;
  c: Capitale[];
  m?: 1;
  x?: string[];
}

interface Mesure {
  wikipedias: number;
  rang_wikipedias: number;
  vues_fr: number;
  rang_vues: number;
}

interface Main {
  pays: Record<string, { source: string }>;
  noms: Record<string, { nom: string; source: string }>;
  alias: Record<string, { alias: string[]; source: string }>;
  points: Record<string, { lon: number; lat: number; source: string }>;
  non_retenues: Record<string, { pays: string; nom: string; source: string }>;
  meme_nom: Record<string, string>;
  sans_leurre: Record<string, { x: string[]; source: string }>;
  epreuve: Record<string, { q: string; mesures: Record<string, Mesure>; source: string }>;
  items_pays: Record<string, { q: string; source: string }>;
  doublons: Record<string, string>;
}

interface SourceWikidata {
  url: string;
  licence: string;
  telecharge_le: string;
  requetes: { chemin: string; sha256: string };
  fichiers: { chemin: string; sha256: string }[];
}

interface Sources {
  sources: { url: string }[];
  traitement: { entrees: Record<string, string> };
}

type Props = { id: string };

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const empreinte = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

const texteCapitales = readFileSync('public/geo/capitales.json', 'utf8');
const texteFr = readFileSync('public/geo/capitales.fr.json', 'utf8');
const capitales = JSON.parse(texteCapitales) as Ligne[];
const { noms, alias } = JSON.parse(texteFr) as { noms: Record<string, string>; alias: Record<string, string[]> };
const main = lire<Main>('geodata/capitales-main.json');
const extrait = lire<{ extrait_le: string; date: string; requetes_sha256: string }>('geodata/wikidata/capitales.json');
const sources = lire<Sources>('public/geo/sources.json');
const pays = lire<{ id: string; statut: string; revendique_par?: string[] }[]>('public/geo/pays.json');
const nomsPays = lire<Record<string, string>>('public/geo/noms.fr.json');
const contestees = lire<{ id: string; dans: string[]; revendique_par: string[] }[]>('public/geo/contestees.json');

const parPays = new Map(capitales.map((l) => [l.pays, l]));
const nomsDe = (id: string) => (parPays.get(id)?.c ?? []).map((c) => noms[c.q]);
const toutes = capitales.flatMap((l) => l.c.map((c) => ({ ...c, pays: l.pays })));

// Toutes les capitales, figées : « Qid nom @lon,lat » dans l'ordre du fichier, séparées par
// « | ». Un nouvel extrait (npm run wikidata) qui change une capitale (P36 vandalisé,
// Sydney pour l'Australie), son nom (libellé de Wikidata) ou la déplace se voit en CI,
// même quand elle reste dans son pays (S38 ne le voit pas). Les points se comparent à
// TOLERANCE_KM près : une coordonnée affinée dans Wikidata passe, une autre ville non.
const CAPITALES: Record<string, string> = {
  AFG: 'Q5838 Kaboul @69.17,34.53',
  AGO: 'Q3897 Luanda @13.23,-8.81',
  ALB: 'Q19689 Tirana @19.82,41.33',
  AND: 'Q1863 Andorre-la-Vieille @1.52,42.51',
  ARE: 'Q1519 Abou Dabi @54.4,24.45',
  ARG: 'Q1486 Buenos Aires @-58.38,-34.6',
  ARM: 'Q1953 Erevan @44.51,40.18',
  ATG: "Q36262 Saint John's @-61.84,17.12",
  AUS: 'Q3114 Canberra @149.13,-35.29',
  AUT: 'Q1741 Vienne @16.37,48.21',
  AZE: 'Q9248 Bakou @49.84,40.37',
  BDI: 'Q167551 Gitega @29.93,-3.43 | Q3854 Bujumbura @29.36,-3.38',
  BEL: 'Q239 Bruxelles @4.35,50.85',
  BEN: 'Q3799 Porto-Novo @2.62,6.48 | Q43595 Cotonou @2.42,6.37',
  BFA: 'Q3777 Ouagadougou @-1.53,12.37',
  BGD: 'Q1354 Dacca @90.39,23.73',
  BGR: 'Q472 Sofia @23.32,42.7',
  BHR: 'Q3882 Manama @50.58,26.22',
  BHS: 'Q2467 Nassau @-77.34,25.08',
  BIH: 'Q11194 Sarajevo @18.41,43.86',
  BLR: 'Q2280 Minsk @27.56,53.9',
  BLZ: 'Q3043 Belmopan @-88.77,17.25',
  BOL: 'Q2907 Sucre @-65.26,-19.05 | Q1491 La Paz @-68.13,-16.5',
  BRA: 'Q2844 Brasilia @-47.88,-15.79',
  BRB: 'Q36168 Bridgetown @-59.62,13.1',
  BRN: 'Q9279 Bandar Seri Begawan @114.92,4.92',
  BTN: 'Q9270 Thimphou @89.63,27.47',
  BWA: 'Q3919 Gaborone @25.91,-24.66',
  CAF: 'Q3832 Bangui @18.56,4.37',
  CAN: 'Q1930 Ottawa @-75.69,45.42',
  CHE: 'Q70 Berne @7.45,46.95',
  CHL: 'Q2887 Santiago @-70.65,-33.44',
  CHN: 'Q956 Pékin @116.41,39.9',
  CIV: 'Q3768 Yamoussoukro @-5.27,6.82 | Q1515 Abidjan @-4.03,5.34',
  CMR: 'Q3808 Yaoundé @11.52,3.86',
  COD: 'Q3838 Kinshasa @15.31,-4.32',
  COG: 'Q3844 Brazzaville @15.27,-4.27',
  COL: 'Q2841 Bogota @-74.08,4.61',
  COM: 'Q3901 Moroni @43.25,-11.7',
  CPV: 'Q3751 Praia @-23.51,14.92',
  CRI: 'Q3070 San José @-84.08,9.93',
  CUB: 'Q1563 La Havane @-82.36,23.14',
  CYP: 'Q3856 Nicosie @33.37,35.17',
  CZE: 'Q1085 Prague @14.42,50.09',
  DEU: 'Q64 Berlin @13.38,52.52',
  DJI: 'Q3604 Djibouti @43.15,11.6',
  DMA: 'Q36281 Roseau @-61.38,15.3',
  DNK: 'Q1748 Copenhague @12.57,55.68',
  DOM: 'Q34820 Saint-Domingue @-69.94,18.46',
  DZA: 'Q3561 Alger @3.06,36.78',
  ECU: 'Q2900 Quito @-78.51,-0.22',
  EGY: 'Q85 Le Caire @31.24,30.04',
  ERI: 'Q3642 Asmara @38.92,15.33',
  ESP: 'Q2807 Madrid @-3.7,40.42',
  EST: 'Q1770 Tallinn @24.75,59.44',
  ETH: 'Q3624 Addis-Abeba @38.75,9.04',
  FIN: 'Q1757 Helsinki @24.94,60.17',
  FJI: 'Q38807 Suva @178.43,-18.13',
  FRA: 'Q90 Paris @2.35,48.86',
  FSM: 'Q42751 Palikir @158.19,6.92',
  GAB: 'Q3825 Libreville @9.44,0.41',
  GBR: 'Q84 Londres @-0.13,51.51',
  GEO: 'Q994 Tbilissi @44.79,41.72',
  GHA: 'Q3761 Accra @-0.2,5.56',
  GIN: 'Q3733 Conakry @-13.71,9.51',
  GMB: 'Q3726 Banjul @-16.58,13.45',
  GNB: 'Q3739 Bissau @-15.58,11.86',
  GNQ: 'Q1140136 Ciudad de la Paz @10.82,1.59 | Q3818 Malabo @8.77,3.75',
  GRC: 'Q1524 Athènes @23.73,37.98',
  GRD: 'Q41547 Saint-Georges @-61.75,12.05',
  GTM: 'Q1555 Guatemala @-90.51,14.64',
  GUY: 'Q10717 Georgetown @-58.15,6.81',
  HND: 'Q3238 Tegucigalpa @-87.2,14.11',
  HRV: 'Q1435 Zagreb @15.98,45.81',
  HTI: 'Q34261 Port-au-Prince @-72.34,18.55',
  HUN: 'Q1781 Budapest @19.04,47.5',
  IDN: 'Q3630 Jakarta @106.83,-6.18',
  IND: 'Q987 New Delhi @77.21,28.61',
  IRL: 'Q1761 Dublin @-6.26,53.35',
  IRN: 'Q3616 Téhéran @51.39,35.69',
  IRQ: 'Q1530 Bagdad @44.37,33.32',
  ISL: 'Q1764 Reykjavik @-21.93,64.15',
  ISR: 'Q1218 Jérusalem @35.23,31.78',
  ITA: 'Q220 Rome @12.48,41.89',
  JAM: 'Q34692 Kingston @-76.79,17.97',
  JOR: 'Q3805 Amman @35.93,31.93',
  JPN: 'Q1490 Tokyo @139.69,35.69',
  KAZ: 'Q1520 Astana @71.43,51.13',
  KEN: 'Q3870 Nairobi @36.82,-1.29',
  KGZ: 'Q9361 Bichkek @74.57,42.87',
  KHM: 'Q1850 Phnom Penh @104.92,11.57',
  KIR: 'Q131233 Tarawa-Sud @172.97,1.33',
  KNA: 'Q41295 Basseterre @-62.73,17.3',
  KOR: 'Q8684 Séoul @126.99,37.56',
  KWT: 'Q35178 Koweït @47.98,29.38',
  LAO: 'Q9326 Vientiane @102.63,17.98',
  LBN: 'Q3820 Beyrouth @35.51,33.89',
  LBR: 'Q3748 Monrovia @-10.8,6.31',
  LBY: 'Q3579 Tripoli @13.19,32.89',
  LCA: 'Q41699 Castries @-60.99,14.01',
  LIE: 'Q1844 Vaduz @9.52,47.14',
  LKA: 'Q41963 Sri Jayawardenapura Kotte @79.92,6.9 | Q35381 Colombo @79.86,6.93',
  LSO: 'Q3909 Maseru @27.48,-29.31',
  LTU: 'Q216 Vilnius @25.28,54.69',
  LUX: 'Q1842 Luxembourg @6.13,49.61',
  LVA: 'Q1773 Riga @24.11,56.95',
  MAR: 'Q3551 Rabat @-6.84,34.02',
  MCO: 'Q235 Monaco @7.42,43.73',
  MDA: 'Q21197 Chișinău @28.84,47.02',
  MDG: 'Q3915 Antananarivo @47.52,-18.91',
  MDV: 'Q9347 Malé @73.51,4.17',
  MEX: 'Q1489 Mexico @-99.14,19.35',
  MHL: 'Q12919 Majuro @171.38,7.09',
  MKD: 'Q384 Skopje @21.43,42',
  MLI: 'Q3703 Bamako @-7.99,12.65',
  MLT: 'Q23800 La Valette @14.51,35.9',
  MMR: 'Q37400 Naypyidaw @96.11,19.75',
  MNE: 'Q23564 Podgorica @19.26,42.44',
  MNG: 'Q23430 Oulan-Bator @106.91,47.92',
  MOZ: 'Q3889 Maputo @32.57,-25.97',
  MRT: 'Q3688 Nouakchott @-15.98,18.09',
  MUS: 'Q3929 Port-Louis @57.5,-20.16',
  MWI: 'Q3876 Lilongwe @33.77,-13.99',
  MYS: 'Q1865 Kuala Lumpur @101.7,3.15 | Q182378 Putrajaya @101.69,2.93',
  NAM: 'Q3935 Windhoek @17.08,-22.57',
  NER: 'Q3674 Niamey @2.12,13.52',
  NGA: 'Q3787 Abuja @7.49,9.06',
  NIC: 'Q3274 Managua @-86.27,12.15',
  NLD: 'Q727 Amsterdam @4.88,52.37 | Q36600 La Haye @4.31,52.08',
  NOR: 'Q585 Oslo @10.74,59.91',
  NPL: 'Q3037 Katmandou @85.32,27.71',
  NRU: 'Q31026 Yaren @166.92,-0.55',
  NZL: 'Q23661 Wellington @174.78,-41.29',
  OMN: 'Q3826 Mascate @58.59,23.61',
  PAK: 'Q1362 Islamabad @73.04,33.7',
  PAN: 'Q3306 Panama @-79.53,8.97',
  PER: 'Q2868 Lima @-77.04,-12.06',
  PHL: 'Q1461 Manille @120.98,14.6',
  PLW: 'Q515229 Ngerulmud @134.62,7.5',
  PNG: 'Q36526 Port Moresby @147.15,-9.48',
  POL: 'Q270 Varsovie @21.01,52.23',
  PRK: 'Q18808 Pyongyang @125.75,39.02',
  PRT: 'Q597 Lisbonne @-9.14,38.71',
  PRY: 'Q2933 Asuncion @-57.63,-25.28',
  PSE: 'Q212938 Jérusalem-Est @35.235,31.777 | Q158119 Ramallah @35.2,31.9',
  QAT: 'Q3861 Doha @51.53,25.29',
  ROU: 'Q19660 Bucarest @26.1,44.41',
  RUS: 'Q649 Moscou @37.62,55.75',
  RWA: 'Q3859 Kigali @30.11,-1.95',
  SAU: 'Q3692 Riyad @46.72,24.64',
  SDN: 'Q1963 Khartoum @32.53,15.6',
  SEN: 'Q3718 Dakar @-17.43,14.67',
  SGP: 'Q334 Singapour @103.8,1.3',
  SLB: 'Q40921 Honiara @159.95,-9.43',
  SLE: 'Q3780 Freetown @-13.24,8.49',
  SLV: 'Q3110 San Salvador @-89.19,13.7',
  SMR: 'Q1848 Saint-Marin @12.45,43.93',
  SOM: 'Q2449 Mogadiscio @45.34,2.04',
  SRB: 'Q3711 Belgrade @20.46,44.82',
  SSD: 'Q1947 Djouba @31.58,4.85',
  STP: 'Q3932 São Tomé @6.73,0.34',
  SUR: 'Q3001 Paramaribo @-55.17,5.87',
  SVK: 'Q1780 Bratislava @17.11,48.15',
  SVN: 'Q437 Ljubljana @14.51,46.05',
  SWE: 'Q1754 Stockholm @18.07,59.33',
  SWZ: 'Q3904 Mbabane @31.13,-26.32 | Q101418 Lobamba @31.21,-26.45',
  SYC: 'Q3940 Victoria @55.45,-4.62',
  SYR: 'Q3766 Damas @36.29,33.51',
  TCD: "Q3659 N'Djaména @15.05,12.11",
  TGO: 'Q3792 Lomé @1.22,6.13',
  THA: 'Q1861 Bangkok @100.52,13.75',
  TJK: 'Q9365 Douchanbé @68.79,38.57',
  TKM: 'Q23438 Achgabat @58.38,37.95',
  TLS: 'Q9310 Dili @125.58,-8.55',
  TON: 'Q38834 Nukuʻalofa @-175.2,-21.13',
  TTO: "Q39178 Port-d'Espagne @-61.52,10.67",
  TUN: 'Q3572 Tunis @10.18,36.8',
  TUR: 'Q3640 Ankara @32.84,39.94',
  TUV: 'Q34126 Funafuti @179.12,-8.5',
  TWN: 'Q1867 Taipei @121.56,25.04',
  TZA: 'Q3866 Dodoma @35.75,-6.18',
  UGA: 'Q3894 Kampala @32.58,0.31',
  UKR: 'Q1899 Kiev @30.52,50.45',
  URY: 'Q1335 Montevideo @-56.19,-34.91',
  USA: 'Q61 Washington @-77.04,38.9',
  UZB: 'Q269 Tachkent @69.28,41.31',
  VAT: 'Q237 Cité du Vatican @12.45,41.9',
  VCT: 'Q41474 Kingstown @-61.23,13.16',
  VEN: 'Q1533 Caracas @-66.91,10.51',
  VNM: 'Q1858 Hanoï @105.84,21.02',
  VUT: 'Q37806 Port-Vila @168.32,-17.73',
  WSM: 'Q36260 Apia @-171.83,-13.83',
  XKX: 'Q25270 Pristina @21.17,42.67',
  YEM: 'Q2471 Sanaa @44.2,15.35 | Q131694 Aden @45.03,12.8',
  ZAF: 'Q3926 Pretoria @28.19,-25.75 | Q5465 Le Cap @18.42,-33.93 | Q37701 Bloemfontein @26.22,-29.1',
  ZMB: 'Q3881 Lusaka @28.28,-15.42',
  ZWE: 'Q3921 Harare @31.05,-17.83',
};
const TOLERANCE_KM = 5;

// Les 12 pays à plusieurs réponses, figés (§ 2.1) : un changement de l'extrait ou de la table se voit.
const MULTIPLES: Record<string, string[]> = {
  BDI: ['Gitega', 'Bujumbura'],
  BEN: ['Porto-Novo', 'Cotonou'],
  BOL: ['Sucre', 'La Paz'],
  CIV: ['Yamoussoukro', 'Abidjan'],
  GNQ: ['Ciudad de la Paz', 'Malabo'],
  LKA: ['Sri Jayawardenapura Kotte', 'Colombo'],
  MYS: ['Kuala Lumpur', 'Putrajaya'],
  NLD: ['Amsterdam', 'La Haye'],
  PSE: ['Jérusalem-Est', 'Ramallah'],
  SWZ: ['Mbabane', 'Lobamba'],
  YEM: ['Sanaa', 'Aden'],
  ZAF: ['Pretoria', 'Le Cap', 'Bloemfontein'],
};

// D38 d : la capitale montrée en épreuve, la plus connue (Palestine : la principale), figée.
const EPREUVE: Record<string, string> = {
  BDI: 'Bujumbura',
  BEN: 'Porto-Novo',
  BOL: 'La Paz',
  CIV: 'Abidjan',
  GNQ: 'Malabo',
  LKA: 'Colombo',
  MYS: 'Kuala Lumpur',
  NLD: 'Amsterdam',
  PSE: 'Jérusalem-Est',
  SWZ: 'Mbabane',
  YEM: 'Sanaa',
  ZAF: 'Le Cap',
};

// D37 : les 9 pays dont la capitale porte le nom.
const MEME_NOM = ['DJI', 'GTM', 'KWT', 'LUX', 'MCO', 'PAN', 'SGP', 'SMR', 'VAT'];

describe('capitales (public/geo/capitales.json)', () => {
  it('197 entrées : les 195 jouables, le Kosovo et Taïwan, dans l’ordre de pays.json', () => {
    const jeu = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel').map((p) => p.id);
    expect(capitales.map((l) => l.pays)).toEqual(jeu);
    expect(capitales).toHaveLength(197);
    for (const id of ['XKX', 'TWN']) expect(parPays.has(id), id).toBe(true);
  });

  it('une principale officielle par pays, en tête ; des rôles connus ; 210 capitales justes (200 officielles, 9 sièges, 1 économique)', () => {
    for (const l of capitales) {
      expect(l.c.filter((c) => c.p).length, l.pays).toBe(1);
      expect(l.c[0]?.p, l.pays).toBe(1);
      expect(l.c[0]?.role, l.pays).toBe('officielle');
      for (const c of l.c) {
        expect(['officielle', 'siege', 'economique'], `${l.pays} ${c.q}`).toContain(c.role);
        expect(Object.keys(c).filter((k) => !['q', 'lon', 'lat', 'role', 'p', 'e'].includes(k)), c.q).toEqual([]);
      }
    }
    const roles: Record<string, number> = {};
    for (const c of toutes) roles[c.role] = (roles[c.role] ?? 0) + 1;
    expect(toutes).toHaveLength(210);
    expect(roles).toEqual({ officielle: 200, siege: 9, economique: 1 });
  });

  it('des items Wikidata bien formés, chacun dans un seul pays, et un nom non vide pour chacun', () => {
    for (const c of toutes) expect(c.q).toMatch(/^Q[1-9]\d*$/);
    expect(new Set(toutes.map((c) => c.q)).size).toBe(toutes.length);
    expect(Object.keys(noms).sort()).toEqual(toutes.map((c) => c.q).sort());
    for (const c of toutes) {
      expect(noms[c.q]?.trim(), c.q).toBeTruthy();
      expect(noms[c.q]?.[0], c.q).toBe(noms[c.q]?.[0]?.toLocaleUpperCase('fr'));
    }
    for (const [q, a] of Object.entries(alias)) {
      expect(noms[q], q).toBeDefined();
      expect(a.length, q).toBeGreaterThan(0);
      for (const x of a) expect(x.trim(), q).toBeTruthy();
    }
  });

  it('les 210 capitales figées (Qid, nom, point à 5 km près), pays par pays', () => {
    const lu = (x: string) => {
      const m = /^(Q\d+) (.+) @(-?[\d.]+),(-?[\d.]+)$/.exec(x);
      if (!m) throw new Error(`CAPITALES : « ${x} » mal formé`);
      return { q: m[1]!, nom: m[2]!, pt: [Number(m[3]), Number(m[4])] as [number, number] };
    };
    expect(Object.keys(CAPITALES)).toEqual(capitales.map((l) => l.pays));
    for (const l of capitales) {
      const attendu = CAPITALES[l.pays]!.split(' | ').map(lu);
      expect(l.c.map((c) => `${c.q} ${noms[c.q]}`), l.pays).toEqual(attendu.map((a) => `${a.q} ${a.nom}`));
      l.c.forEach((c, i) => {
        const d = geoDistance([c.lon, c.lat], attendu[i]!.pt) * 6371;
        expect(d, `${l.pays} ${noms[c.q]} à ${d.toFixed(1)} km du point figé`).toBeLessThanOrEqual(TOLERANCE_KM);
      });
    }
  });

  it('les 12 pays à plusieurs réponses, figés', () => {
    const multiples = Object.fromEntries(capitales.filter((l) => l.c.length > 1).map((l) => [l.pays, nomsDe(l.pays)]));
    expect(multiples).toEqual(MULTIPLES);
  });

  it('une capitale d’épreuve par pays : la principale quand il n’y en a qu’une, la plus connue sinon (D38 d), Palestine : la principale', () => {
    for (const l of capitales) {
      expect(l.c.filter((c) => c.e).length, l.pays).toBe(1);
      if (l.c.length === 1) expect(l.c[0]?.e, l.pays).toBe(1);
    }
    const epreuve = Object.fromEntries(capitales.filter((l) => l.c.length > 1).map((l) => [l.pays, noms[l.c.find((c) => c.e)!.q]]));
    expect(epreuve).toEqual(EPREUVE);
    // La règle, refaite sur les mesures figées dans la table : le plus petit rang combiné
    // (moyenne du rang par Wikipédias et du rang par vues), à égalité la principale.
    expect(Object.keys(main.epreuve).sort()).toEqual(Object.keys(MULTIPLES));
    for (const [id, t] of Object.entries(main.epreuve)) {
      const l = parPays.get(id)!;
      expect(l.c.find((c) => c.e)?.q, id).toBe(t.q);
      expect(Object.keys(t.mesures).sort(), id).toEqual(l.c.map((c) => c.q).sort());
      for (const m of Object.values(t.mesures)) {
        for (const r of [m.rang_wikipedias, m.rang_vues]) expect(r >= 1 && r <= 205, id).toBe(true);
      }
      const combine = (c: Capitale) => (t.mesures[c.q]!.rang_wikipedias + t.mesures[c.q]!.rang_vues) / 2;
      const plusConnue = [...l.c].sort((a, b) => combine(a) - combine(b) || (b.p ?? 0) - (a.p ?? 0))[0]!;
      const principale = l.c.find((c) => c.p)!;
      expect(t.q, id).toBe(id === 'PSE' ? principale.q : plusConnue.q);
      expect(t.source, id).toMatch(/^D38 d : /);
    }
    // La Palestine montre bien la principale alors que Ramallah est plus connue.
    const pse = main.epreuve.PSE!;
    expect(pse.mesures.Q158119!.rang_wikipedias + pse.mesures.Q158119!.rang_vues).toBeLessThan(
      pse.mesures.Q212938!.rang_wikipedias + pse.mesures.Q212938!.rang_vues,
    );
  });

  it('Israël : Jérusalem seule ; Palestine : Jérusalem-Est (principale) et Ramallah ; jamais l’une en leurre de l’autre', () => {
    expect(nomsDe('ISR')).toEqual(['Jérusalem']);
    expect(nomsDe('PSE')).toEqual(['Jérusalem-Est', 'Ramallah']);
    expect(parPays.get('PSE')?.c.map((c) => c.role)).toEqual(['officielle', 'siege']);
    expect(parPays.get('ISR')?.x).toEqual(['PSE']);
    expect(parPays.get('PSE')?.x).toEqual(['ISR']);
    expect(capitales.filter((l) => l.x).map((l) => l.pays)).toEqual(['ISR', 'PSE']);
  });

  it('Jérusalem et Jérusalem-Est à deux points distincts ; aucune capitale au point d’une autre', () => {
    const jer = parPays.get('ISR')!.c[0]!;
    const est = parPays.get('PSE')!.c[0]!;
    expect([jer.lon, jer.lat]).not.toEqual([est.lon, est.lat]);
    expect(geoDistance([jer.lon, jer.lat], [est.lon, est.lat]) * 6371).toBeGreaterThan(0.3);
    const points = toutes.map((c) => `${c.lon},${c.lat}`);
    expect(new Set(points).size).toBe(points.length);
  });

  it('coordonnées à 2 décimales, sauf un point de la table (Jérusalem-Est), gardé tel quel', () => {
    for (const c of toutes) {
      const pt = main.points[c.q];
      if (pt) expect([c.lon, c.lat], c.q).toEqual([pt.lon, pt.lat]);
      else expect([Number(c.lon.toFixed(2)), Number(c.lat.toFixed(2))], c.q).toEqual([c.lon, c.lat]);
      expect(Math.abs(c.lon) <= 180 && Math.abs(c.lat) <= 90, c.q).toBe(true);
    }
    expect(Object.keys(main.points)).toEqual(['Q212938']);
  });

  it('les 9 pays au nom de leur capitale (D37), marqués m', () => {
    expect(capitales.filter((l) => l.m).map((l) => l.pays)).toEqual(MEME_NOM);
    for (const id of MEME_NOM) {
      const n = normaliser(noms[parPays.get(id)!.c[0]!.q]!);
      const np = normaliser(nomsPays[id]!);
      // Le Vatican : « Cité du Vatican », dans « État de la Cité du Vatican ».
      if (id === 'VAT') expect(np.endsWith(n), id).toBe(true);
      else expect(n, id).toBe(np);
    }
    // Aucune autre capitale au nom de son pays (Tunis, Alger, Mexico restent des questions).
    for (const l of capitales.filter((x) => !x.m)) {
      for (const c of l.c) expect(normaliser(noms[c.q]!), l.pays).not.toBe(normaliser(nomsPays[l.pays]!));
    }
  });

  it('aucun homonyme exact entre pays ; aucun alias égal au nom d’une autre capitale ni à son propre nom', () => {
    const parNom = new Map<string, Set<string>>();
    for (const c of toutes) {
      const n = normaliser(noms[c.q]!);
      parNom.set(n, (parNom.get(n) ?? new Set()).add(c.pays));
    }
    expect([...parNom].filter(([, p]) => p.size > 1).map(([n]) => n)).toEqual([]);
    for (const [q, a] of Object.entries(alias)) {
      for (const x of a) {
        const n = normaliser(x);
        expect(n, `${q} ${x}`).not.toBe(normaliser(noms[q]!));
        const autres = toutes.filter((c) => c.q !== q && normaliser(noms[c.q]!) === n);
        expect(autres.map((c) => c.q), `${q} ${x}`).toEqual([]);
      }
    }
  });

  it('cas de D36 (défauts) et corrections de Wikidata', () => {
    const role = (id: string, nom: string) => parPays.get(id)?.c.find((c) => noms[c.q] === nom)?.role;
    expect(role('BDI', 'Bujumbura')).toBe('economique'); // a
    expect(nomsDe('TZA')).toEqual(['Dodoma']); // b
    expect(parPays.get('GNQ')?.c.map((c) => [noms[c.q], c.role, c.p ?? 0])).toEqual([
      ['Ciudad de la Paz', 'officielle', 1],
      ['Malabo', 'siege', 0],
    ]); // c
    expect(nomsDe('CHL')).toEqual(['Santiago']); // d
    expect(nomsDe('UKR')).toEqual(['Kiev']); // e
    expect(alias[parPays.get('UKR')!.c[0]!.q]).toContain('Kyiv');
    for (const [id, nom] of [
      ['IDN', 'Jakarta'],
      ['EGY', 'Le Caire'],
      ['MMR', 'Naypyidaw'],
      ['NRU', 'Yaren'],
      ['CHE', 'Berne'],
      ['KIR', 'Tarawa-Sud'],
      ['MNE', 'Podgorica'],
      ['HND', 'Tegucigalpa'],
      ['NIC', 'Managua'],
      ['NOR', 'Oslo'],
    ] as const) {
      expect(nomsDe(id), id).toEqual([nom]); // f, g, j et corrections
    }
    expect(alias[parPays.get('KIR')!.c[0]!.q]).toContain('Tarawa');
    expect(alias[parPays.get('HND')!.c[0]!.q]).toContain('Comayagüela');
    expect(parPays.get('NIC')?.c[0]?.q).toBe('Q3274');
    expect(noms[parPays.get('BOL')!.c.find((c) => c.p)!.q]).toBe('Sucre'); // h
    // Les capitales écartées (Natural Earth, D36) ne sont nulle part.
    for (const [q, n] of Object.entries(main.non_retenues)) {
      expect(toutes.some((c) => c.q === q), n.nom).toBe(false);
      expect(Object.values(noms).map(normaliser), n.nom).not.toContain(normaliser(n.nom));
    }
    // Usage français, graphies étrangères en alias.
    for (const [nom, a] of [
      ['Pékin', 'Beijing'],
      ['Dacca', 'Dhaka'],
    ] as const) {
      const c = toutes.find((x) => noms[x.q] === nom);
      expect(c, nom).toBeDefined();
      expect(alias[c!.q], nom).toContain(a);
    }
    for (const nom of ['Moscou', 'Le Caire', 'Asuncion', 'Bogota', 'Chișinău', 'Guatemala']) expect(Object.values(noms), nom).toContain(nom);
  });
});

describe('S38 : chaque capitale dans son pays ou près de lui (monde.topo.json)', () => {
  const topo = lire<Topology<{ pays: GeometryCollection<Props>; contestees: GeometryCollection<Props> }>>('public/geo/monde.topo.json');
  const formes = new Map(feature(topo, topo.objects.pays).features.map((f) => [f.properties.id, f]));
  const formesZ = new Map(feature(topo, topo.objects.contestees).features.map((f) => [f.properties.id, f]));
  const polys = (g: Geometry | null): Position[][][] =>
    !g ? [] : g.type === 'Polygon' ? [(g as Polygon).coordinates] : g.type === 'MultiPolygon' ? (g as MultiPolygon).coordinates : [];

  /** Distance (km) du point au bord de la forme (segments en plan local, comme tests/donnees.test.ts). */
  function distanceBordKm(f: Feature<Geometry | null, Props>, [x, y]: [number, number]): number {
    const k = Math.cos((y * Math.PI) / 180);
    const dlon = (lon: number) => (((lon - x + 540) % 360) - 180) * k;
    let min = Infinity;
    for (const p of polys(f.geometry))
      for (const r of p)
        for (let i = 1; i < r.length; i++) {
          const [a, b] = [r[i - 1] as [number, number], r[i] as [number, number]];
          const ax = dlon(a[0]);
          const ay = a[1] - y;
          const dx = dlon(b[0]) - ax;
          const dy = b[1] - y - ay;
          const l = dx * dx + dy * dy;
          const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
          min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
        }
    return ((min * Math.PI) / 180) * 6371.0088;
  }

  /**
   * Le tracé du pays et ses zones admises (décision « Zones contestées et enclaves »,
   * src/map/acceptes.ts) : zones hachurées qu'il tient ou revendique, entités qu'il
   * revendique, enclaves qu'il entoure.
   */
  function zones(id: string): Feature<Geometry, Props>[] {
    const ids = [
      ...contestees.filter((z) => z.dans.includes(id) || z.revendique_par.includes(id)).map((z) => formesZ.get(z.id)),
      ...pays.filter((p) => p.revendique_par?.includes(id)).map((p) => formes.get(p.id)),
      ...Object.entries(ENCLAVES)
        .filter(([, hote]) => hote === id)
        .map(([e]) => formes.get(e)),
    ];
    return [formes.get(id), ...ids].filter((f): f is Feature<Geometry, Props> => Boolean(f));
  }

  // Seuil mesuré le 11/11/2026 : 9,05 km au plus (Funafuti, atoll réduit par la
  // simplification à 2 km), puis Tarawa-Sud 7,7 km et Nukuʻalofa 3,8 km. L'étude
  // proposait 25 km ; 10 km suffit, sans exception, et attrape mieux une capitale
  // rattachée au mauvais pays.
  const SEUIL_KM = 10;

  it(`à moins de ${SEUIL_KM} km du tracé de son pays ou d’une de ses zones admises`, () => {
    const loin: string[] = [];
    let max = 0;
    for (const c of toutes) {
      const pt: [number, number] = [c.lon, c.lat];
      const z = zones(c.pays);
      expect(z.length, c.pays).toBeGreaterThan(0);
      const d = z.some((f) => geoContains(f, pt)) ? 0 : Math.min(...z.map((f) => distanceBordKm(f, pt)));
      max = Math.max(max, d);
      if (d > SEUIL_KM) loin.push(`${c.pays} ${noms[c.q]} ${d.toFixed(1)} km`);
    }
    expect(loin).toEqual([]);
    expect(max).toBeGreaterThan(5); // le seuil reste près de ce qu'il mesure
  });

  it('hors de son tracé et de ses zones admises, une capitale ne tombe dans aucun autre pays, sauf la Cité du Vatican (son point de Wikidata, 12,453 ; 41,904, tombe hors du tracé simplifié du Vatican, dans Rome, même non arrondi)', () => {
    const jouables = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel').map((p) => p.id);
    const chez: string[] = [];
    for (const c of toutes) {
      const pt: [number, number] = [c.lon, c.lat];
      // Jérusalem-Est est dans le tracé d'Israël, mais dans une zone admise de la Palestine.
      if (zones(c.pays).some((f) => geoContains(f, pt))) continue;
      const autres = jouables.filter((id) => id !== c.pays && geoContains(formes.get(id)!, pt));
      if (autres.length) chez.push(`${c.pays} ${noms[c.q]} → ${autres.join(',')}`);
    }
    expect(chez).toEqual(['VAT Cité du Vatican → ITA']);
  });

  it('Jérusalem-Est tombe dans le tracé d’Israël, dans la zone NE_B98 que revendique la Palestine (zone admise)', () => {
    const est = parPays.get('PSE')!.c[0]!;
    const pt: [number, number] = [est.lon, est.lat];
    expect(geoContains(formes.get('ISR')!, pt)).toBe(true);
    expect(geoContains(formesZ.get('NE_B98')!, pt)).toBe(true);
    expect(contestees.find((z) => z.id === 'NE_B98')?.revendique_par).toContain('PSE');
  });
});

describe('fichiers, sources et reproduction', () => {
  it('les deux fichiers ≤ 6 000 octets compressés (gzip)', () => {
    expect(gzipSync(texteCapitales).length).toBeLessThanOrEqual(6000);
    expect(gzipSync(texteFr).length).toBeLessThanOrEqual(6000);
  });

  it('source Wikidata : CC0, extrait daté, empreintes de l’extrait et des requêtes égales aux fichiers', () => {
    const s = sources.sources.find((x) => x.url === 'https://www.wikidata.org') as SourceWikidata | undefined;
    if (!s) throw new Error('source Wikidata absente de sources.json');
    expect(s.licence).toContain('CC0');
    expect(s.telecharge_le).toBe(extrait.date);
    expect(s.requetes).toEqual({ chemin: 'geodata/wikidata/requetes.rq', sha256: empreinte('geodata/wikidata/requetes.rq') });
    expect(extrait.requetes_sha256).toBe(s.requetes.sha256);
    expect(s.fichiers).toEqual([{ chemin: 'geodata/wikidata/capitales.json', sha256: empreinte('geodata/wikidata/capitales.json') }]);
    for (const f of ['geodata/capitales.mjs', 'geodata/capitales-main.json']) expect(sources.traitement.entrees[f], f).toBe(empreinte(f));
  });

  it('crédits : Wikidata, CC0, à la date de l’extrait', () => {
    const w = textes.credits.donnees.find((c) => c.nom === 'Wikidata');
    if (!w) throw new Error('Wikidata absente des crédits');
    const [a, m, j] = extrait.date.split('-');
    expect(w.detail).toBe(`Capitales et notoriété des lieux · extrait du ${j}/${m}/${a}`);
    expect(w.licence).toContain('CC0');
  });

  it('table à la main : une source par ligne', () => {
    for (const section of ['items_pays', 'pays', 'noms', 'alias', 'points', 'non_retenues', 'sans_leurre', 'epreuve'] as const) {
      for (const [k, v] of Object.entries(main[section])) if (k !== '_') expect((v as { source: string }).source, `${section} ${k}`).toMatch(/\S{3}/);
    }
    for (const section of ['meme_nom', 'doublons'] as const) for (const [k, v] of Object.entries(main[section])) expect(v, `${section} ${k}`).toMatch(/\S{3}/);
  });

  it('reproduction : construireCapitales (npm run geodata -- --seulement capitales) redonne les fichiers commités et sources.json', async () => {
    type Resultat = { fichiers: Record<string, string>; source: unknown; entrees: Record<string, string>; notes: string[] };
    // Import dynamique sans types : le module est en JavaScript, sans déclaration.
    const m = (await import('../geodata/capitales.mjs' as string)) as {
      construireCapitales: (racine: string) => Promise<Resultat>;
      fusionnerSources: (s: Sources, c: Resultat) => Sources;
    };
    const r = await m.construireCapitales('.');
    expect(r.fichiers['capitales.json']).toBe(texteCapitales);
    expect(r.fichiers['capitales.fr.json']).toBe(texteFr);
    expect(JSON.stringify(m.fusionnerSources(sources, r), null, 2) + '\n').toBe(readFileSync('public/geo/sources.json', 'utf8'));
    // Aucune ligne inutile dans la table (un nom déjà égal au libellé de Wikidata).
    expect(r.notes.filter((n) => n.includes('ligne inutile'))).toEqual([]);
  });

  it('une note « _ » dans n’importe quelle section de la table ne change rien aux sorties', async () => {
    // Copie des entrées dans un dossier jetable, avec une clé « _ » dans chaque section.
    const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const racine = mkdtempSync(join(tmpdir(), 'capitales-'));
    try {
      for (const f of ['geodata/capitales.mjs', 'geodata/wikidata/capitales.json', 'geodata/wikidata/requetes.rq', 'public/geo/pays.json', 'public/geo/noms.fr.json']) {
        mkdirSync(join(racine, f, '..'), { recursive: true });
        copyFileSync(f, join(racine, f));
      }
      const annote = Object.fromEntries(
        Object.entries(lire<Record<string, unknown>>('geodata/capitales-main.json')).map(([k, v]) => [k, typeof v === 'object' ? { _: 'note', ...v } : v]),
      );
      writeFileSync(join(racine, 'geodata/capitales-main.json'), JSON.stringify(annote));
      const m = (await import('../geodata/capitales.mjs' as string)) as {
        construireCapitales: (racine: string) => Promise<{ fichiers: Record<string, string> }>;
      };
      const r = await m.construireCapitales(racine);
      expect(r.fichiers['capitales.json']).toBe(texteCapitales);
      expect(r.fichiers['capitales.fr.json']).toBe(texteFr);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});
