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
      expect(r.consigneQcm).toBe(ts.consigne_nommer);
      expect(r.choix('97407')).toEqual({ texte: 'Le Port' });
      expect(r.nomChoix('FRA')).toBe('France');
      expect(r.revelation('FRA')).toEqual({ texte: 'France' });
      for (const sens of ['localiser', 'nommer'] as const) expect(r.nomBilan('FRA', sens)).toBe('France');
      expect(r.lieu('FRA')).toBe('France');
      expect(r.touche('FRA')).toBe('France');
      expect(r.touche(null)).toBe('la mer');
      expect(r.fauxSuite('FRA')).toBe(ts.faux_suite);
      expect(r.expire('FRA', true)).toBe(ts.expire);
      expect(r.expire('FRA', false)).toBe(ts.expire_sans_points);
      expect(r.lieu('ZZZ')).toBe('ZZZ');
    }
    expect(nomDe({ noms }, 'ZZZ')).toBe('ZZZ');
  });

  it('les textes d’avant, mot pour mot', () => {
    expect(rendu('pays', { noms }).consigneQcm).toBe('Quel est ce pays ?');
    expect(rendu('communes', { noms }).consigneQcm).toBe('Quelle est cette commune ?');
    expect(rendu('pays', { noms }).fauxSuite('FRA')).toBe('Le bon pays est en vert : touche-le.');
    expect(rendu('communes', { noms }).expire('97407', true)).toBe('Temps écoulé · +0. La bonne commune est en vert.');
    expect(compteSerie('pays', 54)).toBe('54 pays');
    expect(compteSerie('communes', 24)).toBe('24 communes');
    expect(textesSujet('pays').tout_appris).toBe('Tous les pays de cette série sont appris.');
    expect(textesSujet('communes').tout_appris).toBe('Toutes les communes sont apprises.');
  });

  it('chaque sujet de Jouer et chaque domaine jouable a son rendu ; un sujet sans rendu lève, plutôt que d’afficher un pays', () => {
    for (const s of SUJETS) expect(estSujetRendu(s.id), s.id).toBe(true);
    for (const d of DOMAINES_JOUABLES) expect(estSujetRendu(d), d).toBe(true);
    expect(Object.keys(textes.sujets).sort()).toEqual(['communes', 'pays']);
    // Le sujet factice des tests n'existe pas dans le code livré.
    expect(estSujetRendu('factice')).toBe(false);
    expect(estSujetRendu('toString')).toBe(false);
    expect(() => rendu('capitales', { noms })).toThrow(/sujet sans rendu/);
    expect(() => compteSerie('mers', 50)).toThrow(/sujet sans rendu/);
    expect(SUJET_CARTE).toEqual({ monde: 'pays', reunion: 'communes' });
  });

  it('aucune vue ne nomme un lieu sans le rendu de son sujet : ni nomDe, ni textes.terrains, ni textes.sujets hors de sujets.ts', () => {
    const dossier = 'src/vues';
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.ts') && x !== 'sujets.ts')) {
      // Le code seul : les commentaires peuvent citer ces noms.
      const src = readFileSync(`${dossier}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\bnomDe\b/);
      expect(src, f).not.toMatch(/\.sujets\.(pays|communes)\b|textes\.sujets\b/);
      expect(src, f).not.toMatch(/textes\.terrains\.monde|textes\.terrains\[/);
    }
  });
});
