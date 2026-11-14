import { describe, expect, it } from 'vitest';
import { enregistrerPartie, epreuvesClassees, epreuvesDuGeneral, lireRecords, modeEpreuve, recordDe, vraisemblable } from '../src/epreuve/chrono';
import { idQuiz, PartieQuiz } from '../src/epreuve/quiz';
import { DIFFICULTES, type Question, type SujetQuiz } from '../src/quiz/types';

// Une partie du quiz général (étude J2 § 9.3, lot 4a) : barème de la décision « Barème
// et classements » (chaque question juste ou fausse, justes ÷ 20, départagé par le
// temps), temps bornés par le délai de chaque question, et la fin de D55 a : une partie
// compte dès sa première question montrée, un abandon publie le score acquis.

const SUJETS: SujetQuiz[] = ['pays', 'capitales', 'drapeaux', 'mers'];

/** 20 questions : les paires en QCM (10 s), les impaires au toucher (15 s), 5 par sujet. */
function questions(): Question[] {
  return Array.from({ length: 20 }, (_, i): Question => {
    const qcm = i % 2 === 0;
    const cible = `L${i}`;
    return {
      sujet: SUJETS[i % 4]!,
      forme: qcm ? 'qcm' : 'toucher',
      cible,
      entites: [cible],
      delai_ms: qcm ? 10_000 : 15_000,
      ...(qcm ? { choix: [cible, 'A', 'B', 'C'] } : {}),
    };
  });
}

function stockageFactice() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('idQuiz (§ 9.4)', () => {
  it('quiz:general:<difficulté>, du mode quiz, hors du général, parmi les épreuves classées', () => {
    expect(DIFFICULTES.map(idQuiz)).toEqual(['quiz:general:facile', 'quiz:general:moyen', 'quiz:general:difficile', 'quiz:general:expert']);
    for (const d of DIFFICULTES) {
      expect(modeEpreuve(idQuiz(d))).toBe('quiz');
      expect(epreuvesDuGeneral()).not.toContain(idQuiz(d));
      // Classé à part, ouvert au lot 4b (D50 c : les quatre sujets du J2 livrés).
      expect(epreuvesClassees()).toContain(idQuiz(d));
    }
  });
});

describe('PartieQuiz', () => {
  it('points : juste dans le délai de sa question, faux sinon ; le QCM juste si le choix est la cible', () => {
    const p = new PartieQuiz(questions());
    expect(p.question?.forme).toBe('qcm');
    expect(p.repondreChoix('L0', 2_000).points).toBe(1);
    // Toucher juste, à 12 s : dans les 15 s du toucher.
    expect(p.repondre('L1', true, null, 12_000).points).toBe(1);
    // QCM juste à 12 s : hors des 10 s du QCM.
    expect(p.repondreChoix('L2', 12_000).points).toBe(0);
    // QCM faux.
    expect(p.repondreChoix('A', 1_000)).toMatchObject({ points: 0, juste: false, touche: 'A' });
    // Délai écoulé.
    expect(p.expirer().points).toBe(0);
    expect(p.points).toBe(2);
  });

  it('score : justes ÷ 20 et le temps total, chaque temps borné par le délai de sa question', () => {
    const p = new PartieQuiz(questions());
    p.montrer();
    let attendu = 0;
    p.questions.forEach((q, i) => {
      // Juste partout, en 11 s : borné à 10 s au QCM (et faux), 11 s au toucher (juste).
      if (q.forme === 'qcm') p.repondreChoix(q.cible, 11_000);
      else p.repondre(q.cible, true, null, 11_000);
      attendu += q.forme === 'qcm' ? 10_000 : 11_000;
      expect(p.numero).toBe(i + 2);
    });
    expect(p.finie).toBe(true);
    expect(p.score()).toEqual({ points: 10, justes: 10, questions: 20, temps_ms: attendu });
    expect(vraisemblable(p.score(), idQuiz('moyen'))).toBe(true);
  });

  it('une question expirée compte tout son délai', () => {
    const p = new PartieQuiz(questions());
    p.expirer(); // QCM : 10 s
    p.expirer(); // toucher : 15 s
    const s = p.score();
    expect(s.justes).toBe(0);
    // Les 18 autres, pas jouées : tout leur délai aussi.
    expect(s.temps_ms).toBe(10 * 10_000 + 10 * 15_000);
  });

  it('parSujet : les justes de chaque sujet (« Capitales 4/5 »)', () => {
    const p = new PartieQuiz(questions());
    p.repondreChoix('L0', 1_000); // pays, juste
    p.repondre('L1', true, null, 1_000); // capitales, juste
    p.repondreChoix('B', 1_000); // drapeaux, faux
    expect([...p.parSujet()]).toEqual([
      ['pays', { justes: 1, questions: 5 }],
      ['capitales', { justes: 1, questions: 5 }],
      ['drapeaux', { justes: 0, questions: 5 }],
      ['mers', { justes: 0, questions: 5 }],
    ]);
  });
});

describe('fin d’une partie (D55 a)', () => {
  it('ne compte pas avant sa première question montrée ; compte dès qu’elle l’est', () => {
    const p = new PartieQuiz(questions());
    expect(p.compte).toBe(false);
    p.montrer();
    expect(p.compte).toBe(true);
  });

  it('un abandon après la première question écrit un record : le score acquis, les questions sans réponse à 0 et tout leur délai', () => {
    const p = new PartieQuiz(questions());
    p.montrer();
    p.repondreChoix('L0', 3_000);
    p.montrer();
    // Abandon : 19 questions sans réponse.
    const s = p.score();
    expect(s).toEqual({ points: 1, justes: 1, questions: 20, temps_ms: 3_000 + 9 * 10_000 + 10 * 15_000 });
    expect(p.compte).toBe(true);
    // 10 questions à 4 choix et 10 au toucher : la forme du moyen, dont le temps le plus long est le sien (250 s).
    expect(vraisemblable(s, idQuiz('moyen'))).toBe(true);
    const st = stockageFactice();
    const b = enregistrerPartie(st, idQuiz('moyen'), s, Date.UTC(2026, 10, 16, 8));
    expect(b.toujours.nouveau).toBe(true);
    expect(b.toujours.progresPubliable).toBe(true);
    const records = lireRecords(st);
    expect(recordDe(records, idQuiz('moyen'), 'toujours')).toMatchObject({ justes: 1, questions: 20 });
    expect(recordDe(records, idQuiz('moyen'), b.periode)).toMatchObject({ justes: 1, questions: 20 });
  });

  it('abandonnée d’emblée (aucune question montrée) : rien ne compte', () => {
    const p = new PartieQuiz(questions());
    expect(p.compte).toBe(false);
    expect(p.score().justes).toBe(0);
  });
});
