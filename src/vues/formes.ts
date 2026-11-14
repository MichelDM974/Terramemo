// Formes des noms des pays dans une phrase (décision « Articles des noms de
// pays », 12/11/2026, lot 4a du J2) : « tenue par la Russie », « même drapeau
// que l'Indonésie », « Quelle est la capitale du Japon ? ». La table des 197
// pays (textes.formes_pays) est dans le fichier de langue, relue à la main,
// et tests/formes-pays.test.ts la confronte aux noms de public/geo/noms.fr.json.
// Un lieu qui n'y est pas (une commune, une zone contestée, une mer) garde son
// nom tel quel : il ne sert jamais qu'en étiquette (« enclave : Baïkonour »).
import { textes } from './textes';

/** « le » : le nom avec son article (« la Russie », « Israël ») ; « de » : précédé de « de » (« du Japon », « d'Israël »). */
export type FormePays = 'le' | 'de';

const FORMES = textes.formes_pays as unknown as Readonly<Record<string, Readonly<Record<FormePays, string>> | string>>;

/** La forme de ce pays dans une phrase ; null pour un id hors de la table (pas un pays, ou une note). */
export function formePays(id: string, forme: FormePays): string | null {
  const f = FORMES[id];
  return typeof f === 'object' ? f[forme] : null;
}

/**
 * Le nom commence-t-il par une voyelle ou un h muet (le « que » s'élide :
 * « qu'Israël », « qu'Haïti ») ? Seuls les noms sans article sont concernés :
 * « l'Inde », « le Honduras » commencent par une consonne.
 */
export const elide = (forme: string): boolean => /^[aeiouàâäéèêëîïôöùûüœæh]/i.test(forme);
