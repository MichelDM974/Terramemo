// Les photos de la fiche (#34, lot P2 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3.2, § 3.5, § 4.4, § 4.10 à § 4.12 et § 7, « Carrousel ») : src/vues/fiche-photos.ts et
// son branchement dans la feuille (src/vues/fiche.ts), sur le DOM factice, une source de
// photos factice et un observateur de visibilité factice. Chargement une à une (un seul src à
// l'ouverture, le suivant quand sa case entre dans le cadre, le plein écran au toucher
// seulement), crédit sous chaque photo, retrait sans liste ou sans réseau. L'historique du
// plein écran avec la vraie navigation : tests/fiche-vue.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creditPhoto, creerCarrousel, creerPleinEcran, lireListe, sourcePhotosSite, type ListePhotos, type PhotoFiche, type SourcePhotos } from '../src/vues/fiche-photos';
import { creerFeuille, type ModeleFiche } from '../src/vues/fiche';
import { remplir } from '../src/vues/textes';
import { textesFiche } from '../src/vues/textes-fiche';
import { El, installerDom } from './dom-factice';
import { LIEUX_ILLUSTRES } from 'virtual:terramemo-photos-lieux';
import { lieuxIllustres, lireDonnees } from '../geodata/photos/listes.mjs';

const T = textesFiche.photos;
const tenir = () => new Promise((r) => setTimeout(r, 0));

const HIMEJI: PhotoFiche = {
  v: '51f90582a4',
  p: '49223f4399',
  alt: { fr: 'château de Himeji' },
  auteur: 'Nikos Kitsakis',
  licence: 'CC BY-SA 4.0',
  licence_url: 'https://creativecommons.org/licenses/by-sa/4.0',
  page: 'https://commons.wikimedia.org/wiki/File:Himeji_castle_in_may_2015.jpg',
};
const KYOTO: PhotoFiche = { ...HIMEJI, v: 'b87c3924fe', p: '08fb97862f', alt: { fr: 'préfecture de Kyoto' }, auteur: 'WKC from Hong Kong', licence: 'CC BY-SA 2.0', licence_url: 'https://creativecommons.org/licenses/by-sa/2.0', page: 'https://commons.wikimedia.org/wiki/File:RX100VII.jpg' };
const PITON: PhotoFiche = { ...HIMEJI, v: '2a9a40e13d', p: '95aea31cc0', alt: { fr: 'piton des Neiges' }, auteur: null, licence: 'Domaine public', licence_url: null, page: 'https://commons.wikimedia.org/wiki/File:Piton_des_Neiges1.JPG' };

/** Un observateur factice : les cases observées, et voir(el) qui les fait entrer dans le cadre. */
function observateurFactice() {
  const observees = new Set<Element>();
  let rappel: ((el: Element) => void) | null = null;
  return {
    observees,
    voir(el: Element) {
      if (observees.has(el)) rappel?.(el);
    },
    fabrique(_racine: HTMLElement, visible: (el: Element) => void) {
      rappel = visible;
      return { observe: (el: Element) => void observees.add(el), unobserve: (el: Element) => void observees.delete(el), disconnect: () => observees.clear() };
    },
  };
}

/** Une source factice : les listes par lieu (absent : 404 ; 'hors-ligne' : rejet), et ce qu'on lui a demandé. */
function sourceFactice(listes: Record<string, readonly PhotoFiche[] | 'hors-ligne'>, avecObservateur = true) {
  const obs = observateurFactice();
  const demandes: string[] = [];
  const source: SourcePhotos = {
    liste: (id) => {
      demandes.push(id);
      const l = listes[id];
      if (l === 'hors-ligne') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(l ? ({ v: 1, photos: l } satisfies ListePhotos) : null);
    },
    vignette: (n) => `/photos/v/${n}.webp`,
    plein: (n) => `/photos/p/${n}.webp`,
    ...(avecObservateur ? { observer: (r: HTMLElement, f: (el: Element) => void) => obs.fabrique(r, f) } : {}),
  };
  return { source, obs, demandes };
}

const imgs = (el: El) => el.querySelectorAll('img.fiche-photo-img');
const srcs = (el: El) => imgs(el).map((i) => (i as unknown as { src?: string }).src ?? null);

beforeEach(() => {
  installerDom();
});
afterEach(() => vi.unstubAllGlobals());

describe('la liste d’un lieu (photos/l/<id>.json)', () => {
  it('lue sans les photos mal formées : nom de 10 caractères hexadécimaux, texte alternatif, licence, page de Commons', () => {
    const l = lireListe({ v: 1, photos: [HIMEJI, { ...HIMEJI, v: '../x' }, { ...HIMEJI, alt: {} }, { ...HIMEJI, page: 'https://example.org/x' }, { ...HIMEJI, licence_url: 'javascript:alert(1)' }, null, PITON] });
    expect(l.photos).toEqual([HIMEJI, PITON]);
    expect(lireListe(null).photos).toEqual([]);
    expect(lireListe({ photos: 'x' }).photos).toEqual([]);
  });

  it('le site : l’index des lieux illustrés du build (vide tant que la relecture n’a rien validé), lu sans réseau', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(typeof sourcePhotosSite.illustre).toBe('function');
    for (const id of LIEUX_ILLUSTRES) expect(sourcePhotosSite.illustre!(id), id).toBe(true);
    expect(sourcePhotosSite.illustre!('pas-un-lieu')).toBe(false);
    expect(LIEUX_ILLUSTRES).toEqual(lieuxIllustres(lireDonnees()));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('le site : la liste à photos/l/<id>.json (404 : pas de photo), les fichiers sous photos/v/ et photos/p/', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      appels.push(u);
      return u.endsWith('/JPN.json') ? { ok: true, status: 200, json: async () => ({ v: 1, photos: [HIMEJI] }) } : { ok: false, status: 404 };
    });
    expect((await sourcePhotosSite.liste('JPN'))?.photos).toEqual([HIMEJI]);
    expect(await sourcePhotosSite.liste('aden')).toBeNull();
    expect(appels).toEqual(['/photos/l/JPN.json', '/photos/l/aden.json']);
    expect(sourcePhotosSite.vignette('51f90582a4')).toBe('/photos/v/51f90582a4.webp');
    expect(sourcePhotosSite.plein('49223f4399')).toBe('/photos/p/49223f4399.webp');
  });
});

describe('le crédit sous chaque photo (§ 3.2)', () => {
  it('« Photo recadrée : {auteur} · {licence} · Commons », la licence vers son texte, Commons vers la page du fichier', () => {
    const c = creditPhoto(HIMEJI) as unknown as El;
    expect(c.textContent).toBe(`${T.credit}Nikos Kitsakis · CC BY-SA 4.0 · ${T.commons}`);
    expect(c.textContent.startsWith('Photo recadrée : ')).toBe(true);
    const liens = c.querySelectorAll('a');
    expect(liens.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')])).toEqual([
      ['CC BY-SA 4.0', HIMEJI.licence_url, '_blank', 'noopener'],
      [T.commons, HIMEJI.page, '_blank', 'noopener'],
    ]);
  });

  it('domaine public sans auteur : « Auteur inconnu », la licence sans lien ; du texte, pas une infobulle', () => {
    const c = creditPhoto(PITON) as unknown as El;
    expect(c.textContent).toBe(`${T.credit}${T.auteur_inconnu} · Domaine public · ${T.commons}`);
    expect(c.querySelectorAll('a')).toHaveLength(1);
    expect(c.getAttribute('title')).toBeNull();
  });
});

describe('le carrousel : une à une', () => {
  it('sa place réservée avant la liste ; puis une case par photo, un seul src posé, le suivant quand sa case entre dans le cadre', async () => {
    const { source, obs, demandes } = sourceFactice({ JPN: [KYOTO, HIMEJI, PITON] });
    const c = creerCarrousel('JPN', source, () => undefined);
    const el = c.element as unknown as El;
    expect(demandes).toEqual(['JPN']);
    expect(el.querySelectorAll('li.fiche-photo-attente')).toHaveLength(1);
    expect(el.querySelectorAll('.fiche-photo-cadre')).toHaveLength(1);
    expect(c.photos()).toBeNull();
    await tenir();
    expect(el.hidden).toBe(false);
    expect(el.querySelectorAll('li.fiche-photo-attente')).toHaveLength(0);
    expect(imgs(el).map((i) => i.alt)).toEqual(['préfecture de Kyoto', 'château de Himeji', 'piton des Neiges']);
    // Un seul src à l'ouverture : la première vignette ; les autres attendent d'être vues.
    expect(srcs(el)).toEqual(['/photos/v/b87c3924fe.webp', null, null]);
    const cases = el.querySelectorAll('li.fiche-photo');
    expect(obs.observees.size).toBe(2);
    obs.voir(cases[1] as unknown as Element);
    expect(srcs(el)).toEqual(['/photos/v/b87c3924fe.webp', '/photos/v/51f90582a4.webp', null]);
    expect(obs.observees.has(cases[1] as unknown as Element)).toBe(false);
    // Chaque photo son crédit dessous.
    expect(el.querySelectorAll('figcaption').map((f) => f.textContent)).toEqual([KYOTO, HIMEJI, PITON].map((p) => (creditPhoto(p) as unknown as El).textContent));
    expect(c.photos()).toEqual([KYOTO, HIMEJI, PITON]);
  });

  it('le plein écran au toucher seulement : ouvrir(i), rien de chargé avant', async () => {
    const ouvrir = vi.fn<(i: number) => void>();
    const { source } = sourceFactice({ JPN: [KYOTO, HIMEJI] });
    const c = creerCarrousel('JPN', source, ouvrir);
    await tenir();
    const el = c.element as unknown as El;
    expect(el.querySelectorAll('img').every((i) => !String((i as unknown as { src?: string }).src ?? '').includes('/photos/p/'))).toBe(true);
    const b = el.querySelectorAll('.fiche-photo-bouton');
    expect(b.map((x) => x.getAttribute('aria-label'))).toEqual([
      `${remplir(T.agrandir, { alt: 'préfecture de Kyoto' })} · ${remplir(T.position, { n: 1, total: 2 })}`,
      `${remplir(T.agrandir, { alt: 'château de Himeji' })} · ${remplir(T.position, { n: 2, total: 2 })}`,
    ]);
    b[1]!.click();
    expect(ouvrir).toHaveBeenCalledWith(1);
    expect(c.bouton(1)).toBe(b[1] as unknown as HTMLElement);
  });

  it('sans observateur (un vieux navigateur) : toutes les vignettes', async () => {
    const { source } = sourceFactice({ JPN: [KYOTO, HIMEJI] }, false);
    const c = creerCarrousel('JPN', source, () => undefined);
    await tenir();
    expect(srcs(c.element as unknown as El)).toEqual(['/photos/v/b87c3924fe.webp', '/photos/v/51f90582a4.webp']);
  });

  it('un lieu sans photo (404), une liste vide, ou hors ligne sans copie : le carrousel se retire', async () => {
    const { source } = sourceFactice({ vide: [], coupe: 'hors-ligne' });
    for (const id of ['aden', 'vide', 'coupe']) {
      const c = creerCarrousel(id, source, () => undefined);
      expect(c.element.hidden, id).toBe(false);
      await tenir();
      expect(c.element.hidden, id).toBe(true);
      expect(c.photos(), id).toBeNull();
    }
  });

  it('une photo qui ne vient pas : sa case se retire, la fiche montre les autres ; aucune : le carrousel', async () => {
    const { source } = sourceFactice({ JPN: [KYOTO, HIMEJI] }, false);
    const c = creerCarrousel('JPN', source, () => undefined);
    await tenir();
    const el = c.element as unknown as El;
    imgs(el)[0]!.emettre('error');
    expect(imgs(el).map((i) => i.alt)).toEqual(['château de Himeji']);
    expect(el.hidden).toBe(false);
    imgs(el)[0]!.emettre('error');
    expect(el.hidden).toBe(true);
  });

  it('une photo retirée : les libellés « n sur total » des autres comptent celles qui restent ; le plein écran garde son rang', async () => {
    const { source } = sourceFactice({ JPN: [KYOTO, HIMEJI, PITON] }, false);
    const ouvrir = vi.fn<(i: number) => void>();
    const c = creerCarrousel('JPN', source, ouvrir);
    await tenir();
    const el = c.element as unknown as El;
    const labels = () => el.querySelectorAll('.fiche-photo-bouton').map((b) => b.getAttribute('aria-label'));
    const lab = (alt: string, n: number, total: number) => `${remplir(T.agrandir, { alt })} · ${remplir(T.position, { n, total })}`;
    expect(labels()).toEqual([lab('préfecture de Kyoto', 1, 3), lab('château de Himeji', 2, 3), lab('piton des Neiges', 3, 3)]);
    imgs(el)[1]!.emettre('error');
    expect(labels()).toEqual([lab('préfecture de Kyoto', 1, 2), lab('piton des Neiges', 2, 2)]);
    el.querySelectorAll('.fiche-photo-bouton')[1]!.click();
    expect(ouvrir).toHaveBeenCalledWith(2);
    imgs(el)[1]!.emettre('error');
    expect(labels()).toEqual([remplir(T.agrandir, { alt: 'préfecture de Kyoto' })]);
  });

  it('arrêté avant la réponse (une autre fiche) : rien n’est posé', async () => {
    const { source } = sourceFactice({ JPN: [KYOTO] });
    const c = creerCarrousel('JPN', source, () => undefined);
    c.arreter();
    await tenir();
    expect(imgs(c.element as unknown as El)).toHaveLength(0);
  });
});

describe('le plein écran', () => {
  it('la photo entière et son crédit ; un toucher ou « × » le ferment, pas un lien du crédit ; hors ligne : il le dit', () => {
    const zone = new El('main');
    const fermer = vi.fn<() => void>();
    const p = creerPleinEcran(zone as unknown as HTMLElement, fermer);
    const el = p.element as unknown as El;
    expect(el.hidden).toBe(true);
    p.montrer(HIMEJI, '/photos/p/49223f4399.webp');
    expect(p.ouvert()).toBe(true);
    expect(el.getAttribute('aria-label')).toBe('château de Himeji');
    const img = el.querySelector('img')! as unknown as { src: string; alt: string };
    expect(img).toMatchObject({ src: '/photos/p/49223f4399.webp', alt: 'château de Himeji' });
    expect(el.querySelector('.fiche-credit')!.textContent).toBe((creditPhoto(HIMEJI) as unknown as El).textContent);
    // Un lien du crédit : ouvert ailleurs, la photo reste.
    el.emettre('click', { target: el.querySelector('.fiche-credit a') });
    expect(fermer).not.toHaveBeenCalled();
    el.emettre('click', { target: el.querySelector('img') });
    expect(fermer).toHaveBeenCalledTimes(1);
    el.querySelector('.croix')!.click();
    expect(fermer).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.croix')!.getAttribute('aria-label')).toBe(T.fermer);
    // La photo ne vient pas (hors ligne, retirée) : « indisponible hors ligne ».
    const avis = el.querySelector('.fiche-plein-avis')!;
    expect(avis.hidden).toBe(true);
    el.querySelector('img')!.emettre('error');
    expect(avis.hidden).toBe(false);
    expect(avis.textContent).toBe(T.hors_ligne);
    p.cacher();
    expect(p.ouvert()).toBe(false);
    expect(avis.hidden).toBe(true);
  });
});

describe('dans la feuille (fiche.ts)', () => {
  const modele = (id: string, nom: string): ModeleFiche => ({
    terrain: 'monde',
    id,
    sorte: 'pays',
    nom,
    statut: '',
    drapeaux: [],
    avecDrapeau: false,
    faits: [],
    voisins: [],
    titreVoisins: 'Voisins',
    memoire: null,
    apprendre: null,
    wikipedia: null,
    sources: [],
  });

  function feuille(listes: Record<string, readonly PhotoFiche[] | 'hors-ligne'>) {
    const zone = new El('main');
    const actions = { fermer: vi.fn(), voile: vi.fn(), avant: vi.fn(), voisin: vi.fn(), photo: vi.fn<(i: number) => void>() };
    const s = sourceFactice(listes);
    const f = creerFeuille(zone as unknown as HTMLElement, actions, undefined, s.source);
    return { zone, actions, f, ...s, el: f.element as unknown as El, plein: () => zone.querySelector('#fiche-plein')! };
  }

  it('le carrousel sous la tête ; une photo touchée demande son plein écran (actions.photo) ; sans source, pas de carrousel', async () => {
    const v = feuille({ JPN: [KYOTO, HIMEJI] });
    v.f.montrer(modele('JPN', 'Japon'), { avant: false, focus: true });
    const contenu = v.el.querySelector('.fiche-contenu')!;
    expect(contenu.enfants.slice(0, 2).map((e) => (e as El).className)).toEqual(['fiche-tete', 'fiche-photos']);
    await tenir();
    v.el.querySelectorAll('.fiche-photo-bouton')[1]!.click();
    expect(v.actions.photo).toHaveBeenCalledWith(1);
    const sans = creerFeuille(new El('main') as unknown as HTMLElement, v.actions);
    sans.montrer(modele('JPN', 'Japon'), { avant: false, focus: true });
    expect((sans.element as unknown as El).querySelector('.fiche-photos')).toBeNull();
  });

  it('un lieu hors de l’index des lieux illustrés : ni carrousel, ni place réservée, ni liste lue ; la fiche ne saute pas', async () => {
    const zone = new El('main');
    const actions = { fermer: vi.fn(), voile: vi.fn(), avant: vi.fn(), voisin: vi.fn(), photo: vi.fn<(i: number) => void>() };
    const s = sourceFactice({ JPN: [KYOTO] });
    const f = creerFeuille(zone as unknown as HTMLElement, actions, undefined, { ...s.source, illustre: (id) => id === 'JPN' });
    const el = f.element as unknown as El;
    f.montrer(modele('FRA', 'France'), { avant: false, focus: true });
    expect(el.querySelector('.fiche-photos')).toBeNull();
    expect(el.querySelector('.fiche-photo-attente')).toBeNull();
    await tenir();
    expect(s.demandes).toEqual([]);
    f.montrer(modele('JPN', 'Japon'), { avant: true, focus: true });
    expect(el.querySelector('.fiche-photo-attente')).not.toBeNull();
    await tenir();
    expect(s.demandes).toEqual(['JPN']);
    expect(imgs(el)).toHaveLength(1);
    // Retour à un lieu sans photo : le carrousel du Japon part, rien n'est relu.
    f.montrer(modele('FRA', 'France'), { avant: true, focus: true });
    expect(el.querySelector('.fiche-photos')).toBeNull();
    expect(s.demandes).toEqual(['JPN']);
  });

  it('pleinEcran(i) le montre, pleinEcran(null) le ferme et rend le focus à la photo ; sa « × » est un pas en arrière (actions.avant)', async () => {
    const v = feuille({ JPN: [KYOTO, HIMEJI] });
    v.f.montrer(modele('JPN', 'Japon'), { avant: false, focus: true });
    await tenir();
    v.f.pleinEcran(1);
    expect(v.plein().hidden).toBe(false);
    expect((v.plein().querySelector('img') as unknown as { src: string }).src).toBe('/photos/p/49223f4399.webp');
    v.plein().querySelector('.croix')!.click();
    expect(v.actions.avant).toHaveBeenCalledOnce();
    v.f.pleinEcran(null);
    expect(v.plein().hidden).toBe(true);
    expect((document as unknown as { activeElement?: El }).activeElement).toBe(v.el.querySelectorAll('.fiche-photo-bouton')[1]);
  });

  it('demandé avant la liste (un retour en avant de l’historique) : montré à son arrivée', async () => {
    const v = feuille({ JPN: [KYOTO, HIMEJI] });
    v.f.montrer(modele('JPN', 'Japon'), { avant: false, focus: true });
    v.f.pleinEcran(0);
    expect(v.plein().hidden).toBe(true);
    await tenir();
    expect(v.plein().hidden).toBe(false);
  });

  it('la même fiche refaite (la mémoire relue) garde son carrousel sans relire la liste ; une autre fiche a le sien ; fermer cache le plein écran', async () => {
    const v = feuille({ JPN: [KYOTO], CHN: [HIMEJI] });
    v.f.montrer(modele('JPN', 'Japon'), { avant: false, focus: true });
    await tenir();
    const avant = v.el.querySelector('.fiche-photos');
    v.f.montrer(modele('JPN', 'Japon'), { avant: false, focus: false });
    expect(v.el.querySelector('.fiche-photos')).toBe(avant);
    expect(v.demandes).toEqual(['JPN']);
    v.f.montrer(modele('CHN', 'Chine'), { avant: true, focus: true });
    expect(v.el.querySelector('.fiche-photos')).not.toBe(avant);
    expect(v.demandes).toEqual(['JPN', 'CHN']);
    await tenir();
    v.f.pleinEcran(0);
    expect(v.plein().hidden).toBe(false);
    v.f.fermer();
    expect(v.plein().hidden).toBe(true);
  });
});
