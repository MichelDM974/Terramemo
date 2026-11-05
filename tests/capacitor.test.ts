import { describe, expect, it } from 'vitest';
import config from '../capacitor.config';

// L'origine de la WebView (schéma + hôte) porte la base IndexedDB des joueurs : la
// changer rend tous les progrès locaux invisibles (plan « Technique »). Ces valeurs ne
// bougent jamais, sauf migration écrite des données.
describe('capacitor.config.ts', () => {
  it("garde l'origine https://localhost", () => {
    expect(config.server?.androidScheme).toBe('https');
    expect(config.server?.hostname).toBe('localhost');
  });

  it("garde l'identifiant de l'appli", () => {
    // Un autre appId = une autre appli pour Android (et pour le Play Store).
    expect(config.appId).toBe('io.github.micheldm974.terramemo');
  });

  it('emballe le build du site', () => {
    expect(config.webDir).toBe('dist');
  });

  it('peint la WebView du fond sombre avant la page', () => {
    // Sinon un éclair blanc entre l'écran de lancement et la première peinture.
    expect(config.backgroundColor).toBe('#080809');
  });

  it("ne sert pas l'appli depuis une adresse distante", () => {
    // server.url ferait charger le site d'ailleurs que de l'APK (autre origine, pas hors ligne).
    expect(config.server?.url).toBeUndefined();
  });
});
