// Téléchargement des scripts d'extraits lancés à la main (geodata/banque-mondiale.mjs),
// sans effet à l'import. Le build n'en dépend pas : il ne lit que des fichiers figés.
// Une requête à la fois, réessayée sur 429, 5xx et coupure (la Banque
// mondiale a répondu 502 et 504 pendant le relevé du 16/11). User-Agent générique, celui
// du build et de npm run wikidata : aucun nom ni adresse de personne.

export const UA = 'Terramemo-geodata/1.0 (+https://terramemo-geo.web.app)';

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET, réessayé ; rend { corps: Buffer, entetes: Headers }. Lève après `essais` échecs
 * ou sur un 4xx autre que 429 : un extrait ne s'écrit jamais à moitié.
 */
export async function telecharger(url, { essais = 6, pause = 10_000 } = {}) {
  for (let essai = 1; essai <= essais; essai++) {
    let rep;
    try {
      rep = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(180_000) });
    } catch (e) {
      console.log(`  essai ${essai} : ${e.message}`);
      await attendre(pause * essai);
      continue;
    }
    if (rep.ok) return { corps: Buffer.from(await rep.arrayBuffer()), entetes: rep.headers };
    console.log(`  essai ${essai} : HTTP ${rep.status}`);
    if (rep.status !== 429 && rep.status < 500) throw new Error(`${url} : HTTP ${rep.status}`);
    const reessayer = Number(rep.headers.get('retry-after')) * 1000 || 0;
    await attendre(Math.max(pause * essai, reessayer));
  }
  throw new Error(`${url} : injoignable après ${essais} essais`);
}
