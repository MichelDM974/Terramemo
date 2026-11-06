// Vue « Toucher » : essai de précision. « Touche : Monaco » ; on zoome, on se
// déplace, on touche ; juste ou faux sur la carte, essais, temps, bilan.
// L'exercice (Localiser ou Nommer : nommer.ts) se choisit dans Jouer (jouer.ts,
// nouvellePartie) ; le départ (et « Recommencer ») choisit la série : tous les
// pays, un continent, l'île de La Réunion (sa carte chargée au premier choix),
// et en Localiser l'essai du J0 en dernier ; les derniers choix sont gardés
// dans le navigateur.
import { mediane } from '../mesure/stats';
import type { Terrain } from '../terrains';
import { melanger, SERIE_ESSAI, SERIE_REUNION, SERIE_TOUS, seriesToucher, type Serie } from './cibles';
import { avecTerrain, creer, estPetite, fmtKm, fmtS, nomDe, type ContexteVue, type Vue } from './commun';
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
const nomContinent = (c: string) => (textes.continents as Record<string, string>)[c] ?? c;
const nomSerie = (id: string) =>
  id === SERIE_ESSAI ? T.serie_essai : id === SERIE_TOUS ? T.serie_tous : id === SERIE_REUNION ? textes.terrains.reunion.serie : nomContinent(id);
const detailSerie = (id: string) => (id === SERIE_ESSAI ? T.serie_essai_detail : id === SERIE_REUNION ? textes.terrains.reunion.detail : '');
const nEssais = (n: number) => remplir(n > 1 ? T.essais : T.essai_un, { n });

// Dernière série choisie : une commodité de ce navigateur (rien ne la relit
// ailleurs) ; sans stockage (navigation privée, données effacées), l'essai.
const CLE_SERIE = 'terramemo.toucher.serie';
function lireSerie(): string | null {
  try {
    return localStorage.getItem(CLE_SERIE);
  } catch {
    return null;
  }
}
function garderSerie(id: string): void {
  try {
    localStorage.setItem(CLE_SERIE, id);
  } catch {
    // Stockage refusé : le choix vaut pour cette visite seulement.
  }
}

/** Exercice : localiser (toucher la zone nommée) ou nommer (la zone allumée, quatre noms). */
export type Mode = 'localiser' | 'nommer';
// Même commodité que la série ; Localiser par défaut (un profil neuf, celui du
// pilote, reste sur l'exercice que visent les mesures et les captures).
const CLE_MODE = 'terramemo.toucher.mode';
function lireMode(): Mode {
  try {
    return localStorage.getItem(CLE_MODE) === 'nommer' ? 'nommer' : 'localiser';
  } catch {
    return 'localiser';
  }
}
function garderMode(m: Mode): void {
  try {
    localStorage.setItem(CLE_MODE, m);
  } catch {
    // Stockage refusé : le choix vaut pour cette visite seulement.
  }
}

export interface VueEssai extends Vue {
  /** Le départ de cet exercice (choisi dans Jouer) : une partie en cours est abandonnée. */
  nouvellePartie(m: Mode): void;
}

export function vueEssai(ctx: ContexteVue): VueEssai {
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

  // Choix de la série : une liste (neuf choix ne tiennent pas dans un sélecteur
  // segmenté sur 384 px), en bas comme la barre de l'essai, sous le pouce.
  // L'essai du J0 (un outil, celui du pilote de mesure) en dernier.
  const parOrdre: Serie[] = seriesToucher(ctx.donnees.entites.map((e) => e.pays), nomContinent);
  const toutes = [...parOrdre.filter((s) => s.id !== SERIE_ESSAI), ...parOrdre.filter((s) => s.id === SERIE_ESSAI)];
  const boutons = toutes.map((s) => {
    const detail = detailSerie(s.id);
    return creer(
      'button',
      { type: 'button', class: 'essai-serie', 'data-serie': s.id },
      creer('span', { class: 'essai-serie-nom' }, nomSerie(s.id), ...(detail ? [creer('span', { class: 'essai-serie-detail' }, detail)] : [])),
      creer('span', { class: 'essai-serie-n' }, remplir(textes.terrains[s.terrain].n, { n: s.n })),
    );
  });
  // L'exercice, pour toutes les séries : le titre du départ ; « ‹ » revient au choix de Jouer.
  let mode: Mode = lireMode();
  const titre = creer('h2', {}, T[mode]);
  const statut = creer('p', { class: 'hint essai-statut', 'aria-live': 'polite' });
  statut.hidden = true;
  const lignes = boutons.map((b) => creer('li', {}, b));
  const ligneEssai = lignes[toutes.findIndex((s) => s.id === SERIE_ESSAI)];
  const depart = creer(
    'div',
    { class: 'essai-depart', id: 'essai-depart', 'data-mode': mode },
    creer(
      'div',
      { class: 'depart-tete' },
      creer('a', { class: 'depart-bouton', href: '#jouer', id: 'essai-exercices', 'aria-label': textes.jouer.changer, title: textes.jouer.changer }, '‹'),
      titre,
    ),
    creer('p', { class: 'hint' }, T.depart_aide),
    statut,
    creer('ul', { class: 'essai-series' }, ...lignes),
  );
  barre.hidden = true;
  bilan.hidden = true;
  depart.hidden = true;
  ctx.zone.append(barre, bilan, depart);
  const nommer = vueNommer(ctx, { bilan, recommencer: () => afficherDepart() });

  let serie: Serie = toutes.find((s) => s.id === lireSerie()) ?? (toutes[0] as Serie);
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

  function afficherDepart(): void {
    clearTimeout(enAttente);
    enAttente = 0;
    resEnAttente = null;
    cibles = [];
    nommer.arreter();
    barre.hidden = true;
    bilan.hidden = true;
    effacer();
    ctx.terrains.montrer('monde');
    // L'exercice en titre ; l'essai du J0 en Localiser seulement (celui du pilote).
    titre.textContent = T[mode];
    depart.dataset.mode = mode;
    // La série gardée en évidence : celle que l'on rejoue d'un toucher.
    for (const b of boutons) {
      if (b.dataset.serie === serie.id) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    if (ligneEssai) ligneEssai.hidden = mode !== 'localiser';
    // Le statut d'un chargement fini (échec hors ligne compris) ne survit pas au
    // retour : l'île a pu se charger depuis (Chrono). Un chargement en cours (boutons
    // grisés par avecTerrain) garde le sien : sa partie partira à l'arrivée.
    if (!boutons.some((b) => b.disabled)) {
      statut.textContent = '';
      statut.hidden = true;
    }
    depart.hidden = false;
  }

  function demarrer(s: Serie, terrain: Terrain, ids: string[]): void {
    serie = s;
    garderSerie(s.id);
    t = terrain;
    ctx.terrains.montrer(t.nom);
    depart.hidden = true;
    bilan.hidden = true;
    if (mode === 'nommer') return nommer.demarrer(t, nomSerie(s.id), melanger(ids));
    cibles = melanger(ids);
    i = 0;
    resultats = [];
    barre.hidden = false;
    afficherQuestion();
  }

  // Le monde part tout de suite ; l'île au premier choix se charge d'abord
  // (boutons désactivés, statut). À l'arrivée, la partie part si le départ est
  // affiché, y compris après un aller-retour vers une autre vue (le départ
  // annonçait « Chargement… ») ; hors de la vue, rien ne part. Aucune autre
  // série ne peut être choisie pendant ce temps : tous les boutons sont grisés.
  for (const b of boutons)
    b.addEventListener('click', () => {
      const s = toutes.find((x) => x.id === b.dataset.serie);
      if (!s) return;
      avecTerrain(ctx, s, { boutons, statut, encore: () => !depart.hidden }, (terrain, ids) => demarrer(s, terrain, ids));
    });

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
      creer('h2', {}, remplir(T.bilan_titre, { serie: nomSerie(serie.id) })),
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
      creer('button', { type: 'button', id: 'essai-recommencer' }, T.recommencer),
    );
    bilan.querySelector('#essai-recommencer')?.addEventListener('click', afficherDepart);
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
    nouvellePartie(m) {
      mode = m;
      garderMode(m);
      afficherDepart();
    },
    activer() {
      // Une partie en cours (île comprise) reprend sur son terrain : le routeur vient de montrer le monde.
      if (nommer.enCours) nommer.reprendre();
      else if (!cibles.length) afficherDepart();
      else if (i >= cibles.length) finir();
      else {
        ctx.terrains.montrer(t.nom);
        barre.hidden = false;
        afficherQuestion(true);
      }
    },
    desactiver() {
      validerEnAttente();
      nommer.quitter();
      barre.hidden = true;
      bilan.hidden = true;
      depart.hidden = true;
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
