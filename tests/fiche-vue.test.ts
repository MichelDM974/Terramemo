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
import { lireDrapeauxTerritoires, lireFichesMonde, type DonneesFichesMonde, type FichierMonde, type FichierMondeLangue, type ManifesteDrapeauxTerritoires } from '../src/fiches/donnees';
import { fmtHabitants, fmtHabitantsCourt, fmtHeureLieu, nombreFormateurs } from '../src/fiches/format';
import { LIGNES_RELUES, type LigneRelue } from '../src/fiches/relues';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import { lireDrapeaux, type ManifesteDrapeaux } from '../src/map/drapeaux';
import type { Topology } from 'topojson-specification';
import { assembler } from '../src/map/donnees';
import { assemblerTerrain } from '../src/map/donnees-terrain';
import { assemblerLegere } from '../src/map/mers';
import type { Contestee, Lieu, Pays } from '../src/map/types';
import type { CarteMemoire } from '../src/vues/carte-memoire';
import type { ContexteVue } from '../src/vues/commun';
import { creerNavigation, type Historique, type VueNavigable } from '../src/navigation';
import { versAncre } from '../src/vues/arbre';
import { vueExplorer, type OptionsFiche } from '../src/vues/explorer';
import type { ApprendreFiche, ApprendreModele } from '../src/vues/apprendre-lieu';
import { composerFiche, creerFeuille, DELAI_HEURE_MS, SITUATION_APRES_MS, type ModeleFiche } from '../src/vues/fiche';
import { MORCEAU, type SourceSituation } from '../src/vues/situation';
import { remplir, textes } from '../src/vues/textes';
import { textesFiche } from '../src/vues/textes-fiche';
import { brancherZoom } from '../src/zoom-carte';
import { El, installerDom } from './dom-factice';

const lire = <T>(f: string): T => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8')) as T;
const pays = lire<Pays[]>('pays.json');
const noms = lire<Record<string, string>>('noms.fr.json');
const FICHES: DonneesFichesMonde = lireFichesMonde(lire<FichierMonde>('fiches-monde.json'), lire<FichierMondeLangue>('fiches-monde.fr.json'));
const CAPITALES = lireCapitales(lire<LigneCapitales[]>('capitales.json'), lire<NomsCapitales>('capitales.fr.json'));
const DRAPEAUX = lireDrapeaux(lire<ManifesteDrapeaux>('drapeaux.json'));
const DRAPEAUX_T = lireDrapeauxTerritoires(lire<ManifesteDrapeauxTerritoires>('drapeaux-territoires.json'));
const T = textesFiche;
/** La part « habitants » de la ligne de faits d'un pays (« 123 millions d'hab. »). */
const hab = (id: string) => fmtHabitantsCourt(FICHES.lieux.get(id)!.habitants!.n);
const S = T.noms_sources;
/** Les lignes à relire, toutes relues, ou aucune (les deux états de LIGNES_RELUES). */
const TOUTES = Object.fromEntries(Object.keys(LIGNES_RELUES).map((k) => [k, true])) as Record<LigneRelue, boolean>;
const AUCUNE = Object.fromEntries(Object.keys(LIGNES_RELUES).map((k) => [k, false])) as Record<LigneRelue, boolean>;
/** Les lignes à relire d'un pays (lot F2) ; les autres clés (lot F3) ne touchent pas sa fiche. */
type LignePays = 'superficie' | 'langues' | 'gentile' | 'culminant' | 'fete';
/** Le libellé de chaque ligne à relire (« Langue » ou « Langues » selon le pays). */
const libelleRelue = (k: LignePays, id: string): string => {
  const lg = FICHES.lieux.get(id)!.langues!;
  return { superficie: T.superficie, langues: lg.officielles.length + lg.parlees.length > 1 ? T.langues : T.langue, gentile: T.gentile, culminant: T.culminant, fete: T.fete }[k];
};
/** Les libellés d'un pays qui a tous ses chiffres, dans l'ordre du § 4.2, selon les lignes relues. */
function libellesAttendus(id: string, capitale: string, R: Readonly<Record<LigneRelue, boolean>> = LIGNES_RELUES): string[] {
  const si = (k: LignePays) => (R[k] ? [libelleRelue(k, id)] : []);
  return [T.capitale, T.habitants, ...si('superficie'), ...si('langues'), T.monnaie, ...si('gentile'), remplir(T.heure, { capitale }), T.continent, ...si('culminant'), ...si('fete')];
}
/** Les libellés d'un territoire qui a tous ses chiffres (le Groenland), dans l'ordre du § 4.2, selon les lignes relues. */
function lignesTerritoire(_id: string, R: Readonly<Record<LigneRelue, boolean>>): string[] {
  const si = (k: LigneRelue, l: string) => (R[k] ? [l] : []);
  return [
    ...si('capitale_territoires', T.capitale),
    T.habitants,
    ...si('superficie_territoires', T.superficie),
    ...si('langues_territoires', T.langues),
    T.monnaie,
    ...si('gentile_territoires', T.gentile),
    R.capitale_territoires ? 'Heure à Nuuk' : T.heure_locale,
    T.continent,
    ...si('culminant_territoires', T.culminant),
  ];
}
/** Les sources du Japon (habitants de la Banque mondiale ; le Fuji à 3 776 m d'après Wikipédia), dans l'ordre de ses lignes, selon les lignes relues. */
function sourcesAttendues(_id: string, R: Readonly<Record<LigneRelue, boolean>> = LIGNES_RELUES): string[] {
  return [S.natural_earth, S.cldr, S.wikidata, S.banque_mondiale, ...(R.superficie ? [S.superficie] : []), S.tz, ...(R.culminant ? [S.wikipedia] : []), ...(R.fete ? [S.factbook] : []), S.flag_icons];
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
    drapeauxTerritoires: DRAPEAUX_T,
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

function monter(o: { fiche?: Partial<OptionsFiche>; memoire?: CarteMemoire; explorer?: typeof vueExplorer } = {}) {
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
    drapeauxTerritoires: () => (charges.push('drapeaux-territoires'), Promise.resolve(DRAPEAUX_T)),
    module: () => import('../src/vues/fiche'),
    ...o.fiche,
  };
  const vue = (o.explorer ?? vueExplorer)(ctx, { fiche, ...(o.memoire ? { memoire: o.memoire } : {}) });
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
    // « capitale · habitants » (§ 4.1), trois chiffres au plus.
    expect(v.faits()).toBe("Tokyo · 123 millions d'hab.");
    expect(v.chevron()).toBe(true);
    await tenir();
    const drapeau = () => v.el('#barre-carte .barre-drapeau')!;
    expect(drapeau().hidden).toBe(false);
    expect(drapeau().getAttribute('src')).toBe(DRAPEAUX.parPays.get('JPN')!.montre);
    expect(v.bouton().classList.contains('barre-avec-drapeau')).toBe(true);
    // Plusieurs capitales : toutes, dans l'ordre du fichier (la principale d'abord).
    v.toucher('BOL');
    expect(v.faits()).toBe(`${CAPITALES.parPays.get('BOL')!.justes.map((c) => c.nom).join(', ')} · ${hab('BOL')}`);
    // Un territoire (lot F3) : son statut, le chevron, ses habitants ; sa capitale attend la relecture (LIGNES_RELUES).
    v.toucher('GRL');
    expect(v.el('#barre-carte .barre-detail')!.textContent).toBe(textes.carte.statuts.territoire);
    expect(v.faits()).toBe(LIGNES_RELUES.capitale_territoires ? `Nuuk · ${hab('GRL')}` : hab('GRL'));
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
    expect(v.faits()).toBe(`Paris · ${hab('FRA')}`);
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

  it('les capitales manquées au premier toucher (hors ligne) : le chevron et les habitants seuls, puis la capitale au toucher suivant', async () => {
    let echoue = true;
    const v = monter({ fiche: { capitales: () => (echoue ? Promise.reject(new Error('hors ligne')) : Promise.resolve(CAPITALES)) } });
    v.vue.activer();
    v.toucher('JPN');
    await tenir();
    expect(v.chevron()).toBe(true);
    expect(v.faits()).toBe(hab('JPN'));
    echoue = false;
    v.toucher('JPN');
    await tenir();
    expect(v.faits()).toBe(`Tokyo · ${hab('JPN')}`);
  });

  it('une mer, sans fiches des mers branchées : pas de fiche, rien de chargé (une commune : tests/fiche-commune.test.ts)', async () => {
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

  it('un territoire, une zone contestée, l’Antarctique (lot F3) : le statut de la barre tant que le statut écrit n’est pas relu ; le drapeau d’un territoire à part, à son ouverture', async () => {
    const g = await ouvrirSur('GRL');
    expect(g.feuille()!.querySelector('.fiche-statut')!.textContent).toBe(LIGNES_RELUES.statut ? FICHES.lieux.get('GRL')!.statut : textes.carte.statuts.territoire);
    // Les lignes en ligne sans relecture : habitants, monnaie, heure (« Heure locale » tant que la capitale n'est pas relue), continent.
    expect(g.lignes().map((l) => l.split(' · ')[0])).toEqual(lignesTerritoire('GRL', LIGNES_RELUES));
    expect(g.feuille()!.querySelector('.fiche-drapeaux')!.hidden).toBe(false);
    // Le drapeau des territoires : leur manifeste, jamais celui des pays (les exercices).
    await vi.waitFor(() => expect(g.feuille()!.querySelectorAll('.fiche-drapeaux img').map((i) => i.getAttribute('src'))).toEqual([DRAPEAUX_T.get('GRL')]));
    expect(g.charges).toEqual(['fiches', 'capitales', 'drapeaux-territoires']);
    expect(g.feuille()!.querySelector('.fiche-wikipedia')!.getAttribute('href')).toBe('https://fr.wikipedia.org/wiki/Groenland');
    expect(g.feuille()!.querySelector('.fiche-voisins')).toBeNull();
    const z = await ouvrirSur('ESH');
    expect(z.feuille()!.querySelector('.fiche-statut')!.textContent).toBe(LIGNES_RELUES.statut ? FICHES.lieux.get('ESH')!.statut : textes.carte.statuts.conteste);
    expect(z.lignes().map(simple)).toEqual([...(LIGNES_RELUES.habitants_zones ? [`${T.habitants} · ${simple(fmtHabitants(612_000, 2021))}`] : []), `${T.continent} · Afrique · Afrique du Nord`]);
    expect(z.voisins()).toEqual(['Algérie', 'Maroc', 'Mauritanie']);
    expect(z.feuille()!.querySelector('.fiche-drapeaux')!.hidden).toBe(true);
    expect(z.charges).not.toContain('drapeaux-territoires');
    // Ni note de Natural Earth : seul le statut écrit et relu, une fois relu.
    expect(z.feuille()!.textContent).not.toMatch(/Self admin/i);
    const a = await ouvrirSur('ATA');
    expect(a.feuille()!.querySelector('.fiche-statut')!.textContent).toBe(T.statut_continent);
    expect(a.lignes().map((l) => l.split(' · ')[0])).toEqual([...(LIGNES_RELUES.superficie_territoires ? [T.superficie] : []), T.continent, ...(LIGNES_RELUES.culminant_territoires ? [T.culminant] : [])]);
    expect(a.feuille()!.querySelector('.fiche-drapeaux')!.hidden).toBe(true);
    expect(a.feuille()!.querySelector('.fiche-wikipedia')!.getAttribute('href')).toBe('https://fr.wikipedia.org/wiki/Antarctique');
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
    expect(v.faits()).toBe(`Pékin · ${hab('CHN')}`);
    expect(v.chevron()).toBe(true);
  });

  it('depuis un bilan (lot F6) : le lieu montré et sa fiche ; « ‹ » et Échap disent « Retour au bilan » et le rendent ; sur un voisin, un pas', async () => {
    const retourBilan = vi.fn();
    const v = monter({ fiche: { retourBilan } });
    // Hors de l'accueil : rien (main.ts montre la carte d'abord).
    v.vue.ouvrirFiche('monde', 'FRA');
    expect(v.feuille()).toBeNull();
    v.vue.activer();
    v.vue.ouvrirFiche('monde', 'FRA');
    expect(v.barre().dataset.id).toBe('FRA');
    expect(v.montres).toContain('FRA');
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    const avant = () => v.el('#fiche-lieu .fiche-avant')!;
    expect(avant().hidden).toBe(false);
    expect(avant().getAttribute('aria-label')).toBe(T.avant_bilan);
    expect(avant().getAttribute('title')).toBe(T.avant_bilan);
    // « ‹ Bilan » en clair, le mot caché au lecteur d'écran (il lit l'aria-label entier).
    expect(avant().textContent).toBe('‹' + T.avant_bilan_court);
    avant().click();
    expect(retourBilan).toHaveBeenCalledTimes(1);
    v.echap();
    expect(retourBilan).toHaveBeenCalledTimes(2);
    // Un voisin : « ‹ » redevient « Fiche d'avant », un pas en arrière (la pile de la vue), sans le bilan.
    (v.feuille()!.querySelectorAll('.fiche-voisin').find((b) => b.dataset.id === 'ESP') as El).click();
    await vi.waitFor(() => expect(v.titre()).toBe('Espagne'));
    expect(avant().getAttribute('aria-label')).toBe(T.avant);
    expect(avant().textContent).toBe('‹');
    avant().click();
    await vi.waitFor(() => expect(v.titre()).toBe('France'));
    expect(retourBilan).toHaveBeenCalledTimes(2);
    expect(avant().getAttribute('aria-label')).toBe(T.avant_bilan);
  });

  it('depuis un bilan, pendant une partie (autorisee faux) : ni lieu ni fiche ; sans retourBilan, « ‹ » fait un pas (la fiche se ferme)', async () => {
    let autorisee = false;
    const v = monter({ fiche: { autorisee: () => autorisee } });
    v.vue.activer();
    v.vue.ouvrirFiche('monde', 'JPN');
    await tenir();
    expect(v.barre().dataset.id).toBeUndefined();
    expect(v.feuille()).toBeNull();
    autorisee = true;
    v.vue.ouvrirFiche('monde', 'JPN');
    await vi.waitFor(() => expect(v.titre()).toBe('Japon'));
    v.el('#fiche-lieu .fiche-avant')!.click();
    expect(v.ouverte()).toBe(false);
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

// « Apprendre ce lieu » (lot F7, § 5.4 et § 5.5) : la fiche ne lit que l'état rendu par ApprendreFiche
// (apprendre-lieu.ts, depuis les comptes de la séance : tests/seance-vue.test.ts) ; ici, ce qu'elle en montre
// et ce que ses boutons demandent.
describe('la fiche : le bloc Mémoire et « Apprendre ce lieu » (lot F7)', () => {
  beforeEach(() => vi.useRealTimers());
  const F = textesFiche;
  /** Une mémoire dont les lignes ne viennent que si la fiche les demande malgré le réglage coupé (§ 5.5). */
  const coupee = {
    details: (_t: string, _id: string, jouable: boolean, malgre?: boolean) => (jouable && malgre ? ['Pays : vu 1 fois · revient demain', 'Capitale : jamais vue', 'Drapeau : jamais vu'] : null),
    actif: () => false,
    detail: () => null,
    sujets: () => [],
    sujet: () => 'pays',
    choisir() {},
    teintes: () => null,
    maitrises: () => null,
  } as unknown as CarteMemoire;
  /** Un ApprendreFiche factice : l'état donné pour tout lieu jouable, les gestes notés ; null pour un territoire. */
  function apprendre(etat: ApprendreModele | null) {
    const gestes: string[] = [];
    let e = etat;
    const a: ApprendreFiche = {
      etat: (_t, id) => (id === 'GRL' ? null : e),
      lancer: (t, id) => void gestes.push(`lancer ${t} ${id}`),
      retenir: (t, id) => {
        gestes.push(`retenir ${t} ${id}`);
        if (e) e = { ...e, retenu: true };
      },
      oublier: (t, id) => {
        gestes.push(`oublier ${t} ${id}`);
        if (e) e = { ...e, retenu: false };
      },
    };
    return { a, gestes };
  }
  const bloc = (v: Awaited<ReturnType<typeof ouvrirSur>>) => v.feuille()!.querySelector('.fiche-memoire');
  const textes_ = (v: Awaited<ReturnType<typeof ouvrirSur>>) => (bloc(v)?.querySelectorAll('p') ?? []).map((p) => p.textContent);

  it('possible : « Apprendre ce lieu », et dessous « après 12 révisions · avec 6 pays voisins » ; le toucher lance la séance sur ce lieu', async () => {
    const { a, gestes } = apprendre({ sujet: 'pays', lieu: { etat: 'possible', voisins: 6, revisions: 12 }, retenu: false, garde: true });
    const v = await ouvrirSur('MUS', { memoire: coupee, fiche: { apprendre: a } });
    // Les lignes de la mémoire, réglage coupé (§ 5.5), puis le bouton.
    expect(bloc(v)!.querySelectorAll('li').map((l) => l.textContent)).toEqual(['Pays : vu 1 fois · revient demain', 'Capitale : jamais vue', 'Drapeau : jamais vu']);
    const b = v.el('#fiche-apprendre')!;
    expect(b.textContent).toBe('Apprendre ce lieu');
    expect(b.classList.contains('secondary')).toBe(false);
    expect(b.getAttribute('aria-describedby')).toBe('fiche-apprendre-detail');
    expect(v.el('#fiche-apprendre-detail')!.textContent).toBe('après 12 révisions · avec 6 pays voisins');
    expect(v.el('#fiche-retenir')).toBeNull();
    b.click();
    expect(gestes).toEqual(['lancer monde MUS']);
    // Le même, sans révision, un seul voisin ; une mer, une commune : leurs mots.
    const un = apprendre({ sujet: 'pays', lieu: { etat: 'possible', voisins: 1, revisions: 1 }, retenu: false, garde: true });
    const w = await ouvrirSur('MUS', { fiche: { apprendre: un.a } });
    expect(w.el('#fiche-apprendre-detail')!.textContent).toBe('après 1 révision · avec 1 pays voisin');
    expect(remplir(F.apprendre_avec.mers.n, { n: 4 })).toBe('avec 4 océans ou mers voisins');
    expect(remplir(F.apprendre_avec.communes.n, { n: 5 })).toBe('avec 5 communes voisines');
  });

  it('mémoire en lecture, données pas chargées : le bouton sans ligne ; pas gardée : l’avis de la séance', async () => {
    for (const lieu of [null, { etat: 'a_charger' as const }]) {
      const { a } = apprendre({ sujet: 'pays', lieu, retenu: false, garde: true });
      const v = await ouvrirSur('MUS', { fiche: { apprendre: a } });
      expect(v.el('#fiche-apprendre')!.textContent).toBe('Apprendre ce lieu');
      expect(v.el('#fiche-apprendre')!.getAttribute('aria-describedby')).toBeNull();
      // Sans lignes de la mémoire (pas encore lues) : le bloc existe pour le bouton.
      expect(bloc(v)!.querySelector('ul')).toBeNull();
    }
    const { a } = apprendre({ sujet: 'pays', lieu: { etat: 'possible', voisins: 6, revisions: 0 }, retenu: false, garde: false });
    const v = await ouvrirSur('MUS', { fiche: { apprendre: a } });
    expect(v.el('#fiche-apprendre-detail')!.textContent).toBe('avec 6 pays voisins');
    expect(textes_(v)).toContain(textes.seance.non_garde);
  });

  it('appris, territoire : pas de bouton (les lignes suffisent ; un territoire n’a pas de bloc)', async () => {
    const { a } = apprendre({ sujet: 'pays', lieu: { etat: 'appris' }, retenu: false, garde: true });
    const v = await ouvrirSur('MUS', { memoire: coupee, fiche: { apprendre: a } });
    expect(bloc(v)!.querySelectorAll('li').length).toBe(3);
    expect(bloc(v)!.querySelector('button')).toBeNull();
    const g = await ouvrirSur('GRL', { memoire: coupee, fiche: { apprendre: a } });
    expect(g.feuille()!.querySelector('.fiche-memoire')).toBeNull();
  });

  it('pas aujourd’hui : pourquoi (chaque raison), et « Retenir ce lieu » ; retenu : « Noté », « Annuler » rend le bouton, le focus gardé', async () => {
    const raisons = {
      dues: F.apprendre_dues,
      plafond: textes.seance.plafond,
      grappe_faite: F.apprendre_grappe_faite,
      introductions: textes.seance.introductions,
      autre_grappe: F.apprendre_autre,
    } as const;
    for (const [raison, texte] of Object.entries(raisons)) {
      const { a } = apprendre({ sujet: 'pays', lieu: { etat: 'attendre', raison: raison as keyof typeof raisons }, retenu: false, garde: true });
      const v = await ouvrirSur('MUS', { fiche: { apprendre: a } });
      expect(textes_(v)[0], raison).toBe(texte);
      expect(v.el('#fiche-apprendre'), raison).toBeNull();
      expect(v.el('#fiche-retenir')!.textContent).toBe(F.retenir);
    }
    expect(F.apprendre_grappe_faite).toBe('La grappe du jour est déjà apprise.');
    const { a, gestes } = apprendre({ sujet: 'pays', lieu: { etat: 'attendre', raison: 'grappe_faite' }, retenu: false, garde: true });
    const v = await ouvrirSur('MUS', { fiche: { apprendre: a } });
    expect(v.el('#fiche-retenir')!.classList.contains('secondary')).toBe(true);
    expect(v.el('#fiche-retenir-detail')!.textContent).toBe(F.retenir_detail);
    // La région annoncée existe avant le geste, vide (une région live créée avec son texte n'est en général pas dite).
    const annonce = v.el('#fiche-annonce')!;
    expect(annonce.getAttribute('aria-live')).toBe('polite');
    expect(annonce.textContent).toBe('');
    v.el('#fiche-retenir')!.focus();
    v.el('#fiche-retenir')!.click();
    expect(gestes).toEqual(['retenir monde MUS']);
    // La même région (pas refaite avec la fiche) reçoit « Noté » : le lecteur d'écran le dit.
    expect(v.el('#fiche-annonce')).toBe(annonce);
    expect(annonce.textContent).toBe(F.retenu);
    // La fiche refaite sur place : « Noté », « Annuler » à la place de « Retenir », qui prend le focus ; la fiche reste ouverte.
    expect(v.ouverte()).toBe(true);
    expect(v.el('#fiche-retenir')).toBeNull();
    expect(textes_(v)).toEqual([F.apprendre_grappe_faite, F.retenu]);
    // Le paragraphe visible n'est pas une région live (il naît avec la fiche refaite) : pas de double annonce.
    expect(v.el('.fiche-apprendre-retenu')!.getAttribute('role')).toBeNull();
    expect(v.el('#fiche-oublier')!.textContent).toBe(F.annuler);
    expect(v.doc.activeElement).toBe(v.el('#fiche-oublier'));
    v.el('#fiche-oublier')!.click();
    expect(gestes).toEqual(['retenir monde MUS', 'oublier monde MUS']);
    expect(v.el('#fiche-retenir')).not.toBeNull();
    expect(v.el('#fiche-oublier')).toBeNull();
    // « Annuler » : l'annonce vidée (un second « Retenir » la redira).
    expect(annonce.textContent).toBe('');
  });

  it('retenu, et possible (le lendemain) : le bouton, puis « Noté » et « Annuler »', async () => {
    const { a } = apprendre({ sujet: 'pays', lieu: { etat: 'possible', voisins: 6, revisions: 0 }, retenu: true, garde: true });
    const v = await ouvrirSur('MUS', { fiche: { apprendre: a } });
    expect(v.el('#fiche-apprendre')).not.toBeNull();
    expect(v.el('#fiche-oublier')).not.toBeNull();
    expect(textes_(v)).toEqual(['avec 6 pays voisins', F.retenu]);
  });

  it('la règle du bloc : boutons de 44 px au moins (la mise en page : pilote, ui_fiche_apprendre)', () => {
    expect(readFileSync('src/carte.css', 'utf8')).toContain('.fiche-apprendre button { min-height: 44px; }');
  });
});

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
    expect(m.sources).toEqual([S.natural_earth, S.cldr, S.wikidata, S.banque_mondiale, S.superficie, S.tz, S.wikipedia, S.factbook, S.flag_icons]);
    expect(m.sources.filter((x) => x.includes('Wikidata'))).toEqual(['Wikidata', 'superficie selon Wikidata']);
  });

  it('une ligne écrite à la main hors de Wikidata nomme sa source au pied, seulement relue : le sommet de la Gambie (Factbook), le gentilé du Vatican (Wikipédia)', () => {
    const src = (id: string, R: Record<LigneRelue, boolean>) => composer(id, { relues: R }).sources;
    // La Gambie : sans fête relue, le Factbook n'est cité que par son sommet.
    expect(src('GMB', { ...AUCUNE, culminant: true })).toContain(S.factbook);
    expect(src('GMB', AUCUNE)).not.toContain(S.factbook);
    expect(src('VAT', { ...AUCUNE, gentile: true })).toContain(S.wikipedia);
    expect(src('VAT', AUCUNE)).not.toContain(S.wikipedia);
    expect(src('FIN', { ...AUCUNE, culminant: true })).toContain(S.wikipedia);
    // Tout de Wikidata : pas de Wikipédia au pied (le lien vers l'article n'est pas une source).
    expect(src('FRA', TOUTES)).not.toContain(S.wikipedia);
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
    // Une capitale à article ou nom commun : la forme toute faite des données (« au Caire »),
    // jamais « Heure à Le Caire » ; les autres, « à » et le nom (« à La Havane » est juste).
    const libellesHeure = (id: string) => composer(id).faits.filter((f) => f.heure).map((f) => f.libelle);
    expect(libellesHeure('EGY')).toEqual(['Heure au Caire']);
    expect(libellesHeure('VAT')).toEqual(['Heure à la Cité du Vatican']);
    expect(libellesHeure('CUB')).toEqual(['Heure à La Havane']);
    for (const id of FICHES.lieux.keys()) for (const l of composer(id).faits.filter((f) => f.heure).map((f) => f.libelle)) expect(l, id).not.toMatch(/ à (Le|Les|L')\s|Heure à Cité/);
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
    // Des modules neufs (le cache des formateurs de format.ts vide, rien hérité des tests
    // précédents) et toutes les lignes relues : superficie, sommet et fête exercés aussi.
    // Le DOM factice d'abord : pendant les imports, les images en attente des tests
    // précédents tombent encore (requestAnimationFrame).
    installerDom();
    vi.resetModules();
    vi.doMock('../src/fiches/relues', () => ({ LIGNES_RELUES: TOUTES }));
    try {
      const F = await import('../src/fiches/format');
      const { vueExplorer: explorer } = await import('../src/vues/explorer');
      expect(F.nombreFormateurs()).toBe(0);
      const v = monter({ explorer, fiche: { module: () => import('../src/vues/fiche') } });
      v.vue.activer();
      v.toucher('KAZ');
      await tenir();
      // Le repos : requestIdleCallback absent du DOM factice, un délai de 50 ms à la place.
      await new Promise((r) => setTimeout(r, 80));
      const n = F.nombreFormateurs();
      expect(n).toBeGreaterThan(0);
      v.bouton().click();
      await vi.waitFor(() => expect(v.ouverte()).toBe(true));
      const libelles = v.lignes().map((l) => l.split(' · ')[0]);
      for (const l of ['Heure à Astana', T.superficie, T.culminant, T.fete, T.habitants, T.gentile]) expect(libelles, l).toContain(l);
      expect(F.nombreFormateurs()).toBe(n);
    } finally {
      vi.doUnmock('../src/fiches/relues');
      vi.resetModules();
    }
  });
});

describe('les fiches du lot F3 : territoires, zones contestées, Antarctique', () => {
  const T0 = new Date('2026-11-18T12:20:45Z');

  it('le Groenland, toutes les lignes relues : statut écrit, capitale, chiffres dans l’ordre du § 4.2, drapeau ; le pied nomme ses sources', () => {
    const m = composer('GRL', { relues: TOUTES, maintenant: T0 });
    expect(m.statut).toBe('Partie autonome du royaume du Danemark');
    expect(lignesDe(m)).toEqual([
      'Capitale · Nuuk',
      'Habitants · 56 831 (2025)',
      'Superficie · 2 166 086 km²',
      'Langues · groenlandais · danois 14 %',
      'Monnaie · couronne danoise',
      'Gentilé · les Groenlandais',
      simple(`Heure à Nuuk · ${fmtHeureLieu('America/Nuuk', 1, T0)}`),
      'Continent · Amérique du Nord · Amérique septentrionale',
      'Point culminant · Gunnbjørn, 3 694 m',
    ]);
    expect(m.drapeaux).toEqual([DRAPEAUX_T.get('GRL')]);
    expect(m.avecDrapeau).toBe(true);
    expect(m.wikipedia).toBe('https://fr.wikipedia.org/wiki/Groenland');
    expect(m.sources).toEqual([S.natural_earth, S.cldr, S.wikidata, S.banque_mondiale, S.superficie, S.tz, S.flag_icons]);
    // Aucune ligne relue : le libellé générique, ni capitale ni « Heure à Nuuk ».
    const sans = composer('GRL', { relues: AUCUNE, maintenant: T0 });
    expect(sans.statut).toBe(textes.carte.statuts.territoire);
    expect(lignesDe(sans).map((l) => l.split(' · ')[0])).toEqual(lignesTerritoire('GRL', AUCUNE));
    // Chaque clé du lot F3, relue seule, n'ajoute que sa ligne, à sa place.
    for (const k of ['capitale_territoires', 'superficie_territoires', 'langues_territoires', 'gentile_territoires', 'culminant_territoires'] as const) {
      const R = { ...AUCUNE, [k]: true };
      expect(lignesDe(composer('GRL', { relues: R, maintenant: T0 })).map((l) => l.split(' · ')[0]), k).toEqual(lignesTerritoire('GRL', R));
    }
  });

  it('Hong Kong : sans capitale, « Heure locale » ; les îles Heard : « aucun habitant permanent », sans année ; un territoire sans code ISO : ni drapeau, ni place pour lui', () => {
    const h = composer('HKG', { relues: TOUTES, maintenant: T0 });
    expect(h.statut).toBe('Région administrative spéciale de la Chine');
    expect(lignesDe(h).map((l) => l.split(' · ')[0])).toEqual([T.habitants, T.superficie, T.langues, T.monnaie, T.gentile, T.heure_locale, T.continent, T.culminant]);
    expect(lignesDe(h)).toContain('Langues · chinois et anglais · cantonais 90 %');
    expect(lignesDe(composer('HMD', { relues: TOUTES }))).toContain(`${T.habitants} · ${T.aucun_habitant}`);
    const k = composer('NE_KAB', { relues: TOUTES, maintenant: T0 });
    expect([k.avecDrapeau, k.drapeaux]).toEqual([false, []]);
    expect(k.sources).not.toContain(S.flag_icons);
    expect(lignesDe(k).map((l) => l.split(' · ')[0])).toEqual([T.heure_locale, T.continent]);
  });

  it('une zone contestée (D57 a) : son statut, ses habitants sourcés, le continent, les voisins, le lien ; aucun autre champ, même présent dans les données', () => {
    const e = composer('ESH', { relues: TOUTES, maintenant: T0 });
    expect(e.statut).toBe(FICHES.lieux.get('ESH')!.statut);
    expect(lignesDe(e)).toEqual(['Habitants · 612 000 (2021)', 'Continent · Afrique · Afrique du Nord']);
    expect([e.avecDrapeau, e.drapeaux]).toEqual([false, []]);
    expect(e.sources).toEqual([S.natural_earth, S.cldr, S.wikidata]);
    // Des données qu'une zone ne doit jamais montrer, glissées dans sa fiche : aucune ne sort.
    const lieux = new Map(FICHES.lieux);
    const japon = FICHES.lieux.get('JPN')!;
    lieux.set('ESH', { ...japon, sorte: 'zone', statut: e.statut, capitale: 'Laâyoune' });
    const z = composer('ESH', { relues: TOUTES, maintenant: T0, fiches: { ...FICHES, lieux } });
    expect(lignesDe(z).map((l) => l.split(' · ')[0])).toEqual([T.habitants, T.continent]);
    expect(z.sources).not.toContain(S.tz);
    // Bir Tawil : ni tenant ni habitants ; Bajo Nuevo et Serranilla : aucun habitant permanent.
    expect(lignesDe(composer('NE_BRT', { relues: TOUTES }))).toEqual(['Continent · Afrique · Afrique du Nord']);
    expect(composer('NE_BRT', { relues: TOUTES }).statut).toMatch(/aucun État ne revendique/);
    expect(lignesDe(composer('NE_SER', { relues: TOUTES }))[0]).toBe(`${T.habitants} · ${T.aucun_habitant}`);
    // Les habitants d'une zone attendent leur relecture (habitants_zones).
    expect(lignesDe(composer('ESH', { relues: { ...TOUTES, habitants_zones: false } }))).toEqual(['Continent · Afrique · Afrique du Nord']);
  });

  it('l’Antarctique : « continent », sa superficie et son sommet relus ; rien sur les revendications', () => {
    const a = composer('ATA', { relues: TOUTES });
    expect(a.statut).toBe(T.statut_continent);
    expect(lignesDe(a)).toEqual(['Superficie · 14 106 900 km²', 'Continent · Antarctique', 'Point culminant · massif Vinson, 4 892 m']);
    expect([a.avecDrapeau, a.wikipedia]).toEqual([false, 'https://fr.wikipedia.org/wiki/Antarctique']);
  });

  it('la barre d’un territoire : « Nuuk · 56 800 hab. » une fois les capitales relues ; « aucun habitant permanent » ; rien pour une zone ni l’Antarctique', async () => {
    const v = monter({ fiche: { relues: TOUTES } });
    v.vue.activer();
    v.toucher('GRL');
    // La ligne attend aussi le morceau de la fiche (étude § 19), réimporté après le resetModules du test d'avant.
    await vi.waitFor(() => expect(v.faits()).toBe(`Nuuk · ${hab('GRL')}`));
    v.toucher('HMD');
    expect(v.faits()).toBe(T.aucun_habitant);
    v.toucher('ESH');
    expect(v.faits()).toBe('');
    expect(v.chevron()).toBe(true);
    v.toucher('ATA');
    expect(v.faits()).toBe('');
  });
});

describe('la carte de situation en tête de la fiche (lot F8, D61 b)', () => {
  // Les vraies formes du dépôt : le monde (monde.topo.json), l'île, la couche légère des mers.
  const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
  const MONDE = assembler(lire<Topology<never>>('monde.topo.json'), pays, lire<Contestee[]>('contestees.json'), noms);
  const ILE = assemblerTerrain(lire<Topology<never>>('reunion/communes.topo.json'), 'communes', lire<Lieu[]>('reunion/communes.json'), lire<Record<string, string>>('reunion/noms.fr.json'));
  const MERS = assemblerLegere({ leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
  const SOURCE: SourceSituation = { monde: () => MONDE, ile: () => ILE, mers: () => ({ mers: MERS.mers, zones: MERS.zones }) };

  /** requestIdleCallback tenu à la main : chaque tranche reçoit une échéance de `ms` (0 : un seul pas par tranche). */
  function repos() {
    const attente = new Map<number, (e: { timeRemaining(): number; didTimeout: boolean }) => void>();
    let n = 0;
    vi.stubGlobal('requestIdleCallback', (f: (e: { timeRemaining(): number; didTimeout: boolean }) => void) => (attente.set(++n, f), n));
    vi.stubGlobal('cancelIdleCallback', (h: number) => void attente.delete(h));
    return {
      attente: () => attente.size,
      /** Une tranche. */
      une(ms = 0): void {
        const [h, f] = attente.entries().next().value!;
        attente.delete(h);
        f({ timeRemaining: () => ms, didTimeout: false });
      },
      /** Les tranches jusqu'à la carte posée ; rend leur nombre. */
      vider(ms = 0): number {
        let k = 0;
        while (attente.size) {
          const [h, f] = attente.entries().next().value!;
          attente.delete(h);
          if (++k > 5000) throw new Error('le calcul ne finit pas');
          f({ timeRemaining: () => ms, didTimeout: false });
        }
        return k;
      },
    };
  }

  /** Une feuille seule (sans la vue), branchée sur les vraies formes. */
  function feuilleSeule(source: SourceSituation = SOURCE) {
    installerDom();
    const zone = new El('main');
    const f = creerFeuille(zone as unknown as HTMLElement, { fermer() {}, voile() {}, avant() {}, voisin() {} }, source);
    const el = (sel: string) => (zone as El).querySelector(sel);
    return { f, el, place: () => el('#fiche-lieu .fiche-situation')!, svg: () => el('#fiche-lieu .fiche-situation svg') };
  }

  /** Le modèle d'un lieu sans fiche du monde (une mer, une commune) : la tête seule compte ici. */
  const modele = (terrain: 'monde' | 'reunion', id: string, sorte: ModeleFiche['sorte'], nom: string): ModeleFiche => ({
    terrain,
    id,
    sorte,
    nom,
    statut: '',
    drapeaux: [],
    avecDrapeau: false,
    faits: [],
    voisins: [],
    titreVoisins: '',
    memoire: null,
    apprendre: null,
    wikipedia: null,
    sources: [],
  });

  it('sa place est réservée dès l’ouverture, dans la tête (à côté de « × », avant le drapeau), vide ; la carte vient après la montée, en temps libre', () => {
    const r = repos();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('no-preference') }));
    const v = feuilleSeule();
    v.f.montrer(composer('JPN'), { avant: false, focus: true });
    const tete = v.el('#fiche-lieu .fiche-tete')!;
    const enfants = tete.enfants.filter((e): e is El => e instanceof El).map((e) => e.className);
    expect(enfants.slice(0, 4)).toEqual(['croix', 'fiche-avant', 'fiche-situation', 'fiche-drapeaux']);
    expect(v.place().getAttribute('aria-hidden')).toBe('true');
    expect(v.place().dataset.etat).toBe('attente');
    expect(v.svg()).toBeNull();
    // Rien en temps libre pendant la montée.
    expect(r.attente()).toBe(0);
    (v.f.element as unknown as El).emettre('animationend', {});
    expect(r.attente()).toBe(1);
    expect(r.vider()).toBeGreaterThan(1);
    expect(v.place().dataset.etat).toBe('prete');
    expect(v.place().dataset.region).toBe('continent:Asia');
    expect(v.svg()!.getAttribute('viewBox')!.split(' ')).toHaveLength(4);
    expect(v.svg()!.getAttribute('aria-hidden')).toBe('true');
    expect(v.svg()!.querySelector('.situation-lieu')!.getAttribute('d')).toMatch(/^M/);
    expect(v.svg()!.querySelector('.vignette-fond')!.getAttribute('d')!.length).toBeGreaterThan(1000);
    expect(v.svg()!.querySelector('.situation-anneau')).toBeNull();
    // La règle de la place : une taille fixe (la tête ne saute pas), à droite, en 3:2, plus grande sur PC.
    const css = readFileSync('src/carte.css', 'utf8');
    const regle = /\n\.fiche-situation \{([^}]*)\}/.exec(css)?.[1] ?? '';
    for (const r2 of [/float: right;/, /width: 96px;/, /height: 64px;/, /overflow: hidden;/]) expect(regle).toMatch(r2);
    expect(css).toMatch(/@media \(min-width: 701px\) \{[^}]*\}\s*\.fiche-situation \{ width: 120px; height: 80px; \}/);
  });

  it('sans animationend (onglet caché, animation coupée) : la carte part quand même, SITUATION_APRES_MS après l’ouverture ; sans montée, tout de suite', async () => {
    vi.useFakeTimers();
    try {
      const r = repos();
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('no-preference') }));
      const v = feuilleSeule();
      v.f.montrer(composer('FRA'), { avant: false, focus: true });
      vi.advanceTimersByTime(SITUATION_APRES_MS - 1);
      expect(r.attente()).toBe(0);
      vi.advanceTimersByTime(1);
      expect(r.attente()).toBe(1);
      // Un voisin, la feuille ouverte : pas de montée, le calcul part tout de suite.
      v.f.montrer(composer('ESP'), { avant: true, focus: true });
      expect(r.attente()).toBe(1);
      r.vider();
      expect(v.place().dataset.lieu).toBe('ESP');
      expect(v.place().dataset.etat).toBe('prete');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gardée d’une fiche à l’autre : le fond de la région se trace une fois, la carte d’un lieu revient tout de suite (rouverte, ou refaite sur place)', () => {
    const r = repos();
    const v = feuilleSeule();
    v.f.montrer(composer('CHN'), { avant: false, focus: true });
    const chine = r.vider();
    // Le Japon, dans la même région : le fond est gardé, seul le Japon se trace.
    v.f.montrer(composer('JPN'), { avant: true, focus: true });
    const japon = r.vider();
    expect(japon).toBeLessThan(chine / 3);
    expect(v.place().dataset.region).toBe('continent:Asia');
    // La Chine rouverte : sa carte est là dès la pose de la tête, sans rien en temps libre.
    v.f.fermer();
    v.f.montrer(composer('CHN'), { avant: false, focus: true });
    expect(v.place().dataset.etat).toBe('prete');
    expect(v.svg()!.querySelector('.situation-lieu')).not.toBeNull();
    expect(r.attente()).toBe(0);
    // La même fiche refaite sur place (rafraichir) : de même.
    v.f.montrer(composer('CHN'), { avant: false, focus: false });
    expect(v.place().dataset.etat).toBe('prete');
    expect(r.attente()).toBe(0);
  });

  it('fermée en plein calcul : il s’arrête ; rouverte, le fond reprend où il en était', () => {
    const r = repos();
    // Une feuille témoin (ses caches à elle) : le nombre de pas de l'Allemagne, d'un trait.
    feuilleSeule().f.montrer(composer('DEU'), { avant: false, focus: true });
    const tout = r.vider();
    const v = feuilleSeule();
    v.f.montrer(composer('DEU'), { avant: false, focus: true });
    for (let i = 0; i < 5; i++) r.une();
    v.f.fermer();
    expect(r.attente()).toBe(0);
    v.f.montrer(composer('DEU'), { avant: false, focus: true });
    expect(v.place().dataset.etat).toBe('attente');
    // Les 4 pas du fond déjà faits ne se refont pas (la région se résout de nouveau : un pas).
    expect(r.vider()).toBe(tout - 4);
    expect(v.place().dataset.etat).toBe('prete');
  });

  it('le calcul se fait par pas : le Canada (13 316 points, 412 polygones) en plusieurs tranches, MORCEAU points au plus chacune (un polygone plus grand : seul)', () => {
    const r = repos();
    const v = feuilleSeule();
    v.f.montrer(composer('USA'), { avant: false, focus: true });
    r.vider(1000);
    // Le fond de l'Amérique du Nord est gardé : le Canada seul se trace, en plusieurs pas.
    v.f.montrer(composer('CAN'), { avant: true, focus: true });
    // Son plus grand polygone (3 737 points) en un pas, le reste par MORCEAU points au plus.
    expect(r.vider()).toBeGreaterThanOrEqual(Math.ceil((13316 - 3737) / MORCEAU));
    expect(v.place().dataset.region).toBe('continent:North America');
  });

  it('chaque sorte de lieu : pays, territoire, zone contestée, Antarctique, mer, océan, commune ; un lieu micro gagne un anneau', () => {
    const r = repos();
    const v = feuilleSeule();
    const voir = (m: ModeleFiche) => {
      v.f.montrer(m, { avant: false, focus: true });
      r.vider(1000);
      const p = v.place();
      const s = v.svg()!;
      const d = (c: string) => s.querySelector(`.${c}`)?.getAttribute('d') ?? '';
      return {
        region: p.dataset.region,
        monde: p.classList.contains('situation-monde'),
        lieu: d('situation-lieu').length,
        eau: d('situation-eau').length,
        fond: d('vignette-fond').length,
        anneau: !!s.querySelector('.situation-anneau'),
        eclaire: p.dataset.eclaire,
      };
    };
    // Le lieu éclairé est bien le sien (sa forme, pas celle d'un voisin) : chaque pays, territoire ou zone.
    for (const id of ['FRA', 'RUS', 'VAT', 'GRL', 'SHN', 'FLK', 'PYF', 'NE_SPI', 'ESH', 'TWN', 'EGY', 'ATA']) expect(voir(composer(id)).eclaire, id).toBe(id);
    // Un pays dans sa région ; la Russie (son point en Sibérie) : le monde.
    expect(voir(composer('FRA'))).toMatchObject({ region: 'continent:Europe', monde: false, anneau: false });
    expect(voir(composer('RUS'))).toMatchObject({ region: 'monde:0', monde: true, anneau: false });
    // Micro : le Vatican, Monaco ; Maurice dans l'Afrique.
    for (const id of ['VAT', 'MCO']) expect(voir(composer(id)), id).toMatchObject({ region: 'continent:Europe', anneau: true });
    expect(voir(composer('MUS'))).toMatchObject({ anneau: true });
    // Un territoire : le Groenland, hors du cadre de l'Amérique du Nord (son point au nord du Canada) : le monde ;
    // Sainte-Hélène (micro), dans la boîte de l'Afrique (élargie en 3:2) : l'Afrique et son anneau.
    expect(voir(composer('GRL'))).toMatchObject({ region: 'monde:0', monde: true, anneau: false });
    expect(voir(composer('SHN'))).toMatchObject({ region: 'continent:Africa', monde: false, anneau: true });
    // Les Malouines, au large de l'Amérique du Sud, hors de sa boîte : le monde et son anneau.
    expect(voir(composer('FLK'))).toMatchObject({ region: 'monde:0', monde: true, anneau: true });
    // Hors du cadre de son continent mais assez près pour y compter : le cadre élargi à lui (la Polynésie française,
    // le champ de glace Sud de Patagonie, au bord de l'Amérique du Sud).
    expect(voir(composer('PYF'))).toMatchObject({ region: 'continent:Oceania+PYF', monde: false, anneau: true });
    expect(voir(composer('NE_SPI'))).toMatchObject({ region: 'continent:South America+NE_SPI', monde: false });
    // Une zone contestée : le Sahara occidental dans l'Afrique (moins de 2,5 % de la largeur de la boîte : son anneau).
    expect(voir(composer('ESH'))).toMatchObject({ region: 'continent:Africa', monde: false, anneau: true });
    // Taïwan (pays non jouable) dans l'Asie ; l'Égypte, assez grande : sans anneau.
    expect(voir(composer('TWN'))).toMatchObject({ region: 'continent:Asia', anneau: true });
    expect(voir(composer('EGY'))).toMatchObject({ region: 'continent:Africa', anneau: false });
    // L'Antarctique : le monde.
    expect(voir(composer('ATA'))).toMatchObject({ region: 'monde:0', monde: true, anneau: false });
    // Une mer : son cadre, éclairée sous les terres (l'eau, pas de lieu) ; un océan : le monde.
    const medit = voir(modele('monde', 'medit', 'mer', 'mer Méditerranée'));
    expect(medit).toMatchObject({ region: 'mer:medit', monde: false, lieu: 0, anneau: false });
    expect(medit.eau).toBeGreaterThan(100);
    expect(medit.fond).toBeGreaterThan(1000);
    expect(medit.eclaire).toBe('medit');
    expect(voir(modele('monde', 'azov', 'mer', 'mer d’Azov'))).toMatchObject({ region: 'mer:azov', anneau: false, eclaire: 'azov' });
    // L'Atlantique éclairé avec la mer des Sargasses, enclavée dans lui (zonesAllumees), comme sur la carte.
    const atlantique = voir(modele('monde', 'atlant', 'mer', 'océan Atlantique'));
    expect(atlantique).toMatchObject({ region: 'monde:0', monde: true, lieu: 0 });
    expect(atlantique.eclaire!.split(' ').sort()).toEqual(['atlant', 'sargasse']);
    expect(voir(modele('monde', 'pacif', 'mer', 'océan Pacifique'))).toMatchObject({ region: 'monde:150', monde: true, eclaire: 'pacif' });
    // Une commune : l'île entière, la commune éclairée parmi les autres.
    const sp = voir(modele('reunion', '97416', 'commune', 'Saint-Pierre'));
    expect(sp).toMatchObject({ region: 'ile', monde: false, anneau: false, eclaire: '97416' });
    expect(sp.lieu).toBeGreaterThan(50);
    expect(sp.fond).toBeGreaterThan(sp.lieu);
  });

  it('l’anneau : centré sur le point du lieu, dans la boîte, d’un rayon de 7,5 % de sa largeur', () => {
    const r = repos();
    const v = feuilleSeule();
    v.f.montrer(composer('VAT'), { avant: false, focus: true });
    r.vider(1000);
    const [x, y, w, h] = v.svg()!.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
    const a = v.svg()!.querySelector('.situation-anneau')!;
    const [cx, cy, rr] = ['cx', 'cy', 'r'].map((k) => Number(a.getAttribute(k))) as [number, number, number];
    expect(cx).toBeGreaterThan(x);
    expect(cx).toBeLessThan(x + w);
    expect(cy).toBeGreaterThan(y);
    expect(cy).toBeLessThan(y + h);
    expect(rr).toBeCloseTo(0.075 * w, 0);
    expect(w / h).toBeCloseTo(1.5, 2);
  });

  it('les données pas encore là (l’île, la couche des mers) : la place reste vide, un nouvel essai plus tard ; rien de gardé à moitié', async () => {
    vi.useFakeTimers();
    try {
      const r = repos();
      let ile: typeof ILE | null = null;
      let mers: ReturnType<NonNullable<SourceSituation['mers']>> = null;
      const v = feuilleSeule({ monde: () => MONDE, ile: () => ile, mers: () => mers });
      v.f.montrer(modele('reunion', '97416', 'commune', 'Saint-Pierre'), { avant: false, focus: true });
      r.vider();
      expect(v.place().dataset.etat).toBe('attente');
      ile = ILE;
      vi.advanceTimersByTime(500);
      r.vider();
      expect(v.place().dataset.etat).toBe('prete');
      // Une mer dont la couche n'est pas lue : de même.
      v.f.montrer(modele('monde', 'noire', 'mer', 'mer Noire'), { avant: true, focus: true });
      r.vider();
      expect(v.place().dataset.etat).toBe('attente');
      mers = { mers: MERS.mers, zones: MERS.zones };
      vi.advanceTimersByTime(500);
      r.vider();
      expect(v.place().dataset.region).toBe('mer:noire');
    } finally {
      vi.useRealTimers();
    }
  });

  it('branchée par la vue : la tête de toute fiche ouverte a sa place, pour le lieu de la fiche', async () => {
    const v = await ouvrirSur('JPN');
    const p = v.el('#fiche-lieu .fiche-tete .fiche-situation')!;
    expect(p.dataset.lieu).toBe('JPN');
    expect(p.getAttribute('aria-hidden')).toBe('true');
  });
});
