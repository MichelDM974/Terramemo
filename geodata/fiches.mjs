// Fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2 ;
// lot F1 : les données déjà au dépôt ; lot F2 : les chiffres des 197 pays ; lot F3 : les
// territoires, les zones et l'Antarctique ; lot F4 : les 50 océans et mers), appelé par
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
//   lot F4 : public/geo/mers.json et mers.fr.json (sortes, parents, superficie du tracé ;
//   noms), geodata/wikidata/mers-entites.json (titres de Wikipédia), l'extrait figé
//   geodata/wikidata/fiches-mers.json, geodata/mers-affectations.json et, dans geodata/raw/,
//   les couches des pays et des zones marines de Natural Earth (riverains par le tracé).
//   lot F5 : public/geo/reunion/fiches.json (chiffres de l'IGN, écrits par geodata/reunion.mjs),
//   communes.json, noms.fr.json et sources.json de l'île, l'extrait figé
//   geodata/wikidata/fiches-communes.json.
// Les règles du choix sont dans geodata/fiches-pays.mjs (et fiches-autres.mjs, fiches-mers.mjs,
// fiches-communes.mjs),
// les tableaux à relire dans geodata/fiches-relecture.mjs.
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
//   fiches-mers.json, fiches-mers.fr.json  les 50 zones marines (lot F4), à part : qui ne
//                         touche que des pays ne les paie pas (§ 2.7). {v, lieux: {id: {s
//                         « mer », sup superficie en km² à trois chiffres, ss sa source hors
//                         de Wikidata (ne le tracé, wp Wikipédia, noaa), p profondeur maximale
//                         en m, ps sa source hors de Wikidata (wp), r les riverains (ids de
//                         pays.json ; aucun pour un océan)}}} ; {v, lieux: {id: {wp}}} ;
//   reunion/fiches.fr.json  les 24 communes de La Réunion (lot F5) : {v, intercommunalites:
//                         {SIREN: sigle}, lieux: {code INSEE: {wp, g, gp, gs?}}} ; leurs chiffres
//                         (reunion/fiches.json) sont écrits par geodata/reunion.mjs ;
//   docs/relectures/fiches-pays.md  les tableaux à relire (fiches-relecture.mjs), et ceux
//                         des territoires, des mers et des communes.
// Continent, sous-région et voisins restent dans pays.json, déjà chargé (§ 2.7).
// Échoue (exception) si les entrées et la table ne s'accordent plus : un pays sans titre ou
// sans chiffre, une sous-région sans nom, une ligne de la table qui ne s'applique plus.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { feature } from 'topojson-client';
import { CHAMPS_CONTINENT, CHAMPS_ZONE, CHEMIN_RELECTURE_AUTRES, chiffresAutres, texteRelectureAutres } from './fiches-autres.mjs';
import { CHEMIN_RELECTURE_COMMUNES, chiffresCommunes, FICHIER_LANGUE, FICHIERS_ILE, texteRelectureCommunes } from './fiches-communes.mjs';
import { CHEMIN_RELECTURE_MERS, chiffresMers, lireCouchesNe, riverainsTrace, texteRelectureMers } from './fiches-mers.mjs';
import { chiffresPays } from './fiches-pays.mjs';
import { CHEMIN_RELECTURE, CHEMIN_RELUES, lireRelues, texteRelecture } from './fiches-relecture.mjs';
import { CHEMIN_RELECTURE_TERRITOIRES, DBF_NE, lireDbf, statutsLieux, texteRelectureTerritoires, verifierNe } from './fiches-territoires.mjs';
import { EXTRAITS_FICHES, lireSourcesFiches, sourcesFiches, TZ_VERSION, CLDR_TAG } from './fiches-sources.mjs';
import { sha256 } from './outils.mjs';

export const CHEMINS = {
  script: 'geodata/fiches.mjs',
  regles: 'geodata/fiches-pays.mjs',
  relecture: 'geodata/fiches-relecture.mjs',
  territoires: 'geodata/fiches-territoires.mjs',
  autres: 'geodata/fiches-autres.mjs',
  mers: 'geodata/fiches-mers.mjs',
  communes: 'geodata/fiches-communes.mjs',
  affectations: 'geodata/mers-affectations.json',
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
  const chemins = [CHEMINS.script, CHEMINS.regles, CHEMINS.relecture, CHEMINS.territoires, CHEMINS.main, CHEMINS.extrait, CHEMINS.capitalesMain, 'public/geo/pays.json', CHEMINS.autres, CHEMINS.mers, CHEMINS.affectations, CHEMINS.communes];
  const donnees = ['public/geo/monde.topo.json', 'public/geo/capitales.json', 'public/geo/capitales.fr.json', 'public/geo/contestees.json', 'public/geo/noms.fr.json', 'src/vues/textes.fr.json', EXTRAITS_FICHES.wikidata, EXTRAITS_FICHES.banqueMondiale];
  const donneesMers = ['public/geo/mers.json', 'public/geo/mers.fr.json', 'geodata/wikidata/mers-entites.json', EXTRAITS_FICHES.wikidataMers];
  const donneesIle = [FICHIERS_ILE.fiches, FICHIERS_ILE.communes, FICHIERS_ILE.noms, FICHIERS_ILE.sources, EXTRAITS_FICHES.wikidataCommunes];
  const [[scriptBrut, reglesBrut, relectureBrut, territoiresBrut, mainBrut, extraitBrut, capMainBrut, paysBrut, autresBrut, mersScriptBrut, affectationsBrut, communesScriptBrut], [topoBrut, capBrut, capFrBrut, contBrut, nomsBrut, textesBrut, wdBrut, bmBrut], [zonesMersBrut, nomsMersBrut, entitesMersBrut, wdMersBrut], [fichesIleBrut, communesIleBrut, nomsIleBrut, sourcesIleBrut, wdCommunesBrut], cldr, couchesNe] = await Promise.all([
    Promise.all(chemins.map(lire)),
    Promise.all(donnees.map(lire)),
    Promise.all(donneesMers.map(lire)),
    Promise.all(donneesIle.map(lire)),
    lireSourcesFiches(racine),
    lireCouchesNe(racine),
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
  for (const id of Object.keys(wpMain)) if (!lieux[id]) faute(`${CHEMINS.main}, wp : ${id} n'est pas une entité de pays.json`);
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
  // Les chiffres des 48 territoires, des 12 zones et de l'Antarctique (lot F3) : geodata/fiches-autres.mjs.
  // Les noms des langues et des monnaies des territoires s'ajoutent à ceux des pays.
  const langues = { ...chiffres.langues };
  const monnaies = { ...chiffres.monnaies };
  const autres = chiffresAutres({
    entites,
    formes: feature(topo, topo.objects.pays).features,
    zones: feature(topo, topo.objects.contestees).features,
    wd,
    bm,
    cldr,
    main,
    noms,
    contestees,
    langues,
    monnaies,
  });
  if (autres.fautes.length) throw new Error(`fiches, territoires, zones et Antarctique (${CHEMINS.main}) :\n  ${autres.fautes.join('\n  ')}`);
  // SOV_A3 de Natural Earth, là où le .dbf brut est présent (pas en CI) : la table fait foi, il la contrôle.
  const cheminDbf = join(racine, DBF_NE);
  const neVerifie = existsSync(cheminDbf);
  const fautesNe = neVerifie ? verifierNe(lireDbf(await readFile(cheminDbf)), main) : [];
  if (statuts.fautes.length || fautesNe.length) throw new Error(`fiches, statuts (${CHEMINS.main}) :\n  ${[...statuts.fautes, ...fautesNe].join('\n  ')}`);

  // Les 50 océans et mers (lot F4) : geodata/fiches-mers.mjs, leurs fichiers à part (§ 2.7).
  const zonesMers = json(zonesMersBrut);
  const nomsMers = json(nomsMersBrut).noms;
  const entitesMers = json(entitesMersBrut);
  const wdMers = json(wdMersBrut);
  const itemsCarte = new Map([...Object.entries(wd.pays), ...Object.entries(wd.autres)].map(([id, q]) => [q, id]));
  const mers = chiffresMers({
    zones: zonesMers,
    titres: Object.fromEntries(Object.entries(wdMers.mers).map(([id, q]) => [id, entitesMers[q]?.frwiki])),
    wd: wdMers,
    itemsCarte,
    entites,
    trace: riverainsTrace(couchesNe.marine, couchesNe.pays, json(affectationsBrut)),
    main,
  });
  if (mers.fautes.length) throw new Error(`fiches, océans et mers (${CHEMINS.main}) :\n  ${mers.fautes.join('\n  ')}`);

  // Les 24 communes de La Réunion (lot F5) : geodata/fiches-communes.mjs ; leurs chiffres sont ceux de geodata/reunion.mjs.
  const sourcesIle = json(sourcesIleBrut);
  const wdCommunes = json(wdCommunesBrut);
  const communes = chiffresCommunes({ fiches: json(fichesIleBrut), communes: json(communesIleBrut), noms: json(nomsIleBrut), sourcesIle, wd: wdCommunes, main });
  if (communes.fautes.length) throw new Error(`fiches, communes de La Réunion (${CHEMINS.main}) :\n  ${communes.fautes.join('\n  ')}`);

  // Ordre des clés fixe (la sorte d'abord), pour des fichiers stables et lisibles.
  const ORDRE = ['s', 'sv', 'fs', 'h', 'ha', 'hs', 'sup', 'alt', 'cs', 'z', 'nz', 'm', 'lo', 'lp', 'f'];
  const ORDRE_FR = ['st', 'wp', 'ca', 'g', 'gp', 'gs', 'hc', 'cu', 'fn'];
  const ORDRE_MERS = ['s', 'sup', 'ss', 'p', 'ps', 'r'];
  const range = (o, ordre) => Object.fromEntries(ordre.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  for (const parts of [chiffres, statuts, autres]) {
    for (const [id, l] of Object.entries(parts.lieux)) lieux[id] = range({ ...lieux[id], ...l }, ORDRE);
    for (const [id, t] of Object.entries(parts.textes)) textes[id] = range({ ...textes[id], ...t }, ORDRE_FR);
  }
  // D57 a : une zone contestée ne sert que sa sorte, ses habitants, son statut et son lien ; l'Antarctique, rien sur
  // les revendications. Une clé de trop, et le build échoue (tests/donnees-fiches.test.ts le vérifie aussi).
  for (const [id, l] of Object.entries(lieux)) {
    const permis = l.s === 'zone' ? CHAMPS_ZONE : l.s === 'continent' ? CHAMPS_CONTINENT : null;
    if (!permis) continue;
    const trop = [...Object.keys(l).filter((k) => !permis.lieux.includes(k)), ...Object.keys(textes[id]).filter((k) => !permis.textes.includes(k))];
    if (trop.length) throw new Error(`fiches : ${id} (${l.s}) sert ${trop.join(', ')}, hors de ses champs`);
  }
  const tri = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => parId(a, b)));

  const objet = (o) => `{\n${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}`;
  const fichiers = {
    'fiches-monde.json': `{"v":${VERSION_FICHES},"lieux":${objet(lieux)}}\n`,
    'fiches-monde.fr.json':
      `{"v":${VERSION_FICHES},"sous_regions":${JSON.stringify(sousRegions)},"langues":${JSON.stringify(tri(langues))},` +
      `"monnaies":${JSON.stringify(tri(monnaies))},"lieux":${objet(textes)}}\n`,
    // Dans l'ordre de mers.json, comme la couche des mers.
    'fiches-mers.json': `{"v":${VERSION_FICHES},"lieux":${objet(Object.fromEntries(Object.entries(mers.lieux).map(([id, l]) => [id, range(l, ORDRE_MERS)])))}}\n`,
    'fiches-mers.fr.json': `{"v":${VERSION_FICHES},"lieux":${objet(mers.textes)}}\n`,
    // Dans l'ordre des codes INSEE, comme communes.json.
    [FICHIER_LANGUE]: `{"v":${VERSION_FICHES},"intercommunalites":${JSON.stringify(communes.intercommunalites)},"lieux":${objet(Object.fromEntries(Object.entries(communes.lieux).map(([id, t]) => [id, range(t, ['wp', 'g', 'gp', 'gs'])])))}}\n`,
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
  const relues = lireRelues(await readFile(join(racine, CHEMIN_RELUES), 'utf8'));
  const sourcesRelecture = { wikidata: wd.extrait_le.slice(0, 10), bm: `${bm.source.nom}, ${bm.annee}, mise à jour du ${bm.source.mis_a_jour_le}`, cldr: CLDR_TAG, tz: TZ_VERSION };
  const relectures = [
    relecture,
    { chemin: CHEMIN_RELECTURE_TERRITOIRES, texte: texteRelectureTerritoires({ R: statuts.relecture, noms }) },
    { chemin: CHEMIN_RELECTURE_AUTRES, texte: texteRelectureAutres({ R: autres.relecture, noms, langues, monnaies, sources: sourcesRelecture, relues }) },
    {
      chemin: CHEMIN_RELECTURE_MERS,
      texte: texteRelectureMers({ R: mers.relecture, noms, nomsMers, zones: zonesMers, entites, libelles: wdMers.libelles, sources: { wikidata: wdMers.extrait_le.slice(0, 10) }, relues }),
    },
    {
      chemin: CHEMIN_RELECTURE_COMMUNES,
      texte: texteRelectureCommunes({
        R: communes.relecture,
        relues,
        sources: { wikidata: wdCommunes.extrait_le.slice(0, 10), ign: `édition du ${sourcesIle.sources[0].edition}, mise à jour du ${sourcesIle.sources[0].mise_a_jour}` },
      }),
    },
  ];
  const n = (s) => Object.values(lieux).filter((l) => l.s === s).length;
  const R = chiffres.relecture;
  notes.push(
    `${Object.keys(lieux).length} lieux : ${n('pays')} pays, ${n('territoire')} territoires, ${n('zone')} zones, ${n('continent')} continent ; ` +
      `${Object.values(textes).filter((t) => t.wp).length} titres de Wikipédia (extrait du ${extrait.extrait_le})`,
    `pays : habitants ${R.habitants.filter((h) => h.source === 'bm').length} Banque mondiale + ${R.habitants.filter((h) => h.source === 'wd').length} Wikidata ; ` +
      `superficie ${R.superficies.filter((x) => x.retenue != null).length} Wikidata ; ` +
      `${Object.keys(chiffres.langues).length} langues, ${Object.keys(chiffres.monnaies).length} monnaies ; ${R.fuseauxPlusieurs.length} pays à plusieurs fuseaux ; ` +
      `tableaux à relire : ${CHEMIN_RELECTURE}`,
    `territoires, zones, Antarctique : ${Object.values(lieux).filter((l) => l.s !== 'pays' && l.h !== undefined).length} habitants, ${Object.values(textes).filter((t) => t.ca).length} capitales, ` +
      `${Object.values(lieux).filter((l) => l.s !== 'pays' && l.z).length} zones horaires, ${Object.values(lieux).filter((l) => l.s !== 'pays' && l.alt).length} sommets ; tableau à relire : ${CHEMIN_RELECTURE_AUTRES}`,
    `mers : ${Object.values(mers.lieux).filter((l) => l.sup).length} superficies, ${Object.values(mers.lieux).filter((l) => l.p).length} profondeurs, ` +
      `${Object.values(mers.lieux).filter((l) => l.r).length} listes de riverains (${Object.values(mers.lieux).reduce((n, l) => n + (l.r?.length ?? 0), 0)} liens) ; tableau à relire : ${CHEMIN_RELECTURE_MERS}`,
    `communes : ${Object.keys(communes.lieux).length} fiches, ${communes.relecture.total} habitants, ${Object.values(communes.lieux).filter((t) => t.g).length} gentilés, ` +
      `${Object.keys(communes.intercommunalites).length} intercommunalités ; tableau à relire : ${CHEMIN_RELECTURE_COMMUNES}`,
    `statuts : ${statuts.relecture.territoires.length} territoires, ${statuts.relecture.zones.length} zones ; SOV_A3 de Natural Earth ${neVerifie ? 'confronté à la table' : `non vérifié (${DBF_NE} absent)`} ; tableau à relire : ${CHEMIN_RELECTURE_TERRITOIRES}`,
  );
  const src = await sourcesFiches(racine);
  const entrees = {
    [CHEMINS.script]: sha256(scriptBrut),
    [CHEMINS.regles]: sha256(reglesBrut),
    [CHEMINS.relecture]: sha256(relectureBrut),
    [CHEMINS.territoires]: sha256(territoiresBrut),
    [CHEMINS.autres]: sha256(autresBrut),
    [CHEMINS.mers]: sha256(mersScriptBrut),
    [CHEMINS.communes]: sha256(communesScriptBrut),
    [CHEMINS.affectations]: sha256(affectationsBrut),
    [CHEMINS.main]: sha256(mainBrut),
    ...src.entrees,
  };
  return { fichiers, relectures, sources: src.sources, entrees, notes };
}
