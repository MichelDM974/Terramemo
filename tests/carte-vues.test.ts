import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';
import { normaliser, suggestions } from '../src/texte';
import { ciblesEssai } from '../src/vues/cibles';

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
