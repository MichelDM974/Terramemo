// Drapeaux des pays (étude J2, § 2.2 et § 2.5 ; décision « Drapeaux contestés et sosies »),
// appelé par geodata/build.mjs (tout le build, ou --seulement drapeaux) ; sans réseau (les
// sources sont téléchargées et vérifiées par build.mjs), sans effet à l'import. Lit :
//   geodata/raw/flag-icons/flag-icons-7.6.0.tgz  le paquet npm de flag-icons (MIT), lu par
//                      le lecteur tar d'outils.mjs : format 4:3 seul (le 1:1 pèse autant)
//   geodata/raw/commons/Flag_of_the_Taliban.svg  le drapeau de l'Émirat islamique
//                      d'Afghanistan (Wikimedia Commons, domaine public)
//                      (empreintes des deux dans geodata/sources.lock.json, vérifiées ici aussi)
//   geodata/drapeaux-main.json  table à la main (corrections, drapeaux justes en plus,
//                      jumeaux, familles), une source par ligne
//   public/geo/pays.json  les pays jouables et optionnels (sortie du build)
// Produit (identiques octet pour octet d'un lancement à l'autre) :
//   drapeaux/<sha8>.svg  un fichier par drapeau, nommé par les 8 premiers chiffres du
//                      SHA-256 de son contenu : immuable (firebase.json), l'adresse ne
//                      trahit pas le pays. L'id « flag-icons-xx » est retiré et les ids
//                      internes « xx-a » deviennent « d-a » : rien n'y nomme le pays ;
//   drapeaux.json      {pays: [{pays, d, j?, s}], familles: {nom: [ids]}} : d les drapeaux
//                      justes du pays (empreintes), le premier montré (Reconnaître, D41) ;
//                      j ses jumeaux (même drapeau à l'écran, juste sous le sujet
//                      Drapeaux) ; s ses 3 plus proches sosies [id, score], jumeaux
//                      exceptés, score de 0 (pareils) à 1 (rien de commun), du plus
//                      proche au moins proche ; familles : celles que la mesure rate,
//                      écrites à la main (croix nordiques, Union Jack…) ;
//   licences/flag-icons.txt  le LICENSE de flag-icons tel quel (MIT : l'avis et le texte
//                      accompagnent toute copie), hors du dossier immuable.
// Sosies : portage de ressemblances3.py (relevé du 10/11, ~/Sauvegardes/terramemo/
// j2-conception/drapeaux/scripts/) : le drapeau montré de chaque pays rendu par resvg-wasm
// en 64 × 48 px sur fond blanc, réduit en grille de 16 × 12 (cases de 4 px), en CIELAB ;
// le score d'une paire est la part de la grille où les deux diffèrent nettement
// (ΔE2000 > 20), le drapeau retourné (haut-bas ou gauche-droite) comptant aussi avec
// 0,08 de pénalité. ressemblances() ne lit que les SVG produits : les tests la refont en
// CI sur les fichiers versionnés (S33 : même rendu sur le PC et en CI).
// Échoue (exception) si les sources et la table ne s'accordent plus : une correction
// qui ne s'applique plus, un pays sans drapeau, un SVG qui charge autre chose que
// lui-même, une paire de drapeaux pareils hors de la liste des jumeaux.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { lireTar, sha256 } from './outils.mjs';

export const VERSION_FLAG_ICONS = '7.6.0';

export const CHEMINS = {
  script: 'geodata/drapeaux.mjs',
  main: 'geodata/drapeaux-main.json',
  verrou: 'geodata/sources.lock.json',
  raw: 'geodata/raw',
};

/**
 * Sources téléchargées par build.mjs (dans geodata/raw/, empreintes au verrou) ; nom,
 * url, version et licence vont dans public/geo/sources.json.
 */
export const SOURCES_DRAPEAUX = [
  {
    cle: 'flag-icons',
    nom: 'flag-icons, drapeaux des pays au format 4:3 (paquet npm)',
    url: 'https://github.com/lipis/flag-icons',
    version: `${VERSION_FLAG_ICONS} (npm)`,
    licence:
      'MIT, avis « Copyright (c) 2013 Panayiotis Lipiridis » ; texte complet (à joindre à toute copie) dans ' +
      'licences/flag-icons.txt, à côté de ce fichier',
    fichiers: [
      {
        chemin: `flag-icons/flag-icons-${VERSION_FLAG_ICONS}.tgz`,
        url: `https://registry.npmjs.org/flag-icons/-/flag-icons-${VERSION_FLAG_ICONS}.tgz`,
      },
    ],
  },
  {
    cle: 'commons-emirat',
    nom: 'Wikimedia Commons, drapeau de l’Émirat islamique d’Afghanistan (« Flag of the Taliban.svg », P41 de Wikidata au rang préféré depuis le 15/08/2021)',
    url: 'https://commons.wikimedia.org/wiki/File:Flag_of_the_Taliban.svg',
    version: 'version du 2026-03-31T17:04:45Z',
    licence: 'Domaine public (Wikimedia Commons), mention facultative',
    fichiers: [
      {
        chemin: 'commons/Flag_of_the_Taliban.svg',
        url: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Flag_of_the_Taliban.svg',
      },
    ],
  },
];

// Ressemblance (ressemblances3.py) : grille, seuil de ΔE2000, pénalité du retournement.
const GRILLE_L = 16;
const GRILLE_H = 12;
const CASE_PX = 4; // rendu de 64 × 48 px (les PNG du relevé, png64/), cases de 4 × 4
const SEUIL_DE = 20;
const PENALITE_RETOURNE = 0.08;
export const N_SOSIES = 3;

const parId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => k !== '_');
// Arrondi à 2 décimales de Python (round : au pair sur une égalité exacte, toFixed va au-dessus).
// Une égalité exacte demande un nombre dyadique de la forme (2j + 1)/200 : 0,125, 0,375,
// 0,625 et 0,875 seulement (un écart de k/192, ou k/192 + 0,08 qui n'est jamais exact).
const EGALITES = new Map([
  [0.125, 0.12],
  [0.375, 0.38],
  [0.625, 0.62],
  [0.875, 0.88],
]);
const arrondi2 = (x) => EGALITES.get(x) ?? Number(x.toFixed(2));
const sha8 = (texte) => sha256(texte).slice(0, 8);

// --- Contenu des SVG ----------------------------------------------------------------

/**
 * Ce qu'un SVG servi ne doit pas contenir : script, gestionnaire d'événement, image,
 * objet étranger, feuille de style, entité ; toute référence (href, url()) est interne
 * (« #… »). Rend la liste des fautes (vide si sain). Lu aussi par les tests.
 */
export function fautesSvg(texte) {
  const fautes = [];
  for (const [motif, nom] of [
    [/<script\b/i, 'script'],
    [/\son[a-z]+\s*=/i, 'gestionnaire d’événement'],
    [/<image\b/i, 'image'],
    [/<foreignObject\b/i, 'objet étranger'],
    [/<style\b/i, 'feuille de style'],
    [/<!(DOCTYPE|ENTITY)\b/i, 'DOCTYPE ou entité'],
    [/<\?xml-stylesheet/i, 'feuille de style XML'],
  ]) {
    if (motif.test(texte)) fautes.push(nom);
  }
  for (const m of texte.matchAll(/\bhref\s*=\s*["']([^"']*)["']/g)) if (!m[1].startsWith('#')) fautes.push(`lien ${m[1]}`);
  for (const m of texte.matchAll(/url\(\s*["']?([^"')]*)/g)) if (!m[1].startsWith('#')) fautes.push(`url(${m[1]})`);
  const vb = /^<svg\b[^>]*\sviewBox="([^"]+)"/.exec(texte);
  const [, , w, h] = (vb?.[1] ?? '').split(/[\s,]+/).map(Number);
  if (!vb || Math.abs(w / h - 4 / 3) > 1e-9) fautes.push(`viewBox ${vb?.[1] ?? 'absente'} pas en 4:3`);
  return fautes;
}

/**
 * Un drapeau de flag-icons rendu anonyme : l'id « flag-icons-<code> » de la racine retiré,
 * les ids internes « <code>-a » (et leurs références) renommés « d-a ».
 */
function anonymiser(texte, code) {
  const racine = ` id="flag-icons-${code}"`;
  if (texte.split(racine).length !== 2) throw new Error(`${code}.svg : id${racine} absent ou en double`);
  return texte.replace(racine, '').replace(new RegExp(`(\\bid="|href="#|url\\(#)${code}-`, 'g'), '$1d-');
}

/** Chaque remplacement [avant, après] s'applique au moins une fois, sinon faute. */
function remplacer(texte, paires, ou, faute) {
  let t = texte;
  for (const [avant, apres] of paires ?? []) {
    if (!t.includes(avant)) faute(`${ou} : « ${avant.slice(0, 60)} » introuvable (la correction ne s'applique plus)`);
    t = t.replaceAll(avant, apres);
  }
  return t;
}

/**
 * Les n premiers éléments d'un drapeau de flag-icons (un par ligne, « <path …/> » au
 * premier niveau) : le drapeau civil de la Bolivie, ses trois bandes sans les armoiries.
 */
function garder(texte, n, ou, faute) {
  const lignes = texte.split('\n');
  const enfants = lignes.slice(1, 1 + n);
  if (!lignes[0].startsWith('<svg ') || enfants.length !== n || enfants.some((l) => !/^ {2}<path [^>]*\/>$/.test(l))) {
    faute(`${ou} : les ${n} premiers éléments ne sont plus ${n} lignes « <path …/> »`);
  }
  return `${[lignes[0], ...enfants, '</svg>'].join('\n')}\n`;
}

// --- Ressemblance (portage de ressemblances3.py) ---------------------------------------

/** sRGB (0-255) → CIELAB (D65), comme ressemblances3.py. */
function lab([r8, g8, b8]) {
  const lin = (c8) => {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(r8), lin(g8), lin(b8)];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** ΔE2000 entre deux couleurs CIELAB (Sharma, Wu et Dalal, 2005), comme ressemblances3.py. */
export function de2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const mod360 = (x) => ((x % 360) + 360) % 360;
  const h1p = mod360(deg(Math.atan2(b1, a1p)));
  const h2p = mod360(deg(Math.atan2(b2, a2p)));
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hm;
  if (C1p * C2p === 0) hm = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hm = (h1p + h2p) / 2;
  else hm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const dth = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cmp;
  const SH = 1 + 0.015 * Cmp * T;
  const RT = -Math.sin(rad(2 * dth)) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

let resvgPret = null;

/** La classe Resvg, son module WebAssembly chargé une fois (les tests s'en servent aussi). */
export async function chargerResvg() {
  const mod = await import('@resvg/resvg-wasm');
  resvgPret ??= (async () => {
    const wasm = await readFile(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm'));
    try {
      await mod.initWasm(wasm);
    } catch (e) {
      // Déjà chargé par une autre instance de ce module (tests : un registre par fichier).
      if (!/already initialized/i.test(String(e?.message))) throw e;
    }
  })();
  await resvgPret;
  return mod.Resvg;
}

// Réduction comme Image.resize(…, Image.BOX) de Pillow, que ressemblances3.py appelait :
// deux passes (lignes, puis colonnes), chacune en virgule fixe de 22 bits et arrondie à
// l'octet (Resample.c, PRECISION_BITS = 32 - 8 - 2). Une moyenne exacte s'écarte de 1 sur
// quelques valeurs, et une rangée de cases près du seuil de ΔE suffit à changer un score
// de 0,08 : comparé au relevé le 11/11/2026, même rendu et mêmes scores.
const BITS = 22;
const COEF = Math.trunc(0.5 + (1 / CASE_PX) * 2 ** BITS);
const octet = (ss) => Math.min(255, Math.max(0, Math.floor(ss / 2 ** BITS)));

/**
 * Grille 16 × 12 en CIELAB d'un drapeau : rendu de 64 × 48 (prémultiplié) posé sur
 * fond blanc, comme le PNG du relevé passé par alpha_composite, puis réduit.
 */
function grille(Resvg, texte) {
  const r = new Resvg(texte, { fitTo: { mode: 'width', value: GRILLE_L * CASE_PX } });
  const img = r.render();
  const { width, height } = img;
  const px = img.pixels;
  img.free();
  r.free();
  if (width !== GRILLE_L * CASE_PX || height !== GRILLE_H * CASE_PX) throw new Error(`rendu de ${width} × ${height} px, attendu ${GRILLE_L * CASE_PX} × ${GRILLE_H * CASE_PX}`);
  // Passe des lignes : height × 16 cases, chaque valeur arrondie à l'octet.
  const lignes = new Uint8Array(height * GRILLE_L * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < GRILLE_L; x++) {
      for (let k = 0; k < 3; k++) {
        let ss = 2 ** (BITS - 1);
        for (let i = 0; i < CASE_PX; i++) {
          const o = (y * width + x * CASE_PX + i) * 4;
          ss += (px[o + k] + 255 - px[o + 3]) * COEF; // sur blanc : c + (255 - alpha)
        }
        lignes[(y * GRILLE_L + x) * 3 + k] = octet(ss);
      }
    }
  }
  // Passe des colonnes, puis CIELAB.
  const g = [];
  for (let y = 0; y < GRILLE_H; y++) {
    for (let x = 0; x < GRILLE_L; x++) {
      const rgb = [0, 1, 2].map((k) => {
        let ss = 2 ** (BITS - 1);
        for (let j = 0; j < CASE_PX; j++) ss += lignes[((y * CASE_PX + j) * GRILLE_L + x) * 3 + k] * COEF;
        return octet(ss);
      });
      g.push(lab(rgb));
    }
  }
  return g;
}

function retourner(g, sens) {
  const r = [];
  for (let y = 0; y < GRILLE_H; y++) {
    for (let x = 0; x < GRILLE_L; x++) {
      const yy = sens === 'v' ? GRILLE_H - 1 - y : y;
      const xx = sens === 'h' ? GRILLE_L - 1 - x : x;
      r.push(g[yy * GRILLE_L + xx]);
    }
  }
  return r;
}

/** Part de la grille (0 à 1) où deux drapeaux diffèrent nettement. */
function ecart(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (de2000(a[i], b[i]) > SEUIL_DE) n++;
  return n / a.length;
}

/**
 * Score de chaque paire de drapeaux, arrondi à 2 décimales : textes, Map id → SVG.
 * Rend Map « A|B » (A < B) → score. Sans dépendre du tarball : les tests la refont sur
 * les fichiers versionnés.
 */
export async function ressemblances(textes) {
  const Resvg = await chargerResvg();
  const ids = [...textes.keys()].sort(parId);
  const g = new Map(ids.map((id) => [id, grille(Resvg, textes.get(id))]));
  const v = new Map(ids.map((id) => [id, retourner(g.get(id), 'v')]));
  const h = new Map(ids.map((id) => [id, retourner(g.get(id), 'h')]));
  const scores = new Map();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]];
      const s = Math.min(ecart(g.get(a), g.get(b)), ecart(g.get(a), v.get(b)) + PENALITE_RETOURNE, ecart(g.get(a), h.get(b)) + PENALITE_RETOURNE);
      scores.set(`${a}|${b}`, arrondi2(s));
    }
  }
  return scores;
}

const cle = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// --- Manifeste ------------------------------------------------------------------------

/**
 * drapeaux.json à partir des drapeaux justes de chaque pays et de leurs SVG. lignes :
 * [{pays, d: [sha8…]}] dans l'ordre de pays.json, le premier montré ; textes : Map sha8 →
 * SVG ; main : la table. Rend { texte, scores, fautes, notes }. Le même chemin pour le
 * build et pour les tests (qui le refont sur les fichiers versionnés, sans le tarball).
 */
export async function manifeste(lignes, textes, main) {
  const fautes = [];
  const notes = [];
  const ids = new Set(lignes.map((l) => l.pays));
  const montres = new Map(lignes.map((l) => [l.pays, textes.get(l.d[0])]));
  const scores = await ressemblances(montres);
  const score = (a, b) => scores.get(cle(a, b));

  // Jumeaux : écrits à la main, et chaque paire de drapeaux pareils (score 0) l'est.
  const jumeaux = new Map([...ids].map((id) => [id, []]));
  for (const [i, j] of (main.jumeaux ?? []).entries()) {
    const [a, b] = j.pays ?? [];
    if (!ids.has(a) || !ids.has(b) || a === b) {
      fautes.push(`jumeaux[${i}] : ${a}, ${b} inconnus ou égaux`);
      continue;
    }
    if (score(a, b) !== 0) fautes.push(`jumeaux : ${a} et ${b} ne sont plus pareils (score ${score(a, b)})`);
    jumeaux.get(a).push(b);
    jumeaux.get(b).push(a);
  }
  for (const [k, s] of scores) {
    const [a, b] = k.split('|');
    if (s === 0 && !jumeaux.get(a).includes(b)) fautes.push(`${a} et ${b} ont le même drapeau (score 0) : à ajouter aux jumeaux`);
  }

  // Sosies : les N_SOSIES plus proches, jumeaux exceptés, à égalité par id.
  const sosies = new Map();
  for (const a of ids) {
    const autres = [...ids].filter((b) => b !== a && !jumeaux.get(a).includes(b)).map((b) => [b, score(a, b)]);
    autres.sort((x, y) => x[1] - y[1] || parId(x[0], y[0]));
    sosies.set(a, autres.slice(0, N_SOSIES));
  }

  // Familles que la mesure rate.
  const familles = {};
  for (const [nom, f] of sansNotes(main.familles)) {
    const inconnus = (f.pays ?? []).filter((id) => !ids.has(id));
    if (inconnus.length) fautes.push(`familles, ${nom} : ${inconnus.join(', ')} inconnus`);
    if ((f.pays ?? []).length < 2) fautes.push(`familles, ${nom} : moins de deux pays`);
    familles[nom] = [...new Set(f.pays)].sort(parId);
  }

  const ligne = (l) => {
    const o = { pays: l.pays, d: l.d };
    const j = jumeaux.get(l.pays).sort(parId);
    if (j.length) o.j = j;
    o.s = sosies.get(l.pays);
    return JSON.stringify(o);
  };
  const noms = Object.keys(familles).sort(parId);
  const texte =
    `{\n"pays":[\n${lignes.map(ligne).join(',\n')}\n],\n` +
    `"familles":{\n${noms.map((n) => `${JSON.stringify(n)}:${JSON.stringify(familles[n])}`).join(',\n')}\n}\n}\n`;
  const proches = [...sosies.values()].filter((s) => s[0][1] <= 0.1).length;
  notes.push(`sosies : ${proches} pays ont un quasi-jumeau (score ≤ 0,1), jumeaux exceptés`);
  return { texte, scores, fautes, notes };
}

// --- Construction ----------------------------------------------------------------------

/**
 * Construit les fichiers servis. racine : la racine du dépôt. Rend { fichiers: {nom:
 * texte} (drapeaux.json, licences/flag-icons.txt), svgs: {sha8: texte}, sources,
 * entrees, notes } : sources et entrees vont dans public/geo/sources.json
 * (fusionnerPartie d'outils.mjs), notes s'affichent au build.
 */
export async function construireDrapeaux(racine) {
  const fautes = [];
  const faute = (m) => fautes.push(m);
  const lire = (c) => readFile(join(racine, c));
  const [mainBrut, scriptBrut, verrouBrut, paysBrut] = await Promise.all([CHEMINS.main, CHEMINS.script, CHEMINS.verrou, 'public/geo/pays.json'].map(lire));
  const main = JSON.parse(mainBrut.toString('utf8'));
  const verrou = JSON.parse(verrouBrut.toString('utf8'));
  const pays = JSON.parse(paysBrut.toString('utf8')).filter((p) => p.statut === 'jouable' || p.statut === 'optionnel');
  const ids = new Set(pays.map((p) => p.id));

  // Sources brutes, vérifiées contre le verrou (build.mjs l'a déjà fait ; les tests aussi passent ici).
  const brut = {};
  for (const s of SOURCES_DRAPEAUX) {
    for (const f of s.fichiers) {
      const b = await readFile(join(racine, CHEMINS.raw, f.chemin));
      const attendu = verrou[s.cle]?.fichiers?.[f.chemin];
      if (sha256(b) !== attendu) throw new Error(`drapeaux : ${f.chemin}, empreinte ${sha256(b)} ≠ verrou ${attendu ?? '(absente)'}`);
      brut[s.cle] = b;
    }
  }
  const tar = lireTar(gunzipSync(brut['flag-icons']));
  const paquet = JSON.parse(tar.get('package/package.json')?.toString('utf8') ?? '{}');
  if (paquet.version !== VERSION_FLAG_ICONS || paquet.license !== 'MIT') faute(`flag-icons : version ${paquet.version}, licence ${paquet.license}`);
  const licence = tar.get('package/LICENSE')?.toString('utf8') ?? '';
  if (!/Copyright \(c\) 2013 Panayiotis Lipiridis/.test(licence) || !/Permission is hereby granted/.test(licence)) faute('flag-icons : LICENSE sans l’avis ou le texte MIT');

  for (const [s, cles] of [
    ['corrections', sansNotes(main.corrections).map(([k]) => k)],
    ['autres', sansNotes(main.autres).map(([k]) => k)],
  ]) {
    for (const id of cles) if (!ids.has(id)) faute(`${CHEMINS.main}, ${s} : pays ${id} inconnu (ni jouable ni optionnel)`);
  }

  /** Le drapeau de flag-icons d'un pays, corrigé selon la table, puis anonyme. */
  const deFlagIcons = (p) => {
    const code = p.a2?.toLowerCase();
    const b = code && tar.get(`package/flags/4x3/${code}.svg`);
    if (!b) {
      faute(`${p.id} : aucun drapeau ${code}.svg dans flag-icons`);
      return null;
    }
    const corrige = remplacer(b.toString('utf8'), main.corrections?.[p.id]?.remplacer, `corrections, ${p.id}`, faute);
    return anonymiser(corrige, code);
  };

  const svgs = new Map(); // sha8 → texte
  const ajouter = (texte, ou) => {
    for (const f of fautesSvg(texte)) faute(`${ou} : ${f}`);
    const h = sha8(texte);
    if (svgs.has(h) && svgs.get(h) !== texte) faute(`${ou} : empreinte ${h} déjà prise par un autre drapeau`);
    svgs.set(h, texte);
    return h;
  };
  const lignes = [];
  for (const p of pays) {
    const base = deFlagIcons(p);
    if (base === null) continue;
    const d = [ajouter(base, p.id)];
    const autre = main.autres?.[p.id];
    if (autre) {
      let texte;
      if (autre.de === 'flag-icons') texte = base;
      else if (brut[autre.de]) texte = brut[autre.de].toString('utf8');
      else {
        faute(`autres, ${p.id} : source ${autre.de} inconnue`);
        continue;
      }
      texte = remplacer(texte, autre.remplacer, `autres, ${p.id}`, faute);
      if (autre.garder) texte = garder(texte, autre.garder, `autres, ${p.id}`, faute);
      const h = ajouter(texte, `${p.id} (autre)`);
      if (h === d[0]) faute(`autres, ${p.id} : le même drapeau que celui de flag-icons`);
      if (autre.montre) d.unshift(h);
      else d.push(h);
    }
    lignes.push({ pays: p.id, d });
  }
  if (fautes.length) throw new Error(`drapeaux :\n  ${fautes.join('\n  ')}`);

  const m = await manifeste(lignes, svgs, main);
  if (m.fautes.length) throw new Error(`drapeaux :\n  ${m.fautes.join('\n  ')}`);

  const sources = SOURCES_DRAPEAUX.map((s) => ({
    nom: s.nom,
    url: s.url,
    version: s.version,
    licence: s.licence,
    telecharge_le: verrou[s.cle].telecharge_le,
    fichiers: s.fichiers.map((f) => ({ url: f.url, sha256: verrou[s.cle].fichiers[f.chemin] })),
  }));
  const entrees = { [CHEMINS.script]: sha256(scriptBrut), [CHEMINS.main]: sha256(mainBrut) };
  const notes = [`${lignes.length} pays, ${svgs.size} drapeaux, ${lignes.filter((l) => l.d.length > 1).length} pays à deux drapeaux justes`, ...m.notes];
  return {
    fichiers: { 'drapeaux.json': m.texte, 'licences/flag-icons.txt': licence },
    svgs: Object.fromEntries([...svgs].sort(([a], [b]) => parId(a, b))),
    sources,
    entrees,
    notes,
  };
}
