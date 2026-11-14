import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { FICHIER_LICENCES, texteLicences } from './licences/tierces';
import { dresserManifeste, FICHIER_SW, injecterManifeste, SW_DE_RETRAIT } from './src/sw/construction';

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
          fichiers.set(relative(dossier, chemin), readFileSync(chemin));
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
  plugins: [licencesTierces(), serviceWorker()],
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
