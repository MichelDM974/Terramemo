// Vue « Classements » (bouton 🏆 de l'en-tête ; décisions « En-tête »,
// « Classements par épreuve » et « Sans faute et Minute ») : d'abord mes
// places, le général puis chaque épreuve où mon pseudo est classé, avec rang et
// score, de toujours ou de la semaine ; « Toutes les épreuves » montre les
// autres. Les lignes vont par mode, sous son titre : Chrono (le général en
// tête, qui n'additionne que lui), Sans faute, Minute ; puis par sujet, sous le
// sien (h4 : Pays, Capitales, Drapeaux, Communes ; étude J2 § 8.3). Toucher une ligne
// ouvre ses dix premiers (blocClassement), « ‹ Classements » ramène à la
// liste. Les séries de chaque sujet viennent dans l'ordre de partout
// (décision « Écran Jouer », EPREUVES_SUJETS) : tous les pays, les
// continents ; l'île.
// Lectures (D52 b, décision « Général à tous les sujets ») : à l'ouverture, le
// général et les seules épreuves où l'appareil a un record (ceux du profil du
// compte y sont, reçus à chaque ouverture de l'appli : src/sync/profil.ts,
// appliquer), plus les places déjà vues sur l'appareil ; le reste se lit à la
// demande, sujet par sujet (« Chercher mes places » sous « Toutes les
// épreuves »). Les épreuves d'un sujet pas encore ouvert (EPREUVES_OUVERTES)
// n'y sont pas : la bascule se relit à chaque ouverture. Relu à chaque
// ouverture ; « Retour » ramène à la vue d'avant, « × » à la carte (main.ts).
import { clePseudo, epreuvesClassees, lireRecords, maintenantEpreuves, modeEpreuve, MODES_EPREUVE, periodeSemaine, sujetEpreuve, type ModeEpreuve, type RecordChrono } from '../epreuve/chrono';
import { GENERAL, mesPlaces, type MaPlace } from '../epreuve/classement';
import { nomSujet } from './arbre';
import { nomSerie } from './cibles';
import { blocClassement, lirePseudo, relancerAttente } from './classement';
import { creer, croix, type ContexteVue, type Vue } from './commun';
import { nomMode, scoreCourt } from './scores';
import { remplir, textes } from './textes';

const T = textes.chrono;
type Periode = 'toujours' | 'semaine';

/**
 * Nom affiché d'une épreuve : « Général », un continent, « Tous les pays »,
 * « La Réunion » pour les pays et les communes (clé `localiser`, inchangé) ;
 * le sujet devant la série pour les autres : « Capitales · Afrique » (étude
 * J2 § 3.2).
 */
export function nomEpreuve(epreuve: string): string {
  if (epreuve === GENERAL) return T.general_nom;
  const [, cle, serie] = epreuve.split(':');
  if (serie === undefined) return nomSerie(epreuve);
  return cle === 'localiser' ? nomSerie(serie) : remplir(T.epreuve_sujet, { sujet: nomSujet(cle ?? ''), serie: nomSerie(serie) });
}

const estModeEpreuve = (m: string | null): m is ModeEpreuve => (MODES_EPREUVE as readonly (string | null)[]).includes(m);

/** Titre du classement d'une épreuve : « Sans faute · Afrique » ; le général a le sien (le quiz, au lot 4b : son nom seul d'ici là). */
export function titreEpreuve(epreuve: string): string {
  if (epreuve === GENERAL) return T.general_titre;
  const mode = modeEpreuve(epreuve);
  return estModeEpreuve(mode) ? remplir(T.bilan_titre, { mode: nomMode(mode), serie: nomEpreuve(epreuve) }) : nomEpreuve(epreuve);
}

/** « 1er sur 3 », « 4e sur 12 ». */
export function rangSur(rang: number, joueurs: number): string {
  return remplir(T.rang_sur, { rang: rang === 1 ? T.rang_1 : remplir(T.rang_n, { n: rang }), n: joueurs });
}

/** Les places déjà vues sur l'appareil (D52 b) : la clé du pseudo, et les épreuves où il en avait une. */
const CLE_VUES = 'terramemo.classements.vues';

function stockage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Les épreuves où ce pseudo avait une place, vue sur cet appareil ; vide pour un autre pseudo, sans stockage ou s'il est illisible. */
export function lireVues(pseudo: string): Set<string> {
  try {
    const v = JSON.parse(stockage()?.getItem(CLE_VUES) ?? 'null') as { pseudo?: unknown; epreuves?: unknown } | null;
    if (!v || v.pseudo !== clePseudo(pseudo) || !Array.isArray(v.epreuves)) return new Set();
    return new Set(v.epreuves.filter((e): e is string => typeof e === 'string'));
  } catch {
    return new Set();
  }
}

/** Ajoute ces épreuves aux places vues du pseudo (celles d'un autre pseudo sont oubliées). */
function garderVues(pseudo: string, epreuves: Iterable<string>): void {
  const vues = lireVues(pseudo);
  const avant = vues.size;
  for (const e of epreuves) if (e !== GENERAL) vues.add(e);
  if (vues.size === avant && avant) return;
  try {
    stockage()?.setItem(CLE_VUES, JSON.stringify({ pseudo: clePseudo(pseudo), epreuves: [...vues] }));
  } catch {
    // Sans stockage : elles se relisent par « Chercher mes places ».
  }
}

/**
 * Les épreuves à lire à l'ouverture du 🏆 pour cette période (D52 b) : parmi
 * `classees`, celles où l'appareil a un record de la période, plus les
 * places déjà vues (`vues`). Le général se lit toujours, à part.
 */
export function epreuvesALire(classees: readonly string[], records: ReadonlyMap<string, RecordChrono>, periode: string, vues: ReadonlySet<string>): string[] {
  return classees.filter((e) => vues.has(e) || records.has(periode === 'toujours' ? e : `${e}@${periode}`));
}

export function vueGeneral(ctx: ContexteVue, o: { retour: () => void; versCarte: () => void }): Vue {
  const panneau = creer('div', { class: 'essai-bilan panel', id: 'classement-general' });
  panneau.hidden = true;
  ctx.zone.append(panneau);
  let periode: Periode = 'toujours';
  // Seule la dernière lecture s'affiche (changement de période en cours de lecture).
  let lecture = 0;

  function boutonRetour(): HTMLButtonElement {
    const b = creer('button', { type: 'button', class: 'secondary', id: 'classement-retour' }, T.retour);
    b.addEventListener('click', () => o.retour());
    return b;
  }

  /** Une ligne : sa place, « pas encore classé » (lue, ou sans pseudo), rien si elle n'est pas lue. */
  function ligne(epreuve: string, p: MaPlace | null, lue: boolean): HTMLLIElement {
    const detail = p ? rangSur(p.rang, p.joueurs) : lue ? T.pas_classe : '';
    const b = creer(
      'button',
      { type: 'button', class: 'essai-serie', 'data-epreuve': epreuve },
      creer('span', { class: 'essai-serie-nom' }, nomEpreuve(epreuve), ...(detail ? [creer('span', { class: 'essai-serie-detail' }, detail)] : [])),
      creer('span', { class: 'essai-serie-n' }, p ? scoreCourt(modeEpreuve(epreuve), p.place.points) : ''),
    );
    b.addEventListener('click', () => ouvrirEpreuve(epreuve));
    return creer('li', {}, b);
  }

  interface EtatListe {
    places: ReadonlyMap<string, MaPlace>;
    /** Lue : sa ligne dit « pas encore classé » quand elle n'a pas de place. */
    lue(epreuve: string): boolean;
    /** Le bouton « Chercher mes places » d'un sujet dont des épreuves ne sont pas lues ; null : pas de bouton. */
    chercher?: (sujet: string) => HTMLElement | null;
  }

  /**
   * Les lignes de ces épreuves, par mode sous son titre (h3), puis par sujet
   * sous le sien (h4) ; le général en tête du Chrono. Les modes et les sujets
   * sans ligne sont omis.
   */
  function groupes(epreuves: readonly string[], e: EtatListe): HTMLElement[] {
    const lignes = (es: readonly string[]) => creer('ul', { class: 'essai-series' }, ...es.map((x) => ligne(x, e.places.get(x) ?? null, e.lue(x))));
    return MODES_EPREUVE.flatMap((m) => {
      const duMode = epreuves.filter((x) => modeEpreuve(x) === m);
      if (!duMode.length) return [];
      const general = duMode.filter((x) => x === GENERAL);
      const sujets = [...new Set(duMode.map(sujetEpreuve).filter((x) => x !== null))];
      return [
        creer(
          'section',
          { class: 'classements-groupe', 'data-mode': m },
          creer('h3', {}, nomMode(m)),
          ...(general.length ? [lignes(general)] : []),
          ...sujets.map((su) => {
            const b = e.chercher?.(su) ?? null;
            return creer(
              'div',
              { class: 'classements-sujet', 'data-sujet': su },
              creer('div', { class: 'classements-sujet-tete' }, creer('h4', {}, nomSujet(su)), ...(b ? [b] : [])),
              lignes(duMode.filter((x) => sujetEpreuve(x) === su)),
            );
          }),
        ),
      ];
    });
  }

  function liste(): void {
    const n = ++lecture;
    const boutons = (
      [
        ['toujours', T.toujours],
        ['semaine', T.semaine],
      ] as const
    ).map(([v, libelle]) => {
      const b = creer('button', { type: 'button', 'data-v': v, class: v === periode ? 'active' : '' }, libelle);
      b.addEventListener('click', () => {
        periode = v;
        liste();
      });
      return b;
    });
    const mes = creer('div', { id: 'classements-mes' });
    const etat = creer('p', { class: 'hint chrono-classement-etat' }, T.chargement);
    const autres = creer('div', { id: 'classements-autres' });
    autres.hidden = true;
    const plus = creer('button', { type: 'button', class: 'lien', id: 'classements-plus' }, T.toutes_epreuves);
    plus.hidden = true;
    plus.addEventListener('click', () => {
      autres.hidden = !autres.hidden;
      plus.textContent = autres.hidden ? T.toutes_epreuves : T.masquer_epreuves;
    });
    const pseudo = lirePseudo();
    panneau.replaceChildren(
      croix(o.versCarte),
      creer('div', { class: 'chrono-classement-tete' }, creer('h2', {}, T.classements_titre), creer('div', { class: 'seg', role: 'group', 'aria-label': T.periode }, ...boutons)),
      creer('p', { class: 'hint' }, pseudo ? T.classements_aide : T.classements_sans_pseudo),
      mes,
      etat,
      plus,
      autres,
      creer('div', { class: 'essai-actions' }, boutonRetour()),
    );
    // Les épreuves ouvertes à cette ouverture (bascule datée relue ici).
    const classees = epreuvesClassees(maintenantEpreuves());
    const toutes = [GENERAL, ...classees];
    // Toutes les épreuves d'un coup, sans place (pas de pseudo, hors ligne).
    const sansPlaces = (texte: string, lue: boolean) => {
      etat.textContent = texte;
      etat.hidden = !texte;
      mes.replaceChildren(...groupes(toutes, { places: new Map(), lue: () => lue }));
    };
    if (!pseudo) return sansPlaces('', true);
    const p = periode === 'toujours' ? 'toujours' : periodeSemaine(Date.now());
    const places = new Map<string, MaPlace>();
    const lues = new Set<string>();
    // « Chercher mes places » : les sujets en cours de lecture, et ceux dont la dernière a échoué (hors ligne).
    // Gardés ici, car chaque dessiner() recrée les boutons : un sujet en cours ne se relance pas, un échec se voit.
    const enCours = new Set<string>();
    const echecs = new Set<string>();

    /** Lit ces épreuves (mesPlaces), puis redessine ; lève hors ligne. */
    async function lire(epreuves: readonly string[]): Promise<boolean> {
      const trouvees = await mesPlaces(p, pseudo!, epreuves);
      if (n !== lecture) return false;
      for (const e of epreuves) lues.add(e);
      for (const x of trouvees) places.set(x.epreuve, x);
      garderVues(pseudo!, trouvees.map((x) => x.epreuve));
      return true;
    }

    /** « Chercher mes places » d'un sujet : ses épreuves pas encore lues, à la demande (D52 b). */
    function chercher(sujet: string): HTMLElement | null {
      const aLire = toutes.filter((e) => !lues.has(e) && sujetEpreuve(e) === sujet);
      if (!aLire.length) return null;
      const b = creer(
        'button',
        { type: 'button', class: 'lien classements-chercher', 'data-sujet': sujet },
        enCours.has(sujet) ? T.chargement : echecs.has(sujet) ? T.chercher_echec : T.chercher_places,
      );
      b.disabled = enCours.has(sujet);
      b.addEventListener('click', () => {
        if (enCours.has(sujet)) return;
        enCours.add(sujet);
        echecs.delete(sujet);
        // Les boutons du sujet (un par mode) disent tous la lecture en cours.
        dessiner();
        lire(aLire).then(
          (ok) => {
            enCours.delete(sujet);
            if (ok) dessiner();
          },
          () => {
            enCours.delete(sujet);
            if (n !== lecture) return;
            echecs.add(sujet);
            dessiner();
          },
        );
      });
      return b;
    }

    function dessiner(): void {
      const trouvees = toutes.filter((e) => places.has(e));
      const reste = toutes.filter((e) => !places.has(e));
      const e: EtatListe = { places, lue: (x) => lues.has(x), chercher };
      if (!trouvees.length) {
        // Aucune place parmi celles lues : toutes les épreuves ici, le reste à chercher sujet par sujet.
        etat.textContent = T.classements_aucune;
        etat.hidden = false;
        mes.replaceChildren(...groupes(reste, e));
        autres.replaceChildren();
        plus.hidden = true;
        return;
      }
      etat.hidden = true;
      mes.replaceChildren(...groupes(trouvees, { places, lue: () => true }));
      autres.replaceChildren(...groupes(reste, e));
      plus.hidden = !reste.length;
    }

    void (async () => {
      try {
        // Les scores faits hors ligne d'abord, pour que mes places les montrent.
        await relancerAttente().catch(() => null);
        if (n !== lecture) return;
        const aLire = [GENERAL, ...epreuvesALire(classees, lireRecords(stockage()), p, lireVues(pseudo))];
        if (await lire(aLire)) dessiner();
      } catch {
        if (n === lecture) sansPlaces(T.indisponible, false);
      }
    })();
  }

  function ouvrirEpreuve(epreuve: string): void {
    lecture++;
    const versListe = creer('button', { type: 'button', class: 'secondary', id: 'classements-liste' }, T.retour_classements);
    versListe.addEventListener('click', () => liste());
    panneau.replaceChildren(
      croix(o.versCarte),
      creer('h2', {}, titreEpreuve(epreuve)),
      ...(epreuve === GENERAL ? [creer('p', { class: 'hint' }, T.general_aide)] : []),
      blocClassement(epreuve, T.classement_titre, undefined, periode),
      creer('div', { class: 'essai-actions' }, versListe, boutonRetour()),
    );
  }

  return {
    activer() {
      liste();
      panneau.hidden = false;
    },
    desactiver() {
      lecture++;
      panneau.hidden = true;
    },
  };
}
