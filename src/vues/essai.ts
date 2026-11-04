// Vue « Toucher » : essai de précision. « Touche : Monaco » ; on zoome, on se
// déplace, on touche ; juste ou faux sur la carte, essais, temps, bilan.
import { mediane } from '../mesure/stats';
import { ciblesEssai, melanger } from './cibles';
import { creer, nomDe, type ContexteVue, type Vue } from './commun';

interface Resultat {
  id: string;
  essais: number;
  juste: boolean;
  /** Juste au premier toucher, sans avoir demandé « Voir ». */
  premier: boolean;
  /** « Voir » demandé avant de trouver. */
  vu: boolean;
  temps_ms: number;
  /** Distance au bord au premier toucher faux (km). */
  distance_km: number | null;
}

// Espace insécable avant l'unité : « 1 517 km » ne se coupe pas en fin de ligne.
const fmtS = (ms: number) => `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00a0s`;
const fmtKm = (km: number) => `${Math.round(km).toLocaleString('fr-FR')}\u00a0km`;

export function vueEssai(ctx: ContexteVue): Vue {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const voir = creer('button', { type: 'button', class: 'secondary', id: 'essai-voir' }, 'Voir');
  const passer = creer('button', { type: 'button', class: 'secondary', id: 'essai-passer' }, 'Passer');
  const terminer = creer('button', { type: 'button', class: 'secondary', id: 'essai-terminer' }, 'Terminer');
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-essai' },
    creer('div', { class: 'essai-ligne' }, consigne, compte),
    retro,
    creer('div', { class: 'essai-actions' }, voir, passer, terminer),
  );
  const bilan = creer('div', { class: 'essai-bilan panel', id: 'essai-bilan' });
  barre.hidden = true;
  bilan.hidden = true;
  ctx.zone.append(barre, bilan);

  let cibles: string[] = [];
  let i = 0;
  let essais = 0;
  let premierFaux: number | null = null;
  let vu = false;
  let debut = 0;
  let enAttente = 0;
  /** Le « juste » affiché pendant enAttente, avant la question suivante. */
  let resEnAttente: Resultat | null = null;
  let resultats: Resultat[] = [];

  const courante = () => cibles[i];

  function afficherQuestion(): void {
    const id = courante();
    ctx.carte.effacerMarques();
    if (!id) return finir();
    consigne.replaceChildren('Touche : ', creer('strong', {}, nomDe(ctx, id)));
    consigne.dataset.cible = id;
    compte.textContent = `${i + 1} / ${cibles.length}`;
    retro.textContent = '';
    retro.className = 'essai-retro';
    essais = 0;
    premierFaux = null;
    vu = false;
    debut = performance.now();
  }

  // Un « juste » encore affiché quand on quitte la vue ou termine compte quand
  // même : il était perdu, et la question revenait (bloquée, enAttente restant vrai).
  function validerEnAttente(): void {
    clearTimeout(enAttente);
    enAttente = 0;
    if (!resEnAttente) return;
    resultats.push(resEnAttente);
    resEnAttente = null;
    i++;
  }

  function suivante(r: Resultat): void {
    resultats.push(r);
    i++;
    afficherQuestion();
  }

  function demarrer(): void {
    clearTimeout(enAttente);
    enAttente = 0;
    resEnAttente = null;
    cibles = melanger(ciblesEssai(ctx.donnees.entites.map((e) => e.pays)));
    i = 0;
    resultats = [];
    bilan.hidden = true;
    barre.hidden = false;
    afficherQuestion();
  }

  function finir(): void {
    validerEnAttente();
    barre.hidden = true;
    ctx.carte.effacerMarques();
    const n = resultats.length;
    const premiers = resultats.filter((r) => r.premier).length;
    const justes = resultats.filter((r) => r.juste).length;
    const temps = mediane(resultats.filter((r) => r.juste).map((r) => r.temps_ms));
    const rates = resultats.filter((r) => !r.premier);
    bilan.replaceChildren(
      creer('h2', {}, 'Bilan'),
      creer(
        'p',
        { class: 'hint' },
        n
          ? `${premiers} / ${n} justes du premier coup, ${justes} / ${n} au bout du compte · ${(resultats.reduce((a, r) => a + r.essais, 0) / n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} essai(s) en moyenne · temps médian ${temps == null ? '—' : fmtS(temps)}`
          : 'Aucune cible jouée.',
      ),
      creer(
        'ul',
        { class: 'essai-rates' },
        ...rates.map((r) =>
          creer(
            'li',
            {},
            `${nomDe(ctx, r.id)} : ${r.juste ? `${r.essais} essai${r.essais > 1 ? 's' : ''}${r.vu ? ' après « Voir »' : ''}` : 'passé'}${r.distance_km != null ? `, premier toucher à ${fmtKm(r.distance_km)}` : ''}, ${fmtS(r.temps_ms)}`,
          ),
        ),
      ),
      creer('button', { type: 'button', id: 'essai-recommencer' }, 'Recommencer'),
    );
    bilan.querySelector('#essai-recommencer')?.addEventListener('click', demarrer);
    bilan.hidden = false;
  }

  // « Voir » : la cible en vert, et la carte vole jusqu'à elle (en reculant
  // d'abord, pour voir où elle est). Une réponse trouvée ensuite ne compte pas
  // comme juste du premier coup.
  voir.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    vu = true;
    ctx.carte.effacerMarques();
    ctx.carte.marquer(id, 'juste');
    ctx.carte.anneau(id, 'juste');
    ctx.carte.montrer(id);
  });
  passer.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    suivante({ id, essais, juste: false, premier: false, vu, temps_ms: performance.now() - debut, distance_km: premierFaux });
  });
  terminer.addEventListener('click', finir);

  return {
    activer() {
      if (!cibles.length) demarrer();
      else if (i >= cibles.length) finir();
      else {
        barre.hidden = false;
        afficherQuestion();
      }
    },
    desactiver() {
      validerEnAttente();
      barre.hidden = true;
      bilan.hidden = true;
      ctx.carte.effacerMarques();
    },
    toucher(x, y, ev) {
      const id = courante();
      if (!id || enAttente) return;
      ctx.mesures.toucher(ev, x, y, () => {
        // Juste : la cible en vert ; faux : ce que la carte désigne (pick) en rouge.
        const note = ctx.carte.noter(id, x, y);
        const r = note.pick;
        essais++;
        ctx.carte.effacerMarques();
        if (note.juste) {
          ctx.carte.marquer(id, 'juste');
          retro.className = 'essai-retro juste';
          retro.textContent = `Juste${note.via === 'pastille' ? ' (pastille)' : note.via === 'proche' ? ' (au plus près)' : ''} · ${essais} essai${essais > 1 ? 's' : ''} · ${fmtS(performance.now() - debut)}`;
          const res: Resultat = { id, essais, juste: true, premier: essais === 1 && !vu, vu, temps_ms: performance.now() - debut, distance_km: premierFaux };
          resEnAttente = res;
          enAttente = window.setTimeout(() => {
            enAttente = 0;
            resEnAttente = null;
            suivante(res);
          }, 1200);
        } else {
          if (premierFaux == null && note.distance_km != null) premierFaux = note.distance_km;
          if (r && r.id !== id) ctx.carte.marquer(r.id, 'faux');
          ctx.carte.marquer(id, 'juste');
          ctx.carte.anneau(id, 'juste');
          retro.className = 'essai-retro faux';
          const ou = note.distance_km != null ? `, à ${fmtKm(note.distance_km)} du bord` : '';
          retro.textContent = `Faux : ${r ? nomDe(ctx, r.id) : 'la mer'}${ou}. Le bon pays est en vert : touche-le.`;
        }
        return { pick: r, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
