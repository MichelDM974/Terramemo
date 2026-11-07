import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { FICHIER_LICENCES, texteLicences } from './licences/tierces';

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
  plugins: [licencesTierces()],
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
