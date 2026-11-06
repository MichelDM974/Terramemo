// L'icône (geodata/icone.mjs, npm run icone) : ce que l'appli et le site référencent
// existe, et le favicon reste léger (il part à chaque nouveau visiteur).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RES = 'android/app/src/main/res';

describe('icône', () => {
  it('l’icône adaptative d’Android ne cite que des ressources présentes', () => {
    for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const xml = readFileSync(`${RES}/mipmap-anydpi-v26/${f}`, 'utf8');
      const refs = [...xml.matchAll(/@(drawable|color)\/(\w+)/g)].map((m) => [m[1], m[2]] as const);
      expect(refs.map(([, n]) => n).sort()).toEqual(['ic_launcher_fond', 'ic_launcher_foreground', 'ic_launcher_monochrome']);
      for (const [type, nom] of refs) expect(existsSync(`${RES}/${type}/${nom}.xml`), `${f} : @${type}/${nom}`).toBe(true);
    }
  });

  it('PNG d’avant Android 8 dans chaque densité', () => {
    for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'])
      for (const f of ['ic_launcher.png', 'ic_launcher_round.png']) expect(statSync(`${RES}/mipmap-${d}/${f}`).size, `${d}/${f}`).toBeGreaterThan(500);
  });

  it('le site : l’icône en favicon et en logo de l’en-tête, par Vite (adresse à empreinte), sous 12 Ko', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/src/icone.svg"');
    expect(html).toMatch(/<img class="logo" src="\/src\/icone\.svg"/);
    // Dans public/, elle garderait la même adresse et resterait en cache (vu le 06/11).
    expect(existsSync('public/favicon.svg')).toBe(false);
    // Plus de 4 Ko : Vite en fait un fichier, pas une data: URL recopiée dans la page.
    expect(statSync('src/icone.svg').size).toBeGreaterThan(4096);
    expect(statSync('src/icone.svg').size).toBeLessThan(12 * 1024);
  });
});
