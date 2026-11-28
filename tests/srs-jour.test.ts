import { describe, expect, it } from 'vitest';
import { analyser, DOMAINES, DOMAINES_JOUABLES, domaineJouable, estDomaine, fichesDe, former, jouablesDu, SENS_ACTIFS, SENS_ENTREE, soeur, TERRAIN_DOMAINE, type Domaine } from '../src/srs/fiches';
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
    for (const x of ['', 'pays:FRA', 'pays:FRA:localiser:x', 'inconnu:FRA:localiser', 'pays::localiser', 'pays:FRA:situer']) {
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

  it('les domaines du J2 se lisent dès le socle : capitales et drapeaux à l’id du pays, mers à leur id (étude J2 § 3.1, 3.3)', () => {
    expect(DOMAINES.slice(0, 5)).toEqual(['pays', 'communes', 'capitales', 'drapeaux', 'mers']);
    expect(former('capitales', 'BOL', 'localiser')).toBe('capitales:BOL:localiser');
    expect(analyser('capitales:BOL:localiser')).toEqual({ domaine: 'capitales', id: 'BOL', sens: 'localiser' });
    expect(analyser('drapeaux:TCD:nommer')).toEqual({ domaine: 'drapeaux', id: 'TCD', sens: 'nommer' });
    expect(analyser('mers:medit:localiser')).toEqual({ domaine: 'mers', id: 'medit', sens: 'localiser' });
    // La sœur reste dans son domaine : jamais la fiche du pays.
    expect(soeur('capitales:BOL:localiser')).toBe('capitales:BOL:nommer');
    expect(soeur('drapeaux:TCD:nommer')).toBe('drapeaux:TCD:localiser');
    expect(soeur('mers:medit:nommer')).toBe('mers:medit:localiser');
    expect(fichesDe('mers', 'medit', SENS_ACTIFS)).toEqual(['mers:medit:localiser', 'mers:medit:nommer']);
    // Toujours refusés : un domaine inconnu, un nom proche, la casse.
    for (const x of ['inconnu:FRA:localiser', 'capitale:BOL:localiser', 'Capitales:BOL:localiser', 'mer:medit:localiser', 'quiz:general:facile']) expect(analyser(x)).toBeNull();
    expect(estDomaine('inconnu')).toBe(false);
  });

  it('les domaines du J4 et du J5 se lisent dès leur socle commun, à la fin de DOMAINES, sur le monde, sans être jouables (études J4 § 7.1, J5 § 13.1)', () => {
    const j4 = ['voisins', 'villes', 'habitants', 'superficies', 'silhouettes'];
    const j5 = ['fleuves', 'montagnes', 'deserts', 'detroits'];
    expect(DOMAINES.slice(5, 14)).toEqual([...j4, ...j5]);
    for (const d of [...j4, ...j5]) {
      expect(estDomaine(d), d).toBe(true);
      expect(domaineJouable(d), d).toBe(false);
      expect(TERRAIN_DOMAINE[d as Domaine], d).toBe('monde');
    }
    // Les villes à leur Qid : former, analyser et la sœur restent dans le domaine.
    expect(former('villes', 'Q90', 'localiser')).toBe('villes:Q90:localiser');
    expect(analyser('villes:Q90:localiser')).toEqual({ domaine: 'villes', id: 'Q90', sens: 'localiser' });
    expect(soeur('villes:Q90:localiser')).toBe('villes:Q90:nommer');
    expect(analyser('voisins:HUN:nommer')).toEqual({ domaine: 'voisins', id: 'HUN', sens: 'nommer' });
    expect(analyser('fleuves:danube:localiser')).toEqual({ domaine: 'fleuves', id: 'danube', sens: 'localiser' });
    expect(soeur('detroits:ormuz:nommer')).toBe('detroits:ormuz:localiser');
    // Toujours refusés : un nom proche, la casse, un singulier.
    for (const x of ['ville:Q90:localiser', 'Villes:Q90:localiser', 'fleuve:danube:localiser', 'desert:sahara:nommer']) expect(analyser(x)).toBeNull();
  });

  it('lire n’est pas savoir poser : pays, capitales (lot 1), drapeaux (lot 2), mers (lot 3b) et communes sont jouables, chacun sur son terrain (étude J2 § 3.1)', () => {
    expect(DOMAINES_JOUABLES).toEqual(['pays', 'capitales', 'drapeaux', 'mers', 'communes']);
    expect(DOMAINES.filter(domaineJouable)).toEqual(['pays', 'communes', 'capitales', 'drapeaux', 'mers']);
    expect(['inconnu', 'villes', 'fleuves'].some(domaineJouable)).toBe(false);
    expect(jouablesDu('monde')).toEqual(['pays', 'capitales', 'drapeaux', 'mers']);
    expect(jouablesDu('reunion')).toEqual(['communes']);
    expect(DOMAINES.slice(0, 5).map((d) => TERRAIN_DOMAINE[d])).toEqual(['monde', 'reunion', 'monde', 'monde', 'monde']);
  });

  it('les deux sens se révisent ; une grappe introduit le sens d’entrée, localiser (décision « Sens « quel est ce pays ? » »)', () => {
    expect(SENS_ACTIFS).toEqual(['localiser', 'nommer']);
    expect(SENS_ENTREE).toBe('localiser');
    expect(fichesDe('pays', 'BEN')).toEqual(['pays:BEN:localiser']);
    expect(fichesDe('pays', 'BEN', SENS_ACTIFS)).toEqual(['pays:BEN:localiser', 'pays:BEN:nommer']);
  });
});
