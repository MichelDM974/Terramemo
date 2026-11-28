import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';
import type { CarteFsrs } from '../src/srs/fsrs';
import { nommerPose, type Domaine } from '../src/srs/fiches';
import { grappesCommunes, grappesPays, type Grappe } from '../src/srs/grappes';
import type { Lieu } from '../src/map/types';
import type { Evenement } from '../src/srs/journal';
import { AGAIN, GOOD, type Note } from '../src/srs/note';
import {
  dues,
  entreesDuJour,
  memoireEntite,
  GRAPPES_PAR_JOUR,
  grappeSuivante,
  INTRODUCTIONS_PAR_JOUR,
  introductions,
  introductionsFaites,
  introductionsPermises,
  maitrises,
  PREREQUIS,
  pretSelon,
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

describe('un budget par domaine, pays et communes (décision « Apprendre et Révision du jour », D6)', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const communes = JSON.parse(readFileSync('public/geo/reunion/communes.json', 'utf8')) as Lieu[];
  const gp = grappesPays(pays);
  const gc = grappesCommunes(communes);
  const c0 = gc[0]!;
  const p0 = gp[0]!;

  it('4 grappes de 6 communes ; une grappe de pays et une grappe de communes nouvelles le même jour, chacune son budget', () => {
    expect(gc.map((g) => g.membres.length)).toEqual([6, 6, 6, 6]);
    // Journal vide : chaque domaine a sa grappe à prendre.
    expect(programme(new Map(), D0, gc, 'communes').nouveautes?.grappe).toBe(c0);
    expect(programme(new Map(), D0, gp, 'pays').nouveautes?.domaine).toBe('pays');
    // Une grappe de communes faite ce jour : la grappe de pays reste ouverte ; une seconde de communes, non.
    const communesFaites = etat(c0.membres.map((id) => rep(`communes:${id}:localiser`, D0, GOOD, 'rappel')));
    expect(entreesDuJour(communesFaites, D0, 'communes')).toBe(6);
    expect(programme(communesFaites, D0, gp, 'pays').nouveautes?.grappe).toBe(p0);
    expect(programme(communesFaites, D0, gc, 'communes').sansNouveautes).toBe('grappe_faite');
    // Les deux faites ce jour : chaque domaine a pris la sienne.
    const lesDeux = etat([
      ...c0.membres.map((id) => rep(`communes:${id}:localiser`, D0, GOOD, 'rappel')),
      ...p0.membres.map((id) => rep(`pays:${id}:localiser`, D0, GOOD, 'rappel')),
    ]);
    expect(programme(lesDeux, D0, gp, 'pays').sansNouveautes).toBe('grappe_faite');
    expect(programme(lesDeux, D0, gc, 'communes').sansNouveautes).toBe('grappe_faite');
    // Le lendemain, la suivante de chaque domaine.
    expect(programme(lesDeux, D0 + 1, gc, 'communes').nouveautes?.grappe).toBe(gc[1]);
    expect(programme(lesDeux, D0 + 1, gp, 'pays').nouveautes?.grappe).toBe(gp[1]);
  });

  it('une grappe entamée dans l’autre domaine ne retient ni ne précède : elle se reprend dans le sien', () => {
    const entamee = etat(c0.membres.slice(0, 2).map((id) => rep(`communes:${id}:localiser`, D0, GOOD, 'rappel')));
    const p = programme(entamee, D0, gp, 'pays');
    expect([p.nouveautes?.grappe, p.sansNouveautes, p.entamee]).toEqual([p0, null, null]);
    expect(programme(entamee, D0, gc, 'communes').nouveautes?.ids).toEqual(c0.membres.slice(2));
    // Et inversement : des pays entamés n'empêchent pas la grappe de communes.
    const paysEntames = etat(p0.membres.slice(0, 2).map((id) => rep(`pays:${id}:localiser`, D0, GOOD, 'rappel')));
    expect(programme(paysEntames, D0, gc, 'communes').nouveautes?.grappe).toBe(c0);
  });

  it('les révisions dues d’abord, dans le domaine : des communes dues ne retiennent pas la grappe de pays d’Apprendre', () => {
    const m = etat(c0.membres.map((id) => rep(`communes:${id}:localiser`, D0, AGAIN, 'rappel')));
    expect(dues(m, D0 + 1, 'communes').length).toBe(6);
    expect(programme(m, D0 + 1, gp, 'pays').nouveautes?.grappe).toBe(p0);
  });

  it('prises : les révisions d’un bloc précédent de la séance retirées des plafonds (séance, jour)', () => {
    const m = etat(c0.membres.map((id) => rep(`communes:${id}:localiser`, D0, AGAIN, 'rappel')));
    expect(programme(m, D0 + 1, gc, 'communes', gc, { prises: 0 }).revisions.length).toBe(6);
    const p = programme(m, D0 + 1, gc, 'communes', gc, { prises: REVISIONS_PAR_SEANCE - 2 });
    expect(p.revisions.length).toBe(2);
    expect([p.restantes, p.sansNouveautes]).toEqual([4, 'dues']);
    expect(programme(m, D0 + 1, gc, 'communes', gc, { prises: REVISIONS_PAR_JOUR }).sansNouveautes).toBe('plafond');
  });

  it('memoireEntite : notes des deux sens, plus proche échéance ; null jamais vu', () => {
    const m = etat([rep('pays:FRA:localiser', D0, GOOD, 'rappel'), rep('pays:FRA:nommer', D0 + 1, AGAIN, 'rappel')]);
    expect(memoireEntite(m, 'pays', 'FRA', D0 + 1)).toEqual({ vu: 2, dans: 1 });
    expect(memoireEntite(m, 'pays', 'ESP', D0 + 1)).toBeNull();
    expect(memoireEntite(m, 'communes', 'FRA', D0 + 1)).toBeNull();
  });
});

// Mémoire à plusieurs sujets (étude J2 § 6.1 à 6.3, lot 0c) : un budget de
// grappes par domaine, les plafonds de révisions communs, le plafond commun
// d'introductions « Reconnaître » (D46 d) et sa règle du reliquat, la
// préférence des grappes dont les pays sont appris (D39 b).
describe('plusieurs sujets : plafonds communs, reliquat, préférence (lot 0c)', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const gs = grappesPays(pays);
  const ids = gs.flatMap((g) => g.membres);
  /**
   * k entités du domaine apprises (rappel Good) le jour j : leur fiche nommer à introduire dès j + 1 (échéance à j + 3).
   * Sans celles qui n'ont pas de fiche nommer dans ce domaine (D37 c : les 9 pays au nom de leur capitale).
   */
  const appris = (domaine: string, k: number, j = D0, depuis = 0): Evenement[] =>
    ids
      .filter((id) => nommerPose(domaine as Domaine, id))
      .slice(depuis, depuis + k)
      .map((id) => rep(`${domaine}:${id}:localiser`, j, GOOD, 'rappel'));

  it('plafond d’introductions de D46 : 15 par jour, les plus anciennes d’abord ; le reliquat le lendemain, en tête', () => {
    expect(INTRODUCTIONS_PAR_JOUR).toBe(15);
    // 10 pays appris le jour 0, 10 le jour 1 : le jour 2, 20 fiches nommer à introduire.
    const m = etat([...appris('pays', 10, D0 - 1), ...appris('pays', 10, D0, 10)]);
    const toutes = introductions(m, D0 + 1);
    expect(toutes.length).toBe(20);
    const p = programme(m, D0 + 1, gs, 'pays');
    expect(p.introductions).toEqual(toutes.slice(0, 15));
    // Les plus anciennes d'abord : les 10 du jour 0, puis 5 du jour 1.
    expect(p.introductions.slice(0, 10).sort()).toEqual(ids.slice(0, 10).map((id) => `pays:${id}:nommer`).sort());
    expect(p.introRestantes).toBe(5);
    // 12 faites ce jour : 3 encore permises (introductionsFaites ne compte que les fiches nommer du jour).
    const faites = toutes.slice(0, 12).map((f) => rep(f, D0 + 1, GOOD, 'rappel'));
    const m2 = etat([...appris('pays', 10, D0 - 1), ...appris('pays', 10, D0, 10), ...faites]);
    expect(introductionsFaites(m2, D0 + 1)).toBe(12);
    expect(introductionsPermises(m2, D0 + 1)).toBe(3);
    expect(programme(m2, D0 + 1, gs, 'pays').introductions).toEqual(toutes.slice(12, 15));
    // Le lendemain, le reliquat passe en tête.
    const m3 = etat([...appris('pays', 10, D0 - 1), ...appris('pays', 10, D0, 10), ...toutes.slice(0, 15).map((f) => rep(f, D0 + 1, GOOD, 'rappel'))]);
    expect(programme(m3, D0 + 2, gs, 'pays').introductions).toEqual(toutes.slice(15));
  });

  it('plafond commun à tous les domaines : les introductions d’un sujet réduisent celles de l’autre, introsPrises aussi', () => {
    const m = etat([...appris('pays', 10), ...appris('capitales', 10, D0 - 1, 50)]);
    // Sans les capitales dans la séance : les 10 de pays tiennent.
    expect(programme(m, D0 + 1, gs, 'pays').introductions.length).toBe(10);
    // Mêlées (Révision du jour) : les capitales, plus anciennes, d'abord ; il reste 5 places aux pays.
    const p = programme(m, D0 + 1, gs, 'pays', gs, { domaines: ['pays', 'capitales'] });
    expect(p.introductions.length).toBe(15);
    expect(p.introductions.slice(0, 10).every((f) => f.startsWith('capitales:'))).toBe(true);
    expect(p.introRestantes).toBe(5);
    // 10 introductions de capitales faites ce jour : 5 de pays permises.
    const m2 = etat([...appris('pays', 10), ...appris('capitales', 10, D0 - 1, 50), ...introductions(m, D0 + 1, 'capitales').map((f) => rep(f, D0 + 1, GOOD, 'rappel'))]);
    expect(programme(m2, D0 + 1, gs, 'pays').introductions.length).toBe(5);
    // introsPrises : celles d'un bloc précédent de la même séance.
    expect(programme(m, D0 + 1, gs, 'pays', gs, { introsPrises: 12 }).introductions.length).toBe(3);
  });

  it('introsPermises : le plafond déjà réparti entre les blocs ; le bloc ne prend que les siennes, le reste de son domaine fait son reliquat', () => {
    const m = etat([...appris('pays', 10), ...appris('capitales', 10, D0 - 1, 50)]);
    const toutes = introductions(m, D0 + 1, ['pays', 'capitales']);
    const permises = new Set(toutes.filter((f) => f.startsWith('pays:')).slice(0, 4));
    const p = programme(m, D0 + 1, gs, 'pays', gs, { domaines: ['pays', 'capitales'], introsPermises: permises });
    expect(p.introductions).toEqual([...permises]);
    expect(p.introRestantes).toBe(toutes.length - 4);
    expect(p.sansNouveautes).toBe('introductions');
    // Toutes celles du domaine permises : pas de reliquat du domaine, sa grappe peut s'ouvrir.
    const pays = new Set(toutes.filter((f) => f.startsWith('pays:')));
    expect(programme(m, D0 + 1, gs, 'pays', gs, { domaines: ['pays', 'capitales'], introsPermises: pays }).sansNouveautes).toBeNull();
  });

  it('à âge égal, les pays d’abord (ordre de DOMAINES), pas l’ordre alphabétique des ids : dans les introductions comme dans les révisions', () => {
    // 10 capitales, 10 drapeaux et 10 pays appris le même jour : le lendemain, 30 fiches nommer du même âge.
    const m = etat([...appris('capitales', 10, D0, 50), ...appris('drapeaux', 10, D0, 80), ...appris('pays', 10)]);
    const p = programme(m, D0 + 1, gs, 'pays', gs, { domaines: ['pays', 'capitales', 'drapeaux'] });
    expect(p.introductions.slice(0, 10).every((f) => f.startsWith('pays:'))).toBe(true);
    expect(p.introductions.slice(10).every((f) => f.startsWith('capitales:'))).toBe(true);
    // Les pays tiennent dans le plafond : pas de reliquat des pays, leur grappe s'ouvre.
    expect(p.sansNouveautes).toBeNull();
    expect(p.nouveautes?.domaine).toBe('pays');
    // Révisions : même échéance, les pays d'abord.
    const again = (domaine: string, depuis: number) => ids.slice(depuis, depuis + 3).map((id) => rep(`${domaine}:${id}:localiser`, D0, AGAIN, 'rappel'));
    const d = dues(etat([...again('drapeaux', 80), ...again('capitales', 50), ...again('pays', 0)]), D0 + 1, ['pays', 'capitales', 'drapeaux']);
    expect(d.map((f) => f.split(':')[0])).toEqual([...Array(3).fill('pays'), ...Array(3).fill('capitales'), ...Array(3).fill('drapeaux')]);
  });

  it('reliquat : un domaine dont des introductions attendent n’ouvre pas de grappe ; un autre, si', () => {
    const m = etat([...appris('pays', 10), ...appris('capitales', 10, D0 - 1, 50)]);
    const p = programme(m, D0 + 1, gs, 'pays', gs, { domaines: ['pays', 'capitales'] });
    // 5 introductions de pays attendent : pas de grappe de pays.
    expect([p.nouveautes, p.sansNouveautes]).toEqual([null, 'introductions']);
    // Seul, sans reliquat, le domaine ouvre sa grappe (le plafond des capitales mêlées n'y entre pas).
    expect(programme(m, D0 + 1, gs, 'pays').nouveautes).not.toBeNull();
    // Le reliquat d'un autre domaine ne retient pas la grappe : 20 capitales à introduire, aucune de pays.
    const m2 = etat([...appris('capitales', 20, D0, 50)]);
    expect(programme(m2, D0 + 1, gs, 'capitales').sansNouveautes).toBe('introductions');
    expect(programme(m2, D0 + 1, gs, 'pays', gs, { domaines: ['pays', 'capitales'] }).nouveautes?.grappe).toBe(gs[0]);
    // Une grappe commencée ce jour se finit, même avec un reliquat (jamais coupée).
    const debut = gs[0]!.membres.slice(0, 2).map((id) => rep(`capitales:${id}:localiser`, D0 + 1, GOOD, 'rappel'));
    const p3 = programme(etat([...appris('capitales', 20, D0, 50), ...debut]), D0 + 1, gs, 'capitales');
    expect(p3.nouveautes?.ids).toEqual(gs[0]!.membres.slice(2));
  });

  it('plafond commun des révisions : mêlées, les plus en retard d’abord, 25 par séance et 60 par jour tous domaines confondus', () => {
    // 20 pays dus (appris en Again le jour 0) et 20 capitales dues depuis la veille.
    const again = (domaine: string, k: number, j: number, depuis: number) => ids.slice(depuis, depuis + k).map((id) => rep(`${domaine}:${id}:localiser`, j, AGAIN, 'rappel'));
    const evts = [...again('pays', 20, D0, 0), ...again('capitales', 20, D0 - 1, 60)];
    const p = programme(etat(evts), D0 + 1, gs, 'pays', gs, { domaines: ['pays', 'capitales'] });
    expect(p.revisions.length).toBe(REVISIONS_PAR_SEANCE);
    expect(p.revisions.slice(0, 20).every((f) => f.startsWith('capitales:'))).toBe(true);
    expect(p.restantes).toBe(15);
    // 50 révisions de capitales faites ce jour : 10 permises aux pays.
    const faites = ids.slice(100, 150).map((id) => rep(`capitales:${id}:localiser`, D0 + 1, GOOD));
    const m = etat([...again('pays', 20, D0, 0), ...ids.slice(100, 150).map((id) => rep(`capitales:${id}:localiser`, D0 - 5, GOOD, 'rappel')), ...faites]);
    expect(revisionsFaites(m, D0 + 1)).toBe(50);
    expect(programme(m, D0 + 1, gs, 'pays').revisions.length).toBe(10);
  });

  it('budgets de grappes indépendants : une grappe de capitales du jour ne retient ni celle des pays ni celle des drapeaux', () => {
    const m = etat(gs[0]!.membres.map((id) => rep(`capitales:${id}:localiser`, D0, GOOD, 'rappel')));
    expect(programme(m, D0, gs, 'capitales').sansNouveautes).toBe('grappe_faite');
    expect(programme(m, D0, gs, 'pays').nouveautes?.grappe).toBe(gs[0]);
    expect(programme(m, D0, gs, 'drapeaux').nouveautes?.grappe).toBe(gs[0]);
    // Le lendemain, les capitales passent à la suivante ; les pays commencent la leur.
    expect(programme(m, D0 + 1, gs, 'capitales').nouveautes?.grappe).toBe(gs[1]);
  });

  it('préférence D39 b : la première grappe de la série dont les pays sont appris un jour d’avant, sinon la suivante (conseil)', () => {
    // Les silhouettes aussi (J4, lot 1 ; D602 a), une préférence comme les autres.
    expect(PREREQUIS).toEqual({ capitales: 'pays', drapeaux: 'pays', silhouettes: 'pays', voisins: 'pays', habitants: 'pays', superficies: 'pays' });
    expect(pretSelon(new Map(), D0, 'pays')).toBeUndefined();
    expect(pretSelon(new Map(), D0, 'mers')).toBeUndefined();
    const afrique = gs.filter((g) => g.continent === 'Africa');
    const [a0, a1] = [afrique[0]!, afrique[1]!];
    // Aucun pays d'Afrique appris : la première grappe, marquée pas prête.
    const vide = new Map();
    const p0 = programme(vide, D0, afrique, 'capitales', gs, { pret: pretSelon(vide, D0, 'capitales')! });
    expect([p0.nouveautes?.grappe, p0.nouveautes?.prete]).toEqual([a0, false]);
    // Les pays de la deuxième grappe appris la veille : elle passe avant la première.
    const m = etat(a1.membres.map((id) => rep(`pays:${id}:localiser`, D0 - 1, GOOD, 'rappel')));
    const p1 = programme(m, D0, afrique, 'capitales', gs, { pret: pretSelon(m, D0, 'capitales')! });
    expect([p1.nouveautes?.grappe, p1.nouveautes?.prete]).toEqual([a1, true]);
    // Appris aujourd'hui seulement : pas encore (un jour d'avant).
    const auj = etat(a1.membres.map((id) => rep(`pays:${id}:localiser`, D0, GOOD, 'rappel')));
    expect(programme(auj, D0, afrique, 'capitales', gs, { pret: pretSelon(auj, D0, 'capitales')! }).nouveautes?.grappe).toBe(a0);
    // Un seul pays de la grappe manque : pas prête.
    const presque = etat(a1.membres.slice(1).map((id) => rep(`pays:${id}:localiser`, D0 - 1, GOOD, 'rappel')));
    expect(programme(presque, D0, afrique, 'capitales', gs, { pret: pretSelon(presque, D0, 'capitales')! }).nouveautes?.prete).toBe(false);
    // Une grappe entamée se finit avant, prête ou non.
    const entamee = etat([...a1.membres.map((id) => rep(`pays:${id}:localiser`, D0 - 2, GOOD, 'rappel')), rep(`capitales:${a0.membres[0]}:localiser`, D0 - 1, GOOD, 'rappel')]);
    expect(grappeSuivante(entamee, afrique, 'capitales', pretSelon(entamee, D0, 'capitales'))?.grappe).toBe(a0);
  });
});

describe('« Apprendre ce lieu » : prefere (#34, lot F7, § 5.2)', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const gs = grappesPays(pays);
  const afrique = gs.filter((g) => g.continent === 'Africa');
  const deMaurice = gs.find((g) => g.membres.includes('MUS'))!;
  const appris = (ids: readonly string[], j: number, note: Note = GOOD) => ids.map((id) => rep(`pays:${id}:localiser`, j, note, 'rappel'));

  it('Maurice : 8e grappe sur 8 de la série Afrique, 21e sur 31 dans l’ordre global (§ 5.1) ; prefere la met en tête des deux', () => {
    expect([afrique.length, afrique.indexOf(deMaurice) + 1]).toEqual([8, 8]);
    expect([gs.length, gs.indexOf(deMaurice) + 1]).toEqual([31, 21]);
    expect(programme(new Map(), D0, afrique, 'pays', gs).nouveautes?.grappe).toBe(afrique[0]);
    const p = programme(new Map(), D0, afrique, 'pays', gs, { prefere: 'MUS' });
    expect(p.nouveautes?.grappe).toBe(deMaurice);
    expect(p.nouveautes?.ids).toEqual(deMaurice.membres);
    expect(p.nouveautes?.fiches).toEqual(deMaurice.membres.map((id) => `pays:${id}:localiser`));
    expect(programme(new Map(), D0, gs, 'pays', gs, { prefere: 'MUS' }).nouveautes?.grappe).toBe(deMaurice);
    expect(grappeSuivante(new Map(), gs, 'pays', undefined, 'MUS')?.grappe).toBe(deMaurice);
  });

  it('une grappe entamée passe avant le lieu préféré ; un lieu inconnu de la série, ou déjà appris : comme sans lui', () => {
    // Deux pays de la 1re grappe d'Afrique appris un jour d'avant : elle est entamée, elle se finit d'abord.
    const entamee = etat(appris(afrique[0]!.membres.slice(0, 2), D0 - 1));
    expect(grappeSuivante(entamee, afrique, 'pays', undefined, 'MUS')?.grappe).toBe(afrique[0]);
    expect(programme(entamee, D0, afrique, 'pays', gs, { prefere: 'MUS' }).nouveautes?.grappe).toBe(afrique[0]);
    // Le Japon n'est pas en Afrique ; un id inconnu ; Maurice déjà appris (sa grappe entière apprise la veille).
    for (const prefere of ['JPN', 'XXX']) expect(programme(new Map(), D0, afrique, 'pays', gs, { prefere }).nouveautes?.grappe, prefere).toBe(afrique[0]);
    const vu = etat(appris(deMaurice.membres, D0 - 1));
    expect(grappeSuivante(vu, afrique, 'pays', undefined, 'MUS')?.grappe).toBe(afrique[0]);
    // La grappe du lieu entamée (Maurice appris, pas ses voisins) : elle est prise comme entamée, le reste seul.
    const lui = etat(appris(['MUS'], D0 - 1));
    expect(grappeSuivante(lui, afrique, 'pays', undefined, 'MUS')?.ids).toEqual(deMaurice.membres.filter((id) => id !== 'MUS'));
  });

  it('avec pret (D39 b) : le lieu préféré passe avant la grappe prête, marqué pas prêt s’il ne l’est pas', () => {
    const a1 = afrique[1]!;
    const m = etat(appris(a1.membres, D0 - 1));
    const p = programme(m, D0, afrique, 'capitales', gs, { pret: pretSelon(m, D0, 'capitales')!, prefere: 'MUS' });
    expect([p.nouveautes?.grappe, p.nouveautes?.prete]).toEqual([deMaurice, false]);
    const m2 = etat(appris(deMaurice.membres, D0 - 1));
    const p2 = programme(m2, D0, afrique, 'capitales', gs, { pret: pretSelon(m2, D0, 'capitales')!, prefere: 'MUS' });
    expect([p2.nouveautes?.grappe, p2.nouveautes?.prete]).toEqual([deMaurice, true]);
  });

  it('le budget ne bouge pas : grappe faite, grappe entamée ailleurs, reliquat, révisions dues, plafond, avec et sans prefere', () => {
    const avecSans = (e: ReadonlyMap<string, EtatFiche>, j: number) => {
      const sans = programme(e, j, afrique, 'pays', gs);
      const avec = programme(e, j, afrique, 'pays', gs, { prefere: 'MUS' });
      expect(avec.sansNouveautes).toBe(sans.sansNouveautes);
      expect([avec.revisions, avec.introductions, avec.restantes, avec.introRestantes]).toEqual([sans.revisions, sans.introductions, sans.restantes, sans.introRestantes]);
      return avec;
    };
    // La grappe du jour prise (une grappe d'Europe apprise aujourd'hui).
    expect(avecSans(etat(appris(gs[0]!.membres, D0)), D0).sansNouveautes).toBe('grappe_faite');
    // Une grappe d'Europe commencée aujourd'hui, pas finie : elle passe avant (Apprendre Afrique la renvoie).
    expect(avecSans(etat(appris(gs[0]!.membres.slice(0, 2), D0)), D0).sansNouveautes).toBe('grappe_entamee');
    // Des révisions dues qui ne tiennent pas dans la séance (30 pays ratés la veille) ; le plafond du jour atteint.
    const ids = gs.flatMap((g) => g.membres).filter((id) => !deMaurice.membres.includes(id));
    expect(avecSans(etat(appris(ids.slice(0, 30), D0 - 1, AGAIN)), D0).sansNouveautes).toBe('dues');
    const plafond = etat([...appris(ids.slice(0, 70), D0 - 1, AGAIN), ...ids.slice(0, 60).map((id) => rep(`pays:${id}:localiser`, D0, GOOD))]);
    expect(avecSans(plafond, D0).sansNouveautes).toBe('plafond');
    // Le reliquat : 20 fiches nommer à introduire, 15 permises (plus vieilles que 3 j, aucune due).
    const reliquat = etat(appris(ids.filter((id) => nommerPose('pays', id)).slice(0, 20), D0 - 1));
    expect(avecSans(reliquat, D0).sansNouveautes).toBe('introductions');
  });
});

describe('D37 c : les 9 pays au nom de leur capitale n’ont pas de fiche capitales:…:nommer', () => {
  const gs = grappesPays(JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[]);
  it('leur fiche localiser apprise, jamais d’introduction nommer ; les autres capitales et les pays, si', () => {
    const D = 20_400;
    const m = etat(['LUX', 'MCO', 'VAT', 'BEL', 'FRA'].flatMap((id) => [rep(`capitales:${id}:localiser`, D, GOOD, 'rappel'), rep(`pays:${id}:localiser`, D, GOOD, 'rappel')]));
    const intro = introductions(m, D + 1);
    expect(intro.filter((f) => f.startsWith('capitales:')).sort()).toEqual(['capitales:BEL:nommer', 'capitales:FRA:nommer']);
    expect(intro.filter((f) => f.startsWith('pays:'))).toHaveLength(5);
    expect(programme(m, D + 1, gs, 'capitales', gs, { domaines: ['capitales'] }).introductions.sort()).toEqual(['capitales:BEL:nommer', 'capitales:FRA:nommer']);
  });
});
