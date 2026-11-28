# J4, voisins, villes, ordres de grandeur, silhouettes : conception (25/11/2026, #6)

*Faite seule, de nuit, par une session de fond, puis relue par un agent la
même nuit (constats vérifiés dans le code et corrigés ici : format du
journal, voisins et villes en zone contestée, séance des nouveaux domaines,
Sans faute, chiffres du curseur, liste des silhouettes, quiz). Code lu sur
`main` à `a3d08a0`. Rien n'est codé.*

**Numérotation.** Les décisions vont de **D600 à D623**, les suppositions de
**S600 à S613**, dans une plage réservée à cette étude (D600 à D649, S600 à
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
et, si D617 garde la valeur estimée, le **format v2 des lots** qui la porte,
avant qu'aucune version ne les écrive (`sync/lots.ts:21-22` : un champ
nouveau du journal demande v = 2 ; règles déployées avant le site). Sinon,
un appareil resté sur l'ancienne version (l'APK de l'A37, l'APK public de
la release, un second appareil du compte) ne lirait plus les lots
synchronisés (`sync/lots.ts:150-157`, `srs/journal.ts:105`). Un APK plus
ancien que le lot 0 met ces lots dans `a_relire`, affiche « Mets à jour
l'appli » et les relit après sa mise à jour, sans rien perdre (§ 8, lot 0).
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
| Lots en ligne | 9 champs facultatifs dans un masque (`sync/lots.ts:57`) ; « on n'y ajoute qu'à la fin, et jamais pendant que v vaut 1 (un champ nouveau du journal demande v = 2) » (`:21-22`) ; un `v` inconnu, un masque inconnu ou une carte refusée rend le lot illisible pour la version (`:150-157`, `:172`) ; les règles exigent `d.v == 1` (`firestore.rules:313`) | le format v2 (le 10e champ), lu avant d'être écrit, règles d'abord (D617) |
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
  est juste pour qui la tient et pour qui la revendique. Au J4, cela donne
  les voisins neutres par une zone admise (§ 3.2) et la table des villes
  contestées (§ 4.6, D622).
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
- un toucher sur un voisin déjà trouvé ne compte pas ;
- **un voisin par une zone admise est neutre** (D605 a, règle ajoutée après
  relecture) : il n'est ni demandé ni fautif, et la rétroaction le cite à
  part, comme le Kosovo. C'est la décision « Zones contestées et enclaves »
  appliquée aux voisins : si le Maroc compte pour le Sahara occidental, la
  Mauritanie le touche.

**Voisins par une zone admise** (mesuré sur `pays.json` et
`map/acceptes.ts:60-110` : entités revendiquées par un pays jouable et
enclaves, puis leurs voisins jouables qui ne sont pas voisins de fait). Trois
paires :

| Pays | Zone admise pour lui | Voisin de la zone, pas voisin de fait |
|---|---|---|
| Maroc | Sahara occidental (`ESH`, revendiqué par le Maroc) | Mauritanie |
| Somalie | Somaliland (`NE_SOL`) | Djibouti |
| Serbie | Kosovo (`XKX`, paquet optionnel) | Albanie |

La règle est symétrique : dans « voisins de la Mauritanie », le Maroc
touché est neutre. Le Cachemire (`NE_KAS`) ne crée aucune paire : la Chine,
l'Inde et le Pakistan sont déjà voisins deux à deux. Les zones hachurées de
`contestees.json` sont dans le tracé d'un pays : elles ne créent de paire
que si elles bordent un pays qui ne borde pas leur tenant, ce qui n'est pas
mesuré (S612 ; le calcul se fait au lot 2 sur les formes, et la liste
obtenue se fige dans un test). Variante écartée : exiger ces voisins (la
Mauritanie demandée pour le Maroc), qui prendrait parti dans l'autre sens.

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
- **Sans faute** : D607 vaut aussi pour lui. Or la décision « Barème et
  classements » et les règles bornent son temps à 15 s par juste
  (`firestore.rules:133`, `temps_ms <= justes × 15000` ;
  `vraisemblable`, `epreuve/chrono.ts:577`) : une suite juste sur la Chine
  (32 s), la Russie (32 s) et le Brésil (24 s) dépasse 15 s de moyenne et
  serait refusée. **D607 remplace donc en partie « Barème et classements »
  pour les Voisins** : la borne de Sans faute devient la somme des délais des
  justes, que les règles ne connaissent pas une à une. Défaut proposé : la
  borne du pire cas, 32 s par juste pour `sansfaute:voisins:*` (le délai
  de la Chine), une constante comme `TEMPS_MAX_QUESTION_MS`, et la même
  dans `vraisemblable`. Elle est large, mais Sans faute se départage
  d'abord par le nombre de justes.

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

### 4.6 Neutralité des villes (D622)

La cible est un point : la note ne prend parti pour personne. Restent les
trois usages du **rattachement** d'une ville à un pays : le plafond de
6 par pays et le plancher par continent (D608), les grappes « par pays »
(§ 4.4) et les leurres « du même pays d'abord » (§ 4.3), plus la barre de
la recherche. Le champ `pays` de Wikidata (P17) prend parti : Jérusalem
y est rattachée à Israël, Sébastopol à la Russie ou à l'Ukraine selon
l'item, et Taipei, Pristina, Laâyoune ou Famagouste à des entités qui ne
sont pas des pays jouables.

Proposition (D622 a) :
- le rattachement est **calculé, pas lu** : l'entité de `pays.json` dont le
  tracé de fait contient le point, comme le test de S38 des capitales. P17
  ne sert qu'à vérifier, et un désaccord fait échouer le build sans ligne
  de la table ;
- une **table à la main**, `geodata/villes-contestees.json`, liste les
  villes en zone contestée ou dans une entité non jouable, chacune avec son
  rattachement affiché et sa raison, sur le modèle du tableau des statuts
  de la fiche d'un lieu et du § 10 du J5. Candidates (à confirmer sur la
  liste du lot 4a) : Jérusalem (« Israël et Palestine, statut
  contesté »), Sébastopol (« Crimée, tenue par la Russie, revendiquée par
  l'Ukraine »), Laâyoune (« Sahara occidental, statut contesté »), Taipei
  (« Taïwan, paquet optionnel »), Pristina (« Kosovo, paquet optionnel »),
  Famagouste et Nicosie-Nord si elles entrent (« Chypre du Nord ») ;
- une ville de cette table ne compte dans le plafond d'aucun pays, n'est
  leurre « du même pays » de personne, et forme ses grappes par voisinage
  seul (les villes les plus proches), jamais « par pays » ;
- la recherche montre le rattachement de la table, jamais P17 ;
- Taipei et Pristina, villes d'entités du paquet optionnel, suivent le
  paquet : hors de la liste tant qu'il est éteint (décision du 06/11 sur
  le Kosovo), comme la Serbie ne demande pas le Kosovo.

D622 b : retirer de la liste toute ville de la table, Jérusalem comprise,
ce qui est plus simple mais laisse un trou visible.

Test (`donnees-villes`, lot 4a) : chaque ville a un rattachement calculé ;
toute ville dont le point tombe dans une entité au statut autre que
`jouable` ou dans une zone de `contestees.json` est dans la table ; aucune
ville de la table ne compte dans le plafond « 6 par pays ».

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

**Le juste (D613)** : à ×1,5 près, soit de −33 % à +50 %. Mesuré sur les
195 pays jouables (`fiches-monde.json`). Le hasard est un curseur tiré
uniformément, sur l'échelle logarithmique, **dans la plage de D614** (100 à
2 milliards d'habitants, 0,1 à 20 millions de km²), calcul exact, bords
compris. La première version de ce tableau tirait sur l'étendue des
données (6,2 et 7,6 décades), plus étroite : elle surestimait le hasard
(×3 : 15 % et 12 %), corrigé à la relecture :

| Tolérance | Curseur au hasard (habitants) | Toujours la médiane (habitants) | Hasard (superficie) | Médiane (superficie) |
|---|---|---|---|---|
| ×1,25 | 2,7 % | 10 % | 2,3 % | 8 % |
| **×1,5** | **4,8 %** | **18 %** | **4,2 %** | **13 %** |
| ×2 | 8,2 % | 29 % | 7,2 % | 21 % |
| ×3 (≈ « l'ordre de grandeur ») | 13,0 % | 41 % | 11,4 % | 35 % |

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
`pays.json`, mesuré). Il reste **166** silhouettes : Afrique 49, Asie 45,
Europe 38, Amérique du Nord 16, Amérique du Sud 12, Océanie 6 (D618).

**Le critère réel** (corrigé à la relecture). La première version disait
« un disque de 7 px n'a pas de forme » : c'est faux pour une silhouette,
dessinée à sa propre échelle (D620). Le drapeau `micro` est un critère de
**forme**, mais pas celui-là : il vaut quand le plus grand morceau d'un pays
fait moins de 2 000 km² (`geodata/build.mjs:68`, `:875`, `partieMax <
SEUIL_MICRO_KM2`), quelle que soit sa surface totale. D'où des surprises
(mesuré) : le Cap-Vert (3 940 km² en tout), Samoa (2 791) et Maurice (2 020)
sont exclus, le Luxembourg (2 600, d'un seul tenant) gardé. Un pays dont
la plus grande île fait moins de 2 000 km² est, à son échelle, une poussière
d'îles ou une île de ≈ 40 km : au tracé simplifié à ~2 km, quelques dizaines
de sommets (estimé), c'est-à-dire une forme pauvre. Le critère se défend,
mais il se dit ainsi, et le nombre de sommets réel est à mesurer au lot 1
(S613).

Les 29 exclus, du plus grand au plus petit (surface totale) : Cap-Vert,
Samoa, Maurice, Comores, Sao Tomé-et-Principe, Kiribati, Dominique,
Bahreïn, Micronésie, Sainte-Lucie, Tonga, Singapour, Palaos,
Antigua-et-Barbuda, Andorre, Barbade, Seychelles, Saint-Vincent-et-les
Grenadines, Grenade, Malte, Saint-Christophe-et-Niévès, Marshall,
Liechtenstein, Maldives, Saint-Marin, Nauru, Tuvalu, Monaco, Vatican. Les
plus petits gardés : Luxembourg (2 600 km²), Trinité-et-Tobago (5 144),
Chypre (5 396), Brunei (5 742), Palestine (6 079). La liste est à montrer
à l'utilisateur (D618).

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

**Répartition à 6 sujets** (lu dans le code, aucune règle nouvelle) :
`parts()` (`quiz/tirage.ts:19-25`) donne à chaque sujet `⌊20 / 6⌋ = 3`
questions et les 2 du reste à deux sujets tirés par la graine de la partie,
autres à chaque partie : 3, 3, 3, 3, 4, 4 dans un ordre tiré. Sur la
durée, chaque sujet a donc 20 / 6 questions en moyenne, sans poids fixe au
classement. Les formes de la difficulté (8 QCM et 12 toucher au difficile,
`quiz/regles.ts:23`) sont mélangées sur les 20 questions, pas par sujet
(`tirage.ts:36-39`) : un sujet n'a pas de forme réservée. Silhouettes et
Villes ont les deux formes, comme les sujets du J2 : aucun cas de sujet à
une seule forme ne se pose avec D604 a. Test (lot 5, `quiz.test`) : à
graine fixe sur 6 générateurs, les parts font 20, chacune 3 ou 4, et deux
sujets seulement en ont 4.

### 7.5 Séance : Apprendre et la Révision du jour (D623)

Ajouté à la relecture : la première version donnait aux cinq domaines des
fiches « dans les deux sens » sans dire comment la séance les pose. Or
`srs/seance.ts:183` fixe la forme d'une étape par le **sens seul** : `qcm`
pour le QCM d'apprentissage, `retournee` pour toute fiche `nommer`,
`trouver` (un toucher, noté par `noter` sur un pays) pour toute fiche
`localiser`. La carte retournée allume la zone de l'entité
(`vues/retournee.ts:105`, `allumerZone`) et « Révéler » montre
`rendu.revelation` (`:95`). Pour les drapeaux, cela tient : le pays allumé
est la question, le drapeau la réponse. Pour le J4, le tableau dit ce que
ferait la séance telle quelle, et ce qu'il faut :

| Fiche | Telle quelle (`seance.ts:183`) | Proposée (D623 a) |
|---|---|---|
| `silhouettes:*:localiser` | `trouver` : juste si l'énoncé montre la silhouette (`enonce`, comme « Pays de ce drapeau : ») | `trouver`, avec le dessin dans l'énoncé (lot 1) |
| `silhouettes:*:nommer` | `retournee` : le pays allumé **donne la réponse**, la silhouette n'est pas montrée | `retournee` sans zone allumée : la silhouette en question, « Révéler » montre le nom, puis le pays sur la carte (lot 1) |
| `voisins:*:localiser` | `trouver` : un seul toucher, noté sur le pays demandé lui-même | une forme `voisins` (plusieurs touchers, § 3.2), posée par `vues/voisins.ts` (lot 2) |
| `voisins:*:nommer` | `retournee` : la Hongrie allumée, ce qui n'est pas la question du § 3.3 | `trouver`, l'énoncé étant la liste des voisins, les ensembles ambigus admis (lot 2) |
| `villes:*:localiser` | `trouver` noté par `noter` sur un pays : faux sens | `trouver` noté par `noterPoint` (lot 4b) |
| `villes:*:nommer` | `retournee` : `allumerZone` d'un Qid, qui n'est pas une zone | `retournee` avec un anneau sur le point (`anneauEn`), « Révéler » le nom (lot 4b) |
| `habitants`/`superficies:*:localiser` | `trouver` : un toucher du pays, sans curseur | une forme `curseur` (§ 5.2, lot 3) |
| `habitants`/`superficies:*:nommer` | `retournee` : le pays allumé, sans le chiffre | en Révision du jour, le QCM du § 5.3 (4 pays à ×3) : une carte retournée « environ 230 millions : quel pays ? » n'a pas de réponse unique à ×1,5 (Pakistan, Nigeria, Brésil) (lot 3) |

La forme vient donc d'une table **par domaine et par sens**
(`formeDe(domaine, sens)` dans `srs/seance.ts`), qui garde la règle
actuelle pour les cinq domaines du J2. `FormeEtape` gagne `voisins` et
`curseur`. Le QCM des grandeurs en révision est plus facile qu'un rappel
(25 % au hasard) : c'est le prix de D623 a ; D623 b serait une carte
retournée avec le chiffre et deux pays candidats nommés, plus lourde.

**QCM d'apprentissage** (Apprendre, `etape(…, 'qcm')`) : le Reconnaître de
chaque sujet (§ 3.3, 4.3, 5.3, 6.2), sauf Voisins, dont le Reconnaître est
un toucher : son QCM d'apprentissage est « Quel pays a pour voisins … ? »
à 4 noms, l'autre pays d'un ensemble ambigu jamais leurre.

**`source()` de la vue** (`vues/seance.ts:245-259`) : un `switch` sur
`Domaine`, que le lot 0 doit étendre (TypeScript l'exige) en rendant
`null`, « pas encore posable », pour les cinq domaines ; chaque lot y met
le chargement de ses données (capitales comme modèle : `aCharger`,
`charger`).

**Introductions** (calcul) : 156 + ≈ 200 + 195 + 195 + 166 = **≈ 912 fiches
`nommer`** à introduire, au plafond commun de 15 par jour
(`INTRODUCTIONS_PAR_JOUR`, `srs/planif.ts:33`), soit **61 jours au moins**
pour le seul J4, plafond plein et rien d'autre à introduire. Grappes :
celles des pays (`grappesPays`), moins les 39 pays sans voisin (Voisins) et
les 29 micro-États (Silhouettes) ; Villes, ≈ 30 grappes de 5 à 8 (estimé :
200 / 6,5). La simulation de charge (S607) dira la charge par jour.

**Carte de la mémoire** (décision « Répétition espacée des nouveaux
sujets » : sujet choisi dans la légende, détail au toucher) : Voisins,
Habitants, Superficies et Silhouettes teintent le pays par le seau de sa
fiche, comme Capitales et Drapeaux (`domaineDe`, `vues/carte-memoire.ts:55`,
avec les domaines jouables) ; Villes a son calque de points (§ 4.4,
lot 4b). Le détail au toucher d'un pays montre ses deux fiches du sujet
choisi, sans le chiffre (Habitants : pas de réponse affichée hors d'une
fiche).

**Tests** :
- `srs-seance` : la table `formeDe` sur les dix domaines et les deux sens ;
  une fiche `silhouettes:` en révision n'allume pas sa zone ; une fiche de
  domaine pas encore jouable ne donne aucune étape ;
- `seance-vue` : une Révision du jour qui mêle un pays, une silhouette, des
  voisins, une ville et un chiffre pose chaque étape sous sa forme (un lot
  par sujet ajoute son cas) ;
- `carte-memoire` : une silhouette faible et une jamais vue se distinguent
  (comme les drapeaux).

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
  - si D617 a : le champ `estime` (nombre > 0, ≤ 10¹⁰) dans `Evenement`,
    `CHAMPS_CONNUS` et `probleme()` (`srs/journal.ts`), et le **format v2
    des lots** (`sync/lots.ts`), comme le veut son en-tête (`:21-22` :
    jamais de champ nouveau pendant que v vaut 1). La v2 est la v1 plus
    `estime` à la fin de `FACULTATIFS` ; `deplier` lit v1 et v2 ;
    `compacter` écrit **v1 tant qu'aucun événement du lot n'a `estime`**,
    v2 sinon, pour que seuls les lots d'Ordres de grandeur demandent la
    nouvelle version ; `problemeLot` et sa copie des règles passent à
    `d.v in [1, 2]` (`lotValide`, `firestore.rules:313` ; le profil, `:287`,
    garde sa v1), **règles déployées
    avant le site** (décision « Ouverture des épreuves d'un sujet ») ;
  - `CLE_SUJET` gagne les cinq clés (le `Record<Domaine, …>` l'impose).
    `TAILLES_SERIES` les reçoit vides, et rien n'entre dans
    `EPREUVES_SUJETS` ;
  - `source()` de `vues/seance.ts` rend `null` pour les cinq domaines
    (§ 7.5).
- **Fichiers** : `srs/fiches.ts`, `srs/journal.ts`, `sync/lots.ts`,
  `firestore.rules`, `sync/export.ts` (à vérifier : l'export liste-t-il les
  champs ?), `epreuve/chrono.ts`, `vues/seance.ts`.
- **Même format que la saisie libre.** L'étude de la saisie (#36, D1310 b)
  envisage elle aussi une v2. Si les deux la prennent, c'est **une seule**
  v2 (les deux champs à la fin de `FACULTATIFS`, dans l'ordre où ils
  arrivent), faite par le premier des deux lots qui la demande.
- **Ce que devient un APK en retard** (l'A37, l'APK public de la release
  « android » depuis le 16/11, décision « Diffusion », un second appareil
  du même compte), mesuré dans le code (`sync/envoi.ts:35`,
  `sync/depot-lots.ts:62`) : un lot qu'il ne sait pas lire, pour un `v`
  inconnu **ou** pour une fiche d'un domaine inconnu (`srs/journal.ts:105`),
  va dans `a_relire`, gardé brut, et l'appli affiche « Mets à jour
  l'appli » ; la nouvelle version le relit sans réseau, sans rien perdre.
  Personne ne force la mise à jour. Ce n'est pas propre à `estime` : tout
  domaine nouveau (J4, J5) a le même effet sur un APK plus ancien que son
  lot 0, et seul le lot 0 le borne aux APK d'avant lui. C'est la raison de
  rebâtir l'APK et de publier sa release dès le lot 0, longtemps avant
  qu'un sujet n'écrive.
- **Tests** :
  - `srs-jour` : les cinq domaines acceptés ; l'exemple de domaine refusé
    devient un autre nom (`regions`, par exemple), aux lignes `:51`,
    `:76-77`, `:83` ; `seance-vue.test.ts:455` de même ;
  - `srs-pur` : `former`, `analyser`, `soeur` sur `villes:Q90:localiser` ;
  - `sync-lots` : un lot avec `estime` s'écrit en v2, se plie et se
    déplie ; un lot sans `estime` reste en v1, octet pour octet comme
    avant ; une fiche `villes:` passe ; la pire carte reste sous 160 ;
  - `sync-lecture` : le `deplier` d'avant ce lot (v1 seule, gardé en
    copie dans le test) rend un lot v2 avec `estime`, et un lot v1 avec une
    fiche `voisins:`, illisibles (ils vont à `a_relire`, « Mets à jour
    l'appli »), puis la nouvelle version les relit sans perte ;
  - `regles.test` : un lot v2 passe, un lot v3 non ;
  - `seance-vue` : des fiches `voisins:` au journal ne donnent ni compte, ni
    question, ni teinte tant que le domaine n'est pas jouable.
- **Fin** : rien de visible ne change ; règles puis site déployés, **APK
  rebâti, publié dans la release et installé sur l'A37** avant tout lot qui
  écrit ces domaines.

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
  `geodata/silhouettes-proches.mjs` (nouveau), `driver.py` ; pour la
  séance (§ 7.5) : `srs/seance.ts` (`formeDe`), `vues/seance.ts`
  (`source()`), `vues/retournee.ts` (la carte retournée sans zone
  allumée), `vues/essai.ts`.
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
  - `quiz.test` : le générateur des silhouettes, à graine fixe ;
  - `srs-seance`, `seance-vue` : une silhouette en Révision du jour,
    posée sans zone allumée (§ 7.5).
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
  `srs/grappes.ts`, `firestore.rules`, `vues/textes.fr.json`, `driver.py` ;
  pour la séance : `srs/seance.ts` (forme `voisins`), `vues/seance.ts`,
  `vues/essai.ts`.
- **Tests** :
  - `voisins` (nouveau) : 156 pays posables, 39 exclus ; Hongrie 7, Chine
    14 ; France avec le Brésil et le Suriname ; une faute finit la question ;
    un voisin non jouable n'est ni demandé ni fautif ; un toucher en Crimée
    compte pour l'Ukraine ; les 4 ensembles ambigus figés ; les voisins par
    une zone admise figés et neutres (Maroc et Mauritanie, Somalie et
    Djibouti, Serbie et Albanie, dans les deux sens ; la liste calculée sur
    les formes, S612) ;
  - `chrono.test` : délai 4 s + 2 s par voisin ; temps maximal des séries
    (1 872 s pour « tous ») ; `vraisemblable` le suit, Sans faute compris
    (32 s par juste) ;
  - `regles.test` : un Chrono des voisins de 500 s en Europe passe, un de
    600 s non ; un `sansfaute:voisins:Asia` de 3 justes en 90 s passe (plus
    de 15 s par juste), un de 3 justes en 100 s non ;
  - `srs-seance`, `seance-vue` : la forme `voisins` en Révision du jour,
    `voisins:*:nommer` posée en `trouver` sur la liste (§ 7.5).
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
  `driver.py`, `srs/seance.ts` (forme `curseur`, QCM en révision),
  `vues/essai.ts`.
- **Tests** :
  - `grandeurs` (nouveau) : position ↔ valeur aller-retour ; Nigeria juste
    de 158 à 356 millions (237 / 1,5 et × 1,5), faux au-delà ; Chypre juste
    à 6 000 km² (tracé) comme à 10 000 (Wikidata) ; leurres à ×3 entre eux ;
    aucun QCM douteux sur les 195 pays ;
  - `journal` : `estime` refusé à 0, négatif ou non fini ;
  - `curseur-vue` : `aria-valuetext`, flèches, ± à ×1,1, départ au milieu ;
  - `srs-seance`, `seance-vue` : `habitants:NGA:localiser` en Révision du
    jour posée au curseur, `habitants:NGA:nommer` en QCM (§ 7.5).
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
  ≤ 6 000 o gzip pour les deux fichiers ; la table des villes contestées
  (§ 4.6, D622) : rattachement calculé pour chaque ville, toute ville
  hors d'un pays jouable ou dans une zone contestée dans la table, aucune
  de la table dans le plafond d'un pays.
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
  `driver.py`, `srs/seance.ts`, `vues/seance.ts`, `vues/retournee.ts`
  (l'anneau au lieu de la zone), `vues/essai.ts` (`noterPoint`).
- **Tests** : `noterPoint` (Lyon touché à 95 km, sans autre ville de la
  liste plus près, juste ; Rotterdam touché près d'Amsterdam, faux ;
  antiméridien : Suva) ; carte de la mémoire (une
  ville jamais vue distincte d'une ville faible) ; `recherche` (Mumbai trouve
  Bombay) ; `regles.test` ; `srs-seance`, `seance-vue` : une fiche
  `villes:` posée avec son anneau et notée par `noterPoint` (§ 7.5).
- **Vérification** : pilote ; toucher à 100 km près sur l'A37 (S600) ;
  aucune saccade avec le calque de points (critère « Critère de saccade »).

### Lot 5. Fin du J4

Générateurs du quiz livrés (D604, test des parts à 6 sujets, § 7.4), D52 b,
borne du général, profil sous 32 768 caractères (S608), simulation de
charge à dix domaines (S607), APK, pilote complet. Critère de #6 : chaque
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
| D605 | Voisins : Trouver | a) on touche chaque voisin, le nombre est donné, une faute finit la question, un voisin non jouable est neutre, un voisin par une zone admise aussi (Maroc et Mauritanie, Somalie et Djibouti, Serbie et Albanie, § 3.2) ; b) un bouton « J'ai fini » sans le nombre ; c) une tolérance d'une faute | **a** | a |
| D606 | Voisins : Reconnaître | a) la liste écrite des voisins, on touche le pays, les 4 ensembles ambigus justes pour les deux ; b) un QCM « Lequel touche la Hongrie ? » ; c) un seul sens | **a** | a |
| D607 | Voisins : délai au Chrono et à Sans faute | a) 4 s + 2 s par voisin, Sans faute borné à 32 s par juste (remplace en partie « Barème et classements » pour les Voisins) ; b) 15 s fixe, sans rien remplacer ; c) 30 s fixe | **a** | a |
| D608 | Villes : la liste | a) ≈ 200 par le rang combiné, capitales et territoires compris, ≤ 6 par pays, ≥ 10 par continent, relue à la main ; b) par population ; c) une liste écrite par l'utilisateur | **a** | a, liste montrée avant les épreuves |
| D609 | Villes : la carte | a) la carte habituelle, frontières comprises ; b) sans frontières (un rendu de plus, dans les trois moteurs) | **a** | a |
| D610 | Villes : le juste | a) ≤ 100 km et la plus proche du doigt parmi les villes de la liste ; b) ≤ 100 km seul ; c) ≤ 150 km ; d) un seuil par série | **a** | a |
| D611 | Villes et chiffres : note par distance ou juste et faux | a) juste ou faux partout, la distance et l'écart dans la rétroaction et le journal ; b) un classement aux points de distance pour les seules villes (remplace en partie « Barème et classements ») ; c) a, plus une « distance moyenne » au bilan d'Entraînement, sans classement | **a**, ou c si l'on veut voir sa précision | a |
| D612 | Villes : Reconnaître | a) un anneau, 4 noms, les leurres les plus proches du même pays d'abord ; b) un seul sens | **a** | a |
| D613 | Ordres de grandeur : la tolérance | a) ×1,25 ; b) ×1,5 ; c) ×2 ; d) ×3 | **b** | b |
| D614 | Ordres de grandeur : le curseur | a) une plage fixe, le départ au milieu, ± à ×1,1, la valeur à 2 chiffres ; b) en deux temps (la puissance de 10, puis le chiffre) ; c) une saisie au clavier | **a** | a |
| D615 | Ordres de grandeur : Reconnaître | a) « Lequel compte environ … ? », 4 pays à ×3 au moins les uns des autres ; b) « Lequel est le plus peuplé ? » à 2 choix ; c) classer 4 pays | **a** | a |
| D616 | Superficies des pays touchés par une zone contestée | a) juste à ×1,5 de Wikidata ou du tracé de fait, les deux cités ; b) Wikidata seul ; c) ces 30 pays hors du sujet | **a** | a |
| D617 | Journal : la valeur estimée | a) un champ `estime` au format v2 des lots (v1 tant qu'un lot n'a pas `estime`), lu par une version (lot 0) avant d'être écrit, règles `d.v in [1, 2]` puis site, APK publié d'abord ; b) rien de gardé (juste ou faux seul) ; c) `estime` gardé sur l'appareil, hors du journal synchronisé (perdu au changement d'appareil) | **a** : sans la valeur, aucune mesure de calibrage plus tard ; c'est la v2 que veut `sync/lots.ts:21-22`, la même que D1310 b de la saisie si les deux la prennent | a |
| D618 | Silhouettes : la liste | a) 166 : sans les 29 micro-États, c'est-à-dire sans les pays dont le plus grand morceau fait moins de 2 000 km² (liste au § 6.1 : Cap-Vert, Samoa et Maurice compris) ; b) 161 (a, sans les 5 archipels restants) ; c) 195 ; d) un seuil de sommets au tracé de 2 km, mesuré au lot 1 (S613) | **a**, liste montrée à l'utilisateur | a |
| D619 | Silhouettes : Trouver | a) la silhouette montrée, on touche le pays sur la carte (comme les drapeaux) ; b) le nom donné, 4 silhouettes ; c) Reconnaître seul | **a** | a |
| D620 | Silhouettes : le dessin | a) nord en haut, sans rotation, à sa propre échelle, tracé de fait et zones hachurées comme la carte ; b) à l'échelle réelle ; c) une rotation au hasard au difficile | **a** | a |
| D622 | Villes en zone contestée (§ 4.6) | a) rattachement calculé sur le tracé de fait, table à la main des villes contestées avec leur rattachement affiché, hors du plafond par pays, des leurres « du même pays » et des grappes par pays ; Taipei et Pristina avec le paquet optionnel ; b) ces villes hors de la liste | **a** | a |
| D623 | Séance : forme des fiches du J4 (§ 7.5) | a) une forme par domaine et par sens (`formeDe`), dont `voisins` et `curseur`, la silhouette sans zone allumée, l'anneau des villes, le QCM pour les chiffres en révision ; b) a, mais une carte retournée avec deux pays candidats pour les chiffres | **a** | a |
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
- **Tous** : une version du barème (`VERSION_BAREME`) ; un mode de journal
  nouveau. (La première version écartait aussi la v2 du journal, ce que
  `sync/lots.ts:21-22` ne permet pas avec `estime` : elle est maintenant
  au lot 0, D617.)

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
| S608 | La chaîne des records du profil reste sous 32 768 caractères avec 68 épreuves de plus | script sur un profil plein | lot 5. **Fausse, tranchée le 28/11** : 22 953 au pire avec les Voisins (70 %), le lot 3 l'aurait dépassée ; borne relevée à 131 072 (règles d'abord, choix de l'utilisateur), le J4 entier, un J5 à quatre sujets et le J6 font 55 957 (43 %, `tests/sync-profil.test.ts`) |
| S609 | Un appareil d'avant le lot 0 met les lots du J4 (v2, ou v1 avec un domaine nouveau) dans `a_relire` et les relit après sa mise à jour, sans rien perdre | `tests/sync-lecture`, puis l'A37 avec un APK de la release d'avant | lot 0 |
| S610 | Le seuil des formes proches (recouvrement en 64 × 64) donne des paires que l'œil juge proches | liste montrée à l'utilisateur | lot 1 |
| S611 | `sync/export.ts` reprend un champ nouveau du journal sans changement | lecture du code, test d'export | lot 0 |
| S612 | Les zones hachurées de `contestees.json` ne créent pas d'autre voisin par une zone admise que les trois paires du § 3.2 (mesuré sur les entités seules) | calcul sur les formes de `monde.topo.json`, liste figée dans `tests/voisins` | lot 2 |
| S613 | Un pays dont le plus grand morceau fait moins de 2 000 km² a une silhouette pauvre au tracé de 2 km (quelques dizaines de sommets, estimé) | compte des sommets des 29 exclus et des 10 plus petits gardés, planche montrée à l'utilisateur | lot 1 |

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
