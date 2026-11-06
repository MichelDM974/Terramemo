// Vue « Toucher » : essai de précision. « Touche : Monaco » ; on zoome, on se
// déplace, on touche ; juste ou faux sur la carte, essais, temps, bilan.
// La partie (Trouver, ou Reconnaître : nommer.ts, et sa série) se choisit dans
// Jouer (décision « Écran Jouer » : jouer.ts, puis lancer()) ou dans ⚙
// (l'Essai J0) ; son terrain arrive chargé (l'île, par Jouer). Le bilan la
// relance (« Recommencer ») ou ramène aux séries de Jouer (« Autre série ») ;
// la vue atteinte sans partie (adresse tapée, retour arrière) renvoie à Jouer
// (redirection(), main.ts).
//
// J1a (#2) : chaque question finie part au journal (parties libres, D11 :
// crochet `libre`) ; Apprendre et la Révision du jour sont des séances
// (src/vues/seance.ts) qui pilotent cette vue question par question
// (PiloteSeance) : Trouver ici, le QCM par Nommer, la carte retournée par
// retournee.ts, le bilan de la séance à la place de celui de la partie. Une
// séance quittée reprend sa question au retour, comme une partie.
import type { Emprise } from '../map/geo';
import type { Via } from '../map/pick';
import { mediane } from '../mesure/stats';
import type { Terrain } from '../terrains';
import { adresse, niveauDe, type Lancement } from './arbre';
import { melanger, nomSerie, type Serie } from './cibles';
import { creer, estPetite, fmtKm, fmtS, idsSerie, nomDe, type ContexteVue, type Vue } from './commun';
import { vueNommer, type ReponseNommer } from './nommer';
import { vueRetournee } from './retournee';
import { remplir, textes } from './textes';

interface Resultat {
  id: string;
  essais: number;
  juste: boolean;
  /** Juste au premier toucher, sans avoir demandé « Voir ». */
  premier: boolean;
  /** « Voir » demandé avant de trouver. */
  vu: boolean;
  temps_ms: number;
  /** Distance au bord au premier toucher faux (km). */
  distance_km: number | null;
  /** Premier toucher faux : l'id que la carte y désignait (null : la mer, ou juste). */
  reponse: string | null;
  /** Premier toucher juste : par quoi (tracé, pastille, au plus près). */
  via: Via | null;
  /** Échelle de la carte à la première réponse (toucher, « Voir » ou « Passer »). */
  zoom: number | null;
  /** Temps jusqu'à la première réponse (ms). */
  premier_ms: number;
}

/**
 * Une question finie, telle que le journal la garde (src/srs/journal.ts) :
 * Trouver (localiser), Reconnaître et la carte retournée (nommer). correct :
 * juste du premier coup, sans aide.
 */
export interface ReponseJouee {
  id: string;
  sens: 'localiser' | 'nommer';
  correct: boolean;
  aide: 'voir' | 'passer' | null;
  reponse: string | null;
  via: Via | null;
  zoom: number | null;
  distance_km: number | null;
  duree_ms: number;
}

/** Une question de séance (src/vues/seance.ts) : Trouver, le QCM de Reconnaître ou la carte retournée. */
export interface QuestionPilotee {
  id: string;
  forme: 'trouver' | 'qcm' | 'retournee';
  /** Avant la question : la carte au monde entier, cadrée sur cette emprise (rappel d'une grappe), ou laissée au joueur. */
  cadrer: Emprise | 'monde' | null;
  /** « Je connais déjà » proposé (QCM d'un pays nouveau). */
  connu: boolean;
}

/** Une séance en cours, vue de Toucher : les questions, les réponses et le bilan viennent d'elle. */
export interface PiloteSeance {
  /** La question à poser ; null : la séance est finie. */
  question(): QuestionPilotee | null;
  /** « 3 / 14 ». */
  compte(): string;
  /** La réponse à la question courante (journal, état) ; rend la ligne discrète (« Revient dans 3 j »). */
  repondre(r: ReponseJouee): string;
  /** « Je connais déjà » sur la question courante. */
  connu(): void;
  /** Fin de la séance (« Terminer » ou file vide). */
  terminer(): void;
  /** Le bilan de la séance dans `el` (« Continuer », « Carte »). */
  bilan(el: HTMLElement, actions: { continuer(): void; carte(): void }): void;
}

/** Ce que Toucher demande : la Révision du jour, ou Apprendre sur une série. */
export type DemandeSeance = { sorte: 'revision' } | { sorte: 'apprendre'; serie: Serie };

/** Une séance refusée : pourquoi (« La grappe du jour est déjà apprise… ») et les révisions qui restent. */
export interface RefusSeance {
  refus: string;
  reviser: number;
  /** Pays de la grappe du jour, commencée et pas finie, qui restent : la Révision du jour les reprend (« Les finir · n »). */
  finir?: number;
}

export interface FabriqueSeances {
  ouvrir(d: DemandeSeance): PiloteSeance | RefusSeance;
}

const T = textes.toucher;
const nEssais = (n: number) => remplir(n > 1 ? T.essais : T.essai_un, { n });

/** Exercice : localiser (toucher la zone nommée) ou nommer (la zone allumée, quatre noms). */
export type Mode = 'localiser' | 'nommer';

export interface VueEssai extends Vue {
  /**
   * Une partie de cet exercice sur cette série (choisie dans Jouer ou ⚙), son
   * terrain chargé et ses cibles : la partie en cours est abandonnée.
   * Apprendre : une séance sur la série (sa grappe suivante).
   */
  lancer(l: Lancement, s: Serie, t: Terrain, ids: string[]): void;
  /** La Révision du jour (Jouer, en tête d'Entraînement) : une séance, sans adresse dans l'arbre. */
  reviser(): void;
}

export interface OptionsEssai {
  /** Vers Jouer, à ce niveau (son adresse) : main.ts remonte l'historique s'il y mène. */
  versJouer(cible: string): void;
  /** « Carte » du bilan d'une séance : l'accueil. */
  versCarte?(): void;
  /** Les séances (Apprendre, Révision du jour) ; sans elles, Apprendre ne fait rien. */
  seances?: FabriqueSeances;
  /** Parties libres (Trouver, Reconnaître hors séance, D11) : le journal de chaque partie lancée, ou null. */
  libre?(l: Lancement | null, t: Terrain): ((r: ReponseJouee) => void) | null;
}

/** Une question de Trouver finie, pour le journal. */
const deTrouver = (r: Resultat): ReponseJouee => ({
  id: r.id,
  sens: 'localiser',
  correct: r.premier,
  aide: r.vu ? 'voir' : r.juste ? null : 'passer',
  reponse: r.premier ? null : r.reponse,
  via: r.premier ? r.via : null,
  zoom: r.zoom,
  distance_km: r.distance_km,
  duree_ms: r.premier_ms,
});

/** Une réponse au QCM, pour le journal. */
const deNommer = (r: ReponseNommer): ReponseJouee => ({
  id: r.id,
  sens: 'nommer',
  correct: r.juste,
  aide: null,
  reponse: r.juste ? null : r.choisi,
  via: null,
  zoom: r.zoom,
  distance_km: null,
  duree_ms: r.temps_ms,
});

export function vueEssai(ctx: ContexteVue, o: OptionsEssai): VueEssai {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const voir = creer('button', { type: 'button', class: 'secondary', id: 'essai-voir' }, T.voir);
  const passer = creer('button', { type: 'button', class: 'secondary', id: 'essai-passer' }, T.passer);
  const terminer = creer('button', { type: 'button', class: 'secondary', id: 'essai-terminer' }, T.terminer);
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-essai' },
    creer('div', { class: 'essai-ligne' }, consigne, compte),
    retro,
    creer('div', { class: 'essai-actions' }, voir, passer, terminer),
  );
  const bilan = creer('div', { class: 'essai-bilan panel', id: 'essai-bilan' });
  barre.hidden = true;
  bilan.hidden = true;
  ctx.zone.append(barre, bilan);

  /** La partie lancée (Jouer ou ⚙) : son exercice, sa série et sa place dans l'arbre (« Autre série »). */
  let lancement: Lancement | null = null;
  let mode: Mode = 'localiser';
  let serie: Serie | null = null;
  /** Le bilan était affiché quand on a quitté la vue : il revient au retour. */
  let bilanAuRetour = false;

  /** Les actions du bilan (Trouver et Reconnaître) : la même partie, ou les séries de Jouer. */
  function actionsBilan(): HTMLElement {
    const recommencer = creer('button', { type: 'button', id: 'essai-recommencer' }, T.recommencer);
    const autre = creer('button', { type: 'button', class: 'secondary', id: 'essai-autre' }, T.autre_serie);
    recommencer.addEventListener('click', () => {
      if (serie) demarrer(serie, t, idsSerie(serie, t));
    });
    autre.addEventListener('click', () => {
      arreter();
      bilanAuRetour = false;
      o.versJouer(lancement ? adresse(niveauDe(lancement, 'series')) : 'jouer');
    });
    return creer('div', { class: 'essai-actions' }, recommencer, autre);
  }
  const nommer = vueNommer(ctx, { bilan, actions: actionsBilan });
  const retournee = vueRetournee(ctx);
  /** La séance en cours (Apprendre, Révision du jour) : elle pose les questions et fait le bilan. */
  let pilote: PiloteSeance | null = null;
  /** Ce qui l'a lancée (« Continuer » en relance une). */
  let demande: DemandeSeance | null = null;
  /** Le journal de la partie libre en cours (D11), ou null. */
  let journal: ((r: ReponseJouee) => void) | null = null;
  /** Le terrain de la partie : sa carte reçoit marques et notes, ses données donnent les noms. */
  let t: Terrain = ctx.terrains.monde;
  let cibles: string[] = [];
  let i = 0;
  let essais = 0;
  let premierFaux: number | null = null;
  let vu = false;
  /** La première réponse de la question (toucher, « Voir », « Passer ») : ce que le journal en garde. */
  let premiere: { ms: number; zoom: number; reponse: string | null; via: Via | null } | null = null;
  let debut = 0;
  let enAttente = 0;
  /** Le « juste » affiché pendant enAttente, avant la question suivante. */
  let resEnAttente: Resultat | null = null;
  let resultats: Resultat[] = [];
  /**
   * Les marques de la question en cours, telles que posées : rejouées au retour
   * dans la vue, que les autres vues ont effacées entre-temps (la cible révélée
   * par « Voir » ou par un faux reste montrée, comme vu reste vrai). L'anneau
   * aussi tel quel : jugé de nouveau après le vol de « Voir », la zone n'est
   * plus petite et il disparaîtrait.
   */
  let marques: { id: string; classe: string; anneau: boolean }[] = [];

  const courante = () => cibles[i];

  function effacer(): void {
    t.carte.effacerMarques();
    marques = [];
  }
  function poser(m: (typeof marques)[number]): void {
    marques.push(m);
    t.carte.marquer(m.id, m.classe);
    if (m.anneau) t.carte.anneau(m.id, m.classe);
  }
  /** `anneau` : un anneau autour de la zone si elle est petite à l'écran (anneauSiPetite). */
  const marquer = (id: string, classe: string, anneau = false) => poser({ id, classe, anneau: anneau && estPetite(t, id) });

  // `reprise` (retour dans la vue) : la même question, ses essais, son « Voir »
  // et son premier faux gardés (ils font la note), son message et ses marques
  // remontrés ; le temps repart, comme Nommer.
  function afficherQuestion(reprise = false): void {
    const id = courante();
    const aRejouer = reprise ? marques : [];
    effacer();
    if (!id) return pilote ? prochaine() : finir();
    consigne.replaceChildren(T.consigne, creer('strong', {}, nomDe(t.donnees, id)));
    consigne.dataset.cible = id;
    compte.textContent = pilote ? pilote.compte() : `${i + 1} / ${cibles.length}`;
    if (!reprise) {
      retro.textContent = '';
      retro.className = 'essai-retro';
      essais = 0;
      premierFaux = null;
      vu = false;
      premiere = null;
    }
    for (const m of aRejouer) poser(m);
    debut = performance.now();
  }

  // Un « juste » encore affiché quand on quitte la vue ou termine compte quand
  // même : il était perdu, et la question revenait (bloquée, enAttente restant vrai).
  function validerEnAttente(): void {
    clearTimeout(enAttente);
    enAttente = 0;
    if (!resEnAttente) return;
    resultats.push(resEnAttente);
    resEnAttente = null;
    i++;
    // La question suivante part de zéro, même reposée en reprise (afficherQuestion(true)) :
    // ni essais, ni « Voir », ni premier faux, ni le « juste » et sa marque.
    essais = 0;
    premierFaux = null;
    vu = false;
    premiere = null;
    marques = [];
    retro.textContent = '';
    retro.className = 'essai-retro';
  }

  function suivante(r: Resultat): void {
    resultats.push(r);
    i++;
    afficherQuestion();
  }

  /** La première réponse de la question, une fois : temps, échelle, ce que la carte désignait. */
  function noterPremiere(reponse: string | null = null, via: Via | null = null): void {
    premiere ??= { ms: performance.now() - debut, zoom: t.carte.transfo.k, reponse, via };
  }

  function resultat(id: string, juste: boolean): Resultat {
    noterPremiere();
    const p = premiere as NonNullable<typeof premiere>;
    return {
      id,
      essais,
      juste,
      premier: juste && essais === 1 && !vu,
      vu,
      temps_ms: performance.now() - debut,
      distance_km: premierFaux,
      reponse: p.reponse,
      via: p.via,
      zoom: p.zoom,
      premier_ms: p.ms,
    };
  }

  /** Une question finie : au journal de la partie libre, ou à la séance (rend sa ligne discrète). */
  function rapporter(r: Resultat): string {
    const j = deTrouver(r);
    if (pilote) return pilote.repondre(j);
    journal?.(j);
    return '';
  }

  // --- Séance (Apprendre, Révision du jour) : les questions viennent du pilote. ---

  function lancerSeance(d: DemandeSeance): void {
    arreter();
    bilanAuRetour = false;
    demande = d;
    serie = d.sorte === 'apprendre' ? d.serie : null;
    t = ctx.terrains.monde;
    ctx.terrains.montrer(t.nom);
    const r = o.seances?.ouvrir(d);
    if (!r) return;
    if ('refus' in r) return refuser(r);
    pilote = r;
    resultats = [];
    prochaine();
  }

  /** La question suivante de la séance, dans sa forme : Trouver, QCM ou carte retournée ; le bilan à la fin. */
  function prochaine(): void {
    const p = pilote;
    if (!p) return;
    nommer.arreter();
    retournee.arreter();
    barre.hidden = true;
    cibles = [];
    i = 0;
    const q = p.question();
    if (!q) return finirSeance();
    if (q.forme === 'trouver') {
      cibles = [q.id];
      barre.hidden = false;
      // Le cadrage de la séance (décision « Cadrage et disques en séance ») : jamais par question.
      if (q.cadrer === 'monde') t.carte.zoomer({ k: 1, x: 0, y: 0 });
      else if (q.cadrer) t.carte.cadrer(q.cadrer, barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top);
      return afficherQuestion();
    }
    const terminer = () => finirSeance();
    if (q.forme === 'qcm')
      return nommer.demarrer(t, '', [q.id], {
        compte: () => p.compte(),
        surReponse: (r) => p.repondre(deNommer(r)),
        surFin: prochaine,
        terminer,
        ...(q.connu
          ? {
              connu: () => {
                p.connu();
                prochaine();
              },
            }
          : {}),
      });
    retournee.poser(t, q.id, {
      compte: () => p.compte(),
      surReponse: (r) => p.repondre({ id: r.id, sens: 'nommer', correct: r.savais, aide: null, reponse: null, via: null, zoom: r.zoom, distance_km: null, duree_ms: r.temps_ms }),
      surFin: prochaine,
      terminer,
    });
  }

  /** Fin de séance (« Terminer », file vide) : les réponses données comptent, son bilan. */
  function finirSeance(): void {
    const p = pilote;
    if (!p) return;
    // Un Trouver déjà répondu (toucher faux, « Voir ») et pas encore trouvé : il compte, comme un « Passer » (Again).
    const id = courante();
    if (id && premiere && !resEnAttente) rapporter(resultat(id, false));
    validerEnAttente();
    nommer.arreter();
    retournee.arreter();
    p.terminer();
    pilote = null;
    cibles = [];
    barre.hidden = true;
    effacer();
    const d = demande;
    p.bilan(bilan, {
      continuer: () => {
        if (d) lancerSeance(d);
      },
      carte: () => {
        arreter();
        bilanAuRetour = false;
        o.versCarte?.();
      },
    });
    bilan.hidden = false;
  }

  /** Apprendre sans rien à apprendre aujourd'hui : le dire, et proposer les révisions qui restent ou Trouver. */
  function refuser(r: RefusSeance): void {
    const s = serie;
    const l = lancement;
    const boutons: HTMLElement[] = [];
    // La Révision du jour fait les révisions puis reprend la grappe entamée : un seul bouton.
    if (r.finir || r.reviser > 0) {
      const b = r.finir
        ? creer('button', { type: 'button', id: 'seance-finir' }, remplir(textes.seance.finir, { n: r.finir }))
        : creer('button', { type: 'button', id: 'seance-reviser' }, remplir(textes.seance.reviser, { n: r.reviser }));
      b.addEventListener('click', () => lancerSeance({ sorte: 'revision' }));
      boutons.push(b);
    }
    if (s && l) {
      const b = creer('button', { type: 'button', class: r.finir || r.reviser > 0 ? 'secondary' : '', id: 'seance-trouver' }, textes.seance.trouver);
      b.addEventListener('click', () => {
        lancement = { ...l, mode: 'localiser' };
        mode = 'localiser';
        demarrer(s, ctx.terrains.monde, idsSerie(s, ctx.terrains.monde));
      });
      boutons.push(b);
    }
    const autre = creer('button', { type: 'button', class: 'secondary', id: 'essai-autre' }, T.autre_serie);
    autre.addEventListener('click', () => {
      arreter();
      bilanAuRetour = false;
      o.versJouer(lancement ? adresse(niveauDe(lancement, 'series')) : 'jouer');
    });
    boutons.push(autre);
    bilan.replaceChildren(
      creer('h2', {}, s ? remplir(textes.seance.titre_apprendre, { serie: nomSerie(s.id) }) : textes.seance.titre_revision),
      creer('p', { class: 'hint' }, r.refus),
      creer('div', { class: 'essai-actions' }, ...boutons),
    );
    bilan.hidden = false;
  }

  /** La partie en cours (ou son bilan) abandonnée : rien à l'écran, la carte du monde. */
  function arreter(): void {
    clearTimeout(enAttente);
    enAttente = 0;
    resEnAttente = null;
    cibles = [];
    nommer.arreter();
    retournee.arreter();
    pilote = null;
    journal = null;
    barre.hidden = true;
    bilan.hidden = true;
    effacer();
    ctx.terrains.montrer('monde');
  }

  /** Une partie neuve sur cette série (un nouveau tirage), dans l'exercice de la partie lancée. */
  function demarrer(s: Serie, terrain: Terrain, ids: string[]): void {
    arreter();
    serie = s;
    t = terrain;
    ctx.terrains.montrer(t.nom);
    const j = o.libre?.(lancement, t) ?? null;
    journal = j;
    if (mode === 'nommer') return nommer.demarrer(t, nomSerie(s.id), melanger(ids), { surReponse: (r) => void j?.(deNommer(r)) });
    cibles = melanger(ids);
    i = 0;
    resultats = [];
    barre.hidden = false;
    afficherQuestion();
  }

  function finir(): void {
    if (pilote) return finirSeance();
    validerEnAttente();
    // Partie close (même par « Terminer ») : revenir à la vue ramène au choix.
    cibles = [];
    barre.hidden = true;
    effacer();
    const d = t.donnees;
    const n = resultats.length;
    const premiers = resultats.filter((r) => r.premier).length;
    const justes = resultats.filter((r) => r.juste).length;
    const temps = mediane(resultats.filter((r) => r.juste).map((r) => r.temps_ms));
    const rates = resultats.filter((r) => !r.premier);
    bilan.replaceChildren(
      creer('h2', {}, remplir(T.bilan_titre, { serie: nomSerie(serie?.id ?? '') })),
      creer(
        'p',
        { class: 'hint' },
        n
          ? remplir(T.bilan_resume, {
              premiers,
              justes,
              n,
              essais: (resultats.reduce((a, r) => a + r.essais, 0) / n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
              temps: temps == null ? '—' : fmtS(temps),
            })
          : T.bilan_vide,
      ),
      creer(
        'ul',
        { class: 'essai-rates' },
        ...rates.map((r) =>
          creer(
            'li',
            {},
            remplir(T.rate, {
              pays: nomDe(d, r.id),
              detail: r.juste ? `${nEssais(r.essais)}${r.vu ? T.rate_vu : ''}` : T.rate_passe,
              distance: r.distance_km != null ? remplir(T.rate_distance, { km: fmtKm(r.distance_km) }) : '',
              temps: fmtS(r.temps_ms),
            }),
          ),
        ),
      ),
      actionsBilan(),
    );
    bilan.hidden = false;
  }

  // « Voir » : la cible en vert, et la carte vole jusqu'à elle (en reculant
  // d'abord, pour voir où elle est), centrée au-dessus de la barre. Une
  // réponse trouvée ensuite ne compte pas comme juste du premier coup.
  voir.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    noterPremiere();
    vu = true;
    effacer();
    marquer(id, 'juste', true);
    t.carte.montrer(id, barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top);
  });
  passer.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    const r = resultat(id, false);
    rapporter(r);
    suivante(r);
  });
  terminer.addEventListener('click', finir);

  return {
    lancer(l, s, terrain, ids) {
      lancement = l;
      bilanAuRetour = false;
      if (l.mode === 'apprendre') return lancerSeance({ sorte: 'apprendre', serie: s });
      mode = l.mode === 'nommer' ? 'nommer' : 'localiser';
      demarrer(s, terrain, ids);
    },
    reviser() {
      lancement = null;
      lancerSeance({ sorte: 'revision' });
    },
    // Sans partie en cours ni bilan à remontrer : les exercices de la dernière
    // partie dans Jouer (ou Jouer tout court), au lieu d'un écran vide.
    aMontrer: () => nommer.enCours || retournee.enCours || cibles.length > 0 || bilanAuRetour,
    redirection() {
      if (nommer.enCours || retournee.enCours || cibles.length || bilanAuRetour) return null;
      return { cible: lancement ? adresse(niveauDe(lancement, 'exercices')) : 'jouer' };
    },
    activer() {
      // Une partie en cours (île comprise) reprend sur son terrain : le routeur vient de montrer le monde.
      if (nommer.enCours) nommer.reprendre();
      else if (retournee.enCours) retournee.reprendre();
      else if (cibles.length && i >= cibles.length) (pilote ? prochaine : finir)();
      else if (cibles.length) {
        ctx.terrains.montrer(t.nom);
        barre.hidden = false;
        afficherQuestion(true);
      } else if (bilanAuRetour) {
        ctx.terrains.montrer(t.nom);
        bilan.hidden = false;
      }
    },
    desactiver() {
      validerEnAttente();
      bilanAuRetour = !bilan.hidden;
      nommer.quitter();
      retournee.quitter();
      barre.hidden = true;
      bilan.hidden = true;
      // La carte seule : `marques` reste, pour les remontrer au retour.
      t.carte.effacerMarques();
      ctx.terrains.montrer('monde');
    },
    toucher(x, y, ev) {
      // Nommer : les touchers sur la carte ne répondent pas (cibles est vide).
      const id = courante();
      if (!id || enAttente || nommer.enCours || retournee.enCours) return;
      const carte = t.carte;
      ctx.mesures.toucher(ev, x, y, () => {
        // Juste : la cible en vert ; faux : ce que la carte désigne (pick) en rouge.
        const note = carte.noter(id, x, y);
        const r = note.pick;
        noterPremiere(note.juste ? null : (r?.id ?? null), note.juste ? note.via : null);
        essais++;
        effacer();
        if (note.juste) {
          marquer(id, 'juste');
          retro.className = 'essai-retro juste';
          retro.textContent = remplir(T.juste, {
            via: note.via === 'pastille' ? T.via_pastille : note.via === 'proche' ? T.via_proche : '',
            essais: nEssais(essais),
            temps: fmtS(performance.now() - debut),
          });
          const res = resultat(id, true);
          const ligne = rapporter(res);
          if (ligne) retro.append(creer('span', { class: 'seance-ligne' }, ` · ${ligne}`));
          resEnAttente = res;
          enAttente = window.setTimeout(() => {
            enAttente = 0;
            resEnAttente = null;
            suivante(res);
          }, 1200);
        } else {
          if (premierFaux == null && note.distance_km != null) premierFaux = note.distance_km;
          if (r && r.id !== id) marquer(r.id, 'faux');
          marquer(id, 'juste', true);
          retro.className = 'essai-retro faux';
          retro.textContent = remplir(T.faux, {
            touche: r ? nomDe(t.donnees, r.id) : T.la_mer,
            ou: note.distance_km != null ? remplir(T.faux_ou, { km: fmtKm(note.distance_km) }) : '',
            suite: textes.terrains[t.nom].faux_suite,
          });
        }
        return { pick: r, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
