// Carte retournée (décision « Sens « quel est ce pays ? » » du 06/11) : la
// fiche nommer se révise sans clavier avant la saisie du J1b. La zone
// s'allume et se cadre comme dans Reconnaître (allumerZone : sur le monde, le
// zoom lent de la décision « Zone allumée montrée par un zoom lent »), on
// pense au nom, « Révéler » le montre, puis « Je savais » (Good) ou « Je ne savais pas »
// (Again) ; une ligne discrète dit quand elle revient. Une question à la
// fois, posée par la séance (src/vues/seance.ts, via essai.ts).
import type { Terrain } from '../terrains';
import type { Forme, Lieu } from '../map/types';
import { creer, pastillesPour, poserContenu, zonesDuSujet, type ContexteVue } from './commun';
import { allumerZone } from './nommer';
import { rendu, type RenduSujet } from './sujets';
import { textes } from './textes';

const S = textes.seance;
const T = textes.toucher;
/** Durée de la ligne discrète avant la question suivante (ms) : les pauses de Reconnaître. */
const PAUSE_SAVAIS_MS = 900;
const PAUSE_OUBLIE_MS = 1500;

export interface CrochetsRetournee {
  compte(): string;
  /** La réponse, une fois donnée : rend la ligne discrète (« Revient dans 3 j »). */
  surReponse(r: { id: string; savais: boolean; temps_ms: number; zoom: number }): string;
  /** La question finie (sa ligne passée) : la suivante. */
  surFin(): void;
  /** « Terminer » : le bilan de la séance. */
  terminer(): void;
}

export interface Retournee {
  /** La question de ce lieu, dans ce sujet (consigne et révélation : son rendu, sujets.ts). */
  poser(t: Terrain, sujet: string, id: string, c: CrochetsRetournee): void;
  /** Une question est posée (pas encore passée à la suivante). */
  readonly enCours: boolean;
  /** Retour dans la vue : la même question, révélée si elle l'était ; répondue, la suivante. */
  reprendre(): void;
  /** Vue quittée : la réponse donnée compte déjà. */
  quitter(): void;
  arreter(): void;
}

export function vueRetournee(ctx: ContexteVue): Retournee {
  // Remplie à chaque question (afficher), selon le sujet.
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const nom = creer('div', { class: 'retournee-nom', 'aria-live': 'polite' });
  const reveler = creer('button', { type: 'button', id: 'retournee-reveler' }, S.reveler);
  const savais = creer('button', { type: 'button', class: 'secondary', id: 'retournee-savais' }, S.savais);
  const oublie = creer('button', { type: 'button', class: 'secondary', id: 'retournee-savais-pas' }, S.savais_pas);
  const reponses = creer('div', { class: 'retournee-reponses' }, savais, oublie);
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const terminer = creer('button', { type: 'button', class: 'secondary', id: 'retournee-terminer' }, T.terminer);
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-retournee' },
    creer('div', { class: 'essai-ligne' }, consigne, compte),
    nom,
    reveler,
    reponses,
    retro,
    creer('div', { class: 'essai-actions' }, terminer),
  );
  barre.hidden = true;
  ctx.zone.append(barre);

  let t: Terrain | null = null;
  /** Le rendu du sujet de la question : consigne et révélation. */
  let rs: RenduSujet | null = null;
  let id = '';
  let crochets: CrochetsRetournee | null = null;
  let etape: 'question' | 'revele' | 'repondu' | null = null;
  let ligne = '';
  let juste = false;
  let debut = 0;
  let temps = 0;
  let attente = 0;
  let lieux = new Map<string, Lieu>();
  let formes = new Map<string, Forme>();

  function arreterAttente(): void {
    clearTimeout(attente);
    attente = 0;
  }

  function afficher(): void {
    if (!t || !rs || !crochets || !etape) return;
    // Une question de mer : sans les pastilles des micro-États (décision du 16/11) ; la séance les rend (essai.ts).
    pastillesPour(ctx, rs.sujet);
    compte.textContent = crochets.compte();
    // « Quel est ce pays ? », « Quelle est cette commune ? » : la consigne du sujet.
    consigne.textContent = rs.consigneQcm(id);
    consigne.dataset.cible = id;
    const revele = etape !== 'question';
    poserContenu(nom, revele ? rs.revelation(id) : { texte: '' });
    nom.hidden = !revele;
    reveler.hidden = revele;
    reponses.hidden = !revele;
    savais.disabled = oublie.disabled = etape === 'repondu';
    retro.className = etape === 'repondu' ? `essai-retro ${juste ? 'juste' : 'faux'}` : 'essai-retro';
    retro.textContent = etape === 'repondu' ? ligne : '';
    barre.hidden = false;
    // Le zoom lent sur la zone à la question seulement (posée, ou reprise au retour dans la vue) : révélée ou
    // répondue, elle se rallume où la carte en est (décision « Zone allumée montrée par un zoom lent »).
    allumerZone(t.carte, id, lieux.get(id), formes.get(id), barre, t.nom !== 'monde', etape === 'question');
    // Révélée : un anneau à chaque ville révélée (D53 c : les capitales justes) ; rien pour un pays.
    if (revele) for (const p of rs.points(id)) t.carte.anneauEn(p, 'juste');
  }

  function suivante(): void {
    arreterAttente();
    const c = crochets;
    etape = null;
    barre.hidden = true;
    t?.carte.effacerMarques();
    c?.surFin();
  }

  reveler.addEventListener('click', () => {
    if (etape !== 'question') return;
    temps = performance.now() - debut;
    etape = 'revele';
    afficher();
  });
  const repondre = (oui: boolean) => {
    if (etape !== 'revele' || !crochets || !t) return;
    juste = oui;
    etape = 'repondu';
    ligne = crochets.surReponse({ id, savais: oui, temps_ms: temps, zoom: t.carte.transfo.k });
    afficher();
    attente = window.setTimeout(suivante, oui ? PAUSE_SAVAIS_MS : PAUSE_OUBLIE_MS);
  };
  savais.addEventListener('click', () => repondre(true));
  oublie.addEventListener('click', () => repondre(false));
  terminer.addEventListener('click', () => crochets?.terminer());

  function quitter(): void {
    arreterAttente();
    barre.hidden = true;
    t?.carte.effacerMarques();
  }

  return {
    poser(terrain, sujet, cible, c) {
      arreterAttente();
      rs = rendu(sujet, terrain.donnees);
      // Les zones du sujet de la question : celles du terrain, ou ses mers (une séance mêle les sujets du monde).
      ({ lieux, formes } = zonesDuSujet(sujet, terrain));
      t = terrain;
      id = cible;
      crochets = c;
      etape = 'question';
      afficher();
      debut = performance.now();
    },
    get enCours() {
      return etape !== null;
    },
    reprendre() {
      if (!etape || !t) return;
      ctx.terrains.montrer(t.nom);
      if (etape === 'repondu') return suivante();
      afficher();
      if (etape === 'question') debut = performance.now();
    },
    quitter,
    arreter() {
      quitter();
      etape = null;
      crochets = null;
    },
  };
}
