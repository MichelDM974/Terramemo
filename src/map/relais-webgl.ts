// Chargement du rendu webgl (décision « Chargement du rendu WebGL », 04/11) :
// la carte s'affiche d'abord en Canvas 2D (CarteCanvas, la même carte qui
// tourne) ; le maillage se calcule dans un Web Worker (maillage.worker.ts) ou
// sort du cache de l'appareil ; puis le WebGL prend le relais (adopter), à la
// même vue. Le fil principal ne fait que ce qui ne peut se faire ailleurs :
// créer le contexte, lancer la compilation des shaders (attendue image après
// image avec KHR_parallel_shader_compile), téléverser les tampons, échanger
// les éléments canvas.
//
// Repli : la carte reste (ou revient) en Canvas 2D quand le WebGL2 manque ou
// n'est que logiciel (failIfMajorPerformanceCaveat), quand un shader est
// refusé, quand le maillage échoue, et quand le contexte se perd sans être
// rendu (DELAI_PERTE_MS, carte-webgl.ts). La raison va dans l'état (rapport
// des mesures : webgl, #carte : data-relais, data-repli).
//
// Pourquoi : le maillage coûte 250 ms au processeur du PC, 640 à 740 ms ralenti
// 4× (relecture du rendu webgl), en une seule longue tâche ; sur le fil
// principal, il bloquait l'appli et poussait le premier affichage au-delà
// d'une seconde. Le précalculer au build ajouterait 1,5 à 3 Mo à télécharger
// par nouveau visiteur (décision : non).
import { CarteCanvas } from './carte-canvas';
import { PeintreWebGL, WebGLIndisponible } from './carte-webgl';
import type { DonneesCarte, TextesCarte } from './donnees';
import { deballer, type Maillage } from './maillage';
import { deballerMaillage, formesDesTextes, maillerMers } from './maillage-mers';
import type { DemandeMaillageMers, ReponseMaillageMers } from './maillage-mers.worker';
import type { DureesMaillage, DemandeMaillage, ReponseMaillage } from './maillage.worker';
import type { CoucheMers } from './mers';

/** Processeurs graphiques logiciels : 5 à 7 images/s mesurées avec SwiftShader (relecture du rendu webgl). */
const LOGICIEL = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

/** Au-delà, le maillage est tenu pour perdu (Worker bloqué) : la carte reste en Canvas 2D. */
const DELAI_MAILLAGE_MS = 30_000;

const r1 = (x: number) => Math.round(x * 10) / 10;
/** Rend la main jusqu'après la prochaine image : une étape du relais par image, jamais deux d'un bloc. */
const uneImage = () => new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));

/** Où en est le relais ; copié dans le rapport des mesures (champ webgl) et dans #carte. */
export interface EtatRelais {
  /** attente : Canvas 2D en attendant le WebGL ; webgl : le WebGL dessine ; repli : Canvas 2D pour de bon. */
  etape: 'attente' | 'webgl' | 'repli';
  raison: string | null;
  /** Processeur graphique (UNMASKED_RENDERER_WEBGL), même refusé comme logiciel ; lu à la demande (lireGpu). */
  gpu: string | null;
  /** Le WebGL refusé n'était que logiciel (SwiftShader…). */
  logiciel: boolean;
  maillage: {
    /** cache : lu sur l'appareil (IndexedDB) ; calcul : calculé par le Worker. */
    source: 'cache' | 'calcul' | null;
    /** État du cache vu par le Worker : lu, absent, perime, ignore (?maillage=0), coupe (dev), erreur… */
    cache: string | null;
    /** Écriture dans le cache après un calcul : gardé, ou l'erreur. */
    ecrit: string | null;
    worker: DureesMaillage | null;
  };
  /** Instants depuis performance.timeOrigin (_a_ms) et durées (_ms) du fil principal. */
  temps: {
    envoi_a_ms: number | null;
    maillage_recu_a_ms: number | null;
    /** getContext (et lecture des couleurs) : bloque le fil principal. */
    contexte_ms: number | null;
    /** Du lancement de la compilation à sa fin constatée (vérifiée image après image : pas un blocage). */
    compilation_ms: number | null;
    /** Du premier au dernier tampon, une image entre deux (le blocage : etapes « televersement n »). */
    televersement_ms: number | null;
    /** Échange des canvas : la première image dessinée par le WebGL. */
    relais_a_ms: number | null;
    /** Du premier affichage (Canvas 2D) au relais. */
    apres_affichage_ms: number | null;
    /** Chaque tâche du fil principal : nom, début (depuis timeOrigin), durée ; aussi en performance.measure « webgl:… ». */
    etapes: { nom: string; a_ms: number; ms: number }[];
  };
}

export interface OptionsRelais {
  antialias: boolean;
  logicielAccepte: boolean;
  /** Lire le maillage gardé sur l'appareil (?maillage=0 : recalculé et réécrit). */
  lireCache: boolean;
  /** Appelé à chaque changement d'état (mesures, data-* de #carte). */
  surEtat?: (e: EtatRelais) => void;
}

export class RelaisWebGL {
  readonly etat: EtatRelais = {
    etape: 'attente',
    raison: null,
    gpu: null,
    logiciel: false,
    maillage: { source: null, cache: null, ecrit: null, worker: null },
    temps: { envoi_a_ms: null, maillage_recu_a_ms: null, contexte_ms: null, compilation_ms: null, televersement_ms: null, relais_a_ms: null, apres_affichage_ms: null, etapes: [] },
  };
  peintre: PeintreWebGL | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private carte: CarteCanvas | null = null;
  private compilation: Promise<void> | null = null;
  private echec: unknown = null;
  private worker: Worker | null = null;
  private recu: Promise<ReponseMaillage>;
  private recevoir!: (r: ReponseMaillage) => void;

  /** Crée le Worker tout de suite : son script se charge pendant le téléchargement des données. */
  constructor(private readonly o: OptionsRelais) {
    this.recu = new Promise((ok) => (this.recevoir = ok));
    try {
      this.worker = new Worker(new URL('./maillage.worker.ts', import.meta.url), { type: 'module', name: 'maillage' });
      this.worker.onmessage = (ev: MessageEvent<ReponseMaillage>) => {
        const r = ev.data;
        if (r.type === 'ecrit') {
          this.etat.maillage.ecrit = r.ok ? `gardé (${r1(r.ms)} ms)` : `erreur : ${r.detail}`;
          this.signaler();
          this.worker?.terminate();
          this.worker = null;
          return;
        }
        this.recevoir(r);
      };
      this.worker.onerror = (ev) => this.recevoir({ type: 'erreur', erreur: `Worker : ${ev.message || 'script en échec'}` });
    } catch (e) {
      this.recevoir({ type: 'erreur', erreur: `Worker impossible : ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  /** Les fichiers déjà lus partent au Worker (copie d'une chaîne : ~1 ms pour 1,3 Mo). */
  envoyer(textes: TextesCarte): void {
    if (!this.worker) return;
    const d: DemandeMaillage = { ...textes, lireCache: this.o.lireCache };
    this.etat.temps.envoi_a_ms = r1(performance.now());
    this.worker.postMessage(d);
  }

  /**
   * Contexte WebGL et compilation des shaders, dès les fichiers demandés
   * (main.ts) : le fil principal attend alors le réseau, et le processus du
   * GPU compile pendant l'analyse des données. Après le premier affichage, la
   * compilation figeait l'écran du Canvas 2D : une image de 120 à 180 ms sur
   * le PC chargé (Long Animation Frame sans script, le compositeur attendant
   * le GPU), même avec KHR_parallel_shader_compile.
   */
  preparer(): void {
    if (this.peintre || this.echec) return;
    try {
      const canvas = CarteCanvas.element();
      const peintre = this.etape('contexte', () =>
        new PeintreWebGL(canvas, {
          donnees: null,
          redessiner: () => this.carte?.redessiner(),
          antialias: this.o.antialias,
          logicielAccepte: this.o.logicielAccepte,
          // La couche marine, quand elle arrive : son maillage dans son Worker, que le relais du monde n'attend pas.
          maillerMers: (c) => maillerMersEnFond(c, this.o.lireCache),
          surPerteDurable: (raison) => {
            if (this.carte?.peintre === peintre && this.carte.revenirAuCanvas2D()) this.repli(raison);
          },
        }),
      );
      this.peintre = peintre;
      this.canvas = canvas;
      this.etat.temps.contexte_ms = this.derniere();
      const t1 = performance.now();
      this.compilation = peintre.compiler().then(() => {
        this.etat.temps.compilation_ms = r1(performance.now() - t1);
      });
      this.compilation.catch(() => undefined); // l'erreur est relevée par relayer
    } catch (e) {
      this.echec = e;
    }
  }

  /**
   * Après le premier affichage en Canvas 2D : attend les shaders et le
   * maillage, téléverse, puis le relais. Résout quand le WebGL dessine ou que
   * la carte reste en Canvas 2D (jamais en erreur : la raison est dans l'état).
   */
  async relayer(carte: CarteCanvas, donnees: DonneesCarte, affichee_a_ms: number): Promise<EtatRelais> {
    this.carte = carte;
    try {
      this.preparer();
      if (this.echec) throw this.echec;
      const peintre = this.peintre;
      const canvas = this.canvas;
      if (!peintre || !canvas) throw new Error('WebGL : peintre absent');
      await this.compilation;
      // Logiciel déclaré (SwiftShader, llvmpipe…) : Chrome ne lève failIfMajorPerformanceCaveat que s'il y
      // est tombé faute de GPU accepté, pas quand le logiciel est son réglage (chrome-headless-shell).
      // Lu après la compilation : plus rien à attendre du processus du GPU, 0,5 à 8 ms (93 ms au premier
      // lancement du navigateur sur le PC).
      const nom = this.lireGpu();
      if (nom && !this.o.logicielAccepte && LOGICIEL.test(nom)) throw new WebGLIndisponible(`WebGL2 logiciel refusé (${nom})`, nom);
      let minuteur = 0;
      const r = await Promise.race([
        this.recu,
        new Promise<ReponseMaillage>((ok) => (minuteur = window.setTimeout(() => ok({ type: 'erreur', erreur: `pas de maillage après ${DELAI_MAILLAGE_MS / 1000} s` }), DELAI_MAILLAGE_MS))),
      ]);
      clearTimeout(minuteur);
      this.etat.temps.maillage_recu_a_ms = r1(performance.now());
      if (r.type !== 'maillage') throw new Error(r.type === 'erreur' ? `maillage : ${r.erreur}` : 'maillage : réponse inattendue');
      this.etat.maillage = { ...this.etat.maillage, source: r.source, cache: r.cache, worker: arrondir(r.ms) };
      if (!r.ecrira) {
        this.worker?.terminate(); // rien à écrire : le Worker a fini
        this.worker = null;
      }
      await uneImage();
      const m = this.etape('deballage', () => deballer(r.m));
      const t2 = performance.now();
      let n = 0;
      this.debut();
      await peintre.chargerPeuAPeu(m, donnees, () => (this.fin(`televersement ${++n}`), uneImage().then(() => this.debut())));
      this.fin(`televersement ${++n}`);
      this.etat.temps.televersement_ms = r1(performance.now() - t2);
      if (peintre.contextePerdu) throw new Error('contexte perdu avant le relais');
      await uneImage();
      // adopter : première image hors du document (tâche à part), puis l'échange à l'image suivante.
      this.debut();
      const adopte = carte.adopter(canvas, peintre);
      this.fin('premiere image');
      await adopte;
      const t3 = performance.now();
      this.etat.etape = 'webgl';
      this.etat.temps.relais_a_ms = r1(t3);
      this.etat.temps.apres_affichage_ms = r1(t3 - affichee_a_ms);
      this.signaler();
    } catch (e) {
      if (e instanceof WebGLIndisponible) {
        const nom = e.logiciel ?? this.etape('diagnostic', () => PeintreWebGL.diagnostiquer());
        this.etat.gpu = nom;
        this.etat.logiciel = nom !== null;
        e.message = nom ? `WebGL2 logiciel refusé (${nom})` : 'WebGL2 indisponible';
      }
      this.peintre?.detruire();
      this.peintre = null;
      this.worker?.terminate();
      this.worker = null;
      this.repli(e instanceof Error ? e.message : String(e));
    }
    return this.etat;
  }

  private t = 0;
  private debut(): void {
    this.t = performance.now();
  }
  /** Ferme l'étape commencée par debut() : dans l'état et en performance.measure (alignée sur les Long Animation Frames). */
  private fin(nom: string): void {
    const ms = performance.now() - this.t;
    this.etat.temps.etapes.push({ nom, a_ms: r1(this.t), ms: r1(ms) });
    try {
      performance.measure(`webgl:${nom}`, { start: this.t, duration: ms });
    } catch {
      /* User Timing absent : l'état suffit */
    }
  }
  private etape<T>(nom: string, f: () => T): T {
    this.debut();
    try {
      return f();
    } finally {
      this.fin(nom);
    }
  }
  private derniere(): number {
    return this.etat.temps.etapes.at(-1)?.ms ?? 0;
  }

  /**
   * Nom du processeur graphique : un appel synchrone au processus du GPU, qui
   * attend la fin de l'initialisation du contexte (136 à 152 ms sur le PC si
   * on le lit tout de suite) ; d'où sa lecture après la compilation des
   * shaders seulement (relayer), ou à la demande (rapport, pilote).
   */
  lireGpu(): string | null {
    if (this.etat.gpu === null && this.peintre && !this.peintre.contextePerdu) {
      this.etat.gpu = this.etape('nom du GPU', () => this.peintre?.renderer ?? null);
      this.signaler();
    }
    return this.etat.gpu;
  }

  private repli(raison: string): void {
    console.warn('Rendu webgl : la carte reste en canvas :', raison);
    this.etat.etape = 'repli';
    this.etat.raison = raison;
    this.signaler();
  }

  private signaler(): void {
    this.o.surEtat?.(this.etat);
  }
}

function arrondir(ms: DureesMaillage): DureesMaillage {
  return { cle_ms: r1(ms.cle_ms), lecture_ms: r1(ms.lecture_ms), analyse_ms: r1(ms.analyse_ms), maillage_ms: r1(ms.maillage_ms), total_ms: r1(ms.total_ms) };
}

/**
 * Le maillage des océans et mers (lot 3a) dans son Web Worker
 * (maillage-mers.worker.ts) ou sorti du cache de l'appareil ('webgl-mers'),
 * quand la couche marine arrive ; sur le fil principal si le Worker échoue
 * (quelques dizaines de ms : 15 000 sommets, contre 125 000 pour les terres).
 */
export function maillerMersEnFond(c: CoucheMers, lireCache: boolean): Promise<Maillage> {
  const surFil = () => maillerMers(formesDesTextes(c.textes));
  return new Promise<Maillage>((ok) => {
    let worker: Worker | null = null;
    const repli = (raison: string) => {
      console.warn('Maillage des mers sur le fil principal :', raison);
      worker?.terminate();
      ok(surFil());
    };
    let w: Worker;
    try {
      w = worker = new Worker(new URL('./maillage-mers.worker.ts', import.meta.url), { type: 'module', name: 'maillage-mers' });
    } catch (e) {
      return repli(e instanceof Error ? e.message : String(e));
    }
    let recu = false;
    w.onmessage = (ev: MessageEvent<ReponseMaillageMers>) => {
      const r = ev.data;
      if (r.type === 'ecrit') return w.terminate();
      if (r.type === 'erreur') return repli(r.erreur);
      recu = true;
      if (!r.ecrira) w.terminate();
      ok(deballerMaillage(r.m));
    };
    w.onerror = (ev) => {
      if (!recu) repli(`Worker : ${ev.message || 'script en échec'}`);
    };
    const d: DemandeMaillageMers = { topo: c.textes.topo, mers: c.textes.mers, lireCache };
    w.postMessage(d);
  });
}
