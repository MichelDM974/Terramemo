// Vue « Chrono » (#14, décision « Points et classement ») : tous les pays d'une
// série dans le désordre, 15 s par question, un seul toucher ; 1 000 points si
// juste, jusqu'à 500 selon la distance sinon (src/epreuve/bareme.ts). Record
// gardé sur l'appareil, classement en ligne par épreuve et général. Quitter la
// vue pendant une partie l'abandonne : le temps ne se met pas en pause ; la
// quitter après la dernière réponse (sa rétroaction) la finit, bilan au retour.
// La Réunion est une série de plus : sa carte remplace le monde, notée à 5 km.
import { DELAI_CHRONO_MS, ECHELLES_KM, POINTS_JUSTE } from '../epreuve/bareme';
import { enregistrerPartie, idEpreuve, lireRecords, PartieChrono, type QuestionJouee } from '../epreuve/chrono';
import { GENERAL } from '../epreuve/classement';
import { REUNION } from '../map/terrain';
import type { Terrain } from '../terrains';
import { melanger, SERIE_ESSAI, SERIE_REUNION, SERIE_TOUS, series, serieTerrain, type Serie } from './cibles';
import { blocClassement, publierPartie } from './classement';
import { anneauSiPetite, avecTerrain, creer, fmtKm, nomDe, type ContexteVue, type Vue } from './commun';
import { remplir, textes } from './textes';

const T = textes.chrono;
const DELAI = DELAI_CHRONO_MS.localiser;
/** Durée de la rétroaction avant la question suivante (ms), hors du temps compté. */
const PAUSE_JUSTE_MS = 900;
const PAUSE_FAUX_MS = 1800;

const fmtPts = (n: number) => n.toLocaleString('fr-FR');
function fmtTemps(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}
const nomContinent = (c: string) => (textes.continents as Record<string, string>)[c] ?? c;
const nomSerie = (id: string) =>
  id === SERIE_TOUS ? textes.toucher.serie_tous : id === SERIE_REUNION ? textes.terrains.reunion.serie : nomContinent(id);

function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Les séries du Chrono : les continents, puis tous les pays (le marathon), puis
 * l'île (son épreuve, chrono:localiser:reunion) ; pas l'essai du J0.
 */
export function seriesChrono(toutes: readonly Serie[]): Serie[] {
  const continents = toutes.filter((s) => s.terrain === 'monde' && s.id !== SERIE_ESSAI && s.id !== SERIE_TOUS);
  const tous = toutes.filter((s) => s.id === SERIE_TOUS);
  return [...continents, ...tous, serieTerrain(REUNION)];
}

export function vueChrono(ctx: ContexteVue): Vue {
  const consigne = creer('div', { class: 'essai-consigne' });
  const compte = creer('span', { class: 'essai-compte' });
  const jauge = creer('span', { class: 'chrono-jauge-reste' });
  const secondes = creer('span', { class: 'chrono-secondes' });
  const retro = creer('div', { class: 'essai-retro', 'aria-live': 'polite' });
  const abandonner = creer('button', { type: 'button', class: 'secondary', id: 'chrono-abandonner' }, T.abandonner);
  const barre = creer(
    'div',
    { class: 'carte-barre essai', id: 'barre-chrono' },
    creer('div', { class: 'essai-ligne' }, consigne, compte),
    creer('div', { class: 'chrono-temps' }, creer('span', { class: 'chrono-jauge' }, jauge), secondes),
    retro,
    creer('div', { class: 'essai-actions' }, abandonner),
  );
  const bilan = creer('div', { class: 'essai-bilan panel', id: 'chrono-bilan' });
  const statut = creer('p', { class: 'hint chrono-statut', 'aria-live': 'polite' });
  const liste = creer('ul', { class: 'essai-series' });
  const general = creer('button', { type: 'button', class: 'secondary chrono-general', id: 'chrono-general' }, T.general_bouton);
  const depart = creer(
    'div',
    { class: 'essai-depart', id: 'chrono-depart' },
    creer('h2', {}, T.depart_titre),
    creer('p', { class: 'hint' }, remplir(T.depart_aide, { s: DELAI / 1000 })),
    statut,
    liste,
    general,
  );
  barre.hidden = true;
  bilan.hidden = true;
  depart.hidden = true;
  ctx.zone.append(barre, bilan, depart);

  const toutes = seriesChrono(series(ctx.donnees.entites.map((e) => e.pays), nomContinent));
  let serie: Serie | null = null;
  /** Le terrain de la partie : sa carte reçoit marques et notes, ses données donnent les noms. */
  let t: Terrain = ctx.terrains.monde;
  /** Change à chaque départ ou sortie : un chargement d'île (ou ses deux images) arrivé après ne lance rien. */
  let jeton = 0;
  let partie: PartieChrono | null = null;
  let debut = 0;
  /** Une question est posée et attend son toucher. */
  let ouverte = false;
  let minuterie = 0;
  let affichage = 0;
  let pause = 0;
  /** Message du départ au retour dans la vue (partie abandonnée en la quittant). */
  let messageRetour = '';
  /** Partie finie en quittant la vue (pendant la pause de sa dernière réponse) : son bilan au retour. */
  let bilanAuRetour = false;

  function arreterMinuteries(): void {
    clearTimeout(minuterie);
    clearInterval(affichage);
    clearTimeout(pause);
    minuterie = affichage = pause = 0;
  }

  function figerJauge(): void {
    const t = getComputedStyle(jauge).transform;
    jauge.style.transition = 'none';
    jauge.style.transform = t === 'none' ? '' : t;
  }

  function lancerJauge(): void {
    jauge.style.transition = 'none';
    jauge.style.transform = 'scaleX(1)';
    jauge.getBoundingClientRect(); // l'état plein s'applique avant la transition
    jauge.style.transition = `transform ${DELAI}ms linear`;
    jauge.style.transform = 'scaleX(0)';
  }

  function afficherSecondes(): void {
    const reste = Math.max(0, DELAI - (performance.now() - debut));
    secondes.textContent = `${Math.ceil(reste / 1000)} s`;
  }

  function afficherDepart(message = ''): void {
    arreterMinuteries();
    jeton++;
    partie = null;
    ouverte = false;
    barre.hidden = true;
    bilan.hidden = true;
    t.carte.effacerMarques();
    ctx.terrains.montrer('monde');
    const records = lireRecords(stockage());
    liste.replaceChildren(
      ...toutes.map((s) => {
        const r = records.get(idEpreuve(s.id));
        const b = creer(
          'button',
          { type: 'button', class: 'essai-serie', 'data-serie': s.id },
          creer(
            'span',
            { class: 'essai-serie-nom' },
            nomSerie(s.id),
            creer(
              'span',
              { class: 'essai-serie-detail' },
              [s.id === SERIE_TOUS ? T.serie_tous_detail : '', r ? remplir(T.record, { points: fmtPts(r.points) }) : ''].filter(Boolean).join(' · '),
            ),
          ),
          creer('span', { class: 'essai-serie-n' }, remplir(textes.terrains[s.terrain].n, { n: s.n })),
        );
        if (s.id === serie?.id) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => choisir(s));
        return creer('li', {}, b);
      }),
    );
    statut.textContent = message;
    statut.hidden = !message;
    depart.hidden = false;
  }

  // Le monde part tout de suite ; l'île au premier choix se charge d'abord
  // (boutons désactivés, statut), et rien ne part si l'on a quitté le départ.
  function choisir(s: Serie): void {
    const j = ++jeton;
    const boutons = [...liste.querySelectorAll('button')];
    avecTerrain(ctx, s, { boutons, statut, encore: () => j === jeton }, (terrain, ids) => demarrer(s, terrain, ids, j));
  }

  function demarrer(s: Serie, terrain: Terrain, ids: string[], j: number): void {
    serie = s;
    t = terrain;
    depart.hidden = true;
    bilan.hidden = true;
    const lancer = () => {
      partie = new PartieChrono(melanger(ids), DELAI, ECHELLES_KM[s.terrain]);
      barre.hidden = false;
      poser();
    };
    if (t.nom === 'monde') return lancer();
    // L'île entière (zoom 1), peinte avant que le temps ne coure : deux images, puis la jauge.
    ctx.terrains.montrer(t.nom);
    t.carte.zoomer({ k: 1, x: 0, y: 0 });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (j === jeton) lancer();
      }),
    );
  }

  function poser(): void {
    arreterMinuteries();
    t.carte.effacerMarques();
    const id = partie?.courante;
    if (!partie || !id) return finir();
    consigne.replaceChildren(T.consigne, creer('strong', {}, nomDe(t.donnees, id)));
    consigne.dataset.cible = id;
    compte.textContent = `${partie.numero} / ${partie.cibles.length} · ${remplir(T.points, { points: fmtPts(partie.points) })}`;
    retro.textContent = '';
    retro.className = 'essai-retro';
    debut = performance.now();
    ouverte = true;
    lancerJauge();
    afficherSecondes();
    affichage = window.setInterval(afficherSecondes, 200);
    minuterie = window.setTimeout(expirer, DELAI);
  }

  function apres(q: QuestionJouee): void {
    ouverte = false;
    clearTimeout(minuterie);
    clearInterval(affichage);
    figerJauge();
    if (partie) compte.textContent = `${partie.numero - 1} / ${partie.cibles.length} · ${remplir(T.points, { points: fmtPts(partie.points) })}`;
    pause = window.setTimeout(poser, q.juste ? PAUSE_JUSTE_MS : PAUSE_FAUX_MS);
  }

  function expirer(): void {
    const id = partie?.courante;
    if (!partie || !id || !ouverte) return;
    const q = partie.expirer();
    secondes.textContent = '0 s';
    t.carte.effacerMarques();
    t.carte.marquer(id, 'juste');
    anneauSiPetite(t, id, 'juste');
    retro.className = 'essai-retro faux';
    retro.textContent = textes.terrains[t.nom].expire;
    apres(q);
  }

  function finir(): void {
    arreterMinuteries();
    ouverte = false;
    barre.hidden = true;
    t.carte.effacerMarques();
    if (!partie || !serie) return afficherDepart();
    const d = t.donnees;
    const score = partie.score();
    const epreuve = idEpreuve(serie.id);
    const bp = enregistrerPartie(stockage(), epreuve, score, Date.now());
    const b = bp.toujours;
    const manquees = partie.jouees.filter((q) => !q.juste);
    const ligne = (q: QuestionJouee) =>
      q.temps_ms == null
        ? remplir(T.bilan_expire, { pays: nomDe(d, q.id) })
        : remplir(T.bilan_faux, {
            pays: nomDe(d, q.id),
            touche: q.touche ? nomDe(d, q.touche) : T.la_mer,
            km: q.distance_km == null ? '—' : fmtKm(q.distance_km),
            points: fmtPts(q.points),
          });
    const s = serie;
    bilan.replaceChildren(
      creer('h2', {}, remplir(T.bilan_titre, { serie: nomSerie(s.id) })),
      creer('p', { class: 'chrono-score' }, remplir(T.bilan_score, { points: fmtPts(score.points), max: fmtPts(score.questions * POINTS_JUSTE) })),
      creer('p', { class: 'hint' }, remplir(T.bilan_detail, { justes: score.justes, n: score.questions, temps: fmtTemps(score.temps_ms) })),
      creer(
        'p',
        { class: b.nouveau ? 'chrono-record nouveau' : 'chrono-record' },
        b.nouveau
          ? b.ancien
            ? remplir(T.nouveau_record_bat, { points: fmtPts(b.ancien.points) })
            : T.premier_record
          : remplir(T.record_a_battre, { points: fmtPts(b.record.points), temps: fmtTemps(b.record.temps_ms) }),
      ),
      creer(
        'div',
        { class: 'essai-actions' },
        creer('button', { type: 'button', id: 'chrono-rejouer' }, T.rejouer),
        creer('button', { type: 'button', class: 'secondary', id: 'chrono-autre' }, T.autre_serie),
      ),
      blocClassement(epreuve, T.classement_titre, (pseudo) => publierPartie(pseudo, epreuve, bp)),
      ...(manquees.length ? [creer('ul', { class: 'essai-rates' }, ...manquees.map((q) => creer('li', {}, ligne(q))))] : []),
    );
    bilan.querySelector('#chrono-rejouer')?.addEventListener('click', () => choisir(s));
    bilan.querySelector('#chrono-autre')?.addEventListener('click', () => afficherDepart());
    partie = null;
    bilan.hidden = false;
  }

  abandonner.addEventListener('click', () => afficherDepart(T.abandon));

  // Classement général : la somme des records de toutes les séries.
  general.addEventListener('click', () => {
    jeton++;
    depart.hidden = true;
    const retour = creer('button', { type: 'button', class: 'secondary', id: 'chrono-retour' }, T.retour);
    retour.addEventListener('click', () => afficherDepart());
    bilan.replaceChildren(
      creer('h2', {}, T.general_titre),
      creer('p', { class: 'hint' }, T.general_aide),
      blocClassement(GENERAL, T.classement_titre),
      creer('div', { class: 'essai-actions' }, retour),
    );
    bilan.hidden = false;
  });

  return {
    activer() {
      if (bilanAuRetour) {
        bilanAuRetour = false;
        ctx.terrains.montrer(t.nom);
        depart.hidden = true;
        bilan.hidden = false;
        return;
      }
      afficherDepart(messageRetour);
      messageRetour = '';
    },
    desactiver() {
      // La dernière réponse donnée (pause de sa rétroaction) : la partie est
      // finie, elle va au bilan (record, publication) comme sans la sortie.
      if (partie?.finie) {
        finir();
        bilanAuRetour = true;
      } else bilanAuRetour = false;
      // Le temps ne se met pas en pause : une partie quittée est abandonnée.
      const enCours = partie !== null;
      arreterMinuteries();
      jeton++;
      partie = null;
      ouverte = false;
      barre.hidden = true;
      depart.hidden = true;
      bilan.hidden = true;
      messageRetour = enCours ? T.abandon : '';
      t.carte.effacerMarques();
      ctx.terrains.montrer('monde');
    },
    toucher(x, y, ev) {
      const id = partie?.courante;
      if (!partie || !id || !ouverte) return;
      const carte = t.carte;
      const d = t.donnees;
      ctx.mesures.toucher(ev, x, y, () => {
        const temps_ms = performance.now() - debut;
        const note = carte.noter(id, x, y);
        const r = note.pick;
        const q = partie!.repondre(r?.id ?? null, note.juste, note.distance_km, temps_ms);
        carte.effacerMarques();
        carte.marquer(id, 'juste');
        if (q.juste) {
          retro.className = 'essai-retro juste';
          retro.textContent = remplir(T.juste, { points: fmtPts(q.points) });
        } else {
          if (r && r.id !== id) carte.marquer(r.id, 'faux');
          anneauSiPetite(t, id, 'juste');
          retro.className = 'essai-retro faux';
          retro.textContent = remplir(T.faux, {
            touche: r ? nomDe(d, r.id) : T.la_mer,
            km: note.distance_km == null ? '—' : fmtKm(note.distance_km),
            points: fmtPts(q.points),
          });
        }
        apres(q);
        return { pick: r, cible: id, juste: note.juste, distance_km: note.distance_km };
      });
    },
  };
}
