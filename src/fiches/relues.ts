// Les lignes de la fiche d'un pays dont la table à la main attend la relecture
// de l'utilisateur (#34, lot F2 ; tableaux de docs/relectures/fiches-pays.md,
// écrits par npm run fiches). Codées et testées, mais hors ligne tant qu'elles
// ne sont pas relues : chacune passe à true, une par une, une fois son
// tableau relu (D56 c pour les langues, D57 pour la superficie). Les
// données restent servies (public/geo/fiches-monde*.json) : seule la fiche
// les tait, et son pied ne cite que ce qu'elle montre.

/** Une ligne de la fiche soumise à relecture. */
export type LigneRelue = 'superficie' | 'langues' | 'gentile' | 'culminant' | 'fete';

/** Ce que la fiche montre aujourd'hui : rien de ce qui attend la relecture. */
export const LIGNES_RELUES: Readonly<Record<LigneRelue, boolean>> = {
  /** § 5 du tableau : les 30 pays touchés par une zone disputée et les 18 à plusieurs valeurs. */
  superficie: false,
  /** § 4 : la liste finale, les retraits et les ajouts (D56 c). */
  langues: false,
  /** § 2 : les gentilés à plusieurs formes, le Vatican. */
  gentile: false,
  /** § 3 : les sommets tranchés à la main, ceux près d'une zone disputée. */
  culminant: false,
  /** § 1 : les fêtes, dont 44 à relire. */
  fete: false,
};
