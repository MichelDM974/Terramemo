// Le sujet Voisins (J4, lot 2 ; étude docs/etudes/2026-11-25-j4-conception.md, § 3 ; D605 à D607), sur les données
// réelles de public/geo : qui est voisin de qui (156 pays posables, 39 exclus), ce qui est neutre (les voisins non
// jouables, les voisins par une zone admise, recalculés sur les formes : S612), les ensembles ambigus de Reconnaître,
// ce que vaut un toucher (la partie pure, puis la question sur une vraie carte : le Crimée compte pour l'Ukraine), le
// rendu du sujet (la liste écrite, jamais le pays avant la réponse).
import { readFileSync } from 'node:fs';
import type { GeoProjection } from 'd3-geo';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { delaiVoisins, QuestionVoisins, voisinage, VOISINS_PAR_ZONE, type Coup } from '../src/exercices/voisins';
import { acceptesDe, ENCLAVES } from '../src/map/acceptes';
import { assembler } from '../src/map/donnees';
import { calculerPastilles } from '../src/map/pastilles';
import { noter, pick, type ContexteCarte, type OptionsNoter } from '../src/map/pick';
import { creerProjection } from '../src/map/projection';
import type { Contestee, Pays, Transfo } from '../src/map/types';
import { aVoisins, SANS_VOISIN } from '../src/srs/fiches';
import { depotMemoire } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import { creerArbre } from '../src/vues/arbre';
import { catalogue } from '../src/vues/cibles';
import { creerSeances } from '../src/vues/seance';
import { LIBELLE_STATUT, optionsNoter, texteAdmis } from '../src/vues/commun';
import { formePays } from '../src/vues/formes';
import { poserVoisins, rendu, voisinsCharges } from '../src/vues/sujets';
import { remplir, textes } from '../src/vues/textes';
import { textesVoisins } from '../src/vues/textes-voisins';
import * as morceau from '../src/vues/voisins';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const PAYS = lire('pays.json') as Pays[];
const CONTESTEES = lire('contestees.json') as Contestee[];
const TOPO = lire('monde.topo.json') as Topology<{ pays: GeometryCollection<{ id: string }>; contestees: GeometryCollection<{ id: string }> }>;
const monde = assembler(TOPO as Topology<never>, PAYS, CONTESTEES, lire('noms.fr.json'));
const NOMS = monde.noms;
const V = voisinage(PAYS);
const T = textesVoisins;
const nom = (id: string) => NOMS[id]!;

beforeAll(() => poserVoisins(morceau, { texteAdmis, estPetite: () => false, statuts: LIBELLE_STATUT }));
afterAll(() => poserVoisins(null));

describe('les données (§ 3.1)', () => {
  it('156 pays posables, les 39 sans voisin jouable exclus, figés dans SANS_VOISIN ; 624 voisins à trouver en tout', () => {
    const jouables = PAYS.filter((p) => p.statut === 'jouable');
    expect(jouables).toHaveLength(195);
    expect(V.posables).toHaveLength(156);
    expect(jouables.filter((p) => !V.posables.includes(p.id)).map((p) => p.id)).toEqual([...SANS_VOISIN].sort());
    expect(SANS_VOISIN.size).toBe(39);
    expect(V.posables.every(aVoisins)).toBe(true);
    expect(V.posables.reduce((n, id) => n + V.voisins(id).length, 0)).toBe(624);
    // Les îles, Cuba (la base de Guantánamo) et Chypre (zone tampon, bases britanniques).
    for (const id of ['JPN', 'ISL', 'CUB', 'CYP', 'AUS', 'NZL']) expect(aVoisins(id), id).toBe(false);
  });

  it('la Hongrie 7, la Chine et la Russie 14 ; la France avec le Brésil et le Suriname (la Guyane) ; la Papouasie-Nouvelle-Guinée, l’Indonésie seule', () => {
    expect(V.voisins('HUN')).toEqual(['AUT', 'HRV', 'ROU', 'SRB', 'SVK', 'SVN', 'UKR']);
    expect(V.voisins('CHN')).toHaveLength(14);
    expect(V.voisins('RUS')).toHaveLength(14);
    expect(V.voisins('FRA')).toEqual(expect.arrayContaining(['BRA', 'SUR', 'ESP', 'AND', 'MCO']));
    expect(V.voisins('PNG')).toEqual(['IDN']);
    // Symétrique.
    for (const a of V.posables) for (const b of V.voisins(a)) expect(V.voisins(b), `${a} ${b}`).toContain(a);
  });

  it('les voisins non jouables à part : le Kosovo pour la Serbie, Hong Kong et Macao pour la Chine ; ni demandés', () => {
    expect(V.autres('SRB')).toEqual(['XKX']);
    expect(V.autres('CHN')).toEqual(['HKG', 'MAC', 'NE_KAS']);
    expect(V.voisins('SRB')).not.toContain('XKX');
    // 23 pays jouables ont un voisin non jouable (28 liens), Cuba et Chypre compris, qui n'ont que ceux-là.
    const jouables = PAYS.filter((p) => p.statut === 'jouable').map((p) => p.id);
    expect(jouables.filter((id) => V.autres(id).length)).toHaveLength(23);
    expect(jouables.reduce((n, id) => n + V.autres(id).length, 0)).toBe(28);
    expect([V.autres('CUB'), V.voisins('CUB')]).toEqual([['NE_USG'], []]);
  });

  it('les 4 ensembles ambigus de Reconnaître (D606 a), figés', () => {
    const ambigus = V.posables.filter((id) => V.ambigus(id).length).map((id) => [id, ...V.ambigus(id)].sort().join(' '));
    expect([...new Set(ambigus)].sort()).toEqual(['ARE YEM', 'BTN NPL', 'PNG TLS', 'SMR VAT']);
    expect(V.ambigus('ARE')).toEqual(['YEM']);
    expect(V.ambigus('HUN')).toEqual([]);
  });

  it('la liste est dite entière : 22 pays ont un sur-ensemble de voisins, ni justes ni écartés des leurres ; « seuls » le dit', () => {
    // Le Liechtenstein (Autriche, Suisse) : l'Allemagne et l'Italie les bordent aussi ; « Pays qui a pour voisins »
    // les aurait désignées aussi (la liste d'un seul voisin disait déjà « seul »).
    const sur = (a: string) => V.posables.filter((b) => b !== a && V.voisins(b).length > V.voisins(a).length && V.voisins(a).every((x) => V.voisins(b).includes(x)));
    const avec = V.posables.filter((id) => V.voisins(id).length > 1 && sur(id).length).map((id) => `${id}:${sur(id).join(',')}`);
    expect(avec).toEqual(['BDI:UGA', 'BGD:CHN', 'BTN:MMR,PAK', 'CHL:BRA', 'DJI:SDN', 'ECU:BRA', 'EST:BLR,LTU', 'GNB:MLI', 'GNQ:COG', 'KWT:JOR', 'LBN:JOR', 'LIE:DEU,ITA', 'MDA:HUN', 'MNG:KAZ,PRK', 'NLD:FRA,LUX', 'NPL:MMR,PAK', 'SLE:CIV', 'SOM:SSD', 'SWE:RUS', 'SWZ:ZWE', 'TUN:NER', 'URY:BOL,PRY']);
    expect(V.ambigus('LIE')).toEqual([]);
    expect(V.ambigus('BTN')).toEqual(['NPL']);
    for (const t of [T.liste, T.qcm, textes.sujets.voisins.enonce, textes.sujets.voisins.consigne_nommer]) expect(t).toContain('seuls voisins');
    for (const t of [T.liste_un, T.qcm_un]) expect(t).toContain('seul voisin');
  });

  it('les voisins par une zone admise (D605 a), neutres dans les deux sens : les 3 de l’étude, sur les entités', () => {
    expect(V.parZone('MAR')).toEqual(['MRT']);
    expect(V.parZone('MRT')).toEqual(['MAR']);
    expect(V.parZone('SOM')).toEqual(['DJI']);
    expect(V.parZone('DJI')).toEqual(['SOM']);
    expect(V.parZone('SRB')).toEqual(['ALB']);
    expect(V.parZone('ALB')).toEqual(['SRB']);
    // Le Cachemire n'en crée aucune entre la Chine, l'Inde et le Pakistan (déjà voisins deux à deux).
    expect(V.parZone('PAK')).toEqual([]);
    // Recalculées : les entités revendiquées par un pays jouable et les enclaves, leurs voisins jouables qui ne bordent pas le pays.
    const parId = new Map(PAYS.map((p) => [p.id, p]));
    const jouable = (id: string) => parId.get(id)?.statut === 'jouable';
    const paires = new Set<string>();
    for (const e of PAYS)
      for (const h of [...(e.revendique_par ?? []), ...(ENCLAVES[e.id] ? [ENCLAVES[e.id]!] : [])])
        if (jouable(h)) for (const v of e.voisins) if (jouable(v) && v !== h && !parId.get(h)!.voisins.includes(v)) paires.add(`${h} ${v} ${e.id}`);
    expect([...paires].sort()).toEqual(['MAR MRT ESH', 'SOM DJI NE_SOL', 'SRB ALB XKX']);
  });

  it('S612, mesurée sur les formes : les zones hachurées en ajoutent 10, figées dans VOISINS_PAR_ZONE (l’Inde et l’Afghanistan par le Cachemire tenu par le Pakistan…)', () => {
    const gp = TOPO.objects.pays.geometries;
    const gc = TOPO.objects.contestees.geometries;
    const bords = neighbors([...gp, ...gc] as never);
    const parId = new Map(PAYS.map((p) => [p.id, p]));
    const jouable = (id: string) => parId.get(id)?.statut === 'jouable';
    const paires = new Set<string>();
    const idDe = (g: { properties?: unknown }) => (g.properties as { id: string }).id;
    gc.forEach((g, k) => {
      const info = CONTESTEES.find((c) => c.id === idDe(g));
      if (!info) return;
      const bordes = bords[gp.length + k]!.filter((j) => j < gp.length).map((j) => idDe(gp[j]!));
      for (const h of [...info.dans, ...info.revendique_par])
        if (jouable(h)) for (const v of bordes) if (jouable(v) && v !== h && !parId.get(h)!.voisins.includes(v)) paires.add(`${h} ${v} ${info.id}`);
    });
    const hachures = VOISINS_PAR_ZONE.filter(([, , z]) => z.startsWith('NE_B') || z.startsWith('NE_C')).map((x) => x.join(' '));
    expect([...paires].sort()).toEqual([...hachures].sort());
    expect(hachures).toHaveLength(10);
    expect(V.parZone('AFG')).toEqual(['IND']);
    expect(V.parZone('IND')).toEqual(['AFG']);
    // Les Kouriles : le Japon, sans voisin à toucher, n'est neutre que dans la question de la Russie.
    expect(V.parZone('RUS')).toEqual(['JPN']);
    expect(V.parZone('JPN')).toEqual([]);
  });
});

describe('une question à plusieurs touchers (pure, § 3.2)', () => {
  const q = () => new QuestionVoisins('SRB', V.voisins('SRB'), new Set([...V.autres('SRB'), ...V.parZone('SRB')]));
  /** Un toucher qui compte pour `sous` (le doigt dans son tracé), la carte y désignant `sous` aussi. */
  const sur = (x: QuestionVoisins, sous: string | null): Coup => x.jouer((c) => c === sous, sous);

  it('chaque voisin compte une fois ; tous trouvés sans faute : juste', () => {
    const x = q();
    expect(x.aTrouver).toEqual(['BGR', 'BIH', 'HRV', 'HUN', 'MKD', 'MNE', 'ROU']);
    expect(sur(x, 'HUN')).toEqual({ sorte: 'trouve', id: 'HUN' });
    expect(sur(x, 'HUN')).toEqual({ sorte: 'deja', id: 'HUN' });
    for (const v of x.reste) sur(x, v);
    expect([x.finie, x.juste, x.faute]).toEqual([true, true, null]);
  });

  it('une faute finit la question, fausse, et garde le pays touché (Evenement.reponse)', () => {
    const x = q();
    sur(x, 'HUN');
    expect(sur(x, 'POL')).toEqual({ sorte: 'faute', id: 'POL' });
    expect([x.finie, x.juste, x.faute, x.trouves]).toEqual([true, false, 'POL', ['HUN']]);
    // Finie : plus rien ne compte.
    expect(sur(x, 'BGR')).toEqual({ sorte: 'rien' });
  });

  it('un voisin non jouable (le Kosovo), un voisin par une zone admise (l’Albanie), le pays lui-même, la mer : ni demandés ni fautifs', () => {
    const x = q();
    expect(sur(x, 'XKX')).toEqual({ sorte: 'neutre', id: 'XKX' });
    expect(sur(x, 'ALB')).toEqual({ sorte: 'neutre', id: 'ALB' });
    expect(sur(x, 'SRB')).toEqual({ sorte: 'lui' });
    expect(sur(x, null)).toEqual({ sorte: 'rien' });
    expect([x.finie, x.faute, x.trouves]).toEqual([false, null, []]);
  });

  it('« Voir », « Passer », le temps écoulé : finie, fausse, les trouvés gardés', () => {
    const x = q();
    sur(x, 'HUN');
    x.arreter();
    expect([x.finie, x.juste, x.faute, x.trouves, x.reste.length]).toEqual([true, false, null, ['HUN'], 6]);
  });

  it('le délai (D607 a) : 4 s plus 2 s par voisin ; la Serbie 18 s', () => {
    expect(delaiVoisins(q().aTrouver.length)).toBe(18_000);
  });
});

/** Une vraie carte du monde (384 × 723, zoom 30), le doigt au centre, centrée sur `ll`. */
function carteEn(ll: [number, number]) {
  const L = 384;
  const H = 723;
  const proj: GeoProjection = creerProjection('monde', L, H);
  const k = 30;
  const b = proj(ll) as [number, number];
  const t: Transfo = { k, x: L / 2 - k * b[0], y: H / 2 - k * b[1] };
  const ctx: ContexteCarte = { proj, t, entites: monde.entites, pastilles: calculerPastilles(monde.entites, proj, k), acceptes: acceptesDe(monde) };
  const marques: string[] = [];
  const carte = {
    noter: (c: string, x: number, y: number, o?: OptionsNoter) => noter(ctx, c, x, y, o),
    pick: (x: number, y: number) => pick(ctx, x, y),
    marquer: (id: string, c: string) => void marques.push(`${id}:${c}`),
    anneau: (id: string, c: string) => void marques.push(`anneau ${id}:${c}`),
    effacerMarques: () => void (marques.length = 0),
    montrer: () => {},
  };
  return { carte, marques, x: L / 2, y: H / 2 };
}
const point = (id: string) => PAYS.find((p) => p.id === id)!.point;
const crimee = CONTESTEES.find((c) => c.id === 'NE_B89')!.point;

describe('la question sur la carte (vues/voisins.ts)', () => {
  const M = () => voisinsCharges()!;
  const poser = (id: string, ll: [number, number]) => {
    const c = carteEn(ll);
    const q = M().question({ carte: c.carte as never, donnees: monde }, id, rendu('voisins', monde));
    q.poser(500);
    return { ...c, q, toucher: () => q.toucher(c.x, c.y) };
  };

  it('« Touche les 7 voisins de : Hongrie », la Hongrie allumée ; un voisin touché se marque, la rétroaction le nomme avec le compte', () => {
    const v = poser('HUN', point('AUT'));
    expect(v.q.enonce()).toEqual({ invite: remplir(T.enonce, { n: 7 }), objet: { texte: 'Hongrie' } });
    expect(v.q.delai_ms).toBe(18_000);
    const r = v.toucher();
    expect(r).toMatchObject({ fin: false, juste: false, classe: 'juste', texte: `Juste : Autriche · ${remplir(T.compte, { n: 1, total: 7 })}` });
    expect(v.marques).toEqual(['HUN:choisi', 'AUT:juste']);
    expect(v.toucher().texte).toBe(`Autriche : déjà trouvé · ${remplir(T.compte, { n: 1, total: 7 })}`);
  });

  it('un toucher en Crimée compte pour l’Ukraine (zone admise), même dans la question de la Russie qui la tient', () => {
    const v = poser('RUS', crimee);
    const r = v.toucher();
    expect(r.classe).toBe('juste');
    expect(r.texte).toContain('Juste : Ukraine (zone contestée, tenue par la Russie)');
    expect(v.marques).toContain('UKR:juste');
  });

  it('la Serbie : le Kosovo ne compte ni pour ni contre ; l’Albanie (par le Kosovo) non plus ; une faute nomme les manqués, puis les neutres à part', () => {
    const v = poser('SRB', point('XKX'));
    expect(v.toucher()).toMatchObject({ fin: false, classe: '', texte: `Serbie : c'est le pays demandé · ${remplir(T.compte, { n: 0, total: 7 })}` });
    const alb = poser('SRB', point('ALB'));
    expect(alb.toucher()).toMatchObject({ fin: false, classe: '', texte: `Albanie (par une zone contestée) : ne compte ni pour ni contre · ${remplir(T.compte, { n: 0, total: 7 })}` });
    const pol = poser('SRB', point('POL'));
    const r = pol.toucher();
    expect(r).toMatchObject({ fin: true, juste: false, classe: 'faux' });
    expect(r.texte).toBe(
      `Faux : Pologne, pas un voisin de la Serbie · il manquait : Bosnie-Herzégovine, Bulgarie, Croatie, Hongrie, Macédoine du Nord, Monténégro, Roumanie · aussi : Albanie (par une zone contestée), Kosovo (paquet optionnel)`,
    );
    // La faute en rouge, les manqués en vert et cernés (pas la couleur seule).
    expect(pol.marques).toContain('POL:faux');
    expect(pol.marques).toContain('HUN:juste');
    expect(pol.marques).toContain('anneau HUN:juste');
    expect(pol.q.faute).toBe('POL');
    expect(pol.q.detail()).toBe(remplir(T.bilan_faute, { compte: remplir(T.compte, { n: 0, total: 7 }), nom: 'Pologne' }));
  });

  it('le Monténégro : un toucher au Kosovo compte pour la Serbie (sa zone admise) ; le temps écoulé montre ce qui manquait', () => {
    const v = poser('MNE', point('XKX'));
    expect(v.toucher()).toMatchObject({ classe: 'juste' });
    expect(v.q.finie).toBe(false);
    const fin = v.q.arreter(true);
    expect(fin.startsWith(`Temps écoulé · ${remplir(T.compte, { n: 1, total: V.voisins('MNE').length })} · il manquait : `)).toBe(true);
    expect(v.q.finie).toBe(true);
  });

  it('le seul voisin : « Touche le seul voisin de : Portugal », puis « Juste : le seul voisin du Portugal »', () => {
    const v = poser('PRT', point('ESP'));
    expect(v.q.enonce().invite).toBe(T.enonce_un);
    expect(v.toucher()).toMatchObject({ fin: true, juste: true, classe: 'juste', texte: 'Juste : le seul voisin du Portugal' });
  });
});

describe('le rendu du sujet : Reconnaître par la liste écrite (D606 a)', () => {
  const r = () => rendu('voisins', monde);

  it('l’énoncé et la question : la liste, dans l’ordre alphabétique, jamais le pays ; la rétroaction et le bilan le nomment', () => {
    expect(r().enonce('HUN')).toEqual({ invite: T.liste, objet: { texte: 'Autriche, Croatie, Roumanie, Serbie, Slovaquie, Slovénie, Ukraine' }, deuxLignes: true });
    expect(r().enonce('PRT')).toEqual({ invite: T.liste_un, objet: { texte: 'Espagne' }, deuxLignes: true });
    expect(r().question('HUN')).toEqual({ texte: 'Autriche, Croatie, Roumanie, Serbie, Slovaquie, Slovénie, Ukraine' });
    expect(JSON.stringify(r().enonce('HUN'))).not.toContain('Hongrie');
    expect([r().retro('HUN'), r().nomBilan('HUN', 'nommer'), r().lieu('HUN'), r().consigneQcm('HUN')]).toEqual(['Hongrie', 'Hongrie', 'Hongrie', T.qcm]);
    expect(r().consigneQcm('PRT')).toBe(T.qcm_un);
  });

  it('les ambigus : justes tous les deux (une zone de sorte « voisins »), jamais leurres l’un de l’autre ; ni un voisin de la liste en leurre', () => {
    expect(r().admisEnPlus('ARE')).toEqual({ zones: ['YEM'], sorte: 'voisins' });
    expect(r().admisEnPlus('HUN')).toBeNull();
    expect([...r().qcmExclus('ARE')].sort()).toEqual(['OMN', 'SAU', 'YEM']);
    expect(r().qcmPareils('SMR', 'VAT')).toBe(true);
    expect(texteAdmis(r(), 'ARE', { zone: 'YEM', tenant: 'YEM', sorte: 'voisins' })).toBe(' (mêmes voisins que le Yémen)');
    // noter, avec les zones du sujet : un toucher au Yémen est juste pour les Émirats, qui le dit.
    const c = carteEn(point('YEM'));
    const o = optionsNoter(r(), { donnees: monde }, 'ARE');
    expect(c.carte.noter('ARE', c.x, c.y, o)).toMatchObject({ juste: true, admis: { zone: 'YEM', sorte: 'voisins' } });
    expect(c.carte.noter('ARE', c.x, c.y)).toMatchObject({ juste: false });
  });

  it('le délai de chaque pays : celui de son nombre de voisins', () => {
    expect(['PRT', 'HUN', 'CHN'].map((id) => voisinsCharges()!.delai({ donnees: monde }, id))).toEqual([6_000, 18_000, 32_000]);
    expect(formePays('PRT', 'de')).toBe('du Portugal');
  });
});

describe('séance : Apprendre Voisins (§ 3.4, § 7.5)', () => {
  async function monterSeance() {
    const h = { ts: Date.UTC(2026, 10, 9, 8) };
    let n = 0;
    const memoire = ouvrirMemoire({
      depot: depotMemoire(),
      appareil: '00000000-0000-4000-8000-00000000a001',
      horloge: () => ({ ts: h.ts, tz: 240 }),
      nouvelId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    });
    await memoire.pret;
    return { h, memoire, seances: creerSeances({ memoire, monde }) };
  }

  it('Apprendre en Europe : une grappe sans pays sans voisin (ni l’Islande, ni Malte) ; QCM sur la liste, puis le rappel à plusieurs touchers ; écrits voisins:', async () => {
    const { memoire, seances } = await monterSeance();
    const europe = creerArbre(catalogue(PAYS)).serie('voisins', 'Europe')!;
    expect(europe.ids).not.toContain('ISL');
    const p = seances.ouvrir({ sorte: 'apprendre', sujet: 'voisins', serie: europe });
    if (!('question' in p)) throw new Error(`refus : ${p.refus}`);
    const vus: string[] = [];
    for (let k = 0; k < 60; k++) {
      const q = p.question();
      if (!q) break;
      expect(q.domaine).toBe('voisins');
      vus.push(`${q.forme}:${q.id}`);
      p.repondre({ id: q.id, sens: q.forme === 'qcm' ? 'nommer' : 'localiser', correct: true, aide: null, reponse: null, via: null, zoom: 2, distance_km: null, duree_ms: 1000 });
    }
    const ids = [...new Set(vus.map((x) => x.split(':')[1]!))];
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids.every(aVoisins)).toBe(true);
    expect(vus.filter((x) => x.startsWith('qcm:'))).toHaveLength(ids.length);
    expect(vus.filter((x) => x.startsWith('voisins:'))).toHaveLength(ids.length);
    const fiches = (await memoire.tous()).map((e) => (e.type === 'reponse' ? e.fiche : ''));
    expect(fiches.every((f) => f.startsWith('voisins:'))).toBe(true);
  });

  it('le morceau pas chargé : besoins() le demande, charger() le charge, et Apprendre attend', async () => {
    poserVoisins(null);
    try {
      const { seances } = await monterSeance();
      const d = { sorte: 'apprendre' as const, sujet: 'voisins', serie: creerArbre(catalogue(PAYS)).serie('voisins', 'Africa')! };
      expect(seances.besoins(d)).toEqual(['voisins']);
      expect('refus' in seances.ouvrir(d)).toBe(true);
      await seances.charger!(d);
      expect(voisinsCharges()).not.toBeNull();
      expect(seances.charger!(d)).toBeNull();
      expect('question' in seances.ouvrir(d)).toBe(true);
    } finally {
      poserVoisins(morceau, { texteAdmis, estPetite: () => false, statuts: LIBELLE_STATUT });
    }
  });
});
