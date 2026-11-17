// La fiche d'un lieu (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 4.2 à § 4.5 et § 4.11 ; lot F1 : ce que le dépôt sait déjà). Un morceau à
// part (import() dynamique, § 6.1) : le morceau principal ne porte que la barre
// et le chargeur (explorer.ts, src/fiches/donnees.ts) ; celui-ci se charge au
// premier toucher d'un lieu qui a une fiche.
//
// Deux états : la barre, ou la feuille ouverte (pas de mi-hauteur). La feuille
// est posée dans #app, au-dessus de la carte et de la barre, opaque (--panel,
// sans flou : un flou se recalculerait dès que la carte change dessous) ; un
// voile transparent couvre la carte autour d'elle, et un toucher dessus la
// ferme sans rien toucher d'autre (sans lui, un pincement au bord zoomerait
// sous la fiche). Ni la barre, ni le voile, ni la feuille ne sont dans l'hôte
// de la carte : leurs événements ne l'atteignent pas.
//
// Contenu, de haut en bas : la tête (« ‹ » s'il y a une fiche d'avant, « × »,
// le drapeau, le nom, le statut), les faits (lot F2 pour un pays, dans l'ordre
// du § 4.2 : capitale, habitants, superficie, langues, monnaie, gentilé, heure,
// continent, point culminant, fête), les voisins (des boutons), les lignes de
// la mémoire, puis le lien Wikipédia et les sources de ce que la fiche montre.
// Une ligne sans donnée n'existe pas ; celles dont la table attend la relecture
// restent tues (src/fiches/relues.ts). L'heure se refait toutes les 30 s tant
// que la fiche est ouverte, par le formateur gardé de sa zone (créé au repos,
// au toucher du pays : explorer.ts). Les photos et « Apprendre ce lieu »
// viennent aux lots suivants.
import type { DonneesCapitales } from '../map/capitales';
import type { DonneesDrapeaux } from '../map/drapeaux';
import type { NomTerrain, Pays } from '../map/types';
import type { DonneesFichesMonde, SourceLigne } from '../fiches/donnees';
import { fmtAltitude, fmtHabitants, fmtHeureLieu, fmtJourMois, fmtPart, fmtSuperficie, listeEt } from '../fiches/format';
export { prechaufferFormats, prechaufferZone } from '../fiches/format';
import { LIGNES_RELUES, type LigneRelue } from '../fiches/relues';
import { sorteDeLieu, type SorteLieu } from '../fiches/sorte';
import { creer, croix, LIBELLE_STATUT } from './commun';
import { remplir, textes } from './textes';

const T = textes.fiche;

/** Un voisin dans la fiche : un bouton qui ouvre sa fiche. */
export interface VoisinFiche {
  id: string;
  /** Le texte du bouton : « Espagne », « Gibraltar (territoire) ». */
  texte: string;
  nom: string;
}

/** Une ligne de faits ; `heure` : la ligne de l'heure, refaite toutes les 30 s (DELAI_HEURE_MS). */
export interface FaitFiche {
  libelle: string;
  valeur: string;
  heure?: { zone: string; fuseaux: number };
}

/** Ce que la fiche montre d'un lieu (composerFiche) : tout est déjà dit, rien n'y est calculé à l'affichage. */
export interface ModeleFiche {
  terrain: NomTerrain;
  id: string;
  sorte: SorteLieu;
  nom: string;
  /** « territoire », « statut contesté », « continent » ; '' pour un pays. */
  statut: string;
  /** Un pays : ses drapeaux (le montré d'abord) ; vide tant que le manifeste n'est pas lu, ou sans drapeau. */
  drapeaux: readonly string[];
  /** Un pays : le drapeau a sa place (4:3), même avant le manifeste. */
  avecDrapeau: boolean;
  /** Les lignes « libellé · valeur » (dt, dd), sans ligne vide. */
  faits: readonly FaitFiche[];
  /** Les pays jouables d'abord (alphabétique), puis les autres entités avec leur statut. */
  voisins: readonly VoisinFiche[];
  /** Une ligne par sujet ; null : pas de section (territoire, réglage coupé). */
  memoire: readonly string[] | null;
  /** L'adresse de l'article de Wikipédia, ou null. */
  wikipedia: string | null;
  /** Les sources de ce que la fiche montre (« Natural Earth », « Wikidata »…). */
  sources: readonly string[];
}

export interface DonneesComposition {
  /** Les entités du monde (pays.json). */
  entites: readonly Pays[];
  /** Le nom d'une entité (le rendu du sujet de la carte). */
  nom(id: string): string;
  fiches: DonneesFichesMonde;
  capitales: DonneesCapitales | null;
  drapeaux: DonneesDrapeaux | null;
  /** Les lignes de la mémoire du lieu (CarteMemoire.details) ; null : pas de section. */
  memoire(id: string, jouable: boolean): readonly string[] | null;
  /** Les lignes relues (absent : LIGNES_RELUES ; les tests passent les deux états). */
  relues?: Readonly<Record<LigneRelue, boolean>>;
  /** L'instant de l'heure (absent : maintenant). */
  maintenant?: Date;
}

/** L'heure d'une fiche ouverte se refait toutes les 30 s (§ 4.2). */
export const DELAI_HEURE_MS = 30_000;

/** L'adresse d'un article de la Wikipédia de la langue (textes.fiche.wikipedia_base), par son titre. */
export const adresseWikipedia = (titre: string): string => T.wikipedia_base + encodeURIComponent(titre.replace(/ /g, '_'));

/** Le statut que la fiche dit en tête : celui de la barre pour un territoire ou une zone ; « continent » pour l'Antarctique ; rien pour un pays. */
function statutFiche(sorte: SorteLieu, p: Pays): string {
  if (sorte === 'continent') return T.statut_continent;
  if (sorte === 'pays') return '';
  return LIBELLE_STATUT[p.statut];
}

/** Le nom d'une source de ligne écrite à la main hors de Wikidata. */
const sourceLigne = (s: SourceLigne): string => (s === 'fb' ? T.noms_sources.factbook : T.noms_sources.wikipedia);

/**
 * Ce que montre la fiche du lieu `id` du monde, ou null s'il n'en a pas
 * (absent des fiches, ou une mer : lot F4). Pur : les données sont passées.
 */
export function composerFiche(id: string, d: DonneesComposition): ModeleFiche | null {
  const p = d.entites.find((e) => e.id === id);
  const f = d.fiches.lieux.get(id);
  if (!p || !f) return null;
  const sorte = sorteDeLieu(id, 'monde', p.statut);
  if (!sorte || sorte === 'mer' || sorte === 'commune') return null;
  const faits: FaitFiche[] = [];
  const relues = d.relues ?? LIGNES_RELUES;
  const S = T.noms_sources;
  const sources = [S.natural_earth, S.cldr];
  const citer = (nom: string) => void (sources.includes(nom) || sources.push(nom));
  const caps = sorte === 'pays' ? d.capitales?.parPays.get(id) : undefined;
  if (caps) {
    faits.push({ libelle: caps.justes.length > 1 ? T.capitales : T.capitale, valeur: listeEt(caps.justes.map((c) => c.nom)) });
    citer(S.wikidata);
  }
  if (f.habitants) {
    faits.push({ libelle: T.habitants, valeur: fmtHabitants(f.habitants.n, f.habitants.annee) });
    citer(f.habitants.source === 'wd' ? S.wikidata : S.banque_mondiale);
  }
  if (f.superficie !== undefined && relues.superficie) {
    faits.push({ libelle: T.superficie, valeur: fmtSuperficie(f.superficie) });
    citer(S.superficie);
  }
  if (f.langues && relues.langues) {
    // Les officielles d'abord, puis les langues du pays parlées par 10 % ou plus, avec leur part (D56 c).
    const { officielles, parlees } = f.langues;
    const valeur = [...(officielles.length ? [listeEt(officielles)] : []), ...parlees.map((l) => fmtPart(l.nom, l.part))].join(' · ');
    if (valeur) faits.push({ libelle: officielles.length + parlees.length > 1 ? T.langues : T.langue, valeur });
  }
  if (f.monnaies?.length) faits.push({ libelle: f.monnaies.length > 1 ? T.monnaies : T.monnaie, valeur: listeEt(f.monnaies) });
  if (f.gentils && relues.gentile) {
    faits.push({ libelle: T.gentile, valeur: remplir(T.gentile_valeur, { gentils: f.gentils }) });
    citer(S.wikidata);
    if (f.gentilsSource) citer(sourceLigne(f.gentilsSource));
  }
  if (f.heure) {
    // Une zone que le navigateur ne connaît pas (RangeError) : pas de ligne (§ 4.2).
    try {
      const valeur = fmtHeureLieu(f.heure.zone, f.heure.fuseaux, d.maintenant ?? new Date());
      const capitale = caps?.principale.nom;
      // « Heure au Caire » : la forme toute faite des données (aucune grammaire ici).
      const libelle = !capitale ? T.heure_locale : f.aCapitale ? remplir(T.heure_forme, { a_capitale: f.aCapitale }) : remplir(T.heure, { capitale });
      faits.push({ libelle, valeur, heure: f.heure });
      citer(S.tz);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
    }
  }
  const continent = (textes.continents as Record<string, string>)[p.continent];
  const sousRegion = d.fiches.sousRegions[p.sous_region];
  if (continent && sousRegion && continent !== sousRegion) faits.push({ libelle: T.continent, valeur: remplir(T.continent_valeur, { continent, sous_region: sousRegion }) });
  else if (continent ?? sousRegion) faits.push({ libelle: T.continent, valeur: (continent ?? sousRegion)! });
  if (f.culminant && relues.culminant) {
    faits.push({ libelle: T.culminant, valeur: remplir(T.culminant_valeur, { nom: f.culminant.nom, altitude: fmtAltitude(f.culminant.altitude) }) });
    citer(S.wikidata);
    if (f.culminant.source) citer(sourceLigne(f.culminant.source));
  }
  if (f.fete && relues.fete) {
    faits.push({ libelle: T.fete, valeur: remplir(T.fete_valeur, { date: fmtJourMois(f.fete.jour, f.fete.mois), nom: f.fete.nom }) });
    citer(S.factbook);
  }
  const avecDrapeau = sorte === 'pays';
  const drapeaux = avecDrapeau ? (d.drapeaux?.parPays.get(id)?.justes ?? []) : [];
  if (avecDrapeau) citer(S.flag_icons);
  if (f.wp) citer(S.wikidata);
  // Les voisins : les pays jouables d'abord, par ordre alphabétique, puis à part les autres entités, avec leur statut (§ 2.1).
  const parNom = (a: VoisinFiche, b: VoisinFiche) => a.nom.localeCompare(b.nom, 'fr');
  const voisins = p.voisins.flatMap((v) => {
    const e = d.entites.find((x) => x.id === v);
    if (!e) return [];
    const nom = d.nom(v);
    const statut = e.statut === 'jouable' ? '' : LIBELLE_STATUT[e.statut];
    return [{ id: v, nom, texte: statut ? remplir(T.voisin_statut, { nom, statut }) : nom, jouable: e.statut === 'jouable' }];
  });
  return {
    terrain: 'monde',
    id,
    sorte,
    nom: d.nom(id),
    statut: statutFiche(sorte, p),
    drapeaux,
    avecDrapeau,
    faits,
    voisins: [...voisins.filter((v) => v.jouable).sort(parNom), ...voisins.filter((v) => !v.jouable).sort(parNom)].map(({ id: i, nom, texte }) => ({ id: i, nom, texte })),
    memoire: d.memoire(id, p.statut === 'jouable'),
    wikipedia: f.wp ? adresseWikipedia(f.wp) : null,
    sources,
  };
}

/** Ce que la feuille demande à la carte : chaque geste passe par l'historique (§ 4.4). */
export interface ActionsFiche {
  /** « × », le glissé vers le bas : toutes les fiches fermées, la carte rendue (nav.quitterFiches). */
  fermer(): void;
  /**
   * Un toucher sur le voile : comme fermer(), sauf la popup ⚙ ouverte, que ce
   * toucher ne fait que refermer (son écouteur, main.ts ; § 4.2 : elle
   * s'ouvre par-dessus la fiche sans la fermer).
   */
  voile(): void;
  /** « ‹ » : un pas en arrière (history.back()). */
  avant(): void;
  /** Un voisin touché : sa fiche, une entrée de plus (nav.pousserFiche). */
  voisin(id: string): void;
}

export interface Feuille {
  /** Montre ce modèle (remplace la fiche affichée) ; `avant` : « ‹ » montré ; `focus` : le titre reçoit le focus. */
  montrer(m: ModeleFiche, o: { avant: boolean; focus: boolean }): void;
  /** Le drapeau arrivé après coup (le manifeste lu) : la tête seule est refaite. */
  drapeaux(adresses: readonly string[]): void;
  fermer(): void;
  readonly element: HTMLElement;
  readonly voile: HTMLElement;
}

/** Seuil du glissé vers le bas qui ferme, commencé sur la tête (§ 4.3). */
export const GLISSE_FERMER_PX = 60;

/**
 * La feuille et son voile, posés dans `zone` (#app), cachés. Un seul
 * exemplaire par page : la carte le garde.
 */
export function creerFeuille(zone: HTMLElement, actions: ActionsFiche): Feuille {
  const voile = creer('div', { class: 'fiche-voile', id: 'fiche-voile', 'aria-hidden': 'true' });
  voile.hidden = true;
  voile.addEventListener('click', () => actions.voile());
  const feuille = creer('section', { class: 'fiche', id: 'fiche-lieu', role: 'dialog', 'aria-labelledby': 'fiche-titre' });
  feuille.hidden = true;
  zone.append(voile, feuille);
  // will-change: transform le temps de la montée seulement (§ 6.4) : la feuille composée à part pendant
  // l'animation (carte.css : fiche-monte), sans garder un calque pour elle une fois ouverte.
  const finMontee = () => void (feuille.style.willChange = '');
  feuille.addEventListener('animationend', finMontee);
  feuille.addEventListener('animationcancel', finMontee);

  let modele: ModeleFiche | null = null;
  let avecAvant = false;
  /** Les lignes de l'heure de la fiche montrée, et leur minuteur (arrêté à la fermeture, ou par la fiche suivante). */
  let heures: { ligne: HTMLElement; dd: HTMLElement; heure: NonNullable<FaitFiche['heure']> }[] = [];
  let minuteur: ReturnType<typeof setInterval> | null = null;
  function arreterHeure(): void {
    if (minuteur !== null) clearInterval(minuteur);
    minuteur = null;
    heures = [];
  }
  /** L'heure refaite (le formateur de la zone gardé : rien de créé ici) ; une zone qui lève : sa ligne retirée. */
  function refaireHeure(): void {
    const t = new Date();
    heures = heures.filter((h) => {
      try {
        h.dd.textContent = fmtHeureLieu(h.heure.zone, h.heure.fuseaux, t);
        return true;
      } catch {
        h.ligne.remove();
        return false;
      }
    });
    if (!heures.length) arreterHeure();
  }
  const drapeauxEl = creer('div', { class: 'fiche-drapeaux' });

  /** Les drapeaux de la tête : la place grise (4:3) tant qu'ils ne sont pas là. */
  function poserDrapeaux(m: ModeleFiche): void {
    drapeauxEl.hidden = !m.avecDrapeau;
    drapeauxEl.replaceChildren(
      ...(m.drapeaux.length
        ? m.drapeaux.map((src) => {
            const img = creer('img', { class: 'drapeau', src, alt: remplir(T.drapeau, { nom: m.nom }), draggable: 'false' });
            img.addEventListener('load', () => img.classList.add('charge'));
            return img;
          })
        : [creer('span', { class: 'drapeau', 'aria-hidden': 'true' })]),
    );
  }

  function tete(m: ModeleFiche): HTMLElement {
    const avant = creer('button', { type: 'button', class: 'fiche-avant', 'aria-label': T.avant, title: T.avant }, '‹');
    avant.hidden = !avecAvant;
    avant.addEventListener('click', () => actions.avant());
    const titre = creer('h2', { class: 'fiche-titre', id: 'fiche-titre', tabindex: '-1' }, m.nom);
    poserDrapeaux(m);
    const statut = m.statut ? [creer('p', { class: 'fiche-statut' }, m.statut)] : [];
    const t = creer('header', { class: 'fiche-tete' }, croix(() => actions.fermer()), avant, drapeauxEl, titre, ...statut);
    // Glissé vers le bas de 60 px ou plus, commencé sur la tête : la fiche se ferme (la feuille ne suit pas le doigt).
    let depart: number | null = null;
    t.addEventListener('pointerdown', (e) => {
      depart = (e as PointerEvent).clientY;
    });
    t.addEventListener('pointerup', (e) => {
      if (depart !== null && (e as PointerEvent).clientY - depart >= GLISSE_FERMER_PX) actions.fermer();
      depart = null;
    });
    t.addEventListener('pointercancel', () => {
      depart = null;
    });
    return t;
  }

  function rendre(m: ModeleFiche): HTMLElement {
    const enfants: HTMLElement[] = [tete(m)];
    if (m.faits.length) {
      const lignes = m.faits.map((f) => {
        const dd = creer('dd', {}, f.valeur);
        const ligne = creer('div', { class: 'fiche-fait' }, creer('dt', {}, f.libelle), dd);
        if (f.heure) heures.push({ ligne, dd, heure: f.heure });
        return ligne;
      });
      enfants.push(creer('dl', { class: 'fiche-faits' }, ...lignes));
    }
    if (m.voisins.length) {
      const liste = creer(
        'ul',
        { class: 'fiche-voisins-liste' },
        ...m.voisins.map((v) => {
          const b = creer('button', { type: 'button', class: 'secondary fiche-voisin', 'data-id': v.id, title: remplir(T.voisin_titre, { nom: v.nom }) }, v.texte);
          b.addEventListener('click', () => actions.voisin(v.id));
          return creer('li', {}, b);
        }),
      );
      enfants.push(creer('section', { class: 'fiche-section fiche-voisins', 'aria-labelledby': 'fiche-voisins-titre' }, creer('h3', { id: 'fiche-voisins-titre' }, T.voisins), liste));
    }
    if (m.memoire?.length) {
      enfants.push(
        creer(
          'section',
          { class: 'fiche-section fiche-memoire', 'aria-labelledby': 'fiche-memoire-titre' },
          creer('h3', { id: 'fiche-memoire-titre' }, T.memoire),
          creer('ul', {}, ...m.memoire.map((l) => creer('li', {}, l))),
        ),
      );
    }
    const pied: (HTMLElement | string)[] = [];
    if (m.wikipedia) pied.push(creer('p', {}, creer('a', { class: 'fiche-wikipedia', href: m.wikipedia, target: '_blank', rel: 'noopener' }, T.wikipedia)));
    pied.push(creer('p', { class: 'fiche-sources' }, remplir(T.sources, { sources: m.sources.join(' · ') }), ' · ', creer('a', { href: '#credits', class: 'fiche-credits' }, T.credits)));
    enfants.push(creer('footer', { class: 'fiche-pied' }, ...pied));
    return creer('div', { class: 'fiche-contenu' }, ...enfants);
  }

  /** Ce qui prend le focus dans la fiche, dans un ordre fixe (le même pour la même fiche refaite). */
  function focusables(): HTMLElement[] {
    return ['button', 'a', '[tabindex]'].flatMap((sel) => [...feuille.querySelectorAll<HTMLElement>(sel)]);
  }

  return {
    element: feuille,
    voile,
    montrer(m, o) {
      // La même fiche refaite (rafraichir : la mémoire relue) : le focus et le défilement gardés, sinon le focus
      // tomberait sur body en pleine lecture au clavier. L'élément retrouvé à la même place dans la fiche nouvelle.
      // Aucune lecture ni écriture de la mise en page après replaceChildren (§ 6.4) : elle forçait la mise en page de
      // toute la fiche nouvelle dans la même tâche (12 ms sur l'A37, un gel de 50 ms à l'ouverture, S41, 16/11).
      const ouverture = feuille.hidden;
      const meme = !o.focus && feuille.dataset.id === m.id && !ouverture;
      const actif = document.activeElement as HTMLElement | null;
      const rangFocus = meme && actif && actif !== feuille && feuille.contains(actif) ? focusables().indexOf(actif) : -1;
      const defile = meme ? feuille.scrollTop : 0;
      // En haut de la fiche nouvelle (un voisin remplace la fiche défilée) : remise à zéro avant le remplacement,
      // tant que la mise en page est à jour. Une feuille cachée n'a rien à remettre : fermer() l'a remise en haut.
      if (o.focus && !ouverture && feuille.scrollTop) feuille.scrollTop = 0;
      // Une ouverture (la feuille était cachée) : l'animation de carte.css part, sauf mouvement réduit.
      if (ouverture && globalThis.matchMedia?.('(prefers-reduced-motion: no-preference)').matches) feuille.style.willChange = 'transform';
      modele = m;
      avecAvant = o.avant;
      feuille.dataset.id = m.id;
      feuille.dataset.sorte = m.sorte;
      arreterHeure();
      feuille.replaceChildren(rendre(m));
      if (heures.length) minuteur = setInterval(refaireHeure, DELAI_HEURE_MS);
      voile.hidden = false;
      feuille.hidden = false;
      if (o.focus) {
        // Le focus au titre : le lecteur d'écran dit son nom. Le titre est en haut, rien à faire défiler.
        feuille.querySelector<HTMLElement>('#fiche-titre')?.focus({ preventScroll: true });
      } else if (meme) {
        feuille.scrollTop = defile;
        if (rangFocus >= 0) focusables()[rangFocus]?.focus();
      }
    },
    drapeaux(adresses) {
      if (!modele) return;
      modele = { ...modele, drapeaux: adresses };
      poserDrapeaux(modele);
    },
    fermer() {
      finMontee();
      arreterHeure();
      modele = null;
      // Remise en haut avant d'être cachée : Chromium garde le défilement d'un élément caché et le rend quand il
      // réapparaît ; montrer() n'y touche plus à l'ouverture (aucune mise en page forcée, § 6.4).
      if (feuille.scrollTop) feuille.scrollTop = 0;
      feuille.hidden = true;
      voile.hidden = true;
      feuille.replaceChildren();
      delete feuille.dataset.id;
    },
  };
}
