import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { FICHIER_LICENCES, texteLicences } from './licences/tierces';
import { dresserManifeste, FICHIER_SW, horsManifeste, injecterManifeste, SW_DE_RETRAIT } from './src/sw/construction';
import { dossierDonnees, fichiersDuSite, lireDonnees } from './geodata/photos/listes.mjs';

/**
 * Le fichier des licences tierces (#20, licences/tierces.ts) : un fichier du
 * build, à la racine du site et de l'APK, et le même au serveur de
 * développement, que l'écran Crédits déplie.
 */
function licencesTierces(): Plugin {
  return {
    name: 'terramemo-licences-tierces',
    configureServer(server) {
      server.middlewares.use(`/${FICHIER_LICENCES}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(texteLicences());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: FICHIER_LICENCES, source: texteLicences() });
    },
  };
}

/**
 * Les listes des photos des fiches (#34, lot P2 ; étude
 * docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.5) : photos/l/<id>.json
 * et photos/credits.json, écrits à chaque build depuis geodata/photos/choix.json
 * et licences.json (geodata/photos/listes.mjs), servis de même au serveur de
 * développement (relus à chaque requête). Les WebP, eux, sont dans
 * public/photos/ (hors de git, D59), copiés par Vite. Avec
 * TERRAMEMO_PHOTOS_DONNEES=<dossier> (les lieux d'essai du pilote), les deux
 * JSON viennent de ce dossier, et les WebP de son sous-dossier photos/.
 */
function photosFiches(): Plugin {
  const essai = process.env.TERRAMEMO_PHOTOS_DONNEES;
  const webpEssai = essai ? join(essai, 'photos') : null;
  const typeDe = (f: string) => (f.endsWith('.webp') ? 'image/webp' : 'application/json; charset=utf-8');
  return {
    name: 'terramemo-photos',
    configureServer(server) {
      server.middlewares.use('/photos/', (req, res, suite) => {
        const chemin = `photos${(req.url ?? '').split('?')[0]}`;
        const json = fichiersDuSite(lireDonnees(dossierDonnees())).find((f) => f.fileName === chemin);
        if (json) {
          res.setHeader('Content-Type', typeDe(chemin));
          res.setHeader('Cache-Control', 'no-cache');
          return res.end(json.source);
        }
        const fichier = webpEssai && /^photos\/[vp]\/[0-9a-f]{10}\.webp$/.test(chemin) ? join(webpEssai, chemin.slice('photos/'.length)) : null;
        if (fichier && existsSync(fichier)) {
          res.setHeader('Content-Type', typeDe(chemin));
          return res.end(readFileSync(fichier));
        }
        // Une liste absente (un lieu sans photo) : 404, comme sur Hosting ; le reste (public/photos/) à Vite.
        if (chemin.endsWith('.json')) {
          res.statusCode = 404;
          return res.end();
        }
        suite();
      });
    },
    generateBundle() {
      for (const f of fichiersDuSite(lireDonnees(dossierDonnees()))) this.emitFile({ type: 'asset', fileName: f.fileName, source: f.source });
      if (!webpEssai) return;
      for (const t of ['v', 'p']) {
        const d = join(webpEssai, t);
        if (!existsSync(d)) continue;
        for (const n of readdirSync(d)) if (n.endsWith('.webp') && statSync(join(d, n)).isFile()) this.emitFile({ type: 'asset', fileName: `photos/${t}/${n}`, source: readFileSync(join(d, n)) });
      }
    },
  };
}

/**
 * Le service worker du site (#22, src/sw/) : src/sw/sw.ts construit en /sw.js
 * (un morceau d'entrée à nom fixe, d'un seul tenant), puis, le site écrit
 * sur le disque (public/ compris), son manifeste dressé d'après les fichiers
 * et injecté (src/sw/construction.ts). Au serveur de développement, /sw.js
 * est un service worker qui se retire (SW_DE_RETRAIT).
 */
function serviceWorker(): Plugin {
  const source = fileURLToPath(new URL('./src/sw/sw.ts', import.meta.url));
  return {
    name: 'terramemo-service-worker',
    configureServer(server) {
      server.middlewares.use(`/${FICHIER_SW}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(SW_DE_RETRAIT);
      });
    },
    buildStart() {
      if (this.environment.config.command === 'build') this.emitFile({ type: 'chunk', id: source, fileName: FICHIER_SW, preserveSignature: false });
    },
    generateBundle(_options, bundle) {
      const sw = bundle[FICHIER_SW];
      if (!sw) return;
      // Un import resté (module partagé avec la page) ferait de sw.js un module ES :
      // refusé en script classique. Mieux vaut l'apprendre au build.
      if (sw.type !== 'chunk' || sw.imports.length || sw.dynamicImports.length || sw.exports.length) {
        this.error(`${FICHIER_SW} doit être d'un seul tenant (sans import ni export) : ${sw.type === 'chunk' ? [...sw.imports, ...sw.dynamicImports, ...sw.exports].join(', ') : sw.type}`);
      }
    },
    writeBundle(options) {
      const dossier = options.dir;
      if (!dossier) return;
      const fichiers = new Map<string, Buffer>();
      for (const f of readdirSync(dossier, { recursive: true, withFileTypes: true })) {
        if (f.isFile()) {
          const chemin = join(f.parentPath, f.name);
          const relatif = relative(dossier, chemin);
          // Les photos (#34, § 3.6) : hors du manifeste, jamais lues ici (105 à 138 Mo).
          if (!horsManifeste(relatif)) fichiers.set(relatif, readFileSync(chemin));
        }
      }
      const fichierSw = join(dossier, FICHIER_SW);
      const code = readFileSync(fichierSw, 'utf8');
      writeFileSync(fichierSw, injecterManifeste(code, dresserManifeste(fichiers, code)));
    },
  };
}

/**
 * La version de l'appli (src/version.ts) : le commit, « +modifie » si des
 * fichiers suivis en diffèrent ; « inconnue » sans git.
 */
function versionAppli(): string {
  const cwd = fileURLToPath(new URL('.', import.meta.url));
  const git = (...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const commit = git('rev-parse', '--short=10', 'HEAD');
    let modifie = false;
    try {
      git('diff', '--quiet', 'HEAD', '--');
    } catch {
      modifie = true;
    }
    return modifie ? `${commit}+modifie` : commit;
  } catch {
    return 'inconnue';
  }
}

// Port 8060 : dizaine réservée à Terramemo (skill nouveau-projet), le driver
// du skill run-terramemo prend 8061.
export default defineConfig({
  plugins: [licencesTierces(), photosFiches(), serviceWorker()],
  define: { __VERSION_APPLI__: JSON.stringify(versionAppli()) },
  // android/ (des milliers de fichiers de build Gradle) et dist/ ne se surveillent pas : ils
  // épuisaient la limite d'inotify du PC (ENOSPC), et le serveur de dev servait alors
  // des modules périmés sans le dire.
  server: { port: 8060, strictPort: true, watch: { ignored: ['**/android/**', '**/dist/**'] } },
  preview: { port: 8060, strictPort: true },
  // Web Worker du maillage webgl (src/map/maillage.worker.ts) en module ES, comme
  // le reste : son nom construit porte le hachage de son contenu, qui sert de
  // clé à son cache sur l'appareil.
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
