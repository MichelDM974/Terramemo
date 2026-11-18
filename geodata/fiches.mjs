// Fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2 ;
// lot F1 : les données déjà au dépôt ; lot F2 : les chiffres des 197 pays), appelé par
// geodata/build.mjs (tout le build, ou --seulement fiches : npm run fiches) ; sans réseau,
// sans effet à l'import. Lit :
//   public/geo/pays.json             les 258 entités de la carte (sortie du build) :
//                                    statut, sous-région, code a2, surface du tracé
//   public/geo/monde.topo.json       le tracé de la carte et des zones disputées (fuseaux
//                                    et sommets, § 2.1)
//   public/geo/capitales.json        la capitale principale (zone horaire la plus proche)
//   public/geo/capitales.fr.json     son nom (le libellé de l'heure, clé heure_a)
//   public/geo/contestees.json       les zones hachurées (pays touchés par une zone, D57)
//   public/geo/noms.fr.json          les noms des pays (tableaux à relire)
//   geodata/wikidata/capitales.json  l'extrait figé de Wikidata des capitales : le titre
//                                    de la Wikipédia en français de l'item de chaque pays
//                                    (pays[Q].frwiki)
//   geodata/capitales-main.json      l'item d'un pays que son code ne donne pas
//                                    (items_pays : Pays-Bas, Palestine, Kosovo)
//   geodata/fiches-main.json         la seule table à la main (§ 2.5) : sous-régions,
//                                    titres de Wikipédia, et les clés du lot F2
//   geodata/fiches-sources.mjs       les sources des chiffres : leurs lignes de
//                                    sources.json (sourcesFiches) ; les fichiers
//                                    téléchargés, CLDR et tz (lireSourcesFiches, dans
//                                    geodata/raw/ : npm run fiches les télécharge)
//   geodata/wikidata/fiches.json,
//   geodata/banque-mondiale/population.json  les extraits figés des chiffres
// Les règles du choix sont dans geodata/fiches-pays.mjs, les tableaux à relire dans
// geodata/fiches-relecture.mjs.
// Produit (identiques octet pour octet d'un lancement à l'autre ; deux fichiers par
// terrain, l'un sans langue, l'autre de la langue : décision « Langue », § 2.7) :
//   fiches-monde.json     {v: 1, lieux: {id: {s, …}}} : une entrée par entité, les 258,
//                         s sa sorte (src/fiches/sorte.ts, sorteDeLieu). Sans entrée, pas
//                         de fiche : la barre n'a pas de chevron. Pour les 197 pays :
//                           h, ha    habitants et leur année ; hs « wd » s'ils viennent de
//                                    Wikidata (sinon la Banque mondiale) ;
//                           sup      superficie en km², de Wikidata pour tous les pays,
//                                    citée « selon Wikidata » (D57, décision du 18/11) ;
//                           alt      altitude du point culminant, en m (aucune pour la
//                                    Somalie : aucun sommet dans une zone disputée) ;
//                           z, nz    zone IANA de l'heure locale ; nombre de fuseaux, s'il
//                                    y en a plusieurs ;
//                           m        codes ISO 4217 des monnaies, dans l'ordre ;
//                           lo, lp   codes des langues officielles ; langues parlées par
//                                    10 % ou plus, [code, part en %] (D56 c) ;
//                           f        fête nationale [jour, mois], sauf le Royaume-Uni et
//                                    la Bosnie-Herzégovine ;
//   fiches-monde.fr.json  {v: 1, sous_regions: {nom de Natural Earth: nom}, langues: {code:
//                         nom}, monnaies: {code: nom}, lieux: {id: {…}}} : pour les 197 pays,
//                         wp le titre de la Wikipédia en français, g et gp le gentilé
//                         masculin et son pluriel, cu le nom du point culminant, fn le nom
//                         de la fête ; une entrée vide pour les 61 autres (48 territoires,
//                         12 zones, l'Antarctique), qui viennent au lot F3 ;
//   docs/relectures/fiches-pays.md  les tableaux à relire (fiches-relecture.mjs).
// Continent, sous-région et voisins restent dans pays.json, déjà chargé (§ 2.7).
// Échoue (exception) si les entrées et la table ne s'accordent plus : un pays sans titre ou
// sans chiffre, une sous-région sans nom, une ligne de la table qui ne s'applique plus.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { feature } from 'topojson-client';
import { chiffresPays } from './fiches-pays.mjs';
import { CHEMIN_RELECTURE, texteRelecture } from './fiches-relecture.mjs';
import { CHEMIN_RELECTURE_TERRITOIRES, DBF_NE, lireDbf, statutsLieux, texteRelectureTerritoires, verifierNe } from './fiches-territoires.mjs';
import { EXTRAITS_FICHES, lireSourcesFiches, sourcesFiches, TZ_VERSION, CLDR_TAG } from './fiches-sources.mjs';
import { sha256 } from './outils.mjs';

export const CHEMINS = {
  script: 'geodata/fiches.mjs',
  regles: 'geodata/fiches-pays.mjs',
  relecture: 'geodata/fiches-relecture.mjs',
  territoires: 'geodata/fiches-territoires.mjs',
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
 * Construit les deux fichiers servis du monde et les tableaux à relire. racine : la
 * racine du dépôt. Rend { fichiers: {nom: texte}, relectures: [{chemin, texte}], sources,
 * entrees, notes } : sources et entrees vont dans public/geo/sources.json
 * (fusionnerPartie), notes s'affichent au build. La source Wikidata de l'extrait des
 * capitales y est déjà, citée par les capitales ; celles des chiffres viennent de
 * sourcesFiches. Lit geodata/raw/ (CLDR, tz ; et le .dbf de Natural Earth s'il y est,
 * pour contrôler SOV_A3), absent en CI.
 */
export async function construireFiches(racine) {
  const lire = (c) => readFile(join(racine, c));
  const json = (b) => JSON.parse(b.toString('utf8'));
  const chemins = [CHEMINS.script, CHEMINS.regles, CHEMINS.relecture, CHEMINS.territoires, CHEMINS.main, CHEMINS.extrait, CHEMINS.capitalesMain, 'public/geo/pays.json'];
  const autres = ['public/geo/monde.topo.json', 'public/geo/capitales.json', 'public/geo/capitales.fr.json', 'public/geo/contestees.json', 'public/geo/noms.fr.json', 'src/vues/textes.fr.json', EXTRAITS_FICHES.wikidata, EXTRAITS_FICHES.banqueMondiale];
  const [[scriptBrut, reglesBrut, relectureBrut, territoiresBrut, mainBrut, extraitBrut, capMainBrut, paysBrut], [topoBrut, capBrut, capFrBrut, contBrut, nomsBrut, textesBrut, wdBrut, bmBrut], cldr] = await Promise.all([
    Promise.all(chemins.map(lire)),
    Promise.all(autres.map(lire)),
    lireSourcesFiches(racine),
  ]);
  const main = json(mainBrut);
  const extrait = json(extraitBrut);
  const capMain = json(capMainBrut);
  const entites = json(paysBrut).sort((a, b) => parId(a.id, b.id));
  const topo = json(topoBrut);
  const wd = json(wdBrut);
  const bm = json(bmBrut);
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

  // Les chiffres des 197 pays (lot F2) : geodata/fiches-pays.mjs.
  const chiffres = chiffresPays({
    entites,
    formes: feature(topo, topo.objects.pays).features,
    zones: feature(topo, topo.objects.contestees).features,
    capitales: json(capBrut),
    nomsCapitales: json(capFrBrut).noms,
    wd,
    bm,
    cldr,
    zoneTab: cldr.zoneTab,
    contestees: json(contBrut),
    main,
  });
  // Les statuts des 48 territoires et des 12 zones (lot F3) : geodata/fiches-territoires.mjs.
  const contestees = json(contBrut);
  const noms = json(nomsBrut);
  const statuts = statutsLieux({ entites, contestees, main, formesPays: json(textesBrut).formes_pays, noms });
  // SOV_A3 de Natural Earth, là où le .dbf brut est présent (pas en CI) : la table fait foi, il la contrôle.
  const cheminDbf = join(racine, DBF_NE);
  const neVerifie = existsSync(cheminDbf);
  const fautesNe = neVerifie ? verifierNe(lireDbf(await readFile(cheminDbf)), main) : [];
  if (statuts.fautes.length || fautesNe.length) throw new Error(`fiches, statuts (${CHEMINS.main}) :\n  ${[...statuts.fautes, ...fautesNe].join('\n  ')}`);

  // Ordre des clés fixe (la sorte d'abord), pour des fichiers stables et lisibles.
  const ORDRE = ['s', 'sv', 'fs', 'h', 'ha', 'hs', 'sup', 'alt', 'cs', 'z', 'nz', 'm', 'lo', 'lp', 'f'];
  const ORDRE_FR = ['st', 'wp', 'g', 'gp', 'gs', 'hc', 'cu', 'fn'];
  const range = (o, ordre) => Object.fromEntries(ordre.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  for (const parts of [chiffres, statuts]) {
    for (const [id, l] of Object.entries(parts.lieux)) lieux[id] = range({ ...lieux[id], ...l }, ORDRE);
    for (const [id, t] of Object.entries(parts.textes)) textes[id] = range({ ...textes[id], ...t }, ORDRE_FR);
  }

  const objet = (o) => `{\n${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}`;
  const fichiers = {
    'fiches-monde.json': `{"v":${VERSION_FICHES},"lieux":${objet(lieux)}}\n`,
    'fiches-monde.fr.json':
      `{"v":${VERSION_FICHES},"sous_regions":${JSON.stringify(sousRegions)},"langues":${JSON.stringify(chiffres.langues)},` +
      `"monnaies":${JSON.stringify(chiffres.monnaies)},"lieux":${objet(textes)}}\n`,
  };
  const relecture = {
    chemin: CHEMIN_RELECTURE,
    texte: texteRelecture({
      R: chiffres.relecture,
      main,
      noms,
      contestees,
      langues: chiffres.langues,
      sources: { wikidata: wd.extrait_le.slice(0, 10), bm: `${bm.source.nom}, ${bm.annee}, mise à jour du ${bm.source.mis_a_jour_le}`, cldr: CLDR_TAG, tz: TZ_VERSION },
    }),
  };
  const relectures = [relecture, { chemin: CHEMIN_RELECTURE_TERRITOIRES, texte: texteRelectureTerritoires({ R: statuts.relecture, noms }) }];
  const n = (s) => Object.values(lieux).filter((l) => l.s === s).length;
  const R = chiffres.relecture;
  notes.push(
    `${Object.keys(lieux).length} lieux : ${n('pays')} pays, ${n('territoire')} territoires, ${n('zone')} zones, ${n('continent')} continent ; ` +
      `${Object.values(textes).filter((t) => t.wp).length} titres de Wikipédia (extrait du ${extrait.extrait_le})`,
    `pays : habitants ${R.habitants.filter((h) => h.source === 'bm').length} Banque mondiale + ${R.habitants.filter((h) => h.source === 'wd').length} Wikidata ; ` +
      `superficie ${R.superficies.filter((x) => x.retenue != null).length} Wikidata ; ` +
      `${Object.keys(chiffres.langues).length} langues, ${Object.keys(chiffres.monnaies).length} monnaies ; ${R.fuseauxPlusieurs.length} pays à plusieurs fuseaux ; ` +
      `tableaux à relire : ${CHEMIN_RELECTURE}`,
    `statuts : ${statuts.relecture.territoires.length} territoires, ${statuts.relecture.zones.length} zones ; SOV_A3 de Natural Earth ${neVerifie ? 'confronté à la table' : `non vérifié (${DBF_NE} absent)`} ; tableau à relire : ${CHEMIN_RELECTURE_TERRITOIRES}`,
  );
  const src = await sourcesFiches(racine);
  const entrees = {
    [CHEMINS.script]: sha256(scriptBrut),
    [CHEMINS.regles]: sha256(reglesBrut),
    [CHEMINS.relecture]: sha256(relectureBrut),
    [CHEMINS.territoires]: sha256(territoiresBrut),
    [CHEMINS.main]: sha256(mainBrut),
    ...src.entrees,
  };
  return { fichiers, relectures, sources: src.sources, entrees, notes };
}
