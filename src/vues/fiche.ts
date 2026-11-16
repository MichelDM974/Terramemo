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
// le drapeau, le nom, le statut), les faits (capitales, continent et
// sous-région), les voisins (des boutons), les lignes de la mémoire, puis le
// lien Wikipédia et les sources. Une ligne sans donnée n'existe pas. Les
// chiffres (habitants, superficie…), les photos et « Apprendre ce lieu »
// viennent aux lots suivants.
import type { DonneesCapitales } from '../map/capitales';
import type { DonneesDrapeaux } from '../map/drapeaux';
import type { NomTerrain, Pays } from '../map/types';
import type { DonneesFichesMonde } from '../fiches/donnees';
import { listeEt } from '../fiches/format';
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
  faits: readonly { libelle: string; valeur: string }[];
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
}

/** L'adresse d'un article de la Wikipédia de la langue (textes.fiche.wikipedia_base), par son titre. */
export const adresseWikipedia = (titre: string): string => T.wikipedia_base + encodeURIComponent(titre.replace(/ /g, '_'));

/** Le statut que la fiche dit en tête : celui de la barre pour un territoire ou une zone ; « continent » pour l'Antarctique ; rien pour un pays. */
function statutFiche(sorte: SorteLieu, p: Pays): string {
  if (sorte === 'continent') return T.statut_continent;
  if (sorte === 'pays') return '';
  return LIBELLE_STATUT[p.statut];
}

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
  const faits: { libelle: string; valeur: string }[] = [];
  const sources = [T.noms_sources.natural_earth, T.noms_sources.cldr];
  const caps = sorte === 'pays' ? d.capitales?.parPays.get(id) : undefined;
  if (caps) {
    faits.push({ libelle: caps.justes.length > 1 ? T.capitales : T.capitale, valeur: listeEt(caps.justes.map((c) => c.nom)) });
    sources.push(T.noms_sources.wikidata);
  }
  const continent = (textes.continents as Record<string, string>)[p.continent];
  const sousRegion = d.fiches.sousRegions[p.sous_region];
  if (continent && sousRegion && continent !== sousRegion) faits.push({ libelle: T.continent, valeur: remplir(T.continent_valeur, { continent, sous_region: sousRegion }) });
  else if (continent ?? sousRegion) faits.push({ libelle: T.continent, valeur: (continent ?? sousRegion)! });
  const avecDrapeau = sorte === 'pays';
  const drapeaux = avecDrapeau ? (d.drapeaux?.parPays.get(id)?.justes ?? []) : [];
  if (avecDrapeau) sources.push(T.noms_sources.flag_icons);
  if (f.wp && !sources.includes(T.noms_sources.wikidata)) sources.push(T.noms_sources.wikidata);
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

  let modele: ModeleFiche | null = null;
  let avecAvant = false;
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
      enfants.push(creer('dl', { class: 'fiche-faits' }, ...m.faits.map((f) => creer('div', { class: 'fiche-fait' }, creer('dt', {}, f.libelle), creer('dd', {}, f.valeur)))));
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
      const meme = !o.focus && feuille.dataset.id === m.id && !feuille.hidden;
      const actif = document.activeElement as HTMLElement | null;
      const rangFocus = meme && actif && actif !== feuille && feuille.contains(actif) ? focusables().indexOf(actif) : -1;
      const defile = feuille.scrollTop;
      modele = m;
      avecAvant = o.avant;
      feuille.dataset.id = m.id;
      feuille.dataset.sorte = m.sorte;
      feuille.replaceChildren(rendre(m));
      voile.hidden = false;
      feuille.hidden = false;
      if (o.focus) {
        // En haut de la fiche nouvelle (un voisin remplace la fiche défilée), le focus au titre : le lecteur d'écran dit son nom.
        feuille.scrollTop = 0;
        feuille.querySelector<HTMLElement>('#fiche-titre')?.focus();
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
      modele = null;
      feuille.hidden = true;
      voile.hidden = true;
      feuille.replaceChildren();
      delete feuille.dataset.id;
    },
  };
}
