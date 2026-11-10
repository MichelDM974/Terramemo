// Recherche de l'en-tête : la fonction pure (texte.ts) et les lieux qu'elle
// parcourt (recherche.ts : zones nommées du monde, communes de l'île).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lireCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import type { DonneesCarte } from '../src/map/donnees';
import type { Pays } from '../src/map/types';
import { chercherLieux, MAX_SUGGESTIONS } from '../src/texte';
import { brancherRecherche, lieuxCapitales, lieuxMonde, lieuxReunion, type LieuTrouve } from '../src/vues/recherche';
import { El, installerDom } from './dom-factice';

const lieu = (nom: string) => ({ nom });
const noms = (l: { nom: string }[]) => l.map((x) => x.nom);

describe('chercherLieux', () => {
  const tous = ['France', 'Congo', 'République démocratique du Congo', 'Saint-Denis', 'Saint-Pierre', 'Saint-Pierre-et-Miquelon', 'L’Étang-Salé', 'Le Port', 'Danemark'].map(lieu);

  it('rien pour un champ vide ou blanc', () => {
    expect(chercherLieux('', tous)).toEqual([]);
    expect(chercherLieux('   ', tous)).toEqual([]);
  });

  it('le début du nom d’abord, puis le début d’un mot, sans accents ni casse', () => {
    expect(noms(chercherLieux('congo', tous))).toEqual(['Congo', 'République démocratique du Congo']);
    expect(noms(chercherLieux('DEN', tous))).toEqual(['Saint-Denis']);
    expect(noms(chercherLieux('d', tous))).toEqual(['Danemark', 'République démocratique du Congo', 'Saint-Denis']);
    expect(noms(chercherLieux('etang', tous))).toEqual(['L’Étang-Salé']);
    expect(noms(chercherLieux("l'etang", tous))).toEqual(['L’Étang-Salé']);
  });

  it('le trait d’union vaut une espace, et plusieurs mots se suivent', () => {
    expect(noms(chercherLieux('saint pierre', tous))).toEqual(['Saint-Pierre', 'Saint-Pierre-et-Miquelon']);
    expect(noms(chercherLieux('du congo', tous))).toEqual(['République démocratique du Congo']);
  });

  it('pas d’un milieu de mot', () => {
    expect(chercherLieux('ance', tous)).toEqual([]);
  });

  it(`au plus ${MAX_SUGGESTIONS} lieux, ou le maximum donné`, () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => lieu(`Saint ${String(i).padStart(2, '0')}`));
    expect(chercherLieux('saint', beaucoup)).toHaveLength(MAX_SUGGESTIONS);
    expect(chercherLieux('saint', beaucoup, 3)).toHaveLength(3);
  });
});

describe('lieux de la recherche', () => {
  const pays = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Pays[];
  const nomsMonde = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  const monde = lieuxMonde({ entites: pays.map((p) => ({ pays: p })), noms: nomsMonde } as unknown as DonneesCarte);

  it('toute zone nommée du monde, pays, territoires et zones contestées', () => {
    expect(monde.length).toBe(pays.filter((p) => nomsMonde[p.id]).length);
    expect(monde.length).toBeGreaterThan(195);
    const fra = monde.find((l) => l.id === 'FRA');
    expect(fra).toEqual({ terrain: 'monde', id: 'FRA', nom: nomsMonde.FRA, detail: 'Europe' });
    // Un territoire le dit plutôt que son continent.
    const territoire = pays.find((p) => p.statut === 'territoire' && nomsMonde[p.id]);
    expect(monde.find((l) => l.id === territoire?.id)?.detail).toBe('territoire');
  });

  it('les 24 communes de l’île, dites communes de La Réunion', () => {
    const nomsIle = JSON.parse(readFileSync('public/geo/reunion/noms.fr.json', 'utf8')) as Record<string, string>;
    const ile = lieuxReunion(nomsIle);
    expect(ile).toHaveLength(24);
    expect(ile.find((l) => l.id === '97411')).toEqual({ terrain: 'reunion', id: '97411', nom: 'Saint-Denis', detail: 'commune de La Réunion' });
    expect(noms(chercherLieux('saint d', [...monde, ...ile]))).toEqual(['Saint-Denis']);
  });
});

// Les capitales (étude J2 § 7.3, lot 1) : une ligne par capitale juste, ses
// alias, son point ; chargées à la première frappe.
describe('recherche : les capitales', () => {
  const nomsMonde = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
  const cap = lireCapitales(
    JSON.parse(readFileSync('public/geo/capitales.json', 'utf8')) as LigneCapitales[],
    JSON.parse(readFileSync('public/geo/capitales.fr.json', 'utf8')) as NomsCapitales,
  );
  const lignes = lieuxCapitales(cap, nomsMonde);

  it('210 lignes, chacune sur la zone de son pays ; detail « capitale (Bolivie) », « siège du gouvernement (Bolivie) », « capitale économique (Burundi) »', () => {
    expect(lignes).toHaveLength(210);
    const de = (nom: string) => lignes.filter((l) => l.nom === nom);
    expect(de('Sucre')).toEqual([{ terrain: 'monde', id: 'BOL', nom: 'Sucre', detail: 'capitale (Bolivie)', alias: [], point: [-65.26, -19.05] }]);
    expect(de('La Paz').map((l) => [l.id, l.detail])).toEqual([['BOL', 'siège du gouvernement (Bolivie)']]);
    expect(de('Bujumbura').map((l) => l.detail)).toEqual(['capitale économique (Burundi)']);
    // Jérusalem et Jérusalem-Est : deux lignes, deux pays, deux points.
    const j = chercherLieux('jerusalem', lignes);
    expect(j.map((l) => [l.nom, l.id])).toEqual([
      ['Jérusalem', 'ISR'],
      ['Jérusalem-Est', 'PSE'],
    ]);
    expect(j[0]!.point).not.toEqual(j[1]!.point);
    // Aucun Qid, nulle part.
    for (const l of lignes) expect(`${l.nom} ${l.detail}`).not.toMatch(/\bQ\d+\b/);
  });

  it('les alias sont cherchés : Kyiv trouve Kiev, Beijing Pékin, Tarawa Tarawa-Sud', () => {
    expect(chercherLieux('kyiv', lignes).map((l) => l.nom)).toEqual(['Kiev']);
    expect(chercherLieux('beijing', lignes).map((l) => l.nom)).toEqual(['Pékin']);
    expect(chercherLieux('tarawa', lignes).map((l) => l.nom)).toContain('Tarawa-Sud');
    expect(chercherLieux('la paz', lignes).map((l) => l.nom)).toEqual(['La Paz', 'Ciudad de la Paz']);
  });

  describe('dans le champ de l’en-tête', () => {
    beforeEach(() => installerDom());
    afterEach(() => vi.unstubAllGlobals());

    function monter(capitales = vi.fn(async () => cap)) {
      const boite = new El('div');
      boite.className = 'recherche';
      const champ = Object.assign(new El('input'), { blur() {} });
      boite.append(champ);
      const choisis: LieuTrouve[] = [];
      // Les communes (fetch) : hors ligne, sans effet ici.
      vi.stubGlobal('fetch', async () => {
        throw new TypeError('hors ligne');
      });
      const monde = {
        entites: ['BOL', 'LUX'].map((id) => ({ pays: { id, statut: 'jouable', continent: id === 'BOL' ? 'South America' : 'Europe' } })),
        noms: nomsMonde,
      } as unknown as DonneesCarte;
      brancherRecherche({ champ: champ as unknown as HTMLInputElement, monde, choisir: (l) => void choisis.push(l), capitales });
      const taper = (t: string) => {
        champ.value = t;
        champ.emettre('input');
      };
      // Le clic d'une ligne : écouté par la liste (délégation), sur sa cible.
      const toucher = (o: El) => boite.querySelector('#recherche-liste')!.emettre('click', { target: o });
      return { boite, champ, choisis, capitales, taper, toucher, options: () => boite.querySelectorAll('[role="option"]') };
    }
    const attendre = () => new Promise((r) => setTimeout(r, 0));

    it('rien de chargé au focus ; à la première frappe, une fois ; « La Paz » choisie : son pays et son point', async () => {
      const r = monter();
      r.champ.emettre('focus');
      expect(r.capitales).not.toHaveBeenCalled();
      r.taper('la p');
      expect(r.capitales).toHaveBeenCalledTimes(1);
      await attendre();
      r.taper('la pa');
      expect(r.capitales).toHaveBeenCalledTimes(1);
      const opts = r.options();
      expect(opts.map((o) => o.innerText)).toEqual(['La Pazsiège du gouvernement (Bolivie)', 'Ciudad de la Pazcapitale (Guinée équatoriale)']);
      r.toucher(opts[0]!);
      expect(r.choisis).toEqual([{ terrain: 'monde', id: 'BOL', nom: 'La Paz', detail: 'siège du gouvernement (Bolivie)', alias: [], point: [-68.13, -16.5] }]);
    });

    it('la ligne choisie est celle touchée, pas la première du même pays (Sucre et La Paz ont la zone BOL)', async () => {
      const r = monter();
      r.taper('b');
      await attendre();
      r.taper('bolivie');
      expect(r.options().map((o) => o.dataset.id)).toEqual(['BOL']);
      r.taper('sucre');
      r.toucher(r.options()[0]!);
      expect(r.choisis.at(-1)?.nom).toBe('Sucre');
      // Deux lignes de la même zone dans la liste : le pays Luxembourg et sa capitale ; la seconde touchée, c'est elle.
      r.taper('luxembourg');
      const opts = r.options();
      expect(opts.map((o) => o.dataset.id)).toEqual(['LUX', 'LUX']);
      const i = r.options().findIndex((o) => o.innerText.includes('capitale'));
      expect(i).toBe(1);
      r.toucher(opts[i]!);
      expect(r.choisis.at(-1)).toMatchObject({ id: 'LUX', nom: 'Luxembourg', detail: 'capitale (Luxembourg)' });
      expect(r.choisis.at(-1)?.point).toBeDefined();
    });

    it('capitales hors ligne à la première frappe : rien de plus que les pays ; la frappe suivante les relit', async () => {
      const capitales = vi.fn<() => Promise<typeof cap>>().mockRejectedValueOnce(new Error('hors ligne')).mockResolvedValue(cap);
      const r = monter(capitales);
      r.taper('la p');
      await attendre();
      expect(r.options().map((o) => o.innerText)).not.toContain('La Pazsiège du gouvernement (Bolivie)');
      r.taper('la pa');
      expect(capitales).toHaveBeenCalledTimes(2);
      await attendre();
      expect(r.options().map((o) => o.innerText)).toContain('La Pazsiège du gouvernement (Bolivie)');
    });
  });
});
