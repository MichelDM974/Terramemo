// Fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2 ;
// lot F1 : les données déjà au dépôt), appelé par geodata/build.mjs (tout le build, ou
// --seulement fiches : npm run fiches) ; sans réseau, sans effet à l'import. Lit :
//   public/geo/pays.json             les 258 entités de la carte (sortie du build) :
//                                    statut, sous-région
//   geodata/wikidata/capitales.json  l'extrait figé de Wikidata des capitales : le titre
//                                    de la Wikipédia en français de l'item de chaque pays
//                                    (pays[Q].frwiki)
//   geodata/capitales-main.json      l'item d'un pays que son code ne donne pas
//                                    (items_pays : Pays-Bas, Palestine, Kosovo)
//   geodata/fiches-main.json         la seule table à la main (§ 2.5) : noms des
//                                    sous-régions, titres de Wikipédia corrigés
// Produit (identiques octet pour octet d'un lancement à l'autre ; deux fichiers par
// terrain, l'un sans langue, l'autre de la langue : décision « Langue », § 2.7) :
//   fiches-monde.json     {v: 1, lieux: {id: {s}}} : une entrée par entité, les 258,
//                         s sa sorte (src/fiches/sorte.ts, sorteDeLieu). Sans entrée, pas
//                         de fiche : la barre n'a pas de chevron. Les chiffres (habitants,
//                         superficie…) viennent au lot F2 ;
//   fiches-monde.fr.json  {v: 1, sous_regions: {nom de Natural Earth: nom}, lieux: {id:
//                         {wp?}}} : wp le titre de la Wikipédia en français, pour les 197
//                         pays ; une entrée vide pour les 61 autres (48 territoires, 12
//                         zones, l'Antarctique), qui n'ont pas de QID avant le lot F3.
// Continent, sous-région et voisins restent dans pays.json, déjà chargé (§ 2.7).
// Échoue (exception) si les entrées et la table ne s'accordent plus : un pays sans titre,
// une sous-région sans nom, une ligne de la table qui ne s'applique plus.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './outils.mjs';

export const CHEMINS = {
  script: 'geodata/fiches.mjs',
  main: 'geodata/fiches-main.json',
  extrait: 'geodata/wikidata/capitales.json',
  capitalesMain: 'geodata/capitales-main.json',
};

/** Version du format des deux fichiers (src/fiches/donnees.ts la vérifie). */
export const VERSION_FICHES = 1;

/** La sorte d'une entité de pays.json, comme sorteDeLieu (src/fiches/sorte.ts) sur le monde. */
export function sorteEntite(statut) {
  return { jouable: 'pays', optionnel: 'pays', territoire: 'territoire', conteste: 'zone', autre: 'continent' }[statut] ?? null;
}

const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
const parId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Construit les deux fichiers servis du monde. racine : la racine du dépôt. Rend
 * { fichiers: {nom: texte}, sources: [], entrees, notes } : entrees vont dans
 * public/geo/sources.json (fusionnerPartie), notes s'affichent au build. La source
 * Wikidata (l'extrait des capitales) y est déjà, citée par les capitales.
 */
export async function construireFiches(racine) {
  const lire = (c) => readFile(join(racine, c));
  const [scriptBrut, mainBrut, extraitBrut, capMainBrut, paysBrut] = await Promise.all(
    [CHEMINS.script, CHEMINS.main, CHEMINS.extrait, CHEMINS.capitalesMain, 'public/geo/pays.json'].map(lire),
  );
  const main = JSON.parse(mainBrut.toString('utf8'));
  const extrait = JSON.parse(extraitBrut.toString('utf8'));
  const capMain = JSON.parse(capMainBrut.toString('utf8'));
  const entites = JSON.parse(paysBrut.toString('utf8')).sort((a, b) => parId(a.id, b.id));
  const erreurs = [];
  const faute = (m) => erreurs.push(m);
  const notes = [];

  // Sous-régions : chacune de pays.json a son nom, et la table n'en a pas d'autre.
  const sousRegions = Object.fromEntries(sansNotes(main.sous_regions).sort(([a], [b]) => parId(a, b)));
  const presentes = new Set(entites.map((e) => e.sous_region));
  for (const s of presentes) if (!sousRegions[s]) faute(`${CHEMINS.main}, sous_regions : « ${s} » (pays.json) sans nom`);
  for (const s of Object.keys(sousRegions)) if (!presentes.has(s)) faute(`${CHEMINS.main}, sous_regions : « ${s} » n'est plus une sous-région de pays.json`);

  const wpMain = Object.fromEntries(sansNotes(main.wp));
  const lieux = {};
  const textes = {};
  for (const e of entites) {
    const s = sorteEntite(e.statut);
    if (!s) {
      faute(`${e.id} : statut inconnu ${e.statut}`);
      continue;
    }
    lieux[e.id] = { s };
    const t = {};
    if (s === 'pays') {
      // L'item du pays, comme geodata/capitales.mjs : la table des capitales d'abord, sinon le code.
      const parCode = extrait.items_par_code[e.id] ?? [];
      const q = capMain.items_pays?.[e.id]?.q ?? (parCode.length === 1 ? parCode[0] : null);
      const titre = q ? extrait.pays[q]?.frwiki : null;
      const corrige = wpMain[e.id]?.titre;
      if (corrige && corrige === titre) faute(`${CHEMINS.main}, wp : ${e.id} « ${corrige} » est déjà le titre de l'extrait, ligne inutile`);
      if (!corrige && !titre) faute(`${e.id} : aucun titre de la Wikipédia en français (item ${q ?? 'introuvable'})`);
      t.wp = corrige ?? titre;
    }
    textes[e.id] = t;
  }
  for (const id of Object.keys(wpMain)) if (lieux[id]?.s !== 'pays') faute(`${CHEMINS.main}, wp : ${id} n'est pas un pays de pays.json`);
  if (erreurs.length) throw new Error(`fiches :\n  ${erreurs.join('\n  ')}`);

  const objet = (o) => `{\n${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}`;
  const fichiers = {
    'fiches-monde.json': `{"v":${VERSION_FICHES},"lieux":${objet(lieux)}}\n`,
    'fiches-monde.fr.json': `{"v":${VERSION_FICHES},"sous_regions":${JSON.stringify(sousRegions)},"lieux":${objet(textes)}}\n`,
  };
  const n = (s) => Object.values(lieux).filter((l) => l.s === s).length;
  notes.push(
    `${Object.keys(lieux).length} lieux : ${n('pays')} pays, ${n('territoire')} territoires, ${n('zone')} zones, ${n('continent')} continent ; ` +
      `${Object.values(textes).filter((t) => t.wp).length} titres de Wikipédia (extrait du ${extrait.extrait_le})`,
  );
  const entrees = { [CHEMINS.script]: sha256(scriptBrut), [CHEMINS.main]: sha256(mainBrut) };
  return { fichiers, sources: [], entrees, notes };
}
