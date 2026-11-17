// Tableaux à relire des fiches des pays (#34, lot F2 ; étude fiche-lieu § 8, « Relecture
// par l'utilisateur ») : docs/relectures/fiches-pays.md, écrit par le build (npm run fiches)
// à chaque passage, depuis ce que geodata/fiches-pays.mjs a vu et retenu. Des tableaux
// Markdown lisibles sur GitHub, une section par table de geodata/fiches-main.json ; chaque
// ligne : la valeur, la source, la raison. Sans effet à l'import ; texte identique octet
// pour octet d'un lancement à l'autre (aucune date du jour).

export const CHEMIN_RELECTURE = 'docs/relectures/fiches-pays.md';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const date = (j, m) => `${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
const nb = (x) => (x == null ? '—' : Number(x).toLocaleString('fr-FR'));
const pct = (a, b) => (a == null || b == null || !b ? '—' : `${a >= b ? '+' : '−'} ${Math.abs(((a - b) / b) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`);
const cel = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const relire = (l) => (l?.a_relire === true ? '**à relire**' : '');

function tableau(entetes, lignes) {
  if (!lignes.length) return '_Aucune ligne._\n';
  return [`| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...lignes.map((l) => `| ${l.map(cel).join(' | ')} |`)].join('\n') + '\n';
}

/**
 * Le texte de docs/relectures/fiches-pays.md. R : la relecture de chiffresPays ; main :
 * fiches-main.json ; noms : noms.fr.json (id → nom) ; langues, monnaies : les noms servis ;
 * sources : {wikidata, bm, tz, cldr} (dates et versions citées en tête) ; contestees :
 * contestees.json (les zones près d'un sommet).
 */
export function texteRelecture({ R, main, noms, langues, sources, contestees = [] }) {
  const nom = (id) => noms[id] ?? id;
  const zonesInfo = (z) => {
    const c = contestees.find((x) => x.id === z);
    return c ? `${(c.dans ?? []).map(nom).join(', ') || '—'} ; ${(c.revendique_par ?? []).map(nom).join(', ') || '—'}` : '—';
  };
  const parNom = (a, b) => nom(a.id).localeCompare(nom(b.id), 'fr');
  const nomLangue = (c) => langues[c] ?? main.langues?.noms?.[c]?.nom ?? c;
  const o = [];
  o.push('# Fiches des pays : tableaux à relire');
  o.push('');
  o.push(
    '*Écrit par le build (`npm run fiches`, `geodata/fiches-relecture.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. ' +
      'Ticket #34, lot F2 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.1, § 2.5 et § 9.*',
  );
  o.push('');
  o.push('## Comment relire, comment corriger');
  o.push('');
  o.push(
    '- Chaque section reprend une clé de `geodata/fiches-main.json`, la seule table tenue à la main. Une ligne de la table a sa raison ; ' +
      'les lignes marquées **à relire** portent un fait incertain ou un choix qui revient à l\'utilisateur.',
  );
  o.push(
    '- Pour corriger : changer la ligne dans `geodata/fiches-main.json` (la clé est donnée en tête de chaque section), puis `npm run fiches`. ' +
      'Le build refait les fichiers servis et ce document ; il échoue si une ligne ne s\'applique plus (valeur déjà celle de la source, pays inconnu, raison absente).',
  );
  o.push('- Pour valider une ligne « à relire » : retirer `"a_relire": true` de la ligne, ou la remplacer par une autre valeur avec sa raison.');
  o.push(
    `- Sources : Wikidata (extrait du ${sources.wikidata}), Banque mondiale (${sources.bm}), CLDR ${sources.cldr}, base tz ${sources.tz} ; ` +
      'seconde source des sommets et des fêtes : la Wikipédia en français (révisions citées dans les lignes). Le build ne lit ni la Wikipédia ni le Factbook : ' +
      'les valeurs qui en viennent sont écrites dans la table, avec leur source, et ces pages sont citées dans `public/geo/sources.json`.',
  );
  o.push('');

  // --- Fêtes ---
  const fetes = R.fetes.filter((f) => f.ligne).sort(parNom);
  const plusieurs = (l) => l.plusieurs === true;
  o.push(`## 1. Fêtes nationales (clé \`fete\`)`);
  o.push('');
  o.push(
    `${fetes.length} pays ; ${fetes.filter((f) => f.ligne.aucune).length} sans fête ; ${fetes.filter((f) => plusieurs(f.ligne)).length} où le World Factbook donne plusieurs jours (colonne « Plusieurs ») ; ` +
      `${fetes.filter((f) => f.ligne.a_relire).length} à relire. Le Factbook pré-remplit (texte anglais, domaine public) ; la liste de la Wikipédia sert de seconde source.`,
  );
  o.push('');
  o.push(
    tableau(
      ['Pays', 'Jour', 'Nom', 'Plusieurs', 'Factbook', 'Wikipédia', 'Raison', ''],
      fetes.map(({ id, ligne: l }) => [nom(id), l.aucune ? 'aucune' : date(l.jour, l.mois), l.nom ?? '—', plusieurs(l) ? 'oui' : '', l.factbook ?? '—', l.wikipedia ?? '—', l.raison, relire(l)]),
    ),
  );

  // --- Gentilés ---
  const gl = R.gentiles.filter((g) => g.ligne).sort(parNom);
  o.push('## 2. Gentilés (clé `gentile`)');
  o.push('');
  o.push(
    `${gl.length} lignes : les pays où Wikidata donne plusieurs formes masculines ou aucune, les graphies corrigées et les pluriels hors de la règle ` +
      '(un « s », sauf après s, x ou z). Puis la liste de tous les gentilés, pour un coup d\'œil.',
  );
  o.push('');
  o.push(tableau(['Pays', 'Retenu', 'Pluriel', 'Formes de Wikidata', 'Raison', ''], gl.map((g) => [nom(g.id), g.retenu, g.pluriel, g.formes.join(', ') || 'aucune', g.ligne.raison, relire(g.ligne)])));
  o.push('<details><summary>Tous les gentilés (197)</summary>');
  o.push('');
  o.push(tableau(['Pays', 'Masculin', 'Pluriel', 'Source'], [...R.gentiles].sort(parNom).map((g) => [nom(g.id), g.retenu ?? '—', g.pluriel ?? '—', g.ligne ? 'table' : 'Wikidata'])));
  o.push('</details>');
  o.push('');

  // --- Sommets ---
  const cl = R.culminants.filter((c) => c.ligne).sort(parNom);
  const loin = R.culminants.filter((c) => !c.ligne?.aucun && (c.dist == null || c.dist > 10)).sort(parNom);
  o.push('## 3. Points culminants (clé `culminant`)');
  o.push('');
  o.push(
    `${cl.length} lignes : les sommets tranchés (plusieurs déclarés, ou hors du tracé du pays), les altitudes à trancher, la Gambie, l'Argentine, ` +
      'et chaque écart de plus de 5 m avec la seconde source (Wikipédia en français, « Liste des pays par point culminant ») : ' +
      'la valeur gardée reste celle de Wikidata, l\'écart est à relire. Critère : le plus haut point du tracé de fait de la carte, ' +
      'jamais dans une zone disputée (décision du 18/11/2026 : Israël, le mont Méron ; la Somalie, sans ligne de sommet ; le Pakistan, le Tirich Mir, hors du Gilgit-Baltistan ; le Guyana, sans ligne de sommet, le Roraima étant dans l\'Essequibo).',
  );
  o.push('');
  o.push(
    tableau(
      ['Pays', 'Sommet', 'Altitude', 'Wikidata', 'Seconde source', 'Écart', 'Raison', ''],
      cl.map((c) => [
        nom(c.id),
        c.nom,
        c.m == null ? '—' : `${nb(c.m)} m`,
        c.declares.length ? c.declares.map((d) => `${d.nom ?? d.q} (${d.alt == null ? '?' : nb(d.alt)} m${d.rang === 'preferred' ? ', préféré' : ''})`).join(' ; ') + (c.valeurs.length > 1 ? ` ; valeurs : ${c.valeurs.join(', ')}` : '') : 'aucun',
        c.ligne.seconde ? `${c.ligne.seconde.nom ? `${c.ligne.seconde.nom}, ` : ''}${nb(c.ligne.seconde.m)} m` : '—',
        c.ecart == null ? '—' : `${c.ecart > 0 ? '+' : '−'} ${nb(Math.abs(c.ecart))} m`,
        c.ligne.raison,
        relire(c.ligne),
      ]),
    ),
  );
  o.push(`Sommets à plus de 10 km du tracé de leur pays, ou sans coordonnées (S56 ; la liste est figée par \`tests/donnees-fiches.test.ts\`) :`);
  o.push('');
  o.push(tableau(['Pays', 'Sommet', 'Distance au tracé'], loin.map((c) => [nom(c.id), c.nom, c.dist == null ? 'sans coordonnées' : `${nb(c.dist)} km`])));
  const presZ = R.culminants.filter((c) => c.presZones.length).sort(parNom);
  o.push('Sommets à 5 km ou moins d\'une zone disputée de `contestees.json` (le tracé est simplifié ; un sommet dedans fait échouer le build) :');
  o.push('');
  o.push(tableau(['Pays', 'Sommet', 'Zone (tenue par ; revendiquée par)', 'Distance'], presZ.map((c) => [nom(c.id), c.nom, c.presZones.map((z) => `${z.zone} (${zonesInfo(z.zone)})`).join(' ; '), c.presZones.map((z) => `${nb(z.km)} km`).join(' ; ')])));

  // --- Langues ---
  const ll = [...R.langues].sort(parNom);
  o.push('## 4. Langues (clé `langues`, D56 c)');
  o.push('');
  o.push(
    'Les officielles d\'abord (sans part), puis les langues du pays parlées par 10 % ou plus de la population, avec leur part (CLDR compte toute personne qui parle la langue : ' +
      'les parts ne s\'additionnent pas). D\'abord la liste finale de chaque pays, puis chaque retrait et chaque ajout de la table, avec sa raison.',
  );
  o.push('');
  o.push(
    tableau(
      ['Pays', 'Officielles', 'Parlées (part)', 'Table'],
      ll.map((l) => [
        nom(l.id),
        l.finales.filter((x) => x.officielle).map((x) => nomLangue(x.code)).join(', ') || '—',
        l.finales.filter((x) => !x.officielle).map((x) => `${nomLangue(x.code)} ${Math.round(x.pct)} %`).join(', ') || '—',
        l.ligne ? 'relu' : '',
      ]),
    ),
  );
  o.push('### Retraits');
  o.push('');
  o.push(
    tableau(
      ['Pays', 'Code', 'Langue', 'Part (CLDR)', 'Statut (CLDR)', 'Raison', ''],
      [...R.languesRetraits].sort((a, b) => parNom(a, b) || a.code.localeCompare(b.code)).map((r) => [nom(r.id), r.code, nomLangue(r.code), r.pct == null ? '—' : `${nb(r.pct)} %`, r.officielle ? 'officielle' : '', r.raison, r.a_relire ? '**à relire**' : '']),
    ),
  );
  o.push('### Ajouts');
  o.push('');
  o.push(tableau(['Pays', 'Code', 'Langue', 'Officielle', 'Raison', 'Source', ''], [...R.languesAjouts].sort(parNom).map((a) => [nom(a.id), a.code, nomLangue(a.code), a.officielle ? 'oui' : 'non', a.raison, a.source, a.a_relire ? '**à relire**' : ''])));
  o.push('### Parts et ordres écrits à la main');
  o.push('');
  o.push(
    tableau(
      ['Pays', 'Langue', 'Part retenue', 'Part (CLDR)', 'Raison', 'Source'],
      [...R.languesParts].sort((a, b) => parNom(a, b) || a.code.localeCompare(b.code)).map((p) => [nom(p.id), nomLangue(p.code), `${nb(p.pct)} %`, p.cldr == null ? '—' : `${nb(p.cldr)} %`, p.raison, p.source]),
    ),
  );
  o.push(tableau(['Pays', 'Ordre des officielles', 'Raison', 'Source'], [...R.languesOrdres].sort(parNom).map((x) => [nom(x.id), x.ordre.map(nomLangue).join(', '), x.raison, x.source ?? '—'])));
  o.push('### Noms français absents de CLDR');
  o.push('');
  o.push(tableau(['Code', 'Nom', 'Source'], R.languesNoms.map((n) => [n.code, n.nom, n.source])));

  // --- Superficies ---
  const touches = new Map(R.touches.map((t) => [t.id, t]));
  const sl = R.superficies.filter((s) => touches.get(s.id)?.part >= 1).sort(parNom);
  const multi = R.superficies.filter((s) => s.valeurs.length > 1).sort(parNom);
  o.push('## 5. Superficies (clé `superficie`, D57)');
  o.push('');
  o.push(
    'Le chiffre de Wikidata pour tous les pays, cité « selon Wikidata » (décision du 18/11/2026), par la règle du choix : la valeur de rang préféré, ' +
      'sinon la plus récente si elles sont datées, sinon la plus grande ; aucune ligne de la table. ' +
      `D'abord les ${sl.length} pays dont les zones disputées (tenues ou revendiquées) pèsent 1 % ou plus du tracé : leur chiffre suit souvent la revendication du pays, ` +
      'pas le contrôle de fait ; l\'écart est rapporté au tracé de la carte (surface calculée sur la carte, qui suit le contrôle de fait).',
  );
  o.push('');
  o.push(
    tableau(
      ['Pays', 'Wikidata', 'Tracé', 'Écart au tracé', 'Part des zones', 'Valeurs de Wikidata'],
      sl.map((s) => [nom(s.id), `${nb(s.retenue)} km²`, nb(Math.round(s.trace)), pct(s.retenue, s.trace), `${nb(touches.get(s.id).part)} %`, s.valeurs.length > 1 ? s.valeurs.join(' ; ') : '']),
    ),
  );
  o.push(`Les ${multi.length} pays où Wikidata donne plusieurs superficies en km² (la liste et le choix sont figés par \`tests/donnees-fiches.test.ts\`) :`);
  o.push('');
  o.push(tableau(['Pays', 'Retenu', 'Valeurs de Wikidata', 'Tracé'], multi.map((s) => [nom(s.id), `${nb(s.retenue)} km²`, s.valeurs.join(' ; '), nb(Math.round(s.trace))])));

  // --- Fuseaux et monnaies ---
  o.push('## 6. Heure locale et fuseaux (clé `fuseau`)');
  o.push('');
  o.push(
    'Zone de chaque pays : celle de `zone.tab` la plus proche de la capitale ; nombre de fuseaux : décalages normaux (heure d\'hiver : le plus petit du 1er janvier et du 1er juillet 2026) distincts des zones dont le point tombe dans le tracé de l\'entité ' +
      '(ou en mer, à 50 km au plus). Lignes de la table, puis les pays à plusieurs fuseaux (S62) ; une zone d\'un autre code ISO que le pays porte ce code entre parenthèses.',
  );
  o.push('');
  o.push(tableau(['Pays', 'Zone', 'Règle', 'Raison', ''], R.fuseaux.filter((f) => f.ligne).sort(parNom).map((f) => [nom(f.id), f.zone, f.plusProche ?? '—', f.ligne.raison, relire(f.ligne)])));
  o.push(
    tableau(
      ['Pays', 'Fuseaux', 'Règle', 'Décalages normaux (h)', 'Au 1er janvier (h)', 'Au 1er juillet (h)', 'Zones comptées'],
      [...R.fuseauxPlusieurs].sort(parNom).map((f) => [nom(f.id), f.nz, f.ligne?.nz != null ? `${f.nzRegle} (table : ${f.nz})` : f.nzRegle, f.decalages[2].join(', '), f.decalages[0].join(', '), f.decalages[1].join(', '), f.zones.join(', ')]),
    ),
  );
  o.push('## 7. Monnaies (clé `monnaies`)');
  o.push('');
  o.push(tableau(['Pays', 'Ordre retenu', 'Ordre de CLDR', 'Raison', ''], [...R.monnaies].sort(parNom).map((m) => [nom(m.id), m.ordre.join(', '), m.cldr.join(', '), m.ligne.raison, relire(m.ligne)])));
  return o.join('\n').replace(/\n{3,}/g, '\n\n');
}
