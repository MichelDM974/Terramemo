import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { textesCredits } from '../src/vues/textes-credits';

// Drapeaux des pays (étude J2, § 2.2 ; geodata/drapeaux.mjs, lot 2) : tests sur les fichiers
// versionnés. Le calcul des sosies est refait ici sur les SVG versionnés, par le même
// resvg-wasm (S33 : même rendu sur le PC et en CI) ; la reproduction complète, depuis le
// paquet de flag-icons, ne tourne que là où geodata/raw/ l'a (pas en CI, sans réseau).

interface Ligne {
  pays: string;
  d: string[];
  j?: string[];
  s: [string, number][];
}

interface Manifeste {
  pays: Ligne[];
  familles: Record<string, string[]>;
}

interface Main {
  corrections: Record<string, { remplacer: [string, string][]; source: string }>;
  autres: Record<string, { de: string; source: string }>;
  jumeaux: { pays: [string, string]; source: string }[];
  familles: Record<string, { pays: string[]; source: string }>;
}

interface Source {
  nom: string;
  url: string;
  version: string;
  licence: string;
  telecharge_le: string;
  fichiers: { url: string; sha256: string }[];
}

interface Sources {
  sources: Source[];
  traitement: { entrees: Record<string, string> };
}

type Module = {
  manifeste: (lignes: { pays: string; d: string[] }[], textes: Map<string, string>, main: Main) => Promise<{ texte: string; proches: string; fautes: string[]; scores: Map<string, number> }>;
  fautesSvg: (texte: string) => string[];
  construireDrapeaux: (racine: string) => Promise<{ fichiers: Record<string, string>; svgs: Record<string, string>; sources: Source[]; entrees: Record<string, string> }>;
  chargerResvg: () => Promise<typeof import('@resvg/resvg-wasm').Resvg>;
};
// Import dynamique sans types : le module est en JavaScript, sans déclaration.
const module = import('../geodata/drapeaux.mjs' as string) as Promise<Module>;

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const empreinte = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const DOSSIER = 'public/geo/drapeaux';

const texteManifeste = readFileSync('public/geo/drapeaux.json', 'utf8');
const texteProches = readFileSync('public/geo/drapeaux-proches.json', 'utf8');
const { pays: lignes, familles } = JSON.parse(texteManifeste) as Manifeste;
const main = lire<Main>('geodata/drapeaux-main.json');
const sources = lire<Sources>('public/geo/sources.json');
const verrou = lire<Record<string, { telecharge_le: string; fichiers: Record<string, string> }>>('geodata/sources.lock.json');
const pays = lire<{ id: string; a2?: string; statut: string }[]>('public/geo/pays.json');
const parPays = new Map(lignes.map((l) => [l.pays, l]));
const fichiers = readdirSync(DOSSIER).sort();
const svg = (h: string) => readFileSync(`${DOSSIER}/${h}.svg`, 'utf8');
const textesSvg = new Map(fichiers.map((f) => [f.slice(0, -4), readFileSync(`${DOSSIER}/${f}`, 'utf8')]));

// Les 3 sosies de chaque pays, figés après relecture (11/11/2026) : « id score » du plus
// proche au moins proche, jumeaux exceptés, et un seul de chaque paire de jumeaux (le plus
// proche ; la Pologne : l'Indonésie, pas Monaco, puis Singapour et le Chili). Mêmes scores, paire par paire (19 306), que
// ressemblances3.py du relevé du 10/11 sur les mêmes drapeaux (Bolivie : le civil, ici
// montré ; Honduras : le bleu de 2026, corrigé). Un changement de flag-icons, de la table
// ou du rendu de resvg (S33) se voit ici.
const SOSIES: Record<string, string> = {
  AFG: 'PRT 0.56, TLS 0.58, KWT 0.6',
  AGO: 'EGY 0.37, IRQ 0.37, YEM 0.37',
  ALB: 'MAR 0.07, CHN 0.16, VNM 0.16',
  AND: 'TCD 0.03, MDA 0.11, BRB 0.34',
  ARE: 'PSE 0.26, JOR 0.3, SYR 0.42',
  ARG: 'FSM 0.31, BWA 0.32, SOM 0.32',
  ARM: 'VEN 0.08, COL 0.33, ECU 0.4',
  ATG: 'AGO 0.5, CHE 0.5, VNM 0.5',
  AUS: 'NZL 0.06, NRU 0.38, XKX 0.4',
  AUT: 'LVA 0.17, DNK 0.23, LBN 0.27',
  AZE: 'UZB 0.33, MWI 0.38, KEN 0.4',
  BDI: 'LBN 0.53, AUT 0.57, MMR 0.57',
  BEL: 'ROU 0.31, AND 0.35, SEN 0.35',
  BEN: 'PRT 0.36, COG 0.37, MLI 0.38',
  BFA: 'BLR 0.3, BOL 0.31, NER 0.32',
  BGD: 'SAU 0.3, TKM 0.39, NGA 0.43',
  BGR: 'LTU 0.33, POL 0.33, RUS 0.33',
  BHR: 'QAT 0.12, TON 0.25, CHN 0.26',
  BHS: 'BWA 0.4, KAZ 0.48, PLW 0.49',
  BIH: 'BRB 0.48, XKX 0.48, NZL 0.5',
  BLR: 'BFA 0.3, OMN 0.3, CHN 0.35',
  BLZ: 'XKX 0.53, BRB 0.58, NIC 0.59',
  BOL: 'GHA 0.04, ETH 0.19, BFA 0.31',
  BRA: 'STP 0.48, DMA 0.49, GUY 0.51',
  BRB: 'XKX 0.31, AND 0.34, ROU 0.38',
  BRN: 'VAT 0.67, BTN 0.68, COL 0.7',
  BTN: 'COL 0.44, MMR 0.46, ECU 0.52',
  BWA: 'ARG 0.32, SOM 0.33, FSM 0.34',
  CAF: 'LSO 0.6, UKR 0.64, COM 0.68',
  CAN: 'PER 0.32, TUR 0.36, TUN 0.41',
  CHE: 'MAR 0.15, TUR 0.16, CHN 0.17',
  CHL: 'POL 0.18, CZE 0.24, IDN 0.26',
  CHN: 'MAR 0.06, TUR 0.09, VNM 0.11',
  CIV: 'IRL 0.08, NGA 0.38, ITA 0.39',
  CMR: 'PRT 0.43, BGD 0.55, DZA 0.62',
  COD: 'SOM 0.36, FSM 0.39, MHL 0.46',
  COG: 'BEN 0.37, MLI 0.4, KNA 0.45',
  COL: 'ECU 0.22, VEN 0.26, ARM 0.33',
  COM: 'BEN 0.49, MMR 0.62, SLE 0.62',
  CPV: 'HND 0.35, NRU 0.35, XKX 0.35',
  CRI: 'CUB 0.4, PRK 0.42, KHM 0.43',
  CUB: 'CRI 0.4, KHM 0.53, SWZ 0.56',
  CYP: 'JPN 0.28, KOR 0.32, NPL 0.4',
  CZE: 'CHL 0.24, POL 0.28, RUS 0.31',
  DEU: 'MWI 0.44, KEN 0.46, UGA 0.53',
  DJI: 'AZE 0.45, GAB 0.56, LSO 0.57',
  DMA: 'BRA 0.49, SAU 0.5, NGA 0.58',
  DNK: 'LVA 0.1, AUT 0.23, TUR 0.24',
  DOM: 'WSM 0.47, LVA 0.49, TWN 0.52',
  DZA: 'PAK 0.44, MDG 0.53, NPL 0.53',
  ECU: 'COL 0.22, VEN 0.34, ARM 0.4',
  EGY: 'YEM 0.02, IRQ 0.05, SDN 0.27',
  ERI: 'OMN 0.38, AZE 0.46, JOR 0.54',
  ESP: 'KGZ 0.4, VNM 0.41, BOL 0.48',
  EST: 'SMR 0.46, THA 0.58, ARG 0.67',
  ETH: 'BOL 0.19, GHA 0.19, IRN 0.35',
  FIN: 'SVK 0.51, CYP 0.52, KOR 0.54',
  FJI: 'TUV 0.12, FSM 0.32, SOM 0.36',
  FRA: 'AND 0.38, ITA 0.38, PER 0.38',
  FSM: 'SOM 0.06, LCA 0.19, PLW 0.23',
  GAB: 'BOL 0.41, ETH 0.45, SWE 0.51',
  GBR: 'GEO 0.41, CAN 0.59, JPN 0.59',
  GEO: 'JPN 0.35, GBR 0.41, KOR 0.43',
  GHA: 'BOL 0.04, ETH 0.19, HUN 0.33',
  GIN: 'MLI 0.08, SEN 0.11, IRL 0.39',
  GMB: 'MUS 0.33, TJK 0.33, ARM 0.42',
  GNB: 'GIN 0.41, MOZ 0.48, SEN 0.48',
  GNQ: 'IRN 0.21, HUN 0.24, KWT 0.26',
  GRC: 'NIC 0.51, ARG 0.54, FSM 0.54',
  GRD: 'MDV 0.4, VNM 0.5, KGZ 0.51',
  GTM: 'LCA 0.28, PLW 0.33, SOM 0.35',
  GUY: 'STP 0.21, GIN 0.43, TGO 0.44',
  HND: 'NIC 0.01, SLV 0.01, NLD 0.33',
  HRV: 'NLD 0.16, PRY 0.18, HND 0.45',
  HTI: 'LIE 0.1, WSM 0.31, TWN 0.32',
  HUN: 'NER 0.06, IRN 0.13, TJK 0.17',
  IDN: 'SGP 0.03, POL 0.08, CHL 0.26',
  IND: 'NER 0.06, HUN 0.35, UZB 0.35',
  IRL: 'CIV 0.08, ITA 0.31, MLI 0.31',
  IRN: 'NER 0.1, HUN 0.13, GNQ 0.21',
  IRQ: 'YEM 0.04, EGY 0.05, SDN 0.28',
  ISL: 'SWE 0.33, XKX 0.35, HND 0.41',
  ISR: 'URY 0.25, NIC 0.41, CYP 0.49',
  ITA: 'MEX 0.03, IRL 0.31, FRA 0.38',
  JAM: 'STP 0.58, GUY 0.59, LBY 0.59',
  JOR: 'PSE 0.18, ARE 0.3, MWI 0.38',
  JPN: 'CYP 0.28, GEO 0.35, KOR 0.35',
  KAZ: 'PLW 0.27, LCA 0.36, SOM 0.4',
  KEN: 'MWI 0.18, SSD 0.36, AZE 0.4',
  KGZ: 'VNM 0.07, MNE 0.08, CHN 0.13',
  KHM: 'PRK 0.33, SWZ 0.34, CRI 0.43',
  KIR: 'IDN 0.42, LUX 0.44, SGP 0.44',
  KNA: 'TZA 0.44, COG 0.45, BEN 0.52',
  KOR: 'CYP 0.32, JPN 0.35, GEO 0.43',
  KWT: 'GNQ 0.26, IRN 0.3, NER 0.4',
  LAO: 'AUT 0.42, THA 0.44, CHE 0.46',
  LBN: 'AUT 0.27, LVA 0.39, DNK 0.43',
  LBR: 'USA 0.22, TUN 0.54, TUR 0.54',
  LBY: 'KWT 0.48, GHA 0.49, BFA 0.5',
  LCA: 'FSM 0.19, SOM 0.19, GTM 0.28',
  LIE: 'HTI 0.1, TWN 0.26, WSM 0.3',
  LKA: 'MNE 0.42, VNM 0.56, TUR 0.57',
  LSO: 'SLE 0.23, UZB 0.3, SLV 0.38',
  LTU: 'BGR 0.33, VEN 0.33, MMR 0.35',
  LUX: 'AUT 0.33, HUN 0.33, NLD 0.33',
  LVA: 'DNK 0.1, AUT 0.17, MAR 0.17',
  MAR: 'CHN 0.06, ALB 0.07, TUR 0.1',
  MCO: 'SGP 0.02, POL 0.08, CHL 0.26',
  MDA: 'AND 0.11, ROU 0.15, FRA 0.39',
  MDG: 'BFA 0.38, NER 0.43, MLT 0.44',
  MDV: 'ALB 0.31, KGZ 0.31, MAR 0.31',
  MEX: 'ITA 0.03, IRL 0.34, SEN 0.38',
  MHL: 'XKX 0.37, NIC 0.38, SLV 0.38',
  MKD: 'KGZ 0.35, MNE 0.36, VNM 0.36',
  MLI: 'SEN 0.03, GIN 0.08, IRL 0.31',
  MLT: 'QAT 0.19, BHR 0.28, NPL 0.32',
  MMR: 'LTU 0.35, VEN 0.35, COL 0.43',
  MNE: 'KGZ 0.08, VNM 0.12, CHN 0.14',
  MNG: 'ALB 0.46, KGZ 0.46, PER 0.47',
  MOZ: 'GNB 0.48, STP 0.56, GUY 0.57',
  MRT: 'MDV 0.42, TKM 0.47, GRD 0.53',
  MUS: 'BOL 0.33, COL 0.33, GMB 0.33',
  MWI: 'KEN 0.18, BLR 0.36, AZE 0.38',
  MYS: 'USA 0.36, TWN 0.51, WSM 0.51',
  NAM: 'SYC 0.41, WSM 0.51, BLR 0.54',
  NER: 'HUN 0.06, IND 0.06, IRN 0.1',
  NGA: 'SAU 0.36, CIV 0.38, IRL 0.38',
  NIC: 'HND 0.01, SLV 0.01, PRY 0.33',
  NLD: 'PRY 0.01, HRV 0.16, AUT 0.33',
  NOR: 'AUT 0.48, LAO 0.48, TUN 0.48',
  NPL: 'MLT 0.32, CYP 0.4, JPN 0.51',
  NRU: 'XKX 0.3, HND 0.34, SLV 0.34',
  NZL: 'AUS 0.06, XKX 0.32, NRU 0.39',
  OMN: 'BLR 0.3, ERI 0.38, MWI 0.42',
  PAK: 'SAU 0.39, TKM 0.39, DZA 0.44',
  PAN: 'CHL 0.44, CZE 0.5, FRA 0.51',
  PER: 'CHE 0.31, TUN 0.31, CAN 0.32',
  PHL: 'HTI 0.33, LIE 0.35, CHL 0.46',
  PLW: 'SOM 0.22, FSM 0.23, KAZ 0.27',
  PNG: 'AGO 0.4, TLS 0.42, EGY 0.49',
  POL: 'IDN 0.08, SGP 0.1, CHL 0.18',
  PRK: 'KHM 0.33, SWZ 0.41, CRI 0.42',
  PRT: 'BEN 0.36, IRL 0.39, ITA 0.39',
  PRY: 'NLD 0.01, HRV 0.18, NIC 0.33',
  PSE: 'JOR 0.18, ARE 0.26, SYR 0.37',
  QAT: 'BHR 0.12, MLT 0.19, MAR 0.36',
  ROU: 'AND 0.05, MDA 0.15, BEL 0.31',
  RUS: 'SVN 0.05, SVK 0.12, SRB 0.23',
  RWA: 'LCA 0.52, SOM 0.54, FSM 0.55',
  SAU: 'TKM 0.26, BGD 0.3, NGA 0.36',
  SDN: 'EGY 0.27, YEM 0.27, IRQ 0.28',
  SEN: 'MLI 0.03, GIN 0.11, BEL 0.35',
  SGP: 'MCO 0.02, POL 0.1, CHL 0.28',
  SLB: 'UKR 0.49, XKX 0.51, LSO 0.56',
  SLE: 'LSO 0.23, HND 0.33, NLD 0.33',
  SLV: 'HND 0.01, NIC 0.01, PRY 0.33',
  SMR: 'EST 0.46, GTM 0.47, KAZ 0.55',
  SOM: 'FSM 0.06, LCA 0.19, PLW 0.22',
  SRB: 'SVK 0.22, RUS 0.23, SVN 0.25',
  SSD: 'KEN 0.36, MWI 0.46, PSE 0.54',
  STP: 'GUY 0.21, TGO 0.33, BRA 0.48',
  SUR: 'OMN 0.44, MWI 0.52, BGD 0.53',
  SVK: 'RUS 0.12, SVN 0.17, SRB 0.22',
  SVN: 'RUS 0.05, SVK 0.17, SRB 0.25',
  SWE: 'ISL 0.33, XKX 0.36, HND 0.46',
  SWZ: 'KHM 0.34, PRK 0.41, CUB 0.56',
  SYC: 'NAM 0.41, BLR 0.56, NER 0.57',
  SYR: 'PSE 0.37, ARE 0.42, YEM 0.42',
  TCD: 'AND 0.03, MDA 0.15, BEL 0.31',
  TGO: 'STP 0.33, GUY 0.44, GIN 0.5',
  THA: 'RUS 0.33, LAO 0.44, SRB 0.46',
  TJK: 'HUN 0.17, GNQ 0.3, GMB 0.33',
  TKM: 'SAU 0.26, BGD 0.39, PAK 0.39',
  TLS: 'VNM 0.34, KGZ 0.36, CHN 0.38',
  TON: 'CHN 0.15, MAR 0.15, TUR 0.2',
  TTO: 'CHN 0.29, MAR 0.3, ALB 0.31',
  TUN: 'TUR 0.12, CHN 0.15, MAR 0.15',
  TUR: 'CHN 0.09, MAR 0.1, TUN 0.12',
  TUV: 'FJI 0.12, FSM 0.4, SOM 0.42',
  TWN: 'WSM 0.09, LIE 0.26, CHN 0.28',
  TZA: 'KNA 0.44, GAB 0.56, COG 0.66',
  UGA: 'DEU 0.53, ATG 0.62, GRD 0.64',
  UKR: 'SLB 0.49, ARM 0.5, MUS 0.5',
  URY: 'ISR 0.25, CYP 0.54, HND 0.56',
  USA: 'LBR 0.22, MYS 0.36, TWN 0.52',
  UZB: 'LSO 0.3, AZE 0.33, HUN 0.33',
  VAT: 'BTN 0.54, CYP 0.56, NPL 0.56',
  VCT: 'GIN 0.43, AND 0.53, MLI 0.56',
  VEN: 'ARM 0.08, COL 0.26, LTU 0.33',
  VNM: 'KGZ 0.07, MAR 0.1, CHN 0.11',
  VUT: 'BFA 0.4, GHA 0.42, BLR 0.44',
  WSM: 'TWN 0.09, CHN 0.25, TON 0.25',
  XKX: 'NRU 0.3, BRB 0.31, NZL 0.32',
  YEM: 'EGY 0.02, IRQ 0.04, SDN 0.27',
  ZAF: 'NLD 0.55, PRY 0.55, HRV 0.6',
  ZMB: 'SAU 0.39, TKM 0.4, PAK 0.47',
  ZWE: 'SUR 0.55, PAK 0.61, MDG 0.64',
};

// D41 d : les jumeaux, pareils à l'écran (score 0).
const JUMEAUX = { IDN: ['MCO'], MCO: ['IDN'], ROU: ['TCD'], TCD: ['ROU'] };

describe('manifeste (public/geo/drapeaux.json)', () => {
  it('197 entrées : les 195 jouables, le Kosovo et Taïwan, dans l’ordre de pays.json ; un drapeau montré pour chacun', () => {
    const jeu = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel').map((p) => p.id);
    expect(lignes.map((l) => l.pays)).toEqual(jeu);
    expect(jeu).toHaveLength(197);
    expect(pays.filter((p) => p.statut === 'jouable')).toHaveLength(195);
    for (const id of ['XKX', 'TWN']) expect(parPays.has(id), id).toBe(true);
    for (const l of lignes) {
      expect(l.d.length, l.pays).toBeGreaterThanOrEqual(1);
      for (const h of l.d) expect(existsSync(`${DOSSIER}/${h}.svg`), `${l.pays} ${h}`).toBe(true);
      expect(Object.keys(l).filter((k) => !['pays', 'd', 'j', 's'].includes(k)), l.pays).toEqual([]);
    }
  });

  it('chaque drapeau appartient à un seul pays ; deux pays à deux drapeaux justes, l’Afghanistan et la Bolivie', () => {
    const tous = lignes.flatMap((l) => l.d);
    expect(new Set(tous).size).toBe(tous.length);
    expect(lignes.filter((l) => l.d.length > 1).map((l) => [l.pays, l.d.length])).toEqual([
      ['AFG', 2],
      ['BOL', 2],
    ]);
  });

  it('Afghanistan (D41 a) : le tricolore de la République montré, le drapeau blanc de l’Émirat juste aussi, mis en 4:3', () => {
    const [montre, emirat] = parPays.get('AFG')!.d.map(svg) as [string, string];
    // Le tricolore de flag-icons : bandes noire, rouge et verte.
    for (const c of ['#000001', '#bf0000', '#090']) expect(montre).toContain(`fill="${c}"`);
    // L'Émirat (Commons) : fond blanc prolongé sur un viewBox 4:3, la chahada en noir, sans couleur.
    expect(emirat).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 -125 1000 750">\n <path d="M0-125h1000v750H0z" fill="#fff"\/>/);
    expect(emirat).not.toContain('<?xml');
    expect(emirat.match(/fill="#[0-9a-f]+"/gi)!.map((x) => x.toLowerCase()).filter((x) => x !== 'fill="#fff"')).toEqual([]);
    expect(main.autres.AFG?.de).toBe('commons-emirat');
  });

  it('Bolivie (D41 b) : le civil montré (trois bandes, sans armoiries), celui d’État juste aussi ; le Ghana est son plus proche sosie, et elle le sien', () => {
    const [civil, etat] = parPays.get('BOL')!.d.map(svg) as [string, string];
    expect(civil).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">\n' +
        '  <path fill="#007934" d="M0 0h640v480H0z"/>\n  <path fill="#ffe000" d="M0 0h640v320H0z"/>\n  <path fill="#d52b1e" d="M0 0h640v160H0z"/>\n</svg>\n',
    );
    // Celui d'État : les mêmes bandes, puis les armoiries (plus de 100 Ko).
    expect(etat.startsWith(civil.slice(0, -'</svg>\n'.length))).toBe(true);
    expect(Buffer.byteLength(etat)).toBeGreaterThan(100_000);
    expect(parPays.get('BOL')!.s[0]).toEqual(['GHA', 0.04]);
    expect(parPays.get('GHA')!.s[0]).toEqual(['BOL', 0.04]);
  });

  it('Honduras (D41 c) : le turquoise de 2022 remplacé par le bleu marine de 2026, vérifié dans le texte et au rendu', async () => {
    const hnd = svg(parPays.get('HND')!.d[0]!);
    expect(hnd).not.toMatch(/18c3df/i);
    expect(hnd.match(/#0d3b99/g)).toHaveLength(2); // le fond et les étoiles
    for (const t of textesSvg.values()) expect(t).not.toMatch(/18c3df/i);
    expect(main.corrections.HND?.remplacer).toEqual([['#18c3df', '#0d3b99']]);
    // Au rendu : la bande du haut et une étoile sont bleu marine, la bande du milieu blanche.
    const Resvg = await (await module).chargerResvg();
    const img = new Resvg(hnd, { fitTo: { mode: 'width', value: 64 }, background: 'white' }).render();
    const px = (x: number, y: number) => [...img.pixels.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3)];
    expect(px(5, 5)).toEqual([0x0d, 0x3b, 0x99]);
    expect(px(5, 24)).toEqual([255, 255, 255]);
    expect(px(32, 40)).toEqual([0x0d, 0x3b, 0x99]);
  });

  it('jumeaux (D41 d) : Indonésie et Monaco, Roumanie et Tchad, symétriques, jamais parmi les sosies du pays, jamais deux ensemble parmi les sosies d’un autre', () => {
    const jumeaux = Object.fromEntries(lignes.filter((l) => l.j).map((l) => [l.pays, l.j]));
    expect(jumeaux).toEqual(JUMEAUX);
    for (const l of lignes) for (const j of l.j ?? []) expect(parPays.get(j)!.j, `${l.pays} ${j}`).toContain(l.pays);
    for (const l of lignes) for (const [id] of l.s) expect(l.j ?? [], `${l.pays} ${id}`).not.toContain(id);
    // Deux jumeaux parmi les sosies seraient deux images pareilles parmi 4 choix (D41 d).
    for (const l of lignes) {
      const s = l.s.map(([id]) => id);
      for (const id of s) expect(s.filter((x) => parPays.get(id)!.j?.includes(x)), `${l.pays} : ${id}`).toEqual([]);
    }
    expect(main.jumeaux.map((j) => j.pays)).toEqual([
      ['IDN', 'MCO'],
      ['ROU', 'TCD'],
    ]);
  });

  it('3 sosies par pays, d’un autre pays connu, de score entre 0 et 1, du plus proche au moins proche', () => {
    for (const l of lignes) {
      expect(l.s, l.pays).toHaveLength(3);
      const scores = l.s.map(([, s]) => s);
      expect([...scores].sort((a, b) => a - b), l.pays).toEqual(scores);
      for (const [id, s] of l.s) {
        expect(parPays.has(id) && id !== l.pays, `${l.pays} ${id}`).toBe(true);
        expect(s >= 0 && s <= 1 && Number(s.toFixed(2)) === s, `${l.pays} ${id} ${s}`).toBe(true);
      }
    }
    // Le relevé (§ 2.2) comptait 50 pays à quasi-jumeau (≤ 0,1) et 102 à proche (≤ 0,3),
    // jumeaux compris ; un de moins ici : l'Argentine était le quasi-jumeau du Honduras
    // turquoise (0,02), plus du bleu marine (le Honduras garde le Nicaragua et le Salvador,
    // 0,01). La Bolivie civile garde le Ghana.
    const quasi = lignes.filter((l) => (l.j ? 0 : l.s[0]![1]) <= 0.1).length;
    const proches = lignes.filter((l) => (l.j ? 0 : l.s[0]![1]) <= 0.3).length;
    expect([quasi, proches]).toEqual([49, 101]);
    expect(parPays.get('ARG')!.s[0]).toEqual(['FSM', 0.31]);
  });

  it('les sosies de chaque pays, figés', () => {
    const lus = Object.fromEntries(lignes.map((l) => [l.pays, l.s.map(([id, s]) => `${id} ${s}`).join(', ')]));
    expect(lus).toEqual(SOSIES);
  });

  it('familles écrites à la main (§ 2.2), de pays connus', () => {
    expect(familles).toEqual({
      'croix-nordiques': ['DNK', 'FIN', 'ISL', 'NOR', 'SWE'],
      'grande-colombie': ['COL', 'ECU', 'VEN'],
      'luxembourg-pays-bas': ['LUX', 'NLD'],
      panafricaines: ['BEN', 'BFA', 'CMR', 'COG', 'ETH', 'GHA', 'GIN', 'GNB', 'MLI', 'SEN', 'STP', 'TGO'],
      panarabes: ['ARE', 'EGY', 'IRQ', 'JOR', 'KWT', 'LBY', 'PSE', 'SDN', 'SYR', 'YEM'],
      'union-jack': ['AUS', 'FJI', 'NZL', 'TUV'],
    });
  });
});

describe('fichiers des drapeaux (public/geo/drapeaux/)', () => {
  it('199 fichiers, nommés par les 8 premiers chiffres du SHA-256 de leur contenu, tous dans le manifeste et rien d’autre', () => {
    expect(fichiers).toHaveLength(199);
    for (const f of fichiers) {
      expect(f).toMatch(/^[0-9a-f]{8}\.svg$/);
      expect(empreinte(readFileSync(`${DOSSIER}/${f}`)).slice(0, 8), f).toBe(f.slice(0, 8));
    }
    expect(fichiers.map((f) => f.slice(0, 8))).toEqual(lignes.flatMap((l) => l.d).sort());
  });

  it('aucun script, gestionnaire, image ni lien externe ; rien n’y nomme le pays (id « flag-icons-xx » retiré, ids et classes internes « d-… ») ; 4:3', async () => {
    const { fautesSvg } = await module;
    for (const [h, t] of textesSvg) {
      expect(fautesSvg(t), h).toEqual([]);
      expect(t, h).not.toMatch(/<script|<image|<foreignObject|<style|<set\b|<animate|<[\w-]+:|\ssrc\s*=|\son[a-z]+\s*=/i);
      for (const m of t.matchAll(/(?:href="|url\()([^")]*)/g)) expect(m[1], h).toMatch(/^#d-/);
      for (const m of t.matchAll(/\bid="([^"]*)"/g)) expect(m[1], h).toMatch(/^d-[A-Za-z0-9-]+$/);
      for (const m of t.matchAll(/\bclass="([^"]*)"/g)) for (const c of m[1]!.split(/\s+/)) expect(c, h).toMatch(/^d-/);
      expect(t, h).not.toContain('flag-icons');
      expect(t, h).toMatch(/^<svg [^>]*viewBox="(0 0 640 480|0 -125 1000 750)"/);
    }
    // Ni le code ISO du pays en préfixe (« mr-st1 », classe de flag-icons, donnait la Mauritanie).
    const a2 = new Map(pays.map((p) => [p.id, p.a2?.toLowerCase()]));
    for (const l of lignes) {
      const code = a2.get(l.pays);
      expect(code, l.pays).toMatch(/^[a-z]{2}$/);
      for (const h of l.d) expect(svg(h), `${l.pays} ${h}`).not.toMatch(new RegExp(`\\b${code}-`));
    }
    // fautesSvg attrape bien ce qu'elle doit : une liste blanche, que ni un préfixe d'espace de
    // noms, ni une animation, ni un attribut src ne contournent.
    const sain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="url(#d-a)"/></svg>';
    const avec = (x: string) => fautesSvg(sain.replace('<path', `${x}<path`));
    const xhtml = 'xmlns:h="http://www.w3.org/1999/xhtml"';
    expect(fautesSvg(sain)).toEqual([]);
    expect(avec('<script>alert(1)</script>')).toEqual(['élément <script>']);
    expect(avec(`<h:script ${xhtml}>alert(1)</h:script>`)).toEqual(['élément <h:script>', 'attribut xmlns:h de <h:script>']);
    expect(avec('<a><set attributeName="href" to="javascript:alert(1)"/></a>')).toEqual(['élément <a>', 'élément <set>', 'attribut attributeName de <set>', 'attribut to de <set>']);
    expect(avec('<animate attributeName="fill" to="red"/>')).toEqual(['élément <animate>', 'attribut attributeName de <animate>', 'attribut to de <animate>']);
    expect(avec(`<h:img ${xhtml} src="https://x.example/p.png"/>`)).toEqual(['élément <h:img>', 'attribut xmlns:h de <h:img>', 'attribut src de <h:img>']);
    expect(fautesSvg(sain.replace('url(#d-a)', 'url(https://x.example/a)'))).toEqual(['url(https://x.example/a)']);
    expect(avec('<image href="https://x.example/a.png"/>')).toEqual(['élément <image>', 'attribut href de <image>', 'lien https://x.example/a.png']);
    expect(fautesSvg(sain.replace('<path', '<path\nonload="x()"'))).toEqual(['attribut onload de <path>']);
    expect(fautesSvg(sain.replace('<path', '<path foo'))).toEqual(['balise illisible : <path foo fill="url(#d-a)"/></svg>']);
    expect(fautesSvg(sain.replace('2000/svg', '1999/xhtml'))).toEqual(['xmlns="http://www.w3.org/1999/xhtml"']);
    expect(fautesSvg(sain.replace('<svg', '<?xml-stylesheet href="https://x.example/a.css"?><svg'))[0]).toMatch(/^balise illisible/);
    expect(fautesSvg(`<!DOCTYPE svg [<!ENTITY a "b">]>${sain}`)).toEqual(['DOCTYPE, entité ou CDATA', 'viewBox absente pas en 4:3']);
    expect(fautesSvg(sain.replace('0 0 640 480', '0 0 1000 500'))).toEqual(['viewBox 0 0 1000 500 pas en 4:3']);
  });

  it('poids : 1,34 Mo brut au total (≤ 1 350 000 o), 447 Ko gzip ; le drapeau montré pèse 2,06 Ko gzip en moyenne ; le manifeste moins de 6 Ko', () => {
    let brut = 0;
    let gz = 0;
    for (const t of textesSvg.values()) {
      brut += Buffer.byteLength(t);
      gz += gzipSync(t).length;
    }
    // Mesuré le 11/11/2026 : 1 341 350 o brut, 446 923 o gzip, 2 058 o en moyenne pour un montré.
    expect(brut).toBeLessThanOrEqual(1_350_000);
    expect(gz).toBeLessThanOrEqual(460_000);
    const moyen = lignes.reduce((s, l) => s + gzipSync(svg(l.d[0]!)).length, 0) / lignes.length;
    expect(moyen).toBeLessThanOrEqual(2_150);
    expect(moyen).toBeGreaterThan(1_500);
    expect(gzipSync(texteManifeste).length).toBeLessThanOrEqual(6_000);
  });
});

describe('licence, sources, hébergement, crédits', () => {
  it('licence de flag-icons (MIT, avis de 2013) servie à côté, hors du dossier immuable', () => {
    const t = readFileSync('public/geo/licences/flag-icons.txt', 'utf8');
    expect(t).toMatch(/^The MIT License \(MIT\)\n\nCopyright \(c\) 2013 Panayiotis Lipiridis\n/);
    expect(t).toContain('The above copyright notice and this permission notice shall be included in all');
    expect(fichiers.filter((f) => !f.endsWith('.svg'))).toEqual([]);
  });

  it('sources : flag-icons 7.6.0 (empreinte du paquet) et le drapeau de l’Émirat (Commons, domaine public), égales au verrou ; empreintes des entrées égales aux fichiers', () => {
    const fi = sources.sources.find((s) => s.url === 'https://github.com/lipis/flag-icons');
    const com = sources.sources.find((s) => s.url === 'https://commons.wikimedia.org/wiki/File:Flag_of_the_Taliban.svg');
    if (!fi || !com) throw new Error('sources des drapeaux absentes de sources.json');
    expect(fi.version).toContain('7.6.0');
    expect(fi.licence).toContain('MIT');
    expect(fi.licence).toContain('licences/flag-icons.txt');
    expect(fi.fichiers).toEqual([
      { url: 'https://registry.npmjs.org/flag-icons/-/flag-icons-7.6.0.tgz', sha256: '99d6feb80562dcaa83700ef184094d7c7b6587cc216b3fab1546cb1643e611a9' },
    ]);
    expect(verrou['flag-icons']?.fichiers['flag-icons/flag-icons-7.6.0.tgz']).toBe(fi.fichiers[0]!.sha256);
    expect(com.licence).toContain('Domaine public');
    expect(com.fichiers).toEqual([
      { url: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Flag_of_the_Taliban.svg', sha256: 'fc326ebb964d9a50e31984495d1cf94f810a8af2ecaac5615001358404a389be' },
    ]);
    expect(verrou['commons-emirat']?.fichiers['commons/Flag_of_the_Taliban.svg']).toBe(com.fichiers[0]!.sha256);
    for (const [s, cle] of [
      [fi, 'flag-icons'],
      [com, 'commons-emirat'],
    ] as const) expect(s.telecharge_le).toBe(verrou[cle]?.telecharge_le);
    for (const f of ['geodata/drapeaux.mjs', 'geodata/drapeaux-main.json', 'geodata/outils.mjs']) {
      expect(sources.traitement.entrees[f], f).toBe(empreinte(readFileSync(f)));
    }
  });

  it('firebase.json : /geo/drapeaux/** immuable, / et les .json toujours sans cache', () => {
    const h = (lire<{ hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] } }>('firebase.json')).hosting.headers;
    const regle = (s: string) => h.find((x) => x.source === s)?.headers;
    expect(regle('/geo/drapeaux/**')).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
    expect(regle('/')).toEqual([{ key: 'Cache-Control', value: 'no-cache' }]);
    expect(regle('**/*.@(html|json)')).toEqual([{ key: 'Cache-Control', value: 'no-cache' }]);
  });

  it('crédits : flag-icons (v7.6.0, Honduras mis à jour, MIT, avis de 2013, lien vers le texte servi) et le drapeau de l’Émirat (Commons, domaine public)', () => {
    const fi = textesCredits.donnees.find((c) => c.nom === 'flag-icons');
    if (!fi) throw new Error('flag-icons absent des crédits');
    expect(fi).toMatchObject({ detail: 'Drapeaux des pays · v7.6.0, Honduras mis à jour (2026)', licence: 'MIT', auteur: '© 2013 Panayiotis Lipiridis', lien: '/geo/licences/flag-icons.txt' });
    const com = textesCredits.donnees.find((c) => c.nom === 'Wikimedia Commons');
    if (!com) throw new Error('Commons absent des crédits');
    expect(com.detail).toBe("Drapeau de l'Émirat islamique d'Afghanistan");
    expect(com.licence).toBe('Domaine public');
  });

  it('table à la main : une source par ligne', () => {
    for (const section of ['corrections', 'autres', 'familles'] as const) {
      for (const [k, v] of Object.entries(main[section])) if (k !== '_') expect((v as { source: string }).source, `${section} ${k}`).toMatch(/\S{3}/);
    }
    for (const j of main.jumeaux) expect(j.source, j.pays.join()).toMatch(/\S{3}/);
  });
});

describe('paires proches du quiz (public/geo/drapeaux-proches.json)', () => {
  const proches = JSON.parse(texteProches) as { v: number; seuil: number; paires: [string, string, number][] };
  it('917 paires de score ≤ 0,5 (décision « Leurres de drapeaux au quiz »), A < B, triées, de pays du manifeste ; les jumeaux à 0 ; ≈ 18 Ko brut, 4 Ko gzip', () => {
    expect(proches.v).toBe(1);
    expect(proches.seuil).toBe(0.5);
    expect(proches.paires).toHaveLength(917);
    const cles = proches.paires.map(([a, b]) => `${a}|${b}`);
    expect(cles).toEqual([...cles].sort());
    expect(new Set(cles).size).toBe(917);
    for (const [a, b, s] of proches.paires) {
      expect(a < b, `${a} ${b}`).toBe(true);
      expect(parPays.has(a) && parPays.has(b), `${a} ${b}`).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0.5);
    }
    expect(proches.paires.filter(([, , s]) => s === 0).map(([a, b]) => `${a}|${b}`)).toEqual(['IDN|MCO', 'ROU|TCD']);
    expect(Buffer.byteLength(texteProches)).toBeLessThan(20_000);
    expect(gzipSync(texteProches).length).toBeLessThan(5_000);
  });

  it('chaque sosie du manifeste de score ≤ 0,5 y est, au même score', () => {
    const score = new Map(proches.paires.map(([a, b, s]) => [`${a}|${b}`, s]));
    for (const l of lignes) {
      for (const [b, s] of l.s) {
        if (s > 0.5) continue;
        expect(score.get(l.pays < b ? `${l.pays}|${b}` : `${b}|${l.pays}`), `${l.pays} ${b}`).toBe(s);
      }
    }
  });
});

describe('reproduction', () => {
  it('S33 : sosies, jumeaux et familles refaits sur les SVG versionnés (resvg-wasm) redonnent le manifeste à l’octet', async () => {
    const { manifeste } = await module;
    const r = await manifeste(
      lignes.map((l) => ({ pays: l.pays, d: l.d })),
      textesSvg,
      main,
    );
    expect(r.fautes).toEqual([]);
    expect(r.texte).toBe(texteManifeste);
    expect(r.proches).toBe(texteProches);
    expect(r.scores.size).toBe((197 * 196) / 2);
  }, 60_000);

  const tarball = 'geodata/raw/flag-icons/flag-icons-7.6.0.tgz';
  it.skipIf(!existsSync(tarball) || !existsSync('geodata/raw/commons/Flag_of_the_Taliban.svg'))(
    'construireDrapeaux (npm run geodata -- --seulement drapeaux) redonne les fichiers commités et sources.json (là où geodata/raw/ a les sources)',
    async () => {
      const { construireDrapeaux } = await module;
      const { fusionnerPartie } = (await import('../geodata/outils.mjs' as string)) as { fusionnerPartie: (s: Sources, p: { sources: Source[]; entrees: Record<string, string> }) => Sources };
      const r = await construireDrapeaux('.');
      expect(r.fichiers['drapeaux.json']).toBe(texteManifeste);
      expect(r.fichiers['drapeaux-proches.json']).toBe(texteProches);
      expect(r.fichiers['licences/flag-icons.txt']).toBe(readFileSync('public/geo/licences/flag-icons.txt', 'utf8'));
      expect(Object.keys(r.svgs).map((h) => `${h}.svg`).sort()).toEqual(fichiers);
      for (const [h, t] of Object.entries(r.svgs)) expect(t, h).toBe(textesSvg.get(h));
      expect(JSON.stringify(fusionnerPartie(sources, r), null, 2) + '\n').toBe(readFileSync('public/geo/sources.json', 'utf8'));
    },
    60_000,
  );
});
