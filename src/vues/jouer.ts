// Vue « Jouer » (décision « Écran Jouer », ticket #18) : l'arbre de src/vues/arbre.ts
// en gros boutons neutres, un choix par écran (le bleu reste au bouton Jouer de
// l'en-tête), dans le panneau du bas, sous le pouce. En tête : « Rejouer »
// (la dernière partie, d'une touche), puis Entraînement ou Classé ; ensuite le
// sujet, la série, et l'exercice en dernier, chacun avec son record dans la
// série choisie et, pour les épreuves, leurs règles derrière « ? ». Toucher
// un exercice lance la partie (main.ts : Toucher ou la vue des épreuves) ; la
// carte de l'île se charge ici d'abord (avecTerrain : statut, échec hors
// ligne). « ‹ » et le fil d'Ariane remontent, « × » ferme (main.ts) ; chaque
// niveau a son adresse, que main.ts donne à aller().
import { idEpreuve, lireRecords, type RecordChrono } from '../epreuve/chrono';
import type { Terrain } from '../terrains';
import {
  adresse,
  BRANCHES,
  estEpreuve,
  lireDerniere,
  nomBranche,
  nomExercice,
  nombreSujet,
  nomSujet,
  segments,
  versAncre,
  type Arbre,
  type Lancement,
  type ModeJeu,
  type Niveau,
} from './arbre';
import { nomSerie, SERIE_TOUS, type Serie } from './cibles';
import { avecTerrain, creer, type ContexteVue, type Vue } from './commun';
import { scoreCourt, secondesMode } from './scores';
import { texteComptes, type ComptesSeance } from './seance';
import { remplir, textes } from './textes';

const J = textes.jouer;
const S = textes.seance;
const E = textes.epreuves;

function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Phrase courte sous le nom d'un exercice : « 15 s par question, un seul toucher » ; Apprendre dit pays ou communes selon le sujet. */
export const detailExercice = (m: ModeJeu, sujet = 'pays'): string =>
  remplir(m === 'apprendre' && sujet === 'communes' ? J.exercices.apprendre_communes : J.exercices[m], { s: estEpreuve(m) ? secondesMode(m) : 0 });

/** Règles complètes d'une épreuve (barème, départage), derrière « ? » ; '' pour un exercice d'entraînement. */
export const regleExercice = (m: ModeJeu): string => (estEpreuve(m) ? remplir(E[m].aide, { s: secondesMode(m) }) : '');

/** Le record de cet exercice dans cette série (« 12 450 pts », « 17 d'affilée ») ; '' s'il n'y en a pas (ou en entraînement). */
export function recordDe(records: ReadonlyMap<string, RecordChrono>, m: ModeJeu, serie: string): string {
  if (!estEpreuve(m)) return '';
  const r = records.get(idEpreuve(serie, m));
  return r ? scoreCourt(m, r.points) : '';
}

export interface VueJouer extends Vue {
  /** Le niveau de cette adresse (segments après « jouer ») : rendu, l'adresse remise à sa forme canonique. */
  aller(segs: readonly string[]): void;
  /** Un message au statut du prochain niveau affiché (partie abandonnée). */
  annoncer(message: string): void;
  /** Le niveau affiché redessiné (comptes de la Révision du jour une fois la mémoire chargée). */
  rafraichir(): void;
}

/** La Révision du jour (J1a), en tête d'Entraînement. */
export interface RevisionJouer {
  /** « 12 à revoir · 6 nouveaux » ; null tant que la mémoire se charge (ligne désactivée). */
  comptes(): ComptesSeance | null;
  /** Faux : les progrès ne sont pas gardés sur cet appareil (avis discret sous la ligne). */
  garde(): boolean;
  /** Lance la séance (main.ts : la vue Toucher s'ouvre comme une partie, sans adresse dans l'arbre). */
  lancer(): void;
}

export interface OptionsJouer {
  /** Une partie choisie, son terrain chargé : main.ts ouvre sa vue et la lance. */
  lancer(l: Lancement, s: Serie, t: Terrain, ids: string[]): void;
  /** « × » : la vue d'avant Jouer. */
  fermer(): void;
  /** Un niveau plus bas : une entrée d'historique de plus. */
  pousser(adresse: string): void;
  /** Un niveau plus haut : l'historique remonté s'il y mène, sinon l'entrée remplacée. */
  remonter(adresse: string): void;
  /** L'adresse affichée remplacée par celle du niveau rendu (sans nouvelle entrée). */
  canoniser(adresse: string): void;
  /** La Révision du jour ; sans elle, pas de ligne. */
  revision?: RevisionJouer;
}

/** Un gros bouton : nom, détail court, et à droite le record (ou un compte, sans le mot « record »). */
function bouton(attrs: Record<string, string>, nom: string, detail: string, record = '', compte = ''): HTMLButtonElement {
  const texte = creer('span', { class: 'jouer-texte' }, creer('span', { class: 'jouer-nom' }, nom), ...(detail ? [creer('span', { class: 'jouer-detail' }, detail)] : []));
  const droite = record
    ? [creer('span', { class: 'jouer-record' }, creer('span', { class: 'jouer-record-nom' }, J.record), record)]
    : compte
      ? [creer('span', { class: 'jouer-record jouer-compte' }, compte)]
      : [];
  return creer('button', { type: 'button', ...attrs, class: `jouer-bouton ${attrs.class ?? ''}`.trim() }, texte, ...droite);
}

export function vueJouer(ctx: ContexteVue, arbre: Arbre, o: OptionsJouer): VueJouer {
  const panneau = creer('div', { class: 'jouer-panneau', id: 'jouer-panneau' });
  panneau.hidden = true;
  ctx.zone.append(panneau);

  /** L'adresse du niveau affiché (null : à redessiner au prochain aller()). */
  let rendue: string | null = null;
  let niveauRendu: Niveau | null = null;
  /** Change à chaque niveau rendu et à la sortie : un chargement d'île arrivé après ne lance rien. */
  let jeton = 0;
  let aDire = '';
  /**
   * Le dernier choix fait à chaque niveau (par adresse), marqué à l'écran
   * (aria-current, comme la série gardée des anciens départs) : d'abord ceux
   * de la dernière partie, puis chaque niveau affiché marque son chemin.
   */
  const choixFaits = new Map<string, string>();
  function marquerChemin(n: Niveau, mode?: ModeJeu): void {
    const s = segments(n);
    s.forEach((id, i) => choixFaits.set(['jouer', ...s.slice(0, i)].join('/'), id));
    if (mode) choixFaits.set(adresse(n), mode);
  }
  const derniere = lireDerniere(stockage(), arbre);
  if (derniere) marquerChemin({ type: 'exercices', ...derniere }, derniere.mode);

  const marque = (b: HTMLButtonElement, id: string) => {
    if (rendue && choixFaits.get(rendue) === id) b.setAttribute('aria-current', 'true');
    return b;
  };

  function lancer(l: Lancement, boutons: readonly HTMLButtonElement[], statut: HTMLElement): void {
    const s = arbre.serie(l.sujet, l.serie);
    if (!s) return;
    const j = jeton;
    avecTerrain(ctx, s, { boutons, statut, encore: () => j === jeton && !panneau.hidden }, (t, ids) => o.lancer(l, s, t, ids));
  }

  function entete(n: Niveau): HTMLElement[] {
    const fermer = creer('button', { type: 'button', class: 'jouer-icone', id: 'jouer-fermer', 'aria-label': J.fermer, title: J.fermer }, '×');
    fermer.addEventListener('click', () => o.fermer());
    const parent = arbre.parent(n);
    if (!parent) return [creer('div', { class: 'jouer-tete' }, creer('h2', {}, J.titre), fermer)];
    const haut = creer('button', { type: 'button', class: 'jouer-icone', id: 'jouer-haut', 'aria-label': J.remonter, title: J.remonter }, '‹');
    haut.addEventListener('click', () => o.remonter(adresse(parent)));
    // Le fil : chaque choix mène à son niveau (lien) ; ceux qui mènent ici sont
    // du texte, le dernier en clair, un choix dont le niveau suivant est sauté
    // (Communes) discret comme les liens. Chaque « › » colle au nom qui le suit
    // (.jouer-fil-pas) : un fil qui passe à la ligne n'en laisse pas en bout de ligne.
    const choix = arbre.fil(n);
    const fil: HTMLElement[] = [];
    for (const c of choix) {
      const a = adresse(c.niveau);
      let nom: HTMLElement;
      if (a === rendue) nom = creer('span', { class: c === choix.at(-1) ? 'jouer-fil-ici' : 'jouer-fil-saute' }, c.nom);
      else {
        nom = creer('a', { href: versAncre(a) }, c.nom);
        nom.addEventListener('click', (ev) => {
          (ev as Event).preventDefault?.();
          o.remonter(a);
        });
      }
      fil.push(fil.length ? creer('span', { class: 'jouer-fil-pas' }, creer('span', { class: 'jouer-fil-sep', 'aria-hidden': 'true' }, '›'), nom) : nom);
    }
    const titre = creer('h2', { class: 'jouer-fil', 'aria-label': `${J.fil} : ${choix.map((c) => c.nom).join(', ')}` }, ...fil);
    const regles = n.type === 'exercices' ? arbre.modes(n.branche, n.sujet).filter((m) => regleExercice(m)) : [];
    if (!regles.length) return [creer('div', { class: 'jouer-tete' }, haut, titre, fermer)];
    // Les règles complètes derrière « ? » (motif .help-btn / .help-text du style commun).
    const texte = creer(
      'div',
      { class: 'help-text', id: 'jouer-regles' },
      ...regles.map((m) => {
        const r = regleExercice(m);
        return creer('p', {}, creer('strong', {}, nomExercice(m)), ` : ${r.charAt(0).toLowerCase()}${r.slice(1)}`);
      }),
    );
    texte.hidden = true;
    const aide = creer('button', { type: 'button', class: 'help-btn', id: 'jouer-aide', 'aria-label': J.regles, title: J.regles, 'aria-expanded': 'false', 'aria-controls': 'jouer-regles' }, '?');
    aide.addEventListener('click', () => {
      texte.hidden = !texte.hidden;
      aide.setAttribute('aria-expanded', String(!texte.hidden));
    });
    return [creer('div', { class: 'jouer-tete' }, haut, titre, aide, fermer), texte];
  }

  /** Les boutons d'un niveau de choix, en grille à deux colonnes (la série « tous » d'un sujet, .jouer-large, sur toute la largeur). */
  const grille = (boutons: HTMLButtonElement[]) => creer('div', { class: 'jouer-grille' }, ...boutons);

  function corps(n: Niveau, statut: HTMLElement): HTMLElement[] {
    const choisir = (b: HTMLButtonElement, id: string) => {
      b.addEventListener('click', () => {
        if (rendue) choixFaits.set(rendue, id);
        o.pousser(adresse(arbre.enfant(n, id)));
      });
      return marque(b, id);
    };
    if (n.type === 'racine') {
      const elements: HTMLElement[] = [];
      const boutons: HTMLButtonElement[] = [];
      // Rejouer : la dernière partie lancée, si elle est encore dans l'arbre (lireDerniere).
      const l = lireDerniere(stockage(), arbre);
      if (l) {
        const r = recordDe(lireRecords(stockage()), l.mode, l.serie);
        const b = bouton({ id: 'jouer-rejouer', class: 'jouer-ligne' }, remplir(J.rejouer, { mode: nomExercice(l.mode), serie: nomSerie(l.serie) }), '', r);
        b.addEventListener('click', () => lancer(l, boutons, statut));
        boutons.push(b);
        elements.push(b);
      }
      const branches = BRANCHES.map((br) => choisir(bouton({ 'data-branche': br, class: 'jouer-branche' }, nomBranche(br), J.branches[br].detail), br));
      boutons.push(...branches);
      elements.push(grille(branches));
      return elements;
    }
    if (n.type === 'sujets') {
      const sujets = grille(arbre.sujets(n.branche).map((s) => choisir(bouton({ 'data-sujet': s.id }, nomSujet(s.id), nombreSujet(s.id, arbre.series(s.id))), s.id)));
      const r = o.revision;
      if (n.branche !== 'entrainement' || !r) return [sujets];
      // La Révision du jour en tête d'Entraînement (décisions « Écran Jouer », « Apprendre et
      // Révision du jour ») : ses comptes à droite ; désactivée pendant le chargement de la
      // mémoire, et quand tout est fait (« À jour »).
      const c = r.comptes();
      const b = bouton({ id: 'jouer-revision', class: 'jouer-ligne' }, S.revision, r.garde() ? '' : S.non_garde, '', c ? texteComptes(c) : S.chargement);
      b.disabled = !c || (!c.aRevoir && !c.nouveaux);
      b.addEventListener('click', () => r.lancer());
      return [b, sujets];
    }
    if (n.type === 'series')
      return [
        grille(
          arbre
            .series(n.sujet)
            .map((s) =>
              choisir(
                bouton({ 'data-serie': s.id, ...(s.id === SERIE_TOUS ? { class: 'jouer-large' } : {}) }, nomSerie(s.id), remplir(textes.terrains[s.terrain].n, { n: s.n })),
                s.id,
              ),
            ),
        ),
      ];
    // Les exercices, en dernier : une ligne pleine largeur chacun, son record dans la série à droite.
    const records = lireRecords(stockage());
    const boutons: HTMLButtonElement[] = [];
    for (const m of arbre.modes(n.branche, n.sujet)) {
      const b = marque(bouton({ 'data-mode': m, class: 'jouer-ligne' }, nomExercice(m), detailExercice(m, n.sujet), recordDe(records, m, n.serie)), m);
      b.addEventListener('click', () => {
        if (rendue) choixFaits.set(rendue, m);
        lancer({ branche: n.branche, sujet: n.sujet, serie: n.serie, mode: m }, boutons, statut);
      });
      boutons.push(b);
    }
    return [creer('div', { class: 'jouer-lignes' }, ...boutons)];
  }

  function rendre(n: Niveau): void {
    jeton++;
    rendue = adresse(n);
    niveauRendu = n;
    marquerChemin(n);
    // Statut : le chargement de l'île et son échec (avecTerrain), une partie abandonnée.
    const statut = creer('p', { class: 'hint jouer-statut', 'aria-live': 'polite' }, aDire);
    statut.hidden = !aDire;
    aDire = '';
    panneau.dataset.niveau = n.type;
    panneau.replaceChildren(...entete(n), statut, ...corps(n, statut));
  }

  return {
    aller(segs) {
      const n = arbre.resoudre(segs);
      const a = adresse(n);
      if (a !== ['jouer', ...segs].join('/')) o.canoniser(a);
      if (a === rendue && !aDire) return;
      rendre(n);
    },
    annoncer(message) {
      aDire = message;
    },
    rafraichir() {
      if (!panneau.hidden && niveauRendu) rendre(niveauRendu);
    },
    activer() {
      rendue = null;
      panneau.hidden = false;
    },
    desactiver() {
      jeton++;
      rendue = null;
      panneau.hidden = true;
    },
  };
}

/**
 * L'Essai J0 dans ⚙ (index.html, #reglage-essai) : un outil de mesure (la
 * série des plus difficiles, celle du pilote), hors des listes de Jouer
 * (décision « Écran Jouer ») ; Trouver ou Reconnaître sur la série « essai ».
 */
export function remplirEssaiJ0(p: HTMLElement, lancer: (m: 'localiser' | 'nommer') => void): void {
  const [trouver, reconnaitre] = (['localiser', 'nommer'] as const).map((m) => {
    const b = creer('button', { type: 'button', class: 'lien', 'data-mode': m }, nomExercice(m));
    b.addEventListener('click', () => lancer(m));
    return b;
  }) as [HTMLButtonElement, HTMLButtonElement];
  p.replaceChildren(
    creer('span', { title: textes.toucher.serie_essai_detail }, textes.toucher.serie_essai),
    ' : ',
    trouver,
    ' · ',
    reconnaitre,
    ' ',
    creer('span', { class: 'hint' }, J.essai_aide),
  );
}
