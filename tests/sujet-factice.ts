// Un sujet factice pour les tests des vues (lot 0b du J2, étude § 5.1) :
// déclaré ici seulement, jamais dans le code livré ni dans textes.fr.json.
// Chaque texte qu'il rend porte un code fait de chiffres (« 70-82-65 » pour
// FRA), jamais l'id ni le nom du lieu : une vue qui nomme un lieu sans passer
// par le rendu de son sujet (nomDe oublié quelque part) affiche « France »
// ou « FRA », et le test le voit.
//
// Dans un fichier de test :
//   vi.mock('../src/vues/sujets', async (orig) => (await import('./sujet-factice')).avecFactice(await orig()));
// puis une partie lancée sous le sujet 'factice' ; `remplaces` y fait passer
// aussi un vrai sujet (la séance, qui ne pose que des domaines jouables).
import { expect } from 'vitest';
import type * as Sujets from '../src/vues/sujets';
import type { RenduSujet, TextesSujet } from '../src/vues/sujets';

export const FACTICE = 'factice';

/** Le code d'un id : ses caractères en chiffres, « 70-82-65 » pour FRA ; ni lettre, ni l'id. */
export const code = (id: string): string => [...id].map((c) => c.charCodeAt(0)).join('-');

export const TEXTES_FACTICES: TextesSujet = {
  n: '{n} énigmes',
  enonce: 'Cherche : ',
  consigne_nommer: 'Quelle est cette énigme ?',
  faux_suite: 'La bonne énigme est en vert.',
  expire: 'Sablier vide.',
  la_mer: 'le large',
  rate_km: '{nom} : manquée de {km}',
  rate_trouver: '{nom} : énigme vue ou passée',
  rate_oublie: '{nom} : énigme oubliée',
  tout_appris: 'Toutes les énigmes sont résolues.',
  grappe_entamee: 'Les énigmes commencées ({serie}) passent avant.',
  conseil: 'Énigmes pas encore résolues : {chemin}',
  memoire: { nom: 'Énigme', jamais: 'jamais résolue', vu: 'résolue {n} fois', vu_une: 'résolue 1 fois' },
};

/** Le rendu du sujet factice : chaque méthode a son mot, puis le code du lieu. */
export function renduFactice(): RenduSujet {
  return {
    sujet: FACTICE,
    textes: TEXTES_FACTICES,
    enonce: (id) => ({ invite: TEXTES_FACTICES.enonce, objet: { texte: `énoncé ${code(id)}` } }),
    consigneQcm: () => TEXTES_FACTICES.consigne_nommer,
    choix: (id) => ({ texte: `bouton ${code(id)}` }),
    nomChoix: (id) => `choix ${code(id)}`,
    visuel: false,
    revelation: (id) => ({ texte: `révélé ${code(id)}` }),
    nomBilan: (id, sens) => `bilan-${sens} ${code(id)}`,
    lieu: (id) => `lieu ${code(id)}`,
    touche: (id) => (id ? `touché ${code(id)}` : TEXTES_FACTICES.la_mer),
    fauxSuite: (id) => `suite ${code(id)}.`,
    expire: (id) => `sablier ${code(id)}`,
    retro: () => '',
    point: () => null,
    points: () => [],
    imageEnonce: () => null,
    qcmPosable: () => true,
    qcmExclus: () => new Set(),
    qcmPareils: () => false,
    admisEnPlus: () => null,
  };
}

/** Les vrais sujets dont le rendu est remplacé par le factice (vider après chaque test). */
export const remplaces = new Set<string>();

/** Le module sujets.ts, avec le sujet factice en plus (et à la place des sujets de `remplaces`). */
export function avecFactice(m: typeof Sujets): typeof Sujets {
  return {
    ...m,
    rendu: (sujet, d, o) => (sujet === FACTICE || remplaces.has(sujet) ? renduFactice() : m.rendu(sujet, d, o)),
    textesSujet: (sujet) => (sujet === FACTICE || remplaces.has(sujet) ? TEXTES_FACTICES : m.textesSujet(sujet)),
  };
}

/** Le texte affiché ne contient aucun de ces ids ni de ces noms (mots entiers). */
export function sansBrut(texte: string, interdits: readonly string[]): void {
  const vus = interdits.filter((x) => new RegExp(`(^|[^\\p{L}\\p{N}_])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_])`, 'u').test(texte));
  expect(vus, texte).toEqual([]);
}
