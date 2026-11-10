// Le sujet Capitales, du côté pur (étude J2 § 2.1, 5.2, lot 1) : les données
// lues par src/map/capitales.ts sur les vrais fichiers, le rendu du sujet
// (src/vues/sujets.ts), les leurres de Reconnaître (qcm.choix et ses
// options) et les zones admises de Jérusalem (D36 i). Les vues : tests de
// chaque vue (nommer-vue, essai-reprise, chrono-vue, seance-vue).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptesEnPlus } from '../src/map/acceptes';
import { ADMET_EN_PLUS, capitalesChargees, chargerCapitales, lireCapitales, oublierCapitales, type LigneCapitales, type NomsCapitales } from '../src/map/capitales';
import { nommerPose, SANS_NOMMER } from '../src/srs/fiches';
import { DEBUT_PROCHE, nomsProches } from '../src/texte';
import { optionsNoter, texteAdmis } from '../src/vues/commun';
import { choix, leurresParmi, LEURRES_VOISINS, NB_CHOIX, VOISINS, type LieuQcm } from '../src/vues/qcm';
import { rendu } from '../src/vues/sujets';
import { textes } from '../src/vues/textes';

const LIGNES = JSON.parse(readFileSync('public/geo/capitales.json', 'utf8')) as LigneCapitales[];
const FR = JSON.parse(readFileSync('public/geo/capitales.fr.json', 'utf8')) as NomsCapitales;
const CAP = lireCapitales(LIGNES, FR);
const NOMS = JSON.parse(readFileSync('public/geo/noms.fr.json', 'utf8')) as Record<string, string>;
interface Zone extends LieuQcm {
  statut: string;
  continent: string;
}
const PAYS = JSON.parse(readFileSync('public/geo/pays.json', 'utf8')) as Zone[];
const LIEUX = new Map(PAYS.map((p) => [p.id, p]));
const JOUABLES = new Set(PAYS.filter((p) => p.statut === 'jouable').map((p) => p.id));
const D = { noms: NOMS, capitales: CAP };
const C = textes.capitales;

/** Générateur pseudo-aléatoire à graine (mulberry32). */
function graine(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const nomDe = (q: string) => FR.noms[q] as string;

describe('données lues (src/map/capitales.ts)', () => {
  afterEach(() => oublierCapitales());

  it('chaque jouable a ses capitales, la principale d’abord ; aucun Qid sans nom', () => {
    for (const id of JOUABLES) {
      const c = CAP.parPays.get(id);
      expect(c, id).toBeDefined();
      expect(c!.justes[0]).toBe(c!.principale);
      expect(c!.justes).toContain(c!.epreuve);
      for (const x of c!.justes) expect(x.nom, x.q).not.toMatch(/^Q\d+$/);
    }
    expect(CAP.parPays.get('BOL')!.justes.map((c) => c.nom)).toEqual(['Sucre', 'La Paz']);
    expect(CAP.parPays.get('BOL')!.epreuve.nom).toBe('La Paz');
    expect(CAP.parPays.get('PSE')!.epreuve.nom).toBe('Jérusalem-Est');
    expect(CAP.parPays.get('UKR')!.principale.alias).toContain('Kyiv');
  });

  it('D37 c : SANS_NOMMER (écrit dans le code pour la planification) = les lignes m: 1 du fichier', () => {
    const memeNom = LIGNES.filter((l) => l.m === 1).map((l) => l.pays).sort();
    expect([...(SANS_NOMMER.capitales ?? [])].sort()).toEqual(memeNom);
    expect(memeNom).toHaveLength(9);
    for (const id of memeNom) {
      expect(CAP.parPays.get(id)!.memeNom).toBe(true);
      expect(nommerPose('capitales', id)).toBe(false);
      expect(nommerPose('pays', id)).toBe(true);
    }
  });

  it('D36 i : Jérusalem admet la Palestine, Jérusalem-Est Israël ; rien pour Ramallah', () => {
    expect(Object.fromEntries(Object.entries(ADMET_EN_PLUS).map(([q, z]) => [nomDe(q), z]))).toEqual({ Jérusalem: ['PSE'], 'Jérusalem-Est': ['ISR'] });
    expect(CAP.parPays.get('ISR')!.justes.map((c) => c.q)).toEqual(['Q1218']);
    expect(CAP.parPays.get('PSE')!.justes.map((c) => c.q)).toEqual(['Q212938', 'Q158119']);
    expect(nomDe('Q158119')).toBe('Ramallah');
    expect(ADMET_EN_PLUS.Q158119).toBeUndefined();
  });

  it('chargerCapitales : lues une fois, gardées ; un échec ne reste pas en cache', async () => {
    const lus: string[] = [];
    let hors = true;
    const lire = async (chemin: string) => {
      lus.push(chemin);
      if (hors) throw new Error('hors ligne');
      return chemin.endsWith('capitales.fr.json') ? FR : LIGNES;
    };
    await expect(chargerCapitales(lire)).rejects.toThrow('hors ligne');
    expect(capitalesChargees()).toBeNull();
    hors = false;
    const [a, b] = await Promise.all([chargerCapitales(lire), chargerCapitales(lire)]);
    expect(a).toBe(b);
    expect(capitalesChargees()).toBe(a);
    const n = lus.length;
    await chargerCapitales(lire);
    expect(lus.length).toBe(n);
    expect(lus.slice(-2).sort()).toEqual(['/geo/capitales.fr.json', '/geo/capitales.json']);
  });
});

describe('rendu du sujet Capitales (§ 5.2)', () => {
  it('Trouver : « Pays dont la capitale est : » puis la ville, sur deux lignes ; jamais le pays ni le Qid', () => {
    const r = rendu('capitales', D);
    const e = r.enonce('FRA');
    expect(e).toEqual({ invite: 'Pays dont la capitale est : ', objet: { texte: 'Paris' }, deuxLignes: true });
    expect(r.consigneQcm).toBe('Quelle est sa capitale ?');
    expect(r.lieu('FRA')).toBe('France');
    expect(r.touche('ESP')).toBe('Espagne');
    expect(r.touche(null)).toBe('la mer');
  });

  it('D38 a : hors épreuve, une capitale juste au hasard, fixée pour la question (le même rendu la redonne)', () => {
    const vues = new Set<string>();
    for (let s = 1; s <= 40; s++) {
      const r = rendu('capitales', D, { hasard: graine(s) });
      const v = (r.enonce('BOL').objet as { texte: string }).texte;
      vues.add(v);
      // Reprise de la question : la même, et la même dans la rétroaction, le bouton juste, l'anneau.
      for (let k = 0; k < 5; k++) expect((r.enonce('BOL').objet as { texte: string }).texte).toBe(v);
      expect(r.choix('BOL', 'BOL')).toEqual({ texte: v });
      expect(r.nomChoix('BOL')).toBe(v);
      expect(r.retro('BOL')).toBe(v === 'La Paz' ? 'La Paz, siège du gouvernement (Bolivie)' : 'Sucre (Bolivie)');
      expect(r.point('BOL')).toEqual(v === 'La Paz' ? [-68.13, -16.5] : [-65.26, -19.05]);
      expect(r.nomBilan('BOL', 'localiser')).toBe(`${v} (Bolivie)`);
    }
    expect([...vues].sort()).toEqual(['La Paz', 'Sucre']);
  });

  it('D38 d : en épreuve, la capitale e: 1, la même pour tous (Palestine : la principale)', () => {
    for (let s = 1; s <= 10; s++) {
      const r = rendu('capitales', D, { epreuve: true, hasard: graine(s) });
      for (const [id, nom] of [
        ['BOL', 'La Paz'],
        ['NLD', 'Amsterdam'],
        ['CIV', 'Abidjan'],
        ['LKA', 'Colombo'],
        ['ZAF', 'Le Cap'],
        ['BDI', 'Bujumbura'],
        ['PSE', 'Jérusalem-Est'],
      ] as const)
        expect((r.enonce(id).objet as { texte: string }).texte, id).toBe(nom);
    }
  });

  it('Reconnaître : le bouton juste montre la capitale tirée, un leurre la principale de son pays', () => {
    const r = rendu('capitales', D, { hasard: () => 0.99 });
    expect(r.choix('BOL', 'BOL')).toEqual({ texte: 'La Paz' });
    // La Bolivie en leurre (question Pérou) : Sucre, la principale, jamais La Paz.
    expect(r.choix('BOL', 'PER')).toEqual({ texte: 'Sucre' });
    expect(r.nomChoix('NLD', 'BEL')).toBe('Amsterdam');
    expect(r.choix('ZAF', 'NAM')).toEqual({ texte: 'Pretoria' });
  });

  it('« Révéler » : toutes les justes, la principale d’abord, le rôle des autres', () => {
    const r = rendu('capitales', D);
    expect(r.revelation('BOL')).toEqual({ texte: 'Sucre · La Paz (siège du gouvernement)' });
    expect(r.revelation('BDI')).toEqual({ texte: 'Gitega · Bujumbura (capitale économique)' });
    expect(r.revelation('ZAF')).toEqual({ texte: 'Pretoria · Le Cap · Bloemfontein' });
    expect(r.revelation('FRA')).toEqual({ texte: 'Paris' });
    expect(r.points('BOL')).toEqual([
      [-65.26, -19.05],
      [-68.13, -16.5],
    ]);
  });

  it('bilans : « Porto-Novo (Bénin) », « Bénin : capitale oubliée » ; un rendu neuf (séance) dit la principale', () => {
    const r = rendu('capitales', D);
    expect(r.nomBilan('BEN', 'localiser')).toBe('Porto-Novo (Bénin)');
    expect(r.nomBilan('BEN', 'nommer')).toBe('Bénin');
    expect(textes.sujets.capitales.rate_oublie.replace('{nom}', r.nomBilan('BEN', 'nommer'))).toBe('Bénin : capitale oubliée');
    expect(textes.sujets.capitales.n.replace('{n}', '54')).toBe('54 capitales');
    expect(C.roles).toEqual({ officielle: 'capitale', siege: 'siège du gouvernement', economique: 'capitale économique' });
  });

  it('D37 c : les 9 jamais posés en QCM ni leurres ; x (Israël ↔ Palestine) jamais leurre', () => {
    const r = rendu('capitales', D);
    expect(r.qcmPosable('LUX')).toBe(false);
    expect(r.qcmPosable('BEL')).toBe(true);
    expect([...r.qcmExclus('BEL')].sort()).toEqual([...(SANS_NOMMER.capitales ?? [])].sort());
    expect(r.qcmExclus('ISR').has('PSE')).toBe(true);
    expect(r.qcmExclus('PSE').has('ISR')).toBe(true);
    const pays = rendu('pays', D);
    expect(pays.qcmPosable('LUX')).toBe(true);
    expect(pays.qcmExclus('ISR').size).toBe(0);
    expect(pays.retro('FRA')).toBe('');
    expect(pays.point('FRA')).toBeNull();
    expect(pays.admisEnPlus('ISR')).toBeNull();
  });
});

describe('zones admises de Jérusalem (D36 i), sous Capitales seulement', () => {
  const entites = (['ISR', 'PSE', 'JOR'] as const).map((id) => ({
    pays: { ...(LIEUX.get(id) as unknown as { bbox: [number, number, number, number] }), id, bbox: [34, 29, 36, 33] as [number, number, number, number] },
    forme: { type: 'Polygon' as const, coordinates: [] },
  }));
  const t = { donnees: { entites } } as never;

  it('Israël (Jérusalem) : la Palestine admise ; Palestine (Jérusalem-Est) : Israël ; Palestine (Ramallah) : rien', () => {
    // hasard 0 : la première juste, la principale (Jérusalem-Est pour la Palestine) ; 0.99 : la dernière (Ramallah).
    const israel = rendu('capitales', D, { hasard: () => 0 });
    expect(israel.admisEnPlus('ISR')).toEqual({ zones: ['PSE'], sorte: 'capitale' });
    const o = optionsNoter(israel, t, 'ISR');
    expect(o.acceptes).toBeInstanceOf(Map);
    const zones = (o.acceptes as unknown as Map<string, { zone: string; sorte: string }[]>).get('ISR')!;
    expect(zones.map((z) => [z.zone, z.sorte])).toEqual([['PSE', 'capitale']]);
    expect(rendu('capitales', D, { hasard: () => 0 }).admisEnPlus('PSE')).toEqual({ zones: ['ISR'], sorte: 'capitale' });
    const ramallah = rendu('capitales', D, { hasard: () => 0.99 });
    expect((ramallah.enonce('PSE').objet as { texte: string }).texte).toBe('Ramallah');
    expect(ramallah.admisEnPlus('PSE')).toBeNull();
    expect(optionsNoter(ramallah, t, 'PSE')).toEqual({ acceptes: true });
    // En épreuve (Jérusalem-Est pour la Palestine) : la même règle ; le de fait strict (base faux) n'en ajoute aucune.
    expect(rendu('capitales', D, { epreuve: true }).admisEnPlus('PSE')).toEqual({ zones: ['ISR'], sorte: 'capitale' });
    expect(optionsNoter(israel, t, 'ISR', false)).toEqual({ acceptes: false });
  });

  it('jamais sous Pays : ni zone en plus, ni table ; la rétroaction le dit', () => {
    const pays = rendu('pays', D);
    expect(optionsNoter(pays, t, 'ISR')).toEqual({ acceptes: true });
    expect(acceptesEnPlus({ entites } as never, 'ISR', [], 'capitale')).toBeNull();
    expect(acceptesEnPlus({ entites } as never, 'ISR', ['ZZZ'], 'capitale')).toBeNull();
    expect(texteAdmis(rendu('capitales', D), 'ISR', { zone: 'PSE', tenant: 'PSE', sorte: 'capitale' })).toBe(' (capitale revendiquée aussi par Palestine)');
  });
});

describe('leurres de Reconnaître (qcm.choix, options)', () => {
  it('Capitales : 4 pays distincts, jamais un des 9, jamais le pays de x ; les voisins d’abord', () => {
    const r = rendu('capitales', D);
    const alea = graine(5);
    for (const id of JOUABLES) {
      if (!r.qcmPosable(id)) continue;
      const exclus = r.qcmExclus(id);
      const c = choix(id, LIEUX, JOUABLES, alea, { exclus });
      expect(c).toHaveLength(NB_CHOIX);
      expect(c).toContain(id);
      for (const x of c.filter((x) => x !== id)) {
        expect(SANS_NOMMER.capitales!.has(x), `${id} → ${x}`).toBe(false);
        expect(exclus.has(x)).toBe(false);
      }
      // Chaque leurre montre la principale de son pays : jamais une autre capitale juste de la cible.
      const autres = new Set(CAP.parPays.get(id)!.justes.map((k) => k.nom));
      for (const x of c.filter((x) => x !== id)) expect(autres.has(r.nomChoix(x, id)), `${id} → ${x}`).toBe(false);
    }
    // Israël : la Palestine (voisine) n'est jamais leurre, sur 200 tirages.
    for (let s = 0; s < 200; s++) {
      expect(choix('ISR', LIEUX, JOUABLES, graine(s), { exclus: r.qcmExclus('ISR') })).not.toContain('PSE');
      expect(choix('PSE', LIEUX, JOUABLES, graine(s), { exclus: r.qcmExclus('PSE') })).not.toContain('ISR');
      // La Belgique (voisine du Luxembourg), le Luxembourg jamais leurre ; la France (voisine de Monaco), Monaco jamais.
      expect(choix('BEL', LIEUX, JOUABLES, graine(s), { exclus: r.qcmExclus('BEL') })).not.toContain('LUX');
      expect(choix('FRA', LIEUX, JOUABLES, graine(s), { exclus: r.qcmExclus('FRA') })).not.toContain('MCO');
    }
    // Sans l'option, le Luxembourg (voisin) et la Palestine le sont bien : l'exclusion fait le travail.
    expect(Array.from({ length: 50 }, (_, s) => choix('BEL', LIEUX, JOUABLES, graine(s))).some((c) => c.includes('LUX'))).toBe(true);
    expect(Array.from({ length: 50 }, (_, s) => choix('ISR', LIEUX, JOUABLES, graine(s))).some((c) => c.includes('PSE'))).toBe(true);
  });

  it('sans option, le tirage d’avant à l’identique (mêmes graines, mêmes choix)', () => {
    for (const id of ['FRA', 'MUS', 'BOL', 'LUX']) {
      expect(choix(id, LIEUX, JOUABLES, graine(9), {})).toEqual(choix(id, LIEUX, JOUABLES, graine(9)));
      expect(choix(id, LIEUX, JOUABLES, graine(9), { strategie: LEURRES_VOISINS })).toEqual(choix(id, LIEUX, JOUABLES, graine(9)));
    }
  });

  it('stratégies du quiz (lot 4a) : sources dans l’ordre, n au plus de chacune, puis les plus proches', () => {
    const continent = (id: string) => LIEUX.get(id)?.continent;
    // Facile : 3 lieux « connus » du même continent.
    const connus = new Set(['FRA', 'DEU', 'ITA', 'ESP', 'GBR', 'JPN', 'CHN', 'USA', 'BRA', 'EGY']);
    const memeContinent = leurresParmi((c) => [...connus].filter((x) => continent(x) === continent(c)), 3);
    for (let s = 0; s < 30; s++) {
      const c = choix('PRT', LIEUX, JOUABLES, graine(s), { strategie: [memeContinent] }).filter((x) => x !== 'PRT');
      for (const x of c) expect(['FRA', 'DEU', 'ITA', 'ESP', 'GBR']).toContain(x);
    }
    // Moyen : 1 voisin, puis 2 « connus ».
    for (let s = 0; s < 30; s++) {
      const c = choix('PRT', LIEUX, JOUABLES, graine(s), { strategie: [{ ...VOISINS, n: 1 }, leurresParmi(() => ['JPN', 'BRA', 'USA'], 2)] }).filter((x) => x !== 'PRT');
      expect(c).toContain('ESP');
      expect(c.filter((x) => ['JPN', 'BRA', 'USA'].includes(x))).toHaveLength(2);
    }
    // Sosies, puis éloignés : une source trop courte est complétée par les plus proches.
    const c = choix('FRA', LIEUX, JOUABLES, graine(1), { strategie: [leurresParmi(() => ['NLD'])] }).filter((x) => x !== 'FRA');
    expect(c).toContain('NLD');
    expect(c).toHaveLength(3);
    // Une source ne propose jamais la cible, un exclu, ni deux fois le même.
    const d = choix('FRA', LIEUX, JOUABLES, graine(2), { exclus: new Set(['ESP']), strategie: [leurresParmi(() => ['FRA', 'ESP', 'BEL', 'BEL'])] });
    expect(new Set(d).size).toBe(4);
    expect(d).not.toContain('ESP');
    expect(d).toContain('BEL');
  });

  it('noms proches (quiz facile et moyen) : jamais un leurre dont le nom se confond avec la réponse', () => {
    expect(nomsProches('Kingston', 'Kingstown')).toBe(true);
    expect(nomsProches('Budapest', 'Bucarest')).toBe(true);
    expect(nomsProches('Riga', 'Riyad')).toBe(true);
    expect(nomsProches('Saint-Georges', "Saint John's")).toBe(true);
    expect(nomsProches('Paris', 'Pékin')).toBe(false);
    expect(DEBUT_PROCHE).toBe(4);
    const r = rendu('capitales', D, { hasard: () => 0 });
    const proches = (a: string, b: string) => nomsProches(r.nomChoix(a), r.nomChoix(b, a));
    // Jamaïque (Kingston) : Saint-Vincent (Kingstown) jamais leurre, même imposé par la stratégie.
    for (let s = 0; s < 30; s++) {
      expect(choix('JAM', LIEUX, JOUABLES, graine(s), { proches, strategie: [leurresParmi(() => ['VCT', 'CUB', 'HTI'])] })).not.toContain('VCT');
    }
    expect(choix('JAM', LIEUX, JOUABLES, graine(1), { strategie: [leurresParmi(() => ['VCT', 'CUB', 'HTI'])] })).toContain('VCT');
  });
});
