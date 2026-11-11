// Drapeaux des pays (étude J2 § 2.2, lot 2) : le manifeste public/geo/drapeaux.json
// (geodata/drapeaux.mjs : flag-icons 7.6.0 et une table à la main), lu une fois à
// la demande, comme les capitales (src/map/capitales.ts) : au choix du sujet
// Drapeaux dans Jouer, ou pour une séance qui a des fiches de drapeaux. Les
// images, un fichier par drapeau (public/geo/drapeaux/<sha8>.svg, nommé par
// l'empreinte de son contenu : l'adresse ne trahit pas le pays, et le fichier
// est servi immuable), ne se chargent qu'à l'affichage, ou un peu avant
// (précharger : la question suivante en Entraînement, les questions de la
// séance, toute une partie au départ d'une épreuve). Rien au premier
// affichage (décision « Hébergement » ; le smoke du pilote le vérifie).
//
// La cible d'une question reste l'id du pays : ces données ne servent qu'à ce
// qu'on montre (sujets.ts), aux jumeaux, zones admises en plus du seul sujet
// Drapeaux (D41 d : Indonésie et Monaco, Roumanie et Tchad), et aux sosies,
// leurres du quiz à partir du niveau moyen (D41 e, § 9.2 ; jamais en
// Entraînement, où les voisins viennent d'abord).

/** Une ligne de drapeaux.json, telle que servie. */
export interface LigneDrapeaux {
  pays: string;
  /** Les drapeaux justes du pays (empreintes) ; le premier est le montré (D41 : le tricolore de l'Afghanistan, le civil de la Bolivie). */
  d: string[];
  /** Ses jumeaux : même drapeau à l'écran (score 0). */
  j?: string[];
  /** Ses 3 plus proches sosies [id, score], du plus proche au moins proche ; jumeaux exceptés. */
  s: [string, number][];
}

export interface ManifesteDrapeaux {
  pays: LigneDrapeaux[];
  /** Les familles que la mesure rate, écrites à la main (croix nordiques, Union Jack…). */
  familles: Record<string, string[]>;
}

/** Les drapeaux d'un pays, adresses comprises. */
export interface DrapeauxPays {
  pays: string;
  /** L'adresse du drapeau montré (d[0]) : énoncé de Trouver, bouton de Reconnaître, révélation. */
  montre: string;
  /** Les adresses de tous ses drapeaux justes, le montré d'abord. */
  justes: readonly string[];
  /** Ses jumeaux (D41 d) : justes en plus en Trouver sous Drapeaux, jamais avec lui parmi 4 choix. */
  jumeaux: readonly string[];
  /** Ses sosies mesurés et leur score (0 : pareils, 1 : rien de commun), du plus proche au moins proche. */
  sosies: readonly { id: string; score: number }[];
}

export interface DonneesDrapeaux {
  /** Par id de pays : les 195 jouables, plus Kosovo et Taïwan (jamais posés). */
  parPays: ReadonlyMap<string, DrapeauxPays>;
  /** Les pays de chaque famille écrite à la main. */
  familles: ReadonlyMap<string, readonly string[]>;
}

/** L'adresse d'un drapeau par son empreinte, sous le dossier des données servies (base : « /geo/ »). */
export const adresseDrapeau = (empreinte: string, base = '/geo/'): string => `${base}drapeaux/${empreinte}.svg`;

/** Le manifeste assemblé ; lève sur un pays sans drapeau. */
export function lireDrapeaux(m: ManifesteDrapeaux, base = '/geo/'): DonneesDrapeaux {
  const parPays = new Map<string, DrapeauxPays>();
  for (const l of m.pays) {
    if (!l.d.length) throw new Error(`drapeaux : ${l.pays} sans drapeau`);
    const justes = l.d.map((e) => adresseDrapeau(e, base));
    parPays.set(l.pays, { pays: l.pays, montre: justes[0]!, justes, jumeaux: l.j ?? [], sosies: l.s.map(([id, score]) => ({ id, score })) });
  }
  return { parPays, familles: new Map(Object.entries(m.familles)) };
}

/** Lit un fichier JSON servi ; « <fichier> : HTTP xxx » levé comme les autres chargements. */
export type Lecteur = (chemin: string) => Promise<unknown>;

const lireHttp: Lecteur = async (chemin) => {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error(`${chemin.split('/').pop()} : HTTP ${r.status}`);
  return r.json();
};

let charges: DonneesDrapeaux | null = null;
let enCours: Promise<DonneesDrapeaux> | null = null;

/**
 * Le manifeste, lu une fois (promesse gardée ; un échec, hors ligne, ne reste
 * pas en cache : le prochain choix réessaie). Les images, non. `lire` : les tests.
 */
export function chargerDrapeaux(lire: Lecteur = lireHttp, base = '/geo/'): Promise<DonneesDrapeaux> {
  if (charges) return Promise.resolve(charges);
  if (!enCours) {
    const p = Promise.resolve(lire(`${base}drapeaux.json`)).then((m) => {
      charges = lireDrapeaux(m as ManifesteDrapeaux, base);
      return charges;
    });
    enCours = p;
    p.then(
      () => (enCours = null),
      () => (enCours = null),
    );
  }
  return enCours;
}

/** Le manifeste s'il est déjà lu (sans réseau), null sinon. */
export const drapeauxCharges = (): DonneesDrapeaux | null => charges;

/** Tests : oublie ce qui a été lu (le prochain chargement relit), et les drapeaux préchargés. */
export function oublierDrapeaux(): void {
  charges = null;
  enCours = null;
  demandes.clear();
}

/** Ce qui télécharge une image (new Image() dans la page ; les tests : un espion). */
export type Telecharger = (adresse: string) => void;

const parImage: Telecharger = (adresse) => {
  // Hors d'une page (tests sous node) : rien à précharger.
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = adresse;
};

/** Les adresses déjà demandées : une seule demande par drapeau et par page (le cache du navigateur fait le reste). */
const demandes = new Set<string>();

/**
 * Précharge le drapeau montré de ces pays (la question suivante de Trouver,
 * les choix de la question suivante de Reconnaître, les questions d'une
 * séance) : il est dans le cache du navigateur quand la question le montre.
 * Sans effet tant que le manifeste n'est pas lu, ou pour un pays sans drapeau.
 */
export function prechargerDrapeaux(ids: Iterable<string>, d: DonneesDrapeaux | null = charges, telecharger: Telecharger = parImage): void {
  if (!d) return;
  for (const id of ids) {
    const a = d.parPays.get(id)?.montre;
    if (!a || demandes.has(a)) continue;
    demandes.add(a);
    telecharger(a);
  }
}

/**
 * Toute une partie au départ (étude J2 § 2.2, § 9.3 : une épreuve classée,
 * src/vues/chrono.ts par commun.ts prechargerPartieSujet ; le quiz au lot 4) :
 * le drapeau de chaque question, d'un coup, dans l'ordre des questions, pour
 * qu'aucune ne montre le gris d'attente pendant que le temps court (la vue
 * attend quand même le décodage d'un drapeau en retard : ATTENTE_IMAGE_MS).
 */
export const prechargerPartie = (ids: readonly string[], d: DonneesDrapeaux | null = charges, telecharger: Telecharger = parImage): void =>
  prechargerDrapeaux(ids, d, telecharger);
