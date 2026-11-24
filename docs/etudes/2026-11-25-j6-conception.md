# J6, France : départements, régions, préfectures, numéros, DROM en encarts : conception (25/11/2026, #8)

*Faite seule, de nuit, par un agent, sans relecture adverse ni réponse de
l'utilisateur : à relire et à trancher avant tout code. Code lu sur `main`
à `a9e0640` (le code est celui de `a3d08a0` : les commits suivants ne
touchent que `docs/etudes/`). Rien n'est codé.*

**Numérotation.** La dernière étude validée du dépôt (fiche d'un lieu)
s'arrête à D61 et S64. Quatre études de cette nuit ont pris des plages à
part, relues dans `git log -- docs/etudes` avant d'écrire : D350 à D362
(test de placement, #35), D600 à D649 (J4, #6), D900 à D949 (multijoueur,
#9), D1300 à D1349 (saisie libre, #36). Celle-ci prend la plage
**D860 à D899** et **S860 à S899**, entre les centaines rondes, qu'une étude
du J5 ne peut pas heurter en partant de D62, D500, D700 ou D800 à D849. Elle
utilise D860 à D876 et S860 à S872. On peut renuméroter à la validation.

**Conventions** (celles des études du J2, de la fiche d'un lieu et du J4).
**Mesuré** : commande lancée ou fichier lu, avec `fichier:ligne`.
**Estimé** : jugement ou calcul sur des hypothèses dites. **À vérifier** :
ni mesuré ni lu. Tailles : S (moins d'une demi-journée), M (une
demi-journée à deux jours), L (plus). Les chemins de code sont relatifs à
`src/`, sauf `geodata/`, `public/`, `tests/` et `firestore.rules`.

**Mesures.** Elles portent sur un extrait du WFS de l'IGN
(`ADMINEXPRESS-COG-CARTO.LATEST`, couches `departement`, `region`,
`chef_lieu_de_departement` et `chef_lieu_de_region`, en CRS:84), téléchargé
le 25/11 vers 0 h 20 pour la seule mesure (32 Mo). Il est rangé hors du
dépôt, avec les scripts jetables et leurs sorties, dans
`~/Sauvegardes/terramemo/j6-conception/` (`scripts/poids.sh`, `sommets.py`,
`ecran.mjs`, `aires.mjs`, `collisions.py` ; sorties `mesures.txt` et
`mesures-poids.txt`). Aucune archive de l'IGN n'a été téléchargée (§ 3.1).

**Le besoin.** Le plan (`docs/plan.md:159`) : « Régions, départements, DROM
en encarts (IGN Admin Express, Licence Ouverte) ; les communes de La Réunion
sont au J1c », fini quand « 101 départements jouables, encarts compris ».
Le ticket #8 ajoute « départements (nom, numéro, préfecture) » et « source et
date affichées ». La décision « Quiz de La Réunion » (06/11) dit : « Pas
d'exercice propre (la France du J6 viendra de même) ». Le J6 prend donc les
exercices qui existent, sur une carte de plus.

## Résumé

**Ce que je propose.** Une carte de France de plus, construite comme celle
de La Réunion : un terrain local, chargé au choix de la série, en SVG, avec
la mention de l'IGN et de la date. Les cinq DROM y sont en **encarts**, et
Paris et sa petite couronne aussi, parce qu'au zoom 1 du téléphone Paris
fait 3 px (mesuré). Les encarts viennent d'une **projection composée**
écrite pour Terramemo, sur le modèle de `geoAlbersUsa` de d3. Les données
gardent ainsi leurs vraies coordonnées : le toucher, les distances, les
superficies et les fiches restent justes.

Quatre sujets, joués comme les pays : Apprendre, Trouver, Reconnaître,
Chrono et Sans faute :
- **Départements** : le nom (101) ;
- **Régions** : le nom (18, DROM compris) ;
- **Préfectures** : comme les capitales, la cible reste le département ;
- **Numéros** : « Touche le 35 », ou le département allumé et quatre
  numéros.

Ils sont rangés sous une tuile **France** de Jouer, avant Communes. Les
séries suivent les régions, et chaque sujet a un seul Chrono classé,
« France entière ». Le général gagne 321 questions (1 244 → 1 565 sans le
J4). Le quiz général reste au monde, comme pour les communes (D51). Les
départements et les régions ont leur fiche, sans photos.

Les données tiennent dans **≈ 64 Ko compressés**, dont 54 Ko pour la
topologie (mesuré à 500 m de simplification), contre 15 Ko pour l'île. Le
script `geodata/france.mjs` part d'une seule archive de l'IGN, à télécharger
une fois (125,7 Mo, § 3.1).

**Les choix qui comptent vraiment** (le détail et les autres choix sont au
§ 10) :
1. **D865, Mayotte.** Dans le monde, Mayotte est une zone contestée (les
   Comores la revendiquent), hachurée et jamais posée (décision « Pays et
   frontières »). Le ticket veut 101 départements, Mayotte compris. Je
   recommande de la poser au J6, parce que le J6 porte sur le découpage
   administratif de la France, et de dire la revendication dans sa fiche.
   C'est un écart à la lettre de la décision : seul l'utilisateur peut le
   faire, donc D865 n'a pas de défaut et le lot 1 attend sa réponse.
2. **D860, les sujets.** Je recommande quatre sujets (Départements, Régions,
   Préfectures, Numéros), chacun avec ses fiches dans les deux sens. Cela
   fait ≈ 640 fiches de plus. L'autre voie : le numéro affiché à côté du nom,
   sans sujet à lui.
3. **D861, Jouer.** Je recommande une tuile **France** qui ouvre un niveau à
   quatre choix. Avec les dix tuiles du J4, quatre tuiles de plus à plat en
   feraient quatorze, le double des 7 de la décision « Écran Jouer ».
4. **D863 et D864, les encarts.** Je recommande la projection composée
   maison : une bande d'encarts sous la métropole en portrait, une colonne à
   gauche en paysage, sans nom dans les cadres (il donnerait la réponse).
   Paris, les Hauts-de-Seine, la Seine-Saint-Denis et le Val-de-Marne y
   passent à 16-24 px au lieu de 3-5 px (mesuré).
5. **D862 et D870, séries et général.** En Entraînement, je recommande la
   France entière, puis les 13 régions de la métropole et l'Outre-mer. En
   Classé, la France entière seule : 8 épreuves de plus au lieu de 120, et
   321 questions de plus au général.
6. **D872, les fiches.** Une fiche par département et par région : numéro,
   préfecture, région, habitants, superficie et voisins, sans photos au J6.

## 1. Ce qui existe et ce qui manque

| Élément | Existe (`a3d08a0`, lu) | Manque |
|---|---|---|
| Terrain local | `DefTerrain`, `REUNION`, `projectionLocale` (Mercator ajustée), `cadreLocal` (`map/terrain.ts:10-33`, `:59-89`) ; le commentaire de tête annonce « la France du J6 n'aura qu'une DefTerrain de plus » (`:1-5`) | une projection par terrain (Lambert et encarts), deux objets d'une même topologie (départements, régions) |
| Terrains connus | `NomTerrain = 'monde' \| 'reunion'` (`map/types.ts:94`) ; `DEFS` n'a que l'île (`terrains.ts:37`) | `departements`, `regions` |
| Code de l'île en dur | 28 mentions de `'reunion'` dans `src/`, dont 13 dans `vues/explorer.ts` (barre, fiche, retour, `:380` à `:826`) | une notion de « terrain local » qui vaut pour l'île et la France (§ 4.6) |
| Toucher | `versLonLat` exige que l'aller-retour écran → carte → écran tombe à 0,5 px près (`map/geo.ts:136-145`) | une projection à encarts où un lieu de la petite couronne a deux places à l'écran (§ 4.5) |
| Domaines | `pays`, `communes`, `capitales`, `drapeaux`, `mers` (`srs/fiches.ts:13`, `:23`), « figés à vie » ; `TERRAIN_DOMAINE` (`:37`) | `departements`, `regions`, `prefectures`, `numeros` |
| Sujets de Jouer | 5 (`vues/arbre.ts:68-80`) ; Communes passe par `duTerrain('reunion')` | un niveau « France » (D861) |
| Grappes | `grappes()` découpe un groupe en paquets de 5 à 9 (`srs/grappes.ts:31-34`) ; `grappesCommunes` (`:271-279`) | des grappes par région (§ 6.3) |
| Épreuves | `CLE_SUJET` (`epreuve/chrono.ts:201`), `EPREUVES_SUJETS` (`:250-256`), `TAILLES_SERIES` (`:319-325`), `BORNE_GENERAL = 1244` (`:308`) | les quatre sujets du J6, la nouvelle borne |
| Règles | `tailles(cle)` (`firestore.rules:26-61`), `epreuveConnue` (`:72-78`), général ≤ 1 244 (`:109`) | les tailles et les clés du J6, la nouvelle borne |
| Quiz | sujets du J2 seuls (`quiz/types.ts:16`, « D51 : pas de communes ») ; la vue ne joue que sur le monde (`vues/quiz.ts:216`, `:308`) | rien au J6 (D871) |
| Recherche | zones du monde, communes, capitales, mers (`vues/recherche.ts:1-14`, `:47-49`) | départements par nom et par numéro, régions, préfectures |
| Fiches | sortes pays, territoire, zone, continent, mer, commune (`fiches/sorte.ts:21-23`) | département, région (§ 8) |
| Données IGN | l'archive du territoire REU, lue par `geodata/reunion.mjs` (GeoPackage par `node:sqlite`, UTM 40S reprojeté) ; verrou `geodata/reunion.lock.json` | la France entière et les quatre autres DROM (§ 3) |
| Crédits | « communes de La Réunion : IGN, ADMIN EXPRESS » (`vues/textes.fr.json:625`) | départements et régions |

**Constat qui simplifie.** Le GeoPackage de l'île, déjà au dépôt
(`geodata/raw/ign/`), contient les tables `departement`, `region`,
`chef_lieu_de_departement` et `chef_lieu_de_region`, avec le code INSEE, le
nom officiel et le point du chef-lieu (mesuré : 14 tables lues). Les
archives des autres territoires ont la même forme (à vérifier, S866) : le
script de l'île se généralise, il ne se réécrit pas.

## 2. Ce que le J6 garde des décisions actées

- **Contenu** (06/11) : France et DROM au J6, les communes de La Réunion à
  part.
- **Quiz de La Réunion** (06/11) : pas d'exercice propre ; la partie remplace
  l'ovale du monde par la carte du terrain.
- **Barème et classements** (12/11) : juste ou faux, pourcentage départagé
  par le temps ; la distance reste dans la rétroaction (D875).
- **Répétition espacée des nouveaux sujets** (10/11, D46 du 14/11) : chaque
  sujet a ses fiches dans les deux sens et entre dans Apprendre, la
  Révision du jour et la carte de la mémoire. Seules les grappes de pays
  s'ouvrent dans la Révision du jour. Au plus 15 introductions
  « Reconnaître » par jour, tous sujets confondus
  (`INTRODUCTIONS_PAR_JOUR`, `srs/planif.ts:33`).
- **Capitales et drapeaux** (10/11) : la cible reste le lieu ; un lieu qui
  porte le nom de la réponse n'est jamais posé en choix parmi 4 (D37 c).
  Les préfectures suivent ce modèle (D868).
- **Général à tous les sujets** (D40 a) et **Ouverture des épreuves d'un
  sujet** (12/11) : tout Chrono ouvert entre au général ; les règles
  Firestore partent d'abord, puis le site.
- **Écran Jouer**, **Panneau de Jouer plein écran** et **Ordre des sujets**
  (D53 b) : 2 à 7 choix par écran, une vignette par tuile, les sujets du
  monde ensemble, Communes en dernier.
- **Hébergement** : rien de la France au premier affichage, aucun
  `preload`.
- **Langue** : noms et textes dans les fichiers de langue ; apostrophe
  typographique, comme pour l'île (`public/geo/reunion/sources.json`,
  `traitement.noms`).
- **Pays et frontières** et **Zones contestées et enclaves** : en jeu sur le
  monde ; Mayotte au J6 demande une décision (D865).
- **Fiche d'un lieu** (16/11) et **Morceau JS principal sous 500 Ko**
  (18/11) : les fiches et leurs textes se chargent à la demande.
- **Critère de saccade** (04/11) : un à-coup est une image de 25 ms ou plus.
  C'est le critère de la carte de France sur l'A37 (S861).

## 3. Données

### 3.1 Source et téléchargements

La source est **IGN, ADMIN EXPRESS COG CARTO 4.0**, édition du 01/01/2026,
sous Licence Ouverte 2.0, comme l'île. La liste des archives de
`https://data.geopf.fr/telechargement/resource/ADMIN-EXPRESS-COG-CARTO` a
été lue le 25/11 (5 pages, 50 archives). Voici les tailles annoncées pour
l'édition 2026 (mesuré) :

| Archive (`ADMIN-EXPRESS-COG-CARTO_4-0__…_2026-01-01.7z`) | Contenu | Octets |
|---|---|---|
| `GPKG_WGS84G_FRA` | toute la France, en longitude et latitude | 125 711 568 |
| `GPKG_LAMB93_FXX` | métropole, Lambert-93 | 64 133 943 |
| `GPKG_RGAF09UTM20_GLP` | Guadeloupe, UTM 20 N | 789 840 |
| `GPKG_RGAF09UTM20_MTQ` | Martinique, UTM 20 N | 759 928 |
| `GPKG_UTM22RGFG95_GUF` | Guyane, UTM 22 N | 938 574 |
| `GPKG_RGM04UTM38S_MYT` | Mayotte, UTM 38 S | 691 843 |
| `GPKG_RGR92UTM40S_REU` | La Réunion, déjà au dépôt (`geodata/raw/ign/`, même taille) | 749 886 |

L'adresse de téléchargement suit celle de l'île (`geodata/reunion.mjs`,
`SOURCE.fichiers`) :
`https://data.geopf.fr/telechargement/download/ADMIN-EXPRESS-COG-CARTO/<nom>/<nom>.7z`.

**Ce que je recommande (D873)** : la seule archive `GPKG_WGS84G_FRA`,
téléchargée une fois dans `geodata/raw/ign/` (ignoré par git), avec son
empreinte dans un verrou à part. Elle est déjà en longitude et latitude :
aucune reprojection. L'autre voie (FXX et quatre DROM, 67 Mo) demanderait
quatre systèmes de coordonnées de plus, chacun à contrôler comme l'UTM 40 S
de l'île, que le script vérifie sommet par sommet par la série de Krüger.
Le WFS, que j'ai lu pour mesurer, n'a pas d'empreinte figée : deux
lancements pourraient différer.

**Téléchargements à faire, au lot 1 seulement** : `GPKG_WGS84G_FRA`
(125,7 Mo) ; rien d'autre. L'archive de l'île reste la source des communes,
inchangée.

### 3.2 Ce que l'IGN donne, et ses pièges

Lu dans l'extrait du WFS (mesuré) :
- **101 départements** : 96 en métropole (dont 2A et 2B) et 971, 972, 973,
  974, 976. Champs : `code_insee`, `nom_officiel`,
  `code_insee_de_la_region`, `code_siren`.
- **18 régions** : 13 en métropole et 5 DROM (codes 01, 02, 03, 04, 06), et
  pour chacune son chef-lieu.
- **101 chefs-lieux de département** (les préfectures) : nom et point. Tous
  sont dans le tracé de leur département (0 hors sur 101). Les deux plus
  proches sont Paris et Nanterre, à 7,6 km.
- Les régions ont 1 à 13 départements : Occitanie 13, Auvergne-Rhône-Alpes
  et Nouvelle-Aquitaine 12, Grand Est 10, Bretagne 4, Corse 2, chaque DROM 1.

Les pièges :
- **Code de la commune siège** : pour Paris, Lyon et Marseille, c'est celui
  d'un arrondissement municipal (75115, 69383, 13206), pas celui de la
  commune. Le script prend le nom et le point du chef-lieu ; il ne joint
  jamais sur ce code.
- **Rhône** : le tracé du 69 couvre aussi la Métropole de Lyon (3 251 km²
  mesurés). C'est le département du Code officiel géographique, et sa
  préfecture, Lyon, est dans la Métropole. La fiche peut le dire (§ 8).
- **Collectivités à statut particulier** : Ville de Paris, Collectivité de
  Corse, Collectivité européenne d'Alsace, Martinique et Guyane
  (collectivités uniques). Le Code officiel géographique garde 75, 2A, 2B,
  67, 68, 972 et 973 comme départements, et l'IGN aussi (mesuré). Le J6 suit
  ce code.
- **Mayotte** (976) est un département dans les données de l'IGN, et une
  zone contestée dans le monde (`geodata/revendications.json:23`, NE_B22,
  « Admin. by France; Claimed by Comoros ») : D865.
- **Noms** : apostrophe droite dans « Côte-d'Or », « Côtes-d'Armor »,
  « Val-d'Oise » et « Provence-Alpes-Côte d'Azur », à remplacer par ’
  comme pour l'île. « Évry-Courcouronnes » et « Charleville-Mézières » sont
  les noms officiels ; « Évry » et « Charleville » en alias (§ 3.5).
- **Numéros** : 2A et 2B (l'ancien 20 n'est plus un département ; les codes
  postaux de Corse commencent encore par 20) ; aucun 975, ni rien au-delà
  de 976.
- **Saint-Pierre-et-Miquelon, Saint-Barthélemy, Saint-Martin** ont leur
  archive (SPM, BLM, MAF) : ce sont des collectivités d'outre-mer, pas des
  départements. Le script filtre sur la liste des 101 codes.

### 3.3 Script et fichiers produits

- **Nouveau `geodata/france.mjs`**, lancé par `npm run geodata:france`. Il
  reprend les règles de `reunion.mjs` : téléchargement dans `raw/`,
  SHA-256 contre `geodata/france.lock.json` (verrou à part, pour la même
  raison que celui de l'île : `build.mjs --maj-empreintes` réécrit le sien),
  refus d'une empreinte différente sauf `--maj-empreintes`, deux lancements
  identiques octet pour octet, lecture du GeoPackage par `node:sqlite` et
  le décodeur WKB de `geodata/outils.mjs`.
- **Table à la main `geodata/france-main.json`** : alias, formes des noms,
  textes de statut des fiches, chaque ligne avec sa raison (le modèle de
  `capitales-main.json`).
- Traitement :
  1. 101 départements exactement, ids = code INSEE (chaînes `01` à `95`,
     `2A`, `2B`, `971` à `976`), sinon `echec` ; 18 régions ;
  2. sens de d3 (`polygones()`), superficie, partie maximale, point
     (polylabel), emprise sur la géométrie non simplifiée, comme l'île ;
  3. une seule topologie, deux objets : `departements` et `regions`. Les
     régions sont dissoutes depuis les départements (`-dissolve
     code_insee_de_la_region`) : leurs frontières sont les mêmes arcs,
     sans trou ni recouvrement. Cela coûte 410 octets compressés de plus
     (mesuré) ;
  4. simplification de Douglas-Peucker (`-simplify dp keep-shapes`) : 500 m
     en métropole, 300 m dans les DROM (D874), îlots de moins de 1 km²
     retirés (`-filter-islands min-area=1km2`, mesuré : 370 octets
     compressés de gagnés). Ouessant reste, l'île de Sein part (estimé, à
     voir sur la liste des îlots retirés) ;
  5. voisins par `neighbors()` sur la topologie finale.
- **Fichiers produits (`public/geo/france/`)** :

| Fichier | Contenu | Taille |
|---|---|---|
| `france.topo.json` | objets `departements` et `regions`, propriété `id` seule | ≈ 54 Ko gzip (mesuré, § 3.4) |
| `departements.json` | une ligne par département (forme de `reunion/communes.json` : `id`, `statut`, superficie, `point`, `bbox`, `micro: false`, `voisins`), plus `region` et `encart` | ≈ 4,7 Ko gzip (estimé : 46 o par ligne compressée dans `communes.json`, 1 114 o pour 24 lignes) |
| `regions.json` | une ligne par région, et ses départements | < 1 Ko gzip (estimé) |
| `noms.fr.json` | `{ departements: {…}, regions: {…} }` | ≈ 1,5 Ko gzip (estimé) |
| `prefectures.json` | `{ "35": { nom: "Rennes", point: […] } }`, et le chef-lieu de chaque région | ≈ 2 Ko gzip (estimé) |
| `sources.json` | forme de `reunion/sources.json` | ≈ 1,6 Ko gzip |

- Ids des régions : **`R` suivi du code INSEE** (`R84`, `R01`), D867. Les 18
  codes de région sont tous aussi des codes de département : les 13 de la
  métropole (`11` Aude et Île-de-France, `84` Vaucluse et
  Auvergne-Rhône-Alpes, `24`, `27`, `28`, `32`, `44`, `52`, `53`, `75`,
  `76`, `93`, `94`) et les 5 des DROM (`01` Ain et Guadeloupe, `02`, `03`,
  `04`, `06`), et ces ids vont au journal à vie.

### 3.4 Poids

Mesuré par `scripts/poids.sh` (mapshaper 0.6.110, la version du dépôt,
quantification 1e5, `gzip -9`) sur l'extrait du WFS :

| Simplification (métropole) | Points | Topologie | gzip |
|---|---|---|---|
| 100 m | 52 795 | 477 Ko | 147 Ko |
| 200 m | 29 317 | 283 Ko | 92 Ko |
| 300 m | 20 535 | 209 Ko | 70 Ko |
| **500 m** | **12 835** | **142 Ko** | **48,6 Ko** |
| 800 m | 8 362 | 100 Ko | 34,9 Ko |

Les cinq DROM, à part : 5,4 Ko gzip et 1 995 points à 300 m ; 3,7 Ko et
1 165 points à 500 m.

Pour comparer (mesuré sur `public/geo/`) :
- l'île : 2 359 points, 10,7 Ko gzip ;
- le monde : 108 886 points, 457 Ko gzip ;
- le monde léger, que la carte trace pendant les gestes : 11 757 points,
  52 Ko gzip.

À 500 m, la France a donc le nombre de points du monde léger. L'étude de
synthèse du 04/11 annonçait « 101 départements pour 54 Ko »
(`2026-11-04-synthese-agents.md:23`) : c'est ce que donne 500 m (48,6 +
5,4).

**Budget (D874)** : ≈ 64 Ko compressés pour tout le dossier (estimé :
54 + 4,7 + 1 + 1,5 + 2 + 1,6). Le test de poids les borne à 80 000 octets
gzip, dont 60 000 pour la topologie. C'est un premier chargement à
l'ouverture d'une série de France, jamais au démarrage. Le quota de Hosting
(360 Mo par jour) le permet ≈ 5 600 fois par jour (estimé). Le dossier
pèse ≈ 160 Ko de plus dans l'APK, non compressé (estimé).

À 500 m, l'écart au tracé de l'IGN fait 0,16 px au zoom 1 sur le téléphone
(3,1 km par pixel, § 4.4) et 1,3 px au zoom 8. Plus fin, le dessin ne se
verrait qu'au zoom maximal, et doublerait les points à tracer (S861).

### 3.5 Noms, alias et collisions

Mesuré par `scripts/collisions.py`, après la normalisation de `texte.ts:5-14`,
contre tous les noms du dépôt (pays et territoires, capitales, mers,
communes de l'île) :

- **Même nom, lieux différents** :
  - Paris : capitale, département, préfecture ;
  - Vienne : capitale de l'Autriche, département 86 ;
  - Manche : mer, département 50 ;
  - Saint-Denis : commune 97411, préfecture du 974 (le même lieu) ;
  - Mayotte : zone contestée NE_B22, département, région ;
  - Guadeloupe, Martinique, Guyane, La Réunion : département et région à la
    fois (le même lieu, deux sujets).

  Aucune collision entre deux départements, deux régions ou deux
  préfectures.
- **Un nom préfixe d'un autre** (suggestions de la recherche et de la
  saisie) : Eure et Eure-et-Loir, Indre et Indre-et-Loire, Tarn et
  Tarn-et-Garonne, Lot et Lot-et-Garonne, Charente et Charente-Maritime,
  Loire et Loire-Atlantique, Corse et Corse-du-Sud, Nord et Nord-Bornéo.
- **Noms à une ou deux fautes**, ce que la règle de collision de la saisie
  libre doit séparer (`2026-11-25-saisie-libre-conception.md`, § 3.4,
  D1304) :
  - entre départements : Marne, Tarn et Orne ; Haute-Marne et
    Haute-Saône ; Haute-Saône et Haute-Savoie ; Loire et Loiret ;
    Saône-et-Loire et Maine-et-Loire ; Meuse, Eure et Creuse ; Aisne, Ain
    et Oise ; Indre et Isère ;
  - entre préfectures : Nantes, Rennes et Vannes ; Rodez et Rouen ; Nîmes
    et Nice ; Mâcon et Laon ; Lille et Tulle ;
  - avec d'autres sujets : Basse-Terre et Basseterre (capitale de
    Saint-Christophe-et-Niévès), Guyane et Guyana, Corse-du-Sud et Corée du
    Sud, Essonne et Estonie, Calvados et Salvador, Vesoul et Séoul.

  Chaque sujet garde ses propres réponses : « Basseterre » n'est jamais
  juste pour la préfecture de la Guadeloupe.
- **Avec le J5** : la plupart des départements portent le nom d'un fleuve
  (Rhône, Loire, Marne, Meuse, Moselle, Somme, Lot, Tarn…). Si la centaine
  de fleuves du J5 en prend, la recherche les distingue par leur détail
  (« département », « fleuve »), et chaque sujet garde ses réponses (S869,
  à confronter à la liste du J5).

**Alias proposés** (table `geodata/france-main.json`, relue par
l'utilisateur avant les épreuves) : « Réunion » pour La Réunion ; « PACA »
et « Région Sud » pour Provence-Alpes-Côte d'Azur ; « AURA » pour
Auvergne-Rhône-Alpes ; « Évry » ; « Charleville » ; « St » pour « Saint »
s'en déduit déjà (étude de la saisie libre, § 3).

### 3.6 Tests de données (`tests/donnees-france.test.ts`, sans réseau, en CI)

- 101 départements, ids uniques, triés, égaux à une liste figée dans le
  test ; 18 régions `R…` ; chaque département dans une région, chaque
  région avec au moins un département ; les 5 DROM sont chacun seul dans sa
  région ;
- noms exacts des 101 et des 18 (table figée), uniques une fois normalisés
  dans chaque sujet ; préfectures exactes (table figée : Basse-Terre pour
  la Guadeloupe, Mamoudzou pour Mayotte, Évry-Courcouronnes pour
  l'Essonne) ; aucune apostrophe droite ;
- géométries : aucune vide, sens de d3 (`geoArea < 0,001 sr`), `point` dans
  sa forme, chaque préfecture dans son département ;
- superficies : métropole entre 540 000 et 555 000 km² (547 332 mesurés sur
  le tracé) ; Paris entre 100 et 110 km² ;
- pas de trou ni de recouvrement dans la métropole continentale (`merge()`
  des départements, le test de l'île) ; l'union des régions égale celle des
  départements ;
- voisins symétriques ; connus : Paris = [92, 93, 94] ; Corse-du-Sud =
  [2B] ; aucun voisin pour les DROM ;
- 974 : son tracé recouvre l'union des 24 communes de `public/geo/reunion/`
  à 1 % près (S864) ;
- poids : topologie ≤ 60 000 octets gzip, dossier ≤ 80 000 ;
- sources : licence « Licence Ouverte », `edition` au format AAAA-MM-JJ,
  empreintes égales à `geodata/france.lock.json`, « sorties à jour ».

## 4. Carte de la France

### 4.1 Deux terrains, une projection

Deux terrains locaux de plus, sur le même dossier et la même topologie :
- `departements` (objet `departements`, 101 zones) ;
- `regions` (objet `regions`, 18 zones).

Pourquoi deux : un terrain a une liste de zones à toucher
(`Terrain.jouables`, `terrains.ts:97`), et `pick` les parcourt toutes. Des
départements et des régions sur la même carte demanderaient une couche de
plus, comme les mers dans le monde, qui ont coûté un lot entier au J2. Deux
cartes SVG de 13 000 points chacune restent légères (estimé). Le fichier
est lu une fois et partagé.

`DefTerrain` (`map/terrain.ts:10-20`) gagne :
- `projection` : `'locale'` (l'île, Mercator, inchangée) ou `'france'` (la
  projection composée, § 4.2) ;
- `encarts` : la liste des cadres, avec ou sans la petite couronne.

Le zoom va de 1 à 8 (0,39 km par pixel au zoom 8 sur le téléphone, Paris à
26 px dans sa vraie place), et `montrer` est borné à 4, comme l'île.

### 4.2 Les encarts des DROM (D863)

| Option | Comment | Pour | Contre |
|---|---|---|---|
| **a) Projection composée maison** | un module pur `map/projection-france.ts` : Lambert conique conforme (parallèles 44° et 49°, celles du Lambert-93) pour la métropole, une Mercator par encart, chacune bornée à son cadre (`clipExtent`), un flux réparti entre elles et un `invert` qui choisit le cadre sous le doigt. C'est le patron de `geoAlbersUsa` de d3 (d3-geo, déjà une dépendance, licence ISC) | vraies coordonnées partout (toucher, distances, superficies, fiches) ; une disposition par forme d'écran ; aucune dépendance | ≈ 150 lignes à écrire et à tester ; `versLonLat` à adapter (§ 4.5) |
| b) `d3-composite-projections` (`geoConicConformalFrance`) | la bibliothèque toute faite | rien à écrire | disposition fixe, faite pour un écran en paysage ; ajustement au cadre (`fitExtent`) et licence à vérifier ; une dépendance de plus |
| c) DROM déplacés dans les données | le script translate et agrandit les DROM près de la métropole | rien à changer dans la carte | fausses coordonnées : distances fausses, une fiche ou une recherche qui montrerait la Guyane dans l'Atlantique, un second fichier pour toute autre carte |

**Recommandation : a.** La disposition proposée, à valider sur captures
(S862) :
- **en portrait** (téléphone), une bande de 6 cadres sous la métropole,
  dans cet ordre : Guadeloupe, Martinique, Guyane, La Réunion, Mayotte, puis
  la petite couronne ;
- **en paysage** (ordinateur), une colonne à gauche de la métropole.

Les cadres ont un filet fin (`--frontiere`) et **aucun nom** : écrire
« Guyane » sous son cadre donnerait la réponse en Trouver. Le nom vient
avec la rétroaction, comme pour toute zone.

Place mesurée en 384 × 723 (le cadre de l'île, marges comprises,
`map/terrain.ts:45`) : la métropole fait 360 × 336 px en Lambert, et le
cadre 360 × 470 px. Il reste 134 px pour la bande, soit 6 cadres de 56 px.
En 360 × 640, il ne reste que 59 px : la bande tient de justesse (S862).

La largeur compte aussi. Six cadres de 56 px font 336 px, sans les écarts.
Le cadre perd 12 px de chaque côté (`MARGES.cotes`, `map/terrain.ts:45`) :
il reste 360 px en 384 de large, 336 px en 360 (aucun écart possible) et
296 px en 320, largeur que le projet tient (décisions « Barème et
classements », « En-tête des très petits téléphones »). Les cadres de 56 px
ne passent donc pas sous 384 px. Disposition de repli (estimé, à mesurer au
lot 2) :
- seul l'encart de la petite couronne garde 56 px, car Paris y tombe sous
  15 px s'il rétrécit (15,9 px à 56 px, 13,1 px à 46 px) ;
- les 5 cadres des DROM prennent le reste, écarts de 4 px compris :
  (L − 56 − 5 × 4) / 5, soit 56 px en 384 de large, 52 px en 360 et 44 px
  en 320. Chacun ne porte qu'une zone, qui reste touchable à 44 px (Mayotte à
  ≈ 1,1 px/km, la Guyane à ≈ 0,11 px/km) ;
- si la hauteur manque en 320 × 568, deux rangées de 3 cadres de 56 px
  (176 px de large, 116 px de haut), la métropole rétrécie d'autant : à
  chiffrer sur capture avant de choisir.

Échelle de chaque DROM dans un cadre de 56 px (estimé sur les emprises
mesurées) :

| DROM | Emprise (km) | px/km | Rapport à la métropole |
|---|---|---|---|
| Guadeloupe | 86 × 76 | 0,65 | × 2 |
| Martinique | 45 × 54 | 1,04 | × 3,3 |
| Guyane | 331 × 404 | 0,14 | × 0,44 |
| La Réunion | 64 × 58 | 0,88 | × 2,8 |
| Mayotte | 31 × 41 | 1,37 | × 4,3 |

Chaque cadre ne porte qu'une zone : sa taille ne gêne pas le toucher.

### 4.3 Paris et la petite couronne (D864)

Mesuré par `scripts/ecran.mjs` (aire de la plus grande partie, convention
de `tailleEcranPx`, `map/pastilles.ts:46-48`), au zoom 1, en Lambert, cadre
de l'île :

| Écran | km par px | Paris | Hauts-de-Seine | Seine-Saint-Denis | Val-de-Marne | Territoire de Belfort | Sous 15 px |
|---|---|---|---|---|---|---|---|
| 384 × 723 | 3,17 | 3,2 px | 4,2 | 4,8 | 4,9 | 7,8 | 7 |
| 360 × 640 | 3,40 | 3,0 | 3,9 | 4,5 | 4,6 | 7,3 | 8 |
| 1 280 × 700 | 2,38 | 4,3 | 5,6 | 6,4 | 6,6 | 10,4 | 6 |

Sur l'île, la plus petite commune fait 22 px, et le test exige 15 px
(`2026-11-06-reunion.md`, § 2).

Les pastilles ne règlent rien ici. Au seuil de 10 px, quatre disques
tomberaient à 2 ou 3 px les uns des autres (Paris et Nanterre sont à
7,6 km), et le cadre du terrain local les coupe (`pastilles: false`,
`map/terrain.ts:86`).

| Option | Paris | Pour | Contre |
|---|---|---|---|
| **a) Encart de la petite couronne** (75, 92, 93, 94 ; emprise 34 × 36 km) | 15,9 px dans un cadre de 56 px (1,55 px/km), 92 : 20,5, 93 : 23,8, 94 : 24,2 (mesuré) | la carte habituelle des manuels ; aucun zoom forcé | chacun de ces départements a deux places à l'écran (§ 4.5) |
| b) Pas d'encart : zoom au doigt, et la série Île-de-France cadrée sur sa région | ≈ 23 px dans la série de la région (estimé : 12 033 km², 2,25 px/km) | rien à coder | en « France entière », 4 questions du Chrono sur 101 demandent de pincer ; Trouver ne zoome jamais pour aider |
| c) Encart des 8 départements d'Île-de-France | plus petit qu'en a, à cadre égal | la région entière | Yvelines, Essonne et Val-d'Oise n'en ont pas besoin (11 à 15 px) |

**Recommandation : a.** Le Territoire de Belfort (7,8 px) reste à sa place :
on le touche à 12 px près, comme une commune près de la côte
(`pick`, sondes de 12 px), et le zoom le grossit. Le test de taille l'exige
au zoom 2 seulement (estimé : 15,6 px).

### 4.4 Taille à l'écran : le test

`tests/france-carte.test.ts`, sur `public/geo/france/` et les cadres
384 × 723, 360 × 640 et 320 × 568 :
- chaque département ≥ 15 px au zoom 1, dans sa place ou son encart, sauf le
  90 (≥ 15 px au zoom 2) ;
- chaque région ≥ 15 px (la Corse : 8 705 km², ≈ 29 px, estimé) ;
- chaque encart dans le cadre, sans recouvrement avec la métropole ni avec
  un autre encart ; la métropole entière au-dessus de la marge basse.

### 4.5 Toucher, notation, rétroaction

- **`invert`** : la projection composée rend la longitude et la latitude du
  point touché par le cadre qui le contient. Un toucher dans l'encart de la
  petite couronne donne un point de Paris ou de sa couronne.
- **L'aller-retour de `versLonLat`** (`map/geo.ts:141-143`) refuse un point
  dont l'image ne retombe pas sous le doigt à 0,5 px près. Avec deux places
  à l'écran pour Paris, l'image d'un point de Paris est l'une des deux ;
  un toucher sur l'autre serait refusé. La projection composée expose donc
  `retour(ll, cadre)` : l'image dans le cadre donné, que `versLonLat` prend
  quand elle existe. Le monde et l'île ne changent pas.
- **`ecran(id)`, `montrer`, `zoomerSur`** : pour la petite couronne,
  l'encart (le grand) ; pour les DROM, leur cadre. `tailleEcranPx` lit
  l'échelle du cadre de la zone, pas celle de la métropole. Sinon
  `doitCadrer` jugerait Paris trop petit et ferait voler la carte.
- **`noter`** : inchangé. Juste dans le tracé de la zone demandée (ou si
  `pick` la désigne). Sinon `distance_km`, la distance géodésique au bord.
- **La distance dite (D875)** : entre la Gironde demandée et la Guadeloupe
  touchée, elle vaut ≈ 6 700 km, vraie mais sans intérêt. Je recommande de la
  taire quand le doigt et la cible ne sont pas dans le même cadre (la
  petite couronne compte avec la métropole). Le journal la garde.
- **Disque de 12 px** (`disque()`, `map/pick.ts:146`) : près du bord d'un
  cadre, des points du cercle tombent hors de tout cadre. `versLonLat` rend
  alors `null` et le disque aussi, et `aPortee` garde toutes les zones : un
  peu plus de calcul, aucune erreur (estimé, à tester, S863).

### 4.6 « L'île » devient « un terrain local »

Le terrain de l'île est nommé en dur à 28 endroits de `src/` (mesuré), dont
13 dans `vues/explorer.ts`. Chacun se range dans l'un de deux cas :
- « un terrain local » : la barre, la fiche, l'historique, le retour au
  monde (`explorer.ts:714-826`) ;
- « l'île précisément » : les fiches des communes
  (`chargerFichesCommunes`), le domaine `communes`.

Le lot 0 fait ce tri sans rien changer de visible. Les captures du pilote
sur l'île doivent rester les mêmes (S868). `window.terramemo.ile` reste
l'aide de l'île, et `window.terramemo.local(nom)` vient pour les autres
terrains.

## 5. Sujets et exercices

Tous ont la forme de ceux des pays (décision « Quiz de La Réunion »). La
cible est toujours une zone du terrain : un département, ou une région.

### 5.1 Départements

- Trouver : « Touche : Ille-et-Vilaine » → on touche le département.
- Reconnaître : un département s'allume → son nom parmi 4.
- Chrono et Sans faute : au toucher, 101 questions, 15 s au plus chacune.
- Rétroaction : le nom, le numéro entre parenthèses (« Ille-et-Vilaine
  (35) ») et la région, en Entraînement comme en épreuve ; ce ne sont pas
  des indices, la réponse est déjà donnée.

### 5.2 Régions

- Terrain `regions`, 18 zones (D866). Trouver, Reconnaître, Chrono (18
  questions), Sans faute.
- Les cinq DROM y sont aussi des régions, dans leurs cadres : la Guadeloupe
  est la même zone pour les deux sujets, une fiche de chaque sujet.
- Pas d'encart de la petite couronne : l'Île-de-France fait ≈ 35 px
  (estimé : √12 033 km² × 0,315 px/km).

### 5.3 Préfectures (le modèle des capitales)

- Trouver : « Préfecture : Rennes » → on touche l'Ille-et-Vilaine.
- Reconnaître : l'Ille-et-Vilaine s'allume → « Rennes » parmi 4.
- La cible reste le département ; le barème et `noter` ne changent pas.
- Rétroaction en Entraînement : un anneau au point de la préfecture
  (`anneauEn`, `map/carte.ts:159`, le modèle de D53 c).
- **Exclusions (D868)** : Paris (75) et Belfort (Territoire de Belfort, 90)
  donnent la réponse dans leur nom. Je recommande de ne jamais les poser ni
  les prendre en leurre dans un choix parmi 4. Ils restent en Trouver et
  dans les épreuves, comme les 9 pays de D37 c. Cela fait 99 fiches
  « nommer » sur 101.
- Préfectures de région (chef-lieu de la région) : dans la fiche de la
  région seulement, pas en sujet (non retenu, § 11).

### 5.4 Numéros

- Trouver : « Touche le 35 » → l'Ille-et-Vilaine. Les numéros s'écrivent
  comme sur les plaques : 01, 2A, 974.
- Reconnaître : le département s'allume → « 35 » parmi 4 numéros.
- Leurres (D869) : ceux de `choix()` (`vues/qcm.ts`), c'est-à-dire les
  voisins du département, puis les plus proches. Ils sont rarement
  numériquement proches : il faut alors savoir le numéro, pas l'ordre
  alphabétique.
- Corse : 2A et 2B, jamais 20.

### 5.5 Leurres et cadres

- `choix()` (`vues/qcm.ts`) prend les voisins jouables, puis les zones les
  plus proches par leur point. Un DROM n'a pas de voisin, et ses plus
  proches sont d'autres DROM : la Guadeloupe aura la Martinique, puis la
  Guyane. C'est juste et utile.
- En Reconnaître, la zone allumée d'un DROM est dans son cadre. La
  décision « Zone allumée montrée par un zoom lent » (15/11) centre la zone,
  puis zoome jusqu'à ce qu'elle occupe un tiers de la carte. Pour un DROM
  ou la petite couronne, elle vise le cadre (`ecran(id)`, § 4.5), sinon le
  zoom partirait vers le point de Paris dans sa vraie place, à 3 px. Ce
  qu'elle fait aujourd'hui sur l'île est à vérifier au lot 3.

## 6. Jouer et mémoire

### 6.1 La tuile France (D861)

| Option | Écran des sujets (avec le J4 à dix tuiles, D601 a) | Pour | Contre |
|---|---|---|---|
| **a) Une tuile « France »** avant Communes, qui ouvre Départements, Régions, Préfectures, Numéros | 11 tuiles | un choix de plus seulement ; la France groupée ; la règle du niveau à un seul choix ne change pas | un niveau de plus dans l'arbre (`vues/arbre.ts`), soit 5 touches pour une partie au lieu de 4 |
| b) Quatre tuiles à plat, avant Communes | 14 tuiles | la lettre de « Écran Jouer » (« la sorte de lieu (… Départements…) ») | le double des 7 choix par écran visés |
| c) a, avec Communes (La Réunion) dans la tuile France | 10 tuiles | toute la France au même endroit | déplace un sujet joué, contre D53 b (« Communes en dernier ») |

**Recommandation : a.** Si l'utilisateur prend D601 c au J4 (un niveau de
familles), la tuile France en devient une famille, sans rien changer
d'autre. Vignettes : la France et ses départements (Départements, Numéros),
ses régions (Régions), des points sur la France (Préfectures), rangées dans
le code comme celle de l'île (`geodata/vignette-france.mjs`, ≈ 5 Ko
estimés).

### 6.2 Séries (D862)

- Départements, Préfectures, Numéros :
  - « France entière » (101) ;
  - les 13 régions de la métropole (la Corse : 2 départements) ;
  - « Outre-mer » (5).

  Cela fait 15 séries. Elles viennent dans l'ordre alphabétique des régions,
  « France entière » en tête et « Outre-mer » en dernier, comme « Tous les
  pays » devant les continents. Une série de région cadre sa région au
  départ.
- Régions : une seule série de 18, sautée (règle du niveau à un seul choix).
- Les ids et le nombre de chaque série sont connus avant le chargement : une
  table `SERIES_FRANCE` (région → départements), confrontée aux données par
  le test, comme `IDS_MERS`.
- **Classé : « France entière » seule** pour chaque sujet. Les 15 séries
  restent en Entraînement (Apprendre, Trouver, Reconnaître). Avec les
  régions en Classé, il y aurait 4 sujets × 15 séries × 2 modes = 120
  épreuves de plus pour le 🏆 (D52 b), contre 8.

Quinze séries dépassent les 7 choix de « Écran Jouer ». Elles tiennent en
grille de petites tuiles à trois colonnes, cinq rangées (S867). L'autre
voie, trois séries seulement (France entière, Métropole, Outre-mer),
perdrait l'apprentissage par région, que le plan veut (« nouveautés par
grappe régionale »).

### 6.3 Domaines, fiches, grappes

| Domaine (figé à vie) | Terrain | Entité | Fiches | Prérequis (préférence, D39 b) |
|---|---|---|---|---|
| `departements` | departements | code INSEE | 101 × 2 = 202 | aucun |
| `regions` | regions | `R…` | 18 × 2 = 36 | aucun |
| `prefectures` | departements | code INSEE | 101 + 99 = 200 | departements |
| `numeros` | departements | code INSEE | 101 × 2 = 202 | departements |

Cela fait **640 fiches** de plus, sur un budget de 15 introductions
« Reconnaître » par jour, partagé entre tous les sujets.

- **Grappes** : `grappes()` (`srs/grappes.ts`), avec le groupe = la région
  et le « continent » = `France` ou `Outre-mer`. Les groupes de moins de 5
  sont fusionnés avec le plus proche du même continent, ceux de plus de 9
  sont découpés en paquets de 8 au plus (`:31-34`). Les grappes attendues
  (estimé) :
  - la Bretagne (4) rejoint les Pays de la Loire ou la Normandie, la Corse
    (2) Provence-Alpes-Côte d'Azur ;
  - l'Occitanie (13), l'Auvergne-Rhône-Alpes et la Nouvelle-Aquitaine (12),
    le Grand Est (10) sont coupés en deux ;
  - l'Outre-mer (5) reste seul.

  Le test les fige. Comme les communes, elles s'ouvrent par Apprendre
  (D46).
- **Lot 0 sans effet visible** : les quatre domaines entrent dans
  `DOMAINES` (lus) avant qu'aucune version ne les écrive, pour la même
  raison qu'au J4 (`2026-11-25-j4-conception.md`, lot 0 : un appareil resté
  en retard ne lirait plus les lots). Si le lot 0 du J4 n'est pas encore
  fait, un seul lot sert les deux (D876).
- **Piège pour le J4** : son lot 0 propose `regions` comme exemple de nom
  de domaine refusé dans les tests (`2026-11-25-j4-conception.md:669`). Avec
  le J6, ce nom devient un vrai domaine : il faut un autre exemple
  (`inconnu`).

### 6.4 Carte de la mémoire et recherche

- **Carte de la mémoire** : sur le terrain `departements`, le choix du sujet
  (Départements, Préfectures, Numéros) dans la légende, comme le monde ; sur
  `regions`, Régions seul. `TERRAIN_DOMAINE` y suffit
  (`vues/carte-memoire.ts:45-60`).
- **Recherche** : chargée à la première frappe, comme les communes
  (`noms.fr.json` et `prefectures.json`, ≈ 3,5 Ko) :
  - les départements par leur nom et leur numéro (« 35 », « 2a »,
    « 974 ») ;
  - les régions, avec leurs alias (« PACA ») ;
  - les préfectures, qui montrent leur département et un anneau, comme une
    capitale.

  Le détail de chaque ligne distingue les homonymes du § 3.5 (« Vienne,
  département » et « Vienne, capitale de l'Autriche »).

## 7. Classements, général, quiz

- **Épreuves** : `chrono:departements:france`, `chrono:regions:france`,
  `chrono:prefectures:france`, `chrono:numeros:france`, et les mêmes en
  `sansfaute:`.
  - `CLE_SUJET` gagne les quatre clés (le nom du sujet, comme
    `capitales`) ;
  - `TAILLES_SERIES` : 101, 18, 101, 101 ;
  - `EPREUVES_SUJETS` reçoit les quatre paires à l'ouverture de chaque
    sujet ;
  - `firestore.rules` : `tailles(cle)` (`:26-61`), la liste des clés de
    `epreuveConnue` (`:75`) et la borne de `chronoValide` (`:109`).
- **Le général (D870)** :

| Cas | Questions du J6 | Borne | Part du J6 |
|---|---|---|---|
| Aujourd'hui | — | 1 244 | — |
| a) les quatre Chrono au général, sans le J4 | 101 + 18 + 101 + 101 = 321 | **1 565** | 20,5 % |
| a), avec le J4 (D603 a, ≈ 3 067) | 321 | ≈ 3 388 | 9,5 % |
| b) Départements et Régions seuls | 119 | 1 363 | 8,7 % |

**Recommandation : a**, à la lettre de « Général à tous les sujets ». Les
règles partent avant le site (décision « Ouverture des épreuves d'un
sujet ») : sinon un général complet serait refusé sans bruit.
- **🏆** : 8 épreuves de plus. D52 b, déjà rendu nécessaire par le J4, y
  suffit.
- **Quiz général (D871)** : le J6 reste hors du quiz, comme les communes
  (D51). La vue du quiz ne joue que sur le monde (`vues/quiz.ts:216`), et
  une question de France en plein milieu demanderait de basculer de carte
  pendant une partie chronométrée. Un « quiz de France » à part est une
  piste (§ 11).

## 8. Fiches de lieu (#34)

La fiche d'un lieu (décision « Fiche d'un lieu ») vaut pour les zones qu'on
touche. Le J6 ajoute deux sortes, `departement` et `region`
(`fiches/sorte.ts`). Leurs données sont lues au premier toucher, comme
celles des communes.

| Ligne | Département | Région | Source |
|---|---|---|---|
| Nom, numéro | « Ille-et-Vilaine · 35 » | « Bretagne » | IGN |
| Préfecture, chef-lieu | Rennes, avec un anneau | Rennes | IGN, `chef_lieu_*` |
| Région, départements | Bretagne | les 4 départements, chacun touchable | IGN |
| Habitants | somme des populations des communes (recensement de l'INSEE, table `commune` de l'IGN), avec l'année | idem | IGN (S865) |
| Superficie | somme des superficies cadastrales des communes, comme l'île (`reunion/sources.json`, `traitement.superficies`) | idem | IGN |
| Voisins | touchables, comme les pays (§ 4.5 de la fiche) | idem | topologie |
| Statut | une ligne écrite à la main et relue, pour les cas à part : Ville de Paris, Collectivité de Corse, Alsace, Martinique et Guyane (collectivités uniques), Mayotte (revendiquée par les Comores, `revendications.json:23`), Rhône et Métropole de Lyon | idem | `france-main.json` |
| Photos | aucune au J6 (D872) | aucune | — |

- **Habitants** : la table `commune` de l'archive FRA est la même que celle
  de l'île (population, date et organisme du recensement, mesuré dans le
  GeoPackage de l'île). Le script fait la somme par département. Elle doit
  égaler les populations légales de l'INSEE (S865).
- **« Apprendre ce lieu »** et « Retenir ce lieu » valent tels quels : le
  département entre dans la prochaine grappe de son domaine.
- **Carte de situation** (D61, lot F8) : la France et la zone allumée, tirée
  du terrain chargé. Le dessin de situation actuel part du monde
  (`vues/situation.ts`) : il faut la variante d'un terrain local, à chiffrer
  au lot 8.
- **Pas de photos au J6** : le lot P2 (photos dans la fiche) n'est pas codé,
  et la relecture des 332 lieux du lot P1 est à peine commencée
  (`geodata/photos/choix.json`, 2 entrées). 119 lieux de plus
  l'alourdiraient.

## 9. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et `npm run
build` au vert (par le verrou de la machine), puis par un commit
« … (#8) ». Si les règles changent : `npm run test:regles`, puis leur
déploiement d'abord. Ensuite le déploiement Hosting et le pilote, selon le
skill `run-terramemo`. L'UI suit le skill `nouveau-projet`, relu avant
chaque lot qui en ajoute. Sur l'A37 : `sauver_journal` avant chaque APK.

| Lot | Taille | Dépend de | Attend | Critère de fin |
|---|---|---|---|---|
| 0. Socle | S | — | D867, D876 | rien de visible ; un lot du J6 lu par cette version ; captures de l'île inchangées ; APK rebâti |
| 1. Données | M | — | D865, D866, D867, D873, D874 | données testées en CI ; listes et alias montrés à l'utilisateur |
| 2. Carte et encarts | L | 0, 1 | D863, D864 | les 101 départements et 18 régions touchés au pilote, encarts compris ; captures validées à l'œil |
| 3. Départements | M | 2 | D860, D861, D862 | sujet complet au doigt sur le site, en Entraînement |
| 4. Régions | S | 3 | D866 | idem |
| 5. Préfectures | M | 3 | D868 | idem |
| 6. Numéros | S | 3 | D869 | idem |
| 7. Épreuves | S | 3 à 6 | D870, D875 | les 8 épreuves classées et le général, règles déployées d'abord |
| 8. Fiches | M | 1, 2 | D872 | fiche d'un département et d'une région depuis l'accueil, la recherche et le bilan |
| 9. Fin du J6 | M | tous | — | critère de #8 sur le site et l'APK de l'A37 |

Les lots 4, 5 et 6 ne dépendent que du lot 3 : un sujet bloqué n'arrête pas
les autres. Un sujet peut sortir en Entraînement avant ses épreuves.

### Lot 0. Socle

- **Contenu** : les quatre domaines dans `Domaine` et `DOMAINES`
  (`DOMAINES_JOUABLES` ne change pas) ; `TERRAIN_DOMAINE` ; `NomTerrain`
  gagne `departements` et `regions` ; `CLE_SUJET` gagne les quatre clés (le
  `Record<Domaine, …>` l'impose), et `TAILLES_SERIES` les reçoit vides ;
  le tri « terrain local » ou « l'île » du § 4.6.
- **Fichiers** : `srs/fiches.ts`, `map/types.ts`, `epreuve/chrono.ts`,
  `terrains.ts`, `vues/explorer.ts`, `vues/seance.ts`, `vues/cibles.ts`,
  `vues/apprendre-lieu.ts`, `fiches/sorte.ts`, `main.ts`.
- **Tests** :
  - `srs-jour`, `srs-pur` : les quatre domaines lus ; l'exemple refusé reste
    `villes` tant que le J4 n'est pas livré, puis `inconnu`, jamais
    `regions` ;
  - `sync-lecture` : une version d'avant ce lot met un lot du J6 dans
    `a_relire`, puis la nouvelle le relit ;
  - `seance-vue` : des fiches `departements:` au journal ne donnent rien tant
    que le domaine n'est pas jouable.
- **Fin** : captures de l'île du pilote identiques (S868), site déployé,
  APK rebâti et installé sur l'A37 avant tout lot qui écrit ces domaines.

### Lot 1. Données

- **Contenu** : le téléchargement de `GPKG_WGS84G_FRA` (§ 3.1, le seul) ;
  `geodata/france.mjs` ; `geodata/france.lock.json` ;
  `geodata/france-main.json` ; les six fichiers de `public/geo/france/` ; le
  script `geodata:france` dans `package.json` ; `SERIES_FRANCE`.
- **Fichiers** : ceux-là, `geodata/outils.mjs` (si un outil y manque),
  `tests/donnees-france.test.ts`.
- **Tests** : § 3.6.
- **Fin** : la liste des 101 noms et préfectures, des 18 régions et des
  alias montrée à l'utilisateur, puis validée.

### Lot 2. Carte et encarts

- **Contenu** :
  - `map/projection-france.ts` (pur) : sous-projections, cadres,
    dispositions portrait et paysage, `invert`, `retour(ll, cadre)`, le
    filet des cadres ;
  - `DefTerrain.projection` et `encarts`, `DEPARTEMENTS` et `REGIONS` ;
  - `chargerTerrain` sur deux objets d'une même topologie ;
  - `versLonLat` qui prend `retour` ;
  - `tailleEcranPx` par cadre ;
  - le dessin des filets (classe `.encart`) ;
  - la mention de l'IGN et de la date (`textes.credits.carte`), et la ligne
    des crédits de ⚙ ;
  - `window.terramemo.local(nom)` pour le pilote.
- **Fichiers** : `map/projection-france.ts` (nouveau), `map/terrain.ts`,
  `map/donnees-terrain.ts`, `map/geo.ts`, `map/pastilles.ts`,
  `map/carte.ts`, `terrains.ts`, `main.ts`, `carte.css`,
  `vues/textes.fr.json`, `tests/france-carte.test.ts` (nouveau).
- **Tests** :
  - `france-carte` : § 4.4 ; `pick` au point de chaque département (dans sa
    place et, pour la petite couronne, dans l'encart) = lui-même ; en mer
    entre deux cadres, `null` ; un toucher à 1 px de la côte de la
    Martinique, dans son cadre, donne la Martinique ; `garderVue` d'une
    taille à l'autre (la composée reste « échelle et translation ») ;
    l'aller-retour écran → carte → écran dans chaque cadre ;
  - `ile` : inchangé, vert ;
  - `carte` : le monde inchangé (`versLonLat` sans `retour`).
- **Vérification** : captures en 384 × 723, 360 × 640, 320 × 568 et 1 280 × 700,
  montrées à l'utilisateur (disposition, filets, mention) ; puis l'A37 :
  aucun à-coup de 25 ms ou plus pendant un déplacement et un pincement de
  10 s (S861).

### Lot 3. Départements

- **Contenu** :
  - le niveau France de Jouer (D861) et la tuile, avec sa vignette ;
  - le sujet `departements` dans `SUJETS` et `DOMAINES_JOUABLES` ;
  - les 15 séries, et le cadrage d'une série sur sa région ;
  - le rendu du sujet (`vues/sujets.ts`, `textes.sujets`) ;
  - les grappes par région, la carte de la mémoire ;
  - la recherche, par nom et par numéro.
- **Fichiers** : `vues/arbre.ts`, `vues/jouer.ts`, `vues/cibles.ts`,
  `vues/sujets.ts`, `vues/vignettes.ts`, `geodata/vignette-france.mjs`
  (nouveau), `srs/grappes.ts`, `srs/fiches.ts`, `vues/carte-memoire.ts`,
  `vues/recherche.ts`, `vues/textes.fr.json`,
  `.claude/skills/run-terramemo/driver.py`.
- **Tests** : `carte-vues` (séries, leur ordre, leurs tailles égales aux
  données) ; `grappes` (les grappes figées) ; `qcm` (pour chaque
  département : 4 choix distincts, la cible dedans ; un DROM a trois autres
  DROM) ; `recherche` (« 35 » trouve l'Ille-et-Vilaine, « vienne » donne
  deux lignes) ; `arbre` (le niveau France, « ‹ » et le fil d'Ariane).
- **Vérification** : pilote `ui_france` (Trouver et Reconnaître sur la
  France entière et l'Outre-mer) ; sur l'A37, Paris touché dans l'encart au
  doigt.

### Lot 4. Régions

- **Contenu** : le terrain `regions`, le sujet, sa série unique, les
  textes et la vignette.
- **Fichiers** : `vues/arbre.ts`, `vues/cibles.ts`, `vues/sujets.ts`,
  `srs/fiches.ts`, `vues/textes.fr.json`, `driver.py`.
- **Tests** : 18 zones ; la Guadeloupe région et département, deux fiches
  distinctes.

### Lot 5. Préfectures

- **Contenu** : le chargement de `prefectures.json` (`map/prefectures.ts`,
  le modèle de `map/capitales.ts`) ; le rendu « Préfecture : Rennes » ;
  les exclusions de D868 (`srs/fiches.ts`, à côté de celles de D37 c) ;
  l'anneau à la rétroaction ; la recherche ; `PREREQUIS`.
- **Fichiers** : `map/prefectures.ts` (nouveau), `vues/sujets.ts`,
  `vues/qcm.ts`, `srs/fiches.ts`, `srs/planif.ts`, `vues/recherche.ts`,
  `vues/textes.fr.json`, `driver.py`.
- **Tests** : 75 et 90 jamais en QCM ni en leurre, présents en Trouver ;
  l'anneau de Basse-Terre au bon point ; « Nanterre » dans la recherche
  montre les Hauts-de-Seine.

### Lot 6. Numéros

- **Contenu** : le rendu « Touche le 35 », les choix de numéros, le format
  des numéros (01, 2A, 974).
- **Fichiers** : `vues/sujets.ts`, `srs/fiches.ts`, `srs/planif.ts`,
  `vues/textes.fr.json`, `driver.py`.
- **Tests** : jamais « 20 » ; les quatre choix toujours distincts ; le
  numéro lu par un lecteur d'écran en entier (« deux A »), à vérifier.

### Lot 7. Épreuves

- **Contenu** : § 7.
- **Fichiers** : `epreuve/chrono.ts`, `firestore.rules`,
  `tests/chrono.test.ts`, `tests/regles.test.ts`.
- **Tests** : tailles, catalogue et règles d'accord ; borne du général ;
  `regles.test` (émulateur) : `chrono:departements:france` à 101
  questions accepté, 100 refusé ; général à 1 565 accepté, 1 566 refusé.
- **Fin** : règles déployées, puis le site ; un Chrono de la France
  entière joué jusqu'au bilan sur les émulateurs.

### Lot 8. Fiches

- **Contenu** : `fiches.json` et `fiches.fr.json` des départements et des
  régions, écrits par `geodata/france.mjs` et `geodata/fiches.mjs` ; les
  sortes `departement` et `region` ; la fiche (§ 8) ; la carte de situation
  d'un terrain local.
- **Fichiers** : `geodata/france.mjs`, `geodata/fiches.mjs`,
  `fiches/sorte.ts`, `fiches/chargeur.ts`, `fiches/donnees.ts`,
  `vues/fiche.ts`, `vues/situation.ts`, `vues/textes-fiche.fr.json`,
  `tests/donnees-fiches.test.ts`.
- **Tests** : chaque département a ses lignes ; la somme des habitants de la
  France égale celle des 101 ; les textes de statut relus, figés ; le morceau
  principal reste sous 500 Ko (`tests/morceau-principal.test.ts`).

### Lot 9. Fin du J6

Le pilote complet, l'APK sur l'A37 en mode avion (le dossier embarqué),
`docs/plan.md`, `docs/etudes/README.md`, le README, les crédits. Critère de
#8 : les 101 départements jouables, encarts compris, sur le site et l'APK.

## 10. Décisions à trancher

Chaque réponse se note au registre. Une réponse qui contredit une décision
actée la **remplace** (`noter_decision`, `remplace`) ; c'est le cas de
D865 a ou c pour « Pays et frontières » (Mayotte, `NE_B22`, y est une zone
contestée, hachurée et jamais posée). **D865 n'a donc pas de défaut** : le
lot 1 attend la réponse, et aucune épreuve classée du J6 ne sort avant elle.
Pour les autres, en attendant, le code prend le défaut, une constante nommée
et commentée « défaut en attente de l'utilisateur, #8 ». Ces choix cessent
d'être réversibles :
- dès qu'un classement en dépend : D865 (101 ou 100 questions, d'où l'absence
  de défaut) et D870 (le général) ;
- dès qu'une fiche est écrite au journal : D860 (les domaines) et D867 (les
  ids).

| N° | Question | Options | Recommandation | Défaut si rien n'est dit |
|---|---|---|---|---|
| D860 | Les sujets du J6 | a) quatre sujets : Départements, Régions, Préfectures, Numéros ; b) trois, sans Numéros (le numéro dit à côté du nom) ; c) deux, Départements et Régions, la préfecture dans la rétroaction et la fiche | **a** : le ticket veut le nom, le numéro et la préfecture ; Numéros ne coûte qu'un rendu | a |
| D861 | Jouer | a) une tuile « France » avant Communes, qui ouvre les quatre sujets ; b) quatre tuiles à plat ; c) a, avec Communes dans la tuile France | **a** (11 tuiles avec le J4, au lieu de 14) | a |
| D862 | Séries | a) France entière, les 13 régions et l'Outre-mer en Entraînement ; France entière seule en Classé ; b) France entière, Métropole, Outre-mer ; c) a, avec les régions aussi en Classé (120 épreuves de plus) | **a** | a |
| D863 | Les encarts des DROM | a) projection composée maison (vraies coordonnées), bande sous la métropole en portrait, colonne à gauche en paysage, cadres sans nom ; b) `d3-composite-projections` ; c) DROM déplacés dans les données | **a** | a, captures montrées avant le lot 3 |
| D864 | Paris et la petite couronne | a) un encart des 75, 92, 93, 94 (Paris à 16 px), touchables aux deux places ; b) pas d'encart, zoom au doigt ; c) un encart des 8 départements d'Île-de-France | **a** | a |
| D865 | Mayotte | a) posée comme les autres départements, et sa fiche dit la revendication des Comores (écart à « Pays et frontières », qui reste la règle du monde) ; b) jamais posée, 100 départements (contre le critère du ticket) ; c) posée, mais hachurée dans son cadre | **a** : le J6 porte sur le découpage administratif de la France, et Mayotte y est un département | **aucun** : a et c contredisent « Pays et frontières », que seul l'utilisateur remplace ; le lot 1 attend |
| D866 | Régions | a) les 18 (13 et les 5 DROM, aussi départements) ; b) les 13 de la métropole | **a** (la liste officielle, et celle de la synthèse du 04/11) | a |
| D867 | Identifiants (figés à vie) | a) départements par leur code INSEE (`01`, `2A`, `971`), régions par `R` et leur code (`R84`) ; b) codes ISO 3166-2 ; c) codes INSEE nus pour les deux (les 18 codes de région en commun) | **a** | a |
| D868 | Préfectures qui donnent la réponse | a) Paris (75) et Belfort (90) jamais en choix parmi 4, présents en Trouver et dans les épreuves (la règle D37 c) ; b) Paris seul ; c) aucune exclusion | **a** | a |
| D869 | Leurres des numéros | a) les voisins, puis les plus proches (`choix()`) ; b) les numéros voisins (±1, ±2) ; c) moitié l'un, moitié l'autre | **a** | a |
| D870 | Le général | a) les quatre Chrono « France entière » (+321, borne 1 565 sans le J4) ; b) Départements et Régions seuls (+119) ; c) aucun | **a**, à la lettre de « Général à tous les sujets » | a |
| D871 | Quiz général | a) le J6 hors du quiz, comme les communes (D51) ; b) un quiz de France à part, plus tard ; c) dans le quiz, avec bascule de carte | **a** | a |
| D872 | Fiches | a) départements et régions, sans photos (numéro, préfecture, région, habitants, superficie, voisins, statut relu) ; b) a, avec photos par le pipeline P1 (119 lieux à relire de plus) ; c) aucune fiche au J6 | **a** | a |
| D873 | Source | a) l'archive `GPKG_WGS84G_FRA` (125,7 Mo, une seule projection) ; b) FXX et quatre DROM (67 Mo, cinq projections à contrôler) ; c) le WFS (sans empreinte figée) | **a** | a |
| D874 | Simplification et budget | a) 500 m en métropole, 300 m dans les DROM (54 Ko gzip, 12 835 points, comme le monde léger) ; b) 300 m (75 Ko, 20 535 points) ; c) 800 m (40 Ko) | **a**, b si le dessin paraît anguleux au zoom 8 sur l'A37 | a |
| D875 | Distance dite entre cadres | a) tue quand le doigt et la cible ne sont pas dans le même cadre (le journal la garde) ; b) toujours dite | **a** | a |
| D876 | Le socle | a) un seul lot 0 pour le J4 et le J6, si les deux sont validés (un APK rebâti au lieu de deux) ; b) un lot 0 propre au J6 | **a** | a si le lot 0 du J4 n'est pas fait, sinon b |

**Ce qui ne se décide pas ici.** L'ordre du J6 par rapport au J4, au J5 et
au Play Store (#5) est une question posée à part. Le test de placement
(#35) servirait aussi au J6 : un « Je connais déjà » par région éviterait
640 introductions à qui connaît déjà ses départements.

## 11. Non retenu

- **Carte** :
  - Natural Earth `admin_1` pour les départements : il a des coquilles et
    aucune région (`2026-11-04-donnees.md:68`) ;
  - un rendu Canvas ou WebGL de la France : le SVG « g » de l'île suffit à
    12 835 points, à reprendre si l'A37 montre des à-coups (S861) ;
  - des pastilles pour la petite couronne ;
  - les noms écrits sur la carte ;
  - Saint-Pierre-et-Miquelon, Saint-Barthélemy, Saint-Martin, la
    Polynésie, la Nouvelle-Calédonie, Wallis-et-Futuna et les TAAF en
    encarts : ce ne sont pas des départements ; à reprendre pour un sujet
    « Outre-mer » entier ;
  - un bouton « Départements » dans la fiche de la France (monde) qui
    ouvrirait la carte de France : à reprendre si la recherche ne suffit
    pas à trouver la France.
- **Sujets** :
  - les préfectures de région en sujet (13 de plus, dont 9 aussi
    préfectures de département) ;
  - les sous-préfectures, les anciennes régions d'avant 2016, les
    arrondissements, les cantons, les communes de la métropole ;
  - les codes postaux ;
  - la Métropole de Lyon en zone à part (le Code officiel géographique la
    compte dans le Rhône).
- **Jouer** : une carte à toucher pour choisir sa région (au lieu de
  15 tuiles), à reprendre si les 15 tuiles ne tiennent pas (S867).
- **Classements** : les régions en Classé (120 épreuves) ; un Chrono de la
  Métropole à part de la France entière.
- **Quiz** : un quiz de France à quatre difficultés, sur le modèle du quiz
  général, à reprendre une fois le J6 joué.
- **Données** : le WFS comme source du script ; les populations légales de
  l'INSEE en second fichier, à reprendre si la somme de l'IGN s'en écarte
  (S865).

## 12. Suppositions à vérifier

La numérotation suit la plage de cette étude (S860 à S899).

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S860 | Le WFS `LATEST` lu pour mesurer est l'édition 2026-01-01 de l'archive : mêmes tracés, mêmes poids | comparer les tracés et les poids après le téléchargement | lot 1 |
| S861 | La carte SVG « g » de 12 835 points ne fait aucun à-coup de 25 ms sur l'A37, en déplacement et en pincement | `performance.measure` et le pilote de mesure, sur l'A37 | lot 2 |
| S862 | La bande de 6 cadres tient en 360 × 640 (59 px libres en hauteur, 336 px en largeur) et en 320 × 568 (296 px de large), avec le repli du § 4.2 (petite couronne à 56 px, DROM à 52 puis 44 px, ou deux rangées de 3), sans rétrécir la métropole de plus de 10 % ; la disposition plaît à l'œil | captures en 320 × 568, 360 × 640, 384 × 723 et 1 280 × 700, montrées à l'utilisateur | lot 2 |
| S863 | Le disque de 12 px de `pick` près du bord d'un cadre ne donne aucune fausse zone (il retombe sur toutes les zones) | tests `france-carte` aux bords de chaque cadre | lot 2 |
| S864 | Le tracé du 974 dans l'archive FRA recouvre l'union des 24 communes de `public/geo/reunion/` (même produit, même édition) | test de données | lot 1 |
| S865 | La somme des populations des communes de l'IGN par département égale les populations légales de l'INSEE à l'unité près | comparer à la publication de l'INSEE pour 5 départements | lot 8 |
| S866 | L'archive `GPKG_WGS84G_FRA` a les tables et les champs du GeoPackage de l'île (`departement`, `region`, `chef_lieu_de_departement`, `commune`…) | ouvrir l'archive au lot 1 | lot 1 |
| S867 | Quinze séries tiennent sur l'écran des séries à 360 px, en grille de trois colonnes, sans défilement gênant | capture du pilote, puis l'A37 | lot 3 |
| S868 | Le tri « terrain local » ou « l'île » du lot 0 ne change rien sur l'île | captures de l'île du pilote comparées avant et après | lot 0 |
| S869 | Les noms de fleuves du J5 et des départements se distinguent par leur détail dans la recherche, et aucun sujet n'accepte la réponse d'un autre | liste du J5 confrontée à `collisions.py` | étude du J5, puis lot 3 |
| S870 | La mention « IGN, ADMIN EXPRESS, édition du … · Licence Ouverte 2.0 », déjà affichée sur l'île, suffit pour les départements et les régions | relire la Licence Ouverte 2.0 (mention de la source et de la date de mise à jour) | lot 2 |
| S871 | Les encarts de 56 px donnent Paris ≥ 15 px et le reste de la petite couronne ≥ 20 px sur tout téléphone de 320 px de large ou plus (l'encart de la petite couronne garde 56 px, § 4.2) | test `france-carte` en 320 × 568, 360 × 640 et 384 × 723 | lot 2 |
| S872 | Un lecteur d'écran lit « 2A » en entier et sans le confondre avec un mot | TalkBack sur l'A37 | lot 6 |

## 13. Sources

- Code et données du dépôt à `a3d08a0`, cités par chemin et ligne.
- Registre « terramemo », décisions actées citées par leur nom (§ 2).
- Études : `2026-11-06-reunion.md` (le terrain local, § 1 à § 9),
  `2026-11-10-j2-conception.md` (sujets, grappes, quiz),
  `2026-11-16-fiche-lieu-conception.md` (fiches), `2026-11-25-j4-conception.md`
  (lot 0, D601, D603), `2026-11-25-saisie-libre-conception.md` (§ 3.4,
  D1304), `2026-11-04-donnees.md:68`, `2026-11-04-synthese-agents.md:23`,
  `2026-11-04-pedagogie.md:53`.
- IGN, ADMIN EXPRESS COG CARTO 4.0, édition du 01/01/2026, Licence Ouverte
  2.0 : liste des archives sur `data.geopf.fr` et extrait du WFS
  (`ADMINEXPRESS-COG-CARTO.LATEST`), lus le 25/11/2026 ; GeoPackage du
  territoire REU du dépôt.
- d3-geo 3.1.2 (`geoAlbersUsa`, `geoConicConformal`), le patron de la
  projection composée.
- Scripts et sorties des mesures : `~/Sauvegardes/terramemo/j6-conception/`.
