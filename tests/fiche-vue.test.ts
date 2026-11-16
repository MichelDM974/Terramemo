// La fiche d'un lieu à l'accueil (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 4.1 à § 4.7 et § 7 ; lot F1) : la barre devenue bouton (ligne de faits, chevron,
// hauteur réservée), la feuille (tête, faits, voisins, mémoire, pied), le voile, le
// zoom caché, Échap et la popup ⚙, les voisins et leur pile, la recherche. Les vraies
// données du dépôt (pays.json, fiches du monde, capitales, drapeaux), le DOM factice ;
// l'historique est la pile de la vue (navigation.ts seule : tests/navigation.test.ts),
// sauf au dernier bloc, où la vue est branchée sur la vraie navigation. Le DOM factice
// ne met rien en page : hauteurs, toucher sous le voile et vol de la carte sont au
// pilote (ui_fiche).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lireFichesMonde, type DonneesFichesMonde, type FichierMonde, type FichierMondeLangue } from '../src/fiches/donnees';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import { lireDrapeaux, type ManifesteDrapeaux } from '../src/map/drapeaux';
import type { Pays } from '../src/map/types';
import type { CarteMemoire } from '../src/vues/carte-memoire';
import type { ContexteVue } from '../src/vues/commun';
import { creerNavigation, type Historique, type VueNavigable } from '../src/navigation';
import { versAncre } from '../src/vues/arbre';
import { vueExplorer, type OptionsFiche } from '../src/vues/explorer';
import { textes } from '../src/vues/textes';
import { brancherZoom } from '../src/zoom-carte';
import { El, installerDom } from './dom-factice';

const lire = <T>(f: string): T => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8')) as T;
const pays = lire<Pays[]>('pays.json');
const noms = lire<Record<string, string>>('noms.fr.json');
const FICHES: DonneesFichesMonde = lireFichesMonde(lire<FichierMonde>('fiches-monde.json'), lire<FichierMondeLangue>('fiches-monde.fr.json'));
const CAPITALES = lireCapitales(lire<LigneCapitales[]>('capitales.json'), lire<NomsCapitales>('capitales.fr.json'));
const DRAPEAUX = lireDrapeaux(lire<ManifesteDrapeaux>('drapeaux.json'));
const T = textes.fiche;

/** Les promesses en attente (chargements, morceau de la fiche) tenues. */
const tenir = () => new Promise((r) => setTimeout(r, 0));

/** Une promesse qu'on tient à la main. */
function differee<T>() {
  let tenir!: (v: T) => void;
  let rompre!: (e: unknown) => void;
  const promesse = new Promise<T>((a, b) => ((tenir = a), (rompre = b)));
  return { promesse, tenir, rompre };
}

function monter(o: { fiche?: Partial<OptionsFiche>; memoire?: CarteMemoire } = {}) {
  const body = installerDom();
  const zone = new El('main');
  let pickSuivant = 'JPN';
  const montres: string[] = [];
  const touches: string[] = [];
  const carte = {
    cacherPastilles() {},
    effacerMarques() {},
    marquer: (id: string) => void touches.push(id),
    anneau() {},
    anneauEn() {},
    teinter() {},
    pick: () => ({ id: pickSuivant, via: 'trace' }),
    hote: new El('div'),
    montrer: (id: string) => void montres.push(id),
    vueEntiere() {},
    zoomerDe: vi.fn(),
    contexteFinal: () => ({ proj: { scale: () => 100 }, t: { k: 50 } }),
    projection: { scale: () => 100 },
    transfo: { k: 1 },
  };
  const donnees = { entites: pays.map((p) => ({ pays: p })), noms };
  const monde = { nom: 'monde', carte, donnees, jouables: pays.filter((p) => p.statut === 'jouable').map((p) => p.id) };
  const ctx = {
    carte,
    donnees,
    zone,
    // L'île jamais chargée, hors ligne.
    terrains: { monde, montrer() {}, deja: () => null, charger: () => Promise.reject(new Error('hors ligne')) },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const charges: string[] = [];
  const fiche: OptionsFiche = {
    fiches: () => (charges.push('fiches'), Promise.resolve(FICHES)),
    capitales: () => (charges.push('capitales'), Promise.resolve(CAPITALES)),
    drapeaux: () => (charges.push('drapeaux'), Promise.resolve(DRAPEAUX)),
    module: () => import('../src/vues/fiche'),
    ...o.fiche,
  };
  const vue = vueExplorer(ctx, { fiche, ...(o.memoire ? { memoire: o.memoire } : {}) });
  const el = (sel: string) => zone.querySelector(sel);
  const toucher = (id: string) => {
    pickSuivant = id;
    vue.toucher?.(1, 1, {} as PointerEvent);
  };
  const doc = document as unknown as El & { activeElement?: El };
  return {
    vue,
    zone,
    body,
    carte,
    montres,
    touches,
    charges,
    toucher,
    el,
    doc,
    bouton: () => el('#barre-fiche')!,
    barre: () => el('#barre-carte')!,
    faits: () => el('#barre-carte .barre-faits')!.textContent,
    chevron: () => !el('#barre-carte .barre-chevron')!.hidden,
    feuille: () => el('#fiche-lieu'),
    ouverte: () => !!el('#fiche-lieu') && !el('#fiche-lieu')!.hidden,
    voile: () => el('#fiche-voile'),
    titre: () => el('#fiche-titre')?.textContent ?? null,
    lignes: () => (el('#fiche-lieu')?.querySelectorAll('.fiche-fait') ?? []).map((f) => `${f.querySelector('dt')!.textContent} · ${f.querySelector('dd')!.textContent}`),
    voisins: () => (el('#fiche-lieu')?.querySelectorAll('.fiche-voisin') ?? []).map((b) => b.textContent),
    echap: (target: unknown = null) => {
      const ev = { key: 'Escape', target, defaultPrevented: false, preventDefault: () => void (ev.defaultPrevented = true) };
      doc.emettre('keydown', ev);
      return ev;
    },
  };
}

/** La vue montée, un lieu touché et sa fiche ouverte au toucher de la barre. */
async function ouvrirSur(id: string, o: Parameters<typeof monter>[0] = {}) {
  const v = monter(o);
  v.vue.activer();
  v.toucher(id);
  await tenir();
  v.bouton().click();
  // Le morceau de la fiche (import dynamique) : la première fois, plus d'un tour.
  await vi.waitFor(() => expect(v.ouverte()).toBe(true));
  return v;
}

afterEach(() => vi.unstubAllGlobals());

describe('la barre : un bouton, une ligne de faits, un chevron', () => {
  it('un toucher remplit la barre comme avant (nom, statut), puis la ligne de faits et le chevron à l’arrivée des données', async () => {
    const v = monter();
    v.vue.activer();
    expect(v.charges).toEqual([]);
    v.toucher('JPN');
    expect(v.el('#barre-carte .barre-nom')!.textContent).toBe('Japon');
    expect(v.faits()).toBe('');
    expect(v.chevron()).toBe(false);
    await tenir();
    expect(v.charges).toEqual(['fiches', 'capitales']);
    expect(v.faits()).toBe('Tokyo');
    expect(v.chevron()).toBe(true);
    // Plusieurs capitales : toutes, dans l'ordre du fichier (la principale d'abord).
    v.toucher('BOL');
    expect(v.faits()).toBe(CAPITALES.parPays.get('BOL')!.justes.map((c) => c.nom).join(', '));
    // Un territoire : son statut, le chevron, pas de ligne de faits au lot F1 (ni capitale ni habitants au dépôt).
    v.toucher('GRL');
    expect(v.el('#barre-carte .barre-detail')!.textContent).toBe(textes.carte.statuts.territoire);
    expect(v.faits()).toBe('');
    expect(v.chevron()).toBe(true);
    // La région vivante, hors du bouton, dit ce que dit la barre.
    expect(v.bouton().getAttribute('aria-live')).toBeNull();
    expect(v.barre().getAttribute('aria-live')).toBeNull();
    expect(v.el('#barre-carte .barre-annonce')!.getAttribute('aria-live')).toBe('polite');
    expect(v.el('#barre-carte .barre-annonce')!.textContent).toContain('Groenland');
  });

  it('un second toucher avant l’arrivée des données : la ligne du premier ne s’affiche pas', async () => {
    const d = differee<DonneesFichesMonde>();
    const v = monter({ fiche: { fiches: () => d.promesse } });
    v.vue.activer();
    v.toucher('JPN');
    v.toucher('FRA');
    d.tenir(FICHES);
    await tenir();
    expect(v.el('#barre-carte .barre-nom')!.textContent).toBe('France');
    expect(v.faits()).toBe('Paris');
    expect(v.barre().dataset.id).toBe('FRA');
  });

  it('la région vivante dit aussi ce que la barre écrit hors d’un lieu : l’avis du démarrage, le chargement et l’échec de l’île', async () => {
    const v = monter();
    v.vue.activer();
    const annonce = () => v.el('#barre-carte .barre-annonce')!.textContent;
    v.vue.avis('Une partie laissée en cours a compté');
    expect(annonce()).toContain('Une partie laissée en cours a compté');
    v.vue.montrerLieu('reunion', '97411');
    expect(annonce()).toBe(textes.toucher.chargement_terrain);
    await tenir();
    expect(v.el('#barre-carte .barre-detail')!.textContent).toBe(textes.toucher.echec_terrain);
    expect(annonce()).toBe(textes.toucher.echec_terrain);
  });

  it('la barre porte les classes de la hauteur du cas complet dès qu’un lieu est affiché, avec et sans la ligne de la mémoire (la hauteur elle-même : ui_fiche du pilote)', async () => {
    let actif = true;
    const memoire = { details: () => (actif ? ['Vu 2 fois · revient demain'] : null), actif: () => actif, detail: () => null, sujets: () => [], sujet: () => 'pays', choisir() {}, teintes: () => null, maitrises: () => null } as unknown as CarteMemoire;
    const v = monter({ memoire });
    v.vue.activer();
    expect(v.barre().classList.contains('barre-lieu')).toBe(false);
    v.toucher('JPN');
    expect(v.barre().classList.contains('barre-lieu')).toBe(true);
    expect(v.barre().classList.contains('barre-avec-memoire')).toBe(true);
    expect(v.el('#barre-carte .barre-memoire')!.textContent).toBe('Vu 2 fois · revient demain');
    actif = false;
    v.toucher('FRA');
    expect(v.barre().classList.contains('barre-lieu')).toBe(true);
    expect(v.barre().classList.contains('barre-avec-memoire')).toBe(false);
    // La règle : la ligne de faits (et celle de la mémoire, réglage actif) gardent leur place même vides.
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toMatch(/#barre-carte\.barre-lieu \.barre-faits, #barre-carte\.barre-lieu\.barre-avec-memoire \.barre-memoire \{ display: block; min-height: 1\.35em; \}/);
  });

  it('sans données (hors ligne) : pas de chevron, le bouton n’ouvre rien ni ne s’annonce réductible ; le toucher suivant réessaie', async () => {
    let echoue = true;
    const v = monter({ fiche: { fiches: () => (echoue ? Promise.reject(new Error('hors ligne')) : Promise.resolve(FICHES)) } });
    v.vue.activer();
    // « Touche un pays » : un bouton qui n'ouvre rien ne se dit pas réductible (§ 4.1).
    expect(v.bouton().getAttribute('aria-expanded')).toBeNull();
    v.toucher('JPN');
    await tenir();
    expect(v.chevron()).toBe(false);
    expect(v.bouton().getAttribute('aria-expanded')).toBeNull();
    expect(v.bouton().getAttribute('aria-controls')).toBeNull();
    v.bouton().click();
    await tenir();
    expect(v.ouverte()).toBe(false);
    echoue = false;
    v.toucher('JPN');
    await tenir();
    expect(v.chevron()).toBe(true);
    expect(v.bouton().getAttribute('aria-expanded')).toBe('false');
    expect(v.bouton().getAttribute('aria-controls')).toBe('fiche-lieu');
  });

  it('les capitales manquées au premier toucher (hors ligne) : le chevron sans ligne de faits, puis la capitale au toucher suivant', async () => {
    let echoue = true;
    const v = monter({ fiche: { capitales: () => (echoue ? Promise.reject(new Error('hors ligne')) : Promise.resolve(CAPITALES)) } });
    v.vue.activer();
    v.toucher('JPN');
    await tenir();
    expect(v.chevron()).toBe(true);
    expect(v.faits()).toBe('');
    echoue = false;
    v.toucher('JPN');
    await tenir();
    expect(v.faits()).toBe('Tokyo');
  });

  it('une mer ou une commune : pas encore de fiche (lots F4 et F5), rien de chargé', async () => {
    const v = monter();
    v.vue.activer();
    v.toucher('atlant');
    await tenir();
    expect(v.chevron()).toBe(false);
    expect(v.charges).toEqual([]);
    expect(v.bouton().getAttribute('aria-expanded')).toBeNull();
  });
});

describe('la fiche', () => {
  beforeEach(() => vi.useRealTimers());

  it('ouvrir : la feuille et le voile, le focus au titre, aria-expanded ; la barre reste mise en page, inerte', async () => {
    const v = await ouvrirSur('JPN');
    expect(v.ouverte()).toBe(true);
    expect(v.voile()!.hidden).toBe(false);
    expect(v.titre()).toBe('Japon');
    expect(v.doc.activeElement).toBe(v.el('#fiche-titre'));
    expect(v.feuille()!.getAttribute('role')).toBe('dialog');
    expect(v.feuille()!.getAttribute('aria-labelledby')).toBe('fiche-titre');
    expect(v.feuille()!.getAttribute('aria-modal')).toBeNull();
    expect(v.bouton().getAttribute('aria-expanded')).toBe('true');
    expect(v.bouton().getAttribute('aria-controls')).toBe('fiche-lieu');
    expect(v.barre().hidden).toBe(false);
    expect(v.barre().getAttribute('inert')).toBe('');
    expect(v.body.dataset.fiche).toBe('ouverte');
    // Le drapeau, à l'ouverture seulement (le manifeste la première fois).
    expect(v.charges).toEqual(['fiches', 'capitales', 'drapeaux']);
    expect(v.feuille()!.querySelectorAll('.fiche-drapeaux img').map((i) => i.getAttribute('src'))).toEqual([...DRAPEAUX.parPays.get('JPN')!.justes]);
    // La carte ne se recadre pas à l'ouverture.
    expect(v.montres).toEqual([]);
  });

  it('un pays : capitale, continent et sous-région, voisins, lien Wikipédia, sources et Crédits ; aucune ligne vide', async () => {
    const v = await ouvrirSur('ESP');
    expect(v.lignes()).toEqual([`${T.capitale} · Madrid`, `${T.continent} · Europe · Europe du Sud`]);
    // Les pays jouables d'abord, par ordre alphabétique, puis les autres entités avec leur statut.
    expect(v.voisins()).toEqual(['Andorre', 'France', 'Maroc', 'Portugal', `Gibraltar (${textes.carte.statuts.territoire})`]);
    for (const b of v.feuille()!.querySelectorAll('.fiche-voisin')) expect(b.tagName).toBe('button');
    const wp = v.feuille()!.querySelector('.fiche-wikipedia')!;
    expect(wp.getAttribute('href')).toBe('https://fr.wikipedia.org/wiki/Espagne');
    expect(wp.getAttribute('target')).toBe('_blank');
    expect(wp.getAttribute('rel')).toBe('noopener');
    expect(v.feuille()!.querySelector('.fiche-sources')!.textContent).toBe(`Sources : Natural Earth · Unicode CLDR · Wikidata · flag-icons · ${T.credits}`);
    expect(v.feuille()!.querySelector('.fiche-credits')!.getAttribute('href')).toBe('#credits');
    for (const dd of v.feuille()!.querySelectorAll('dd')) expect(dd.textContent).not.toBe('');
    // Plusieurs capitales : « La Paz et Sucre », au pluriel.
    const b = await ouvrirSur('BOL');
    expect(b.lignes()[0]).toBe(`${T.capitales} · ${CAPITALES.parPays.get('BOL')!.justes.map((c) => c.nom).join(' et ')}`);
  });

  it('un territoire, une zone contestée, l’Antarctique : une fiche courte, avec le statut de la barre ; ni drapeau, ni capitale, ni lien', async () => {
    const g = await ouvrirSur('GRL');
    expect(g.feuille()!.querySelector('.fiche-statut')!.textContent).toBe(textes.carte.statuts.territoire);
    expect(g.lignes()).toEqual([`${T.continent} · Amérique du Nord · Amérique septentrionale`]);
    expect(g.feuille()!.querySelector('.fiche-drapeaux')!.hidden).toBe(true);
    expect(g.feuille()!.querySelector('.fiche-wikipedia')).toBeNull();
    expect(g.feuille()!.querySelector('.fiche-voisins')).toBeNull();
    expect(g.charges).not.toContain('drapeaux');
    const z = await ouvrirSur('ESH');
    expect(z.feuille()!.querySelector('.fiche-statut')!.textContent).toBe(textes.carte.statuts.conteste);
    expect(z.lignes()).toEqual([`${T.continent} · Afrique · Afrique du Nord`]);
    expect(z.voisins()).toEqual(['Algérie', 'Maroc', 'Mauritanie']);
    expect(z.feuille()!.querySelectorAll('.fiche-drapeaux img')).toEqual([]);
    // Ni note de Natural Earth ni revendicants : le statut écrit et relu vient au lot F3.
    expect(z.feuille()!.textContent).not.toMatch(/Self admin|revendiqu/i);
    const a = await ouvrirSur('ATA');
    expect(a.feuille()!.querySelector('.fiche-statut')!.textContent).toBe(T.statut_continent);
    expect(a.lignes()).toEqual([`${T.continent} · Antarctique`]);
  });

  it('la mémoire : une ligne par sujet ; aucune section pour un territoire', async () => {
    const memoire = {
      details: (_t: string, _id: string, jouable: boolean) => (jouable ? ['Pays : vu 4 fois · revient dans 5 j', 'Capitale : jamais vue'] : null),
      actif: () => true,
      detail: () => null,
      sujets: () => [],
      sujet: () => 'pays',
      choisir() {},
      teintes: () => null,
      maitrises: () => null,
    } as unknown as CarteMemoire;
    const v = await ouvrirSur('JPN', { memoire });
    expect(v.feuille()!.querySelectorAll('.fiche-memoire li').map((l) => l.textContent)).toEqual(['Pays : vu 4 fois · revient dans 5 j', 'Capitale : jamais vue']);
    const g = await ouvrirSur('GRL', { memoire });
    expect(g.feuille()!.querySelector('.fiche-memoire')).toBeNull();
  });

  it('will-change: transform le temps de la montée seulement, et jamais sous mouvement réduit (§ 6.4)', async () => {
    for (const reduit of [false, true]) {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('no-preference') ? !reduit : reduit }));
      const v = await ouvrirSur('JPN');
      expect(v.feuille()!.style.willChange, `réduit ${reduit}`).toBe(reduit ? undefined : 'transform');
      v.feuille()!.emettre('animationend', {});
      expect(v.feuille()!.style.willChange || '', `réduit ${reduit}`).toBe('');
      expect(readFileSync('src/carte.css', 'utf8')).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.fiche:not\(\[hidden\]\) \{ animation: fiche-monte/);
    }
  });

  it('la mémoire relue (rafraichir) refait la fiche ouverte sans lui prendre le focus : il reste sur le même voisin', async () => {
    const v = await ouvrirSur('FRA');
    const italie = () => v.feuille()!.querySelectorAll('.fiche-voisin').find((b) => b.dataset.id === 'ITA')!;
    italie().focus();
    const avant = italie();
    v.vue.rafraichir?.();
    // La fiche est bien refaite (un autre élément), et le focus suit.
    expect(italie()).not.toBe(avant);
    expect(v.doc.activeElement).toBe(italie());
    // Le focus au titre : il y reste.
    v.el('#fiche-titre')!.focus();
    v.vue.rafraichir?.();
    expect(v.doc.activeElement).toBe(v.el('#fiche-titre'));
  });

  it('fermer par « × », par Échap, par le voile : la fiche fermée, le focus rendu à la barre', async () => {
    for (const fermer of ['croix', 'echap', 'voile'] as const) {
      const v = await ouvrirSur('JPN');
      if (fermer === 'croix') v.feuille()!.querySelector('.croix')!.click();
      if (fermer === 'echap') expect(v.echap().defaultPrevented).toBe(true);
      if (fermer === 'voile') v.voile()!.click();
      expect(v.ouverte(), fermer).toBe(false);
      expect(v.voile()!.hidden, fermer).toBe(true);
      expect(v.doc.activeElement, fermer).toBe(v.bouton());
      expect(v.bouton().getAttribute('aria-expanded'), fermer).toBe('false');
      expect(v.barre().getAttribute('inert'), fermer).toBeNull();
      expect(v.body.dataset.fiche, fermer).toBeUndefined();
      // La barre et la zone allumée restent.
      expect(v.barre().dataset.id, fermer).toBe('JPN');
    }
  });

  it('le focus retiré par le navigateur juste après la fermeture (ancre #carte d’un retour) revient à la barre ; jamais pris à un autre élément', async () => {
    const v = await ouvrirSur('JPN');
    v.feuille()!.querySelector('.croix')!.click();
    expect(v.doc.activeElement).toBe(v.bouton());
    // Ce que fait Chromium après la mise en page, au retour sur #carte : le focus tombe sur body.
    (v.doc as unknown as { activeElement: unknown }).activeElement = v.body;
    await new Promise((r) => setTimeout(r, 60));
    expect(v.doc.activeElement).toBe(v.bouton());

    // Le focus parti ailleurs entre-temps (un toucher, une touche) : il y reste.
    const w = await ouvrirSur('JPN');
    w.feuille()!.querySelector('.croix')!.click();
    const ailleurs = { id: 'ailleurs' };
    (w.doc as unknown as { activeElement: unknown }).activeElement = ailleurs;
    await new Promise((r) => setTimeout(r, 60));
    expect(w.doc.activeElement).toBe(ailleurs);
  });

  it('Échap ou le voile avec la popup ⚙ ouverte : la popup se ferme (son écouteur), la fiche reste ; dans un champ, Échap reste au champ', async () => {
    let reglages = true;
    const v = await ouvrirSur('JPN', { fiche: { reglagesOuverts: () => reglages } });
    expect(v.echap().defaultPrevented).toBe(false);
    expect(v.ouverte()).toBe(true);
    // Un toucher sur le voile pour refermer la popup (§ 4.2 : elle s'ouvre par-dessus la fiche, sans la fermer).
    v.voile()!.click();
    expect(v.ouverte()).toBe(true);
    reglages = false;
    const champ = new El('input');
    expect(v.echap(champ).defaultPrevented).toBe(false);
    expect(v.ouverte()).toBe(true);
    v.echap();
    expect(v.ouverte()).toBe(false);
  });

  it('fiche ouverte : + et − sans effet (boutons de zoom cachés par la feuille de style) ; le voile ferme la fiche (qu’il ne touche pas la carte dessous : ui_fiche du pilote)', async () => {
    const v = await ouvrirSur('JPN');
    v.body.dataset.vue = 'carte';
    brancherZoom({ zone: v.zone as unknown as HTMLElement, carte: () => v.carte as never });
    const plus = { key: '+', target: null, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, preventDefault() {} };
    v.doc.emettre('keydown', plus);
    expect(v.carte.zoomerDe).not.toHaveBeenCalled();
    expect(readFileSync('src/carte.css', 'utf8')).toContain('body[data-fiche] .zoom-carte { display: none !important; }');
    const avant = v.touches.length;
    v.voile()!.click();
    expect(v.touches.length).toBe(avant);
    expect(v.ouverte()).toBe(false);
    v.doc.emettre('keydown', plus);
    expect(v.carte.zoomerDe).toHaveBeenCalledTimes(1);
  });

  it('un voisin : la carte vole jusqu’à lui (sous la fiche, D61 c), sa fiche remplace l’autre, le focus à son titre ; « ‹ » revient et remontre le lieu d’avant', async () => {
    const v = await ouvrirSur('ESP');
    expect(v.feuille()!.querySelector('.fiche-avant')!.hidden).toBe(true);
    (v.feuille()!.querySelectorAll('.fiche-voisin').find((b) => b.dataset.id === 'FRA') as El).click();
    await tenir();
    expect(v.titre()).toBe('France');
    expect(v.montres).toEqual(['FRA']);
    expect(v.barre().dataset.id).toBe('FRA');
    expect(v.doc.activeElement).toBe(v.el('#fiche-titre'));
    expect(v.feuille()!.querySelector('.fiche-avant')!.hidden).toBe(false);
    (v.feuille()!.querySelectorAll('.fiche-voisin').find((b) => b.dataset.id === 'ITA') as El).click();
    await tenir();
    expect(v.titre()).toBe('Italie');
    v.feuille()!.querySelector('.fiche-avant')!.click();
    await tenir();
    expect(v.titre()).toBe('France');
    expect(v.montres).toEqual(['FRA', 'ITA', 'FRA']);
    // Échap fait comme « ‹ » : la fiche d'avant, puis la fermeture.
    v.echap();
    await tenir();
    expect(v.titre()).toBe('Espagne');
    expect(v.montres.at(-1)).toBe('ESP');
    v.echap();
    expect(v.ouverte()).toBe(false);
    // À la fermeture, la carte est sur le dernier lieu vu.
    expect(v.barre().dataset.id).toBe('ESP');
  });

  it('desactiver() ferme la fiche ; une recherche la ferme et montre son lieu dans la barre', async () => {
    const v = await ouvrirSur('JPN');
    v.vue.desactiver();
    expect(v.ouverte()).toBe(false);
    expect(v.body.dataset.fiche).toBeUndefined();
    v.vue.activer();
    v.toucher('JPN');
    await tenir();
    v.bouton().click();
    await vi.waitFor(() => expect(v.ouverte()).toBe(true));
    v.vue.montrerLieu('monde', 'CHN');
    expect(v.ouverte()).toBe(false);
    expect(v.barre().dataset.id).toBe('CHN');
    await tenir();
    expect(v.faits()).toBe('Pékin');
    expect(v.chevron()).toBe(true);
  });

  it('le glissé vers le haut sur la barre (24 px) ouvre ; vers le bas sur la tête (60 px) ferme ; moins, rien', async () => {
    const v = monter();
    v.vue.activer();
    v.toucher('JPN');
    await tenir();
    v.bouton().emettre('pointerdown', { clientY: 700 });
    v.bouton().emettre('pointerup', { clientY: 690 });
    await tenir();
    expect(v.ouverte()).toBe(false);
    v.bouton().emettre('pointerdown', { clientY: 700 });
    v.bouton().emettre('pointerup', { clientY: 676 });
    await vi.waitFor(() => expect(v.ouverte()).toBe(true));
    const tete = v.feuille()!.querySelector('.fiche-tete')!;
    tete.emettre('pointerdown', { clientY: 100 });
    tete.emettre('pointerup', { clientY: 140 });
    expect(v.ouverte()).toBe(true);
    tete.emettre('pointerdown', { clientY: 100 });
    tete.emettre('pointerup', { clientY: 160 });
    expect(v.ouverte()).toBe(false);
  });

  it('sur l’île, la fiche passe sous la mention de l’IGN (comme le bilan)', () => {
    expect(readFileSync('src/carte.css', 'utf8')).toContain('body[data-terrain="reunion"] .fiche { top: 40px; }');
  });
});

/** window.history et location.hash, en petit : go() différé, comme dans un vrai navigateur. */
class HistoriqueFactice implements Historique {
  entrees: { etat: unknown; ancre: string }[] = [{ etat: null, ancre: '' }];
  i = 0;
  attente: number[] = [];
  get state(): unknown {
    return this.entrees[this.i]!.etat;
  }
  get ancre(): string {
    return this.entrees[this.i]!.ancre;
  }
  pushState(etat: unknown, _u: string, url?: string): void {
    this.entrees = [...this.entrees.slice(0, this.i + 1), { etat: structuredClone(etat), ancre: url ?? this.ancre }];
    this.i++;
  }
  replaceState(etat: unknown, _u: string, url?: string): void {
    this.entrees[this.i] = { etat: structuredClone(etat), ancre: url ?? this.ancre };
  }
  go(n: number): void {
    this.attente.push(n);
  }
}

describe('la fiche branchée sur la vraie navigation (navigation.ts, comme main.ts)', () => {
  beforeEach(() => vi.useRealTimers());

  /** La vue de la carte et les classements, l'historique factice ; chaque traversée donne deux router() (popstate puis hashchange). */
  function brancher() {
    const h = new HistoriqueFactice();
    let nav!: ReturnType<typeof creerNavigation<VueNavigable>>;
    const v = monter({ fiche: { historique: { pousser: (l) => nav.pousserFiche(l), quitter: () => nav.quitterFiches(), retour: () => retour() } } });
    let classementActif = false;
    const classement = { activer: () => void (classementActif = true), desactiver: () => void (classementActif = false) };
    const vues = new Map<string, VueNavigable>([
      ['carte', v.vue],
      ['classement', classement],
    ]);
    nav = creerNavigation({
      history: h,
      ancre: () => h.ancre,
      noms: ['carte', 'classement'],
      accueil: 'carte',
      passage: ['classement'],
      arbre: 'jouer',
      vue: (n) => vues.get(n),
      aller: () => undefined,
      surFiche: (f) => v.vue.surFiche(f),
      annoncer: () => undefined,
      canonique: (c) => c,
    });
    const traverser = () => {
      for (let n = h.attente.shift(); n !== undefined; n = h.attente.shift()) {
        h.i += n;
        nav.router();
        nav.router();
      }
    };
    const retour = () => {
      h.i--;
      nav.router();
      nav.router();
    };
    const lien = (a: string) => {
      h.pushState(null, '', versAncre(a));
      nav.router();
      nav.router();
    };
    const fichesEnHistorique = () => h.entrees.slice(0, h.i + 1).filter((e) => (e.etat as { fiche?: unknown } | null)?.fiche).length;
    lien('classement');
    lien('carte');
    return { ...v, h, nav, traverser, lien, fichesEnHistorique, classementActif: () => classementActif };
  }

  /** Le lieu touché, puis sa fiche ouverte par la barre. */
  async function ouvrir(v: ReturnType<typeof brancher>, id: string) {
    v.toucher(id);
    await tenir();
    v.bouton().click();
    await vi.waitFor(() => expect(v.titre()).toBe(v.el('#barre-carte .barre-nom')!.textContent));
  }

  it('ouvrir, un voisin, « × » : une entrée par fiche, toutes remontées d’un coup, la fiche fermée et le focus à la barre', async () => {
    const v = brancher();
    const carte = v.h.i;
    await ouvrir(v, 'FRA');
    expect(v.h.i).toBe(carte + 1);
    (v.feuille()!.querySelectorAll('.fiche-voisin').find((b) => b.dataset.id === 'ESP') as El).click();
    await vi.waitFor(() => expect(v.titre()).toBe('Espagne'));
    expect(v.h.i).toBe(carte + 2);
    v.feuille()!.querySelector('.croix')!.click();
    v.traverser();
    expect(v.h.i).toBe(carte);
    expect(v.ouverte()).toBe(false);
    expect(v.body.dataset.fiche).toBeUndefined();
    expect(v.doc.activeElement).toBe(v.bouton());
    expect(v.barre().dataset.id).toBe('ESP');
    expect(v.fichesEnHistorique()).toBe(0);
  });

  it('la recherche pendant une fiche : la fiche fermée, ses entrées rendues, rien de rouvert après le go()', async () => {
    const v = brancher();
    const carte = v.h.i;
    await ouvrir(v, 'FRA');
    // Comme main.ts (brancherRecherche) : pousser('carte'), puis le lieu montré.
    v.nav.pousser('carte');
    v.vue.montrerLieu('monde', 'CHN');
    expect(v.ouverte()).toBe(false);
    v.traverser();
    await tenir();
    expect(v.h.i).toBe(carte);
    expect(v.ouverte()).toBe(false);
    expect(v.body.dataset.fiche).toBeUndefined();
    expect(v.barre().dataset.id).toBe('CHN');
    expect(v.fichesEnHistorique()).toBe(0);
  });

  it('🏆 ouvert par-dessus une fiche, puis sa « × » : la carte seule, sans fiche ni entrée de fiche', async () => {
    const v = brancher();
    const carte = v.h.i;
    await ouvrir(v, 'FRA');
    v.lien('classement');
    expect(v.ouverte()).toBe(false);
    expect(v.body.dataset.fiche).toBeUndefined();
    v.nav.remonter('carte');
    v.traverser();
    await tenir();
    expect(v.classementActif()).toBe(false);
    expect(v.h.i).toBe(carte);
    expect(v.ouverte()).toBe(false);
    expect(v.body.dataset.fiche).toBeUndefined();
  });
});
