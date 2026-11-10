// Vue « Nommer » (décision « Nommer », conception docs/etudes/2026-11-06-reunion.md
// § 5), le second exercice de Toucher : la zone s'allume sur la carte, quatre
// noms en grille 2 × 2 sous le pouce, un seul essai (mauvais choix en rouge, bon
// en vert, puis la question suivante) ; bilan des justes du premier coup.
// Vaut pour toutes les séries, le monde comme l'île. Les touchers sur la carte
// n'y répondent pas (Toucher les ignore) ; glisser et pincer restent libres.
import type { CarteAffichee } from '../map/carte';
import { anneauPrincipal, empriseEcran, versEcran, type Emprise } from '../map/geo';
import type { Forme, Lieu } from '../map/types';
import { tailleEcranPx } from '../map/pastilles';
import type { Terrain } from '../terrains';
import { ANNEAU_SOUS_PX, creer, fmtS, poserContenu, type ContexteVue } from './commun';
import { choix, doitCadrer, NB_CHOIX, PartieNommer } from './qcm';
import { rendu, type RenduSujet } from './sujets';
import { remplir, textes } from './textes';

const T = textes.toucher;
/** Durée de la rétroaction avant la question suivante (ms) : les pauses du Chrono. */
const PAUSE_JUSTE_MS = 900;
const PAUSE_FAUX_MS = 1800;

/**
 * Le cadrage de la zone d'une question : faut-il voler jusqu'à elle
 * (doitCadrer), et sa taille à l'écran (l'anneau d'une zone minuscule). Jugé
 * sur la vue où la carte s'arrêtera (contexteFinal) : répondue en moins d'une
 * seconde, la question précédente laisse son vol en cours, et la vue en plein
 * vol (reculée, ou pas encore arrivée) disait à tort la zone suivante visible
 * ou cachée. l × hVisible : la carte jusqu'au haut de la barre.
 */
export function cadrageNommer(
  carte: Pick<CarteAffichee, 'contexteFinal'>,
  lieu: Lieu,
  forme: Forme | undefined,
  l: number,
  hVisible: number,
): { vole: boolean; taille: number } {
  const c = carte.contexteFinal();
  const ecran = (ll: [number, number]): [number, number] | null => {
    const b = c.proj(ll);
    return b ? versEcran(c.t, b[0], b[1]) : null;
  };
  const taille = tailleEcranPx(lieu, c.proj.scale(), c.t.k);
  // L'emprise du polygone principal (la Sicile comprise, la Guyane non).
  const emprise = forme ? empriseEcran(anneauPrincipal(forme, lieu.point), ecran) : null;
  return { vole: doitCadrer(ecran(lieu.point), taille, l, hVisible, emprise), taille };
}

/** Une réponse au QCM, dès qu'elle est donnée (journal : partie libre ou séance). */
export interface ReponseNommer {
  id: string;
  choisi: string;
  juste: boolean;
  temps_ms: number;
  /** Échelle de la carte au moment du choix. */
  zoom: number;
}

/**
 * Crochets d'une partie (journal du J1a) et mode piloté (une question de
 * séance : src/vues/seance.ts) : avec surFin, la partie finie ne montre pas
 * le bilan de Reconnaître, elle rend la main.
 */
export interface CrochetsNommer {
  /** Chaque réponse ; une ligne rendue s'ajoute à la rétroaction. */
  surReponse?(r: ReponseNommer): string | void;
  /** Mode piloté : la partie finie (sa dernière rétroaction passée), à la place du bilan. */
  surFin?(): void;
  /** Le compte affiché (« 3 / 14 » de la séance), au lieu de celui de la partie. */
  compte?(): string;
  /** « Je connais déjà » proposé ; touché : la question est sautée sans réponse. */
  connu?(): void;
  /** « Terminer » : à la place du bilan de Reconnaître (celui de la séance). */
  terminer?(): void;
  /** Avant la première question : la carte cadrée sur cette emprise (QCM d'une grappe, décision « Cadrage et disques en séance »). */
  cadrer?: Emprise;
}

/**
 * Allume la zone d'une question (Reconnaître, carte retournée) : en accent,
 * un anneau si elle est minuscule, et la carte vole jusqu'à elle (centrée
 * au-dessus de la barre) si elle est hors de la partie visible, en partie
 * sous la barre ou trop petite pour être vue. Sur l'île au zoom 1 rien ne
 * bouge (toute l'île est au-dessus de la barre, chaque commune ≥ 15 px) ;
 * zoomée par un geste ou un vol, elle y revient quand la zone n'est pas
 * visible, plutôt que de voler encore : sinon un vol laissait toute la
 * suite de la partie zoomée. Jugé sur l'arrivée d'un vol en cours
 * (cadrageNommer) : s'il n'y a pas à voler, il continue jusqu'à elle ;
 * sinon le nouveau vol part d'où il en est. Rend vrai si la zone est petite
 * (anneau posé).
 */
export function allumerZone(carte: Terrain['carte'], id: string, lieu: Lieu | undefined, forme: Forme | undefined, barre: HTMLElement, local: boolean): boolean {
  carte.effacerMarques();
  carte.marquer(id, 'choisi');
  const r = carte.hote.getBoundingClientRect();
  const haut = barre.getBoundingClientRect().top - r.top;
  const cadrer = () => (lieu ? cadrageNommer(carte, lieu, forme, r.width, haut) : { vole: true, taille: 0 });
  let c = cadrer();
  if (c.vole && local && carte.contexteFinal().t.k !== 1) {
    carte.zoomer({ k: 1, x: 0, y: 0 });
    c = cadrer();
  }
  const petite = c.taille < ANNEAU_SOUS_PX;
  if (petite) carte.anneau(id, 'choisi');
  if (c.vole) carte.montrer(id, haut);
  return petite;
}

export interface Nommer {
  /**
   * Une partie sur ce terrain, dans ce sujet (consigne et boutons : son rendu,
   * sujets.ts) : cibles dans l'ordre donné (déjà mélangées) ; crochets du
   * journal ou du mode piloté.
   */
  demarrer(t: Terrain, sujet: string, nomSerie: string, cibles: readonly string[], crochets?: CrochetsNommer): void;
  /** Une partie est en cours (pas encore au bilan). */
  readonly enCours: boolean;
  /** Retour dans la vue : le terrain remontré, la question en cours reposée. */
  reprendre(): void;
  /** Vue quittée : la réponse donnée compte déjà, la partie attend le retour. */
  quitter(): void;
  /** Une autre partie lancée (ou la même relancée) : celle-ci est abandonnée. */
  arreter(): void;
}

/** `actions` : les boutons du bilan (Recommencer, Autre série), `croix` sa « × » (#18), ceux de Toucher. */
export function vueNommer(ctx: ContexteVue, o: { bilan: HTMLElement; actions: () => HTMLElement; croix?: () => HTMLElement }): Nommer {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const boutons = Array.from({ length: NB_CHOIX }, () => creer('button', { type: 'button', class: 'secondary nommer-choix' }));
  const terminer = creer('button', { type: 'button', class: 'secondary', id: 'nommer-terminer' }, T.terminer);
  const connu = creer('button', { type: 'button', class: 'secondary', id: 'nommer-connu' }, textes.seance.connais);
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-nommer' },
    creer('div', { class: 'essai-ligne' }, consigne, compte),
    creer('div', { class: 'nommer-grille' }, ...boutons),
    retro,
    creer('div', { class: 'essai-actions' }, connu, terminer),
  );
  barre.hidden = true;
  connu.hidden = true;
  ctx.zone.append(barre);

  let t: Terrain | null = null;
  /** Le rendu du sujet de la partie : consigne, boutons, rétroaction et bilan. */
  let rs: RenduSujet | null = null;
  let partie: PartieNommer | null = null;
  let crochets: CrochetsNommer = {};
  let serie = '';
  let n = 0;
  let lieux = new Map<string, Lieu>();
  let formes = new Map<string, Forme>();
  let jouables = new Set<string>();
  /** Les choix tirés pour la question `pour` : les mêmes au retour dans la vue. */
  let choixCourants: string[] = [];
  let pour: string | undefined;
  /** La zone demandée est petite à l'écran : un anneau l'entoure. */
  let petite = false;
  let debut = 0;
  let attente = 0;

  function arreterAttente(): void {
    clearTimeout(attente);
    attente = 0;
  }

  function allumer(carte: Terrain['carte'], id: string, local: boolean): void {
    petite = allumerZone(carte, id, lieux.get(id), formes.get(id), barre, local);
  }

  function poser(): void {
    arreterAttente();
    if (!partie || !t || !rs) return;
    const id = partie.courante;
    if (id === undefined) return finir();
    if (pour !== id) {
      // Les leurres du sujet (étude J2 § 5.1) : jamais un exclu (D37 c, Israël ↔ Palestine sous Capitales).
      choixCourants = choix(id, lieux, jouables, Math.random, { exclus: rs.qcmExclus(id) });
      pour = id;
    }
    const r = rs;
    consigne.textContent = r.consigneQcm;
    consigne.dataset.cible = id;
    compte.textContent = crochets.compte?.() ?? `${partie.numero} / ${n}`;
    connu.hidden = !crochets.connu;
    connu.disabled = false;
    retro.textContent = '';
    retro.className = 'essai-retro';
    boutons.forEach((b, k) => {
      const c = choixCourants[k] ?? '';
      // Un leurre montre ce que son lieu montrerait en leurre (la capitale principale de son pays), le bon bouton ce que la question montre.
      poserContenu(b, c ? r.choix(c, id) : { texte: '' });
      b.dataset.id = c;
      b.className = 'secondary nommer-choix';
      b.disabled = false;
    });
    barre.hidden = false;
    if (crochets.cadrer) {
      // Une fois : au retour dans la vue, la carte reste où le joueur l'a laissée.
      t.carte.cadrer(crochets.cadrer, barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top);
      crochets = { ...crochets, cadrer: undefined };
    }
    allumer(t.carte, id, t.nom !== 'monde');
    debut = performance.now();
  }

  function repondre(choisi: string): void {
    if (!partie || !t || !rs || attente || partie.finie) return;
    const id = partie.courante as string;
    const temps_ms = performance.now() - debut;
    const { juste } = partie.repondre(choisi, temps_ms);
    connu.disabled = true;
    for (const b of boutons) {
      b.disabled = true;
      if (b.dataset.id === id) b.classList.add('juste');
      else if (b.dataset.id === choisi) b.classList.add('faux');
    }
    // Sur la carte : la zone demandée en vert, celle choisie en rouge (on voit où elle est).
    const carte = t.carte;
    carte.effacerMarques();
    carte.marquer(id, 'juste');
    if (petite) carte.anneau(id, 'juste');
    // La ville de la bonne réponse, d'un anneau (D53 c : la capitale, en Entraînement) ; rien pour un pays.
    const point = rs.point(id);
    if (point) carte.anneauEn(point, 'juste');
    if (!juste) carte.marquer(choisi, 'faux');
    retro.className = `essai-retro ${juste ? 'juste' : 'faux'}`;
    // Le pays de la question, que la consigne ne nommait pas (« La Paz, siège du gouvernement (Bolivie) ») : rs.retro.
    const lieu = rs.retro(id);
    retro.textContent = juste
      ? remplir(lieu ? T.nommer_juste_lieu : T.nommer_juste, { lieu, temps: fmtS(temps_ms) })
      : remplir(T.nommer_faux, { cible: lieu || rs.nomChoix(id, id) });
    if (!crochets.compte) compte.textContent = `${partie.numero - 1} / ${n}`;
    const ligne = crochets.surReponse?.({ id, choisi, juste, temps_ms, zoom: carte.transfo.k });
    if (ligne) retro.append(creer('span', { class: 'seance-ligne' }, ` · ${ligne}`));
    attente = window.setTimeout(poser, juste ? PAUSE_JUSTE_MS : PAUSE_FAUX_MS);
  }

  for (const b of boutons)
    b.addEventListener('click', () => {
      if (b.dataset.id) repondre(b.dataset.id);
    });

  function finir(): void {
    arreterAttente();
    barre.hidden = true;
    if (!partie || !t || !rs) return;
    t.carte.effacerMarques();
    if (crochets.surFin) {
      partie = null;
      pour = undefined;
      return crochets.surFin();
    }
    const r = rs;
    const b = partie.bilan();
    partie = null;
    pour = undefined;
    o.bilan.replaceChildren(
      ...(o.croix ? [o.croix()] : []),
      creer('h2', {}, remplir(T.bilan_nommer_titre, { serie })),
      creer(
        'p',
        { class: 'hint' },
        b.n
          ? `${remplir(T.bilan_nommer, { justes: b.justes, n: b.n })} · ${remplir(T.bilan_nommer_temps, { temps: b.temps_median_ms == null ? '—' : fmtS(b.temps_median_ms) })}`
          : T.bilan_vide,
      ),
      creer(
        'ul',
        { class: 'essai-rates' },
        // La bonne réponse et son lieu (« Porto-Novo (Bénin) » ; le nom pour un pays), puis le leurre choisi tel qu'il était montré.
        ...b.fautes.map((f) => creer('li', {}, remplir(T.bilan_nommer_faux, { cible: r.nomBilan(f.id, 'localiser'), choisi: r.nomChoix(f.choisi, f.id) }))),
      ),
      o.actions(),
    );
    o.bilan.hidden = false;
  }

  terminer.addEventListener('click', () => (crochets.terminer ? crochets.terminer() : finir()));
  connu.addEventListener('click', () => {
    if (!partie || attente || partie.finie || !crochets.connu) return;
    const c = crochets.connu;
    quitter();
    partie = null;
    pour = undefined;
    c();
  });

  function quitter(): void {
    arreterAttente();
    barre.hidden = true;
    t?.carte.effacerMarques();
  }

  return {
    demarrer(terrain, sujet, nomSerie, cibles, c = {}) {
      t = terrain;
      rs = rendu(sujet, terrain.donnees);
      crochets = c;
      serie = nomSerie;
      n = cibles.length;
      // Les leurres viennent de tout le terrain, pas de la série (qcm.ts).
      lieux = new Map(terrain.donnees.entites.map((e) => [e.pays.id, e.pays]));
      formes = new Map(terrain.donnees.entites.map((e) => [e.pays.id, e.forme]));
      jouables = new Set(terrain.jouables);
      partie = new PartieNommer(cibles);
      pour = undefined;
      o.bilan.hidden = true;
      poser();
    },
    get enCours() {
      return partie !== null;
    },
    reprendre() {
      if (!partie || !t) return;
      ctx.terrains.montrer(t.nom);
      poser();
    },
    quitter,
    arreter() {
      quitter();
      partie = null;
      pour = undefined;
    },
  };
}
