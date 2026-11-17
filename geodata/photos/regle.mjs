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
// armée pour auteur ; pas une vue de l'espace (nom de fichier de la NASA, de MODIS…, ou
// auteur qui est un service de télédétection) ; hors des catégories de problème de
// Commons (demande de suppression, licence à revoir…) ; 1 080 × 720 px au moins (la
// condition pour qu'un recadrage 3:2 ne soit jamais agrandi en plein écran). Une photo
// d'un fichier rangé dans une catégorie NoFoP-<pays> passe, marquée nofop : l'outil de
// relecture ne la coche pas d'avance et l'étiquette (liberté de panorama, § 3.4).
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

/**
 * Catégories de Commons (prop=categories, cachées comprises) qui disent que le droit de
 * reprendre le fichier est en doute : une demande de suppression ouverte, une licence que
 * personne n'a vérifiée (Flickr, YouTube), une permission ou une source manquantes. Par
 * préfixe : « Deletion requests August 2026 », « Copyright violations… ». Vues le 17/11
 * dans les candidats de l'échantillon (relecture du lot P1).
 */
export const CATEGORIES_STATUT = [
  'Deletion requests', 'Copyright violations', 'Candidates for speedy deletion', 'Speedy deletion',
  'License review needed', 'Flickr images needing human review', 'Flickr review needed', 'Flickr public domain images needing human review',
  'Media without a license', 'Media missing permission', 'Media without a source', 'Images without source', 'Images without license',
];
const RE_NOFOP = /^(?:Category:)?NoFoP-(.+)$/;

export const FORMATS = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
export const LARGEUR_MIN = 1080;
export const HAUTEUR_MIN = 720;

/** Raisons de refus, dans l'ordre où la règle les essaie (la première qui vaut compte). */
export const RAISONS = ['absent', 'format', 'non_libre', 'statut', 'licence', 'restrictions', 'auteur', 'nom', 'espace', 'sujet', 'petite'];

// Mots d'un nom de fichier qui font une carte, une vue satellite, un drapeau, un logo ou
// un schéma (relevé R5, § 2.2, et ses deux trous vus à l'œil : « Landsat », « Show Your
// Stripes »). Ni « plan » (« plan d'eau ») ni « route » (une route est un paysage) : la
// relecture attrape le reste.
const MOTS_NOM = [
  'map', 'maps', 'carte', 'cartes', 'mapa', 'karte', 'locator', 'location', 'satellite', 'landsat', 'sentinel-2', 'modis',
  'flag', 'flags', 'drapeau', 'drapeaux', 'bandera', 'coat of arms', 'blason', 'armoiries', 'logo', 'emblem', 'seal',
  'diagram', 'schema', 'schéma', 'chart', 'graph', 'stripes', 'stamp', 'banknote', 'poster',
  // Une mosaïque n'est pas une photo du lieu (« Montaje de puerto peñasco », « El
  // Aaiún-Laâyoune Collage »).
  'montage', 'montaje', 'collage',
];
// Mots d'une scène que la règle de relecture refuse (§ 3.4 : militaires, armes, réunions
// politiques) : la marine américaine du golfe d'Aden, les défilés du Tchad (R5, § 1.1).
// Pas « summit » : « Chachani summit » est un sommet.
// Puis la guerre et ses suites (« Forced Displacement of Gaza Strip Residents During the
// Gaza-Israel War », vu dans la Méditerranée) ; pas « ruins » : les ruines antiques sont
// du patrimoine. « war » à part : un monument aux morts reste un monument.
const MOTS_SUJET = [
  'navy', 'uss', 'usns', 'hms', 'warship', 'frigate', 'destroyer', 'army', 'military', 'soldier', 'soldiers', 'troops', 'conference', 'meeting', 'protest', 'demonstration',
  'guerre', 'displacement', 'displaced', 'refugee', 'refugees', 'réfugiés', 'refugies', 'bombing', 'airstrike', 'airstrikes', 'shelling', 'destroyed', 'casualties',
];
const RE_GUERRE = /(^|[^\p{L}\p{N}])war(?=$|[^\p{L}\p{N}])(?!\s+(memorial|monument|museum|cemetery))/iu;

// Pour une expression en mode u : « - » ne s'y échappe pas hors d'une classe.
const echapper = (m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motif = (mots) => new RegExp(`(^|[^\\p{L}\\p{N}])(${mots.map((m) => echapper(m)).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu');
// Auteurs qui sont une armée : leurs photos sont presque toujours une scène militaire (la
// catégorie du golfe d'Aden est à 100 % de la marine américaine, sous des noms de fichier
// comme « 090826-N-6814F-052 », que MOTS_SUJET ne voit pas).
const RE_AUTEUR_ARMEE = /\b(navy|usn|marines|naval forces|national guard|department of defense|defense visual|marine corps|army|air force|coast guard|military)\b/i;
const RE_NOM = motif(MOTS_NOM);
// Vues de l'espace (§ 3.2 ; règle de relecture : « refuser les vues satellite ») que les
// mots ne voient pas : noms de fichier de la NASA (ISS030-E-12345, STS114-…, S65-34658 des
// missions Gemini), de MODIS (Greenland.A2004208.1810.250m, Scandinavia.TMO2003050),
// d'ASTER (…_ast_2009036…), de Terra et Aqua datés ; figures d'article d'Elsevier
// (1-s2.0-S0016…, sept candidats du Sahara occidental). « SAT » en capitales seulement.
const MOTS_ESPACE = ['aster', 'nasa', 'blue marble', 'view of earth', 'from space', 'satview', 'astronaut photograph', 'earth observatory'];
const RE_ESPACE_NOM = [
  motif(MOTS_ESPACE),
  /(^|[^\p{L}])ISS[- ]?\d{1,3}(?=$|[^\p{N}])/iu,
  /(^|[^\p{L}])STS[- ]?\d{1,3}[A-Z]?-/iu,
  /^S\d{2}-\d{4,5}\b/,
  /\.A\d{7}\.\d{4}\b/,
  /(^|[._ ])(TMO|AMO|TMA|AMA)\d{7}\b/i,
  /\.\d{3,4}m$/i,
  /_ast_\d{7}/i,
  /\b(Terra|Aqua)\b.*\b(19|20)\d{6}\b/,
  /^1-s2\.0-S\d+/,
  /\bSAT\b/,
  /NASA(?=$|[^\p{L}])/u, // collé au nom : « OnekotanNASA », « MakanrushiNASA » (okhotsk)
];
// Auteurs qui sont un service de télédétection ou une mission spatiale : « Earth Science
// and Remote Sensing Unit, Lyndon B. Johnson Space Center », « MODIS Land Rapid Response
// Team », « ISS Expedition 28 crew », « Image Science & Analysis Laboratory », « ASTER
// Science Team » ; « NASA »
// seul aussi (les photos des missions Gemini). Pas « NASA » dans une phrase : « NASA/Bill
// Ingalls » est un photographe au sol ; ni « Goddard Space Flight Center » : ses photos
// d'avion de la mer de Weddell (Operation IceBridge) sont des vues de la mer.
const RE_AUTEUR_ESPACE = /\b(remote sensing|earth observatory|modis|rapid response|eosdis|expedition \d+|image science (&|and) analysis|johnson space center|landsat|astronaut photography|aster science team)\b|^\s*nasa\s*$/i;
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
  // Vus dans les candidats de l'échantillon (relecture du lot P1) : le nom du rôle, ou
  // une phrase qui renvoie ailleurs, à la place du nom.
  'self', 'self-made', 'self-published', 'own-work', 'author', 'photographer', 'uploader', 'original uploader',
  'see below', 'see file description', 'see description', 'not specified', 'unspecified', 'no author', 'unidentified', 'unidentified photographer',
  'this file is lacking author information', 'lacking author information', 'imported from flickr',
];
// Les plus longues d'abord : l'alternative prend la première qui convient.
const RE_FAUX = new RegExp([...FAUX_AUTEURS].sort((a, b) => b.length - a.length).map((m) => echapper(m)).join('|'), 'giu');
const RE_ADRESSE = /^(https?:\/\/|www\.)\S+$/i;
// Une provenance, pas un auteur : « Imported from Flickr », « Transferred from en.wikipedia ».
const RE_PROVENANCE = /^(imported|transferred|moved|copied) from\b/i;

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
  if (RE_ADRESSE.test(t) || RE_PROVENANCE.test(t)) return true;
  return t.replace(RE_FAUX, '').replace(/[\s\p{P}\p{S}]/gu, '') === '';
}

/**
 * Le nom de l'auteur d'un champ de Commons, nettoyé : texte brut, sans « User: »,
 * « Author: », « Photo: », « by », « © » en tête ; le nom tiré des formules de Commons
 * (« No machine-readable author provided. X assumed… », « The original uploader was X
 * at … », « This photo has been taken by X and released… », « taken or created by X. To
 * see… ») ; un lien de wikitexte ramené à son texte ; sans adresse électronique, ni
 * adresse web quand il reste un nom. Jamais coupé : CC BY demande de nommer tous les
 * créateurs désignés, l'affichage seul raccourcit (lot P2). null si ce n'est pas un auteur.
 */
export function nettoyerAuteur(html) {
  let s = texteBrut(html)
    // [//commons.wikimedia.org/wiki/User:X X] : le texte du lien ; un lien sans texte s'efface.
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\]/g, '')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '');
  const suppose = /No machine-readable author provided\.\s*(.+?)\s+assumed \(based on copyright claims\)\.?/i.exec(s);
  if (suppose) s = suppose[1];
  // « X Original uploader was Y at en.wikipedia » : X est l'auteur cité, Y l'envoyeur ; Y
  // seulement quand rien ne le précède.
  const envoyeur = /^(.*?)\s*(?:the\s+)?original uploader was\s+(.+?)\s+at\s+\S.*$/i.exec(s);
  if (envoyeur) s = fauxAuteur(envoyeur[1].replace(/[\s,;:\-–—]+$/, '')) ? envoyeur[2] : envoyeur[1];
  // « This image or media was taken or created by Matt H. Wade. To see his entire… » :
  // la fin de la phrase est un point suivi d'un mot puis d'une minuscule (« To see »),
  // pas l'initiale « H. ».
  const phrase = /\b(?:this (?:image|photo(?:graph)?|picture|work|file)(?: or media)?|it) (?:was|has been) (?:taken|created|made|photographed|shot)(?: or created)? by\s+(.+?)(?:\s+(?:and (?:is )?released|and published|and licensed|under)\b|\.\s+(?=[A-Z][a-z]*\s+[a-z])|[.\s]*$)/i.exec(s);
  if (phrase) s = phrase[1];
  // Une adresse web à côté d'un nom (« https://www.flickr.com/people/… Wajahat Mahmood ») ;
  // « www.foto-tw.de » reste : c'est la mention que l'auteur a choisie.
  const sansAdresse = s.replace(/\(\s*https?:\/\/[^\s)]*\s*\)|\bhttps?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (sansAdresse && !/^[\s\p{P}\p{S}]*$/u.test(sansAdresse)) s = sansAdresse;
  // Les restes d'un retrait (« Matti&Keti - » sans son adresse) ; « ---=XEON=--- » reste.
  s = s.replace(/^[\s,;:]+|[\s,;:]+$/g, '').replace(/\s+[-–—]+$|^[-–—]+\s+/g, '');
  // Préfixes suivis d'un deux-points ou d'une espace seulement : « Byron » reste « Byron ».
  for (let i = 0; i < 2; i++) s = s.replace(/^(?:(?:user|utilisateur|author|auteur|photo(?:graph(?:er)?)?|by|par)(?:\s*[:\-]\s*|\s+)|(?:©|\(c\))\s*)/i, '').trim();
  if (fauxAuteur(s)) return null;
  return s;
}

/** Les catégories de problème d'un fichier (CATEGORIES_STATUT), et les pays NoFoP. */
export function etatCategories(categories) {
  const noms = (categories ?? []).map((c) => String(c).replace(/^Category:/, ''));
  const statut = noms.filter((c) => CATEGORIES_STATUT.some((p) => c.startsWith(p)));
  const nofop = noms.map((c) => RE_NOFOP.exec(c)?.[1]).filter(Boolean);
  return { statut, nofop };
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
 * Verdict de la règle pour un fichier. info : { w, h, mime, meta, categories? } (meta :
 * les valeurs de extmetadata, en texte ; categories : ses catégories, cachées comprises),
 * ou null si Commons ne connaît pas le fichier. Rend { ok: true, licence, licence_url,
 * auteur, titre, page, nofop? } ou { ok: false, raison }. auteur null pour une photo du
 * domaine public ou CC0 sans auteur : la fiche affichera « Auteur inconnu » (lot P2).
 * Sans categories (le relevé R5 ne les avait pas), la règle ne peut pas les juger : les
 * scripts les demandent toujours.
 */
export function verdict(fichier, info) {
  if (!info) return { ok: false, raison: 'absent' };
  const m = info.meta ?? {};
  const g = (k) => texteBrut(m[k]);
  if (!FORMATS.includes(info.mime)) return { ok: false, raison: 'format' };
  if (!['', 'false'].includes(g('NonFree').toLowerCase())) return { ok: false, raison: 'non_libre' };
  const cats = etatCategories(info.categories);
  if (cats.statut.length) return { ok: false, raison: 'statut' };
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
  if (RE_ESPACE_NOM.some((r) => r.test(nom)) || RE_AUTEUR_ESPACE.test(texteBrut(m.Artist)) || RE_AUTEUR_ESPACE.test(texteBrut(m.Attribution)) || RE_AUTEUR_ESPACE.test(auteur ?? '')) return { ok: false, raison: 'espace' };
  if (RE_SUJET.test(nom) || RE_GUERRE.test(nom) || RE_AUTEUR_ARMEE.test(texteBrut(m.Artist)) || RE_AUTEUR_ARMEE.test(texteBrut(m.Attribution))) return { ok: false, raison: 'sujet' };
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
    ...(cats.nofop.length ? { nofop: cats.nofop.join(', ') } : {}),
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
