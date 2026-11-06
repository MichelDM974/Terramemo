import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';
import { normaliser, suggestions } from '../src/texte';
import { REUNION } from '../src/map/terrain';
import { catalogue, ciblesEssai, nomSerie, SERIE_ESSAI, SERIE_REUNION, SERIE_TOUS, serieEssai, seriesMonde, serieTerrain } from '../src/vues/cibles';
import { anneauSiPetite, estPetite, fmtKm, fmtS, idsSerie, nomDe } from '../src/vues/commun';
import { projectionLocale } from '../src/map/terrain';
import { creerProjection } from '../src/map/projection';
import { remplir, textes } from '../src/vues/textes';

// Vues d'essai du J0 : cibles de l'essai « Toucher », suggestions de la « Saisie ».

const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
const noms = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
const statut = (id: string) => pays.find((p) => p.id === id)?.statut;

describe('essai et saisie', () => {
  it('cibles de l’essai : micro-États, Caraïbes, Pacifique, quelques grands, sans doublon ni territoire', () => {
    const c = ciblesEssai(pays);
    expect(new Set(c).size).toBe(c.length);
    for (const p of pays) if (p.micro && p.statut === 'jouable') expect(c).toContain(p.id);
    for (const id of ['CUB', 'JAM', 'FJI', 'KIR', 'TON', 'WSM', 'PNG', 'RUS', 'BRA']) expect(c).toContain(id);
    for (const id of c) expect(statut(id)).toBe('jouable');
  });

  it('séries du monde : tous les pays en tête (195, sans le paquet optionnel), puis un continent par nom du fichier de langue, dans l’ordre alphabétique', () => {
    const continents = textes.continents as Record<string, string>;
    const s = seriesMonde(pays, (c) => continents[c] ?? c);
    expect(s.map((x) => x.id)).toEqual([SERIE_TOUS, 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania']);
    expect(s.map((x) => nomSerie(x.id))).toEqual(['Tous les pays', 'Afrique', 'Amérique du Nord', 'Amérique du Sud', 'Asie', 'Europe', 'Océanie']);
    // L'essai du J0 à part (un outil, dans ⚙), intact.
    const essai = serieEssai(pays);
    expect([essai.id, essai.terrain, essai.ids, essai.n]).toEqual([SERIE_ESSAI, 'monde', ciblesEssai(pays), 43]);
    expect(nomSerie(SERIE_ESSAI)).toBe('Essai J0');
    const jouables = pays.filter((p) => p.statut === 'jouable');
    expect(new Set(s[0]?.ids)).toEqual(new Set(jouables.map((p) => p.id)));
    expect(s[0]?.ids.length).toBe(195);
    // Kosovo et Taïwan (paquet optionnel) ne sont posés dans aucune série.
    for (const id of ['XKX', 'TWN']) {
      expect(statut(id)).toBe('optionnel');
      for (const x of s) expect(x.ids, x.id).not.toContain(id);
    }
    expect(s.find((x) => x.id === 'Africa')?.ids.length).toBe(54);
    // Les continents se partagent tous les pays, sans territoire ni zone contestée.
    const parContinent = s.slice(1).flatMap((x) => x.ids);
    expect(parContinent.length).toBe(195);
    expect(new Set(parContinent)).toEqual(new Set(s[0]?.ids));
    // Chaque continent de pays.json a son nom en français.
    for (const p of pays) expect(continents[p.continent], p.continent).toBeTruthy();
  });

  it('textes : modèles remplis, clé inconnue laissée telle quelle', () => {
    expect(remplir(textes.terrains.monde.n, { n: 54 })).toBe('54 pays');
    expect(remplir('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });

  it('normalisation sans accents ni casse, sans retrait de mots', () => {
    expect(normaliser('  Côte d’Ivoire ')).toBe("cote d'ivoire");
    expect(normaliser('Saint-Vincent-et-les Grenadines')).toBe('saint vincent et les grenadines');
    expect(normaliser('ÉTATS-UNIS')).toBe('etats unis');
  });

  it('suggestions : les noms qui commencent par ce qui est tapé', () => {
    expect(suggestions('cote', Object.values(noms))).toContain('Côte d’Ivoire');
    expect(suggestions('CONGO', Object.values(noms))).toEqual(['Congo-Brazzaville', 'Congo-Kinshasa']);
    expect(suggestions('saint vin', Object.values(noms))).toEqual(['Saint-Vincent-et-les Grenadines']);
    expect(suggestions('', Object.values(noms))).toEqual([]);
  });
});

// La Réunion et Nommer (#15, conception docs/etudes/2026-11-06-reunion.md §§ 4 et 5).
describe('séries de l’île et textes des terrains', () => {
  const continents = textes.continents as Record<string, string>;
  const nomContinent = (c: string) => continents[c] ?? c;
  const communes = JSON.parse(readFileSync('public/geo/reunion/communes.json', 'utf8')) as { id: string }[];
  const nomsIle = JSON.parse(readFileSync('public/geo/reunion/noms.fr.json', 'utf8')) as Record<string, string>;

  it('les séries du monde portent leur terrain et leur nombre', () => {
    for (const x of seriesMonde(pays, nomContinent)) {
      expect(x.terrain, x.id).toBe('monde');
      expect(x.n, x.id).toBe(x.ids.length);
    }
  });

  it('le catalogue : les 7 séries du monde, puis l’île en dernier (ids résolus au départ), sans l’essai', () => {
    const s = catalogue(pays, nomContinent);
    expect(s.map((x) => x.id)).toEqual([...seriesMonde(pays, nomContinent).map((x) => x.id), SERIE_REUNION]);
    expect(s.map((x) => x.id)).not.toContain(SERIE_ESSAI);
    const ile = s.at(-1);
    expect(ile).toEqual({ id: 'reunion', terrain: 'reunion', ids: [], n: 24 });
    expect(serieTerrain(REUNION)).toEqual(ile);
    expect(REUNION.n).toBe(communes.length);
  });

  it('les cibles d’une série : les siennes dans le monde, toutes les zones jouables de l’île', () => {
    const monde = seriesMonde(pays, nomContinent)[0]!;
    const t = { jouables: ['A', 'B'] } as unknown as Parameters<typeof idsSerie>[1];
    expect(idsSerie(monde, t)).toEqual(monde.ids);
    expect(idsSerie(serieTerrain(REUNION), t)).toEqual(['A', 'B']);
  });

  it('textes : le monde et l’île ont les mêmes clés (sauf série, libellé), toutes remplies', () => {
    const { monde, reunion } = textes.terrains;
    const propres = new Set(['serie', 'libelle']);
    expect(Object.keys(reunion).filter((k) => !propres.has(k)).sort()).toEqual(Object.keys(monde).sort());
    for (const k of ['n', 'consigne_nommer', 'faux_suite', 'expire']) {
      expect(monde[k as keyof typeof monde], `monde.${k}`).toBeTruthy();
      expect(reunion[k as keyof typeof reunion], `reunion.${k}`).toBeTruthy();
    }
    for (const k of ['serie', 'libelle']) expect(reunion[k as keyof typeof reunion], k).toBeTruthy();
    expect(remplir(reunion.n, { n: 24 })).toBe('24 communes');
    expect(remplir(monde.n, { n: 195 })).toBe('195 pays');
  });

  it('textes de Toucher et de Nommer : chaque clé lue par les vues existe', () => {
    const cles = [
      'localiser', 'nommer', 'chargement_terrain', 'echec_terrain', 'serie_essai', 'serie_essai_detail', 'consigne', 'voir', 'passer',
      'terminer', 'recommencer', 'autre_serie', 'juste', 'via_pastille', 'via_proche', 'essai_un', 'essais', 'faux', 'faux_ou', 'la_mer',
      'bilan_titre', 'bilan_resume', 'bilan_vide', 'rate', 'rate_vu', 'rate_passe', 'rate_distance', 'nommer_juste',
      'nommer_faux', 'bilan_nommer_titre', 'bilan_nommer', 'bilan_nommer_temps', 'bilan_nommer_faux',
    ];
    for (const k of cles) expect(textes.toucher[k as keyof typeof textes.toucher], k).toBeTruthy();
    // Le temps écoulé du Chrono dépend du terrain : il n'est plus dans chrono.
    expect('expire' in textes.chrono).toBe(false);
  });

  it('textes de Jouer, de la Carte et de la recherche : chaque clé lue par les vues existe', () => {
    const lues = {
      jouer: ['titre', 'fermer', 'remonter', 'fil', 'regles', 'rejouer', 'record', 'essai_aide'],
      carte: ['touche', 'touche_ile', 'mer', 'par_pastille', 'au_plus_pres', 'monde', 'monde_titre'],
      recherche: ['placeholder', 'placeholder_court', 'aucun', 'commune'],
    } as const;
    for (const [partie, cles] of Object.entries(lues))
      for (const k of cles) expect((textes as unknown as Record<string, Record<string, string>>)[partie]?.[k], `${partie}.${k}`).toBeTruthy();
    for (const m of ['localiser', 'nommer', 'chrono', 'sansfaute', 'minute'] as const) expect(textes.jouer.exercices[m], m).toBeTruthy();
    for (const b of ['entrainement', 'classe'] as const) expect([textes.jouer.branches[b].nom, textes.jouer.branches[b].detail].every(Boolean), b).toBe(true);
    expect(remplir(textes.jouer.exercices.chrono, { s: 15 })).toBe('15 s par question, un seul toucher');
    expect(remplir(textes.jouer.exercices.minute, { s: 60 })).toBe('Le plus de justes en 60 s');
  });

  it('textes de Toucher : la rétroaction du monde reste mot pour mot celle d’avant', () => {
    const T = textes.toucher;
    expect(
      remplir(T.faux, { touche: 'Italie', ou: remplir(T.faux_ou, { km: fmtKm(12.4) }), suite: textes.terrains.monde.faux_suite }),
    ).toBe('Faux : Italie, à 12\u00a0km du bord. Le bon pays est en vert : touche-le.');
    expect(remplir(T.juste, { via: T.via_proche, essais: remplir(T.essais, { n: 2 }), temps: fmtS(1234) })).toBe(
      'Juste (au plus près) · 2 essais · 1,2\u00a0s',
    );
    expect(remplir(T.faux, { touche: T.la_mer, ou: '', suite: textes.terrains.reunion.faux_suite })).toBe(
      'Faux : la mer. La bonne commune est en vert : touche-la.',
    );
    expect(remplir(T.bilan_nommer_faux, { cible: 'Saint-Leu', choisi: 'Les Avirons' })).toBe('Saint-Leu : tu as choisi Les Avirons');
  });

  it('fmtKm : une décimale sous 10 km, l’entier au-delà', () => {
    expect(fmtKm(2.43)).toBe('2,4\u00a0km');
    expect(fmtKm(0.04)).toBe('0,0\u00a0km');
    expect(fmtKm(9.96)).toBe('10\u00a0km');
    expect(fmtKm(12.4)).toBe('12\u00a0km');
    expect(fmtKm(1517.2)).toBe('1\u202f517\u00a0km');
  });

  it('nomDe : les noms du terrain passé (une commune n’est pas « 97407 »)', () => {
    expect(nomDe({ noms: nomsIle }, '97407')).toBe('Le Port');
    expect(nomDe({ noms }, 'CHE')).toBe('Suisse');
    expect(nomDe({ noms }, 'ZZZ')).toBe('ZZZ');
  });
});

describe('anneau seulement autour d’une zone petite à l’écran', () => {
  // L'île au zoom 1 (384 × 723) : toutes les communes ≥ 15 px, aucun anneau (Petite-Île
  // en aurait un qui déborde sur la mer et Saint-Pierre) ; au monde, le Vatican en a un.
  const communes = JSON.parse(readFileSync('public/geo/reunion/communes.json', 'utf8')) as Pays[];
  const proj = projectionLocale(384, 723, { type: 'MultiPoint', coordinates: [[55.21, -21.39], [55.84, -20.87]] });
  function terrain(lieux: Pays[], echelle: number, k: number) {
    const poses: string[] = [];
    const carte = { projection: { scale: () => echelle }, transfo: { k, x: 0, y: 0 }, anneau: (id: string) => poses.push(id) };
    const t = { carte, donnees: { entites: lieux.map((l) => ({ pays: l })) } } as unknown as Parameters<typeof estPetite>[0];
    return { t, poses };
  }
  it('île au zoom 1 : aucune commune petite, aucun anneau posé', () => {
    const { t, poses } = terrain(communes, proj.scale(), 1);
    for (const c of communes) {
      expect(estPetite(t, c.id), c.id).toBe(false);
      anneauSiPetite(t, c.id, 'juste');
    }
    expect(poses).toEqual([]);
  });
  it('monde au zoom 1 : le Vatican a son anneau, la Russie non', () => {
    const { t, poses } = terrain(pays, creerProjection('monde', 384, 723).scale(), 1);
    anneauSiPetite(t, 'VAT', 'juste');
    anneauSiPetite(t, 'RUS', 'juste');
    expect(poses).toEqual(['VAT']);
  });
});
