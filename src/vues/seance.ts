// La séance vue de l'appli (étude J1a § 4 et 6) : le lien entre la mémoire de
// l'appareil (src/journal/memoire.ts), le séquenceur pur (src/srs/seance.ts)
// et Toucher (essai.ts, qui pose les questions). Ici : le programme du jour
// (Révision du jour, ou Apprendre sur une série : une grappe par jour et par
// domaine, révisions dues d'abord), le cadrage d'une grappe en
// emprise de carte, la ligne discrète après une réponse, le bilan (sans
// points : « Points et classement »), les comptes de la ligne de Jouer, et
// le journal des parties libres (D11 : mode 'libre', hors FSRS). Les
// communes de La Réunion (défaut D6) : Apprendre sous La Réunion (4 grappes
// de 6), leur propre budget d'une grappe par jour (décision « Apprendre et
// Révision du jour » : une de pays et une de communes le même jour), et leurs
// révisions en second bloc de la Révision du jour, sur l'île, avant la
// grappe de pays nouveaux.
import type { DonneesCarte } from '../map/donnees';
import { empriseGrappe, type Emprise } from '../map/geo';
import type { Lieu, NomTerrain } from '../map/types';
import type { Memoire } from '../journal/memoire';
import { former, type Domaine } from '../srs/fiches';
import { grappesCommunes, grappesPays, type Grappe } from '../srs/grappes';
import { dues, entreesDuJour, grappeEntamee, introductions, programme, revisionsPermises, type Programme } from '../srs/planif';
import { evenementReponse, Seance, type BilanSeance, type PlanSeance } from '../srs/seance';
import type { Terrain } from '../terrains';
import type { Lancement } from './arbre';
import { nomSerie, SERIE_TOUS } from './cibles';
import { creer, croix, fmtKm, nomDe } from './commun';
import type { DemandeSeance, FabriqueSeances, PiloteSeance, RefusSeance, ReponseJouee } from './essai';
import { remplir, textes } from './textes';

const S = textes.seance;

/** Ce que la ligne « Révision du jour » de Jouer affiche à droite. */
export interface ComptesSeance {
  /** Fiches dues aujourd'hui (dans le plafond du jour) et fiches nommer à introduire. */
  aRevoir: number;
  /** Pays nouveaux que la prochaine séance apprendrait (la grappe suivante, si le budget le permet). */
  nouveaux: number;
}

/** « 12 à revoir · 6 nouveaux », « À jour ». */
export function texteComptes(c: ComptesSeance): string {
  const parts = [c.aRevoir ? remplir(S.a_revoir, { n: c.aRevoir }) : '', c.nouveaux ? remplir(S.nouveaux, { n: c.nouveaux }) : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : S.a_jour;
}

export interface Seances extends FabriqueSeances {
  /** Les comptes de cette demande aujourd'hui ; null tant que la mémoire n'est pas chargée. */
  comptes(d?: DemandeSeance): ComptesSeance | null;
  /** Une grappe de communes commencée ce jour, l'île pas chargée : la charger pour savoir si elle est finie (main.ts, puis rafraîchir Jouer). */
  ileIncertaine(): boolean;
  /** Le journal d'une partie libre (Trouver, Reconnaître hors séance : D11). */
  libre(l: Lancement | null, t: Terrain): ((r: ReponseJouee) => void) | null;
}

export interface OptionsSeances {
  memoire: Memoire;
  /** Les données du monde : grappes, emprises, noms. */
  monde: DonneesCarte;
  /**
   * Les données de l'île si elle est chargée, null sinon : grappes, emprises
   * et noms des communes (Apprendre sous La Réunion, bloc des communes de la
   * Révision du jour). Toucher la charge avant d'ouvrir une séance qui en a
   * besoin (besoinIle).
   */
  ile?: () => DonneesCarte<Lieu> | null;
  /** Hasard du mélange (tests : une graine). */
  hasard?: () => number;
}

/** Ce qu'une séance sait d'un domaine : son terrain, ses données, ses grappes. */
interface InfoDomaine {
  domaine: Domaine;
  terrain: NomTerrain;
  donnees: DonneesCarte<Lieu>;
  toutes: Grappe[];
  /** L'emprise à cadrer au rappel d'une grappe (geo.ts empriseGrappe : les géants réduits à leur bord proche). */
  emprise(ids: readonly string[]): Emprise | null;
}

function infoDomaine(domaine: Domaine, terrain: NomTerrain, donnees: DonneesCarte<Lieu>, toutes: Grappe[]): InfoDomaine {
  const entites = new Map(donnees.entites.map((e) => [e.pays.id, e]));
  return { domaine, terrain, donnees, toutes, emprise: (ids) => empriseGrappe(ids.flatMap((id) => entites.get(id) ?? [])) };
}

/** Un bloc de la séance : un domaine, son programme et le séquenceur qui le pose. */
interface Bloc {
  info: InfoDomaine;
  plan: Omit<PlanSeance, 'domaine'>;
  /** Pourquoi il n'y a pas de grappe nouvelle, et la grappe entamée ailleurs (refus d'Apprendre). */
  p: Programme;
}

export function creerSeances(o: OptionsSeances): Seances {
  const m = o.memoire;
  const hasard = o.hasard ?? Math.random;
  const pays = infoDomaine('pays', 'monde', o.monde, grappesPays(o.monde.entites.map((e) => e.pays)));
  /** Les communes, une fois l'île chargée (grappes calculées une fois par chargement). */
  let communes: InfoDomaine | null = null;
  const infoCommunes = (): InfoDomaine | null => {
    const d = o.ile?.() ?? null;
    if (!d) return null;
    if (communes?.donnees !== d) communes = infoDomaine('communes', 'reunion', d, grappesCommunes(d.entites.map((e) => e.pays)));
    return communes;
  };
  /** Le programme d'un domaine : ses grappes (celles d'une série pour Apprendre), son budget, les révisions déjà prises dans la séance. */
  function bloc(info: InfoDomaine, grappes: readonly Grappe[], prises = 0): Bloc {
    const p = programme(m.etat(), m.jour(), grappes, info.domaine, info.toutes, { prises });
    return { info, p, plan: { revisions: p.revisions, introductions: p.introductions, nouveaux: p.nouveautes?.ids ?? [] } };
  }

  /**
   * Les blocs d'une demande. Apprendre : le domaine de la série (un
   * continent, ou l'île), ses révisions dues puis sa grappe suivante. La
   * Révision du jour : les pays (révisions, fiches nommer), puis les
   * communes en second bloc (défaut D6 : leurs révisions, leurs fiches
   * nommer, et la grappe de communes commencée ce jour s'il en reste), l'île
   * seulement si elle est chargée, puis la grappe de pays suivante en
   * troisième bloc, de retour sur le monde, et seulement si aucune révision
   * de communes ne reste après la séance (décision « Apprendre et Révision
   * du jour » : les révisions dues d'abord, partout ; quitter la séance
   * après les pays laisse la grappe pour plus tard, pas les communes dues).
   */
  function blocs(d: DemandeSeance): Bloc[] | null {
    if (d.sorte === 'apprendre') {
      const info = d.serie.terrain === 'monde' ? pays : infoCommunes();
      if (!info) return null;
      const grappes = info === pays && d.serie.id !== SERIE_TOUS ? pays.toutes.filter((g) => g.continent === d.serie.id) : info.toutes;
      return [bloc(info, grappes)];
    }
    const bp = bloc(pays, pays.toutes);
    const c = infoCommunes();
    if (!c) return [bp];
    const bc = bloc(c, c.toutes, bp.plan.revisions.length);
    // Les nouveautés des communes : seulement la grappe commencée ce jour (Apprendre sous La Réunion en ouvre une).
    const entamee = grappeEntamee(m.etat(), m.jour(), c.toutes, 'communes');
    if (!entamee || bc.p.nouveautes?.grappe !== entamee.grappe) bc.plan = { ...bc.plan, nouveaux: [] };
    const reviser = { ...bp, plan: { ...bp.plan, nouveaux: [] } };
    if (bc.p.restantes > 0 || !bp.plan.nouveaux.length) return [reviser, bc];
    // Les révisions dues d'abord, partout : la grappe de pays vient après le bloc des communes, dans un troisième bloc (sur le monde).
    return [reviser, bc, { ...bp, plan: { revisions: [], introductions: [], nouveaux: bp.plan.nouveaux } }];
  }

  /**
   * Une grappe de communes est commencée ce jour mais l'île n'est pas
   * chargée (page rouverte en pleine grappe) : sans ses grappes, on ne sait
   * pas si elle est finie ; les comptes de la ligne de Jouer (les communes à
   * finir) en dépendent.
   */
  function ileIncertaine(): boolean {
    return m.charge && !o.ile?.() && entreesDuJour(m.etat(), m.jour(), 'communes') > 0;
  }

  /** Une demande a-t-elle besoin de l'île (communes dues, grappe de communes commencée ce jour, Apprendre sous La Réunion) ? */
  function besoinIle(d: DemandeSeance): boolean {
    if (d.sorte === 'apprendre') return d.serie.terrain !== 'monde';
    const etat = m.etat();
    const j = m.jour();
    return m.charge && (dues(etat, j, 'communes').length > 0 || introductions(etat, j, 'communes').length > 0 || entreesDuJour(etat, j, 'communes') > 0);
  }

  function comptes(d: DemandeSeance = { sorte: 'revision' }): ComptesSeance | null {
    if (!m.charge) return null;
    const etat = m.etat();
    const j = m.jour();
    const domaines: Domaine[] = d.sorte === 'apprendre' ? [d.serie.terrain === 'monde' ? 'pays' : 'communes'] : ['pays', 'communes'];
    const aRevoir =
      Math.min(
        domaines.reduce((n, x) => n + dues(etat, j, x).length, 0),
        revisionsPermises(etat, j),
      ) + domaines.reduce((n, x) => n + introductions(etat, j, x).length, 0);
    return { aRevoir, nouveaux: (blocs(d) ?? []).reduce((n, b) => n + b.plan.nouveaux.length, 0) };
  }

  function ouvrir(d: DemandeSeance): PiloteSeance | RefusSeance {
    const bs = blocs(d);
    if (!bs) return { refus: textes.toucher.echec_terrain, reviser: 0 };
    const aFaire = bs.reduce((n, b) => n + b.plan.revisions.length + b.plan.introductions.length, 0);
    const nouveaux = bs.some((b) => b.plan.nouveaux.length);
    const p = bs[0]!.p;
    if (!nouveaux && (d.sorte === 'apprendre' ? p.sansNouveautes !== 'dues' : aFaire === 0)) {
      // Apprendre sur une autre série que la grappe de pays du jour, commencée et pas finie : la Révision du jour la reprend.
      // (Les communes n'ont qu'une série, La Réunion : leur grappe entamée s'y reprend toujours.)
      if (d.sorte === 'apprendre' && p.entamee) {
        return { refus: remplir(S.grappe_entamee, { serie: nomSerie(p.entamee.grappe.continent) }), reviser: aFaire, finir: p.entamee.ids.length };
      }
      const toutAppris = bs[0]!.info.domaine === 'pays' ? S.tout_appris : S.tout_appris_communes;
      const raison = p.sansNouveautes === 'plafond' ? S.plafond : d.sorte === 'revision' ? S.rien : p.sansNouveautes === 'tout_appris' ? toutAppris : S.grappe_faite;
      return { refus: raison, reviser: d.sorte === 'apprendre' ? aFaire : 0 };
    }
    const id = m.nouvelId();
    const ctx = { seance: id, appareil: m.appareil, horloge: m.horloge, nouvelId: () => m.nouvelId(), hasard };
    return pilote(
      bs.map((b) => ({ info: b.info, seance: new Seance({ domaine: b.info.domaine, ...b.plan }, ctx) })),
      d,
    );
  }

  /** La ligne discrète après une réponse notée : quand la fiche revient. */
  function ligneApres(fiche: string, correct: boolean, encore: boolean): string {
    if (!correct) return encore ? S.a_revoir_aujourdhui : '';
    const e = m.etat().get(fiche);
    if (!e) return '';
    const n = e.echeance_jour - m.jour();
    return n <= 1 ? S.revient_demain : remplir(S.revient, { n });
  }

  /** Les blocs d'une séance posés l'un après l'autre (les pays, les communes sur l'île, la grappe de pays) comme une seule séance. */
  function pilote(blocsSeance: { info: InfoDomaine; seance: Seance }[], d: DemandeSeance): PiloteSeance {
    /** Le bloc en cours : le premier qui n'est pas fini. */
    const courant = () => blocsSeance.find((b) => !b.seance.finie) ?? null;
    return {
      question() {
        const b = courant();
        const e = b?.seance.courante;
        if (!b || !e) return null;
        const c = e.cadrage;
        const cadrer = !c ? null : c.sorte === 'monde' ? ('monde' as const) : b.info.emprise(c.ids);
        return { id: e.id, forme: e.forme, cadrer, connu: e.etape === 'qcm' && e.passage === 1, terrain: b.info.terrain };
      },
      compte() {
        const b = courant();
        const avant = b ? blocsSeance.slice(0, blocsSeance.indexOf(b)).reduce((n, x) => n + x.seance.total, 0) : 0;
        const total = blocsSeance.reduce((n, x) => n + x.seance.total, 0);
        return `${avant + (b?.seance.numero ?? 0)} / ${total}`;
      },
      repondre(r) {
        const b = courant();
        const e = b?.seance.courante;
        if (!b || !e) return '';
        const evt = b.seance.repondre({ correct: r.correct, aide: r.aide, reponse: r.reponse, via: r.via, zoom: r.zoom, distance_km: r.distance_km, duree_ms: r.duree_ms });
        void m.ecrire([evt]);
        if (e.etape === 'qcm') return '';
        return ligneApres(e.fiche, r.correct && !r.aide, b.seance.reste(e.fiche));
      },
      connu: () => courant()?.seance.connu(),
      terminer: () => {
        for (const b of blocsSeance) b.seance.terminer();
        // Son bilan suit : la séance devient envoyable (§ 5.2).
        m.clore();
      },
      bilan(el, actions) {
        const bilans = blocsSeance.map((b) => ({ b: b.seance.bilan(), d: b.info.donnees }));
        const somme = (f: (x: BilanSeance) => number) => bilans.reduce((n, x) => n + f(x.b), 0);
        const revisions = { n: somme((x) => x.revisions.n), premiers: somme((x) => x.revisions.premiers) };
        const nouveaux = bilans.flatMap((x) => x.b.nouveaux.map((id) => nomDe(x.d, id)));
        const rates = bilans.flatMap((x) => x.b.rates.map((r) => ({ ...r, nom: nomDe(x.d, r.id) })));
        const lignes: HTMLElement[] = [croix(actions.carte), creer('h2', {}, d.sorte === 'apprendre' ? remplir(S.titre_apprendre, { serie: nomSerie(d.serie.id) }) : S.titre_revision)];
        if (!m.garde) lignes.push(creer('p', { class: 'hint seance-avis' }, S.non_garde));
        if (revisions.n) lignes.push(creer('p', { class: 'seance-resume' }, remplir(S.bilan_revisions, { premiers: revisions.premiers, n: revisions.n })));
        if (nouveaux.length) lignes.push(creer('p', { class: 'seance-resume' }, remplir(S.bilan_nouveaux, { noms: nouveaux.join(', ') })));
        if (!somme((x) => x.reponses)) lignes.push(creer('p', { class: 'hint' }, S.bilan_vide));
        if (rates.length)
          lignes.push(
            creer(
              'ul',
              { class: 'essai-rates' },
              ...rates.map((r) =>
                creer(
                  'li',
                  {},
                  r.fiche.endsWith(':nommer')
                    ? remplir(S.bilan_rate_nom, { pays: r.nom })
                    : r.distance_km != null
                      ? remplir(S.bilan_rate_km, { pays: r.nom, km: fmtKm(r.distance_km) })
                      : remplir(S.bilan_rate_trouver, { pays: r.nom }),
                ),
              ),
            ),
          );
        const reste = comptes(d);
        const encore = reste && (reste.aRevoir || reste.nouveaux);
        lignes.push(creer('p', { class: 'hint' }, encore && reste ? remplir(S.bilan_encore, { reste: texteComptes(reste) }) : S.bilan_fini));
        const boutons: HTMLElement[] = [];
        if (encore) {
          const c = creer('button', { type: 'button', id: 'seance-continuer' }, S.continuer);
          c.addEventListener('click', actions.continuer);
          boutons.push(c);
        }
        const carte = creer('button', { type: 'button', class: encore ? 'secondary' : '', id: 'seance-carte' }, S.carte);
        carte.addEventListener('click', actions.carte);
        boutons.push(carte);
        const autre = creer('button', { type: 'button', class: 'secondary', id: 'essai-autre' }, textes.toucher.autre_serie);
        autre.addEventListener('click', actions.autre);
        boutons.push(autre);
        el.replaceChildren(...lignes, creer('div', { class: 'essai-actions' }, ...boutons));
        el.dataset.seance = d.sorte;
      },
    };
  }

  function libre(_l: Lancement | null, t: Terrain): ((r: ReponseJouee) => void) | null {
    const domaine: Domaine = t.nom === 'monde' ? 'pays' : 'communes';
    const seance = m.nouvelId();
    return (r) => {
      let fiche: string;
      try {
        fiche = former(domaine, r.id, r.sens);
      } catch {
        return;
      }
      void m.ecrire([evenementReponse({ seance, appareil: m.appareil, horloge: m.horloge, nouvelId: () => m.nouvelId() }, fiche, 'libre', r, null)]);
    };
  }

  return { ouvrir, besoinIle, ileIncertaine, comptes, libre, clore: () => m.clore() };
}
