// L'arbre de l'écran « Jouer » (pur ; décision « Écran Jouer », ticket #18) :
// un choix par écran, d'abord la branche (Entraînement ou Classé), puis le
// sujet (Pays, Capitales, Drapeaux, Communes ; plus tard Océans et mers…), la
// série (Tous les pays puis les continents ; La Réunion), et l'exercice en
// dernier. Déclaratif : un sujet de plus est une entrée de SUJETS (ses séries,
// ses exercices par branche), son nom (textes.jouer.sujets) et son rendu
// (src/vues/sujets.ts, textes.sujets), pas du code de vue. Un niveau de choix à une seule option est sauté (Communes mène
// directement à La Réunion), règle générale ; chaque niveau a son adresse
// (#jouer, #jouer/classe, #jouer/classe/pays, #jouer/classe/pays/Africa) :
// le retour du navigateur et celui d'Android remontent l'historique d'un
// niveau à la fois (src/main.ts), un niveau sauté n'y laissant pas d'entrée.
import { MODES_EPREUVE, sujetOuvert, type ModeEpreuve } from '../epreuve/chrono';
import { estDomaine } from '../srs/fiches';
import type { NomTerrain } from '../map/types';
import { nomSerie, type Serie } from './cibles';
import { nomMode } from './scores';
import { compteSerie, estSujetRendu } from './sujets';
import { textes } from './textes';

/**
 * Exercice d'une partie : Apprendre (une séance sur la grappe suivante de la
 * série, J1a), Trouver (localiser), Reconnaître (nommer) ou une épreuve
 * classée. Ids des records et du classement, inchangés.
 */
export type ModeJeu = 'apprendre' | 'localiser' | 'nommer' | ModeEpreuve;

/** Le mode est une épreuve classée (la vue des épreuves, chrono.ts) ; sinon un exercice de Toucher. */
export const estEpreuve = (m: ModeJeu): m is ModeEpreuve => (MODES_EPREUVE as readonly string[]).includes(m);

/** Nom affiché d'un exercice : « Apprendre », « Trouver », « Reconnaître », « Chrono », « Sans faute », « Minute ». */
export const nomExercice = (m: ModeJeu): string => (estEpreuve(m) ? nomMode(m) : textes.toucher[m]);

/** Les deux branches du premier écran (décision « Noms des modes ») : sans points, ou notée au classement. */
export type Branche = 'entrainement' | 'classe';
export const BRANCHES: readonly Branche[] = ['entrainement', 'classe'];

/**
 * Un sujet : une sorte de lieu, ses séries (prises dans le catalogue, dans son
 * ordre) et ses exercices permis par branche. Un sujet sans exercice dans une
 * branche, ou sans série, n'y est pas proposé.
 */
export interface DefSujet {
  id: string;
  series(catalogue: readonly Serie[]): Serie[];
  modes: Readonly<Record<Branche, readonly ModeJeu[]>>;
}

/** Les exercices qui se jouent en touchant la carte : ceux des pays et des communes. */
const SUR_LA_CARTE: DefSujet['modes'] = { entrainement: ['localiser', 'nommer'], classe: MODES_EPREUVE };
/**
 * Pays et communes apprennent en plus (décision « Apprendre et Révision du
 * jour » : Apprendre, exercice de chaque série, sa grappe suivante ; défaut
 * D6 : sous La Réunion, ses 4 grappes de 6 communes, leur propre budget).
 */
const AVEC_APPRENDRE: DefSujet['modes'] = { entrainement: ['apprendre', ...SUR_LA_CARTE.entrainement], classe: MODES_EPREUVE };
const duTerrain = (t: NomTerrain) => (c: readonly Serie[]) => c.filter((s) => s.terrain === t);

/**
 * Les sujets, dans l'ordre affiché (D53 b, décision « Ordre des sujets ») :
 * les sujets du monde ensemble, Communes en dernier. Aucun sujet « à venir »
 * factice : un sujet existe quand il se joue.
 */
export const SUJETS: readonly DefSujet[] = [
  { id: 'pays', series: duTerrain('monde'), modes: AVEC_APPRENDRE },
  // Capitales (étude J2 § 7.2, lot 1) : les séries des pays, tailles comprises (D37 c : les 9 pays au nom de leur
  // capitale restent en Trouver et en épreuve) ; ses épreuves classées ouvertes (creerArbre, sujetOuvert).
  { id: 'capitales', series: duTerrain('monde'), modes: AVEC_APPRENDRE },
  // Drapeaux (étude J2 § 7.2, lot 2) : les séries des pays (195 jouables, « 54 drapeaux » en Afrique) ; ses épreuves
  // classées ouvertes comme celles des capitales (creerArbre, sujetOuvert).
  { id: 'drapeaux', series: duTerrain('monde'), modes: AVEC_APPRENDRE },
  { id: 'communes', series: duTerrain('reunion'), modes: AVEC_APPRENDRE },
];

/** Un écran de Jouer : la racine (Rejouer, les branches), les sujets, les séries ou les exercices d'une série. */
export type Niveau =
  | { type: 'racine' }
  | { type: 'sujets'; branche: Branche }
  | { type: 'series'; branche: Branche; sujet: string }
  | { type: 'exercices'; branche: Branche; sujet: string; serie: string };

/** Une partie lancée depuis Jouer : de quoi la relancer (Rejouer) et la retrouver dans l'arbre. */
export interface Lancement {
  branche: Branche;
  sujet: string;
  serie: string;
  mode: ModeJeu;
}

const RACINE: Niveau = { type: 'racine' };

/** Les segments de l'adresse d'un niveau, après « jouer ». */
export function segments(n: Niveau): string[] {
  if (n.type === 'racine') return [];
  if (n.type === 'sujets') return [n.branche];
  if (n.type === 'series') return [n.branche, n.sujet];
  return [n.branche, n.sujet, n.serie];
}

/** L'adresse d'un niveau (sans « # ») : « jouer/classe/pays/Africa ». */
export const adresse = (n: Niveau): string => ['jouer', ...segments(n)].join('/');

/** L'ancre d'une adresse : chaque segment encodé (« North America » → « North%20America »). */
export const versAncre = (a: string): string => `#${a.split('/').map(encodeURIComponent).join('/')}`;

/** Les segments d'une ancre (« #jouer/classe/pays/North%20America »), décodés ; un segment mal encodé est gardé tel quel. */
export function depuisAncre(ancre: string): string[] {
  return ancre
    .replace(/^#/, '')
    .split('/')
    .map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    });
}

/** Les exercices de la série d'une partie (niveau = 'exercices'), ou ses séries ('series'). */
export function niveauDe(l: Pick<Lancement, 'branche' | 'sujet' | 'serie'>, niveau: 'exercices' | 'series'): Niveau {
  return niveau === 'series' ? { type: 'series', branche: l.branche, sujet: l.sujet } : { type: 'exercices', ...l };
}

export interface Arbre {
  /** Les sujets proposés dans cette branche. */
  sujets(b: Branche): readonly DefSujet[];
  /** Les séries d'un sujet, dans l'ordre du catalogue ([] pour un sujet inconnu). */
  series(sujet: string): readonly Serie[];
  serie(sujet: string, id: string): Serie | undefined;
  /** Les exercices permis pour ce sujet dans cette branche. */
  modes(b: Branche, sujet: string): readonly ModeJeu[];
  /** Les ids des choix d'un niveau (branches, sujets, séries, exercices). */
  choix(n: Niveau): readonly string[];
  /** Niveau de choix (sujets, séries) à une seule option : on passe directement à elle. */
  saute(n: Niveau): boolean;
  /**
   * Le niveau d'une adresse (segments après « jouer ») : le niveau valide le
   * plus profond qu'elle désigne (un segment inconnu arrête la descente), puis
   * au-delà des niveaux sautés.
   */
  resoudre(segs: readonly string[]): Niveau;
  /** Le niveau atteint en faisant ce choix (branche, sujet ou série) au niveau n, sauts compris. */
  enfant(n: Niveau, id: string): Niveau;
  /** Le niveau au-dessus, en remontant au-delà des niveaux sautés ; null à la racine. */
  parent(n: Niveau): Niveau | null;
  /** Les choix faits jusqu'à ce niveau (fil d'Ariane), chacun avec le niveau où il mène ; un niveau sauté y reste. */
  fil(n: Niveau): readonly { id: string; nom: string; niveau: Niveau }[];
  /** La partie se trouve dans l'arbre (branche, sujet, série et exercice existants et permis). */
  valide(l: Lancement): boolean;
}

/** Nom affiché d'une branche ou d'un sujet (textes.jouer). */
export const nomBranche = (b: Branche): string => textes.jouer.branches[b].nom;
export const nomSujet = (id: string): string => (textes.jouer.sujets as Record<string, { nom: string } | undefined>)[id]?.nom ?? id;

/**
 * Nombre d'un sujet affiché sous son nom : celui de sa plus grande série
 * (« 195 pays », « 24 communes »), dit comme le compte d'une série du sujet
 * (sujets.ts) ; '' pour un sujet sans rendu.
 */
export function nombreSujet(id: string, series: readonly Serie[]): string {
  return estSujetRendu(id) ? compteSerie(id, Math.max(0, ...series.map((s) => s.n))) : '';
}

/**
 * L'arbre de ce catalogue de séries (src/vues/cibles.ts, catalogue()) et de
 * ces sujets. Sous Classé, un sujet n'a ses épreuves que si elles sont
 * ouvertes (sujetOuvert, src/epreuve/chrono.ts : le sujet est dans
 * EPREUVES_SUJETS, décision « Ouverture des épreuves d'un sujet », 12/11) :
 * sinon, il n'y est pas. Un sujet qui n'est pas un domaine (essais) n'attend rien.
 */
export function creerArbre(catalogue: readonly Serie[], sujets: readonly DefSujet[] = SUJETS): Arbre {
  const seriesDe = new Map(sujets.map((s) => [s.id, s.series(catalogue)]));
  const modesDe = (s: DefSujet, b: Branche) => (b === 'classe' && estDomaine(s.id) && !sujetOuvert(s.id) ? [] : s.modes[b]);
  const proposes = (b: Branche) => sujets.filter((s) => modesDe(s, b).length > 0 && (seriesDe.get(s.id)?.length ?? 0) > 0);
  const estBranche = (b: string): b is Branche => (BRANCHES as readonly string[]).includes(b);

  const arbre: Arbre = {
    sujets: proposes,
    series: (sujet) => seriesDe.get(sujet) ?? [],
    serie: (sujet, id) => seriesDe.get(sujet)?.find((s) => s.id === id),
    modes: (b, sujet) => {
      const s = proposes(b).find((x) => x.id === sujet);
      return s ? modesDe(s, b) : [];
    },
    choix(n) {
      if (n.type === 'racine') return BRANCHES;
      if (n.type === 'sujets') return proposes(n.branche).map((s) => s.id);
      if (n.type === 'series') return arbre.series(n.sujet).map((s) => s.id);
      return arbre.modes(n.branche, n.sujet);
    },
    // La racine (Rejouer, les deux branches) et les exercices (qui lancent la
    // partie, avec leurs records et leurs règles) ne sont jamais sautés.
    saute: (n) => (n.type === 'sujets' || n.type === 'series') && arbre.choix(n).length === 1,
    resoudre(segs) {
      const [b, s, se] = segs;
      let n: Niveau = RACINE;
      if (b !== undefined && estBranche(b)) {
        n = { type: 'sujets', branche: b };
        if (s !== undefined && arbre.choix(n).includes(s)) {
          n = { type: 'series', branche: b, sujet: s };
          if (se !== undefined && arbre.choix(n).includes(se)) n = { type: 'exercices', branche: b, sujet: s, serie: se };
        }
      }
      return descendre(n);
    },
    enfant(n, id) {
      if (n.type === 'racine') return arbre.resoudre([id]);
      if (n.type === 'sujets') return arbre.resoudre([n.branche, id]);
      if (n.type === 'series') return arbre.resoudre([n.branche, n.sujet, id]);
      return n;
    },
    parent(n) {
      let p = parentBrut(n);
      while (p && arbre.saute(p)) p = parentBrut(p);
      return p;
    },
    fil(n) {
      const f: { id: string; nom: string; niveau: Niveau }[] = [];
      if (n.type === 'racine') return f;
      f.push({ id: n.branche, nom: nomBranche(n.branche), niveau: arbre.resoudre([n.branche]) });
      if (n.type === 'sujets') return f;
      f.push({ id: n.sujet, nom: nomSujet(n.sujet), niveau: arbre.resoudre([n.branche, n.sujet]) });
      if (n.type === 'series') return f;
      f.push({ id: n.serie, nom: nomSerie(n.serie), niveau: n });
      return f;
    },
    valide: (l) => estBranche(l.branche) && !!arbre.serie(l.sujet, l.serie) && arbre.modes(l.branche, l.sujet).includes(l.mode),
  };

  /** Au-delà des niveaux sautés : le seul choix est fait d'office. */
  function descendre(n: Niveau): Niveau {
    while (arbre.saute(n)) {
      const seul = arbre.choix(n)[0] as string;
      if (n.type === 'sujets') n = { type: 'series', branche: n.branche, sujet: seul };
      else if (n.type === 'series') n = { type: 'exercices', branche: n.branche, sujet: n.sujet, serie: seul };
      else break;
    }
    return n;
  }

  function parentBrut(n: Niveau): Niveau | null {
    if (n.type === 'racine') return null;
    if (n.type === 'sujets') return RACINE;
    if (n.type === 'series') return { type: 'sujets', branche: n.branche };
    return { type: 'series', branche: n.branche, sujet: n.sujet };
  }

  return arbre;
}

// --- Rejouer : la dernière partie lancée, gardée sur l'appareil ------------

/** Une commodité de cet appareil (rien ne la relit ailleurs) ; sans stockage, pas de « Rejouer ». */
export const CLE_DERNIERE = 'terramemo.jouer.derniere';

type Stockage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * La dernière partie lancée depuis Jouer, si elle est encore dans l'arbre :
 * une valeur illisible, d'une autre forme, ou dont la série ou l'exercice a
 * disparu est ignorée (pas de « Rejouer »).
 */
export function lireDerniere(stockage: Stockage | null, a: Arbre): Lancement | null {
  try {
    const v = JSON.parse(stockage?.getItem(CLE_DERNIERE) ?? 'null') as Partial<Record<keyof Lancement, unknown>> | null;
    if (!v || typeof v !== 'object') return null;
    const { branche, sujet, serie, mode } = v;
    if (typeof branche !== 'string' || typeof sujet !== 'string' || typeof serie !== 'string' || typeof mode !== 'string') return null;
    const l = { branche, sujet, serie, mode } as Lancement;
    return a.valide(l) ? l : null;
  } catch {
    return null;
  }
}

export function garderDerniere(stockage: Stockage | null, l: Lancement): void {
  try {
    stockage?.setItem(CLE_DERNIERE, JSON.stringify({ branche: l.branche, sujet: l.sujet, serie: l.serie, mode: l.mode }));
  } catch {
    // Stockage refusé : « Rejouer » vaut pour cette visite seulement.
  }
}

// --- Historique ------------------------------------------------------------

/**
 * Combien d'entrées d'historique remonter pour retrouver `cible` dans `pile`
 * (les adresses des entrées d'avant, la plus récente en dernier) ; 0 si elle
 * n'y est pas. « ‹ », « × », « Autre série » et le retour d'une partie
 * remontent ainsi l'historique au lieu d'y empiler une entrée : le retour
 * d'Android ne redescend jamais dans l'arbre.
 */
export function pasVers(pile: readonly string[], cible: string): number {
  const i = pile.lastIndexOf(cible);
  return i < 0 ? 0 : pile.length - i;
}
