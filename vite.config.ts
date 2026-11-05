import { defineConfig } from 'vitest/config';

// Port 8060 : dizaine réservée à Terramemo (skill nouveau-projet), le driver
// du skill run-terramemo prend 8061.
export default defineConfig({
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
