import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';
import type { CarteFsrs } from '../src/srs/fsrs';
import { grappesPays, type Grappe } from '../src/srs/grappes';
import type { Evenement } from '../src/srs/journal';
import { AGAIN, GOOD, type Note } from '../src/srs/note';
import {
  dues,
  GRAPPES_PAR_JOUR,
  grappeSuivante,
  introductions,
  maitrises,
  programme,
  REVISIONS_PAR_JOUR,
  REVISIONS_PAR_SEANCE,
  revisionsFaites,
  seau,
  seauxEntites,
  type Seau,
} from '../src/srs/planif';
import { etat, type EtatFiche } from '../src/srs/rejeu';

// Jour local d (numéro de jour), à La Réunion : midi local = 8 h UTC.
const D0 = Date.UTC(2026, 10, 2) / 86_400_000;
const midi = (j: number, h = 0): number => j * 86_400_000 + (8 + h) * 3_600_000;
let n = 0;
function rep(fiche: string, j: number, note: Note, mode: 'rappel' | 'revision' = 'revision', h = 0): Evenement {
  n++;
  return { v: 1, id: `p${n}`, appareil: 'A', ts: midi(j, h), tz: 240, seance: null, type: 'reponse', fiche, mode, correct: note !== 1, aide: null, note };
}

describe('plafonds (défauts D5)', () => {
  it('valeurs', () => {
    expect([REVISIONS_PAR_SEANCE, REVISIONS_PAR_JOUR, GRAPPES_PAR_JOUR]).toEqual([25, 60, 1]);
  });
});

describe('dues', () => {
  // FRA Good le jour 0 (échéance +3), BEL Again le jour 0 (+1), DEU Good le jour 1 (+3 → jour 4).
  const m = etat([rep('pays:FRA:localiser', D0, GOOD, 'rappel'), rep('pays:BEL:localiser', D0, AGAIN, 'rappel'), rep('pays:DEU:localiser', D0 + 1, GOOD, 'rappel')]);

  it('échéance au plus tard ce jour, la plus ancienne d’abord puis par id', () => {
    expect(dues(m, D0)).toEqual([]);
    expect(dues(m, D0 + 1)).toEqual(['pays:BEL:localiser']);
    expect(dues(m, D0 + 3)).toEqual(['pays:BEL:localiser', 'pays:FRA:localiser']);
    // Échéances jours 1, 3, 4 : BEL, FRA, DEU (l'ordre des échéances prime sur l'id).
    expect(dues(m, D0 + 4)).toEqual(['pays:BEL:localiser', 'pays:FRA:localiser', 'pays:DEU:localiser']);
    expect(dues(m, D0 + 4, 'communes')).toEqual([]);
  });

  it('sœurs : pas due le jour où la sœur est notée ou introduite', () => {
    // ITA nommer introduite le jour 0 (Again, due le jour 1) ; ITA localiser introduite le jour 1.
    const s = etat([rep('pays:ITA:nommer', D0, AGAIN, 'rappel'), rep('pays:ITA:localiser', D0 + 1, AGAIN, 'rappel')]);
    expect(dues(s, D0 + 1)).toEqual([]);
    // Le jour 2, les deux sont dues (échéances jours 1 et 2) : seule la plus en retard est proposée.
    expect(dues(s, D0 + 2)).toEqual(['pays:ITA:nommer']);
    // Une fois l'une notée le jour 2, l'autre attend le lendemain.
    const t = etat([...[rep('pays:ITA:nommer', D0, AGAIN, 'rappel'), rep('pays:ITA:localiser', D0 + 1, AGAIN, 'rappel')], rep('pays:ITA:nommer', D0 + 2, GOOD)]);
    expect(dues(t, D0 + 2)).toEqual([]);
    expect(dues(t, D0 + 3)).toContain('pays:ITA:localiser');
  });
});

describe('programme d’une séance', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const gs = grappesPays(pays);
  const ids = gs.flatMap((g) => g.membres);
  const premiere = gs[0]!;

  /** k pays introduits le jour 0 par Again : tous dus le jour 1. */
  const introduits = (k: number): Evenement[] => ids.slice(0, k).map((id) => rep(`pays:${id}:localiser`, D0, AGAIN, 'rappel'));

  it('journal vide : aucune révision, la première grappe entière', () => {
    const p = programme(new Map(), D0, gs, 'pays');
    expect(p.revisions).toEqual([]);
    expect(p.restantes).toBe(0);
    expect(p.nouveautes?.grappe).toBe(premiere);
    expect(p.nouveautes?.ids).toEqual(premiere.membres);
    expect(p.nouveautes?.fiches).toEqual(premiere.membres.map((id) => `pays:${id}:localiser`));
  });

  it('une grappe par jour : celle commencée ce jour se finit, pas d’autre ; le lendemain, la suivante après les introductions', () => {
    const debut = premiere.membres.slice(0, 2).map((id) => rep(`pays:${id}:localiser`, D0, GOOD, 'rappel'));
    // Quittée en plein rappel : le reste de la même grappe, le même jour (jamais coupée).
    const p0 = programme(etat(debut), D0, gs, 'pays');
    expect(p0.nouveautes?.grappe).toBe(premiere);
    expect(p0.nouveautes?.ids).toEqual(premiere.membres.slice(2));
    // Toute la grappe faite : pas d'autre ce jour-là.
    const toute = premiere.membres.map((id) => rep(`pays:${id}:localiser`, D0, GOOD, 'rappel'));
    const p1 = programme(etat(toute), D0, gs, 'pays');
    expect(p1.nouveautes).toBeNull();
    expect(p1.sansNouveautes).toBe('grappe_faite');
    expect(p1.introductions).toEqual([]); // la sœur nommer jamais le même jour
    // Le lendemain : les fiches nommer de la grappe, puis la grappe suivante.
    const p2 = programme(etat(toute), D0 + 1, gs, 'pays');
    expect(p2.revisions).toEqual([]);
    expect(p2.introductions).toEqual(premiere.membres.map((id) => `pays:${id}:nommer`).sort());
    expect(p2.nouveautes?.grappe).toBe(gs[1]);
    expect(p2.sansNouveautes).toBeNull();
  });

  it('introductions nommer : pas le jour où la sœur localiser est due ou notée', () => {
    // FRA Again le jour 0 : localiser due le jour 1, nommer attend.
    const m = etat([rep('pays:FRA:localiser', D0, AGAIN, 'rappel'), rep('pays:BEL:localiser', D0, GOOD, 'rappel')]);
    expect(introductions(m, D0 + 1)).toEqual(['pays:BEL:nommer']);
    expect(programme(m, D0 + 1, gs, 'pays').revisions).toEqual(['pays:FRA:localiser']);
    // FRA revue le jour 1 : sa sœur nommer le jour 2 (BEL nommer reste due d'introduction).
    const m2 = etat([rep('pays:FRA:localiser', D0, AGAIN, 'rappel'), rep('pays:BEL:localiser', D0, GOOD, 'rappel'), rep('pays:FRA:localiser', D0 + 1, GOOD)]);
    expect(introductions(m2, D0 + 1)).toEqual(['pays:BEL:nommer']);
    expect(introductions(m2, D0 + 2)).toEqual(['pays:BEL:nommer', 'pays:FRA:nommer']);
    // Une fois introduite, la fiche nommer est révisée comme les autres (carte retournée) ; les deux sens dus le même jour : un seul.
    const m3 = etat([rep('pays:BEL:localiser', D0, AGAIN, 'rappel'), rep('pays:BEL:nommer', D0 + 2, AGAIN, 'rappel'), rep('pays:BEL:localiser', D0 + 2 - 1, AGAIN)]);
    expect(introductions(m3, D0 + 3)).toEqual([]);
    expect(dues(m3, D0 + 3)).toEqual(['pays:BEL:localiser']);
  });

  it('pas de nouveautés tant qu’une révision due reste ; plafonds par séance et par jour', () => {
    const m = etat(introduits(70));
    const p = programme(m, D0 + 1, gs, 'pays');
    expect(p.revisions.length).toBe(25);
    expect(p.restantes).toBe(45);
    expect(p.nouveautes).toBeNull();
    // 50 révisions faites le jour 1 : il en reste 10 permises ce jour-là.
    const faites = ids.slice(0, 50).map((id) => rep(`pays:${id}:localiser`, D0 + 1, GOOD));
    const m2 = etat([...introduits(70), ...faites]);
    expect(revisionsFaites(m2, D0 + 1)).toBe(50);
    const p2 = programme(m2, D0 + 1, gs, 'pays');
    // Les 20 restantes, toutes dues le jour 1 : par id, les 10 premières.
    expect(p2.revisions).toEqual(ids.slice(50, 70).map((id) => `pays:${id}:localiser`).sort().slice(0, 10));
    expect(p2.restantes).toBe(10);
    expect(p2.nouveautes).toBeNull();
    expect(p2.sansNouveautes).toBe('dues');
    // 60 faites : plus rien ce jour-là, même s'il en reste dues.
    const m3 = etat([...introduits(70), ...ids.slice(0, 60).map((id) => rep(`pays:${id}:localiser`, D0 + 1, GOOD))]);
    expect(programme(m3, D0 + 1, gs, 'pays').revisions).toEqual([]);
    expect(programme(m3, D0 + 1, gs, 'pays').sansNouveautes).toBe('plafond');
  });

  it('une séance qui couvre toutes les dues propose la grappe suivante après elles', () => {
    const avant = gs.slice(0, 2).flatMap((g) => g.membres);
    const m = etat(avant.map((id) => rep(`pays:${id}:localiser`, D0, AGAIN, 'rappel')));
    const p = programme(m, D0 + 1, gs, 'pays');
    expect(p.revisions.length).toBe(avant.length);
    expect(p.restantes).toBe(0);
    expect(p.nouveautes?.grappe).toBe(gs[2]);
  });

  it('Apprendre depuis une série : budget compté sur toutes les grappes', () => {
    const debut = [rep(`pays:${premiere.membres[0]}:localiser`, D0, GOOD, 'rappel')];
    const afrique: Grappe[] = gs.filter((g) => g.continent === 'Africa');
    expect(programme(etat(debut), D0, afrique, 'pays').nouveautes?.grappe).toBe(afrique[0]);
    const p = programme(etat(debut), D0, afrique, 'pays', gs);
    expect(p.nouveautes).toBeNull();
    // La grappe du jour (Europe) commencée, pas finie : elle passe avant, Apprendre Afrique le dit.
    expect(p.sansNouveautes).toBe('grappe_entamee');
    expect(p.entamee?.grappe).toBe(premiere);
    expect(p.entamee?.ids).toEqual(premiere.membres.slice(1));
    // Toute la grappe d'Europe faite : la grappe du jour est prise.
    const toute = premiere.membres.map((id) => rep(`pays:${id}:localiser`, D0, GOOD, 'rappel'));
    expect(programme(etat(toute), D0, afrique, 'pays', gs).sansNouveautes).toBe('grappe_faite');
  });

  it('une grappe entamée hors de la première série se finit : le jour même et le lendemain, la Révision du jour la reprend', () => {
    const afrique = gs.filter((g) => g.continent === 'Africa')[0]!;
    expect(gs[0]!.continent).not.toBe('Africa');
    const debut = afrique.membres.slice(0, 2).map((id) => rep(`pays:${id}:localiser`, D0, GOOD, 'rappel'));
    const p0 = programme(etat(debut), D0, gs, 'pays');
    expect(p0.nouveautes?.grappe).toBe(afrique);
    expect(p0.nouveautes?.ids).toEqual(afrique.membres.slice(2));
    const p1 = programme(etat(debut), D0 + 1, gs, 'pays');
    expect(p1.nouveautes?.grappe).toBe(afrique);
    expect(p1.nouveautes?.ids).toEqual(afrique.membres.slice(2));
    expect(grappeSuivante(etat(debut), gs, 'pays')?.grappe).toBe(afrique);
  });

  it('tout introduit : plus de grappe', () => {
    const tout = ids.map((id) => rep(`pays:${id}:localiser`, D0 - 100, GOOD, 'rappel'));
    expect(grappeSuivante(etat(tout), gs, 'pays')).toBeNull();
    expect(programme(etat(tout), D0 - 100, gs, 'pays').sansNouveautes).toBe('tout_appris');
  });
});

describe('seaux de la carte de la mémoire', () => {
  it('bornes : < 1, 1-3, 3-7, 7-21, ≥ 21 jours', () => {
    const cas: [number, Seau][] = [[0.21, 0], [0.999, 0], [1, 1], [2.99, 1], [3, 2], [6.9, 2], [7, 3], [20.9, 3], [21, 4], [400, 4]];
    for (const [s, attendu] of cas) expect(seau(s), String(s)).toBe(attendu);
  });

  it('seau d’un pays : sa fiche introduite la plus faible ; jamais vu : absent', () => {
    const ef = (fiche: string, stability: number): [string, EtatFiche] => [
      fiche,
      { fiche, carte: { stability } as CarteFsrs, introduite_jour: 0, dernier_jour: 0, echeance_jour: 1, notes: 1, echecs: 0 },
    ];
    const m = new Map([
      ef('pays:FRA:localiser', 30), ef('pays:FRA:nommer', 2),
      ef('pays:BEL:localiser', 25),
      ef('pays:DEU:localiser', 0.5),
      ef('communes:97411:localiser', 40),
    ]);
    const s = seauxEntites(m, 'pays');
    expect(Object.fromEntries(s)).toEqual({ FRA: 1, BEL: 4, DEU: 0 });
    expect(s.has('ITA')).toBe(false);
    expect(maitrises(s)).toBe(1);
    expect(Object.fromEntries(seauxEntites(m, 'communes'))).toEqual({ '97411': 4 });
  });

  it('sur un vrai rejeu : Again → seau 0, Good → 1, Easy → 3', () => {
    const m = etat([rep('pays:FRA:localiser', D0, AGAIN, 'rappel'), rep('pays:BEL:localiser', D0, GOOD, 'rappel'), rep('pays:DEU:localiser', D0, 4, 'rappel')]);
    expect(Object.fromEntries(seauxEntites(m, 'pays'))).toEqual({ FRA: 0, BEL: 1, DEU: 3 });
  });
});
