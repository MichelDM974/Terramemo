// Les voisins du J4 (étude docs/etudes/2026-11-25-j4-conception.md, § 3, lot 2 ; D605 à D607), dans un morceau
// chargé à la demande (chargerVoisins de sujets.ts) avec la partie pure (src/exercices/voisins.ts) et ses textes
// (textes-voisins.fr.json) : rien au premier affichage (décision « Morceau JS principal sous 500 Ko »). Ses données
// sont celles de la carte du monde (pays.json, Lieu.voisins), déjà en mémoire : rien à télécharger d'autre.
//
// Le rendu (sujets.ts, RenduSujet) : celui de Reconnaître (D606 a), la liste écrite des voisins, « Pays qui a pour
// voisins : Autriche, Croatie… » ; on touche le pays (Trouver d'essai.ts, sens nommer), noté par noter, les
// ensembles ambigus admis (une zone de sorte « voisins » : Arabie saoudite et Oman désignent les Émirats et le
// Yémen) ; le QCM d'Apprendre, la même liste au-dessus de quatre noms, jamais l'autre pays d'un ensemble ambigu ni
// un voisin de la liste en leurre.
//
// La question à plusieurs touchers (D605 a, sens localiser) : Trouver d'essai.ts, la séance (forme « voisins ») et
// les épreuves de chrono.ts la posent par question() ; « Touche les 7 voisins de : Hongrie », le pays allumé (et
// cerné s'il est petit), la carte qui vole jusqu'à lui. Chaque voisin touché se marque en vert, et la rétroaction
// (région aria-live de la vue) dit son nom et le compte (« Juste : Autriche · 3 sur 7 ») : la carte n'a pas
// d'équivalent au clavier (§ 3.5). Une faute la finit ; « Voir », « Passer » et le temps écoulé aussi. Finie, les
// voisins manqués sont montrés en vert et cernés, nommés dans la rétroaction, avec à part les voisins neutres
// (« aussi : Kosovo (paquet optionnel) », avec le statut que dit la fiche d'un lieu).
//
// Ce morceau n'importe rien du morceau principal, sinon des types : ce qu'il en emploie lui est donné à
// l'installation (Outils), comme celui des silhouettes (un import de valeur faisait sortir des modules partagés dans
// un morceau préchargé).
import { delaiVoisins, QuestionVoisins, voisinage, type Voisinage } from '../exercices/voisins';
import type { ResultatPick } from '../map/pick';
import type { Lieu, Statut } from '../map/types';
import type { Terrain } from '../terrains';
import type { AdmisDit, estPetite, texteAdmis } from './commun';
import type { formePays } from './formes';
import type { Enonce, Fabrique, nomDe, RenduSujet } from './sujets';
import type { remplir } from './textes';
import { textesVoisins } from './textes-voisins';

/** Ce que le morceau principal lui donne (sujets.ts, outilsVoisins). */
export interface Outils {
  nomDe: typeof nomDe;
  formePays: typeof formePays;
  remplir: typeof remplir;
  texteAdmis: typeof texteAdmis;
  estPetite: typeof estPetite;
  /** Le statut d'une entité non jouable, dit entre parenthèses (LIBELLE_STATUT de commun.ts). */
  statuts: Readonly<Record<Statut, string>>;
}

/** Ce que dit une question à plusieurs touchers après un toucher. */
export interface ReponseVoisins {
  /** La question est finie (tous trouvés, ou une faute). */
  fin: boolean;
  juste: boolean;
  /** La classe de la rétroaction : juste, faux, ou rien (un toucher qui ne compte pas). */
  classe: '' | 'juste' | 'faux';
  texte: string;
  /** Ce que la carte désigne (null : la mer) : la mesure du toucher le garde. */
  pick: ResultatPick | null;
  /**
   * Ce que la mesure du toucher (Toucher.cible, Toucher.juste) en retient : un voisin trouvé (ou déjà trouvé) est un
   * toucher juste sur ce voisin ; une faute, un toucher faux pour le pays demandé ; un toucher qui ne compte pas (le
   * pays lui-même, un voisin neutre, la mer), rien : ni juste ni faux.
   */
  mesure: { cible?: string; juste?: boolean };
}

/** Une question « Touche les voisins de la Hongrie » sur la carte d'un terrain. */
export interface QuestionCarte {
  readonly id: string;
  /** Les voisins à trouver. */
  readonly total: number;
  /** Son délai au Chrono et à Sans faute (D607 a). */
  readonly delai_ms: number;
  readonly finie: boolean;
  readonly juste: boolean;
  /** Le pays touché à tort (Evenement.reponse) ; null sans faute. */
  readonly faute: string | null;
  enonce(): Enonce;
  /** La question posée : le pays allumé (cerné s'il est petit), la carte qui vole jusqu'à lui (hVisible : au-dessus de la barre). */
  poser(hVisible: number): void;
  /** Les marques remises telles quelles (retour dans la vue, que les autres vues ont effacées). */
  remarquer(): void;
  toucher(x: number, y: number): ReponseVoisins;
  /** « Voir », « Passer » ou le temps écoulé : la question finie, les voisins manqués montrés ; le texte de la rétroaction. */
  arreter(temps?: boolean): string;
  /** Le détail du bilan : « 3 sur 7, puis Pologne ». */
  detail(): string;
}

/** Ce que le morceau apporte au reste de l'appli. */
export interface ModuleVoisins {
  /** Le rendu du sujet (sujets.ts, FABRIQUES). */
  fabrique: Fabrique;
  /** Le voisinage des entités d'une carte, calculé une fois par jeu de données. */
  voisinage(entites: readonly { pays: Lieu }[]): Voisinage;
  /** Le délai de la question de ce pays (D607 a : 4 s plus 2 s par voisin). */
  delai(t: Pick<Terrain, 'donnees'>, id: string): number;
  question(t: Pick<Terrain, 'carte' | 'donnees'>, id: string, r: Pick<RenduSujet, 'lieu' | 'lieuArticle'>): QuestionCarte;
}

const T = textesVoisins;

export function installer(o: Outils): ModuleVoisins {
  const { nomDe, formePays, remplir } = o;
  const faits = new WeakMap<object, Voisinage>();
  const voisinageDe = (entites: readonly { pays: Lieu }[]): Voisinage => {
    let v = faits.get(entites);
    if (!v) faits.set(entites, (v = voisinage(entites.map((e) => e.pays))));
    return v;
  };
  /** « de la Hongrie », « du Portugal » ; « de » et le nom pour ce qui n'est pas dans la table des formes. */
  const de = (d: { noms: Readonly<Record<string, string>> }, id: string) => formePays(id, 'de') ?? `de ${nomDe(d, id)}`;
  /** Des noms dans l'ordre alphabétique, séparés de virgules. */
  const liste = (noms: string[]) => noms.sort((a, b) => a.localeCompare(b, 'fr')).join(', ');

  const fabrique: Fabrique = (ts, d) => {
    const v = voisinageDe(d.entites ?? []);
    const nom = (id: string) => nomDe(d, id);
    const ecrits = (id: string) => liste(v.voisins(id).map(nom));
    return {
      enonce: (id) => ({ invite: v.voisins(id).length > 1 ? T.liste : T.liste_un, objet: { texte: ecrits(id) }, deuxLignes: true }),
      consigneQcm: () => ts.consigne_nommer,
      choix: (id) => ({ texte: nom(id) }),
      nomChoix: nom,
      revelation: (id) => ({ texte: nom(id) }),
      nomBilan: nom,
      lieu: nom,
      lieuArticle: (id) => formePays(id, 'le') ?? nom(id),
      consigneNommee: () => null,
      touche: (id) => (id ? nom(id) : ts.la_mer),
      fauxSuite: (id) => remplir(ts.faux_suite, { cible: nom(id) }),
      expire: (id) => remplir(ts.expire, { cible: nom(id) }),
      // La liste ne nommait pas le pays : la rétroaction le dit (« Juste : Hongrie »).
      retro: nom,
      point: () => null,
      points: () => [],
      imageEnonce: () => null,
      visuel: false,
      // Le QCM d'Apprendre : la liste au-dessus des quatre noms, aucune zone allumée (elle donnerait la réponse).
      question: (id) => ({ texte: ecrits(id) }),
      comparaison: () => null,
      qcmPosable: (id) => v.voisins(id).length > 0,
      // Jamais en leurre un pays de la liste (gratuit) ni l'autre pays d'un ensemble ambigu (juste aussi).
      qcmExclus: (id) => new Set([...v.voisins(id), ...v.ambigus(id)]),
      qcmPareils: (a, b) => v.ambigus(a).includes(b),
      qcmLeurres: () => undefined,
      admisEnPlus: (id) => {
        const a = v.ambigus(id);
        return a.length ? { zones: a, sorte: 'voisins' } : null;
      },
    };
  };

  function question(t: Pick<Terrain, 'carte' | 'donnees'>, id: string, r: Pick<RenduSujet, 'lieu' | 'lieuArticle'>): QuestionCarte {
    const v = voisinageDe(t.donnees.entites);
    const d = t.donnees;
    const nom = (x: string) => nomDe(d, x);
    const autres = v.autres(id);
    const parZone = v.parZone(id);
    const q = new QuestionVoisins(id, v.voisins(id), new Set([...autres, ...parZone]));
    const total = q.aTrouver.length;
    const statutDe = (x: string) => d.entites.find((e) => e.pays.id === x)?.pays.statut ?? 'autre';
    const compte = () => remplir(T.compte, { n: q.trouves.length, total });
    /** Les voisins neutres, cités à part à la fin : « · aussi : Albanie (par une zone contestée), Kosovo (paquet optionnel) ». */
    const neutres = (x: string) => (parZone.includes(x) ? remplir(T.par_zone, { nom: nom(x) }) : o.statuts[statutDe(x)] ? remplir(T.statut, { nom: nom(x), statut: o.statuts[statutDe(x)] }) : nom(x));
    const aussi = () => (autres.length + parZone.length ? remplir(T.aussi, { noms: liste([...autres, ...parZone].map(neutres)) }) : '');
    const manque = () => (q.reste.length ? remplir(T.manque, { noms: liste(q.reste.map(nom)) }) : '');
    /** Les marques posées, dans l'ordre : remises telles quelles au retour dans la vue. */
    let marques: { id: string; classe: string; anneau: boolean }[] = [];
    const poser = (m: (typeof marques)[number]) => {
      marques.push(m);
      t.carte.marquer(m.id, m.classe);
      if (m.anneau) t.carte.anneau(m.id, m.classe);
    };
    /** Finie : les voisins manqués en vert, cernés (on les distingue des trouvés autrement que par la teinte). */
    const montrerReste = () => {
      for (const x of q.reste) poser({ id: x, classe: 'juste', anneau: true });
    };
    return {
      id,
      total,
      delai_ms: delaiVoisins(total),
      get finie() {
        return q.finie;
      },
      get juste() {
        return q.juste;
      },
      get faute() {
        return q.faute;
      },
      enonce: () => ({ invite: total > 1 ? remplir(T.enonce, { n: total }) : T.enonce_un, objet: { texte: nom(id) } }),
      poser(hVisible) {
        marques = [];
        t.carte.effacerMarques();
        poser({ id, classe: 'choisi', anneau: o.estPetite(t, id) });
        t.carte.montrer(id, hVisible);
      },
      remarquer() {
        const avant = marques;
        marques = [];
        for (const m of avant) poser(m);
      },
      toucher(x, y) {
        let admis: AdmisDit | null = null;
        const juge = (c: string) => {
          const n = t.carte.noter(c, x, y);
          if (n.juste) admis = n.admis;
          return n.juste;
        };
        const pick = t.carte.pick(x, y);
        const c = q.jouer(juge, pick?.id ?? null);
        const fin = q.finie;
        const mesure: ReponseVoisins['mesure'] = c.sorte === 'trouve' || c.sorte === 'deja' ? { cible: c.id, juste: true } : c.sorte === 'faute' ? { cible: id, juste: false } : {};
        const rep = (classe: ReponseVoisins['classe'], texte: string): ReponseVoisins => ({ fin, juste: q.juste, classe, texte, pick, mesure });
        switch (c.sorte) {
          case 'trouve':
            poser({ id: c.id, classe: 'juste', anneau: o.estPetite(t, c.id) });
            if (q.juste) return rep('juste', remplir(total > 1 ? T.tous : T.tous_un, { total, pays: de(d, id), aussi: aussi() }));
            return rep('juste', remplir(T.trouve, { nom: nom(c.id), admis: o.texteAdmis(r, c.id, admis), compte: compte() }));
          case 'deja':
            return rep('', remplir(T.deja, { nom: nom(c.id), compte: compte() }));
          case 'lui':
            return rep('', remplir(T.lui, { nom: nom(id), compte: compte() }));
          case 'neutre':
            return rep('', remplir(T.neutre, { nom: neutres(c.id), compte: compte() }));
          case 'rien':
            return rep('', remplir(T.rien, { compte: compte() }));
          case 'faute':
            poser({ id: c.id, classe: 'faux', anneau: o.estPetite(t, c.id) });
            montrerReste();
            return rep('faux', remplir(T.faute, { nom: nom(c.id), pays: de(d, id), manque: manque(), aussi: aussi() }));
        }
      },
      arreter(temps = false) {
        if (!q.finie) {
          q.arreter();
          montrerReste();
        }
        return remplir(temps ? T.temps : T.arret, { compte: compte(), manque: manque(), aussi: aussi() });
      },
      detail: () => (q.faute ? remplir(T.bilan_faute, { compte: compte(), nom: nom(q.faute) }) : remplir(T.bilan_reste, { compte: compte() })),
    };
  }

  return {
    fabrique,
    voisinage: voisinageDe,
    delai: (t, id) => delaiVoisins(voisinageDe(t.donnees.entites).voisins(id).length),
    question,
  };
}
