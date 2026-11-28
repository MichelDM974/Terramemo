// Vue des épreuves classées (#14) : Chrono et Sans faute, choisies avec leur
// série dans Jouer (décision « Écran Jouer » : jouer.ts, puis lancer(), le
// terrain déjà chargé). Les lieux d'une série dans le désordre, 15 s et un seul
// toucher par question, chacune juste ou fausse (décision « Barème et
// classements » du 12/11/2026, #30 ; Minute, retiré ce jour-là, n'a plus de
// partie) :
// - Chrono : toute la série ; le score est la part de justes (« 190/195 ·
//   97 % »), le temps total départage ;
// - Sans faute : jusqu'à la première erreur ; le score est la part de la série
//   faite d'affilée (« 17 d'affilée sur 54 · 31 % »).
// La distance d'une erreur reste dans la rétroaction (« à 106 km du bord »),
// sans points. Record gardé sur l'appareil, classement en ligne par épreuve ;
// le général n'additionne que le Chrono. Quitter la vue pendant une partie
// l'abandonne : le temps ne se met pas en pause, et y revenir ramène à Jouer,
// qui le dit (redirection) ; « Abandonner » aussi. Après la dernière réponse (sa
// rétroaction), la quitter la finit (bilan au retour), et « Abandonner »
// aussi. Le bilan relance la même partie (« Rejouer ») ou ramène aux séries
// de Jouer (« Autre série »).
// La Réunion est une série de plus : sa carte remplace le monde.
// Le classement général et ceux de chaque épreuve ont leur vue (general.ts).
// L'énoncé, la rétroaction et le bilan viennent du rendu du sujet lancé
// (src/vues/sujets.ts), le même pour tous en épreuve.
// Un sujet aux énoncés en images (les drapeaux, étude J2 § 2.2 ; décision
// « Images d'une épreuve ») : la partie ne commence (première question, temps,
// partie comptée) qu'une fois toutes ses images chargées et décodées, demandées
// d'un coup dans l'ordre de ses questions ; au-delà de CHARGEMENT_VU_MS, la
// barre le dit (« Chargement des drapeaux… n / N »), et un échec propose
// « Réessayer » (seulement les images manquantes), sans délai maximal : tant
// qu'elles arrivent, on attend. Les autres sujets partent tout de suite. En
// filet, une question dont l'image n'est plus là quand elle est posée montre le
// gris 4:3 qui tient sa place, et son temps n'attend que son décodage, au plus
// ATTENTE_IMAGE_MS (un échec ou un réseau trop lent ne bloquent pas la partie).
// Les Voisins (J4, lot 2 ; D607 a) : un toucher par voisin (src/vues/voisins.ts,
// QuestionCarte), un délai par question, 4 s plus 2 s par voisin ; une question
// est juste quand tous ses voisins sont touchés sans faute.
import { DELAI_CHRONO_MS, type ScoreEpreuve } from '../epreuve/bareme';
import { enregistrerPartie, idEpreuve, PartieChrono, PartieSansFaute, type ModeEpreuve, type QuestionJouee } from '../epreuve/chrono';
import type { ChargerImage } from '../map/drapeaux';
import { estDomaine } from '../srs/fiches';
import { profilModifie } from '../sync/pont';
import type { Terrain } from '../terrains';
import { adresse, estEpreuve, niveauDe, type Lancement } from './arbre';
import { melanger, type Serie } from './cibles';
import { blocClassement, publierPartie } from './classement';
import { creerJauge } from './jauge';
import { anneauSiPetite, attendreEnonces, creer, croix, fmtKm, idsSerie, ligneFiche, optionsNoter, pastillesPour, poserEnonce, rendreFocusLigne, texteAdmis, type ContexteVue, type Vue } from './commun';
import { nomEpreuve } from './general';
import { fmtJustes, fmtTemps, nomMode, scoreCourt, scoreEntier, scoreLong } from './scores';
import { rendu, voisinsCharges, type RenduSujet } from './sujets';
import type { QuestionCarte } from './voisins';
import { remplir, textes } from './textes';

const T = textes.chrono;
const E = textes.epreuves;
/** Délai d'une question du Chrono et de Sans faute. */
const DELAI = DELAI_CHRONO_MS.localiser;
/** Durée de la rétroaction avant la question suivante (ms), hors du temps compté. */
const PAUSE_JUSTE_MS = 900;
const PAUSE_FAUX_MS = 1800;
/**
 * Au plus, l'attente de l'image d'un énoncé pas encore arrivée (un drapeau)
 * avant que le temps de sa question ne coure (ms) : au-delà, le gris 4:3
 * tient sa place et le temps part quand même.
 */
export const ATTENTE_IMAGE_MS = 3_000;
/**
 * Au départ d'une partie aux images, l'attente au-delà de laquelle la barre dit
 * le chargement (ms) : en deçà (tout est déjà en cache : l'APK, une partie
 * rejouée), rien ne clignote.
 */
export const CHARGEMENT_VU_MS = 150;
/**
 * Le texte du chargement (ou de son échec) écrit ce temps après l'apparition
 * de sa région polie (ms) : une région live qui apparaît déjà remplie n'est en
 * général pas lue par un lecteur d'écran (TalkBack), elle doit être là avant
 * que son texte change.
 */
export const ANNONCE_MS = 100;

/** L'image de l'énoncé posé, si elle n'est pas encore chargée (une <img> pas complète) ; null sinon, ou sans image. */
function imageEnAttente(el: HTMLElement): HTMLImageElement | null {
  const img = el.querySelector('img');
  return img && img.complete === false && typeof img.decode === 'function' ? img : null;
}

/** Une partie de l'épreuve sur ces cibles, dans l'ordre où les poser (déjà mélangées) ; `delais` : celui de chacune (les Voisins). */
function nouvellePartieDe(mode: ModeEpreuve, cibles: readonly string[], delais?: readonly number[]): PartieChrono {
  const max = delais ? Math.max(...delais) : DELAI;
  return mode === 'sansfaute' ? new PartieSansFaute(cibles, max, delais) : new PartieChrono(cibles, max, delais);
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
  /** L'horloge (ms depuis 1970) : date du record (sa semaine). Défaut : Date.now. */
  maintenant?: () => number;
  /** Ce qui charge et décode les images d'une partie avant son départ (défaut : new Image(), drapeaux.ts ; les tests : des images factices). */
  chargerImage?: ChargerImage;
}

export function vueChrono(ctx: ContexteVue, o: OptionsChrono): VueChrono {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const jauge = creerJauge();
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const abandonner = creer('button', { type: 'button', class: 'secondary', id: 'chrono-abandonner' }, T.abandonner);
  const ligne = creer('div', { class: 'essai-ligne' }, consigne, compte);
  const temps = jauge.el;
  /** Au départ d'une partie aux images, à la place de la question : leur chargement, ou son échec. */
  const chargement = creer('div', { class: 'chrono-chargement', id: 'chrono-chargement', 'aria-live': 'polite' });
  const reessayer = creer('button', { type: 'button', id: 'chrono-reessayer' }, T.reessayer);
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-chrono' },
    ligne,
    temps,
    retro,
    chargement,
    // « Réessayer » après « Abandonner » : caché dès son toucher, il ne laisse pas « Abandonner » glisser sous le doigt (un second toucher).
    creer('div', { class: 'essai-actions' }, abandonner, reessayer),
  );
  chargement.hidden = true;
  reessayer.hidden = true;
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
  /** Ce que montrent les questions et le bilan : le rendu du sujet lancé (sujets.ts), en épreuve (le même pour tous). */
  let rs: RenduSujet = rendu('pays', t.donnees, { epreuve: true });
  /** Change à chaque départ ou sortie : un chargement d'île (ou ses deux images) arrivé après ne lance rien. */
  let jeton = 0;
  let partie: PartieChrono | null = null;
  /** Les Voisins : la question à plusieurs touchers en cours ; null pour les autres sujets. */
  let qv: QuestionCarte | null = null;
  /** Les images de la partie sont attendues avant son départ (décision « Images d'une épreuve ») : pas encore de partie. */
  let enChargement = false;
  /** « Réessayer » : redemande les images qui ont échoué (celles de la partie en attente). */
  let reprendreChargement: (() => void) | null = null;
  const maintenant = o.maintenant ?? (() => Date.now());
  let debut = 0;
  /** Une question est posée et attend son toucher. */
  let ouverte = false;
  let minuterie = 0;
  let pause = 0;
  /** Au départ d'une partie aux images : CHARGEMENT_VU_MS avant de dire le chargement. */
  let chargementVu = 0;
  /** La région du chargement venue d'apparaître : ANNONCE_MS avant d'y écrire `aDire`, son dernier texte. */
  let annonce = 0;
  let aDire = '';
  /** Message de Jouer au retour dans la vue (partie abandonnée en la quittant). */
  let messageRetour = '';
  /** Le bilan au retour : affiché en quittant la vue, ou partie finie en la quittant (pendant la pause de sa dernière réponse). */
  let bilanAuRetour = false;
  /** Les exercices de la série de la partie, dans Jouer (Jouer tout court sans partie lancée). */
  const exercices = () => (lancement ? adresse(niveauDe(lancement, 'exercices')) : 'jouer');

  function arreterMinuteries(): void {
    clearTimeout(minuterie);
    jauge.arreter();
    clearTimeout(pause);
    clearTimeout(chargementVu);
    clearTimeout(annonce);
    minuterie = pause = chargementVu = annonce = 0;
  }

  /** Ce texte à la région du chargement : tout de suite, ou à la fin de son ANNONCE_MS si elle vient d'apparaître. */
  function dire(texte: string): void {
    aDire = texte;
    if (!annonce) chargement.textContent = texte;
  }

  /**
   * La barre en attente des images de la partie : ce texte à la place de la
   * question (le chargement, ou son échec avec « Réessayer ») ; null : la
   * question, sans rien de l'attente.
   */
  function montrerChargement(texte: string | null, echec = false): void {
    const attente = texte !== null;
    const apparait = attente && (chargement.hidden || barre.hidden);
    ligne.hidden = temps.hidden = retro.hidden = attente;
    chargement.hidden = !attente;
    chargement.classList.toggle('echec', echec);
    reessayer.hidden = !echec;
    if (attente) barre.hidden = false;
    clearTimeout(annonce);
    annonce = 0;
    if (!apparait) return dire(texte ?? '');
    // La région apparaît vide, son texte suit : sinon il ne serait pas lu (ANNONCE_MS).
    chargement.textContent = '';
    aDire = texte;
    annonce = window.setTimeout(() => {
      annonce = 0;
      chargement.textContent = aDire;
    }, ANNONCE_MS);
  }

  /**
   * Le compte de la barre : « 3 / 20 · 2 justes » au Chrono, « 3 / 20 · 2
   * d'affilée » à Sans faute (points = justes) ; `repondue` : la question posée
   * a sa réponse (rétroaction en cours).
   */
  function afficherCompte(repondue: boolean): void {
    if (!partie) return;
    const p = partie;
    const n = `${p.numero - (repondue ? 1 : 0)} / ${p.cibles.length}`;
    compte.textContent = `${n} · ${mode === 'sansfaute' ? remplir(E.sansfaute.compte, { n: p.points }) : fmtJustes(p.points)}`;
  }

  /** Plus de partie ni de bilan : la carte du monde, rien par-dessus. */
  function arreter(): void {
    arreterMinuteries();
    jeton++;
    partie = null;
    enChargement = false;
    reprendreChargement = null;
    montrerChargement(null);
    ouverte = false;
    barre.hidden = true;
    bilan.hidden = true;
    t.carte.effacerMarques();
    pastillesPour(ctx, null);
    ctx.terrains.montrer('monde');
  }

  /** Une partie neuve de l'épreuve sur cette série (un nouveau tirage). */
  function demarrer(s: Serie, terrain: Terrain, ids: string[]): void {
    arreter();
    const j = jeton;
    serie = s;
    t = terrain;
    rs = rendu(lancement?.sujet ?? 'pays', t.donnees, { epreuve: true });
    const r = rs;
    const commencer = (cibles: readonly string[]) => {
      if (j !== jeton) return;
      arreterMinuteries();
      enChargement = false;
      reprendreChargement = null;
      montrerChargement(null);
      const v = r.sujet === 'voisins' ? voisinsCharges() : null;
      partie = nouvellePartieDe(
        mode,
        cibles,
        v ? cibles.map((id) => v.delai(t, id)) : undefined,
      );
      barre.hidden = false;
      poser();
    };
    const lancer = () => {
      const cibles = melanger(ids);
      /** Le dernier progrès du chargement (« Chargement des drapeaux… 3 / 14 »), dit dès que la barre le montre. */
      let dit = '';
      // Les images de toute la partie (les drapeaux), demandées d'un coup dans l'ordre de ses questions et attendues
      // avant la première (décision « Images d'une épreuve ») ; un nouvel essai ne redemande que celles qui manquent.
      const attendre = (vu: boolean) => {
        const attente = attendreEnonces(
          r,
          cibles,
          (n, total) => {
            dit = remplir(T.chargement_images, { n, total });
            if (j === jeton && !chargement.hidden) dire(dit);
          },
          o.chargerImage,
        );
        if (!attente) return commencer(cibles);
        enChargement = true;
        if (vu) montrerChargement(dit);
        else chargementVu = window.setTimeout(() => montrerChargement(dit), CHARGEMENT_VU_MS);
        void attente.then((echouees) => {
          if (j !== jeton) return;
          if (!echouees.length) return commencer(cibles);
          clearTimeout(chargementVu);
          reprendreChargement = () => attendre(true);
          montrerChargement(T.chargement_echec, true);
        });
      };
      attendre(false);
    };
    if (t.nom === 'monde') {
      // La vue du monde : celle laissée par le zoom lent d'un QCM (le quiz, Reconnaître : décision « Zone allumée
      // montrée par un zoom lent ») ouvrirait l'épreuve sur la région de sa dernière zone.
      t.carte.vueEntiere();
      return lancer();
    }
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
    // Une épreuve des mers : sans les pastilles des micro-États (décision du 16/11).
    pastillesPour(ctx, rs.sujet);
    qv = rs.sujet === 'voisins' ? voisinsCharges()!.question(t, id, rs) : null;
    poserEnonce(consigne, qv ? qv.enonce() : rs.enonce(id));
    consigne.dataset.cible = id;
    afficherCompte(false);
    retro.textContent = '';
    retro.className = 'essai-retro';
    // Le pays des voisins allumé, la carte sur lui : le temps court pendant le vol (S603).
    qv?.poser(barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top);
    const p = partie;
    const ms = p.delaiCourant;
    const ouvrir = () => {
      debut = performance.now();
      ouverte = true;
      jauge.partir(ms, debut);
      minuterie = window.setTimeout(expirer, ms);
    };
    const img = imageEnAttente(consigne);
    if (!img) return ouvrir();
    // L'image pas encore là (préchargée au départ, mais le réseau traîne) : le gris tient sa place, la jauge pleine
    // attend sans courir, et aucun toucher ne compte (ouverte reste faux) ; la rétroaction dit l'attente. Son décodage,
    // son échec ou ATTENTE_IMAGE_MS ouvrent la question, une fois, si la partie n'a ni changé ni avancé entre-temps :
    // décodée, la rétroaction s'efface ; sinon elle dit que le temps court sans l'image (effacée si elle arrive avant
    // la réponse).
    jauge.pleine(ms);
    retro.textContent = T.image_attente;
    const j = jeton;
    let ouverteDeja = false;
    const enfin = (decodee: boolean) => {
      if (j !== jeton || partie !== p || p.courante !== id) return;
      if (ouverteDeja || ouverte) {
        // Arrivée après coup, la question ouverte et pas encore répondue : le message d'absence n'a plus lieu d'être.
        if (decodee && ouverte && retro.textContent === T.image_absente) retro.textContent = '';
        return;
      }
      ouverteDeja = true;
      clearTimeout(minuterie);
      retro.textContent = decodee ? '' : T.image_absente;
      ouvrir();
    };
    minuterie = window.setTimeout(() => enfin(false), ATTENTE_IMAGE_MS);
    img.decode().then(
      () => enfin(true),
      () => enfin(false),
    );
  }

  function apres(q: QuestionJouee): void {
    ouverte = false;
    clearTimeout(minuterie);
    jauge.figer();
    afficherCompte(true);
    pause = window.setTimeout(poser, q.juste ? PAUSE_JUSTE_MS : PAUSE_FAUX_MS);
  }

  /** Le délai de la question est écoulé : une erreur. */
  function expirer(): void {
    const id = partie?.courante;
    if (!partie || !id || !ouverte) return;
    const q = partie.expirer();
    jauge.vide();
    retro.className = 'essai-retro faux';
    // Les voisins : les trouvés restent, les manqués montrés.
    if (qv) {
      retro.textContent = qv.arreter(true);
      return apres(q);
    }
    t.carte.effacerMarques();
    t.carte.marquer(id, 'juste');
    anneauSiPetite(t, id, 'juste');
    retro.textContent = rs.expire(id);
    apres(q);
  }

  /**
   * Les lignes du score du bilan (titre de score, détail) : « 190/195 · 97 % »
   * et le temps total au Chrono ; « 17 d'affilée sur 54 · 31 % » (ou « Sans
   * faute : 54 sur 54 ! ») et le temps des justes à Sans faute.
   */
  function lignesScore(epreuve: string, score: ScoreEpreuve, total: number): [string, string] {
    if (mode === 'sansfaute')
      return [
        score.justes === total ? remplir(E.sansfaute.parfait, { total }) : scoreEntier(epreuve, score),
        remplir(E.sansfaute.detail, { temps: fmtTemps(score.temps_ms) }),
      ];
    return [scoreCourt(epreuve, score), remplir(T.bilan_detail, { temps: fmtTemps(score.temps_ms) })];
  }

  function finir(): void {
    arreterMinuteries();
    ouverte = false;
    barre.hidden = true;
    t.carte.effacerMarques();
    pastillesPour(ctx, null);
    if (!partie || !serie) return arreter();
    const r = rs;
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
        ? remplir(T.bilan_expire, { pays: r.nomBilan(q.id, 'localiser') })
        : // Sans distance (une faute des Voisins, un toucher hors du globe) : le pays touché seul.
          q.distance_km == null
          ? remplir(E.bilan_faux_touche, { pays: r.nomBilan(q.id, 'localiser'), touche: r.touche(q.touche) })
          : remplir(E.bilan_faux, {
            pays: r.nomBilan(q.id, 'localiser'),
            touche: r.touche(q.touche),
            km: fmtKm(q.distance_km),
          });
    const s = serie;
    const [ligneScore, detail] = lignesScore(epreuve, score, partie.cibles.length);
    // Une erreur touchée : la fiche de son lieu, sur le terrain de la partie (#34, lot F6).
    const terrain = t.nom;
    const ouvrir = ctx.ouvrirFiche;
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
      // « Chrono · Afrique », « Chrono · Capitales · Afrique » (nomEpreuve, étude J2 § 3.2).
      creer('h2', {}, remplir(T.bilan_titre, { mode: nomMode(mode), serie: nomEpreuve(epreuve) })),
      creer('p', { class: 'chrono-score' }, ligneScore),
      creer('p', { class: 'hint' }, detail),
      creer(
        'p',
        { class: b.nouveau ? 'chrono-record nouveau' : 'chrono-record' },
        b.nouveau
          ? b.ancien
            ? remplir(T.nouveau_record_bat, { score: scoreLong(epreuve, b.ancien) })
            : T.premier_record
          : remplir(T.record_a_battre, { score: scoreLong(epreuve, b.record) }),
      ),
      creer(
        'div',
        { class: 'essai-actions' },
        creer('button', { type: 'button', id: 'chrono-rejouer' }, T.rejouer),
        creer('button', { type: 'button', class: 'secondary', id: 'chrono-autre' }, T.autre_serie),
      ),
      blocClassement(epreuve, T.classement_titre, (pseudo) => publierPartie(pseudo, epreuve, bp)),
      ...(manquees.length
        ? [creer('ul', { class: 'essai-rates' }, ...manquees.map((q) => ligneFiche(q.id, r.lieu(q.id), ligne(q), ouvrir && (() => ouvrir(terrain, q.id)))))]
        : []),
    );
    bilan.querySelector('#chrono-rejouer')?.addEventListener('click', () => demarrer(s, t, idsSerie(s, t)));
    bilan.querySelector('#chrono-autre')?.addEventListener('click', () => {
      arreter();
      o.versJouer(lancement ? adresse(niveauDe(lancement, 'series')) : 'jouer');
    });
    partie = null;
    bilan.hidden = false;
    // Une session perdue pendant la partie : l'écran de connexion maintenant, par-dessus le bilan (avant « Rejouer »).
    ctx.finDePartie?.();
  }

  // La dernière réponse donnée (pause de sa rétroaction) : il n'y a plus rien
  // à abandonner, la partie va au bilan comme à la fin de la pause. Sinon,
  // retour aux exercices de la série dans Jouer, qui dit l'abandon.
  abandonner.addEventListener('click', () => {
    if (partie?.finie) return finir();
    arreter();
    o.versJouer(exercices(), T.abandon);
  });
  reessayer.addEventListener('click', () => reprendreChargement?.());

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
      // Revenu d'une fiche ouverte depuis ce bilan (#34, lot F6) : le focus à la ligne touchée.
      rendreFocusLigne(bilan);
    },
    desactiver() {
      // La dernière réponse donnée (pause de sa rétroaction) : la partie est
      // finie, elle va au bilan (record, publication) comme sans la sortie.
      if (partie?.finie) finir();
      bilanAuRetour = !bilan.hidden;
      // Le temps ne se met pas en pause : une partie quittée est abandonnée (de même pendant le chargement de ses images).
      const enCours = partie !== null || enChargement;
      arreter();
      messageRetour = enCours ? T.abandon : '';
    },
    toucher(x, y, ev) {
      const id = partie?.courante;
      if (!partie || !id || !ouverte) return;
      // La minuterie a du retard : le temps était écoulé avant ce toucher.
      if (performance.now() - debut >= partie.delaiCourant) return expirer();
      const carte = t.carte;
      const v = qv;
      // Les voisins : chaque toucher dit le compte ; seule la fin de la question (tous trouvés, une faute) y répond.
      if (v)
        return ctx.mesures.toucher(ev, x, y, () => {
          const c = v.toucher(x, y);
          retro.className = `essai-retro ${c.classe}`;
          retro.textContent = c.texte;
          if (c.fin) apres(partie!.repondre(v.faute, c.juste, null, performance.now() - debut));
          return { pick: c.pick, cible: id, juste: c.juste };
        });
      ctx.mesures.toucher(ev, x, y, () => {
        const temps_ms = performance.now() - debut;
        // Les zones admises de la carte (zones contestées et enclaves, admises en épreuve aussi depuis le
        // 09/11/2026 : décision « Zones contestées et enclaves »), plus celles du sujet (D36 i sous Capitales).
        const note = carte.noter(id, x, y, optionsNoter(rs, t, id));
        const r = note.pick;
        const q = partie!.repondre(r?.id ?? null, note.juste, note.distance_km, temps_ms);
        carte.effacerMarques();
        carte.marquer(id, 'juste');
        if (q.juste) {
          retro.className = 'essai-retro juste';
          const admis = texteAdmis(rs, id, note.admis);
          // Le pays de la question, que l'énoncé ne nommait pas (« La Paz (Bolivie) ») ; sans anneau en épreuve (D53 c).
          const lieu = rs.retro(id);
          retro.textContent = `${remplir(E.juste, { admis })}${lieu ? ` · ${lieu}` : ''}`;
        } else {
          if (r && r.id !== id) carte.marquer(r.id, 'faux');
          anneauSiPetite(t, id, 'juste');
          retro.className = 'essai-retro faux';
          // La distance au bord, sans points (décision « Barème et classements ») : de quoi apprendre de l'erreur.
          retro.textContent = remplir(E.faux, {
            touche: rs.touche(r?.id ?? null),
            km: note.distance_km == null ? '—' : fmtKm(note.distance_km),
            cible: rs.lieu(id),
          });
        }
        apres(q);
        return { pick: r, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
