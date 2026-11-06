// La séance vue de l'appli (étude J1a § 4 et 6) : le lien entre la mémoire de
// l'appareil (src/journal/memoire.ts), le séquenceur pur (src/srs/seance.ts)
// et Toucher (essai.ts, qui pose les questions). Ici : le programme du jour
// (Révision du jour, ou Apprendre sur une série : un seul budget d'une
// grappe par jour, révisions dues d'abord), le cadrage d'une grappe en
// emprise de carte, la ligne discrète après une réponse, le bilan (sans
// points : « Points et classement »), les comptes de la ligne de Jouer, et
// le journal des parties libres (D11 : mode 'libre', hors FSRS).
import type { DonneesCarte } from '../map/donnees';
import { empriseGrappe, type Emprise } from '../map/geo';
import type { Memoire } from '../journal/memoire';
import { former, type Domaine } from '../srs/fiches';
import { grappesPays, type Grappe } from '../srs/grappes';
import { dues, introductions, programme, revisionsPermises, type Programme } from '../srs/planif';
import { evenementReponse, Seance } from '../srs/seance';
import type { Terrain } from '../terrains';
import type { Lancement } from './arbre';
import { nomSerie, SERIE_TOUS } from './cibles';
import { creer, fmtKm, nomDe } from './commun';
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
  /** Le journal d'une partie libre (Trouver, Reconnaître hors séance : D11). */
  libre(l: Lancement | null, t: Terrain): ((r: ReponseJouee) => void) | null;
}

export interface OptionsSeances {
  memoire: Memoire;
  /** Les données du monde : grappes, emprises, noms. */
  monde: DonneesCarte;
  /** Hasard du mélange (tests : une graine). */
  hasard?: () => number;
}

const DOMAINE: Domaine = 'pays';

export function creerSeances(o: OptionsSeances): Seances {
  const m = o.memoire;
  const hasard = o.hasard ?? Math.random;
  const toutes: Grappe[] = grappesPays(o.monde.entites.map((e) => e.pays));
  const entites = new Map(o.monde.entites.map((e) => [e.pays.id, e]));
  /** L'emprise à cadrer au rappel d'une grappe (geo.ts empriseGrappe : les géants réduits à leur bord proche). */
  const emprise = (ids: readonly string[]): Emprise | null => empriseGrappe(ids.flatMap((id) => entites.get(id) ?? []));

  /** Les grappes d'une demande : celles de la série d'Apprendre (son continent), toutes sinon. */
  const grappesDe = (d: DemandeSeance): Grappe[] =>
    d.sorte === 'apprendre' && d.serie.id !== SERIE_TOUS ? toutes.filter((g) => g.continent === d.serie.id) : toutes;

  const programmeDe = (d: DemandeSeance): Programme => programme(m.etat(), m.jour(), grappesDe(d), DOMAINE, toutes);

  function comptes(d: DemandeSeance = { sorte: 'revision' }): ComptesSeance | null {
    if (!m.charge) return null;
    const etat = m.etat();
    const j = m.jour();
    const p = programmeDe(d);
    return {
      aRevoir: Math.min(dues(etat, j, DOMAINE).length, revisionsPermises(etat, j)) + introductions(etat, j, DOMAINE).length,
      nouveaux: p.nouveautes?.ids.length ?? 0,
    };
  }

  function ouvrir(d: DemandeSeance): PiloteSeance | RefusSeance {
    const p = programmeDe(d);
    const aFaire = p.revisions.length + p.introductions.length;
    if (!p.nouveautes && (d.sorte === 'apprendre' ? p.sansNouveautes !== 'dues' : aFaire === 0)) {
      const raison = p.sansNouveautes === 'plafond' ? S.plafond : d.sorte === 'revision' ? S.rien : p.sansNouveautes === 'tout_appris' ? S.tout_appris : S.grappe_faite;
      return { refus: raison, reviser: d.sorte === 'apprendre' ? aFaire : 0 };
    }
    const seance = new Seance(
      { domaine: DOMAINE, revisions: p.revisions, introductions: p.introductions, nouveaux: p.nouveautes?.ids ?? [] },
      { seance: m.nouvelId(), appareil: m.appareil, horloge: m.horloge, nouvelId: () => m.nouvelId(), hasard },
    );
    return pilote(seance, d);
  }

  /** La ligne discrète après une réponse notée : quand la fiche revient. */
  function ligneApres(fiche: string, correct: boolean, encore: boolean): string {
    if (!correct) return encore ? S.a_revoir_aujourdhui : '';
    const e = m.etat().get(fiche);
    if (!e) return '';
    const n = e.echeance_jour - m.jour();
    return n <= 1 ? S.revient_demain : remplir(S.revient, { n });
  }

  function pilote(seance: Seance, d: DemandeSeance): PiloteSeance {
    return {
      question() {
        const e = seance.courante;
        if (!e) return null;
        const c = e.cadrage;
        const cadrer = !c ? null : c.sorte === 'monde' ? ('monde' as const) : emprise(c.ids);
        return { id: e.id, forme: e.forme, cadrer, connu: e.etape === 'qcm' && e.passage === 1 };
      },
      compte: () => `${seance.numero} / ${seance.total}`,
      repondre(r) {
        const e = seance.courante;
        if (!e) return '';
        const evt = seance.repondre({ correct: r.correct, aide: r.aide, reponse: r.reponse, via: r.via, zoom: r.zoom, distance_km: r.distance_km, duree_ms: r.duree_ms });
        void m.ecrire([evt]);
        if (e.etape === 'qcm') return '';
        return ligneApres(e.fiche, r.correct && !r.aide, seance.reste(e.fiche));
      },
      connu: () => seance.connu(),
      terminer: () => seance.terminer(),
      bilan(el, actions) {
        const b = seance.bilan();
        const nom = (id: string) => nomDe(o.monde, id);
        const lignes: HTMLElement[] = [creer('h2', {}, d.sorte === 'apprendre' ? remplir(S.titre_apprendre, { serie: nomSerie(d.serie.id) }) : S.titre_revision)];
        if (!m.garde) lignes.push(creer('p', { class: 'hint seance-avis' }, S.non_garde));
        if (b.revisions.n) lignes.push(creer('p', { class: 'seance-resume' }, remplir(S.bilan_revisions, { premiers: b.revisions.premiers, n: b.revisions.n })));
        if (b.nouveaux.length) lignes.push(creer('p', { class: 'seance-resume' }, remplir(S.bilan_nouveaux, { noms: b.nouveaux.map(nom).join(', ') })));
        if (!b.reponses) lignes.push(creer('p', { class: 'hint' }, S.bilan_vide));
        if (b.rates.length)
          lignes.push(
            creer(
              'ul',
              { class: 'essai-rates' },
              ...b.rates.map((r) =>
                creer(
                  'li',
                  {},
                  r.fiche.endsWith(':nommer')
                    ? remplir(S.bilan_rate_nom, { pays: nom(r.id) })
                    : r.distance_km != null
                      ? remplir(S.bilan_rate_km, { pays: nom(r.id), km: fmtKm(r.distance_km) })
                      : remplir(S.bilan_rate_trouver, { pays: nom(r.id) }),
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

  return { ouvrir, comptes, libre };
}
