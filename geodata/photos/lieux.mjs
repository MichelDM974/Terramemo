// Les 332 lieux qui ont une fiche (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 1) et leur item Wikidata, lus dans le dépôt, sans réseau ni effet à l'import :
// 197 pays, 48 territoires, 12 zones contestées, l'Antarctique (public/geo/pays.json),
// 50 océans et mers (public/geo/mers.json), 24 communes de La Réunion
// (public/geo/reunion/communes.json). Les ids sont ceux du code (« aden » pour le golfe
// d'Aden, « 97424 » pour Cilaos). Items :
//   pays         l'extrait des capitales (items_par_code), ou la table des capitales
//                (items_pays) quand le code en donne plusieurs, comme geodata/fiches.mjs ;
//   territoires, zones, Antarctique : geodata/fiches-main.json, clé qid ;
//   mers         geodata/mers.json (zones[].q) ;
//   communes     aucun au dépôt : candidats.mjs les cherche par leur code INSEE (P374).
// Ordre : celui de la relecture (pays, territoires, zones, Antarctique par nom ; mers
// dans l'ordre de leur table ; communes par code).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SORTES = { jouable: 'pays', optionnel: 'pays', territoire: 'territoire', conteste: 'zone', autre: 'continent' };
const RANG = { pays: 0, territoire: 1, zone: 2, continent: 3, mer: 4, commune: 5 };

/**
 * Lieu sensible (§ 3.4) : rien n'y est coché d'avance dans l'outil de relecture. Une zone
 * contestée, ou un lieu dont une autre partie revendique la souveraineté
 * (revendique_par de pays.json : Malouines, Gibraltar, Chagos, Géorgie du Sud,
 * Guantánamo, Taïwan, Kosovo).
 */
export function raisonSensible(entite) {
  if (entite.statut === 'conteste') return 'zone contestée';
  if (entite.revendique_par?.length) return `souveraineté revendiquée (${entite.revendique_par.join(', ')})`;
  return null;
}

/**
 * Les 332 lieux : [{ id, terrain: 'monde'|'reunion', sorte, nom, q (null pour une
 * commune), insee (commune), sensible (raison ou null) }]. Lève si un item manque.
 */
export async function lireLieux(racine) {
  const lire = async (c) => JSON.parse(await readFile(join(racine, c), 'utf8'));
  const [pays, noms, extrait, capMain, fichesMain, mers, mersNoms, mersTable, communes, communesNoms] = await Promise.all(
    [
      'public/geo/pays.json',
      'public/geo/noms.fr.json',
      'geodata/wikidata/capitales.json',
      'geodata/capitales-main.json',
      'geodata/fiches-main.json',
      'public/geo/mers.json',
      'public/geo/mers.fr.json',
      'geodata/mers.json',
      'public/geo/reunion/communes.json',
      'public/geo/reunion/noms.fr.json',
    ].map(lire),
  );
  const erreurs = [];
  const lieux = [];
  for (const e of pays) {
    const sorte = SORTES[e.statut];
    if (!sorte) {
      erreurs.push(`${e.id} : statut inconnu ${e.statut}`);
      continue;
    }
    let q;
    if (sorte === 'pays') {
      const parCode = extrait.items_par_code[e.id] ?? [];
      q = capMain.items_pays?.[e.id]?.q ?? (parCode.length === 1 ? parCode[0] : null);
    } else q = fichesMain.qid?.[e.id]?.q ?? null;
    if (!q) erreurs.push(`${e.id} : aucun item Wikidata (${sorte === 'pays' ? 'extrait des capitales' : 'fiches-main.json, qid'})`);
    lieux.push({ id: e.id, terrain: 'monde', sorte, nom: noms[e.id] ?? e.id, q, sensible: raisonSensible(e) });
  }
  const qMer = Object.fromEntries(mersTable.zones.map((z) => [z.id, z.q]));
  const mersTriees = [];
  for (const m of mers) {
    if (!qMer[m.id]) erreurs.push(`${m.id} : aucun item dans geodata/mers.json`);
    mersTriees.push({ id: m.id, terrain: 'monde', sorte: 'mer', nom: mersNoms.noms[m.id] ?? m.id, q: qMer[m.id] ?? null, sensible: null });
  }
  if (erreurs.length) throw new Error(`lieux des photos :\n  ${erreurs.join('\n  ')}`);
  const coll = new Intl.Collator('fr');
  lieux.sort((a, b) => RANG[a.sorte] - RANG[b.sorte] || coll.compare(a.nom, b.nom));
  const ordreMers = new Map(mersTable.zones.map((z, i) => [z.id, i]));
  mersTriees.sort((a, b) => ordreMers.get(a.id) - ordreMers.get(b.id));
  const communesTriees = communes
    .map((c) => ({ id: c.id, terrain: 'reunion', sorte: 'commune', nom: communesNoms[c.id] ?? c.id, q: null, insee: c.id, sensible: null }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return [...lieux, ...mersTriees, ...communesTriees];
}
