import { acceptesEnPlus, type Admis } from '../map/acceptes';
import { capitalesChargees, chargerCapitales } from '../map/capitales';
import { attendreImages, chargerDrapeaux, drapeauxCharges, prechargerDrapeaux, prechargerImages, type ChargerImage } from '../map/drapeaux';
import type { CarteAffichee } from '../map/carte';
import { chargerMers, estIdMer } from '../map/mers';
import { tailleEcranPx } from '../map/pastilles';
import type { DonneesCarte } from '../map/donnees';
import type { OptionsNoter } from '../map/pick';
import type { Entite, Forme, Lieu, Mer, Statut } from '../map/types';
import type { Mesures } from '../mesure/mesures';
import type { Terrain, Terrains } from '../terrains';
import type { Serie } from './cibles';
import { dansZone, type Contenu, type Enonce, type RenduSujet } from './sujets';
import { elide } from './formes';
import { remplir, textes } from './textes';

export interface ContexteVue {
  /** La carte du monde, toujours (explorer, saisie, pilote de mesure) ; un terrain : terrains. */
  carte: CarteAffichee;
  /** Les données du monde, toujours. */
  donnees: DonneesCarte;
  /** Le monde et les terrains locaux (l'île) : charger, montrer (src/terrains.ts). */
  terrains: Terrains;
  mesures: Mesures;
  /** Zone sous l'en-tête (main#app). */
  zone: HTMLElement;
  /**
   * Une partie finie, son bilan affiché (Toucher et ses modes, une séance,
   * une épreuve classée, le quiz) : l'écran de connexion d'une session perdue
   * vient alors par-dessus (src/vues/accueil.ts, finDePartie), avant tout
   * « Rejouer ». Appelé en dernier, le bilan déjà montré.
   */
  finDePartie?(): void;
}

export interface Vue {
  activer(): void;
  desactiver(): void;
  /**
   * Au moment d'ouvrir la vue (router de main.ts) : rien à y montrer, aller
   * plutôt à cette adresse de Jouer, avec ce message à son statut (Toucher et
   * les épreuves atteintes sans partie : adresse tapée, retour arrière). null :
   * la vue s'ouvre.
   */
  redirection?(): { cible: string; message?: string } | null;
  /**
   * Une vue de partie (Toucher, épreuves) : a-t-elle, à l'ouverture, quelque
   * chose à montrer (partie à reprendre, bilan) ? Sans effet de bord, à la
   * différence de redirection() : le « × » de Jouer le demande à la vue
   * d'avant (src/navigation.ts), qui n'est pas rouverte si c'est non.
   */
  aMontrer?(): boolean;
  /** Un toucher sur la carte (x, y : px CSS relatifs à la carte). */
  toucher?(x: number, y: number, ev: PointerEvent): void;
}

export const LIBELLE_STATUT: Record<Statut, string> = {
  jouable: '',
  optionnel: 'paquet optionnel',
  territoire: 'territoire',
  conteste: 'statut contesté',
  autre: '',
};

export function creer<K extends keyof HTMLElementTagNameMap>(
  nom: K,
  attrs: Record<string, string> = {},
  ...enfants: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(nom);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...enfants);
  return e;
}

/**
 * La « × » des écrans qui couvrent la carte (#18 : « toujours moyen de revenir
 * à la carte depuis un menu ») : bouton rond de 44 px, premier enfant du
 * panneau, flottant en haut à droite (.croix, style.css) ; titres et boutons
 * passent à côté, jamais dessous. `versCarte` : l'accueil (main.ts :
 * nav.remonter('carte')), après ce que l'écran a à fermer (un bilan). Les
 * « Retour » restent à côté : eux mènent à la vue d'avant.
 */
export function croix(versCarte: () => void, libelle: string = textes.croix.carte): HTMLButtonElement {
  const b = creer('button', { type: 'button', class: 'croix', 'aria-label': libelle, title: libelle }, '×');
  b.addEventListener('click', () => versCarte());
  return b;
}

/**
 * Un contenu du rendu d'un sujet (sujets.ts) dans `el` : son texte, ou son
 * image (un drapeau), puis sa légende s'il en a une. L'image est un <img>
 * (pas de SVG en ligne : pas de conflit d'id entre drapeaux), qui ne se
 * glisse pas, de taille fixe en CSS (.drapeau, carte.css) : un gris 4:3 tient
 * sa place jusqu'à son arrivée (classe « charge » : le fond blanc des
 * drapeaux), si bien que la barre a sa hauteur dès la pose (allumerZone la
 * lit aussitôt).
 */
export function poserContenu(el: HTMLElement, c: Contenu): void {
  if ('texte' in c) {
    el.textContent = c.texte;
    return;
  }
  const img = creer('img', { class: 'drapeau', src: c.image, alt: c.alt, draggable: 'false' });
  img.addEventListener('load', () => img.classList.add('charge'));
  el.replaceChildren(img, ...(c.legende ? [creer('span', { class: 'contenu-legende' }, c.legende)] : []));
}

/** L'énoncé d'une question (sujets.ts) dans la consigne de la barre : « Touche : » puis l'objet en gras (une image : à côté de l'invite). */
export function poserEnonce(el: HTMLElement, e: Enonce): void {
  const objet = creer('strong');
  poserContenu(objet, e.objet);
  el.replaceChildren(e.invite, objet);
  el.classList.toggle('consigne-deux-lignes', !!e.deuxLignes);
  el.classList.toggle('consigne-image', 'image' in e.objet);
}

/**
 * Les zones admises que la rétroaction sait dire : celles de la carte
 * (contestée, enclave), celles qu'un sujet passe en plus (étude J2 § 2.2 : la
 * capitale revendiquée, le jumeau d'un drapeau, Monaco pour l'Indonésie sous
 * Drapeaux ; la partie d'une mer, la mer des Caraïbes pour l'Atlantique sous
 * Mers).
 */
export type AdmisDit = Admis | { zone: string; tenant: string; sorte: 'partie' };

/**
 * Pourquoi un toucher hors du tracé de la cible est juste (décision « Zones
 * contestées et enclaves », Note.admis de noter()) : « (zone contestée, tenue
 * par la Russie) » (libellé de l'étude, option B ; le pays avec son article,
 * décision « Articles des noms de pays » : RenduSujet.lieuArticle),
 * « (enclave : Baïkonour) » ; '' sans zone
 * admise. Une entité contestée se tient elle-même dans les données (tenant =
 * zone : Somaliland, Malouines, glacier de Siachen…) : son nom à la place
 * (« zone contestée : Somaliland »). Rien quand la cible la tient : le toucher
 * est juste sans règle à expliquer. Les zones nommées par le rendu du sujet
 * joué (RenduSujet.lieu). Sous Capitales, Jérusalem touchée en Palestine (ou
 * Jérusalem-Est en Israël, D36 i) : « (capitale revendiquée aussi par la
 * Palestine) » ; sous Drapeaux, « (même drapeau que l'Indonésie) », « qu' »
 * devant une voyelle (elide). Sous Mers, la partie touchée et ce qui la contient, la forme
 * voulue par l'utilisateur : « Juste : mer des Caraïbes, dans l'Atlantique »
 * (dansZone, le bon article pour chaque zone qui a des parties).
 */
export function texteAdmis(r: Pick<RenduSujet, 'lieu' | 'lieuArticle'>, cible: string, admis: AdmisDit | null | undefined): string {
  if (!admis) return '';
  const T = textes.toucher;
  if (admis.sorte === 'enclave') return remplir(T.admis_enclave, { zone: r.lieu(admis.zone) });
  if (admis.sorte === 'jumeau') {
    const zone = r.lieuArticle(admis.zone);
    return remplir(elide(zone) ? T.admis_jumeau_elide : T.admis_jumeau, { zone });
  }
  if (admis.sorte === 'partie') return remplir(T.admis_partie, { zone: r.lieu(admis.zone), dans: dansZone(cible, r.lieu(cible)) });
  if (admis.sorte === 'capitale') return remplir(T.admis_capitale, { zone: r.lieuArticle(admis.zone) });
  if (admis.tenant === cible) return '';
  if (admis.tenant === admis.zone) return remplir(T.admis_contestee_zone, { zone: r.lieu(admis.zone) });
  return remplir(T.admis_contestee, { tenant: r.lieuArticle(admis.tenant) });
}

/** Durée lisible : « 1,2 s », espace insécable avant l'unité. */
export const fmtS = (ms: number): string => `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00a0s`;

/**
 * Distance lisible : une décimale sous 10 km (« 2,4 km » : sur l'île, « 0 km »
 * ne dirait rien), l'entier au-delà (« 1 234 km »), espace insécable.
 */
export function fmtKm(km: number): string {
  const dixiemes = Math.round(km * 10) / 10;
  const txt =
    dixiemes < 10
      ? dixiemes.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : Math.round(km).toLocaleString('fr-FR');
  return `${txt}\u00a0km`;
}

/**
 * Les zones marines posées sur la carte d'un terrain (DonneesCarte.mers),
 * vides avant la couche, et pour des données sans elles (l'île, les tests).
 */
export const mersPosees = (d: { mers?: readonly Entite<Mer>[] }): readonly Entite<Mer>[] => d.mers ?? [];
/** La zone marine posée de cet id ; undefined pour un pays, une commune, ou avant la couche. */
export const merPosee = (d: { mers?: readonly Entite<Mer>[] }, id: string): Mer | undefined => mersPosees(d).find((m) => m.pays.id === id)?.pays;

/** Sous ce côté à l'écran (px CSS), un anneau entoure la zone (micro-États, petites îles). */
export const ANNEAU_SOUS_PX = 12;

/** La zone (pays, commune, ou mer posée sur la carte) fait-elle moins de ANNEAU_SOUS_PX à l'écran, au zoom courant de la carte ? */
export function estPetite(t: Pick<Terrain, 'carte' | 'donnees'>, id: string): boolean {
  const e = t.donnees.entites.find((en) => en.pays.id === id)?.pays ?? merPosee(t.donnees, id);
  return !!e && tailleEcranPx(e, t.carte.projection.scale(), t.carte.transfo.k) < ANNEAU_SOUS_PX;
}

/**
 * Un anneau autour de la zone : anneau(id) pour un pays ou une commune ; une
 * mer (la mer d'Azov, 2 px au zoom 1), à son point (anneauEn), car les rendus
 * Canvas et WebGL ne cherchent le point d'un anneau que parmi les pays.
 */
export function anneauZone(carte: Pick<CarteAffichee, 'anneau' | 'anneauEn'>, id: string, lieu: Lieu | undefined, classe: string): void {
  if (lieu && 'sorte' in lieu) carte.anneauEn(lieu.point, classe);
  else carte.anneau(id, classe);
}

/**
 * Un anneau autour de la zone si elle est petite à l'écran (le Vatican, Petite-Île
 * vue de loin) ; au-dessus, la zone colorée se voit seule, et l'anneau (16 px de
 * rayon) ne ferait que déborder sur ses voisines.
 */
export function anneauSiPetite(t: Pick<Terrain, 'carte' | 'donnees'>, id: string, classe: string): void {
  if (estPetite(t, id)) anneauZone(t.carte, id, merPosee(t.donnees, id), classe);
}

/** Les cibles d'une série dans son terrain chargé : les siennes (monde), ou toutes les zones jouables (l'île). */
export const idsSerie = (s: Serie, t: Terrain): string[] => (s.ids.length ? [...s.ids] : [...t.jouables]);

/**
 * La couche marine lue (chargerMers, une fois) puis posée sur la carte du
 * monde (prendreMers, comme ?mers=demo : ses zones dans donnees.mers et
 * l'index commun ; le WebGL prend pick et noter du Canvas) : ce qu'il faut
 * avant une question de mer (noter lève sinon) ; null si elle y est déjà.
 */
export function poserMers(c: Pick<ContexteVue, 'carte' | 'donnees'>, charger: () => ReturnType<typeof chargerMers> = chargerMers): Promise<unknown> | null {
  if (mersPosees(c.donnees).length) return null;
  return charger().then((couche) => c.carte.prendreMers(couche));
}

/**
 * Les données propres d'un sujet, hors de son terrain (étude J2 § 4.2) :
 * null si elles sont déjà là ou qu'il n'en a pas (pays, communes), sinon
 * la promesse de leur chargement (capitales.json et son fichier de langue ;
 * le manifeste des drapeaux, sans les images ; la couche marine, posée sur
 * la carte du monde `monde`).
 */
export function chargementSujet(sujet: string, monde?: Pick<ContexteVue, 'carte' | 'donnees'>): Promise<unknown> | null {
  if (sujet === 'capitales') return capitalesChargees() ? null : chargerCapitales();
  if (sujet === 'drapeaux') return drapeauxCharges() ? null : chargerDrapeaux();
  if (sujet === 'mers') return monde ? poserMers(monde) : Promise.reject(new Error('mers : pas de carte où les poser'));
  return null;
}

/**
 * Les zones d'une partie de ce sujet sur ce terrain (Reconnaître, carte
 * retournée : leurres et cadrage) : les pays (ou communes) du terrain, ou ses
 * zones marines posées (donnees.mers) pour les mers (leur emprise entière
 * se lit à part : contourZone, lieux.ts).
 */
export function zonesDuSujet(
  sujet: string,
  t: Pick<Terrain, 'donnees' | 'jouables'>,
): { lieux: Map<string, Lieu>; formes: Map<string, Forme>; jouables: Set<string> } {
  if (sujet !== 'mers') {
    return {
      lieux: new Map(t.donnees.entites.map((e) => [e.pays.id, e.pays])),
      formes: new Map(t.donnees.entites.map((e) => [e.pays.id, e.forme])),
      jouables: new Set(t.jouables),
    };
  }
  const mers = mersPosees(t.donnees);
  const zones = mers.map((e) => e.pays);
  return {
    lieux: new Map(mers.map((e) => [e.pays.id, e.pays as Lieu])),
    formes: new Map(mers.map((e) => [e.pays.id, e.forme])),
    jouables: new Set(zones.filter((m) => estIdMer(m.id)).map((m) => m.id)),
  };
}

/**
 * Ce que montreront ces lieux du sujet en choix, demandé d'avance (étude J2
 * § 2.2) : les drapeaux de la question suivante de Reconnaître (le premier de
 * chaque pays), pour qu'ils ne montrent pas le gris d'attente. Rien pour un
 * sujet sans image.
 */
export function prechargerSujet(sujet: string, ids: Iterable<string>): void {
  if (sujet === 'drapeaux') prechargerDrapeaux(ids);
}

/**
 * L'image de l'énoncé de ces lieux, demandée d'avance : le drapeau de la
 * question suivante de Trouver en Entraînement, celui que le rendu montrera
 * (tiré parmi les justes et fixé, D38 a : pas toujours le premier), pour
 * qu'il ne montre pas le gris d'attente. Rien pour un sujet sans image.
 */
export function prechargerEnonces(r: Pick<RenduSujet, 'imageEnonce'>, ids: Iterable<string>): void {
  prechargerImages([...ids].flatMap((id) => r.imageEnonce(id) ?? []));
}

/**
 * Toute une partie d'épreuve au départ (étude J2 § 2.2 ; décision « Images
 * d'une épreuve ») : l'image de l'énoncé de chacune de ses questions,
 * demandée d'un coup, dans l'ordre où elles viendront (la première d'abord),
 * et attendue avant la première, pour qu'aucune ne montre le gris d'attente
 * pendant que le temps court. null : rien à attendre (un sujet sans image,
 * ou toutes déjà là), la partie part tout de suite ; sinon la promesse des
 * adresses qui ont échoué (drapeaux.ts attendreImages, `progres` compris).
 */
export function attendreEnonces(
  r: Pick<RenduSujet, 'imageEnonce'>,
  ids: readonly string[],
  progres?: (n: number, total: number) => void,
  charger?: ChargerImage,
): Promise<string[]> | null {
  return attendreImages(
    ids.flatMap((id) => r.imageEnonce(id) ?? []),
    progres,
    charger,
  );
}

/**
 * Le terrain d'une série choisie dans Jouer, puis les données de son sujet
 * (étude J2 § 4.2 : une partie attend le sujet, pas seulement le terrain ;
 * sinon une capitale s'afficherait par son Qid), puis `suite` (avec ses
 * cibles). Tout déjà là (le monde, l'île au second choix, les capitales
 * déjà lues) : tout de suite. Sinon : boutons du niveau désactivés et statut
 * le temps du chargement (un double clic ne lance pas deux parties) ; un
 * échec (hors ligne) l'écrit au statut, on reste sur ce niveau. `encore()`
 * faux à l'arrivée (vue quittée, autre niveau) : pas de suite.
 */
export function avecSujet(
  ctx: ContexteVue,
  s: Serie,
  sujet: string,
  o: { boutons: readonly HTMLButtonElement[]; statut: HTMLElement; encore: () => boolean },
  suite: (t: Terrain, ids: string[]) => void,
): void {
  const dire = (m: string) => {
    o.statut.textContent = m;
    o.statut.hidden = !m;
  };
  const deja = s.terrain === 'monde' ? ctx.terrains.monde : ctx.terrains.deja(s.terrain);
  const donnees = chargementSujet(sujet, ctx);
  if (deja && !donnees) {
    dire('');
    return suite(deja, idsSerie(s, deja));
  }
  const actifs = o.boutons.filter((b) => !b.disabled);
  for (const b of actifs) b.disabled = true;
  dire(deja ? textes.toucher.chargement_sujet : textes.toucher.chargement_terrain);
  const fin = (m: string) => {
    for (const b of actifs) b.disabled = false;
    dire(m);
  };
  const partir = (t: Terrain) => {
    fin('');
    if (o.encore()) suite(t, idsSerie(s, t));
  };
  // Le terrain, puis le sujet : chaque échec a son message (la carte de l'île, ou les données du sujet).
  const avecDonnees = (t: Terrain) => {
    const d = donnees ?? chargementSujet(sujet, ctx);
    if (!d) return partir(t);
    d.then(
      () => partir(t),
      () => fin(textes.toucher.echec_sujet),
    );
  };
  if (deja) return avecDonnees(deja);
  ctx.terrains.charger(s.terrain).then(avecDonnees, () => fin(textes.toucher.echec_terrain));
}

/**
 * Les options de noter() pour la question de ce lieu dans ce sujet : les
 * zones admises de la carte (entraînement et épreuves : la date d'effet des
 * épreuves, le 09/11/2026, est passée ; décision « Zones contestées et
 * enclaves »), plus celles du sujet (D36 i : Jérusalem ↔ Jérusalem-Est sous
 * Capitales ; D41 d : les jumeaux sous Drapeaux ; D43 : les parties d'une
 * mer sous Mers), jamais dans la table commune.
 */
export function optionsNoter(r: Pick<RenduSujet, 'admisEnPlus'>, t: Pick<Terrain, 'donnees'>, id: string): OptionsNoter {
  const plus = r.admisEnPlus(id);
  const table = plus ? acceptesEnPlus(t.donnees, id, plus.zones, plus.sorte) : null;
  return { acceptes: table ?? true };
}
