# J4, voisins, villes, ordres de grandeur, silhouettes : conception (25/11/2026, #6)

*Faite seule, de nuit, par une session de fond, sans relecture adverse
(à la différence des études du J2 et de la fiche d'un lieu) : à relire
avant de coder. Code lu sur `main` à `a3d08a0`. Rien n'est codé.*

**Numérotation.** Les décisions vont de **D600 à D621**, les suppositions de
**S600 à S611**, dans une plage réservée à cette étude (D600 à D649, S600 à
S649). La dernière étude du dépôt s'arrête à D61 et S64
(`2026-11-16-fiche-lieu-conception.md`), mais d'autres études s'écrivent la
même nuit (J5, J6, test de placement, multijoueur) et reprendront sans doute
à D62 et S65 : cette plage ne peut pas les heurter. On peut renuméroter à la
validation.

**Mesuré** : script lancé ou fichier lu, avec chemin et ligne. **Estimé** :
jugement. **À vérifier** : ni mesuré ni lu. Les scripts de mesure, jetables,
sont gardés hors du dépôt dans `~/Sauvegardes/terramemo/j4-conception/scripts/`
(`mesures.py` sur `public/geo` ; `dbf.py`, puis `villes*.py` sur
`ne_10m_populated_places` de Natural Earth v5.1.2, téléchargé au relevé du J2
dans `~/Sauvegardes/terramemo/j2-conception/capitales/ne/`). Tailles des lots :
S (moins d'une demi-journée), M (une demi-journée à deux jours), L (plus).
Les chemins de code sont relatifs à `src/`.

Le besoin (plan, ligne J4 ; ticket #6) : « Voisins ; placer une ville (note
par distance) ; ordres de grandeur (curseur logarithmique) ; silhouettes
(sans rien de quotidien ni de flèche de direction) ». Critère de fin :
« chaque exercice : générateur testé + fiches ».

## Résumé

**Ce que je propose.** Cinq sujets de plus dans Jouer, joués comme ceux du
J2 (Apprendre, Trouver, Reconnaître, Chrono, Sans faute) : **Voisins**,
**Villes**, **Habitants**, **Superficies** et **Silhouettes**. Chaque sujet
est un domaine de la mémoire, avec ses fiches dans les deux sens, comme le
veut la décision « Répétition espacée des nouveaux sujets ». Tout reste en
juste ou faux, selon la décision « Barème et classements » du 12/11 :
- la distance d'une ville et l'écart d'une estimation restent dans la
  rétroaction et le journal, sans points ;
- la « note par distance » du plan devient donc un **seuil** (une ville est
  juste à 100 km au plus, si aucune autre ville de la liste n'est plus près
  du doigt) ;
- l'ordre de grandeur devient une **tolérance** (juste à ×1,5 près sur un
  curseur logarithmique).

Les données sont presque toutes au dépôt :
- les voisins : `pays.json` (312 frontières entre pays jouables, mesuré) ;
- les habitants et les superficies : `fiches-monde.json` du lot F2 (Banque
  mondiale 2025, Wikidata) ;
- les silhouettes : le tracé de la carte, dessiné à la volée comme la carte
  de situation de la fiche.

Seules les villes demandent un nouvel extrait de Wikidata (CC0), d'environ
200 villes, capitales comprises, choisies par la notoriété comme le quiz
facile et relues à la main.

Un **lot 0 sans effet visible** passe d'abord. Il fait lire les cinq domaines
et un champ `estime` du journal, avant qu'aucune version ne les écrive.
Sinon, un appareil resté sur l'ancienne version (l'APK de l'A37) ne lirait
plus les lots synchronisés (`sync/lots.ts:150-157`, `srs/journal.ts:105`).
L'ordre recommandé ensuite va du moins cher au plus cher :
1. Silhouettes, qui reprennent le modèle des drapeaux ;
2. Voisins ;
3. Ordres de grandeur ;
4. Villes, qui demandent données, notation au point et carte de la mémoire
   en points.

**Les choix qui comptent vraiment** (le détail et les autres choix sont au
§ 9) :
1. **D611, distance ou juste et faux** : je recommande le juste ou faux
   partout, la distance seulement dans la rétroaction. C'est la décision du
   12/11, appliquée à la lettre ; le plan disait « note par distance ».
2. **D610, le seuil d'une ville** : 100 km, et la ville demandée doit être la
   plus proche du doigt parmi les villes de la liste. Un joueur qui ne
   connaît que le pays et touche son milieu aurait ainsi ≈ 7 % de justes
   (mesuré).
3. **D613, la tolérance des ordres de grandeur** : ×1,5. Le curseur tiré au
   hasard donne alors ≈ 5 % de justes. Répondre toujours la médiane des pays
   (9 millions d'habitants) en donne 18 % (mesuré).
4. **D603, le général** : à la lettre de la décision « Général à tous les
   sujets », les Chrono du J4 y entrent. La borne passerait de 1 244 à
   ≈ 3 070 questions, et le J4 pèserait alors 59 % du général (estimé,
   § 7.3).
   Je le recommande quand même, mais c'est le choix le plus lourd de suite.
5. **D601, Jouer** : dix sujets au lieu de cinq. La décision « Écran Jouer »
   visait 2 à 7 boutons par écran. Je recommande une grille de dix tuiles,
   à vérifier à 360 px (S602), plutôt qu'un niveau de plus.
6. **D600, l'ordre des lots** : Silhouettes, Voisins, Ordres de grandeur,
   Villes, chaque sujet livrable seul.

Pour les silhouettes, la consigne du plan est tenue : ni partie quotidienne,
ni flèche, ni distance au pays proposé (critique du 04/11, I1). Une erreur
montre les deux silhouettes nommées, puis le vrai pays sur la carte (D621).

## 1. Ce qui existe et ce qui manque

| Élément | Existe (`a3d08a0`, lu) | Manque |
|---|---|---|
| Domaines | `pays`, `communes`, `capitales`, `drapeaux`, `mers` (`srs/fiches.ts:13`, `:23`) ; « figés à vie » (`:10-11`) ; un domaine inconnu rend la fiche invalide (`analyser`, `:97-105`) | `voisins`, `villes`, `habitants`, `superficies`, `silhouettes` |
| Sens | `localiser`, `nommer` (`srs/fiches.ts:15`) ; la sœur `nommer` vient au plus tôt le lendemain (`:79-83`) | rien : chaque sujet du J4 a ses deux sens (§ 3 à § 6) |
| Exemple de domaine refusé | les tests prennent `villes` comme exemple de nom refusé (`tests/srs-jour.test.ts:51`, `:76-77`, `:83` ; `tests/seance-vue.test.ts:455`) | un autre exemple (lot 0) |
| Journal | champs connus, rien d'autre (`srs/journal.ts:120-121`, refus à `:105`) ; `distance_km` ≤ 20 100 km (`:51`, `:74`) ; `reponse` = l'id que la carte désigne sur une erreur (`:37-43`) | un champ pour la valeur estimée (`estime`, D617) |
| Lots en ligne | 9 champs facultatifs dans un masque (`sync/lots.ts:57`) ; un masque inconnu ou une carte refusée rend le lot illisible pour la version (`:150-157`, `:172`) | le 10e champ, lu avant d'être écrit |
| Note FSRS | juste sans aide → Good, faux → Again, jamais Hard (`srs/note.ts:29-32`) | rien : les seuils et la tolérance donnent un juste ou un faux |
| Notation au toucher | `noter(ctx, cible, x, y)` : dans le tracé du pays ou ses zones admises, sinon la distance au bord (`map/pick.ts:334-376`) ; `distanceAuBordKm` (`map/geo.ts:436`) | la notation à un **point** (villes), plusieurs touchers par question (voisins) |
| Anneau à un point | `anneauEn([lon, lat], …)` (`map/carte.ts:159`), pour la capitale à la rétroaction (D53 c) | rien : il sert aux villes |
| Tracé d'une forme hors carte | `tracer(projection, forme…)` rend un chemin SVG (`vues/vignettes.ts:144`) ; carte de situation dessinée en temps libre (`vues/situation.ts:1-30`) | le cadrage d'un pays seul (silhouette) |
| Leurres | voisins jouables, puis les plus proches (`vues/qcm.ts:58`) ; sosies des drapeaux (`:68-89`) | des formes proches (silhouettes), des villes proches, des ordres de grandeur écartés |
| Sujets de Jouer | 5 (`vues/arbre.ts:68-80`) | 5 de plus |
| Épreuves | `EPREUVES_SUJETS` (`epreuve/chrono.ts:250-256`) ; `CLE_SUJET` (`:201`) ; tailles (`:311-325`) ; 15 s au plus par question (`:544`, `firestore.rules:108-112`) | tailles des sujets du J4 ; délai variable des voisins |
| Général | borne de 1 244 questions (`epreuve/chrono.ts:308`, `firestore.rules:109`) | la nouvelle borne (D603) |
| Quiz | formes `qcm` et `toucher` (`quiz/types.ts:7`), un générateur par sujet (`:53-66`), sujets du J2 seuls (`:16`) | générateurs des sujets qui entrent au quiz (D604) |
| Données | voisins (`public/geo/pays.json`) ; habitants et superficies (`public/geo/fiches-monde.json`, champs `h`, `ha`, `sup`) ; tracés (`monde.topo.json`) | les villes |
| Crédits | Wikidata et Banque mondiale déjà cités (`vues/textes.fr.json:656-679`) | rien |
| Pilote | `SUJETS_ENTRAINEMENT` figé à 5 (`.claude/skills/run-terramemo/driver.py:1252`, `:1593`) | la liste à jour |

**Constat qui simplifie.** Voisins, habitants, superficies et silhouettes
portent sur les 195 pays jouables. Leur entité est l'id du pays, comme pour
les capitales et les drapeaux. La carte de la mémoire, les grappes
(`grappesPays`, `srs/grappes.ts:263`) et les séries par continent valent donc
telles quelles. Seules les villes ont des entités nouvelles, qui sont des
points.

## 2. Ce que le J4 garde des décisions actées

- **Barème et classements** (12/11) : chaque épreuve classée se note en juste
  ou faux, en pourcentage, départagé par le temps ; la distance reste dans la
  rétroaction. C'est la règle de tout le J4 (D611).
- **Répétition espacée des nouveaux sujets** (10/11, D46 du 14/11) : chaque
  sujet a ses fiches dans les deux sens ; seules les grappes de pays s'ouvrent
  dans la Révision du jour, les autres par Apprendre ; au plus 15
  introductions « Reconnaître » par jour, tous sujets confondus
  (`INTRODUCTIONS_PAR_JOUR`, `srs/planif.ts:33`), avec la règle du reliquat.
- **Général à tous les sujets** (D40 a) : tous les Chrono au général (D603).
- **Ouverture des épreuves d'un sujet** (12/11) : dès que le sujet est
  livré, les règles Firestore d'abord, puis le site.
- **Écran Jouer** et **Ordre des sujets** (D53 b) : les sujets du monde
  ensemble, Communes en dernier (D601).
- **Pays et frontières** et **Zones contestées et enclaves** : frontières de
  fait, zones hachurées, jamais posées ; un toucher dans une zone contestée
  est juste pour qui la tient et pour qui la revendique.
- **Images d'une épreuve** (12/11) : une épreuve qui montre des images ne
  démarre qu'une fois toutes chargées. Les silhouettes sont dessinées sur
  place, sans téléchargement (§ 6.3), et n'attendent donc rien.
- **Langue** : noms et textes dans des fichiers de langue.
- **Fiche d'un lieu : … superficies** (D57, revue le 18/11) : la superficie
  vient de Wikidata, citée « selon Wikidata », pour tous les pays (D616).
- **En-tête** (06/11) : les villes s'ajoutent à la recherche au J4.
- La critique du 04/11 (`2026-11-04-critique.md`, I1) : pour les
  silhouettes, ni partie quotidienne, ni flèche de direction, ni « distance
  au pays proposé ».

## 3. Voisins

### 3.1 Données

La liste vient de `pays.json` : deux entités sont voisines si elles
partagent une frontière sur la carte. Elle est symétrique et testée
(`tests/donnees.test.ts`, étude fiche-lieu § 2.1). Mesuré sur les 195 pays
jouables (`mesures.py`) :
- **312 frontières** entre pays jouables, soit 624 voisins à trouver en
  tout. C'est le chiffre de l'étude des points (§ 3) ;
- **156 pays** ont au moins un voisin jouable ;
- **39 n'en ont aucun** : les îles, plus Cuba (seul voisin, la base de
  Guantánamo, `NE_USG`) et Chypre (zone tampon et bases britanniques) ;
- degrés : 17 pays à 1 voisin, 30 à 2, 27 à 3, 25 à 4, 23 à 5, 15 à 6,
  puis 9, 4, 2, 2 de 7 à 10 ; la Chine et la Russie en ont 14 ;
- **23 pays jouables** ont un voisin non jouable, soit 28 liens (le Kosovo
  pour la Serbie, le Somaliland, le Sahara occidental…) ;
- **30 liens orientés** passent d'un continent à l'autre : Russie et Chine,
  Égypte et Israël, Panama et Colombie, Espagne et Maroc, Turquie et Grèce,
  et **France–Brésil et France–Suriname** par la Guyane (déjà testé pour la
  fiche d'un lieu).

Par continent, les pays posables sont : Afrique 48, Europe 42, Asie 41,
Amérique du Nord 12, Amérique du Sud 12, Océanie 1 (la Papouasie-Nouvelle-
Guinée, dont le seul voisin est l'Indonésie).

### 3.2 Trouver : « Touche les voisins de la Hongrie »

C'est le sens `localiser` (D605). La Hongrie est allumée et nommée, avec le
nombre de ses voisins (« Voisins de la Hongrie : 7 »). On touche chaque
voisin :
- un voisin touché se marque (contour entier et remplissage, pas la couleur
  seule) et le compte avance (« 3 sur 7 ») ;
- un pays qui n'est pas voisin finit la question, fausse, comme le seul essai
  de Reconnaître (décision « Nommer ») ;
- la question est juste quand tous les voisins sont trouvés sans faute ;
- un voisin non jouable (le Kosovo pour la Serbie) n'est ni demandé ni
  fautif. La rétroaction le cite à part (« aussi : Kosovo, statut
  contesté »), comme la fiche d'un lieu ;
- un toucher dans une zone admise d'un voisin compte pour ce voisin
  (`noter` et ses zones admises, inchangés : `map/pick.ts:334`). Un toucher
  sur le pays demandé lui-même ne compte pas, sans être une faute ;
- un toucher sur un voisin déjà trouvé ne compte pas.

Chaque toucher est noté par `noter(ctx, voisin, x, y)` pour chaque voisin
encore à trouver ; le premier juste l'emporte. Rien ne change dans la carte.
Au journal, la question est **une** réponse à la fiche
`voisins:HUN:localiser`. Sur une faute, `reponse` porte l'id que la carte
désigne (le pays touché à tort) : c'est la matrice des confusions, sans
champ nouveau.

**Pourquoi le nombre de voisins est donné.** Sans lui, il faudrait un bouton
« J'ai fini », et l'oubli d'un voisin ne se distinguerait plus d'un doute.
Le nombre est un indice, mais il ne dit pas lesquels.

### 3.3 Reconnaître : « Quel pays a pour voisins… ? »

C'est le sens `nommer`, dans l'autre direction (D606). Les voisins sont
écrits, pas montrés : « Autriche, Croatie, Roumanie, Serbie, Slovaquie,
Slovénie, Ukraine ». On **touche le pays** au milieu. La cible est la
Hongrie, et `noter` vaut tel quel.

**Ensembles ambigus** (mesuré) : quatre listes de voisins désignent deux pays
chacune :
- Arabie saoudite et Oman : les Émirats arabes unis et le Yémen ;
- Chine et Inde : le Bhoutan et le Népal ;
- Indonésie : la Papouasie-Nouvelle-Guinée et le Timor oriental ;
- Italie : Saint-Marin et le Vatican.

Les deux pays sont justes, comme les capitales multiples (une zone admise de
plus pour ce sujet, `OptionsNoter.acceptes`). Un test fige ces quatre
paires.

**Pays à un seul voisin** (17) : « Quel pays a pour seul voisin l'Espagne ? »
Le Portugal (l'Espagne a aussi pour voisins la France, l'Andorre et le Maroc).
La règle des ambigus suffit.

Variante écartée : allumer les voisins sur la carte et faire toucher le
trou du milieu. C'est gratuit dès que le pays est enclavé (§ 10).

### 3.4 Séries, grappes, épreuves

- **Séries** : tous (156) et les continents, sauf l'Océanie (1 question). La
  Papouasie-Nouvelle-Guinée reste dans « tous ». La carte part cadrée sur le
  continent du pays demandé ; ses voisins d'un autre continent comptent
  (l'Égypte demande Israël et la Palestine).
- **Grappes** : celles des pays (`grappesPays`), sans les 39 pays sans
  voisin. Une grappe vide est retirée (test, comme D37 a).
- **Prérequis** : Pays, en préférence (D602).
- **Chrono et Sans faute** : une question demande 1 à 14 touchers. Le délai
  fixe de 15 s (`epreuve/chrono.ts:544`) ne va pas à la Chine. Défaut
  recommandé (D607) : **4 s, plus 2 s par voisin** (Portugal 6 s, Hongrie
  18 s, Chine 32 s). La série « tous » durerait alors 31 min au plus
  (1 872 s, mesuré), soit le marathon du Monde (195 × 15 s = 49 min).
- **Règles** : `chronoValide` borne le temps à 15 s par question
  (`firestore.rules:111`). Pour les voisins, il faut une table du temps
  maximal par série, comme `tempsQuiz()` (`:85-92`). Valeurs mesurées :
  Afrique 614 s, Asie 490 s, Europe 518 s, Amérique du Nord 98 s, Amérique
  du Sud 146 s, tous 1 872 s.

### 3.5 Accessibilité

Trouver se joue sur la carte, qui n'a pas d'équivalent au clavier (fiche
d'un lieu, § 4.11). Le compte « 3 sur 7 » et le nom du voisin trouvé
s'annoncent dans une région `aria-live`, comme la rétroaction de Reconnaître
(`vues/nommer.ts:169`). La liste des voisins de Reconnaître est du texte.

## 4. Villes

### 4.1 Liste et source

**Source : Wikidata (CC0)**, extrait figé et daté, comme les capitales
(`geodata/wikidata.mjs`, qui lit déjà les liens de site et les vues de la
Wikipédia en français). Champs : coordonnées (P625), habitants (P1082) et
leur date (P585), pays (P17), libellé français, nombre de Wikipédias, vues
sur 12 mois. Les données de Natural Earth (`ne_10m_populated_places`) datent
de 2022 (étude J2, § 2.1) : elles ne servent ici qu'à mesurer.

**Choisir par la population ne marche pas** (mesuré sur Natural Earth) :
- 402 villes de plus d'un million d'habitants, hors capitales ;
- dont 110 en Chine, 49 aux États-Unis et 45 en Inde ;
- et seulement 23 en Afrique.

La population rendrait facile ce que personne ne connaît. C'est la raison de
D48 b pour le quiz.

**Recommandation (D608)** :
- environ **200 villes**, choisies par le **rang combiné** du quiz (nombre
  de Wikipédias, vues de la Wikipédia en français sur 12 mois) ;
- capitales comprises : Paris et Londres sont les villes les plus connues, et
  les placer à 100 km près n'est pas l'exercice des capitales, où l'on touche
  le pays ;
- villes des territoires comprises (Hong Kong, San Juan, Nouméa) : la cible
  est un point, pas une entité ;
- au plus 6 villes par pays et au moins 10 par continent ;
- liste montrée à l'utilisateur et relue à la main, comme le niveau facile
  du quiz (`geodata/notoriete-main.json`).

Pour comparer (Natural Earth, mesuré) : les villes de `SCALERANK` ≤ 2
sont 184, dont 66 capitales, dans 77 pays. L'Océanie n'en a que 4. Le
plancher de 10 par continent y demande donc des villes moins connues
(Adélaïde, Wellington, Suva : estimé).

**Identifiant** : le Qid (`villes:Q90:localiser` pour Paris). Il est stable,
sans « : », et court (la pire carte reste sous 160, `tests/sync-lots`).

**Fichiers servis** :
- `public/geo/villes.json` : `[{q, lon, lat, pays, rang}]`, coordonnées à
  3 décimales (≈ 100 m), soit ≈ 10 Ko brut (estimé) ;
- `public/geo/villes.fr.json` : noms et alias (Canton et Guangzhou,
  Bombay et Mumbai), fichier de langue.

Les deux se chargent à la demande, comme `capitales.json`.

### 4.2 Trouver : « Place Lyon »

La carte est la carte habituelle, frontières comprises (D609). « Vierge »
voulait dire sans noms (pédagogie, § 2), et la carte n'en a pas. On touche.
La note est un point : distance géodésique du toucher (`versLonLat`) à la
ville. C'est le calcul de `distanceAuBordKm` réduit à un point : une
fonction `noterPoint` dans `map/pick.ts`.

**Le juste (D610).** La ville demandée doit être à 100 km au plus du doigt,
**et** la plus proche du doigt parmi les villes de la liste. Sans la seconde
condition, toucher Amsterdam pour Rotterdam serait juste. Chiffres mesurés
sur Natural Earth, avec un joueur qui ne connaît que le pays et touche son
point d'étiquette (`pays.json`, `point`) :

| Liste | Villes | Juste à 100 km | à 150 km | à 200 km | Une autre ville à moins de 100 km |
|---|---|---|---|---|---|
| `SCALERANK` ≤ 2 (capitales comprises) | 184 | 7 % | 14 % | 20 % | 9 |
| 3 par pays au plus, ≥ 500 000 h., hors capitales | 172 | 9 % | 17 % | 26 % | 36 |
| ≥ 1 million, hors capitales | 395 | 2 % | 7 % | 10 % | 147 |

À 100 km, savoir le pays ne suffit presque jamais, et une erreur de
région du pays est fausse. Lyon touché vers Grenoble, à ≈ 95 km, est juste
si Grenoble n'est pas dans la liste. Touché à Clermont-Ferrand, à
≈ 135 km, il est faux (distances estimées). Le seuil est
celui du monde. Une série de France (J6) aurait le sien (~25 km, estimé
d'après l'échelle de 50 km que proposait l'étude des points, § 3).

**Précision au doigt.** Au zoom 1, la carte du monde fait ≈ 95 km par pixel
CSS sur l'A37 (estimé : ≈ 36 000 km sur ≈ 380 px). Il faut zoomer. Une série
cadrée sur l'Europe donne ≈ 12 km par pixel (estimé). C'est à mesurer à
l'essai (S600), avec le délai de 15 s du Chrono.

**Rétroaction** : un anneau sur la vraie ville (`anneauEn`), le point
touché, la distance (« Lyon : à 84 km ») et, sur une faute, la ville la plus
proche du doigt (« plus près de Grenoble »). Au journal, `distance_km` porte
la distance au point : la définition du champ (« distance au bord de la
cible ») vaut pour un point. `reponse` porte le Qid de la ville la plus
proche du doigt (la matrice des confusions). Aucun champ nouveau.

### 4.3 Reconnaître : « Quelle est cette ville ? »

C'est le sens `nommer` (D612). Un anneau marque un point, et l'on choisit
son nom parmi 4. Leurres : les villes de la liste les plus proches, du
même pays d'abord. Au quiz facile, aucun nom proche (Kingston et
Kingstown), comme pour les capitales.

### 4.4 Mémoire, séries, recherche

- **Carte de la mémoire** : les villes sont des points, pas des zones. Il
  faut un calque de points teintés par seau, comme les pastilles, dans les
  trois rendus. C'est le gros morceau du lot 4b.
- **Grappes** : par pays, puis par voisinage (les villes d'un pays et de ses
  voisins), 5 à 8 villes.
- **Séries** : tous et les six continents (D608, au moins 10 chacun).
- **Recherche** (décision « En-tête ») : les villes y entrent, avec un
  anneau, et la barre du pays où elles sont. La fiche d'une ville est hors
  du J4 (§ 10).
- **Prérequis** : aucun (D602). Placer Lyon ne demande pas de savoir les
  pays.

### 4.5 Accessibilité

Trouver se joue sur la carte, comme les autres. Reconnaître se fait au
clavier (boutons de QCM). La distance s'annonce en `aria-live`.

## 5. Ordres de grandeur : habitants et superficies

### 5.1 Données

Elles sont déjà au dépôt (`public/geo/fiches-monde.json`, lot F2, mesuré) :
- **habitants** (`h`) : Banque mondiale `SP.POP.TOTL` 2025 pour 194 pays,
  Wikidata 2024 pour le Vatican (`hs: "wd"`) ;
- **superficie** (`sup`) : Wikidata P2046, règle du choix de l'étude
  fiche-lieu (§ 2.1), citée « selon Wikidata » (D57).

Étendue mesurée sur les 195 jouables (`mesures.py`) :

| | Min | Médiane | Quartiles | Max | Décades |
|---|---|---|---|---|---|
| Habitants | Vatican, 949 | 9,1 M | 1,9 M ; 32,7 M | Inde, 1,46 Md | 6,2 |
| Superficie | Vatican, 0,44 km² | 118 000 km² | 23 000 ; 513 000 | Russie, 17,1 M km² | 7,6 |

Le fichier se charge à la demande (le morceau de la fiche,
`fiches/chargeur.ts`). Le sujet le charge avant la partie, comme les
capitales.

### 5.2 Trouver : « Combien d'habitants au Nigeria ? »

C'est le sens `localiser`, la question qui part du pays (D614). Le pays est
allumé et nommé. Un **curseur logarithmique** donne la réponse :
- plage fixe, la même pour toutes les questions, sans quoi elle donnerait
  un indice : 100 à 2 milliards d'habitants, 0,1 à 20 millions de km² ;
- départ au milieu de la plage (sur l'échelle logarithmique), pour tous ;
- valeur affichée à 2 chiffres significatifs, en mots (« 230 millions »,
  « 1,4 milliard », `Intl.NumberFormat` en français) ;
- des boutons − et + pour régler finement (×1,1 par pas), et les flèches au
  clavier ;
- « Valider ».

**Le juste (D613)** : à ×1,5 près, soit de −33 % à +50 %. Mesuré
(`mesures.py`, 20 000 tirages pour le hasard) :

| Tolérance | Curseur au hasard (habitants) | Toujours la médiane (habitants) | Hasard (superficie) | Médiane (superficie) |
|---|---|---|---|---|
| ×1,25 | 3 % | 10 % | 3 % | 8 % |
| **×1,5** | **5 %** | **18 %** | **5 %** | **13 %** |
| ×2 | 9 % | 29 % | 8 % | 21 % |
| ×3 (≈ « l'ordre de grandeur ») | 15 % | 41 % | 13 % | 35 % |

À ×3, répondre « 9 millions » à tout serait juste deux fois sur cinq. Ce ne
serait pas un rappel au sens de FSRS. À ×1,5, il faut savoir le chiffre à
peu près.

**Au doigt** : la plage des habitants fait 7,3 décades. Sur un curseur de
≈ 300 px, ×1,5 fait ±7 px (estimé). C'est fin, d'où les boutons ± (S601).

**Rétroaction** : « Nigeria : 237 millions (Banque mondiale, 2025) ; ta
réponse : 150 millions, 1,6 fois trop peu : faux ». Le rapport s'écrit
toujours dans le sens qui dépasse 1. La valeur répondue va au journal dans
un champ nouveau, `estime` (D617).

### 5.3 Reconnaître : « Lequel compte environ 230 millions d'habitants ? »

C'est le sens `nommer` (D615) : quatre pays, un seul juste. Les leurres sont
du même continent et à ×3 au moins de la cible et entre eux. La réponse
n'est ainsi jamais douteuse à ×1,5. Le chiffre de l'énoncé est arrondi à
2 chiffres. Au-delà du facile (au quiz), des voisins.

Variantes écartées : « Lequel est le plus peuplé ? » à deux choix donne
50 % au hasard, et classer 4 pays est une note à plusieurs niveaux, sans
juste ou faux simple (§ 10).

**Paires trop proches** : 12 paires de voisins sur 312 ont moins de 10 %
d'écart d'habitants, 15 en superficie (mesuré). La règle des ×3 les écarte
d'office des QCM.

### 5.4 Superficies touchées par une zone contestée

La superficie de Wikidata ne suit pas un critère unique : Chypre 9 242 km²
contre 5 396 au tracé de fait (+ 71 %), la Somalie + 35 %, la Serbie + 14 %
(Kosovo compris), le Maroc − 25 % (étude fiche-lieu, § 2.1, tableau
mesuré). À ×1,5, des six pays de ce tableau, seule Chypre sort de la
tolérance. Les 24 autres pays touchés sont à recompter au lot 3.
Recommandation (D616) : pour les 30 pays touchés à 1 % ou plus (liste de
l'étude fiche-lieu), est juste ce qui tombe à ×1,5 de Wikidata **ou** du
tracé de fait. C'est la règle « juste pour qui tient et pour qui
revendique », appliquée à un nombre. La rétroaction cite les deux.

### 5.5 Séries, grappes, épreuves, accessibilité

- **Deux sujets**, Habitants et Superficies (D601), chacun avec les séries,
  les tailles et les grappes des pays (195, `TAILLES_MONDE`,
  `epreuve/chrono.ts:311`).
- **Prérequis** : Pays, en préférence (D602).
- **Délai** du Chrono : 15 s (curseur) et 10 s (QCM), ceux du toucher et du
  QCM (`epreuve/bareme.ts:9`).
- **Accessibilité** : c'est le seul exercice du J4 qui se joue en entier au
  clavier. Un `<input type="range">` natif porte `aria-valuetext` («
  230 millions d'habitants »), et ses boutons ± font 44 px.
- **Données qui vieillissent** : une mise à jour de l'extrait peut faire
  passer une réponse de juste à faux. FSRS n'en souffre pas : la note est
  figée au journal (`srs/note.ts:1-3`).

## 6. Silhouettes

### 6.1 Liste

Les 195 pays jouables, **moins les 29 micro-États** (`micro: true` dans
`pays.json`, mesuré) : un disque de 7 px n'a pas de forme. Il reste **166**
silhouettes : Afrique 49, Asie 45, Europe 38, Amérique du Nord 16,
Amérique du Sud 12, Océanie 6 (D618). Le Luxembourg (2 600 km²) est le plus
petit des non-micro (mesuré).

Douze pays sont des archipels dont la plus grande île fait moins de la
moitié du pays : Bahamas, Cap-Vert, Indonésie, Kiribati, Maldives,
Marshall, Philippines, Salomon, Seychelles, Tonga, Tuvalu, Vanuatu (mesuré,
`partie_max_km2 / superficie_km2`). Sept sont déjà des micro-États. Les cinq
autres restent (Bahamas, Indonésie, Philippines, Salomon, Vanuatu) :
l'Indonésie et les Philippines se reconnaissent (estimé).

### 6.2 Les deux sens

- **Reconnaître** (`nommer`, le cœur) : une silhouette, « Quel est ce
  pays ? », quatre noms.
- **Trouver** (`localiser`, D619) : la silhouette est montrée, et l'on
  touche le pays sur la carte. C'est le modèle des drapeaux (« Pays de ce
  drapeau : »), avec la même cible, l'id du pays. `noter`, les zones
  admises, les règles et les tailles d'épreuve valent tels quels.

Variante écartée pour Trouver : le nom est donné, et l'on choisit la
silhouette parmi 4. C'est un second QCM, sans la carte (§ 10).

### 6.3 Dessin

- **Le tracé de la carte** (`monde.topo.json`, simplifié à ~2 km), dessiné
  à la volée par le code de la carte de situation : `tracer`
  (`vues/vignettes.ts:144`), en temps libre (`vues/situation.ts:21-27`).
  Rien de plus à télécharger. La décision « Images d'une épreuve » n'a donc
  rien à attendre.
- **Projection propre à chaque pays** : azimutale équivalente centrée sur
  lui (`geoAzimuthalEqualArea` de d3-geo, déjà en dépendance). Sinon la
  Russie et le Canada sortiraient déformés par l'Equal Earth du monde.
- **Nord en haut, sans rotation, à sa propre échelle** : chaque silhouette
  remplit son cadre. La taille relative serait un indice, et la Russie
  écraserait le Luxembourg (D620).
- **Le tracé de fait**, avec ses zones contestées hachurées comme sur la
  carte. La silhouette ne tranche rien de plus que la carte. Ce que Natural
  Earth donne de fait pour la Crimée est à vérifier (S606).
- **Contraste** : la silhouette se lit sur le panneau à 3:1 au moins (WCAG
  1.4.11, élément non textuel). À mesurer sur les jetons de `style.css` au
  lot 1.
- **Contenu** : `Contenu` (`vues/sujets.ts:79`) n'a que le texte et l'image
  par URL. Il gagne une variante « dessin » (le chemin SVG), plutôt qu'une
  URL `data:`.
- **Texte alternatif** : neutre (« Silhouette à reconnaître »), jamais le nom
  avant la réponse, comme les drapeaux.

### 6.4 Leurres

- Facile : les voisins (`VOISINS`, `vues/qcm.ts:58`), puis les plus proches.
- Difficile et quiz expert : des **formes proches**, mesurées au build comme
  les sosies des drapeaux (`drapeaux-proches.json`). On calcule le
  recouvrement de deux silhouettes normalisées, rastérisées en 64 × 64 et
  centrées, puis on garde les paires au-dessus d'un seuil. Le fichier
  s'appelle `silhouettes-proches.json`. Le seuil se règle au lot, et la
  liste des paires est montrée à l'utilisateur.

### 6.5 Rétroaction, et ce qui n'y est pas

Sur une erreur, les deux silhouettes nommées côte à côte (« Tu as choisi
le Laos ; c'était le Cambodge »), puis la carte vole sur le vrai pays et
l'allume (D621). Il n'y a ni flèche, ni distance au pays proposé, ni partie
quotidienne (critique du 04/11, I1 ; risque « Ressembler à un jeu
existant » du plan).

## 7. Mémoire, Jouer, classements, quiz

### 7.1 Domaines et fiches

| Domaine (figé à vie) | Entité | Fiches (deux sens) | Prérequis (préférence) |
|---|---|---|---|
| `voisins` | pays | 156 × 2 = 312 | pays |
| `villes` | Qid | ≈ 200 × 2 = 400 | aucun |
| `habitants` | pays | 195 × 2 = 390 | pays |
| `superficies` | pays | 195 × 2 = 390 | pays |
| `silhouettes` | pays | 166 × 2 = 332 | pays |

Cela fait ≈ 1 820 fiches de plus, contre ≈ 1 300 aujourd'hui : pays 390,
capitales 381, drapeaux 390, mers 100, communes 48 (estimé d'après les
tailles des séries). Au plus 15 introductions par jour, tous sujets
confondus : la charge reste bornée, mais le temps pour tout voir s'allonge.
La simulation de charge (`tests/sim-charge.test.ts`, S40 du J2) est à
reprendre avec dix domaines (S607).

`PREREQUIS` (`srs/planif.ts:41`) gagne quatre lignes. C'est une préférence,
jamais un blocage (D39 b, décision « Répétition espacée des nouveaux
sujets »).

### 7.2 Jouer (D601)

Avec dix sujets, le niveau des sujets passe de 5 à 10 tuiles. Ordre
recommandé, les sujets du monde ensemble, Communes en dernier (D53 b) :
Pays, Capitales, Drapeaux, Silhouettes, Voisins, Villes, Habitants,
Superficies, Océans et mers, Communes. Les silhouettes viennent près des
drapeaux (des images de pays), et les mers avant Communes, comme
aujourd'hui.

Vignettes : Silhouettes, une silhouette ; Voisins, un pays allumé et ses
voisins cernés ; Villes, le monde en points ; Habitants et Superficies, une
icône (comme Drapeaux).

### 7.3 Épreuves et général (D603)

`CLE_SUJET` (`epreuve/chrono.ts:201`) gagne les cinq clés (le nom du sujet,
comme `capitales`), `firestore.rules` (`epreuveConnue`, `:72-78` ;
`tailles`, `:26-61`) les cinq tables.

Tailles des Chrono du général : la série « tous » plus les séries par
continent, soit deux fois le sujet, comme pour les pays.

| Sujet | Questions au général |
|---|---|
| Voisins | 156 + 155 = 311 (l'Océanie n'a pas de série) |
| Villes | ≈ 400 |
| Habitants | 390 |
| Superficies | 390 |
| Silhouettes | 332 |
| **J4** | **≈ 1 823** |
| Avant le J4 | 1 244 |
| **Général** | **≈ 3 067** |

Le J4 ferait 59 % du général. Les ordres de grandeur, à eux seuls, en
feraient 25 %. C'est la lettre de la décision « Général à tous les sujets »,
et je la recommande : un sujet de plus fait monter le total possible de
tous, comme prévu. L'autre voie (les ordres de grandeur hors du général) est
à l'utilisateur.

**Lectures du 🏆** : D52 (a par défaut, b « avant l'ouverture au public ou
le J5 ») passe de 74 à ≈ 142 épreuves lues sous a. Cela fait 68 épreuves
de plus : 5 sujets, 7 séries (6 pour les voisins), 2 modes. **D52 b devient
nécessaire au J4.**

**Profil** : la chaîne des records doit rester sous 32 768 caractères (S36 du
J2 : 18 773 mesurés). Avec 68 épreuves de plus, elle double à peu près
(estimé, S608).

### 7.4 Quiz général (D604)

Le quiz connaît deux formes (`quiz/types.ts:7`) et tire à parts égales dans
les sujets livrés.

| Sujet | Entre au quiz ? |
|---|---|
| Silhouettes | **oui** : les deux formes, comme les drapeaux |
| Villes | **oui** : toucher (avec `noterPoint`) et QCM |
| Voisins | **plus tard** : ni sa question à plusieurs touchers ni la liste écrite de Reconnaître ne sont une forme du quiz |
| Habitants, Superficies | **plus tard** : le curseur serait une 3e forme ; le QCM entrerait seul, mais « 20 questions à parts égales » ferait 2 questions de chiffres par partie, qui se ressemblent |

Avec deux sujets de plus, le quiz passe de 4 à 6 sujets. Chaque sujet du J2
y perd un tiers de sa part. L'id du quiz ne change pas, puisque la formule
reste la même (D50).

## 8. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et `npm run
build` au vert (par le verrou de la machine), puis par un commit
« … (#6) ». Si les règles changent : `npm run test:regles`, puis leur
déploiement d'abord. Ensuite, le déploiement Hosting et le pilote, selon
le skill `run-terramemo`. L'UI suit le skill `nouveau-projet`, relu avant
chaque lot qui en ajoute. Sur l'A37 : `sauver_journal` avant chaque APK.

| Lot | Taille | Dépend de | Attend | Critère de fin |
|---|---|---|---|---|
| 0. Socle du J4 | S | — | D617 | rien de visible ; un lot avec un domaine du J4 et le champ `estime` lu par cette version ; APK rebâti |
| 1. Silhouettes | M | 0 | D618 à D621 ; épreuves : D603 | sujet complet au doigt sur le site |
| 2. Voisins | M | 0 | D605 à D607 ; épreuves : D603 | idem |
| 3. Ordres de grandeur | M-L | 0 | D613 à D617 ; épreuves : D603 | les deux sujets complets |
| 4a. Villes : données | M | — | D608 (liste relue) | données testées en CI |
| 4b. Villes : exercices et mémoire | L | 0, 4a | D609 à D612 ; épreuves : D603 | sujet complet, carte de la mémoire en points |
| 5. Fin du J4 | M | tous | D604, D52 b | critère de #6 ; APK |

Les lots 1, 2, 3 et 4 ne dépendent que du socle : un sujet bloqué n'arrête
pas le suivant (D600). Un sujet peut sortir en Entraînement avant ses
épreuves classées, qui attendent d'entrer dans `EPREUVES_SUJETS`.

### Lot 0. Socle du J4

- **Contenu** :
  - `Domaine` et `DOMAINES` gagnent les cinq domaines, et
    `DOMAINES_JOUABLES` ne change pas (`srs/fiches.ts:13`, `:23`, `:34`) ;
    `TERRAIN_DOMAINE` les met sur le monde (`:37`) ;
  - le champ `estime` (nombre > 0, ≤ 10¹⁰) dans `Evenement`,
    `CHAMPS_CONNUS` et `probleme()` (`srs/journal.ts`), et à la fin de
    `FACULTATIFS` (`sync/lots.ts:57`, l'ordre des bits ne change pas pour
    les neuf premiers), avec son codec ;
  - `CLE_SUJET` gagne les cinq clés (le `Record<Domaine, …>` l'impose).
    `TAILLES_SERIES` les reçoit vides, et rien n'entre dans
    `EPREUVES_SUJETS`.
- **Fichiers** : `srs/fiches.ts`, `srs/journal.ts`, `sync/lots.ts`,
  `sync/export.ts` (à vérifier : l'export liste-t-il les champs ?),
  `epreuve/chrono.ts`.
- **Tests** :
  - `srs-jour` : les cinq domaines acceptés ; l'exemple de domaine refusé
    devient un autre nom (`regions`, par exemple), aux lignes `:51`,
    `:76-77`, `:83` ; `seance-vue.test.ts:455` de même ;
  - `srs-pur` : `former`, `analyser`, `soeur` sur `villes:Q90:localiser` ;
  - `sync-lots` : un lot avec `estime` et une fiche `villes:` se plie et se
    déplie ; la pire carte reste sous 160 ;
  - `sync-lecture` : le `deplier` d'avant ce lot rend un lot du J4
    illisible (il va à `a_relire`), puis la nouvelle version le relit ;
  - `seance-vue` : des fiches `voisins:` au journal ne donnent ni compte, ni
    question, ni teinte tant que le domaine n'est pas jouable.
- **Fin** : rien de visible ne change ; site déployé, **APK rebâti et
  installé sur l'A37** avant tout lot qui écrit ces domaines.

### Lot 1. Silhouettes

- **Contenu** : la liste (166, D618) ; `vues/silhouettes.ts`, qui cadre un
  pays seul en azimutale équivalente, le trace par `tracer` en temps libre et
  garde les tracés faits ; la variante « dessin » de `Contenu` ; le rendu du
  sujet dans `vues/sujets.ts` et `textes.sujets.silhouettes` ; le sujet dans
  `SUJETS` (`vues/arbre.ts:68`) et `DOMAINES_JOUABLES` ; les leurres (voisins,
  puis formes proches) ; `geodata/silhouettes-proches.mjs`, qui écrit
  `public/geo/silhouettes-proches.json` ; la vignette ; les épreuves
  (`EPREUVES_SUJETS`, `TAILLES_SERIES`, règles, `BORNE_GENERAL`) ; le
  générateur du quiz (D604).
- **Fichiers** : `vues/silhouettes.ts` (nouveau), `vues/sujets.ts`,
  `vues/commun.ts` (`poserContenu`), `vues/arbre.ts`, `vues/qcm.ts`,
  `vues/vignettes.ts`, `srs/fiches.ts`, `srs/planif.ts` (`PREREQUIS`),
  `epreuve/chrono.ts`, `quiz/generateurs.ts`, `quiz/types.ts`
  (`SujetQuiz`), `firestore.rules`, `vues/textes.fr.json`,
  `geodata/silhouettes-proches.mjs` (nouveau), `driver.py`.
- **Tests** :
  - `donnees-silhouettes` (nouveau) : 166 pays, aucun micro-État, chaque
    tracé non vide à la projection du pays, cadre rempli ;
    `silhouettes-proches.json` symétrique, sans paire avec un pays absent ;
  - `sujets` : l'alt ne nomme jamais le pays avant la réponse ; la
    révélation le nomme ;
  - `qcm` : jamais deux fois la même forme parmi 4 ;
  - `chrono.test` : tailles, catalogue et règles d'accord ; nouvelle borne ;
  - `regles.test` (émulateur) : `chrono:silhouettes:Africa` à 49
    questions ;
  - `quiz.test` : le générateur des silhouettes, à graine fixe.
- **Vérification** : pilote `ui_silhouettes` (une partie de Reconnaître,
  une de Trouver) ; captures à 360 px ; `performance.measure` du dessin
  sur l'A37 (S605).

### Lot 2. Voisins

- **Contenu** : `exercices/voisins.ts` (nouveau, pur) : l'état d'une
  question (trouvés, à trouver, faute, fin), ce que vaut un toucher, les
  voisins non jouables à part, les ensembles ambigus ; la vue des touchers
  multiples (Trouver, Chrono, Sans faute) ; Reconnaître par la liste écrite,
  notée par `noter` avec les ambigus admis ; le délai variable (D607) ; les
  séries sans l'Océanie ; les grappes sans les pays sans voisin ; les
  épreuves et les règles (table du temps maximal par série).
- **Fichiers** : `exercices/voisins.ts`, `vues/voisins.ts` (nouveaux),
  `vues/sujets.ts`, `vues/arbre.ts`, `vues/chrono.ts`, `epreuve/bareme.ts`
  (délai par question), `epreuve/chrono.ts` (`vraisemblable`, `:571-595`),
  `srs/grappes.ts`, `firestore.rules`, `vues/textes.fr.json`, `driver.py`.
- **Tests** :
  - `voisins` (nouveau) : 156 pays posables, 39 exclus ; Hongrie 7, Chine
    14 ; France avec le Brésil et le Suriname ; une faute finit la question ;
    un voisin non jouable n'est ni demandé ni fautif ; un toucher en Crimée
    compte pour l'Ukraine ; les 4 ensembles ambigus figés ;
  - `chrono.test` : délai 4 s + 2 s par voisin ; temps maximal des séries
    (1 872 s pour « tous ») ; `vraisemblable` le suit ;
  - `regles.test` : un Chrono des voisins de 500 s en Europe passe, un de
    600 s non.
- **Vérification** : pilote, une partie de l'Europe au doigt ; essai du
  délai de la Chine sur l'A37 (S603).

### Lot 3. Ordres de grandeur

- **Contenu** : `exercices/grandeurs.ts` (nouveau, pur) : l'échelle
  logarithmique (valeur ↔ position), l'arrondi à 2 chiffres, le juste à
  ×1,5, l'union Wikidata ou tracé (D616), les leurres à ×3 ; le curseur
  (`vues/curseur.ts`) ; les deux sujets ; `estime` écrit au journal ; le
  format des nombres en français ; les épreuves.
- **Fichiers** : `exercices/grandeurs.ts`, `vues/curseur.ts` (nouveaux),
  `vues/sujets.ts`, `vues/arbre.ts`, `vues/seance.ts` (la réponse d'une
  fiche de grandeur n'est pas un toucher), `fiches/chargeur.ts`,
  `epreuve/chrono.ts`, `firestore.rules`, `vues/textes.fr.json`,
  `driver.py`.
- **Tests** :
  - `grandeurs` (nouveau) : position ↔ valeur aller-retour ; Nigeria juste
    de 158 à 356 millions (237 / 1,5 et × 1,5), faux au-delà ; Chypre juste
    à 6 000 km² (tracé) comme à 10 000 (Wikidata) ; leurres à ×3 entre eux ;
    aucun QCM douteux sur les 195 pays ;
  - `journal` : `estime` refusé à 0, négatif ou non fini ;
  - `curseur-vue` : `aria-valuetext`, flèches, ± à ×1,1, départ au milieu.
- **Vérification** : pilote ; essai du curseur sur l'A37 (S601).

### Lot 4a. Villes : données

- **Contenu** : `npm run wikidata -- --villes` (requêtes figées
  `geodata/wikidata/requetes-villes.rq`, extrait daté) ; la table à la main
  `geodata/villes-main.json` (ajouts, retraits, noms, alias, une raison par
  ligne) ; `geodata/villes.mjs`, qui écrit `public/geo/villes.json` et
  `villes.fr.json` ; `sources.json`.
- **Tests** (`donnees-villes`, nouveau) : la liste relue, figée ; au plus 6
  par pays, au moins 10 par continent ; chaque ville dans le tracé de son
  entité ou à moins de 25 km de sa côte (le test de S38 des capitales) ;
  aucun homonyme exact, aucun alias égal au nom d'une autre ville ; poids
  ≤ 6 000 o gzip pour les deux fichiers.
- **Fin** : la liste montrée à l'utilisateur, puis validée.

### Lot 4b. Villes : exercices et mémoire

- **Contenu** : `noterPoint` (`map/pick.ts`) avec le seuil et la condition
  du plus proche (D610) ; Trouver, Reconnaître (anneau et 4 noms) ; le calque
  des points teintés de la carte de la mémoire, dans les trois rendus ; les
  grappes par pays ; la recherche ; les épreuves ; le générateur du quiz.
- **Fichiers** : `map/pick.ts`, `map/carte.ts`, `map/carte-canvas.ts`,
  `map/carte-webgl.ts`, rendu SVG, `vues/carte-memoire.ts`,
  `vues/recherche.ts`, `vues/sujets.ts`, `vues/arbre.ts`, `srs/grappes.ts`,
  `epreuve/chrono.ts`, `quiz/generateurs.ts`, `firestore.rules`,
  `driver.py`.
- **Tests** : `noterPoint` (Lyon touché à 95 km, sans autre ville de la
  liste plus près, juste ; Rotterdam touché près d'Amsterdam, faux ;
  antiméridien : Suva) ; carte de la mémoire (une
  ville jamais vue distincte d'une ville faible) ; `recherche` (Mumbai trouve
  Bombay) ; `regles.test`.
- **Vérification** : pilote ; toucher à 100 km près sur l'A37 (S600) ;
  aucune saccade avec le calque de points (critère « Critère de saccade »).

### Lot 5. Fin du J4

Générateurs du quiz livrés (D604), D52 b, borne du général, profil sous
32 768 caractères (S608), APK, pilote complet. Critère de #6 : chaque
exercice a son générateur testé et ses fiches.

## 9. Décisions à trancher

Chaque réponse se note au registre. Une réponse qui contredit une décision
actée la **remplace** (`noter_decision`, `remplace`). En attendant, le code
prend le défaut, une constante nommée et commentée « défaut en attente de
l'utilisateur, #6 ». Quatre défauts cessent d'être réversibles dès qu'un
classement en dépend :
- la liste des silhouettes (D618) ;
- le seuil des villes (D610) ;
- la tolérance des ordres de grandeur (D613) ;
- le contenu du général (D603).

Les épreuves classées d'un sujet attendent donc leur réponse, ses exercices
d'Entraînement non.

| N° | Question | Options | Recommandation | Défaut si rien n'est dit |
|---|---|---|---|---|
| D600 | Ordre des lots | a) Silhouettes, Voisins, Ordres de grandeur, Villes ; b) l'ordre du plan (Voisins, Villes, Ordres de grandeur, Silhouettes) ; c) un autre | **a** : du moins cher au plus cher, chaque sujet livrable seul | a |
| D601 | Jouer : sujets et ordre | a) dix tuiles : Pays, Capitales, Drapeaux, Silhouettes, Voisins, Villes, Habitants, Superficies, Océans et mers, Communes ; b) un sujet « Ordres de grandeur » avec un niveau de plus (Habitants, Superficies), soit neuf tuiles, mais un sujet qui n'est plus un domaine ; c) un niveau de familles (« Pays et formes », « Chiffres »…) | **a**, si les dix tuiles tiennent à 360 px (S602) ; sinon c | a |
| D602 | Prérequis | a) Pays en préférence pour Voisins, Habitants, Superficies, Silhouettes, aucun pour Villes ; b) aucun ; c) prérequis stricts | **a** (la règle D39 b) | a |
| D603 | Le général | a) tous les Chrono du J4 au général, borne ≈ 3 067 ; b) les ordres de grandeur hors du général (≈ 2 287) ; c) aucun sujet du J4 au général | **a**, à la lettre de « Général à tous les sujets » | a |
| D604 | Quiz général | a) Silhouettes et Villes au quiz, Voisins et Ordres de grandeur plus tard ; b) les cinq, avec une forme de plus ; c) aucun | **a** | a |
| D605 | Voisins : Trouver | a) on touche chaque voisin, le nombre est donné, une faute finit la question, un voisin non jouable est neutre ; b) un bouton « J'ai fini » sans le nombre ; c) une tolérance d'une faute | **a** | a |
| D606 | Voisins : Reconnaître | a) la liste écrite des voisins, on touche le pays, les 4 ensembles ambigus justes pour les deux ; b) un QCM « Lequel touche la Hongrie ? » ; c) un seul sens | **a** | a |
| D607 | Voisins : délai au Chrono | a) 4 s + 2 s par voisin ; b) 15 s fixe ; c) 30 s fixe | **a** | a |
| D608 | Villes : la liste | a) ≈ 200 par le rang combiné, capitales et territoires compris, ≤ 6 par pays, ≥ 10 par continent, relue à la main ; b) par population ; c) une liste écrite par l'utilisateur | **a** | a, liste montrée avant les épreuves |
| D609 | Villes : la carte | a) la carte habituelle, frontières comprises ; b) sans frontières (un rendu de plus, dans les trois moteurs) | **a** | a |
| D610 | Villes : le juste | a) ≤ 100 km et la plus proche du doigt parmi les villes de la liste ; b) ≤ 100 km seul ; c) ≤ 150 km ; d) un seuil par série | **a** | a |
| D611 | Villes et chiffres : note par distance ou juste et faux | a) juste ou faux partout, la distance et l'écart dans la rétroaction et le journal ; b) un classement aux points de distance pour les seules villes (remplace en partie « Barème et classements ») ; c) a, plus une « distance moyenne » au bilan d'Entraînement, sans classement | **a**, ou c si l'on veut voir sa précision | a |
| D612 | Villes : Reconnaître | a) un anneau, 4 noms, les leurres les plus proches du même pays d'abord ; b) un seul sens | **a** | a |
| D613 | Ordres de grandeur : la tolérance | a) ×1,25 ; b) ×1,5 ; c) ×2 ; d) ×3 | **b** | b |
| D614 | Ordres de grandeur : le curseur | a) une plage fixe, le départ au milieu, ± à ×1,1, la valeur à 2 chiffres ; b) en deux temps (la puissance de 10, puis le chiffre) ; c) une saisie au clavier | **a** | a |
| D615 | Ordres de grandeur : Reconnaître | a) « Lequel compte environ … ? », 4 pays à ×3 au moins les uns des autres ; b) « Lequel est le plus peuplé ? » à 2 choix ; c) classer 4 pays | **a** | a |
| D616 | Superficies des pays touchés par une zone contestée | a) juste à ×1,5 de Wikidata ou du tracé de fait, les deux cités ; b) Wikidata seul ; c) ces 30 pays hors du sujet | **a** | a |
| D617 | Journal : la valeur estimée | a) un champ `estime`, lu par une version (lot 0) avant d'être écrit, APK rebâti d'abord ; b) rien de gardé (juste ou faux seul) | **a** : sans la valeur, aucune mesure de calibrage plus tard | a |
| D618 | Silhouettes : la liste | a) 166 (sans les 29 micro-États) ; b) 161 (sans les 5 archipels restants) ; c) 195 | **a** | a |
| D619 | Silhouettes : Trouver | a) la silhouette montrée, on touche le pays sur la carte (comme les drapeaux) ; b) le nom donné, 4 silhouettes ; c) Reconnaître seul | **a** | a |
| D620 | Silhouettes : le dessin | a) nord en haut, sans rotation, à sa propre échelle, tracé de fait et zones hachurées comme la carte ; b) à l'échelle réelle ; c) une rotation au hasard au difficile | **a** | a |
| D621 | Silhouettes : leurres et rétroaction | a) leurres voisins, puis formes proches au difficile (paires montrées à l'utilisateur) ; sur une erreur, les deux silhouettes nommées, puis la carte sur le vrai pays ; b) voisins seuls | **a** | a |

**Ce qui ne se décide pas ici.** L'ordre du J4 par rapport au J5, au J6 et
au Play Store (#5) est une question posée à part. Le test de placement (#35)
servirait aussi aux sujets du J4 : un « Je connais déjà » par région
éviterait 1 800 introductions à qui sait déjà.

## 10. Non retenu

- **Voisins** : allumer les voisins et faire toucher le trou du milieu
  (gratuit pour un pays enclavé) ; une fiche par paire de voisins (624
  fiches pour une seule notion) ; « X touche-t-il Y ? » par oui ou non (50 %
  au hasard) ; les voisins par la mer.
- **Villes** :
  - Natural Earth comme source (données de 2022) ; la population comme
    critère de liste ;
  - les points de distance `1000 × e^(−d/L)` de l'étude des points (§ 3),
    remplacés par le juste ou faux du 12/11 ;
  - une carte sans frontières ;
  - une fiche de ville : à reprendre si la recherche des villes la fait
    demander (#34 ne porte que sur des zones).
- **Ordres de grandeur** :
  - une note Hard pour un « juste de peu » (`srs/note.ts:21-27` : jamais
    Hard) ;
  - une plage du curseur propre à chaque pays (un indice) ;
  - classer 4 pays (une note à plusieurs niveaux) ;
  - d'autres chiffres (PIB, altitude) : à reprendre si l'on veut un sujet de
    plus, les altitudes étant au dépôt (`alt`).
- **Silhouettes** :
  - une partie du jour, une flèche, une distance (critique I1) ;
  - des fichiers SVG servis comme les drapeaux (poids et attente pour rien :
    le tracé est déjà chargé) ;
  - une description en texte de chaque forme pour les lecteurs d'écran,
    comme pour les drapeaux (étude J2, § 14).
- **Tous** : une version du barème (`VERSION_BAREME`) ou du journal
  (`v = 2`) ; un mode de journal nouveau.

## 11. Suppositions à vérifier

La numérotation suit la plage de cette étude (S600 à S649).

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S600 | On touche une ville à 100 km près, au doigt, en 15 s, dans une série cadrée sur son continent (≈ 12 km par pixel en Europe, estimé) | essai sur l'A37, journal des distances | lot 4b |
| S601 | Le curseur et ses ± permettent ×1,5 au doigt (±7 px sur ≈ 300 px, estimé) | essai sur l'A37 | lot 3 |
| S602 | Dix tuiles de sujets tiennent sur l'écran de Jouer à 360 px de large, sans défilement gênant | capture du pilote à 360 × 800, puis l'A37 | lot 1 |
| S603 | 4 s + 2 s par voisin suffisent (Chine : 32 s pour 14 touchers, zoom compris) | essai sur l'A37 | lot 2 |
| S604 | Wikidata donne coordonnées, habitants datés et libellé français pour les ≈ 200 villes du rang combiné | relevé des requêtes, comptes | lot 4a |
| S605 | Quatre silhouettes dessinées à la volée ne gèlent pas l'A37 (critère des à-coups de 25 ms) | `performance.measure`, pilote | lot 1 |
| S606 | Le tracé de fait de Natural Earth donne des silhouettes justes pour les pays touchés (Ukraine et Crimée, Maroc et Sahara occidental, Serbie et Kosovo) | captures des 30 pays touchés, montrées à l'utilisateur | lot 1 |
| S607 | La charge de la mémoire à dix domaines reste près de ≈ 5 min par jour avec 15 introductions par jour en commun | `tests/sim-charge.test.ts` reprise sur 90 jours | lot 0, puis lot 5 |
| S608 | La chaîne des records du profil reste sous 32 768 caractères avec 68 épreuves de plus | script sur un profil plein | lot 5 |
| S609 | Un appareil d'avant le lot 0 met les lots du J4 dans `a_relire` et les relit après sa mise à jour, sans rien perdre | `tests/sync-lecture`, puis l'A37 | lot 0 |
| S610 | Le seuil des formes proches (recouvrement en 64 × 64) donne des paires que l'œil juge proches | liste montrée à l'utilisateur | lot 1 |
| S611 | `sync/export.ts` reprend un champ nouveau du journal sans changement | lecture du code, test d'export | lot 0 |

## 12. Sources

- Code et données du dépôt à `a3d08a0`, cités par chemin et ligne.
- Registre « terramemo », décisions actées citées par leur nom (§ 2).
- Études : `2026-11-04-pedagogie.md` (catalogue, § 2),
  `2026-11-04-critique.md` (I1), `2026-11-04-points-classement.md` (§ 3),
  `2026-11-10-j2-conception.md` (§ 2.1, § 9, § 13 à § 15),
  `2026-11-16-fiche-lieu-conception.md` (§ 2.1, § 4.11).
- Natural Earth v5.1.2, `ne_10m_populated_places` (domaine public), pour les
  seules mesures des villes.
- Scripts de mesure : `~/Sauvegardes/terramemo/j4-conception/scripts/`.
