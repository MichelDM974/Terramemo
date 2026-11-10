// Simulation de charge de la mémoire à plusieurs sujets (étude J2 § 6.3, S40,
// lot 0c ; reprend relectures/produit-scripts/sim_charge.mjs, hors du dépôt).
// Un outil, pas un test : sauté par défaut, lancé à la main pour le verdict
// de D46 (et de #2) :
//   npm run sim:charge          (ou SIM_CHARGE=1 npx vitest run tests/sim-charge.test.ts)
// SIM_JOURS (90 par défaut) change la durée.
//
// Le vrai code de planification : programme() de src/srs/planif.ts (plafonds
// REVISIONS_PAR_SEANCE, REVISIONS_PAR_JOUR, INTRODUCTIONS_PAR_JOUR communs,
// une grappe par jour et par domaine, règle du reliquat, préférence pret de
// D39 b) et l'état rejoué de src/srs/rejeu.ts (appliquer, ts-fsrs aux
// paramètres de fsrs.ts). Le joueur, lui, est un modèle (estimé) :
// - assidu : chaque jour la Révision du jour, séance après séance jusqu'à
//   « À jour » (les blocs de src/vues/seance.ts : révisions des domaines du
//   monde mêlées, leurs introductions, puis la grappe de pays), puis
//   Apprendre dans chaque autre sujet (variante : sous Pays aussi) ;
// - une révision juste avec la probabilité de rappel de FSRS ce jour-là
//   (Good, sinon Again) ; une grappe apprise et une fiche nommer introduite
//   notées Good (comme le script d'origine) ;
// - temps : 6 s par question (estimé) ; une grappe compte deux questions par
//   entité (QCM puis rappel), un Again une reprise de plus.
// Grappes : celles des pays (195) pour pays, capitales (D37 c : séries et
// tailles des pays) et drapeaux ; mers : 50 en 9 grappes (étude § 6.1 :
// Océans 5, Atlantique 6-6-5, Arctique 5-5, Pacifique 5-5, Indien 8).
import { readFileSync } from 'node:fs';
import { fsrs } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';
import type { Domaine } from '../src/srs/fiches';
import { dateDuJour, PARAMS_FSRS, planificateur } from '../src/srs/fsrs';
import { grappesPays, type Grappe } from '../src/srs/grappes';
import { MS_JOUR } from '../src/srs/jour';
import type { Evenement } from '../src/srs/journal';
import type { Note } from '../src/srs/note';
import { INTRODUCTIONS_PAR_JOUR, introduite, pretSelon, programme, REVISIONS_PAR_JOUR, REVISIONS_PAR_SEANCE, type Programme } from '../src/srs/planif';
import { appliquer, type EtatFiche } from '../src/srs/rejeu';

const SECONDES_PAR_QUESTION = 6;
const JOURS_MONTRES = [2, 10, 20, 30, 60, 90];

interface Sujet {
  domaine: Domaine;
  grappes: Grappe[];
}

interface Jour {
  j: number;
  revisions: number;
  introductions: number;
  nouveaux: number;
  again: number;
  minutes: number;
}

/** Hasard reproductible (mulberry32). */
function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grappes factices des mers : ids m0…m49, dans l'ordre de l'étude. */
function grappesMers(): Grappe[] {
  const tailles = [5, 6, 6, 5, 5, 5, 5, 5, 8];
  let k = 0;
  return tailles.map((n, i) => ({ id: `mers ${i}`, continent: 'mers', groupes: ['mers'], membres: Array.from({ length: n }, () => `m${k++}`), superficie_km2: 0 }));
}

/** `apprendrePays` : après la Révision du jour, le joueur lance aussi Apprendre sous Pays (qui ne regarde que les révisions des pays). */
function simuler(sujets: readonly Sujet[], jours: number, apprendrePays = false): { parJour: Jour[]; fin: Partial<Record<Domaine, number>> } {
  const etat = new Map<string, EtatFiche>();
  const p = planificateur();
  const f = fsrs({ ...PARAMS_FSRS });
  const hasard = graine(42);
  const J0 = 20_000; // un jour local quelconque
  const domaines = sujets.map((s) => s.domaine);
  const pays = sujets.find((s) => s.domaine === 'pays')!;
  const parJour: Jour[] = [];
  const fin: Partial<Record<Domaine, number>> = {};
  for (let k = 1; k <= jours; k++) {
    const j = J0 + k;
    const ts = j * MS_JOUR + 8 * 3_600_000; // midi à La Réunion
    const noter = (fiche: string, note: Note) => appliquer(etat, { type: 'reponse', fiche, ts, tz: 240, note } as Evenement, p);
    const s: Jour = { j: k, revisions: 0, introductions: 0, nouveaux: 0, again: 0, minutes: 0 };
    /** Joue une séance : rend vrai s'il y avait quelque chose à faire. */
    const jouer = (b: Programme): boolean => {
      for (const fiche of b.revisions) {
        const r = f.get_retrievability(etat.get(fiche)!.carte, dateDuJour(j), false);
        const note: Note = hasard() < r ? 3 : 1;
        noter(fiche, note);
        s.revisions++;
        if (note === 1) s.again++;
      }
      for (const fiche of b.introductions) noter(fiche, 3);
      s.introductions += b.introductions.length;
      for (const fiche of b.nouveautes?.fiches ?? []) noter(fiche, 3);
      s.nouveaux += b.nouveautes?.ids.length ?? 0;
      return b.revisions.length + b.introductions.length + (b.nouveautes?.ids.length ?? 0) > 0;
    };
    // La Révision du jour, séance après séance (« Continuer ») : les domaines du monde mêlés, puis la grappe de pays.
    while (jouer(programme(etat, j, pays.grappes, 'pays', pays.grappes, { domaines }))) {
      /* séance suivante */
    }
    // Apprendre dans chaque autre sujet : ses révisions et introductions restantes, puis sa grappe.
    for (const x of sujets) {
      if (x === pays && !apprendrePays) continue;
      const pret = pretSelon(etat, j, x.domaine);
      while (jouer(programme(etat, j, x.grappes, x.domaine, x.grappes, pret ? { pret } : {}))) {
        /* séance suivante */
      }
    }
    s.minutes = ((s.revisions + s.again + s.introductions + 2 * s.nouveaux) * SECONDES_PAR_QUESTION) / 60;
    parJour.push(s);
    for (const x of sujets) if (fin[x.domaine] === undefined && x.grappes.every((g) => g.membres.every((id) => introduite(etat, x.domaine, id)))) fin[x.domaine] = k;
  }
  return { parJour, fin };
}

function rapport(nom: string, r: ReturnType<typeof simuler>): string {
  const lignes = [`${nom}`, 'jour  révisions  introductions  nouveaux  minutes'];
  for (const k of JOURS_MONTRES) {
    const d = r.parJour[k - 1];
    if (d) lignes.push(`${String(k).padStart(4)}  ${String(d.revisions).padStart(9)}  ${String(d.introductions).padStart(13)}  ${String(d.nouveaux).padStart(8)}  ${d.minutes.toFixed(1).padStart(7)}`);
  }
  const max = r.parJour.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const plafond = r.parJour.filter((d) => d.revisions >= REVISIONS_PAR_JOUR).map((d) => d.j);
  lignes.push(`tout introduit (jour) : ${JSON.stringify(r.fin)}`);
  lignes.push(`pire jour : ${max.j} (${max.minutes.toFixed(1)} min) ; plafond de ${REVISIONS_PAR_JOUR} révisions atteint ${plafond.length} jours${plafond.length ? ` (${plafond[0]} à ${plafond.at(-1)})` : ''}`);
  const moy = (a: number, b: number) => r.parJour.slice(a - 1, b).reduce((n, d) => n + d.minutes, 0) / (b - a + 1);
  lignes.push(`minutes par jour en moyenne : jours 1-30 ${moy(1, 30).toFixed(1)}, 31-60 ${moy(31, 60).toFixed(1)}, 61-90 ${moy(61, Math.min(90, r.parJour.length)).toFixed(1)}`);
  return lignes.join('\n');
}

describe.skipIf(!process.env.SIM_CHARGE)('S40 : charge de la mémoire à plusieurs sujets (outil, lancé à la main)', () => {
  it('pays seul, puis pays, capitales, drapeaux et mers', () => {
    const jours = Number(process.env.SIM_JOURS ?? 90);
    const gp = grappesPays(JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[]);
    const n = gp.reduce((k, g) => k + g.membres.length, 0);
    const seul = simuler([{ domaine: 'pays', grappes: gp }], jours);
    const sujets: Sujet[] = [
      { domaine: 'pays', grappes: gp },
      { domaine: 'capitales', grappes: gp },
      { domaine: 'drapeaux', grappes: gp },
      { domaine: 'mers', grappes: grappesMers() },
    ];
    const quatre = simuler(sujets, jours);
    const quatreEtPays = simuler(sujets, jours, true);
    console.log(
      [
        `Plafonds : ${INTRODUCTIONS_PAR_JOUR} introductions par jour (communes), ${REVISIONS_PAR_JOUR} révisions par jour, ${REVISIONS_PAR_SEANCE} par séance, règle du reliquat ; ${SECONDES_PAR_QUESTION} s par question ; ${jours} jours.`,
        rapport(`Pays seul (${n})`, seul),
        rapport(`Quatre sujets (pays:${n}, capitales:${n}, drapeaux:${n}, mers:50)`, quatre),
        rapport('Quatre sujets, et Apprendre sous Pays chaque jour aussi', quatreEtPays),
      ].join('\n\n'),
    );
    expect(seul.parJour.length).toBe(jours);
  }, 600_000);
});
