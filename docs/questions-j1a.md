# Questions à trancher avant le J1a

Issues du J0 (04/11/2026) : ce que les données et la carte permettent
maintenant, mais dont le choix revient à l'utilisateur. Chacune se règle
par une décision au registre, puis ce fichier se met à jour.

Faits chiffrés le 06/11/2026 (conception du J1a). Les autres décisions du
J1a (D1 à D15 : fiches `nommer`, noms affichés, note, grappes, rythme,
communes, carte de la mémoire, synchro, compte anonyme, clé de release,
confidentialité…) sont dans `etudes/2026-11-06-j1a-conception.md`, § 12,
avec options, recommandation et défaut codé en attendant. Aucune de ces
questions ne bloque le code : chacune a un défaut réversible.

## Notation

1. **Zones contestées et entités de fait.** *Tranché le 06/11/2026
   (décision « Zones contestées et enclaves ») : option B, codée au lot 4
   (`src/map/acceptes.ts`, `noter()` ; épreuves classées à partir du lundi
   09/11/2026 0 h UTC, `DEBUT_ACCEPTES_EPREUVES`). La règle vaut pour les
   77 zones hachurées (tenant `dans`, revendiquants `revendique_par` de
   `contestees.json`, tenus à la main dans `geodata/revendications.json`
   avec leur source) et pour les entités revendiquées entières
   (`revendique_par` de `pays.json`). Kosovo et Taïwan, pays du paquet
   optionnel, ne sont pas des zones : ils ne comptent pas pour la Serbie ni
   la Chine. Donetsk et Louhansk suivent Natural Earth v5.1.2 (revendiqués
   par l'Ukraine seule, l'annexion russe de 2022 n'y est pas). Faits
   d'origine ci-dessous.* Natural Earth suit les
   frontières de fait, mais pas partout dans le même sens (toucher testé
   par `geoContains` sur `monde.topo.json`) :

   | Lieu | Un toucher y donne | Revendiqué par |
   |---|---|---|
   | Crimée (`NE_B89`, 27 034 km²) | RUS : faux pour « Ukraine » | Ukraine |
   | Donetsk, Louhansk (`NE_C02`, `NE_C03`, 9 424 et 8 281 km², « Self admin. ») | UKR, le revendiquant | Ukraine |
   | Abkhazie, Ossétie du Sud, Transnistrie, Haut-Karabakh (« Self admin. ») | GEO, GEO, MDA, AZE, le revendiquant | Géorgie, Moldavie, Azerbaïdjan |
   | Sahara occidental, ouest du mur (`NE_B19`, 178 224 km²) | MAR | Sahara occidental |
   | Sahara occidental, est du mur (`ESH`, 90 696 km²) | `ESH`, hors quiz : faux pour « Maroc » | MAR |
   | Somaliland (`NE_SOL`, 168 094 km²) | `NE_SOL` : faux pour « Somalie » | SOM |
   | Chypre du Nord (`NE_CYN`, 3 320 km²) | `NE_CYN` : faux pour « Chypre » | CYP |

   Quand la question est « Ukraine », « Somalie », « Chypre » ou
   « Maroc », ces touchers sont-ils justes ? Options : A, de fait strict
   (actuel, coût nul) ; B, juste pour le tenant de fait **et** pour chaque
   revendiquant (une table `revendications.json` d'une vingtaine de
   lignes, notation sur l'union, rétroaction « Juste (zone contestée,
   tenue par X) ») ; C, revendiquant pour les seules entités `conteste`
   (Somaliland, Chypre du Nord, Sahara Est), la Crimée restant à la
   Russie (moins de travail, incohérent). Recommandation : B, qui ne prend
   parti pour aucun camp. Défaut codé : A (table vide). Données :
   `contestees.json` (champ `dans`, lu par aucun code aujourd'hui),
   `pays.json` (`revendique_par`, `note_ne`).

   **Incohérence de données à signaler** : `NE_B62` et `NE_B63` (îlots
   « Admin. by Spain; Claimed by Morocco », 0,14 et 0,04 km²) ont `dans:
   ["ESP"]` alors que leur point d'étiquette tombe sous le Maroc. Même cas
   pour `NE_B64` (ESP), `NE_B26` (ATF) et `NE_B34` (UMI) : de minuscules
   îlots dont le point sort de la forme. Sans effet tant que `dans` n'est
   pas lu ; à corriger si Q1 vaut B. *Corrigé au lot 4 :* `dans` était juste
   (Perejil et Vélez sont tenus par l'Espagne d'après les sources), c'est la
   carte simplifiée qui les met aussi sous le Maroc ; le type le dit
   désormais. Le point de huit zones (Europa, Navassa, Perejil, Vélez,
   Alhucemas, Doumeira, fermes de Chebaa, Dragonja) sortait de leur forme
   simplifiée : `geodata/build.mjs` le reprend dans la forme dessinée.
   Quatre îlots absents de la couche des pays (`dans` vide : Bassas da India,
   Matthew et Hunter, Sapodilla, Doumeira) ont leur tenant (`tenu_par`).

   **À faire valider (relecture du lot 4).** Codé ainsi, en attente de
   l'utilisateur :
   - *Taïwan et Kosovo, exception à la règle.* Natural Earth note Taïwan
     (`NE_B77`) « Self admin.; Claimed by China », exactement comme le
     Somaliland (`NE_B30`, « Claimed by Somalia ») ; le Kosovo (`NE_B57`)
     sans note. Le Somaliland compte pour la Somalie, mais Taïwan ne compte
     pas pour la Chine ni le Kosovo pour la Serbie : ce sont des pays du
     paquet optionnel (décision « Pays et frontières »), pas des zones. Pour
     appliquer la règle à la lettre : `TWN: ['CHN']`, `XKX: ['SRB']` dans
     `REVENDICATIONS` (`geodata/build.mjs`), éventuellement seulement quand
     le paquet optionnel est désactivé. Sinon, écrire l'exception dans la
     décision « Zones contestées et enclaves ».
   - *Six revendications que Natural Earth ne nomme pas* (note vide), tirées
     des connaissances des auteurs : sud du Belize → Guatemala (`NE_B51`,
     7 984 km²), Ilemi → Kenya (`NE_B74`), Dragonja → Slovénie (`NE_B82`,
     état du litige depuis la sentence de 2017 non vérifié), îles du Danube
     → Croatie (`NE_B95`, `NE_B96`), et surtout Sabah → Philippines
     (`NE_C04`, 38 737 km² de Malaisie justes pour les Philippines, une
     revendication officielle mais peu active). À défaut de validation :
     `revendique_par` vide pour ces six zones (`geodata/revendications.json`).
   - *Ceuta et Melilla* (`NE_B60`, `NE_B61`), « Geo subunit » de l'Espagne
     sans note chez Natural Earth, sont gardées à la main
     (`CONTESTEES_AJOUTEES`) et comptent pour le Maroc, comme Perejil et
     les Chafarinas que Natural Earth note « Claimed by Morocco ».
2. **Enclaves de fait.** *Tranché le 06/11/2026 : option B (table
   `ENCLAVES` de `src/map/acceptes.ts`, même date d'effet pour les
   épreuves). Faits d'origine ci-dessous.* Toutes de statut `territoire`, donc sans disque
   (seuls les `jouable` et `optionnel` en ont) :

   | Enclave | km² | Hôte |
   |---|---|---|
   | Baïkonour (`NE_KAB`, un trou dans le Kazakhstan) | 6 486 | KAZ |
   | Guantánamo (`NE_USG`, `revendique_par` CUB) | 65,5 | CUB |
   | Akrotiri (`NE_WSB`, base britannique) | 98,7 | CYP |
   | Dhekelia (`NE_ESB`, base britannique) | 127 | CYP |

   Akrotiri, sous le pixel au zoom 1, peut rendre « faux » un toucher sur
   la côte sud de Chypre. Options : A, à part (actuel) ; B, table de 4
   entrées enclave → hôte, acceptée pour l'hôte ; C, règle générale (une
   entité non jouable de moins de N px, voisine de la cible, compte pour
   elle ; couvre Gibraltar et les îlots, à tester à plusieurs zooms) ; D,
   fusion au dessin (données à regénérer, contredit les frontières de
   fait). Recommandation : B, C en réserve si le journal montre ces faux.
   Défaut codé : A. Q1 et Q2 changent aussi la note des épreuves
   classées : date d'effet à choisir (D13 de l'étude, recommandé : à un
   lundi).
3. **Micro-États cibles sur un voisin.** *Le recouvrement est tranché*
   (décision « Toucher sur la terre ferme ») : sur le tracé d'un pays, le
   disque d'un petit voisin ne l'emporte que sous le doigt, avec ~3 px de
   marge (6,5 px de son centre), et s'il est plus près que le point du
   pays. Une question « Italie » est juste partout dans le tracé de
   l'Italie, disques compris (la notation regarde le tracé de la cible
   avant le disque). **Le biais est dans l'autre sens** : à la question
   « Vatican » ou « Saint-Marin », presque tout toucher en Italie au zoom 1
   est juste, car le disque de 6,5 px couvre l'essentiel d'une Italie de
   ~6 px (79 % de son tracé désigne le Vatican, Saint-Marin ou Malte ; la
   Suisse cède 41 % au Liechtenstein au zoom 1, 26 % au zoom 8). FSRS
   croira donc ces micro-États mieux sus qu'ils ne le sont. Options : A,
   rien, mais le journal note par quoi la réponse est juste (`via` :
   tracé, pastille, proche) et à quel zoom, pour mesurer la part des
   justes « par pastille » ; B, un disque plus petit quand son centre est
   sur un voisin (rayon de toucher 4,5 px au lieu de 6,5) ; C, en séance,
   un zoom minimal avant de pouvoir répondre pour un micro-État cible.
   Recommandation : A après la semaine d'usage, puis B ou C si la part
   « par pastille » au zoom faible est forte. Défaut codé : A.

## Carte au doigt

4. **Zoom de départ.** Au zoom 1, en portrait sur le téléphone de mesure,
   le monde fait 384 × 187 px dans 723 px de haut (sous l'en-tête) : la
   zone où l'on touche un micro-État des Antilles n'y fait que 3 à 19 px de
   diamètre, Maurice 0,5 px. Options : A, laisser l'état de l'utilisateur
   (actuel) ; B, nouveautés cadrées sur l'emprise de la grappe au début du
   rappel (union des `bbox`, antiméridien pour l'Océanie), révisions au
   monde entier sans cadrage entre les questions (un cadrage par question
   donnerait la réponse) ; C, le monde au zoom 1 à chaque question.
   Recommandation : B (le cadrage ne montre rien de plus que la région vue
   au QCM). Défaut codé : A, en constante.
5. **Seuil des micro-États.** *Tranché le 06/11/2026 (décision « Cadrage
   et disques en séance ») : option B, 2 000 km². Appliqué à la génération
   (`SEUIL_MICRO_KM2`, `geodata/build.mjs`) plutôt qu'au chargement : les
   sources verrouillées regénèrent les données à l'identique, et `micro`
   garde un seul sens ; Comores, Maurice et Samoa ont leur disque, 29
   micro-États jouables (l'essai du J0, qui les reprend tous, passe de 43 à
   45 cibles). Les disques posés sur un voisin ne changent pas (Q3). Faits
   d'origine ci-dessous.* Disque toujours dessiné si le plus grand
   polygone fait moins de 1 000 km² (`geodata/build.mjs`, 26 jouables).
   Au-dessus, un pays a un disque sous 4 px à l'écran, une cible invisible
   seule entre 4 et 10 px. Jouables entre 1 000 et 5 000 km² :

   | Pays | Plus grand polygone (km²) | Au zoom 1 | Zoom pour 4 px |
   |---|---|---|---|
   | Comores | 1 029 | 0,36 px | ≈ 11 |
   | Samoa | 1 652 | 0,45 px | ≈ 9 |
   | Maurice | 1 907 | 0,49 px | ≈ 8 |
   | Luxembourg | 2 600 | 0,57 px | ≈ 7 |
   | Bahamas | 3 582 | 0,67 px | ≈ 6 |
   | Vanuatu | 4 093 | 0,71 px | ≈ 5,6 |
   | Brunei | 4 437 | 0,74 px | ≈ 5,4 |
   | Trinité-et-Tobago | 4 852 | 0,78 px | ≈ 5,1 |

   Options : A, 1 000 km² (actuel) ; B, 2 000 (Comores, Samoa, Maurice) ;
   C, 3 000 (plus le Luxembourg, entouré de voisins, à qui son disque
   prendrait de la place) ; D, 5 000 (les 8). Recommandation : B, des
   archipels lointains qui ne passent 4 px qu'au-delà du zoom 8 ; seuil
   appliqué au chargement (`aPastille`) plutôt qu'à la génération, pour ne
   pas regénérer les données. Défaut codé : A.

## Données

6. **Noms à vérifier.** « Île Brésilienne » (`NE_BRI`, traduction faite
   au J0 ; autre choix : « Île Brasilera ») n'apparaît qu'à l'accueil, hors
   quiz. Variantes courtes de CLDR : Hong Kong et Macao sont des
   territoires, hors quiz ; la Palestine est jouable, « Palestine »
   convient. Recommandation : garder les noms courts, faire valider « Île
   Brésilienne ». Défaut codé : noms actuels.
7. **Superficies.** `superficie_km2` est l'aire de la géométrie Natural
   Earth, loin de la valeur officielle pour certains pays (Monaco ×9, Maroc
   +33 % avec le Sahara, Chypre −42 %) : au J4, prendre Wikidata (P2046),
   comme prévu par l'étude « données ». Hors du J1a (les grappes se font
   par sous-région).
