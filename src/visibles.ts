// Les sujets codés mais cachés (#6) : un id de fiche écrit au journal ne
// s'efface plus, si bien qu'une entité retirée d'un sujet après coup y
// laisserait des fiches orphelines. Un sujet dont la liste attend la
// relecture de l'utilisateur est donc livré caché : ni dans Jouer
// (SUJETS), ni dans la mémoire (DOMAINES_JOUABLES), ni dans les épreuves
// (EPREUVES_SUJETS, BORNE_GENERAL), ni au quiz (generateurs). Rien ne
// l'écrit au journal. Le rendre visible : sa constante « …_RELUES » à true,
// seule ; les règles Firestore le connaissent d'avance (décision
// « Ouverture des épreuves d'un sujet » : les règles d'abord). Les tests
// l'exercent en remplaçant ce module (vi.mock('../src/visibles')).

/**
 * Silhouettes (lot 1 du J4, D618 à D621) : la liste des 166 pays, des 29
 * sans silhouette, des parties lointaines retirées et des formes proches
 * attend la relecture de l'utilisateur (docs/relectures/silhouettes.md).
 * true une fois validée.
 */
const SILHOUETTES_RELUES = false;

/**
 * Les silhouettes se montrent-elles dans cette version ? Relues ; ou, en
 * développement seulement (le serveur de Vite : le pilote du skill
 * run-terramemo, sur ses données jetables), `?silhouettes` dans l'adresse,
 * pour les voir avant leur relecture. Jamais au build : import.meta.env.DEV y
 * vaut false, l'expression s'y réduit à SILHOUETTES_RELUES (sans appel au
 * chargement du module : un appel y faisait sortir les textes dans un
 * morceau partagé préchargé, mesuré au build).
 */
export const SILHOUETTES_VISIBLES: boolean =
  SILHOUETTES_RELUES || (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('silhouettes'));
