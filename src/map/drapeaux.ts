// Drapeaux des pays (étude J2 § 2.2, lot 2) : le manifeste public/geo/drapeaux.json
// (geodata/drapeaux.mjs : flag-icons 7.6.0 et une table à la main), lu une fois à
// la demande, comme les capitales (src/map/capitales.ts) : au choix du sujet
// Drapeaux dans Jouer, ou pour une séance qui a des fiches de drapeaux. Les
// images, un fichier par drapeau (public/geo/drapeaux/<sha8>.svg, nommé par
// l'empreinte de son contenu : l'adresse ne trahit pas le pays, et le fichier
// est servi immuable), ne se chargent qu'à l'affichage, ou un peu avant
// (précharger : la question suivante en Entraînement, les questions de la
// séance), ou, pour une épreuve classée, toutes au départ, attendues avant sa
// première question (attendreImages, décision « Images d'une épreuve »). Rien
// au premier affichage (décision « Hébergement » ; le smoke du pilote le
// vérifie).
//
// La cible d'une question reste l'id du pays : ces données ne servent qu'à ce
// qu'on montre (sujets.ts), aux jumeaux, zones admises en plus du seul sujet
// Drapeaux (D41 d : Indonésie et Monaco, Roumanie et Tchad), et aux sosies,
// leurres du quiz à partir du niveau moyen (D41 e, § 9.2 ; jamais en
// Entraînement, où les voisins viennent d'abord).

/** Une ligne de drapeaux.json, telle que servie. */
export interface LigneDrapeaux {
  pays: string;
  /**
   * Les drapeaux justes du pays (empreintes). Le premier est le montré partout
   * (D41 : le tricolore de l'Afghanistan, le civil de la Bolivie), sauf
   * l'énoncé de Trouver hors épreuve, tiré au hasard parmi tous (sujets.ts).
   */
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
  /**
   * L'adresse du premier drapeau (d[0]), le même pour tous : bouton de
   * Reconnaître, révélation, rétroaction, énoncé d'une épreuve classée.
   */
  montre: string;
  /**
   * Les adresses de tous ses drapeaux justes, le montré d'abord : l'énoncé de
   * Trouver hors épreuve (Entraînement, séance) en montre un, tiré au hasard et
   * fixé pour la question (comme une capitale, D38 a ; décision « Drapeaux
   * contestés et sosies »).
   */
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
  decodes.clear();
  enVol.clear();
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

/** Précharge ces images (leurs adresses), chacune une fois par page. */
export function prechargerImages(adresses: Iterable<string>, telecharger: Telecharger = parImage): void {
  for (const a of adresses) {
    if (demandes.has(a)) continue;
    demandes.add(a);
    telecharger(a);
  }
}

/** Les adresses des drapeaux de ces pays : le premier (montre) de chacun, ou tous ses justes ; rien pour un pays sans drapeau. */
const adressesDe = (ids: Iterable<string>, d: DonneesDrapeaux, justes: boolean): string[] =>
  [...ids].flatMap((id) => {
    const x = d.parPays.get(id);
    return !x ? [] : justes ? x.justes : [x.montre];
  });

/**
 * Précharge le premier drapeau (montre) de ces pays : les choix de la
 * question suivante de Reconnaître, qui montrent toujours celui-là. Le
 * drapeau d'un énoncé de Trouver, tiré parmi les justes, se précharge par son
 * adresse (commun.ts prechargerEnonces, qui la demande au rendu). Sans effet
 * tant que le manifeste n'est pas lu, ou pour un pays sans drapeau.
 */
export function prechargerDrapeaux(ids: Iterable<string>, d: DonneesDrapeaux | null = charges, telecharger: Telecharger = parImage): void {
  if (d) prechargerImages(adressesDe(ids, d, false), telecharger);
}

/**
 * Précharge tous les drapeaux justes de ces pays (les questions d'une séance,
 * à son ouverture) : l'énoncé de Trouver n'est tiré qu'à sa pose, si bien que
 * l'Afghanistan et la Bolivie demandent leurs deux drapeaux ; le montré sert
 * aussi aux cartes retournées et aux choix.
 */
export function prechargerJustes(ids: Iterable<string>, d: DonneesDrapeaux | null = charges, telecharger: Telecharger = parImage): void {
  if (d) prechargerImages(adressesDe(ids, d, true), telecharger);
}

/**
 * Ce qui charge et décode une image pour l'attendre (new Image(), puis
 * decode() ; les tests : des images factices) : rejetée si elle n'arrive pas
 * ou ne se décode pas ; null hors d'une page (rien à attendre).
 */
export type ChargerImage = (adresse: string) => Promise<unknown> | null;

const parDecodage: ChargerImage = (adresse) => {
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.decoding = 'async';
  img.src = adresse;
  if (typeof img.decode === 'function') return img.decode();
  return new Promise((ok, ko) => {
    img.onload = ok;
    img.onerror = ko;
  });
};

/** Les images chargées et décodées dans cette page : une partie rejouée ne les attend plus. */
const decodes = new Set<string>();
/** Les chargements attendus en cours (vrai : décodée) : une partie relancée pendant l'attente ne les redemande pas. */
const enVol = new Map<string, Promise<boolean>>();

/** Le chargement attendu d'une image, partagé tant qu'il dure ; null si elle est déjà là (ou hors d'une page). */
function chargerUne(a: string, charger: ChargerImage): Promise<boolean> | null {
  if (decodes.has(a)) return null;
  const deja = enVol.get(a);
  if (deja) return deja;
  const p = charger(a);
  if (!p) return null;
  const suivi = p.then(
    () => {
      decodes.add(a);
      demandes.add(a);
      return true;
    },
    () => false,
  );
  enVol.set(a, suivi);
  void suivi.then(() => enVol.delete(a));
  return suivi;
}

/**
 * Toutes les images d'une partie, attendues avant sa première question
 * (étude J2 § 2.2, § 9.3 ; décision « Images d'une épreuve » : une épreuve
 * classée, src/vues/chrono.ts par commun.ts attendreEnonces ; le quiz au
 * lot 4) : demandées d'un coup, dans l'ordre des questions, chacune une fois.
 * null : rien à attendre (toutes déjà décodées dans cette page, ou hors d'une
 * page), la partie part tout de suite. Sinon la promesse des adresses qui ont
 * échoué ([] : toutes là) ; `progres(n, total)` à chaque image arrivée (les
 * déjà décodées comptées d'avance). Rappelée après un échec, elle ne
 * redemande que celles qui manquent, par une nouvelle image (pas par
 * prechargerImages, qui ne redemande jamais une adresse).
 */
export function attendreImages(adresses: readonly string[], progres?: (n: number, total: number) => void, charger: ChargerImage = parDecodage): Promise<string[]> | null {
  const toutes = [...new Set(adresses)];
  const attentes = toutes.flatMap((a) => {
    const p = chargerUne(a, charger);
    return p ? [{ a, p }] : [];
  });
  if (!attentes.length) return null;
  let n = toutes.length - attentes.length;
  progres?.(n, toutes.length);
  return Promise.all(
    attentes.map(({ a, p }) =>
      p.then((ok) => {
        if (!ok) return a;
        progres?.(++n, toutes.length);
        return null;
      }),
    ),
  ).then((r) => r.filter((a): a is string => a !== null));
}
