# Questions à trancher avant le J1a

Issues du J0 (04/11/2026) : ce que les données et la carte permettent
maintenant, mais dont le choix revient à l'utilisateur. Chacune se règle
par une décision au registre, puis ce fichier se met à jour.

## Notation

1. **Zones contestées et entités de fait.** Natural Earth suit les
   frontières de fait : un toucher en Crimée désigne la Russie, au
   Somaliland `NE_SOL`, à Chypre du Nord `NE_CYN`, à l'ouest du mur du
   Sahara occidental le Maroc. Quand la question est « Ukraine »,
   « Somalie », « Chypre » ou « Maroc », ces touchers sont-ils justes ?
   Les données le permettent sans en décider : `contestees.json` (champ
   `dans` : ce qu'un toucher y donne), `pays.json` (`revendique_par`,
   `note_ne` des entités contestées).
2. **Enclaves de fait.** Baïkonour (`NE_KAB`, un trou de 6 486 km² dans le
   Kazakhstan), Guantánamo (`NE_USG`, hors de Cuba), Akrotiri et Dhekelia
   (hors de Chypre) : les fusionner au pays pour la notation, ou les
   laisser à part ?
3. **Recouvrement d'un micro-État et de son voisin.** *Tranchée*
   (décision « Toucher sur la terre ferme ») : sur le tracé d'un pays, le
   disque d'un petit pays voisin ne l'emporte que sous le doigt, avec ~3 px
   de marge (6,5 px de son centre), et s'il est plus près que le point du
   pays ; sinon le pays sous le doigt, et la note suit. Dans Rome, à 5 px du
   centre du disque du Vatican, la carte désigne le Vatican, juste pour le
   Vatican comme pour l'Italie (dedans) ; à 8 px, l'Italie seule. Reste à
   voir : aux petits zooms, les disques de 7 px couvrent encore l'essentiel
   des petits pays qu'ils bordent (au zoom 1, 79 % du tracé de l'Italie
   désigne le Vatican, Saint-Marin ou Malte ; la Suisse cède 41 % au
   Liechtenstein au zoom 1, 26 % au zoom 8) : c'est ce qu'on voit à l'écran,
   mais faut-il dessiner ces disques plus petits sur un pays voisin ?

## Carte au doigt

4. **Zoom de départ.** Au zoom 1, en portrait sur le téléphone de mesure, le
   monde n'occupe qu'une bande de ~190 px sur 723 : la zone où l'on touche
   un micro-État des Antilles n’y fait que 3 à 19 px de diamètre. Partir zoomé sur la
   région de la séance, ou laisser zoomer ?
5. **Seuil des micro-États.** Disque toujours dessiné si le plus grand
   polygone fait moins de 1 000 km². Maurice (1 907 km²), les Comores et les
   Samoa sont juste au-dessus : sous 4 px à l'écran ils ont un disque, entre
   4 et 10 px une cible invisible seulement. Monter le seuil ?

## Données

6. **Noms à vérifier.** « Île Brésilienne » (`NE_BRI`, traduction faite
   au J0) ; variantes courtes de CLDR retenues pour Hong Kong, Macao et la
   Palestine (le nom standard est une désignation longue).
7. **Superficies.** `superficie_km2` est l'aire de la géométrie Natural
   Earth, loin de la valeur officielle pour certains pays (Monaco ×9, Maroc
   +33 % avec le Sahara, Chypre −42 %) : au J4, prendre Wikidata (P2046),
   comme prévu par l'étude « données ».
