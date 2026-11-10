// Vue « Confidentialité » (#confidentialite ; étude du J1b, § 7.3, D25 a) :
// la politique de confidentialité dans l'appli, liée depuis ⚙, Crédits et le
// formulaire de création de compte. Un seul texte, la page statique
// public/confidentialite.html (un document, pas un texte d'interface : rien
// dans textes.fr.json) : téléchargée à la première ouverture, son <main>
// inséré ici, comme les licences tierces dans Crédits (décision « Licences
// tierces »). Dans l'APK, la page est locale : elle s'affiche hors ligne. Un
// lien direct vers le fichier remplacerait la page de l'appli dans l'APK ;
// les liens de la page vers une autre page du site s'ouvrent donc à part.
import { creer, croix, type ContexteVue, type Vue } from './commun';
import { textes } from './textes';

const T = textes.confidentialite;

/** La page de la politique, à la racine du site et de l'APK (public/). */
export const URL_CONFIDENTIALITE = '/confidentialite.html';
/** Le site : une autre page du site s'ouvre là, à part (dans l'APK, le navigateur du téléphone). */
export const SITE = 'https://terramemo-geo.web.app';

/** Ce que l'adaptation lit et écrit d'un lien. */
export interface LienPage {
  getAttribute(nom: string): string | null;
  setAttribute(nom: string, valeur: string): void;
}

/**
 * Les liens de la page, adaptés à la vue : une ancre de l'appli (`/#compte`)
 * reste dans l'appli ; une autre page du site (`suppression.html`) s'ouvre
 * sur le site, à part, comme un lien externe ; `mailto:` tel quel.
 */
export function adapterLiens(liens: Iterable<LienPage>): void {
  for (const a of liens) {
    const href = a.getAttribute('href') ?? '';
    if (/^mailto:/i.test(href)) continue;
    const ancre = /^\/?(#.+)$/.exec(href);
    if (ancre) {
      a.setAttribute('href', ancre[1]!);
      continue;
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) a.setAttribute('href', new URL(href, `${SITE}/`).href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  }
}

/** Le contenu du <main> d'une page HTML du site, ses liens adaptés ; null si elle n'en a pas. */
export function contenuDePage(html: string, doc: Document = document): Node[] | null {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const main = page.querySelector('main');
  if (!main) return null;
  adapterLiens(main.querySelectorAll('a[href]'));
  return [...main.childNodes].map((n) => doc.importNode(n, true));
}

/** Le contenu de la politique : téléchargé, puis son <main>. Lève hors ligne. */
async function lirePolitique(): Promise<Node[]> {
  const r = await fetch(URL_CONFIDENTIALITE);
  if (!r.ok) throw new Error(`${URL_CONFIDENTIALITE} : ${r.status}`);
  const c = contenuDePage(await r.text());
  if (!c) throw new Error(`${URL_CONFIDENTIALITE} sans <main>`);
  return c;
}

export function vueConfidentialite(ctx: ContexteVue, o: { retour: () => void; versCarte: () => void; lire?: () => Promise<Node[]> }): Vue {
  const lire = o.lire ?? lirePolitique;
  const texte = creer('div', { class: 'document', id: 'confidentialite-texte' }, creer('p', { class: 'hint' }, T.chargement));
  const avis = creer('p', { class: 'status error', id: 'confidentialite-erreur', role: 'alert' });
  const reessayer = creer('button', { type: 'button', id: 'confidentialite-reessayer' }, T.reessayer);
  reessayer.hidden = true;
  const retour = creer('button', { type: 'button', class: 'secondary', id: 'confidentialite-retour' }, T.retour);
  retour.addEventListener('click', () => o.retour());
  const section = creer(
    'section',
    { class: 'vue-confidentialite', id: 'vue-confidentialite' },
    creer('div', { class: 'panel' }, croix(o.versCarte), texte, avis, creer('div', { class: 'essai-actions' }, reessayer, retour)),
  );
  section.hidden = true;
  ctx.zone.append(section);

  // Téléchargée à la première ouverture ; un échec (hors ligne) se retente par « Réessayer » ou à la suivante.
  let lue = false;
  let enCours = false;
  function charger(): void {
    if (lue || enCours) return;
    enCours = true;
    avis.textContent = '';
    reessayer.hidden = true;
    texte.replaceChildren(creer('p', { class: 'hint' }, T.chargement));
    lire()
      .then(
        (n) => {
          lue = true;
          texte.replaceChildren(...n);
        },
        (e: unknown) => {
          console.warn('Politique de confidentialité non chargée :', e);
          texte.replaceChildren();
          avis.textContent = T.erreur;
          reessayer.hidden = false;
        },
      )
      .finally(() => {
        enCours = false;
      });
  }
  reessayer.addEventListener('click', () => charger());

  return {
    activer() {
      charger();
      section.hidden = false;
      ctx.carte.masquer(true);
    },
    desactiver() {
      section.hidden = true;
      ctx.carte.masquer(false);
    },
  };
}
