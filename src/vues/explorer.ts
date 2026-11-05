// Vue « Carte » : explorer. Toucher un pays le met en accent et affiche son nom.
import { creer, LIBELLE_STATUT, nomDe, type ContexteVue, type Vue } from './commun';

export function vueExplorer(ctx: ContexteVue): Vue {
  const nom = creer('strong', { class: 'barre-nom' }, 'Touche un pays');
  const detail = creer('span', { class: 'barre-detail' });
  const barre = creer('div', { class: 'carte-barre', id: 'barre-carte', 'aria-live': 'polite' }, nom, detail);
  barre.hidden = true;
  ctx.zone.append(barre);

  /** Barre vide : au retour dans la vue, les marques sont effacées, le nom aussi. */
  const vider = () => {
    nom.textContent = 'Touche un pays';
    detail.textContent = '';
    delete barre.dataset.id;
  };

  return {
    activer() {
      barre.hidden = false;
      ctx.carte.effacerMarques();
      vider();
    },
    desactiver() {
      barre.hidden = true;
      ctx.carte.effacerMarques();
    },
    toucher(x, y, ev) {
      ctx.mesures.toucher(ev, x, y, () => {
        const r = ctx.carte.pick(x, y);
        ctx.carte.effacerMarques();
        if (r) {
          ctx.carte.marquer(r.id, 'choisi');
          const e = ctx.donnees.entites.find((en) => en.pays.id === r.id);
          nom.textContent = nomDe(ctx.donnees, r.id);
          const statut = e ? LIBELLE_STATUT[e.pays.statut] : '';
          detail.textContent = [statut, r.via === 'trace' ? '' : r.via === 'pastille' ? 'par sa pastille' : 'au plus près'].filter(Boolean).join(' · ');
          barre.dataset.id = r.id;
        } else {
          nom.textContent = 'Mer';
          detail.textContent = '';
          delete barre.dataset.id;
        }
        return { pick: r };
      });
    },
  };
}
