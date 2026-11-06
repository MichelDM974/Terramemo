// Vue « Crédits » (⚙ › Crédits et licences, #credits ; plan de travail, J1a :
// « écran Crédits ») : les données (Natural Earth, Unicode CLDR, IGN ADMIN
// EXPRESS, avec la date de mise à jour de l'IGN lue dans son sources.json),
// les bibliothèques que le site et l'APK embarquent (vérifiées sur le build :
// les outils de développement n'y sont pas), celles de l'APK seul (AndroidX,
// Kotlin…) et la police, chacune avec sa licence et son auteur ; puis, dépliés
// à la demande, les textes des licences et les avis de copyright (#20 :
// licences-tierces.txt, produit au build par licences/tierces.ts). Dépliés sur
// place plutôt qu'un lien vers le fichier : dans l'APK, on ne quitte pas
// l'appli (choix du 06/11). Les versions des dépendances directes viennent de
// package.json, pour ne pas vieillir. Textes : textes.fr.json (credits).
import { dependencies } from '../../package.json';
import { dateCredit, type SourcesTerrain } from '../map/donnees-terrain';
import { REUNION } from '../map/terrain';
import { creer, type ContexteVue, type Vue } from './commun';
import { remplir, textes } from './textes';

const T = textes.credits;
const VERSIONS: Readonly<Record<string, string>> = dependencies;
/** Le fichier des licences tierces, à la racine (FICHIER_LICENCES de licences/tierces.ts, lu par Node seul). */
export const URL_LICENCES = '/licences-tierces.txt';

interface Credit {
  nom: string | HTMLElement;
  detail: string;
  licence: string;
  auteur: string;
  lien?: string;
}

/** Un paquet, avec sa version s'il est une dépendance directe : « d3-geo 3.1.2 ». */
const nomPaquet = (p: string): string => (VERSIONS[p] ? `${p}\u00a0${VERSIONS[p]}` : p);

/** Les paquets d'une ligne : « d3-geo 3.1.2, d3-zoom 3.0.1 ». */
export function nomPaquets(paquets: readonly string[]): string {
  return paquets.map(nomPaquet).join(', ');
}

/** Le nom d'une ligne de paquets : chacun insécable (« d3-transition » jamais coupé à son tiret). */
function nomsInsecables(paquets: readonly string[]): HTMLElement {
  const n = creer('span', { class: 'credits-nom' });
  paquets.forEach((p, i) => n.append(...(i ? [', '] : []), creer('span', { class: 'credits-paquet' }, nomPaquet(p))));
  return n;
}

/** Une ligne : le nom, puis « détail · licence · auteur », la licence en lien vers son texte s'il y en a un. */
function ligne(c: Credit, o: { id?: string; auteur?: HTMLElement } = {}): HTMLLIElement {
  const licence = c.lien ? creer('a', { href: c.lien, target: '_blank', rel: 'noopener', class: 'credits-licence' }, c.licence) : creer('span', { class: 'credits-licence' }, c.licence);
  return creer(
    'li',
    o.id ? { 'data-credit': o.id } : {},
    typeof c.nom === 'string' ? creer('span', { class: 'credits-nom' }, c.nom) : c.nom,
    creer('span', { class: 'hint credits-detail' }, `${c.detail} · `, licence, ' · ', o.auteur ?? c.auteur),
  );
}

export function vueCredits(ctx: ContexteVue, o: { retour: () => void }): Vue {
  // L'IGN demande la date de dernière mise à jour : lue à la première ouverture (le sources.json de l'île, ~2 ko).
  const auteurIgn = creer('span', {}, T.donnees[2]!.auteur);
  let dateLue = false;
  const lireDate = () => {
    if (dateLue) return;
    dateLue = true;
    fetch(`${REUNION.dossier}sources.json`)
      .then((r) => (r.ok ? (r.json() as Promise<SourcesTerrain>) : null))
      .then((s) => {
        const date = s && dateCredit(s);
        if (date) auteurIgn.textContent = remplir(T.ign_date, { date });
      })
      .catch(() => {
        dateLue = false;
      });
  };

  // Les textes des licences (~27 ko), téléchargés à la première ouverture du dépliant ; un échec se retente à la suivante.
  const texteLicences = creer('pre', { class: 'credits-licences-texte', id: 'credits-licences-texte' }, T.licences_chargement);
  const licences = creer('details', { class: 'credits-licences', id: 'credits-licences' }, creer('summary', {}, T.licences_resume), texteLicences);
  let licencesLues = false;
  licences.addEventListener('toggle', () => {
    if (!licences.open || licencesLues) return;
    licencesLues = true;
    texteLicences.textContent = T.licences_chargement;
    fetch(URL_LICENCES)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => {
        texteLicences.textContent = t;
      })
      .catch(() => {
        licencesLues = false;
        texteLicences.textContent = T.licences_erreur;
      });
  });

  const retour = creer('button', { type: 'button', class: 'secondary', id: 'credits-retour' }, T.retour);
  retour.addEventListener('click', () => o.retour());
  const section = creer(
    'section',
    { class: 'vue-credits', id: 'vue-credits' },
    creer(
      'div',
      { class: 'panel' },
      creer('h2', {}, T.titre),
      creer('p', { class: 'hint' }, T.intro),
      creer('h3', {}, T.donnees_titre),
      creer('ul', { class: 'credits-liste', id: 'credits-liste-donnees' }, ...T.donnees.map((c, i) => ligne(c, i === 2 ? { id: 'ign', auteur: auteurIgn } : {}))),
      creer('h3', {}, T.bibliotheques_titre),
      creer('p', { class: 'hint' }, T.bibliotheques_aide),
      creer(
        'ul',
        { class: 'credits-liste', id: 'credits-bibliotheques' },
        ...T.bibliotheques.map((b) => ligne({ ...b, nom: nomsInsecables(b.paquets) }, { id: b.paquets.join(' ') })),
      ),
      creer('h3', {}, T.android_titre),
      creer('p', { class: 'hint' }, T.android_aide),
      creer('ul', { class: 'credits-liste', id: 'credits-android' }, ...T.android.map((a) => ligne(a, { id: a.groupes.join(' ') }))),
      licences,
      creer('h3', {}, T.police_titre),
      creer('ul', { class: 'credits-liste', id: 'credits-police' }, ligne(T.police)),
      creer('div', { class: 'essai-actions' }, retour),
    ),
  );
  section.hidden = true;
  ctx.zone.append(section);

  return {
    activer() {
      lireDate();
      section.hidden = false;
      ctx.carte.masquer(true);
    },
    desactiver() {
      section.hidden = true;
      ctx.carte.masquer(false);
    },
  };
}
