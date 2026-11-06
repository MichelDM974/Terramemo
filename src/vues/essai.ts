// Vue « Toucher » : essai de précision. « Touche : Monaco » ; on zoome, on se
// déplace, on touche ; juste ou faux sur la carte, essais, temps, bilan.
// La partie (Trouver, ou Reconnaître : nommer.ts, et sa série) se choisit dans
// Jouer (décision « Écran Jouer » : jouer.ts, puis lancer()) ou dans ⚙
// (l'Essai J0) ; son terrain arrive chargé (l'île, par Jouer). Le bilan la
// relance (« Recommencer ») ou ramène aux séries de Jouer (« Autre série ») ;
// la vue atteinte sans partie (adresse tapée, retour arrière) renvoie à Jouer
// (redirection(), main.ts).
import { mediane } from '../mesure/stats';
import type { Terrain } from '../terrains';
import { adresse, niveauDe, type Lancement } from './arbre';
import { melanger, nomSerie, type Serie } from './cibles';
import { creer, estPetite, fmtKm, fmtS, idsSerie, nomDe, type ContexteVue, type Vue } from './commun';
import { vueNommer } from './nommer';
import { remplir, textes } from './textes';

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

const T = textes.toucher;
const nEssais = (n: number) => remplir(n > 1 ? T.essais : T.essai_un, { n });

/** Exercice : localiser (toucher la zone nommée) ou nommer (la zone allumée, quatre noms). */
export type Mode = 'localiser' | 'nommer';

export interface VueEssai extends Vue {
  /**
   * Une partie de cet exercice sur cette série (choisie dans Jouer ou ⚙), son
   * terrain chargé et ses cibles : la partie en cours est abandonnée.
   */
  lancer(l: Lancement, s: Serie, t: Terrain, ids: string[]): void;
}

export interface OptionsEssai {
  /** Vers Jouer, à ce niveau (son adresse) : main.ts remonte l'historique s'il y mène. */
  versJouer(cible: string): void;
}

export function vueEssai(ctx: ContexteVue, o: OptionsEssai): VueEssai {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const voir = creer('button', { type: 'button', class: 'secondary', id: 'essai-voir' }, T.voir);
  const passer = creer('button', { type: 'button', class: 'secondary', id: 'essai-passer' }, T.passer);
  const terminer = creer('button', { type: 'button', class: 'secondary', id: 'essai-terminer' }, T.terminer);
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

  /** La partie lancée (Jouer ou ⚙) : son exercice, sa série et sa place dans l'arbre (« Autre série »). */
  let lancement: Lancement | null = null;
  let mode: Mode = 'localiser';
  let serie: Serie | null = null;
  /** Le bilan était affiché quand on a quitté la vue : il revient au retour. */
  let bilanAuRetour = false;

  /** Les actions du bilan (Trouver et Reconnaître) : la même partie, ou les séries de Jouer. */
  function actionsBilan(): HTMLElement {
    const recommencer = creer('button', { type: 'button', id: 'essai-recommencer' }, T.recommencer);
    const autre = creer('button', { type: 'button', class: 'secondary', id: 'essai-autre' }, T.autre_serie);
    recommencer.addEventListener('click', () => {
      if (serie) demarrer(serie, t, idsSerie(serie, t));
    });
    autre.addEventListener('click', () => {
      arreter();
      bilanAuRetour = false;
      o.versJouer(lancement ? adresse(niveauDe(lancement, 'series')) : 'jouer');
    });
    return creer('div', { class: 'essai-actions' }, recommencer, autre);
  }
  const nommer = vueNommer(ctx, { bilan, actions: actionsBilan });
  /** Le terrain de la partie : sa carte reçoit marques et notes, ses données donnent les noms. */
  let t: Terrain = ctx.terrains.monde;
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
  /**
   * Les marques de la question en cours, telles que posées : rejouées au retour
   * dans la vue, que les autres vues ont effacées entre-temps (la cible révélée
   * par « Voir » ou par un faux reste montrée, comme vu reste vrai). L'anneau
   * aussi tel quel : jugé de nouveau après le vol de « Voir », la zone n'est
   * plus petite et il disparaîtrait.
   */
  let marques: { id: string; classe: string; anneau: boolean }[] = [];

  const courante = () => cibles[i];

  function effacer(): void {
    t.carte.effacerMarques();
    marques = [];
  }
  function poser(m: (typeof marques)[number]): void {
    marques.push(m);
    t.carte.marquer(m.id, m.classe);
    if (m.anneau) t.carte.anneau(m.id, m.classe);
  }
  /** `anneau` : un anneau autour de la zone si elle est petite à l'écran (anneauSiPetite). */
  const marquer = (id: string, classe: string, anneau = false) => poser({ id, classe, anneau: anneau && estPetite(t, id) });

  // `reprise` (retour dans la vue) : la même question, ses essais, son « Voir »
  // et son premier faux gardés (ils font la note), son message et ses marques
  // remontrés ; le temps repart, comme Nommer.
  function afficherQuestion(reprise = false): void {
    const id = courante();
    const aRejouer = reprise ? marques : [];
    effacer();
    if (!id) return finir();
    consigne.replaceChildren(T.consigne, creer('strong', {}, nomDe(t.donnees, id)));
    consigne.dataset.cible = id;
    compte.textContent = `${i + 1} / ${cibles.length}`;
    if (!reprise) {
      retro.textContent = '';
      retro.className = 'essai-retro';
      essais = 0;
      premierFaux = null;
      vu = false;
    }
    for (const m of aRejouer) poser(m);
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
    // La question suivante part de zéro, même reposée en reprise (afficherQuestion(true)) :
    // ni essais, ni « Voir », ni premier faux, ni le « juste » et sa marque.
    essais = 0;
    premierFaux = null;
    vu = false;
    marques = [];
    retro.textContent = '';
    retro.className = 'essai-retro';
  }

  function suivante(r: Resultat): void {
    resultats.push(r);
    i++;
    afficherQuestion();
  }

  /** La partie en cours (ou son bilan) abandonnée : rien à l'écran, la carte du monde. */
  function arreter(): void {
    clearTimeout(enAttente);
    enAttente = 0;
    resEnAttente = null;
    cibles = [];
    nommer.arreter();
    barre.hidden = true;
    bilan.hidden = true;
    effacer();
    ctx.terrains.montrer('monde');
  }

  /** Une partie neuve sur cette série (un nouveau tirage), dans l'exercice de la partie lancée. */
  function demarrer(s: Serie, terrain: Terrain, ids: string[]): void {
    arreter();
    serie = s;
    t = terrain;
    ctx.terrains.montrer(t.nom);
    if (mode === 'nommer') return nommer.demarrer(t, nomSerie(s.id), melanger(ids));
    cibles = melanger(ids);
    i = 0;
    resultats = [];
    barre.hidden = false;
    afficherQuestion();
  }

  function finir(): void {
    validerEnAttente();
    // Partie close (même par « Terminer ») : revenir à la vue ramène au choix.
    cibles = [];
    barre.hidden = true;
    effacer();
    const d = t.donnees;
    const n = resultats.length;
    const premiers = resultats.filter((r) => r.premier).length;
    const justes = resultats.filter((r) => r.juste).length;
    const temps = mediane(resultats.filter((r) => r.juste).map((r) => r.temps_ms));
    const rates = resultats.filter((r) => !r.premier);
    bilan.replaceChildren(
      creer('h2', {}, remplir(T.bilan_titre, { serie: nomSerie(serie?.id ?? '') })),
      creer(
        'p',
        { class: 'hint' },
        n
          ? remplir(T.bilan_resume, {
              premiers,
              justes,
              n,
              essais: (resultats.reduce((a, r) => a + r.essais, 0) / n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
              temps: temps == null ? '—' : fmtS(temps),
            })
          : T.bilan_vide,
      ),
      creer(
        'ul',
        { class: 'essai-rates' },
        ...rates.map((r) =>
          creer(
            'li',
            {},
            remplir(T.rate, {
              pays: nomDe(d, r.id),
              detail: r.juste ? `${nEssais(r.essais)}${r.vu ? T.rate_vu : ''}` : T.rate_passe,
              distance: r.distance_km != null ? remplir(T.rate_distance, { km: fmtKm(r.distance_km) }) : '',
              temps: fmtS(r.temps_ms),
            }),
          ),
        ),
      ),
      actionsBilan(),
    );
    bilan.hidden = false;
  }

  // « Voir » : la cible en vert, et la carte vole jusqu'à elle (en reculant
  // d'abord, pour voir où elle est), centrée au-dessus de la barre. Une
  // réponse trouvée ensuite ne compte pas comme juste du premier coup.
  voir.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    vu = true;
    effacer();
    marquer(id, 'juste', true);
    t.carte.montrer(id, barre.getBoundingClientRect().top - t.carte.hote.getBoundingClientRect().top);
  });
  passer.addEventListener('click', () => {
    const id = courante();
    if (!id || enAttente) return;
    suivante({ id, essais, juste: false, premier: false, vu, temps_ms: performance.now() - debut, distance_km: premierFaux });
  });
  terminer.addEventListener('click', finir);

  return {
    lancer(l, s, terrain, ids) {
      lancement = l;
      mode = l.mode === 'nommer' ? 'nommer' : 'localiser';
      bilanAuRetour = false;
      demarrer(s, terrain, ids);
    },
    // Sans partie en cours ni bilan à remontrer : les exercices de la dernière
    // partie dans Jouer (ou Jouer tout court), au lieu d'un écran vide.
    redirection() {
      if (nommer.enCours || cibles.length || bilanAuRetour) return null;
      return { cible: lancement ? adresse(niveauDe(lancement, 'exercices')) : 'jouer' };
    },
    activer() {
      // Une partie en cours (île comprise) reprend sur son terrain : le routeur vient de montrer le monde.
      if (nommer.enCours) nommer.reprendre();
      else if (cibles.length && i >= cibles.length) finir();
      else if (cibles.length) {
        ctx.terrains.montrer(t.nom);
        barre.hidden = false;
        afficherQuestion(true);
      } else if (bilanAuRetour) {
        ctx.terrains.montrer(t.nom);
        bilan.hidden = false;
      }
    },
    desactiver() {
      validerEnAttente();
      bilanAuRetour = !bilan.hidden;
      nommer.quitter();
      barre.hidden = true;
      bilan.hidden = true;
      // La carte seule : `marques` reste, pour les remontrer au retour.
      t.carte.effacerMarques();
      ctx.terrains.montrer('monde');
    },
    toucher(x, y, ev) {
      // Nommer : les touchers sur la carte ne répondent pas (cibles est vide).
      const id = courante();
      if (!id || enAttente || nommer.enCours) return;
      const carte = t.carte;
      ctx.mesures.toucher(ev, x, y, () => {
        // Juste : la cible en vert ; faux : ce que la carte désigne (pick) en rouge.
        const note = carte.noter(id, x, y);
        const r = note.pick;
        essais++;
        effacer();
        if (note.juste) {
          marquer(id, 'juste');
          retro.className = 'essai-retro juste';
          retro.textContent = remplir(T.juste, {
            via: note.via === 'pastille' ? T.via_pastille : note.via === 'proche' ? T.via_proche : '',
            essais: nEssais(essais),
            temps: fmtS(performance.now() - debut),
          });
          const res: Resultat = { id, essais, juste: true, premier: essais === 1 && !vu, vu, temps_ms: performance.now() - debut, distance_km: premierFaux };
          resEnAttente = res;
          enAttente = window.setTimeout(() => {
            enAttente = 0;
            resEnAttente = null;
            suivante(res);
          }, 1200);
        } else {
          if (premierFaux == null && note.distance_km != null) premierFaux = note.distance_km;
          if (r && r.id !== id) marquer(r.id, 'faux');
          marquer(id, 'juste', true);
          retro.className = 'essai-retro faux';
          retro.textContent = remplir(T.faux, {
            touche: r ? nomDe(t.donnees, r.id) : T.la_mer,
            ou: note.distance_km != null ? remplir(T.faux_ou, { km: fmtKm(note.distance_km) }) : '',
            suite: textes.terrains[t.nom].faux_suite,
          });
        }
        return { pick: r, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
