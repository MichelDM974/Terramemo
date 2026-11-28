// Les photos de la fiche d'un lieu (#34, lot P2 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.2, § 3.5, § 4.2, § 4.10 à
// § 4.12 et § 6.1) : un carrousel 3:2 sur toute la largeur, sous la tête, chaque
// photo avec son crédit dessous ; le plein écran au toucher, par-dessus la fiche.
// Dans le morceau de la fiche (import() dynamique), comme fiche.ts.
//
// Chargement une à une (les photos font le budget de transfert, § 6.3) : la liste
// du lieu (photos/l/<id>.json, ≈ 0,3 Ko) à l'ouverture de la fiche, la première
// vignette aussitôt, chaque suivante quand sa case entre à moitié dans le cadre
// (un IntersectionObserver sur le carrousel pose son src : loading="lazy" charge
// en avance, sur une grande distance), le plein écran au toucher seulement. Chaque
// image a sa place réservée (aspect-ratio 3 / 2, carte.css) : la fiche ne saute
// pas à l'arrivée d'une photo. Le carrousel et sa place ne sont posés que pour un lieu de l'index
// des lieux illustrés (LIEUX_ILLUSTRES, écrit par le build dans ce morceau) : une fiche sans photo
// ne lit pas de liste et ne saute pas d'une hauteur de carrousel à son arrivée. Une liste vide (un lieu sans photo, D60 a, ou pas encore
// relu), absente (404), ou hors ligne sans copie : le carrousel se retire. Une photo qui ne vient pas
// (hors ligne, retirée du site) : sa case se retire, la fiche montre les autres.
//
// Le défilement (décision « Photos de la fiche : carrousel et Crédits », 28/11/2026) : au doigt (glissé,
// accrochage), au clavier (les flèches du carrousel où le focus est), et sur PC aux flèches ‹ › posées sur
// la photo, montrées au survol d'une souris (carte.css) et toujours atteignables au clavier ; un compteur
// « 1 / 3 » sur la photo, partout, qui suit le défilement. Ni flèches ni compteur pour une seule photo ; la
// flèche de la première vers l'avant et celle de la dernière vers l'après se cachent.
//
// Le crédit, le même pour toutes, domaine public compris (§ 3.2) : « Photo
// recadrée : {auteur} · {licence} · Commons », la licence en lien vers son texte,
// « Commons » vers la page du fichier ; du texte, pas une infobulle (§ 4.11).
//
// Le plein écran est une entrée d'historique (§ 4.4, posée par navigation.ts) :
// un toucher, « × », Échap ou un retour le ferment par history.back(), la fiche
// reste. Ce module ne touche pas à l'historique : il le demande (ouvrir, fermer).
import { LIEUX_ILLUSTRES } from 'virtual:terramemo-photos-lieux';
import { creer, croix } from './commun';
import { remplir } from './textes';
import { textesFiche } from './textes-fiche';

const T = textesFiche.photos;

/** La langue des textes alternatifs (décision « Langue » : le français seul, pour l'instant). */
export const LANGUE_PHOTOS = 'fr';
/** Une photo servie : le début du SHA-256 de son fichier (geodata/photos/listes.mjs). */
const NOM = /^[0-9a-f]{10}$/;

/** Une photo de la liste d'un lieu (photos/l/<id>.json). */
export interface PhotoFiche {
  /** Le nom de la vignette (photos/v/<v>.webp) et celui du plein écran (photos/p/<p>.webp). */
  v: string;
  p: string;
  /** Le texte alternatif, par langue : le sujet de la photo (« château de Himeji »). */
  alt: Readonly<Record<string, string>>;
  /** null : domaine public sans auteur (« Auteur inconnu »). */
  auteur: string | null;
  licence: string;
  /** Le texte de la licence ; null pour le domaine public. */
  licence_url: string | null;
  /** La page du fichier sur Commons. */
  page: string;
}

export interface ListePhotos {
  v: number;
  photos: readonly PhotoFiche[];
}

/** Un observateur de visibilité (IntersectionObserver, ou un faux dans les tests). */
export interface ObservateurPhotos {
  observe(el: Element): void;
  unobserve(el: Element): void;
  disconnect(): void;
}

/** D'où viennent les photos : le site (sourcePhotosSite), ou des faux dans les tests. */
export interface SourcePhotos {
  /** La liste du lieu ; null s'il n'en a pas (404) ; rejetée si le réseau manque sans copie. */
  liste(id: string): Promise<ListePhotos | null>;
  /** L'adresse d'une vignette, d'un plein écran, par leur nom. */
  vignette(nom: string): string;
  plein(nom: string): string;
  /** Le lieu a-t-il des photos (l'index du build) ? false : ni carrousel, ni place réservée, ni liste lue ; absent : oui. */
  illustre?(id: string): boolean;
  /** Un observateur posé sur le carrousel : visible(el) quand une case y entre à moitié ; null : sans (tout se charge). */
  observer?(racine: HTMLElement, visible: (el: Element) => void): ObservateurPhotos | null;
}

const texte = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/** La liste lue d'un JSON, sans les photos mal formées (une liste périmée ou abîmée ne casse pas la fiche). */
export function lireListe(x: unknown): ListePhotos {
  const photos = Array.isArray((x as ListePhotos | null)?.photos) ? (x as ListePhotos).photos : [];
  return {
    v: 1,
    photos: photos.filter(
      (p) =>
        !!p &&
        NOM.test(String(p.v)) &&
        NOM.test(String(p.p)) &&
        texte(p.alt?.[LANGUE_PHOTOS]) &&
        texte(p.licence) &&
        String(p.page).startsWith('https://commons.wikimedia.org/') &&
        (p.licence_url === null || String(p.licence_url).startsWith('https://')),
    ),
  };
}

const illustres = new Set(LIEUX_ILLUSTRES);

/** Les photos du site : l'index des lieux illustrés, photos/l/<id>.json, photos/v/, photos/p/ ; l'observateur du navigateur. */
export const sourcePhotosSite: SourcePhotos = {
  illustre: (id) => illustres.has(id),
  async liste(id) {
    const r = await fetch(`/photos/l/${encodeURIComponent(id)}.json`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`photos de ${id} : HTTP ${r.status}`);
    return lireListe(await r.json());
  },
  vignette: (nom) => `/photos/v/${nom}.webp`,
  plein: (nom) => `/photos/p/${nom}.webp`,
  observer(racine, visible) {
    if (typeof IntersectionObserver !== 'function') return null;
    return new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) if (e.isIntersecting) visible(e.target);
      },
      { root: racine, threshold: 0.5 },
    );
  },
};

/** Le texte alternatif d'une photo. */
export const altPhoto = (p: PhotoFiche): string => p.alt[LANGUE_PHOTOS] ?? '';

/** Le crédit d'une photo : « Photo recadrée : {auteur} · {licence} · Commons », licence et Commons en liens. */
export function creditPhoto(p: PhotoFiche): HTMLElement {
  const lien = (href: string, t: string) => creer('a', { href, target: '_blank', rel: 'noopener' }, t);
  return creer(
    'p',
    { class: 'fiche-credit' },
    T.credit,
    p.auteur ?? T.auteur_inconnu,
    ' · ',
    p.licence_url ? lien(p.licence_url, p.licence) : p.licence,
    ' · ',
    lien(p.page, T.commons),
  );
}

export interface Carrousel {
  readonly id: string;
  /** La section des photos, posée sous la tête : sa place réservée dès la pose, cachée s'il n'y a rien à montrer. */
  readonly element: HTMLElement;
  /** Les photos, une fois la liste lue ; null avant (ou sans liste). */
  photos(): readonly PhotoFiche[] | null;
  /** Le bouton de la photo i (le focus y revient après le plein écran). */
  bouton(i: number): HTMLElement | null;
  /** Rappelé quand la liste est lue (une demande de plein écran arrivée avant elle). */
  quandLue(f: () => void): void;
  arreter(): void;
}

/**
 * Le carrousel des photos du lieu `id` : une case réservée (3:2) tant que la liste n'est pas lue,
 * puis une case par photo ; `ouvrir(i)` au toucher d'une photo (le plein écran, par l'historique).
 */
export function creerCarrousel(id: string, source: SourcePhotos, ouvrir: (i: number) => void): Carrousel {
  const liste = creer('ul', { class: 'fiche-carrousel' }, creer('li', { class: 'fiche-photo fiche-photo-attente', 'aria-hidden': 'true' }, creer('span', { class: 'fiche-photo-cadre' })));
  const fleche = (cls: string, nom: string, signe: string, d: number) => {
    const b = creer('button', { type: 'button', class: `fiche-fleche ${cls}`, 'aria-label': nom }, creer('span', { 'aria-hidden': 'true' }, signe));
    b.addEventListener('click', () => aller(d));
    return b;
  };
  const avant = fleche('fiche-fleche-avant', T.precedente, '‹', -1);
  const apres = fleche('fiche-fleche-apres', T.suivante, '›', 1);
  // Le compteur se voit ; le lecteur d'écran a déjà « photo n sur total » dans le nom de chaque photo.
  const compteur = creer('span', { class: 'fiche-photos-compteur', 'aria-hidden': 'true' });
  const commandes = creer('div', { class: 'fiche-photos-commandes' }, avant, apres, compteur);
  commandes.hidden = true;
  const section = creer('section', { class: 'fiche-photos', 'aria-label': T.titre }, liste, commandes);
  let photos: readonly PhotoFiche[] | null = null;
  let arrete = false;
  let observateur: ObservateurPhotos | null = null;
  const boutons: HTMLElement[] = [];
  const rappels: (() => void)[] = [];

  /** La photo montrée (le rang de la case au bord gauche du cadre) et le nombre de celles qui restent. */
  const rang = () => {
    const total = liste.querySelectorAll('li.fiche-photo').length;
    const largeur = liste.clientWidth || 0;
    const i = largeur > 0 ? Math.round((liste.scrollLeft || 0) / largeur) : 0;
    return { i: Math.max(0, Math.min(total - 1, i)), total };
  };
  /** Compteur et flèches à jour (à chaque défilement, et quand une case part). */
  const suivre = () => {
    const { i, total } = rang();
    commandes.hidden = !photos || total < 2;
    compteur.textContent = remplir(T.compteur, { n: i + 1, total });
    const focus = (globalThis.document as Document | undefined)?.activeElement;
    avant.disabled = i === 0;
    apres.disabled = i >= total - 1;
    // Une flèche qui se cache sous le focus le passe à l'autre : le clavier ne le perd pas.
    if (focus === avant && avant.disabled && !apres.disabled) apres.focus({ preventScroll: true });
    else if (focus === apres && apres.disabled && !avant.disabled) avant.focus({ preventScroll: true });
  };
  function aller(d: number) {
    const { i, total } = rang();
    const cible = Math.max(0, Math.min(total - 1, i + d));
    const doux = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    liste.scrollTo?.({ left: cible * (liste.clientWidth || 0), behavior: doux ? 'smooth' : 'auto' });
  }
  liste.addEventListener('scroll', suivre, { passive: true });

  const retirer = () => {
    section.hidden = true;
    observateur?.disconnect();
  };
  /** La vignette d'une case : son src posé une fois (data-src), quand la case est vue. */
  const charger = (el: Element) => {
    const img = (el as HTMLElement).querySelector?.('img') as HTMLImageElement | null;
    const src = img?.getAttribute('data-src');
    if (img && src) {
      img.src = src;
      img.removeAttribute('data-src');
    }
    observateur?.unobserve(el);
  };

  source.liste(id).then(
    (l) => {
      if (arrete) return;
      if (!l?.photos.length) return retirer();
      photos = l.photos;
      /** Le libellé de chaque photo restée : « n sur total » parmi celles qui sont encore là. */
      const etiqueter = () => {
        const restes = boutons.filter((b) => liste.contains(b));
        restes.forEach((b, n) => {
          const p = l.photos[Number(b.getAttribute('data-i'))]!;
          const alt = altPhoto(p);
          b.setAttribute('aria-label', restes.length > 1 ? `${remplir(T.agrandir, { alt })} · ${remplir(T.position, { n: n + 1, total: restes.length })}` : remplir(T.agrandir, { alt }));
        });
        suivre();
      };
      const cases = l.photos.map((p, i) => {
        const alt = altPhoto(p);
        const img = creer('img', { class: 'fiche-photo-img', alt, draggable: 'false', decoding: 'async', 'data-src': source.vignette(p.v) });
        // Une photo qui ne vient pas (hors ligne, retirée du site) : sa case part ; aucune : le carrousel.
        img.addEventListener('error', () => {
          li.remove();
          if (!liste.querySelector('li')) retirer();
          else etiqueter();
        });
        img.addEventListener('load', () => img.classList.add('charge'));
        const b = creer('button', { type: 'button', class: 'fiche-photo-bouton', 'data-i': String(i) }, creer('span', { class: 'fiche-photo-cadre' }, img));
        b.addEventListener('click', () => ouvrir(i));
        boutons[i] = b;
        const li = creer('li', { class: 'fiche-photo' }, creer('figure', {}, b, creer('figcaption', {}, creditPhoto(p))));
        return li;
      });
      liste.replaceChildren(...cases);
      etiqueter();
      // La première aussitôt ; les suivantes quand elles entrent à moitié dans le cadre (sans observateur : toutes).
      observateur = source.observer?.(liste, charger) ?? null;
      cases.forEach((c, i) => (i === 0 || !observateur ? charger(c) : observateur.observe(c)));
      for (const f of rappels.splice(0)) f();
    },
    () => {
      if (!arrete) retirer();
    },
  );

  return {
    id,
    element: section,
    photos: () => photos,
    bouton: (i) => boutons[i] ?? null,
    quandLue(f) {
      if (photos) f();
      else rappels.push(f);
    },
    arreter() {
      arrete = true;
      rappels.length = 0;
      observateur?.disconnect();
    },
  };
}

export interface PleinEcran {
  readonly element: HTMLElement;
  montrer(p: PhotoFiche, src: string): void;
  cacher(): void;
  ouvert(): boolean;
}

/**
 * Le plein écran d'une photo, posé dans `zone` (#app) au-dessus de la fiche, caché. `fermer` : un
 * toucher dessus (hors des liens du crédit) ou « × » (le retour de l'historique, § 4.4).
 */
export function creerPleinEcran(zone: HTMLElement, fermer: () => void): PleinEcran {
  const img = creer('img', { class: 'fiche-plein-img', alt: '', draggable: 'false', decoding: 'async' });
  const avis = creer('p', { class: 'fiche-plein-avis' }, T.hors_ligne);
  avis.hidden = true;
  const credit = creer('div', { class: 'fiche-plein-credit' });
  const x = croix(() => fermer(), T.fermer);
  const el = creer('div', { class: 'fiche-plein', id: 'fiche-plein', role: 'dialog', 'aria-modal': 'true' }, x, img, avis, credit);
  el.hidden = true;
  el.addEventListener('click', (e) => {
    // Les liens du crédit s'ouvrent (un autre onglet) sans fermer la photo ; la « × » a son écouteur.
    const cible = (e as MouseEvent).target as Element | null;
    if (cible?.closest?.('a, .croix')) return;
    fermer();
  });
  img.addEventListener('error', () => {
    if (!el.hidden) avis.hidden = false;
  });
  zone.append(el);
  return {
    element: el,
    montrer(p, src) {
      avis.hidden = true;
      img.alt = altPhoto(p);
      el.setAttribute('aria-label', altPhoto(p));
      img.src = src;
      credit.replaceChildren(creditPhoto(p));
      el.hidden = false;
      x.focus({ preventScroll: true });
    },
    cacher() {
      el.hidden = true;
      avis.hidden = true;
      img.removeAttribute('src');
    },
    ouvert: () => !el.hidden,
  };
}
