// Rendu par sujet (src/vues/sujets.ts, étude J2 § 5.1, lot 0b) : pays et
// communes rendus comme avant (leur nom partout), les textes propres à un
// sujet en un seul endroit, et aucune vue qui nomme un lieu sans passer par
// le rendu de son sujet.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOMAINES_JOUABLES } from '../src/srs/fiches';
import { SUJETS } from '../src/vues/arbre';
import { compteSerie, estSujetRendu, nomDe, rendu, SUJET_CARTE, textesSujet } from '../src/vues/sujets';
import { textes } from '../src/vues/textes';

const noms = { FRA: 'France', '97407': 'Le Port' };

describe('rendu par sujet', () => {
  it('pays et communes : le nom du lieu partout, l’id brut à défaut (nomDe)', () => {
    for (const sujet of ['pays', 'communes'] as const) {
      const r = rendu(sujet, { noms });
      const ts = textes.sujets[sujet];
      expect(r.sujet).toBe(sujet);
      expect(r.textes).toBe(ts);
      expect(r.enonce('FRA')).toEqual({ invite: 'Touche : ', objet: { texte: 'France' } });
      expect(r.consigneQcm('FRA')).toBe(ts.consigne_nommer);
      expect(r.choix('97407')).toEqual({ texte: 'Le Port' });
      expect(r.nomChoix('FRA')).toBe('France');
      expect(r.revelation('FRA')).toEqual({ texte: 'France' });
      for (const sens of ['localiser', 'nommer'] as const) expect(r.nomBilan('FRA', sens)).toBe('France');
      expect(r.lieu('FRA')).toBe('France');
      expect(r.touche('FRA')).toBe('France');
      expect(r.touche(null)).toBe('la mer');
      expect(r.fauxSuite('FRA')).toBe(ts.faux_suite.replace('{cible}', 'France'));
      expect(r.expire('FRA')).toBe(ts.expire.replace('{cible}', 'France'));
      expect(r.lieu('ZZZ')).toBe('ZZZ');
    }
    expect(nomDe({ noms }, 'ZZZ')).toBe('ZZZ');
  });

  it('les textes d’avant, mot pour mot', () => {
    expect(rendu('pays', { noms }).consigneQcm('FRA')).toBe('Quel est ce pays ?');
    expect(rendu('communes', { noms }).consigneQcm('97407')).toBe('Quelle est cette commune ?');
    expect(rendu('pays', { noms }).fauxSuite('FRA')).toBe('Bonne réponse : France, en vert : touche-le.');
    // Sans « +0 » depuis le barème 2 (décision « Barème et classements ») : le temps écoulé est une erreur, sans points.
    expect(rendu('communes', { noms }).expire('97407')).toBe('Temps écoulé · bonne réponse : Le Port, en vert');
    expect(compteSerie('pays', 54)).toBe('54 pays');
    expect(compteSerie('communes', 24)).toBe('24 communes');
    expect(textesSujet('pays').tout_appris).toBe('Tous les pays de cette série sont appris.');
    expect(textesSujet('communes').tout_appris).toBe('Toutes les communes sont apprises.');
  });

  it('chaque sujet de Jouer et chaque domaine jouable a son rendu ; un sujet sans rendu lève, plutôt que d’afficher un pays', () => {
    for (const s of SUJETS) expect(estSujetRendu(s.id), s.id).toBe(true);
    for (const d of DOMAINES_JOUABLES) expect(estSujetRendu(d), d).toBe(true);
    expect(Object.keys(textes.sujets)).toEqual(['pays', 'capitales', 'drapeaux', 'silhouettes', 'voisins', 'mers', 'communes']);
    // Le sujet factice des tests n'existe pas dans le code livré.
    expect(estSujetRendu('factice')).toBe(false);
    expect(estSujetRendu('toString')).toBe(false);
    expect(() => rendu('quiz', { noms })).toThrow(/sujet sans rendu/);
    // Les mers sans leur couche : de même, jamais l'id brut (« medit ») à la place de leur nom.
    expect(() => rendu('mers', { noms })).toThrow(/mers : couche pas chargée/);
    // Les capitales sans leurs données : une erreur, jamais un pays ni un Qid à leur place.
    expect(() => rendu('capitales', { noms })).toThrow(/capitales : données pas chargées/);
    // Les drapeaux sans leur manifeste : de même, jamais un pays à la place de son drapeau.
    expect(() => rendu('drapeaux', { noms })).toThrow(/drapeaux : manifeste pas chargé/);
    // Les silhouettes sans leur morceau (chargé à la demande) : de même, jamais un nom à la place du dessin.
    expect(() => rendu('silhouettes', { noms })).toThrow(/silhouettes : morceau pas chargé/);
    // Les voisins de même (leur morceau, chargé à la demande).
    expect(() => rendu('voisins', { noms })).toThrow(/voisins : morceau pas chargé/);
    expect(compteSerie('mers', 50)).toBe('50 océans et mers');
    expect(() => compteSerie('quiz', 20)).toThrow(/sujet sans rendu/);
    expect(SUJET_CARTE).toEqual({ monde: 'pays', reunion: 'communes' });
  });

  it('aucune vue ne nomme un lieu sans le rendu de son sujet : ni nomDe, ni textes.terrains, ni textes.sujets hors de sujets.ts', () => {
    const dossier = 'src/vues';
    // silhouettes.ts et voisins.ts : le rendu de leur sujet, la suite de sujets.ts dans un morceau chargé à la demande.
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.ts') && !['sujets.ts', 'silhouettes.ts', 'voisins.ts'].includes(x))) {
      // Le code seul : les commentaires peuvent citer ces noms.
      const src = readFileSync(`${dossier}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\bnomDe\b/);
      expect(src, f).not.toMatch(/\.sujets\.(pays|communes)\b|textes\.sujets\b/);
      expect(src, f).not.toMatch(/textes\.terrains\.monde|textes\.terrains\[/);
    }
  });
});
