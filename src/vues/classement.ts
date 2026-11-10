// Bloc « Classement » d'une épreuve (#14) : de toujours ou de la semaine, les dix
// premiers, ma place et mon rang ; le pseudo public, choisi une fois (rien
// n'est publié sans lui) et qui nomme la place : le même pseudo sur deux
// appareils, c'est une seule place (décision « Une place par pseudo »).
// Firebase n'est chargé qu'à l'ouverture du bloc, ou pour un envoi en attente.
import type { BilanPartie } from '../epreuve/chrono';
import { comparerScores, type ScoreEpreuve } from '../epreuve/bareme';
import { EPREUVES, EPREUVES_CLASSEES, garderPseudoDans, lirePseudoDe, lireRecords, prendreAvisPseudo, modeEpreuve, periodeSemaine, pseudoValide, recordDe, recordPubliable, totalGeneral, vraisemblable } from '../epreuve/chrono';
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

/**
 * Ajoute un envoi à la file (échec), ou l'en retire (publié, ou refusé par
 * les règles : inutile de le refaire), sauf si `aJour` dit que l'appareil a
 * mieux depuis : un envoi plus récent de la même place a pu échouer pendant
 * celui-ci, qui ne doit pas effacer son entrée.
 */
function marquer(epreuve: string, periode: string, echec: boolean, aJour: () => boolean): void {
  if (!echec && !aJour()) return;
  const reste = lireAttente().filter(([e, p]) => e !== epreuve || p !== periode);
  ecrireAttente(echec ? [...reste, [epreuve, periode]] : reste);
}

/** Le meilleur score publiable du record de l'appareil pour cette place (null sans record publiable). */
function publiableDe(epreuve: string, periode: string): ScoreEpreuve | null {
  const r = recordDe(lireRecords(stockage()), epreuve, periode);
  return r && recordPubliable(r, epreuve);
}

const memeScore = (a: ScoreEpreuve | null, b: ScoreEpreuve | null) => (a === null ? b === null : b !== null && comparerScores(a, b) === 0);

/**
 * Chaque score part seul : un refus ou un échec n'empêche pas les autres
 * (allSettled). Un score que les règles refuseraient (vraisemblable) n'est
 * pas écrit : il compte comme refusé, sans dépenser d'écriture. Puis le
 * général de chaque période de `generaux`, une fois les scores publiés : les
 * records de l'appareil et les places en ligne du pseudo (ses autres
 * appareils), le meilleur des deux par épreuve (totalGeneral). La file
 * d'attente ne bouge que sur la réponse du serveur, ou son absence : un
 * envoi qui échoue (hors ligne) y entre, refait au retour du réseau
 * (relancerAttente) ; un envoi qui aboutit, ou que les règles refusent, en
 * sort. Un score refusé d'avance laisse en place l'envoi qui attendait (le
 * meilleur score publiable de la série, que relancerAttente enverra).
 */
async function envoyer(pseudo: string, envois: readonly Envoi[], generaux: readonly string[]): Promise<Publication> {
  const ecrits = envois.map(([e, , sc]) => vraisemblable(sc, e));
  const res = await Promise.allSettled(envois.map(([e, p, sc], i) => (ecrits[i] ? publier(e, p, pseudo, sc) : Promise.resolve(false))));
  envois.forEach(([e, p, sc], i) => {
    const pub = publiableDe(e, p);
    if (ecrits[i]) marquer(e, p, res[i]?.status === 'rejected', () => !pub || comparerScores(pub, sc) >= 0);
  });
  const records = lireRecords(stockage());
  const deGeneraux = await Promise.allSettled(
    generaux.map(async (p) => {
      const t = totalGeneral(records, p, await placesDuPseudo(p, pseudo));
      return t ? (vraisemblable(t, GENERAL) ? publier(GENERAL, p, pseudo, t) : false) : true;
    }),
  );
  generaux.forEach((p, i) => {
    // Le total de l'appareil a changé pendant l'envoi (une partie de plus) : son entrée reste.
    const avant = totalGeneral(records, p);
    marquer(GENERAL, p, deGeneraux[i]?.status === 'rejected', () => memeScore(avant, totalGeneral(lireRecords(stockage()), p)));
  });
  res.push(...deGeneraux);
  return {
    refuses: res.filter((r) => r.status === 'fulfilled' && !r.value).length,
    echecs: res.filter((r) => r.status === 'rejected').length,
  };
}

let relance: Promise<Publication | null> | null = null;

async function renvoyer(pseudo: string): Promise<Publication> {
  const periode = periodeSemaine(Date.now());
  const envois: Envoi[] = [];
  const generaux: string[] = [];
  for (const [e, p] of lireAttente()) {
    if (p !== 'toujours' && p !== periode) continue;
    if (e === GENERAL) generaux.push(p);
    else {
      const pub = publiableDe(e, p);
      if (pub) envois.push([e, p, pub]);
    }
  }
  ecrireAttente([...envois.map(([e, p]): EnAttente => [e, p]), ...generaux.map((p): EnAttente => [GENERAL, p])]);
  return envoyer(pseudo, envois, generaux);
}

/**
 * Refait les envois en attente sous le pseudo de l'appareil : chaque record
 * repart à son meilleur score publiable du moment (il a pu progresser
 * depuis), et chaque général se recalcule. Une semaine passée sort de la
 * file sans envoi (les règles la refuseraient), comme un record disparu ou
 * sans score publiable. null : rien à refaire (file vide ou pas de pseudo),
 * ou un autre onglet s'en charge (verrou Web Locks, quand il existe). Un
 * seul renvoi à la fois : un appel pendant un renvoi rend celui-ci.
 */
export function relancerAttente(): Promise<Publication | null> {
  if (relance) return relance;
  const pseudo = lirePseudo();
  if (!pseudo || !lireAttente().length) return Promise.resolve(null);
  const verrous = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  relance = (
    verrous ? verrous.request(CLE_ATTENTE, { ifAvailable: true }, (v) => (v ? renvoyer(pseudo) : null)) : renvoyer(pseudo)
  ).finally(() => {
    relance = null;
  });
  return relance;
}

/**
 * Quelques secondes après le démarrage de l'appli, à chaque retour du réseau
 * (événement online) et quand l'appli revient au premier plan (APK sorti de
 * l'arrière-plan, onglet de nouveau visible) : les scores faits hors ligne
 * partent d'eux-mêmes. Rien n'est chargé tant que la file est vide.
 */
export function brancherRelance(cible: Pick<Window, 'addEventListener' | 'setTimeout'> = window, delai_ms = 3000): void {
  const relancer = () => void relancerAttente().catch(() => undefined);
  cible.addEventListener('online', relancer);
  cible.addEventListener('visibilitychange', () => {
    if ((globalThis as { document?: { visibilityState?: string } }).document?.visibilityState !== 'hidden') relancer();
  });
  cible.setTimeout(relancer, delai_ms);
}

/**
 * Publie tous les records de l'appareil (de toujours et de la semaine), des
 * épreuves que cette version classe elle-même (EPREUVES_CLASSEES), pris à
 * leur meilleur score publiable (recordPubliable), et les deux totaux du
 * Chrono : au choix ou au changement du pseudo.
 */
export async function publierTout(pseudo: string): Promise<Publication> {
  // Un renvoi sous l'ancien pseudo finit d'abord : il effacerait sinon les échecs de celui-ci.
  await relance?.catch(() => null);
  const records = lireRecords(stockage());
  const periode = periodeSemaine(Date.now());
  // Tout repart : la file ne gardera que ce qui échoue cette fois.
  ecrireAttente([]);
  const envois: Envoi[] = [];
  for (const [cle, r] of records) {
    const [epreuve, sem] = cle.split('@');
    // Une épreuve que cette version ne classe pas, venue par le profil d'une plus récente : ni envoi, ni refus annoncé
    // (étude J2 § 3.2). Un mode inconnu, mais aussi le quiz avant l'ouverture de son classement (§ 9.5, D50 c) ou les
    // épreuves d'un sujet pas encore ouvertes : les règles les refuseraient. La version qui les classe les republie
    // elle-même sous le pseudo du profil (sync/comptes.ts, pseudoPris).
    if (!epreuve || !EPREUVES_CLASSEES.includes(epreuve)) continue;
    const p = sem === undefined ? 'toujours' : sem === periode ? periode : null;
    if (p) envois.push([epreuve, p, recordPubliable(r, epreuve) ?? r]);
  }
  const generaux = ['toujours', periode].filter((p) => envois.some(([e, q]) => q === p && EPREUVES.includes(e)));
  return envoyer(pseudo, envois, generaux);
}

/**
 * Après une partie : seulement ce qui a progressé sur l'appareil (jusqu'à 4
 * écritures, 2 hors des épreuves du général, EPREUVES : Sans faute et Minute
 * n'y comptent pas). Un nouveau record que les règles refuseraient est compté refusé
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
    if (EPREUVES.includes(epreuve)) generaux.push(periode);
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
  const liste = creer('ol', { class: `chrono-places ${mode ?? ''}`.trim() });
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

/*
 * Le champ du pseudo public, commun au panneau de la première ouverture
 * (pseudo de l'invité, src/vues/accueil.ts) et à l'écran « pseudo » des
 * comptes (src/vues/compte.ts) : mêmes attributs (remplissage automatique,
 * clavier), même validation que le classement (pseudoValide), même avis qui
 * s'efface dès qu'on corrige. Ici plutôt que dans un module à lui : un
 * module de plus partagé par le morceau principal et celui des comptes
 * faisait éclater le morceau principal en quatre (Rolldown), +2,3 Ko gzip au
 * premier chargement.
 */
export interface ChampPseudo {
  /** Le libellé, le champ et son aide (.compte-champ). */
  bloc: HTMLDivElement;
  input: HTMLInputElement;
  /** Le pseudo nettoyé, ou null : l'avis posé dans `erreur`, le champ marqué invalide et focalisé. */
  valider(): string | null;
}

export function champPseudo(o: {
  id: string;
  libelle: string;
  /** Sous le champ, lue avec lui (aria-describedby). */
  aide: string;
  valeur: string;
  /** Où dire le refus (role=alert). */
  erreur: HTMLElement;
  /** La touche Entrée du clavier virtuel : « go » (commencer), « done » (enregistrer). */
  entree: 'go' | 'done';
}): ChampPseudo {
  const idAide = `${o.id}-aide`;
  const input = creer('input', {
    type: 'text',
    id: o.id,
    name: 'pseudo',
    maxlength: '20',
    autocomplete: 'nickname',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: o.entree,
    required: '',
    'aria-describedby': idAide,
  });
  input.value = o.valeur;
  // L'avis d'un pseudo refusé s'efface dès qu'on le corrige.
  input.addEventListener('input', () => {
    o.erreur.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  const bloc = creer(
    'div',
    { class: 'compte-champ' },
    creer('label', { for: o.id }, o.libelle),
    creer('div', { class: 'compte-ligne' }, input),
    creer('p', { class: 'hint compte-champ-aide', id: idAide }, o.aide),
  );
  return {
    bloc,
    input,
    valider() {
      const p = pseudoValide(input.value);
      if (!p) {
        o.erreur.textContent = textes.chrono.pseudo_invalide;
        input.setAttribute('aria-invalid', 'true');
        if (typeof input.focus === 'function') input.focus();
        return null;
      }
      input.removeAttribute('aria-invalid');
      return p;
    },
  };
}
