// Vue du quiz général (étude J2 § 9.3 ; décision « Quiz général », barème du
// 12/11 ; lot 4b) : 20 questions tirées à parts égales dans les sujets livrés
// (src/quiz/tirage.ts), à 4 choix ou au toucher selon la difficulté, chacune
// avec son délai. Une barre : la consigne (le rendu du sujet, sujets.ts), le
// compte « 7 / 20 · 5 justes », la jauge (jauge.ts), la grille 2 × 2 des choix
// (cachée pour un toucher), la rétroaction et « Abandonner ».
// - QCM : la zone s'allume (allumerZone, nommer.ts) ; un toucher de la carte
//   est ignoré. Au facile, l'énoncé nomme le pays (D49 d : « Quelle est la
//   capitale du Japon ? »), la zone n'est qu'une aide.
// - Toucher : la vue du monde est remise avant la question (sinon la vue
//   laissée par un QCM montrerait la réponse).
// - Après chaque réponse : juste ou faux, la bonne réponse en vert, une pause,
//   puis la suivante (comme au Chrono).
// Images (décision « Images d'une épreuve ») : la partie attend au départ que
// toutes ses images (drapeaux des énoncés et des choix) soient chargées et
// décodées, « Chargement des drapeaux… n / N » au-delà de CHARGEMENT_VU_MS,
// « Réessayer » si l'une échoue, sans délai maximal ; l'attente de 3 s par
// question reste en filet. Fin (D55 a) : la partie compte dès que sa première
// question est montrée ; un abandon (« Abandonner », ou la vue quittée) publie
// le score acquis, les questions sans réponse valant 0 et tout leur délai ;
// abandonnée pendant le chargement, elle ne compte pas. Bilan : « 17/20 ·
// 85 % », le temps, le détail par sujet (« Capitales 4/5 »), les records de
// la difficulté (de toujours, de la semaine), son classement (hors du
// général), les ratés ; « Rejouer » (un nouveau tirage), « Autre difficulté »,
// la « × ». Les réponses n'entrent pas dans la mémoire (D51), comme celles
// des épreuves. Une page fermée en pleine partie (rechargée, onglet fermé,
// appli tuée) n'a pas de bilan : la partie en cours, gardée dans le stockage
// dès sa première question montrée, s'enregistre au démarrage suivant comme
// un abandon (reprendrePartieInterrompue), sinon recharger la page
// relancerait un tirage sans rien compter.
import type { ScoreEpreuve } from '../epreuve/bareme';
import { enregistrerPartie, idQuiz, modeEpreuve, vraisemblable, type BilanPartie, type QuestionJouee } from '../epreuve/chrono';
import { PartieQuiz } from '../epreuve/quiz';
import { capitalesChargees } from '../map/capitales';
import { attendreImages, drapeauxCharges, type ChargerImage } from '../map/drapeaux';
import { nomsMersCharges } from '../map/mers';
import type { Lieu } from '../map/types';
import { chargerDonneesQuiz, donneesQuizChargees } from '../quiz/donnees';
import { generateurs, type DonneesGenerateurs } from '../quiz/generateurs';
import { tirerPartie } from '../quiz/tirage';
import type { Difficulte, Generateur, Question, SujetQuiz } from '../quiz/types';
import { profilModifie } from '../sync/pont';
import { NIVEAU_QUIZ, adresse, nomDifficulte, nomQuiz, nomSujet } from './arbre';
import { ANNONCE_MS, ATTENTE_IMAGE_MS, CHARGEMENT_VU_MS } from './chrono';
import { blocClassement, lirePseudo, publierPartie } from './classement';
import { anneauSiPetite, anneauZone, chargementSujet, creer, croix, fmtKm, mersPosees, optionsNoter, poserContenu, poserEnonce, texteAdmis, zonesDuSujet, type ContexteVue, type Vue } from './commun';
import { creerJauge } from './jauge';
import { allumerZone } from './nommer';
import { NB_CHOIX } from './qcm';
import { fmtJustes, fmtTemps, scoreCourt, scoreLong } from './scores';
import { rendu, type RenduSujet } from './sujets';
import { remplir, textes } from './textes';

const Q = textes.quiz;
const T = textes.chrono;
const E = textes.epreuves;
const TT = textes.toucher;
const D = textes.drapeaux;
/** Durée de la rétroaction avant la question suivante (ms), hors du temps compté : celles du Chrono. */
const PAUSE_JUSTE_MS = 900;
const PAUSE_FAUX_MS = 1800;
/** Les difficultés du quiz dans Jouer : où ramènent « Autre difficulté » et un abandon pendant le chargement. */
const DIFFICULTES_JOUER = adresse(NIVEAU_QUIZ);

function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** La partie en cours, dès sa première question montrée : son épreuve et le score acquis (PartieQuiz.score). */
const CLE_EN_COURS = 'terramemo.quiz.en_cours';

interface PartieEnCours {
  epreuve: string;
  score: ScoreEpreuve;
}

/** Garde la partie en cours (null : la retire) ; sans stockage, ou s'il est refusé ou plein, rien. */
function garderEnCours(s: Storage | null, e: PartieEnCours | null): void {
  try {
    if (e) s?.setItem(CLE_EN_COURS, JSON.stringify(e));
    else s?.removeItem(CLE_EN_COURS);
  } catch {
    // Stockage plein ou refusé : la partie ne se retrouvera pas, comme sans stockage.
  }
}

/**
 * Une partie du quiz restée en cours (D55 a), la page fermée avant son bilan :
 * enregistrée comme un abandon, le score qu'elle avait à sa dernière réponse
 * (les questions sans réponse à 0 et tout leur délai), puis retirée. Un
 * record nouveau va au profil et se publie sous le pseudo de l'appareil (sans
 * pseudo, son choix publiera tout : publierTout). Datée du démarrage : une
 * date passée effacerait les records de la semaine en cours
 * (oublierSemainesPassees). Rend son bilan ; null sans partie, ou une entrée
 * illisible ou que les règles refuseraient (retirée aussi).
 */
export function reprendrePartieInterrompue(s: Storage | null = stockage(), date = Date.now()): BilanPartie | null {
  let brut: string | null = null;
  try {
    brut = s?.getItem(CLE_EN_COURS) ?? null;
  } catch {
    return null;
  }
  if (brut === null) return null;
  garderEnCours(s, null);
  let e: Partial<PartieEnCours> | null = null;
  try {
    e = JSON.parse(brut) as Partial<PartieEnCours> | null;
  } catch {
    return null;
  }
  const score = e?.score;
  const epreuve = e?.epreuve;
  if (typeof epreuve !== 'string' || modeEpreuve(epreuve) !== 'quiz' || !score || typeof score !== 'object') return null;
  const { points, justes, questions, temps_ms } = score;
  if (![points, justes, questions, temps_ms].every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  if (!vraisemblable(score, epreuve)) return null;
  const bp = enregistrerPartie(s, epreuve, { points, justes, questions, temps_ms }, date);
  if (bp.toujours.nouveau || bp.semaine.nouveau) profilModifie('records');
  const pseudo = lirePseudo();
  const aPublier = [bp.toujours, bp.semaine].some((b) => b.nouveau || b.progresPubliable);
  if (pseudo && aPublier) void publierPartie(pseudo, epreuve, bp).catch(() => undefined);
  return bp;
}

/**
 * Ce que le quiz doit charger avant sa partie (étude J2 § 9.3, « Préparation ») :
 * sa notoriété et ses paires de drapeaux proches (quiz/donnees.ts), les
 * capitales, le manifeste des drapeaux (sans les images : la vue les attend
 * au départ) et la couche marine, posée sur la carte du monde ; null si tout
 * est déjà là. Jouer l'appelle (statut, échec hors ligne : jouer.ts).
 */
export function preparerQuiz(ctx: Pick<ContexteVue, 'carte' | 'donnees'>): Promise<unknown> | null {
  const attentes = [donneesQuizChargees() ? null : chargerDonneesQuiz(), ...(['capitales', 'drapeaux', 'mers'] as const).map((s) => chargementSujet(s, ctx))].filter(
    (p): p is Promise<unknown> => p !== null,
  );
  return attentes.length ? Promise.all(attentes) : null;
}

/** Les générateurs des sujets prêts (quiz/generateurs.ts), sur les données déjà chargées par preparerQuiz ; [] sans la notoriété. */
export function generateursQuiz(ctx: Pick<ContexteVue, 'donnees'>): Generateur[] {
  const q = donneesQuizChargees();
  if (!q) return [];
  const d: DonneesGenerateurs = {
    pays: ctx.donnees.entites.map((e) => e.pays),
    noms: ctx.donnees.noms,
    notoriete: q.notoriete,
    capitales: capitalesChargees(),
    drapeaux: drapeauxCharges(),
    proches: q.proches,
    mers: mersPosees(ctx.donnees).map((e) => e.pays),
    nomsMers: nomsMersCharges(),
  };
  return generateurs(d);
}

export interface VueQuiz extends Vue {
  /** Une partie de cette difficulté, ses données chargées (preparerQuiz) : un nouveau tirage. */
  lancer(d: Difficulte): void;
}

export interface OptionsQuiz {
  /** Vers Jouer, à ce niveau (son adresse), ce message à son statut. */
  versJouer(cible: string, message?: string): void;
  /** « × » du bilan (#18) : la carte ; sans elle, pas de « × ». */
  versCarte?(): void;
  /** L'horloge (ms depuis 1970) : date du record (sa semaine). Défaut : Date.now. */
  maintenant?: () => number;
  /** Ce qui charge et décode les images d'une partie avant son départ (défaut : drapeaux.ts ; les tests : des images factices). */
  chargerImage?: ChargerImage;
  /** Le tirage d'une partie (défaut : tirerPartie sur generateursQuiz ; les tests : des questions fixées). */
  tirer?: (d: Difficulte) => Question[];
}

/** Les images de ces éléments pas encore chargées (une <img> pas complète) ; [] sans image. */
function imagesEnAttente(els: readonly HTMLElement[]): HTMLImageElement[] {
  return els.flatMap((el) => Array.from(el.querySelectorAll('img'))).filter((img) => img.complete === false && typeof img.decode === 'function');
}

export function vueQuiz(ctx: ContexteVue, o: OptionsQuiz): VueQuiz {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const jauge = creerJauge();
  const boutons = Array.from({ length: NB_CHOIX }, () => creer('button', { type: 'button', class: 'secondary nommer-choix' }));
  const grille = creer('div', { class: 'nommer-grille' }, ...boutons);
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const chargement = creer('div', { class: 'chrono-chargement', id: 'quiz-chargement', 'aria-live': 'polite' });
  const abandonner = creer('button', { type: 'button', class: 'secondary', id: 'quiz-abandonner' }, T.abandonner);
  const reessayer = creer('button', { type: 'button', id: 'quiz-reessayer' }, T.reessayer);
  const ligne = creer('div', { class: 'essai-ligne' }, consigne, compte);
  const barre = creer('div', { class: 'carte-barre essai', id: 'barre-quiz' }, ligne, jauge.el, grille, retro, chargement, creer('div', { class: 'essai-actions' }, abandonner, reessayer));
  const bilan = creer('div', { class: 'essai-bilan panel', id: 'quiz-bilan' });
  barre.hidden = true;
  bilan.hidden = true;
  chargement.hidden = true;
  reessayer.hidden = true;
  ctx.zone.append(barre, bilan);

  const t = ctx.terrains.monde;
  const maintenant = o.maintenant ?? (() => Date.now());
  // Une partie laissée en cours par la page d'avant compte d'abord (D55 a).
  reprendrePartieInterrompue(stockage(), maintenant());
  const tirer = o.tirer ?? ((d: Difficulte) => tirerPartie(generateursQuiz(ctx), d));
  let difficulte: Difficulte = 'facile';
  let partie: PartieQuiz | null = null;
  /** Le rendu de chaque sujet de la partie, en épreuve (le même pour tous), la capitale montrée étant celle du tirage. */
  let rendus = new Map<SujetQuiz, RenduSujet>();
  let zones: Record<'monde' | 'mers', ReturnType<typeof zonesDuSujet>> | null = null;
  /** Change à chaque départ ou sortie : un chargement d'images ou un décodage arrivé après ne lance rien. */
  let jeton = 0;
  let enChargement = false;
  let reprendreChargement: (() => void) | null = null;
  let chargementVu = 0;
  /** La région du chargement venue d'apparaître : ANNONCE_MS avant d'y écrire `aDire`, son dernier texte (comme au Chrono). */
  let annonce = 0;
  let aDire = '';
  let minuterie = 0;
  let pause = 0;
  let debut = 0;
  /** La question en cours attend sa réponse. */
  let ouverte = false;
  /**
   * Le numéro de la question à l'écran (poser) : celui d'un abandon au bilan.
   * Pendant la rétroaction, la partie est déjà à la suivante (partie.numero),
   * jamais montrée.
   */
  let posee = 0;
  /** La zone d'un QCM est petite à l'écran : un anneau l'entoure, aussi à la réponse. */
  let petite = false;
  let messageRetour = '';
  let bilanAuRetour = false;

  const rs = (q: Question): RenduSujet => rendus.get(q.sujet)!;
  const zonesDe = (q: Question) => zones![q.sujet === 'mers' ? 'mers' : 'monde'];

  function arreterMinuteries(): void {
    clearTimeout(minuterie);
    clearTimeout(pause);
    clearTimeout(chargementVu);
    clearTimeout(annonce);
    jauge.arreter();
    minuterie = pause = chargementVu = annonce = 0;
  }

  /** Ce texte à la région du chargement : tout de suite, ou à la fin de son ANNONCE_MS si elle vient d'apparaître. */
  function dire(texte: string): void {
    aDire = texte;
    if (!annonce) chargement.textContent = texte;
  }

  /**
   * La barre en attente des images : ce texte à la place de la question
   * (échec : « Réessayer ») ; null : la question. Une région polie qui
   * apparaît déjà remplie n'est pas lue (TalkBack) : vide d'abord, son texte
   * ANNONCE_MS après.
   */
  function montrerChargement(texte: string | null, echec = false): void {
    const attente = texte !== null;
    const apparait = attente && (chargement.hidden || barre.hidden);
    ligne.hidden = jauge.el.hidden = retro.hidden = attente;
    if (attente) grille.hidden = true;
    chargement.hidden = !attente;
    chargement.classList.toggle('echec', echec);
    reessayer.hidden = !echec;
    if (attente) barre.hidden = false;
    clearTimeout(annonce);
    annonce = 0;
    if (!apparait) return dire(texte ?? '');
    chargement.textContent = '';
    aDire = texte;
    annonce = window.setTimeout(() => {
      annonce = 0;
      chargement.textContent = aDire;
    }, ANNONCE_MS);
  }

  /** Plus de partie ni de bilan : la carte du monde, rien par-dessus. */
  function arreter(): void {
    arreterMinuteries();
    jeton++;
    partie = null;
    enChargement = false;
    reprendreChargement = null;
    ouverte = false;
    montrerChargement(null);
    barre.hidden = true;
    bilan.hidden = true;
    t.carte.effacerMarques();
    ctx.terrains.montrer('monde');
  }

  /** Les adresses des images de ces questions : le drapeau d'un énoncé, ceux des choix d'un QCM. */
  function imagesDe(questions: readonly Question[]): string[] {
    return questions.flatMap((q) => {
      const r = rs(q);
      if (!r.visuel) return [];
      if (q.forme === 'toucher') return r.imageEnonce(q.cible) ?? [];
      return (q.choix ?? []).flatMap((c) => {
        const x = r.choix(c, q.cible);
        return 'image' in x ? [x.image] : [];
      });
    });
  }

  /** Une partie neuve de cette difficulté : le tirage, ses images attendues, puis la première question. */
  function demarrer(d: Difficulte): void {
    arreter();
    const j = jeton;
    difficulte = d;
    const questions = tirer(d);
    const capitales = new Map(questions.filter((q) => q.sujet === 'capitales' && q.indice).map((q) => [q.cible, q.indice!]));
    rendus = new Map([...new Set(questions.map((q) => q.sujet))].map((s) => [s, rendu(s, t.donnees, { epreuve: true, capitale: (id) => capitales.get(id) })]));
    zones = { monde: zonesDuSujet('pays', t), mers: zonesDuSujet('mers', t) };
    const commencer = () => {
      if (j !== jeton) return;
      arreterMinuteries();
      enChargement = false;
      reprendreChargement = null;
      montrerChargement(null);
      partie = new PartieQuiz(questions);
      poser();
    };
    let dit = '';
    const attendre = (vu: boolean) => {
      const attente = attendreImages(
        imagesDe(questions),
        (n, total) => {
          dit = remplir(T.chargement_images, { n, total });
          if (j === jeton && !chargement.hidden) dire(dit);
        },
        o.chargerImage,
      );
      if (!attente) return commencer();
      enChargement = true;
      if (vu) montrerChargement(dit);
      else chargementVu = window.setTimeout(() => montrerChargement(dit), CHARGEMENT_VU_MS);
      void attente.then((echouees) => {
        if (j !== jeton) return;
        if (!echouees.length) return commencer();
        clearTimeout(chargementVu);
        reprendreChargement = () => attendre(true);
        montrerChargement(T.chargement_echec, true);
      });
    };
    attendre(false);
  }

  /** « 7 / 20 · 5 justes » ; `repondue` : la question posée a sa réponse (rétroaction en cours). */
  function afficherCompte(repondue: boolean): void {
    if (!partie) return;
    compte.textContent = `${partie.numero - (repondue ? 1 : 0)} / ${partie.questions.length} · ${fmtJustes(partie.points)}`;
  }

  function poser(): void {
    arreterMinuteries();
    t.carte.effacerMarques();
    const q = partie?.question;
    if (!partie || !q) return finir();
    const r = rs(q);
    const id = q.cible;
    posee = partie.numero;
    retro.textContent = '';
    retro.className = 'essai-retro';
    consigne.dataset.cible = id;
    consigne.dataset.forme = q.forme;
    afficherCompte(false);
    barre.hidden = false;
    petite = false;
    if (q.forme === 'qcm') {
      consigne.replaceChildren(q.nomme ? (r.consigneNommee(id) ?? r.consigneQcm(id)) : r.consigneQcm(id));
      consigne.classList.remove('consigne-deux-lignes', 'consigne-image');
      grille.hidden = false;
      grille.classList.toggle('nommer-grille-images', r.visuel);
      boutons.forEach((b, k) => {
        const c = q.choix?.[k] ?? '';
        poserContenu(b, c ? r.choix(c, id) : { texte: '' });
        b.dataset.id = c;
        b.className = r.visuel ? 'secondary nommer-choix nommer-choix-image' : 'secondary nommer-choix';
        // Une image n'a pas de texte : un nom neutre, jamais celui du pays (sujets.ts).
        if (r.visuel) b.setAttribute('aria-label', remplir(D.choix, { n: k + 1 }));
        else b.removeAttribute('aria-label');
        b.disabled = true;
      });
      const z = zonesDe(q);
      petite = allumerZone(t.carte, id, z.lieux.get(id), z.formes.get(id), barre, false, z.contours.get(id));
    } else {
      // La vue du monde, avant que le temps ne coure : celle d'un QCM montrerait la réponse.
      grille.hidden = true;
      poserEnonce(consigne, r.enonce(id));
      t.carte.vueEntiere();
    }
    const p = partie;
    const ouvrir = () => {
      if (partie !== p || p.question !== q) return;
      debut = performance.now();
      ouverte = true;
      for (const b of boutons) b.disabled = false;
      p.montrer();
      garder(p);
      jauge.partir(q.delai_ms, debut);
      minuterie = window.setTimeout(expirer, q.delai_ms);
    };
    const imgs = imagesEnAttente(q.forme === 'qcm' ? [consigne, grille] : [consigne]);
    if (!imgs.length) return ouvrir();
    // Filet : une image pas encore là (préchargée au départ, mais le réseau traîne). La jauge pleine attend, rien ne
    // compte ; le décodage, son échec ou ATTENTE_IMAGE_MS ouvrent la question, une fois.
    jauge.pleine(q.delai_ms);
    retro.textContent = T.image_attente;
    let fait = false;
    const enfin = (decodees: boolean) => {
      // Une autre partie, ou une autre question, depuis : ses minuteries ne sont pas les nôtres.
      if (fait || partie !== p || p.question !== q) return;
      fait = true;
      clearTimeout(minuterie);
      retro.textContent = decodees ? '' : T.image_absente;
      ouvrir();
    };
    minuterie = window.setTimeout(() => enfin(false), ATTENTE_IMAGE_MS);
    Promise.all(imgs.map((i) => i.decode())).then(
      () => enfin(true),
      () => enfin(false),
    );
  }

  /** La partie en cours dans le stockage, à son score acquis : relue au démarrage si la page se ferme avant le bilan. */
  function garder(p: PartieQuiz): void {
    if (p.compte) garderEnCours(stockage(), { epreuve: idQuiz(difficulte), score: p.score() });
  }

  function apres(q: QuestionJouee): void {
    if (partie) garder(partie);
    ouverte = false;
    clearTimeout(minuterie);
    jauge.figer();
    for (const b of boutons) b.disabled = true;
    afficherCompte(true);
    pause = window.setTimeout(poser, q.juste ? PAUSE_JUSTE_MS : PAUSE_FAUX_MS);
  }

  /** Le bouton du bon choix en vert, celui du mauvais en rouge. */
  function marquerChoix(id: string, choisi: string | null): void {
    for (const b of boutons) {
      if (b.dataset.id === id) b.classList.add('juste');
      else if (choisi !== null && b.dataset.id === choisi) b.classList.add('faux');
    }
  }

  /** La bonne réponse sur la carte : la zone en vert (et son anneau si elle est petite). */
  function marquerJuste(q: Question): void {
    const carte = t.carte;
    carte.effacerMarques();
    carte.marquer(q.cible, 'juste');
    if (q.forme === 'qcm') {
      if (petite) anneauZone(carte, q.cible, zonesDe(q).lieux.get(q.cible) as Lieu | undefined, 'juste');
    } else anneauSiPetite(t, q.cible, 'juste');
  }

  /** Le délai de la question est écoulé : une erreur. */
  function expirer(): void {
    const q = partie?.question;
    if (!partie || !q || !ouverte) return;
    const j = partie.expirer();
    jauge.vide();
    marquerJuste(q);
    retro.className = 'essai-retro faux';
    if (q.forme === 'qcm') {
      marquerChoix(q.cible, null);
      const r = rs(q);
      retro.textContent = remplir(Q.expire_qcm, { cible: r.retro(q.cible) || r.nomChoix(q.cible, q.cible) });
    } else retro.textContent = rs(q).expire(q.cible);
    apres(j);
  }

  /** Un choix de la grille (QCM). */
  function choisir(choisi: string): void {
    const q = partie?.question;
    if (!partie || !q || !ouverte || q.forme !== 'qcm') return;
    const temps_ms = performance.now() - debut;
    if (temps_ms >= q.delai_ms) return expirer();
    const j = partie.repondreChoix(choisi, temps_ms);
    const r = rs(q);
    const id = q.cible;
    marquerChoix(id, choisi);
    marquerJuste(q);
    if (!j.juste) t.carte.marquer(choisi, 'faux');
    retro.className = `essai-retro ${j.juste ? 'juste' : 'faux'}`;
    // Le lieu de la question, que la consigne ne nommait pas (« La Paz, siège du gouvernement (Bolivie) ») ; des choix
    // en images : la région aria-live dit aussi celui qu'on a pris, que rien d'autre ne nomme.
    const lieu = r.retro(id);
    retro.textContent = j.juste
      ? `${remplir(E.juste, { admis: '' })}${lieu ? ` · ${lieu}` : ''}`
      : r.visuel
        ? remplir(D.faux, { cible: lieu || r.nomChoix(id, id), choisi: r.nomChoix(choisi, id) })
        : remplir(TT.nommer_faux, { cible: lieu || r.nomChoix(id, id) });
    apres(j);
  }

  for (const b of boutons)
    b.addEventListener('click', () => {
      if (b.dataset.id) choisir(b.dataset.id);
    });
  // Touches 1 à 4 pour des choix en images (les drapeaux, comme Reconnaître : nommer.ts), hors d'un champ de saisie ;
  // la touche physique (ev.code : la rangée du haut d'un AZERTY sans Maj), le pavé numérique par ev.key.
  document.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const q = partie?.question;
    if (barre.hidden || grille.hidden || !q || q.forme !== 'qcm' || !rs(q).visuel || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if ((ev.target as Element | null)?.closest?.('input, textarea, select')) return;
    const parCode = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(ev.code);
    const k = parCode >= 0 ? parCode : ['1', '2', '3', '4'].indexOf(ev.key);
    const b = boutons[k];
    if (k < 0 || !b || b.disabled) return;
    ev.preventDefault?.();
    b.click();
  });

  /** Une ligne des ratés du bilan : le lieu, puis ce qui a été répondu (ou rien). */
  function rate(q: Question, j: QuestionJouee | undefined): string {
    const r = rs(q);
    const cible = r.nomBilan(q.cible, 'localiser');
    if (!j) return remplir(Q.bilan_sans_reponse, { cible });
    if (j.temps_ms == null) return remplir(T.bilan_expire, { pays: cible });
    if (q.forme === 'qcm') return remplir(TT.bilan_nommer_faux, { cible, choisi: r.nomChoix(j.touche ?? '', q.cible) });
    return remplir(E.bilan_faux, { pays: cible, touche: r.touche(j.touche), km: j.distance_km == null ? '—' : fmtKm(j.distance_km) });
  }

  /**
   * Le bilan (D55 a : la partie compte dès sa première question montrée, même
   * abandonnée) : le score, le record et le classement de la difficulté.
   * Abandonnée avant (pendant le chargement de ses images) : rien.
   */
  function finir(): void {
    arreterMinuteries();
    ouverte = false;
    barre.hidden = true;
    t.carte.effacerMarques();
    const p = partie;
    if (!p || !p.compte) return arreter();
    const d = difficulte;
    const epreuve = idQuiz(d);
    const score = p.score();
    const bp = enregistrerPartie(stockage(), epreuve, score, maintenant());
    garderEnCours(stockage(), null);
    // Un record nouveau va au profil du compte (rien pour un invité).
    if (bp.toujours.nouveau || bp.semaine.nouveau) profilModifie('records');
    const b = bp.toujours;
    const s = bp.semaine;
    const detail = [...p.parSujet()].map(([su, x]) => remplir(Q.par_sujet, { sujet: nomSujet(su), justes: x.justes, n: x.questions })).join(' · ');
    const rates = p.questions.flatMap((q, i) => {
      const j = p.jouees[i];
      return j?.juste ? [] : [creer('li', {}, rate(q, j))];
    });
    const versCarte = o.versCarte;
    bilan.replaceChildren(
      ...(versCarte
        ? [
            croix(() => {
              arreter();
              versCarte();
            }),
          ]
        : []),
      creer('h2', {}, remplir(Q.bilan_titre, { quiz: nomQuiz(), difficulte: nomDifficulte(d) })),
      creer('p', { class: 'chrono-score' }, scoreCourt(epreuve, score)),
      creer('p', { class: 'hint' }, remplir(T.bilan_detail, { temps: fmtTemps(score.temps_ms) })),
      ...(p.finie ? [] : [creer('p', { class: 'hint quiz-abandon' }, remplir(Q.abandonne, { n: posee }))]),
      creer('p', { class: 'hint quiz-sujets' }, detail),
      creer(
        'p',
        { class: b.nouveau ? 'chrono-record nouveau' : 'chrono-record' },
        b.nouveau ? (b.ancien ? remplir(T.nouveau_record_bat, { score: scoreLong(epreuve, b.ancien) }) : Q.premier_record) : remplir(T.record_a_battre, { score: scoreLong(epreuve, b.record) }),
      ),
      // Le record de la semaine, s'il n'est pas celui de toujours (il repart le lundi).
      ...(!s.nouveau || b.nouveau ? [] : [creer('p', { class: 'chrono-record nouveau quiz-semaine' }, remplir(Q.record_semaine, { score: scoreLong(epreuve, s.record) }))]),
      creer(
        'div',
        { class: 'essai-actions' },
        creer('button', { type: 'button', id: 'quiz-rejouer' }, T.rejouer),
        creer('button', { type: 'button', class: 'secondary', id: 'quiz-autre' }, Q.autre_difficulte),
      ),
      blocClassement(epreuve, T.classement_titre, (pseudo) => publierPartie(pseudo, epreuve, bp)),
      ...(rates.length ? [creer('ul', { class: 'essai-rates' }, ...rates)] : []),
    );
    bilan.querySelector('#quiz-rejouer')?.addEventListener('click', () => demarrer(d));
    bilan.querySelector('#quiz-autre')?.addEventListener('click', () => {
      arreter();
      o.versJouer(DIFFICULTES_JOUER);
    });
    partie = null;
    bilan.hidden = false;
  }

  // D55 a : une partie dont une question a été montrée va au bilan (le score acquis) ; pendant le chargement de ses
  // images, elle ne compte pas, retour aux difficultés.
  abandonner.addEventListener('click', () => {
    if (partie?.compte) return finir();
    arreter();
    o.versJouer(DIFFICULTES_JOUER, Q.abandon_chargement);
  });
  reessayer.addEventListener('click', () => reprendreChargement?.());

  return {
    lancer(d) {
      messageRetour = '';
      bilanAuRetour = false;
      demarrer(d);
    },
    aMontrer: () => bilanAuRetour,
    redirection() {
      if (bilanAuRetour) return null;
      const message = messageRetour;
      messageRetour = '';
      return { cible: DIFFICULTES_JOUER, message };
    },
    activer() {
      if (!bilanAuRetour) return;
      bilanAuRetour = false;
      ctx.terrains.montrer('monde');
      bilan.hidden = false;
    },
    desactiver() {
      // Quittée en cours de partie : elle compte (D55 a), le bilan attend le retour ; pendant le chargement, rien.
      if (partie?.compte) finir();
      bilanAuRetour = !bilan.hidden;
      const avant = enChargement || (partie !== null && !partie.compte);
      arreter();
      messageRetour = avant ? Q.abandon_chargement : '';
    },
    toucher(x, y, ev) {
      const q = partie?.question;
      // Un QCM ignore la carte : on répond par la grille.
      if (!partie || !q || !ouverte || q.forme !== 'toucher') return;
      if (performance.now() - debut >= q.delai_ms) return expirer();
      const r = rs(q);
      const id = q.cible;
      ctx.mesures.toucher(ev, x, y, () => {
        const temps_ms = performance.now() - debut;
        const note = t.carte.noter(id, x, y, optionsNoter(r, t, id));
        const pick = note.pick;
        const j = partie!.repondre(pick?.id ?? null, note.juste, note.distance_km, temps_ms);
        marquerJuste(q);
        if (j.juste) {
          retro.className = 'essai-retro juste';
          const lieu = r.retro(id);
          retro.textContent = `${remplir(E.juste, { admis: texteAdmis(r, id, note.admis) })}${lieu ? ` · ${lieu}` : ''}`;
        } else {
          if (pick && pick.id !== id) t.carte.marquer(pick.id, 'faux');
          retro.className = 'essai-retro faux';
          retro.textContent = remplir(E.faux, { touche: r.touche(pick?.id ?? null), km: note.distance_km == null ? '—' : fmtKm(note.distance_km) });
        }
        apres(j);
        return { pick, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
