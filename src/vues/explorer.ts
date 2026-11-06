// Vue « Carte » : explorer, l'accueil. Toucher une zone la met en accent et
// affiche son nom ; un lieu choisi dans la recherche de l'en-tête (recherche.ts)
// y est montré : la carte vole jusqu'à lui. Une commune ouvre la carte de l'île
// (chargée au premier choix), où l'on explore de même ; « Monde » ramène au monde.
// La carte de la mémoire (J1a, étude § 7) : les teintes du terrain montré,
// posées ici et retirées en partant (aucune autre vue ne les voit), sa légende
// à part et « Vu 4 fois · revient dans 5 j » sous la zone touchée.
import { NB_SEAUX } from '../map/teintes';
import { tailleEcranPx } from '../map/pastilles';
import type { Via } from '../map/pick';
import type { NomTerrain } from '../map/types';
import type { Terrain } from '../terrains';
import type { CarteMemoire } from './carte-memoire';
import { ANNEAU_SOUS_PX, creer, LIBELLE_STATUT, nomDe, type ContexteVue, type Vue } from './commun';
import { textes } from './textes';

const C = textes.carte;
const M = textes.memoire;

export interface VueExplorer extends Vue {
  /** Montre ce lieu (recherche) : son terrain, la zone en accent, la carte qui vole jusqu'à elle. */
  montrerLieu(terrain: NomTerrain, id: string): void;
  /** Teintes, légende et ligne de la zone touchée relues (mémoire chargée, réglage changé) ; sans effet hors de l'accueil. */
  rafraichir(): void;
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
  const legende = creer(
    'div',
    { class: 'legende-memoire', id: 'legende-memoire', role: 'note', 'aria-label': M.legende },
    creer('span', { class: 'legende-case legende-jamais', 'aria-hidden': 'true' }),
    M.jamais_vu,
    ' · ',
    M.faible,
    creer('span', { class: 'legende-echelle', 'aria-hidden': 'true' }, ...Array.from({ length: NB_SEAUX }, (_, k) => creer('span', { class: `legende-case legende-s${k}` }))),
    M.maitrise,
    ' · ',
    compteMaitrises,
  );
  legende.hidden = true;
  ctx.zone.append(barre, legende);

  /** Le terrain exploré : le monde, ou l'île après le choix d'une commune. */
  let t: Terrain = ctx.terrains.monde;
  /** Change à chaque lieu demandé ou sortie : un chargement de l'île arrivé après ne montre rien. */
  let jeton = 0;
  /** La vue est affichée (entre activer et desactiver). */
  let active = false;
  /** Les terrains dont la carte porte les teintes de la mémoire : à effacer en partant. */
  const teintes = new Set<Terrain>();

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
    } else t.carte.teinter(null);
    const compte = seaux ? m.maitrises(t.nom, t.jouables.length) : null;
    compteMaitrises.textContent = compte ?? '';
    legende.hidden = !compte;
  }

  function effacerTeintes(): void {
    for (const x of teintes) x.carte.teinter(null);
    teintes.clear();
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

  /** Par quoi la zone affichée a été touchée (la ligne relue par rafraichir()). */
  let viaAffiche: Via | null = null;
  function afficher(id: string, via: Via | null): void {
    viaAffiche = via;
    const e = t.donnees.entites.find((en) => en.pays.id === id);
    nom.textContent = nomDe(t.donnees, id);
    const statut = e ? LIBELLE_STATUT[e.pays.statut] : '';
    const memoire = o.memoire?.detail(t.nom, id, e?.pays.statut === 'jouable') ?? '';
    detail.textContent = [statut, via === 'pastille' ? C.par_pastille : via === 'proche' ? C.au_plus_pres : '', memoire].filter(Boolean).join(' · ');
    barre.dataset.id = id;
  }

  function aller(terrain: Terrain): void {
    t = terrain;
    ctx.terrains.montrer(t.nom);
    teinter();
    vider();
  }

  /** La zone en accent, la carte qui vole jusqu'à elle au-dessus de la barre, un anneau si elle reste minuscule. */
  function montrer(terrain: Terrain, id: string): void {
    aller(terrain);
    t.carte.marquer(id, 'choisi');
    afficher(id, null);
    const carte = t.carte;
    carte.montrer(id, barre.getBoundingClientRect().top - carte.hote.getBoundingClientRect().top);
    // Jugé à l'arrivée du vol : le Vatican reste un point même au zoom de montrer().
    const e = t.donnees.entites.find((en) => en.pays.id === id);
    const fin = carte.contexteFinal();
    if (e && tailleEcranPx(e.pays, fin.proj.scale(), fin.t.k) < ANNEAU_SOUS_PX) carte.anneau(id, 'choisi');
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
    montrerLieu(terrain, id) {
      const j = ++jeton;
      if (terrain === 'monde') return montrer(ctx.terrains.monde, id);
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
      ctx.mesures.toucher(ev, x, y, () => {
        const r = carte.pick(x, y);
        carte.effacerMarques();
        if (r) {
          carte.marquer(r.id, 'choisi');
          afficher(r.id, r.via);
        } else {
          nom.textContent = C.mer;
          detail.textContent = '';
          delete barre.dataset.id;
        }
        return { pick: r };
      });
    },
  };
}
