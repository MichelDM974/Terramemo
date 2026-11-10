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
// la séance), lues ici. Le Qid ne s'affiche jamais. Viendront à leur lot :
// drapeaux (une image dans la barre et dans chaque bouton) et mers (« mer
// Égée, à 300 km » au bilan).
import type { SorteAdmise } from '../map/acceptes';
import { ADMET_EN_PLUS, capitalesChargees, type Capitale, type DonneesCapitales } from '../map/capitales';
import type { NomTerrain } from '../map/types';
import { nommerPose, SANS_NOMMER, type Sens } from '../srs/fiches';
import { remplir, textes, type Textes } from './textes';

/** Les sujets qui ont leur rendu : ceux qui ont leurs textes (textes.sujets). */
export type SujetRendu = keyof Textes['sujets'];

/**
 * Les textes propres à un sujet (textes.sujets.<sujet>) : chaque sujet a
 * toutes les clés de ceux des pays, sinon le build ne compile pas (TEXTES).
 */
export type TextesSujet = Textes['sujets']['pays'];

/**
 * Ce qu'une question montre d'un lieu : un texte, ou une image (un drapeau)
 * et son texte alternatif, qui ne donne jamais la réponse (« Drapeau à
 * reconnaître »). commun.ts (poserContenu) le met dans la page.
 */
export type Contenu = { texte: string } | { image: string; alt: string };

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
  /** La consigne de Reconnaître et de la carte retournée, la zone allumée (« Quel est ce pays ? »). */
  readonly consigneQcm: string;
  /**
   * Le contenu du bouton de ce lieu dans Reconnaître ; `question` : le lieu
   * demandé, quand ce bouton est un leurre (une capitale leurre montre la
   * principale de son pays, § 2.1).
   */
  choix(id: string, question?: string): Contenu;
  /** Ce même choix dit en texte : la bonne réponse de la rétroaction, « tu as choisi … » au bilan (`question` : comme choix()). */
  nomChoix(id: string, question?: string): string;
  /** Ce que « Révéler » montre sur la carte retournée. */
  revelation(id: string): Contenu;
  /** Le lieu d'une question dans les bilans (ratés, fautes, nouveaux), selon le sens de la question. */
  nomBilan(id: string, sens: Sens): string;
  /** Le nom d'une zone de la carte : celle qu'on a touchée, celle d'une zone admise, celle de l'accueil. */
  lieu(id: string): string;
  /** « tu as touché X » : la zone touchée, ou rien (null : la mer). */
  touche(id: string | null): string;
  /** Après un toucher faux en Trouver : où est la bonne réponse. */
  fauxSuite(id: string): string;
  /** Le temps d'une question d'épreuve écoulé ; `points` : le Chrono, qui le compte « +0 ». */
  expire(id: string, points: boolean): string;
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
  /** Le lieu se pose-t-il en QCM (Reconnaître, QCM d'Apprendre) ? Non pour les 9 de D37 c. */
  qcmPosable(id: string): boolean;
  /** Les lieux jamais leurres pour la question de ce lieu (qcm.choix, option exclus). */
  qcmExclus(id: string): ReadonlySet<string>;
  /**
   * Les zones (entités du terrain) justes en plus pour la question de ce
   * lieu, selon ce qu'elle montre, et leur sorte (OptionsNoter.acceptes) :
   * Jérusalem ↔ Jérusalem-Est sous Capitales (D36 i) ; null sans zone.
   */
  admisEnPlus(id: string): { zones: readonly string[]; sorte: SorteAdmise } | null;
}

/** Les données d'un terrain dont un rendu a besoin : les noms de ses zones ; les capitales (à défaut : celles déjà chargées, src/map/capitales.ts). */
export interface DonneesSujet {
  noms: Readonly<Record<string, string>>;
  capitales?: DonneesCapitales | null;
}

/**
 * En épreuve classée, ce que montre l'énoncé est le même pour tous (D38 d : la
 * capitale la plus connue d'un pays qui en a plusieurs) ; hors épreuve, il
 * peut varier (D38 a). Sans effet pour les pays et les communes.
 */
export interface OptionsRendu {
  epreuve?: boolean;
  /** Hasard du tirage d'une capitale parmi les justes (D38 a ; tests : une graine). */
  hasard?: () => number;
}

/**
 * Nom d'une zone dans les données de son terrain : t.donnees pour une vue qui
 * joue un terrain (sinon une commune s'affiche « 97407 »), l'id brut à défaut.
 * Les vues ne l'appellent pas : elles passent par le rendu de leur sujet.
 */
export function nomDe(d: DonneesSujet, id: string): string {
  return d.noms[id] ?? id;
}

type Fabrique = (ts: TextesSujet, d: DonneesSujet, o: OptionsRendu) => Omit<RenduSujet, 'sujet' | 'textes'>;

/** Les textes de chaque sujet : une clé de moins qu'aux pays ne compile pas. */
const TEXTES: Readonly<Record<SujetRendu, TextesSujet>> = textes.sujets;

/** Rien de propre au sujet : ni rétroaction en plus, ni point, ni exclusion, ni zone admise en plus. */
const SANS_PLUS = {
  retro: () => '',
  point: () => null,
  points: () => [],
  qcmPosable: () => true,
  qcmExclus: () => new Set<string>(),
  admisEnPlus: () => null,
} satisfies Partial<RenduSujet>;

/** Le lieu par son nom, partout : les pays et les communes. */
const parNom: Fabrique = (ts, d) => {
  const nom = (id: string) => nomDe(d, id);
  return {
    enonce: (id) => ({ invite: ts.enonce, objet: { texte: nom(id) } }),
    consigneQcm: ts.consigne_nommer,
    choix: (id) => ({ texte: nom(id) }),
    nomChoix: nom,
    revelation: (id) => ({ texte: nom(id) }),
    nomBilan: (id) => nom(id),
    lieu: nom,
    touche: (id) => (id ? nom(id) : ts.la_mer),
    fauxSuite: () => ts.faux_suite,
    expire: (_id, points) => (points ? ts.expire : ts.expire_sans_points),
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
  const hasard = o.hasard ?? Math.random;
  const pays = (id: string) => nomDe(d, id);
  const de = (id: string) => donnees.parPays.get(id);
  /** D38 a : la capitale tirée pour la question de ce pays, gardée tant que dure ce rendu. */
  const tirees = new Map<string, Capitale>();
  /** La capitale montrée pour la question de ce pays : celle de l'épreuve (D38 d), ou tirée parmi les justes et fixée (D38 a). */
  function montree(id: string): Capitale | null {
    const c = de(id);
    if (!c) return null;
    if (o.epreuve) return c.epreuve;
    let x = tirees.get(id);
    if (!x) tirees.set(id, (x = c.justes[Math.floor(hasard() * c.justes.length)] ?? c.principale));
    return x;
  }
  /** Ce qu'on a montré pour ce pays (sans tirer), à défaut la principale : les bilans d'une séance, faits d'un rendu neuf. */
  const montreeOuPrincipale = (id: string): Capitale | null => (o.epreuve ? (de(id)?.epreuve ?? null) : (tirees.get(id) ?? de(id)?.principale ?? null));
  // À défaut de capitale (un pays sans ligne : jamais un jouable, le test le vérifie), le nom du pays, jamais un Qid.
  const ville = (id: string) => montree(id)?.nom ?? pays(id);
  /** Un leurre montre la principale de son pays (§ 2.1) : jamais une autre capitale juste de la cible. */
  const bouton = (id: string, question?: string) => (question === undefined || question === id ? ville(id) : (de(id)?.principale.nom ?? pays(id)));
  const role = (c: Capitale) => (c.role === 'officielle' ? '' : C.roles[c.role]);
  const avecPays = (c: Capitale, id: string) =>
    role(c) ? remplir(C.avec_role, { ville: c.nom, role: role(c), pays: pays(id) }) : remplir(C.avec_pays, { ville: c.nom, pays: pays(id) });
  return {
    enonce: (id) => ({ invite: ts.enonce, objet: { texte: ville(id) }, deuxLignes: true }),
    consigneQcm: ts.consigne_nommer,
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
    touche: (id) => (id ? pays(id) : ts.la_mer),
    fauxSuite: () => ts.faux_suite,
    expire: (_id, points) => (points ? ts.expire : ts.expire_sans_points),
    retro: (id) => {
      const c = montree(id);
      return c ? avecPays(c, id) : '';
    },
    point: (id) => montree(id)?.point ?? null,
    points: (id) => (de(id)?.justes ?? []).map((c) => c.point),
    qcmPosable: (id) => nommerPose('capitales', id),
    // Les 9 au nom de leur capitale (D37 c) et le pays de x (Israël ↔ Palestine) : jamais leurres.
    qcmExclus: (id) => new Set([...(SANS_NOMMER.capitales ?? []), ...(de(id)?.sansLeurre ?? [])]),
    admisEnPlus: (id) => {
      const c = montree(id);
      const zones = c ? (ADMET_EN_PLUS[c.q] ?? []) : [];
      return zones.length ? { zones, sorte: 'capitale' } : null;
    },
  };
};

/** Le rendu de chaque sujet : un sujet qui a ses textes a son rendu, sinon le build ne compile pas. */
const FABRIQUES: Readonly<Record<SujetRendu, Fabrique>> = { pays: parNom, capitales: parCapitale, communes: parNom };

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
 * au toucher, à l'accueil) : les pays sur le monde, les communes sur l'île.
 */
export const SUJET_CARTE: Readonly<Record<NomTerrain, SujetRendu>> = { monde: 'pays', reunion: 'communes' };
