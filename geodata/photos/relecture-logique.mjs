// Logique de la page de relecture des photos (#34, lot P1 ; étude § 3.4), sortie de
// relecture.html pour être testée par vitest (tests/photos-outils.test.ts) : la page
// l'importe (servie par relecture.mjs sous /logique.mjs). Fonctions pures, sans DOM ni
// réseau : un lieu (de candidats.json), son entrée de choix.json (ou rien) et le nombre
// de photos gardées au plus.

/** Les candidats du lieu, les ajouts de « R » à la place de ceux qu'ils remplacent. */
export function candidatsDe(l, e) {
  const liste = l.candidats.map((c) => ({ ...c }));
  for (const a of e?.ajouts ?? []) {
    const i = a.remplace === null ? -1 : liste.findIndex((c) => c.fichier === a.remplace);
    if (i >= 0) liste[i] = { ...a };
    else liste.push({ ...a });
  }
  return liste;
}

/** Rien n'est coché d'avance pour un lieu sensible ou pauvre (§ 3.4), ou marqué pauvre. */
export const sansCocher = (l, e) => Boolean(l.sensible || l.pauvre || e?.pauvre);

/**
 * Un candidat jamais coché d'avance : sujet ou pays sensible, ou fichier rangé dans une
 * catégorie NoFoP de Commons (le bâtiment photographié peut avoir encore son auteur :
 * à regarder, § 3.4).
 */
export const aRegarder = (c) => Boolean(c.sensible || c.nofop);

/** Une photo gardée, tirée d'un candidat ; avant : la photo gardée qu'elle remplace (sujet, point). */
export function garde(l, c, avant) {
  const g = { fichier: c.fichier, sujet: avant?.sujet ?? c.sujet ?? `${l.nom} : photo`, licence: c.licence, licence_url: c.licence_url, auteur: c.auteur, titre: c.titre ?? null, page: c.page };
  if (avant?.point) g.point = avant.point;
  return g;
}

/**
 * L'entrée en cours du lieu (une copie) ; sinon un brouillon : les max premiers candidats
 * cochés d'avance, sauf lieu sensible ou pauvre et candidat à regarder.
 */
export function brouillon(l, e, max) {
  if (e) return structuredClone(e);
  const gardees = sansCocher(l, e) ? [] : candidatsDe(l, e).filter((c) => !aRegarder(c)).slice(0, max).map((c) => garde(l, c));
  return { etat: 'en_cours', gardees, ecartees: {} };
}

/**
 * Marque le lieu pauvre (raison) ou retire la marque (raison null). Un lieu sans entrée
 * part de rien de coché : le brouillon cochait d'avance les photos d'un lieu riche, et
 * « pauvre » veut dire que l'utilisateur choisit chaque photo lui-même. Une entrée déjà
 * là garde ses photos : ce sont des gestes de l'utilisateur.
 */
export function entreePauvre(l, e, raison, max) {
  if (raison === null) {
    const x = brouillon(l, e, max);
    delete x.pauvre;
    return x;
  }
  const x = e ? structuredClone(e) : { etat: 'en_cours', gardees: [], ecartees: {} };
  x.pauvre = raison;
  return x;
}

/**
 * Le recadrage 3:2 centré sur le point d'intérêt (fractions de la largeur et de la
 * hauteur), borné à l'image. Le traitement du lot P2 doit faire exactement ce calcul
 * pour que l'aperçu dise vrai. position : la valeur CSS object-position de l'aperçu.
 */
export function cadrage(c, point) {
  const [fx, fy] = point ?? [0.5, 0.5];
  const large = c.w / c.h > 1.5;
  const cw = large ? c.h * 1.5 : c.w;
  const ch = large ? c.h : c.w / 1.5;
  const ox = Math.min(Math.max(fx * c.w - cw / 2, 0), c.w - cw);
  const oy = Math.min(Math.max(fy * c.h - ch / 2, 0), c.h - ch);
  const px = c.w > cw ? (ox / (c.w - cw)) * 100 : 50;
  const py = c.h > ch ? (oy / (c.h - ch)) * 100 : 50;
  return { cw, ch, ox, oy, position: `${px.toFixed(1)}% ${py.toFixed(1)}%` };
}

/**
 * La garde de la validation (§ 3.4 : « une relecture trop rapide ne valide pas sans
 * regarder »). Moins de delai ms après l'affichage du lieu, un premier essai avertit ; le
 * second ne confirme qu'après un relâchement (keyup d'Entrée, ou un nouveau clic) et au
 * moins pause ms après l'avertissement : la répétition du clavier (Entrée gardé enfoncé)
 * ne confirme jamais. Pendant un enregistrement (occupe), tout essai attend.
 *   montre(t)      un lieu vient d'être affiché à l'instant t
 *   relache()      la touche est relâchée, ou un clic (qui est toujours un relâchement)
 *   essai(t)       'avertir' | 'valider' | 'attendre'
 *   occupe         vrai entre debut() et fin() d'une validation
 */
export function gardeValidation({ delai = 2000, pause = 400 } = {}) {
  let montreA = -Infinity;
  let avertiA = null;
  let relachee = true;
  const g = {
    occupe: false,
    montre(t) {
      montreA = t;
      avertiA = null;
      relachee = false;
    },
    relache() {
      relachee = true;
    },
    essai(t) {
      if (g.occupe) return 'attendre';
      if (t - montreA >= delai) return 'valider';
      if (avertiA === null) {
        avertiA = t;
        relachee = false;
        return 'avertir';
      }
      return relachee && t - avertiA >= pause ? 'valider' : 'attendre';
    },
    debut() {
      g.occupe = true;
    },
    fin() {
      g.occupe = false;
    },
  };
  return g;
}
