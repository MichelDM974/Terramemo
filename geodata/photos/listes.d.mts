// Types de geodata/photos/listes.mjs (lu par vite.config.ts et les tests).
export interface PhotoListe {
  v: string;
  p: string;
  alt: Record<string, string>;
  auteur: string | null;
  licence: string;
  licence_url: string | null;
  page: string;
}
export interface ListePhotos {
  v: 1;
  photos: PhotoListe[];
}
export interface CreditPhoto {
  /** Le lieu, puis ce que montre la photo (« Japon · Préfecture de Kyoto »). */
  tete: string;
  /** Le titre de Commons, ou null. */
  titre: string | null;
  auteur: string | null;
  licence: string;
  licence_url: string | null;
  page: string;
}
export interface DonneesPhotos {
  choix: { v: number; lieux: Record<string, unknown> };
  licences: { v: number; photos: Record<string, Record<string, unknown>> };
}
export const DOSSIER: string;
export const LONGUEUR_NOM: number;
export const NOM: RegExp;
export const DOSSIER_SITE: string;
export const LANGUE: string;
export function dossierDonnees(env?: Record<string, string | undefined>): string;
export function lireDonnees(dossier?: string): DonneesPhotos;
export function gardeesRelues(choix: unknown): [string, Record<string, unknown>][];
export function dresserListes(choix: unknown, licences: unknown, noms?: Readonly<Record<string, string>>): { listes: Record<string, ListePhotos>; credits: { v: 1; photos: CreditPhoto[] }; manquantes: { id: string; fichier: string }[] };
export function lieuxConnus(): string[];
export function nomsLieux(): Record<string, string>;
export function teteCredit(vues: readonly { nom: string; sujet: string }[]): string;
export function fichiersDuSite(donnees?: DonneesPhotos, ids?: readonly string[], noms?: Readonly<Record<string, string>>): { fileName: string; source: string }[];
export function webpAttendus(licences: unknown): { fichier: string; taille: 'v' | 'p'; nom: string; sha256: string }[];
export function lieuxIllustres(donnees?: DonneesPhotos): string[];
export function fautesDonnees(donnees?: DonneesPhotos): string[];
