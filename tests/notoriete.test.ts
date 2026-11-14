import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { chargerDonneesQuiz, lireNotoriete, oublierDonneesQuiz } from '../src/quiz/donnees';

// Notoriété des lieux du quiz (étude J2 § 2.4, lot 4a ; D48 b) : public/geo/notoriete.json,
// produit par geodata/notoriete.mjs à partir des extraits figés de Wikidata et de la table
// de relecture à la main (geodata/notoriete-main.json).

interface Classe {
  id: string;
  rang: number;
  wikipedias: number;
  vues: number;
}
type Niveaux = Record<'pays' | 'capitales' | 'drapeaux' | 'mers', Map<string, number>>;
type Module = {
  EFFECTIFS: Record<'pays' | 'capitales' | 'mers', [number, number]>;
  calculer: (d: Record<string, unknown>) => { niveaux: Niveaux; classes: Record<'pays' | 'capitales' | 'mers', Classe[]>; fautes: string[]; notes: string[] };
  couper: (c: Classe[], e: [number, number]) => Map<string, number>;
  texte: (n: Niveaux) => string;
  construireNotoriete: (racine: string) => Promise<{ fichiers: Record<string, string>; entrees: Record<string, string> }>;
};
// Import dynamique sans types : le module est en JavaScript, sans déclaration.
const module = import('../geodata/notoriete.mjs' as string) as Promise<Module>;

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const brut = readFileSync('public/geo/notoriete.json', 'utf8');
const n = lireNotoriete(JSON.parse(brut));
const pays = lire<{ id: string; statut: string }[]>('public/geo/pays.json');
const jouables = pays.filter((p) => p.statut === 'jouable').map((p) => p.id);
const capitales = lire<{ pays: string; c: { q: string }[] }[]>('public/geo/capitales.json');
const mers = lire<{ id: string; sorte: string }[]>('public/geo/mers.json');
const main = lire<Record<string, Record<string, { niveau: number; raison: string }>>>('geodata/notoriete-main.json');
const donnees = () => ({
  pays,
  capitales,
  vuesPays: lire('geodata/wikidata/notoriete.json'),
  extrait: lire('geodata/wikidata/capitales.json'),
  mersEntites: lire('geodata/wikidata/mers-entites.json'),
  mersVues: lire('geodata/wikidata/mers-vues.json'),
  mersComplement: lire('geodata/wikidata/mers-vues-complement.json'),
  mers: lire('geodata/mers.json'),
  main,
});
const compte = (o: Record<string, number>) => [1, 2, 3].map((k) => Object.values(o).filter((x) => x === k).length);

describe('notoriete.json', () => {
  it('un niveau de 1 à 3 pour chaque lieu jouable de chaque sujet, et rien d’autre', () => {
    expect(Object.keys(n.pays).sort()).toEqual([...jouables].sort());
    expect(n.drapeaux).toEqual(n.pays);
    const qids = capitales.filter((l) => jouables.includes(l.pays)).flatMap((l) => l.c.map((c) => c.q));
    expect(Object.keys(n.capitales).sort()).toEqual([...new Set(qids)].sort());
    expect(Object.keys(n.mers).sort()).toEqual(mers.map((m) => m.id).sort());
    for (const s of ['pays', 'capitales', 'drapeaux', 'mers'] as const) for (const [id, v] of Object.entries(n[s])) expect([1, 2, 3], `${s} ${id}`).toContain(v);
  });

  it('pays non jouables écartés : ni le Kosovo, ni Taïwan, ni Taipei', () => {
    expect(n.pays.XKX).toBeUndefined();
    expect(n.pays.TWN).toBeUndefined();
    expect(n.drapeaux.TWN).toBeUndefined();
    const taipei = capitales.find((l) => l.pays === 'TWN')!.c[0]!.q;
    expect(n.capitales[taipei]).toBeUndefined();
  });

  it('Monaco, Singapour et la Cité du Vatican : leur item est celui du pays, elles prennent son niveau', () => {
    expect(n.capitales.Q235).toBe(n.pays.MCO);
    expect(n.capitales.Q334).toBe(n.pays.SGP);
    expect(n.capitales.Q237).toBe(n.pays.VAT);
  });

  it('mers (D48 b) : la Manche au niveau 1, Gascogne, Tyrrhénienne et Hudson au 2 ; les cinq océans au 1', () => {
    expect(n.mers.manche).toBe(1);
    expect([n.mers.gascogne, n.mers.tyrrhen, n.mers.hudson]).toEqual([2, 2, 2]);
    for (const m of mers.filter((x) => x.sorte === 'océan')) expect(n.mers[m.id], m.id).toBe(1);
  });

  it('la Finlande au moyen : l’exemple que la décision « Quiz général » écarte du facile', () => {
    expect(n.pays.FIN).toBe(2);
    expect(n.drapeaux.FIN).toBe(2);
  });

  it('effectifs finaux : ceux de la coupe, corrigés par la table à la main (échanges entre les niveaux 1 et 2)', () => {
    // Pays : 8 échanges entre 1 et 2 (la Finlande au 2, décision « Quiz général »), le Soudan du Sud au 3.
    expect(compte(n.pays)).toEqual([40, 59, 96]);
    // Capitales : 30 / 60 rangées, 5 montées et 4 descendues ; Monaco, Singapour et le Vatican au niveau 2 de leur pays.
    expect(compte(n.capitales)).toEqual([31, 62, 115]);
    // Mers : la Manche, l'océan Austral et la mer des Caraïbes au 1 ; Gascogne, Hudson et le golfe Persique au 2.
    expect(compte(n.mers)).toEqual([14, 11, 25]);
  });

  it('léger : moins de 8 Ko brut, 2 Ko gzip', () => {
    expect(Buffer.byteLength(brut)).toBeLessThan(8_000);
    expect(gzipSync(brut).length).toBeLessThan(2_000);
  });
});

describe('geodata/notoriete.mjs', () => {
  it('coupe du rang combiné par effectifs (D48 b), avant la table : pays 40 / 60, capitales 30 / 60, mers 12 / 11', async () => {
    const { calculer, couper, EFFECTIFS } = await module;
    expect(EFFECTIFS).toEqual({ pays: [40, 60], capitales: [30, 60], mers: [12, 11] });
    const r = calculer(donnees());
    expect(r.fautes).toEqual([]);
    expect(r.classes.pays).toHaveLength(195);
    expect(r.classes.mers).toHaveLength(50);
    for (const s of ['pays', 'capitales', 'mers'] as const) {
      const coupe = couper(r.classes[s], EFFECTIFS[s]);
      const [a, b] = EFFECTIFS[s];
      expect([...coupe.values()].filter((x) => x === 1)).toHaveLength(a);
      expect([...coupe.values()].filter((x) => x === 2)).toHaveLength(b);
      // Le rang combiné va croissant.
      const rangs = r.classes[s].map((c) => c.rang);
      expect(rangs).toEqual([...rangs].sort((x, y) => x - y));
    }
    // Les capitales qui sont le pays ne sont pas rangées.
    for (const q of ['Q235', 'Q334', 'Q237']) expect(r.classes.capitales.map((c) => c.id)).not.toContain(q);
  });

  it('table à la main : chaque ligne a sa raison et change un niveau ; une ligne qui ne change plus rien ou vise un inconnu est une faute', async () => {
    const { calculer } = await module;
    for (const s of ['pays', 'capitales', 'mers']) {
      for (const [id, l] of Object.entries(main[s] ?? {})) {
        if (id.startsWith('_')) continue;
        expect(l.raison, `${s} ${id}`).toBeTruthy();
        expect([1, 2, 3]).toContain(l.niveau);
      }
    }
    const d = donnees();
    const r = calculer(d);
    const premier = r.classes.pays[0]!.id;
    const fautif = { ...main, pays: { ...main.pays, [premier]: { niveau: 1, raison: 'essai' }, XYZ: { niveau: 2, raison: 'essai' } } };
    const f = calculer({ ...d, main: fautif }).fautes;
    expect(f.some((x) => x.includes(premier) && x.includes('déjà au niveau 1'))).toBe(true);
    expect(f.some((x) => x.includes('XYZ'))).toBe(true);
  });

  it('reproduction : construireNotoriete redonne le fichier servi, et les empreintes de sources.json', async () => {
    const { construireNotoriete } = await module;
    const r = await construireNotoriete('.');
    expect(r.fichiers['notoriete.json']).toBe(brut);
    const sources = lire<{ traitement: { entrees: Record<string, string> } }>('public/geo/sources.json');
    for (const [f, h] of Object.entries(r.entrees)) {
      expect(h, f).toBe(createHash('sha256').update(readFileSync(f)).digest('hex'));
      expect(sources.traitement.entrees[f], f).toBe(h);
    }
  });

  it('l’extrait des vues : 12 mois complets, chaque pays jouable avec ses vues', () => {
    const e = lire<{ vues: { du: string; au: string; mois: number }; pays: Record<string, { q: string; frwiki: string; vues_fr: number | null }> }>('geodata/wikidata/notoriete.json');
    expect(e.vues.mois).toBe(12);
    for (const id of jouables) expect(e.pays[id]?.vues_fr, id).toBeGreaterThan(0);
  });
});

describe('chargerDonneesQuiz', () => {
  it('lit la notoriété et les paires proches une fois ; un échec ne reste pas en cache', async () => {
    oublierDonneesQuiz();
    const lus: string[] = [];
    let echoue = true;
    const lecteur = async (chemin: string) => {
      lus.push(chemin);
      if (echoue) throw new Error('hors ligne');
      return JSON.parse(readFileSync(`public${chemin}`, 'utf8')) as unknown;
    };
    await expect(chargerDonneesQuiz(lecteur)).rejects.toThrow('hors ligne');
    echoue = false;
    const d = await chargerDonneesQuiz(lecteur);
    expect(d.notoriete.pays.FRA).toBe(1);
    expect(d.proches.score('IDN', 'MCO')).toBe(0);
    expect(d.proches.score('MCO', 'IDN')).toBe(0);
    expect(d.proches.score('FRA', 'JPN')).toBeUndefined();
    await chargerDonneesQuiz(lecteur);
    expect(lus.filter((c) => c.endsWith('notoriete.json'))).toHaveLength(2);
    oublierDonneesQuiz();
  });
});
