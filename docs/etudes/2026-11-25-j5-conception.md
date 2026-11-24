# J5, géographie physique : fleuves, montagnes, déserts, détroits : conception (25/11/2026, #7)

*Faite seule, de nuit, par un agent, puis relue par un autre la même nuit
(constats vérifiés et corrigés : recouvrements entre classes, séance et
carte de la mémoire, tests des lots 4, 5 et 7, quota des fleuves, Alpes du
Sud, échelle estimée), sans réponse de l'utilisateur : à trancher avant
tout code. Code lu sur `main` à
`4826adc` ; le code est celui de `a3d08a0`, les commits suivants ne touchent
que `docs/etudes/` (`git diff --name-only a3d08a0 HEAD`). Rien n'est codé.*

**Numérotation.** La dernière étude validée du dépôt (fiche d'un lieu)
s'arrête à D61 et S64. Les études de cette nuit ont pris des plages à part,
relues dans `git log -- docs/etudes` avant d'écrire : D350 à D362 (test de
placement, #35), D600 à D649 (J4, #6), D860 à D899 (J6, #8), D900 à D949
(multijoueur, #9), D1300 à D1349 (saisie libre, #36). Celle-ci prend la
plage **D1700 à D1749** et **S1700 à S1749**, qu'aucune autre ne peut
heurter. Elle utilise D1700 à D1720 et S1700 à S1711. On peut renuméroter à
la validation.

**Mesuré** : script lancé ou fichier lu, avec chemin et ligne. **Estimé** :
jugement. **À vérifier** : ni mesuré ni lu. Les scripts de mesure, jetables,
et leurs sorties sont gardés hors du dépôt, dans
`~/Sauvegardes/terramemo/j5-conception/` :
- `ne/` : sept couches de `10m_physical/` de Natural Earth v5.1.2, au même
  tag que celles du projet (`geodata/build.mjs:89-94`), téléchargées le 25/11
  (empreintes dans `ne/empreintes.txt`) ;
- `scripts/` : `candidats.py` (les candidats de chaque couche),
  `wikidata.py` (API `wbgetentities`), `sparql.py` (ce que Wikidata connaît
  hors de Natural Earth), `vues.py` (vues de la Wikipédia française, API
  REST de Wikimedia, novembre 2025 à octobre 2026, la période des mers du J2),
  `pool.py` (les viviers de candidats), `faits.py` (largeurs, points
  culminants, superficies), `rang.py` (le rang combiné), `annexe.py` (les
  tables de l'annexe), `regions.mjs`, `longueurs.mjs` et `poids.sh` (aires,
  recouvrements, longueurs et poids, avec le mapshaper du projet) ;
- `sorties/` : les extraits et `rang.json`, d'où viennent les listes de
  l'annexe.

Tailles des lots : S (moins d'une demi-journée), M (une demi-journée à deux
jours), L (plus). Les chemins de code sont relatifs à `src/`.

Le besoin :
- le plan, ligne J5 : « Détroits, montagnes, déserts, puis une centaine de
  fleuves (océans et mers avancés au J2) », critère de fin « Poids dans le
  budget, aucun nom manquant », taille L (`docs/plan.md`, table des jalons) ;
- le ticket #7 : « Fin : poids dans le budget testé en CI, aucun nom manquant
  dans une langue » ;
- la question 9 de la synthèse du 04/11 : « (a) Extension au J5, sur une
  liste choisie (une centaine de fleuves, les grandes chaînes, mers et
  détroits) » (`docs/etudes/2026-11-04-synthese-agents.md:121`) ;
- la décision « Océans et mers » : les océans, 45 mers et golfes, la Manche,
  le canal du Mozambique et les baies d'Hudson et de Baffin sont faits au J2 ;
  « les autres détroits et baies, le relief et les fleuves restent au J5 ».

## Résumé

**Ce que je propose.** Quatre sujets de plus dans Jouer, joués comme les
océans et mers (Apprendre, Trouver, Reconnaître, Chrono, Sans faute), chacun
un domaine de la mémoire avec ses fiches dans les deux sens : **Fleuves**
(100), **Montagnes** (40 chaînes et plateaux), **Déserts** (25) et
**Détroits et canaux** (30). Les listes sont tirées comme celle des mers :
les candidats de Natural Earth et de Wikidata, classés par le rang combiné
(nombre de Wikipédias et vues de la Wikipédia française sur 12 mois), puis
filtrés par des règles écrites. Elles sont dans l'annexe, chiffrées, avec
leurs suivants et leurs écartés, à relire ligne à ligne.

Chaque sorte d'objet a sa cible :
- un **fleuve** est une ligne : pendant la question, tous les fleuves de la
  série sont dessinés, et un toucher est juste à 12 px du bon, si aucun
  autre n'est plus près ;
- une **chaîne** ou un **désert** est un polygone invisible posé sur les
  pays : juste dedans ou à 12 px ;
- un **détroit** est un point, montré en pastille comme un micro-État.

Pendant une question du J5, la terre ne désigne donc plus le pays sous le
doigt. Le reste du jeu n'en voit rien.

Les données tiennent dans une couche à part, chargée à la demande comme la
couche marine : 45 Ko gzip au repos et 25 Ko pour les gestes (mesurés), avec
leurs budgets testés en CI et un nom par objet dans chaque langue (le
critère de fin du plan). Trois constats ont guidé la conception :
- Natural Earth découpe les fleuves par nom : son Nil n'a que 42 % de la
  longueur du fleuve, son Amazone 49 %. Il faut donc une table d'assemblage
  relue ;
- ses liens vers Wikidata se trompent parfois (le Colorado) ;
- des objets très connus y manquent (les Apennins, le détroit d'Ormuz, le
  détroit de Béring, le pas de Calais). D'où des détroits en points, tirés de
  Wikidata.

**Les choix qui comptent vraiment** (le détail et les 21 décisions sont au
§ 15) :
1. **D1700, les listes** : celles de l'annexe. 42 fleuves sur 100 sont
   européens, effet voulu des vues françaises ; un quota par continent est
   possible.
2. **D1706 et D1707, ce qu'on voit et ce qui est juste** : les fleuves et
   les détroits de la série sont dessinés, sans nom, comme les frontières
   pour les pays. Le juste est à 12 px, au plus proche. L'autre voie, une
   carte muette notée en kilomètres, ferait d'une erreur proche une
   distance, ce que le barème du 12/11 renvoie à la rétroaction.
3. **D1705, un fleuve et ses tronçons** : le Nil comprend le Nil Blanc et la
   Kagera, l'Amazone l'Ucayali, mais jamais un affluent. Le Nil Blanc sort
   alors de la liste.
4. **D1702, les montagnes** : des chaînes et deux grands plateaux (le
   Massif central et le Deccan), sans les sommets. Le plateau tibétain et
   l'Altiplano sortent : leurs polygones contiennent l'Himalaya, le
   Karakoram, le Kunlun ou sont dans les Andes (mesuré à la relecture,
   D1719). Ceux-ci
   viendraient plus tard en sujet à part (liste en annexe).
5. **D1712, Jouer** : avec le J4, on passerait de 5 à 14 sujets. Je propose
   une tuile « Nature » qui ouvre Océans et mers et les quatre sujets du J5.
6. **D1713, le général** : + 295 questions, à la lettre de « Général à tous
   les sujets ».

L'ordre des lots va du plus proche de la couche marine au plus neuf : un
socle sans effet visible, les données, la carte, puis les déserts et les
chaînes, les détroits, et les fleuves en dernier (§ 14).

## 1. Ce qui existe et ce qui manque

| Élément | Existe (`a3d08a0`, lu) | Manque |
|---|---|---|
| Domaines | `pays`, `communes`, `capitales`, `drapeaux`, `mers` (`srs/fiches.ts:13`, `:23`), « figés à vie » (`:10-11`) ; le J4 en prévoit cinq de plus (étude du J4, § 7.1) | `fleuves`, `montagnes`, `deserts`, `detroits` (D1701) |
| Couches de la carte | les pays (`DonneesCarte.entites`) et la couche marine (`DonneesCarte.mers`, `map/donnees.ts:17`), chargée à la demande (`map/mers.ts:1-7`) ; l'index commun ne connaît que `'pays' \| 'mers'` (`map/lieux.ts:14`) | une couche physique, chargée à la demande, avec ses lignes (fleuves), ses polygones (chaînes, déserts) et ses points (détroits) |
| Lignes dessinées | les lignes de repère (équateur, tropiques, grille), « que du dessin : ni pick ni noter ne les voient » (`map/lignes.ts:14-15`) | des lignes qu'on touche : un fleuve est une cible |
| Notation au toucher | `noter` : le tracé d'un pays, ses zones admises, ou la couche marine (`map/pick.ts:334-376`) ; `pickMer` : la terre gagne, sauf l'eau à 12 px (`:256-278`) ; la couche d'une cible est lue dans l'index, sinon un id de 3 à 8 lettres sans couche marine lève « cible marine avant la couche marine » (`:378`, `:386-396`) | une notation à une ligne (fleuves), à un polygone posé sur la terre (chaînes, déserts), à un point (détroits ; le J4 en écrit une pour les villes, `noterPoint`, étude du J4 § 4.2) |
| Tolérances | 12 px autour d'un tracé (`SONDES_PROCHE`, `map/pick.ts:46`) ; disque de 7 px et cible de 44 px d'un micro-État (`map/pastilles.ts:7-13`) | rien : le J5 les reprend (§ 5.4, § 8.3) |
| Pastilles | cachées pendant une question de mer (décision « Pastilles cachées pendant une question de mer » ; `cacherPastilles`, `map/carte.ts:737`) | la même règle pour les quatre sujets du J5 (D1711) |
| Données | `monde.topo.json`, `pays.json`, la couche marine (`public/geo/mers*.json`) ; seules les zones marines viennent de `10m_physical/` (`geodata/build.mjs:94`, `:117`) | `ne_10m_rivers_lake_centerlines` et `ne_10m_geography_regions_polys` dans `SOURCES`, des extraits Wikidata figés, des tables à la main |
| Noms | `noms.fr.json`, `mers.fr.json` (`{noms, alias}`, `map/mers.ts:30-33`) ; une seule langue, `LANGUES = ['fr']` (`geodata/build.mjs:66`) | `physique.fr.json`, et un test « aucun nom manquant » par langue de `LANGUES` |
| Fiches d'un lieu | sortes `pays`, `territoire`, `zone`, `continent`, `mer`, `commune` (`fiches/sorte.ts:14`) ; les riverains d'une mer par le tracé, Wikidata et une table relue (`geodata/fiches-mers.mjs:1-24`) | les sortes `fleuve`, `montagne`, `desert`, `detroit` et leurs faits (§ 11) |
| Sujets de Jouer | 5 (`vues/arbre.ts:68-80`), 10 avec le J4 (étude du J4, D601) | 4 de plus (D1712) |
| Épreuves | tailles par sujet (`epreuve/chrono.ts:319-325`) ; borne du général 1 244 (`:308`, `firestore.rules:109`) | tailles des sujets du J5 ; borne + 295 (§ 13.3) |
| Quiz | `SujetQuiz` = pays, capitales, drapeaux, mers (`quiz/types.ts:16`) | les sujets du J5 qui y entrent (D1714) |
| Budgets testés | `monde.topo.json` ≤ 520 000 o gzip (`tests/donnees.test.ts:316`) ; mers ≤ 56 000 et 24 000 o (`tests/donnees-mers.test.ts:498-499`) ; 20 000 sommets par image pendant un geste (`BUDGET_SOMMETS`, `map/carte-canvas.ts:158`) | les budgets de la couche physique (§ 12) |
| Crédits | Natural Earth et Wikidata déjà cités (`vues/textes.fr.json:626`, `:635-638`) | la mention « fleuves, chaînes et déserts » ajoutée à Natural Earth |

**Constat qui complique.** Au J2, tout ce qui se touchait était une zone qui
pave la carte : un pays sur la terre, une mer dans l'eau, et la règle
« ce qu'on voit sous le doigt est ce qui compte » (décision « Toucher sur la
terre ferme ») suffisait. Un fleuve, une chaîne et un désert sont **posés
sur les pays**. Pendant une question du J5, la terre ne désigne plus le pays
sous le doigt, mais l'objet physique le plus proche. La notation se fait
donc par sujet, comme pour les mers (`noterMer`, `map/pick.ts:406-423`), et
ne change rien aux autres sujets.

**Constat qui simplifie.** Le J2 a déjà fait le plus dur pour la couche
marine : un fichier à part chargé à la demande, une version légère pour les
gestes, un maillage WebGL dans un worker à part, des ids courts, une table
d'affectations relue et des budgets testés (étude du J2, § 2.3 et § 4.2). La
couche physique reprend ce modèle tel quel.

## 2. Ce que le J5 garde des décisions actées

- **« Océans et mers »** : on ne refait ni les océans ni les mers. La Manche
  et le canal du Mozambique restent des zones des mers : ils ne sont pas
  posés une seconde fois comme détroits (§ 8.1). Le seuil de 30 000 km²
  (≈ 1 px au zoom 1) et le rang combiné y ont fait leurs preuves : le J5 les
  reprend (§ 4).
- **« Quiz général »** et **D48 b** : la notoriété est le rang combiné, moyenne
  du rang par nombre de Wikipédias et du rang par vues de la Wikipédia
  française sur 12 mois.
- **« Répétition espacée des nouveaux sujets »** : chaque sujet a ses fiches
  dans les deux sens, sa grappe, et s'ouvre par Apprendre ; au plus 15
  introductions « Reconnaître » par jour, tous sujets confondus.
- **« Barème et classements »** : juste ou faux partout ; la distance reste
  dans la rétroaction.
- **« Général à tous les sujets »** : les Chrono du J5 entrent au général
  (D1713).
- **« Zones contestées et enclaves »** et **« Pays et frontières »** : la règle
  porte sur un toucher de **pays**. Un fleuve, une chaîne, un désert ou un
  détroit n'appartient à personne au toucher : la cible est l'objet
  physique, et aucune zone contestée n'entre dans la note (§ 10).
- **« Fiche d'un lieu : sommets et fuseaux »** : aucun point culminant ne
  passe par une zone disputée. La même prudence vaut pour les faits des
  fiches du J5 (§ 10, § 11).
- **« Pastilles cachées pendant une question de mer »** : une mer ne se juge
  pas à un disque, un fleuve non plus (D1711).
- **« Langue »** : tous les noms dans des fichiers de langue, alias compris.
- **« Hébergement »** et **« Morceau JS principal sous 500 Ko »** : rien au
  premier affichage, tout à la demande, le code du J5 dans un morceau à part.
- **« Lignes de repère »** : elles restent du dessin. Les fleuves ne sont pas
  des lignes de repère, mais leur tracé sur la carte qui tourne et dans les
  trois rendus reprend le même code (§ 5.3).

## 3. Sources

### 3.1 Natural Earth

Couches de `10m_physical/`, v5.1.2, domaine public (mesuré, `candidats.py`,
`regions.mjs`) :

| Couche | Entités | Ce qu'on y trouve | Wikidata |
|---|---|---|---|
| `ne_10m_rivers_lake_centerlines` | 1 473 tronçons, 1 074 cours d'eau distincts par `wikidataid` | 1 201 tronçons de fleuve, 259 traversées de lac, 11 intermittents, 2 canaux ; `scalerank` de 0 à 12 | 1 473 / 1 473 |
| `ne_10m_rivers_europe`, `ne_10m_rivers_north_america` | 1 325 et 4 897 tronçons | compléments régionaux, plus fins | 521 et 2 867 |
| `ne_10m_geography_regions_polys` | 1 047 polygones | 222 chaînes (`Range/mtn`), 72 plateaux, 58 déserts, 295 îles, 160 archipels… | 956 / 1 047 |
| `ne_10m_geography_regions_elevation_points` | 711 points | 633 sommets, avec leur altitude | 539 / 711 |
| `ne_10m_geography_marine_polys` (déjà au projet) | 306 zones | 36 détroits, 16 « channels », 21 « sounds », tous fondus dans une mer au J2 (`geodata/mers-affectations.json`) | 271 / 306 |

Ce que la couche ne dit pas bien (mesuré) :
- **Un fleuve y est découpé par nom.** Le Nil de Natural Earth fait 2 764 km
  de tracé pour 6 650 km selon Wikidata : le Nil Blanc (2 681 km) est un
  autre cours d'eau. De même pour l'Amazone (49 % de sa longueur, l'Ucayali
  et le Marañón à part), le Yangtsé (39 %, le Jinsha à part), le Congo (48 %,
  le Lualaba à part) et le Paraná (34 %). Sur les 150 cours d'eau les plus
  cités, 21 ont un tracé sous 60 % de la longueur de Wikidata, 6 au-dessus
  de 130 % (le Gange : 144 %, delta compris) (`sorties/fleuves-longueurs.json`).
- **Ses liens vers Wikidata se trompent parfois.** Le Colorado des États-Unis
  est sous deux items : `Q1265` (le bon, 404 km de tracé) et `Q270627`
  (2 547 km de tracé, mais l'item d'un autre Colorado, de 1 200 km). Le
  fleuve Saint-Laurent n'a que 106 km de tracé : le reste est une zone
  marine (« channel ») et, en amont, les Grands Lacs (estimé).
- **Des objets très connus manquent.** Les Apennins (101 Wikipédias), les
  Dolomites, les Tatras sous leur item, le désert d'Arabie (74), le désert
  des Mojaves (66) n'ont pas de polygone ; le détroit d'Ormuz (129), celui de
  Béring (113), le pas de Calais, le détroit de Messine, les bouches de
  Bonifacio et le détroit de Kertch n'ont pas de zone marine
  (`sparql.py`, comparé aux couches).
- **Les polygones des régions sont des aires d'étiquette**, tracées à la main
  par Natural Earth pour placer un nom, pas des limites géologiques : 985 Ko
  en GeoJSON brut pour 352 chaînes, plateaux et déserts. Ils s'emboîtent :
  le Ténéré, le Grand Erg oriental et 17 autres déserts sont à 90 % ou plus
  dans le Sahara ; le Haut Atlas, le Rif et l'Anti-Atlas dans l'Atlas ; les
  Tatras et les Alpes de Transylvanie dans les Carpates ; 124 paires se
  recouvrent à plus de 5 % (`sorties/regions-mesures.json`). Ce compte ne
  compare que des objets **de même classe** de Natural Earth
  (`scripts/regions.mjs` : `if (B === A || B.cla !== A.cla) continue`,
  alors que son commentaire dit « même classe ou classe voisine ») : aucun
  plateau n'y est comparé à une chaîne, ni un désert à une chaîne. Refait
  à la relecture sur toutes les classes, voir § 4.

### 3.2 Wikidata

Extrait du 25/11 (mesuré) : 1 875 items de Natural Earth et 144 items de
plus, trouvés par SPARQL (détroits `Q37901`, déserts `Q8514`, chaînes
`Q46831`, montagnes `Q8502` et cours d'eau `Q4022`, au-dessus d'un seuil de
liens). Il donne le libellé et les alias français, le titre de la Wikipédia
française, le nombre de Wikipédias (sites `*wiki` seuls, comme le relevé des
mers, étude du J2 § 2.4), et la longueur (`P2043`), le bassin (`P2053`), le
débit (`P2225`), l'embouchure (`P403`), l'altitude (`P2044`), la superficie
(`P2046`), les pays (`P17`) et les coordonnées (`P625`).

Couverture des faits sur les candidats de tête (mesuré, `pool.json`) :
- fleuves (100) : longueur, bassin, embouchure et pays 100 sur 100, débit
  97 ;
- déserts (30) : superficie et pays 30 sur 30 ; sur les 25 retenus, 24
  superficies sont en km² et 4 en hectares (un item peut en avoir
  plusieurs : S1706) ;
- chaînes (45) : altitude 43, longueur 35, superficie 22, pays 44 ;
- détroits (40) : pays 40, « fait partie de » (`P361`) 25.

### 3.3 Vues de la Wikipédia française

549 articles, de novembre 2025 à octobre 2026, par l'API REST de Wikimedia
(utilisateurs seuls, tous accès), comme les mers (étude du J2, § 2.3).
L'API répond 429 au-delà d'une requête toutes les 4 s environ (constaté le
25/11, comme le 10/11) : le relevé a pris 45 minutes. Les candidats y
sont pris par ordre de Wikipédias : les 170 premiers fleuves, les 110
premières chaînes et plateaux, les 80 premiers sommets, tous les déserts
(64 avec un article) et tous les détroits (130).

## 4. Méthode des listes

La règle est celle des mers, réglée sur chaque catégorie :
1. **Candidats** : les objets de Natural Earth de la catégorie, plus ceux de
   Wikidata qui lui manquent (§ 3.1).
2. **Rang combiné** : la moyenne du rang par nombre de Wikipédias et du rang
   par vues de la Wikipédia française sur 12 mois (D42 d, D48 b).
3. **Filtres**, chacun écrit avec sa raison dans l'annexe :
   - un objet sans tracé dans Natural Earth n'entre pas d'office : il demande
     une géométrie faite à la main (D1704) ;
   - ce qui n'est pas de la catégorie sort (le Pendjab, que Natural Earth
     range parmi les déserts ; un estuaire parmi les détroits) ;
   - un objet à moitié ou plus dans un objet déjà retenu **du même sujet**,
     **ou qui contient à moitié ou plus un objet déjà retenu**, sort, sauf
     exception écrite (le Ténéré dans le Sahara), **toutes classes de
     Natural Earth confondues** (une chaîne et un plateau, D1719) : sans
     cela, un toucher juste pour l'un serait juste pour l'autre ;
   - ce que le J2 joue déjà sort (Manche, canal du Mozambique).
4. **Taille** : environ 100 fleuves (le plan), 40 chaînes, 25 déserts, 30
   détroits (D1700). Les suivants immédiats sont donnés, pour qu'un échange se
   décide sur pièces.

**Recouvrements entre classes** (mesuré à la relecture : les 65 polygones
retenus, `mesures/regions65-2000.topo.json`, grille de 0,25° et
`geoContains`, part des points de A dans B, seuil 5 %). Onze paires, toutes
entre classes différentes ; aucune entre objets de même classe :

| A | dans B | Part | Même sujet ? |
|---|---|---|---|
| Himalaya (1er) | plateau tibétain (23e) | 100 % | oui (Montagnes) |
| Karakoram (11e) | plateau tibétain | 100 % | oui |
| cordillère du Kunlun (29e) | plateau tibétain | 100 % | oui |
| Altiplano (25e) | cordillère des Andes (3e) | 100 % | oui |
| Hindou Kouch (12e) | plateau tibétain | 24 % | oui |
| plateau tibétain | Himalaya ; Kunlun | 15 % ; 10 % | oui |
| Andes | Altiplano | 11 % | oui |
| désert d'Atacama (Déserts, 3e) | cordillère des Andes | 99 % | non |
| Andes | désert d'Atacama | 5 % | non |
| Altaï | désert de Gobi | 8 % | non |

Les cinq premières lignes violent le filtre ci-dessus : un toucher dans
l'Altiplano est sous deux objets de la série Montagnes, et D1707 a n'y
dit rien. La proposition (D1719 a) : **le plateau tibétain et l'Altiplano
sortent**, puisqu'ils viennent après l'objet qu'ils contiennent ou qui
les contient ; les deux suivants de la table 2, la chaîne pontique et le
Petit Caucase, entrent, sans aucun recouvrement de 5 % avec les retenus
(mesuré par le même calcul, comme les Sudètes, troisièmes suivants). Le
recouvrement de l'Hindou Kouch disparaît avec le plateau. L'Atacama dans
les Andes, et l'Altaï sur le Gobi, sont **entre deux sujets** : chaque
sujet note sa cible, sans conflit (comme l'estuaire du Saint-Laurent,
§ 5.1) ; le quiz ne mêle jamais deux sujets dans une question.

Le seuil de 30 000 km² des mers ne vaut pas tel quel pour des lignes et des
points. Il devient : un fleuve d'au moins 300 km de long (≈ 3 px au zoom 1,
≈ 25 px cadré sur l'Europe, estimé) ; une chaîne ou un désert d'au moins
10 000 km² de polygone ; un détroit à au moins 100 km de tout autre détroit
de la liste (sinon le doigt ne peut pas les séparer, § 8.3).

Pour un fleuve, la longueur qui compte est la plus grande de celle de
Wikidata et de celle du tracé : la Tamise (334 km, 267 km de tracé) entre, la
Neva (74 km) non. Pour une chaîne ou un désert, c'est l'aire du polygone de
Natural Earth : le Harz (9 175 km²), le Rwenzori (6 173 km²) et le désert de
Black Rock (1 555 km²) sortent.

**Le biais des vues françaises.** Le rang par vues tire la liste vers ce que
lit un Français : 42 des 100 fleuves sont européens, dont six français
(Seine 7e, Loire 11e, Rhône 14e, Garonne 36e, Dordogne 79e, Marne 84e) ; le
massif des Vosges, le Massif central et le massif du Jura entrent parmi les
chaînes, devant le Caucase (32e : son article français s'appelle
« Géographie du Caucase » et n'a que 3 308 vues). C'est voulu (la décision
« Océans et mers » vise « les plus connus en français »), mais un quota par
continent peut le corriger (D1700 d).

Les listes complètes, avec leurs chiffres, les suivants immédiats et les
écartés, sont dans l'annexe. Les sections qui suivent n'en donnent que ce
qui demande un choix.

## 5. Fleuves

### 5.1 Liste

Cent fleuves et rivières, du Danube (1er) au Han de Corée (100e), pris
parmi les 170 premiers de Natural Earth par nombre de Wikipédias (annexe,
table 1). En tête : Danube, Nil, Rhin, Amazone, Mississippi, Congo, Seine,
Volga, Gange, Euphrate. Par continent (le continent de la plupart des pays
traversés, un fleuve russe à l'est de 60° E en Asie) : Europe 42, Asie 26,
Afrique 13, Amérique du Nord 11, Amérique du Sud 7, Océanie 1 (le Murray).

Ce qui demande un choix :
- **17 tracés à compléter** (sous 60 % ou au-dessus de 140 % de la longueur
  de Wikidata) : Nil, Amazone, Congo, Gange, Yangtsé, Saint-Laurent,
  Brahmapoutre, Colorado, Amou-Daria, Paraná, Niémen, Oubangui, Murray, Chao
  Phraya, Volta, Drave, Han. La plupart se complètent par
  leurs tronçons sous un autre nom (D1705). Le Saint-Laurent (106 km de
  tracé sur 1 197) et le Han (50 sur 514) n'ont pas ces tronçons : un tracé
  du complément nord-américain de Natural Earth pour l'un (à vérifier), le
  suivant de la liste pour l'autre (l'Ili).
- **Le Nil Blanc (54e)** est un tronçon du Nil si D1705 a est retenu : il
  sort alors de la liste, et l'Ili (101e) entre. Le Nil Bleu, un affluent,
  reste.
- **Cinq rivières d'Europe sans tracé dans la couche principale** (l'Aar, 70e
  au rang ; l'Isar, le Neckar, la Sprée, l'Arno) sont dans le complément
  européen de Natural Earth (`ne_10m_rivers_europe`, mesuré). Les prendre
  ferait sortir les cinq derniers (Sutlej, Godavari, Severn, Maritsa,
  Guadiana) et porterait l'Europe à 47 sur 100. Je ne le recommande pas
  (D1704).
- **Écartés** : la Neva (74 km) et le Chatt-el-Arab (200 km de confluent) ;
  le río de la Plata, un estuaire sans tracé ; le Rubicon (68 Wikipédias,
  55 984 vues), sans tracé et de 35 km selon Wikidata.

Le Saint-Laurent pose un problème de plus : au J2, son estuaire est une zone
fondue dans le golfe du Saint-Laurent (`geodata/mers-affectations.json`,
« Saint Lawrence River → laurent »). Un toucher dans l'estuaire serait juste
pour le fleuve sous Fleuves et pour le golfe sous Océans et mers : sans
conflit, puisque chaque sujet note sa cible.

### 5.2 Tracé : un fleuve est un assemblage de tronçons

Un fleuve du jeu est **une liste de tronçons de Natural Earth**, écrite dans
une table à la main (`geodata/physique.json`, comme `geodata/mers.json`) :
- d'office, les tronçons qui portent son `wikidataid` ;
- en plus, les tronçons du même cours d'eau sous un autre nom, d'après
  Wikidata (`P403`, `P361`) et relus : l'Ucayali pour l'Amazone, le Jinsha
  et le Tongtian pour le Yangtsé, le Lualaba pour le Congo, le Nil Blanc et
  la Kagera pour le Nil (D1705) ;
- jamais un affluent : le Missouri n'est pas le Mississippi, ni le Nil Bleu
  le Nil (s'ils sont retenus, ce sont des fleuves à part) ;
- les tronçons de lac (`Lake Centerline`) sont gardés : sans eux, la Volga
  serait coupée à chaque retenue.

Le build échoue (comme pour les mers, étude du J2 § 2.3) si :
- un fleuve retenu a un tracé de moins de 60 % ou de plus de 140 % de la
  longueur de Wikidata, sans ligne de la table qui le justifie ;
- un tronçon est donné à deux fleuves ;
- un `wikidataid` douteux (le Colorado `Q270627`) n'a pas sa ligne.

**Simplification** (mesuré sur les 1 074 cours d'eau de la couche,
`mapshaper -simplify`, quantification 1e5, TopoJSON) :

| Tolérance | Brut | gzip |
|---|---|---|
| 2 km | 747 552 o | 209 289 o |
| 5 km | 416 540 o | 117 914 o |
| 10 km | 299 288 o | 81 508 o |
| 20 km | 238 156 o | 61 463 o |

Pour la liste retenue : les 100 fleuves de l'annexe, par leur seul
`wikidataid` (174 tronçons, sans les ajouts de D1705, soit ≈ 10 % de moins
que le compte final, estimé) :

| Tolérance | Sommets | Brut | gzip |
|---|---|---|---|
| 2 km | ≈ 16 700 | 159 384 o | 49 358 o |
| 5 km | ≈ 7 300 | 82 031 o | 27 271 o |
| 10 km | ≈ 4 100 | 54 386 o | 18 174 o |
| 20 km | ≈ 2 600 | 39 606 o | 13 020 o |

Je propose 5 km au repos (l'écart au vrai cours reste sous le pixel de la
série Europe, ≈ 12 km, estimé) et 20 km pendant les gestes.

### 5.3 Dessin

- Un trait de 1,5 px, d'un bleu plus sombre que la mer, au-dessus des pays et
  sous les pastilles ; 3 px et la couleur d'accent pour le fleuve allumé. Les
  couleurs suivent la palette en plein soleil (#28) et sont à valider à l'œil
  sur l'A37 (S1703).
- **Pendant une question de fleuve, tous les fleuves de la série sont
  dessinés**, sans nom (D1706 a). C'est l'équivalent des frontières pour les
  pays : on voit les candidats, on choisit le bon. Sans eux (D1706 b), il
  faudrait toucher « là où passe le Danube » sur une carte muette : plus dur,
  mais la note devient une distance à une ligne invisible, que la décision
  « Barème et classements » renvoie à la rétroaction.
- Hors d'une question, rien n'est dessiné à l'accueil, sauf si une case
  « Fleuves » est cochée dans ⚙, à côté des lignes de repère (D1710).
- Canvas : un calque de lignes, la version à 20 km pendant les gestes, celle
  à 5 km au repos (comme la carte allégée, `map/carte-canvas.ts:20`,
  `ILE_LEGERE_KM` à `:175`). WebGL : des segments épaissis en triangles, dans
  un worker à part comme le maillage des mers (`map/maillage-mers.ts`), pour
  ne pas recalculer celui des terres (étude du J2, § 2.3, « Pourquoi un
  fichier à part »). SVG : un `path` par fleuve.
- Le budget de 20 000 sommets par image pendant un geste
  (`BUDGET_SOMMETS`) compte les fleuves : à 20 km, ≈ 2 600 sommets pour les
  fleuves et ≈ 2 800 pour les chaînes et les déserts (mesuré, `poids.sh`), à
  ajouter à la carte allégée des terres et des mers ; à remesurer au lot 2
  avec `sommetsVisibles` (`tests/mesure-mers.test.ts`).

### 5.4 Trouver : « Touche le Danube »

On touche la carte. Est juste un toucher **à 12 px au plus du tracé du
fleuve demandé, si aucun autre fleuve de la série n'est plus près du doigt**
(D1707 a). C'est la tolérance des côtes (décision « Océans et mers », 12 px)
et la règle « le plus proche » des villes du J4 (D610). Le pays sous le doigt
ne compte pas.

- Au zoom 1 (≈ 95 km par pixel sur l'A37, **estimé** dans l'étude du J4,
  § 4.2 : ≈ 36 000 km sur ≈ 380 px, à mesurer à l'essai S600 du J4), 12 px
  font ≈ 1 100 km de part et d'autre du tracé (estimé de même) : savoir le continent suffirait
  presque pour un grand fleuve isolé (l'Amazone). D'où des séries cadrées par
  continent (§ 5.6) : cadrée sur l'Europe (≈ 12 km par pixel, estimé), la
  tolérance tombe à ≈ 145 km, et le Rhin, la Meuse et la Moselle se
  départagent par « le plus proche ».
- La rétroaction allume le vrai fleuve, montre le point touché, la distance
  au tracé (« Danube : à 40 km ») et, sur une faute, le fleuve le plus proche
  du doigt (« plus près de la Tisza »). Au journal, `distance_km` porte la
  distance au tracé, `reponse` l'id du fleuve le plus proche (la matrice des
  confusions). Aucun champ nouveau.
- Un toucher dans la mer, au large d'une embouchure, à moins de 12 px du
  tracé, est juste : le fleuve se termine à la côte (estimé, sans gêne).

### 5.5 Reconnaître : « Quel est ce fleuve ? »

Le fleuve est allumé, la carte cadrée sur son emprise ; quatre noms. Les
leurres sont les fleuves voisins (dont le tracé passe à moins de 500 km,
estimé), puis ceux du même continent, jamais un affluent du juste (le
Missouri pour le Mississippi serait un piège plus qu'une question). Un
seul essai, comme Nommer.

### 5.6 Séries, grappes, épreuves

- Séries : « Tous » et une par continent, comme les pays. Un fleuve qui sert
  de limite entre deux continents (l'Oural) est rangé à la main. Les séries
  d'Océanie et d'Amérique du Sud seraient petites (Océanie 1, Amérique du
  Sud 7, mesuré) : une série de moins de 8 fleuves se fond avec sa voisine,
  d'où « Amériques » (18) et « Asie et Océanie » (27) (D1708). Le seuil de
  8 et la raison des séries cadrées reposent sur l'échelle estimée du
  § 5.4 : si l'essai (S600 du J4, S1702) donne une autre échelle, D1708 et
  la tolérance de 12 px se revoient.
- **Le quota de D1700 d, chiffré** (vivier de 260 fleuves de
  `sorties/pool.json`, lu à la relecture) : l'Amérique du Sud a 7 retenus
  et au moins treize candidats de plus de 300 km hors de la liste (rio São
  Francisco, 2e suivant, Tocantins, Araguaia, Xingu, Tapajós, Purus, Juruá,
  Caquetá, Putumayo, Essequibo, Beni, Mamoré, Biobío ; le Marañón et
  l'Ucayali sont des tronçons de l'Amazone) : 8 s'atteint. L'**Océanie
  n'a que le Darling** (925 km de tracé) en plus du Murray : le vivier,
  tiré des 170 premiers fleuves par nombre de Wikipédias, n'a ni le Sepik
  ni le Fly. D1700 d se lit donc « au moins 8 par continent habité, sauf
  l'Océanie (2 : Murray et Darling) », et la série d'Océanie reste fondue.
- Grappes : par continent et de proche en proche, comme les mers (`bassin`).
- Épreuves : Chrono et Sans faute par série, comme les pays.

## 6. Montagnes

### 6.1 Chaînes ou sommets

Le plan dit « montagnes », la synthèse « les grandes chaînes ». Deux objets
différents s'y cachent :
- **les chaînes** (Himalaya, Alpes, Andes) : des polygones de Natural Earth,
  joués comme les déserts ;
- **les sommets** (Everest, Kilimandjaro, mont Blanc) : des points, joués
  comme les villes du J4 ou les détroits. Natural Earth en a 633, et la fiche
  d'un pays montre déjà son point culminant (décision « Fiche d'un lieu :
  sommets et fuseaux »).

Je recommande les chaînes, avec les grands plateaux que le rang fait entrer
(D1702 a), et les sommets en sujet à part plus tard, sur le modèle des
détroits (§ 8, D1702 c). Une liste de sommets est quand même dans l'annexe
(table 5), pour trancher sur pièces.

### 6.2 Liste des chaînes

Quarante chaînes et plateaux, de l'Himalaya (1er) aux Black Hills (40e),
pris parmi les 110 premiers par nombre de Wikipédias (annexe, table 2).

Ce qui demande un choix :
- **Quatre plateaux** que Natural Earth range à part entrent par le rang :
  le Massif central (21e), le plateau tibétain (23e), l'Altiplano (25e) et
  le Deccan (30e). Les Hauts plateaux abyssins (38e) sont rangés parmi les
  chaînes. Je propose de garder le Massif central et le Deccan, dans un
  sujet nommé « Montagnes » (D1702 a) : le Massif central est un massif
  pour un Français. Le plateau tibétain (le « toit du monde ») et
  l'Altiplano sortent par le filtre de recouvrement (§ 4, D1719 a) ; les
  garder demanderait de sortir l'Himalaya, le Karakoram et le Kunlun, ou
  les Andes, bien plus connus.
- **Deux sierras Nevada** (États-Unis, 19e ; Espagne, 34e) : même nom, le
  pays en précision dans le nom affiché.
- **Les Alpes du Sud** (28e), en Nouvelle-Zélande : à côté des Alpes, un
  public français lit « Alpes du Sud » comme le sud des Alpes françaises.
  Nom affiché proposé : « Alpes du Sud (Nouvelle-Zélande) », la précision
  gardée comme pour les sierras (une exception à D1716 a, qui retire la
  parenthèse du titre de l'article) ; « Alpes néo-zélandaises » en alias.
- **Écartés** :
  - sans tracé : les Apennins (14e au rang, 101 Wikipédias), les Dolomites
    (161 928 vues, la plus lue des chaînes, mais une partie des Alpes), le
    Hoggar, les Tatras sous leur propre item, l'Eifel, le mont Liban, les
    Rhodopes ;
  - pas des chaînes : le Tibet (une région), la Forêt-Noire (gardée si l'on
    veut : un massif boisé, 88 Wikipédias), l'Annapurna (un massif de
    l'Himalaya), le Vatnajökull (un glacier) ; un polygone de « plateau » que
    Natural Earth nomme « Península Ibérica » ;
  - trop petits : le Harz et le Rwenzori, sous 10 000 km² ;
  - dans une autre : le Rif, dans l'Atlas.
- La chaîne Transantarctique (62 Wikipédias) est 43e : l'Antarctique n'a
  aucune chaîne dans la liste.

### 6.3 Toucher et dessin

- La chaîne est un polygone posé sur les pays. Est juste un toucher dans le
  polygone, ou à 12 px au plus de son bord, si aucune autre chaîne de la
  série n'est sous le doigt (D1707 a) : un doigt dans les Alpes est juste
  pour les Alpes, pas pour le Jura voisin.
- **Un recouvrement résiduel** (sous la moitié, que le filtre du § 4
  laisse : aucun dans la liste après D1719 a, mais une liste échangée peut
  en créer) : un doigt dans les deux polygones est juste pour chacun des
  deux, comme une zone admise, et la rétroaction nomme les deux. Hors des
  deux, la règle du plus proche vaut.
- Rien n'est dessiné pendant la question (comme les mers : « aucune frontière
  n'est dessinée entre les mers »). Les polygones de Natural Earth sont des
  aires d'étiquette : les montrer à l'avance donnerait la réponse, et leurs
  bords n'ont pas de sens géologique (§ 3.1).
- La chaîne allumée (Reconnaître, rétroaction) est teintée d'un ocre
  translucide, ses bords flous, sans contour net (à valider à l'œil, S1703).
- Une chaîne de moins de 10 px à l'écran se touche à 12 px de son polygone,
  le doigt n'importe où : la règle des petites mers (décision « Océans et
  mers », « une mer de moins de 10 px à l'écran compte à 12 px de son eau »).

## 7. Déserts

### 7.1 Liste

Vingt-cinq déserts, du Sahara (1er) à la steppe de la Faim (25e), pris parmi
les 64 qui ont un article en français (annexe, table 3). À partir du 23e,
les vues tombent sous 1 100 par an : la liste est presque toute la couche, et
une liste de 20 serait aussi juste (D1700 b).

Ce qui demande un choix :
- **Cinq déserts australiens** (Grand désert de Victoria, Grand désert de
  Sable, Simpson, Gibson, Tanami) : très proches et peu lus en français
  (1 014 à 2 415 vues). Le quota par continent de D1700 d en garderait deux.
- **Deux déserts très connus sans polygone** : le désert d'Arabie (74
  Wikipédias) et le désert des Mojaves (66) (D1704). Le Rub al-Khali (10e)
  et le Néfoud (18e) couvrent une grande part du désert d'Arabie. Le Sinaï
  (120 Wikipédias), que Wikidata range parmi les déserts, est une péninsule.
- **Écartés** : le Pendjab (une région, que Natural Earth range parmi les
  déserts), la vallée de la Mort (une vallée), le salar d'Uyuni (un désert de
  sel, à reprendre avec les lacs), le
  Tassili n'Ajjer (un plateau), la Caatinga (une forêt sèche) ; le désert
  Libyque, le Ténéré, le désert de Nubie, le Désert arabique d'Égypte et les
  grands ergs, dans le Sahara (D1709).

### 7.2 Toucher et dessin

Ceux des chaînes (§ 6.3), avec une teinte sable. Deux cas à part :
- **le Sahara et ses parties** : le Ténéré, le Grand Erg oriental, le désert
  Libyque sont des parties du Sahara (à 90 % et plus dans son polygone,
  mesuré). Je propose de garder le Sahara seul et de laisser ses parties hors
  de la liste (D1709 a), plutôt que la règle des sous-mers (une partie compte
  pour son tout, D1709 b), qui rendrait un toucher dans le Ténéré juste pour
  le Sahara et faux pour le désert Libyque voisin, sans que le joueur voie
  pourquoi ;
- **les déserts froids** : l'Antarctique est le plus grand désert du monde,
  mais aucune couche ne le range ainsi. Il reste un continent (fiche d'un
  lieu, sorte `continent`).

## 8. Détroits

### 8.1 Liste

Trente détroits et canaux, du canal de Suez (1er) au canal de Sicile (30e),
pris parmi 130 candidats : les détroits, « channels » et « sounds » de la
couche marine, et les détroits de Wikidata (`Q37901`) qu'elle n'a pas
(annexe, table 4). Douze des 28 détroits n'ont pas de zone marine dans
Natural Earth (les deux canaux sont des lignes de sa couche des fleuves),
dont le détroit d'Ormuz (2e, 505 479 vues, la plus lue de tout le relevé,
sans doute par l'actualité : S1707), le détroit de Béring (9e), le pas de
Calais (14e) et le détroit de Messine (17e).

Ce qui demande un choix :
- **Les canaux de Suez et de Panama** (1er et 3e) : D1703.
- **Le Cattégat et le Skagerrak** sont des bras de mer de 88 et 85 km de
  large (Wikidata) plutôt que des passages étroits ; ils entrent par le
  rang. Le Grand Belt et l'Øresund, voisins, sont des détroits au sens
  strict : l'Øresund est dans la liste (16e), le Grand Belt juste après
  (37e).
- **Les bouches de Bonifacio** (32e), entre la Corse et la Sardaigne, sont
  juste dehors ; un public français les attendrait sans doute, comme le pas
  de Calais. Un échange contre le canal de Sicile (30e) se discute.
- **Écartés** : la Manche et le canal du Mozambique (déjà des zones des
  mers) ; le fleuve Saint-Laurent (« channel » de Natural Earth) ; le passage
  du Nord-Ouest (une route) ; le Zuiderzee, le Firth of Forth, l'East River,
  le Golden Gate (de moins de 3 km ou pas des détroits).
- **Distances** : la paire la plus proche est le Cattégat et l'Øresund
  (154 km), puis le Cattégat et le Skagerrak (174 km), le détroit de
  Magellan et le canal Beagle (209 km), le Bosphore et les Dardanelles
  (248 km) : toutes au-dessus des 100 km du § 4.

### 8.2 Un détroit est un point

Un détroit fait de quelques centaines de mètres (le Bosphore, à vérifier :
Wikidata n'a pas sa largeur) à quelques dizaines de kilomètres (Wikidata,
`P2049` : Gibraltar 14,3 km, Kertch 15, le pas de Calais 40, Ormuz 55) : à
≈ 95 km par pixel au zoom 1 (estimé, J4 S600), aucun ne se voit. Natural Earth n'en a
d'ailleurs que 36, et pas les plus connus (§ 3.1). Un détroit du jeu est donc **un point** (son passage le
plus étroit, `P625` de Wikidata relu), avec ses deux mers reliées dans la
fiche. La zone marine de Natural Earth, quand elle existe, ne sert qu'à
cadrer.

### 8.3 Toucher et dessin

- **Pendant une question, chaque détroit de la série est une pastille** de
  7 px, comme un micro-État (D1706 a, comme les fleuves) : on voit les
  candidats, on touche le bon. La cible est le disque de 44 px
  (`PASTILLE.rayon_cible_px`), et le plus proche des disques l'emporte.
- Sans pastilles (D1706 b), la note serait celle des villes du J4 : juste à
  N km du point, s'il est le plus proche du doigt parmi les détroits de la
  liste (D610).
- Deux détroits à moins de 100 km l'un de l'autre ne peuvent pas être de la
  même liste : leurs pastilles se recouvriraient jusqu'au zoom ≈ 4 (estimé).
  Mesuré sur les candidats : la Manche et le pas de Calais (268 km), le
  Bosphore et les Dardanelles (248 km), le Cattégat, le Skagerrak, l'Øresund
  et le Grand Belt (de 119 à 179 km) ; aucune paire sous 100 km parmi les
  50 premiers (`rang.json`, coordonnées de Wikidata).
- **Canaux.** Les canaux de Suez (170 Wikipédias) et de Panama (154) sont
  plus connus que presque tous les détroits. Ce ne sont pas des détroits,
  mais des passages entre deux mers, ce que la question enseigne. Je propose
  de les garder dans le sujet, sous le nom « Détroits et canaux » (D1703 a).

## 9. Noms et alias

- **Nom affiché** : le nom d'usage en français, générique en minuscule
  (« fleuve Jaune », « désert de Gobi », « détroit de Gibraltar »,
  « cordillère des Andes »), comme les mers (étude du J2, § 2.3). La
  majuscule de début de phrase est posée par le code.
- **Le libellé de Wikidata n'est pas toujours l'usage français**, ni le
  `name_fr` de Natural Earth : « Yangzi Jiang » (Wikidata) pour le Yangtsé
  (titre de l'article de la Wikipédia française), « rivière Missouri » pour le
  Missouri, « Désert du Namib » avec une majuscule, « Géographie du Caucase »
  comme titre d'article du Caucase. Règle proposée (D1716 a) : le titre de
  l'article de la Wikipédia française sans sa parenthèse d'homonymie
  (« Amazone (fleuve) » → « Amazone »), le générique en minuscule ; le
  libellé de Wikidata et le `name_fr` de Natural Earth deviennent des alias
  quand ils diffèrent. Une table à la main tranche le reste, et chaque nom de
  la liste est relu (annexe).
- **Le générique** : « fleuve » ou « rivière » n'est pas répété dans le nom
  affiché (« la Loire », pas « le fleuve Loire »), sauf quand il fait partie
  du nom (« fleuve Jaune », « fleuve Rouge », « rio Negro »). L'article
  (« le Rhin », « la Seine ») est une donnée de la table, comme les articles
  des noms de pays (décision « Articles des noms de pays ») : il sert aux
  phrases (« Touche le Rhin »).
- **Alias** : les autres noms de Wikidata (`alias_fr`), le nom local quand il
  est courant (« Rio Grande », « Huang He », « Ganga »), et ceux d'une autre
  langue quand le français les emploie (« Bosphore » et « détroit
  d'Istanbul »).
- **Collisions** : le Colorado, l'Orange, le Niger, le Congo, le Sénégal, la
  Gambie, l'Oural et le Paraná sont aussi des pays, des États ou des chaînes.
  La recherche les distingue par leur sorte (« Congo · fleuve »), comme les
  mers ; les QCM ne mêlent jamais deux sujets ; le test de collision du J1b
  (saisie libre, étude de la saisie libre) porte sur un même sujet.
- **Langues.** Le critère « aucun nom manquant dans une langue » se teste
  ainsi : pour chaque langue de `LANGUES` (aujourd'hui `fr` seul), chaque id
  de la couche physique a un nom non vide dans `physique.<langue>.json`, et le
  build échoue sinon. L'anglais, le jour où il vient, prendra le libellé
  anglais de Wikidata (présent pour les 195 objets retenus, mesuré) et sa
  propre relecture.

## 10. Neutralité

La règle de fond : **la cible est l'objet physique, jamais un pays**. Une
zone contestée n'entre ni dans la note ni dans la question. Restent les noms
et les faits des fiches.

| Cas | Ce qui est disputé | Proposition |
|---|---|---|
| Détroit de Kertch | il relie la mer Noire et la mer d'Azov entre la Crimée (tenue par la Russie, revendiquée par l'Ukraine) et la Russie | riverains « Russie, Ukraine », la règle des riverains de la mer d'Azov (`public/geo/fiches-mers.json` : `['RUS', 'UKR']`) ; aucun mot sur le statut dans la fiche du détroit |
| Détroit de Corée, détroit de Tsushima | le Japon nomme Tsushima le chenal est | « détroit de Corée » (l'usage français et l'OHI), « détroit de Tsushima » en alias, comme « mer du Japon » au J2 |
| Détroit de Taïwan | Taïwan est au paquet optionnel | riverains « Chine, Taïwan (paquet optionnel) », la règle des voisins d'une fiche (`geodata/fiches-mers.mjs:419`) |
| Détroit d'Ormuz, golfe Persique | le nom du golfe (« golfe Arabique ») | le détroit n'a pas de nom disputé ; « golfe Persique » est le nom de la liste des mers (J2) |
| Chatt-el-Arab (« Arvand Rud » en Iran) | le nom | hors de la liste (200 km de confluent) ; s'il revient, les deux noms |
| Jourdain | il borde la Cisjordanie et le Golan | pays traversés par le tracé de fait, les zones contestées à part avec leur statut, comme les voisins d'un pays (décision « Fiche d'un lieu ») |
| Indus, Karakoram, Himalaya | le Cachemire (Inde, Pakistan, Chine) | idem |
| Sahara | le Sahara occidental | idem : « Sahara occidental (statut contesté) » parmi les pays, à part |
| Néguev, Sinaï | aucun pour le Néguev (dans les frontières reconnues d'Israël) ; le Sinaï est égyptien | rien à faire |
| Amour (Heilong Jiang en chinois), frontière entre la Russie et la Chine | l'usage | « Amour », alias « Heilong Jiang » |

Ces lignes sont des propositions (D1717), à relire comme les statuts des
territoires l'ont été (étude de la fiche d'un lieu, § 16).

## 11. Fiches d'un lieu

Les objets du J5 ont leur fiche, comme les mers (décision « Fiche d'un
lieu ») : on l'ouvre depuis le bilan d'une partie (toucher une erreur), depuis
la recherche, et, avec D1710 b, depuis un fleuve touché à l'accueil. Sortes nouvelles : `fleuve`, `montagne`,
`desert`, `detroit` (`fiches/sorte.ts:14`).

| Sorte | Faits (Wikidata, relus) | Calculés sur le tracé |
|---|---|---|
| Fleuve | longueur, bassin, débit moyen, embouchure (une mer de la couche marine, un fleuve ou un lac) | pays traversés |
| Montagne | point culminant et son altitude (`P610`, `P2044`), longueur | pays |
| Désert | superficie, sorte (chaud, froid, de sel : à vérifier dans Wikidata) | pays |
| Détroit | largeur au plus étroit (`P2049`, à vérifier), les deux mers reliées | pays riverains |

- **Pays traversés et riverains** : le tracé (un pays que le fleuve traverse
  sur au moins 10 km, estimé), Wikidata (`P17`), puis une table de retraits et
  d'ajouts, chacun avec sa raison : la méthode des riverains des mers
  (`geodata/fiches-mers.mjs:13-20`), dont la relecture est validée (lot F4
  de la fiche d'un lieu).
- **Une valeur contestée ou absente** : une ligne de la table à la main,
  comme pour les superficies et les profondeurs des mers (`fiches-mers.mjs:5-12`).
  Une relecture `docs/relectures/fiches-physique.md`, générée par le build,
  les montre toutes.
- **Photos** : le même chemin que le lot P1 de la fiche d'un lieu (candidats
  de Commons, relecture, servies par notre site), plus tard et à part : la
  relecture des 332 lieux n'est pas faite (`geodata/photos/choix.json` a 2
  entrées), il ne faut pas lui ajouter 195 lieux avant.

## 12. Poids et budget en CI

**Fichiers servis** (dans `public/geo/`, chargés à la demande ; mesurés sur
les listes de l'annexe, sans les tronçons ajoutés de D1705, ≈ 10 % de plus
pour les fleuves, estimé) :

| Fichier | Contenu | Brut | gzip |
|---|---|---|---|
| `physique.topo.json` | 100 fleuves et 65 chaînes et déserts, 5 km, deux objets | 134 075 o | 45 154 o |
| `physique-leger.topo.json` | les mêmes à 20 km, pour les gestes | 73 379 o | 25 011 o |
| `physique.json` | `[{id, sorte, serie, longueur_km, superficie_km2, point, bbox, voisins, parents}]`, points des détroits | — | ≈ 6 Ko (estimé) |
| `physique.fr.json` | `{noms, alias, articles}` | — | ≈ 4 Ko (estimé) |

**Budgets testés en CI** (`tests/donnees-physique.test.ts`, gzip par
`gzipSync`, comme `tests/donnees-mers.test.ts:498-499`) :
- `physique.topo.json` ≤ 60 000 o (≈ 20 % de marge sur le compte final
  estimé, ≈ 50 000 o) ;
- `physique-leger.topo.json` ≤ 32 000 o ;
- `physique.json` et `physique.fr.json` ≤ 12 000 o ensemble ;
- `monde.topo.json` inchangé (≤ 520 000 o, `tests/donnees.test.ts:316`) : la
  couche physique n'y entre pas.

**Coût par visiteur.** La couche ne se charge que pour une partie du J5, une
fiche ou une recherche d'un objet physique, et la case « Fleuves » de ⚙
(D1710) : ≈ 80 Ko gzip, soit ≈ 4 % du budget de ≈ 1,8 Mo par visiteur que
suppose la décision « Hébergement » (étude du J2, § 2.3), pour les seuls
joueurs du J5. Rien au premier affichage (le `smoke` le vérifie).

**Code.** Le code du J5 (la couche, les notations, les vues) va dans un
morceau chargé à la demande, comme celui de la fiche (décision « Morceau JS
principal sous 500 Ko » ; `tests/morceau-principal.test.ts`).

**L'APK** embarque les mêmes fichiers ; le quota de Hosting ne le concerne
pas.

## 13. Mémoire, Jouer, classements, quiz

### 13.1 Domaines et fiches

Quatre domaines : `fleuves`, `montagnes`, `deserts`, `detroits` (D1701),
figés à vie. Fiches `fleuves:danube:localiser`, `detroits:ormuz:nommer`. Les
ids suivent ceux des mers : 3 à 8 lettres minuscules, sans accent, uniques
entre la couche marine et la couche physique (test), figés à vie. Ils
tiennent dans la carte la plus longue d'un lot (`CARACTERES_PAR_EVENEMENT`,
`sync/lots.ts:30` ; mesurée à 149, puis 152 caractères au J2 avec
`capitales` et un id de 8 lettres, étude du J2 § 16 et § 17) : `montagnes`, 9 lettres, est aussi long que
`capitales` (à remesurer, test `sync-lots`).

Comme pour le J4, un **lot 0 sans effet visible** fait lire les quatre
domaines avant qu'aucune version ne les écrive : sinon l'APK de l'A37, resté
à l'ancienne version, ne lirait plus les lots synchronisés (étude du J4,
§ 1 et lot 0 ; `sync/lots.ts:150-157`). Si le lot 0 du J4 n'est pas encore
livré, les deux se font ensemble (une seule mise à jour de l'APK).

`couche()` (`map/pick.ts:386-396`) apprend la couche physique par l'index
commun (`map/lieux.ts`, `CoucheLieu` gagne `'physique'`) ; le message
« cible marine avant la couche marine », levé pour tout id de 3 à 8 lettres
sans couche marine, devient « cible avant sa couche ».

### 13.2 Jouer

Avec le J4, Jouer aurait dix sujets (étude du J4, D601) ; le J5 en ajoute
quatre. Quatorze tuiles ne tiennent pas en un écran de 360 px avec 2 à 7
boutons par écran (décision « Écran Jouer »). Je propose une tuile
**« Nature »** (nom à choisir) qui ouvre Océans et mers, Fleuves, Montagnes,
Déserts, Détroits (D1712 a). Le niveau de plus coûte une touche ; Océans et
mers y entre, ce qui change un chemin déjà appris (Entraînement › Océans et
mers devient Entraînement › Nature › Océans et mers).

### 13.3 Épreuves et général

Tailles proposées : fleuves « Tous » 100 et les quatre séries de D1708
(Europe 42, Asie et Océanie 27, Amériques 18, Afrique 13 : 100 en tout),
montagnes 40, déserts 25, détroits 30. Au général (D1713 a, à la lettre de
« Général à tous les sujets ») : + 295 questions, borne de 1 244 à 1 539
sans le J4, ≈ 3 360 avec lui (3 067 selon l'étude du J4, § 7.3, + 295).
Chaque sujet ouvert la monte, les règles d'abord (`firestore.rules:100-107`).

### 13.4 Quiz général

Les quatre sujets peuvent entrer au quiz sous ses deux formes (QCM : « Quel
est ce fleuve ? » ; toucher : « Touche le Danube »). Je propose les quatre,
avec la notoriété du rang combiné, après leur livraison (D1714 a). Le quiz
facile n'en prendrait que les plus connus (le Nil, l'Amazone, l'Himalaya, le
Sahara, Gibraltar).

### 13.5 Séance, carte de la mémoire, prérequis, charge (D1720)

Ajouté à la relecture. `srs/seance.ts:183` fixe la forme d'une étape par le
**sens seul** : `trouver` (un toucher noté par `noter`, sur un pays) pour
toute fiche `localiser`, `retournee` (la zone de l'entité allumée par
`allumerZone`, `vues/retournee.ts:105`) pour toute fiche `nommer`, `qcm`
pour le QCM d'apprentissage. Telle quelle, `fleuves:danube:localiser` due en
Révision du jour serait jugée sur le pays sous le doigt, et une carte
retournée d'un fleuve n'allumerait rien (`allumerZone` attend une zone de
pays ou de mer). Ce qu'il faut (D1720 a), sur le modèle de l'étude du J4
(§ 7.5, `formeDe(domaine, sens)`) :

| Domaine | `localiser` en séance | `nommer` en séance | QCM d'apprentissage |
|---|---|---|---|
| `fleuves` | `trouver`, noté par `noterLigne`, les fleuves de la grappe dessinés (D1706) | `retournee`, le fleuve allumé (trait de 3 px, § 5.3), « Révéler » son nom | « Quel est ce fleuve ? », leurres du § 5.5 |
| `montagnes`, `deserts` | `trouver`, noté par `noterRegion` | `retournee`, le polygone teinté (§ 6.3) | « Quelle est cette chaîne ? » / « … ce désert ? » |
| `detroits` | `trouver`, noté par `noterPoint`, les pastilles de la grappe | `retournee`, la pastille allumée et la carte cadrée sur ses deux mers | « Quel est ce détroit ? » |

Dans une séance, la « série » qui départage au plus proche (D1707 a) est la
**grappe** de la fiche (Apprendre) ou, en Révision du jour, la liste
entière du domaine sur le continent cadré : sinon un toucher sur le Rhin
pour la Moselle serait juste quand la Moselle est seule à réviser.

**`source()` de `vues/seance.ts`** (`:245-259`, un `switch` sur `Domaine`) :
le lot 0 y rend `null` (« pas encore posable ») pour les quatre domaines ;
le lot 2b y met le chargement de la couche physique (`aCharger`,
`charger`, comme les mers).

**Carte de la mémoire** (décision « Répétition espacée des nouveaux
sujets » : sujet choisi dans la légende, détail au toucher). Aucune teinte
n'existe pour une ligne, un polygone posé sur les pays ou un point. Il faut
un calque par seau dans les trois rendus : un trait teinté par fleuve, un
polygone translucide par chaîne ou désert, une pastille teintée par
détroit, comme les pastilles des micro-États ; les pays restent neutres
quand un domaine du J5 est choisi. Le détail au toucher prend l'objet le
plus proche (12 px), comme Trouver. C'est le gros morceau du lot 2b, comme
le calque des villes au lot 4b du J4.

**Prérequis** (`PREREQUIS`, `srs/planif.ts:41`) : aucun (D1720 a) ; placer
le Danube ne demande pas les pays. D1720 b : Océans et mers avant les
Détroits, qui relient deux mers.

**Charge** (calcul) : 100 + 40 + 25 + 30 = **195 fiches `nommer`** à
introduire, soit **13 jours au moins** au plafond commun de 15 par jour
(`INTRODUCTIONS_PAR_JOUR`, `srs/planif.ts:33`) ; avec le J4 (≈ 912,
étude du J4 § 7.5), ≈ 1 107, soit **74 jours** au moins. La simulation de
charge du J2 (`tests/sim-charge.test.ts`, S40) est à reprendre à 14
domaines (S1710).

## 14. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et `npm run
build` au vert (par le verrou de la machine), puis par un commit « … (#7) ».
Si les règles changent : `npm run test:regles`, puis leur déploiement
d'abord (décision « Ouverture des épreuves d'un sujet »). Ensuite le
déploiement Hosting et le pilote sur le site en ligne (skill
`run-terramemo`). L'UI suit le skill `nouveau-projet`, relu avant les lots
2, 3 et 7.

| Lot | Taille | Dépend de | Attend | Critère de fin |
|---|---|---|---|---|
| 0. Socle | S | — (avec le lot 0 du J4 s'il n'est pas livré) | D1701 | rien de visible ; les quatre domaines lus ; APK rebâti |
| 1. Données | L | 0 | D1700, D1703, D1704, D1705, D1709, D1716, D1717 | `npm run geodata` refait la couche à l'octet près ; budgets et noms testés en CI |
| 2. Carte | L | 1 | D1706, D1711 | la couche dessinée et allumée dans les trois rendus ; sans saccade sur l'A37 |
| 2b. Séance et mémoire | M | 2 | D1720 | la séance pose les quatre domaines sous leur forme (§ 13.5) ; carte de la mémoire teintée dans les trois rendus ; simulation de charge à 14 domaines |
| 3. Déserts et chaînes | M | 2 | D1702, D1707 | deux sujets au doigt sur le site ; épreuves en ligne |
| 4. Détroits et canaux | M | 2 | D1707 | un sujet au doigt sur le site |
| 5. Fleuves | M-L | 2 | D1707, D1708 | un sujet au doigt sur le site, séries par continent |
| 6. Fiches | M | 1, puis chaque sujet | D1710, D1718 | une fiche par objet, relecture générée et relue |
| 7. Jouer, quiz, fin | M | 2b à 6 | D1712, D1713, D1714 | critères de #7, testés (`chrono.test`, `regles.test`, `quiz.test`) ; APK |

Ordre recommandé (D1715 a) : les déserts et les chaînes d'abord, parce qu'ils
reprennent presque tout de la couche marine (polygones, aucune frontière
dessinée, 12 px) ; puis les détroits (des points, comme les villes du J4) ;
les fleuves en dernier, qui demandent la notation à une ligne, le plus neuf.
C'est aussi l'ordre du plan (« Détroits, montagnes, déserts, puis une
centaine de fleuves »), à une inversion près.

### Lot 0. Socle

- **Contenu** : `Domaine`, `DOMAINES` gagnent `fleuves`, `montagnes`,
  `deserts`, `detroits` (lus, pas jouables : `DOMAINES_JOUABLES` inchangé) ;
  `TERRAIN_DOMAINE` (le monde) ; `CLE_SUJET` ; `CoucheLieu` gagne
  `'physique'` (vide) ; le message de `couche()` ; `source()` de
  `vues/seance.ts` rend `null` pour les quatre domaines (§ 13.5).
- **Fichiers** : `src/srs/fiches.ts`, `src/epreuve/chrono.ts`,
  `src/map/lieux.ts`, `src/map/pick.ts`, `src/vues/seance.ts`.
- **Tests** : `srs-jour` (les quatre acceptés, un nom inconnu toujours
  refusé), `sync-lecture` (un lot qui mêle `pays:` et `fleuves:` est lu),
  `sync-lots` (la carte la pire avec `montagnes` et un id de 8 lettres sous
  160 caractères).
- **Fin** : rien de visible ; l'APK de l'A37 rebâti avant qu'une version
  n'écrive ces domaines.

### Lot 1. Données

- **Contenu** :
  - `SOURCES['natural-earth']` gagne `ne_10m_rivers_lake_centerlines` et
    `ne_10m_geography_regions_polys` (cinq extensions chacune, sous
    `NE_BASE_PHYSIQUE`, `geodata/build.mjs:94`), empreintes au verrou ;
  - `geodata/wikidata.mjs` : une requête figée de plus
    (`requetes-physique.rq`), les vues de 12 mois, l'extrait daté
    `geodata/wikidata/physique.json` ;
  - `geodata/physique.json`, la table à la main : les retenus et leur sorte,
    les tronçons ajoutés d'un fleuve, les exclusions et leur raison, les
    noms, articles et alias, la série de chaque fleuve, les coordonnées
    relues des détroits ;
  - `geodata/physique.mjs`, appelé par `build.mjs` : assemblage, recalage de
    l'antiméridien et densification comme les mers (étude du J2, § 2.3,
    étapes 2 et 4), simplification, attributs (longueur du tracé, emprise,
    point d'étiquette, voisins pour les leurres) ;
  - sorties : `public/geo/physique.topo.json` (lignes et polygones, 5 km),
    `physique-leger.topo.json` (20 km), `physique.json` (attributs, points
    des détroits), `physique.fr.json` (`{noms, alias, articles}`) ;
  - crédits (Natural Earth : « fleuves, chaînes et déserts ») et
    `sources.json`.
- **Tests** (`tests/donnees-physique.test.ts`) : ids `^[a-z]{3,8}$`, uniques,
  absents de `mers.json` et de `pays.json` ; un nom non vide pour chaque id
  dans chaque langue de `LANGUES` ; aucune géométrie vide ; longueur du tracé
  entre 60 % et 140 % de Wikidata sauf ligne de la table ; aucun tronçon
  donné à deux fleuves ; aucun polygone retenu à moitié dans un autre du
  même sujet, dans les deux sens et **toutes classes de Natural Earth
  confondues** (le contrôle que la mesure d'origine ne faisait pas, § 4) ;
  détroits à 100 km au moins l'un de l'autre ; budgets gzip (§ 12) ; deux
  builds identiques octet pour octet.
- **Fin** : la liste de l'annexe, revue par l'utilisateur, sort du build.

### Lot 2. Carte

- **Contenu** : `src/map/physique.ts` (chargement à la demande, comme
  `map/mers.ts`) ; le calque des lignes et des polygones teintés dans le
  Canvas, le SVG et le WebGL (worker à part, `maillage-physique.ts`) ; les
  pastilles des détroits ; `zonesAllumees` pour un objet physique ; les
  pastilles des micro-États cachées pendant une question du J5 (D1711).
- **Tests** : `carte-canvas`, `carte-webgl`, `mesure-mers` étendu
  (`BUDGET_SOMMETS` avec la couche légère), le `smoke` (aucun fichier
  `physique*` au premier affichage).
- **Vérification** : sur l'A37, Trouver un fleuve d'Europe en tournant et en
  zoomant, sans saccade (critère de saccade, S1701).

### Lot 2b. Séance et carte de la mémoire

- **Contenu** : `formeDe(domaine, sens)` dans `srs/seance.ts` (la table du
  § 13.5, partagée avec le J4 s'il la livre d'abord) ; la notation de
  chaque domaine dans `vues/essai.ts` ; la carte retournée sur un objet
  physique (`vues/retournee.ts`) ; `source()` de `vues/seance.ts` ; le
  calque par seau de `vues/carte-memoire.ts` dans les trois rendus ;
  `PREREQUIS` selon D1720.
- **Fichiers** : `src/srs/seance.ts`, `src/srs/planif.ts`,
  `src/vues/seance.ts`, `src/vues/essai.ts`, `src/vues/retournee.ts`,
  `src/vues/carte-memoire.ts`, `src/map/carte-canvas.ts`,
  `src/map/carte-webgl.ts`, le rendu SVG.
- **Tests** : `srs-seance` (la forme de chaque domaine et sens ;
  `fleuves:danube:localiser` noté sur le tracé, jamais sur un pays) ;
  `seance-vue` (une Révision du jour qui mêle un pays, un fleuve, une
  chaîne et un détroit pose chaque étape sous sa forme) ; `carte-memoire`
  (un fleuve faible et un fleuve jamais vu se distinguent ; un détroit en
  pastille teintée) ; `sim-charge` à 14 domaines (S1710).
- **Fin** : une Révision du jour avec des fiches du J5 jouée sur le site ;
  captures de la carte de la mémoire (S1711).

### Lot 3. Déserts et chaînes

- **Contenu** : `noterRegion` dans `map/pick.ts` (dans le polygone ou à
  12 px, aucune autre région de la série plus près) ; `vues/sujets.ts` pour
  les deux sujets ; séries uniques ; grappes par continent ; Chrono et Sans
  faute (tailles dans `chrono.ts` et `firestore.rules`, règles d'abord).
- **Tests** : `pick` (un toucher dans les Alpes juste pour les Alpes, faux
  pour le Jura ; une chaîne de 6 px touchée à 10 px ; un recouvrement
  résiduel juste pour les deux, D1707) ; vues ; `chrono.test` (tailles,
  borne) ; `regles.test` (`chrono:montagnes:…` à 40 et `chrono:deserts:…`
  à 25).
- **Fin** : les deux sujets jouables au doigt sur le site.

### Lot 4. Détroits et canaux

- **Contenu** : `noterPoint` (repris du lot des villes du J4 s'il est livré,
  écrit ici sinon) ; les pastilles de la série ; le sujet.
- **Contenu, en plus** : Chrono et Sans faute (taille 30 dans `chrono.ts`,
  `epreuveConnue` et `tailles` dans `firestore.rules`, règles déployées
  d'abord).
- **Tests** : `pick` (le disque le plus proche l'emporte ; Bosphore et
  Dardanelles séparés au zoom de la série) ; vues ; `chrono.test`
  (taille 30, catalogue et règles d'accord) ; `regles.test`
  (`chrono:detroits:…` à 30 questions passe, à 31 non).
- **Fin** : le sujet jouable au doigt.

### Lot 5. Fleuves

- **Contenu** : `noterLigne` (distance à l'écran du doigt au tracé projeté,
  et le plus proche de la série) ; séries par continent (D1708) ; leurres
  voisins sans affluents ; rétroaction « plus près de… ».
- **Contenu, en plus** : Chrono et Sans faute des cinq séries (Tous 100,
  Europe 42, Asie et Océanie 27, Amériques 18, Afrique 13) dans
  `TAILLES_SERIES` et `firestore.rules`, règles d'abord.
- **Tests** : `pick` (le Rhin et la Moselle départagés au zoom de la série
  Europe ; un toucher en mer près d'une embouchure) ; `journal`
  (`distance_km` au tracé) ; vues ; `chrono.test` (les cinq tailles, leur
  somme hors « Tous » égale à 100) ; `regles.test` (une série de fleuves
  inconnue de `epreuveConnue` refusée, chacune des cinq acceptée).
- **Fin** : le sujet jouable au doigt, chaque série.

### Lot 6. Fiches

- **Contenu** : sortes `fleuve`, `montagne`, `desert`, `detroit` ; faits ;
  pays traversés ; `docs/relectures/fiches-physique.md` ; la recherche (les
  objets du J5, avec leur sorte) ; la case « Fleuves » de ⚙ si D1710 a.
- **Tests** : `donnees-fiches` (chaque objet a sa fiche) ; `recherche`
  (« Congo » donne le pays et le fleuve, chacun avec sa sorte).

### Lot 7. Jouer, quiz, fin

- **Contenu** : la tuile du J5 dans Jouer (D1712) ; les générateurs du quiz
  (D1714) ; la borne du général (D1713) ; le pilote (`ui_fleuves`…,
  `SUJETS_ENTRAINEMENT`) ; l'APK.
- **Tests** : `chrono.test` (la borne du général à 1 539 sans le J4, ou
  à la somme des deux jalons avec lui, égale dans `BORNE_GENERAL` et
  `firestore.rules` ; `epreuvesDuGeneral` compte les Chrono du J5) ;
  `regles.test` (un Chrono du général à la nouvelle borne passe, un au-delà
  non) ; `quiz.test` (les générateurs des quatre sujets à graine fixe :
  formes, leurres sans affluent, aucun objet deux fois ; les parts à
  8 sujets ou plus, `quiz/tirage.ts:19`) ; le pilote.
- **Fin** : les critères de #7 : poids dans le budget, testé en CI ; aucun
  nom manquant dans une langue ; chaque sujet jouable au doigt sur le site
  et dans l'APK.

## 15. Décisions à trancher

Chaque réponse se note au registre. Une réponse qui contredit une décision
actée la **remplace** (`noter_decision`, `remplace`). En attendant, le code
prend le défaut, une constante nommée et commentée « défaut en attente de
l'utilisateur, #7 ». Trois défauts cessent d'être réversibles dès qu'un
classement en dépend : les listes (D1700, la taille d'une épreuve fait son
classement), la règle du juste (D1707) et le contenu du général (D1713). Les
épreuves classées d'un sujet attendent donc leur réponse, ses exercices
d'Entraînement non.

| N° | Question | Options | Recommandation | Défaut si rien n'est dit |
|---|---|---|---|---|
| D1700 | Les listes | a) les listes de l'annexe : 100 fleuves, 40 chaînes et plateaux (après D1719), 25 déserts, 30 détroits et canaux, par le rang combiné et les filtres du § 4 ; b) plus courtes (50, 25, 20, 20 : les premières de chaque liste) ; c) plus longues (150, 60, 30, 40 ; il n'y a guère plus de déserts) ; d) a, avec un quota par continent (au moins 8 fleuves par continent habité sauf l'Océanie, qui n'en a que 2 candidats, § 5.6 ; au plus 2 déserts d'Australie) | **a**, après relecture de l'annexe (échanges ligne à ligne) ; d si l'Europe à 42 fleuves sur 100 gêne | a, liste montrée avant les épreuves |
| D1701 | Sujets et domaines | a) quatre sujets, quatre domaines : Fleuves, Montagnes, Déserts, Détroits ; b) deux : « Eaux » (fleuves, détroits) et « Reliefs » (chaînes, déserts) ; c) un seul « Géographie physique » | **a** : une seule sorte de cible par sujet (une ligne, un polygone, un point), donc une seule notation, des grappes et des épreuves simples | a |
| D1702 | Montagnes | a) les chaînes et les plateaux du rang que le filtre de recouvrement garde (Massif central, Deccan ; D1719) ; b) les chaînes seules (les plateaux sortent, les quatre suivants entrent) ; c) a, plus un sujet Sommets (≈ 30, annexe, table 5) au J5 ; d) chaînes et sommets dans le même sujet | **a**, et c plus tard si l'on veut les sommets | a |
| D1703 | Canaux | a) Suez et Panama dans le sujet, renommé « Détroits et canaux » ; b) hors du J5 | **a** : les deux passages les plus connus (170 et 154 Wikipédias) | a |
| D1704 | Objets sans tracé dans la couche principale (Apennins, désert d'Arabie, Mojaves ; Aar, Isar, Neckar, Sprée, Arno) | a) écartés : la liste est ce que dessinent `rivers_lake_centerlines` et `geography_regions_polys` ; b) a, plus un polygone à la main pour les Apennins seuls (101 Wikipédias, 42 207 vues), relu à l'œil ; c) b, plus les cinq rivières du complément européen de Natural Earth ; d) une autre source de tracés (licence à vérifier) | **b** : les Apennins manquent à un Français, l'Europe a déjà 42 fleuves | a |
| D1705 | Un fleuve, ses tronçons | a) avec ses tronçons sous un autre nom (Ucayali, Jinsha, Lualaba, Nil Blanc et Kagera), jamais ses affluents, table relue ; b) les tronçons de son seul item (le Nil depuis Khartoum) | **a** : c'est le fleuve des longueurs qu'on enseigne | a |
| D1706 | Ce qui est dessiné pendant une question de fleuve ou de détroit | a) tous les fleuves (traits) ou détroits (pastilles) de la série, sans nom ; b) rien : on touche une carte muette, juste à N km | **a** : on voit les candidats, comme les frontières des pays ; b ferait d'une erreur proche une distance, que le barème renvoie à la rétroaction | a |
| D1707 | Le juste | a) à 12 px de la cible (dans le polygone, ou dans le disque de 44 px d'un détroit), aucun autre objet de la série plus près du doigt ; dans deux polygones à la fois (recouvrement résiduel), juste pour chacun des deux (§ 6.3) ; b) 12 px seul ; c) une distance en km (100 km, comme les villes du J4) | **a** | a |
| D1708 | Séries des fleuves | a) Tous et une série par continent, celles de moins de 8 fleuves fondues avec leur voisine ; b) une série unique de 100 | **a** : au zoom 1, 12 px font ≈ 1 100 km (estimé, à mesurer : S600 du J4) | a |
| D1709 | Un objet dans un autre (le Ténéré dans le Sahara) | a) le tout seul, ses parties hors de la liste, sauf exception écrite ; b) les parties dans la liste, justes aussi pour le tout (la règle des sous-mers) | **a** | a |
| D1710 | Le J5 à l'accueil | a) une case « Fleuves » dans ⚙, à côté des lignes de repère : elle dessine les fleuves de la liste, le toucher reste au pays ; b) a, et un fleuve à 6 px sous le doigt ouvre sa fiche ; c) rien | **a** | c |
| D1711 | Pastilles des micro-États pendant une question du J5 | a) cachées, comme pour les mers ; b) gardées | **a** : un fleuve ne se juge pas à un disque, et les pastilles des détroits ne doivent pas se mêler à celles des pays | a |
| D1712 | Jouer | a) une tuile (« Nature », nom à choisir) qui ouvre Océans et mers, Fleuves, Montagnes, Déserts, Détroits ; b) quatre tuiles de plus au niveau des sujets ; c) une tuile pour les quatre sujets du J5, Océans et mers à sa place | **a**, si le nom plaît ; sinon c | c (aucun chemin appris ne change) |
| D1713 | Le général | a) les Chrono du J5 au général (+ 295 questions) ; b) hors du général | **a**, à la lettre de « Général à tous les sujets » | a |
| D1714 | Quiz général | a) les quatre sujets, une fois livrés, sous les deux formes ; b) fleuves et montagnes seuls ; c) aucun | **a** | a |
| D1715 | Ordre des lots | a) déserts et chaînes, détroits, fleuves ; b) l'ordre du plan (détroits, montagnes, déserts, fleuves) ; c) les fleuves d'abord | **a** : du plus proche de la couche marine au plus neuf | a |
| D1716 | Noms affichés | a) le titre de la Wikipédia française sans parenthèse, générique en minuscule, l'article en donnée, les autres noms en alias, relus ; b) le libellé de Wikidata tel quel ; c) le `name_fr` de Natural Earth | **a** | a |
| D1717 | Neutralité | a) la table du § 10 : riverains et pays traversés par le tracé de fait, zones contestées à part avec leur statut, usage français et alias pour les noms ; b) aucun pays dans les fiches du J5 | **a** : la règle déjà validée pour les voisins et les riverains des mers | a |
| D1719 | Recouvrements entre classes (§ 4) | a) le plateau tibétain et l'Altiplano sortent, la chaîne pontique et le Petit Caucase entrent ; b) l'Himalaya, le Karakoram, le Kunlun et les Andes sortent, les plateaux restent ; c) les cinq gardés, avec une exception écrite (le plus petit polygone l'emporte sous le doigt) | **a** : les chaînes sont bien plus connues ; c rendrait faux, pour le plateau tibétain, un doigt posé au milieu du Tibet himalayen sans que le joueur voie pourquoi | a |
| D1720 | Séance et carte de la mémoire du J5 (§ 13.5) | a) une forme d'étape par domaine (noter par ligne, région ou point ; carte retournée sur l'objet allumé), la carte de la mémoire teinte traits, polygones et pastilles par seau, aucun prérequis ; b) a, avec Océans et mers en prérequis des Détroits | **a** | a |
| D1718 | Fiches des objets du J5 | a) au lot 6, sans photos ; b) avec photos, la relecture du lot P1 étendue ; c) pas de fiches | **a** : la relecture des 332 lieux n'a pas commencé (2 entrées dans `choix.json`) | a |

**Ce qui ne se décide pas ici.** La place du J5 parmi les autres jalons (J4,
J6, le Play Store #5) est une question posée à part. Le test de placement
(#35) servirait aussi au J5 : un « Je connais déjà » par série éviterait
390 introductions à qui connaît déjà le Nil et le Sahara.

## 16. Non retenu

- **Lacs** (`ne_10m_lakes`, 1 355 polygones ; le Baïkal, le Victoria, le
  Titicaca, les Grands Lacs) : hors du plan. Ce serait le prolongement le plus
  simple du J5 (des polygones d'eau douce, touchés comme les mers), à
  reprendre si on les veut.
- **Îles, archipels, péninsules, caps** (295 îles, 160 archipels, 68
  péninsules et caps en polygones, 111 caps en points) : hors du plan, et une
  île est souvent un pays ou un territoire déjà joué.
- **Plateaux en sujet à part** : le Massif central, le Deccan et le plateau
  tibétain sont des plateaux pour Natural Earth ; ils concourent avec les
  chaînes (annexe, marqués « plateau »), sans sujet à eux.
- **Les sommets au J5** (D1702 c) : à reprendre en sujet à part, sur le
  modèle des détroits (des points, pastilles comprises).
- **Les compléments régionaux** de Natural Earth (`rivers_europe`,
  `rivers_north_america`) : plus fins ; le premier a l'Aar, l'Isar, le
  Neckar, la Sprée et l'Arno (D1704 c), le second peut-être le
  Saint-Laurent entier (à vérifier). À reprendre pour une série de France
  (J6) ou plus de fleuves européens.
- **Une note par distance** au fleuve ou au détroit : la décision « Barème et
  classements » la renvoie à la rétroaction, comme au J4 (D611).
- **Un affluent juste pour son fleuve** (le Missouri pour le Mississippi) :
  faux pour qui l'apprend, et les leurres l'excluent déjà.
- **Une carte de fond en relief** (ombrage, tuiles) : contraire au « pas de
  tuiles » du plan ; les chaînes allumées suffisent.
- **OpenStreetMap pour les tracés manquants** : licence ODbL, dont les
  conditions de partage pour des données dérivées sont à vérifier ; le
  tracé à la main de quelques objets (D1704 b) coûte moins.
- **Les fleuves dans `mers.topo.json`** : les mers sont chargées au premier
  toucher en mer à l'accueil (décision « Océans et mers », 14/11), presque
  par chaque visiteur ; la couche physique ne l'est que pour une partie du
  J5.

## 17. Suppositions à vérifier

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S1700 | Simplifié à 5 km, chaque fleuve retenu reste lisible et d'un seul tenant à l'écran de sa série | planche des 100 tracés au zoom de leur série, relue à l'œil | lot 1 |
| S1701 | Le Canvas reste sans saccade sur l'A37 avec les traits des fleuves pendant les gestes | critère de saccade, `touchers_reels.py` (skill `run-terramemo`) | lot 2 |
| S1702 | 12 px suffisent à toucher un fleuve au doigt, et « le plus proche » départage le Rhin, la Meuse et la Moselle sans injustice visible | essai sur l'A37, série Europe | lot 5 |
| S1703 | Le bleu des fleuves, l'ocre des chaînes et le sable des déserts se lisent, en plein soleil compris (#28) | essai à l'œil sur l'A37 | lot 2 |
| S1704 | Les polygones de Natural Earth des chaînes et des déserts ressemblent à ce qu'un joueur attend (les Alpes, le Sahara), et aucun n'est à moitié dans un autre du même sujet après D1719 (mesuré à la relecture, toutes classes) | planche des 65 formes sur la carte, relue à l'œil par l'utilisateur ; le test du lot 1 | lot 1 |
| S1705 | Chaque nom, article et alias de l'annexe est l'usage français | relecture de l'annexe, puis de `physique.fr.json` | lot 1 |
| S1706 | Les superficies des déserts dans Wikidata se convertissent sans erreur (24 en km², 4 en hectares sur les 25 retenus) | conversion par l'unité (`unit` de la valeur), écarts au tracé au-delà de 25 % en table, comme les mers | lot 6 |
| S1707 | Les vues de 12 mois ne sont pas faussées par l'actualité (un détroit dans les nouvelles) | comparer à 24 mois pour les échanges en bord de liste | lot 1 |
| S1708 | La carte la plus longue d'un lot reste sous 160 caractères avec `montagnes` | test `sync-lots` | lot 0 |
| S1709 | Les coordonnées de Wikidata d'un détroit sont à son passage le plus étroit, en mer | carte des 30 points, relue ; un test : chaque point hors de la terre | lot 1 |
| S1710 | Avec 14 domaines (J2, J4, J5), la charge de la mémoire reste près de ≈ 5 min par jour au plafond commun de 15 introductions | `tests/sim-charge.test.ts` (S40 du J2, S607 du J4) reprise sur 90 jours | lot 2b, puis lot 7 |
| S1711 | Un fleuve, une chaîne ou une pastille teintés par seau se lisent sur la carte de la mémoire, sans se confondre avec la teinte des pays | captures des trois rendus, à l'œil sur l'A37 | lot 2b |

## 18. Sources

**Code** : `main` à `4826adc` (le code de `a3d08a0`). Fichiers cités au fil du
texte, lus le 25/11.

**Registre** : décisions actées « Océans et mers », « Quiz général »,
« Répétition espacée des nouveaux sujets », « Barème et classements »,
« Général à tous les sujets », « Zones contestées et enclaves », « Pays et
frontières », « Toucher sur la terre ferme », « Écran Jouer », « Fiche d'un
lieu », « Fiche d'un lieu : sommets et fuseaux », « Pastilles cachées
pendant une question de mer », « Lignes de repère », « Langue »,
« Hébergement », « Morceau JS principal sous 500 Ko », « Ouverture des
épreuves d'un sujet », « Articles des noms de pays » ; ticket #7.

**Études** : `2026-11-04-synthese-agents.md` (question 9) ;
`2026-11-10-j2-conception.md` (§ 2.3, § 2.4, § 4.4, § 13 : la méthode des
mers, reprise ici) ; `2026-11-16-fiche-lieu-conception.md` (riverains,
relectures) ; `2026-11-25-j4-conception.md` (villes notées à un point, lot 0,
Jouer à dix sujets), écrite la même nuit.

**Externes**, relevés le 25/11 entre 0 h 20 et 1 h 50 (heure de La
Réunion) :
- Natural Earth v5.1.2 (`nvkelso/natural-earth-vector`, tag `v5.1.2`, le
  commit `f1890d9f` du projet) : `10m_physical/ne_10m_rivers_lake_centerlines`,
  `ne_10m_rivers_europe`, `ne_10m_rivers_north_america`,
  `ne_10m_geography_regions_polys`, `ne_10m_geography_regions_points`,
  `ne_10m_geography_regions_elevation_points`, `ne_10m_lakes` ; la couche
  marine, celle du projet (`geodata/raw/natural-earth/`) ;
- Wikidata : API `wbgetentities` (2 019 items), SPARQL (5 requêtes, une par
  minute) ;
- vues de la Wikipédia française : API REST `metrics/pageviews/per-article`,
  `all-access/user`, mensuel, du 01/11/2025 au 31/10/2026.

User-Agent générique, sans donnée personnelle, comme `npm run wikidata`.

## Annexe : listes candidates

Produites par `scripts/rang.py` et `scripts/annexe.py`
(`~/Sauvegardes/terramemo/j5-conception/`). « Nom proposé » : la règle de
D1716 a, appliquée par le script, à relire ligne à ligne ; « Wikipédias » :
le nombre d'articles (sites `*wiki`) ; « Vues fr » : vues de la Wikipédia
française de novembre 2025 à octobre 2026. Pour relire : barrer une ligne,
écrire un nom à la place, ou dire « prendre les suivants ».

### Table 1. Fleuves (100)

| # | Nom proposé | Libellé de Wikidata, s'il diffère | Wikipédias | Vues fr (12 mois) | Tracé NE / longueur (km) | Continent | À faire |
|---|---|---|---|---|---|---|---|
| 1 | Danube |  | 180 | 218 834 | 2 566 / 2 850 | Europe |  |
| 2 | Nil |  | 230 | 89 736 | 2 764 / 6 650 | Afrique | tracé à compléter (42 %) |
| 3 | Rhin |  | 170 | 154 579 | 1 092 / 1 233 | Europe |  |
| 4 | Amazone |  | 206 | 78 106 | 3 144 / 6 400 | Amérique du Sud | tracé à compléter (49 %) |
| 5 | Mississippi |  | 172 | 61 545 | 3 351 / 3 766 | Amérique du Nord |  |
| 6 | Congo |  | 165 | 62 759 | 2 262 / 4 700 | Afrique | tracé à compléter (48 %) |
| 7 | Seine |  | 121 | 130 313 | 635 / 777 | Europe |  |
| 8 | Volga |  | 180 | 52 116 | 3 422 / 3 530 | Europe |  |
| 9 | Gange |  | 172 | 42 548 | 3 642 / 2 525 | Asie | tracé à compléter (144 %) |
| 10 | Euphrate |  | 139 | 54 382 | 2 490 / 2 800 | Asie |  |
| 11 | Loire |  | 105 | 170 169 | 815 / 1 006 | Europe |  |
| 12 | Elbe |  | 119 | 55 008 | 921 / 1 094 | Europe |  |
| 13 | Mékong |  | 118 | 59 195 | 4 239 / 4 350 | Asie |  |
| 14 | Rhône |  | 104 | 143 503 | 729 / 812 | Europe |  |
| 15 | Tigre |  | 128 | 40 641 | 1 581 / 1 850 | Asie |  |
| 16 | Pô |  | 106 | 63 248 | 580 / 652 | Europe |  |
| 17 | Jourdain |  | 118 | 47 484 | 302 / 252 | Asie |  |
| 18 | Indus |  | 155 | 32 123 | 2 811 / 3 180 | Asie |  |
| 19 | Tamise |  | 124 | 35 518 | 267 / 334 | Europe |  |
| 20 | Niger |  | 156 | 30 904 | 4 630 / 4 180 | Afrique |  |
| 21 | Yangtsé | Yangzi Jiang | 161 | 29 793 | 2 470 / 6 300 | Asie | tracé à compléter (39 %) |
| 22 | fleuve Saint-Laurent |  | 102 | 55 552 | 106 / 1 197 | Amérique du Nord | tracé à compléter (9 %) |
| 23 | Amour |  | 113 | 30 438 | 2 605 / 2 824 | Asie |  |
| 24 | fleuve Jaune |  | 150 | 24 119 | 4 766 / 5 464 | Asie |  |
| 25 | Brahmapoutre |  | 112 | 29 933 | 1 651 / 2 900 | Asie | tracé à compléter (57 %) |
| 26 | Meuse |  | 90 | 89 700 | 776 / 950 | Europe |  |
| 27 | Dniepr |  | 119 | 26 438 | 1 788 / 2 285 | Europe |  |
| 28 | Colorado |  | 97 | 34 062 | 404 / 2 334 | Amérique du Nord | tracé à compléter (17 %) |
| 29 | Vistule |  | 114 | 20 117 | 949 / 1 047 | Europe |  |
| 30 | Zambèze |  | 110 | 25 376 | 2 764 / 2 574 | Afrique |  |
| 31 | Tibre |  | 101 | 27 896 | 328 / 405 | Europe |  |
| 32 | Ob |  | 112 | 17 165 | 3 388 / 3 650 | Asie |  |
| 33 | Tage |  | 100 | 29 796 | 758 / 1 007 | Europe |  |
| 34 | Oder |  | 101 | 27 635 | 743 / 854 | Europe |  |
| 35 | Missouri | rivière Missouri | 105 | 18 084 | 3 227 / 3 726 | Amérique du Nord |  |
| 36 | Garonne |  | 81 | 118 103 | 413 / 647 | Europe |  |
| 37 | Don |  | 105 | 14 545 | 1 617 / 1 870 | Europe |  |
| 38 | Amou-Daria |  | 103 | 17 101 | 1 557 / 2 620 | Asie | tracé à compléter (59 %) |
| 39 | Orénoque |  | 100 | 21 892 | 2 089 / 2 140 | Amérique du Sud |  |
| 40 | Èbre |  | 87 | 32 676 | 665 / 910 | Europe |  |
| 41 | Douro |  | 86 | 36 483 | 726 / 897 | Europe |  |
| 42 | Léna |  | 111 | 12 277 | 3 946 / 4 294 | Asie |  |
| 43 | Hudson |  | 91 | 26 713 | 374 / 492 | Amérique du Nord |  |
| 44 | río Grande |  | 91 | 26 745 | 2 426 / 3 051 | Amérique du Nord |  |
| 45 | Moselle |  | 84 | 40 793 | 483 / 544 | Europe |  |
| 46 | Ienisseï |  | 102 | 13 111 | 2 742 / 3 487 | Asie |  |
| 47 | Moldau | Vltava | 85 | 28 796 | 328 / 430 | Europe |  |
| 48 | Oural |  | 112 | 8 237 | 1 744 / 2 428 | Asie | continent à trancher |
| 49 | Escaut |  | 78 | 48 512 | 231 / 355 | Europe |  |
| 50 | Nil Bleu |  | 93 | 11 785 | 1 701 / 1 783 | Afrique |  |
| 51 | Sénégal |  | 86 | 22 611 | 947 / 1 050 | Afrique |  |
| 52 | rio Paraná | Paraná | 88 | 14 287 | 1 682 / 4 880 | Amérique du Sud | tracé à compléter (34 %) |
| 53 | Dniestr |  | 101 | 8 442 | 1 160 / 1 352 | Europe |  |
| 54 | Nil Blanc |  | 89 | 12 668 | 2 681 / 2 620 | Afrique |  |
| 55 | Okavango |  | 79 | 29 881 | 1 930 / 1 600 | Afrique |  |
| 56 | Syr-Daria |  | 93 | 8 515 | 1 649 / 2 212 | Asie |  |
| 57 | Guadalquivir |  | 77 | 31 945 | 456 / 657 | Europe |  |
| 58 | Yukon | Fleuve Yukon | 92 | 7 834 | 2 763 / 3 190 | Amérique du Nord |  |
| 59 | Main |  | 87 | 8 819 | 459 / 524 | Europe |  |
| 60 | Moskova |  | 85 | 10 384 | 404 / 502 | Europe |  |
| 61 | Columbia | fleuve Columbia | 90 | 7 817 | 1 721 / 2 000 | Amérique du Nord |  |
| 62 | Inn |  | 77 | 22 359 | 460 / 517 | Europe |  |
| 63 | Tisza |  | 84 | 9 667 | 879 / 966 | Europe |  |
| 64 | Ohio | rivière Ohio | 88 | 6 742 | 1 490 / 1 579 | Amérique du Nord |  |
| 65 | Irtych |  | 93 | 4 787 | 3 607 / 4 248 | Asie |  |
| 66 | Niémen |  | 79 | 11 765 | 194 / 937 | Europe | tracé à compléter (21 %) |
| 67 | Adige |  | 76 | 13 785 | 385 / 410 | Europe |  |
| 68 | Yamuna | Yamunâ | 98 | 3 920 | 1 301 / 1 376 | Asie |  |
| 69 | Potomac |  | 75 | 14 452 | 397 / 590 | Amérique du Nord |  |
| 70 | Orange |  | 89 | 5 257 | 1 960 / 2 200 | Afrique |  |
| 71 | Save |  | 83 | 6 961 | 654 / 945 | Europe |  |
| 72 | Oubangui |  | 77 | 9 834 | 505 / 1 060 | Afrique | tracé à compléter (48 %) |
| 73 | Daugava |  | 93 | 3 595 | 900 / 1 020 | Europe |  |
| 74 | Limpopo |  | 89 | 4 338 | 1 080 / 1 750 | Afrique |  |
| 75 | Prout |  | 72 | 17 244 | 628 / 953 | Europe |  |
| 76 | Gambie |  | 83 | 6 145 | 888 / 1 130 | Afrique |  |
| 77 | rio Negro |  | 81 | 6 261 | 2 940 / 2 250 | Amérique du Sud |  |
| 78 | Angara |  | 84 | 5 604 | 1 912 / 1 779 | Asie |  |
| 79 | Dordogne |  | 61 | 62 195 | 371 / 483 | Europe |  |
| 80 | Murray |  | 88 | 3 536 | 1 485 / 2 508 | Océanie | tracé à compléter (59 %) |
| 81 | Oka |  | 81 | 5 670 | 1 254 / 1 500 | Europe |  |
| 82 | Araxe |  | 78 | 6 860 | 664 / 1 072 | Asie |  |
| 83 | Chao Phraya |  | 76 | 8 127 | 569 / 372 | Asie | tracé à compléter (153 %) |
| 84 | Marne |  | 63 | 35 509 | 363 / 514 | Europe |  |
| 85 | río Uruguay | rio Uruguay | 85 | 3 985 | 1 641 / 1 790 | Amérique du Sud |  |
| 86 | Mackenzie | fleuve Mackenzie | 81 | 6 026 | 1 929 / 1 738 | Amérique du Nord |  |
| 87 | Volta |  | 79 | 6 169 | 450 / 1 500 | Afrique | tracé à compléter (30 %) |
| 88 | Drave |  | 74 | 8 647 | 400 / 720 | Europe | tracé à compléter (56 %) |
| 89 | Irrawaddy |  | 85 | 3 563 | 2 347 / 2 170 | Asie |  |
| 90 | Koura |  | 80 | 5 477 | 1 022 / 1 360 | Asie |  |
| 91 | río Magdalena |  | 79 | 3 998 | 1 371 / 1 528 | Amérique du Sud |  |
| 92 | Weser |  | 71 | 7 263 | 601 / 451 | Europe |  |
| 93 | Kama |  | 83 | 2 176 | 1 633 / 1 805 | Europe |  |
| 94 | rio Madeira |  | 80 | 2 403 | 1 374 / 1 450 | Amérique du Sud |  |
| 95 | Sutlej |  | 70 | 6 638 | 1 393 / 1 500 | Asie |  |
| 96 | Godavari | Godâvarî | 86 | 978 | 1 411 / 1 465 | Asie |  |
| 97 | Severn |  | 71 | 5 369 | 220 / 354 | Europe |  |
| 98 | Maritsa |  | 63 | 10 368 | 438 / 490 | Europe |  |
| 99 | Guadiana |  | 67 | 6 682 | 662 / 778 | Europe |  |
| 100 | Han |  | 67 | 6 216 | 50 / 514 | Asie | tracé à compléter (10 %) |

Par continent (majorité des pays de `P17`) : Europe 42, Asie 26, Afrique 13, Amérique du Nord 11, Amérique du Sud 7, Océanie 1.

Suivants : Ili (67 ; 6 140), rio São Francisco (75 ; 2 384), Shannon (67 ; 6 041), Kolyma (79 ; 1 725), Kasaï (73 ; 3 171), fleuve Rouge (62 ; 8 883), Petchora (81 ; 1 261), Warta (69 ; 4 497), Krishna (81 ; 920), Drina (65 ; 6 326), Dvina septentrionale (77 ; 1 745), Delaware (70 ; 3 747).

Écartés avant le 100e : Neva (74 km) ; río de la Plata (sans tracé dans Natural Earth) ; Aar (sans tracé dans Natural Earth) ; Rubicon (sans tracé dans Natural Earth) ; Chatt-el-Arab (200 km, confluent du Tigre et de l'Euphrate) ; Isar (sans tracé dans Natural Earth) ; Neckar (sans tracé dans Natural Earth) ; Sprée (sans tracé dans Natural Earth) ; rivière des Perles (sans tracé dans Natural Earth) ; Arno (sans tracé dans Natural Earth) ; río Paraguay (sans tracé dans Natural Earth).

### Table 2. Chaînes et plateaux (40)

| # | Nom proposé | Libellé de Wikidata, s'il diffère | Wikipédias | Vues fr (12 mois) | Polygone NE (km²) | Sorte NE |
|---|---|---|---|---|---|---|
| 1 | Himalaya |  | 194 | 106 210 | 474 733 | chaîne |
| 2 | Alpes |  | 187 | 92 421 | 176 303 | chaîne |
| 3 | cordillère des Andes |  | 177 | 69 156 | 3 055 710 | chaîne |
| 4 | Pyrénées |  | 123 | 90 364 | 38 909 | chaîne |
| 5 | montagnes Rocheuses |  | 152 | 42 462 | 1 077 586 | chaîne |
| 6 | Carpates |  | 115 | 64 402 | 220 525 | chaîne |
| 7 | Oural |  | 135 | 43 163 | 209 454 | chaîne |
| 8 | Appalaches |  | 92 | 84 979 | 849 427 | chaîne |
| 9 | Atlas |  | 92 | 59 986 | 680 497 | chaîne |
| 10 | Altaï |  | 93 | 29 370 | 462 748 | chaîne |
| 11 | Karakoram |  | 96 | 23 909 | 112 389 | chaîne |
| 12 | Hindou Kouch |  | 98 | 15 718 | 240 338 | chaîne |
| 13 | Pamir |  | 89 | 18 987 | 98 688 | chaîne |
| 14 | monts Zagros | Zagros | 87 | 19 823 | 243 849 | chaîne |
| 15 | Ardenne |  | 75 | 35 844 | 11 496 | chaîne |
| 16 | Tian Shan |  | 98 | 13 384 | 415 289 | chaîne |
| 17 | massif du Jura |  | 64 | 65 434 | 10 824 | chaîne |
| 18 | Elbourz |  | 79 | 17 794 | 58 459 | chaîne |
| 19 | sierra Nevada (États-Unis) | sierra Nevada | 75 | 19 186 | 70 102 | chaîne |
| 20 | massif des Vosges |  | 61 | 88 445 | 12 564 | chaîne |
| 21 | Massif central |  | 59 | 93 874 | 55 183 | plateau |
| 22 | monts Taurus |  | 81 | 11 838 | 40 610 | chaîne |
| 23 | plateau tibétain |  | 87 | 8 064 | 3 050 431 | plateau |
| 24 | Alpes dinariques |  | 62 | 23 717 | 125 385 | chaîne |
| 25 | Altiplano |  | 64 | 16 772 | 344 676 | plateau |
| 26 | Alpes scandinaves |  | 74 | 9 147 | 211 590 | chaîne |
| 27 | chaîne des Cascades |  | 69 | 12 109 | 142 368 | chaîne |
| 28 | Alpes du Sud |  | 72 | 8 764 | 44 418 | chaîne |
| 29 | cordillère du Kunlun |  | 78 | 6 987 | 296 613 | chaîne |
| 30 | Deccan |  | 78 | 7 032 | 367 180 | plateau |
| 31 | Drakensberg |  | 74 | 7 207 | 296 305 | chaîne |
| 32 | Caucase |  | 113 | 3 308 | 156 122 | chaîne |
| 33 | Adirondacks |  | 59 | 18 961 | 36 165 | chaîne |
| 34 | sierra Nevada (Espagne) | Sierra Nevada | 54 | 43 095 | 22 483 | chaîne |
| 35 | Ghats occidentaux | Ghâts occidentaux | 80 | 5 130 | 136 708 | chaîne |
| 36 | cordillère australienne |  | 69 | 7 738 | 793 832 | chaîne |
| 37 | Grand Balkan |  | 78 | 5 435 | 36 816 | chaîne |
| 38 | Hauts plateaux abyssins | Plateaux d'Éthiopie | 66 | 4 849 | 662 403 | chaîne |
| 39 | cordillère Cantabrique |  | 53 | 13 858 | 27 886 | chaîne |
| 40 | Black Hills |  | 54 | 10 798 | 14 571 | chaîne |

Après D1719 a (relecture) : le plateau tibétain (23e) et l'Altiplano (25e)
sortent, recouverts par l'Himalaya, le Karakoram et le Kunlun, ou dans les
Andes (§ 4) ; la chaîne pontique et le Petit Caucase entrent (41e et 42e
du rang), sans recouvrement mesuré avec les retenus. Les Alpes du Sud (28e)
s'affichent « Alpes du Sud (Nouvelle-Zélande) » (§ 6.2).

Suivants : chaîne pontique (63 ; 3 779), Petit Caucase (64 ; 3 228), chaîne Transantarctique (62 ; 3 837), Sudètes (60 ; 4 744), massif de l'Aïr (57 ; 5 095), Fouta-Djalon (44 ; 20 446), Pinde (56 ; 4 701), plateau de Sibérie centrale (60 ; 1 773), massif du Tibesti (47 ; 7 126), Kopet-Dag (55 ; 1 321), Sikhote-Aline (54 ; 1 507), Ghats orientaux (58 ; 595).

Écartés avant le dernier retenu : Tibet (une région) ; Péninsule Ibérique (un « plateau » de NE, Península Ibérica) ; Forêt-Noire (un massif de moyenne montagne, gardé si l'on veut) ; Apennins (sans tracé dans Natural Earth) ; Dolomites (sans tracé dans Natural Earth) ; Annapurna (un massif de l'Himalaya) ; Hoggar (sans tracé dans Natural Earth) ; massif Vinson (sans tracé dans Natural Earth) ; Tassili n'Ajjer (sans tracé dans Natural Earth) ; Rif (dans Atlas) ; Tatras (sans tracé dans Natural Earth) ; Eifel (sans tracé dans Natural Earth) ; mont Liban (sans tracé dans Natural Earth) ; Grand Caucase (sans tracé dans Natural Earth) ; Harz (polygone de 9 175 km² (moins de 10 000)) ; mont Rose (sans tracé dans Natural Earth) ; mont Roraima (sans tracé dans Natural Earth) ; Rwenzori (polygone de 6 173 km² (moins de 10 000)) ; monts Huang (un site) ; Rhodopes (sans tracé dans Natural Earth) ; Vatnajökull (un glacier).

### Table 3. Déserts (25)

| # | Nom proposé | Libellé de Wikidata, s'il diffère | Wikipédias | Vues fr (12 mois) | Polygone NE (km²) | Sorte NE |
|---|---|---|---|---|---|---|
| 1 | Sahara |  | 211 | 104 470 | 10 679 458 | désert |
| 2 | désert de Gobi |  | 112 | 65 508 | 1 090 098 | désert |
| 3 | désert d'Atacama |  | 99 | 57 004 | 166 747 | désert |
| 4 | désert du Kalahari |  | 104 | 28 130 | 762 813 | désert |
| 5 | désert du Taklamakan |  | 91 | 25 444 | 205 175 | désert |
| 6 | désert du Namib |  | 89 | 17 289 | 129 888 | désert |
| 7 | Néguev |  | 86 | 20 297 | 13 232 | désert |
| 8 | désert du Karakoum |  | 89 | 9 941 | 396 129 | désert |
| 9 | désert du Thar |  | 81 | 7 894 | 267 034 | désert |
| 10 | Rub al-Khali |  | 66 | 11 454 | 596 525 | désert |
| 11 | désert de Sonora |  | 65 | 12 259 | 229 467 | désert |
| 12 | Dacht-e Lout | Dasht-e Lut | 63 | 7 780 | 79 273 | désert |
| 13 | désert du Kyzylkoum |  | 73 | 3 770 | 476 908 | désert |
| 14 | désert de Syrie |  | 67 | 3 787 | 198 530 | désert |
| 15 | Grand désert de Victoria |  | 77 | 1 830 | 249 609 | désert |
| 16 | désert de Chihuahua |  | 48 | 4 699 | 498 867 | désert |
| 17 | désert Danakil |  | 42 | 7 827 | 114 567 | désert |
| 18 | désert du Néfoud | Néfoud | 48 | 2 858 | 60 698 | désert |
| 19 | Grand désert de Sable |  | 55 | 1 895 | 277 657 | désert |
| 20 | Dacht-e Kavir |  | 50 | 2 284 | 43 949 | désert |
| 21 | désert de Simpson |  | 46 | 2 415 | 88 899 | désert |
| 22 | désert de Gibson |  | 48 | 1 135 | 105 830 | désert |
| 23 | désert de Tanami |  | 39 | 1 014 | 55 897 | désert |
| 24 | désert de Chalbi |  | 36 | 425 | 136 769 | désert |
| 25 | steppe de la Faim |  | 39 | 217 | 133 625 | désert |

Suivants : désert d'Ordos (31 ; 1 102), Wahiba Sands (20 ; 1 576), désert du Registan (28 ; 615), désert Strzelecki (23 ; 353).

Écartés avant le dernier retenu : Sinaï (une péninsule) ; Vallée de la Mort (une vallée) ; Pendjab (une région, pas un désert (classe Desert de NE)) ; désert des Mojaves (sans tracé dans Natural Earth) ; Tassili n'Ajjer (un plateau) ; Salar d'Uyuni (un désert de sel) ; désert d'Arabie (sans tracé dans Natural Earth) ; désert Libyque (dans Sahara) ; Ténéré (dans Sahara) ; désert de Błędów (sans tracé dans Natural Earth) ; désert de Tabernas (sans tracé dans Natural Earth) ; désert de Judée (sans tracé dans Natural Earth) ; désert Arabique (dans Sahara) ; désert de Nubie (dans Sahara) ; Sahara algérien (sans tracé dans Natural Earth) ; Aralkum (sans tracé dans Natural Earth) ; Caatinga (une forêt sèche) ; Hautes Terres d'Islande (un plateau) ; Grand Erg oriental (dans Sahara) ; désert de Black Rock (polygone de 1 555 km² (moins de 10 000)) ; Arabah (sans tracé dans Natural Earth) ; désert de Badain Jaran (sans tracé dans Natural Earth) ; Grand Erg occidental (dans Sahara) ; Pan de Makgadikgadi (une cuvette de sel) ; désert Ryn (sans tracé dans Natural Earth) ; désert du Cholistan (sans tracé dans Natural Earth) ; Ad-Dahna (sans tracé dans Natural Earth) ; Painted Desert (sans tracé dans Natural Earth).

### Table 4. Détroits et canaux (30)

| # | Nom proposé | Wikipédias | Vues fr (12 mois) | Point (Wikidata) | Largeur (`P2049`) |
|---|---|---|---|---|---|
| 1 | canal de Suez | 170 | 203 582 | 30.70, 32.34 | — |
| 2 | détroit d'Ormuz | 129 | 505 479 | 26.60, 56.50 | 55 km |
| 3 | canal de Panama | 154 | 125 866 | 9.12, -79.75 | — |
| 4 | détroit de Gibraltar | 123 | 83 611 | 35.97, -5.52 | 14,3 km |
| 5 | Bosphore | 124 | 61 284 | 41.12, 29.08 | — |
| 6 | détroit de Magellan | 94 | 107 421 | -54.00, -71.00 | — |
| 7 | détroit de Malacca | 105 | 61 907 | 2.83, 101.04 | — |
| 8 | Bab-el-Mandeb | 94 | 92 275 | 12.58, 43.33 | — |
| 9 | détroit de Béring | 113 | 46 486 | 65.75, -168.98 | — |
| 10 | Dardanelles | 106 | 48 738 | 40.20, 26.40 | — |
| 11 | Cattégat | 83 | 31 208 | 56.93, 11.43 | 88 km |
| 12 | passage de Drake | 79 | 26 683 | -58.58, -62.91 | — |
| 13 | Skagerrak | 82 | 10 903 | 57.85, 9.07 | 85 km |
| 14 | pas de Calais | 77 | 13 376 | 51.00, 1.45 | 40 km |
| 15 | détroit de Taïwan | 82 | 7 040 | 24.81, 119.93 | — |
| 16 | Øresund | 75 | 13 830 | 55.75, 12.75 | — |
| 17 | détroit de Messine | 69 | 29 940 | 38.25, 15.63 | — |
| 18 | détroit de Torrès | 76 | 8 032 | -9.83, 142.50 | — |
| 19 | détroit de la Sonde | 77 | 6 745 | -5.97, 105.77 | 100 km |
| 20 | détroit de Kertch | 79 | 5 035 | 45.35, 36.65 | 15 km |
| 21 | canal d'Otrante | 76 | 5 584 | 40.22, 18.93 | — |
| 22 | détroit de Bass | 75 | 3 876 | -40.00, 146.00 | — |
| 23 | détroit de Davis | 73 | 4 152 | 65.00, -58.00 | 644 km, 338 km |
| 24 | détroit de Tiran | 54 | 10 599 | 28.00, 34.47 | — |
| 25 | détroit de Danemark | 75 | 2 960 | 67.00, -24.00 | — |
| 26 | détroit de Corée | 80 | 1 724 | 34.60, 129.80 | — |
| 27 | détroit de Cook | 70 | 2 457 | -41.23, 174.48 | — |
| 28 | détroit de La Pérouse | 59 | 3 296 | 45.72, 142.03 | — |
| 29 | canal Beagle | 48 | 7 186 | -54.88, -68.14 | — |
| 30 | canal de Sicile | 51 | 4 730 | 37.20, 11.20 | — |

Suivants : canal de Bristol (64 ; 2 621), bouches de Bonifacio (48 ; 5 175), détroit de Tatarie (61 ; 2 097), détroit de Macassar (67 ; 1 730), détroit de Singapour (52 ; 3 031), détroit d'Hudson (62 ; 1 924), Grand Belt (49 ; 3 372), détroit de Palk (70 ; 1 319), détroit de Floride (66 ; 1 500), détroit de Lombok (43 ; 2 860), détroit de Tsugaru (66 ; 1 298), canal Saint-Georges (55 ; 1 524).

Écartés avant le 30e : Manche (déjà une zone des mers (J2)) ; fleuve Saint-Laurent (un fleuve (NE le range en « channel »)) ; canal du Mozambique (déjà une zone des mers (J2)) ; passage du Nord-Ouest (une route, pas un détroit) ; Zuiderzee (une ancienne baie fermée) ; Golden Gate (moins de 3 km de large, rien à l'écran du monde) ; Firth of Forth (un estuaire) ; East River (un bras de New York).

### Table 5. Sommets (30, si D1702 c)

Pour mémoire, si un sujet Sommets vient un jour : l'Everest, le Lhotse et
le Makalu sont à moins de 20 km les uns des autres, le mont Blanc et le
Cervin à 63 km (mesuré) ; un sujet de points devrait n'en garder qu'un par
massif. Le Denali est « Mont McKinley » dans la Wikipédia française, nom
que les États-Unis lui ont rendu en 2025 et dont l'usage est débattu : un
cas de plus pour la table du § 10 (à vérifier).

| # | Nom proposé | Altitude (m) | Wikipédias | Vues fr (12 mois) |
|---|---|---|---|---|
| 1 | Everest | 8 849 | 218 | 258 174 |
| 2 | Kilimandjaro | 5 895 | 178 | 183 871 |
| 3 | mont Fuji | 3 777 | 132 | 133 873 |
| 4 | mont Blanc | 4 807 | 114 | 184 130 |
| 5 | Vésuve | 1 281 | 125 | 125 972 |
| 6 | Etna | 3 357 | 115 | 118 634 |
| 7 | K2 | 8 611 | 107 | 111 787 |
| 8 | Elbrouz | 5 642 | 110 | 70 871 |
| 9 | mont Ararat | 5 137 | 106 | 58 372 |
| 10 | Teide | 3 715 | 103 | 63 538 |
| 11 | Aconcagua | 6 962 | 108 | 49 462 |
| 12 | mont Olympe | 2 918 | 103 | 58 188 |
| 13 | Uluru | 900 | 92 | 65 305 |
| 14 | Krakatoa | 813 | 87 | 84 313 |
| 15 | mont McKinley | 6 190 | 98 | 46 420 |
| 16 | Cervin | 4 478 | 83 | 109 873 |
| 17 | Nanga Parbat | 8 126 | 86 | 28 773 |
| 18 | Mauna Kea | 4 207 | 86 | 26 795 |
| 19 | mont Saint Helens | 2 549 | 78 | 56 840 |
| 20 | Kangchenjunga | 8 586 | 100 | 15 249 |
| 21 | mont Kailash | 6 638 | 85 | 21 572 |
| 22 | mont Sinaï | 2 287 | 82 | 38 425 |
| 23 | mont Kosciuszko | 2 228 | 84 | 19 981 |
| 24 | Chimborazo | 6 263 | 82 | 21 144 |
| 25 | Lhotse | 8 516 | 86 | 14 954 |
| 26 | montagne Pelée | 1 397 | 62 | 67 423 |
| 27 | Dhaulagiri | 8 167 | 89 | 10 527 |
| 28 | Makalu | 8 485 | 88 | 11 509 |
| 29 | Ben Nevis | 1 345 | 76 | 20 120 |
| 30 | mont Damavand | 5 610 | 77 | 16 863 |

Suivants : mont Kenya (84 ; 11 706), Puncak Jaya (75 ; 15 751), Pinatubo (70 ; 21 191), Tambora (70 ; 20 448), Zugspitze (73 ; 15 115), massif Vinson (74 ; 12 824), mont Erebus (68 ; 19 006), Cho Oyu (83 ; 8 646), mont Rainier (68 ; 19 271), mont Logan (74 ; 12 426), Manaslu (82 ; 8 230), Merapi (78 ; 9 010).

Écartés : mont Rushmore (un monument) ; Olympus Mons (sur Mars) ; mont Athos (une péninsule).
