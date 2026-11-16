// Types de licences/android.mjs (script Node), pour son test (tests/credits-vue.test.ts).
/** Les artefacts résolus d'un arbre de `gradle dependencies` : « groupe:nom:version », triés, sans doublon ni BOM. */
export function artefacts(arbre: string): string[];
/** Les groupes Maven de Google dont les AAR portent third_party_licenses.txt. */
export const GROUPES_AVIS: string[];
/** La marque des termes d'Apache 2.0 retirés d'un avis. */
export const APACHE_ICI: string;
/** Les composants d'un AAR : [nom, texte] d'après third_party_licenses.json (octets) et .txt. */
export function composantsAar(index: Record<string, { start: number; length: number }>, texte: Buffer): [string, string][];
/** Les mots des termes d'Apache 2.0 (de « TERMS AND CONDITIONS FOR USE » à « END OF TERMS AND CONDITIONS »). */
export function termesApache(apache: string): string[];
/** Le texte, chaque copie des termes d'Apache 2.0 (aux blancs près) remplacée par APACHE_ICI. */
export function factoriserApache(texte: string, termes: string[]): string;
/** Le relevé dédoublonné : par artefact, les indices de ses textes ; par texte, ses composants. */
export function releveAvis(
  parArtefact: Map<string, [string, string][]>,
  termes: string[],
): { artefacts: Record<string, number[]>; textes: { composants: string[]; texte: string }[] };
