// Collecte des mesures du J0 dans le navigateur : gestes (images), touchers
// (latence), Long Animation Frames, Event Timing. Le format est dans rapport.ts.
import type { EcouteGestes, FinDeGeste } from '../map/carte';
import type { Transfo } from '../map/types';
import type { Chargement, Geste, Interaction, LongueImage, Rapport, RenduMesure, Toucher } from './rapport';
import { arrondi, intervalles, mediane, quantile, statsGeste } from './stats';

const r1 = (v: number) => arrondi(v) ?? 0;

interface GesteEnCours {
  type: Geste['type'];
  doigts_max: number;
  evenements: number;
  debut_ms: number;
  k_debut: number;
  k: number;
  horodatages: number[];
  boucle: number;
}

interface EntreeLoaf extends PerformanceEntry {
  blockingDuration: number;
  renderStart: number;
  scripts: { invoker?: string; sourceURL?: string; duration: number }[];
}

interface EntreeEvent extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  interactionId: number;
}

/**
 * Entrées Event Timing gardées même sans interactionId : celles qui finissent
 * un toucher (pointerup) ou un geste (touchend, pointerup, mouseup). En mode
 * css, l'entrée du touchend porte le vrai coût de fin de geste (transformation
 * posée au SVG, peinture et rastérisation de toute la carte, présentation).
 */
const FINS = new Set(['pointerup', 'touchend', 'mouseup']);

/**
 * Entrées de l'utilisateur qui peuvent suivre une fin de geste (nouveau geste
 * ou toucher), écoutées en capture : leur horodatage dit si l'entrée Event
 * Timing de la fin ne s'est close qu'avec l'image d'une entrée suivante
 * (fin.close_par_entree_suivante).
 */
const ENTREES = ['pointerdown', 'touchstart'] as const;

const soutenus = (): readonly string[] =>
  (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || [];

function doigts(source: Event | null): number {
  if (source && 'touches' in source) return (source as TouchEvent).touches.length;
  return source ? 1 : 0;
}

function typeDe(source: Event | null, doigtsMax: number): Geste['type'] {
  if (!source) return 'glisser';
  if (source.type === 'wheel') return 'molette';
  if ('touches' in source) return doigtsMax >= 2 ? 'pincer' : 'glisser';
  return 'souris';
}

/**
 * État Event Timing d'une fin de geste. Sans entrée, 'sous_seuil' seulement si
 * une entrée Event Timing d'un événement postérieur est arrivée : l'image de la
 * fin a alors été présentée (l'entrée de la fin se clôt à la première image
 * présentée après elle, au plus tard avec celle de l'événement suivant), donc
 * la fin a duré moins de 16 ms. Sinon 'en_attente' : une fin qui ne change
 * aucun pixel n'a pas d'entrée tant qu'aucune autre image n'est présentée, et
 * peut alors valoir plus d'une seconde (relecture V2 : 'sous_seuil' lu 1,2 s
 * après le lever, 1256 ms après une capture).
 */
function etatFin(
  src: { t_ms: number } | undefined,
  et: unknown,
  api: boolean,
  derniereEntreeEt: number,
): Geste['fin']['event_timing_etat'] {
  if (!src) return 'sans_evenement_de_fin';
  if (et) return 'mesure';
  if (!api) return 'non_pris_en_charge';
  return derniereEntreeEt > src.t_ms + 1 ? 'sous_seuil' : 'en_attente';
}

export class Mesures {
  chargement: Chargement | null = null;
  periode_ms: number | null = null;
  private gestes: Geste[] = [];
  private touchers: Toucher[] = [];
  private loaf: LongueImage[] = [];
  private evenements: (Interaction & { processingStart: number; processingEnd: number })[] = [];
  private enCours: GesteEnCours | null = null;
  /** Durées des dessins (rendu Canvas) du geste en cours, de l'événement start à end ; null hors geste. */
  private dessins: number[] | null = null;
  /** Plus grand startTime des entrées Event Timing reçues, toutes, même écartées de this.evenements. */
  private derniereEntreeEt = -Infinity;
  /** Horodatages (event.timeStamp) des pointerdown et touchstart, en capture. */
  private entrees: number[] = [];
  /** Zoom à l'événement start du geste en cours (k_debut). */
  private kDepart: number | null = null;
  /** Événement qui a fini chaque geste (type et timeStamp), rattaché à Event Timing dans rapport(). */
  private finsGestes = new WeakMap<Geste, { nom: string; t_ms: number }>();
  private abonnes = new Set<() => void>();
  readonly capacites = {
    long_animation_frame: soutenus().includes('long-animation-frame'),
    event_timing: soutenus().includes('event'),
  };

  constructor(private readonly ctx: { version: string; rendu: RenduMesure; projection: 'monde' | 'pacifique'; carte: () => { largeur: number; hauteur: number } }) {
    if (this.capacites.long_animation_frame) {
      new PerformanceObserver((liste) => {
        for (const e of liste.getEntries() as EntreeLoaf[]) {
          this.loaf.push({
            debut_ms: r1(e.startTime),
            duree_ms: r1(e.duration),
            blocage_ms: r1(e.blockingDuration),
            rendu_ms: r1(e.renderStart),
            scripts: [...(e.scripts ?? [])]
              .sort((a, b) => b.duration - a.duration)
              .slice(0, 3)
              .map((s) => ({ origine: `${s.invoker ?? '?'} ${s.sourceURL ?? ''}`.trim(), duree_ms: r1(s.duration) })),
          });
        }
        this.signaler();
      }).observe({ type: 'long-animation-frame', buffered: true });
    }
    if (this.capacites.event_timing) {
      new PerformanceObserver((liste) => {
        for (const e of liste.getEntries() as EntreeEvent[]) {
          this.derniereEntreeEt = Math.max(this.derniereEntreeEt, e.startTime);
          if (!e.interactionId && !FINS.has(e.name)) continue;
          this.evenements.push({
            nom: e.name,
            debut_ms: e.startTime,
            duree_ms: e.duration,
            interaction: e.interactionId,
            processingStart: e.processingStart,
            processingEnd: e.processingEnd,
          });
        }
        this.signaler();
      }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    }
    if (typeof window !== 'undefined') {
      for (const type of ENTREES) window.addEventListener(type, (e) => this.entrees.push(e.timeStamp), { capture: true, passive: true });
    }
  }

  /** Abonnement aux changements (panneau des mesures). */
  surChangement(f: () => void): () => void {
    this.abonnes.add(f);
    return () => this.abonnes.delete(f);
  }

  private signaler(): void {
    for (const f of this.abonnes) f();
  }

  /** Période de l'écran au repos : médiane de 30 intervalles requestAnimationFrame. */
  mesurerRepos(n = 30): Promise<number> {
    return new Promise((ok) => {
      const ts: number[] = [];
      const pas = (t: number) => {
        ts.push(t);
        if (ts.length <= n) requestAnimationFrame(pas);
        else {
          this.periode_ms = arrondi(mediane(intervalles(ts)), 2) ?? 1000 / 60;
          this.signaler();
          ok(this.periode_ms);
        }
      };
      requestAnimationFrame(pas);
    });
  }

  /** Écouteurs à passer à la Carte. */
  ecouteGestes(): EcouteGestes {
    return {
      debut: (t) => {
        this.arreterBoucle();
        this.enCours = null;
        this.kDepart = t.k;
        this.dessins = [];
      },
      mouvement: (t: Transfo, source) => {
        let g = this.enCours;
        if (!g) {
          g = this.enCours = {
            type: 'glisser',
            doigts_max: 0,
            evenements: 0,
            debut_ms: performance.now(),
            k_debut: this.kDepart ?? t.k,
            k: t.k,
            horodatages: [],
            boucle: 0,
          };
          const g2 = g;
          const pas = (ts: number) => {
            g2.horodatages.push(ts);
            g2.boucle = requestAnimationFrame(pas);
          };
          g.boucle = requestAnimationFrame(pas);
        }
        g.evenements++;
        g.k = t.k;
        g.doigts_max = Math.max(g.doigts_max, doigts(source));
        g.type = typeDe(source, g.doigts_max);
      },
      fin: (f: FinDeGeste) => this.finGeste(f),
      // Rendu Canvas : chaque image dessinée entre start et end (le dessin de
      // la fin elle-même est dans fin.script_ms).
      dessin: (ms: number) => this.dessins?.push(ms),
    };
  }

  private arreterBoucle(): void {
    if (this.enCours) cancelAnimationFrame(this.enCours.boucle);
  }

  private finGeste(f: FinDeGeste): void {
    const g = this.enCours;
    const dessins = this.dessins;
    this.arreterBoucle();
    this.enCours = null;
    this.dessins = null;
    if (!g || !f.a_bouge) return;
    const iv = intervalles(g.horodatages).map((v) => r1(v));
    const geste: Geste = {
      type: g.type,
      rendu: this.ctx.rendu,
      debut_ms: r1(g.debut_ms),
      fin_ms: r1(performance.now()),
      doigts_max: g.doigts_max,
      evenements: g.evenements,
      k_debut: arrondi(g.k_debut, 3) ?? 1,
      k_fin: arrondi(g.k, 3) ?? 1,
      intervalles_ms: iv,
      stats: statsGeste(iv, this.periode_ms ?? 1000 / 60),
      longues_images: { nombre: 0, max_ms: null, blocage_total_ms: 0 },
      dessin_ms: dessins?.length
        ? { images: dessins.length, mediane: r1(mediane(dessins) as number), p95: r1(quantile(dessins, 0.95) as number), max: r1(Math.max(...dessins)) }
        : null,
      fin: {
        script_ms: r1(f.script_ms),
        image_ms: null,
        event_timing_ms: null,
        event_timing_etat: 'sans_evenement_de_fin',
        t_evenement_ms: null,
        entree_suivante_ms: null,
        close_par_entree_suivante: null,
      },
    };
    this.gestes.push(geste);
    if (f.source && FINS.has(f.source.type)) {
      this.finsGestes.set(geste, { nom: f.source.type, t_ms: f.source.timeStamp });
      geste.fin.t_evenement_ms = r1(f.source.timeStamp);
    }
    void f.image.then((ms) => {
      geste.fin.image_ms = r1(ms);
      this.signaler();
    });
    this.signaler();
  }

  /**
   * Mesure un toucher : exécute la rétroaction (pick, note, classes), puis la
   * latence jusqu'à l'image suivante.
   */
  toucher(ev: PointerEvent, x: number, y: number, retroaction: () => Pick<Toucher, 'pick'> & Partial<Pick<Toucher, 'cible' | 'juste' | 'distance_km'>>): void {
    const t0 = performance.now();
    const res = retroaction();
    const t1 = performance.now();
    const toucher: Toucher = {
      t_ms: r1(ev.timeStamp),
      x: r1(x),
      y: r1(y),
      pointeur: ev.pointerType,
      ...res,
      traitement_ms: arrondi(t1 - t0, 2) ?? 0,
      latence_raf_ms: null,
      fin_fil_principal_ms: null,
      event_timing: null,
      event_timing_etat: this.capacites.event_timing ? 'sous_seuil' : 'non_pris_en_charge',
    };
    if (toucher.distance_km != null) toucher.distance_km = arrondi(toucher.distance_km, 1);
    if (toucher.pick) toucher.pick = { ...toucher.pick, distance_px: r1(toucher.pick.distance_px) };
    this.touchers.push(toucher);
    requestAnimationFrame(() => {
      toucher.latence_raf_ms = r1(performance.now() - ev.timeStamp);
      const canal = new MessageChannel();
      canal.port1.onmessage = () => {
        toucher.fin_fil_principal_ms = r1(performance.now() - ev.timeStamp);
        this.signaler();
      };
      canal.port2.postMessage(0);
    });
    this.signaler();
  }

  reinitialiser(): void {
    this.gestes = [];
    this.touchers = [];
    this.loaf = [];
    this.evenements = [];
    this.entrees = [];
    this.derniereEntreeEt = -Infinity;
    this.signaler();
  }

  /** Entrée Event Timing d'un événement, retrouvée par son type et son timeStamp (= startTime). */
  private entree(nom: string, t_ms: number) {
    return this.evenements.find((en) => en.nom === nom && Math.abs(en.debut_ms - t_ms) < 1);
  }

  rapport(): Rapport {
    const periode = this.periode_ms ?? 1000 / 60;
    const gestes = this.gestes.map((g) => {
      const recouvre = this.loaf.filter((l) => l.debut_ms < g.fin_ms + 50 && l.debut_ms + l.duree_ms > g.debut_ms);
      const src = this.finsGestes.get(g);
      const et = src ? this.entree(src.nom, src.t_ms) : undefined;
      const suivante = src ? this.entrees.find((t) => t > src.t_ms) : undefined;
      return {
        ...g,
        stats: statsGeste(g.intervalles_ms, periode),
        fin: {
          ...g.fin,
          event_timing_ms: et ? et.duree_ms : null,
          event_timing_etat: etatFin(src, et, this.capacites.event_timing, this.derniereEntreeEt),
          entree_suivante_ms: suivante == null ? null : r1(suivante),
          close_par_entree_suivante: !src || !et ? null : suivante != null && src.t_ms + et.duree_ms >= suivante,
        },
        longues_images: {
          nombre: recouvre.length,
          max_ms: recouvre.length ? Math.max(...recouvre.map((l) => l.duree_ms)) : null,
          blocage_total_ms: r1(recouvre.reduce((a, l) => a + l.blocage_ms, 0)),
        },
      };
    });
    const touchers = this.touchers.map((t) => {
      const e = this.entree('pointerup', t.t_ms);
      return {
        ...t,
        event_timing_etat: e ? ('mesure' as const) : t.event_timing_etat,
        event_timing: e
          ? {
              duree_ms: e.duree_ms,
              attente_ms: r1(e.processingStart - e.debut_ms),
              traitement_ms: r1(e.processingEnd - e.processingStart),
              presentation_ms: r1(e.debut_ms + e.duree_ms - e.processingEnd),
              interaction: e.interaction,
            }
          : null,
      };
    });
    const carte = this.ctx.carte();
    return {
      v: 5,
      version: this.ctx.version,
      date: new Date().toISOString(),
      agent: navigator.userAgent,
      ecran: {
        largeur: window.innerWidth,
        hauteur: window.innerHeight,
        dpr: window.devicePixelRatio,
        carte,
        periode_ms: this.periode_ms,
        hz: this.periode_ms ? arrondi(1000 / this.periode_ms, 1) : null,
      },
      rendu: this.ctx.rendu,
      projection: this.ctx.projection,
      capacites: { ...this.capacites },
      chargement: this.chargement,
      gestes,
      touchers,
      longues_images: [...this.loaf],
      interactions: this.evenements
        .filter((e) => e.interaction > 0)
        .map((e) => ({ nom: e.nom, debut_ms: r1(e.debut_ms), duree_ms: e.duree_ms, interaction: e.interaction })),
    };
  }
}
