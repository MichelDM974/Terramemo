// Les formats des scores des épreuves classées (src/vues/scores.ts ; décision
// « Barème et classements » du 12/11/2026, #30) : la part de justes,
// TRONQUÉE (jamais 100 % sans tout juste), « 190/195 · 97 % » ; Sans faute
// sur la taille de sa série ; le général à une décimale sur BORNE_GENERAL.
import { describe, expect, it } from 'vitest';
import { BORNE_GENERAL, idEpreuve } from '../src/epreuve/chrono';
import { fmtJustesGeneral, fmtPart, fmtPourcent, fmtPourcentGeneral, fmtTemps, pourcentDe, scoreCourt, scoreEntier, scoreLong, SECONDES_EPREUVE } from '../src/vues/scores';

/** Espace insécable avant « % » et « s », espace fine insécable des milliers (fr-FR). */
const NB = ' ';
const MILLE = (1194).toLocaleString('fr-FR');
const score = (justes: number, questions: number, temps_ms = 0) => ({ points: justes, justes, questions, temps_ms });

describe('pourcentages tronqués', () => {
  it('la part entière : 194/195 montre 99 %, seul 195/195 montre 100 %', () => {
    expect(fmtPourcent(194, 195)).toBe(`99${NB}%`);
    expect(fmtPourcent(195, 195)).toBe(`100${NB}%`);
    expect(fmtPourcent(190, 195)).toBe(`97${NB}%`);
    expect(fmtPourcent(1, 3)).toBe(`33${NB}%`);
    expect(fmtPourcent(2, 3)).toBe(`66${NB}%`);
    expect(fmtPourcent(0, 0)).toBe(`0${NB}%`);
    expect(fmtPart(190, 195)).toBe(`190/195 · 97${NB}%`);
  });

  it('le général : une décimale tronquée sur BORNE_GENERAL (1 193 → 99,9 %, 91 → 7,6 %), ses justes au détail', () => {
    expect(BORNE_GENERAL).toBe(1194);
    expect(fmtPourcentGeneral(1193)).toBe(`99,9${NB}%`);
    expect(fmtPourcentGeneral(91)).toBe(`7,6${NB}%`);
    expect(fmtPourcentGeneral(1194)).toBe(`100,0${NB}%`);
    expect(fmtPourcentGeneral(0)).toBe(`0,0${NB}%`);
    expect(fmtJustesGeneral(91)).toBe(`91 justes sur ${MILLE}`);
    expect(fmtJustesGeneral(1)).toBe(`1 juste sur ${MILLE}`);
  });
});

describe('le score d’une épreuve', () => {
  const TOUS = idEpreuve('tous');
  const SF_AFR = idEpreuve('Africa', 'sansfaute');

  it('Chrono : sur ses questions, court et long', () => {
    expect(scoreCourt(TOUS, score(194, 195))).toBe(`194/195 · 99${NB}%`);
    expect(scoreEntier(TOUS, score(194, 195))).toBe(`194/195 · 99${NB}%`);
    expect(scoreLong(TOUS, score(190, 195, 185_000))).toBe(`190/195 · 97${NB}% en 3${NB}min${NB}05`);
    expect(pourcentDe(TOUS, score(194, 195))).toBe(`99${NB}%`);
  });

  it('Sans faute : les justes d’affilée sur la taille de la série (tailleEpreuve), pas sur les questions jouées', () => {
    expect(scoreCourt(SF_AFR, score(17, 18))).toBe(`17/54 · 31${NB}%`);
    expect(scoreEntier(SF_AFR, score(17, 18))).toBe(`17 d'affilée sur 54 · 31${NB}%`);
    expect(scoreLong(SF_AFR, score(17, 18, 62_000))).toBe(`17 d'affilée sur 54 · 31${NB}% en 1${NB}min${NB}02`);
    expect(scoreCourt(idEpreuve('reunion', 'sansfaute', 'communes'), score(24, 24))).toBe(`24/24 · 100${NB}%`);
    // Une série que le catalogue ne connaît pas : les justes d'affilée, sans pourcentage.
    const inconnue = 'sansfaute:localiser:Atlantide';
    expect(scoreCourt(inconnue, score(17, 18))).toBe("17 d'affilée");
    expect(scoreLong(inconnue, score(17, 18, 42_000))).toBe(`17 d'affilée en 42${NB}s`);
    expect(pourcentDe(inconnue, score(17, 18))).toBeNull();
  });

  it('le général : son pourcentage en bref, ses justes en entier, de toujours comme de la semaine', () => {
    for (const g of ['general', 'general@s100']) {
      expect(scoreCourt(g, score(91, 120))).toBe(`7,6${NB}%`);
      expect(scoreEntier(g, score(91, 120))).toBe(`91 justes sur ${MILLE}`);
      expect(pourcentDe(g, score(91, 120))).toBe(`7,6${NB}%`);
    }
  });

  it('le quiz (lot 4b) : sur ses 20 questions, comme le Chrono', () => {
    expect(scoreCourt('quiz:general:facile', score(18, 20))).toBe(`18/20 · 90${NB}%`);
  });

  it('15 s par question pour les deux épreuves ; le temps en espaces insécables', () => {
    expect(SECONDES_EPREUVE).toBe(15);
    expect([fmtTemps(42_000), fmtTemps(185_000)]).toEqual([`42${NB}s`, `3${NB}min${NB}05`]);
  });
});
