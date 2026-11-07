// Export des données (src/sync/export.ts ; étude du J1b, § 7.2) : le format
// de l'étude, un invité sans « compte », les événements entiers relus par
// valider() après un aller-retour JSON, les lots à relire bruts, le nom du
// fichier, et le Blob proposé au navigateur.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { depotMemoire } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import { valider, type Evenement } from '../src/srs/journal';
import type { FicheARelire } from '../src/sync/depot-lots';
import { composerExport, FORMAT_EXPORT, nomExport, telecharger, texteExport, V_EXPORT, type ExportTerramemo } from '../src/sync/export';

const APPAREIL = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const SEANCE = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const QUAND = new Date(2026, 10, 7, 22, 30);

/** Des événements de toutes les formes que le journal garde : réponses (champs facultatifs présents ou null), connu, réinitialiser. */
function journal(): Evenement[] {
  const base = { v: 1 as const, appareil: APPAREIL, tz: 240 };
  return [
    { ...base, id: '00000000-0000-4000-8000-000000000001', ts: 1_794_000_000_000, seance: SEANCE, type: 'reponse', fiche: 'pays:FRA:localiser', mode: 'revision', reponse: 'BEL', via: 'trace', zoom: 1.75, correct: false, aide: null, duree_ms: 2345, distance_km: 120.5, note: 1 },
    { ...base, id: '00000000-0000-4000-8000-000000000002', ts: 1_794_000_001_000, seance: SEANCE, type: 'reponse', fiche: 'pays:ITA:nommer', mode: 'qcm', reponse: null, via: null, zoom: null, correct: true, aide: 'voir', duree_ms: 1200, distance_km: null, note: null },
    { ...base, id: '00000000-0000-4000-8000-000000000003', ts: 1_794_000_002_000, seance: null, type: 'reponse', fiche: 'communes:97411:localiser', mode: 'libre', correct: true, note: null },
    { ...base, id: '00000000-0000-4000-8000-000000000004', ts: 1_794_000_003_000, seance: null, type: 'connu', fiche: 'pays:ESP:localiser' },
    { ...base, id: '00000000-0000-4000-8000-000000000005', ts: 1_794_000_004_000, seance: null, type: 'reinitialiser', fiche: 'pays:FRA:localiser' },
  ] as Evenement[];
}

const A_RELIRE: FicheARelire[] = [{ uid: 'u1', id: 'lot-v2', fin: Date.UTC(2026, 10, 7, 10), doc: { v: 2, appareil: APPAREIL, seance: null, n: 3, evenements: '[[…]]', champ_futur: true }, version: 'v1', probleme: 'v 2 inconnue' }];

/** L'export tel que le relit quelqu'un qui ouvre le fichier. */
const relire = (x: ExportTerramemo) => JSON.parse(texteExport(x)) as ExportTerramemo;

describe('export des données (§ 7.2)', () => {
  it('le format de l’étude ; les événements entiers, chacun relu par valider()', () => {
    for (const e of journal()) expect(valider(e), e.id).toBe(true);
    const x = relire(
      composerExport({
        maintenant: QUAND,
        compte: { uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], cree_le: '2026-11-07T10:00:00.000Z' },
        profil: { pseudo: 'Michel', records: { 'chrono:localiser:tous': { points: 1000 } } },
        evenements: journal(),
        aRelire: A_RELIRE,
        records: { 'chrono:localiser:reunion': { points: 24_000, bareme: 1 } },
        pseudo: 'Michel',
      }),
    );
    expect(Object.keys(x)).toEqual(['format', 'v', 'exporte_le', 'compte', 'profil', 'evenements', 'a_relire', 'records', 'pseudo']);
    expect(x).toMatchObject({ format: FORMAT_EXPORT, v: V_EXPORT, exporte_le: QUAND.toISOString(), pseudo: 'Michel' });
    expect(x.compte).toEqual({ uid: 'u1', adresse: 'ana@exemple.fr', fournisseurs: ['password'], cree_le: '2026-11-07T10:00:00.000Z' });
    expect(x.profil).toEqual({ pseudo: 'Michel', records: { 'chrono:localiser:tous': { points: 1000 } } });
    expect(x.records).toEqual({ 'chrono:localiser:reunion': { points: 24_000, bareme: 1 } });
    // Les événements reviennent tels quels, champs null compris : chacun passe valider().
    expect(x.evenements).toEqual(journal());
    for (const e of x.evenements) expect(valider(e), e.id).toBe(true);
    // Les lots qu'une version ne sait pas lire, bruts.
    expect(x.a_relire).toEqual([{ id: 'lot-v2', fin: '2026-11-07T10:00:00.000Z', doc: A_RELIRE[0]!.doc }]);
  });

  it('un invité : son journal, sans « compte » ni profil', () => {
    const x = relire(composerExport({ maintenant: QUAND, compte: null, profil: null, evenements: journal(), aRelire: [], records: {}, pseudo: null }));
    expect('compte' in x).toBe(false);
    expect(x.profil).toBeNull();
    expect(x.evenements).toHaveLength(5);
    expect(x.a_relire).toEqual([]);
  });

  it('le journal d’une vraie mémoire de l’appareil : exporté puis relu, rien ne manque', async () => {
    const m = ouvrirMemoire({ depot: depotMemoire(), appareil: APPAREIL, horloge: () => ({ ts: 1_794_000_000_000, tz: 240 }) });
    await m.pret;
    await m.ecrire(journal());
    const evts = await m.tous({ strict: true });
    const x = relire(composerExport({ maintenant: QUAND, compte: null, profil: null, evenements: evts, aRelire: [], records: {}, pseudo: null }));
    expect(x.evenements.every((e) => valider(e))).toBe(true);
    expect(x.evenements.map((e) => e.id).sort()).toEqual(journal().map((e) => e.id));
  });

  it('une copie : l’export ne bouge pas si le journal change ensuite', () => {
    const evts = journal();
    const x = composerExport({ maintenant: QUAND, compte: null, profil: null, evenements: evts, aRelire: [], records: {}, pseudo: null });
    (evts[0] as { fiche: string }).fiche = 'pays:XXX:localiser';
    expect(x.evenements[0]!.fiche).toBe('pays:FRA:localiser');
  });

  it('le fichier : terramemo-AAAA-MM-JJ.json, à la date de l’appareil', () => {
    expect(nomExport(new Date(2026, 10, 7, 23, 59))).toBe('terramemo-2026-11-07.json');
    expect(nomExport(new Date(2027, 0, 3, 0, 1))).toBe('terramemo-2027-01-03.json');
    expect(texteExport(composerExport({ maintenant: QUAND, compte: null, profil: null, evenements: [], aRelire: [], records: {}, pseudo: null }))).toMatch(/^\{\n {2}"format": "terramemo-export",[\s\S]*\}\n$/);
  });
});

describe('telecharger (site : Blob et <a download>)', () => {
  afterEach(() => vi.useRealTimers());

  it('un lien de téléchargement cliqué puis retiré, l’adresse du Blob libérée ensuite', async () => {
    vi.useFakeTimers();
    const lien = { href: '', download: '', rel: '', hidden: false, click: vi.fn(), remove: vi.fn() };
    const body = { append: vi.fn() };
    const doc = { createElement: vi.fn(() => lien), body } as unknown as Document;
    const creer = vi.spyOn(URL, 'createObjectURL');
    const liberer = vi.spyOn(URL, 'revokeObjectURL');
    telecharger('terramemo-2026-11-07.json', '{"format":"terramemo-export"}\n', doc);
    const blob = creer.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"format":"terramemo-export"}\n');
    expect(lien).toMatchObject({ download: 'terramemo-2026-11-07.json', rel: 'noopener', hidden: true });
    expect(lien.href).toMatch(/^blob:/);
    expect(body.append).toHaveBeenCalledWith(lien);
    expect(lien.click).toHaveBeenCalledOnce();
    expect(lien.remove).toHaveBeenCalledOnce();
    expect(liberer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(liberer).toHaveBeenCalledWith(lien.href);
    creer.mockRestore();
    liberer.mockRestore();
  });
});
