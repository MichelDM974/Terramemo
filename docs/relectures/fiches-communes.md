# Fiches des communes de La Réunion : tableau à relire

*Écrit par le build (`npm run fiches`, `geodata/fiches-communes.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. Ticket #34, lot F5 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.4 et § 9 (« Relectures demandées »).*

## Comment relire, comment corriger

- Ce que montre la fiche d'une commune : ses habitants (avec l'année du recensement), sa superficie, son gentilé, son intercommunalité, ses communes voisines (des boutons, qui ouvrent leur fiche) et le lien vers Wikipédia. Sa barre, en bas de la carte, dit ses habitants (« 85 000 hab. »).
- **À relire : la section 1 seulement**, les gentilés. Elle est **tue dans la fiche** tant que la clé `gentile_communes` de `LIGNES_RELUES` (`src/fiches/relues.ts`) est à `false` : la fiche n'a pas de ligne « Gentilé » d'ici là. Une fois la section relue, passer la clé à `true`.
- Les sections 2 et 3 sont **déjà en ligne**, données ici pour information : les sigles des intercommunalités (écrits à la main, un par intercommunalité) et les chiffres de l'IGN (lus tels quels). Un sigle faux se corrige comme un gentilé.
- Pour corriger : la ligne de la commune dans `geodata/fiches-main.json` (clé donnée en tête de section, une raison par ligne), puis `npm run fiches`. Le build échoue si une ligne ne s'applique plus (une forme déjà celle de Wikidata, une intercommunalité renommée par l'IGN). Pour valider une ligne « à relire » : **retirer la ligne entière** (la forme de Wikidata est alors prise sans doute ; retirer son seul `verifier` fait échouer le build), ou la remplacer par une autre forme (`masculin`, avec sa source `cite`) ou un autre pluriel (`pluriel`).
- Sources : Wikidata (extrait des communes du 2026-11-18) pour les gentilés et les liens ; l'IGN, ADMIN EXPRESS COG CARTO (édition du 2026-01-01, mise à jour du 2026-06-30) pour les habitants (recensement de l'INSEE), la superficie cadastrale et l'intercommunalité. Seconde source des gentilés : l'infobox de l'article de la Wikipédia en français de chaque commune, lue le 18/11/2026 (révisions citées dans les lignes, et dans `public/geo/sources.json`).

## 1. Gentilés (clé `gentile_communes`)

**Dans la fiche : tue** tant que `gentile_communes` est à `false` dans `src/fiches/relues.ts`.

Règle : la forme masculine singulière de Wikidata (P1549, en français), mise au pluriel comme pour un pays (un « s », sauf après s, x ou z) ; la fiche dit « les Saint-Pierrois ». Les 24 formes de Wikidata ont été comparées à l'infobox de l'article de la Wikipédia en français de chaque commune : elles s'accordent toutes, au nombre près ; les 4 lignes de la table disent ce qui reste à voir (une seconde forme, un accent, une forme qui surprend).

| Commune | Gentilé (Wikidata) | La fiche dira | Les deux sources | Le doute | À relire |
|---|---|---|---|---|---|
| L’Étang-Salé | Étang-Saléen | les Étang-Saléens | « Étang-Saléen » (Wikidata) ; l'infobox de la Wikipédia en français (« L'Étang-Salé », révision 237556683) donne « Étang-Saléens ou Dominicains » | une seconde forme, « Dominicains », que Wikidata n'a pas : la fiche n'en montre qu'une, « les Étang-Saléens » | **à relire** |
| Petite-Île | Petite-Îlois | les Petite-Îlois | « Petite-Îlois » (Wikidata) ; l'infobox de la Wikipédia en français (« Petite-Île », révision 240647533) écrit « Petite-Ilois », sans accent circonflexe | les deux sources diffèrent par l'accent ; gardée la forme de Wikidata, qui garde celui du nom de la commune (Petite-Île) | **à relire** |
| Saint-Benoît | Bénédictin | les Bénédictins | « Bénédictin » (Wikidata) ; l'infobox de la Wikipédia en français (« Saint-Benoît (La Réunion) », révision 240227741) : « Bénédictins » | les deux sources s'accordent, mais la forme surprend : tirée du nom latin du saint (Benedictus), et non « Saint-Benoîtois » ; elle se confond avec les moines bénédictins | **à relire** |
| Sainte-Marie | Sainte-Marien | les Sainte-Mariens | « Sainte-Marien » (Wikidata) ; l'infobox de la Wikipédia en français (« Sainte-Marie (La Réunion) », révision 236360075) : « Sainte-Mariens » | les deux sources s'accordent (la fiche dit « les Sainte-Mariens ») ; le masculin singulier, seul dans Wikidata, est rare à l'écrit (relevé R4) | **à relire** |

Les 24 communes (les 4 ci-dessus comprises) : les 20 autres ont la même forme dans Wikidata et dans l'infobox de la Wikipédia en français ; il reste à dire si une forme est fausse ou peu usitée.

| Commune | Masculin | La fiche dira | Source | Ligne de la table |
|---|---|---|---|---|
| Bras-Panon | Panonnais | les Panonnais | Wikidata | — |
| Cilaos | Cilaosien | les Cilaosiens | Wikidata | — |
| Entre-Deux | Entre-Deusien | les Entre-Deusiens | Wikidata | — |
| L’Étang-Salé | Étang-Saléen | les Étang-Saléens | Wikidata | oui, ci-dessus |
| La Plaine-des-Palmistes | Palmiplainois | les Palmiplainois | Wikidata | — |
| La Possession | Possessionnais | les Possessionnais | Wikidata | — |
| Le Port | Portois | les Portois | Wikidata | — |
| Le Tampon | Tamponnais | les Tamponnais | Wikidata | — |
| Les Avirons | Avironnais | les Avironnais | Wikidata | — |
| Les Trois-Bassins | Trois-Bassinois | les Trois-Bassinois | Wikidata | — |
| Petite-Île | Petite-Îlois | les Petite-Îlois | Wikidata | oui, ci-dessus |
| Saint-André | Saint-Andréen | les Saint-Andréens | Wikidata | — |
| Saint-Benoît | Bénédictin | les Bénédictins | Wikidata | oui, ci-dessus |
| Saint-Denis | Dionysien | les Dionysiens | Wikidata | — |
| Saint-Joseph | Saint-Joséphois | les Saint-Joséphois | Wikidata | — |
| Saint-Leu | Saint-Leusien | les Saint-Leusiens | Wikidata | — |
| Saint-Louis | Saint-Louisien | les Saint-Louisiens | Wikidata | — |
| Saint-Paul | Saint-Paulois | les Saint-Paulois | Wikidata | — |
| Saint-Philippe | Saint-Philippois | les Saint-Philippois | Wikidata | — |
| Saint-Pierre | Saint-Pierrois | les Saint-Pierrois | Wikidata | — |
| Sainte-Marie | Sainte-Marien | les Sainte-Mariens | Wikidata | oui, ci-dessus |
| Sainte-Rose | Sainte-Rosien | les Sainte-Rosiens | Wikidata | — |
| Sainte-Suzanne | Sainte-Suzannois | les Sainte-Suzannois | Wikidata | — |
| Salazie | Salazien | les Salaziens | Wikidata | — |

## 2. Intercommunalités (clé `epci`) — en ligne, pour information

L'IGN donne pour chaque commune le SIREN de son intercommunalité, et le nom officiel de celle-ci (long) ; la fiche dit le sigle, écrit à la main. 5 communautés d'agglomération couvrent l'île.

| Sigle | Nom de l'IGN | SIREN | Communes | Raison |
|---|---|---|---|---|
| CASUD | CA du Sud | 249740085 | 4 : Entre-Deux, Le Tampon, Saint-Joseph, Saint-Philippe | l'IGN la nomme « CA du Sud », sans sigle ; « CASUD » est celui qu'elle emploie elle-même (titre de son site, www.casud.re, lu le 18/11/2026 : « Communauté d’Agglomération du Sud de La Réunion (CASUD) ») et celui de la presse que cite la Wikipédia en français (« Communauté d'agglomération du Sud », révision 234996175), dont la première phrase l'abrège pourtant « CA Sud » |
| CINOR | CA Intercommunale du Nord de la Réunion (CINOR) | 249740119 | 3 : Saint-Denis, Sainte-Marie, Sainte-Suzanne | le sigle du nom officiel de l'IGN |
| CIREST | CA Intercommunale de la Réunion Est (CIREST) | 249740093 | 6 : Bras-Panon, La Plaine-des-Palmistes, Saint-André, Saint-Benoît, Sainte-Rose, Salazie | le sigle du nom officiel de l'IGN |
| CIVIS | CA CIVIS (Communauté Intercommunale des Villes Solidaires) | 249740077 | 6 : Cilaos, L’Étang-Salé, Les Avirons, Petite-Île, Saint-Louis, Saint-Pierre | le sigle du nom officiel de l'IGN |
| TCO | CA Territoire de la Côte Ouest (TCO) | 249740101 | 5 : La Possession, Le Port, Les Trois-Bassins, Saint-Leu, Saint-Paul | le sigle du nom officiel de l'IGN |

## 3. Habitants et superficies (IGN) — en ligne, pour information

Habitants : la population municipale du recensement de l'INSEE de 2023, telle que l'IGN la donne ; 889 679 pour l'île. Superficie : la superficie cadastrale de l'IGN (le chiffre officiel), pas celle du tracé de la carte, qui en diffère surtout à l'Entre-Deux et au Tampon (colonne « Écart » : le tracé par rapport au cadastre). La carte garde son tracé ; la fiche donne le chiffre officiel.

| Commune | Habitants | Superficie | Tracé de la carte | Écart |
|---|---|---|---|---|
| Bras-Panon | 13 012 (2023) | 88,6 km² | 87,58 km² | − 1,2 % |
| Cilaos | 5 040 (2023) | 84,4 km² | 84,63 km² | + 0,3 % |
| Entre-Deux | 7 176 (2023) | 66,8 km² | 51,55 km² | − 22,8 % |
| L’Étang-Salé | 14 464 (2023) | 38,6 km² | 38,47 km² | − 0,3 % |
| La Plaine-des-Palmistes | 6 936 (2023) | 83,2 km² | 83,31 km² | + 0,1 % |
| La Possession | 36 568 (2023) | 118,3 km² | 119,13 km² | + 0,7 % |
| Le Port | 33 969 (2023) | 16,6 km² | 16,15 km² | − 2,7 % |
| Le Tampon | 82 579 (2023) | 165,4 km² | 181,69 km² | + 9,8 % |
| Les Avirons | 11 536 (2023) | 26,3 km² | 26,34 km² | + 0,2 % |
| Les Trois-Bassins | 7 221 (2023) | 42,6 km² | 42,65 km² | + 0,1 % |
| Petite-Île | 13 067 (2023) | 33,9 km² | 34,08 km² | + 0,5 % |
| Saint-André | 58 885 (2023) | 53,1 km² | 54,53 km² | + 2,7 % |
| Saint-Benoît | 38 604 (2023) | 229,6 km² | 230,54 km² | + 0,4 % |
| Saint-Denis | 155 634 (2023) | 142,8 km² | 142,01 km² | − 0,6 % |
| Saint-Joseph | 39 207 (2023) | 178,5 km² | 178,34 km² | − 0,1 % |
| Saint-Leu | 36 163 (2023) | 118,4 km² | 118,48 km² | + 0,1 % |
| Saint-Louis | 54 941 (2023) | 98,9 km² | 99,11 km² | + 0,2 % |
| Saint-Paul | 108 088 (2023) | 241,3 km² | 241,1 km² | − 0,1 % |
| Saint-Philippe | 5 082 (2023) | 153,9 km² | 155,11 km² | + 0,8 % |
| Saint-Pierre | 85 038 (2023) | 96 km² | 96,61 km² | + 0,6 % |
| Sainte-Marie | 37 093 (2023) | 87,2 km² | 88,81 km² | + 1,8 % |
| Sainte-Rose | 6 557 (2023) | 177,6 km² | 178,12 km² | + 0,3 % |
| Sainte-Suzanne | 25 551 (2023) | 57,8 km² | 58,01 km² | + 0,4 % |
| Salazie | 7 268 (2023) | 103,8 km² | 104,21 km² | + 0,4 % |
