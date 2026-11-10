// Vue « Classements » (bouton 🏆 de l'en-tête ; décisions « En-tête »,
// « Classements par épreuve » et « Sans faute et Minute ») : d'abord mes
// places, le général puis chaque épreuve où mon pseudo est classé, avec rang et
// score, de toujours ou de la semaine ; « Toutes les épreuves » montre celles
// où il ne l'est pas encore. Les lignes vont par mode, sous son titre : Chrono
// (le général en tête, qui n'additionne que lui), Sans faute, Minute. Toucher
// une ligne ouvre ses dix premiers (blocClassement), « ‹ Classements » ramène à
// la liste. Les séries de chaque mode viennent dans l'ordre de partout
// (décision « Écran Jouer », EPREUVES_CLASSEES) : tous les pays, les
// continents, l'île. Relu à chaque ouverture ; « Retour » ramène à la vue
// d'avant, « × » à la carte (main.ts).
import { EPREUVES_CLASSEES, modeEpreuve, MODES_EPREUVE, periodeSemaine } from '../epreuve/chrono';
import { GENERAL, mesPlaces, type MaPlace } from '../epreuve/classement';
import { nomSerie } from './cibles';
import { blocClassement, lirePseudo, relancerAttente } from './classement';
import { creer, croix, type ContexteVue, type Vue } from './commun';
import { nomMode, scoreCourt } from './scores';
import { remplir, textes } from './textes';

const T = textes.chrono;
type Periode = 'toujours' | 'semaine';

/** Nom affiché d'une épreuve : « Général », un continent, « Tous les pays », « La Réunion ». */
export function nomEpreuve(epreuve: string): string {
  return epreuve === GENERAL ? T.general_nom : nomSerie(epreuve.split(':')[2] ?? epreuve);
}

/** Titre du classement d'une épreuve : « Sans faute · Afrique » ; le général a le sien. */
export function titreEpreuve(epreuve: string): string {
  return epreuve === GENERAL ? T.general_titre : remplir(T.bilan_titre, { mode: nomMode(modeEpreuve(epreuve)), serie: nomEpreuve(epreuve) });
}

/** « 1er sur 3 », « 4e sur 12 ». */
export function rangSur(rang: number, joueurs: number): string {
  return remplir(T.rang_sur, { rang: rang === 1 ? T.rang_1 : remplir(T.rang_n, { n: rang }), n: joueurs });
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

  function ligne(epreuve: string, p: MaPlace | null): HTMLLIElement {
    const b = creer(
      'button',
      { type: 'button', class: 'essai-serie', 'data-epreuve': epreuve },
      creer('span', { class: 'essai-serie-nom' }, nomEpreuve(epreuve), creer('span', { class: 'essai-serie-detail' }, p ? rangSur(p.rang, p.joueurs) : T.pas_classe)),
      creer('span', { class: 'essai-serie-n' }, p ? scoreCourt(modeEpreuve(epreuve), p.place.points) : ''),
    );
    b.addEventListener('click', () => detail(epreuve));
    return creer('li', {}, b);
  }

  /** Les lignes de ces épreuves, par mode sous son titre (les modes sans ligne sont omis). */
  function groupes(epreuves: readonly string[], places: ReadonlyMap<string, MaPlace>): HTMLElement[] {
    return MODES_EPREUVE.flatMap((m) => {
      const lignes = epreuves.filter((e) => modeEpreuve(e) === m).map((e) => ligne(e, places.get(e) ?? null));
      return lignes.length ? [creer('section', { class: 'classements-groupe', 'data-mode': m }, creer('h3', {}, nomMode(m)), creer('ul', { class: 'essai-series' }, ...lignes))] : [];
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
    const toutes = [GENERAL, ...EPREUVES_CLASSEES];
    // Toutes les épreuves d'un coup, sans place (pas de pseudo, hors ligne, aucune place).
    const sansPlaces = (texte: string) => {
      etat.textContent = texte;
      etat.hidden = !texte;
      mes.replaceChildren(...groupes(toutes, new Map()));
    };
    if (!pseudo) return sansPlaces('');
    void (async () => {
      try {
        // Les scores faits hors ligne d'abord, pour que mes places les montrent.
        await relancerAttente().catch(() => null);
        const places = await mesPlaces(periode === 'toujours' ? 'toujours' : periodeSemaine(Date.now()), pseudo);
        if (n !== lecture) return;
        if (!places.length) return sansPlaces(T.classements_aucune);
        const parEpreuve = new Map(places.map((p) => [p.epreuve, p]));
        const reste = toutes.filter((e) => !parEpreuve.has(e));
        etat.hidden = true;
        mes.replaceChildren(...groupes(places.map((p) => p.epreuve), parEpreuve));
        autres.replaceChildren(...groupes(reste, new Map()));
        plus.hidden = !reste.length;
      } catch {
        if (n === lecture) sansPlaces(T.indisponible);
      }
    })();
  }

  function detail(epreuve: string): void {
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
