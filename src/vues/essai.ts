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
//
// J2 : ce qu'une question montre d'un lieu (énoncé, rétroaction, bilan) vient
// du rendu de son sujet (src/vues/sujets.ts) : celui de la partie lancée, ou
// le domaine de la fiche en séance ; l'Essai J0 joue les pays.
//
// J4, Voisins (lot 2) : Trouver touche chaque voisin du pays nommé, une
// question à plusieurs touchers (src/vues/voisins.ts, QuestionCarte : le
// compte, ce qui est neutre, une faute qui la finit) ; « Voir » montre les
// voisins manqués et la finit. Reconnaître est un Trouver sur la liste écrite
// des voisins (sens nommer au journal), pas un QCM ; la séance pose de même
// ses fiches (formes « voisins » et « trouver »).
import type { Emprise } from '../map/geo';
import type { Via } from '../map/pick';
import type { NomTerrain } from '../map/types';
import { mediane } from '../mesure/stats';
import type { Domaine } from '../srs/fiches';
import type { Terrain } from '../terrains';
import { adresse, niveauDe, type Lancement } from './arbre';
import { melanger, nomSerie, type Serie } from './cibles';
import { anneauZone, chargementSujet, merPosee, creer, croix, estPetite, fmtKm, fmtS, idsSerie, ligneFiche, optionsNoter, pastillesPour, poserComparaison, poserEnonce, prechargerEnonces, rendreFocusLigne, texteAdmis, type ContexteVue, type Vue } from './commun';
import { vueNommer, type ReponseNommer } from './nommer';
import { vueRetournee } from './retournee';
import { rendu, voisinsCharges, type RenduSujet } from './sujets';
import type { QuestionCarte } from './voisins';
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
  /** Voisins : une faute a fini la question (ni « Voir » ni « Passer ») ; le détail de son bilan (« 3 sur 7, puis Pologne »). */
  faute?: boolean;
  detail?: string;
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
  forme: 'trouver' | 'qcm' | 'retournee' | 'voisins';
  /** Avant la question : la carte au monde entier, cadrée sur cette emprise (rappel d'une grappe), ou laissée au joueur. */
  cadrer: Emprise | 'monde' | null;
  /** « Je connais déjà » proposé (QCM d'un pays nouveau). */
  connu: boolean;
  /** Le terrain de la question (le monde par défaut ; l'île pour les communes, chargée avant la séance : FabriqueSeances.charger). */
  terrain?: NomTerrain;
  /** Le domaine de sa fiche (pays par défaut) : la vue pose la question selon son sujet (étude J2 § 6.5). */
  domaine?: Domaine;
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
  /**
   * Le bilan de la séance dans `el` (« Continuer », « Carte », « Autre série ») ; `fiche` : une erreur touchée
   * ouvre la fiche de son lieu (#34, lot F6), absente sans ctx.ouvrirFiche (les lignes restent du texte).
   */
  bilan(el: HTMLElement, actions: { continuer(): void; carte(): void; autre(): void; fiche?(terrain: NomTerrain, id: string): boolean | void }): void;
  /**
   * Un conseil d'Apprendre (D39 b, étude J2 § 6.2 : « Les pays de cette
   * région ne sont pas encore appris : Pays › Afrique › Apprendre ») : dit à
   * l'ouverture, avant la première question, et redit au bilan.
   */
  readonly conseil?: string | null;
}

/**
 * Ce que Toucher demande : la Révision du jour, ou Apprendre sur une série
 * d'un sujet (Lancement.sujet : le domaine des fiches, jamais tiré du terrain).
 * `lieu` : « Apprendre ce lieu » de la fiche (#34, lot F7, § 5.2) ; la grappe
 * qui le contient passe en tête, dans le budget du jour.
 */
export type DemandeSeance = { sorte: 'revision' } | { sorte: 'apprendre'; sujet: string; serie: Serie; lieu?: string };

/** Une séance refusée : pourquoi (« La grappe du jour est déjà apprise… ») et les révisions qui restent. */
export interface RefusSeance {
  refus: string;
  reviser: number;
  /** Pays de la grappe du jour, commencée et pas finie, qui restent : la Révision du jour les reprend (« Les finir · n »). */
  finir?: number;
}

export interface FabriqueSeances {
  ouvrir(d: DemandeSeance): PiloteSeance | RefusSeance;
  /**
   * Charge les données qui manquent à la demande (l'île des communes, les
   * capitales, le manifeste des drapeaux, la couche marine) : Toucher attend la
   * promesse avant ouvrir(), même en échec. null, ou sans réponse : rien à charger.
   */
  charger?(d: DemandeSeance): Promise<unknown> | null;
  /** Les domaines dont la demande a besoin des données (le message du chargement : l'île, ou les autres). */
  besoins?(d: DemandeSeance): readonly string[];
  /**
   * La partie de la page est finie ou quittée (bilan, abandon, vue quittée) :
   * sa séance devient envoyable (synchro du J1b, § 5.2). Sans effet hors séance.
   */
  clore?(): void;
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
  /**
   * Une partie attend-elle d'être reprise (quittée en cours de route, barre
   * cachée, la même question au retour) ? C'est aMontrer() sans le bilan à
   * remontrer. Tant que c'est vrai, la carte ne montre ni fiche d'un lieu, ni
   * chevron, ni ligne de faits : elle donnerait la capitale et le drapeau de
   * la question en suspens (fiche d'un lieu, #34, § 4.8, garde 3).
   */
  enSuspens(): boolean;
}

export interface OptionsEssai {
  /** Vers Jouer, à ce niveau (son adresse) : main.ts remonte l'historique s'il y mène. */
  versJouer(cible: string): void;
  /** « Carte » du bilan d'une séance, « × » des bilans (#18) : l'accueil. */
  versCarte?(): void;
  /** Les séances (Apprendre, Révision du jour) ; sans elles, Apprendre ne fait rien. */
  seances?: FabriqueSeances;
  /** Parties libres (Trouver, Reconnaître hors séance, D11) : le journal de chaque partie lancée, ou null. */
  libre?(l: Lancement | null, t: Terrain): ((r: ReponseJouee) => void) | null;
}

/** Une question de Trouver finie, pour le journal ; `sens` nommer : Reconnaître des Voisins (la liste, on touche le pays). */
const deTrouver = (r: Resultat, sens: Mode): ReponseJouee => ({
  id: r.id,
  sens,
  correct: r.premier,
  aide: r.vu ? 'voir' : r.juste || r.faute ? null : 'passer',
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
  /** Un toucher faux sous Silhouettes : la silhouette touchée et la juste, nommées (D621 a, RenduSujet.comparaison). */
  const comparaison = creer('div', { class: 'comparaison' });
  comparaison.hidden = true;
  const voir = creer('button', { type: 'button', class: 'secondary', id: 'essai-voir' }, T.voir);
  const passer = creer('button', { type: 'button', class: 'secondary', id: 'essai-passer' }, T.passer);
  const terminer = creer('button', { type: 'button', class: 'secondary', id: 'essai-terminer' }, T.terminer);
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-essai' },
    creer('div', { class: 'essai-ligne' }, consigne, compte),
    retro,
    comparaison,
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
  /** « × » des bilans (#18) : le bilan fermé pour de bon (comme « Carte » d'une séance), puis la carte. */
  function versCarte(): void {
    arreter();
    bilanAuRetour = false;
    o.versCarte?.();
  }
  const croixBilan = (): HTMLElement[] => (o.versCarte ? [croix(versCarte)] : []);
  const nommer = vueNommer(ctx, { bilan, actions: actionsBilan, ...(o.versCarte ? { croix: () => croix(versCarte) } : {}) });
  const retournee = vueRetournee(ctx);
  /** La séance en cours (Apprendre, Révision du jour) : elle pose les questions et fait le bilan. */
  let pilote: PiloteSeance | null = null;
  /**
   * La carte du monde a zoomé sur la zone d'une question de séance (à 4 choix
   * ou retournée : décision « Zone allumée montrée par un zoom lent ») depuis
   * le dernier Trouver du monde : le prochain, sans cadrage, repart de la vue
   * du monde. Seul le monde zoome ainsi (l'île garde son cadrage) : un Trouver
   * de l'île entre les deux n'y change rien.
   */
  let mondeZoome = false;
  /** Ce qui l'a lancée (« Continuer » en relance une). */
  let demande: DemandeSeance | null = null;
  /** Le journal de la partie libre en cours (D11), ou null. */
  let journal: ((r: ReponseJouee) => void) | null = null;
  /** Le terrain de la partie : sa carte reçoit marques et notes, ses données donnent les noms. */
  let t: Terrain = ctx.terrains.monde;
  /**
   * Ce que montrent les questions, selon le sujet : celui de la partie lancée
   * (l'Essai J0 : pays), ou le domaine de la fiche en séance (sujets.ts).
   */
  let rs: RenduSujet = rendu('pays', t.donnees);
  /** Le sens des questions de Trouver en cours : nommer pour Reconnaître des Voisins (un Trouver sur leur liste). */
  let sensQ: Mode = 'localiser';
  /** Les Voisins en sens localiser : la question à plusieurs touchers en cours (voisins.ts) ; null pour les autres. */
  let qv: QuestionCarte | null = null;
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
   * plus petite et il disparaîtrait. `point` : un anneau en ce point, sans
   * zone (la capitale montrée, D53 c).
   */
  let marques: { id: string; classe: string; anneau: boolean; point?: [number, number] }[] = [];

  const courante = () => cibles[i];

  function effacer(): void {
    t.carte.effacerMarques();
    marques = [];
  }
  function poser(m: (typeof marques)[number]): void {
    marques.push(m);
    if (m.point) return t.carte.anneauEn(m.point, m.classe);
    t.carte.marquer(m.id, m.classe);
    if (m.anneau) anneauZone(t.carte, m.id, merPosee(t.donnees, m.id), m.classe);
  }
  /** `anneau` : un anneau autour de la zone si elle est petite à l'écran (anneauSiPetite). */
  const marquer = (id: string, classe: string, anneau = false) => poser({ id, classe, anneau: anneau && estPetite(t, id) });
  /** La réponse montrée : un anneau au point de ce que l'énoncé nommait (la capitale, D53 c, en Entraînement seulement) ; rien pour un pays. */
  const marquerPoint = (id: string) => {
    const p = rs.point(id);
    if (p) poser({ id, classe: 'juste', anneau: false, point: p });
  };

  // `reprise` (retour dans la vue) : la même question, ses essais, son « Voir »
  // et son premier faux gardés (ils font la note), son message et ses marques
  // remontrés ; le temps repart, comme Nommer.
  function afficherQuestion(reprise = false): void {
    const id = courante();
    const aRejouer = reprise ? marques : [];
    effacer();
    if (!id) return pilote ? prochaine() : finir();
    // Une question de mer : sans les pastilles des micro-États (décision du 16/11) ; rendues pour un autre sujet.
    pastillesPour(ctx, rs.sujet);
    // Les voisins à toucher (sens localiser) : leur question, gardée telle quelle à la reprise.
    let neuve = false;
    if (rs.sujet === 'voisins' && sensQ === 'localiser') {
      neuve = !reprise || qv?.id !== id;
      if (neuve) qv = voisinsCharges()!.question(t, id, rs);
    } else qv = null;
    poserEnonce(consigne, qv ? qv.enonce() : rs.enonce(id));
    consigne.dataset.cible = id;
    // Le drapeau de la question suivante, demandé pendant celle-ci (étude J2 § 2.2) : celui que son énoncé montrera
    // (tiré, D38 a) ; en séance, la séance a préchargé les siennes.
    prechargerEnonces(rs, cibles.slice(i + 1, i + 2));
    compte.textContent = pilote ? pilote.compte() : `${i + 1} / ${cibles.length}`;
    if (!reprise) {
      retro.textContent = '';
      retro.className = 'essai-retro';
      poserComparaison(comparaison, null);
      essais = 0;
      premierFaux = null;
      vu = false;
      premiere = null;
    }
    for (const m of aRejouer) poser(m);
    // Posée : le pays allumé et la carte sur lui ; reprise : ses marques remises.
    if (qv && neuve) qv.poser(hBarre());
    else qv?.remarquer();
    debut = performance.now();
  }

  /** La hauteur de carte visible au-dessus de la barre. */
  const hBarre = () => barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top;

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
    poserComparaison(comparaison, null);
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
      // Les voisins : juste sans aide, quel que soit le nombre de touchers.
      premier: juste && (qv !== null || essais === 1) && !vu,
      vu,
      temps_ms: performance.now() - debut,
      distance_km: premierFaux,
      reponse: p.reponse,
      via: p.via,
      zoom: p.zoom,
      premier_ms: p.ms,
      ...(qv ? { faute: qv.faute !== null, detail: qv.detail(), reponse: qv.faute } : {}),
    };
  }

  /**
   * Une question des Voisins finie (tous trouvés, une faute, « Voir ») : sa rétroaction, au journal, puis la
   * suivante, après un temps pour voir les manqués sur la carte (3,5 s ; 1,2 s quand elle est juste).
   */
  function finirVoisins(texte: string, juste = false): void {
    const id = courante();
    if (!id) return;
    retro.className = `essai-retro ${juste ? 'juste' : 'faux'}`;
    retro.textContent = texte;
    const res = resultat(id, juste);
    const ligne = rapporter(res);
    if (ligne) retro.append(creer('span', { class: 'seance-ligne' }, ` · ${ligne}`));
    resEnAttente = res;
    enAttente = window.setTimeout(
      () => {
        enAttente = 0;
        resEnAttente = null;
        suivante(res);
      },
      juste ? 1200 : 3500,
    );
  }

  /** Une question finie : au journal de la partie libre, ou à la séance (rend sa ligne discrète). */
  function rapporter(r: Resultat): string {
    const j = deTrouver(r, sensQ);
    if (pilote) return pilote.repondre(j);
    journal?.(j);
    return '';
  }

  // --- Séance (Apprendre, Révision du jour) : les questions viennent du pilote. ---

  /** Change à chaque séance lancée et à l'arrêt : un chargement de l'île arrivé après n'ouvre rien. */
  let jetonSeance = 0;

  function lancerSeance(d: DemandeSeance): void {
    arreter();
    bilanAuRetour = false;
    demande = d;
    serie = d.sorte === 'apprendre' ? d.serie : null;
    t = ctx.terrains.monde;
    ctx.terrains.montrer(t.nom);
    // La carte du monde peut garder la vue zoomée d'un QCM d'une autre partie (le quiz, Reconnaître) : le premier
    // Trouver du monde sans cadrage repart de la vue du monde.
    mondeZoome = true;
    // Des communes à réviser (ou Apprendre sous La Réunion) : l'île d'abord, son chargement dit dans le panneau.
    const chargement = o.seances?.charger?.(d) ?? null;
    if (chargement) {
      const j = ++jetonSeance;
      // L'île : son message d'avant ; les capitales ou les drapeaux seuls : « Chargement… ».
      const ile = o.seances?.besoins?.(d).includes('communes') ?? true;
      bilan.replaceChildren(creer('p', { class: 'hint' }, ile ? T.chargement_terrain : T.chargement_sujet));
      bilan.hidden = false;
      const suite = () => {
        if (j !== jetonSeance) return;
        bilan.hidden = true;
        ouvrirSeance(d);
      };
      // Hors ligne : la séance sans ce qui n'a pu se charger (communes, capitales, drapeaux : elles restent dues).
      chargement.then(suite, suite);
      return;
    }
    ouvrirSeance(d);
  }

  function ouvrirSeance(d: DemandeSeance): void {
    const r = o.seances?.ouvrir(d);
    if (!r) return;
    if ('refus' in r) return refuser(r);
    pilote = r;
    resultats = [];
    if (r.conseil) return conseiller(r.conseil);
    prochaine();
  }

  /**
   * D39 b : le conseil d'Apprendre avant la première question (la grappe
   * prise n'a pas ses pays appris) ; « Commencer » la lance quand même (une
   * préférence, jamais un blocage), « Autre série » ramène aux séries.
   */
  function conseiller(texte: string): void {
    const s = serie;
    const commencer = creer('button', { type: 'button', id: 'seance-commencer' }, textes.seance.commencer);
    commencer.addEventListener('click', () => {
      bilan.hidden = true;
      prochaine();
    });
    const autre = creer('button', { type: 'button', class: 'secondary', id: 'essai-autre' }, T.autre_serie);
    autre.addEventListener('click', () => {
      arreter();
      bilanAuRetour = false;
      o.versJouer(lancement ? adresse(niveauDe(lancement, 'series')) : 'jouer');
    });
    bilan.replaceChildren(
      ...croixBilan(),
      creer('h2', {}, s ? remplir(textes.seance.titre_apprendre, { serie: nomSerie(s.id) }) : textes.seance.titre_revision),
      creer('p', { class: 'hint seance-conseil' }, texte),
      creer('div', { class: 'essai-actions' }, commencer, autre),
    );
    bilan.hidden = false;
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
    // Les communes après les pays (Révision du jour), ou une séance de l'île : la carte de leur terrain.
    const nt = q.terrain && q.terrain !== t.nom ? ctx.terrains.deja(q.terrain) : null;
    if (nt) {
      t.carte.effacerMarques();
      t = nt;
      ctx.terrains.montrer(t.nom);
    }
    rs = rendu(q.domaine ?? 'pays', t.donnees);
    // Les voisins (formeDe de srs/seance.ts) : localiser à plusieurs touchers ; nommer, un Trouver sur leur liste.
    sensQ = q.forme === 'trouver' && q.domaine === 'voisins' ? 'nommer' : 'localiser';
    if (q.forme === 'voisins') {
      cibles = [q.id];
      barre.hidden = false;
      // La question vole jusqu'à son pays : le Trouver suivant repart du monde (cadrage de la séance).
      if (t.nom === 'monde') mondeZoome = true;
      return afficherQuestion();
    }
    if (q.forme === 'trouver') {
      cibles = [q.id];
      barre.hidden = false;
      // Le cadrage de la séance (décision « Cadrage et disques en séance ») : jamais par question.
      if (q.cadrer === 'monde') t.carte.zoomer({ k: 1, x: 0, y: 0 });
      else if (q.cadrer) t.carte.cadrer(q.cadrer, barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top);
      // Sinon la vue laissée par le zoom sur une zone montrerait la réponse (une voisine de sa grappe).
      else if (mondeZoome && t.nom === 'monde') t.carte.vueEntiere();
      if (t.nom === 'monde') mondeZoome = false;
      return afficherQuestion();
    }
    if (t.nom === 'monde') mondeZoome = true;
    const terminer = () => finirSeance();
    if (q.forme === 'qcm')
      return nommer.demarrer(t, rs.sujet, '', [q.id], {
        compte: () => p.compte(),
        surReponse: (r) => p.repondre(deNommer(r)),
        surFin: prochaine,
        terminer,
        ...(q.cadrer && q.cadrer !== 'monde' ? { cadrer: q.cadrer } : {}),
        ...(q.connu
          ? {
              connu: () => {
                p.connu();
                prochaine();
              },
            }
          : {}),
      });
    retournee.poser(t, rs.sujet, q.id, {
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
    pastillesPour(ctx, null);
    const d = demande;
    p.bilan(bilan, {
      continuer: () => {
        if (d) lancerSeance(d);
      },
      carte: versCarte,
      // Comme le bilan d'une partie : les séries de Jouer (Apprendre), Entraînement pour la Révision du jour.
      autre: () => {
        arreter();
        bilanAuRetour = false;
        o.versJouer(adresse(lancement ? niveauDe(lancement, 'series') : { type: 'sujets', branche: 'entrainement' }));
      },
      ...(ctx.ouvrirFiche ? { fiche: ctx.ouvrirFiche } : {}),
    });
    bilan.hidden = false;
    // Une session perdue pendant la partie : l'écran de connexion maintenant, par-dessus le bilan (avant « Rejouer »).
    ctx.finDePartie?.();
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
    const message = creer('p', { class: 'hint' }, r.refus);
    if (s && l) {
      const b = creer('button', { type: 'button', class: r.finir || r.reviser > 0 ? 'secondary' : '', id: 'seance-trouver' }, textes.seance.trouver);
      b.addEventListener('click', () => {
        const partir = () => {
          lancement = { ...l, mode: 'localiser' };
          mode = 'localiser';
          const terrain = ctx.terrains.deja(s.terrain) ?? ctx.terrains.monde;
          demarrer(s, terrain, idsSerie(s, terrain));
        };
        // Les données du sujet d'abord (une séance refusée hors ligne ne les a pas : la couche marine, les capitales) ; jamais une partie à vide.
        const p = chargementSujet(l.sujet, ctx);
        if (!p) return partir();
        b.disabled = true;
        // Arrivées après le bilan fermé (×, « Autre série » : jetonSeance) ou la vue quittée (bilan caché) : pas de partie ; le bouton rendu pour le retour.
        const j = jetonSeance;
        p.then(
          () => {
            b.disabled = false;
            if (j === jetonSeance && !bilan.hidden) partir();
          },
          () => {
            b.disabled = false;
            message.textContent = T.echec_sujet;
          },
        );
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
      ...croixBilan(),
      creer('h2', {}, s ? remplir(textes.seance.titre_apprendre, { serie: nomSerie(s.id) }) : textes.seance.titre_revision),
      message,
      creer('div', { class: 'essai-actions' }, ...boutons),
    );
    bilan.hidden = false;
  }

  /** La partie en cours (ou son bilan) abandonnée : rien à l'écran, la carte du monde. */
  function arreter(): void {
    o.seances?.clore?.();
    jetonSeance++;
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
    pastillesPour(ctx, null);
    ctx.terrains.montrer('monde');
  }

  /** Une partie neuve sur cette série (un nouveau tirage), dans l'exercice de la partie lancée. */
  function demarrer(s: Serie, terrain: Terrain, ids: string[]): void {
    arreter();
    serie = s;
    t = terrain;
    rs = rendu(lancement?.sujet ?? 'pays', t.donnees);
    ctx.terrains.montrer(t.nom);
    // Reconnaître des Voisins : un Trouver sur la liste de leurs voisins (D606 a), pas un QCM.
    const surLaCarte = mode === 'localiser' || rs.sujet === 'voisins';
    sensQ = mode;
    // Toucher sur le monde : la vue du monde, sinon celle laissée par le zoom lent d'un QCM (le quiz, Reconnaître)
    // ouvrirait la partie sur la région de sa dernière zone, peut-être une cible (décision « Zone allumée montrée
    // par un zoom lent »). Reconnaître repart d'elle de lui-même.
    if (surLaCarte && t.nom === 'monde') t.carte.vueEntiere();
    const j = o.libre?.(lancement, t) ?? null;
    journal = j;
    // Reconnaître : seuls les lieux qui se posent en QCM (D37 c : sous Capitales, pas les 9 pays au nom de leur capitale).
    if (!surLaCarte) return nommer.demarrer(t, rs.sujet, nomSerie(s.id), melanger(ids.filter((id) => rs.qcmPosable(id))), { surReponse: (r) => void j?.(deNommer(r)) });
    cibles = melanger(ids);
    i = 0;
    resultats = [];
    barre.hidden = false;
    afficherQuestion();
  }

  function finir(): void {
    if (pilote) return finirSeance();
    validerEnAttente();
    o.seances?.clore?.();
    // Partie close (même par « Terminer ») : revenir à la vue ramène au choix.
    cibles = [];
    barre.hidden = true;
    effacer();
    pastillesPour(ctx, null);
    const n = resultats.length;
    const premiers = resultats.filter((r) => r.premier).length;
    const justes = resultats.filter((r) => r.juste).length;
    const temps = mediane(resultats.filter((r) => r.juste).map((r) => r.temps_ms));
    const rates = resultats.filter((r) => !r.premier);
    // Une erreur touchée : la fiche de son lieu, sur le terrain de la partie (#34, lot F6).
    const terrain = t.nom;
    const ouvrir = ctx.ouvrirFiche;
    bilan.replaceChildren(
      ...croixBilan(),
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
          ligneFiche(
            r.id,
            rs.lieu(r.id),
            remplir(T.rate, {
              pays: rs.nomBilan(r.id, 'localiser'),
              detail: r.detail ?? (r.juste ? `${nEssais(r.essais)}${r.vu ? T.rate_vu : ''}` : T.rate_passe),
              distance: r.distance_km != null ? remplir(T.rate_distance, { km: fmtKm(r.distance_km) }) : '',
              temps: fmtS(r.temps_ms),
            }),
            ouvrir && (() => ouvrir(terrain, r.id)),
          ),
        ),
      ),
      actionsBilan(),
    );
    bilan.hidden = false;
    // Une session perdue pendant la partie : l'écran de connexion maintenant, par-dessus le bilan (avant « Rejouer »).
    ctx.finDePartie?.();
  }

  // « Voir » : la cible en vert, et la carte vole jusqu'à elle (en reculant
  // d'abord, pour voir où elle est), centrée au-dessus de la barre. Une
  // réponse trouvée ensuite ne compte pas comme juste du premier coup.
  voir.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    noterPremiere();
    vu = true;
    // Les voisins : les manqués montrés, la question finie (aide « voir »).
    if (qv) return finirVoisins(qv.arreter());
    effacer();
    marquer(id, 'juste', true);
    t.carte.montrer(id, barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top);
  });
  passer.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    qv?.arreter();
    const r = resultat(id, false);
    rapporter(r);
    suivante(r);
  });
  terminer.addEventListener('click', finir);

  return {
    lancer(l, s, terrain, ids) {
      lancement = l;
      bilanAuRetour = false;
      if (l.mode === 'apprendre') return lancerSeance({ sorte: 'apprendre', sujet: l.sujet, serie: s, ...(l.lieu ? { lieu: l.lieu } : {}) });
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
    enSuspens: () => nommer.enCours || retournee.enCours || cibles.length > 0,
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
        // Revenu d'une fiche ouverte depuis ce bilan (#34, lot F6) : le focus à la ligne touchée.
        rendreFocusLigne(bilan);
      }
    },
    desactiver() {
      validerEnAttente();
      // Une partie reprise au retour écrit de nouveau sous sa séance : un lot de plus (§ 5.2).
      o.seances?.clore?.();
      bilanAuRetour = !bilan.hidden;
      nommer.quitter();
      retournee.quitter();
      barre.hidden = true;
      bilan.hidden = true;
      // La carte seule : `marques` reste, pour les remontrer au retour ; les pastilles rendues, cachées de nouveau à la reprise d'une question de mer.
      t.carte.effacerMarques();
      pastillesPour(ctx, null);
      ctx.terrains.montrer('monde');
    },
    toucher(x, y, ev) {
      // Nommer : les touchers sur la carte ne répondent pas (cibles est vide).
      const id = courante();
      if (!id || enAttente || nommer.enCours || retournee.enCours) return;
      const carte = t.carte;
      const v = qv;
      if (v)
        return ctx.mesures.toucher(ev, x, y, () => {
          const c = v.toucher(x, y);
          noterPremiere(c.pick?.id ?? null);
          essais++;
          if (c.fin) finirVoisins(c.texte, c.juste);
          else {
            retro.className = `essai-retro ${c.classe}`;
            retro.textContent = c.texte;
          }
          return { pick: c.pick, ...c.mesure };
        });
      ctx.mesures.toucher(ev, x, y, () => {
        // Juste : la cible en vert ; faux : ce que la carte désigne (pick) en rouge.
        // Les zones admises de la carte, plus celles du sujet (D36 i : Jérusalem ↔ Jérusalem-Est sous Capitales).
        const note = carte.noter(id, x, y, optionsNoter(rs, t, id));
        const r = note.pick;
        noterPremiere(note.juste ? null : (r?.id ?? null), note.juste ? note.via : null);
        essais++;
        effacer();
        poserComparaison(comparaison, !note.juste && r && r.id !== id ? rs.comparaison(r.id, id) : null);
        if (note.juste) {
          marquer(id, 'juste');
          marquerPoint(id);
          retro.className = 'essai-retro juste';
          // Le lieu de la question, quand l'énoncé ne le nommait pas (« La Paz, siège du gouvernement (Bolivie) ») : rs.retro.
          const lieu = rs.retro(id);
          retro.textContent = remplir(lieu ? T.juste_lieu : T.juste, {
            // Une zone admise (contestée, enclave) dit pourquoi ; sinon la pastille ou « au plus près ».
            via: texteAdmis(rs, id, note.admis) || (note.via === 'pastille' ? T.via_pastille : note.via === 'proche' ? T.via_proche : ''),
            lieu,
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
          marquerPoint(id);
          retro.className = 'essai-retro faux';
          retro.textContent = remplir(T.faux, {
            touche: rs.touche(r?.id ?? null),
            ou: note.distance_km != null ? remplir(T.faux_ou, { km: fmtKm(note.distance_km) }) : '',
            suite: rs.fauxSuite(id),
          });
        }
        return { pick: r, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
