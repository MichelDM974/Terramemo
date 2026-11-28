import { describe, expect, it } from 'vitest';
import { echeance, PARAMS_FSRS, planificateur } from '../src/srs/fsrs';
import { probleme, valider, type Evenement } from '../src/srs/journal';
import { AGAIN, EASY, GOOD, noteEtape, noter, type Note } from '../src/srs/note';
import { etat, ordonner } from '../src/srs/rejeu';

const utc = (a: number, mo: number, j: number, h: number, mi = 0): number => Date.UTC(a, mo - 1, j, h, mi);
const civil = (a: number, mo: number, j: number): number => Date.UTC(a, mo - 1, j) / 86_400_000;

let n = 0;
/** Réponse notée d'une révision, à l'instant ts (fuseau tz). */
function rep(fiche: string, ts: number, tz: number, note: Note | null, plus: Partial<Evenement> = {}): Evenement {
  n++;
  return {
    v: 1, id: `e${String(n).padStart(4, '0')}`, appareil: 'A', ts, tz, seance: 's1', type: 'reponse', fiche,
    mode: note == null ? 'qcm' : 'revision', correct: note !== 1, aide: null, reponse: null, note, ...plus,
  };
}

/** Générateur à graine (mulberry32) pour les permutations. */
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

describe('règle de note (défaut D3)', () => {
  it('faux, Voir ou Passer : Again ; juste : Good ; juste après « Je connais déjà » : Easy ; jamais Hard', () => {
    expect(noter({ correct: false, aide: null })).toBe(AGAIN);
    expect(noter({ correct: true, aide: 'voir' })).toBe(AGAIN);
    expect(noter({ correct: false, aide: 'passer' })).toBe(AGAIN);
    expect(noter({ correct: false, aide: 'connu' })).toBe(AGAIN);
    expect(noter({ correct: true, aide: null })).toBe(GOOD);
    expect(noter({ correct: true, aide: 'connu' })).toBe(EASY);
  });

  it('QCM et partie libre : hors FSRS', () => {
    expect(noteEtape('qcm', { correct: true, aide: null })).toBeNull();
    expect(noteEtape('libre', { correct: false, aide: null })).toBeNull();
    expect(noteEtape('rappel', { correct: true, aide: null })).toBe(GOOD);
    expect(noteEtape('revision', { correct: false, aide: null })).toBe(AGAIN);
  });
});

describe('validation des événements', () => {
  const ok = rep('pays:FRA:localiser', utc(2026, 11, 6, 8), 240, GOOD, { via: 'trace', zoom: 1, duree_ms: 2300, distance_km: 0 });

  it('un événement complet est valide', () => {
    expect(probleme(ok)).toBeNull();
    expect(valider({ v: 1, id: 'x', appareil: 'A', ts: 0, tz: 0, seance: null, type: 'reinitialiser', fiche: 'pays:FRA:localiser' })).toBe(true);
  });

  it('types et bornes', () => {
    const cas: [Record<string, unknown>, string][] = [
      [{ v: 2 }, 'version'],
      [{ id: '' }, 'id'],
      [{ ts: 1.5 }, 'ts'],
      [{ tz: 900 }, 'tz'],
      [{ tz: -721 }, 'tz'],
      [{ seance: 3 }, 'seance'],
      [{ type: 'autre' }, 'type'],
      [{ fiche: 'FRA' }, 'fiche'],
      [{ mode: 'chrono' }, 'mode'],
      [{ via: 'clic' }, 'via'],
      [{ zoom: 0 }, 'zoom'],
      [{ correct: 'oui' }, 'correct'],
      [{ aide: 'indice' }, 'aide'],
      [{ duree_ms: -1 }, 'duree_ms'],
      [{ distance_km: 30_000 }, 'distance_km'],
      [{ note: 5 }, 'note'],
      [{ note: 0 }, 'note'],
      [{ estime: 0 }, 'estime'],
      [{ estime: -3 }, 'estime'],
      [{ estime: Infinity }, 'estime'],
      [{ estime: 2e10 }, 'estime'],
      [{ estime: '5' }, 'estime'],
      [{ autre: 1 }, 'champ inconnu : autre'],
    ];
    for (const [modif, attendu] of cas) expect(probleme({ ...ok, ...modif }), JSON.stringify(modif)).toBe(attendu);
    expect(probleme(null)).toBe('pas un objet');
  });

  it('cohérence : note figée seulement en rappel ou révision, reponse seulement si faux', () => {
    expect(probleme({ ...ok, mode: 'qcm' })).toBe('note hors FSRS en mode qcm');
    expect(probleme({ ...ok, mode: 'libre', note: null })).toBeNull();
    expect(probleme({ ...ok, reponse: 'BEL' })).toBe('reponse remplie sur une réponse juste');
    expect(probleme({ ...ok, correct: false, note: AGAIN, reponse: 'BEL' })).toBeNull();
    const { note: _n, ...sansNote } = ok;
    expect(probleme(sansNote)).toBe('reponse sans note');
    expect(probleme({ ...ok, type: 'reinitialiser' })).toBe('note sur un événement reinitialiser');
    // `estime` (D617) : sur une réponse seulement, comme la note.
    expect(probleme({ ...ok, estime: 5 })).toBeNull();
    expect(probleme({ ...ok, type: 'connu', note: null, estime: 5 })).toBe('estime sur un événement connu');
    expect(probleme({ v: 1, id: 'x', appareil: 'A', ts: 0, tz: 0, seance: null, type: 'reinitialiser', fiche: 'pays:FRA:localiser', estime: 5 })).toBe('estime sur un événement reinitialiser');
  });
});

describe('vecteurs FSRS figés (PARAMS_FSRS : rétention 0,9, sans étapes courtes ni flou)', () => {
  it('paramètres', () => {
    expect(PARAMS_FSRS).toEqual({ request_retention: 0.9, enable_short_term: false, enable_fuzz: false });
  });

  // Good, puis Good à l'échéance, puis Again à l'échéance : 3 j, 14 j, 2 j
  // (poids par défaut de ts-fsrs 5.4.2). Les heures locales sont choisies pour
  // que le jour UTC diffère du jour local : 20 h ou 21 h à New York (déjà le
  // lendemain en UTC), 2 h à La Réunion (encore la veille en jour local).
  const vecteurs = [
    {
      lieu: 'New York (UTC−5)', tz: -300,
      // 5 nov. 20 h, 8 nov. 18 h, 22 nov. 21 h, heure de New York.
      instants: [utc(2026, 11, 6, 1), utc(2026, 11, 8, 23), utc(2026, 11, 23, 2)],
      jours: [civil(2026, 11, 5), civil(2026, 11, 8), civil(2026, 11, 22)],
    },
    {
      lieu: 'La Réunion (UTC+4)', tz: 240,
      // 7 nov. 2 h (jour local : le 6), 9 nov. 10 h, 24 nov. 3 h 30 (jour local : le 23).
      instants: [utc(2026, 11, 6, 22), utc(2026, 11, 9, 6), utc(2026, 11, 23, 23, 30)],
      jours: [civil(2026, 11, 6), civil(2026, 11, 9), civil(2026, 11, 23)],
    },
  ];
  for (const v of vecteurs) {
    it(v.lieu, () => {
      const f = 'pays:FRA:localiser';
      const notes: Note[] = [GOOD, GOOD, AGAIN];
      const attendus = [3, 14, 2];
      const journal: Evenement[] = [];
      for (let i = 0; i < 3; i++) {
        journal.push(rep(f, v.instants[i]!, v.tz, notes[i]!));
        const e = etat(journal).get(f)!;
        expect(e.dernier_jour).toBe(v.jours[i]);
        expect(e.echeance_jour - e.dernier_jour).toBe(attendus[i]);
        // Chaque note tombe le jour de l'échéance précédente.
        if (i < 2) expect(e.echeance_jour).toBe(v.jours[i + 1]);
      }
      const e = etat(journal).get(f)!;
      expect(e.notes).toBe(3);
      expect(e.echecs).toBe(1);
      expect(e.introduite_jour).toBe(v.jours[0]);
      expect(e.carte.stability).toBeCloseTo(1.7264, 3);
    });
  }

  it('New York : 20 h puis 18 h le lendemain font un jour (en jours UTC ce serait 0)', () => {
    const f = 'pays:PER:localiser';
    // 5 nov. 20 h (6 nov. 1 h UTC), puis 6 nov. 18 h (6 nov. 23 h UTC) : même jour UTC.
    const a = rep(f, utc(2026, 11, 6, 1), -300, GOOD);
    const b = rep(f, utc(2026, 11, 6, 23), -300, GOOD);
    const e = etat([a, b]).get(f)!;
    expect(e.notes).toBe(2);
    const p = planificateur();
    const attendu = p.noter(p.noter(p.neuve(0), 0, GOOD), 1, GOOD);
    expect(e.carte.stability).toBeCloseTo(attendu.stability, 9);
    expect(e.carte.stability).toBeGreaterThan(2.3065 + 0.1);
    expect(e.echeance_jour - e.dernier_jour).toBe(echeance(attendu) - 1);
  });
});

describe('rejeu', () => {
  // Un journal varié : trois fiches, deux appareils, plusieurs jours, des QCM,
  // des reprises le même jour, une réinitialisation.
  const J = (j: number, h: number): number => utc(2026, 11, j, h); // heure UTC, tz 240 : +4 h
  const journal: Evenement[] = [
    rep('pays:FRA:localiser', J(1, 6), 240, null),
    rep('pays:FRA:localiser', J(1, 7), 240, GOOD, { mode: 'rappel' }),
    rep('pays:FRA:localiser', J(1, 8), 240, AGAIN, { mode: 'revision' }), // même jour : ignorée
    rep('pays:BEL:localiser', J(1, 7), 240, AGAIN, { mode: 'rappel', appareil: 'B' }),
    rep('pays:BEL:localiser', J(2, 7), 240, GOOD, { appareil: 'B' }),
    rep('pays:FRA:localiser', J(4, 7), 240, GOOD),
    rep('pays:FRA:localiser', J(4, 7), 240, AGAIN, { appareil: 'B' }), // même jour, second appareil : ignorée
    rep('pays:DEU:localiser', J(3, 7), 240, EASY, { mode: 'rappel', aide: 'connu' }),
    { v: 1, id: 'reinit', appareil: 'A', ts: J(5, 7), tz: 240, seance: null, type: 'reinitialiser', fiche: 'pays:DEU:localiser' },
    { v: 1, id: 'connu', appareil: 'A', ts: J(5, 8), tz: 240, seance: null, type: 'connu', fiche: 'pays:ITA:localiser' },
    rep('pays:DEU:localiser', J(6, 7), 240, GOOD),
    rep('pays:BEL:localiser', J(8, 7), 240, GOOD),
  ];
  const plat = (m: Map<string, unknown>): string => JSON.stringify([...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  const reference = plat(etat(journal));

  it('une note par fiche et par jour : la première du jour local s’applique', () => {
    const fra = etat(journal).get('pays:FRA:localiser')!;
    expect(fra.notes).toBe(2);
    expect(fra.echecs).toBe(0);
    const seul = etat([journal[1]!, journal[5]!]).get('pays:FRA:localiser')!;
    expect(seul.carte).toEqual(fra.carte);
  });

  it('réinitialiser remet la fiche à neuf ; connu est sans effet ; QCM hors FSRS', () => {
    const m = etat(journal);
    const deu = m.get('pays:DEU:localiser')!;
    expect(deu.notes).toBe(1);
    expect(deu.introduite_jour).toBe(civil(2026, 11, 6));
    expect(m.has('pays:ITA:localiser')).toBe(false);
    expect(etat([journal[0]!]).size).toBe(0);
  });

  it('invariant par permutation et par doublons', () => {
    const alea = graine(42);
    for (let k = 0; k < 20; k++) {
      const avecDoublons = [...journal, ...journal.filter(() => alea() < 0.5)];
      expect(plat(etat(melanger(avecDoublons, alea)))).toBe(reference);
    }
  });

  it('même id, ts et appareil mais contenus différents : le même gardé quel que soit l’ordre', () => {
    const a = rep('pays:PER:localiser', utc(2026, 11, 6, 8), 240, GOOD, { id: 'x' });
    const b: Evenement = { ...a, correct: false, note: AGAIN };
    expect(etat([a]).get(a.fiche)!.echeance_jour).not.toBe(etat([b]).get(a.fiche)!.echeance_jour);
    expect(plat(etat([a, b]))).toBe(plat(etat([b, a])));
    expect(ordonner([a, b])).toEqual(ordonner([b, a]));
    expect(ordonner([a, b])).toHaveLength(1);
  });

  it('union de deux journaux = rejeu de l’ensemble', () => {
    const alea = graine(7);
    for (let k = 0; k < 20; k++) {
      // Deux appareils qui ont chacun une partie (avec un recouvrement), puis s'unissent.
      const a = journal.filter(() => alea() < 0.6);
      const b = journal.filter((e) => !a.includes(e) || alea() < 0.3);
      expect(plat(etat([...b, ...a]))).toBe(reference);
    }
  });

  it('ignore les événements mal formés et ordonne par (ts, appareil, id)', () => {
    const mauvais = { ...journal[1]!, id: 'mauvais', note: 7 };
    expect(plat(etat([...journal, mauvais, 'n’importe quoi', null]))).toBe(reference);
    const o = ordonner([journal[3]!, journal[1]!, journal[0]!]);
    expect(o.map((e) => e.id)).toEqual([journal[0]!.id, journal[1]!.id, journal[3]!.id]);
  });

  it('une note d’un jour antérieur à la dernière appliquée est ignorée (fuseau changé)', () => {
    // 10 nov. 1 h UTC : le 10 à La Réunion (5 h), puis 10 nov. 2 h UTC à New York : le 9 au soir.
    const a = rep('pays:CHL:localiser', utc(2026, 11, 10, 1), 240, GOOD);
    const b = rep('pays:CHL:localiser', utc(2026, 11, 10, 2), -300, AGAIN);
    const e = etat([a, b]).get('pays:CHL:localiser')!;
    expect(e.notes).toBe(1);
    expect(e.dernier_jour).toBe(civil(2026, 11, 10));
  });
});
