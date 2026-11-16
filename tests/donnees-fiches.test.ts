// Données des fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 2 et § 7 ; lot F1) : public/geo/fiches-monde.json et fiches-monde.fr.json, produits
// par geodata/fiches.mjs (npm run fiches) depuis pays.json, l'extrait des capitales et la
// table à la main geodata/fiches-main.json. Sans réseau.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { sorteDeLieu } from '../src/fiches/sorte';
import { IDS_MERS } from '../src/map/mers';
import type { Pays } from '../src/map/types';

type Module = {
  construireFiches: (racine: string) => Promise<{ fichiers: Record<string, string>; entrees: Record<string, string> }>;
  sorteEntite: (statut: string) => string | null;
};
// Import dynamique sans types : le module est en JavaScript, sans déclaration.
const module = import('../geodata/fiches.mjs' as string) as Promise<Module>;

const lire = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, 'utf8')) as T;
const brutMonde = readFileSync('public/geo/fiches-monde.json', 'utf8');
const brutFr = readFileSync('public/geo/fiches-monde.fr.json', 'utf8');
const monde = JSON.parse(brutMonde) as { v: number; lieux: Record<string, { s: string }> };
const fr = JSON.parse(brutFr) as { v: number; sous_regions: Record<string, string>; lieux: Record<string, { wp?: string }> };
const pays = lire<Pays[]>('public/geo/pays.json');
const mers = lire<{ id: string }[]>('public/geo/mers.json');
const communes = lire<{ id: string }[]>('public/geo/reunion/communes.json');
const main = lire<{ sous_regions: Record<string, string>; wp: Record<string, { titre: string; raison: string }> }>('geodata/fiches-main.json');

describe('fiches du monde : une entrée par entité', () => {
  it('les 258 entités de pays.json ont leur entrée, dans les deux fichiers ; aucune pour un id inconnu', () => {
    const ids = pays.map((p) => p.id).sort();
    expect(ids).toHaveLength(258);
    expect(Object.keys(monde.lieux).sort()).toEqual(ids);
    expect(Object.keys(fr.lieux).sort()).toEqual(ids);
    expect(monde.v).toBe(1);
    expect(fr.v).toBe(1);
  });

  it('sorteDeLieu dit la sorte du fichier pour les 258, mer pour les 50 zones marines, commune pour les 24 de l’île (332 lieux)', () => {
    const compte: Record<string, number> = {};
    for (const p of pays) {
      const s = sorteDeLieu(p.id, 'monde', p.statut);
      expect(s, p.id).toBe(monde.lieux[p.id]?.s);
      compte[s!] = (compte[s!] ?? 0) + 1;
    }
    expect(compte).toEqual({ pays: 197, territoire: 48, zone: 12, continent: 1 });
    expect(mers.map((m) => m.id).sort()).toEqual([...IDS_MERS].sort());
    for (const m of mers) expect(sorteDeLieu(m.id, 'monde'), m.id).toBe('mer');
    expect(communes).toHaveLength(24);
    for (const c of communes) expect(sorteDeLieu(c.id, 'reunion', 'jouable'), c.id).toBe('commune');
    // Aucun id de la carte n'est pris pour une mer, et le script dit comme le code.
    for (const p of pays) expect(sorteDeLieu(p.id, 'monde', p.statut), p.id).not.toBe('mer');
    expect(sorteDeLieu('XYZ', 'monde')).toBeNull();
  });

  it('le script et le code s’accordent sur la sorte de chaque statut', async () => {
    const { sorteEntite } = await module;
    for (const s of ['jouable', 'optionnel', 'territoire', 'conteste', 'autre'] as const) expect(sorteEntite(s), s).toBe(sorteDeLieu('ABC', 'monde', s));
    expect(sorteEntite('inconnu')).toBeNull();
  });

  it('un titre de Wikipédia pour chacun des 197 pays, une entrée vide pour les 61 autres (sans QID avant le lot F3)', () => {
    let vides = 0;
    for (const p of pays) {
      const t = fr.lieux[p.id]!;
      if (monde.lieux[p.id]!.s === 'pays') {
        expect(t.wp, p.id).toBeTruthy();
        expect(t.wp, p.id).not.toMatch(/_|^https?:/);
      } else {
        expect(t, p.id).toEqual({});
        vides++;
      }
    }
    expect(vides).toBe(61);
    // La table à la main : le titre du royaume pour le Danemark et les Pays-Bas.
    expect(fr.lieux.DNK?.wp).toBe('Danemark');
    expect(fr.lieux.NLD?.wp).toBe('Pays-Bas');
    for (const [id, l] of Object.entries(main.wp).filter(([k]) => !k.startsWith('_'))) {
      expect(l.raison, id).toBeTruthy();
      expect(fr.lieux[id]?.wp, id).toBe(l.titre);
    }
  });

  it('les 23 sous-régions de pays.json ont leur nom, aucune de trop', () => {
    const presentes = new Set(pays.map((p) => p.sous_region));
    expect(presentes.size).toBe(23);
    expect(new Set(Object.keys(fr.sous_regions))).toEqual(presentes);
    for (const [k, v] of Object.entries(fr.sous_regions)) {
      expect(v, k).toBeTruthy();
      expect(v, k).not.toBe(k);
    }
    expect(fr.sous_regions['Eastern Asia']).toBe("Asie de l'Est");
    // « Amérique du Nord » reste le continent de l'appli : la sous-région s'en distingue.
    expect(fr.sous_regions['Northern America']).not.toBe('Amérique du Nord');
  });

  it('poids : 12 Ko compressés au plus pour chacun des deux fichiers (§ 2.7)', () => {
    expect(gzipSync(brutMonde, { level: 9 }).length).toBeLessThanOrEqual(12 * 1024);
    expect(gzipSync(brutFr, { level: 9 }).length).toBeLessThanOrEqual(12 * 1024);
  });

  it('reproduction : construireFiches (npm run fiches) redonne les fichiers commités, et les empreintes de sources.json', async () => {
    const { construireFiches } = await module;
    const r = await construireFiches('.');
    expect(r.fichiers['fiches-monde.json']).toBe(brutMonde);
    expect(r.fichiers['fiches-monde.fr.json']).toBe(brutFr);
    const sources = lire<{ traitement: { entrees: Record<string, string> } }>('public/geo/sources.json');
    expect(Object.keys(r.entrees).sort()).toEqual(['geodata/fiches-main.json', 'geodata/fiches.mjs']);
    for (const [f, h] of Object.entries(r.entrees)) {
      expect(h, f).toBe(createHash('sha256').update(readFileSync(f)).digest('hex'));
      expect(sources.traitement.entrees[f], f).toBe(h);
    }
  });
});
