import './style.css';
import './carte.css';
import { version as VERSION } from '../package.json';
import { Carte } from './map/carte';
import { chargerDonnees } from './map/donnees';
import { prechauffer } from './map/geo';
import type { ResultatPick } from './map/pick';
import { estNomProjection } from './map/projection';
import type { NomProjection, Rendu, Transfo } from './map/types';
import { Mesures } from './mesure/mesures';
import { panneauMesures } from './mesure/panneau';
import type { Rapport } from './mesure/rapport';
import type { Vue } from './vues/commun';
import { vueEssai } from './vues/essai';
import { vueExplorer } from './vues/explorer';
import { vueSaisie } from './vues/saisie';

const debutScript = performance.now();

/**
 * Rendu par défaut : « css » en attendant le téléphone, où le choix g / css
 * se tranche (?rendu=g ou ?rendu=css force l'un ou l'autre).
 * - g : la transformation est posée sur le <g> du SVG à chaque mouvement ;
 *   le navigateur repeint la carte à chaque image.
 * - css : pendant le geste, le compositeur déplace et agrandit l'image déjà
 *   rastérisée de la carte ; la transformation n'est posée au SVG qu'au lever
 *   du doigt, qui paie alors la nouvelle peinture et la rastérisation de
 *   toute la carte.
 * Mesures du PC commitées dans docs/mesures/j0/2026-11-04-local-*.json
 * (driver run-cartographe, commit 9fcbd35 ; chrome-headless-shell 153,
 * 384 × 832, DPR 2,8125, écran à 60 Hz, toucher émulé ; 3 répétitions de
 * 6 pincements et 5 glissés ; PC très chargé par une autre session, charge
 * 14 à 17, donc ×4 bruité). Fin de geste = Event Timing de l'événement qui
 * le finit, jusqu'à la présentation ; médiane / max :
 * - processeur normal : aucune image perdue dans les deux modes ; fin d'un
 *   pincement css 64 / 96 ms, g 48 / 72 ms ; d'un glissé css 48 / 80, g 40 / 64 ;
 * - ralenti 4× : pincements css 4 images perdues sur 514, g 37 sur 473
 *   (7,8 %, intervalle max 83 ms) ; fin d'un pincement css 112 / 152 ms,
 *   g 56 / 120 ms ; d'un glissé css 72 / 112, g 48 / 88.
 * En g, un même pincement (k 14,5 → 36) finit à ~600 ms dans 2 répétitions
 * sur 3 à ×1 et 1 sur 3 à ×4 : cette fin ne change aucun pixel (captures
 * identiques), aucune image n'est présentée, et l'entrée Event Timing ne se
 * clôt qu'à la première image présentée ensuite. Un artefact : rien de
 * visible n'attend ; le driver la montre à part. fin.image_ms (deux requestAnimationFrame) s'arrête avant la
 * rastérisation et la présentation : il sous-estime la fin.
 * Donc css garde le geste fluide mais fige l'écran au lever du doigt (plus
 * de 100 ms à 4×, une douzaine d'images à 120 Hz) ; g perd des images pendant
 * les pincements mais finit plus vite en médiane (son maximum à 4× atteint
 * pourtant 120 ms). Sur le téléphone : comparer
 * gestes[].stats.perdues et gestes[].fin.event_timing_ms dans les deux modes.
 * À juger à l'œil aussi : en css, pendant un pincement, toute la couche est
 * mise à l'échelle par le compositeur : pastilles et frontières grossissent
 * avec le zoom (vu sur une capture : pincement de k 2 à 20, disques et traits
 * dix fois plus gros) et la carte est floue jusqu'au lever du doigt, puis tout
 * revient d'un coup. Si css est retenu, piste : masquer la couche des
 * pastilles pendant le geste (ou décider d'accepter le flou).
 */
export const RENDU_DEFAUT: Rendu = 'css';

// --- Réglages : ?rendu=, ?projection=, ?mesures= (ce dernier gardé dans le navigateur) ---

const params = new URLSearchParams(location.search);
const pRendu = params.get('rendu');
const rendu: Rendu = pRendu === 'g' || pRendu === 'css' ? pRendu : RENDU_DEFAUT;
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

// --- Vues : sélecteur segmenté de l'en-tête, par l'ancre (#carte, #toucher, #saisie) ---

type NomVue = 'carte' | 'toucher' | 'saisie';
const VUES: NomVue[] = ['carte', 'toucher', 'saisie'];
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

const mesures = new Mesures({
  version: VERSION,
  rendu,
  projection,
  carte: () => ({ largeur: hote.clientWidth, hauteur: hote.clientHeight }),
});

/** Aides au pilote (skill run-cartographe) : coordonnées dans la fenêtre (clientX, clientY). */
export interface AideCarte {
  /** pick() au point (clientX, clientY) de la fenêtre. */
  pick(x: number, y: number): ResultatPick | null;
  /** Point de la fenêtre où toucher ce pays (sa pastille, sinon son point d'étiquette) ; null s'il est inconnu. */
  ecran(id: string): { x: number; y: number } | null;
  /** Rectangle de la carte dans la fenêtre. */
  rect(): { x: number; y: number; largeur: number; hauteur: number };
  transfo(): Transfo;
  /** Pose une transformation de d3-zoom (non comptée comme geste). */
  zoomer(t: Transfo): void;
  zoomerSur(id: string): void;
  /** Pays qui ont une cible de pastille au zoom courant ; visible : disque dessiné (circle.pastille). */
  pastilles(): { id: string; visible: boolean }[];
}

export interface Cartographe {
  version: string;
  pret: Promise<void>;
  repos: Promise<number>;
  rapport(): Rapport;
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
  rapport: () => mesures.rapport(),
  reinitialiser: () => mesures.reinitialiser(),
  carte: null,
};

const deuxImages = () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())));

async function demarrer(): Promise<void> {
  const { donnees, chrono } = await chargerDonnees();
  const carte = new Carte({
    hote,
    donnees,
    projection,
    rendu,
    surToucher: (x, y, ev) => vueActive?.toucher?.(x, y, ev),
    gestes: mesures.ecouteGestes(),
  });
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
  };
  document.body.dataset.pret = '1';
  pretOk();

  const ctx = { carte, donnees, mesures, zone };
  vues.set('carte', vueExplorer(ctx));
  vues.set('toucher', vueEssai(ctx));
  vues.set('saisie', vueSaisie(ctx));
  panneauMesures(zone, mesures);
  appliquerMesures();
  router();

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
