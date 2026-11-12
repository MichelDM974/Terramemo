# J2, capitales, drapeaux, océans et mers, quiz général : conception (10/11/2026, #4, #27, #26)

*Faite par un workflow : six relevés, une rédaction, deux relectures
adverses (code existant ; produit, pédagogie et données), une correction.*

**Étude finale** du 10/11, à coder sans re-concevoir :
- six relevés : code de la carte ; parties et Jouer ; répétition espacée et
  synchro ; données des capitales et notoriété ; drapeaux ; océans et mers ;
- une rédaction, qui a revérifié dans le code (`main`, commit `de7448d`)
  chaque point douteux des relevés. Les écarts trouvés sont au § 16 ;
- deux relectures adverses, dont chaque constat a été revérifié (fichier:ligne,
  extraits, simulation relancée) puis intégré au texte. Ce qu'elles ont
  changé est résumé au § 17.

Relevés, extraits téléchargés et scripts : `~/Sauvegardes/terramemo/j2-conception/`
(hors du dépôt). **Mesuré** : commande lancée ou fichier lu, avec
fichier:ligne. **Estimé** : jugement. Tailles : S (moins d'une demi-journée),
M (une demi-journée à deux jours), L (plus). Les chemins de code sont
relatifs à `src/` ; `chrono.ts` et `classement.ts` seuls désignent ceux de
`src/epreuve/`, et les vues du même nom s'écrivent `vues/chrono.ts`,
`vues/classement.ts` ; `seance.ts` s'écrit `srs/seance.ts` ou
`vues/seance.ts`.

La demande de l'utilisateur (10/11) : « terramemo faut rajouter oceans mers
capitales drapeaux et les modes de jeu correspondant puis un gros mode de jeu
"quizz general" qui pose des questions choisies au hasard sur un peu tout avec
differentes difficultées ok? Je suis conscient qu'il y aura peut-être des
choses à rajouter avant de faire ça. Et que aussi, même quand on aura mis ça,
on rajoutera encore peut-être des informations qui augmenteront la taille du
quiz général, etc. »

D'où trois étages : un socle d'abord (§ 10, lots 0a à 0c) ; puis les sujets,
branchés un par un sur ce socle (lots 1 à 3) ; enfin un quiz qui grandit seul
quand un sujet s'ajoute (§ 9.1).

Tickets et leur fin :
- **#4**, J2 capitales et drapeaux : données vérifiées par test ; écart
  prévu/réel mesurable dès 300 réponses (ce second point et le reste du
  ticket : § 12, D54) ;
- **#27**, océans et mers : chaque zone jouable au doigt sur le site et dans
  l'APK, données vérifiées par test en CI (noms, géométries, poids) ;
- **#26**, quiz général : les quatre niveaux jouables sur le site et dans
  l'APK, avec leurs classements, chacun tirant ses questions selon son niveau.

L'étude touche aussi #28 (palette en plein soleil : les couleurs de la couche
marine en dépendent), #3 (APK du lot 7 du J1b), #2 (semaine d'usage jusqu'au
13/11) et #7 (le reste de la géographie physique, au J5).

Décisions actées qui priment en cas d'écart :
- du 10/11 : « Capitales et drapeaux », « Océans et mers », « Quiz
  général », « Répétition espacée des nouveaux sujets », « Carte en plein
  soleil » ;
- Jouer : « Écran Jouer », « Panneau de Jouer plein écran », « Noms des
  modes », « Nommer », « Croix vers la carte », « En-tête » ;
- épreuves : « Points et classement », « Classements », « Classements par
  épreuve », « Sans faute et Minute », « Fin d'une partie du Chrono », « Une
  place par pseudo » ;
- mémoire : « Apprendre et Révision du jour », « Sens "quel est ce pays ?" »,
  « Cadrage et disques en séance » ;
- carte : « Rendu par défaut », « Critère de saccade », « Critère du
  toucher », « Toucher sur la terre ferme », « Zones contestées et
  enclaves », « Pays et frontières » ;
- et « Langue », « Hébergement », « Licences tierces », « Contenu »,
  « Comptes ».

Les choix de l'utilisateur sont au § 13 : D36 à D55, **tranchés le 10/11
au soir sauf D46** (tableau en tête du § 13 : le code suit la réponse, pas
le défaut). En attendant une réponse, le code prend un **défaut réversible** : une constante nommée,
commentée « défaut en attente de l'utilisateur, #4 » (ou #26, #27). Cinq
défauts cessent d'être réversibles dès qu'un classement en dépend : la taille
des épreuves de capitales (D37), l'indice montré en épreuve (D38), la liste
des mers (D42), le contenu du général (D40) et le sort d'une partie de quiz
abandonnée (D55). Les épreuves classées d'un sujet attendent donc ces
réponses ; ses exercices d'Entraînement, non (§ 11).

Résumé des choix :
- trois sujets de plus dans Jouer, joués comme les pays : Capitales,
  Drapeaux, Océans et mers. Chacun a Apprendre, Trouver, Reconnaître, Chrono,
  Sans faute et Minute ;
- la cible d'une question de capitale ou de drapeau reste **l'id du pays** :
  toucher, note, barème et zones contestées ne changent pas ;
- fiches `capitales:BOL:localiser`, `drapeaux:TCD:nommer`,
  `mers:medit:localiser` : un domaine par sujet, du même nom. Les sens
  `localiser` et `nommer` restent. Ni mode ni champ nouveau au journal et aux
  lots (`V_LOT = 1`) ; aucune migration ;
- épreuves `chrono:capitales:Africa`, `minute:drapeaux:tous`,
  `chrono:mers:mers`, `quiz:general:facile` ; pays et communes gardent
  `localiser` ; règles Firestore par sujet ;
- données figées et testées :
  - capitales : extrait Wikidata daté (CC0) et table à la main, 210
    capitales justes, 12 pays à plusieurs réponses ;
  - drapeaux : flag-icons 7.6.0 (MIT), un fichier par drapeau nommé par son
    empreinte, chargé à la demande, Honduras corrigé ;
  - 5 océans et 45 mers tirés des zones marines de Natural Earth, ids de 8
    lettres au plus ;
- la mer est une **couche du terrain monde**, dans un fichier à part chargé à
  la demande (50 Ko gzip au repos, 19 Ko pendant les gestes). Elle est
  dessinée sous les terres, sans contour. Au toucher, la terre gagne. Une mer
  bordière compte pour son océan, une mer intérieure non ;
- mémoire : chaque sujet a sa grappe par jour, mais la Révision du jour
  n'ouvre que celle des pays ; les autres s'ouvrent par Apprendre, comme les
  communes. Un plafond d'introductions « Reconnaître » par jour, et un sujet
  dont des introductions attendent n'ouvre pas de grappe nouvelle (D46, après
  le verdict de #2). Seuls les sujets **jouables** de la version entrent en
  séance (`DOMAINES_JOUABLES`). La carte de la mémoire a un choix du sujet ;
- quiz général : 3e tuile de la racine, 4 difficultés, 20 questions tirées
  par les générateurs que chaque sujet déclare. Formes fixes par difficulté,
  parts égales par sujet, barème du Chrono, un classement par difficulté, hors
  du général, ouvert une fois les quatre sujets du J2 livrés (D50) ;
- avant tout, un socle sans effet visible : le sujet de bout en bout, le
  rendu par sujet, la mémoire à plusieurs sujets, le général durci contre les
  épreuves qu'il ne connaît pas, et `/` servi sans cache.

## 1. Ce qui existe et ce qui manque

| Élément | Existe (`de7448d`, vérifié) | Manque |
|---|---|---|
| Sujets de Jouer | `SUJETS` = pays, communes (`arbre.ts:57-60`) : un sujet = ses séries + ses exercices par branche | capitales, drapeaux, mers ; des séries choisies par sujet, pas par terrain (`duTerrain`, `arbre.ts:54`) |
| Racine de Jouer | deux tuiles, Entraînement et Classé (`jouer.ts:221-222`) | la tuile Quiz général, l'écran des difficultés |
| Énoncé d'une question | le nom du lieu, écrit à la main dans chaque vue (`essai.ts:270`, `vues/chrono.ts:207`, `nommer.ts:175,184,217`, `retournee.ts:84,87`) ; textes par terrain (`textes.terrains`) ; compte d'une série par terrain (`jouer.ts:250`) | un rendu par sujet : capitale, image du drapeau, nom de mer |
| Leurres | voisins jouables, puis les plus proches (`qcm.ts:45-67`) | exclusions (Jérusalem), sosies de drapeaux, voisins marins, leurres par difficulté |
| Fiches | domaines `pays`, `communes` (`fiches.ts:6,10`) ; un domaine inconnu rend la fiche invalide (`fiches.ts:45`) | `capitales`, `drapeaux`, `mers` |
| Domaine d'une réponse | tiré du **terrain** : `libre()` (`vues/seance.ts:290-291`, qui reçoit le `Lancement` mais l'ignore), Apprendre (`:124`), comptes (`:164`), mémoire (`carte-memoire.ts:42`) ; Apprendre est lancé sans sujet (`essai.ts:611`) | tiré du **sujet** lancé |
| Séance | un bloc par domaine : pays, communes, grappe de pays (`vues/seance.ts:122-140`) ; un seul id de séance pour tous les blocs | blocs par terrain, domaines mêlés ; plafond des introductions ; préférence « pays d'abord » |
| Carte de la mémoire | une teinte par terrain | un choix du sujet, le détail par sujet |
| Épreuves | `mode:localiser:série` (`chrono.ts:204`) ; 24 classées, 8 Chrono au général | le sujet dans l'id ; 69 classées, plus 4 du quiz |
| Général | somme de tout record dont le mode est `chrono`, préfixe inconnu compris (`modeEpreuve`, `chrono.ts:210-213` ; `totalGeneral`, `:428-445`) | la somme des seules épreuves listées |
| Règles | tailles des séries des pays et de l'île (`firestore.rules:19-30`) ; `p[1] == 'localiser'` (`:34-39`) ; général ≤ 414 questions (`:51-56`) | tailles par sujet, quiz, nouvelle borne du général |
| Données | `monde.topo.json`, `pays.json`, `noms.fr.json`, `contestees.json`, l'île | capitales, drapeaux, zones marines, notoriété |
| Carte | pays et zones contestées dans les trois rendus ; `entites` lu à 54 endroits de 17 fichiers (relevé de la carte) | une couche marine à part : dessin, toucher, maillage WebGL, cache |
| Recherche | zones nommées du monde et communes (`recherche.ts`, qui annonce les capitales au J2, `:6-7`) | capitales, mers |
| Vignettes | une carte par série et pour Pays ; l'île rangée dans le code (`geodata/vignette-ile.mjs`) | Capitales, Drapeaux, Océans et mers, Quiz général |
| Crédits | Natural Earth, CLDR, IGN (`textes.fr.json:225-247`) | Wikidata, flag-icons (MIT : texte de licence), zones marines |
| Hébergement | `/assets/**` immuable, `**/*.@(html\|json)` sans cache (`firebase.json`) | `/` servi en `max-age=3600` (mesuré par curl le 10/11 ; `/index.html` est bien en `no-cache`) ; drapeaux immuables |
| Pilote | `ui_jouer` exige `data-sujet == ['pays','communes']` (`driver.py:1366`) | listes à jour ; `ui_capitales`, `ui_drapeaux`, `ui_mers`, `ui_quiz` ; crochet `?mers=demo` |

**Constat qui simplifie** : capitales et drapeaux ne demandent rien à la
carte. La cible reste un pays : `marquer`, `montrer`, `noter(cible, x, y)`
(`pick.ts:145`) et les zones admises (`acceptes.ts`) valent tels quels. La
capitale de l'Ukraine est juste en Crimée, comme le pays.

## 2. Données

### 2.1 Capitales

**Source** : Wikidata (CC0), extrait figé et daté, plus une table tenue à la
main. Le brouillon du relevé (mesuré) couvre 197 pays : les 195 jouables, plus
Kosovo et Taïwan, du paquet optionnel, jamais posés (`estJouable`,
`cibles.ts:13`). Il compte **210 capitales justes** : 200 officielles, 9
sièges du gouvernement, 1 capitale économique.

**Règle** (décision « Capitales et drapeaux ») : est juste toute capitale que
le pays se déclare, plus le siège du gouvernement. Israël : Jérusalem seule.
Palestine : Jérusalem-Est, et Ramallah aussi. La décision fonde ces deux
lignes sur la logique des zones contestées (« juste pour qui tient et pour
qui revendique ») ; appliquée dans les deux sens, elle rendrait aussi juste
la Palestine pour « Jérusalem » (sa Loi fondamentale nomme Jérusalem) et
Israël pour « Jérusalem-Est » (qu'il tient : le point du brouillon, 35,23 ;
31,78, tombe dans le tracé d'Israël, dans la zone `NE_B98` « Admin. by
Israel; claimed by Palestine », mesuré par la relecture). Question posée en
D36 i ; le mécanisme est une zone admise de plus pour le sujet Capitales
(§ 4.4, `OptionsNoter.acceptes`).

Les capitales justes en plus ne changent jamais une note : la réponse reste
l'id du pays. Elles ne jouent que sur l'indice montré (D38), la recherche et
la rétroaction.

Chaque capitale a un rôle (`officielle`, `siege`, `economique`). Une seule par
pays est la **principale**, une capitale officielle : elle sert à l'ordre
d'affichage et à la recherche. Ce qu'on montre en question est D38.

Pays à plusieurs réponses justes (12, mesuré) :

| Pays | Principale | Aussi juste |
|---|---|---|
| Afrique du Sud | Pretoria | Le Cap, Bloemfontein (officielles) |
| Bénin | Porto-Novo | Cotonou (siège) |
| Bolivie | Sucre | La Paz (siège) |
| Burundi | Gitega | Bujumbura (économique, D36) |
| Côte d'Ivoire | Yamoussoukro | Abidjan (siège) |
| Eswatini | Mbabane | Lobamba (officielle) |
| Guinée équatoriale | Ciudad de la Paz | Malabo (siège, D36) |
| Malaisie | Kuala Lumpur | Putrajaya (siège) |
| Palestine | Jérusalem-Est | Ramallah (siège) |
| Pays-Bas | Amsterdam | La Haye (siège) |
| Sri Lanka | Sri Jayawardenapura Kotte | Colombo (siège) |
| Yémen | Sanaa | Aden (siège) |

**Table à la main** (`geodata/capitales-main.json`, une source par ligne).
Wikidata ne dit pas le siège sous une forme unique : P518, P3831, P459 ou
rien du tout. Les sièges se tiennent donc à la main. La table porte :
- les corrections de Wikidata :
  - Nicaragua : son P36 pointe un item presque vide, remplacé par Managua
    (Q3274) ;
  - Oslo n'a pas de libellé français ;
  - La Haye n'est pas reliée aux Pays-Bas : ajoutée comme siège ;
  - Abidjan a une fin en 1983 : ajoutée comme siège ;
  - Malabo : ajoutée comme siège ;
  - P298 donne le royaume pour les Pays-Bas et deux items pour la
    Palestine : item choisi à la main ;
  - déclarations en double (Berlin, Athènes) ;
- les capitales de Natural Earth non retenues : Valparaíso, Tel Aviv, Kyoto,
  Laâyoune, Rangoun, Lagos, Baguio, Dar es Salaam, Johannesburg ;
- les noms : l'usage français courant (Pékin, Moscou, Le Caire, Dacca,
  Asuncion, Bogota), les graphies étrangères en alias (Beijing, Dhaka,
  Asunción, Kyiv, Chisinau) ; Tarawa-Sud (alias Tarawa) ; Sri Jayawardenapura
  Kotte (alias Kotte) ; Guatemala (alias Guatemala-Ville) ; Tegucigalpa
  (alias Comayagüela, D36 j) ;
- un point propre à Jérusalem-Est (vieille ville, ≈ 35,235 ; 31,777) : à 2
  décimales, le brouillon lui donne les mêmes coordonnées qu'à Jérusalem
  (35,23 ; 31,78), et les deux lignes de la recherche comme l'anneau de D53 c
  tomberaient au même point ;
- les 9 pays dont la capitale porte le nom (D37) et les cas à trancher
  (D36).

Le contrôle contre Natural Earth (`ne_10m_populated_places` v5.1.2) a été
fait une fois, au relevé : 28 écarts sur 23 pays, tous expliqués. Il n'entre
pas dans le build : ces données datent de 2022 (Noursoultan, Rangoun).

**Fichiers servis** (poids mesurés sur le brouillon) :
- `public/geo/capitales.json` : `[{pays, c: [{q, lon, lat, role, p?}], m?, x?}]`.
  `q` est l'item Wikidata ; coordonnées à 2 décimales ; `p: 1` pour la
  principale ; `m: 1` pour une capitale au nom du pays ; `x` liste les pays
  dont la capitale n'est jamais un leurre (Israël ↔ Palestine). 17,9 Ko brut,
  3,5 Ko gzip ;
- `public/geo/capitales.fr.json` : `{noms: {Qid: nom}, alias: {Qid: [...]}}`,
  fichier de langue (décision « Langue »). 4,0 Ko brut, 2,0 Ko gzip pour les
  noms seuls.

Ils se chargent à la demande : choix du sujet, première frappe dans la
recherche, séance qui a des fiches de capitales.

**Leurres de Reconnaître** :
- les choix restent des ids de pays (`qcm.choix`) ; chaque leurre montre la
  capitale principale de son pays. Une autre capitale juste de la cible ne
  peut donc jamais servir de leurre ;
- jamais un pays de `x` : Jérusalem-Est n'est pas un leurre pour Israël, ni
  Jérusalem pour la Palestine ;
- au quiz facile et moyen, aucun nom proche de la bonne réponse. Le relevé a
  mesuré 27 paires (distance d'édition ≤ 2 ou même début, sans accents) :
  Kingston et Kingstown, Budapest et Bucarest, Riga et Riyad… En difficile,
  ce sont de bons leurres ;
- aucun homonyme exact entre deux pays (mesuré).

**Tests** (lot 1) :
- 197 entrées, une principale par pays, des rôles connus, un nom non vide
  pour chaque Qid ;
- la liste des 12 pays à plusieurs réponses, figée : un changement de
  l'extrait se voit ;
- Israël = Jérusalem seule ; Palestine = Jérusalem-Est et Ramallah ; les 9
  « même nom » ; Jérusalem et Jérusalem-Est à deux points distincts ;
- aucun homonyme exact entre pays ; aucun alias égal au nom d'une autre
  capitale ;
- chaque capitale à moins de 25 km du tracé de son pays ou d'une de ses
  zones admises. Le seuil est à mesurer au lot 1, les exceptions écrites
  (S38). Ce test attrape une capitale rattachée au mauvais pays ;
- les deux fichiers ≤ 6 000 o gzip.

### 2.2 Drapeaux

**Source** : flag-icons 7.6.0 (npm, publié le 15/10/2026, toujours la dernière
version). Licence MIT, « © 2013 Panayiotis Lipiridis ». Empreinte du tarball
(sha256) :
`99d6feb80562dcaa83700ef184094d7c7b6587cc216b3fab1546cb1643e611a9`. Les 197
drapeaux voulus (195, plus XK et TW)
y sont tous (mesuré). On garde le format 4x3 seul : le 1x1 pèse autant.

**Poids** (mesurés, Ko de 1 000 o) :
- 1 308,5 brut, 431,7 gzip, 371,7 brotli ; médiane 340 o en brotli ; 117
  drapeaux sous 1 Ko brut ;
- les armoiries pèsent : Serbie 181,6 Ko brut, Bolivie 102,9, Mexique 84,8.
  Les 12 plus lourds font environ 54 % du brotli ;
- svgo 4.1.0 ne gagne que 1,5 % en brotli : non retenu.

**Chargement sur le site** :
- un fichier par drapeau, `public/geo/drapeaux/<sha8>.svg`, nommé par son
  empreinte : l'adresse ne trahit pas le pays. Son `id="flag-icons-xx"` est
  retiré ;
- un manifeste `public/geo/drapeaux.json` : id du pays → empreinte et
  sosies (≈ 12 Ko brut) ;
- une règle de `firebase.json` : `/geo/drapeaux/**` →
  `public, max-age=31536000, immutable`. Ce dossier ne contient que des
  fichiers nommés par leur empreinte : la licence de flag-icons va à côté,
  `public/geo/licences/flag-icons.txt` (sans cache, comme le reste de
  `/geo/`), sinon elle serait servie immuable sous un nom fixe ;
- préchargement (`new Image()`) des drapeaux de la question suivante, et de
  toute la partie au départ d'une épreuve ou du quiz (§ 9.3) ;
- pas de `import.meta.glob(…?url)` : 154 drapeaux passent sous
  `assetsInlineLimit` (4 096 o), Vite les mettrait en data URI dans le JS ;
- pas de dépendance npm. `tests/credits-vue.test.ts:103-104` exige que chaque
  dépendance soit créditée dans les Bibliothèques, et que celles-ci soient
  exactement ce que le build embarque (lu dans la sourcemap). Des SVG copiés
  n'y apparaissent pas. Le tarball se télécharge donc au build de
  `geodata/`, figé par son empreinte, comme Natural Earth.

**Coût** (estimé) :
- une partie de Reconnaître (20 questions × 4 drapeaux, 1,89 Ko en moyenne)
  coûte ≈ 150 Ko. Pour 200 visiteurs par jour, 30 Mo, soit 8 % du quota de 360 Mo ;
- un paquet unique coûterait 331,5 Ko brotli à chaque joueur de drapeaux :
  66 Mo par jour pour 200, soit 18 % ;
- que le quota compte les octets compressés est supposé (S30) ;
- APK : tout est embarqué, 1,31 Mo brut dans `dist`, environ 430 Ko une
  fois compressés.

**Justesse** (contrôle par Wikidata P41 au relevé, drapeaux douteux regardés
à l'œil) :
- **Honduras périmé** : flag-icons garde le turquoise de 2022 (`#18c3df`) ; le
  pays est revenu au bleu marine le 27/01/2026. Correction au build
  (`#0d3b99`, fichier Commons du domaine public). Erreur signalée en amont
  par un tiers le 11/11/2026
  ([lipis/flag-icons#1496](https://github.com/lipis/flag-icons/issues/1496)) :
  la correction se retire quand flag-icons publie le bleu marine (le
  contrôle P41 le verra) ;
- **Afghanistan** : flag-icons montre le tricolore de la République ; le
  pouvoir de fait a le drapeau blanc de l'Émirat, au rang préféré de Wikidata
  depuis le 15/08/2021 (D41) ;
- **Bolivie** : la Bolivie déclare deux drapeaux, le civil et celui d'État.
  Wikidata P41 met le civil (`Flag of Bolivia.svg`) au rang préféré, celui
  d'État au rang normal (mesuré, `drapeaux/wd/p41.json`). flag-icons montre
  celui d'État, avec armoiries, le 2e plus lourd (102,9 Ko brut). Le civil
  est un sosie du Ghana (D41 b) ;
- Vatican : le dessin de 2023 est à vérifier à l'œil au lot 2 (invisible à
  64 px, non bloquant) ;
- conformes : Syrie (drapeau de 2025), Kirghizstan (2023), Mauritanie (2017),
  Myanmar, Libye, Venezuela, Biélorussie, Irak, Malawi, France, Taïwan,
  Kosovo, Palestine. La Roumanie est un peu plus claire que ses couleurs
  officielles : laissé tel quel.

**Règle** : le drapeau d'un pays est celui qu'il se déclare. Deux autorités,
deux drapeaux : les deux sont justes (D41), comme la décision 1 le dit des
capitales. Version d'État ou civile : celle de flag-icons, sauf exception
écrite dans `geodata/drapeaux-main.json`. À chaque mise à jour de
flag-icons, on relance le contrôle P41 : il aurait trouvé le Honduras.

**Sosies** (mesurés) :
- chaque drapeau est rendu par `@resvg/resvg-wasm` 2.6.2 (MPL-2.0, en
  devDependency, outil de build seulement : 197 drapeaux en 0,3 à 0,5 s,
  124 Mo au plus) ;
- le rendu est posé sur fond blanc, réduit en grille de 16 × 12, en CIELAB.
  Le score d'une paire est la part de la surface où les deux drapeaux
  diffèrent nettement (ΔE2000 > 20). Le drapeau retourné compte aussi, avec
  0,08 de pénalité. On garde les 3 plus proches de chaque pays ;
- 50 pays ont un quasi-jumeau (score ≤ 0,1), 102 un proche (≤ 0,3) ;
- une liste à la main ajoute les familles que la méthode rate : croix
  nordiques, Luxembourg et Pays-Bas, Union Jack (Australie,
  Nouvelle-Zélande, Tuvalu, Fidji), couleurs panarabes, panafricaines, Grande
  Colombie ;
- **jumeaux** : Indonésie et Monaco, Roumanie et Tchad (score 0,00). En 4:3,
  à l'écran, rien ne les distingue. En Trouver, toucher l'un pour l'autre est
  juste (« Juste : même drapeau que l'Indonésie ») : le jumeau est une zone
  admise de plus pour le sujet Drapeaux, comme une zone contestée l'est pour
  un pays. Ils ne sont jamais ensemble parmi 4 choix (D41).

**Zones admises par sujet** (vérifié) : `construireAcceptes` bâtit une seule
table par contexte de carte (`acceptes.ts:74`), lue par `noter` via
`ctx.acceptes` ; `OptionsNoter` n'a qu'un booléen (`pick.ts:118-124`) ;
`SorteAdmise` ne connaît que `'contestee'` et `'enclave'` (`acceptes.ts:15`),
comme `texteAdmis` (`commun.ts:99-106`). Mettre les jumeaux dans cette table
rendrait Monaco juste pour l'Indonésie aussi sous Pays (Trouver, Chrono
classé, quiz). D'où :
- `OptionsNoter.acceptes` devient `boolean | Acceptes` : des zones **en
  plus** de celles du contexte, passées par la vue du sujet. Seul le sujet
  Drapeaux passe les jumeaux ; seul Capitales passe Jérusalem ↔ Jérusalem-Est
  si D36 i dit oui ; les mers passent leurs parties (§ 4.4) ;
- `SorteAdmise` gagne `'jumeau'` et `'partie'`, et `texteAdmis` leurs textes
  (« même drapeau que l'Indonésie », « mer des Caraïbes, dans
  l'Atlantique ») ;
- test : Monaco touché pour l'Indonésie est juste sous Drapeaux, faux sous
  Pays, en Trouver comme au Chrono.

L'affichage est au § 5.3.

**Tests** (lot 2) :
- 197 fichiers, nommés par l'empreinte de leur contenu, sans plus aucun
  `id="flag-icons` ;
- manifeste = ids jouables + XKX + TWN ; 3 sosies par pays, de score entre 0
  et 1 ;
- Honduras sans `#18c3df` ; licence présente, hors de `drapeaux/` ;
- poids total ≤ 1 350 000 o brut ;
- deux builds identiques octet pour octet (S33).

### 2.3 Océans et mers

**Source** : Natural Earth v5.1.2, `10m_physical/ne_10m_geography_marine_polys`,
même tag et même commit que les pays (`geodata/build.mjs:62-63`). Le relevé a
vérifié les 5 empreintes. Domaine public.

Ce que dit la couche (mesuré) :
- 306 zones, 58 666 sommets ; 295 noms français, 271 `wikidataid` ;
- c'est une **partition** : les mers sont découpées hors des océans, et les
  sous-mers hors de leur mer. La Méditerranée de Natural Earth n'a ni
  l'Adriatique ni l'Égée ;
- l'Atlantique et le Pacifique viennent en deux zones chacun, Nord et Sud ;
- l'Austral est une bande de 360° sans pôle, de 60,5° S aux mers
  antarctiques ;
- Great Barrier Reef recouvre la mer de Corail : exclue.

**Liste** (D42 d, validée par l'utilisateur le 12/11) : 5 océans et 45 mers et
golfes. Candidates : les 99 zones de Natural Earth de 30 000 km² ou plus dont
le libellé Wikidata français commence par « mer » ou « golfe », plus la
Manche, le canal du Mozambique et les baies d'Hudson et de Baffin. Rang
combiné, comme D48 b : la moyenne du rang par nombre de Wikipédias et du rang
par vues de la Wikipédia française (novembre 2025 à octobre 2026). Les 45
premières sont retenues ; les quatre zones imposées par la décision y entrent
d'elles-mêmes (Manche 9e, Hudson 22e, Mozambique 39e, Baffin 45e). La mer des
Sargasses (30e) est gardée bien qu'elle n'ait pas de côte (choix du 12/11,
préférée à la mer de Tasman, 46e). Juste après : Tasman, Laptev (47e),
Alboran (48e).

Par rapport à l'option a (le seul nombre de Wikipédias, qui gardait des mers
peu lues en français, Sibérie orientale 1 521 vues, Java 1 611, et en écartait
de bien plus lues, Sargasses 65 182) : entrent les golfes de Botnie, de
Finlande, du Saint-Laurent et de Californie, et la mer des Sargasses ;
sortent les mers de Tasman, de Java, des Laptev, des Tchouktches et de
Sibérie orientale, fondues dans leur océan (Fusion, plus bas).

| Id | Nom | Sorte | Dans | Intérieure | Wikipédias | Vues fr (12 mois) | Rang |
|---|---|---|---|---|---|---|---|
| `atlant` | océan Atlantique | océan | — |  | 252 | 121 558 | — |
| `pacif` | océan Pacifique | océan | — |  | 251 | 101 801 | — |
| `indien` | océan Indien | océan | — |  | 237 | 49 808 | — |
| `arctique` | océan Arctique | océan | — |  | 222 | 36 301 | — |
| `austral` | océan Austral | océan | — |  | 190 | 28 699 | — |
| `medit` | mer Méditerranée | mer | atlant | oui | 237 | 155 025 | 1 |
| `adriat` | mer Adriatique | mer | medit |  | 150 | 50 917 | 8 |
| `egee` | mer Égée | mer | medit |  | 142 | 49 344 | 10 |
| `ionienne` | mer Ionienne | mer | medit |  | 119 | 35 378 | 16 |
| `tyrrhen` | mer Tyrrhénienne | mer | medit |  | 109 | 42 390 | 17 |
| `noire` | mer Noire | mer | atlant | oui | 220 | 103 648 | 3 |
| `azov` | mer d'Azov | mer | noire | oui | 131 | 27 642 | 13 |
| `caspien` | mer Caspienne | mer | — | oui | 198 | 123 084 | 2 |
| `baltique` | mer Baltique | mer | atlant | oui | 189 | 65 633 | 5 |
| `botnie` | golfe de Botnie | golfe | baltique |  | 87 | 7 223 | 44 |
| `finlande` | golfe de Finlande | golfe | baltique |  | 101 | 5 659 | 37 |
| `nord` | mer du Nord | mer | atlant |  | 181 | 52 643 | 7 |
| `manche` | Manche | bras de mer | atlant |  | 124 | 105 396 | 9 |
| `irlande` | mer d'Irlande | mer | atlant |  | 110 | 10 076 | 25 |
| `gascogne` | golfe de Gascogne | golfe | atlant |  | 102 | 44 338 | 21 |
| `norvege` | mer de Norvège | mer | atlant, arctique |  | 107 | 9 507 | 31 |
| `groenl` | mer du Groenland | mer | arctique, atlant |  | 93 | 5 741 | 42 |
| `caraibes` | mer des Caraïbes | mer | atlant |  | 180 | 35 809 | 11 |
| `sargasse` | mer des Sargasses | mer | atlant |  | 85 | 65 182 | 30 |
| `mexique` | golfe du Mexique | golfe | atlant |  | 129 | 39 882 | 12 |
| `laurent` | golfe du Saint-Laurent | golfe | atlant |  | 81 | 17 127 | 38 |
| `guinee` | golfe de Guinée | golfe | atlant |  | 113 | 22 753 | 18 |
| `baffin` | baie de Baffin | baie | arctique, atlant |  | 95 | 4 993 | 45 |
| `hudson` | baie d'Hudson | baie | arctique, atlant |  | 105 | 29 738 | 22 |
| `barents` | mer de Barents | mer | arctique |  | 111 | 19 204 | 19 |
| `blanche` | mer Blanche | mer | barents | oui | 110 | 15 298 | 23 |
| `kara` | mer de Kara | mer | arctique |  | 102 | 6 894 | 35 |
| `beaufort` | mer de Beaufort | mer | arctique |  | 94 | 5 403 | 43 |
| `bering` | mer de Béring | mer | pacif |  | 112 | 9 999 | 24 |
| `okhotsk` | mer d'Okhotsk | mer | pacif |  | 108 | 7 447 | 33 |
| `japon` | mer du Japon | mer | pacif |  | 128 | 12 740 | 20 |
| `jaune` | mer Jaune | mer | pacif |  | 106 | 10 630 | 28 |
| `chineor` | mer de Chine orientale | mer | pacif |  | 105 | 4 314 | 40 |
| `chinemer` | mer de Chine méridionale | mer | pacif |  | 135 | 20 080 | 14 |
| `thailand` | golfe de Thaïlande | golfe | chinemer |  | 97 | 5 922 | 36 |
| `corail` | mer de Corail | mer | pacif |  | 97 | 10 740 | 34 |
| `californ` | golfe de Californie | golfe | pacif |  | 88 | 7 820 | 41 |
| `arabie` | mer d'Arabie | mer | indien |  | 135 | 19 990 | 15 |
| `oman` | golfe d'Oman | golfe | indien |  | 101 | 14 026 | 32 |
| `persique` | golfe Persique | golfe | indien | oui | 147 | 83 399 | 6 |
| `aden` | golfe d'Aden | golfe | indien |  | 104 | 13 314 | 27 |
| `rouge` | mer Rouge | mer | indien | oui | 182 | 80 537 | 4 |
| `bengale` | golfe du Bengale | golfe | indien |  | 126 | 6 853 | 26 |
| `andaman` | mer d'Andaman | mer | indien |  | 109 | 9 397 | 29 |
| `mozamb` | canal du Mozambique | bras de mer | indien |  | 85 | 11 100 | 39 |

Relevé : les vues manquantes de 42 candidates relevées le 12/11 (API
pageviews de Wikimedia, même période), puis le rang et cette table, par les
scripts de `~/Sauvegardes/terramemo/j2-conception/mers/rang-combine/`
(`rang.json` : les 99 candidates et les 45 retenues ; `table.py`). Les ids et
la sorte (baie, bras de mer, au lieu de « mer ») sont ceux de l'option a ;
cinq ids nouveaux : `botnie`, `finlande`, `sargasse`, `laurent`, `californ`.
Au lot 3a, ces extraits sont figés dans `geodata/`, comme ceux des pays.
Les golfes de Botnie et de Finlande sont des parties de la Baltique (qui ne
remonte jamais à l'Atlantique) ; Saint-Laurent et Californie sont bordiers,
justes pour leur océan ; les Sargasses, en pleine mer, sont justes pour
l'Atlantique. La baie d'Hudson n'est plus intérieure (D43 a, comme l'OHI).

**Ids** : 8 lettres minuscules au plus, sans accent ni tiret. Les lots de la
synchro l'exigent (§ 3.3) : `mediterranee` (12) ou `chine-meridionale` (17),
proposés par le relevé, feraient refuser des lots. Ces ids sont figés à vie,
comme les ISO3 des pays (fiches, records, classements). Aucun ne recoupe un
id de `pays.json` (majuscules, `NE_…`).

**Appartenance** (`Dans`) : une donnée, prise de Wikidata (P361), pas une
géométrie. Quatre mers ont deux océans : Norvège, Groenland, Baffin, Hudson
(Atlantique et Arctique). La
Caspienne est à part, sans océan. `interieure` dit qu'une mer ne fait pas
remonter jusqu'à un océan (règle au § 4.4, D43).

**Fusion** : chacune des 254 autres zones de Natural Earth est fondue dans une
retenue (mesuré) :
- 213 au plus long bord commun ;
- 36 forcées à la main, là où l'automatique se trompait (archipels : Sulu,
  Célèbes, Banda, Florès ; détroit d'Hudson ; Marmara) ;
- 5 exclues : deux Great Barrier Reef, Columbia River, Luzon Strait et Drake
  Passage (aires de moins de 1 km²).

Ces affectations sont celles de l'option a. La liste du 12/11 les change, à
refaire au lot 3a avec le même contrôle (aucune zone ni affectée ni
exclue) : les cinq mers sorties (Tasman, Java, Laptev, Tchouktches,
Sibérie orientale) vont à leur océan, jamais à une mer voisine retenue ; les
mers d'archipel qui allaient à Java (Florès, Bali, Banda…) sont à
réaffecter ; les cinq entrées ne sont plus fondues ailleurs.

Restent à relire, sans gravité (estimé) : la mer de Seto (partie dans la mer
du Japon, le Pacifique serait mieux), le détroit de Taïwan, le Cattégat, les
détroits de Bass et de Cook, le détroit de Davis et le Cumberland Sound,
Malacca. Le build échoue si une zone n'est ni affectée ni exclue : règle à
écrire dans `geodata/mers.mjs`, dans l'esprit des tables d'exceptions de
`build.mjs` (« tout écart à une règle est écrit ici », `geodata/build.mjs:106`,
un titre de commentaire, pas un contrôle).

**Mesuré au lot 3a** (`geodata/mers.mjs`, 12/11) : 13 827 sommets à 10 km,
6 589 à 50 km ; `mers.topo.json` 50 703 o gzip, `mers-leger.topo.json`
19 841 o, sous les budgets. 52 zones retenues, 69 forcées, 181 au plus long
bord, 4 exclues (deux Great Barrier Reef, Drake Passage, Luzon Strait). La
Columbia River n'est plus exclue : fondue au Pacifique, comme l'Amazone à
l'Atlantique. Une mer non retenue n'est jamais fondue au plus long bord :
elle a sa ligne forcée et sa raison (`geodata/mers.json`), le témoin
`geodata/mers-affectations.json` dit où va chaque zone. Couverture : 0,20 %
de la mer sans zone, 0,79 % de la terre sous une zone ; arête la plus longue
1,0008°. Cas tranchés :
- mers sorties : Tasman au Pacifique ; Java à l'Indien (P361) ; Laptev,
  Tchouktches, Sibérie orientale à l'Arctique ;
- archipel, par P361 : Florès, Bali, Banda, Célèbes, Soulou, Moluques,
  Seram, Halmahera au Pacifique ; Savu, Timor, Arafura à l'Indien. Le
  détroit de Macassar, sans P361, au Pacifique ;
- Alboran, Baléares, Ligure, Marmara à la Méditerranée. La mer de Crète à
  la mer Égée : P361, et l'OHI arrête l'Égée à la côte sud de la Crète ;
- Seto au Pacifique, son ouverture sur la mer des Philippines ;
- détroit de Taïwan à la mer de Chine méridionale, détroit de Corée à la
  mer du Japon : limites de l'OHI ;
- Cattégat à la mer du Nord (P361 : Atlantique) ; les Belts à la Baltique
  (OHI) ;
- détroits de Bass et de Cook au Pacifique ; détroit de Davis et Cumberland
  Sound à l'Arctique (P361) ; Malacca à l'Indien, que ni P361 ni l'OHI ne
  rangent.

**Noms** : libellés Wikidata en français, générique en minuscule (« mer
Méditerranée », « golfe Persique », « Manche »). La majuscule de début de
phrase est posée par le code. Les `name_fr` de Natural Earth se trompent
(« mer de Baffin », « mer de Laptev », Inner Sea traduite en mers d'Écosse) :
non repris. Deux cas :
- en français, « mer d'Oman » désigne souvent la mer d'Arabie (Wikipédia :
  « mer d'Arabie, ou mer d'Oman »), qui se confondrait avec le golfe d'Oman,
  lui aussi de la liste. « mer d'Oman » est donc un alias de `arabie` dans la
  recherche, et `arabie` et `oman` ne sont jamais leurres ensemble ;
- « mer du Japon » est contestée par la Corée (« mer de l'Est ») : on garde
  l'usage français, sans plus.

**Chaîne** (dans `geodata/`, mesurée sur le prototype du relevé) :
1. lire le shp avec mapshaper 0.6.110, celui du projet, en topologie ;
2. recaler l'antiméridien. Natural Earth écrit 179.99989708894586 (27
   sommets) ; sans un ±180 exact, `estCouture` (`dessin.ts:131`,
   `maillage.ts:80` ; EPS 1e-9 à `dessin.ts:87` et `maillage.ts:47`) ne
   reconnaît pas les coutures ;
3. affecter, `-dissolve id`, puis simplifier en topologie (les bords communs
   restent identiques) : 10 km au repos, 50 km pour les gestes,
   quantification 1e5 ;
4. densifier à 1° **après** la simplification, depuis la plus petite
   extrémité (comme `maillage.densifier`), coutures exceptées. Sinon le
   grand cercle de d3 et la ligne droite du dessin divergent : le Pacifique
   Sud était noté jusqu'à 72° S à 120° O, et dessiné jusqu'à 60,5° S ;
5. calculer les attributs sur la géométrie dissoute non simplifiée, comme
   pour les pays : superficie, point d'étiquette (`pointInterieur`),
   emprise, voisins (topologie).

**Fichiers servis** :

| Fichier | Contenu | Brut | gzip |
|---|---|---|---|
| `mers.topo.json` | objet `mers`, propriété `id`, 10 km | 151 086 o | 50 144 o |
| `mers-leger.topo.json` | 50 km, pour les gestes | 74 901 o | 19 458 o |
| `mers.json` | `[{id, sorte, parents, interieure, bassin, superficie_km2, point, bbox, voisins}]` | — | ≈ 4 Ko (estimé) |
| `mers.fr.json` | `{id: nom}` | — | < 1 Ko (estimé) |

Poids des deux topo mesurés par le relevé des mers. `bassin` est l'océan
atteint en remontant le premier parent (la Caspienne est rattachée à la main
à l'Atlantique, à côté de la mer Noire) : il sert aux grappes (§ 6.1).

**Chargement** : à la demande seulement. Ce sont le premier toucher en mer à
l'accueil, le choix du sujet, une séance qui a des fiches de mers, la
recherche, la carte de la mémoire des mers et le quiz. Rien au premier
affichage (le `smoke` le vérifie, lot 3a).

**Coût par visiteur** : avec D45 a, la couche se charge au premier toucher en
mer à l'accueil. La mer couvre 70 % du globe : presque chaque visiteur qui
touche la carte la paiera. 50 144 + 19 458 o gzip (mesurés), plus
`mers.json` et `mers.fr.json`, soit ≈ 75 Ko, environ 4 % du budget de
≈ 1,8 Mo par visiteur que suppose la décision « Hébergement » (360 Mo pour
≈ 200 visiteurs, estimé), en plus des drapeaux (8 %). Option de D45 a : à
l'accueil, ne charger que `mers-leger.topo.json` (19 Ko) et les deux JSON,
assez pour nommer la mer touchée ; la couche fine seulement pour une partie
de mers.

**Pourquoi un fichier à part** :
- dans `monde.topo.json` (457 458 o gzip mesurés), 50 Ko de plus le
  porteraient au ras du budget de 520 000 o (`tests/donnees.test.ts:314-315`),
  et sur le chemin du premier affichage ;
- les arcs marins ne partagent rien avec les côtes des pays ;
- les mers n'entrent pas dans la clé du maillage des terres. Mais cette clé
  comprend l'adresse du worker, que Vite hache sur `maillage.ts`,
  `donnees.ts` et earcut (`maillage.worker.ts:12-17`) : si le lot 3a modifie
  `maillage.ts` ou `donnees.ts`, le maillage des terres est recalculé une
  fois chez chacun (≈ 250 ms sur le PC, 640 à 740 ms ralenti 4×, hors du fil
  principal : sans gêne visible). Pour l'éviter, le maillage des mers va dans
  un module et un worker à part (`maillage-mers.ts`, qui importe
  `maillage.ts` sans le modifier), et le lot 3a ne touche ni `maillage.ts`
  ni `maillage.worker.ts`. `donnees.ts`, qui porte `DonneesCarte`, changera
  sans doute (`mers`) : le recalcul unique est alors un prix accepté, sans
  gêne visible.

**Contrôles mesurés** sur la couche finale (10 km) :
- aucun anneau extérieur au mauvais sens ; aucune arête de plus de 1,001°,
  coutures exceptées ;
- coupées à ±180 : Arctique, Austral, Pacifique, Béring, Tchouktches ; seul
  l'Arctique touche le pôle ;
- points d'étiquette dans leur forme simplifiée ;
- couverture (grille de 1°, pondérée par cos φ) : 0,20 % de la mer sans zone,
  0,79 % de la terre sous une zone marine ;
- écart de côte au p90 : 3,0 km côté terre, 2,6 km côté mer. C'est peu devant
  les 300 km du barème et le pixel du zoom 1 (≈ 100 km) ;
- sondes à 120° O et à ±179,99° : dessin et toucher coïncident.

**Tests** (lot 3a) :
- 50 zones ; ids `^[a-z]{3,8}$`, uniques, absents de `pays.json` ; un nom
  pour chaque id ; l'alias « mer d'Oman » sur `arabie` ;
- parents connus, sans cycle ; océans et Caspienne sans parent ;
- aucune géométrie vide ni d'aire nulle ; point dans sa forme ;
- aucune arête de plus de 1,001° hors coutures ; `geoArea` < 2π pour chaque
  anneau extérieur ;
- voisins symétriques ; une grille de points de mer couverte à 99,5 % au
  moins ;
- budgets gzip : `mers.topo.json` ≤ 56 000 o, `mers-leger.topo.json`
  ≤ 24 000 o ;
- deux builds identiques octet pour octet.

### 2.4 Notoriété

La décision « Quiz général » la mesure par le nombre de Wikipédias qui
parlent d'un lieu (Wikidata), et plus tard par les réponses de tous les
joueurs.

Mesures des relevés :
- **pays**, liens Wikidata : de 224 (Micronésie) à 430 (Turquie). Avec
  facile ≥ 380 (25 pays) et moyen ≥ 345 (38), la Finlande, l'Albanie, la
  Norvège et le Chili sont faciles. La Grèce, les Pays-Bas, le Portugal et
  l'Algérie sont moyens ; le Maroc, le Sénégal, la Côte d'Ivoire, le
  Cameroun et la Tunisie, difficiles. Le compte suit le nombre de petites
  Wikipédias (Europe de l'Est, langues turques), pas ce que sait un Français ;
- **capitales** : de 66 (Ciudad de la Paz) à 367 (Paris). Facile ≥ 260 (31) :
  mieux, mais Tirana y est, et Bruxelles est moyenne ;
- **rang combiné** : la moyenne du rang par Wikipédias et du rang par vues de
  la Wikipédia française, coupée par effectifs : les 40 premiers pays
  faciles, les 60 suivants moyens, le reste difficile ; pour les capitales,
  30 et 60. Nettement plus proche d'un Français. Restent
  des intrus (Albanie, Azerbaïdjan, Pakistan, Bakou), dus à des vues sur 60
  jours seulement, bruitées (robots ou actualité, estimé) ;
- **mers** (Wikipédias) : niveau 1 ≥ 175 (12 zones), niveau 2 ≥ 115 (11),
  niveau 3 pour les 27 autres. Correction possible d'après les vues
  françaises sur 12 mois : la Manche (105 396 vues, 4e de la liste) au
  niveau 1 ; Gascogne, Tyrrhénienne et Hudson au niveau 2 ;
- **drapeaux** : le niveau de leur pays. Pas de meilleure mesure (non
  mesuré : les Wikipédias de l'article du drapeau lui-même) ;
- une fiche de capitale prend le niveau de la plus connue de ses capitales
  justes.

Artefacts des capitales (mesurés dans le brouillon, `capitales.json`) :
- Monaco (321 liens), Singapour (333) et la Cité du Vatican (343) sont
  faciles parce que l'item Wikidata de leur capitale est celui du pays ;
- Taipei (200) est classée alors qu'elle n'est pas jouable ;
- « la plus connue » ferait montrer Ramallah (130) plutôt que Jérusalem-Est
  (82) pour la Palestine, Bujumbura (156, capitale économique) plutôt que
  Gitega (97), Malabo (158) plutôt que Ciudad de la Paz (66) : une capitale
  que la décision place en second, sur un sujet sensible pour la Palestine.

D'où : `geodata/notoriete.mjs` ignore une capitale dont l'item est celui du
pays (elle prend le niveau du pays) et les pays non jouables, avec un test sur
ces cas ; au quiz, le bouton juste d'un QCM montre la **principale**, et « la
plus connue » ne sert qu'à l'indice des questions à toucher (§ 9.2).

À corriger au lot 4a : ne compter que les liens vers Wikipédia (sites `*wiki`,
hors Commons, Wikispecies, Meta et Wikidata). Le relevé des mers l'a fait ;
celui des capitales a pris `wikibase:sitelinks`, tous projets confondus. Les
rangs devraient peu changer (estimé).

Le fichier `public/geo/notoriete.json` vaut `{v: 1, pays: {FRA: 1, …},
capitales: {…}, drapeaux: {…}, mers: {…}}` (≈ 3 Ko, estimé). Il est produit
par `geodata/notoriete.mjs` à partir des extraits figés et d'une table de
relecture à la main (`geodata/notoriete-main.json`), et chargé avec le quiz.
Méthode et seuils : D48.

### 2.5 Pipeline, crédits, sources

**Le principe actuel** (vérifié) :
- `geodata/build.mjs` télécharge chaque fichier de `SOURCES` dans
  `geodata/raw/` (ignoré par git) et vérifie son SHA-256 contre
  `geodata/sources.lock.json` ; il refuse un écart sans `--maj-empreintes` ;
- les sorties sont versionnées et identiques octet pour octet d'un lancement
  à l'autre ;
- `public/geo/sources.json` porte sources, versions, empreintes et
  traitement. L'île a les siens (`geodata/reunion.lock.json`).

**Ajouts** :

| Module | Entrées | Sorties |
|---|---|---|
| `geodata/mers.mjs`, appelé par `build.mjs` | les 5 fichiers marins dans `SOURCES['natural-earth']`, sous une base `10m_physical/` à ajouter (`NE_BASE` pointe `10m_cultural/`, `build.mjs:64`) ; `geodata/mers.json` (retenues, parents, `interieure`, bassin, noms, forcées, exclues) | `mers.topo.json`, `mers-leger.topo.json`, `mers.json`, `mers.fr.json` |
| `geodata/capitales.mjs`, idem | `geodata/wikidata/capitales.json` (extrait figé) ; `geodata/capitales-main.json` | `capitales.json`, `capitales.fr.json` |
| `geodata/drapeaux.mjs`, idem | tarball flag-icons (empreinte au verrou) ; `geodata/drapeaux-main.json` (corrections, familles, jumeaux) ; resvg-wasm | `drapeaux/<sha8>.svg`, `drapeaux.json`, `licences/flag-icons.txt` (hors du dossier immuable) |
| `geodata/notoriete.mjs`, idem | `geodata/wikidata/notoriete.json` (Wikipédias, vues) ; `geodata/notoriete-main.json` | `notoriete.json` |
| `geodata/wikidata.mjs`, réseau, lancé à la main | requêtes SPARQL figées (`geodata/wikidata/requetes.rq`) ; API wbgetentities ; vues de fr.wikipedia | les extraits figés, datés |
| `geodata/vignette-mers.mjs` (comme `vignette-ile.mjs`) | `mers-leger.topo.json`, monde léger | `src/vues/vignette-mers.ts` |

- `npm run geodata` refait tout, sans autre réseau que les sources
  verrouillées. Une option `--seulement mers|capitales|drapeaux|notoriete`
  évite de tout refaire.
- `npm run wikidata` est seul à toucher Wikidata. User-Agent générique ;
  65 s entre deux requêtes SPARQL si le service est bridé (une par minute,
  constaté le 10/11) ; 4 s entre deux requêtes de vues (l'API répond 429
  au-delà). On relit le diff de l'extrait avant de le commettre.
- Le tarball se lit par un lecteur tar minimal dans `geodata/outils.mjs`
  (en-têtes de 512 octets), sans dépendance.
- Les scripts du relevé sont à reprendre, et à porter de Python en Node là où
  il le faut : `capitales/scripts/construire.py`,
  `drapeaux/scripts/ressemblances3.py`, `mers/scripts/couche-mers.mjs`.

**Crédits** (`textes.credits.donnees`, `textes.fr.json:225`) :
- Natural Earth : « Frontières des pays, zones contestées et zones marines,
  au 1:10m · v5.1.2 » ;
- Wikidata : « Capitales et notoriété des lieux · extrait du JJ/MM/AAAA »,
  CC0. Aucune mention n'est obligatoire : c'est par courtoisie ;
- flag-icons : « Drapeaux des pays · v7.6.0, Honduras mis à jour (2026) »,
  MIT, « © 2013 Panayiotis Lipiridis ». MIT demande l'avis et le texte avec
  toute copie : le texte est servi sous `/geo/licences/` et ajouté à
  `licences-tierces.txt`, dans une section « Données » (`licences/tierces.ts`,
  décision « Licences tierces ») ;
- drapeau de l'Émirat, si D41 le retient : Commons, domaine public, mention
  facultative.

**`sources.json`** : la couche marine entre dans la source Natural Earth. On
ajoute une source Wikidata (date de l'extrait, empreinte des requêtes) et une
source flag-icons (version, empreinte du tarball, licence). Les empreintes des
tables à la main vont dans `traitement.entrees`.

## 3. Modèle

### 3.1 Sujets, domaines, fiches

- Un sujet de Jouer = un domaine de fiches, du même nom : `pays`, `communes`,
  `capitales`, `drapeaux`, `mers`. Ces noms vont dans le journal, les lots en
  ligne (création seule) et l'export : ils sont **figés à vie**.
- Capitales et drapeaux prennent l'id du pays, puisque l'entité jouée est le
  pays : `capitales:BOL:localiser`, `drapeaux:TCD:nommer`. Mers :
  `mers:medit:localiser`.
- Les sens restent. `localiser` va de l'indice au lieu (nom, capitale,
  drapeau ou nom de mer montré, on touche : « Trouver »). `nommer` va du lieu
  à l'indice (la zone s'allume : « Reconnaître », carte retournée). Ces mots
  ne s'affichent nulle part ; les changer casserait journal et classements.
- `fiches.ts` : `Domaine` et `DOMAINES` gagnent les trois noms dès le lot 0a.
  `analyser` refuse un domaine absent (`fiches.ts:45`) ; `soeur` reste dans
  le domaine.
- **Lire n'est pas savoir poser.** `DOMAINES` dit ce qui se **lit** (journal,
  lots, export, rejeu) ; `DOMAINES_JOUABLES` (nouveau, `fiches.ts`) dit les
  sujets **livrés** dans la version : `['pays', 'communes']` au lot 0a, puis
  `capitales` au lot 1, etc. Révision du jour, `comptes()`, introductions,
  choix du sujet de la carte de la mémoire et quiz ne prennent que les
  jouables. Sans cela (vérifié) : `comptes()` additionne les `dues()` des
  domaines listés (`vues/seance.ts:164-169`), la séance pose chaque fiche
  avec l'`InfoDomaine` de son bloc (`vues/seance.ts:207-217`), et `noter`
  lève « cible inconnue » pour un id absent de `entites` (`pick.ts:146-147`).
  Le site avance lot par lot et l'APK n'est rebâti qu'au lot 5 : une version
  du lot 1 qui reçoit par la synchro des fiches `drapeaux:` les poserait
  comme des pays (« Touche : Tchad », note FSRS fausse dans la mémoire des
  drapeaux) ou planterait sur `mers:medit` ; dès le lot 0a, la ligne de Jouer
  compterait des fiches « à revoir » que la séance refuse ensuite. Les fiches
  d'un sujet non jouable restent au journal, intactes, et entrent en séance
  à la mise à jour.
- Une même entité dans deux sujets le même jour (France en Reconnaître, puis
  Paris en Trouver) : accepté, sans règle « famille ».

### 3.2 Épreuves et records

- Id : `mode:clé:série`. La clé vaut `localiser` pour pays et communes
  (inchangé : records, profils et classements en dépendent), et `capitales`,
  `drapeaux`, `mers` ailleurs. Le quiz : `quiz:general:<difficulté>`.
- Exemples : `chrono:localiser:Africa` (inchangé), `chrono:capitales:Africa`,
  `sansfaute:drapeaux:tous`, `minute:mers:mers`, `quiz:general:expert`.
- Capitales et drapeaux ont les séries des pays (Tous, six continents). Les
  mers ont une série, `mers` (D44) : un id distinct de `tous` évite les
  collisions de libellé (`nomSerie('tous')` = « Tous les pays ») et de cache
  des vignettes.
- `idEpreuve(serie, mode, sujet = 'pays')`, avec une table `CLE_SUJET` ;
  appelants : `jouer.ts:59-63` (`recordDe`), `vues/chrono.ts` (le sujet du
  `Lancement`), `general.ts:24` (`nomEpreuve` : « Capitales · Afrique »).
- `EPREUVES_SUJETS` (paires clé et série, ordre du catalogue) remplace
  `SERIES_EPREUVES`. `EPREUVES`, les Chrono que le général additionne, en
  découle (D40). `EPREUVES_CLASSEES` = 3 modes × 23 paires = 69, plus les 4 du
  quiz.
- `ModeClasse = ModeEpreuve | 'quiz'`. `modeEpreuve` rend `'quiz'` pour
  `quiz:…`, `null` pour un préfixe inconnu, et `'chrono'` pour `general`
  (le général est du Chrono). `MODES_EPREUVE` ne change pas : il fait les
  exercices classés de chaque série (`arbre.ts:47`). Appelants à suivre
  (vérifié) : `epreuve/chrono.ts:402, 432`, `epreuve/classement.ts:94`
  (départage), `vues/classement.ts:208, 232, 270` (généraux, classe CSS),
  `vues/general.ts:30, 57, 66`.
- **`publierTout` ignore les records de mode `null`.** Il envoie aujourd'hui
  tout record de l'appareil (`vues/classement.ts:194-209`). Un record
  d'épreuve inconnue, reçu par le profil d'une version plus récente,
  deviendrait « refusé d'avance » (`vraisemblable` faux,
  `vues/classement.ts:109, 129`) et afficherait « Score refusé par le
  classement » à chaque changement de pseudo. Test au lot 0a.
- **Le général durci** : `totalGeneral` n'additionne plus que les épreuves de
  `EPREUVES`, au lieu de tout record de mode `chrono`. Aujourd'hui, un
  préfixe inconnu est pris pour un Chrono (`chrono.ts:210-213`) : une
  version d'avant le J2 compterait au général les records du quiz (et, si
  D40 dit non, ceux des Chrono nouveaux), reçus par le profil du compte.
  D'où ce changement au lot 0a, bien avant les premières épreuves
  nouvelles. `vraisemblable` refuse un mode inconnu.
- **L'APK en retard sur le site.** `EPREUVES` et `placesDuPseudo` sont figés
  dans le binaire (`epreuve/classement.ts:66`). Un APK bâti avant
  l'ouverture des épreuves d'un sujet ignore leurs records : avec D40 a, il
  publie un général plus bas, que les règles refusent (pas de progrès), puis
  tient sans bruit pour « déjà mieux » (`epreuve/classement.ts:50-55`). Rien
  n'est faussé en ligne, mais son 🏆 montre un autre total que le site.
  Recommandé : rebâtir l'APK de l'utilisateur (seul APK en circulation) à
  chaque ouverture des épreuves classées d'un sujet, de jour, après
  `sauver_journal` ; sinon, c'est un prix accepté jusqu'au lot 5.
- Records : même clé `terramemo.chrono.records`, même `VERSION_BAREME`. Ne
  jamais monter `VERSION_BAREME` pour le quiz : le filtre de `lireRecords`
  (`chrono.ts:243`) effacerait tous les records. Une formule nouvelle prend
  un id nouveau (§ 9.5).
- Rien à migrer : les ids des pays et des communes ne changent pas.

### 3.3 Journal, synchro, anciens clients

- **Rien de nouveau au journal** : ni type, ni mode, ni champ. `MODES` est
  encodé par rang dans les lots, et on n'y ajoute qu'à `v = 2` (`lots.ts:21-22,
  54`). `reponse` garde l'id du pays choisi au QCM (64 caractères au plus,
  `journal.ts:67`), et `distance_km` vaut pour les mers. Le quiz n'écrit rien
  au journal (D51).
- **Borne de 160 caractères par carte de lot** (`firestore.rules:227`,
  `lots.ts:30`). Mesuré par `synthese/scripts/carte-lot.mjs`, encodage de
  `compacter` recopié. La carte la pire a une réponse fausse, `via`, `aide`
  et `note` à `null`, un zoom et une distance à 17 chiffres, une durée de
  120 000 ms et un écart de temps à 8 chiffres :
  - `capitales` avec un id de 3 lettres : 149 caractères pour un lot d'une
    carte, 143 en moyenne sur 200 ; avec une `reponse` de 6 caractères (un
    toucher sur une entité `NE_XXX`), 152 (relecture) : toujours sous 160 ;
  - `mers` avec un id de 8 lettres : 154 et 148 ; de 11 lettres, 160 ; de 12
    lettres, 162 : refusé.
  D'où les ids de mers à 8 lettres au plus. Un lot refusé serait classé
  `invalide` et ne partirait jamais (`envoi.ts`). Aucune règle ne change.
- **Lots mixtes** : une séance a un seul id pour tous ses blocs
  (`vues/seance.ts`, `ouvrir`), et un lot = un appareil et une séance. Une
  Révision du jour qui mêle pays et capitales fait donc des lots mixtes. Une
  version qui ne connaît pas `capitales` ne lit pas le lot entier, pays
  compris :
  - elle le garde brut dans `a_relire`, le compte dans « Mets à jour
    l'appli », et le relit sans réseau à la version suivante (`envoi.ts`,
    `depot-lots.ts`). Test existant : `tests/sync-lecture.test.ts:148-178` ;
  - elle ne plante pas, ne perd rien, ne renvoie rien ;
  - sa mémoire des pays prend du retard jusqu'à la mise à jour : ce n'est pas
    une perte.
  La parade est le lot 0a : les trois domaines entrent dans `DOMAINES` avant
  que rien ne les écrive. Un APK bâti après lui (celui du lot 7 du J1b) les
  lit déjà ; il ne les **pose** qu'une fois le sujet dans
  `DOMAINES_JOUABLES` (§ 3.1).
- **Ancien onglet** de la même origine : `depot.tous()` filtre par `valider` ;
  il ignore les fiches inconnues sans planter. Il peut couper une séance mixte
  en deux lots, sans doublon.
- **#3, « à version égale »** : le critère ne promet l'égalité qu'entre deux
  appareils à la même version. Ajouter des domaines ne le casse pas.
- Export (`V_EXPORT = 1`) et outil du propriétaire (`scripts/admin/`) : aucun
  impact.

### 3.4 Migrations

Aucune :
- le journal (`terramemo-journal` v1) et les lots (v1) restent valides ;
- les clés des records des pays et des communes ne changent pas ;
- le profil d'un compte garde les records dans une chaîne de 32 768
  caractères au plus (`profil.ts:77`). Le relevé a mesuré 18 773 caractères
  pour 73 épreuves, de toujours et de la semaine (marge de 43 %). Au-delà, le
  profil cesserait d'être écrit, sans bruit (`RECORDS_MAX`, `profil.ts:77,
  192`) : à revoir avant le J5. Un test unitaire (lot 4b, `profil.test.ts`)
  bâtit la chaîne au pire, 73 épreuves × 2 périodes aux nombres les plus
  longs, et la veut sous `RECORDS_MAX` ;
- la base `terramemo` reste en v1 (le maillage des mers a son propre
  enregistrement, § 4.3) ;
- `terramemo.jouer.derniere` : l'ancienne forme reste lisible (§ 7.1).

## 4. Carte

### 4.1 Capitales et drapeaux : rien à dessiner

Trouver, Reconnaître et les trois épreuves ne demandent à la carte que des ids
de pays (vérifié). Le drapeau et la capitale s'affichent dans la barre. Un
seul ajout, facultatif (D53) : un anneau au point de la capitale après la
réponse, en Entraînement. `anneau(id)` ne prend qu'un id de zone
(`carte-canvas.ts:747`, `carte.ts:543`) : il faut `anneauEn([lon, lat])`
dans les trois rendus (S).

### 4.2 Couche marine : données et index

- `DonneesCarte.mers: Entite<Mer>[]`, vide tant que rien n'est chargé. `Mer`
  étend `Lieu` (id, statut `jouable`, superficie, point, bbox, voisins,
  `micro: false`) et ajoute `sorte`, `parents`, `interieure`, `bassin`.
- **Jamais dans `entites`** : pastilles, grappes, Nommer, recherche, maillage
  et classement verraient les mers comme des pays (54 usages, 17 fichiers).
- Un index commun id → `{lieu, forme, couche}` sert `ecran`, `vise`,
  `montrer`, `marquer` et `noter`.
- Chargement : `chargerMers()` lit les deux topo, `mers.json` et
  `mers.fr.json`, une fois, comme l'île (`src/terrains.ts:56-71`).
- **Lancer une partie attend le sujet, pas seulement le terrain.**
  Aujourd'hui, `lancer` (`jouer.ts:155-160`) passe par `avecTerrain`, qui
  part tout de suite pour le monde (`vues/commun.ts:163-166`). La série des
  mers aurait le terrain `monde` et des ids vides tant que `mers.json` n'est
  pas lu (`cibles.ts:43-50`) : sur un réseau lent, un Chrono de mers à 0
  cible, une capitale affichée par son Qid, un drapeau absent ; hors ligne
  sur le site, aucun message. `avecTerrain` devient `avecSujet` : le
  terrain, puis le `charger()` du sujet (capitales, manifeste des drapeaux,
  couche marine), avec le statut « Chargement… » et le message
  `echec_terrain` de l'île. Mêmes chemins pour « Rejouer » des bilans et
  pour l'Essai J0. `commun.ts` et `jouer.ts` sont aux fichiers des lots 1, 2
  et 3b, avec un test par sujet : chargement puis lancement ; échec puis
  message.

### 4.3 Dessin dans les trois rendus

**Règle commune** : la mer se dessine **sous** les terres, en remplissage, sans
contour. Ses côtes, grossières, restent cachées, et l'on ne trace aucune
frontière entre mers (D45).

**Canvas** (rendu par défaut) :
- un calque `mers`, préparé comme les pays (`preparer`, `dessin.ts:144`), au
  repos (10 km) et en mouvement (50 km) ;
- la couche de base ne trace ce calque que si une teinte le demande (carte de
  la mémoire des mers, `?mers=demo`). Il se place entre l'ovale (`--mer`) et
  les terres, avec un `Path2D` par seau. Sinon, rien n'est tracé : une partie
  de pays ne paie rien ;
- **les marques d'une mer** (allumée, juste, fausse) vont sur la couche du
  dessus, comme celles des pays (`dessinerMarques`, `carte-canvas.ts:1179`) ;
  un toucher ne redessine qu'elle (72 → 32 ms au toucher, sur le PC ralenti
  × 4 : `carte-canvas.ts:1016-1027`). Mais
  cette couche est au-dessus des terres, et porte aussi les marques des pays.
  Ordre imposé : d'abord la mer (et son contour faux), puis son effacement
  sous les terres de son emprise (`globalCompositeOperation =
  'destination-out'`), **puis** les marques des pays. Dans l'autre ordre,
  l'effacement retirerait une marque de pays déjà peinte. Test au lot 3a
  (enregistreur du contexte) : une mer et un pays marqués ensemble, le pays
  reste peint ;
- la marque d'une mer sur la carte de base est écartée : chaque toucher
  redessinerait toute la carte ;
- `sommetsVisibles` (`carte-canvas.ts:286-290`) compte aussi le calque marin
  quand il est tracé, pour la bascule vers la carte allégée
  (`BUDGET_SOMMETS = 20 000`, `:124`, comparé aux sommets visibles de la
  carte **complète**, `:1038`).

**WebGL** :
- un 5e maillage `mers` (`maillage.ts`), dessiné après l'ovale et avant les
  terres, avec le programme `remplir` et sa propre texture de couleurs
  (teintes et marques) ;
- les terres, dessinées ensuite, couvrent la mer allumée sans effort. Sans
  teinte ni marque, l'appel n'est pas fait ;
- le contour faux d'une mer est tracé avant les terres ;
- le maillage des mers a son propre worker (`maillage-mers.ts`, § 2.3) et son
  propre enregistrement IndexedDB (`'webgl-mers'`, à côté de `'webgl'`,
  `maillage.worker.ts:45`). Le relais WebGL du monde n'attend pas les mers ;
  la clé des terres ne change que si le lot 3a touche aux fichiers que Vite
  hache dans son worker (§ 2.3). Le coût est estimé à environ 10 % du
  maillage des terres (15 207 sommets et 14 116 triangles mesurés à 10 km,
  contre ≈ 125 000 sommets visibles pour les terres).

**SVG** (`g`, `css`) : un `g.couche-mers` entre `path.sphere` et
`couche-pays` ; des `path.mer`, remplis seulement ; des classes de seau et de
marque ; le contour faux sous `couche-pays` (S).

**Palette** : couleurs de la mer allumée, juste et fausse, et teintes de la
mémoire sur l'eau. Elles se choisissent avec la palette de #28 (carte en plein
soleil, en essai sur une branche) : le lot 3a vient après elle, ou en reprend
les jetons.

### 4.4 Toucher et notation

**`pickMer`** (cible marine seulement) :
1. le doigt est sur une terre (`sousLePoint` des pays) : ce n'est pas une
   mer, sauf si une sonde à 4, 8 ou 12 px tombe dans la mer visée. C'est la
   même tolérance que la côte d'un pays touchée en mer (`SONDES_PROCHE`,
   `pick.ts:33`) ;
2. sinon, la zone marine qui contient le point ;
3. sinon (fentes le long des côtes : 0,20 % de la mer), la zone la plus
   proche par les mêmes sondes.

La terre gagne toujours au-delà de 12 px : les zones marines débordent sur
0,79 % des terres, et un toucher au milieu de l'Italie n'est pas l'Adriatique.

**`noter` par couche** : la cible est cherchée dans `entites`, puis dans les
mers. Une cible marine prend `pickMer` et ses zones admises.

**Un océan et ses mers** (D43). La relation est une donnée (`parents`,
`interieure`). Le mécanisme existe déjà : `construireAcceptes` produit des
`ZoneAdmise` que `noter` essaie (`acceptes.ts:34-48`, `pick.ts:145-184`) ; on
ajoute une sorte `partie`, passée par la vue du sujet Mers comme zones en
plus (`OptionsNoter.acceptes`, § 2.2), jamais dans la table commune. Est
juste :
- la zone visée ;
- ou une zone dont la cible est un ancêtre, en remontant `parents` ; mais le
  chemin ne mène jamais à un **océan** s'il passe par une zone intérieure (la
  zone touchée comprise).

Ce que ça donne :

| Toucher | Cible | Note |
|---|---|---|
| mer des Caraïbes, mer du Nord, Manche, golfe de Guinée | océan Atlantique | juste (« Juste : mer des Caraïbes, dans l'Atlantique ») |
| golfe de Thaïlande | mer de Chine méridionale, ou Pacifique | juste |
| Adriatique, Égée | mer Méditerranée | juste |
| Azov | mer Noire | juste |
| mer Blanche | mer de Barents | juste ; faux pour l'Arctique |
| Méditerranée, mer Noire, Baltique | Atlantique | faux (distance au bord de l'Atlantique : courte) |
| mer Rouge, golfe Persique | océan Indien | faux |
| baie d'Hudson | océan Arctique, ou Atlantique | juste (D43 a : non intérieure, comme l'OHI) |
| golfe de Botnie, golfe de Finlande | mer Baltique | juste ; faux pour l'Atlantique |
| mer des Sargasses | océan Atlantique | juste |

Un océan allumé (Reconnaître, carte de la mémoire) montre sa pleine mer : sa
zone, puisque la partition en a retiré ses mers, plus la mer qu'il enclave
sans côte, la mer des Sargasses dans l'Atlantique (choix du 12/11 : sinon
un grand trou au milieu de l'Atlantique allumé). Jamais ses mers côtières.
La mer des Sargasses demandée s'allume seule.

**Barème** (épreuves, quiz) : 500 × e^(−d/300 km), comme les pays (`ECHELLES_KM.monde`,
`bareme.ts:23`). `d` est la distance au bord de la cible, ses zones admises
comprises (`distanceAuBordKm`, `geo.ts:207`) :
- toucher la mer voisine donne ≈ 0 km au bord commun, soit ≈ 490 points,
  comme le pays voisin ;
- toucher la terre pendant une question de mer donne la distance à la côte
  grossière (un ou deux km d'écart, sans effet sur la note).

**Petites mers** : à 1 px ≈ 100 km au zoom 1 du téléphone, la mer d'Azov fait
≈ 2 px (estimé). Dans une question de mer seulement, une cible invisible de
22 px au point d'étiquette des mers de moins de 10 px, comme les micro-États
en mer. Pas de pastille de mer hors d'une question.

### 4.5 Antiméridien, pôles, cadrage

- Le recalage à ±180 et la densification (§ 2.3) font que dessin, toucher,
  distance et SVG voient la même forme (écart sous le km sur 1°, estimé).
- Coupées à ±180 : Pacifique, Béring, Tchouktches, Austral, Arctique, comme
  la Russie et les Fidji (déjà gérés). L'Arctique est fermé par le pôle,
  comme l'Antarctique : `estCouture` le reconnaît.
- **Cas neuf** : l'Austral, bande de 360° sans pôle. À tester en Canvas
  (bande ramenée au bord de l'ovale, `dessin.ts:9-24`) et en WebGL (copies,
  stencil), à 16 rotations.
- Cadrage : `vise` et `montrer` cadrent aujourd'hui le polygone principal
  (`anneauPrincipal`, `geo.ts:146`), soit une moitié du Pacifique. Une mer
  se cadre par son emprise (`unionEmprises`, `geo.ts:235` ; `viserEmprise`,
  `vue.ts:228`), et la vue tourne vers son centre.

### 4.6 Fluidité : budget et mesures

Seuils : décision « Critère de saccade » (à-coup de 25 ms et plus, plus de
3 par seconde par type de geste ou dans un seul geste, ou un gel de 50 ms),
quel que soit le rendu.

**Pendant les gestes** : la carte allégée des terres a environ 13 000
sommets, et le calque marin à 50 km en a 7 599 (relevé des mers), soit
≈ 20 600 à tracer. `BUDGET_SOMMETS` ne borne pas ce total : il décide
seulement de passer à l'allégée, d'après les sommets visibles de la complète
(`carte-canvas.ts:1038`) ; l'allégée est tracée quel que soit son poids. Le
calque marin ajoute donc environ 60 % au tracé allégé (estimé), ce que les
mesures ci-dessous tranchent. Ce cas n'arrive qu'avec la carte de la mémoire
des mers (le seul cas où la base trace le calque), à l'accueil.

Mesures, dans cet ordre :
1. **sans navigateur** : dans un vitest ciblé (comme `carte-canvas.test.ts`,
   enregistreur de `moveTo`/`lineTo`), compter les sommets parcourus et émis
   par le calque marin, au repos et en mouvement, aux zooms 1, 2 et 8, à 16
   rotations ; mesurer en Node le temps JS du tracé, avec et sans mers ;
2. **au pilote**, un crochet `?mers=demo` : le calque montré, chaque mer
   teintée d'un seau tiré de son id, comme `?teintes=demo` (`main.ts:120`).
   Le même jour, avec et sans (`--out` à part) : `driver.py mesurer --cible
   local --rendu canvas` puis `--ralenti 4`, et `--rendu webgl --gpu` ;
3. **sur l'A37**, de jour, l'utilisateur présent (verrouillé la nuit) :
   Chrome puis APK, canvas et webgl ; `outils/touchers_reels.py` sur une mer
   allumée, pour juger le `destination-out` (médiane < 100 ms, « Critère du
   toucher »).

À lire : « pas de saccade » par type de geste, `dessin_ms` au p95, « fin de
geste < 100 ms », et « rendu < 1 s » inchangé (les mers ne se chargent pas à
la première visite). Si le Canvas saccade avec les mers et pas sans : mers à
20 km partout, ou calque marin coupé pendant le geste (seules les marques
restent). Une seule mesure à la fois : la RAM du PC.

## 5. Exercices

### 5.1 Rendu par sujet

Un module pur `src/vues/sujets.ts`, indexé par sujet. Il donne :
- `enonce(id)` : ce que montre la barre en Trouver et en épreuve ;
- `consigneQcm` et `choix(id)` (le contenu d'un bouton de Reconnaître) ;
- `revelation(id)` (carte retournée, rétroaction) et `nomBilan(id, sens)` ;
- les textes `textes.sujets.<id>.*`.

Pays et communes y gardent leur comportement actuel (`nomDe`). Les textes
propres à un sujet quittent `textes.terrains` pour `textes.sujets` :
`consigne_nommer`, `faux_suite`, `expire`, `expire_sans_points`, le compte
d'une série. `Textes = typeof fr` : une clé manquante ne compile pas.

`qcm.choix` (`qcm.ts:45`) garde son principe, les ids des lieux. Il gagne deux
options : `exclus` (pays de `x` pour Jérusalem, jumeaux de drapeaux, ancêtres
et descendants d'une mer, `arabie` avec `oman`, les 9 de D37 c) et une
stratégie de leurres par sujet et par difficulté (voisins, sosies, lieux
connus du même continent ou éloignés, § 9.2). Le quiz les réutilise : elles
arrivent au lot 1. Seul l'affichage
change d'un sujet à l'autre ; la réponse reste `choisi === id`
(`qcm.ts:108`), et `reponse` garde l'id choisi pour les confusions.

À remplacer (vérifié) :
- énoncés : `essai.ts:270`, `vues/chrono.ts:207, 245`, `nommer.ts:175, 184,
  217`, `retournee.ts:84, 87` ;
- rétroactions et bilans : `essai.ts:573` (ratés du bilan de Trouver),
  `essai.ts:689` et `vues/chrono.ts:288, 401` (« tu as touché X », avec
  `T.la_mer` même si l'on a touché une autre mer), `nommer.ts:256` (fautes du
  bilan de Reconnaître), le bilan de séance (`vues/seance.ts`, `bilan`) ;
- `texteAdmis` (`commun.ts:99-106`) : sortes `jumeau` et `partie` (§ 2.2) ;
- hors partie : le nom au toucher à l'accueil (`explorer.ts:102`, D45) et le
  compte d'une série (`jouer.ts:250`).

`nomDe` rend l'id brut à défaut (`commun.ts:85-87`) : un endroit oublié
afficherait « medit », ou « Touche : Bolivie » dans une partie de capitales.
D'où un test par vue et par sujet, bilans compris.

### 5.2 Capitales

| Exercice | Ce qu'on voit | Ce qu'on fait | Juste |
|---|---|---|---|
| Trouver, épreuves | « Pays dont la capitale est : **La Paz** » | toucher la carte | le pays (et ses zones admises) |
| Reconnaître, QCM d'Apprendre | un pays allumé, « Quelle est sa capitale ? » | choisir parmi 4 noms | le bouton du pays |
| Carte retournée | un pays allumé, « Quelle est sa capitale ? » | « Révéler » : « Sucre · La Paz (siège du gouvernement) » | « Je savais » ou non |

- Le nom du pays n'est pas montré dans la question (la forme de la
  décision) ; il l'est dans la rétroaction : « La Paz · capitale de la
  Bolivie ».
- Pour un pays à plusieurs capitales, la capitale montrée est tirée parmi
  ses capitales justes en Entraînement et en mémoire, et fixe pour tous en
  épreuve classée (D38).
- Leurres : § 2.1. Les noms longs (« Sri Jayawardenapura Kotte », 25
  signes) passent sur deux lignes.
- Les 9 pays au nom de leur capitale : défaut de D37 (exclus), avec deux
  autres options dont c (gardés en Trouver et en épreuve, ni posés ni leurres
  en Reconnaître). Aucune option ne supprime toutes les questions presque
  gratuites : Andorre-la-Vieille, São Tomé, Tunis, Alger, Mexico restent.

### 5.3 Drapeaux

| Exercice | Ce qu'on voit | Ce qu'on fait | Juste |
|---|---|---|---|
| Trouver, épreuves | « Pays de ce drapeau : » et le drapeau | toucher la carte | le pays, ou son jumeau (§ 2.2) |
| Reconnaître, QCM d'Apprendre | un pays allumé, « Quel est son drapeau ? » | choisir parmi 4 drapeaux | le bouton du pays |
| Carte retournée | un pays allumé, « Quel est son drapeau ? » | « Révéler » : le drapeau | « Je savais » ou non |

**Drapeau montré** (D41, réponse du 12/11) : celui d'un pays à deux drapeaux
justes (Afghanistan, Bolivie) est le premier du manifeste partout (boutons
de Reconnaître, révélation, carte retournée, épreuves), le même pour tous.
Seul l'énoncé de Trouver hors épreuve (Entraînement, Apprendre, Révision du
jour) montre l'un des deux au hasard, fixé pour la question, comme une
capitale (D38 a). Le préchargement demande celui qui sera montré. Les deux
ne sont jamais côte à côte (un seul drapeau par pays dans une grille).

**Leurres** : en Entraînement et en Apprendre, les **voisins** d'abord, puis
les plus proches, comme le dit la décision « Nommer » (« des voisines en
leurres ») ; jamais le jumeau. Des quasi-jumeaux (Mali, Guinée, Sénégal) dès
le premier QCM d'une grappe créeraient de l'interférence chez un débutant.
Les sosies (score ≤ 0,3, jumeaux exceptés) servent au quiz moyen, difficile
et expert (D49). Les sosies étant souvent voisins, un QCM d'Afrique de
l'Ouest en montrera quand même. Les sosies d'abord en Reconnaître sont
l'option D41 e.

**Affichage** (mesures du relevé des drapeaux ; à juger à la capture, UI selon
le skill `nouveau-projet`) :
- barre de Trouver et des épreuves : drapeau 4:3 de 64 × 48 px sur le
  téléphone, 96 × 72 px à partir de 600 px de large. Un gris 4:3 tient la
  place pendant le chargement ;
- Reconnaître : grille 2 × 2 de boutons-images, drapeaux de 64 px de haut
  sur le téléphone, 96 px au-delà ; touches 1 à 4. La zone allumée doit
  rester visible au-dessus de la barre plus haute (`allumerZone` lit la
  hauteur réelle de la barre, `nommer.ts:90-105`) : à vérifier au pilote, à
  375 px de large ;
- chaque drapeau sur fond blanc (le Népal est transparent à 67 %, et les
  fines lignes d'anticrénelage entre les bandes laissent voir le fond), avec
  un liseré neutre de 1 px (pourtours blancs : Japon, Chypre… ; presque noirs
  sur le thème sombre : Angola, Allemagne…) et des coins de 2 à 4 px ;
- après la réponse : contour de 3 px, vert pour le bon, rouge pour le mauvais
  choix, et une icône ✓ ou ✗. Pas de fond vert ou rouge : il se confond avec
  les couleurs d'un drapeau.

**Accessibilité**, sans donner la réponse :
- `alt` de la barre : « Drapeau à reconnaître » ;
- boutons : `aria-label` « Choix 1 » à « Choix 4 », sans `title` (son
  infobulle donnerait la réponse) ;
- fichiers nommés par l'empreinte, sans `id` de pays ; `<img>` plutôt que
  SVG en ligne (pas de conflit d'id), `draggable=false` ;
- après la réponse, une région `aria-live` : « Faux : c'était le drapeau du
  Tchad ; tu avais choisi celui de la Roumanie ».

L'exercice reste visuel ; le « ? » le dit.

### 5.4 Océans et mers

| Exercice | Ce qu'on voit | Ce qu'on fait | Juste |
|---|---|---|---|
| Trouver, épreuves | « Touche : **mer Égée** » | toucher la carte | § 4.4 |
| Reconnaître, QCM d'Apprendre | une mer allumée, « Quelle est cette mer ? » | choisir parmi 4 noms | le bouton de la mer |
| Carte retournée | une mer allumée | « Révéler » : son nom | « Je savais » ou non |

- Leurres : les voisins marins (topologie, `mers.json`), puis les plus
  proches. Jamais un ancêtre ni un descendant de la cible : « mer
  Méditerranée » serait juste aussi pour l'Adriatique allumée.
- La vue se cadre sur l'emprise de la mer (§ 4.5).

## 6. Répétition espacée

### 6.1 Domaines, grappes, réserves

- **Réserve de nouveautés** : `GRAPPES_PAR_JOUR = 1` se compte déjà par
  domaine (`planif.ts:22`, `grappesCommencees`, `programme`). C'est la
  « propre réserve » de chaque sujet pour les grappes. Un plafond
  d'introductions commun (D46) s'écarterait de cette lettre pour les fiches
  « Reconnaître » : c'est posé à l'utilisateur.
- **Révisions** : `REVISIONS_PAR_SEANCE = 25` et `REVISIONS_PAR_JOUR = 60`
  restent communs à tous les domaines (`planif.ts:12-14`). Atteint, le
  plafond du jour arrête les nouveautés de tous les sujets à la fois
  (`'plafond'`, `planif.ts:230`) : son message ne désigne aucun sujet.
- **Grappes** :
  - pays : inchangées (≈ 31 grappes de 5 à 9) ;
  - drapeaux : les grappes des pays, telles quelles (mêmes ids, mêmes
    leurres voisins, même cadrage, même ordre D4) ;
  - capitales : les grappes des pays, moins les pays exclus par D37 (options
    a et c). Une grappe peut tomber sous 5 ; on l'accepte, pour que la
    grappe G des capitales reste la grappe G des pays. Mais aucune ne doit
    devenir **vide** (risque non mesuré : une grappe de micro-États
    d'Europe de l'Ouest, Luxembourg, Monaco, Saint-Marin, Vatican) : une
    grappe vide est sautée, et un test (lot 1) vérifie qu'aucune ne l'est ;
  - mers : `grappesMers()`. D'abord une grappe « Océans » de 5
    (`TAILLE_MIN = 5`, `grappes.ts:33`). Puis `grappes()` sur les 45 mers,
    avec groupe = continent = `bassin`, dans l'ordre Atlantique, Indien,
    Pacifique, Arctique. Sans cet ordre, `ORDRE_CONTINENTS` rangerait les
    bassins après les continents, par nom (`grappes.ts:41-45`). Estimé : 9
    grappes (Atlantique 17 → 3, Arctique 10 → 2, Pacifique 10 → 2,
    Indien 8 → 1, plus les Océans) ;
- **Introductions** : les fiches « Reconnaître » (sens `nommer`) entrent le
  lendemain de leur sœur, sans plafond aujourd'hui : `introductions()` les
  rend toutes (`planif.ts:156-210`). Un plafond `INTRODUCTIONS_PAR_JOUR`
  (D46, par domaine ou commun) change donc **aussi les pays et les
  communes**. Le reliquat (les introductions au-delà du plafond) attend le
  lendemain, les plus anciennes d'abord ; et un sujet dont des introductions
  attendent n'ouvre pas de grappe nouvelle (`SansNouveautes` :
  `'introductions'`), sinon le reliquat grossit sans fin (§ 6.3).

### 6.2 Ordre : pays avant capitales et drapeaux

Sans ordre, un drapeau posé en Trouver avant que l'on sache où est le pays ne
donne qu'une suite d'Again. Avec un prérequis strict, un joueur qui connaît
déjà les pays attendrait environ 31 jours (une grappe de pays par jour, même
par « Je connais déjà ») avant ses capitales.

Défaut (D39) : une **préférence**. Apprendre Capitales (ou Drapeaux) prend
d'abord, dans sa série, la première grappe dont tous les pays ont leur fiche
`pays:X:localiser` introduite un jour d'avant. S'il n'y en a pas, il prend la
suivante et affiche un conseil : « Les pays de cette région ne sont pas
encore appris : Pays › Afrique › Apprendre ». Code :
- un prédicat optionnel `pret(g)` dans `grappeSuivante` et `programme` ;
- une raison `SansNouveautes` de plus (`'prerequis'`, `planif.ts:176`), qui
  ne sert qu'au prérequis strict, si D39 le choisit.

Rien de tel pour les mers.

### 6.3 Révision du jour

Le compte au pire du premier jour (estimé) : 4 à 5 domaines à une grappe
chacun, soit 25 à 40 entités nouvelles par jour. Le lendemain, autant de
fiches « Reconnaître », sans plafond. Une séance monterait à ≈ 130 questions
(12 à 15 min), contre ≈ 5 min visées (`planif.ts:11`, D5 du J1a).

**Régime établi** (simulation grossière, relancée pour cette correction :
`~/Sauvegardes/terramemo/j2-conception/relectures/produit-scripts/sim_charge.mjs`,
`node sim_charge.mjs <projet> pays:195,capitales:186,drapeaux:195,mers:50`).
Modèle : ts-fsrs du projet aux paramètres de `fsrs.ts` (rétention 0,9, sans
court terme ni flou), grappes de 7, rappel tiré selon la probabilité de FSRS,
plafond commun de 60 révisions, une grappe nouvelle par sujet et par jour
seulement si le sujet n'a plus de dû, introductions sans plafond. Résultats
(estimés : modèle simple, joueur assidu) :
- **pays seul** : tout est introduit au jour 28 ; les révisions montent à 30
  vers le jour 20, 36 au jour 30, puis redescendent (21 au jour 90) ;
- **quatre sujets ouverts chaque jour par Apprendre** : 28 introductions
  « Reconnaître » par jour dès le jour 2 ; le plafond de 60 révisions est
  atteint chaque jour du jour 10 au jour 40 ; tout est introduit aux jours 13
  (mers), 28 (pays), 37 (capitales) et 57 (drapeaux) ; puis 29 à 46
  révisions par jour jusqu'au jour 130.
Au rythme d'environ 6 s par question (estimé), le plafond de 60 révisions et
28 introductions font ≈ 9 min par jour pendant un mois, au-delà des ≈ 5 min
de D5.

Trois conséquences :
- avec un plafond d'introductions de 15, commun, le reliquat grossit
  d'environ 13 fiches par jour tant que quatre sujets avancent : d'où la
  règle « un sujet dont des introductions attendent n'ouvre pas de grappe
  nouvelle » (§ 6.1) ;
- le plafond commun de 60 révisions ralentit déjà tous les sujets dans
  l'option b de D46 ; l'argument contre l'option c (« chaque sujet n'avance
  qu'un jour sur quatre ») est donc moins net qu'il n'y paraît ;
- `REVISIONS_PAR_JOUR`, `REVISIONS_PAR_SEANCE` et `GRAPPES_PAR_JOUR` sont des
  défauts en attente du verdict de #2 (`planif.ts:4, 11-14`, semaine d'usage
  jusqu'au 13/11). Le plafond d'introductions et D46 se tranchent **après**
  ce verdict (§ 10). Le script est à reprendre dans l'outil du lot 0c, sur 90
  jours, avec les plafonds retenus.

Défaut (D46) : le **modèle des communes**, déjà codé (`vues/seance.ts:133-135`),
étendu aux nouveaux sujets :

1. **monde** : les révisions dues des domaines **jouables** du monde (pays,
   et capitales, drapeaux, mers une fois livrés : `DOMAINES_JOUABLES`,
   § 3.1), les plus anciennes d'abord, mêlées, dans le plafond commun ; puis
   leurs fiches « Reconnaître » à introduire, dans le plafond de D46.
   `dues` et `introductions` savent déjà se passer du domaine
   (`planif.ts:39, 156`) : on les filtre par les domaines jouables du
   terrain ;
2. **monde** : une séance par grappe entamée ce jour par Apprendre dans un
   autre sujet (capitales, drapeaux, mers), qui la finit. `Seance` ne forme
   les nouveautés que d'un domaine (`PlanSeance.domaine`, `srs/seance.ts:54`) :
   d'où un bloc par grappe ;
3. **île** : comme aujourd'hui ;
4. **monde** : la grappe de pays nouvelle, s'il ne reste aucune révision.

Les grappes nouvelles des capitales, des drapeaux et des mers s'ouvrent par
Apprendre, dans leur sujet : une par jour chacune, au choix du joueur.
Apprendre dans un sujet fait d'abord les révisions dues de ce sujet, puis sa
grappe, comme aujourd'hui.

Ce qu'il faut à la séance :
- `InfoDomaine` par domaine, avec `charger()` : l'île, la couche marine, les
  capitales, les drapeaux (préchargés pour les questions de la séance). Cela
  généralise `besoinIle` ;
- `Etape.domaine` (`srs/seance.ts:37-50`) et `QuestionPilotee.domaine`
  (`essai.ts:67-77`) : la vue pose la question selon son sujet ;
- les textes de refus par sujet (`tout_appris_<sujet>`, `grappe_entamee`,
  conseil de § 6.2) et les libellés du bilan : « Porto-Novo (Bénin) »,
  « Bénin : capitale oubliée », « Bénin : drapeau oublié », « mer Égée, à
  300 km ».

### 6.4 Carte de la mémoire

Un pays porte désormais trois sujets (pays, capitale, drapeau), et une mer en
porte un quatrième. Défaut (D47) :
- **un choix du sujet** dans la légende : Pays, Capitales, Drapeaux, Mers (et
  Communes sur l'île). Il est gardé sur l'appareil (`localStorage`, comme le
  réglage de la carte de la mémoire, `carte-memoire.ts:21`), Pays par défaut,
  et caché tant qu'un terrain n'a qu'un sujet. `teintes` et `maitrises`
  prennent le domaine ; « n/50 maîtrisées » suit le sujet ;
- avec « Mers », la base trace le calque marin teinté (la couche se charge
  au choix) ; les pays restent neutres ;
- **le détail par sujet** au toucher d'un pays : « Pays : vu 4 fois · revient
  dans 5 j · Capitale : jamais vue · Drapeau : revient demain »
  (`memoireEntite` par domaine) ;
- le texte `memoire.reglage_detail` est à revoir.

### 6.5 Le sujet de bout en bout

C'est le piège principal du J2. Aujourd'hui, le domaine d'une réponse est tiré
du terrain (§ 1). Les capitales et les drapeaux sont sur le terrain monde : un
Trouver de capitale s'écrirait `pays:FRA:localiser`. L'événement resterait
valide, et la mémoire des pays serait faussée **sans aucune erreur visible**.

À changer (lot 0a), puis à tester :
- `libre(l, t)` (`vues/seance.ts:290`) prend `l.sujet` ; sans `Lancement`
  (Essai J0 de ⚙), le domaine du terrain ;
- `DemandeSeance` d'Apprendre reçoit le sujet (`essai.ts:95, 611`) ;
- `comptes()` liste les domaines **jouables** (`vues/seance.ts:164`), pas
  tous ceux de `DOMAINES` ;
- `domaineDe(t)` (`carte-memoire.ts:42`) devient le domaine choisi, parmi
  les jouables.

Tests qui ferment le piège : une partie de Trouver lancée sous Capitales
n'écrit que des fiches `capitales:…`, jamais `pays:…` ; avec des fiches
`mers:` au journal d'une version sans le sujet Mers, ni compte, ni question,
ni teinte ; `comptes()` du lot 0a inchangé avec des fiches `capitales:` au
journal.

Pour Q3 (outil `pastilles.py`) : compter ensemble les Trouver de pays, de
capitales et de drapeaux, qui touchent le même pays avec le même disque, sans
les mers (lot 5, S). La mesure du 13/11 est faite avant, sur les pays seuls.

## 7. Jouer

### 7.1 Racine à trois tuiles

- « Quiz général » en tête, pleine largeur (`jouer-large`, `data-racine="quiz"`),
  puis Entraînement et Classé (`data-branche`, inchangés : le pilote les
  compte, `driver.py:1359`).
- Le quiz n'est **pas** une `Branche` : `Branche` type `DefSujet.modes` et
  nourrit `sujets(b)` et la Révision du jour ; un quiz n'a ni sujets ni
  séries. On ajoute un niveau `{type: 'quiz'}` :
  - adresse `#jouer/quiz` ; `choix(racine) = ['quiz', ...BRANCHES]` ;
    `choix(quiz) = DIFFICULTES` ;
  - `parent(quiz)` = la racine ; `fil(quiz)` = « Quiz général » ;
  - un segment de trop retombe sur le niveau valide le plus proche (règle
    actuelle de `resoudre`, `arbre.ts:173-184`).
- `Lancement` devient une union : la forme actuelle, ou `{quiz: Difficulte}`.
  `valide`, `lireDerniere` (`arbre.ts:242-253`), `garderDerniere`,
  `marquerChemin` et `niveauDe` suivent. Une ancienne valeur gardée reste
  lisible.
- L'écran des difficultés : 4 lignes `data-difficulte` (Facile, Moyen,
  Difficile, Expert), chacune avec une phrase courte et son record ; « ? »
  donne les règles du quiz.
- `main.ts` : une vue `quiz` (`VUES`), ouverte par `nav.ouvrirPartie('quiz')`
  dans `lancer()` (`main.ts:652-658`). `navigation.ts` n'a rien à changer ;
  le retour d'Android non plus (`#jouer/quiz` est une entrée d'historique).

### 7.2 Sujets, séries, vignettes

- Sujets, dans l'ordre : Pays, Capitales, Drapeaux, Océans et mers, Communes
  (défaut de D53 b : Communes passe de la 2e à la 5e place). `SUJETS` gagne
  trois entrées, avec `AVEC_APPRENDRE` (`arbre.ts:53`).
- Séries : choisies **par sujet**, pas par terrain. `duTerrain('monde')`
  mettrait la série des mers sous Pays, Capitales et Drapeaux.
  - Capitales et Drapeaux : les séries des pays. Pour les capitales, sans les
    9 pays exclus par D37 a : Afrique 53, Amérique du Nord 21, Amérique du Sud
    12, Asie 46, Europe 40, Océanie 14, tous 186 (mesuré sur `pays.json`) ;
  - Océans et mers : une série, `mers`, de 50 (D44). Le niveau des séries est
    alors sauté (`saute`), comme pour Communes.
- Comptes d'une série par sujet, en Afrique : « 53 capitales » (D37 a ; 54
  en b et c), « 54 drapeaux » ; et « 50 océans et mers ».
- Exercices : Entraînement = Apprendre, Trouver, Reconnaître ; Classé =
  Chrono, Sans faute, Minute. Leur phrase devient `jouer.exercices.<sujet>.<mode>`,
  avec repli sur la phrase générique (`detailExercice`, `jouer.ts:52`, ne
  connaît que `apprendre_communes`).
- Vignettes (D53) :
  - Capitales : le monde et ses capitales en points, tiré de
    `capitales.json` ;
  - Drapeaux : une icône (`ICONES`, `vignettes.ts:251`) ;
  - Océans et mers : le monde aux mers éclairées sur des terres sombres,
    rangé dans le code comme l'île (`vignette-mers.ts`, ≈ 5 Ko, estimé),
    pour ne rien charger à l'ouverture de Jouer ;
  - Quiz général : une icône ;
  - les séries des capitales et des drapeaux reprennent les vignettes des
    régions, sous une clé qui comprend le sujet.
- Pilote : `ui_jouer` (`driver.py:1355-1370`) attend trois tuiles et cinq
  sujets ; captures `15-*` à refaire.

### 7.3 Recherche

- **Capitales** : une ligne par capitale juste (210), avec `detail` « capitale
  de la Bolivie », ou « siège du gouvernement (Bolivie) ». Choisir une ligne
  montre le pays, et un anneau au point de la ville si D53 le retient.
  Jérusalem et Jérusalem-Est font deux lignes. Les alias sont cherchés
  (Kyiv, Beijing). `LieuTrouve` gagne un `point?` facultatif.
- **Mers** : une ligne par zone, avec `detail` « océan », « mer », « golfe »,
  « baie » ou « bras de mer ». Choisir une ligne cadre l'emprise et allume la
  mer.
- Les données se chargent à la première frappe, comme les noms des communes
  (`recherche.ts:4-6`). La recherche reste cachée pendant une partie.

## 8. Classements

### 8.1 Épreuves et général

| Sujet | Séries | Épreuves classées |
|---|---|---|
| Pays | tous + 6 continents | 21 (inchangées) |
| Communes | reunion | 3 (inchangées) |
| Capitales | tous + 6 continents | 21 |
| Drapeaux | tous + 6 continents | 21 |
| Océans et mers | mers | 3 |
| Quiz général | 4 difficultés | 4 |

En tout, 73 classements d'épreuve, plus le général. Un général qui compte les
Chrono de tous les sujets (défaut de D40) additionne 23 épreuves. Sa borne
devient 390 (pays) + 24 (île) + 372 (capitales, D37) + 390 (drapeaux) + 50
(mers) = **1 226 questions** (1 244 avec D37 b ou c ; 414 si D40 dit
non). Une constante du client, et un test qui la compare à la somme des
tailles.

Le classement de la semaine repart le lundi. On met en ligne les épreuves
d'un nouveau sujet un lundi, comme pour les zones contestées (D13 du J1a) :
le général de la semaine ne change pas en cours de route.

### 8.2 Règles Firestore

```
function tailles(cle) {
  return cle == 'capitales'
      ? {'Africa': 53, 'Asia': 46, 'Europe': 40, 'North America': 21,
         'Oceania': 14, 'South America': 12, 'tous': 186}
    : cle == 'mers' ? {'mers': 50}
    : cle == 'drapeaux'
      ? {'Africa': 54, 'Asia': 48, 'Europe': 44, 'North America': 23,
         'Oceania': 14, 'South America': 12, 'tous': 195}
    : {'Africa': 54, 'Asia': 48, 'Europe': 44, 'North America': 23,   // 'localiser'
       'Oceania': 14, 'South America': 12, 'tous': 195, 'reunion': 24};
}
function epreuveConnue(p) {
  return p.size() == 3 && (
    (p[0] in ['chrono', 'sansfaute', 'minute']
      && p[1] in ['localiser', 'capitales', 'drapeaux', 'mers']
      && p[2] in tailles(p[1]))
    || (p[0] == 'quiz' && p[1] == 'general'
      && p[2] in ['facile', 'moyen', 'difficile', 'expert']));
}
function quizValide(d) {
  return d.questions == 20
    && d.points >= d.justes * 1000
    && d.points <= d.justes * 1000 + (d.questions - d.justes) * 500
    && d.temps_ms >= 20 * 200 && d.temps_ms <= 20 * 15000;
}
```

- La carte des capitales vaut pour D37 a ; avec b ou c, les capitales
  prennent celle des drapeaux. La dernière carte est celle d'aujourd'hui
  (`firestore.rules:19-30`) ; les drapeaux n'ont pas `reunion`. Chaque carte s'écrit en entier, sans
  fusion : c'est plus simple à relire.
- `scoreValide` lit `tailles(p[1])[p[2]]` et prend la branche
  `quizValide` pour `p[0] == 'quiz'`. Le général : `d.questions <= 1226`.
- `vraisemblable` (client) recopie ces bornes, cas `quiz` et borne du
  général compris. `regles.test.ts` confronte déjà `vraisemblable` aux règles
  pour le Chrono, Sans faute et Minute (`:176`, `:244`) ; la même
  confrontation s'étend au quiz (lot 4b) et au général à 1 226 (lot de la
  première épreuve ouverte).
- Les règles partent **avant** l'appli (`npx firebase deploy --only
  firestore`, skill `run-terramemo`, « Déploiement »). Sinon chaque
  publication des nouvelles épreuves est refusée et part en file d'attente.
- Tests (`tests/regles.test.ts`, émulateur) : nouveaux sujets acceptés ;
  `chrono:capitales:reunion` et `chrono:localiser:mers` refusés ; tailles de
  chaque sujet ; quiz (20 questions, bornes) ; général à 1 226 ; les
  confrontations de `vraisemblable` ci-dessus.

### 8.3 Lectures du 🏆 et profil

Coût, d'après le code (`epreuve/classement.ts:63-75, 120-142`) :

| | Aujourd'hui | Après le J2 |
|---|---|---|
| Ouverture du 🏆 (`mesPlaces`) | 25 lectures + 3 par place | 74 + 3 par place |
| Publication du général (`placesDuPseudo`, 2 périodes) | 16 | 46 |
| Bilan d'une partie (`lireTableau`) | 11 à 14 | inchangé |

Avec 74 lectures par ouverture, l'offre Spark (50 000 lectures par jour) tient
environ 675 ouvertures par jour, places non comptées. Ce n'est pas bloquant
aujourd'hui, mais chaque sujet futur ajoutera 21 lectures. Remède (D52) :
`mesPlaces` ne lit que les épreuves où l'appareil ou le profil du compte a un
record, plus les places déjà vues (liste gardée) ; « Toutes les épreuves »
lit le reste à la demande, sujet par sujet. Défaut : tout lire, comme
aujourd'hui.

« Toutes les épreuves » se range par mode, puis par sujet (`h4`), avec un
groupe « Quiz général » ; sinon on aurait 23 lignes d'affilée par mode
(`general.ts:64-69, 107`).

Profil : § 3.4.

## 9. Quiz général

### 9.1 Un réservoir qui grandit

Chaque sujet déclare un **générateur**. Le quiz n'en connaît aucun en
particulier :

```ts
type Forme = 'qcm' | 'toucher';
type Difficulte = 'facile' | 'moyen' | 'difficile' | 'expert';

interface Question {
  sujet: string;             // 'pays' | 'capitales' | 'drapeaux' | 'mers' | …
  forme: Forme;
  cible: string;             // id du pays ou de la mer
  entite: string;            // l'entité, pour les doublons (le pays d'une capitale)
  indice?: string;           // la capitale montrée (Qid)
  choix?: string[];          // QCM : 4 ids, cible comprise
  delai_ms: number;
  echelle_km: number;
}

interface Generateur {
  sujet: string;
  pret(): boolean;                                   // données chargées
  charger(): Promise<void>;
  lieux(niveauMax: 1 | 2 | 3): readonly string[];    // notoriété (notoriete.json)
  formes: readonly Forme[];
  question(id: string, forme: Forme, d: Difficulte, hasard: () => number): Question;
}
```

- `src/quiz/` est pur (ni DOM ni carte), testé avec une graine.
- Un sujet de plus = un générateur de plus, son rendu dans `sujets.ts` et ses
  niveaux dans `notoriete.json`. Le quiz grandit sans qu'on touche à son
  cœur. C'est ce que demande l'utilisateur.
- Au J2 : pays, capitales, drapeaux, mers. Un sujet pas encore livré n'a pas
  de générateur : le quiz sort avec ceux qui sont prêts.

### 9.2 Tirage par difficulté

La décision fixe le sens de chaque difficulté (lieux et forme). Le reste est
le défaut de D49 :

| | Facile | Moyen | Difficile | Expert |
|---|---|---|---|---|
| Lieux | niveau 1 | niveaux 1 et 2 | tous | tous |
| QCM + toucher (sur 20) | 20 + 0 | 10 + 10 | 8 + 12 | 8 + 12 |
| Énoncé du QCM (capitales, drapeaux) | nomme le pays, zone allumée en aide (D49 d) | zone allumée seule | idem | idem |
| Leurres (pays, capitales, mers) | 3 lieux connus (niveau 1), du même continent (D49 d) | 1 voisin, 2 du niveau | voisins | voisins |
| Leurres (drapeaux) | 3 éloignés (score > 0,5) | 1 sosie, 2 éloignés | 3 sosies | 3 sosies |
| Délai QCM / toucher | 10 s / — | 10 s / 15 s | 10 s / 15 s | 6 s / 10 s |
| Capitale montrée (à toucher) | — (pas de toucher) | la plus connue | au hasard parmi les justes | idem |
| Bouton juste d'un QCM de capitale | la principale | la principale | la principale | la principale |

Tirage :
1. les sujets prêts se partagent les 20 questions à parts égales (5 chacun à
   4 sujets ; à 3, 7, 7 et 6), le reste au hasard ;
2. les formes de la difficulté sont mélangées et réparties sur les
   questions ;
3. pour chaque question, un lieu au hasard parmi ceux du sujet et du niveau ;
   jamais deux fois la même entité, tous sujets confondus (« Bolivie » puis
   « La Paz » se répondraient) ;
4. l'ordre final est mélangé.

Pourquoi des formes fixes : un QCM pris au hasard rapporte 250 points en
moyenne, un toucher au hasard presque rien. Si les formes étaient tirées, la
chance du tirage pèserait plus que le joueur. Pourquoi des parts égales : au
prorata, les 50 mers disparaîtraient sous 195 pays × 3.

Le niveau 1 compte assez de lieux pour 5 questions par sujet (pays 25 à 40,
capitales 30, mers 12, mesuré).

**Leurres éloignés des drapeaux** (décision « Leurres de drapeaux au quiz »,
12/11) : au facile et au moyen, un leurre éloigné n'a aucune paire de score
≤ 0,5 avec le juste. Le manifeste ne garde que 3 sosies par pays : les 917
paires ≤ 0,5 vont dans les données du quiz (≈ 10 Ko brut), chargées avec le
quiz seul (lot 4a).

**Le facile n'est pas forcément facile, et il sature** (relecture) :
- toutes ses questions sont des QCM « zone allumée » (§ 5.2, § 5.3) : pour
  une capitale ou un drapeau, il faut d'abord reconnaître le pays à sa forme,
  puis savoir sa capitale ou son drapeau. Deux savoirs pour une question
  « facile » (l'Albanie et la Finlande sont au niveau 1 par les Wikipédias) ;
- des leurres « lointains, niveau 1 » réduisent la question à « quelle
  région ? » (Japon allumé : Tokyo, Paris, Londres, Rome). Beaucoup feront
  20/20 (estimé), et le classement facile se jouerait au temps de réaction.
La décision ne fixe que « lieux très connus, choix parmi 4 ». Variante
proposée en D49 (option d) : au facile, l'énoncé **nomme le pays** (« Quelle
est la capitale du Japon ? », « Quel est le drapeau du Brésil ? »), la zone
allumée n'est qu'une aide ; les leurres restent de niveau 1 mais viennent du
même continent. La part de parties à 20/20 se mesure au pilote et à l'essai
(S39).

### 9.3 Une partie

- **Barème** : QCM, 1 000 si juste, 0 sinon ; toucher, celui du Chrono
  (1 000 ; 500 × e^(−d/300 km) ; 0 hors délai). `pointsQuestion` le fait déjà
  (`bareme.ts:40-45`), avec `distance_km: null` pour un QCM. Pas de bonus de
  vitesse : le temps total départage, comme au Chrono. 20 000 points au plus.
- **`PartieQuiz`** (`src/epreuve/quiz.ts`, pur) étend `PartieChrono`
  (`chrono.ts:31-88`). `pointsDe` prend le délai et l'échelle de chaque
  question. `score()` est surchargé : chaque temps est borné par le délai de
  sa question, et une question sans réponse compte tout son délai.
  `repondreChoix(choisi, temps)` sert le QCM. `idQuiz(d) =
  'quiz:general:' + d`.
- **Préparation** : tirage, puis chargement de tout ce qu'il faut (couche
  marine, capitales, les drapeaux des 20 questions, notoriété) avant le
  premier délai. En cas d'échec (hors ligne sur le site), un message et pas
  de partie. Dans l'APK, tout est local.
- **Images** (décision « Images d'une épreuve », 12/11) : comme une épreuve
  des drapeaux (lot 2b, `vues/chrono.ts`), le quiz attend au départ que
  toutes ses images (drapeaux des énoncés et des choix) soient chargées et
  décodées. « Chargement des drapeaux… n / N » au-delà de 150 ms ;
  « Réessayer » si l'une échoue, qui ne redemande que les échouées ; aucun
  délai maximal. La partie ne commence (et ne compte, D55 a) qu'à sa
  première question montrée. L'attente de 3 s par question reste en filet.
- **La vue** `src/vues/quiz.ts` (350 à 450 lignes, estimé ; `vues/chrono.ts`
  en fait 411) :
  - une barre avec la consigne (`sujets.ts`), le compte « 7 / 20 », la jauge
    (sortie de `vues/chrono.ts:125-148` dans un module commun), la grille
    2 × 2 (cachée pour un toucher), la rétroaction et « Abandonner » ;
  - QCM : la zone s'allume (`allumerZone`, `nommer.ts:90`), et un toucher de
    la carte est ignoré ;
  - toucher : la vue du monde est remise avant la question. Sinon la vue
    laissée par un QCM montre la réponse ;
  - après chaque réponse : juste ou faux, la bonne réponse en vert, environ
    1,2 s, puis la suivante (comme au Chrono).
- **Bilan** : points, justes sur 20, temps ; le détail par sujet (« Capitales
  4/5 ») ; les ratés avec la bonne réponse ; le record de la difficulté (de
  toujours, de la semaine) ; son classement (`blocClassement`,
  `publierPartie`, `vues/classement.ts:247`). Boutons « Rejouer » (nouveau
  tirage, même difficulté), « Autre difficulté » (`versJouer('jouer/quiz')`),
  « Carte », et la « × ».
- **Durée** (estimée : 20 questions × délai au pire, + 1,2 s de
  rétroaction) : ≈ 1,5 à 2 min en facile, 2,5 à 4 min en moyen et au-delà,
  moins en expert.
- **Fin** : D55. La règle du Chrono (« Fin d'une partie du Chrono » : toutes
  les réponses données, la partie compte, même quittée pendant la pause
  finale ; abandonnée avant, elle ne compte pas) ne tient pas ici. Au Chrono,
  la série est fixe et seul l'ordre change ; au quiz, « Rejouer » refait un
  tirage et le classement de toujours garde le meilleur score (§ 9.4). Un
  joueur abandonnerait donc dès qu'une question difficile tombe (Tuvalu à
  toucher, mer de Sibérie orientale) et relancerait jusqu'à un tirage
  facile : le hasard que D49 veut neutraliser deviendrait exploitable.
  Défaut (D55 a) : une partie de quiz **compte dès que sa première question
  est montrée** ; un abandon publie le score acquis, les questions sans
  réponse valent 0 et comptent tout leur délai. Test : un abandon après la
  première question écrit un record.

### 9.4 Classement et règles

- Un classement par difficulté, de toujours et de la semaine :
  `quiz:general:facile` à `quiz:general:expert`.
- **Hors du général** : `modeEpreuve('quiz:…') === 'quiz'`, et le général ne
  lit que `EPREUVES` (§ 3.2). Ces deux points partent au lot 0a, avant tout
  record de quiz.
- Règles : `quizValide` (§ 8.2). Elles ne peuvent pas vérifier que les
  questions viennent de la bonne difficulté : sans serveur, comme pour le
  Chrono, on ne vérifie que la vraisemblance.
- Records : la même clé que les épreuves, donc synchronisés par le profil.

### 9.5 Quand le réservoir grandit

- L'id d'un classement reste **stable** quand un sujet s'ajoute. Le
  classement de la semaine reste juste (il repart chaque lundi) ; celui de
  toujours mêle des parties d'avant et d'après.
- Un nouveau générateur se met en ligne **un lundi**.
- **Ouverture du classement** (D50 c, défaut) : les règles et la publication
  du quiz n'ouvrent qu'une fois livrés les quatre sujets du J2. Sinon, un lot
  4b sorti avec pays et capitales seuls fixerait le record de toujours
  pendant la période la plus facile (pays à 50 % des questions, puis 25 %
  avec les mers, peu connues), hors d'atteinte pendant tout le J2. Avant, le
  quiz se joue sans classement (bilan et record sur l'appareil seulement).
  L'id stable vaut pour les ajouts d'après le J2 (J5…), qui ne sont pas
  connus d'avance.
- L'id ne change que si la **formule** change : nombre de questions, barème,
  formes ou délais. Il devient alors `quiz:general2:<difficulté>` (règles
  comprises), et l'ancien classement reste lisible.
- Changer d'id à chaque sujet effacerait le classement de toujours à chaque
  ajout : écarté (D50).

### 9.6 Hors du quiz au J2

- **Communes de La Réunion** : pas au J2 (D51). Changer de terrain en cours de
  partie coûte peu à la machine (l'île : 44 Ko chargés une fois, puis une
  classe CSS), mais trois choses coûtent ailleurs. Hors ligne sans l'île, on
  ne peut pas poser la question. Le saut monde → île → monde désoriente au
  chrono. Et l'échelle de 5 km des communes n'est pas celle du monde. Plus
  tard : en difficile et expert, l'île préchargée au choix de la difficulté.
- **Mémoire** : les réponses du quiz n'entrent pas au journal, comme celles
  des épreuves classées (`vues/chrono.ts` n'écrit rien). Si D51 change cela,
  ce serait en mode `libre` (hors FSRS), sans mode nouveau.
- **Notoriété par les réponses de tous les joueurs** (décision, « plus
  tard ») : il faudrait réunir des réponses en ligne, ce qui reste à
  concevoir (écritures, vie privée). Pas au J2.

## 10. Avant le J2 : ce qu'il faut d'abord

L'utilisateur l'a pressenti : il faut un socle avant le premier sujet.

1. **Le socle sans effet visible** (lots 0a, 0b, 0c) :
   - le sujet de bout en bout (§ 6.5) ;
   - les ids d'épreuve avec le sujet, et le général durci (§ 3.2) ;
   - les domaines dans `DOMAINES`, avant que rien ne les écrive (§ 3.3), et
     `DOMAINES_JOUABLES`, pour qu'une version ne pose que les sujets qu'elle
     sait poser (§ 3.1) ;
   - le rendu par sujet (§ 5.1) ;
   - la mémoire à plusieurs sujets (§ 6.3, 6.4).
2. **`/` sans cache** (lot 0a). Mesuré par curl le 10/11 : `/` répond
   `cache-control: max-age=3600`, alors que `/index.html` est en `no-cache`.
   La règle `**/*.@(html|json)` ne s'applique pas à `/`. Jusqu'à une heure
   après un déploiement, un navigateur peut garder l'ancien `index.html`, et
   demander un morceau de JS chargé plus tard qui n'existe plus (404 :
   déduit, pas observé). Le J2 ajoute de tels chargements à la demande (vue
   du quiz, drapeaux nommés par leur empreinte). Correction : une règle
   `{"source": "/", … "no-cache"}` dans `firebase.json`. C'est indépendant du
   J2 : à faire tout de suite si la session principale le veut.
3. **La palette de #28** avant les couleurs de la couche marine (lot 3a).
4. **L'APK du lot 7 du J1b** bâti après le lot 0a : il lira déjà les
   domaines du J2, sans les poser. Ensuite, un APK rebâti à chaque ouverture
   des épreuves classées d'un sujet (recommandé, § 3.2).
5. **Le verdict de #2** (semaine d'usage, jusqu'au 13/11) sur les plafonds
   D5 (`REVISIONS_PAR_JOUR`, `REVISIONS_PAR_SEANCE`, `GRAPPES_PAR_JOUR`,
   `planif.ts:4, 11-14`) avant de trancher D46 et le plafond
   d'introductions : la charge à quatre sujets en dépend (§ 6.3).
6. **La semaine d'usage du J1a** (jusqu'au 13/11) : on ne touche pas l'APK de
   l'A37 avant. Les lots du J2 se déploient sur le site seulement. Avant
   chaque APK, `sauver_journal`.
7. **Les décisions** : D36 à D40 avant les épreuves classées des capitales,
   D41 avant le lot 2, D42 à D45 avant le lot 3, D46 après le verdict de #2
   (avant le lot 0c, ou 0c livré avec son défaut réversible), D48, D49 et
   D51 avant le lot 4a, D50 et D55 avant le lot 4b. Entre-temps, un sujet
   peut sortir en Entraînement : ses épreuves classées attendent d'entrer
   dans `EPREUVES_SUJETS` (`epreuve/chrono.ts`), dès leur livraison et sans
   date (décision « Ouverture des épreuves d'un sujet » du 12/11, qui a
   retiré la bascule datée `EPREUVES_OUVERTES` des lots 1 et 2).

## 11. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et `npm run build`
au vert, puis par un commit « … (#4) », « … (#27) » ou « … (#26) ». Si les
règles changent : `npm run test:regles` (émulateur), puis leur déploiement
d'abord. Ensuite, le déploiement Hosting (`npm run build && npx firebase
deploy --only hosting`, sur un arbre propre), puis `driver.py smoke --url
https://terramemo-geo.web.app/` et le pilote du lot sur le site en ligne. L'UI
suit le skill `nouveau-projet`, relu avant les lots 0b, 1, 2, 3b et 4b. Sur
l'A37 : de jour, après le 13/11, après `sauver_journal`.

| Lot | Taille | Dépend de | Attend | Critère de fin |
|---|---|---|---|---|
| 0a. Socle | S-M | — | — | rien de visible ; tests ; `/` en `no-cache` |
| 0b. Rendu par sujet | M | 0a | — | captures du pilote inchangées |
| 0c. Mémoire à plusieurs sujets | M | 0a, 0b | défauts D39, D46 (après #2), D47 | tests ; rien de visible tant qu'un terrain n'a qu'un sujet jouable |
| 1. Capitales | M-L | 0c | D36, D38 ; épreuves : D37, D38, D40 | sujet complet au doigt sur le site ; données testées |
| 2. Drapeaux | M-L | 0c | D41 ; épreuves : D40 | idem |
| 3a. Mers : données et carte | L | 0a, #28 | D42, D43 | une mer touchée et allumée juste dans les trois rendus ; sans saccade sur l'A37 |
| 3b. Mers : exercices et mémoire | M | 3a, 0c | D44, D45 ; épreuves : D40, D42 | sujet complet au doigt sur le site |
| 4a. Quiz : données et tirage | M | 0a, 1 (`qcm.choix` et ses options) ; chaque générateur avec son sujet | D48, D49, D51 | tirage testé pour les sujets livrés |
| 4b. Quiz : partie et classement | M-L | 4a et au moins un sujet de plus ; classement : les 4 sujets du J2 (D50 c) | D50, D55 | les 4 difficultés jouables ; classements en ligne une fois les 4 sujets livrés |
| 5. Fin du J2 | M | tous | D52 | critères de #4, #27, #26 (APK compris) |
| 6. Reste du #4 | — | — | D54 | conçu à part |

« En sautant ce qui n'est pas prêt » : les lots 1, 2 et 3 ne dépendent que du
socle. Un sujet bloqué n'arrête pas le suivant, et le quiz (lot 4) sort avec
les sujets déjà livrés ; son classement attend les quatre (D50 c). Chaque
générateur du quiz, sa part de `notoriete.json` et ses tests arrivent avec
leur sujet (lot 1, 2 ou 3b) si 4a est déjà livré, sinon 4a les ajoute un par
un : un test du quiz ne cite qu'un sujet livré.

### Lot 0a. Socle

- **Contenu** :
  - `Domaine` et `DOMAINES` gagnent `capitales`, `drapeaux`, `mers` ;
    `DOMAINES_JOUABLES = ['pays', 'communes']` (§ 3.1) ;
  - `libre(l, t)` prend `l.sujet` ; `DemandeSeance` d'Apprendre prend le
    sujet ; `comptes()` et `domaineDe` suivent ; `Etape.domaine`,
    `QuestionPilotee.domaine` ;
  - `idEpreuve(serie, mode, sujet)` et `CLE_SUJET` ; `recordDe` et
    `nomEpreuve` avec le sujet ;
  - `ModeClasse`, `modeEpreuve` qui connaît `quiz` et rend `null` pour un
    préfixe inconnu, et tous ses appelants (§ 3.2) ; `totalGeneral` limité à
    `EPREUVES` ; `vraisemblable` qui refuse un mode inconnu ; `publierTout`
    qui ignore les records de mode `null` ;
  - `firebase.json` : `/` en `no-cache`.
- **Fichiers** : `src/srs/fiches.ts`, `src/srs/seance.ts`,
  `src/vues/seance.ts`, `src/vues/essai.ts`, `src/vues/carte-memoire.ts`,
  `src/epreuve/chrono.ts`, `src/epreuve/classement.ts`,
  `src/vues/classement.ts`, `src/vues/jouer.ts`, `src/vues/general.ts`,
  `src/vues/scores.ts`, `firebase.json`.
- **Tests** :
  - `srs-jour.test.ts:51` : les trois domaines acceptés, `villes` toujours
    refusé ; `srs-pur` : `former`, `analyser`, `soeur` ;
  - `srs-seance` : `Etape.domaine` ;
  - `seance-vue` : une partie lancée sous `capitales` écrit `capitales:` et
    jamais `pays:` ; `comptes()` inchangé avec des fiches `capitales:` au
    journal ; des fiches `mers:` au journal ne donnent ni compte, ni
    question, ni teinte ;
  - `chrono.test` : ids avec sujet ; `modeEpreuve('quiz:general:facile')`,
    `modeEpreuve('xyz:…') === null` ; `totalGeneral` ignore
    `chrono:capitales:tous` (hors liste) et `quiz:…` ;
  - `classement-publier` : `publierTout` n'envoie pas un record de mode
    `null`, et n'annonce aucun refus ;
  - `sync-lots` : la carte la pire (`capitales`, id de mer de 8 lettres)
    sous 160 ;
  - `sync-lecture` : un vrai `deplier` d'avant (pays et communes seuls) sur
    un lot mixte : illisible, puis relu.
- **Vérification** : `smoke` et `ui` sur le site en ligne ; `curl -sI
  https://terramemo-geo.web.app/` répond `cache-control: no-cache`.
- **Fin** : rien de visible ne change, tout est au vert, curl le confirme. À
  livrer avant de bâtir l'APK du lot 7 du J1b.

### Lot 0b. Rendu par sujet

- **Contenu** : `src/vues/sujets.ts` (§ 5.1) pour pays et communes ;
  `textes.sujets.*` ; les appels directs remplacés ; le compte d'une série
  par sujet.
- **Fichiers** : `src/vues/sujets.ts` (nouveau), `essai.ts`,
  `vues/chrono.ts`, `nommer.ts`, `retournee.ts`, `vues/seance.ts`,
  `jouer.ts`, `explorer.ts`, `commun.ts` (`texteAdmis`), `textes.fr.json`.
  Liste des appels : § 5.1.
- **Tests** : `nommer-vue`, `chrono-vue`, `essai-reprise`, `seance-vue` aux
  mêmes sorties pour pays et communes ; un sujet factice dans les tests de
  chaque vue (consigne, boutons, révélation, rétroaction « tu as touché »,
  bilans de Trouver, de Reconnaître, du Chrono et de séance) : aucun id brut
  affiché.
- **Vérification** : `ui` sur le site, captures comparées à celles d'avant
  (15-*, Reconnaître, Chrono, séance).
- **Fin** : rien de visible ne change ; un seul endroit par sujet pour ses
  textes et son rendu.

### Lot 0c. Mémoire à plusieurs sujets

- **Contenu** :
  - `INTRODUCTIONS_PAR_JOUR` et sa portée (D46, après le verdict de #2) ;
    règle du reliquat (§ 6.1) ; le prédicat `pret(g)` et le conseil de
    § 6.2 (D39) ;
  - Révision du jour en blocs par terrain, modèle des communes (§ 6.3) ;
    `InfoDomaine.charger()` ;
  - carte de la mémoire : choix du sujet parmi les jouables (caché tant
    qu'un terrain n'a qu'un sujet jouable), détail par sujet (D47) ;
  - textes de refus et de bilan par sujet.
- **Fichiers** : `src/srs/planif.ts`, `src/vues/seance.ts`,
  `src/vues/carte-memoire.ts`, `src/vues/explorer.ts`, `textes.fr.json`.
- **Tests** :
  - `srs-planif` : budgets indépendants par domaine ; plafond commun ;
    plafond d'introductions de D46 ; reliquat : un domaine dont des
    introductions attendent n'ouvre pas de grappe ; préférence `pret` ;
  - `seance-vue` : deux domaines du monde mêlés (fiches `capitales:` d'un
    journal factice) ; seule la grappe de pays s'ouvre ; une grappe de
    capitales entamée est reprise ;
  - `carte-memoire.test.ts` (nouveau) : teintes par domaine, choix caché à
    un seul sujet jouable.
- **Vérification** : `seance` (pilote `ui_seance`) inchangé sur le site.
- **Fin** : tests au vert ; pour pays et communes, rien ne change sauf le
  plafond d'introductions (aucun aujourd'hui) : un joueur absent quelques
  jours retrouve ses introductions étalées.

### Lot 1. Capitales

- **Contenu** :
  - données (§ 2.1) : `geodata/wikidata.mjs` (extrait figé daté),
    `geodata/capitales-main.json`, `geodata/capitales.mjs`, sorties,
    `sources.json` ;
  - chargement à la demande (`src/map/capitales.ts`) ; `avecSujet` au
    lancement des parties (§ 4.2) ;
  - sujet Capitales : `SUJETS`, `DOMAINES_JOUABLES`, séries selon D37,
    textes, vignette ;
  - rendu (§ 5.2) et leurres (§ 2.1) ;
  - `qcm.choix` et ses options `exclus` et stratégie de leurres (§ 5.1),
    que le quiz réutilise (lot 4a) ;
  - zones admises en plus par sujet (`OptionsNoter.acceptes`, § 2.2), pour
    Jérusalem si D36 i dit oui ;
  - épreuves : `EPREUVES_SUJETS`, `EPREUVES_OUVERTES`, règles, borne du
    général ; indice fixe en épreuve (D38). Elles ne s'ouvrent qu'avec D37,
    D38 et D40 tranchées, un lundi ;
  - mémoire : grappes, préférence, carte retournée, bilan ;
  - recherche des capitales ; anneau au point de la ville si D53 le
    retient ; crédits (Wikidata).
- **Fichiers** : `geodata/wikidata.mjs`, `geodata/wikidata/` (extrait,
  requêtes), `geodata/capitales-main.json`, `geodata/capitales.mjs`,
  `geodata/build.mjs` ; `public/geo/capitales.json`, `capitales.fr.json`,
  `sources.json` ; `src/map/capitales.ts` (nouveau) ; `src/map/pick.ts`,
  `acceptes.ts` ; `src/srs/fiches.ts` ; `src/vues/sujets.ts`, `commun.ts`,
  `jouer.ts`, `arbre.ts`, `cibles.ts`, `qcm.ts`, `recherche.ts`,
  `vues/seance.ts`, `vues/chrono.ts`, `essai.ts`, `vignettes.ts`,
  `textes.fr.json` ; `src/epreuve/chrono.ts` ; `firestore.rules` ;
  `driver.py` (`ui_capitales`, `smoke`).
- **Tests** : données (§ 2.1) ; `qcm` (exclusions, noms proches, stratégies
  de leurres) ; grappes de capitales : aucune vide ; `chrono`
  (`EPREUVES_OUVERTES`, deux parties du Chrono des capitales montrent les
  mêmes indices pour les 12 pays) ; `jouer` (sujets ; chargement puis
  lancement, échec puis message) ; `seance-vue` (Apprendre Capitales écrit
  `capitales:`) ; `recherche` ; `credits-vue` ; `regles` (et la
  confrontation de `vraisemblable` au général à 1 226 si D40 a).
- **Vérification** : règles d'abord ; Hosting ; `smoke` (les deux fichiers
  servis ; aucun `capitales*` chargé au premier affichage) ; `ui_jouer` à jour ; un nouveau `ui_capitales` (Trouver,
  Reconnaître, un Chrono d'Océanie joué en entier, Apprendre jusqu'au
  bilan, recherche « La Paz ») ; sur l'A37, Reconnaître lisible au doigt.
- **Fin** : Capitales jouable au doigt sur le site (6 exercices et la
  révision) ; données vérifiées par test en CI ; épreuves en ligne une fois
  D37, D38 et D40 tranchées ; APK rebâti à leur ouverture (§ 3.2).

### Lot 2. Drapeaux

- **Contenu** :
  - données (§ 2.2) : `geodata/drapeaux.mjs`, `geodata/drapeaux-main.json`,
    resvg-wasm en devDependency figée, sorties ;
  - `firebase.json` : `/geo/drapeaux/**` immuable ;
  - chargement à la demande et préchargement ; `avecSujet` (§ 4.2) ;
  - jumeaux : zones admises en plus pour le seul sujet Drapeaux, sorte
    `jumeau` (§ 2.2) ;
  - affichage (§ 5.3) : barre, grille d'images, fond, liseré, contour, ✓/✗,
    accessibilité ;
  - sujet Drapeaux : `SUJETS`, `DOMAINES_JOUABLES`, séries des pays,
    icône ; leurres voisins d'abord (§ 5.3) ;
  - épreuves (`EPREUVES_OUVERTES` ; règles : drapeaux sans `reunion`) ;
    mémoire ; crédits et licence, hors du dossier immuable (§ 2.5).
- **Fichiers** : `geodata/drapeaux.mjs`, `geodata/drapeaux-main.json`,
  `geodata/outils.mjs` (lecteur tar), `geodata/sources.lock.json`,
  `geodata/build.mjs`, `package.json` ; `public/geo/drapeaux/`,
  `public/geo/drapeaux.json`, `public/geo/licences/flag-icons.txt` ;
  `firebase.json` ; `src/map/drapeaux.ts` (nouveau : manifeste,
  préchargement) ; `src/map/pick.ts`, `acceptes.ts` ; `src/srs/fiches.ts` ;
  `src/vues/sujets.ts`, `commun.ts`, `jouer.ts`, `nommer.ts`,
  `retournee.ts`, `vues/chrono.ts`, `essai.ts`, `qcm.ts`, `arbre.ts`,
  `textes.fr.json` ; `src/carte.css` ; `src/epreuve/chrono.ts` ;
  `firestore.rules` ; `licences/tierces.ts` ; `driver.py` (`ui_drapeaux`,
  `smoke`).
- **Tests** : données (§ 2.2) ; `nommer-vue` (images, `aria-label` neutres,
  rien qui nomme le pays avant la réponse) ; `chrono-vue` (drapeau dans la
  barre, `alt` neutre) ; `credits-vue` (ligne flag-icons ; la section
  « Données » des licences) ; `regles` ; jumeaux : Monaco touché pour
  l'Indonésie juste sous Drapeaux, faux sous Pays ; `jouer` (chargement du
  manifeste puis lancement, échec puis message) ; `chrono`
  (`EPREUVES_OUVERTES`) ; `smoke` : aucun `drapeaux*` au premier
  affichage.
- **Vérification** : règles, Hosting ; `curl -sI` sur un drapeau
  (`immutable`) ; un nouveau `ui_drapeaux` (grille à 375 px, rien ne déborde,
  zone allumée visible au-dessus de la barre) ; sur l'A37, drapeaux lisibles,
  dehors compris (#28).
- **Fin** : Drapeaux jouable au doigt sur le site ; données vérifiées par
  test ; poids mesuré dans `dist`.

### Lot 3a. Océans et mers : données et carte

- **Contenu** :
  - données (§ 2.3) : `SOURCES` et verrou, `geodata/mers.json`,
    `geodata/mers.mjs`, `geodata/vignette-mers.mjs`, sorties ;
  - `DonneesCarte.mers`, chargement, index commun (§ 4.2) ;
  - dessin dans les trois rendus (§ 4.3), maillage et cache `'webgl-mers'` ;
  - `pickMer`, `noter` par couche, sorte `partie` des zones admises (§ 4.4) ;
  - cadrage par emprise (§ 4.5) ; crochet `?mers=demo` ;
  - mesures (§ 4.6), rapport dans `docs/mesures/j2/`.
- **Fichiers** : `geodata/build.mjs` (`SOURCES`), `geodata/sources.lock.json`,
  `geodata/mers.json`, `geodata/mers.mjs`, `geodata/vignette-mers.mjs` ;
  `public/geo/mers.topo.json`, `mers-leger.topo.json`, `mers.json`,
  `mers.fr.json`, `sources.json` ; `src/map/donnees.ts`, `types.ts`,
  `carte-canvas.ts`, `dessin.ts`, `carte-webgl.ts`, `maillage-mers.ts`
  (nouveau, et son worker), `relais-webgl.ts`, `carte.ts`, `pick.ts`,
  `acceptes.ts`, `geo.ts` ; `src/terrains.ts` ; `src/main.ts` ;
  `src/carte.css` ; `src/vues/vignette-mers.ts` (produit) ; `driver.py`
  (`smoke`). `donnees.ts` porte `DonneesCarte` : le changer recalcule une
  fois le maillage des terres chez chacun (§ 2.3), prix accepté.
- **Tests** :
  - données (§ 2.3) ;
  - `carte-canvas` : sommets du calque ; marques effacées sous les terres ;
    ordre mer, effacement, marques des pays (un pays marqué reste peint) ;
  - `carte-webgl` : aucun triangle retourné à 16 rotations, Austral et
    Caraïbes compris (écart d'earcut de 0,6 % mesuré sur les Caraïbes) ;
  - `carte-svg-dom` : couche, classes, contour sous les pays ;
  - toucher : la terre gagne ; la côte à 12 px ; une fente ; à 120° O,
    Austral et non Pacifique ; de part et d'autre de l'antiméridien ;
  - note : la table de § 4.4 ; un « toucher dessiné = noté » à plusieurs
    rotations ;
  - cadrage du Pacifique ;
  - `smoke` : aucun fichier `mers*` chargé au premier affichage.
- **Vérification** : mesures du § 4.6, sur le PC puis sur l'A37.
- **Fin** : une mer allumée et touchée juste dans les trois rendus, à toutes
  les rotations ; pas de saccade sur l'A37 (critère) ; toucher < 100 ms en
  médiane ; données vérifiées par test en CI.

### Lot 3b. Océans et mers : exercices et mémoire

- **Contenu** : sujet Océans et mers (`SUJETS`, `DOMAINES_JOUABLES`,
  série `mers`, textes, vignette) ; `avecSujet` (§ 4.2) ; rendu (§ 5.4) et
  leurres marins ; épreuves (`EPREUVES_SUJETS`, sans date ; règles : `mers` à 50) ; mémoire (`grappesMers`, carte de la mémoire « Mers ») ; nom de la
  mer au toucher à l'accueil (D45) ; recherche des mers.
- **Fichiers** : `src/vues/arbre.ts`, `cibles.ts`, `sujets.ts`, `qcm.ts`,
  `commun.ts`, `jouer.ts`, `vues/seance.ts`, `carte-memoire.ts`,
  `explorer.ts`, `recherche.ts`, `vignettes.ts`, `textes.fr.json` ;
  `src/srs/grappes.ts`, `fiches.ts` ;
  `src/epreuve/chrono.ts` ; `firestore.rules` ; `driver.py` (`ui_mers`).
- **Tests** : `jouer` (chargement de la couche puis lancement, échec puis
  message) ; `qcm` (ni ancêtre ni descendant en leurre, jamais `arabie` et
  `oman` ensemble) ; `chrono` (`EPREUVES_SUJETS`) ;
  `srs-grappes` (Océans d'abord, bassins, déterminisme) ; `seance-vue` ;
  `recherche` ; `regles`.
- **Vérification** : règles, Hosting ; un nouveau `ui_mers` (Trouver la mer
  Égée, Reconnaître, un Chrono, Apprendre « Océans » jusqu'au bilan,
  accueil) ; sur l'A37.
- **Fin** : chaque zone jouable au doigt sur le site ; données vérifiées par
  test en CI. L'APK suit au lot 5.

### Lot 4a. Quiz : données et tirage

- **Contenu** : `geodata/notoriete.mjs`, ses extraits (vues sur 12 mois) et
  sa table de relecture (D48), sans les capitales dont l'item est le pays ni
  les pays non jouables (§ 2.4) ; `src/quiz/` (générateurs des sujets déjà
  livrés, tirage) ; `src/epreuve/quiz.ts` (`PartieQuiz`, `idQuiz`). Les
  générateurs des sujets livrés après 4a arrivent avec eux.
- **Fichiers** : `geodata/notoriete.mjs`, `geodata/notoriete-main.json`,
  `geodata/wikidata/notoriete.json`, `geodata/wikidata.mjs` ;
  `public/geo/notoriete.json` ; `src/quiz/` (nouveau : questions,
  générateurs, tirage) ; `src/epreuve/quiz.ts` (nouveau).
- **Aussi** (réponses du 12/11) :
  - les 917 paires de drapeaux de score ≤ 0,5 dans les données du quiz
    (≈ 10 Ko brut, chargées avec le quiz seul) ; un leurre éloigné du
    facile et du moyen n'en a aucune avec le juste (§ 9.2 ; décision
    « Leurres de drapeaux au quiz ») ;
  - la table des formes des 197 pays dans le fichier de langue (« le
    Japon », « du Japon », « l'Indonésie »), relue à la main, puis tous les
    retours avec article (décision « Articles des noms de pays »).
- **Tests** : `notoriete.test.ts` (nouveau : un niveau 1 à 3 pour chaque
  lieu jouable de chaque sujet livré ; effectifs voulus ; Monaco, Singapour,
  Vatican au niveau de leur pays ; Taipei absente) ; `quiz.test.ts`
  (nouveau ; graine : 20 questions, formes et parts de D49, niveaux par
  difficulté, aucune entité en double, leurres par difficulté ; pour chaque
  sujet livré seulement : jamais deux jumeaux, ni Jérusalem et Jérusalem-Est,
  bouton juste d'une capitale = la principale) ; `PartieQuiz` (points, temps
  bornés, score, abandon selon D55).
- **Vérification** : tests seulement (rien de visible).
- **Fin** : tirage testé pour les quatre difficultés, sur les sujets
  livrés.

### Lot 4b. Quiz : partie et classement

- **Contenu** : racine à 3 tuiles, niveau `quiz`, écran des difficultés
  (§ 7.1) ; `src/vues/quiz.ts` et le module commun de la jauge (§ 9.3) ;
  l'attente de toutes les images au départ, reprise des épreuves des
  drapeaux (§ 9.3, décision « Images d'une épreuve ») ;
  bilan et records ; fin d'une partie selon D55 ; règles `quizValide` et
  publication, ouvertes une fois les 4 sujets livrés (D50 c) ; groupe « Quiz
  général » du 🏆 ; textes `quiz.*`.
- **Fichiers** : `src/vues/arbre.ts`, `jouer.ts`, `quiz.ts` (nouveau),
  `jauge.ts` (nouveau, sorti de `vues/chrono.ts`), `vues/chrono.ts`,
  `general.ts`, `scores.ts`, `vignettes.ts`, `textes.fr.json` ;
  `src/main.ts` ; `src/epreuve/chrono.ts` ; `src/sync/profil.ts` (test
  seulement) ; `src/carte.css` ; `firestore.rules` ; `driver.py` (`ui_quiz`,
  `smoke`).
- **Tests** : `jouer.test` (3 tuiles, `#jouer/quiz`, `#jouer/quiz/xyz`,
  `parent`, `fil`, `Lancement` des deux formes) ; `navigation.test` (partie,
  « Abandonner », retour) ; `quiz-vue.test.ts` (nouveau : un abandon après
  la première question écrit un record, si D55 a ; la première question
  n'apparaît qu'au dernier drapeau chargé, « Réessayer » après un échec, un
  abandon pendant le chargement ne compte pas) ; `chrono.test` (le
  général ignore le quiz) ; `general-vue`, `classement-vue` ; `regles`
  (`quizValide`, et `vraisemblable` confronté aux règles pour le quiz) ;
  `profil.test` (chaîne au pire, 73 épreuves × 2 périodes, sous
  `RECORDS_MAX`) ; `smoke` : `notoriete.json` absent au premier
  affichage.
- **Vérification** : règles, Hosting (un lundi) ; un nouveau `ui_quiz`
  (#jouer → Quiz général → Facile, 20 questions jouées par le pilote, bilan,
  record, « Rejouer », « Autre difficulté », retour arrière ; captures
  `16-quiz-*`) ; sur l'A37, délais jouables (S31).
- **Fin** : les quatre difficultés jouables sur le site ; leurs classements
  en ligne une fois les quatre sujets du J2 livrés.

### Lot 5. Fin du J2

- APK de tout cela sur l'A37 (après le lot 7 du J1b s'il n'est pas fait),
  après `sauver_journal`. Essai au doigt de chaque sujet et du quiz ; mesure
  du toucher ; fluidité avec les mers (§ 4.6).
- 🏆 : le remède de D52, s'il est retenu.
- `pastilles.py` : Q3 compte capitales et drapeaux avec les pays (§ 6.5),
  avec un cas dans `pastilles-outil.test.ts`.
- README, skill `run-terramemo` (commandes `geodata`, `wikidata`, nouveaux
  pilotes), ligne J2 de `docs/plan.md`.
- **Fin** : les critères de #27 et #26, APK compris ; ceux de #4 pour
  capitales et drapeaux (le reste : lot 6).

### Lot 6. Le reste du #4

À concevoir à part, selon D54 (§ 12).

## 12. Le reste du #4

Le ticket #4 dit aussi : test de placement, justesse des prévisions, objectif
quotidien, notification optionnelle, leurres tirés des confusions. Sa fin
demande un écart prévu/réel mesurable dès 300 réponses. Rien de cela n'est
conçu ici (D54). Pistes, pour mémoire :
- **test de placement** : « Je connais déjà » pour toute une région, par une
  partie de Trouver. Chaque bon premier toucher introduit la fiche en Easy.
  Il rendrait possible le prérequis strict de D39 ;
- **justesse des prévisions** : un outil, comme `pastilles.py`, qui rejoue
  le journal exporté. Pour chaque révision due, il compare la probabilité
  prévue par FSRS à la réponse réelle, par tranches. Rien à ajouter au
  journal ;
- **leurres par confusions** : `reponse` est déjà au journal. Il faut assez
  de données par joueur ;
- **objectif quotidien, notification** : l'objectif vient du plan (ligne
  J2) ; la notification « activée soi-même » faisait partie de la décision
  « Motivation », retirée en entier le 04/11. Les deux sont à reconfirmer.

## 13. Décisions en attente de l'utilisateur

Chaque réponse se note au registre. Une réponse qui contredit une décision
actée la **remplace** (`noter_decision`, `remplace`).

**Tranchées le 10/11 au soir, toutes selon la recommandation, sauf D46**
(après le verdict de #2, le 13/11 ; d'ici là, son défaut). Au registre :
« Capitales et drapeaux », « Drapeaux contestés et sosies », « Océans et
mers », « Quiz général », « Répétition espacée des nouveaux sujets »,
« Général à tous les sujets », « Ordre des sujets », « Objectif quotidien
et notification ». Là où le défaut écrit plus bas diffère, **le code suit
la réponse** :

| N° | Réponse |
|---|---|
| D36 | les défauts (a à j) |
| D37 | **c** : les 9 gardés en Trouver et en épreuve, jamais posés ni pris en leurre dans un QCM ; séries et tailles des pays ; général à 1 244 |
| D38 | **a** hors épreuve (au hasard parmi les justes) ; **d** en épreuve (la plus connue, fixe pour tous ; Palestine : la principale) |
| D39 | b, préférence |
| D40 | a, tous les Chrono au général |
| D41 | Afghanistan : **les deux justes**, le tricolore montré ; Bolivie : **les deux justes**, le civil montré, le Ghana en sosie ; Honduras corrigé ; jumeaux justes sous Drapeaux ; voisins d'abord en leurres ; le 12/11 : en Trouver hors épreuve, l'un des deux **au hasard** (§ 5.3) |
| D42 | **d** : rang combiné, seuil de 30 000 km², golfe de Finlande compris ; liste montrée à l'utilisateur et validée le 12/11 (§ 2.3), mer des Sargasses comprise |
| D43 | la règle du § 4.4, mais la baie d'Hudson **non intérieure** (juste pour l'Arctique et l'Atlantique) ; côte à 12 px ; océan allumé en pleine mer, avec la mer qu'il enclave sans côte (les Sargasses, 12/11), jamais ses mers côtières |
| D44 | a, une série de 50 |
| D45 | a, couche légère seule à l'accueil ; b, aucune frontière |
| D46 | **en attente** (13/11) ; défaut b et d (15 en commun, règle du reliquat) |
| D47 | a |
| D48 | **b** : rang combiné et relecture à la main du facile (remplace la lettre de « Quiz général ») |
| D49 | a avec d |
| D50 | c |
| D51 | non aux deux |
| D52 | **b** avant l'ouverture au public (ou le J5) ; a d'ici là |
| D53 | a, b (Communes en dernier), c |
| D54 | a pour le test de placement et la justesse des prévisions ; **c** pour l'objectif et la notification (abandonnés) |
| D55 | a, la partie compte dès sa 1re question |

**Réponses du 12/11 sur le lot 2**, toutes selon la recommandation, au
registre (« Drapeaux contestés et sosies », remplacée ; « Images d'une
épreuve » ; « Articles des noms de pays » ; « Leurres de drapeaux au
quiz ») :

| Question | Réponse |
|---|---|
| Afghanistan et Bolivie en Trouver | l'un des deux drapeaux au hasard hors épreuve, fixé pour la question ; le premier ailleurs (§ 5.3 ; lot 2b) |
| Images d'une épreuve | une épreuve classée qui montre des images ne démarre qu'une fois toutes chargées, « Réessayer » à l'échec ; l'attente de 3 s par question en filet (lot 2b ; le quiz aussi, § 9.3) |
| Honduras | rien de plus : signalé en amont par un tiers le 11/11 (lipis/flag-icons#1496, § 2.2) |
| Articles des noms de pays | table des formes des 197 pays au lot 4a, puis tous les retours avec article |
| Leurres de drapeaux au quiz | aucune paire ≤ 0,5 avec le juste pour un leurre éloigné du facile et du moyen ; les 917 paires dans les données du quiz (§ 9.2, lot 4a) |
| Alertes Dependabot | aucune mise à jour ne les ferme (versions figées sous firebase-tools, le build Node de firebase et mapshaper 0.6, dont la 0.7 change les communes de La Réunion d'un octet) : les 15 écartées dans GitHub, outil de dev (décision « Alertes Dependabot ») |

### Bloquent le lot 1 (capitales)

**D36. Capitales : les cas de données.** Ce sont 10 cas où les sources
divergent, ou où l'état réel n'est pas vérifié (S37). Les capitales justes
en plus ne changent jamais une note (la réponse est l'id du pays) : seuls
l'indice montré, la recherche et la rétroaction en dépendent, sauf i.
- a) **Bujumbura**, capitale économique du Burundi par la loi de 2019 :
  juste ? Défaut : oui (« toute capitale que le pays se déclare »).
- b) **Dar es Salaam** (Tanzanie) : capitale de fait pour Natural Earth, finie
  en 1996 pour Wikidata ; le gouvernement siégerait à Dodoma depuis 2019
  environ (non vérifié). Juste ? Défaut : non.
- c) **Guinée équatoriale** : Ciudad de la Paz principale (Wikidata, depuis le
  03/01/2026), Malabo juste comme siège. Que les institutions aient déménagé
  n'est pas vérifié. Défaut : oui aux deux.
- d) **Valparaíso**, siège du Congrès chilien, pas du gouvernement : juste ?
  Défaut : non.
- e) **Kiev ou Kyiv** à l'affichage : Kiev (Wikidata, Wikipédia en français)
  avec l'alias Kyiv, ou Kyiv (l'État français depuis 2022) ? Défaut : Kiev,
  et Kyiv trouvé par la recherche.
- f) **Jakarta, Le Caire, Naypyidaw** seules : Nusantara n'est pas déclarée
  (seul Wikidata le dit) ; la Nouvelle capitale administrative de l'Égypte
  non plus ; Rangoun est l'ancienne. Défaut : oui, à revoir si le décret sur
  Nusantara est signé.
- g) **Nauru** : Yaren, qui n'est capitale que de fait ; **Suisse** : Berne,
  « ville fédérale » ; **Kiribati** : Tarawa-Sud (alias Tarawa). Défaut :
  oui aux trois.
- h) **Bolivie** : Sucre (la constitution) en principale, alors que les
  manuels français citent souvent La Paz. Défaut : Sucre. Peu importe avec
  D38 a, où les deux se posent.
- i) **Jérusalem dans les deux sens** (§ 2.1) : toucher la Palestine est-il
  juste pour « Jérusalem », et toucher Israël pour « Jérusalem-Est » ? C'est
  la règle même de la décision (« juste pour qui tient et pour qui
  revendique ») : Israël tient Jérusalem-Est, la Palestine revendique
  Jérusalem. Cela change la note : une zone admise de plus, pour le seul
  sujet Capitales. Défaut : oui aux deux.
- j) **Trois capitales absentes** (relecture : Wikidata P36 du 10/11 ;
  constitutions citées de mémoire, non revérifiées) : Cetinje, « vieille
  capitale royale » du Monténégro (art. 5) ; Comayagüela, capitale
  « conjointement » avec Tegucigalpa (Honduras) ; la Nouvelle capitale
  administrative de l'Égypte, où le gouvernement siège depuis 2023-2024
  (estimé), alors que la règle compte le siège du gouvernement. Défaut :
  Cetinje non (titre honorifique) ; Comayagüela non, alias de Tegucigalpa
  (même agglomération) ; Nouvelle capitale administrative non tant qu'elle
  n'a pas de nom propre, à revoir avec S37.
- Recommandation : les défauts.

**D37. Les 9 pays dont la capitale porte le nom** (Djibouti, Guatemala,
Koweït, Luxembourg, Monaco, Panama, Singapour, Saint-Marin, Vatican).
- Ce qui est gratuit : en **Reconnaître** (Luxembourg allumé : « Luxembourg »
  parmi 4), la question est quasi gratuite. En **Trouver** et en épreuve,
  « Pays dont la capitale est : Luxembourg » reste une vraie question de
  localisation (il faut toucher le Luxembourg), mais devient un exercice de
  pays. Et aucune option ne retire toutes les quasi-gratuites : restent
  Andorre-la-Vieille, São Tomé, Tunis, Alger, Mexico.
- Options :
  - a) exclus des exercices et du quiz de capitales (186 capitales posées) ;
  - b) gardés partout (195) ;
  - c) gardés en Trouver et en épreuve, jamais posés ni pris en leurre en
    Reconnaître et dans les QCM du quiz.
- Coût / apport :
  - a) des tailles d'épreuve à part (Afrique 53, Amérique du Nord 21, Asie
    46, Europe 40, tous 186) : une table de plus dans les règles, des séries
    de capitales autres que celles des pays, des grappes « moins les
    exclus », dont aucune ne doit être vide (test). Général à 1 226 ;
  - b) mêmes séries que les pays, règles plus simples, général à 1 244 ;
    mais 9 Reconnaître quasi gratuits, et 9 Trouver qui sont un exercice de
    pays ;
  - c) tailles d'épreuve et règles des pays (général à 1 244), séries
    inchangées ; seuls les QCM excluent les 9 (option `exclus` de
    `qcm.choix`, déjà prévue). Les 9 Trouver restent un exercice de pays.
- Recommandation : **c** (le gain de a sur c est faible, son coût est
  définitif), sinon a.
- Défaut : a, en attendant. Il devient définitif dès que les épreuves de
  capitales sont en ligne, car la taille d'une épreuve fait son classement.
  Changer ensuite demanderait de nouveaux ids.

**D38. Capitale montrée quand un pays en a plusieurs** (12 pays).
- En **Entraînement et en mémoire** : a) tirée au hasard parmi les capitales
  justes à chaque question (fixée pour la question) ; b) la principale
  seule, les autres ne sont que révélées.
  - a) La Paz, La Haye, Abidjan, Le Cap se posent aussi, et ce sont souvent
    les plus connues. La fiche FSRS mêle deux indices ;
  - b) plus simple, mais La Paz, que la décision nomme, n'est jamais posée.
  - Recommandation et défaut : **a**.
- En **épreuve classée** (Chrono, Sans faute, Minute) : le général est le
  classement sérieux parce que tout le monde y a les mêmes questions
  (décision « Sans faute et Minute »), et le Chrono des capitales y entre
  avec D40 a. Un tirage y ferait voir Pretoria à l'un et Le Cap à l'autre,
  l'indice le plus connu étant le plus facile. L'indice y est donc **fixe
  pour tous** : c) la principale ; d) la plus connue (rang de D48). Test :
  deux parties du Chrono des capitales montrent les mêmes indices pour les
  12 pays.
  - Recommandation : **d** (La Paz, La Haye, Abidjan, Colombo : ce que
    connaît un Français), sauf pour la Palestine, où la principale
    (Jérusalem-Est) est montrée, comme au quiz (§ 2.4).
  - Défaut : c, plus simple et sans dépendance à la notoriété.
- Au quiz : § 9.2 (la plus connue à toucher, la principale au bouton juste).
- Définitif pour les épreuves dès qu'elles sont en ligne.

**D39. Ordre : pays avant capitales et drapeaux.**
- Options : a) indépendants (les grappes restent les mêmes et dans le même
  ordre) ; b) préférence : Apprendre prend d'abord une grappe dont les pays
  sont appris, sinon la suivante, avec un conseil (§ 6.2) ; c) prérequis
  strict : refus tant que les pays de la grappe ne sont pas appris.
- Coût / apport :
  - a) rien à coder. Mais un drapeau posé en Trouver avant le pays donne des
    Again ;
  - b) S ; guide sans bloquer ;
  - c) M ; bloque environ 31 jours un joueur qui connaît déjà les pays, tant
    que le test de placement (§ 12) n'existe pas.
- Recommandation : **b**, puis c une fois le test de placement là.
- Défaut : b. Rien pour les mers.

**D40. Le général compte-t-il les Chrono des nouveaux sujets ?**
- Options : a) oui, tous les Chrono. C'est la lettre de « Classements » :
  « somme des records Chrono de toutes ses épreuves » ; b) pays et île
  seulement, comme aujourd'hui.
- Coût / apport :
  - a) il récompense qui joue tout ; borne de 1 226 questions ; 46 lectures
    par publication du général. Un joueur des seuls pays recule au général ;
  - b) le général reste comparable à celui d'avant.
- Recommandation : **a**.
- Défaut : a. À trancher avant que les premières épreuves d'un nouveau sujet
  soient en ligne : un total publié ne baisse jamais. Passer de a à b
  laisserait des totaux gonflés.

### Bloque le lot 2 (drapeaux)

**D41. Drapeaux douteux et jumeaux.**
- a) **Afghanistan** : le tricolore de la République seul (flag-icons ; le
  siège à l'ONU serait toujours à la République, non vérifié) ; ou le
  tricolore et le drapeau de l'Émirat, justes tous les deux (jamais côte à
  côte en Reconnaître ; Commons, domaine public, 17 Ko gzip) ; ou l'Émirat
  seul. Défaut : le tricolore seul. Recommandation : les deux justes, comme
  la décision 1 le dit des capitales (pour qui tient, pour qui revendique),
  le tricolore montré en Reconnaître.
- b) **Bolivie** : elle déclare les deux (§ 2.2). Options : d'État, avec
  armoiries (flag-icons) : distinct du Ghana, mais lourd (102,9 Ko brut) ;
  civil : au rang préféré de Wikidata, plus connu, plus léger, mais proche
  du Ghana (sosie à ajouter à la liste) ; ou les deux justes, comme pour
  l'Afghanistan. Défaut : d'État (celui de flag-icons). Recommandation :
  les deux justes, le civil montré (le plus connu), le Ghana en sosie.
- Réponse du 12/11, pour a et b : le premier drapeau (tricolore, civil)
  montré partout, le même pour tous, sauf l'énoncé de Trouver hors épreuve,
  qui tire l'un des deux au hasard, fixé pour la question (§ 5.3).
- c) **Honduras** : corrigé au build dès maintenant et signalé à flag-icons,
  ou attendre flag-icons. Défaut et recommandation : corrigé. Signalé en
  amont par un tiers le 11/11/2026 (lipis/flag-icons#1496).
- d) **Jumeaux** (Indonésie et Monaco, Roumanie et Tchad) : en Trouver,
  toucher l'un pour l'autre est juste, sous le seul sujet Drapeaux (§ 2.2).
  Défaut et recommandation : oui.
- e) **Leurres de Reconnaître** : les voisins d'abord, comme la décision
  « Nommer » (§ 5.3), les sosies réservés au quiz moyen et au-delà ; ou les
  sosies d'abord dès l'Entraînement (plus formateur pour qui connaît déjà,
  mais des quasi-jumeaux dès le premier QCM d'une grappe). Défaut et
  recommandation : les voisins d'abord.

### Bloquent les lots 3a et 3b (mers)

**D42. La liste des océans et mers.**
- Options :
  - a) les 5 océans et les 45 mers du § 2.3. On y trouve la Manche et le
    canal du Mozambique (des bras de mer), les baies d'Hudson et de Baffin
    (des mers par leur taille) et la Caspienne (fermée, sans océan) ;
  - b) la lettre de « Océans et mers » (« les baies et les détroits restent
    au J5 ») : 41 mers sans ces quatre, fondues dans leurs voisines ;
  - c) a, plus la mer des Sargasses (65 182 vues par an en français, mais
    sans côte) ou d'autres mers : une ligne chacune ;
  - d) 50 zones choisies par le **rang combiné** (Wikipédias et vues de la
    Wikipédia française sur 12 mois, comme D48 b), avec le seuil de
    30 000 km² (Marmara et la mer Ligure, ≈ 1 px au zoom 1, restent dehors).
    Échanges probables (estimé, la liste exacte sort du build au lot 3a et
    se montre à l'utilisateur) : entrent les golfes de Botnie (7 223 vues),
    de Californie (7 820) et de Finlande, et les Sargasses si une zone sans
    côte est acceptée ; sortent par exemple les mers de Sibérie orientale
    (1 521) et de Java (1 611).
- Coût / apport :
  - a) la Manche est très lue en France (105 396 vues par an). Ces quatre
    zones vont de 96 000 à 1,4 million de km² : ce sont des mers par la
    taille ;
  - b) suit la lettre, mais retire la Manche à un public français ;
  - a, b, c) le compte des Wikipédias garde des mers que presque personne
    ne lit en français et en écarte de bien plus lues (§ 2.3), ce que le
    § 2.4 dénonce pour les pays ; ses exceptions sont arbitraires
    (Groenland oui, Botnie non) ;
  - d) suit la lettre « mers et golfes **connus** » ; le Mozambique reste
    une exception écrite (voisin de La Réunion).
- Dans tous les cas, le golfe de Finlande (101 Wikipédias, 30 217 km²)
  entre, ou son exclusion s'écrit avec sa raison.
- Recommandation : **d**.
- Défaut : a. Elle devient figée une fois les épreuves des mers en ligne
  (taille 50). Les ids courts (§ 2.3) ne sont pas en question : la synchro
  les impose.

**D43. Le toucher des mers.**
- a) **Un océan et ses mers** : juste pour une mer bordière (Caraïbes → 
  Atlantique), faux pour une mer intérieure (Méditerranée, Noire, Baltique,
  Rouge, Persique, Hudson) ; une mer compte ses sous-mers (Adriatique →
  Méditerranée). Autres options : toute mer compte pour son océan ; ou la
  pleine mer seule. Défaut et recommandation : la règle de § 4.4. Elle suit
  l'intuition d'un joueur (la mer des Caraïbes, « c'est l'Atlantique » ; la
  mer Noire, non), et Wikidata (P361). **Cas à part, la baie d'Hudson** :
  marquée intérieure, la toucher est faux pour l'Arctique ; or l'OHI la
  range dans l'Arctique, et ses parents sont « arctique, atlant ». Défaut :
  intérieure (comme la Baltique) ; recommandation : non intérieure, juste
  pour l'Arctique et l'Atlantique, comme l'OHI.
- b) **La côte** : toucher la terre à moins de 12 px de la mer visée est
  juste ; au-delà, la terre gagne. Défaut et recommandation : oui.
- c) **Un océan allumé** (Reconnaître) montre sa pleine mer seule. Défaut et
  recommandation : oui (avec ses mers, l'Atlantique couvrirait les Caraïbes
  et la mer du Nord).

**D44. Séries des océans et mers.**
- Options : a) une seule série, de 50 ; b) une par océan (5 séries de 5 à 17
  zones, 15 classements).
- Coût / apport : a) un 🏆 lisible, une règle simple ; un Chrono de 12 min au
  plus ; b) des parties courtes, mais beaucoup de classements presque vides.
- Recommandation et défaut : **a**.

**D45. Les mers à l'accueil.**
- a) Toucher l'eau à l'accueil donne le nom de la mer. La couche se charge au
  premier toucher en mer ; le nom suit de quelques centaines de ms (estimé).
  Coût : ≈ 75 Ko pour presque chaque visiteur qui touche la carte, ≈ 4 % du
  budget par visiteur de « Hébergement » (§ 2.3). Options : la couche fine
  (75 Ko) ; la couche légère seule à l'accueil (≈ 25 Ko), la fine en partie
  de mers ; ou rien à l'accueil. Défaut et recommandation : oui, avec la
  couche légère seule à l'accueil.
- b) Aucune frontière entre mers n'est dessinée : elles n'en ont pas dans la
  réalité. Défaut et recommandation : aucune. Un trait très fin sur la seule
  carte de la mémoire des mers, si la capture le demande.

### Défauts codés dès le lot 0c (mémoire ; D46 après le verdict de #2)

**D46. Nouveautés de la Révision du jour.** À trancher **après** le verdict
de #2 sur les plafonds D5 (13/11) : la charge à quatre sujets en dépend
(§ 6.3).
- Question 1, où s'ouvrent les grappes nouvelles : a) toutes dans la
  Révision du jour ; b) seules celles des pays ; les autres sujets s'ouvrent
  par Apprendre, puis leurs révisions, introductions et grappes entamées
  reviennent dans la Révision du jour (le modèle des communes) ; c) un sujet
  par jour, à tour de rôle.
  - a) la lettre de « Répétition espacée des nouveaux sujets », mais des
    séances de ≈ 130 questions au pire ;
  - b) le joueur règle le volume, et c'est déjà codé pour les communes. Mais
    avec quatre sujets ouverts chaque jour, la simulation (§ 6.3, estimée)
    atteint le plafond commun de 60 révisions du jour 10 au jour 40 : ce
    plafond ralentit déjà tous les sujets ;
  - c) lisible ; chaque sujet n'avance qu'un jour sur quatre (les pays de
    31 jours à environ 4 mois), mais la charge reste celle d'un sujet.
  - Recommandation et défaut : **b**.
- Question 2, le plafond des introductions « Reconnaître » (aucun
  aujourd'hui, il change donc aussi pays et communes) : d) 15 par jour,
  **communs** à tous les sujets ; e) 15 par jour **par sujet**. La décision
  « Répétition espacée des nouveaux sujets » donne à chaque sujet « sa
  propre réserve de nouveautés par jour » : d s'en écarte (à noter par
  `remplace` s'il est choisi), e la suit mais laisse 28 introductions par
  jour à quatre sujets (simulation).
  - Dans les deux cas, règle du reliquat : un sujet dont des introductions
    attendent n'ouvre pas de grappe nouvelle (sinon, avec d, le reliquat
    grossit d'environ 13 fiches par jour).
  - Recommandation : **d** avec la règle du reliquat (la charge reste près
    des ≈ 5 min visées), présenté comme un écart à la lettre. Défaut : d et
    15, réversible (une constante).

**D47. Carte de la mémoire à plusieurs sujets.**
- Options : a) choix du sujet dans la légende, gardé sur l'appareil, et le
  détail de chaque sujet au toucher (§ 6.4) ; b) la fiche la plus faible,
  tous sujets confondus ; c) les pays seuls à la teinte, le détail au
  toucher.
- Coût / apport : b) commencer les capitales repeindrait en « faible » des
  pays maîtrisés ; c) on ne verrait jamais la carte des capitales.
- Recommandation et défaut : **a**.

### Bloquent le lot 4 (quiz)

**D48. La notoriété** (les lieux de chaque difficulté).
- Options :
  - a) les Wikipédias seules, la lettre de « Quiz général » : seuils de
    § 2.4 (pays faciles : 25) ;
  - b) un rang combiné, Wikipédias et vues de la Wikipédia française sur
    12 mois, coupé par effectifs (pays 40 / 60, capitales 30 / 60, mers
    12 / 11). Puis une relecture à la main du seul niveau facile (40 pays,
    30 capitales, 12 mers), là où une question mal classée frustre le plus.
    Pour les mers : la Manche au niveau 1 ; Gascogne, Tyrrhénienne et Hudson
    au niveau 2 ;
  - c) b sans relecture.
- Coût / apport : a) la Finlande, l'Albanie et le Chili seraient faciles, le
  Maroc, le Sénégal et la Tunisie difficiles ; b) environ 20 minutes de
  requêtes, plus une relecture d'une centaine de lignes.
- Recommandation : **b**. Elle remplace la lettre de la décision : à noter par
  `remplace`.
- Défaut : a, la décision actée.

**D49. La forme d'une partie de quiz.**
- Options : a) le tableau de § 9.2 : formes fixes par difficulté (20 + 0,
  10 + 10, 8 + 12, 8 + 12), parts égales par sujet, délais de 10 et 15 s
  (6 et 10 s en expert), leurres par difficulté ; b) formes et sujets tirés
  au hasard ; c) les sujets au prorata de leurs lieux.
- Option d), une variante du **facile** dans a (§ 9.2) : l'énoncé nomme le
  pays (« Quelle est la capitale du Japon ? », « Quel est le drapeau du
  Brésil ? »), la zone allumée n'est qu'une aide, et les leurres de niveau 1
  viennent du même continent (et non « lointains »). Sans elle, le facile
  demande de reconnaître le pays à sa forme avant de savoir sa capitale, et
  ses leurres lointains réduisent la question à « quelle région ? » : il
  saturerait à 20/20 (estimé), départagé au seul temps de réaction.
- Coût / apport : b) les parties d'une même difficulté se comparent mal, et
  la chance du tirage pèse ; c) les mers presque absentes ; d) un énoncé de
  plus par sujet dans `sujets.ts` (S).
- Recommandation : **a avec d**. Défaut : a, avec d. Les délais sont à caler
  à l'essai (S31), et la part de parties à 20/20 se mesure (S39).

**D50. Le quiz quand le réservoir grandit.**
- Options : a) un id stable ; un nouveau sujet mis en ligne un lundi ; un id
  nouveau seulement si la formule change (§ 9.5) ; b) un id nouveau à chaque
  sujet ajouté.
- Et pour le J2 lui-même : c) a, mais le classement du quiz (règles et
  publication) n'ouvre qu'une fois livrés les quatre sujets du J2 ; avant,
  le quiz se joue sans classement (§ 9.5).
- Coût / apport : a) le classement de toujours mêle des parties d'avant et
  d'après un ajout ; un lot 4b sorti avec deux sujets fixerait des records
  de toujours trop faciles (pays à 50 % des questions, puis 25 % avec les
  mers), hors d'atteinte pendant tout le J2 ; b) il repart de zéro à chaque
  ajout ; c) les ajouts du J2 sont connus d'avance : on attend qu'ils soient
  là, et a vaut pour les suivants (J5…).
- Recommandation et défaut : **c** (donc a après le J2).

**D51. Hors du quiz au J2 : communes et mémoire.**
- a) Communes de La Réunion : pas au J2 ; plus tard, en difficile et en
  expert, avec l'île préchargée (§ 9.6). Défaut et recommandation : pas au J2.
- b) Réponses du quiz dans la mémoire : non, comme les épreuves classées ; ou
  bien au journal en mode `libre` (hors FSRS), pour les confusions. Défaut
  et recommandation : non.

**D55. Une partie de quiz abandonnée** (touche la décision « Fin d'une
partie du Chrono »).
- Le problème (§ 9.3) : abandonnée avant la fin, une partie ne compte pas ;
  « Rejouer » refait un tirage ; le classement de toujours garde le
  meilleur. On peut donc abandonner dès qu'une question difficile tombe et
  relancer jusqu'à un tirage facile. Au Chrono, la série est fixe : la même
  règle n'y pose pas ce problème.
- Options : a) une partie compte dès que sa première question est montrée :
  un abandon publie le score acquis, les questions sans réponse valent 0 ;
  b) une graine par jour et par difficulté (« quiz du jour ») : les mêmes 20
  questions pour tous ce jour-là, seule la première partie du jour compte au
  classement, les suivantes servent d'entraînement ; c) laisser la règle du
  Chrono.
- Coût / apport : a) simple, sans effet sur le reste ; un abandon par
  mégarde (appel, retour Android) compte aussi ; b) le plus juste (mêmes
  questions pour tous, comme le général), mais une seule partie classée par
  jour et un tirage à graine datée à concevoir ; c) le hasard du tirage
  devient exploitable.
- Recommandation et défaut : **a**. Si l'utilisateur le choisit, la
  réponse complète « Fin d'une partie du Chrono » pour le quiz (à noter par
  `remplace` ou comme décision à part).

### Ne bloquent rien

**D52. Les lectures du 🏆.**
- Options : a) tout lire (74 lectures, plus 3 par place) ; b) mes places =
  les épreuves où l'appareil ou le compte a un record, plus les places déjà
  vues ; « Toutes les épreuves » lit le reste à la demande (§ 8.3).
- Coût / apport : b) une dizaine de lectures au lieu de 74 pour qui ne joue
  que quelques épreuves (estimé) ; mais la place qu'un autre appareil a
  prise sous le même pseudo, sans compte, n'apparaît qu'après « Toutes les
  épreuves ».
- Recommandation : **b**, avant l'ouverture au public ou avant le J5.
- Défaut : a.

**D53. La présentation.**
- a) Vignettes des sujets : Capitales, le monde et ses capitales en points ;
  Drapeaux, une icône ; Océans et mers, le monde aux mers éclairées. C'est
  le principe de « Panneau de Jouer plein écran » (une petite carte par
  sujet), sauf pour Drapeaux.
- b) Ordre des sujets : Pays, Capitales, Drapeaux, Océans et mers, Communes.
  La décision « Écran Jouer » listait « Pays, Communes ; puis Drapeaux,
  Capitales » : ce défaut fait passer Communes, le sujet de La Réunion, de
  la 2e à la 5e place, et inverse Drapeaux et Capitales. Option : « Pays,
  Communes, Capitales, Drapeaux, Océans et mers » (Communes garde sa
  place).
- c) Le point de la capitale montré par un anneau à la rétroaction, en
  Entraînement seulement (pas en épreuve, où il ne sert pas).
- Défaut et recommandation : a, b (Communes en dernier, les sujets du monde
  ensemble) et c comme écrits ; l'option de b est au choix de
  l'utilisateur.

**D54. Le reste du #4** (test de placement, justesse des prévisions, objectif
quotidien, notification, leurres par confusions ; § 12).
- Options : a) dans le J2, conçus à part après le quiz (lot 6) ; b) un
  ticket à part, et #4 se ferme sur capitales et drapeaux ; c) abandonner
  l'objectif quotidien et la notification (celle-ci faisait partie de
  « Motivation », retirée le 04/11).
- Coût / apport : la justesse des prévisions est dans le critère de fin
  de #4 ; le test de placement rendrait possible le prérequis strict de D39.
- Recommandation : **a** pour le test de placement et la justesse des
  prévisions ; **c** pour l'objectif et la notification, sauf si
  l'utilisateur y tient.
- Défaut : a. Rien n'est codé avant une conception.

## 14. Non retenu

- **Capitales** : une capitale « ville à placer » (J4, d'après la décision) ;
  une capitale officielle unique ; la population comme notoriété (elle
  rendrait faciles le Bangladesh, le Nigeria et le Pakistan) ; le P159 des
  organes de l'État pour trouver les sièges (il donne des bâtiments, 170
  liens inutilisables) ; Natural Earth comme source (données de 2022).
- **Drapeaux** :
  - svgo (−1,5 %), le format 1x1, les WebP pour les drapeaux lourds ;
  - un paquet unique (331,5 Ko pour chaque joueur) ; `import.meta.glob`
    (data URI dans le JS) ; flag-icons en dépendance npm (test des Crédits) ;
  - une description en texte de chaque drapeau pour les lecteurs d'écran : à
    reprendre si on la demande ;
  - l'écart ΔE76 moyen, qui éloignait le Tchad de la Roumanie.
- **Mers** :
  - la règle des pays à 2 km (3,4 fois plus lourde, gain invisible sous les
    terres) ; une seule version à 15 km (elle dépasse le budget des gestes) ;
  - les mers dans `monde.topo.json` ou dans `entites` ;
  - Marmara et la mer Ligure (sous 30 000 km², ≈ 1 px au zoom 1) ;
    Sargasses, Philippines, Labrador, Californie, Botnie, Ross, Weddell : une
    ligne chacune si on les veut (D42 c), ou par le rang combiné (D42 d). Le
    golfe de Finlande n'est pas « non retenu » : il remplit la règle (D42) ;
  - les petites baies et les détroits (J5, #7) ;
  - la marque d'une mer sur la carte de base (chaque toucher redessinerait
    tout).
- **Mémoire** :
  - une rotation d'un sujet par jour ; toutes les grappes dans la Révision
    du jour ; un prérequis de maîtrise (seau ≥ 2 : trop lent) ;
  - la règle « famille » (deux sujets d'une même entité jamais le même
    jour) ;
  - un id de séance par domaine (plus de lots, donc plus d'écritures, et un
    bilan coupé) ;
  - renommer les sens `localiser` et `nommer`.
- **Journal** : un mode `quiz` ou un champ nouveau (il faudrait `v = 2`).
- **Épreuves et quiz** :
  - monter `VERSION_BAREME` (tous les records effacés) ; une version dans l'id
    du quiz à chaque sujet ajouté ;
  - le quiz comme `Branche`, ou dans `MODES_EPREUVE` ;
  - un bonus de vitesse ; des vies ou un temps limité (écartés par la
    décision « Quiz général ») ;
  - les communes au J2 ; des sujets au prorata de leurs lieux.
- **🏆** : une requête `collectionGroup` sur un champ `cle` (règles, anciens
  documents, index de groupe). À reprendre si le J5 ou le J6 doublent encore
  les lectures.
- **Notoriété par les réponses de tous les joueurs** : à concevoir plus tard
  (§ 9.6).

## 15. Suppositions à vérifier

La numérotation suit celle du J1b (S1 à S25).

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S26 | Le Canvas reste sans saccade sur l'A37 avec le calque marin teinté, au zoom 1, en tournant | § 4.6 | lot 3a |
| S27 | Le `destination-out` de la couche du dessus garde le toucher sous 100 ms en médiane | `touchers_reels.py` sur une mer allumée | lot 3a |
| S28 | earcut ne retourne aucun triangle des mers à 16 rotations (écart de 0,6 % sur les Caraïbes) | `carte-webgl.test.ts` | lot 3a |
| S29 | Le second enregistrement IndexedDB (`'webgl-mers'`) ne gêne ni n'efface celui des terres | pilote, deux visites | lot 3a |
| S30 | Le quota de Hosting compte les octets compressés | doc de Firebase, ou la console après une journée | lot 2 |
| S31 | Les délais du quiz (10 et 15 s ; 6 et 10 s en expert) se jouent au téléphone | essai sur l'A37 | lot 4b |
| S32 | La règle `"source": "/"` de `firebase.json` s'applique à `/` | `curl -sI` après le déploiement | lot 0a |
| S33 | Le rendu de resvg-wasm est le même sur le PC et en CI (mêmes sosies) | test de build identique | lot 2 |
| S34 | La tolérance de 12 px à la côte d'une mer paraît juste au doigt | essai sur l'A37 | lot 3b |
| S35 | Un drapeau de 64 × 48 px se lit sur l'A37, dehors compris | essai, avec #28 | lot 2 |
| S36 | La chaîne des records du profil reste sous 32 768 caractères après le J2 (18 773 mesurés par script) | un vrai profil, après le lot 4b | lot 5 |
| S37 | Le gouvernement tanzanien siège à Dodoma ; les institutions de Guinée équatoriale ont déménagé ; le décret sur Nusantara n'est pas signé | sources officielles, au moment de figer l'extrait | lot 1 |
| S38 | Chaque capitale tombe à moins de 25 km du tracé de son pays ou d'une zone admise (côtes simplifiées à 2 km, îles) | test de données, exceptions écrites. Sondage de la relecture : les 210 capitales du brouillon sont dans leur pays ou à moins de 10 km (`relectures/produit-scripts/cap_dans_pays.cjs`) | lot 1 |
| S39 | Le quiz facile ne sature pas à 20/20 (avec D49 d) | part des parties à 20/20, au pilote puis à l'essai | lot 4b |
| S40 | La charge de la mémoire à quatre sujets reste près de ≈ 5 min par jour avec les plafonds retenus | la simulation de § 6.3 reprise sur 90 jours, puis le journal réel après un mois | lot 0c, puis lot 5 |

## 16. Sources et écarts des relevés

**Relevés** (`~/Sauvegardes/terramemo/j2-conception/`) :
- `releves/carte.md`, `releves/parties.md`, `releves/srs-synchro.md` (script
  `releves/scripts-srs/carte.mjs`) ;
- `capitales/` : `capitales.json` (brouillon), `scripts/` (`tout.sh` refait
  tout), `wikidata/requetes.txt` (requêtes figées, extrait du
  2026-11-10T14:56:57Z), `sorties/` (écarts avec Natural Earth, comptes,
  notoriété, vues) ;
- `drapeaux/` : `poids.json`, `ressemblances-de2000.json`, `wd/p41.json`,
  planches PNG, `scripts/` ;
- `mers/` : `liste-entree.json`, `liste-proposee.json`, `scripts/`
  (`couche-mers.mjs`, `cote.mjs`…), `sorties/` (couches à 2, 10, 15 et
  50 km, attributs, mesures) ;
- `synthese/scripts/` : `carte-lot.mjs` (borne des lots, § 3.3) et
  `table-mers.py` (table de § 2.3), écrits pour cette synthèse.

**Code** : commit `de7448d`. Fichiers cités au fil du texte.

**Externes** :
- Wikidata : SPARQL le 10/11 à 14:56:57 UTC, API wbgetentities à 15:41:21
  UTC ; vues des Wikipédias (API Action `prop=pageviews`, API REST) ;
- Natural Earth v5.1.2, commit `f1890d9f` : `ne_10m_geography_marine_polys`,
  `ne_10m_populated_places` (contrôle seulement) ;
- flag-icons 7.6.0 (npm, tag GitHub v7.6.0) ; Commons (drapeaux du Honduras
  et de l'Émirat) ;
- `@resvg/resvg-wasm` 2.6.2, svgo 4.1.0 (essayé, non retenu) ;
- en-têtes du site : `curl -sI` le 10/11 sur `/`, `/index.html`,
  `/geo/pays.json`.

**Écarts trouvés en revérifiant les relevés** :
- **Borne des lots** : le relevé de la synchro encodait `aide` en texte
  (`'passer'`), alors que les lots l'encodent par son rang. Remesuré (§ 3.3) :
  `capitales`, 149 caractères au pire. Sa conclusion tient (ids de mers à
  8 lettres au plus). Mais le relevé des mers proposait des ids jusqu'à
  17 lettres (`chine-meridionale`), qui feraient refuser des lots :
  raccourcis au § 2.3.
- **Numéros de ligne** :
  - `src/srs/journal.ts` fait 127 lignes : `MODES` :60, `LONGUEUR_ID` :67,
    `probleme` :83, l'appel à `analyser` :93, `CHAMPS_CONNUS` :119 (le
    relevé citait :259 à :318) ;
  - `src/vues/retournee.ts` fait 162 lignes : consigne :84, révélation :87,
    `allumerZone` :95, `poser` :132 (le relevé citait :176 à :241) ;
  - relevé de la carte : `anneauPrincipal` est à `geo.ts:146`,
    `distanceAuBordKm` à `:207`, `unionEmprises` à `:235`, `viserEmprise` à
    `vue.ts:228` ; `preparer` à `dessin.ts:144` ; `anneau` à
    `carte-canvas.ts:747` et `carte.ts:543` ; le chargement de l'île est dans
    `src/terrains.ts:56-71`.
- **Couverture marine** : les 2,04 % de mer sans zone du relevé de la carte
  venaient des longues arêtes lues en grand cercle. Après la densification,
  le relevé des mers mesure 0,14 % (2 km) et 0,20 % (10 km).
- **Borne du général** : 1 239 au relevé des parties (45 mers, sans
  exclusion) ; 1 226 ici (50 zones, D37 a), 1 244 sans l'exclusion.
- **Notoriété des capitales** : les deux coupes du relevé (« 30 / 60 / 98 »
  et « 30 et 90 ») sont la même (90 = 30 + 60). Le relevé des capitales
  comptait tous les liens Wikidata, celui des mers les seules Wikipédias : à
  aligner (§ 2.4).
- **Décision « Océans et mers »** : sa lettre laisse les baies et les détroits
  au J5, et la liste du relevé en garde quatre (D42).
- **Décision « Classements par épreuve »** : elle annonçait 9 lectures à
  l'ouverture du 🏆. Le code en fait 25 depuis Sans faute et Minute
  (`epreuve/classement.ts:124`). Après le J2 : 74.
- Vérifiés et confirmés :
  - `DELAI_CHRONO_MS.nommer` n'est lu nulle part ;
  - `libre()` reçoit le `Lancement` et l'ignore ;
  - `totalGeneral` additionne tout record de mode `chrono` ;
  - `ui_jouer` exige deux sujets ;
  - le test des Crédits refuserait flag-icons en dépendance ;
  - `/` est servi en `max-age=3600`.

## 17. Relectures intégrées

Deux relectures adverses (`~/Sauvegardes/terramemo/j2-conception/relectures/` :
`code-existant.md` ; `produit-pedagogie-donnees.md`, scripts dans
`produit-scripts/`). Chaque constat a été revérifié dans le code (`de7448d`),
les extraits des relevés, les décisions actées, ou en relançant la
simulation ; tous ont été retenus, un seul avec une nuance (la confrontation
de `vraisemblable` aux règles existe déjà pour le Chrono, Sans faute et
Minute : elle s'étend au quiz et au général). Ce qui a changé :
- **bloquants** : `DOMAINES_JOUABLES`, distinct de `DOMAINES` (§ 3.1, 6.3,
  6.5, lots) ; le sort d'une partie de quiz abandonnée (§ 9.3, D55) ;
- **conception** : `avecSujet` au lancement des parties (§ 4.2) ; zones
  admises en plus par sujet pour les jumeaux, les parties de mer et
  Jérusalem (§ 2.2) ; appelants de `modeEpreuve` et `publierTout` (§ 3.2) ;
  APK en retard sur le site (§ 3.2, § 10) ; liste complète des appels de
  `nomDe` (§ 5.1) ; ordre du `destination-out` (§ 4.3) ; cache WebGL
  (§ 2.3) ; lecture de `BUDGET_SOMMETS` (§ 4.6) ; charge de la mémoire en
  régime établi et règle du reliquat (§ 6.1, 6.3) ; artefacts de la
  notoriété (§ 2.4) ; coût de la couche marine par visiteur (§ 2.3) ;
  dépendances du lot 4a et ouverture du classement du quiz (§ 9.5, § 11) ;
- **décisions** : D36 i et j ; D37 c ; D38 scindé (épreuve à indice fixe) ;
  D41 b réécrit et e ; D42 d et le golfe de Finlande ; D43 a (Hudson) ;
  D45 a (couche légère) ; D46 réécrit, après #2 ; D49 d ; D50 c ; D53 b
  (place de Communes) ; D55 ;
- **tests ajoutés** : `smoke` sans fichier des nouveaux sujets au premier
  affichage ; `vraisemblable` confronté aux règles pour le quiz et le
  général ; profil au pire ; Monaco sous Drapeaux et sous Pays ; mêmes
  indices au Chrono des capitales ; aucune grappe de capitales vide ; un
  abandon de quiz qui écrit un record ; fichiers nouveaux marqués
  (`carte-memoire.test.ts`, `quiz-vue.test.ts`, `quiz.test.ts`,
  `notoriete.test.ts`) ;
- **petits écarts** : lignes d'`estCouture`, `NE_BASE` de `10m_physical/`,
  `build.mjs:106` (un titre), licence hors du dossier immuable, « 53
  capitales » d'Afrique, carte de lot à 152 caractères.
