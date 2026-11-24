// Photos des fiches (#34, lot P1 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3 et § 7) : la table des QID des territoires et des zones (geodata/fiches-main.json,
// clé qid), la règle des licences (geodata/photos/regle.mjs) sur un jeu d'essai tiré des
// 1 917 fichiers du relevé R5, la forme de geodata/photos/candidats.json, main.json et
// choix.json ; lot P2 : licences.json, les listes que le build écrit (listes.mjs), la
// vérification des WebP (verifier.mjs) et traiter.py sur les lieux d'essai
// (tests/photos-essai/). Sans réseau.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
type Info = { w: number; h: number; mime: string; meta: Record<string, string>; categories?: string[] } | null;
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
type Cas = { fichier: string; info: Info; attendu: Verdict };
const essai = lire<{ resume_1917: Record<string, number>; cas: (Cas & { origine: string })[]; cas_main: (Cas & { note: string })[] }>('tests/photos-licences-essai.json');
const tousCas: Cas[] = [...essai.cas, ...essai.cas_main];
const RELEVE_R5 = join(homedir(), 'Sauvegardes/terramemo/fiche-lieu-conception/photos/commons-candidats-info.json');
const LICENCES_PERMISES = /^(CC0|Domaine public|CC BY(-SA)? (2\.0|2\.1|2\.5|3\.0|4\.0)( [a-z]{2,3})?)$/;

describe('règle des licences (regle.mjs), sur le jeu d’essai tiré des 1 917 fichiers du relevé', () => {
  it('chaque cas rend le verdict attendu', async () => {
    const { verdict } = await regle;
    expect(essai.cas.length).toBeGreaterThan(60);
    for (const c of essai.cas) expect(verdict(c.fichier, c.info), c.fichier).toEqual(c.attendu);
  });

  it('les cas écrits à la main (constats de la relecture du lot P1) rendent leur verdict', async () => {
    const { verdict } = await regle;
    expect(essai.cas_main.length).toBeGreaterThan(20);
    for (const c of essai.cas_main) expect(verdict(c.fichier, c.info), `${c.fichier} (${c.note})`).toEqual(c.attendu);
  });

  it('le jeu couvre chaque raison de refus et chaque famille de licence', async () => {
    const { RAISONS } = await regle;
    const raisons = new Set(tousCas.filter((c) => !c.attendu.ok).map((c) => (c.attendu as { raison: string }).raison));
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
    for (const c of tousCas) {
      if (!c.attendu.ok) continue;
      if (/^CC BY/.test(c.attendu.licence)) {
        expect(c.attendu.auteur, c.fichier).not.toBeNull();
        expect(fauxAuteur(c.attendu.auteur), c.fichier).toBe(false);
      }
      // Jamais coupé : CC BY demande de nommer tous les créateurs (l'affichage seul raccourcit).
      expect(c.attendu.auteur ?? '', c.fichier).not.toMatch(/…$/);
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
    expect(nettoyerAuteur('x'.repeat(200))).toHaveLength(200);
    expect(fauxAuteur('Sémhur ·✉·✍·')).toBe(false);
    // Vus dans les candidats de l'échantillon (relecture du lot P1, 17/11).
    for (const f of ['self.', 'Self', 'Author', 'Photographer', 'Uploader', 'See below', 'Not specified', 'No author', 'Unidentified photographer', 'This file is lacking author information.', 'own-work', 'Imported from Flickr', 'Transferred from en.wikipedia'])
      expect(nettoyerAuteur(f), f).toBeNull();
    expect(nettoyerAuteur('The original uploader was SOLOXSALERNO at Italian Wikipedia.')).toBe('SOLOXSALERNO');
    expect(nettoyerAuteur('Original uploader was Ptrbnsn at en.wikipedia')).toBe('Ptrbnsn');
    expect(nettoyerAuteur('[//commons.wikimedia.org/wiki/User:Trantuonglam Trantuonglam]')).toBe('Trantuonglam');
    expect(nettoyerAuteur('This image or media was taken or created by Matt H. Wade. To see his entire portfolio, visit his user page.')).toBe('Matt H. Wade');
    expect(nettoyerAuteur('Rocky Masum This work was made by Masum-al-Hasan Rocky and released under the license')).toBe('Masum-al-Hasan Rocky');
    expect(nettoyerAuteur('Matti&amp;Keti - lorenz.king@geogr.uni-giessen.de')).toBe('Matti&Keti');
    expect(nettoyerAuteur('https://www.flickr.com/people/26116471@N03 Wajahat Mahmood')).toBe('Wajahat Mahmood');
    expect(nettoyerAuteur('JJ Harrison (https://www.jjharrison.com.au/)')).toBe('JJ Harrison');
    expect(nettoyerAuteur('---=XEON=---')).toBe('---=XEON=---');
    expect(nettoyerAuteur('The Miller Atlas')).toBe('The Miller Atlas');
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

// --- candidats.json, main.json, choix.json ------------------------------------------

type Candidat = {
  fichier: string; sources: string[]; sujet: string | null; sujet_q: string | null; n?: number; sensible?: string; raison?: string; nofop?: string;
  licence: string; licence_url: string | null; auteur: string | null; titre: string | null; page: string; w: number; h: number; perte: number; miniature: string | null; lu_le: string;
};
type LieuCandidats = {
  terrain: string; sorte: string; nom: string; q: string; sensible?: string; pauvre?: string; a_completer?: string[]; extrait_le: string; lu_le: string;
  comptes: { trouves: number; acceptes: number; avec_sujet: number; montres: number; en_reserve: number; refuses: Record<string, number>; sources: Record<string, number> };
  candidats: Candidat[];
};
const candidats = lire<{ v: number; ecrit_le: string; requetes_sha256: string; regle_sha256: string; lieux: Record<string, LieuCandidats> }>('geodata/photos/candidats.json');
const mainPhotos = lire<{ mers: Record<string, { fichier: string; sujet?: string; raison: string }[] | string>; sujets_sensibles: Record<string, string> }>('geodata/photos/main.json');
const choix = lire<{ v: number; lieux: Record<string, Record<string, unknown>> }>('geodata/photos/choix.json');
const mers = lire<{ id: string }[]>('public/geo/mers.json');
const communes = lire<{ id: string }[]>('public/geo/reunion/communes.json');
const SORTES: Record<string, string> = { jouable: 'pays', optionnel: 'pays', territoire: 'territoire', conteste: 'zone', autre: 'continent' };
const sorteAttendue = new Map<string, string>([
  ...pays.map((p) => [p.id, SORTES[p.statut]!] as [string, string]),
  ...mers.map((m) => [m.id, 'mer'] as [string, string]),
  ...communes.map((c) => [c.id, 'commune'] as [string, string]),
]);
const empreinte = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

describe('candidats.json (npm run photos:candidats)', () => {
  it('les pays en guerre (décision du 18/11) sont sensibles : rien n’y est coché d’avance', () => {
    for (const id of ['YEM', 'LBY', 'ISR']) expect((candidats.lieux[id] as { sensible?: string | null }).sensible, id).toBe('pays en guerre');
    expect((candidats.lieux.FRA as { sensible?: string | null }).sensible ?? null).toBeNull();
  });

  it('les 332 lieux du code, et chaque lieu présent a sa sorte et son item', () => {
    expect(sorteAttendue.size).toBe(332);
    expect(candidats.v).toBe(1);
    for (const [id, l] of Object.entries(candidats.lieux)) {
      expect(sorteAttendue.get(id), id).toBe(l.sorte);
      expect(l.q, id).toMatch(/^Q[1-9]\d*$/);
      expect(l.terrain, id).toBe(l.sorte === 'commune' ? 'reunion' : 'monde');
      expect(Date.parse(l.extrait_le), id).not.toBeNaN();
      // La date de la plus ancienne réponse utilisée, pas celle du calcul : jamais après lui.
      expect(Date.parse(l.lu_le), id).not.toBeNaN();
      expect(l.lu_le <= l.extrait_le, id).toBe(true);
      for (const c of l.candidats) expect(c.lu_le >= l.lu_le && c.lu_le <= l.extrait_le, `${id} : ${c.fichier}`).toBe(true);
    }
  });

  it('l’empreinte des requêtes et de la règle : un changement se relance', () => {
    expect(candidats.requetes_sha256).toBe(empreinte('geodata/photos/requetes.rq'));
    expect(candidats.regle_sha256).toBe(empreinte('geodata/photos/regle.mjs'));
  });

  it('chaque candidat passe la règle des licences : licence permise, auteur pour CC BY, taille, page, miniature', async () => {
    const { fauxAuteur, RAISONS, perteRecadrage } = await regle;
    for (const [id, l] of Object.entries(candidats.lieux)) {
      expect(l.candidats.length, id).toBeLessThanOrEqual(10);
      expect(l.comptes.montres, id).toBe(l.candidats.length);
      expect(l.comptes.acceptes, id).toBe(l.candidats.length + l.comptes.en_reserve);
      for (const r of Object.keys(l.comptes.refuses)) expect(RAISONS, `${id} : ${r}`).toContain(r);
      const fichiers = new Set<string>();
      for (const c of l.candidats) {
        const t = `${id} : ${c.fichier}`;
        expect(fichiers.has(c.fichier), t).toBe(false);
        fichiers.add(c.fichier);
        expect(c.licence, t).toMatch(LICENCES_PERMISES);
        if (/^CC BY/.test(c.licence)) expect(c.auteur !== null && !fauxAuteur(c.auteur), t).toBe(true);
        expect(c.w >= 1080 && c.h >= 720, t).toBe(true);
        expect(c.perte, t).toBe(Math.round(perteRecadrage(c.w, c.h) * 100) / 100);
        expect(c.page, t).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
        expect(c.miniature ?? '', t).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
        expect(c.sources.length, t).toBeGreaterThan(0);
        // Plus de coupe à 80 caractères (« Mongolia Expeditions… » est le texte même de Commons).
        expect(c.auteur?.length === 80 && c.auteur.endsWith('…'), t).toBe(false);
      }
    }
  });

  it('pauvre si moins de 3 candidats ont un sujet ; les zones contestées, les lieux revendiqués et les pays en guerre sont sensibles', () => {
    const enGuerre = new Set(['YEM', 'LBY', 'ISR']);
    for (const [id, l] of Object.entries(candidats.lieux)) {
      expect(Boolean(l.pauvre), id).toBe(l.comptes.avec_sujet < 3);
      const e = pays.find((p) => p.id === id);
      expect(Boolean(l.sensible), id).toBe(Boolean(e && (e.statut === 'conteste' || (e.revendique_par?.length ?? 0) > 0 || enGuerre.has(id))));
    }
  });

  it('lieux connus de l’échantillon : la France par son patrimoine, Cilaos par ses lieux, le golfe d’Aden pauvre sans la marine', () => {
    const fra = candidats.lieux.FRA!;
    expect(fra.candidats.length).toBe(10);
    expect(fra.candidats.filter((c) => c.sources.includes('patrimoine')).length).toBeGreaterThanOrEqual(8);
    expect(fra.candidats.map((c) => c.sujet)).toContain('pont du Gard');
    const cilaos = candidats.lieux['97424']!;
    expect(cilaos.nom).toBe('Cilaos');
    expect(cilaos.candidats.length).toBe(10);
    expect(cilaos.candidats.some((c) => c.sources.includes('commune'))).toBe(true);
    const aden = candidats.lieux.aden!;
    expect(aden.pauvre).toBeTruthy();
    for (const c of aden.candidats) expect(`${c.fichier} ${c.auteur}`).not.toMatch(/\b(USS|USNS|navy|U\.S\. Department of Defense)\b/i);
    expect(candidats.lieux.ESH?.sensible).toBe('zone contestée');
  });
});

describe('main.json : propositions à la main pour les mers pauvres', () => {
  it('chaque proposition vise une mer, a sa raison, et passe la règle (elle est dans les candidats de la mer)', () => {
    for (const [id, liste] of Object.entries(mainPhotos.mers)) {
      if (id === '_') continue;
      expect(sorteAttendue.get(id), id).toBe('mer');
      expect(Array.isArray(liste) && liste.length > 0, id).toBe(true);
      for (const p of liste as { fichier: string; raison: string }[]) {
        expect(p.raison, `${id} : ${p.fichier}`).toBeTruthy();
        expect(p.fichier, id).not.toMatch(/^File:/);
        const l = candidats.lieux[id];
        if (l) expect(l.candidats.find((c) => c.fichier === p.fichier)?.sources, `${id} : ${p.fichier}`).toContain('main');
      }
    }
    for (const [q, raison] of Object.entries(mainPhotos.sujets_sensibles)) if (q !== '_') expect(q.match(/^Q\d+$/) && raison, q).toBeTruthy();
  });
});

describe('choix.json (npm run photos:relecture)', () => {
  type Relecture = { fautesEntree: (id: string, e: unknown) => string[]; REGLE: string[]; MAX_GARDEES: number };
  const relecture = import('../geodata/photos/relecture.mjs' as string) as Promise<Relecture>;

  it('chaque entrée a sa forme : 5 photos au plus, licence et auteur, sujet ; aucune photo gardée : la raison (D60 a)', async () => {
    const { fautesEntree } = await relecture;
    expect(choix.v).toBe(1);
    for (const [id, e] of Object.entries(choix.lieux)) {
      expect(candidats.lieux[id], id).toBeTruthy();
      expect(fautesEntree(id, e), id).toEqual([]);
    }
  });

  it('fautesEntree attrape ce qui est faux', async () => {
    const { fautesEntree } = await relecture;
    const photo = { fichier: 'a.jpg', sujet: 'pont du Gard', licence: 'CC BY-SA 3.0', licence_url: null, auteur: 'X', titre: null, page: 'https://commons.wikimedia.org/wiki/File:A.jpg' };
    expect(fautesEntree('FRA', { etat: 'relu', relu_le: '2026-11-17T08:00:00Z', gardees: [photo] })).toEqual([]);
    expect(fautesEntree('FRA', { etat: 'relu', relu_le: '2026-11-17T08:00:00Z', gardees: [] })).toHaveLength(1);
    expect(fautesEntree('FRA', { etat: 'relu', relu_le: '2026-11-17T08:00:00Z', gardees: [], aucune: 'rien de bon' })).toEqual([]);
    expect(fautesEntree('FRA', { etat: 'en_cours', gardees: Array.from({ length: 6 }, (_, i) => ({ ...photo, fichier: `${i}.jpg` })) })).toHaveLength(1);
    expect(fautesEntree('FRA', { etat: 'en_cours', gardees: [{ ...photo, auteur: 'Own work' }] })).toHaveLength(1);
    expect(fautesEntree('FRA', { etat: 'en_cours', gardees: [{ ...photo, licence: 'CC BY-NC 2.0' }] })).toHaveLength(1);
    expect(fautesEntree('FRA', { etat: 'en_cours', gardees: [{ ...photo, sujet: 'IMG_0001.jpg' }] })).toHaveLength(1);
    expect(fautesEntree('FRA', { etat: 'en_cours', gardees: [{ ...photo, point: [1.2, 0.5] }] })).toHaveLength(1);
    expect(fautesEntree('FRA', { etat: 'en_cours', gardees: [photo, photo] })).toHaveLength(1);
    expect(fautesEntree('FRA', { etat: 'en_cours', gardees: [], ecartees: { 'b.jpg': '' } })).toHaveLength(1);
  });

  it('la règle de relecture est écrite, liberté de panorama et zones contestées comprises', async () => {
    const { REGLE, MAX_GARDEES } = await relecture;
    const texte = REGLE.join(' ');
    for (const m of ['cartes', 'conflit', 'visages', 'autre lieu', 'liberté de panorama', 'Zone contestée', 'aucune']) expect(texte, m).toContain(m);
    expect(MAX_GARDEES).toBe(5);
  });

  const fini = sorteAttendue.size === Object.values(choix.lieux).filter((e) => e.etat === 'relu').length;
  it.skipIf(!fini)('fin du lot P1 : les 332 lieux relus', () => {
    for (const id of sorteAttendue.keys()) expect(choix.lieux[id]?.etat, id).toBe('relu');
  });
});

describe('candidats.mjs : classement', () => {
  type Module = { choisir: (b: Map<string, { groupe: number; sujet_q: string | null; n: number | null }>, a: Map<string, unknown>) => { pris: string[]; reste: number }; fichierDe: (u: string) => string; sections: (t: string) => Record<string, string> };
  const mod = import('../geodata/photos/candidats.mjs' as string) as Promise<Module>;

  it('un fichier par sujet d’abord, par groupe puis notoriété ; les seconds fichiers ensuite ; les refusés jamais', async () => {
    const { choisir } = await mod;
    const b = new Map<string, { groupe: number; sujet_q: string | null; n: number | null }>([
      ['a1.jpg', { groupe: 2, sujet_q: 'Q1', n: 100 }],
      ['a2.jpg', { groupe: 2, sujet_q: 'Q1', n: 100 }],
      ['b.jpg', { groupe: 2, sujet_q: 'Q2', n: 50 }],
      ['m.jpg', { groupe: 0, sujet_q: null, n: null }],
      ['refus.jpg', { groupe: 0, sujet_q: 'Q3', n: 999 }],
      ['qi.jpg', { groupe: 5, sujet_q: null, n: null }],
    ]);
    const a = new Map([...b.keys()].filter((f) => f !== 'refus.jpg').map((f) => [f, {}]));
    expect(choisir(b, a)).toEqual({ pris: ['m.jpg', 'a1.jpg', 'b.jpg', 'qi.jpg', 'a2.jpg'], reste: 0 });
  });

  it('nom de fichier d’une valeur P18, et sections de requetes.rq', async () => {
    const { fichierDe, sections } = await mod;
    expect(fichierDe('http://commons.wikimedia.org/wiki/Special:FilePath/Pont%20du%20Gard%20BLS.jpg')).toBe('Pont du Gard BLS.jpg');
    const s = sections(readFileSync('geodata/photos/requetes.rq', 'utf8'));
    expect(Object.keys(s).sort()).toEqual(['commune', 'communes', 'cote', 'lieux', 'notables', 'notables_dans', 'patrimoine', 'patrimoine_dans']);
  });
});

// --- Lot P2 : traitement, listes du site, vérification --------------------------------

type Listes = {
  dresserListes: (choix: unknown, licences: unknown) => { listes: Record<string, { v: number; photos: PhotoListe[] }>; credits: { v: number; photos: { titre: string; auteur: string | null; licence: string; licence_url: string | null; page: string }[] }; manquantes: { id: string; fichier: string }[] };
  fichiersDuSite: (d: { choix: unknown; licences: unknown }) => { fileName: string; source: string }[];
  lireDonnees: (dossier?: string) => { choix: { v: number; lieux: Record<string, unknown> }; licences: { v: number; photos: Record<string, LignePhoto> } };
  NOM: RegExp;
};
type PhotoListe = { v: string; p: string; alt: { fr: string }; auteur: string | null; licence: string; licence_url: string | null; page: string };
type LignePhoto = { v: string; p: string; sha256_v: string; sha256_p: string; auteur: string | null; licence: string; licence_url: string | null; titre: string | null; page: string; point: number[] | null; lieux: string[] };
type Verifier = {
  dimensionsWebp: (b: Buffer) => { w: number; h: number } | null;
  fautesWebp: (racine: string, licences: unknown) => string[];
  fautesListes: (racine: string) => string[];
};
const listesMod = import('../geodata/photos/listes.mjs' as string) as Promise<Listes>;
const verifierMod = import('../geodata/photos/verifier.mjs' as string) as Promise<Verifier>;
const ESSAI = 'tests/photos-essai/choix.json';
type GardeeEssai = { fichier: string; sujet: string; point?: number[]; licence: string; auteur: string | null; page: string };
const choixEssai = lire<{ lieux: Record<string, { etat: string; gardees: GardeeEssai[] }>; dimensions: Record<string, [number, number]> }>(ESSAI);

/** Une ligne de licences.json factice pour un fichier (les noms tirés de son nom : pas de WebP derrière). */
function ligneFactice(fichier: string, g: { licence?: string; auteur?: string | null; page?: string }): LignePhoto {
  const h = createHash('sha256').update(fichier).digest('hex');
  return { v: h.slice(0, 10), p: h.slice(10, 20), sha256_v: h, sha256_p: h, auteur: g.auteur ?? null, licence: g.licence ?? 'CC0', licence_url: null, titre: null, page: g.page ?? '', point: null, lieux: [] };
}
function licencesFactices(sauf: string[] = []) {
  const photos: Record<string, LignePhoto> = {};
  for (const e of Object.values(choixEssai.lieux)) for (const g of e.gardees) if (!sauf.includes(g.fichier)) photos[g.fichier] = ligneFactice(g.fichier, g);
  return { v: 1, photos };
}

describe('listes du site (listes.mjs, écrites par le build)', () => {
  it('les lieux relus seulement, dans l’ordre de la relecture ; le texte alternatif est le sujet ; un lieu sans photo n’a pas de fichier', async () => {
    const { dresserListes } = await listesMod;
    const lic = licencesFactices();
    // FRA est en cours de relecture : une photo cochée, mais rien sur le site tant que le lieu n'est pas validé.
    const { listes, manquantes } = dresserListes(choixEssai, lic);
    expect(Object.keys(listes).sort()).toEqual(['97421', '97424', 'JPN']);
    expect(manquantes).toEqual([]);
    expect(listes.JPN!.photos.map((p) => p.alt.fr)).toEqual(choixEssai.lieux.JPN!.gardees.map((g) => g.sujet));
    expect(listes.JPN!.photos[0]).toEqual({ ...pick(lic.photos[choixEssai.lieux.JPN!.gardees[0]!.fichier]!), alt: { fr: 'préfecture de Kyoto' } });
    // Le golfe d'Aden relu sans photo (D60 a, « aucune ») : pas de liste, la fiche n'a pas de carrousel.
    expect(listes.aden).toBeUndefined();
  });

  it('une photo de deux lieux : un seul nom, une seule ligne de crédits, chaque lieu son texte alternatif', async () => {
    const { dresserListes } = await listesMod;
    const { listes, credits } = dresserListes(choixEssai, licencesFactices());
    const piton = listes['97424']!.photos[1]!;
    expect(listes['97421']!.photos).toEqual([{ ...piton, alt: { fr: 'piton des Neiges, vu de Salazie' } }]);
    expect(credits.photos.filter((c) => c.page === piton.page)).toHaveLength(1);
    expect(credits.photos).toHaveLength(5);
    // Le titre de Commons s'il y en a un, sinon le sujet (CC BY 2.0 à 3.0 demandent le titre de l'œuvre).
    expect(credits.photos.map((c) => c.titre)).toEqual([...credits.photos.map((c) => c.titre)].sort((a, b) => a.localeCompare(b, 'fr')));
    expect(credits.photos.map((c) => c.titre)).toContain('château de Himeji');
  });

  it('une photo gardée pas encore traitée n’est dans aucune liste, et elle est dite', async () => {
    const { dresserListes } = await listesMod;
    const { listes, manquantes } = dresserListes(choixEssai, licencesFactices(['Cilaos.JPG']));
    expect(manquantes).toEqual([{ id: '97424', fichier: 'Cilaos.JPG' }]);
    expect(listes['97424']!.photos.map((p) => p.alt.fr)).toEqual(['piton des Neiges']);
  });

  it('les fichiers du site : photos/l/<id>.json par lieu, photos/credits.json, en JSON', async () => {
    const { fichiersDuSite } = await listesMod;
    const f = fichiersDuSite({ choix: choixEssai, licences: licencesFactices() });
    expect(f.map((x) => x.fileName).sort()).toEqual(['photos/credits.json', 'photos/l/97421.json', 'photos/l/97424.json', 'photos/l/JPN.json']);
    for (const x of f) expect(JSON.parse(x.source).v).toBe(1);
    // ≈ 0,3 Ko par lieu (§ 3.5) : trois photos du Japon, crédits compris, sous 1,5 Ko.
    expect(f.find((x) => x.fileName === 'photos/l/JPN.json')!.source.length).toBeLessThan(1500);
  });
});

describe('licences.json et listes du dépôt (geodata/photos/)', () => {
  it('chaque photo gardée d’un lieu relu est traitée, et licences.json ne cite qu’elles (npm run photos:traiter)', async () => {
    const { dresserListes, lireDonnees } = await listesMod;
    const { licences } = lireDonnees('geodata/photos');
    expect(licences.v).toBe(1);
    const r = dresserListes(choix, licences);
    expect(r.manquantes, 'npm run photos:traiter').toEqual([]);
    const gardees = new Set(Object.values(choix.lieux).flatMap((e) => (e.etat === 'relu' ? ((e.gardees as { fichier: string }[] | undefined) ?? []).map((g) => g.fichier) : [])));
    expect(Object.keys(licences.photos).filter((f) => !gardees.has(f))).toEqual([]);
  });

  it('chaque ligne : deux noms de 10 caractères, uniques, début de leur SHA-256 ; licence permise ; auteur pour CC BY', async () => {
    const { lireDonnees, NOM } = await listesMod;
    const { fauxAuteur } = await regle;
    const { licences } = lireDonnees('geodata/photos');
    const noms = new Set<string>();
    for (const [f, l] of Object.entries(licences.photos)) {
      for (const t of ['v', 'p'] as const) {
        expect(l[t], f).toMatch(NOM);
        expect(l[`sha256_${t}`].startsWith(l[t]), f).toBe(true);
        expect(noms.has(`${t}/${l[t]}`), f).toBe(false);
        noms.add(`${t}/${l[t]}`);
      }
      expect(l.licence, f).toMatch(LICENCES_PERMISES);
      if (/^CC BY/.test(l.licence)) expect(l.auteur !== null && !fauxAuteur(l.auteur), f).toBe(true);
      expect(l.page, f).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it.skipIf(!existsSync('public/photos'))('les WebP de public/photos/ (sur le PC, après photos:traiter ou photos:restaurer) : présents, justes, aucun orphelin', async () => {
    const { lireDonnees } = await listesMod;
    const { fautesWebp } = await verifierMod;
    expect(fautesWebp('public', lireDonnees('geodata/photos').licences)).toEqual([]);
  });
});

/** Les champs d'une ligne de licences.json que la liste d'un lieu reprend. */
function pick(l: LignePhoto) {
  return { v: l.v, p: l.p, auteur: l.auteur, licence: l.licence, licence_url: l.licence_url, page: l.page };
}

const python = (() => {
  try {
    execFileSync('python3', ['-c', 'import PIL.features as f; assert f.check("webp")'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!python)('traiter.py sur les lieux d’essai (Pillow, sans réseau)', () => {
  let dossier = '';
  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'terramemo-photos-'));
    mkdirSync(join(dossier, 'donnees'));
    copyFileSync(ESSAI, join(dossier, 'donnees', 'choix.json'));
    execFileSync('python3', ['tests/photos-essai/sources.py', ESSAI, join(dossier, 'src')], { stdio: 'pipe' });
  }, 60_000);
  afterAll(() => {
    if (dossier) rmSync(dossier, { recursive: true, force: true });
  });
  const traiter = (...a: string[]) => execFileSync('python3', ['geodata/photos/traiter.py', '--donnees', join(dossier, 'donnees'), '--vers', join(dossier, 'site', 'photos'), '--sans-sauvegarde', '--sources', join(dossier, 'src'), ...a], { encoding: 'utf8' });

  it('deux WebP par photo, 480 × 320 et 1 080 × 720, nommés par leur SHA-256 ; licences.json les décrit ; une photo de deux lieux, un seul fichier', async () => {
    const sortie = traiter();
    expect(sortie).toContain('5 à traiter');
    const { fautesWebp, fautesListes, dimensionsWebp } = await verifierMod;
    const { lireDonnees, fichiersDuSite } = await listesMod;
    const d = lireDonnees(join(dossier, 'donnees'));
    expect(Object.keys(d.licences.photos)).toHaveLength(5);
    expect(d.licences.photos['Piton des Neiges1.JPG']!.lieux.sort()).toEqual(['97421', '97424']);
    expect(d.licences).toMatchObject({ pillow: expect.stringMatching(/^\d+\.\d+/), libwebp: expect.stringMatching(/^\d+\.\d+/) });
    expect(fautesWebp(join(dossier, 'site'), d.licences)).toEqual([]);
    // Les listes écrites dans le site citent des fichiers présents.
    for (const f of fichiersDuSite(d)) {
      mkdirSync(join(dossier, 'site', f.fileName, '..'), { recursive: true });
      writeFileSync(join(dossier, 'site', f.fileName), f.source);
    }
    expect(fautesListes(join(dossier, 'site'))).toEqual([]);
    const l = d.licences.photos['Himeji castle in may 2015.jpg']!;
    expect(dimensionsWebp(readFileSync(join(dossier, 'site', 'photos', 'p', `${l.p}.webp`)))).toEqual({ w: 1080, h: 720 });
    expect(dimensionsWebp(readFileSync(join(dossier, 'site', 'photos', 'v', `${l.v}.webp`)))).toEqual({ w: 480, h: 320 });
    expect(l).toMatchObject({ auteur: 'Nikos Kitsakis', licence: 'CC BY-SA 4.0', titre: 'Himeji castle in may 2015' });
  });

  it('photos:restaurer : un arbre de travail neuf reprend les WebP de la copie du PC, vérifiés ; rien de copié deux fois', async () => {
    type Restaurer = { restaurer: (l: unknown, depuis: string, vers: string) => { copies: number; deja: number; absents: string[] } };
    const { restaurer } = (await import('../geodata/photos/restaurer.mjs' as string)) as Restaurer;
    const { lireDonnees } = await listesMod;
    const { fautesWebp } = await verifierMod;
    const { licences } = lireDonnees(join(dossier, 'donnees'));
    const neuf = join(dossier, 'neuf', 'photos');
    expect(restaurer(licences, join(dossier, 'site', 'photos'), neuf)).toEqual({ copies: 10, deja: 0, absents: [] });
    expect(fautesWebp(join(dossier, 'neuf'), licences)).toEqual([]);
    expect(restaurer(licences, join(dossier, 'site', 'photos'), neuf)).toEqual({ copies: 0, deja: 10, absents: [] });
    const r = restaurer(licences, join(dossier, 'vide'), join(dossier, 'autre', 'photos'));
    expect(r.absents).toHaveLength(10);
  });

  it('relancé : rien n’est refait (les WebP sont gardés) ; un point changé refait la photo ; --elaguer retire l’ancien fichier', async () => {
    const avant = readFileSync(join(dossier, 'donnees', 'licences.json'), 'utf8');
    expect(traiter()).toContain('0 à traiter');
    const apres = JSON.parse(readFileSync(join(dossier, 'donnees', 'licences.json'), 'utf8')) as { photos: Record<string, LignePhoto> };
    const a = JSON.parse(avant) as { photos: Record<string, LignePhoto> };
    for (const f of Object.keys(a.photos)) expect(apres.photos[f]!.p, f).toBe(a.photos[f]!.p);
    const c = JSON.parse(readFileSync(join(dossier, 'donnees', 'choix.json'), 'utf8')) as typeof choixEssai;
    c.lieux['97424']!.gardees[0]!.point = [0.1, 0.5];
    writeFileSync(join(dossier, 'donnees', 'choix.json'), JSON.stringify(c));
    expect(traiter()).toContain('1 à traiter');
    const refait = JSON.parse(readFileSync(join(dossier, 'donnees', 'licences.json'), 'utf8')) as { photos: Record<string, LignePhoto> };
    expect(refait.photos['Cilaos.JPG']!.p).not.toBe(a.photos['Cilaos.JPG']!.p);
    const { fautesWebp } = await verifierMod;
    expect(fautesWebp(join(dossier, 'site'), refait).filter((f) => f.includes('orphelin'))).toHaveLength(2);
    expect(traiter('--elaguer')).toContain('retiré');
    expect(fautesWebp(join(dossier, 'site'), refait)).toEqual([]);
  });

  it('le recadrage est celui de l’aperçu de l’outil de relecture (cadrage de relecture-logique.mjs)', async () => {
    type Logique = { cadrage: (c: { w: number; h: number }, p?: number[] | null) => { cw: number; ch: number; ox: number; oy: number } };
    const { cadrage } = (await import('../geodata/photos/relecture-logique.mjs' as string)) as Logique;
    const cas: [number, number, number[] | null][] = [
      [3648, 5472, [0.5, 0.3]],
      [5632, 3754, null],
      [2304, 1354, [0.9, 0.1]],
      [6000, 1100, [0.2, 0.5]],
      [1080, 720, [0, 1]],
    ];
    const code = `import json,sys; sys.path.insert(0,'geodata/photos'); from traiter import cadrage; print(json.dumps([cadrage(w,h,p) for w,h,p in ${JSON.stringify(cas).replace(/null/g, 'None')}]))`;
    const py = JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' })) as number[][];
    cas.forEach(([w, h, p], i) => {
      const j = cadrage({ w, h }, p);
      expect(py[i]!.map((x) => Math.round(x * 1000) / 1000), `${w}×${h}`).toEqual([j.ox, j.oy, j.cw, j.ch].map((x) => Math.round(x * 1000) / 1000));
    });
  });

  it('largeur demandée à Commons : 1 920 px, plus pour un panorama (720 px de haut une fois recadré), jamais plus que l’original', () => {
    const code = `import sys; sys.path.insert(0,'geodata/photos'); from traiter import largeur_voulue as l; print(l(5632,3754), l(1417,1062), l(8000,1200), l(3648,5472))`;
    expect(execFileSync('python3', ['-c', code], { encoding: 'utf8' }).trim()).toBe('1920 1417 4800 1920');
  });
});

describe('verifier.mjs : en-tête WebP et fautes', () => {
  it('dimensions lues dans les trois formes d’en-tête (VP8, VP8L, VP8X), null sinon', async () => {
    const { dimensionsWebp } = await verifierMod;
    const riff = (morceau: string, donnees: number[]) => Buffer.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Buffer.from(morceau), 0, 0, 0, 0, ...donnees, ...new Array(12).fill(0)]);
    expect(dimensionsWebp(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x38, 0x04, 0xd0, 0x02]))).toEqual({ w: 1080, h: 720 });
    // VP8L : 0x2f, puis largeur − 1 et hauteur − 1 sur 14 bits chacune (479 et 319).
    const bits = 479 | (319 << 14);
    expect(dimensionsWebp(riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff]))).toEqual({ w: 480, h: 320 });
    expect(dimensionsWebp(riff('VP8X', [0, 0, 0, 0, 0x37, 0x04, 0x00, 0xcf, 0x02, 0x00]))).toEqual({ w: 1080, h: 720 });
    expect(dimensionsWebp(Buffer.from('pas un webp, assez long pour être lu en entier'))).toBeNull();
  });

  it('une photo absente, un nom qui n’est pas l’empreinte, un orphelin : chacun dit', async () => {
    const { fautesWebp } = await verifierMod;
    const d = mkdtempSync(join(tmpdir(), 'terramemo-verifier-'));
    try {
      mkdirSync(join(d, 'photos', 'v'), { recursive: true });
      mkdirSync(join(d, 'photos', 'p'), { recursive: true });
      writeFileSync(join(d, 'photos', 'v', '0123456789.webp'), 'faux');
      writeFileSync(join(d, 'photos', 'p', 'abcdefabcd.webp'), 'orphelin');
      const lic = { v: 1, photos: { 'a.jpg': { ...ligneFactice('a.jpg', {}), v: '0123456789', p: 'fedcba9876', sha256_v: '0123456789' + '0'.repeat(54) } } };
      const f = fautesWebp(d, lic);
      expect(f.some((x) => x.includes('début de son SHA-256'))).toBe(true);
      expect(f.some((x) => x.includes('pas un WebP'))).toBe(true);
      expect(f.some((x) => x.includes('p/fedcba9876.webp absent'))).toBe(true);
      expect(f.some((x) => x.includes('abcdefabcd.webp : orphelin'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
