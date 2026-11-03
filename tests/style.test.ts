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
