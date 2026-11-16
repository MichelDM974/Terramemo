# Fiche d'un lieu — besoin (16/11/2026)

*Ticket #34. Ce fichier donne le besoin de l'utilisateur et ses choix du 16/11.
La conception reste à faire : données, poids, lots.*

## Demande

« Quand on clique sur la carte sur un pays ou une mer », une petite fenêtre
s'ouvre avec le nom, la capitale, le nombre d'habitants, les langues parlées
et quelques photos de monuments ou d'endroits connus. L'utilisateur a ajouté
le drapeau. Il laisse Claude ajouter ce qui manque d'important.

## Choix de l'utilisateur (16/11)

- **Ouverture : la barre qui grandit.** Le toucher fait ce qu'il fait
  aujourd'hui : la zone s'allume, et la barre du bas donne son nom et la ligne
  de la mémoire. La barre ajoute « capitale · habitants ». La toucher, ou la
  glisser vers le haut, ouvre la fiche entière, avec sa « × » (décision
  « Croix vers la carte »). Ce choix est préféré à deux autres :
  - une fenêtre à chaque toucher, qu'il faut fermer pour toucher ailleurs et
    qui couvre la carte du téléphone ;
  - un bouton ⓘ à côté du nom.
- **Lieux :**
  - les pays et les territoires (Groenland, Sahara occidental…, avec leur
    statut) ;
  - les 50 océans et mers ;
  - les 24 communes de La Réunion.

  Les capitales n'ont pas de fiche de ville : l'utilisateur ne l'a pas
  choisie.
- **Photos :** 3 à 5 par lieu, prises sur Wikimedia Commons. Un script les
  propose, et l'utilisateur les relit avant la mise en ligne, comme pour le
  niveau facile du quiz. Ce choix est préféré à un choix sans relecture et à
  une fiche sans photos au départ.
- **Contenu demandé :**
  - nom, capitale, habitants, langues, drapeau ;
  - superficie, monnaie, gentilé ;
  - heure locale ;
  - lien vers Wikipédia.

## Contenu par sorte de lieu

**Pays :**

- nom et drapeau. C'est le drapeau des exercices ; l'Afghanistan et la
  Bolivie en ont deux (décision « Drapeaux contestés et sosies ») ;
- capitales : celles de `geodata/capitales-main.json`, donc toutes celles
  que le pays se déclare ;
- habitants avec leur année, et superficie ;
- langues : les officielles d'abord, puis les plus parlées avec leur part ;
- monnaie et gentilé (« les Japonais ») ;
- heure locale à la capitale, avec l'écart par rapport à l'appareil
  (« 16 h 20, +5 h ») ; le nombre de fuseaux s'il y en a plusieurs ;
- continent et sous-région (ONU) ;
- voisins ;
- photos et lien Wikipédia ;
- ligne de la mémoire (« Vu 4 fois · revient dans 5 j »).

**Territoire non jouable, zone contestée :**

- d'abord le statut, comme l'appli le dit déjà (« tenue par… »,
  « revendiquée par… ») ;
- puis ce qui s'applique dans la liste des pays.

Aucun chiffre ni aucune formule ne tranche une revendication (critère neutre
de la décision « Pays et frontières »).

**Océan ou mer :**

- nom ;
- océan de rattachement d'une mer bordière (`geodata/mers-affectations.json`) ;
- superficie et profondeur maximale ;
- pays riverains ;
- photos, lien Wikipédia, ligne de la mémoire.

**Commune de La Réunion :**

- nom ;
- habitants (IGN, déjà dans les données) ;
- superficie ;
- gentilé (« Saint-Pierrois ») ;
- photos (pitons, cirques, plages…), lien Wikipédia, ligne de la mémoire.

## Ajouts de Claude, mis d'office

- **Continent et sous-région :** ils situent le pays.
- **Voisins :** on peut les toucher dans la fiche, ce qui ouvre leur fiche
  et fait voler la carte jusqu'à eux. Le J4 (#6) a besoin de la même donnée.
- **Source et année de chaque chiffre :** des habitants « 2019 » et
  d'autres « 2024 » ne se comparent pas. La Banque mondiale (CC BY) et la
  Licence Ouverte de l'IGN demandent de citer leur source.
- **Langues officielles puis parlées :** c'est la réponse à « langues
  parlées ». L'Inde a 22 langues officielles : la liste entière serait
  illisible.
- **Ligne de la mémoire :** elle est déjà dans la barre, et reste dans la
  fiche.

## À trancher par l'utilisateur

1. **« Apprendre ce lieu » dans la fiche :** le lieu passe en tête de la
   prochaine grappe d'Apprendre. Pour : on passe de la curiosité à la
   mémoire. Contre : cela casse l'ordre des grappes par voisinage (décision
   « Apprendre et Révision du jour »).
2. **Fiche depuis le bilan d'une partie :** toucher une erreur ouvre la
   fiche du lieu juste. C'est le moment où la fiche aide le plus à retenir.
3. **Point culminant et fête nationale :** le point culminant peut attendre
   le J5 (#7), qui apporte les montagnes.

## Non retenus

- **Chef d'État et régime politique :** ils vieillissent vite, alors que les
  données sont figées, et ils touchent à la neutralité.
- **Religions :** sujet sensible, chiffres fragiles.
- **PIB, indicatif téléphonique, domaine internet :** loin de la géographie.

## Règles déjà actées qui s'appliquent

- **Jamais pendant une partie :** la fiche donnerait la capitale et le
  drapeau. La recherche s'efface déjà pendant une partie (décision
  « En-tête »). Hors partie, la recherche mène à la fiche : elle montre le
  lieu, donc sa barre.
- **Fichiers de langue :** textes et noms y sont (décision « Langue »). Les
  noms des langues et des monnaies viennent de CLDR, déjà utilisé.
- **Budget de transfert :** l'hébergement donne 360 Mo par jour, soit
  ≈ 1,8 Mo par nouveau visiteur (estimé). Les données de la fiche se chargent
  à la première ouverture d'une fiche, jamais au premier affichage, comme la
  couche des mers.
- **Rien d'externe** (plan, § Données). Chaque source est citée dans
  Crédits.

## Points de conception

- **Sources :**
  - habitants et superficie : Wikidata (CC0, mais l'année change d'un pays à
    l'autre), ou Banque mondiale / ONU (CC BY 4.0, une même année pour tous,
    mais des territoires manquent) ;
  - langues et monnaies : CLDR (`territoryInfo`, `currencyData`) ;
  - gentilés : Wikidata, à vérifier en français, sinon une table faite à la
    main ;
  - fuseaux : base tz (`zone.tab`) ;
  - voisins : topologie de Natural Earth ;
  - lien Wikipédia : lien du site donné par Wikidata ;
  - mers : Wikidata ;
  - communes : IGN.
- **Photos :**
  - candidats : les lieux du pays qui ont une image dans Wikidata (sites du
    patrimoine mondial d'abord) ;
  - classement : la notoriété déjà utilisée (nombre de Wikipédias, vues de
    la Wikipédia française) ;
  - licences libres seulement ; auteur, licence et lien sous chaque photo
    (CC BY-SA l'exige) ; texte alternatif : le nom du lieu.
- **Hébergement des photos, deux options :**
  - vignettes réduites au build et servies par Firebase : rien d'externe et
    hors ligne possible, mais ≈ 30 Ko par photo sur le budget de transfert ;
  - photos prises chez Wikimedia : aucun coût de transfert, mais l'adresse
    IP du visiteur part chez un tiers (politique de confidentialité à
    revoir) et rien ne marche hors ligne.

  Dans l'APK : vignettes embarquées (≈ 30 Mo pour ≈ 1 000 photos, estimé) ou
  chargées en ligne.
- **Outil de relecture des photos :** une page locale pour garder, écarter
  ou remplacer chaque photo.
- **Hors ligne :** le texte des fiches dans le cache du service worker (#22).
- **Tests :**
  - chaque lieu des trois sujets a sa fiche ;
  - aucun champ n'est vide sans le vouloir ;
  - chaque photo a son auteur et sa licence.
