// Rendu WebGL de la carte qui tourne (?rendu=webgl) : la carte complète à
// chaque image, dessinée par la carte graphique, sans carte allégée. Les
// gestes, la vue, pick et noter sont ceux du rendu Canvas (CarteCanvas, qui
// reçoit ce peintre à la place du Canvas 2D) ; ce fichier ne fait que dessiner.
//
// Pourquoi : le Canvas 2D refait la projection et le tracé de 125 000 sommets
// sur le processeur à chaque image (4 à 5 ms de script sur le PC, 13 à 22 ms
// au processeur ralenti 4×), d'où la carte allégée pendant les gestes, qui
// faisait disparaître les îles. Ici le maillage (maillage.ts : triangles en
// longitude et latitude, traits des frontières) est téléversé une fois ; une
// image ne coûte au script que quelques uniformes et quelques appels de
// dessin, et la projection Equal Earth tournée se calcule dans le vertex
// shader (miroir testé : maillage.projeterF32).
//
// Une image, dans l'ordre (stencil : 0x80 ovale, 0x40 traits, 0x20 hachures) :
// 1. l'ovale (la mer), qui marque le stencil : tout ce qui suit y est découpé ;
// 2. les terres, couleur par pays lue dans une texture (teinte de la carte de
//    la mémoire, puis marques choisi, juste, faux par-dessus) : la changer ne
//    téléverse que la texture, jamais la géométrie ;
// 3. les hachures des zones contestées, motif à 45° ancré au milieu de chaque
//    partie : il suit la carte quand elle tourne (en Canvas, il restait fixe
//    à l'écran et la carte glissait dessous) ;
// 4. les frontières en gl.LINES (un pixel physique, comme le Canvas), tirées
//    des arcs de la topologie : celles entre deux pays d'abord, de l'encre de
//    deux traits superposés (le Canvas trace deux fois un trait commun), puis
//    les côtes, d'un trait. Chaque pixel est peint une fois (bit du stencil) :
//    sans cela, les sommets serrés d'une côte au zoom 1 (Arctique canadien,
//    Norvège) s'additionnaient en un liseré blanc ; puis le contour de la
//    zone fausse (TRAIT_FAUX_PX, couleur du texte : daltonisme), ses anneaux
//    en traits d'un pixel redessinés décalés sur un disque de pixels
//    (decalagesTrait : gl.LINES n'a qu'un pixel de large) ;
// 5. pastilles et anneaux : des carrés instanciés, disque calculé au pixel.
// Une partie à cheval sur le bord de l'ovale est redessinée décalée d'un tour
// (maillage.toursEnPlus) ; le stencil de l'ovale coupe ce qui déborde.
//
// Chargement (relais-webgl.ts) : contexte et shaders créés pendant le
// téléchargement des données, compilés sans bloquer (KHR_parallel_shader_compile),
// maillage reçu du Web Worker ou du cache de l'appareil (charger), puis
// CarteCanvas.adopter passe la main au WebGL. Sans WebGL2 matériel
// (failIfMajorPerformanceCaveat, ou nom logiciel du GPU), shader refusé :
// WebGLIndisponible ou une erreur, et la carte reste en Canvas 2D.
//
// Perte du contexte (appli mise en arrière-plan sur Android, pilote
// graphique réinitialisé) : webglcontextlost suspend le dessin,
// webglcontextrestored recrée programmes, tampons et texture depuis le
// maillage gardé en mémoire, puis redessine. Pas rendu après DELAI_PERTE_MS
// (page visible), ou programmes refusés au retour : surPerteDurable, et la
// carte revient au Canvas 2D (CarteCanvas.revenirAuCanvas2D).
import type { DonneesCarte } from './donnees';
import { versEcran } from './geo';
import type { Position } from 'geojson';
import { emprisesAPlat, maillerCarte, maillerTraits, pourChaqueCopie, toursEnPlus, type Maillage, type MaillagesCarte, type PartieMaillee } from './maillage';
import { PASTILLE } from './pastilles';
import { TRAIT_FAUX_PX, type EtatImage, type Peintre, type StatsDessin } from './carte-canvas';
import { VARIABLES_MEMOIRE, type Teintes } from './teintes';

/** Côté de la texture des couleurs par pays (texels par ligne). */
const LARGEUR_COULEURS = 256;
/** Segments du contour de l'ovale, par bord (est, ouest). */
const PAS_OVALE = 512;
const OVALE = 0x80;
const TRAITS = 0x40;
const HACHURES = 0x20;
/** Pas des hachures à l'écran (px CSS) et épaisseur du trait, comme le Canvas et le SVG. */
const PAS_HACHURES = 6;
const TRAIT_HACHURES = 1.2;

// Le vertex shader de la carte : un sommet (λ, φ) en degrés → écran.
// uMode 0 : le tour de la partie choisi ici (milieu de l'emprise à moins de
// 180° du centre) ; 1 : le tour uTour imposé (copies du bord de l'ovale) ;
// 2 : déjà dans le repère de la vue (le contour de l'ovale).
// λ + tour·360 avant − r : les deux bords d'une couture (180 et −180 + 360)
// donnent exactement le même nombre (maillage.projeterF32 fait de même).
export const VERTEX_CARTE = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aLonLat;
layout(location = 1) in vec2 aMilieu;
layout(location = 2) in float aForme;
uniform float uR;
uniform int uMode;
uniform float uTour;
uniform float uK;
uniform vec2 uCentre;
uniform vec2 uTaille;
flat out int vForme;
flat out vec2 vRef;
const float RAD = 0.017453292519943295;
const float A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = 0.8660254037844386;
vec2 equalEarth(float u, float phi) {
  float l = asin(M * sin(phi * RAD));
  float l2 = l * l;
  float l6 = l2 * l2 * l2;
  return vec2(u * RAD * cos(l) / (M * (A1 + (3.0 * A2 * l2 + l6 * (7.0 * A3 + 9.0 * A4 * l2)))),
              l * (A1 + (A2 * l2 + l6 * (A3 + A4 * l2))));
}
vec2 ecran(vec2 p) { return vec2(uCentre.x + uK * p.x, uCentre.y - uK * p.y); }
void main() {
  float tour = uMode == 1 ? uTour : floor((uR - aMilieu.x) / 360.0 + 0.5);
  float decal = uMode == 2 ? 0.0 : tour * 360.0;
  float r = uMode == 2 ? 0.0 : uR;
  vec2 e = ecran(equalEarth((aLonLat.x + decal) - r, aLonLat.y));
  vRef = ecran(equalEarth((aMilieu.x + decal) - r, aMilieu.y));
  vForme = int(aForme);
  gl_Position = vec4(e.x / uTaille.x * 2.0 - 1.0, 1.0 - e.y / uTaille.y * 2.0, 0.0, 1.0);
}`;

export const FRAG_TERRES = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uCouleurs;
flat in int vForme;
out vec4 sortie;
void main() {
  vec4 c = texelFetch(uCouleurs, ivec2(vForme % ${LARGEUR_COULEURS}, vForme / ${LARGEUR_COULEURS}), 0);
  sortie = vec4(c.rgb * c.a, c.a);
}`;

const FRAG_UNI = `#version 300 es
precision highp float;
uniform vec4 uCouleur;
out vec4 sortie;
void main() { sortie = uCouleur; }`;

// Hachures : traits à 45° (montant vers la droite, le motif du Canvas tourné
// de 45°), au pas de 6 px CSS, comptés depuis le milieu de la partie à l'écran.
export const FRAG_HACHURES = `#version 300 es
precision highp float;
uniform vec4 uCouleur;
uniform float uDpr;
uniform float uHauteur;
flat in vec2 vRef;
out vec4 sortie;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uHauteur - gl_FragCoord.y) / uDpr - vRef;
  float s = (p.x + p.y) * 0.7071067811865476 - 1.0;
  float d = abs(mod(s + ${PAS_HACHURES / 2}.0, ${PAS_HACHURES}.0) - ${PAS_HACHURES / 2}.0);
  sortie = uCouleur * clamp((${TRAIT_HACHURES / 2} - d) * uDpr + 0.5, 0.0, 1.0);
}`;

// Pastilles et anneaux : un carré par instance (gl_VertexID), le disque au pixel.
// aDisque : centre (px CSS), rayon, demi-épaisseur du trait (0 : disque plein bordé).
export const VERTEX_DISQUES = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aDisque;
layout(location = 1) in vec4 aCouleur;
uniform vec2 uTaille;
out vec2 vP;
flat out vec4 vD;
flat out vec4 vC;
void main() {
  vec2 coin = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
  vec2 p = aDisque.xy + coin * (aDisque.z + max(aDisque.w, 0.5) + 1.0);
  vP = p;
  vD = aDisque;
  vC = aCouleur;
  gl_Position = vec4(p.x / uTaille.x * 2.0 - 1.0, 1.0 - p.y / uTaille.y * 2.0, 0.0, 1.0);
}`;

export const FRAG_DISQUES = `#version 300 es
precision highp float;
uniform vec4 uBord;
uniform float uDpr;
in vec2 vP;
flat in vec4 vD;
flat in vec4 vC;
out vec4 sortie;
void main() {
  float d = distance(vP, vD.xy);
  if (vD.w > 0.0) {
    sortie = vC * clamp((vD.w - abs(d - vD.z)) * uDpr + 0.5, 0.0, 1.0);
  } else {
    float dedans = clamp((vD.z + 0.5 - d) * uDpr + 0.5, 0.0, 1.0);
    float bord = clamp((d - (vD.z - 0.5)) * uDpr + 0.5, 0.0, 1.0);
    sortie = mix(vC, uBord, bord) * dedans;
  }
}`;

export type Rvba = [number, number, number, number];

/** Couleurs de :root (jamais en dur), en octets RVBA (alpha non prémultiplié). */
export interface Couleurs {
  mer: Rvba;
  terre: Rvba;
  frontiere: Rvba;
  hachure: Rvba;
  pastille: Rvba;
  bord: Rvba;
  /** Contour de la zone fausse (.pays.faux du SVG). */
  texte: Rvba;
  marques: Record<string, Rvba>;
  /** Seaux de la carte de la mémoire (--memoire-0 à 4). */
  memoire: Rvba[];
}

/** Une couleur CSS quelconque en octets, lue par un canvas 2D d'un pixel (toute syntaxe CSS). */
function lecteurCouleurs(): (css: string) => Rvba {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return (css) => {
    if (!ctx) return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
  };
}

export function lireCouleurs(): Couleurs {
  const css = getComputedStyle(document.documentElement);
  const lire = lecteurCouleurs();
  const v = (nom: string) => lire(css.getPropertyValue(nom).trim());
  return {
    mer: v('--mer'),
    terre: v('--terre'),
    frontiere: v('--frontiere-fine'),
    hachure: v('--hachure'),
    pastille: v('--pastille'),
    bord: v('--bg'),
    texte: v('--text'),
    // Classes de marquer() : les mêmes couleurs que .pays.choisi, .juste, .faux du SVG.
    marques: { choisi: v('--accent'), juste: v('--good'), faux: v('--danger') },
    memoire: VARIABLES_MEMOIRE.map(v),
  };
}

/**
 * Décalages (px CSS) qui font d'un trait d'un pixel physique un trait de
 * `largeur` px CSS : les pixels entiers d'un disque de largeur × dpr pixels
 * de diamètre (un trait droit couvre exactement round(largeur × dpr) pixels
 * de travers, joints et bouts ronds, comme le SVG).
 */
export function decalagesTrait(largeur: number, dpr: number): [number, number][] {
  const w = Math.max(1, Math.round(largeur * dpr));
  const a = Math.floor((w - 1) / 2);
  const b = w - 1 - a;
  const c = (b - a) / 2;
  const r2 = (w / 2) ** 2 + 1e-9;
  const res: [number, number][] = [];
  for (let i = -a; i <= b; i++) for (let j = -a; j <= b; j++) if ((i - c) ** 2 + (j - c) ** 2 <= r2) res.push([i / dpr, j / dpr]);
  return res;
}

/** Couleur prémultipliée en flottants (uniformes et instances). */
const premult = (c: Rvba): Rvba => {
  const a = c[3] / 255;
  return [(c[0] / 255) * a, (c[1] / 255) * a, (c[2] / 255) * a, a];
};

/** Le WebGL2 manque, ou n'est que logiciel (failIfMajorPerformanceCaveat) : relais-webgl.ts garde le Canvas 2D. */
export class WebGLIndisponible extends Error {
  constructor(
    message: string,
    /** Nom du processeur graphique logiciel refusé (SwiftShader…) ; null : pas de WebGL2 du tout. */
    readonly logiciel: string | null,
  ) {
    super(message);
    this.name = 'WebGLIndisponible';
  }
}

/** Nom lisible du processeur graphique : UNMASKED_RENDERER_WEBGL (Chrome répond « WebKit WebGL » à gl.RENDERER). */
export function nomGpu(gl: WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  const nom = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  return typeof nom === 'string' && nom ? nom : String(gl.getParameter(gl.RENDERER));
}

/** Contexte du canvas de la carte (même réglage pour le diagnostic d'un refus). */
const ATTRIBUTS_CONTEXTE: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  stencil: true,
  depth: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

/**
 * Un programme et ses uniformes (emplacements lus une fois). Compilation et
 * édition des liens sont lancées par lancerProgrammes, vérifiées par
 * verifier() : avec KHR_parallel_shader_compile, le pilote compile pendant que
 * le fil principal continue (compiler() attend COMPLETION_STATUS_KHR image
 * après image) ; sans elle, verifier() attend la fin de la compilation.
 */
class Programme {
  readonly p: WebGLProgram;
  private u = new Map<string, WebGLUniformLocation | null>();
  constructor(private readonly gl: WebGL2RenderingContext, private readonly shaders: readonly WebGLShader[]) {
    this.p = gl.createProgram();
    for (const sh of shaders) gl.attachShader(this.p, sh);
    gl.linkProgram(this.p);
  }
  /** Compilation finie (sans l'extension : toujours vrai, verifier() attend). */
  fini(ext: { COMPLETION_STATUS_KHR: number } | null): boolean {
    return !ext || this.gl.getProgramParameter(this.p, ext.COMPLETION_STATUS_KHR) === true;
  }
  /** Lève une erreur si un shader ou l'édition des liens a échoué (contexte perdu : rien à dire, il sera recréé). */
  verifier(): void {
    const { gl } = this;
    if (gl.getProgramParameter(this.p, gl.LINK_STATUS) || gl.isContextLost()) return;
    const journal = this.shaders.map((s) => (gl.getShaderParameter(s, gl.COMPILE_STATUS) ? '' : gl.getShaderInfoLog(s) ?? '')).join(' ').trim();
    throw new Error(`WebGL : ${journal || gl.getProgramInfoLog(this.p) || 'édition des liens refusée'}`);
  }
  loc(nom: string): WebGLUniformLocation | null {
    let l = this.u.get(nom);
    if (l === undefined) this.u.set(nom, (l = this.gl.getUniformLocation(this.p, nom)));
    return l;
  }
}

interface Programmes {
  carte: Programme;
  remplir: Programme;
  hachurer: Programme;
  disques: Programme;
}

/** Les tampons d'un maillage sur le GPU. */
interface MaillageGpu {
  m: Maillage;
  vao: WebGLVertexArrayObject;
  tampons: WebGLBuffer[];
  /** Décalage (octets) des traits dans le tampon d'indices, après les triangles. */
  traits: number;
  /** Emprises des parties à plat (maillage.pourChaqueCopie : sans allocation à chaque image). */
  emprises: Float64Array;
}

/** Instances des disques : centre x, y, rayon, demi-épaisseur, puis RVBA prémultiplié. */
const PAR_DISQUE = 8;
/**
 * Contexte perdu et pas rendu après ce délai (page visible) : surPerteDurable,
 * et relais-webgl.ts rend la carte au Canvas 2D. Mise en arrière-plan sur
 * Android : le délai ne court qu'une fois la page revenue au premier plan.
 */
export const DELAI_PERTE_MS = 3000;

/** Échelle (px CSS par unité de la projection) et centre de l'ovale à l'écran : uK et uCentre du shader. */
export function uniformesVue(v: EtatImage['v'], c: EtatImage['c']): { K: number; centre: [number, number] } {
  return { K: v.k * c.s, centre: [c.l / 2, v.k * c.ty + v.y] };
}

export interface OptionsWebGL {
  /** Anticrénelage (MSAA du contexte) ; ?aa=0 le coupe, pour comparer. */
  antialias?: boolean;
  /** Accepter un WebGL logiciel (SwiftShader : 5 à 7 images/s mesurées) ; ?logiciel=1, pour comparer. */
  logicielAccepte?: boolean;
  /** Contexte perdu pour de bon (DELAI_PERTE_MS), ou programmes refusés à son retour. */
  surPerteDurable?: (raison: string) => void;
  /** Couleurs déjà lues (tests, sans DOM) ; sinon les variables de :root. */
  couleurs?: Couleurs;
}

export class PeintreWebGL implements Peintre {
  readonly allegeEnMouvement = false;
  private gl: WebGL2RenderingContext;
  private couleurs: Couleurs;
  private terres: Maillage | null = null;
  private zones: Maillage | null = null;
  private interieurs: Maillage | null = null;
  private cotes: Maillage | null = null;
  /** Parties hachurées du maillage des terres : celles des entités au statut « conteste ». */
  private contestees: PartieMaillee[] = [];
  private programmes: Programmes | null = null;
  private g: (Programmes & {
    terres: MaillageGpu;
    zones: MaillageGpu;
    interieurs: MaillageGpu;
    cotes: MaillageGpu;
    ovale: { vao: WebGLVertexArrayObject; tampon: WebGLBuffer; n: number };
    instances: { vao: WebGLVertexArrayObject; tampon: WebGLBuffer; octets: number };
    couleurs: WebGLTexture;
    /** Anneaux de la zone fausse en traits (null : aucune), refaits quand les marques changent. */
    contourFaux: MaillageGpu | null;
  }) | null = null;
  private perdu = false;
  private minuteurPerte = 0;
  private l = 1;
  private h = 1;
  private dpr = 1;
  /** Signature des marques téléversées dans la texture des couleurs (null : à refaire). */
  private signature: string | null = null;
  /** Les teintes téléversées (EtatImage.teintes : un nouvel objet à chaque changement) ; undefined : à refaire. */
  private teintesVues: Teintes | null | undefined = undefined;
  private disques = new Float32Array(64 * PAR_DISQUE);
  private chrono: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }; q: WebGLQuery | null; actif: boolean; gpu_ms: number | null } | null = null;
  private nom: string | null = null;
  private d: DonneesCarte | null;
  private ecouteurs: [EventTarget, string, EventListener][] = [];

  /**
   * Lève WebGLIndisponible sans WebGL2, ou s'il n'est que logiciel (sauf
   * logicielAccepte). Les données peuvent venir plus tard (charger) : le
   * relais crée le contexte avant qu'elles n'arrivent.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly o: { donnees: DonneesCarte | null; redessiner: () => void } & OptionsWebGL,
  ) {
    this.d = o.donnees;
    const gl = canvas.getContext('webgl2', { ...ATTRIBUTS_CONTEXTE, antialias: o.antialias ?? true, failIfMajorPerformanceCaveat: !o.logicielAccepte });
    if (!gl) throw new WebGLIndisponible(o.logicielAccepte ? 'WebGL2 indisponible' : 'WebGL2 indisponible ou logiciel', null);
    this.gl = gl;
    this.couleurs = o.couleurs ?? lireCouleurs();
    const sur = (cible: EventTarget, type: string, f: (ev: Event) => void) => {
      cible.addEventListener(type, f);
      this.ecouteurs.push([cible, type, f]);
    };
    sur(canvas, 'webglcontextlost', (ev) => {
      ev.preventDefault(); // sans quoi le navigateur ne le rend jamais
      this.perdu = true;
      this.g = null;
      this.programmes = null;
      this.chrono = null;
      this.armerPerte();
    });
    sur(canvas, 'webglcontextrestored', () => {
      this.perdu = false;
      clearTimeout(this.minuteurPerte);
      this.minuteurPerte = 0;
      try {
        if (this.terres) this.creerRessources();
      } catch (e) {
        this.o.surPerteDurable?.(`contexte rendu, programmes refusés : ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      this.o.redessiner();
    });
    if (typeof document !== 'undefined') sur(document, 'visibilitychange', () => this.armerPerte());
  }

  private get donnees(): DonneesCarte {
    if (!this.d) throw new Error('WebGL : données de la carte pas encore reçues');
    return this.d;
  }

  /**
   * Après un refus : WebGL2 logiciel (son nom) ou absent (null) ? Un contexte
   * d'essai, sans failIfMajorPerformanceCaveat, le dit ; son premier appel
   * synchrone attend son initialisation (~150 ms sur le PC) : à n'appeler
   * qu'une fois la carte affichée.
   */
  static diagnostiquer(): string | null {
    const essai = document.createElement('canvas').getContext('webgl2', ATTRIBUTS_CONTEXTE);
    const nom = essai ? nomGpu(essai) : null;
    essai?.getExtension('WEBGL_lose_context')?.loseContext();
    return nom;
  }

  /**
   * Processeur graphique (nomGpu), lu à la première demande : c'est un appel
   * synchrone au processus du GPU, et le premier attend la fin de
   * l'initialisation du contexte (136 à 152 ms sur le PC, fil principal
   * bloqué). Après compiler(), qui l'attend sans bloquer, il est immédiat.
   */
  get renderer(): string {
    return (this.nom ??= nomGpu(this.gl));
  }

  /** Délai avant d'abandonner un contexte perdu, compté page visible seulement. */
  private armerPerte(): void {
    if (!this.perdu || this.minuteurPerte || document.visibilityState === 'hidden') return;
    this.minuteurPerte = window.setTimeout(() => {
      this.minuteurPerte = 0;
      if (!this.perdu) return;
      if (document.visibilityState === 'hidden') return; // repris au retour au premier plan
      this.o.surPerteDurable?.(`contexte perdu, pas rendu après ${DELAI_PERTE_MS / 1000} s`);
    }, DELAI_PERTE_MS);
  }

  /** Compile les shaders (le vertex shader de la carte une fois, pour trois programmes) et lance l'édition des liens. */
  private lancerProgrammes(): { ps: Programmes; shaders: WebGLShader[] } {
    const { gl } = this;
    const shaders: WebGLShader[] = [];
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error('WebGL : shader impossible à créer');
      gl.shaderSource(s, src);
      gl.compileShader(s);
      shaders.push(s);
      return s;
    };
    const vCarte = shader(gl.VERTEX_SHADER, VERTEX_CARTE);
    const vDisques = shader(gl.VERTEX_SHADER, VERTEX_DISQUES);
    const ps = {
      carte: new Programme(gl, [vCarte, shader(gl.FRAGMENT_SHADER, FRAG_UNI)]),
      remplir: new Programme(gl, [vCarte, shader(gl.FRAGMENT_SHADER, FRAG_TERRES)]),
      hachurer: new Programme(gl, [vCarte, shader(gl.FRAGMENT_SHADER, FRAG_HACHURES)]),
      disques: new Programme(gl, [vDisques, shader(gl.FRAGMENT_SHADER, FRAG_DISQUES)]),
    };
    return { ps, shaders };
  }

  /** Vérifie les programmes lancés (erreur si un shader est refusé), puis libère les shaders. */
  private verifierProgrammes({ ps, shaders }: { ps: Programmes; shaders: WebGLShader[] }): Programmes {
    for (const p of Object.values(ps) as Programme[]) p.verifier();
    for (const s of shaders) this.gl.deleteShader(s);
    return ps;
  }

  /**
   * Compile les programmes sans bloquer le fil principal quand le pilote le
   * permet (KHR_parallel_shader_compile) : attend leur fin image après image
   * (COMPLETION_STATUS_KHR ne bloque pas, mesuré : 0,1 ms par question ; le
   * premier appel synchrone, lui, aurait attendu l'initialisation du contexte
   * dans le processus du GPU). Lève une erreur si un shader est refusé ou si
   * le contexte se perd.
   */
  async compiler(attendre: () => Promise<unknown> = () => new Promise((ok) => requestAnimationFrame(ok))): Promise<void> {
    if (this.programmes) return;
    const ext = this.gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
    const lances = this.lancerProgrammes();
    const tous = Object.values(lances.ps) as Programme[];
    while (!this.gl.isContextLost() && !tous.every((p) => p.fini(ext))) await attendre();
    if (this.gl.isContextLost()) throw new Error('WebGL : contexte perdu pendant la compilation');
    this.programmes = this.verifierProgrammes(lances);
  }

  /** Le maillage calculé ailleurs (Web Worker, ou cache) : téléversé d'un coup ; programmes compilés ici s'ils ne le sont pas. */
  charger(m: MaillagesCarte, d?: DonneesCarte): void {
    this.garder(m, d);
    this.creerRessources();
  }

  /**
   * Le même téléversement, un tampon par tâche : attendre() entre deux (une
   * image passe) ; au total ~7 Mo, qui d'un bloc tenaient le fil principal
   * une cinquantaine de millisecondes sur le PC chargé.
   */
  async chargerPeuAPeu(m: MaillagesCarte, d: DonneesCarte, attendre: () => Promise<unknown>): Promise<void> {
    this.garder(m, d);
    for (const _ of this.etapesRessources()) {
      await attendre();
      if (this.gl.isContextLost()) throw new Error('WebGL : contexte perdu pendant le téléversement');
    }
  }

  private garder(m: MaillagesCarte, donnees?: DonneesCarte): void {
    if (donnees) this.d = donnees;
    const d = this.donnees;
    this.terres = m.terres;
    this.zones = m.zones;
    this.interieurs = m.interieurs;
    this.cotes = m.cotes;
    this.contestees = m.terres.parties.filter((p) => d.entites[p.forme]?.pays.statut === 'conteste');
  }

  /** Peintre passé à CarteCanvas dès sa construction : maillage sur le fil principal (chronométré par rendre()). */
  preparer(): void {
    if (!this.terres) this.charger(maillerCarte(this.donnees));
  }

  /** Programmes (s'il le faut), tampons, texture : au chargement et à chaque contexte rendu. */
  private creerRessources(): void {
    for (const _ of this.etapesRessources());
  }

  /** creerRessources par étapes : rend la main (yield) après chaque gros tampon. */
  private *etapesRessources(): Generator<void, void, void> {
    const { gl } = this;
    if (gl.isContextLost() || !this.terres || !this.zones || !this.interieurs || !this.cotes) return;
    this.programmes ??= this.verifierProgrammes(this.lancerProgrammes());

    // Contour de l'ovale dans le repère de la vue (uMode 2) : bord est du nord au sud, bord ouest du sud au nord.
    const ovale: number[] = [0, 0];
    for (let i = 0; i <= PAS_OVALE; i++) ovale.push(180, 90 - (180 * i) / PAS_OVALE);
    for (let i = 0; i <= PAS_OVALE; i++) ovale.push(-180, -90 + (180 * i) / PAS_OVALE);
    ovale.push(180, 90);
    const vaoOvale = gl.createVertexArray();
    gl.bindVertexArray(vaoOvale);
    const tOvale = this.tampon(gl.ARRAY_BUFFER, new Float32Array(ovale));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttrib2f(1, 0, 0);
    gl.vertexAttrib1f(2, 0);

    const vaoDisques = gl.createVertexArray();
    gl.bindVertexArray(vaoDisques);
    const tDisques = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tDisques);
    gl.bufferData(gl.ARRAY_BUFFER, this.disques.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, PAR_DISQUE * 4, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, PAR_DISQUE * 4, 16);
    gl.vertexAttribDivisor(1, 1);

    gl.bindVertexArray(null);
    yield;
    const terres = yield* this.televerser(this.terres);
    const zones = yield* this.televerser(this.zones);
    const interieurs = yield* this.televerser(this.interieurs);
    const cotes = yield* this.televerser(this.cotes);
    gl.bindVertexArray(null);

    const couleurs = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, couleurs);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.signature = null;
    this.teintesVues = undefined;

    this.g = { ...this.programmes, terres, zones, interieurs, cotes, ovale: { vao: vaoOvale, tampon: tOvale, n: ovale.length / 2 }, instances: { vao: vaoDisques, tampon: tDisques, octets: this.disques.byteLength }, couleurs, contourFaux: null };
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    this.chrono = ext ? { ext, q: null, actif: false, gpu_ms: null } : null;
  }

  private tampon(cible: number, donnees: ArrayBufferView & { byteLength: number }): WebGLBuffer {
    const { gl } = this;
    const t = gl.createBuffer();
    gl.bindBuffer(cible, t);
    gl.bufferData(cible, donnees as unknown as BufferSource, gl.STATIC_DRAW);
    return t;
  }

  /** Un maillage dans son VAO : sommets (λ, φ), milieux, formes ; indices des triangles puis des traits. Rend la main après chaque tampon. */
  private *televerser(m: Maillage): Generator<void, MaillageGpu, void> {
    const { gl } = this;
    const vao = gl.createVertexArray();
    const tampons: WebGLBuffer[] = [];
    const attributs = [[m.lonlat, 2], [m.milieu, 2], [m.forme, 1]] as const;
    for (let i = 0; i < attributs.length; i++) {
      const [d, n] = attributs[i] as (typeof attributs)[number];
      // Le VAO est relié à chaque étape : entre deux, un dessin (Canvas 2D… ou rien) a pu en lier un autre.
      gl.bindVertexArray(vao);
      tampons.push(this.tampon(gl.ARRAY_BUFFER, d));
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, n, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      if (d.byteLength > 1 << 18) yield;
    }
    const indices = new Uint32Array(m.triangles.length + m.traits.length);
    indices.set(m.triangles);
    indices.set(m.traits, m.triangles.length);
    gl.bindVertexArray(vao);
    tampons.push(this.tampon(gl.ELEMENT_ARRAY_BUFFER, indices));
    gl.bindVertexArray(null);
    if (indices.byteLength > 1 << 18) yield;
    return { m, vao, tampons, traits: m.triangles.length * 4, emprises: emprisesAPlat(m.parties) };
  }

  dimensionner(l: number, h: number, dpr: number): void {
    this.l = l;
    this.h = h;
    this.dpr = dpr;
  }

  /**
   * Couleur de chaque pays : terre, ou la teinte de son seau, puis sa marque
   * (la dernière classe connue), comme le Canvas. Téléversée quand marques ou
   * teintes changent ; le contour faux, quand les marques changent.
   */
  private couleursPays(e: EtatImage): void {
    const g = this.g;
    if (!g) return;
    let sig = '';
    for (const [id, cl] of e.marques) if (cl.size) sig += `${id}:${[...cl].join(',')};`;
    const marquesChangent = sig !== this.signature;
    if (!marquesChangent && e.teintes === this.teintesVues) return;
    this.signature = sig;
    this.teintesVues = e.teintes;
    const { gl } = this;
    const entites = this.donnees.entites;
    const lignes = Math.max(1, Math.ceil(entites.length / LARGEUR_COULEURS));
    const texels = new Uint8Array(LARGEUR_COULEURS * lignes * 4);
    entites.forEach((en, i) => {
      texels.set(this.couleurDe(en.pays.id, e, this.couleurs.terre), i * 4);
    });
    gl.bindTexture(gl.TEXTURE_2D, g.couleurs);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LARGEUR_COULEURS, lignes, 0, gl.RGBA, gl.UNSIGNED_BYTE, texels);
    if (marquesChangent) this.majContourFaux(e.marques);
  }

  /** Couleur d'un pays ou de sa pastille : base (terre, pastille), sinon sa teinte, puis ses marques par-dessus. */
  private couleurDe(id: string, e: EtatImage, base: Rvba): Rvba {
    const s = e.teintes?.get(id);
    let c = (s !== undefined && this.couleurs.memoire[s]) || base;
    for (const cl of e.marques.get(id) ?? []) c = this.couleurs.marques[cl] ?? c;
    return c;
  }

  /** Les anneaux (trous compris) des zones marquées « faux », en traits sans les coutures (maillerTraits), téléversés. */
  private majContourFaux(marques: EtatImage['marques']): void {
    const g = this.g;
    if (!g) return;
    const { gl } = this;
    if (g.contourFaux) {
      for (const t of g.contourFaux.tampons) gl.deleteBuffer(t);
      gl.deleteVertexArray(g.contourFaux.vao);
      g.contourFaux = null;
    }
    const anneaux: Position[][] = [];
    for (const en of this.donnees.entites) {
      if (!marques.get(en.pays.id)?.has('faux')) continue;
      const geo = en.forme.geometry;
      for (const poly of geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates) anneaux.push(...poly);
    }
    if (!anneaux.length) return;
    const etapes = this.televerser(maillerTraits(anneaux));
    let r = etapes.next();
    while (!r.done) r = etapes.next();
    gl.bindVertexArray(null);
    g.contourFaux = r.value;
  }

  dessiner(e: EtatImage): StatsDessin {
    const g = this.g;
    const stats: StatsDessin = { trace_ms: 0, leger: false, parties: 0, sommets: 0, emis: 0, copies: 0, gpu_ms: this.chrono?.gpu_ms ?? null };
    if (this.perdu || !g || !this.terres) return stats;
    const t0 = performance.now();
    const { gl } = this;
    this.lireChrono();
    const { v, c } = e;
    const { K, centre } = uniformesVue(v, c);
    const larg = this.canvas.width;
    const haut = this.canvas.height;
    let appels = 0;
    let copies = 0;
    /** Décalage (px CSS) du centre de l'ovale : les passes du contour de la zone fausse. */
    let decalage: [number, number] = [0, 0];

    this.couleursPays(e);
    gl.viewport(0, 0, larg, haut);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);

    const uniformes = (p: Programme, mode: number) => {
      gl.useProgram(p.p);
      gl.uniform1f(p.loc('uR'), v.r);
      gl.uniform1i(p.loc('uMode'), mode);
      gl.uniform1f(p.loc('uK'), K);
      gl.uniform2f(p.loc('uCentre'), centre[0] + decalage[0], centre[1] + decalage[1]);
      gl.uniform2f(p.loc('uTaille'), c.l, c.h);
    };
    /** Le maillage entier (tour choisi par le shader), puis les copies des parties à cheval sur le bord. */
    const dessinerMaillage = (p: Programme, mg: MaillageGpu, mode: number, parties: readonly PartieMaillee[] | null) => {
      gl.bindVertexArray(mg.vao);
      const traits = mode === gl.LINES;
      uniformes(p, 0);
      if (parties) {
        for (const pa of parties) {
          const [a, b] = traits ? [pa.l0, pa.l1] : [pa.t0, pa.t1];
          if (b > a) gl.drawElements(mode, b - a, gl.UNSIGNED_INT, traits ? mg.traits + a * 4 : a * 4);
          appels++;
        }
      } else {
        const n = traits ? mg.m.traits.length : mg.m.triangles.length;
        gl.drawElements(mode, n, gl.UNSIGNED_INT, traits ? mg.traits : 0);
        appels++;
      }
      gl.uniform1i(p.loc('uMode'), 1);
      const uTour = p.loc('uTour');
      const copie = (tour: number, a: number, b: number) => {
        gl.uniform1f(uTour, tour);
        gl.drawElements(mode, b - a, gl.UNSIGNED_INT, traits ? mg.traits + a * 4 : a * 4);
        appels++;
        copies++;
      };
      if (parties) {
        for (const pa of parties) {
          const [a, b] = traits ? [pa.l0, pa.l1] : [pa.t0, pa.t1];
          if (b > a) for (const tour of toursEnPlus(pa, v.r)) copie(tour, a, b);
        }
        return;
      }
      const tout = mg.m.parties;
      pourChaqueCopie(mg.emprises, v.r, (i, tour) => {
        const pa = tout[i] as PartieMaillee;
        const [a, b] = traits ? [pa.l0, pa.l1] : [pa.t0, pa.t1];
        if (b > a) copie(tour, a, b);
      });
    };

    // 1. L'ovale : la mer, et le bit OVALE du stencil.
    gl.stencilFunc(gl.ALWAYS, OVALE, OVALE);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.stencilMask(OVALE);
    uniformes(g.carte, 2);
    gl.uniform4fv(g.carte.loc('uCouleur'), premult(this.couleurs.mer));
    gl.bindVertexArray(g.ovale.vao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, g.ovale.n);
    appels++;

    // 2. Les terres, dans l'ovale.
    gl.stencilFunc(gl.EQUAL, OVALE, OVALE);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.couleurs);
    gl.useProgram(g.remplir.p);
    gl.uniform1i(g.remplir.loc('uCouleurs'), 0);
    dessinerMaillage(g.remplir, g.terres, gl.TRIANGLES, null);

    // 3. Hachures : chaque pixel une fois (bit HACHURES), là où deux zones se recouvrent aussi.
    gl.stencilFunc(gl.EQUAL, OVALE, OVALE | HACHURES);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
    gl.stencilMask(HACHURES);
    gl.useProgram(g.hachurer.p);
    gl.uniform4fv(g.hachurer.loc('uCouleur'), premult(this.couleurs.hachure));
    gl.uniform1f(g.hachurer.loc('uDpr'), this.dpr);
    gl.uniform1f(g.hachurer.loc('uHauteur'), haut);
    dessinerMaillage(g.hachurer, g.zones, gl.TRIANGLES, null);
    if (this.contestees.length) dessinerMaillage(g.hachurer, g.terres, gl.TRIANGLES, this.contestees);

    // 4. Frontières entre pays (encre de deux traits), puis côtes : un pixel physique, chaque pixel une fois (bit TRAITS).
    gl.stencilFunc(gl.EQUAL, OVALE, OVALE | TRAITS);
    gl.stencilMask(TRAITS);
    gl.useProgram(g.carte.p);
    const f = premult(this.couleurs.frontiere);
    gl.uniform4fv(g.carte.loc('uCouleur'), f.map((x) => x * (2 - f[3])));
    dessinerMaillage(g.carte, g.interieurs, gl.LINES, null);
    gl.useProgram(g.carte.p);
    gl.uniform4fv(g.carte.loc('uCouleur'), f);
    dessinerMaillage(g.carte, g.cotes, gl.LINES, null);

    // 4 bis. Contour de la zone fausse, par-dessus les frontières, dans l'ovale : opaque, peint autant de fois qu'il le faut.
    if (g.contourFaux) {
      gl.stencilFunc(gl.EQUAL, OVALE, OVALE);
      gl.stencilMask(0);
      for (const d of decalagesTrait(TRAIT_FAUX_PX, this.dpr)) {
        decalage = d;
        gl.useProgram(g.carte.p);
        gl.uniform4fv(g.carte.loc('uCouleur'), premult(this.couleurs.texte));
        dessinerMaillage(g.carte, g.contourFaux, gl.LINES, null);
      }
      decalage = [0, 0];
    }

    // 5. Pastilles et anneaux, par-dessus tout (hors stencil, comme le Canvas).
    gl.disable(gl.STENCIL_TEST);
    appels += this.dessinerDisques(e);
    gl.bindVertexArray(null);
    this.finirChrono();

    stats.trace_ms = performance.now() - t0;
    stats.parties = this.terres.parties.length;
    stats.sommets = this.terres.lonlat.length / 2;
    stats.emis = appels;
    stats.copies = copies;
    return stats;
  }

  /** Disques des pastilles (rayon constant à l'écran, bord couleur du fond) et anneaux ; rend le nombre d'appels. */
  private dessinerDisques(e: EtatImage): number {
    const g = this.g;
    if (!g) return 0;
    const { gl } = this;
    const { c, t } = e;
    const r = PASTILLE.rayon_visible_px;
    const coul = this.couleurs;
    let n = 0;
    const ajouter = (x: number, y: number, rayon: number, demi: number, couleur: Rvba) => {
      if (this.disques.length < (n + 1) * PAR_DISQUE) {
        const plus = new Float32Array(this.disques.length * 2);
        plus.set(this.disques);
        this.disques = plus;
      }
      this.disques.set([x, y, rayon, demi, ...premult(couleur)], n * PAR_DISQUE);
      n++;
    };
    for (const p of e.pastilles) {
      if (!p.visible) continue;
      const [x, y] = versEcran(t, p.bx, p.by);
      if (x < -r || y < -r || x > c.l + r || y > c.h + r) continue;
      const classes = e.marques.get(p.id);
      // La pastille d'un micro-État : la teinte de son pays, sa marque par-dessus.
      ajouter(x, y, r, 0, this.couleurDe(p.id, e, coul.pastille));
      // La pastille fausse : un anneau de TRAIT_FAUX_PX couleur du texte sur son bord, comme le Canvas.
      if (classes?.has('faux')) ajouter(x, y, r, TRAIT_FAUX_PX / 2, coul.texte);
    }
    for (const a of e.anneaux) {
      const en = this.donnees.entites.find((x) => x.pays.id === a.id);
      const b = en && e.proj(en.pays.point);
      if (!b) continue;
      const [x, y] = versEcran(t, b[0], b[1]);
      ajouter(x, y, a.rayon_px, 1, coul.marques[a.classe] ?? coul.marques.juste ?? coul.pastille);
    }
    if (!n) return 0;
    gl.useProgram(g.disques.p);
    gl.uniform2f(g.disques.loc('uTaille'), c.l, c.h);
    gl.uniform4fv(g.disques.loc('uBord'), premult(coul.bord));
    gl.uniform1f(g.disques.loc('uDpr'), this.dpr);
    gl.bindVertexArray(g.instances.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.instances.tampon);
    // Taille suivie ici : une lecture (getBufferParameter) attendrait le processus du GPU.
    if (this.disques.byteLength > g.instances.octets) {
      gl.bufferData(gl.ARRAY_BUFFER, this.disques.byteLength, gl.DYNAMIC_DRAW);
      g.instances.octets = this.disques.byteLength;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.disques, 0, n * PAR_DISQUE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    return 1;
  }

  /** Temps GPU de l'image (EXT_disjoint_timer_query_webgl2, si le navigateur l'offre) : une requête à la fois. */
  private lireChrono(): void {
    const ch = this.chrono;
    if (!ch) return;
    const { gl } = this;
    if (ch.q) {
      if (!gl.getQueryParameter(ch.q, gl.QUERY_RESULT_AVAILABLE)) return;
      if (!gl.getParameter(ch.ext.GPU_DISJOINT_EXT)) ch.gpu_ms = (gl.getQueryParameter(ch.q, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(ch.q);
      ch.q = null;
    }
    ch.q = gl.createQuery();
    if (!ch.q) return;
    gl.beginQuery(ch.ext.TIME_ELAPSED_EXT, ch.q);
    ch.actif = true;
  }

  private finirChrono(): void {
    const ch = this.chrono;
    if (!ch?.actif) return;
    this.gl.endQuery(ch.ext.TIME_ELAPSED_EXT);
    ch.actif = false;
  }

  /** Pour le pilote : provoque la perte du contexte, puis son retour après retour_ms (négatif : jamais rendu). */
  perdreContexte(retour_ms = 200): boolean {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    if (retour_ms >= 0) setTimeout(() => ext.restoreContext(), retour_ms);
    return true;
  }

  get contextePerdu(): boolean {
    return this.perdu;
  }

  detruire(): void {
    for (const [cible, type, f] of this.ecouteurs) cible.removeEventListener(type, f);
    clearTimeout(this.minuteurPerte);
    this.minuteurPerte = 0;
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.g = null;
    this.programmes = null;
  }
}

/** Fabrique du peintre pour CarteCanvas (option peintre : maillage sur le fil principal) ; lève WebGLIndisponible. */
export const fabriqueWebGL =
  (opts: OptionsWebGL = {}) =>
  (canvas: HTMLCanvasElement, o: { donnees: DonneesCarte; redessiner: () => void }): PeintreWebGL =>
    new PeintreWebGL(canvas, { ...o, ...opts });
