// Bloc « Classement » d'une épreuve (#14) : de toujours ou de la semaine, les dix
// premiers, ma place et mon rang ; le pseudo public, choisi une fois (rien
// n'est publié sans lui) et qui nomme la place : le même pseudo sur deux
// appareils, c'est une seule place (décision « Une place par pseudo »).
// Firebase n'est chargé qu'à l'ouverture du bloc, ou pour un envoi en attente.
import type { BilanPartie } from '../epreuve/chrono';
import type { ScoreEpreuve } from '../epreuve/bareme';
import { garderPseudoDans, lirePseudoDe, lireRecords, prendreAvisPseudo, modeEpreuve, periodeSemaine, pseudoValide, recordDe, recordPubliable, totalGeneral, vraisemblable } from '../epreuve/chrono';
import { GENERAL, lireTableau, placesDuPseudo, publier, type Place } from '../epreuve/classement';
import { comptesVisibles } from '../sync/drapeaux';
import { etatCompteConnu, profilModifie } from '../sync/pont';
import { creer } from './commun';
import { departage, fmtPts } from './scores';
import { remplir, textes } from './textes';

const T = textes.chrono;
/** Les envois échoués (hors ligne), à refaire : [épreuve, période], sans le score (relu des records au renvoi). */
const CLE_ATTENTE = 'terramemo.chrono.attente';

function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function lirePseudo(): string | null {
  return lirePseudoDe(stockage());
}

/**
 * Le pseudo choisi sur l'appareil (formulaire du classement) : gardé, et
 * porté au profil s'il y a un compte (J1b, § 5.4 ; rien pour un invité).
 */
function garderPseudo(p: string): void {
  garderPseudoDans(stockage(), p);
  profilModifie('pseudo');
}

/** Ce qu'a donné un lot de publications : scores refusés (par les règles, ou d'avance), envois échoués (hors ligne). */
export interface Publication {
  refuses: number;
  echecs: number;
}

type Envoi = [epreuve: string, periode: string, score: ScoreEpreuve];
type EnAttente = [epreuve: string, periode: string];

/** Les envois en attente, sans doublon ; vide sans stockage ou s'il est illisible. */
export function lireAttente(): EnAttente[] {
  try {
    const brut = JSON.parse(stockage()?.getItem(CLE_ATTENTE) ?? '[]') as unknown;
    if (!Array.isArray(brut)) return [];
    const vus = new Set<string>();
    return brut.filter((x): x is EnAttente => {
      if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== 'string' || typeof x[1] !== 'string') return false;
      const k = `${x[0]}@${x[1]}`;
      return !vus.has(k) && !!vus.add(k);
    });
  } catch {
    return [];
  }
}

function ecrireAttente(liste: readonly EnAttente[]): void {
  try {
    if (liste.length) stockage()?.setItem(CLE_ATTENTE, JSON.stringify(liste));
    else stockage()?.removeItem(CLE_ATTENTE);
  } catch {
    // Sans stockage, l'envoi échoué ne repartira qu'à la prochaine partie qui le bat.
  }
}

/** Ajoute (échec) ou retire (publié, ou refusé : inutile de le refaire) un envoi de la file. */
function marquer(epreuve: string, periode: string, enAttente: boolean): void {
  const reste = lireAttente().filter(([e, p]) => e !== epreuve || p !== periode);
  ecrireAttente(enAttente ? [...reste, [epreuve, periode]] : reste);
}

/**
 * Chaque score part seul : un refus ou un échec n'empêche pas les autres
 * (allSettled). Un score que les règles refuseraient (vraisemblable) n'est
 * pas écrit : il compte comme refusé, sans dépenser d'écriture. Puis le
 * général de chaque période de `generaux`, une fois les scores publiés : les
 * records de l'appareil et les places en ligne du pseudo (ses autres
 * appareils), le meilleur des deux par épreuve (totalGeneral). Un envoi qui
 * échoue (hors ligne) entre dans la file d'attente, refaite au retour du
 * réseau (relancerAttente) ; un envoi qui aboutit, ou que les règles
 * refusent, en sort.
 */
async function envoyer(pseudo: string, envois: readonly Envoi[], generaux: readonly string[]): Promise<Publication> {
  const ecrire = ([e, p, sc]: Envoi) => (vraisemblable(sc, e) ? publier(e, p, pseudo, sc) : Promise.resolve(false));
  const res = await Promise.allSettled(envois.map(ecrire));
  envois.forEach(([e, p], i) => marquer(e, p, res[i]?.status === 'rejected'));
  const records = lireRecords(stockage());
  const deGeneraux = await Promise.allSettled(
    generaux.map(async (p) => {
      const t = totalGeneral(records, p, await placesDuPseudo(p, pseudo));
      return t ? ecrire([GENERAL, p, t]) : true;
    }),
  );
  generaux.forEach((p, i) => marquer(GENERAL, p, deGeneraux[i]?.status === 'rejected'));
  res.push(...deGeneraux);
  return {
    refuses: res.filter((r) => r.status === 'fulfilled' && !r.value).length,
    echecs: res.filter((r) => r.status === 'rejected').length,
  };
}

let relance: Promise<Publication | null> | null = null;

/**
 * Refait les envois en attente sous le pseudo de l'appareil : chaque record
 * repart à son meilleur score publiable du moment (il a pu progresser
 * depuis), et chaque général se recalcule. Une semaine passée sort de la
 * file sans envoi (les règles la refuseraient), comme un record disparu.
 * null : rien à refaire (file vide ou pas de pseudo). Un seul renvoi à la
 * fois : un appel pendant un renvoi rend celui-ci.
 */
export function relancerAttente(): Promise<Publication | null> {
  if (relance) return relance;
  const pseudo = lirePseudo();
  const attente = lireAttente();
  if (!pseudo || !attente.length) return Promise.resolve(null);
  relance = (async () => {
    const records = lireRecords(stockage());
    const periode = periodeSemaine(Date.now());
    const envois: Envoi[] = [];
    const generaux: string[] = [];
    for (const [e, p] of attente) {
      if (p !== 'toujours' && p !== periode) continue;
      if (e === GENERAL) generaux.push(p);
      else {
        const r = recordDe(records, e, p);
        if (r) envois.push([e, p, recordPubliable(r, e) ?? r]);
      }
    }
    ecrireAttente([...envois.map(([e, p]): EnAttente => [e, p]), ...generaux.map((p): EnAttente => [GENERAL, p])]);
    return envoyer(pseudo, envois, generaux);
  })().finally(() => {
    relance = null;
  });
  return relance;
}

/**
 * Quelques secondes après le démarrage de l'appli, puis à chaque retour du réseau
 * (événement online) : les scores faits hors ligne partent d'eux-mêmes.
 */
export function brancherRelance(cible: Pick<Window, 'addEventListener' | 'setTimeout'> = window, delai_ms = 3000): void {
  const relancer = () => void relancerAttente().catch(() => undefined);
  cible.addEventListener('online', relancer);
  cible.setTimeout(relancer, delai_ms);
}

/**
 * Publie tous les records de l'appareil (de toujours et de la semaine), de
 * toutes les épreuves, pris à leur meilleur score publiable (recordPubliable),
 * et les deux totaux du Chrono : au choix ou au changement du pseudo.
 */
export async function publierTout(pseudo: string): Promise<Publication> {
  const records = lireRecords(stockage());
  const periode = periodeSemaine(Date.now());
  // Tout repart : la file ne gardera que ce qui échoue cette fois.
  ecrireAttente([]);
  const envois: Envoi[] = [];
  for (const [cle, r] of records) {
    const [epreuve, sem] = cle.split('@');
    if (!epreuve) continue;
    const p = sem === undefined ? 'toujours' : sem === periode ? periode : null;
    if (p) envois.push([epreuve, p, recordPubliable(r, epreuve) ?? r]);
  }
  const generaux = ['toujours', periode].filter((p) => envois.some(([e, q]) => q === p && modeEpreuve(e) === 'chrono'));
  return envoyer(pseudo, envois, generaux);
}

/**
 * Après une partie : seulement ce qui a progressé sur l'appareil (jusqu'à 4
 * écritures, 2 hors du Chrono : Sans faute et Minute ne comptent pas au
 * général). Un nouveau record que les règles refuseraient est compté refusé
 * sans être écrit ; un score qui bat le meilleur publiable sans battre le
 * record de l'appareil part quand même.
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
    const pub = r && recordPubliable(r, epreuve);
    if (r && bilan.nouveau && !vraisemblable(r, epreuve)) envois.push([epreuve, periode, r]);
    if (pub && bilan.progresPubliable) envois.push([epreuve, periode, pub]);
    if (modeEpreuve(epreuve) === 'chrono') generaux.push(periode);
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
  const mode = modeEpreuve(epreuve);
  const liste = creer('ol', { class: `chrono-places ${mode}` });
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
      creer('span', { class: 'temps' }, departage(mode, p)),
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

  /**
   * Le pseudo, ou le formulaire pour en choisir un. Pour un compte (J1b,
   * § 3.1), le pseudo est celui du compte et se change depuis la vue Compte ;
   * un invité y lit qu'un compte garderait pseudo et records (comptes
   * visibles seulement : cachés du public jusqu'au lot 8).
   */
  function afficherPseudo(): void {
    const pseudo = lirePseudo();
    const visibles = comptesVisibles();
    const etatCompte = etatCompteConnu();
    if (pseudo && visibles && etatCompte === 'compte') {
      pseudoZone.replaceChildren(
        creer('span', { class: 'hint' }, remplir(T.pseudo_compte, { pseudo })),
        creer('a', { href: '#compte', class: 'lien chrono-pseudo-compte' }, T.changer),
      );
    } else if (pseudo) {
      const changer = creer('button', { type: 'button', class: 'lien' }, T.changer);
      changer.addEventListener('click', () => formulaire(pseudo));
      pseudoZone.replaceChildren(creer('span', { class: 'hint' }, remplir(T.pseudo_actuel, { pseudo })), changer);
    } else return formulaire('');
    // Le pseudo de l'appareil remplacé par celui du compte (J1b, § 2.3, étape 7) : dit une fois.
    const ancien = pseudo && prendreAvisPseudo(stockage());
    if (ancien) pseudoZone.append(creer('p', { class: 'hint chrono-pseudo-avis', 'aria-live': 'polite' }, remplir(textes.compte.pseudo_du_compte, { pseudo })));
    inviterAuCompte();
  }

  /** Invité, comptes visibles : un lien discret vers la vue Compte, jamais une fenêtre qui s'impose. */
  function inviterAuCompte(): void {
    if (!comptesVisibles() || etatCompteConnu() !== 'invite') return;
    pseudoZone.append(creer('p', { class: 'hint chrono-invite-compte' }, creer('a', { href: '#compte', class: 'lien' }, T.avec_compte)));
  }

  function formulaire(valeur: string): void {
    const champ = creer('input', { type: 'text', maxlength: '20', placeholder: T.pseudo_placeholder, autocomplete: 'off', 'aria-label': T.pseudo_placeholder });
    champ.value = valeur;
    const ok = creer('button', { type: 'button' }, T.publier);
    const aide = creer('p', { class: 'hint' }, T.pseudo_aide);
    const form = creer('div', { class: 'chrono-pseudo-form' }, champ, ok);
    pseudoZone.replaceChildren(aide, form);
    inviterAuCompte();
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
    const pubs: Publication[] = [];
    if (pseudo && apresPartie) {
      etat.textContent = T.publication;
      // Refusé : le record reste sur l'appareil. Hors ligne : il attend dans
      // la file, refaite au retour du réseau, à l'ouverture d'un classement ou
      // au démarrage de l'appli.
      pubs.push(await apresPartie(pseudo));
    }
    // Les envois en attente d'avant, pour que le classement lu les montre ;
    // pas juste après une partie dont un envoi vient d'échouer (hors ligne).
    const attente = pubs.some((p) => p.echecs) ? null : await relancerAttente().catch(() => null);
    if (attente) pubs.push(attente);
    if (pubs.length) direAvis({ refuses: pubs.reduce((n, p) => n + p.refuses, 0), echecs: pubs.reduce((n, p) => n + p.echecs, 0) });
    await charger();
  })();
  return bloc;
}
