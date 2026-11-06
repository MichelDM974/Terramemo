// Vue « Carte » : explorer, l'accueil. Toucher une zone la met en accent et
// affiche son nom ; un lieu choisi dans la recherche de l'en-tête (recherche.ts)
// y est montré : la carte vole jusqu'à lui. Une commune ouvre la carte de l'île
// (chargée au premier choix), où l'on explore de même ; « Monde » ramène au monde.
import { tailleEcranPx } from '../map/pastilles';
import type { Via } from '../map/pick';
import type { NomTerrain } from '../map/types';
import type { Terrain } from '../terrains';
import { ANNEAU_SOUS_PX, creer, LIBELLE_STATUT, nomDe, type ContexteVue, type Vue } from './commun';
import { textes } from './textes';

const C = textes.carte;

export interface VueExplorer extends Vue {
  /** Montre ce lieu (recherche) : son terrain, la zone en accent, la carte qui vole jusqu'à elle. */
  montrerLieu(terrain: NomTerrain, id: string): void;
}

export function vueExplorer(ctx: ContexteVue): VueExplorer {
  const nom = creer('strong', { class: 'barre-nom' });
  const detail = creer('span', { class: 'barre-detail' });
  const monde = creer('button', { type: 'button', class: 'secondary barre-monde', id: 'carte-monde', title: C.monde_titre }, C.monde);
  const barre = creer('div', { class: 'carte-barre', id: 'barre-carte', 'aria-live': 'polite' }, nom, detail, monde);
  barre.hidden = true;
  ctx.zone.append(barre);

  /** Le terrain exploré : le monde, ou l'île après le choix d'une commune. */
  let t: Terrain = ctx.terrains.monde;
  /** Change à chaque lieu demandé ou sortie : un chargement de l'île arrivé après ne montre rien. */
  let jeton = 0;

  /** Barre vide : « Touche un pays » (ou une commune sur l'île), aucune zone marquée. */
  function vider(): void {
    t.carte.effacerMarques();
    nom.textContent = t.nom === 'monde' ? C.touche : C.touche_ile;
    detail.textContent = '';
    delete barre.dataset.id;
    monde.hidden = t.nom === 'monde';
  }

  function afficher(id: string, via: Via | null): void {
    const e = t.donnees.entites.find((en) => en.pays.id === id);
    nom.textContent = nomDe(t.donnees, id);
    const statut = e ? LIBELLE_STATUT[e.pays.statut] : '';
    detail.textContent = [statut, via === 'pastille' ? C.par_pastille : via === 'proche' ? C.au_plus_pres : ''].filter(Boolean).join(' · ');
    barre.dataset.id = id;
  }

  function aller(terrain: Terrain): void {
    t = terrain;
    ctx.terrains.montrer(t.nom);
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
      t = ctx.terrains.monde;
      barre.hidden = false;
      vider();
    },
    desactiver() {
      jeton++;
      barre.hidden = true;
      t.carte.effacerMarques();
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
