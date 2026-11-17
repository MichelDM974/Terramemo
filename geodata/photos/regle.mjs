// Règle des licences et nettoyage des auteurs des photos (#34, lot P1 ; étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.2). Fonctions pures, sans réseau,
// sans effet à l'import : geodata/photos/candidats.mjs et relecture.mjs (titre collé par
// « R ») les appliquent aux métadonnées de Commons (prop=imageinfo, extmetadata), et
// tests/donnees-photos.test.ts les contrôle sur un jeu d'essai tiré des 1 917 fichiers
// du relevé R5 (tests/photos-licences-essai.json).
//
// Une photo passe si tout est vrai : format JPEG, PNG, TIFF ou WebP ; NonFree faux ;
// licence CC0, domaine public, CC BY ou CC BY-SA 2.0 à 4.0 (variantes de pays et IGO
// comprises : l'attribution est la même) ; Restrictions vide ; un auteur identifiable
// pour CC BY et BY-SA (CC BY demande de le nommer) ; nom de fichier sans mot de carte,
// de drapeau, de logo, de satellite, ni de scène militaire ou politique, et pas d'une
// armée pour auteur ; 1 080 × 720 px
// au moins (la condition pour qu'un recadrage 3:2 ne soit jamais agrandi en plein écran).
// Refusées pour n'avoir qu'une règle d'affichage : NC, ND (on recadre), GFDL seule,
// « Attribution » sans texte, OGL, Free Art License, « Copyrighted free use », et « No
// restrictions » (Flickr Commons, « no known copyright restrictions » : une absence de
// droits connus, pas une licence ni une mise au domaine public ; R5 la comptait dans le
// domaine public, 14 fichiers sur 1 917 : à trancher par l'utilisateur).

/** Champs extmetadata à demander à Commons (iiextmetadatafilter). */
export const CHAMPS_META = [
  'Attribution', 'Artist', 'Credit', 'LicenseShortName', 'LicenseUrl', 'UsageTerms', 'AttributionRequired',
  'Restrictions', 'NonFree', 'Copyrighted', 'ObjectName', 'ImageDescription',
];

export const FORMATS = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
export const LARGEUR_MIN = 1080;
export const HAUTEUR_MIN = 720;
export const AUTEUR_MAX = 80;

/** Raisons de refus, dans l'ordre où la règle les essaie (la première qui vaut compte). */
export const RAISONS = ['absent', 'format', 'non_libre', 'licence', 'restrictions', 'auteur', 'nom', 'sujet', 'petite'];

// Mots d'un nom de fichier qui font une carte, une vue satellite, un drapeau, un logo ou
// un schéma (relevé R5, § 2.2, et ses deux trous vus à l'œil : « Landsat », « Show Your
// Stripes »). Ni « plan » (« plan d'eau ») ni « route » (une route est un paysage) : la
// relecture attrape le reste.
const MOTS_NOM = [
  'map', 'maps', 'carte', 'cartes', 'mapa', 'karte', 'locator', 'location', 'satellite', 'landsat', 'sentinel-2', 'modis',
  'flag', 'flags', 'drapeau', 'drapeaux', 'bandera', 'coat of arms', 'blason', 'armoiries', 'logo', 'emblem', 'seal',
  'diagram', 'schema', 'schéma', 'chart', 'graph', 'stripes', 'stamp', 'banknote', 'poster',
];
// Mots d'une scène que la règle de relecture refuse (§ 3.4 : militaires, armes, réunions
// politiques) : la marine américaine du golfe d'Aden, les défilés du Tchad (R5, § 1.1).
// Pas « summit » : « Chachani summit » est un sommet.
const MOTS_SUJET = ['navy', 'uss', 'usns', 'hms', 'warship', 'frigate', 'destroyer', 'army', 'military', 'soldier', 'soldiers', 'troops', 'conference', 'meeting', 'protest', 'demonstration'];

// Pour une expression en mode u : « - » ne s'y échappe pas hors d'une classe.
const echapper = (m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motif = (mots) => new RegExp(`(^|[^\\p{L}\\p{N}])(${mots.map((m) => echapper(m)).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu');
// Auteurs qui sont une armée : leurs photos sont presque toujours une scène militaire (la
// catégorie du golfe d'Aden est à 100 % de la marine américaine, sous des noms de fichier
// comme « 090826-N-6814F-052 », que MOTS_SUJET ne voit pas).
const RE_AUTEUR_ARMEE = /\b(navy|usn|marines|naval forces|national guard|department of defense|defense visual|marine corps|army|air force|coast guard|military)\b/i;
const RE_NOM = motif(MOTS_NOM);
const RE_SUJET = motif(MOTS_SUJET);

/**
 * Textes qui ne sont pas un auteur (§ 3.2) : vides, « Own work » et ses traductions,
 * « Unknown » et ses variantes, « Anonymous », « Auteur inconnu ». Un texte fait
 * seulement de ces mots (répétés, comme « Unknown authorUnknown author… », ou mêlés de
 * ponctuation) n'est pas un auteur ; une adresse web seule non plus. « null » : 6 fois
 * dans le relevé, le texte même. Les plus longues d'abord : l'alternative prend la
 * première qui convient.
 */
export const FAUX_AUTEURS = [
  'unknown author or not provided', 'author not provided', 'not provided',
  'own work', 'travail personnel', 'eigenes werk', 'trabajo propio', 'opera propria', 'trabalho próprio', 'self-photographed',
  'unknown author', 'author unknown', 'unknown photographer', 'photographer unknown', 'unknown artist', 'unknown',
  'auteur inconnu', 'inconnu', 'anonymous', 'anonyme', 'anonimo', 'anónimo', 'unbekannt', 'desconocido',
  'not credited', 'null', 'none', 'n/a',
];
const RE_FAUX = new RegExp(FAUX_AUTEURS.map((m) => echapper(m)).join('|'), 'giu');
const RE_ADRESSE = /^(https?:\/\/|www\.)\S+$/i;

/** HTML de Commons en texte brut : balises retirées, entités décodées, espaces repliés. */
export function texteBrut(html) {
  const s = String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e.toLowerCase()] ?? m;
    });
  return s.replace(/\s+/g, ' ').trim();
}

/** Vrai si le texte n'est pas un auteur (liste FAUX_AUTEURS, adresse web seule, vide). */
export function fauxAuteur(texte) {
  const t = String(texte ?? '').trim();
  if (!t) return true;
  if (RE_ADRESSE.test(t)) return true;
  return t.replace(RE_FAUX, '').replace(/[\s\p{P}\p{S}]/gu, '') === '';
}

/**
 * Le nom de l'auteur d'un champ de Commons, nettoyé : texte brut, sans « User: »,
 * « Author: », « Photo: », « by », « © » en tête ; le nom tiré du bruit « No
 * machine-readable author provided. X assumed (based on copyright claims). » ; tronqué
 * à 80 caractères (« … »). null si ce n'est pas un auteur.
 */
export function nettoyerAuteur(html) {
  let s = texteBrut(html);
  const suppose = /No machine-readable author provided\.\s*(.+?)\s+assumed \(based on copyright claims\)\.?/i.exec(s);
  if (suppose) s = suppose[1];
  // Préfixes suivis d'un deux-points ou d'une espace seulement : « Byron » reste « Byron ».
  for (let i = 0; i < 2; i++) s = s.replace(/^(?:(?:user|utilisateur|author|auteur|photo(?:graph(?:er)?)?|by|par)(?:\s*[:\-]\s*|\s+)|(?:©|\(c\))\s*)/i, '').trim();
  if (fauxAuteur(s)) return null;
  return s.length > AUTEUR_MAX ? `${s.slice(0, AUTEUR_MAX - 1).trimEnd()}…` : s;
}

/**
 * La licence d'après LicenseShortName : { code, famille: 'cc0'|'pd'|'by'|'by-sa',
 * version, variante } ou null si elle n'est pas de la liste permise.
 */
export function licenceDe(court) {
  const t = String(court ?? '').trim();
  const l = t.toLowerCase();
  if (/^cc0\b/.test(l) || l === 'cc-zero') return { code: 'CC0', famille: 'cc0', version: '1.0', variante: null };
  if (/^(public domain|domaine public|pd)$/.test(l) || /^pd[- ]/.test(l)) return { code: 'Domaine public', famille: 'pd', version: null, variante: null };
  const m = /^cc[- ]by(-sa)?[- ](\d\.\d)(?:[- ]([a-z]{2,3}))?$/.exec(l);
  if (!m) return null; // NC, ND, GFDL, Attribution, OGL, FAL, No restrictions… : refusées
  const version = m[2];
  if (!['2.0', '2.1', '2.5', '3.0', '4.0'].includes(version)) return null;
  const famille = m[1] ? 'by-sa' : 'by';
  return { code: `CC ${famille.toUpperCase()} ${version}${m[3] ? ` ${m[3]}` : ''}`, famille, version, variante: m[3] ?? null };
}

/** Lien du texte de la licence : celui de Commons en https, sinon construit ; null pour le domaine public. */
export function lienLicence(licence, urlCommons) {
  if (licence.famille === 'pd') return null;
  const u = String(urlCommons ?? '').trim().replace(/^http:\/\//, 'https://');
  if (/^https:\/\/creativecommons\.org\//.test(u)) return u;
  if (licence.famille === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return `https://creativecommons.org/licenses/${licence.famille}/${licence.version}/${licence.variante ? `${licence.variante}/` : ''}`;
}

/** Page Commons d'un fichier (« File: », espaces en soulignés, encodée). */
export function pageCommons(fichier) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fichier.replaceAll(' ', '_')).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2F/g, '/')}`;
}

/**
 * Verdict de la règle pour un fichier. info : { w, h, mime, meta } (meta : les valeurs
 * de extmetadata, en texte), ou null si Commons ne connaît pas le fichier. Rend
 * { ok: true, licence, licence_url, auteur, titre, page } ou { ok: false, raison }.
 * auteur null pour une photo du domaine public ou CC0 sans auteur : la fiche affichera
 * « Auteur inconnu » (lot P2).
 */
export function verdict(fichier, info) {
  if (!info) return { ok: false, raison: 'absent' };
  const m = info.meta ?? {};
  const g = (k) => texteBrut(m[k]);
  if (!FORMATS.includes(info.mime)) return { ok: false, raison: 'format' };
  if (!['', 'false'].includes(g('NonFree').toLowerCase())) return { ok: false, raison: 'non_libre' };
  const licence = licenceDe(g('LicenseShortName'));
  if (!licence) return { ok: false, raison: 'licence' };
  if (g('Restrictions')) return { ok: false, raison: 'restrictions' };
  // Attribution d'abord : la mention que l'auteur exige quand il en a une (§ 3.2) ; puis
  // Artist. Jamais Credit : c'est la provenance (« Own work », « Transferred from
  // en.wikipedia », un site), pas l'auteur ; R5 s'en servait en repli.
  const auteur = nettoyerAuteur(m.Attribution) ?? nettoyerAuteur(m.Artist);
  if (!auteur && (licence.famille === 'by' || licence.famille === 'by-sa')) return { ok: false, raison: 'auteur' };
  const nom = fichier.replace(/\.[a-z0-9]+$/i, '').replaceAll('_', ' ');
  if (RE_NOM.test(nom)) return { ok: false, raison: 'nom' };
  if (RE_SUJET.test(nom) || RE_AUTEUR_ARMEE.test(texteBrut(m.Artist)) || RE_AUTEUR_ARMEE.test(texteBrut(m.Attribution))) return { ok: false, raison: 'sujet' };
  if (!(info.w >= LARGEUR_MIN && info.h >= HAUTEUR_MIN)) return { ok: false, raison: 'petite' };
  const titre = texteBrut(m.ObjectName) || null;
  return {
    ok: true,
    licence: licence.code,
    licence_url: lienLicence(licence, g('LicenseUrl')),
    auteur,
    ...(m.Attribution && nettoyerAuteur(m.Attribution) ? { auteur_de: 'Attribution' } : {}),
    titre: titre && titre.length > 120 ? `${titre.slice(0, 119).trimEnd()}…` : titre,
    page: pageCommons(fichier),
  };
}

/**
 * Part de l'image perdue par le recadrage 3:2 (0 à 1) : la bande jaune de l'outil de
 * relecture au-delà de 0,3 (§ 3.4). Le cadre 3:2 le plus grand qui tient dans l'image.
 */
export function perteRecadrage(w, h) {
  if (!(w > 0 && h > 0)) return 0;
  const cw = Math.min(w, h * 1.5);
  const ch = cw / 1.5;
  return 1 - (cw * ch) / (w * h);
}
