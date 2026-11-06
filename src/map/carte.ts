// Carte SVG au doigt : rendu, zoom et déplacement (d3-zoom), pastilles, touchers.
// Tout ce qui décide (pick, noter, pastilles, seuil du toucher) est pur, dans
// les modules voisins ; ce fichier ne fait que le DOM.
import { geoPath, type GeoPermissibleObjects, type GeoProjection } from 'd3-geo';
import { interpolateZoom } from 'd3-interpolate';
import { select } from 'd3-selection';
import 'd3-transition'; // selection.transition(), pour le vol de montrer()
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import type { DonneesCarte } from './donnees';
import { anneauPrincipal, centreEmprise, contourEmprise, empriseEcran, versEcran, viser, type Emprise } from './geo';
import { calculerPastilles, PASTILLE, tailleEcranPx, type Pastille } from './pastilles';
import { noter, pick, type ContexteCarte, type Note, type ResultatPick } from './pick';
import { creerProjection, garderVue } from './projection';
import { fabriqueTraces, UNITE } from './traces';
import { SuiviPointeurs } from './geste';
import { classeSeau, seau, type Teintes } from './teintes';
import type { Entite, Lieu, NomProjection, Pays, Rendu, Transfo } from './types';

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
  noter(cible: string, x: number, y: number): Note;
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
  marquer(id: string, classe: string): void;
  effacerMarques(): void;
  anneau(id: string, classe: string, rayon_px?: number): void;
  /**
   * Carte de la mémoire : chaque zone de t prend la couleur de son seau
   * (--memoire-<seau>, teintes.ts) ; absente, ou t null, --terre. À part des
   * marques : effacerMarques ne les retire pas, et les marques, hachures et
   * contour faux restent par-dessus. Copiées : changer t ensuite ne change
   * rien sans un nouvel appel.
   */
  teinter(t: Teintes | null): void;
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
  private cerclesPastilles = new Map<string, SVGCircleElement>();
  private marques = new Map<string, Set<string>>();
  /** Classe de teinte (.s0 à .s4) de chaque zone teintée : à part des marques, reposée sur les tracés et disques recréés. */
  private teintes = new Map<string, string>();
  private anneaux: { cercle: SVGCircleElement; rayon_px: number }[] = [];
  private pastilles: Pastille[] = [];
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

  constructor(private readonly o: OptionsCarte<Lieu>) {
    this.cadre = o.cadre ?? cadreMonde(o.projection);
    this.idMotif = o.cadre ? `hachures-${o.hote.id || 'cadre'}` : 'hachures';
    this.hote = o.hote;
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
    echelle.append(pays, hachures, this.coucheContours);
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

  contexte(): ContexteCarte {
    return { proj: this.proj, t: this.t, entites: this.o.donnees.entites, pastilles: this.pastilles };
  }

  contexteFinal(): ContexteCarte {
    return this.arrivee ? { ...this.contexte(), t: { ...this.arrivee } } : this.contexte();
  }

  /** Ce qui est sous (x, y), px CSS relatifs au coin de la carte. */
  pick(x: number, y: number): ResultatPick | null {
    return pick(this.contexte(), x, y);
  }

  noter(cible: string, x: number, y: number): Note {
    return noter(this.contexte(), cible, x, y);
  }

  /** Point (px relatifs à la carte) où toucher un pays : sa pastille ou son point d'étiquette. */
  ecran(id: string): [number, number] | null {
    const p = this.pastilles.find((pa) => pa.id === id);
    if (p) return versEcran(this.t, p.bx, p.by);
    const e = this.o.donnees.entites.find((en) => en.pays.id === id);
    const b = e && this.proj(e.pays.point);
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
    const b = this.proj(centreEmprise(e));
    if (!b) return;
    const boite = empriseEcran(contourEmprise(e), (ll) => this.proj(ll) as [number, number] | null);
    const h = Math.max(1, Math.min(hVisible ?? this.taille.h, this.taille.h));
    this.voler(viser([b[0], b[1]], 0, this.taille.l, h, this.cadre.zoomMaxMontrer, boite));
  }

  /** Le vol de montrer() et de cadrer() jusqu'à t. */
  private voler(t: Transfo): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return this.zoomer(t);
    const { l, h } = this.taille;
    const vue = (v: Transfo): [number, number, number] => [(l / 2 - v.x) / v.k, (h / 2 - v.y) / v.k, Math.max(l, h) / v.k];
    const duree = interpolateZoom(vue(this.t), vue(t)).duration;
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
      .duration(Math.min(DUREE_MONTRER_MS.max, Math.max(DUREE_MONTRER_MS.min, duree)))
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
    const e = this.o.donnees.entites.find((en) => en.pays.id === id);
    const b = e && this.proj(e.pays.point);
    if (!e || !b) return null;
    const boite = entier ? empriseEcran(anneauPrincipal(e.forme, e.pays.point), (ll) => this.proj(ll) as [number, number] | null) : null;
    return viser([b[0], b[1]], tailleEcranPx(e.pays, this.proj.scale(), 1), this.taille.l, Math.max(1, Math.min(h, this.taille.h)), kMax, boite);
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
    if (classe === 'faux') this.contourFaux(id);
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
      for (const elt of [this.chemins.get(id), this.cerclesPastilles.get(id)]) {
        if (de) elt?.classList.remove(de);
        if (vers) elt?.classList.add(vers);
      }
    }
  }

  /** Le contour de la zone fausse, sur sa couche (coucheContours) ; une fois par zone. */
  private contourFaux(id: string): void {
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
    }
    this.marques.clear();
    for (const c of this.contours.values()) c.remove();
    this.contours.clear();
    for (const a of this.anneaux) a.cercle.remove();
    this.anneaux = [];
  }

  /** Un anneau de taille constante autour du point d'un pays (montrer la bonne réponse). */
  anneau(id: string, classe: string, rayon_px = 16): void {
    const e = this.o.donnees.entites.find((en) => en.pays.id === id);
    const b = e && this.proj(e.pays.point);
    if (!b) return;
    const c = el('circle', { class: `anneau ${classe}`, cx: b[0], cy: b[1], r: rayon_px / this.applique.k });
    this.coucheMarques.append(c);
    this.anneaux.push({ cercle: c, rayon_px });
  }

  detruire(): void {
    this.observateur.disconnect();
    for (const [type, l] of this.ecouteurs) this.hote.removeEventListener(type, l);
    select(this.hote).on('.zoom', null);
    this.enveloppe.remove();
  }

  // --- interne -------------------------------------------------------------

  private local(ev: PointerEvent): [number, number] {
    const r = this.hote.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  private debut(e: D3ZoomEvent<HTMLElement, unknown>): void {
    this.aBouge = false;
    this.parUtilisateur = !!e.sourceEvent;
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
    this.pastilles = this.cadre.pastilles ? calculerPastilles(this.o.donnees.entites, this.proj, k) : [];
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
