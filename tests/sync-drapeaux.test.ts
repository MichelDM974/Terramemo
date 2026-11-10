// Drapeaux du J1b (src/sync/drapeaux.ts, étude du J1b § 8) : comptes cachés
// du public jusqu'au lot 8, synchro coupée par le driver pendant un essai.
import { describe, expect, it } from 'vitest';
import {
  CLE_COMPTES,
  CLE_SANS_SYNCHRO,
  COMPTES_OUVERTS,
  comptesVisibles,
  poserDrapeaux,
  synchroCoupee,
  type StockageDrapeaux,
} from '../src/sync/drapeaux';

function stockage(depart: Record<string, string> = {}): StockageDrapeaux & { cles: Map<string, string> } {
  const cles = new Map(Object.entries(depart));
  return {
    cles,
    getItem: (k) => cles.get(k) ?? null,
    setItem: (k, v) => void cles.set(k, String(v)),
    removeItem: (k) => void cles.delete(k),
  };
}

/** Un stockage qui lève à chaque accès (données bloquées). */
const refuse: StockageDrapeaux = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('SecurityError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

const adresse = (q: string) => new URLSearchParams(q);

describe('comptesVisibles', () => {
  it('ouverts au public sur le site depuis le 11/11 (décision « Confidentialité et ouverture des comptes »)', () => {
    expect(COMPTES_OUVERTS).toBe(true);
  });

  it('cachés en production sans drapeau, visibles en DEV ou une fois ouverts', () => {
    const s = stockage();
    expect(comptesVisibles(adresse(''), s, false, false)).toBe(false);
    expect(comptesVisibles(adresse(''), s, true, false)).toBe(true);
    expect(comptesVisibles(adresse(''), s, false, true)).toBe(true);
    expect(comptesVisibles(adresse('?comptes=0'), s, true, false)).toBe(true);
  });

  it('?comptes pose le drapeau gardé, ?comptes=0 le retire', () => {
    const s = stockage();
    poserDrapeaux(adresse('?comptes'), s);
    expect(s.cles.get(CLE_COMPTES)).toBe('1');
    expect(comptesVisibles(adresse(''), s, false, false)).toBe(true);
    poserDrapeaux(adresse('?rendu=canvas'), s);
    expect(s.cles.has(CLE_COMPTES)).toBe(true);
    poserDrapeaux(adresse('?comptes=0'), s);
    expect(s.cles.has(CLE_COMPTES)).toBe(false);
    expect(comptesVisibles(adresse(''), s, false, false)).toBe(false);
    poserDrapeaux(adresse('?comptes=1'), s);
    expect(comptesVisibles(adresse(''), s, false, false)).toBe(true);
  });

  it('le paramètre l’emporte sur le drapeau, avant même poserDrapeaux', () => {
    expect(comptesVisibles(adresse('?comptes'), stockage(), false, false)).toBe(true);
    expect(comptesVisibles(adresse('?comptes=0'), stockage({ [CLE_COMPTES]: '1' }), false, false)).toBe(false);
  });

  it('stockage refusé ou absent : le paramètre vaut pour la page, sans lever', () => {
    expect(() => poserDrapeaux(adresse('?comptes'), refuse)).not.toThrow();
    expect(comptesVisibles(adresse('?comptes'), refuse, false, false)).toBe(true);
    expect(comptesVisibles(adresse(''), refuse, false, false)).toBe(false);
    expect(comptesVisibles(adresse(''), null, false, false)).toBe(false);
  });
});

describe('synchroCoupee', () => {
  it('ouverte par défaut', () => {
    expect(synchroCoupee(adresse(''), stockage())).toBe(false);
    expect(synchroCoupee(adresse(''), null)).toBe(false);
  });

  it('?sans-synchro coupe la page sans rien garder', () => {
    const s = stockage();
    poserDrapeaux(adresse('?sans-synchro'), s);
    expect(s.cles.has(CLE_SANS_SYNCHRO)).toBe(false);
    expect(synchroCoupee(adresse('?sans-synchro'), s)).toBe(true);
    expect(synchroCoupee(adresse('?sans-synchro=1'), s)).toBe(true);
    expect(synchroCoupee(adresse(''), s)).toBe(false);
  });

  it('le drapeau du driver coupe, quelle que soit sa valeur ; ?sans-synchro=0 le retire', () => {
    const s = stockage({ [CLE_SANS_SYNCHRO]: '1' });
    expect(synchroCoupee(adresse(''), s)).toBe(true);
    expect(synchroCoupee(adresse(''), stockage({ [CLE_SANS_SYNCHRO]: '' }))).toBe(true);
    expect(synchroCoupee(adresse('?sans-synchro=0'), s)).toBe(false);
    poserDrapeaux(adresse('?sans-synchro=0'), s);
    expect(s.cles.has(CLE_SANS_SYNCHRO)).toBe(false);
    expect(synchroCoupee(adresse(''), s)).toBe(false);
  });

  it('stockage refusé : seul le paramètre compte, sans lever', () => {
    expect(synchroCoupee(adresse(''), refuse)).toBe(false);
    expect(synchroCoupee(adresse('?sans-synchro'), refuse)).toBe(true);
    expect(() => poserDrapeaux(adresse('?sans-synchro=0'), refuse)).not.toThrow();
  });

  it('les deux drapeaux sont indépendants', () => {
    const s = stockage();
    poserDrapeaux(adresse('?comptes&sans-synchro=0'), s);
    expect(s.cles.get(CLE_COMPTES)).toBe('1');
    expect(synchroCoupee(adresse(''), s)).toBe(false);
  });
});
