// Service des terrains (DOM) : le monde, chargé au démarrage par main.ts, et
// les terrains locaux (l'île de La Réunion), chargés et rendus au premier
// choix de leur série. Chaque terrain a son hôte posé sur #app, le même
// rectangle ; un seul est visible à la fois. ctx.carte et ctx.donnees des vues
// restent le monde (explorer, saisie, pilote de mesure) : seules les vues qui
// connaissent les terrains (Toucher, Chrono) passent par ce service.
import { Carte, type CarteAffichee, type OptionsCarte } from './map/carte';
import type { DonneesCarte } from './map/donnees';
import { chargerTerrain, dateCredit, type SourcesTerrain } from './map/donnees-terrain';
import { prechauffer } from './map/geo';
import { cadreLocal, REUNION, type DefTerrain } from './map/terrain';
import type { Lieu, NomTerrain } from './map/types';
import { remplir, textes } from './vues/textes';

export interface Terrain {
  nom: NomTerrain;
  carte: CarteAffichee;
  donnees: DonneesCarte<Lieu>;
  /** Ids jouables (séries, leurres de Nommer), dans l'ordre des données. */
  jouables: readonly string[];
  /** Mention de la source affichée sur la carte ; null pour le monde (⚙). */
  credit: string | null;
}

export interface Terrains {
  readonly monde: Terrain;
  readonly actif: NomTerrain;
  /** Le terrain, chargé et rendu une fois (promesse gardée ; un échec ne reste pas en cache). */
  charger(nom: NomTerrain): Promise<Terrain>;
  /** Montre ce terrain, cache les autres (classe .carte-cachee, body[data-terrain]) ; sans effet s'il n'est pas chargé. */
  montrer(nom: NomTerrain): void;
  /** Le terrain s'il est déjà chargé (sans réseau). */
  deja(nom: NomTerrain): Terrain | null;
}

/** Les terrains locaux connus, par nom, et le suffixe de leur hôte (#carte-ile, .carte-ile). */
const DEFS: Record<Exclude<NomTerrain, 'monde'>, { def: DefTerrain; hote: string }> = { reunion: { def: REUNION, hote: 'ile' } };

/** Les ids des zones au statut « jouable », dans l'ordre des données. */
export function idsJouables(d: DonneesCarte<Lieu>): string[] {
  return d.entites.filter((e) => e.pays.statut === 'jouable').map((e) => e.pays.id);
}

export function creerTerrains(o: {
  monde: Terrain;
  hoteMonde: HTMLElement;
  surToucher: OptionsCarte['surToucher'];
  /** Appelé une fois par terrain local chargé (main.ts : window.terramemo.ile). */
  surCharge?: (t: Terrain) => void;
}): Terrains {
  const charges = new Map<NomTerrain, Terrain>([['monde', o.monde]]);
  const enCours = new Map<NomTerrain, Promise<Terrain>>();
  let actif: NomTerrain = 'monde';
  document.body.dataset.terrain = actif;

  async function chargerLocal(nom: Exclude<NomTerrain, 'monde'>): Promise<Terrain> {
    const { def, hote: suffixe } = DEFS[nom];
    const { donnees, sources } = await chargerTerrain(def);
    const hote = document.createElement('div');
    hote.id = `carte-${suffixe}`;
    hote.className = `carte carte-${suffixe} carte-cachee`;
    // Juste après #carte : avant les barres des vues dans le DOM (ajoutées
    // après #carte), donc dessous. Caché par visibility (pas display) : l'hôte
    // a déjà sa taille quand rendre() la lit (sinon celle de la fenêtre).
    o.hoteMonde.after(hote);
    try {
      return creerLocal(def, hote, donnees, sources);
    } catch (e) {
      hote.remove(); // un nouvel essai repart d'un hôte neuf
      throw e;
    }
  }

  function creerLocal(def: DefTerrain, hote: HTMLElement, donnees: DonneesCarte<Lieu>, sources: SourcesTerrain): Terrain {
    const emprise = { type: 'FeatureCollection' as const, features: donnees.entites.map((e) => e.forme) };
    const T = textes.terrains[def.nom];
    // Toujours en rendu « g » : 24 communes, quelques milliers de sommets, pas
    // de rotation ; sans gestes : les mesures restent celles du monde.
    const carte = new Carte({
      hote,
      donnees,
      projection: 'monde', // ignorée avec un cadre
      rendu: 'g',
      cadre: cadreLocal(def, emprise, T.libelle),
      surToucher: o.surToucher,
    });
    carte.rendre();
    prechauffer(donnees.entites.map((e) => e.forme));
    const date = dateCredit(sources);
    const credit = date ? remplir(textes.credits.carte, { date }) : null;
    if (credit) {
      const mention = document.createElement('div');
      mention.className = 'carte-credit';
      mention.textContent = credit;
      hote.append(mention);
    }
    const t: Terrain = { nom: def.nom, carte, donnees, jouables: idsJouables(donnees), credit };
    charges.set(def.nom, t);
    o.surCharge?.(t);
    return t;
  }

  const montrer = (nom: NomTerrain): void => {
    if (!charges.has(nom)) return;
    actif = nom;
    for (const t of charges.values()) t.carte.hote.classList.toggle('carte-cachee', t.nom !== nom);
    document.body.dataset.terrain = nom;
  };

  return {
    monde: o.monde,
    get actif() {
      return actif;
    },
    charger(nom) {
      const deja = charges.get(nom);
      if (deja) return Promise.resolve(deja);
      let p = enCours.get(nom);
      if (!p) {
        p = chargerLocal(nom as Exclude<NomTerrain, 'monde'>);
        enCours.set(nom, p);
        // Une fois chargé, il est dans charges ; un échec (hors ligne) se retente au prochain choix.
        p.then(
          () => enCours.delete(nom),
          () => enCours.delete(nom),
        );
      }
      return p;
    },
    montrer,
    deja: (nom) => charges.get(nom) ?? null,
  };
}
