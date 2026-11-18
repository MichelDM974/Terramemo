// Vue « Carte » : explorer, l'accueil. Toucher une zone la met en accent et
// affiche son nom ; un lieu choisi dans la recherche de l'en-tête (recherche.ts)
// y est montré : la carte vole jusqu'à lui (une capitale : son pays, et un
// anneau à la ville). Une commune ouvre la carte de l'île
// (chargée au premier choix), où l'on explore de même ; « Monde » ramène au monde.
// La carte de la mémoire (J1a, étude § 7) : les teintes du terrain montré,
// posées ici et retirées en partant (aucune autre vue ne les voit), sa légende
// à part et « Vu 4 fois · revient dans 5 j » sous la zone touchée. Le choix du
// sujet (étude J2 § 6.4, D47 a) en tête de la légende, seulement quand le
// terrain a plusieurs sujets jouables ; avec « Mers », la couche marine se
// charge, posée sur la carte, et ses zones sont teintées (les pays neutres) ;
// les pastilles des micro-États y sont cachées (choix de l'utilisateur du
// 12/11 : ≈ 100 disques gris couvraient les Caraïbes et la Méditerranée), un
// micro-État ne s'y touche que par son tracé. Elles reviennent avec un autre
// sujet et en partant. Une question de mer les cache aussi (décision du
// 16/11/2026, pastillesPour de commun.ts), mais toute partie les rend en
// sortant : la carte arrive ici avec elles, l'état gardé (sansPastilles) dit
// vrai.
//
// Toucher l'eau du monde donne le nom de la mer (D45 a) : la couche légère
// seule (mers-leger.topo.json, mers.json, mers.fr.json : ≈ 25 Ko), lue au
// premier toucher en mer seulement, jamais au premier affichage ni pour un
// toucher sur un pays ; le nom suit le chargement. La couche fine sert si
// elle est déjà lue. La mer touchée s'allume en bleu comme un pays (choix de
// l'utilisateur du 14/11/2026, qui remplace « rien d'autre à l'écran ») : la
// couche fine posée sur la carte à ce premier toucher, puis la zone allumée.
// Aucune frontière entre mers, aucune teinte (sauf la mémoire des mers choisie).
// Une mer choisie dans la recherche : la couche fine posée, son emprise
// cadrée, la zone allumée (zonesAllumees).
//
// La fiche d'un lieu (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 4.1 à § 4.8 ; lot F1) : la barre du bas devient un bouton, en trois lignes
// (le nom, puis le statut et « par sa pastille » ; la ligne de faits,
// « Tokyo » ; la ligne de la mémoire), un chevron « ⌃ » quand le lieu a une
// fiche, « Monde » à côté, hors du bouton, et une région aria-live cachée à
// l'œil (un bouton dans une région vivante serait annoncé en entier à chaque
// toucher). La toucher, ou la glisser vers le haut, ouvre la fiche
// (src/vues/fiche.ts, un morceau à part) : une entrée d'historique posée par
// navigation.ts (OptionsFiche.historique), que le routeur rend ici
// (surFiche). Les données se chargent au premier toucher d'un lieu, après la
// réponse au toucher (sa mesure se ferme avant), jamais au premier affichage
// (§ 6.1). Ni fiche, ni faits, ni chevron tant qu'une partie de Toucher attend
// d'être reprise (OptionsFiche.autorisee, § 4.8). Lot F4 : une mer a sa fiche ;
// ses fichiers (fiches-mers*.json) partent au premier toucher en mer, avec la
// couche légère, et sa barre dit « océan Atlantique · 2,5 millions de km² ».
// Lot F5 : une commune de l'île a sa fiche ; ses fichiers (reunion/fiches*.json)
// partent au premier toucher sur l'île, et sa barre dit « 85 000 hab. » ; ses
// voisines s'ouvrent sur l'île (entrées d'historique au terrain « reunion »).
import type { DonneesCapitales } from '../map/capitales';
import type { DonneesDrapeaux } from '../map/drapeaux';
import { versEcran, versLonLat } from '../map/geo';
import { chargerInfosMers, chargerMersLegeres, estIdMer, mersPourNommer, nomsMersCharges, oceansDeMer, type InfosMers } from '../map/mers';
import { NB_SEAUX } from '../map/teintes';
import { estDomaine, type Domaine } from '../srs/fiches';
import { tailleEcranPx } from '../map/pastilles';
import { pickMer, type ResultatPick, type Via } from '../map/pick';
import type { Lieu, NomTerrain, Pays } from '../map/types';
import type { DonneesFichesCommunes, DonneesFichesMers, DonneesFichesMonde, DrapeauxTerritoires } from '../fiches/donnees';
import { fmtHabitantsCourt, fmtSuperficieMer } from '../fiches/format';
import { LIGNES_RELUES, type LigneRelue } from '../fiches/relues';
import { sorteDeLieu, type SorteLieu } from '../fiches/sorte';
import type { EntreeFiche, LieuFiche } from '../navigation';
import type { Terrain } from '../terrains';
import type { CarteMemoire } from './carte-memoire';
import { ANNEAU_SOUS_PX, anneauZone, creer, LIBELLE_STATUT, merPosee, mersPosees, poserMers, type ContexteVue, type Vue } from './commun';
import type { Feuille } from './fiche';
import { rendu, SUJET_CARTE } from './sujets';
import { textes } from './textes';

const C = textes.carte;
const M = textes.memoire;

/** Le nom d'un sujet dans le choix de la légende : celui de Jouer, court s'il en a un (« Pays », « Communes », « Mers »). */
const nomSujet = (d: Domaine): string => {
  const s = (textes.jouer.sujets as Partial<Record<string, { nom: string; court?: string }>>)[d];
  return s?.court ?? s?.nom ?? d;
};

export interface VueExplorer extends Vue {
  /**
   * Montre ce lieu (recherche) : son terrain, la zone en accent, la carte qui
   * vole jusqu'à elle ; `point` : un anneau en plus à ce point (une capitale,
   * dans son pays, D53 c).
   */
  montrerLieu(terrain: NomTerrain, id: string, point?: [number, number]): void;
  /** Teintes, légende et ligne de la zone touchée relues (mémoire chargée, réglage changé) ; sans effet hors de l'accueil. */
  rafraichir(): void;
  /** Un avis du démarrage (une partie du quiz laissée en cours a compté) : sous « Touche un pays », jusqu'au premier toucher ; montré une fois. */
  avis(texte: string): void;
  /**
   * La fiche de l'entrée d'historique affichée (le routeur, après activer()) :
   * l'ouvre (son lieu montré s'il ne l'est pas : un voisin, un retour), ou la
   * ferme (null). Sans effet hors de l'accueil.
   */
  surFiche(f: EntreeFiche | null): void;
}

/** Le morceau de la fiche (src/vues/fiche.ts), chargé à part. */
export type ModuleFiche = typeof import('./fiche');

/** La fiche d'un lieu (#34) : ses données et son historique. Sans elles, la barre reste celle d'avant (pas de chevron). */
export interface OptionsFiche {
  /** Les fiches du monde (chargerFichesMonde), lues au premier toucher d'un lieu. */
  fiches(): Promise<DonneesFichesMonde>;
  /** Les capitales (chargerCapitales) : la ligne de faits d'un pays. */
  capitales(): Promise<DonneesCapitales>;
  /** Le manifeste des drapeaux (chargerDrapeaux), à l'ouverture d'une fiche de pays. */
  drapeaux(): Promise<DonneesDrapeaux>;
  /**
   * Les drapeaux des territoires (chargerDrapeauxTerritoires, lot F3), à l'ouverture d'une fiche
   * de territoire seulement ; sans eux, la place grise du drapeau reste.
   */
  drapeauxTerritoires?(): Promise<DrapeauxTerritoires>;
  /**
   * Les fiches des mers (chargerFichesMers, lot F4), lues au premier toucher en mer, avec la couche
   * légère ; sans elles, une mer n'a pas de fiche (pas de chevron).
   */
  fichesMers?(): Promise<DonneesFichesMers>;
  /**
   * Les fiches des communes de La Réunion (chargerFichesCommunes, lot F5), lues au premier toucher sur
   * l'île ; sans elles, une commune n'a pas de fiche (pas de chevron).
   */
  fichesCommunes?(): Promise<DonneesFichesCommunes>;
  /** Les lignes relues (absent : LIGNES_RELUES ; les tests passent les deux états). */
  relues?: Readonly<Record<LigneRelue, boolean>>;
  /** Le morceau de la fiche (import('./fiche')). */
  module(): Promise<ModuleFiche>;
  /**
   * L'historique (main.ts : navigation.ts, § 4.4) ; sans lui, une pile dans la
   * vue, qui rend chaque fiche aussitôt (les tests de la vue).
   */
  historique?: { pousser(l: LieuFiche): void; quitter(): void; retour(): void };
  /**
   * Faux pendant une partie : une barre de partie visible ou une partie de
   * Toucher en suspens (ficheAutorisee de main.ts, § 4.8). Ni faits, ni
   * chevron, ni fiche alors.
   */
  autorisee?(): boolean;
  /** La popup ⚙ ouverte : Échap ne ferme qu'elle (son écouteur, main.ts), la fiche reste. */
  reglagesOuverts?(): boolean;
}

export interface OptionsExplorer {
  /** La carte de la mémoire (sans elle, ni teinte ni légende). */
  memoire?: CarteMemoire;
  /** La fiche d'un lieu ; sans elle, pas de fiche (les tests d'avant). */
  fiche?: OptionsFiche;
}

/** Les sortes de lieux qui ont une fiche : les entités du monde (lot F1), les mers (lot F4), les communes (lot F5). */
const SORTES_FICHE: ReadonlySet<SorteLieu> = new Set(['pays', 'territoire', 'zone', 'continent', 'mer', 'commune']);
/** Seuil du glissé vers le haut, commencé sur la barre, qui ouvre la fiche (§ 4.3). */
export const GLISSE_OUVRIR_PX = 24;

export function vueExplorer(ctx: ContexteVue, o: OptionsExplorer = {}): VueExplorer {
  const F = o.fiche;
  const nom = creer('strong', { class: 'barre-nom' });
  const detail = creer('span', { class: 'barre-detail' });
  const faits = creer('span', { class: 'barre-faits' });
  const memoireLigne = creer('span', { class: 'barre-memoire' });
  const chevron = creer('span', { class: 'barre-chevron', 'aria-hidden': 'true' }, '⌃');
  chevron.hidden = true;
  // Le drapeau d'un pays qui a une fiche, à gauche du texte : décoratif (le nom est dit à côté).
  const drapeauBarre = creer('img', { class: 'drapeau barre-drapeau', alt: '', 'aria-hidden': 'true', draggable: 'false' }) as HTMLImageElement;
  drapeauBarre.hidden = true;
  drapeauBarre.addEventListener('load', () => drapeauBarre.classList.add('charge'));
  const bouton = creer(
    'button',
    // aria-expanded et aria-controls seulement quand il y a une fiche à ouvrir (poserAria) : la barre ne promet rien d'autre (§ 4.1).
    { type: 'button', class: 'barre-fiche', id: 'barre-fiche' },
    drapeauBarre,
    creer('span', { class: 'barre-ligne' }, nom, ' ', detail),
    faits,
    memoireLigne,
    chevron,
  );
  const monde = creer('button', { type: 'button', class: 'secondary barre-monde', id: 'carte-monde', title: C.monde_titre }, C.monde);
  // Ce que la barre dit, pour les lecteurs d'écran : hors du bouton (§ 4.1).
  const annonce = creer('span', { class: 'barre-annonce', 'aria-live': 'polite' });
  const barre = creer('div', { class: 'carte-barre', id: 'barre-carte' }, bouton, monde, annonce);
  barre.hidden = true;
  // La légende de la carte de la mémoire, à elle (#barre-carte est au pays touché) : jamais vu, l'échelle des seaux, les maîtrisés.
  const compteMaitrises = creer('span', { class: 'legende-compte' });
  // Le choix du sujet : dans la légende seulement à partir de deux sujets jouables (sinon rien ne change à l'écran).
  const choixSujet = creer('select', { class: 'legende-sujet', id: 'legende-sujet', 'aria-label': M.sujet });
  // « Jamais vu » : la couleur d'une zone jamais vue du sujet montré, la terre neutre (un pays, une commune), ou l'eau
  // pour les mers (une mer jamais vue garde le fond : legende-jamais-mer, carte.css).
  const caseJamais = creer('span', { class: 'legende-case legende-jamais', 'aria-hidden': 'true' });
  const echelle = creer('span', { class: 'legende-echelle', 'aria-hidden': 'true' }, ...Array.from({ length: NB_SEAUX }, (_, k) => creer('span', { class: `legende-case legende-s${k}` })));
  const legende = creer('div', { class: 'legende-memoire', id: 'legende-memoire', role: 'note', 'aria-label': M.legende });
  /** La légende, avec le choix du sujet en tête s'il y en a plusieurs. */
  function poserLegende(sujets: readonly Domaine[]): void {
    legende.replaceChildren(
      ...(sujets.length ? [choixSujet, ' · '] : []),
      // La case après son mot, comme l'échelle après « faible » : en tête de ligne, elle passait pour une case à cocher.
      M.jamais_vu,
      caseJamais,
      ' · ',
      M.faible,
      echelle,
      M.maitrise,
      ' · ',
      compteMaitrises,
    );
  }
  poserLegende([]);
  legende.hidden = true;
  ctx.zone.append(barre, legende);

  /** Le terrain exploré : le monde, ou l'île après le choix d'une commune. */
  let t: Terrain = ctx.terrains.monde;
  /** Change à chaque lieu demandé ou sortie : un chargement de l'île arrivé après ne montre rien. */
  let jeton = 0;
  /** Change à chaque toucher : le nom d'une mer arrivé après un autre toucher ne s'affiche pas. */
  let touches = 0;
  /** La vue est affichée (entre activer et desactiver). */
  let active = false;
  /** Les terrains dont la carte porte les teintes de la mémoire : à effacer en partant. */
  const teintes = new Set<Terrain>();
  /** Les pastilles du monde cachées par la mémoire des mers : à rendre en partant. */
  let sansPastilles = false;
  /** Les pastilles du monde cachées ou rendues ; appelé seulement au changement (sans mémoire, jamais). */
  function cacherPastilles(oui: boolean): void {
    if (oui === sansPastilles) return;
    sansPastilles = oui;
    ctx.terrains.monde.carte.cacherPastilles(oui);
  }

  /** Les teintes de la mémoire sur le terrain exploré et la légende, ou rien (réglage coupé, mémoire en lecture). */
  function teinter(): void {
    const m = o.memoire;
    // Sans mémoire (tests, ?teintes=demo), la vue ne touche pas aux teintes.
    if (!m) return;
    const seaux = active ? m.teintes(t.nom) : null;
    for (const x of teintes) if (x !== t) x.carte.teinter(null);
    teintes.clear();
    if (seaux) {
      t.carte.teinter(seaux);
      teintes.add(t);
      // La mémoire des mers : la couche marine posée sur la carte (une fois), puis ses teintes relues.
      if (m.sujet(t.nom) === 'mers' && t === ctx.terrains.monde) {
        const j = jeton;
        poserMers(ctx)?.then(
          () => {
            if (j === jeton && active) teinter();
          },
          // Hors ligne : le dire à la place du compte (rien n'est teinté) ; le prochain teinter() réessaie.
          () => {
            if (j === jeton && active) compteMaitrises.textContent = textes.toucher.echec_sujet;
          },
        );
      }
    } else t.carte.teinter(null);
    // La carte « Mers » : l'eau teintée et les terres neutres, sans les pastilles des micro-États.
    cacherPastilles(!!seaux && t === ctx.terrains.monde && m.sujet(t.nom) === 'mers');
    const compte = seaux ? m.maitrises(t.nom, t.jouables.length) : null;
    compteMaitrises.textContent = compte ?? '';
    const sujets = compte ? m.sujets(t.nom) : [];
    if (sujets.length) choixSujet.replaceChildren(...sujets.map((d) => creer('option', { value: d }, nomSujet(d))));
    choixSujet.value = m.sujet(t.nom) ?? '';
    caseJamais.classList.toggle('legende-jamais-mer', m.sujet(t.nom) === 'mers');
    poserLegende(sujets);
    legende.hidden = !compte;
  }

  choixSujet.addEventListener('change', () => {
    const d = choixSujet.value;
    if (!o.memoire || !estDomaine(d)) return;
    o.memoire.choisir(t.nom, d);
    teinter();
    const id = barre.dataset.id;
    if (id) afficher(id, viaAffiche);
  });

  function effacerTeintes(): void {
    for (const x of teintes) x.carte.teinter(null);
    teintes.clear();
    cacherPastilles(false);
    legende.hidden = true;
  }

  /** Barre vide : « Touche un pays » (ou une commune sur l'île), aucune zone marquée. */
  function vider(): void {
    t.carte.effacerMarques();
    nom.textContent = t.nom === 'monde' ? C.touche : C.touche_ile;
    detail.textContent = '';
    sansLieu();
    monde.hidden = t.nom === 'monde';
  }

  /** La barre sans lieu (« Touche un pays », « Mer » sans nom, un chargement) : ni faits, ni mémoire, ni chevron. */
  function sansLieu(): void {
    delete barre.dataset.id;
    memoireLigne.textContent = '';
    barre.classList.remove('barre-lieu');
    barre.classList.remove('barre-avec-memoire');
    poserFaits(false);
  }

  /** Ce que la barre dit, dans la région vivante. */
  function annoncer(): void {
    annonce.textContent = [nom.textContent, detail.textContent, faits.textContent, memoireLigne.textContent].filter(Boolean).join(' · ');
  }

  /** L'avis du démarrage pas encore montré (avis()) : à la prochaine arrivée sur l'accueil. */
  let avisAMontrer: string | null = null;

  /** Par quoi la zone affichée a été touchée (la ligne relue par rafraichir()). */
  let viaAffiche: Via | null = null;
  function afficher(id: string, via: Via | null): void {
    viaAffiche = via;
    const e = t.donnees.entites.find((en) => en.pays.id === id);
    const mer = estIdMer(id);
    // Le nom par le sujet qui nomme les zones de ce terrain (sujets.ts) : les pays, les communes ; une mer par mers.fr.json.
    nom.textContent = mer ? (nomsMersCharges()?.[id] ?? C.mer) : rendu(SUJET_CARTE[t.nom], t.donnees).lieu(id);
    const statut = e ? LIBELLE_STATUT[e.pays.statut] : '';
    detail.textContent = [statut, via === 'pastille' ? C.par_pastille : via === 'proche' ? C.au_plus_pres : ''].filter(Boolean).join(' · ');
    // La ligne de la mémoire, à part (§ 4.1) ; sa place réservée tant que le réglage est actif, même vide (un territoire).
    memoireLigne.textContent = o.memoire?.details(t.nom, id, mer || e?.pays.statut === 'jouable')?.join(' · ') ?? '';
    barre.dataset.id = id;
    // La hauteur du cas complet dès qu'un lieu est affiché : la ligne de faits arrive dans une place déjà là (§ 4.1).
    barre.classList.add('barre-lieu');
    barre.classList.toggle('barre-avec-memoire', !!o.memoire?.actif());
    poserFaits(false);
  }

  // --- Fiche d'un lieu (#34) ---

  /** Le lieu de la barre a-t-il une fiche à ouvrir (données lues, partie hors de cause) ? */
  let ficheDispo = false;
  /** La fiche ouverte (ou en train de l'être), telle que l'historique la dit. */
  let ficheOuverte: EntreeFiche | null = null;
  /** Change à chaque fiche demandée ou fermée : un chargement arrivé après ne montre rien. */
  let jetonFiche = 0;
  let feuille: Feuille | null = null;
  /** Sans historique (tests de la vue) : les fiches empilées ici. */
  const pileLocale: LieuFiche[] = [];
  const historique = F?.historique ?? {
    pousser(l: LieuFiche) {
      pileLocale.push(l);
      surFiche({ ...l, rang: pileLocale.length });
    },
    quitter() {
      pileLocale.length = 0;
      surFiche(null);
    },
    retour() {
      pileLocale.pop();
      const l = pileLocale.at(-1);
      surFiche(l ? { ...l, rang: pileLocale.length } : null);
    },
  };
  const autorisee = (): boolean => !!F && (F.autorisee?.() ?? true);
  /** La sorte du lieu de la barre, s'il a une fiche à ce lot. */
  function sorteFiche(id: string): SorteLieu | null {
    // Une commune (lot F5) : une entité de l'île, si ses fiches sont branchées.
    if (t.nom === 'reunion') return F?.fichesCommunes && t.donnees.entites.some((en) => en.pays.id === id) ? 'commune' : null;
    if (t.nom !== 'monde') return null;
    if (estIdMer(id)) return F?.fichesMers ? 'mer' : null;
    const e = t.donnees.entites.find((en) => en.pays.id === id);
    const s = sorteDeLieu(id, t.nom, e?.pays.statut);
    return s && SORTES_FICHE.has(s) && e ? s : null;
  }
  /** Les fiches des mers (lot F4), une fois lues ; et les zones (mers.json) que la fiche d'une mer lit. */
  let mersLues: DonneesFichesMers | null = null;
  let mersEnCours: Promise<DonneesFichesMers> | null = null;
  function chargerFichesMersBarre(): Promise<DonneesFichesMers> {
    if (!F?.fichesMers) return Promise.reject(new Error('fiche : pas de fiches des mers'));
    if (mersLues) return Promise.resolve(mersLues);
    mersEnCours ??= F.fichesMers().then(
      (m) => {
        mersEnCours = null;
        return (mersLues = m);
      },
      (e: unknown) => {
        mersEnCours = null;
        throw e;
      },
    );
    return mersEnCours;
  }
  let infosMers: InfosMers | null = null;
  /** Les zones et les noms des mers : ceux de la couche déjà lue, sinon mers.json et mers.fr.json (lus une fois, map/mers.ts). */
  function chargerInfosMersFiche(): Promise<InfosMers> {
    const deja = infosMers ?? mersPourNommer();
    if (deja) return Promise.resolve((infosMers = deja));
    return chargerInfosMers().then((i) => (infosMers = i));
  }
  /**
   * Au premier toucher en mer (§ 6.1) : les fiches des mers demandées avec la couche légère ; à leur
   * arrivée, la barre qui montre encore cette mer reçoit ses faits et son chevron.
   */
  function demanderFichesMers(): void {
    if (mersLues || !F?.fichesMers || !active || !autorisee()) return;
    const [j, k] = [jeton, touches];
    chargerFichesMersBarre().then(
      () => {
        const id = barre.dataset.id;
        if (j === jeton && k === touches && id && estIdMer(id)) poserFaits(false);
        // Le morceau de la fiche, demandé d'avance comme pour un pays (chargerDonnees) : là quand on touchera la barre.
        if (!moduleCharge) {
          F.module().then(
            (m) => {
              moduleCharge = m;
              auRepos(() => m.prechaufferFormats());
            },
            () => undefined,
          );
        }
      },
      () => undefined,
    );
  }
  /** Les fiches des communes (lot F5), une fois lues. */
  let communesLues: DonneesFichesCommunes | null = null;
  let communesEnCours: Promise<DonneesFichesCommunes> | null = null;
  function chargerFichesCommunesBarre(): Promise<DonneesFichesCommunes> {
    if (!F?.fichesCommunes) return Promise.reject(new Error('fiche : pas de fiches des communes'));
    if (communesLues) return Promise.resolve(communesLues);
    communesEnCours ??= F.fichesCommunes().then(
      (c) => {
        communesEnCours = null;
        return (communesLues = c);
      },
      (e: unknown) => {
        communesEnCours = null;
        throw e;
      },
    );
    return communesEnCours;
  }
  /**
   * Au premier toucher sur l'île (§ 6.1) : les fiches des communes demandées ; à leur arrivée, la barre qui montre
   * encore cette commune reçoit sa ligne de faits et son chevron, et le morceau de la fiche est demandé d'avance.
   */
  function demanderFichesCommunes(): void {
    if (communesLues || !F?.fichesCommunes || !active || !autorisee()) return;
    const [j, k] = [jeton, touches];
    chargerFichesCommunesBarre().then(
      () => {
        if (j === jeton && k === touches && barre.dataset.id && t.nom === 'reunion') poserFaits(false);
        if (!moduleCharge) {
          F.module().then(
            (m) => {
              moduleCharge = m;
              auRepos(() => m.prechaufferFormats());
            },
            () => undefined,
          );
        }
      },
      () => undefined,
    );
  }
  /** Les données de la barre, si elles sont lues : celles des fiches et, pour un pays, les capitales. */
  let lues: { fiches: DonneesFichesMonde; capitales: DonneesCapitales | null } | null = null;
  /** Le manifeste des drapeaux : demandé au premier pays touché qui a une fiche (le drapeau de la barre), relu par la fiche. */
  let drapeauxLus: DonneesDrapeaux | null = null;
  let drapeauxEnCours: Promise<unknown> | null = null;
  function chargerDrapeauxBarre(): Promise<unknown> {
    if (!F) return Promise.reject(new Error('fiche : pas de données'));
    drapeauxEnCours ??= F.drapeaux().then(
      (d) => (drapeauxLus = d),
      (e: unknown) => {
        drapeauxEnCours = null;
        throw e;
      },
    );
    return drapeauxEnCours;
  }
  /** Le drapeau de la barre : celui du pays `id` s'il est lu, sinon caché (et la barre garde sa mise en page sans drapeau). */
  function poserDrapeauBarre(id: string | null): void {
    const src = id ? drapeauxLus?.parPays.get(id)?.montre : undefined;
    if (src) {
      if (drapeauBarre.getAttribute('src') !== src) {
        drapeauBarre.classList.remove('charge');
        drapeauBarre.setAttribute('src', src);
      }
      drapeauBarre.hidden = false;
    } else drapeauBarre.hidden = true;
    bouton.classList.toggle('barre-avec-drapeau', !!src);
  }
  /** Le morceau de la fiche, une fois chargé : la zone de chaque pays touché préparée au repos. */
  let moduleCharge: ModuleFiche | null = null;
  /** `f` au repos (requestIdleCallback ; à défaut, un peu plus tard) : rien de lourd pendant le toucher. */
  function auRepos(f: () => void): void {
    const repos = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => unknown }).requestIdleCallback;
    if (repos) repos(f, { timeout: 2000 });
    else setTimeout(f, 50);
  }
  /**
   * Le formateur de la zone du pays de la barre (sa ligne « Heure à … ») créé au repos : l'ouverture de sa
   * fiche n'en crée aucun (décision « Fluidité de la fiche d'un lieu »). Gardé par zone (format.ts) : une
   * seconde fois ne coûte rien.
   */
  function prechaufferZoneBarre(): void {
    const id = barre.dataset.id;
    const zone = id ? lues?.fiches.lieux.get(id)?.heure?.zone : undefined;
    if (zone && moduleCharge) moduleCharge.prechaufferZone(zone);
  }

  /** Le chargement en cours (un seul à la fois ; un échec n'est pas gardé : le toucher suivant réessaie). */
  let enChargement: Promise<unknown> | null = null;
  function chargerDonnees(): Promise<unknown> {
    if (!F) return Promise.reject(new Error('fiche : pas de données'));
    if (enChargement) return enChargement;
    const p = Promise.all([F.fiches(), F.capitales().catch(() => null)]).then(([fiches, capitales]) => {
      lues = { fiches, capitales };
      // Le morceau de la fiche, demandé d'avance : il sera là quand on touchera la barre. Ses formateurs (Intl)
      // créés au repos : la première fiche ne paie pas leur création (22 ms sur l'A37) pendant sa montée. Puis
      // celui de la zone du pays de la barre (prechaufferZone), et de chaque pays touché ensuite.
      F.module().then(
        (m) => {
          moduleCharge = m;
          auRepos(() => {
            m.prechaufferFormats();
            prechaufferZoneBarre();
          });
        },
        () => undefined,
      );
    });
    enChargement = p;
    p.then(
      () => (enChargement = null),
      () => (enChargement = null),
    );
    return p;
  }

  /**
   * La ligne de faits et le chevron du lieu de la barre : remplis si les
   * données sont lues, sinon rien (la barre d'aujourd'hui) ; `charger` : les
   * demander s'il le faut, et les poser à leur arrivée si la barre montre
   * encore ce lieu (un second toucher avant l'arrivée : rien du premier).
   */
  function poserFaits(charger: boolean, chargerDrapeau = charger): void {
    const id = barre.dataset.id;
    ficheDispo = false;
    faits.textContent = '';
    chevron.hidden = true;
    let drapeau: string | null = null;
    const sorte = id && active && autorisee() ? sorteFiche(id) : null;
    if (id && sorte === 'mer') {
      // Une mer (lot F4, § 4.1) : « océan Atlantique · 2,5 millions de km² » ; un océan, sa superficie ; la
      // superficie une fois relue. Ses fiches sont demandées au premier toucher en mer (demanderFichesMers).
      const f = mersLues?.get(id);
      if (f) {
        ficheDispo = true;
        chevron.hidden = false;
        const infos = infosMers ?? mersPourNommer();
        const oceans = infos ? oceansDeMer(id, infos.zones).map((o) => infos.noms[o] ?? o) : [];
        const sup = f.superficie && (F!.relues ?? LIGNES_RELUES).superficie_mers ? fmtSuperficieMer(f.superficie.km2, false) : '';
        faits.textContent = [oceans.join(', '), sup].filter(Boolean).join(' · ');
      } else if (charger) demanderFichesMers();
    } else if (id && sorte === 'commune') {
      // Une commune (lot F5, § 4.1) : « 85 000 hab. ». Ses fiches sont demandées au premier toucher sur l'île.
      const f = communesLues?.get(id);
      if (f) {
        ficheDispo = true;
        chevron.hidden = false;
        faits.textContent = fmtHabitantsCourt(f.habitants.n);
      } else if (charger) demanderFichesCommunes();
    } else if (id && sorte) {
      if (lues?.fiches.lieux.has(id)) {
        ficheDispo = true;
        chevron.hidden = false;
        // « Nuuk · 56 800 hab. » (§ 4.1, lot F3) : la capitale une fois relue, sinon les habitants seuls ;
        // rien pour une zone contestée ni pour l'Antarctique.
        if (sorte === 'territoire') {
          const f = lues.fiches.lieux.get(id)!;
          const h = f.habitants;
          const capitale = (F!.relues ?? LIGNES_RELUES).capitale_territoires ? f.capitale : undefined;
          faits.textContent = [capitale, h ? (h.annee === null ? textes.fiche.aucun_habitant : fmtHabitantsCourt(h.n)) : ''].filter(Boolean).join(' · ');
          if (moduleCharge) auRepos(prechaufferZoneBarre);
        }
        // « Tokyo · 123 millions d'hab. » (§ 4.1) ; plusieurs capitales : « La Paz, Sucre · … ».
        if (sorte === 'pays') {
          const h = lues.fiches.lieux.get(id)?.habitants;
          faits.textContent = [lues.capitales?.parPays.get(id)?.justes.map((c) => c.nom).join(', '), h ? fmtHabitantsCourt(h.n) : ''].filter(Boolean).join(' · ');
          drapeau = id;
          if (moduleCharge) auRepos(prechaufferZoneBarre);
          if (chargerDrapeau && !drapeauxLus) {
            const [j, k] = [jeton, touches];
            chargerDrapeauxBarre().then(
              () => {
                if (j === jeton && k === touches && barre.dataset.id === id) poserDrapeauBarre(id);
              },
              () => undefined,
            );
          }
        }
      }
      // Rien de lu, ou les capitales d'un pays manquées (hors ligne au premier toucher) : redemandées.
      const manque = !lues ? chargerDonnees : sorte === 'pays' && !lues.capitales ? () => F!.capitales().then((c) => lues && (lues.capitales = c)) : null;
      if (charger && manque) {
        const [j, k] = [jeton, touches];
        manque().then(
          () => {
            // Le drapeau demandé à son tour : le premier toucher le montre aussi.
            if (j === jeton && k === touches && barre.dataset.id === id) poserFaits(false, true);
          },
          () => undefined,
        );
      }
    }
    bouton.classList.toggle('barre-avec-fiche', ficheDispo);
    poserDrapeauBarre(drapeau);
    poserAria();
    annoncer();
  }

  /**
   * Le bouton de la barre dit qu'il ouvre la fiche (aria-expanded,
   * aria-controls) seulement s'il en a une à ouvrir, ou pendant qu'elle est
   * ouverte : « Touche un pays », une mer, des données absentes ou une partie
   * en suspens n'annoncent pas un bouton réductible qui n'ouvre rien (§ 4.1).
   */
  function poserAria(): void {
    if (ficheOuverte || ficheDispo) {
      bouton.setAttribute('aria-expanded', String(!!ficheOuverte));
      bouton.setAttribute('aria-controls', 'fiche-lieu');
    } else {
      bouton.removeAttribute('aria-expanded');
      bouton.removeAttribute('aria-controls');
    }
  }

  /** Ouvre la fiche du lieu de la barre (toucher, Entrée, glissé vers le haut) : une entrée d'historique. */
  function ouvrir(): void {
    const id = barre.dataset.id;
    if (!ficheDispo || !id || ficheOuverte) return;
    historique.pousser({ terrain: t.nom, id });
  }

  /**
   * Le vol d'un voisin, ou d'une fiche rendue par un retour, remis à deux images après la fiche (surFiche) : la
   * fiche faite et le départ du vol dans la même image tardaient de 50 ms sur l'A37 (S41, S55, 16/11). Le vol se
   * fait sous la fiche (D61 c) : deux images de plus ne se voient pas. Toute fiche nouvelle l'annule (elle a le
   * sien, ou montre le lieu de la barre) ; la fermeture le fait tout de suite : la carte reste sur le dernier lieu vu.
   */
  let volEnAttente: (() => void) | null = null;
  function lancerVolEnAttente(): void {
    const vol = volEnAttente;
    volEnAttente = null;
    if (vol && active) vol();
  }

  /** La fiche fermée sur place (sans toucher à l'historique) ; `focus` : rendu à la barre. */
  function fermerFiche(focus: boolean): void {
    jetonFiche++;
    if (!ficheOuverte) return;
    lancerVolEnAttente();
    ficheOuverte = null;
    feuille?.fermer();
    barre.removeAttribute('inert');
    poserAria();
    delete document.body.dataset.fiche;
    if (!focus) return;
    bouton.focus();
    // Un retour du navigateur (ou d'Android) arrive sur l'adresse #carte, et l'hôte de la carte porte l'id
    // « carte » : après la mise en page, Chromium y applique l'ancre et, l'hôte ne prenant pas le focus, le
    // retire de la page (vu au pilote ui_fiche le 16/11). Le focus revient à la barre (§ 4.11), seulement s'il
    // est tombé sur body : jamais repris à ce que l'utilisateur a touché entre-temps.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (active && !ficheOuverte && document.activeElement === document.body) bouton.focus();
        }),
      );
    }
  }

  /** Le morceau de la fiche, une fois chargé (rafraichir() refait la fiche ouverte). */
  let moduleFiche: ModuleFiche | null = null;
  /** Les drapeaux des territoires, une fois lus (à la première fiche de territoire). */
  let drapeauxTerritoiresLus: DrapeauxTerritoires | null = null;
  function composer(m: ModuleFiche, l: LieuFiche) {
    moduleFiche = m;
    const id = l.id;
    const mer = estIdMer(id);
    // Une commune (lot F5) : les données de l'île, quel que soit le terrain montré (le vol vers elle peut attendre).
    const ile = l.terrain === 'reunion' ? ctx.terrains.deja('reunion') : null;
    if (l.terrain === 'reunion') {
      if (!communesLues || !ile) return null;
      const ri = rendu(SUJET_CARTE.reunion, ile.donnees);
      return m.composerFiche(id, {
        entites: ile.donnees.entites.map((e) => e.pays as Pays),
        nom: (x) => ri.lieu(x),
        fiches: { lieux: new Map(), sousRegions: {} },
        communes: communesLues,
        capitales: null,
        drapeaux: null,
        memoire: (x, jouable) => o.memoire?.details('reunion', x, jouable) ?? null,
        ...(F?.relues ? { relues: F.relues } : {}),
      });
    }
    if (mer ? !(mersLues && infosMers) : !lues) return null;
    const r = rendu(SUJET_CARTE.monde, ctx.terrains.monde.donnees);
    return m.composerFiche(id, {
      entites: ctx.terrains.monde.donnees.entites.map((e) => e.pays as Pays),
      nom: (x) => r.lieu(x),
      // Une mer n'attend pas les fiches du monde : ses riverains ne disent que leur nom.
      fiches: lues?.fiches ?? { lieux: new Map(), sousRegions: {} },
      mers: mer && mersLues && infosMers ? { fiches: mersLues, zones: infosMers.zones, noms: infosMers.noms } : null,
      capitales: lues?.capitales ?? null,
      drapeaux: drapeauxLus,
      drapeauxTerritoires: drapeauxTerritoiresLus,
      memoire: (x, jouable) => o.memoire?.details('monde', x, jouable) ?? null,
      ...(F?.relues ? { relues: F.relues } : {}),
    });
  }

  /**
   * Rend la fiche de l'entrée d'historique : son lieu montré s'il ne l'est
   * pas (un voisin, un retour : la carte vole sous la fiche, D61 c), puis la
   * feuille remplie, le focus au titre. null : fermée.
   */
  function surFiche(f: EntreeFiche | null): void {
    if (!f) return fermerFiche(true);
    if (!F || !active || (f.terrain !== 'monde' && f.terrain !== 'reunion')) return;
    // Une partie de Toucher en suspens (§ 4.8, garde 3) : pas de fiche, et son entrée d'historique rendue, sinon le
    // retour suivant ne changerait rien à l'écran (§ 7 : aucune entrée de fiche orpheline).
    if (!autorisee()) return void historique.quitter();
    if (ficheOuverte && ficheOuverte.id === f.id && ficheOuverte.rang === f.rang) return;
    ficheOuverte = f;
    const j = ++jetonFiche;
    barre.setAttribute('inert', '');
    poserAria();
    document.body.dataset.fiche = 'ouverte';
    // Le lieu sur la carte : un voisin, ou une fiche rendue par un retour (aller() vide la barre, la fiche reste ouverte),
    // deux images après la fiche quand la page en a (volEnAttente).
    volEnAttente = null;
    const commune = f.terrain === 'reunion';
    if (t !== (commune ? ctx.terrains.deja('reunion') : ctx.terrains.monde) || barre.dataset.id !== f.id) {
      // Une mer (la mère, l'océan d'une mer, lot F4) : la couche fine posée d'abord, comme pour la recherche. Une commune
      // (lot F5) : l'île, chargée avec ses fiches (donnees, plus bas) si elle ne l'était pas.
      const vol = () => {
        if (commune) {
          const ile = ctx.terrains.deja('reunion');
          if (ile) return montrer(ile, f.id);
          ctx.terrains.charger('reunion').then(
            (i) => {
              if (ficheOuverte === f && active) montrer(i, f.id);
            },
            () => undefined,
          );
          return;
        }
        const p = estIdMer(f.id) ? poserMers(ctx) : null;
        if (!p) return montrer(ctx.terrains.monde, f.id);
        p.then(
          () => {
            if (ficheOuverte === f && active) montrer(ctx.terrains.monde, f.id);
          },
          () => undefined,
        );
      };
      if (typeof requestAnimationFrame === 'function') {
        volEnAttente = vol;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (volEnAttente === vol) lancerVolEnAttente();
          }),
        );
      } else vol();
    }
    const mer = estIdMer(f.id);
    const donnees = commune
      ? Promise.all([chargerFichesCommunesBarre(), ctx.terrains.charger('reunion')])
      : mer
        ? Promise.all([chargerFichesMersBarre(), chargerInfosMersFiche()])
        : lues
          ? null
          : chargerDonnees();
    Promise.all([F.module(), donnees]).then(
      ([m]) => {
        if (j !== jetonFiche || !active) return;
        const modele = composer(m, f);
        if (!modele) return void historique.quitter();
        feuille ??= m.creerFeuille(ctx.zone, {
          fermer: () => historique.quitter(),
          // Lu avant l'écouteur du document qui ferme la popup (le voile est la cible du clic) : elle est encore ouverte.
          voile: () => void (F.reglagesOuverts?.() || historique.quitter()),
          avant: () => historique.retour(),
          // Sur le terrain de la fiche ouverte : une commune voisine sur l'île, tout le reste au monde.
          voisin: (v) => historique.pousser({ terrain: ficheOuverte?.terrain ?? 'monde', id: v }),
        });
        feuille.montrer(modele, { avant: f.rang > 1, focus: true });
        // Le drapeau d'un territoire (lot F3) : son manifeste à part, à la première fiche de territoire.
        if (modele.avecDrapeau && !modele.drapeaux.length && modele.sorte === 'territoire' && F.drapeauxTerritoires) {
          F.drapeauxTerritoires().then(
            (d) => {
              drapeauxTerritoiresLus = d;
              const src = d.get(f.id);
              if (j === jetonFiche && active && src) feuille?.drapeaux([src]);
            },
            () => undefined,
          );
        }
        // Le drapeau d'un pays : le manifeste à la première fiche (§ 6.1), la place grise d'ici là.
        if (modele.avecDrapeau && !modele.drapeaux.length && modele.sorte === 'pays') {
          chargerDrapeauxBarre().then(
            () => {
              if (j === jetonFiche && active) feuille?.drapeaux(drapeauxLus?.parPays.get(f.id)?.justes ?? []);
            },
            () => undefined,
          );
        }
      },
      // Hors ligne, morceau ou données absents : la fiche ne s'ouvre pas, l'entrée d'historique est rendue.
      () => {
        if (j === jetonFiche) historique.quitter();
      },
    );
  }

  bouton.addEventListener('click', () => ouvrir());
  // Glissé vers le haut de 24 px ou plus, commencé sur la barre : la fiche (la feuille ne suit pas le doigt, § 4.3).
  let departGlisse: number | null = null;
  bouton.addEventListener('pointerdown', (e) => {
    departGlisse = (e as PointerEvent).clientY;
  });
  bouton.addEventListener('pointerup', (e) => {
    if (departGlisse !== null && departGlisse - (e as PointerEvent).clientY >= GLISSE_OUVRIR_PX) ouvrir();
    departGlisse = null;
  });
  bouton.addEventListener('pointercancel', () => {
    departGlisse = null;
  });
  // Échap fait comme « ‹ » : un pas en arrière (§ 4.3). En capture, donc avant l'écouteur de ⚙ (main.ts) : la popup
  // ouverte, Échap ne ferme qu'elle ; dans un champ (la recherche), il reste au champ.
  if (F) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !ficheOuverte || !active || F.reglagesOuverts?.()) return;
        // L'écran de connexion par-dessus (src/vues/accueil.ts) : Échap est à lui.
        const accueil = document.body.dataset.accueil;
        if (accueil === 'ouvert' || accueil === 'attente') return;
        const cible = e.target as Element | null;
        if (cible?.closest?.('input, textarea, select')) return;
        e.preventDefault();
        historique.retour();
      },
      true,
    );
  }

  function aller(terrain: Terrain): void {
    t = terrain;
    ctx.terrains.montrer(t.nom);
    teinter();
    vider();
  }

  /**
   * La zone en accent (une mer : ce qu'elle allume), la carte qui vole jusqu'à
   * elle au-dessus de la barre (une mer : son emprise), un anneau si elle
   * reste minuscule.
   */
  function montrer(terrain: Terrain, id: string, point?: [number, number]): void {
    aller(terrain);
    t.carte.marquer(id, 'choisi');
    if (point) t.carte.anneauEn(point, 'choisi');
    afficher(id, null);
    // Un lieu montré (la recherche, un voisin) compte comme un toucher : les données de la fiche demandées (§ 6.1).
    poserFaits(true);
    const carte = t.carte;
    carte.montrer(id, barre.getBoundingClientRect().top - carte.hote.getBoundingClientRect().top);
    // Jugé à l'arrivée du vol : le Vatican reste un point même au zoom de montrer().
    const e: Lieu | undefined = t.donnees.entites.find((en) => en.pays.id === id)?.pays ?? merPosee(t.donnees, id);
    const fin = carte.contexteFinal();
    if (e && tailleEcranPx(e, fin.proj.scale(), fin.t.k) < ANNEAU_SOUS_PX) anneauZone(carte, id, e, 'choisi');
  }

  /** Le toucher d'une mer nommée (pickMer) : son nom ; « Mer » si rien ne la désigne. Allumée (--mer-choisie, le bleu d'un pays touché) dès que la couche fine est posée. */
  function afficherMer(r: ResultatPick | null): void {
    if (!r || !estIdMer(r.id)) {
      nom.textContent = C.mer;
      detail.textContent = '';
      sansLieu();
      return;
    }
    if (mersPosees(ctx.donnees).length) t.carte.marquer(r.id, 'choisi');
    afficher(r.id, r.via === 'proche' ? 'proche' : null);
  }

  /**
   * Un toucher dans l'eau du monde (pick n'y désigne rien) : la mer sous le
   * doigt (D45 a), par la couche déjà là (posée, fine ou légère lue), sinon
   * la légère lue maintenant ; le point touché est gardé en [lon, lat] et
   * relu sur la carte d'alors (un geste entre-temps). Elle s'allume en bleu,
   * comme un pays touché (choix de l'utilisateur du 14/11/2026) : la couche
   * fine, seule dessinée, est posée sur la carte au premier toucher en mer
   * (une fois), et la mer s'allume à son arrivée ; le nom n'attend pas (la
   * légère, plus petite, le donne d'abord). Un autre toucher ou une sortie
   * avant l'arrivée : rien. Rend vrai si le point touché est sur le globe (de
   * l'eau) : les fiches des mers sont alors demandées, après la mesure du toucher.
   */
  function nommerMer(x: number, y: number): boolean {
    const c0 = t.carte.contexte();
    const ll = versLonLat(c0.proj, c0.t, x, y);
    const posees = mersPosees(ctx.donnees);
    const deja = posees.length ? posees : (mersPourNommer()?.mers ?? null);
    const [j, k] = [jeton, touches];
    const carte = t.carte;
    /** La mer au point touché sur la carte d'alors, parmi ces zones. */
    const merAuPoint = (mers: typeof posees): ResultatPick | null => {
      const c = carte.contexte();
      const b = ll && c.proj(ll);
      const [sx, sy] = b ? versEcran(c.t, b[0], b[1]) : [x, y];
      return pickMer({ ...c, mers }, '', sx, sy, new Set());
    };
    const encore = () => j === jeton && k === touches && active;
    if (ll && !posees.length) {
      poserMers(ctx)?.then(
        () => {
          if (encore()) afficherMer(merAuPoint(mersPosees(ctx.donnees)));
        },
        // Hors ligne : le nom reste (couche légère), sans allumage ; le toucher suivant réessaie.
        () => undefined,
      );
    }
    if (!ll || deja) {
      afficherMer(ll && deja ? pickMer({ ...c0, mers: deja }, '', x, y, new Set()) : null);
      return !!ll;
    }
    afficherMer(null);
    chargerMersLegeres().then(
      (couche) => {
        // La fine arrivée avant : elle a déjà nommé et allumé.
        if (encore() && !mersPosees(ctx.donnees).length) afficherMer(merAuPoint(couche.mers));
      },
      () => undefined,
    );
    return true;
  }

  monde.addEventListener('click', () => {
    jeton++;
    aller(ctx.terrains.monde);
  });

  return {
    activer() {
      // Le routeur vient de montrer le monde.
      jeton++;
      active = true;
      t = ctx.terrains.monde;
      barre.hidden = false;
      teinter();
      vider();
      if (avisAMontrer) [detail.textContent, avisAMontrer] = [avisAMontrer, null];
      annoncer();
    },
    desactiver() {
      jeton++;
      // La fiche vit dans la vue « carte » : une autre vue (partie, Jouer, Crédits) la ferme (§ 4.8, garde 1).
      fermerFiche(false);
      pileLocale.length = 0;
      active = false;
      barre.hidden = true;
      t.carte.effacerMarques();
      // Toute autre vue (partie, séance, épreuve, Jouer) trouve la carte sans teinte.
      effacerTeintes();
    },
    rafraichir() {
      if (!active) return;
      teinter();
      const id = barre.dataset.id;
      if (id) afficher(id, viaAffiche);
      // La fiche ouverte relit sa mémoire (mémoire chargée, réglage changé), sans reprendre le focus.
      const m = ficheOuverte && moduleFiche && feuille && !feuille.element.hidden ? composer(moduleFiche, ficheOuverte) : null;
      if (m && ficheOuverte) feuille?.montrer(m, { avant: ficheOuverte.rang > 1, focus: false });
    },
    avis(texte) {
      // La région vivante le dit aussi (§ 4.1 : elle est hors du bouton, seul annoncer() la remplit).
      if (active && !barre.dataset.id) {
        detail.textContent = texte;
        annoncer();
      } else avisAMontrer = texte;
    },
    surFiche,
    montrerLieu(terrain, id, point) {
      // La recherche montre un autre lieu : la fiche se ferme, ses entrées d'historique remontées (§ 4.2, § 4.7).
      if (ficheOuverte) {
        fermerFiche(false);
        historique.quitter();
      }
      const j = ++jeton;
      if (terrain === 'monde' && estIdMer(id)) {
        // Une mer : la couche fine posée sur la carte d'abord (une fois), son chargement dit dans la barre.
        const p = poserMers(ctx);
        if (!p) return montrer(ctx.terrains.monde, id);
        aller(ctx.terrains.monde);
        nom.textContent = '';
        detail.textContent = textes.toucher.chargement_sujet;
        annoncer();
        p.then(
          () => {
            if (j === jeton) montrer(ctx.terrains.monde, id);
          },
          () => {
            if (j !== jeton) return;
            detail.textContent = textes.toucher.echec_sujet;
            annoncer();
          },
        );
        return;
      }
      if (terrain === 'monde') return montrer(ctx.terrains.monde, id, point);
      const deja = ctx.terrains.deja(terrain);
      if (deja) return montrer(deja, id);
      // L'île au premier choix : son chargement annoncé dans la barre (sans les faits ni le chevron du lieu d'avant).
      nom.textContent = '';
      detail.textContent = textes.toucher.chargement_terrain;
      sansLieu();
      ctx.terrains.charger(terrain).then(
        (ile) => {
          if (j === jeton) montrer(ile, id);
        },
        () => {
          if (j !== jeton) return;
          detail.textContent = textes.toucher.echec_terrain;
          annoncer();
        },
      );
    },
    toucher(x, y, ev) {
      const carte = t.carte;
      // Un nouveau toucher : le nom d'une mer encore en chargement pour le précédent ne s'affichera pas.
      touches++;
      let eau = false;
      ctx.mesures.toucher(ev, x, y, () => {
        const r = carte.pick(x, y);
        carte.effacerMarques();
        if (r) {
          carte.marquer(r.id, 'choisi');
          afficher(r.id, r.via);
        } else if (t === ctx.terrains.monde) eau = nommerMer(x, y);
        else {
          nom.textContent = C.mer;
          detail.textContent = '';
          sansLieu();
        }
        return { pick: r };
      });
      // Les données de la fiche, après la réponse au toucher (sa mesure fermée) : au premier toucher d'un lieu (§ 6.1).
      poserFaits(true);
      // L'eau du monde (lot F4) : les fiches des mers, avec la couche légère, la mer peut-être pas encore nommée.
      if (eau) demanderFichesMers();
    },
  };
}
