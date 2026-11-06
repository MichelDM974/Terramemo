// La mémoire de l'appareil (src/journal/memoire.ts) : le journal lu et rejoué
// une fois, puis chaque événement écrit au dépôt et appliqué à l'état en
// mémoire (le même qu'un rejeu complet) ; repli en mémoire si le dépôt échoue.
import { describe, expect, it, vi } from 'vitest';
import { depotMemoire, ErreurDepot, type Depot } from '../src/journal/depot';
import { horlogeDecalee, lireDecalage } from '../src/journal/horloge';
import { ouvrirMemoire } from '../src/journal/memoire';
import { jour } from '../src/srs/jour';
import type { Evenement } from '../src/srs/journal';
import type { Note } from '../src/srs/note';
import { etat } from '../src/srs/rejeu';

const J = Date.UTC(2026, 10, 9, 8);
let n = 0;
const ev = (fiche: string, ts: number, note: Note | null, mode: Evenement['mode'] = 'revision'): Evenement => ({
  v: 1, id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, appareil: 'app', ts, tz: 240, seance: null,
  type: 'reponse', fiche, mode: note === null ? 'libre' : mode, correct: note !== 1, aide: null, note,
});

/** Un dépôt en mémoire qui compte ses lectures. */
function compte(d: Depot = depotMemoire()) {
  const c = { tous: 0, ajouts: 0 };
  const depot: Depot = {
    tous: () => (c.tous++, d.tous()),
    ajouter: (e) => (c.ajouts++, d.ajouter(e)),
  };
  return { depot, c, d };
}

describe('mémoire de l’appareil', () => {
  it('rejoue le journal une fois, puis applique chaque événement écrit : le même état qu’un rejeu complet', async () => {
    const { depot, c, d } = compte();
    const avant = [ev('pays:FRA:localiser', J, 3, 'rappel'), ev('pays:BEL:localiser', J, 1, 'rappel')];
    await d.ajouter(avant);
    let horloge = J + 86_400_000;
    const surCharge = vi.fn();
    const m = ouvrirMemoire({ depot, appareil: 'app', horloge: () => ({ ts: horloge, tz: 240 }), surCharge });
    expect(m.charge).toBe(false);
    await m.pret;
    expect([m.charge, m.garde, c.tous]).toEqual([true, true, 1]);
    expect(surCharge).toHaveBeenCalledTimes(1);
    expect(m.jour()).toBe(jour(horloge, 240));
    expect([...m.etat().keys()].sort()).toEqual(['pays:BEL:localiser', 'pays:FRA:localiser']);
    const apres = [ev('pays:BEL:localiser', horloge, 3), ev('pays:DEU:localiser', horloge, 3, 'rappel'), ev('pays:ITA:nommer', horloge, null)];
    const ecrit = m.ecrire(apres);
    // L'état suit tout de suite, sans attendre le dépôt.
    expect(m.etat().get('pays:DEU:localiser')?.notes).toBe(1);
    await ecrit;
    horloge += 1;
    expect(c.tous).toBe(1); // aucun rejeu ni relecture
    expect(m.ecrits).toBe(3);
    expect((await d.tous()).length).toBe(5);
    expect(new Map(m.etat())).toEqual(etat([...avant, ...apres]));
  });

  it('un événement écrit avant la fin du chargement est appliqué après le rejeu, sans doublon', async () => {
    const d = depotMemoire();
    await d.ajouter([ev('pays:FRA:localiser', J, 3, 'rappel')]);
    const m = ouvrirMemoire({ depot: d, appareil: 'app', horloge: () => ({ ts: J + 86_400_000 * 3, tz: 240 }) });
    const tot = ev('pays:FRA:localiser', J + 86_400_000 * 3, 3);
    const p = m.ecrire([tot]);
    await m.pret;
    await p;
    expect(m.etat().get('pays:FRA:localiser')?.notes).toBe(2);
    expect((await d.tous()).length).toBe(2);
  });

  it('dépôt illisible (pas d’IndexedDB) : repli en mémoire, avis une fois, l’état suit quand même', async () => {
    const surAvis = vi.fn();
    const casse: Depot = {
      tous: () => Promise.reject(new ErreurDepot('indisponible', 'IndexedDB absent')),
      ajouter: () => Promise.reject(new ErreurDepot('indisponible', 'IndexedDB absent')),
    };
    const m = ouvrirMemoire({ depot: casse, appareil: 'app', horloge: () => ({ ts: J, tz: 240 }), surAvis });
    await m.pret;
    expect([m.charge, m.garde]).toEqual([true, false]);
    await m.ecrire([ev('pays:FRA:localiser', J, 3, 'rappel')]);
    expect(m.etat().has('pays:FRA:localiser')).toBe(true);
    expect(surAvis).toHaveBeenCalledTimes(1);
  });

  it('écriture refusée (quota) : garde faux, avis, la promesse ne rejette pas', async () => {
    const surAvis = vi.fn();
    const d = depotMemoire();
    const m = ouvrirMemoire({
      depot: { tous: () => d.tous(), ajouter: () => Promise.reject(new ErreurDepot('quota', 'plein')) },
      appareil: 'app',
      horloge: () => ({ ts: J, tz: 240 }),
      surAvis,
    });
    await m.pret;
    await expect(m.ecrire([ev('pays:FRA:localiser', J, 3, 'rappel')])).resolves.toBeUndefined();
    await m.ecrire([ev('pays:BEL:localiser', J, 3, 'rappel')]);
    expect(m.garde).toBe(false);
    expect(surAvis).toHaveBeenCalledTimes(1);
    expect(m.etat().size).toBe(2);
  });
});

describe('horloge de test', () => {
  it('?horloge= : un décalage en jours, lu seulement s’il est un nombre', () => {
    expect([lireDecalage('1'), lireDecalage('-2'), lireDecalage('+0.5'), lireDecalage(null), lireDecalage('demain'), lireDecalage('1e9')]).toEqual([1, -2, 0.5, null, null, null]);
    const h = horlogeDecalee(() => ({ ts: J, tz: 240 }), 1);
    expect(h()).toEqual({ ts: J + 86_400_000, tz: 240 });
  });
});
