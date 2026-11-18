// Fiches des 24 communes de La Réunion (#34, lot F5, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 2.4, § 2.6 et § 2.7), appelé par geodata/fiches.mjs ; sans réseau, sans effet à l'import.
// Deux fichiers, comme pour les autres terrains (décision « Langue ») :
//   - public/geo/reunion/fiches.json, sans langue : habitants, année du recensement, superficie
//     cadastrale, intercommunalité (SIREN), écrit par geodata/reunion.mjs, qui lit le GeoPackage
//     de l'IGN (7z, absent en CI) ; ce module le lit et le contrôle ;
//   - public/geo/reunion/fiches.fr.json, de la langue, écrit ici : le titre de l'article de la
//     Wikipédia en français de chaque commune, son gentilé (masculin et pluriel tout fait), et le
//     sigle de chaque intercommunalité.
// Les règles :
//   - item de la commune : celui de son code INSEE (P374), un seul (l'extrait figé
//     geodata/wikidata/fiches-communes.json, npm run wikidata -- --fiches-communes) ;
//   - gentilé : la seule forme masculine de Wikidata (P1549, gentilesMasculins des pays), au
//     pluriel par la règle des pays (plurielGentile) ; la table (gentile_communes) donne une autre
//     forme avec sa source, un pluriel hors de la règle, ou garde la forme avec un doute (verifier) ;
//   - intercommunalité : le sigle de la table (epci), par SIREN ; le nom officiel de l'IGN
//     (public/geo/reunion/sources.json, traitement.intercommunalites) doit être celui de la ligne.
// Échoue (fautes) si la table et les données ne s'accordent plus.

import { gentilesMasculins, plurielGentile } from './fiches-pays.mjs';
import { dansLaFiche } from './fiches-relecture.mjs';

export const CHEMIN_RELECTURE_COMMUNES = 'docs/relectures/fiches-communes.md';
export const EXTRAIT_COMMUNES = 'geodata/wikidata/fiches-communes.json';
export const REQUETES_COMMUNES = 'geodata/wikidata/requetes-fiches-communes.rq';
/** Les fichiers de l'île que lit le build des fiches (sorties de geodata/reunion.mjs). */
export const FICHIERS_ILE = {
  fiches: 'public/geo/reunion/fiches.json',
  communes: 'public/geo/reunion/communes.json',
  noms: 'public/geo/reunion/noms.fr.json',
  sources: 'public/geo/reunion/sources.json',
};
/** Le fichier de la langue, sous public/geo/ (le nom que geodata/build.mjs écrit). */
export const FICHIER_LANGUE = 'reunion/fiches.fr.json';

const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
const CITES = new Set(['wp']);

/**
 * Les textes des fiches des communes et ce que le tableau à relire en montre. fiches : le
 * fichier sans langue de l'île ; communes : communes.json (superficie du tracé) ; noms :
 * noms.fr.json ; sourcesIle : sources.json de l'île ; wd : l'extrait ; main : la table.
 * Rend { lieux: {id: {wp, g, gp, gs?}}, intercommunalites: {siren: sigle}, relecture, fautes }.
 */
export function chiffresCommunes({ fiches, communes, noms, sourcesIle, wd, main }) {
  const fautes = [];
  const faute = (m) => fautes.push(m);
  const ids = communes.map((c) => c.id).sort();
  const parId = new Map(communes.map((c) => [c.id, c]));
  const lieuxIgn = fiches.lieux ?? {};
  if (JSON.stringify(Object.keys(lieuxIgn).sort()) !== JSON.stringify(ids)) faute(`${FICHIERS_ILE.fiches} : communes ${Object.keys(lieuxIgn).join(', ')}, attendu celles de communes.json`);
  const nomsIgn = sourcesIle.traitement?.intercommunalites ?? {};
  const lignesEpci = Object.fromEntries(sansNotes(main.epci));
  const lignesG = Object.fromEntries(sansNotes(main.gentile_communes));
  for (const [cle, l] of [...Object.entries(lignesEpci).map(([k, l]) => [`epci.${k}`, l]), ...Object.entries(lignesG).map(([k, l]) => [`gentile_communes.${k}`, l])]) {
    if (!l.raison) faute(`fiches-main.json, ${cle} : sans raison`);
  }

  // Intercommunalités : chaque SIREN de l'IGN a sa ligne, chaque ligne son SIREN, le nom de l'IGN inchangé.
  const intercommunalites = {};
  const sirens = [...new Set(Object.values(lieuxIgn).map((l) => l.ic))].sort();
  for (const s of sirens) {
    const l = lignesEpci[s];
    if (!l) {
      faute(`fiches-main.json, epci : pas de sigle pour ${s} (« ${nomsIgn[s] ?? '?'} »)`);
      continue;
    }
    if (!l.sigle) faute(`fiches-main.json, epci.${s} : sans sigle`);
    if (l.nom_ign !== nomsIgn[s]) faute(`fiches-main.json, epci.${s} : nom de l'IGN « ${nomsIgn[s] ?? '(absent)'} », la ligne dit « ${l.nom_ign} » : sigle à relire`);
    intercommunalites[s] = l.sigle;
  }
  for (const s of Object.keys(lignesEpci)) if (!sirens.includes(s)) faute(`fiches-main.json, epci.${s} : aucune commune de l'île dans cette intercommunalité`);

  const lieux = {};
  const R = { communes: [], intercommunalites: [], total: 0, annees: new Set() };
  for (const id of ids) {
    const ign = lieuxIgn[id];
    const q = wd.communes?.[id];
    const w = q ? wd.lieux?.[q] : null;
    if (!w) {
      faute(`${id} : pas d'item dans ${EXTRAIT_COMMUNES} (npm run wikidata -- --fiches-communes)`);
      continue;
    }
    const t = {};
    if (w.frwiki) t.wp = w.frwiki;
    else faute(`${id} : aucun article de la Wikipédia en français (${q})`);
    // Gentilé : la forme masculine de Wikidata ; une ligne pour une autre forme, un pluriel, ou un doute.
    const formes = gentilesMasculins(w.gentiles);
    const lg = lignesG[id];
    let g = null;
    if (lg?.masculin) {
      if (formes.length === 1 && formes[0] === lg.masculin && !lg.pluriel) faute(`fiches-main.json, gentile_communes.${id} : « ${lg.masculin} » est la seule forme de Wikidata, ligne inutile`);
      g = lg.masculin;
    } else if (formes.length === 1) g = formes[0];
    else faute(`${id} : ${formes.length} formes masculines du gentilé dans Wikidata (${formes.join(', ') || 'aucune'}), à trancher dans la table (gentile_communes)`);
    if (lg?.verifier && (lg.masculin || formes.length !== 1)) faute(`fiches-main.json, gentile_communes.${id} : « verifier » garde la seule forme de Wikidata, qui en a ${formes.length}`);
    if (lg && !lg.verifier && !lg.masculin && !lg.pluriel) faute(`fiches-main.json, gentile_communes.${id} : ni masculin, ni pluriel, ni verifier`);
    let gp = null;
    if (g) {
      const deWikidata = formes.includes(g);
      if (lg?.cite && !CITES.has(lg.cite)) faute(`fiches-main.json, gentile_communes.${id} : cite « ${lg.cite} » inconnu`);
      if (!deWikidata && !lg?.cite) faute(`fiches-main.json, gentile_communes.${id} : « ${g} » n'est pas une forme de Wikidata : sa source à écrire (cite)`);
      let regle = null;
      try {
        regle = plurielGentile(g);
      } catch (err) {
        if (!lg?.pluriel) faute(`${id} : ${err.message}`);
      }
      if (lg?.pluriel && lg.pluriel === regle) faute(`fiches-main.json, gentile_communes.${id} : le pluriel « ${lg.pluriel} » est celui de la règle, à retirer`);
      gp = lg?.pluriel ?? regle;
      t.g = g;
      t.gp = gp;
      if (!deWikidata && lg?.cite) t.gs = lg.cite;
    }
    lieux[id] = t;
    R.total += ign?.h ?? 0;
    if (ign?.ha) R.annees.add(ign.ha);
    R.communes.push({ id, nom: noms[id] ?? id, q, wp: t.wp ?? null, formes, g, gp, ligne: lg ?? null, h: ign?.h, ha: ign?.ha, sup: ign?.sup, trace: parId.get(id)?.superficie_km2, ic: ign?.ic });
  }
  for (const id of Object.keys(lignesG)) if (!parId.has(id)) faute(`fiches-main.json, gentile_communes.${id} : pas une commune de l'île`);
  for (const s of sirens) {
    R.intercommunalites.push({ siren: s, sigle: intercommunalites[s], nom: nomsIgn[s], ligne: lignesEpci[s], membres: ids.filter((id) => lieuxIgn[id]?.ic === s) });
  }
  return { lieux, intercommunalites, relecture: R, fautes };
}

// --- Tableau à relire ----------------------------------------------------------------------

const nb = (x) => (x == null ? '—' : Number(x).toLocaleString('fr-FR'));
const cel = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
function tableau(entetes, lignes) {
  if (!lignes.length) return '_Aucune ligne._\n';
  return [`| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...lignes.map((l) => `| ${l.map(cel).join(' | ')} |`)].join('\n') + '\n';
}
const pct = (a, b) => (a == null || b == null || !b ? '—' : `${a >= b ? '+' : '−'} ${Math.abs(((a - b) / b) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`);

/**
 * Le texte de docs/relectures/fiches-communes.md : les gentilés (tus jusqu'à leur relecture), puis,
 * pour information, les intercommunalités et les chiffres de l'IGN, en ligne. R : la relecture de
 * chiffresCommunes ; sources : {wikidata, ign} (dates citées en tête). Identique d'un lancement à l'autre.
 */
export function texteRelectureCommunes({ R, sources, relues }) {
  const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr');
  const communes = [...R.communes].sort(parNom);
  const nomDe = (id) => R.communes.find((c) => c.id === id)?.nom ?? id;
  const o = [];
  o.push('# Fiches des communes de La Réunion : tableau à relire');
  o.push('');
  o.push(
    '*Écrit par le build (`npm run fiches`, `geodata/fiches-communes.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. ' +
      'Ticket #34, lot F5 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.4 et § 9 (« Relectures demandées »).*',
  );
  o.push('');
  o.push('## Comment relire, comment corriger');
  o.push('');
  o.push(
    '- Ce que montre la fiche d\'une commune : ses habitants (avec l\'année du recensement), sa superficie, son gentilé, son intercommunalité, ' +
      'ses communes voisines (des boutons, qui ouvrent leur fiche) et le lien vers Wikipédia. Sa barre, en bas de la carte, dit ses habitants (« 85 000 hab. »).',
  );
  const gentilesRelus = relues.gentile_communes === true;
  o.push(
    gentilesRelus
      ? '- **Relue : la section 1**, les gentilés, validée par l\'utilisateur (la clé `gentile_communes` de `LIGNES_RELUES`, `src/fiches/relues.ts`, est à `true`) : ' +
          'la fiche a sa ligne « Gentilé ».'
      : '- **À relire : la section 1 seulement**, les gentilés. Elle est **tue dans la fiche** tant que la clé `gentile_communes` de `LIGNES_RELUES` ' +
          '(`src/fiches/relues.ts`) est à `false` : la fiche n\'a pas de ligne « Gentilé » d\'ici là. Une fois la section relue, passer la clé à `true`.',
  );
  o.push(
    '- Les sections 2 et 3 sont **déjà en ligne**, données ici pour information : les sigles des intercommunalités (écrits à la main, un par ' +
      'intercommunalité) et les chiffres de l\'IGN (lus tels quels). Un sigle faux se corrige comme un gentilé.',
  );
  o.push(
    '- Pour corriger : la ligne de la commune dans `geodata/fiches-main.json` (clé donnée en tête de section, une raison par ligne), puis `npm run fiches`. ' +
      'Le build échoue si une ligne ne s\'applique plus (une forme déjà celle de Wikidata, une intercommunalité renommée par l\'IGN). ' +
      'Pour valider une ligne « à relire » : **retirer la ligne entière** (la forme de Wikidata est alors prise sans doute ; retirer son seul `verifier` ' +
      'fait échouer le build), ou la remplacer par une autre forme (`masculin`, avec sa source `cite`) ou un autre pluriel (`pluriel`).',
  );
  o.push(
    `- Sources : Wikidata (extrait des communes du ${sources.wikidata}) pour les gentilés et les liens ; l'IGN, ADMIN EXPRESS COG CARTO (${sources.ign}) pour ` +
      'les habitants (recensement de l\'INSEE), la superficie cadastrale et l\'intercommunalité. Seconde source des gentilés : l\'infobox de l\'article de ' +
      `la Wikipédia en français de chaque commune, lue le 18/11/2026${R.communes.some((c) => c.ligne?.verifier) ? ' (révisions citées dans les lignes, et dans `public/geo/sources.json`)' : ''}.`,
  );
  o.push('');

  // --- Gentilés ---
  const lignes = communes.filter((c) => c.ligne);
  o.push('## 1. Gentilés (clé `gentile_communes`)');
  o.push('');
  o.push(dansLaFiche('gentile_communes', relues));
  o.push('');
  o.push(
    'Règle : la forme masculine singulière de Wikidata (P1549, en français), mise au pluriel comme pour un pays (un « s », sauf après s, x ou z) ; ' +
      'la fiche dit « les Saint-Pierrois ». Les 24 formes de Wikidata ont été comparées à l\'infobox de l\'article de la Wikipédia en français de chaque commune : ' +
      (lignes.length
        ? `elles s'accordent toutes, au nombre près ; les ${lignes.length} lignes de la table disent ce qui reste à voir (une seconde forme, un accent, une forme qui surprend).`
        : 'elles s\'accordent toutes, au nombre près ; la table n\'a plus de ligne.'),
  );
  o.push('');
  if (lignes.length) o.push(
    tableau(
      ['Commune', 'Gentilé (Wikidata)', 'La fiche dira', 'Les deux sources', 'Le doute', 'À relire'],
      lignes.map((c) => [c.nom, c.formes.join(', ') || 'aucune', c.gp ? `les ${c.gp}` : '—', c.ligne.verifier ?? c.ligne.masculin ?? c.ligne.pluriel, c.ligne.raison, c.ligne.verifier || c.ligne.a_relire ? '**à relire**' : '']),
    ),
  );
  o.push(
    lignes.length
      ? `Les ${communes.length} communes (les ${lignes.length} ci-dessus comprises) : les ${communes.length - lignes.length} autres ont la même forme dans Wikidata et dans ` +
          `l'infobox de la Wikipédia en français ; ${gentilesRelus ? 'relues.' : 'il reste à dire si une forme est fausse ou peu usitée.'}`
      : `Les ${communes.length} communes : la même forme dans Wikidata et dans l'infobox de la Wikipédia en français` +
          (gentilesRelus ? ', relue.' : ' ; il reste à dire si une forme est fausse ou peu usitée.'),
  );
  o.push('');
  o.push(
    tableau(
      ['Commune', 'Masculin', 'La fiche dira', 'Source', 'Ligne de la table'],
      communes.map((c) => [c.nom, c.g ?? '—', c.gp ? `les ${c.gp}` : '—', c.ligne?.masculin ? 'table' : 'Wikidata', c.ligne ? 'oui, ci-dessus' : '—']),
    ),
  );

  // --- Intercommunalités ---
  o.push('## 2. Intercommunalités (clé `epci`) — en ligne, pour information');
  o.push('');
  o.push(
    'L\'IGN donne pour chaque commune le SIREN de son intercommunalité, et le nom officiel de celle-ci (long) ; la fiche dit le sigle, écrit à la main. ' +
      `${R.intercommunalites.length} communautés d'agglomération couvrent l'île.`,
  );
  o.push('');
  o.push(
    tableau(
      ['Sigle', 'Nom de l\'IGN', 'SIREN', 'Communes', 'Raison'],
      [...R.intercommunalites].sort((a, b) => a.sigle.localeCompare(b.sigle, 'fr')).map((e) => [e.sigle, e.nom, e.siren, `${e.membres.length} : ${e.membres.map(nomDe).sort((a, b) => a.localeCompare(b, 'fr')).join(', ')}`, e.ligne?.raison]),
    ),
  );

  // --- Chiffres de l'IGN ---
  const annees = [...R.annees];
  o.push('## 3. Habitants et superficies (IGN) — en ligne, pour information');
  o.push('');
  o.push(
    `Habitants : la population municipale du recensement de l'INSEE${annees.length === 1 ? ` de ${annees[0]}` : ''}, telle que l'IGN la donne ; ${nb(R.total)} pour l'île. ` +
      'Superficie : la superficie cadastrale de l\'IGN (le chiffre officiel), pas celle du tracé de la carte, qui en diffère surtout à l\'Entre-Deux et au Tampon ' +
      '(colonne « Écart » : le tracé par rapport au cadastre). La carte garde son tracé ; la fiche donne le chiffre officiel.',
  );
  o.push('');
  o.push(tableau(['Commune', 'Habitants', 'Superficie', 'Tracé de la carte', 'Écart'], communes.map((c) => [c.nom, `${nb(c.h)} (${c.ha})`, `${nb(c.sup)} km²`, `${nb(c.trace)} km²`, pct(c.trace, c.sup)])));
  return o.join('\n');
}
