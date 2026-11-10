// Vue des épreuves classées (#14) : Chrono, Sans faute et Minute, choisies avec
// leur série dans Jouer (décision « Écran Jouer » : jouer.ts, puis lancer(), le
// terrain déjà chargé). Les lieux d'une série dans le désordre, un seul toucher
// par question :
// - Chrono (décision « Points et classement ») : toute la série, 15 s par
//   question ; 1 000 points si juste, jusqu'à 500 selon la distance sinon
//   (src/epreuve/bareme.ts) ;
// - Sans faute (décision « Sans faute et Minute ») : 15 s par question,
//   jusqu'à la première erreur ; le score est le nombre de justes d'affilée ;
// - Minute (même décision) : le plus de justes en 60 s de réponse, une erreur
//   passe à la suivante ; la jauge est la minute, qui s'arrête pendant la
//   rétroaction (la correction ne compte pas), et la série vidée finit la partie.
// Record gardé sur l'appareil, classement en ligne par épreuve ; le général
// n'additionne que le Chrono. Quitter la vue pendant une partie l'abandonne : le
// temps ne se met pas en pause, et y revenir ramène à Jouer, qui le dit
// (redirection) ; « Abandonner » aussi. Après la dernière réponse (sa
// rétroaction), la quitter la finit (bilan au retour), et « Abandonner »
// aussi. Le bilan relance la même partie (« Rejouer ») ou ramène aux séries
// de Jouer (« Autre série »).
// La Réunion est une série de plus : sa carte remplace le monde, notée à 5 km.
// Le classement général et ceux de chaque épreuve ont leur vue (general.ts).
import { acceptesEnEpreuve, DELAI_CHRONO_MS, ECHELLES_KM, POINTS_JUSTE, type ScoreEpreuve } from '../epreuve/bareme';
import { DUREE_MINUTE_MS, enregistrerPartie, idEpreuve, PartieChrono, PartieMinute, PartieSansFaute, type ModeEpreuve, type QuestionJouee } from '../epreuve/chrono';
import { estDomaine } from '../srs/fiches';
import { profilModifie } from '../sync/pont';
import type { Terrain } from '../terrains';
import { adresse, estEpreuve, niveauDe, type Lancement } from './arbre';
import { melanger, nomSerie, type Serie } from './cibles';
import { blocClassement, publierPartie } from './classement';
import { anneauSiPetite, creer, croix, fmtKm, idsSerie, nomDe, texteAdmis, type ContexteVue, type Vue } from './commun';
import { fmtErreurs, fmtJustes, fmtPts, fmtTemps, nomMode, scoreCourt, scoreLong } from './scores';
import { remplir, textes } from './textes';

const T = textes.chrono;
const E = textes.epreuves;
/** Délai d'une question du Chrono et de Sans faute ; Minute n'en a pas, sa jauge est la minute. */
const DELAI = DELAI_CHRONO_MS.localiser;
/** Durée de la rétroaction avant la question suivante (ms), hors du temps compté. */
const PAUSE_JUSTE_MS = 900;
const PAUSE_FAUX_MS = 1800;

function nouvellePartieDe(mode: ModeEpreuve, ids: readonly string[], echelle_km: number): PartieChrono {
  if (mode === 'sansfaute') return new PartieSansFaute(melanger(ids), DELAI);
  if (mode === 'minute') return new PartieMinute(melanger(ids), DUREE_MINUTE_MS);
  return new PartieChrono(melanger(ids), DELAI, echelle_km);
}

function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export interface VueChrono extends Vue {
  /** Une partie de cette épreuve sur cette série (choisie dans Jouer), son terrain chargé et ses cibles. */
  lancer(l: Lancement, s: Serie, t: Terrain, ids: string[]): void;
}

export interface OptionsChrono {
  /** Vers Jouer, à ce niveau (son adresse), ce message à son statut : main.ts remonte l'historique s'il y mène. */
  versJouer(cible: string, message?: string): void;
  /** « × » du bilan (#18) : la carte ; sans elle, pas de « × ». */
  versCarte?(): void;
  /** L'horloge (ms depuis 1970) : date du record, et règle de notation de la partie (acceptesEnEpreuve). Défaut : Date.now. */
  maintenant?: () => number;
}

export function vueChrono(ctx: ContexteVue, o: OptionsChrono): VueChrono {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const jauge = creer('span', { class: 'chrono-jauge-reste' });
  const secondes = creer('span', { class: 'chrono-secondes' });
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const abandonner = creer('button', { type: 'button', class: 'secondary', id: 'chrono-abandonner' }, T.abandonner);
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-chrono' },
    creer('div', { class: 'essai-ligne' }, consigne, compte),
    creer('div', { class: 'chrono-temps' }, creer('span', { class: 'chrono-jauge' }, jauge), secondes),
    retro,
    creer('div', { class: 'essai-actions' }, abandonner),
  );
  const bilan = creer('div', { class: 'essai-bilan panel', id: 'chrono-bilan' });
  barre.hidden = true;
  bilan.hidden = true;
  ctx.zone.append(barre, bilan);

  /** La partie lancée dans Jouer : son épreuve, sa série et sa place dans l'arbre (retours à Jouer). */
  let lancement: Lancement | null = null;
  let mode: ModeEpreuve = 'chrono';
  let serie: Serie | null = null;
  /** Le terrain de la partie : sa carte reçoit marques et notes, ses données donnent les noms. */
  let t: Terrain = ctx.terrains.monde;
  /** Change à chaque départ ou sortie : un chargement d'île (ou ses deux images) arrivé après ne lance rien. */
  let jeton = 0;
  let partie: PartieChrono | null = null;
  const maintenant = o.maintenant ?? (() => Date.now());
  /**
   * La partie admet-elle les zones contestées et les enclaves (décision « Zones
   * contestées et enclaves ») ? Fixé à son départ, pour toutes ses réponses :
   * une partie à cheval sur le lundi 09/11/2026 0 h UTC se note d'une seule règle.
   */
  let acceptes = true;
  let debut = 0;
  /** Une question est posée et attend son toucher. */
  let ouverte = false;
  let minuterie = 0;
  let affichage = 0;
  let pause = 0;
  /** Message de Jouer au retour dans la vue (partie abandonnée en la quittant). */
  let messageRetour = '';
  /** Le bilan au retour : affiché en quittant la vue, ou partie finie en la quittant (pendant la pause de sa dernière réponse). */
  let bilanAuRetour = false;
  /** Les exercices de la série de la partie, dans Jouer (Jouer tout court sans partie lancée). */
  const exercices = () => (lancement ? adresse(niveauDe(lancement, 'exercices')) : 'jouer');

  function arreterMinuteries(): void {
    clearTimeout(minuterie);
    clearInterval(affichage);
    clearTimeout(pause);
    minuterie = affichage = pause = 0;
  }

  function figerJauge(): void {
    const t = getComputedStyle(jauge).transform;
    jauge.style.transition = 'none';
    jauge.style.transform = t === 'none' ? '' : t;
  }

  /** Le temps de la question posée (ms) : son délai, ou ce qui reste de la minute. */
  function limite(): number {
    return partie instanceof PartieMinute ? partie.reste : DELAI;
  }

  /** La jauge part de `plein` (1 : pleine) et se vide en `ms`. */
  function lancerJauge(plein: number, ms: number): void {
    jauge.style.transition = 'none';
    jauge.style.transform = `scaleX(${plein})`;
    jauge.getBoundingClientRect(); // l'état de départ s'applique avant la transition
    jauge.style.transition = `transform ${ms}ms linear`;
    jauge.style.transform = 'scaleX(0)';
  }

  function afficherSecondes(): void {
    const reste = Math.max(0, limite() - (performance.now() - debut));
    secondes.textContent = `${Math.ceil(reste / 1000)} s`;
  }

  /** Le compte de la barre ; `repondue` : la question posée a sa réponse (rétroaction en cours). */
  function afficherCompte(repondue: boolean): void {
    if (!partie) return;
    const p = partie;
    const n = `${p.numero - (repondue ? 1 : 0)} / ${p.cibles.length}`;
    if (mode === 'minute') {
      const justes = p.jouees.filter((q) => q.juste).length;
      compte.textContent = `${fmtJustes(justes)} · ${fmtErreurs(p.jouees.length - justes)}`;
    } else if (mode === 'sansfaute') compte.textContent = `${n} · ${scoreCourt(mode, p.points)}`;
    else compte.textContent = `${n} · ${remplir(T.points, { points: fmtPts(p.points) })}`;
  }

  /** Plus de partie ni de bilan : la carte du monde, rien par-dessus. */
  function arreter(): void {
    arreterMinuteries();
    jeton++;
    partie = null;
    ouverte = false;
    barre.hidden = true;
    bilan.hidden = true;
    t.carte.effacerMarques();
    ctx.terrains.montrer('monde');
  }

  /** Une partie neuve de l'épreuve sur cette série (un nouveau tirage). */
  function demarrer(s: Serie, terrain: Terrain, ids: string[]): void {
    arreter();
    const j = jeton;
    serie = s;
    t = terrain;
    const lancer = () => {
      partie = nouvellePartieDe(mode, ids, ECHELLES_KM[s.terrain]);
      // Une règle par partie, celle de son départ. Le record se range pourtant
      // dans la semaine de sa fin (enregistrerPartie) : une partie lancée le
      // dimanche 08/11 avant minuit UTC et finie après compte dans la semaine
      // du 09/11 avec le de fait strict. Accepté (relecture du lot 4) : une
      // minute, une fois.
      acceptes = acceptesEnEpreuve(maintenant());
      barre.hidden = false;
      poser();
    };
    if (t.nom === 'monde') return lancer();
    // L'île entière (zoom 1), peinte avant que le temps ne coure : deux images, puis la jauge.
    ctx.terrains.montrer(t.nom);
    t.carte.zoomer({ k: 1, x: 0, y: 0 });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (j === jeton) lancer();
      }),
    );
  }

  function poser(): void {
    arreterMinuteries();
    t.carte.effacerMarques();
    const id = partie?.courante;
    if (!partie || partie.finie || !id) return finir();
    consigne.replaceChildren(T.consigne, creer('strong', {}, nomDe(t.donnees, id)));
    consigne.dataset.cible = id;
    afficherCompte(false);
    retro.textContent = '';
    retro.className = 'essai-retro';
    debut = performance.now();
    ouverte = true;
    const ms = limite();
    lancerJauge(partie instanceof PartieMinute ? ms / partie.duree_ms : 1, ms);
    afficherSecondes();
    affichage = window.setInterval(afficherSecondes, 200);
    minuterie = window.setTimeout(expirer, ms);
  }

  function apres(q: QuestionJouee): void {
    ouverte = false;
    clearTimeout(minuterie);
    clearInterval(affichage);
    figerJauge();
    afficherCompte(true);
    pause = window.setTimeout(poser, q.juste ? PAUSE_JUSTE_MS : PAUSE_FAUX_MS);
  }

  /** Le temps de la question est écoulé (son délai, ou la minute). */
  function expirer(): void {
    const id = partie?.courante;
    if (!partie || !id || !ouverte) return;
    if (partie instanceof PartieMinute) {
      // La minute est finie : la question posée ne compte pas, droit au bilan.
      partie.terminer();
      return finir();
    }
    const q = partie.expirer();
    secondes.textContent = '0 s';
    t.carte.effacerMarques();
    t.carte.marquer(id, 'juste');
    anneauSiPetite(t, id, 'juste');
    retro.className = 'essai-retro faux';
    retro.textContent = mode === 'chrono' ? textes.terrains[t.nom].expire : textes.terrains[t.nom].expire_sans_points;
    apres(q);
  }

  /** Les lignes du score du bilan (titre de score, détail). */
  function lignesScore(score: ScoreEpreuve, total: number): [string, string] {
    if (mode === 'sansfaute')
      return [
        score.justes === total ? remplir(E.sansfaute.parfait, { total }) : remplir(E.sansfaute.score, { n: fmtPts(score.justes), total }),
        remplir(E.sansfaute.detail, { temps: fmtTemps(score.temps_ms) }),
      ];
    if (mode === 'minute')
      return [
        score.temps_ms < DUREE_MINUTE_MS
          ? remplir(E.minute.videe, { justes: fmtJustes(score.justes), total, temps: fmtTemps(score.temps_ms) })
          : remplir(E.minute.score, { justes: fmtJustes(score.justes) }),
        fmtErreurs(score.questions - score.justes),
      ];
    return [
      remplir(T.bilan_score, { points: fmtPts(score.points), max: fmtPts(score.questions * POINTS_JUSTE) }),
      remplir(T.bilan_detail, { justes: score.justes, n: score.questions, temps: fmtTemps(score.temps_ms) }),
    ];
  }

  function finir(): void {
    arreterMinuteries();
    ouverte = false;
    barre.hidden = true;
    t.carte.effacerMarques();
    if (!partie || !serie) return arreter();
    const d = t.donnees;
    const score = partie.score();
    // L'épreuve du sujet lancé (étude J2 § 3.2) : pays et communes gardent leur id.
    const epreuve = idEpreuve(serie.id, mode, lancement && estDomaine(lancement.sujet) ? lancement.sujet : 'pays');
    const bp = enregistrerPartie(stockage(), epreuve, score, maintenant());
    // Un record nouveau va au profil du compte (J1b, § 5.4 ; rien pour un invité).
    if (bp.toujours.nouveau || bp.semaine.nouveau) profilModifie('records');
    const b = bp.toujours;
    const manquees = partie.jouees.filter((q) => !q.juste);
    const ligne = (q: QuestionJouee) =>
      q.temps_ms == null
        ? remplir(T.bilan_expire, { pays: nomDe(d, q.id) })
        : remplir(mode === 'chrono' ? T.bilan_faux : E.bilan_faux, {
            pays: nomDe(d, q.id),
            touche: q.touche ? nomDe(d, q.touche) : T.la_mer,
            km: q.distance_km == null ? '—' : fmtKm(q.distance_km),
            points: fmtPts(q.points),
          });
    const s = serie;
    const [ligneScore, detail] = lignesScore(score, partie.cibles.length);
    const versCarte = o.versCarte;
    bilan.replaceChildren(
      // « × » : le bilan fermé pour de bon (comme « Autre série »), puis la carte.
      ...(versCarte
        ? [
            croix(() => {
              arreter();
              versCarte();
            }),
          ]
        : []),
      creer('h2', {}, remplir(T.bilan_titre, { mode: nomMode(mode), serie: nomSerie(s.id) })),
      creer('p', { class: 'chrono-score' }, ligneScore),
      creer('p', { class: 'hint' }, detail),
      creer(
        'p',
        { class: b.nouveau ? 'chrono-record nouveau' : 'chrono-record' },
        b.nouveau
          ? b.ancien
            ? remplir(T.nouveau_record_bat, { score: scoreLong(mode, b.ancien) })
            : T.premier_record
          : remplir(T.record_a_battre, { score: scoreLong(mode, b.record) }),
      ),
      creer(
        'div',
        { class: 'essai-actions' },
        creer('button', { type: 'button', id: 'chrono-rejouer' }, T.rejouer),
        creer('button', { type: 'button', class: 'secondary', id: 'chrono-autre' }, T.autre_serie),
      ),
      blocClassement(epreuve, T.classement_titre, (pseudo) => publierPartie(pseudo, epreuve, bp)),
      ...(manquees.length ? [creer('ul', { class: 'essai-rates' }, ...manquees.map((q) => creer('li', {}, ligne(q))))] : []),
    );
    bilan.querySelector('#chrono-rejouer')?.addEventListener('click', () => demarrer(s, t, idsSerie(s, t)));
    bilan.querySelector('#chrono-autre')?.addEventListener('click', () => {
      arreter();
      o.versJouer(lancement ? adresse(niveauDe(lancement, 'series')) : 'jouer');
    });
    partie = null;
    bilan.hidden = false;
  }

  // La dernière réponse donnée (pause de sa rétroaction) : il n'y a plus rien
  // à abandonner, la partie va au bilan comme à la fin de la pause. Sinon,
  // retour aux exercices de la série dans Jouer, qui dit l'abandon.
  abandonner.addEventListener('click', () => {
    if (partie?.finie) return finir();
    arreter();
    o.versJouer(exercices(), T.abandon);
  });

  return {
    lancer(l, s, terrain, ids) {
      lancement = l;
      mode = estEpreuve(l.mode) ? l.mode : 'chrono';
      messageRetour = '';
      bilanAuRetour = false;
      demarrer(s, terrain, ids);
    },
    // Sans bilan à remontrer : la partie quittée est abandonnée, Jouer le dit
    // aux exercices de sa série ; atteinte sans partie, Jouer tout court.
    // La partie quittée est abandonnée (le temps ne se met pas en pause) : seul un bilan reste à montrer.
    aMontrer: () => bilanAuRetour,
    redirection() {
      if (bilanAuRetour) return null;
      const message = messageRetour;
      messageRetour = '';
      return { cible: exercices(), message };
    },
    activer() {
      if (!bilanAuRetour) return;
      bilanAuRetour = false;
      ctx.terrains.montrer(t.nom);
      bilan.hidden = false;
    },
    desactiver() {
      // La dernière réponse donnée (pause de sa rétroaction) : la partie est
      // finie, elle va au bilan (record, publication) comme sans la sortie.
      if (partie?.finie) finir();
      bilanAuRetour = !bilan.hidden;
      // Le temps ne se met pas en pause : une partie quittée est abandonnée.
      const enCours = partie !== null;
      arreter();
      messageRetour = enCours ? T.abandon : '';
    },
    toucher(x, y, ev) {
      const id = partie?.courante;
      if (!partie || !id || !ouverte) return;
      // La minuterie a du retard : le temps était écoulé avant ce toucher.
      if (performance.now() - debut >= limite()) return expirer();
      const carte = t.carte;
      const d = t.donnees;
      ctx.mesures.toucher(ev, x, y, () => {
        const temps_ms = performance.now() - debut;
        const note = carte.noter(id, x, y, { acceptes });
        const r = note.pick;
        const q = partie!.repondre(r?.id ?? null, note.juste, note.distance_km, temps_ms);
        carte.effacerMarques();
        carte.marquer(id, 'juste');
        if (q.juste) {
          retro.className = 'essai-retro juste';
          const admis = texteAdmis(d, id, note.admis);
          retro.textContent = mode === 'chrono' ? remplir(T.juste, { admis, points: fmtPts(q.points) }) : remplir(E.juste, { admis });
        } else {
          if (r && r.id !== id) carte.marquer(r.id, 'faux');
          anneauSiPetite(t, id, 'juste');
          retro.className = 'essai-retro faux';
          retro.textContent = remplir(mode === 'chrono' ? T.faux : E.faux, {
            touche: r ? nomDe(d, r.id) : T.la_mer,
            km: note.distance_km == null ? '—' : fmtKm(note.distance_km),
            points: fmtPts(q.points),
          });
        }
        apres(q);
        return { pick: r, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
