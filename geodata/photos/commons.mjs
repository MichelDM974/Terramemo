// Lecture des fichiers de Commons pour la règle des licences (#34, lot P1 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.2) : taille, format, miniature,
// extmetadata et catégories (cachées comprises : « Deletion requests … », « NoFoP-… »),
// par lots de 50 titres. Partagée par candidats.mjs et par « R » de relecture.mjs, pour
// que les deux appliquent la règle aux mêmes données. Sans effet à l'import.
//
// Les catégories de 50 fichiers dépassent parfois la limite d'une réponse (cllimit=max,
// 500 en tout) : on suit « continue » jusqu'à « batchcomplete », en fusionnant les pages
// par titre (une suite n'a que des catégories, pas d'imageinfo).

import { CHAMPS_META } from './regle.mjs';

export const MINIATURE = 500; // largeur des miniatures de l'outil (une largeur standard de Commons)
export const PAR_LOT = 50; // titres par requête (plafond de l'API sans droit de robot)
const SUITES_MAX = 20;

/** Durée de vie d'une réponse imageinfo du cache : 30 jours, puis elle est relue. */
export const VIE_IMAGEINFO_MS = 30 * 24 * 3600 * 1000;

/**
 * Lit les fichiers sur Commons. Rend une Map nom → info, où info vaut { w, h, mime,
 * miniature, meta, categories, lu_le } ; null quand Commons dit le fichier absent
 * (missing) ou le titre invalide. Un fichier que la réponse ne décrit pas (ni imageinfo,
 * ni missing) n'est pas dans la Map : il est « à compléter », pas refusé. Chaque fichier
 * est rangé sous le nom demandé et sous le titre normalisé par Commons.
 */
export async function lireFichiers(reseau, fichiers, { vie = VIE_IMAGEINFO_MS } = {}) {
  const res = new Map();
  const liste = [...new Set(fichiers)];
  for (let i = 0; i < liste.length; i += PAR_LOT) {
    const lot = liste.slice(i, i + PAR_LOT);
    const base = {
      action: 'query',
      titles: lot.map((f) => `File:${f}`).join('|'),
      prop: 'imageinfo|categories',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(MINIATURE),
      iiextmetadatafilter: CHAMPS_META.join('|'),
      // En anglais : le bruit « No machine-readable author provided » se reconnaît dans
      // cette langue (regle.mjs), comme dans les 1 917 fichiers du relevé.
      iiextmetadatalanguage: 'en',
      cllimit: 'max',
    };
    const pages = new Map();
    const norm = new Map();
    let lu = null;
    let suite = {};
    for (let n = 0; ; n++) {
      if (n >= SUITES_MAX) throw new Error(`lot de ${lot.length} fichiers : plus de ${SUITES_MAX} suites`);
      const j = await reseau.commons({ ...base, ...suite }, { vie });
      const d = reseau.luLe?.(j) ?? null;
      if (d && (!lu || d < lu)) lu = d;
      for (const x of j.query?.normalized ?? []) norm.set(x.to, x.from);
      for (const p of j.query?.pages ?? []) {
        const q = pages.get(p.title) ?? { title: p.title, categories: [] };
        if (p.missing) q.missing = true;
        if (p.invalid) q.invalid = true;
        if (p.imageinfo?.[0]) q.ii = p.imageinfo[0];
        for (const c of p.categories ?? []) if (!q.categories.includes(c.title)) q.categories.push(c.title);
        pages.set(p.title, q);
      }
      if (!j.continue || j.batchcomplete) break;
      suite = j.continue;
    }
    for (const p of pages.values()) {
      const demande = (norm.get(p.title) ?? p.title).replace(/^File:/, '');
      let valeur;
      if (p.ii) {
        valeur = {
          w: p.ii.width,
          h: p.ii.height,
          mime: p.ii.mime,
          miniature: p.ii.thumburl ?? null,
          meta: Object.fromEntries(Object.entries(p.ii.extmetadata ?? {}).map(([k, v]) => [k, typeof v.value === 'string' ? v.value : String(v.value)])),
          categories: p.categories.map((c) => c.replace(/^Category:/, '')),
          lu_le: lu,
        };
      } else if (p.missing || p.invalid) valeur = null;
      else continue; // ni décrit ni absent : à compléter
      res.set(demande, valeur);
      res.set(p.title.replace(/^File:/, ''), valeur);
    }
  }
  return res;
}
