# J1a, MVP des pays : conception (06/11/2026, #2)

Conception à coder sans re-concevoir. Faite le 06/11 par un workflow :
plan, relecture adverse, carte du code ; les corrections de la relecture
sont intégrées ici. Le plan (`../plan.md`) et les décisions du registre
(« Comptes », « Contenu », « Public et modèle », « Écran Jouer », « Noms
des modes », « Nommer », « Toucher sur la terre ferme », « Langue »,
« Points et classement », « Fin d'une partie du Chrono ») priment en cas
d'écart. Fin du ticket : 195 pays jouables au doigt, CI au vert, une
semaine d'usage sans blocage.

Les choix qui reviennent à l'utilisateur sont au § 12 (D1 à D15) et dans
`../questions-j1a.md` (Q1 à Q7). En attendant, le code prend un **défaut
réversible** : une constante nommée, commentée « défaut en attente de
l'utilisateur, #2 ». Rien de visible pour le public avant les réponses :
pas de déploiement ni d'envoi depuis le site tant que D2 (noms), D9, D14
et D15 sont ouvertes.

Résumé des choix :

- ts-fsrs **5.4.2** figé (FSRS-6, synchrone, MIT, sans dépendance),
  appelé avec des **dates synthétiques** tirées du jour local ;
- fiches `<domaine>:<id>:<sens>` ; jour local à 4 h, fuseau stocké dans
  chaque événement ; journal en ajout seul, rejeu pur et déterministe ;
- `src/srs/` pur (aucun DOM, aucun stockage) ; `src/journal/` pour
  IndexedDB (base **`terramemo-journal`**, à part de `terramemo`) ;
- QCM hors FSRS, puis rappel au toucher : première note FSRS ; notes
  Again / Good / Easy, sans Hard ;
- grappes de **5 à 9** pays (sous-régions de l'ONU fusionnées puis
  découpées) ; **une grappe par jour**, faite entière ; grappes de
  communes pour La Réunion ;
- révision ouverte comme une partie, sans adresse dans l'arbre de Jouer ;
- carte de la mémoire en une teinte ambre, posée par
  `explorer.activer()`, retirée par `explorer.desactiver()` ;
- un document Firestore par séance ; garde-fou d'envoi valable en dev, en
  preview et en ligne ;
- le pilote ne vide plus que la base `terramemo` ; release signée avant
  le premier APK qui porte un journal.

## 1. ts-fsrs

| | 5.4.2 (01/09/2026) | 6.0.0 (28/10/2026, `latest`) |
|---|---|---|
| Licence | MIT, sans dépendance | MIT + `@open-spaced-repetition/srs-kit` 1.0.0 (BSD-3-Clause) |
| Modèle | FSRS-6 | FSRS-7 (jours fractionnaires, révisions dans la journée) |
| API | synchrone : `fsrs(generatorParameters(…))`, `createEmptyCard`, `next(card, date, Rating)` | asynchrone : `await DefaultScheduler(…)`, `review({card, grade, now})` |
| Moteur | node ≥ 20 | node ≥ 24 |
| Maturité | ligne 5.x depuis 05/2025 | 9 jours, après 15 bêtas |

- **5.4.2 figée** (D10) : API synchrone, adaptée à un rejeu pur. FSRS-7
  apporte surtout aux révisions dans la journée ; le J1a n'en garde
  qu'une note par fiche et par jour.
- Passer à la 6 ne migre rien : le journal garde les notes brutes, on
  rejoue.
- Le lot 1 lit l'API exacte dans `node_modules/ts-fsrs/dist/*.d.ts` (le
  README de `npm view` est celui de la 6) et mesure le poids ajouté à
  `dist/`.

**Piège : jours UTC.** ts-fsrs 5.4.2 compte `elapsed_days` en jours civils
UTC (`dateDiffInDays` sur `getUTCDate`, `dist/index.mjs` l.227-240). À La
Réunion c'est juste par hasard (0 h UTC = 4 h locale). À New York, une
révision à 20 h (1 h UTC le lendemain) puis une autre à 18 h le jour
suivant (23 h UTC) donne t = 0 : avec `enable_short_term: false`, R = 1 et
la stabilité ne croît pas après une réussite espacée d'un jour local.

**Correction** : `src/srs/fsrs.ts` (seul importateur de ts-fsrs) passe la
date synthétique `new Date(jour × 86 400 000 + 12 h)`. Les écarts de FSRS
sont alors exactement ceux de `jour()`. L'échéance rendue (`card.due`) se
relit en jour : `floor(due / 86 400 000)`.

## 2. Modèle

### Fiches

- Id `<domaine>:<id>:<sens>` : `pays:FRA:localiser`, `pays:FRA:nommer`,
  `communes:97411:localiser`. `split(':')[1]` = `Entite.pays.id` (les 195
  jouables ont un ISO3).
- Jeu de fiches tiré de `idsJouables(donnees)` (monde, plus l'île : D6).
  Un id sans entité est ignoré.
- Sens actifs au J1a : `FICHES_ACTIVES = ['localiser']` (D1).

### Jour local

- `jour(ts, tz) = floor((ts + tz × 60 000 − 4 × 3 600 000) / 86 400 000)`,
  `tz = −getTimezoneOffset()` en minutes (La Réunion : +240).
- `tz` est **stocké dans l'événement** : le rejeu donne le même état sur
  tout appareil.
- Horloge injectée : `maintenant(): {ts, tz}`, en paramètre (comme la
  `date` d'`enregistrerPartie`).
- Vecteurs du test, écrits à la main (jamais tirés de la formule) :

| Fuseau | Instant UTC | Heure locale | Jour local |
|---|---|---|---|
| La Réunion (+240) | 06/11 23:59 | 07/11 03:59 | 06/11 |
| La Réunion (+240) | 07/11 00:00 | 07/11 04:00 | 07/11 |
| New York (−300, heure d'hiver) | 07/11 08:59 | 07/11 03:59 | 06/11 |
| New York (−300) | 07/11 09:00 | 07/11 04:00 | 07/11 |

### Journal en ajout seul

```ts
interface Evenement {
  v: 1; id: string /* crypto.randomUUID */; appareil: string /* uuid, localStorage terramemo.appareil */;
  ts: number; tz: number; seance: string | null;
  type: 'reponse' | 'connu' | 'reinitialiser';           // extensible par `type` et `v`
  fiche: string;
  mode?: 'qcm' | 'rappel' | 'revision' | 'libre';
  reponse?: string | null;  // id que la carte désigne au 1er toucher, SEULEMENT si faux ; null sinon (juste, mer, passé)
  via?: 'trace' | 'pastille' | 'proche' | null;            // pour une réponse juste (Note.via de pick.ts)
  zoom?: number;            // k de la transformation au 1er toucher
  correct?: boolean; aide?: 'voir' | 'passer' | null;
  duree_ms?: number;        // borné à 120 000 par événement (§ 8)
  distance_km?: number | null;
  note?: 1 | 2 | 3 | 4 | null; // Rating FSRS figé à l'écriture ; null = hors FSRS
}
```

- `reponse` rempli seulement si faux : sur une question Italie juste,
  `pick` peut désigner le Vatican ; le garder ferait de fausses
  confusions. `Resultat` (privé à `essai.ts`) ne garde aujourd'hui que la
  distance du premier toucher faux : le lot 5a y ajoute `reponse`, `via`,
  `zoom`.
- `via` et `zoom` mesurent le biais de Q3 (part des justes « par
  pastille » selon le zoom).
- Note figée à l'écriture : changer la règle plus tard ne réécrit pas le
  passé.

### Rejeu

- `etat(journal, params) → Map<fiche, EtatFiche>`, pur.
- Dédoublonnage par `id`, tri sur `(ts, appareil, id)`.
- Par fiche, seul le premier événement de chaque jour local avec
  `note != null` applique `next(card, dateSynthetique(jour), note)` ; les
  suivants sont ignorés (deux appareils, même fiche, même jour).
- `EtatFiche = {card, introduite_jour, dernier_jour, suspendue}`.
- ~15 000 événements par an, rejoués en quelques ms à l'ouverture. Pas
  d'instantané au J1a.

### Paramètres FSRS (`PARAMS_FSRS`, `src/srs/fsrs.ts`)

| Paramètre | Valeur | Pourquoi |
|---|---|---|
| `request_retention` | 0,9 | défaut FSRS |
| `enable_short_term` | false | une séance par jour ; reprises hors FSRS |
| `enable_fuzz` | false | rejeu déterministe, tests lisibles |
| `maximum_interval` | défaut | |

### Sœurs

`estDue` exclut une fiche dont la sœur a reçu une note FSRS ce jour-là, ou
a été introduite ce jour-là.

### Où vit le journal

- **`src/srs/`** : pur (fiches, jour, journal, fsrs, rejeu, note, planif,
  grappes, séance). Un test vérifie qu'aucun fichier n'y importe le DOM,
  IndexedDB, `localStorage` ni `src/journal/`.
- **`src/journal/`** : `depot.ts` (interface `Depot { ajouter(evts),
  tous(), seancesAEnvoyer(), marquerEnvoyee(id) }`, `depotMemoire()`,
  `depotIndexedDb()`), `appareil.ts` (`terramemo.appareil`).
- IndexedDB : base **`terramemo-journal`**, magasins `evenements` (clé
  `id`, index `seance`) et `envoi` (état d'envoi par séance).
  `navigator.storage.persist()` au premier enregistrement.
- Pas dans la base `terramemo` : `maillage.worker.ts` l'ouvre en version
  1 sans gérer de version plus haute ; une version 2 casserait le cache
  WebGL. Test de non-régression : `terramemo` reste en version 1.
- Tests de contrat communs aux deux dépôts ; IndexedDB par
  `fake-indexeddb` 6.2.7 (Apache-2.0, devDependency figée).

## 3. Étapes d'apprentissage et note

**Apprendre une grappe** (5 à 9 pays, § 5) :

1. **QCM** sur la grappe (forme de Reconnaître : zone allumée, 4 noms).
   Les ratés reviennent en fin de file jusqu'à une réussite, 3 passages
   au plus. `mode:'qcm'`, `note:null`.
2. **Rappel** : un tour de Trouver sur les mêmes pays, mélangés. Le
   premier toucher de chaque pays est la **première note FSRS** de
   `pays:X:localiser`.
3. Faux au rappel : reposé en fin de séance, sans nouvelle note.

**« Je connais déjà »** (bouton de l'étape QCM) : saute le QCM, envoie au
rappel ; juste → **Easy**, faux → Again. Test de placement au J2 (#4).

**Règle de note d'un toucher** (`src/srs/note.ts`, D3) :

| Cas | Note |
|---|---|
| Faux au 1er toucher (toute distance), « Voir », « Passer » | Again (1) |
| Juste au 1er toucher, sans aide | Good (3) |
| Juste après « Je connais déjà » | Easy (4) |

- Pas de Hard : le temps dépend du zoom et des micro-États. Distance et
  temps sont journalisés pour plus tard. `HARD_SI_LENT_MS = null`.
- Un faux proche en Hard surestimerait R (même raison que le QCM hors
  FSRS).

**Fiches `nommer`** : le rappel d'un nom demande la saisie (J1b, #3). D1.

## 4. Séance

**Révision du jour**, un seul bouton :

1. révisions dues (échéance au plus tard le jour local courant), les plus
   anciennes d'abord, id en départage ; régions mélangées ;
2. puis **une grappe nouvelle**, seulement s'il ne reste aucune révision
   due et si la grappe du jour n'est pas encore prise.

**Plafonds** (`src/srs/planif.ts`, D5) :

| Constante | Valeur |
|---|---|
| `REVISIONS_PAR_SEANCE` | 25 |
| `REVISIONS_PAR_JOUR` | 60 |
| `GRAPPES_PAR_JOUR` | 1 (grappe faite entière, 5 à 9 pays) |

- Le budget de nouveautés se compte **en grappes**, pas en pays : une
  grappe n'est jamais coupée (remplace `NOUVEAUX_PAR_GRAPPE = 6` et
  `NOUVEAUX_PAR_JOUR = 8` du plan de travail, incompatibles avec des
  grappes de 5 à 9).
- **Apprendre lancé depuis une série** (Afrique, Europe…) passe par le
  même planificateur : révisions dues d'abord, budget commun
  (`APPRENDRE_PARTAGE_BUDGET = true`, D2). Sinon on contourne les
  plafonds en enchaînant les séries.
- Séance pleine ≈ 5 min ; le reste dû par une seconde séance, depuis le
  même bouton (compte restant affiché).
- **Fin** : file vide ou « Terminer ». Les réponses données comptent et
  la séance s'enregistre avec ce qui est fait (comme « Fin d'une partie
  du Chrono »). Séance quittée puis reprise : `activer()` la reprend.

**Au J1a** : révision du jour, Apprendre, « Je connais déjà », bilan.
**Plus tard** : leurres pondérés par les confusions (`reponse` déjà
journalisé), test de placement (J2), objectif quotidien réglable (J2),
examen de calibrage (J2), suspendre / réinitialiser (`type` réservé),
difficulté a priori des pays.

## 5. Grappes

Fonction pure `grappes(lieux)` (`src/srs/grappes.ts`), dans cet ordre :

1. **Fusionner** chaque sous-région de l'ONU de moins de 5 jouables avec
   la plus proche du même continent (distance entre les moyennes des
   `point`), la plus petite d'abord.
2. **Nombre de paquets** : `k = ceil(n / 8)` ; si `floor(n / k) < 5`,
   `k − 1`. Une sous-région de 9 reste donc **entière** (borne haute 9).
3. **Découpe équilibrée** en `k` paquets voisins, tailles à 1 près :
   parcours en largeur sur `voisins`, ou tri le long du grand axe des
   `point` pour les archipels.
4. Dans une grappe : superficie décroissante.

Sous-régions des 195 jouables et grappes obtenues :

| Continent | Sous-régions (jouables) | Grappes |
|---|---|---|
| Afrique | Southern 5, Northern 6, Middle 9, Western 16, Eastern 18 | 1 + 1 + 1 + 2 (8 + 8) + 3 (6 × 3) = 8 |
| Asie | Eastern 5, Central 5, Southern 9, South-Eastern 11, Western 18 | 1 + 1 + 1 + 2 (6 + 5) + 3 = 8 |
| Europe | Western 9, Eastern 10, Northern 10, Southern 15 | 1 + 2 + 2 + 2 (8 + 7) = 7 |
| Amérique du Nord | Northern America 2 + Central America 8 (fusion : 10), Caribbean 13 | 2 (5 + 5) + 2 (7 + 6) = 4 |
| Amérique du Sud | 12 | 2 (6 + 6) = 2 |
| Océanie | ANZ 2, Polynesia 3, Melanesia 4, Micronesia 5 (14) | 2 (selon la fusion : 6 + 8 ou 9 + 5) |

- ≈ 31 grappes de 5 à 9, chacune dans un seul continent.
- Test : tailles 5 à 9, un seul continent, chaque jouable dans une grappe
  et une seule, sortie identique d'un lancement à l'autre.
- **Communes de La Réunion** (décision « Contenu » : FSRS avec le J1a) :
  `grappes(communes)` donne 4 grappes de 6 communes voisines (même
  découpe par `voisins`, sans sous-région). D6.
  Budget à part (réponse du 06/11, décision « Apprendre et Révision du
  jour ») : une grappe de communes et une grappe de pays nouvelles
  possibles le même jour ; une grappe entamée d'un domaine ne retient ni
  ne précède l'autre.
- Ordre des grappes : D4 (`ORDRE_CONTINENTS`).

## 6. Interface

**Entrée dans Jouer** (décisions « Écran Jouer », « Noms des modes ») :

- en tête d'Entraînement (`corps()` de `jouer.ts`, niveau `sujets`,
  `branche === 'entrainement'`), une ligne `.jouer-ligne#jouer-revision` :
  « Révision du jour », à droite « 12 à revoir · 1 grappe nouvelle » ou
  « À jour » ; poussée dans `boutons` comme `#jouer-rejouer` (désactivée
  pendant un chargement) ;
- **la révision s'ouvre comme une partie** : `nav.ouvrirPartie('toucher')`
  plus le lancement d'une séance, **sans adresse dans l'arbre** de Jouer.
  `#jouer/entrainement/revision` tomberait dans l'espace des sujets
  (`arbre.resoudre()` y lit un sujet inconnu, `vueJouer.aller()`
  canonise vers `jouer/entrainement`). Rejouer ne la relance pas ;
- **Apprendre** devient un exercice d'Entraînement, à côté de Trouver et
  Reconnaître : `ModeJeu` reçoit `'apprendre'`, Rejouer marche sans code
  de plus ; « Apprendre » dans Afrique prend la grappe suivante d'Afrique.
  **Lot 5a : sujet Pays seulement** (`SUR_LA_CARTE` est commun à Pays et
  Communes, `arbre.ts`) ; Communes au lot 5b, avec les grappes de
  communes.

**Enchaînement** : séquenceur pur `src/srs/seance.ts`, machine à états,
file `{fiche, etape: 'qcm' | 'rappel' | 'revision' | 'reprise'}`. Il
pilote les vues existantes sans les dupliquer :

- `vueEssai` et `vueNommer` reçoivent des crochets `surReponse(r)` et
  `surFin(bilan)` (aujourd'hui `Resultat` est privé, `Nommer` n'émet
  rien) et un mode **piloté** (question fournie par le séquenceur, bilan
  remplacé par celui de la séance) ;
- la séance vit dans la vue `toucher` ;
- `essai.ts` ne connaît pas FSRS : le séquenceur traduit `Resultat` en
  `Evenement` par la règle de note.

**Rétroaction** : celle de Trouver (touché en rouge avec contour, cible en
vert, « Faux : X, à N km du bord », retoucher la cible), plus une ligne
discrète en séance : « Revient dans 3 j » ou « À revoir aujourd'hui ».

**Bilan** (`.essai-bilan`) : « Révisions : 18/22 du premier coup » ;
« Nouveaux : Bénin, Togo… » ; ratés avec leur distance ; « Encore 7 à
revoir » avec « Continuer » et « Carte ». Pas de points (« Points et
classement »).

**Textes** : `src/vues/textes.fr.json`, clés `seance`, `memoire`,
`jouer.exercices.apprendre`. Noms nouveaux à valider (D2) : « Apprendre »,
« Révision du jour », « Je connais déjà ». UI selon le skill
`nouveau-projet`, relu avant le lot 5a.

## 7. Carte de la mémoire

- L'accueil (vue Carte) est coloré par `teinter()` : un seau par pays, la
  fiche la plus faible décide.

| Seau | Stabilité S |
|---|---|
| 0 | apprise, < 1 j |
| 1 | 1 à 3 j |
| 2 | 3 à 7 j |
| 3 | 7 à 21 j |
| 4 | ≥ 21 j (maîtrisé, plan) |

- Seuils : `SEUILS_STABILITE_J = [1, 3, 7, 21]`. « Jamais vu » garde
  `--terre` ; le seau 0 doit s'en distinguer nettement.
- **Une teinte ambre**, plus claire avec la mémoire : `--memoire-0` à
  `--memoire-4` dans le `:root` de `src/carte.css`, sans vert, rouge ni
  bleu d'accent, validée par le script du skill `dataviz` (D7).
- **Posée dans `explorer.activer()`, retirée dans
  `explorer.desactiver()`** : toutes les vues partagent
  `ctx.terrains.monde.carte` ; toute autre vue (essai, nommer, chrono,
  séance, île) trouve donc la carte sans teinte, sans code à elle. Une
  teinte en partie trahirait les pays jamais vus.
- **Légende dans un élément à elle** (pas `#barre-carte`, cachée hors
  accueil et réservée au pays touché) : « Jamais vu · faible → maîtrisé ·
  N/195 maîtrisés ».
- Toucher un pays à l'accueil : la barre ajoute « Vu 4 fois · revient
  dans 5 j ».
- Réglage « Carte de la mémoire » dans ⚙, activé par défaut
  (`CARTE_MEMOIRE_PAR_DEFAUT = true`, D7).

**Couche des teintes dans les trois rendus** (lot 3) :

- `teinter(t: ReadonlyMap<string, number> | null)` dans `CarteAffichee` ;
- canvas : un `Path2D` par seau pour les terres **et pour les coutures de
  l'antiméridien** (remplies à part aujourd'hui), au repos comme dans la
  carte allégée des gestes ; frontières : chemin d'union gardé en plus des
  seaux (double tracé) ou tracé par seau, choix mesuré au lot 3 ; version
  des teintes dans la signature du cache ; teinte des pastilles avant les
  marques ; `etatImage().teintes` ; `lireCouleurs` ;
- WebGL : `couleursPays`, sa signature, les pastilles ;
- SVG et île : classes `.s0` à `.s4` dans une liste à part des marques,
  reposées après `rendre()` et sur les pastilles ; CSS avant
  `.pays.choisi` ;
- mesure au pilote (canvas ralenti × 4, 195 pays teintés) **avec une
  rotation au zoom 1** : aucune saccade (décision « Critère de
  saccade ») ; `marquer` seul ne retrace pas la carte.

## 8. Synchro Firestore

**Reportée au J1b le 06/11** (décision « Comptes ») : sans relecture sur un
autre appareil, un envoi n'aurait aucun lecteur, et l'identifiant anonyme se
perd avec l'appareil. La conception ci-dessous sert au J1b (#3, #13), avec la
page de confidentialité et la suppression des données.

**Module** : `charger()` et `compte()` sortent de
`src/epreuve/classement.ts` vers `src/sync/firebase.ts` (exporte `uid()`) ;
le classement l'importe sans changer de comportement.

**Séance** : `joueurs/{uid}/seances/{seanceId}`, ajout seul, `seanceId`
uuid du client (création idempotente : au refus d'un renvoi, `getDoc` dit
si elle existe, comme `publier()`).

| Champ | Contenu |
|---|---|
| `v` | 1 |
| `appareil` | id de l'appareil |
| `fin` | `== request.time` |
| `duree_ms` | entre `n × 200` et `n × 120 000` |
| `mode` | `revision`, `apprendre` ou `libre` |
| `n` | 1 à 200 |
| `justes` | ≤ `n` |
| `evenements` | `n` cartes compactes `{id, t, ts, tz, f, m, r, c, a, d, km, note, via, z}` |

- `t` (type) dans la carte : sans lui, une restauration (J1b) ne rejoue
  pas « connu » ni « reinitialiser ».
- Événements hors séance (parties libres, D11) : chaque partie libre forme
  une séance `mode:'libre'`, envoyée comme les autres.
- Taille : 8 à 10 Ko pour 60 événements (uuid de 36 caractères et noms de
  champs), loin du 1 Mio d'un document.
- **Durée** : chaque événement est borné à 120 s avant la somme. Une
  séance laissée ouverte puis reprise des heures plus tard reste ainsi
  dans la règle.

**Envoi** :

- événements dans IndexedDB d'abord, séance marquée « à envoyer » ;
- envoi en fin de séance, puis à chaque ouverture pour les séances en
  attente ; jamais à chaque réponse ;
- échec réseau : nouvel essai, attente croissante ;
- **refus définitif** (`permission-denied` et `getDoc` : document absent) :
  séance marquée « refusée, gardée en local », plus jamais relancée ;
- un échec ne bloque rien : hors ligne, l'appli reste entière, le journal
  local fait foi.

**Garde-fou anti-production** : `?emulateurs` n'agit qu'en dev
(`import.meta.env.DEV`, `classement.ts`), alors que le skill mesure en
`serve --preview` et que le lot 7 lance `ui` sur le site en ligne. D'où
un interrupteur **lu aussi en production** : `?sans-synchro`, ou le
drapeau `localStorage` `terramemo.sans-synchro` que le driver pose
toujours hors émulateurs. Il coupe l'envoi en dev, en preview et en
ligne. Tests : en dev sans `?emulateurs` rien ne part ; en preview sans
émulateurs, avec le drapeau, rien ne part.

**Site public** : `SYNCHRO_SITE_PUBLIC = false` (D15) : l'envoi n'est actif
que dans l'APK (l'utilisateur seul, release privée) et aux émulateurs, tant
que confidentialité et suppression ne sont pas tranchées.

**Compte anonyme** : décision « Comptes » en vigueur, Auth anonyme **au
premier lancement** (D9). Aujourd'hui le code ne la crée qu'à la
publication d'un score (`compte()`).

**Résumé par joueur** (`joueurs/{uid}`) : le plan l'écrit à chaque séance
(2 écritures). À trancher avant le lot 6 (D8), pas de défaut.

**Règles** (`firestore.rules`, bloc `classements` intact) :
`joueurs/{uid}/seances/{id}` : `read` et `create` si `request.auth.uid ==
uid` et `seanceValide()` (`hasOnly`, `hasAll`, bornes ci-dessus) ; ni
`update` ni `delete` (sauf D15) ; le reste du chemin fermé.

**Tests de règles** (`tests/regles.test.ts`) : refusé sans compte ou avec
un autre uid ; séance valide acceptée ; `update` et `delete` refusés ;
champ en trop, manquant ou mal typé refusé ; `justes > n`, liste plus
longue que `n`, durée trop courte, `fin ≠ request.time` refusés ; test de
cohérence client-règles (modèle de `vraisemblable()`) ; le test « le reste
de la base est fermé » à adapter.

**Quotas Spark** : une écriture par séance (plus les classements, 4 au
plus par épreuve) ; aucune lecture à l'ouverture ; 20 000 écritures par
jour ≈ 15 000 séances en laissant de la place aux classements.

**Lecture au démarrage** : aucune au J1a (l'Auth anonyme part avec le
journal, la restauration est presque impossible).

**Au J1b (#13, #3)** : `linkWithCredential` (Google, e-mail) ; lecture des
`seances` sur un nouvel appareil et union au journal (sans conflit grâce
au dédoublonnage par `id`) ; résumé et instantané ; suppression du
compte ; export JSON.

## 9. Ne pas perdre le journal pendant la semaine d'usage

| Risque | Correction |
|---|---|
| Le driver vide tout le stockage de l'origine mesurée (`Storage.clearDataForOrigin`, IndexedDB compris) avant la répétition 1, sauf `--garder-stockage` : une mesure sur l'A37 effacerait journal et compte anonyme (`firebaseLocalStorageDb`) | Le driver ne supprime plus que la base `terramemo` (`indexedDB.deleteDatabase`, permis par la base à part) ; `SKILL.md` le documente ; un test de `mesure-driver` le vérifie (lot 2) |
| Passer de l'APK de débogage à la release signée impose de désinstaller (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), ce qui efface IndexedDB et l'Auth ; les séances envoyées deviennent orphelines | Clé de release et `android.yml` en release signée **avant le premier APK qui porte un journal** (lot 2 au plus tard, D14) ; sinon dire que tout progrès sur l'APK de débogage sera perdu |
| `androidScheme` et `hostname` changés | Déjà figés et testés (`tests/capacitor.test.ts`) |

## 10. Le reste du jalon

| Élément | Verdict |
|---|---|
| Écran Crédits | J1a, petit. `#credits` (⚙) et le crédit de l'île existent (#15) ; compléter : Natural Earth (domaine public), CLDR (Unicode), IGN (Licence Ouverte 2.0, source et date), ts-fsrs (MIT), d3, topojson, earcut (ISC), Firebase (Apache-2.0), Capacitor (MIT) |
| APK, release privée signée | J1a, avancé au lot 2 (§ 9). L'utilisateur crée la clé et les secrets du dépôt, sauvegarde hors GitHub (D14) |
| `androidScheme`, `hostname` | Déjà fait |
| App Check | Au J1a dans le tableau des jalons de `plan.md` : à trancher avant le lot 7 (D12), pas de défaut |
| Service worker web | Hors du J1a dans les jalons ; D12 |
| Budget du JS | Mesurer `dist/` avant et après ts-fsrs (lot 1) ; test de budget seulement si l'écart est notable |

## 11. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run`, `npm run build`
au vert et un commit « … (#2) ».

| Lot | Contenu | Dépend de | Défauts |
|---|---|---|---|
| 1. Modèle pur | ts-fsrs 5.4.2 figé ; `src/srs/` : fiches, jour, journal, fsrs (dates synthétiques), rejeu, note, planif, grappes. Tests : rejeu invariant par permutation et doublons ; union de deux journaux = rejeu de l'ensemble ; une note par fiche et par jour ; bascule 3 h 59 / 4 h 00 (vecteurs § 2) ; vecteurs FSRS figés à UTC−5 et UTC+4 (Good, Good, Again) ; sœurs ; plafonds ; grappes 5 à 9 ; aucun import DOM/stockage dans `src/srs/` | — | D3, D4, D5, D10, D1 |
| 2. Journal sur l'appareil | `src/journal/` (dépôts, appareil), `fake-indexeddb` ; tests de contrat ; `terramemo` en version 1 ; driver qui ne vide que `terramemo` ; release signée si la clé est là. Fin : au pilote **en `--preview`, deuxième répétition**, `terramemo-journal` présente et cache WebGL servi (`source:'cache'`) ; le worker n'utilise IndexedDB que hors DEV | 1 | D14 |
| 3. Teintes des trois rendus | § 7 ; tests `carte-canvas-dom`, `carte-webgl` (texels, Canvas = WebGL au-delà de 256 entités), `carte-svg-dom`, `style.test` ; mesure avec rotation au zoom 1 | — | D7 |
| 5a. Séance | crochets et mode piloté (`essai.ts`, `nommer.ts`), `Resultat` + `reponse`/`via`/`zoom` ; `src/srs/seance.ts` ; `src/vues/seance.ts` (liaison, bilan, « Je connais déjà ») ; `'apprendre'` pour Pays ; `#jouer-revision` ; révision par `ouvrirPartie` ; textes ; cadrage Q4 en constante. Tests : `jouer.test`, `navigation.test`, premier test DOM de `vueNommer`, `seance.test`, `essai-reprise.test` (séance quittée puis reprise). Pilote `ui_seance` (révision visible, Apprendre Europe jusqu'au bilan, 0,4 s avant chaque toucher, événements = réponses, comptes à jour), documenté dans `SKILL.md` | 1, 2 | D1, D2, D4, D5, D11, Q4 |
| 4. Notation par cible | `src/map/acceptes.ts` (+ `geodata/revendications.json` si Q1 = B) ; `noter()` accepte l'ensemble, distance au bord de l'union ; tests Baïkonour/KAZ, Guantánamo/CUB, Akrotiri et Dhekelia/CYP, Chypre du Nord, Crimée, Somaliland, Sahara, dans les deux sens. Ligne « Juste (…) » de rétroaction au lot 5a, pas ici | réponses Q1, Q2 (et D13) ; après 5a pour `essai.ts` | table vide |
| 5b. Mémoire et communes | `explorer.ts` (teintes à `activer`/`desactiver`, légende, « vu N fois ») ; réglage ⚙ ; grappes de communes et Apprendre sous La Réunion ; bloc des communes dans la révision. Tests `carte-vues.test` (posées à l'accueil, absentes en partie), `jouer.test` ; `ui` : DÉFAUT si une teinte reste en partie ou si la légende manque | 3, 5a | D6, D7 |
| 6. Synchro | § 8 ; règles déployées avant l'appli (`npx firebase deploy --only firestore`) ; tests de l'envoi avec un faux service (hors ligne, refus définitif, renvoi, garde-fou en dev et en preview) ; `npm run test:regles` ; `ui` en `?emulateurs` : un document de séance dans l'émulateur | 2, format de 5a ; **D8, D9, D15 tranchées** | — |
| 7. Fin de jalon | Crédits ; déploiement Hosting depuis un arbre propre, `smoke` et `ui` en ligne **avec `sans-synchro`** ; APK sur l'A37, essai au doigt ; mesure du toucher (médiane < 100 ms) ; une semaine d'usage ; tickets App Check / service worker selon D12 | tous ; **D12** | — |

- Les lots 1 et 3 démarrent ensemble ; 2 suit 1 ; 5a suit 1 et 2 ; 5b et 6
  en parallèle après 5a (5b demande aussi 3) ; 4 après les réponses Q1/Q2
  et après 5a (il touche `essai.ts` et `textes.fr.json` comme 5a), ou
  réduit à `pick.ts` et `acceptes.ts` ; 7 en dernier.

**Non retenu** : instantané FSRS au J1a (rejeu suffisant) ; lecture
Firestore au démarrage ; magasin du journal dans la base `terramemo`
(casse le cache WebGL) ; Hard tiré du temps ou de la distance ; teintes
par `marquer()` (alourdirait la couche du toucher) ; lot 4 livré avec une
table vide en première vague (code mort, conflits avec 5a).

## 12. Décisions en attente de l'utilisateur

**Tranchées le 06/11** (registre : « Apprendre et Révision du jour »,
« Sens "quel est ce pays ?" », « Zones contestées et enclaves », « Cadrage et
disques en séance ») : D2 a, D1 c (carte retournée), Q1 B et Q2 B (épreuves
à partir du lundi 09/11, D13 a), Q4 B (cadrage de la grappe, étendu au
premier QCM), Q5 2 000 km², Q3 A (mesurer d'abord). Codées dans les lots
5a, 4 et 5b ; D3 à D7 et D11 gardent leur défaut. Puis, le 06/11 : D14 a (clé
unique, décision « Signature de l'APK »), synchro au J1b (D8, D9, D15 passent
au J1b, décision « Comptes »), un budget de grappe par sorte de lieu (pays,
communes), Taïwan et Kosovo dans la règle des zones. Reste ouverte : D12
(App Check, service worker).

Rangées par ce qu'elles bloquent. Chaque réponse se note au registre ; une
réponse qui contredit une décision actée la **remplace** (`noter_decision`,
`remplace`). Q1 à Q7 : faits chiffrés dans `../questions-j1a.md`.

### Bloquent l'APK porteur du journal (lot 2)

**D14. Clé de signature de release.**
- Options : a) l'utilisateur crée maintenant la clé et les secrets du
  dépôt (sauvegarde hors GitHub), `android.yml` passe en release signée
  au lot 2 ; b) rester en APK de débogage jusqu'au lot 7, en acceptant de
  perdre tout le progrès de l'APK au passage.
- Coût / apport : a) 15 min de l'utilisateur, aucune perte ; b) rien
  maintenant, journal et compte anonyme effacés à la désinstallation.
- Recommandation : **a**.
- Défaut : aucun possible (la clé est à l'utilisateur) ; pas d'APK porteur
  du journal installé tant que la clé manque.

### Bloquent la synchro (lot 6) et toute mise en ligne

**D15. Confidentialité avant d'envoyer l'historique.** Le J1a enverrait,
pour tout visiteur, ses réponses horodatées (fuseau, id d'appareil). La
décision « Public et modèle » pose politique de confidentialité et
suppression du compte comme conséquences ; le plan les met au J1b.
- Options : a) page de confidentialité minimale + suppression des séances
  (règle `delete` réservée au propriétaire, bouton dans ⚙) au J1a ;
  b) rien envoyé depuis le site public avant le J1b, envoi depuis l'APK
  seul.
- Coût / apport : a) un petit lot de plus (texte, règle, bouton, tests) ;
  synchro de tous dès le J1a. b) rien ; le public n'a que le journal
  local jusqu'au J1b.
- Recommandation : **a** si le site doit synchroniser au J1a ; sinon b,
  sans regret (rien à lire en ligne avant le J1b).
- Défaut : `SYNCHRO_SITE_PUBLIC = false` (APK et émulateurs seulement).

**D9. Moment du compte anonyme.**
- Options : a) premier lancement (décision « Comptes » en vigueur) ;
  b) première séance envoyée.
- Coût / apport : a) chaque visiteur télécharge ~85 Ko gzip de Firebase
  au premier lancement (quota Hosting) ; b) économise ce poids, mais
  remplace une décision actée.
- Recommandation : b, pour le quota Hosting, si l'utilisateur l'accepte.
- Défaut : **a, la décision « Comptes »**. Si b est choisi, remplacer la
  décision avant de coder le lot 6.

**D8. Résumé par joueur (`joueurs/{uid}`).**
- Options : a) écrit à chaque séance, comme le plan (2 écritures par
  séance) ; b) au J1b, quand la restauration le lit.
- Coût / apport : a) double les écritures (quota 20 000 par jour), rien ne
  le lit au J1a ; b) une écriture par séance.
- Recommandation : b.
- Défaut : aucun (écarterait le plan) ; à trancher avant le lot 6.

### Bloquent la fin du jalon (lot 7)

**D12. App Check et service worker.**
- Options : a) App Check au J1a, comme le tableau des jalons ; b) ticket à
  part, avec #5. Service worker : au J1a ou ticket à part.
- Coût / apport : reCAPTCHA v3 non appliqué ne protège rien ; Play
  Integrity demande un plugin natif et sans doute l'appli sur Play (J3) ;
  l'appliquer trop tôt casse l'APK installé. Le service worker ménage le
  quota Hosting, au risque d'un cache périmé.
- Recommandation : b pour les deux.
- Défaut : aucun (App Check est au J1a dans `plan.md`) ; à trancher avant
  le lot 7.

### Bloquent la mise en ligne de la séance (lots 5a, 5b)

**D2. Place d'Apprendre et de la révision, noms affichés.**
- Options : a) Apprendre exercice de chaque série + ligne « Révision du
  jour » en tête d'Entraînement (§ 6) ; b) tout dans la seule ligne de
  révision, grappe suivante dans l'ordre global. Noms à valider :
  « Apprendre », « Révision du jour », « Je connais déjà » (la décision
  « Noms des modes » a été tranchée par l'utilisateur, ceux-ci sont
  nouveaux). Apprendre depuis une série : budget commun et révisions
  d'abord, ou non.
- Coût / apport : a) choix de la région, un exercice de plus par série ;
  b) un seul bouton, aucun choix.
- Recommandation : a, budget commun.
- Défaut : a, ces trois noms dans `textes.fr.json`,
  `APPRENDRE_PARTAGE_BUDGET = true`.

**D1. Fiche `nommer` au J1a** (saisie au J1b).
- Options : a) `localiser` seule dans FSRS, `nommer` au J1b ; b) le QCM à
  4 voisins tient lieu de rappel (R surestimé, refusé par le plan) ;
  c) carte retournée : zone allumée, on pense au nom, « Révéler », puis
  « Je savais / Je ne savais pas » (rappel honnête sans clavier, comme
  Anki).
- Coût / apport : a) rien ; b) peu de code, FSRS faussé ; c) une étape de
  séance et deux boutons, sœur introduite le lendemain.
- Recommandation : c.
- Défaut : a, `FICHES_ACTIVES = ['localiser']` (le modèle gère déjà les
  deux sens).

**D3. Règle de note.**
- Options : a) Again / Good, Easy après « Je connais déjà » ; b) + Hard si
  juste mais lent (> 20 s) ; c) + Hard pour un faux proche (déconseillé).
- Recommandation et défaut : a, `HARD_SI_LENT_MS = null`.

**D4. Ordre des grappes.**
- Options : a) par continent au choix ; dans « Tous les pays » : Europe,
  Amérique du Nord, Amérique du Sud, Afrique, Asie, Océanie, et dans un
  continent les grappes par superficie totale décroissante ; b) grands
  pays d'abord, monde entier ; c) au hasard.
- Recommandation et défaut : a, `ORDRE_CONTINENTS`.

**D5. Rythme.**
- Options : une grappe entière par jour (5 à 9 pays) ou un budget en pays
  qui coupe les grappes ; 25 révisions par séance, 60 par jour.
- Recommandation et défaut : une grappe par jour, jamais coupée ;
  `GRAPPES_PAR_JOUR = 1`, `REVISIONS_PAR_SEANCE = 25`,
  `REVISIONS_PAR_JOUR = 60`.

**D6. Communes de La Réunion dans FSRS** (décision « Contenu » : « avec le
J1a, comme aux pays »).
- Options : a) Apprendre sous La Réunion (4 grappes de 6 communes
  voisines) et révision dans le même bouton, en second bloc après les
  pays (l'île ne se charge que si des communes sont dues) ; b) pas
  d'Apprendre de l'île : seulement des révisions de communes introduites
  par Trouver et Reconnaître (suppose D11 b pour les communes). Un ticket
  à part demanderait de remplacer la décision « Contenu ».
- Recommandation et défaut : a, au lot 5b.

**D7. Carte de la mémoire.**
- Options : teinte ambre (ou or) ou violet ; 5 seaux ; à l'accueil,
  activée par défaut, réglage dans ⚙ ; absente en partie.
- Recommandation et défaut : ambre, 5 seaux, activée,
  `CARTE_MEMOIRE_PAR_DEFAUT = true`.

**D11. Parties libres** (Trouver, Reconnaître, Chrono hors séance).
- Options : a) journalisées hors FSRS (`mode:'libre'`, `note:null`), pour
  les confusions ; b) comptées dans FSRS ; c) ignorées.
- Coût / apport : a) confusions sans fausser R, mais une partie libre qui
  montre la réponse d'une fiche due juste avant l'échéance n'est pas vue
  par FSRS ; b) l'étude « points et classement » (§ 1) proposait que les
  réponses d'épreuve comptent comme révisions (vrai rappel sans aide),
  sans que ce point soit tranché ; une partie libre répétée gonfle R.
- Recommandation et défaut : a, `MODE_LIBRE_JOURNALISE = true`, hors
  FSRS. À revoir pour les épreuves (b possible pour le Chrono seul).

### Bloquent la notation par cible (lot 4)

**Q1. Zones contestées** et **Q2. Enclaves** : faits dans
`../questions-j1a.md`.
- Q1 options : A de fait strict (actuel) ; B juste pour le tenant de fait
  et pour chaque revendiquant (table `revendications.json` d'une
  vingtaine de lignes, `noter` sur l'union, rétroaction « Juste (zone
  contestée, tenue par X) ») ; C revendiquant pour les seules entités
  `conteste`, Crimée à la Russie (incohérent).
- Q2 options : A à part (actuel) ; B table de 4 entrées enclave → hôte ;
  C règle générale (entité non jouable de moins de N px, voisine de la
  cible) ; D fusion au dessin (contredit les frontières de fait).
- Recommandation : Q1 **B** (neutre : « critère neutre pour un public »,
  décision « Pays et frontières ») ; Q2 **B**, C en réserve si le journal
  montre ces faux.
- Défaut : A et A, table vide (`ACCEPTES = {}`).

**D13. Date d'effet de Q1 et Q2 sur les épreuves.** `noter` sert aussi aux
épreuves classées : changer Q1 ou Q2 change les scores d'une semaine en
cours.
- Options : a) partout, à partir d'un lundi (début de semaine du
  classement) ; b) séances seulement, épreuves inchangées ; c) partout,
  tout de suite.
- Recommandation : a.
- Défaut : sans objet tant que la table est vide.

### Ne bloquent rien (constantes, mesure d'abord)

**Q3. Disques des micro-États cibles** : à la question Vatican ou
Saint-Marin, presque tout toucher en Italie au zoom 1 est juste (le disque
de 6,5 px couvre l'essentiel d'une Italie de ~6 px). FSRS surestime le R
des micro-États. Options : A rien, mesurer par `via` et `zoom` ; B disque
plus petit sur un voisin (rayon de toucher 4,5 px au lieu de 6,5) ;
C zoom minimal pour un micro-État cible en séance. Recommandation : A
puis B ou C selon la part de justes « par pastille » au zoom faible.
Défaut : A.

**Q4. Zoom de départ.** Recommandation : B (nouveautés cadrées sur la
grappe au rappel, révisions au monde entier, pas de cadrage par
question). Défaut : `CADRAGE_DEPART = 'aucun'` (A).

**Q5. Seuil des micro-États.** Recommandation : 2 000 km² (Comores, Samoa,
Maurice) ; seuil appliqué dans `aPastille` plutôt que dans
`geodata/build.mjs`, pour ne pas regénérer. Défaut : 1 000 km².

**Q6. Noms.** Recommandation : garder les noms courts ; valider « Île
Brésilienne » (ou « Île Brasilera »). Défaut : noms actuels.

**D10. ts-fsrs.** 5.4.2 (FSRS-6) ou 6.0.0 (FSRS-7). Recommandation et
défaut : 5.4.2 figée ; passage à la 6 sans migration (rejeu).

**Données** : `NE_B62` et `NE_B63` ont `dans: ["ESP"]` alors que leur
point est sous le Maroc (`../questions-j1a.md`, Q1) ; sans effet tant que
`dans` n'est lu par aucun code.
