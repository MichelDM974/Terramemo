// Vue « Classements » (bouton 🏆 de l'en-tête ; décisions « En-tête » et
// « Classements par épreuve ») : d'abord mes places, le général puis chaque
// épreuve où mon pseudo est classé, avec rang et points, de toujours ou de la
// semaine ; « Toutes les épreuves » montre celles où il ne l'est pas encore.
// Toucher une ligne ouvre ses dix premiers (blocClassement), « ‹ Classements »
// ramène à la liste. Relu à chaque ouverture ; « Retour » ramène à la vue
// d'avant (main.ts).
import { EPREUVES, periodeSemaine } from '../epreuve/chrono';
import { GENERAL, mesPlaces, type MaPlace } from '../epreuve/classement';
import { SERIE_REUNION, SERIE_TOUS } from './cibles';
import { blocClassement, lirePseudo } from './classement';
import { creer, type ContexteVue, type Vue } from './commun';
import { remplir, textes } from './textes';

const T = textes.chrono;
type Periode = 'toujours' | 'semaine';

/** Nom affiché d'une épreuve : « Général », un continent, « Tous les pays », « La Réunion ». */
export function nomEpreuve(epreuve: string): string {
  if (epreuve === GENERAL) return T.general_nom;
  const serie = epreuve.split(':')[2] ?? epreuve;
  if (serie === SERIE_TOUS) return textes.toucher.serie_tous;
  if (serie === SERIE_REUNION) return textes.terrains.reunion.serie;
  return (textes.continents as Record<string, string>)[serie] ?? serie;
}

/** « 1er sur 3 », « 4e sur 12 ». */
export function rangSur(rang: number, joueurs: number): string {
  return remplir(T.rang_sur, { rang: rang === 1 ? T.rang_1 : remplir(T.rang_n, { n: rang }), n: joueurs });
}

const fmtPts = (n: number) => n.toLocaleString('fr-FR');

export function vueGeneral(ctx: ContexteVue, o: { retour: () => void }): Vue {
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
      creer('span', { class: 'essai-serie-n' }, p ? fmtPts(p.place.points) : ''),
    );
    b.addEventListener('click', () => detail(epreuve));
    return creer('li', {}, b);
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
    const mes = creer('ul', { class: 'essai-series', id: 'classements-mes' });
    const etat = creer('p', { class: 'hint chrono-classement-etat' }, T.chargement);
    const autres = creer('ul', { class: 'essai-series', id: 'classements-autres' });
    autres.hidden = true;
    const plus = creer('button', { type: 'button', class: 'lien', id: 'classements-plus' }, T.toutes_epreuves);
    plus.hidden = true;
    plus.addEventListener('click', () => {
      autres.hidden = !autres.hidden;
      plus.textContent = autres.hidden ? T.toutes_epreuves : T.masquer_epreuves;
    });
    const pseudo = lirePseudo();
    panneau.replaceChildren(
      creer('div', { class: 'chrono-classement-tete' }, creer('h2', {}, T.classements_titre), creer('div', { class: 'seg', role: 'group', 'aria-label': T.periode }, ...boutons)),
      creer('p', { class: 'hint' }, pseudo ? T.classements_aide : T.classements_sans_pseudo),
      mes,
      etat,
      plus,
      autres,
      creer('div', { class: 'essai-actions' }, boutonRetour()),
    );
    const toutes = [GENERAL, ...EPREUVES];
    // Toutes les épreuves d'un coup, sans place (pas de pseudo, hors ligne, aucune place).
    const sansPlaces = (texte: string) => {
      etat.textContent = texte;
      etat.hidden = !texte;
      mes.replaceChildren(...toutes.map((e) => ligne(e, null)));
    };
    if (!pseudo) return sansPlaces('');
    void (async () => {
      try {
        const places = await mesPlaces(periode === 'toujours' ? 'toujours' : periodeSemaine(Date.now()), pseudo);
        if (n !== lecture) return;
        if (!places.length) return sansPlaces(T.classements_aucune);
        const classees = new Set(places.map((p) => p.epreuve));
        const reste = toutes.filter((e) => !classees.has(e));
        etat.hidden = true;
        mes.replaceChildren(...places.map((p) => ligne(p.epreuve, p)));
        autres.replaceChildren(...reste.map((e) => ligne(e, null)));
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
      creer('h2', {}, epreuve === GENERAL ? T.general_titre : nomEpreuve(epreuve)),
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
