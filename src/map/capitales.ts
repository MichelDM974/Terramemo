// Capitales des pays (étude J2 § 2.1, lot 1) : public/geo/capitales.json
// (geodata/capitales.mjs : Wikidata figé et table à la main) et son fichier
// de langue capitales.fr.json, lus une fois à la demande, comme l'île
// (src/terrains.ts) : au choix du sujet Capitales dans Jouer, à la première
// frappe dans la recherche, ou pour une séance qui a des fiches de capitales.
// Rien au premier affichage (décision « Hébergement » ; le smoke du pilote le
// vérifie).
//
// La cible d'une question reste l'id du pays : ces données ne servent qu'à ce
// qu'on montre (énoncé, choix, révélation, rétroaction, bilans : sujets.ts),
// à la recherche, à l'anneau au point de la ville (D53 c) et aux zones
// admises de Jérusalem (D36 i).

/** Rôle d'une capitale juste : officielle (que le pays se déclare), siège du gouvernement, capitale économique (Bujumbura, D36 a). */
export type RoleCapitale = 'officielle' | 'siege' | 'economique';

/** Une ligne de capitales.json, telle que servie. */
interface CapitaleBrute {
  q: string;
  lon: number;
  lat: number;
  role: RoleCapitale;
  /** 1 : la principale du pays (une capitale officielle, une seule par pays). */
  p?: 1;
  /** 1 : celle de l'épreuve, la même pour tous (D38 d : la plus connue ; Palestine : la principale). */
  e?: 1;
}

export interface LigneCapitales {
  pays: string;
  c: CapitaleBrute[];
  /** 1 : la capitale porte le nom du pays (les 9 de D37). */
  m?: 1;
  /** Les pays dont la capitale n'est jamais un leurre pour celui-ci (Israël ↔ Palestine). */
  x?: string[];
}

export interface NomsCapitales {
  noms: Record<string, string>;
  alias: Record<string, string[]>;
}

/** Une capitale juste d'un pays, nommée. */
export interface Capitale {
  /** L'item Wikidata : un identifiant, jamais affiché. */
  q: string;
  nom: string;
  /** Autres graphies, cherchées par la recherche (Kyiv, Beijing) ; jamais affichées en question. */
  alias: readonly string[];
  point: [number, number];
  role: RoleCapitale;
}

/** Les capitales justes d'un pays. */
export interface CapitalesPays {
  pays: string;
  /** Toutes, la principale d'abord, puis dans l'ordre du fichier. */
  justes: readonly Capitale[];
  principale: Capitale;
  /** Celle des épreuves classées (D38 d), fixe pour tous. */
  epreuve: Capitale;
  /** La capitale porte le nom du pays (D37 c : jamais posée ni leurre dans un QCM). */
  memeNom: boolean;
  /** Pays dont la capitale n'est jamais un leurre pour celui-ci (x). */
  sansLeurre: readonly string[];
}

export interface DonneesCapitales {
  /** Par id de pays : les 195 jouables, plus Kosovo et Taïwan (jamais posés). */
  parPays: ReadonlyMap<string, CapitalesPays>;
}

/**
 * D36 i (« oui aux deux ») : une capitale montrée qui rend juste, en plus du
 * pays de la question, le toucher d'un autre pays, pour le seul sujet
 * Capitales. Jérusalem (question Israël) : la Palestine, qui la revendique ;
 * Jérusalem-Est (question Palestine) : Israël, qui la tient. Rien pour
 * Ramallah. Par item Wikidata, vérifié contre les données (tests).
 */
export const ADMET_EN_PLUS: Readonly<Record<string, readonly string[]>> = {
  Q1218: ['PSE'], // Jérusalem
  Q212938: ['ISR'], // Jérusalem-Est
};

/** Les deux fichiers assemblés ; lève sur une ligne sans principale, sans capitale d'épreuve, ou un Qid sans nom (le Qid ne s'affiche jamais). */
export function lireCapitales(lignes: readonly LigneCapitales[], fr: NomsCapitales): DonneesCapitales {
  const parPays = new Map<string, CapitalesPays>();
  for (const l of lignes) {
    const nommer = (c: CapitaleBrute): Capitale => {
      const nom = fr.noms[c.q];
      if (!nom) throw new Error(`capitales : ${c.q} (${l.pays}) sans nom`);
      return { q: c.q, nom, alias: fr.alias[c.q] ?? [], point: [c.lon, c.lat], role: c.role };
    };
    const principale = l.c.find((c) => c.p);
    const epreuve = l.c.find((c) => c.e);
    if (!principale || !epreuve) throw new Error(`capitales : ${l.pays} sans principale ou sans capitale d'épreuve`);
    const justes = [principale, ...l.c.filter((c) => c !== principale)].map(nommer);
    parPays.set(l.pays, {
      pays: l.pays,
      justes,
      principale: justes[0]!,
      epreuve: justes.find((c) => c.q === epreuve.q)!,
      memeNom: l.m === 1,
      sansLeurre: l.x ?? [],
    });
  }
  return { parPays };
}

/** Lit un fichier JSON servi ; « <fichier> : HTTP xxx » levé comme les autres chargements. */
export type Lecteur = (chemin: string) => Promise<unknown>;

const lireHttp: Lecteur = async (chemin) => {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error(`${chemin.split('/').pop()} : HTTP ${r.status}`);
  return r.json();
};

let chargees: DonneesCapitales | null = null;
let enCours: Promise<DonneesCapitales> | null = null;

/**
 * Les capitales, lues une fois (promesse gardée ; un échec, hors ligne, ne
 * reste pas en cache : le prochain choix réessaie). `lire` : les tests.
 */
export function chargerCapitales(lire: Lecteur = lireHttp, base = '/geo/'): Promise<DonneesCapitales> {
  if (chargees) return Promise.resolve(chargees);
  if (!enCours) {
    const p = Promise.all([lire(`${base}capitales.json`), lire(`${base}capitales.fr.json`)]).then(([l, fr]) => {
      chargees = lireCapitales(l as LigneCapitales[], fr as NomsCapitales);
      return chargees;
    });
    enCours = p;
    p.then(
      () => (enCours = null),
      () => (enCours = null),
    );
  }
  return enCours;
}

/** Les capitales si elles sont déjà lues (sans réseau), null sinon. */
export const capitalesChargees = (): DonneesCapitales | null => chargees;

/** Tests : oublie ce qui a été lu (le prochain chargement relit). */
export function oublierCapitales(): void {
  chargees = null;
  enCours = null;
}
