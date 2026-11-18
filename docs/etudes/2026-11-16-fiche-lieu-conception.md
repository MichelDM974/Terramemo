# Fiche d'un lieu : conception (16/11/2026, #34)

*Faite par un workflow : cinq relevés, une rédaction, deux relectures
adverses, une correction. Ce texte est la rédaction corrigée après les deux
relectures : ce qu'elles ont changé, et ce qui a été écarté, est au § 13.*

**Étude finale** du 16/11, à coder sans re-concevoir :
- cinq relevés : l'accueil et les parcours vers la fiche (R1) ; la mémoire
  et « Apprendre ce lieu » (R2) ; les données des pays, territoires et zones
  contestées (R3) ; celles des mers et des communes (R4) ; les photos (R5) ;
- une rédaction, qui a revérifié dans le code et les données (`main`, commit
  `3ba6e31`) chaque point douteux ou contradictoire des relevés. Les écarts
  trouvés sont au § 12.

Relevés, extraits téléchargés, prototypes et scripts :
`~/Sauvegardes/terramemo/fiche-lieu-conception/` (hors du dépôt).
**Mesuré** : commande lancée ou fichier lu, avec fichier:ligne ou la
commande. **Estimé** : jugement. Tailles : S (moins d'une demi-journée), M
(une demi-journée à deux jours), L (plus). Les chemins de code sont relatifs
à `src/` ; `seance.ts` s'écrit `srs/seance.ts` ou `vues/seance.ts`.

Le besoin et les choix de l'utilisateur sont dans
`docs/etudes/2026-11-16-fiche-lieu.md` (« le besoin » dans ce texte). Il fait
foi, avec la décision actée « Fiche d'un lieu ».

La demande (16/11) : « quand on clique sur la carte sur un pays ou une mer »,
une petite fenêtre s'ouvre avec le nom, la capitale, le nombre d'habitants,
les langues parlées et quelques photos de monuments ou d'endroits connus.
L'utilisateur a ajouté le drapeau, et laissé Claude ajouter ce qui manque
d'important.

**Fin du ticket #34** : chaque lieu des trois sujets a sa fiche, sources et
licences affichées, sur le site et dans l'APK.

Décisions actées qui priment en cas d'écart :
- « Fiche d'un lieu » (16/11) ;
- carte et accueil : « En-tête », « Croix vers la carte », « Panneau de
  Jouer plein écran », « Rendu par défaut », « Critère de saccade »,
  « Critère du toucher » ;
- neutralité : « Pays et frontières », « Zones contestées et enclaves »,
  « Drapeaux contestés et sosies », « Capitales et drapeaux » ;
- mémoire : « Apprendre et Révision du jour », « Répétition espacée des
  nouveaux sujets » ;
- et « Langue », « Articles des noms de pays », « Hébergement »,
  « Diffusion », « Public et modèle », « Licences tierces », « Contenu ».

Les choix laissés à l'utilisateur sont au § 9 : D56 à D61, **tranchés le
16/11, tous selon la recommandation** (décision « Fiche d'un lieu : langues,
superficies, zones, Apprendre, photos, voisins »). Le code suit la réponse,
pas le défaut : les défauts du § 9 ne servent plus.

Résumé des choix :
- **332 lieux** ont une fiche : 197 pays, 48 territoires, 12 zones
  contestées, l'Antarctique, 50 océans et mers, 24 communes. Les 77 zones
  hachurées n'en ont pas : on ne peut pas les toucher ;
- la barre du bas devient un bouton. Elle gagne une ligne « capitale ·
  habitants ». La toucher ou la glisser vers le haut ouvre la fiche ;
- la fiche a **deux états** : la barre, ou une feuille opaque sur presque
  toute la carte. Elle s'ouvre par un glissement (`transform`), sans flou et
  sans déplacer la carte ;
- « × » ferme la fiche et rend la carte, toujours. Le retour d'Android, celui
  du navigateur, « ‹ » et Échap reviennent d'un pas : la fiche d'avant, puis
  la barre, ou le bilan d'où l'on vient. Chaque fiche est une entrée
  d'historique **dès le lot F1** : le retour du navigateur ne fait plus
  sortir du site ;
- les voisins se touchent : la fiche est remplacée, la carte vole dessous.
  Sur le téléphone, ce vol ne se voit pas : D61 ;
- ni fiche, ni faits dans la barre, tant qu'une partie de Toucher attend
  d'être reprise (§ 4.8) ;
- les données se chargent **au premier toucher d'un lieu**, jamais au premier
  affichage : ≈ 18 Ko compressés pour le monde, mesurés, au lieu des ≈ 50 Ko
  estimés par le besoin ;
- sources : Banque mondiale (habitants, 2025), Wikidata (superficie,
  gentilé, point culminant, liens), CLDR (langues, monnaies), base tz
  (heure), IGN (communes), et une table relue à la main pour tout ce que les
  sources tranchent mal (fêtes, gentilés, sommets, fuseaux, pays riverains,
  statuts) ;
- la superficie d'un pays touché par une zone disputée ne suit pas Wikidata
  telle quelle : Wikidata tranche des revendications (D57) ;
- une zone contestée ne montre que son statut (« tenue par… »,
  « revendiquée par… », écrit à la main), ses voisins, ses habitants avec
  leur source, son lien et ses photos (D57) ;
- « Apprendre ce lieu » fait passer en tête **la grappe qui contient le
  lieu**, dans le budget du jour. Un pays y entre par son nom seul. Rien au
  journal ;
- photos : 3 à 5 visées par lieu, proposées par un script, relues dans un
  outil local. Elles sont servies par le site, hors du manifeste du service
  worker, dans un cache à part ;
- l'APK embarque les vignettes ; le plein écran vient du site.

## 1. Ce qui existe et ce qui manque

| Élément | Existe (`3ba6e31`, vérifié) | Manque |
|---|---|---|
| Barre du bas | `div#barre-carte`, `aria-live`, nom et détail (`vues/explorer.ts:71-75`) ; détail = statut, « par sa pastille », ligne de la mémoire (`:190-200`) ; frère de l'hôte de la carte (`:102`) | une ligne de faits ; un bouton ; une hauteur qui ne saute pas |
| Statut dit par la barre | « territoire », « statut contesté », « paquet optionnel » (`vues/commun.ts:57-63`) | « souveraineté revendiquée par… », le pays d'un territoire |
| « tenue par… » | seulement dans la rétroaction d'un toucher (`texteAdmis`, `vues/commun.ts:147-160`), pour les zones hachurées ; le code connaît le tenant de quelques entités en commentaire : « NE_KAS (Siachen, tenu par l'Inde) » (`map/acceptes.ts:33-37`) | une clé `tenant` de 12 lignes dans la table à la main (§ 2.2) |
| Lieux touchables | 258 entités de `pays.json` : 195 jouables, 48 territoires, 12 contestées, 2 optionnelles, 1 « autre » (mesuré, `synthese/scripts/lieux.py`) ; 50 mers ; 24 communes | une fonction qui dit la sorte d'un lieu |
| Zones hachurées | 77 dans `contestees.json`, jamais désignées par `pick` (`map/types.ts:35`) | rien : pas de fiche |
| Feuille qui monte | aucune ; panneaux voisins : `.essai-bilan` (`carte.css:489-498`), `.jouer-panneau`, l'écran de connexion (`vues/accueil.ts`) | la feuille, son geste, son animation |
| Réduction des mouvements | lue en JS pour les vols seulement (`map/carte.ts:550,623`, `map/carte-canvas.ts:794,833`) ; aucune règle CSS | une règle CSS pour la feuille |
| « × » | `croix(versCarte, libelle)` (`vues/commun.ts:87-91`), 44 px, collée en haut (`style.css:283-303`) | rien : réutilisée |
| Retour d'Android | branché sur l'écran de connexion seul (`main.ts:396`, `retour-android.ts:34-39`) | rien : la fiche est dans l'historique, que le retour remonte déjà (§ 4.4) |
| Retour du navigateur | l'adresse est le premier segment de l'ancre ; seul Jouer a des segments (`navigation.ts:131-135`) | une entrée d'historique par fiche, posée par `navigation.ts` (lot F1, § 4.4) |
| Voisins | `voisins` dans `pays.json` (176 entités, 688 liens, symétriques), `mers.json`, `communes.json` (`map/types.ts:21`) | les pays riverains d'une mer |
| Vol vers un lieu | `montrerLieu(terrain, id, point)` : allume, vole, remplit la barre (`vues/explorer.ts:319-352`) | ouvrir la fiche ensuite |
| Recherche | `nav.pousser('carte')` puis `montrerLieu` (`main.ts:842-850`) ; effacée pendant une partie par CSS (`carte.css:408`) | rien : elle mène à la barre |
| Bilans | lignes en texte dans des `li` (`vues/essai.ts:683-697`, `nommer.ts`, `chrono.ts`, `quiz.ts`, `vues/seance.ts`) ; le bilan revient au retour (`bilanAuRetour`, `vues/essai.ts:739,762`) | des lignes touchables ; le chemin vers la fiche |
| « Partie en cours » | aucun drapeau commun ; cinq barres de partie listées dans une règle CSS (`carte.css:408`), sans test | une liste unique, testée |
| Ligne de la mémoire | `CarteMemoire.detail` (`vues/carte-memoire.ts:142-163`), `memoireEntite` (`srs/planif.ts:415-425`) | le détail par sujet en liste |
| Apprendre | `DemandeSeance` sans lieu (`vues/essai.ts:112`) ; `grappeSuivante` (`srs/planif.ts:165-177`), `programme` (`:326-365`) | une grappe préférée ; un lancement depuis la fiche |
| Données de pays | continent, sous-région, voisins (`pays.json`) ; 197 capitales ; 197 drapeaux ; titres de la Wikipédia française dans l'extrait figé (`geodata/wikidata/capitales.json`, `pays[Q].frwiki`) | habitants, superficie, langues, monnaie, gentilé, fuseau, sommet, fête ; le pays de chaque territoire |
| Données de mers | `bassin`, `parents`, `sorte`, superficie du tracé (`public/geo/mers.json`) ; QID et titres (`geodata/wikidata/mers-entites.json`) | superficie publiée, profondeur, pays riverains |
| Données de communes | tracé, voisins, superficie du tracé (`public/geo/reunion/communes.json`) | habitants, superficie cadastrale, intercommunalité : dans le GeoPackage, pas lus (`geodata/reunion.mjs:258`) ; gentilé |
| Noms avec article | `formes_pays`, 197 pays (`vues/formes.ts:16-19`) | rien pour un territoire : la fiche l'écrit sans article |
| Crédits | tableau `textes.credits.donnees`, six lignes (`vues/textes.fr.json:620-663`) ; l'IGN lue par son rang (`vues/credits.ts:61`) | Banque mondiale, base tz, Factbook, photos |
| Service worker | ne répond qu'aux chemins du manifeste (`sw/logique.ts:134`) ; le build y met **chaque fichier servi** (`vite.config.ts:63-72`, `sw/construction.ts:51-55`) ; une version reprend ce qui n'a pas changé (`reprendre`, `sw/logique.ts:241-257`) | une règle pour `/photos/` |
| Hébergement | `/geo/drapeaux/**` immuable (`firebase.json`) | la même règle pour les photos |
| APK | embarque tout `dist/` (`capacitor.config.ts`, `android.yml:43`) ; pas de service worker (`sw/logique.ts:4-6`) ; l'adresse du site existe déjà en constante (`sync/export.ts:24`) | retirer le plein écran avant `cap sync` |
| Pilote | `ui_*` par sujet (`driver.py`) ; `smoke` vérifie ce que le premier affichage charge | `ui_fiche` ; aucun fichier de fiche au premier affichage |

**Constat qui simplifie, à une exception près** : la fiche vit dans la vue
« carte » (`vues/explorer.ts`), qui n'est pas active pendant qu'on joue. Un
toucher pendant une question ne peut pas l'ouvrir. Mais une partie de
Toucher quittée en cours de route **attend** sur la carte : `desactiver()`
cache sa barre (`vues/essai.ts:765`), et `activer()` la reprend sur la même
question (`vues/essai.ts:739-751`, testé : `tests/essai-reprise.test.ts`).
Pendant ce temps, on est sur la carte, sans barre de partie : la recherche
est là, et la fiche le serait. Elle donnerait la capitale et le drapeau de
la question en suspens, et la note FSRS serait faussée. Le Chrono et le quiz,
eux, abandonnent la partie au départ (`vues/chrono.ts:500-502`). Il reste
donc trois portes à garder : la recherche (déjà effacée pendant une
question), le bilan, et la partie en suspens (§ 4.8).

**Constat qui complique** : la barre montre « capitale · habitants » dès le
toucher. Les données ne peuvent donc pas attendre l'ouverture d'une fiche,
comme l'écrit le besoin. Elles arrivent au premier toucher d'un lieu (§ 6.1).

## 2. Données

### 2.1 Pays (197)

Les 195 jouables, plus Taïwan et le Kosovo. Dénominateur : 197.

| Champ | Source retenue | Présents | À la main |
|---|---|---|---|
| Nom, drapeau, capitales | déjà au dépôt (`noms.fr.json`, `drapeaux.json`, `capitales.json`) | 197 | — |
| Habitants et année | Banque mondiale, `SP.POP.TOTL`, 2025 ; à défaut Wikidata P1082 avec son année | 195 + 2 | Taïwan (2026, projection), Vatican (2024) |
| Superficie | Wikidata P2046, règle du choix ci-dessous, pour tous les pays, citée « selon Wikidata » (D57, tranchée le 18/11) | 197 | aucune ligne ; les 30 pays touchés par une zone disputée et les pays à plusieurs valeurs à la relecture, ceux-ci figés dans un test |
| Langues | CLDR 49.0.0, `territoryInfo` ; noms français de CLDR | 197 | règle et table (D56) ; 15 codes sans nom français ; `no` et `nb` |
| Monnaie | CLDR 49.0.0, `currencyData` | 197 | l'ordre pour 7 pays |
| Gentilé | Wikidata P1549, français | 196 | Vatican ; 22 pays à plusieurs formes |
| Heure locale | base tz 2026e, `zone.tab`, zone la plus proche de la capitale | 196 | Kosovo ; Kazakhstan et Palestine à relire |
| Nombre de fuseaux | `zone.tab` : décalages distincts des zones dont le point tombe dans le tracé de l'entité | 19 pays par le code ISO ; à recompter par le tracé (France, Pays-Bas…) | les exceptions du test |
| Continent, sous-région | déjà dans `pays.json` (Natural Earth, égal à l'ONU M49) | 197 | 23 noms de sous-régions à traduire, Antarctique compris |
| Voisins | déjà dans `pays.json` | 197 (38 sans voisin) | — |
| Point culminant | Wikidata P610 et P2044, règle du choix ci-dessous | 195 | Gambie, Argentine ; 12 pays à trancher ; les altitudes qu'une seconde source contredit |
| Fête nationale | table à la main, pré-remplie par le CIA World Factbook | 195 avec un texte | toutes : nom à traduire ; 19 à plusieurs jours |
| Lien Wikipédia | titre de la Wikipédia française (Wikidata) | 197 | — |

Mesuré par R3 (`donnees-pays/scripts/`), recompté ici sur son prototype
(`proto-fiches-tous.json`).

**Habitants.** La Banque mondiale donne la même année, 2025, à 195 pays. Il
manque Taïwan et le Vatican. Wikidata couvre les 197, mais avec des années
de 2005 à 2026 : 34 pays y sont à 2017, et 26 s'écartent de plus de 10 % de
la Banque mondiale (Somalie 11,0 millions contre 19,7). Des chiffres d'années
différentes ne se comparent pas : c'est la raison du choix. Chaque nombre
porte son année. Les valeurs de 2025 sont des estimations de modèle :
l'étiquette dit « 2025 », pas « recensement ».

**Superficie.** Wikidata, citée. Deux autres sources sont écartées :
- la Banque mondiale (`AG.SRF.TOTL.K2`) : Canada 15 634 410 km², Norvège
  624 500, République dominicaine 146 839. Elle compte des eaux ;
- la surface du tracé de `pays.json` : elle sert au dessin. Le tracé de
  fait donne 473 871 km² à la Somalie (sans le Somaliland), 592 431 au Maroc,
  5 395 à Chypre.

**Wikidata ne suit pas un critère unique.** La rédaction écrivait « le
chiffre que chaque pays publie ». C'est faux. Mesuré (relecture,
`relecture-donnees/q2.rq` → `r2.json` ; écart au tracé recompté sur
`proto-fiches-tous.json`) :

| Pays | Wikidata (km²) | Tracé de fait | Écart | Ce que le chiffre compte |
|---|---|---|---|---|
| Serbie | 88 499 (rang préféré) | 77 471 | + 14,2 % | le Kosovo, qui a sa propre fiche (10 909) |
| Inde | 3 287 593 | 3 158 319 | + 4,1 % | tout le Cachemire |
| Pakistan | 881 913 | 873 936 | + 0,9 % | sa part du Cachemire ; une partie est donc comptée deux fois avec l'Inde |
| Maroc | 446 550 | 592 431 | − 24,6 % | sans le Sahara occidental : ce n'est pas le chiffre que publie le Maroc (≈ 710 850 Sahara compris, selon la relecture, pas revérifié ici) |
| Somalie | 637 657 | 473 871 | + 34,6 % | le Somaliland, qui a sa propre fiche |
| Chypre | 9 242 | 5 396 | + 71,3 % | le nord et la zone tampon, qui ont leurs fiches |

Le chiffre suit tantôt le revendiquant (Serbie, Inde, Pakistan), tantôt
l'ONU (Maroc). L'afficher tel quel tranche des revendications. C'est D57,
réécrite, puis tranchée le 18/11 : Wikidata pour tous les pays, citée
« selon Wikidata », par la règle du choix ci-dessous.

Les pays concernés se repèrent par les données, pas par l'écart au tracé :
un pays est **touché** s'il tient ou revendique une zone de
`contestees.json` (`dans`, `revendique_par`), ou s'il revendique une entité
de `pays.json` (`revendique_par`). Cela fait 68 pays. Pour 30 d'entre eux,
ces zones pèsent 1 % ou plus de leur tracé (mesuré,
`correction/` : Guyana 74 %, Chypre 68 %, Maroc 45 %, Somalie 36 %,
Pakistan 22 %, Serbie 14 %, Inde 9,5 %, Ukraine 7,8 %, Israël 6 %…). Les
38 autres ont de petites îles ou des bandes de frontière (France 0,6 %,
États-Unis moins de 0,1 %). Le repérage par l'écart au tracé, lui, manquait
l'Inde (+ 4,1 %, sous le seuil de 5 %).

**Plusieurs valeurs.** La rédaction citait la Bosnie et la Lettonie. C'est
plus large (relecture, `q1.rq` → `r1.json`) : la Norvège a 11 valeurs, de
1 210 à 385 207 km² (ses comtés, le Svalbard…), la Slovaquie 3, le Japon,
l'Estonie et la Serbie 2. Règle du choix, celle du prototype
(`donnees-pays/scripts/t_proto.py:20-25`) : les valeurs de rang préféré s'il
y en a, sinon toutes ; parmi elles, la plus récente si elles sont datées
(les non datées sont alors écartées) ; sinon, ou à égalité sur la plus
récente, la plus grande (la Lettonie : deux valeurs préférées au
1er janvier 2026, 64 593,77 et 61 760,39 km², la plus grande gardée). Un test fige la liste des pays à plusieurs valeurs et
la valeur retenue pour chacun : une valeur nouvelle dans un extrait se voit.

**Langues.** La règle de R3 : les officielles d'abord, puis les autres à
partir d'un seuil, cinq lignes au plus, un seul code par langue. Recomptée
sur son prototype (seuil de 10 %), elle montre deux défauts :
- l'anglais sort comme langue « parlée » dans 44 pays où il n'est pas
  officiel : France 39 %, Allemagne 64 %, Pays-Bas 90 %. CLDR compte les
  langues apprises, pas les langues maternelles ;
- les dialectes doublent leur langue bien au-delà des trois cas relevés :
  arabe marocain et arabe au Maroc, bavarois et bas allemand en Allemagne,
  arabe levantin dans cinq pays ;
- une même langue sort sous deux codes : la Norvège donne `nb` 100 %, `no`
  100 % et `nn` 25 % (le bokmål compté deux fois). La table garde `nb` et
  `nn`, et retire `no`.

Pour l'Inde, CLDR ne marque officiels que le hindi et l'anglais : c'est
juste pour l'Union, et cela évite la liste des 22 langues du besoin.

Et l'espagnol manque aux États-Unis. La liste ne peut pas sortir d'une règle
seule. Le choix de ce qu'on montre est à l'utilisateur : D56. Dans tous les
cas, une table à la main corrige la règle, avec une raison par ligne.

**Monnaie.** CLDR, monnaies en cours. Sept pays en ont plusieurs : Bhoutan,
Haïti, Lesotho, Namibie, Panama, Palestine, Zimbabwe. L'ordre de CLDR n'est
pas fiable (le rand avant le loti au Lesotho) : il est fixé à la main.

**Gentilé.** Wikidata mêle masculin, féminin et pluriel. Le build garde le
masculin et forme le pluriel : un « s », sauf après s, x ou z (55 pays).
Aucune forme en -al ou -eau. Le fichier de langue porte le pluriel tout
fait, pour qu'aucune règle de grammaire ne vive dans le code. Les 22 pays à
plusieurs formes sont tranchés à la main, par la forme la plus courante en
français : « Britanniques », « Américains », « Chypriotes ».

**Heure locale.** Le fichier donne une zone IANA par pays. Le navigateur fait
le reste : `Intl.DateTimeFormat` avec `timeZone`, et l'écart calculé par
`formatToParts` dans les deux zones. Mesuré par R3 dans Node 24 : Katmandou
17:45, îles Chatham à +9 h 45, bascule d'heure d'été juste. `timeZoneName:
'longOffset'` est écarté : trop récent, et il rend un texte à analyser.

**Nombre de fuseaux, par entité de la carte.** La rédaction comptait les
zones par code ISO du pays. C'est faux pour une entité qui englobe des
régions à code propre. L'entité `FRA` de la carte comprend la Guyane, les
Antilles, La Réunion et Mayotte (`pays.json` : bbox de − 61,8° à + 55,9°,
voisins `BRA` et `SUR`). Elle couvre donc 5 décalages, et le prototype n'en
dit rien (`FRA` : pas de `nz`). Même défaut pour les Pays-Bas (Bonaire,
`America/Kralendijk`, code `BQ`). Règle : une zone de `zone.tab` compte pour
l'entité dont le tracé contient son point (ses coordonnées y sont) ; un
point en mer prend l'entité la plus proche, à 50 km au plus. Le nombre de
fuseaux est le nombre de décalages distincts de ces zones, au 1er janvier et
au 1er juillet, le plus grand des deux. Un test fige le résultat des pays à
plusieurs fuseaux : la France en a 5, et sa fiche dira « Heure à Paris » puis
« 5 fuseaux dans le pays ». C'est la première fiche que verra l'utilisateur,
à La Réunion.

Les îles mineures éloignées des États-Unis (`UMI`) vont de + 12 h (Wake) à
− 11 h (Midway) : une seule zone écrite à la main serait fausse pour presque
toutes. Elles n'ont **pas de ligne d'heure**.

**Version de la base tz.** Le build lit `zone.tab` 2026e. Node 24.19 porte tz
2026b, et la WebView de l'A37 a sa propre version (S43). Les noms récents
(`Asia/Kolkata`, `Europe/Kyiv`, `America/Nuuk`…) sont acceptés partout où
mesuré ; un nom inconnu lève une `RangeError`, et la ligne est retirée
(§ 4.2).

**Point culminant.** Wikidata, avec deux pièges mesurés : deux altitudes en
pieds (Ghana, Guam), à convertir en lisant l'unité ; et 12 pays où plusieurs
sommets sont déclarés. Le critère, écrit dans la table : **le plus haut point
du tracé de fait de la carte**, celui où un toucher donne ce pays. C'est la
convention de la décision « Pays et frontières ». Elle ne tranche rien de
plus que la carte :
- Inde : Kangchenjunga, pas le K2 ;
- Australie : mont Kosciuszko ; le pic Mawson est sur l'île Heard, qui a sa
  propre fiche ;
- France : mont Blanc ; un sommet sur une frontière compte pour les deux
  pays ;
- Serbie, Israël : selon le tracé, à vérifier au lot F2 par un test (les
  coordonnées du sommet tombent dans le tracé du pays, ou à moins de 10 km).

Règle de l'altitude, écrite ici et dans le build : la valeur de rang
préféré ; sinon la plus récente si elles sont datées ; sinon la seule ;
arrondie au mètre. Le prototype prenait la plus grande
(`donnees-pays/scripts/s_culm.py:17`, `round(max(a))`). Un piège mesuré :
le mont Fuji sort à 3 777 m (Wikidata : 3 777,24, une seule valeur,
`brut/culm-altitudes.json`). La valeur courante est 3 776 m (estimé, de
mémoire : 3 776,24 selon l'institut géographique du Japon, à confirmer au
lot F2). Les altitudes de la table sont donc comparées à une seconde source
au lot F2 (Wikipédia française, ou l'institut du pays) ; un écart de plus
de 5 m devient une ligne de la table, avec sa source.

**Fête nationale.** Wikidata ne sert pas : P832 liste tous les jours fériés,
et 127 pays n'en ont aucun. Le CIA World Factbook a un champ pour 195 pays :
174 avec un jour, 19 avec plusieurs, 2 sans jour (Suisse, Royaume-Uni). Il
est arrêté depuis février 2026 ; un miroir figé le garde. Il **pré-remplit**
une table à la main : jour, mois, nom en français. La règle des cas
multiples : la fête que l'État se donne comme fête nationale, comme « toute
capitale que le pays se déclare ». Le Royaume-Uni n'a pas de ligne. La
Bosnie-Herzégovine non plus, en attendant l'utilisateur (lot F2 : quatre jours, deux par
entité, aucun pour l'État commun). La Suisse a le 1er août. La table est montrée à l'utilisateur avant la mise en
ligne.

**Continent et sous-région.** Les 23 sous-régions de `pays.json` (mesuré :
22 pour les pays, plus « Antarctica ») sont celles de l'ONU, une pour une
(mesuré par R3). Le continent reste celui de l'appli,
déjà traduit pour les séries de Jouer (`textes.continents`) : « Amérique du
Nord » et « Amérique du Sud », pas « Amériques ». L'utilisateur lit les
mêmes mots dans Jouer et dans la fiche. « région micronésienne », étiquette
de CLDR, s'écrit « Micronésie ».

**Voisins.** La liste de `pays.json` : deux entités sont voisines si elles
partagent une frontière sur la carte. Elle est symétrique et testée
(`tests/donnees.test.ts`). 38 pays n'ont aucun voisin (37 jouables et
Taïwan). 23 pays jouables ont un voisin non jouable ; cela fait 28 liens,
dont 4 vers le Kosovo. La fiche montre tout :
- d'abord les pays jouables, par ordre alphabétique ;
- puis, à part, les autres entités, avec leur statut : « Hong Kong
  (territoire) », « Somaliland (statut contesté) » ;
- un pays sans voisin : « Aucune frontière terrestre ».

La France a le Brésil et le Suriname, par la Guyane : c'est juste, et testé.

### 2.2 Territoires, zones contestées, Antarctique

**Les 12 zones contestées sont les 12 entités de `pays.json`** : Sahara
occidental, Somaliland, Chypre du Nord, zone tampon de Chypre, Siachen, Bir
Tawil, île Brésilienne, champ de glace de Patagonie, Spratleys, Scarborough,
Bajo Nuevo, Serranilla. La Crimée n'en est pas : c'est une zone hachurée
(`NE_B89`), sans entité. Un toucher y donne le pays que la carte dessine,
donc sa fiche.

**Statut d'une zone.** Les données ont, pour chaque entité, `revendique_par`
et la note de Natural Earth (`note_ne`). Elles n'ont pas de champ « tenant »
(`map/acceptes.ts:33-41`). Mais le tenant est connu, et le code le cite déjà
en commentaire : « NE_KAS (Siachen, tenu par l'Inde) », « NE_CNM (zone
tampon de l'ONU) » (`map/acceptes.ts:33-37`). Le besoin met « tenue par… »
en premier. La table à la main reçoit donc une clé **`tenant`** : 12 lignes,
une raison par ligne, dans la forme que l'appli emploie déjà (« tenue
par X », `texteAdmis`, `vues/commun.ts:147-160`).

**`note_ne` n'est jamais recopiée.** Elle se trompe là où c'est le plus
sensible : pour le Sahara occidental, « Self admin.; Claimed by Morocco »
(`pays.json`, `ESH`). Or le Maroc tient la plus grande part du territoire,
et la RASD (Front Polisario) le revendique aussi. La décision « Zones
contestées et enclaves » range d'ailleurs le Sahara occidental parmi les
zones que le Maroc tient ou revendique. Chaque ligne de statut est donc
écrite à la main, puis relue par l'utilisateur (§ 9, relectures).

Proposition de la table, à vérifier au lot F3 (estimé, de mémoire ; les
revendicants viennent de `pays.json`, mesuré) :

| Entité | Tenant (proposé) | Revendiquée par (`pays.json`) | Texte proposé |
|---|---|---|---|
| Sahara occidental (`ESH`) | le Maroc, pour la plus grande part ; le reste par la RASD | le Maroc (la RASD, absente des données, à ajouter à la main) | « Tenue en majeure partie par le Maroc, qui la revendique · revendiquée aussi par la RASD » |
| Somaliland (`NE_SOL`) | lui-même | la Somalie | « S'administre de fait · souveraineté revendiquée par la Somalie » |
| Chypre du Nord (`NE_CYN`) | elle-même, avec l'armée turque | Chypre | « S'administre de fait · souveraineté revendiquée par Chypre » |
| zone tampon (`NE_CNM`) | l'ONU | Chypre | « Zone tampon tenue par l'ONU · souveraineté revendiquée par Chypre » |
| Siachen (`NE_KAS`) | l'Inde | l'Inde, le Pakistan | « Tenu par l'Inde · revendiqué par l'Inde et le Pakistan » |
| île Brésilienne (`NE_BRI`) | le Brésil | le Brésil, l'Uruguay | « Tenue par le Brésil · revendiquée aussi par l'Uruguay » |
| Bajo Nuevo (`NE_BJN`) | la Colombie | la Colombie, la Jamaïque, le Nicaragua, les États-Unis | « Tenu par la Colombie · revendiqué aussi par… » |
| Serranilla (`NE_SER`) | la Colombie | la Colombie, le Honduras, le Nicaragua, les États-Unis | même forme |
| Scarborough (`NE_SCR`) | la Chine, depuis 2012 | la Chine, les Philippines, Taïwan | « Tenu par la Chine · revendiqué aussi par… » |
| Spratleys (`NE_PGA`) | plusieurs États, chacun sur quelques îles | six États | « Îles tenues en partie par plusieurs États · revendiquées par… » |
| champ de glace de Patagonie (`NE_SPI`) | personne : frontière non tracée | l'Argentine, le Chili | « Frontière non tracée entre l'Argentine et le Chili » |
| Bir Tawil (`NE_BRT`) | personne | personne | « Zone qu'aucun État ne revendique, entre l'Égypte et le Soudan » |

Les textes se plient au genre du nom (« tenue », « tenu ») : ils sont écrits
en entier dans le fichier de langue, une ligne par entité, sans règle de
grammaire dans le code. Les pays y prennent leur article (`formePays`,
décision « Articles des noms de pays »). Un test vérifie que les
revendicants cités sont ceux de `revendique_par`, plus les ajouts écrits
(la RASD).

**Champs d'une zone.** Proposition (D57) : le statut, le continent et la
sous-région, les voisins, les habitants avec leur année et leur source quand
ils existent (5 zones sur 12 : 3 habitées, et Bajo Nuevo et Serranilla à 0),
le lien Wikipédia (11 sur 12), les photos. Ni
superficie, ni langue, ni monnaie, ni fuseau, ni drapeau, ni capitale : ce
sont ceux d'une administration, et les afficher prend parti.

**Taïwan et le Kosovo** sont des pays du paquet optionnel : capitale et
drapeau déjà au dépôt, fiche complète. La première ligne dit « Souveraineté
revendiquée par la Chine » ou « par la Serbie ». Ils n'ont pas de bouton
« Apprendre » : ils n'ont pas de grappe (§ 5).

**Territoires (48).** D'abord le statut. Le pays vient du champ `SOV_A3` de
Natural Earth, que le build ne reporte pas aujourd'hui (mesuré par R3 sur le
`.dbf`). Dix codes sont à convertir à la main (`FR1`, `GB1`, `US1`, `NL1`,
`DN1`, `AU1`, `NZ1`, `CH1`, `KA1`, `CU1`).

La forme unique « Territoire de X » est inexacte pour 11 des 48. Natural
Earth classe 9 territoires en « Country », pas en « Dependency » (mesuré,
`donnees-pays/souverainete-ne.json`, champ `type`). La table `souverain`
porte donc une **forme de statut par sorte** :

| Sorte | Entités | Forme proposée |
|---|---|---|
| pays constitutif | Aruba, Curaçao, Saint-Martin (partie néerlandaise) | « Pays constitutif du Royaume des Pays-Bas » |
| partie autonome du Danemark | Groenland ; et les Féroé, rangées « Dependency » par Natural Earth | « Partie autonome du Royaume de Danemark » |
| région administrative spéciale | Hong Kong, Macao | « Région administrative spéciale de la Chine » |
| dépendance de la Couronne | Guernesey, Jersey, île de Man | « Dépendance de la Couronne britannique » |
| État associé | îles Cook, Niue (« Dependency » chez Natural Earth) | « État associé à la Nouvelle-Zélande » |
| région autonome | Åland (absente de `souverainete-ne.json`, à la main) | « Région autonome de la Finlande » |
| territoire | les 27 autres « Dependency » | « Territoire de la France », « … du Royaume-Uni »… |
| revendiqué | Malouines, Gibraltar, Chagos (« Disputed »), Géorgie du Sud | « Territoire du Royaume-Uni · souveraineté revendiquée par l'Argentine » |
| loué | Baïkonour, Guantánamo (« Lease ») | « Loué à la Russie par le Kazakhstan » ; « Loué aux États-Unis par Cuba · revendiqué par Cuba » |
| base | Akrotiri, Dhekelia | « Base du Royaume-Uni » |

Les formes sont relues par l'utilisateur avec les lignes de statut des
zones (§ 9, relectures).

**Chagos.** Leur statut vient de Natural Earth 5.1.2 : « Admin. by U.K.;
Claimed by Mauritius and Seychelles ». Le traité entre le Royaume-Uni et
Maurice, signé en mai 2025, a pu le changer ; sa ratification n'est pas
vérifiée ici (estimé). À vérifier au lot F3 ; la ligne de la table porte la
date à laquelle elle a été vérifiée.

Puis ce qui s'applique :

| Champ | Présents sur 48 | Règle |
|---|---|---|
| Habitants | 45 (21 Banque mondiale, 24 Wikidata) : 42 habités, 3 à 0 (îles Heard, Ashmore-et-Cartier, Clipperton) | année affichée ; 0 : « aucun habitant permanent », sans année ; un nombre positif sans année : ligne retirée (aucun aujourd'hui) |
| Superficie | 46 | Wikidata |
| Capitale | 38 | Wikidata P36, nom français relu ; Montserrat et Géorgie du Sud tranchés à la main |
| Langues, monnaie | 40 | CLDR, comme les pays |
| Heure locale | 39, dont des faux | zone écrite à la main pour 47 (le Groenland sortait à Danmarkshavn) ; aucune pour les îles mineures des États-Unis (de + 12 h à − 11 h) |
| Gentilé | 11 | ligne absente sinon |
| Point culminant | 26 | ligne absente sinon |
| Drapeau | 40 dans flag-icons (325 Ko bruts pour les 40, mesuré) | montré, chargé à la demande ; aucun pour les 8 entités sans code ISO |
| Fête nationale | — | pas de ligne : c'est une donnée de pays |
| Continent, sous-région, voisins, lien | 48 | déjà là |

Une ligne sans donnée n'est pas affichée. La liste des champs absents est
figée dans un test : elle ne grandit pas sans qu'on le veuille.

**Les QID.** Aucun territoire ni zone n'a de QID au dépôt. R3 en a trouvé
59 : 38 par le code ISO, 19 à la main (`lieux-qid.json`). Ces 19 sont à
relire : Akrotiri et Dhekelia partagent un élément, Baïkonour pointe le
cosmodrome. Ils entrent dans la table à la main.

**Antarctique.** Seule entité « autre ». On peut la toucher, donc elle a une
fiche, courte : « Continent », superficie, point culminant, lien, photos.
Rien sur les revendications. Sans elle, la barre aurait un lieu qui ne
s'ouvre pas. Elle **manque au prototype** de R3 (mesuré : seul id de
`pays.json` absent de `proto-fiches-tous.json`). Ses deux chiffres sont à
extraire au lot F3 : superficie (Wikidata `Q51`, P2046) et point culminant
(P610, le mont Vinson, ≈ 4 892 m, estimé), avec la même règle de choix que
les pays.

### 2.3 Océans et mers (50)

| Champ | Source retenue | Présents | À la main |
|---|---|---|---|
| Nom, sorte, mère | déjà au dépôt (`mers.fr.json`, `mers.json` : `sorte`, `parents`) | 50 | — |
| Océan de rattachement | `bassin` de `public/geo/mers.json` | 50 | — |
| Superficie | Wikidata P2046, corrigée ; à défaut le tracé avec ses sous-mers | 46 + 4 | ≈ 10 corrections ; les 5 océans |
| Profondeur maximale | Wikidata P4511 | 49 | golfe de Californie ; mer du Groenland, mer des Sargasses ; 2 écarts |
| Pays riverains | tracé de Natural Earth, uni à Wikidata (P17, P205), moins une liste d'exclusions | 44 mers sur 45 | la liste d'exclusions et d'ajouts |
| Lien Wikipédia | extrait figé (`mers-entites.json`) | 50 | — |

Mesuré par R4 (`donnees-mers-communes/`).

**Superficie.** Wikidata se trompe : sur 40 mers comparées à la Wikipédia
française, 9 s'écartent de plus de 10 % (mer de Beaufort 178 000 km² contre
450 000 ; golfe d'Aden 530 000 contre 262 000). Le tracé, sous-mers
comprises, rejoint la Wikipédia à ±10 % pour 31 mers sur 35. Règle : la
valeur de Wikidata ; si elle s'écarte de plus de 25 % du tracé, une ligne de
la table à la main la remplace, avec sa source. Les 4 mers sans valeur
prennent le tracé. Les océans n'ont pas de valeur unique : leur ligne est
écrite à la main, d'après une source nommée. L'affichage arrondit à trois
chiffres : « environ 2,5 millions de km² ».

**Profondeur.** Wikidata ne dit « maximum » que pour 11 valeurs sur 49. Les
36 valeurs uniques sont prises telles quelles : 29 sur 31 contrôlées sont à
±5 % de la Wikipédia. Les 2 ambiguës et le golfe de Californie vont à la
table.

**Pays riverains.** Deux méthodes, qui s'accordent pour 28 mers sur 45 :
- le tracé : un pays est riverain si sa côte passe à ≈ 13 km de la mer. 225
  liens. Faux positifs : Saint-Marin (enclavé), la Chine sur la mer du
  Japon, les zones de Chypre ;
- Wikidata : 203 liens, avec des États disparus (URSS, Yémen du Sud), mais
  Malte, que le tracé manque.

L'union importe aussi des faux positifs (mesuré,
`donnees-mers-communes/comparaison-riverains.json`) :
- par le tracé : les États-Unis et Saint-Pierre-et-Miquelon pour le golfe
  du Saint-Laurent, la Chine pour la mer du Japon, la Suède pour la mer du
  Nord ;
- par Wikidata : le Royaume-Uni et les États-Unis aux Caraïbes, le
  Royaume-Uni en Méditerranée, en double avec leurs territoires riverains.

17 mers sur 45 ont au moins un écart entre les deux méthodes.

Règle : l'union des deux, les États disparus retirés. Puis, d'office : un
souverain que **seul Wikidata** donne est retiré quand un de ses territoires
est déjà riverain par le tracé (le Royaume-Uni par Gibraltar, Akrotiri et
Dhekelia ; les États-Unis par Porto Rico). Un souverain que le tracé donne
reste : la France est riveraine du canal du Mozambique par Mayotte, qui est
dans son entité. Enfin une liste d'exclusions et d'ajouts à la main, relue :
≈ 25 lignes pour les 17 mers qui divergent (estimé, une à deux par mer),
pas ≈ 15. Les ids sont ceux du projet,
territoires compris (Gibraltar sur la Méditerranée). La fiche les range
comme les voisins d'un pays : pays d'abord, autres entités à part avec leur
statut. Les 5 océans n'ont pas de liste : une centaine de pays chacun. La
mer des Sargasses n'en a pas : elle n'a pas de côte.

**Mère et océan.** Une mer fille dit sa mère (« dans la Méditerranée »),
puis son océan (« océan Atlantique »). Les deux se touchent, comme un
voisin.

### 2.4 Communes de La Réunion (24)

| Champ | Source retenue | Présents | À la main |
|---|---|---|---|
| Nom | déjà au dépôt | 24 | — |
| Habitants | IGN, ADMIN EXPRESS, colonne `population` (recensement INSEE du 01/01/2023) | 24 | — |
| Superficie | IGN, `superficie_cadastrale` | 24 | — |
| Intercommunalité | IGN, `codes_siren_des_epci` | 24 | 5 sigles (CINOR, TCO, CIREST, CASUD, CIVIS) |
| Gentilé | Wikidata P1549 | 24 | 4 à relire : Saint-Benoît, Petite-Île, L'Étang-Salé, Sainte-Marie |
| Communes voisines | déjà dans `communes.json` | 24 | — |
| Lien Wikipédia | Wikidata | 24 | — |

Mesuré par R4. Total des habitants : 889 679.

**Habitants.** Le besoin les disait « déjà dans les données ». Ils sont dans
le GeoPackage de l'IGN, pas dans `communes.json` : `geodata/reunion.mjs` ne
lit que le code, le nom et le tracé. Il lira trois colonnes de plus. L'IGN
est préféré à Wikidata, qui mêle les années (Le Tampon y est à 2026).

**Superficie.** La valeur cadastrale de l'IGN, celle que publient l'INSEE et
les communes. Le tracé de la carte en diffère peu, sauf à l'Entre-Deux (51,6
contre 66,8 km²) et au Tampon. La fiche donne le chiffre officiel ; le tracé
reste celui du dessin.

**Ni point culminant ni cirque.** Wikidata n'a un sommet que pour 3 communes,
et le dépôt n'a pas de modèle de terrain. Les cirques seront dans les
photos.

### 2.5 Sources, années, licences

| Source | Sert à | Licence | Ce qu'il faut afficher | Figée comment |
|---|---|---|---|---|
| Banque mondiale, World Development Indicators | habitants (195 pays, 21 territoires) | CC BY 4.0 | la source et la licence, dans Crédits ; l'année à côté du nombre | extrait versionné `geodata/banque-mondiale/population.json`, avec sa date de mise à jour |
| Wikidata | superficies, gentilés, sommets, profondeurs, capitales des territoires, liens | CC0 | rien d'obligatoire ; la date de l'extrait | extrait versionné `geodata/wikidata/fiches.json` ; requêtes dans un fichier à part |
| Unicode CLDR 49.0.0 | langues, monnaies, leurs noms | Unicode License v3 | la notice, déjà servie | fichiers verrouillés par empreinte (`sources.lock.json`) |
| Base tz de l'IANA, 2026e | zone de chaque pays | domaine public | la version | `zone.tab` verrouillé par empreinte |
| CIA World Factbook, miroir figé | pré-remplissage des fêtes ; point culminant de la Gambie | domaine public (S46) | « d'après le World Factbook, relu » | rien au build : la table à la main fait foi ; ligne de `sources.json` |
| Natural Earth | pays d'un territoire, riverains | domaine public | déjà cité | déjà verrouillé |
| IGN, ADMIN EXPRESS | communes | Licence Ouverte 2.0 | source et date, déjà là ; plus « recensement INSEE 2023 » | déjà verrouillé |
| flag-icons 7.6.0 | drapeaux des territoires | MIT | déjà cité | déjà verrouillé |
| Wikimedia Commons | photos | par photo | auteur, licence, lien sous chaque photo (§ 3.2) | § 3 |
| Wikipédia | des liens ; quelques faits écrits dans la table (altitudes, parts de langues, sources des statuts) | CC BY-SA 4.0 (texte ; seuls des faits en sont repris) | rien pour un lien ; aucun extrait de texte dans la fiche | révisions citées dans la table et dans `sources.json` (un test les compare) |

Règles :
- **rien n'est téléchargé au chargement du site**, et le build ne lit que
  des fichiers figés. C'est la chaîne des capitales (`geodata/wikidata.mjs`,
  `tests/donnees-capitales.test.ts`) ;
- les requêtes des fiches vont dans `geodata/wikidata/requetes-fiches.rq`,
  pas dans `requetes.rq` : l'extrait des capitales garde l'empreinte de ce
  fichier, et un test la compare ;
- chaque nombre affiché a son année quand elle varie d'un lieu à l'autre ;
- **une seule table à la main**, `geodata/fiches-main.json`. Chaque ligne a
  sa raison. Le build échoue si une ligne ne s'applique plus, comme pour
  `capitales-main.json`.

Contenu de la table à la main (≈ 490 lignes, plus les langues et D57 ;
estimé) :

| Clé | Lignes | Quoi |
|---|---|---|
| `qid` | 59 | élément Wikidata des territoires et des zones |
| `souverain` | 48 | pays de chaque territoire et sa forme de statut (pays constitutif, région administrative spéciale, dépendance de la Couronne, État associé, territoire, loué, base) ; date de vérification pour les Chagos |
| `statut` | 12 | texte de chaque zone, écrit à la main, jamais tiré de `note_ne` (§ 2.2) |
| `tenant` | 12 | qui tient chaque zone, avec sa raison ; revendicants absents des données (la RASD) |
| `fete` | ≈ 195 | jour, mois, nom français |
| `gentile` | ≈ 30 | 22 pays, le Vatican, 4 communes, des territoires |
| `culminant` | ≈ 16 | les 12 pays à trancher, Gambie, Argentine, les écarts à la seconde source (le Fuji), l'Antarctique |
| `fuseau` | ≈ 55 | Kosovo, 47 territoires, 2 pays relus ; « pas de ligne d'heure » pour les îles mineures des États-Unis ; ≈ 5 exceptions à la règle des zones par le tracé |
| `monnaies` | 7 | ordre |
| `langues` | selon D56 | retraits, ajouts, 15 noms français, `no` retiré en Norvège |
| `superficie`, `profondeur` | ≈ 20, plus selon D57 | mers corrigées, océans ; les pays touchés par une zone disputée, selon D57 |
| `riverains` | ≈ 25 | exclusions et ajouts des 17 mers qui divergent |
| `capitale` | 2 | Montserrat, Géorgie du Sud |
| `epci` | 5 | sigles |

### 2.6 Couverture

Nombre de lieux qui ont le champ, sur le total de leur sorte. « — » : le
champ ne s'applique pas.

| Champ | Pays (197) | Territoires (48) | Zones (12) | Antarctique (1) | Mers (50) | Communes (24) |
|---|---|---|---|---|---|---|
| Nom | 197 | 48 | 12 | 1 | 50 | 24 |
| Statut | — | 48 | 12 | « Continent » | — | — |
| Tenant | — | — | 12 après la table | — | — | — |
| Drapeau | 197 | 40 | — | — | — | — |
| Capitale | 197 | 38 | — | — | — | — |
| Habitants | 197 | 45 : 42 habités, 3 « aucun habitant permanent » | 5 : 3 habitées, 2 « aucun habitant permanent » | — | — | 24 |
| Superficie | 197, selon D57 pour les pays touchés | 46 | — | 1, au lot F3 (Wikidata `Q51`) | 50 | 24 |
| Langues | 197 (en ligne après D56) | 40 | — | — | — | — |
| Monnaie | 197 | 40 | — | — | — | — |
| Gentilé | 197 après la table | 11 | — | — | — | 24 |
| Heure locale | 197 après la table | 47 après la table | — | — | — | — |
| Nombre de fuseaux | selon la règle par le tracé (France : 5) | — | — | — | — | — |
| Continent, sous-région | 197 | 48 | 12 | 1 | — | — |
| Océan, mère | — | — | — | — | 50 | — |
| Voisins ou riverains | 197 | 48 | 12 | 1 (aucun) | 44 mers sur 45 | 24 |
| Point culminant | 197 après la table | 26 | — | 1, au lot F3 (P610) | — | — |
| Profondeur | — | — | — | — | 50 après la table | — |
| Fête nationale | 196 (pas le Royaume-Uni) | — | — | — | — | — |
| Intercommunalité | — | — | — | — | — | 24 |
| Lien Wikipédia | 197 | 48 au lot F3 (QID) | 11 au lot F3 | 1 | 50 | 24 |

Mesuré par R3 et R4, sauf les cases « après la table » et « au lot F3 »,
qui disent ce que la table à la main et le lot F3 doivent donner. Les
habitants à 0 sont recomptés ici (`correction/habitants-zero.py`). La
colonne des zones suit le défaut de D57. L'Antarctique manque au prototype :
sa colonne est ce qu'il faut extraire.

### 2.7 Poids et découpage

| Fichier | Contenu | Brut | gzip |
|---|---|---|---|
| `geo/fiches-monde.json` | chiffres sans langue : habitants, superficie, langues et monnaies par code, zone, fête en [jour, mois], altitude, pays d'un territoire | ≈ 29 Ko | ≈ 9,0 Ko |
| `geo/fiches-monde.fr.json` | textes : gentilés, noms des sommets et des fêtes, titres Wikipédia, noms des langues, des monnaies et des sous-régions | ≈ 25 Ko | ≈ 9,0 Ko |
| `geo/fiches-mers.json` et `.fr.json` | superficie, profondeur, riverains ; titres | 4,3 Ko | 1,6 Ko |
| `geo/reunion/fiches.json` et `.fr.json` | habitants, superficie, intercommunalité ; gentilés, titres, sigles | 2,4 Ko | 0,8 Ko |

Mesuré sur les prototypes de R3 et R4 (`gzip -9`). Le total fait **≈ 20 Ko
compressés**, contre ≈ 50 Ko estimés par le besoin.

Choix :
- **deux fichiers par terrain** : l'un sans langue, l'autre de la langue.
  C'est la décision « Langue » : l'anglais ajoutera `fiches-monde.en.json`
  sans toucher aux chiffres ;
- les mers et les communes ont leurs fichiers : qui ne touche que des pays
  ne les paie pas ;
- un objet par lieu, clés courtes. Les mêmes données en tableaux sans clés
  ne gagnent rien (13 358 octets contre 13 600, mesuré par R3) ;
- continent, sous-région et voisins restent dans `pays.json`, déjà chargé :
  ils ne sont pas recopiés ;
- un test borne chaque fichier : 12 Ko compressés pour chacun des deux du
  monde, 3 Ko pour les mers, 2 Ko pour les communes.

## 3. Photos

### 3.1 Candidats

R5 a essayé la chaîne pour de vrai sur 14 lieux : 6 pays, 2 territoires, 3
mers, 3 communes (`photos/`). Les candidats libres ne manquent pas : des
centaines par lieu. **Le goulot est la qualité.** Sur 12 candidats montrés,
11 lieux en ont au moins 7 de bons à l'œil ; 3 lieux sont pauvres (golfe
d'Aden 1, Tchad 3, Sahara occidental 3). C'est le jugement du relevé, pas
celui de l'utilisateur.

Sources, dans l'ordre où le script les prend :

| Sorte | Sources | Ce qui est mesuré |
|---|---|---|
| Pays, territoires | 1. sites du patrimoine mondial (P1435) ; 2. lieux notables du pays, requête resserrée ; 3. image du lieu (P18) ; 4. catégorie Commons, pour les très petits pays ; 5. « Quality images », en complément | patrimoine : 116 pays jouables sur 195 ont 3 sites avec photo, 26 n'en ont aucun ; les lieux notables dépassent le délai pour la France, le Japon, le Pérou, la Mongolie et le Tchad ; P18 d'un pays est souvent une vue satellite |
| Mers | 1. lieux de la côte (P206), États exclus ; 2. propositions à la main ; 3. catégorie Commons, en dernier | Méditerranée : 80 lieux ; golfe d'Aden : 5, et sa catégorie n'a que la marine américaine |
| Communes | 1. image de la commune (P18) ; 2. lieux situés dans la commune (P131) | 40 lieux par commune ; très bon |

Règles du script :
- un site du patrimoine mondial à plusieurs pays passe en bas : « l'œuvre de
  Le Corbusier » montrait Chandigarh pour le Japon ;
- une requête qui dépasse 45 s est retentée une fois, puis sautée. Le lieu
  est alors marqué « à compléter » ;
- classement : les sujets Wikidata par leur nombre de Wikipédias, la
  notoriété déjà utilisée (`geodata/notoriete.mjs`) ; les fichiers sans
  sujet après ;
- « Featured pictures » est écarté : de belles photos sans rapport avec le
  lieu (une bûche de Noël pour la France) ;
- pour une mer où le script donne moins de 3 bons candidats, Claude propose
  3 fichiers à la main (`geodata/photos/main.json`). Ils passent par les
  mêmes règles de licence, et par la même relecture ;
- 10 candidats par lieu vont à la relecture.

Volume : le besoin compte ≈ 1 200 photos. Avec ≈ 21 % de lieux pauvres
(3 sur 14, extrapolé : S51), ce sera plutôt **700 à 900** (estimé). Le
plancher est à l'utilisateur : D60.

### 3.2 Règle des licences

Mesuré par R5 sur 1 917 fichiers : 1 623 passent la règle.

Une photo est acceptée si **tout** est vrai :
- licence : CC0, domaine public, CC BY ou CC BY-SA (versions 2.0 à 4.0,
  variantes de pays comprises) ;
- ni NC, ni ND (on recadre), ni GFDL seule, ni « Attribution » sans texte,
  ni OGL, ni Free Art License : refusées, pour n'avoir qu'une règle
  d'affichage ;
- champs `NonFree` et `Restrictions` vides ;
- format JPEG, PNG, TIFF ou WebP ;
- 1 080 × 720 px au moins ;
- nom de fichier sans mot de carte, de drapeau, de logo ou de satellite.

Affichage, le même pour toutes, domaine public compris :
- sous la photo de la fiche et sous le plein écran : « Photo recadrée :
  {auteur} · {licence} · Commons ». La licence est un lien vers son texte,
  « Commons » un lien vers la page du fichier. « recadrée » dit la
  modification à côté de la photo, pas seulement dans Crédits ;
- une phrase dans Crédits : « Photos recadrées et réduites ; chacune garde
  la licence de son auteur. » CC BY demande de dire la modification ; CC
  BY-SA demande que la photo modifiée garde sa licence. Le code et les
  autres données ne changent pas de licence : c'est une collection (S54) ;
- une rubrique « Photos » dans Crédits, dépliée à la demande : chaque photo,
  **son titre ou son sujet** (CC BY et BY-SA 2.0 à 3.0 demandent le titre
  de l'œuvre s'il est fourni), son auteur, sa licence, son lien.

**L'auteur.** Commons donne deux champs : `Attribution`, la mention que
l'auteur exige quand il en a une, et `Artist`, du HTML. Le script demande
les deux (le relevé ne demandait pas `Attribution`, `photos/scripts/etape3.py:26`)
et **préfère `Attribution`**. Rien n'est injecté : balises retirées,
entités décodées, 80 caractères au plus.

Le nettoyage de R5 (`photos/scripts/credit.py`) ne suffit pas. Relancé ici
sur les 1 917 fichiers du relevé, il rend 9 fois « Auteur inconnu » pour une
licence BY ou BY-SA, et des textes qui ne sont pas des auteurs : « Own
work », « Unknown authorUnknown author… » (12 fois en tout), une adresse
web seule (4 fois). Or CC BY demande de nommer l'auteur. Règle :
- une photo CC BY ou CC BY-SA **sans auteur identifiable** est refusée ;
- ne sont pas des auteurs : un texte vide, « Own work », « Unknown » et ses
  variantes, « Anonymous », une adresse web seule ; la liste est écrite dans
  le script et dans le test ;
- une photo du domaine public ou CC0 sans auteur garde « Auteur inconnu ».

### 3.3 Traitement

- Outil : **Pillow** (12.1.1 sur le PC, WebP compris). `node_modules` n'a ni
  sharp ni paquet WebP. 0,31 s par photo, mesuré.
- Téléchargement : la miniature de **1 920 px** de Commons, jamais
  l'original (6,2 Mo en moyenne, 279 Mo au pire). Une requête à la fois, une
  seconde de pause, le User-Agent générique du projet. ≈ 55 min pour 1 200
  photos (estimé).
- Orientation d'abord (`exif_transpose`), puis recadrage **3:2**, au centre
  ou sur un point d'intérêt choisi dans l'outil, puis réduction (LANCZOS).
- Deux fichiers par photo, WebP qualité 60, `method=6` :

| Taille | Moyenne mesurée (6 photos de R5) | Besoin (9 autres photos) |
|---|---|---|
| vignette 480 × 320 | 19 Ko (8 à 34) | 20 Ko |
| plein écran 1 080 × 720 | 96 Ko (32 à 186) | 106 Ko |

Les deux mesures concordent. 900 photos font ≈ 105 Mo, 1 200 ≈ 138 Mo.

- Nom : les **10** premiers caractères hexadécimaux du SHA-256 du fichier
  WebP. `photos/v/<nom>.webp` et `photos/p/<nom>.webp`. Les drapeaux en ont
  8 ; à 2 400 fichiers, 10 rendent une collision négligeable. Un test
  échoue si deux noms se heurtent. L'adresse ne dit pas le lieu.
- Une photo qui sert à deux lieux n'est qu'un fichier (le piton des Neiges,
  à Cilaos et à Salazie).
- Texte alternatif : le nom du sujet (« château de Himeji »), pas celui du
  lieu ni celui du fichier ; sans sujet : « {lieu} : photo ». Corrigeable
  dans l'outil.
- Un encodeur WebP ne rend pas les mêmes octets d'une version à l'autre. Les
  WebP sont donc **gardés**, jamais refaits par le build. Le fichier des
  licences note l'empreinte de chacun.

### 3.4 Outil de relecture

`node geodata/photos/relecture.mjs` : un serveur local sans dépendance, sur
le port 8064, qui sert une page sans cache et écrit le fichier des choix.
C'est le modèle du niveau facile du quiz : un script propose, l'utilisateur
relit, le résultat est versionné.

- Un lieu par écran : son nom, sa sorte, « 3 sur 332 ».
- 10 candidats en grille. Chaque case montre la photo **telle qu'elle sera
  recadrée**, son sujet, son origine, sa licence. Une bande jaune signale un
  recadrage qui coupe plus de 30 % de l'image (21 % des candidats, mesuré).
- Les 5 premiers sont cochés d'avance pour un lieu riche : on relit par
  exception. **Rien n'est coché d'avance** pour une zone contestée, un
  territoire revendiqué ou un lieu pauvre (Mahbes au Sahara occidental, Gaza
  dans la Méditerranée) : chaque photo y est un choix. Un lieu validé moins
  de 2 s après son affichage demande une confirmation : une relecture trop
  rapide ne valide pas sans regarder (décision « Fiche d'un lieu » : photos
  relues par l'utilisateur).
- Les miniatures viennent de Commons, dans le navigateur de l'utilisateur.
  « Rien d'externe » vaut pour le site, pas pour cet outil.
- Clavier : `1` à `0` coche ou décoche ; `Entrée` valide et passe au lieu
  suivant ; `X` écarte avec une raison ; un clic fixe le point d'intérêt ;
  `R` remplace par un titre de Commons collé, soumis aux mêmes règles ; `P`
  marque le lieu « pauvre » ; `F` ne montre que les lieux pas encore relus.
- Chaque action enregistre, par un fichier temporaire puis un renommage.
  Fermer l'onglet ne perd rien ; on reprend où l'on s'est arrêté.
- **La règle de relecture est écrite en haut de la page** :
  - refuser les cartes, vues satellite, drapeaux, logos, schémas ;
  - refuser les scènes de conflit, les victimes, les militaires et les
    armes, les réunions politiques ;
  - refuser les visages en gros plan ;
  - refuser une photo prise dans un autre lieu ;
  - refuser une photo dont le sujet principal est un bâtiment ou une œuvre
    récents dans un pays sans liberté de panorama (France, Italie…) : leur
    auteur garde ses droits, quelle que soit la licence de la photo ;
  - pour une zone contestée : paysages et monuments seulement, sans drapeau
    ni signe d'une des parties.

  La bande de Gaza sortait parmi les premières photos de la Méditerranée, et
  des défilés militaires pour le Tchad. La règle suit la neutralité déjà
  actée ; l'utilisateur peut la changer dans le fichier de l'outil.

Fichiers, tous versionnés :

| Fichier | Contenu |
|---|---|
| `geodata/photos/candidats.json` | sortie du script, avec `extrait_le` |
| `geodata/photos/main.json` | propositions à la main, avec leur raison |
| `geodata/photos/choix.json` | par lieu : la date de relecture, les photos gardées (fichier, sujet, point d'intérêt), ou « pauvre » et sa raison ; les fichiers écartés et pourquoi |
| `geodata/photos/licences.json` | par photo gardée : auteur, licence, page, date, empreintes des deux WebP ; versions de Pillow et de libwebp |

Temps de l'utilisateur (estimé par R5) : 10 à 20 s par lieu riche, soit 1 à
2 h en tout ; 2 à 3 min par lieu pauvre, soit ≈ 3 h de plus si l'on veut les
remplir tous (D60). Sur le PC, au clavier. Le téléphone ne sert qu'à juger
le rendu final.

### 3.5 Livraison sur le site

- `public/photos/v/`, `public/photos/p/`, et **un petit fichier par lieu**,
  `photos/l/<id>.json` : pour chaque photo, son nom, son texte alternatif
  par langue, son auteur, sa licence, sa page. ≈ 0,3 Ko. Un fichier unique
  pour tous les lieux pèserait 30 à 60 Ko compressés (mesuré par R5 sur 168
  photos, extrapolé), payés dès la première fiche.
- Les listes par lieu et `photos/credits.json` ne sont **pas des fichiers
  gardés** : le build les écrit dans `dist/` depuis `choix.json` et
  `licences.json`, versionnés (`geodata/photos/listes.mjs`, appelé par
  `npm run build`). Ainsi la CI et un arbre de travail neuf les ont, et
  leurs tests tournent partout, avec ou sans les WebP.
- `firebase.json` : `/photos/v/**` et `/photos/p/**` en `immutable`, comme
  les drapeaux. Les listes suivent la règle des `.json` : `no-cache`.
- Chargement **une à une** : la liste à l'ouverture de la fiche ; la
  première vignette aussitôt ; chaque suivante quand elle entre à moitié
  dans le cadre ; le plein écran au toucher. `loading="lazy"` ne suffit pas :
  le navigateur charge en avance, sur une grande distance. Un
  `IntersectionObserver` sur le carrousel pose le `src`.
- Chaque `<img>` a sa place réservée (`aspect-ratio: 3 / 2`) : la fiche ne
  saute pas à l'arrivée d'une photo.
- Rubrique « Photos » de Crédits : `photos/credits.json`, lu quand on la
  déplie.

### 3.6 Service worker

Trois faits, vérifiés dans le code :
- le service worker ne sert et ne garde que les chemins de son manifeste
  (`sw/logique.ts:134`) ;
- le build met dans le manifeste **chaque fichier de `dist/`**
  (`vite.config.ts:63-72`). Sans rien faire, les photos y entreraient ;
- une nouvelle version reprend de l'ancienne tout fichier dont l'empreinte
  n'a pas changé (`reprendre`, `sw/logique.ts:241-257`). Un fichier du
  manifeste n'est donc pas retéléchargé après un déploiement.

Laisser faire coûte cher : mesuré en ajoutant 2 400 entrées au `sw.js` du
16/11 (`synthese/scripts/manifeste-photos.py`), il passe de 17,5 à 140 Ko
bruts, et de **6,1 à 41,4 Ko compressés**. Chaque visiteur paierait 35 Ko de
plus à sa première visite, et de nouveau après chaque déploiement. C'est
deux fois le poids de toutes les données des fiches, pour des photos qu'il
ne regardera peut-être pas.

Choix : **tout `/photos/` hors du manifeste**, avec ses propres règles.

| Chemin | Stratégie | Cache |
|---|---|---|
| `/photos/v/*.webp`, `/photos/p/*.webp` | le cache d'abord, sinon le réseau ; rangée après vérification : le début du SHA-256 du contenu égale le nom du fichier | `photos-terramemo-1`, à part |
| `/photos/**/*.json` | le réseau d'abord ; la copie du cache s'il est coupé | le même |

- Le nom du cache est **hors du préfixe** `terramemo-` (`PREFIXE_CACHE`,
  `sw/logique.ts:70`). Avec le préfixe, trois choses casseraient :
  `cachesPerimes` l'effacerait à l'activation (`:91-93`) ; `reprendre` le
  parcourrait à chaque installation (`:241-257`) ; et le `smoke` du pilote,
  qui veut un seul cache `terramemo-*` et lit le dernier
  (`driver.py:1072-1073`, `:1117`), échouerait. Hors du préfixe, aucun des
  trois ne le voit : rien à changer dans `cachesPerimes` ni dans le pilote.
- Le cache des photos **n'est donc pas effacé** à l'activation d'une
  version. Une photo ne change jamais sous un même nom.
- Il est borné : 400 fichiers. Au-delà, les plus anciens partent (S57).
- Une liste périmée peut citer une photo retirée du site : l'image manque,
  la fiche montre les autres. Rien ne casse.
- `dresserManifeste` ignore `photos/`, et le build ne lit plus ces fichiers
  pour dresser le manifeste : 140 Mo de moins à lire à chaque build
  (`writeBundle` lit aujourd'hui tout `dist/` en mémoire,
  `vite.config.ts:63-72`). Restent deux coûts : Vite copie `public/` dans
  `dist/` à chaque build (105 à 138 Mo de photos), et le `predeploy` actuel
  fait un `grep -rl` sur tout `dist/` (`firebase.json:3`). Le second exclut
  `photos/` (`--exclude-dir=photos`). Le premier est à mesurer au lot P2
  (estimé : une à deux secondes sur le SSD du PC) ; s'il dépasse 5 s, les
  WebP sortent de `public/` et ne sont copiés dans `dist/` qu'au
  déploiement.

Les fichiers de données des fiches, eux, restent dans le manifeste : six
entrées. Ils sont rangés à l'usage, comme la couche des mers, et repris
d'une version à l'autre.

### 3.7 APK

L'APK embarque `dist/` en entier et n'a pas de service worker.

- Choix du besoin, confirmé : **les vignettes et les listes dans l'APK, le
  plein écran en ligne**. Vignettes : 15 à 23 Mo de plus selon le volume
  (19 Ko chacune ; l'APK pèse 5,1 Mo aujourd'hui). Tout embarquer ferait
  ≈ 145 Mo : trop lourd, et un APK de 145 Mo à chaque mise à jour.
- Build de l'APK : `dist/photos/p/` est retiré avant `npx cap sync`
  (`android.yml:43`, et la commande du PC dans le skill `run-terramemo`).
- Dans l'APK, l'adresse du plein écran est absolue :
  `https://terramemo-geo.web.app/photos/p/<nom>.webp`. La constante du site
  existe (`SITE_EXPORT`, `sync/export.ts:24`) : elle prend un nom commun.
  `index.html` n'a pas de CSP : l'image se charge.
- Hors ligne, ou photo retirée du site : « Photo en grand : indisponible
  hors ligne ». La vignette reste.
- Le cache HTTP de la WebView garde les pleins écrans déjà vus (S53).
- L'APK dépend du site pour le plein écran seulement. C'est le choix déjà
  fait par l'utilisateur.

### 3.8 Où vivent les fichiers, et les versions de Hosting

**Le dépôt.** Il est public et pèse 63 Mo (`du -sh .git`). Y mettre 105 à
138 Mo de WebP le triple, pour toujours : git ne rend pas la place d'une
photo remplacée. C'est D59. En attendant, les WebP sont **hors de git** :
`public/photos/` est ignoré, une copie va sous
`~/Sauvegardes/terramemo/photos/`, et le site déployé en est une troisième.
Les choix et les licences, eux, sont versionnés dans tous les cas.

**Un arbre de travail neuf n'a aucune photo.** C'est le cas d'un `git
worktree`, la convention du dossier pour un travail long, et de la CI. D'où :
- `npm run photos:restaurer` copie les WebP de
  `~/Sauvegardes/terramemo/photos/` dans `public/photos/`, puis vérifie
  leurs empreintes contre `licences.json`. Le skill `run-terramemo` le dit
  dans sa section sur les arbres de travail, et le lance avant un build qui
  sera déployé ;
- les listes et `credits.json` sont écrits par le build depuis les fichiers
  versionnés (§ 3.5) : leurs tests tournent en CI sans les WebP ;
- avec D59 d (archive jointe à une release GitHub), `photos:restaurer`
  télécharge l'archive quand la copie du PC manque, et la CI aussi.

Garde du déploiement : `firebase deploy` retire du site ce qui manque dans
`dist/`. Le `predeploy` lance donc `node geodata/photos/verifier.mjs
--dist` : il échoue si une photo citée dans `licences.json` manque ou n'a
pas son empreinte.

**Hosting garde chaque version déployée**, et Terramemo se déploie plusieurs
fois par jour. Avant le premier déploiement des photos, l'utilisateur borne
le nombre de versions gardées à 10 (console de Firebase, Hosting, historique
des versions, « Release storage settings ») : 1,4 Go au plus, sur 10 Go.
Deux points restent à lire dans la console après un premier déploiement
d'essai : si un fichier inchangé compte une fois ou à chaque version (S49),
et s'il existe une limite de fichiers par site (S48 ; 2 400 à 3 000 fichiers
avec les photos, ≈ 250 aujourd'hui).

**Retrait par Commons.** Une photo supprimée de Commons pour violation de
droits en devient une chez nous. `node geodata/photos/verifier.mjs --reseau`
demande à l'API, par lots de 50, si chaque fichier existe toujours avec la
même licence : 24 requêtes pour 1 200 photos. Il se lance à la main, avant
chaque déploiement qui change les photos. Pas en CI (réseau), pas sur le Pi.

## 4. Interface

### 4.1 La barre

Structure nouvelle de `#barre-carte` :
- un bouton `button.barre-fiche` qui contient trois lignes :
  1. le nom, puis le statut et « par sa pastille » (comme aujourd'hui) ;
  2. **la ligne de faits** (`span.barre-faits`) ;
  3. la ligne de la mémoire, si le réglage « Carte de la mémoire » est
     actif (comme aujourd'hui) ;
- un chevron « ⌃ » à droite du bouton, quand le lieu a une fiche ;
- le bouton « Monde », inchangé, hors du bouton ;
- une région `aria-live="polite"` cachée à l'œil, qui reçoit le texte à
  annoncer. `aria-live` quitte la barre : un bouton dans une région vivante
  est annoncé en entier à chaque toucher.

Les classes `.barre-nom` et `.barre-detail`, l'id et `dataset.id` restent :
les tests et le pilote les lisent.

Ligne de faits, par sorte :

| Sorte | Ligne |
|---|---|
| Pays | « Tokyo · 123 millions d'hab. » ; plusieurs capitales : « La Paz, Sucre · … » |
| Territoire | « Nuuk · 56 800 hab. » ; sans capitale : les habitants seuls |
| Zone contestée, Antarctique | rien |
| Mer | « océan Atlantique · 2,5 millions de km² » ; un océan : sa superficie |
| Commune | « 85 000 hab. » |

Hauteur : la barre réserve **la hauteur de son cas complet** dès qu'un lieu
est affiché (`min-height`) : trois lignes si le réglage « Carte de la
mémoire » est actif (nom, faits, mémoire), deux sinon. La barre est en
`flex-wrap` (`carte.css:316-335`) : sans cette réserve, elle passerait de 2 à
3 lignes à l'arrivée des faits. La ligne de faits arrive après le toucher,
quand le fichier est lu : elle remplit une place déjà là. La carte ne bouge
pas, et le lieu montré juste au-dessus de la barre n'est pas recouvert :
`montrer()` lit le haut de la barre au moment du vol
(`barre.getBoundingClientRect().top`, `vues/explorer.ts:220`). Un nom long
sur deux lignes reste possible : le test mesure la barre la plus haute des
258 noms à 384 px, et la réserve suit.

Sous la fiche ouverte, la barre **reste mise en page** (`inert`, jamais
`[hidden]`) : `[hidden]` vaut `display: none !important` (`style.css:70`),
et `montrer()` lirait alors un haut de 0 pour le vol d'un voisin.

Tant que les données ne sont pas là (premier toucher, hors ligne), la barre
est celle d'aujourd'hui, sans chevron. Elle ne promet pas une fiche qu'elle
ne peut pas ouvrir. De même tant qu'une partie de Toucher attend d'être
reprise (§ 4.8) : ni faits, ni chevron. La ligne de faits donne la capitale.

Nombres : trois chiffres au plus, dans une fonction par langue
(`fiches/format.ts`) : « 123 millions », « 68,7 millions », « 5,41
millions », « 56 800 », « 836 ». La fiche donne le nombre entier.

### 4.2 La fiche

**Deux états** : la barre, ou la fiche ouverte. Pas d'état à mi-hauteur.

- La fiche est une feuille posée dans `#app`, sous l'en-tête, au-dessus de
  la carte : à 8 px des bords sur le téléphone, 12 px sur PC, 640 px de
  large au plus, centrée. Elle défile (`overflow: auto`,
  `overscroll-behavior: contain`).
- **Opaque** (`var(--panel)`), sans `backdrop-filter`. Un flou sous une
  grande feuille se recalcule dès que la carte change dessous.
- Elle s'ouvre par `transform: translateY`, en 200 ms, sous `@media
  (prefers-reduced-motion: no-preference)`. Sinon elle apparaît d'un coup.
- **La carte ne se recadre pas** à l'ouverture. À la fermeture, elle est où
  on l'a laissée, la zone toujours allumée.
- Sur l'île, la fiche commence à 40 px du haut, comme le bilan
  (`carte.css:501-504`) : la mention de l'IGN reste lisible.
- L'en-tête du site reste utilisable. Jouer et 🏆 changent de vue, ce qui
  ferme la fiche. ⚙ n'est pas une vue : c'est une popup (`main.ts:201-216`).
  Elle s'ouvre par-dessus la fiche, sans la fermer ; seuls ses liens qui
  changent de vue (Crédits, l'Essai J0) la ferment. La recherche montre un
  autre lieu, ce qui ferme la fiche aussi.
- Autour de la fiche, la carte reste visible : 8 px sur le téléphone, et
  des deux côtés sur PC. Un **voile** transparent la couvre tant que la
  fiche est ouverte. Un toucher ou un clic sur le voile ferme la fiche, et
  rien d'autre : ni lieu touché, ni glissé, ni pincement. Sans voile, le
  pincement sur un bord zoomerait sous la fiche (`map/carte-canvas.ts:559-590`
  écoute l'hôte entier). Le clic suivant touche la carte, comme avant.
- Les boutons de zoom sont posés après les vues, donc par-dessus elles
  (`main.ts:858`, `carte.css:276-313`). Dans une fenêtre étroite, ils
  passeraient sur la fiche. Ils sont cachés tant qu'elle est ouverte, et les
  touches + et − n'y font rien : `zoom-carte.ts:54-66` les ignore déjà quand
  l'écran de connexion est ouvert, et fait de même avec la fiche
  (`body.dataset.fiche`).

Trois états de feuille (à mi-hauteur, avec la carte recadrée au-dessus) ont
été écartés : chaque changement de hauteur relance un vol de carte pendant
le geste, donc des à-coups probables, pour une taille L.

Contenu, de haut en bas :

1. **Tête**, collée en haut : « × » à droite ; « ‹ » à gauche s'il y a une
   fiche d'avant ou un bilan ; le drapeau (64 × 48) ; le nom ; le statut
   s'il y en a un.
2. **Photos** (lot P2) : un carrousel 3:2 sur toute la largeur, avec son
   crédit dessous.
3. **Faits** : une liste de lignes « libellé · valeur ». Une ligne sans
   donnée n'existe pas.
4. **Voisins** (ou pays riverains, ou communes voisines) : des boutons.
5. **Mémoire** : une ligne par sujet, puis « Apprendre ce lieu » (§ 5).
6. **Pied** : « Voir sur Wikipédia ↗ », puis « Sources : … · Crédits ».

Lignes de faits d'un pays, dans l'ordre :

| Libellé | Exemple |
|---|---|
| Capitale | « Tokyo » ; « La Paz et Sucre » |
| Habitants | « 123 366 734 (2025) » |
| Superficie | « 377 974 km² » |
| Langues | selon D56 |
| Monnaie | « yen japonais » |
| Gentilé | « les Japonais » |
| Heure à Tokyo | « 16 h 20 · +5 h » ; « même heure qu'ici » ; puis « 11 fuseaux dans le pays » s'il y en a plusieurs |
| Continent | « Asie · Asie de l'Est » |
| Point culminant | « mont Fuji, 3 776 m » (après la table : Wikidata dit 3 777, § 2.1) |
| Fête nationale | « 23 février · anniversaire de l'empereur » |

Une mer : sorte et océan (« mer bordière de l'océan Atlantique », « mer
intérieure »), mère, superficie, profondeur maximale. Une commune :
habitants (« recensement de 2023 »), superficie, gentilé, intercommunalité.

L'heure se recalcule toutes les 30 s tant que la fiche est ouverte. Si le
navigateur ne connaît pas la zone (`RangeError`), la ligne est retirée.

Le pied « Sources » nomme les sources de ce que la fiche montre : « Banque
mondiale (habitants) · Wikidata · Unicode CLDR ». « Crédits » mène à l'écran
Crédits.

Le lien Wikipédia est un vrai lien sortant (`target="_blank"`,
`rel="noopener"`), comme ceux de Crédits. C'est l'utilisateur qui le suit :
la règle « rien d'externe » porte sur ce que la page charge.

### 4.3 Gestes

- **Ouvrir** : un toucher sur la barre (l'événement `click`), ou un glissé
  vers le haut de 24 px ou plus, commencé sur la barre.
- **Fermer** : « × », un toucher sur le voile, ou un glissé vers le bas de
  60 px ou plus, commencé sur la tête de la fiche. Le contenu, lui, défile
  normalement.
- **Échap** fait comme « ‹ » : un pas en arrière (§ 4.4). Si la popup ⚙
  est ouverte, Échap ne ferme qu'elle : l'écouteur global de `main.ts`
  (`:215-217`) la ferme déjà. Celui de la fiche est posé en phase de
  capture, donc lu avant, et ne fait rien quand la popup est ouverte.
- La barre et la tête de la fiche ont `touch-action: none` : le navigateur
  ne garde pas le geste pour lui.
- La feuille ne suit pas le doigt : un seuil, puis l'animation. C'est plus
  simple, et rien ne se redessine pendant le geste.
- **Aucun conflit avec la carte** : la barre, le voile et la fiche sont des
  frères de l'hôte de la carte dans `#app`. Leurs événements ne
  l'atteignent pas, et inversement (`vues/explorer.ts:102`,
  `map/carte-canvas.ts:559-590`).
- Le toucher à côté ferme, mais ne devient jamais un toucher sur la carte :
  le voile le prend (§ 4.2).
- Le geste système d'Android (glisser depuis le bord du bas) part de plus
  bas que la barre, qui est à 8 px du bord plus la marge de sécurité : S44.

### 4.4 « × », « ‹ », les retours d'Android et du navigateur

La décision « Croix vers la carte » s'applique telle quelle : la « × » mène
à la carte, les « Retour » à la vue d'avant.

**Une seule règle, l'historique.** Chaque fiche ouverte est une entrée
d'historique : la première, chaque voisin, et le plein écran d'une photo.
Tous les gestes « retour » font donc la même chose, `history.back()`.

| Commande | Depuis la carte | Depuis un bilan |
|---|---|---|
| « × » (`croix()`, « Retour à la carte ») | ferme la fiche (toutes les entrées de fiche remontées) ; la barre et la zone allumée restent | pareil : on est sur la carte, le lieu montré ; le bilan reste joignable par le retour arrière |
| « ‹ », Échap, retour d'Android, retour du navigateur | un pas : le plein écran se ferme, sinon la fiche d'avant, sinon la fiche se ferme | pareil, et après la première fiche, **retour au bilan** ; « ‹ » dit alors « Retour au bilan » |

Pourquoi ce n'est pas un lot à part (l'ancien F8) : sans lui, le retour du
navigateur ne ferme pas la fiche, il quitte la carte. La carte est
l'accueil, donc souvent la première page de l'historique : le geste peut
faire sortir du site. Sur le téléphone, c'est le réflexe pour fermer une
feuille, et le public n'a que le site (décision « Diffusion »). L'entrée
d'historique fait donc partie du **lot F1**, avant le premier déploiement.

Mécanique, dans `navigation.ts` et nulle part ailleurs :
- `nav.pousserFiche(etat)` : un `pushState` sur la même adresse `#carte`,
  avec l'état `{ pile, fiche }`. La pile y est mise à jour comme dans
  `pousser()` (`navigation.ts:170-174`). Un `pushState` posé hors de
  `navigation.ts` laisserait `pileRendue` à l'ancienne entrée : « ‹ Retour
  au bilan » ferait `go(-1)` (`remonter`, `:176-186`, `pasVers` dans
  `vues/arbre.ts:342-345`) vers l'entrée `#carte`, égale à `traversee`, que
  `router()` ignore (`:135-137`). On resterait bloqué sur la carte ;
- `nav.quitterFiches()` : `go(-n)`, n étant le nombre d'entrées de fiche au
  sommet. C'est la « × » ;
- `router()` lit `etat.fiche` avant le test de `traversee`, et le rend à la
  vue carte : `explorer.surFiche(etat.fiche ?? null)` ouvre la fiche dite,
  ou la ferme ;
- « ‹ Retour au bilan » reste `nav.retour()` : la pile compte les entrées
  de fiche, `pasVers` les remonte toutes d'un coup ;
- au-delà de `PILE_MAX` (40, `navigation.ts:92`) voisins, la pile perd ses
  plus vieilles entrées : « Retour au bilan » repasse alors par
  `replaceState`, comme aujourd'hui. Cas rare, testé.

Le retour d'Android : `brancherRetourAndroid(() => accueil?.retour() ??
null)` (`main.ts:396`) ne change pas. L'écran de connexion garde la
priorité ; ensuite, `history.back()` (`retour-android.ts:38-43`). Il n'y a
**pas** de `explorer.retourFiche()` qui fermerait la fiche en rendant
`'fait'` : l'entrée de la fiche resterait dans l'historique, et le retour
suivant ne montrerait rien.

- Pas de lien partageable vers une fiche (`#carte/JPN`) : hors de la
  demande. L'état `fiche` vit dans `history.state`, pas dans l'adresse.

R1 proposait que la « × » ramène au bilan. La décision « Croix vers la
carte » tranche déjà : la proposition est écartée (§ 10), sans question.

### 4.5 Voisins

- Chaque voisin est un bouton de 44 px de haut au moins.
- Le toucher : `montrerLieu(terrain, id)` allume le voisin et fait voler la
  carte, **sous** la fiche ; la fiche est remplacée par celle du voisin ; son
  titre reçoit le focus et son nom est annoncé.
- Une **pile de fiches** garde le chemin : c'est l'historique (§ 4.4).
  « ‹ » revient à la fiche d'avant, et remontre son lieu. Sans pile, aller
  de voisin en voisin est un piège.
- À la fermeture, la carte est déjà sur le dernier lieu vu.
- `montrerLieu` passe par `aller()`, qui vide la barre
  (`vues/explorer.ts:202-207`) : la fiche reste ouverte pendant ce passage.
- Sur le téléphone, le vol dessine la carte sous une feuille opaque : on ne
  le voit pas. Or le besoin donne aux voisins cet intérêt : leur toucher
  « fait voler la carte jusqu'à eux ». Et la fiche ne montre jamais où est
  le lieu, ce qui aide le plus à retenir. Le choix touche un choix accepté :
  **D61**. En attendant, le code fait ce qui est décrit ici (D61 c).
- S'il donne des à-coups dans la fiche (S55), `carte.montrer` gagne une
  option « sans vol », déjà codée pour la réduction des mouvements :
  `poserProgramme` au lieu du vol (`voler`, `map/carte-canvas.ts:833`).
- Une mer : son océan, sa mère et ses pays riverains se touchent de même. Un
  pays riverain ouvre une fiche de pays : le terrain reste le monde.
- Rien ne relie le monde et l'île : La Réunion n'est pas une entité de
  `pays.json`.

### 4.6 Depuis le bilan

Le lieu juste d'une erreur ouvre sa fiche. La partie est finie.

- Chaque ligne d'erreur devient **un bouton entier** : `ligneFiche(id,
  texte, ouvrir)`, dans `vues/commun.ts`. Le texte reste la chaîne
  d'aujourd'hui ; aucun modèle de `textes.fr.json` n'est coupé. 44 px de
  haut au moins, un chevron à droite, `aria-label` : « Fiche : {nom}. {texte
  de la ligne} ».
- Cinq bilans : Trouver (`vues/essai.ts:683-697`), Reconnaître
  (`nommer.ts`), les épreuves (`vues/chrono.ts`), le quiz (`vues/quiz.ts`),
  la séance (`vues/seance.ts`). La carte retournée passe par le bilan de la
  séance.
- L'id est celui du lieu juste. Sous Capitales et Drapeaux, c'est le pays :
  sa fiche. Sous Reconnaître, c'est la cible, pas le leurre choisi.
- La ligne « Nouveaux : Togo, Ghana… » d'une séance reste du texte : ce ne
  sont pas des erreurs.
- Le chemin est celui de la recherche : `nav.pousser('carte')`, puis
  `montrerLieu`, puis la fiche. La vue de partie garde son bilan
  (`bilanAuRetour`) et le rend à `nav.retour()`. Vérifié : `nav.retour()`
  revient à la vue de partie tant qu'elle a un bilan à montrer
  (`navigation.ts:198-202`), et elle remet son terrain, l'île comprise
  (`vues/essai.ts:753-755`).
- Le rappel arrive par `ctx.ouvrirFiche?(terrain, id)`, optionnel dans
  `ContexteVue`, comme `finDePartie`. Sans lui, les lignes restent du
  texte : les tests de vue d'aujourd'hui ne changent pas.
- La fiche montre le lieu sur la carte. C'est ce que demandait l'erreur d'un
  « où est… ». Une fiche posée par-dessus le bilan, sans carte, a été
  écartée pour cela.

### 4.7 Recherche

Elle mène à **la barre**, comme aujourd'hui : le lieu s'allume, la carte
vole, la barre donne ses faits. La fiche est le geste d'après. C'est la
lettre du besoin : « elle montre le lieu, donc sa barre ». Ouvrir la fiche
tout de suite poserait une feuille plein écran au moment où le clavier se
ferme, et cacherait le lieu qu'on vient de chercher.

Une capitale cherchée montre son pays, avec un anneau sur la ville : la
barre est celle du pays. `tests/recherche.test.ts` ne change pas.

### 4.8 Jamais pendant une partie

La fiche donne la capitale et le drapeau. Quatre gardes :

1. **La fiche vit dans la vue « carte »**, qui n'est pas active pendant une
   question. `desactiver()` la ferme, comme il efface les marques.
2. **Une seule liste des barres de partie.** `BARRES_PARTIE`, dans
   `vues/commun.ts` : `barre-essai`, `barre-nommer`, `barre-chrono`,
   `barre-quiz`, `barre-retournee`. Un test lit `carte.css` et vérifie que
   la règle qui efface la recherche (`carte.css:408`) cite exactement cette
   liste. Aujourd'hui rien ne la teste : un sixième mode oublié laisserait
   la recherche, donc la fiche, pendant une partie.
3. **La partie en suspens.** Une partie de Toucher quittée en cours de route
   attend sur la carte, barre cachée, et reprend sur la même question
   (§ 1). La vue de Toucher gagne `enSuspens()` : vrai si une partie y
   attend (`nommer.enCours`, `retournee.enCours`, ou des cibles pas
   finies), faux pour un bilan à remontrer. C'est `aMontrer()`
   (`vues/essai.ts:739`) sans `bilanAuRetour`. Tant qu'il est vrai, la
   carte ne montre ni fiche, ni chevron, ni ligne de faits. Le Chrono et le
   quiz abandonnent leur partie au départ : rien à garder pour eux.
4. **`ficheAutorisee()`**, dans `main.ts` : faux si une barre de la liste
   est visible, ou si `essai.enSuspens()`. `ctx.ouvrirFiche` et la barre le
   lisent. Les lignes touchables n'existent que dans un bilan : c'est une
   ceinture en plus.

Une fuite existe déjà, hors du ticket : pendant une partie en suspens, la
carte et la recherche donnent le **nom** des lieux touchés. On peut y
chercher le Togo d'un « Où est le Togo ? ». Avec ces gardes, la fiche n'y
ajoute ni capitale ni drapeau. Non retenu ici ; à reprendre si l'utilisateur veut fermer la carte
tant qu'une partie attend.

Un `etatPartie` commun aux cinq vues serait plus propre. Il touche cinq vues
et la feuille de style : hors du ticket (§ 10).

### 4.9 Sorte d'un lieu

`sorteDeLieu(id, terrain, statut)`, pure, dans `fiches/sorte.ts` :

| Rend | Quand |
|---|---|
| `mer` | `estIdMer(id)` (`map/mers.ts:146`) |
| `commune` | le terrain est `reunion` |
| `pays` | statut `jouable` ou `optionnel` |
| `territoire` | statut `territoire` |
| `zone` | statut `conteste` |
| `continent` | statut `autre` |

Elle ne charge rien : la barre sait quoi demander avant d'avoir les données.
Un test la confronte aux fichiers de fiches : chaque lieu des 258 + 50 + 24
a une entrée de la bonne sorte.

### 4.10 Hors ligne

- Site : les fichiers de fiches sont dans le manifeste. Lus une fois, ils
  restent, d'une version à l'autre. La fiche d'un lieu jamais chargé en
  ligne : pas de ligne de faits, pas de chevron.
- Photos : celles déjà vues viennent du cache à part. Les autres : la place
  reste vide, puis le carrousel se retire s'il n'a aucune photo.
- APK : données, listes et vignettes sont embarquées. Seul le plein écran
  demande le réseau.
- L'heure locale ne demande pas le réseau.

### 4.11 Accessibilité

- La carte n'a pas d'équivalent au clavier : la recherche est le seul chemin
  vers un lieu. Recherche, barre, fiche : tout le parcours se fait au
  clavier.
- La barre est un vrai `<button>` : Entrée et Espace l'ouvrent.
  `aria-expanded`, `aria-controls`.
- La fiche : `role="dialog"`, `aria-labelledby` son titre, sans
  `aria-modal` : l'en-tête reste utilisable. À l'ouverture, le focus va au
  titre (`tabindex="-1"`). À la fermeture, il revient à la barre, ou à la
  ligne du bilan d'où l'on vient.
- Échap fait comme « ‹ » : un pas en arrière (§ 4.3, § 4.4).
- Les faits sont une liste de définitions (`dl`). Les voisins, une liste de
  boutons avec un titre.
- Photos : texte alternatif ; le crédit est du texte, pas une infobulle.
- Cibles : 44 px au moins.
- Contraste : le gris `--muted` (`#91949b`) sur `--panel` (`#111214`)
  donne 6,17 (mesuré, formule WCAG sur les jetons de `style.css:12-18`) :
  au-dessus de 4,5, les libellés de 0,85 rem le gardent. S59 est close.
- Un seul thème, sombre. La fiche n'emploie que les jetons de `style.css`.

### 4.12 Téléphone

- 384 × 832 px CSS, la taille du pilote. La fiche prend toute la largeur
  moins 16 px.
- Les faits : libellé au-dessus de la valeur quand la ligne ne tient pas.
- Le carrousel défile par accrochage (`scroll-snap`), un doigt, à
  l'horizontale. Le défilement vertical de la fiche n'est pas gêné
  (`touch-action: pan-x` sur le carrousel, `pan-y` sur le reste).
- Le plein écran d'une photo couvre la fiche. C'est une entrée
  d'historique (§ 4.4) : un toucher, « × », Échap ou un retour le ferment
  par `history.back()`, et la fiche reste.
- Les marges de sécurité du téléphone (`env(safe-area-inset-*)`) sont déjà
  sur `body` (`style.css:74-91`), donc autour de `#app`.
- PC : textes un peu plus grands au-delà de 700 px, comme le panneau de
  Jouer.

L'interface suit le skill `nouveau-projet` (style commun), relu avant les
lots F1 et P1.

## 5. « Apprendre ce lieu »

### 5.1 Ce que fait le bouton

Il fait passer **la grappe qui contient le lieu** en tête de son sujet, puis
ouvre Apprendre sur elle. Le lieu arrive avec ses 4 à 8 voisins de grappe.

Mesuré par R2 (`releves/r2-grappes.mts`) :

| Sujet | Grappes | Taille |
|---|---|---|
| Pays | 31 | 5 à 9, 6,3 en moyenne |
| Océans et mers | 7 | 5 à 9 |
| Communes | 4 | 6 |

Ce que le bouton fait gagner dépend du chemin, car il y a deux ordres
(mesuré, `correction/rang-serie.mts` sur `grappesPays` et `pays.json`) :

| Chemin | Ordre des grappes | Japon | Australie | France | Maurice |
|---|---|---|---|---|---|
| Apprendre, sur une série (`vues/seance.ts:267` filtre par continent) | celui de la série : 2 à 8 grappes | 1re sur 8 (Asie) | 1re sur 2 (Océanie) | 2e sur 7 (Europe) | 8e sur 8 (Afrique) |
| Révision du jour (`vues/seance.ts:277`, toutes les grappes) | global : 31 grappes | 22e | 30e | 2e | 21e |

La rédaction ne citait que l'ordre global. Or le bouton lance Apprendre sur
la série du lieu. Pour qui joue Apprendre sur cette série, le gain est
donc petit : **0 à 7 jours** (Afrique, Asie : 8 grappes). Ce que le bouton
apporte d'abord, c'est le chemin : on passe de la fiche à la séance sans
choisir sujet et série dans Jouer. Le gain en jours compte surtout pour qui
n'ouvre que la Révision du jour : là, le Japon attendrait 22 jours. C'est
l'objet de D58 b.

Ajouter le lieu seul à la grappe qui venait a été écarté : la grappe
perdrait son voisinage, dépasserait 9 lieux, et le rappel ne pourrait plus
cadrer une région (`srs/seance.ts`).

Le libellé le dit : « Apprendre ce lieu », et dessous « avec 6 pays
voisins ».

### 5.2 Dans le budget, par le code qui existe

- `grappeSuivante(etat, grappes, domaine, pret?, prefere?)`
  (`srs/planif.ts:165`) : après la règle « une grappe entamée se finit
  d'abord », la grappe qui contient `prefere` passe avant les autres.
- `OptionsProgramme.prefere` le transmet. **La cascade de `programme` ne
  change pas** (`srs/planif.ts:350-363`) : révisions dues, plafond du jour, grappe déjà
  faite, introductions en attente s'appliquent comme avant. Le bouton ne
  peut pas ouvrir une seconde grappe le même jour : c'est la décision
  « Apprendre et Révision du jour ».
- `prefere` est un paramètre : la fonction reste pure et testable.
- `DemandeSeance` gagne `lieu?: string` (`vues/essai.ts:112`).
  `vues/seance.ts` le passe à `programme` (`blocs`, `:264-269`). La série est
  celle de la grappe : son continent pour un pays, la série des mers, celle
  de La Réunion.
- Lancement : **par `lancer()` de `main.ts`**, comme Jouer
  (`main.ts:788-794`). La fiche construit un `Lancement` Apprendre complet
  (branche, sujet, série, `mode: 'apprendre'`) avec `lieu` en plus.
  `lancer()` attend alors `memoire.pret` si la mémoire est en lecture, garde
  la dernière partie (`garderDerniere`, sans `lieu`), ouvre la vue de
  partie, puis `essai.lancer` pose `lancement` (`vues/essai.ts:726-728`) et
  passe `lieu` à `lancerSeance`. Un `essai.apprendreLieu` à part sauterait
  tout cela : il n'attendrait pas la mémoire, et `lancement` resterait celui
  de la partie d'avant. Au bilan, « Autre série » et `redirection()`
  (`vues/essai.ts:229`, `:742`) mèneraient à la mauvaise série de Jouer.
- La couche des mers ou l'île se chargent par le chemin qui existe
  (`vues/essai.ts:395-419`).
- **Rien au journal, rien aux lots, rien aux règles.** Un type d'événement
  de plus rendrait illisible, pour un ancien client, le lot entier qui le
  porte (`sync/lots.ts:156-195`), et le format interdit d'en ajouter tant
  que `v` vaut 1 (`sync/lots.ts:21-22`).

### 5.3 Quelles fiches pour un pays

**Son nom seul** : `pays:X:localiser` aujourd'hui, `pays:X:nommer` au plus
tôt le lendemain. C'est Apprendre Pays, sur une grappe choisie.

La capitale et le drapeau le même jour ont été écartés :
- ≈ 40 questions dans la séance au lieu de ≈ 13 (estimé : 6,3 pays, trois
  sujets) ;
- ils violent l'ordre « pays d'abord » : les pays ne seraient appris que le
  jour même, et Apprendre donnerait son conseil (`srs/planif.ts:185-189`) ;
- le lendemain, ≈ 19 fiches « Reconnaître » se présentent pour 15 permises ;
  la règle du reliquat ferme alors les trois sujets.

La fiche montre l'état de chaque sujet (§ 5.5) : on voit que la capitale et
le drapeau restent à apprendre. Un second bouton pour eux, une fois le pays
appris, est noté au § 10. L'utilisateur peut renverser ce choix : D58 b.

### 5.4 États du bouton

L'état vient de **la fabrique des séances**, pas d'une fonction à côté de
`programme`. Une fonction à part referait le travail de `blocs()` et de
`ouvrir()` (`vues/seance.ts:263-269`, `:340-378`) : filtre par série,
`pretSelon`, `info.toutes`, données des mers et de l'île pas chargées
(`info` vaut `null`, `:216-230`), textes de refus. Elle pourrait donc
promettre autre chose que la séance.

- Le refus d'`ouvrir()` sort dans une fonction, `refusDe(blocs, demande)`,
  que `ouvrir()` et `comptes()` partagent.
- `seances.comptes({ sorte: 'apprendre', sujet, serie, lieu })` rend alors,
  en plus d'`aRevoir` et `nouveaux`, le refus éventuel. Rien n'est ouvert,
  rien n'est écrit.
- La fiche ne lit que cela. Elle ne connaît ni `programme` ni les grappes.

| État | Condition | Ce que la fiche montre |
|---|---|---|
| pas de mémoire | territoire, zone, Taïwan, Kosovo, Antarctique : aucune grappe (`srs/grappes.ts:266`) | rien |
| mémoire en lecture | `memoire.charge` faux : `comptes()` rend `null` (`vues/seance.ts:341`) | le bouton, sans compte ; un toucher attend `memoire.pret`, comme `lancer()` |
| mémoire pas gardée | `memoire.garde` faux (dépôt de l'appareil fermé, `journal/memoire.ts:41`) | le bouton, et l'avis qui existe : les progrès ne survivront pas à la page |
| données pas chargées | mers ou île : `info` nul tant que leur couche n'est pas lue | le bouton ; la séance charge par le chemin qui existe, ou dit son refus (`textes.toucher.echec_*`) |
| appris | `introduite(etat, domaine, id)` | pas de bouton ; la ligne de la mémoire suffit |
| possible | la grappe du lieu est celle que `programme` rend | « Apprendre ce lieu · avec 6 pays voisins » |
| après des révisions | pareil, avec des révisions dues qui tiennent dans la séance | le même bouton, et « après 12 révisions » |
| révisions d'abord | `sansNouveautes` vaut `dues` ou `plafond` | « Des révisions attendent : fais d'abord la Révision du jour. » |
| grappe du jour faite | `grappe_faite` | « La grappe du jour est déjà apprise : celle-ci demain. » (défaut de D58) |
| une grappe à finir | une autre grappe entamée passe avant | « Une région commencée se finit d'abord. » |
| assez de nouveautés | `introductions` | le texte qui existe (`textes.seance`) |

Deux effets à connaître :
- après une séance, les erreurs du bilan sont des lieux déjà notés, donc
  appris : pas de bouton. Il sert après une partie hors mémoire
  (Entraînement, épreuve, quiz) ;
- un utilisateur assidu a souvent fait sa grappe avant de flâner sur la
  carte. Le bouton lui dira « demain » presque toujours. C'est l'objet de
  D58.

### 5.5 Lignes de la mémoire

Dans la fiche, une ligne par sujet du lieu, lues par `memoireEntite`
(`srs/planif.ts:415`) :

- un pays : « Pays : vu 4 fois · revient dans 5 j », « Capitale : jamais
  vue », « Drapeau : jamais vu » ;
- une mer, une commune : une ligne.

Les textes existent (`textes.memoire`, `textes.sujets.*.memoire`). La barre
ne change pas : elle suit le réglage « Carte de la mémoire », comme
aujourd'hui. **La fiche montre ces lignes même réglage coupé** : le réglage
parle de la teinte de la carte, et le bouton « Apprendre » n'a pas de sens
sans l'état qu'il change. Un lieu sans mémoire possible n'a pas de bloc.

### 5.6 Se souvenir du lieu jusqu'au lendemain (D58)

Si l'utilisateur le veut : la préférence va dans `localStorage`, une clé par
sujet (`terramemo.apprendre.<sujet>`), qui garde **l'id du lieu**, jamais
celui d'une grappe (les grappes changent avec les données).

- Apprendre du sujet la lit. La Révision du jour aussi, pour les pays, qui
  seuls y ouvrent des grappes (D46). Les comptes de Jouer (« 6 nouveaux »)
  suivent.
- Elle s'éteint seule quand le lieu est appris.
- La fiche dit « Noté : sa région sera ta prochaine grappe » et offre
  « Annuler ».
- Elle n'est pas synchronisée : le site et l'APK ont chacun la leur. Deux
  appareils peuvent préférer deux lieux ; le premier commencé gagne.

Taille : ≈ 80 lignes et leurs tests en plus du reste (estimé par R2).

## 6. Technique

### 6.1 Chargement à la demande

| Moment | Ce qui se charge | gzip |
|---|---|---|
| premier affichage | **rien de plus** | 0 |
| premier toucher d'un pays | `fiches-monde.json`, `fiches-monde.fr.json` ; les capitales si elles ne sont pas là (`capitales.json`, `capitales.fr.json`) ; le morceau de code de la fiche | ≈ 18 Ko + 5,6 Ko + ≈ 5 Ko (estimé pour le code) |
| premier toucher en mer | les deux fichiers des mers, avec la couche légère | 1,6 Ko |
| premier toucher sur l'île | les deux fichiers des communes | 0,8 Ko |
| ouverture d'une fiche | la liste de ses photos ; la première vignette ; le drapeau ; `drapeaux.json` la première fois | 0,3 Ko + 19 Ko + ≈ 3 Ko (estimé) + 4,7 Ko |
| défilement du carrousel | une vignette | 19 Ko |
| toucher d'une photo | le plein écran | 96 Ko |

- Le besoin dit à la fois « au premier toucher de la barre » et « à la
  première ouverture d'une fiche ». Ni l'un ni l'autre ne peut remplir la
  ligne « capitale · habitants » de la barre. Le chargement part donc du
  **premier toucher d'un lieu**, après la réponse au toucher, sans la
  retarder : la mesure du toucher (`ctx.mesures.toucher`,
  `vues/explorer.ts:357`) se ferme avant.
- Un lieu montré par la recherche compte comme un toucher.
- Module `fiches/donnees.ts`, sur le modèle de `map/mers.ts` : un chargeur
  par terrain, lu une fois, relancé au toucher suivant après un échec. Un
  jeton écarte une réponse arrivée après un autre toucher, comme pour le nom
  d'une mer (`vues/explorer.ts:255-264`).
- Le code de la fiche (`vues/fiche.ts`) est un morceau à part, par `import()`
  dynamique. Le morceau principal ne porte que la barre et le chargeur.
- `smoke` vérifie qu'aucun fichier `fiches-*`, ni rien sous `/photos/`, ne
  part au premier affichage.

### 6.2 Service worker

- Photos : § 3.6. Nouvelles stratégies `photo` et `liste-photos` dans
  `aiguiller` (`sw/logique.ts:123`), testées avant la règle du manifeste.
- Données des fiches : rien à coder. Elles entrent au manifeste avec le
  build, sont rangées à l'usage et reprises d'une version à l'autre.
- `retenir` (`sw/logique.ts:352`) range aussi ce que la première visite a
  chargé avant que le service worker ne la contrôle.

### 6.3 Budget de transfert

Budget : 360 Mo par jour, ≈ 1,8 Mo par nouveau visiteur (décision
« Hébergement », estimé le 04/11).

| Visiteur | Ce qu'il fait | Coût (estimé) | Part de 1,8 Mo |
|---|---|---|---|
| qui touche la carte | un toucher, pas de fiche | ≈ 29 Ko | 1,6 % |
| moyen | 3 fiches, 1 vignette chacune, 1 photo agrandie | ≈ 0,20 Mo | 11 % |
| curieux | 10 fiches, 2 vignettes chacune, 3 photos agrandies | ≈ 0,75 Mo | 42 % |
| curieux, si les vignettes partaient toutes d'un coup | 10 fiches, 4 vignettes chacune | ≈ 1,1 Mo | 62 % |

Les 360 Mo par jour valent pour **tout le projet**, l'APK compris : ses
pleins écrans viennent de Hosting (§ 3.7). Une ligne de plus, donc :

| Utilisateur de l'APK | Ce qu'il fait | Coût (estimé) | Part de 360 Mo |
|---|---|---|---|
| curieux, par jour | 10 photos agrandies, jamais vues | ≈ 1 Mo | 0,3 % |
| 10 utilisateurs de l'APK, par jour | idem | ≈ 10 Mo | 2,8 % |

Le cache HTTP de la WebView garde les pleins écrans déjà vus (S53) : le
coût ne se répète pas. L'APK est téléchargeable, sans être annoncé, jusqu'au
Play Store (décision « Diffusion ») : la ligne reste petite. Elle grandira
avec le Play Store ; il faudra alors la relire.

La ligne du visiteur moyen concorde avec le besoin (≈ 0,2 Mo). Le texte ne
pèse presque rien : **les photos font le budget**, d'où le chargement une à une,
vérifié par un test (§ 7). `sw.js` ne grossit pas.

À lire dans la console après la mise en ligne : le transfert réel par jour.

### 6.4 Fluidité

Critères actés : pas plus de ≈ 3 à-coups par seconde (une image de 25 ms ou
plus), aucun gel de 50 ms ; toucher à moins de 100 ms en médiane.

- La fiche ne touche pas à la carte : ouverte ou fermée, le Canvas ne
  redessine rien, sauf le vol d'un voisin.
- Opaque, sans flou ; animée par `transform` seul ; `will-change:
  transform` le temps de l'animation.
- Les photos ont leur place réservée. Le drapeau aussi (4:3, comme
  aujourd'hui).
- Le toucher de la carte ne change pas : la barre est remplie par le même
  `afficher()`, plus une lecture en mémoire. Le chargement part après.
- À mesurer avant de déployer le lot F1 (S41, S42, S55) : un scénario du
  pilote, « ouvrir et fermer 10 fiches, passer par 3 voisins », en
  `--preview`, puis sur l'A37, et `touchers_reels.py` sur la carte avec la
  barre nouvelle.

### 6.5 Fichiers de langue

Décision « Langue » : rien en français dans le code.

- `vues/textes.fr.json`, bloc `fiche` : libellés, statuts, états du bouton,
  textes de l'heure (« +{h} h », « +{h} h {min} », « même heure qu'ici »),
  « environ », crédit des photos, messages hors ligne.
- `fiches-*.fr.json` : tout ce qui est un nom (§ 2.7).
- `fiches/format.ts` : nombres, dates (« 14 juillet »), unités. La langue en
  paramètre ; `toLocaleString('fr-FR')` et espace insécable avant l'unité,
  comme `fmtKm` (`vues/commun.ts`).
- Un territoire n'a pas de forme avec article (`vues/formes.ts:16-19`). La
  fiche n'en a pas besoin : son nom est un titre, et le pays dont il dépend,
  lui, est dans la table (« Territoire du Danemark »).
- Les libellés de statut de la barre (« territoire », « statut contesté »)
  sont écrits dans le code aujourd'hui (`vues/commun.ts:57-63`). Le lot F1
  les déplace dans `textes.fr.json`.

### 6.6 Crédits

`textes.credits.donnees` : les lignes nouvelles vont **à la fin**, car
`vues/credits.ts:61` lit l'IGN par son rang.

| Ligne | Changement |
|---|---|
| Unicode CLDR | détail : « Noms des pays, des langues et des monnaies ; langues et monnaies de chaque pays · v49.0.0 » |
| IGN | détail : « Communes de La Réunion ; habitants : recensement INSEE de 2023 » |
| Wikidata | détail : « Capitales et notoriété des lieux · extrait du 11/11/2026 ; superficies, gentilés, sommets, profondeurs · extrait du {date} » |
| **Banque mondiale** (nouvelle) | « Habitants des pays, 2025 · World Development Indicators », CC BY 4.0, lien vers la licence |
| **Base de données des fuseaux horaires de l'IANA** (nouvelle) | « Fuseau de chaque pays · 2026e », domaine public |
| **CIA World Factbook** (nouvelle) | « Fêtes nationales, relues · édition figée de 2026 », domaine public |
| Wikimedia Commons | une seconde ligne : « Photos des fiches · auteur et licence sous chaque photo », puis la rubrique « Photos » (lot P2) |

Le test des Crédits (`tests/credits-vue.test.ts:87`) s'étend : chaque ligne,
et la date de chaque extrait comparée à son fichier.

## 7. Tests

Tous en Vitest, sans réseau, sauf mention. Fichiers nouveaux marqués (n).

**Données** (`tests/donnees-fiches.test.ts`, n) :
- chaque lieu des trois sujets a sa fiche : les 258 entités, les 50 mers,
  les 24 communes ; aucune fiche pour un id inconnu ;
- `sorteDeLieu` dit la même sorte que les fichiers, pour les 332 ;
- **aucun champ vide sans le vouloir** : la liste des champs absents, par
  sorte, est figée dans le test ; elle ne change que par un commit qui la
  touche ;
- chaque nombre a une année là où elle est demandée ; habitants ≥ 0, et la
  liste des lieux à 0 figée (îles Heard, Ashmore-et-Cartier, Clipperton,
  Bajo Nuevo, Serranilla) : leur fiche dit « aucun habitant permanent »,
  texte du fichier de langue ; superficie > 0 ; altitude entre 1 et
  8 850 m ; fête en jour 1 à 31 et mois 1 à 12 ;
- chaque zone horaire se construit : `new Intl.DateTimeFormat('fr', {
  timeZone })` ne lève rien. **Pas** `Intl.supportedValuesOf('timeZone')` :
  V8 et ICU y donnent les anciens noms. Mesuré dans Node 24.19.0 (ICU 78.3,
  tz 2026b) : `Asia/Kolkata`, `Asia/Kathmandu`, `Europe/Kyiv`,
  `America/Nuuk` y manquent, alors que `DateTimeFormat` les accepte ; et
  `resolvedOptions().timeZone` rend `Asia/Calcutta` pour `Asia/Kolkata` :
  pas de comparaison de noms non plus ;
- le nombre de fuseaux des pays à plusieurs fuseaux, figé (France 5) ;
  aucune ligne d'heure pour les îles mineures des États-Unis ;
- la liste des pays à plusieurs superficies dans Wikidata, et la valeur
  retenue pour chacun ;
- la liste des pays touchés par une zone disputée (§ 2.1), recalculée
  depuis `revendique_par` et `contestees.json`, égale à celle de la table
  (D57) ;
- statut des zones : les revendicants cités sont ceux de `revendique_par`,
  plus les ajouts écrits ; aucun texte de statut n'est égal à une
  `note_ne` ;
- chaque code de langue et de monnaie a son nom dans le fichier de langue ;
- chaque voisin, riverain et pays d'un territoire est un id connu ; aucun
  riverain pour un océan ;
- le sommet d'un pays tombe dans son tracé, ou à moins de 10 km (liste
  d'exceptions écrite) ;
- chaque ligne de la table à la main s'applique encore ; chacune a sa
  raison ;
- sources datées, empreintes égales au verrou et aux extraits ; le build
  refait les fichiers à l'identique ;
- poids : bornes du § 2.7.

**Format** (`tests/fiche-format.test.ts`, n) : nombres arrondis ; heure et
écart pour Katmandou, les îles Chatham, un jour d'heure d'été ; zone
inconnue : pas de ligne ; pluriels des gentilés.

**Vue** (`tests/fiche-vue.test.ts`, n ; `tests/carte-vues.test.ts`,
`tests/mers-accueil.test.ts`) :
- un toucher remplit la barre comme avant, puis la ligne de faits à
  l'arrivée des données ; un second toucher avant l'arrivée : la ligne du
  premier ne s'affiche pas ;
- la barre garde sa hauteur quand la ligne arrive, avec et sans la ligne
  de la mémoire (classe et `min-height` du cas complet) ; sous la fiche,
  elle reste mise en page (jamais `[hidden]`) ;
- sans données : pas de chevron, le bouton n'ouvre rien ;
- ouvrir : focus sur le titre, `aria-expanded` ; fermer par « × », Échap,
  le voile : focus rendu ;
- Échap avec la popup ⚙ ouverte : la popup se ferme, la fiche reste ;
- fiche ouverte : boutons de zoom cachés, + et − sans effet ; un toucher
  sur le voile ferme la fiche sans toucher la carte ;
- un pays, un territoire, une zone, une mer, un océan, une commune,
  l'Antarctique : les lignes attendues, aucune ligne vide ;
- une zone contestée ne montre ni superficie, ni langue, ni monnaie, ni
  drapeau (défaut de D57) ;
- voisin : `montrerLieu` appelé, fiche remplacée, pile ; « ‹ » revient ;
- `desactiver()` ferme la fiche ; une recherche la ferme ;
- l'île : la fiche sous la mention de l'IGN.

**Jamais pendant une partie** (`tests/fiche-partie.test.ts`, n) :
- la règle de `carte.css` cite exactement `BARRES_PARTIE` ;
- une barre de partie visible : `ctx.ouvrirFiche` ne fait rien ;
- une partie de Toucher quittée en cours de route (le cas de
  `tests/essai-reprise.test.ts`) : sur la carte, un toucher ne montre ni
  faits ni chevron, la fiche ne s'ouvre pas ; la partie finie et son bilan
  montré, tout revient ;
- les cinq bilans : chaque erreur est un bouton qui porte le bon id ; sans
  `ctx.ouvrirFiche`, des lignes de texte, comme avant ;
- depuis un bilan : fiche ouverte sur la carte ; « ‹ » rend le bilan, sur le
  bon terrain ; « × » laisse la carte.

**Navigation** (`tests/navigation.test.ts`, historique factice ;
`tests/retour-android.test.ts`), dès le lot F1 :
- le retour du navigateur ferme la fiche sans quitter la carte ; avec des
  voisins, il remonte d'une fiche, comme « ‹ » ;
- le plein écran : un retour le ferme, la fiche reste ;
- « × » après trois voisins : une seule remontée, l'entrée `#carte` d'avant
  la fiche, la fiche fermée ;
- depuis un bilan, au lot F6 : « ‹ Retour au bilan » après deux voisins
  rend le bilan (la pile compte les entrées de fiche ; le cas du
  `pushState` posé hors de `navigation.ts`, bloqué sur la carte, est le
  test qui échouerait) ;
- dans l'APK : l'écran de connexion passe d'abord ; puis le retour
  d'Android fait `history.back()`, et le retour suivant montre bien la vue
  d'avant (aucune entrée de fiche orpheline) ;
- au-delà de `PILE_MAX` voisins : « Retour au bilan » rend quand même le
  bilan.

**Mémoire** (`tests/srs-planif.test.ts`, `tests/seance-vue.test.ts`) :
- `prefere` : la grappe du lieu passe en tête ; une grappe entamée passe
  avant elle ; `prefere` inconnu ou déjà appris : comme sans lui ;
- le budget ne bouge pas : grappe faite, reliquat, révisions dues, plafond,
  avec et sans `prefere` ;
- `comptes({ sorte: 'apprendre', …, lieu })` : chaque ligne du tableau du
  § 5.4, mémoire en lecture et pas gardée comprises ; son refus est
  toujours celui qu'`ouvrir()` rendrait pour la même demande ; un
  territoire : pas de bouton ;
- le lancement depuis la fiche passe par `lancer()` : au bilan, « Autre
  série » mène à la série du lieu ;
- la séance lancée écrit des fiches `pays:` de la grappe du lieu, jamais
  `capitales:` ni `drapeaux:` ;
- aucun type d'événement nouveau : `TYPES` inchangé.

**Photos** (`tests/donnees-photos.test.ts`, n) :
- chaque lieu a une entrée relue dans `choix.json` ; un lieu sans photo
  porte « pauvre » et sa raison ;
- plancher et plafond (D60) ; la liste des lieux sous 3 photos est figée ;
- chaque photo : licence de la liste, page Commons en
  `https://commons.wikimedia.org/wiki/File:…` ; pour CC BY et BY-SA, un
  auteur qui n'est pas dans la liste des faux auteurs (vide, « Own work »,
  « Unknown », « Anonymous », « Auteur inconnu », une adresse web seule) ;
  le script de nettoyage passe sur cette liste ;
- texte alternatif non vide, sans extension de fichier ; titre ou sujet
  présent pour la rubrique de Crédits ;
- les listes par lieu et `credits.json`, écrits par le build depuis
  `choix.json` et `licences.json` : chaque liste ne cite que des photos de
  `licences.json`, et inversement ; la rubrique de Crédits les a toutes.
  Ces tests tournent en CI, sans les WebP ;
- noms uniques ; une photo de deux lieux n'a qu'un nom ;
- si les WebP sont là (D59) : les deux fichiers de chaque photo, leur nom
  égal au début de leur SHA-256, leurs dimensions lues dans l'en-tête WebP,
  vignette ≤ 60 Ko, plein écran ≤ 300 Ko, aucun fichier orphelin. Sinon ces
  contrôles sont ceux de `verifier.mjs --dist`, au `predeploy`.

**Service worker** (`tests/service-worker.test.ts`) : `/photos/v/x.webp` et
`/photos/l/JPN.json` aiguillés vers leurs stratégies ; aucune entrée
`/photos/` au manifeste ; le nom du cache des photos hors de
`PREFIXE_CACHE`, donc épargné par `cachesPerimes` et jamais parcouru par
`reprendre` ;
une photo dont le contenu ne correspond pas à son nom n'est pas rangée ;
l'éviction au-delà de la borne.

**Carrousel** (`tests/fiche-photos.test.ts`, n) : à l'ouverture, un seul
`src` posé ; le suivant quand sa case entre dans le cadre ; le plein écran
au toucher seulement ; dans l'APK, une adresse absolue.

**Pilote** (`driver.py`) : `smoke` sans fichier de fiche ni photo au premier
affichage, et toujours un seul cache `terramemo-*` après une photo vue ;
`ui_fiche` (toucher, barre, fiche, voisin, fermeture, île, mer,
bilan), en téléphone et en PC, sur le site en ligne ; le scénario de mesure
du § 6.4.

**Hors CI** : `verifier.mjs --reseau` ; l'essai sur l'A37.

## 8. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et `npm run
build` au vert, puis par un commit « … (#34) ». Ensuite le déploiement
Hosting, `driver.py smoke --url https://terramemo-geo.web.app/` et le pilote
du lot sur le site en ligne (skill `run-terramemo`). Aucun lot ne touche aux
règles Firestore. Sur l'A37 : après `sauver_journal`.

| Lot | Taille | Dépend de | Attend | Critère de fin |
|---|---|---|---|---|
| F1. Fiche des pays, avec les données déjà au dépôt, et son historique | L | — | — | une fiche s'ouvre au doigt pour les 258 entités, sur le site ; le retour du navigateur la ferme sans quitter la carte ; sans à-coup sur l'A37 |
| F2. Chiffres des pays | L | F1 | D56 (ligne « Langues » hors ligne d'ici là), D57 superficie (tranchée le 18/11 : Wikidata) | les lignes du § 4.2 pour les 197 pays ; « capitale · habitants » dans la barre |
| P1. Photos : candidats, licences, outil de relecture | L | F1 (liste des lieux) | D60 pour finir | l'utilisateur peut relire les 332 lieux |
| F3. Territoires, zones contestées, Antarctique | M | F2 | D57 zones (défaut codé) ; relecture des statuts | statut, tenant et champs applicables ; liste des absents figée |
| F4. Océans et mers | M | F1 | — | fiche des 50 zones |
| F5. Communes de La Réunion | M | F1 | — | fiche des 24 communes |
| F6. Depuis le bilan | M | F1 | — | une erreur des cinq bilans ouvre la fiche ; retour au bilan, voisins compris |
| F7. « Apprendre ce lieu » | M | F1 | D58 (défaut codé) | le bouton lance la grappe du lieu, dans le budget, par `lancer()` |
| F8. Carte de situation | M | F1 | D61 b | la tête de la fiche montre où est le lieu ; aucun gel de 50 ms |
| P2. Photos dans la fiche | L | P1 relu, F1 | D59 (défaut codé) | photos, crédits et rubrique de Crédits en ligne ; une à une ; versions de Hosting bornées |
| P3. Photos : APK et vérification par le réseau | M | P2 | D59 | APK avec vignettes ; `verifier.mjs --reseau` au vert |
| F9. Fin du ticket | S-M | tous | — | critère de #34, APK compris |

Le lot F8 de la rédaction (« Retour du navigateur ») est **fondu dans F1** :
la fiche n'est pas mise en ligne sans son entrée d'historique (§ 4.4). Le
numéro F8 passe à la carte de situation, qui n'existe que si D61 dit b.

**Ordre conseillé** : F1, F2, puis P1 tout de suite. La relecture des photos
est le plus long délai du ticket, et c'est du temps de l'utilisateur : il
relit pendant que F3 à F8 se codent. F3 à F8 ne dépendent pas les uns des
autres : un lot bloqué n'arrête pas le suivant. Si une seule chose doit
sortir vite, c'est F1 : la fiche existe, avec ce que le dépôt sait déjà.

### Lot F1. Fiche des pays, avec les données déjà au dépôt

- **Contenu** :
  - `sorteDeLieu` ; `BARRES_PARTIE` et son test ; les libellés de statut
    dans `textes.fr.json` ;
  - `geodata/fiches.mjs`, première version : il écrit `fiches-monde.json`
    et `fiches-monde.fr.json` avec **une entrée par entité, les 258** : les
    titres Wikipédia des 197 pays, tirés de l'extrait des capitales
    (`pays[Q].frwiki`) ; une entrée vide pour les 61 autres (48
    territoires, 12 zones, l'Antarctique), qui n'ont pas de QID avant P1 ou
    F3, donc pas de lien Wikipédia jusque-là ; les noms des 23
    sous-régions. Le chevron dépend de l'entrée : sans elle, pas de fiche ;
  - `fiches/donnees.ts` : le chargeur, au premier toucher ;
  - la barre : bouton, chevron, ligne de faits (« Tokyo » seul pour
    l'instant), hauteur réservée du cas complet, région vivante à part ;
  - la fiche (`vues/fiche.ts`, morceau à part) : tête, drapeau, capitales,
    continent et sous-région, voisins touchables, lignes de la mémoire,
    lien Wikipédia ;
  - territoires, zones et Antarctique : une fiche courte, avec le statut
    que la barre dit déjà (« territoire », « statut contesté »), le
    continent, les voisins. Ni `revendique_par` ni `note_ne` : le statut
    écrit et relu vient au lot F3 ;
  - une mer, une commune : pas encore de chevron ;
  - l'historique (§ 4.4) : `nav.pousserFiche`, `nav.quitterFiches`,
    `etat.fiche` lu par `router()` ; une entrée par fiche, voisins compris ;
  - le voile, le zoom caché, Échap et la popup ⚙ (§ 4.2, § 4.3) ;
  - la garde de la partie en suspens : `essai.enSuspens()`,
    `ficheAutorisee()` (§ 4.8) ;
  - gestes, « × », « ‹ », focus ;
  - `ui_fiche` au pilote ; `smoke` étendu.
- **Fichiers** : `src/fiches/sorte.ts`, `src/fiches/donnees.ts`,
  `src/fiches/format.ts`, `src/vues/fiche.ts` (nouveaux) ;
  `src/vues/explorer.ts`, `src/vues/commun.ts`, `src/vues/textes.fr.json`,
  `src/main.ts`, `src/navigation.ts`, `src/vues/essai.ts` (`enSuspens`),
  `src/zoom-carte.ts`, `src/carte.css`, `src/style.css` ;
  `geodata/fiches.mjs` (nouveau), `package.json` (`npm run fiches`),
  `public/geo/fiches-monde*.json`, `public/geo/sources.json` ;
  `.claude/skills/run-terramemo/driver.py`.
- **Tests** : `fiche-vue`, `fiche-partie` (liste des barres, partie en
  suspens), `navigation` (les cas du § 7 hors bilan), `retour-android`,
  `donnees-fiches` (une entrée par entité, les 258, et les sortes),
  `carte-vues` et `mers-accueil` adaptés à la barre.
- **Vérification** : `ui_fiche` sur le site ; le scénario de mesure ;
  `touchers_reels.py` ; l'essai sur l'A37 (S41, S42, S44, S45, S55).
  `navigation.ts` a déjà demandé deux relectures (#18) : ce lot en prévoit
  une, sur l'historique seul, avant le déploiement.
- **Fin** : sur le site, toucher un pays puis sa barre ouvre sa fiche ; les
  voisins se suivent ; au téléphone, le geste de retour ferme la fiche et
  laisse la carte ; aucun critère de fluidité ne bouge.

### Lot F2. Chiffres des pays

- **Contenu** :
  - les extraits figés : Banque mondiale, Wikidata (`requetes-fiches.rq`,
    `geodata/wikidata/fiches.json`), CLDR (`territoryInfo`, `currencyData`,
    `fr/languages`, `fr/currencies`), `zone.tab` ; leurs lignes au verrou et
    dans `sources.json` ;
  - `geodata/fiches-main.json` : fêtes, gentilés, sommets (règle de
    l'altitude, seconde source), fuseaux, monnaies, langues, superficies ;
  - `geodata/fiches.mjs` complet pour les 197 pays : règle du choix des
    superficies, liste des pays touchés par une zone disputée et leur
    superficie de Wikidata (D57), fuseaux comptés par le tracé ;
  - la fiche : habitants, superficie, langues, monnaie, gentilé, heure
    locale, point culminant, fête ; le pied « Sources ». La ligne
    « Langues » est codée avec le défaut de D56, mais **pas mise en ligne**
    avant la réponse de l'utilisateur (constante `LANGUES_EN_LIGNE`) : le
    défaut s'écarte du besoin ;
  - la barre : « capitale · habitants » ;
  - Crédits : les lignes du § 6.6, sauf les photos.
- **Fichiers** : `geodata/fiches.mjs`, `geodata/fiches-main.json`,
  `geodata/wikidata.mjs`, `geodata/wikidata/requetes-fiches.rq`,
  `geodata/wikidata/fiches.json`, `geodata/banque-mondiale/population.json`,
  `geodata/sources.lock.json` ; `public/geo/fiches-monde*.json` ;
  `src/fiches/format.ts`, `src/vues/fiche.ts`, `src/vues/explorer.ts`,
  `src/vues/textes.fr.json`.
- **Tests** : `donnees-fiches` en entier pour les pays ; `fiche-format` ;
  `credits-vue`.
- **Relecture par l'utilisateur**, avant la mise en ligne : la table des
  fêtes, les 22 gentilés, les 12 sommets, la liste des pays touchés par une
  zone disputée et leur superficie (un tableau lisible, sorti par le
  build).
- **Fin** : chaque pays a toutes ses lignes ; la liste des champs absents
  est celle du § 2.1 ; les Crédits citent chaque source.

### Lot P1. Photos : candidats, licences, outil de relecture

- **Contenu** : la table des QID des territoires et des zones
  (`geodata/fiches-main.json`, clé `qid`, reprise de `lieux-qid.json` et
  relue) : le script en a besoin ; `geodata/photos/candidats.mjs` (Wikidata
  et Commons, une requête à la fois, pauses, cache) ; la règle des licences
  et le nettoyage des auteurs (champ `Attribution` demandé et préféré,
  liste des faux auteurs, refus d'une photo CC BY sans auteur) ;
  `geodata/photos/main.json` pour les mers pauvres ;
  `geodata/photos/relecture.mjs` et sa page ; la règle de relecture écrite,
  liberté de panorama comprise ; rien de coché d'avance pour les lieux
  sensibles ou pauvres, confirmation sous 2 s.
- **Fichiers** : `geodata/photos/*` (nouveaux), `geodata/fiches-main.json` ;
  `package.json` (`photos:candidats`, `photos:relecture`).
- **Tests** : `donnees-photos` pour `candidats.json` et `choix.json` (forme,
  licences, lieux connus) ; la règle des licences sur les 1 917 fichiers du
  relevé, en jeu d'essai réduit.
- **Fin** : l'utilisateur ouvre la page, relit un lieu en quelques touches,
  ferme, reprend. Le lot est clos quand les 332 lieux sont relus ; le temps
  de relecture ne bloque pas les autres lots.

### Lot F3. Territoires, zones contestées, Antarctique

- **Contenu** : la table des QID (déjà posée si P1 est passé avant), du
  pays de chaque territoire et de sa forme de statut, du statut et du
  tenant de chaque zone, écrits à la main (§ 2.2) ; `SOV_A3` lu par
  `geodata/fiches.mjs` ; les Chagos vérifiés et datés ; les champs
  applicables, la règle « aucun habitant permanent » ; les 40 drapeaux de
  territoires, par la chaîne des drapeaux, dans un manifeste à part pour ne
  pas toucher aux exercices ; l'Antarctique, sa superficie et son sommet
  extraits (absents du prototype).
- **Fichiers** : `geodata/fiches.mjs`, `geodata/fiches-main.json`,
  `geodata/drapeaux.mjs`, `public/geo/drapeaux-territoires.json`,
  `public/geo/fiches-monde*.json`, `src/vues/fiche.ts`,
  `src/vues/textes.fr.json`.
- **Tests** : statuts des 12 zones et des 48 territoires ; aucun texte égal
  à une `note_ne` ; aucun champ interdit pour une zone ; les lieux à 0
  habitant ; la liste des absents ; les drapeaux des exercices inchangés
  (`donnees-drapeaux`).
- **Relecture par l'utilisateur**, avant la mise en ligne : les 12 lignes
  de statut et de tenant, les formes de statut des territoires.
- **Fin** : le Groenland, Hong Kong, le Sahara occidental, Bir Tawil et
  l'Antarctique ont la fiche décrite.

### Lot F4. Océans et mers

- **Contenu** : l'extrait Wikidata des mers (superficie, profondeur, pays) ;
  le calcul des riverains par le tracé, repris de R4 (`mers-geo.mjs`) ;
  l'union, le retrait d'office des souverains en double, et la liste
  d'exclusions (≈ 25 lignes) ; les corrections ; les fichiers des
  mers ; la fiche d'une mer ; la ligne de faits de la barre.
- **Fichiers** : `geodata/fiches.mjs` (ou `geodata/mers.mjs` pour le calcul
  des riverains), `geodata/fiches-main.json`, `geodata/wikidata/fiches.json`,
  `public/geo/fiches-mers*.json`, `src/fiches/donnees.ts`,
  `src/vues/fiche.ts`, `src/vues/explorer.ts`.
- **Tests** : `donnees-fiches` pour les mers ; `mers-accueil` (barre d'une
  mer, chargement avec la couche légère).
- **Relecture par l'utilisateur** : la liste des riverains par mer et les
  superficies corrigées.
- **Fin** : la Méditerranée, l'Adriatique (sa mère), l'Atlantique (sans
  riverains) et la mer des Sargasses ont la fiche décrite.

### Lot F5. Communes de La Réunion

- **Contenu** : `geodata/reunion.mjs` lit `population`,
  `date_du_recensement`, `superficie_cadastrale`, `codes_siren_des_epci` ;
  gentilés et titres par Wikidata ; les 5 sigles ; les fichiers de l'île ;
  la fiche ; la barre ; la mention INSEE dans Crédits.
- **Fichiers** : `geodata/reunion.mjs`, `geodata/reunion.lock.json` si le
  verrou change, `public/geo/reunion/fiches*.json`,
  `public/geo/reunion/sources.json`, `src/fiches/donnees.ts`,
  `src/vues/fiche.ts`, `src/vues/textes.fr.json`.
- **Tests** : `donnees-reunion` (les fichiers d'avant inchangés, octet pour
  octet) ; `donnees-fiches` pour les communes ; total des habitants
  889 679.
- **Fin** : Saint-Pierre a ses habitants de 2023, sa superficie, « les
  Saint-Pierrois », la CIVIS, ses voisines.

### Lot F6. Depuis le bilan

- **Contenu** : `ligneFiche` ; les cinq bilans ; `ctx.ouvrirFiche`, qui lit
  `ficheAutorisee` (posée au lot F1) ; « ‹ Retour au bilan » par
  `nav.retour()`, la pile comptant les entrées de fiche.
- **Fichiers** : `src/vues/commun.ts`, `src/vues/essai.ts`,
  `src/vues/nommer.ts`, `src/vues/chrono.ts`, `src/vues/quiz.ts`,
  `src/vues/seance.ts`, `src/vues/explorer.ts`, `src/main.ts`,
  `src/carte.css`.
- **Tests** : `fiche-partie` ; les tests de vue des cinq bilans ;
  `navigation` (depuis un bilan, avec voisins, au-delà de `PILE_MAX`).
- **Fin** : après un Chrono, toucher une erreur montre le pays et sa fiche ;
  « ‹ » rend le bilan, même après deux voisins ; l'île aussi.

### Lot F7. « Apprendre ce lieu »

- **Contenu** : `prefere` ; `DemandeSeance.lieu` et `Lancement.lieu` ;
  `refusDe`, partagé par `ouvrir()` et `comptes()` ; le lancement par
  `lancer()` ; le bloc Mémoire et le bouton, avec ses états du § 5.4 ; les
  textes. Puis, si D58 le dit, la préférence gardée sur l'appareil (§ 5.6).
- **Fichiers** : `src/srs/planif.ts`, `src/vues/seance.ts`,
  `src/vues/essai.ts`, `src/main.ts`, `src/vues/fiche.ts`,
  `src/vues/textes.fr.json`.
- **Tests** : `srs-planif`, `seance-vue`, `fiche-vue`.
- **Fin** : depuis la fiche de Maurice, sur un journal neuf, la séance
  apprend la grappe de Maurice (8e sur 8 dans la série Afrique : `prefere`
  y est visible, ce que le Japon, 1er de sa série, ne prouverait pas) ; au
  bilan, « Autre série » mène à l'Afrique ; le lendemain, le bouton a
  disparu ; grappe déjà faite : le texte, pas de séance.

### Lot F8. Carte de situation (si D61 b)

- **Contenu** : dans la tête de la fiche, une petite carte qui montre où est
  le lieu, sur le modèle des vignettes des tuiles de Jouer
  (`vues/vignettes.ts` : une projection par région, le lieu éclairé sur le
  fond des autres, rien de plus à télécharger). Sa place est réservée ; elle
  se calcule après l'animation d'ouverture, en temps libre, et se garde
  d'une fiche à l'autre.
- **Fichiers** : `src/vues/vignettes.ts` (une fonction pour un lieu),
  `src/vues/fiche.ts`, `src/carte.css`.
- **Tests** : `fiche-vue` (place réservée, un lieu micro gagne un anneau) ;
  le scénario de mesure du § 6.4 avec dix voisins.
- **Fin** : sur le téléphone, chaque fiche montre où est son lieu ; aucun
  gel de 50 ms.

### Lot P2. Photos dans la fiche

- **Contenu** : `geodata/photos/traiter.py` (téléchargement des miniatures,
  recadrage, WebP, `licences.json`) ; `geodata/photos/listes.mjs`, appelé
  par le build, qui écrit les listes par lieu et `credits.json` depuis
  `choix.json` et `licences.json` ; `npm run photos:restaurer` ;
  `geodata/photos/verifier.mjs --dist` au `predeploy`, et le `grep` du
  `predeploy` sans `photos/` ; le carrousel, le plein écran (une entrée
  d'historique), le crédit « Photo recadrée » sous chaque photo ; la
  rubrique « Photos » (avec le titre ou le sujet) et la ligne de Crédits ;
  la règle de `firebase.json` ; les stratégies du service worker, le cache
  `photos-terramemo-1` hors du préfixe, et le manifeste sans `/photos/` ;
  la mesure du temps de copie de `public/` au build.
- **Fichiers** : `geodata/photos/traiter.py`, `geodata/photos/listes.mjs`,
  `geodata/photos/restaurer.mjs`, `geodata/photos/verifier.mjs`,
  `public/photos/**`, `.gitignore` (défaut de D59), `firebase.json`,
  `vite.config.ts`, `package.json`, `src/sw/logique.ts`,
  `src/sw/construction.ts`, `src/vues/fiche-photos.ts` (nouveau),
  `src/vues/fiche.ts`, `src/vues/credits.ts`, `src/vues/textes.fr.json`,
  `.claude/skills/run-terramemo/SKILL.md` (arbres de travail et
  `photos:restaurer`). `driver.py` ne change pas : le cache des photos est
  hors du préfixe que son `smoke` compte.
- **Avant le premier déploiement** : l'utilisateur borne les versions
  gardées à 10 dans la console ; un déploiement d'essai de quelques photos,
  puis la lecture du stockage (S48, S49).
- **Tests** : `donnees-photos`, `service-worker`, `fiche-photos`,
  `credits-vue`.
- **Fin** : sur le site, la fiche du Japon montre ses photos une à une,
  chacune avec son auteur et sa licence ; `curl -sI` d'une photo répond
  `immutable` ; le transfert d'une visite type est celui du § 6.3.

### Lot P3. Photos : APK et vérification par le réseau

- **Contenu** : le plein écran retiré de l'APK, son adresse absolue ; la CI
  de l'APK selon D59 (avec D59 d : le téléchargement de l'archive de la
  release) ; `verifier.mjs --reseau` ; la ligne du skill `run-terramemo`
  sur le déploiement des photos.
- **Fichiers** : `.github/workflows/android.yml`, `src/vues/fiche-photos.ts`,
  `src/sync/export.ts` (la constante du site), `geodata/photos/verifier.mjs`,
  `.claude/skills/run-terramemo/SKILL.md`.
- **Tests** : `fiche-photos` (adresse dans l'APK) ; `capacitor`.
- **Fin** : l'APK installé sur l'A37 montre les vignettes hors ligne, le
  plein écran en ligne ; son poids est celui du § 3.7.

### Lot F9. Fin du ticket

- **Contenu** : le pilote complet sur le site et sur l'A37 ; les
  suppositions du § 11 closes ou notées ; le plan mis à jour.
- **Fin** : chaque lieu des trois sujets a sa fiche, sources et licences
  affichées, sur le site et dans l'APK.

## 9. Décisions de l'utilisateur

**Tranchées le 16/11, toutes selon la recommandation** : D56 c, D57 a
(zones) et b (superficie ; retranchée le 18/11 : a, Wikidata pour tous), D58 b (lieu retenu sur l'appareil) et a
(nom seul), D59 d (release GitHub), D60 a, D61 b (carte de situation, lot
F8). Notées au registre : décision « Fiche d'un lieu : langues, superficies,
zones, Apprendre, photos, voisins ». Le texte ci-dessous garde les options
et leurs raisons ; leurs « défauts codés » ne servent plus.

| N° | Question | Recommandation | Bloque |
|---|---|---|---|
| D56 | Langues : montrer les langues apprises ? | c : les langues du pays, table relue | la mise en ligne de la ligne « Langues » (F2) |
| D57 | Neutralité : champs d'une zone contestée ; superficie d'un pays touché par une zone disputée | a : fiche courte ; superficie : a, Wikidata pour tous, citée (tranchée le 18/11) | F3 (zones) |
| D58 | « Apprendre ce lieu » quand la grappe du jour est prise ; fiches d'un pays | se souvenir du lieu sur l'appareil ; nom seul | la fin de F7 |
| D59 | Photos : dans le dépôt public, ou dehors ? | d : archive jointe à une release GitHub | P3 (CI de l'APK) |
| D60 | Photos : combien au moins par lieu ? | a : 3 à 5 visées, moins accepté | la fin de P1 |
| D61 | Voisins sur le téléphone : montrer où est le lieu | b : une carte de situation dans la fiche | F8 |

La rédaction posait en D61 la « × » d'une fiche ouverte depuis un bilan.
Ce n'était pas une vraie question : la décision « Croix vers la carte »
tranche déjà. Elle est rangée au § 10, et le numéro D61 passe à la question
des voisins, née d'une relecture.

### Bloque la mise en ligne d'une ligne du lot F2

**D56. Langues : montrer aussi les langues apprises ?** Le besoin dit « les
officielles d'abord, puis les plus parlées avec leur part ». La source
compte toute personne qui parle une langue, apprise à l'école comprise :
l'anglais sort pour la France (39 %), l'Allemagne (64 %), les Pays-Bas
(90 %), et pour 44 pays en tout où il n'est pas officiel.
- a) **Les langues officielles seules**, sans part. Coûte : rien. Apporte :
  une liste courte et sûre. Perd : l'espagnol aux États-Unis, le zoulou en
  Afrique du Sud, le wolof là où il n'est pas officiel. **S'écarte du choix
  écrit de l'utilisateur**, « les plus parlées avec leur part ».
- b) **La règle telle quelle** : officielles, puis toute langue à 10 % ou
  plus, avec sa part. Coûte : une table pour les dialectes et les doubles
  codes (`no` et `nb`). Apporte : la lettre du besoin. Donne : « France :
  français · anglais 39 % · espagnol 13 % ».
- c) **Les langues du pays** : officielles, puis les langues à 10 % ou plus
  qui sont des langues du pays, avec leur part ; les langues étrangères
  apprises, les dialectes et les doubles codes sont retirés par une table à
  la main, une ligne et une raison par retrait. ≈ 110 pays à passer en
  revue par Claude, la liste finale montrée à l'utilisateur (estimé : 2 h
  de relecture en tout). Apporte : ce qu'un lecteur attend de « langues
  parlées ».
- Recommandation : **c**.
- Défaut codé en attendant : a, parce qu'on ajoute ensuite sans rien
  défaire. Mais a s'écarte du besoin : la ligne « Langues » est codée avec
  lui et **n'est pas mise en ligne** avant la réponse.
- Bloque : la mise en ligne de la ligne « Langues », rien d'autre.

### Bloque le lot F3 (zones) et une ligne de F2

**D57. Neutralité des chiffres.** La règle actée : aucun chiffre ni aucune
formule ne tranche une revendication.
- **Champs d'une zone contestée** (12 fiches) :
  - a) **fiche courte** : statut et tenant écrits à la main, continent,
    voisins, habitants avec année et source s'ils existent, lien, photos.
    Ni superficie, ni langue, ni monnaie, ni fuseau, ni capitale, ni
    drapeau. Coûte : des fiches minces (le Somaliland sans Hargeisa).
    Apporte : rien qui dise plus que « qui tient, qui revendique » ;
  - b) tout ce que les sources donnent, chaque ligne suivie de sa source
    (« selon Wikidata »). Apporte : des fiches pleines pour le Somaliland,
    Chypre du Nord, le Sahara occidental. Coûte : le dirham marocain sur la
    fiche du Sahara occidental est une prise de position, source citée ou
    non ;
  - c) le statut et le lien seuls.
  - Recommandation : **a**. Défaut codé : a.
- **Superficie d'un pays touché par une zone disputée.** La rédaction
  recommandait le chiffre de Wikidata, « celui que le pays publie ». C'est
  faux (§ 2.1) : Wikidata compte le Kosovo dans la Serbie et tout le
  Cachemire dans l'Inde, une part du Cachemire dans le Pakistan aussi, mais
  le Sahara occidental hors du Maroc. Il suit tantôt le revendiquant,
  tantôt l'ONU. Les pays concernés se repèrent par les données : 68 pays
  tiennent ou revendiquent une zone ; pour 30, elle pèse 1 % ou plus de leur
  tracé (§ 2.1). Les 167 autres gardent Wikidata, sans débat.
  - a) **Wikidata telle quelle**, citée. Coûte : rien. Tranche : son critère
    change d'un pays à l'autre. Écartée comme recommandation ;
  - b) la superficie de l'Annuaire démographique de l'ONU, recommandée le
    16/11, a été écartée par l'utilisateur le 18/11 : ses conditions
    interdisent la redistribution, et il reprend le chiffre que déclare
    chaque pays ;
  - c) **hors zones disputées** : le tracé de fait moins les zones de
    `contestees.json` qu'il contient. La zone ne compte pour personne : la
    formule est symétrique. Mesuré (`correction/hors-zones.py`) : Pakistan
    796 733 km² ; mais Guyana 54 738 au lieu de
    ≈ 215 000, et l'Ukraine 552 474. Le chiffre grossit l'effet d'une
    revendication (Guyana), et ce n'est le chiffre d'aucune source ;
  - d) **aucune superficie** pour les 30 pays : rien ne tranche, et la liste
    se calcule. Coûte : la Chine, l'Inde, le Japon, l'Ukraine, le Maroc
    sans superficie ;
  - e) deux chiffres pour les 30, chacun avec son critère (« selon
    Wikidata », « sur la carte »). Coûte : une ligne lourde, et « sur la carte » suit le
    contrôle de fait, que la décision « Zones contestées et enclaves » ne
    veut pas seul.
  - Écarté : la surface du tracé de fait seule (option b de la rédaction).
    Elle suit le contrôle de fait : l'Ukraine sans la Crimée. La décision
    « Zones contestées et enclaves » a préféré une règle qui ne prend pas
    ce parti.
  - **Tranchée le 18/11 par l'utilisateur : a**, Wikidata pour tous les
    pays, citée « selon Wikidata », par la règle du choix du § 2.1. Les 30
    pays touchés ont leur tableau à relire (`docs/relectures/fiches-pays.md` :
    Wikidata, surface du tracé, écart), sans ligne de la table.
- Bloque : les 12 zones du lot F3. F2 avance.
- Confirmé au passage, sans alternative utile : les 77 zones hachurées
  (Crimée, Cachemire) n'ont pas de fiche ; on ne peut pas les toucher.

### Bloque la fin du lot F7

**D58. « Apprendre ce lieu ».**
- **Quand la grappe du jour est déjà prise** (le cas courant d'un joueur
  assidu) :
  - a) le bouton dit « demain », et **le lieu est oublié** : il faut
    revenir à la fiche le lendemain. Coûte : rien de plus. Ne tient pas
    tout à fait la phrase acceptée, « le lieu entre dans la prochaine
    grappe ». Le gain perdu est petit pour qui joue Apprendre sur la série
    du lieu : 0 à 7 jours (§ 5.1) ;
  - b) **le lieu est retenu sur l'appareil** : sa région sera la prochaine
    grappe, dans Apprendre et dans la Révision du jour ; la fiche le dit et
    permet d'annuler. Coûte : ≈ 80 lignes et leurs tests ; pas de synchro
    entre le site et l'APK. Apporte : la phrase acceptée, tenue ; et surtout
    pour qui n'ouvre que la Révision du jour, où les grappes suivent l'ordre
    global (le Japon au 22e jour, l'Australie au 30e) ;
  - c) le retenir au journal, synchronisé : écarté. Les anciens clients ne
    liraient plus les lots, ou il faudrait changer le format et les règles
    Firestore.
- **Fiches d'un pays** :
  - a) **son nom seul** (§ 5.3) ;
  - b) nom, capitale et drapeau le même jour : ≈ 40 questions, puis trois
    sujets fermés le lendemain (estimé) ;
  - c) nom seul, et plus tard un bouton « Apprendre sa capitale et son
    drapeau » : un lot de plus, S-M.
- Recommandation : **b**, puis **a**. La rédaction justifiait b par
  « le Japon au 22e jour », sans dire que c'est l'ordre de la seule
  Révision du jour. Avec le bon chiffre, b reste recommandé : il tient la
  phrase acceptée, et la Révision du jour est le chemin de tous les jours.
  Mais son gain est moindre qu'écrit : si l'utilisateur joue surtout
  Apprendre par série, a suffit.
- Défaut codé en attendant : a et a.
- Bloque : la fin du lot F7 seulement. Le lot se code avec le défaut.

### Bloque le lot P3

**D59. Où vivent les fichiers des photos.** Le dépôt est public et pèse
63 Mo.
- a) **Dans le dépôt** (≈ 170 à 200 Mo au total). Apporte : une seule
  source ; la CI vérifie chaque fichier ; l'APK de la CI a ses vignettes ;
  GitHub est une sauvegarde. Coûte : un dépôt trois fois plus lourd, pour
  toujours ; chaque arbre de travail prend 105 à 138 Mo de plus ; une photo
  remplacée reste dans l'historique. Le dépôt redistribue alors les
  photos : `geodata/photos/licences.json` y porte leurs crédits.
- b) Dans un second dépôt public, que la CI et le PC clonent à côté.
  Apporte : le dépôt principal reste léger. Coûte : deux dépôts à tenir,
  une étape de plus dans chaque CI.
- c) **Hors de git** : sur le PC, sous `~/Sauvegardes`, et sur le site.
  Choix et licences versionnés. Apporte : aucun poids. Coûte : la CI ne
  vérifie pas les octets (le `predeploy` le fait) ; l'APK bâti par la CI
  n'a pas de vignettes, sauf à les prendre sur le site ; un arbre de
  travail neuf passe par `photos:restaurer` (§ 3.8).
- d) **Une archive des WebP jointe à une release GitHub**, comme l'APK
  (release « android », décision « Diffusion »). Apporte : l'historique de
  git ne grossit pas ; la CI la télécharge et vérifie chaque fichier ;
  l'APK de la CI a ses vignettes ; GitHub est une sauvegarde publique ;
  `photos:restaurer` la prend quand la copie du PC manque. Coûte : une
  étape de téléchargement dans la CI ; une archive par version des photos
  (105 à 138 Mo chacune, les anciennes supprimables, contrairement à
  l'historique de git) ; un script qui la publie (`gh release upload`).
  Comme en a, le dépôt redistribue les photos : leurs crédits vont avec
  l'archive.
- Écartés : Git LFS (quota gratuit serré) ; régénérer depuis Commons à
  chaque build (une heure, pas reproductible).
- Recommandation : **d**. Elle a les avantages de a sans son seul défaut qui
  ne se rattrape pas. La rédaction recommandait a, faute d'avoir vu d.
- Défaut codé en attendant : c, le seul qui se rattrape ; d s'y ajoute
  sans rien défaire.
- Bloque : la CI de l'APK au lot P3. P1 et P2 avancent, déploiement
  compris.

### Bloque la fin du lot P1

**D60. Combien de photos au moins par lieu.** Le choix acté dit « 3 à 5 par
lieu ». ≈ 70 lieux n'auront pas 3 bonnes photos sans recherche à la main
(estimé, d'après 3 lieux sur 14).
- a) **3 à 5 visées ; 1 ou 2 acceptées ; aucune acceptée si rien de bon**,
  avec la raison écrite. La fiche se tient sans photo. Coûte : des fiches
  inégales (le golfe d'Aden, Bir Tawil).
- b) Au moins une partout : ≈ 3 h de recherche à la main en plus, à
  l'utilisateur ou à Claude (estimé).
- c) Au moins 3 partout : pas tenable pour une vingtaine de lieux (îlots
  disputés, mers lointaines), sauf à prendre des photos médiocres.
- Recommandation : **a**, et les mers pauvres complétées à la main par
  Claude (§ 3.1).
- Défaut codé en attendant : a.
- Bloque : la clôture de P1 (la liste figée des lieux sous 3 photos).

### Bloque le lot F8

**D61. Voisins sur le téléphone : montrer où est le lieu.** Le besoin donne
aux voisins cet intérêt : leur toucher « ouvre leur fiche et fait voler la
carte jusqu'à eux ». Sur le téléphone, la fiche est opaque et couvre
presque tout l'écran : le vol ne se voit pas (§ 4.5). La fiche ne montre
jamais où est le lieu, ce qui aide le plus à retenir. Le choix touche un
choix accepté (« la barre qui grandit ») : il revient à l'utilisateur.
- a) **Toucher un voisin referme la fiche sur la barre** : on voit le vol,
  puis la barre du voisin ; un toucher sur la barre rouvre sa fiche.
  Coûte : deux touchers par voisin, au lieu d'un ; la pile des fiches se
  coupe à chaque passage. Apporte : le vol se voit, sans rien coder de
  neuf.
- b) **Une carte de situation dans la tête de la fiche** : une petite carte
  de la région, le lieu éclairé, sur le modèle des vignettes des tuiles de
  Jouer (`vues/vignettes.ts`, rien de plus à télécharger). Coûte : un lot
  M (F8), et une mesure de fluidité (le calcul d'une vignette prend
  quelques dizaines de ms, `vues/vignettes.ts` : à faire en temps libre).
  Apporte : chaque fiche, la première comprise, montre où est le lieu.
- c) **Garder la conception** : le vol se fait sous la fiche, et on le voit
  à la fermeture. Coûte : rien. Perd : ce que le besoin attend des voisins,
  sur le téléphone.
- Recommandation : **b**.
- Défaut codé en attendant : c (le lot F1 tel qu'écrit).
- Bloque : le lot F8 seulement.

### Relectures demandées à l'utilisateur

Ce ne sont pas des décisions : des tableaux à valider avant leur mise en
ligne, comme les listes du quiz facile.

| Quoi | Lignes | Lot |
|---|---|---|
| fêtes nationales | ≈ 195, dont 19 à plusieurs jours | F2 |
| gentilés | 22 pays, 4 communes | F2, F5 |
| points culminants | 12, plus les écarts à la seconde source | F2 |
| langues, selon D56 | ≈ 110 | F2 |
| pays touchés par une zone disputée et leur superficie, selon D57 | 30 | F2 |
| statut et tenant des 12 zones, dont le Sahara occidental | 12 | F3 |
| formes de statut des territoires (pays constitutif, région administrative spéciale…) | ≈ 20 | F3 |
| pays riverains et superficies des mers | 45 mers, ≈ 25 exclusions, ≈ 10 corrections | F4 |
| photos | 332 lieux | P1 |

Et une action : borner les versions gardées par Hosting, avant le premier
déploiement des photos (lot P2).

## 10. Non retenu

- **Interface** :
  - une feuille à trois états, la carte recadrée au-dessus : à-coups
    probables, taille L ;
  - la fiche comme une vue à part (`#fiche/JPN`) : la barre ne « grandit »
    plus ;
  - un lien partageable vers une fiche : hors de la demande ; à reprendre si
    on veut envoyer une fiche à quelqu'un ;
  - la feuille qui suit le doigt : un seuil suffit ;
  - sur PC, un panneau latéral qui laisse la carte vivante : à reprendre si
    la fiche sert surtout sur grand écran ;
  - la recherche qui ouvre la fiche directement ;
  - une fiche par-dessus le bilan, sans carte ;
  - seul le nom du lieu en lien dans une ligne de bilan : il faudrait couper
    ≈ 22 modèles de texte ;
  - un bouton « Fiches de mes erreurs », avec suivant et précédent : à
    reprendre si l'on révise beaucoup depuis les bilans ;
  - un état de partie commun aux cinq vues : propre, mais il touche cinq
    vues ; la liste testée suffit ;
  - les mers voisines dans la fiche d'une mer : la donnée existe
    (`mers.json`), une ligne à ajouter si on la veut ;
  - la « × » d'une fiche ouverte depuis un bilan qui ramènerait au bilan
    (proposition de R1, D61 de la rédaction) : la décision « Croix vers la
    carte » tranche déjà, sans raison nouvelle de la rouvrir ;
  - l'entrée d'historique de la fiche dans un lot à part (F8 de la
    rédaction) : sans elle, le retour du navigateur fait sortir du site ;
  - un `retourFiche()` propre à l'APK, à côté de l'historique : il laissait
    une entrée orpheline ;
  - cacher capitale et drapeau seulement, pendant une partie en suspens,
    au lieu de toute la fiche : deux règles d'affichage au lieu d'une ;
  - fermer la carte tant qu'une partie de Toucher attend : la fuite des
    noms existe déjà, hors du ticket ; à reprendre si l'utilisateur la
    veut fermée ;
  - le toucher à côté de la fiche qui touche aussi la carte (PC) : il
    pinçait et zoomait sous la fiche sur le téléphone ; le voile fait une
    seule règle.
- **Données** :
  - Wikidata pour les habitants des pays (années de 2005 à 2026) ; la
    Banque mondiale pour les superficies (eaux comprises) ; P421 pour les
    fuseaux (des décalages, pas des zones) ; P832 pour les fêtes ;
  - la surface du tracé comme superficie affichée : elle suit le contrôle
    de fait (l'Ukraine sans la Crimée) ;
  - le texte de `note_ne` comme statut d'une zone (« Self admin. » pour le
    Sahara occidental) ;
  - repérer les pays disputés par l'écart au tracé (il manquait l'Inde) ;
  - `Intl.supportedValuesOf('timeZone')` pour tester les zones : anciens
    noms ;
  - une seule zone horaire pour les îles mineures des États-Unis ;
  - une fiche pour les 77 zones hachurées, et leur liste dans la fiche du
    pays : elles n'ont ni nom français ni entité ;
  - la fête nationale d'un territoire ; le point culminant et le cirque
    d'une commune ; l'arrondissement et le code postal ;
  - la liste des pays riverains d'un océan ;
  - un extrait de texte de Wikipédia (il faudrait créditer chaque article) ;
  - le volume d'une mer, son point le plus profond (7 mers sur 50) ;
  - un seul fichier pour toutes les fiches ; des tableaux sans clés ;
  - le Factbook lu par le build : une source arrêtée, que la table à la
    main remplace.
- **Mémoire** :
  - ajouter le lieu seul à la grappe qui venait ;
  - la préférence au journal ; détourner un événement `libre` ou `connu`
    pour la porter ;
  - capitale et drapeau le même jour que le nom ;
  - un bouton « Revoir maintenant » pour un lieu appris : les révisions
    suivent leurs échéances ;
  - un texte « Déjà dans ta mémoire » à la place du bouton : la ligne de la
    mémoire le dit ;
  - les proches de grappe montrés comme « voisins » d'une île : les grappes
    sont géométriques, pas frontalières.
- **Photos** :
  - les photos dans le manifeste du service worker (+ 35 Ko compressés par
    visiteur et par déploiement, mesuré) ;
  - un fichier unique de toutes les listes ;
  - `loading="lazy"` seul ;
  - tout embarquer dans l'APK (≈ 145 Mo) ; ne rien y embarquer ;
  - « Featured pictures » comme source ; l'image P18 d'une mer (une carte) ;
  - une taille intermédiaire de 720 × 480 : à reprendre si la vignette
    paraît floue sur le téléphone (S52) ;
  - Git LFS ; la régénération à chaque build ;
  - les licences « Attribution », OGL, GFDL, Free Art License ;
  - Wikivoyage et la recherche géographique de Wikipédia comme sources : pas
    essayées ; à reprendre pour les pays sans site du patrimoine mondial ;
  - la vérification mensuelle par une tâche planifiée : rien d'obligatoire
    sur le Pi ; elle se lance à la main ;
  - le cache des photos sous le préfixe `terramemo-` : trois endroits à
    changer (`cachesPerimes`, `reprendre`, le `smoke`) pour rien ;
  - les listes par lieu et `credits.json` gardés comme fichiers ignorés :
    absents d'un arbre de travail neuf et de la CI ;
  - les WebP hors de `public/`, copiés au déploiement seulement : à
    reprendre si la copie au build dépasse 5 s (mesure du lot P2).
- **Du besoin**, déjà écartés par l'utilisateur : chef d'État et régime,
  religions, PIB, indicatif, domaine internet ; une fiche par capitale.

## 11. Suppositions à vérifier

La numérotation suit celle du J2 (S26 à S40).

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S41 | Ouvrir et fermer la fiche ne donne aucun à-coup sur l'A37 | scénario du pilote en `--preview`, puis sur le téléphone | lot F1 |
| S42 | Le toucher de la carte reste sous 100 ms en médiane avec la barre nouvelle et le chargement au premier toucher | `touchers_reels.py`, APK et Chrome | lot F1, puis F2 |
| S43 | `Intl.DateTimeFormat` avec `timeZone` rend l'heure juste dans la WebView de l'A37, accepte les noms de `zone.tab` 2026e (`Asia/Kolkata`, `Europe/Kyiv`, `America/Nuuk`), et lève une erreur attrapable pour une zone inconnue. Node 24.19 a tz 2026b, la WebView sa propre version | la fiche du Népal, de l'Inde, de l'Ukraine et des îles Chatham sur le téléphone | lot F2 |
| S44 | Glisser la barre vers le haut ne déclenche pas le geste système d'Android | essai sur l'A37, navigation par gestes | lot F1 |
| S45 | Dans l'APK, le lien Wikipédia s'ouvre dans le navigateur du téléphone, et le retour ramène à l'appli intacte | essai sur l'A37 | lot F1 |
| S46 | Le World Factbook est dans le domaine public | **close** (17/11) : oui. Page « Copyright and Contributors » du CIA, copie du 05/12/2025 (`web.archive.org/web/20251205053024/https://www.cia.gov/the-world-factbook/about/copyright-and-contributors/`) : « Factbook data, including photos and maps, is the public domain and may be copied freely without permission from the Central Intelligence Agency (CIA) » (le sceau du CIA excepté) ; 17 U.S.C. § 105 (a) : « Copyright protection under this title is not available for any work of the United States Government ». Rien du Factbook au build : la table des fêtes fait foi | lot F2 |
| S47 | La Banque mondiale publie cette série sous CC BY 4.0, et la mention prévue suffit | **close** (17/11) pour la licence : CC BY 4.0 (métadonnées de `SP.POP.TOTL` et `https://www.worldbank.org/ext/en/legal/terms-conditions/datasets`, citées dans `geodata/banque-mondiale/population.json`). La mention prévue ne suffit pas seule : la page demande le format « The World Bank: <jeu>: <source> » et, pour des données redistribuées, l'adresse de ces conditions ; à mettre dans Crédits | lot F2 |
| S48 | Hosting n'a pas de limite de fichiers qui gêne 2 400 à 3 000 fichiers ; le réglage des versions gardées existe | la documentation, puis la console | avant P2 |
| S49 | Un fichier inchangé d'une version à l'autre ne compte qu'une fois dans le stockage | la console, après deux déploiements d'essai | lot P2 |
| S50 | La miniature de 1 920 px de Commons se télécharge sans blocage, à une requête à la fois | les 50 premières photos | lot P2 |
| S51 | ≈ 21 % des lieux sont pauvres en photos (3 lieux sur 14) | le compte réel après le script sur les 332 lieux | lot P1 |
| S52 | Une vignette de 480 × 320 paraît nette dans la fiche du téléphone | essai sur l'A37 ; sinon la taille 720 × 480 (47 Ko) | lot P2 |
| S53 | Le cache HTTP de la WebView garde les pleins écrans déjà vus | l'APK, mode avion après une première vue | lot P3 |
| S54 | Des photos CC BY-SA dans la fiche ne changent pas la licence du code ni des autres données (collection) | lecture des licences ; à faire relire par l'utilisateur | lot P2 |
| S55 | Le vol de la carte sous la fiche ne donne pas d'à-coup dans la fiche | scénario du pilote ; sinon l'option « sans vol » | lot F1 |
| S56 | Le sommet de chacun des 12 pays à trancher tombe dans son tracé de fait | **en partie fausse** (17/11, `tests/donnees-fiches.test.ts`) : les sommets retenus des 197 pays sont dans leur tracé ou à moins de 10 km, sauf 4, figés : Gambie et Sénégal (sans coordonnées), Marshall et Tuvalu (atolls absents du tracé simplifié). Serbie : Velika Rudoka est à 75 km (Kosovo), remplacé par le Midžor (2 169 m). Décision du 18/11 : aucun point culminant ne passe par une zone disputée (le build échoue sur un sommet dans une zone de `contestees.json`) : **Israël**, le mont Méron (pas l'Hermon, dans le Golan) ; **Somalie**, pas de ligne de sommet (Shimbiris est dans le Somaliland) ; et, trouvé par la même règle, **Pakistan** : le K2 est dans le Gilgit-Baltistan, remplacé par le Tirich Mir (7 708 m), à relire ; **Guyana**, pas de ligne de sommet (la part du Guyana sur le Roraima est dans l'Essequibo ; le contrôle compte depuis le 18/11 la part du pays d'un sommet de frontière), à relire. Belize, Bhoutan et Syrie ont leur sommet à 5 km ou moins d'une zone (tracé simplifié) : à la relecture. Le test ne voit pas un sommet de frontière dont le pays n'a qu'un flanc (moins de 10 km) : **Finlande** (Halti : 1 361 m en Norvège, 1 324 m sur le versant finlandais) et **Pologne** (Rysy : 2 499 m au pic nord-ouest, 2 501 dans Wikidata), corrigés à la main (contre-vérification du 17/11) ; d'autres ne sont pas cherchés (Mont-Blanc pour l'Italie, Khan Tengri) | lot F2 |
| S57 | L'ordre des clés d'un cache est celui de leur entrée, ce qui permet de retirer les plus anciennes | la spécification, et un essai dans Chrome | lot P2 |
| S58 | Les 59 QID des territoires et des zones désignent le bon lieu | relecture de la table, libellé français à côté | lot F3 |
| S59 | Le gris des libellés a un contraste de 4,5 au moins sur le fond de la fiche | **close** : 6,17, mesuré (`#91949b` sur `#111214`, § 4.11) | — |
| S60 | (sans objet : l'option b de D57 est écartée le 18/11, voir D57) | close (18/11) | — |
| S61 | Le traité Royaume-Uni–Maurice sur les Chagos (mai 2025) n'a pas changé leur statut, ou on sait comment | une source datée ; la ligne de la table porte la date | lot F3 |
| S62 | La règle « zone de `zone.tab` dans le tracé de l'entité » donne 5 fuseaux à la France et n'en invente pas ailleurs | **en partie fausse** (17/11) : la France en a 5, les Pays-Bas 2 (Bonaire), la Nouvelle-Zélande 3 (Tokelau, dans son tracé) ; 20 pays à plusieurs fuseaux, figés par le test. Mais la règle (le plus grand des deux jours) compte une heure d'été comme un fuseau : **États-Unis 7** (l'été, l'Aléoutienne et Hawaï divergent) et **Australie 6** ; et la **Chine 2** (Asia/Urumqi, « Xinjiang Time », heure d'usage, pas légale). Le décompte par décalage d'hiver de chaque zone (le plus petit des deux jours) donnerait 6 et 5. **Adopté** le 17/11 (contre-vérification : les 50 États ont 6 fuseaux légaux) : États-Unis 6, Australie 5. Décision du 18/11 (heure légale) : la Chine 1 (Asia/Urumqi est une heure d'usage) et la Nouvelle-Zélande 2 (Tokelau aura les siens au lot F3), deux lignes de la table | lot F2 |
| S63 | Le mont Fuji fait 3 776 m (et non 3 777, Wikidata) ; les autres sommets de la table concordent avec une seconde source à 5 m près | **en partie fausse** (17/11) : le Fuji à 3 776 m (ligne de la table ; la valeur de l'institut japonais, 3 776,24 m, est citée de mémoire). Seconde source : Wikipédia en français, « Liste des pays par point culminant » (révision 240366193, qui reprend surtout le Factbook). 26 pays s'en écartent de plus de 5 m ou y nomment un autre sommet (Arabie saoudite, Koweït, Namibie, Sénégal…) : chacun a sa ligne (`seconde`), valeur de Wikidata gardée, à relire ; 8 altitudes doubles sans rang tranchées par elle ou par le qualificatif de la déclaration du pays | lot F2 |
| S64 | Copier 105 à 138 Mo de photos de `public/` vers `dist/` ajoute moins de 5 s au build | `time npm run build`, avec et sans les photos | lot P2 |

## 12. Sources et écarts des relevés

**Relevés** (`~/Sauvegardes/terramemo/fiche-lieu-conception/`) :
- `releves/R1-accueil.md`, `R2-memoire.md` (script `r2-grappes.mts`),
  `R3-donnees-pays.md`, `R4-donnees-mers-communes.md`, `R5-photos.md` ;
- `donnees-pays/` : `scripts/`, `brut/` (réponses des requêtes), prototypes
  (`proto-fiches-*.json`), tables proposées (`lieux-qid.json`,
  `souverainete-ne.json`, `fetes-factbook.json`,
  `culminants-proposes.json`, `gentiles-masc-proposes.json`,
  `fuseaux-proposes.json`, `langues-regle.json`, `monnaies-regle.json`) ;
- `donnees-mers-communes/` : extraits Wikidata, `riverains-geo.json`,
  `comparaison-riverains.json`, `ign-communes.json`, prototypes, scripts ;
- `photos/` : `scripts/`, `candidats-wikidata.json`,
  `commons-candidats-info.json` (1 917 fichiers), `sheets/` (planches),
  `essais/` ;
- `synthese/scripts/` : `lieux.py` (comptes du § 1 et du § 2) et
  `manifeste-photos.py` (§ 3.6), écrits pour cette rédaction.

**Code** : commit `3ba6e31`. Fichiers cités au fil du texte.

**Externes** (relevés du 16/11) : Wikidata (SPARQL et API) ; API de la
Banque mondiale ; cldr-json 49.0.0 ; tzdata 2026e ; miroir `factbook.json`
(commit `144d697`) ; API de Commons ; Wikipédia française (contrôle des
mers et des gentilés). La rédaction n'a fait aucune requête : elle a relu
les extraits des relevés.

**Écarts trouvés en revérifiant** :
- **Service worker et photos (R5)**. Le relevé écrit qu'une photo hors du
  manifeste n'est jamais gardée : exact. Mais il n'a pas vu que le build
  met dans le manifeste chaque fichier de `dist/` (`vite.config.ts:63-72`) :
  sans rien faire, les photos y seraient. Il écrit aussi que le cache est
  vidé à chaque version, donc les photos retéléchargées : faux pour un
  fichier du manifeste, que `reprendre` recopie (`sw/logique.ts:241-257`).
  Sa conclusion tient, pour une autre raison : le poids de `sw.js`. Il
  l'estimait à + 120 Ko ; mesuré ici, + 122 Ko bruts, soit + 35 Ko
  compressés.
- **Constante du site (R5)**. Le relevé dit que `terramemo-geo.web.app`
  n'est pas dans le code. Elle y est : `SITE_EXPORT`, `sync/export.ts:24`.
- **Nombre de lieux (R5)**. 331 dans le relevé ; 332 avec l'Antarctique.
  Son exemple d'id `ADN` n'existe pas : le golfe d'Aden est `aden`. La mer
  de Weddell, prise en essai, n'est pas une des 50 zones.
- **Habitants des communes (besoin)**. « Déjà dans les données » : non. Les
  clés de `communes.json` sont `bbox`, `id`, `micro`, `partie_max_km2`,
  `point`, `statut`, `superficie_km2`, `voisins`. Ils sont dans le
  GeoPackage (R4).
- **Cache à l'usage (besoin)**. « Le service worker garde déjà ce qui est
  chargé à l'usage, comme les drapeaux » : vrai parce que les 199 fichiers
  de drapeaux sont au manifeste. Une photo n'y serait qu'au prix du § 3.6.
- **Océan de rattachement (besoin)**. Il cite
  `geodata/mers-affectations.json`. Ce fichier est la table des zones de
  Natural Earth ; l'océan est le champ `bassin` de `public/geo/mers.json`.
- **« tenue par… » (besoin)**. La barre ne le dit pas, et les 12 entités
  contestées n'ont pas de tenant dans les données (R1 et R3, concordants ;
  vérifié : `map/types.ts:29-32`, `map/acceptes.ts:33-41`). Mais le code en
  connaît le tenant en commentaire (`map/acceptes.ts:33-37`) : la table à la
  main reçoit une clé `tenant`, et la fiche dit « tenue par… » comme le
  besoin le demande (§ 2.2, après relecture).
- **Moment du chargement (besoin)**. « Au premier toucher de la barre » et
  « à la première ouverture d'une fiche » : aucun des deux ne remplit la
  barre. Tranché : au premier toucher d'un lieu (§ 6.1).
- **Poids des données (besoin)**. ≈ 50 Ko estimés ; ≈ 20 Ko mesurés.
- **Langues (R3)**. Le relevé compte 3 dialectes à écarter. Son prototype en
  montre bien plus, et l'anglais non officiel dans 44 pays : D56.
- **Gentilés des territoires (R3)**. « 16 sur 48 » en tête du relevé, « 11
  sur 48 » dans son tableau. Recompté sur le prototype : 11.
- **Pays sans voisin (R2, R3)**. 37 pour l'un, 38 pour l'autre : 37 pays
  jouables, plus Taïwan.
- **Voisins non jouables (R2, R3)**. « 23 pays » et « 24 liens » ne
  comptent pas la même chose : 23 pays jouables ont un voisin non jouable ;
  cela fait 28 liens, 24 sans les 4 du Kosovo.
- **Pays riverains (R4)**. Le prototype ne porte que le calcul par le
  tracé : Saint-Marin y est, Malte n'y est pas. L'union et les exclusions
  restent à faire (lot F4).
- **Numéros de ligne**. R1 : `Lieu.voisins` est à `map/types.ts:21`, pas
  `:19` ; `revendique_par` d'un pays à `:29-30` (les lignes 36 à 52 sont la
  zone hachurée) ; `vues/textes.fr.json` fait 1 152 lignes, pas 1 379. R2 :
  la règle « jamais pendant que v vaut 1 » est à `sync/lots.ts:21-22`, pas
  `:24-25`.
- Vérifiés et confirmés :
  - `vues/accueil.ts` est l'écran de connexion ; la barre est dans
    `vues/explorer.ts` ;
  - aucun test ne lit la règle qui efface la recherche (`carte.css:408`) ;
  - `nav.retour()` rend le bilan d'une partie finie ;
  - `programme` porte seul le budget ; `grappeSuivante` est pure ;
  - un type d'événement inconnu rend le lot illisible ;
  - `geodata/reunion.mjs` ne lit pas la population ;
  - l'APK embarque tout `dist/` ; `index.html` n'a pas de CSP ;
  - le dépôt pèse 63 Mo, `dist/` 5,4 Mo ; `sw.js` a 246 entrées.

## 13. Relectures intégrées

Deux relectures adverses (16/11) : « code et technique » (16 constats, dont
9 importants) et « données, produit, licences » (19 constats, dont 1
bloquant et 9 importants). Rapports :
`~/Sauvegardes/terramemo/fiche-lieu-conception/relecture-code-technique.md`
et `relecture-donnees/constats.json`. Chaque constat a été revérifié dans le
code ou les données avant d'être intégré. Scripts de la correction :
`correction/` (`rang-serie.mts`, `pays-touches.py`, `habitants-zero.py`,
`hors-zones.py`).

**Ce qui a changé le plus :**
- **Superficie d'un pays disputé (bloquant).** Wikidata n'est pas « le
  chiffre que le pays publie » : la Serbie y compte le Kosovo, l'Inde tout
  le Cachemire, le Maroc pas le Sahara. D57 est réécrite, puis tranchée le
  18/11 : Wikidata pour tous, citée, et les 30 pays touchés à la relecture. Les pays se repèrent par `revendique_par` et `contestees.json`
  (68 touchés, 30 à 1 % ou plus), plus par l'écart au tracé, qui manquait
  l'Inde.
- **Statut des zones.** `note_ne` n'est plus recopiée (« Self admin. » pour
  le Sahara occidental, que le Maroc tient en majeure partie). Une clé
  `tenant` de 12 lignes rend le « tenue par… » du besoin. Le tableau des
  cas est refait, ligne par ligne, et relu par l'utilisateur.
- **Territoires.** Une forme de statut par sorte (pays constitutif, région
  administrative spéciale, dépendance de la Couronne, État associé…) au
  lieu de « Territoire de X » pour tous.
- **Historique dans le lot F1.** Chaque fiche est une entrée d'historique,
  posée par `navigation.ts` ; tous les retours font `history.back()`. Le
  lot F8 de la rédaction est fondu dans F1 : sans lui, le retour du
  navigateur fait sortir du site.
- **Partie en suspens.** Une partie de Toucher quittée attend sur la
  carte. La fiche, les faits et le chevron s'y effacent
  (`essai.enSuspens()`).
- **« Apprendre ce lieu ».** L'état du bouton vient de la fabrique des
  séances (`comptes()` et un refus partagé avec `ouvrir()`), avec deux
  états de plus ; le lancement passe par `lancer()`. Le gain est chiffré
  par série (0 à 7 jours) et par Révision du jour (22e, 30e jour) : D58
  garde sa recommandation, justifiée autrement.
- **Photos.** Champ `Attribution` préféré ; une photo CC BY sans auteur
  identifiable est refusée ; « recadrée » sous la photo, titre dans
  Crédits, liberté de panorama dans la règle de relecture ; rien de coché
  d'avance pour les lieux sensibles. Listes et `credits.json` écrits par le
  build ; `photos:restaurer` pour un arbre de travail neuf ; cache hors du
  préfixe `terramemo-`. D59 gagne l'option d (release GitHub), recommandée.
- **Questions.** L'ancienne D61 (« × » depuis un bilan) passe au § 10 : la
  décision « Croix vers la carte » tranche. Le numéro D61 va aux voisins
  sur le téléphone (le vol invisible) ; le numéro F8 au lot de la carte de
  situation qu'elle ouvrirait.

**Intégrés aussi :**
- le test des fuseaux construit `Intl.DateTimeFormat` au lieu de lire
  `supportedValuesOf`, qui donne les anciens noms (mesuré dans Node 24.19) ;
- les fuseaux comptés par le tracé de l'entité (la France : 5) ; pas
  d'heure pour les îles mineures des États-Unis ;
- la hauteur réservée de la barre suit le cas complet (3 lignes avec la
  mémoire) ; la barre reste mise en page sous la fiche ;
- un voile autour de la fiche ; le zoom caché ; Échap fait un pas, sauf
  popup ⚙ ouverte ; ⚙ ne ferme pas la fiche ;
- le plein écran d'une photo dans l'historique ;
- habitants à 0 : « aucun habitant permanent » ; comptes corrigés ;
- le cas `no`/`nb` de la Norvège ; la ligne « Langues » pas en ligne avant
  D56 ;
- la règle des superficies à plusieurs valeurs et celle des altitudes
  (le Fuji) ; une seconde source pour les sommets ;
- les pays riverains : retrait d'office des souverains en double, ≈ 25
  exclusions au lieu de ≈ 15 ;
- l'Antarctique dans la couverture ; les Chagos à dater ;
- l'APK dans le budget de transfert ; la copie de `public/` et le `grep`
  du `predeploy` ;
- le critère du lot F1 (une entrée vide pour les 61 entités sans données) ;
- les renvois : marges de sécurité sur `body`, `credits.ts:61`, `voler` à
  `carte-canvas.ts:833`, 23 sous-régions ; S59 close (6,17).

**Écarté ou nuancé :**
- « 43 territoires habités sur 48 » (relecture) : recompté, 42. Clipperton
  est aussi à 0 habitant. Le constat tient, le chiffre est corrigé.
- « 10 fichiers CC BY-SA "Auteur inconnu" » (relecture) : recompté, 9 pour
  BY ou BY-SA. Le constat tient.
- « Le Japon au 22e jour est faux » (relecture) : vrai pour Apprendre, qui
  filtre par série ; faux pour la Révision du jour, qui suit l'ordre global
  (`vues/seance.ts:277`). Les deux ordres sont maintenant dans le § 5.1, et
  D58 b garde sa recommandation.
- « Un critère de jure à nommer » (relecture) : retenu un temps comme
  recommandation (D57 b), écarté le 18/11 (D57).
- « Superficie hors zones contestées » (relecture) : gardée comme option
  (D57 c), pas recommandée. Mesurée, elle donne 54 738 km² au Guyana : elle
  grossit l'effet d'une revendication.
- « Renommer le cache, ou changer trois endroits et ajouter `driver.py` à
  P2 » : le nom hors du préfixe suffit ; `driver.py` ne change pas.
- « Copier les photos hors de `public/` » : pas tout de suite ; la copie
  est à mesurer au lot P2 (S64), seuil de 5 s.

## 14. Écarts du code au lot F1

Relevés par le codeur et la correction du lot F1 (branche `fiche-lieu`) :
- `router()` rend la fiche à la fin, après `activer()`, et non « avant le
  test de `traversee` » (§ 4.4) : `pousserFiche` et `quitterFiches` remettent
  `traversee` à zéro. Aucune suite de gestes trouvée qui saute une fiche ;
  les tests de navigation le couvrent.
- Recharger la page sur une entrée de fiche rend **la carte seule** : le
  premier `router()` remonte l'entrée au lieu de rouvrir la fiche, pour tenir
  le § 6.1 (rien de la fiche au premier affichage).
- Une entrée de fiche porte la marque `#fiche` : la « × » d'une vue ouverte
  par-dessus (Jouer, 🏆, Crédits) la saute et rend la carte seule
  (« Croix vers la carte ») ; « Retour » rouvre la fiche, un pas en arrière.
- `geodata/fiches.mjs` est une partie du build (`build.mjs --seulement
  fiches`, `npm run fiches`) : sinon un build complet effacerait son
  empreinte de `sources.json`.
- La ligne de la mémoire passe de `.barre-detail` à `.barre-memoire`
  (§ 4.1, trois lignes).
- Sous-régions : noms français de la norme M49, dont « Amérique
  septentrionale » (Northern America), pour ne pas la confondre avec le
  continent « Amérique du Nord » (`geodata/fiches-main.json`).
- Le scénario de mesure du § 6.4 vit dans `driver.py fiche` (et `ui_fiche`),
  pas dans `driver.py mesurer` ; chemin fixe France, Brésil, Argentine.

## 15. Écarts du code au lot F2

Relevés par le codeur du lot F2 (branche `f2-donnees`, données sans l'interface) :
- Les règles du choix vivent dans `geodata/fiches-pays.mjs` et les tableaux à relire dans
  `geodata/fiches-relecture.mjs` ; `fiches.mjs` les assemble. Le build écrit aussi
  `docs/relectures/fiches-pays.md`, hors de `public/`.
- `construireFiches` lit CLDR et tz dans `geodata/raw/` : le test de reproduction ne tourne
  que là où ils sont (`skipIf`, comme celui des drapeaux) ; les autres tests lisent les
  fichiers commités et les extraits versionnés, en CI.
- Fêtes : 195 pays sur 197 ont une fête ; pas de ligne pour le Royaume-Uni (§ 2.1) ni pour
  la **Bosnie-Herzégovine** (quatre jours, deux par entité, aucun pour l'État commun), à relire.
  La liste de la Wikipédia sert de seconde source (elle suit les fêtes déclarées à l'ONU).
- Superficie : au km², au centième sous 100 km² (le Vatican : 0,44).
- Gentilés : la règle prend aussi une forme « masculin singulier et masculin pluriel »
  (Japonais) ; elle laisse 18 pays à plusieurs formes, plus le Vatican (« Vaticanais », à
  relire), et 4 graphies corrigées (Sud-Coréen, Nord-Coréen, Saint-Marinais, Néo-Zélandais).
- Langues : au-delà des retraits, 3 ajouts écrits (romanche en Suisse, tamazight en Algérie,
  amazighe standard au Maroc), et le français retiré des officielles de l'Algérie, du Maroc
  et de la Tunisie, où CLDR le marque officiel : à relire.
- Un sommet en mer, une zone horaire en mer : la distance au tracé se mesure aux segments,
  en projection locale (`distanceAuTrace`), en suivant l'antiméridien.

Après la contre-vérification du 17/11 :
- Fuseaux : décalages normaux (d'hiver) de chaque zone, et non le plus grand des deux jours.
- Langues : deux clés de plus dans la table, `parts` (une part écrite à la main, avec sa
  source : le Pakistan au recensement de 2023) et `ordre` (l'ordre des officielles : le
  kazakh avant le russe). Une officielle de CLDR ajoutée avec `officielle: false` reste en
  langue parlée (russe en Ukraine, wolof au Sénégal, yoruba au Nigeria). Relues contre
  CLDR : l'anglais retiré à Madagascar (Constitution de 2010), le latin au Vatican, et les
  douze officielles de l'Afrique du Sud (CLDR n'en marque qu'une). Les autres
  « official_regional » nationaux (Macédoine du Nord, Bolivie, Zimbabwe) ne sont pas relus.
- Sommets : Finlande (versant sud du Halti, 1 324 m), Pologne (2 499 m), Gambie (point sans
  nom près de Sabi, 63 m d'après le Factbook récent : « Red Rock » n'a qu'une source).
- `sources.json` a trois lignes de plus : les pages de Wikipédia citées par la table, le
  Factbook, l'ISO 639.

Après les décisions de l'utilisateur du 18/11 :
- Superficie : Wikidata pour les 197 pays, citée « selon Wikidata », par la règle du choix
  (§ 2.1) ; la clé `superficie` n'a plus que la liste des 30 pays touchés, dont le tableau
  montre Wikidata, la surface du tracé et l'écart ; les 18 pays à plusieurs valeurs ont le
  leur, et le test les fige.
- Sommets : aucun dans une zone disputée, vérifié par le build (faute) et par le test.
  Israël garde le mont Méron ; la Somalie n'a pas de ligne de sommet (clé `aucun`) ; le
  Pakistan prend le Tirich Mir (Wikidata Q207132, 7 708 m ; Wikipédia en français : point
  culminant de l'Hindou Kouch), qu'il soit le plus haut hors des zones étant estimé : à
  relire. Les sommets à 5 km ou moins d'une zone (Belize, Bhoutan, Syrie) vont à la relecture.
  Relecture du lot : le contrôle partait de la coordonnée de Wikidata, qui pour un sommet de
  frontière peut être chez le voisin ; il compte maintenant, pour une zone que le pays tient,
  la distance au-delà de celle du tracé (la part du pays). Il a trouvé le **Guyana** : la
  coordonnée du Roraima (2 810 m) est au Venezuela, la part du Guyana dans l'Essequibo (NE_B56,
  tenu par le Guyana, revendiqué par le Venezuela), le cas du K2. Aucune source lue ne donnant
  le plus haut point du reste du pays : `aucun`, à relire (sinon le Roraima par exception).
- Fuseaux : heure légale au décalage d'hiver ; deux lignes `nz`, la Chine 1 et la
  Nouvelle-Zélande 2.


Interface du lot F2 (fiche, barre, Crédits) :
- Lignes à relire : une seule constante, `LIGNES_RELUES` (`src/fiches/relues.ts`), à la place
  de `LANGUES_EN_LIGNE` : superficie, langues, gentilé, point culminant et fête, toutes à
  `false` tant que leur tableau (`docs/relectures/fiches-pays.md`) n'est pas relu, à passer à
  `true` une par une. Les données restent servies ; la fiche les tait, et son pied ne cite que
  ce qu'elle montre (« superficie selon Wikidata », le World Factbook, seulement avec leur
  ligne). Les tests passent les deux états (`composerFiche`, `relues`). Une ligne de sommet ou
  de gentilé écrite à la main hors de Wikidata nomme sa source (clé `cite` de la table, servie
  en `cs` et `gs`, exigée par le build) : « CIA World Factbook » pour le sommet de la Gambie,
  « Wikipédia » pour 6 sommets (Argentine, Azerbaïdjan, Érythrée, Finlande, Japon, Pologne) et
  5 gentilés (Guinée-Bissau, Lesotho, Nouvelle-Zélande, Papouasie-Nouvelle-Guinée, Vatican).
- Langues : les officielles en liste lue (« allemand, français, italien et romanche »), puis
  chaque langue parlée avec sa part, séparées par « · » (« portugais · umbundu 29 % ·
  kimboundou 25 % »).
- Fête : le nom tel que le fichier de langue l'écrit, avec sa majuscule (« 23 février ·
  Anniversaire de l'empereur ») : aucune règle de casse dans le code. « 1er » le premier du
  mois (`textes.fiche.premier_jour`).
- Heure : l'écart à l'heure de l'appareil, sur les deux heures murales ; le formateur de la
  zone est créé au repos dès que le pays est dans la barre (`prechaufferZone`), la fiche n'en
  crée aucun. Sans capitale lue : « Heure locale ». Une capitale dont « à » et le nom seraient
  faux a son complément tout fait dans le fichier de langue (`hc`, clé `heure_a` de la table) :
  « Heure au Caire », « Heure à la Cité du Vatican » ; le build exige la ligne d'une capitale
  en « Le » ou « Les » (relecture du lot ; « à La Havane », « à La Valette » restent justes).
- Barre : la ligne de faits tient sur une ligne, coupée par « … » plutôt que de grandir la
  barre (`carte.css`) ; « d'hab. » après un mot (« 123 millions d'hab. »), « hab. » après un
  nombre (« 56 800 hab. »).
- Crédits : la ligne de l'IGN est inchangée (les habitants des communes viennent au lot F5) ;
  celle de Wikidata ne dit pas encore les profondeurs (lot F4). La Banque mondiale porte la
  mention de ses conditions (« The World Bank: World Development Indicators, Population, total
  (SP.POP.TOTL): … ») et leur adresse en lien.

## 16. Écarts du code au lot F3

Relevés par le codeur du lot F3 (branche `fiche-lieu`, 18/11). Les statuts (première partie,
`fiches-territoires.mjs`, `docs/relectures/fiches-territoires.md`) sont décrits par leurs commits ;
ici, la suite.
- Les chiffres des 61 autres lieux vivent dans `geodata/fiches-autres.mjs`, qui reprend les règles
  des pays (`fiches-pays.mjs` : superficie, habitants, gentilé, sommet, et `languesLieu`, sortie
  telle quelle de la boucle des pays) ; son tableau à relire est un fichier à part,
  `docs/relectures/fiches-territoires-chiffres.md` (9 sections), pour ne pas toucher à celui des
  statuts. Cinq clés de plus dans la table : `capitale_territoires`, `zone_territoires`,
  `langues_territoires` (avec ses `noms`), `gentile_territoires`, `culminant_territoires` ; `wp`
  vaut pour toute entité (Akrotiri et Dhekelia : l'article des deux bases).
- Wikidata : l'extrait des fiches est refait le 18/11 pour les 258 items ; une section de plus
  dans `requetes-fiches.rq`, `capitales` (P36, pour les seuls territoires, `{{territoires}}`), les
  autres requêtes inchangées. Seul changement pour les pays : la superficie du Mexique
  (1 960 647 → 1 964 375 km²).
- Habitants : 43 territoires sur 48 (et non 45) et 5 zones. Akrotiri et Dhekelia ont chacune leur
  item (P1 l'a corrigé) : les 18 000 habitants de R3 venaient de l'item commun des deux bases, qui
  n'est plus lu. 0 sans année : les îles Heard, Ashmore-et-Cartier, Clipperton, Bajo Nuevo,
  Serranilla (figés par le test).
- Capitales : 36 (et non 38), pour la même raison (Episkopi, siège commun des deux bases). La
  Géorgie du Sud n'a pas de ligne à la main : Wikidata met King Edward Point au rang préféré,
  la règle le prend ; seule Montserrat est tranchée à la main (Brades, à relire).
- Heure : 44 zones écrites (et non 47) : les îles Heard, Ashmore-et-Cartier et Clipperton,
  inhabitées et sans zone dans zone.tab, n'ont pas de ligne d'heure, comme les îles mineures des
  États-Unis. Les entités sans code ISO ont leur zone avec `hors_code` (Guantánamo : l'heure de
  l'Est des États-Unis ; Christmas et Cocos : celle de Christmas, à relire). Pas de nombre de
  fuseaux pour un territoire. **Tokelau** n'est pas une entité de la carte (il est dans le tracé
  de la Nouvelle-Zélande) : il n'a pas de fiche, et son heure (UTC+13) n'est montrée nulle part ;
  la décision « sommets et fuseaux » le supposait.
- Points culminants : 24 territoires (et non 26) plus l'Antarctique. Les Malouines et la Géorgie
  du Sud sont entières dans une zone hachurée (NE_B12, NE_B32) : la règle « aucun sommet dans une
  zone disputée » les retire (lignes `aucun`, à relire : la règle visait un pays qui revendique
  un sommet). Les îles Mariannes du Nord et les îles mineures des États-Unis : sommet sans nom
  français (`aucun`) ; Niue : « point sans nom », Guernesey (114 m) et Wallis-et-Futuna (524 m) :
  deux altitudes sans rang.
- Gentilés : 11, comme prévu, mais pas les mêmes que R3 : sans Jersey (« Jersey crapaud »), les
  îles Vierges britanniques, Saint-Pierre-et-Miquelon (à relire) ; avec les Féroé, Guam, Porto Rico.
- Lignes tues, une clé par tableau (`src/fiches/relues.ts`) : `statut` (fiches-territoires.md),
  `capitale_territoires`, `habitants_zones`, `superficie_territoires`, `langues_territoires`,
  `gentile_territoires`, `culminant_territoires` (fiches-territoires-chiffres.md). En ligne sans
  relecture : les habitants des territoires, leur monnaie, leur heure, le continent, le lien, le
  drapeau. D'ici là, la barre d'un territoire dit ses habitants seuls et sa ligne d'heure
  s'appelle « Heure locale ».
- D57 a : le build échoue si une zone sert autre chose que `s`, `h`, `ha`, `hs`, `st`, `wp`
  (l'Antarctique : `s`, `sup`, `alt`, `wp`, `cu`), et `composerFiche` ne montre d'une zone que
  ses habitants et son continent, même si les données en portaient plus (testé).
- Drapeaux : 40 territoires, 37 fichiers (des drapeaux pareils, celui de la France pour
  Saint-Barthélemy et Saint-Martin, de l'Australie pour les îles Heard…), dans
  `public/geo/drapeaux-territoires/` et `drapeaux-territoires.json`, écrits par
  `construireDrapeaux` (`npm run geodata -- --seulement drapeaux`) ; `drapeaux.json` et le dossier
  des pays sont inchangés. `stroke-dashoffset` entre dans la liste blanche des attributs (le
  drapeau des Mariannes du Nord). Le dossier a sa règle immuable dans `firebase.json`. La ligne
  « flag-icons » des Crédits dit toujours « Drapeaux des pays » : `tests/donnees-drapeaux.test.ts`
  la fige, et ce lot n'y touche pas. La barre d'un territoire n'a pas de drapeau : seul le pays
  en a un.
- Poids : `fiches-monde.fr.json` à 11,4 Ko compressés (gzip -9), sous la borne de 12 Ko ; le
  fichier sans langue à 8,9 Ko. Les lots F4 et F5 ont leurs fichiers : la marge suffit.

Relecture du lot F3 (18/11), sur les lignes affichées sans clé de `LIGNES_RELUES` :
- Une ligne « à relire » ne s'affiche pas. Deux lignes d'heure et cinq d'habitants l'étaient :
  - **Habitants** : 38 territoires (et non 43). Une clé de plus dans la table,
    `habitants_territoires` (`aucun`, avec sa source et sa question) : les Terres australes
    françaises (196 en 2012), le Territoire britannique de l'océan Indien (3 000 en 2018), les îles
    de la mer de Corail (4 en 2018), la Géorgie du Sud (35 en 2019) et les îles mineures des
    États-Unis (190 en 2010) n'ont pas de ligne. Wikidata y compte le personnel des stations et
    des bases ; le World Factbook (miroir figé déjà au projet) dit « no permanent inhabitants »
    (« uninhabited » pour la Navase). Proposé : « aucun habitant permanent » d'après le Factbook,
    ce qui demande une source de plus pour la ligne (`hs`), à coder après la réponse.
  - **Heure** : 43 zones (et non 44). Christmas et Cocos (`NE_IOA`) n'ont plus de ligne d'heure,
    à relire : deux territoires à deux heures (UTC+7 et UTC+6 h 30), sans capitale pour nommer
    la ligne, comme les îles mineures des États-Unis. Le doute sur Guantánamo est levé :
    `America/New_York` et `America/Havana` ne diffèrent que 3 heures par an, la nuit des
    changements d'heure (mesuré dans Node, heure par heure, de 2025 à 2027), et non « de quelques
    jours ».
- Superficies (section tue) : une colonne « À relire » pour les 4 lieux à plus du double de leur
  tracé (Hong Kong, Macao, Ashmore-et-Cartier, la mer de Corail) ; le tableau dit quand une valeur
  de Wikidata est la somme des deux autres (Hong Kong : 2 755 = 1 106 de terres + 1 649 d'eaux).
- Le Factbook entre dans `sources.json` pour son champ « Population ». Ni fiche ni barre ne
  changent de code : les sept lignes se retirent par les données.
- Restent à l'utilisateur : ces sept lignes ; Tokelau (la décision « sommets et fuseaux »
  supposait sa fiche) ; le sommet d'un territoire entièrement dans une zone disputée (Malouines,
  Géorgie du Sud) ; la ligne « flag-icons » des Crédits (« Drapeaux des pays »), figée par
  `tests/donnees-drapeaux.test.ts`, que ce lot ne touche pas.
