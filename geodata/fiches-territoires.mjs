// Statuts des territoires et des zones contestées (#34, lot F3 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2.2, § 2.5 et § 9, D57), appelé par
// geodata/fiches.mjs ; sans réseau, sans effet à l'import. Rien n'y est déduit : les textes
// sont écrits à la main dans geodata/fiches-main.json (clés formes_statut, souverain,
// tenant, statut), et ce module les vérifie, les sert et écrit leur tableau à relire,
// docs/relectures/fiches-territoires.md. Vérifie :
//   - une ligne par territoire (souverain) et par zone (tenant, statut), aucune de trop ;
//   - le pays souverain : un pays de pays.json, nommé dans le texte avec son article
//     (formes_pays de src/vues/textes.fr.json, décision « Articles des noms de pays ») ;
//     confronté au champ SOV_A3 de Natural Earth (ne.sov de la ligne) là où le .dbf brut
//     est dans geodata/raw/ (verifierNe ; pas en CI) ;
//   - la forme : une clé de formes_statut, dont le texte de la ligne contient le modèle
//     (sauf hors_modele, avec sa raison) ; aucune forme sans territoire ;
//   - les revendicants cités : ceux de revendique_par (et, pour un territoire, ceux des
//     zones hachurées de contestees.json qu'il contient), plus ajouts, moins retraits ;
//     chacun nommé dans le texte, un retrait jamais ; les tenants d'une zone aussi ;
//   - aucun texte égal à une note de Natural Earth (note_ne de pays.json, note de
//     contestees.json) : D57, la note se trompe ou dit trop peu.

import { dansLaFiche } from './fiches-relecture.mjs';

export const CHEMIN_RELECTURE_TERRITOIRES = 'docs/relectures/fiches-territoires.md';

/** Le .dbf de Natural Earth où lire SOV_A3 (geodata/raw/, absent en CI). */
export const DBF_NE = 'geodata/raw/natural-earth/ne_10m_admin_0_countries.dbf';

/**
 * Les codes de souverain de Natural Earth (SOV_A3) qui ne sont pas un id du projet : un
 * « 1 » marque le pays avec ses dépendances (FR1 : la France et ses territoires). Les
 * autres SOV_A3 des territoires sont l'id lui-même.
 */
export const SOUVERAINS_NE = { AU1: 'AUS', CH1: 'CHN', CU1: 'CUB', DN1: 'DNK', FI1: 'FIN', FR1: 'FRA', GB1: 'GBR', KA1: 'KAZ', NL1: 'NLD', NZ1: 'NZL', US1: 'USA' };

const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Les façons dont un texte peut nommer un pays : « le Maroc », « du Maroc », « au Maroc »
 * (et « Le Maroc » en tête de phrase). f : sa ligne de formes_pays ({le, de}).
 */
export function formesCitees(f) {
  const a = f.le.startsWith('le ') ? `au ${f.le.slice(3)}` : f.le.startsWith('les ') ? `aux ${f.le.slice(4)}` : `à ${f.le}`;
  return [...new Set([f.le, f.de, a, majuscule(f.le)])];
}

/** Le texte nomme-t-il ce pays (une de ses formes) ? */
export const cite = (texte, f) => formesCitees(f).some((x) => texte.includes(x));

/** Le modèle d'une forme rempli pour un pays : {de} « de la France », {le} « la France ». */
export const remplirModele = (modele, f) => modele.replaceAll('{de}', f.de).replaceAll('{le}', f.le);

/**
 * Lit les enregistrements d'un .dbf (dBase III, celui des shapefiles de Natural Earth,
 * en UTF-8 : le .cpg le dit) : [{champ: valeur}], valeurs sans le bourrage (blancs, ou
 * octets nuls dans les fichiers de Natural Earth).
 */
export function lireDbf(buf) {
  const n = buf.readUInt32LE(4);
  const entete = buf.readUInt16LE(8);
  const taille = buf.readUInt16LE(10);
  const champs = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) champs.push({ nom: buf.toString('latin1', o, o + 11).replace(/\0.*$/s, ''), long: buf[o + 16] });
  const lignes = [];
  for (let i = 0; i < n; i++) {
    const debut = entete + i * taille;
    if (buf[debut] === 0x2a) continue; // enregistrement effacé
    let p = debut + 1;
    const l = {};
    for (const c of champs) {
      l[c.nom] = buf.toString('utf8', p, p + c.long).replace(/[\0\s]+$/, '').trim();
      p += c.long;
    }
    lignes.push(l);
  }
  return lignes;
}

/**
 * L'id du projet d'un enregistrement de Natural Earth, comme idMaison de geodata/build.mjs
 * (qui n'exporte rien : il lance le build à l'import) : le Kosovo, puis ISO_A3, puis
 * ISO_A3_EH quand c'est le code de l'entité, sinon NE_ et ADM0_A3.
 */
export function idNe(p) {
  const iso = (c) => /^[A-Z]{3}$/.test(c ?? '');
  if (p.ADM0_A3 === 'KOS') return 'XKX';
  if (iso(p.ISO_A3)) return p.ISO_A3;
  if (iso(p.ISO_A3_EH) && p.ISO_A3_EH === p.ADM0_A3) return p.ISO_A3_EH;
  return `NE_${p.ADM0_A3}`;
}

/**
 * Confronte les lignes de souverain à Natural Earth : pour chaque territoire, SOV_A3 et
 * TYPE du .dbf doivent être ceux de la ligne (ne.sov, ne.type), et SOV_A3 converti le pays
 * de la ligne. Rend la liste des fautes (vide si tout s'accorde).
 */
export function verifierNe(enregistrements, main) {
  const fautes = [];
  const parId = new Map(enregistrements.map((p) => [idNe(p), p]));
  for (const [id, l] of sansNotes(main.souverain)) {
    const p = parId.get(id);
    if (!p) {
      fautes.push(`souverain.${id} : absent du .dbf de Natural Earth`);
      continue;
    }
    if (p.SOV_A3 !== l.ne?.sov) fautes.push(`souverain.${id} : SOV_A3 ${p.SOV_A3} dans Natural Earth, ${l.ne?.sov} dans la table`);
    if (p.TYPE !== l.ne?.type) fautes.push(`souverain.${id} : TYPE « ${p.TYPE} » dans Natural Earth, « ${l.ne?.type} » dans la table`);
    const pays = SOUVERAINS_NE[p.SOV_A3] ?? p.SOV_A3;
    if (pays !== l.pays) fautes.push(`souverain.${id} : SOV_A3 ${p.SOV_A3} donne ${pays}, la table dit ${l.pays}`);
  }
  return fautes;
}

/**
 * Les statuts des 48 territoires et des 12 zones. entites : pays.json ; contestees :
 * contestees.json ; main : fiches-main.json ; formesPays : formes_pays de textes.fr.json ;
 * noms : noms.fr.json. Rend { lieux: {id: {sv, fs}}, textes: {id: {st}}, relecture,
 * fautes } : sv le pays souverain, fs la forme, st le texte affiché ; relecture ce que le
 * tableau à relire montre.
 */
export function statutsLieux({ entites, contestees, main, formesPays, noms }) {
  const fautes = [];
  const faute = (m) => fautes.push(m);
  const nom = (id) => noms[id] ?? id;
  const territoires = entites.filter((e) => e.statut === 'territoire').map((e) => e.id).sort();
  const zones = entites.filter((e) => e.statut === 'conteste').map((e) => e.id).sort();
  const parId = new Map(entites.map((e) => [e.id, e]));
  const estPays = (id) => ['jouable', 'optionnel'].includes(parId.get(id)?.statut);
  const notes = new Set([...entites.map((e) => e.note_ne), ...contestees.map((c) => c.note)].filter(Boolean).map((n) => n.trim().toLowerCase()));
  const formes = Object.fromEntries(sansNotes(main.formes_statut));
  const lieux = {};
  const textes = {};
  const R = { formes: [], territoires: [], zones: [] };

  /** Les lignes d'une clé : exactement les ids attendus. */
  const lignesDe = (cle, ids) => {
    const t = Object.fromEntries(sansNotes(main[cle]));
    for (const id of ids) if (!t[id]) faute(`${cle} : ${id} (${nom(id)}) sans ligne`);
    for (const id of Object.keys(t)) if (!ids.includes(id)) faute(`${cle} : ${id} n'est pas ${cle === 'souverain' ? 'un territoire' : 'une zone contestée'} de pays.json`);
    return t;
  };

  /**
   * Les revendicants qu'un texte doit citer : ceux des données, plus ajouts, moins
   * retraits ; rend [{id?, nom, source}] et pose les fautes.
   */
  const revendicants = (cle, id, l, donnees) => {
    const ajouts = Object.entries(l.ajouts ?? {});
    const retraits = Object.entries(l.retraits ?? {});
    for (const [r, raison] of retraits) {
      if (!donnees.includes(r)) faute(`${cle}.${id}, retraits : ${r} n'est pas un revendicant des données`);
      if (!raison) faute(`${cle}.${id}, retraits : ${r} sans raison`);
      if (formesPays[r] && cite(l.texte, formesPays[r])) faute(`${cle}.${id} : le texte cite ${nom(r)}, retiré des revendicants`);
    }
    for (const [a, x] of ajouts) {
      if (donnees.includes(a)) faute(`${cle}.${id}, ajouts : ${a} est déjà un revendicant des données`);
      if (!x?.raison) faute(`${cle}.${id}, ajouts : ${a} sans raison`);
      if (!estPays(a) && !x?.nom) faute(`${cle}.${id}, ajouts : ${a} n'est pas un pays de pays.json, il lui faut son nom`);
    }
    const liste = [
      ...donnees.filter((r) => !retraits.some(([x]) => x === r)).map((r) => ({ id: r, nom: nom(r), source: 'données' })),
      ...ajouts.map(([a, x]) => ({ id: estPays(a) ? a : undefined, nom: x?.nom ?? nom(a), source: 'ajout' })),
    ];
    for (const r of liste) {
      const ok = r.id ? (formesPays[r.id] ? cite(l.texte, formesPays[r.id]) : false) : l.texte.includes(r.nom);
      if (!ok) faute(`${cle}.${id} : le texte ne cite pas ${r.nom}${r.id && !formesPays[r.id] ? ` (${r.id} sans ligne de formes_pays)` : ''}`);
    }
    return liste;
  };

  const texteSur = (cle, id, l) => {
    if (typeof l.texte !== 'string' || !l.texte.trim()) faute(`${cle}.${id} : texte absent`);
    else if (notes.has(l.texte.trim().toLowerCase())) faute(`${cle}.${id} : le texte recopie une note de Natural Earth`);
    if (!l.raison) faute(`${cle}.${id} : raison absente`);
  };

  // --- Territoires ---
  const souverain = lignesDe('souverain', territoires);
  const parForme = new Map();
  for (const id of territoires) {
    const l = souverain[id];
    if (!l) continue;
    texteSur('souverain', id, l);
    if (!estPays(l.pays)) faute(`souverain.${id} : ${l.pays} n'est pas un pays de pays.json`);
    const fp = formesPays[l.pays];
    if (!fp) faute(`souverain.${id} : ${l.pays} sans ligne de formes_pays`);
    const forme = formes[l.forme];
    if (!forme) faute(`souverain.${id} : forme « ${l.forme} » absente de formes_statut`);
    if (fp && l.texte && !cite(l.texte, fp)) faute(`souverain.${id} : le texte ne nomme pas ${fp.le}`);
    if (forme && fp && l.texte) {
      const attendu = remplirModele(forme.modele, fp);
      const conforme = l.texte.includes(attendu);
      if (!conforme && !l.hors_modele) faute(`souverain.${id} : le texte ne contient pas « ${attendu} » (forme ${l.forme}) ; sinon hors_modele, avec sa raison`);
      if (conforme && l.hors_modele) faute(`souverain.${id} : hors_modele, mais le texte suit le modèle`);
    }
    if (!l.ne?.sov || !l.ne?.type) faute(`souverain.${id} : ne.sov et ne.type (Natural Earth) absents`);
    // Les revendicants : l'entité, et les zones hachurées qu'elle contient.
    const dedans = contestees.filter((c) => (c.dans ?? []).includes(id));
    const donnees = [...new Set([...(parId.get(id)?.revendique_par ?? []), ...dedans.flatMap((c) => c.revendique_par ?? [])])].sort();
    const revs = l.texte ? revendicants('souverain', id, l, donnees) : [];
    if (!parForme.has(l.forme)) parForme.set(l.forme, []);
    parForme.get(l.forme).push(id);
    lieux[id] = { sv: l.pays, fs: l.forme };
    textes[id] = { st: l.texte };
    R.territoires.push({ id, ligne: l, donnees, revendicants: revs, zones: dedans.map((c) => c.id), note: parId.get(id)?.note_ne ?? null });
  }
  for (const [f, x] of Object.entries(formes)) {
    if (!x.modele || !x.libelle || !x.raison) faute(`formes_statut.${f} : libelle, modele et raison attendus`);
    if (!parForme.has(f)) faute(`formes_statut.${f} : aucun territoire ne la prend`);
    // Le texte type rempli pour chaque pays qui la prend (« Territoire de la France », « … du Royaume-Uni »).
    const ids = parForme.get(f) ?? [];
    const exemples = [...new Set(ids.map((id) => souverain[id].pays).filter((p) => formesPays[p]))].sort().map((p) => remplirModele(x.modele ?? '', formesPays[p]));
    R.formes.push({ forme: f, ...x, territoires: ids, exemples });
  }

  // --- Zones contestées ---
  const tenant = lignesDe('tenant', zones);
  const statut = lignesDe('statut', zones);
  for (const id of zones) {
    const t = tenant[id];
    const l = statut[id];
    if (!t || !l) continue;
    if (!t.raison) faute(`tenant.${id} : raison absente`);
    texteSur('statut', id, l);
    if (!l.source || !l.verifie_le) faute(`statut.${id} : source et verifie_le attendus`);
    for (const p of t.par ?? []) {
      if (!estPays(p)) faute(`tenant.${id} : ${p} n'est pas un pays de pays.json`);
      else if (l.texte && !cite(l.texte, formesPays[p])) faute(`statut.${id} : le texte ne cite pas le tenant ${nom(p)}`);
    }
    for (const a of t.autres ?? []) if (l.texte && !l.texte.includes(a.replace(/ \(.*\)$/, ''))) faute(`statut.${id} : le texte ne cite pas le tenant « ${a} »`);
    const donnees = [...(parId.get(id)?.revendique_par ?? [])].sort();
    const revs = l.texte ? revendicants('statut', id, l, donnees) : [];
    textes[id] = { st: l.texte };
    R.zones.push({ id, tenant: t, ligne: l, donnees, revendicants: revs, note: parId.get(id)?.note_ne ?? null });
  }
  return { lieux, textes, relecture: R, fautes };
}

// --- Le tableau à relire ------------------------------------------------------------

const cel = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const relire = (l) => (l?.a_relire ? `**à relire** : ${l.a_relire}` : '');

function tableau(entetes, lignes) {
  if (!lignes.length) return '_Aucune ligne._\n';
  return [`| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...lignes.map((l) => `| ${l.map(cel).join(' | ')} |`)].join('\n') + '\n';
}

/**
 * Le texte de docs/relectures/fiches-territoires.md. R : la relecture de statutsLieux ;
 * noms : noms.fr.json. Identique octet pour octet d'un lancement à l'autre (aucune date
 * du jour : les dates sont celles des lignes de la table).
 */
export function texteRelectureTerritoires({ R, noms, relues }) {
  const nom = (id) => noms[id] ?? id;
  const parNom = (a, b) => nom(a.id).localeCompare(nom(b.id), 'fr');
  const liste = (ids) => ids.map(nom).join(', ') || '—';
  const ne = (l, note) => `${l.ne?.type ?? '—'} (${l.ne?.sov ?? '—'})${note ? ` ; note : « ${note} »` : ''}`;
  const aRelire = [...R.zones, ...R.territoires].filter((x) => x.ligne.a_relire).length;
  const o = [];
  o.push('# Fiches des territoires et des zones contestées : statuts à relire');
  o.push('');
  o.push(
    '*Écrit par le build (`npm run fiches`, `geodata/fiches-territoires.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. ' +
      'Ticket #34, lot F3 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.2, § 2.5 et § 9 (D57).*',
  );
  o.push('');
  o.push(
    'La règle (D57, décision de l\'utilisateur du 16/11/2026) : la fiche d\'une zone contestée ne dit rien de plus que **qui la tient et qui la revendique** ; ' +
      'pas de superficie, de langue, de monnaie, de capitale ni de drapeau, qui sont ceux d\'une administration. Aucune note de Natural Earth n\'est recopiée : ' +
      'chaque texte est écrit à la main, en entier, accordé au genre du nom, et vérifié sur le web (source et date dans chaque ligne). ' +
      'La fiche d\'un territoire dit son pays et la forme de son statut (pays constitutif, région administrative spéciale…), et qui le revendique s\'il l\'est. ' +
      `Les textes s'affichent tels quels en tête de la fiche. ` +
      (aRelire
        ? `${aRelire} lignes sont marquées **à relire** : un fait incertain ou une formulation qui pourrait prendre parti.`
        : 'Aucune ligne n\'est marquée à relire.'),
  );
  o.push('');
  o.push(dansLaFiche('statut', relues));
  o.push('');
  o.push('## Comment relire, comment corriger');
  o.push('');
  o.push(
    '- Chaque section reprend une clé de `geodata/fiches-main.json`, la seule table tenue à la main : `statut` et `tenant` (les zones), `formes_statut` (les formes), `souverain` (les territoires). ' +
      'Une ligne a sa raison ; les lignes marquées **à relire** disent leur doute.',
  );
  o.push(
    '- Pour corriger : changer le texte (`texte`) dans `geodata/fiches-main.json`, puis `npm run fiches`. Le build refait les fichiers servis et ce document ; ' +
      'il échoue si le texte ne cite plus un tenant ou un revendicant, s\'il cite un revendicant retiré, s\'il ne nomme pas le pays souverain avec son article, ' +
      's\'il s\'écarte du modèle de sa forme sans le dire (`hors_modele`), ou s\'il recopie une note de Natural Earth.',
  );
  o.push(
    '- Revendicants : ceux des données de la carte (`revendique_par` de `pays.json` ; pour un territoire, aussi ceux des zones hachurées qu\'il contient), ' +
      'plus les **ajouts** (un revendicant absent des données, avec sa raison), moins les **retraits** (un revendicant des données qui ne revendique plus). ' +
      'Un retrait ne touche que la fiche : le jeu compte toujours un toucher juste pour chaque revendicant des données (`src/map/acceptes.ts`).',
  );
  o.push('- Pour valider une ligne « à relire » : retirer `"a_relire"` de la ligne, ou changer le texte et la raison.');
  o.push('');

  // --- Zones ---
  const zs = [...R.zones].sort(parNom);
  const tenus = (t) => [...(t.par ?? []).map(nom), ...(t.autres ?? [])].join(', ') || 'personne';
  const revs = (x) => x.revendicants.map((r) => (r.source === 'ajout' ? `${r.nom} (ajout)` : r.nom)).join(', ') || 'personne';
  const retraits = (l) => Object.keys(l.retraits ?? {}).map((r) => `${nom(r)} (retiré)`).join(', ');
  o.push('## 1. Les 12 zones contestées (clés `statut` et `tenant`)');
  o.push('');
  o.push(
    tableau(
      ['Zone', 'Tenue par', 'Revendiquée par', 'Texte affiché dans la fiche', 'Source, date de vérification', 'À relire'],
      zs.map((z) => [nom(z.id), tenus(z.tenant), [revs(z), retraits(z.ligne)].filter(Boolean).join(' ; '), `« ${z.ligne.texte} »`, `${z.ligne.source} ; vérifié le ${z.ligne.verifie_le}`, relire(z.ligne)]),
    ),
  );
  o.push('Pourquoi chaque ligne, et ce que dit Natural Earth (sa note n\'est jamais affichée) :');
  o.push('');
  o.push(
    tableau(
      ['Zone', 'Raison du texte', 'Raison du tenant', 'Ajouts et retraits', 'Note de Natural Earth'],
      zs.map((z) => [
        nom(z.id),
        z.ligne.raison,
        z.tenant.raison,
        [...Object.entries(z.ligne.ajouts ?? {}).map(([a, x]) => `ajout ${x.nom ?? nom(a)} : ${x.raison}`), ...Object.entries(z.ligne.retraits ?? {}).map(([r, raison]) => `retrait ${nom(r)} : ${raison}`)].join(' ; ') || '—',
        z.note ? `« ${z.note} »` : '—',
      ]),
    ),
  );

  // --- Formes ---
  o.push('## 2. Les formes de statut des territoires (clé `formes_statut`)');
  o.push('');
  o.push('Une ligne par forme : le texte type, que le texte de chaque territoire contient (rempli pour chaque pays souverain qui la prend ; « … » marque le début ou la suite propre à chaque territoire), et les territoires qui la prennent.');
  o.push('');
  // Un texte type qui n'est qu'un morceau du texte (« louée par Cuba », « …, revendiqué par ») : « … » le dit au relecteur.
  const morceau = (e) => `${/^\p{Ll}/u.test(e) ? '… ' : ''}${e}${/ par$/.test(e) ? ' …' : ''}`;
  o.push(
    tableau(
      ['Forme', 'Texte type', 'Territoires', 'Raison'],
      R.formes.map((f) => [f.libelle, f.exemples.map((e) => `« ${morceau(e)} »`).join(', '), `${f.territoires.length} : ${f.territoires.map(nom).sort((a, b) => a.localeCompare(b, 'fr')).join(', ')}`, f.raison]),
    ),
  );

  // --- Territoires ---
  const ts = [...R.territoires].sort(parNom);
  const libelle = new Map(R.formes.map((f) => [f.forme, f.libelle]));
  o.push('## 3. Les 48 territoires (clé `souverain`)');
  o.push('');
  o.push(
    'Le pays vient du champ `SOV_A3` de Natural Earth (colonne « Natural Earth » : son `TYPE` et son code de souverain), que le build confronte à la table là où les fichiers bruts sont présents ; ' +
      'la forme est écrite à la main.',
  );
  o.push('');
  o.push(
    tableau(
      ['Territoire', 'Pays', 'Forme', 'Texte affiché dans la fiche', 'Natural Earth', 'Raison', 'À relire'],
      ts.map((t) => {
        const l = t.ligne;
        const extra = [
          l.verifie_le ? `vérifié le ${l.verifie_le}` : '',
          l.hors_modele ? `hors modèle : ${l.hors_modele}` : '',
          ...Object.entries(l.ajouts ?? {}).map(([a, x]) => `ajout ${x.nom ?? nom(a)} : ${x.raison}`),
          ...Object.entries(l.retraits ?? {}).map(([r, raison]) => `retrait ${nom(r)} : ${raison}`),
        ].filter(Boolean);
        return [nom(t.id), nom(l.pays), libelle.get(l.forme) ?? l.forme, `« ${l.texte} »`, ne(l, t.note), [l.raison, ...extra].join(' ; '), relire(l)];
      }),
    ),
  );
  return o.join('\n').replace(/\n{3,}/g, '\n\n');
}
