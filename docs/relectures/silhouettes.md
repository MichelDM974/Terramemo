# Silhouettes du J4 : la liste et les formes proches à relire

*Écrit par `npm run silhouettes` (`geodata/silhouettes.mjs`) avec `public/geo/silhouettes.json` et la planche `docs/relectures/silhouettes-planche.svg` : ne pas éditer ce fichier, il est refait à chaque passage. Ticket #6, lot 1 ; étude `docs/etudes/2026-11-25-j4-conception.md`, § 6 (D618, D620, D621 ; S606, S610, S613).*

Le sujet Silhouettes est codé mais **caché** (`SILHOUETTES_RELUES = false`, `src/visibles.ts`) : ni dans Jouer, ni dans la mémoire, ni dans les épreuves, ni au quiz, et rien ne s'écrit au journal. Raison : un id de fiche (`silhouettes:FRA:nommer`) écrit au journal ne s'efface plus ; une silhouette retirée après coup laisserait des fiches orphelines. Une fois la liste validée, un seul commit la montre partout (`SILHOUETTES_RELUES = true`) ; les règles Firestore acceptent déjà ses épreuves. Pour la voir avant : le serveur de développement avec `?silhouettes` dans l'adresse (jamais au build), ou le pilote (`driver.py silhouettes`).

## Ce que tu as à trancher

1. **La liste (D618).** 166 pays ont une silhouette (tableau 1), 29 n'en ont pas (tableau 2) : les micro-États, ceux dont le plus grand morceau fait moins de 2 000 km² (`micro: true` de `pays.json`). D'où le Cap-Vert, Samoa et Maurice exclus, le Luxembourg (2 600 km² d'un seul tenant) gardé. Les dessins de la planche (première partie : les 166 ; deuxième : les 29, dessinés quand même) montrent ce que donnerait chacun. Recommandation de l'étude : **garder ce critère (D618 a)**. Autres choix : sans les 5 archipels restants, Bahamas, Indonésie, Philippines, Salomon, Vanuatu (D618 b, 161 pays) ; les 195 (D618 c) ; ou une liste à la main.
2. **Les parties lointaines retirées** (une règle de ce lot, que l'étude ne disait pas). Chaque silhouette est dessinée à sa propre échelle (D620 a) : une île lointaine gardée réduirait le pays à un point dans un cadre vide. 20 pays perdent des parties (tableau 1, colonne « Parties retirées » ; marqués * sur la planche) : la Guyane, les Antilles, La Réunion et Mayotte pour la France ; Hawaï pour les États-Unis ; les Galápagos ; les Açores et Madère ; les Canaries ; les îles Andaman-et-Nicobar ; l'île de Pâques… L'Alaska reste aux États-Unis, le Svalbard à la Norvège, la Corse à la France, Okinawa au Japon. La règle : sont gardés le plus grand morceau et toute partie d'au moins 25 % de lui ; puis, de proche en proche, toute partie à moins de 500 km d'une partie gardée (moins pour un petit pays : 2,5 fois le rayon d'un disque de sa superficie ; plus pour une grande partie : deux fois son propre rayon). D'accord avec ce qui est retiré ?
3. **La Crimée (S606).** Le tracé de fait de Natural Earth, celui de la carte, met la Crimée dans la Russie, en zone contestée hachurée : la silhouette de l'Ukraine est sans la Crimée, celle de la Russie l'a, hachurée. De même pour toute zone contestée : hachurée sur la silhouette de qui la tient (le Sahara occidental tenu par le Maroc, l'Aksai Chin par la Chine…). La silhouette ne tranche rien de plus que la carte. D'accord ?
4. **Les formes proches (D621, S610).** 141 paires de recouvrement au moins 0,7 (tableau 3 ; troisième partie de la planche, côte à côte) : les leurres du quiz difficile et expert, complétés par les voisins. Le recouvrement : les deux silhouettes dessinées en 64 × 64 pixels, centrées, chacune à son échelle, puis la part commune (intersection sur union). Aucune paire ne dépasse 0,8 : des formes « en bloc » proches (Allemagne et Eswatini, Cambodge et Nigeria) plutôt que des sosies. Ces paires te paraissent-elles proches à l'œil ? Un autre seuil ?

## Comment corriger

- La liste : `SANS_SILHOUETTE` de `src/srs/fiches.ts` (figée à la main ; `tests/donnees-silhouettes.test.ts` la confronte à `pays.json`), puis les tailles des épreuves (`TAILLES_SILHOUETTES` de `src/epreuve/chrono.ts`, la carte `silhouettes` de `tailles(cle)` dans `firestore.rules`, `BORNE_GENERAL`), et `npm run silhouettes`.
- Les parties retirées : `ECART_KM`, `FACTEUR_ECART` et `PART_GRANDE` de `geodata/silhouettes.mjs`, puis `npm run silhouettes` ; une exception pour un pays se met dans la même fonction (`partiesRetirees`).
- Les formes proches : `SEUIL` de `geodata/silhouettes.mjs`, puis `npm run silhouettes`.

## 1. Les 166 silhouettes

Sommets : ceux du tracé de la carte (~2 km), parties retirées exclues ; l'appli en dessine moins (simplifié à ~1 pixel). La règle de chaque ligne : « gardé » (plus grand morceau d'au moins 2 000 km²), et ses parties retirées s'il en a.

| Pays | Id | Continent | Superficie (km²) | Plus grand morceau (km²) | Sommets | Parties retirées | Règle |
|---|---|---|---|---|---|---|---|
| Afghanistan | AFG | Asie | 642 393 | 642 393 | 414 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Afrique du Sud | ZAF | Afrique | 1 221 448 | 1 221 129 | 566 | 2, 279 km² (la plus grande : 258 km², vers 38° E, 47° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Albanie | ALB | Europe | 28 298 | 28 298 | 108 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Algérie | DZA | Afrique | 2 312 302 | 2 312 302 | 355 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Allemagne | DEU | Europe | 356 379 | 354 421 | 575 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Angola | AGO | Afrique | 1 249 442 | 1 242 626 | 439 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Arabie saoudite | SAU | Asie | 1 926 007 | 1 925 083 | 488 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Argentine | ARG | Amérique du Sud | 2 783 122 | 2 761 550 | 1 203 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Arménie | ARM | Asie | 29 555 | 29 520 | 130 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Australie | AUS | Océanie | 7 705 929 | 7 613 494 | 3 239 | 2, 132 km² (la plus grande : 122 km², vers 159° E, 55° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Autriche | AUT | Europe | 83 756 | 83 756 | 210 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Azerbaïdjan | AZE | Asie | 86 153 | 81 298 | 264 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Bahamas | BHS | Amérique du Nord | 12 632 | 3 582 | 446 | 2, 1 km² (la plus grande : 1 km², vers 80° O, 24° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Bangladesh | BGD | Asie | 137 217 | 134 080 | 557 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Belgique | BEL | Europe | 30 562 | 30 562 | 112 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Belize | BLZ | Amérique du Nord | 22 373 | 22 083 | 113 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Bénin | BEN | Afrique | 116 590 | 116 590 | 156 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Bhoutan | BTN | Asie | 40 488 | 40 488 | 104 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Biélorussie | BLR | Europe | 206 632 | 206 632 | 268 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Bolivie | BOL | Amérique du Sud | 1 090 457 | 1 090 457 | 411 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Bosnie-Herzégovine | BIH | Europe | 51 721 | 51 721 | 122 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Botswana | BWA | Afrique | 580 515 | 580 515 | 255 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Brésil | BRA | Amérique du Sud | 8 504 958 | 8 450 178 | 2 608 | 3, 33 km² (la plus grande : 29 km², vers 29° O, 1° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Brunei | BRN | Asie | 5 742 | 4 437 | 53 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Bulgarie | BGR | Europe | 112 569 | 112 569 | 171 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Burkina Faso | BFA | Afrique | 273 827 | 273 827 | 262 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Burundi | BDI | Afrique | 27 161 | 27 161 | 81 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Cambodge | KHM | Asie | 181 754 | 181 491 | 264 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Cameroun | CMR | Afrique | 466 332 | 466 332 | 389 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Canada | CAN | Amérique du Nord | 9 894 501 | 8 098 680 | 13 316 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Chili | CHL | Amérique du Sud | 736 362 | 648 412 | 3 710 | 6, 272 km² (la plus grande : 156 km², vers 109° O, 27° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Chine | CHN | Asie | 9 373 435 | 9 333 998 | 3 274 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Chypre | CYP | Asie | 5 396 | 5 198 | 62 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Colombie | COL | Amérique du Sud | 1 140 095 | 1 139 520 | 730 | 3, 16 km² (la plus grande : 8 km², vers 81° O, 13° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Congo-Brazzaville | COG | Afrique | 346 429 | 346 429 | 357 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Congo-Kinshasa | COD | Afrique | 2 335 423 | 2 335 304 | 753 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Corée du Nord | PRK | Asie | 122 246 | 122 087 | 345 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Corée du Sud | KOR | Asie | 98 522 | 93 694 | 566 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Costa Rica | CRI | Amérique du Nord | 51 360 | 51 302 | 173 | 1, 6 km² (la plus grande : 6 km², vers 87° O, 6° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Côte d’Ivoire | CIV | Afrique | 322 038 | 321 973 | 347 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Croatie | HRV | Europe | 54 900 | 51 375 | 425 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Cuba | CUB | Amérique du Nord | 110 222 | 106 026 | 585 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Danemark | DNK | Europe | 42 495 | 28 489 | 415 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Djibouti | DJI | Afrique | 21 934 | 21 934 | 59 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Égypte | EGY | Afrique | 1 002 870 | 1 002 681 | 360 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Émirats arabes unis | ARE | Asie | 71 247 | 70 529 | 194 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Équateur | ECU | Amérique du Sud | 256 155 | 247 273 | 278 | 12, 7 578 km² (la plus grande : 4 632 km², vers 91° O, 1° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Érythrée | ERI | Afrique | 122 972 | 122 196 | 241 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Espagne | ESP | Europe | 506 327 | 493 684 | 548 | 8, 7 430 km² (la plus grande : 2 004 km², vers 17° O, 28° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Estonie | EST | Europe | 45 576 | 41 403 | 212 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Eswatini | SWZ | Afrique | 17 143 | 17 143 | 34 | — | gardé : plus grand morceau ≥ 2 000 km² |
| États-Unis | USA | Amérique du Nord | 9 447 852 | 7 923 898 | 6 857 | 14, 16 843 km² (la plus grande : 10 569 km², vers 156° O, 20° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Éthiopie | ETH | Afrique | 1 132 068 | 1 132 068 | 309 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Fidji | FJI | Océanie | 18 992 | 10 929 | 322 | 2, 39 km² (la plus grande : 32 km², vers 177° E, 12° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Finlande | FIN | Europe | 330 938 | 329 278 | 603 | — | gardé : plus grand morceau ≥ 2 000 km² |
| France | FRA | Europe | 635 739 | 537 331 | 662 | 11, 89 181 km² (la plus grande : 83 557 km², vers 53° O, 4° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Gabon | GAB | Afrique | 261 134 | 261 007 | 358 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Gambie | GMB | Afrique | 10 540 | 10 540 | 91 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Géorgie | GEO | Asie | 69 462 | 69 462 | 159 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Ghana | GHA | Afrique | 239 676 | 239 676 | 218 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Grèce | GRC | Europe | 131 244 | 106 604 | 1 137 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Guatemala | GTM | Amérique du Nord | 109 192 | 109 192 | 110 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Guinée | GIN | Afrique | 245 290 | 245 290 | 368 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Guinée équatoriale | GNQ | Afrique | 26 791 | 24 782 | 63 | 1, 4 km² (la plus grande : 4 km², vers 6° E, 1° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Guinée-Bissau | GNB | Afrique | 32 958 | 31 479 | 232 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Guyana | GUY | Amérique du Sud | 212 139 | 212 076 | 272 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Haïti | HTI | Amérique du Nord | 26 974 | 26 018 | 162 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Honduras | HND | Amérique du Nord | 112 642 | 112 311 | 260 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Hongrie | HUN | Europe | 92 947 | 92 947 | 168 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Îles Salomon | SLB | Océanie | 27 312 | 5 369 | 446 | 9, 804 km² (la plus grande : 516 km², vers 166° E, 11° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Inde | IND | Asie | 3 158 319 | 3 150 667 | 1 799 | 18, 7 025 km² (la plus grande : 4 312 km², vers 93° E, 13° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Indonésie | IDN | Asie | 1 888 148 | 532 278 | 5 399 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Irak | IRQ | Asie | 437 586 | 437 586 | 214 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Iran | IRN | Asie | 1 623 489 | 1 621 652 | 701 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Irlande | IRL | Europe | 69 160 | 68 893 | 338 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Islande | ISL | Europe | 101 722 | 101 694 | 434 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Israël | ISR | Asie | 22 120 | 22 120 | 105 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Italie | ITA | Europe | 300 679 | 250 368 | 727 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Jamaïque | JAM | Amérique du Nord | 11 068 | 11 068 | 58 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Japon | JPN | Asie | 373 333 | 229 075 | 1 635 | 2, 3 km² (la plus grande : 3 km², vers 154° E, 24° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Jordanie | JOR | Asie | 88 941 | 88 941 | 76 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Kazakhstan | KAZ | Asie | 2 706 354 | 2 705 953 | 1 134 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Kenya | KEN | Afrique | 588 320 | 588 147 | 234 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Kirghizstan | KGZ | Asie | 198 713 | 198 713 | 361 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Koweït | KWT | Asie | 17 496 | 16 704 | 69 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Laos | LAO | Asie | 228 827 | 228 827 | 412 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Lesotho | LSO | Afrique | 30 143 | 30 143 | 75 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Lettonie | LVA | Europe | 64 259 | 64 259 | 136 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Liban | LBN | Asie | 10 007 | 10 007 | 58 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Liberia | LBR | Afrique | 95 710 | 95 710 | 164 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Libye | LBY | Afrique | 1 626 533 | 1 626 533 | 247 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Lituanie | LTU | Europe | 64 642 | 64 509 | 134 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Luxembourg | LUX | Europe | 2 600 | 2 600 | 24 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Macédoine du Nord | MKD | Europe | 25 349 | 25 349 | 69 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Madagascar | MDG | Afrique | 594 755 | 594 254 | 454 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Malaisie | MYS | Asie | 329 335 | 195 828 | 692 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Malawi | MWI | Afrique | 119 849 | 119 648 | 230 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Mali | MLI | Afrique | 1 256 813 | 1 256 813 | 410 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Maroc | MAR | Afrique | 592 431 | 592 431 | 357 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Mauritanie | MRT | Afrique | 1 039 357 | 1 039 136 | 257 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Mexique | MEX | Amérique du Nord | 1 962 245 | 1 956 546 | 1 525 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Moldavie | MDA | Europe | 33 116 | 33 116 | 142 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Mongolie | MNG | Asie | 1 560 538 | 1 560 538 | 531 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Monténégro | MNE | Europe | 13 704 | 13 704 | 75 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Mozambique | MOZ | Afrique | 791 023 | 790 726 | 606 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Myanmar (Birmanie) | MMR | Asie | 664 957 | 660 148 | 1 135 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Namibie | NAM | Afrique | 824 824 | 824 824 | 274 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Népal | NPL | Asie | 147 323 | 147 323 | 269 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Nicaragua | NIC | Amérique du Nord | 129 176 | 129 116 | 218 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Niger | NER | Afrique | 1 185 160 | 1 185 160 | 237 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Nigeria | NGA | Afrique | 911 220 | 910 923 | 470 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Norvège | NOR | Europe | 379 535 | 300 318 | 2 758 | 2, 504 km² (la plus grande : 463 km², vers 8° O, 71° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Nouvelle-Zélande | NZL | Océanie | 268 111 | 150 039 | 871 | 6, 935 km² (la plus grande : 783 km², vers 177° O, 44° S) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Oman | OMN | Asie | 312 090 | 309 680 | 262 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Ouganda | UGA | Afrique | 242 936 | 242 936 | 169 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Ouzbékistan | UZB | Asie | 447 179 | 446 721 | 442 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Pakistan | PAK | Asie | 873 936 | 873 900 | 603 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Palestine | PSE | Asie | 6 079 | 5 739 | 44 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Panama | PAN | Amérique du Nord | 74 843 | 73 687 | 351 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Papouasie-Nouvelle-Guinée | PNG | Océanie | 467 151 | 401 842 | 1 127 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Paraguay | PRY | Amérique du Sud | 400 858 | 400 858 | 265 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Pays-Bas | NLD | Europe | 37 254 | 35 541 | 190 | 3, 275 km² (la plus grande : 257 km², vers 68° O, 12° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Pérou | PER | Amérique du Sud | 1 295 127 | 1 295 067 | 658 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Philippines | PHL | Asie | 294 430 | 105 881 | 1 803 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Pologne | POL | Europe | 312 221 | 312 221 | 261 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Portugal | PRT | Europe | 91 303 | 87 866 | 212 | 14, 3 289 km² (la plus grande : 804 km², vers 25° O, 38° N) | gardé : plus grand morceau ≥ 2 000 km² ; parties lointaines retirées |
| Qatar | QAT | Asie | 11 173 | 11 173 | 56 | — | gardé : plus grand morceau ≥ 2 000 km² |
| République centrafricaine | CAF | Afrique | 620 644 | 620 644 | 427 | — | gardé : plus grand morceau ≥ 2 000 km² |
| République dominicaine | DOM | Amérique du Nord | 48 589 | 48 430 | 139 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Roumanie | ROU | Europe | 235 805 | 235 805 | 240 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Royaume-Uni | GBR | Europe | 242 737 | 217 696 | 1 146 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Russie | RUS | Europe | 16 886 313 | 16 440 161 | 8 814 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Rwanda | RWA | Afrique | 25 418 | 25 418 | 84 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Salvador | SLV | Amérique du Nord | 20 616 | 20 593 | 82 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Sénégal | SEN | Afrique | 196 942 | 196 942 | 309 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Serbie | SRB | Europe | 77 471 | 77 471 | 188 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Sierra Leone | SLE | Afrique | 71 912 | 71 288 | 145 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Slovaquie | SVK | Europe | 48 308 | 48 308 | 124 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Slovénie | SVN | Europe | 20 277 | 20 277 | 102 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Somalie | SOM | Afrique | 473 871 | 473 871 | 189 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Soudan | SDN | Afrique | 1 861 994 | 1 861 961 | 381 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Soudan du Sud | SSD | Afrique | 629 533 | 629 533 | 332 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Sri Lanka | LKA | Asie | 66 573 | 66 247 | 154 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Suède | SWE | Europe | 443 499 | 437 893 | 787 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Suisse | CHE | Europe | 41 326 | 41 326 | 152 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Suriname | SUR | Amérique du Sud | 145 764 | 145 764 | 175 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Syrie | SYR | Asie | 185 951 | 185 951 | 156 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Tadjikistan | TJK | Asie | 142 136 | 141 986 | 334 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Tanzanie | TZA | Afrique | 945 557 | 942 554 | 421 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Tchad | TCD | Afrique | 1 270 723 | 1 270 723 | 300 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Tchéquie | CZE | Europe | 78 497 | 78 497 | 180 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Thaïlande | THA | Asie | 516 276 | 514 337 | 814 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Timor oriental | TLS | Asie | 15 145 | 14 252 | 83 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Togo | TGO | Afrique | 57 102 | 57 102 | 129 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Trinité-et-Tobago | TTO | Amérique du Nord | 5 144 | 4 852 | 49 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Tunisie | TUN | Afrique | 156 653 | 155 998 | 221 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Turkménistan | TKM | Asie | 470 451 | 470 336 | 445 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Turquie | TUR | Asie | 779 426 | 755 608 | 719 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Ukraine | UKR | Europe | 570 179 | 570 004 | 609 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Uruguay | URY | Amérique du Sud | 177 440 | 177 440 | 164 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Vanuatu | VUT | Océanie | 12 339 | 4 093 | 247 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Venezuela | VEN | Amérique du Sud | 916 572 | 912 995 | 851 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Viêt Nam | VNM | Asie | 329 987 | 327 901 | 870 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Yémen | YEM | Asie | 454 650 | 450 511 | 280 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Zambie | ZMB | Afrique | 754 731 | 754 731 | 404 | — | gardé : plus grand morceau ≥ 2 000 km² |
| Zimbabwe | ZWE | Afrique | 390 529 | 390 529 | 218 | — | gardé : plus grand morceau ≥ 2 000 km² |

## 2. Les 29 pays sans silhouette

Du plus grand au plus petit. S613 : leurs sommets au tracé de la carte, à comparer à ceux des 10 plus petits gardés (Luxembourg 24, Bahamas 446, Vanuatu 247, Brunei 53, Trinité-et-Tobago 49, Chypre 62, Îles Salomon 446, Palestine 44, Liban 58, Gambie 91).

| Pays | Id | Superficie (km²) | Plus grand morceau (km²) | Sommets | Règle |
|---|---|---|---|---|---|
| Cap-Vert | CPV | 3 940 | 965 | 100 | exclu : plus grand morceau < 2 000 km² (micro) |
| Samoa | WSM | 2 791 | 1 652 | 33 | exclu : plus grand morceau < 2 000 km² (micro) |
| Maurice | MUS | 2 020 | 1 907 | 27 | exclu : plus grand morceau < 2 000 km² (micro) |
| Comores | COM | 1 679 | 1 029 | 34 | exclu : plus grand morceau < 2 000 km² (micro) |
| Sao Tomé-et-Principe | STP | 1 042 | 885 | 22 | exclu : plus grand morceau < 2 000 km² (micro) |
| Kiribati | KIR | 954 | 438 | 171 | exclu : plus grand morceau < 2 000 km² (micro) |
| Dominique | DMA | 733 | 733 | 11 | exclu : plus grand morceau < 2 000 km² (micro) |
| Bahreïn | BHR | 689 | 586 | 40 | exclu : plus grand morceau < 2 000 km² (micro) |
| Micronésie | FSM | 637 | 342 | 94 | exclu : plus grand morceau < 2 000 km² (micro) |
| Sainte-Lucie | LCA | 607 | 607 | 9 | exclu : plus grand morceau < 2 000 km² (micro) |
| Tonga | TON | 605 | 258 | 52 | exclu : plus grand morceau < 2 000 km² (micro) |
| Singapour | SGP | 513 | 513 | 8 | exclu : plus grand morceau < 2 000 km² (micro) |
| Palaos | PLW | 494 | 353 | 44 | exclu : plus grand morceau < 2 000 km² (micro) |
| Antigua-et-Barbuda | ATG | 453 | 283 | 22 | exclu : plus grand morceau < 2 000 km² (micro) |
| Andorre | AND | 452 | 452 | 12 | exclu : plus grand morceau < 2 000 km² (micro) |
| Barbade | BRB | 446 | 446 | 9 | exclu : plus grand morceau < 2 000 km² (micro) |
| Seychelles | SYC | 438 | 165 | 120 | exclu : plus grand morceau < 2 000 km² (micro) |
| Saint-Vincent-et-les Grenadines | VCT | 369 | 331 | 26 | exclu : plus grand morceau < 2 000 km² (micro) |
| Grenade | GRD | 349 | 314 | 14 | exclu : plus grand morceau < 2 000 km² (micro) |
| Malte | MLT | 326 | 261 | 12 | exclu : plus grand morceau < 2 000 km² (micro) |
| Saint-Christophe-et-Niévès | KNA | 265 | 176 | 14 | exclu : plus grand morceau < 2 000 km² (micro) |
| Îles Marshall | MHL | 166 | 41 | 101 | exclu : plus grand morceau < 2 000 km² (micro) |
| Liechtenstein | LIE | 137 | 137 | 8 | exclu : plus grand morceau < 2 000 km² (micro) |
| Maldives | MDV | 109 | 35 | 705 | exclu : plus grand morceau < 2 000 km² (micro) |
| Saint-Marin | SMR | 60 | 60 | 5 | exclu : plus grand morceau < 2 000 km² (micro) |
| Nauru | NRU | 29 | 29 | 4 | exclu : plus grand morceau < 2 000 km² (micro) |
| Tuvalu | TUV | 23 | 9 | 37 | exclu : plus grand morceau < 2 000 km² (micro) |
| Monaco | MCO | 19 | 19 | 4 | exclu : plus grand morceau < 2 000 km² (micro) |
| État de la Cité du Vatican | VAT | 0 | 0 | 4 | exclu : plus grand morceau < 2 000 km² (micro) |

## 3. Les 141 paires de formes proches

De la plus proche à la moins proche.

| Paire | Ids | Recouvrement | Règle |
|---|---|---|---|
| Allemagne et Eswatini | DEU, SWZ | 0,79 | recouvrement ≥ 0,7 en 64 × 64 |
| Cambodge et Nigeria | KHM, NGA | 0,79 | recouvrement ≥ 0,7 en 64 × 64 |
| Libye et Pologne | LBY, POL | 0,79 | recouvrement ≥ 0,7 en 64 × 64 |
| Pologne et Tanzanie | POL, TZA | 0,79 | recouvrement ≥ 0,7 en 64 × 64 |
| Sierra Leone et Suriname | SLE, SUR | 0,79 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Pologne | CIV, POL | 0,78 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Soudan | CIV, SDN | 0,78 | recouvrement ≥ 0,7 en 64 × 64 |
| Gabon et Lesotho | GAB, LSO | 0,78 | recouvrement ≥ 0,7 en 64 × 64 |
| Sierra Leone et Eswatini | SLE, SWZ | 0,78 | recouvrement ≥ 0,7 en 64 × 64 |
| Bulgarie et Hongrie | BGR, HUN | 0,77 | recouvrement ≥ 0,7 en 64 × 64 |
| Lesotho et Soudan | LSO, SDN | 0,77 | recouvrement ≥ 0,7 en 64 × 64 |
| Macédoine du Nord et Soudan | MKD, SDN | 0,77 | recouvrement ≥ 0,7 en 64 × 64 |
| Pologne et Suriname | POL, SUR | 0,77 | recouvrement ≥ 0,7 en 64 × 64 |
| Bolivie et Uruguay | BOL, URY | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Bhoutan et Tchéquie | BTN, CZE | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Djibouti et Ouganda | DJI, UGA | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Zimbabwe | DZA, ZWE | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Hongrie et Slovénie | HUN, SVN | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Sri Lanka et Luxembourg | LKA, LUX | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Lesotho et Macédoine du Nord | LSO, MKD | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Macédoine du Nord et Rwanda | MKD, RWA | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Pologne et Sierra Leone | POL, SLE | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Soudan et Ouganda | SDN, UGA | 0,76 | recouvrement ≥ 0,7 en 64 × 64 |
| Angola et Uruguay | AGO, URY | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Irak | DZA, IRQ | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Eswatini | DZA, SWZ | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Ghana et Tchad | GHA, TCD | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Cambodge et Macédoine du Nord | KHM, MKD | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Sri Lanka et Qatar | LKA, QAT | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Nigeria et Soudan | NGA, SDN | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Pologne et Zimbabwe | POL, ZWE | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Sierra Leone et Tanzanie | SLE, TZA | 0,75 | recouvrement ≥ 0,7 en 64 × 64 |
| Brésil et Lituanie | BRA, LTU | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Sierra Leone | CIV, SLE | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Suriname | CIV, SUR | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Sierra Leone | DZA, SLE | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Éthiopie et Roumanie | ETH, ROU | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Irak et Tanzanie | IRQ, TZA | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Lesotho et Rwanda | LSO, RWA | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Macédoine du Nord et Nigeria | MKD, NGA | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Mongolie et Turquie | MNG, TUR | 0,74 | recouvrement ≥ 0,7 en 64 × 64 |
| Burkina Faso et République centrafricaine | BFA, CAF | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Algérie | BLR, DZA | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Macédoine du Nord | BLR, MKD | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Mauritanie | BLR, MRT | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Nicaragua | BLR, NIC | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Botswana et Soudan | BWA, SDN | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Cambodge | CIV, KHM | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Lesotho | CIV, LSO | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Tanzanie | CIV, TZA | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Tchéquie et Salvador | CZE, SLV | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Allemagne et Tchad | DEU, TCD | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Équateur et Nigeria | ECU, NGA | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Gabon et Sierra Leone | GAB, SLE | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Gabon et Suriname | GAB, SUR | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Irak et Koweït | IRQ, KWT | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Kenya et Tanzanie | KEN, TZA | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Cambodge et Soudan | KHM, SDN | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Pologne et Soudan | POL, SDN | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Qatar et Tchad | QAT, TCD | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Soudan et Sierra Leone | SDN, SLE | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Tanzanie et Uruguay | TZA, URY | 0,73 | recouvrement ≥ 0,7 en 64 × 64 |
| Burkina Faso et Suisse | BFA, CHE | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Bolivie et Arabie saoudite | BOL, SAU | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Bhoutan et Suisse | BTN, CHE | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Botswana et Côte d’Ivoire | BWA, CIV | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Nigeria | CIV, NGA | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Ouganda | CIV, UGA | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Nicaragua | DZA, NIC | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Tanzanie | DZA, TZA | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Éthiopie et Arabie saoudite | ETH, SAU | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Gabon et Macédoine du Nord | GAB, MKD | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Iran et Tanzanie | IRN, TZA | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Irak et Eswatini | IRQ, SWZ | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Kenya et Eswatini | KEN, SWZ | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Cambodge et Lesotho | KHM, LSO | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Lesotho et Nigeria | LSO, NGA | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Lesotho et Ouganda | LSO, UGA | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Nigeria et Syrie | NGA, SYR | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Nicaragua et Eswatini | NIC, SWZ | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Roumanie et Sénégal | ROU, SEN | 0,72 | recouvrement ≥ 0,7 en 64 × 64 |
| Belgique et Lituanie | BEL, LTU | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Bulgarie et Slovénie | BGR, SVN | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Bosnie-Herzégovine et Lituanie | BIH, LTU | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Soudan | BLR, SDN | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Bolivie et Éthiopie | BOL, ETH | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Eswatini | CIV, SWZ | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Uruguay | CIV, URY | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Congo-Kinshasa et Algérie | COD, DZA | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Congo-Kinshasa et Koweït | COD, KWT | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Congo-Kinshasa et Zimbabwe | COD, ZWE | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Allemagne et Ghana | DEU, GHA | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Pologne | DZA, POL | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Équateur et Lesotho | ECU, LSO | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Équateur et Monténégro | ECU, MNE | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Équateur et Soudan | ECU, SDN | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Kenya et Nicaragua | KEN, NIC | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Kenya et Sierra Leone | KEN, SLE | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Lesotho et Eswatini | LSO, SWZ | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Mauritanie et Eswatini | MRT, SWZ | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Roumanie et Arabie saoudite | ROU, SAU | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Suriname et Tanzanie | SUR, TZA | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Eswatini et Ouganda | SWZ, UGA | 0,71 | recouvrement ≥ 0,7 en 64 × 64 |
| Burundi et Allemagne | BDI, DEU | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Burundi et Lesotho | BDI, LSO | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Bulgarie et Macédoine du Nord | BGR, MKD | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Bosnie-Herzégovine et Pologne | BIH, POL | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Roumanie | BLR, ROU | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Eswatini | BLR, SWZ | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Ouganda | BLR, UGA | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Biélorussie et Zimbabwe | BLR, ZWE | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Bhoutan et Roumanie | BTN, ROU | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Botswana et Macédoine du Nord | BWA, MKD | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Botswana et Uruguay | BWA, URY | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Suisse et Tchéquie | CHE, CZE | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Équateur | CIV, ECU | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Côte d’Ivoire et Macédoine du Nord | CIV, MKD | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Allemagne et Sierra Leone | DEU, SLE | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Kenya | DZA, KEN | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Mauritanie | DZA, MRT | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Algérie et Suriname | DZA, SUR | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Égypte et Uruguay | EGY, URY | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Éthiopie et Sénégal | ETH, SEN | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Gabon et Soudan | GAB, SDN | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Gabon et Eswatini | GAB, SWZ | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Iran et Lituanie | IRN, LTU | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Kenya et Pologne | KEN, POL | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Cambodge et Pologne | KHM, POL | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Liberia et Paraguay | LBR, PRY | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Libye et Tanzanie | LBY, TZA | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Sri Lanka et Tchad | LKA, TCD | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Macédoine du Nord et Roumanie | MKD, ROU | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Mauritanie et Ouganda | MRT, UGA | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Nicaragua et Roumanie | NIC, ROU | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Nicaragua et Zimbabwe | NIC, ZWE | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Rwanda et Zambie | RWA, ZMB | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Soudan et Suriname | SDN, SUR | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Soudan et Eswatini | SDN, SWZ | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Suriname et Eswatini | SUR, SWZ | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Eswatini et Tanzanie | SWZ, TZA | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
| Afrique du Sud et Zambie | ZAF, ZMB | 0,7 | recouvrement ≥ 0,7 en 64 × 64 |
