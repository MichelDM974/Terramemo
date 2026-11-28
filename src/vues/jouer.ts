// Vue « Jouer » (décision « Écran Jouer », ticket #18) : l'arbre de src/vues/arbre.ts
// en gros boutons neutres, un choix par écran (le bleu reste au bouton Jouer de
// l'en-tête), dans un panneau qui couvre presque toute la carte (carte.css,
// choix du 09/11 : il était en bas, sous le pouce). D'abord Entraînement ou
// Classé ; ensuite le sujet, la série, et l'exercice en dernier, chacun avec son
// record dans la série choisie et, pour les épreuves, leurs règles derrière
// « ? ». Les tuiles portent une vignette (vignettes.ts : la carte d'une série
// ou d'un sujet, une icône sinon). « Rejouer » n'est plus ici (choix du 10/11) :
// il reste au bilan de chaque partie. Toucher
// un exercice lance la partie (main.ts : Toucher ou la vue des épreuves) ; la
// carte de l'île et les données d'un sujet (les capitales, le manifeste des drapeaux, la couche marine posée sur la carte) se chargent ici
// d'abord (avecSujet : statut, échec hors ligne). « ‹ » et le fil d'Ariane
// remontent, « × » ferme (main.ts) ; chaque niveau a son adresse, que
// main.ts donne à aller().
// Le quiz général (étude J2 § 7.1, décision « Quiz général ») : la première
// tuile de la racine, pleine largeur, puis ses quatre difficultés
// (`data-difficulte`), chacune avec sa phrase courte et son record, les
// règles derrière « ? ». Ses données (notoriété, capitales, drapeaux, couche
// marine) se chargent ici avant la partie, comme celles d'un sujet.
import { idEpreuve, lireRecords, QUESTIONS_QUIZ, type RecordChrono } from '../epreuve/chrono';
import { idQuiz } from '../epreuve/quiz';
import { REGLES } from '../quiz/regles';
import { DIFFICULTES, type Difficulte } from '../quiz/types';
import { estDomaine } from '../srs/fiches';
import type { Terrain } from '../terrains';
import {
  adresse,
  BRANCHES,
  estEpreuve,
  estQuiz,
  lireDerniere,
  NIVEAU_QUIZ,
  QUIZ,
  nomBranche,
  nomDifficulte,
  nomQuiz,
  nomExercice,
  nombreSujet,
  nomSujet,
  segments,
  versAncre,
  type Arbre,
  type Branche,
  type Lancement,
  type ModeJeu,
  type Niveau,
  type PartieJouer,
} from './arbre';
import { nomSerie, SERIE_TOUS, type Serie } from './cibles';
import { avecSujet, creer, type ContexteVue, type Vue } from './commun';
import { scoreCourt, SECONDES_EPREUVE } from './scores';
import { texteComptes, type ComptesSeance } from './seance';
import { compteSerie } from './sujets';
import { remplir, textes } from './textes';
import { creerVignettes, icone } from './vignettes';

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

/**
 * Phrase courte sous le nom d'un exercice : « 15 s par question, un seul
 * toucher » ; celle du sujet s'il en a une (jouer.exercices.<sujet>.<mode> :
 * Apprendre dit pays, capitales ou communes), la phrase générique sinon.
 */
export const detailExercice = (m: ModeJeu, sujet = 'pays'): string =>
  remplir((J.exercices as unknown as Record<string, Partial<Record<ModeJeu, string>> | undefined>)[sujet]?.[m] ?? J.exercices[m], { s: estEpreuve(m) ? SECONDES_EPREUVE : 0 });

/** Règles complètes d'une épreuve (barème, départage), derrière « ? » ; celles des Voisins, au délai par voisin (D607 a) ; '' pour un exercice d'entraînement. */
export const regleExercice = (m: ModeJeu, sujet = 'pays'): string => (estEpreuve(m) ? remplir(sujet === 'voisins' ? E[m].aide_voisins : E[m].aide, { s: SECONDES_EPREUVE }) : '');

/**
 * Ce que le « ? » des exercices d'un sujet dit en plus de leurs règles : que
 * ses exercices sont visuels (les drapeaux, étude J2 § 5.3 : les images ne
 * sont pas décrites aux lecteurs d'écran avant la réponse) ; '' sinon. Les
 * quatre choix et leurs touches 1 à 4 en Entraînement seul (Apprendre et
 * Reconnaître sont des QCM) : les épreuves de Classé se jouent sur la carte.
 */
export const aideSujet = (sujet: string, branche: Branche): string =>
  // Les silhouettes : la question est un dessin, les choix des noms (pas de touches 1 à 4 à dire). Les voisins : ce qui
  // compte et ce qui ne compte pas (D605 a).
  sujet === 'silhouettes' ? J.visuel_silhouettes : sujet === 'voisins' ? J.voisins : sujet !== 'drapeaux' ? '' : branche === 'classe' ? J.visuel : `${J.visuel} ${J.visuel_choix}`;

/** La phrase courte d'une difficulté du quiz : « Plus de lieux : 10 à 4 choix (10 s), 10 sur la carte (15 s) » (src/quiz/regles.ts). */
export function detailDifficulte(d: Difficulte): string {
  const r = REGLES[d];
  return remplir(textes.quiz.difficultes[d].detail, { qcm: r.qcm, toucher: QUESTIONS_QUIZ - r.qcm, sq: r.delai_qcm_ms / 1000, st: r.delai_toucher_ms / 1000 });
}

/** Le record d'une difficulté du quiz (« 17/20 · 85 % ») ; '' s'il n'y en a pas. */
export function recordQuiz(records: ReadonlyMap<string, RecordChrono>, d: Difficulte): string {
  const epreuve = idQuiz(d);
  const r = records.get(epreuve);
  return r ? scoreCourt(epreuve, r) : '';
}

/** Le record de cet exercice dans cette série du sujet (« 190/195 · 97 % », « 17/54 · 31 % ») ; '' s'il n'y en a pas (ou en entraînement, ou pour un sujet sans fiches). */
export function recordDe(records: ReadonlyMap<string, RecordChrono>, m: ModeJeu, serie: string, sujet = 'pays'): string {
  if (!estEpreuve(m) || !estDomaine(sujet)) return '';
  const epreuve = idEpreuve(serie, m, sujet);
  const r = records.get(epreuve);
  return r ? scoreCourt(epreuve, r) : '';
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
  /** Le quiz général ; sans lui, ses difficultés ne lancent rien. */
  quiz?: QuizJouer;
}

/** Le quiz général, lancé d'une difficulté. */
export interface QuizJouer {
  /** Ses données à charger avant la partie (notoriété, capitales, drapeaux, couche marine) ; null : tout est là. */
  preparer(): Promise<unknown> | null;
  /** Une partie de cette difficulté, ses données chargées : main.ts ouvre sa vue et la lance. */
  lancer(d: Difficulte): void;
}

/**
 * Un gros bouton : sa vignette (carte ou icône) s'il en a une, le nom, un
 * détail court, et à droite le record (ou un compte, sans le mot « record »).
 * Une tuile (.jouer-tuile) met la vignette au-dessus du texte, ou à sa gauche
 * quand elle est large (carte.css) ; une ligne (.jouer-ligne) toujours à gauche.
 */
function bouton(attrs: Record<string, string>, nom: string, detail: string, record = '', compte = '', vignette: Element | null = null): HTMLButtonElement {
  const texte = creer('span', { class: 'jouer-texte' }, creer('span', { class: 'jouer-nom' }, nom), ...(detail ? [creer('span', { class: 'jouer-detail' }, detail)] : []));
  const droite = record
    ? [creer('span', { class: 'jouer-record' }, creer('span', { class: 'jouer-record-nom' }, J.record), record)]
    : compte
      ? [creer('span', { class: 'jouer-record jouer-compte' }, compte)]
      : [];
  const image = vignette ? [creer('span', { class: 'jouer-vignette' }, vignette)] : [];
  return creer('button', { type: 'button', ...attrs, class: `jouer-bouton ${attrs.class ?? ''}`.trim() }, creer('span', { class: 'jouer-corps' }, ...image, texte, ...droite));
}

export function vueJouer(ctx: ContexteVue, arbre: Arbre, o: OptionsJouer): VueJouer {
  const panneau = creer('div', { class: 'jouer-panneau', id: 'jouer-panneau' });
  panneau.hidden = true;
  ctx.zone.append(panneau);
  const sujetsDe = (b: (typeof BRANCHES)[number]) => arbre.sujets(b).map((s) => s.id);
  const lesSeries = [...new Map(BRANCHES.flatMap(sujetsDe).flatMap((s) => arbre.series(s)).map((s) => [s.id, s])).values()];
  const vignettes = creerVignettes(ctx.donnees, lesSeries);
  /** La vignette d'un sujet : son icône s'il en a une (Drapeaux, D53 a), sinon celle de sa première série dans ce sujet (Tous les pays, le monde et ses capitales, La Réunion). */
  const vignetteSujet = (sujet: string) => {
    const i = icone(sujet);
    if (i) return i;
    const s = arbre.series(sujet)[0];
    return s ? vignettes.serie(s.id, sujet) : null;
  };
  let prechauffe = false;

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
  function marquerChemin(n: Niveau, mode?: string): void {
    const s = segments(n);
    s.forEach((id, i) => choixFaits.set(['jouer', ...s.slice(0, i)].join('/'), id));
    if (mode) choixFaits.set(adresse(n), mode);
  }
  const marquerPartie = (p: PartieJouer) => (estQuiz(p) ? marquerChemin(NIVEAU_QUIZ, p.quiz) : marquerChemin({ type: 'exercices', ...p }, p.mode));
  const derniere = lireDerniere(stockage(), arbre);
  if (derniere) marquerPartie(derniere);

  const marque = (b: HTMLButtonElement, id: string) => {
    if (rendue && choixFaits.get(rendue) === id) b.setAttribute('aria-current', 'true');
    return b;
  };

  function lancer(l: Lancement, boutons: readonly HTMLButtonElement[], statut: HTMLElement): void {
    const s = arbre.serie(l.sujet, l.serie);
    if (!s) return;
    const j = jeton;
    avecSujet(ctx, s, l.sujet, { boutons, statut, encore: () => j === jeton && !panneau.hidden }, (t, ids) => o.lancer(l, s, t, ids));
  }

  /**
   * Une partie du quiz : ses données d'abord (comme avecSujet : boutons
   * désactivés et statut le temps du chargement ; un échec, hors ligne, au
   * statut, et l'on reste sur ce niveau), puis la partie.
   */
  function lancerQuiz(d: Difficulte, boutons: readonly HTMLButtonElement[], statut: HTMLElement): void {
    const q = o.quiz;
    if (!q) return;
    const dire = (m: string) => {
      statut.textContent = m;
      statut.hidden = !m;
    };
    const p = q.preparer();
    if (!p) {
      dire('');
      return q.lancer(d);
    }
    const j = jeton;
    const actifs = boutons.filter((b) => !b.disabled);
    for (const b of actifs) b.disabled = true;
    dire(textes.toucher.chargement_sujet);
    const fin = (m: string) => {
      for (const b of actifs) b.disabled = false;
      dire(m);
    };
    p.then(
      () => {
        fin('');
        if (j === jeton && !panneau.hidden) q.lancer(d);
      },
      () => fin(textes.quiz.echec),
    );
  }

  function entete(n: Niveau): HTMLElement[] {
    // Libellé commun à toutes les « × » (#18) : elle mène à la carte.
    const fermer = creer('button', { type: 'button', class: 'jouer-icone', id: 'jouer-fermer', 'aria-label': textes.croix.carte, title: textes.croix.carte }, '×');
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
    const sujet = n.type === 'exercices' ? n.sujet : undefined;
    // Un sujet aux exercices visuels (les drapeaux) le dit derrière le même « ? », en Entraînement comme en Classé.
    const duSujet = n.type === 'exercices' ? aideSujet(n.sujet, n.branche) : '';
    const quiz = n.type === 'quiz';
    if (!regles.length && !duSujet && !quiz) return [creer('div', { class: 'jouer-tete' }, haut, titre, fermer)];
    // Les règles complètes derrière « ? » (motif .help-btn / .help-text du style commun) ; celles du quiz, au niveau de ses difficultés.
    const texte = creer(
      'div',
      { class: 'help-text', id: 'jouer-regles' },
      ...regles.map((m) => {
        const r = regleExercice(m, sujet);
        return creer('p', {}, creer('strong', {}, nomExercice(m)), ` : ${r.charAt(0).toLowerCase()}${r.slice(1)}`);
      }),
      ...(duSujet ? [creer('p', { class: 'jouer-aide-sujet' }, duSujet)] : []),
      ...(quiz ? [creer('p', {}, textes.quiz.regles)] : []),
    );
    texte.hidden = true;
    // Le libellé : les règles des épreuves ou du quiz, ou l'aide des exercices d'Entraînement d'un sujet visuel.
    const libelle = quiz ? textes.quiz.aide : regles.length ? J.regles : J.aide;
    const aide = creer('button', { type: 'button', class: 'help-btn', id: 'jouer-aide', 'aria-label': libelle, title: libelle, 'aria-expanded': 'false', 'aria-controls': 'jouer-regles' }, '?');
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
    if (n.type === 'racine')
      return [
        grille([
          // Le quiz en tête, pleine largeur (étude J2 § 7.1) ; Entraînement et Classé dessous, inchangés (le pilote compte data-branche).
          choisir(bouton({ 'data-racine': QUIZ, class: 'jouer-tuile jouer-branche jouer-large' }, nomQuiz(), textes.quiz.detail, '', '', icone('quiz')), QUIZ),
          ...BRANCHES.map((br) => choisir(bouton({ 'data-branche': br, class: 'jouer-tuile jouer-branche' }, nomBranche(br), J.branches[br].detail, '', '', icone(br)), br)),
        ]),
      ];
    if (n.type === 'quiz') {
      // Les quatre difficultés : une ligne chacune, son record à droite ; toucher une ligne lance la partie.
      const records = lireRecords(stockage());
      const boutons: HTMLButtonElement[] = [];
      for (const d of DIFFICULTES) {
        const b = marque(bouton({ 'data-difficulte': d, class: 'jouer-ligne' }, nomDifficulte(d), detailDifficulte(d), recordQuiz(records, d), '', icone(`quiz-${d}`)), d);
        b.addEventListener('click', () => {
          if (rendue) choixFaits.set(rendue, d);
          lancerQuiz(d, boutons, statut);
        });
        boutons.push(b);
      }
      return [creer('div', { class: 'jouer-lignes' }, ...boutons)];
    }
    if (n.type === 'sujets') {
      const sujets = grille(
        arbre
          .sujets(n.branche)
          .map((s) => choisir(bouton({ 'data-sujet': s.id, class: 'jouer-tuile' }, nomSujet(s.id), nombreSujet(s.id, arbre.series(s.id)), '', '', vignetteSujet(s.id)), s.id)),
      );
      const r = o.revision;
      if (n.branche !== 'entrainement' || !r) return [sujets];
      // La Révision du jour en tête d'Entraînement (décisions « Écran Jouer », « Apprendre et
      // Révision du jour ») : ses comptes à droite ; désactivée pendant le chargement de la
      // mémoire, et quand tout est fait (« À jour »).
      const c = r.comptes();
      const b = bouton({ id: 'jouer-revision', class: 'jouer-ligne' }, S.revision, r.garde() ? '' : S.non_garde, '', c ? texteComptes(c) : S.chargement, icone('revision'));
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
                bouton(
                  { 'data-serie': s.id, class: s.id === SERIE_TOUS ? 'jouer-tuile jouer-large' : 'jouer-tuile' },
                  nomSerie(s.id),
                  compteSerie(n.sujet, s.n),
                  '',
                  '',
                  vignettes.serie(s.id, n.sujet),
                ),
                s.id,
              ),
            ),
        ),
      ];
    // Les exercices, en dernier : une ligne pleine largeur chacun, son record dans la série à droite.
    const records = lireRecords(stockage());
    const boutons: HTMLButtonElement[] = [];
    for (const m of arbre.modes(n.branche, n.sujet)) {
      const b = marque(bouton({ 'data-mode': m, class: 'jouer-ligne' }, nomExercice(m), detailExercice(m, n.sujet), recordDe(records, m, n.serie, n.sujet), '', icone(m)), m);
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
    // Statut : le chargement de l'île ou d'un sujet et son échec (avecSujet), une partie abandonnée.
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
      // Les cartes des tuiles, calculées d'avance pendant qu'on choisit sa branche.
      if (!prechauffe) vignettes.prechauffer(lesSeries.map((s) => s.id));
      prechauffe = true;
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
