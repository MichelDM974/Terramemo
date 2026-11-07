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
import { composer, deplier, docDuLot, idsDuLot, type DocLot } from '../src/sync/lots';

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
});
