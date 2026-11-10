// Recherche de l'en-tête (décision « En-tête ») : un champ et la liste des lieux
// trouvés sous lui, au clavier comme au doigt : les zones nommées du monde
// (pays, territoires, zones au statut contesté) et les communes de La Réunion.
// Choisir un lieu le montre sur la carte (vue Carte, explorer.ts). Les noms des
// communes (620 octets) ne sont demandés qu'au premier usage du champ : rien de
// /geo/reunion/ au premier affichage (décision « Hébergement »). Les capitales
// (étude J2 § 7.3) : une ligne par capitale juste, avec ses alias (Kyiv,
// Beijing), chargées à la première frappe ; choisie, une capitale montre son
// pays et un anneau au point de la ville (D53 c). Les villes viendront au J4.
import { chargerCapitales, type DonneesCapitales } from '../map/capitales';
import type { DonneesCarte } from '../map/donnees';
import { REUNION } from '../map/terrain';
import type { NomTerrain } from '../map/types';
import { chercherLieux } from '../texte';
import { creer, LIBELLE_STATUT } from './commun';
import { remplir, textes } from './textes';

export interface LieuTrouve {
  terrain: NomTerrain;
  id: string;
  nom: string;
  /** Ce qui l'accompagne dans la liste : statut (territoire…), continent, « commune de La Réunion », « capitale (Bolivie) ». */
  detail: string;
  /** Autres graphies cherchées comme le nom (une capitale : Kyiv pour Kiev). */
  alias?: readonly string[];
  /** Un point à marquer d'un anneau, en plus de la zone `id` (une capitale : la ville, dans son pays). */
  point?: [number, number];
}

const T = textes.recherche;
const nomContinent = (c: string) => (textes.continents as Record<string, string>)[c] ?? c;

/** Les lieux du monde : toute zone nommée de la carte, avec son statut (territoire…) ou à défaut son continent. */
export function lieuxMonde(d: DonneesCarte): LieuTrouve[] {
  return d.entites.flatMap(({ pays: p }) => {
    const nom = d.noms[p.id];
    return nom ? [{ terrain: 'monde' as const, id: p.id, nom, detail: LIBELLE_STATUT[p.statut] || nomContinent(p.continent) }] : [];
  });
}

/** Les communes de l'île, d'après ses noms (noms.fr.json : code INSEE → nom). */
export function lieuxReunion(noms: Record<string, string>): LieuTrouve[] {
  return Object.entries(noms).map(([id, nom]) => ({ terrain: 'reunion' as const, id, nom, detail: T.commune }));
}

/**
 * Les capitales : une ligne par capitale juste (210, Jérusalem et
 * Jérusalem-Est à part), la zone montrée étant son pays ; detail « capitale
 * (Bolivie) », « siège du gouvernement (Bolivie) », « capitale économique
 * (Burundi) » (les noms des pays n'ont pas d'article : textes.capitales).
 */
export function lieuxCapitales(c: DonneesCapitales, nomsPays: Readonly<Record<string, string>>): LieuTrouve[] {
  const C = textes.capitales;
  return [...c.parPays.values()].flatMap((p) => {
    const pays = nomsPays[p.pays];
    if (!pays) return [];
    return p.justes.map((x) => ({
      terrain: 'monde' as const,
      id: p.pays,
      nom: x.nom,
      detail: remplir(C.recherche, { role: C.roles[x.role], pays }),
      alias: x.alias,
      point: x.point,
    }));
  });
}

/**
 * Branche le champ de l'en-tête (index.html : #recherche-champ dans .recherche) :
 * la liste se remplit à chaque frappe ; flèches, Entrée et Échap au clavier ;
 * un lieu choisi vide le champ et le quitte (le clavier du téléphone se
 * referme sur la carte), puis `choisir` le montre.
 */
export function brancherRecherche(o: {
  champ: HTMLInputElement;
  monde: DonneesCarte;
  choisir: (l: LieuTrouve) => void;
  /** Les capitales (tests : un chargeur) ; src/map/capitales.ts par défaut. */
  capitales?: () => Promise<DonneesCapitales>;
}): void {
  const { champ } = o;
  const boite = champ.closest('.recherche') ?? champ.parentElement!;
  const liste = creer('ul', { class: 'recherche-liste', id: 'recherche-liste', role: 'listbox', 'aria-label': champ.getAttribute('aria-label') ?? '' });
  liste.hidden = true;
  boite.append(liste);
  champ.setAttribute('role', 'combobox');
  champ.setAttribute('aria-autocomplete', 'list');
  champ.setAttribute('aria-controls', liste.id);
  champ.setAttribute('aria-expanded', 'false');

  // Libellé court sur le téléphone : la place du champ y est d'environ 170 px
  // à 384 px ; plus court encore à 360 px et moins (#19), où le champ n'a plus
  // que ~140 px, Jouer réduit à ▶ compris (style.css).
  const etroit = window.matchMedia?.('(max-width: 700px)');
  const tresEtroit = window.matchMedia?.('(max-width: 360px)');
  const placeholder = () =>
    (champ.placeholder = tresEtroit?.matches ? T.placeholder_tres_court : etroit?.matches ? T.placeholder_court : T.placeholder);
  placeholder();
  etroit?.addEventListener?.('change', placeholder);
  tresEtroit?.addEventListener?.('change', placeholder);

  let lieux = lieuxMonde(o.monde);
  let communes: Promise<void> | null = null;
  /** Les communes, au premier usage : un échec (hors ligne) se retente au suivant. */
  function chargerCommunes(): void {
    if (communes) return;
    communes = fetch(`${REUNION.dossier}noms.fr.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((noms) => {
        lieux = [...lieux, ...lieuxReunion(noms)];
        if (!liste.hidden) afficher();
      })
      .catch(() => {
        communes = null;
      });
  }

  let capitales: Promise<void> | null = null;
  /** Les capitales, à la première frappe : un échec (hors ligne) se retente à la suivante. */
  function chargerLesCapitales(): void {
    if (capitales) return;
    capitales = (o.capitales ?? (() => chargerCapitales()))()
      .then((c) => {
        lieux = [...lieux, ...lieuxCapitales(c, o.monde.noms)];
        if (!liste.hidden) afficher();
      })
      .catch(() => {
        capitales = null;
      });
  }

  let trouves: LieuTrouve[] = [];
  let actif = -1;

  function fermer(): void {
    trouves = [];
    liste.hidden = true;
    champ.setAttribute('aria-expanded', 'false');
    champ.removeAttribute('aria-activedescendant');
    actif = -1;
  }

  function marquerActif(): void {
    const options = liste.querySelectorAll<HTMLElement>('[role="option"]');
    options.forEach((li, i) => li.setAttribute('aria-selected', String(i === actif)));
    const a = options[actif];
    if (a) {
      champ.setAttribute('aria-activedescendant', a.id);
      a.scrollIntoView?.({ block: 'nearest' });
    } else champ.removeAttribute('aria-activedescendant');
  }

  function afficher(): void {
    const tape = champ.value;
    if (!tape.trim()) return fermer();
    trouves = chercherLieux(tape, lieux);
    actif = trouves.length ? 0 : -1;
    liste.replaceChildren(
      ...(trouves.length
        ? trouves.map((l, i) =>
            creer(
              'li',
              // data-i : la ligne (une capitale et son pays ont le même id de zone).
              { role: 'option', id: `recherche-option-${i}`, class: 'recherche-option', 'data-terrain': l.terrain, 'data-id': l.id, 'data-i': String(i) },
              creer('span', { class: 'recherche-nom' }, l.nom),
              creer('span', { class: 'recherche-detail' }, l.detail),
            ),
          )
        : [creer('li', { class: 'recherche-vide', role: 'presentation' }, T.aucun)]),
    );
    liste.hidden = false;
    champ.setAttribute('aria-expanded', 'true');
    marquerActif();
  }

  function choisir(l: LieuTrouve | undefined): void {
    if (!l) return;
    champ.value = '';
    fermer();
    champ.blur();
    o.choisir(l);
  }

  champ.addEventListener('focus', () => {
    chargerCommunes();
    if (champ.value.trim()) afficher();
  });
  champ.addEventListener('input', () => {
    chargerCommunes();
    chargerLesCapitales();
    afficher();
  });
  champ.addEventListener('blur', fermer);
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (liste.hidden) return afficher();
      if (!trouves.length) return;
      e.preventDefault();
      actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + trouves.length) % trouves.length;
      marquerActif();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (liste.hidden) afficher();
      choisir(trouves[Math.max(actif, 0)]);
    } else if (e.key === 'Escape') {
      if (!liste.hidden) fermer();
      else {
        champ.value = '';
        champ.blur();
      }
    }
  });
  // Le champ garde le focus pendant le toucher d'une ligne (sinon son blur
  // fermerait la liste avant le clic).
  liste.addEventListener('pointerdown', (e) => e.preventDefault());
  liste.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('[role="option"]');
    if (li) choisir(trouves[Number(li.dataset.i)]);
  });
}
