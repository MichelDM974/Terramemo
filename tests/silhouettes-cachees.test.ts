// Les silhouettes du J4 (lot 1) codées mais cachées tant que l'utilisateur n'a pas relu leur liste
// (docs/relectures/silhouettes.md) : un id de fiche écrit au journal ne s'efface plus. Rien ne les propose ni ne
// les écrit : ni Jouer, ni la mémoire, ni les épreuves, ni le quiz. Une seule constante les montre
// (SILHOUETTES_VISIBLES de src/visibles.ts) ; les règles Firestore les acceptent d'avance. Ce fichier ne vaut que
// tant qu'elles sont cachées : visibles, il est sauté, et tests/silhouettes.test.ts dit ce qu'elles sont.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BORNE_GENERAL, epreuvesClassees, EPREUVES_SUJETS, sujetOuvert } from '../src/epreuve/chrono';
import type { Pays } from '../src/map/types';
import { lireNotoriete } from '../src/quiz/donnees';
import { generateurs } from '../src/quiz/generateurs';
import { DOMAINES_JOUABLES } from '../src/srs/fiches';
import { SILHOUETTES_VISIBLES } from '../src/visibles';
import { creerArbre, lireDerniere, SUJETS } from '../src/vues/arbre';
import { catalogue } from '../src/vues/cibles';
import { installer } from '../src/vues/silhouettes';
import { outilsSilhouettes } from '../src/vues/sujets';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const PAYS = lire('pays.json') as Pays[];

describe.skipIf(SILHOUETTES_VISIBLES)('silhouettes cachées (src/visibles.ts), en attendant la relecture de leur liste', () => {
  it('ni dans Jouer (une adresse tapée n’y mène pas), ni dans la mémoire', () => {
    expect(SUJETS.map((s) => s.id)).not.toContain('silhouettes');
    expect(DOMAINES_JOUABLES).not.toContain('silhouettes');
    const a = creerArbre(catalogue(PAYS));
    expect(a.choix({ type: 'sujets', branche: 'entrainement' })).not.toContain('silhouettes');
    expect(a.resoudre(['entrainement', 'silhouettes', 'Africa'])).toEqual({ type: 'sujets', branche: 'entrainement' });
    // Un « Rejouer » d'une version qui les montrait (un essai) ne relance rien.
    const stockage = { getItem: () => JSON.stringify({ branche: 'entrainement', sujet: 'silhouettes', serie: 'Africa', mode: 'nommer' }), setItem: () => {} };
    expect(lireDerniere(stockage, a)).toBeNull();
  });

  it('ni dans les épreuves (le général reste à 1 244), ni au quiz ; les règles les acceptent d’avance (1 576)', () => {
    expect(EPREUVES_SUJETS.some((p) => p.sujet === 'silhouettes')).toBe(false);
    expect(sujetOuvert('silhouettes')).toBe(false);
    expect(epreuvesClassees().some((e) => e.includes(':silhouettes:'))).toBe(false);
    expect(BORNE_GENERAL).toBe(1244);
    expect(readFileSync('firestore.rules', 'utf8')).toContain('n == 0 ? d.questions <= 1576 :');
    const m = installer(lire('silhouettes.json'), outilsSilhouettes());
    const d = { pays: PAYS, noms: lire('noms.fr.json'), notoriete: lireNotoriete(lire('notoriete.json')), silhouettes: m.proches };
    expect(generateurs(d).map((g) => g.sujet)).toEqual(['pays']);
  });
});
