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
// Pays et communes : le nom du lieu partout (nomDe). Les sujets suivants
// s'ajoutent ici sans toucher aux vues : capitales (énoncé sur deux lignes,
// « Pays dont la capitale est : » puis « La Paz » ; révélation « Sucre · La
// Paz (siège du gouvernement) »), drapeaux (une image dans la barre et dans
// chaque bouton) et mers (« mer Égée, à 300 km » au bilan).
import type { NomTerrain } from '../map/types';
import type { Sens } from '../srs/fiches';
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
  /** Le contenu du bouton de ce lieu dans Reconnaître. */
  choix(id: string): Contenu;
  /** Ce même choix dit en texte : la bonne réponse de la rétroaction, « tu as choisi … » au bilan. */
  nomChoix(id: string): string;
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
}

/** Les données d'un terrain dont un rendu a besoin : les noms de ses zones. */
export interface DonneesSujet {
  noms: Readonly<Record<string, string>>;
}

/**
 * En épreuve classée, ce que montre l'énoncé est le même pour tous (D38 d : la
 * capitale la plus connue d'un pays qui en a plusieurs) ; hors épreuve, il
 * peut varier (D38 a). Sans effet pour les pays et les communes.
 */
export interface OptionsRendu {
  epreuve?: boolean;
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
  };
};

/** Le rendu de chaque sujet : un sujet qui a ses textes a son rendu, sinon le build ne compile pas. */
const FABRIQUES: Readonly<Record<SujetRendu, Fabrique>> = { pays: parNom, communes: parNom };

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
