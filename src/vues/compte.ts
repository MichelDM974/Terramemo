// Vue « Compte » (⚙ › Compte, #compte ; étude du J1b, § 3), lot 1 : invité,
// création d'un compte e-mail (lien de l'invité anonyme), connexion, mot de
// passe oublié, adresse non vérifiée (renvoi, non bloquante : D18 b),
// changement du mot de passe, déconnexion, session perdue. Morceau chargé à
// la demande avec src/sync/comptes.ts (vueCompteALaDemande, main.ts) : un
// invité ne charge jamais Firebase au démarrage (D9 b).
//
// Lot 2 : le pseudo du compte, modifiable (pseudoValide), écrit dans le
// profil `joueurs/{uid}` avec les records ; à la connexion, un pseudo de
// l'appareil remplacé par celui du compte est dit une fois (§ 2.3, étape 7).
// Lot 3 : l'état de la synchro du compte (§ 3.2, une ligne : à jour, séances
// en attente, hors ligne, séances refusées · « Réessayer »), et le nombre de
// séances pas encore envoyées d'une session perdue. Lot 4 : la question de
// fusion à la connexion d'un compte existant (D22 : « Ajouter », « Ne pas les
// ajouter » et sa seconde confirmation, « Annuler »), la déconnexion
// reprenable (ce qui n'est pas parti, « Réessayer l'envoi », « Se déconnecter
// quand même »), « Effacer cet appareil » pour une session perdue, et la ligne
// « Mets à jour l'appli » des lots qu'une version ne sait pas lire. Lot 5 :
// « Supprimer mon compte » (§ 7.1 : le texte de D27 b sur les places du
// classement, puis « supprimer » et le mot de passe), « Suppression inachevée
// : reprendre ? », « Ce compte est en cours de suppression » ; « Exporter mes
// données » (§ 7.2 : sur le site ; dans l'APK, un renvoi au site, D26 a), et
// « Exporter d'abord » avant ce qui effacerait des progrès (seconde
// confirmation de « Ne pas les ajouter », déconnexion qui n'a pas tout
// envoyé, « Effacer cet appareil »). Viendront
// ensuite : Google (lots 6 et 7). Les champs portent autocomplete et inputmode : le remplissage
// automatique d'Android marche ainsi dans la WebView (§ 3.2). Textes :
// textes.fr.json (compte), erreurs traduites par src/sync/erreurs.ts.
import { prendreAvisPseudo, pseudoValide } from '../epreuve/chrono';
import { MOT_SUPPRESSION, type ChoixFusion, type Comptes, type EtatCompte, type QuestionFusion, type ResultatDeconnexion, type ResultatProfil } from '../sync/comptes';
import { dansApk } from '../retour-android';
import { synchroCoupee } from '../sync/drapeaux';
import type { Envoi, EtatSynchro } from '../sync/envoi';
import { codeErreur, traduire } from '../sync/erreurs';
import { telecharger } from '../sync/export';
import { lirePseudo } from './classement';
import { creer, croix, type ContexteVue, type Vue } from './commun';
import { remplir, textes } from './textes';

const T = textes.compte;

type Ecran =
  | 'chargement'
  | 'echec'
  | 'invite'
  | 'creer'
  | 'connecter'
  | 'compte'
  | 'mdp'
  | 'pseudo'
  | 'perdue'
  | 'sans-compte'
  | 'fusion'
  | 'fusion-confirmer'
  | 'deconnexion'
  | 'effacer'
  | 'supprimer'
  | 'suppression'
  | 'attente';

/** Écrans qui restent tels quels quand l'état est relu (saisie en cours, question posée). */
const ECRANS_GARDES: ReadonlySet<Ecran> = new Set(['creer', 'connecter', 'mdp', 'pseudo', 'sans-compte', 'fusion', 'fusion-confirmer', 'deconnexion', 'effacer', 'supprimer', 'suppression', 'attente']);
/** Les écrans de la question de fusion, réponse comprise : un échec ramène au formulaire d'où l'on venait. */
const ECRANS_QUESTION: ReadonlySet<Ecran> = new Set(['fusion', 'fusion-confirmer', 'attente']);

/** « 12 réponses », « 1 record », « 12 réponses et 3 records ». */
export function detailProgres(reponses: number, records: number): string {
  const r = reponses === 1 ? T.detail_reponse : remplir(T.detail_reponses, { n: reponses });
  const k = records === 1 ? T.detail_record : remplir(T.detail_records, { n: records });
  if (reponses && records) return remplir(T.detail_et, { a: r, b: k });
  return records && !reponses ? k : r;
}

/** Le texte de la question de fusion (§ 2.3, étape 1). */
export function texteQuestion(q: QuestionFusion): string {
  if (q.sorte === 'autre_compte') return q.seances === 1 ? T.fusion_autre_compte_une : remplir(T.fusion_autre_compte, { n: q.seances });
  return remplir(T.fusion_question, { detail: detailProgres(q.reponses, q.records) });
}

/** Ce que dit une déconnexion qui n'a pas pu tout envoyer (§ 3.4, étape 2). */
export function textesDeconnexion(r: Extract<ResultatDeconnexion, { fait: false }>): string[] {
  const l: string[] = [];
  if (r.nonEnvoyees) l.push(r.nonEnvoyees === 1 ? T.deconnexion_seance : remplir(T.deconnexion_seances, { n: r.nonEnvoyees }));
  if (!r.profil) l.push(T.deconnexion_profil);
  return l;
}

/** Ce que dit la connexion du pseudo : celui de l'appareil remplacé par celui du compte, dit une fois. */
export function textePseudoDuCompte(p: ResultatProfil | null | undefined): string {
  return p?.ancienPseudo && p.pseudo ? remplir(T.pseudo_du_compte, { pseudo: p.pseudo }) : '';
}

function stockageDeLaPage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Le profil a reçu le pseudo (ou l'avait déjà) ; sinon il attend sur l'appareil. */
const profilAJour = (p: ResultatProfil) => p.etat === 'a_jour' || p.etat === 'cree' || p.etat === 'ecrit';

export interface OptionsVueCompte {
  retour: () => void;
  /** « × » (#18) : la carte ; sans elle, pas de « × ». */
  versCarte?: () => void;
  /** Les comptes de la page (Firebase chargé au premier appel). */
  comptes: () => Promise<Comptes>;
  /**
   * L'envoi des séances (src/sync/envoi.ts, chargé avec les comptes) : état
   * de la synchro, « Réessayer », séances pas encore envoyées d'une session
   * perdue (§ 2.5).
   */
  envoi?: () => Promise<Pick<Envoi, 'etat' | 'compter' | 'declencher' | 'surPasse'>>;
  /**
   * L'export des données (§ 7.2, main.ts) : le fichier à proposer ; `complet`
   * faux, des séances en ligne du compte peuvent y manquer. Absent : pas
   * d'export.
   */
  exporter?: () => Promise<{ nom: string; contenu: string; complet?: boolean }>;
  /** Dans l'APK ? (D26 a : un renvoi au site à la place de l'export). Défaut : dansApk(). */
  natif?: () => boolean;
  /** Le fichier proposé au navigateur. Défaut : Blob et <a download> (src/sync/export.ts). */
  telecharger?: (nom: string, contenu: string) => void;
}

/** La ligne de l'état de la synchro d'un compte (§ 3.2), sans « Réessayer ». */
export function texteSynchro(e: EtatSynchro): string {
  if (e.coupee) return T.synchro_coupee;
  if (e.refusees) return e.refusees === 1 ? T.synchro_refusee_une : remplir(T.synchro_refusees, { n: e.refusees });
  if (e.aRelire) return e.aRelire === 1 ? T.synchro_a_relire_une : remplir(T.synchro_a_relire, { n: e.aRelire });
  if (e.attente && e.horsLigne) return T.synchro_hors_ligne;
  if (e.attente) return e.attente === 1 ? T.synchro_attente_une : remplir(T.synchro_attente, { n: e.attente });
  return T.synchro_a_jour;
}

/**
 * Le texte de D27 b, avant la confirmation d'une suppression (§ 7.1) : les
 * places du pseudo du profil en ligne, celui que la demande portera
 * (comptes.pseudoDemande), retirées sous 30 jours ; aucune sans pseudo en
 * ligne ; un texte sans nom si le profil ne s'est pas lu.
 */
export function texteClassementSuppression(p: { lu: boolean; pseudo: string | null } | null): string {
  if (p?.lu && p.pseudo) return remplir(T.supprimer_classement, { pseudo: p.pseudo });
  return p?.lu ? T.supprimer_classement_aucun : T.supprimer_classement_sans;
}

/** Le texte d'une session perdue : « {n} séances », au singulier pour une. */
export function textePerdue(n: number | null): string {
  if (!n) return T.perdue_aucune;
  return n === 1 ? T.perdue_une : remplir(T.perdue, { n });
}

export function vueCompte(ctx: ContexteVue, o: OptionsVueCompte): Vue {
  let ecran: Ecran = 'chargement';
  let etat: EtatCompte | null = null;
  let active = false;
  let occupe = false;
  /** Adresse gardée d'un formulaire à l'autre (création → connexion, session perdue → reconnexion). */
  let adresseSaisie = '';
  let seancesPerdue: number | null = null;
  let synchroLue: EtatSynchro | null = null;
  /** La question de fusion posée (§ 2.3), et sa réponse à rendre aux comptes. */
  let question: QuestionFusion | null = null;
  let repondre: ((c: ChoixFusion) => void) | null = null;
  /** Le formulaire d'où vient la question (connexion, création) : un échec y ramène. */
  let fusionDepuis: Ecran = 'connecter';
  /** Ce qu'une déconnexion n'a pas pu envoyer (§ 3.4, étape 2). */
  let reste: Extract<ResultatDeconnexion, { fait: false }> | null = null;
  /** Les réponses qu'« Effacer cet appareil » effacerait. */
  let aEffacer: number | null = null;
  let abonne = false;
  let abonneEnvoi = false;
  /** L'export en cours : ce qui efface l'appareil l'attend (le fichier lit le journal à la fin). */
  let exportEnCours: Promise<void> | null = null;
  /** Le pseudo que la demande de retrait des places portera (lu à l'ouverture de « Supprimer mon compte »). */
  let pseudoSuppression: { lu: boolean; pseudo: string | null } | null = null;
  const natif = o.natif ?? (() => typeof window !== 'undefined' && dansApk());

  const message = creer('p', { class: 'status', id: 'compte-message', 'aria-live': 'polite' });
  const erreur = creer('p', { class: 'status error', id: 'compte-erreur', role: 'alert' });
  const contenu = creer('div', { class: 'compte-contenu', id: 'compte-contenu' });
  const synchro = creer('p', { class: 'hint', id: 'compte-synchro', 'aria-live': 'polite' }, T.synchro_coupee);
  const retour = creer('button', { type: 'button', class: 'secondary', id: 'compte-retour' }, T.retour);
  retour.addEventListener('click', () => o.retour());
  const section = creer(
    'section',
    { class: 'vue-compte', id: 'vue-compte' },
    creer('div', { class: 'panel' }, ...(o.versCarte ? [croix(o.versCarte)] : []), creer('h2', {}, T.titre), contenu, message, erreur, synchro, creer('div', { class: 'essai-actions compte-retour' }, retour)),
  );
  section.hidden = true;
  ctx.zone.append(section);

  const dire = (m: string) => {
    message.textContent = m;
    erreur.textContent = '';
  };
  const montrerErreur = (e: unknown) => {
    const t = traduire(e).texte;
    erreur.textContent = t ?? '';
  };
  const effacerAvis = () => {
    message.textContent = '';
    erreur.textContent = '';
  };
  /** L'avis d'un pseudo remplacé par celui du compte : dit par le message de la connexion, il ne se redit pas ailleurs. */
  const avisPseudoDit = () => void prendreAvisPseudo(stockageDeLaPage());

  /** Un bouton ; `principal` : le seul en accent plein de l'écran ; `danger` : une action qui efface. */
  function bouton(id: string, texte: string, faire: () => void, sorte: 'principal' | 'secondaire' | 'lien' | 'danger' = 'secondaire', type: 'button' | 'submit' = 'button'): HTMLButtonElement {
    const classe = { principal: null, secondaire: 'secondary', lien: 'lien', danger: 'danger' }[sorte];
    const b = creer('button', { type, id, ...(classe ? { class: classe } : {}) }, texte);
    if (type === 'button') b.addEventListener('click', () => faire());
    return b;
  }

  /**
   * Un champ : le libellé au-dessus, puis le champ (et son bouton « Montrer »)
   * sur une ligne. Le bouton reste hors du <label> : son texte n'entre pas dans
   * le nom du champ que lit le lecteur d'écran.
   */
  function champ(id: string, libelle: string, attrs: Record<string, string>, valeur = ''): { label: HTMLDivElement; input: HTMLInputElement; ligne: HTMLDivElement } {
    const input = creer('input', { id, ...attrs });
    input.value = valeur;
    const ligne = creer('div', { class: 'compte-ligne' }, input);
    const label = creer('div', { class: 'compte-champ' }, creer('label', { for: id }, libelle), ligne);
    return { label, input, ligne };
  }

  /** Champ de mot de passe, avec « Montrer » / « Masquer ». */
  function champMdp(id: string, libelle: string, autocomplete: string): { label: HTMLDivElement; input: HTMLInputElement; ligne: HTMLDivElement } {
    const c = champ(id, libelle, { type: 'password', name: id, autocomplete, minlength: '8', autocapitalize: 'off', spellcheck: 'false' });
    const voir = creer('button', { type: 'button', class: 'secondary compte-voir', id: `${id}-voir`, 'aria-controls': id, 'aria-pressed': 'false' }, T.montrer);
    voir.addEventListener('click', () => {
      const montre = c.input.getAttribute('type') === 'password';
      c.input.setAttribute('type', montre ? 'text' : 'password');
      voir.textContent = montre ? T.masquer : T.montrer;
      voir.setAttribute('aria-pressed', String(montre));
    });
    c.ligne.append(voir);
    return c;
  }

  const champAdresse = (valeur: string): { label: HTMLDivElement; input: HTMLInputElement } =>
    champ('compte-adresse', T.adresse, { type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', required: '' }, valeur);

  /** Un formulaire : Entrée l'envoie, le gestionnaire de mots de passe le reconnaît. */
  function formulaire(id: string, envoyer: () => void, ...enfants: Node[]): HTMLFormElement {
    const f = creer('form', { id, class: 'compte-form', novalidate: '' }, ...enfants);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      envoyer();
    });
    return f;
  }

  /** Une action : boutons désactivés le temps de l'appel, erreur traduite. */
  async function agir(faire: (c: Comptes) => Promise<void>): Promise<void> {
    if (occupe) return;
    occupe = true;
    erreur.textContent = '';
    for (const b of contenu.querySelectorAll('button')) b.disabled = true;
    try {
      await faire(await o.comptes());
    } catch (e) {
      montrerErreur(e);
      if (ECRANS_QUESTION.has(ecran)) {
        // Un échec après la réponse à la question : retour au formulaire, l'erreur gardée.
        const t = erreur.textContent;
        aller(fusionDepuis);
        erreur.textContent = t;
      }
      if (codeErreur(e) === 'terramemo/suppression-inachevee') {
        // Une suppression menée ailleurs (autre onglet) : l'écran de sa reprise, l'erreur gardée.
        const t = erreur.textContent;
        try {
          etat = await (await o.comptes()).etat();
          aller(ecranDe(etat));
        } catch {
          // L'état relu plus tard (premier plan).
        }
        erreur.textContent = t;
      }
      if (codeErreur(e) === 'auth/email-already-in-use' && ecran === 'creer') {
        // Ce compte existe déjà (§ 2.3) : vers « Se connecter », adresse pré-remplie, l'erreur gardée.
        const t = erreur.textContent;
        aller('connecter');
        erreur.textContent = t;
      }
    } finally {
      occupe = false;
      for (const b of contenu.querySelectorAll('button')) b.disabled = false;
    }
  }

  function aller(e: Ecran): void {
    ecran = e;
    rendre();
  }

  /**
   * La question de fusion (comptes.connecter, comptes.creer) : l'écran
   * « fusion » montré, la réponse rendue au premier choix. « Annuler » ramène
   * au formulaire d'où l'on venait.
   */
  function demander(depuis: Ecran): (q: QuestionFusion) => Promise<ChoixFusion> {
    return (q) =>
      new Promise<ChoixFusion>((ok) => {
        question = q;
        fusionDepuis = depuis;
        repondre = (c) => {
          repondre = null;
          question = null;
          // La réponse donnée : plus de choix à l'écran ; « Connexion… » pendant la suite de l'appel.
          aller(c === 'annuler' ? depuis : 'attente');
          ok(c);
        };
        effacerAvis();
        aller('fusion');
      });
  }

  /** Le message d'une connexion réussie, selon la réponse à la question. */
  function texteConnexion(r: { adresse: string; fusion: string; reponses?: number }, q: QuestionFusion | null): string {
    if (r.fusion === 'efface') return remplir(T.connecte_efface, { adresse: r.adresse });
    if (r.fusion === 'ajoute' && q) return remplir(T.connecte_ajoute, { adresse: r.adresse, detail: detailProgres(q.reponses, q.records) });
    return remplir(T.connecte, { adresse: r.adresse });
  }

  /** Déconnexion (§ 3.4) : faite, ou l'écran de ce qui n'est pas parti. */
  async function deconnecter(c: Comptes, quandMeme = false): Promise<void> {
    let r: ResultatDeconnexion;
    try {
      r = await c.deconnecter({ quandMeme });
    } catch (e) {
      // Déconnecté, mais l'appareil n'est pas vidé : il le sera au prochain démarrage.
      montrerErreur(e);
      const t = erreur.textContent;
      await apres(c);
      erreur.textContent = t;
      return;
    }
    if (!r.fait) {
      reste = r;
      aller('deconnexion');
      return;
    }
    reste = null;
    dire(quandMeme ? T.deconnecte_quand_meme : T.deconnecte);
    await apres(c);
  }

  /**
   * La confirmation d'une suppression (§ 7.1) : « supprimer » à écrire, et le
   * mot de passe d'un compte `password` (réauthentification, ou reconnexion
   * d'une session perdue en route : `motDePasse`) ; pour Google connecté, la
   * fenêtre de Google. `annuler` : le bouton à côté (« Annuler » vers le
   * compte, « Annuler la suppression » d'une reprise), ou aucun.
   */
  function formulaireSuppression(adresse: string | null, fournisseurs: readonly string[], motDePasse: boolean, google: boolean, texte: string, annuler: HTMLButtonElement | null): Node[] {
    const mdpDemande = motDePasse && fournisseurs.includes('password');
    const mot = champ('compte-supprimer-mot', T.supprimer_mot, { type: 'text', name: 'confirmation', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', required: '' });
    const mdp = mdpDemande ? champMdp('compte-supprimer-mdp', T.mdp, 'current-password') : null;
    // L'identifiant du compte, caché : le gestionnaire de mots de passe propose le bon.
    const nom = creer('input', { type: 'email', name: 'email', autocomplete: 'username', hidden: '', readonly: '', tabindex: '-1', 'aria-hidden': 'true' });
    nom.value = adresse ?? '';
    const envoyer = () => {
      if (mot.input.value.trim().toLocaleLowerCase('fr') !== MOT_SUPPRESSION) {
        erreur.textContent = T.erreurs['terramemo/suppression-mot'];
        return;
      }
      void agir(async (c) => {
        dire(T.suppression_en_cours);
        try {
          await c.supprimer({ mot: mot.input.value, ...(mdp ? { mdp: mdp.input.value } : {}) });
        } catch (err) {
          // Coupée en route : l'écran de l'état d'après (reprise, reconnexion, compte si le drapeau
          // est levé), l'erreur gardée ; le même état garde l'écran (mot de passe faux).
          message.textContent = '';
          const e = await c.etat().catch(() => null);
          if (e && JSON.stringify(e) !== JSON.stringify(etat)) {
            etat = e;
            aller(ecranDe(e));
          }
          throw err;
        }
        dire(T.supprime);
        await apres(c);
      });
    };
    return [
      formulaire(
        'compte-form-supprimer',
        envoyer,
        ...(mdp ? [nom] : []),
        mot.label,
        ...(mdp ? [mdp.label] : []),
        ...(google && !mdpDemande && fournisseurs.includes('google.com') ? [creer('p', { class: 'hint', id: 'compte-supprimer-google' }, T.supprimer_google)] : []),
        creer('div', { class: 'compte-actions' }, bouton('compte-supprimer-ok', texte, envoyer, 'danger', 'submit'), ...(annuler ? [annuler] : [])),
      ),
    ];
  }

  /**
   * L'export (§ 7.2), hors de agir() : « Exporter d'abord » se touche pendant
   * la question de fusion, quand la connexion est encore en cours. Ce qui
   * efface l'appareil (avantEffacement) attend qu'il ait fini.
   */
  function exporterIci(): Promise<void> {
    if (!o.exporter) return Promise.resolve();
    if (exportEnCours) return exportEnCours;
    const exporter = o.exporter;
    erreur.textContent = '';
    dire(T.export_en_cours);
    exportEnCours = (async () => {
      try {
        const f = await exporter();
        (o.telecharger ?? telecharger)(f.nom, f.contenu);
        dire([remplir(T.exporte, { nom: f.nom }), f.complet === false ? T.exporte_partiel : ''].filter(Boolean).join(' '));
      } catch (e) {
        message.textContent = '';
        montrerErreur(e);
      } finally {
        exportEnCours = null;
      }
    })();
    return exportEnCours;
  }

  /** Avant d'effacer l'appareil : un export lancé (« Exporter d'abord ») finit d'abord, sur le journal entier. */
  async function avantEffacement(): Promise<void> {
    if (exportEnCours) await exportEnCours;
  }

  /**
   * « Exporter mes données » sur le site ; dans l'APK, le renvoi au site
   * (D26 a). `dabord` : « Exporter d'abord », avant ce qui efface, sur le site
   * seulement. Rien sans export branché.
   */
  function exportDe(id: string, sorte: 'secondaire' | 'lien', dabord = false): Node[] {
    if (!o.exporter) return [];
    // Dans l'APK, le renvoi au site ne vaut que pour un compte, qui y a tout en ligne : le journal d'un
    // invité ou d'une session perdue n'est que dans l'appli (D26 a).
    if (natif()) return dabord || ecran !== 'compte' ? [] : [creer('p', { class: 'hint', id: `${id}-site` }, T.exporter_site)];
    return [bouton(id, dabord ? T.exporter_dabord : T.exporter, () => void exporterIci(), sorte)];
  }

  function rendre(): void {
    rendreSynchro();
    contenu.replaceChildren(...ecranCourant());
  }

  /** La ligne de la synchro : l'état d'un compte sur son écran ; ailleurs, seulement « Synchro coupée ». */
  function rendreSynchro(): void {
    const e = ecran === 'compte' ? synchroLue : null;
    if (!e) {
      synchro.hidden = !synchroCoupee();
      synchro.replaceChildren(T.synchro_coupee);
      return;
    }
    synchro.hidden = false;
    synchro.replaceChildren(texteSynchro({ ...e, coupee: e.coupee || synchroCoupee() }));
    if (e.refusees && !e.coupee) synchro.append(' · ', bouton('compte-synchro-reessayer', T.synchro_reessayer, () => void reessayer(), 'lien'));
  }

  async function lireSynchro(): Promise<void> {
    if (etat?.etat !== 'compte' || !o.envoi) {
      synchroLue = null;
      return;
    }
    try {
      const e = await o.envoi();
      if (!abonneEnvoi) {
        abonneEnvoi = true;
        // Après chaque passe (clôture d'une séance, retour du réseau) : la ligne suit.
        e.surPasse(() => {
          if (active) void lireSynchro().then(rendreSynchro);
        });
      }
      synchroLue = etat?.etat === 'compte' ? await e.etat(etat.uid) : null;
    } catch {
      synchroLue = null;
    }
  }

  /** « Réessayer » : les lots refusés relancés, puis la ligne relue. */
  async function reessayer(): Promise<void> {
    if (!o.envoi) return;
    try {
      await (await o.envoi()).declencher('reessayer');
    } catch (e) {
      montrerErreur(e);
    }
    await lireSynchro();
    rendreSynchro();
  }

  function ecranCourant(): Node[] {
    switch (ecran) {
      case 'chargement':
        return [creer('p', { class: 'hint' }, T.chargement)];
      case 'echec':
        return [creer('p', { class: 'hint' }, T.chargement_echec), creer('div', { class: 'essai-actions' }, bouton('compte-recharger', T.reessayer, () => void rafraichir(), 'principal'))];
      case 'invite':
        return [
          creer('p', { class: 'hint' }, T.invite),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-vers-connecter', T.se_connecter_email, () => {
              effacerAvis();
              aller('connecter');
            }, 'principal'),
            bouton('compte-vers-creer', T.creer, () => {
              effacerAvis();
              aller('creer');
            }),
          ),
          // Un invité exporte aussi son journal (§ 7.2), sans « compte ».
          creer('div', { class: 'compte-liens' }, ...exportDe('compte-exporter', 'lien')),
        ];
      case 'creer': {
        const a = champAdresse(adresseSaisie);
        const m = champMdp('compte-mdp', T.mdp, 'new-password');
        const envoyer = () => {
          adresseSaisie = a.input.value;
          void agir(async (c) => {
            const r = await c.creer(a.input.value, m.input.value, demander('creer'));
            avisPseudoDit();
            const fusion = r.fusion === 'efface' ? T.cree_efface : '';
            dire([r.verification ? remplir(T.cree, { adresse: r.adresse }) : T.cree_sans_email, fusion, textePseudoDuCompte(r.profil)].filter(Boolean).join(' '));
            await apres(c);
          });
        };
        return [
          creer('h3', {}, T.titre_creer),
          formulaire(
            'compte-form-creer',
            envoyer,
            a.label,
            m.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-creer-ok', T.creer_bouton, envoyer, 'principal', 'submit'),
              bouton('compte-annuler', T.annuler, () => annuler()),
            ),
          ),
          // La politique de confidentialité, avant de créer le compte (§ 3.2, § 7.3) : la vue #confidentialite,
          // d'où « Retour » ramène au formulaire, saisie gardée.
          creer('p', { class: 'hint', id: 'compte-politique' }, T.politique, creer('a', { href: '#confidentialite', id: 'compte-lien-politique' }, T.politique_lien)),
          bouton('compte-deja', T.deja_compte, () => {
            adresseSaisie = a.input.value;
            effacerAvis();
            aller('connecter');
          }, 'lien'),
        ];
      }
      case 'connecter': {
        const a = champAdresse(adresseSaisie);
        const m = champMdp('compte-mdp', T.mdp, 'current-password');
        const envoyer = () => {
          adresseSaisie = a.input.value;
          void agir(async (c) => {
            let posee: QuestionFusion | null = null;
            const r = await c.connecter(a.input.value, m.input.value, (q) => ((posee = q), demander('connecter')(q)));
            avisPseudoDit();
            dire([texteConnexion(r, posee), textePseudoDuCompte(r.profil)].filter(Boolean).join(' '));
            await apres(c);
          });
        };
        return [
          creer('h3', {}, T.titre_connecter),
          formulaire(
            'compte-form-connecter',
            envoyer,
            a.label,
            m.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-connecter-ok', T.connecter_bouton, envoyer, 'principal', 'submit'),
              bouton('compte-annuler', T.annuler, () => annuler()),
            ),
          ),
          creer(
            'div',
            { class: 'compte-liens' },
            bouton('compte-oubli', T.oubli, () => {
              adresseSaisie = a.input.value;
              void agir(async (c) => {
                await c.oublier(a.input.value);
                dire(T.oubli_envoye);
              });
            }, 'lien'),
            bouton('compte-vers-creer', T.pas_de_compte, () => {
              adresseSaisie = a.input.value;
              effacerAvis();
              aller('creer');
            }, 'lien'),
          ),
        ];
      }
      case 'compte': {
        const e = etat?.etat === 'compte' ? etat : null;
        if (!e) return [];
        const motDePasse = e.fournisseurs.includes('password');
        const nom = motDePasse ? (e.adresse ?? '') : remplir(T.compte_google, { adresse: e.adresse ?? '' });
        const lignes: Node[] = [creer('p', { class: 'compte-adresse', id: 'compte-adresse-connectee' }, nom)];
        // Le pseudo du compte (§ 3.2) : celui du profil, recopié sur l'appareil.
        const pseudo = lirePseudo();
        lignes.push(
          creer(
            'p',
            { class: 'hint', id: 'compte-pseudo-actuel' },
            `${pseudo ? remplir(T.pseudo, { pseudo }) : T.pseudo_aucun} · `,
            bouton('compte-vers-pseudo', pseudo ? T.pseudo_changer : T.pseudo_choisir, () => {
              effacerAvis();
              aller('pseudo');
            }, 'lien'),
          ),
        );
        if (!e.verifiee && motDePasse)
          lignes.push(
            creer(
              'p',
              { class: 'hint', id: 'compte-non-verifiee' },
              `${T.non_verifiee} · `,
              bouton('compte-renvoyer', T.renvoyer, () =>
                void agir(async (c) => {
                  const r = await c.renvoyer();
                  dire(remplir(T.renvoye, { adresse: r.adresse }));
                }), 'lien'),
            ),
          );
        // Une suppression lancée depuis un autre appareil (pierre tombale lue, § 7.1).
        if (e.supprime) lignes.push(creer('p', { class: 'hint', id: 'compte-en-suppression' }, T.en_suppression));
        lignes.push(
          creer(
            'div',
            { class: 'compte-actions' },
            ...exportDe('compte-exporter', 'secondaire'),
            ...(motDePasse ? [bouton('compte-vers-mdp', T.changer_mdp, () => {
              effacerAvis();
              aller('mdp');
            })] : []),
            bouton('compte-deconnecter', T.se_deconnecter, () => void agir((c) => deconnecter(c))),
          ),
          // En bas, à part (§ 3.2).
          creer(
            'div',
            { class: 'compte-actions compte-separe' },
            bouton('compte-vers-supprimer', T.supprimer_lien, () =>
              void agir(async (c) => {
                effacerAvis();
                // Le pseudo de la demande (celui du profil en ligne), montré avant la confirmation.
                pseudoSuppression = await c.pseudoDemande();
                aller('supprimer');
              }), 'danger'),
          ),
        );
        return lignes;
      }
      case 'supprimer': {
        const e = etat?.etat === 'compte' ? etat : null;
        if (!e) return [];
        return [
          creer('h3', {}, T.titre_supprimer),
          creer('p', { id: 'compte-supprimer-texte' }, T.supprimer_texte),
          // D27 b, avant la confirmation : les places du pseudo.
          creer('p', { id: 'compte-supprimer-classement' }, texteClassementSuppression(pseudoSuppression)),
          ...formulaireSuppression(e.adresse, e.fournisseurs, true, true, T.supprimer_bouton, bouton('compte-annuler', T.annuler, () => annuler())),
        ];
      }
      case 'suppression': {
        const e = etat?.etat === 'suppression' ? etat : null;
        if (!e) return [];
        const titre = creer('p', { id: 'compte-suppression-inachevee' }, T.suppression_inachevee);
        // Compte connecté : la reprise depuis la réauthentification, ou « Annuler la suppression »
        // tant que la pierre tombale n'est pas posée.
        if (e.connecte)
          return [
            titre,
            ...formulaireSuppression(e.adresse, e.fournisseurs, true, true, T.suppression_reprendre, bouton('compte-suppression-annuler', T.suppression_annuler, () =>
              void agir(async (c) => {
                await c.annulerSuppression();
                dire(T.suppression_annulee);
                await apres(c);
              }))),
          ];
        // deleteUser a abouti ici : il reste à vider l'appareil, sans mot de passe.
        if (e.horsAuth)
          return [titre, creer('p', { class: 'hint', id: 'compte-suppression-appareil' }, T.suppression_appareil), ...formulaireSuppression(e.adresse, e.fournisseurs, false, false, T.suppression_reprendre, null)];
        // Session perdue en route : rien ne dit que le compte est parti. Se reconnecter pour finir ;
        // « Vider cet appareil » en dernier recours, sans rien promettre du compte.
        return [
          titre,
          creer('p', { class: 'hint', id: 'compte-suppression-reconnecter' }, e.fournisseurs.includes('password') ? T.suppression_reconnecter : T.suppression_reconnecter_site),
          ...formulaireSuppression(e.adresse, e.fournisseurs, true, false, T.suppression_reprendre, null),
          ...(e.fournisseurs.includes('password') && e.adresse
            ? [creer('div', { class: 'compte-liens' }, bouton('compte-oubli', T.oubli, () =>
                void agir(async (c) => {
                  await c.oublier(e.adresse ?? '');
                  dire(T.oubli_envoye);
                }), 'lien'))]
            : []),
          creer(
            'div',
            { class: 'compte-actions compte-separe' },
            creer('p', { class: 'hint', id: 'compte-suppression-vider-aide' }, T.suppression_vider_aide),
            bouton('compte-suppression-vider', T.effacer_appareil, () =>
              void agir(async (c) => {
                await c.abandonnerSuppression();
                dire(T.suppression_videe);
                await apres(c);
              }), 'danger'),
          ),
        ];
      }
      case 'mdp': {
        const e = etat?.etat === 'compte' ? etat : null;
        // L'identifiant du compte, caché : le gestionnaire de mots de passe met à jour le bon.
        const nom = creer('input', { type: 'email', name: 'email', autocomplete: 'username', hidden: '', readonly: '', tabindex: '-1', 'aria-hidden': 'true' });
        nom.value = e?.adresse ?? '';
        const ancien = champMdp('compte-mdp-actuel', T.mdp_actuel, 'current-password');
        const nouveau = champMdp('compte-mdp-nouveau', T.mdp_nouveau, 'new-password');
        const envoyer = () =>
          void agir(async (c) => {
            await c.changerMotDePasse(ancien.input.value, nouveau.input.value);
            dire(T.mdp_change);
            await apres(c);
          });
        return [
          creer('h3', {}, T.titre_mdp),
          formulaire(
            'compte-form-mdp',
            envoyer,
            nom,
            ancien.label,
            nouveau.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-mdp-ok', T.changer_bouton, envoyer, 'principal', 'submit'),
              bouton('compte-annuler', T.annuler, () => annuler()),
            ),
          ),
        ];
      }
      case 'pseudo': {
        const p = champ('compte-pseudo', T.pseudo_libelle, { type: 'text', name: 'pseudo', maxlength: '20', autocomplete: 'nickname', autocapitalize: 'words', spellcheck: 'false', required: '' }, lirePseudo() ?? '');
        const envoyer = () => {
          const v = pseudoValide(p.input.value);
          if (!v) {
            erreur.textContent = textes.chrono.pseudo_invalide;
            return;
          }
          void agir(async (c) => {
            const r = await c.changerPseudo(v);
            dire(profilAJour(r) ? remplir(T.pseudo_change, { pseudo: v }) : T.pseudo_garde);
            await apres(c);
          });
        };
        return [
          creer('h3', {}, T.titre_pseudo),
          creer('p', { class: 'hint' }, T.pseudo_aide),
          formulaire(
            'compte-form-pseudo',
            envoyer,
            p.label,
            creer(
              'div',
              { class: 'compte-actions' },
              bouton('compte-pseudo-ok', T.pseudo_bouton, envoyer, 'principal', 'submit'),
              bouton('compte-annuler', T.annuler, () => annuler()),
            ),
          ),
        ];
      }
      case 'perdue':
        return [
          creer('p', { id: 'compte-perdue' }, textePerdue(seancesPerdue)),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-reconnecter', T.se_reconnecter, () => {
              adresseSaisie = etat?.etat === 'perdue' ? (etat.adresse ?? '') : adresseSaisie;
              effacerAvis();
              aller('connecter');
            }, 'principal'),
            bouton('compte-sans-compte', T.continuer_sans, () => {
              effacerAvis();
              aller('sans-compte');
            }),
          ),
          creer('div', { class: 'compte-liens' }, ...exportDe('compte-exporter', 'lien')),
          creer(
            'div',
            { class: 'compte-actions compte-separe' },
            bouton('compte-effacer', T.effacer_appareil, () =>
              void agir(async (c) => {
                effacerAvis();
                aEffacer = await c.reponsesAppareil();
                aller('effacer');
              }), 'danger'),
          ),
        ];
      case 'effacer':
        return [
          creer('h3', {}, T.effacer_appareil),
          creer('p', { id: 'compte-effacer-texte' }, aEffacer ? remplir(T.effacer_confirmer, { detail: detailProgres(aEffacer, 0) }) : T.effacer_confirmer_vide),
          creer(
            'div',
            { class: 'compte-actions' },
            ...exportDe('compte-exporter-dabord', 'secondaire', true),
            bouton('compte-effacer-ok', T.effacer_bouton, () =>
              void agir(async (c) => {
                await avantEffacement();
                await c.effacerAppareil();
                dire(T.efface);
                await apres(c);
              }), 'danger'),
            bouton('compte-annuler', T.annuler, () => aller('perdue')),
          ),
        ];
      case 'attente':
        return [creer('p', { class: 'hint', id: 'compte-attente' }, T.connexion_en_cours)];
      case 'fusion': {
        const q = question;
        if (!q) return [];
        return [
          creer('h3', {}, T.titre_fusion),
          creer('p', { id: 'compte-fusion-question' }, texteQuestion(q)),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-fusion-ajouter', T.fusion_ajouter, () => repondre?.('ajouter'), 'principal'),
            bouton('compte-fusion-ne-pas', T.fusion_ne_pas, () => aller('fusion-confirmer'), 'danger'),
            bouton('compte-fusion-annuler', T.annuler, () => repondre?.('annuler')),
          ),
        ];
      }
      case 'fusion-confirmer': {
        const q = question;
        if (!q) return [];
        return [
          creer('h3', {}, T.fusion_ne_pas),
          creer('p', { id: 'compte-fusion-confirmer' }, remplir(T.fusion_confirmer, { detail: detailProgres(q.reponses, q.records) })),
          creer(
            'div',
            { class: 'compte-actions' },
            // Sur le site, l'export avant l'effacement (§ 2.3, § 7.2).
            ...exportDe('compte-exporter-dabord', 'secondaire', true),
            bouton('compte-fusion-effacer', T.fusion_effacer, () => {
              // Un export en cours finit d'abord : la réponse efface le journal.
              const r = repondre;
              if (!exportEnCours) return r?.('effacer');
              for (const b of contenu.querySelectorAll('button')) b.disabled = true;
              void avantEffacement().then(() => r?.('effacer'));
            }, 'danger'),
            bouton('compte-fusion-retour', T.fusion_retour, () => aller('fusion')),
          ),
        ];
      }
      case 'deconnexion': {
        const r = reste;
        if (!r) return [];
        return [
          creer('h3', {}, T.titre_deconnexion),
          ...textesDeconnexion(r).map((t, i) => creer('p', { class: 'compte-deconnexion-reste', id: `compte-deconnexion-${i}` }, t)),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-deconnexion-reessayer', T.deconnexion_reessayer, () => void agir((c) => deconnecter(c)), 'principal'),
            // Sur le site, l'export de ce qui serait perdu (§ 3.4, étape 2).
            ...exportDe('compte-exporter-dabord', 'secondaire', true),
            bouton('compte-deconnexion-quand-meme', T.deconnexion_quand_meme, () =>
              void agir(async (c) => {
                await avantEffacement();
                await deconnecter(c, true);
              }), 'danger'),
            bouton('compte-annuler', T.annuler, () => {
              reste = null;
              aller('compte');
            }),
          ),
        ];
      }
      case 'sans-compte':
        return [
          creer('p', {}, T.continuer_sans_confirmer),
          creer(
            'div',
            { class: 'compte-actions' },
            bouton('compte-sans-compte-ok', T.continuer_sans_bouton, () =>
              void agir(async (c) => {
                await c.continuerSansCompte();
                dire(T.sans_compte);
                await apres(c);
              }), 'principal'),
            bouton('compte-annuler', T.annuler, () => aller('perdue')),
          ),
        ];
    }
  }

  /** L'écran de l'état du compte (formulaire refermé). */
  function ecranDe(e: EtatCompte): Ecran {
    return e.etat === 'compte' ? 'compte' : e.etat === 'perdue' ? 'perdue' : e.etat === 'suppression' ? 'suppression' : 'invite';
  }

  function annuler(): void {
    effacerAvis();
    aller(etat ? ecranDe(etat) : 'chargement');
  }

  /** Après une action réussie : l'état relu, son écran montré. */
  async function apres(c: Comptes): Promise<void> {
    etat = await c.etat();
    await lirePerdue();
    await lireSynchro();
    aller(ecranDe(etat));
  }

  /** Les séances pas encore acceptées du dernier compte (sans réseau : le journal et les lots de l'appareil). */
  async function lirePerdue(): Promise<void> {
    if (etat?.etat !== 'perdue' || !o.envoi) return;
    try {
      seancesPerdue = (await (await o.envoi()).compter(etat.uid)).nonEnvoyees;
    } catch {
      seancesPerdue = null;
    }
  }

  /** L'état relu (ouverture, retour au premier plan, session perdue en cours de route). */
  async function rafraichir(): Promise<void> {
    if (occupe) return;
    if (!etat) aller('chargement');
    try {
      const c = await o.comptes();
      if (!abonne) {
        abonne = true;
        c.surChangement(() => {
          if (active && !occupe) void rafraichir();
        });
      }
      const avant = etat?.etat;
      const avantSuppression = etat?.etat === 'suppression' ? JSON.stringify(etat) : null;
      etat = await c.etat();
      await lirePerdue();
      await lireSynchro();
      // Un pseudo remplacé par celui du compte à une ouverture de l'appli, que personne n'a lu : dit ici, une fois.
      const ancien = etat.etat === 'compte' && !message.textContent ? prendreAvisPseudo(stockageDeLaPage()) : null;
      if (ancien) dire(remplir(T.pseudo_du_compte, { pseudo: lirePseudo() ?? '' }));
      // Un formulaire ouvert reste tel quel, saisie comprise (retour d'une autre appli), sauf
      // si l'état a changé sous lui.
      const formulaireOuvert = ECRANS_GARDES.has(ecran);
      // Une reprise de suppression dont la session vient de se perdre (ou de revenir) : son écran change.
      const suppressionChangee = avantSuppression !== null && avantSuppression !== JSON.stringify(etat);
      if (!formulaireOuvert || avant !== etat.etat || suppressionChangee) aller(ecranDe(etat));
      else rendreSynchro();
    } catch (e) {
      montrerErreur(e);
      if (!etat) aller('echec');
    }
  }

  const premierPlan = () => {
    if (active && (typeof document.visibilityState !== 'string' || document.visibilityState === 'visible')) void rafraichir();
  };

  return {
    activer() {
      active = true;
      effacerAvis();
      section.hidden = false;
      ctx.carte.masquer(true);
      document.addEventListener('visibilitychange', premierPlan);
      void rafraichir();
    },
    desactiver() {
      // La vue quittée pendant la question de fusion : « Annuler » (le compte n'est pas pris, et
      // l'appel des comptes ne reste pas suspendu).
      repondre?.('annuler');
      // Les nombres de ces écrans vieillissent (une séance jouée, un envoi fait) : à la réouverture,
      // l'écran du compte, et ils seront recomptés.
      if (ecran === 'deconnexion' || ecran === 'effacer') {
        reste = null;
        aEffacer = null;
        ecran = etat ? ecranDe(etat) : 'chargement';
      }
      active = false;
      section.hidden = true;
      ctx.carte.masquer(false);
      document.removeEventListener('visibilitychange', premierPlan);
    },
  };
}
