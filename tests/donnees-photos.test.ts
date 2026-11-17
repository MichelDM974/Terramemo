// Photos des fiches (#34, lot P1 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3 et § 7) : la table des QID des territoires et des zones (geodata/fiches-main.json,
// clé qid), la règle des licences (geodata/photos/regle.mjs) sur un jeu d'essai tiré des
// 1 917 fichiers du relevé R5, la forme de geodata/photos/candidats.json, main.json et
// choix.json. Sans réseau.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

// --- Règle des licences --------------------------------------------------------------

type Verdict = { ok: true; licence: string; licence_url: string | null; auteur: string | null; titre: string | null; page: string } | { ok: false; raison: string };
type Info = { w: number; h: number; mime: string; meta: Record<string, string> } | null;
type Regle = {
  verdict: (fichier: string, info: Info) => Verdict;
  nettoyerAuteur: (html: string | undefined) => string | null;
  fauxAuteur: (texte: string | null) => boolean;
  licenceDe: (court: string) => { code: string; famille: string } | null;
  perteRecadrage: (w: number, h: number) => number;
  FAUX_AUTEURS: string[];
  RAISONS: string[];
};
// Import dynamique sans types : les modules sont en JavaScript, sans déclaration.
const regle = import('../geodata/photos/regle.mjs' as string) as Promise<Regle>;
const essai = lire<{ resume_1917: Record<string, number>; cas: { fichier: string; origine: string; info: Info; attendu: Verdict }[] }>('tests/photos-licences-essai.json');
const RELEVE_R5 = join(homedir(), 'Sauvegardes/terramemo/fiche-lieu-conception/photos/commons-candidats-info.json');
const LICENCES_PERMISES = /^(CC0|Domaine public|CC BY(-SA)? (2\.0|2\.1|2\.5|3\.0|4\.0)( [a-z]{2,3})?)$/;

describe('règle des licences (regle.mjs), sur le jeu d’essai tiré des 1 917 fichiers du relevé', () => {
  it('chaque cas rend le verdict attendu', async () => {
    const { verdict } = await regle;
    expect(essai.cas.length).toBeGreaterThan(60);
    for (const c of essai.cas) expect(verdict(c.fichier, c.info), c.fichier).toEqual(c.attendu);
  });

  it('le jeu couvre chaque raison de refus et chaque famille de licence', async () => {
    const { RAISONS } = await regle;
    const raisons = new Set(essai.cas.filter((c) => !c.attendu.ok).map((c) => (c.attendu as { raison: string }).raison));
    for (const r of RAISONS.filter((x) => x !== 'absent')) expect(raisons, r).toContain(r);
    const licences = essai.cas.flatMap((c) => (c.attendu.ok ? [c.attendu.licence] : []));
    for (const l of ['CC0', 'Domaine public', 'CC BY 2.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0 igo']) expect(licences, l).toContain(l);
    // Des fichiers réels avec le champ Attribution, et la règle qui le préfère.
    expect(essai.cas.some((c) => c.info?.meta.Attribution && c.attendu.ok)).toBe(true);
  });

  it('seules les licences permises passent ; NC, ND, GFDL, OGL, FAL, « Attribution », « No restrictions » sont refusées', async () => {
    const { licenceDe } = await regle;
    for (const c of essai.cas) if (c.attendu.ok) expect(c.attendu.licence, c.fichier).toMatch(LICENCES_PERMISES);
    for (const l of ['CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 3.0', 'CC BY-SA 1.0', 'GFDL 1.2', 'OGL v1.0', 'FAL', 'Attribution', 'No restrictions', 'Copyrighted free use', ''])
      expect(licenceDe(l), l).toBeNull();
    expect(licenceDe('CC BY-SA 3.0 igo')?.famille).toBe('by-sa');
    expect(licenceDe('CC BY 2.1 jp')?.code).toBe('CC BY 2.1 jp');
    expect(licenceDe('Public domain')?.famille).toBe('pd');
  });

  it('un CC BY ou BY-SA a toujours un auteur identifiable ; le domaine public peut ne pas en avoir', async () => {
    const { fauxAuteur } = await regle;
    for (const c of essai.cas) {
      if (!c.attendu.ok) continue;
      if (/^CC BY/.test(c.attendu.licence)) {
        expect(c.attendu.auteur, c.fichier).not.toBeNull();
        expect(fauxAuteur(c.attendu.auteur), c.fichier).toBe(false);
      }
      if (c.attendu.auteur) expect(c.attendu.auteur.length, c.fichier).toBeLessThanOrEqual(80);
      expect(c.attendu.auteur ?? '', c.fichier).not.toMatch(/[<>]/);
      expect(c.attendu.page, c.fichier).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
    expect(essai.cas.some((c) => c.attendu.ok && c.attendu.auteur === null && c.attendu.licence === 'Domaine public')).toBe(true);
  });

  it('le nettoyage passe sur la liste des faux auteurs, et garde les vrais', async () => {
    const { nettoyerAuteur, fauxAuteur, FAUX_AUTEURS } = await regle;
    for (const f of FAUX_AUTEURS) {
      expect(nettoyerAuteur(f), f).toBeNull();
      expect(nettoyerAuteur(`<span class="int-own-work">${f[0]!.toUpperCase()}${f.slice(1)}</span>`), f).toBeNull();
    }
    for (const f of ['', '   ', 'Unknown authorUnknown author', 'Unknown authorUnknown author or not provided', 'null', 'https://www.example.org/photo', 'Own work, unknown', '?'])
      expect(nettoyerAuteur(f), JSON.stringify(f)).toBeNull();
    expect(nettoyerAuteur('<a href="//commons.wikimedia.org/wiki/User:DXR">DXR</a>')).toBe('DXR');
    expect(nettoyerAuteur('No machine-readable author provided. Calips assumed (based on copyright claims).')).toBe('Calips');
    expect(nettoyerAuteur('Byron')).toBe('Byron');
    expect(nettoyerAuteur('User:Jean-Pol GRANDMONT')).toBe('Jean-Pol GRANDMONT');
    expect(nettoyerAuteur('Thomas Wolf, www.foto-tw.de')).toBe('Thomas Wolf, www.foto-tw.de');
    expect(nettoyerAuteur('A &amp; B')).toBe('A & B');
    expect(nettoyerAuteur('x'.repeat(200))).toHaveLength(80);
    expect(fauxAuteur('Sémhur ·✉·✍·')).toBe(false);
  });

  it('Attribution est préférée à Artist ; Credit (la provenance) n’est jamais un auteur', async () => {
    const { verdict } = await regle;
    const base = { w: 4000, h: 3000, mime: 'image/jpeg' };
    const v1 = verdict('Essai.jpg', { ...base, meta: { LicenseShortName: 'CC BY-SA 4.0', Artist: '<a href="x">Pseudo</a>', Attribution: 'Jean Dupont / Wikimedia Commons' } });
    expect(v1).toMatchObject({ ok: true, auteur: 'Jean Dupont / Wikimedia Commons' });
    const v2 = verdict('Essai.jpg', { ...base, meta: { LicenseShortName: 'CC BY 4.0', Artist: '', Credit: 'Transferred from en.wikipedia' } });
    expect(v2).toEqual({ ok: false, raison: 'auteur' });
    const v3 = verdict('Essai.jpg', { ...base, meta: { LicenseShortName: 'Public domain', Artist: 'Unknown author' } });
    expect(v3).toMatchObject({ ok: true, auteur: null, licence: 'Domaine public', licence_url: null });
  });

  it('formes, tailles, mots du nom, armée pour auteur', async () => {
    const { verdict } = await regle;
    const m = { LicenseShortName: 'CC0', Artist: 'X' };
    expect(verdict('a.svg', { w: 4000, h: 3000, mime: 'image/svg+xml', meta: m })).toEqual({ ok: false, raison: 'format' });
    expect(verdict('a.jpg', { w: 1079, h: 3000, mime: 'image/jpeg', meta: m })).toEqual({ ok: false, raison: 'petite' });
    expect(verdict('a.jpg', { w: 4000, h: 719, mime: 'image/jpeg', meta: m })).toEqual({ ok: false, raison: 'petite' });
    expect(verdict('a.jpg', { w: 1080, h: 720, mime: 'image/jpeg', meta: m }).ok).toBe(true);
    expect(verdict('Satellite image of Japan.jpg', { w: 4000, h: 3000, mime: 'image/jpeg', meta: m })).toEqual({ ok: false, raison: 'nom' });
    expect(verdict('Plan d’eau de Cilaos.jpg', { w: 4000, h: 3000, mime: 'image/jpeg', meta: m }).ok).toBe(true);
    expect(verdict('Chachani summit.jpg', { w: 4000, h: 3000, mime: 'image/jpeg', meta: m }).ok).toBe(true);
    expect(verdict('090826-N-6814F-052.jpg', { w: 4000, h: 3000, mime: 'image/jpeg', meta: { LicenseShortName: 'Public domain', Artist: 'U.S. Navy photo by X' } })).toEqual({ ok: false, raison: 'sujet' });
    expect(verdict('a.jpg', { w: 4000, h: 3000, mime: 'image/jpeg', meta: { ...m, Restrictions: 'personality' } })).toEqual({ ok: false, raison: 'restrictions' });
    expect(verdict('a.jpg', { w: 4000, h: 3000, mime: 'image/jpeg', meta: { ...m, NonFree: 'true' } })).toEqual({ ok: false, raison: 'non_libre' });
    expect(verdict('a.jpg', null)).toEqual({ ok: false, raison: 'absent' });
  });

  it('perte au recadrage 3:2 : rien pour un 3:2, un tiers pour un 4:3 portrait… (bande jaune au-delà de 30 %)', async () => {
    const { perteRecadrage } = await regle;
    expect(perteRecadrage(3000, 2000)).toBeCloseTo(0);
    expect(perteRecadrage(4000, 3000)).toBeCloseTo(1 - 8 / 9);
    expect(perteRecadrage(2000, 3000)).toBeCloseTo(1 - (2000 * (2000 / 1.5)) / (2000 * 3000));
  });

  it.skipIf(!existsSync(RELEVE_R5))('sur les 1 917 fichiers du relevé (sur le PC seulement) : les comptes notés dans le jeu d’essai', async () => {
    const { verdict } = await regle;
    const r5 = lire<{ info: Record<string, Info> }>(RELEVE_R5);
    const comptes: Record<string, number> = {};
    for (const [f, i] of Object.entries(r5.info)) {
      const v = verdict(f, i);
      const k = v.ok ? 'ok' : v.raison;
      comptes[k] = (comptes[k] ?? 0) + 1;
    }
    expect(Object.values(comptes).reduce((a, b) => a + b, 0)).toBe(1917);
    expect(comptes).toEqual(essai.resume_1917);
  });
});
