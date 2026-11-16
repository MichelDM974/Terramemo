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
import { versEcran, versLonLat } from '../map/geo';
import { chargerMersLegeres, estIdMer, mersPourNommer, nomsMersCharges } from '../map/mers';
import { NB_SEAUX } from '../map/teintes';
import { estDomaine, type Domaine } from '../srs/fiches';
import { tailleEcranPx } from '../map/pastilles';
import { pickMer, type ResultatPick, type Via } from '../map/pick';
import type { Lieu, NomTerrain } from '../map/types';
import type { Terrain } from '../terrains';
import type { CarteMemoire } from './carte-memoire';
import { ANNEAU_SOUS_PX, anneauZone, creer, LIBELLE_STATUT, merPosee, mersPosees, poserMers, type ContexteVue, type Vue } from './commun';
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
}

export interface OptionsExplorer {
  /** La carte de la mémoire (sans elle, ni teinte ni légende). */
  memoire?: CarteMemoire;
}

export function vueExplorer(ctx: ContexteVue, o: OptionsExplorer = {}): VueExplorer {
  const nom = creer('strong', { class: 'barre-nom' });
  const detail = creer('span', { class: 'barre-detail' });
  const monde = creer('button', { type: 'button', class: 'secondary barre-monde', id: 'carte-monde', title: C.monde_titre }, C.monde);
  const barre = creer('div', { class: 'carte-barre', id: 'barre-carte', 'aria-live': 'polite' }, nom, detail, monde);
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
    delete barre.dataset.id;
    monde.hidden = t.nom === 'monde';
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
    const memoire = o.memoire?.detail(t.nom, id, mer || e?.pays.statut === 'jouable') ?? '';
    detail.textContent = [statut, via === 'pastille' ? C.par_pastille : via === 'proche' ? C.au_plus_pres : '', memoire].filter(Boolean).join(' · ');
    barre.dataset.id = id;
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
      delete barre.dataset.id;
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
   * avant l'arrivée : rien.
   */
  function nommerMer(x: number, y: number): void {
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
    if (!ll || deja) return afficherMer(ll && deja ? pickMer({ ...c0, mers: deja }, '', x, y, new Set()) : null);
    afficherMer(null);
    chargerMersLegeres().then(
      (couche) => {
        // La fine arrivée avant : elle a déjà nommé et allumé.
        if (encore() && !mersPosees(ctx.donnees).length) afficherMer(merAuPoint(couche.mers));
      },
      () => undefined,
    );
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
    },
    desactiver() {
      jeton++;
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
    },
    avis(texte) {
      if (active && !barre.dataset.id) detail.textContent = texte;
      else avisAMontrer = texte;
    },
    montrerLieu(terrain, id, point) {
      const j = ++jeton;
      if (terrain === 'monde' && estIdMer(id)) {
        // Une mer : la couche fine posée sur la carte d'abord (une fois), son chargement dit dans la barre.
        const p = poserMers(ctx);
        if (!p) return montrer(ctx.terrains.monde, id);
        aller(ctx.terrains.monde);
        nom.textContent = '';
        detail.textContent = textes.toucher.chargement_sujet;
        p.then(
          () => {
            if (j === jeton) montrer(ctx.terrains.monde, id);
          },
          () => {
            if (j === jeton) detail.textContent = textes.toucher.echec_sujet;
          },
        );
        return;
      }
      if (terrain === 'monde') return montrer(ctx.terrains.monde, id, point);
      const deja = ctx.terrains.deja(terrain);
      if (deja) return montrer(deja, id);
      // L'île au premier choix : son chargement annoncé dans la barre.
      nom.textContent = '';
      detail.textContent = textes.toucher.chargement_terrain;
      ctx.terrains.charger(terrain).then(
        (ile) => {
          if (j === jeton) montrer(ile, id);
        },
        () => {
          if (j === jeton) detail.textContent = textes.toucher.echec_terrain;
        },
      );
    },
    toucher(x, y, ev) {
      const carte = t.carte;
      // Un nouveau toucher : le nom d'une mer encore en chargement pour le précédent ne s'affichera pas.
      touches++;
      ctx.mesures.toucher(ev, x, y, () => {
        const r = carte.pick(x, y);
        carte.effacerMarques();
        if (r) {
          carte.marquer(r.id, 'choisi');
          afficher(r.id, r.via);
        } else if (t === ctx.terrains.monde) nommerMer(x, y);
        else {
          nom.textContent = C.mer;
          detail.textContent = '';
          delete barre.dataset.id;
        }
        return { pick: r };
      });
    },
  };
}
