// Lots de la synchro (J1b, lot 3 ; étude § 5.2 et § 6) : encodage par
// position, aller-retour exact (null et absent compris), borne des règles à
// 200 réponses aux champs les plus longs, composition (séance, appareil,
// tri, coupe par 200), copie client de lotValide.
import { describe, expect, it } from 'vitest';
import { valider, type Evenement } from '../src/srs/journal';
import { CARACTERES_PAR_EVENEMENT, compacter, composer, decoderId, deplier, docDuLot, encoderId, idsDuLot, N_MAX, problemeLot, trier, type DocLot } from '../src/sync/lots';

const APPAREIL = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const SEANCE = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
let k = 0;
/** Un uuid v4 distinct à chaque appel, en minuscules. */
const id = () => `${(++k).toString(16).padStart(8, '0')}-1111-4222-8333-${(k * 7919).toString(16).padStart(12, '0')}`;

function reponse(o: Partial<Evenement> = {}): Evenement {
  return {
    v: 1,
    id: id(),
    appareil: APPAREIL,
    ts: 1_762_500_000_000 + k * 1000,
    tz: 240,
    seance: SEANCE,
    type: 'reponse',
    fiche: 'pays:FRA:localiser',
    mode: 'revision',
    reponse: null,
    via: 'trace',
    zoom: 1.2345678901234567,
    correct: true,
    aide: null,
    duree_ms: 2345,
    distance_km: null,
    note: 3,
    ...o,
  };
}

/** Le document d'un lot de ces événements (même appareil, même séance), triés. */
const doc = (evts: Evenement[]): DocLot => docDuLot({ id: evts[0]!.id, appareil: APPAREIL, seance: evts[0]!.seance, evenements: trier(evts) });

/** Les champs présents, undefined compris comme absent (IndexedDB garde un undefined explicite). */
const propre = (e: Evenement) => Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined));

describe('ids', () => {
  it('un uuid en minuscules en 22 caractères base64url, aller-retour exact ; tout autre id tel quel derrière « = »', () => {
    const u = id();
    const b = encoderId(u);
    expect(b).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(decoderId(b)).toBe(u);
    for (const autre of ['FRA', 'pays-1', u.toUpperCase(), 'x'.repeat(64), '=deja']) {
      expect(encoderId(autre)).toBe(`=${autre}`);
      expect(decoderId(encoderId(autre))).toBe(autre);
    }
  });

  it('refuse ce qui n’est pas une écriture d’id', () => {
    for (const x of [null, 3, '', '=', 'abc', 'A'.repeat(23), 'A'.repeat(21) + 'B'])
      // 'A'×21 + 'B' : les 4 derniers bits ne sont pas nuls, ce n'est pas une écriture d'uuid.
      expect(decoderId(x)).toBeNull();
  });
});

describe('compacter et deplier', () => {
  it('aller-retour exact pour chaque type, chaque champ facultatif absent, null ou rempli', () => {
    const evts: Evenement[] = [
      reponse(),
      reponse({ correct: false, reponse: 'ITA', via: null, distance_km: 312.98765432109876, note: 1, aide: 'voir' }),
      reponse({ mode: 'qcm', note: null, zoom: null, aide: 'passer', fiche: 'pays:ITA:nommer' }),
      reponse({ mode: 'rappel', aide: 'connu', note: 4, via: 'pastille' }),
      reponse({ mode: 'libre', note: null, via: 'proche', fiche: 'communes:97411:localiser' }),
      // Champs absents (pas null) : un événement d'avant un champ, ou un type sans réponse.
      reponse({ zoom: undefined, distance_km: undefined, via: undefined, aide: undefined, reponse: undefined }),
      { v: 1, id: id(), appareil: APPAREIL, ts: 1_762_500_100_000, tz: -300, seance: SEANCE, type: 'reinitialiser', fiche: 'pays:FRA:localiser' },
      { v: 1, id: id(), appareil: APPAREIL, ts: 1_762_500_100_000, tz: 0, seance: SEANCE, type: 'connu', fiche: 'pays:DEU:localiser', note: null },
      // Un id qui n'est pas un uuid en minuscules.
      reponse({ id: id().toUpperCase() }),
    ];
    for (const e of evts) expect(valider(e), JSON.stringify(e)).toBe(true);
    const d = doc(evts);
    const r = deplier(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.evenements.map(propre)).toEqual(trier(evts).map(propre));
    // Rien d'absent ne revient en null, ni l'inverse.
    const absent = r.evenements.find((e) => e.id === evts[5]!.id)!;
    expect('zoom' in absent).toBe(false);
    expect(r.evenements.find((e) => e.id === evts[0]!.id)!.reponse).toBeNull();
  });

  it('les instants : le premier en entier, les autres en écart, l’ordre (ts, id) gardé à instant égal', () => {
    const a = reponse({ ts: 5_000 });
    const b = reponse({ ts: 5_000 });
    const c = reponse({ ts: 4_000 });
    const d = doc([a, b, c]);
    const cartes = JSON.parse(d.evenements) as unknown[][];
    expect(cartes.map((x) => x[1])).toEqual([4_000, 1_000, 1_000]);
    const r = deplier(d);
    expect(r.ok && r.evenements.map((e) => e.id)).toEqual(trier([a, b, c]).map((e) => e.id));
  });

  it('≈ 100 caractères par réponse type (D35)', () => {
    const evts = Array.from({ length: 40 }, (_, i) =>
      i % 4 === 0 ? reponse({ correct: false, reponse: 'ITA', via: null, distance_km: 123.4, note: 1, zoom: 2.5 }) : reponse({ zoom: 1 + i / 7 }),
    );
    const moyenne = doc(evts).evenements.length / evts.length;
    expect(moyenne).toBeLessThan(120);
  });

  it('200 réponses aux champs les plus longs tiennent la borne des règles (n × 160)', () => {
    // Les plus longs que l'appli écrit : fiche de commune, id de commune en réponse, zoom et
    // distance en pleine précision, durée d'un jour, fuseau négatif à trois chiffres, une partie
    // libre ouverte plusieurs jours (écart de 9 chiffres).
    const evts = Array.from({ length: N_MAX }, (_, i) =>
      reponse({
        ts: 1_762_500_000_000 + i * 2_000_000,
        tz: -720,
        fiche: 'communes:97411:localiser',
        mode: 'revision',
        correct: false,
        reponse: '97424',
        via: null,
        zoom: 0.00012345678901234567,
        aide: 'passer',
        duree_ms: 86_400_000,
        distance_km: 20_099.123456789012,
        note: 1,
      }),
    );
    const d = doc(evts);
    expect(d.n).toBe(N_MAX);
    expect(d.evenements.length).toBeLessThanOrEqual(N_MAX * CARACTERES_PAR_EVENEMENT);
    expect(problemeLot(trier(evts)[0]!.id, d)).toBeNull();
  });

  it('un lot illisible pour cette version : v inconnu, n faux, carte refusée, valeur hors du format', () => {
    const e = reponse();
    const d = doc([e]);
    expect(deplier({ ...d, v: 2 }).ok).toBe(false);
    expect(deplier({ ...d, n: 2 }).ok).toBe(false);
    expect(deplier({ ...d, evenements: 'pas du json' }).ok).toBe(false);
    const carte = (JSON.parse(d.evenements) as unknown[][])[0]!;
    const avec = (i: number, x: unknown) => JSON.stringify([carte.map((y, j) => (j === i ? x : y))]);
    expect(deplier({ ...d, evenements: avec(3, 9) }).ok).toBe(false); // type inconnu
    expect(deplier({ ...d, evenements: avec(4, 'pays:FRA') }).ok).toBe(false); // fiche refusée par valider()
    expect(deplier({ ...d, evenements: avec(6, 7) }).ok).toBe(false); // mode hors du format
    expect(deplier({ ...d, evenements: JSON.stringify([[...carte, 1]]) }).ok).toBe(false); // valeur en trop
    expect(deplier({ ...d, evenements: JSON.stringify([carte.slice(0, -1)]) }).ok).toBe(false); // valeur manquante
  });

  it('idsDuLot lit les ids sans valider les cartes (lot d’une version plus récente)', () => {
    const a = reponse();
    const b = reponse();
    const d = doc([a, b]);
    expect(idsDuLot(d)).toEqual(trier([a, b]).map((e) => e.id));
    const futur = JSON.stringify((JSON.parse(d.evenements) as unknown[][]).map((c) => [c[0], 'champ de la v2']));
    expect(idsDuLot({ evenements: futur })).toEqual(trier([a, b]).map((e) => e.id));
    expect(() => idsDuLot({ evenements: '[[3]]' })).toThrow();
    expect(() => idsDuLot({})).toThrow();
  });
});

describe('composer', () => {
  it('un lot par appareil et par séance, null à part, trié par (ts, id), coupé par 200, id du premier', () => {
    const autreSeance = '1a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
    const autreAppareil = '7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    const longue = Array.from({ length: 450 }, (_, i) => reponse({ ts: 10_000 + i, seance: SEANCE }));
    const courte = [reponse({ ts: 20_000, seance: autreSeance }), reponse({ ts: 19_000, seance: autreSeance })];
    const hors = [reponse({ ts: 5_000, seance: null })];
    const ailleurs = [reponse({ ts: 10_500, seance: SEANCE, appareil: autreAppareil })];
    const lots = composer([...courte, ...longue.slice().reverse(), ...hors, ...ailleurs]);
    expect(lots.map((l) => [l.seance, l.appareil === APPAREIL, l.evenements.length])).toEqual([
      [null, true, 1],
      [SEANCE, true, 200],
      [SEANCE, true, 200],
      [SEANCE, true, 50],
      [SEANCE, false, 1],
      [autreSeance, true, 2],
    ]);
    for (const l of lots) {
      expect(l.id).toBe(l.evenements[0]!.id);
      expect(l.evenements).toEqual(trier(l.evenements));
    }
    expect(lots[1]!.evenements[0]!.ts).toBe(10_000);
    expect(lots[3]!.evenements[0]!.ts).toBe(10_400);
    expect(composer([])).toEqual([]);
  });
});

describe('problemeLot (lotValide des règles, recopiée)', () => {
  it('un lot composé passe ; chaque borne des règles refuse', () => {
    const e = reponse();
    const d = doc([e]);
    expect(problemeLot(e.id, d)).toBeNull();
    expect(problemeLot(e.id.slice(1), d)).toBe('id');
    expect(problemeLot(e.id, { ...d, v: 2 })).toBe('v');
    expect(problemeLot(e.id, { ...d, appareil: 'court' })).toBe('appareil');
    expect(problemeLot(e.id, { ...d, seance: 'courte' })).toBe('seance');
    expect(problemeLot(e.id, { ...d, n: 0 })).toBe('n');
    expect(problemeLot(e.id, { ...d, n: 201 })).toBe('n');
    expect(problemeLot(e.id, { ...d, evenements: 'x'.repeat(161) })).toBe('evenements');
    expect(problemeLot(id(), d)).toBe('premier id');
    // Un événement dont la séance n'est pas un uuid : le lot ne passerait pas les règles.
    const hors = reponse({ seance: 'seance-x' });
    expect(problemeLot(hors.id, docDuLot({ id: hors.id, appareil: APPAREIL, seance: 'seance-x', evenements: [hors] }))).toBe('seance');
    // Une séance nulle passe.
    const sans = reponse({ seance: null });
    expect(problemeLot(sans.id, docDuLot({ id: sans.id, appareil: APPAREIL, seance: null, evenements: [sans] }))).toBeNull();
  });
});
