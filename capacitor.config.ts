import type { CapacitorConfig } from '@capacitor/cli';

// Coquille Android (Capacitor 8) du site : le même dist/ que Firebase Hosting.
const config: CapacitorConfig = {
  // Convention des autres applis (io.github.micheldm974.light, .cdc). Changer
  // l'appId fait une autre appli pour Android : désinstaller l'ancienne efface ses données.
  appId: 'io.github.micheldm974.cartographe',
  appName: 'Cartographe',
  webDir: 'dist',
  // Fond de la WebView avant la première peinture de la page (--bg de src/style.css) :
  // sans lui, Capacitor laisse le blanc par défaut entre l'écran de lancement et la carte.
  backgroundColor: '#080809',
  server: {
    // FIGÉS (tests/capacitor.test.ts) : schéma et hôte forment l'origine de la WebView
    // (https://localhost). Les changer change l'origine, et toute la base IndexedDB des
    // joueurs (journal de réponses, progrès) deviendrait invisible, sans retour possible
    // (plan « Technique », étude critique I9). Ce sont aussi les défauts de Capacitor 8 :
    // ils sont écrits pour qu'un changement de défaut d'une version future ne nous touche pas.
    androidScheme: 'https',
    hostname: 'localhost',
  },
  plugins: {
    // Bord à bord (imposé par Android 15+) : plugin SystemBars du cœur de Capacitor 8.
    // « native » : avec une WebView >= 140 et viewport-fit=cover (index.html), la WebView
    // occupe tout l'écran et reçoit les vraies valeurs de env(safe-area-inset-*), que
    // src/style.css met en padding. « css » (le défaut) injecterait en plus des variables
    // --safe-area-inset-* que le site n'utilise pas.
    SystemBars: {
      insetsHandling: 'native',
      // index.html déclare viewport-fit=cover : l'annoncer évite un saut de mise en page
      // au premier affichage.
      initialViewportFitValueHint: 'cover',
      // Icônes claires sur le fond sombre (#080809), que le téléphone soit en thème clair
      // ou sombre (« DEFAULT » suivrait le thème du système).
      style: 'DARK',
    },
  },
};

export default config;
