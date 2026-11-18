// Les mers à l'accueil (étude J2, § 2.3 et § 6.4 ; D45 a, D47 a ; lot 3b,
// partie A) : toucher l'eau du monde donne le nom de la mer, par la couche
// légère seule (mers-leger.topo.json, mers.json, mers.fr.json, jamais
// mers.topo.json pour le nom), lue au premier toucher en mer seulement : rien
// au premier affichage, rien pour un toucher sur un pays ; la couche fine sert
// si elle est déjà lue. La mer touchée s'allume en bleu comme un pays (choix
// de l'utilisateur du 14/11/2026) : la couche fine posée à ce premier
// toucher, aucune teinte. Avec « Mers » dans la carte de la mémoire : la couche posée, ses
// zones teintées, et le carré « Jamais vu » de la légende couleur d'eau
// (partie B), sans les pastilles des micro-États (choix de l'utilisateur du
// 12/11), rendues sous un autre sujet et en partant. Une mer choisie dans la
// recherche : cadrée, allumée. La fiche d'une mer (#34, lot F4) : ses fichiers
// (fiches-mers.json, fiches-mers.fr.json) lus avec la couche légère, au premier
// toucher en mer, jamais pour un pays ; la barre « océan Atlantique · 2,75
// millions de km² » ; la fiche : sorte, mère et océan touchables, superficie,
// profondeur, riverains (ces trois-là tus jusqu'à leur relecture).
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depotMemoire } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import { acceptesDe } from '../src/map/acceptes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { contient, versEcran } from '../src/map/geo';
import { assemblerMers, chargerMers, oublierMers, type CoucheMers } from '../src/map/mers';
import { calculerPastilles } from '../src/map/pastilles';
import { pick, type ContexteCarte } from '../src/map/pick';
import { cadre, placer, projectionDe, transfoDe, type VueGlobe } from '../src/map/vue';
import { carteMemoire, CLE_SUJET_MEMOIRE, type CarteMemoire } from '../src/vues/carte-memoire';
import type { ContexteVue } from '../src/vues/commun';
import { chargerFichesMers, lireFichesMonde, oublierFichesMers, type FichierMonde, type FichierMondeLangue } from '../src/fiches/donnees';
import { LIGNES_RELUES, type LigneRelue } from '../src/fiches/relues';
import { vueExplorer, type OptionsFiche } from '../src/vues/explorer';
import { textes } from '../src/vues/textes';
import { El, installerDom } from './dom-factice';

const lireJson = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const monde: DonneesCarte = assembler(lireJson('monde.topo.json') as Topology<never>, lireJson('pays.json'), lireJson('contestees.json'), lireJson('noms.fr.json'));
const fine: CoucheMers = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
const C = cadre(384, 723);
/** Le nom de la zone de la couche fine qui contient ll. */
const merEn = (ll: [number, number]) => fine.noms[fine.mers.find((e) => contient(e.forme, e.pays.bbox, ll))!.pays.id]!;

/** Les fichiers lus (sans le dossier). */
const lus: string[] = [];

function monter(memoire?: CarteMemoire, fiche?: Partial<OptionsFiche>) {
  const donnees: DonneesCarte = { ...monde, mers: [] };
  /** La vue de la carte : le monde au zoom 4 sur les Caraïbes (déplacée par voir()). */
  let v: VueGlobe = placer(C, [-60, 20], 192, 361, 4, true);
  /** Les pastilles cachées (cacherPastilles), comme la vraie carte : ni dans pick ni dans noter. */
  let sansPastilles = false;
  const contexte = (): ContexteCarte => {
    const proj = projectionDe(v.r, C);
    const pastilles = sansPastilles ? [] : calculerPastilles(donnees.entites, proj, v.k);
    return { proj, t: transfoDe(v, C), entites: donnees.entites, pastilles, acceptes: acceptesDe(donnees), mers: donnees.mers };
  };
  const marques: string[] = [];
  const teintes: (ReadonlyMap<string, number> | null)[] = [];
  const carte = {
    hote: new El('div'),
    contexte,
    contexteFinal: contexte,
    pick: (x: number, y: number) => pick(contexte(), x, y),
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    anneauEn: (p: [number, number], c: string) => void marques.push(`anneauEn ${p.join(',')}:${c}`),
    montrer: vi.fn(),
    teinter: (t: ReadonlyMap<string, number> | null) => void teintes.push(t),
    prendreMers: vi.fn((c: CoucheMers) => void (donnees.mers = c.mers)),
    cacherPastilles: vi.fn((oui: boolean) => void (sansPastilles = oui)),
  };
  const zone = new El('main');
  const t = { nom: 'monde', carte, donnees, jouables: [], credit: null };
  const ctx = {
    carte,
    donnees,
    zone,
    terrains: { monde: t, montrer() {}, deja: () => null },
    mesures: { toucher: (_ev: unknown, _x: number, _y: number, f: () => void) => f() },
  } as unknown as ContexteVue;
  const options: OptionsFiche | undefined = fiche
    ? {
        fiches: () => Promise.reject(new Error('fiches du monde : pas dans ce test')),
        capitales: () => Promise.reject(new Error('capitales : pas dans ce test')),
        drapeaux: () => Promise.reject(new Error('drapeaux : pas dans ce test')),
        module: () => import('../src/vues/fiche'),
        fichesMers: () => chargerFichesMers(async (c) => (lus.push(c.replace('/geo/', '')), JSON.parse(readFileSync(`public${c}`, 'utf8')))),
        ...fiche,
      }
    : undefined;
  const vue = vueExplorer(ctx, { ...(memoire ? { memoire } : {}), ...(options ? { fiche: options } : {}) });
  /** Touche le point [lon, lat], la carte centrée dessus au zoom k. */
  const toucher = (ll: [number, number], k = 8) => {
    v = placer(C, ll, 192, 361, k, true);
    const c = contexte();
    const b = c.proj(ll) as [number, number];
    const [x, y] = versEcran(c.t, b[0], b[1]);
    vue.toucher?.(x, y, {} as PointerEvent);
  };
  /**
   * Touche la mer Ionienne à 3,6 px au sud-est du disque de Malte, la carte
   * centrée sur Malte au zoom 1 : dans la cible de sa pastille, sur aucun tracé.
   */
  const presDeMalte = (): [number, number] => {
    const malte = donnees.entites.find((e) => e.pays.id === 'MLT')!.pays.point;
    v = placer(C, malte, 192, 361, 1, true);
    const c = contexte();
    const b = c.proj(malte) as [number, number];
    const [x, y] = versEcran(c.t, b[0], b[1]);
    return [x + 3, y + 2];
  };
  const toucherPresDeMalte = () => vue.toucher?.(...presDeMalte(), {} as PointerEvent);
  const nom = () => zone.querySelector('#barre-carte .barre-nom')!.textContent;
  const detail = () => zone.querySelector('#barre-carte .barre-detail')!.textContent;
  // La ligne de la mémoire, à part dans la barre depuis la fiche d'un lieu (#34, § 4.1).
  const ligneMemoire = () => zone.querySelector('#barre-carte .barre-memoire')!.textContent;
  const el = (sel: string) => zone.querySelector(sel);
  const fiche_ = {
    faits: () => el('#barre-carte .barre-faits')!.textContent,
    chevron: () => !el('#barre-carte .barre-chevron')!.hidden,
    ouverte: () => !!el('#fiche-lieu') && !el('#fiche-lieu')!.hidden,
    titre: () => el('#fiche-titre')?.textContent ?? null,
    statut: () => el('#fiche-lieu .fiche-statut')?.textContent ?? null,
    lignes: () => (el('#fiche-lieu')?.querySelectorAll('.fiche-fait') ?? []).map((f) => `${f.querySelector('dt')!.textContent} · ${f.querySelector('dd')!.textContent}`),
    voisins: () => (el('#fiche-lieu .fiche-voisins')?.querySelectorAll('.fiche-voisin') ?? []).map((b) => b.textContent),
    titreVoisins: () => el('#fiche-voisins-titre')?.textContent ?? null,
    lien: (id: string) => el(`#fiche-lieu .fiche-liens [data-id="${id}"]`),
    sources: () => el('#fiche-lieu .fiche-sources')?.textContent ?? null,
    wikipedia: () => el('#fiche-lieu .fiche-wikipedia')?.getAttribute('href') ?? null,
    bouton: () => el('#barre-fiche')!,
  };
  return { vue, carte, donnees, marques, teintes, toucher, presDeMalte, toucherPresDeMalte, nom, detail, ligneMemoire, zone, pastilles: () => !sansPastilles, fiche: fiche_ };
}

const CARAIBES: [number, number] = [-78, 14];
const FRANCE: [number, number] = [2.5, 46.5];
const PACIFIQUE: [number, number] = [-130, -40];
const MEDITERRANEE: [number, number] = [20, 34];

beforeEach(() => {
  installerDom();
  lus.length = 0;
  oublierFichesMers();
  oublierMers(async (f) => (lus.push(f), readFileSync(`public/geo/${f}`, 'utf8')));
});
afterEach(() => {
  oublierMers();
  vi.unstubAllGlobals();
});

describe('accueil : le nom de la mer touchée (D45 a)', () => {
  it('rien de mers* au premier affichage ; un toucher sur un pays : son nom, rien de marin chargé', async () => {
    const a = monter();
    a.vue.activer();
    expect(a.nom()).toBe(textes.carte.touche);
    a.toucher(FRANCE);
    expect(a.nom()).toBe('France');
    await new Promise((r) => setTimeout(r, 10));
    expect(lus).toEqual([]);
    expect(a.carte.prendreMers).not.toHaveBeenCalled();
  });

  it('l’eau touchée : « Mer », puis son nom, puis la mer allumée en bleu (la couche fine posée une fois) ; aucune teinte', async () => {
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    expect(a.nom()).toBe(textes.carte.mer);
    await vi.waitFor(() => expect(a.nom()).toBe('mer des Caraïbes'));
    await vi.waitFor(() => expect(a.marques).toEqual(['caraibes:choisi']));
    expect(a.carte.prendreMers).toHaveBeenCalledTimes(1);
    expect([...lus].sort()).toEqual(['mers-leger.topo.json', 'mers.fr.json', 'mers.json', 'mers.topo.json']);
    expect(a.teintes.every((t) => t === null)).toBe(true);
    // Le suivant, tout de suite, allumé, sans rien relire ni reposer ; un pays touché éteint la mer.
    a.toucher(PACIFIQUE, 1);
    expect(a.nom()).toBe(merEn(PACIFIQUE));
    expect(a.marques).toHaveLength(1);
    expect(a.marques[0]).toMatch(/:choisi$/);
    a.toucher(MEDITERRANEE);
    expect(a.nom()).toBe('mer Méditerranée');
    expect(a.marques).toEqual(['medit:choisi']);
    a.toucher(FRANCE);
    expect(a.nom()).toBe('France');
    expect(a.marques).toEqual(['FRA:choisi']);
    expect(lus).toHaveLength(4);
    expect(a.carte.prendreMers).toHaveBeenCalledTimes(1);
  });


  it('la couche fine déjà lue (une partie de mers) : elle sert, sans rien lire de plus', async () => {
    await chargerMers();
    lus.length = 0;
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    expect(a.nom()).toBe('mer des Caraïbes');
    expect(lus).toEqual([]);
  });

  it('un autre toucher (un pays) avant l’arrivée des couches : le pays reste affiché, la mer ne s’allume pas par-dessus', async () => {
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    a.toucher(FRANCE);
    await vi.waitFor(() => expect(a.carte.prendreMers).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(lus).toHaveLength(4);
    expect(a.nom()).toBe('France');
    expect(a.marques).toEqual(['FRA:choisi']);
  });

  it('hors ligne : « Mer » reste, sans erreur ; le toucher suivant réessaie', async () => {
    oublierMers(async (f) => {
      lus.push(f);
      throw new TypeError('hors ligne');
    });
    const a = monter();
    a.vue.activer();
    a.toucher(CARAIBES);
    await new Promise((r) => setTimeout(r, 10));
    expect(a.nom()).toBe(textes.carte.mer);
    oublierMers(async (f) => (lus.push(f), readFileSync(`public/geo/${f}`, 'utf8')));
    a.toucher(CARAIBES);
    await vi.waitFor(() => expect(a.nom()).toBe('mer des Caraïbes'));
  });
});

describe('accueil : l’avis du démarrage (une partie du quiz laissée en cours a compté)', () => {
  it('donné avant l’arrivée sur l’accueil : sous « Touche un pays » à l’activation, une fois ; le premier toucher le remplace', () => {
    const a = monter();
    a.vue.avis('La partie du quiz laissée en cours (Moyen) a compté : 1/20 · 5 %.');
    a.vue.activer();
    expect(a.nom()).toBe(textes.carte.touche);
    expect(a.detail()).toBe('La partie du quiz laissée en cours (Moyen) a compté : 1/20 · 5 %.');
    a.toucher(FRANCE);
    expect(a.nom()).toBe('France');
    expect(a.detail()).not.toContain('quiz');
    a.vue.desactiver();
    a.vue.activer();
    expect(a.detail()).toBe('');
  });

  it('donné sur l’accueil déjà affiché : tout de suite', () => {
    const a = monter();
    a.vue.activer();
    a.vue.avis('avis');
    expect(a.detail()).toBe('avis');
  });
});

describe('accueil : la mémoire des mers (D47 a) et une mer choisie dans la recherche', () => {
  /** La carte de la mémoire, sujet « Mers » choisi. */
  const memoireMers = (): CarteMemoire => ({
    sujets: () => ['pays', 'capitales', 'drapeaux', 'mers'],
    sujet: () => 'mers',
    choisir: () => undefined,
    teintes: () => new Map([['medit', 2]]),
    maitrises: () => '0/50 maîtrisées',
    detail: (_t, id) => (id === 'medit' ? 'Vu 1 fois · revient demain' : null),
    details: (_t, id) => (id === 'medit' ? ['Vu 1 fois · revient demain'] : null),
    actif: () => true,
  });

  it('« Mers » : la couche fine posée sur la carte, ses zones teintées (les pays neutres) ; une mer touchée allumée, avec sa mémoire', async () => {
    const a = monter(memoireMers());
    a.vue.activer();
    await vi.waitFor(() => expect(a.carte.prendreMers).toHaveBeenCalledTimes(1));
    expect(lus).toContain('mers.topo.json');
    const derniere = a.teintes.at(-1)!;
    expect([...derniere.keys()]).toEqual(['medit']);
    a.toucher(MEDITERRANEE);
    expect(a.nom()).toBe('mer Méditerranée');
    expect(a.ligneMemoire()).toBe('Vu 1 fois · revient demain');
    expect(a.marques).toEqual(['medit:choisi']);
  });

  it('la légende dit ce que montre la carte : sous « Mers », le carré « Jamais vu » a la couleur de l’eau (une mer jamais vue garde le fond), sous un autre sujet celle de la terre neutre ; la carte ne change pas de teintes', async () => {
    let sujet: 'pays' | 'mers' = 'mers';
    const a = monter({ ...memoireMers(), sujet: () => sujet, choisir: (_t, d) => void (sujet = d as typeof sujet) });
    a.vue.activer();
    await vi.waitFor(() => expect(a.carte.prendreMers).toHaveBeenCalledTimes(1));
    const jamais = () => a.zone.querySelector('#legende-memoire .legende-jamais')!;
    expect(jamais().classList.contains('legende-jamais-mer')).toBe(true);
    expect(a.zone.querySelector('#legende-memoire')!.innerText).toContain(textes.memoire.jamais_vu);
    // Un autre sujet choisi : la case de la terre, comme avant.
    const choix = a.zone.querySelector('#legende-sujet')!;
    choix.value = 'pays';
    choix.emettre('change');
    expect(jamais().classList.contains('legende-jamais-mer')).toBe(false);
    choix.value = 'mers';
    choix.emettre('change');
    expect(jamais().classList.contains('legende-jamais-mer')).toBe(true);
    // carte.css : la case de l'eau prend --mer, le fond où une mer jamais vue reste (.sphere) ; celle de la terre, --terre.
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toMatch(/\.legende-jamais \{ background: var\(--terre\);/);
    expect(css).toMatch(/\.legende-jamais\.legende-jamais-mer \{ background: var\(--mer\); filter: none;/);
    expect(css).toMatch(/\.sphere \{ fill: var\(--mer\); \}/);
  });

  it('« Mers » hors ligne : la légende dit l’échec à la place du compte (rien n’est teinté), sans lever', async () => {
    oublierMers(async (f) => {
      lus.push(f);
      throw new TypeError('hors ligne');
    });
    const a = monter(memoireMers());
    a.vue.activer();
    const legende = () => a.zone.querySelector('#legende-memoire .legende-compte')!.textContent;
    await vi.waitFor(() => expect(legende()).toBe(textes.toucher.echec_sujet));
    expect(a.carte.prendreMers).not.toHaveBeenCalled();
  });

  it('la recherche montre une mer : la couche fine posée, la zone allumée et cadrée, son nom', async () => {
    const a = monter();
    a.vue.activer();
    a.vue.montrerLieu('monde', 'manche');
    expect(a.detail()).toBe(textes.toucher.chargement_sujet);
    await vi.waitFor(() => expect(a.carte.montrer).toHaveBeenCalledTimes(1));
    expect(a.carte.prendreMers).toHaveBeenCalledTimes(1);
    expect(a.carte.montrer.mock.calls[0]![0]).toBe('manche');
    expect(a.marques).toContain('manche:choisi');
    expect(a.nom()).toBe('Manche');
    // La suivante : tout de suite (la couche est posée).
    a.vue.montrerLieu('monde', 'azov');
    expect(a.nom()).toBe("mer d'Azov");
    expect(a.marques).toContain('azov:choisi');
    // La mer d'Azov, minuscule : un anneau à son point.
    expect(a.marques.some((m) => m.startsWith('anneauEn '))).toBe(true);
  });
});

describe('accueil : la carte de la mémoire « Mers » sans pastilles (choix de l’utilisateur du 12/11, #27)', () => {
  /** Une mémoire vide, chargée : sous « Mers », aucune mer vue (les zones gardent le fond). */
  async function memoireVide() {
    const m = ouvrirMemoire({ depot: depotMemoire(), appareil: '00000000-0000-4000-8000-00000000a001', horloge: () => ({ ts: Date.UTC(2026, 10, 12), tz: 240 }), nouvelId: () => crypto.randomUUID() });
    await m.pret;
    return m;
  }
  /** Le stockage de l'appareil, le sujet « Mers » déjà choisi sur le monde (une visite d'avant). */
  const merGardee = () => {
    const cles = new Map([[`${CLE_SUJET_MEMOIRE}.monde`, 'mers']]);
    return { getItem: (k: string) => cles.get(k) ?? null, setItem: (k: string, x: string) => void cles.set(k, x) };
  };

  it('le choix « Mers » gardé : pastilles cachées dès l’affichage de l’accueil, un toucher près de Malte ne la rend pas ; Pays : rendues, Malte touchée par sa pastille ; « Mers » de nouveau : cachées', async () => {
    const s = merGardee();
    const a = monter(carteMemoire(await memoireVide(), () => true, { stockage: () => s }));
    a.vue.activer();
    // Tout de suite, sans attendre la couche marine.
    expect(a.carte.cacherPastilles).toHaveBeenCalledWith(true);
    expect(a.pastilles()).toBe(false);
    await vi.waitFor(() => expect(a.carte.prendreMers).toHaveBeenCalledTimes(1));
    a.toucherPresDeMalte();
    expect(a.nom()).not.toBe('Malte');
    const choix = a.zone.querySelector('#legende-sujet')!;
    choix.value = 'pays';
    choix.emettre('change');
    expect(a.pastilles()).toBe(true);
    a.toucherPresDeMalte();
    expect(a.nom()).toBe('Malte');
    expect(a.detail()).toContain(textes.carte.par_pastille);
    for (const sujet of ['capitales', 'drapeaux']) {
      choix.value = sujet;
      choix.emettre('change');
      expect(a.pastilles()).toBe(true);
    }
    choix.value = 'mers';
    choix.emettre('change');
    expect(a.pastilles()).toBe(false);
    // Un changement à la fois : un appel par bascule, aucun quand rien ne change (rafraichir).
    a.vue.rafraichir();
    expect(a.carte.cacherPastilles.mock.calls.map(([x]) => x)).toEqual([true, false, true]);
  });

  it('en partant de l’accueil sous « Mers » (une partie, une séance, Apprendre, une épreuve) : les pastilles rendues avant que la partie ne démarre ; au retour, cachées', async () => {
    const s = merGardee();
    const a = monter(carteMemoire(await memoireVide(), () => true, { stockage: () => s }));
    a.vue.activer();
    expect(a.pastilles()).toBe(false);
    // Le routeur désactive l'accueil avant d'activer la vue de la partie (navigation.ts), qui la lance ensuite.
    a.vue.desactiver();
    expect(a.pastilles()).toBe(true);
    expect(a.carte.pick(...a.presDeMalte())).toMatchObject({ id: 'MLT', via: 'pastille' });
    a.vue.activer();
    expect(a.pastilles()).toBe(false);
  });

  it('la carte de la mémoire coupée (⚙) ou pas encore lue, « Mers » choisi : les pastilles restent ; rallumée : cachées ; recoupée : rendues', async () => {
    const s = merGardee();
    let actif = false;
    const a = monter(carteMemoire(await memoireVide(), () => actif, { stockage: () => s }));
    a.vue.activer();
    expect(a.carte.cacherPastilles).not.toHaveBeenCalled();
    actif = true;
    a.vue.rafraichir();
    expect(a.pastilles()).toBe(false);
    actif = false;
    a.vue.rafraichir();
    expect(a.pastilles()).toBe(true);
  });

  it('sans carte de la mémoire (?mers=demo, ?teintes=demo ; ?mer= la garde) ou sous Pays : jamais cachées', async () => {
    const a = monter();
    a.vue.activer();
    a.toucherPresDeMalte();
    expect(a.nom()).toBe('Malte');
    a.vue.desactiver();
    expect(a.carte.cacherPastilles).not.toHaveBeenCalled();
    const b = monter(carteMemoire(await memoireVide(), () => true));
    b.vue.activer();
    b.toucherPresDeMalte();
    expect(b.nom()).toBe('Malte');
    b.vue.desactiver();
    expect(b.carte.cacherPastilles).not.toHaveBeenCalled();
  });
});

describe('accueil : la fiche d’une mer (#34, lot F4)', () => {
  const TOUTES = Object.fromEntries(Object.keys(LIGNES_RELUES).map((k) => [k, true])) as Record<LigneRelue, boolean>;
  const AUCUNE = Object.fromEntries(Object.keys(LIGNES_RELUES).map((k) => [k, false])) as Record<LigneRelue, boolean>;
  const F = textes.fiche;
  const simple = (x: string | null) => (x ?? '').replace(/[\u00a0\u202f]/g, ' ');

  it('les fiches des mers partent avec la couche légère, au premier toucher en mer ; jamais au premier affichage ni pour un pays', async () => {
    const a = monter(undefined, { relues: TOUTES });
    a.vue.activer();
    a.toucher(FRANCE);
    await new Promise((r) => setTimeout(r, 10));
    expect(lus).toEqual([]);
    a.toucher(CARAIBES);
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
    expect([...lus].sort()).toEqual(['fiches-mers.fr.json', 'fiches-mers.json', 'mers-leger.topo.json', 'mers.fr.json', 'mers.json', 'mers.topo.json']);
    // « océan Atlantique · 2,75 millions de km² » (§ 4.1) : l'océan, puis la superficie à trois chiffres.
    expect(simple(a.fiche.faits())).toBe('océan Atlantique · 2,75 millions de km²');
    expect(a.fiche.bouton().getAttribute('aria-expanded')).toBe('false');
    // Un océan : sa superficie seule ; la mer suivante, tout de suite, sans rien relire.
    a.toucher(PACIFIQUE, 1);
    expect(merEn(PACIFIQUE)).toBe('océan Pacifique');
    expect(simple(a.fiche.faits())).toBe('169 millions de km²');
    a.toucher(MEDITERRANEE);
    expect(simple(a.fiche.faits())).toBe('océan Atlantique · 2,5 millions de km²');
    expect(lus.filter((f) => f.startsWith('fiches-mers'))).toHaveLength(2);
    // Un pays après une mer : ni faits de mer, ni chevron (les fiches du monde manquent ici).
    a.toucher(FRANCE);
    expect(a.fiche.faits()).toBe('');
  });

  it('avant la relecture (LIGNES_RELUES) : la barre ne dit que l’océan ; un océan, rien ; le chevron reste', async () => {
    const a = monter(undefined, { relues: AUCUNE });
    a.vue.activer();
    a.toucher(MEDITERRANEE);
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
    expect(a.fiche.faits()).toBe('océan Atlantique');
    a.toucher(PACIFIQUE, 1);
    expect(a.nom()).toBe('océan Pacifique');
    expect(a.fiche.faits()).toBe('');
    expect(a.fiche.chevron()).toBe(true);
  });

  it('hors ligne : la barre de la mer reste sans chevron ; le toucher suivant réessaie', async () => {
    let echec = true;
    const a = monter(undefined, {
      relues: TOUTES,
      fichesMers: () => (echec ? Promise.reject(new TypeError('hors ligne')) : chargerFichesMers(async (c) => JSON.parse(readFileSync(`public${c}`, 'utf8')))),
    });
    a.vue.activer();
    a.toucher(MEDITERRANEE);
    await vi.waitFor(() => expect(a.nom()).toBe('mer Méditerranée'));
    await new Promise((r) => setTimeout(r, 10));
    expect(a.fiche.chevron()).toBe(false);
    a.fiche.bouton().click();
    await new Promise((r) => setTimeout(r, 10));
    expect(a.fiche.ouverte()).toBe(false);
    echec = false;
    a.toucher(MEDITERRANEE);
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
  });

  it('critère de fin (§ 8) : la Méditerranée (sorte, océan, superficie, profondeur, 26 riverains), l’Adriatique (sa mère), l’Atlantique (sans riverains), la mer des Sargasses', async () => {
    const a = monter(undefined, { relues: TOUTES });
    a.vue.activer();
    a.toucher(MEDITERRANEE);
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
    a.fiche.bouton().click();
    await vi.waitFor(() => expect(a.fiche.ouverte()).toBe(true));
    expect(a.fiche.titre()).toBe('mer Méditerranée');
    expect(a.fiche.statut()).toBe('mer intérieure');
    expect(a.fiche.lignes().map(simple)).toEqual([`${F.ocean} · océan Atlantique`, `${F.superficie} · environ 2,5 millions de km²`, `${F.profondeur} · 5 267 m`]);
    expect(a.fiche.titreVoisins()).toBe(F.riverains);
    const riv = a.fiche.voisins();
    expect(riv).toHaveLength(26);
    // Les pays d'abord, par nom ; puis les autres entités avec leur statut (Gibraltar, Akrotiri, Dhekelia, Chypre du Nord).
    expect(riv.slice(0, 3)).toEqual(['Albanie', 'Algérie', 'Bosnie-Herzégovine']);
    expect(riv.slice(-4).every((x) => /\(/.test(x!))).toBe(true);
    expect(riv).not.toContain('Royaume-Uni');
    expect(riv).toContain('Malte');
    expect(a.fiche.sources()).toContain('Natural Earth');
    expect(a.fiche.sources()).toContain(F.noms_sources.superficie);
    expect(a.fiche.wikipedia()).toBe(`${F.wikipedia_base}Mer_M%C3%A9diterran%C3%A9e`);
    // L'océan se touche comme un voisin : la fiche de l'Atlantique, sans riverains, sa superficie d'après la NOAA.
    (a.fiche.lien('atlant') as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.fiche.titre()).toBe('océan Atlantique'));
    expect(a.fiche.statut()).toBe('océan');
    expect(a.fiche.lignes().map(simple)).toEqual([`${F.superficie} · environ 85,1 millions de km²`, `${F.profondeur} · 8 605 m`]);
    expect(a.fiche.voisins()).toEqual([]);
    expect(a.fiche.sources()).toContain(F.noms_sources.noaa);
    // La carte vole sous la fiche jusqu'à l'océan (deux images plus tard).
    await vi.waitFor(() => expect(a.carte.montrer.mock.calls.some((c) => c[0] === 'atlant')).toBe(true));
  });

  it('l’Adriatique : sa mère se touche ; la mer des Sargasses, « mer sans côte », sans riverains', async () => {
    const a = monter(undefined, { relues: TOUTES });
    a.vue.activer();
    a.vue.montrerLieu('monde', 'adriat');
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
    a.fiche.bouton().click();
    await vi.waitFor(() => expect(a.fiche.titre()).toBe('mer Adriatique'));
    expect(a.fiche.statut()).toBe('mer');
    expect(a.fiche.lignes().map(simple)).toEqual([`${F.mere} · mer Méditerranée`, `${F.ocean} · océan Atlantique`, `${F.superficie} · environ 139 000 km²`, `${F.profondeur} · 1 233 m`]);
    expect(a.fiche.voisins()).toEqual(['Albanie', 'Bosnie-Herzégovine', 'Croatie', 'Grèce', 'Italie', 'Monténégro', 'Slovénie']);
    (a.fiche.lien('medit') as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.fiche.titre()).toBe('mer Méditerranée'));
    a.vue.montrerLieu('monde', 'sargasse');
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
    a.fiche.bouton().click();
    await vi.waitFor(() => expect(a.fiche.titre()).toBe('mer des Sargasses'));
    expect(a.fiche.statut()).toBe(F.mer_sans_cote);
    expect(a.fiche.lignes().map(simple)).toEqual([`${F.ocean} · océan Atlantique`, `${F.superficie} · environ 3 millions de km²`, `${F.profondeur} · 7 000 m`]);
    expect(a.fiche.voisins()).toEqual([]);
    expect(a.fiche.titreVoisins()).toBeNull();
  });

  it('un riverain se touche : la fiche du pays (le terrain reste le monde) ; « ‹ » rend la mer', async () => {
    const monde_ = lireFichesMonde(lireJson('fiches-monde.json') as FichierMonde, lireJson('fiches-monde.fr.json') as FichierMondeLangue);
    const a = monter(undefined, { relues: TOUTES, fiches: () => Promise.resolve(monde_) });
    a.vue.activer();
    a.toucher(MEDITERRANEE);
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
    a.fiche.bouton().click();
    await vi.waitFor(() => expect(a.fiche.titre()).toBe('mer Méditerranée'));
    const italie = a.zone.querySelectorAll('#fiche-lieu .fiche-voisins .fiche-voisin').find((b) => b.textContent === 'Italie')!;
    (italie as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.fiche.titre()).toBe('Italie'));
    expect(a.fiche.titreVoisins()).toBe(F.voisins);
    (a.zone.querySelector('#fiche-lieu .fiche-avant') as unknown as { click(): void }).click();
    await vi.waitFor(() => expect(a.fiche.titre()).toBe('mer Méditerranée'));
  });

  it('avant la relecture : ni superficie, ni profondeur, ni riverains ; la sorte, la mère et l’océan restent ; les sources ne citent que ce qui est montré', async () => {
    const a = monter(undefined, { relues: AUCUNE });
    a.vue.activer();
    a.vue.montrerLieu('monde', 'adriat');
    await vi.waitFor(() => expect(a.fiche.chevron()).toBe(true));
    a.fiche.bouton().click();
    await vi.waitFor(() => expect(a.fiche.ouverte()).toBe(true));
    expect(a.fiche.lignes().map(simple)).toEqual([`${F.mere} · mer Méditerranée`, `${F.ocean} · océan Atlantique`]);
    expect(a.fiche.voisins()).toEqual([]);
    expect(a.fiche.sources()).toBe(`${remplirSources('Natural Earth · Wikidata')} · ${F.credits}`);
  });
});

/** Le pied « Sources : … » (textes.fiche.sources). */
const remplirSources = (x: string) => textes.fiche.sources.replace('{sources}', x);
