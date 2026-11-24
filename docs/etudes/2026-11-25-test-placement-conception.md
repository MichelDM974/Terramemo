# Test de placement « Je connais déjà » : conception (25/11/2026, #35)

*Faite seule, de nuit, par un agent, sans relecture adverse ni réponse de
l'utilisateur. Elle est à relire et à trancher avant tout code.*

**Numérotation.** La dernière étude du dépôt (fiche d'un lieu) s'arrête à
D61 et S64. D'autres études s'écrivent la même nuit (J4, J5, J6,
multijoueur, saisie libre) et peuvent reprendre à D62 et S65. Pour ne
heurter aucune d'elles, celle-ci prend une plage à part : **D350 à D362** et
**S350 à S357**.

**Conventions** (celles des études du J2 et de la fiche d'un lieu).
**Mesuré** : commande lancée ou fichier lu, avec fichier:ligne. **Estimé** :
jugement ou modèle. Tailles : S (moins d'une demi-journée), M (une
demi-journée à deux jours), L (plus). Les chemins de code sont relatifs à
`src/`, au commit `a3d08a0` de `main`. Les scripts de mesure sont hors du
dépôt, dans `~/Sauvegardes/terramemo/test-placement/` (§ 12).

## Résumé

Un joueur qui connaît déjà une région ne devrait pas attendre que ses
grappes s'ouvrent une par jour. Il passe donc un **test court**, dans la
série de son choix (Europe, Afrique…, ou les 50 océans et mers) : une suite
de questions **Trouver**, où l'on touche le lieu demandé. Chaque bon premier
toucher fait entrer le lieu dans la mémoire avec la note **Easy**. Le lieu
revient alors dans 8 jours, au lieu de 3 par une grappe (mesuré, § 3.1).
Un lieu raté ne reçoit aucune note : il reste à apprendre, et les lieux
ratés de la série forment ensemble les prochaines grappes.

Le test n'écrit au journal que des formes d'événement qui existent déjà
(`reponse`, mode `rappel`, aide `connu`, note 4 ; ou mode `libre` sans
note). Il ne demande donc ni format nouveau, ni règle Firestore, ni
migration. Un ancien APK rejoue exactement le même état.

Ce que le test fait gagner (estimé, simulation grossière du § 3.3) : un
joueur qui connaît 90 % des pays et passe le test des 195 a tous ses pays
dans la mémoire **au jour 4, au lieu du jour 32**, et fait 22 % de questions
de moins sur 90 jours (1 640 contre 2 111). Sa charge ne dépasse pas
75 questions par jour (≈ 8 min). C'est à condition de trois réglages de la
mémoire (D354 à D356). Sans eux, le même test ne fait gagner que 2 jours.

Les choix qui comptent vraiment :
1. **D350 et D351, la forme et la portée** : des questions Trouver,
   vérifiées par le toucher, sur une série entière (1 à 5 minutes, 20 pour
   « Tous les pays »), qu'on peut arrêter à tout moment. Plutôt qu'un simple
   bouton « Je connais déjà » par lieu, sans vérification.
2. **D352, la note d'un bon toucher : Easy.** C'est la lettre du plan
   (« Je connais déjà » et test de placement → première note Easy) et la
   règle de `note.ts`. Elle est **figée dans le journal** : elle ne se
   change plus après la mise en ligne.
3. **D353, un raté reste à apprendre**, sans note, au lieu d'entrer comme un
   échec (Again). Lui aussi est figé dans le journal.
4. **D354 et D355, le test hors du budget des grappes**, et les ratés
   regroupés en grappes de rattrapage. Le premier s'écarte de la lettre de
   la décision « Apprendre et Révision du jour » : il faut l'accord de
   l'utilisateur.
5. **D356, le sens « Reconnaître » des lieux placés** : il vient comme
   aujourd'hui, 15 par jour, mais après les autres et sans bloquer les
   grappes. Cela précise la décision « Répétition espacée des nouveaux
   sujets » (règle du reliquat).
6. **D357, le prérequis des capitales et drapeaux (D39)** : garder la
   préférence actée, et proposer le test dans son conseil, plutôt que de
   passer au prérequis strict.

Le reste (D358 à D362 : sujets, crédit croisé, place dans Jouer, aides et
cadrage, test refait) a une recommandation et un défaut sans enjeu fort.
Tout le tableau est au § 9. Coût estimé : quatre lots, M + M + M + S, soit
2 à 6 jours de travail (§ 8).

| N° | Question | Recommandation | Défaut si rien n'est tranché | Figé à la mise en ligne |
|---|---|---|---|---|
| D350 | Forme du test | a : Trouver, vérifié par le toucher | a | non |
| D351 | Portée et longueur | a : une série entière, arrêtable | a | non |
| D352 | Note d'un bon toucher | a : Easy | a | **oui** (journal) |
| D353 | Sort d'un raté | a : rien au FSRS, il reste à apprendre | a | **oui** (journal) |
| D354 | Test et grappe du jour | a : hors du budget des grappes | **aucun** : a s'écarte de « Apprendre et Révision du jour », T1 attend la réponse | non |
| D355 | Les lieux ratés | a : regroupés en grappes de rattrapage | a | non |
| D356 | Sens Reconnaître des lieux placés | b : après les autres, sans reliquat | **aucun** : b touche la règle du reliquat de « Répétition espacée des nouveaux sujets », T1 attend la réponse | non |
| D357 | Prérequis de D39 | a : garder la préférence, le test dans le conseil | a | non |
| D358 | Sujets | a : les cinq sujets qui ont Apprendre | a | non |
| D359 | Crédit croisé (capitale juste → pays placé) | a : non | a | **oui** (journal) |
| D360 | Place dans Jouer et nom | a : un exercice « Je connais déjà » par série | a | non |
| D361 | Aides et cadrage | a : « Je ne sais pas » seul ; cadrage de la série | a | non |
| D362 | Refaire un test | a : un raté n'est pas reposé le même jour | a | non |

## 1. Contexte

**La demande.** Le ticket #35, sorti du #4 le 16/11 par choix de
l'utilisateur : « un joueur qui connaît déjà une région ou un sujet le dit
par un court test, au lieu d'attendre que les grappes s'ouvrent une à
une ». Fin du ticket : « conception écrite et tranchée, puis test jouable
sur le site et dans l'APK, ses réponses rangées dans FSRS ».

**Ce qui est déjà écrit.**
- `docs/plan.md`, § Pédagogie : « "Je connais déjà" et test de placement →
  première note "Easy" ».
- L'étude de pédagogie du 04/11 (`2026-11-04-pedagogie.md`) s'appuie sur
  Papoušek, Pelánek et Stanislav, « Adaptive practice of facts in domains
  with varied prior knowledge » (EDM 2014) : en géographie, on connaît déjà
  beaucoup avant de commencer. Elle propose « un test de placement court,
  ou un "je connais déjà" », et un « placement rapide (1 à 2 minutes) » dans
  son parcours type.
- L'étude du J1a (`2026-11-06-j1a-conception.md`, § « Je connais déjà ») : le
  bouton de l'étape QCM « saute le QCM, envoie au rappel ; juste → Easy,
  faux → Again. Test de placement au J2 ».
- L'étude du J2, § 12 : la piste « "Je connais déjà" pour toute une région,
  par une partie de Trouver. Chaque bon premier toucher introduit la fiche en
  Easy. Il rendrait possible le prérequis strict de D39 ». D54 a : conçu à
  part, après le quiz.

**Décisions actées qui priment** (registre « terramemo ») :
- « Apprendre et Révision du jour » : au plus une grappe nouvelle par jour et
  par domaine ; « préféré […] à un Apprendre hors budget, qui permettait de
  contourner le rythme en enchaînant les régions » ;
- « Sens "quel est ce pays ?" » : la fiche sœur se révise en carte
  retournée, au plus tôt le lendemain ; « préféré […] au QCM à 4 noms
  compté comme rappel, qui surestime la mémoire » ;
- « Répétition espacée des nouveaux sujets » (D39, D46, D47) : la préférence
  « pays d'abord », jamais un blocage ; au plus 15 introductions
  « Reconnaître » par jour, tous sujets confondus ; la règle du reliquat ;
  « préféré […] à un prérequis strict (qui bloquerait un mois un joueur qui
  connaît déjà les pays, faute de test de placement) » ;
- « Cadrage et disques en séance » : les révisions partent du monde entier,
  sans cadrage par question (« il donnerait la réponse ») ;
- « Comptes » (un document par lot d'une séance, jamais par réponse) et
  « Diffusion » (l'APK est dans les releases GitHub : un appareil peut garder
  une version en retard) ;
- « Objectif quotidien et notification » : abandonnés ; « il reste du J2
  (#4) le test de placement et la justesse des prévisions ».

## 2. Ce qui existe et ce qui manque

| Élément | Existe (`a3d08a0`, vérifié) | Manque |
|---|---|---|
| Bouton « Je connais déjà » | dans le QCM d'une grappe nouvelle : il saute le QCM du lieu, le rappel reste, juste il vaut Easy (`srs/seance.ts:250-257`, `:263`) ; au premier passage seulement (`:253`) ; texte `seance.connais` (`vues/textes.fr.json:900`) | un test hors d'une grappe |
| Note | Easy si juste après l'aide `connu`, Again si faux ; jamais Hard (`srs/note.ts:29-31`) | rien |
| Journal | type `connu` **réservé, sans effet** (`srs/journal.ts:9`, `:31` ; `srs/rejeu.ts:66`, `:83`) ; aide `connu` (`srs/journal.ts:15`) ; une note seulement en mode `rappel` ou `revision` (`:64`, `:111`) ; jamais de note sur un événement autre que `reponse` (`:114`) | rien, si D352 a et D353 a |
| Lots de la synchro | format v1 : listes de rangs figées, « on n'y ajoute qu'à la fin, et jamais pendant que v vaut 1 » (`sync/lots.ts:21-22`) ; `connu` y est déjà (`:53`) ; un `v` inconnu ou une carte refusée rend le lot illisible, gardé dans `a_relire` (`:150-157`) ; 200 événements par lot au plus (`:28`) | rien, si D352 a et D353 a |
| Règles Firestore | la forme du lot seule, pas son contenu (`firestore.rules:308-319`) | rien |
| Rejeu | état par fiche : carte FSRS, jour d'introduction, notes, échecs (`srs/rejeu.ts`, `EtatFiche`) | savoir qu'une fiche est entrée par Easy (D354, D356) |
| Budget des grappes | `GRAPPES_PAR_JOUR = 1` par domaine (`srs/planif.ts:22`) ; une grappe est « commencée » le jour où un de ses lieux a sa fiche `localiser` introduite (`:121-131`) ; une grappe entamée passe avant les autres (`:175`) | une règle pour les lieux placés |
| Introductions « Reconnaître » | `INTRODUCTIONS_PAR_JOUR = 15`, commun (`srs/planif.ts:33`) ; les plus anciennes d'abord (`:261-272`) ; règle du reliquat (`:357`, `:372`) | un ordre et une exemption pour les lieux placés (D356) |
| Prérequis D39 b | `PREREQUIS` capitales et drapeaux → pays (`srs/planif.ts:41`) ; `pretSelon` : les pays de la grappe introduits un jour d'avant (`:191-195`) | rien : un pays placé le jour 0 rend sa grappe prête dès le jour 1 |
| Partie libre | Trouver de Jouer écrit `libre`, note nulle, aide `voir`, `passer` ou rien (`vues/essai.ts:185`, `vues/seance.ts:605`) | rien |
| Jouer | `ModeJeu` : `apprendre`, `localiser`, `nommer` et les épreuves (`vues/arbre.ts:30`) ; Apprendre dans les cinq sujets (`:60`, `:68-81`) ; `DemandeSeance` (`vues/essai.ts:117`) | l'exercice du test, sa demande de séance |
| FSRS | ts-fsrs 5.4.2, rétention 0,9, sans court terme ni flou (`srs/fsrs.ts:26-30`) ; poids par défaut | rien |
| Mesure de justesse | `outils/justesse.mjs` du skill `run-terramemo` ; première mesure du 16/11 (`docs/mesures/justesse/2026-11-16-a37.md`) | un groupe « après un placement » (S351) |
| Simulation de charge | `tests/sim-charge.test.ts` (outil sauté par défaut, `npm run sim:charge`) sur le vrai `programme()` | un scénario « test de placement » (S353) |

**Constat qui simplifie.** Le moteur sait déjà noter un lieu « connu » :
c'est le rappel d'une grappe après « Je connais déjà ». Un test de placement
est donc, pour le journal, une suite de rappels avec l'aide `connu` et sans
QCM. Ce qui manque est ailleurs : dans le budget des grappes et l'ordre des
introductions, qui n'ont jamais vu 40 lieux entrer le même jour.

## 3. Chiffres

### 3.1 Ce que vaut Easy

Mesuré : `node fsrs_intervalles.mjs <projet>`, ts-fsrs 5.4.2 du dépôt aux
`PARAMS_FSRS` (`srs/fsrs.ts:26-30`). Poids par défaut : w0 à w3 = 0,2120 ;
1,2931 ; 2,3065 ; 8,2956. Révisions toutes justes (Good) après la première
note, sauf mention :

| Première note, puis | Jours des révisions | Stabilité après chaque note (j) | Révisions en 30 j / 90 j / 365 j |
|---|---|---|---|
| Easy, puis Good | 8, 47, 200 | 8,3 ; 38,9 ; 153 ; 510 | 1 / 2 / 3 |
| Good, puis Good | 3, 17, 74, 270 | 2,3 ; 13,8 ; 57 ; 196 ; 587 | 2 / 3 / 4 |
| Easy, Again à la 1re révision, puis Good | 8, 9, 13, 23, 48, 105, 225 | 8,3 ; 1,4 ; 3,6 ; 10,3 ; 25 ; 57 ; 120 ; 237 | 4 / 5 / 7 |
| Good, Again à la 1re révision, puis Good | 3, 4, 7, 14, 31, 69, 148, 302 | 2,3 ; 0,6 ; 2,4 ; 7,2 ; 17 ; 38 ; 79 ; 154 ; 286 | 4 / 6 / 8 |

Ce qu'on en tire :
- un lieu placé coûte **une révision le premier mois** au lieu de deux, et
  une de moins sur l'année ;
- sur la carte de la mémoire, il est au seau 3 (7 à 21 j) dès le test, et
  **maîtrisé** (seau 4, stabilité ≥ 21 j, `srs/planif.ts:383`) après sa
  première révision juste, au jour 8. Par une grappe, il l'est au jour 17 ;
- **un Easy de trop coûte peu** : s'il est oublié au jour 8, la fiche
  repart comme après un Good raté (4 révisions le premier mois dans les
  deux cas). Surestimer un lieu au test ne crée donc pas de dette ;
- tous les lieux placés le même jour sont dus **le même jour** (jour 8),
  puisque le flou est coupé pour garder un rejeu déterministe
  (`srs/fsrs.ts:29`). Le plafond de 60 révisions par jour
  (`srs/planif.ts:14`) étale ce pic (§ 3.3).

### 3.2 La longueur d'un test

Mesuré : `node grappes_compte.mts <projet>`, sur `public/geo/pays.json` et
`public/geo/mers.json` avec `grappesPays` et `grappesMers`
(`srs/grappes.ts:263`, `:300`). Le temps est **estimé** à 6 s par question,
l'hypothèse de l'étude du J2 (§ 6.3), à vérifier (S350).

| Série | Lieux | Grappes | Jours d'Apprendre évités au mieux | Test à 6 s |
|---|---|---|---|---|
| Europe | 44 | 7 | 7 | ≈ 4 min 30 |
| Amérique du Nord | 23 | 4 | 4 | ≈ 2 min 20 |
| Amérique du Sud | 12 | 2 | 2 | ≈ 1 min 10 |
| Afrique | 54 | 8 | 8 | ≈ 5 min 30 |
| Asie | 48 | 8 | 8 | ≈ 4 min 50 |
| Océanie | 14 | 2 | 2 | ≈ 1 min 25 |
| Tous les pays | 195 | 31 | 31 | ≈ 19 min 30 |
| Océans et mers | 50 | 7 | 7 | ≈ 5 min |
| La Réunion (communes) | 24 | 4 | 4 | ≈ 2 min 25 |

Capitales et drapeaux ont les séries et les tailles des pays (`vues/arbre.ts:68-81`,
D37 c). Un test d'une série tient donc dans l'ordre de grandeur que l'étude
de pédagogie visait (« 1 à 2 minutes ») pour les petites séries, et dans
celui d'une séance (≈ 5 min, D5 du J1a) pour les grandes. « Tous les pays »
est long : D351 le garde, avec un arrêt à tout moment.

### 3.3 Charge et gain : simulation

**Estimé.** `sim_placement.mjs` (§ 12), un modèle grossier écrit pour cette
étude, sur le modèle de `sim_charge.mjs` du J2. Il ne lance pas le code de
l'appli :
- jour 0, le test : chaque lieu testé est juste avec la probabilité p
  (0,9 par défaut) ; juste, sa fiche `localiser` reçoit Easy ; raté, il
  reste à apprendre ;
- chaque jour : les révisions dues de tous les domaines, les plus en retard
  d'abord, dans le plafond de 60 ; puis les introductions « Reconnaître »,
  15 au plus, tous domaines confondus ; puis, par domaine, une grappe
  nouvelle s'il ne reste ni révision due ni reliquat. Le joueur fait tout,
  chaque jour ;
- rappel tiré selon la probabilité de FSRS ; une grappe juste à 85 %, une
  introduction à 90 % ;
- ni la préférence de D39, ni le plafond de 25 par séance, ni l'île. Les
  tailles de grappes sont les vraies (§ 3.2). Graine 42 (une seconde graine,
  7, donne les mêmes ordres de grandeur).

« Pays entrés » : le jour où tous les pays ont leur fiche `localiser` ;
« deux sens » : leur fiche `nommer` aussi. Questions par jour = révisions +
introductions + 2 par lieu nouveau (QCM puis rappel), hors questions du
test.

| Scénario (pays seuls) | Pays entrés | Deux sens | Pic de questions par jour | Jours au plafond de 60 | Questions sur 90 j |
|---|---|---|---|---|---|
| Sans test (témoin) | jour 32 | 32 | 64 | 0 | 2 111 |
| Test des 195, règles actuelles | 30 | 30 | 75 | 4 | 1 661 |
| … et ratés regroupés (D355 a) | 17 | 17 | 75 | 5 | 1 652 |
| … et Reconnaître après les autres, sans reliquat (D356 b) | **4** | **15** | 75 | 5 | 1 640 |
| … ou second tour du test le jour 1 (D356 c) | 4 | 6 | 60, plus 178 questions de test le jour 1 | 9 | 1 379 |
| … ou plafond à part de 15 (D356 d) | 4 | 14 | 75 | 5 | 1 685 |
| Test de l'Europe (44), règles actuelles | 30 | 31 | 65 | 0 | 2 043 |
| Test de l'Europe, D355 a et D356 b | 26 | 26 | 76 | 0 | 2 051 |
| Test des 195, joueur qui surestime (p = 0,6), règles actuelles | 39 | 40 | 75 | 4 | 1 760 |
| Test des 195, p = 0,6, D355 a, Reconnaître sans reliquat | 19 | 20 | 75 | 3 | 1 838 |

Quatre sujets testés en entier le jour 0 (635 questions de test,
p = 0,9 / 0,8 / 0,7 / 0,8 pour pays, capitales, drapeaux, mers ; 120 jours) :

| Scénario | Pays | Capitales | Drapeaux | Mers | Jours au plafond | Pic |
|---|---|---|---|---|---|---|
| Sans test | 53 (deux sens 60) | 72 | 91 | 15 | 51 | 106 |
| Test, règles actuelles et ratés regroupés | 45 | 56 | 73 | 44 | 44 | 107 |
| Test, D355 a et D356 b | 5 (22) | 30 | 34 (40) | 3 (43) | 54 | 91 |

Lecture :
- **Sans réglage, le test ne fait presque rien gagner** (jour 30 au lieu de
  32). Deux causes, toutes deux dans `srs/planif.ts` :
  - les lieux ratés restent dans leur grappe d'origine, déjà entamée :
    `grappeSuivante` la rend telle quelle (`:175`), si bien que 17 ratés
    répartis dans 15 grappes demandent 15 jours (une grappe par jour,
    `:22`). D'où D355 ;
  - les 178 fiches « Reconnaître » des pays placés passent à 15 par jour,
    soit 12 jours, et tant qu'il en reste, la règle du reliquat (`:357`,
    `:372`) ferme les grappes du domaine. D'où D356 ;
- avec D355 a et D356 b, les pays sont tous entrés au jour 4 : c'est le gain
  que le ticket attend ;
- la charge reste celle de D46 : le pic de 75 questions (≈ 8 min) vient des
  jours 8 à 11, où les lieux placés sont dus ensemble, contre 64 sans test ;
- un joueur qui surestime (60 % de justes) ne s'enfonce pas : il gagne
  encore 13 jours, parce que ses ratés suivent le chemin normal ;
- pour quatre sujets testés d'un coup, le plafond de 60 révisions tient le
  joueur à ≈ 9 min par jour pendant près de deux mois, avec ou sans test : le
  test change ce qu'on révise, pas la charge. Le pic baisse (91 contre 106).
  Les mers entrent plus tard avec le test sans réglage (44 contre 15),
  bloquées par le reliquat des autres sujets : un effet que D356 b corrige ;
- ces chiffres sont ceux d'un modèle. Ils sont à reprendre avec le vrai
  `programme()` dans `tests/sim-charge.test.ts`, au lot T1 (S353).

## 4. Le test proposé

### 4.1 Déroulé

1. **Entrée** (D360) : Jouer › Entraînement › un sujet › une série, puis
   l'exercice « Je connais déjà », à côté d'Apprendre, Trouver et
   Reconnaître. Une ligne dit ce qu'il fait : « Touche chaque lieu que tu
   connais. Ceux que tu trouves du premier coup entrent dans ta mémoire ; les
   autres viendront par Apprendre. »
2. **Questions** : les lieux de la série jamais introduits (ni `localiser`
   ni `nommer` notée, `introduite`, `srs/planif.ts:111-113`), sauf ceux
   ratés au test le jour même (D362). Dans l'ordre des grappes de la série,
   mélangés dans chaque grappe : les régions se suivent, ce qui garde le
   test lisible, sans que l'ordre ne donne la réponse. La forme est celle de
   Trouver (D350 a), avec l'énoncé du sujet : le nom du pays, la capitale,
   l'image du drapeau, le nom de la mer.
3. **Aides** (D361) : « Je ne sais pas » seul, qui compte comme un raté.
   Pas de « Voir », qui montre la réponse.
4. **Cadrage** (D361) : la carte part du cadrage de la série (le continent,
   le monde pour « Tous » et les mers, l'île pour La Réunion), puis reste au
   joueur, comme une révision : aucun cadrage par question.
5. **Rétroaction** : celle de Trouver (le juste en vert, le faux en rouge,
   la distance). Elle montre la réponse d'un raté : c'est pourquoi un raté
   n'est pas reposé le même jour (D362).
6. **Arrêt** : « Terminer » à tout moment ; les réponses données comptent,
   comme dans une séance (`srs/seance.ts:294-298`, décision « Fin d'une
   partie du Chrono »). Le test d'une série se reprend un autre jour sur les
   lieux qui restent.
7. **Bilan** : « 41 pays sur 44 entrent dans ta mémoire. À apprendre :
   Moldavie, Macédoine du Nord, Bosnie-Herzégovine : ils formeront ta
   prochaine grappe. » (Le Kosovo, optionnel dans `public/geo/pays.json`,
   n'est pas dans les 44 pays de l'Europe.)
   Chaque raté est une ligne qui ouvre sa fiche (décision « Fiche depuis le
   bilan »). Un bouton « Apprendre » lance la grappe de rattrapage, dans le
   budget du jour.

### 4.2 Ce que le test n'est pas

- **Pas une épreuve** : ni points, ni classement, ni temps limité. Il est
  dans Entraînement.
- **Pas une révision** : il ne pose jamais une fiche déjà introduite. Pour
  revoir ce qu'on sait, il y a la Révision du jour.
- **Pas un QCM** : un choix parmi 4 ne compte jamais comme rappel
  (décision « Sens "quel est ce pays ?" »). Le sens « Reconnaître » des lieux
  placés vient ensuite, par la carte retournée (§ 6.3).

## 5. Journal et synchro

### 5.1 Ce qu'écrit une réponse

Recommandé (D352 a, D353 a) :

| Réponse au test | Événement | Effet au rejeu |
|---|---|---|
| Juste au premier toucher | `type: 'reponse'`, `mode: 'rappel'`, `aide: 'connu'`, `correct: true`, `note: 4` (Easy), `via` et `zoom` comme Trouver | la fiche `localiser` entre, stabilité 8,3 j, due au jour 8 |
| Faux, ou « Je ne sais pas » | `type: 'reponse'`, `mode: 'libre'`, `aide: 'connu'`, `correct: false`, `note: null`, `reponse` = l'id touché (ou null) | aucun : le lieu reste à apprendre ; la confusion est au journal |

Toutes les réponses d'un test portent le même uuid de séance. Elles partent
en un lot si elles sont 200 ou moins (`sync/lots.ts:28`), soit **une
écriture Firestore** pour un test de « Tous les pays ». C'est la règle de la
décision « Comptes » (un document par lot d'une séance).

Pourquoi ces deux formes :
- elles existent déjà : la première est exactement ce qu'écrit le rappel
  d'une grappe après « Je connais déjà » (`srs/seance.ts:263`,
  `srs/note.ts:31`) ; la seconde est une partie libre, avec une aide déjà
  connue du format ;
- `valider()` les accepte telles quelles (`srs/journal.ts:106-116`) :
  l'aide n'est pas liée au mode, la note est nulle hors FSRS ;
- l'aide `connu` sur une partie libre **marque le raté d'un test** : Trouver
  de Jouer n'écrit jamais cette aide (`vues/essai.ts:185`). Le test du jour
  la relit pour ne pas reposer un raté (D362), et l'outil de justesse pour
  isoler les lieux placés (S351). Le juste d'un test, lui, ressemble au
  rappel d'une grappe après « Je connais déjà » ; une séance sans aucun QCM
  les distingue si l'on en a besoin.

### 5.2 Les autres formes, et pourquoi pas

- **Le type `connu`**, réservé depuis le J1a pour « je connais déjà sans le
  vérifier » (`srs/journal.ts:31`). Il est déjà dans le format v1 des lots
  (`sync/lots.ts:53`) : un ancien client le **lit**, mais son rejeu
  l'ignore (`srs/rejeu.ts:83`). Lui donner un effet aujourd'hui ferait
  diverger les appareils **sans erreur visible** : un ancien APK verrait les
  lieux placés comme jamais vus, les reposerait en grappe, et l'union des
  journaux ne donnerait pas le même état selon la version qui rejoue. Il ne
  porte pas non plus de note (`srs/journal.ts:114`) : il faudrait inventer
  un état FSRS hors de FSRS. Écarté (D352 c).
- **Un mode nouveau `placement`.** La liste des modes est figée tant que
  `v` vaut 1 (`sync/lots.ts:21-22`). Il faudrait passer les lots en v2 : un
  ancien client mettrait alors le lot entier dans `a_relire`
  (`sync/lots.ts:150-157`) jusqu'à sa mise à jour, et ne verrait aucune
  réponse du test. Sûr, mais coûteux (L : le format v2, sa lecture, ses
  tests de synchro) pour ne gagner qu'une étiquette. Écarté (D352 d).
- **Again pour un raté** (la règle du bouton actuel, `srs/note.ts:22-25`).
  Le lieu entrerait comme un échec : revu le lendemain, sans le QCM qui
  l'enseigne, avec une stabilité de 0,2 j (w0). C'est juste dans une
  grappe, où le lieu vient d'être montré ; pas dans un test, où il ne l'a
  jamais été. Écarté (D353 b).

### 5.3 Synchro, `a_relire`, APK en retard

- **Format** : rien ne change. `V_LOT` reste 1 (`sync/lots.ts:26`), les
  règles Firestore ne lisent que la forme du lot (`firestore.rules:308-319`),
  aucune migration.
- **`a_relire`** : aucun lot du test n'y va, sur aucune version, puisque
  chaque carte passe `valider()` d'un ancien client (S352).
- **APK en retard** (une version d'avant le test, sur le même compte) : il
  rejoue **le même état** que le site, fiche par fiche, puisque le rejeu ne
  lit que la note (`srs/rejeu.ts:81-97`). Seule sa **planification** diffère,
  car elle n'a pas les règles de D354 à D356 :
  - le jour du test, il compte les grappes placées comme commencées et
    refuse une grappe nouvelle de ce sujet (`'grappe_faite'`), ou reprend les
    ratés d'une grappe comme une grappe entamée ;
  - il n'a ni grappes de rattrapage, ni l'ordre des introductions de D356.
  Rien n'est perdu ni faussé : la planification n'est pas synchronisée, et
  chaque note qu'il écrit est une note valide. L'écart disparaît à la mise à
  jour.
- **Deux appareils le même jour** : un test passé sur le site, puis
  Apprendre sur l'APK à jour avant que la synchro n'arrive, peut reposer en
  grappe un lieu déjà placé. La règle « une note par fiche et par jour »
  (`srs/rejeu.ts:86`) garde la première. C'est le cas général de la synchro,
  déjà accepté.

## 6. Mémoire

### 6.1 Le budget des grappes (D354)

Aujourd'hui, un lieu dont la fiche `localiser` est introduite le jour j
« commence » sa grappe ce jour-là (`srs/planif.ts:121-131`). Un test de
l'Europe commencerait donc ses 7 grappes : le budget du jour serait pris
(`:371`), et la première grappe qui a un raté passerait pour entamée, à
finir aujourd'hui.

Recommandé : **une fiche entrée par Easy ne commence pas de grappe.** Le
rejeu garde, par fiche, si sa première note était un Easy avec l'aide
`connu` (un champ local d'`EtatFiche`, sans rien au journal). `commenceeLe`
ne compte pas ces fiches. Le test ne prend donc pas la grappe du jour, et
Apprendre reste ouvert après lui.

Cela touche aussi le bouton actuel : une grappe dont **tous** les lieux ont
eu « Je connais déjà » ne compterait plus pour le budget du jour. C'est
juste (le joueur les connaissait tous) et rare.

C'est un écart à la lettre de « Apprendre et Révision du jour », qui
écartait un Apprendre hors budget « qui permettait de contourner le rythme
en enchaînant les régions ». Le test ne contourne pas ce rythme-là : il ne
fait entrer que des lieux trouvés du premier coup, sans QCM, qui coûtent une
révision le premier mois (§ 3.1). Mais l'utilisateur doit l'accepter, et la
réponse se note au registre comme une précision de cette décision.

### 6.2 Les lieux ratés (D355)

Recommandé : **des grappes de rattrapage.** Quand des grappes d'une série
sont entamées depuis un jour d'avant, leurs lieux restants sont regroupés,
par continent, en grappes de 5 à 9 voisins. On réutilise `grappes()`
(`srs/grappes.ts:194`), qui fusionne déjà les petits groupes par proximité,
sur les seuls lieux restants. La fonction reste pure et déterministe : deux
appareils de même version font les mêmes grappes. La règle vaut pour toute
grappe entamée et quittée, pas seulement après un test. Dans le cas courant
(une seule grappe quittée en plein rappel), elle ne change rien : ses lieux
restants forment une seule grappe, comme aujourd'hui.

Sans elle, les ratés passent à un ou deux par jour (§ 3.3).

### 6.3 Le sens « Reconnaître » des lieux placés (D356)

Le test ne fait entrer que la fiche `localiser`. La fiche sœur `nommer`
vient au plus tôt le lendemain (décision « Sens "quel est ce pays ?" »),
par la carte retournée, dans le plafond commun de 15 par jour (D46).
Placer 178 pays d'un coup crée donc 178 introductions en attente, soit
12 jours, pendant lesquels la règle du reliquat ferme les grappes du
domaine.

Options (D356) : a) rien ne change ; b) les fiches `nommer` des lieux
placés passent **après les autres**, dans le même plafond de 15, et **ne
déclenchent pas** la règle du reliquat ; c) un second tour du test, dans le
sens Reconnaître, ouvert dès le lendemain dans le même exercice : la carte
retournée de chaque lieu placé, hors plafond ; d) un plafond à part de 15
pour les lieux placés.

Recommandé : **b**. La charge reste celle de D46 (15 introductions par jour
au plus), les grappes des lieux à apprendre ne sont jamais retenues, et
rien ne s'ajoute à l'écran. La règle du reliquat a été posée pour qu'un
reliquat ne grossisse pas sans fin (étude J2 § 6.1) ; celui des lieux placés
est borné, puisqu'il ne vient que d'un test. C'est une précision de la
décision « Répétition espacée des nouveaux sujets », à noter au registre.

L'option c donne le plus de gain (deux sens au jour 6), mais elle repose
sur l'auto-évaluation (« Je savais »), là où FSRS est le plus optimiste sur
le journal de l'A37 : −4,9 points pour la carte retournée, −12,7 après un
échec (`docs/mesures/justesse/2026-11-16-a37.md`). Elle ajoute aussi un
second écran au test. À reprendre si le goutte-à-goutte paraît trop lent à
l'usage.

### 6.4 Le prérequis des capitales et drapeaux (D357)

La décision actée garde une **préférence** (D39 b) : Apprendre Capitales ou
Drapeaux prend d'abord une grappe dont les pays sont appris, sinon la
suivante, avec un conseil. Elle a écarté le prérequis strict « qui
bloquerait un mois un joueur qui connaît déjà les pays, faute de test de
placement ». Le test lève cet argument : une grappe dont tous les pays sont
placés le jour 0 est prête dès le jour 1 (`pretSelon`, `srs/planif.ts:191-195`).
Une grappe dont un pays a été raté attend, elle, que ce pays soit appris
par sa grappe de rattrapage.

Recommandé pourtant : **garder la préférence**, et ajouter le test au
conseil (« Les pays de cette région ne sont pas encore appris : Pays ›
Afrique › Apprendre, ou "Je connais déjà" », `vues/textes.fr.json:264`,
`:284`, `:304`). Raisons :
- le strict bloquerait encore qui veut les drapeaux avant les pays, et le
  test demanderait 5 min de plus avant de pouvoir commencer ;
- la préférence suffit déjà à éviter les « Again » d'un drapeau posé avant
  son pays (§ 6.2 du J2) dès que les pays sont placés.

### 6.5 Les sujets (D358, D359)

Le test se joue sous Trouver, qui existe dans les cinq sujets
(`vues/arbre.ts:68-81`) ; rien n'est propre à un sujet hormis l'énoncé, déjà
rendu par sujet (`vues/sujets.ts`).
- **Pays, Capitales, Drapeaux** : les séries des pays. Pour Capitales, les
  9 pays au nom de leur capitale (D37 c, `srs/fiches.ts:63`) sont posés au
  test (ils sont en Trouver) et n'auront jamais de fiche `nommer` : rien de
  plus à faire, `introductions()` les saute déjà (`srs/planif.ts:266`).
- **Océans et mers** : la série unique de 50, sans prérequis.
- **Communes** : 24 communes, 4 grappes ; le test fait gagner 4 jours au
  plus. Il ne coûte rien de plus, puisqu'il est générique.

Le **crédit croisé** (D359) : une capitale trouvée prouve qu'on sait où est
le pays, puisqu'on touche le pays. On pourrait placer aussi `pays:X:localiser`.
Recommandé : non. Un sujet reste indépendant (décision « Répétition espacée
des nouveaux sujets ») ; une réponse n'écrirait plus une seule fiche ; et le
test des pays d'un continent ne prend que 1 à 5 minutes.

## 7. Tests

- **`srs-rejeu`** : la marque « entrée par Easy » ; inchangée par une note
  suivante ; effacée par `reinitialiser`.
- **`srs-planif`** :
  - un test de l'Europe ne prend pas la grappe du jour (D354) ;
  - les ratés de trois grappes forment une grappe de rattrapage de 5 à 9,
    du même continent (D355) ; une seule grappe quittée garde ses lieux
    restants, comme aujourd'hui ;
  - les fiches `nommer` des lieux placés passent après les autres et
    n'entraînent pas `'introductions'` (D356 b) ;
  - `pretSelon` : une grappe de pays placés le jour 0 est prête le jour 1.
- **`srs-seance`** (le séquenceur du test) : questions Trouver seules,
  jamais de QCM ; un juste écrit `rappel`, `connu`, note 4 ; un faux et
  « Je ne sais pas » écrivent `libre`, `connu`, note nulle, `reponse`
  remplie si un lieu a été touché ; « Terminer » garde les réponses
  données ; un lieu raté ce jour n'est pas reposé.
- **`sync-lots`** : un lot de test (195 événements) fait l'aller-retour
  `encoder` / `deplier` à l'identique ; il passe `problemeLot` (copie des
  règles).
- **`journal-union`** : l'union d'un journal de test et d'un journal
  d'APK qui a appris le même lieu en grappe le même jour donne le même état
  dans les deux ordres.
- **`jouer`, `sujets`, `seance-vue`** : l'exercice « Je connais déjà » dans
  chaque série d'Entraînement des cinq sujets, absent sous Classé ; le bilan
  et ses lignes de fiche.
- **`sim-charge`** : un scénario « test de placement » sur le vrai
  `programme()` (S353).
- **Pilote** (`driver.py`, skill `run-terramemo`) : `ui_placement`, un test
  de l'Océanie (14 pays) jusqu'au bilan, les événements comptés au journal,
  puis Apprendre sur la grappe de rattrapage.

## 8. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et `npm run
build` au vert, puis par un commit « … (#35) ». Ensuite le déploiement
Hosting, `driver.py smoke` sur le site en ligne et le pilote du lot (skill
`run-terramemo`). Aucun lot ne touche aux règles Firestore ni au format des
lots.

| Lot | Taille | Dépend de | Attend | Critère de fin |
|---|---|---|---|---|
| T1. Mémoire : entrée par Easy, rattrapage, introductions | M | — | D354, D355, D356 | les tests `srs-planif` du § 7 ; la simulation du vrai `programme()` refaite (S353) |
| T2. Séquenceur du test | M | — | **D352, D353, D359** (figés) ; D362 | les tests `srs-seance`, `sync-lots`, `journal-union` du § 7 |
| T3. Vue, Jouer, bilan | M | T1, T2 | D350, D351, D357, D358, D360, D361 | un test de l'Océanie jouable sur le site, jusqu'au bilan, par le pilote |
| T4. Fin du ticket | S | T3 | — | jouable dans l'APK (A37) ; groupe « après un placement » dans `justesse.mjs` ; S350 à S357 vérifiées ou datées |

### Lot T1. Mémoire : entrée par Easy, rattrapage, introductions

- **Contenu** :
  - un champ local d'`EtatFiche` (nom à choisir, par exemple `connu`) : vrai
    si la première note appliquée était Easy avec l'aide `connu` ;
  - `commenceeLe` l'ignore (D354 a) ;
  - les grappes de rattrapage (D355 a) : une fonction pure dans
    `srs/grappes.ts`, appelée par `vues/seance.ts`, qui a les entités ;
    `grappeSuivante` les reçoit à la place des grappes entamées d'avant ;
  - `introductions()` range les fiches des lieux placés après les autres,
    et `programme()` ne les compte pas dans le reliquat (D356 b) ;
  - le scénario de `tests/sim-charge.test.ts`.
- **Fichiers** : `src/srs/rejeu.ts`, `src/srs/planif.ts`,
  `src/srs/grappes.ts`, `src/vues/seance.ts`, `tests/sim-charge.test.ts`.
- **Tests** : `srs-rejeu`, `srs-planif`, `srs-grappes`, `seance-vue`.
- **Fin** : sur un journal factice de 41 pays d'Europe placés et 3 ratés,
  `programme()` propose dès le jour 1 une seule grappe de rattrapage, faite
  des 3 ratés (moins de 5 : la fusion ne se fait qu'entre lieux restants du
  même continent, et il n'y en a pas d'autres), et les introductions des
  lieux placés ne ferment pas les grappes.

### Lot T2. Séquenceur du test

- **Contenu** : un séquenceur pur, à côté de `Seance` dans
  `src/srs/seance.ts`, ou une sorte de plan de plus : des étapes Trouver
  seules, les événements du § 5.1, « Je ne sais pas », « Terminer », le
  bilan (placés, à apprendre). La liste des ratés du jour, lue dans le
  journal, pas dans l'état rejoué (qui ignore le mode `libre`) : à vérifier
  que la vue a ces événements sous la main (S356).
- **Fichiers** : `src/srs/seance.ts`, `src/srs/note.ts` (rien à changer
  si D352 a : à confirmer par un test).
- **Tests** : `srs-seance`, `sync-lots`, `journal-union`.
- **Fin** : les tests du § 7. C'est le lot où le journal se fige : il ne
  part pas sans réponse explicite à D352, D353 et D359.

### Lot T3. Vue, Jouer, bilan

- **Contenu** : `ModeJeu` gagne l'exercice du test dans
  `AVEC_APPRENDRE` (`vues/arbre.ts:60`), en Entraînement seulement ;
  `DemandeSeance` gagne une sorte (`vues/essai.ts:117`) ; la vue reprend
  celle de Trouver, avec le cadrage de la série au départ (D361) ; le bilan,
  ses lignes de fiche (décision « Fiche depuis le bilan ») et son bouton
  Apprendre ; le conseil de D39 (D357) ; les textes ; le pilote
  `ui_placement`.
- **Fichiers** : `src/vues/arbre.ts`, `src/vues/essai.ts`,
  `src/vues/seance.ts`, `src/vues/textes.fr.json`,
  `.claude/skills/run-terramemo/driver.py`, `SKILL.md`.
- **Tests** : `jouer`, `sujets`, `seance-vue`, `navigation`.
- **Fin** : un test de l'Océanie sur le site en ligne, par le pilote,
  jusqu'au bilan, puis Apprendre sur la grappe de rattrapage. Les libellés
  (nom de l'exercice, phrase d'entrée, bilan) sont montrés à l'utilisateur
  avant la mise en ligne.

### Lot T4. Fin du ticket

- **Contenu** : l'APK (release GitHub, décision « Diffusion ») et un test
  sur l'A37 ; le groupe « après un placement » dans
  `.claude/skills/run-terramemo/outils/justesse.mjs` ; les suppositions.
- **Fin** : le critère du #35 (« test jouable sur le site et dans l'APK,
  ses réponses rangées dans FSRS »).

**Ordre conseillé** : T2 d'abord si D352 et D353 sont tranchés (c'est le
cœur, et il ne dépend de rien) ; T1 en parallèle ; puis T3 et T4. Si une
seule chose doit sortir vite, c'est T2 avec T3 sans T1 : le test marche,
mais ne fait gagner que 2 jours sur les pays (§ 3.3). Ce n'est donc pas un
état à laisser en ligne longtemps.

## 9. Décisions de l'utilisateur

Chaque réponse se note au registre. Une réponse qui contredit une décision
actée la **remplace** (`noter_decision`, `remplace`) ; une précision la
complète. Le « défaut » est ce que le lot code si la ligne n'a pas de
réponse quand il commence. Trois lignes (D352, D353, D359) se figent dans
le journal à la mise en ligne : elles attendent une réponse explicite.
Deux autres (D354, D356) n'ont **pas de défaut** : leur recommandation
modifie une décision actée (« Apprendre et Révision du jour », « Répétition
espacée des nouveaux sujets »), ce que seul l'utilisateur peut faire. Le lot
T1 attend leur réponse, notée au registre (`noter_decision`, `remplace` si
elle remplace la décision), avant d'écrire une ligne.

### Forme et portée

**D350. La forme du test.**
- a) **Des questions Trouver**, vérifiées par le toucher, dans la série
  choisie. Coût : M (T2, T3). Apporte : une preuve, la note la plus forte
  qu'on ait (Easy) sur un fait vérifié ; la forme du § 12 du J2 et du plan.
- b) **Un bouton « Je connais déjà » par lieu**, dans la fiche d'un lieu ou
  sur la carte de la mémoire, sans vérification (le type `connu`). Coût : M,
  plus un état FSRS à inventer (§ 5.2). Perd : la vérification ; un joueur
  qui croit savoir se surestime, et la carte de la mémoire mentirait.
- c) **Des questions Reconnaître** (un nom parmi 4). Contraire à la décision
  « Sens "quel est ce pays ?" » : le QCM ne compte jamais comme rappel.
- d) **Rien de plus que le bouton actuel** du QCM d'une grappe. Coût : rien.
  Mais une grappe par jour reste la règle : le ticket n'est pas rempli.
- Recommandation et défaut : **a**.

**D351. La portée et la longueur.**
- a) **Une série entière** : 12 à 54 lieux (1 à 6 min), 50 pour les mers,
  195 pour « Tous les pays » (≈ 20 min), avec « Terminer » à tout moment et
  une reprise un autre jour sur les lieux restants.
- b) **Une grappe** (5 à 9 lieux, ≈ 1 min) : court, mais il faut 7 à 8 tests
  par continent, et c'est presque le bouton actuel.
- c) **Un sujet entier** d'un bloc (195 questions) : un seul geste, mais
  20 min sans région à choisir.
- d) **a, avec un arrêt proposé** après 5 ratés de suite (« Arrêter ici ?
  Les lieux restants viendront par Apprendre ») : il épargne au joueur qui
  ne connaît pas une région la fin d'un test inutile. Coût : S de plus.
- Recommandation : **a**, et d si l'on veut épargner les ratés en série.
  Défaut : a.

### Journal (figé à la mise en ligne)

**D352. La note d'un bon premier toucher.**
- a) **Easy** (4), écrit comme le rappel d'une grappe après « Je connais
  déjà » : `rappel`, aide `connu`. Lettre du plan et de `note.ts`. Un lieu
  placé revient au jour 8 et coûte une révision le premier mois (§ 3.1).
- b) **Good** (3) : plus prudent (retour au jour 3), mais il coûte une
  révision de plus le premier mois par lieu (178 de plus pour les pays) ; or
  un Easy oublié ne coûte pas plus qu'un Good oublié (§ 3.1).
- c) **Le type `connu`**, sans note : divergence silencieuse d'un ancien
  APK, état FSRS à inventer (§ 5.2).
- d) **Un mode nouveau `placement`** : lots v2, `a_relire` sur les anciens
  clients, L (§ 5.2).
- Recommandation et défaut : **a**. Figé : la note est écrite dans le
  journal (`srs/journal.ts`, « note FSRS figée à l'écriture »).

**D353. Le sort d'un raté.**
- a) **Aucune note** : `libre`, aide `connu`. Le lieu reste à apprendre et
  passera par une grappe, avec son QCM. La confusion reste au journal.
- b) **Again**, comme le bouton actuel : le lieu entre comme un échec,
  revu le lendemain sans avoir été enseigné.
- Recommandation et défaut : **a**. Figé dans le journal.

### Mémoire

**D354. Le test et la grappe du jour.**
- a) **Hors du budget** : une fiche entrée par Easy ne commence pas de
  grappe (§ 6.1). Apprendre reste ouvert après un test. Écart à la lettre
  de « Apprendre et Révision du jour » (à noter au registre).
- b) **Dans le budget** : le test prend la grappe du jour du sujet. Coût :
  rien. Mais les ratés de la première grappe deviennent « la grappe
  entamée du jour », et le joueur ne peut plus rien ouvrir d'autre ce jour.
- Recommandation : **a**. Défaut : **aucun**, T1 attend la réponse (a
  s'écarte d'une décision actée).

**D355. Les lieux ratés.**
- a) **Regroupés** en grappes de rattrapage de 5 à 9 par continent (§ 6.2).
  Coût : S à M (T1). Gain : 13 jours sur le test des 195 (§ 3.3).
- b) **Laissés dans leur grappe** : un ou deux par jour.
- Recommandation et défaut : **a**.

**D356. Le sens « Reconnaître » des lieux placés.** Options a à d du § 6.3.
- Coût / apport (§ 3.3, test des 195) : a) rien à coder, pays entrés au
  jour 30 ; b) S, jour 4, deux sens au jour 15, charge de D46 ; c) M, deux
  sens au jour 6, mais auto-évalué et un écran de plus ; d) S, deux sens au
  jour 14, mais jusqu'à 30 introductions par jour.
- Recommandation : **b**, qui modifie la règle du reliquat de « Répétition
  espacée des nouveaux sujets ». Défaut : **aucun**, T1 attend la réponse.
  c à reprendre si l'attente paraît longue.

**D357. Le prérequis des capitales et drapeaux.**
- a) **Garder la préférence** (D39 b, actée) et proposer le test dans le
  conseil (§ 6.4). Coût : trois textes.
- b) **Passer au strict** (D39 c), comme le J2 le recommandait « une fois le
  test de placement là ». Coût : M. Bloque qui veut les drapeaux d'abord.
- Recommandation et défaut : **a**.

### Sujets et présentation

**D358. Les sujets du test.**
- a) **Les cinq sujets** qui ont Apprendre : Pays, Capitales, Drapeaux,
  Océans et mers, Communes. Le test est générique : rien de plus à coder.
- b) **Pays seul** d'abord, les autres ensuite.
- c) **Les quatre sujets du monde**, sans Communes (4 jours au plus à
  gagner sur l'île).
- Recommandation et défaut : **a**.

**D359. Le crédit croisé.** Une capitale ou un drapeau trouvé place-t-il
aussi le pays ?
- a) **Non** : un sujet, ses fiches. b) **Oui** : `pays:X:localiser` en
  Easy en plus, s'il n'est pas introduit.
- Recommandation et défaut : **a** (§ 6.5). Figé dans le journal.

**D360. La place dans Jouer et le nom.**
- a) **Un exercice de plus** dans chaque série d'Entraînement, à côté
  d'Apprendre : « Je connais déjà ».
- b) **Proposé dans Apprendre**, à l'ouverture d'une grappe : « Tu connais
  déjà l'Europe ? Passe le test. »
- c) a et b.
- Nom : « Je connais déjà » (le ticket, le bouton actuel, le même sens) ;
  ou « Tester mes acquis », « Test de placement ».
- Recommandation et défaut : **a**, « Je connais déjà ». Le libellé est
  montré avant la mise en ligne (T3).

**D361. Les aides et le cadrage.**
- a) **« Je ne sais pas » seul**, compté comme un raté ; la carte part du
  cadrage de la série, puis reste au joueur (§ 4.1).
- b) **« Voir » aussi** : il montre la réponse, donc un raté de plus, sans
  gain.
- c) **Le cadrage de chaque grappe**, comme le rappel d'une grappe : il
  rend le test plus facile, et un Easy moins sûr (décision « Cadrage et
  disques en séance » : pas de cadrage par question en révision).
- Recommandation et défaut : **a**.

**D362. Refaire un test.**
- a) **Un raté n'est pas reposé le même jour** : la rétroaction vient de
  montrer la réponse. Il l'est un autre jour.
- b) **Reposé à volonté** : on placerait en Easy un lieu vu deux minutes
  plus tôt.
- c) **Un test par série et par jour.**
- Recommandation et défaut : **a**.

## 10. Non retenu

- **Un test adaptatif à la Pelánek** (modèle Elo, questions choisies pour
  viser 75 % de réussite, lieux devinés sans être posés) : il placerait des
  lieux jamais vérifiés. À reprendre si l'on calcule un jour la difficulté
  de chaque lieu des réponses de tous les joueurs (plan, § Pédagogie).
- **Placer une région par échantillon** (10 lieux sur 44, puis tous placés
  si 9 sont justes) : même défaut.
- **Un état FSRS synthétique** plus fort qu'Easy (stabilité de 30 jours
  d'emblée) : hors de FSRS, et inutile, puisqu'un lieu placé est maîtrisé
  après sa première révision (§ 3.1).
- **Le test dans la fiche d'un lieu** (« Je connais ce lieu ») : un lieu à la
  fois, c'est le bouton b de D350 ; « Retenir ce lieu » et « Apprendre ce
  lieu » y sont déjà.
- **Le test sous Classé**, avec un score : il deviendrait une épreuve de
  plus, sans rapport avec la mémoire.
- **Rétablir le flou de FSRS** pour étaler les lieux placés dus le même
  jour : le rejeu ne serait plus déterministe ; le plafond de 60 suffit.

## 11. Suppositions à vérifier

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S350 | Une question du test prend ≈ 6 s, comme une question de séance (étude J2 § 6.3), si bien qu'un test d'un continent tient en 1 à 6 min | `duree_ms` des réponses du premier test réel, sur le journal | lot T4 |
| S351 | Easy ne surestime pas un lieu placé : la réussite observée à la première révision (jour 8) reste près des 90 % prévus | `justesse.mjs`, groupe « après un placement » (réponses `rappel` + `connu` d'une séance sans QCM), une fois 50 révisions comptées | lot T4, puis un mois d'usage |
| S352 | Un ancien APK lit chaque lot d'un test sans le mettre dans `a_relire`, et rejoue le même état | test `sync-lots` (`deplier` d'un lot de test) ; un APK d'avant T2 sur le même compte, puis `sauver_journal` | lot T2, puis T4 |
| S353 | Le gain et la charge du § 3.3 tiennent avec le vrai `programme()` : pays entrés en moins d'une semaine après le test des 195, pic sous 80 questions par jour | `tests/sim-charge.test.ts`, scénario « test de placement » | lot T1 |
| S354 | La fusion par continent de `grappes()` donne des grappes de rattrapage de voisins (le rappel peut encore cadrer une région) | les grappes de rattrapage de 17 ratés tirés au hasard, dessinées par le pilote | lot T1 |
| S355 | Un test de « Tous les pays » de 20 min reste fluide sur l'A37 (aucun à-coup de plus qu'un Trouver de 195) | pilote sur le téléphone, critère de saccade | lot T4 |
| S356 | La vue du test a les événements du jour sous la main pour retrouver les ratés (D362), sans relire IndexedDB à chaque question | lecture de `vues/seance.ts` et du module mémoire, à vérifier | lot T2 |
| S357 | Un joueur comprend qu'un raté « viendra par Apprendre » et ne croit pas avoir perdu ses réponses | essai par l'utilisateur sur le téléphone, avec les libellés de T3 | lot T3 |

## 12. Sources et scripts

- **Code lu** (`main`, `a3d08a0`) : `src/srs/` en entier (`fiches.ts`,
  `fsrs.ts`, `grappes.ts`, `journal.ts`, `note.ts`, `planif.ts`,
  `rejeu.ts`, `seance.ts`), `src/sync/lots.ts`, `firestore.rules`,
  `src/vues/arbre.ts`, extraits de `src/vues/essai.ts`, `src/vues/seance.ts`,
  `src/vues/nommer.ts`, `src/vues/textes.fr.json`.
- **Données lues** : `public/geo/pays.json` (195 pays jouables),
  `public/geo/mers.json` (50 zones).
- **Études** : `docs/plan.md` (§ Pédagogie) ; `2026-11-04-pedagogie.md` ;
  `2026-11-06-j1a-conception.md` (« Je connais déjà ») ;
  `2026-11-10-j2-conception.md` (§ 6, § 12, D39, D46, D54) ;
  `2026-11-16-fiche-lieu-conception.md` (§ 5, patron et numérotation) ;
  `docs/mesures/justesse/2026-11-16-a37.md`.
- **Registre** « terramemo » : ticket #35 ; décisions citées au § 1.
- **Source externe** (citée par l'étude de pédagogie, non relue ici) :
  J. Papoušek, R. Pelánek, V. Stanislav, « Adaptive practice of facts in
  domains with varied prior knowledge », Educational Data Mining 2014.
- **Scripts** (`~/Sauvegardes/terramemo/test-placement/`, hors du dépôt) :
  - `fsrs_intervalles.mjs <projet>` : le tableau du § 3.1 (mesuré) ;
  - `grappes_compte.mts <projet>` : grappes par série (mesuré ; Node 24
    lit `src/srs/grappes.ts` sans compilation) ;
  - `sim_placement.mjs <projet> '<scénario JSON>'` : le § 3.3 (estimé). Les
    scénarios et leurs variantes (`nommer` : `flux`, `fluxlibre`, `apres`,
    `apart`, `test`, `hors` ; `regrouper`) sont décrits en tête du script.
