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
import type { NomProjection, Rendu, Transfo } from './map/types';
import { Mesures } from './mesure/mesures';
import { panneauMesures } from './mesure/panneau';
import type { Rapport } from './mesure/rapport';
import type { Vue } from './vues/commun';
import { vueChrono } from './vues/chrono';
import { vueEssai } from './vues/essai';
import { vueExplorer } from './vues/explorer';
import { vueSaisie } from './vues/saisie';

const debutScript = performance.now();

/**
 * Rendu par défaut : « css » en attendant le téléphone, où le choix g / css /
 * canvas / webgl se tranche (?rendu=g, ?rendu=css, ?rendu=canvas ou
 * ?rendu=webgl force l'un d'eux).
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
 * (driver run-cartographe, commit e373889 : chrome-headless-shell, vrai GPU
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
 * part par le driver). Le PC (60 Hz, GPU de bureau) ne tranche rien : seul le
 * téléphone le fait (SKILL.md, séance du téléphone).
 * À juger à l'œil aussi : en css, pendant un pincement, toute la couche est
 * mise à l'échelle par le compositeur : pastilles et frontières grossissent
 * avec le zoom et la carte est floue jusqu'au lever du doigt, puis tout
 * revient d'un coup. Si css est retenu, piste : masquer la couche des
 * pastilles pendant le geste (ou décider d'accepter le flou).
 */
export const RENDU_DEFAUT: Rendu = 'css';

// --- Réglages : ?rendu=, ?projection=, ?mesures= (ce dernier gardé dans le navigateur) ---

const params = new URLSearchParams(location.search);
const pRendu = params.get('rendu');
const rendu: Rendu = pRendu === 'g' || pRendu === 'css' || pRendu === 'canvas' || pRendu === 'webgl' ? pRendu : RENDU_DEFAUT;
const pProj = params.get('projection');
const projection: NomProjection = estNomProjection(pProj) ? pProj : 'monde';
const CLE_MESURES = 'cartographe.mesures';
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

// --- Roue ⚙ : popup unique, refermée par un clic ailleurs ou Échap ---

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

// --- Vues : sélecteur segmenté de l'en-tête, par l'ancre (#carte, #toucher, #saisie, #chrono) ---

type NomVue = 'carte' | 'toucher' | 'saisie' | 'chrono';
const VUES: NomVue[] = ['carte', 'toucher', 'saisie', 'chrono'];
const vues = new Map<NomVue, Vue>();
let vueActive: Vue | null = null;

function vueDemandee(): NomVue {
  const h = location.hash.slice(1);
  return (VUES as string[]).includes(h) ? (h as NomVue) : 'carte';
}

function router(): void {
  const nom = vueDemandee();
  document.body.dataset.vue = nom;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.page-nav .nav-link')) {
    const actif = a.getAttribute('href') === `#${nom}`;
    a.classList.toggle('active', actif);
    if (actif) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const v = vues.get(nom);
  if (!v || v === vueActive) return;
  vueActive?.desactiver();
  vueActive = v;
  v.activer();
}
window.addEventListener('hashchange', router);
router();

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

/** Aides au pilote (skill run-cartographe) : coordonnées dans la fenêtre (clientX, clientY). */
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
export type RapportCartographe = Rapport & { webgl?: EtatRelais };

export interface Cartographe {
  version: string;
  pret: Promise<void>;
  repos: Promise<number>;
  rapport(): RapportCartographe;
  reinitialiser(): void;
  carte: AideCarte | null;
}

declare global {
  interface Window {
    cartographe: Cartographe;
  }
}

let pretOk!: () => void;
let reposOk!: (p: number) => void;
window.cartographe = {
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
};

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
  const options = {
    hote,
    donnees,
    projection,
    rendu,
    surToucher: (x: number, y: number, ev: PointerEvent) => vueActive?.toucher?.(x, y, ev),
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

  const local = (x: number, y: number): [number, number] => {
    const r = hote.getBoundingClientRect();
    return [x - r.left, y - r.top];
  };
  window.cartographe.carte = {
    pick: (x, y) => carte.pick(...local(x, y)),
    ecran: (id) => {
      const p = carte.ecran(id);
      if (!p) return null;
      const r = hote.getBoundingClientRect();
      return { x: p[0] + r.left, y: p[1] + r.top };
    },
    rect: () => {
      const r = hote.getBoundingClientRect();
      return { x: r.left, y: r.top, largeur: r.width, hauteur: r.height };
    },
    transfo: () => carte.transfo,
    zoomer: (t) => carte.zoomer(t),
    zoomerSur: (id) => carte.zoomerSur(id),
    pastilles: () => carte.contexte().pastilles.map((p) => ({ id: p.id, visible: p.visible })),
    dessin: () => (carte instanceof CarteCanvas ? carte.dernier : null),
    webgl: () =>
      relais ? { renderer: relais.lireGpu(), perdu: relais.peintre?.contextePerdu ?? false, etape: relais.etat.etape, raison: relais.etat.raison } : null,
    perdreContexte: (retour_ms) => (relais?.etat.etape === 'webgl' && relais.peintre?.perdreContexte(retour_ms)) || false,
  };
  document.body.dataset.pret = '1';
  pretOk();
  // Contexte et shaders du WebGL dès la carte affichée, pendant que le Worker maille.
  const relaye = relais && carte instanceof CarteCanvas ? relais.relayer(carte, donnees, peinte) : null;

  const ctx = { carte, donnees, mesures, zone };
  vues.set('carte', vueExplorer(ctx));
  vues.set('toucher', vueEssai(ctx));
  vues.set('saisie', vueSaisie(ctx));
  vues.set('chrono', vueChrono(ctx));
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
