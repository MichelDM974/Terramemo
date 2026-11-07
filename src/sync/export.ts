// Export des données (J1b, lot 5 ; étude docs/etudes/2026-11-07-j1b-conception.md,
// § 7.2, D26 a) : un fichier JSON, `terramemo-{AAAA-MM-JJ}.json`, droit
// d'accès et de portabilité de la politique de confidentialité. Sur le site
// seulement au J1b : dans l'APK, <a download> n'est pas fiable dans la
// WebView, et la vue Compte renvoie au site (le compte y a tout en ligne).
// Un invité exporte aussi son journal, sans « compte ».
//
// Format (v 1) : {format, v, exporte_le, compte?, profil, evenements,
// a_relire, records, pseudo}. Les événements y sont entiers, tels que le
// journal les garde (pas l'encodage compact des lots), et `a_relire` contient
// les lots bruts qu'une version de l'appli ne sait pas encore lire.
// Pur, sans Firebase : les comptes donnent `compte` et `profil`, main.ts le
// journal, les lots à relire et l'appareil.
import type { Evenement } from '../srs/journal';
import type { FicheARelire } from './depot-lots';
import type { Fournisseur } from './session';

export const FORMAT_EXPORT = 'terramemo-export';
export const V_EXPORT = 1;
/** Ce que dit la vue Compte dans l'APK, à la place du bouton (D26 a). */
export const SITE_EXPORT = 'terramemo-geo.web.app';

/** Le compte de la session : celui qui est connecté, ou le dernier (session perdue, `cree_le` alors inconnu). */
export interface CompteExport {
  uid: string;
  adresse: string | null;
  fournisseurs: Fournisseur[];
  /** Date de création du compte (ISO 8601), ou null si l'appareil ne la connaît pas. */
  cree_le: string | null;
}

/** Le profil en ligne du compte (`joueurs/{uid}`, § 5.4) : son pseudo et ses records ; null s'il n'a pas pu être lu. */
export interface ProfilExport {
  pseudo: string | null;
  records: Record<string, unknown>;
}

/** Un lot lu en ligne que cette version ne sait pas lire : son id, l'heure du serveur (ISO), ses champs bruts. */
export interface LotARelireExport {
  id: string;
  fin: string;
  doc: Record<string, unknown>;
}

export interface ExportTerramemo {
  format: typeof FORMAT_EXPORT;
  v: typeof V_EXPORT;
  exporte_le: string;
  /** Absent pour un invité. */
  compte?: CompteExport;
  profil: ProfilExport | null;
  evenements: Evenement[];
  a_relire: LotARelireExport[];
  /** Les records de l'appareil (clé d'épreuve → record). */
  records: Record<string, unknown>;
  /** Le pseudo de l'appareil. */
  pseudo: string | null;
}

export interface DonneesExport {
  maintenant: Date;
  compte: CompteExport | null;
  profil: ProfilExport | null;
  evenements: readonly Evenement[];
  aRelire: readonly FicheARelire[];
  records: Record<string, unknown>;
  pseudo: string | null;
}

/** L'export, prêt pour JSON.stringify (copies : rien ne reste lié au journal de la page). */
export function composerExport(d: DonneesExport): ExportTerramemo {
  return {
    format: FORMAT_EXPORT,
    v: V_EXPORT,
    exporte_le: d.maintenant.toISOString(),
    ...(d.compte ? { compte: structuredClone(d.compte) } : {}),
    profil: d.profil ? structuredClone(d.profil) : null,
    evenements: d.evenements.map((e) => structuredClone(e)),
    a_relire: d.aRelire.map((f) => ({ id: f.id, fin: new Date(f.fin).toISOString(), doc: structuredClone(f.doc) })),
    records: structuredClone(d.records),
    pseudo: d.pseudo,
  };
}

/** `terramemo-2026-11-07.json` : la date du jour de l'appareil. */
export function nomExport(maintenant: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `terramemo-${maintenant.getFullYear()}-${deux(maintenant.getMonth() + 1)}-${deux(maintenant.getDate())}.json`;
}

/** Le texte du fichier : JSON lisible (indenté), fin de ligne comprise. */
export function texteExport(x: ExportTerramemo): string {
  return `${JSON.stringify(x, null, 2)}\n`;
}

/**
 * Le fichier proposé au navigateur (site) : Blob et <a download>. L'adresse
 * du Blob est libérée un peu plus tard, une fois le téléchargement parti.
 */
export function telecharger(nom: string, contenu: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = nom;
  a.rel = 'noopener';
  a.hidden = true;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
