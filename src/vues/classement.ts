// Bloc « Classement » du Chrono (#14) : de toujours ou de la semaine, les dix
// premiers, ma place et mon rang ; le pseudo public, choisi une fois (rien
// n'est publié sans lui) et qui nomme la place : le même pseudo sur deux
// appareils, c'est une seule place (décision « Une place par pseudo »).
// Firebase n'est chargé qu'à l'ouverture du bloc.
import type { BilanPartie } from '../epreuve/chrono';
import type { ScoreEpreuve } from '../epreuve/bareme';
import { lireRecords, periodeSemaine, pseudoValide, recordDe, recordPubliable, totalGeneral, vraisemblable } from '../epreuve/chrono';
import { GENERAL, lireTableau, placesDuPseudo, publier, type Place } from '../epreuve/classement';
import { creer } from './commun';
import { remplir, textes } from './textes';

const T = textes.chrono;
const CLE_PSEUDO = 'terramemo.pseudo';

function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function lirePseudo(): string | null {
  try {
    return pseudoValide(stockage()?.getItem(CLE_PSEUDO) ?? '');
  } catch {
    return null;
  }
}

function garderPseudo(p: string): void {
  try {
    stockage()?.setItem(CLE_PSEUDO, p);
  } catch {
    // Sans stockage, le pseudo vaut pour cette visite.
  }
}

const fmtPts = (n: number) => n.toLocaleString('fr-FR');
function fmtTemps(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

/** Ce qu'a donné un lot de publications : scores refusés (par les règles, ou d'avance), envois échoués (hors ligne). */
export interface Publication {
  refuses: number;
  echecs: number;
}

type Envoi = [epreuve: string, periode: string, score: ScoreEpreuve];

/**
 * Chaque score part seul : un refus ou un échec n'empêche pas les autres
 * (allSettled). Un score que les règles refuseraient (vraisemblable) n'est
 * pas écrit : il compte comme refusé, sans dépenser d'écriture. Puis le
 * général de chaque période de `generaux`, une fois les scores publiés : les
 * records de l'appareil et les places en ligne du pseudo (ses autres
 * appareils), le meilleur des deux par épreuve (totalGeneral).
 */
async function envoyer(pseudo: string, envois: readonly Envoi[], generaux: readonly string[]): Promise<Publication> {
  const ecrire = ([e, p, sc]: Envoi) => (vraisemblable(sc) ? publier(e, p, pseudo, sc) : Promise.resolve(false));
  const res = await Promise.allSettled(envois.map(ecrire));
  const records = lireRecords(stockage());
  res.push(
    ...(await Promise.allSettled(
      generaux.map(async (p) => {
        const t = totalGeneral(records, p, await placesDuPseudo(p, pseudo));
        return t ? ecrire([GENERAL, p, t]) : true;
      }),
    )),
  );
  return {
    refuses: res.filter((r) => r.status === 'fulfilled' && !r.value).length,
    echecs: res.filter((r) => r.status === 'rejected').length,
  };
}

/**
 * Publie tous les records de l'appareil (de toujours et de la semaine), pris
 * à leur meilleur score publiable (recordPubliable), et les deux totaux : au
 * choix ou au changement du pseudo.
 */
export async function publierTout(pseudo: string): Promise<Publication> {
  const records = lireRecords(stockage());
  const periode = periodeSemaine(Date.now());
  const envois: Envoi[] = [];
  for (const [cle, r] of records) {
    const [epreuve, sem] = cle.split('@');
    if (!epreuve) continue;
    const p = sem === undefined ? 'toujours' : sem === periode ? periode : null;
    if (p) envois.push([epreuve, p, recordPubliable(r) ?? r]);
  }
  const generaux = ['toujours', periode].filter((p) => envois.some(([, q]) => q === p));
  return envoyer(pseudo, envois, generaux);
}

/**
 * Après une partie : seulement ce qui a progressé sur l'appareil (jusqu'à 4
 * écritures). Un nouveau record que les règles refuseraient est compté
 * refusé sans être écrit ; un score qui bat le meilleur publiable sans battre
 * le record de l'appareil part quand même.
 */
export async function publierPartie(pseudo: string, epreuve: string, b: BilanPartie): Promise<Publication> {
  const records = lireRecords(stockage());
  const envois: Envoi[] = [];
  const generaux: string[] = [];
  for (const [bilan, periode] of [
    [b.toujours, 'toujours'],
    [b.semaine, b.periode],
  ] as const) {
    if (!bilan.nouveau && !bilan.progresPubliable) continue;
    const r = recordDe(records, epreuve, periode);
    const pub = r && recordPubliable(r);
    if (r && bilan.nouveau && !vraisemblable(r)) envois.push([epreuve, periode, r]);
    if (pub && bilan.progresPubliable) envois.push([epreuve, periode, pub]);
    generaux.push(periode);
  }
  return envoyer(pseudo, envois, generaux);
}

/** Ce que le bloc dit au joueur d'une publication ('' : tout est passé). */
export function avisPublication(p: Publication): string {
  return [p.refuses ? T.publication_refusee : '', p.echecs ? T.publication_echec : ''].filter(Boolean).join(' ');
}

/**
 * Le bloc d'un classement (une épreuve, ou GENERAL). `apresPartie` publie la
 * partie qui vient de finir avant de lire le classement, si le pseudo existe ;
 * `periodeInitiale` : 'semaine' pour ouvrir sur la semaine.
 */
export function blocClassement(
  epreuve: string,
  titre: string,
  apresPartie?: (pseudo: string) => Promise<Publication>,
  periodeInitiale: 'toujours' | 'semaine' = 'toujours',
): HTMLElement {
  let periode: string = periodeInitiale;
  const boutons = (
    [
      ['toujours', T.toujours],
      ['semaine', T.semaine],
    ] as const
  ).map(([v, libelle]) => creer('button', { type: 'button', 'data-v': v }, libelle));
  const seg = creer('div', { class: 'seg', role: 'group', 'aria-label': T.periode }, ...boutons);
  const pseudoZone = creer('div', { class: 'chrono-pseudo' });
  const etat = creer('p', { class: 'hint chrono-classement-etat' });
  // Le sort de la dernière publication (refus, hors ligne), qui reste quand le classement se charge.
  const avis = creer('p', { class: 'hint chrono-classement-avis', 'aria-live': 'polite' });
  avis.hidden = true;
  const direAvis = (p: Publication) => {
    avis.textContent = avisPublication(p);
    avis.hidden = !avis.textContent;
  };
  const liste = creer('ol', { class: 'chrono-places' });
  const bloc = creer(
    'section',
    { class: 'chrono-classement', 'data-epreuve': epreuve },
    creer('div', { class: 'chrono-classement-tete' }, creer('h3', {}, titre), seg),
    pseudoZone,
    avis,
    liste,
    etat,
  );

  function ligne(p: Place, rang: number, moi: boolean): HTMLLIElement {
    return creer(
      'li',
      { class: moi ? 'moi' : '' },
      creer('span', { class: 'rang' }, String(rang)),
      creer('span', { class: 'pseudo' }, p.pseudo),
      creer('span', { class: 'pts' }, fmtPts(p.points)),
      creer('span', { class: 'temps' }, fmtTemps(p.temps_ms)),
    );
  }

  // Seule la dernière lecture s'affiche : celle lancée à l'ouverture (SDK à
  // charger) finissait après celle qui suit la publication du pseudo, et la
  // remplaçait par un classement vide.
  let derniere = 0;
  async function charger(): Promise<void> {
    const n = ++derniere;
    for (const b of boutons) b.classList.toggle('active', (b.dataset.v === 'toujours') === (periode === 'toujours'));
    etat.textContent = T.chargement;
    try {
      const t = await lireTableau(epreuve, periode === 'toujours' ? 'toujours' : periodeSemaine(Date.now()), lirePseudo());
      if (n !== derniere) return;
      const lignes = t.places.map((p, i) => ligne(p, i + 1, p.cle === t.moi?.cle));
      if (t.moi && t.rang && t.rang > t.places.length) lignes.push(creer('li', { class: 'ellipse' }, '…'), ligne(t.moi, t.rang, true));
      liste.replaceChildren(...lignes);
      etat.textContent = t.joueurs ? remplir(T.joueurs, { n: t.joueurs }) : T.vide;
    } catch {
      if (n !== derniere) return;
      liste.replaceChildren();
      etat.textContent = T.indisponible;
    }
  }

  function afficherPseudo(): void {
    const pseudo = lirePseudo();
    if (pseudo) {
      const changer = creer('button', { type: 'button', class: 'lien' }, T.changer);
      changer.addEventListener('click', () => formulaire(pseudo));
      pseudoZone.replaceChildren(creer('span', { class: 'hint' }, remplir(T.pseudo_actuel, { pseudo })), changer);
    } else formulaire('');
  }

  function formulaire(valeur: string): void {
    const champ = creer('input', { type: 'text', maxlength: '20', placeholder: T.pseudo_placeholder, autocomplete: 'off', 'aria-label': T.pseudo_placeholder });
    champ.value = valeur;
    const ok = creer('button', { type: 'button' }, T.publier);
    const aide = creer('p', { class: 'hint' }, T.pseudo_aide);
    const form = creer('div', { class: 'chrono-pseudo-form' }, champ, ok);
    pseudoZone.replaceChildren(aide, form);
    const envoyer = async () => {
      const p = pseudoValide(champ.value);
      if (!p) {
        aide.textContent = T.pseudo_invalide;
        return;
      }
      garderPseudo(p);
      afficherPseudo();
      derniere++; // une lecture en cours, d'avant la publication, ne s'affichera pas
      etat.textContent = T.publication;
      direAvis(await publierTout(p));
      await charger();
    };
    ok.addEventListener('click', () => void envoyer());
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void envoyer();
    });
  }

  for (const b of boutons)
    b.addEventListener('click', () => {
      periode = b.dataset.v ?? 'toujours';
      void charger();
    });

  afficherPseudo();
  const pseudo = lirePseudo();
  void (async () => {
    if (pseudo && apresPartie) {
      etat.textContent = T.publication;
      // Hors ligne ou refusé : le record reste sur l'appareil (publié à la
      // prochaine partie qui le bat, ou au changement du pseudo).
      direAvis(await apresPartie(pseudo));
    }
    await charger();
  })();
  return bloc;
}
