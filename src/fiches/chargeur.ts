// Le chargeur des fiches des lieux (#34, étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 6.1 et § 19), au morceau principal : les fichiers de chaque terrain lus une fois, au premier
// toucher qui les demande, jamais au premier affichage (le smoke du pilote le vérifie) ; une
// promesse gardée, un échec (hors ligne) qui ne reste pas en cache, relancé au toucher suivant,
// sur le modèle des capitales (src/map/capitales.ts).
//
// La lecture des fichiers (src/fiches/donnees.ts) part avec le morceau de la fiche
// (src/vues/fiche.ts, qui la réexporte), pour alléger le morceau principal : chaque chargement
// demande ses fichiers et ce morceau ensemble, en parallèle, puis les lit par lui. La ligne de faits
// de la barre n'attend donc pas un aller-retour de plus : le morceau part avec les données (§ 6.1).
// - le monde : fiches-monde.json et fiches-monde.fr.json, au premier toucher d'un lieu du monde ;
// - les drapeaux des territoires (lot F3) : à la première fiche de territoire ouverte, à part de
//   ceux des pays (drapeaux.json), que les exercices lisent ;
// - les mers (lot F4) : fiches-mers.json et fiches-mers.fr.json, au premier toucher en mer, avec
//   la couche légère ;
// - les communes (lot F5) : reunion/fiches.json (geodata/reunion.mjs) et fiches.fr.json
//   (geodata/fiches.mjs), au premier toucher sur l'île : qui ne touche que des pays ne les paie pas.
import type * as Donnees from './donnees';
import type { DonneesFichesCommunes, DonneesFichesMers, DonneesFichesMonde, DrapeauxTerritoires } from './donnees';

/** Lit un fichier JSON servi ; « <fichier> : HTTP xxx » levé comme les autres chargements. */
export type Lecteur = (chemin: string) => Promise<unknown>;

/** Ce que le chargeur prend du morceau de la fiche : la lecture des fichiers. */
export type Lectures = Pick<typeof Donnees, 'lireFichesMonde' | 'lireFichesMers' | 'lireFichesCommunes' | 'lireDrapeauxTerritoires'>;
/** Le morceau qui porte la lecture (les tests peuvent passer le leur). */
export type Morceau = () => Promise<Lectures>;

const lireHttp: Lecteur = async (chemin) => {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error(`${chemin.split('/').pop()} : HTTP ${r.status}`);
  return r.json();
};

/** Le morceau de la fiche, le même que celui de la feuille (explorer.ts, OptionsFiche.module). */
const morceauFiche: Morceau = () => import('../vues/fiche');

/** Un chargement lu une fois : la valeur gardée, la promesse en cours partagée, un échec oublié. */
function garde<T>() {
  let lu: T | null = null;
  let enCours: Promise<T> | null = null;
  return {
    charger(f: () => Promise<T>): Promise<T> {
      if (lu) return Promise.resolve(lu);
      if (!enCours) {
        const p = f().then((v) => (lu = v));
        enCours = p;
        p.then(
          () => (enCours = null),
          () => (enCours = null),
        );
      }
      return enCours;
    },
    deja: (): T | null => lu,
    oublier(): void {
      lu = null;
      enCours = null;
    },
  };
}

const monde = garde<DonneesFichesMonde>();
/** Les fiches du monde, lues une fois. `lire`, `morceau` : les tests. */
export function chargerFichesMonde(lire: Lecteur = lireHttp, base = '/geo/', morceau: Morceau = morceauFiche): Promise<DonneesFichesMonde> {
  return monde.charger(() =>
    Promise.all([morceau(), lire(`${base}fiches-monde.json`), lire(`${base}fiches-monde.fr.json`)]).then(([m, a, b]) =>
      m.lireFichesMonde(a as Donnees.FichierMonde, b as Donnees.FichierMondeLangue),
    ),
  );
}
/** Les fiches du monde si elles sont déjà lues (sans réseau), null sinon. */
export const fichesMondeChargees = monde.deja;
/** Tests : oublie ce qui a été lu (le prochain chargement relit). */
export const oublierFichesMonde = monde.oublier;

const drapeauxT = garde<DrapeauxTerritoires>();
/** Les drapeaux des territoires (lot F3), lus à la première fiche de territoire ouverte (§ 6.1), jamais avant. */
export function chargerDrapeauxTerritoires(lire: Lecteur = lireHttp, base = '/geo/', morceau: Morceau = morceauFiche): Promise<DrapeauxTerritoires> {
  return drapeauxT.charger(() =>
    Promise.all([morceau(), lire(`${base}drapeaux-territoires.json`)]).then(([m, d]) => m.lireDrapeauxTerritoires(d as Donnees.ManifesteDrapeauxTerritoires, base)),
  );
}
/** Tests : oublie les drapeaux des territoires lus. */
export const oublierDrapeauxTerritoires = drapeauxT.oublier;

const mers = garde<DonneesFichesMers>();
/** Les fiches des mers (lot F4), lues une fois, au premier toucher en mer (avec la couche légère, § 6.1). */
export function chargerFichesMers(lire: Lecteur = lireHttp, base = '/geo/', morceau: Morceau = morceauFiche): Promise<DonneesFichesMers> {
  return mers.charger(() =>
    Promise.all([morceau(), lire(`${base}fiches-mers.json`), lire(`${base}fiches-mers.fr.json`)]).then(([m, a, b]) =>
      m.lireFichesMers(a as Donnees.FichierMers, b as Donnees.FichierMersLangue),
    ),
  );
}
/** Les fiches des mers si elles sont déjà lues (sans réseau), null sinon. */
export const fichesMersChargees = mers.deja;
/** Tests : oublie les fiches des mers lues. */
export const oublierFichesMers = mers.oublier;

const communes = garde<DonneesFichesCommunes>();
/** Les fiches des communes de La Réunion (lot F5), lues une fois, au premier toucher sur l'île (§ 6.1). */
export function chargerFichesCommunes(lire: Lecteur = lireHttp, base = '/geo/reunion/', morceau: Morceau = morceauFiche): Promise<DonneesFichesCommunes> {
  return communes.charger(() =>
    Promise.all([morceau(), lire(`${base}fiches.json`), lire(`${base}fiches.fr.json`)]).then(([m, a, b]) =>
      m.lireFichesCommunes(a as Donnees.FichierCommunes, b as Donnees.FichierCommunesLangue),
    ),
  );
}
/** Les fiches des communes si elles sont déjà lues (sans réseau), null sinon. */
export const fichesCommunesChargees = communes.deja;
/** Tests : oublie les fiches des communes lues. */
export const oublierFichesCommunes = communes.oublier;
