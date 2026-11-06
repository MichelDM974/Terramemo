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

// Port 8060 : dizaine réservée à Terramemo (skill nouveau-projet), le driver
// du skill run-terramemo prend 8061.
export default defineConfig({
  plugins: [licencesTierces()],
  server: { port: 8060, strictPort: true },
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
