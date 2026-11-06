import './style.css';
import './carte.css';
import { version as VERSION } from '../package.json';
import { Carte, type CarteAffichee } from './map/carte';
import { CarteCanvas } from './map/carte-canvas';
import { chargerDonnees, chargerLeger } from './map/donnees';
import { prechauffer } from './map/geo';
import type { ResultatPick } from './map/pick';
import { estNomProjection } from './map/projection';
import { RelaisWebGL, type EtatRelais } from './map/relais-webgl';
import type { NomProjection, NomTerrain, Rendu, Transfo } from './map/types';
import { Mesures } from './mesure/mesures';
import { panneauMesures } from './mesure/panneau';
import type { Rapport } from './mesure/rapport';
import { creerTerrains, idsJouables, type Terrain, type Terrains } from './terrains';
import { adresse, creerArbre, depuisAncre, estEpreuve, garderDerniere, pasVers, versAncre, type Arbre, type Lancement } from './vues/arbre';
import { catalogue, serieEssai, type Serie } from './vues/cibles';
import type { Vue } from './vues/commun';
import { vueChrono } from './vues/chrono';
import { vueEssai } from './vues/essai';
import { vueExplorer } from './vues/explorer';
import { vueGeneral } from './vues/general';
import { remplirEssaiJ0, vueJouer, type VueJouer } from './vues/jouer';
import { brancherRecherche } from './vues/recherche';
import { vueSaisie } from './vues/saisie';
import { textes } from './vues/textes';

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

// --- Réglages : ?rendu=, ?projection=, ?mesures= (ce dernier gardé dans le navigateur) ---

const params = new URLSearchParams(location.search);
const pRendu = params.get('rendu');
const rendu: Rendu = pRendu === 'g' || pRendu === 'css' || pRendu === 'canvas' || pRendu === 'webgl' ? pRendu : RENDU_DEFAUT;
const pProj = params.get('projection');
const projection: NomProjection = estNomProjection(pProj) ? pProj : 'monde';
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

// Crédits des données (décision « Langue » : le texte vit dans textes.fr.json).
// Sans date : elle demanderait de charger l'île au démarrage ; la carte de
// l'île porte la sienne (terrains.ts, div.carte-credit).
const credits = document.getElementById('credits');
if (credits) credits.textContent = textes.credits.reglages;

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
  // « Essai des claviers » (la vue Saisie), l'Essai J0 : la popup se referme sur la vue.
  popup.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, #reglage-essai button')) ouvrir(false);
  });
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

// --- Vues, par l'ancre (décision « En-tête ») : la carte (l'accueil, où la
// recherche montre un lieu), Jouer (l'arbre des choix : #jouer/classe/pays/Africa,
// décision « Écran Jouer ») puis Toucher ou une épreuve classée (vue « chrono » :
// Chrono, Sans faute, Minute), les classements (🏆), la Saisie (⚙). ---

type NomVue = 'carte' | 'jouer' | 'toucher' | 'chrono' | 'classement' | 'saisie';
const VUES: NomVue[] = ['carte', 'jouer', 'toucher', 'chrono', 'classement', 'saisie'];
/** Vues de passage : leur « Retour » ou « × » ramène à la vue d'avant. */
const PASSAGE: NomVue[] = ['jouer', 'classement'];
const vues = new Map<NomVue, Vue>();
let vueActive: Vue | null = null;
let nomActif: NomVue | null = null;
/** La dernière vue quittée qui n'était pas de passage. */
let precedente: NomVue = 'carte';
/** Le monde et l'île (src/terrains.ts), une fois le monde chargé. */
let terrains: Terrains | null = null;
/** Jouer et son arbre, une fois le monde chargé (les séries viennent de pays.json). */
let jouer: VueJouer | null = null;
let arbre: Arbre | null = null;
/** Une partie se lance (main.ts : lancer) : sa vue s'ouvre sans redirection, la partie suit. */
let enLancement = false;

/**
 * L'historique (décision « Écran Jouer ») : chaque niveau de Jouer est une
 * entrée (un niveau sauté n'en a pas), et chaque entrée garde la pile des
 * adresses d'avant (history.state), pour que « ‹ », « × », « Autre série » et
 * le retour d'une partie remontent l'historique (pasVers) au lieu d'y empiler
 * une entrée : le retour du navigateur (et celui d'Android, une fois branché
 * sur l'historique de la WebView : rien ne le fait encore dans l'APK) remonte
 * alors l'arbre d'un niveau à la fois, sans jamais y redescendre. Une entrée
 * sans état (le chargement, un lien de l'en-tête) reçoit la pile de l'entrée
 * d'avant, plus l'adresse d'avant.
 */
interface EtatHistorique {
  pile: string[];
}
const PILE_MAX = 40;
/** L'adresse affichée (sans « # ») et la pile de son entrée. */
let adresseRendue: string | null = null;
let pileRendue: string[] = [];

function etatHistorique(): EtatHistorique | null {
  const e = history.state as Partial<EtatHistorique> | null;
  return e && Array.isArray(e.pile) ? (e as EtatHistorique) : null;
}

/** L'adresse demandée : la vue (premier segment), et pour Jouer ses segments ; une vue inconnue est la carte. */
function demandee(): { nom: NomVue; segs: string[] } {
  const [tete = '', ...reste] = depuisAncre(location.hash);
  const nom = (VUES as string[]).includes(tete) ? (tete as NomVue) : 'carte';
  return { nom, segs: nom === 'jouer' ? reste : [] };
}

function router(): void {
  const e = etatHistorique();
  if (e) pileRendue = e.pile;
  else {
    pileRendue = adresseRendue === null ? [] : [...pileRendue, adresseRendue].slice(-PILE_MAX);
    history.replaceState({ pile: pileRendue } satisfies EtatHistorique, '');
  }
  const { nom, segs } = demandee();
  adresseRendue = [nom, ...segs].join('/');
  document.body.dataset.vue = nom;
  // Le bouton de la vue affichée (Jouer, 🏆) le dit.
  for (const a of document.querySelectorAll<HTMLAnchorElement>('header a[data-vue]')) {
    const actif = a.dataset.vue === nom;
    if (actif) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const v = vues.get(nom);
  if (!v) return;
  if (v !== vueActive) {
    // Toucher ou une épreuve sans partie à montrer : Jouer à sa place.
    const r = enLancement ? null : (v.redirection?.() ?? null);
    if (r) return versJouer(r.cible, r.message);
    if (nomActif && !PASSAGE.includes(nomActif)) precedente = nomActif;
    vueActive?.desactiver();
    vueActive = v;
    nomActif = nom;
    // Toute vue part du monde ; celle qui joue l'île la remontre dans son activer().
    terrains?.montrer('monde');
    v.activer();
  }
  if (nom === 'jouer') jouer?.aller(segs);
}
// Un lien (ancre) donne un hashchange, un retour arrière un popstate et un
// hashchange : le router ne refait rien pour l'adresse déjà affichée.
window.addEventListener('hashchange', router);
window.addEventListener('popstate', router);
router();

/** Va à cette adresse (vue, ou niveau de Jouer) : une entrée d'historique de plus. */
function pousser(a: string): void {
  if (a === adresseRendue) return router();
  history.pushState({ pile: [...pileRendue, adresseRendue ?? 'carte'].slice(-PILE_MAX) } satisfies EtatHistorique, '', versAncre(a));
  router();
}

/**
 * Remonte à cette adresse : l'historique, si elle est dans la pile (le
 * popstate rend la vue), sinon à la place de l'entrée affichée.
 */
function remonter(a: string): void {
  if (a === adresseRendue) return router();
  const n = pasVers(pileRendue, a);
  if (n) return history.go(-n);
  history.replaceState(history.state, '', versAncre(a));
  router();
}

/** Vers ce niveau de Jouer (adresse remise à sa forme canonique : un niveau sauté mène plus bas), ce message à son statut. */
function versJouer(cible: string, message = ''): void {
  if (message) jouer?.annoncer(message);
  remonter(arbre ? adresse(arbre.resoudre(depuisAncre(cible).slice(1))) : 'jouer');
}

/** L'adresse affichée remise à sa forme canonique (Jouer : niveau sauté, adresse invalide), sans nouvelle entrée. */
function canoniser(a: string): void {
  history.replaceState(history.state, '', versAncre(a));
  adresseRendue = a;
}


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
};

/** Ce qui ne vaut que pour les rendus canvas et webgl du monde : rien pour une carte SVG. */
type AideRendu = Pick<AideCarte, 'dessin' | 'webgl' | 'perdreContexte'>;
const SANS_RENDU: AideRendu = { dessin: () => null, webgl: () => null, perdreContexte: () => false };

/** Les aides au pilote d'une carte, coordonnées de la fenêtre (rect de son hôte). */
function aide(carte: CarteAffichee, h: HTMLElement, rendus: AideRendu = SANS_RENDU): AideCarte {
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

async function demarrer(): Promise<void> {
  const chargement = chargerDonnees();
  // Les fichiers sont demandés : contexte WebGL et shaders pendant que le réseau répond (relais-webgl.ts).
  relais?.preparer();
  const { donnees, chrono, textes } = await chargement;
  relais?.envoyer(textes);
  // Les touchers des deux cartes (monde, île) vont à la vue active : seule la carte visible en reçoit.
  const surToucher = (x: number, y: number, ev: PointerEvent) => vueActive?.toucher?.(x, y, ev);
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

  window.terramemo.carte = aide(carte, hote, {
    dessin: () => (carte instanceof CarteCanvas ? carte.dernier : null),
    webgl: () =>
      relais ? { renderer: relais.lireGpu(), perdu: relais.peintre?.contextePerdu ?? false, etape: relais.etat.etape, raison: relais.etat.raison } : null,
    perdreContexte: (retour_ms) => (relais?.etat.etape === 'webgl' && relais.peintre?.perdreContexte(retour_ms)) || false,
  });
  document.body.dataset.pret = '1';
  pretOk();
  // Contexte et shaders du WebGL dès la carte affichée, pendant que le Worker maille.
  const relaye = relais && carte instanceof CarteCanvas ? relais.relayer(carte, donnees, peinte) : null;

  // Le monde reste celui de ctx.carte et ctx.donnees ; l'île ne se charge qu'au choix de sa série.
  terrains = creerTerrains({
    monde: { nom: 'monde', carte, donnees, jouables: idsJouables(donnees), credit: null },
    hoteMonde: hote,
    surToucher,
    surCharge: (t) => {
      window.terramemo.ile = aide(t.carte, t.carte.hote);
    },
  });
  const ctx = { carte, donnees, mesures, zone, terrains };
  const pays = donnees.entites.map((e) => e.pays);
  arbre = creerArbre(catalogue(pays));
  const explorer = vueExplorer(ctx);
  const essai = vueEssai(ctx, { versJouer });
  const epreuve = vueChrono(ctx, { versJouer });
  // « Retour » des classements, « × » de Jouer : la vue d'avant, en remontant l'historique.
  const retour = () => remonter(precedente);
  // Une partie choisie (Jouer, Rejouer, ⚙) : sa vue s'ouvre (une entrée
  // d'historique), la partie en cours y est abandonnée. Les trois épreuves
  // classées partagent la vue « chrono ». Celle de l'arbre devient « Rejouer ».
  const lancer = (l: Lancement, s: Serie, t: Terrain, ids: string[]) => {
    if (arbre?.valide(l)) garderDerniere(stockage(), l);
    enLancement = true;
    try {
      pousser(estEpreuve(l.mode) ? 'chrono' : 'toucher');
    } finally {
      enLancement = false;
    }
    (estEpreuve(l.mode) ? epreuve : essai).lancer(l, s, t, ids);
  };
  jouer = vueJouer(ctx, arbre, { lancer, fermer: retour, pousser, remonter, canoniser });
  vues.set('carte', explorer);
  vues.set('jouer', jouer);
  vues.set('toucher', essai);
  vues.set('chrono', epreuve);
  vues.set('classement', vueGeneral(ctx, { retour }));
  vues.set('saisie', vueSaisie(ctx));
  const champ = document.getElementById('recherche-champ') as HTMLInputElement | null;
  if (champ)
    brancherRecherche({
      champ,
      monde: donnees,
      choisir: (l) => {
        // Tout de suite (pas en remontant l'historique, qui attendrait le popstate) : le lieu se montre sur la carte affichée.
        pousser('carte');
        explorer.montrerLieu(l.terrain, l.id);
      },
    });
  // L'Essai J0 (⚙) : la série des plus difficiles, celle du pilote de mesure, hors de Jouer.
  const essaiJ0 = document.getElementById('reglage-essai');
  if (essaiJ0) {
    const s = serieEssai(pays);
    remplirEssaiJ0(essaiJ0, (mode) => lancer({ branche: 'entrainement', sujet: 'pays', serie: s.id, mode }, s, ctx.terrains.monde, [...s.ids]));
  }
  panneauMesures(zone, mesures);
  appliquerMesures();
  router();

  // Le repos (période de l'écran, puis les gestes du pilote) se mesure sur le rendu qui restera.
  if (relaye) await relaye;
  const periode = await mesures.mesurerRepos();
  prechauffer(donnees.entites.map((e) => e.forme));
  document.body.dataset.repos = '1';
  reposOk(periode);
}

demarrer().catch((e: unknown) => {
  const p = document.createElement('p');
  p.className = 'status error';
  p.textContent = `La carte n'a pas pu se charger : ${e instanceof Error ? e.message : String(e)}`;
  zone.append(p);
  document.body.dataset.pret = 'erreur';
});
