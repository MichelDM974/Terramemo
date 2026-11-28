// L'outil valider_journal.mjs du skill run-terramemo (sauver_journal et
// restaurer_journal du driver, avant chaque installation d'APK) empaquette
// src/srs/journal.ts par rolldown et le charge sous node. Un module de
// l'appli qui lit import.meta.env au chargement (src/visibles.ts, par
// fiches.ts) l'a fait planter (#6) : ce test lance la vraie ligne de
// commande, comme le driver.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Evenement } from '../src/srs/journal';

const OUTIL = fileURLToPath(new URL('../.claude/skills/run-terramemo/outils/valider_journal.mjs', import.meta.url));

const valide: Evenement = {
  v: 1,
  id: 'e1',
  appareil: 'a1',
  ts: 1_763_000_000_000,
  tz: 240,
  seance: null,
  type: 'reponse',
  fiche: 'voisins:HUN:localiser',
  mode: 'rappel',
  correct: true,
  note: 3,
  duree_ms: 4_000,
};

describe('valider_journal.mjs, la ligne de commande', () => {
  it('rend les refusés avec leur index et leur problème, les valides laissés', () => {
    const entree = [valide, { ...valide, id: 'e2', fiche: 'inconnu:X:localiser' }, { ...valide, id: 'e3', v: 2 }];
    const r = spawnSync(process.execPath, [OUTIL], { input: JSON.stringify(entree), encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { i: 1, id: 'e2', probleme: 'fiche' },
      { i: 2, id: 'e3', probleme: 'version' },
    ]);
  });
});
