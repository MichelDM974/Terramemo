// Union et effacement du journal (J1b, lot 4 ; étude § 5.3 et § 3.4) :
// Memoire.fusionner (événements lus en ligne, doublons ignorés, rejet si le
// dépôt échoue), rejeu complet différé (union d'événements plus anciens,
// horloge qui recule, séance active), Memoire.effacer, et les onglets qui se
// préviennent (BroadcastChannel).
import { describe, expect, it, vi } from 'vitest';
import { depotMemoire, ErreurDepot, type Depot } from '../src/journal/depot';
import { ouvrirMemoire } from '../src/journal/memoire';
import type { Evenement } from '../src/srs/journal';
import type { Note } from '../src/srs/note';
import { etat } from '../src/srs/rejeu';

const J = Date.UTC(2026, 10, 9, 8);
const JOUR = 86_400_000;
let n = 0;
const ev = (fiche: string, ts: number, note: Note | null, o: Partial<Evenement> = {}): Evenement => ({
  v: 1, id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, appareil: 'app', ts, tz: 240, seance: null,
  type: 'reponse', fiche, mode: note === null ? 'libre' : 'revision', correct: note !== 1, aide: null, note, ...o,
});
const immediat = (f: () => void) => void f();
let canaux = 0;

async function egalAuRejeu(m: ReturnType<typeof ouvrirMemoire>, d: Depot) {
  expect(new Map(m.etat())).toEqual(etat(await d.tous()));
}

describe('union du journal (fusionner)', () => {
  it('des événements plus récents : appliqués pas à pas, le même état qu’un rejeu complet', async () => {
    const d = depotMemoire();
    const ici = [ev('pays:FRA:localiser', J, 3), ev('pays:BEL:localiser', J, 1)];
    await d.ajouter(ici);
    const surCharge = vi.fn();
    const m = ouvrirMemoire({ depot: d, appareil: 'app', horloge: () => ({ ts: J + 3 * JOUR, tz: 240 }), surCharge, auRepos: immediat });
    await m.pret;
    const ailleurs = [ev('pays:FRA:localiser', J + JOUR, 4, { appareil: 'autre' }), ev('pays:DEU:localiser', J + JOUR, 3, { appareil: 'autre' })];
    await m.fusionner(ailleurs);
    expect((await d.tous()).length).toBe(4);
    expect(m.etat().get('pays:FRA:localiser')?.notes).toBe(2);
    expect(surCharge).toHaveBeenCalledTimes(2);
    await egalAuRejeu(m, d);
  });

  it('des événements plus anciens que le dernier appliqué : rejeu complet (l’ordre du rejeu, pas l’ordre d’arrivée)', async () => {
    const d = depotMemoire();
    // B a révisé la fiche à 10 h (Good) ; A, hors ligne, à 9 h (Again) : après union, Again l’emporte (§ 5.6).
    const b = ev('pays:FRA:localiser', J + 2 * 3_600_000, 3, { appareil: 'b' });
    await d.ajouter([b]);
    const m = ouvrirMemoire({ depot: d, appareil: 'b', horloge: () => ({ ts: J + 5 * 3_600_000, tz: 240 }), auRepos: immediat });
    await m.pret;
    expect(m.etat().get('pays:FRA:localiser')?.echecs).toBe(0);
    await m.fusionner([ev('pays:FRA:localiser', J + 3_600_000, 1, { appareil: 'a' })]);
    expect(m.etat().get('pays:FRA:localiser')).toMatchObject({ notes: 1, echecs: 1 });
    await egalAuRejeu(m, d);
  });

  it('pendant une séance active : écrit tout de suite, l’état ne suit qu’à la clôture', async () => {
    const d = depotMemoire();
    const m = ouvrirMemoire({ depot: d, appareil: 'app', horloge: () => ({ ts: J + 5 * JOUR, tz: 240 }), auRepos: immediat });
    await m.pret;
    const seance = 'seance-1';
    await m.ecrire([ev('pays:ITA:localiser', J + 5 * JOUR, 3, { seance })]);
    expect(m.seanceEnCours()).toBe(seance);
    await m.fusionner([ev('pays:FRA:localiser', J, 3, { appareil: 'autre' })]);
    expect((await d.tous()).length).toBe(2);
    expect(m.etat().has('pays:FRA:localiser')).toBe(false);
    m.clore();
    await m.recharger();
    expect(m.etat().has('pays:FRA:localiser')).toBe(true);
    await egalAuRejeu(m, d);
  });

  it('dépôt en échec : la promesse rejette, rien n’est tenu pour connu, un nouvel essai écrit', async () => {
    const d = depotMemoire();
    let refuser = true;
    const depot: Depot = { tous: () => d.tous(), ajouter: (e) => (refuser ? Promise.reject(new ErreurDepot('quota', 'plein')) : d.ajouter(e)), vider: () => d.vider!() };
    const m = ouvrirMemoire({ depot, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }), auRepos: immediat });
    await m.pret;
    const lu = [ev('pays:FRA:localiser', J, 3, { appareil: 'autre' })];
    await expect(m.fusionner(lu)).rejects.toThrow('plein');
    // La file d’écriture n’est pas bloquée, et `garde` ne passe pas à faux en silence.
    expect(m.garde).toBe(true);
    refuser = false;
    await m.fusionner(lu);
    expect((await d.tous()).map((e) => e.id)).toEqual([lu[0]!.id]);
    await egalAuRejeu(m, d);
  });

  it('des ids déjà connus : ni écriture ni rejeu', async () => {
    const d = depotMemoire();
    const ici = [ev('pays:FRA:localiser', J, 3)];
    await d.ajouter(ici);
    const ajouter = vi.fn((e: readonly Evenement[]) => d.ajouter(e));
    const surCharge = vi.fn();
    const m = ouvrirMemoire({ depot: { tous: () => d.tous(), ajouter }, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }), surCharge });
    await m.pret;
    await m.fusionner(structuredClone(ici));
    expect(ajouter).not.toHaveBeenCalled();
    expect(surCharge).toHaveBeenCalledTimes(1);
  });

  it('horloge qui recule : un rejeu complet au repos remplace l’application pas à pas', async () => {
    const d = depotMemoire();
    let repos: (() => void) | null = null;
    const m = ouvrirMemoire({ depot: d, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }), auRepos: (f) => void (repos = f) });
    await m.pret;
    await m.ecrire([ev('pays:FRA:localiser', J + 2 * JOUR, 3)]);
    // L’horloge recule d’un jour : la note du jour d’avant ne s’applique pas pas à pas (dernier_jour plus récent)…
    await m.ecrire([ev('pays:FRA:localiser', J + JOUR, 1)]);
    expect(m.etat().get('pays:FRA:localiser')?.notes).toBe(1);
    expect(repos).not.toBeNull();
    // … mais le rejeu complet, au repos, l’applique dans l’ordre du rejeu.
    repos!();
    await vi.waitFor(() => expect(m.etat().get('pays:FRA:localiser')?.notes).toBe(2));
    await egalAuRejeu(m, d);
  });

  it('écrits avant la fin du chargement, plus anciens que le journal : rejoués avec lui', async () => {
    const d = depotMemoire();
    await d.ajouter([ev('pays:FRA:localiser', J + 2 * JOUR, 3)]);
    const m = ouvrirMemoire({ depot: d, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }) });
    const p = m.ecrire([ev('pays:FRA:localiser', J + JOUR, 1)]);
    await m.pret;
    await p;
    await egalAuRejeu(m, d);
  });
});

describe('effacement du journal', () => {
  it('attend la file d’écriture, vide le dépôt et l’état ; ce qui est écrit pendant l’effacement reste', async () => {
    const d = depotMemoire();
    await d.ajouter([ev('pays:FRA:localiser', J, 3)]);
    const surCharge = vi.fn();
    const m = ouvrirMemoire({ depot: d, appareil: 'app', horloge: () => ({ ts: J + JOUR, tz: 240 }), surCharge });
    await m.pret;
    const ecrit = m.ecrire([ev('pays:BEL:localiser', J + JOUR, 3, { seance: 's1' })]);
    const efface = m.effacer();
    const apres = ev('pays:DEU:localiser', J + JOUR, 3, { seance: 's2' });
    void m.ecrire([apres]);
    await ecrit;
    await efface;
    await m.ecrire([]);
    expect((await d.tous()).map((e) => e.id)).toEqual([apres.id]);
    expect([...m.etat().keys()]).toEqual(['pays:DEU:localiser']);
    expect(m.seanceEnCours()).toBe('s2');
    expect((await m.tous()).map((e) => e.id)).toEqual([apres.id]);
    expect(surCharge).toHaveBeenCalledTimes(2);
  });

  it('rejette si le dépôt ne se vide pas ; sans IndexedDB du tout, le repli en mémoire suffit', async () => {
    const d = depotMemoire();
    const casse: Depot = { tous: () => d.tous(), ajouter: (e) => d.ajouter(e), vider: () => Promise.reject(new ErreurDepot('echec', 'non')) };
    const m = ouvrirMemoire({ depot: casse, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }) });
    await m.pret;
    await expect(m.effacer()).rejects.toThrow('non');
    const absent: Depot = {
      tous: () => Promise.reject(new ErreurDepot('indisponible', 'IndexedDB absent')),
      ajouter: () => Promise.reject(new ErreurDepot('indisponible', 'IndexedDB absent')),
      vider: () => Promise.reject(new ErreurDepot('indisponible', 'IndexedDB absent')),
    };
    const m2 = ouvrirMemoire({ depot: absent, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }) });
    await m2.pret;
    await m2.ecrire([ev('pays:FRA:localiser', J, 3)]);
    await m2.effacer();
    expect(m2.etat().size).toBe(0);
    expect(await m2.tous()).toEqual([]);
  });

  it('attend `avant` (déconnexion interrompue) avant de lire le journal', async () => {
    const d = depotMemoire();
    await d.ajouter([ev('pays:FRA:localiser', J, 3)]);
    const avant = d.vider!();
    const m = ouvrirMemoire({ depot: d, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }), avant });
    await m.pret;
    expect(m.etat().size).toBe(0);
  });
});

describe('onglets (BroadcastChannel)', () => {
  it('un journal effacé dans un onglet prévient l’autre ; une séance close fait relire le journal ailleurs', async () => {
    const nom = `terramemo-essai-${++canaux}`;
    const d = depotMemoire();
    const h = () => ({ ts: J, tz: 240 });
    const efface = vi.fn();
    const a = ouvrirMemoire({ depot: d, appareil: 'app', horloge: h, canal: nom, auRepos: immediat });
    const b = ouvrirMemoire({ depot: d, appareil: 'app', horloge: h, canal: nom, auRepos: immediat, surEffaceAilleurs: efface });
    await Promise.all([a.pret, b.pret]);
    await a.ecrire([ev('pays:FRA:localiser', J, 3, { seance: 's1' })]);
    expect(b.etat().size).toBe(0);
    a.clore();
    await vi.waitFor(() => expect(b.etat().has('pays:FRA:localiser')).toBe(true));
    await a.effacer();
    await vi.waitFor(() => expect(efface).toHaveBeenCalledTimes(1));
    a.fermer();
    b.fermer();
  });
});
