import { describe, expect, it } from 'vitest';
import { analyser, fichesDe, former, SENS_ACTIFS, SENS_ENTREE, soeur } from '../src/srs/fiches';
import { jour, jourDe } from '../src/srs/jour';

// Vecteurs écrits à la main : l'heure UTC de chaque instant est convertie de
// l'heure locale à la main (pas par la formule), et le jour attendu est le
// jour civil où tombe la journée locale (la veille avant 4 h).
const utc = (a: number, mo: number, j: number, h: number, mi: number): number => Date.UTC(a, mo - 1, j, h, mi);
/** Numéro du jour civil (a, mo, j) depuis le 1er janvier 1970. */
const civil = (a: number, mo: number, j: number): number => Date.UTC(a, mo - 1, j) / 86_400_000;

describe('jour local, bascule à 4 h', () => {
  it('La Réunion (UTC+4, tz 240)', () => {
    // 6 nov. 2026, 3 h 59 à La Réunion = 5 nov., 23 h 59 UTC : encore le 5.
    expect(jour(utc(2026, 11, 5, 23, 59), 240)).toBe(civil(2026, 11, 5));
    // 6 nov. 2026, 4 h 00 à La Réunion = 6 nov., 0 h 00 UTC : le 6.
    expect(jour(utc(2026, 11, 6, 0, 0), 240)).toBe(civil(2026, 11, 6));
    // 6 nov., 23 h 30 à La Réunion = 6 nov., 19 h 30 UTC : toujours le 6.
    expect(jour(utc(2026, 11, 6, 19, 30), 240)).toBe(civil(2026, 11, 6));
  });

  it('New York en hiver (UTC−5, tz −300)', () => {
    // 6 nov. 2026 (heure d'hiver depuis le 1er nov.), 3 h 59 = 8 h 59 UTC : encore le 5.
    expect(jour(utc(2026, 11, 6, 8, 59), -300)).toBe(civil(2026, 11, 5));
    // 4 h 00 = 9 h 00 UTC : le 6.
    expect(jour(utc(2026, 11, 6, 9, 0), -300)).toBe(civil(2026, 11, 6));
    // 5 nov., 20 h 00 à New York = 6 nov., 1 h 00 UTC : le 5 (le jour UTC dirait le 6).
    expect(jour(utc(2026, 11, 6, 1, 0), -300)).toBe(civil(2026, 11, 5));
  });

  it('New York en été (UTC−4, tz −240)', () => {
    // 14 juil. 2026, 3 h 59 = 7 h 59 UTC : encore le 13.
    expect(jour(utc(2026, 7, 14, 7, 59), -240)).toBe(civil(2026, 7, 13));
    // 4 h 00 = 8 h 00 UTC : le 14.
    expect(jour(utc(2026, 7, 14, 8, 0), -240)).toBe(civil(2026, 7, 14));
  });

  it('jourDe lit un Instant', () => {
    expect(jourDe({ ts: utc(2026, 11, 6, 0, 0), tz: 240 })).toBe(civil(2026, 11, 6));
  });
});

describe('fiches', () => {
  it('former et analyser se répondent', () => {
    expect(former('pays', 'FRA', 'localiser')).toBe('pays:FRA:localiser');
    expect(analyser('communes:97411:nommer')).toEqual({ domaine: 'communes', id: '97411', sens: 'nommer' });
    expect(analyser('pays:NE_KAB:localiser')?.id).toBe('NE_KAB');
  });

  it('analyser refuse ce qui n’est pas une fiche', () => {
    for (const x of ['', 'pays:FRA', 'pays:FRA:localiser:x', 'villes:FRA:localiser', 'pays::localiser', 'pays:FRA:situer']) {
      expect(analyser(x)).toBeNull();
    }
    expect(() => former('pays', 'A:B', 'localiser')).toThrow();
    expect(() => former('pays', '', 'localiser')).toThrow();
  });

  it('soeur : l’autre sens de la même entité', () => {
    expect(soeur('pays:FRA:localiser')).toBe('pays:FRA:nommer');
    expect(soeur('pays:FRA:nommer')).toBe('pays:FRA:localiser');
    expect(soeur('n’importe quoi')).toBeNull();
  });

  it('les deux sens se révisent ; une grappe introduit le sens d’entrée, localiser (décision « Sens « quel est ce pays ? » »)', () => {
    expect(SENS_ACTIFS).toEqual(['localiser', 'nommer']);
    expect(SENS_ENTREE).toBe('localiser');
    expect(fichesDe('pays', 'BEN')).toEqual(['pays:BEN:localiser']);
    expect(fichesDe('pays', 'BEN', SENS_ACTIFS)).toEqual(['pays:BEN:localiser', 'pays:BEN:nommer']);
  });
});
