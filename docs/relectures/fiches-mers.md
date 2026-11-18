# Fiches des océans et des mers : tableaux à relire

*Écrit par le build (`npm run fiches`, `geodata/fiches-mers.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. Ticket #34, lot F4 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.3 et § 9 (« Relectures demandées »).*

## Comment relire, comment corriger

- Ce que montre la fiche d'une mer : sa sorte (« mer intérieure », « golfe »…), la mer dont elle fait partie et son océan (des boutons, comme les voisins d'un pays), sa superficie, sa profondeur maximale, ses pays riverains (des boutons) et le lien vers Wikipédia. Un océan n'a pas de liste de riverains (une centaine de pays chacun) ; la mer des Sargasses non plus (elle n'a pas de côte).
- Les trois sections sont **tues dans la fiche** tant que leur clé de `LIGNES_RELUES` (`src/fiches/relues.ts`) est à `false` : `riverains_mers`, `superficie_mers`, `profondeur_mers`. Une fois une section relue, passer sa clé à `true`. D'ici là, la fiche d'une mer montre sa sorte, sa mère, son océan, la mémoire et le lien, et sa barre ne dit que son océan.
- Pour corriger : la ligne de la mer dans `geodata/fiches-main.json` (clé donnée en tête de section, une raison par ligne), puis `npm run fiches`. Le build échoue si une ligne ne s'applique plus (un pays à retirer que rien ne donne, un pays à ajouter déjà là, une superficie à moins de 25 % du tracé). Pour valider une ligne « à relire » : retirer son `a_relire`.
- Sources : Wikidata (extrait des mers du 2026-11-18) ; Natural Earth 5.1.2 (zones marines et pays, au 1:10m) ; pour les lignes écrites à la main, la Wikipédia (révision citée dans la raison) et, pour les océans, la NOAA (Eakins et Sharman, 2010). Ces pages sont citées dans `public/geo/sources.json`.

## 1. Pays riverains (clés `riverains_mers` et `riverains_items`)

**Dans la fiche : tue** tant que `riverains_mers` est à `false` dans `src/fiches/relues.ts`.

Règle : l'union de deux méthodes, sous-mers comprises (la Méditerranée a les riverains de l'Adriatique, de la mer Égée, de la mer Ionienne et de la mer Tyrrhénienne). **Le tracé** : un pays (ou un territoire) dont la côte passe à 0,12° (≈ 13 km) de la zone dessinée, en 2 points au moins (≈ 10 km de côte). **Wikidata** : les pays (P17) et pays du bassin (P205) déclarés pour la mer. Puis : les États disparus retirés ; d'office, un pays que seul Wikidata donne quand un de ses territoires est riverain par le tracé (il est alors représenté par ce territoire) ; enfin les lignes de la table (retraits et ajouts, avec leur raison). Les territoires et les zones contestées portent leur statut ; la fiche range les pays d'abord, les autres à part, comme les voisins d'un pays.

45 mers (les 5 océans à part) ; les deux méthodes s'accordent pour 28, sans ligne de la table.

| Mer | Riverains retenus | Par le tracé seul | Par Wikidata seul | Retirés d'office | Lignes de la table | À relire |
|---|---|---|---|---|---|---|
| mer Méditerranée (avec mer Adriatique, mer Égée, mer Ionienne, mer Tyrrhénienne) | 26 : Akrotiri (territoire), Albanie, Algérie, Bosnie-Herzégovine, Chypre, Chypre du Nord (statut contesté), Croatie, Dhekelia (territoire), Égypte, Espagne, France, Gibraltar (territoire), Grèce, Israël, Italie, Liban, Libye, Malte, Maroc, Monaco, Monténégro, Palestine, Slovénie, Syrie, Tunisie, Turquie | Akrotiri (territoire), Dhekelia (territoire), Gibraltar (territoire), Saint-Marin, Zone tampon des Nations unies à Chypre (statut contesté) | Malte, Royaume-Uni | Royaume-Uni | retire Zone tampon des Nations unies à Chypre : la zone tampon des Nations unies à Chypre touche la mer à ses deux bouts, mais c'est une ligne de cessez-le-feu, pas un riverain (étude § 2.3 : « les zones de Chypre ») ; retire Saint-Marin (ligne de mer Adriatique) : Saint-Marin est enclavé dans l'Italie, à une dizaine de kilomètres de la côte : le tracé le prend (côte à 13 km) | **à relire** : Zone tampon des Nations unies à Chypre |
| mer Adriatique | 7 : Albanie, Bosnie-Herzégovine, Croatie, Grèce, Italie, Monténégro, Slovénie | Grèce, Saint-Marin | — | — | retire Saint-Marin : Saint-Marin est enclavé dans l'Italie, à une dizaine de kilomètres de la côte : le tracé le prend (côte à 13 km) |  |
| mer Égée | 2 : Grèce, Turquie | — | — | — | — |  |
| mer Ionienne | 3 : Albanie, Grèce, Italie | — | — | — | — |  |
| mer Tyrrhénienne | 2 : France, Italie | — | — | — | — |  |
| mer Noire (avec mer d'Azov) | 6 : Bulgarie, Géorgie, Roumanie, Russie, Turquie, Ukraine | — | — ; États disparus retirés : Empire russe, Union soviétique | — | — |  |
| mer d'Azov | 2 : Russie, Ukraine | — | — ; États disparus retirés : Empire russe, Union soviétique | — | — |  |
| mer Caspienne | 5 : Azerbaïdjan, Iran, Kazakhstan, Russie, Turkménistan | — | — ; États disparus retirés : Empire russe, Union soviétique | — | — |  |
| mer Baltique (avec golfe de Botnie, golfe de Finlande) | 10 : Allemagne, Danemark, Estonie, Finlande, Îles Åland (territoire), Lettonie, Lituanie, Pologne, Russie, Suède | Îles Åland (territoire) | — ; États disparus retirés : Empire russe, Union soviétique | — | — |  |
| golfe de Botnie | 3 : Finlande, Îles Åland (territoire), Suède | Îles Åland (territoire) | — | — | — |  |
| golfe de Finlande | 3 : Estonie, Finlande, Russie | — | — ; États disparus retirés : Empire russe, Union soviétique | — | — |  |
| mer du Nord | 7 : Allemagne, Belgique, Danemark, France, Norvège, Pays-Bas, Royaume-Uni | Suède | — | — | retire Suède : la Suède ne touche que le Skagerrak et le Kattegat, que la carte fond dans la mer du Nord ; l'OHI et la Wikipédia en français (« Mer du Nord », révision 239950381) les en séparent | **à relire** : Suède, sur la carte, la mer du Nord dessinée borde bien la Suède |
| Manche | 4 : France, Guernesey (territoire), Jersey (territoire), Royaume-Uni | — | — | — | ajoute Jersey : Jersey est dans la Manche (golfe de Saint-Malo) ; la zone de Natural Earth s'arrête à 25 km ; la Wikipédia en français (« Manche (mer) », révision 239744542) le cite ; ajoute Guernesey : Guernesey est dans la Manche ; la zone de Natural Earth s'arrête à 23 km ; la Wikipédia en français (« Manche (mer) », révision 239744542) le cite |  |
| mer d'Irlande | 3 : Île de Man (territoire), Irlande, Royaume-Uni | — | — | — | — |  |
| golfe de Gascogne | 2 : Espagne, France | — | — | — | — |  |
| mer de Norvège | 4 : Îles Féroé (territoire), Islande, Norvège, Royaume-Uni | Îles Féroé (territoire), Islande, Royaume-Uni | — | — | — |  |
| mer du Groenland | 3 : Groenland (territoire), Islande, Norvège | Islande | Danemark | Danemark | — |  |
| mer des Caraïbes | 35 : Anguilla (territoire), Antigua-et-Barbuda, Aruba (territoire), Barbade, Base navale de la baie de Guantánamo (territoire), Belize, Colombie, Costa Rica, Cuba, Curaçao (territoire), Dominique, France, Grenade, Guatemala, Haïti, Honduras, Îles Caïmans (territoire), Îles Vierges britanniques (territoire), Îles Vierges des États-Unis (territoire), Jamaïque, Mexique, Montserrat (territoire), Nicaragua, Panama, Pays-Bas, Porto Rico (territoire), République dominicaine, Saint-Barthélemy (territoire), Saint-Christophe-et-Niévès, Saint-Martin (territoire), Saint-Martin (partie néerlandaise) (territoire), Saint-Vincent-et-les Grenadines, Sainte-Lucie, Trinité-et-Tobago, Venezuela | Anguilla (territoire), Barbade, Base navale de la baie de Guantánamo (territoire), Curaçao (territoire), Îles Vierges britanniques (territoire), Îles Vierges des États-Unis (territoire), Trinité-et-Tobago | États-Unis, Grenade, Royaume-Uni, Saint-Christophe-et-Niévès | États-Unis, Royaume-Uni | ajoute Aruba : Aruba est dans la mer des Caraïbes, au large du Venezuela ; la zone de Natural Earth, simplifiée, s'arrête à 29 km (Curaçao, voisine, y est) ; ajoute Antigua-et-Barbuda : Antigua-et-Barbuda borde la mer des Caraïbes à l'ouest (arc des Petites Antilles, limite de l'OHI) ; à 44 km de la zone de Natural Earth ; la Wikipédia en français (« Mer des Caraïbes », révision 240461779) la cite ; ajoute Saint-Vincent-et-les Grenadines : Saint-Vincent-et-les-Grenadines borde la mer des Caraïbes à l'ouest (arc des Petites Antilles) ; à 43 km de la zone de Natural Earth ; ajoute Îles Caïmans : les îles Caïmans sont au milieu de la mer des Caraïbes, au sud de Cuba ; à 193 km de la zone de Natural Earth, qui ne les entoure pas ; ajoute Montserrat : Montserrat borde la mer des Caraïbes à l'ouest (arc des Petites Antilles) ; à 56 km de la zone de Natural Earth ; ajoute Pays-Bas : les Pays-Bas caribéens (Bonaire, au large du Venezuela ; Saba et Saint-Eustache), dans le tracé des Pays-Bas chez Natural Earth ; à 42 km de la zone ; ajoute Saint-Martin : la côte sud de Saint-Martin (partie française) donne sur la mer des Caraïbes ; à 82 km de la zone de Natural Earth ; la Wikipédia en français (« Mer des Caraïbes », révision 240461779) cite Saint-Martin ; ajoute Saint-Martin (partie néerlandaise) : la côte sud de Sint Maarten donne sur la mer des Caraïbes ; à 85 km de la zone de Natural Earth ; ajoute Saint-Barthélemy : Saint-Barthélemy, à l'ouest de l'arc, donne sur la mer des Caraïbes ; à 112 km de la zone de Natural Earth ; la Wikipédia en français (« Mer des Caraïbes », révision 240461779) le cite | **à relire** : Pays-Bas, les Pays-Bas en riverain par Bonaire, comme la France par la Guadeloupe et la Martinique ; Saint-Martin, au nord de l'arc, la limite de l'OHI passe entre ces îles ; Saint-Martin (partie néerlandaise), même remarque que Saint-Martin ; Saint-Barthélemy, même remarque que Saint-Martin |
| mer des Sargasses | 0 : — | — | — | — | — |  |
| golfe du Mexique | 3 : Cuba, États-Unis, Mexique | — | — | — | — |  |
| golfe du Saint-Laurent | 2 : Canada, Saint-Pierre-et-Miquelon (territoire) | États-Unis, Saint-Pierre-et-Miquelon (territoire) | — | — | retire États-Unis : le fleuve Saint-Laurent, que la carte fond dans le golfe, borde l'État de New York ; le golfe lui-même ne touche pas les États-Unis (Wikipédia en français, « Golfe du Saint-Laurent », révision 240868651 : Canada et France) |  |
| golfe de Guinée | 10 : Bénin, Cameroun, Côte d’Ivoire, Gabon, Ghana, Guinée équatoriale, Liberia, Nigeria, Sao Tomé-et-Principe, Togo | — | — | — | — |  |
| baie de Baffin | 2 : Canada, Groenland (territoire) | — | — | — | — |  |
| baie d'Hudson | 1 : Canada | — | — | — | — |  |
| mer de Barents (avec mer Blanche) | 2 : Norvège, Russie | — | — | — | — |  |
| mer Blanche | 1 : Russie | — | — | — | — |  |
| mer de Kara | 1 : Russie | — | — | — | — |  |
| mer de Beaufort | 2 : Canada, États-Unis | — | — | — | — |  |
| mer de Béring | 2 : États-Unis, Russie | — | — | — | — |  |
| mer d'Okhotsk | 2 : Japon, Russie | — | — ; États disparus retirés : Empire russe, Union soviétique | — | — |  |
| mer du Japon | 4 : Corée du Nord, Corée du Sud, Japon, Russie | Chine | — | — | retire Chine : la Chine n'a pas de côte sur la mer du Japon : l'embouchure du Tumen, coréenne et russe, est à 15 km de son territoire (la Wikipédia en français, « Mer du Japon », révision 235467931, ne la cite pas) |  |
| mer Jaune | 3 : Chine, Corée du Nord, Corée du Sud | — | — | — | — |  |
| mer de Chine orientale | 4 : Chine, Corée du Sud, Japon, Taïwan (optionnel) | — | — | — | — |  |
| mer de Chine méridionale (avec golfe de Thaïlande) | 12 : Brunei, Cambodge, Chine, Hong Kong (territoire), Indonésie, Macao (territoire), Malaisie, Philippines, Singapour, Taïwan (optionnel), Thaïlande, Viêt Nam | Hong Kong (territoire), Macao (territoire), Singapour | — | — | — |  |
| golfe de Thaïlande | 4 : Cambodge, Malaisie, Thaïlande, Viêt Nam | — | — | — | — |  |
| mer de Corail | 5 : Australie, Îles Salomon, Nouvelle-Calédonie (territoire), Papouasie-Nouvelle-Guinée, Vanuatu | Nouvelle-Calédonie (territoire) | France | France | — |  |
| golfe de Californie | 1 : Mexique | — | — | — | — |  |
| mer d'Arabie | 7 : Inde, Iran, Maldives, Oman, Pakistan, Somalie, Yémen | Yémen | — ; États disparus retirés : République démocratique populaire du Yémen | — | — |  |
| golfe d'Oman | 4 : Émirats arabes unis, Iran, Oman, Pakistan | — | Pakistan | — | — |  |
| golfe Persique | 8 : Arabie saoudite, Bahreïn, Émirats arabes unis, Irak, Iran, Koweït, Oman, Qatar | — | — | — | — |  |
| golfe d'Aden | 4 : Djibouti, Somalie, Somaliland (statut contesté), Yémen | Somaliland (statut contesté) | — | — | — |  |
| mer Rouge | 8 : Arabie saoudite, Djibouti, Égypte, Érythrée, Israël, Jordanie, Soudan, Yémen | — | — | — | — |  |
| golfe du Bengale | 5 : Bangladesh, Inde, Indonésie, Myanmar (Birmanie), Sri Lanka | — | — | — | — |  |
| mer d'Andaman | 5 : Inde, Indonésie, Malaisie, Myanmar (Birmanie), Thaïlande | — | — | — | — |  |
| canal du Mozambique | 5 : Comores, France, Madagascar, Mozambique, Terres australes françaises (territoire) | France, Terres australes françaises (territoire) | — | — | — |  |


Items de Wikidata qui ne sont pas ceux d'une entité de la carte :

| Item | Nom dans Wikidata | Ce qu'en fait le build | Raison |
|---|---|---|---|
| Q15180 | Union soviétique | État disparu (1991) | règle : un État disparu (P576) est retiré |
| Q34266 | Empire russe | État disparu (1917) | règle : un État disparu (P576) est retiré |
| Q199841 | République démocratique populaire du Yémen | État disparu (1990) | règle : un État disparu (P576) est retiré |
| Q756617 | royaume de Danemark | rapporté à Danemark | le royaume de Danemark (avec le Groenland et les Féroé), cité pour la mer du Groenland : rapporté au Danemark ; le Groenland, riverain par le tracé, le retire ensuite d'office |
| Q31354462 | Abkhazie | ignoré | l'Abkhazie n'est pas une entité de la carte (elle est dans le tracé de la Géorgie, déjà riveraine de la mer Noire) |


## 2. Superficies (clé `superficie_mers`)

**Dans la fiche : tue** tant que `superficie_mers` est à `false` dans `src/fiches/relues.ts`.

Règle : la valeur de Wikidata (le rang préféré ; sinon, s'il y en a plusieurs, la plus proche du tracé) ; si elle s'écarte de plus de 25 % de la superficie du tracé (la zone dessinée sur la carte, sous-mers comprises), une ligne de la table la remplace, avec sa source ; sans valeur dans Wikidata, le tracé. Les océans n'ont pas de valeur unique (leurs limites varient) : une ligne chacun, d'après une même source. La fiche arrondit à trois chiffres : « environ 2,5 millions de km² ».

| Mer | Affichée | Source | Wikidata (km²) | Tracé (km²) | Écart | Raison | À relire |
|---|---|---|---|---|---|---|---|
| océan Atlantique (océan) | environ 85,1 millions de km² | NOAA (table) | 106 460 000 | 85 742 801 | + 24 % | NOAA, Eakins et Sharman (2010), « Volumes of the World's Oceans from ETOPO1 », tableau 1 (page archivée le 30/12/2020) : 85 133 000 km² (mers bordières comprises, la Méditerranée et la Baltique comptées à part) ; Wikidata 106 460 000, la Wikipédia en français 82 400 000 : les limites varient d'une source à l'autre | **à relire** : une seule source pour les cinq océans, celle que cite la Wikipédia en anglais (« Ocean ») ; ses limites suivent l'OHI (1953) modifiées, l'océan Austral au sud de 60° S |
| océan Pacifique (océan) | environ 162 millions de km² | NOAA (table) | 161 760 000 | 166 801 177 | − 3 % | NOAA, Eakins et Sharman (2010), « Volumes of the World's Oceans from ETOPO1 », tableau 1 (page archivée le 30/12/2020) : 161 760 000 km², la valeur de Wikidata |  |
| océan Indien (océan) | environ 70,6 millions de km² | NOAA (table) | 70 560 000 | 74 278 993 | − 5 % | NOAA, Eakins et Sharman (2010), « Volumes of the World's Oceans from ETOPO1 », tableau 1 (page archivée le 30/12/2020) : 70 560 000 km², la valeur de Wikidata et de la Wikipédia en français |  |
| océan Arctique (océan) | environ 15,6 millions de km² | NOAA (table) | 14 056 000 | 11 489 379 | + 22 % | NOAA, Eakins et Sharman (2010), « Volumes of the World's Oceans from ETOPO1 », tableau 1 (page archivée le 30/12/2020) : 15 558 000 km² ; Wikidata 14 056 000, la Wikipédia en français 5 200 000 (le bassin profond seul) |  |
| océan Austral (océan) | environ 22 millions de km² | NOAA (table) | 20 327 000 | 20 733 099 | − 2 % | NOAA, Eakins et Sharman (2010), « Volumes of the World's Oceans from ETOPO1 », tableau 1 (page archivée le 30/12/2020) : 21 960 000 km² (au sud de 60° S) ; Wikidata 20 327 000 |  |
| mer Méditerranée | environ 2,5 millions de km² | Wikidata | 2 500 000 | 2 532 289 | − 1 % | règle |  |
| mer Adriatique | environ 139 000 km² | Wikidata | 138 595 (celle de la règle : préférée) ; 132 000 | 140 702 | − 1 % | plusieurs valeurs dans Wikidata : préférée |  |
| mer Égée | environ 214 000 km² | Wikidata | 214 000 | 193 629 | + 11 % | règle |  |
| mer Ionienne | environ 172 000 km² | tracé de Natural Earth | aucune | 171 863 | — | aucune valeur dans Wikidata : le tracé | **à relire** : le tracé, faute de source |
| mer Tyrrhénienne | environ 275 000 km² | Wikipédia (table) | 275 000 | 217 121 | + 27 % | Wikidata 275 000 km², à 27 % du tracé (217 121 km² : la partition de Natural Earth en laisse une part à la Méditerranée) ; confirmé par Wikipédia en anglais, « Tyrrhenian Sea », révision 1370977544 (275 000 km²) ; la Wikipédia en français ne donne pas de superficie |  |
| mer Noire | environ 436 000 km² | Wikidata | 436 402 | 458 895 | − 5 % | règle |  |
| mer d'Azov | environ 37 600 km² | Wikidata | 37 600 | 37 474 | + 0 % | règle |  |
| mer Caspienne | environ 386 000 km² | Wikidata | 386 400 | 395 681 | − 2 % | règle |  |
| mer Baltique | environ 377 000 km² | Wikidata | 377 000 | 398 826 | − 5 % | règle |  |
| golfe de Botnie | environ 117 000 km² | Wikidata | 117 000 | 119 442 | − 2 % | règle |  |
| golfe de Finlande | environ 29 500 km² | Wikidata | 29 500 | 30 217 | − 2 % | règle |  |
| mer du Nord | environ 570 000 km² | Wikidata | 570 000 | 561 899 | + 1 % | règle |  |
| Manche | environ 75 000 km² | Wikidata | 75 000 | 96 394 | − 22 % | règle |  |
| mer d'Irlande | environ 46 000 km² | Wikipédia (table) | 100 000 | 50 690 | + 97 % | Wikidata 100 000 km², à 97 % du tracé (50 690 km²) ; Wikipédia en français, « Mer d'Irlande », révision 239983908 : 46 007 km² |  |
| golfe de Gascogne | environ 223 000 km² | Wikidata | 223 000 | 215 610 | + 3 % | règle |  |
| mer de Norvège | environ 1,38 million de km² | Wikidata | 1 383 000 | 1 553 816 | − 11 % | règle |  |
| mer du Groenland | environ 1,21 million de km² | Wikidata | 1 205 000 | 1 187 058 | + 2 % | règle |  |
| mer des Caraïbes | environ 2,75 millions de km² | Wikidata | 2 754 000 | 2 867 974 | − 4 % | règle |  |
| mer des Sargasses | environ 3 millions de km² | Wikipédia (table) | 5 179 976 | 3 013 163 | + 72 % | Wikidata 2 000 000 mi² (5 180 000 km²), à 72 % du tracé (3 013 163 km²) ; Wikipédia en français, « Mer des Sargasses », révision 241137264 : 3 000 000 km² | **à relire** : la mer des Sargasses n'a pas de côte ni de limite fixe (elle suit les courants) : les sources vont de 2 à 5 millions de km² ; le chiffre retenu est celui de la Wikipédia en français, proche de la zone dessinée sur la carte |
| golfe du Mexique | environ 1,55 million de km² | Wikidata | 1 550 000 | 1 566 770 | − 1 % | règle |  |
| golfe du Saint-Laurent | environ 226 000 km² | Wikidata | 226 000 | 281 164 | − 20 % | règle |  |
| golfe de Guinée | environ 728 000 km² | tracé de Natural Earth | aucune | 727 958 | — | aucune valeur dans Wikidata : le tracé | **à relire** : le tracé, faute de source |
| baie de Baffin | environ 689 000 km² | Wikipédia (table) | 689 000 | 498 449 | + 38 % | Wikidata 689 000 km², à 38 % du tracé (498 449 km²) ; confirmé par Wikipédia en anglais, « Baffin Bay », révision 1371362930 (689 000 km²) ; la Wikipédia en français ne donne pas de superficie | **à relire** : la zone dessinée (Natural Earth) est plus petite que la baie des sources : le chiffre publié est gardé |
| baie d'Hudson | environ 822 000 km² | Wikipédia (table) | 1 243 000 | 838 845 | + 48 % | Wikidata 1 243 000 km² (la baie avec la baie James et le bassin de Foxe), à 48 % du tracé (838 845 km²) ; Wikipédia en français, « Baie d'Hudson », révision 240946791 : 822 324 km², la baie seule, comme sur la carte |  |
| mer de Barents | environ 1,42 million de km² | Wikidata | 1 424 000 | 1 469 664 | − 3 % | règle |  |
| mer Blanche | environ 90 800 km² | Wikidata | 90 800 | 91 580 | − 1 % | règle |  |
| mer de Kara | environ 880 000 km² | Wikidata | 880 000 | 876 016 | + 0 % | règle |  |
| mer de Beaufort | environ 450 000 km² | Wikipédia (table) | 178 000 | 436 830 | − 59 % | Wikidata 178 000 km², à 59 % du tracé (436 830 km²) ; Wikipédia en français, « Mer de Beaufort », révision 236766665 : 450 000 km² |  |
| mer de Béring | environ 2,3 millions de km² | Wikidata | 2 300 000 | 2 438 358 | − 6 % | règle |  |
| mer d'Okhotsk | environ 1,58 million de km² | Wikidata | 1 583 000 | 1 620 583 | − 2 % | règle |  |
| mer du Japon | environ 1,05 million de km² | Wikidata | 1 048 950 (celle de la règle : la plus proche du tracé) ; 978 000 | 1 066 902 | − 2 % | plusieurs valeurs dans Wikidata : la plus proche du tracé |  |
| mer Jaune | environ 380 000 km² | Wikidata | 380 000 | 455 035 | − 16 % | règle |  |
| mer de Chine orientale | environ 750 000 km² | Wikipédia (table) | 1 249 000 (celle de la règle : préférée) ; 750 000 | 741 112 | + 69 % | Wikidata 1 249 000 km² au rang préféré (750 000 au rang normal), à 69 % du tracé (741 112 km²) ; Wikipédia en français, « Mer de Chine orientale », révision 241159149 : 750 000 km² |  |
| mer de Chine méridionale | environ 3,5 millions de km² | Wikidata | 3 500 000 | 3 652 124 | − 4 % | règle |  |
| golfe de Thaïlande | environ 320 000 km² | Wikidata | 320 000 | 299 850 | + 7 % | règle |  |
| mer de Corail | environ 4,79 millions de km² | Wikidata | 4 791 000 | 4 022 681 | + 19 % | règle |  |
| golfe de Californie | environ 160 000 km² | Wikidata | 160 000 | 172 127 | − 7 % | règle |  |
| mer d'Arabie | environ 3,86 millions de km² | Wikidata | 3 862 000 | 4 182 310 | − 8 % | règle |  |
| golfe d'Oman | environ 109 000 km² | tracé de Natural Earth | aucune | 108 866 | — | aucune valeur dans Wikidata : le tracé | **à relire** : le tracé, faute de source |
| golfe Persique | environ 251 000 km² | Wikidata | 251 000 | 243 853 | + 3 % | règle |  |
| golfe d'Aden | environ 262 000 km² | Wikipédia (table) | 530 000 | 259 439 | + 104 % | Wikidata 530 000 km², à 104 % du tracé (259 439 km²) ; Wikipédia en français, « Golfe d'Aden », révision 239070473 : 262 000 km² |  |
| mer Rouge | environ 446 000 km² | Wikidata | 445 816 (celle de la règle : préférée) ; 438 000 | 461 404 | − 3 % | plusieurs valeurs dans Wikidata : préférée |  |
| golfe du Bengale | environ 2,17 millions de km² | Wikidata | 2 172 000 | 2 044 424 | + 6 % | règle |  |
| mer d'Andaman | environ 798 000 km² | Wikidata | 798 000 | 850 217 | − 6 % | règle |  |
| canal du Mozambique | environ 1,38 million de km² | tracé de Natural Earth | aucune | 1 377 551 | — | aucune valeur dans Wikidata : le tracé | **à relire** : le tracé, faute de source |


## 3. Profondeurs maximales (clé `profondeur_mers`)

**Dans la fiche : tue** tant que `profondeur_mers` est à `false` dans `src/fiches/relues.ts`.

Règle : la valeur de Wikidata qualifiée « maximum » ; sinon, les moyennes écartées, la seule valeur. Plusieurs valeurs sans qualificatif, ou aucune : une ligne de la table. Les lignes « vérifier » gardent la valeur de Wikidata et disent l'écart à une autre source.

| Mer | Affichée (m) | Source | Valeurs de Wikidata (critère) | Comment | Raison | À relire |
|---|---|---|---|---|---|---|
| océan Atlantique | 8 605 | Wikidata | 8 605 (maximum) ; 3 646 (moyenne) | règle : maximum | — |  |
| océan Pacifique | 11 034 | Wikidata | 4 280 (moyenne) ; 11 034 (maximum) | règle : maximum | — |  |
| océan Indien | 7 450 | Wikidata | 3 711 (moyenne) ; 7 450 (maximum) | règle : maximum | — |  |
| océan Arctique | 5 550 | Wikidata | 5 550 (maximum) ; 1 038 (moyenne) | règle : maximum | — |  |
| océan Austral | 7 235 | Wikidata | 7 235 (sans qualificatif) ; 7 235 (sans qualificatif) | règle : seule | — |  |
| mer Méditerranée | 5 267 | Wikidata | 5 267 (maximum) ; 1 541 (moyenne) | règle : maximum | — |  |
| mer Adriatique | 1 233 | Wikidata | 1 233 (sans qualificatif) | règle : seule | — |  |
| mer Égée | 2 100 | Wikidata | 2 100 (sans qualificatif) | règle : seule | Wikidata 2 100 m ; la Wikipédia en anglais (« Aegean Sea », révision 1382038023) : 2 639 m, d'après EMODnet ; écart de plus de 5 % à la Wikipédia en anglais (contrôle du 18/11/2026) | **à relire** |
| mer Ionienne | 5 267 | Wikidata | 5 267 (sans qualificatif) | règle : seule | — |  |
| mer Tyrrhénienne | 3 785 | Wikidata | 2 000 (moyenne) ; 3 785 (maximum) | règle : maximum | — |  |
| mer Noire | 2 206 | Wikidata | 2 206 (sans qualificatif) | règle : seule | — |  |
| mer d'Azov | 14,5 | Wikidata | 14,5 (sans qualificatif) | règle : seule | Wikidata 14,5 m ; la Wikipédia en anglais (« Sea of Azov », révision 1369243023) 14 m, la Wikipédia en français 18 m (sans source) ; écart de plus de 5 % entre les sources (R4, et contrôle du 18/11/2026) | **à relire** |
| mer Caspienne | 1 025 | Wikidata | 1 025 (maximum) ; 211 (moyenne) | règle : maximum | — |  |
| mer Baltique | 459 | Wikidata | 459 (maximum) ; 57 (moyenne) | règle : maximum | — |  |
| golfe de Botnie | 295 | Wikidata | 295 (sans qualificatif) | règle : seule | — |  |
| golfe de Finlande | 121 | Wikidata | 121 (sans qualificatif) | règle : seule | Wikidata 121 m ; la Wikipédia en anglais (« Gulf of Finland », révision 1385974739) : 115 m ; écart de plus de 5 % à la Wikipédia en anglais (contrôle du 18/11/2026) | **à relire** |
| mer du Nord | 700 | Wikidata | 700 (maximum) | règle : maximum | — |  |
| Manche | 180 | Wikidata | 180 (sans qualificatif) | règle : seule | — |  |
| mer d'Irlande | 262 | Wikidata | 262 (sans qualificatif) | règle : seule | — |  |
| golfe de Gascogne | 4 735 | Wikidata | 4 735 (sans qualificatif) | règle : seule | — |  |
| mer de Norvège | 3 970 | Wikidata | 3 970 (sans qualificatif) | règle : seule | — |  |
| mer du Groenland | 4 846 | Wikipédia (table) | 4 800 (sans qualificatif) ; 5 600 (sans qualificatif) | table | Wikidata donne 4 800 et 5 600 m sans qualificatif ; Wikipédia en anglais, « Greenland Sea », révision 1382700651 : 4 846 m au plus profond de la mer (5 570 m dans la fosse Molloy, au détroit de Fram, hors de la mer) ; la Wikipédia en français : 4 800 m |  |
| mer des Caraïbes | 7 686 | Wikidata | 7 686 (sans qualificatif) | règle : seule | — |  |
| mer des Sargasses | 7 000 | Wikipédia (table) | 7 000 (sans qualificatif) ; 1 500 (sans qualificatif) | table | Wikidata donne 7 000 et 1 500 m sans qualificatif ; Wikipédia en français, « Mer des Sargasses », révision 241137264 : 7 000 m | **à relire** : une mer sans limite fixe : sa profondeur est celle du fond de l'Atlantique sous elle ; la seconde valeur de Wikidata (1 500 m) n'est pas sourcée |
| golfe du Mexique | 4 384 | Wikidata | 4 384 (sans qualificatif) | règle : seule | — |  |
| golfe du Saint-Laurent | 530 | Wikidata | 530 (sans qualificatif) | règle : seule | — |  |
| golfe de Guinée | 5 000 | Wikidata | 5 000 (sans qualificatif) | règle : seule | Wikidata 5 000 m ; la Wikipédia en français (« Golfe de Guinée », révision 241409503) : 6 363 m au large du Ghana ; écart de plus de 5 % entre les sources (R4) ; les limites du golfe varient | **à relire** |
| baie de Baffin | 2 136 | Wikidata | 2 136 (sans qualificatif) | règle : seule | — |  |
| baie d'Hudson | 257 | Wikidata | 257 (sans qualificatif) | règle : seule | — |  |
| mer de Barents | 600 | Wikidata | 600 (maximum) ; 230 (moyenne) | règle : maximum | — |  |
| mer Blanche | 330 | Wikidata | 330 (sans qualificatif) | règle : seule | — |  |
| mer de Kara | 620 | Wikidata | 620 (sans qualificatif) | règle : seule | — |  |
| mer de Beaufort | 4 683 | Wikidata | 4 683 (maximum) ; 1 004 (moyenne) | règle : maximum | — |  |
| mer de Béring | 4 191 | Wikidata | 4 191 (sans qualificatif) | règle : seule | — |  |
| mer d'Okhotsk | 3 374 | Wikidata | 3 374 (sans qualificatif) | règle : seule | — |  |
| mer du Japon | 3 742 | Wikidata | 3 742 (sans qualificatif) | règle : seule | — |  |
| mer Jaune | 152 | Wikidata | 152 (sans qualificatif) | règle : seule | — |  |
| mer de Chine orientale | 2 719 | Wikidata | 2 719 (sans qualificatif) | règle : seule | — |  |
| mer de Chine méridionale | 5 559 | Wikidata | 5 559 (sans qualificatif) | règle : seule | — |  |
| golfe de Thaïlande | 80 | Wikidata | 80 (sans qualificatif) | règle : seule | Wikidata 80 m ; la Wikipédia en anglais (« Gulf of Thailand », révision 1384262308) : 85 m ; écart de plus de 5 % à la Wikipédia en anglais (contrôle du 18/11/2026) | **à relire** |
| mer de Corail | 9 175 | Wikidata | 9 175 (sans qualificatif) | règle : seule | — |  |
| golfe de Californie | — | — | aucune | pas de ligne de profondeur | aucune profondeur dans Wikidata ni dans l'infobox de la Wikipédia en français ; Wikipédia en anglais, « Gulf of California », révision 1379374452 dit seulement « plus de 3 000 m » | **à relire** : une source qui donne la profondeur maximale du golfe (le bassin de Pescadero, ≈ 3 700 m, n'est pas sourcé ici) |
| mer d'Arabie | 5 800 | Wikidata | 5 800 (sans qualificatif) | règle : seule | Wikidata 5 800 m ; la Wikipédia en anglais (« Arabian Sea », révision 1384467206) : 4 652 m ; la Wikipédia en français : 5 800 m ; écart de plus de 5 % à la Wikipédia en anglais (contrôle du 18/11/2026) | **à relire** |
| golfe d'Oman | 3 700 | Wikipédia (table) | 200 (sans qualificatif) | table | Wikidata 200 m, sans qualificatif ni source : sans doute la profondeur moyenne (le golfe dépasse 3 000 m au large de l'Oman) ; Wikipédia en anglais, « Gulf of Oman », révision 1370175502 : 3 700 m | **à relire** : une seule source ; la Wikipédia en français ne donne pas de profondeur |
| golfe Persique | 90 | Wikidata | 90 (sans qualificatif) | règle : seule | — |  |
| golfe d'Aden | 2 700 | Wikidata | 2 700 (sans qualificatif) | règle : seule | — |  |
| mer Rouge | 3 040 | Wikidata | 3 040 (sans qualificatif) | règle : seule | Wikidata 3 040 m ; la Wikipédia en anglais (« Red Sea », révision 1386060551) : 2 730 m ; la Wikipédia en français : 3 040 m ; écart de plus de 5 % à la Wikipédia en anglais (contrôle du 18/11/2026) | **à relire** |
| golfe du Bengale | 4 694 | Wikidata | 4 694 (sans qualificatif) | règle : seule | — |  |
| mer d'Andaman | 3 777 | Wikidata | 3 777 (sans qualificatif) | règle : seule | Wikidata 3 777 m ; la Wikipédia en anglais (« Andaman Sea », révision 1377184977) : 4 198 m ; la Wikipédia en français : 3 777 m ; écart de plus de 5 % à la Wikipédia en anglais (contrôle du 18/11/2026) | **à relire** |
| canal du Mozambique | 3 292 | Wikidata | 3 292 (sans qualificatif) | règle : seule | — |  |
