import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import { lireDrapeaux, type ManifesteDrapeaux } from '../src/map/drapeaux';
import { assemblerInfos, parenteMer } from '../src/map/mers';
import type { Pays } from '../src/map/types';
import { lireNotoriete, lireProches } from '../src/quiz/donnees';
import { generateurs, type DonneesGenerateurs } from '../src/quiz/generateurs';
import { graine } from '../src/quiz/hasard';
import { REGLES } from '../src/quiz/regles';
import { parts, tirerPartie } from '../src/quiz/tirage';
import { DIFFICULTES, type Difficulte, type Question } from '../src/quiz/types';
import { SANS_NOMMER } from '../src/srs/fiches';
import { nomsProches } from '../src/texte';
import { sosiesDrapeau } from '../src/vues/qcm';

// Le tirage du quiz général (étude J2 § 9.1 et § 9.2, lot 4a ; D49 a avec d) sur les
// vraies données servies, à graine : 20 questions, formes et parts de chaque
// difficulté, lieux de son niveau, aucune entité deux fois, leurres par difficulté.

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const pays = lire<Pays[]>('public/geo/pays.json');
const noms = lire<Record<string, string>>('public/geo/noms.fr.json');
const capitales = lireCapitales(lire<LigneCapitales[]>('public/geo/capitales.json'), lire<NomsCapitales>('public/geo/capitales.fr.json'));
const drapeaux = lireDrapeaux(lire<ManifesteDrapeaux>('public/geo/drapeaux.json'));
const proches = lireProches(lire('public/geo/drapeaux-proches.json'));
const notoriete = lireNotoriete(lire('public/geo/notoriete.json'));
const infos = assemblerInfos({ mers: readFileSync('public/geo/mers.json', 'utf8'), fr: readFileSync('public/geo/mers.fr.json', 'utf8') });
const D: DonneesGenerateurs = { pays, noms, notoriete, capitales, drapeaux, proches, mers: infos.zones, nomsMers: infos.noms };
const GENS = generateurs(D);

const parPays = new Map(pays.map((p) => [p.id, p]));
const jouable = (id: string) => parPays.get(id)?.statut === 'jouable';
const niveauCapitales = (id: string) => Math.min(...capitales.parPays.get(id)!.justes.map((c) => notoriete.capitales[c.q] ?? 9));
const niveau = (q: Pick<Question, 'sujet' | 'cible'>): number =>
  q.sujet === 'pays' ? notoriete.pays[q.cible]! : q.sujet === 'capitales' ? niveauCapitales(q.cible) : q.sujet === 'drapeaux' ? notoriete.drapeaux[q.cible]! : notoriete.mers[q.cible]!;
const leurres = (q: Question) => (q.choix ?? []).filter((x) => x !== q.cible);
const sorteMer = new Map(infos.zones.map((z) => [z.id, z.sorte]));
const jumeaux = (id: string) => drapeaux.parPays.get(id)?.jumeaux ?? [];

/** Les parties de chaque difficulté sur ces graines. */
const GRAINES = Array.from({ length: 40 }, (_, i) => i + 1);
const parties = new Map(DIFFICULTES.map((d) => [d, GRAINES.map((g) => tirerPartie(GENS, d, graine(g)))]));
const questions = (d: Difficulte, sujet?: string, forme?: string) =>
  parties.get(d)!.flat().filter((q) => (!sujet || q.sujet === sujet) && (!forme || q.forme === forme));

describe('générateurs', () => {
  it('les quatre sujets du J2, dans l’ordre de Jouer ; un sujet sans ses données n’a pas de générateur', () => {
    expect(GENS.map((g) => g.sujet)).toEqual(['pays', 'capitales', 'drapeaux', 'mers']);
    expect(generateurs({ ...D, capitales: null }).map((g) => g.sujet)).toEqual(['pays', 'drapeaux', 'mers']);
    expect(generateurs({ ...D, proches: null }).map((g) => g.sujet)).toEqual(['pays', 'capitales', 'mers']);
    expect(generateurs({ ...D, mers: null, drapeaux: null }).map((g) => g.sujet)).toEqual(['pays', 'capitales']);
  });

  it('lieux par niveau : chaque lieu jouable de chaque sujet, les niveaux emboîtés', () => {
    const [p, c, dr, m] = GENS;
    expect(p!.lieux(3)).toHaveLength(195);
    expect(c!.lieux(3)).toHaveLength(195);
    expect(dr!.lieux(3)).toHaveLength(195);
    expect(m!.lieux(3)).toHaveLength(50);
    for (const g of GENS) {
      expect(g.lieux(1).every((id) => g.lieux(2).includes(id))).toBe(true);
      expect(g.lieux(1).length).toBeGreaterThanOrEqual(12);
    }
    expect(p!.lieux(3).every(jouable)).toBe(true);
    expect(p!.lieux(3)).not.toContain('TWN');
    expect(p!.lieux(3)).not.toContain('XKX');
  });

  it('les 9 pays au nom de leur capitale (D37 c) : au toucher, jamais en QCM', () => {
    const c = GENS[1]!;
    for (const id of SANS_NOMMER.capitales!) {
      expect(c.posable(id, 'toucher'), id).toBe(true);
      expect(c.posable(id, 'qcm'), id).toBe(false);
    }
  });

  it('entités : Israël et la Palestine ensemble sous Capitales, un drapeau et ses jumeaux', () => {
    const [p, c, dr] = GENS;
    expect(p!.entites('ISR')).toEqual(['ISR']);
    expect(c!.entites('ISR')).toEqual(['ISR', 'PSE']);
    expect(c!.entites('PSE')).toEqual(['PSE', 'ISR']);
    expect(dr!.entites('IDN')).toEqual(['IDN', 'MCO']);
    expect(dr!.entites('TCD')).toEqual(['TCD', 'ROU']);
  });
});

describe('parts égales (§ 9.2, étape 1)', () => {
  it('5 chacun à 4 sujets ; 7, 7 et 6 à 3 ; 10 et 10 à 2 ; 20 à 1 ; aucun : erreur', () => {
    expect(parts(4, graine(1))).toEqual([5, 5, 5, 5]);
    for (const g of GRAINES) expect([...parts(3, graine(g))].sort()).toEqual([6, 7, 7]);
    expect(parts(2, graine(1))).toEqual([10, 10]);
    expect(parts(1, graine(1))).toEqual([20]);
    expect(() => parts(0, graine(1))).toThrow();
    // Le sujet qui n'a que 6 n'est pas toujours le même.
    expect(new Set(GRAINES.map((g) => parts(3, graine(g)).indexOf(6))).size).toBe(3);
  });
});

describe.each(DIFFICULTES)('une partie %s', (d) => {
  const regle = REGLES[d];
  const ps = parties.get(d)!;

  it(`20 questions, ${regle.qcm} QCM et ${20 - regle.qcm} au toucher, 5 par sujet, mélangées`, () => {
    for (const p of ps) {
      expect(p).toHaveLength(20);
      expect(p.filter((q) => q.forme === 'qcm')).toHaveLength(regle.qcm);
      for (const s of ['pays', 'capitales', 'drapeaux', 'mers']) expect(p.filter((q) => q.sujet === s), s).toHaveLength(5);
    }
    // L'ordre final est mélangé : pas toujours le même sujet en tête.
    expect(new Set(ps.map((p) => p[0]!.sujet)).size).toBeGreaterThan(1);
  });

  it(`lieux jusqu’au niveau ${regle.niveauMax}, jamais deux fois la même entité, délais de ${regle.delai_qcm_ms / 1000} et ${regle.delai_toucher_ms / 1000} s`, () => {
    for (const p of ps) {
      const entites = p.flatMap((q) => q.entites);
      expect(new Set(entites).size, entites.join(' ')).toBe(entites.length);
      for (const q of p) {
        expect(niveau(q), `${q.sujet} ${q.cible}`).toBeLessThanOrEqual(regle.niveauMax);
        expect(q.entites[0]).toBe(q.cible);
        expect(q.delai_ms).toBe(q.forme === 'qcm' ? regle.delai_qcm_ms : regle.delai_toucher_ms);
        if (q.sujet !== 'mers') expect(jouable(q.cible), q.cible).toBe(true);
      }
    }
  });

  it('QCM : 4 choix différents, la cible comprise ; un toucher n’en a pas', () => {
    for (const q of ps.flat()) {
      if (q.forme === 'toucher') {
        expect(q.choix).toBeUndefined();
        continue;
      }
      expect(q.choix).toHaveLength(4);
      expect(new Set(q.choix).size).toBe(4);
      expect(q.choix).toContain(q.cible);
      for (const x of q.choix!) expect(q.sujet === 'mers' ? sorteMer.has(x) : jouable(x), x).toBe(true);
    }
  });

  it('capitales : jamais Jérusalem et Jérusalem-Est ensemble ; au QCM, le bouton juste est la principale, jamais l’un des 9 ni un pays de x', () => {
    for (const p of ps) {
      const caps = p.filter((q) => q.sujet === 'capitales').map((q) => q.cible);
      expect(caps.includes('ISR') && caps.includes('PSE')).toBe(false);
    }
    for (const q of questions(d, 'capitales', 'qcm')) {
      const c = capitales.parPays.get(q.cible)!;
      expect(q.indice).toBe(c.principale.q);
      for (const x of q.choix!) expect(SANS_NOMMER.capitales!.has(x), x).toBe(false);
      for (const x of leurres(q)) expect(c.sansLeurre, `${q.cible} ${x}`).not.toContain(x);
    }
  });

  it('drapeaux : jamais deux jumeaux dans une partie, ni parmi les choix', () => {
    for (const p of ps) {
      const ids = p.filter((q) => q.sujet === 'drapeaux').map((q) => q.cible);
      for (const id of ids) for (const j of jumeaux(id)) expect(ids, id).not.toContain(j);
    }
    for (const q of questions(d, 'drapeaux', 'qcm')) for (const x of q.choix!) for (const j of jumeaux(x)) expect(q.choix, x).not.toContain(j);
  });

  it('mers : jamais un ancêtre ni une partie de la mer demandée parmi les choix, ni l’Arabie avec Oman ; un océan n’a que des océans', () => {
    for (const q of questions(d, 'mers', 'qcm')) {
      const parente = parenteMer(q.cible, infos.zones);
      for (const x of leurres(q)) expect(parente.has(x), `${q.cible} ${x}`).toBe(false);
      expect(q.choix!.includes('arabie') && q.choix!.includes('oman')).toBe(false);
      if (sorteMer.get(q.cible) === 'océan') for (const x of q.choix!) expect(sorteMer.get(x), x).toBe('océan');
    }
  });

  it(d === 'facile' || d === 'moyen' ? 'aucun leurre au nom proche du juste (Kingston et Kingstown)' : 'les noms proches sont permis', () => {
    if (d !== 'facile' && d !== 'moyen') return;
    const nomChoix = (q: Question, x: string) => (q.sujet === 'capitales' ? capitales.parPays.get(x)!.principale.nom : noms[x]!);
    // Les drapeaux sont des images ; les mers commencent toutes par leur générique (« mer de »).
    for (const q of ps.flat()) {
      if (q.forme !== 'qcm' || q.sujet === 'drapeaux' || q.sujet === 'mers') continue;
      for (const x of leurres(q)) expect(nomsProches(nomChoix(q, q.cible), nomChoix(q, x)), `${nomChoix(q, q.cible)} ${nomChoix(q, x)}`).toBe(false);
    }
  });

  it(d === 'facile' ? 'l’énoncé du QCM de capitale et de drapeau nomme le pays (D49 d)' : 'l’énoncé ne nomme jamais le pays', () => {
    for (const q of ps.flat()) expect(q.nomme === true, `${q.sujet} ${q.cible}`).toBe(d === 'facile' && q.forme === 'qcm' && (q.sujet === 'capitales' || q.sujet === 'drapeaux'));
  });

  it('même graine, même partie', () => {
    expect(tirerPartie(GENS, d, graine(7))).toEqual(tirerPartie(GENS, d, graine(7)));
    expect(tirerPartie(GENS, d, graine(7))).not.toEqual(tirerPartie(GENS, d, graine(8)));
  });
});

describe('leurres par difficulté (§ 9.2)', () => {
  it('facile : 3 lieux du niveau 1, du même continent quand il en a assez (pays, capitales)', () => {
    const qs = [...questions('facile', 'pays'), ...questions('facile', 'capitales')];
    expect(qs.length).toBeGreaterThan(100);
    for (const q of qs) {
      for (const x of leurres(q)) expect(niveau({ sujet: q.sujet, cible: x }), `${q.sujet} ${q.cible} ${x}`).toBe(1);
      const c = parPays.get(q.cible)!.continent;
      const connusDuContinent = GENS.find((g) => g.sujet === q.sujet)!.lieux(1).filter((x) => x !== q.cible && parPays.get(x)!.continent === c && GENS.find((g) => g.sujet === q.sujet)!.posable(x, 'qcm'));
      if (connusDuContinent.length >= 6) for (const x of leurres(q)) expect(parPays.get(x)!.continent, `${q.cible} ${x}`).toBe(c);
    }
  });

  it('facile : 3 drapeaux éloignés (aucune paire de score ≤ 0,5 avec le juste, pas de sa famille), de pays du niveau 1', () => {
    for (const q of questions('facile', 'drapeaux')) {
      for (const x of leurres(q)) {
        expect(proches.score(q.cible, x), `${q.cible} ${x}`).toBeUndefined();
        expect(sosiesDrapeau(drapeaux, q.cible), `${q.cible} ${x}`).not.toContain(x);
        expect(notoriete.drapeaux[x], x).toBe(1);
      }
    }
  });

  it('facile : 3 mers du niveau 1 pour une mer, les 3 ou 4 autres océans pour un océan', () => {
    const qs = questions('facile', 'mers');
    expect(qs.length).toBeGreaterThan(100);
    for (const q of qs) {
      const ocean = sorteMer.get(q.cible) === 'océan';
      for (const x of leurres(q)) {
        expect(notoriete.mers[x], `${q.cible} ${x}`).toBe(1);
        expect(sorteMer.get(x) === 'océan', `${q.cible} ${x}`).toBe(ocean);
      }
    }
  });

  it('moyen : 1 voisin quand le pays en a un de jouable, 2 lieux des niveaux 1 et 2', () => {
    const qs = questions('moyen', 'pays', 'qcm');
    expect(qs.length).toBeGreaterThan(50);
    for (const q of qs) {
      // Un voisin au nom proche est écarté (la Corée du Nord pour la Corée du Sud).
      const voisins = parPays.get(q.cible)!.voisins.filter((x) => jouable(x) && !nomsProches(noms[q.cible]!, noms[x]!));
      const pris = leurres(q).filter((x) => voisins.includes(x));
      if (voisins.length) expect(pris.length, q.cible).toBeGreaterThanOrEqual(1);
      expect(leurres(q).filter((x) => !voisins.includes(x)).every((x) => notoriete.pays[x]! <= 2), q.cible).toBe(true);
    }
  });

  it('moyen : 1 sosie au plus, et 2 drapeaux éloignés', () => {
    for (const q of questions('moyen', 'drapeaux', 'qcm')) {
      const proche = leurres(q).filter((x) => proches.score(q.cible, x) !== undefined || sosiesDrapeau(drapeaux, q.cible).includes(x));
      expect(proche.length, q.cible).toBeLessThanOrEqual(1);
      if (sosiesDrapeau(drapeaux, q.cible).length) expect(proche, q.cible).toHaveLength(1);
    }
  });

  it('difficile et expert : les voisins d’abord (pays) ; 3 sosies (drapeaux) quand il y en a assez', () => {
    for (const d of ['difficile', 'expert'] as const) {
      for (const q of questions(d, 'pays', 'qcm')) {
        const voisins = parPays.get(q.cible)!.voisins.filter(jouable);
        expect(leurres(q).filter((x) => voisins.includes(x)).length, q.cible).toBe(Math.min(3, voisins.length));
      }
      for (const q of questions(d, 'drapeaux', 'qcm')) {
        const sosies = new Set([...sosiesDrapeau(drapeaux, q.cible), ...proches.de(q.cible).map((x) => x.id)]);
        for (const j of jumeaux(q.cible)) sosies.delete(j);
        if (sosies.size >= 6) for (const x of leurres(q)) expect(sosies.has(x), `${q.cible} ${x}`).toBe(true);
      }
    }
  });

  it('au toucher, la capitale montrée : la plus connue (l’épreuve) en moyen, une juste au-delà', () => {
    for (const q of questions('moyen', 'capitales', 'toucher')) expect(q.indice).toBe(capitales.parPays.get(q.cible)!.epreuve.q);
    const qs = [...questions('difficile', 'capitales', 'toucher'), ...questions('expert', 'capitales', 'toucher')];
    for (const q of qs) expect(capitales.parPays.get(q.cible)!.justes.map((c) => c.q)).toContain(q.indice);
    for (const q of [...questions('moyen', 'pays'), ...questions('moyen', 'drapeaux'), ...questions('moyen', 'mers')]) expect(q.indice).toBeUndefined();
  });
});

describe('sujets prêts seulement (§ 9.1)', () => {
  it('à 3 sujets : 7, 7 et 6 questions ; à 2 : 10 et 10, et la partie se tire toujours', () => {
    const trois = generateurs({ ...D, mers: null });
    for (const g of GRAINES.slice(0, 10)) {
      const p = tirerPartie(trois, 'facile', graine(g));
      expect(p).toHaveLength(20);
      expect(['pays', 'capitales', 'drapeaux'].map((s) => p.filter((q) => q.sujet === s).length).sort()).toEqual([6, 7, 7]);
    }
    const deux = generateurs({ ...D, mers: null, drapeaux: null });
    for (const d of DIFFICULTES) {
      const p = tirerPartie(deux, d, graine(3));
      expect(p.filter((q) => q.sujet === 'pays')).toHaveLength(10);
      // Pays et capitales se partagent les mêmes entités : 20 pays différents.
      expect(new Set(p.map((q) => q.cible)).size).toBe(20);
    }
  });
});
