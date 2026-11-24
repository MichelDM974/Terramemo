# Multijoueur, défi par lien ou partie en direct : conception (25/11/2026, #9)

*Faite seule, de nuit, par un agent, sans relecture adverse ni réponse de
l'utilisateur : à relire et à trancher avant tout code. Code lu sur `main`
à `4525155` (le code est celui de `a3d08a0` : les deux commits suivants ne
touchent que `docs/etudes/`). Rien n'est codé.*

**Numérotation.** La dernière étude validée du dépôt (fiche d'un lieu)
s'arrête à D61 et S64. Deux études de la même nuit ont pris des plages à
part, D350 à D362 (test de placement, #35) et D600 à D649 (J4, #6), et
d'autres s'écrivent encore (J5, J6, saisie libre). Celle-ci prend la plage
**D900 à D949** et **S900 à S949**, qu'aucune autre ne peut heurter ; elle
en utilise D900 à D912 et S900 à S911. On peut renuméroter à la validation.

**Conventions** (celles des études du J2 et de la fiche d'un lieu).
**Mesuré** : commande lancée ou fichier lu, avec `fichier:ligne`.
**Estimé** : jugement ou calcul sur des hypothèses dites. **À vérifier** :
ni mesuré ni lu. Tailles : S (moins d'une demi-journée), M (une
demi-journée à deux jours), L (plus). Les chemins de code sont relatifs à
la racine du dépôt.

Le besoin (ticket #9, 04/11) : « Défier des proches sur l'Auth et Firestore
du J1a, avec les points des épreuves (#14 : un défi est une épreuve dont
deux joueurs comparent le score). Format à trancher : défi par lien (même
série, scores comparés, chacun quand il veut) ou partie en direct. Fin : un
défi joué de bout en bout entre deux appareils, site et APK. »

## Résumé

Je propose le **défi par lien**, et d'abord sa forme la plus simple : **le
lien porte tout**. Après une épreuve classée (Chrono, Sans faute ou quiz
général), le bilan offre « Défier un proche ». Le lien envoyé (par
WhatsApp, SMS…) contient l'épreuve, la **graine** du tirage, une courte
empreinte des questions, puis le nom et le score de chaque joueur qui l'a
déjà relevé. Le proche qui l'ouvre joue **exactement la même partie**
(mêmes questions, même ordre, mêmes leurres), voit son score à côté de
celui de l'autre, et peut renvoyer le lien avec son score ajouté. Ce
format ne coûte **aucune lecture ni écriture Firestore**, se joue hors
ligne, ne met aucune donnée de plus en ligne (la politique de
confidentialité ne change pas), et ne demande aucun serveur, ce que
l'offre Spark interdit de toute façon.

Le code s'y prête déjà : le quiz sait tirer une partie depuis une graine
(`src/quiz/hasard.ts:6`, `src/quiz/tirage.ts:32`), et il suffit de passer
cette graine au mélange du Chrono et de Sans faute
(`src/vues/chrono.ts:259`, qui appelle aujourd'hui `Math.random`).

La **partie en direct** (les deux joueurs en même temps, chacun voyant
l'autre avancer) coûte bien plus : Firestore lite, celui de l'appli, n'a
pas de temps réel (`src/sync/firebase.ts:5-7`). Il faudrait le SDK complet
(environ 450 Ko de plus, estimé) ou un second service (Realtime Database).
Chaque réponse ferait aussi une écriture, ce que la décision « Comptes »
évite partout ailleurs. Chiffré au § 5 : environ **43 écritures et
86 lectures pour un quiz à deux**, contre 0 pour le lien seul et 2 et 6
pour un défi gardé sur Firestore. Le direct tiendrait environ 465 quiz à
deux par jour sur tout le quota, et 50 Chrono du monde entier. Pour jouer
« en même temps » entre proches, le même lien suffit : chacun l'ouvre au
même moment, et les scores se comparent à la fin.

Les choix qui comptent vraiment :
1. **D900, le format** : défi par lien (recommandé), partie en direct, ou
   les deux, le lien d'abord.
2. **D901, où vit le défi** : tout dans le lien (recommandé pour
   commencer), ou un document Firestore par défi, avec un tableau des
   scores que chacun retrouve dans l'appli. Ce second choix fait entrer le
   défi dans les règles, la politique, l'outil du propriétaire et App
   Check (#21).
3. **D903, ce qui fixe la partie** : la graine et une empreinte (lien
   court ; un appareil dont les données diffèrent refuse le défi et le
   dit), ou toutes les questions écrites dans le lien.
4. **D904, le défi et le classement** : les parties de défi des proches
   hors classement et hors records (recommandé), ou le Chrono compté. Une
   graine connue d'avance permettrait sinon de rejouer un quiz jusqu'au
   sans-faute, puis de le publier.
5. **D906, l'écran de connexion** : un proche qui ouvre son premier lien
   voit d'abord le panneau (« Continuer en invité »…), avec une ligne qui
   dit le défi, puis le défi (recommandé, conforme à la décision « Écran de
   connexion »).
6. **D908, l'APK** : le lien s'ouvre dans le navigateur, et l'APK reçoit un
   champ « Coller un lien de défi » (recommandé maintenant). Les liens qui
   ouvrent l'APK (App Links) viendraient avec le Play Store (#5), parce que
   Play App Signing change l'empreinte du certificat.

Coût estimé du format recommandé : trois lots, S + M + S, soit 1,5 à
3 jours (§ 10). Le tableau partagé sur Firestore (D901 b) ajoute un lot M,
la partie en direct un lot L.

| N° | Question | Recommandation | Défaut si rien n'est tranché |
|---|---|---|---|
| D900 | Format | a : défi par lien | a |
| D901 | Où vit le défi | c : le lien seul d'abord, Firestore ensuite si l'usage le demande | a : le lien seul |
| D902 | Épreuves qu'on peut défier | a : toutes les épreuves classées | a |
| D903 | Ce qui fixe la partie | a : graine + empreinte | a |
| D904 | Défi, classement et records | a : hors classement et hors records pour qui relève | a |
| D905 | Essais | a : le premier essai compte, les suivants sont des parties libres | a |
| D906 | Premier lien sur un appareil neuf | a : panneau de connexion avec la ligne du défi, puis le défi | a |
| D907 | Nom dans le lien | a : le pseudo, sinon un prénom tapé pour le défi | a |
| D908 | APK | a : lien ouvert dans le navigateur, « Coller un lien » dans l'APK ; App Links avec #5 | a |
| D909 | Forme de l'adresse | a : un fragment `#defi/…` | a |
| D910 | Partie en direct, si on la veut | d : pas de direct, « à la même heure » par le lien | d |
| D911 | Durée de vie d'un défi en ligne (si D901 b ou c) | a : 30 jours, purgés à la tournée mensuelle | a |
| D912 | Partage | a : bouton Partager, repli « Copier le lien » | a |

## 1. Ce qui existe

### 1.1 Ce que les études et les décisions disent déjà

- « Les mêmes barèmes servent aux défis entre proches (#9) : un défi est
  une épreuve dont deux joueurs comparent le score »
  (`docs/etudes/2026-11-04-points-classement.md:59-60`).
- La pédagogie : « Un défi "même série de questions pour deux personnes"
  est simple ; un classement implique des comptes et de la triche »
  (`docs/etudes/2026-11-04-pedagogie.md:136`). La synthèse le range en
  option de taille S (`docs/etudes/2026-11-04-synthese-agents.md:49`) et le
  recommande « plus tard, par un lien » (`:124`). La critique laisse la
  question ouverte (`docs/etudes/2026-11-04-critique.md:133`).
- Le plan écarte un « défi quotidien façon Worldle »
  (`docs/plan.md:174`) : le défi d'ici est envoyé d'une personne à une
  autre, jamais une partie du jour commune à tous (§ 12).
- Décisions actées qui bornent l'étude :
  - « Hébergement » : Spark seul, jamais d'offre payante. Donc pas de
    Cloud Functions, et aucun serveur pour arbitrer une partie ;
  - « Comptes » : on joue sans compte, l'invité anonyme est créé à la
    demande (publication d'un score) et n'envoie rien ; « jamais par
    réponse (quota de 20 000 écritures par jour) » ;
  - « Barème et classements » : chaque question est juste ou fausse, le
    score est un pourcentage départagé par le temps ;
  - « Quiz général » : une partie compte dès sa première question montrée
    (D55 a) ;
  - « Écran de connexion » : on ne joue pas sans choisir (Google, e-mail ou
    invité) ;
  - « Pseudo d'invité » : Guest-1000, puis Guest-1001…, tiré à la première
    publication, par une transaction ;
  - « Une place par pseudo » et « Clé du pseudo au classement » ;
  - « App Check et service worker hors du J1a » : App Check attend le Play
    Store (#21) ;
  - « Diffusion » : le public n'a que le site jusqu'au Play Store, et l'APK
    est dans la release « android » du dépôt ;
  - « Signature de l'APK » : une seule clé, qui deviendra Play App Signing
    au J3 ;
  - « Morceau JS principal sous 500 Ko ».

### 1.2 Ce que le code fait aujourd'hui (mesuré)

- **Firestore lite, sans temps réel.** `src/sync/firebase.ts:5-7` :
  « Firestore en version lite : requêtes simples, sans cache ni temps réel,
  ~6 fois plus légère, avec runTransaction et writeBatch » ; l'import est
  `firebase/firestore/lite` (`:65`). Aucun `onSnapshot` n'existe dans
  `src/`.
- **Ordre d'une épreuve tiré par `Math.random`.** `src/vues/chrono.ts:259`
  : `const cibles = melanger(ids);`, sans générateur passé, donc
  `Math.random` (`src/vues/cibles.ts:31`). La partie pose ensuite les cibles
  dans cet ordre (`src/epreuve/chrono.ts:59-63`, `PartieChrono`). Sans faute
  hérite de la même classe (`:123`).
- **L'ordre des ids d'une série** est celui de `pays.json`
  (`src/vues/cibles.ts:74-89`, `seriesMonde`) : une graine seule ne
  rejouerait donc pas le même ordre si ce fichier était réordonné (§ 3).
- **Le quiz a déjà son hasard à graine.** `src/quiz/hasard.ts:6`
  (`graine(n)`, mulberry32 sur 32 bits) et `src/quiz/tirage.ts:32`
  (`tirerPartie(gens, d, hasard = Math.random)`) : toutes les étapes du
  tirage (parts, formes, lieux, leurres, indice) passent par `hasard`
  (`src/quiz/generateurs.ts:103-122`, `:202-206`). La vue l'appelle sans
  graine (`src/vues/quiz.ts:221`). Les tests s'en servent déjà
  (`tests/capitales.test.ts:31-32`).
- **Ce qu'une épreuve écrit.** `src/epreuve/classement.ts:43-58`
  (`publier`) : une écriture par place, plus une lecture si les règles la
  refusent. `:69-88` (`numeroInvite`) : une transaction, soit une lecture et
  une écriture, au premier score d'un invité. Les parties d'épreuve
  n'écrivent rien au journal de la mémoire : aucune occurrence de
  « journal » dans `src/vues/chrono.ts` ni dans `src/vues/quiz.ts`
  (`grep -c`), à la différence des parties libres
  (`src/vues/essai.ts:10`).
- **Règles.** Tout ce qui n'est pas listé est fermé (`firestore.rules:12`).
  Les classements vérifient l'épreuve (`epreuveConnue`, `:72-78`) et la
  vraisemblance du score (`scoreValide`, `:148-165`). On peut les reprendre
  telles quelles pour un document de défi (§ 4.2).
- **Navigation par l'ancre.** Une adresse peut être « retenue » derrière
  l'écran de connexion, puis rendue telle quelle une fois le panneau fermé
  (`src/navigation.ts:35-38`) : c'est le chemin d'un lien de défi ouvert
  sur un appareil neuf (D906).
- **APK.** Son activité n'a que le filtre `MAIN` / `LAUNCHER`
  (`android/app/src/main/AndroidManifest.xml:20-23`) : un lien `https://`
  ne l'ouvre pas aujourd'hui. Le plugin `@capacitor/app`, qui porte
  l'événement `appUrlOpen`, est déjà chargé pour le bouton retour
  (`src/retour-android.ts:44-45`).
- **Hosting.** `firebase.json` n'a aucune réécriture : un chemin comme
  `/defi/…` répondrait 404, alors qu'un fragment `#defi/…` tombe sur `/`,
  comme toutes les vues. Firestore est en `eur3` (`firebase.json:42`).
- **Poids** (build du 20/11 dans `dist/assets/`, `ls -la`) : le morceau
  principal fait 498 582 octets, celui de Firestore lite 124 485
  (`index.esm-g6si2MsV.js`), celui d'Auth 127 240. Dans `node_modules`, le
  cœur de Firestore lite fait 340 530 octets non minifiés
  (`@firebase/firestore/dist/lite/common-COCKIFt2.esm.js`), celui du SDK
  complet 1 246 911 (`dist/common-aOCKfaeU.esm.js`), et Realtime Database
  551 023 (`@firebase/database/dist/index.esm.js`).

## 2. Deux formats

### 2.1 Défi par lien (asynchrone)

1. Michel finit un Chrono de l'Afrique : 47/54 en 3 min 03 s. Le bilan
   montre « Défier un proche ».
2. L'appli fait un lien qui dit : l'épreuve (`chrono:localiser:Africa`), la
   graine de **cette** partie, l'empreinte de ses questions, « Michel ·
   47/54 · 3:03 ». Michel l'envoie par le partage du téléphone.
3. Anne touche le lien. Le site (ou l'APK, § 7) ouvre « Michel te défie :
   Chrono · Afrique · 47/54 ». Elle joue la même partie : les 54 pays dans
   le même ordre.
4. Son bilan montre les deux scores, rangés comme au classement (justes,
   puis temps), et « Renvoyer mon score », qui refait le lien avec les deux
   lignes. Michel l'ouvre, voit le score d'Anne, et peut défier un
   troisième proche avec le même lien.

Chacun joue quand il veut. Rien n'attend personne. Un groupe (une famille)
se passe le même lien, qui accumule les scores.

**Variante « à la même heure ».** Deux proches au téléphone, ou dans la
même pièce, ouvrent le même lien en même temps et jouent ensemble. Ils
comparent à la fin, en renvoyant le lien ou de vive voix. C'est l'essentiel
d'une partie en direct, sans rien en direct.

### 2.2 Partie en direct (synchrone)

1. Michel ouvre « Partie en direct », choisit l'épreuve, et reçoit un code
   ou un lien de salle.
2. Anne entre dans la salle. Les deux téléphones voient « Anne est là »,
   puis un compte à rebours commun.
3. Les questions viennent, de deux façons possibles :
   - **au pas** : la question suivante attend que les deux aient répondu,
     ou que le délai soit écoulé. Il faut alors gérer un joueur parti ou un
     écran éteint ;
   - **en course** : chacun avance à son rythme, et une barre montre où en
     est l'autre.
4. Chaque réponse part tout de suite (une écriture), et l'autre téléphone
   la reçoit par un écouteur (une lecture par écouteur).
5. Le bilan commun s'affiche quand les deux ont fini, ou quand l'un a
   quitté la salle.

Ce qu'il faut en plus du défi : une salle et sa présence (qui est là, qui
est parti), un départ commun daté par le serveur, le cas d'un téléphone mis
en veille (la WebView suspendue coupe l'écouteur), la latence entre La
Réunion et l'Europe (`eur3`, à mesurer, S908), un abandon au milieu, et un
SDK temps réel (§ 5.3).

### 2.3 Comparaison

| Critère | Défi par lien, lien seul | Défi par lien, Firestore | Partie en direct |
|---|---|---|---|
| Même série pour tous | oui (graine, § 3) | oui | oui |
| Jouer quand on veut | oui | oui | non : les deux en même temps |
| Voir le score de l'autre | quand il renvoie le lien | dans l'appli, à tout moment | en direct |
| Hors ligne | jouable en entier | la partie oui, l'envoi en file | non |
| Écritures Firestore, partie à 2 | 0 | 2 | ≈ 43 (quiz) à ≈ 393 (Chrono du monde) |
| Données en ligne en plus | aucune | nom, score, date par défi | idem, plus la salle |
| Nouveau SDK | non | non | oui (§ 5.3) |
| Règles, politique, outil du propriétaire | rien | règles, politique, purge, retraits | idem, plus la présence |
| Triche possible | modifier le lien | client modifié (comme le classement) | idem |
| Taille | S + M + S | + M | L |

## 3. Une même partie pour tous : la graine

**Pour le Chrono**, tout le monde joue déjà les mêmes questions : toute la
série, dans un ordre tiré (`points-classement.md:25-27`). La graine ne fixe
que l'ordre. **Pour Sans faute**, l'ordre est tout : la partie s'arrête à
la première erreur, et un pays difficile en 3e position ou en 50e change le
score. **Pour le quiz**, la graine fixe les 20 questions, leurs formes,
leurs leurres et l'indice montré (`src/quiz/tirage.ts:32-54`).

Ce que je propose (D903 a) :
- toute épreuve classée tire d'abord une graine de 32 bits
  (`Math.random`), puis mélange par `graine(n)`. Les parties normales
  restent donc au hasard, mais **chaque partie finie peut devenir un
  défi**, après coup, sans avoir rien prévu ;
- le Chrono et Sans faute **trient les ids** de la série avant de les
  mélanger. L'ordre ne dépend plus alors de celui de `pays.json`
  (`src/vues/cibles.ts:74-89`), qu'un nouveau relevé des données pourrait
  changer ;
- **l'empreinte** est un hachage court (FNV-1a sur 32 bits, 8 caractères
  hexadécimaux) de la liste des questions tirées : ids dans l'ordre, et
  pour le quiz la forme, les choix et l'indice. L'appareil du proche
  refait le tirage depuis la graine et compare. Si les empreintes
  diffèrent (un APK en retard d'un sujet, une notoriété relue, un sujet
  ajouté au quiz), il refuse le défi : « Ce défi vient d'une autre version
  de Terramemo. » Dans l'APK, il ajoute « Mets l'appli à jour » ;
- pour qu'un défi survive à une mise à jour, l'id d'une épreuve ne change
  pas tant que sa formule ne change pas (c'est déjà la règle du quiz,
  `src/epreuve/chrono.ts:269`). Seules les données du tirage comptent.

**Pourquoi pas les questions écrites en entier** (D903 b) : un Chrono du
monde, c'est 195 ids, soit environ 800 caractères de lien. Un quiz demande
20 questions, chacune avec sa forme, ses 4 choix et son indice. Le lien
deviendrait illisible, et les messageries le coupent parfois (à vérifier,
S900). L'avantage de b, survivre à une mise à jour des données, ne compte
qu'entre deux versions. Le site, lui, est toujours à jour.

Ce qui reste à prouver par des tests : `mulberry32` et `melanger`
donnent la même suite dans Chrome, dans la WebView et sous Node. Ils
n'emploient que des entiers de 32 bits (`Math.imul`, `>>> 0`), donc c'est
attendu (S902). Et aucun `Math.random` ne se cache dans un rendu en
épreuve : une capitale montrée en épreuve est « la plus connue, fixe pour
tous » (D38 d), et un drapeau, le premier (décision « Drapeaux contestés et
sosies »). C'est S903, à fixer par un test « même graine, mêmes énoncés ».

## 4. Où vit le défi

### 4.1 Tout dans le lien (D901 a)

Forme proposée (D909 a), à fixer au lot M2 :

```
https://terramemo-geo.web.app/#defi/1.chrono.localiser.Africa.k3f9a2.9c41e0b7/Michel.47.183/Anne.49.201
```

- `1` : version du format du lien ;
- l'épreuve, ses `:` remplacés par des points, et une série à espace
  (`North America`) écrite par un code court ;
- la graine en base 36, puis l'empreinte ;
- une ligne par joueur : nom, justes, temps en secondes. Les questions et
  le pourcentage se déduisent de l'épreuve. Au plus 10 lignes (estimé :
  le lien reste sous 300 caractères).

Ce que ce choix donne :
- **zéro opération Firestore**, et le SDK Firebase n'est même pas chargé
  (un invité ne le charge jamais, décision « Pseudo d'invité ») ;
- **hors ligne** : le lien ouvert sans réseau se joue en entier, car le
  service worker sert la coquille sous `/` et le fragment ne quitte jamais
  l'appareil (S900) ;
- **rien de plus en ligne** : le nom et le score voyagent dans la
  messagerie choisie par le joueur, pas chez Firebase. La politique de
  confidentialité (`public/confidentialite.html:45-60`) ne change pas ;
- **sa limite** : on ne voit le score d'un proche que s'il renvoie le
  lien, et un lien se modifie à la main. Entre proches, c'est un prix
  acceptable, et le classement public n'est pas touché (D904).

### 4.2 Un document Firestore par défi (D901 b)

```
defis/{code}                   épreuve, graine, empreinte, créé (request.time), expire
defis/{code}/scores/{clé}      pseudo, justes, questions, temps_ms, date (request.time)
```

- `code` : 12 caractères tirés au hasard (environ 71 bits), le seul secret
  du défi : qui a le lien le lit.
- Règles (esquisse, à écrire au lot M4 avec `tests/regles.test.ts`) :
  - `allow get: if true; allow list: if false` sur `defis/{code}` :
    personne n'énumère les défis ;
  - `create` : `request.auth != null`, clés fermées (`hasOnly`), épreuve
    connue (`epreuveConnue`, `firestore.rules:72`), graine entière dans
    [0, 2³²), `cree == request.time`, `expire == cree + 30 jours` (D911) ;
    jamais d'`update` ni de `delete` ;
  - `scores/{clé}` : `create` seul (un essai par pseudo, D905), clé du
    pseudo (`cleDuPseudo`, `:216`), vraisemblance (`scoreValide`, `:148`)
    sur l'épreuve lue par `get()` du défi (une lecture de plus), et
    `request.time < expire`. La lecture des scores est permise à qui
    connaît le code.
- Le score du créateur part **dans** le document du défi, à sa création :
  une écriture au lieu de deux.
- Hors ligne : la création et le score attendent dans une file, comme les
  scores du Chrono (`src/vues/classement.ts:23`, `CLE_ATTENTE` ; décision
  « Fin d'une partie du Chrono »).
- Ce qu'il faut de plus :
  - une ligne dans la politique (pseudo, score et date gardés 30 jours) ;
  - la purge des défis expirés par l'outil du propriétaire
    (`scripts/admin/taches.mjs`, à la tournée mensuelle, #29), ou par une
    règle TTL de Firestore (S907) ;
  - les scores de défi du pseudo d'un compte supprimé, couverts sans rien
    de plus si les défis expirent à 30 jours : la politique promet 30 jours
    pour les retraits (`public/confidentialite.html:104-106`) ;
  - une exposition de plus en attendant App Check (#21), comme les
    classements.

**D901 c**, que je recommande, fait 4.1 d'abord. Le lot M4 ajoute 4.2 si
les proches veulent retrouver leurs défis dans l'appli sans se renvoyer de
lien. Le lien garde alors sa forme, et le code du défi s'y ajoute.

## 5. Coût Firestore chiffré

### 5.1 Plafonds et usage

Plafonds de Spark (étude du J1b, § 5.7,
`docs/etudes/2026-11-07-j1b-conception.md:994-996`) : **50 000 lectures,
20 000 écritures et 20 000 suppressions par jour**, 10 Gio de sortie par
mois, 1 Gio stocké. Ces plafonds sont partagés avec la synchro et les
classements. L'usage réel du jour n'est pas relevé ici : la console
(Firestore › Utilisation) le donne (S909). Le 12/11, le classement
comptait 2 joueurs et 9 scores (décision « Ouverture des épreuves d'un
sujet »).

Règles de facturation retenues (documentation de Firestore, « Understand
Cloud Firestore billing », à relire, S905) :
- un `get()` ou un `exists()` dans les règles coûte une lecture ;
- une requête coûte une lecture par document rendu, et une au moins si
  elle ne rend rien ;
- un écouteur (`onSnapshot`) coûte une lecture par document à son
  ouverture, puis une par document changé. Après 30 minutes de coupure, il
  repart comme une requête neuve.

### 5.2 Défi par lien

| Partie | Écritures | Lectures | Détail |
|---|---|---|---|
| Lien seul (D901 a), à 2 ou à 10 | 0 | 0 | rien ne part |
| Firestore (D901 b), à 2 | 2 | ≈ 6 | créateur : 1 écriture (défi et son score). Le proche : lit le défi (1), écrit son score (1, plus 1 lecture par le `get()` des règles), lit les 2 scores (2). Le créateur revient : 2 scores (2) |
| Firestore, à 5 | 5 | ≈ 32 | le i-ème proche lit le défi, le `get()` des règles et i + 1 scores, soit 4 + 5 + 6 + 7 = 22 ; le créateur revient deux fois (2 × 5) |
| Premier score d'un invité, en plus | 1 | 1 | la transaction du numéro Guest-N (`src/epreuve/classement.ts:69-88`) : seulement avec Firestore, car le lien seul ne tire aucun numéro (D907) |

Capacité, si tout le quota du jour allait aux défis : **à 2, environ
10 000 défis par jour par les écritures et 8 300 par les lectures** ; à 5,
4 000 et 1 560. Stockage : environ 0,5 à 1 Ko par défi avec ses scores
(estimé, index compris), soit environ un million de défis par Gio, purgés
à 30 jours.

### 5.3 Partie en direct

Hypothèses : une salle = un document. Chaque joueur écrit chaque réponse
(1 écriture), et chaque joueur écoute la salle (1 lecture par écriture et
par écouteur). Mise en place : création (1 écriture), entrée du second (1
lecture, 1 écriture), deux écouteurs ouverts (2 lectures), l'arrivée vue
par l'hôte (1), le départ (1 écriture, vu par les deux : 2).

| Partie | Écritures | Lectures | Parties par jour sur tout le quota (écritures / lectures) |
|---|---|---|---|
| Quiz, 20 questions, à 2 | 3 + 40 = 43 | 6 + 80 = 86 | 465 / 581 |
| Chrono de l'Afrique, 54, à 2 | 3 + 108 = 111 | 6 + 216 = 222 | 180 / 225 |
| Chrono du monde, 195, à 2 | 3 + 390 = 393 | 6 + 780 = 786 | 50 / 63 |
| Quiz à 4 | ≈ 85 | ≈ 337 (4 écouteurs × 80 réponses, plus la mise en place) | 235 / 148 |
| Quiz à 2 par sondage (Firestore lite, une lecture toutes les 2 s) | 43 | ≈ 255 (250 s au plus en moyen, `firestore.rules:88`) | 465 / 196 |

**Le prix hors quota :**
- **Firestore complet** pour les écouteurs : son cœur fait 3,7 fois celui
  de lite (1 246 911 contre 340 530 octets de sources, § 1.2). Appliqué aux
  124 Ko du morceau lite, on obtient environ 450 Ko minifiés (estimé,
  S904). C'est un morceau à la demande, donc hors du morceau principal,
  mais il pèse sur le quota de Hosting (360 Mo par jour, décision
  « Hébergement ») et sur la 4G. Les deux SDK cohabiteraient, ou lite
  serait remplacé partout (S904) ;
- **Realtime Database**, l'autre voie : facturée au volume et non à
  l'opération. Spark lui donne 100 connexions simultanées, 1 Go stocké et
  10 Go téléchargés par mois (page des tarifs de Firebase, à relire,
  S906). Une partie de quiz y pèse quelques dizaines de Ko (estimé), donc
  le plafond serait les **100 connexions, soit 50 parties à deux en même
  temps**. Il faudrait un second SDK (551 Ko de sources), un fichier de
  règles de plus, `onDisconnect` pour la présence (son point fort), un
  émulateur de plus aux tests (Java, lourd sur le PC), et App Check à y
  appliquer aussi ;
- **le sondage** par lite n'ajoute aucun SDK, mais il paie en lectures
  (tableau) et laisse jusqu'à 2 s de retard ;
- dans tous les cas, une écriture par réponse, ce que la décision
  « Comptes » évite partout ailleurs (« jamais par réponse »).

### 5.4 Synthèse

| Format | Écritures, partie à 2 | Lectures | Plafond pratique |
|---|---|---|---|
| Lien seul | 0 | 0 | aucun |
| Défi sur Firestore | 2 | ≈ 6 | ≈ 8 300 défis par jour |
| Direct, Firestore complet | 43 à 393 | 86 à 786 | 50 à 465 parties par jour |
| Direct, Realtime Database | 0 (Firestore) | 0 | 50 parties à deux en même temps |

## 6. Invités, comptes et pseudo

- **Le lien seul n'a pas besoin de Firebase.** Le nom écrit dans le lien
  est le pseudo de l'appareil s'il en a un. Sinon, le bilan demande « Ton
  nom pour ce défi » (2 à 20 caractères, forme de `formePseudo`,
  `src/epreuve/chrono.ts:680`), gardé sur l'appareil, jamais publié au
  classement (D907 a). Un invité sans pseudo ne reçoit donc pas de numéro
  Guest-N pour un défi : ce numéro reste celui de la première publication
  au classement (décision « Pseudo d'invité »).
- **Avec Firestore** (D901 b), créer un défi est une publication : il faut
  le compte anonyme, comme pour un score (`src/sync/firebase.ts:145-165`,
  `compte`), et le numéro Guest-N s'il n'a pas de pseudo. Les règles
  demandent `request.auth != null`, comme pour les classements.
- **Appareil neuf** (D906) : la décision « Écran de connexion » montre le
  panneau à la première ouverture, et « on n'y joue pas sans choisir ». Le
  lien de défi y est une adresse retenue (`src/navigation.ts:35-38`). Le
  panneau ajoute une ligne, « Michel te défie : Chrono · Afrique ·
  47/54 », puis, une fois le choix fait (souvent « Continuer en invité »),
  la vue du défi s'ouvre. L'option b (le défi d'abord, le panneau après) est
  plus directe, mais elle fait une exception à la décision.
- **Un compte** joue un défi comme un invité : son pseudo va dans le lien.
  Rien n'est synchronisé, puisqu'une partie d'épreuve n'écrit rien au
  journal (§ 1.2). Ce qu'un appareil a joué (le défi déjà relevé, D905)
  reste sur cet appareil.

## 7. Hors ligne, service worker et APK

- **Site hors ligne.** Le service worker sert la coquille sous `/`
  (`src/sw/construction.ts:7`). Une adresse `/#defi/…` s'ouvre donc comme
  la carte, et la partie se joue sans réseau si les données de l'épreuve
  sont en cache. Les drapeaux, eux, attendent leurs images (décision
  « Images d'une épreuve »).
- **APK, D908 a (maintenant).** Le lien s'ouvre dans le navigateur du
  téléphone, où le site se joue : c'est le canal du public jusqu'au Play
  Store (« Diffusion »). Pour jouer dans l'APK, Jouer offre « Coller un lien
  de défi » : il lit le presse-papiers ou un champ, et ouvre la vue.
- **APK, D908 b ou c (App Links).** Il faut :
  - un filtre `VIEW` / `BROWSABLE` avec `autoVerify` sur
    `terramemo-geo.web.app` ;
  - `/.well-known/assetlinks.json` sur Hosting, avec l'empreinte SHA-256
    de la clé unique, puis celle de Play App Signing au J3 ;
  - un **chemin** et non un fragment, car App Links ne filtre pas sur le
    fragment (S910). Donc `/defi/…`, une réécriture dans `firebase.json`,
    et la navigation du service worker sur ce chemin ;
  - `appUrlOpen` de `@capacitor/app` pour lire le lien (déjà chargé,
    `src/retour-android.ts:44`).
  Fait avant le J3, ce travail serait à reprendre pour la clé de Play
  (D908 c : avec #5).
- **Partage** (D912) : le site a `navigator.share` dans Chrome Android.
  La WebView de l'APK ne l'a sans doute pas (S901) : il faudrait le plugin
  `@capacitor/share`, ou le repli « Copier le lien »
  (`navigator.clipboard`, déjà employé par `src/mesure/panneau.ts:75`).

## 8. Triche, App Check, confidentialité

- **Lien seul** : un lien se modifie à la main (« Michel.54.60 »). Rien ne
  peut le signer sans serveur : une clé dans l'appli serait publique (le
  dépôt l'est, décision « Public et modèle »). Entre proches, c'est
  accepté. Le classement public n'en voit rien (D904 a).
- **Graine connue d'avance** : qui relève un défi connaît la partie après
  son premier essai. D'où D904 a (les parties de défi des proches ne
  publient rien) et D905 a (seul le premier essai d'un appareil compte au
  défi ; il est noté sur l'appareil, donc contournable par un autre
  navigateur, ce qui est sans enjeu hors du classement).
- **Firestore** (D901 b) : les mêmes bornes que les classements, et la même
  limite, celle d'un client modifié qui ment de façon plausible
  (`points-classement.md:183-200`). App Check, quand #21 sera fait,
  couvrira aussi `defis/`.
- **Confidentialité** : rien ne change avec le lien seul. Avec Firestore, il
  faut une ligne dans la politique et dans sa vue, ainsi que la durée de
  30 jours (D911).

## 9. Recommandation

1. **Le défi par lien, le lien seul** (D900 a, D901 c, D903 a) : la
   demande du ticket (« même série, scores comparés, chacun quand il
   veut ») pour 0 opération Firestore, jouable hors ligne, sans rien de
   plus en ligne, et sans toucher aux règles, à la politique ni à l'outil
   du propriétaire.
2. **Toutes les épreuves classées** peuvent devenir un défi, depuis leur
   bilan (D902 a). Les proches qui relèvent le défi ne publient rien
   (D904 a), et seul le premier essai compte (D905 a).
3. **Sur l'APK**, un champ pour coller le lien maintenant, et les App
   Links avec le Play Store (D908 a, puis c).
4. **Le tableau sur Firestore** seulement si l'usage le demande (D901 c) :
   il coûte peu en quota (environ 6 lectures et 2 écritures par défi),
   mais il fait entrer le défi dans les règles, la politique, la purge et
   App Check.
5. **Pas de partie en direct** (D910 d) : « à la même heure » par le lien
   donne l'essentiel. Si l'utilisateur la veut quand même, je recommande
   Realtime Database plutôt que Firestore complet (D910 b) : aucune
   opération comptée, et une présence native, au prix d'un second service.

## 10. Lots

Lots du format recommandé : M1, M2, M3. M4 si D901 b ou c, M5 avec le Play
Store, M6 seulement si D910 a, b ou c.

### Lot M1. Une partie à graine (S)

- **Contenu** : la graine de 32 bits de chaque épreuve classée, tirée au
  départ et gardée avec la partie ; le Chrono et Sans faute trient les ids,
  puis les mélangent par `graine(n)` ; le quiz passe la graine à
  `tirerPartie` ; l'empreinte des questions (FNV-1a, 8 caractères). Rien de
  visible : les parties restent au hasard.
- **Fichiers** : `src/epreuve/defi.ts` (nouveau : graine, empreinte),
  `src/vues/chrono.ts` (`demarrer`, ligne 259), `src/vues/quiz.ts`
  (`tirer`, ligne 221), `src/quiz/hasard.ts` (repris, sans changement).
- **Tests** : `tests/defi.test.ts` (nouveau : même graine, même ordre pour
  chaque série du catalogue ; ordre indépendant de celui de `pays.json` ;
  même graine, même quiz, choix et indice compris, sur des données fixées ;
  graines voisines, parties différentes ; empreinte stable et sensible à un
  id changé) ; `tests/chrono-vue.test.ts` et `tests/quiz-vue.test.ts` (la
  partie lancée porte sa graine) ; S902 et S903.
- **Fin** : une graine rejoue la même partie, testée en CI.

### Lot M2. Le lien de défi (M)

- **Contenu** : le bouton « Défier un proche » au bilan d'une épreuve
  classée ; le nom (D907) ; le lien (format du § 4.1, D909) ; la vue
  `#defi/…` : l'en-tête du défi (« Michel te défie… »), le refus d'un lien
  abîmé ou d'une autre version (empreinte), la partie en mode défi (sans
  publication, sans record, D904), le bilan comparé, « Renvoyer mon
  score » ; le premier essai noté sur l'appareil (D905) ; la ligne du défi
  sur l'écran de connexion (D906) ; le partage (D912).
- **Fichiers** : `src/epreuve/defi.ts` (le lien : écrire, lire, valider),
  `src/vues/defi.ts` (nouveau), `src/vues/chrono.ts` et `src/vues/quiz.ts`
  (bilan, mode défi), `src/vues/accueil.ts` (ligne du panneau),
  `src/main.ts` (`vues.set('defi', …)`, liste des vues), `src/navigation.ts`
  si la vue est « de passage », `src/vues/textes.fr.json`, `src/carte.css`,
  `.claude/skills/run-terramemo/driver.py` (`ui_defi`).
- **Tests** : `tests/defi.test.ts` (aller-retour du lien, 10 lignes au
  plus, liens tronqués, noms refusés par `formePseudo`, épreuve inconnue,
  version du format) ; `tests/navigation.test.ts` (`#defi/…` retenu
  derrière le panneau, puis rendu ; retour arrière) ;
  `tests/chrono-vue.test.ts` et `tests/quiz-vue.test.ts` (une partie de
  défi ne publie rien et n'écrit aucun record ; bilan comparé, rangé par
  `comparerScores`) ; `tests/accueil.test.ts` (ligne du défi) ;
  `tests/morceau-principal.test.ts` (la vue du défi hors du morceau
  principal, chargée à la demande) ; pilote `ui_defi` (un Chrono de
  l'Océanie, « Défier », le lien rejoué dans un second profil du
  navigateur, bilan comparé, captures).
- **Vérification** : sur le site déployé, un défi joué entre le PC et le
  téléphone (Chrome) ; lien ouvert depuis WhatsApp et depuis Messages
  (S900).
- **Fin** : un défi joué de bout en bout entre deux navigateurs, sur le
  site.

### Lot M3. Le défi dans l'APK (S)

- **Contenu** : « Coller un lien de défi » (Jouer, ou ⚙), le partage dans
  l'APK (`@capacitor/share` ou la copie, S901), l'avis « Mets l'appli à
  jour » sur une empreinte qui diffère.
- **Fichiers** : `src/vues/jouer.ts` ou `src/vues/arbre.ts` (l'entrée),
  `src/vues/defi.ts`, `package.json` si un plugin s'ajoute (version figée,
  avis de licence aux Crédits, décision « Licences tierces »).
- **Tests** : `tests/defi.test.ts` (texte collé avec ou sans l'adresse
  entière, espaces autour) ; `tests/capacitor.test.ts` si un plugin
  s'ajoute.
- **Vérification** : sur l'A37, après `sauver_journal` (décision « Google
  dans l'APK »), un défi créé sur le site et relevé dans l'APK, puis
  l'inverse.
- **Fin** : le critère du ticket : un défi de bout en bout entre deux
  appareils, site et APK.

### Lot M4. Le tableau du défi sur Firestore (M, si D901 b ou c)

- **Contenu** : `defis/{code}` et `scores/{clé}` (§ 4.2) ; le code ajouté
  au lien ; la file hors ligne ; « Mes défis » (les défis créés ou relevés
  sur l'appareil, lus à la demande) ; la purge à 30 jours (D911) ; une
  ligne de la politique.
- **Fichiers** : `firestore.rules`, `src/epreuve/defi-en-ligne.ts`
  (nouveau), `src/vues/defi.ts`, `src/vues/classement.ts` (file reprise),
  `scripts/admin/taches.mjs` (purge), `public/confidentialite.html` et
  `src/vues/confidentialite.ts`.
- **Tests** : `tests/regles.test.ts` (création, `list` refusé, un essai par
  pseudo, défi expiré, score invraisemblable, clé du pseudo) ;
  `tests/admin.test.ts` (purge à blanc, puis appliquée) ;
  `tests/confidentialite.test.ts`.
- **Vérification** : règles déployées avant le site (décision « Ouverture
  des épreuves d'un sujet ») ; console Firestore › Utilisation après une
  semaine.
- **Fin** : un défi retrouvé dans l'appli sans renvoi de lien.

### Lot M5. App Links (S, avec #5)

- **Contenu** : le filtre d'intention vérifié, `assetlinks.json`, le chemin
  `/defi/…` réécrit vers `/`, `appUrlOpen` ; les liens `#defi/…` déjà
  envoyés continuent de marcher sur le site.
- **Fichiers** : `android/app/src/main/AndroidManifest.xml`,
  `public/.well-known/assetlinks.json`, `firebase.json`, `src/sw/`,
  `src/retour-android.ts` ou un module voisin.
- **Tests** : `tests/capacitor.test.ts` (le filtre), un test de
  `firebase.json` (la réécriture), `curl -sI` de `assetlinks.json` après le
  déploiement.
- **Fin** : un lien touché dans WhatsApp ouvre l'APK installé depuis Play.

### Lot M6. Partie en direct (L, seulement si D910 a, b ou c)

Salle, présence, départ commun, au pas ou en course, abandon, veille du
téléphone, SDK temps réel (§ 2.2, § 5.3). À concevoir à part si
l'utilisateur la veut : cette étude n'en donne que le coût.

## 11. Décisions en attente de l'utilisateur

Chaque réponse se note au registre. Une réponse qui contredit une décision
actée la remplace (`noter_decision`, `remplace`).

**D900. Le format.**
- Options : a) défi par lien ; b) partie en direct ; c) les deux, le lien
  d'abord.
- Coût et apport : a fait la demande du ticket pour trois petits lots
  (§ 10) ; b demande une salle, la présence et un SDK temps réel, et
  coûte 43 à 393 écritures par partie (§ 5.3) ; c ajoute le lot M6 à a.
- Recommandation : **a**.
- Défaut : a.

**D901. Où vit le défi.**
- Options : a) tout dans le lien ; b) un document Firestore par défi, avec
  ses scores ; c) a d'abord, b ensuite si les proches le demandent.
- Coût et apport : a ne coûte aucune opération et ne met rien en ligne,
  mais on ne voit un score que si le proche renvoie le lien ; b montre
  tous les scores dans l'appli pour environ 2 écritures et 6 lectures par
  défi, avec des règles, une ligne de politique, une purge et App Check à
  suivre.
- Recommandation : **c**.
- Défaut : a, le lot M4 non fait.

**D902. Les épreuves qu'on peut défier.**
- Options : a) toutes les épreuves classées (Chrono, Sans faute, les
  quatre quiz) ; b) le Chrono seul ; c) aussi l'Entraînement (Trouver,
  Reconnaître).
- Coût et apport : a et b coûtent pareil (lot M1). Sans faute et le quiz
  sont ceux où la graine compte le plus (§ 3). c n'a pas de score
  comparable (aides « Voir », « Passer »).
- Recommandation : **a**.
- Défaut : a.

**D903. Ce qui fixe la partie.**
- Options : a) la graine et l'empreinte des questions ; b) toutes les
  questions écrites dans le lien (ou dans le document).
- Coût et apport : a donne un lien court, mais un APK dont les données
  diffèrent refuse le défi (et le dit) ; b survit à une mise à jour des
  données, mais le lien passe à environ 800 caractères pour un Chrono du
  monde.
- Recommandation : **a**.
- Défaut : a.

**D904. Le défi, le classement et les records.**
- Options : a) une partie de défi relevée ne publie rien et n'écrit aucun
  record ; la partie d'origine du créateur, jouée normalement, reste au
  classement ; b) comme a, mais le Chrono relevé compte aussi (il a les
  mêmes questions pour tous) ; c) tout compte.
- Coût et apport : c laisse rejouer un même quiz à graine connue jusqu'au
  sans-faute, puis le publier ; b est sans danger pour le Chrono, mais il
  ajoute une règle à expliquer ; a est la plus simple.
- Recommandation : **a**.
- Défaut : a.

**D905. Les essais.**
- Options : a) seul le premier essai d'un appareil compte au défi, les
  suivants sont des parties libres ; b) le meilleur de plusieurs essais.
- Coût et apport : b avantage qui rejoue une partie qu'il connaît déjà.
- Recommandation : **a**.
- Défaut : a.

**D906. Le premier lien sur un appareil neuf.**
- Options : a) l'écran de connexion d'abord, avec une ligne qui dit le
  défi, puis le défi ; b) le défi d'abord, l'écran de connexion après la
  partie.
- Coût et apport : a suit la décision « Écran de connexion » ; b fait jouer
  plus vite un proche qui ne connaît pas l'appli, mais crée une exception.
- Recommandation : **a**.
- Défaut : a.

**D907. Le nom dans le lien.**
- Options : a) le pseudo de l'appareil, sinon un prénom tapé pour le défi
  (gardé sur l'appareil, jamais au classement) ; b) le pseudo seul, donc
  Guest-N pour un invité (Firebase chargé et compte anonyme créé, même pour
  un lien seul).
- Recommandation : **a**.
- Défaut : a.

**D908. L'APK.**
- Options : a) le lien s'ouvre dans le navigateur, et l'APK a « Coller un
  lien de défi » ; b) App Links tout de suite ; c) App Links avec le Play
  Store (#5).
- Coût et apport : b refait son `assetlinks.json` au J3 (empreinte de Play
  App Signing) et impose un chemin au lieu du fragment.
- Recommandation : **a** maintenant, **c** au J3.
- Défaut : a.

**D909. La forme de l'adresse.**
- Options : a) un fragment, `/#defi/…` ; b) un chemin, `/defi/…`.
- Coût et apport : a ne change ni Hosting ni le service worker, et le
  fragment n'est jamais envoyé au serveur (S900) ; b demande une réécriture
  et la navigation du service worker, mais il est prêt pour App Links.
- Recommandation : **a**. Au lot M5, `/defi/…` s'ajoute, et les deux
  formes restent lues.
- Défaut : a.

**D910. La partie en direct, si on la veut.**
- Options : a) Firestore complet et ses écouteurs ; b) Realtime Database ;
  c) Firestore lite et un sondage toutes les 2 s ; d) pas de direct, « à
  la même heure » par le lien.
- Coût et apport : a pèse environ 450 Ko de SDK de plus et tient 50 à
  465 parties par jour ; b ne compte aucune opération mais plafonne à 50
  parties à deux en même temps, avec un second service ; c n'ajoute aucun
  SDK mais coûte environ 255 lectures par quiz et jusqu'à 2 s de retard ;
  d ne coûte rien de plus que le lien.
- Recommandation : **d** ; si l'utilisateur veut le direct, **b**.
- Défaut : d.

**D911. La durée de vie d'un défi en ligne** (seulement si D901 b ou c).
- Options : a) 30 jours, puis purge par l'outil du propriétaire à la
  tournée mensuelle (#29) ; b) une règle TTL de Firestore (S907) ;
  c) sans fin.
- Coût et apport : a tient la promesse de 30 jours de la politique sans
  rien de plus, et réutilise la tournée ; b est automatique, mais sa
  disponibilité sur Spark est à vérifier ; c remplit le Gio de Spark.
- Recommandation : **a**.
- Défaut : a.

**D912. Le partage.**
- Options : a) un bouton « Partager » (Web Share sur le site, un plugin
  ou la copie dans l'APK), avec « Copier le lien » en repli ; b) « Copier
  le lien » seul.
- Recommandation : **a**.
- Défaut : a.

## 12. Non retenu

- **Un défi du jour commun à tous** : le plan l'écarte (« pas de défi
  quotidien façon Worldle », `docs/plan.md:174`), et c'est un classement
  de plus, pas un défi entre proches.
- **WebRTC de pair à pair**, Firestore servant à la mise en relation : sans
  serveur TURN, deux téléphones en 4G se joignent mal (estimé), et c'est
  beaucoup de code pour une partie en direct déjà déconseillée.
- **Un schéma `terramemo://`** pour ouvrir l'APK : beaucoup de messageries
  ne rendent pas ces liens cliquables (à vérifier si l'on y revient).
- **Signer le lien** contre la triche : sans serveur, la clé serait dans
  l'appli, donc publique.
- **Un lien de défi qui publie au classement** (D904 c), et **un compte
  obligatoire pour défier** : contraires à « Comptes » (on joue sans
  compte).
- **Un défi avec des aides** (Entraînement) : D902 c, sans score
  comparable.

## 13. Suppositions à vérifier

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S900 | Le fragment d'un lien n'est jamais envoyé à Hosting, et WhatsApp et Messages le gardent intact jusqu'au clic | ouvrir un lien de 300 caractères depuis les deux, sur l'A37 | lot M2 |
| S901 | La WebView de l'APK n'a pas `navigator.share` | `typeof navigator.share` dans l'APK (DevTools par adb) | lot M3 |
| S902 | `graine` et `melanger` donnent la même suite dans Chrome, la WebView et Node | `tests/defi.test.ts` (suite figée), puis le pilote dans l'APK | lot M1 |
| S903 | Aucun `Math.random` dans le rendu d'une épreuve : même graine, mêmes énoncés, pour tous les sujets | test « même graine, mêmes énoncés » sur chaque sujet | lot M1 |
| S904 | Firestore complet pèse environ 450 Ko minifiés, et il cohabite avec lite | build d'essai jetable | avant M6 |
| S905 | Facturation : `get()` des règles, requête vide et écouteurs comptent comme au § 5.1 | relire « Understand Cloud Firestore billing » | avant M4 |
| S906 | Spark donne à Realtime Database 100 connexions simultanées, 1 Go stocké et 10 Go par mois | page des tarifs de Firebase | avant M6 |
| S907 | Les règles TTL de Firestore marchent sur Spark, et leurs suppressions comptent dans le quota | documentation de Firestore (TTL), console | avant M4 |
| S908 | La latence de La Réunion à `eur3` reste sous 300 ms | mesure depuis le téléphone en 4G | avant M6 |
| S909 | L'usage réel du quota laisse la place d'un tableau de défis | console Firestore › Utilisation, sur une semaine | avant M4 |
| S910 | App Links ne filtrent pas sur le fragment : il faut un chemin | documentation Android des App Links | lot M5 |
| S911 | Un lien de 10 lignes de scores reste sous 300 caractères | `tests/defi.test.ts` (longueur au pire) | lot M2 |

## 14. Sources

- Code et données du dépôt, `main` à `4525155` (chemins et lignes dans le
  texte) ; tailles par `ls -la` de `dist/assets/` (build du 20/11) et de
  `node_modules/@firebase/` (firebase 13.2.0, `@firebase/firestore`
  4.19.1).
- Décisions actées du registre « terramemo » : « Hébergement »,
  « Comptes », « Barème et classements », « Quiz général », « Écran de
  connexion », « Pseudo d'invité », « Une place par pseudo », « Clé du
  pseudo au classement », « App Check et service worker hors du J1a »,
  « Diffusion », « Signature de l'APK », « Morceau JS principal sous
  500 Ko », « Fin d'une partie du Chrono », « Images d'une épreuve »,
  « Drapeaux contestés et sosies », « Ouverture des épreuves d'un sujet »,
  « Public et modèle », « Licences tierces », « Google dans l'APK ».
- Études du dépôt : `2026-11-04-points-classement.md`,
  `2026-11-04-pedagogie.md`, `2026-11-04-synthese-agents.md`,
  `2026-11-04-critique.md`, `2026-11-07-j1b-conception.md` (§ 5.7),
  `2026-11-10-j2-conception.md` (patron).
- Documentation de Firebase, non relue cette nuit : « Understand Cloud
  Firestore billing » (S905), tarifs de Realtime Database (S906), TTL de
  Firestore (S907) ; documentation Android des App Links (S910).
