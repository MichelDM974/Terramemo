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
import { fmtHabitants, fmtHeureLieu, nombreFormateurs } from '../src/fiches/format';
import { LIGNES_RELUES, type LigneRelue } from '../src/fiches/relues';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import { lireDrapeaux, type ManifesteDrapeaux } from '../src/map/drapeaux';
import type { Pays } from '../src/map/types';
import type { CarteMemoire } from '../src/vues/carte-memoire';
import type { ContexteVue } from '../src/vues/commun';
import { creerNavigation, type Historique, type VueNavigable } from '../src/navigation';
import { versAncre } from '../src/vues/arbre';
import { vueExplorer, type OptionsFiche } from '../src/vues/explorer';
import { composerFiche, creerFeuille, DELAI_HEURE_MS, type ModeleFiche } from '../src/vues/fiche';
import { remplir, textes } from '../src/vues/textes';
import { brancherZoom } from '../src/zoom-carte';
import { El, installerDom } from './dom-factice';

const lire = <T>(f: string): T => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8')) as T;
const pays = lire<Pays[]>('pays.json');
const noms = lire<Record<string, string>>('noms.fr.json');
const FICHES: DonneesFichesMonde = lireFichesMonde(lire<FichierMonde>('fiches-monde.json'), lire<FichierMondeLangue>('fiches-monde.fr.json'));
const CAPITALES = lireCapitales(lire<LigneCapitales[]>('capitales.json'), lire<NomsCapitales>('capitales.fr.json'));
const DRAPEAUX = lireDrapeaux(lire<ManifesteDrapeaux>('drapeaux.json'));
const T = textes.fiche;
const S = T.noms_sources;
/** Les lignes à relire, toutes relues, ou aucune (les deux états de LIGNES_RELUES). */
const TOUTES: Record<LigneRelue, boolean> = { superficie: true, langues: true, gentile: true, culminant: true, fete: true };
const AUCUNE: Record<LigneRelue, boolean> = { superficie: false, langues: false, gentile: false, culminant: false, fete: false };
/** Le libellé de chaque ligne à relire (« Langue » ou « Langues » selon le pays). */
const libelleRelue = (k: LigneRelue, id: string): string => {
  const lg = FICHES.lieux.get(id)!.langues!;
  return { superficie: T.superficie, langues: lg.officielles.length + lg.parlees.length > 1 ? T.langues : T.langue, gentile: T.gentile, culminant: T.culminant, fete: T.fete }[k];
};
/** Les libellés d'un pays qui a tous ses chiffres, dans l'ordre du § 4.2, selon les lignes relues. */
function libellesAttendus(id: string, capitale: string, R: Readonly<Record<LigneRelue, boolean>> = LIGNES_RELUES): string[] {
  const si = (k: LigneRelue) => (R[k] ? [libelleRelue(k, id)] : []);
  return [T.capitale, T.habitants, ...si('superficie'), ...si('langues'), T.monnaie, ...si('gentile'), remplir(T.heure, { capitale }), T.continent, ...si('culminant'), ...si('fete')];
}
/** Les sources d'un pays (habitants de la Banque mondiale), dans l'ordre de ses lignes, selon les lignes relues. */
function sourcesAttendues(_id: string, R: Readonly<Record<LigneRelue, boolean>> = LIGNES_RELUES): string[] {
  return [S.natural_earth, S.cldr, S.wikidata, S.banque_mondiale, ...(R.superficie ? [S.superficie] : []), S.tz, ...(R.fete ? [S.factbook] : []), S.flag_icons];
}
/** Espaces insécables en espaces simples, pour comparer. */
const simple = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
/** La fiche composée sans la vue (pure) : les données du dépôt. */
function composer(id: string, o: { relues?: Record<LigneRelue, boolean>; maintenant?: Date; fiches?: DonneesFichesMonde } = {}): ModeleFiche {
  const m = composerFiche(id, {
    entites: pays,
    nom: (x) => noms[x] ?? x,
    fiches: o.fiches ?? FICHES,
    capitales: CAPITALES,
    drapeaux: DRAPEAUX,
    memoire: () => null,
    ...(o.relues ? { relues: o.relues } : {}),
    ...(o.maintenant ? { maintenant: o.maintenant } : {}),
  });
  if (!m) throw new Error(`${id} : pas de fiche`);
  return m;
}
/** « libellé · valeur » de chaque ligne d'un modèle, espaces simples. */
const lignesDe = (m: ModeleFiche) => m.faits.map((f) => simple(`${f.libelle} · ${f.valeur}`));

/** Les promesses en attente (chargements, morceau de la fiche) tenues. */
const tenir = () => new Promise((r) => setTimeout(r, 0));
/** Deux images passées (requestAnimationFrame de dom-factice : 16 ms) : le vol d'un voisin parti (volEnAttente). */
const deuxImages = () => new Promise((r) => setTimeout(r, 50));

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
    // Le manifeste des drapeaux, demandé à l'arrivée des fiches : le drapeau dès le premier toucher.
    expect(v.charges).toEqual(['fiches', 'capitales', 'drapeaux']);
    expect(v.faits()).toBe('Tokyo');
    expect(v.chevron()).toBe(true);
    await tenir();
    const drapeau = () => v.el('#barre-carte .barre-drapeau')!;
    expect(drapeau().hidden).toBe(false);
    expect(drapeau().getAttribute('src')).toBe(DRAPEAUX.parPays.get('JPN')!.montre);
    expect(v.bouton().classList.contains('barre-avec-drapeau')).toBe(true);
    // Plusieurs capitales : toutes, dans l'ordre du fichier (la principale d'abord).
    v.toucher('BOL');
    expect(v.faits()).toBe(CAPITALES.parPays.get('BOL')!.justes.map((c) => c.nom).join(', '));
    // Un territoire : son statut, le chevron, pas de ligne de faits au lot F1 (ni capitale ni habitants au dépôt).
    v.toucher('GRL');
    expect(v.el('#barre-carte .barre-detail')!.textContent).toBe(textes.carte.statuts.territoire);
    expect(v.faits()).toBe('');
    expect(v.chevron()).toBe(true);
    // Ni drapeau pour un territoire : la barre reprend ses deux colonnes.
    expect(drapeau().hidden).toBe(true);
    expect(v.bouton().classList.contains('barre-avec-drapeau')).toBe(false);
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

  it('un pays : ses lignes dans l’ordre (les relues seules), voisins, lien Wikipédia, sources et Crédits ; aucune ligne vide', async () => {
    const v = await ouvrirSur('ESP');
    const l = v.lignes();
    expect(l.map((x) => x.split(' · ')[0])).toEqual(libellesAttendus('ESP', 'Madrid'));
    expect(l.slice(0, 2)).toEqual([`${T.capitale} · Madrid`, `${T.habitants} · ${fmtHabitants(FICHES.lieux.get('ESP')!.habitants!.n, 2025)}`]);
    expect(l).toContain(`${T.monnaie} · euro`);
    expect(l.find((x) => x.startsWith('Heure à Madrid'))).toMatch(/^Heure à Madrid · \d{1,2}\sh\s\d{2} · /);
    expect(l).toContain(`${T.continent} · Europe · Europe du Sud`);
    // Les pays jouables d'abord, par ordre alphabétique, puis les autres entités avec leur statut.
    expect(v.voisins()).toEqual(['Andorre', 'France', 'Maroc', 'Portugal', `Gibraltar (${textes.carte.statuts.territoire})`]);
    for (const b of v.feuille()!.querySelectorAll('.fiche-voisin')) expect(b.tagName).toBe('button');
    const wp = v.feuille()!.querySelector('.fiche-wikipedia')!;
    expect(wp.getAttribute('href')).toBe('https://fr.wikipedia.org/wiki/Espagne');
    expect(wp.getAttribute('target')).toBe('_blank');
    expect(wp.getAttribute('rel')).toBe('noopener');
    expect(v.feuille()!.querySelector('.fiche-sources')!.textContent).toBe(`Sources : ${sourcesAttendues('ESP').join(' · ')} · ${T.credits}`);
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

  it('la barre hors de la zone du geste d’Android (S44) : à 56 px du bas en navigation par gestes (marge du système), inchangée sans marge', () => {
    // Mesuré sur l'A37 le 17/11 : 48 dp réservés au geste « accueil », marge du système de 15 px en gestes, 0 en 3 boutons.
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toContain('--barre-bas: 12px;\n  bottom: max(var(--barre-bas), min(env(safe-area-inset-bottom, 0px) * 100, 56px - env(safe-area-inset-bottom, 0px)));');
    expect(css).toContain('.carte-barre { left: 8px; right: 8px; --barre-bas: 8px; }');
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
    await deuxImages();
    expect(v.titre()).toBe('France');
    expect(v.montres).toEqual(['FRA']);
    expect(v.barre().dataset.id).toBe('FRA');
    expect(v.doc.activeElement).toBe(v.el('#fiche-titre'));
    expect(v.feuille()!.querySelector('.fiche-avant')!.hidden).toBe(false);
    (v.feuille()!.querySelectorAll('.fiche-voisin').find((b) => b.dataset.id === 'ITA') as El).click();
    await deuxImages();
    expect(v.titre()).toBe('Italie');
    v.feuille()!.querySelector('.fiche-avant')!.click();
    await deuxImages();
    expect(v.titre()).toBe('France');
    expect(v.montres).toEqual(['FRA', 'ITA', 'FRA']);
    // Échap fait comme « ‹ » : la fiche d'avant, puis la fermeture.
    v.echap();
    await deuxImages();
    expect(v.titre()).toBe('Espagne');
    expect(v.montres.at(-1)).toBe('ESP');
    v.echap();
    expect(v.ouverte()).toBe(false);
    // À la fermeture, la carte est sur le dernier lieu vu.
    expect(v.barre().dataset.id).toBe('ESP');
  });

  it('le vol d’un voisin part deux images après sa fiche (S41, S55) ; une fiche nouvelle avant l’annule ; la « × » avant le fait tout de suite', async () => {
    const v = await ouvrirSur('ESP');
    const voisin = (id: string) => (v.feuille()!.querySelectorAll('.fiche-voisin').find((b) => b.dataset.id === id) as El).click();
    voisin('FRA');
    await tenir();
    // La fiche d'abord, la carte ensuite.
    expect(v.titre()).toBe('France');
    expect(v.montres).toEqual([]);
    expect(v.barre().dataset.id).toBe('ESP');
    await deuxImages();
    expect(v.montres).toEqual(['FRA']);
    expect(v.barre().dataset.id).toBe('FRA');
    // L'Italie, puis « ‹ » avant ses deux images : la carte ne part pas vers l'Italie, elle reste sur la France.
    voisin('ITA');
    await tenir();
    v.feuille()!.querySelector('.fiche-avant')!.click();
    await tenir();
    expect(v.titre()).toBe('France');
    await deuxImages();
    expect(v.montres).toEqual(['FRA']);
    expect(v.barre().dataset.id).toBe('FRA');
    // La Belgique, puis « × » avant ses deux images : le vol part à la fermeture, la carte sur le dernier lieu vu.
    voisin('BEL');
    await tenir();
    expect(v.titre()).toBe('Belgique');
    v.feuille()!.querySelector('.croix')!.click();
    expect(v.ouverte()).toBe(false);
    expect(v.montres).toEqual(['FRA', 'BEL']);
    expect(v.barre().dataset.id).toBe('BEL');
    await deuxImages();
    expect(v.montres).toEqual(['FRA', 'BEL']);
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

describe('les chiffres d’un pays (lot F2) : lignes, ordre, lignes à relire, heure', () => {
  const T0 = new Date('2026-11-18T12:20:45Z');

  it('toutes les lignes relues : le Japon dans l’ordre du § 4.2, et le pied ne nomme que les sources de ce qu’il montre', () => {
    const m = composer('JPN', { relues: TOUTES, maintenant: T0 });
    expect(lignesDe(m)).toEqual([
      'Capitale · Tokyo',
      'Habitants · 123 366 734 (2025)',
      'Superficie · 377 974 km²',
      'Langue · japonais',
      'Monnaie · yen japonais',
      'Gentilé · les Japonais',
      simple(`Heure à Tokyo · ${fmtHeureLieu('Asia/Tokyo', 1, T0)}`),
      "Continent · Asie · Asie de l'Est",
      'Point culminant · mont Fuji, 3 776 m',
      "Fête nationale · 23 février · Anniversaire de l'empereur",
    ]);
    expect(m.sources).toEqual([S.natural_earth, S.cldr, S.wikidata, S.banque_mondiale, S.superficie, S.tz, S.factbook, S.flag_icons]);
    expect(m.sources.filter((x) => x.includes('Wikidata'))).toEqual(['Wikidata', 'superficie selon Wikidata']);
  });

  it('une ligne à relire reste hors ligne tant qu’elle n’est pas relue ; relue seule, elle seule apparaît, à sa place ; la fiche suit LIGNES_RELUES', () => {
    const sans = lignesDe(composer('JPN', { relues: AUCUNE, maintenant: T0 })).map((l) => l.split(' · ')[0]);
    expect(sans).toEqual(libellesAttendus('JPN', 'Tokyo', AUCUNE));
    expect(composer('JPN', { relues: AUCUNE }).sources).toEqual(sourcesAttendues('JPN', AUCUNE));
    for (const k of Object.keys(AUCUNE) as LigneRelue[]) {
      const R = { ...AUCUNE, [k]: true };
      expect(lignesDe(composer('JPN', { relues: R, maintenant: T0 })).map((l) => l.split(' · ')[0]), k).toEqual(libellesAttendus('JPN', 'Tokyo', R));
      expect(composer('JPN', { relues: R }).sources, k).toEqual(sourcesAttendues('JPN', R));
    }
    // Sans `relues` : la constante (la session principale la passe à true ligne par ligne).
    expect(lignesDe(composer('JPN', { maintenant: T0 }))).toEqual(lignesDe(composer('JPN', { relues: { ...LIGNES_RELUES }, maintenant: T0 })));
  });

  it('langues avec leur part, monnaies, habitants de Wikidata, superficie au centième ; une ligne sans donnée n’existe pas', () => {
    const de = (id: string, libelle: string) => lignesDe(composer(id, { relues: TOUTES, maintenant: T0 })).find((l) => l.startsWith(`${libelle} · `)) ?? null;
    // Les officielles (une liste lue), puis les langues du pays parlées par 10 % ou plus, avec leur part (D56 c).
    expect(de('AGO', T.langues)).toBe('Langues · portugais · umbundu 29 % · kimboundou 25 %');
    expect(de('CHE', T.langues)).toBe('Langues · allemand, français, italien et romanche');
    expect(de('PSE', T.monnaies)).toBe('Monnaies · nouveau shekel israélien et dinar jordanien');
    // Le Vatican : ses habitants de Wikidata (2024), sa superficie au centième ; la Banque mondiale n'est pas citée.
    const vat = composer('VAT', { relues: TOUTES, maintenant: T0 });
    expect(lignesDe(vat)).toContain('Habitants · 949 (2024)');
    expect(lignesDe(vat)).toContain('Superficie · 0,44 km²');
    expect(vat.sources).not.toContain(S.banque_mondiale);
    expect(vat.sources).toContain(S.wikidata);
    // La Somalie : aucun sommet (aucun hors du Somaliland) ; le Royaume-Uni et la Bosnie-Herzégovine : aucune fête.
    expect(de('SOM', T.culminant)).toBeNull();
    expect(de('GBR', T.fete)).toBeNull();
    expect(de('BIH', T.fete)).toBeNull();
    expect(composer('GBR', { relues: TOUTES }).sources).not.toContain(S.factbook);
    // Plusieurs fuseaux : dits après l'écart ; un seul : rien (la Chine, à l'heure de Pékin seule).
    expect(de('FRA', 'Heure à Paris')).toMatch(/ · 5 fuseaux dans le pays$/);
    expect(de('USA', 'Heure à Washington')).toMatch(/ · 6 fuseaux dans le pays$/);
    expect(de('CHN', 'Heure à Pékin')).not.toMatch(/fuseaux/);
    for (const id of ['JPN', 'FRA', 'AGO', 'VAT', 'SOM']) for (const f of composer(id, { relues: TOUTES }).faits) expect(f.valeur, `${id} ${f.libelle}`).not.toBe('');
  });

  it('une zone que le navigateur ne connaît pas (RangeError) : la ligne de l’heure retirée, la base tz pas citée', () => {
    const lieux = new Map(FICHES.lieux);
    lieux.set('JPN', { ...FICHES.lieux.get('JPN')!, heure: { zone: 'Mars/Olympus_Mons', fuseaux: 1 } });
    const m = composer('JPN', { fiches: { ...FICHES, lieux } });
    expect(m.faits.map((f) => f.libelle)).not.toContain('Heure à Tokyo');
    expect(m.faits.map((f) => f.libelle)).toContain(T.continent);
    expect(m.sources).not.toContain(S.tz);
  });

  it('l’heure avance toutes les 30 s tant que la fiche est ouverte ; le minuteur arrêté à la fermeture, et refait par la fiche suivante', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: T0 });
    try {
      const avant = vi.getTimerCount();
      const v = await ouvrirSur('FRA');
      const heure = () => v.lignes().find((l) => l.startsWith('Heure à Paris · '));
      expect(heure()).toBe(`Heure à Paris · ${fmtHeureLieu('Europe/Paris', 5, T0)}`);
      expect(vi.getTimerCount()).toBe(avant + 1);
      vi.advanceTimersByTime(DELAI_HEURE_MS);
      // 12:20:45 + 30 s : la minute a changé.
      expect(heure()).toBe(`Heure à Paris · ${fmtHeureLieu('Europe/Paris', 5, new Date('2026-11-18T12:21:15Z'))}`);
      expect(heure()).not.toBe(`Heure à Paris · ${fmtHeureLieu('Europe/Paris', 5, T0)}`);
      // Un voisin : sa fiche remplace l'autre, un seul minuteur.
      v.feuille()!.querySelector('.fiche-voisin')!.click();
      await vi.waitFor(() => expect(v.titre()).not.toBe('France'));
      expect(vi.getTimerCount()).toBe(avant + 1);
      v.echap();
      v.echap();
      expect(v.ouverte()).toBe(false);
      expect(vi.getTimerCount()).toBe(avant);
    } finally {
      vi.useRealTimers();
    }
  });

  it('une zone qui lève au recalcul : sa ligne retirée, le minuteur arrêté', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: T0 });
    try {
      installerDom();
      const zone = new El('main');
      const f = creerFeuille(zone as unknown as HTMLElement, { fermer() {}, voile() {}, avant() {}, voisin() {} });
      const m = composer('JPN', { maintenant: T0 });
      const avant = vi.getTimerCount();
      f.montrer({ ...m, faits: m.faits.map((x) => (x.heure ? { ...x, heure: { zone: 'Mars/Olympus_Mons', fuseaux: 1 } } : x)) }, { avant: false, focus: false });
      const libelles = () => zone.querySelectorAll('.fiche-fait dt').map((d) => d.textContent);
      expect(libelles()).toContain('Heure à Tokyo');
      vi.advanceTimersByTime(DELAI_HEURE_MS);
      expect(libelles()).not.toContain('Heure à Tokyo');
      expect(libelles()).toContain(T.continent);
      expect(vi.getTimerCount()).toBe(avant);
      // Une fiche sans heure (l'Antarctique) : aucun minuteur.
      f.montrer(composer('ATA'), { avant: false, focus: false });
      expect(vi.getTimerCount()).toBe(avant);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aucun formateur créé à l’ouverture d’une fiche : ceux des nombres, des dates et de la zone du pays touché le sont au repos, avant (décision « Fluidité de la fiche d’un lieu »)', async () => {
    const v = monter();
    v.vue.activer();
    v.toucher('KAZ');
    await tenir();
    // Le repos : requestIdleCallback absent du DOM factice, un délai de 50 ms à la place.
    await new Promise((r) => setTimeout(r, 80));
    const n = nombreFormateurs();
    v.bouton().click();
    await vi.waitFor(() => expect(v.ouverte()).toBe(true));
    expect(v.lignes().some((l) => l.startsWith('Heure à '))).toBe(true);
    expect(nombreFormateurs()).toBe(n);
  });
});
