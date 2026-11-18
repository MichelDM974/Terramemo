# Fiches des territoires, des zones contestées et de l'Antarctique : chiffres à relire

*Écrit par le build (`npm run fiches`, `geodata/fiches-autres.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. Ticket #34, lot F3 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.2, § 2.6 et § 9 (D57). Les statuts (textes en tête de fiche) sont dans `docs/relectures/fiches-territoires.md`.*

## Comment relire, comment corriger

- Ce que montre la fiche : un **territoire** a ses habitants, sa superficie, sa capitale, ses langues, sa monnaie, son gentilé, son heure, son point culminant et son lien, quand la source les donne ; une **zone contestée** n'a que ses habitants (s'ils sont sourcés) et son lien (D57 a : rien de ce qui est celui d'une administration) ; l'**Antarctique** a sa superficie, son point culminant et son lien, rien sur les revendications. Une ligne sans donnée n'est pas affichée.
- Chaque section dit si sa ligne est déjà affichée ou tue jusqu'à la relecture. Une section tue s'affiche quand sa clé de `LIGNES_RELUES` (`src/fiches/relues.ts`) passe à `true`.
- Pour corriger : la ligne du lieu dans `geodata/fiches-main.json` (clé donnée en tête de section, une raison par ligne), puis `npm run fiches`. Le build échoue si une ligne ne s'applique plus (valeur déjà celle de la source, lieu inconnu, raison absente). Pour valider une ligne « à relire » : retirer son `a_relire`.
- Sources : Wikidata (extrait du 2026-11-18), Banque mondiale (World Development Indicators (WDI), Population, total (SP.POP.TOTL), 2025, mise à jour du 2026-11-11), CLDR 49.0.0, base tz 2026e.

## 1. Capitales des territoires (clé `capitale_territoires`)

**Dans la fiche : tue** tant que `capitale_territoires` est à `false` dans `src/fiches/relues.ts` (`LIGNES_RELUES`) ; à passer à `true` une fois cette section relue. D'ici là, la barre d'un territoire ne dit que ses habitants, et sa ligne d'heure s'appelle « Heure locale ».

Règle : la capitale déclarée par Wikidata (P36) ; s'il y en a plusieurs, celle de rang préféré, sans celles qui ont une fin ; le nom est le libellé français de Wikidata. 36 territoires sur 48 ont une capitale ; les autres n'en déclarent pas (une ville, des îles sans siège, une base).

| Territoire | Capitale affichée | Déclarations de Wikidata (P36) | Comment | À relire |
|---|---|---|---|---|
| Akrotiri | — | aucune | aucune capitale |  |
| Anguilla | The Valley | The Valley (Q30994) | règle : la seule déclarée |  |
| Aruba | Oranjestad | Oranjestad (Q131243) | règle : la seule déclarée |  |
| Baïkonour | — | aucune | aucune capitale |  |
| Base navale de la baie de Guantánamo | — | aucune | aucune capitale |  |
| Bermudes | Hamilton | Hamilton (Q30985) | règle : la seule déclarée |  |
| Curaçao | Willemstad | Willemstad (Q132679) | règle : la seule déclarée |  |
| Dhekelia | — | aucune | aucune capitale |  |
| Géorgie du Sud-et-les Îles Sandwich du Sud | King Edward Point | Grytviken (Q185672) ; King Edward Point (Q393878, préféré, depuis 2010) | règle : le rang préféré |  |
| Gibraltar | Gibraltar | Gibraltar (Q1410) | règle : la seule déclarée |  |
| Groenland | Nuuk | Nuuk (Q226) | règle : la seule déclarée |  |
| Guam | Hagåtña | Hagåtña (Q30988) | règle : la seule déclarée |  |
| Guernesey | Saint-Pierre-Port | Saint-Pierre-Port (Q174262) | règle : la seule déclarée |  |
| Hong Kong | — | aucune | aucune capitale |  |
| Île Clipperton | — | aucune | aucune capitale |  |
| Île de Man | Douglas | Douglas (Q18569) | règle : la seule déclarée |  |
| Île Norfolk | Kingston | Kingston (Q30963) | règle : la seule déclarée |  |
| Îles Åland | Mariehamn | Mariehamn (Q48329) | règle : la seule déclarée |  |
| Îles Ashmore-et-Cartier | — | aucune | aucune capitale |  |
| Îles Caïmans | George Town | George Town (Q172996) | règle : la seule déclarée |  |
| Îles Cook | Avarua | Avarua (Q170482) | règle : la seule déclarée |  |
| Îles de la mer de Corail | — | aucune | aucune capitale |  |
| Îles Féroé | Tórshavn | Tórshavn (Q10704) | règle : la seule déclarée |  |
| Îles Heard-et-MacDonald | — | aucune | aucune capitale |  |
| Îles Malouines | Port Stanley | Port Stanley (Q12245) | règle : la seule déclarée |  |
| Îles Mariannes du Nord | Saïpan | Saïpan (Q49755159) | règle : la seule déclarée |  |
| Îles mineures éloignées des États-Unis | — | aucune | aucune capitale |  |
| Îles Pitcairn | Adamstown | Adamstown (Q48273) | règle : la seule déclarée |  |
| Îles Turques-et-Caïques | Cockburn Town | Cockburn Town (Q34205) | règle : la seule déclarée |  |
| Îles Vierges britanniques | Road Town | Road Town (Q179431) | règle : la seule déclarée |  |
| Îles Vierges des États-Unis | Charlotte-Amélie | Charlotte-Amélie (Q51681) | règle : la seule déclarée |  |
| Jersey | Saint-Hélier | Saint-Hélier (Q147738) | règle : la seule déclarée |  |
| Macao | — | aucune | aucune capitale |  |
| Montserrat | Brades | Brades (Q31006, de facto) ; Plymouth (Q30990, de jure) | table : Wikidata déclare deux capitales sans rang : Plymouth (capitale de jure), abandonnée après l'éruption de la Soufrière en 1997, et Brades (de facto), où siège le gouvernement ; retenue Brades, celle où l'on vit et gouverne | **à relire** : Plymouth reste la capitale en droit : montrer Brades seule, ou « Brades » avec une note ? |
| Niue | Alofi | Alofi (Q30966) | règle : la seule déclarée |  |
| Nouvelle-Calédonie | Nouméa | Nouméa (Q9733) | règle : la seule déclarée |  |
| Polynésie française | Papeete | Papeete (Q130800) | règle : la seule déclarée |  |
| Porto Rico | San Juan | San Juan (Q41211) | règle : la seule déclarée |  |
| Saint-Barthélemy | Gustavia | Gustavia (Q34112) | règle : la seule déclarée |  |
| Saint-Martin | Marigot | Marigot (Q200605) | règle : la seule déclarée |  |
| Saint-Martin (partie néerlandaise) | Philipsburg | Philipsburg (Q30958) | règle : la seule déclarée |  |
| Saint-Pierre-et-Miquelon | Saint-Pierre | Saint-Pierre (Q185678) | règle : la seule déclarée |  |
| Sainte-Hélène | Jamestown | Jamestown (Q30970) | règle : la seule déclarée |  |
| Samoa américaines | Pago Pago | Pago Pago (Q51678) | règle : la seule déclarée |  |
| Terres australes françaises | Port-aux-Français | Port-aux-Français (Q839559) | règle : la seule déclarée |  |
| Territoire britannique de l’océan Indien | Diego Garcia | Diego Garcia (Q184851) | règle : la seule déclarée |  |
| Territoires extérieurs australiens de l'Océan Indien | — | aucune | aucune capitale |  |
| Wallis-et-Futuna | Mata Utu | Mata Utu (Q31002) | règle : la seule déclarée |  |

## 2. Habitants (règle, sans clé)

Territoires : **Dans la fiche : affichée** (aucune relecture attendue ; une erreur se corrige quand même ici). Zones contestées : **Dans la fiche : tue** tant que `habitants_zones` est à `false` dans `src/fiches/relues.ts` (`LIGNES_RELUES`) ; à passer à `true` une fois cette section relue. Règle : la Banque mondiale (2025) pour les 21 territoires qu'elle couvre ; sinon Wikidata (P1082 : rang préféré, sinon la plus récente), avec son année. 0 : « aucun habitant permanent », sans année ; un nombre positif sans année : pas de ligne.

| Lieu | Sorte | Affiché | Source | Remarque |
|---|---|---|---|---|
| Akrotiri | territoire | — | — | aucun chiffre dans les sources : pas de ligne |
| Anguilla | territoire | 16 293 (2025) | Wikidata (2 déclarations) |  |
| Aruba | territoire | 108 785 (2025) | Banque mondiale |  |
| Baïkonour | territoire | — | — | aucun chiffre dans les sources : pas de ligne |
| Banc de Bajo Nuevo | zone contestée | aucun habitant permanent | Wikidata (1 déclaration) |  |
| Banc de Serranilla | zone contestée | aucun habitant permanent | Wikidata (1 déclaration) |  |
| Base navale de la baie de Guantánamo | territoire | — | — | aucun chiffre dans les sources : pas de ligne |
| Bermudes | territoire | 64 555 (2025) | Banque mondiale |  |
| Bir Tawil | zone contestée | — | — | aucun chiffre dans les sources : pas de ligne |
| Champ de glace Sud de Patagonie | zone contestée | — | — | aucun chiffre dans les sources : pas de ligne |
| Chypre du Nord | zone contestée | 489 308 (2024) | Wikidata (10 déclarations) |  |
| Curaçao | territoire | 156 263 (2025) | Banque mondiale |  |
| Dhekelia | territoire | — | — | aucun chiffre dans les sources : pas de ligne |
| Géorgie du Sud-et-les Îles Sandwich du Sud | territoire | 35 (2019) | Wikidata (1 déclaration) |  |
| Gibraltar | territoire | 40 126 (2025) | Banque mondiale |  |
| Glacier de Siachen | zone contestée | — | — | aucun chiffre dans les sources : pas de ligne |
| Groenland | territoire | 56 831 (2025) | Banque mondiale |  |
| Guam | territoire | 168 999 (2025) | Banque mondiale |  |
| Guernesey | territoire | 67 787 (2024) | Wikidata (1 déclaration) |  |
| Hong Kong | territoire | 7 498 900 (2025) | Banque mondiale |  |
| Île Brésilienne | zone contestée | — | — | aucun chiffre dans les sources : pas de ligne |
| Île Clipperton | territoire | aucun habitant permanent | Wikidata (2 déclarations) |  |
| Île de Man | territoire | 84 118 (2025) | Banque mondiale |  |
| Île Norfolk | territoire | 2 188 (2021) | Wikidata (3 déclarations) |  |
| Îles Åland | territoire | 30 836 (2025) | Wikidata (5 déclarations) |  |
| Îles Ashmore-et-Cartier | territoire | aucun habitant permanent | Wikidata (1 déclaration) |  |
| Îles Caïmans | territoire | 75 844 (2025) | Banque mondiale |  |
| Îles Cook | territoire | 14 222 (2023) | Wikidata (3 déclarations) |  |
| Îles de la mer de Corail | territoire | 4 (2018) | Wikidata (1 déclaration) |  |
| Îles Féroé | territoire | 54 900 (2025) | Banque mondiale |  |
| Îles Heard-et-MacDonald | territoire | aucun habitant permanent | Wikidata (1 déclaration) |  |
| Îles Malouines | territoire | 3 662 (2021) | Wikidata (2 déclarations) |  |
| Îles Mariannes du Nord | territoire | 43 541 (2025) | Banque mondiale |  |
| Îles mineures éloignées des États-Unis | territoire | 190 (2010) | Wikidata (1 déclaration) | chiffre ancien (2010) |
| Îles Pitcairn | territoire | 50 (2019) | Wikidata (4 déclarations) |  |
| Îles Spratleys | zone contestée | — | — | aucun chiffre dans les sources : pas de ligne |
| Îles Turques-et-Caïques | territoire | 46 855 (2025) | Banque mondiale |  |
| Îles Vierges britanniques | territoire | 39 732 (2025) | Banque mondiale |  |
| Îles Vierges des États-Unis | territoire | 103 792 (2025) | Banque mondiale |  |
| Jersey | territoire | 103 267 (2021) | Wikidata (3 déclarations) |  |
| Macao | territoire | 685 900 (2025) | Banque mondiale |  |
| Montserrat | territoire | 5 440 (2023) | Wikidata (2 déclarations) |  |
| Niue | territoire | 1 821 (2025) | Wikidata (2 déclarations) |  |
| Nouvelle-Calédonie | territoire | 295 333 (2025) | Banque mondiale |  |
| Polynésie française | territoire | 282 465 (2025) | Banque mondiale |  |
| Porto Rico | territoire | 3 184 835 (2025) | Banque mondiale |  |
| Récif de Scarborough | zone contestée | — | — | aucun chiffre dans les sources : pas de ligne |
| Sahara occidental | zone contestée | 612 000 (2021) | Wikidata (2 déclarations) |  |
| Saint-Barthélemy | territoire | 10 124 (2018) | Wikidata (3 déclarations) |  |
| Saint-Martin | territoire | 24 941 (2025) | Banque mondiale |  |
| Saint-Martin (partie néerlandaise) | territoire | 43 923 (2025) | Banque mondiale |  |
| Saint-Pierre-et-Miquelon | territoire | 5 974 (2019) | Wikidata (1 déclaration) |  |
| Sainte-Hélène | territoire | 5 633 (2016) | Wikidata (1 déclaration) |  |
| Samoa américaines | territoire | 46 029 (2025) | Banque mondiale |  |
| Somaliland | zone contestée | 6 500 000 (2024) | Wikidata (1 déclaration) |  |
| Terres australes françaises | territoire | 196 (2012) | Wikidata (1 déclaration) | chiffre ancien (2012) |
| Territoire britannique de l’océan Indien | territoire | 3 000 (2018) | Wikidata (1 déclaration) |  |
| Territoires extérieurs australiens de l'Océan Indien | territoire | — | — | aucun chiffre dans les sources : pas de ligne |
| Wallis-et-Futuna | territoire | 11 558 (2018) | Wikidata (1 déclaration) |  |
| Zone tampon des Nations unies à Chypre | zone contestée | — | — | aucun chiffre dans les sources : pas de ligne |

## 3. Superficies (règle, sans clé)

**Dans la fiche : tue** tant que `superficie_territoires` est à `false` dans `src/fiches/relues.ts` (`LIGNES_RELUES`) ; à passer à `true` une fois cette section relue. Territoires et Antarctique ; aucune pour une zone (D57). Règle des pays : Wikidata (P2046, en km²), rang préféré, la plus récente, sinon la plus grande ; la surface du tracé de la carte est montrée pour comparer, jamais affichée.

| Lieu | Retenue (km²) | Valeurs de Wikidata | Tracé de la carte (km²) | Remarque |
|---|---|---|---|---|
| Akrotiri | 123 | 123 | 99 |  |
| Anguilla | 97,55 | 97.55 | 88 |  |
| Antarctique | 14 106 900 | 14106900 | 12 258 320 |  |
| Aruba | 193 | 193 | 170 |  |
| Baïkonour | — | aucune | 6 486 |  |
| Base navale de la baie de Guantánamo | 118 | 117.6 | 66 |  |
| Bermudes | 53 | 53 | 62 |  |
| Curaçao | 444 | 444 | 465 |  |
| Dhekelia | 131 | 130.8 | 127 |  |
| Géorgie du Sud-et-les Îles Sandwich du Sud | 4 066 | 4066 | 3 904 |  |
| Gibraltar | 6,8 | 6.8 | 4 |  |
| Groenland | 2 166 086 | 2166086 | 2 137 891 |  |
| Guam | 544 | 544 | 566 |  |
| Guernesey | 78 | 78 | 74 |  |
| Hong Kong | 2 755 | 2755.03 (2016-01-01) ; 1649.34 (2016-01-01) ; 1105.69 (2016-01-01) | 1 039 | plusieurs valeurs : la plus grande retenue ; écart de plus du double avec le tracé |
| Île Clipperton | 8,9 | 8.9 | 5 |  |
| Île de Man | 572 | 572 | 572 |  |
| Île Norfolk | 34,6 | 34.6 | 41 |  |
| Îles Åland | 1 583 | 1582.93 (2021-01-01) | 937 |  |
| Îles Ashmore-et-Cartier | 199 | 199 | 3 | écart de plus du double avec le tracé |
| Îles Caïmans | 262 | 262 | 310 |  |
| Îles Cook | 240 | 240 | 192 |  |
| Îles de la mer de Corail | 7 | 7 | 0 | écart de plus du double avec le tracé |
| Îles Féroé | 1 399 | 1399 | 1 321 |  |
| Îles Heard-et-MacDonald | 368 | 368 (préféré) | 393 | 1 valeur(s) dans une autre unité, écartée(s) |
| Îles Malouines | 12 173 | 12173 | 11 553 |  |
| Îles Mariannes du Nord | 464 | 464 | 581 |  |
| Îles mineures éloignées des États-Unis | 34,2 | 34.2 | 28 |  |
| Îles Pitcairn | 46,5 | 46.5 | 43 |  |
| Îles Turques-et-Caïques | 417 | 417 | 446 |  |
| Îles Vierges britanniques | 153 | 153 | 145 |  |
| Îles Vierges des États-Unis | 346 | 346.36 | 356 |  |
| Jersey | 118 | 118.2 | 119 |  |
| Macao | 118 | 118.4 | 30 | écart de plus du double avec le tracé |
| Montserrat | 102 | 102 | 100 |  |
| Niue | 260 | 260 | 221 |  |
| Nouvelle-Calédonie | 18 576 | 18576 | 18 892 |  |
| Polynésie française | 4 167 | 4167 | 3 348 |  |
| Porto Rico | 9 104 | 9104 | 9 035 |  |
| Saint-Barthélemy | 25 | 25 | 25 |  |
| Saint-Martin | 56 | 56 | 69 |  |
| Saint-Martin (partie néerlandaise) | 34 | 34 | 23 |  |
| Saint-Pierre-et-Miquelon | 242 | 242 | 242 |  |
| Sainte-Hélène | 394 | 394 | 367 |  |
| Samoa américaines | 199 | 199 | 181 |  |
| Terres australes françaises | 7 829 | 7829 | 7 257 |  |
| Territoire britannique de l’océan Indien | 60 | 60 | 49 |  |
| Territoires extérieurs australiens de l'Océan Indien | — | aucune | 112 |  |
| Wallis-et-Futuna | 142 | 142 | 140 |  |

## 4. Langues des territoires (clé `langues_territoires`, D56 c)

**Dans la fiche : tue** tant que `langues_territoires` est à `false` dans `src/fiches/relues.ts` (`LIGNES_RELUES`) ; à passer à `true` une fois cette section relue. Règle des pays : les langues officielles de CLDR, puis les langues du territoire parlées par 10 % ou plus, avec leur part ; la table retire ou ajoute.

| Territoire | Affiché | Candidates de CLDR | Retraits et ajouts | À relire |
|---|---|---|---|---|
| Anguilla | anglais | en (officielle) 95 % |  |  |
| Aruba | néerlandais, papiamento | nl (officielle) 97 %, pap (officielle) 61 % |  |  |
| Bermudes | anglais | en (officielle) 92 % |  |  |
| Curaçao | papiamento, néerlandais | pap (officielle) 81 %, nl (officielle) 8 % |  |  |
| Géorgie du Sud-et-les Îles Sandwich du Sud | anglais | en (officielle) 100 % |  |  |
| Gibraltar | anglais · espagnol 50 % | en (officielle) 80 %, es 50 % |  |  |
| Groenland | groenlandais · danois 14 % | kl (officielle) 84 %, da 14 % |  |  |
| Guam | anglais, chamorro | en (officielle) 91 %, ch (officielle) 22 % |  |  |
| Guernesey | anglais | en (officielle) 100 % |  |  |
| Hong Kong | chinois, anglais · cantonais 90 % | zh (officielle) 95 %, en (officielle) 51 %, yue 90 % |  |  |
| Île de Man | anglais, mannois | en (officielle) 100 %, gv (officielle) 1.8 % |  |  |
| Île Norfolk | anglais | en (officielle) 96 % |  |  |
| Îles Åland | suédois | sv (officielle) 99 % |  |  |
| Îles Caïmans | anglais | en (officielle) 98 % |  |  |
| Îles Cook | anglais | en (officielle) 100 % |  |  |
| Îles Féroé | féroïen | fo (officielle) 95 % |  |  |
| Îles Heard-et-MacDonald | — (pas de ligne) | und 100 % | retrait und : « langue indéterminée » de CLDR : les îles n'ont aucun habitant permanent |  |
| Îles Malouines | anglais | en (officielle) 77 % |  |  |
| Îles Mariannes du Nord | anglais · chamorro 18 % | en (officielle) 97 %, ch 18 % |  |  |
| Îles mineures éloignées des États-Unis | anglais | en (officielle) 100 % |  |  |
| Îles Pitcairn | anglais | en (officielle) 92 % |  |  |
| Îles Turques-et-Caïques | anglais | en (officielle) 98 % |  |  |
| Îles Vierges britanniques | anglais | en (officielle) 98 % |  |  |
| Îles Vierges des États-Unis | anglais | en (officielle) 75 % |  |  |
| Jersey | anglais | en (officielle) 95 % |  |  |
| Macao | chinois, cantonais, portugais | zh (officielle) 98 %, yue (officielle) 86 %, pt (officielle) 2.3 %, en 23 % | retrait en : langue apprise (23 % selon CLDR), ni officielle ni langue de Macao (D56 c) | **à relire** : le cantonais et le chinois sont donnés tous deux officiels par CLDR (la Loi fondamentale dit « le chinois », parlé surtout en cantonais) |
| Montserrat | anglais | en (officielle) 64 % |  |  |
| Niue | anglais, niuéen | en (officielle) 56 %, niu (officielle) 56 % |  |  |
| Nouvelle-Calédonie | français | fr (officielle) 99 % |  |  |
| Polynésie française | français, tahitien | fr (officielle) 98 %, ty (officielle) 31 % |  |  |
| Porto Rico | espagnol, anglais | es (officielle) 87 %, en (officielle) 49 % |  |  |
| Saint-Barthélemy | français | fr (officielle) 85 % |  |  |
| Saint-Martin | français | fr (officielle) 84 % |  |  |
| Saint-Martin (partie néerlandaise) | anglais, néerlandais · espagnol 11 % | en (officielle) 68 %, nl (officielle) 3.4 %, es 11 % |  |  |
| Saint-Pierre-et-Miquelon | français | fr (officielle) 100 % |  |  |
| Sainte-Hélène | anglais | en (officielle) 68 % |  |  |
| Samoa américaines | samoan, anglais | sm (officielle) 99 %, en (officielle) 97 % |  |  |
| Terres australes françaises | français | fr 100 % | ajout fr (officielle) : CLDR donne le français à 100 % sans le dire officiel (loi n° 55-1052 du 6 août 1955 (statut des TAAF) : collectivité de la République, où le français est langue officielle (Constitution, art. 2)) |  |
| Territoire britannique de l’océan Indien | anglais | en (officielle) 100 % |  |  |
| Wallis-et-Futuna | français · wallisien 59 % · futunien 30 % | fr (officielle) 83 %, wls 59 %, fud 30 % |  |  |

Noms français absents de CLDR, écrits à la main :

| Code | Nom | Source |
|---|---|---|
| fud | futunien | ISO 639-3 fud (East Futuna) ; nom français : Wikipédia, « Futunien » (lu le 18/11/2026) |
| wls | wallisien | ISO 639-3 wls (Wallisian) ; nom français : Wikipédia, « Wallisien » (lu le 18/11/2026) |

## 5. Monnaies des territoires (règle, sans clé)

**Dans la fiche : affichée** (aucune relecture attendue ; une erreur se corrige quand même ici). Règle des pays : la monnaie en cours de CLDR (currencyData) ; aucun territoire n'en a plusieurs.

| Territoire | Monnaie |
|---|---|
| Anguilla | dollar des Caraïbes orientales |
| Aruba | florin arubais |
| Bermudes | dollar bermudien |
| Curaçao | florin caribéen |
| Géorgie du Sud-et-les Îles Sandwich du Sud | livre sterling |
| Gibraltar | livre de Gibraltar |
| Groenland | couronne danoise |
| Guam | dollar des États-Unis |
| Guernesey | livre sterling |
| Hong Kong | dollar de Hong Kong |
| Île de Man | livre sterling |
| Île Norfolk | dollar australien |
| Îles Åland | euro |
| Îles Caïmans | dollar des îles Caïmans |
| Îles Cook | dollar néo-zélandais |
| Îles Féroé | couronne danoise |
| Îles Heard-et-MacDonald | dollar australien |
| Îles Malouines | livre des îles Malouines |
| Îles Mariannes du Nord | dollar des États-Unis |
| Îles mineures éloignées des États-Unis | dollar des États-Unis |
| Îles Pitcairn | dollar néo-zélandais |
| Îles Turques-et-Caïques | dollar des États-Unis |
| Îles Vierges britanniques | dollar des États-Unis |
| Îles Vierges des États-Unis | dollar des États-Unis |
| Jersey | livre sterling |
| Macao | pataca macanaise |
| Montserrat | dollar des Caraïbes orientales |
| Niue | dollar néo-zélandais |
| Nouvelle-Calédonie | franc CFP |
| Polynésie française | franc CFP |
| Porto Rico | dollar des États-Unis |
| Saint-Barthélemy | euro |
| Saint-Martin | euro |
| Saint-Martin (partie néerlandaise) | florin caribéen |
| Saint-Pierre-et-Miquelon | euro |
| Sainte-Hélène | livre de Sainte-Hélène |
| Samoa américaines | dollar des États-Unis |
| Terres australes françaises | euro |
| Territoire britannique de l’océan Indien | dollar des États-Unis |
| Wallis-et-Futuna | franc CFP |

## 6. Gentilés des territoires (clé `gentile_territoires`)

**Dans la fiche : tue** tant que `gentile_territoires` est à `false` dans `src/fiches/relues.ts` (`LIGNES_RELUES`) ; à passer à `true` une fois cette section relue. Règle des pays : la forme masculine de Wikidata (P1549, en français), au pluriel (« les Groenlandais ») ; la table tranche entre plusieurs formes ou n'en veut aucune. Seuls les territoires où Wikidata donne un gentilé sont listés (14 sur 48).

| Territoire | Affiché | Formes de Wikidata | Comment | À relire |
|---|---|---|---|---|
| Bermudes | les Bermudiens | Bermudien | règle : la seule forme masculine |  |
| Gibraltar | les Gibraltariens | Gibraltarienne, Gibraltarien, gibraltarien | règle : la seule forme masculine |  |
| Groenland | les Groenlandais | groenlandais, groenlandaise | règle : la seule forme masculine |  |
| Guam | les Guamaniens | guamanienne, guamanien | règle : la seule forme masculine |  |
| Hong Kong | les Hongkongais | Hongkongais, Hongkongaise, Hongkongaises | règle : la seule forme masculine |  |
| Îles Féroé | les Féroïens | féroïen | règle : la seule forme masculine |  |
| Îles Vierges britanniques | — (pas de ligne) | insulaire des Îles Vierges britanniques, britannique | table : Wikidata donne « insulaire des Îles Vierges britanniques », une périphrase, et « britannique », la nationalité : ni l'un ni l'autre n'est un gentilé |  |
| Jersey | — (pas de ligne) | Jèrriais(e), Jersey crapaud | table : Wikidata donne « Jèrriais(e) », le nom de la langue normande de l'île, et « Jersey crapaud », un surnom : ni l'un ni l'autre n'est un gentilé |  |
| Nouvelle-Calédonie | les Néo-Calédoniens | Néocalédoniennes, Néo-Calédoniens, Néo-Calédoniennes, Néocalédoniens, Calédoniennes, Néo-Calédonien, Néo-Calédonienne, Calédonien, Calédoniens, Néocalédonienne, Calédonienne, Néocalédonien | table : Wikidata donne trois masculins (Néo-Calédonien, Néocalédonien, Calédonien) : retenue la graphie à trait d'union, celle de l'article de la Wikipédia en français | **à relire** : « Calédonien » est aussi d'usage en Nouvelle-Calédonie |
| Polynésie française | les Polynésiens | Polynésien, Polynésienne | table : Wikidata donne « Polynésien » et « Polynésienne » sans marque de genre : retenu le masculin |  |
| Porto Rico | les Portoricains | portoricain, portoricaine | règle : la seule forme masculine |  |
| Saint-Barthélemy | les Barthéloméens | Barthéloméenne, Barthéloméen | règle : la seule forme masculine |  |
| Saint-Martin | les Saint-Martinois | Saint-Martinois | règle : la seule forme masculine |  |
| Saint-Pierre-et-Miquelon | — (pas de ligne) | Saint-Pierrais, Miquelonais | table : Wikidata donne « Saint-Pierrais » et « Miquelonais », les habitants de chaque île ; aucun des deux ne vaut pour tout l'archipel | **à relire** : « Saint-Pierrais et Miquelonais » est l'usage de l'archipel, mais n'est pas une forme de Wikidata |

## 7. Heure locale des territoires (clé `zone_territoires`)

**Dans la fiche : affichée** (aucune relecture attendue ; une erreur se corrige quand même ici). La zone est écrite à la main pour chaque territoire (§ 2.2 : la plus proche de la capitale ne suffit pas, le Groenland sortait à Danmarkshavn) ; le build vérifie qu'elle est dans zone.tab et qu'elle est celle du code du territoire, sinon la ligne dit pourquoi (hors code). Pas de nombre de fuseaux pour un territoire. Le libellé est « Heure à <capitale> » une fois les capitales relues, « Heure locale » d'ici là.

| Territoire | Zone | Hiver / été | Zones de zone.tab pour son code | Raison | À relire |
|---|---|---|---|---|---|
| Akrotiri | Asia/Nicosia | UTC+2 / UTC+3 | aucune | les zones de souveraineté britanniques suivent l'heure de Chypre (heure d'Europe de l'Est, avec heure d'été) ; hors code (CY) : Akrotiri n'a pas de code ISO ; Asia/Nicosia est la zone de Chypre (CY), où sont les bases ; point de zone.tab à 65 km du tracé |  |
| Anguilla | America/Anguilla | UTC−4 | America/Anguilla | seule zone de zone.tab pour ce code |  |
| Aruba | America/Aruba | UTC−4 | America/Aruba | seule zone de zone.tab pour ce code |  |
| Baïkonour | Asia/Qyzylorda | UTC+5 | aucune | Baïkonour suit l'heure du Kazakhstan, UTC+5 (Wikipédia, « Baïkonour », vérifié le 18/11/2026) ; tout le Kazakhstan est à UTC+5 depuis le 1er mars 2024, et Asia/Qyzylorda est la zone de zone.tab de la région de Kyzylorda, où est Baïkonour ; hors code (KZ) : Baïkonour n'a pas de code ISO ; Asia/Qyzylorda est une zone du Kazakhstan (KZ) ; point de zone.tab à 164 km du tracé |  |
| Base navale de la baie de Guantánamo | America/New_York | UTC−5 / UTC−4 | aucune | la base suit l'heure de l'Est des États-Unis, heure d'été comprise, au rythme de son commandement en Floride et non de Cuba (timeanddate.com, « Cuba starts DST 2012 » ; Wikipédia en anglais, « Guantanamo Bay Naval Base » ; vérifié le 18/11/2026) ; hors code (US) : la base n'a pas de code ISO ; America/New_York est une zone des États-Unis (US) ; point de zone.tab à 2 308 km du tracé | **à relire** : les sources trouvées sont anciennes (2012) ou secondaires ; Cuba (America/Havana) a aussi UTC−5 l'hiver, l'heure d'été diffère de quelques jours |
| Bermudes | Atlantic/Bermuda | UTC−4 / UTC−3 | Atlantic/Bermuda | seule zone de zone.tab pour ce code |  |
| Curaçao | America/Curacao | UTC−4 | America/Curacao | seule zone de zone.tab pour ce code |  |
| Dhekelia | Asia/Nicosia | UTC+2 / UTC+3 | aucune | les zones de souveraineté britanniques suivent l'heure de Chypre (heure d'Europe de l'Est, avec heure d'été) ; hors code (CY) : Dhekelia n'a pas de code ISO ; Asia/Nicosia est la zone de Chypre (CY), où sont les bases ; point de zone.tab à 32 km du tracé |  |
| Géorgie du Sud-et-les Îles Sandwich du Sud | Atlantic/South_Georgia | UTC−2 | Atlantic/South_Georgia | seule zone de zone.tab pour ce code |  |
| Gibraltar | Europe/Gibraltar | UTC+1 / UTC+2 | Europe/Gibraltar | seule zone de zone.tab pour ce code |  |
| Groenland | America/Nuuk | UTC−2 / UTC−1 | America/Nuuk (most of Greenland), America/Danmarkshavn (National Park (east coast)), America/Scoresbysund (Scoresbysund/Ittoqqortoormiit), America/Thule (Thule/Pituffik) | zone.tab en donne quatre pour GL : America/Nuuk (« most of Greenland »), celle de Nuuk, la capitale ; Danmarkshavn, Ittoqqortoormiit et Pituffik ont la leur ; point de zone.tab à 3 km du tracé |  |
| Guam | Pacific/Guam | UTC+10 | Pacific/Guam | seule zone de zone.tab pour ce code |  |
| Guernesey | Europe/Guernsey | UTC+0 / UTC+1 | Europe/Guernsey | seule zone de zone.tab pour ce code |  |
| Hong Kong | Asia/Hong_Kong | UTC+8 | Asia/Hong_Kong | seule zone de zone.tab pour ce code |  |
| Île Clipperton | — (pas de ligne) | — | aucune | île inhabitée (aucun habitant permanent), sans code ISO ni zone dans zone.tab |  |
| Île de Man | Europe/Isle_of_Man | UTC+0 / UTC+1 | Europe/Isle_of_Man | seule zone de zone.tab pour ce code |  |
| Île Norfolk | Pacific/Norfolk | UTC+12 / UTC+11 | Pacific/Norfolk | seule zone de zone.tab pour ce code |  |
| Îles Åland | Europe/Mariehamn | UTC+2 / UTC+3 | Europe/Mariehamn | seule zone de zone.tab pour ce code |  |
| Îles Ashmore-et-Cartier | — (pas de ligne) | — | aucune | îles inhabitées (aucun habitant permanent), sans code ISO ni zone dans zone.tab |  |
| Îles Caïmans | America/Cayman | UTC−5 | America/Cayman | seule zone de zone.tab pour ce code |  |
| Îles Cook | Pacific/Rarotonga | UTC−10 | Pacific/Rarotonga | seule zone de zone.tab pour ce code |  |
| Îles de la mer de Corail | Australia/Brisbane | UTC+10 | aucune | une station météo habitée (île Willis), à l'heure du Queensland (UTC+10, sans heure d'été), celle de l'Australie au large de laquelle sont les îles ; hors code (AU) : les îles n'ont pas de code ISO ; Australia/Brisbane est la zone du Queensland (AU) ; point de zone.tab à 728 km du tracé |  |
| Îles Féroé | Atlantic/Faroe | UTC+0 / UTC+1 | Atlantic/Faroe | seule zone de zone.tab pour ce code |  |
| Îles Heard-et-MacDonald | — (pas de ligne) | — | aucune | îles inhabitées (aucun habitant permanent) ; zone.tab n'a aucune zone pour HM |  |
| Îles Malouines | Atlantic/Stanley | UTC−3 | Atlantic/Stanley | seule zone de zone.tab pour ce code |  |
| Îles Mariannes du Nord | Pacific/Saipan | UTC+10 | Pacific/Saipan | seule zone de zone.tab pour ce code |  |
| Îles mineures éloignées des États-Unis | — (pas de ligne) | — | Pacific/Midway (Midway Islands), Pacific/Wake (Wake Island) | des îles éparses de part et d'autre de l'antiméridien, de UTC+12 (Wake) à UTC−11 (Midway) : aucune heure ne vaut pour l'ensemble (§ 2.2) |  |
| Îles Pitcairn | Pacific/Pitcairn | UTC−8 | Pacific/Pitcairn | seule zone de zone.tab pour ce code ; point de zone.tab à 1 km du tracé |  |
| Îles Turques-et-Caïques | America/Grand_Turk | UTC−5 / UTC−4 | America/Grand_Turk | seule zone de zone.tab pour ce code |  |
| Îles Vierges britanniques | America/Tortola | UTC−4 | America/Tortola | seule zone de zone.tab pour ce code ; point de zone.tab à 1 km du tracé |  |
| Îles Vierges des États-Unis | America/St_Thomas | UTC−4 | America/St_Thomas | seule zone de zone.tab pour ce code |  |
| Jersey | Europe/Jersey | UTC+0 / UTC+1 | Europe/Jersey | seule zone de zone.tab pour ce code ; point de zone.tab à 1 km du tracé |  |
| Macao | Asia/Macau | UTC+8 | Asia/Macau | seule zone de zone.tab pour ce code |  |
| Montserrat | America/Montserrat | UTC−4 | America/Montserrat | seule zone de zone.tab pour ce code |  |
| Niue | Pacific/Niue | UTC−11 | Pacific/Niue | seule zone de zone.tab pour ce code |  |
| Nouvelle-Calédonie | Pacific/Noumea | UTC+11 | Pacific/Noumea | seule zone de zone.tab pour ce code |  |
| Polynésie française | Pacific/Tahiti | UTC−10 | Pacific/Tahiti (Society Islands), Pacific/Marquesas (Marquesas Islands), Pacific/Gambier (Gambier Islands) | zone.tab en donne trois pour PF : Pacific/Tahiti (îles de la Société), celle de Papeete, la capitale ; les Marquises et les Gambier ont la leur |  |
| Porto Rico | America/Puerto_Rico | UTC−4 | America/Puerto_Rico | seule zone de zone.tab pour ce code |  |
| Saint-Barthélemy | America/St_Barthelemy | UTC−4 | America/St_Barthelemy | seule zone de zone.tab pour ce code ; point de zone.tab à 1 km du tracé |  |
| Saint-Martin | America/Marigot | UTC−4 | America/Marigot | seule zone de zone.tab pour ce code |  |
| Saint-Martin (partie néerlandaise) | America/Lower_Princes | UTC−4 | America/Lower_Princes | seule zone de zone.tab pour ce code ; point de zone.tab à 1 km du tracé |  |
| Saint-Pierre-et-Miquelon | America/Miquelon | UTC−3 / UTC−2 | America/Miquelon | seule zone de zone.tab pour ce code |  |
| Sainte-Hélène | Atlantic/St_Helena | UTC+0 | Atlantic/St_Helena | seule zone de zone.tab pour SH ; Ascension et Tristan da Cunha sont aussi à UTC+0 |  |
| Samoa américaines | Pacific/Pago_Pago | UTC−11 | Pacific/Pago_Pago | seule zone de zone.tab pour ce code ; point de zone.tab à 1 km du tracé |  |
| Terres australes françaises | Indian/Kerguelen | UTC+5 | Indian/Kerguelen | seule zone de zone.tab pour TF (les Kerguelen, où est Port-aux-Français) ; Crozet, Amsterdam et les îles Éparses ont d'autres heures d'usage |  |
| Territoire britannique de l’océan Indien | Indian/Chagos | UTC+6 | Indian/Chagos | seule zone de zone.tab pour ce code ; point de zone.tab à 1 km du tracé |  |
| Territoires extérieurs australiens de l'Océan Indien | Indian/Christmas | UTC+7 | aucune | deux zones pour l'entité, qui réunit l'île Christmas (CX, UTC+7, ≈ 1 700 habitants) et les îles Cocos (CC, UTC+6 h 30, ≈ 600 habitants) : celle de Christmas, la plus peuplée ; hors code (CX) : l'entité n'a pas de code ISO ; Indian/Christmas est la zone de l'île Christmas (CX) ; point de zone.tab à 2 km du tracé | **à relire** : les îles Cocos ont 30 minutes de moins : faut-il plutôt ne pas donner d'heure ? |
| Wallis-et-Futuna | Pacific/Wallis | UTC+12 | Pacific/Wallis | seule zone de zone.tab pour ce code |  |

## 8. Points culminants (clé `culminant_territoires`)

**Dans la fiche : tue** tant que `culminant_territoires` est à `false` dans `src/fiches/relues.ts` (`LIGNES_RELUES`) ; à passer à `true` une fois cette section relue. Territoires et Antarctique ; aucun pour une zone. Règle des pays : le sommet déclaré par Wikidata (P610), son altitude (P2044) ; aucun point culminant dans une zone disputée, et le sommet à 10 km au plus du tracé (vérifiés par le build). Seuls les lieux où Wikidata déclare un sommet sont listés.

| Lieu | Affiché | Sommets déclarés | Altitudes de Wikidata | Distance au tracé | Comment | À relire |
|---|---|---|---|---|---|---|
| Antarctique | massif Vinson, 4 892 m | massif Vinson (Q163758) | 4892 m | dedans | règle |  |
| Aruba | mont Jamanota, 188 m | mont Jamanota (Q594885) | 188 m | dedans | règle |  |
| Géorgie du Sud-et-les Îles Sandwich du Sud | — (pas de ligne) | mont Paget (Q1573762) | aucune | — | table : le mont Paget (2 934 m, Wikidata) est dans la zone disputée NE_B32, qui couvre la Géorgie du Sud (revendiquée par l'Argentine) : aucun point culminant ne passe par une zone disputée (décision « sommets et fuseaux », 18/11/2026) | **à relire** : même question que les Malouines |
| Groenland | Gunnbjørn, 3 694 m | Gunnbjørn (Q825709) | 3694 m | dedans | règle |  |
| Guam | mont Lamlam, 406 m | mont Lamlam (Q4380977) | 406 m, 1332 ft | dedans | règle |  |
| Guernesey | Le Moulin, 114 m | Le Moulin (Q3224807) | 114 m, 109 m | dedans | table : deux altitudes sans rang : retenue la plus haute, 114 m, celle de l'article de la Wikipédia en français « Le Moulin (Sercq) » | **à relire** : le sommet est sur Sercq ; l'île de Guernesey culmine à Hautnez (≈ 110 m) |
| Hong Kong | Tai Mo Shan, 957 m | Tai Mo Shan (Q1481864) | 957 m | dedans | règle |  |
| Île Clipperton | rocher de Clipperton, 29 m | rocher de Clipperton (Q16040036) | 29 m | 0,8 km | règle |  |
| Île de Man | Snaefell, 621 m | Snaefell (Q147557) | 621 m | dedans | règle |  |
| Îles Åland | Orrdalsklint, 127 m | Orrdalsklint (Q2031587) | 127 m | dedans | règle |  |
| Îles Cook | Te Manga, 652 m | Te Manga (Q498069) | 652 m | dedans | règle |  |
| Îles Féroé | Slættaratindur, 880 m | Slættaratindur (Q738746) | 880 m | dedans | règle |  |
| Îles Heard-et-MacDonald | pic Mawson, 2 745 m | pic Mawson (Q2114101) | 2745 m | dedans | règle |  |
| Îles Malouines | — (pas de ligne) | mont Usborne (Q1064229) | aucune | — | table : le mont Usborne (705 m, Wikidata) est dans la zone disputée NE_B12, qui couvre tout l'archipel (revendiqué par l'Argentine) : aucun point culminant ne passe par une zone disputée (décision « sommets et fuseaux », 18/11/2026) | **à relire** : la règle a été prise pour un pays qui revendique un sommet ; ici le sommet est celui du territoire lui-même, quel que soit son souverain : le montrer ? |
| Îles Mariannes du Nord | — (pas de ligne) | sans nom français (Mount Agrihan) (Q27728822) | aucune | — | table : le sommet déclaré (Q27728822, « Mount Agrihan ») n'a ni nom français ni altitude dans Wikidata |  |
| Îles mineures éloignées des États-Unis | — (pas de ligne) | sans nom français (Dunning Hill) (Q11695306) | aucune | — | table : le sommet déclaré (Q11695306, « Dunning Hill », sur l'île de la Navasse) n'a pas de nom français dans Wikidata |  |
| Îles Turques-et-Caïques | Blue Hills, 49 m | Blue Hills (Q3492008) | 49 m | dedans | règle |  |
| Îles Vierges des États-Unis | Crown Mountain, 473 m | Crown Mountain (Q3005470) | 473 m | dedans | règle |  |
| Macao | Alto de Coloane, 171 m | Alto de Coloane (Q5147805) | 170.6 m | dedans | règle |  |
| Niue | point sans nom, 68 m | point culminant de Niue (Q28745318) | 68 m | dedans | table : le libellé de Wikidata redit « point culminant » ; le sommet n'a pas de nom | **à relire** : voir la raison |
| Polynésie française | mont Orohena, 2 241 m | mont Orohena (Q512465) | 2241 m | dedans | règle |  |
| Porto Rico | Cerro de Punta, 1 338 m | Cerro de Punta (Q2714342) | 1338 m | dedans | règle |  |
| Saint-Barthélemy | Morne de Vitet, 286 m | Morne de Vitet (Q3055081) | 286 m | 0,5 km | règle |  |
| Saint-Martin | pic Paradis, 424 m | pic Paradis (Q5919800) | 424 m | dedans | règle |  |
| Saint-Pierre-et-Miquelon | Morne de la Grande Montagne, 240 m | Morne de la Grande Montagne (Q3051597) | 240 m | dedans | règle |  |
| Sainte-Hélène | Queen Mary's Peak, 2 062 m | Queen Mary's Peak (Q2062890) | 2062 m | dedans | règle |  |
| Samoa américaines | Lata, 963 m | Lata (Q1226878) | 963 m | dedans | règle |  |
| Terres australes françaises | mont Ross, 1 850 m | mont Ross (Q1945447) | 1850 m | dedans | règle |  |
| Wallis-et-Futuna | mont Puke, 524 m | mont Puke (Q1549756) | 522 m, 524 m | dedans | table : deux altitudes sans rang : retenue 524 m, celle de l'article de la Wikipédia en français « Mont Puke » | **à relire** : voir la raison |

## 9. Liens vers la Wikipédia en français (clé `wp`)

**Dans la fiche : affichée** (aucune relecture attendue ; une erreur se corrige quand même ici). Le titre de l'article de l'item du lieu (clé `qid`) ; la table le corrige.

| Lieu | Sorte | Item | Article | Comment |
|---|---|---|---|---|
| Akrotiri | territoire | Q9143535 | Akrotiri et Dhekelia | table : l'item de la base de l'Ouest (Q9143535) n'a pas d'article en français ; « Akrotiri et Dhekelia » (Q37362) est celui des deux bases (qid, a_relire) |
| Anguilla | territoire | Q25228 | Anguilla | article de l'item |
| Antarctique | continent | Q51 | Antarctique | article de l'item |
| Aruba | territoire | Q21203 | Aruba | article de l'item |
| Baïkonour | territoire | Q177477 | Cosmodrome de Baïkonour | article de l'item |
| Banc de Bajo Nuevo | zone contestée | Q1257783 | Banc de Bajo Nuevo | article de l'item |
| Banc de Serranilla | zone contestée | Q1169008 | Banc de Serranilla | article de l'item |
| Base navale de la baie de Guantánamo | territoire | Q762570 | Base navale de la baie de Guantánamo | article de l'item |
| Bermudes | territoire | Q23635 | Bermudes | article de l'item |
| Bir Tawil | zone contestée | Q620634 | Bir Tawil | article de l'item |
| Champ de glace Sud de Patagonie | zone contestée | Q1031467 | Champ de glace Sud de Patagonie | article de l'item |
| Chypre du Nord | zone contestée | Q23681 | Chypre du Nord | article de l'item |
| Curaçao | territoire | Q25279 | Curaçao | article de l'item |
| Dhekelia | territoire | Q9206745 | Akrotiri et Dhekelia | table : l'item de la base de l'Est (Q9206745) n'a pas d'article en français ; « Akrotiri et Dhekelia » (Q37362) est celui des deux bases (qid, a_relire) |
| Géorgie du Sud-et-les Îles Sandwich du Sud | territoire | Q35086 | Géorgie du Sud-et-les îles Sandwich du Sud | article de l'item |
| Gibraltar | territoire | Q1410 | Gibraltar | article de l'item |
| Glacier de Siachen | zone contestée | Q333946 | Glacier de Siachen | article de l'item |
| Groenland | territoire | Q223 | Groenland | article de l'item |
| Guam | territoire | Q16635 | Guam | article de l'item |
| Guernesey | territoire | Q25230 | Bailliage de Guernesey | article de l'item |
| Hong Kong | territoire | Q8646 | Hong Kong | article de l'item |
| Île Brésilienne | zone contestée | Q2093778 | — (pas de lien) | l'item n'a pas d'article en français |
| Île Clipperton | territoire | Q161258 | Île Clipperton | article de l'item |
| Île de Man | territoire | Q9676 | Île de Man | article de l'item |
| Île Norfolk | territoire | Q31057 | Île Norfolk | article de l'item |
| Îles Åland | territoire | Q5689 | Åland | article de l'item |
| Îles Ashmore-et-Cartier | territoire | Q133888 | Îles Ashmore-et-Cartier | article de l'item |
| Îles Caïmans | territoire | Q5785 | Îles Caïmans | article de l'item |
| Îles Cook | territoire | Q26988 | Îles Cook | article de l'item |
| Îles de la mer de Corail | territoire | Q172216 | Îles de la mer de Corail | article de l'item |
| Îles Féroé | territoire | Q4628 | Îles Féroé | article de l'item |
| Îles Heard-et-MacDonald | territoire | Q131198 | Îles Heard-et-MacDonald | article de l'item |
| Îles Malouines | territoire | Q9648 | Îles Malouines | article de l'item |
| Îles Mariannes du Nord | territoire | Q16644 | Îles Mariannes du Nord | article de l'item |
| Îles mineures éloignées des États-Unis | territoire | Q16645 | Îles mineures éloignées des États-Unis | article de l'item |
| Îles Pitcairn | territoire | Q35672 | Îles Pitcairn | article de l'item |
| Îles Spratleys | zone contestée | Q215664 | Îles Spratleys | article de l'item |
| Îles Turques-et-Caïques | territoire | Q18221 | Îles Turques-et-Caïques | article de l'item |
| Îles Vierges britanniques | territoire | Q25305 | Îles Vierges britanniques | article de l'item |
| Îles Vierges des États-Unis | territoire | Q11703 | Îles Vierges des États-Unis | article de l'item |
| Jersey | territoire | Q785 | Jersey | article de l'item |
| Macao | territoire | Q14773 | Macao | article de l'item |
| Montserrat | territoire | Q13353 | Montserrat (Antilles) | article de l'item |
| Niue | territoire | Q34020 | Niue | article de l'item |
| Nouvelle-Calédonie | territoire | Q33788 | Nouvelle-Calédonie | article de l'item |
| Polynésie française | territoire | Q30971 | Polynésie française | article de l'item |
| Porto Rico | territoire | Q1183 | Porto Rico | article de l'item |
| Récif de Scarborough | zone contestée | Q628716 | Récif de Scarborough | article de l'item |
| Sahara occidental | zone contestée | Q6250 | Sahara occidental | article de l'item |
| Saint-Barthélemy | territoire | Q25362 | Saint-Barthélemy (Antilles françaises) | article de l'item |
| Saint-Martin | territoire | Q126125 | Saint-Martin (Antilles françaises) | article de l'item |
| Saint-Martin (partie néerlandaise) | territoire | Q26273 | Saint-Martin (royaume des Pays-Bas) | article de l'item |
| Saint-Pierre-et-Miquelon | territoire | Q34617 | Saint-Pierre-et-Miquelon | article de l'item |
| Sainte-Hélène | territoire | Q192184 | Sainte-Hélène, Ascension et Tristan da Cunha | article de l'item |
| Samoa américaines | territoire | Q16641 | Samoa américaines | article de l'item |
| Somaliland | zone contestée | Q34754 | Somaliland | article de l'item |
| Terres australes françaises | territoire | Q129003 | Terres australes et antarctiques françaises | article de l'item |
| Territoire britannique de l’océan Indien | territoire | Q43448 | Territoire britannique de l'océan Indien | article de l'item |
| Territoires extérieurs australiens de l'Océan Indien | territoire | Q4824275 | Territoires australiens de l'océan Indien | article de l'item |
| Wallis-et-Futuna | territoire | Q35555 | Wallis-et-Futuna | article de l'item |
| Zone tampon des Nations unies à Chypre | zone contestée | Q116970 | Ligne verte (Chypre) | article de l'item |
