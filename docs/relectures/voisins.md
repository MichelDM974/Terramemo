# Voisins du J4 : ce qui ne compte ni pour ni contre, à relire

*Écrit à la main au lot 2 du J4 (ticket #6 ; étude `docs/etudes/2026-11-25-j4-conception.md`, § 3 ; D605, D606 ; S612). Rien ici ne change une fiche : les fiches `voisins:<pays>:…` sont celles des 156 pays qui ont au moins un voisin jouable, quoi que tu décides ci-dessous. Le sujet est donc livré visible, sans attendre cette relecture.*

Dans « Touche les voisins de la Serbie », un voisin **neutre** ne compte ni pour ni contre : le toucher ne finit pas la question, et la rétroaction le cite à part à la fin (« aussi : Albanie (par une zone contestée), Kosovo (paquet optionnel) »). Deux sortes de neutres (D605 a, que tu as retenue) :

1. les voisins qui ne sont pas des pays jouables (territoires, entités contestées, paquet optionnel : le Kosovo pour la Serbie, Hong Kong et Macao pour la Chine, Gibraltar pour l'Espagne) : 28 liens, sur `pays.json` ;
2. les voisins **par une zone admise** : si un toucher dans une zone contestée compte pour un pays (décision « Zones contestées et enclaves »), les pays que cette zone borde touchent ce pays.

## Ce que tu as à trancher

**Les voisins par une zone admise (S612).** L'étude en comptait 3, mesurés sur les entités seules ; calculés au lot 2 sur les formes de la carte (`monde.topo.json`), les zones hachurées en ajoutent 10. La règle appliquée telle quelle donne les 13 paires du tableau, neutres dans les deux sens. Elles te vont toutes, ou faut-il en retirer (elles deviendraient des fautes) ?

| Pays | Voisin neutre | Par la zone | Pourquoi |
|---|---|---|---|
| Maroc | Mauritanie | Sahara occidental (`ESH`) | revendiqué par le Maroc (étude) |
| Somalie | Djibouti | Somaliland (`NE_SOL`) | revendiqué par la Somalie (étude) |
| Serbie | Albanie | Kosovo (`XKX`) | revendiqué par la Serbie (étude) |
| Inde | Afghanistan | Gilgit-Baltistan (`NE_B08`) | tenu par le Pakistan, revendiqué par l'Inde |
| Chine | Japon | îles Senkaku (`NE_B18`) | tenues par le Japon, revendiquées par la Chine |
| Comores | France | Mayotte (`NE_B22`) | tenue par la France, revendiquée par les Comores |
| Japon | Russie | Kouriles du Sud (`NE_B29`) | tenues par la Russie, revendiquées par le Japon |
| Danemark | Royaume-Uni | Rockall (`NE_B31`) | tenu par le Royaume-Uni, revendiqué par le Danemark |
| Islande | Royaume-Uni | Rockall (`NE_B31`) | de même, par l'Islande |
| Japon | Corée du Sud | Dokdo / Takeshima (`NE_B39`) | tenues par la Corée du Sud, revendiquées par le Japon |
| Arabie saoudite | Égypte | îles de Tiran et Sanafir (`NE_B68`) | tenues par l'Égypte, revendiquées par l'Arabie saoudite |
| Émirats arabes unis | Iran | Abou Moussa et les Tunb (`NE_B73`) | tenues par l'Iran, revendiquées par les Émirats |
| Philippines | Malaisie | Sabah (`NE_C04`) | tenu par la Malaisie, revendiqué par les Philippines |

Les Comores, le Japon, l'Islande et les Philippines n'ont pas de question à eux (aucun voisin jouable de fait) : leurs paires ne jouent que dans la question de l'autre pays (« voisins de la France » : les Comores neutres) ; les autres jouent dans les deux sens. Recommandation : **les garder**, c'est la règle de D605 a sans exception ; aucune n'est demandée, et une faute qui prendrait parti serait pire qu'un toucher neutre.

**Le libellé des non-jouables.** Le statut entre parenthèses est celui de la fiche d'un lieu : « Kosovo (paquet optionnel) », « Hong Kong (territoire) », « Somaliland (statut contesté) ». « Paquet optionnel » pour le Kosovo te va-t-il dans cette phrase ?

**Les ensembles ambigus de Reconnaître (D606 a, pour information).** Quatre listes de voisins désignent deux pays chacune, justes tous les deux (jamais leurres l'un de l'autre) : les Émirats et le Yémen (Arabie saoudite, Oman), le Bhoutan et le Népal (Chine, Inde), la Papouasie-Nouvelle-Guinée et le Timor oriental (Indonésie), Saint-Marin et le Vatican (Italie).

## Comment corriger

- Les paires : `VOISINS_PAR_ZONE` de `src/exercices/voisins.ts` ; `tests/voisins.test.ts` les recalcule sur `pays.json` et `monde.topo.json` (une paire retirée y est à retirer aussi, avec sa raison).
- Le libellé : `textes-voisins.fr.json` (`statut`), ou `textes.carte.statuts` pour la fiche aussi.
