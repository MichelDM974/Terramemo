// Reconnaître (src/vues/nommer.ts) sur le DOM factice : premier test de la
// vue (décision « Nommer ») et de ses crochets du J1a (journal, mode piloté
// d'une séance, « Je connais déjà »).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chargerCapitales } from '../src/map/capitales';
import { chargerDrapeaux, drapeauxCharges, oublierDrapeaux } from '../src/map/drapeaux';
import type { Pays } from '../src/map/types';
import type { ContexteVue } from '../src/vues/commun';
import { vueNommer, ZONE_MONTREE, type ReponseNommer } from '../src/vues/nommer';
import { ditsPar, El, installerDom } from './dom-factice';
import { code, FACTICE, sansBrut } from './sujet-factice';

vi.mock('../src/vues/sujets', async (orig) => (await import('./sujet-factice')).avecFactice(await orig()));

const IDS = ['FRA', 'ESP', 'ITA', 'DEU', 'BEL'];
const pays = (id: string, i: number): Pays =>
  ({ id, statut: 'jouable', superficie_km2: 5e5, partie_max_km2: 5e5, point: [i * 5, 45], bbox: [0, 40, 1, 50], micro: false, voisins: IDS.filter((x) => x !== id), continent: 'Europe', sous_region: 'Western Europe' }) as Pays;

const NOMS: Record<string, string> = { FRA: 'France', ESP: 'Espagne', ITA: 'Italie', DEU: 'Allemagne', BEL: 'Belgique' };

function monter(o: { ids?: readonly string[]; noms?: Record<string, string> } = {}) {
  const ids = o.ids ?? IDS;
  const zone = new El('main');
  const marques: string[] = [];
  const carte = {
    hote: new El('div'),
    transfo: { k: 3 },
    effacerMarques: () => void (marques.length = 0),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    anneauEn: (p: [number, number], c: string) => void marques.push(`anneauEn ${p.join(',')}:${c}`),
    montrer: vi.fn(),
    montrerZone: vi.fn(),
    zoomer: vi.fn(),
    cadrer: vi.fn(),
    // Tout est à l'écran, grand : pas de vol.
    contexteFinal: () => ({ proj: Object.assign(() => [100, 100], { scale: () => 1e4 }), t: { k: 1, x: 0, y: 0 } }),
  };
  const donnees = { entites: ids.map((id, i) => ({ pays: { ...pays(id, i), voisins: ids.filter((x) => x !== id) }, forme: undefined })), noms: o.noms ?? NOMS };
  const terrain = { nom: 'monde', carte, donnees, jouables: ids };
  const ctx = { zone, terrains: { montrer() {} } } as unknown as ContexteVue;
  const bilan = new El('div');
  const actions = () => new El('div');
  const croix = () => Object.assign(new El('button'), { className: 'croix' });
  const n = vueNommer(ctx, { bilan: bilan as never, actions: actions as never, croix: croix as never });
  const barre = zone.querySelector('#barre-nommer')!;
  const choix = () => barre.querySelectorAll('.nommer-choix');
  const cible = () => barre.querySelector('.essai-consigne')!.dataset.cible!;
  const repondre = (bon: boolean) => choix().find((b) => (b.dataset.id === cible()) === bon)!.click();
  return { n, zone, barre, bilan, terrain: terrain as never, marques, choix, cible, repondre, carte };
}

describe('Reconnaître : la vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('quatre noms dont la cible, la zone allumée ; juste en vert, faux en rouge avec la bonne ; puis la suivante ; le bilan', () => {
    const v = monter();
    v.n.demarrer(v.terrain, 'pays', 'Europe', ['FRA', 'ESP']);
    expect(v.barre.hidden).toBe(false);
    expect(v.choix().length).toBe(4);
    expect(v.choix().map((b) => b.dataset.id)).toContain('FRA');
    expect(v.marques).toContain('FRA:choisi');
    expect(v.barre.querySelector('.essai-compte')?.textContent).toBe('1 / 2');
    expect(v.barre.querySelector('#nommer-connu')?.hidden).toBe(true);
    v.repondre(true);
    expect(v.choix().find((b) => b.dataset.id === 'FRA')?.className).toContain('juste');
    expect(v.barre.querySelector('.essai-retro')?.textContent).toContain('Juste');
    vi.advanceTimersByTime(900);
    expect(v.cible()).toBe('ESP');
    v.repondre(false);
    expect(v.barre.querySelector('.essai-retro')?.textContent).toContain('bonne réponse : Espagne');
    expect(v.marques.some((m) => m.endsWith(':faux'))).toBe(true);
    vi.advanceTimersByTime(1800);
    expect(v.barre.hidden).toBe(true);
    expect(v.bilan.hidden).toBe(false);
    expect(v.bilan.innerText).toContain('1 / 2 justes du premier coup');
    // La « × » du bilan (#18), en tête, au-dessus du titre.
    expect(v.bilan.querySelector('.croix')).not.toBeNull();
    expect(v.n.enCours).toBe(false);
  });

  it('textes par sujet : la consigne des pays, celle des communes ; les boutons portent les noms', () => {
    const v = monter();
    v.n.demarrer(v.terrain, 'pays', 'Europe', ['FRA']);
    expect(v.barre.querySelector('.essai-consigne')?.textContent).toBe('Quel est ce pays ?');
    expect(v.choix().map((b) => b.textContent).sort()).toEqual(v.choix().map((b) => NOMS[b.dataset.id!]).sort());
    v.n.demarrer(v.terrain, 'communes', 'La Réunion', ['FRA']);
    expect(v.barre.querySelector('.essai-consigne')?.textContent).toBe('Quelle est cette commune ?');
    expect(v.choix().every((b) => b.textContent === NOMS[b.dataset.id!])).toBe(true);
  });

  it('un sujet factice : consigne, boutons, rétroaction et bilan par son rendu, aucun id ni nom de pays affiché', () => {
    const v = monter();
    const vus: string[] = [];
    const voir = () => vus.push(v.barre.innerText);
    v.n.demarrer(v.terrain, FACTICE, 'Europe', ['FRA', 'ESP']);
    expect(v.barre.querySelector('.essai-consigne')?.textContent).toBe('Quelle est cette énigme ?');
    expect(v.choix().map((b) => b.textContent).sort()).toEqual(v.choix().map((b) => `bouton ${code(b.dataset.id!)}`).sort());
    voir();
    v.repondre(true);
    voir();
    vi.advanceTimersByTime(900);
    voir();
    const choisi = v.choix().find((b) => b.dataset.id !== 'ESP')!.dataset.id!;
    v.repondre(false);
    expect(v.barre.querySelector('.essai-retro')?.textContent).toContain(`bonne réponse : choix ${code('ESP')}`);
    voir();
    vi.advanceTimersByTime(1800);
    expect(v.bilan.innerText).toContain(`bilan-localiser ${code('ESP')} · tu avais choisi : choix ${code(choisi)}`);
    vus.push(v.bilan.innerText);
    for (const t of vus) sansBrut(t, [...IDS, ...Object.values(NOMS)]);
  });

  it('crochet cadrer (QCM d’une grappe) : sur l’île, la carte cadrée sur la région avant la zone, une seule fois, pas au retour dans la vue', () => {
    const v = monter();
    const ile = { ...(v.terrain as object), nom: 'reunion' } as never;
    v.n.demarrer(ile, 'pays', '', ['ITA'], { cadrer: [5, 40, 20, 50], surFin: () => {} });
    expect(v.carte.cadrer).toHaveBeenCalledTimes(1);
    expect(v.carte.cadrer.mock.calls[0]![0]).toEqual([5, 40, 20, 50]);
    expect(v.marques).toContain('ITA:choisi');
    expect(v.carte.montrerZone).not.toHaveBeenCalled();
    v.n.quitter();
    v.n.reprendre();
    expect(v.carte.cadrer).toHaveBeenCalledTimes(1);
    v.n.demarrer(ile, 'pays', '', ['ESP'], { surFin: () => {} });
    expect(v.carte.cadrer).toHaveBeenCalledTimes(1);
  });

  it('sur le monde (décision « Zone allumée montrée par un zoom lent ») : chaque question zoome lentement sur sa zone, la grappe n’est pas cadrée, la réponse ne relance rien', () => {
    const v = monter();
    v.n.demarrer(v.terrain, 'pays', '', ['ITA', 'ESP'], { cadrer: [5, 40, 20, 50] });
    expect(v.carte.cadrer).not.toHaveBeenCalled();
    expect(v.carte.montrer).not.toHaveBeenCalled();
    expect(v.carte.montrerZone).toHaveBeenCalledTimes(1);
    expect(v.carte.montrerZone.mock.calls[0]![0]).toBe('ITA');
    expect(v.carte.montrerZone.mock.calls[0]![2]).toBe(ZONE_MONTREE);
    v.repondre(true);
    expect(v.carte.montrerZone).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(900);
    expect(v.carte.montrerZone).toHaveBeenCalledTimes(2);
    expect(v.carte.montrerZone.mock.calls[1]![0]).toBe('ESP');
    // Au retour dans la vue, la question reposée : son zoom aussi.
    v.n.quitter();
    v.n.reprendre();
    expect(v.carte.montrerZone).toHaveBeenCalledTimes(3);
    expect(v.carte.zoomer).not.toHaveBeenCalled();
  });

  it('crochet surReponse : chaque réponse (choix, justesse, temps, échelle) ; sa ligne s’ajoute à la rétroaction', () => {
    const v = monter();
    const vues: ReponseNommer[] = [];
    v.n.demarrer(v.terrain, 'pays', 'Europe', ['ITA'], { surReponse: (r) => (vues.push(r), 'Revient dans 3 j') });
    v.repondre(false);
    expect(vues.length).toBe(1);
    expect(vues[0]).toMatchObject({ id: 'ITA', juste: false, zoom: 3 });
    expect(vues[0]!.choisi).not.toBe('ITA');
    expect(v.barre.querySelector('.essai-retro')?.textContent).toContain('Revient dans 3 j');
  });

  it('mode piloté : son compte, pas de bilan (surFin), « Je connais déjà » et « Terminer » rendus à la séance', () => {
    const v = monter();
    const surFin = vi.fn();
    const connu = vi.fn();
    const terminer = vi.fn();
    v.n.demarrer(v.terrain, 'pays', '', ['DEU'], { compte: () => '4 / 12', surFin, connu, terminer });
    expect(v.barre.querySelector('.essai-compte')?.textContent).toBe('4 / 12');
    const bouton = v.barre.querySelector('#nommer-connu')!;
    expect(bouton.hidden).toBe(false);
    v.repondre(true);
    expect(bouton.disabled).toBe(true); // après une réponse, plus de « Je connais déjà »
    vi.advanceTimersByTime(900);
    expect(surFin).toHaveBeenCalledTimes(1);
    expect(v.bilan.hidden).toBe(true);
    expect(v.n.enCours).toBe(false);
    // « Je connais déjà » : la question sautée sans réponse.
    const surReponse = vi.fn();
    v.n.demarrer(v.terrain, 'pays', '', ['BEL'], { surFin, connu, terminer, surReponse });
    v.barre.querySelector('#nommer-connu')!.click();
    expect(connu).toHaveBeenCalledTimes(1);
    expect(surReponse).not.toHaveBeenCalled();
    expect(v.n.enCours).toBe(false);
    v.n.demarrer(v.terrain, 'pays', '', ['BEL'], { surFin, connu, terminer });
    v.barre.querySelector('#nommer-terminer')!.click();
    expect(terminer).toHaveBeenCalledTimes(1);
    expect(v.bilan.hidden).toBe(true);
  });

  it('quittée pendant la rétroaction : la réponse compte, la reprise passe à la suite', () => {
    const v = monter();
    const surFin = vi.fn();
    const surReponse = vi.fn();
    v.n.demarrer(v.terrain, 'pays', '', ['FRA'], { surFin, surReponse });
    v.repondre(true);
    v.n.quitter();
    vi.advanceTimersByTime(5000);
    expect(surFin).not.toHaveBeenCalled();
    v.n.reprendre();
    expect(surFin).toHaveBeenCalledTimes(1);
    expect(surReponse).toHaveBeenCalledTimes(1);
  });
});

// Reconnaître sous Capitales (étude J2 § 5.2) : ses vraies données, son vrai rendu.
describe('Reconnaître : le sujet Capitales', () => {
  const NOMS_FR = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  const EUROPE = ['NLD', 'BEL', 'LUX', 'FRA', 'DEU', 'ESP', 'ITA', 'CHE'];
  beforeAll(async () => {
    await chargerCapitales(async (chemin) => JSON.parse(readFileSync(`public${chemin}`, 'utf8')));
  });
  beforeEach(() => {
    vi.useFakeTimers();
    installerDom();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('« Quelle est sa capitale ? », 4 capitales ; le Luxembourg (D37 c) jamais leurre ; le bouton juste fixé à la reprise ; rétroaction, anneau et bilan', () => {
    for (let k = 0; k < 12; k++) {
      const v = monter({ ids: EUROPE, noms: NOMS_FR });
      v.n.demarrer(v.terrain, 'capitales', 'Europe', ['NLD', 'BEL']);
      expect(v.barre.querySelector('.essai-consigne')?.textContent).toBe('Quelle est sa capitale ?');
      expect(v.choix().map((b) => b.dataset.id)).not.toContain('LUX');
      const juste = () => v.choix().find((b) => b.dataset.id === 'NLD')!.textContent;
      const montre = juste();
      expect(['Amsterdam', 'La Haye']).toContain(montre);
      // Les leurres : la principale de leur pays.
      for (const b of v.choix().filter((x) => x.dataset.id !== 'NLD')) expect(b.textContent).toBe({ BEL: 'Bruxelles', FRA: 'Paris', DEU: 'Berlin', ESP: 'Madrid', ITA: 'Rome', CHE: 'Berne' }[b.dataset.id!]);
      // D38 a : quitter puis reprendre la question garde la même capitale.
      v.n.quitter();
      v.n.reprendre();
      expect(juste()).toBe(montre);
      v.repondre(true);
      const retro = v.barre.querySelector('.essai-retro')!.textContent;
      expect(retro).toBe(montre === 'La Haye' ? `Juste : La Haye, siège du gouvernement (Pays-Bas) · ${retro.split(' · ').at(-1)}` : `Juste : Amsterdam (Pays-Bas) · ${retro.split(' · ').at(-1)}`);
      // L'anneau au point de la ville (D53 c).
      expect(v.marques).toContain(montre === 'La Haye' ? 'anneauEn 4.31,52.08:juste' : 'anneauEn 4.88,52.37:juste');
      vi.advanceTimersByTime(900);
      const choisi = v.choix().find((b) => b.dataset.id !== 'BEL')!;
      const choisiTexte = choisi.textContent;
      v.repondre(false);
      expect(v.barre.querySelector('.essai-retro')?.textContent).toBe('Faux · bonne réponse : Bruxelles (Belgique)');
      vi.advanceTimersByTime(1800);
      expect(v.bilan.innerText).toContain(`Bruxelles (Belgique) · tu avais choisi : ${choisiTexte}`);
      expect(`${v.barre.innerText}${v.bilan.innerText}`).not.toMatch(/\bQ\d+\b/);
    }
  });
});

// Reconnaître sous Drapeaux (étude J2 § 5.3) : son vrai manifeste, son vrai rendu.
// Rien ne nomme le pays avant la réponse : ni texte, ni alt, ni title, ni
// aria-label, ni adresse de fichier ; seul data-id (que la page lit, jamais
// dit ni montré) porte l'id, comme pour les autres sujets.
describe('Reconnaître : le sujet Drapeaux', () => {
  const NOMS_FR = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  const AFRIQUE = ['TCD', 'ROU', 'IDN', 'MCO', 'NER', 'CMR', 'NGA', 'CAF'];
  const lecteur = async (chemin: string) => JSON.parse(readFileSync(`public${chemin}`, 'utf8'));
  /** Les images préchargées (new Image()), dans l'ordre. */
  let precharges: string[] = [];
  beforeEach(async () => {
    vi.useFakeTimers();
    installerDom();
    // Une page neuve : rien encore préchargé.
    oublierDrapeaux();
    await chargerDrapeaux(lecteur);
    precharges = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(a: string) {
          precharges.push(a);
        }
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const montre = (id: string) => drapeauxCharges()!.parPays.get(id)!.montre;

  it('« Quel est son drapeau ? », 4 boutons-images nommés « Choix 1 » à « Choix 4 », sans title ni rien qui nomme un pays avant la réponse', () => {
    const v = monter({ ids: AFRIQUE, noms: NOMS_FR });
    v.n.demarrer(v.terrain, 'drapeaux', 'Afrique', ['TCD', 'NER']);
    expect(v.barre.querySelector('.essai-consigne')?.textContent).toBe('Quel est son drapeau ?');
    expect(v.barre.querySelector('.nommer-grille')!.classList.contains('nommer-grille-images')).toBe(true);
    const bs = v.choix();
    expect(bs).toHaveLength(4);
    bs.forEach((b, k) => {
      expect(b.classList.contains('nommer-choix-image')).toBe(true);
      expect(b.getAttribute('aria-label')).toBe(`Choix ${k + 1}`);
      expect(b.getAttribute('title')).toBeNull();
      expect(b.textContent).toBe('');
      const img = b.querySelector('img')!;
      // Un <img> (pas de SVG en ligne), qui ne se glisse pas, alt vide, l'adresse du drapeau montré de son pays.
      expect(img.getAttribute('src')).toBe(montre(b.dataset.id!));
      expect(img.getAttribute('src')).toMatch(/^\/geo\/drapeaux\/[0-9a-f]{8}\.svg$/);
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('draggable')).toBe('false');
      expect(img.getAttribute('title')).toBeNull();
      expect(img.classList.contains('drapeau')).toBe(true);
    });
    // Ni le nom, ni l'id d'aucun pays de la grille, nulle part dans la barre (data-* exceptés) ; ni la cible.
    const dits = ditsPar(v.barre).join(' | ');
    sansBrut(dits, [...AFRIQUE, ...AFRIQUE.map((id) => NOMS_FR[id]!), 'Tchad']);
    // La rétroaction, région aria-live, est vide avant la réponse.
    const retro = v.barre.querySelector('.essai-retro')!;
    expect(retro.getAttribute('aria-live')).toBe('polite');
    expect(retro.textContent).toBe('');
    // L'image arrivée : le fond blanc du drapeau à la place du gris d'attente.
    const img = bs[0]!.querySelector('img')!;
    expect(img.classList.contains('charge')).toBe(false);
    img.emettre('load');
    expect(img.classList.contains('charge')).toBe(true);
  });

  it('après la réponse : ✓ et contour vert au bon, ✗ et contour rouge au mauvais (classes, sans fond de couleur) ; la région aria-live dit les deux pays', () => {
    const v = monter({ ids: AFRIQUE, noms: NOMS_FR });
    v.n.demarrer(v.terrain, 'drapeaux', 'Afrique', ['NER', 'TCD']);
    v.repondre(true);
    const bon = v.choix().find((b) => b.dataset.id === 'NER')!;
    expect(bon.className).toBe('secondary nommer-choix nommer-choix-image juste');
    expect(v.barre.querySelector('.essai-retro')!.textContent).toMatch(/^Juste : Niger · /);
    vi.advanceTimersByTime(900);
    expect(v.cible()).toBe('TCD');
    const choisi = v.choix().find((b) => b.dataset.id !== 'TCD')!;
    const nom = NOMS_FR[choisi.dataset.id!]!;
    choisi.click();
    expect(choisi.className).toBe('secondary nommer-choix nommer-choix-image faux');
    expect(v.choix().find((b) => b.dataset.id === 'TCD')!.classList.contains('juste')).toBe(true);
    expect(v.barre.querySelector('.essai-retro')!.textContent).toBe(`Faux · bonne réponse : Tchad · tu avais choisi : ${nom}`);
    // Les autres : désactivés, ni vert ni rouge.
    for (const b of v.choix().filter((x) => x !== choisi && x.dataset.id !== 'TCD')) expect(b.className).toBe('secondary nommer-choix nommer-choix-image');
    vi.advanceTimersByTime(1800);
    expect(v.bilan.innerText).toContain(`Tchad · tu avais choisi : ${nom}`);
    // carte.css : contour et signe, jamais de fond vert ou rouge sur un bouton-image.
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toMatch(/\.nommer-choix-image\.juste, \.nommer-choix-image\.juste:disabled \{ box-shadow: inset 0 0 0 3px var\(--good\);/);
    expect(css).toMatch(/\.nommer-choix-image\.faux, \.nommer-choix-image\.faux:disabled \{ box-shadow: inset 0 0 0 3px var\(--danger\);/);
    expect(css).toMatch(/\.nommer-choix-image\.faux:disabled \{ background: transparent; \}/);
  });

  it('D41 d : jamais le jumeau de la cible ni deux jumeaux parmi les 4 (Indonésie et Monaco, Roumanie et Tchad)', () => {
    for (let k = 0; k < 30; k++) {
      const v = monter({ ids: AFRIQUE, noms: NOMS_FR });
      v.n.demarrer(v.terrain, 'drapeaux', 'Afrique', ['TCD', 'NER', 'IDN']);
      for (let q = 0; q < 3; q++) {
        const ids = v.choix().map((b) => b.dataset.id!);
        expect(ids).toContain(v.cible());
        expect(ids.includes('IDN') && ids.includes('MCO'), ids.join(',')).toBe(false);
        expect(ids.includes('ROU') && ids.includes('TCD'), ids.join(',')).toBe(false);
        // Un seul drapeau par pays : jamais deux images pareilles.
        expect(new Set(v.choix().map((b) => b.querySelector('img')!.getAttribute('src'))).size).toBe(4);
        v.repondre(true);
        vi.advanceTimersByTime(900);
      }
    }
  });

  it('touches 1 à 4 : le choix de ce rang ; ignorées une fois répondu, et sous un sujet aux choix en texte', () => {
    const v = monter({ ids: AFRIQUE, noms: NOMS_FR });
    const vues: ReponseNommer[] = [];
    v.n.demarrer(v.terrain, 'drapeaux', 'Afrique', ['TCD', 'NER', 'NGA', 'CMR', 'CAF'], { surReponse: (r) => void vues.push(r) });
    const troisieme = v.choix()[2]!.dataset.id!;
    (document as unknown as El).emettre('keydown', { key: '3' });
    expect(vues.map((r) => r.choisi)).toEqual([troisieme]);
    (document as unknown as El).emettre('keydown', { key: '1' });
    (document as unknown as El).emettre('keydown', { key: '5' });
    expect(vues).toHaveLength(1);
    vi.advanceTimersByTime(1800);
    // Ctrl+1 (un onglet du navigateur) : rien.
    (document as unknown as El).emettre('keydown', { key: '1', ctrlKey: true });
    expect(vues).toHaveLength(1);
    // Dans un champ de saisie (closest le trouve) : rien.
    (document as unknown as El).emettre('keydown', { key: '1', code: 'Digit1', target: new El('input') });
    expect(vues).toHaveLength(1);
    // Un clavier AZERTY : la rangée du haut sans Maj donne « é » pour la touche 2 ; c'est la touche physique (ev.code) qui compte.
    const deuxieme = v.choix()[1]!.dataset.id!;
    (document as unknown as El).emettre('keydown', { key: 'é', code: 'Digit2' });
    expect(vues.map((r) => r.choisi)).toEqual([troisieme, deuxieme]);
    vi.advanceTimersByTime(1800);
    // Le pavé numérique : par ev.key.
    const quatrieme = v.choix()[3]!.dataset.id!;
    (document as unknown as El).emettre('keydown', { key: '4', code: 'Numpad4' });
    expect(vues.map((r) => r.choisi)).toEqual([troisieme, deuxieme, quatrieme]);
    // Quittée (une autre vue) la partie gardée : barre cachée, boutons actifs ; « 1 » tapé ailleurs ne répond pas à la question cachée.
    vi.advanceTimersByTime(1800);
    v.n.quitter();
    expect(v.n.enCours).toBe(true);
    expect(v.choix()[0]!.disabled).toBe(false);
    (document as unknown as El).emettre('keydown', { key: '1', code: 'Digit1' });
    expect(vues).toHaveLength(3);
    // Les pays : rien ne change (pas de touches).
    const p = monter();
    const parPays: ReponseNommer[] = [];
    p.n.demarrer(p.terrain, 'pays', 'Europe', ['FRA'], { surReponse: (r) => void parPays.push(r) });
    v.n.arreter();
    (document as unknown as El).emettre('keydown', { key: '1' });
    expect(parPays).toEqual([]);
    expect(p.choix().every((b) => b.getAttribute('aria-label') === null)).toBe(true);
  });

  it('dans la même vue, des drapeaux puis des pays (une Révision du jour mêlée) : les boutons perdent « Choix n », le nom du pays se lit', () => {
    const v = monter({ ids: AFRIQUE, noms: NOMS_FR });
    v.n.demarrer(v.terrain, 'drapeaux', 'Afrique', ['TCD']);
    expect(v.choix().map((b) => b.getAttribute('aria-label'))).toEqual(['Choix 1', 'Choix 2', 'Choix 3', 'Choix 4']);
    v.n.arreter();
    v.n.demarrer(v.terrain, 'pays', 'Afrique', ['TCD']);
    const bs = v.choix();
    expect(v.barre.querySelector('.nommer-grille')!.classList.contains('nommer-grille-images')).toBe(false);
    for (const b of bs) {
      expect(b.getAttribute('aria-label')).toBeNull();
      expect(b.className).toBe('secondary nommer-choix');
      expect(b.textContent).toBe(NOMS_FR[b.dataset.id!]);
      expect(b.querySelector('img')).toBeNull();
    }
  });

  it('les drapeaux de la question suivante préchargés pendant celle-ci ; rien pour les pays', () => {
    const v = monter({ ids: AFRIQUE, noms: NOMS_FR });
    v.n.demarrer(v.terrain, 'drapeaux', 'Afrique', ['NER', 'TCD']);
    const avant = [...precharges];
    expect(avant).toHaveLength(4);
    v.repondre(true);
    vi.advanceTimersByTime(900);
    expect(v.cible()).toBe('TCD');
    // Les 4 images de la 2e question étaient demandées pendant la 1re ; la dernière question n'en demande pas d'autre.
    expect(v.choix().map((b) => montre(b.dataset.id!)).sort()).toEqual([...avant].sort());
    expect(precharges).toEqual(avant);
    const p = monter();
    precharges = [];
    p.n.demarrer(p.terrain, 'pays', 'Europe', ['FRA', 'ESP']);
    expect(precharges).toEqual([]);
  });

  it('la hauteur de la barre est lue (allumerZone) une fois les images posées, chacune à sa taille fixe', () => {
    const v = monter({ ids: AFRIQUE, noms: NOMS_FR });
    const lectures: boolean[] = [];
    (v.barre as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => {
      lectures.push(!v.barre.hidden && v.choix().every((b) => !!b.querySelector('img.drapeau')));
      return { top: 400, left: 0, width: 375, height: 300, right: 375, bottom: 700, x: 0, y: 400 };
    };
    v.n.demarrer(v.terrain, 'drapeaux', 'Afrique', ['TCD']);
    expect(lectures.length).toBeGreaterThan(0);
    expect(lectures.every(Boolean)).toBe(true);
    // carte.css : une taille fixe 4:3 dès la pose (64 px de haut dans les choix sur le téléphone, 96 au-delà de 600 px de large ET de haut,
    // pour qu'un téléphone en paysage garde les petits), le gris d'attente.
    const css = readFileSync('src/carte.css', 'utf8');
    expect(css).toMatch(/\.nommer-choix-image \.drapeau \{ width: 85px; height: 64px; \}/);
    expect(css).toMatch(/@media \(min-width: 600px\) and \(min-height: 600px\) \{\n  \.drapeau \{ width: 96px; height: 72px; \}\n  \.nommer-choix-image \.drapeau \{ width: 128px; height: 96px; \}/);
    expect(css).toMatch(/\.drapeau \{\n  display: block;\n  width: 64px;\n  height: 48px;[^}]*background: var\(--drapeau-attente\);[^}]*border: 1px solid var\(--drapeau-lisere\);/);
    expect(css).toMatch(/\.drapeau\.charge \{ background: var\(--drapeau-fond\); \}/);
  });
});
