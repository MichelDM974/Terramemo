// Séquenceur d'une séance (étude J1a § 3, 4 et 6 ; décisions « Apprendre et
// Révision du jour », « Sens « quel est ce pays ? » », « Cadrage et disques
// en séance » du 06/11). Machine à états pure : elle reçoit le programme du
// jour (planif.ts), une horloge, un hasard et des ids injectés, rend l'étape
// à poser et, à chaque réponse, l'événement du journal (journal.ts) avec sa
// note figée (note.ts). Les vues (src/vues/seance.ts) ne connaissent pas FSRS.
//
// Ordre d'une séance : les révisions dues (mélangées : la file de planif est
// triée par échéance puis par id, l'ordre alphabétique des ISO3), puis les
// fiches nommer à introduire, puis la grappe nouvelle : son QCM (un raté
// revient en fin de QCM, PASSAGES_QCM passages au plus ; « Je connais déjà »
// saute le QCM du pays), puis son rappel au toucher, mélangé. Un raté noté
// (rappel, révision, carte retournée) revient en fin de séance (reprise),
// sans nouvelle note : une note par fiche et par jour.

import { analyser, former, type Domaine } from './fiches';
import type { Horloge } from './jour';
import type { Aide, Evenement, ModeEvenement, Via } from './journal';
import { noteEtape, type Note } from './note';

/** Étape de la file : QCM d'apprentissage, rappel (première note localiser), révision, carte retournée (nommer), reprise d'un raté. */
export type SorteEtape = 'qcm' | 'rappel' | 'revision' | 'retournee' | 'reprise';
/** Ce que la vue montre : Trouver (localiser), le QCM de Reconnaître, la carte retournée (nommer). */
export type FormeEtape = 'trouver' | 'qcm' | 'retournee';

/**
 * Cadrage de la carte à poser avant une question (décision « Cadrage et
 * disques en séance ») : le monde entier (une question de Trouver après un
 * QCM ou une carte retournée, qui ont volé jusqu'à leur zone, ou au début,
 * ou après « Voir », qui a volé jusqu'à sa cible), ou la région de la grappe
 * au début de son rappel (et après un « Voir » pendant ce rappel). Les autres questions de
 * Trouver laissent la carte au joueur (un cadrage par question donnerait la
 * réponse).
 */
export type Cadrage = { sorte: 'monde' } | { sorte: 'grappe'; ids: readonly string[] };

export interface Etape {
  etape: SorteEtape;
  /** Fiche notée (pour le QCM : la fiche nommer de l'entité, hors FSRS). */
  fiche: string;
  /** Id de l'entité. */
  id: string;
  /** Domaine de la fiche : la vue pose la question selon son sujet (étude J2 § 6.5), même dans un bloc qui en mêle plusieurs. */
  domaine: Domaine;
  forme: FormeEtape;
  /** Mode du journal : qcm, rappel (première note d'une fiche), revision (une reprise garde celui de l'étape reprise). */
  mode: ModeEvenement;
  /** 1 au premier passage ; un QCM raté ou une reprise repassent avec 2, 3. */
  passage: number;
  /** Cadrage à poser avant de la montrer (fixé quand elle devient l'étape courante). */
  cadrage: Cadrage | null;
}

/** Programme d'une séance (planif.ts programme()) : fiches à réviser, fiches nommer à introduire, entités de la grappe nouvelle. */
export interface PlanSeance {
  domaine: Domaine;
  revisions: readonly string[];
  introductions: readonly string[];
  /** Ids des entités nouvelles (la grappe), dans son ordre. */
  nouveaux: readonly string[];
}

/** Ce que la vue rapporte d'une question finie. */
export interface ReponseSeance {
  /** Juste au premier toucher (au premier choix, « Je savais »), sans aide. */
  correct: boolean;
  /** « Voir » ou « Passer » pris avant de trouver (Trouver). */
  aide?: 'voir' | 'passer' | null;
  /** Id désigné par la carte au premier toucher, ou nom choisi au QCM, si faux. */
  reponse?: string | null;
  via?: Via | null;
  zoom?: number | null;
  distance_km?: number | null;
  /** Temps jusqu'à la première réponse (ms). */
  duree_ms: number;
}

export interface ContexteSeance {
  /** uuid de la séance. */
  seance: string;
  appareil: string;
  horloge: Horloge;
  /** Nouvel id d'événement (uuid). */
  nouvelId: () => string;
  /** Hasard dans [0, 1) (mélange de la file). */
  hasard: () => number;
}

/** Passages au plus d'un pays au QCM d'apprentissage. */
export const PASSAGES_QCM = 3;
/** Passages au plus d'une fiche ratée (la question, puis ses reprises en fin de séance). */
export const PASSAGES_REPRISE = 3;
/** Borne d'un événement (étude § 8) : une séance laissée ouverte ne fausse ni la durée ni la règle d'envoi. */
export const DUREE_MAX_MS = 120_000;
const ZOOM_MAX = 1e4;
const DISTANCE_MAX_KM = 20_100;

export interface BilanSeance {
  /** Révisions et introductions nommer répondues (premier passage) et justes du premier coup. */
  revisions: { n: number; premiers: number };
  /** Entités de la grappe dont le rappel est fait, dans l'ordre des réponses. */
  nouveaux: string[];
  /** QCM de la grappe : questions répondues et justes. */
  qcm: { n: number; justes: number };
  /** Fiches ratées au premier passage (notées Again), avec la distance au premier toucher. */
  rates: { fiche: string; id: string; distance_km: number | null }[];
  /** Événements écrits. */
  reponses: number;
}

function melanger<T>(t: readonly T[], hasard: () => number): T[] {
  const r = [...t];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [r[i], r[j]] = [r[j] as T, r[i] as T];
  }
  return r;
}

const borner = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

/**
 * L'événement d'une réponse (journal.ts) : reponse rempli seulement si faux,
 * via seulement si juste, durée bornée, note figée. Sert aussi aux parties
 * libres (mode 'libre', note null : D11).
 */
export function evenementReponse(
  ctx: Pick<ContexteSeance, 'appareil' | 'horloge' | 'nouvelId'> & { seance: string | null },
  fiche: string,
  mode: ModeEvenement,
  r: Omit<ReponseSeance, 'aide'> & { aide?: Aide | null },
  note: Note | null,
): Evenement {
  const { ts, tz } = ctx.horloge();
  const zoom = r.zoom != null && Number.isFinite(r.zoom) && r.zoom > 0 ? borner(r.zoom, 1e-6, ZOOM_MAX) : null;
  const distance = r.distance_km != null && Number.isFinite(r.distance_km) ? borner(r.distance_km, 0, DISTANCE_MAX_KM) : null;
  return {
    v: 1,
    id: ctx.nouvelId(),
    appareil: ctx.appareil,
    ts: Math.round(ts),
    tz: Math.round(tz),
    seance: ctx.seance,
    type: 'reponse',
    fiche,
    mode,
    reponse: r.correct ? null : (r.reponse ?? null),
    via: r.correct ? (r.via ?? null) : null,
    zoom,
    correct: r.correct,
    aide: r.aide ?? null,
    duree_ms: Math.round(borner(Number.isFinite(r.duree_ms) ? r.duree_ms : 0, 0, DUREE_MAX_MS)),
    distance_km: distance,
    note,
  };
}

export class Seance {
  private file: Etape[] = [];
  private courante_: Etape | null = null;
  /** Fiches déjà notées dans la séance : une note par fiche et par jour. */
  private readonly notees = new Set<string>();
  /** Entités dont « Je connais déjà » a sauté le QCM : leur rappel juste vaut Easy. */
  private readonly connus = new Set<string>();
  /** La forme de la dernière question montrée (cadrage de la suivante). */
  private precedente: FormeEtape | null = null;
  /** La dernière réponse a pris « Voir » : la carte a volé jusqu'à sa cible (cadrage de la suivante). */
  private apresVoir = false;
  private rappelCadre = false;
  private qcmCadre = false;
  private repondues = 0;
  private readonly grappe: readonly string[];
  private readonly b: BilanSeance = { revisions: { n: 0, premiers: 0 }, nouveaux: [], qcm: { n: 0, justes: 0 }, rates: [], reponses: 0 };

  constructor(
    plan: PlanSeance,
    private readonly ctx: ContexteSeance,
  ) {
    const d = plan.domaine;
    const etape = (fiche: string, sorte: SorteEtape, mode: ModeEvenement): Etape | null => {
      const f = analyser(fiche);
      if (!f) return null;
      const forme: FormeEtape = sorte === 'qcm' ? 'qcm' : f.sens === 'nommer' ? 'retournee' : 'trouver';
      return { etape: sorte === 'revision' && forme === 'retournee' ? 'retournee' : sorte, fiche, id: f.id, domaine: f.domaine, forme, mode, passage: 1, cadrage: null };
    };
    const ok = (e: Etape | null): e is Etape => e !== null;
    this.grappe = [...plan.nouveaux];
    this.file = [
      ...melanger(plan.revisions, ctx.hasard).map((f) => etape(f, 'revision', 'revision')),
      ...plan.introductions.map((f) => etape(f, 'retournee', 'rappel')),
      ...melanger(plan.nouveaux, ctx.hasard).map((id) => etape(former(d, id, 'nommer'), 'qcm', 'qcm')),
      ...melanger(plan.nouveaux, ctx.hasard).map((id) => etape(former(d, id, 'localiser'), 'rappel', 'rappel')),
    ].filter(ok);
    this.avancer();
  }

  /** L'étape à poser ; null une fois la séance finie. */
  get courante(): Etape | null {
    return this.courante_;
  }

  get finie(): boolean {
    return this.courante_ === null;
  }

  /** Numéro de la question en cours (à partir de 1) et total connu (il croît avec les reprises). */
  get numero(): number {
    return this.repondues + 1;
  }
  get total(): number {
    return this.repondues + this.file.length + (this.courante_ ? 1 : 0);
  }

  /** La fiche sera-t-elle encore posée dans la séance (reprise à venir) ? */
  reste(fiche: string): boolean {
    return this.courante_?.fiche === fiche || this.file.some((e) => e.fiche === fiche);
  }

  /** Les entités de la grappe nouvelle (cadrage du rappel). */
  get nouveaux(): readonly string[] {
    return this.grappe;
  }

  private avancer(): void {
    const e = this.file.shift() ?? null;
    if (e) {
      if (e.etape === 'qcm' && !this.qcmCadre) {
        // Le QCM d'une grappe s'ouvre sur sa région (voisins compris) : au monde entier, un pays moyen n'y faisait que quelques pixels.
        e.cadrage = { sorte: 'grappe', ids: this.grappe };
        this.qcmCadre = true;
      } else if (e.etape === 'rappel' && !this.rappelCadre) {
        e.cadrage = { sorte: 'grappe', ids: this.grappe };
        this.rappelCadre = true;
      } else if (e.forme === 'trouver' && (this.precedente !== 'trouver' || this.apresVoir))
        // Après « Voir », la carte est au zoom de la cible, souvent un voisin de la suivante : la région du rappel, le monde sinon.
        e.cadrage = this.apresVoir && e.mode === 'rappel' && this.grappe.includes(e.id) ? { sorte: 'grappe', ids: this.grappe } : { sorte: 'monde' };
      this.precedente = e.forme;
    }
    this.apresVoir = false;
    this.courante_ = e;
  }

  /**
   * « Je connais déjà » (QCM d'un pays nouveau) : le QCM de ce pays est
   * sauté, son rappel reste ; juste, il vaudra Easy (note.ts). Au premier
   * passage du QCM seulement (sans effet sur un QCM reposé). Sans événement
   * (le type 'connu' est réservé) : la prétention se vérifie au rappel.
   */
  connu(): void {
    const e = this.courante_;
    // Au premier passage seul : un QCM reposé l'est après un échec, et le joueur a montré qu'il ne connaissait pas le pays (pas d'Easy).
    if (!e || e.etape !== 'qcm' || e.passage > 1) return;
    this.connus.add(e.id);
    this.file = this.file.filter((x) => !(x.etape === 'qcm' && x.id === e.id));
    this.avancer();
  }

  /** La réponse à l'étape courante : l'événement à écrire (une note par fiche et par jour), puis l'étape suivante. */
  repondre(r: ReponseSeance): Evenement {
    const e = this.courante_;
    if (!e) throw new Error('Seance : séance finie');
    const aide: Aide | null = r.aide ?? (e.etape === 'rappel' && this.connus.has(e.id) ? 'connu' : null);
    const note = e.etape === 'reprise' || this.notees.has(e.fiche) ? null : noteEtape(e.mode, { correct: r.correct, aide });
    if (note !== null) this.notees.add(e.fiche);
    const evt = evenementReponse(this.ctx, e.fiche, e.mode, { ...r, aide }, note);
    this.repondues++;
    this.b.reponses++;
    // Bilan : le premier passage seul.
    if (e.etape === 'qcm') {
      this.b.qcm.n++;
      if (r.correct) this.b.qcm.justes++;
    } else if (e.passage === 1) {
      if (e.etape === 'rappel') this.b.nouveaux.push(e.id);
      else {
        this.b.revisions.n++;
        if (evt.correct && evt.aide !== 'voir' && evt.aide !== 'passer') this.b.revisions.premiers++;
      }
      if (note === 1) this.b.rates.push({ fiche: e.fiche, id: e.id, distance_km: evt.distance_km ?? null });
    }
    // Un raté repasse : en fin de QCM (avant le rappel), ou en fin de séance.
    const rate = !r.correct || r.aide === 'voir' || r.aide === 'passer';
    this.apresVoir = r.aide === 'voir';
    if (rate && e.etape === 'qcm' && e.passage < PASSAGES_QCM) {
      const apres = this.file.reduce((k, x, i) => (x.etape === 'qcm' ? i + 1 : k), 0);
      this.file.splice(apres, 0, { ...e, passage: e.passage + 1, cadrage: null });
    } else if (rate && e.etape !== 'qcm' && e.passage < PASSAGES_REPRISE) {
      this.file.push({ ...e, etape: 'reprise', passage: e.passage + 1, cadrage: null });
    }
    this.avancer();
    return evt;
  }

  /** « Terminer » : la séance s'arrête là ; les réponses données comptent (décision « Fin d'une partie du Chrono »). */
  terminer(): void {
    this.file = [];
    this.courante_ = null;
  }

  bilan(): BilanSeance {
    return structuredClone(this.b);
  }
}
