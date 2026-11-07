// Envoi des séances (src/sync/envoi.ts, J1b lot 3 ; étude § 5.2) avec un
// faux serveur (création seule, comme les règles) et des dépôts en mémoire :
// séance close et séance en cours, coupe par 200, renvoi sans doublon,
// recomposition sans perte après un état perdu, refus des règles relancé,
// réseau, quota, lot invalide, déclencheurs partagés. Le vrai Firestore et
// les vraies règles : tests/envoi.test.ts (émulateurs).
import { describe, expect, it, vi } from 'vitest';
import type { Evenement } from '../src/srs/journal';
import { depotLotsMemoire, type DepotLots, type FicheLot } from '../src/sync/depot-lots';
import { creerEnvoi, DELAIS_RESEAU, FOND_MIN, RELANCE_REGLES, type JournalEnvoi, type Serveur } from '../src/sync/envoi';
import { remiseQuota } from '../src/sync/erreurs';
import { idsDuLot } from '../src/sync/lots';

const UID = 'uid-ana';
const APPAREIL = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const S1 = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const S2 = '1a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const err = (code: string) => Object.assign(new Error(`Firebase: ${code}`), { code });

let k = 0;
const id = () => `${(++k).toString(16).padStart(8, '0')}-2222-4333-8444-${(k * 7919).toString(16).padStart(12, '0')}`;
function evt(seance: string | null, o: Partial<Evenement> = {}): Evenement {
  return { v: 1, id: id(), appareil: APPAREIL, ts: 1_762_500_000_000 + k * 1000, tz: 240, seance, type: 'reponse', fiche: 'pays:FRA:localiser', mode: 'revision', reponse: null, via: 'trace', zoom: 1, correct: true, aide: null, duree_ms: 2000, distance_km: null, note: 3, ...o };
}

/** Un serveur en création seule : un lot qui existe est refusé (permission-denied), comme par les règles. */
function fauxServeur() {
  const docs = new Map<string, Record<string, unknown>>();
  const s = {
    docs,
    creations: 0,
    /** Les règles acceptent-elles une création ? */
    accepte: true,
    /** Code de l'erreur de la prochaine création (réseau, quota…), tant qu'il est posé. */
    panne: null as string | null,
    lectureRefusee: false,
    creer: vi.fn(async (uid: string, lot: string, doc: object) => {
      if (s.panne !== null) throw err(s.panne);
      const cle = `${uid}/${lot}`;
      if (docs.has(cle) || !s.accepte) throw err('permission-denied');
      docs.set(cle, { ...doc, fin: Date.now() });
      s.creations++;
    }),
    lire: vi.fn(async (uid: string, lot: string) => {
      if (s.lectureRefusee) throw err('permission-denied');
      return docs.get(`${uid}/${lot}`) ?? null;
    }),
    /** Tous les ids en ligne, avec leurs doublons. */
    ids: () => [...docs.values()].flatMap((d) => idsDuLot(d)),
  };
  return s;
}

function fauxJournal(evts: Evenement[] = []) {
  const j = {
    evts,
    enCours: null as string | null,
    tous: vi.fn(async () => j.evts.map((e) => structuredClone(e))),
    attendre: vi.fn(async (): Promise<void> => undefined),
    seanceEnCours: () => j.enCours,
  };
  return j satisfies JournalEnvoi;
}

function monter(o: { journal?: ReturnType<typeof fauxJournal>; lots?: DepotLots; version?: string; compte?: boolean; coupee?: boolean; serveur?: ReturnType<typeof fauxServeur> } = {}) {
  const journal = o.journal ?? fauxJournal();
  const serveur = o.serveur ?? fauxServeur();
  const lots = o.lots ?? depotLotsMemoire();
  const horloge = { t: Date.UTC(2026, 10, 7, 8, 0, 0) };
  const minuteries: { f: () => void; ms: number }[] = [];
  const etat = { compte: o.compte ?? true, coupee: o.coupee ?? false };
  const envoi = creerEnvoi({
    journal,
    lots,
    version: o.version ?? 'v1',
    compte: async () => (etat.compte ? { uid: UID, serveur: serveur as Serveur } : null),
    coupee: () => etat.coupee,
    maintenant: () => horloge.t,
    verrou: (f) => f(),
    minuterie: { poser: (f, ms) => minuteries.push({ f, ms }) - 1, retirer: () => undefined },
  });
  return { envoi, journal, serveur, lots, horloge, minuteries, etat };
}

const fiches = async (lots: DepotLots) => (await lots.tous(UID)).sort((a, b) => (a.id < b.id ? -1 : 1));
const etats = async (lots: DepotLots) => (await fiches(lots)).map((f) => `${f.etat}${f.cause ? `:${f.cause}` : ''}`);

describe('envoi des séances', () => {
  it('rien pour un invité (anonyme compris) ni quand la synchro est coupée', async () => {
    const m = monter({ journal: fauxJournal([evt(S1)]), compte: false });
    expect((await m.envoi.declencher('ouverture')).etat).toBe('sans_compte');
    m.etat.compte = true;
    m.etat.coupee = true;
    expect((await m.envoi.declencher('ouverture')).etat).toBe('coupee');
    expect(m.serveur.creer).not.toHaveBeenCalled();
    expect(await m.lots.tous(UID)).toEqual([]);
  });

  it('une séance close part en un lot, l’id de son premier événement ; rien de plus à la passe suivante', async () => {
    const e = [evt(S1), evt(S1), evt(S2)];
    const m = monter({ journal: fauxJournal(e) });
    const r = await m.envoi.declencher('cloture');
    expect(r).toMatchObject({ etat: 'fait', composes: 2, envoyes: 2, arret: null });
    expect([...m.serveur.docs.keys()].sort()).toEqual([`${UID}/${e[0]!.id}`, `${UID}/${e[2]!.id}`].sort());
    expect(m.serveur.ids().sort()).toEqual(e.map((x) => x.id).sort());
    expect(await etats(m.lots)).toEqual(['envoye', 'envoye']);
    expect((await fiches(m.lots)).every((f) => f.doc === null)).toBe(true);
    // Le journal attendu (file d'écriture) avant de composer.
    expect(m.journal.attendre).toHaveBeenCalled();
    const r2 = await m.envoi.declencher('ouverture');
    expect(r2).toMatchObject({ composes: 0, envoyes: 0 });
    expect(m.serveur.creations).toBe(2);
  });

  it('la séance en cours ne part qu’en arrière-plan, au plus une fois toutes les 2 min ; reprise : un lot de plus', async () => {
    const j = fauxJournal([evt(S1), evt(S1)]);
    j.enCours = S1;
    const m = monter({ journal: j });
    await m.envoi.declencher('cloture');
    expect(m.serveur.creations).toBe(0);
    await m.envoi.declencher('fond');
    expect(m.serveur.creations).toBe(1);
    j.evts.push(evt(S1));
    m.horloge.t += FOND_MIN - 1;
    await m.envoi.declencher('fond');
    expect(m.serveur.creations).toBe(1);
    m.horloge.t += 1;
    await m.envoi.declencher('fond');
    expect(m.serveur.creations).toBe(2);
    expect(m.serveur.ids().sort()).toEqual(j.evts.map((x) => x.id).sort());
  });

  it('une séance de plus de 200 réponses : des lots de 200 au plus', async () => {
    const e = Array.from({ length: 450 }, () => evt(S1));
    const m = monter({ journal: fauxJournal(e) });
    await m.envoi.declencher('cloture');
    expect([...m.serveur.docs.values()].map((d) => d.n).sort()).toEqual([200, 200, 50]);
    expect(new Set(m.serveur.ids()).size).toBe(450);
  });

  it('renvoi d’un lot déjà accepté (réponse perdue) : trouvé en ligne, envoyé, aucun doublon', async () => {
    const e = [evt(S1), evt(S1)];
    const m = monter({ journal: fauxJournal(e) });
    await m.envoi.declencher('cloture');
    // L'appli tuée entre l'acceptation et l'écriture de la fiche : elle est encore à envoyer.
    const [f] = await fiches(m.lots);
    const perdue = depotLotsMemoire([{ ...f!, etat: 'a_envoyer', doc: { v: 1, appareil: APPAREIL, seance: S1, n: 2, evenements: m.serveur.docs.get(`${UID}/${f!.id}`)!.evenements as string } }]);
    const m2 = monter({ journal: fauxJournal(e), lots: perdue, serveur: m.serveur });
    const r = await m2.envoi.declencher('ouverture');
    expect(r).toMatchObject({ presents: 1, envoyes: 0, refuses: 0, composes: 0 });
    expect(m.serveur.creations).toBe(1);
    expect(await etats(perdue)).toEqual(['envoye']);
  });

  it('état de la synchro perdu, séance reprise après deux envois : recomposée sans perte ni doublon', async () => {
    const j = fauxJournal([evt(S1), evt(S1), evt(S1)]);
    const m = monter({ journal: j });
    await m.envoi.declencher('cloture');
    j.evts.push(evt(S1), evt(S1));
    await m.envoi.declencher('cloture');
    expect(m.serveur.creations).toBe(2);
    // terramemo-synchro effacée ; la séance reprend encore.
    j.evts.push(evt(S1));
    const vide = depotLotsMemoire();
    const m2 = monter({ journal: j, lots: vide, serveur: m.serveur });
    const r = await m2.envoi.declencher('ouverture');
    expect(r).toMatchObject({ presents: 2, envoyes: 1 });
    expect(m.serveur.creations).toBe(3);
    const enLigne = m.serveur.ids();
    expect(enLigne.length).toBe(new Set(enLigne).size);
    expect(enLigne.sort()).toEqual(j.evts.map((x) => x.id).sort());
    expect((await m2.envoi.compter(UID)).horsLots).toBe(0);
  });

  it('refusé par les règles (lot absent) : gardé, relancé au jeton, à « Réessayer », à une nouvelle version, une fois par jour', async () => {
    const j = fauxJournal([evt(S1)]);
    const m = monter({ journal: j });
    m.serveur.accepte = false;
    const r = await m.envoi.declencher('cloture');
    expect(r).toMatchObject({ refuses: 1, envoyes: 0 });
    expect(await etats(m.lots)).toEqual(['refuse:regles']);
    expect((await fiches(m.lots))[0]!.doc).not.toBeNull();
    expect(await m.envoi.etat(UID)).toMatchObject({ refusees: 1, attente: 0 });
    // Les déclencheurs ordinaires ne le relancent pas.
    await m.envoi.declencher('cloture');
    await m.envoi.declencher('reseau');
    expect(m.serveur.creer).toHaveBeenCalledTimes(1);
    for (const d of ['jeton', 'reessayer'] as const) {
      await m.envoi.declencher(d);
    }
    expect(m.serveur.creer).toHaveBeenCalledTimes(3);
    // Une fois par jour.
    m.horloge.t += RELANCE_REGLES - 1;
    await m.envoi.declencher('ouverture');
    expect(m.serveur.creer).toHaveBeenCalledTimes(3);
    m.horloge.t += 1;
    await m.envoi.declencher('ouverture');
    expect(m.serveur.creer).toHaveBeenCalledTimes(4);
    // Une nouvelle version, et les règles qui l'acceptent maintenant.
    m.serveur.accepte = true;
    const m2 = monter({ journal: j, lots: m.lots, serveur: m.serveur, version: 'v2' });
    expect(await m2.envoi.declencher('ouverture')).toMatchObject({ envoyes: 1 });
    expect(await etats(m.lots)).toEqual(['envoye']);
    expect((await fiches(m.lots))[0]!.version).toBe('v2');
  });

  it('lecture refusée après un refus : jamais « absent », refusé par les règles', async () => {
    const m = monter({ journal: fauxJournal([evt(S1)]) });
    m.serveur.accepte = false;
    m.serveur.lectureRefusee = true;
    expect(await m.envoi.declencher('cloture')).toMatchObject({ refuses: 1, presents: 0 });
    expect(await etats(m.lots)).toEqual(['refuse:regles']);
  });

  it('hors ligne : nouvel essai à 30 s, 2 min, 10 min, puis 1 h, et à chaque déclencheur ; la passe s’arrête au premier échec', async () => {
    const m = monter({ journal: fauxJournal([evt(S1), evt(S2)]) });
    m.serveur.panne = 'unavailable';
    const r = await m.envoi.declencher('cloture');
    expect(r).toMatchObject({ arret: 'reseau', envoyes: 0 });
    // La passe s'arrête au premier échec du réseau : un seul essai.
    expect(m.serveur.creer).toHaveBeenCalledTimes(1);
    expect(m.envoi.rapport().horsLigne).toBe(true);
    expect((await m.envoi.etat(UID)).horsLigne).toBe(true);
    const delais: number[] = [];
    for (let i = 0; i < 5; i++) {
      const p = m.minuteries.at(-1)!;
      delais.push(p.ms);
      m.horloge.t += p.ms;
      p.f();
      await m.envoi.declencher('minuterie');
    }
    expect(delais).toEqual([...DELAIS_RESEAU, DELAIS_RESEAU.at(-1)]);
    // La minuterie avant l'heure n'essaie rien, pas même le lot jamais essayé ; un déclencheur, si.
    const n = m.serveur.creer.mock.calls.length;
    await m.envoi.declencher('minuterie');
    expect(m.serveur.creer.mock.calls.length).toBe(n);
    m.serveur.panne = null;
    expect(await m.envoi.declencher('reseau')).toMatchObject({ envoyes: 2, arret: null });
    expect(m.envoi.rapport().horsLigne).toBe(false);
    expect((await fiches(m.lots)).map((f) => [f.etat, f.essais])).toEqual([
      ['envoye', 0],
      ['envoye', 0],
    ]);
  });

  it('quota de Spark : plus rien avant minuit à Los Angeles, puis au premier déclencheur', async () => {
    const m = monter({ journal: fauxJournal([evt(S1), evt(S2)]) });
    m.serveur.panne = 'resource-exhausted';
    expect(await m.envoi.declencher('cloture')).toMatchObject({ arret: 'quota' });
    const remise = remiseQuota(new Date(m.horloge.t)).getTime();
    expect(m.envoi.rapport().quota).toBe(remise);
    m.serveur.panne = null;
    m.horloge.t = remise - 1;
    expect(await m.envoi.declencher('reessayer')).toMatchObject({ arret: 'quota', envoyes: 0 });
    m.horloge.t = remise;
    expect(await m.envoi.declencher('ouverture')).toMatchObject({ envoyes: 2, arret: null });
    // Le quota se lit aussi des fiches, dans une page neuve.
    const m2 = monter({ journal: fauxJournal([evt(S1)]) });
    m2.serveur.panne = 'resource-exhausted';
    await m2.envoi.declencher('cloture');
    const m3 = monter({ journal: m2.journal, lots: m2.lots, serveur: m2.serveur });
    m3.horloge.t = m2.horloge.t;
    m2.serveur.panne = null;
    expect(await m3.envoi.declencher('ouverture')).toMatchObject({ arret: 'quota', envoyes: 0 });
  });

  it('un lot que les règles refuseraient n’est jamais envoyé ; recomposé à chaque version', async () => {
    // Une séance qui n'est pas un uuid : `seance` d'un lot fait 36 caractères (règles).
    const e = [evt('seance-ancienne'), evt(S1)];
    const m = monter({ journal: fauxJournal(e) });
    expect(await m.envoi.declencher('cloture')).toMatchObject({ envoyes: 1, refuses: 0 });
    expect((await etats(m.lots)).sort()).toEqual(['envoye', 'refuse:invalide']);
    const invalide = (await fiches(m.lots)).find((f) => f.cause === 'invalide')!;
    expect(invalide.ids).toEqual([e[0]!.id]);
    expect(m.envoi.rapport().erreurs.at(-1)!.code).toBe('terramemo/lot-invalide');
    await m.envoi.declencher('reessayer');
    expect(m.serveur.creer).toHaveBeenCalledTimes(1);
    const m2 = monter({ journal: m.journal, lots: m.lots, serveur: m.serveur, version: 'v2' });
    await m2.envoi.declencher('ouverture');
    expect(m.serveur.creer).toHaveBeenCalledTimes(1);
    expect((await fiches(m.lots)).find((f) => f.id === invalide.id)!.version).toBe('v2');
  });

  it('des déclencheurs pendant une passe en partagent une seule, après elle', async () => {
    const j = fauxJournal([evt(S1)]);
    let ouvrir!: () => void;
    const porte = new Promise<void>((ok) => (ouvrir = ok));
    j.attendre.mockImplementationOnce(() => porte);
    const m = monter({ journal: j });
    const p1 = m.envoi.declencher('cloture');
    // Avant qu'elle commence, un déclencheur rejoint la passe à venir.
    expect(m.envoi.declencher('ouverture')).toBe(p1);
    await vi.waitFor(() => expect(j.attendre).toHaveBeenCalled());
    const p2 = m.envoi.declencher('reseau');
    const p3 = m.envoi.declencher('premier_plan');
    expect(p2).not.toBe(p1);
    expect(p3).toBe(p2);
    ouvrir();
    await Promise.all([p1, p2, p3]);
    expect(j.tous).toHaveBeenCalledTimes(2);
    expect(m.serveur.creations).toBe(1);
  });

  it('IndexedDB qui refuse d’écrire (quota plein) : les fiches vivent en mémoire, l’envoi part quand même', async () => {
    const casse: DepotLots = { tous: async () => [], ecrire: async () => Promise.reject(new DOMException('plein', 'QuotaExceededError')) };
    const m = monter({ journal: fauxJournal([evt(S1)]), lots: casse });
    expect(await m.envoi.declencher('cloture')).toMatchObject({ envoyes: 1 });
    expect(await m.envoi.declencher('ouverture')).toMatchObject({ composes: 0, envoyes: 0 });
    expect(m.serveur.creations).toBe(1);
  });

  it('compter : séances en attente, refusées, non envoyées ; ids hors des lots', async () => {
    const j = fauxJournal([evt(S1), evt(S1), evt(S2), evt(null)]);
    const fiche = (ids: string[], etat: FicheLot['etat']): FicheLot => ({ uid: UID, id: ids[0]!, seance: S1, appareil: APPAREIL, ids, etat, cause: etat === 'refuse' ? 'regles' : null, essais: 0, prochain: 0, version: 'v1', doc: null });
    const lots = depotLotsMemoire([fiche([j.evts[0]!.id], 'envoye'), fiche([j.evts[1]!.id], 'refuse'), { ...fiche([j.evts[2]!.id], 'a_envoyer'), uid: 'autre' }]);
    const m = monter({ journal: j, lots });
    expect(await m.envoi.compter(UID)).toEqual({
      evenements: 4,
      horsLots: 2,
      // S2 (dans un lot d'un autre compte seulement) et l'événement hors séance.
      attente: 2,
      refusees: 1,
      nonEnvoyees: 3,
      lots: { a_envoyer: 0, envoye: 1, en_ligne: 0, refuse: 1 },
    });
  });
});
