// Id de l'appareil (src/journal/appareil.ts), uuid (src/journal/uuid.ts) et
// horloge réelle (src/journal/horloge.ts), hors de src/srs/ qui reste pur.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLE_APPAREIL, idAppareil } from '../src/journal/appareil';
import { horlogeAppareil } from '../src/journal/horloge';
import { estUuid, uuid } from '../src/journal/uuid';
import { valider } from '../src/srs/journal';
import { installerStockage } from './dom-factice';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  it('v4 en minuscules, par randomUUID', () => {
    const ids = new Set(Array.from({ length: 50 }, uuid));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it('hors contexte sûr (sans randomUUID) : v4 tiré de getRandomValues', () => {
    const vrai = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (o: Uint8Array<ArrayBuffer>) => vrai.getRandomValues(o) });
    expect(typeof crypto.randomUUID).toBe('undefined');
    const ids = new Set(Array.from({ length: 50 }, uuid));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it('estUuid', () => {
    expect(estUuid(uuid())).toBe(true);
    expect(estUuid('6F9619FF-8B86-D011-B42D-00C04FC964FF')).toBe(true);
    for (const x of [null, undefined, '', 'abc', 42, `${uuid()}x`]) expect(estUuid(x)).toBe(false);
  });
});

describe('idAppareil', () => {
  it('créé une fois dans localStorage (terramemo.appareil), puis relu', () => {
    const m = installerStockage();
    const a = idAppareil();
    expect(a).toMatch(V4);
    expect(m.get(CLE_APPAREIL)).toBe(a);
    expect(CLE_APPAREIL).toBe('terramemo.appareil');
    expect(idAppareil()).toBe(a);
  });

  it('stockage injecté : relu tel quel, ou remplacé s’il n’est pas un uuid', () => {
    const m = new Map<string, string>([[CLE_APPAREIL, 'abîmé']]);
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const a = idAppareil(s, () => '11111111-2222-4333-8444-555555555555');
    expect(a).toBe('11111111-2222-4333-8444-555555555555');
    expect(m.get(CLE_APPAREIL)).toBe(a);
    expect(idAppareil(s, () => 'jamais')).toBe(a);
  });

  it('sans stockage, ou s’il lève : un id quand même, sans planter', () => {
    const avant = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('refusé', 'SecurityError'); } });
    try {
      expect(idAppareil()).toMatch(V4);
    } finally {
      if (avant) Object.defineProperty(globalThis, 'localStorage', avant);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
    expect(idAppareil(null)).toMatch(V4);
    const casse = { getItem: () => { throw new Error('illisible'); }, setItem: () => { throw new DOMException('plein', 'QuotaExceededError'); } };
    expect(idAppareil(casse)).toMatch(V4);
  });

  it('un id d’appareil passe la validation des événements', () => {
    const e = { v: 1, id: uuid(), appareil: idAppareil(null), ts: 0, tz: 0, seance: uuid(), type: 'reinitialiser', fiche: 'pays:FRA:localiser' };
    expect(valider(e)).toBe(true);
  });
});

describe('horlogeAppareil', () => {
  it('instant du système et décalage à l’est positif, en minutes entières, jamais -0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 6, 8));
    const i = horlogeAppareil();
    expect(i.ts).toBe(Date.UTC(2026, 10, 6, 8));
    expect(i.tz).toBe(-new Date().getTimezoneOffset() || 0);
    expect(Number.isSafeInteger(i.tz)).toBe(true);
    expect(Object.is(i.tz, -0)).toBe(false);
    for (const offset of [-240, 0, 300]) {
      const spy = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(offset);
      expect(Object.is(horlogeAppareil().tz, offset === 0 ? 0 : -offset)).toBe(true);
      spy.mockRestore();
    }
  });
});
