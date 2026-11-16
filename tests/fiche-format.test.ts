// Nombres, listes et chargeur des fiches des lieux (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.1, § 6.1 et § 6.5 ; lot F1).
// L'heure locale et les gentilés viennent au lot F2, avec leurs tests.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { chargerFichesMonde, fichesMondeChargees, lireFichesMonde, oublierFichesMonde, type FichierMonde, type FichierMondeLangue } from '../src/fiches/donnees';
import { fmtEntier, fmtNombreCourt, listeEt, troisChiffres } from '../src/fiches/format';

/** Espaces insécables (milliers, unités) en espaces simples, pour comparer. */
const simple = (s: string) => s.replace(/[  ]/g, ' ');

describe('nombres des fiches', () => {
  it('trois chiffres au plus dans la barre : 836, 56 800, 5,41 millions, 68,7 millions, 123 millions, 1,42 milliard', () => {
    expect(troisChiffres(56_789)).toBe(56_800);
    expect(troisChiffres(836)).toBe(836);
    expect(troisChiffres(0)).toBe(0);
    expect(simple(fmtNombreCourt(836))).toBe('836');
    expect(simple(fmtNombreCourt(56_789))).toBe('56 800');
    expect(simple(fmtNombreCourt(5_412_345))).toBe('5,41 millions');
    expect(simple(fmtNombreCourt(68_712_000))).toBe('68,7 millions');
    expect(simple(fmtNombreCourt(123_366_734))).toBe('123 millions');
    expect(simple(fmtNombreCourt(1_416_096_094))).toBe('1,42 milliard');
    expect(simple(fmtNombreCourt(1_500_000))).toBe('1,5 million');
    expect(simple(fmtNombreCourt(2_000_000))).toBe('2 millions');
    // Arrondi qui change d'unité : 999 500 000 donne un milliard, pas « 1 000 millions ».
    expect(simple(fmtNombreCourt(999_500_000))).toBe('1 milliard');
  });

  it('la fiche donne le nombre entier', () => {
    expect(simple(fmtEntier(123_366_734))).toBe('123 366 734');
    expect(simple(fmtEntier(836))).toBe('836');
  });

  it('listes : « La Paz et Sucre », « A, B et C », un seul élément tel quel', () => {
    expect(listeEt(['La Paz', 'Sucre'])).toBe('La Paz et Sucre');
    expect(listeEt(['Pretoria', 'Le Cap', 'Bloemfontein'])).toBe('Pretoria, Le Cap et Bloemfontein');
    expect(listeEt(['Tokyo'])).toBe('Tokyo');
  });
});

describe('chargeur des fiches du monde', () => {
  afterEach(() => oublierFichesMonde());
  const m = JSON.parse(readFileSync('public/geo/fiches-monde.json', 'utf8')) as FichierMonde;
  const fr = JSON.parse(readFileSync('public/geo/fiches-monde.fr.json', 'utf8')) as FichierMondeLangue;

  it('assemble les deux fichiers : sorte et titre de Wikipédia par lieu, noms des sous-régions', () => {
    const d = lireFichesMonde(m, fr);
    expect(d.lieux.size).toBe(258);
    expect(d.lieux.get('JPN')).toEqual({ sorte: 'pays', wp: 'Japon' });
    expect(d.lieux.get('GRL')).toEqual({ sorte: 'territoire', wp: null });
    expect(d.lieux.get('ATA')?.sorte).toBe('continent');
    expect(d.sousRegions['Eastern Asia']).toBe("Asie de l'Est");
    expect(() => lireFichesMonde({ ...m, v: 2 }, fr)).toThrow(/version/);
  });

  it('lit les deux fichiers une fois ; un échec ne reste pas en cache, le toucher suivant réessaie', async () => {
    const lus: string[] = [];
    let echoue = true;
    const lire = async (chemin: string) => {
      lus.push(chemin);
      if (echoue) throw new Error('hors ligne');
      return chemin.endsWith('.fr.json') ? fr : m;
    };
    await expect(chargerFichesMonde(lire)).rejects.toThrow('hors ligne');
    expect(fichesMondeChargees()).toBeNull();
    echoue = false;
    const [a, b] = await Promise.all([chargerFichesMonde(lire), chargerFichesMonde(lire)]);
    expect(a).toBe(b);
    expect(fichesMondeChargees()).toBe(a);
    await chargerFichesMonde(lire);
    expect(lus).toEqual(['/geo/fiches-monde.json', '/geo/fiches-monde.fr.json', '/geo/fiches-monde.json', '/geo/fiches-monde.fr.json']);
  });
});
