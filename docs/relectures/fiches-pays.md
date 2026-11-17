# Fiches des pays : tableaux à relire

*Écrit par le build (`npm run fiches`, `geodata/fiches-relecture.mjs`) : ne pas éditer ce fichier, il est refait à chaque passage. Ticket #34, lot F2 ; étude `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 2.1, § 2.5 et § 9.*

## Comment relire, comment corriger

- Chaque section reprend une clé de `geodata/fiches-main.json`, la seule table tenue à la main. Une ligne de la table a sa raison ; les lignes marquées **à relire** portent un fait incertain ou un choix qui revient à l'utilisateur.
- Pour corriger : changer la ligne dans `geodata/fiches-main.json` (la clé est donnée en tête de chaque section), puis `npm run fiches`. Le build refait les fichiers servis et ce document ; il échoue si une ligne ne s'applique plus (valeur déjà celle de la source, pays inconnu, raison absente).
- Pour valider une ligne « à relire » : retirer `"a_relire": true` de la ligne, ou la remplacer par une autre valeur avec sa raison.
- Sources : Wikidata (extrait du 2026-11-17), Banque mondiale (World Development Indicators (WDI), Population, total (SP.POP.TOTL), 2025, mise à jour du 2026-11-11), CLDR 49.0.0, base tz 2026e ; seconde source des sommets et des fêtes : la Wikipédia en français (révisions citées dans les lignes). Le build ne lit ni la Wikipédia ni le Factbook : les valeurs qui en viennent sont écrites dans la table, avec leur source, et ces pages sont citées dans `public/geo/sources.json`.

## 1. Fêtes nationales (clé `fete`)

197 pays ; 2 sans fête ; 19 où le World Factbook donne plusieurs jours (colonne « Plusieurs ») ; 44 à relire. Le Factbook pré-remplit (texte anglais, domaine public) ; la liste de la Wikipédia sert de seconde source.

| Pays | Jour | Nom | Plusieurs | Factbook | Wikipédia | Raison |  |
|---|---|---|---|---|---|---|---|
| Afghanistan | 19 août | Fête de l'indépendance | oui | previous: Independence Day, 19 August (1919); under the Taliban Government, 15 August (2022) is declared a national holiday, marking the anniversary of the victory of the Afghan jihad | 19 août | Factbook : le 19 août (fête de l'indépendance de 1919) et le 15 août (fête déclarée par le gouvernement taliban, 2022) ; retenu le 19 août, la fête de l'indépendance, que la liste de Wikipédia donne seule | **à relire** |
| Afrique du Sud | 27 avril | Fête de la liberté |  | Freedom Day, 27 April (1994) | 27 avril | Factbook et liste de Wikipédia : le 27 avril |  |
| Albanie | 28 novembre | Fête de l'indépendance |  | Independence Day, 28 November (1912), also known as Flag Day | 28 novembre | Factbook et liste de Wikipédia : le 28 novembre |  |
| Algérie | 5 juillet | Fête de l'indépendance | oui | Independence Day, 5 July (1962); Revolution Day, 1 November (1954) | 5 juillet | Factbook : le 5 juillet (indépendance) et le 1er novembre (déclenchement de la Révolution) ; retenu le 5 juillet, que la liste de Wikipédia donne seul ; le 1er novembre est aussi célébré comme fête nationale : à relire | **à relire** |
| Allemagne | 3 octobre | Jour de l'Unité allemande |  | German Unity Day, 3 October (1990) | 3 octobre | Factbook et liste de Wikipédia : le 3 octobre |  |
| Andorre | 8 septembre | Fête de Notre-Dame de Meritxell |  | Our Lady of Meritxell Day, 8 September (1278) | 8 septembre, 14 mars | Factbook : le 8 septembre ; la liste de Wikipédia donne 8 septembre, 14 mars : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Angola | 11 novembre | Fête de l'indépendance |  | Independence Day, 11 November (1975) | 11 novembre | Factbook et liste de Wikipédia : le 11 novembre |  |
| Antigua-et-Barbuda | 1er novembre | Fête de l'indépendance |  | Independence Day, 1 November (1981) | 1er novembre | Factbook et liste de Wikipédia : le 1er novembre |  |
| Arabie saoudite | 23 septembre | Fête nationale |  | Saudi National Day (Unification of the Kingdom), 23 September (1932) | 23 septembre | Factbook et liste de Wikipédia : le 23 septembre |  |
| Argentine | 25 mai | Fête de la révolution de Mai |  | Revolution Day (May Revolution Day), 25 May (1810) | 25 mai | Factbook et liste de Wikipédia : le 25 mai |  |
| Arménie | 21 septembre | Fête de l'indépendance |  | Independence Day, 21 September (1991) | 21 septembre | Factbook et liste de Wikipédia : le 21 septembre |  |
| Australie | 26 janvier | Jour de l'Australie | oui | Australia Day (commemorates the arrival of the First Fleet of Australian settlers), 26 January (1788); ANZAC Day (commemorates the anniversary of the landing of troops of the Australian and New Zealand Army Corps during World War I at Gallipoli, Turkey), 25 April (1915) | 26 janvier | Factbook : le 26 janvier (Jour de l'Australie) et le 25 avril (Anzac Day, commémoration militaire) ; retenu le 26 janvier, la fête nationale, seul jour de la liste de Wikipédia | **à relire** |
| Autriche | 26 octobre | Fête nationale |  | National Day (commemorates passage of the law on permanent neutrality), 26 October (1955) | 26 octobre | Factbook et liste de Wikipédia : le 26 octobre |  |
| Azerbaïdjan | 28 mai | Fête de l'indépendance |  | Republic Day (founding of the Democratic Republic of Azerbaijan), 28 May (1918) | 28 mai | Factbook et liste de Wikipédia : le 28 mai ; nom : le Factbook dit « Republic Day » ; « Jour de l'indépendance » depuis 2021 (estimé, de mémoire) : à relire | **à relire** |
| Bahamas | 10 juillet | Fête de l'indépendance |  | Independence Day, 10 July (1973) | 10 juillet | Factbook et liste de Wikipédia : le 10 juillet |  |
| Bahreïn | 16 décembre | Fête nationale |  | National Day, 16 December (1971) | 16 décembre | Factbook et liste de Wikipédia : le 16 décembre |  |
| Bangladesh | 26 mars | Fête de l'indépendance | oui | Independence Day, 26 March (1971); Victory Day, 16 December (1971) | 26 mars | Factbook : le 26 mars (indépendance) et le 16 décembre (Jour de la victoire) ; retenu le 26 mars, que la liste de Wikipédia donne seul | **à relire** |
| Barbade | 30 novembre | Fête de l'indépendance |  | Independence Day, 30 November (1966) | 30 novembre | Factbook et liste de Wikipédia : le 30 novembre |  |
| Belgique | 21 juillet | Fête nationale |  | Belgian National Day (ascension to the throne of King LEOPOLD I), 21 July (1831) | 21 juillet | Factbook et liste de Wikipédia : le 21 juillet |  |
| Belize | 21 septembre | Fête de l'indépendance | oui | Battle of St. George's Caye Day (National Day), 10 September (1798); Independence Day, 21 September (1981) | 21 septembre | Factbook : le 10 septembre (bataille de St. George's Caye, dite « National Day ») et le 21 septembre (indépendance) ; retenu le 21 septembre, que la liste de Wikipédia donne seul (elle suit les fêtes nationales déclarées à l'ONU) ; le 10 septembre porte le nom de « National Day » : à relire | **à relire** |
| Bénin | 1er août | Fête de l'indépendance |  | Independence Day, 1 August (1960) | 1er août | Factbook et liste de Wikipédia : le 1er août |  |
| Bhoutan | 17 décembre | Fête nationale |  | National Day (Ugyen WANGCHUCK became first hereditary king), 17 December (1907) | 17 décembre | Factbook et liste de Wikipédia : le 17 décembre |  |
| Biélorussie | 3 juillet | Fête de l'indépendance |  | Independence Day, 3 July (1944) | 3 juillet | Factbook et liste de Wikipédia : le 3 juillet |  |
| Bolivie | 6 août | Fête de l'indépendance |  | Independence Day, 6 August (1825) | 6 août | Factbook et liste de Wikipédia : le 6 août |  |
| Bosnie-Herzégovine | aucune | — | oui | Independence Day, 1 March (1992) and Statehood Day, 25 November (1943) - both observed in the Federation of Bosnia and Herzegovina entity; Victory Day, 9 May (1945) and Dayton Agreement Day, 21 November (1995) - both observed in the Republika Srpska entity | — | Le Factbook donne quatre jours, deux par entité (1er mars et 25 novembre dans la Fédération, 9 mai et 21 novembre en Republika Srpska), et aucun pour l'État ; la liste de Wikipédia donne le 21 novembre (accords de Dayton). Aucune fête que l'État commun se donne : pas de ligne, à relire | **à relire** |
| Botswana | 30 septembre | Fête de l'indépendance |  | Independence Day (Botswana Day), 30 September (1966) | 30 septembre | Factbook et liste de Wikipédia : le 30 septembre |  |
| Brésil | 7 septembre | Fête de l'indépendance |  | Independence Day, 7 September (1822) | 7 septembre | Factbook et liste de Wikipédia : le 7 septembre |  |
| Brunei | 23 février | Fête nationale |  | National Day, 23 February (1984) | 23 février | Factbook et liste de Wikipédia : le 23 février |  |
| Bulgarie | 3 mars | Fête de la libération |  | Liberation Day, 3 March (1878) | 3 mars | Factbook et liste de Wikipédia : le 3 mars |  |
| Burkina Faso | 11 décembre | Fête de la République |  | Republic Day, 11 December (1958) | 11 décembre | Factbook et liste de Wikipédia : le 11 décembre |  |
| Burundi | 1er juillet | Fête de l'indépendance |  | Independence Day, 1 July (1962) | 1er juillet | Factbook et liste de Wikipédia : le 1er juillet |  |
| Cambodge | 9 novembre | Fête de l'indépendance |  | Independence Day, 9 November (1953) | 9 novembre | Factbook et liste de Wikipédia : le 9 novembre |  |
| Cameroun | 20 mai | Fête nationale |  | State Unification Day (National Day), 20 May (1972) | 20 mai | Factbook et liste de Wikipédia : le 20 mai |  |
| Canada | 1er juillet | Fête du Canada |  | Canada Day, 1 July (1867) | 1er juillet | Factbook et liste de Wikipédia : le 1er juillet |  |
| Cap-Vert | 5 juillet | Fête de l'indépendance |  | Independence Day, 5 July (1975) | 5 juillet | Factbook et liste de Wikipédia : le 5 juillet |  |
| Chili | 18 septembre | Fête de l'indépendance |  | Independence Day, 18 September (1810) | 18 septembre | Factbook et liste de Wikipédia : le 18 septembre |  |
| Chine | 1er octobre | Fête nationale |  | National Day (anniversary of the founding of the People's Republic of China), 1 October (1949) | 1er octobre | Factbook et liste de Wikipédia : le 1er octobre |  |
| Chypre | 1er octobre | Fête de l'indépendance |  | Independence Day, 1 October (1960) | 1er octobre | Factbook et liste de Wikipédia : le 1er octobre |  |
| Colombie | 20 juillet | Fête de l'indépendance |  | Independence Day, 20 July (1810) | 20 juillet | Factbook et liste de Wikipédia : le 20 juillet |  |
| Comores | 6 juillet | Fête de l'indépendance |  | Independence Day, 6 July (1975) | 6 juillet | Factbook et liste de Wikipédia : le 6 juillet |  |
| Congo-Brazzaville | 15 août | Fête de l'indépendance |  | Independence Day, 15 August (1960) | 15 août | Factbook et liste de Wikipédia : le 15 août |  |
| Congo-Kinshasa | 30 juin | Fête de l'indépendance |  | Independence Day, 30 June (1960) | 30 juin | Factbook et liste de Wikipédia : le 30 juin |  |
| Corée du Nord | 9 septembre | Fête de la fondation de la République |  | Founding of the Democratic People's Republic of Korea (DPRK), 9 September (1948) | 9 septembre | Factbook et liste de Wikipédia : le 9 septembre |  |
| Corée du Sud | 15 août | Fête de la libération |  | Liberation Day, 15 August (1945) | 3 octobre, 15 août | Factbook : le 15 août ; la liste de Wikipédia donne 3 octobre, 15 août : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Costa Rica | 15 septembre | Fête de l'indépendance |  | Independence Day, 15 September (1821) | 15 septembre | Factbook et liste de Wikipédia : le 15 septembre |  |
| Côte d’Ivoire | 7 août | Fête de l'indépendance |  | Independence Day, 7 August (1960) | 7 août | Factbook et liste de Wikipédia : le 7 août |  |
| Croatie | 30 mai | Fête de l'État |  | Statehood Day (National Day), 30 May (1990) | 30 mai | Factbook et liste de Wikipédia : le 30 mai |  |
| Cuba | 1er janvier | Triomphe de la Révolution |  | Triumph of the Revolution (Liberation Day), 1 January (1959) | 1er janvier, 26 juillet | Factbook : le 1er janvier ; la liste de Wikipédia donne 1er janvier, 26 juillet : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Danemark | 5 juin | Fête de la Constitution |  | Constitution Day, 5 June (1849) | 5 juin | Factbook et liste de Wikipédia : le 5 juin |  |
| Djibouti | 27 juin | Fête de l'indépendance |  | Independence Day, 27 June (1977) | 27 juin | Factbook et liste de Wikipédia : le 27 juin |  |
| Dominique | 3 novembre | Fête de l'indépendance |  | Independence Day, 3 November (1978) | 3 novembre | Factbook et liste de Wikipédia : le 3 novembre |  |
| Égypte | 23 juillet | Fête de la Révolution |  | Revolution Day, 23 July (1952) | 23 juillet | Factbook et liste de Wikipédia : le 23 juillet |  |
| Émirats arabes unis | 2 décembre | Fête nationale |  | Independence Day (National Day), 2 December (1971) | 2 décembre | Factbook et liste de Wikipédia : le 2 décembre |  |
| Équateur | 10 août | Fête de l'indépendance |  | Independence Day (independence of Quito), 10 August (1809) | 10 août | Factbook et liste de Wikipédia : le 10 août |  |
| Érythrée | 24 mai | Fête de l'indépendance |  | Independence Day, 24 May (1991) | 24 mai | Factbook et liste de Wikipédia : le 24 mai |  |
| Espagne | 12 octobre | Fête nationale |  | National Day (Hispanic Day), 12 October (1492) | 12 octobre | Factbook et liste de Wikipédia : le 12 octobre |  |
| Estonie | 24 février | Fête de l'indépendance |  | Independence Day, 24 February (1918) | 24 février | Factbook et liste de Wikipédia : le 24 février |  |
| Eswatini | 6 septembre | Fête de l'indépendance |  | Independence Day (Somhlolo Day), 6 September (1968) | 6 septembre | Factbook et liste de Wikipédia : le 6 septembre |  |
| État de la Cité du Vatican | 18 mai | Anniversaire de l'inauguration du pontificat |  | — | 18 mai | Pas de fête du Saint-Siège dans le relevé du Factbook ; la liste de Wikipédia donne le 18 mai, anniversaire de la messe d'inauguration du pontificat de Léon XIV (2025) : la date change avec le pape, à relire | **à relire** |
| États-Unis | 4 juillet | Fête de l'indépendance |  | Independence Day, 4 July (1776) | 4 juillet | Factbook et liste de Wikipédia : le 4 juillet |  |
| Éthiopie | 28 mai | Jour de la chute du Derg |  | Derg Downfall Day (defeat of MENGISTU regime), 28 May (1991) | 28 mai | Factbook et liste de Wikipédia : le 28 mai |  |
| Fidji | 10 octobre | Jour des Fidji |  | Fiji (Independence) Day, 10 October (1970) | 10 octobre | Factbook et liste de Wikipédia : le 10 octobre |  |
| Finlande | 6 décembre | Fête de l'indépendance |  | Independence Day, 6 December (1917) | 6 décembre | Factbook et liste de Wikipédia : le 6 décembre |  |
| France | 14 juillet | Fête nationale |  | Fête de la Fédération, 14 July (1790) | 14 juillet | Factbook et liste de Wikipédia : le 14 juillet |  |
| Gabon | 17 août | Fête de l'indépendance |  | Independence Day, 17 August (1960) | 17 août | Factbook et liste de Wikipédia : le 17 août |  |
| Gambie | 18 février | Fête de l'indépendance |  | Independence Day, 18 February (1965) | 18 février | Factbook et liste de Wikipédia : le 18 février |  |
| Géorgie | 26 mai | Fête de l'indépendance |  | Independence Day, 26 May (1918) | 26 mai | Factbook et liste de Wikipédia : le 26 mai |  |
| Ghana | 6 mars | Fête de l'indépendance |  | Independence Day, 6 March (1957) | 6 mars | Factbook et liste de Wikipédia : le 6 mars |  |
| Grèce | 25 mars | Fête de l'indépendance |  | Independence Day, 25 March (1821) | 25 mars, 28 octobre | Factbook : le 25 mars ; la liste de Wikipédia donne 25 mars, 28 octobre : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Grenade | 7 février | Fête de l'indépendance |  | Independence Day, 7 February (1974) | 7 février | Factbook et liste de Wikipédia : le 7 février |  |
| Guatemala | 15 septembre | Fête de l'indépendance |  | Independence Day, 15 September (1821) | 15 septembre | Factbook et liste de Wikipédia : le 15 septembre |  |
| Guinée | 2 octobre | Fête de l'indépendance |  | Independence Day, 2 October (1958) | 2 octobre | Factbook et liste de Wikipédia : le 2 octobre |  |
| Guinée équatoriale | 12 octobre | Fête de l'indépendance |  | Independence Day, 12 October (1968) | 12 octobre | Factbook et liste de Wikipédia : le 12 octobre |  |
| Guinée-Bissau | 24 septembre | Fête de l'indépendance |  | Independence Day, 24 September (1973) | 24 septembre | Factbook et liste de Wikipédia : le 24 septembre |  |
| Guyana | 23 février | Fête de la République |  | Republic Day, 23 February (1970) | 26 mai | Factbook : le 23 février ; la liste de Wikipédia donne 26 mai : retenu le Factbook, jour différent : à relire | **à relire** |
| Haïti | 1er janvier | Fête de l'indépendance |  | Independence Day, 1 January (1804) | 1er janvier | Factbook et liste de Wikipédia : le 1er janvier |  |
| Honduras | 15 septembre | Fête de l'indépendance |  | Independence Day, 15 September (1821) | 15 septembre | Factbook et liste de Wikipédia : le 15 septembre |  |
| Hongrie | 20 août | Fête de saint Étienne |  | Saint Stephen's Day, 20 August (1083) | 15 mars, 20 août, 23 octobre | Factbook : le 20 août ; la liste de Wikipédia donne 15 mars, 20 août, 23 octobre : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Îles Marshall | 1er mai | Fête de la Constitution |  | Constitution Day, 1 May (1979) | 1er mai | Factbook et liste de Wikipédia : le 1er mai |  |
| Îles Salomon | 7 juillet | Fête de l'indépendance |  | Independence Day, 7 July (1978) | 7 juillet | Factbook et liste de Wikipédia : le 7 juillet |  |
| Inde | 26 janvier | Fête de la République |  | Republic Day, 26 January (1950) | 2 octobre, 15 août, 26 janvier | Factbook : le 26 janvier ; la liste de Wikipédia donne 2 octobre, 15 août, 26 janvier : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Indonésie | 17 août | Fête de l'indépendance |  | Independence Day, 17 August (1945) | 17 août | Factbook et liste de Wikipédia : le 17 août |  |
| Irak | 3 octobre | Fête nationale | oui | Independence Day, 3 October (1932); Republic Day, 14 July (1958) | 3 octobre, 14 juillet, 17 juillet | Factbook : le 3 octobre (indépendance) et le 14 juillet (République) ; retenu le 3 octobre, que la liste de Wikipédia nomme « fête nationale » | **à relire** |
| Iran | 1er avril | Jour de la République islamique |  | Republic Day, 1 April (1979) | 1er avril | Factbook et liste de Wikipédia : le 1er avril |  |
| Irlande | 17 mars | Saint-Patrick |  | Saint Patrick's Day, 17 March | 17 mars | Factbook et liste de Wikipédia : le 17 mars |  |
| Islande | 17 juin | Fête de l'indépendance |  | Independence Day, 17 June (1944) | 17 juin | Factbook et liste de Wikipédia : le 17 juin |  |
| Israël | 14 mai | Fête de l'indépendance |  | Independence Day, 14 May (1948) | 14 mai | Factbook et liste de Wikipédia : le 14 mai |  |
| Italie | 2 juin | Fête de la République |  | Republic Day, 2 June (1946) | 2 juin | Factbook et liste de Wikipédia : le 2 juin |  |
| Jamaïque | 6 août | Fête de l'indépendance |  | Independence Day, 6 August (1962) | 6 août | Factbook et liste de Wikipédia : le 6 août |  |
| Japon | 23 février | Anniversaire de l'empereur |  | Birthday of Emperor NARUHITO, 23 February (1960) | 11 février, 23 février | Factbook : le 23 février ; la liste de Wikipédia donne 11 février, 23 février : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Jordanie | 25 mai | Fête de l'indépendance |  | Independence Day, 25 May (1946) | 25 mai | Factbook et liste de Wikipédia : le 25 mai |  |
| Kazakhstan | 16 décembre | Fête de l'indépendance |  | Independence Day, 16 December (1991) | 16 décembre | Factbook et liste de Wikipédia : le 16 décembre |  |
| Kenya | 12 décembre | Jamhuri Day |  | Jamhuri Day (Independence Day), 12 December (1963) | 12 décembre | Factbook et liste de Wikipédia : le 12 décembre |  |
| Kirghizstan | 31 août | Fête de l'indépendance |  | Independence Day, 31 August (1991) | 31 août | Factbook et liste de Wikipédia : le 31 août |  |
| Kiribati | 12 juillet | Fête de l'indépendance |  | Independence Day, 12 July (1979) | 12 juillet | Factbook et liste de Wikipédia : le 12 juillet |  |
| Kosovo | 17 février | Fête de l'indépendance |  | Independence Day, 17 February (2008) | 17 février | Factbook et liste de Wikipédia : le 17 février |  |
| Koweït | 25 février | Fête nationale |  | National Day, 25 February (1950) | aucun jour | Factbook : le 25 février ; la liste de Wikipédia n'a pas ce pays : seconde source absente | **à relire** |
| Laos | 2 décembre | Fête nationale |  | Republic Day (National Day), 2 December (1975) | 2 décembre | Factbook et liste de Wikipédia : le 2 décembre |  |
| Lesotho | 4 octobre | Fête de l'indépendance |  | Independence Day, 4 October (1966) | 4 octobre | Factbook et liste de Wikipédia : le 4 octobre |  |
| Lettonie | 18 novembre | Fête de la proclamation de la République |  | Independence Day (Republic of Latvia Proclamation Day), 18 November (1918) | 4 mai, 18 novembre | Factbook : le 18 novembre ; la liste de Wikipédia donne 4 mai, 18 novembre : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Liban | 22 novembre | Fête de l'indépendance |  | Independence Day, 22 November (1943) | 22 novembre | Factbook et liste de Wikipédia : le 22 novembre |  |
| Liberia | 26 juillet | Fête de l'indépendance |  | Independence Day, 26 July (1847) | 26 juillet | Factbook et liste de Wikipédia : le 26 juillet |  |
| Libye | 23 octobre | Fête de la libération |  | Liberation Day, 23 October (2011) | 17 février, 23 octobre, 24 décembre | Factbook : le 23 octobre ; la liste de Wikipédia donne 17 février, 23 octobre, 24 décembre : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Liechtenstein | 15 août | Fête nationale |  | National Day, 15 August (1940) | 15 août | Factbook et liste de Wikipédia : le 15 août |  |
| Lituanie | 16 février | Jour du rétablissement de l'État |  | Independence Day (or National Day), 16 February (1918) | 6 juillet, 11 mars, 16 février | Factbook : le 16 février ; la liste de Wikipédia donne 6 juillet, 11 mars, 16 février : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Luxembourg | 23 juin | Fête nationale |  | National Day (birthday of Grand Duke HENRI), 23 June | 23 juin | Factbook et liste de Wikipédia : le 23 juin |  |
| Macédoine du Nord | 8 septembre | Fête de l'indépendance |  | Independence Day, 8 September (1991), also known as National Day | 2 août | Factbook : le 8 septembre ; la liste de Wikipédia donne 2 août : retenu le Factbook, jour différent : à relire | **à relire** |
| Madagascar | 26 juin | Fête de l'indépendance |  | Independence Day, 26 June (1960) | 26 juin | Factbook et liste de Wikipédia : le 26 juin |  |
| Malaisie | 31 août | Fête de l'indépendance | oui | Independence Day (or Merdeka Day), 31 August (1957) (independence of Malaya); Malaysia Day, 16 September (1963) (formation of Malaysia) | 31 août | Factbook : le 31 août (indépendance de la Malaisie péninsulaire) et le 16 septembre (Jour de la Malaisie) ; retenu le 31 août, que la liste de Wikipédia donne seul | **à relire** |
| Malawi | 6 juillet | Fête de l'indépendance |  | Independence Day, 6 July (1964) | 6 juillet | Factbook et liste de Wikipédia : le 6 juillet |  |
| Maldives | 26 juillet | Fête de l'indépendance |  | Independence Day, 26 July (1965) | 26 juillet | Factbook et liste de Wikipédia : le 26 juillet |  |
| Mali | 22 septembre | Fête de l'indépendance |  | Independence Day, 22 September (1960) | 22 septembre | Factbook et liste de Wikipédia : le 22 septembre |  |
| Malte | 21 septembre | Fête de l'indépendance | oui | Independence Day, 21 September (1964); Republic Day, 13 December (1974) | 21 septembre | Factbook : le 21 septembre (indépendance) et le 13 décembre (République) ; retenu le 21 septembre, que la liste de Wikipédia donne seul | **à relire** |
| Maroc | 30 juillet | Fête du Trône |  | Throne Day (accession of King MOHAMMED VI to the throne), 30 July (1999) | 30 juillet | Factbook et liste de Wikipédia : le 30 juillet |  |
| Maurice | 12 mars | Fête de l'indépendance et de la République |  | Independence and Republic Day, 12 March (1968, 1992) | 12 mars | Factbook et liste de Wikipédia : le 12 mars |  |
| Mauritanie | 28 novembre | Fête de l'indépendance |  | Independence Day, 28 November (1960) | 28 novembre | Factbook et liste de Wikipédia : le 28 novembre |  |
| Mexique | 16 septembre | Fête de l'indépendance |  | Independence Day, 16 September (1810) | 16 septembre | Factbook et liste de Wikipédia : le 16 septembre |  |
| Micronésie | 10 mai | Fête de la Constitution |  | Constitution Day, 10 May (1979) | 3 novembre | Factbook : le 10 mai ; la liste de Wikipédia donne 3 novembre : retenu le Factbook, jour différent : à relire | **à relire** |
| Moldavie | 27 août | Fête de l'indépendance |  | Independence Day, 27 August (1991) | 27 août | Factbook et liste de Wikipédia : le 27 août |  |
| Monaco | 19 novembre | Fête nationale |  | National Day (Saint Rainier's Day), 19 November (1857) | 19 novembre | Factbook et liste de Wikipédia : le 19 novembre |  |
| Mongolie | 11 juillet | Naadam | oui | Naadam (games) holiday, 11-15 July; Constitution Day, 26 November (1924) | 11 juillet, 12 juillet | Factbook : le Naadam du 11 au 15 juillet, et le 26 novembre (Constitution) ; retenu le 11 juillet, premier jour du Naadam (fête de la révolution de 1921), comme la liste de Wikipédia | **à relire** |
| Monténégro | 13 juillet | Fête de l'État |  | Statehood Day, 13 July (1878, 1941) | 13 juillet | Factbook et liste de Wikipédia : le 13 juillet |  |
| Mozambique | 25 juin | Fête de l'indépendance |  | Independence Day, 25 June (1975) | 25 juin | Factbook et liste de Wikipédia : le 25 juin |  |
| Myanmar (Birmanie) | 4 janvier | Fête de l'indépendance | oui | Independence Day, 4 January (1948); Union Day, 12 February (1947) | 4 janvier | Factbook : le 4 janvier (indépendance) et le 12 février (Jour de l'Union) ; retenu le 4 janvier, que la liste de Wikipédia donne seul | **à relire** |
| Namibie | 21 mars | Fête de l'indépendance |  | Independence Day, 21 March (1990) | 21 mars | Factbook et liste de Wikipédia : le 21 mars |  |
| Nauru | 31 janvier | Fête de l'indépendance |  | Independence Day, 31 January (1968) | 31 janvier | Factbook et liste de Wikipédia : le 31 janvier |  |
| Népal | 20 septembre | Fête de la Constitution |  | Constitution Day, 20 September (2015) | 20 septembre | Factbook et liste de Wikipédia : le 20 septembre |  |
| Nicaragua | 15 septembre | Fête de l'indépendance |  | Independence Day, 15 September (1821) | 15 septembre | Factbook et liste de Wikipédia : le 15 septembre |  |
| Niger | 18 décembre | Fête de la République |  | Republic Day, 18 December (1958) | 18 décembre | Factbook et liste de Wikipédia : le 18 décembre |  |
| Nigeria | 1er octobre | Fête de l'indépendance |  | Independence Day (National Day), 1 October (1960) | 1er octobre | Factbook et liste de Wikipédia : le 1er octobre |  |
| Norvège | 17 mai | Fête de la Constitution |  | Constitution Day, 17 May (1814) | 17 mai | Factbook et liste de Wikipédia : le 17 mai |  |
| Nouvelle-Zélande | 6 février | Waitangi Day | oui | Waitangi Day, 6 February (1840); Anzac Day, 25 April (1915) | 6 février | Factbook : le 6 février (Waitangi Day) et le 25 avril (Anzac Day, commémoration militaire) ; retenu le 6 février, que la liste de Wikipédia donne seul | **à relire** |
| Oman | 18 novembre | Fête nationale |  | National Day, 18 November | 18 novembre | Factbook et liste de Wikipédia : le 18 novembre |  |
| Ouganda | 9 octobre | Fête de l'indépendance |  | Independence Day, 9 October (1962) | 9 octobre | Factbook et liste de Wikipédia : le 9 octobre |  |
| Ouzbékistan | 1er septembre | Fête de l'indépendance |  | Independence Day, 1 September (1991) | 1er septembre | Factbook et liste de Wikipédia : le 1er septembre |  |
| Pakistan | 23 mars | Jour du Pakistan |  | Pakistan Day, 23 March, also referred to as Pakistan Resolution Day (1940) or Republic Day (1956) | 23 mars | Factbook et liste de Wikipédia : le 23 mars |  |
| Palaos | 9 juillet | Fête de la Constitution | oui | Constitution Day, 9 July (1981); Independence Day, 1 October (1994) | 9 juillet | Factbook : le 9 juillet (Constitution) et le 1er octobre (indépendance) ; retenu le 9 juillet, que la liste de Wikipédia donne seul : à relire | **à relire** |
| Palestine | 15 novembre | Fête de l'indépendance |  | — | 15 novembre | Pas de fiche du Factbook pour l'État de Palestine (ses fiches sont la Cisjordanie et Gaza, sans fête) ; le 15 novembre, proclamation de l'indépendance de 1988, d'après la liste de Wikipédia : à relire | **à relire** |
| Panama | 3 novembre | Fête de l'indépendance |  | Independence Day (Separation Day), 3 November (1903) | 3 novembre | Factbook et liste de Wikipédia : le 3 novembre |  |
| Papouasie-Nouvelle-Guinée | 16 septembre | Fête de l'indépendance |  | Independence Day, 16 September (1975) | 16 septembre | Factbook et liste de Wikipédia : le 16 septembre |  |
| Paraguay | 15 mai | Fête de l'indépendance | oui | Independence Day, 14-15 May (1811) (observed 15 May); 14 May is celebrated as Flag Day | 15 mai | Factbook : l'indépendance les 14 et 15 mai, observée le 15 ; le 14 mai est le Jour du drapeau ; retenu le 15 mai, comme la liste de Wikipédia | **à relire** |
| Pays-Bas | 27 avril | Fête du Roi |  | King's Day (birthday of King WILLEM-ALEXANDER), 27 April (1967) | 27 avril | Factbook et liste de Wikipédia : le 27 avril |  |
| Pérou | 28 juillet | Fête de l'indépendance |  | Independence Day, 28-29 July (1821) | 28 juillet | Factbook : l'indépendance les 28 et 29 juillet ; retenu le 28 juillet, jour de la déclaration (1821), comme la liste de Wikipédia | **à relire** |
| Philippines | 12 juin | Fête de l'indépendance |  | Independence Day, 12 June (1898) | 12 juin | Factbook et liste de Wikipédia : le 12 juin |  |
| Pologne | 3 mai | Fête de la Constitution du 3 Mai |  | Constitution Day, 3 May (1791) | 3 mai, 11 novembre | Factbook : le 3 mai ; la liste de Wikipédia donne 3 mai, 11 novembre : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Portugal | 10 juin | Jour du Portugal |  | Portugal Day (Dia de Portugal), 10 June (1580) | 10 juin | Factbook et liste de Wikipédia : le 10 juin |  |
| Qatar | 18 décembre | Fête nationale | oui | National Day, 18 December (1878), anniversary of Al Thani family accession to the throne; Independence Day, 3 September (1971) | 18 décembre | Factbook : le 18 décembre (fête nationale, accession des Al Thani) et le 3 septembre (indépendance) ; retenu le 18 décembre, nommé « National Day », comme la liste de Wikipédia | **à relire** |
| République centrafricaine | 1er décembre | Fête de la République |  | Republic Day, 1 December (1958) | 1er décembre | Factbook et liste de Wikipédia : le 1er décembre |  |
| République dominicaine | 27 février | Fête de l'indépendance |  | Independence Day, 27 February (1844) | 27 février | Factbook et liste de Wikipédia : le 27 février |  |
| Roumanie | 1er décembre | Fête de la Grande Union |  | Unification Day (unification of Romania and Transylvania), 1 December (1918) | 1er décembre | Factbook et liste de Wikipédia : le 1er décembre |  |
| Royaume-Uni | aucune | — |  | the UK does not celebrate one particular national holiday | — | Le Factbook : « the UK does not celebrate one particular national holiday » ; la liste de Wikipédia dit de même (l'anniversaire officiel du roi en tient lieu, sans date fixe) : pas de ligne (§ 2.1) |  |
| Russie | 12 juin | Jour de la Russie |  | Russia Day, 12 June (1990) | 12 juin | Factbook et liste de Wikipédia : le 12 juin |  |
| Rwanda | 1er juillet | Fête de l'indépendance |  | Independence Day, 1 July (1962) | 4 juillet | Factbook : le 1er juillet ; la liste de Wikipédia donne 4 juillet : retenu le Factbook, jour différent : à relire | **à relire** |
| Saint-Christophe-et-Niévès | 19 septembre | Fête de l'indépendance |  | Independence Day, 19 September (1983) | 19 septembre | Factbook et liste de Wikipédia : le 19 septembre |  |
| Saint-Marin | 3 septembre | Fête de la fondation de la République |  | Founding of the Republic (or Feast of Saint Marinus), 3 September (A.D. 301) | 3 septembre | Factbook et liste de Wikipédia : le 3 septembre |  |
| Saint-Vincent-et-les Grenadines | 27 octobre | Fête de l'indépendance |  | Independence Day, 27 October (1979) | 27 octobre | Factbook et liste de Wikipédia : le 27 octobre |  |
| Sainte-Lucie | 22 février | Fête de l'indépendance |  | Independence Day, 22 February (1979) | 22 février | Factbook et liste de Wikipédia : le 22 février |  |
| Salvador | 15 septembre | Fête de l'indépendance |  | Independence Day, 15 September (1821) | 15 septembre | Factbook et liste de Wikipédia : le 15 septembre |  |
| Samoa | 1er juin | Fête de l'indépendance |  | Independence Day Celebration, 1 June (1962) | 1er juin | Factbook et liste de Wikipédia : le 1er juin |  |
| Sao Tomé-et-Principe | 12 juillet | Fête de l'indépendance |  | Independence Day, 12 July (1975) | 12 juillet | Factbook et liste de Wikipédia : le 12 juillet |  |
| Sénégal | 4 avril | Fête de l'indépendance |  | Independence Day, 4 April (1960) | 4 avril | Factbook et liste de Wikipédia : le 4 avril |  |
| Serbie | 15 février | Fête de l'État |  | Statehood Day, 15 February (1835), the day the first constitution of the country was adopted | 15 février | Factbook et liste de Wikipédia : le 15 février |  |
| Seychelles | 29 juin | Fête de l'indépendance | oui | Constitution Day, 18 June (1993); Independence Day (National Day), 29 June (1976) | 29 juin | Factbook : le 18 juin (Constitution) et le 29 juin (indépendance, dite « National Day ») ; retenu le 29 juin, comme la liste de Wikipédia | **à relire** |
| Sierra Leone | 27 avril | Fête de l'indépendance |  | Independence Day, 27 April (1961) | 27 avril | Factbook et liste de Wikipédia : le 27 avril |  |
| Singapour | 9 août | Fête nationale |  | National Day, 9 August (1965) | 9 août | Factbook et liste de Wikipédia : le 9 août |  |
| Slovaquie | 1er septembre | Fête de la Constitution |  | Constitution Day, 1 September (1992) | 1er janvier | Factbook : le 1er septembre ; la liste de Wikipédia donne 1er janvier : retenu le Factbook, jour différent : à relire | **à relire** |
| Slovénie | 25 juin | Fête de l'État |  | Independence Day/Statehood Day, 25 June (1991) | 25 juin | Factbook et liste de Wikipédia : le 25 juin |  |
| Somalie | 1er juillet | Fête de la fondation de la République | oui | Foundation of the Somali Republic, 1 July (1960); note - 26 June (1960) in Somaliland | 1er juillet | Factbook : le 1er juillet (fondation de la République somalienne) ; il cite le 26 juin comme fête du Somaliland, qui a sa propre fiche ; retenu le 1er juillet, comme la liste de Wikipédia | **à relire** |
| Soudan | 1er janvier | Fête de l'indépendance |  | Independence Day, 1 January (1956) | 1er janvier | Factbook et liste de Wikipédia : le 1er janvier |  |
| Soudan du Sud | 9 juillet | Fête de l'indépendance |  | Independence Day, 9 July (2011) | 9 juillet | Factbook et liste de Wikipédia : le 9 juillet |  |
| Sri Lanka | 4 février | Fête de l'indépendance |  | Independence Day (National Day), 4 February (1948) | 4 février | Factbook et liste de Wikipédia : le 4 février |  |
| Suède | 6 juin | Fête nationale |  | National Day, 6 June (1983) | 6 juin | Factbook et liste de Wikipédia : le 6 juin |  |
| Suisse | 1er août | Fête nationale |  | Founding of the Swiss Confederation in 1291 | 1er août | Factbook : « Founding of the Swiss Confederation in 1291 », sans jour ; la fête nationale suisse est le 1er août (liste de Wikipédia : pacte fédéral de 1291) | **à relire** |
| Suriname | 25 novembre | Fête de l'indépendance |  | Independence Day, 25 November (1975) | 25 novembre | Factbook et liste de Wikipédia : le 25 novembre |  |
| Syrie | 17 avril | Fête de l'Évacuation |  | Independence Day (Evacuation Day), 17 April (1946) | 17 avril | Factbook et liste de Wikipédia : le 17 avril |  |
| Tadjikistan | 9 septembre | Fête de l'indépendance |  | Independence Day (or National Day), 9 September (1991) | 9 septembre | Factbook et liste de Wikipédia : le 9 septembre |  |
| Taïwan | 10 octobre | Fête nationale |  | Republic Day (National Day), 10 October (1911) | 10 octobre | Factbook et liste de Wikipédia : le 10 octobre |  |
| Tanzanie | 26 avril | Fête de l'Union |  | Union Day (Tanganyika and Zanzibar), 26 April (1964) | 26 avril | Factbook et liste de Wikipédia : le 26 avril |  |
| Tchad | 11 août | Fête de l'indépendance |  | Independence Day, 11 August (1960) | 11 août | Factbook et liste de Wikipédia : le 11 août |  |
| Tchéquie | 28 octobre | Jour de la fondation de l'État tchécoslovaque |  | Czechoslovak Founding Day, 28 October (1918) | 28 septembre, 28 octobre | Factbook : le 28 octobre ; la liste de Wikipédia donne 28 septembre, 28 octobre : retenu le Factbook (Wikipédia cite aussi d'autres jours) | **à relire** |
| Thaïlande | 28 juillet | Anniversaire du roi |  | Birthday of King WACHIRALONGKON, 28 July (1952) | 5 décembre | Factbook : le 28 juillet ; la liste de Wikipédia donne 5 décembre : retenu le Factbook, jour différent : à relire | **à relire** |
| Timor oriental | 20 mai | Fête de la restauration de l'indépendance | oui | Restoration of Independence Day, 20 May (2002); Proclamation of Independence Day, 28 November (1975) | 20 mai | Factbook : le 20 mai (restauration de l'indépendance, 2002) et le 28 novembre (proclamation de 1975) ; retenu le 20 mai, que la liste de Wikipédia donne seul | **à relire** |
| Togo | 27 avril | Fête de l'indépendance |  | Independence Day, 27 April (1960) | 27 avril | Factbook et liste de Wikipédia : le 27 avril |  |
| Tonga | 4 juillet | Anniversaire officiel du roi |  | Official birthday of King TUPOU VI, 4 July (1959) | 4 novembre | Factbook : le 4 juillet ; la liste de Wikipédia donne 4 novembre : retenu le Factbook, jour différent : à relire | **à relire** |
| Trinité-et-Tobago | 31 août | Fête de l'indépendance |  | Independence Day, 31 August (1962) | 31 août | Factbook et liste de Wikipédia : le 31 août |  |
| Tunisie | 20 mars | Fête de l'indépendance | oui | Independence Day, 20 March (1956); Revolution and Youth Day, 14 January (2011) | 20 mars | Factbook : le 20 mars (indépendance) et le 14 janvier (révolution de 2011) ; retenu le 20 mars, que la liste de Wikipédia donne seul | **à relire** |
| Turkménistan | 27 octobre | Fête de l'indépendance |  | Independence Day, 27 October (1991) | 27 octobre | Factbook et liste de Wikipédia : le 27 octobre |  |
| Turquie | 29 octobre | Fête de la République |  | Republic Day, 29 October (1923) | 29 octobre | Factbook et liste de Wikipédia : le 29 octobre |  |
| Tuvalu | 1er octobre | Fête de l'indépendance |  | Independence Day, 1 October (1978) | 1er octobre | Factbook et liste de Wikipédia : le 1er octobre |  |
| Ukraine | 24 août | Fête de l'indépendance |  | Independence Day, 24 August (1991) | 24 août | Factbook et liste de Wikipédia : le 24 août |  |
| Uruguay | 25 août | Fête de l'indépendance |  | Independence Day, 25 August (1825) | 25 août | Factbook et liste de Wikipédia : le 25 août |  |
| Vanuatu | 30 juillet | Fête de l'indépendance |  | Independence Day, 30 July (1980) | 30 juillet | Factbook et liste de Wikipédia : le 30 juillet |  |
| Venezuela | 5 juillet | Fête de l'indépendance |  | Independence Day, 5 July (1811) | 5 juillet | Factbook et liste de Wikipédia : le 5 juillet |  |
| Viêt Nam | 2 septembre | Fête de l'indépendance |  | Independence Day (National Day), 2 September (1945) | 2 septembre | Factbook et liste de Wikipédia : le 2 septembre |  |
| Yémen | 22 mai | Fête de l'unité |  | Unification Day, 22 May (1990) | 22 mai | Factbook et liste de Wikipédia : le 22 mai |  |
| Zambie | 24 octobre | Fête de l'indépendance |  | Independence Day, 24 October (1964) | 24 octobre | Factbook et liste de Wikipédia : le 24 octobre |  |
| Zimbabwe | 18 avril | Fête de l'indépendance |  | Independence Day, 18 April (1980) | 18 avril | Factbook et liste de Wikipédia : le 18 avril |  |

## 2. Gentilés (clé `gentile`)

24 lignes : les pays où Wikidata donne plusieurs formes masculines ou aucune, les graphies corrigées et les pluriels hors de la règle (un « s », sauf après s, x ou z). Puis la liste de tous les gentilés, pour un coup d'œil.

| Pays | Retenu | Pluriel | Formes de Wikidata | Raison |  |
|---|---|---|---|---|---|
| Afrique du Sud | Sud-Africain | Sud-Africains | Sud-Africain, Sud-africain | Wikidata : Sud-Africain et Sud-africain ; majuscule aux deux éléments |  |
| Bénin | Béninois | Béninois | Béninien, Béninois | Wikidata : Béninien et Béninois ; « Béninois » est la forme courante |  |
| Burkina Faso | Burkinabè | Burkinabè | Burkinabè | « Burkinabè » s'emploie invariable (« les Burkinabè ») ; la règle donnerait « Burkinabès » ; la Wikipédia en français écrit « Burkinabé » d'après la recommandation de 2019 | **à relire** |
| Cap-Vert | Cap-Verdien | Cap-Verdiens | Cap-Verdien, Cap-verdien, Capverdien | Wikidata : Cap-Verdien, Cap-verdien et Capverdien ; « Cap-Verdien », avec ses deux majuscules |  |
| Chypre | Chypriote | Chypriotes | Chypriote, Cypriote | Wikidata : Chypriote et Cypriote ; « Chypriote » est la forme courante, « Cypriote » vieillie |  |
| Corée du Nord | Nord-Coréen | Nord-Coréens | Nord-coréen | Wikidata : « Nord-coréen » ; majuscule aux deux éléments, comme « Sud-Coréen » |  |
| Corée du Sud | Sud-Coréen | Sud-Coréens | Sud-coréen | Wikidata : « Sud-coréen » ; le gentilé prend la majuscule à ses deux éléments, comme « Sud-Africain » |  |
| État de la Cité du Vatican | Vaticanais | Vaticanais | aucune | Wikidata n'a pas de gentilé ; l'infobox de la Wikipédia en français donne « Vaticanais, Vaticanaise » et « Vatican, Vaticane » (révision 241316685) : le premier | **à relire** |
| États-Unis | Américain | Américains | Américain, États-Unien | Wikidata : Américain et États-Unien ; « Américain » est la forme la plus courante |  |
| Éthiopie | Éthiopien | Éthiopiens | Éthiopien, Éthiopique | Wikidata : Éthiopien et Éthiopique ; « éthiopique » est un adjectif savant (langues, Antiquité) |  |
| Guatemala | Guatémaltèque | Guatémaltèques | Guatémalien, Guatémaltèque | Wikidata : Guatémalien et Guatémaltèque ; « Guatémaltèque » est la forme courante |  |
| Guinée-Bissau | Bissau-Guinéen | Bissau-Guinéens | Bissaoguinéen, Guinéen | Wikidata : Bissaoguinéen et Guinéen ; « Guinéen » est le gentilé de la Guinée ; « Bissau-Guinéen » d'après l'infobox de la Wikipédia en français (« Bissau-Guinéens », révision 240555154) | **à relire** |
| Îles Salomon | Salomonais | Salomonais | Salomonais, Salomonien | Wikidata : Salomonais et Salomonien ; « Salomonais » est la forme courante |  |
| Jamaïque | Jamaïcain | Jamaïcains | Jamaïcain, Jamaïquain | Wikidata : Jamaïcain et Jamaïquain ; « Jamaïcain » est la forme courante |  |
| Kirghizstan | Kirghiz | Kirghiz | Kirghiz, Kirghize | Wikidata : Kirghiz et Kirghize (féminin, ou masculin chez certains) ; « Kirghiz » au masculin ; la Wikipédia en français donne aussi « Kirghizstanais » (révision 241251765) | **à relire** |
| Kosovo | Kosovar | Kosovars | Kosovar, Kossovien | Wikidata : Kosovar et Kossovien ; « Kosovar » est la forme courante |  |
| Lesotho | Lésothien | Lésothiens | Lesothien, Lésothan | Wikidata : Lesothien et Lésothan ; « Lésothien » d'après la Wikipédia en français (révision 240863543), qui cite la recommandation de 2019 |  |
| Malaisie | Malaisien | Malaisiens | Malais, Malaisien | Wikidata : Malais et Malaisien ; « Malais » désigne le peuple, « Malaisien » l'habitant du pays |  |
| Nouvelle-Zélande | Néo-Zélandais | Néo-Zélandais | Néozélandais | Wikidata : « Néozélandais » ; « Néo-Zélandais » d'après la Wikipédia en français (révision 240223491) |  |
| Papouasie-Nouvelle-Guinée | Papouan-Néo-Guinéen | Papouans-Néo-Guinéens | Néoguinéen, Papouasien | Wikidata : Néoguinéen et Papouasien ; « Papouan-néo-guinéen » d'après la Wikipédia en français (révision 240791569), avec la majuscule à chaque élément ; pluriel aux deux adjectifs | **à relire** |
| Royaume-Uni | Britannique | Britanniques | Anglais, Britannique | Wikidata : Anglais et Britannique ; « Anglais » ne désigne qu'une des quatre nations du Royaume-Uni |  |
| Saint-Marin | Saint-Marinais | Saint-Marinais | Saint-marinais | Wikidata : « Saint-marinais » ; majuscule aux deux éléments |  |
| Sénégal | Sénégalais | Sénégalais | Sénégalais, Sénégalien | Wikidata : Sénégalais et Sénégalien ; « Sénégalais » est la forme courante |  |
| Soudan du Sud | Sud-Soudanais | Sud-Soudanais | Sud-soudanais, Sudsoudanais | Wikidata : Sud-soudanais et Sudsoudanais ; « Sud-Soudanais », majuscule aux deux éléments |  |

<details><summary>Tous les gentilés (197)</summary>

| Pays | Masculin | Pluriel | Source |
|---|---|---|---|
| Afghanistan | Afghan | Afghans | Wikidata |
| Afrique du Sud | Sud-Africain | Sud-Africains | table |
| Albanie | Albanais | Albanais | Wikidata |
| Algérie | Algérien | Algériens | Wikidata |
| Allemagne | Allemand | Allemands | Wikidata |
| Andorre | Andorran | Andorrans | Wikidata |
| Angola | Angolais | Angolais | Wikidata |
| Antigua-et-Barbuda | Antiguayen | Antiguayens | Wikidata |
| Arabie saoudite | Saoudien | Saoudiens | Wikidata |
| Argentine | Argentin | Argentins | Wikidata |
| Arménie | Arménien | Arméniens | Wikidata |
| Australie | Australien | Australiens | Wikidata |
| Autriche | Autrichien | Autrichiens | Wikidata |
| Azerbaïdjan | Azerbaïdjanais | Azerbaïdjanais | Wikidata |
| Bahamas | Bahaméen | Bahaméens | Wikidata |
| Bahreïn | Bahreïnien | Bahreïniens | Wikidata |
| Bangladesh | Bangladais | Bangladais | Wikidata |
| Barbade | Barbadien | Barbadiens | Wikidata |
| Belgique | Belge | Belges | Wikidata |
| Belize | Bélizien | Béliziens | Wikidata |
| Bénin | Béninois | Béninois | table |
| Bhoutan | Bhoutanais | Bhoutanais | Wikidata |
| Biélorussie | Biélorusse | Biélorusses | Wikidata |
| Bolivie | Bolivien | Boliviens | Wikidata |
| Bosnie-Herzégovine | Bosnien | Bosniens | Wikidata |
| Botswana | Botswanais | Botswanais | Wikidata |
| Brésil | Brésilien | Brésiliens | Wikidata |
| Brunei | Brunéien | Brunéiens | Wikidata |
| Bulgarie | Bulgare | Bulgares | Wikidata |
| Burkina Faso | Burkinabè | Burkinabè | table |
| Burundi | Burundais | Burundais | Wikidata |
| Cambodge | Cambodgien | Cambodgiens | Wikidata |
| Cameroun | Camerounais | Camerounais | Wikidata |
| Canada | Canadien | Canadiens | Wikidata |
| Cap-Vert | Cap-Verdien | Cap-Verdiens | table |
| Chili | Chilien | Chiliens | Wikidata |
| Chine | Chinois | Chinois | Wikidata |
| Chypre | Chypriote | Chypriotes | table |
| Colombie | Colombien | Colombiens | Wikidata |
| Comores | Comorien | Comoriens | Wikidata |
| Congo-Brazzaville | Congolais | Congolais | Wikidata |
| Congo-Kinshasa | Congolais | Congolais | Wikidata |
| Corée du Nord | Nord-Coréen | Nord-Coréens | table |
| Corée du Sud | Sud-Coréen | Sud-Coréens | table |
| Costa Rica | Costaricien | Costariciens | Wikidata |
| Côte d’Ivoire | Ivoirien | Ivoiriens | Wikidata |
| Croatie | Croate | Croates | Wikidata |
| Cuba | Cubain | Cubains | Wikidata |
| Danemark | Danois | Danois | Wikidata |
| Djibouti | Djiboutien | Djiboutiens | Wikidata |
| Dominique | Dominiquais | Dominiquais | Wikidata |
| Égypte | Égyptien | Égyptiens | Wikidata |
| Émirats arabes unis | Émirien | Émiriens | Wikidata |
| Équateur | Équatorien | Équatoriens | Wikidata |
| Érythrée | Érythréen | Érythréens | Wikidata |
| Espagne | Espagnol | Espagnols | Wikidata |
| Estonie | Estonien | Estoniens | Wikidata |
| Eswatini | Eswatinien | Eswatiniens | Wikidata |
| État de la Cité du Vatican | Vaticanais | Vaticanais | table |
| États-Unis | Américain | Américains | table |
| Éthiopie | Éthiopien | Éthiopiens | table |
| Fidji | Fidjien | Fidjiens | Wikidata |
| Finlande | Finlandais | Finlandais | Wikidata |
| France | Français | Français | Wikidata |
| Gabon | Gabonais | Gabonais | Wikidata |
| Gambie | Gambien | Gambiens | Wikidata |
| Géorgie | Géorgien | Géorgiens | Wikidata |
| Ghana | Ghanéen | Ghanéens | Wikidata |
| Grèce | Grec | Grecs | Wikidata |
| Grenade | Grenadien | Grenadiens | Wikidata |
| Guatemala | Guatémaltèque | Guatémaltèques | table |
| Guinée | Guinéen | Guinéens | Wikidata |
| Guinée équatoriale | Équatoguinéen | Équatoguinéens | Wikidata |
| Guinée-Bissau | Bissau-Guinéen | Bissau-Guinéens | table |
| Guyana | Guyanien | Guyaniens | Wikidata |
| Haïti | Haïtien | Haïtiens | Wikidata |
| Honduras | Hondurien | Honduriens | Wikidata |
| Hongrie | Hongrois | Hongrois | Wikidata |
| Îles Marshall | Marshallais | Marshallais | Wikidata |
| Îles Salomon | Salomonais | Salomonais | table |
| Inde | Indien | Indiens | Wikidata |
| Indonésie | Indonésien | Indonésiens | Wikidata |
| Irak | Irakien | Irakiens | Wikidata |
| Iran | Iranien | Iraniens | Wikidata |
| Irlande | Irlandais | Irlandais | Wikidata |
| Islande | Islandais | Islandais | Wikidata |
| Israël | Israélien | Israéliens | Wikidata |
| Italie | Italien | Italiens | Wikidata |
| Jamaïque | Jamaïcain | Jamaïcains | table |
| Japon | Japonais | Japonais | Wikidata |
| Jordanie | Jordanien | Jordaniens | Wikidata |
| Kazakhstan | Kazakhstanais | Kazakhstanais | Wikidata |
| Kenya | Kényan | Kényans | Wikidata |
| Kirghizstan | Kirghiz | Kirghiz | table |
| Kiribati | Gilbertin | Gilbertins | Wikidata |
| Kosovo | Kosovar | Kosovars | table |
| Koweït | Koweïtien | Koweïtiens | Wikidata |
| Laos | Laotien | Laotiens | Wikidata |
| Lesotho | Lésothien | Lésothiens | table |
| Lettonie | Letton | Lettons | Wikidata |
| Liban | Libanais | Libanais | Wikidata |
| Liberia | Libérien | Libériens | Wikidata |
| Libye | Libyen | Libyens | Wikidata |
| Liechtenstein | Liechtensteinois | Liechtensteinois | Wikidata |
| Lituanie | Lituanien | Lituaniens | Wikidata |
| Luxembourg | Luxembourgeois | Luxembourgeois | Wikidata |
| Macédoine du Nord | Macédonien | Macédoniens | Wikidata |
| Madagascar | Malgache | Malgaches | Wikidata |
| Malaisie | Malaisien | Malaisiens | table |
| Malawi | Malawite | Malawites | Wikidata |
| Maldives | Maldivien | Maldiviens | Wikidata |
| Mali | Malien | Maliens | Wikidata |
| Malte | Maltais | Maltais | Wikidata |
| Maroc | Marocain | Marocains | Wikidata |
| Maurice | Mauricien | Mauriciens | Wikidata |
| Mauritanie | Mauritanien | Mauritaniens | Wikidata |
| Mexique | Mexicain | Mexicains | Wikidata |
| Micronésie | Micronésien | Micronésiens | Wikidata |
| Moldavie | Moldave | Moldaves | Wikidata |
| Monaco | Monégasque | Monégasques | Wikidata |
| Mongolie | Mongol | Mongols | Wikidata |
| Monténégro | Monténégrin | Monténégrins | Wikidata |
| Mozambique | Mozambicain | Mozambicains | Wikidata |
| Myanmar (Birmanie) | Birman | Birmans | Wikidata |
| Namibie | Namibien | Namibiens | Wikidata |
| Nauru | Nauruan | Nauruans | Wikidata |
| Népal | Népalais | Népalais | Wikidata |
| Nicaragua | Nicaraguayen | Nicaraguayens | Wikidata |
| Niger | Nigérien | Nigériens | Wikidata |
| Nigeria | Nigérian | Nigérians | Wikidata |
| Norvège | Norvégien | Norvégiens | Wikidata |
| Nouvelle-Zélande | Néo-Zélandais | Néo-Zélandais | table |
| Oman | Omanais | Omanais | Wikidata |
| Ouganda | Ougandais | Ougandais | Wikidata |
| Ouzbékistan | Ouzbek | Ouzbeks | Wikidata |
| Pakistan | Pakistanais | Pakistanais | Wikidata |
| Palaos | Palaois | Palaois | Wikidata |
| Palestine | Palestinien | Palestiniens | Wikidata |
| Panama | Panaméen | Panaméens | Wikidata |
| Papouasie-Nouvelle-Guinée | Papouan-Néo-Guinéen | Papouans-Néo-Guinéens | table |
| Paraguay | Paraguayen | Paraguayens | Wikidata |
| Pays-Bas | Néerlandais | Néerlandais | Wikidata |
| Pérou | Péruvien | Péruviens | Wikidata |
| Philippines | Philippin | Philippins | Wikidata |
| Pologne | Polonais | Polonais | Wikidata |
| Portugal | Portugais | Portugais | Wikidata |
| Qatar | Qatarien | Qatariens | Wikidata |
| République centrafricaine | Centrafricain | Centrafricains | Wikidata |
| République dominicaine | Dominicain | Dominicains | Wikidata |
| Roumanie | Roumain | Roumains | Wikidata |
| Royaume-Uni | Britannique | Britanniques | table |
| Russie | Russe | Russes | Wikidata |
| Rwanda | Rwandais | Rwandais | Wikidata |
| Saint-Christophe-et-Niévès | Christophien | Christophiens | Wikidata |
| Saint-Marin | Saint-Marinais | Saint-Marinais | table |
| Saint-Vincent-et-les Grenadines | Vincentais | Vincentais | Wikidata |
| Sainte-Lucie | Lucien | Luciens | Wikidata |
| Salvador | Salvadorien | Salvadoriens | Wikidata |
| Samoa | Samoen | Samoens | Wikidata |
| Sao Tomé-et-Principe | Santoméen | Santoméens | Wikidata |
| Sénégal | Sénégalais | Sénégalais | table |
| Serbie | Serbe | Serbes | Wikidata |
| Seychelles | Seychellois | Seychellois | Wikidata |
| Sierra Leone | Sierraléonais | Sierraléonais | Wikidata |
| Singapour | Singapourien | Singapouriens | Wikidata |
| Slovaquie | Slovaque | Slovaques | Wikidata |
| Slovénie | Slovène | Slovènes | Wikidata |
| Somalie | Somalien | Somaliens | Wikidata |
| Soudan | Soudanais | Soudanais | Wikidata |
| Soudan du Sud | Sud-Soudanais | Sud-Soudanais | table |
| Sri Lanka | Srilankais | Srilankais | Wikidata |
| Suède | Suédois | Suédois | Wikidata |
| Suisse | Suisse | Suisses | Wikidata |
| Suriname | Surinamien | Surinamiens | Wikidata |
| Syrie | Syrien | Syriens | Wikidata |
| Tadjikistan | Tadjik | Tadjiks | Wikidata |
| Taïwan | Taïwanais | Taïwanais | Wikidata |
| Tanzanie | Tanzanien | Tanzaniens | Wikidata |
| Tchad | Tchadien | Tchadiens | Wikidata |
| Tchéquie | Tchèque | Tchèques | Wikidata |
| Thaïlande | Thaïlandais | Thaïlandais | Wikidata |
| Timor oriental | Timorais | Timorais | Wikidata |
| Togo | Togolais | Togolais | Wikidata |
| Tonga | Tongien | Tongiens | Wikidata |
| Trinité-et-Tobago | Trinidadien | Trinidadiens | Wikidata |
| Tunisie | Tunisien | Tunisiens | Wikidata |
| Turkménistan | Turkmène | Turkmènes | Wikidata |
| Turquie | Turc | Turcs | Wikidata |
| Tuvalu | Tuvalais | Tuvalais | Wikidata |
| Ukraine | Ukrainien | Ukrainiens | Wikidata |
| Uruguay | Uruguayen | Uruguayens | Wikidata |
| Vanuatu | Vanouatais | Vanouatais | Wikidata |
| Venezuela | Vénézuélien | Vénézuéliens | Wikidata |
| Viêt Nam | Vietnamien | Vietnamiens | Wikidata |
| Yémen | Yéménite | Yéménites | Wikidata |
| Zambie | Zambien | Zambiens | Wikidata |
| Zimbabwe | Zimbabwéen | Zimbabwéens | Wikidata |

</details>

## 3. Points culminants (clé `culminant`)

42 lignes : les sommets tranchés (plusieurs déclarés, ou hors du tracé du pays), les altitudes à trancher, la Gambie, l'Argentine, et chaque écart de plus de 5 m avec la seconde source (Wikipédia en français, « Liste des pays par point culminant ») : la valeur gardée reste celle de Wikidata, l'écart est à relire. Critère : le plus haut point du tracé de fait de la carte, jamais dans une zone disputée (décision du 18/11/2026 : Israël, le mont Méron ; la Somalie, sans ligne de sommet ; le Pakistan, le Tirich Mir, hors du Gilgit-Baltistan).

| Pays | Sommet | Altitude | Wikidata | Seconde source | Écart | Raison |  |
|---|---|---|---|---|---|---|---|
| Algérie | Tahat | 2 918 m | Tahat (? m) ; valeurs : 2908 m, 2918 m | — | — | Wikidata : 2 908 m et 2 918 m pour le Tahat, sans rang ni date ; 2 918 m selon le qualificatif de la déclaration de l'Algérie et la seconde source |  |
| Arabie saoudite | Jabal Sawda | 3 207 m | Jabal Sawda (3 207 m) | Jabal Ferwa, 3 002 m | + 205 m | Wikidata : Jabal Sawda, 3 207 m ; la seconde source : Jabal Ferwa, 3 002 m | **à relire** |
| Argentine | Aconcagua | 6 962 m | Q39739 (6 962 m) | — | — | Wikidata n'a pas de libellé français pour l'Aconcagua (Q39739) : titre de l'article de la Wikipédia en français |  |
| Australie | mont Kosciuszko | 2 228 m | mont Kosciuszko (2 228 m) ; pic Mawson (2 745 m, préféré) | — | — | Wikidata préfère le pic Mawson, sur l'île Heard, qui a sa propre fiche (à 3 472 km du tracé de l'Australie) ; le plus haut point du tracé : le mont Kosciuszko, sur le continent |  |
| Azerbaïdjan | Bazardüzü | 4 466 m | Bazardüzü (? m) ; valeurs : 2706 m, 4466 m | — | — | Wikidata : 2 706 m et 4 466 m, sans rang ni date ; 4 466 m selon la seconde source |  |
| Bahreïn | Djébel ad Dukhan | 134 m | Djébel ad Dukhan (134 m) | 122 m | + 12 m | Wikidata : 134 m ; la seconde source : 122 m | **à relire** |
| Colombie | pic Cristóbal Colón | 5 775 m | pic Cristóbal Colón (5 775 m) ; pic Simón Bolívar (5 775 m) | — | — | Wikidata déclare le pic Cristóbal Colón et le pic Simón Bolívar, tous deux à 5 775 m (sierra Nevada de Santa Marta), sans préféré ; retenu le pic Cristóbal Colón, nommé le premier par la seconde source | **à relire** |
| Costa Rica | Cerro Chirripó | 3 820 m | Cerro Chirripó (3 820 m) | 3 810 m | + 10 m | Wikidata : 3 820 m ; la seconde source : 3 810 m | **à relire** |
| Égypte | mont Sainte-Catherine | 2 629 m | mont Sainte-Catherine (? m) ; valeurs : 2637 m, 2629 m | — | — | Wikidata : 2 637 m et 2 629 m pour le mont Sainte-Catherine, sans rang ni date ; 2 629 m selon le qualificatif de la déclaration de l'Égypte et la seconde source |  |
| Émirats arabes unis | Jabal Bil Ays | 1 911 m | Jabal Bil Ays (1 911 m) | 1 892 m | + 19 m | Wikidata : 1 911 m ; la seconde source : 1 892 m | **à relire** |
| Érythrée | mont Soira | 3 018 m | mont Soira (? m) ; valeurs : 3013 m, 3018 m | — | — | Wikidata : 3 013 m et 3 018 m pour le mont Soira, sans rang ni date ; 3 018 m selon la seconde source |  |
| Éthiopie | Ras Dashan | 4 533 m | Ras Dashan (4 533 m) | 4 550 m | − 17 m | Wikidata : 4 533 m pour le Ras Dashan ; la seconde source : 4 550 m | **à relire** |
| Finlande | versant sud du Halti | 1 324 m | Halti (1 361 m) | 1 328 m | − 4 m | Critère du § 2.1, le plus haut point du tracé de fait : Wikidata donne le Halti et l'altitude de son sommet (1 361 m), qui est en Norvège, à moins de 10 km du tracé finlandais (S56 ne le voit pas). Le World Factbook (miroir figé) et la seconde source donnent 1 328 m ; 1 324 m est celle de la page du Halti (l'écart est à relire) | **à relire** |
| Gambie | point sans nom près de Sabi | 63 m | aucun | Red Rock, 53 m | + 10 m | Wikidata ne déclare pas de point culminant pour la Gambie. Le Factbook récent : un point sans nom à 63 m, à 3 km au sud-est de Sabi ; la Wikipédia en anglais (« Geography of the Gambia », révision 1379067827 du 07/10/2026) : « at least 53 m » (Factbook ancien, carte de 1966) ou 64 m (SRTM, peakbagger), entre Sabi et Vélingara ; la liste en français : « Red Rock », 53 m, nom qu'aucune autre source lue ne donne, donc pas servi. Sans coordonnées | **à relire** |
| Géorgie | Chkhara | 5 193 m | Chkhara (5 193 m) | 5 201 m | − 8 m | Wikidata : 5 193 m pour le Chkhara ; la seconde source : 5 201 m | **à relire** |
| Guinée-Bissau | mont Torin | 262 m | mont Torin (262 m) | lieu sans nom au nord-est du pays, 300 m | − 38 m | Wikidata : mont Torin, 262 m ; la seconde source : un lieu sans nom au nord-est, 300 m | **à relire** |
| Guyana | mont Roraima | 2 810 m | mont Roraima (2 810 m) | 2 772 m | + 38 m | Wikidata : 2 810 m pour le mont Roraima, dont le sommet est au Venezuela ; la seconde source : 2 772 m (le point du Guyana, estimé) | **à relire** |
| Haïti | pic la Selle | 2 674 m | pic la Selle (2 674 m) | 2 680 m | − 6 m | Wikidata : 2 674 m pour le pic la Selle ; la seconde source : 2 680 m | **à relire** |
| Honduras | Cerro Las Minas | 2 849 m | Cerro Las Minas (2 849 m) | 2 870 m | − 21 m | Wikidata : 2 849 m pour le Cerro Las Minas ; la seconde source : 2 870 m | **à relire** |
| Iran | mont Damavand | 5 610 m | mont Damavand (? m) ; valeurs : 5628 m, 5610 m | 5 604 m | + 6 m | Wikidata : 5 628 m et 5 610 m pour le mont Damavand, sans rang ni date ; 5 610 m selon le qualificatif de la déclaration de l'Iran ; la seconde source : 5 604 m | **à relire** |
| Israël | mont Méron | 1 208 m | mont Méron (1 208 m) | mont Hermon, 2 236 m | − 1 028 m | Décision de l'utilisateur du 18/11/2026 : aucun point culminant ne passe par une zone disputée. Wikidata : le mont Méron, 1 208 m, gardé ; la seconde source retient le mont Hermon (2 236 m), sur le plateau du Golan (zone contestée, dans le tracé de fait de la carte), « pour qui l'administre » |  |
| Japon | mont Fuji | 3 776 m | mont Fuji (3 777 m) | — | — | Wikidata : 3 777,24 m (une seule valeur) ; la valeur courante est 3 776 m (S63) |  |
| Koweït | Al-Mutla | 140 m | Al-Mutla (140 m) | Al-Shiqāyā, 291 m | − 151 m | Wikidata : Al-Mutla, 140 m ; la seconde source : Al-Shiqāyā, 291 m, un autre lieu | **à relire** |
| Maldives | Villingili | 5 m | Addu (ville) (2 m) ; Villingili (5 m) | — | — | Wikidata déclare Addu (une ville, 2,4 m) et Villingili (5,1 m), sans préféré ; la seconde source : Villingili, 5,1 m |  |
| Mexique | pic d'Orizaba | 5 636 m | pic d'Orizaba (5 636 m) | 5 675 m | − 39 m | Wikidata : 5 636 m pour le pic d'Orizaba ; la seconde source : 5 675 m | **à relire** |
| Namibie | massif du Brandberg | 2 573 m | massif du Brandberg (2 573 m) | Königstein, 2 606 m | − 33 m | Wikidata : massif du Brandberg, 2 573 m ; la seconde source : le Königstein (son point culminant), 2 606 m | **à relire** |
| Oman | djebel Shams | 3 018 m | djebel Shams (3 018 m) | 2 980 m | + 38 m | Wikidata : 3 018 m pour le djebel Shams ; la seconde source : 2 980 m | **à relire** |
| Pakistan | Tirich Mir | 7 708 m | K2 (8 611 m) | — | — | Décision de l'utilisateur du 18/11/2026 : aucun point culminant ne passe par une zone disputée. Wikidata déclare le K2 (8 611 m), dans le Gilgit-Baltistan (zone tenue par le Pakistan, revendiquée par l'Inde, NE_B08), comme tous les sommets du Karakoram et le Nanga Parbat ; retenu le Tirich Mir, point culminant de l'Hindou Kouch, hors des zones : qu'il soit le plus haut point du Pakistan hors des zones est estimé (aucune source lue ne le dit) | **à relire** |
| Pays-Bas | mont Scenery | 870 m | mont Scenery (870 m, préféré) ; Vaalserberg (322 m) ; valeurs : 887 m, 870 m (préféré) | 887 m | − 17 m | Wikidata préfère 870 m pour le mont Scenery (Saba, dans le tracé de l'entité de la carte) ; la seconde source : 887 m | **à relire** |
| Pologne | Rysy | 2 499 m | Rysy (2 501 m) | — | — | Wikidata : 2 501 m pour le Rysy, dont le pic le plus haut (2 500 m) est en Slovaquie ; le point culminant de la Pologne est le pic nord-ouest, à 2 499 m (critère du § 2.1 : le plus haut point du tracé de fait) |  |
| République centrafricaine | mont Ngaoui | 1 410 m | mont Ngaoui (1 410 m) | 1 420 m | − 10 m | Wikidata : 1 410 m ; la seconde source : 1 420 m | **à relire** |
| Saint-Marin | mont Titano | 756 m | mont Titano (? m) ; valeurs : 739 m, 756 m | — | — | Wikidata : 739 m et 756 m pour le mont Titano, sans rang ni date ; 756 m, à 1 m de la seconde source |  |
| Saint-Vincent-et-les Grenadines | la Soufrière | 1 220 m | la Soufrière (1 220 m) | 1 234 m | − 14 m | Wikidata : 1 220 m pour la Soufrière ; la seconde source : 1 234 m | **à relire** |
| Sénégal | falaise de Népin | 531 m | falaise de Népin (531 m) | lieu sans toponyme proche de Nepen Diakha, 581 m | − 50 m | Wikidata : falaise de Népin, 531 m, sans coordonnées ; la seconde source : un lieu sans nom près de Nepen Diakha, 581 m ; le World Factbook récent (miroir figé du 11/09/2026, africa_sg.json) : « unnamed elevation 2.8 km southeast of Nepen Diaka 648 m ». Trois valeurs, aucune tranchée : Wikidata gardé | **à relire** |
| Serbie | Midžor | 2 169 m | Velika Rudoka (2 658 m) | — | — | Wikidata déclare Velika Rudoka, sur la frontière du Kosovo et de la Macédoine du Nord, à 75 km du tracé de la Serbie : le Kosovo a sa propre fiche ; le plus haut point du tracé : le Midžor, sur la frontière bulgare |  |
| Slovaquie | Gerlachovský štít | 2 655 m | Gerlachovský štít (? m) ; valeurs : 2655 m, 2654.4 m | — | — | Wikidata : 2 655 m et 2 654,4 m pour le Gerlachovský štít, sans rang ni date ; 2 655 m, comme la seconde source |  |
| Somalie | — | — | Shimbiris (2 460 m) | — | — | Décision de l'utilisateur du 18/11/2026 : aucun point culminant ne passe par une zone disputée. Wikidata déclare Shimbiris (2 460 m ; 2 450 m selon la seconde source), dans le Somaliland, qui a sa propre fiche (à 185 km du tracé de la Somalie) ; aucune source lue ne donne le plus haut point du reste du pays : pas de ligne de sommet |  |
| Suède | Kebnekaise | 2 097 m | Kebnekaise (2 097 m) ; valeurs : 2135 m (1925-01-01), 2096.8 m (préféré) (2018-08-01) | 2 111 m | − 14 m | Wikidata : 2 097 m pour le Kebnekaise (sommet sud, rang préféré ou le plus récent) ; la seconde source : 2 111 m (le glacier du sommet fond) | **à relire** |
| Suriname | Juliana Top | 1 280 m | Juliana Top (1 280 m) | 1 230 m | + 50 m | Wikidata : 1 280 m pour le Julianatop ; la seconde source : 1 230 m | **à relire** |
| Thaïlande | Doi Inthanon | 2 565 m | Doi Inthanon (2 565 m) | 2 576 m | − 11 m | Wikidata : 2 565 m pour le Doi Inthanon ; la seconde source : 2 576 m | **à relire** |
| Viêt Nam | Fansipan | 3 143 m | Fansipan (? m) ; valeurs : 3143 m, 3147.3 m | — | — | Wikidata : 3 143 m et 3 147,3 m pour le Fansipan, sans rang ni date ; 3 143 m selon le qualificatif de la déclaration du Viêt Nam, à 1 m de la seconde source |  |
| Zambie | Mafinga Central | 2 339 m | Mafinga Central (2 339 m) | Mafinga Hills, 2 301 m | + 38 m | Wikidata : Mafinga Central, 2 339 m ; la seconde source : les Mafinga Hills, 2 301 m | **à relire** |

Sommets à plus de 10 km du tracé de leur pays, ou sans coordonnées (S56 ; la liste est figée par `tests/donnees-fiches.test.ts`) :

| Pays | Sommet | Distance au tracé |
|---|---|---|
| Gambie | point sans nom près de Sabi | sans coordonnées |
| Îles Marshall | Likiep | 128,7 km |
| Sénégal | falaise de Népin | sans coordonnées |
| Tuvalu | Niulakita | 154,3 km |

Sommets à 5 km ou moins d'une zone disputée de `contestees.json` (le tracé est simplifié ; un sommet dedans fait échouer le build) :

| Pays | Sommet | Zone (tenue par ; revendiquée par) | Distance |
|---|---|---|---|
| Belize | Doyle's Delight | NE_B51 (Belize ; Guatemala) | 0,5 km |
| Bhoutan | Gangkhar Puensum | NE_B75 (Bhoutan ; Chine) | 2,7 km |
| Syrie | mont Hermon | NE_B16 (Israël ; Syrie) | 2,8 km |

## 4. Langues (clé `langues`, D56 c)

Les officielles d'abord (sans part), puis les langues du pays parlées par 10 % ou plus de la population, avec leur part (CLDR compte toute personne qui parle la langue : les parts ne s'additionnent pas). D'abord la liste finale de chaque pays, puis chaque retrait et chaque ajout de la table, avec sa raison.

| Pays | Officielles | Parlées (part) | Table |
|---|---|---|---|
| Afghanistan | persan, pachto | — |  |
| Afrique du Sud | anglais, zoulou, xhosa, afrikaans, sotho du Nord, tswana, sotho du Sud, tsonga, swati, venda, ndébélé du Sud, langue des signes sud-africaine | — | relu |
| Albanie | albanais | — |  |
| Algérie | arabe, tamazight | — | relu |
| Allemagne | allemand | — | relu |
| Andorre | catalan | espagnol 43 % |  |
| Angola | portugais | umbundu 29 %, kimboundou 25 % |  |
| Antigua-et-Barbuda | anglais | — |  |
| Arabie saoudite | arabe | — |  |
| Argentine | espagnol | — |  |
| Arménie | arménien | — | relu |
| Australie | anglais | — |  |
| Autriche | allemand | — | relu |
| Azerbaïdjan | azerbaïdjanais | — |  |
| Bahamas | anglais | — |  |
| Bahreïn | arabe | — |  |
| Bangladesh | bengali | — | relu |
| Barbade | anglais | — |  |
| Belgique | néerlandais, français, allemand | — | relu |
| Belize | anglais | espagnol 55 %, créole bélizien 50 % |  |
| Bénin | français | fon 25 % |  |
| Bhoutan | dzongkha | népalais 17 %, tshangla 15 % | relu |
| Biélorussie | russe, biélorusse | — |  |
| Bolivie | espagnol, quechua, aymara | — |  |
| Bosnie-Herzégovine | bosniaque, croate, serbe | — | relu |
| Botswana | anglais, tswana | — |  |
| Brésil | portugais | — |  |
| Brunei | malais | chinois 11 % |  |
| Bulgarie | bulgare | turc 11 % | relu |
| Burkina Faso | français | moré 40 %, dioula 32 % |  |
| Burundi | roundi, français, anglais | — |  |
| Cambodge | khmer | — |  |
| Cameroun | français, anglais | — |  |
| Canada | anglais, français | — |  |
| Cap-Vert | portugais | capverdien 91 % |  |
| Chili | espagnol | — |  |
| Chine | chinois | — |  |
| Chypre | grec, turc | — | relu |
| Colombie | espagnol | — |  |
| Comores | arabe, comorien de Grande Comore, comorien d’Anjouan, français | — |  |
| Congo-Brazzaville | français | — |  |
| Congo-Kinshasa | français | swahili 50 % |  |
| Corée du Nord | coréen | — |  |
| Corée du Sud | coréen | — |  |
| Costa Rica | espagnol | — |  |
| Côte d’Ivoire | français | baoulé 11 % |  |
| Croatie | croate | — | relu |
| Cuba | espagnol | — |  |
| Danemark | danois | — | relu |
| Djibouti | français, arabe | afar 42 %, somali 41 % |  |
| Dominique | anglais | — |  |
| Égypte | arabe | — | relu |
| Émirats arabes unis | arabe | — | relu |
| Équateur | espagnol, quechua | — |  |
| Érythrée | tigrigna, anglais, arabe | tigré 18 % |  |
| Espagne | espagnol | catalan 17 % | relu |
| Estonie | estonien | russe 56 % | relu |
| Eswatini | anglais, swati | — |  |
| État de la Cité du Vatican | italien | — | relu |
| États-Unis | anglais | — |  |
| Éthiopie | amharique | oromo 32 % | relu |
| Fidji | anglais, hindi fidjien, fidjien | — | relu |
| Finlande | finnois, suédois | — | relu |
| France | français | — | relu |
| Gabon | français | — |  |
| Gambie | anglais | mandingue 29 % |  |
| Géorgie | géorgien | mingrélien 11 % |  |
| Ghana | anglais | akan 39 %, éwé 11 % |  |
| Grèce | grec | — | relu |
| Grenade | anglais | — |  |
| Guatemala | espagnol | — |  |
| Guinée | français | peul 26 %, soussou 24 %, mandingue 23 % |  |
| Guinée équatoriale | espagnol, français, portugais | fang 51 % |  |
| Guinée-Bissau | portugais | — | relu |
| Guyana | anglais | — |  |
| Haïti | créole haïtien, français | — |  |
| Honduras | espagnol | — |  |
| Hongrie | hongrois | — | relu |
| Îles Marshall | anglais, marshallais | — |  |
| Îles Salomon | anglais | pijin 82 % |  |
| Inde | hindi, anglais | — |  |
| Indonésie | indonésien | javanais 34 %, soundanais 12 % |  |
| Irak | arabe | sorani 12 % | relu |
| Iran | persan | azerbaïdjanais 24 % |  |
| Irlande | anglais, irlandais | — | relu |
| Islande | islandais | — |  |
| Israël | hébreu, arabe | russe 11 % | relu |
| Italie | italien | — | relu |
| Jamaïque | anglais | créole jamaïcain 95 % |  |
| Japon | japonais | — |  |
| Jordanie | arabe | — | relu |
| Kazakhstan | kazakh, russe | — | relu |
| Kenya | swahili, anglais | kikuyu 17 %, luyia 11 % |  |
| Kirghizstan | kirghize, russe | — |  |
| Kiribati | anglais, gilbertin | — |  |
| Kosovo | albanais, serbe | — | relu |
| Koweït | arabe | — |  |
| Laos | lao | — |  |
| Lesotho | sotho du Sud, anglais | zoulou 14 % |  |
| Lettonie | letton | russe 38 % | relu |
| Liban | arabe | — | relu |
| Liberia | anglais | anglais libérien 74 %, kpellé 20 %, bassa 14 %, krou 10 % |  |
| Libye | arabe | — |  |
| Liechtenstein | allemand | — | relu |
| Lituanie | lituanien | — | relu |
| Luxembourg | français, luxembourgeois, allemand | portugais 16 % | relu |
| Macédoine du Nord | macédonien | albanais 25 % |  |
| Madagascar | malgache, français | — | relu |
| Malaisie | malais | chinois 17 % | relu |
| Malawi | anglais, chewa | — |  |
| Maldives | maldivien | — | relu |
| Mali | français | bambara 46 % |  |
| Malte | maltais, anglais | — | relu |
| Maroc | arabe, amazighe standard marocain | — | relu |
| Maurice | français, anglais | créole mauricien 90 % |  |
| Mauritanie | arabe | — | relu |
| Mexique | espagnol | — | relu |
| Micronésie | anglais | chuuk 30 %, pohnpei 23 % |  |
| Moldavie | roumain | ukrainien 14 % |  |
| Monaco | français | — |  |
| Mongolie | mongol | — |  |
| Monténégro | serbe | — |  |
| Mozambique | portugais | macua 13 % |  |
| Myanmar (Birmanie) | birman | — |  |
| Namibie | anglais | afrikaans 75 %, kuanyama 35 %, ndonga 21 %, nama 11 % |  |
| Nauru | anglais, nauruan | — |  |
| Népal | népalais | maïthili 11 % |  |
| Nicaragua | espagnol | — |  |
| Niger | français | haoussa 41 %, zarma 17 % |  |
| Nigeria | anglais | pidgin nigérian 21 %, haoussa 13 %, igbo 13 %, yoruba 13 % | relu |
| Norvège | norvégien bokmål, norvégien nynorsk | — | relu |
| Nouvelle-Zélande | anglais, maori | — |  |
| Oman | arabe | — |  |
| Ouganda | swahili, anglais | ganda 13 % |  |
| Ouzbékistan | ouzbek | — | relu |
| Pakistan | ourdou, anglais | pendjabi 37 %, pachto 18 %, sindhi 14 %, saraïki 12 % | relu |
| Palaos | palau, anglais | — |  |
| Palestine | arabe | — | relu |
| Panama | espagnol | — | relu |
| Papouasie-Nouvelle-Guinée | tok pisin, anglais, hiri motu | — |  |
| Paraguay | guarani, espagnol | — |  |
| Pays-Bas | néerlandais | — | relu |
| Pérou | espagnol, quechua | — |  |
| Philippines | anglais, filipino | cebuano 24 % | relu |
| Pologne | polonais | — | relu |
| Portugal | portugais | — | relu |
| Qatar | arabe | persan 11 % |  |
| République centrafricaine | sango, français | — |  |
| République dominicaine | espagnol | — |  |
| Roumanie | roumain | — | relu |
| Royaume-Uni | anglais | — | relu |
| Russie | russe | — |  |
| Rwanda | kinyarwanda, anglais, français | — |  |
| Saint-Christophe-et-Niévès | anglais | — |  |
| Saint-Marin | italien | — |  |
| Saint-Vincent-et-les Grenadines | anglais | — |  |
| Sainte-Lucie | anglais | — |  |
| Salvador | espagnol | — |  |
| Samoa | samoan, anglais | — |  |
| Sao Tomé-et-Principe | portugais | — | relu |
| Sénégal | français | wolof 70 %, peul 21 %, sérère 11 % | relu |
| Serbie | serbe | — | relu |
| Seychelles | français, anglais | créole seychellois 98 % |  |
| Sierra Leone | anglais | krio 95 %, mendé 27 %, timné 26 % |  |
| Singapour | anglais, chinois, malais, tamoul | — |  |
| Slovaquie | slovaque | hongrois 11 % | relu |
| Slovénie | slovène | — | relu |
| Somalie | somali, arabe | — |  |
| Soudan | arabe, anglais | — | relu |
| Soudan du Sud | anglais | arabe 27 % |  |
| Sri Lanka | cingalais, tamoul | — | relu |
| Suède | suédois | — | relu |
| Suisse | allemand, français, italien, romanche | — | relu |
| Suriname | néerlandais | sranan tongo 68 % |  |
| Syrie | arabe | — | relu |
| Tadjikistan | tadjik | — | relu |
| Taïwan | chinois, minnan, hakka | — |  |
| Tanzanie | swahili, anglais | — |  |
| Tchad | arabe, français | — |  |
| Tchéquie | tchèque | — | relu |
| Thaïlande | thaï | isan 24 % | relu |
| Timor oriental | portugais, tétoum | — |  |
| Togo | français | éwé 17 % |  |
| Tonga | tongien, anglais | — |  |
| Trinité-et-Tobago | anglais | — |  |
| Tunisie | arabe | — | relu |
| Turkménistan | turkmène | — | relu |
| Turquie | turc | — | relu |
| Tuvalu | tuvalu, anglais | — |  |
| Ukraine | ukrainien | russe 46 % | relu |
| Uruguay | espagnol | — |  |
| Vanuatu | bichelamar, anglais, français | — |  |
| Venezuela | espagnol | — |  |
| Viêt Nam | vietnamien | — |  |
| Yémen | arabe | — |  |
| Zambie | anglais | bemba 34 %, chewa 19 %, tonga 11 % |  |
| Zimbabwe | shona, anglais, ndébélé du Nord | — |  |

### Retraits

| Pays | Code | Langue | Part (CLDR) | Statut (CLDR) | Raison |  |
|---|---|---|---|---|---|---|
| Algérie | arq | arq | 83 % |  | dialecte de l’arabe (arabe algérien) |  |
| Algérie | fr | français | 33 % | officielle | le français n’a pas de statut officiel en Algérie (Constitution : l’arabe, et tamazight) ; CLDR le dit officiel | **à relire** |
| Algérie | mey | mey | 11 % |  | dialecte de l’arabe (hassanya) |  |
| Allemagne | bar | bar | 17 % |  | dialecte de l’allemand (bavarois) |  |
| Allemagne | en | anglais | 64 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Allemagne | fr | français | 18 % |  | langue apprise, sans statut officiel |  |
| Allemagne | nds | nds | 12 % |  | bas allemand : langue régionale reconnue, dont tous les locuteurs parlent l’allemand ; retiré comme les dialectes (§ 2.1) | **à relire** |
| Arménie | ru | russe | 65 % |  | langue apprise, sans statut officiel |  |
| Autriche | bar | bar | 95 % |  | dialecte de l’allemand (bavarois), qui double l’allemand officiel |  |
| Autriche | en | anglais | 73 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Autriche | fr | français | 13 % |  | langue apprise, sans statut officiel |  |
| Bangladesh | en | anglais | 18 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Belgique | en | anglais | 59 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Belgique | vls | vls | 10 % |  | dialecte du néerlandais (flamand occidental) |  |
| Bhoutan | en | anglais | 11 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Bosnie-Herzégovine | en | anglais | 45 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Bulgarie | en | anglais | 25 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Bulgarie | ru | russe | 23 % |  | langue apprise, sans statut officiel |  |
| Chypre | en | anglais | 73 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Croatie | en | anglais | 49 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Danemark | de | allemand | 47 % |  | langue apprise ; la minorité allemande du Schleswig du Nord est de l’ordre de 0,3 % (estimé) | **à relire** |
| Danemark | en | anglais | 86 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Danemark | sv | suédois | 13 % |  | langue apprise, sans statut officiel |  |
| Égypte | arz | arz | 64 % |  | dialecte de l’arabe (arabe égyptien) |  |
| Égypte | en | anglais | 35 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Émirats arabes unis | en | anglais | 50 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Espagne | en | anglais | 24 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Estonie | en | anglais | 50 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Estonie | fi | finnois | 21 % |  | langue apprise, sans statut officiel |  |
| État de la Cité du Vatican | la | la | 82 % |  | langue officielle du Saint-Siège, que personne ne parle comme langue du pays ; CLDR lui donne la part de l'italien (82 %), recopiée | **à relire** |
| Éthiopie | en | anglais | 43 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Fidji | hi | hindi | 44 % |  | doublon du hindi fidjien (hif), officiel |  |
| Finlande | de | allemand | 18 % |  | langue apprise, sans statut officiel |  |
| Finlande | en | anglais | 70 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| France | en | anglais | 39 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| France | es | espagnol | 13 % |  | langue apprise, sans statut officiel |  |
| Grèce | en | anglais | 51 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Guinée-Bissau | fr | français | 15 % |  | langue apprise, sans statut officiel |  |
| Hongrie | de | allemand | 18 % |  | langue apprise, sans statut officiel |  |
| Hongrie | en | anglais | 20 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Irak | en | anglais | 35 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Irak | ku | ku | 10 % |  | kurde de CLDR (alphabet arabe), qui recouvre le sorani déjà listé : doublon | **à relire** |
| Irlande | fr | français | 13 % |  | langue apprise, sans statut officiel |  |
| Israël | apc | apc | 17 % |  | dialecte de l’arabe (arabe levantin), qui double l’arabe officiel |  |
| Israël | en | anglais | 85 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Italie | en | anglais | 34 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Italie | fr | français | 20 % |  | langue apprise ; officielle dans la seule Vallée d’Aoste (0,2 % de la population, estimé) | **à relire** |
| Jordanie | apc | apc | 66 % |  | dialecte de l’arabe (arabe levantin) |  |
| Jordanie | en | anglais | 45 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Kazakhstan | en | anglais | 15 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Kosovo | aln | aln | 74 % |  | dialecte de l’albanais (guègue), qui double l’albanais officiel |  |
| Lettonie | en | anglais | 46 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Liban | apc | apc | 100 % |  | dialecte de l’arabe (arabe levantin) |  |
| Liban | en | anglais | 40 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Liban | fr | français | 38 % |  | langue apprise, sans statut officiel (très répandue) | **à relire** |
| Liechtenstein | gsw | gsw | 85 % | officielle | dialecte de l’allemand (alémanique, « officiel de fait » dans CLDR), qui double l’allemand |  |
| Lituanie | de | allemand | 14 % |  | langue apprise, sans statut officiel |  |
| Lituanie | en | anglais | 38 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Lituanie | ru | russe | 80 % |  | langue apprise ; la minorité russe est d’environ 5 % (estimé) | **à relire** |
| Luxembourg | en | anglais | 56 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Madagascar | en | anglais | 18 % | officielle | plus officiel depuis la Constitution de novembre 2010, qui ne nomme que le malgache et le français (Wikipédia en français, « Madagascar », révision 241288817 du 12/11/2026, lue le 17/11/2026) ; langue apprise (CLDR : 18 %, toute personne qui la parle) |  |
| Malaisie | en | anglais | 21 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Maldives | en | anglais | 75 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Malte | fr | français | 13 % |  | langue apprise, sans statut officiel |  |
| Malte | it | italien | 56 % |  | langue apprise, sans statut officiel |  |
| Maroc | ary | ary | 87 % |  | dialecte de l’arabe (arabe marocain) |  |
| Maroc | en | anglais | 14 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Maroc | fr | français | 36 % | officielle | le français n’a pas de statut officiel au Maroc (Constitution de 2011 : l’arabe et l’amazighe) ; CLDR le dit officiel de fait | **à relire** |
| Maroc | tzm | tzm | 9,8 % | officielle | amazighe de l’Atlas central : une variété de l’amazighe, que l’amazighe standard (zgh) représente | **à relire** |
| Mauritanie | fr | français | 13 % |  | langue apprise, sans statut officiel |  |
| Mauritanie | mey | mey | 87 % |  | dialecte de l’arabe (hassanya), qui double l’arabe officiel |  |
| Mexique | en | anglais | 13 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Norvège | no | no | 100 % | officielle | double code du norvégien : « no » recouvre le bokmål (nb) et le nynorsk (nn), déjà listés (§ 2.1) |  |
| Ouzbékistan | ru | russe | 14 % |  | langue apprise, sans statut officiel |  |
| Pakistan | lah | lah | 40 % |  | lahnda : macrolangue qui recouvre le pendjabi occidental et le saraïki, déjà listés | **à relire** |
| Palestine | apc | apc | 87 % |  | dialecte de l’arabe (arabe levantin) |  |
| Panama | en | anglais | 14 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Pays-Bas | de | allemand | 71 % |  | langue apprise, sans statut officiel |  |
| Pays-Bas | en | anglais | 90 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Pays-Bas | fr | français | 19 % |  | langue apprise, sans statut officiel |  |
| Pays-Bas | nds | nds | 11 % |  | bas saxon : langue régionale reconnue, dont tous les locuteurs parlent le néerlandais ; retiré comme en Allemagne | **à relire** |
| Philippines | es | espagnol | 31 % |  | langue apprise ; ses locuteurs de naissance sont rares (le chiffre de CLDR, 31 %, est sans doute faux, estimé) |  |
| Pologne | de | allemand | 19 % |  | langue apprise ; la minorité allemande est d’environ 0,2 % (estimé) | **à relire** |
| Pologne | en | anglais | 33 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Pologne | ru | russe | 18 % |  | langue apprise, sans statut officiel |  |
| Portugal | en | anglais | 27 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Portugal | es | espagnol | 10 % |  | langue apprise, sans statut officiel |  |
| Portugal | fr | français | 15 % |  | langue apprise, sans statut officiel |  |
| Roumanie | en | anglais | 31 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Roumanie | es | espagnol | 10 % |  | langue apprise, sans statut officiel |  |
| Roumanie | fr | français | 12 % |  | langue apprise, sans statut officiel |  |
| Royaume-Uni | fr | français | 17 % |  | langue apprise, sans statut officiel |  |
| Sao Tomé-et-Principe | fr | français | 20 % |  | langue apprise, sans statut officiel |  |
| Serbie | sq | albanais | 19 % |  | le chiffre de CLDR (19 %) compte le Kosovo, qui a sa propre fiche ; l’albanais est parlé par environ 1 % de la Serbie seule (estimé) | **à relire** |
| Slovaquie | cs | tchèque | 47 % |  | langue comprise de la plupart des Slovaques (proche) ; la minorité tchèque est d’environ 0,5 % (estimé) |  |
| Slovaquie | de | allemand | 22 % |  | langue apprise, sans statut officiel |  |
| Slovaquie | en | anglais | 26 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Slovénie | de | allemand | 42 % |  | langue apprise, sans statut officiel |  |
| Slovénie | en | anglais | 59 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Slovénie | hr | croate | 61 % |  | langue apprise ou comprise ; la minorité croate est d’environ 2 % (estimé) | **à relire** |
| Soudan | apd | apd | 61 % |  | dialecte de l’arabe (arabe soudanais) |  |
| Sri Lanka | en | anglais | 10 % |  | langue de liaison (Constitution), apprise ; pas officielle | **à relire** |
| Suède | en | anglais | 86 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Suisse | en | anglais | 45 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Suisse | gsw | gsw | 66 % | officielle | dialecte de l’allemand (suisse allemand, « officiel de fait » dans CLDR), qui double l’allemand |  |
| Syrie | apc | apc | 85 % |  | dialecte de l’arabe (arabe levantin) |  |
| Tadjikistan | ru | russe | 12 % |  | langue apprise, sans statut officiel |  |
| Tchéquie | de | allemand | 15 % |  | langue apprise, sans statut officiel |  |
| Tchéquie | en | anglais | 27 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Tchéquie | sk | slovaque | 16 % |  | langue comprise de la plupart des Tchèques (proche), la minorité slovaque est d’environ 1 % (estimé) | **à relire** |
| Thaïlande | en | anglais | 27 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |
| Tunisie | aeb | aeb | 90 % |  | dialecte de l’arabe (arabe tunisien) |  |
| Tunisie | fr | français | 53 % | officielle | le français n’a pas de statut officiel en Tunisie (Constitution : l’arabe) ; CLDR le dit officiel | **à relire** |
| Turkménistan | ru | russe | 12 % |  | langue apprise, sans statut officiel |  |
| Turquie | en | anglais | 17 % |  | langue apprise, sans statut officiel (CLDR compte toute personne qui la parle) |  |

### Ajouts

| Pays | Code | Langue | Officielle | Raison | Source |  |
|---|---|---|---|---|---|---|
| Afrique du Sud | af | afrikaans | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | nr | ndébélé du Sud | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | nso | sotho du Nord | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | ss | swati | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | st | sotho du Sud | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | tn | tswana | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | ts | tsonga | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | ve | venda | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | xh | xhosa | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | zu | zoulou | oui | officielle dans tout le pays (CLDR : « official_regional ») | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) : douze langues officielles, dont onze depuis la Constitution de 1996 |  |
| Afrique du Sud | sfs | langue des signes sud-africaine | oui | langue des signes sud-africaine, douzième langue officielle depuis l'amendement constitutionnel du 19 juillet 2023 (absente de CLDR) | Wikipédia en français, « Langues en Afrique du Sud », révision 239514997 du 15/09/2026 (lue le 17/11/2026) | **à relire** |
| Algérie | ber | tamazight | oui | tamazight, langue nationale et officielle depuis 2016 ; CLDR ne la marque pas (il compte le kabyle, 7,8 %, sans statut) ; code ISO 639-2 « ber » (langues berbères) | Constitution algérienne, art. 4, révision de 2016 (estimé, de mémoire) | **à relire** |
| Maroc | zgh | amazighe standard marocain | oui | l’amazighe, langue officielle depuis 2011 ; CLDR ne marque officielle que sa variété de l’Atlas central (tzm) | Constitution du Maroc de 2011, art. 5 (estimé, de mémoire) | **à relire** |
| Nigeria | yo | yoruba | non | le yoruba n'est pas officiel : seul l'anglais l'est ; l'article 55 de la Constitution nomme le haoussa, l'igbo et le yoruba pour les débats de l'Assemblée. Gardé en langue parlée (13 %, comme le haoussa et l'igbo) | Wikipédia en français, « Nigeria », révision 241115666 du 07/11/2026 (lue le 17/11/2026) : « La langue officielle du Nigeria, l'anglais » |  |
| Sénégal | wo | wolof | non | langue nationale, pas officielle (CLDR : « de_facto_official ») ; gardé en langue parlée, avec la part de CLDR (70 %) | Wikipédia en français, « Sénégal », révision 241251513 du 11/11/2026 (lue le 17/11/2026) : « La Constitution de 2001 a reconnu au français le statut de langue officielle et à six langues celui de langues nationales, le wolof […] » |  |
| Suisse | rm | romanche | oui | le romanche, langue nationale, officielle de la Confédération pour les rapports avec les Romanches (CLDR : « official_regional », 0,5 %) | Constitution fédérale suisse, art. 4 et 70 (estimé, de mémoire) | **à relire** |
| Ukraine | ru | russe | non | pas officiel (CLDR : « de_facto_official ») ; langue du pays, gardée en langue parlée avec la part de CLDR (46 %, toute personne qui la parle) | Wikipédia en français, « Ukraine », révision 240693733 du 25/10/2026 (lue le 17/11/2026) : « L'ukrainien est la seule langue officielle depuis une loi entrée en vigueur le 17 juillet 2019 » |  |

### Parts et ordres écrits à la main

| Pays | Langue | Part retenue | Part (CLDR) | Raison | Source |
|---|---|---|---|---|---|
| Pakistan | pendjabi | 37 % | 70 % | D56 c : langues du pays seules ; parts du recensement de 2023 (langue maternelle) : CLDR donne au pendjabi 70 %, presque le double ; le saraïki y a 12,00 %, comme dans CLDR. Le recensement exclut le Gilgit-Baltistan et l'Azad Cachemire | recensement du Pakistan de 2023, langue maternelle : 36,98 %, d'après la Wikipédia en anglais, « Languages of Pakistan », révision 1383926115 du 05/11/2026 (lue le 17/11/2026) |
| Pakistan | pachto | 18 % | 16 % | D56 c : langues du pays seules ; parts du recensement de 2023 (langue maternelle) : CLDR donne au pendjabi 70 %, presque le double ; le saraïki y a 12,00 %, comme dans CLDR. Le recensement exclut le Gilgit-Baltistan et l'Azad Cachemire | recensement de 2023, langue maternelle : 18,15 % (même page) |
| Pakistan | sindhi | 14 % | 15 % | D56 c : langues du pays seules ; parts du recensement de 2023 (langue maternelle) : CLDR donne au pendjabi 70 %, presque le double ; le saraïki y a 12,00 %, comme dans CLDR. Le recensement exclut le Gilgit-Baltistan et l'Azad Cachemire | recensement de 2023, langue maternelle : 14,31 % (même page) |

| Pays | Ordre des officielles | Raison | Source |
|---|---|---|---|
| Kazakhstan | kazakh, russe | D56 c : langues du pays seules ; le kazakh, langue d'État, avant le russe, langue officielle (CLDR met le russe d'abord, plus parlé) | Wikipédia en français, « Kazakhstan », révision 241381747 du 15/11/2026 (lue le 17/11/2026) : « Le kazakh […] c'est la langue d'État. Le russe […] c'est la langue officielle » |

### Noms français absents de CLDR

| Code | Nom | Source |
|---|---|---|
| bci | baoulé | ISO 639-3 bci « Baoulé » |
| ber | tamazight | ISO 639-2 ber « Berber languages » ; « tamazight », le nom de la Constitution algérienne |
| bsq | bassa | ISO 639-3 bsq « Bassa » |
| bzj | créole bélizien | ISO 639-3 bzj « Belize Kriol English » |
| kro | krou | ISO 639-3 kro « Kru languages » (code de famille) |
| lir | anglais libérien | ISO 639-3 lir « Liberian English » |
| sfs | langue des signes sud-africaine | ISO 639-3 sfs « South African Sign Language » ; nom de la Wikipédia en français, « Langues en Afrique du Sud » |
| skr | saraïki | ISO 639-3 skr « Saraiki » |
| toi | tonga | ISO 639-3 toi « Tonga (Zambia) » |
| tsj | tshangla | ISO 639-3 tsj « Tshangla » |
| tts | isan | ISO 639-3 tts « Thai, Northeastern » (isan) |
| wni | comorien d’Anjouan | ISO 639-3 wni « Comorian, Ndzwani » (shindzuani) |
| zdj | comorien de Grande Comore | ISO 639-3 zdj « Comorian, Ngazidja » (shingazidja) |

## 5. Superficies (clé `superficie`, D57)

Le chiffre de Wikidata pour tous les pays, cité « selon Wikidata » (décision du 18/11/2026), par la règle du choix : la valeur de rang préféré, sinon la plus récente si elles sont datées, sinon la plus grande ; aucune ligne de la table. D'abord les 30 pays dont les zones disputées (tenues ou revendiquées) pèsent 1 % ou plus du tracé : leur chiffre suit souvent la revendication du pays, pas le contrôle de fait ; l'écart est rapporté au tracé de la carte (surface calculée sur la carte, qui suit le contrôle de fait).

| Pays | Wikidata | Tracé | Écart au tracé | Part des zones | Valeurs de Wikidata |
|---|---|---|---|---|---|
| Argentine | 2 780 085 km² | 2 783 122 | − 0,1 % | 1,2 % |  |
| Azerbaïdjan | 86 600 km² | 86 153 | + 0,5 % | 3,6 % |  |
| Belize | 22 966 km² | 22 373 | + 2,6 % | 35,7 % |  |
| Bhoutan | 38 394 km² | 40 488 | − 5,2 % | 3,4 % |  |
| Chine | 9 562 910 km² | 9 373 435 | + 2,0 % | 1,6 % |  |
| Chypre | 9 242 km² | 5 396 | + 71,3 % | 67,8 % |  |
| Comores | 2 034 km² | 1 679 | + 21,2 % | 23,6 % |  |
| Égypte | 1 010 408 km² | 1 002 870 | + 0,8 % | 1,8 % |  |
| Géorgie | 69 700 km² | 69 462 | + 0,3 % | 18,8 % |  |
| Guatemala | 108 889 km² | 109 192 | − 0,3 % | 7,3 % |  |
| Guyana | 214 970 km² | 212 139 | + 1,3 % | 74,2 % |  |
| Îles Marshall | 181 km² | 166 | + 9,3 % | 2,4 % |  |
| Inde | 3 287 593 km² | 3 158 319 | + 4,1 % | 9,5 % |  |
| Israël | 20 770 km² | 22 120 | − 6,1 % | 6 % |  |
| Japon | 377 974 km² | 373 333 | + 1,2 % | 1,3 % | 377972.28 ; 377973.68 (préféré) (2026-07-01) |
| Malaisie | 330 803 km² | 329 335 | + 0,4 % | 11,8 % |  |
| Maroc | 446 550 km² | 592 431 | − 24,6 % | 45,4 % |  |
| Maurice | 2 040 km² | 2 020 | + 1,0 % | 4,9 % |  |
| Moldavie | 33 844 km² | 33 116 | + 2,2 % | 9,2 % |  |
| Pakistan | 881 913 km² | 873 936 | + 0,9 % | 22 % |  |
| Palestine | 6 020 km² | 6 079 | − 1,0 % | 2 % |  |
| Philippines | 343 448 km² | 294 430 | + 16,6 % | 13,2 % |  |
| Serbie | 88 499 km² | 77 471 | + 14,2 % | 14,1 % | 88361 ; 88499 (préféré) |
| Seychelles | 459 km² | 438 | + 4,9 % | 22,6 % |  |
| Somalie | 637 657 km² | 473 871 | + 34,6 % | 35,5 % |  |
| Soudan | 1 878 000 km² | 1 861 994 | + 0,9 % | 1,6 % |  |
| Soudan du Sud | 644 329 km² | 629 533 | + 2,4 % | 2,3 % |  |
| Suriname | 163 270 km² | 145 764 | + 12,0 % | 12,3 % |  |
| Ukraine | 603 550 km² | 570 179 | + 5,9 % | 7,8 % |  |
| Venezuela | 912 050 km² | 916 572 | − 0,5 % | 15,6 % |  |

Les 18 pays où Wikidata donne plusieurs superficies en km² (la liste et le choix sont figés par `tests/donnees-fiches.test.ts`) :

| Pays | Retenu | Valeurs de Wikidata | Tracé |
|---|---|---|---|
| Allemagne | 357 588 km² | 357170 ; 349390 ; 357587.77 (préféré) | 356 379 |
| Australie | 7 688 287 km² | 7688287 (préféré) ; 410977 ; 7659861 ; 8148250 | 7 705 929 |
| Belgique | 30 688 km² | 30528 ; 30688 (préféré) | 30 562 |
| Biélorussie | 207 597 km² | 207600.496983 ; 207596.76 (préféré) | 206 632 |
| Bosnie-Herzégovine | 51 209 km² | 51209.2 ; 10 ; 51187 | 51 721 |
| Équateur | 257 204 km² | 257204.27 (préféré) (2022-01-01) ; 255586.91 (2010-01-01) | 256 155 |
| Estonie | 45 335 km² | 45335 (préféré) (2024-01-01) ; 45339 (2015-01-01) | 45 576 |
| Finlande | 338 478 km² | 303947 ; 338478.34 (préféré) (2023-01-01) ; 52427.08 (2023-01-01) ; 338145 ; 303963.28 (2023-01-01) ; 390905.42 (2023-01-01) ; 34515.06 (2023-01-01) | 330 938 |
| Hongrie | 93 011 km² | 93011.4 (préféré) ; 93030 | 92 947 |
| Japon | 377 974 km² | 377972.28 ; 377973.68 (préféré) (2026-07-01) | 373 333 |
| Lettonie | 64 594 km² | 62226.85 (2025-01-01) ; 62226.92 (2024-01-01) ; 64593.77 (préféré) (2026-01-01) ; 61760.39 (préféré) (2026-01-01) ; 64593.76 (2025-01-01) ; 64593.79 (2022-01-01) | 64 259 |
| Luxembourg | 2 593 km² | 2586.36 ; 2593.05 (préféré) (2024-07-09) | 2 600 |
| Norvège | 385 207 km² | 18905 (2018-02-27) ; 144848 (2018-02-27) ; 365.4 (2018-02-27) ; 323808 (2018-02-27) ; 385207 (préféré) (2019-12-20) ; 1210 (2018-02-27) ; 9648 (2018-02-27) ; 18488 (2018-02-27) ; 126384 (2018-02-27) ; 2674.8 (2018-02-27) ; 240014 (2019-11-09) ; 385207 | 379 535 |
| Pays-Bas | 37 378 km² | 41543 ; 37378 (préféré) | 37 254 |
| Serbie | 88 499 km² | 88361 ; 88499 (préféré) | 77 471 |
| Slovaquie | 49 034 km² | 49033.720839 (préféré) (2025-01-01) ; 49034 (2024-01-01) ; 49035 | 48 308 |
| Suède | 447 425 km² | 447425.16 (préféré) (2022-01-01) ; 122577.5 (2019-01-01) ; 528861.06 (2019-01-01) ; 407283.59 (2019-01-01) | 443 499 |
| Turquie | 783 562 km² | 783562.05296 ; 783562 (préféré) ; 783356 | 779 426 |

## 6. Heure locale et fuseaux (clé `fuseau`)

Zone de chaque pays : celle de `zone.tab` la plus proche de la capitale ; nombre de fuseaux : décalages normaux (heure d'hiver : le plus petit du 1er janvier et du 1er juillet 2026) distincts des zones dont le point tombe dans le tracé de l'entité (ou en mer, à 50 km au plus). Lignes de la table, puis les pays à plusieurs fuseaux (S62) ; une zone d'un autre code ISO que le pays porte ce code entre parenthèses.

| Pays | Zone | Règle | Raison |  |
|---|---|---|---|---|
| Chine | Asia/Shanghai | Asia/Shanghai | Décision de l'utilisateur du 18/11/2026 : l'heure légale de toute la Chine est l'heure de Pékin (UTC+8) ; Asia/Urumqi (UTC+6, « Xinjiang Time » dans zone.tab) est une heure d'usage au Xinjiang, d'après les commentaires de la zone dans le fichier asia de la base tz 2026e : la règle compterait 2 fuseaux |  |
| Kazakhstan | Asia/Almaty | Asia/Qostanay | Astana est plus près du point d'Asia/Qostanay ; zone.tab décrit Asia/Almaty comme « most of Kazakhstan » ; même décalage (UTC+5) depuis 2024 |  |
| Kosovo | Europe/Belgrade | — | zone.tab n'a pas de ligne pour le Kosovo (XK est hors de la norme ISO 3166-1) ; le Kosovo suit l'heure d'Europe centrale et ses changements d'heure, comme Belgrade ; le nom de la zone ne s'affiche pas | **à relire** |
| Nouvelle-Zélande | Pacific/Auckland | Pacific/Auckland | Décision de l'utilisateur du 18/11/2026 : Pacific/Auckland (UTC+12) et Pacific/Chatham (UTC+12:45) ; la règle compte aussi Pacific/Fakaofo (TK, UTC+13), dont le point est à 4,6 km en mer du tracé de l'entité : Tokelau aura ses fuseaux sur sa propre fiche, au lot F3 |  |

| Pays | Fuseaux | Règle | Décalages normaux (h) | Au 1er janvier (h) | Au 1er juillet (h) | Zones comptées |
|---|---|---|---|---|---|---|
| Australie | 5 | 5 | 8, 8.75, 9.5, 10, 10.5 | 8, 8.75, 9.5, 10, 10.5, 11 | 8, 8.75, 9.5, 10, 10.5 | Australia/Lord_Howe, Antarctica/Macquarie, Australia/Hobart, Australia/Melbourne, Australia/Sydney, Australia/Broken_Hill, Australia/Brisbane, Australia/Lindeman, Australia/Adelaide, Australia/Darwin (en mer, 2.1 km), Australia/Perth, Australia/Eucla |
| Brésil | 4 | 4 | -5, -4, -3, -2 | -5, -4, -3, -2 | -5, -4, -3, -2 | America/Noronha, America/Belem, America/Fortaleza (en mer, 0.3 km), America/Recife (en mer, 0.3 km), America/Araguaina, America/Maceio, America/Bahia, America/Sao_Paulo, America/Campo_Grande, America/Cuiaba, America/Santarem, America/Porto_Velho, America/Boa_Vista, America/Manaus, America/Eirunepe, America/Rio_Branco |
| Canada | 6 | 6 | -8, -7, -6, -5, -4, -3.5 | -8, -7, -6, -5, -4, -3.5 | -7, -6, -5, -4, -3, -2.5 | America/St_Johns, America/Halifax, America/Glace_Bay (en mer, 0.3 km), America/Moncton, America/Goose_Bay, America/Blanc-Sablon (en mer, 0.5 km), America/Toronto, America/Iqaluit, America/Atikokan, America/Winnipeg, America/Resolute, America/Rankin_Inlet (en mer, 0.3 km), America/Regina, America/Swift_Current, America/Edmonton, America/Cambridge_Bay, America/Inuvik, America/Vancouver, America/Creston, America/Dawson_Creek, America/Fort_Nelson, America/Whitehorse, America/Dawson |
| Chili | 3 | 3 | -6, -4, -3 | -5, -3 | -6, -4, -3 | America/Santiago, America/Coyhaique, America/Punta_Arenas, Pacific/Easter (en mer, 0.1 km) |
| Chine | 1 | 2 (table : 1) | 6, 8 | 6, 8 | 6, 8 | Asia/Shanghai, Asia/Urumqi |
| Congo-Kinshasa | 2 | 2 | 1, 2 | 1, 2 | 1, 2 | Africa/Kinshasa, Africa/Lubumbashi, Africa/Bangui (CF) |
| Équateur | 2 | 2 | -6, -5 | -6, -5 | -6, -5 | America/Guayaquil, Pacific/Galapagos |
| Espagne | 2 | 2 | 0, 1 | 0, 1 | 1, 2 | Europe/Madrid, Africa/Ceuta, Atlantic/Canary (en mer, 0.9 km) |
| États-Unis | 6 | 6 | -10, -9, -8, -7, -6, -5 | -10, -9, -8, -7, -6, -5 | -10, -9, -8, -7, -6, -5, -4 | America/New_York, America/Detroit, America/Kentucky/Louisville, America/Kentucky/Monticello, America/Indiana/Indianapolis, America/Indiana/Vincennes, America/Indiana/Winamac, America/Indiana/Marengo, America/Indiana/Petersburg, America/Indiana/Vevay, America/Chicago, America/Indiana/Tell_City, America/Indiana/Knox, America/Menominee, America/North_Dakota/Center, America/North_Dakota/New_Salem, America/North_Dakota/Beulah, America/Denver, America/Boise, America/Phoenix, America/Los_Angeles, America/Anchorage, America/Juneau (en mer, 0.5 km), America/Sitka, America/Metlakatla (en mer, 0.2 km), America/Yakutat, America/Nome (en mer, 0.5 km), America/Adak, Pacific/Honolulu |
| France | 5 | 5 | -4, -3, 1, 3, 4 | -4, -3, 1, 3, 4 | -4, -3, 2, 3, 4 | Europe/Paris, America/Cayenne (GF), America/Guadeloupe (GP) (en mer, 1.8 km), Europe/Monaco (MC) (en mer, 2.6 km), America/Martinique (MQ) (en mer, 0.5 km), Indian/Reunion (RE) (en mer, 0.1 km), Indian/Mayotte (YT) (en mer, 2.7 km) |
| Indonésie | 3 | 3 | 7, 8, 9 | 7, 8, 9 | 7, 8, 9 | Asia/Jakarta, Asia/Pontianak, Asia/Makassar (en mer, 0.8 km), Asia/Jayapura |
| Kiribati | 3 | 3 | 12, 13, 14 | 12, 13, 14 | 12, 13, 14 | Pacific/Tarawa (en mer, 9.4 km), Pacific/Kanton (en mer, 7 km), Pacific/Kiritimati (en mer, 1.4 km) |
| Mexique | 4 | 4 | -8, -7, -6, -5 | -8, -7, -6, -5 | -7, -6, -5 | America/Mexico_City, America/Cancun (en mer, 1.9 km), America/Merida, America/Monterrey, America/Matamoros, America/Chihuahua, America/Ciudad_Juarez, America/Ojinaga, America/Mazatlan, America/Bahia_Banderas, America/Hermosillo, America/Tijuana |
| Micronésie | 2 | 2 | 10, 11 | 10, 11 | 10, 11 | Pacific/Chuuk (en mer, 8.1 km), Pacific/Pohnpei, Pacific/Kosrae |
| Mongolie | 2 | 2 | 7, 8 | 7, 8 | 7, 8 | Asia/Ulaanbaatar, Asia/Hovd |
| Nouvelle-Zélande | 2 | 3 (table : 2) | 12, 12.75, 13 | 13, 13.75 | 12, 12.75, 13 | Pacific/Auckland, Pacific/Chatham, Pacific/Fakaofo (TK) (en mer, 4.6 km) |
| Papouasie-Nouvelle-Guinée | 2 | 2 | 10, 11 | 10, 11 | 10, 11 | Pacific/Port_Moresby, Pacific/Bougainville |
| Pays-Bas | 2 | 2 | -4, 1 | -4, 1 | -4, 2 | America/Kralendijk (BQ), Europe/Amsterdam |
| Portugal | 2 | 2 | -1, 0 | -1, 0 | 0, 1 | Europe/Lisbon, Atlantic/Madeira (en mer, 1.3 km), Atlantic/Azores (en mer, 1 km) |
| Russie | 11 | 11 | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | Europe/Kaliningrad, Europe/Moscow, Europe/Simferopol (UA), Europe/Kirov, Europe/Volgograd, Europe/Astrakhan, Europe/Saratov, Europe/Ulyanovsk, Europe/Samara, Asia/Yekaterinburg, Asia/Omsk, Asia/Novosibirsk, Asia/Barnaul, Asia/Tomsk, Asia/Novokuznetsk, Asia/Krasnoyarsk, Asia/Irkutsk, Asia/Chita, Asia/Yakutsk, Asia/Khandyga, Asia/Vladivostok, Asia/Ust-Nera, Asia/Magadan, Asia/Sakhalin, Asia/Srednekolymsk, Asia/Kamchatka, Asia/Anadyr |

## 7. Monnaies (clé `monnaies`)

| Pays | Ordre retenu | Ordre de CLDR | Raison |  |
|---|---|---|---|---|
| Bhoutan | BTN, INR | BTN, INR | le ngultrum, émis par le Bhoutan, puis la roupie indienne, qui y a cours |  |
| Haïti | HTG, USD | HTG, USD | la gourde, puis le dollar des États-Unis |  |
| Lesotho | LSL, ZAR | ZAR, LSL | le loti, émis par le Lesotho, puis le rand, qui y a cours (CLDR met le rand en premier) |  |
| Namibie | NAD, ZAR | NAD, ZAR | le dollar namibien, puis le rand |  |
| Palestine | ILS, JOD | ILS, JOD | pas de monnaie propre : le shekel, le plus employé, puis le dinar jordanien (Cisjordanie) | **à relire** |
| Panama | PAB, USD | PAB, USD | le balboa, puis le dollar des États-Unis, qui sert aux billets |  |
| Zimbabwe | ZWG, USD | ZWG, USD | le ZiG (or du Zimbabwe, 2024), puis le dollar des États-Unis |  |
