// Carte SVG au doigt : rendu, zoom et déplacement (d3-zoom), pastilles, touchers.
// Tout ce qui décide (pick, noter, pastilles, seuil du toucher) est pur, dans
// les modules voisins ; ce fichier ne fait que le DOM.
import { geoPath, type GeoPermissibleObjects, type GeoProjection } from 'd3-geo';
import { interpolateZoom } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition'; // selection.transition(), pour le vol de montrer()
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import type { DonneesCarte } from './donnees';
import { anneauPrincipal, centreEmprise, contourEmprise, empriseEcran, emprisesSeCroisent, recentrerBande, versEcran, viser, type Emprise } from './geo';
import { calculerPastilles, PASTILLE, tailleEcranPx, type Pastille } from './pastilles';
import { acceptesDe } from './acceptes';
import { noter, pick, type ContexteCarte, type Note, type OptionsNoter, type ResultatPick } from './pick';
import { creerProjection, garderVue } from './projection';
import { fabriqueLignes, fabriqueTraces, UNITE } from './traces';
import { SuiviPointeurs } from './geste';
import { indexLieux, type LieuIndexe } from './lieux';
import { coordonnees, placerNoms, repere, type Boite, type LigneRepere } from './lignes';
import { CoucheNoms } from './noms-lignes';
import { densifierCoutures, empriseMer, formeContour, lignesContour, zonesAllumees, type CoucheMers } from './mers';
import { classeSeau, seau, type Teintes } from './teintes';
import type { Position } from 'geojson';
import type { Entite, Forme, Lieu, Mer, NomProjection, Pays, Rendu, Transfo } from './types';

const SVG = 'http://www.w3.org/2000/svg';
export const ZOOM_MAX = 400;
/**
 * Zoom maximal de montrer() : le pays reste entouré de ses voisins (au zoom
 * 40, ~1 000 km tiennent sur la largeur du téléphone). Le Vatican, visé au
 * quart de l'écran, irait au zoom 400, où l'on ne voit plus que Rome.
 */
const ZOOM_MAX_MONTRER = 40;
/** Durée du vol de montrer() (ms) : celle de l'interpolation de van Wijk et Nuij, bornée. */
const DUREE_MONTRER_MS = { min: 600, max: 2000 } as const;
/**
 * Boutons de zoom (#23) : un cran (zoomerDe) dure 250 ms, l'habitude des
 * cartes en ligne ; le retour à toute la carte (vueEntiere) suit
 * l'interpolation de van Wijk et Nuij, plus court que le vol de montrer().
 * Aussi pour la carte Canvas (carte-canvas.ts).
 */
export const DUREE_CRAN_MS = { min: 250, max: 250 } as const;
export const DUREE_TOUT_MS = { min: 300, max: 900 } as const;
/** Chiffres après la virgule du contour de la sphère (px de base). */
const DECIMALES = 2;
/** Pas des hachures à l'écran (px). */
const PAS_HACHURES = 6;

export interface ChronoRendu {
  chemins_ms: number;
  insertion_ms: number;
  caracteres_chemins: number;
}

export interface FinDeGeste {
  a_bouge: boolean;
  source: Event | null;
  /** Durée du script de fin (application de la transformation en mode css, pastilles). */
  script_ms: number;
  /**
   * Du début du script de fin au deuxième requestAnimationFrame qui suit :
   * le travail du fil principal de l'image de fin (style, mise en page,
   * peinture enregistrée), sans rastérisation ni présentation. Il sous-estime
   * ce que l'on voit ; Event Timing de l'événement de fin le mesure (mesures.ts).
   */
  image: Promise<number>;
}

export interface EcouteGestes {
  /** Événement start de d3-zoom : la transformation au début du geste, avant tout mouvement. */
  debut?(t: Transfo, source: Event | null): void;
  mouvement?(t: Transfo, source: Event | null): void;
  fin?(f: FinDeGeste): void;
  /**
   * Rendu Canvas : durée du script d'une image dessinée pendant un geste
   * (projection et tracé de la carte), appelée après chaque dessin.
   */
  dessin?(ms: number): void;
}

/**
 * Ce que les vues, main.ts et window.terramemo.carte demandent d'une carte,
 * SVG (Carte : rendus g et css) ou Canvas (CarteCanvas, carte qui tourne).
 */
export interface CarteAffichee {
  readonly hote: HTMLElement;
  rendre(): ChronoRendu;
  readonly projection: GeoProjection;
  readonly transfo: Transfo;
  readonly nbPastilles: number;
  contexte(): ContexteCarte;
  /**
   * La vue où la carte s'arrêtera : l'arrivée du vol de montrer() en cours,
   * sinon celle du moment (contexte()). Ce que lit une décision qui vaut
   * pour la suite (le cadrage de Nommer), pas la transformation en plein vol.
   * Pastilles : celles du moment (leur point est celui de la zone, proj).
   */
  contexteFinal(): ContexteCarte;
  pick(x: number, y: number): ResultatPick | null;
  /** options.acceptes false : le de fait strict, sans les zones contestées ni les enclaves (épreuves d'avant leur date). */
  noter(cible: string, x: number, y: number, options?: OptionsNoter): Note;
  ecran(id: string): [number, number] | null;
  zoomerSur(id: string): void;
  /** hVisible : la hauteur visible de la carte (au-dessus d'une barre), toute la carte par défaut. */
  montrer(id: string, hVisible?: number): void;
  /**
   * Cadre une emprise [ouest, sud, est, nord] (la grappe d'une séance, au
   * début de son rappel) par un vol comme montrer() : entière dans la partie
   * visible hVisible, aussi zoomée que possible (ZOOM_MAX_MONTRER au plus).
   */
  cadrer(e: Emprise, hVisible?: number): void;
  zoomer(t: Transfo): void;
  /**
   * Boutons + et − et touches du clavier (#23) : un cran de zoom (facteur 2
   * ou 1/2) autour du centre de la carte, en un court vol, la vue gardée
   * dans la borne comme après un geste. Pendant un vol, le cran part de son
   * arrivée : deux appuis rapprochés zooment de 4. Sans effet au zoom
   * minimal ou maximal, et pendant un geste.
   */
  zoomerDe(facteur: number): void;
  /** Bouton « toute la carte » (#23) : la vue du départ (le monde au zoom 1, ou l'île entière), en vol. */
  vueEntiere(): void;
  marquer(id: string, classe: string): void;
  effacerMarques(): void;
  anneau(id: string, classe: string, rayon_px?: number): void;
  /**
   * Un anneau au point [lon, lat] (la capitale montrée, D53 c ; un lieu choisi
   * dans la recherche) : comme anneau(), de taille constante, effacé avec les
   * marques.
   */
  anneauEn(point: [number, number], classe: string, rayon_px?: number): void;
  /**
   * Carte de la mémoire : chaque zone de t prend la couleur de son seau
   * (--memoire-<seau>, teintes.ts) ; absente, ou t null, --terre. À part des
   * marques : effacerMarques ne les retire pas, et les marques, hachures et
   * contour faux restent par-dessus. Copiées : changer t ensuite ne change
   * rien sans un nouvel appel.
   */
  teinter(t: Teintes | null): void;
  /** Zones teintées en ce moment (pilote : aucune pendant une partie). */
  readonly nbTeintes: number;
  /** Anneaux posés en ce moment (pilote : l'anneau d'une capitale, D53 c). */
  readonly nbAnneaux: number;
  /**
   * La couche marine chargée (chargerMers, mers.ts) : ses zones vont dans
   * donnees.mers (si elles n'y sont pas déjà) et dans l'index commun, qu'ecran,
   * zoomerSur, montrer, marquer et teinter lisent pour les mers comme pour les
   * pays. Une mer ne se dessine que teintée ou marquée, sous les terres
   * (étude J2, § 4.3). Une fois : un second appel ne change rien.
   */
  prendreMers(c: CoucheMers): void;
  /**
   * Carte de la mémoire « Mers » (choix de l'utilisateur du 12/11) : oui,
   * aucune pastille, ni dessinée ni comptée par pick, noter et ecran (un
   * micro-État ne se touche que par son tracé) ; hote.dataset.pastilles et
   * disques valent 0. Les anneaux et les marques restent. Non (le défaut) :
   * les pastilles d'avant, au même calcul. Un changement redessine une fois.
   */
  cacherPastilles(oui: boolean): void;
  /**
   * Lignes de repère (#11, lignes.ts) : tracées sur les terres et la mer, sous
   * les zones allumées (marques), les hachures et les pastilles ; leurs noms
   * posés à l'arrêt, cachés pendant un geste. [] : aucune. Ni pick, ni noter,
   * ni ecran ne les voient. Les mêmes qu'avant : rien à redessiner.
   */
  lignes(l: readonly LigneRepere[]): void;
  /** Lignes de repère posées (pilote). */
  readonly nbLignes: number;
  masquer(oui: boolean): void;
  detruire(): void;
}

/**
 * Ce qui lie une Carte SVG à son terrain : le monde (cadre absent : cadreMonde)
 * ou une carte locale (cadreLocal, terrain.ts : l'île de La Réunion).
 */
export interface CadreCarte {
  /** Projection de base (zoom 1) d'une carte de l × h px. */
  projection(l: number, h: number): GeoProjection;
  /** Contour dessiné en .sphere sous les zones ; null : le fond vient du CSS de l'hôte. */
  fond: GeoPermissibleObjects | null;
  /** Ce que le déplacement ne doit pas quitter (bounds projetés, élargis à l'écran en largeur). */
  borne: GeoPermissibleObjects;
  /**
   * La borne s'élargit aussi à l'écran en hauteur. Le monde : non (le globe
   * reste centré dans les bandes vides d'un écran en hauteur). Une carte
   * locale ajustée sous des marges inégales : oui, sinon d3-zoom la
   * recentrerait au zoom 1 (le sud sous la barre) et l'on ne pourrait pas
   * remonter ses bords au-dessus de la barre en zoomant.
   */
  borneHauteurEcran: boolean;
  zoomMax: number;
  zoomMaxMontrer: number;
  pastilles: boolean;
  libelle: string;
}

/** Options d'une carte ; Carte (SVG) accepte toute zone (Lieu), CarteCanvas et le WebGL le monde seul. */
export interface OptionsCarte<L extends Lieu = Pays> {
  hote: HTMLElement;
  donnees: DonneesCarte<L>;
  /** Projection du monde ; ignorée avec un cadre. */
  projection: NomProjection;
  rendu: Rendu;
  /** Un toucher : (x, y) est le point de la carte visé à la pose, dans le repère de la transformation courante. */
  surToucher?: (x: number, y: number, ev: PointerEvent) => void;
  gestes?: EcouteGestes;
  /** Absent : le monde, comme avant les terrains (rendus g et css). */
  cadre?: CadreCarte;
}

/** Le cadre du monde : la sphère en fond et en borne, zoom 400, pastilles. */
export function cadreMonde(projection: NomProjection): CadreCarte {
  return {
    projection: (l, h) => creerProjection(projection, l, h),
    fond: { type: 'Sphere' },
    borne: { type: 'Sphere' },
    borneHauteurEcran: false,
    zoomMax: ZOOM_MAX,
    zoomMaxMontrer: ZOOM_MAX_MONTRER,
    pastilles: true,
    libelle: 'Carte du monde',
  };
}

const deuxImages = () => new Promise<number>((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));

function el<K extends keyof SVGElementTagNameMap>(nom: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, nom);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export class Carte implements CarteAffichee {
  readonly hote: HTMLElement;
  readonly enveloppe: HTMLDivElement;
  readonly svg: SVGSVGElement;
  private vue!: SVGGElement;
  private motif!: SVGPatternElement;
  private couchePastilles!: SVGGElement;
  private coucheMarques!: SVGGElement;
  /**
   * Contours des zones fausses, par-dessus tous les tracés et les hachures
   * (le même d que leur path.pays) : tracé sur la zone elle-même, le contour
   * de 3 px avait sa moitié extérieure sous les voisines tracées après, sur
   * la carte de l'île comme sur le monde (décision « Nommer », #17).
   */
  private coucheContours!: SVGGElement;
  private contours = new Map<string, SVGPathElement>();
  private chemins = new Map<string, SVGPathElement>();
  /** Le <g> à l'échelle des tracés (centièmes de px) : couches des mers, des pays, des hachures, des contours. */
  private echelle: SVGGElement | null = null;
  /**
   * Couche marine (prendreMers) : un path.mer par zone dans g.couche-mers, sous
   * les pays, rempli seulement quand il est teinté ou marqué (carte.css) ; le
   * contour de la zone marine fausse sur g.couche-contours-mers, entre elle et
   * les pays (les terres le couvrent, comme en canvas et en webgl).
   */
  private couche: CoucheMers | null = null;
  private zonesMers: Mer[] = [];
  private coucheContoursMers: SVGGElement | null = null;
  private cheminsMers = new Map<string, SVGPathElement>();
  private contoursMers = new Map<string, SVGPathElement>();
  /**
   * Tracé du contour faux d'une zone marine (formeContour : l'Atlantique sans
   * l'anneau des Sargasses), en lignes sans les coutures de l'antiméridien ni
   * du pôle (lignesContour : le Pacifique faux n'a pas de trait sur le 180e
   * méridien en « pacifique ») ; calculé à sa marque fausse, null pour un pays.
   */
  private contourMer: ((id: string) => string | null) | null = null;
  /** Index commun des zones et des mers (lieux.ts) : ecran, vise, anneau. */
  private lieux: Map<string, LieuIndexe>;
  private cerclesPastilles = new Map<string, SVGCircleElement>();
  private marques = new Map<string, Set<string>>();
  /** Classe de teinte (.s0 à .s4) de chaque zone teintée : à part des marques, reposée sur les tracés et disques recréés. */
  private teintes = new Map<string, string>();
  private anneaux: { cercle: SVGCircleElement; rayon_px: number }[] = [];
  private pastilles: Pastille[] = [];
  /** cacherPastilles(true) : aucune pastille, même sur un cadre qui en a. */
  private sansPastilles = false;
  private proj!: GeoProjection;
  private comportement: ZoomBehavior<HTMLElement, unknown>;
  private t: Transfo = { k: 1, x: 0, y: 0 };
  /** Arrivée du vol de montrer() en cours (null : pas de vol). */
  private arrivee: Transfo | null = null;
  /** Transformation posée sur le <g> (en mode css, elle retarde sur t pendant le geste). */
  private applique: Transfo = { k: 1, x: 0, y: 0 };
  private kRayons = 1;
  private aBouge = false;
  /** Le geste en cours vient d'un doigt, de la souris ou de la molette (pas de zoomer()). */
  private parUtilisateur = false;
  /** Entre le start et le end de d3-zoom (geste ou vol). */
  private enGeste = false;
  private taille = { l: 0, h: 0 };
  private suivi = new SuiviPointeurs();
  /** Carte masquée (vue Saisie) : pas de retracé avant son retour. */
  private masquee = false;
  private observateur: ResizeObserver;
  private ecouteurs: [string, EventListener][] = [];
  private readonly cadre: CadreCarte;
  /**
   * Id du motif des hachures : unique dans la page (le monde et l'île y ont
   * chacun leur SVG ; deux ids égaux, url(#…) prendrait le premier).
   */
  private readonly idMotif: string;
  /**
   * Lignes de repère (lignes()) : un seul path.ligne-repere dans g.couche-lignes,
   * entre les pays et les hachures ; au-dessus, g.couche-allumees, une copie de
   * chaque zone marquée (path.allumee, sans data-id : pick et le pilote ne
   * voient que l'original), pour qu'aucune ligne ne passe sur une zone allumée.
   * Leurs noms (le monde seul : le repère d'Equal Earth), posés à l'arrêt.
   */
  private lignesPosees: readonly LigneRepere[] = [];
  private coucheLignes: SVGGElement | null = null;
  private coucheAllumees: SVGGElement | null = null;
  private traceLignes: ((l: Position[][]) => string) | null = null;
  private noms: CoucheNoms | null = null;

  constructor(private readonly o: OptionsCarte<Lieu>) {
    this.cadre = o.cadre ?? cadreMonde(o.projection);
    this.idMotif = o.cadre ? `hachures-${o.hote.id || 'cadre'}` : 'hachures';
    this.hote = o.hote;
    this.lieux = indexLieux(o.donnees);
    this.hote.classList.add('carte');
    this.hote.dataset.rendu = o.rendu;
    if (!o.cadre) this.hote.dataset.projection = o.projection;
    this.enveloppe = document.createElement('div');
    this.enveloppe.className = 'carte-enveloppe';
    this.svg = el('svg', { class: 'carte-svg', role: 'img', 'aria-label': this.cadre.libelle });
    this.enveloppe.append(this.svg);

    this.comportement = zoom<HTMLElement, unknown>()
      .scaleExtent([1, this.cadre.zoomMax])
      .on('start', (e: D3ZoomEvent<HTMLElement, unknown>) => this.debut(e))
      .on('zoom', (e: D3ZoomEvent<HTMLElement, unknown>) => this.mouvement(e))
      .on('end', (e: D3ZoomEvent<HTMLElement, unknown>) => this.fin(e));

    const sur = (type: string, f: (ev: PointerEvent) => void) => {
      const l = f as EventListener;
      this.hote.addEventListener(type, l);
      this.ecouteurs.push([type, l]);
    };
    sur('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const [x, y] = this.local(ev);
      // La transformation à la pose : d3-zoom (mousedown, touchstart) n'a pas encore bougé la carte.
      this.suivi.bas(ev.pointerId, x, y, ev.timeStamp, this.t);
    });
    sur('pointermove', (ev) => {
      const [x, y] = this.local(ev);
      this.suivi.bouge(ev.pointerId, x, y);
    });
    sur('pointercancel', (ev) => this.suivi.annule(ev.pointerId));
    sur('pointerup', (ev) => {
      const [x, y] = this.local(ev);
      const toucher = this.suivi.haut(ev.pointerId, x, y, ev.timeStamp, this.t);
      if (toucher) this.o.surToucher?.(toucher.x, toucher.y, ev);
    });

    this.observateur = new ResizeObserver(() => this.redimensionner());
  }

  /** Dessine la carte ; rend la durée de la génération des tracés et de l'insertion. */
  rendre(): ChronoRendu {
    const l = this.hote.clientWidth || window.innerWidth;
    const h = this.hote.clientHeight || window.innerHeight;
    // Un retracé (redimensionnement) garde le centre et le zoom de la vue.
    const avant = this.proj ? { proj: this.proj, ...this.taille } : null;
    this.taille = { l, h };
    const t0 = performance.now();
    const cadre = this.cadre;
    this.proj = cadre.projection(l, h);
    const vise = avant ? garderVue(this.t, avant, { proj: this.proj, l, h }, cadre.zoomMax) : { k: 1, x: 0, y: 0 };
    const d = fabriqueTraces((l1, h1) => cadre.projection(l1, h1), this.proj);
    const sphere = cadre.fond ? (geoPath(this.proj).digits(DECIMALES)(cadre.fond) ?? '') : '';
    const traces = this.o.donnees.entites.map((e) => d(e.forme));
    const zones = this.o.donnees.contestees.map((z) => d(z.forme));
    const t1 = performance.now();

    this.svg.replaceChildren();
    this.chemins.clear();
    this.contours.clear();
    this.cheminsMers.clear();
    this.contoursMers.clear();
    this.cerclesPastilles.clear();
    this.anneaux = [];
    this.svg.setAttribute('width', String(l));
    this.svg.setAttribute('height', String(h));
    const defs = el('defs');
    this.motif = el('pattern', { id: this.idMotif, patternUnits: 'userSpaceOnUse', width: PAS_HACHURES, height: PAS_HACHURES });
    this.motif.append(el('line', { class: 'hachure-trait', x1: 1, y1: 0, x2: 1, y2: PAS_HACHURES }));
    defs.append(this.motif);
    this.vue = el('g', { class: 'vue' });
    if (cadre.fond) this.vue.append(el('path', { class: 'sphere', d: sphere }));
    // Tracés en centièmes de px (traces.ts) : ce <g> les ramène en px de base.
    const echelle = el('g', { class: 'unite', transform: `scale(${1 / UNITE})` });
    const pays = el('g', { class: 'couche-pays' });
    const hachures = el('g', { class: 'couche-hachures' });
    this.o.donnees.entites.forEach((e: Entite<Lieu>, i) => {
      const p = el('path', { class: 'pays', 'data-id': e.pays.id, 'data-statut': e.pays.statut, d: traces[i] ?? '' });
      const teinte = this.teintes.get(e.pays.id);
      if (teinte) p.classList.add(teinte);
      for (const classe of this.marques.get(e.pays.id) ?? []) p.classList.add(classe); // après un redimensionnement
      this.chemins.set(e.pays.id, p);
      pays.append(p);
      // Les entités au statut « conteste » ne sont pas dans la couche contestees : on les hachure aussi.
      if (e.pays.statut === 'conteste') hachures.append(el('path', { class: 'hachure', 'data-id': e.pays.id, d: traces[i] ?? '', fill: `url(#${this.idMotif})` }));
    });
    this.o.donnees.contestees.forEach((z, i) => {
      hachures.append(el('path', { class: 'hachure zone-contestee', 'data-id': z.forme.properties.id, d: zones[i] ?? '', fill: `url(#${this.idMotif})` }));
    });
    this.coucheMarques = el('g', { class: 'couche-marques' });
    this.couchePastilles = el('g', { class: 'couche-pastilles' });
    this.coucheContours = el('g', { class: 'couche-contours' });
    this.coucheLignes = el('g', { class: 'couche-lignes' });
    this.coucheAllumees = el('g', { class: 'couche-allumees' });
    this.echelle = echelle;
    this.traceLignes = fabriqueLignes((l1, h1) => cadre.projection(l1, h1), this.proj);
    if (this.couche) echelle.append(...this.tracerMers(this.couche, d, this.traceLignes));
    echelle.append(pays, this.coucheLignes, this.coucheAllumees, hachures, this.coucheContours);
    this.tracerLignes();
    for (const [id, classes] of this.marques) if (classes.has('faux')) this.contourFaux(id); // après un redimensionnement
    this.vue.append(echelle, this.coucheMarques, this.couchePastilles);
    this.majHachures(1);
    this.svg.append(defs, this.vue);
    if (!this.enveloppe.isConnected) this.hote.prepend(this.enveloppe);

    this.limiter(l, h);
    const s = select(this.hote).call(this.comportement).on('dblclick.zoom', null);
    this.comportement.transform(s, zoomIdentity.translate(vise.x, vise.y).scale(vise.k));
    this.t = { ...vise };
    this.poser(this.t);
    this.majPastilles();
    this.majNoms();
    const t2 = performance.now();
    this.observateur.observe(this.hote);
    return { chemins_ms: t1 - t0, insertion_ms: t2 - t1, caracteres_chemins: sphere.length + traces.reduce((a, s2) => a + s2.length, 0) };
  }

  get projection(): GeoProjection {
    return this.proj;
  }

  get transfo(): Transfo {
    return { ...this.t };
  }

  get nbPastilles(): number {
    return this.pastilles.length;
  }

  /** La couche marine y est (mers, lieux) une fois posée (prendreMers) : seule une cible marine la parcourt. */
  contexte(): ContexteCarte {
    const d = this.o.donnees;
    return { proj: this.proj, t: this.t, entites: d.entites, pastilles: this.pastilles, acceptes: acceptesDe(d), mers: d.mers, lieux: this.lieux };
  }

  contexteFinal(): ContexteCarte {
    return this.arrivee ? { ...this.contexte(), t: { ...this.arrivee } } : this.contexte();
  }

  /** Ce qui est sous (x, y), px CSS relatifs au coin de la carte. */
  pick(x: number, y: number): ResultatPick | null {
    return pick(this.contexte(), x, y);
  }

  noter(cible: string, x: number, y: number, options?: OptionsNoter): Note {
    return noter(this.contexte(), cible, x, y, options);
  }

  /** Point (px relatifs à la carte) où toucher un pays (ou une mer) : sa pastille ou son point d'étiquette. */
  ecran(id: string): [number, number] | null {
    const p = this.pastilles.find((pa) => pa.id === id);
    if (p) return versEcran(this.t, p.bx, p.by);
    const li = this.lieux.get(id);
    const b = li && this.proj(li.lieu.point);
    return b ? versEcran(this.t, b[0], b[1]) : null;
  }

  /** Centre la vue sur un pays, son plus grand polygone sur environ un quart de l'écran. */
  zoomerSur(id: string): void {
    const t = this.vise(id, this.cadre.zoomMax);
    if (t) this.zoomer(t);
  }

  /**
   * Montre un pays (« Voir » de la vue Toucher) par un vol animé de d3-zoom :
   * l'interpolation de van Wijk et Nuij recule puis avance, on voit donc où
   * il est avant d'arriver dessus. Zoom borné à 40 dans le monde (voisins à
   * l'écran), zoomMaxMontrer du cadre ailleurs. Centré dans la partie
   * visible (hVisible : au-dessus de la barre de Nommer), pas sous elle. Un
   * geste interrompt le vol ; sans animation si le système la réduit.
   */
  montrer(id: string, hVisible?: number): void {
    const t = this.vise(id, this.cadre.zoomMaxMontrer, hVisible, true);
    if (t) this.voler(t);
  }

  /** Une emprise entière dans la partie visible (carte plane : une emprise à cheval sur le bord de la carte la prend en entier). */
  cadrer(e: Emprise, hVisible?: number): void {
    const t = this.viserEmprise(e, this.cadre.zoomMaxMontrer, hVisible ?? this.taille.h);
    if (t) this.voler(t);
  }

  /** La transformation qui met l'emprise entière dans l × h (h : la partie visible), son milieu au centre, au zoom kMax au plus. */
  private viserEmprise(e: Emprise, kMax: number, h: number): Transfo | null {
    const b = this.proj(centreEmprise(e));
    if (!b) return null;
    const boite = empriseEcran(contourEmprise(e), (ll) => this.proj(ll) as [number, number] | null);
    return viser([b[0], b[1]], 0, this.taille.l, Math.max(1, Math.min(h, this.taille.h)), kMax, boite);
  }

  zoomerDe(facteur: number): void {
    if (this.gesteEnCours) return;
    const base = this.arrivee ?? this.t;
    const k = Math.min(this.cadre.zoomMax, Math.max(1, base.k * facteur));
    if (k === base.k) return;
    // Le centre de la carte reste au centre, puis la borne des gestes (translateExtent) :
    // zoom.transform, que fait voler(), ne l'applique pas.
    const { l, h } = this.taille;
    const s = k / base.k;
    const vise = zoomIdentity.translate(l / 2 - s * (l / 2 - base.x), h / 2 - s * (h / 2 - base.y)).scale(k);
    const t = this.comportement.constrain()(vise, [[0, 0], [l, h]], this.comportement.translateExtent());
    this.voler({ k: t.k, x: t.x, y: t.y }, DUREE_CRAN_MS);
  }

  vueEntiere(): void {
    if (this.gesteEnCours) return;
    const base = this.arrivee ?? this.t;
    if (base.k === 1 && base.x === 0 && base.y === 0) return;
    // La vue que pose rendre() au départ.
    this.voler({ k: 1, x: 0, y: 0 }, DUREE_TOUT_MS);
  }

  /** Un doigt, la souris ou la molette bouge la carte en ce moment (d3-zoom entre start et end). */
  private get gesteEnCours(): boolean {
    return this.parUtilisateur && this.enGeste;
  }

  /** Le vol de montrer(), de cadrer() et des boutons de zoom jusqu'à t, d'une durée bornée par duree (ms). */
  private voler(t: Transfo, duree: { min: number; max: number } = DUREE_MONTRER_MS): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return this.zoomer(t);
    const { l, h } = this.taille;
    const vue = (v: Transfo): [number, number, number] => [(l / 2 - v.x) / v.k, (h / 2 - v.y) / v.k, Math.max(l, h) / v.k];
    const naturelle = interpolateZoom(vue(this.t), vue(t)).duration;
    // Pendant le vol, les disques du zoom de départ ne sont pas recalculés (fin()) :
    // ils couvriraient l'Europe d'un départ au zoom 1. Cachés jusqu'à l'arrivée
    // (ou au geste qui interrompt le vol). Posé au début de la transition, après
    // l'interruption d'un vol précédent, dont la fin retire la classe.
    // L'arrivée vaut jusqu'à la fin du vol, son interruption (geste, zoomer, autre vol) ou son annulation avant le départ.
    const arrivee = { ...t };
    this.arrivee = arrivee;
    const fini = () => {
      if (this.arrivee === arrivee) this.arrivee = null;
    };
    select(this.hote)
      .transition()
      .duration(Math.min(duree.max, Math.max(duree.min, naturelle)))
      .on('start', () => this.hote.classList.add('en-vol'))
      .on('end.arrivee interrupt.arrivee cancel.arrivee', fini)
      .call(this.comportement.transform, zoomIdentity.translate(t.x, t.y).scale(t.k));
  }

  /**
   * La transformation qui centre un pays dans l × h (h : la partie visible),
   * son plus grand polygone sur un quart de l'écran, au zoom kMax au plus ;
   * entier (ce polygone tient à l'écran) si demandé, pour montrer().
   */
  private vise(id: string, kMax: number, h = this.taille.h, entier = false): Transfo | null {
    const li = this.lieux.get(id);
    if (li?.couche === 'mers') {
      // Une mer par son emprise entière (étude J2, § 4.5), comme cadrer(), pas
      // par son polygone principal (une moitié du Pacifique) ; une bande de
      // 360° (l'Arctique, l'Austral) autour du méridien central de la projection.
      const e = empriseMer(id, this.o.donnees.mers.map((m) => m.pays));
      return e ? this.viserEmprise(recentrerBande(e, -(this.proj.rotate()[0] ?? 0)), kMax, h) : null;
    }
    const b = li && this.proj(li.lieu.point);
    if (!li || !b) return null;
    const boite = entier ? empriseEcran(anneauPrincipal(li.forme, li.lieu.point), (ll) => this.proj(ll) as [number, number] | null) : null;
    return viser([b[0], b[1]], tailleEcranPx(li.lieu, this.proj.scale(), 1), this.taille.l, Math.max(1, Math.min(h, this.taille.h)), kMax, boite);
  }

  /** Pose une transformation (sans geste : non comptée dans les mesures). */
  zoomer(t: Transfo): void {
    this.arrivee = null;
    this.comportement.transform(select(this.hote), zoomIdentity.translate(t.x, t.y).scale(t.k));
  }

  marquer(id: string, classe: string): void {
    let s = this.marques.get(id);
    if (!s) this.marques.set(id, (s = new Set()));
    s.add(classe);
    this.chemins.get(id)?.classList.add(classe);
    this.cerclesPastilles.get(id)?.classList.add(classe);
    for (const z of this.allumees(id)) this.cheminsMers.get(z)?.classList.add(classe);
    if (classe === 'faux') this.contourFaux(id);
    this.majAllumees();
  }

  /** Les zones marines qu'allume une marque sur id (zonesAllumees) ; aucune pour un pays. */
  private allumees(id: string): string[] {
    return this.lieux.get(id)?.couche === 'mers' ? zonesAllumees(id, this.zonesMers) : [];
  }

  prendreMers(c: CoucheMers): void {
    if (this.couche) return;
    if (!this.o.donnees.mers.length) this.o.donnees.mers = c.mers;
    this.couche = c;
    this.zonesMers = c.mers.map((e) => e.pays);
    this.lieux = indexLieux({ entites: this.o.donnees.entites, mers: c.mers });
    if (!this.echelle || !this.proj) return; // tracées par rendre()
    const cadre = this.cadre;
    const creer = (l1: number, h1: number) => cadre.projection(l1, h1);
    const [mers, contours] = this.tracerMers(c, fabriqueTraces(creer, this.proj), fabriqueLignes(creer, this.proj));
    this.echelle.prepend(mers, contours);
    for (const [id, classes] of this.marques) if (classes.has('faux')) this.contourFaux(id); // marquée avant la couche
  }

  /**
   * g.couche-mers (un path.mer par zone, ses classes de teinte et de marque) et
   * g.couche-contours-mers (les contours faux déjà demandés), à poser avant
   * g.couche-pays.
   */
  private tracerMers(c: CoucheMers, d: (f: Forme) => string, lignes: (l: Position[][]) => string): [SVGGElement, SVGGElement] {
    const mers = el('g', { class: 'couche-mers' });
    this.cheminsMers.clear();
    this.contoursMers.clear();
    const parId = new Map(c.mers.map((e) => [e.pays.id, e]));
    this.contourMer = (id) => {
      const e = parId.get(id);
      return e ? lignes(lignesContour(formeContour(e, c.mers))) : null;
    };
    const classes = new Map<string, Set<string>>();
    for (const [id, cl] of this.marques) {
      for (const z of this.allumees(id)) {
        const s = classes.get(z) ?? new Set<string>();
        for (const x of cl) s.add(x);
        classes.set(z, s);
      }
    }
    for (const e of c.mers) {
      // Coutures de ±180 densifiées, comme en Canvas : sinon leur corde laisse un croissant non teinté au bord de l'ovale.
      const trace = d(densifierCoutures(e.forme));
      const p = el('path', { class: 'mer', 'data-id': e.pays.id, d: trace });
      const teinte = this.teintes.get(e.pays.id);
      if (teinte) p.classList.add(teinte);
      for (const cl of classes.get(e.pays.id) ?? []) p.classList.add(cl);
      this.cheminsMers.set(e.pays.id, p);
      mers.append(p);
    }
    this.coucheContoursMers = el('g', { class: 'couche-contours-mers' });
    return [mers, this.coucheContoursMers];
  }

  cacherPastilles(oui: boolean): void {
    if (oui === this.sansPastilles) return;
    this.sansPastilles = oui;
    // Avant le premier rendre() : il les calculera.
    if (this.couchePastilles) this.majPastilles();
  }

  get nbTeintes(): number {
    return this.teintes.size;
  }

  get nbAnneaux(): number {
    return this.anneaux.length;
  }

  teinter(t: Teintes | null): void {
    const avant = this.teintes;
    this.teintes = new Map();
    for (const [id, s] of t ?? []) {
      const n = seau(s);
      if (n !== null) this.teintes.set(id, classeSeau(n));
    }
    for (const id of new Set([...avant.keys(), ...this.teintes.keys()])) {
      const [de, vers] = [avant.get(id), this.teintes.get(id)];
      if (de === vers) continue;
      for (const elt of [this.chemins.get(id), this.cerclesPastilles.get(id), this.cheminsMers.get(id)]) {
        if (de) elt?.classList.remove(de);
        if (vers) elt?.classList.add(vers);
      }
    }
  }

  /** Le contour de la zone fausse, sur sa couche (coucheContours, ou coucheContoursMers pour une mer) ; une fois par zone. */
  private contourFaux(id: string): void {
    if (this.cheminsMers.has(id)) {
      if (this.contoursMers.has(id) || !this.coucheContoursMers) return;
      const traceMer = this.contourMer?.(id) ?? null;
      if (traceMer === null) return;
      const c = el('path', { class: 'contour-faux', 'data-id': id, d: traceMer });
      this.coucheContoursMers.append(c);
      this.contoursMers.set(id, c);
      return;
    }
    const chemin = this.chemins.get(id);
    if (!chemin || this.contours.has(id) || !this.coucheContours) return;
    const c = el('path', { class: 'contour-faux', 'data-id': id, d: chemin.getAttribute('d') ?? '' });
    this.coucheContours.append(c);
    this.contours.set(id, c);
  }

  effacerMarques(): void {
    for (const [id, classes] of this.marques) {
      this.chemins.get(id)?.classList.remove(...classes);
      this.cerclesPastilles.get(id)?.classList.remove(...classes);
      for (const z of this.allumees(id)) this.cheminsMers.get(z)?.classList.remove(...classes);
    }
    this.marques.clear();
    for (const c of [...this.contours.values(), ...this.contoursMers.values()]) c.remove();
    this.contours.clear();
    this.contoursMers.clear();
    for (const a of this.anneaux) a.cercle.remove();
    this.anneaux = [];
    this.majAllumees();
  }

  lignes(l: readonly LigneRepere[]): void {
    if (l.length === this.lignesPosees.length && l.every((x, i) => x.id === this.lignesPosees[i]?.id && x.nom === this.lignesPosees[i]?.nom)) return;
    this.lignesPosees = [...l];
    this.hote.dataset.lignes = String(l.length);
    // Le monde seul : placerNoms suit Equal Earth, pas la Mercator d'une carte locale.
    if (l.length && !this.o.cadre) this.noms ??= new CoucheNoms(this.hote, () => this.majNoms());
    this.tracerLignes();
    this.majNoms();
  }

  get nbLignes(): number {
    return this.lignesPosees.length;
  }

  /** Le tracé des lignes (en UNITE, geoPath : coupé à l'antiméridien de la projection) ; les zones allumées au-dessus. */
  private tracerLignes(): void {
    const g = this.coucheLignes;
    if (!g || !this.traceLignes) return;
    g.replaceChildren();
    if (this.lignesPosees.length) g.append(el('path', { class: 'ligne-repere', d: this.traceLignes(this.lignesPosees.map(coordonnees)) }));
    this.majAllumees();
  }

  /**
   * Une copie de chaque zone marquée par-dessus les lignes (aucune sans ligne :
   * rien à couvrir). Les mers d'abord (path.mer et la marque, ce qu'allume
   * chacune : zonesAllumees), sous un masque qui retire les terres de leur
   * emprise et leur côte (mask.masque-terres) : une mer déborde sur les
   * terres, qui la couvrent dans g.couche-pays ; sa copie, au-dessus des
   * pays, les couvrirait. Le Canvas efface de même les terres de sa couche
   * du dessus.
   */
  private majAllumees(): void {
    const g = this.coucheAllumees;
    if (!g) return;
    g.replaceChildren();
    if (!this.lignesPosees.length) return;
    const mers: [string, Set<string>][] = [];
    const emprises: Emprise[] = [];
    for (const [id, classes] of this.marques) {
      if (!classes.size) continue;
      const zones = this.allumees(id);
      for (const z of zones) if (this.cheminsMers.has(z)) mers.push([z, classes]);
      const e = zones.length ? empriseMer(id, this.zonesMers) : null;
      if (e) emprises.push(e);
    }
    if (mers.length) {
      const terres: string[] = [];
      for (const [id, li] of this.lieux) {
        if (li.couche !== 'pays' || !emprises.some((e) => emprisesSeCroisent(e, li.lieu.bbox))) continue;
        const d = this.chemins.get(id)?.getAttribute('d');
        if (d) terres.push(d);
      }
      const idMasque = this.idMotif.replace('hachures', 'terres-allumees');
      const masque = el('mask', { id: idMasque, class: 'masque-terres' });
      masque.append(el('rect', { x: -1e7, y: -1e7, width: 2e7, height: 2e7, fill: '#fff' }));
      if (terres.length) masque.append(el('path', { class: 'masque-terres-trace', d: terres.join(' ') }));
      g.append(masque);
      for (const [z, classes] of mers) {
        const d = this.cheminsMers.get(z)?.getAttribute('d') ?? '';
        g.append(el('path', { class: `mer allumee-mer ${[...classes].join(' ')}`, d, mask: `url(#${idMasque})` }));
      }
    }
    for (const [id, classes] of this.marques) {
      const chemin = this.chemins.get(id);
      if (!chemin || !classes.size) continue;
      g.append(el('path', { class: `allumee ${[...classes].join(' ')}`, d: chemin.getAttribute('d') ?? '' }));
    }
  }

  /** Noms des lignes à l'arrêt (placerNoms), les pastilles et les anneaux en obstacles. */
  private majNoms(): void {
    const noms = this.noms;
    if (!noms) return;
    if (!this.lignesPosees.length) return noms.poser([]);
    if (this.enGeste) return noms.cacher();
    const t = this.t;
    const r = PASTILLE.rayon_visible_px + 1;
    const obstacles: Boite[] = [];
    for (const p of this.pastilles) {
      if (!p.visible) continue;
      const [x, y] = versEcran(t, p.bx, p.by);
      obstacles.push({ x: x - r, y: y - r, l: 2 * r, h: 2 * r });
    }
    for (const a of this.anneaux) {
      const cx = Number(a.cercle.getAttribute('cx'));
      const cy = Number(a.cercle.getAttribute('cy'));
      const [x, y] = versEcran(t, cx, cy);
      obstacles.push({ x: x - a.rayon_px - 1, y: y - a.rayon_px - 1, l: 2 * a.rayon_px + 2, h: 2 * a.rayon_px + 2 });
    }
    noms.poser(placerNoms(repere(t, this.proj, this.taille.l, this.taille.h), this.lignesPosees, (s) => noms.largeur(s), obstacles));
  }

  /** Un anneau de taille constante autour du point d'un pays (montrer la bonne réponse). */
  anneau(id: string, classe: string, rayon_px = 16): void {
    const li = this.lieux.get(id);
    if (li) this.anneauEn(li.lieu.point, classe, rayon_px);
  }

  anneauEn(point: [number, number], classe: string, rayon_px = 16): void {
    const b = this.proj(point);
    if (!b) return;
    const c = el('circle', { class: `anneau ${classe}`, cx: b[0], cy: b[1], r: rayon_px / this.applique.k });
    this.coucheMarques.append(c);
    this.anneaux.push({ cercle: c, rayon_px });
    this.majNoms();
  }

  detruire(): void {
    this.observateur.disconnect();
    for (const [type, l] of this.ecouteurs) this.hote.removeEventListener(type, l);
    select(this.hote).on('.zoom', null);
    this.enveloppe.remove();
    this.noms?.detruire();
  }

  // --- interne -------------------------------------------------------------

  private local(ev: PointerEvent): [number, number] {
    const r = this.hote.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  private debut(e: D3ZoomEvent<HTMLElement, unknown>): void {
    this.aBouge = false;
    this.parUtilisateur = !!e.sourceEvent;
    this.enGeste = true;
    this.noms?.cacher();
    if (this.parUtilisateur) this.o.gestes?.debut?.({ k: e.transform.k, x: e.transform.x, y: e.transform.y }, e.sourceEvent as Event);
  }

  private mouvement(e: D3ZoomEvent<HTMLElement, unknown>): void {
    const t = e.transform;
    this.t = { k: t.k, x: t.x, y: t.y };
    this.aBouge = true;
    if (!this.parUtilisateur) {
      this.poser(this.t);
      return;
    }
    if (this.o.rendu === 'g') {
      this.poser(this.t);
    } else {
      const a = this.applique;
      const s = t.k / a.k;
      this.enveloppe.style.transform = `translate(${t.x - s * a.x}px, ${t.y - s * a.y}px) scale(${s})`;
    }
    this.o.gestes?.mouvement?.(this.t, (e.sourceEvent as Event | null) ?? null);
  }

  private fin(e: D3ZoomEvent<HTMLElement, unknown>): void {
    const t0 = performance.now();
    if (this.aBouge) {
      if (this.o.rendu === 'css') {
        this.poser(this.t);
        this.enveloppe.style.transform = '';
      }
      this.majPastilles();
      this.majHachures(this.t.k);
    }
    this.hote.classList.remove('en-vol');
    this.enGeste = false;
    this.majNoms();
    const script_ms = performance.now() - t0;
    if (this.parUtilisateur) {
      this.o.gestes?.fin?.({
        a_bouge: this.aBouge,
        source: (e.sourceEvent as Event | null) ?? null,
        script_ms,
        image: deuxImages().then(() => performance.now() - t0),
      });
    }
    this.aBouge = false;
    this.parUtilisateur = false;
  }

  /** Hachures au pas constant à l'écran (le motif vit dans le repère des tracés). */
  private majHachures(k: number): void {
    this.motif.setAttribute('patternTransform', `scale(${UNITE / k}) rotate(45)`);
  }

  /** Pose la transformation sur le <g> et garde les rayons constants à l'écran. */
  private poser(t: Transfo): void {
    this.applique = { ...t };
    this.vue.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
    if (t.k !== this.kRayons) {
      this.kRayons = t.k;
      for (const disque of this.cerclesPastilles.values()) disque.setAttribute('r', String(PASTILLE.rayon_visible_px / t.k));
      for (const a of this.anneaux) a.cercle.setAttribute('r', String(a.rayon_px / t.k));
    }
  }

  /** Recalcule l'ensemble des pastilles pour le zoom courant (fin de geste). */
  private majPastilles(): void {
    const k = this.applique.k;
    this.pastilles = this.cadre.pastilles && !this.sansPastilles ? calculerPastilles(this.o.donnees.entites, this.proj, k) : [];
    const voulues = new Set(this.pastilles.filter((p) => p.visible).map((p) => p.id));
    for (const [id, disque] of this.cerclesPastilles) {
      if (!voulues.has(id)) {
        disque.remove();
        this.cerclesPastilles.delete(id);
      }
    }
    for (const p of this.pastilles) {
      if (!p.visible || this.cerclesPastilles.has(p.id)) continue;
      // La cible de 44 px n'est pas dessinée : pick() la calcule (pastilleLaPlusProche).
      const disque = el('circle', { class: 'pastille', 'data-id': p.id, cx: p.bx, cy: p.by, r: PASTILLE.rayon_visible_px / k });
      const teinte = this.teintes.get(p.id);
      if (teinte) disque.classList.add(teinte);
      for (const classe of this.marques.get(p.id) ?? []) disque.classList.add(classe);
      this.couchePastilles.append(disque);
      this.cerclesPastilles.set(p.id, disque);
    }
    this.kRayons = k;
    for (const disque of this.cerclesPastilles.values()) disque.setAttribute('r', String(PASTILLE.rayon_visible_px / k));
    this.hote.dataset.pastilles = String(this.pastilles.length);
    this.hote.dataset.disques = String(voulues.size);
  }

  /**
   * Carte masquée (vue Saisie) ou de nouveau visible. Masquée, elle ne se
   * retrace pas : le clavier qui redimensionne la page coûtait deux longues
   * images (300 à 370 ms au processeur ralenti 4×) et le zoom. Au retour, elle
   * se retrace si sa taille a changé entre-temps.
   */
  masquer(oui: boolean): void {
    this.masquee = oui;
    if (!oui) this.redimensionner();
  }

  private redimensionner(): void {
    const l = this.hote.clientWidth;
    const h = this.hote.clientHeight;
    if (!l || !h || (l === this.taille.l && h === this.taille.h)) return;
    // La barre d'adresse du téléphone change la hauteur sans cesse : on ne refait
    // les tracés (~200 ms) que si la largeur change ou la hauteur de plus de 15 %.
    if (l !== this.taille.l || Math.abs(h - this.taille.h) > 0.15 * this.taille.h) {
      if (!this.masquee) this.rendre(); // masquée : au retour (masquer(false))
      return;
    }
    this.taille.h = h;
    this.svg.setAttribute('height', String(h));
    this.limiter(l, h);
    this.majNoms();
  }

  /**
   * Le déplacement s'arrête aux bords de la sphère (pas aux bandes vides
   * au-dessus et au-dessous du monde sur un écran en hauteur) ; sur une carte
   * locale, aux bords de sa borne élargie à l'écran (rien ne bouge au zoom 1).
   */
  private limiter(l: number, h: number): void {
    const [[x0, y0], [x1, y1]] = geoPath(this.proj).bounds(this.cadre.borne);
    const [haut, bas] = this.cadre.borneHauteurEcran ? [Math.min(0, y0), Math.max(h, y1)] : [y0, y1];
    this.comportement.extent([[0, 0], [l, h]]).translateExtent([[Math.min(0, x0), haut], [Math.max(l, x1), bas]]);
  }
}
