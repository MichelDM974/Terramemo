// Recherche de l'en-tête : la fonction pure (texte.ts) et les lieux qu'elle
// parcourt (recherche.ts : zones nommées du monde, communes de l'île).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DonneesCarte } from '../src/map/donnees';
import type { Pays } from '../src/map/types';
import { chercherLieux, MAX_SUGGESTIONS } from '../src/texte';
import { lieuxMonde, lieuxReunion } from '../src/vues/recherche';

const lieu = (nom: string) => ({ nom });
const noms = (l: { nom: string }[]) => l.map((x) => x.nom);

describe('chercherLieux', () => {
  const tous = ['France', 'Congo', 'République démocratique du Congo', 'Saint-Denis', 'Saint-Pierre', 'Saint-Pierre-et-Miquelon', 'L’Étang-Salé', 'Le Port', 'Danemark'].map(lieu);

  it('rien pour un champ vide ou blanc', () => {
    expect(chercherLieux('', tous)).toEqual([]);
    expect(chercherLieux('   ', tous)).toEqual([]);
  });

  it('le début du nom d’abord, puis le début d’un mot, sans accents ni casse', () => {
    expect(noms(chercherLieux('congo', tous))).toEqual(['Congo', 'République démocratique du Congo']);
    expect(noms(chercherLieux('DEN', tous))).toEqual(['Saint-Denis']);
    expect(noms(chercherLieux('d', tous))).toEqual(['Danemark', 'République démocratique du Congo', 'Saint-Denis']);
    expect(noms(chercherLieux('etang', tous))).toEqual(['L’Étang-Salé']);
    expect(noms(chercherLieux("l'etang", tous))).toEqual(['L’Étang-Salé']);
  });

  it('le trait d’union vaut une espace, et plusieurs mots se suivent', () => {
    expect(noms(chercherLieux('saint pierre', tous))).toEqual(['Saint-Pierre', 'Saint-Pierre-et-Miquelon']);
    expect(noms(chercherLieux('du congo', tous))).toEqual(['République démocratique du Congo']);
  });

  it('pas d’un milieu de mot', () => {
    expect(chercherLieux('ance', tous)).toEqual([]);
  });

  it(`au plus ${MAX_SUGGESTIONS} lieux, ou le maximum donné`, () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => lieu(`Saint ${String(i).padStart(2, '0')}`));
    expect(chercherLieux('saint', beaucoup)).toHaveLength(MAX_SUGGESTIONS);
    expect(chercherLieux('saint', beaucoup, 3)).toHaveLength(3);
  });
});

describe('lieux de la recherche', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const nomsMonde = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  const monde = lieuxMonde({ entites: pays.map((p) => ({ pays: p })), noms: nomsMonde } as unknown as DonneesCarte);

  it('toute zone nommée du monde, pays, territoires et zones contestées', () => {
    expect(monde.length).toBe(pays.filter((p) => nomsMonde[p.id]).length);
    expect(monde.length).toBeGreaterThan(195);
    const fra = monde.find((l) => l.id === 'FRA');
    expect(fra).toEqual({ terrain: 'monde', id: 'FRA', nom: nomsMonde.FRA, detail: 'Europe' });
    // Un territoire le dit plutôt que son continent.
    const territoire = pays.find((p) => p.statut === 'territoire' && nomsMonde[p.id]);
    expect(monde.find((l) => l.id === territoire?.id)?.detail).toBe('territoire');
  });

  it('les 24 communes de l’île, dites communes de La Réunion', () => {
    const nomsIle = JSON.parse(readFileSync('public/geo/reunion/noms.fr.json', 'utf8')) as Record<string, string>;
    const ile = lieuxReunion(nomsIle);
    expect(ile).toHaveLength(24);
    expect(ile.find((l) => l.id === '97411')).toEqual({ terrain: 'reunion', id: '97411', nom: 'Saint-Denis', detail: 'commune de La Réunion' });
    expect(noms(chercherLieux('saint d', [...monde, ...ile]))).toEqual(['Saint-Denis']);
  });
});
