// Le morceau principal ne porte pas ce qui ne sert qu'aux fiches des lieux (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 6.1 et § 19) : la lecture des fichiers des
// fiches, la ligne de faits de la barre, les nombres, les lignes relues et les textes partent avec
// le morceau de la fiche (src/vues/fiche.ts, import() dynamique). Un seul import statique depuis
// le morceau principal les y ramènerait sans bruit (Vite ne dit rien sous 500 Ko) : ce test suit
// les imports statiques depuis src/main.ts, les imports de types exceptés (effacés au build).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Les modules que src/main.ts atteint par des imports statiques de valeurs (chemins relatifs à la racine). */
function atteints(depart: string): Set<string> {
  const vus = new Set<string>();
  const pile = [depart];
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    if (!f.endsWith('.ts')) continue;
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(/^\s*(import|export)\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
      const clause = m[2]!.trim();
      // import type { … }, export type { … } ; ou { type A, type B } : rien au build.
      if (clause.startsWith('type ')) continue;
      const accolades = /^\{([\s\S]*)\}$/.exec(clause);
      if (accolades && accolades[1]!.split(',').map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith('type '))) continue;
      const spec = m[3]!;
      if (!spec.startsWith('.')) continue;
      const base = join(dirname(f), spec);
      const cible = [base, `${base}.ts`].find((c) => existsSync(c) && !c.endsWith('.css'));
      if (cible && /\.(ts|json)$/.test(cible)) pile.push(relative('.', cible));
    }
  }
  return vus;
}

describe('le morceau principal', () => {
  const vus = atteints('src/main.ts');

  it('le parcours voit bien le morceau principal (la vue de la carte, la navigation, les textes)', () => {
    for (const f of ['src/vues/explorer.ts', 'src/navigation.ts', 'src/vues/textes.fr.json', 'src/fiches/chargeur.ts', 'src/fiches/sorte.ts']) expect(vus, f).toContain(f);
  });

  it('ne porte rien de ce qui ne sert qu’aux fiches : tout part avec le morceau de la fiche, chargé avec les données', () => {
    const fiches = ['src/vues/fiche.ts', 'src/vues/situation.ts', 'src/fiches/donnees.ts', 'src/fiches/format.ts', 'src/fiches/barre.ts', 'src/fiches/relues.ts', 'src/vues/textes-fiche.ts', 'src/vues/textes-fiche.fr.json'];
    expect(fiches.filter((f) => vus.has(f))).toEqual([]);
  });

  it('ne porte pas le rendu des silhouettes : un morceau chargé à la demande avec silhouettes.json (sujets.ts, chargerSilhouettes)', () => {
    expect(vus.has('src/vues/silhouettes.ts')).toBe(false);
  });

  it('ne porte pas l’écran Crédits ni ses textes : un morceau chargé à la demande (main.ts, vueALaDemande)', () => {
    const credits = ['src/vues/credits.ts', 'src/vues/textes-credits.ts', 'src/vues/textes-credits.fr.json', 'package.json'];
    expect(credits.filter((f) => vus.has(f))).toEqual([]);
  });
});
