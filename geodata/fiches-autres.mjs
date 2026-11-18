// Chiffres des fiches des 48 territoires, des 12 zones contestées et de l'Antarctique (#34,
// lot F3 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md, § 2.2, § 2.6 et § 9, D57),
// appelé par geodata/fiches.mjs ; sans réseau, sans effet à l'import. Les statuts sont dans
// geodata/fiches-territoires.mjs ; ici, ce qui s'applique ensuite (§ 2.2, « Puis ce qui
// s'applique »), par les règles des pays (geodata/fiches-pays.mjs) là où elles valent, et
// la table à la main (geodata/fiches-main.json, clés *_territoires) là où elles ne suffisent
// pas. Chaque ligne de la table doit encore s'appliquer : sinon une faute, et le build échoue.
//   - territoire : habitants (Banque mondiale, sinon Wikidata ; 0 : « aucun habitant
//     permanent », sans année ; un nombre positif sans année : pas de ligne), superficie,
//     capitale (P36), langues et monnaies (CLDR), heure locale (zone écrite à la main,
//     zone_territoires), gentilé, point culminant (aucun dans une zone disputée), lien ;
//   - zone contestée (D57 a) : habitants sourcés s'ils existent, lien ; rien d'autre ;
//   - l'Antarctique : superficie, point culminant, lien ; rien sur les revendications.
// Rend des chiffres (sans langue), des textes (de la langue) et ce que le tableau à relire
// docs/relectures/fiches-territoires-chiffres.md montre (texteRelectureAutres).

import { altitude, choisir, coordSommet, decalage, distanceAuTrace, emprise, gentilesMasculins, habitantsWikidata, languesLieu, lireZoneTab, monnaiesEnCours, plurielGentile, pres, sommetRetenu, superficieWikidata, arrondiSuperficie, zonesPres, ZONE_KM } from './fiches-pays.mjs';

export const CHEMIN_RELECTURE_AUTRES = 'docs/relectures/fiches-territoires-chiffres.md';

const sansNotes = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
const parId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lignes = (main, cle) => Object.fromEntries(sansNotes(main[cle]));

/** Les champs qu'une zone contestée peut servir (D57 a) : sa sorte, ses habitants ; son statut et son lien. */
export const CHAMPS_ZONE = { lieux: ['s', 'h', 'ha', 'hs'], textes: ['st', 'wp'] };
/** Ceux de l'Antarctique : sa sorte, sa superficie, son sommet ; son lien et le nom du sommet. */
export const CHAMPS_CONTINENT = { lieux: ['s', 'sup', 'alt'], textes: ['wp', 'cu'] };

/**
 * La capitale d'un territoire parmi ses déclarations P36 : celles de rang préféré s'il y en
 * a, sinon toutes ; sans celles qui ont une fin (P582, une capitale d'autrefois). Rend le QID
 * de la ville si une seule reste, sinon null (la table tranche).
 */
export function capitaleTerritoire(decl) {
  const d = choisir((decl ?? []).filter((x) => !x.q?.P582?.length), (pool) => (pool.length === 1 ? pool[0] : null));
  return d ? d.v : null;
}

/**
 * Les chiffres des 61 autres lieux. Entrées : entites (pays.json), formes (tracé de la carte),
 * zones (zones disputées), wd (extrait de Wikidata des fiches, autres et villes), bm (Banque
 * mondiale), cldr (lireSourcesFiches, zoneTab compris), main (fiches-main.json), noms
 * (noms.fr.json), contestees (contestees.json), langues et monnaies (les noms déjà servis
 * pour les pays, complétés ici). Rend {lieux, textes, relecture, fautes}.
 */
export function chiffresAutres({ entites, formes, zones = [], wd, bm, cldr, main, noms, contestees = [], langues, monnaies }) {
  const fautes = [];
  const faute = (m) => fautes.push(m);
  const nom = (id) => noms[id] ?? id;
  const autres = entites.filter((e) => ['territoire', 'conteste', 'autre'].includes(e.statut));
  const forme = new Map(formes.map((f) => [f.properties.id, f]));
  const lignesTab = lireZoneTab(cldr.zoneTab);
  const table = {
    capitale: lignes(main, 'capitale_territoires'),
    habitants: lignes(main, 'habitants_territoires'),
    zone: lignes(main, 'zone_territoires'),
    langues: lignes(main, 'langues_territoires'),
    gentile: lignes(main, 'gentile_territoires'),
    culminant: lignes(main, 'culminant_territoires'),
  };
  const nomsLangues = Object.fromEntries(sansNotes(table.langues.noms));
  const territoires = new Set(autres.filter((e) => e.statut === 'territoire').map((e) => e.id));
  const avecSommet = new Set(autres.filter((e) => e.statut !== 'conteste').map((e) => e.id));
  for (const [cle, t] of Object.entries(table)) {
    for (const [id, l] of Object.entries(t)) {
      if (cle === 'langues' && id === 'noms') continue;
      const vise = cle === 'culminant' ? avecSommet : territoires;
      if (!vise.has(id)) faute(`fiches-main.json, ${cle}_territoires : ${id} n'est pas ${cle === 'culminant' ? 'un territoire ni l\'Antarctique' : 'un territoire'} de pays.json`);
      if (!l.raison) faute(`fiches-main.json, ${cle}_territoires.${id} : sans raison`);
    }
  }
  const utilisees = { noms: new Set() };
  const empZones = zones.map((z) => emprise(z, ZONE_KM + 10));
  const tenuesPar = new Map(contestees.map((z) => [z.id, new Set(z.dans ?? [])]));
  const lieux = {};
  const textes = {};
  const R = { habitants: [], capitales: [], superficies: [], langues: [], monnaies: [], gentiles: [], heures: [], culminants: [], liens: [], drapeaux: [] };

  for (const e of autres) {
    const id = e.id;
    const sorte = e.statut === 'territoire' ? 'territoire' : e.statut === 'conteste' ? 'zone' : 'continent';
    const q = wd.autres?.[id];
    const w = q ? wd.lieux[q] : null;
    if (!w) {
      faute(`${id} : absent de l'extrait de Wikidata des fiches (autres)`);
      continue;
    }
    const L = {};
    const T = {};

    // Lien : le titre de l'article de son item ; la table (wp) le corrige ou le donne.
    const titre = main.wp?.[id]?.titre ?? w.frwiki ?? null;
    if (main.wp?.[id] && main.wp[id].titre === w.frwiki) faute(`fiches-main.json, wp : ${id} « ${w.frwiki} » est déjà le titre de l'extrait, ligne inutile`);
    if (titre) T.wp = titre;
    R.liens.push({ id, sorte, q, titre, extrait: w.frwiki ?? null, ligne: main.wp?.[id] ?? null });

    // Habitants (territoire, zone) : la Banque mondiale, sinon Wikidata avec son année ; 0 :
    // « aucun habitant permanent », sans année ; un nombre positif sans année : pas de ligne.
    if (sorte !== 'continent') {
      const b = bm.economies[id];
      let h = null;
      if (b && b.v != null) h = { v: b.v, annee: b.annee, source: 'bm' };
      else {
        const x = habitantsWikidata(w.habitants);
        if (x) h = { ...x, source: 'wd' };
      }
      // La table (habitants_territoires, relecture du lot F3) : aucun, pour un territoire sans habitant
      // permanent dont Wikidata compte le personnel ; une ligne qui ne retire rien est une faute.
      const lh = sorte === 'territoire' ? table.habitants[id] : undefined;
      if (lh) {
        if (!lh.aucun) faute(`fiches-main.json, habitants_territoires.${id} : seule « aucun » est prévue`);
        if (!h || h.v === 0) faute(`fiches-main.json, habitants_territoires.${id} : aucun, mais les sources ne donnent pas de nombre positif, ligne inutile`);
        if (!lh.source) faute(`fiches-main.json, habitants_territoires.${id} : sans source`);
      }
      let montre = null;
      if (lh?.aucun) montre = null;
      else if (h && h.v === 0) montre = { h: 0 };
      else if (h && h.annee) montre = { h: h.v, ha: h.annee };
      if (montre) {
        Object.assign(L, montre);
        if (h.source === 'wd') L.hs = 'wd';
      }
      R.habitants.push({ id, sorte, h, montre: Boolean(montre), declarations: (w.habitants ?? []).length, ligne: lh ?? null });
    }

    // Superficie (territoire, Antarctique) : Wikidata, par la règle des pays (D57 : aucune pour une zone).
    if (sorte !== 'zone') {
      const v = superficieWikidata(w.superficies);
      if (v != null) L.sup = arrondiSuperficie(v);
      const decl = (w.superficies ?? []).filter((d) => d.unite === 'Q712226');
      R.superficies.push({ id, sorte, wd: v, retenue: L.sup ?? null, trace: e.superficie_km2, kms: decl.map((d) => Number(d.v)), valeurs: decl.map((d) => `${d.v}${d.rang === 'preferred' ? ' (préféré)' : ''}${d.q?.P585?.[0] ? ` (${d.q.P585[0].slice(0, 10)})` : ''}`), autres: (w.superficies ?? []).length - decl.length });
    }

    if (sorte === 'territoire') {
      // Capitale (P36) : la règle (capitaleTerritoire), ou la table (capitale_territoires).
      const lc = table.capitale[id];
      const decl = w.capitales ?? [];
      const auto = capitaleTerritoire(decl);
      let ville = auto;
      if (lc) {
        if (lc.aucune) ville = null;
        else {
          if (!decl.some((d) => d.v === lc.ville)) faute(`fiches-main.json, capitale_territoires.${id} : ${lc.ville} n'est pas une capitale déclarée par Wikidata`);
          if (lc.ville === auto) faute(`fiches-main.json, capitale_territoires.${id} : ${lc.ville} est déjà la capitale de la règle, ligne inutile`);
          ville = lc.ville;
        }
      } else if (!auto && decl.length) faute(`${id} : ${decl.length} capitales déclarées dans Wikidata, aucune seule : à trancher dans la table (capitale_territoires)`);
      const v = ville ? wd.villes?.[ville] : null;
      if (ville && !v?.fr) faute(`${id} : la capitale ${ville} n'a pas de nom français dans Wikidata`);
      if (v?.fr) {
        T.ca = v.fr;
        // « Heure à <capitale> » : aucune grammaire dans le code ; une capitale à article n'est pas prévue ici.
        if (/^(Le|Les) /.test(v.fr)) faute(`${id} : « Heure à ${v.fr} » : forme à prévoir (heure_a)`);
      }
      R.capitales.push({ id, ville, nom: v?.fr ?? null, auto, declarations: decl.map((d) => ({ v: d.v, nom: wd.villes?.[d.v]?.fr ?? null, rang: d.rang, fin: d.q?.P582?.[0]?.slice(0, 10) ?? null, debut: d.q?.P580?.[0]?.slice(0, 10) ?? null, qualite: (d.q?.P1480 ?? []).map((x) => wd.libelles?.[x]?.fr ?? wd.libelles?.[x]?.en ?? x) })), ligne: lc ?? null });

      // Langues et monnaies (CLDR), par les règles des pays, pour les 40 territoires qui ont un code ISO.
      if (e.a2) {
        const ll = table.langues[id] ?? {};
        const { cand, finales, retirer, ajouter } = languesLieu(id, e.a2, ll, { cldr, nomsLangues, utilisees, langues, faute, cle: 'langues_territoires', vide: true });
        const lo = finales.filter((l) => l.officielle).map((l) => l.code);
        const lp = finales.filter((l) => !l.officielle).map((l) => [l.code, Math.round(l.pct)]);
        if (lo.length) L.lo = lo;
        if (lp.length) L.lp = lp;
        R.langues.push({ id, finales, cand, retirer, ajouter, ligne: table.langues[id] ?? null });
        const enCours = monnaiesEnCours(cldr.currencyData.region[e.a2]);
        if (enCours.length > 1) faute(`${id} : ${enCours.length} monnaies en cours (${enCours.join(', ')}), ordre à fixer`);
        for (const c of enCours) {
          const n = cldr.monnaiesFr[c]?.displayName;
          if (!n) faute(`${id} : monnaie ${c} sans nom français dans CLDR`);
          else monnaies[c] = n;
        }
        if (enCours.length) L.m = enCours;
        R.monnaies.push({ id, m: enCours });
      } else if (table.langues[id]) faute(`fiches-main.json, langues_territoires.${id} : pas de code ISO, pas de langues`);

      // Heure locale : la zone écrite à la main (§ 2.2), une ligne par territoire ; aucune
      // pour les îles mineures des États-Unis (de + 12 h à − 11 h) et les îles inhabitées
      // sans zone dans zone.tab.
      const lz = table.zone[id];
      const duCode = lignesTab.filter((z) => z.cc === e.a2);
      if (!lz) faute(`${id} : pas de ligne de zone horaire (zone_territoires)`);
      else if (lz.aucune) {
        if (lz.zone) faute(`fiches-main.json, zone_territoires.${id} : aucune, mais une zone écrite`);
      } else {
        const z = lignesTab.find((x) => x.zone === lz.zone);
        if (!z) faute(`fiches-main.json, zone_territoires.${id} : ${lz.zone} n'est pas une zone de zone.tab`);
        else if (z.cc !== e.a2 && !lz.hors_code) faute(`fiches-main.json, zone_territoires.${id} : ${lz.zone} est une zone de ${z.cc}, pas de ${e.a2 ?? 'ce territoire sans code'} : dire pourquoi (hors_code)`);
        else if (z.cc === e.a2 && lz.hors_code) faute(`fiches-main.json, zone_territoires.${id} : hors_code, mais ${lz.zone} est une zone de ${e.a2}`);
        try {
          decalage(lz.zone, Date.UTC(2026, 0, 1, 12));
          L.z = lz.zone;
        } catch {
          faute(`${id} : zone ${lz.zone} inconnue de l'ICU de Node`);
        }
      }
      const zl = lz?.zone ? lignesTab.find((x) => x.zone === lz.zone) : null;
      const f = forme.get(id);
      R.heures.push({ id, zone: L.z ?? null, ligne: lz ?? null, duCode: duCode.map((z) => `${z.zone}${z.commentaire ? ` (${z.commentaire})` : ''}`), cc: zl?.cc ?? null, km: zl && f ? Math.round(distanceAuTrace(f, zl.point)) : null, hiver: L.z ? decalage(L.z, Date.UTC(2026, 0, 1, 12)) / 60 : null, ete: L.z ? decalage(L.z, Date.UTC(2026, 6, 1, 12)) / 60 : null });

      // Gentilé : la règle des pays (une forme masculine) ; la table tranche entre plusieurs, ou n'en veut aucun.
      const formesG = gentilesMasculins(w.gentiles);
      const lg = table.gentile[id];
      let g = null;
      if (lg?.aucun) {
        if (lg.masculin) faute(`fiches-main.json, gentile_territoires.${id} : aucun, mais un masculin écrit`);
        if (!formesG.length) faute(`fiches-main.json, gentile_territoires.${id} : aucun, mais Wikidata n'en donne pas, ligne inutile`);
      } else if (lg?.masculin) {
        if (!formesG.includes(lg.masculin)) faute(`fiches-main.json, gentile_territoires.${id} : « ${lg.masculin} » n'est pas une forme de Wikidata (${formesG.join(', ') || 'aucune'})`);
        if (formesG.length === 1) faute(`fiches-main.json, gentile_territoires.${id} : une seule forme dans Wikidata, ligne inutile`);
        g = lg.masculin;
      } else if (formesG.length === 1) g = formesG[0];
      else if (formesG.length > 1) faute(`${id} : ${formesG.length} formes masculines du gentilé dans Wikidata (${formesG.join(', ')}), à trancher dans la table (gentile_territoires)`);
      if (g) {
        T.g = g;
        try {
          T.gp = lg?.pluriel ?? plurielGentile(g);
        } catch (err) {
          faute(`${id} : ${err.message}`);
        }
      }
      R.gentiles.push({ id, formes: formesG, brutes: (w.gentiles ?? []).map((d) => d.v), retenu: g, pluriel: T.gp ?? null, ligne: lg ?? null });
    }

    // Point culminant (territoire, Antarctique) : la règle des pays (le sommet déclaré, son
    // altitude), aucun dans une zone disputée ; la table corrige (alt) ou n'en veut aucun.
    if (sorte !== 'zone') {
      const lc = table.culminant[id];
      const decl = w.culminants ?? [];
      const { sommet } = sommetRetenu(decl, lc);
      if (!lc?.aucun && !sommet && decl.length) faute(`${id} : ${decl.length} sommets déclarés dans Wikidata, aucun préféré seul : à trancher (culminant_territoires)`);
      if (lc?.aucun && !decl.length) faute(`fiches-main.json, culminant_territoires.${id} : aucun, mais Wikidata n'en déclare pas, ligne inutile`);
      const s = sommet ? wd.sommets[sommet] : null;
      const alt = s ? altitude(s.altitudes) : { m: null, valeurs: [] };
      const nomS = lc?.nom ?? s?.fr ?? null;
      const m = lc?.alt ?? alt.m;
      if (lc?.alt != null && lc.alt === alt.m) faute(`fiches-main.json, culminant_territoires.${id} : ${lc.alt} m est déjà l'altitude de Wikidata`);
      if ((lc?.alt != null || lc?.nom) && !/^Wikidata\b/.test(lc.source ?? '')) faute(`fiches-main.json, culminant_territoires.${id} : une valeur écrite à la main doit dire sa source dans Wikidata (source)`);
      if (lc?.nom && s?.fr === lc.nom) faute(`fiches-main.json, culminant_territoires.${id} : « ${lc.nom} » est déjà le libellé de Wikidata`);
      const coord = coordSommet(s);
      const f = forme.get(id);
      const distBrute = coord && f ? distanceAuTrace(f, coord) : null;
      const dist = distBrute == null ? null : Math.round(distBrute * 10) / 10;
      let presZones = [];
      if (sommet && !lc?.aucun) {
        if (!nomS) faute(`${id} : le sommet ${sommet} n'a pas de nom français : à écrire ou à écarter (culminant_territoires)`);
        if (m == null) faute(`${id} : altitude du sommet ${sommet} à trancher (${alt.valeurs.join(', ') || 'aucune'})`);
        else if (m < 1 || m > 8850) faute(`${id} : altitude ${m} m hors de 1 à 8 850`);
        if (dist != null && dist > 10) faute(`${id} : le sommet ${nomS ?? sommet} est à ${dist} km du tracé`);
        presZones = zonesPres(zones.filter((x, i) => pres(empZones[i], coord ?? [0, 0])), coord, distBrute ?? 0, id, tenuesPar);
        for (const z of presZones) if (z.dedans) faute(`${id} : le sommet ${nomS ?? sommet} est dans la zone disputée ${z.zone} (aucun point culminant n'y passe)`);
        if (nomS && m != null) {
          L.alt = m;
          T.cu = nomS;
        }
      }
      R.culminants.push({ id, sorte, sommet, nom: nomS, m, valeurs: alt.valeurs, declares: decl.map((d) => ({ q: d.v, nom: wd.sommets[d.v]?.fr ?? null, en: wd.sommets[d.v]?.en ?? null })), dist, presZones: presZones.filter((z) => !z.dedans), ligne: lc ?? null });
    }

    lieux[id] = L;
    textes[id] = T;
  }
  for (const code of Object.keys(nomsLangues)) if (!utilisees.noms.has(code)) faute(`fiches-main.json, langues_territoires.noms.${code} : nom d'une langue qu'aucun territoire ne montre`);
  R.languesNoms = Object.entries(nomsLangues).map(([code, l]) => ({ code, ...l }));
  return { lieux, textes, relecture: R, fautes };
}

// --- Le tableau à relire -------------------------------------------------------------

const cel = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const nb = (x) => (x == null ? '—' : Number(x).toLocaleString('fr-FR'));
const relire = (l) => (l?.a_relire ? `**à relire** : ${l.a_relire === true ? 'voir la raison' : l.a_relire}` : '');
const signe = (h) => (h == null ? '—' : `UTC${h >= 0 ? '+' : '−'}${Math.abs(h).toLocaleString('fr-FR')}`);

function tableau(entetes, rangs) {
  if (!rangs.length) return '_Aucune ligne._\n';
  return [`| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...rangs.map((l) => `| ${l.map(cel).join(' | ')} |`)].join('\n') + '\n';
}

/**
 * Le texte de docs/relectures/fiches-territoires-chiffres.md. R : la relecture de
 * chiffresAutres ; noms : noms.fr.json ; langues, monnaies : les noms servis ; sources :
 * {wikidata, bm, cldr, tz}. Identique octet pour octet d'un lancement à l'autre.
 */
export function texteRelectureAutres({ R, noms, langues, monnaies, sources }) {
  const nom = (id) => noms[id] ?? id;
  const parNom = (a, b) => nom(a.id).localeCompare(nom(b.id), 'fr');
  const trie = (l) => [...l].sort(parNom);
  const nomL = (c) => langues[c] ?? c;
  const enLigne = '**Dans la fiche : affichée** (aucune relecture attendue ; une erreur se corrige quand même ici).';
  // Relecture du lot F3 : une section affichée n'affiche aucune ligne « à relire » ; la table la retire d'ici la réponse.
  const enLigneSauf = '**Dans la fiche : affichée**, sauf les lignes « à relire » : la table les retire (pas de ligne) d\'ici la réponse ; une erreur se corrige quand même ici.';
  const tue = (cle) => `**Dans la fiche : tue** tant que \`${cle}\` est à \`false\` dans \`src/fiches/relues.ts\` (\`LIGNES_RELUES\`) ; à passer à \`true\` une fois cette section relue.`;
  const o = [];
  o.push('# Fiches des territoires, des zones contestées et de l\'Antarctique : chiffres à relire');
  o.push('');
  o.push(
    '*Écrit par le build (`npm run fiches`, `geodata/fiches-autres.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. ' +
      'Ticket #34, lot F3 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.2, § 2.6 et § 9 (D57). ' +
      'Les statuts (textes en tête de fiche) sont dans `docs/relectures/fiches-territoires.md`.*',
  );
  o.push('');
  o.push('## Comment relire, comment corriger');
  o.push('');
  o.push(
    '- Ce que montre la fiche : un **territoire** a ses habitants, sa superficie, sa capitale, ses langues, sa monnaie, son gentilé, son heure, son point culminant et son lien, quand la source les donne ; ' +
      'une **zone contestée** n\'a que ses habitants (s\'ils sont sourcés) et son lien (D57 a : rien de ce qui est celui d\'une administration) ; ' +
      'l\'**Antarctique** a sa superficie, son point culminant et son lien, rien sur les revendications. Une ligne sans donnée n\'est pas affichée.',
  );
  o.push(
    '- Chaque section dit si sa ligne est déjà affichée ou tue jusqu\'à la relecture. Une section tue s\'affiche quand sa clé de `LIGNES_RELUES` (`src/fiches/relues.ts`) passe à `true`.',
  );
  o.push(
    '- Pour corriger : la ligne du lieu dans `geodata/fiches-main.json` (clé donnée en tête de section, une raison par ligne), puis `npm run fiches`. ' +
      'Le build échoue si une ligne ne s\'applique plus (valeur déjà celle de la source, lieu inconnu, raison absente). Pour valider une ligne « à relire » : retirer son `a_relire`.',
  );
  o.push(`- Sources : Wikidata (extrait du ${sources.wikidata}), Banque mondiale (${sources.bm}), CLDR ${sources.cldr}, base tz ${sources.tz}.`);
  o.push('');

  // 1. Capitales
  const caps = trie(R.capitales);
  o.push('## 1. Capitales des territoires (clé `capitale_territoires`)');
  o.push('');
  o.push(`${tue('capitale_territoires')} D'ici là, la barre d'un territoire ne dit que ses habitants, et sa ligne d'heure s'appelle « Heure locale ».`);
  o.push('');
  o.push(
    `Règle : la capitale déclarée par Wikidata (P36) ; s'il y en a plusieurs, celle de rang préféré, sans celles qui ont une fin ; le nom est le libellé français de Wikidata. ` +
      `${caps.filter((c) => c.nom).length} territoires sur ${caps.length} ont une capitale ; les autres n'en déclarent pas (une ville, des îles sans siège, une base).`,
  );
  o.push('');
  o.push(
    tableau(
      ['Territoire', 'Capitale affichée', 'Déclarations de Wikidata (P36)', 'Comment', 'À relire'],
      caps.map((c) => [
        nom(c.id),
        c.nom ?? '—',
        c.declarations.map((d) => `${d.nom ?? d.v} (${d.v}${d.rang === 'preferred' ? ', préféré' : ''}${d.debut ? `, depuis ${d.debut.slice(0, 4)}` : ''}${d.fin ? `, jusqu'en ${d.fin.slice(0, 4)}` : ''}${d.qualite.length ? `, ${d.qualite.join(', ')}` : ''})`).join(' ; ') || 'aucune',
        c.ligne ? `table : ${c.ligne.raison}` : c.declarations.length > 1 ? 'règle : le rang préféré' : c.nom ? 'règle : la seule déclarée' : 'aucune capitale',
        relire(c.ligne),
      ]),
    ),
  );

  // 2. Habitants
  const hs = trie(R.habitants);
  o.push('## 2. Habitants (clé `habitants_territoires`)');
  o.push('');
  o.push(
    `Territoires : ${enLigneSauf} Zones contestées : ${tue('habitants_zones')} ` +
      'Règle : la Banque mondiale (2025) pour les 21 territoires qu\'elle couvre ; sinon Wikidata (P1082 : rang préféré, sinon la plus récente), avec son année. ' +
      '0 : « aucun habitant permanent », sans année ; un nombre positif sans année : pas de ligne. La table retire le nombre d\'un territoire sans habitant permanent dont Wikidata compte le personnel.',
  );
  o.push('');
  o.push(
    tableau(
      ['Lieu', 'Sorte', 'Affiché', 'Source', 'Remarque', 'À relire'],
      hs.map((h) => [
        nom(h.id),
        h.sorte === 'zone' ? 'zone contestée' : 'territoire',
        !h.h ? '—' : h.h.v === 0 ? 'aucun habitant permanent' : h.montre ? `${nb(h.h.v)} (${h.h.annee})` : h.ligne?.aucun ? `— (pas de ligne ; Wikidata : ${nb(h.h.v)} en ${h.h.annee})` : `— (${nb(h.h.v)}, sans année)`,
        !h.h ? '—' : h.h.source === 'bm' ? 'Banque mondiale' : `Wikidata (${h.declarations} déclaration${h.declarations > 1 ? 's' : ''})${h.ligne?.source ? ` ; ${h.ligne.source}` : ''}`,
        h.ligne ? `table : ${h.ligne.raison}` : !h.h ? 'aucun chiffre dans les sources : pas de ligne' : h.h.annee && h.h.annee < 2015 && h.h.v > 0 ? `chiffre ancien (${h.h.annee})` : '',
        relire(h.ligne),
      ]),
    ),
  );

  // 3. Superficies
  const ss = trie(R.superficies);
  o.push('## 3. Superficies (règle, sans clé)');
  o.push('');
  o.push(
    `${tue('superficie_territoires')} Territoires et Antarctique ; aucune pour une zone (D57). Règle des pays : Wikidata (P2046, en km²), rang préféré, la plus récente, sinon la plus grande ; ` +
      'la surface du tracé de la carte est montrée pour comparer, jamais affichée.',
  );
  o.push('');
  o.push(
    tableau(
      ['Lieu', 'Retenue (km²)', 'Valeurs de Wikidata', 'Tracé de la carte (km²)', 'Remarque', 'À relire'],
      ss.map((s) => {
        const ecart = s.retenue && s.trace && (s.retenue / s.trace > 2 || s.trace / s.retenue > 2);
        // Relecture du lot F3 : une valeur somme de deux autres (Hong Kong : 2 755 = 1 106 + 1 649) compte des eaux.
        const kms = s.kms ?? [];
        const somme = kms.find((x, i) => kms.some((y, j) => j !== i && kms.some((z, k) => k !== i && k > j && Math.abs(x - y - z) < 1)));
        return [
          nom(s.id),
          nb(s.retenue),
          s.valeurs.join(' ; ') || 'aucune',
          nb(Math.round(s.trace)),
          [s.valeurs.length > 1 ? 'plusieurs valeurs : la plus grande retenue' : '', somme != null ? `${nb(somme)} est la somme des deux autres valeurs (des terres et des eaux ?)` : '', s.autres ? `${s.autres} valeur(s) dans une autre unité, écartée(s)` : '', ecart ? 'écart de plus du double avec le tracé' : ''].filter(Boolean).join(' ; '),
          ecart ? `**à relire** : la valeur de Wikidata compte-t-elle des eaux, un lagon ou des récifs ? Sinon le tracé de la carte (${nb(Math.round(s.trace))} km²) est trop grossier à cette échelle${somme != null ? ` ; ${nb(Math.min(...kms))} km² pour les terres seules ?` : ''}` : '',
        ];
      }),
    ),
  );

  // 4. Langues
  const ls = trie(R.langues);
  o.push('## 4. Langues des territoires (clé `langues_territoires`, D56 c)');
  o.push('');
  o.push(`${tue('langues_territoires')} Règle des pays : les langues officielles de CLDR, puis les langues du territoire parlées par 10 % ou plus, avec leur part ; la table retire ou ajoute.`);
  o.push('');
  o.push(
    tableau(
      ['Territoire', 'Affiché', 'Candidates de CLDR', 'Retraits et ajouts', 'À relire'],
      ls.map((l) => {
        const off = l.finales.filter((x) => x.officielle).map((x) => nomL(x.code));
        const parl = l.finales.filter((x) => !x.officielle).map((x) => `${nomL(x.code)} ${Math.round(x.pct)} %`);
        return [
          nom(l.id),
          [off.join(', '), ...parl].filter(Boolean).join(' · ') || '— (pas de ligne)',
          l.cand.map((x) => `${x.code}${x.officielle ? ' (officielle)' : ''} ${x.pct} %`).join(', ') || '—',
          [...Object.entries(l.retirer).map(([c, r]) => `retrait ${c} : ${r}`), ...Object.entries(l.ajouter).map(([c, a]) => `ajout ${c}${a.officielle ? ' (officielle)' : ''} : ${a.raison ?? ''} (${a.source})`)].join(' ; '),
          relire(l.ligne),
        ];
      }),
    ),
  );
  if (R.languesNoms.length) {
    o.push('Noms français absents de CLDR, écrits à la main :');
    o.push('');
    o.push(tableau(['Code', 'Nom', 'Source'], R.languesNoms.map((l) => [l.code, l.nom, l.source])));
  }

  // 5. Monnaies
  o.push('## 5. Monnaies des territoires (règle, sans clé)');
  o.push('');
  o.push(`${enLigne} Règle des pays : la monnaie en cours de CLDR (currencyData) ; aucun territoire n'en a plusieurs.`);
  o.push('');
  o.push(tableau(['Territoire', 'Monnaie'], trie(R.monnaies).map((m) => [nom(m.id), m.m.map((c) => monnaies[c] ?? c).join(', ') || '—'])));

  // 6. Gentilés
  const gs = trie(R.gentiles).filter((g) => g.brutes.length || g.ligne);
  o.push('## 6. Gentilés des territoires (clé `gentile_territoires`)');
  o.push('');
  o.push(
    `${tue('gentile_territoires')} Règle des pays : la forme masculine de Wikidata (P1549, en français), au pluriel (« les Groenlandais ») ; la table tranche entre plusieurs formes ou n'en veut aucune. ` +
      `Seuls les territoires où Wikidata donne un gentilé sont listés (${gs.length} sur ${R.gentiles.length}).`,
  );
  o.push('');
  o.push(
    tableau(
      ['Territoire', 'Affiché', 'Formes de Wikidata', 'Comment', 'À relire'],
      gs.map((g) => [nom(g.id), g.pluriel ? `les ${g.pluriel}` : '— (pas de ligne)', g.brutes.join(', '), g.ligne ? `table : ${g.ligne.raison}` : 'règle : la seule forme masculine', relire(g.ligne)]),
    ),
  );

  // 7. Heure
  const hz = trie(R.heures);
  o.push('## 7. Heure locale des territoires (clé `zone_territoires`)');
  o.push('');
  o.push(
    `${enLigneSauf} La zone est écrite à la main pour chaque territoire (§ 2.2 : la plus proche de la capitale ne suffit pas, le Groenland sortait à Danmarkshavn) ; le build vérifie qu'elle est dans zone.tab et qu'elle est celle du code du territoire, sinon la ligne dit pourquoi (hors code). ` +
      'Pas de nombre de fuseaux pour un territoire. Le libellé est « Heure à <capitale> » une fois les capitales relues, « Heure locale » d\'ici là.',
  );
  o.push('');
  o.push(
    tableau(
      ['Territoire', 'Zone', 'Hiver / été', 'Zones de zone.tab pour son code', 'Raison', 'À relire'],
      hz.map((h) => [
        nom(h.id),
        h.zone ?? '— (pas de ligne)',
        h.zone ? (h.hiver === h.ete ? signe(h.hiver) : `${signe(h.hiver)} / ${signe(h.ete)}`) : '—',
        h.duCode.join(', ') || 'aucune',
        [h.ligne?.raison, h.ligne?.hors_code ? `hors code (${h.cc}) : ${h.ligne.hors_code}` : '', h.km ? `point de zone.tab à ${nb(h.km)} km du tracé` : ''].filter(Boolean).join(' ; '),
        relire(h.ligne),
      ]),
    ),
  );

  // 8. Sommets
  const cs = trie(R.culminants).filter((c) => c.declares.length || c.ligne);
  o.push('## 8. Points culminants (clé `culminant_territoires`)');
  o.push('');
  o.push(
    `${tue('culminant_territoires')} Territoires et Antarctique ; aucun pour une zone. Règle des pays : le sommet déclaré par Wikidata (P610), son altitude (P2044) ; ` +
      'aucun point culminant dans une zone disputée, et le sommet à 10 km au plus du tracé (vérifiés par le build). Seuls les lieux où Wikidata déclare un sommet sont listés.',
  );
  o.push('');
  o.push(
    tableau(
      ['Lieu', 'Affiché', 'Sommets déclarés', 'Altitudes de Wikidata', 'Distance au tracé', 'Comment', 'À relire'],
      cs.map((c) => [
        nom(c.id),
        c.m != null && c.nom && !c.ligne?.aucun ? `${c.nom}, ${nb(c.m)} m` : '— (pas de ligne)',
        c.declares.map((d) => `${d.nom ?? `sans nom français (${d.en ?? '—'})`} (${d.q})`).join(' ; '),
        c.valeurs.join(', ') || 'aucune',
        c.dist == null ? '—' : c.dist === 0 ? 'dedans' : `${nb(c.dist)} km`,
        [c.ligne ? `table : ${c.ligne.raison}` : 'règle', ...c.presZones.map((z) => `à ${nb(z.km)} km de la zone disputée ${z.zone}`)].join(' ; '),
        relire(c.ligne),
      ]),
    ),
  );

  // 9. Liens
  const lk = trie(R.liens);
  o.push('## 9. Liens vers la Wikipédia en français (clé `wp`)');
  o.push('');
  o.push(`${enLigne} Le titre de l'article de l'item du lieu (clé \`qid\`) ; la table le corrige.`);
  o.push('');
  o.push(
    tableau(
      ['Lieu', 'Sorte', 'Item', 'Article', 'Comment'],
      lk.map((l) => [nom(l.id), { territoire: 'territoire', zone: 'zone contestée', continent: 'continent' }[l.sorte], l.q, l.titre ?? '— (pas de lien)', l.ligne ? `table : ${l.ligne.raison}` : l.titre ? 'article de l\'item' : 'l\'item n\'a pas d\'article en français']),
    ),
  );
  return o.join('\n').replace(/\n{3,}/g, '\n\n');
}
