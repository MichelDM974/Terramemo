import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';
import { normaliser, suggestions } from '../src/texte';
import { ciblesEssai, SERIE_ESSAI, SERIE_TOUS, series } from '../src/vues/cibles';
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
    for (const id of c) expect(['jouable', 'optionnel']).toContain(statut(id));
  });

  it('séries de Toucher : l’essai intact, tous les pays, un continent par nom du fichier de langue', () => {
    const continents = textes.continents as Record<string, string>;
    const s = series(pays, (c) => continents[c] ?? c);
    expect(s.map((x) => x.id)).toEqual([SERIE_ESSAI, SERIE_TOUS, 'Africa', 'North America', 'South America', 'Asia', 'Europe', 'Oceania']);
    expect(s[0]?.ids).toEqual(ciblesEssai(pays));
    expect(s[0]?.ids.length).toBe(43);
    const jouables = pays.filter((p) => p.statut === 'jouable' || p.statut === 'optionnel');
    expect(new Set(s[1]?.ids)).toEqual(new Set(jouables.map((p) => p.id)));
    expect(s[1]?.ids.length).toBe(197);
    expect(s.find((x) => x.id === 'Africa')?.ids.length).toBe(54);
    // Les continents se partagent tous les pays, sans territoire ni zone contestée.
    const parContinent = s.slice(2).flatMap((x) => x.ids);
    expect(parContinent.length).toBe(197);
    expect(new Set(parContinent)).toEqual(new Set(s[1]?.ids));
    // Chaque continent de pays.json a son nom en français.
    for (const p of pays) expect(continents[p.continent], p.continent).toBeTruthy();
  });

  it('textes : modèles remplis, clé inconnue laissée telle quelle', () => {
    expect(remplir(textes.toucher.n_pays, { n: 54 })).toBe('54 pays');
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
