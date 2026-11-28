// Rendu par sujet (pur : ni DOM ni carte ; étude J2 § 5.1) : ce qu'une
// question montre d'un lieu selon le sujet joué, et les textes propres à ce
// sujet (textes.sujets.<sujet>). La cible reste l'id du lieu (le pays pour
// les capitales et les drapeaux) : toucher, note, barème et zones admises ne
// changent pas ; seul l'affichage change d'un sujet à l'autre. Les vues
// (Trouver, Reconnaître, carte retournée, épreuves, bilans, séance) ne
// nomment jamais un lieu elles-mêmes : elles passent par le rendu du sujet
// lancé (Lancement.sujet, ou le domaine de la fiche en séance), un seul
// endroit par sujet. Un endroit oublié afficherait le nom du pays dans une
// partie de capitales, ou l'id brut (« medit ») d'une mer.
//
// Pays et communes : le nom du lieu partout (nomDe). Capitales (§ 5.2) :
// « Pays dont la capitale est : » puis « La Paz » (deux lignes) ; un pays
// allumé, « Quelle est sa capitale ? », quatre noms de capitales ; « Révéler »
// donne « Sucre · La Paz (siège du gouvernement) » ; la rétroaction nomme le
// pays (« La Paz, siège du gouvernement (Bolivie) ») et un anneau marque la
// ville (D53 c) ; les bilans « Porto-Novo (Bénin) », « Bénin : capitale
// oubliée ». La capitale montrée d'un pays qui en a plusieurs (D38) : tirée au
// hasard parmi les justes hors épreuve, et fixée pour la question (le même
// rendu la redonne : une reprise de la question garde la même) ; en épreuve,
// celle de l'épreuve (e: 1), la même pour tous. Ses données (capitales.json)
// ne sont pas dans t.donnees : chargées avant la partie (commun.ts avecSujet,
// la séance), lues ici. Le Qid ne s'affiche jamais.
//
// Drapeaux (§ 5.3, D41) : « Pays de ce drapeau : » et l'image dans la barre ;
// un pays allumé, « Quel est son drapeau ? », quatre images ; « Révéler »
// montre le drapeau, nommé ; la rétroaction et les bilans nomment le pays
// (« Bénin : drapeau oublié »). Le drapeau montré est le premier juste du
// manifeste (d[0] : le tricolore de l'Afghanistan, le civil de la Bolivie),
// le même pour tous : boutons de Reconnaître, révélation, carte retournée,
// énoncé d'une épreuve. Seul l'énoncé de Trouver hors épreuve (Entraînement,
// séance) tire le sien parmi les justes, fixé pour la question, par le même
// tirage que la capitale (D38 a ; décision « Drapeaux contestés et sosies »).
// Un seul drapeau par pays dans une grille, si bien que ses autres justes ne
// sont jamais côte à côte avec lui. Rien ne nomme le pays
// avant la réponse : alt neutre (« Drapeau à reconnaître ») ou vide (les
// boutons ont leur aria-label « Choix 1 » à « Choix 4 », nommer.ts), fichiers
// nommés par leur empreinte. Les jumeaux (Indonésie et Monaco, Roumanie et
// Tchad, D41 d) : justes en plus en Trouver, jamais leurres l'un de l'autre,
// jamais ensemble parmi 4 choix.
//
// Océans et mers (§ 5.4, lot 3b) : « Touche : mer Égée » ; une zone allumée
// (zonesAllumees : un océan avec la mer qu'il enclave sans côte, jamais ses
// mers côtières), « Quelle est cette mer ? » (« Quel est cet océan ? » pour
// un océan allumé), quatre noms ; « Révéler » donne le nom. Leurres : les
// voisins marins, puis les plus proches, jamais un ancêtre ni un descendant
// (« mer Méditerranée » serait juste aussi pour l'Adriatique allumée), jamais
// la mer d'Arabie et le golfe d'Oman ensemble. Les parties d'une mer
// (zonesParties) sont justes en plus, et la rétroaction le dit : « Juste :
// mer des Caraïbes, dans l'Atlantique ». Ce qu'on a touché est nommé, une
// autre mer (« Faux : mer Noire, à 0 km du bord ») ou un pays, jamais « la
// mer ». Noms : mers.fr.json, jamais l'id (« medit »).
//
// Silhouettes (étude J4 § 6, lot 1 ; D618 à D621) : la cible est le pays ; on
// montre sa forme, dessinée sur place (aucune image à télécharger) : « Pays de
// cette silhouette : » et le dessin ; Reconnaître et la carte retournée
// montrent le dessin dans la barre au lieu d'allumer la zone (question()), qui
// donnerait la réponse ; quatre noms ; « Révéler » donne le nom, puis le pays
// s'allume. Une erreur montre les deux silhouettes nommées (comparaison()).
// Le rendu vient d'un morceau chargé à la demande (silhouettes.ts, avec
// public/geo/silhouettes.json) : chargerSilhouettes, avant la partie
// (chargementSujet de commun.ts, la séance, le quiz).
//
// Voisins (étude J4 § 3, lot 2 ; D605 à D607) : la cible est le pays. Son rendu
// est celui de Reconnaître, la liste écrite de ses voisins (« Pays qui a pour
// voisins : Autriche, Croatie… »), le pays touché ou choisi parmi quatre ; la
// question à plusieurs touchers de Trouver et des épreuves (« Touche les 7
// voisins de : Hongrie ») a la sienne (ModuleVoisins.question). Les deux
// viennent d'un morceau chargé à la demande (voisins.ts) : chargerVoisins de
// commun.ts, avant la partie, comme les silhouettes.
import type { SorteAdmise } from '../map/acceptes';
import { ADMET_EN_PLUS, capitalesChargees, type Capitale, type DonneesCapitales } from '../map/capitales';
import { drapeauxCharges, type DonneesDrapeaux } from '../map/drapeaux';
import { mersChargees, mersPareilles, nomsMersCharges, parenteMer, zonesParties } from '../map/mers';
import type { DonneesCarte } from '../map/donnees';
import type { Entite, Lieu, Mer, NomTerrain } from '../map/types';
import { geoAzimuthalEqualArea, geoCentroid } from 'd3-geo';
import { aSilhouette, nommerPose, SANS_NOMMER, SANS_SILHOUETTE, type Sens } from '../srs/fiches';
import type { ModuleSilhouettes, Outils } from './silhouettes';
import type { ModuleVoisins, Outils as OutilsVoisins } from './voisins';
import { tracer } from './vignettes';
import { formePays } from './formes';
import { leurresParmi, type StrategieLeurres } from './qcm';
import { remplir, textes, type Textes } from './textes';

/** Les sujets qui ont leur rendu : ceux qui ont leurs textes (textes.sujets). */
export type SujetRendu = keyof Textes['sujets'];

/**
 * Les textes propres à un sujet (textes.sujets.<sujet>) : chaque sujet a
 * toutes les clés de ceux des pays, sinon le build ne compile pas (TEXTES).
 */
export type TextesSujet = Textes['sujets']['pays'];

/**
 * Un dessin vectoriel (une silhouette) : son cadre (viewBox), son tracé, et
 * celui des zones contestées qu'il porte, hachurées comme sur la carte.
 */
export interface Dessin {
  cadre: string;
  trace: string;
  hachures: string;
}

/**
 * Ce qu'une question montre d'un lieu : un texte, une image (un drapeau) ou
 * un dessin (une silhouette), avec un texte alternatif qui ne donne jamais la
 * réponse avant elle (« Drapeau à reconnaître », ou vide dans un bouton nommé
 * « Choix 1 ») ; `legende` : un texte montré sous l'image ou le dessin (la
 * révélation nomme le pays). commun.ts (poserContenu) le met dans la page.
 */
export type Contenu = { texte: string } | { image: string; alt: string; legende?: string } | { dessin: Dessin; alt: string; legende?: string };

/**
 * L'énoncé de Trouver et des épreuves : l'invite (« Touche : ») puis l'objet,
 * en gras (« Monaco ») ; sur deux lignes si `deuxLignes` (« Pays dont la
 * capitale est : », puis « La Paz »).
 */
export interface Enonce {
  invite: string;
  objet: Contenu;
  deuxLignes?: boolean;
}

/** Ce que montrent d'un lieu les questions, rétroactions et bilans d'un sujet, sur les données d'un terrain. */
export interface RenduSujet {
  readonly sujet: string;
  readonly textes: TextesSujet;
  /** L'énoncé de Trouver et des épreuves : ce que montre la barre (« Touche : Monaco »). */
  enonce(id: string): Enonce;
  /** La consigne de Reconnaître et de la carte retournée, la zone `id` allumée (« Quel est ce pays ? », « Quel est cet océan ? »). */
  consigneQcm(id: string): string;
  /**
   * Le contenu du bouton de ce lieu dans Reconnaître ; `question` : le lieu
   * demandé, quand ce bouton est un leurre (une capitale leurre montre la
   * principale de son pays, § 2.1).
   */
  choix(id: string, question?: string): Contenu;
  /** Ce même choix dit en texte : la bonne réponse de la rétroaction, « tu avais choisi : … » au bilan (`question` : comme choix()). */
  nomChoix(id: string, question?: string): string;
  /**
   * Les choix sont des images (les drapeaux) : boutons nommés « Choix 1 » à
   * « Choix 4 », touches 1 à 4, et une rétroaction qui dit aussi le choix
   * fait (lue par la région aria-live, qui ne voit pas les images).
   */
  readonly visuel: boolean;
  /** Ce que « Révéler » montre sur la carte retournée. */
  revelation(id: string): Contenu;
  /** Le lieu d'une question dans les bilans (ratés, fautes, nouveaux), selon le sens de la question. */
  nomBilan(id: string, sens: Sens): string;
  /** Le nom d'une zone de la carte : celle qu'on a touchée, celle d'une zone admise, celle de l'accueil. */
  lieu(id: string): string;
  /**
   * Ce même nom dans une phrase, avec son article pour un pays (décision
   * « Articles des noms de pays » : « tenue par la Russie », « même drapeau
   * que l'Indonésie ») ; tel quel pour une commune ou une mer.
   */
  lieuArticle(id: string): string;
  /**
   * La consigne du QCM du quiz facile, qui nomme le pays (D49 d : « Quelle est
   * la capitale du Japon ? », « Quel est le drapeau du Brésil ? ») ; null pour
   * un sujet dont le nom serait la réponse (les pays, les mers, les communes).
   */
  consigneNommee(id: string): string | null;
  /** « tu as touché X » : la zone touchée, ou rien (null : la mer). */
  touche(id: string | null): string;
  /** Après un toucher faux en Trouver : la bonne réponse, nommée et en vert. */
  fauxSuite(id: string): string;
  /** Le temps d'une question d'épreuve écoulé (une erreur, sans points : décision « Barème et classements ») ; nomme la bonne réponse. */
  expire(id: string): string;
  /**
   * La rétroaction d'une réponse juste dit le lieu de la question, quand
   * l'énoncé ne le nommait pas (« La Paz, siège du gouvernement (Bolivie) ») ;
   * '' pour les pays et les communes (l'énoncé l'a nommé).
   */
  retro(id: string): string;
  /** Le point [lon, lat] marqué d'un anneau à la rétroaction (la ville montrée, D53 c) ; null sans point. */
  point(id: string): [number, number] | null;
  /** Les points de tout ce que « Révéler » montre (les capitales justes) ; [] sans point. */
  points(id: string): [number, number][];
  /**
   * L'adresse de l'image que montrera l'énoncé de ce lieu (enonce), tirée et
   * fixée comme lui : ce qu'il faut précharger ou attendre (commun.ts
   * prechargerEnonces, attendreEnonces) ; null sans image.
   */
  imageEnonce(id: string): string | null;
  /** Le lieu se pose-t-il en QCM (Reconnaître, QCM d'Apprendre) ? Non pour les 9 de D37 c. */
  qcmPosable(id: string): boolean;
  /**
   * Ce que la question de Reconnaître, du QCM et de la carte retournée montre
   * dans la barre, à la place de la zone allumée, qui donnerait la réponse (la
   * silhouette) ; null : la zone s'allume (les autres sujets). Le lieu
   * s'allume alors après la réponse, ou à « Révéler ».
   */
  question(id: string): Contenu | null;
  /**
   * Une erreur (`choisi`, la zone choisie ou touchée, au lieu de `id`) : ce
   * que la rétroaction montre côte à côte, nommé (D621 : « Tu as choisi : le
   * Laos », « C'était : le Cambodge ») ; null sans rien à montrer.
   */
  comparaison(choisi: string, id: string): readonly [Contenu, Contenu] | null;
  /** Les lieux jamais leurres pour la question de ce lieu (qcm.choix, option exclus). */
  qcmExclus(id: string): ReadonlySet<string>;
  /** Deux lieux qui montrent la même chose, jamais ensemble parmi les choix (les jumeaux d'un drapeau ; qcm.choix, option pareils). */
  qcmPareils(a: string, b: string): boolean;
  /**
   * Les leurres de la question de ce lieu (qcm.choix, option strategie) ;
   * undefined : ceux de l'Entraînement (ses voisins, puis les plus proches).
   * Un océan allumé : les autres océans (« Quel est cet océan ? » n'offre que
   * des océans).
   */
  qcmLeurres(id: string): StrategieLeurres | undefined;
  /**
   * Les zones (entités du terrain) justes en plus pour la question de ce
   * lieu, selon ce qu'elle montre, et leur sorte (OptionsNoter.acceptes) :
   * Jérusalem ↔ Jérusalem-Est sous Capitales (D36 i), les jumeaux sous
   * Drapeaux (D41 d : Monaco pour l'Indonésie), les parties d'une mer sous
   * Mers (D43 : la mer des Caraïbes pour l'Atlantique) ; null sans zone.
   */
  admisEnPlus(id: string): { zones: readonly string[]; sorte: SorteAdmise } | null;
}

/**
 * Les données d'un terrain dont un rendu a besoin : les noms de ses zones ;
 * les capitales et les drapeaux (à défaut : ceux déjà chargés,
 * src/map/capitales.ts, src/map/drapeaux.ts).
 */
export interface DonneesSujet {
  noms: Readonly<Record<string, string>>;
  capitales?: DonneesCapitales | null;
  drapeaux?: DonneesDrapeaux | null;
  /** Les zones marines posées sur la carte du terrain (DonneesCarte.mers) ; à défaut, celles de la couche lue (mersChargees). */
  mers?: readonly Entite<Mer>[];
  /** Les noms des mers (mers.fr.json) ; à défaut, ceux déjà lus (nomsMersCharges). */
  nomsMers?: Readonly<Record<string, string>> | null;
  /** Les formes du terrain (DonneesCarte.entites) : ce que dessinent les silhouettes. */
  entites?: readonly Entite<Lieu>[];
  /** Les zones contestées du terrain (DonneesCarte.contestees) : hachurées sur une silhouette. */
  contestees?: DonneesCarte['contestees'];
}

/**
 * En épreuve classée, ce que montre l'énoncé est le même pour tous (D38 d : la
 * capitale la plus connue d'un pays qui en a plusieurs ; le premier drapeau)
 * ; hors épreuve, il peut varier (D38 a). Sans effet pour les pays et les
 * communes.
 */
export interface OptionsRendu {
  epreuve?: boolean;
  /** Hasard du tirage d'une capitale ou d'un drapeau parmi les justes (D38 a ; tests : une graine). */
  hasard?: () => number;
  /**
   * La capitale montrée pour ce pays (son Qid), quand la partie l'a déjà
   * choisie : le quiz général (étude J2 § 9.2 : Question.indice, la plus
   * connue en moyen, une juste au hasard au-delà ; la principale au bouton
   * juste d'un QCM). undefined, ou une capitale qui n'est pas juste pour ce
   * pays : la règle d'`epreuve` ou de D38 a.
   */
  capitale?: (id: string) => string | undefined;
}

/**
 * D38 a : ce que l'énoncé montre d'un lieu hors épreuve, tiré au hasard parmi
 * ses justes (une capitale, un drapeau) à la première demande, puis gardé tant
 * que dure le rendu : une reprise de la question, son préchargement et sa
 * rétroaction redonnent le même.
 */
function tirage<T>(hasard: () => number) {
  const tires = new Map<string, T>();
  return {
    /** Le tiré de ce lieu (tiré maintenant s'il ne l'est pas) ; undefined sans juste. */
    tirer(id: string, justes: readonly T[]): T | undefined {
      if (!tires.has(id) && justes.length) tires.set(id, justes[Math.floor(hasard() * justes.length)]!);
      return tires.get(id);
    },
    /** Le tiré de ce lieu s'il l'a été, sans tirer. */
    deja: (id: string): T | undefined => tires.get(id),
  };
}

/**
 * Nom d'une zone dans les données de son terrain : t.donnees pour une vue qui
 * joue un terrain (sinon une commune s'affiche « 97407 »), l'id brut à défaut.
 * Les vues ne l'appellent pas : elles passent par le rendu de leur sujet.
 */
export function nomDe(d: DonneesSujet, id: string): string {
  return d.noms[id] ?? id;
}

/** Le rendu d'un sujet, sur ses textes, les données de son terrain et ses options. */
export type Fabrique = (ts: TextesSujet, d: DonneesSujet, o: OptionsRendu) => Omit<RenduSujet, 'sujet' | 'textes'>;

/** Les textes de chaque sujet : une clé de moins qu'aux pays ne compile pas. */
const TEXTES: Readonly<Record<SujetRendu, TextesSujet>> = textes.sujets;

/** Rien de propre au sujet : choix en texte, ni rétroaction en plus, ni point, ni exclusion, ni zone admise en plus. */
const SANS_PLUS = {
  visuel: false,
  consigneNommee: () => null,
  retro: () => '',
  point: () => null,
  points: () => [],
  imageEnonce: () => null,
  question: () => null,
  comparaison: () => null,
  qcmPosable: () => true,
  qcmExclus: () => new Set<string>(),
  qcmPareils: () => false,
  qcmLeurres: () => undefined,
  admisEnPlus: () => null,
} satisfies Partial<RenduSujet>;

/** Le nom d'un pays dans une phrase (formes_pays), à défaut le nom affiché : une commune, une zone qui n'est pas un pays. */
const avecArticle = (id: string, nom: string): string => formePays(id, 'le') ?? nom;

/** Le lieu par son nom, partout : les pays et les communes. */
const parNom: Fabrique = (ts, d) => {
  const nom = (id: string) => nomDe(d, id);
  return {
    lieuArticle: (id) => avecArticle(id, nom(id)),
    enonce: (id) => ({ invite: ts.enonce, objet: { texte: nom(id) } }),
    consigneQcm: () => ts.consigne_nommer,
    choix: (id) => ({ texte: nom(id) }),
    nomChoix: nom,
    revelation: (id) => ({ texte: nom(id) }),
    nomBilan: (id) => nom(id),
    lieu: nom,
    touche: (id) => (id ? nom(id) : ts.la_mer),
    fauxSuite: (id) => remplir(ts.faux_suite, { cible: nom(id) }),
    expire: (id) => remplir(ts.expire, { cible: nom(id) }),
    ...SANS_PLUS,
  };
};

const C = textes.capitales;

/**
 * Les capitales (étude J2 § 5.2) : la cible est le pays ; on montre sa
 * capitale. Lève si les capitales ne sont pas chargées (une partie de
 * capitales ne part qu'après elles : commun.ts avecSujet, la séance).
 */
const parCapitale: Fabrique = (ts, d, o) => {
  const donnees = d.capitales ?? capitalesChargees();
  if (!donnees) throw new Error('capitales : données pas chargées');
  const pays = (id: string) => nomDe(d, id);
  const de = (id: string) => donnees.parPays.get(id);
  /** D38 a : la capitale tirée pour la question de ce pays, gardée tant que dure ce rendu. */
  const tirees = tirage<Capitale>(o.hasard ?? Math.random);
  /** La capitale montrée pour la question de ce pays : celle de l'épreuve (D38 d), ou tirée parmi les justes et fixée (D38 a). */
  function montree(id: string): Capitale | null {
    const c = de(id);
    if (!c) return null;
    const imposee = o.capitale?.(id);
    const choisie = imposee === undefined ? undefined : c.justes.find((x) => x.q === imposee);
    if (choisie) return choisie;
    if (o.epreuve) return c.epreuve;
    return tirees.tirer(id, c.justes) ?? c.principale;
  }
  /** Ce qu'on a montré pour ce pays (sans tirer), à défaut la principale : les bilans d'une séance, faits d'un rendu neuf. */
  const montreeOuPrincipale = (id: string): Capitale | null =>
    o.capitale?.(id) !== undefined || o.epreuve ? montree(id) : (tirees.deja(id) ?? de(id)?.principale ?? null);
  // À défaut de capitale (un pays sans ligne : jamais un jouable, le test le vérifie), le nom du pays, jamais un Qid.
  const ville = (id: string) => montree(id)?.nom ?? pays(id);
  /** Un leurre montre la principale de son pays (§ 2.1) : jamais une autre capitale juste de la cible. */
  const bouton = (id: string, question?: string) => (question === undefined || question === id ? ville(id) : (de(id)?.principale.nom ?? pays(id)));
  const role = (c: Capitale) => (c.role === 'officielle' ? '' : C.roles[c.role]);
  const avecPays = (c: Capitale, id: string) =>
    role(c) ? remplir(C.avec_role, { ville: c.nom, role: role(c), pays: pays(id) }) : remplir(C.avec_pays, { ville: c.nom, pays: pays(id) });
  return {
    enonce: (id) => ({ invite: ts.enonce, objet: { texte: ville(id) }, deuxLignes: true }),
    consigneQcm: () => ts.consigne_nommer,
    choix: (id, question) => ({ texte: bouton(id, question) }),
    nomChoix: bouton,
    revelation: (id) => ({
      texte: (de(id)?.justes ?? []).map((c) => (role(c) ? remplir(C.revele_role, { ville: c.nom, role: role(c) }) : c.nom)).join(' · ') || pays(id),
    }),
    // « Porto-Novo (Bénin) » ; une capitale oubliée (sens nommer) : « Bénin », le pays allumé.
    nomBilan: (id, sens) => {
      const c = montreeOuPrincipale(id);
      return sens === 'nommer' || !c ? pays(id) : remplir(C.avec_pays, { ville: c.nom, pays: pays(id) });
    },
    lieu: pays,
    lieuArticle: (id) => avecArticle(id, pays(id)),
    consigneNommee: (id) => remplir(textes.quiz.consigne_capitale, { pays: formePays(id, 'de') ?? pays(id) }),
    touche: (id) => (id ? pays(id) : ts.la_mer),
    fauxSuite: (id) => remplir(ts.faux_suite, { cible: pays(id) }),
    expire: (id) => remplir(ts.expire, { cible: pays(id) }),
    retro: (id) => {
      const c = montree(id);
      return c ? avecPays(c, id) : '';
    },
    point: (id) => montree(id)?.point ?? null,
    points: (id) => (de(id)?.justes ?? []).map((c) => c.point),
    imageEnonce: () => null,
    question: () => null,
    comparaison: () => null,
    visuel: false,
    qcmPosable: (id) => nommerPose('capitales', id),
    // Les 9 au nom de leur capitale (D37 c) et le pays de x (Israël ↔ Palestine) : jamais leurres.
    qcmExclus: (id) => new Set([...(SANS_NOMMER.capitales ?? []), ...(de(id)?.sansLeurre ?? [])]),
    qcmPareils: () => false,
    qcmLeurres: () => undefined,
    admisEnPlus: (id) => {
      const c = montree(id);
      const zones = c ? (ADMET_EN_PLUS[c.q] ?? []) : [];
      return zones.length ? { zones, sorte: 'capitale' } : null;
    },
  };
};

const D = textes.drapeaux;

/**
 * Les drapeaux (étude J2 § 5.3) : la cible est le pays ; on montre son
 * drapeau (le premier, d[0], sauf l'énoncé de Trouver hors épreuve : tiré
 * parmi les justes et fixé, D38 a). Lève si le manifeste n'est pas chargé (une
 * partie de drapeaux ne part qu'après lui : commun.ts avecSujet, la séance).
 * Les images, elles, arrivent à l'affichage : un gris 4:3 de taille fixe
 * tient leur place (carte.css), la barre ne change pas de hauteur.
 */
const parDrapeau: Fabrique = (ts, d, o) => {
  const donnees = d.drapeaux ?? drapeauxCharges();
  if (!donnees) throw new Error('drapeaux : manifeste pas chargé');
  const pays = (id: string) => nomDe(d, id);
  const de = (id: string) => donnees.parPays.get(id);
  /** D38 a : le drapeau tiré pour l'énoncé de ce pays (l'Afghanistan, la Bolivie : l'un de leurs deux), gardé tant que dure ce rendu. */
  const tires = tirage<string>(o.hasard ?? Math.random);
  /** Le drapeau de l'énoncé : le premier en épreuve (le même pour tous), tiré parmi les justes et fixé sinon. */
  const aEnonce = (id: string): string | null => {
    const x = de(id);
    if (!x) return null;
    return o.epreuve ? x.montre : (tires.tirer(id, x.justes) ?? x.montre);
  };
  // À défaut de drapeau (un pays hors du manifeste : jamais un jouable, le test des données le vérifie), le nom du pays.
  const image = (id: string, alt: string, legende?: string, a = de(id)?.montre ?? null): Contenu => {
    if (!a) return { texte: pays(id) };
    return legende === undefined ? { image: a, alt } : { image: a, alt, legende };
  };
  const jumeaux = (id: string) => de(id)?.jumeaux ?? [];
  return {
    enonce: (id) => ({ invite: ts.enonce, objet: image(id, D.alt_enonce, undefined, aEnonce(id)) }),
    imageEnonce: aEnonce,
    consigneQcm: () => ts.consigne_nommer,
    // Un alt vide : le bouton a son nom, « Choix 1 » (nommer.ts) ; rien d'autre ne doit le nommer avant la réponse.
    choix: (id) => image(id, ''),
    nomChoix: pays,
    visuel: true,
    // Le drapeau, et le nom du pays dessous (la zone allumée ne le disait pas) ; l'alt vide : la légende le lit déjà.
    revelation: (id) => image(id, '', pays(id)),
    // « Bénin » : « Bénin : drapeau oublié », « Bénin : vu ou passé » (textes.sujets.drapeaux).
    nomBilan: (id) => pays(id),
    lieu: pays,
    lieuArticle: (id) => avecArticle(id, pays(id)),
    consigneNommee: (id) => remplir(textes.quiz.consigne_drapeau, { pays: formePays(id, 'de') ?? pays(id) }),
    touche: (id) => (id ? pays(id) : ts.la_mer),
    fauxSuite: (id) => remplir(ts.faux_suite, { cible: pays(id) }),
    expire: (id) => remplir(ts.expire, { cible: pays(id) }),
    // L'énoncé ne nommait pas le pays : la rétroaction le dit (« Juste : Bénin »).
    retro: pays,
    point: () => null,
    points: () => [],
    question: () => null,
    comparaison: () => null,
    qcmPosable: (id) => !!de(id),
    qcmExclus: (id) => new Set(jumeaux(id)),
    qcmPareils: (a, b) => jumeaux(a).includes(b),
    qcmLeurres: () => undefined,
    admisEnPlus: (id) => (jumeaux(id).length ? { zones: jumeaux(id), sorte: 'jumeau' } : null),
  };
};

const TM = textes.mers;
/** Ses textes propres (la consigne d'un océan allumé), en plus de ceux de tout sujet. */
const TS_MERS = textes.sujets.mers;

/**
 * « dans l'Atlantique », « dans la mer Noire » : la zone `id` (nommée `nom`)
 * qui contient une partie touchée (Note.admis, sorte partie). Écrit à la main
 * pour les zones qui ont des parties (textes.mers.dans) ; à défaut, l'article
 * du générique (« océan » : l', « golfe », « canal » : le, sinon la).
 */
export function dansZone(id: string, nom: string): string {
  const ecrit = (TM.dans as Readonly<Record<string, string>>)[id];
  if (ecrit) return ecrit;
  const premier = nom.split(' ')[0]?.toLowerCase() ?? '';
  const article = /^[aeiouyéèêâîôûh]/.test(premier) ? 'l' : premier === 'golfe' || premier === 'canal' ? 'le' : 'la';
  return remplir(TM.dans_defaut[article], { nom });
}

/**
 * Océans et mers (étude J2 § 5.4) : la cible est la zone marine, nommée par
 * mers.fr.json. Lève si la couche n'est pas lue (une partie de mers ne part
 * qu'après elle : commun.ts avecSujet, la séance). Ce qu'on a touché est
 * nommé, une mer comme un pays (les noms des pays : d.noms, ceux du monde).
 */
const parMer: Fabrique = (ts, d) => {
  const noms = d.nomsMers ?? nomsMersCharges();
  const zones = (d.mers?.length ? d.mers : (mersChargees()?.mers ?? [])).map((e) => e.pays);
  if (!noms || !zones.length) throw new Error('mers : couche pas chargée');
  const parId = new Map(zones.map((m) => [m.id, m]));
  const oceans = zones.filter((m) => m.sorte === 'océan').map((m) => m.id);
  // Une mer par mers.fr.json, un pays (touché) par les noms du monde ; l'id brut jamais, sauf une zone inconnue des deux.
  const nom = (id: string) => noms[id] ?? nomDe(d, id);
  return {
    enonce: (id) => ({ invite: ts.enonce, objet: { texte: nom(id) } }),
    consigneQcm: (id) => (parId.get(id)?.sorte === 'océan' ? TS_MERS.consigne_ocean : ts.consigne_nommer),
    choix: (id) => ({ texte: nom(id) }),
    nomChoix: nom,
    revelation: (id) => ({ texte: nom(id) }),
    nomBilan: (id) => nom(id),
    lieu: nom,
    // Une mer telle quelle (« mer Noire ») ; un pays touché avec son article.
    lieuArticle: (id) => (noms[id] !== undefined ? noms[id] : avecArticle(id, nom(id))),
    // Une autre mer, ou le pays touché ; null : rien sous le doigt (hors de la carte), jamais « la mer ».
    touche: (id) => (id ? nom(id) : ts.la_mer),
    fauxSuite: (id) => remplir(ts.faux_suite, { cible: nom(id) }),
    expire: (id) => remplir(ts.expire, { cible: nom(id) }),
    ...SANS_PLUS,
    qcmExclus: (id) => parenteMer(id, zones),
    qcmPareils: mersPareilles,
    // « Quel est cet océan ? » : les quatre autres océans, jamais une mer (sinon deux choix faux d'office).
    qcmLeurres: (id) => (parId.get(id)?.sorte === 'océan' ? [leurresParmi(() => oceans.filter((o) => o !== id))] : undefined),
    admisEnPlus: (id) => {
      const parties = zonesParties(id, zones);
      return parties.length ? { zones: parties, sorte: 'partie' } : null;
    },
  };
};
/** Le morceau des silhouettes, une fois chargé (chargerSilhouettes) : leur rendu et leurs données. */
let silhouettes: ModuleSilhouettes | null = null;
let silhouettesEnCours: Promise<ModuleSilhouettes> | null = null;

/** Le morceau des silhouettes s'il est chargé (sans réseau), null sinon. */
export const silhouettesChargees = (): ModuleSilhouettes | null => silhouettes;

/**
 * Le morceau des silhouettes (silhouettes.ts) et leurs données
 * (public/geo/silhouettes.json : parties lointaines retirées, formes
 * proches), chargés une fois ; un échec (hors ligne) ne reste pas en cache.
 * `monde` : ses dessins se calculent ensuite d'avance, en temps libre.
 */
export function chargerSilhouettes(monde?: Pick<DonneesCarte, 'entites' | 'contestees'>, base = '/geo/'): Promise<ModuleSilhouettes> {
  if (silhouettes) return Promise.resolve(silhouettes);
  if (!silhouettesEnCours) {
    const p = Promise.all([
      import('./silhouettes'),
      fetch(`${base}silhouettes.json`).then((r) => (r.ok ? (r.json() as Promise<unknown>) : Promise.reject(new Error(`silhouettes.json : HTTP ${r.status}`)))),
    ]).then(([m, brut]) => {
      silhouettes = m.installer(brut, outilsSilhouettes());
      // Les dessins du monde, calculés d'avance en temps libre (gardés) : la première question n'attend pas le sien.
      if (monde) silhouettes.prechauffer(monde.entites, monde.contestees);
      return silhouettes;
    });
    silhouettesEnCours = p;
    p.then(
      () => (silhouettesEnCours = null),
      () => (silhouettesEnCours = null),
    );
  }
  return silhouettesEnCours;
}

/** Ce que le morceau des silhouettes emploie du morceau principal, donné à l'installation (silhouettes.ts, Outils). */
export const outilsSilhouettes = (): Outils => ({
  geoAzimuthalEqualArea,
  geoCentroid,
  tracer,
  nomDe,
  formePays,
  remplir,
  textes: textes.silhouettes,
  aSilhouette,
  sansSilhouette: SANS_SILHOUETTE,
});

/** Tests : le module des silhouettes posé tel quel (null : oublié). */
export function poserSilhouettes(m: ModuleSilhouettes | null): void {
  silhouettes = m;
}

/** Les silhouettes : leur rendu vient de leur morceau ; lève s'il n'est pas chargé (une partie de silhouettes ne part qu'après lui). */
const parSilhouette: Fabrique = (ts, d, o) => {
  if (!silhouettes) throw new Error('silhouettes : morceau pas chargé');
  return silhouettes.fabrique(ts, d, o);
};

/** Le morceau des voisins (voisins.ts), une fois chargé (chargerVoisins). */
let voisins: ModuleVoisins | null = null;

/** Le morceau des voisins s'il est chargé (sans réseau), null sinon. */
export const voisinsCharges = (): ModuleVoisins | null => voisins;

/**
 * Le morceau des voisins arrivé (chargerVoisins de commun.ts) : installé avec les noms et les textes d'ici, et ce que
 * `o` donne de commun.ts ; il rend dès lors. Les tests : `m` déjà installé, ou null pour l'oublier.
 */
export function poserVoisins(m: typeof import('./voisins') | ModuleVoisins | null, o?: Omit<OutilsVoisins, 'nomDe' | 'formePays' | 'remplir'>): void {
  voisins = m && 'installer' in m ? m.installer({ nomDe, formePays, remplir, ...o! }) : (m as ModuleVoisins | null);
}

/** Les voisins : leur rendu vient de leur morceau ; lève s'il n'est pas chargé (une partie de voisins ne part qu'après lui). */
const parVoisins: Fabrique = (ts, d, o) => {
  if (!voisins) throw new Error('voisins : morceau pas chargé');
  return voisins.fabrique(ts, d, o);
};

/** Le rendu de chaque sujet : un sujet qui a ses textes a son rendu, sinon le build ne compile pas. */
const FABRIQUES: Readonly<Record<SujetRendu, Fabrique>> = {
  pays: parNom,
  capitales: parCapitale,
  drapeaux: parDrapeau,
  silhouettes: parSilhouette,
  voisins: parVoisins,
  mers: parMer,
  communes: parNom,
};

/** Le sujet a-t-il son rendu (ses textes) ? */
export const estSujetRendu = (s: string): s is SujetRendu => Object.keys(FABRIQUES).includes(s);

function verifier(sujet: string): SujetRendu {
  // Un sujet sans rendu est une erreur du code (Jouer ne propose que SUJETS, la
  // séance que les domaines jouables) : le dire, plutôt qu'afficher un pays à sa place.
  if (!estSujetRendu(sujet)) throw new Error(`sujet sans rendu : « ${sujet} »`);
  return sujet;
}

/** Les textes d'un sujet ; lève pour un sujet sans rendu. */
export const textesSujet = (sujet: string): TextesSujet => TEXTES[verifier(sujet)];

/** Le compte d'une série du sujet, ou du sujet entier : « 54 pays », « 24 communes ». */
export const compteSerie = (sujet: string, n: number): string => remplir(textesSujet(sujet).n, { n });

/** Le rendu d'un sujet sur les données de son terrain (t.donnees) ; lève pour un sujet sans rendu. */
export function rendu(sujet: string, d: DonneesSujet, o: OptionsRendu = {}): RenduSujet {
  const s = verifier(sujet);
  return { sujet: s, textes: TEXTES[s], ...FABRIQUES[s](TEXTES[s], d, o) };
}

/**
 * Le sujet qui nomme les zones de la carte d'un terrain, hors partie (le nom
 * au toucher, à l'accueil) : les pays sur le monde, les communes sur l'île ;
 * aucun encore pour les terrains du J6 (leur sujet vient avec leurs données).
 */
export const SUJET_CARTE: Readonly<Record<'monde' | 'reunion', SujetRendu> & Partial<Record<NomTerrain, SujetRendu>>> = { monde: 'pays', reunion: 'communes' };
