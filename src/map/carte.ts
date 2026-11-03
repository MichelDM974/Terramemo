// Carte SVG au doigt : rendu, zoom et déplacement (d3-zoom), pastilles, touchers.
// Tout ce qui décide (pick, noter, pastilles, seuil du toucher) est pur, dans
// les modules voisins ; ce fichier ne fait que le DOM.
import { geoPath, type GeoProjection } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import type { DonneesCarte } from './donnees';
import { versEcran } from './geo';
import { calculerPastilles, PASTILLE, tailleEcranPx, type Pastille } from './pastilles';
import { noter, pick, type ContexteCarte, type Note, type ResultatPick } from './pick';
import { creerProjection } from './projection';
import { fabriqueTraces, UNITE } from './traces';
import { SuiviPointeurs } from './geste';
import type { Entite, NomProjection, Rendu, Transfo } from './types';

const SVG = 'http://www.w3.org/2000/svg';
export const ZOOM_MAX = 400;
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
  /** Du début de la fin du geste à l'image suivante (double requestAnimationFrame). */
  image: Promise<number>;
}

export interface EcouteGestes {
  debut?(source: Event | null): void;
  mouvement?(t: Transfo, source: Event | null): void;
  fin?(f: FinDeGeste): void;
}

export interface OptionsCarte {
  hote: HTMLElement;
  donnees: DonneesCarte;
  projection: NomProjection;
  rendu: Rendu;
  surToucher?: (x: number, y: number, ev: PointerEvent) => void;
  gestes?: EcouteGestes;
}

const deuxImages = () => new Promise<number>((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));

function el<K extends keyof SVGElementTagNameMap>(nom: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, nom);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export class Carte {
  readonly hote: HTMLElement;
  readonly enveloppe: HTMLDivElement;
  readonly svg: SVGSVGElement;
  private vue!: SVGGElement;
  private motif!: SVGPatternElement;
  private couchePastilles!: SVGGElement;
  private coucheMarques!: SVGGElement;
  private chemins = new Map<string, SVGPathElement>();
  private cerclesPastilles = new Map<string, SVGCircleElement>();
  private marques = new Map<string, Set<string>>();
  private anneaux: { cercle: SVGCircleElement; rayon_px: number }[] = [];
  private pastilles: Pastille[] = [];
  private proj!: GeoProjection;
  private comportement: ZoomBehavior<HTMLElement, unknown>;
  private t: Transfo = { k: 1, x: 0, y: 0 };
  /** Transformation posée sur le <g> (en mode css, elle retarde sur t pendant le geste). */
  private applique: Transfo = { k: 1, x: 0, y: 0 };
  private kRayons = 1;
  private aBouge = false;
  /** Le geste en cours vient d'un doigt, de la souris ou de la molette (pas de zoomer()). */
  private parUtilisateur = false;
  private taille = { l: 0, h: 0 };
  private suivi = new SuiviPointeurs();
  private observateur: ResizeObserver;
  private ecouteurs: [string, EventListener][] = [];

  constructor(private readonly o: OptionsCarte) {
    this.hote = o.hote;
    this.hote.classList.add('carte');
    this.hote.dataset.rendu = o.rendu;
    this.hote.dataset.projection = o.projection;
    this.enveloppe = document.createElement('div');
    this.enveloppe.className = 'carte-enveloppe';
    this.svg = el('svg', { class: 'carte-svg', role: 'img', 'aria-label': 'Carte du monde' });
    this.enveloppe.append(this.svg);

    this.comportement = zoom<HTMLElement, unknown>()
      .scaleExtent([1, ZOOM_MAX])
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
      this.suivi.bas(ev.pointerId, x, y, ev.timeStamp);
    });
    sur('pointermove', (ev) => {
      const [x, y] = this.local(ev);
      this.suivi.bouge(ev.pointerId, x, y);
    });
    sur('pointercancel', (ev) => this.suivi.annule(ev.pointerId));
    sur('pointerup', (ev) => {
      const [x, y] = this.local(ev);
      const toucher = this.suivi.haut(ev.pointerId, x, y, ev.timeStamp);
      if (toucher) this.o.surToucher?.(toucher.x, toucher.y, ev);
    });

    this.observateur = new ResizeObserver(() => this.redimensionner());
  }

  /** Dessine la carte ; rend la durée de la génération des tracés et de l'insertion. */
  rendre(): ChronoRendu {
    const l = this.hote.clientWidth || window.innerWidth;
    const h = this.hote.clientHeight || window.innerHeight;
    this.taille = { l, h };
    const t0 = performance.now();
    this.proj = creerProjection(this.o.projection, l, h);
    const d = fabriqueTraces(this.o.projection, this.proj);
    const sphere = geoPath(this.proj).digits(DECIMALES)({ type: 'Sphere' }) ?? '';
    const traces = this.o.donnees.entites.map((e) => d(e.forme));
    const zones = this.o.donnees.contestees.map((z) => d(z.forme));
    const t1 = performance.now();

    this.svg.replaceChildren();
    this.chemins.clear();
    this.cerclesPastilles.clear();
    this.anneaux = [];
    this.svg.setAttribute('width', String(l));
    this.svg.setAttribute('height', String(h));
    const defs = el('defs');
    this.motif = el('pattern', { id: 'hachures', patternUnits: 'userSpaceOnUse', width: PAS_HACHURES, height: PAS_HACHURES });
    this.motif.append(el('line', { class: 'hachure-trait', x1: 1, y1: 0, x2: 1, y2: PAS_HACHURES }));
    defs.append(this.motif);
    this.vue = el('g', { class: 'vue' });
    this.vue.append(el('path', { class: 'sphere', d: sphere }));
    // Tracés en centièmes de px (traces.ts) : ce <g> les ramène en px de base.
    const echelle = el('g', { class: 'unite', transform: `scale(${1 / UNITE})` });
    const pays = el('g', { class: 'couche-pays' });
    const hachures = el('g', { class: 'couche-hachures' });
    this.o.donnees.entites.forEach((e: Entite, i) => {
      const p = el('path', { class: 'pays', 'data-id': e.pays.id, 'data-statut': e.pays.statut, d: traces[i] ?? '' });
      for (const classe of this.marques.get(e.pays.id) ?? []) p.classList.add(classe); // après un redimensionnement
      this.chemins.set(e.pays.id, p);
      pays.append(p);
      // Les entités au statut « conteste » ne sont pas dans la couche contestees : on les hachure aussi.
      if (e.pays.statut === 'conteste') hachures.append(el('path', { class: 'hachure', 'data-id': e.pays.id, d: traces[i] ?? '', fill: 'url(#hachures)' }));
    });
    this.o.donnees.contestees.forEach((z, i) => {
      hachures.append(el('path', { class: 'hachure zone-contestee', 'data-id': z.forme.properties.id, d: zones[i] ?? '', fill: 'url(#hachures)' }));
    });
    this.coucheMarques = el('g', { class: 'couche-marques' });
    this.couchePastilles = el('g', { class: 'couche-pastilles' });
    echelle.append(pays, hachures);
    this.vue.append(echelle, this.coucheMarques, this.couchePastilles);
    this.majHachures(1);
    this.svg.append(defs, this.vue);
    if (!this.enveloppe.isConnected) this.hote.prepend(this.enveloppe);

    this.limiter(l, h);
    const s = select(this.hote).call(this.comportement).on('dblclick.zoom', null);
    this.comportement.transform(s, zoomIdentity);
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
    const e = this.o.donnees.entites.find((en) => en.pays.id === id);
    const b = e && this.proj(e.pays.point);
    if (!e || !b) return;
    const taille1 = Math.max(tailleEcranPx(e.pays, this.proj.scale(), 1), 1e-6);
    const k = Math.min(ZOOM_MAX, Math.max(1, Math.min(this.taille.l, this.taille.h) / 4 / taille1));
    this.zoomer({ k, x: this.taille.l / 2 - k * b[0], y: this.taille.h / 2 - k * b[1] });
  }

  /** Pose une transformation (sans geste : non comptée dans les mesures). */
  zoomer(t: Transfo): void {
    this.comportement.transform(select(this.hote), zoomIdentity.translate(t.x, t.y).scale(t.k));
  }

  marquer(id: string, classe: string): void {
    let s = this.marques.get(id);
    if (!s) this.marques.set(id, (s = new Set()));
    s.add(classe);
    this.chemins.get(id)?.classList.add(classe);
    this.cerclesPastilles.get(id)?.classList.add(classe);
  }

  effacerMarques(): void {
    for (const [id, classes] of this.marques) {
      this.chemins.get(id)?.classList.remove(...classes);
      this.cerclesPastilles.get(id)?.classList.remove(...classes);
    }
    this.marques.clear();
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
    if (this.parUtilisateur) this.o.gestes?.debut?.(e.sourceEvent as Event);
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
    this.pastilles = calculerPastilles(this.o.donnees.entites, this.proj, k);
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
      for (const classe of this.marques.get(p.id) ?? []) disque.classList.add(classe);
      this.couchePastilles.append(disque);
      this.cerclesPastilles.set(p.id, disque);
    }
    this.kRayons = k;
    for (const disque of this.cerclesPastilles.values()) disque.setAttribute('r', String(PASTILLE.rayon_visible_px / k));
    this.hote.dataset.pastilles = String(this.pastilles.length);
    this.hote.dataset.disques = String(voulues.size);
  }

  private redimensionner(): void {
    const l = this.hote.clientWidth;
    const h = this.hote.clientHeight;
    if (!l || !h || (l === this.taille.l && h === this.taille.h)) return;
    // La barre d'adresse du téléphone change la hauteur sans cesse : on ne refait
    // les tracés (~200 ms) que si la largeur change ou la hauteur de plus de 15 %.
    if (l !== this.taille.l || Math.abs(h - this.taille.h) > 0.15 * this.taille.h) {
      this.t = { k: 1, x: 0, y: 0 };
      this.rendre();
      return;
    }
    this.taille.h = h;
    this.svg.setAttribute('height', String(h));
    this.limiter(l, h);
  }

  /**
   * Le déplacement s'arrête aux bords de la sphère (pas aux bandes vides
   * au-dessus et au-dessous du monde sur un écran en hauteur).
   */
  private limiter(l: number, h: number): void {
    const [[x0, y0], [x1, y1]] = geoPath(this.proj).bounds({ type: 'Sphere' });
    this.comportement.extent([[0, 0], [l, h]]).translateExtent([[Math.min(0, x0), y0], [Math.max(l, x1), y1]]);
  }
}
