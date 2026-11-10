import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Style commun : la palette vit dans les variables de :root, jamais en dur dans une
// règle isolée (un bug de thème est déjà venu de là dans un autre projet).
const COULEUR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi;

function fichiersCss(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true, recursive: true })
    .filter((f) => f.isFile() && f.name.endsWith('.css'))
    .map((f) => join(f.parentPath, f.name));
}

describe('feuilles de style', () => {
  const fichiers = fichiersCss('src');

  it('existent', () => {
    expect(fichiers.length).toBeGreaterThan(0);
  });

  it.each(fichiers)('%s : couleurs seulement dans :root', (fichier) => {
    const css = readFileSync(fichier, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const horsRacine = css.replace(/:root\s*\{[^}]*\}/g, '');
    expect(horsRacine.match(COULEUR) ?? []).toEqual([]);
  });
});

describe('« × » des écrans qui couvrent la carte (#18)', () => {
  it('⚙ : une « × » en tête de la popup, avant « Paramètres » (elle flotte à sa droite), libellé tiré des textes', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/<div id="settings-popup"[^>]*>\s*<!--[\s\S]*?-->\s*<button type="button" class="croix" id="settings-fermer">×<\/button>\s*<h3>Paramètres<\/h3>/);
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain("setAttribute('aria-label', textes.croix.reglages)");
  });

  it('style commun dans style.css : 44 px, ronde, flottante (titres et boutons passent à côté)', () => {
    const css = readFileSync('src/style.css', 'utf8');
    const regle = /\n\.croix \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(regle).toMatch(/float: right;/);
    expect(regle).toMatch(/width: 44px;/);
    expect(regle).toMatch(/height: 44px;/);
    expect(regle).toMatch(/border-radius: 50%;/);
  });
});

describe('en-tête des très petits téléphones (#19)', () => {
  it('à 360 px et moins, Jouer en ▶ seul : le nom masqué (pas retiré, lu par les lecteurs d’écran), l’icône montrée', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/id="jouer-btn"[^>]*>.*<span class="jouer-nom">Jouer<\/span><\/a>/);
    const css = readFileSync('src/style.css', 'utf8');
    const debut = css.indexOf('@media (max-width: 360px) {');
    expect(debut).toBeGreaterThan(css.indexOf('@media (max-width: 700px) {'));
    const bloc = css.slice(debut, css.indexOf('\n}\n', debut));
    expect(bloc).toMatch(/\.bouton-jouer svg \{[^}]*display: block;/);
    expect(bloc).toMatch(/\.bouton-jouer \.jouer-nom \{[^}]*clip-path: inset\(50%\);/);
    expect(bloc).not.toMatch(/display: none/);
  });
});
