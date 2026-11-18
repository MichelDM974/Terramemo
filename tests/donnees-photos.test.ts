// Photos des fiches (#34, lot P1 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3 et § 7) : la table des QID des territoires et des zones (geodata/fiches-main.json,
// clé qid), la règle des licences (geodata/photos/regle.mjs) sur un jeu d'essai tiré des
// 1 917 fichiers du relevé R5, la forme de geodata/photos/candidats.json, main.json et
// choix.json. Sans réseau.
import { createHash } from 'node:crypto';
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

  it('pauvre si moins de 3 candidats ont un sujet ; les zones contestées et les lieux revendiqués sont sensibles', () => {
    for (const [id, l] of Object.entries(candidats.lieux)) {
      expect(Boolean(l.pauvre), id).toBe(l.comptes.avec_sujet < 3);
      const e = pays.find((p) => p.id === id);
      expect(Boolean(l.sensible), id).toBe(Boolean(e && (e.statut === 'conteste' || (e.revendique_par?.length ?? 0) > 0)));
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
