# Saisie libre des noms : conception (25/11/2026, #36)

*Faite seule, de nuit, par un agent, sans relecture adverse ni réponse de
l'utilisateur. Elle est à relire et à trancher avant tout code. Code lu sur
`main` à `4525155` (le code est celui de `a3d08a0` : depuis, seules des
études sont entrées). Rien n'est codé.*

**Numérotation.** La dernière étude validée du dépôt (fiche d'un lieu)
s'arrête à D61 et S64. Trois études de cette nuit ont pris des plages à
part : D350 à D362 (test de placement), D600 à D649 (J4), D900 à D949
(multijoueur, `git log` relu avant le commit). D'autres (J5, J6) peuvent
reprendre à D62 ou prendre une centaine ronde. Celle-ci prend donc une
plage réservée, hors des centaines à trois chiffres : **D1300 à D1349** et
**S1300 à S1349** (utilisées : D1300 à D1315, S1300 à S1310). On peut
renuméroter à la validation.

**Conventions** (celles des études du J2 et de la fiche d'un lieu).
**Mesuré** : script lancé ou fichier lu, avec fichier:ligne. **Estimé** :
jugement. **À vérifier** : ni mesuré ni lu. Tailles : S (moins d'une
demi-journée), M (une demi-journée à deux jours), L (plus). Les chemins de
code sont relatifs à `src/`. Les scripts de mesure, jetables, et leurs
sorties sont hors du dépôt, dans
`~/Sauvegardes/terramemo/saisie-libre-conception/` : `scripts/mesures.py`
(longueurs, paires proches, barèmes), `scripts/concurrents.py` (noms non
jouables de la carte, capitales écartées), `scripts/formes.py` (formes
dérivées), `scripts/fautes.py` (banc des fautes, graine 36), et
`mesures.txt`, `concurrents.txt`, `formes.txt`, `fautes.txt`.

**Le besoin** (ticket #36, sorti du #3 le 16/11) : « saisie tolérante selon
la longueur, alias, collisions des noms normalisés, fiches « nommer » en
saisie, sans casser un APK en retard. Avant : essai des claviers Samsung et
Gboard sur l'A37. Fin : nommer au clavier sur le site et dans l'APK,
claviers de l'A37 essayés ». Sources : lot 9 de
`docs/etudes/2026-11-07-j1b-conception.md` (l. 20-22 et 1520) ;
`docs/plan.md` l. 76-78 (CLDR, alias par pays, aucun retrait de mots, test
de collision), l. 127-129 (attributs du champ, Gboard, clavier de lettres
de repli), l. 171 (risque « saisie injuste ou trop large »).

**Décisions actées qui priment** : « Sens « quel est ce pays ? » » (la
carte retournée tient lieu de saisie « avant la saisie du J1b ») ; « Nommer »
(un seul essai, zone fausse au contour entier) ; « Capitales et drapeaux »
(toute capitale déclarée juste, alias Kyiv) ; « Langue » (noms et alias par
langue, dans des fichiers de langue) ; « Comptes » (un document par lot,
jamais par réponse) ; « Une seule base web » ; « Diffusion » (le site pour
le public, l'APK par la release GitHub) ; « Zone allumée montrée par un
zoom lent » ; « Morceau JS principal sous 500 Ko » ; « Pays et frontières ».

## Résumé

**Ce que je propose.** Dans la Révision du jour et Apprendre, la fiche
« nommer » ne se révise plus en carte retournée (« Je savais », « Je ne
savais pas ») mais **au clavier** : la zone s'allume, on tape son nom, on
valide. Cela vaut pour les pays (195 fiches), les capitales (186), les
océans et mers (50) et les communes (24). Les drapeaux gardent la carte
retournée : leur réponse est une image. La réponse est jugée par une
fonction pure, sans accents ni casse, **sur les lettres seules** (espaces,
traits d'union et apostrophes ignorés), avec un article de tête et « St »
facultatifs. Elle admet des fautes selon la longueur : **aucune jusqu'à 4
lettres, une jusqu'à 8, deux au-delà**. Une **règle de collision** tranche :
une saisie aussi proche ou plus proche d'un autre lieu est fausse. Mesuré
sur les données du dépôt : 95 % des noms de pays tapés avec une faute sont
acceptés, et aucune faute n'est prise pour le mauvais pays. Une forme
ambiguë (« Corée », « Congo », « Oman » en mer) demande de préciser, sans
compter de faute. Le **journal ne change pas de format** : une réponse
tapée s'écrit comme une carte retournée (mode, note), avec l'id du lieu
désigné si la réponse est fausse. Un APK resté en retard lit donc tout,
sans `a_relire`, sans règles à redéployer. Le **clavier** se choisit après
l'essai de l'A37 (§ 7, prêt à faire) : le clavier du téléphone si le champ
réglé ne souffle rien, sinon un clavier de 26 lettres dans l'appli.

**Les choix qui comptent vraiment** (tableau complet au § 10) :
1. **D1300** : où la saisie remplace la carte retournée. Je recommande les
   séances seules, sur quatre sujets, drapeaux exclus.
2. **D1302** : la tolérance. Je recommande le barème du 04/11 (0, 1, 2
   fautes), mesuré ici à 95 % d'acceptation sur une faute.
3. **D1306** : la liste des alias des pays (annexe A, ≈ 30 lignes à relire).
   Elle n'existe pas encore : le plan la prévoyait, rien ne l'a écrite.
4. **D1310** : le format du journal. Je recommande de ne pas le changer, au
   prix de ne pas savoir plus tard qu'une réponse a été tapée.
5. **D1311** : le clavier. Il dépend de l'essai, qui est un geste de
   l'utilisateur sur l'A37 (≈ 25 min, § 7).
6. **D1312** : la place du champ quand le clavier est ouvert. C'est
   l'organisation de l'écran ; elle se juge aussi à l'essai.

Le reste a un défaut sûr et réversible. Sans réponse, le code suivrait les
recommandations, sauf D1306 (la liste d'alias attend la relecture) et D1311
(l'essai d'abord).

## 1. Ce qui existe

**Normalisation et distances** (`texte.ts`, mesuré) :
- `normaliser()` (l. 5-14) : NFD, marques retirées, minuscules,
  apostrophes unifiées, tirets en espaces, espaces compressés. Aucun mot
  n'est retiré (l. 1-3, plan l. 76-78) ;
- `suggestions()` (l. 20-27) : les noms qui commencent par ce qui est tapé
  (vue Saisie) ; `chercherLieux()` (l. 36-49) : la recherche de l'en-tête,
  alias compris ;
- `distanceEdition()` (l. 52-60) : Levenshtein, sans transposition ;
  `nomsProches()` (l. 71-76) : deux noms à 2 fautes ou moins, ou de même
  début, pour écarter les leurres du quiz.

**La vue Saisie du J0** (`vues/saisie.ts`) : trois champs, « Champ réglé »
(attributs `SANS_SUGGESTIONS`, l. 8-17 : `autocomplete`, `autocorrect`,
`autocapitalize` à `off`, `spellcheck` à `false`, `enterkeyhint="done"`,
`data-gramm="false"`), « Champ témoin » (sans réglage) et une variante
`type=url` (l. 52-54). On y arrive par ⚙ → « Essai des claviers »
(`index.html:59`). Le pilote y tape « sai » par `Input.insertText` de CDP
(`.claude/skills/run-terramemo/driver.py:2099-2105`). Le protocole d'essai
du skill (`SKILL.md:1284-1296`) n'a **jamais été déroulé** : le registre ne
cite Gboard qu'au 04/11 (« Son clavier est le clavier Samsung (pas de
Gboard) : la saisie se teste avec les deux »), et rien depuis.

**La carte retournée** (`vues/retournee.ts`), posée par la séance quand la
fiche est au sens `nommer` (`srs/seance.ts:183`). Sa réponse s'écrit
`{ sens: 'nommer', correct: savais, aide: null, reponse: null, via: null,
zoom, duree_ms }` (`vues/essai.ts:523-526`). La note suit `noter()`
(`srs/note.ts:29-32`) : Again si faux ou aidé, Good si juste, jamais Hard.

**Les noms** (mesuré) :
- `public/geo/noms.fr.json` : 335 noms (entités et zones contestées), à
  plat, **sans alias**. Le plan (l. 76) prévoyait « un fichier maison
  d'alias par pays » : il n'existe pas. Un nom porte sa variante entre
  parenthèses : « Myanmar (Birmanie) ». D'autres sont longs ou officiels :
  « État de la Cité du Vatican », « Congo-Kinshasa » ;
- `public/geo/capitales.fr.json` : 210 noms et 22 entrées d'alias (Kyiv,
  Beijing, Dhaka, Abu Dhabi, Sana'a…), 12 pays à plusieurs capitales justes ;
- `public/geo/mers.fr.json` : 50 noms, un alias (« mer d'Oman » pour la mer
  d'Arabie) ;
- `public/geo/reunion/noms.fr.json` : 24 communes ;
- `vues/textes.fr.json`, `formes_pays` : la forme avec article des 197 pays
  (« le Japon »), relue à la main (décision « Articles des noms de pays »).

**Les tests de collision qui existent** : `tests/donnees.test.ts:458-466`
(noms uniques entre entités et zones contestées, ponctuation ignorée) ;
`tests/donnees-capitales.test.ts:464-479` (pas d'homonyme entre pays, pas
d'alias égal au nom d'une autre capitale) ; `tests/donnees-reunion.test.ts:128-135`
(24 noms uniques, disjoints de ceux du monde) ;
`tests/carte-vues.test.ts:69-72` (normalisation). Aucun ne regarde la
**distance** entre deux noms : c'est le test nouveau du lot 9.2.

**Le journal et la synchro** : `probleme()` refuse un champ inconnu
(`srs/journal.ts:103-105`) et une valeur hors liste (l. 94-99). Les listes
de l'encodage des lots sont figées en v1 : « on n'y ajoute qu'à la fin, et
jamais pendant que v vaut 1 (un champ nouveau du journal demande v = 2) »
(`sync/lots.ts:21-22`). Les règles exigent `d.v == 1`
(`firestore.rules:313`). Un lot illisible part dans `a_relire`, et
l'appareil affiche « Mets à jour l'appli » (`vues/textes.fr.json:1120`).

**L'APK** embarque ses données : `webDir: 'dist'`
(`capacitor.config.ts:9`). Un APK juge donc avec les noms et alias de son
build. Aucun réglage du clavier n'existe dans l'APK : ni plugin Keyboard,
ni `windowSoftInputMode` dans `android/app/src/main/AndroidManifest.xml`
(mesuré par recherche), ni `visualViewport` dans `src/`.

## 2. Où la saisie remplace la carte retournée (D1300, D1301)

| Sujet | Fiches `nommer` | La question | Saisie |
|---|---|---|---|
| Pays | 195 (jouables) | « Quel est ce pays ? », zone allumée | oui |
| Capitales | 186 (195 moins les 9 de `SANS_NOMMER`, `srs/fiches.ts:63-65`) | « Quelle est sa capitale ? », pays allumé | oui, toute capitale juste du pays |
| Océans et mers | 50 | « Quelle est cette mer ? » (« cet océan ») | oui |
| Communes | 24 | zone de l'île allumée | oui |
| Drapeaux | 195 | « Quel est son drapeau ? » | **non** : la réponse est une image, la carte retournée reste |

Les comptes viennent de `public/geo/pays.json` (195 `jouable`) et de
`public/geo/capitales.json` (197 lignes : les 195 et Kosovo, Taïwan) ;
mesuré.

**Quelles étapes.** Celles qui posent aujourd'hui une carte retournée :
les révisions dues d'une fiche `nommer` et ses introductions (mode
`rappel`, `srs/seance.ts:190`), puis leurs reprises en fin de séance. Le
QCM d'apprentissage reste un QCM : c'est l'étape hors FSRS (plan l. 49).
Reconnaître (Entraînement) reste un choix parmi 4 (décision « Nommer »).
Les épreuves classées ne changent pas : elles se jouent au toucher.

**D1300. Où.** a) les séances seules, sur les quatre sujets à noms ; b) a, et
un exercice « Écrire » dans Entraînement, à côté de Trouver et Reconnaître
(une tuile de plus à chaque série : décision « Écran Jouer ») ; c) la
saisie seulement sur demande (⚙), la carte retournée par défaut.
**Recommandation : a.** C'est le besoin du ticket et ce que la décision
« Sens » annonçait ; b se fera plus tard sans rien défaire. Par défaut : a.

**D1301. Garder la carte retournée en réglage.** a) un réglage de ⚙,
« Réviser les noms sans clavier », éteint par défaut (pour qui joue
debout, d'une main, ou sans lire un clavier) ; b) plus de carte retournée,
hors drapeaux. **Recommandation : a.** Le code existe déjà, le coût est un
interrupteur. Par défaut : a.

## 3. Juger une réponse

### 3.1 La forme comparée

À partir de `normaliser()`, sans rien changer à elle (la recherche s'en
sert) :
1. **lettres seules** : tout ce qui n'est pas `a` à `z` est ôté (espaces,
   apostrophes, points, parenthèses, l'okina de « Nukuʻalofa », que
   `normaliser()` laisse passer). « cote divoire », « Côte-d'Ivoire » et
   « cotedivoire » se valent. Mesuré (`formes.txt`) : aucune forme compacte
   ne désigne deux lieux, dans aucun domaine ;
2. **article de tête facultatif**, des deux côtés : « le », « la », « les »,
   « l' ». « la France » est juste ; « Tampon » vaut « Le Tampon », « Paz »
   vaut « La Paz ». Mesuré : 7 communes et 6 capitales ont un article ;
   aucun nom de pays de `noms.fr.json` n'en a ; aucune forme sans article
   ne heurte un autre lieu ;
3. **« st » et « ste »** au début d'un mot valent « saint » et « sainte » :
   « St-Denis ». 12 communes, 9 noms de la carte et 4 capitales sont en
   Saint ou Sainte (mesuré) ;
4. **mers : générique facultatif**. « Atlantique », « Méditerranée »,
   « Botnie » sont justes. Mesuré : 49 noyaux ; un seul est ambigu,
   « Oman » (golfe d'Oman, et « mer d'Oman », alias de la mer d'Arabie) ;
   10 noyaux sont aussi des noms de pays (Japon, Mexique, Guinée…), ce qui
   ne gêne pas : la question dit le sujet ;
5. la partie entre parenthèses d'un nom (« Myanmar (Birmanie) ») devient un
   alias, et le nom sans elle en est un autre.

Rien ne retire un mot du milieu d'un nom (plan l. 76-78) : « république
de », « du Sud », « équatoriale » restent.

**Clavier de lettres.** Après ces étapes, toutes les formes acceptées
s'écrivent avec les 26 lettres. Mesuré sur les 335 noms, les 210 capitales
et leurs alias, les 50 mers et les 24 communes : les seuls autres signes
sont l'espace, `'`, `(`, `)`, `.` et `ʻ`, tous ôtés à l'étape 1. Un clavier
de repli n'a donc besoin ni d'accents, ni d'espace, ni de trait d'union
(§ 5).

### 3.2 La tolérance selon la longueur (D1302)

La longueur est celle de la forme compacte. Trois barèmes, essayés sur des
fautes tirées au hasard (`fautes.py` : 12 variantes à une faute et 6 à
deux fautes par cible, suppression, substitution, insertion ou
transposition ; graine 36) :

| Barème | Pays, 1 faute acceptée | Pays, 2 fautes | Capitales, 1 faute | Capitales, 2 fautes |
|---|---|---|---|---|
| **A** : 0 jusqu'à 4 lettres, 1 jusqu'à 8, 2 au-delà (étude du 04/11) | 95,3 % | 41,8 % | 94,0 % | 38,7 % |
| B : 0 jusqu'à 3, 1 jusqu'à 7, 2 au-delà | 99,1 % | 57,4 % | 99,2 % | 56,8 % |
| C : 0 jusqu'à 5, 1 au-delà | 82,7 % | 11,5 % | 81,8 % | 11,0 % |

Dans chaque case, le reste est refusé : trop de fautes, ou, pour 0,9 % au
plus, une collision (§ 3.4). **Aucune variante n'est acceptée pour le
mauvais lieu**, par construction de la règle de collision.

Ce que A refuse à une faute : les noms de 4 lettres. Mesuré : 8 pays (Cuba,
Inde, Irak, Iran, Laos, Mali, Oman, Togo) et 12 capitales (Aden, Apia,
Dili, Doha, Kiev, Lima, Lomé, Malé, Oslo, Riga, Rome, Suva). B les
accepterait, mais une faute y change un quart du mot : « Iram » est à une
faute d'Iran et d'Irak, « Lime » de Lima et de Lomé. La règle de collision
refuse alors (c'est la part de 0,9 % de B).

**Recommandation : A.** Il accepte 19 fautes simples sur 20, ne tolère rien
sur les mots courts où une faute fait un autre mot, et c'est le barème déjà
proposé le 04/11 (`2026-11-04-pedagogie.md`, « Tolérance »). Par défaut : A,
dans une constante nommée.

### 3.3 La distance (D1303)

a) **Damerau-Levenshtein restreinte** (OSA : une transposition de deux
lettres voisines compte une faute) ; b) Levenshtein, déjà dans
`texte.ts:52-60` (une transposition en compte deux). Mesuré : aucune paire
de noms de pays ne change de distance entre a et b (`mesures.txt`, dernier
bloc). La différence ne joue que sur la saisie : « Zmabie » (6 lettres, une
faute permise) est accepté par a, refusé par b. **Recommandation : a**,
une dizaine de lignes de plus ; `distanceEdition` reste pour `nomsProches`.

### 3.4 La règle de collision (D1304)

Une saisie est **fausse** si elle est aussi proche, ou plus proche, d'une
forme d'un autre lieu que de la plus proche forme du lieu demandé. Le lieu
le plus proche est alors « désigné » : son id va au journal (§ 6) et la
rétroaction le montre (D1315).

**Quels autres lieux.** Les cibles jouables ne suffisent pas. Mesuré
(`concurrents.txt`) : « Saint-Martin », territoire, est à une faute de
Saint-Marin. Avec deux fautes permises (10 lettres), un joueur qui tape
« Saint-Martin » pour Saint-Marin serait jugé juste si Saint-Martin n'était
pas un concurrent. Les autres paires à 2 fautes entre une cible et un nom
non jouable : Albanie et Mbanié, Cuba et Aruba, Cuba et Ceuta, Inde et Niue,
Libye et Abiyé, Niger et Niue, Oman et Golan.

a) **tous les noms du domaine sur la carte** : pour les pays, les 335 de
`noms.fr.json` (territoires et zones contestées compris) ; pour les
capitales, toutes les capitales et leurs alias, et les 11 capitales
écartées de `geodata/capitales-main.json` (`non_retenues` : Dar es
Salaam, Valparaíso, Lagos…) ; pour les mers et les communes, leur liste ;
b) les seules cibles du sujet. **Recommandation : a.** L'égalité de
distance compte faux (règle du 04/11). Par défaut : a.

**Les paires proches, mesurées** (`mesures.txt`, distance OSA sur la forme
normalisée) :
- pays, à une faute : Gambie et Zambie, Iran et Irak, Irlande et Islande ;
  à deux fautes : 20 paires, dont Niger et Nigeria, Mali et Malawi, Serbie
  et Syrie, Laos et Palaos, Liban et Libye, Togo et Tonga ;
- capitales, à une faute : Kingston et Kingstown, Manama et Panama, Rome et
  Lomé ; à deux fautes : 21 paires, dont Budapest et Bucarest, Riga et
  Riyad, Dakar et Damas, Nassau et Bissau ;
- mers et communes : aucune paire à deux fautes ou moins ;
- entre domaines, seuls les 8 noms de capitale égaux à leur pays
  (Djibouti, Guatemala, Koweït, Luxembourg, Monaco, Panama, Saint-Marin,
  Singapour ; D37 c) : aucune gêne, la question dit le sujet, et ces pays
  n'ont pas de fiche `nommer` en capitales.

Chaque paire à une faute est un cas du test (lot 9.1) : « Gambie » pour la
Zambie est faux et désigne la Gambie ; « Zambi » pour la Zambie est juste ;
« Gambi » pour la Zambie est faux.

### 3.5 Les formes ambiguës (D1305)

Certaines saisies désignent deux lieux sans en être le nom : « Corée »
(nord, sud), « Congo » (Kinshasa, Brazzaville), « Oman » en mer (golfe
d'Oman, mer d'Oman), « mer de Chine » (orientale, méridionale). Une table
courte, à la main, dans le fichier de langue :
`{ "coree": ["PRK", "KOR"], "congo": ["COD", "COG"] }`, et pour les mers
`{ "oman": ["oman", "arabie"], "merdechine": ["chineor", "chinemer"] }`
(ids de `public/geo/mers.fr.json`, mesuré).

a) **« Précise »** : la saisie n'est pas jugée, le champ reste, une ligne
dit « Il y a deux Corée : précise. », une fois par question ; b) faux,
comme toute saisie trop vague. **Recommandation : a.** Celui qui tape
« Corée » pour la Corée du Sud sait presque tout ; le faux serait injuste.
La ligne ne nomme pas les deux candidats. Par défaut : a. Si la cible n'est
dans aucune des deux, la forme ambiguë se juge comme une autre (elle sera
fausse).

### 3.6 Les alias (D1306, D1307)

**Pays.** Aucun alias n'existe (§ 1). Je propose une liste courte, écrite à
la main, relue par l'utilisateur, à l'annexe A : les autres noms courants
en français (Birmanie, RDC, République tchèque, Cabo Verde, Vatican,
Saint-Siège, Bélarus…), quelques graphies étrangères en usage (USA,
Türkiye) et les cas où le nom de référence est trop officiel ou trop
technique pour être tapé (« État de la Cité du Vatican »,
« Congo-Kinshasa »). Fichier : `geodata/alias-pays.fr.json`, relu, copié
par `geodata/build.mjs` dans `public/geo/alias.fr.json` (structure
`{ id: [alias] }`, comme `capitales.fr.json`). Décision « Langue » : un
fichier par langue.

**D1306. La liste.** a) **la liste courte de l'annexe A**, relue, chaque
ligne avec sa raison ; b) les libellés et alias de Wikidata et CLDR, pris
en bloc (plusieurs centaines, dont des formes rares ou fausses en
français) ; c) aucun alias, le nom de référence seul. **Recommandation :
a.** Les noms disputés (« golfe Arabique » pour le golfe Persique, « mer de
l'Est » pour la mer du Japon) n'y entrent pas : la saisie attend l'usage
français, comme les noms affichés. « Hollande » et « Angleterre » sont des
questions à part de l'annexe : je recommande de les refuser, avec une
remarque (§ 4.2). **Par défaut : rien n'est mis en ligne avant la
relecture** ; le code peut être fait avec une liste vide.

**D1307. Les anciens noms** (Swaziland, Macédoine, Zaïre, Ceylan,
Dahomey…). a) les anciens noms **récents** (changés depuis 2018 :
Swaziland, Macédoine) justes, avec la remarque « Nom actuel : Eswatini » ;
b) tous les anciens noms justes ; c) aucun. **Recommandation : a.** On
apprend le nom actuel sans punir celui qui a appris l'ancien. Par défaut :
a.

**Capitales.** Les 22 alias existants servent tels quels (Kyiv, Beijing).
Toute capitale juste du pays est juste (décision « Capitales et
drapeaux ») : pour la Bolivie, Sucre et La Paz. Une capitale écartée
(Dar es Salaam pour la Tanzanie) est fausse, avec une remarque (D1315).

**Mers.** L'alias existant suffit, avec la règle du générique (§ 3.1).
Proposé en annexe A : « mer des Antilles » pour la mer des Caraïbes.

**Communes.** Aucun alias : l'article et « St » suffisent (§ 3.1).

### 3.7 Les formes allégées (D1308)

a) article de tête, « St »/« Ste » et générique des mers facultatifs ; un
nom composé se tape **en entier** (« Bosnie » seul est faux pour la
Bosnie-Herzégovine, « Trinité » pour Trinité-et-Tobago) ; b) a, et la
première partie d'un nom composé acceptée quand elle est unique ; c) le
nom exact seul. **Recommandation : a.** b rendrait juste « Saint » pour
une dizaine de pays sans le dire, et « Guinée » est déjà un pays. Les
noms longs dont le début seul est en usage (« Bosnie »,
« Saint-Kitts ») vont à l'annexe A, au cas par cas. Par défaut : a.

### 3.8 La fonction

`src/saisie/juger.ts`, pure, sans DOM :

```
juger(tape, cible, domaine) → { verdict, fautes, designe, ambigus }
  verdict : 'juste' | 'faux' | 'precise' | 'vide'
  fautes : distance à la forme la plus proche de la cible (0 = exact)
  designe : id du lieu le plus proche si ce n'est pas la cible, sinon null
```

1. `tape` passe par les étapes du § 3.1 ; vide → `vide` (rien n'est jugé).
2. Si `tape` est une forme ambiguë qui contient la cible → `precise`.
3. `d0` = distance à la forme la plus proche de la cible ; `d1` = la plus
   petite distance à une forme d'un autre lieu (calcul arrêté dès qu'il
   dépasse `d0`).
4. `d1 <= d0` → `faux`, `designe` = ce lieu ; `d0` > tolérance de cette
   forme → `faux`, `designe` = le lieu le plus proche s'il est dans sa
   propre tolérance, sinon null ; sinon → `juste`.

Coût : ≈ 400 formes de 12 lettres en moyenne pour les pays, une matrice de
150 cases chacune, avec un arrêt précoce sur la longueur. Estimé : bien
moins d'une milliseconde sur l'A37 (S1302). Les formes de chaque domaine se
calculent une fois, au premier usage. Le module part avec la séance, pas
dans le morceau principal (décision « Morceau JS principal sous 500 Ko ») :
quelques Ko, estimé.

## 4. La question à l'écran

### 4.1 Le déroulé

1. La zone s'allume et se cadre comme aujourd'hui (`allumerZone`,
   `vues/nommer.ts:116` ; zoom lent de 0,5 + 1,5 s, `ZONE_MONTREE`, l. 35).
2. La consigne reste celle du sujet (`consigneQcm`, « Quel est ce
   pays ? »). Sous elle : le champ, « Valider », « Je ne sais pas ».
3. Le champ prend le focus **à la fin du vol** (D1314), pour que le clavier
   ne s'ouvre pas pendant le zoom et ne change pas la hauteur de la carte
   en plein mouvement. Il **garde le focus** d'une question à l'autre : le
   clavier ne se ferme pas et ne se rouvre pas à chaque nom.
4. Entrée (« done ») ou « Valider » juge. « Je ne sais pas » vaut un faux
   aidé (Again) et montre le nom.
5. Un seul essai (décision « Nommer »), sauf la forme ambiguë (§ 3.5).
6. Un raté revient en fin de séance (reprise, `srs/seance.ts:13-14`), à
   retaper, sans nouvelle note.

Sur le PC, tout se fait au clavier physique : le champ a le focus, Entrée
valide. Les touches + et − ne zooment pas dans un champ (décision « Boutons
de zoom » : « hors d'un champ de saisie »), et les raccourcis 1 à 4 de
Reconnaître s'y taisent déjà (`tests/nommer-vue.test.ts:384`).

### 4.2 La rétroaction (D1315)

| Cas | Ce qui s'affiche | Journal |
|---|---|---|
| Juste, sans faute | « Juste » en vert, la ligne « Revient dans 3 j » de la carte retournée | `correct: true` |
| Juste, avec fautes | « Juste · on écrit **Zambie** » | `correct: true` |
| Ancien nom (D1307) | « Juste · nom actuel : **Eswatini** » | `correct: true` |
| Faux, un autre lieu désigné | « C'est la **Zambie** » ; la zone désignée (Gambie) au contour entier, comme la zone fausse de Reconnaître ; pour une capitale, « Kingstown : capitale de Saint-Vincent-et-les Grenadines » | `correct: false`, `reponse` : l'id désigné |
| Faux, rien de proche | « C'est la **Zambie** » | `correct: false`, `reponse: null` |
| Refus à remarque (Angleterre, Hollande si D1306 les refuse ; capitale écartée) | « C'est le **Royaume-Uni** · l'Angleterre en est une nation » ; « Dar es Salaam n'est plus la capitale depuis 1996 » (date à vérifier) | `correct: false` |
| Je ne sais pas | le nom | `correct: false`, `aide: 'passer'` |
| Forme ambiguë | « Il y a deux Corée : précise. » | rien, la question continue |

**D1315.** a) montrer le lieu désigné (contour et nom), comme le prévoit la
décision « Nommer » pour la zone fausse ; b) le bon nom seul.
**Recommandation : a.** Montrer la confusion, c'est ce qui l'apprend, et
la matrice des confusions reçoit l'id. Par défaut : a.

### 4.3 La place du champ quand le clavier est ouvert (D1312)

Le clavier du téléphone prend une bonne part du bas de l'écran (hauteur sur
l'A37 à mesurer, § 7, étape 6). La zone allumée doit rester visible
au-dessus.

a) **le champ dans la barre du bas, qui monte avec le clavier** : la carte
se cadre dans ce qui reste visible (`visualViewport`) ; c'est la place
des boutons de Reconnaître et de la carte retournée ; b) le champ en haut,
sous l'en-tête : la carte entre le champ et le clavier, la barre du bas
cachée par le clavier ; c) le clavier de lettres de l'appli (§ 5), plus
bas que celui du téléphone (≈ 3 rangées de 44 px, estimé), qui ne change
pas la hauteur de la page.

**Recommandation : a**, à confirmer par l'essai : elle garde l'organisation
actuelle (la question en bas, la carte au-dessus). Si l'essai montre que
la page ne rétrécit pas dans l'APK (étape 6), a demande de lire
`visualViewport` ou le plugin `@capacitor/keyboard` (dépendance nouvelle,
licence à vérifier, S1307). Par défaut : a.

### 4.4 Aides

**D1313.** a) aucune liste de noms pendant la question ; b) la liste de la
vue Saisie (`suggestions()`) après 3 lettres, pour les premières
révisions. **Recommandation : a** : une liste transforme le rappel en
reconnaissance (`2026-11-04-pedagogie.md`, « Au clavier du téléphone »), ce
que la décision « Sens » refuse au QCM compté comme rappel. Par défaut : a.

### 4.5 Accessibilité

Le champ a son libellé (la consigne, par `aria-labelledby`) ; la
rétroaction passe dans une zone `role="status"`, comme le statut de la vue
Saisie (`vues/saisie.ts:28`). La zone allumée reste visuelle, comme
aujourd'hui en carte retournée : rien de neuf à ce titre.

## 5. Le clavier : celui du téléphone ou celui de l'appli (D1311)

**Ce qu'on ne sait pas.** Le plan (l. 127-129) pose les attributs du champ
réglé et prévoit un clavier de lettres dans l'appli si le clavier du
téléphone souffle encore. Je n'ai pas vérifié comment le clavier Samsung
et Gboard traitent ces attributs dans Chrome et dans la WebView de l'APK :
c'est l'objet de l'essai (§ 7, S1300). Le risque est double : une barre de
suggestions qui donne la réponse (« fra » → « France »), et une correction
automatique qui change la réponse à l'espace, dans un sens ou dans l'autre
(« ouzbekstan » corrigé en « Ouzbékistan »).

**Options.**
- a) **le clavier du téléphone, champ réglé** (`SANS_SUGGESTIONS`, déjà
  écrit). Coût : rien de plus. Vaut si l'essai ne voit rien souffler.
- b) **la variante `type=url`** (`vues/saisie.ts:54`), si seule elle reste
  muette. Coût : rien ; la barre d'espace peut manquer sur ce clavier, ce
  qui ne gêne pas grâce aux lettres seules (§ 3.1). Les touches « / » et
  « .com » se voient : un peu étrange.
- c) **un clavier de 26 lettres dans l'appli** sur le téléphone (Chrome et
  APK) : trois rangées AZERTY (A à P, Q à M, W à N et ⌫), « Valider », « Je
  ne sais pas ». Le champ prend `inputmode="none"` : le clavier du téléphone
  ne s'ouvre pas, le curseur reste. Le PC garde le clavier physique.
  Coût : M (`vues/clavier.ts`, tests DOM, pilote). Apporte : aucune
  suggestion par construction, une hauteur de page qui ne change pas, un
  clavier plus bas, la même chose sur tous les téléphones. Perd : la
  dictée, l'habitude du clavier de chacun, et il faut des boutons de 32 à
  36 px de large sur 360 px (estimé), un peu étroits.

**Recommandation : la règle de décision de l'essai** (§ 7, fin) : a si le
champ réglé est muet sur les deux claviers, dans Chrome et dans l'APK ;
sinon b si la variante l'est ; sinon c. **Par défaut, jusqu'à l'essai :
a**, déjà codé ; le lot 9.3 attend l'essai.

## 6. Journal, synchro et APK en retard (D1310)

**Ce qu'une réponse tapée écrit**, sans rien changer au format v1 :

```
{ type: 'reponse', fiche: 'pays:ZMB:nommer', mode: 'rappel' | 'revision',
  correct, note: Good | Again, aide: null | 'passer',
  reponse: null | <id du lieu désigné>, via: null, zoom, duree_ms }
```

`reponse` garde son sens actuel : l'id que la réponse désigne quand elle
est fausse, comme le choix d'un QCM (`deNommer`, `vues/essai.ts:194-202`).
`probleme()` l'accepte (`srs/journal.ts:95` : un id de 64 caractères au
plus). `aide: 'passer'` existe déjà (l. 62).

**D1310.**
- a) **v1 inchangé** : rien à toucher dans `srs/journal.ts`,
  `sync/lots.ts` ni `firestore.rules`. Un APK en retard lit les réponses
  tapées sur le site comme des cartes retournées, les rejoue, et arrive au
  même état. Pas de `a_relire`, pas de « Mets à jour l'appli », pas de
  déploiement des règles. Perd : on ne saura pas plus tard qu'une réponse
  a été tapée plutôt que révélée, ni avec combien de fautes ; une étude des
  fautes réelles devra se faire autrement (S1305).
- b) **un champ nouveau** (`saisie: { fautes }`, ou une valeur `via:
  'saisie'`) : lots en v2 (`sync/lots.ts:21-22`), `problemeLot` et sa copie
  dans les règles, `d.v in [1, 2]` déployé **avant** le site, l'APK mis à
  jour d'abord (lot 9 du J1b, « De préférence, APK mis à jour avant le
  site »). Un APK en retard garde ces lots dans `a_relire` jusqu'à sa mise à
  jour. Coût : M, et un déploiement des règles.
- c) garder le texte tapé (`reponse` libre) : refusé. Il casserait le sens
  de `reponse` (la matrice des confusions attend un id), et enverrait en
  ligne du texte libre (décision « Confidentialité et ouverture des
  comptes » ; borne de 160 caractères par événement, `firestore.rules:318`).

**Recommandation : a.** Le besoin du ticket est « sans casser un APK en
retard », et la note figée à l'écriture (`srs/note.ts:1-3`) suffit à FSRS.
Si un jour un autre champ demande la v2, le nombre de fautes pourra venir
avec. Par défaut : a.

**Les données par version.** L'APK juge avec ses propres noms et alias
(§ 1). Une réponse jugée fausse dans un APK ancien (alias absent) et juste
sur le site reste ce qu'elle a été : sa note est figée. C'est accepté
(S1304).

**Le réglage D1301** reste sur l'appareil, hors synchro, comme les autres
réglages de ⚙.

## 7. Protocole de l'essai des claviers sur l'A37

**But** : répondre à D1311 et D1312, et mesurer le temps d'une réponse
tapée. **Qui** : l'utilisateur, au doigt. Aucune session n'est nécessaire,
sauf pour l'étape 6 (mesures, câble USB). **Durée** : ≈ 25 min. **Rien à
installer de neuf** côté Terramemo : la vue Saisie est en ligne (⚙ →
« Essai des claviers », `index.html:59`) et dans l'APK actuel (à vérifier,
S1306). Aucun progrès n'est en jeu : la vue Saisie n'écrit rien au journal.

Ce protocole complète celui du skill (`SKILL.md:1284-1296`) ; une session
pourra l'y recopier après l'essai.

**Préparation.**
1. Installer Gboard : Play Store → « Gboard ». Paramètres → Gestion
   globale → Liste des claviers et clavier par défaut → Clavier par
   défaut : on bascule entre « Clavier Samsung » et « Gboard » (chemin du
   skill, l. 1286-1288).
2. Laisser les réglages des deux claviers **tels qu'installés** : le public
   ne les change pas. Noter seulement si le texte prédictif, la correction
   automatique et l'écriture gestuelle (glisser) sont actifs.

**Les 12 cases** : 2 claviers × 2 appareils (Chrome, APK) × 3 champs
(« Champ réglé », « Champ témoin », « Variante type=url »).

**Pour chaque clavier, dans Chrome puis dans l'APK** (⚙ → « Essai des
claviers ») :
1. **Témoin d'abord** : dans « Champ témoin », taper « fra ». Le clavier
   doit proposer des mots : sinon, l'essai ne prouve rien pour ce clavier.
2. **Barre de suggestions** : dans « Champ réglé », taper « fra », effacer,
   « sai », effacer. Noter tout ce qui s'affiche au-dessus des touches
   (mots, noms de pays, presse-papiers, emoji).
3. **Correction à l'espace** : taper « ouzbekstan » puis un espace, puis
   « kirghizstan » et un espace, puis « zambie » et un espace. Le mot
   change-t-il (accent ajouté, lettre corrigée, autre mot) ?
4. **Majuscule** : la première lettre sort-elle en majuscule ?
5. **Glisser** (si l'écriture gestuelle est active) : glisser « france ».
   Le mot sort-il d'un dictionnaire, avec un espace ajouté ?
6. **Mot appris** : après l'étape 3, effacer et taper « ouz » : le clavier
   propose-t-il « ouzbekstan » ?
7. **Touche Entrée** : son libellé (« OK », « Terminé », une flèche) ;
   ferme-t-elle le clavier ?
8. Recommencer 2 à 7 dans « Variante type=url » ; noter en plus si la barre
   d'espace et les accents (appui long sur « e ») existent.

**Hauteur de page** (APK, puis Chrome ; reprend l'étape 3 du skill,
l. 1245-1248) :
- toucher « Champ réglé » : la page rétrécit-elle (le bas de la vue remonte
  au-dessus du clavier) ou le clavier passe-t-il par-dessus ? Revenir à la
  carte clavier ouvert, puis fermé : la carte retrouve-t-elle sa vue ?
- **mesure, avec le téléphone branché au PC** (une session le fait) :
  `chrome://inspect` → la page (ou la WebView de l'APK) → console, clavier
  fermé puis ouvert : `[innerHeight, visualViewport.height,
  visualViewport.offsetTop]`. Et une capture du téléphone clavier ouvert
  (`adb exec-out screencap -p > clavier-<nom>.png`), pour la hauteur du
  clavier en pixels.

**Temps d'une réponse** (Chrome, le clavier gardé ensuite) : taper au
chronomètre, chacun puis Entrée, « Kirghizstan », « Papouasie-Nouvelle-Guinée »,
« Islande », « Mozambique », « Sao Tomé-et-Principe ». Noter le temps de
chacun : il dira ce que la saisie ajoute à une séance (S1303).

**Feuille de résultats** (à recopier dans le registre, ou à dicter à une
session) :

| Clavier | Appli | Champ | Suggestions | Correction à l'espace | Majuscule | Glisser | Mot appris | Entrée | Espace, accents | Page rétrécie |
|---|---|---|---|---|---|---|---|---|---|---|
| Samsung | Chrome | réglé | | | | | | | — | |
| Samsung | Chrome | témoin | (doit en avoir) | | | | | | — | — |
| Samsung | Chrome | url | | | | | | | | — |
| Samsung | APK | réglé | | | | | | | — | |
| Samsung | APK | témoin | (doit en avoir) | | | | | | — | — |
| Samsung | APK | url | | | | | | | | — |
| Gboard | Chrome | réglé | | | | | | | — | |
| Gboard | Chrome | témoin | (doit en avoir) | | | | | | — | — |
| Gboard | Chrome | url | | | | | | | | — |
| Gboard | APK | réglé | | | | | | | — | |
| Gboard | APK | témoin | (doit en avoir) | | | | | | — | — |
| Gboard | APK | url | | | | | | | | — |

**Règle de décision** (D1311) :
- « Champ réglé » muet (ni suggestion, ni correction, ni mot appris) dans
  les quatre cas clavier × appli → **a**, le clavier du téléphone. Une
  majuscule automatique ne gêne pas (la casse est ignorée) ;
- sinon, « Variante type=url » muette dans les quatre cas → **b** ;
- sinon → **c**, le clavier de l'appli sur le téléphone ;
- la hauteur de page tranche D1312 : si la page ne rétrécit pas dans l'APK,
  le lot 9.4 lit `visualViewport` (ou le plugin, S1307), ou D1312 passe à c.

**Pourquoi un essai à la main.** Le pilote tape par `Input.insertText` de
CDP (`driver.py:2102`), qui insère le texte sans passer par le clavier du
téléphone : il ne voit ni suggestion ni correction (S1301). Le pilote sert à
la logique (lot 9.5), pas aux claviers.

## 8. Tests

- `tests/saisie-juger.test.ts` (lot 9.1), une table de cas : chaque paire à
  une faute du § 3.4 dans les deux sens ; Niger et Nigeria ; Saint-Marin et
  Saint-Martin ; « Corée », « Congo », « Oman » (mers) → `precise` ;
  « la France », « Tampon », « St-Denis », « cote divoire », « nukualofa »,
  « Atlantique » → juste ; « Bosnie » → faux (D1308 a) ; « Zmabie » → juste
  (D1303 a) ; les noms de 4 lettres avec une faute → faux ; une saisie vide
  → `vide` ; une capitale juste parmi plusieurs (Sucre, La Paz) ;
- `tests/donnees-saisie.test.ts` (lot 9.2), sur les vraies données :
  - toute forme acceptée d'un lieu (nom, alias, formes du § 3.1), tapée
    exactement, est jugée juste pour lui et fausse pour tout autre lieu du
    domaine : c'est le **test de collision** du plan, sur toutes les paires ;
  - aucun alias n'est égal à une forme d'un autre lieu ; chaque id d'alias
    et de forme ambiguë existe ;
  - la liste des paires à une faute est figée (Gambie et Zambie, Iran et
    Irak, Irlande et Islande ; Kingston et Kingstown, Manama et Panama,
    Rome et Lomé) : une donnée nouvelle qui en crée une fait échouer le
    test, à relire ;
- un **banc des fautes** déterministe, comme `fautes.py`, en test : au moins
  94 % des fautes simples acceptées pour les pays et les capitales (le
  barème A en mesure 95,3 et 94,0), et zéro acceptée pour un autre lieu ;
- `tests/srs-seance.test.ts` : la forme de l'étape suit le domaine (`saisie`
  pour pays, capitales, mers, communes ; `retournee` pour les drapeaux, et
  pour tous si D1301 est allumé) ;
- `tests/journal-*.test.ts` : une réponse tapée passe `valider()` de la v1
  et s'encode dans un lot v1 (`compacter`, `deplier`) sans perte : la
  garantie de D1310 a ;
- tests DOM de la vue (focus à la fin du vol, Entrée, « Je ne sais pas »,
  « Précise », rétroactions du § 4.2) ; si D1311 c, ceux du clavier.

## 9. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et
`npm run build` au vert, par un commit « … (#36) », puis par un
déploiement Hosting et le pilote sur le site en ligne (skill
`run-terramemo`). Avec D1310 a, aucun lot ne touche aux règles Firestore.
Sur l'A37 : après `sauver_journal`.

| Lot | Taille | Dépend de | Attend | Critère de fin |
|---|---|---|---|---|
| 9.1 Juge | S | — | D1302 à D1305, D1308 (défauts codés) | `saisie/juger.ts` et `tests/saisie-juger.test.ts` au vert ; rien de visible |
| 9.2 Alias et test de collision | S, plus la relecture | 9.1 | **D1306** (relecture de l'annexe A), D1307 | `geodata/alias-pays.fr.json`, `public/geo/alias.fr.json`, formes ambiguës ; `tests/donnees-saisie.test.ts` et le banc au vert |
| 9.3 Clavier | S (a, b) ou M (c) | — | **l'essai du § 7**, D1311 | le champ choisi, ou `vues/clavier.ts` et ses tests |
| 9.4 La question en séance | M | 9.1, 9.2, 9.3 | D1300, D1301, D1309, D1312 à D1315 | la forme `saisie` dans `srs/seance.ts` ; la vue (dans `vues/retournee.ts` ou un `vues/ecrire.ts` voisin) ; textes ; réglage de ⚙ ; la Révision du jour se joue au clavier sur le site |
| 9.5 Pilote | S | 9.4 | — | `driver.py ui_ecrire` : « Zambie » juste, « Gambie » faux avec la zone désignée, « Corée » → « précise », « St-Denis » juste ; captures |
| 9.6 Fin du ticket | S | 9.5 | l'APK de la CI (`android.yml`) | une séance au clavier sur le site et dans l'APK de l'A37, les deux claviers ; critère de #36 |

Si D1310 b : un lot 9.0 avant 9.4 (format v2, règles déployées d'abord,
APK d'abord), taille M.

**Ordre conseillé** : 9.1 tout de suite (rien ne l'attend) ; l'essai du § 7
en parallèle, quand l'utilisateur a l'A37 en main ; 9.2 dès la relecture de
l'annexe A. Si une seule chose doit sortir vite : 9.1 et 9.4 avec le
clavier du téléphone (défaut a) et une liste d'alias vide, mis en ligne
derrière un drapeau ; 9.2 et 9.3 suivent sans rien défaire.

## 10. Décisions à trancher

Seize décisions, D1300 à D1315. « Par défaut » dit ce que le code fait sans
réponse : une constante nommée, commentée « défaut en attente de
l'utilisateur, #36 ».

| N° | Question | Options | Recommandation | Par défaut | Bloque |
|---|---|---|---|---|---|
| **D1300** | Où la saisie remplace la carte retournée (§ 2) | a) séances, quatre sujets, drapeaux exclus ; b) a + un exercice « Écrire » dans Entraînement ; c) sur demande seulement | **a** | a | 9.4 |
| D1301 | Carte retournée gardée en réglage (§ 2) | a) « Réviser les noms sans clavier » dans ⚙, éteint ; b) supprimée hors drapeaux | **a** | a | — |
| **D1302** | Tolérance selon la longueur (§ 3.2) | A) 0 / 1 / 2 fautes (≤ 4, ≤ 8, au-delà) ; B) ≤ 3, ≤ 7 ; C) 0 jusqu'à 5, puis 1 | **A** (95 % des fautes simples acceptées, rien sur 4 lettres) | A | — |
| D1303 | Distance (§ 3.3) | a) OSA (transposition = 1 faute) ; b) Levenshtein (= 2) | **a** | a | — |
| D1304 | Concurrents de la règle de collision (§ 3.4) | a) tous les noms du domaine sur la carte, capitales écartées comprises ; b) les cibles jouables seules | **a** (Saint-Martin à une faute de Saint-Marin) | a | — |
| D1305 | Formes ambiguës : Corée, Congo, Oman, mer de Chine (§ 3.5) | a) « Précise », une fois, sans note ; b) faux | **a** | a | — |
| **D1306** | Alias des pays (§ 3.6, annexe A) | a) liste courte relue ; b) Wikidata et CLDR en bloc ; c) aucun | **a**, sans les noms disputés ; Hollande et Angleterre refusées avec remarque | code avec une liste vide, **rien en ligne avant la relecture** | fin de 9.2 |
| D1307 | Anciens noms (§ 3.6) | a) récents (depuis 2018) justes avec « Nom actuel : … » ; b) tous ; c) aucun | **a** | a | — |
| D1308 | Formes allégées (§ 3.7) | a) article, St, générique des mers facultatifs, nom composé en entier ; b) a + la première partie d'un composé ; c) nom exact | **a** | a | — |
| D1309 | Note d'une réponse juste avec fautes | a) Good, comme sans faute (D3 : jamais Hard) ; b) Hard | **a** : la faute est d'orthographe, pas de mémoire | a | — |
| **D1310** | Format du journal (§ 6) | a) v1 inchangé, `reponse` = id désigné ; b) champ nouveau, lots v2, règles et APK d'abord ; c) texte tapé gardé | **a** | a | 9.0 si b |
| **D1311** | Clavier (§ 5) | a) celui du téléphone, champ réglé ; b) variante `type=url` ; c) 26 lettres dans l'appli | **selon l'essai** (§ 7, règle de décision) | a jusqu'à l'essai | 9.3 |
| **D1312** | Place du champ, clavier ouvert (§ 4.3) | a) dans la barre du bas, qui monte ; b) en haut, sous l'en-tête ; c) le clavier de l'appli, page fixe | **a**, à confirmer à l'essai | a | 9.4 |
| D1313 | Liste de noms pendant la question (§ 4.4) | a) aucune ; b) après 3 lettres, aux premières révisions | **a** | a | — |
| D1314 | Ouverture du clavier (§ 4.1) | a) focus à la fin du vol, gardé d'une question à l'autre ; b) au toucher du champ | **a** | a | — |
| D1315 | Rétroaction d'un faux (§ 4.2) | a) le bon nom, et le lieu désigné au contour entier ; b) le bon nom seul | **a** | a | — |

En gras, les six qui comptent le plus (résumé).

## 11. Suppositions à vérifier

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S1300 | Le clavier Samsung et Gboard respectent les attributs du champ réglé dans Chrome et dans la WebView de l'APK. **À vérifier** : rien n'est mesuré | l'essai du § 7 | avant 9.3 |
| S1301 | `Input.insertText` de CDP ne passe pas par le clavier du téléphone : le pilote ne voit ni suggestion ni correction. Estimé (la commande insère du texte sans frappe de touche) | sans objet : l'essai est à la main | — |
| S1302 | `juger()` répond en moins d'une milliseconde sur l'A37. Estimé (≈ 400 formes, arrêt précoce) | une mesure dans le pilote, sur le PC puis l'A37 | 9.1, 9.5 |
| S1303 | Taper un nom prend 5 à 10 s sur le téléphone, contre ≈ 3 s pour une carte retournée : une séance avec 15 introductions `nommer` (`INTRODUCTIONS_PAR_JOUR`, `srs/planif.ts:33`) s'allonge d'une à deux minutes. Estimé | le chronomètre de l'essai (§ 7) | essai |
| S1304 | Un APK juge avec les noms et alias de son build (`capacitor.config.ts:9`, `webDir: 'dist'`), et un écart de jugement entre site et APK est acceptable, la note étant figée. Mesuré pour le build ; acceptable : à confirmer par l'utilisateur | relecture | — |
| S1305 | Les fautes du banc sont tirées au hasard ; les vraies fautes du téléphone sont surtout des touches voisines (substitutions). Le taux réel d'acceptation peut différer. Estimé ; avec D1310 a, le journal ne gardera pas de quoi le mesurer | une séance d'essai notée à la main, ou un relevé local hors journal | 9.6 |
| S1306 | L'APK installé sur l'A37 a l'entrée « Essai des claviers » de ⚙ (`index.html:59`, depuis le J0). Version de l'APK de l'A37 à vérifier | ⚙ dans l'APK | essai |
| S1307 | Dans l'APK (Android récent, bord à bord), la page ne rétrécit pas d'elle-même quand le clavier s'ouvre, et `visualViewport` ou `@capacitor/keyboard` y remédie. À vérifier | l'étape « Hauteur de page » de l'essai | essai |
| S1308 | Gboard n'apprend pas les mots tapés dans un champ sans suggestions. À vérifier | étape 6 de l'essai | essai |
| S1309 | Après normalisation et retrait des signes, toutes les formes s'écrivent avec les 26 lettres. Mesuré (§ 3.1) sur les données du 25/11 ; le test de 9.2 le gardera vrai | test | 9.2 |
| S1310 | La table des formes ambiguës (§ 3.5) est complète. Estimé : trouvée en lisant les noms, pas par un calcul | dans 9.2, lister les débuts de nom partagés par plusieurs lieux et dire, pour chacun, s'il est une saisie plausible | 9.2 |

## 12. Non retenu

- **Une liste de noms qui se resserre en tapant** (autocomplétion) pendant
  la question : elle souffle la réponse (D1313). La vue Saisie du J0 la garde
  pour l'essai.
- **La saisie dans le Chrono et Sans faute** : au classement, un clavier de
  PC battrait le téléphone ; les épreuves restent au toucher.
- **Pondérer les touches voisines de l'AZERTY** dans la distance : le
  barème A accepte déjà 95 % des fautes simples ; à reprendre si l'essai
  réel (S1305) montre beaucoup de refus.
- **Une comparaison phonétique** (« Ouzbekistan » par le son) : elle
  rapprocherait Iran et Irak, Autriche et Australie, que la règle de
  collision doit justement séparer.
- **Retirer des mots** (« république de », « royaume de ») à la
  normalisation : refusé par le plan (l. 76-78) ; les alias le remplacent.
- **La saisie pour les drapeaux** : la réponse est une image. Taper le nom
  du pays d'un drapeau serait une fiche nouvelle (un troisième sens), hors
  du ticket.
- **La dictée vocale** comme mode de réponse : le clavier du téléphone
  l'offre peut-être (D1311 a) ; rien à concevoir.
- **Garder le texte tapé au journal** (D1310 c) : vie privée et sens de
  `reponse`.

## Annexe A. Alias proposés des pays (à relire, D1306)

Le nom de référence est celui de `public/geo/noms.fr.json`. « Sans
remarque » : la réponse est juste, sans autre ligne. « Remarque » : juste,
avec la ligne de D1307. Les formes déjà couvertes par les règles du § 3.1
(accents, tirets, article, « St ») ou par la tolérance ne sont pas listées
(« Vietnam » pour « Viêt Nam », « Kirghizistan » pour « Kirghizstan » : une
lettre).

| Id | Nom de référence | Alias proposés | Sorte | Raison |
|---|---|---|---|---|
| MMR | Myanmar (Birmanie) | Myanmar, Birmanie | sans remarque | les deux noms du nom de référence |
| COD | Congo-Kinshasa | RDC, République démocratique du Congo, Congo démocratique | sans remarque | nom officiel et sigle courants |
| COG | Congo-Brazzaville | République du Congo | sans remarque | nom officiel |
| CZE | Tchéquie | République tchèque | sans remarque | nom officiel encore courant |
| CPV | Cap-Vert | Cabo Verde | sans remarque | nom demandé par le pays à l'ONU |
| TUR | Turquie | Türkiye | sans remarque | idem ; « turkiye » est à 2 fautes de « turquie », au-delà de la tolérance de 7 lettres |
| USA | États-Unis | USA, États-Unis d'Amérique | sans remarque | sigle courant |
| GBR | Royaume-Uni | Grande-Bretagne | sans remarque | usage courant (inexact : sans l'Irlande du Nord) ; **à trancher** |
| TLS | Timor oriental | Timor-Leste | sans remarque | nom officiel |
| VAT | État de la Cité du Vatican | Vatican, Cité du Vatican, Saint-Siège | sans remarque | le nom de référence n'est presque jamais tapé |
| BLR | Biélorussie | Bélarus | sans remarque | nom officiel en français |
| MDA | Moldavie | Moldova | sans remarque | nom officiel |
| CAF | République centrafricaine | Centrafrique | sans remarque | usage courant |
| KNA | Saint-Christophe-et-Niévès | Saint-Kitts-et-Nevis | sans remarque | usage courant |
| FSM | Micronésie | États fédérés de Micronésie | sans remarque | nom officiel |
| PSE | Palestine | État de Palestine | sans remarque | nom officiel |
| BIH | Bosnie-Herzégovine | Bosnie | sans remarque | usage courant ; seule exception à D1308 a ; **à trancher** |
| TTO | Trinité-et-Tobago | Trinidad-et-Tobago | sans remarque | graphie en usage |
| ARE | Émirats arabes unis | Émirats, EAU | sans remarque | usage courant ; **à trancher** (« Émirats » est une partie du nom) |
| SWZ | Eswatini | Swaziland | remarque | ancien nom (2018) |
| MKD | Macédoine du Nord | Macédoine | remarque | ancien nom (2019) |
| NLD | Pays-Bas | Hollande | **refus avec remarque** (recommandé) ou alias | la Hollande en est une région ; **à trancher** |
| GBR | Royaume-Uni | Angleterre | **refus avec remarque** (recommandé) | l'Angleterre en est une nation ; **à trancher** |

**Mers** : « mer des Antilles » pour la mer des Caraïbes (sans remarque,
usage français ancien et courant). **Pas d'alias** pour les noms disputés
(golfe Persique, mer du Japon, mer de Chine méridionale) : la saisie
attend l'usage français, comme les noms affichés.

**Formes ambiguës** (§ 3.5) : « Corée » (Corée du Nord, Corée du Sud),
« Congo » (les deux Congo) ; en mer, « Oman » (golfe d'Oman, mer
d'Arabie) et « mer de Chine » (orientale, méridionale).

Les dates de changement de nom (2018, 2019) sont de mémoire : à vérifier à
la relecture, comme chaque ligne.

## Annexe B. Mesures

Toutes faites le 25/11 sur `main` à `4525155`, par les scripts hors du
dépôt cités en tête ; sorties complètes dans
`~/Sauvegardes/terramemo/saisie-libre-conception/*.txt`.

| Domaine | Lieux | Formes (noms et alias) | Longueur médiane | ≤ 4 lettres | Paires à 1 faute | Paires à 2 fautes |
|---|---|---|---|---|---|---|
| Pays (jouables) | 195 | 195 | 8 | 8 | 3 | 20 |
| Capitales | 197 | 235 | 7 | 14 | 3 | 21 |
| Océans et mers | 50 | 51 | 12 | 0 | 0 | 0 |
| Communes | 24 | 24 | 10 | 0 | 0 | 0 |

- Homonymes exacts entre lieux d'un même domaine : aucun.
- Formes dérivées (sans article, compactes) qui désignent deux lieux :
  aucune, dans les quatre domaines.
- Pays, cibles face aux 140 noms non jouables de la carte, à 2 fautes ou
  moins : 8 paires (§ 3.4), dont une à une faute (Saint-Marin et
  Saint-Martin).
- Capitales écartées : la plus proche d'une capitale juste est Baguio, à
  2 fautes de Bangui ; les autres à 3 fautes ou plus.
- Banc des fautes : 3 510 variantes pour les pays, 3 546 pour les
  capitales (§ 3.2).
