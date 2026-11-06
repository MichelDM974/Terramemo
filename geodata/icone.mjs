#!/usr/bin/env node
// L'icône de Terramemo, « globe de la mémoire » (choix de l'utilisateur, 06/11/2026) :
// le globe centré sur l'Afrique et l'océan Indien, ses régions colorées comme la carte
// colore les pays selon ce qu'on en retient (vert : su, ambre : fragile, rouge : à
// revoir), cerclé de l'accent du projet. Une couleur par sous-région de l'ONU, pas
// par pays : l'icône reste lisible à 48 px.
//
// Usage : npm run icone. Lit public/geo/monde-leger.topo.json et pays.json, écrit :
//   src/icone.svg                                           onglet du navigateur et logo
//                                                           de l'en-tête (Vite lui donne
//                                                           une adresse à empreinte)
//   android/app/src/main/res/drawable/ic_launcher_*.xml     icône adaptative (fond,
//                                                           globe, monochrome d'Android 13+)
//   android/app/src/main/res/mipmap-*/ic_launcher*.png      icônes d'avant Android 8
// Les PNG sont photographiés par le chromium de ~/.cache/ms-playwright (celui du pilote).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoOrthographic, geoPath } from 'd3-geo';
import { merge } from 'topojson-client';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(RACINE, 'android/app/src/main/res');

// Couleurs de src/style.css (--good, --danger, --accent, mer de l'icône) et ambre.
const COULEURS = { g: '#34C77B', a: '#F2B544', r: '#F0686B' };
const MER = '#132449';
const ACCENT = '#3D72F0';
const FOND = ['#101A33', '#07080B'];

// Couleur de chaque sous-région : voisines différentes autant que possible, un peu de
// tout sur la face visible. Le reste du monde (caché derrière) en vert.
const MEMOIRE = {
  'Western Europe': 'g',
  'Northern Europe': 'r',
  'Southern Europe': 'a',
  'Eastern Europe': 'g',
  'Northern Africa': 'a',
  'Western Africa': 'g',
  'Middle Africa': 'r',
  'Eastern Africa': 'g',
  'Southern Africa': 'a',
  'Western Asia': 'r',
  'Central Asia': 'a',
  'Southern Asia': 'g',
  'Eastern Asia': 'r',
  'South-Eastern Asia': 'a',
};

const topo = JSON.parse(readFileSync(join(RACINE, 'public/geo/monde-leger.topo.json'), 'utf8'));
const pays = JSON.parse(readFileSync(join(RACINE, 'public/geo/pays.json'), 'utf8'));
const region = new Map(pays.map((p) => [p.id, p.sous_region]));
const geometries = topo.objects.pays.geometries;

// Globe de rayon 100 autour de (0, 0) : une unité fait moins d'un pixel à 192 px,
// d'où des coordonnées entières, des tracés simplifiés à TOLERANCE près
// (Douglas-Peucker) et les îlots de moins de AIRE_MIN unités² écartés.
const projection = geoOrthographic().rotate([-35, -8]).scale(100).translate([0, 0]).clipAngle(90).precision(0.8);
const AIRE_MIN = 8;
const TOLERANCE = 0.8;

/** Douglas-Peucker : les points d'une ligne à moins de `tol` de sa corde tombent. */
function simplifier(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts.at(-1);
  const l = Math.hypot(bx - ax, by - ay);
  let iMax = 0;
  let dMax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = l === 0 ? Math.hypot(x - ax, y - ay) : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / l;
    if (d > dMax) [dMax, iMax] = [d, i];
  }
  if (dMax <= tol) return [pts[0], pts.at(-1)];
  return [...simplifier(pts.slice(0, iMax + 1), tol).slice(0, -1), ...simplifier(pts.slice(iMax), tol)];
}
const brut = geoPath(projection).digits(0);

/** Le tracé d'une géométrie sans ses anneaux minuscules ni ses points répétés. */
function chemin(g) {
  const d = brut(g);
  if (!d) return null;
  const anneaux = d
    .split('M')
    .filter(Boolean)
    .map((a) => {
      let pts = a
        .replace(/Z$/, '')
        .split('L')
        .map((xy) => xy.split(',').map(Number))
        .filter((pt, i, t) => i === 0 || pt[0] !== t[i - 1][0] || pt[1] !== t[i - 1][1]);
      // Anneau coupé en deux moitiés pour que ses deux bouts fixes ne soient pas le même point.
      const m = pts.length >> 1;
      if (pts.length > 4) pts = [...simplifier(pts.slice(0, m + 1), TOLERANCE).slice(0, -1), ...simplifier([...pts.slice(m), pts[0]], TOLERANCE).slice(0, -1)];
      let aire = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        aire += x1 * y2 - x2 * y1;
      }
      return { pts, aire: Math.abs(aire) / 2 };
    })
    .filter((a) => a.pts.length >= 3 && a.aire >= AIRE_MIN);
  return anneaux.length ? anneaux.map((a) => `M${a.pts.map((pt) => pt.join(',')).join('L')}Z`).join('') : null;
}

const groupes = new Map();
for (const g of geometries) {
  const c = MEMOIRE[region.get(g.properties.id)] ?? 'g';
  if (!groupes.has(c)) groupes.set(c, new Map());
  const r = region.get(g.properties.id) ?? 'autre';
  if (!groupes.get(c).has(r)) groupes.get(c).set(r, []);
  groupes.get(c).get(r).push(g);
}
// Une forme par sous-région (frontières internes effacées), rangée par couleur.
const regions = [];
for (const [c, parRegion] of groupes)
  for (const [, gs] of parRegion) {
    const d = chemin(merge(topo, gs));
    if (d) regions.push({ c, d });
  }
const terres = chemin(merge(topo, geometries));
const CERCLE = 'M-100,0A100,100 0 1,0 100,0A100,100 0 1,0 -100,0Z';
// Épaisseurs en unités du globe (rayon 100) : elles suivent sa taille partout.
const BORD = 4.5;
const FRONTIERE = 2.4;

// --- SVG (favicon et PNG) ---------------------------------------------------------

/** Le globe en SVG, rayon r autour de (cx, cy). */
function globeSvg(r, cx, cy, id) {
  const k = r / 100;
  return `<defs><radialGradient id="${id}" cx="35%" cy="30%" r="85%"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient></defs>
<g transform="translate(${cx} ${cy}) scale(${k})">
<path d="${CERCLE}" fill="${MER}"/>
${regions.map((x) => `<path d="${x.d}" fill="${COULEURS[x.c]}" stroke="${MER}" stroke-width="${FRONTIERE}" stroke-linejoin="round"/>`).join('\n')}
<path d="${CERCLE}" fill="url(#${id})"/>
<path d="${CERCLE}" fill="none" stroke="${ACCENT}" stroke-width="${BORD}"/>
</g>`;
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<!-- Terramemo : globe de la mémoire (geodata/icone.mjs, npm run icone). -->
${globeSvg(47, 50, 50, 'ombre')}
</svg>
`;
writeFileSync(join(RACINE, 'src/icone.svg'), favicon);

// --- Icône adaptative d'Android (108 dp, zone sûre de 66 dp) -----------------------

const RAYON_DP = 27;
const AAPT = 'xmlns:aapt="http://schemas.android.com/aapt"';
const vecteur = (corps, aapt = false) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Généré par geodata/icone.mjs (npm run icone) : ne pas éditer. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"${aapt ? ` ${AAPT}` : ''}
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${corps}
</vector>
`;
const groupe = (corps) => `    <group android:translateX="54" android:translateY="54" android:scaleX="${RAYON_DP / 100}" android:scaleY="${RAYON_DP / 100}">
${corps}
    </group>`;
const trace = (d, attrs) => `        <path android:pathData="${d}" ${attrs}/>`;

writeFileSync(
  join(RES, 'drawable/ic_launcher_fond.xml'),
  vecteur(
    `    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="radial" android:centerX="54" android:centerY="32" android:gradientRadius="86"
                android:startColor="${FOND[0]}" android:endColor="${FOND[1]}"/>
        </aapt:attr>
    </path>`,
    true,
  ),
);

writeFileSync(
  join(RES, 'drawable/ic_launcher_foreground.xml'),
  vecteur(
    groupe(
      [
        trace(CERCLE, `android:fillColor="${MER}"`),
        ...regions.map((x) => trace(x.d, `android:fillColor="${COULEURS[x.c]}" android:strokeColor="${MER}" android:strokeWidth="${FRONTIERE}" android:strokeLineJoin="round"`)),
        `        <path android:pathData="${CERCLE}">
            <aapt:attr name="android:fillColor">
                <gradient android:type="radial" android:centerX="-30" android:centerY="-40" android:gradientRadius="170">
                    <item android:offset="0.5" android:color="#00000000"/>
                    <item android:offset="1" android:color="#66000000"/>
                </gradient>
            </aapt:attr>
        </path>`,
        trace(CERCLE, `android:strokeColor="${ACCENT}" android:strokeWidth="${BORD}"`),
      ].join('\n'),
    ),
    true,
  ),
);

// Android 13+ recolore ce tracé (icônes à thème) : les terres et le cercle, d'une teinte.
writeFileSync(
  join(RES, 'drawable/ic_launcher_monochrome.xml'),
  vecteur(groupe([trace(terres, 'android:fillColor="#FFFFFFFF"'), trace(CERCLE, 'android:strokeColor="#FFFFFFFF" android:strokeWidth="7"')].join('\n'))),
);

// --- PNG d'avant Android 8 (minSdk 24) ----------------------------------------------

function chromium() {
  const base = join(homedir(), '.cache/ms-playwright');
  const dossiers = readdirSync(base)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  const d = dossiers.at(-1);
  if (!d) throw new Error(`aucun chromium_headless_shell dans ${base}`);
  const sous = readdirSync(join(base, d)).find((x) => x.startsWith('chrome-headless-shell'));
  return join(base, d, sous, 'chrome-headless-shell');
}

const DENSITES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const tmp = mkdtempSync(join(tmpdir(), 'icone-'));
try {
  const bin = chromium();
  for (const [densite, px] of Object.entries(DENSITES))
    for (const [nom, forme] of [
      ['ic_launcher', `<rect width="100" height="100" rx="22" fill="url(#fond)"/>`],
      ['ic_launcher_round', `<circle cx="50" cy="50" r="50" fill="url(#fond)"/>`],
    ]) {
      // Proportions de l'icône adaptative : globe de 27 dp dans 72 dp visibles.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${px}" height="${px}">
<defs><radialGradient id="fond" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="${FOND[0]}"/><stop offset="1" stop-color="${FOND[1]}"/></radialGradient></defs>
${forme}${globeSvg((RAYON_DP / 72) * 100, 50, 50, 'ombre')}</svg>`;
      const html = join(tmp, `${nom}-${densite}.html`);
      writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
      execFileSync(
        bin,
        ['--no-sandbox', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${px},${px}`, `--screenshot=${join(RES, `mipmap-${densite}`, `${nom}.png`)}`, `file://${html}`],
        { stdio: 'ignore', timeout: 30_000 },
      );
    }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`icône : ${regions.length} régions, favicon ${(favicon.length / 1024).toFixed(1)} Ko, ${Object.keys(DENSITES).length * 2} PNG`);
