import './style.css';
import './carte.css';
import { Carte, type CarteAffichee } from './map/carte';
import { CarteCanvas } from './map/carte-canvas';
import { chargerDonnees, chargerLeger } from './map/donnees';
import { prechauffer } from './map/geo';
import { chargerMers } from './map/mers';
import type { ResultatPick } from './map/pick';
import { estNomProjection } from './map/projection';
import { RelaisWebGL, type EtatRelais } from './map/relais-webgl';
import { teintesDemo } from './map/teintes';
import type { NomProjection, NomTerrain, Rendu, Transfo } from './map/types';
import { Mesures } from './mesure/mesures';
import { panneauMesures } from './mesure/panneau';
import type { Rapport } from './mesure/rapport';
import { creerTerrains, idsJouables, type Terrain, type Terrains } from './terrains';
import { lirePseudoDe, lireRecords } from './epreuve/chrono';
import { idAppareil } from './journal/appareil';
import { depotIndexedDb } from './journal/depot';
import { horlogeAppareil, horlogeDecalee, lireDecalage } from './journal/horloge';
import { ouvrirMemoire } from './journal/memoire';
import { creerNavigation } from './navigation';
import { brancherRetourAndroid } from './retour-android';
import { brancherZoom } from './zoom-carte';
import { comptesVisibles, poserDrapeaux, synchroCoupee } from './sync/drapeaux';
import type { AppareilComptes, RapportComptes } from './sync/comptes';
import { terminerEffacement } from './sync/effacement';
import type { ComptesSynchro, Declencheur, Envoi, RapportEnvoi, ResultatLecture } from './sync/envoi';
import { charger, sdkDemande } from './sync/firebase';
import { brancherProfil, etatCompteConnu, poserEtatCompte, type ChangementProfil } from './sync/pont';
import { depotSessionIndexedDb, type Session } from './sync/session';
import { vueALaDemande } from './vues/a-la-demande';
import { creerAccueil, type Accueil } from './vues/accueil';
import { adresse, creerArbre, depuisAncre, estEpreuve, garderDerniere, type Arbre, type Lancement } from './vues/arbre';
import { catalogue, serieEssai, type Serie } from './vues/cibles';
import type { Vue } from './vues/commun';
import { vueChrono } from './vues/chrono';
import { vueEssai } from './vues/essai';
import { carteMemoire, garderReglageMemoire, lireReglageMemoire } from './vues/carte-memoire';
import { brancherRelance } from './vues/classement';
import { vueExplorer, type VueExplorer } from './vues/explorer';
import { vueGeneral } from './vues/general';
import { remplirEssaiJ0, vueJouer, type VueJouer } from './vues/jouer';
import { brancherRecherche } from './vues/recherche';
import { vueSaisie } from './vues/saisie';
import { vueConfidentialite } from './vues/confidentialite';
import { vueCredits } from './vues/credits';
import { creerSeances } from './vues/seance';
import { textes } from './vues/textes';
import { VERSION } from './version';

const debutScript = performance.now();

/**
 * Rendu par défaut : « canvas » (décision « Rendu par défaut » du 06/11, au
 * registre) ; webgl, g et css restent au choix dans ⚙ (?rendu=g, ?rendu=css,
 * ?rendu=canvas ou ?rendu=webgl force l'un d'eux). Séance du J0 sur le
 * Galaxy A37 (docs/mesures/j0/2026-11-06-*.json, adaptative/ et doigt/) : le
 * canvas est le seul rendu sans saccade, au pilote comme au doigt, dans
 * Chrome et dans l'APK ; le css saccade au pincement (gels jusqu'à 100 ms
 * dans l'APK) et sa carte ne tourne pas ; le webgl est fluide au doigt, mais
 * le pilote y relève quelques à-coups et il ne prend le relais qu'après 0,3 à
 * 0,8 s de canvas. Les mesures du PC ci-dessous ne tranchaient rien.
 * - canvas : la carte qui tourne (décision du 04/11), redessinée à chaque
 *   image dans un Canvas 2D (src/map/carte-canvas.ts), carte allégée pendant
 *   les gestes.
 * - webgl : la même carte qui tourne (mêmes gestes, pick et noter), dessinée
 *   par la carte graphique (src/map/carte-webgl.ts), toujours complète, sans
 *   carte allégée (téléchargée seulement si le webgl se replie pour de bon
 *   sur le Canvas 2D). Affichée d'abord en Canvas 2D, le WebGL prend le relais
 *   quand son maillage est prêt (Web Worker ou cache de l'appareil,
 *   src/map/relais-webgl.ts : data-relais de #carte, champ webgl du rapport) ;
 *   la carte reste en canvas sans WebGL2 matériel, shader refusé ou contexte
 *   perdu pour de bon (data-repli="webgl"). ?aa=0 coupe l'anticrénelage
 *   (MSAA), ?logiciel=1 accepte un WebGL logiciel (SwiftShader), ?maillage=0
 *   recalcule le maillage sans lire le cache, pour comparer.
 * - g : la transformation est posée sur le <g> du SVG à chaque mouvement ;
 *   le navigateur repeint la carte à chaque image.
 * - css : pendant le geste, le compositeur déplace et agrandit l'image déjà
 *   rastérisée de la carte ; la transformation n'est posée au SVG qu'au lever
 *   du doigt, qui paie alors la nouvelle peinture et la rastérisation de
 *   toute la carte.
 * Mesures du PC : docs/mesures/j0/2026-11-04-local-<rendu>-monde[-x4]-gpu.json
 * (driver run-terramemo, commit e373889 : chrome-headless-shell, vrai GPU
 * du PC par --gpu, écran à 60 Hz, 384 × 832, toucher émulé, 3 répétitions ;
 * relire par `driver.py resumer --sec`). Au critère de saccade du registre :
 * - processeur normal : canvas et webgl sans un à-coup ; css saccade au
 *   pincement (9 gels, jusqu'à 83 ms), g aux trois gestes (pincer 4,8
 *   à-coups/s, un gel de 67 ms en glissant, deux tours du monde) ; fin d'un
 *   pincement css 88 / 184 ms (médiane / max), g 72 / 104, canvas 32 / 40,
 *   webgl 24 / 32 ; premier affichage 263 à 485 ms en webgl (485 : première
 *   visite, maillage calculé), 293 à 386 ms en canvas ;
 * - ralenti 4× : seul webgl tient (un à-coup en 18 pincements) ; canvas
 *   saccade au pincement et au tour du monde (dessin au-delà de la période),
 *   css et g au pincement ; premier affichage jusqu'à 921 ms en webgl, 913
 *   en canvas. Le ralenti ne touche pas le Web Worker du maillage : le relais
 *   du webgl à 4× est trop optimiste.
 * En g, une fin de pincement à ~570-650 ms ne change aucun pixel : l'entrée
 * Event Timing ne se clôt qu'à l'image présentée ensuite (artefact, écarté à
 * part par le driver). En css, pendant un pincement, toute la couche est mise
 * à l'échelle par le compositeur : pastilles et frontières grossissent avec
 * le zoom et la carte est floue jusqu'au lever du doigt.
 */
export const RENDU_DEFAUT: Rendu = 'canvas';

// --- Réglages : ?rendu=, ?projection=, ?mesures= (ce dernier gardé dans le navigateur), ?teintes=demo, ?mers=demo ---

const params = new URLSearchParams(location.search);
// Drapeaux du J1b (src/sync/drapeaux.ts) : ?comptes, ?comptes=0 et ?sans-synchro=0, gardés dans le navigateur.
poserDrapeaux(params);
/** Comptes montrés (⚙ › Compte, vue #compte) : en DEV, avec ?comptes, ou une fois ouverts au public (lot 8). */
const COMPTES = comptesVisibles(params);
const TEXTES_COMPTE = textes.compte;
const pRendu = params.get('rendu');
const rendu: Rendu = pRendu === 'g' || pRendu === 'css' || pRendu === 'canvas' || pRendu === 'webgl' ? pRendu : RENDU_DEFAUT;
const pProj = params.get('projection');
const projection: NomProjection = estNomProjection(pProj) ? pProj : 'monde';
/**
 * Crochet d'essai de la carte de la mémoire (#2) : chaque pays jouable du
 * monde teinté d'un seau tiré de son id (teintesDemo), pour les captures et
 * les mesures avant que l'accueil ne la colore. Il reste pendant les parties.
 */
const teintesDemoDemandees = params.get('teintes') === 'demo';
/**
 * Crochet d'essai des océans et mers (lot 3a, étude J2, § 4.6) : la couche
 * marine chargée juste après le premier affichage (jamais avant : rien des mers
 * au premier affichage, même ici), posée sur la carte, chaque zone teintée d'un
 * seau tiré de son id (teintesDemo) : le calque marin tracé par la couche de
 * base, pour les mesures du pilote avec et sans mers. Avec ?teintes=demo, les
 * pays gardent les leurs. Comme lui, l'accueil n'y pose pas la mémoire.
 */
const mersDemoDemandees = params.get('mers') === 'demo';
/**
 * Horloge de test du J1a (#2) : `?horloge=1` décale l'heure du journal d'un
 * jour (le lendemain d'une séance, au pilote), `?horloge=-0.5` d'une
 * demi-journée en arrière. Le journal seul : ni la date des records ni leur
 * semaine. Serveur de développement seulement : sur le site, elle
 * fausserait le journal de l'utilisateur.
 */
const decalageHorloge = import.meta.env.DEV ? lireDecalage(params.get('horloge')) : null;
const horloge = decalageHorloge === null ? horlogeAppareil : horlogeDecalee(horlogeAppareil, decalageHorloge);
const CLE_MESURES = 'terramemo.mesures';
function lireMesures(): boolean {
  const p = params.get('mesures');
  if (p !== null) return p === '1';
  try {
    return localStorage.getItem(CLE_MESURES) === '1';
  } catch {
    return false;
  }
}
let mesuresAffichees = lireMesures();

/** Le stockage du navigateur, null s'il est refusé (navigation privée, données bloquées). */
function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// --- Roue ⚙ : popup unique, refermée par un clic ailleurs ou Échap ---

// Crédits des données (décision « Langue » : le texte vit dans textes.fr.json),
// en une ligne, et le lien vers l'écran Crédits (src/vues/credits.ts, qui lit
// la date de l'IGN à son ouverture). Sans date ici : elle demanderait de
// charger l'île au démarrage ; la carte de l'île porte la sienne (terrains.ts,
// div.carte-credit).
const credits = document.getElementById('credits-donnees');
if (credits) credits.textContent = textes.credits.reglages;
const lienCredits = document.getElementById('lien-credits');
if (lienCredits) lienCredits.textContent = textes.credits.lien;
// Politique de confidentialité (J1b, § 7.3) : à côté de Crédits, pour tous (le classement en demande déjà une).
const lienConfidentialite = document.getElementById('lien-confidentialite');
if (lienConfidentialite) lienConfidentialite.textContent = textes.confidentialite.lien;
// Compte (J1b, étude § 3.1) : au-dessus de Crédits, caché du public jusqu'au lot 8.
const lienCompte = document.getElementById('lien-compte');
if (lienCompte) lienCompte.textContent = TEXTES_COMPTE.lien;
const reglageCompte = document.getElementById('reglage-compte');
if (reglageCompte) reglageCompte.hidden = !COMPTES;

const bouton = document.getElementById('settings-btn');
const popup = document.getElementById('settings-popup');
if (bouton && popup) {
  const ouvrir = (ouvert: boolean) => {
    popup.hidden = !ouvert;
    bouton.setAttribute('aria-expanded', String(ouvert));
  };
  bouton.addEventListener('click', (e) => {
    e.stopPropagation();
    ouvrir(popup.hidden !== false);
  });
  document.addEventListener('click', (e) => {
    if (!popup.hidden && !popup.contains(e.target as Node)) ouvrir(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ouvrir(false);
  });
  // « Essai des claviers » (la vue Saisie), l'Essai J0 : la popup se referme sur la vue ; « × » (#18) aussi.
  popup.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, #reglage-essai button, #settings-fermer')) ouvrir(false);
  });
  const fermer = document.getElementById('settings-fermer');
  fermer?.setAttribute('aria-label', textes.croix.reglages);
  fermer?.setAttribute('title', textes.croix.reglages);
}

/** Rendu et projection : on recharge la page avec le paramètre (mesures d'un chargement propre). */
function reglerSegment(id: string, actuel: string, param: string): void {
  const seg = document.getElementById(id);
  if (!seg) return;
  for (const b of seg.querySelectorAll<HTMLButtonElement>('button[data-v]')) {
    b.classList.toggle('active', b.dataset.v === actuel);
    b.setAttribute('aria-pressed', String(b.dataset.v === actuel));
    b.addEventListener('click', () => {
      if (b.dataset.v === actuel) return;
      const u = new URL(location.href);
      u.searchParams.set(param, b.dataset.v ?? '');
      location.href = u.toString();
    });
  }
}
reglerSegment('reglage-rendu', rendu, 'rendu');
reglerSegment('reglage-projection', projection, 'projection');
// En canvas et webgl, la carte tourne : la « projection » n'est que le méridien central au chargement.
if (rendu === 'canvas' || rendu === 'webgl') {
  const nom = document.querySelector('#reglage-projection')?.closest('.reglage')?.querySelector('.reglage-nom');
  if (nom) {
    nom.textContent = 'Départ';
    nom.setAttribute('title', 'Méridien central au chargement : Monde 0°, Pacifique 150° E');
  }
}

const caseMesures = document.getElementById('reglage-mesures') as HTMLInputElement | null;
function appliquerMesures(): void {
  document.body.dataset.mesures = mesuresAffichees ? '1' : '0';
  const p = document.getElementById('panneau-mesures');
  if (p) p.hidden = !mesuresAffichees;
  if (caseMesures) caseMesures.checked = mesuresAffichees;
}
caseMesures?.addEventListener('change', () => {
  mesuresAffichees = caseMesures.checked;
  try {
    localStorage.setItem(CLE_MESURES, mesuresAffichees ? '1' : '0');
  } catch {
    /* stockage indisponible : le réglage vaut pour cette page */
  }
  appliquerMesures();
});
appliquerMesures();

// Carte de la mémoire (J1a, D7) : activée par défaut, gardée dans le navigateur ; l'accueil se reteinte au changement.
let carteMemoireActive = lireReglageMemoire(stockage());
const caseMemoire = document.getElementById('reglage-memoire') as HTMLInputElement | null;
const nomMemoire = document.getElementById('reglage-memoire-nom');
if (nomMemoire) nomMemoire.textContent = textes.memoire.reglage;
document.getElementById('reglage-memoire-case')?.setAttribute('title', textes.memoire.reglage_detail);
if (caseMemoire) {
  caseMemoire.checked = carteMemoireActive;
  caseMemoire.addEventListener('change', () => {
    carteMemoireActive = caseMemoire.checked;
    garderReglageMemoire(stockage(), carteMemoireActive);
    explorer?.rafraichir();
  });
}

// --- Vues, par l'ancre (décision « En-tête ») : la carte (l'accueil, où la
// recherche montre un lieu), Jouer (l'arbre des choix : #jouer/classe/pays/Africa,
// décision « Écran Jouer ») puis Toucher ou une épreuve classée (vue « chrono » :
// Chrono, Sans faute), les classements (🏆), la Saisie et les Crédits (⚙). Historique,
// redirections et « × » : src/navigation.ts. ---

type NomVue = 'carte' | 'jouer' | 'toucher' | 'chrono' | 'classement' | 'saisie' | 'credits' | 'confidentialite' | 'compte';
/** #compte n'existe que si les comptes se montrent : sinon l'adresse mène à l'accueil. */
const VUES: NomVue[] = ['carte', 'jouer', 'toucher', 'chrono', 'classement', 'saisie', 'credits', 'confidentialite', ...(COMPTES ? (['compte'] as const) : [])];
/** Vues de passage : leur « Retour » ramène à la vue d'avant (leur « × », à la carte). */
const PASSAGE: NomVue[] = ['jouer', 'classement', 'credits', 'confidentialite', 'compte'];
const vues = new Map<string, Vue>();
/** Le monde et l'île (src/terrains.ts), une fois le monde chargé. */
let terrains: Terrains | null = null;
/** Jouer et son arbre, une fois le monde chargé (les séries viennent de pays.json). */
let jouer: VueJouer | null = null;
let arbre: Arbre | null = null;
/** La vue Carte (l'accueil), une fois le monde chargé : ses teintes suivent la mémoire et le réglage. */
let explorer: VueExplorer | null = null;

/**
 * Écran de connexion de la première ouverture (src/vues/accueil.ts, décision
 * « Écran de connexion ») : comptes visibles seulement. Créé avant la
 * navigation, qui lui demande à chaque adresse s'il la retient (la carte à
 * sa place, sous le panneau ; Confidentialité se lit) ; sans choix gardé,
 * l'en-tête est inerte dès maintenant, le temps de lire la session
 * (demarrer, plus bas). Ses entrées des comptes sont les écrans de la vue
 * Compte, dans leur morceau à la demande (chargerVueCompte), sans le SDK de
 * Firebase, préchauffé au premier signe d'intérêt.
 */
const accueil: Accueil | null = COMPTES
  ? creerAccueil({
      hote: document.body,
      entete: document.querySelector('header'),
      zone: document.getElementById('app') as HTMLElement,
      corps: document.body,
      stockage,
      logo: document.querySelector('header h1 .logo')?.getAttribute('src'),
      monterComptes: async (a) => {
        const [{ accueilCompte }, mc] = await chargerVueCompte();
        return accueilCompte({ ...a, comptes: async () => lesComptes(mc), envoi: chargerEnvoi, exporter: exporterDonnees, prechauffer: () => void charger().catch(() => undefined) });
      },
      rendre: () => nav.router(),
      etatCompte: etatCompteConnu,
    })
  : null;

const nav = creerNavigation({
  history,
  ancre: () => location.hash,
  noms: VUES,
  accueil: 'carte',
  passage: PASSAGE,
  arbre: 'jouer',
  vue: (nom) => vues.get(nom),
  // L'écran de connexion ouvert : la carte sous le panneau, quelle que soit l'adresse (sauf Confidentialité).
  retenue: (nom) => accueil?.retient(nom) ?? false,
  surAdresse: (nom) => {
    accueil?.suivre(nom);
    document.body.dataset.vue = nom;
    // Le bouton de la vue affichée (Jouer, 🏆) le dit.
    for (const a of document.querySelectorAll<HTMLAnchorElement>('header a[data-vue]')) {
      if (a.dataset.vue === nom) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  },
  // Toute vue part du monde ; celle qui joue l'île la remontre dans son activer().
  avantActiver: () => terrains?.montrer('monde'),
  aller: (segs) => jouer?.aller(segs),
  annoncer: (m) => jouer?.annoncer(m),
  canonique: (cible) => (arbre ? adresse(arbre.resoudre(depuisAncre(cible).slice(1))) : 'jouer'),
});
// Un lien (ancre) donne un hashchange, un retour arrière un popstate et un
// hashchange (Chromium : les deux aussi pour un lien) ; la navigation ignore
// le second d'une traversée qu'elle a demandée, et ne refait rien pour
// l'adresse déjà affichée.
window.addEventListener('hashchange', () => nav.router());
window.addEventListener('popstate', () => nav.router());
nav.router();
// APK : le bouton retour d'Android remonte cet historique (src/retour-android.ts), après l'écran de connexion.
brancherRetourAndroid(() => accueil?.retour() ?? null);
// Les scores faits hors ligne repartent d'eux-mêmes (démarrage, retour du réseau).
brancherRelance();

// --- Carte et mesures ---

const zone = document.getElementById('app') as HTMLElement;
const hote = document.createElement('div');
hote.id = 'carte';
zone.append(hote);

/**
 * Contexte des mesures : en webgl, « canvas » tant que le Canvas 2D dessine
 * (avant le relais, ou après un repli) : les rapports et chaque geste disent
 * ce qui a dessiné.
 */
const contexteMesures = {
  version: VERSION,
  rendu: (rendu === 'webgl' ? 'canvas' : rendu) as Rendu,
  projection,
  carte: () => ({ largeur: hote.clientWidth, hauteur: hote.clientHeight }),
};
const mesures = new Mesures(contexteMesures);

/** Aides au pilote (skill run-terramemo) : coordonnées dans la fenêtre (clientX, clientY). */
export interface AideCarte {
  /** pick() au point (clientX, clientY) de la fenêtre. */
  pick(x: number, y: number): ResultatPick | null;
  /** Point de la fenêtre où toucher ce pays (sa pastille, sinon son point d'étiquette) ; null s'il est inconnu. */
  ecran(id: string): { x: number; y: number } | null;
  /** Rectangle de la carte dans la fenêtre. */
  rect(): { x: number; y: number; largeur: number; hauteur: number };
  transfo(): Transfo;
  /**
   * Pose une transformation (non comptée comme geste). Canvas : r (méridien
   * central) facultatif ; un x qui ne centre pas l'ovale devient une rotation
   * qui garde au centre le point qu'il y mettait.
   */
  zoomer(t: Transfo): void;
  zoomerSur(id: string): void;
  /**
   * Carte de la mémoire : seau 0 à 4 par id (null : aucune teinte), comme
   * CarteAffichee.teinter ; teintesDemo() (?teintes=demo) donne celles de la démo.
   */
  teinter(t: Record<string, number> | null): void;
  /** Zones teintées en ce moment (carte de la mémoire à l'accueil ; 0 pendant une partie). */
  teintes(): number;
  /** Anneaux posés en ce moment (l'anneau d'une capitale à la rétroaction et dans la recherche, D53 c). */
  anneaux(): number;
  teintesDemo(): Record<string, number>;
  /** Pays qui ont une cible de pastille au zoom courant ; visible : disque dessiné (circle.pastille en SVG). */
  pastilles(): { id: string; visible: boolean }[];
  /** Rendus canvas et webgl : compteurs du dernier dessin (durée du script, carte allégée, parties et sommets tracés). */
  dessin(): CarteCanvas['dernier'];
  /**
   * Rendu webgl : processeur graphique (UNMASKED_RENDERER_WEBGL, lu à cette
   * demande : aussi dans data-gpu de #carte ensuite), contexte
   * perdu, étape du relais ; perte du contexte provoquée puis rendue après
   * retour_ms (négatif : jamais rendue, la carte revient au canvas).
   */
  webgl(): { renderer: string | null; perdu: boolean; etape: EtatRelais['etape']; raison: string | null } | null;
  perdreContexte(retour_ms?: number): boolean;
}

/** Le rapport des mesures, et en webgl l'état du relais (src/map/relais-webgl.ts). */
export type RapportTerramemo = Rapport & { webgl?: EtatRelais };

export interface Terramemo {
  version: string;
  pret: Promise<void>;
  repos: Promise<number>;
  rapport(): RapportTerramemo;
  reinitialiser(): void;
  /** La carte du monde, toujours (contrat du pilote de mesure), même quand l'île est montrée. */
  carte: AideCarte | null;
  /** Le terrain montré. */
  terrain(): NomTerrain;
  /** La carte de l'île une fois chargée (rendu g, sans pastilles : pastilles [], dessin et webgl null). */
  ile: AideCarte | null;
  /**
   * Comptes (J1b) : état, claims du dernier jeton (S16) et erreurs brutes ;
   * null tant que le module n'est pas chargé (invité qui n'a pas ouvert #compte).
   */
  comptes(): Promise<RapportComptes | null>;
  /** Synchro (J1b, lot 3) : ce que le pilote compare d'un appareil à l'autre ; ne charge pas Firebase. */
  synchro(): Promise<RapportSynchro>;
  /** Le SDK de Firebase demandé dans cette page (src/sync/firebase.ts, charger) : jamais pour un invité qui n'y touche pas. */
  sdkDemande(): boolean;
}

/** Ce que window.terramemo.synchro() rend (étude du J1b, § 5.8, 2). */
export interface RapportSynchro {
  /** Le dernier compte connecté de la session (null : invité). */
  uid: string | null;
  coupee: boolean;
  /** Événements du journal, et l'empreinte de l'état FSRS rejoué. */
  evenements: number;
  empreinte: string;
  /** Les comptes des lots du compte (null pour un invité). */
  lots: ComptesSynchro | null;
  /** Lots lus en ligne que cette version ne sait pas lire (lot 4). */
  a_relire: number;
  /** L'envoi de la page : dernière passe, erreurs brutes ; null tant qu'il n'est pas chargé. */
  envoi: RapportEnvoi | null;
  /** La dernière lecture des lots en ligne de la page (lot 4), ou null. */
  lecture: ResultatLecture | null;
  /**
   * Les drapeaux de la session (lots 4 et 5) : marque de lecture, déconnexion, effacement, question de
   * fusion, profil à écrire, suppression du compte en cours.
   */
  session: Pick<Session, 'marque' | 'deconnexion' | 'effacement' | 'connexion' | 'profil_a_ecrire' | 'suppression'> | null;
}

declare global {
  interface Window {
    terramemo: Terramemo;
  }
}

let pretOk!: () => void;
let reposOk!: (p: number) => void;
window.terramemo = {
  version: VERSION,
  pret: new Promise<void>((ok) => (pretOk = ok)),
  repos: new Promise<number>((ok) => (reposOk = ok)),
  rapport: () => {
    if (!relais) return mesures.rapport();
    relais.lireGpu();
    return { ...mesures.rapport(), webgl: structuredClone(relais.etat) };
  },
  reinitialiser: () => mesures.reinitialiser(),
  carte: null,
  terrain: () => terrains?.actif ?? 'monde',
  ile: null,
  comptes: async () => {
    if (!comptesCharges) return null;
    try {
      return lesComptes(await comptesCharges).rapport();
    } catch {
      return null;
    }
  },
  synchro: () => rapportSynchro(),
  sdkDemande,
};

/** Ce qui ne vaut que pour les rendus canvas et webgl du monde : rien pour une carte SVG. */
type AideRendu = Pick<AideCarte, 'dessin' | 'webgl' | 'perdreContexte'>;
const SANS_RENDU: AideRendu = { dessin: () => null, webgl: () => null, perdreContexte: () => false };

/** Les aides au pilote d'une carte, coordonnées de la fenêtre (rect de son hôte). */
function aide(carte: CarteAffichee, h: HTMLElement, jouables: readonly string[], rendus: AideRendu = SANS_RENDU): AideCarte {
  const local = (x: number, y: number): [number, number] => {
    const r = h.getBoundingClientRect();
    return [x - r.left, y - r.top];
  };
  return {
    pick: (x, y) => carte.pick(...local(x, y)),
    ecran: (id) => {
      const p = carte.ecran(id);
      if (!p) return null;
      const r = h.getBoundingClientRect();
      return { x: p[0] + r.left, y: p[1] + r.top };
    },
    rect: () => {
      const r = h.getBoundingClientRect();
      return { x: r.left, y: r.top, largeur: r.width, hauteur: r.height };
    },
    transfo: () => carte.transfo,
    zoomer: (t) => carte.zoomer(t),
    zoomerSur: (id) => carte.zoomerSur(id),
    teinter: (t) => carte.teinter(t ? new Map(Object.entries(t)) : null),
    teintes: () => carte.nbTeintes,
    anneaux: () => carte.nbAnneaux,
    teintesDemo: () => Object.fromEntries(teintesDemo(jouables)),
    pastilles: () => carte.contexte().pastilles.map((p) => ({ id: p.id, visible: p.visible })),
    ...rendus,
  };
}

const deuxImages = () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())));

// Carte allégée (rendu canvas) : téléchargée en même temps que la complète, servie quand elle arrive.
// En webgl, seulement si le relais se replie pour de bon sur le Canvas 2D (pas de WebGL2 matériel,
// shader refusé, contexte perdu) : ce Canvas-là dessine tous les gestes, sur les appareils les plus
// faibles (décision « Chargement du rendu WebGL » : 51 Ko de plus pour eux seuls). Pas en attendant
// le relais, où le Canvas 2D ne dessine qu'un instant.
let leger = rendu === 'canvas' ? chargerLeger() : null;
/** La carte en Canvas 2D (rendus canvas et webgl), une fois créée : le repli lui passe la carte allégée. */
let carteCanvas: CarteCanvas | null = null;
function legerAuRepli(): void {
  if (leger) return;
  leger = chargerLeger();
  carteCanvas?.prendreLeger(leger);
}

// Rendu webgl : le Worker du maillage démarre tout de suite (son script se charge avec les données).
const relais =
  rendu === 'webgl'
    ? new RelaisWebGL({
        antialias: params.get('aa') !== '0',
        logicielAccepte: params.get('logiciel') === '1',
        lireCache: params.get('maillage') !== '0',
        surEtat: (e) => {
          hote.dataset.relais = e.etape;
          if (e.gpu) hote.dataset.gpu = e.gpu;
          if (e.etape === 'repli') {
            hote.dataset.repli = 'webgl';
            legerAuRepli();
          }
          contexteMesures.rendu = e.etape === 'webgl' ? 'webgl' : 'canvas';
        },
      })
    : null;
if (relais) hote.dataset.relais = 'attente';

/**
 * La mémoire de l'appareil (journal du J1a, src/journal/memoire.ts) : lue et
 * rejouée une fois, en parallèle de la carte ; l'id de l'appareil lu une
 * fois. Une séance close part au compte, s'il y en a un (J1b, lot 3 : envoi).
 */
const depotJournal = depotIndexedDb();
/**
 * Une déconnexion ou un « Effacer cet appareil » que l'appli tuée a laissé en
 * route (étude du J1b, § 3.4) : fini avant de lire le journal, avant tout le
 * reste. Rien à faire (le cas courant) : une lecture de la session.
 */
const effacementFini = terminerEffacement({
  session: depotSessionIndexedDb(),
  viderJournal: () => depotJournal.vider!(),
  oublier: async (uid) => {
    const { depotLotsIndexedDb, depotARelireIndexedDb } = await import('./sync/depot-lots');
    await depotLotsIndexedDb().effacer!(uid);
    await depotARelireIndexedDb().retirer(uid);
  },
  stockage: stockage(),
  version: VERSION,
  // Les autres onglets, comme pour Memoire.effacer : ils cessent d'écrire, puis se rechargent.
  diffuser: (m) => {
    try {
      const c = new BroadcastChannel('terramemo');
      c.postMessage(m);
      c.close();
    } catch {
      // Pas de BroadcastChannel : les autres onglets verront le journal vidé à leur prochaine ouverture.
    }
  },
}).catch((e: unknown) => {
  console.warn('Effacement de l’appareil non fini (repris au prochain démarrage) :', e);
  return false;
});
// L'écran de connexion décide une fois l'effacement fini : la session dit alors si l'appareil connaît un compte.
void accueil?.demarrer(
  effacementFini.then(() => depotSessionIndexedDb().lire()).then((s) => !!s?.uid),
);
const memoire = ouvrirMemoire({
  depot: depotJournal,
  appareil: idAppareil(),
  horloge,
  avant: effacementFini,
  // Les onglets de l'origine se préviennent : un journal effacé ailleurs (déconnexion) recharge la page.
  canal: 'terramemo',
  surEffaceAilleurs: () => location.reload(),
  surAvis: (e) => console.warn('Journal non gardé sur cet appareil :', e),
  surCharge: () => {
    jouer?.rafraichir();
    explorer?.rafraichir();
  },
  surCloture: () => lancerEnvoi('cloture'),
});

async function demarrer(): Promise<void> {
  const chargement = chargerDonnees();
  // Les fichiers sont demandés : contexte WebGL et shaders pendant que le réseau répond (relais-webgl.ts).
  relais?.preparer();
  const { donnees, chrono, textes } = await chargement;
  relais?.envoyer(textes);
  // Les touchers des deux cartes (monde, île) vont à la vue active : seule la carte visible en reçoit.
  const surToucher = (x: number, y: number, ev: PointerEvent) => nav.active()?.toucher?.(x, y, ev);
  const options = {
    hote,
    donnees,
    projection,
    rendu,
    surToucher,
    gestes: mesures.ecouteGestes(),
  };
  // En webgl, le Canvas 2D d'abord (sans carte allégée, sauf repli déjà connu), le WebGL ensuite (relais).
  const carte: CarteAffichee = rendu === 'canvas' || rendu === 'webgl' ? new CarteCanvas({ ...options, leger: leger ?? undefined }) : new Carte(options);
  if (carte instanceof CarteCanvas) carteCanvas = carte;
  const cr = carte.rendre();
  const jouables = idsJouables(donnees);
  if (teintesDemoDemandees) carte.teinter(teintesDemo(jouables));
  const finInsertion = performance.now();
  await deuxImages();
  const peinte = performance.now();
  mesures.chargement = {
    total_ms: Math.round(peinte * 10) / 10,
    debut_script_ms: Math.round(debutScript * 10) / 10,
    etapes: {
      telechargement_ms: Math.round(chrono.telechargement_ms * 10) / 10,
      analyse_ms: Math.round(chrono.analyse_ms * 10) / 10,
      feature_ms: Math.round(chrono.feature_ms * 10) / 10,
      chemins_ms: Math.round(cr.chemins_ms * 10) / 10,
      insertion_ms: Math.round(cr.insertion_ms * 10) / 10,
      peinture_ms: Math.round((peinte - finInsertion) * 10) / 10,
    },
    ressources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => e.name.includes('/geo/'))
      .map((e) => ({ nom: e.name.split('/').pop() ?? e.name, transfert: e.transferSize, decode: e.decodedBodySize, duree_ms: Math.round(e.duration * 10) / 10 })),
    caracteres_chemins: cr.caracteres_chemins,
    pastilles: carte.nbPastilles,
  };

  window.terramemo.carte = aide(carte, hote, jouables, {
    dessin: () => (carte instanceof CarteCanvas ? carte.dernier : null),
    webgl: () =>
      relais ? { renderer: relais.lireGpu(), perdu: relais.peintre?.contextePerdu ?? false, etape: relais.etat.etape, raison: relais.etat.raison } : null,
    perdreContexte: (retour_ms) => (relais?.etat.etape === 'webgl' && relais.peintre?.perdreContexte(retour_ms)) || false,
  });
  document.body.dataset.pret = '1';
  pretOk();
  if (mersDemoDemandees) {
    chargerMers().then(
      (c) => {
        carte.prendreMers(c);
        const mers = c.mers.map((e) => e.pays.id);
        carte.teinter(teintesDemo(teintesDemoDemandees ? [...jouables, ...mers] : mers));
      },
      (e: unknown) => console.warn('?mers=demo : couche marine non chargée :', e),
    );
  }
  // Contexte et shaders du WebGL dès la carte affichée, pendant que le Worker maille.
  const relaye = relais && carte instanceof CarteCanvas ? relais.relayer(carte, donnees, peinte) : null;

  // Le monde reste celui de ctx.carte et ctx.donnees ; l'île ne se charge qu'au choix de sa série.
  terrains = creerTerrains({
    monde: { nom: 'monde', carte, donnees, jouables, credit: null },
    hoteMonde: hote,
    surToucher,
    surCharge: (t) => {
      window.terramemo.ile = aide(t.carte, t.carte.hote, t.jouables);
    },
  });
  const ctx = { carte, donnees, mesures, zone, terrains };
  const pays = donnees.entites.map((e) => e.pays);
  arbre = creerArbre(catalogue(pays));
  // ?teintes=demo et ?mers=demo gardent leurs teintes partout : l'accueil n'y pose pas celles de la mémoire.
  explorer = vueExplorer(ctx, teintesDemoDemandees || mersDemoDemandees ? {} : { memoire: carteMemoire(memoire, () => carteMemoireActive, { stockage }) });
  // Les communes (Apprendre sous La Réunion, leurs révisions) : les données de l'île une fois chargée.
  const seances = creerSeances({
    memoire,
    monde: donnees,
    ile: () => terrains?.deja('reunion')?.donnees ?? null,
    charger: (t) => terrains?.charger(t) ?? Promise.reject(new Error('terrains pas prêts')),
  });
  // Page rouverte en pleine grappe de communes, de capitales ou de drapeaux : l'île, les capitales, le manifeste des drapeaux chargés en fond, pour que la ligne de Jouer compte la grappe à finir.
  void memoire.pret.then(
    () => seances.completer()?.then(() => jouer?.rafraichir()),
    () => undefined,
  );
  // « × » de Jouer et des écrans qui couvrent la carte (#18), « Carte » d'un bilan de séance : l'accueil, en remontant l'historique.
  const versCarte = () => nav.remonter('carte');
  const essai = vueEssai(ctx, { versJouer: nav.versJouer, versCarte, seances, libre: seances.libre });
  const epreuve = vueChrono(ctx, { versJouer: nav.versJouer, versCarte });
  // « Retour » des classements, de Crédits… : la vue d'avant, en remontant l'historique.
  const retour = nav.retour;
  // Une partie choisie (Jouer, Rejouer, ⚙) : sa vue s'ouvre (une entrée
  // d'historique), la partie en cours y est abandonnée. Les trois épreuves
  // classées partagent la vue « chrono ». Celle de l'arbre devient « Rejouer ».
  const lancer = (l: Lancement, s: Serie, t: Terrain, ids: string[]): void => {
    // Apprendre lit la mémoire : lancé pendant sa lecture (quelques ms), il l'attend.
    if (l.mode === 'apprendre' && !memoire.charge) return void memoire.pret.then(() => lancer(l, s, t, ids));
    if (arbre?.valide(l)) garderDerniere(stockage(), l);
    nav.ouvrirPartie(estEpreuve(l.mode) ? 'chrono' : 'toucher');
    (estEpreuve(l.mode) ? epreuve : essai).lancer(l, s, t, ids);
  };
  // La Révision du jour s'ouvre comme une partie, sans adresse dans l'arbre de Jouer ; « Rejouer » ne la relance pas.
  const revision = {
    comptes: () => seances.comptes(),
    garde: () => memoire.garde,
    lancer: () => {
      nav.ouvrirPartie('toucher');
      essai.reviser();
    },
  };
  jouer = vueJouer(ctx, arbre, { lancer, fermer: versCarte, pousser: nav.pousser, remonter: nav.remonter, canoniser: nav.canoniser, revision });
  vues.set('carte', explorer);
  vues.set('jouer', jouer);
  vues.set('toucher', essai);
  vues.set('chrono', epreuve);
  vues.set('classement', vueGeneral(ctx, { retour, versCarte }));
  vues.set('saisie', vueSaisie(ctx, { versCarte }));
  vues.set('credits', vueCredits(ctx, { retour, versCarte }));
  vues.set('confidentialite', vueConfidentialite(ctx, { retour, versCarte }));
  if (COMPTES) {
    const T = TEXTES_COMPTE;
    vues.set(
      'compte',
      vueALaDemande(
        ctx,
        'compte',
        { titre: T.titre, chargement: T.chargement, echec: T.chargement_echec, reessayer: T.reessayer, retour: T.retour },
        async () => {
          const [{ vueCompte }, mc] = await chargerVueCompte();
          return vueCompte(ctx, { retour, versCarte, comptes: async () => lesComptes(mc), envoi: chargerEnvoi, exporter: exporterDonnees });
        },
        retour,
        versCarte,
      ),
    );
  }
  const champ = document.getElementById('recherche-champ') as HTMLInputElement | null;
  if (champ)
    brancherRecherche({
      champ,
      monde: donnees,
      choisir: (l) => {
        // Tout de suite (pas en remontant l'historique, qui attendrait le popstate) : le lieu se montre sur la carte affichée.
        nav.pousser('carte');
        explorer?.montrerLieu(l.terrain, l.id, l.point);
      },
    });
  // L'Essai J0 (⚙) : la série des plus difficiles, celle du pilote de mesure, hors de Jouer.
  const essaiJ0 = document.getElementById('reglage-essai');
  if (essaiJ0) {
    const s = serieEssai(pays);
    remplirEssaiJ0(essaiJ0, (mode) => lancer({ branche: 'entrainement', sujet: 'pays', serie: s.id, mode }, s, ctx.terrains.monde, [...s.ids]));
  }
  // Boutons de zoom (#23) : après les vues, donc par-dessus leurs barres ; la carte visible, le monde ou l'île.
  brancherZoom({ zone, carte: () => (terrains?.deja(terrains.actif) ?? ctx.terrains.monde).carte });
  panneauMesures(zone, mesures);
  appliquerMesures();
  nav.router();

  // Le repos (période de l'écran, puis les gestes du pilote) se mesure sur le rendu qui restera.
  if (relaye) await relaye;
  const periode = await mesures.mesurerRepos();
  prechauffer(donnees.entites.map((e) => e.forme));
  document.body.dataset.repos = '1';
  reposOk(periode);
  demarrerCompte();
}

/**
 * Un compte ou une session perdue (dernier uid gardé dans terramemo-synchro,
 * étude du J1b § 2.1 et 3.1) : Firebase chargé au démarrage, après la carte,
 * pour surveiller la session ; un invité ne charge rien.
 */
let comptesCharges: Promise<typeof import('./sync/comptes')> | null = null;
/** Le morceau des comptes ; un échec (site hors ligne) n'est pas gardé : « Réessayer » le redemande. */
function chargerComptes(): Promise<typeof import('./sync/comptes')> {
  const p = (comptesCharges ??= import('./sync/comptes'));
  p.catch(() => {
    if (comptesCharges === p) comptesCharges = null;
  });
  return p;
}
/**
 * Le journal et l'envoi de l'appareil, tels que les comptes les voient
 * (question de fusion, déconnexion, effacement : étude du J1b, § 2.3 et § 3.4).
 */
const appareilComptes: AppareilComptes = {
  async reponsesHorsCompte(uid) {
    if (uid) return (await (await chargerEnvoi()).compter(uid)).reponsesHorsLots;
    return (await memoire.tous({ strict: true })).filter((e) => e.type === 'reponse').length;
  },
  nonEnvoyees: async (uid) => (await (await chargerEnvoi()).compter(uid)).nonEnvoyees,
  async envoyerTout(uid) {
    const e = await chargerEnvoi();
    await e.declencher('deconnexion');
    const c = await e.compter(uid);
    return { nonEnvoyees: c.nonEnvoyees, refusees: c.refusees };
  },
  effacer: async (uids) => (await chargerEnvoi()).effacer(uids, () => memoire.effacer()),
};
/**
 * La vue Compte et les écrans du panneau de la première ouverture : leur
 * morceau, les comptes et l'envoi (une création de compte faite là relance
 * l'envoi : surJeton). Le SDK de Firebase n'en est pas : il vient au premier
 * appel des comptes.
 */
function chargerVueCompte() {
  return Promise.all([import('./vues/compte'), chargerComptes(), chargerEnvoi()]);
}
/** Les comptes de la page, branchés sur l'appareil (le premier appel fixe les options). */
const lesComptes = (m: typeof import('./sync/comptes')) => m.comptes(VERSION, { appareil: appareilComptes });

/**
 * L'export des données (étude du J1b, § 7.2) : le journal entier (lu en
 * strict : un journal illisible ne s'exporte pas à moitié), les lots à relire
 * du compte, les records et le pseudo de l'appareil, et ce que les comptes
 * savent du compte de la session. Un compte connecté lit d'abord ses lots en
 * ligne (une passe de l'envoi) : sans quoi un appareil neuf exporterait un
 * journal vide. `complet` faux : cette lecture n'est pas allée au bout
 * (hors ligne, séance en cours, refus), ou la session est perdue ; le
 * fichier et la vue le disent.
 */
async function exporterDonnees(): Promise<{ nom: string; contenu: string; complet: boolean }> {
  const [x, mc, { depotARelireIndexedDb }] = await Promise.all([import('./sync/export'), chargerComptes(), import('./sync/depot-lots')]);
  const { connecte, ...enLigne } = await lesComptes(mc).pourExport();
  let lectureComplete = false;
  if (connecte && enLigne.compte) {
    try {
      const envoi = await chargerEnvoi();
      const r = await envoi.declencher('premier_plan');
      lectureComplete = r.etat === 'fait' && !r.lecture?.arret && envoi.rapport().lectureDue === null;
    } catch (e) {
      console.warn('Lecture du compte avant l’export :', e);
    }
  }
  const [evenements, aRelire] = await Promise.all([memoire.tous({ strict: true }), enLigne.compte ? depotARelireIndexedDb().tous(enLigne.compte.uid).catch(() => []) : []]);
  const st = stockage();
  const maintenant = new Date();
  const e = x.composerExport({ maintenant, ...enLigne, lectureComplete, evenements, aRelire, records: Object.fromEntries(lireRecords(st)), pseudo: lirePseudoDe(st) });
  return { nom: x.nomExport(maintenant), contenu: x.texteExport(e), complet: !enLigne.compte || lectureComplete };
}

function demarrerCompte(): void {
  // Après un effacement laissé en route : la session est alors celle d'un invité.
  void effacementFini
    .then(() => depotSessionIndexedDb().lire())
    .then((s) => {
      if (!s?.uid) return;
      // Provisoire, avant le chargement de Firebase : la zone du pseudo d'un classement ouvert
      // tout de suite voit déjà un compte (etat() corrige, session perdue comprise).
      if (!s.deconnexion) poserEtatCompte('compte');
      // L'envoi d'abord, pour qu'il soit abonné aux changements de jeton que demarrer() peut émettre
      // (adresse vérifiée pendant que l'appli était fermée : les lots refusés se relancent).
      return chargerEnvoi()
        .then(() => chargerComptes())
        .then((m) => lesComptes(m).demarrer())
        .then((e) => {
          // À l'ouverture : ce qui attend part (séances closes, lots en attente du réseau).
          if (e.etat === 'compte') lancerEnvoi('ouverture');
        });
    })
    .catch((e: unknown) => console.warn('Compte non relu au démarrage :', e));
}

// --- Envoi des séances (J1b, lot 3 ; étude § 5.2) ---

/** Le journal tel que l'envoi le lit : tout, la file d'écriture, la séance en cours. */
const journalEnvoi = {
  // Strict : un journal illisible un instant arrête la passe (et une déconnexion), jamais « rien à envoyer ».
  tous: () => memoire.tous({ strict: true }),
  attendre: () => memoire.ecrire([]),
  seanceEnCours: () => memoire.seanceEnCours(),
  // Les lots lus en ligne (lot 4) : au journal, l'état rejoué au repos, hors d'une séance active.
  fusionner: (evts: readonly import('./srs/journal').Evenement[]) => memoire.fusionner(evts),
};

/**
 * L'envoi de la page, avec les comptes : chargé seulement si la session
 * connaît un compte, ou à l'ouverture de la vue Compte. Un échec (site hors
 * ligne) n'est pas gardé.
 */
let envoiCharge: Promise<Envoi> | null = null;
function chargerEnvoi(): Promise<Envoi> {
  const p = (envoiCharge ??= Promise.all([chargerComptes(), import('./sync/envoi')]).then(([mc, me]) => {
    const c = lesComptes(mc);
    const e = me.creerEnvoi({
      journal: journalEnvoi,
      version: VERSION,
      // La marque de lecture des lots, dans la session (une écriture à la fois, par les comptes).
      marques: c.marques(),
      compte: async () => {
        const x = await c.pourSynchro();
        return x && { uid: x.uid, serveur: me.serveurFirestore(x.service), verifiee: x.verifiee };
      },
    });
    // Création, lien, connexion : le compte se relit, puis le journal part ; adresse vérifiée : les
    // lots refusés se relancent.
    c.surJeton((quoi) => void e.declencher(quoi));
    return e;
  }));
  p.catch(() => {
    if (envoiCharge === p) envoiCharge = null;
  });
  return p;
}

/**
 * Une passe d'envoi ; rien pour un invité (D16), qui ne charge aucun morceau
 * des comptes. Les comptes déjà chargés suffisent : sans IndexedDB (§ 5.1,
 * repli), la session ne vit que dans leur mémoire, et la base lue ici est vide.
 */
async function envoyer(d: Declencheur): Promise<void> {
  if (!envoiCharge && !comptesCharges) {
    const uid = await depotSessionIndexedDb()
      .lire()
      .then((s) => s?.uid ?? null, () => null);
    if (!uid) return;
  }
  await (await chargerEnvoi()).declencher(d);
}
function lancerEnvoi(d: Declencheur): void {
  envoyer(d).catch((e: unknown) => console.warn('Envoi non lancé :', e));
}

/** Retour au premier plan : un envoi toutes les 5 min au plus (§ 5.2). */
const PREMIER_PLAN_MIN = 5 * 60_000;
let dernierPremierPlan = 0;
document.addEventListener('visibilitychange', () => {
  // Arrière-plan : le seul moment sûr sur Android, où l'appli est souvent tuée ; la séance en cours part aussi.
  if (document.visibilityState === 'hidden') return lancerEnvoi('fond');
  const t = Date.now();
  if (t - dernierPremierPlan < PREMIER_PLAN_MIN) return;
  dernierPremierPlan = t;
  lancerEnvoi('premier_plan');
});
addEventListener('online', () => lancerEnvoi('reseau'));

/** window.terramemo.synchro() : sans Firebase ; l'envoi n'est chargé que pour un compte. */
async function rapportSynchro(): Promise<RapportSynchro> {
  const [ses, evts, m] = await Promise.all([depotSessionIndexedDb().lire().catch(() => null), memoire.tous(), import('./sync/envoi')]);
  const uid = ses?.uid ?? null;
  const { depotLotsIndexedDb, depotARelireIndexedDb } = await import('./sync/depot-lots');
  const lots = uid ? await m.compter(journalEnvoi, depotLotsIndexedDb(), uid, depotARelireIndexedDb()) : null;
  const envoi = envoiCharge ? ((await envoiCharge.catch(() => null))?.rapport() ?? null) : null;
  return {
    uid,
    coupee: synchroCoupee(),
    evenements: evts.length,
    empreinte: m.empreinte(memoire.etat()),
    lots,
    a_relire: lots?.aRelire.lots ?? 0,
    envoi,
    lecture: envoi?.lecture ?? null,
    session: ses
      ? { marque: ses.marque ?? null, deconnexion: ses.deconnexion ?? null, effacement: ses.effacement ?? null, connexion: ses.connexion ?? null, profil_a_ecrire: ses.profil_a_ecrire ?? false, suppression: ses.suppression ?? null }
      : null,
  };
}

/**
 * Un record ou un pseudo nouveau (pont des vues, src/sync/pont.ts) : porté au
 * profil du compte (J1b, § 5.4). Un invité ne charge rien (D9 b) : les
 * comptes ne sont chargés que s'ils le sont déjà, ou si la session connaît un
 * compte. Si leur morceau ne vient pas (site hors ligne), le drapeau est
 * posé dans la session directement : la prochaine synchro le verra.
 */
async function noterProfil(c: ChangementProfil): Promise<void> {
  const depot = depotSessionIndexedDb();
  if (!comptesCharges && !(await depot.lire())?.uid) return;
  try {
    await lesComptes(await chargerComptes()).profilModifie(c);
  } catch {
    const s = await depot.lire();
    if (s?.uid) await depot.ecrire({ ...s, profil_a_ecrire: true });
  }
}
brancherProfil((c) => void noterProfil(c).catch((e: unknown) => console.warn('Profil non noté :', e)));

demarrer().catch((e: unknown) => {
  const p = document.createElement('p');
  p.className = 'status error';
  p.textContent = `La carte n'a pas pu se charger : ${e instanceof Error ? e.message : String(e)}`;
  zone.append(p);
  document.body.dataset.pret = 'erreur';
});
