// Lecture des lots en ligne et union (src/sync/envoi.ts, J1b lot 4 ; étude
// § 5.3) avec un faux serveur qui sait lister (par `fin`, puis id) et la
// vraie mémoire de l'appareil (Memoire.fusionner) : restauration par pages,
// lecture incrémentale depuis la marque moins 5 min, lot illisible gardé
// dans `a_relire` puis relu à la version suivante, contrôle au démarrage,
// lecture différée pendant une séance, union ratée (rien de marqué), lots en
// attente sans doublon après une lecture, effacement de l'appareil.
import { describe, expect, it, vi } from 'vitest';
import { depotMemoire, ErreurDepot, type Depot } from '../src/journal/depot';
import { ouvrirMemoire, type Memoire } from '../src/journal/memoire';
import type { Evenement } from '../src/srs/journal';
import { etat as rejouer } from '../src/srs/rejeu';
import { depotARelireMemoire, depotLotsMemoire, type DepotARelire, type DepotLots } from '../src/sync/depot-lots';
import { BORD_FIN, creerEnvoi, PAGE_LECTURE, type Marques, type Serveur } from '../src/sync/envoi';
import { composer, decoderId, deplier, docDuLot, idsDuLot, type DocLot } from '../src/sync/lots';

const UID = 'uid-ana';
const A = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const B = '7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const err = (code: string) => Object.assign(new Error(`Firebase: ${code}`), { code });
const T0 = Date.UTC(2026, 10, 7, 8, 0, 0);

let k = 0;
const uuid = () => `${(++k).toString(16).padStart(8, '0')}-3333-4333-8444-${(k * 7919).toString(16).padStart(12, '0')}`;
function evt(appareil: string, seance: string | null, ts: number, o: Partial<Evenement> = {}): Evenement {
  return { v: 1, id: uuid(), appareil, ts, tz: 240, seance, type: 'reponse', fiche: 'pays:FRA:localiser', mode: 'revision', reponse: null, via: 'trace', zoom: 1, correct: true, aide: null, duree_ms: 2000, distance_km: null, note: 3, ...o };
}

/** Un serveur en création seule qui sait lister par `fin` croissante (puis id), avec une horloge à lui. */
function fauxServeur() {
  const docs = new Map<string, Record<string, unknown> & { fin: number }>();
  const s = {
    docs,
    t: T0,
    hors: false,
    listeRefusee: false,
    listes: 0,
    creer: vi.fn(async (uid: string, lot: string, doc: object) => {
      if (s.hors) throw new TypeError('fetch failed');
      const cle = `${uid}/${lot}`;
      if (docs.has(cle)) throw err('permission-denied');
      docs.set(cle, { ...(doc as Record<string, unknown>), fin: s.t++ });
    }),
    lire: vi.fn(async (uid: string, lot: string) => {
      if (s.hors) throw new TypeError('fetch failed');
      return docs.get(`${uid}/${lot}`) ?? null;
    }),
    lister: vi.fn(async (uid: string, o: { depuis: number | null; apres: unknown; n: number }): Promise<{ lots: { id: string; fin: number; doc: Record<string, unknown> }[]; suite: number | null }> => {
      if (s.hors) throw new TypeError('fetch failed');
      if (s.listeRefusee) throw err('permission-denied');
      s.listes++;
      const tous = [...docs.entries()]
        .filter(([cle]) => cle.startsWith(`${uid}/`))
        .map(([cle, d]) => ({ id: cle.slice(uid.length + 1), fin: d.fin, doc: Object.fromEntries(Object.entries(d).filter(([c]) => c !== 'fin')) }))
        .filter((l) => o.depuis === null || l.fin > o.depuis)
        .sort((a, b) => a.fin - b.fin || (a.id < b.id ? -1 : 1));
      const debut = o.apres === null ? 0 : (o.apres as number);
      const lots = tous.slice(debut, debut + o.n);
      return { lots, suite: lots.length === o.n ? debut + o.n : null };
    }),
    /** Écrit un lot d'un autre appareil directement en ligne. */
    poser(uid: string, evts: Evenement[], fin?: number): void {
      const f = fin ?? s.t++;
      for (const l of composer(evts)) docs.set(`${uid}/${l.id}`, { ...docDuLot(l), fin: f });
    },
    ids: (): string[] => [...docs.values()].flatMap((d) => idsDuLot(d as { evenements?: unknown })),
  };
  return s;
}

function appareil(o: { serveur: ReturnType<typeof fauxServeur>; depot?: Depot; lots?: DepotLots; aRelire?: DepotARelire; marques?: Marques; version?: string; deplier?: (d: Record<string, unknown>) => ReturnType<typeof deplier>; id?: string }) {
  const depot = o.depot ?? depotMemoire();
  const memoire: Memoire = ouvrirMemoire({ depot, appareil: o.id ?? A, horloge: () => ({ ts: T0, tz: 240 }), auRepos: (f) => f() });
  const lots = o.lots ?? depotLotsMemoire();
  const aRelire = o.aRelire ?? depotARelireMemoire();
  const marquesM = new Map<string, number>();
  const marques: Marques = o.marques ?? { lire: async (u) => marquesM.get(u) ?? null, poser: async (u, m) => void marquesM.set(u, m) };
  const envoi = creerEnvoi({
    journal: { tous: () => memoire.tous(), attendre: () => memoire.ecrire([]), seanceEnCours: () => memoire.seanceEnCours(), fusionner: (e) => memoire.fusionner(e) },
    lots,
    aRelire,
    marques,
    version: o.version ?? 'v1',
    compte: async () => ({ uid: UID, serveur: o.serveur as Serveur }),
    coupee: () => false,
    maintenant: () => T0,
    verrou: (f) => f(),
    minuterie: { poser: () => 0, retirer: () => undefined },
    delais: { requete: 200, compte: 200 },
    ...(o.deplier ? { deplier: o.deplier } : {}),
  });
  return { memoire, depot, lots, aRelire, marques, marquesM, envoi };
}

/**
 * Le vrai deplier d'une version d'avant le J2 : le même code (src/sync/lots.ts,
 * valider de src/srs/journal.ts), rechargé avec les seuls domaines qu'elle
 * lisait, pays et communes (src/srs/fiches.ts au commit dc16531).
 */
async function deplierAvantJ2(): Promise<typeof deplier> {
  vi.resetModules();
  vi.doMock('../src/srs/fiches', async (original) => {
    const f = await original<typeof import('../src/srs/fiches')>();
    const lus: readonly string[] = ['pays', 'communes'];
    return { ...f, DOMAINES: lus, estDomaine: (x: string) => lus.includes(x), analyser: (x: string) => (lus.includes(x.split(':')[0] ?? '') ? f.analyser(x) : null) };
  });
  try {
    return (await import('../src/sync/lots')).deplier;
  } finally {
    vi.doUnmock('../src/srs/fiches');
    vi.resetModules();
  }
}

/**
 * Le deplier d'une version d'avant le socle commun des J4, J5 et J6, gardé en
 * copie (src/sync/lots.ts au commit ed91d8c : v1 seule, neuf champs
 * facultatifs), avec le valider de src/srs/journal.ts rechargé sur les seuls
 * domaines du J2 (src/srs/fiches.ts au même commit). Une copie, pas le code
 * du jour : elle ne suit pas les versions suivantes.
 */
async function deplierAvantSocle(): Promise<(doc: Record<string, unknown>) => ReturnType<typeof deplier>> {
  vi.resetModules();
  vi.doMock('../src/srs/fiches', async (original) => {
    const f = await original<typeof import('../src/srs/fiches')>();
    const lus: readonly string[] = ['pays', 'communes', 'capitales', 'drapeaux', 'mers'];
    return { ...f, DOMAINES: lus, estDomaine: (x: string) => lus.includes(x), analyser: (x: string) => (lus.includes(x.split(':')[0] ?? '') ? f.analyser(x) : null) };
  });
  let valider: (e: unknown) => boolean;
  try {
    const j = await import('../src/srs/journal');
    // Le journal d'avant ne connaissait pas `estime` : champ inconnu.
    valider = (e) => !('estime' in (e as object)) && j.valider(e);
  } finally {
    vi.doUnmock('../src/srs/fiches');
    vi.resetModules();
  }
  const TYPES = ['reponse', 'connu', 'reinitialiser'];
  const MODES = ['qcm', 'rappel', 'revision', 'libre'];
  const VIAS = ['trace', 'pastille', 'proche'];
  const AIDES = ['voir', 'passer', 'connu'];
  const FACULTATIFS = ['mode', 'reponse', 'via', 'zoom', 'correct', 'aide', 'duree_ms', 'distance_km', 'note'] as const;
  const rang = (liste: readonly string[]) => (x: unknown) => (x === null ? null : Number.isInteger(x) && (x as number) >= 0 && (x as number) < liste.length ? liste[x as number] : undefined);
  const tel = (x: unknown) => x;
  const DECODE: Record<(typeof FACULTATIFS)[number], (x: unknown) => unknown> = {
    mode: (x) => (x === null ? undefined : rang(MODES)(x)),
    reponse: tel,
    via: rang(VIAS),
    zoom: tel,
    correct: (x) => (x === 1 ? true : x === 0 ? false : undefined),
    aide: rang(AIDES),
    duree_ms: tel,
    distance_km: tel,
    note: tel,
  };
  return (doc) => {
    if (doc.v !== 1) return { ok: false, probleme: `version ${String(doc.v)}` };
    if (typeof doc.evenements !== 'string') return { ok: false, probleme: 'evenements' };
    let cartes: unknown;
    try {
      cartes = JSON.parse(doc.evenements);
    } catch {
      return { ok: false, probleme: 'evenements illisibles' };
    }
    if (!Array.isArray(cartes) || cartes.length !== doc.n) return { ok: false, probleme: 'n' };
    const evenements: Evenement[] = [];
    let t0 = 0;
    for (const [i, c] of cartes.entries()) {
      if (!Array.isArray(c) || c.length < 6) return { ok: false, probleme: `carte ${i}` };
      const [idc, t, tz, type, fiche, masque, ...valeurs] = c as unknown[];
      const id = decoderId(idc);
      if (!id || !Number.isSafeInteger(t) || !Number.isSafeInteger(masque) || (masque as number) < 0 || (masque as number) >= 1 << FACULTATIFS.length) return { ok: false, probleme: `carte ${i}` };
      if (i === 0) t0 = t as number;
      const e: Record<string, unknown> = { v: 1, id, appareil: doc.appareil, ts: i === 0 ? t : t0 + (t as number), tz, seance: doc.seance, type: Number.isInteger(type) ? TYPES[type as number] : undefined, fiche };
      let j = 0;
      for (const [b, k] of FACULTATIFS.entries()) {
        if (!((masque as number) & (1 << b))) continue;
        if (j >= valeurs.length) return { ok: false, probleme: `carte ${i} : ${k} manquant` };
        const x = DECODE[k](valeurs[j++]);
        if (x === undefined) return { ok: false, probleme: `carte ${i} : ${k}` };
        e[k] = x;
      }
      if (j !== valeurs.length) return { ok: false, probleme: `carte ${i} : valeurs en trop` };
      if (!valider(e)) return { ok: false, probleme: `carte ${i} refusée` };
      evenements.push(e as unknown as Evenement);
    }
    return { ok: true, evenements };
  };
}

async function coherent(m: Memoire, depot: Depot) {
  expect(new Map(m.etat())).toEqual(rejouer(await depot.tous()));
}

describe('lecture des lots et union', () => {
  it('restauration complète par pages : tout le compte au journal, fiches en ligne, marque au dernier `fin`', async () => {
    const s = fauxServeur();
    const seances = Array.from({ length: PAGE_LECTURE + 30 }, () => uuid());
    const evts = seances.map((se, i) => evt(B, se, T0 - 10 * 86_400_000 + i * 60_000, { fiche: i % 2 ? 'pays:FRA:localiser' : 'pays:ITA:nommer' }));
    s.poser(UID, evts);
    const a = appareil({ serveur: s });
    await a.memoire.pret;
    const r = await a.envoi.declencher('connexion');
    expect(r.lecture).toMatchObject({ mode: 'complete', lots: PAGE_LECTURE + 30, evenements: PAGE_LECTURE + 30, illisibles: 0, arret: null });
    expect(s.listes).toBe(2);
    expect((await a.memoire.tous()).length).toBe(PAGE_LECTURE + 30);
    expect((await a.lots.tous(UID)).every((f) => f.etat === 'en_ligne')).toBe(true);
    // Rien n'est renvoyé : tout est déjà en ligne.
    expect(s.creer).not.toHaveBeenCalled();
    expect(a.marquesM.get(UID)).toBe(Math.max(...[...s.docs.values()].map((d) => d.fin)));
    await coherent(a.memoire, a.depot);
  });

  it('lecture incrémentale : depuis la marque moins 5 min, les doublons sans effet', async () => {
    const s = fauxServeur();
    s.poser(UID, [evt(B, uuid(), T0 - 86_400_000)]);
    const a = appareil({ serveur: s });
    await a.envoi.declencher('connexion');
    const marque = a.marquesM.get(UID)!;
    s.poser(UID, [evt(B, uuid(), T0 - 3_600_000)], marque + 1);
    const r = await a.envoi.declencher('ouverture');
    expect(s.lister).toHaveBeenLastCalledWith(UID, expect.objectContaining({ depuis: marque - BORD_FIN }));
    expect(r.lecture).toMatchObject({ mode: 'incrementale', lots: 2, evenements: 2 });
    expect((await a.memoire.tous()).length).toBe(2);
    expect(a.marquesM.get(UID)).toBe(marque + 1);
    await coherent(a.memoire, a.depot);
  });

  it('les événements de l’appareil partent, ceux lus en ligne jamais : aucun doublon', async () => {
    const s = fauxServeur();
    s.poser(UID, [evt(B, uuid(), T0 - 86_400_000)]);
    const a = appareil({ serveur: s });
    await a.memoire.ecrire([evt(A, uuid(), T0 - 3_600_000)]);
    a.memoire.clore();
    await a.envoi.declencher('connexion');
    expect(s.creer).toHaveBeenCalledTimes(1);
    const ids = s.ids();
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set((await a.memoire.tous()).map((e) => e.id)));
    await a.envoi.declencher('ouverture');
    expect(s.creer).toHaveBeenCalledTimes(1);
  });

  it('lot illisible pour cette version : gardé brut dans `a_relire`, compté, puis relu sans réseau à la version suivante', async () => {
    const s = fauxServeur();
    const se = uuid();
    const nouveau = evt(B, se, T0 - 86_400_000, { fiche: 'pays:DEU:localiser' });
    s.poser(UID, [nouveau, evt(B, se, T0 - 86_400_000 + 1)]);
    s.poser(UID, [evt(B, uuid(), T0 - 2 * 86_400_000)]);
    const aRelire = depotARelireMemoire();
    const lots = depotLotsMemoire();
    const depot = depotMemoire();
    // L'ancienne version ne connaît pas la fiche DEU (comme un mode ou un champ venu après elle).
    const ancien = (d: Record<string, unknown>) => (String(d.evenements).includes('DEU') ? { ok: false as const, probleme: 'fiche inconnue' } : deplier(d as unknown as DocLot));
    const v1 = appareil({ serveur: s, depot, lots, aRelire, deplier: ancien });
    const r = await v1.envoi.declencher('connexion');
    expect(r.lecture).toMatchObject({ lots: 2, illisibles: 1 });
    expect(await v1.envoi.etat(UID)).toMatchObject({ aRelire: 2 });
    expect((await aRelire.tous(UID)).map((f) => f.version)).toEqual(['v1']);
    // La même version ne le relit pas.
    await v1.envoi.declencher('cloture');
    expect((await aRelire.tous(UID)).length).toBe(1);
    v1.memoire.fermer();
    // « Mise à jour » : nouvelle version, sans réseau ; le lot est relu depuis l'appareil.
    s.hors = true;
    const v2 = appareil({ serveur: s, depot, lots, aRelire, version: 'v2' });
    await v2.memoire.pret;
    const r2 = await v2.envoi.declencher('cloture');
    expect(r2.lecture).toMatchObject({ relus: 1 });
    expect(await aRelire.tous(UID)).toEqual([]);
    expect((await v2.memoire.tous()).map((e) => e.id)).toContain(nouveau.id);
    expect(v2.memoire.etat().has('pays:DEU:localiser')).toBe(true);
    expect(await v2.envoi.etat(UID)).toMatchObject({ aRelire: 0 });
    await coherent(v2.memoire, depot);
  });

  it('lot mixte d’une Révision du jour (pays et capitales) lu par un vrai deplier d’avant le J2 : illisible en entier, gardé, puis relu (étude J2 § 3.3)', async () => {
    const avant = await deplierAvantJ2();
    const s = fauxServeur();
    const se = uuid();
    const pays = evt(B, se, T0 - 86_400_000, { fiche: 'pays:DEU:localiser' });
    const capitale = evt(B, se, T0 - 86_400_000 + 1, { fiche: 'capitales:DEU:localiser' });
    s.poser(UID, [pays, capitale]);
    const seul = evt(B, uuid(), T0 - 2 * 86_400_000, { fiche: 'pays:FRA:localiser' });
    s.poser(UID, [seul]);
    // C'est bien la version d'avant : un lot de pays lui est lisible, le lot mixte non (sa carte de capitale est refusée).
    const docs = [...s.docs.values()].map((d) => d as unknown as DocLot);
    expect(docs.map((d) => avant(d))).toEqual([{ ok: false, probleme: 'carte 1 refusée' }, { ok: true, evenements: [seul] }]);
    expect(docs.map((d) => deplier(d).ok)).toEqual([true, true]);
    const aRelire = depotARelireMemoire();
    const lots = depotLotsMemoire();
    const depot = depotMemoire();
    const v1 = appareil({ serveur: s, depot, lots, aRelire, deplier: (d) => avant(d as unknown as DocLot) });
    const r = await v1.envoi.declencher('connexion');
    expect(r.lecture).toMatchObject({ lots: 2, illisibles: 1 });
    // Le lot entier attend, pays compris : la mémoire des pays prend du retard, rien n'est perdu ni renvoyé.
    expect((await v1.memoire.tous()).map((e) => e.id)).toEqual([seul.id]);
    expect(v1.memoire.etat().has('pays:DEU:localiser')).toBe(false);
    expect(await v1.envoi.etat(UID)).toMatchObject({ aRelire: 2 });
    expect(s.creer).not.toHaveBeenCalled();
    v1.memoire.fermer();
    // Mise à jour vers une version qui lit les domaines du J2 (ce socle), sans réseau : relu depuis l'appareil.
    s.hors = true;
    const v2 = appareil({ serveur: s, depot, lots, aRelire, version: 'v2' });
    await v2.memoire.pret;
    const r2 = await v2.envoi.declencher('cloture');
    expect(r2.lecture).toMatchObject({ relus: 1 });
    expect(await aRelire.tous(UID)).toEqual([]);
    expect(new Set((await v2.memoire.tous()).map((e) => e.id))).toEqual(new Set([seul.id, pays.id, capitale.id]));
    expect(v2.memoire.etat().has('pays:DEU:localiser')).toBe(true);
    expect(v2.memoire.etat().has('capitales:DEU:localiser')).toBe(true);
    expect(s.creer).not.toHaveBeenCalled();
    await coherent(v2.memoire, depot);
  });

  it('un lot qui mêle pays: et fleuves: (domaine du J5, lu dès le socle commun) est lu en entier par cette version', async () => {
    const s = fauxServeur();
    const se = uuid();
    const pays = evt(B, se, T0 - 86_400_000, { fiche: 'pays:EGY:localiser' });
    const fleuve = evt(B, se, T0 - 86_400_000 + 1, { fiche: 'fleuves:nil:localiser', mode: 'libre', note: null });
    s.poser(UID, [pays, fleuve]);
    const a = appareil({ serveur: s });
    const r = await a.envoi.declencher('connexion');
    expect(r.lecture).toMatchObject({ lots: 1, evenements: 2, illisibles: 0 });
    expect(new Set((await a.memoire.tous()).map((e) => e.id))).toEqual(new Set([pays.id, fleuve.id]));
    expect(await a.envoi.etat(UID)).toMatchObject({ aRelire: 0 });
    await coherent(a.memoire, a.depot);
  });

  it('un APK d’avant le socle commun (copie de son deplier) : un lot v2 avec `estime` et un lot v1 avec une fiche voisins:, illisibles, gardés ; la nouvelle version les relit sans perte (étude J4, lot 0)', async () => {
    const avant = await deplierAvantSocle();
    const s = fauxServeur();
    const se1 = uuid();
    const se2 = uuid();
    const estime = evt(B, se1, T0 - 86_400_000, { fiche: 'habitants:NGA:localiser', mode: 'libre', note: null, via: null, zoom: null, correct: false, estime: 150_000_000 });
    const voisin = evt(B, se2, T0 - 86_400_000 + 5, { fiche: 'voisins:HUN:localiser', mode: 'libre', note: null });
    const pays = evt(B, se2, T0 - 86_400_000 + 6, { fiche: 'pays:HUN:localiser' });
    s.poser(UID, [estime]);
    s.poser(UID, [voisin, pays]);
    const seul = evt(B, uuid(), T0 - 2 * 86_400_000, { fiche: 'capitales:FRA:localiser' });
    s.poser(UID, [seul]);
    const docs = [...s.docs.values()].map((d) => d as unknown as DocLot);
    // Les documents : le lot à `estime` en v2, les autres en v1 (octet pour octet ceux d'avant).
    expect(docs.map((d) => d.v)).toEqual([2, 1, 1]);
    // C'est bien la version d'avant : elle lit le lot du J2, pas les deux autres.
    expect(docs.map((d) => avant(d as unknown as Record<string, unknown>))).toEqual([{ ok: false, probleme: 'version 2' }, { ok: false, probleme: 'carte 0 refusée' }, { ok: true, evenements: [seul] }]);
    expect(docs.map((d) => deplier(d).ok)).toEqual([true, true, true]);
    const aRelire = depotARelireMemoire();
    const lots = depotLotsMemoire();
    const depot = depotMemoire();
    const v1 = appareil({ serveur: s, depot, lots, aRelire, deplier: avant });
    const r = await v1.envoi.declencher('connexion');
    expect(r.lecture).toMatchObject({ lots: 3, illisibles: 2 });
    expect((await v1.memoire.tous()).map((e) => e.id)).toEqual([seul.id]);
    expect(await v1.envoi.etat(UID)).toMatchObject({ aRelire: 3 });
    expect(s.creer).not.toHaveBeenCalled();
    v1.memoire.fermer();
    // Mise à jour vers ce socle, sans réseau : relus depuis l'appareil, `estime` compris.
    s.hors = true;
    const v2 = appareil({ serveur: s, depot, lots, aRelire, version: 'v2' });
    await v2.memoire.pret;
    const r2 = await v2.envoi.declencher('cloture');
    expect(r2.lecture).toMatchObject({ relus: 2 });
    expect(await aRelire.tous(UID)).toEqual([]);
    const tous = await v2.memoire.tous();
    expect(new Set(tous.map((e) => e.id))).toEqual(new Set([seul.id, estime.id, voisin.id, pays.id]));
    expect(tous.find((e) => e.id === estime.id)?.estime).toBe(150_000_000);
    expect(v2.memoire.etat().has('pays:HUN:localiser')).toBe(true);
    expect(s.creer).not.toHaveBeenCalled();
    await coherent(v2.memoire, depot);
  });

  it('contrôle au démarrage : un id en ligne absent du journal fait tout relire', async () => {
    const s = fauxServeur();
    const lots = depotLotsMemoire();
    const a = appareil({ serveur: s, lots });
    await a.memoire.ecrire([evt(A, uuid(), T0 - 3_600_000)]);
    a.memoire.clore();
    await a.envoi.declencher('cloture');
    expect(s.creer).toHaveBeenCalledTimes(1);
    // Le journal est perdu (base vidée), la marque gardée : la lecture incrémentale ne le verrait pas.
    const b = appareil({ serveur: s, lots, marques: { lire: async () => T0 + 10_000, poser: async () => undefined } });
    const r = await b.envoi.declencher('ouverture');
    expect(r.lecture).toMatchObject({ mode: 'complete', lots: 1, evenements: 1 });
    expect((await b.memoire.tous()).length).toBe(1);
    expect(s.creer).toHaveBeenCalledTimes(1);
  });

  it('pendant une séance active : la lecture incrémentale attend la clôture', async () => {
    const s = fauxServeur();
    s.poser(UID, [evt(B, uuid(), T0 - 86_400_000)]);
    const a = appareil({ serveur: s });
    await a.envoi.declencher('connexion');
    s.poser(UID, [evt(B, uuid(), T0 - 3_600_000)]);
    const se = uuid();
    await a.memoire.ecrire([evt(A, se, T0)]);
    const listes = s.listes;
    const r = await a.envoi.declencher('premier_plan');
    expect(r.lecture).toBeNull();
    expect(s.listes).toBe(listes);
    expect(a.envoi.rapport().lectureDue).toBe('incrementale');
    a.memoire.clore();
    await a.envoi.declencher('cloture');
    expect(a.envoi.rapport().lectureDue).toBeNull();
    expect(s.listes).toBe(listes + 1);
    expect((await a.memoire.tous()).length).toBe(3);
    await coherent(a.memoire, a.depot);
  });

  it('union ratée (journal qui n’écrit pas) : rien n’est marqué en ligne, la marque n’avance pas, la passe suivante relit', async () => {
    const s = fauxServeur();
    s.poser(UID, [evt(B, uuid(), T0 - 86_400_000)]);
    const d = depotMemoire();
    let refuser = true;
    const depot: Depot = { tous: () => d.tous(), ajouter: (e) => (refuser ? Promise.reject(new ErreurDepot('quota', 'plein')) : d.ajouter(e)), vider: () => d.vider!() };
    const a = appareil({ serveur: s, depot });
    const r = await a.envoi.declencher('connexion');
    expect(r.lecture).toMatchObject({ arret: 'appareil', lots: 0 });
    expect(await a.lots.tous(UID)).toEqual([]);
    expect(a.marquesM.has(UID)).toBe(false);
    expect(a.envoi.rapport().lectureDue).toBe('incrementale');
    refuser = false;
    const r2 = await a.envoi.declencher('cloture');
    expect(r2.lecture).toMatchObject({ lots: 1, arret: null });
    expect((await d.tous()).length).toBe(1);
  });

  it('hors ligne : la lecture attend, sans rien marquer ; refus des règles : rien, et pas de relecture à chaque passe', async () => {
    const s = fauxServeur();
    s.poser(UID, [evt(B, uuid(), T0 - 86_400_000)]);
    const a = appareil({ serveur: s });
    s.hors = true;
    const r = await a.envoi.declencher('connexion');
    expect(r.lecture).toMatchObject({ arret: 'reseau' });
    expect(a.envoi.rapport()).toMatchObject({ horsLigne: true, lectureDue: 'incrementale' });
    s.hors = false;
    s.listeRefusee = true;
    const r2 = await a.envoi.declencher('reseau');
    expect(r2.lecture).toMatchObject({ arret: 'refus' });
    expect(a.envoi.rapport().lectureDue).toBeNull();
    const listes = s.listes;
    await a.envoi.declencher('cloture');
    expect(s.listes).toBe(listes);
  });

  it('un lot en attente dont une partie est lue en ligne : seul son reste part (état perdu, puis restauration)', async () => {
    const s = fauxServeur();
    const se = uuid();
    const e = [evt(A, se, T0 - 3000), evt(A, se, T0 - 2000), evt(A, se, T0 - 1000)];
    // En ligne : les deux premiers, envoyés par une page d'avant dont l'état d'envoi est perdu.
    s.poser(UID, e.slice(0, 2));
    const a = appareil({ serveur: s });
    await a.memoire.ecrire(e);
    a.memoire.clore();
    // Composé en un lot de trois avant toute lecture (ouverture hors ligne), puis la lecture.
    s.hors = true;
    await a.envoi.declencher('cloture');
    s.hors = false;
    await a.envoi.declencher('connexion');
    const ids = s.ids();
    expect(ids.sort()).toEqual(e.map((x) => x.id).sort());
  });

  it('un lot en attente dont des ids sont en ligne sous un autre lot : son reste seulement part, sans doublon', async () => {
    const s = fauxServeur();
    const se = uuid();
    const e = [evt(A, se, T0 - 3000), evt(A, se, T0 - 2000), evt(A, se, T0 - 1000)];
    // En ligne sous l'id de e[1] : les deux derniers (une autre page les avait envoyés à part).
    s.poser(UID, e.slice(1));
    const a = appareil({ serveur: s });
    await a.memoire.ecrire(e);
    a.memoire.clore();
    s.hors = true;
    await a.envoi.declencher('cloture');
    expect((await a.lots.tous(UID)).map((f) => f.ids.length)).toEqual([3]);
    s.hors = false;
    await a.envoi.declencher('connexion');
    const ids = s.ids();
    expect(ids.sort()).toEqual(e.map((x) => x.id).sort());
    expect(s.docs.size).toBe(2);
  });

  it('effacer : le journal vidé d’abord, puis l’état d’envoi et les lots à relire du compte', async () => {
    const s = fauxServeur();
    s.poser(UID, [evt(B, uuid(), T0 - 86_400_000)]);
    const aRelire = depotARelireMemoire([{ uid: UID, id: 'x', fin: 1, doc: {}, version: 'v1', probleme: 'p' }, { uid: 'autre', id: 'y', fin: 1, doc: {}, version: 'v1', probleme: 'p' }]);
    const a = appareil({ serveur: s, aRelire });
    await a.envoi.declencher('connexion');
    expect((await a.lots.tous(UID)).length).toBe(1);
    await a.envoi.effacer([UID], () => a.memoire.effacer());
    expect(await a.memoire.tous()).toEqual([]);
    expect(await a.lots.tous(UID)).toEqual([]);
    expect(await aRelire.tous(UID)).toEqual([]);
    expect((await aRelire.tous('autre')).length).toBe(1);
    await expect(a.envoi.effacer([UID], () => Promise.reject(new Error('non')))).rejects.toThrow('non');
  });

  it('(P4) le contrôle de l’ouverture, différé par une séance active, se fait à la passe qui lit', async () => {
    const s = fauxServeur();
    const lots = depotLotsMemoire();
    const a = appareil({ serveur: s, lots });
    await a.memoire.ecrire([evt(A, uuid(), T0 - 3_600_000)]);
    a.memoire.clore();
    await a.envoi.declencher('cloture');
    // Journal perdu, marque gardée ; à l'ouverture, une séance est déjà en cours.
    const b = appareil({ serveur: s, lots, marques: { lire: async () => T0 + 10_000, poser: async () => undefined } });
    await b.memoire.ecrire([evt(A, uuid(), T0)]);
    const r = await b.envoi.declencher('ouverture');
    expect(r.lecture).toBeNull();
    b.memoire.clore();
    const r2 = await b.envoi.declencher('cloture');
    expect(r2.lecture).toMatchObject({ mode: 'complete', lots: 1 });
  });

  it('(P1) compter : un lot en attente dont les événements manquent à la lecture du journal compte quand même', async () => {
    const s = fauxServeur();
    const a = appareil({ serveur: s });
    await a.memoire.ecrire([evt(A, uuid(), T0 - 3000)]);
    a.memoire.clore();
    s.hors = true;
    await a.envoi.declencher('cloture');
    expect((await a.envoi.compter(UID)).nonEnvoyees).toBe(1);
    await a.memoire.effacer();
    expect((await a.envoi.compter(UID)).nonEnvoyees).toBe(1);
  });

  it('(T5) des déclencheurs fondus dans une passe en file : la lecture et le contrôle de chacun y sont', async () => {
    const s = fauxServeur();
    s.poser(UID, [evt(B, uuid(), T0 - 86_400_000)]);
    const depot = depotMemoire();
    const memoire = ouvrirMemoire({ depot, appareil: A, horloge: () => ({ ts: T0, tz: 240 }), auRepos: (f) => f() });
    let bloque: (() => void) | null = null;
    let premier = true;
    const lots = depotLotsMemoire([{ uid: UID, id: 'perdu', seance: null, appareil: A, ids: ['perdu'], etat: 'envoye', cause: null, essais: 0, prochain: 0, version: 'v1', doc: null }]);
    const envoi = creerEnvoi({
      journal: {
        tous: () => memoire.tous({ strict: true }),
        attendre: async () => {
          if (premier) {
            premier = false;
            await new Promise<void>((ok) => (bloque = ok));
          }
          await memoire.ecrire([]);
        },
        seanceEnCours: () => memoire.seanceEnCours(),
        fusionner: (e) => memoire.fusionner(e),
      },
      lots,
      aRelire: depotARelireMemoire(),
      marques: { lire: async () => T0 + 10_000, poser: async () => undefined },
      version: 'v1',
      compte: async () => ({ uid: UID, serveur: s as unknown as Serveur }),
      coupee: () => false,
      maintenant: () => T0,
      verrou: (f) => f(),
      minuterie: { poser: () => 0, retirer: () => undefined },
      delais: { requete: 200, compte: 200 },
    });
    const p1 = envoi.declencher('cloture');
    await vi.waitFor(() => expect(bloque).not.toBeNull());
    const p2 = envoi.declencher('fond');
    const p3 = envoi.declencher('ouverture');
    expect(p3).toBe(p2);
    bloque!();
    expect((await p1).lecture).toBeNull();
    // Le contrôle de l'ouverture fondue : un id en ligne manque au journal, tout est relu.
    expect((await p2).lecture).toMatchObject({ mode: 'complete', lots: 1 });
    memoire.fermer();
  });

  it('(T6) une version qui relit a_relire sans pouvoir écrire au journal garde le lot à relire', async () => {
    const s = fauxServeur();
    const se = uuid();
    s.poser(UID, [evt(B, se, T0 - 86_400_000, { fiche: 'pays:DEU:localiser' })]);
    const aRelire = depotARelireMemoire();
    const lots = depotLotsMemoire();
    const d = depotMemoire();
    let refuser = false;
    const depot: Depot = { tous: () => d.tous(), ajouter: (e) => (refuser ? Promise.reject(new ErreurDepot('quota', 'plein')) : d.ajouter(e)), vider: () => d.vider!() };
    const ancien = (x: Record<string, unknown>) => ({ ok: false as const, probleme: `illisible ${String(x.v)}` });
    const v1 = appareil({ serveur: s, depot, lots, aRelire, deplier: ancien });
    await v1.envoi.declencher('connexion');
    expect((await aRelire.tous(UID)).length).toBe(1);
    v1.memoire.fermer();
    refuser = true;
    const v2 = appareil({ serveur: s, depot, lots, aRelire, version: 'v2' });
    expect((await v2.envoi.declencher('cloture')).lecture?.relus ?? 0).toBe(0);
    expect((await aRelire.tous(UID)).length).toBe(1);
    refuser = false;
    expect((await v2.envoi.declencher('cloture')).lecture).toMatchObject({ relus: 1 });
    expect(await aRelire.tous(UID)).toEqual([]);
  });
});

