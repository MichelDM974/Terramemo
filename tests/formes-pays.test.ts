import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elide, formePays } from '../src/vues/formes';
import { rendu } from '../src/vues/sujets';
import { textes } from '../src/vues/textes';

// Formes des noms des pays dans une phrase (décision « Articles des noms de pays »,
// lot 4a du J2) : la table de textes.fr.json (formes_pays), relue à la main, confrontée
// ici aux noms affichés (public/geo/noms.fr.json) et aux 197 pays (195 jouables, Kosovo
// et Taïwan).

const noms = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
const pays = (JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as { id: string; statut: string }[])
  .filter((p) => p.statut === 'jouable' || p.statut === 'optionnel')
  .map((p) => p.id);
const table = Object.entries(textes.formes_pays as unknown as Record<string, { le: string; de: string } | string>).filter(
  (e): e is [string, { le: string; de: string }] => e[0] !== '_',
);

/** Les articles et leur forme après « de » : le → du, la → de la, l' → de l', les → des. */
const DE: Record<string, string> = { 'le ': 'du ', 'la ': 'de la ', "l'": "de l'", 'les ': 'des ' };

describe('formes_pays (textes.fr.json)', () => {
  it('une ligne par pays des 197, rien d’autre, triée par id', () => {
    expect(table.map(([id]) => id)).toEqual([...pays].sort());
  });

  it('« le » : le nom affiché, seul ou après le, la, l’ ou les (minuscule en tête permise : « les îles Marshall ») ; « de » suit le même article', () => {
    for (const [id, f] of table) {
      const nom = noms[id]!;
      const variantes = [nom, nom[0]!.toLowerCase() + nom.slice(1)];
      const article = Object.keys(DE).find((a) => variantes.some((v) => f.le === a + v));
      if (article === undefined) {
        // Sans article : le nom tel quel, « de » ou « d' » devant une voyelle ou un h muet (Haïti).
        expect(f.le, id).toBe(nom);
        expect(f.de, id).toBe(elide(nom) ? `d'${nom}` : `de ${nom}`);
      } else {
        expect(f.de, id).toBe(DE[article] + f.le.slice(article.length));
        // L'article élidé devant une voyelle seulement, jamais « le » ni « la » devant une voyelle ; « les » devant tout.
        // (« le Honduras », « la Hongrie » : h aspiré.)
        const reste = f.le.slice(article.length);
        if (article === "l'") expect(elide(reste), id).toBe(true);
        else if (article !== 'les ') expect(/^[aeiouàâäéèêëîïôöùûüœæ]/i.test(reste), `${id} : ${f.le}`).toBe(false);
      }
    }
  });

  it('relus à la main : quelques formes attendues', () => {
    const attendu: Record<string, [string, string]> = {
      JPN: ['le Japon', 'du Japon'],
      IDN: ["l'Indonésie", "de l'Indonésie"],
      RUS: ['la Russie', 'de la Russie'],
      USA: ['les États-Unis', 'des États-Unis'],
      MHL: ['les îles Marshall', 'des îles Marshall'],
      ISR: ['Israël', "d'Israël"],
      HTI: ['Haïti', "d'Haïti"],
      HND: ['le Honduras', 'du Honduras'],
      HUN: ['la Hongrie', 'de la Hongrie'],
      MCO: ['Monaco', 'de Monaco'],
      CUB: ['Cuba', 'de Cuba'],
      MDG: ['Madagascar', 'de Madagascar'],
      VAT: ["l'État de la Cité du Vatican", "de l'État de la Cité du Vatican"],
      MMR: ['le Myanmar (Birmanie)', 'du Myanmar (Birmanie)'],
      CIV: ['la Côte d’Ivoire', 'de la Côte d’Ivoire'],
      PSE: ['la Palestine', 'de la Palestine'],
    };
    for (const [id, [le, de]] of Object.entries(attendu)) {
      expect(formePays(id, 'le'), id).toBe(le);
      expect(formePays(id, 'de'), id).toBe(de);
    }
  });

  it('hors de la table (une commune, une zone contestée, la note) : null', () => {
    expect(formePays('97407', 'le')).toBeNull();
    expect(formePays('NE_SOL', 'de')).toBeNull();
    expect(formePays('_', 'le')).toBeNull();
  });

  it('elide : voyelle ou h muet en tête', () => {
    expect(['Israël', 'Oman', 'Haïti', 'Antigua-et-Barbuda'].every(elide)).toBe(true);
    expect(["l'Inde", 'le Honduras', 'Monaco', 'la Russie'].some(elide)).toBe(false);
  });
});

describe('rendus : le pays dans une phrase', () => {
  it('lieuArticle : avec article pour un pays, tel quel pour une commune ou une zone hors de la table', () => {
    const r = rendu('pays', { noms: { ...noms, '97407': 'Le Port' } });
    expect(r.lieuArticle('RUS')).toBe('la Russie');
    expect(r.lieuArticle('ISR')).toBe('Israël');
    expect(r.lieuArticle('97407')).toBe('Le Port');
    expect(rendu('communes', { noms: { '97407': 'Le Port' } }).lieuArticle('97407')).toBe('Le Port');
  });

  it('consigneNommee (D49 d) : aucune pour les pays ; le texte du quiz nomme le pays par sa forme « de »', () => {
    expect(rendu('pays', { noms }).consigneNommee('JPN')).toBeNull();
    expect(textes.quiz.consigne_capitale).toBe('Quelle est la capitale {pays} ?');
    expect(textes.quiz.consigne_drapeau).toBe('Quel est le drapeau {pays} ?');
  });
});
