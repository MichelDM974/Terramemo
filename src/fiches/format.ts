// Nombres, listes, dates et heures des fiches des lieux (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.1, § 4.2 et § 6.5) : la
// langue en paramètre (décision « Langue » : les mots viennent de textes-fiche.fr.json,
// les chiffres d'Intl), espace insécable avant l'unité, comme fmtKm
// (src/vues/commun.ts). La barre donne trois chiffres au plus (« 123
// millions », « 56 800 ») ; la fiche, le nombre entier. L'heure d'un pays : sa
// zone IANA par Intl.DateTimeFormat, l'écart à l'heure de l'appareil calculé
// sur les deux heures murales (§ 2.1 ; timeZoneName: 'longOffset' écarté).
import { remplir } from '../vues/textes';
import { textesFiche } from '../vues/textes-fiche';

/** La locale des nombres et des listes, par langue des textes (le français seul pour l'instant). */
const LOCALES: Readonly<Record<string, string>> = { fr: 'fr-FR' };
const locale = (langue: string): string => LOCALES[langue] ?? langue;

/**
 * Les formateurs d'Intl, un par locale et par réglage, gardés : le premier créé charge ses données ICU
 * (Intl.ListFormat : 22 ms sur l'A37, à la première fiche, le 17/11), les suivants ne coûtent presque rien.
 * toLocaleString(locale, options) en recréait un à chaque nombre.
 */
type Formateur = Intl.NumberFormat | Intl.ListFormat | Intl.DateTimeFormat;
const formateurs = new Map<string, Formateur | null>();
/** Le formateur gardé sous `cle`, créé au premier appel ; null s'il ne se crée pas (une zone inconnue : RangeError), gardé aussi. */
function formateur<F extends Formateur>(cle: string, creer: () => F): F | null {
  if (!formateurs.has(cle)) {
    let f: F | null = null;
    try {
      f = creer();
    } catch {
      f = null;
    }
    formateurs.set(cle, f);
  }
  return formateurs.get(cle) as F | null;
}
const nombres = (loc: string, decimales?: number): Intl.NumberFormat =>
  formateur(`n:${loc}:${decimales ?? ''}`, () => new Intl.NumberFormat(loc, decimales === undefined ? undefined : { maximumFractionDigits: decimales }))!;
const listes = (loc: string): Intl.ListFormat | null => formateur(`l:${loc}`, () => new Intl.ListFormat(loc, { style: 'long', type: 'conjunction' }));

/** « 23 février » : jour et mois d'une date sans année, lus en UTC (aucune zone à charger). */
const joursMois = (loc: string): Intl.DateTimeFormat | null => formateur(`d:${loc}`, () => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' }));
/**
 * L'heure murale d'une zone IANA, en chiffres latins à lire par formatToParts (la locale n'y change rien
 * d'autre) ; null : zone inconnue du navigateur (RangeError à sa création, gardée : jamais recréée).
 */
const murale = (zone: string): Intl.DateTimeFormat | null =>
  formateur(`z:${zone}`, () => new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));

/**
 * Les formateurs créés d'avance, au repos après le premier toucher d'un lieu (explorer.ts) : la première
 * fiche ne paie pas leur création pendant sa montée (§ 6.4).
 */
export function prechaufferFormats(langue = 'fr'): void {
  const loc = locale(langue);
  nombres(loc);
  nombres(loc, 2);
  listes(loc);
  joursMois(loc);
}

/** Le formateur de la zone d'un pays créé d'avance (au repos, le pays touché dans la barre) : sa fiche n'en crée aucun. */
export function prechaufferZone(zone: string): void {
  murale(zone);
}

/** Tests : le nombre de formateurs créés (une ouverture de fiche n'en ajoute aucun). */
export const nombreFormateurs = (): number => formateurs.size;

/** Le nombre entier, groupé par milliers (« 123 366 734 »). */
export const fmtEntier = (n: number, langue = 'fr'): string => nombres(locale(langue)).format(Math.round(n));

/** Arrondi à trois chiffres significatifs (56 789 → 56 800 ; 5 412 345 → 5 410 000). */
export function troisChiffres(n: number): number {
  if (n === 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 2);
  return p >= 1 ? Math.round(n / p) * p : Math.round(n);
}

/**
 * Trois chiffres au plus : « 836 », « 56 800 », « 5,41 millions », « 68,7
 * millions », « 123 millions », « 1,42 milliard ». Le pluriel du mot à partir
 * de 2 (« 1,5 million »).
 */
export function fmtNombreCourt(n: number, langue = 'fr'): string {
  const T = textesFiche.nombres;
  const r = troisChiffres(n);
  const loc = locale(langue);
  const mot = (x: number, un: string, plusieurs: string) => remplir(x >= 2 ? plusieurs : un, { n: nombres(loc, 2).format(x) });
  // r a déjà ses trois chiffres : deux décimales au plus suffisent à les dire tous.
  if (Math.abs(r) >= 1e9) return mot(r / 1e9, T.milliard, T.milliards);
  if (Math.abs(r) >= 1e6) return mot(r / 1e6, T.million, T.millions);
  return nombres(loc).format(r);
}

/** Une liste lue : « La Paz et Sucre », « A, B et C » (Intl.ListFormat ; à défaut, des virgules). */
export function listeEt(elements: readonly string[], langue = 'fr'): string {
  const f = listes(locale(langue));
  return f ? f.format(elements) : elements.join(', ');
}

/** « 123 366 734 (2025) » : les habitants de la fiche, avec leur année. */
export const fmtHabitants = (n: number, annee: number, langue = 'fr'): string => remplir(textesFiche.habitants_valeur, { n: fmtEntier(n, langue), annee });

/** « 85 038 (recensement de 2023) » : les habitants d'une commune (lot F5), avec l'année de leur recensement. */
export const fmtHabitantsRecensement = (n: number, annee: number, langue = 'fr'): string =>
  remplir(textesFiche.habitants_recensement, { n: fmtEntier(n, langue), annee });

/** La barre : « 123 millions d'hab. », « 56 800 hab. » (trois chiffres au plus, fmtNombreCourt). */
export function fmtHabitantsCourt(n: number, langue = 'fr'): string {
  const T = textesFiche;
  return remplir(Math.abs(troisChiffres(n)) >= 1e6 ? T.barre_habitants_mot : T.barre_habitants, { n: fmtNombreCourt(n, langue) });
}

/** « 377 974 km² » ; le centième sous 100 km² (« 0,44 km² », le Vatican). */
export const fmtSuperficie = (km2: number, langue = 'fr'): string => remplir(textesFiche.km2, { n: nombres(locale(langue), 2).format(km2) });

/**
 * Une superficie de mer (lot F4), déjà à trois chiffres : « 2,5 millions de km² », « 139 000 km² » (la barre) ;
 * `environ` : « environ 2,5 millions de km² » (la fiche : la source n'est pas plus précise, § 2.3).
 */
export function fmtSuperficieMer(km2: number, environ: boolean, langue = 'fr'): string {
  const T = textesFiche;
  const mot = Math.abs(troisChiffres(km2)) >= 1e6;
  const modele = environ ? (mot ? T.km2_environ_mot : T.km2_environ) : mot ? T.km2_court_mot : T.km2;
  return remplir(modele, { n: fmtNombreCourt(km2, langue) });
}

/** « 5 267 m », « 14,5 m » : une profondeur de mer, au dixième s'il y en a un (la mer d'Azov). */
export const fmtProfondeur = (m: number, langue = 'fr'): string => remplir(textesFiche.profondeur_valeur, { n: nombres(locale(langue), 1).format(m) });

/** « 3 776 m » groupé par milliers, dans « mont Fuji, 3 776 m ». */
export const fmtAltitude = (m: number, langue = 'fr'): string => fmtEntier(m, langue);

/** « 23 février », « 1er août » (le premier du mois : premier_jour). */
export function fmtJourMois(jour: number, mois: number, langue = 'fr'): string {
  const f = joursMois(locale(langue));
  const date = new Date(Date.UTC(2000, mois - 1, jour)); // 2000 : bissextile, le 29 février existe.
  if (!f) return `${jour}/${mois}`;
  return f
    .formatToParts(date)
    .map((p) => (p.type === 'day' && jour === 1 ? textesFiche.premier_jour : p.value))
    .join('');
}

/** Minutes depuis l'époque de l'heure murale lue par `f` à l'instant `t`. */
function minutesMurales(f: Intl.DateTimeFormat, t: Date): number {
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(t)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!) / 60_000;
}

/**
 * L'heure dans la zone `zone` à l'instant `t`, et son écart en minutes à
 * l'heure d'ici : la zone `ici` (les tests), sinon celle de l'appareil. Lève
 * une RangeError si le navigateur ne connaît pas la zone (la ligne est alors
 * retirée, § 4.2).
 */
export function heureDe(zone: string, t: Date, ici?: string): { heures: number; minutes: number; ecart: number } {
  const f = murale(zone);
  if (!f) throw new RangeError(`zone inconnue : ${zone}`);
  const la = minutesMurales(f, t);
  let ci: number;
  if (ici) {
    const g = murale(ici);
    if (!g) throw new RangeError(`zone inconnue : ${ici}`);
    ci = minutesMurales(g, t);
  } else ci = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes()) / 60_000;
  const jour = ((la % 1440) + 1440) % 1440;
  return { heures: Math.floor(jour / 60), minutes: jour % 60, ecart: la - ci };
}

/** « +5 h », « −3 h », « +1 h 45 », « même heure qu'ici » (le signe moins typographique, moins). */
export function fmtEcart(minutes: number): string {
  const T = textesFiche;
  if (minutes === 0) return T.meme_heure;
  const a = Math.abs(minutes);
  const signe = minutes > 0 ? T.plus : T.moins;
  const min = a % 60;
  const h = Math.floor(a / 60);
  // Moins d'une heure (l'Iran depuis La Réunion) : « −30 min », pas « −0 h 30 ».
  if (!h) return remplir(T.ecart_minutes, { signe, min });
  return remplir(min ? T.ecart_min : T.ecart, { signe, h, min: String(min).padStart(2, '0') });
}

/**
 * La valeur de la ligne « Heure à … » : « 16 h 20 · +5 h », puis « 5 fuseaux
 * dans le pays » s'il y en a plusieurs. Lève comme heureDe.
 */
export function fmtHeureLieu(zone: string, fuseaux: number, t: Date, ici?: string): string {
  const T = textesFiche;
  const h = heureDe(zone, t, ici);
  const parts = [remplir(T.heure_valeur, { h: h.heures, min: String(h.minutes).padStart(2, '0') }), fmtEcart(h.ecart)];
  if (fuseaux > 1) parts.push(remplir(T.fuseaux, { n: fuseaux }));
  return parts.join(' · ');
}

/** « umbundu 29 % » : une langue parlée et sa part. */
export const fmtPart = (langue: string, part: number, l = 'fr'): string => remplir(textesFiche.langue_part, { langue, part: fmtEntier(part, l) });
