import { defineConfig } from 'vitest/config';

// Port 8060 : dizaine réservée à Cartographe (skill nouveau-projet), le driver
// du skill run-cartographe prend 8061.
export default defineConfig({
  server: { port: 8060, strictPort: true },
  preview: { port: 8060, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
