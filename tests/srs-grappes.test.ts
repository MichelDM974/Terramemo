import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Lieu, Pays } from '../src/map/types';
import { grappes, grappesCommunes, grappesPays, ORDRE_CONTINENTS, type EntiteGrappe } from '../src/srs/grappes';

const lire = <T>(f: string): T => JSON.parse(readFileSync(f, 'utf8')) as T;
const pays = lire<Pays[]>('public/geo/pays.json');
const noms = lire<Record<string, string>>('public/geo/noms.fr.json');
const communes = lire<Lieu[]>('public/geo/reunion/communes.json');
const nomsCommunes = lire<Record<string, string>>('public/geo/reunion/noms.fr.json');
const jouables = pays.filter((p) => p.statut === 'jouable');

function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function melanger<T>(xs: readonly T[], alea: () => number): T[] {
  const r = [...xs];
  for (let i = r.length - 1; i > 0; i--) {
    const k = Math.floor(alea() * (i + 1));
    [r[i], r[k]] = [r[k]!, r[i]!];
  }
  return r;
}

describe('grappes des 195 pays jouables', () => {
  const gs = grappesPays(pays);
  const continent = new Map(jouables.map((p) => [p.id, p.continent]));
  const superficie = new Map(jouables.map((p) => [p.id, p.superficie_km2]));

  it('chaque jouable dans une grappe et une seule, et rien d’autre', () => {
    const tous = gs.flatMap((g) => g.membres);
    expect(tous.length).toBe(195);
    expect(new Set(tous)).toEqual(new Set(jouables.map((p) => p.id)));
  });

  it('de 5 à 9 pays, un seul continent par grappe', () => {
    for (const g of gs) {
      expect(g.membres.length, g.id).toBeGreaterThanOrEqual(5);
      expect(g.membres.length, g.id).toBeLessThanOrEqual(9);
      for (const id of g.membres) expect(continent.get(id), `${id} dans ${g.id}`).toBe(g.continent);
    }
  });

  it('pays par superficie décroissante ; grappes par continent (D4) puis superficie totale décroissante', () => {
    for (const g of gs) {
      const s = g.membres.map((id) => superficie.get(id)!);
      expect(s).toEqual([...s].sort((a, b) => b - a));
    }
    const rangs = gs.map((g) => ORDRE_CONTINENTS.indexOf(g.continent));
    expect(rangs.every((r) => r >= 0)).toBe(true);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    for (let i = 1; i < gs.length; i++) {
      if (gs[i]!.continent === gs[i - 1]!.continent) expect(gs[i]!.superficie_km2).toBeLessThanOrEqual(gs[i - 1]!.superficie_km2);
    }
  });

  it('déterministe : l’ordre des entrées ne change rien', () => {
    const alea = graine(3);
    for (let k = 0; k < 5; k++) expect(grappesPays(melanger(pays, alea))).toEqual(gs);
  });

  it('instantané lisible', () => {
    expect(gs.map((g) => `${g.id} : ${g.membres.map((id) => noms[id]).join(', ')}`)).toMatchInlineSnapshot(`
      [
        "Eastern Europe 2/2 : Russie, Ukraine, Pologne, Biélorussie, Moldavie",
        "Western Europe : France, Allemagne, Autriche, Suisse, Pays-Bas, Belgique, Luxembourg, Liechtenstein, Monaco",
        "Northern Europe 2/2 : Suède, Finlande, Lituanie, Lettonie, Estonie",
        "Southern Europe 1/2 : Espagne, Italie, Portugal, Slovénie, Andorre, Malte, Saint-Marin, État de la Cité du Vatican",
        "Northern Europe 1/2 : Norvège, Royaume-Uni, Islande, Irlande, Danemark",
        "Eastern Europe 1/2 : Roumanie, Bulgarie, Hongrie, Tchéquie, Slovaquie",
        "Southern Europe 2/2 : Grèce, Serbie, Croatie, Bosnie-Herzégovine, Albanie, Macédoine du Nord, Monténégro",
        "Central America + Northern America 1/2 : Canada, États-Unis, Mexique, Guatemala, Belize",
        "Central America + Northern America 2/2 : Nicaragua, Honduras, Panama, Costa Rica, Salvador",
        "Caribbean 1/2 : Cuba, République dominicaine, Haïti, Bahamas, Jamaïque, Antigua-et-Barbuda, Saint-Christophe-et-Niévès",
        "Caribbean 2/2 : Trinité-et-Tobago, Dominique, Sainte-Lucie, Barbade, Saint-Vincent-et-les Grenadines, Grenade",
        "South America 2/2 : Brésil, Argentine, Bolivie, Chili, Paraguay, Uruguay",
        "South America 1/2 : Pérou, Colombie, Venezuela, Équateur, Guyana, Suriname",
        "Northern Africa : Algérie, Soudan, Libye, Égypte, Maroc, Tunisie",
        "Middle Africa : Congo-Kinshasa, Tchad, Angola, République centrafricaine, Cameroun, Congo-Brazzaville, Gabon, Guinée équatoriale, Sao Tomé-et-Principe",
        "Western Africa 2/2 : Mali, Niger, Nigeria, Côte d’Ivoire, Burkina Faso, Ghana, Bénin, Togo",
        "Eastern Africa 1/3 : Éthiopie, Soudan du Sud, Kenya, Somalie, Érythrée, Djibouti",
        "Southern Africa : Afrique du Sud, Namibie, Botswana, Lesotho, Eswatini",
        "Eastern Africa 2/3 : Tanzanie, Zambie, Zimbabwe, Ouganda, Burundi, Rwanda",
        "Western Africa 1/2 : Mauritanie, Guinée, Sénégal, Liberia, Sierra Leone, Guinée-Bissau, Gambie, Cap-Vert",
        "Eastern Africa 3/3 : Mozambique, Madagascar, Malawi, Maurice, Comores, Seychelles",
        "Eastern Asia : Chine, Mongolie, Japon, Corée du Nord, Corée du Sud",
        "Southern Asia : Inde, Iran, Pakistan, Afghanistan, Népal, Bangladesh, Sri Lanka, Bhoutan, Maldives",
        "Central Asia : Kazakhstan, Turkménistan, Ouzbékistan, Kirghizstan, Tadjikistan",
        "Western Asia 3/3 : Arabie saoudite, Yémen, Oman, Émirats arabes unis, Qatar, Bahreïn",
        "South-Eastern Asia 2/2 : Indonésie, Malaisie, Timor oriental, Brunei, Singapour",
        "South-Eastern Asia 1/2 : Myanmar (Birmanie), Thaïlande, Viêt Nam, Philippines, Laos, Cambodge",
        "Western Asia 2/3 : Turquie, Jordanie, Israël, Liban, Palestine, Chypre",
        "Western Asia 1/3 : Irak, Syrie, Azerbaïdjan, Géorgie, Arménie, Koweït",
        "Melanesia + Australia and New Zealand + Polynesia : Australie, Papouasie-Nouvelle-Guinée, Nouvelle-Zélande, Îles Salomon, Fidji, Vanuatu, Samoa, Tonga, Tuvalu",
        "Micronesia : Kiribati, Micronésie, Palaos, Îles Marshall, Nauru",
      ]
    `);
  });
});

describe('grappes des 24 communes de La Réunion', () => {
  const gs = grappesCommunes(communes);
  const voisins = new Map(communes.map((c) => [c.id, c.voisins]));

  it('4 grappes de 6, chacune d’un seul tenant (par voisins)', () => {
    expect(gs.map((g) => g.membres.length)).toEqual([6, 6, 6, 6]);
    expect(new Set(gs.flatMap((g) => g.membres)).size).toBe(24);
    for (const g of gs) {
      const dans = new Set(g.membres);
      const vus = new Set([g.membres[0]!]);
      const file = [g.membres[0]!];
      while (file.length) for (const v of voisins.get(file.pop()!) ?? []) if (dans.has(v) && !vus.has(v)) (vus.add(v), file.push(v));
      expect(vus.size, g.id).toBe(6);
    }
  });

  it('instantané lisible', () => {
    expect(gs.map((g) => `${g.id} : ${g.membres.map((id) => nomsCommunes[id]).join(', ')}`)).toMatchInlineSnapshot(`
      [
        "La Réunion 4/4 : Saint-Benoît, Le Tampon, Saint-Joseph, Sainte-Rose, Saint-Philippe, La Plaine-des-Palmistes",
        "La Réunion 1/4 : Saint-Paul, La Possession, Saint-Leu, Cilaos, Les Trois-Bassins, Le Port",
        "La Réunion 2/4 : Saint-Denis, Salazie, Sainte-Marie, Bras-Panon, Sainte-Suzanne, Saint-André",
        "La Réunion 3/4 : Saint-Louis, Saint-Pierre, Entre-Deux, L’Étang-Salé, Petite-Île, Les Avirons",
      ]
    `);
  });
});

describe('règle de découpage', () => {
  const e = (id: string, lon: number, lat: number, groupe = 'G', continent = 'C', superficie_km2 = 1): EntiteGrappe => ({
    id, point: [lon, lat], groupe, continent, superficie_km2,
  });

  it('de part et d’autre de l’antiméridien, les voisins restent ensemble', () => {
    // 175° E … 180°, puis 179° O … 174° O : deux paquets de 6 contigus.
    const lons = [175, 176, 177, 178, 179, -180, -179, -178, -177, -176, -175, -174];
    const gs = grappes(lons.map((l, i) => e(`p${String(i).padStart(2, '0')}`, l, -15)), { taille: 6 });
    const parts = gs.map((g) => g.membres.slice().sort());
    expect(parts).toContainEqual(['p00', 'p01', 'p02', 'p03', 'p04', 'p05']);
    expect(parts).toContainEqual(['p06', 'p07', 'p08', 'p09', 'p10', 'p11']);
  });

  it('un groupe de 9 reste entier, un de 10 donne 5 + 5, un de 18 donne 6 + 6 + 6', () => {
    const ligne = (n: number): EntiteGrappe[] => Array.from({ length: n }, (_, i) => e(`x${String(i).padStart(2, '0')}`, i, 0));
    expect(grappes(ligne(9)).map((g) => g.membres.length)).toEqual([9]);
    expect(grappes(ligne(10)).map((g) => g.membres.length)).toEqual([5, 5]);
    expect(grappes(ligne(18)).map((g) => g.membres.length)).toEqual([6, 6, 6]);
    // Sur une ligne, les paquets sont des tronçons contigus.
    const t = grappes(ligne(18)).map((g) => g.membres.map((id) => Number(id.slice(1))).sort((a, b) => a - b));
    for (const p of t) expect(p.at(-1)! - p[0]!).toBe(5);
  });

  it('un petit groupe rejoint le plus proche de son continent, jamais un autre continent', () => {
    const gs = grappes([
      ...[0, 1, 2].map((l) => e(`a${l}`, l, 0, 'A')),
      ...[5, 6, 7, 8, 9].map((l) => e(`b${l}`, l, 0, 'B')),
      ...[60, 61, 62, 63, 64].map((l) => e(`c${l}`, l, 0, 'C')),
      ...[2, 3].map((l) => e(`d${l}`, l, 1, 'D', 'Autre')),
    ]);
    const a = gs.find((g) => g.membres.includes('a0'))!;
    expect(a.groupes).toEqual(['B', 'A']);
    expect(a.membres.length).toBe(8);
    // Seul de son continent : gardé tel quel, même trop petit.
    expect(gs.find((g) => g.continent === 'Autre')!.membres.length).toBe(2);
  });
});

// Capitales (étude J2 § 6.1, D37 c, lot 1) : les grappes des pays telles
// quelles (src/vues/seance.ts, commePays) : aucune exclue en Trouver, donc
// aucune vide ; les 9 pays au nom de leur capitale n'y ont pas de QCM, mais
// aucune grappe n'en est faite seulement (son QCM d'Apprendre serait vide).
describe('grappes des capitales', () => {
  const gs = grappesPays(pays);
  const capitales = lire<{ pays: string; m?: 1 }[]>('public/geo/capitales.json');
  const memeNom = new Set(capitales.filter((l) => l.m === 1).map((l) => l.pays));

  it('celles des pays : toutes les capitales jouables y sont, une fois ; aucune grappe vide', () => {
    expect(gs.every((g) => g.membres.length > 0)).toBe(true);
    const membres = gs.flatMap((g) => g.membres);
    expect(new Set(membres).size).toBe(membres.length);
    expect(new Set(membres)).toEqual(new Set(jouables.map((p) => p.id)));
    for (const id of membres) expect(capitales.some((l) => l.pays === id), id).toBe(true);
  });

  it('les 9 de D37 c dans leurs grappes (Trouver), jamais seuls dans une grappe : chaque grappe garde un QCM', () => {
    expect(memeNom.size).toBe(9);
    for (const id of memeNom) expect(gs.some((g) => g.membres.includes(id)), id).toBe(true);
    for (const g of gs) expect(g.membres.some((id) => !memeNom.has(id)), g.membres.join(',')).toBe(true);
  });
});
