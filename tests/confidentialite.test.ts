// Politique de confidentialité et page de suppression (J1b, lot 5 ; étude
// § 7.3) : les pages statiques de public/ (lisibles sans JS, style commun, les
// faits vérifiés de la politique, une seule adresse de contact), et la vue
// #confidentialite (src/vues/confidentialite.ts) qui insère le <main> de la
// page dans l'appli, sur un DOM factice.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterLiens, contenuDePage, SITE, URL_CONFIDENTIALITE, vueConfidentialite } from '../src/vues/confidentialite';
import { vueCredits } from '../src/vues/credits';
import { textes } from '../src/vues/textes';
import { installerDom, type El } from './dom-factice';

const PAGES = { confidentialite: readFileSync('public/confidentialite.html', 'utf8'), suppression: readFileSync('public/suppression.html', 'utf8') };
const sansCommentaires = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
/** Le texte d'une page, sans balises ni commentaires, espaces resserrés. */
const texteDe = (html: string) =>
  sansCommentaires(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
const adresses = (html: string) => [...sansCommentaires(html).matchAll(/mailto:([^"]+)"/g)].map((m) => m[1]!);
const C = textes.compte;

describe('pages statiques (public/)', () => {
  it.each(Object.entries(PAGES))('%s : lisible sans JS, en français, style commun, un seul <main>', (nom, html) => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toMatch(/<html lang="fr">/);
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1">/);
    expect(html).toMatch(/<link rel="stylesheet" href="\/documents\.css">/);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/style="/);
    expect(sansCommentaires(html).match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<title>Terramemo — [^<]+<\/title>/);
    expect(html).toContain('<p class="version">Version du 07/11/2026</p>');
    expect(nom).toBeTruthy();
  });

  it('une seule adresse de contact, la même sur les deux pages', () => {
    const toutes = [...adresses(PAGES.confidentialite), ...adresses(PAGES.suppression)];
    expect(toutes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(toutes).size).toBe(1);
    expect(toutes[0]).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/i);
    // Le texte du lien est l'adresse elle-même.
    expect(texteDe(PAGES.confidentialite)).toContain(toutes[0]);
    // La vue Compte la donne aussi (suppression qu'on ne peut plus finir) : la même.
    const dansLesTextes = JSON.stringify(textes).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
    expect(dansLesTextes.length).toBeGreaterThanOrEqual(1);
    expect(new Set([...dansLesTextes, toutes[0]]).size).toBe(1);
  });

  it('politique : le responsable, les faits vérifiés (firebase.json, docs de Firebase), les durées de D33', () => {
    const t = texteDe(PAGES.confidentialite);
    expect(t).toContain('Michel D.');
    // Firestore en eur3 : celui de firebase.json.
    const firebase = JSON.parse(readFileSync('firebase.json', 'utf8')) as { firestore: { location: string } };
    expect(firebase.firestore.location).toBe('eur3');
    expect(t).toContain('eur3, en Belgique et aux Pays-Bas');
    expect(t).toContain('Firebase Authentication fonctionne depuis des centres de données aux États-Unis');
    expect(t).toContain('Data Privacy Framework');
    expect(t).toContain('quelques semaines pour Firebase Authentication, quelques mois pour Firebase Hosting');
    // Invités : supprimés par Firebase 30 jours après leur création, pas par Terramemo.
    expect(t).toContain('supprimé par Firebase 30 jours après sa création');
    expect(t).toContain('Terramemo ne le supprime pas lui-même');
    expect(t).toContain('ou au bout de 2 ans sans activité (vérifiés chaque trimestre : 2 ans et 3 mois au plus)');
    expect(t).toContain('retirées sous 30 jours');
    // Des durées que l'outil du propriétaire tient à sa tournée mensuelle (§ 7.5), pas « un jour ».
    expect(t).toContain('gardés 30 jours au plus');
    expect(t).not.toContain('un jour');
    // L'export, caché avec la vue Compte jusqu'à l'ouverture des comptes : en attendant, par e-mail.
    expect(t).toContain('Cette entrée arrive avec l\'ouverture des comptes');
    expect(t).toContain('180 jours');
    expect(t).toContain('ne fixe pas d\'âge minimum');
    expect(t).toContain('CNIL');
    // Les chemins de l'appli, tels que la vue Compte les nomme.
    expect(t).toContain(`« ${C.exporter} » (⚙ › Compte, sur le site)`);
    expect(t).toContain(`« ${C.supprimer_lien} » (⚙ › Compte)`);
    // Pas de mesure d'audience dans l'appli : aucune bibliothèque d'analyse embarquée.
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).not.toMatch(/analytics|gtag|matomo|plausible/i);
  });

  it('suppression : nomme Terramemo, les étapes de l’appli, le lien #compte, l’e-mail, ce qui est gardé', () => {
    const t = texteDe(PAGES.suppression);
    expect(t).toContain('Supprimer son compte Terramemo');
    expect(PAGES.suppression).toContain('<a href="/#compte">terramemo-geo.web.app/#compte</a>');
    expect(t).toContain(`« ${C.supprimer_lien} »`);
    expect(t).toContain(`« ${C.supprimer_bouton} »`);
    expect(t).toContain('Écris « supprimer »');
    expect(t).toContain('n\'est traitée que si elle vient de l\'adresse du compte');
    expect(t).toContain('retirées sous 30 jours');
    expect(t).toContain('30 jours au plus');
    expect(t).not.toContain('un jour');
    // La reprise d'une suppression coupée : dans ⚙ › Compte, pas d'avis à l'ouverture de l'appli.
    expect(t).toContain(`ouvre de nouveau ⚙ › Compte : « ${C.suppression_inachevee} » la finit`);
    expect(t).not.toContain('ouverture suivante');
    expect(t).toContain('180 jours');
    expect(t).toContain(`« ${C.effacer_appareil} »`);
  });

  it('les liens entre pages et les fichiers servis existent', () => {
    for (const html of Object.values(PAGES))
      for (const [, href] of sansCommentaires(html).matchAll(/href="([^"#:]+\.(?:html|css|woff2))"/g)) expect(existsSync(`public/${href!.replace(/^\//, '')}`), href).toBe(true);
    expect(PAGES.confidentialite).toContain('href="suppression.html"');
    expect(PAGES.suppression).toContain('href="confidentialite.html"');
  });

  it('documents.css : la palette de src/style.css, couleurs seulement dans :root', () => {
    const racine = (css: string) => Object.fromEntries([...(/:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
    const doc = readFileSync('public/documents.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const app = racine(readFileSync('src/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
    const palette = racine(doc);
    expect(Object.keys(palette).length).toBeGreaterThan(5);
    for (const [k, v] of Object.entries(palette)) expect(v, k).toBe(app[k]);
    expect(doc.replace(/:root\s*\{[^}]*\}/g, '').match(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi) ?? []).toEqual([]);
  });
});

/** Un lien factice : ses attributs dans une carte. */
function lien(href: string) {
  const attrs = new Map([['href', href]]);
  return { attrs, getAttribute: (n: string) => attrs.get(n) ?? null, setAttribute: (n: string, v: string) => void attrs.set(n, v) };
}

describe('liens de la page dans l’appli', () => {
  it('une ancre de l’appli reste dedans ; une autre page du site et un lien externe s’ouvrent à part ; mailto tel quel', () => {
    const [compte, page, externe, mail, ancre] = [lien('/#compte'), lien('suppression.html'), lien('https://www.cnil.fr/fr/plaintes'), lien('mailto:x@exemple.fr'), lien('#compte')];
    adapterLiens([compte, page, externe, mail, ancre]);
    expect(Object.fromEntries(compte.attrs)).toEqual({ href: '#compte' });
    expect(Object.fromEntries(ancre.attrs)).toEqual({ href: '#compte' });
    expect(Object.fromEntries(page.attrs)).toEqual({ href: `${SITE}/suppression.html`, target: '_blank', rel: 'noopener' });
    expect(Object.fromEntries(externe.attrs)).toEqual({ href: 'https://www.cnil.fr/fr/plaintes', target: '_blank', rel: 'noopener' });
    expect(Object.fromEntries(mail.attrs)).toEqual({ href: 'mailto:x@exemple.fr' });
  });

  it('contenuDePage : les enfants du <main>, liens adaptés ; null sans <main>', () => {
    const liens = [lien('suppression.html')];
    const enfants = ['h1', 'p'];
    const main = { querySelectorAll: () => liens, childNodes: enfants };
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString(html: string) {
          return { querySelector: (s: string) => (s === 'main' && html.includes('<main') ? main : null) };
        }
      },
    );
    const doc = { importNode: (n: unknown) => `copie de ${String(n)}` } as unknown as Document;
    expect(contenuDePage('<main>…</main>', doc)).toEqual(['copie de h1', 'copie de p']);
    expect(liens[0]!.attrs.get('href')).toBe(`${SITE}/suppression.html`);
    expect(contenuDePage('<p>rien</p>', doc)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('vue #confidentialite', () => {
  const T = textes.confidentialite;
  const attendre = () => new Promise((r) => setTimeout(r, 0));
  let zone: El;
  let masquee: boolean[];
  beforeEach(() => {
    installerDom();
    zone = document.createElement('main') as unknown as El;
    masquee = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  function ouvrir(lire: () => Promise<Node[]>) {
    const retour = vi.fn();
    const versCarte = vi.fn();
    const v = vueConfidentialite({ zone, carte: { masquer: (m: boolean) => masquee.push(m) } } as never, { retour, versCarte, lire });
    return { v, retour, versCarte };
  }

  it('à la première ouverture : « Chargement… », puis le contenu de la page ; lue une fois', async () => {
    let finir!: (n: Node[]) => void;
    const lire = vi.fn(() => new Promise<Node[]>((ok) => (finir = ok)));
    const { v, retour } = ouvrir(lire);
    v.activer();
    expect(masquee).toEqual([true]);
    expect(zone.querySelector('#confidentialite-texte')!.textContent).toBe(T.chargement);
    const h1 = document.createElement('h1') as unknown as El;
    h1.textContent = 'Politique de confidentialité';
    finir([h1 as unknown as Node]);
    await attendre();
    expect(zone.querySelector('#confidentialite-texte')!.textContent).toBe('Politique de confidentialité');
    v.desactiver();
    v.activer();
    expect(lire).toHaveBeenCalledOnce();
    zone.querySelector('#confidentialite-retour')!.click();
    expect(retour).toHaveBeenCalled();
  });

  it('« × » (#18) : la carte, pas la vue d’avant', () => {
    const { v, retour, versCarte } = ouvrir(() => new Promise<Node[]>(() => undefined));
    v.activer();
    const x = zone.querySelector('.panel .croix')!;
    expect(x.getAttribute('aria-label')).toBe(textes.croix.carte);
    x.click();
    expect(versCarte).toHaveBeenCalledOnce();
    expect(retour).not.toHaveBeenCalled();
  });

  it('hors ligne : un avis et « Réessayer », qui relit la page', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lire = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce([]);
    const { v } = ouvrir(lire);
    v.activer();
    await attendre();
    expect(zone.querySelector('#confidentialite-erreur')!.textContent).toBe(T.erreur);
    const r = zone.querySelector('#confidentialite-reessayer')!;
    expect(r.hidden).toBe(false);
    r.click();
    await attendre();
    expect(lire).toHaveBeenCalledTimes(2);
    expect(zone.querySelector('#confidentialite-erreur')!.textContent).toBe('');
    expect(r.hidden).toBe(true);
  });

  it('les liens vers la vue : ⚙ (à côté de Crédits, pour tous), Crédits', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/<a href="#credits" id="lien-credits"><\/a><\/p>\s*<!--[\s\S]*?-->\s*<p class="reglage-outil"><a href="#confidentialite" id="lien-confidentialite"><\/a><\/p>/);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    vueCredits({ zone, carte: { masquer: () => undefined } } as never, { retour: () => undefined, versCarte: () => undefined });
    const a = zone.querySelector('#credits-confidentialite')!;
    expect([a.getAttribute('href'), a.textContent]).toEqual(['#confidentialite', textes.credits.confidentialite]);
  });

  it('la page lue par défaut : public/confidentialite.html, à la racine du site et de l’APK', () => {
    expect(URL_CONFIDENTIALITE).toBe('/confidentialite.html');
    expect(existsSync(`public${URL_CONFIDENTIALITE}`)).toBe(true);
  });
});
