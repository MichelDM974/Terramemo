// Photos des fiches (#34, lot P1 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3 et § 7) : la table des QID des territoires et des zones (geodata/fiches-main.json,
// clé qid), la règle des licences (geodata/photos/regle.mjs) sur un jeu d'essai tiré des
// 1 917 fichiers du relevé R5, la forme de geodata/photos/candidats.json, main.json et
// choix.json. Sans réseau.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pays } from '../src/map/types';

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const pays = lire<Pays[]>('public/geo/pays.json');
const noms = lire<Record<string, string>>('public/geo/noms.fr.json');
type LigneQid = { q: string; libelle: string | null; libelle_en?: string; par: 'P298' | 'main'; raison?: string; a_relire?: string };
const qid = lire<{ qid: Record<string, LigneQid | string> }>('geodata/fiches-main.json').qid;
const lignesQid = Object.entries(qid).filter(([k]) => k !== '_') as [string, LigneQid][];

describe('table des QID des territoires, des zones et de l’Antarctique (fiches-main.json, qid)', () => {
  it('une ligne pour chacun des 61 lieux sans item de pays, et pour eux seuls', () => {
    const attendus = pays.filter((p) => ['territoire', 'conteste', 'autre'].includes(p.statut)).map((p) => p.id).sort();
    expect(attendus).toHaveLength(61);
    expect(lignesQid.map(([id]) => id).sort()).toEqual(attendus);
  });

  it('chaque ligne : un item, un libellé pour la relecture, sa provenance ; une raison si elle est à la main', () => {
    for (const [id, l] of lignesQid) {
      expect(l.q, id).toMatch(/^Q[1-9]\d*$/);
      expect(l.libelle ?? l.libelle_en, id).toBeTruthy();
      expect(['P298', 'main'], id).toContain(l.par);
      if (l.par === 'main') expect(l.raison, id).toBeTruthy();
      if (l.par === 'P298') expect(l.raison, id).toBeUndefined();
      expect(noms[id], id).toBeTruthy();
    }
    // Les items de code ISO ont l'id du lieu pour code : seuls les NE_* sont à la main.
    expect(lignesQid.filter(([, l]) => l.par === 'main').map(([id]) => id).every((id) => id.startsWith('NE_'))).toBe(true);
  });

  it('deux lieux ne partagent pas un item (Akrotiri et Dhekelia en avaient un seul dans le relevé)', () => {
    const vus = new Map<string, string>();
    for (const [id, l] of lignesQid) {
      expect(vus.get(l.q), `${id} et ${vus.get(l.q)} : ${l.q}`).toBeUndefined();
      vus.set(l.q, id);
    }
    expect(qid.NE_ESB).toMatchObject({ q: 'Q9206745' });
    expect(qid.NE_WSB).toMatchObject({ q: 'Q9143535' });
    expect(qid.ATA).toMatchObject({ q: 'Q51' });
  });
});
