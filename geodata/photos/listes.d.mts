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
  titre: string;
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
export function dresserListes(choix: unknown, licences: unknown): { listes: Record<string, ListePhotos>; credits: { v: 1; photos: CreditPhoto[] }; manquantes: { id: string; fichier: string }[] };
export function fichiersDuSite(donnees?: DonneesPhotos): { fileName: string; source: string }[];
export function webpAttendus(licences: unknown): { fichier: string; taille: 'v' | 'p'; nom: string; sha256: string }[];
