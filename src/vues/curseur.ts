// Les ordres de grandeur du J4 (étude docs/etudes/2026-11-25-j4-conception.md, § 5, lot 3 ; D613 à D617), la vue :
// le curseur de Trouver (sens localiser) et le rendu des deux sujets, Habitants et Superficies, dans un morceau
// chargé à la demande (chargerCurseur de commun.ts) avec la partie pure (src/exercices/grandeurs.ts), les chiffres
// (fiches-monde.json, chargerGrandeurs) et ses textes (textes-grandeurs.fr.json) : rien au premier affichage
// (décision « Morceau JS principal sous 500 Ko »).
//
// Le curseur (§ 5.2, D614 a) : « Combien d'habitants : Nigeria », le pays allumé (cerné s'il est petit), la carte qui
// vole jusqu'à lui ; un <input type="range"> natif sur l'échelle logarithmique de la plage fixe du sujet, au départ au
// milieu (450 000 habitants, 1 400 km²), sa valeur à 2 chiffres significatifs en mots (« 230 millions d'habitants »),
// la même dans son aria-valuetext ; − et + (44 px) et les flèches du clavier à ×1,1 ; Entrée ou « Valider ». C'est
// le seul exercice du J4 qui se joue en entier au clavier (§ 5.5) : une fois une touche pressée sur le curseur, la
// question suivante lui rend le focus. La rétroaction (§ 5.2) : « Nigeria : 238 millions d'habitants (Banque
// mondiale, 2025) ; ta réponse : 150 millions d'habitants, 1,6 fois trop peu : faux » ; pour un pays touché par une
// zone contestée (D616 a), les deux valeurs citées, le rapport dit à la plus proche (« 1,1 fois trop pour le tracé »).
// La valeur notée, et écrite au journal (`estime`, D617 a), est celle qu'affiche le curseur.
//
// Reconnaître et le QCM (§ 5.3, D615 a ; la Révision du jour aussi, D623 a) : « Lequel compte environ » puis
// « 240 millions d'habitants ? » dans la barre (RenduSujet.question : aucune zone allumée, elle donnerait la
// réponse), quatre noms de pays, les leurres du même continent à ×3 au moins (leurres de grandeurs.ts).
//
// Ce morceau n'importe rien du morceau principal, sinon des types : ce qu'il en emploie lui est donné à
// l'installation (Outils), comme celui des voisins (un import de valeur faisait sortir des modules partagés dans un
// morceau préchargé).
import { depart, enMots, formater, leurres, noter, pas, PLAGES, position, valeur, valeurCurseur, type Grandeur, type Grandeurs, type Notation, type SujetGrandeur } from '../exercices/grandeurs';
import type { Terrain } from '../terrains';
import type { estPetite } from './commun';
import type { formePays } from './formes';
import type { Enonce, Fabrique, nomDe, RenduSujet } from './sujets';
import type { remplir } from './textes';
import { textesGrandeurs } from './textes-grandeurs';

/** Ce que le morceau principal lui donne (commun.ts chargerCurseur, sujets.ts poserCurseur). */
export interface Outils {
  nomDe: typeof nomDe;
  formePays: typeof formePays;
  remplir: typeof remplir;
  estPetite: typeof estPetite;
  /** Les chiffres des pays jouables (chargerGrandeurs de fiches/chargeur.ts). */
  grandeurs: Grandeurs;
}

/** Une réponse au curseur, validée. */
export interface ReponseCurseur {
  juste: boolean;
  /** La valeur répondue, telle qu'affichée (2 chiffres) : `estime` au journal. */
  estime: number;
  /** La rétroaction (région aria-live de la vue). */
  texte: string;
  /** Le détail du bilan : « 150 millions d'habitants, 1,6 fois trop peu ». */
  detail: string;
}

/** Une question « Combien d'habitants : Nigeria » sur la carte d'un terrain. */
export interface QuestionCurseur {
  readonly id: string;
  readonly sujet: SujetGrandeur;
  /** Le curseur, ses boutons et sa valeur : la vue le met dans sa barre. */
  readonly el: HTMLElement;
  /** La valeur affichée (2 chiffres). */
  readonly valeur: number;
  /** Validée, ou arrêtée (temps écoulé, « Passer ») : le curseur ne bouge plus. */
  readonly finie: boolean;
  enonce(): Enonce;
  /** La question posée : le pays allumé (cerné s'il est petit), la carte qui vole jusqu'à lui (hVisible : au-dessus de la barre). */
  poser(hVisible: number): void;
  /** Les marques remises telles quelles (retour dans la vue, que les autres vues ont effacées). */
  remarquer(): void;
  /** La valeur du curseur réglée à `v` (arrondie, dans la plage), comme un glissé. */
  regler(v: number): void;
  /** « Valider » : la note (null si déjà finie) ; `surValider` la reçoit aussi. */
  valider(): ReponseCurseur | null;
  /** Temps écoulé (`temps`), « Passer » : la question finie sans réponse ; le texte de la rétroaction (la valeur vraie). */
  arreter(temps?: boolean): string;
}

/** Ce que le morceau apporte au reste de l'appli. */
export interface ModuleCurseur {
  /** Le rendu d'un des deux sujets (sujets.ts, FABRIQUES). */
  fabrique(s: SujetGrandeur): Fabrique;
  /** La question de ce pays ; `r` : le rendu du sujet (son énoncé) ; `surValider` : la réponse validée. */
  question(t: Pick<Terrain, 'carte' | 'donnees'>, id: string, s: SujetGrandeur, r: Pick<RenduSujet, 'enonce'>, surValider: (r: ReponseCurseur) => void): QuestionCurseur;
  readonly grandeurs: Grandeurs;
}

const T = textesGrandeurs;
/** L'étendue du <input type="range"> (step="any") : sa valeur est la position × ETENDUE (grandeurs.ts, position). */
export const ETENDUE = 1000;
/** Une touche pressée sur un curseur : la question suivante lui rend le focus (le clavier seul, § 5.5). */
let auClavier = false;

/** Un élément, ses attributs (class : className), ses enfants ; le morceau n'importe pas creer() de commun.ts. */
function el<K extends keyof HTMLElementTagNameMap>(nom: K, attrs: Record<string, string>, ...enfants: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(nom);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...enfants);
  return e;
}

export function installer(o: Outils): ModuleCurseur {
  const { nomDe, formePays, remplir } = o;
  const g = o.grandeurs;

  /** « 230 millions d'habitants », « 450 000 habitants », « 0,44 km² », « 17 millions de km² » ; `chiffres` : 3 pour une valeur vraie. */
  const unite = (s: SujetGrandeur, v: number, chiffres = 2) => remplir(enMots(v, chiffres) ? T.unites[s].mots : T.unites[s].chiffres, { v: formater(v, chiffres) });
  /** La source citée (D57) : la Banque mondiale et son année, Wikidata pour le Vatican et pour les superficies. */
  const source = (x: Grandeur, s: SujetGrandeur) => (s === 'superficies' ? T.sources.sup : remplir(T.sources[x.source], { annee: x.annee }));
  /** La valeur vraie dite : « Nigeria : 238 millions d'habitants (Banque mondiale, 2025) » ; avec le tracé de fait (D616 a) ; `lieu` : « Nigeria, … ». */
  const vraie = (x: Grandeur, s: SujetGrandeur, pays: string, lieu = false) => {
    const base = { pays, v: unite(s, valeur(x, s), 3), source: source(x, s) };
    if (s === 'superficies' && x.superficieTrace !== null)
      return remplir(lieu ? T.lieu_trace : T.vraie_trace, { ...base, trace: remplir(T.trace, { v: unite(s, x.superficieTrace, 3) }) });
    return remplir(lieu ? T.lieu : T.vraie, base);
  };
  /**
   * L'écart dit, à la valeur admise la plus proche : « 1,6 fois trop peu », « 1,1 fois trop pour le tracé » ; « pile,
   * à l'arrondi près » quand le rapport s'arrondit à 1 (240 millions pour 238 : « 1 fois trop » ne dirait rien).
   */
  const ecart = (n: Notation) => {
    const r = n.rapports.reduce((a, b) => (b.rapport.fois < a.rapport.fois ? b : a));
    const e = r.rapport.sens === 'egal' || r.rapport.fois === 1 ? T.ecart.egal : remplir(T.ecart[r.rapport.sens], { fois: formater(r.rapport.fois, 3) });
    return r.trace ? remplir(T.pour_trace, { ecart: e }) : e;
  };

  const fabrique =
    (s: SujetGrandeur): Fabrique =>
    (ts, d) => {
      const nom = (id: string) => nomDe(d, id);
      return {
        enonce: (id) => ({ invite: ts.enonce, objet: { texte: nom(id) } }),
        consigneQcm: () => ts.consigne_nommer,
        // La valeur de la question dans la barre (§ 5.3 : à 2 chiffres), à la place de la zone allumée, qui donnerait la réponse.
        question: (id) => {
          const x = g.get(id);
          return { texte: x ? remplir(T.qcm, { v: unite(s, valeur(x, s)) }) : '' };
        },
        choix: (id) => ({ texte: nom(id) }),
        nomChoix: nom,
        visuel: false,
        revelation: (id) => ({ texte: nom(id) }),
        nomBilan: nom,
        lieu: nom,
        lieuArticle: (id) => formePays(id, 'le') ?? nom(id),
        consigneNommee: () => null,
        touche: (id) => (id ? nom(id) : ts.la_mer),
        fauxSuite: (id) => remplir(ts.faux_suite, { cible: nom(id) }),
        expire: (id) => remplir(ts.expire, { cible: nom(id) }),
        // La rétroaction de Reconnaître dit le pays et sa valeur vraie (« Juste : Nigeria, 238 millions d'habitants (…) »).
        retro: (id) => {
          const x = g.get(id);
          return x ? vraie(x, s, nom(id), true) : nom(id);
        },
        point: () => null,
        points: () => [],
        imageEnonce: () => null,
        comparaison: () => null,
        qcmPosable: (id) => g.has(id),
        qcmExclus: () => new Set<string>(),
        qcmPareils: () => false,
        // D615 a : trois leurres du même continent, à ×3 de la cible et entre eux ; aucun choix douteux à ×1,5.
        qcmLeurres: (id) => [{ candidats: () => leurres(id, s, g, Math.random) ?? [], n: 3 }],
        admisEnPlus: () => null,
      };
    };

  function question(t: Pick<Terrain, 'carte' | 'donnees'>, id: string, s: SujetGrandeur, r: Pick<RenduSujet, 'enonce'>, surValider: (r: ReponseCurseur) => void): QuestionCurseur {
    const x = g.get(id);
    if (!x) throw new Error(`grandeurs : pas de chiffres pour ${id}`);
    const plage = PLAGES[s];
    const nom = nomDe(t.donnees, id);
    let v = depart(plage);
    let finie = false;
    let note: ReponseCurseur | null = null;

    // Un <span>, pas un <output> : son rôle status (région aria-live implicite) redirait la valeur à chaque cran,
    // déjà dite par l'aria-valuetext du curseur.
    const valeurEl = el('span', { class: 'curseur-valeur' });
    const range = el('input', {
      type: 'range',
      class: 'curseur-range',
      min: '0',
      max: String(ETENDUE),
      step: 'any',
      'aria-label': remplir(T.etiquettes[s], { de: formePays(id, 'de') ?? `de ${nom}` }),
    });
    const moins = el('button', { type: 'button', class: 'secondary curseur-pas curseur-moins', 'aria-label': T.moins }, '−');
    const plus = el('button', { type: 'button', class: 'secondary curseur-pas curseur-plus', 'aria-label': T.plus }, '+');
    const valider = el('button', { type: 'button', class: 'curseur-valider' }, T.valider);
    const bloc = el(
      'div',
      { class: 'curseur', 'data-sujet': s },
      el('div', { class: 'curseur-tete' }, valeurEl, valider),
      el('div', { class: 'curseur-ligne' }, moins, range, plus),
    );

    /** La valeur affichée partout : le texte, aria-valuetext, data-valeur (le pilote) ; `placer` : le curseur à sa position (pas pendant un glissé). */
    function afficher(placer: boolean): void {
      const texte = unite(s, v);
      if (placer) range.value = String(position(v, plage) * ETENDUE);
      range.setAttribute('aria-valuetext', texte);
      valeurEl.textContent = texte;
      bloc.dataset.valeur = String(v);
    }
    function bloquer(): void {
      finie = true;
      for (const b of [range, moins, plus, valider]) b.disabled = true;
    }
    const regler = (w: number) => {
      if (finie) return;
      v = valeurCurseur(position(w, plage), plage);
      afficher(true);
    };
    const pas1 = (sens: 1 | -1) => {
      if (finie) return;
      v = pas(v, sens, plage);
      afficher(true);
    };
    /** Les marques de la question : le pays allumé, puis juste ou faux une fois répondue. */
    function marquer(): void {
      t.carte.effacerMarques();
      const classe = note ? (note.juste ? 'juste' : 'faux') : 'choisi';
      t.carte.marquer(id, classe);
      if (o.estPetite(t, id)) t.carte.anneau(id, classe);
    }

    function noterValeur(): ReponseCurseur | null {
      if (finie) return null;
      bloquer();
      const n = noter(x!, s, v);
      const e = ecart(n);
      note = {
        juste: n.juste,
        estime: n.estime,
        texte: remplir(T.reponse, { vraie: vraie(x!, s, nom), v: unite(s, n.estime), ecart: e, verdict: n.juste ? T.juste : T.faux }),
        detail: remplir(T.bilan, { v: unite(s, n.estime), ecart: e }),
      };
      marquer();
      surValider(note);
      return note;
    }

    range.addEventListener('input', () => {
      if (finie) return;
      v = valeurCurseur(Number(range.value) / ETENDUE, plage);
      afficher(false);
    });
    range.addEventListener('keydown', (ev) => {
      const k = (ev as KeyboardEvent).key;
      auClavier = true;
      const sens = k === 'ArrowUp' || k === 'ArrowRight' ? 1 : k === 'ArrowDown' || k === 'ArrowLeft' ? -1 : 0;
      if (sens) {
        ev.preventDefault();
        pas1(sens);
      } else if (k === 'Enter') {
        ev.preventDefault();
        noterValeur();
      }
    });
    for (const b of [moins, plus, valider]) b.addEventListener('keydown', () => (auClavier = true));
    moins.addEventListener('click', () => pas1(-1));
    plus.addEventListener('click', () => pas1(1));
    valider.addEventListener('click', () => noterValeur());
    afficher(true);

    return {
      id,
      sujet: s,
      el: bloc,
      get valeur() {
        return v;
      },
      get finie() {
        return finie;
      },
      enonce: () => r.enonce(id),
      poser(hVisible) {
        marquer();
        t.carte.montrer(id, hVisible);
        if (auClavier) range.focus({ preventScroll: true });
      },
      remarquer: marquer,
      regler,
      valider: noterValeur,
      arreter(temps = false) {
        if (!finie) bloquer();
        return temps ? remplir(T.temps, { vraie: vraie(x, s, nom) }) : vraie(x, s, nom);
      },
    };
  }

  return { fabrique, question, grandeurs: g };
}
