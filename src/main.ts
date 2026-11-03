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
 * Rendu par défaut : « css ». Mesuré dans Chromium 153 headless, 384 × 832,
 * processeur ralenti 4× puis 6×, mêmes gestes rejoués : aucune image perdue
 * sur 11 gestes en css à 4× (3 sur 11 à 6×), contre 22 à 42 % d'images perdues
 * pendant les pincements en g. Le prix : une image de 30 à 90 ms à la fin du
 * geste (la transformation posée au SVG). À confirmer sur le téléphone ;
 * ?rendu=g ou ?rendu=css force l'un ou l'autre.
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
