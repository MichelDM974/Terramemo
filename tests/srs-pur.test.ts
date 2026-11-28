import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// src/srs/ est le cœur pur de la répétition espacée : il se teste sans
// navigateur et rejoue le journal de la même façon partout. Aucun accès au
// DOM ni au stockage, aucune horloge ni hasard du système (horloge injectée :
// src/srs/jour.ts) ; seul fsrs.ts importe ts-fsrs. Les commentaires sont
// retirés avant la recherche (ils peuvent nommer ce qui est interdit).

const DOSSIER = 'src/srs';
const sources = readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ f, code: readFileSync(`${DOSSIER}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') }));

const INTERDITS: [string, RegExp][] = [
  ['window', /\bwindow\b/],
  ['document', /\bdocument\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['navigator', /\bnavigator\b/],
  ['Date.now()', /\bDate\.now\s*\(/],
  ['new Date() sans argument', /\bnew\s+Date\s*\(\s*\)/],
  ['performance.now()', /\bperformance\.now\s*\(/],
  ['Math.random()', /\bMath\.random\s*\(/],
  ['crypto', /\bcrypto\b/],
  ['getTimezoneOffset', /\bgetTimezoneOffset\b/],
  // Lectures et écritures à l'heure locale de la machine : le rejeu
  // dépendrait du fuseau de l'appareil (la suite ne tourne que dans celui du
  // PC). Les variantes getUTC…/setUTC… restent permises.
  ['get/set à l’heure locale', /\.(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\s*\(/],
  ['toLocale…', /\btoLocale\w*/],
  ['toDateString/toTimeString', /\.to(Date|Time)String\s*\(/],
  ['Intl', /\bIntl\b/],
];

describe('src/srs/ reste pur', () => {
  it('des sources à vérifier', () => {
    expect(sources.map((s) => s.f)).toContain('jour.ts');
  });

  for (const [nom, motif] of INTERDITS) {
    it(`aucun ${nom}`, () => {
      expect(sources.filter((s) => motif.test(s.code)).map((s) => s.f)).toEqual([]);
    });
  }

  it('imports : le dossier lui-même, des types de la carte, ts-fsrs dans fsrs.ts seul, les sujets visibles (des constantes) dans fiches.ts seul', () => {
    for (const { f, code } of sources) {
      for (const m of code.matchAll(/^\s*import\s+(type\s+)?[\s\S]*?from\s+'([^']+)'/gm)) {
        const [, type, de] = m as unknown as [string, string | undefined, string];
        const permis = de.startsWith('./') || (type && de === '../map/types') || (f === 'fsrs.ts' && de === 'ts-fsrs') || (f === 'fiches.ts' && de === '../visibles');
        expect(permis, `${f} importe ${de}`).toBeTruthy();
      }
    }
  });
});
