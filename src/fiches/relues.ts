// Les lignes de la fiche dont la table à la main attend la relecture de
// l'utilisateur (#34, lot F2 pour les pays : tableaux de
// docs/relectures/fiches-pays.md ; lot F3 pour les territoires, les zones et
// l'Antarctique : docs/relectures/fiches-territoires.md, les statuts, et
// fiches-territoires-chiffres.md, le reste ; écrits par npm run fiches). Une
// clé par tableau. Codées et testées, mais hors ligne tant qu'elles
// ne sont pas relues : chacune passe à true, une par une, une fois son
// tableau relu (D56 c pour les langues, D57 pour la superficie). Les
// données restent servies (public/geo/fiches-monde*.json) : seule la fiche
// les tait, et son pied ne cite que ce qu'elle montre.

/** Une ligne de la fiche soumise à relecture. */
export type LigneRelue =
  | 'superficie'
  | 'langues'
  | 'gentile'
  | 'culminant'
  | 'fete'
  | 'statut'
  | 'capitale_territoires'
  | 'habitants_zones'
  | 'superficie_territoires'
  | 'langues_territoires'
  | 'gentile_territoires'
  | 'culminant_territoires'
  | 'riverains_mers'
  | 'superficie_mers'
  | 'profondeur_mers';

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
  /**
   * fiches-territoires.md, en entier : le texte de statut d'un territoire ou d'une zone en tête de
   * la fiche ; d'ici là, le libellé de la barre (« territoire », « statut contesté »).
   */
  statut: false,
  /** fiches-territoires-chiffres.md, § 1 : les capitales des territoires (la fiche, la barre, « Heure à … »). */
  capitale_territoires: false,
  /** § 2 : les habitants des zones contestées (D57 a : sourcés s'ils existent). Ceux des territoires sont en ligne. */
  habitants_zones: false,
  /** § 3 : les superficies des territoires et de l'Antarctique. */
  superficie_territoires: false,
  /** § 4 : les langues des territoires (D56 c). */
  langues_territoires: false,
  /** § 6 : les gentilés des territoires. */
  gentile_territoires: false,
  /** § 8 : les points culminants des territoires et de l'Antarctique. */
  culminant_territoires: false,
  /**
   * fiches-mers.md, § 1 : les pays riverains des mers (union du tracé et de Wikidata, retraits et ajouts
   * de la table) ; d'ici là, la fiche d'une mer n'a pas de section « Pays riverains ».
   */
  riverains_mers: false,
  /** § 2 : les superficies des mers et des océans (corrigées, océans d'après la NOAA) ; la fiche et la barre. */
  superficie_mers: false,
  /** § 3 : les profondeurs maximales (Wikidata, et la table pour les ambiguës). */
  profondeur_mers: false,
};
