# Fiche d'un lieu — besoin (16/11/2026)

*Ticket #34. Ce fichier donne le besoin de l'utilisateur et ses choix du 16/11.
La conception est dans `2026-11-16-fiche-lieu-conception.md` ; ses écarts à
ce besoin sont au § 12 de celle-ci.*

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
- point culminant (nom, altitude) et fête nationale ;
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

## Propositions de Claude acceptées par l'utilisateur (16/11)

1. **« Apprendre ce lieu » dans la fiche :** le lieu entre dans la
   prochaine grappe de son sujet, pour qu'on passe de la curiosité à la
   mémoire. Cela fait une exception à l'ordre des grappes par voisinage.
   L'exception ne doit pas dépasser la grappe du jour : la décision
   « Apprendre et Révision du jour » a écarté un Apprendre hors budget, qui
   permettait de contourner le rythme. Reste à concevoir quelles fiches
   entrent pour un pays : son nom seul, ou aussi sa capitale et son drapeau.
2. **Fiche depuis le bilan d'une partie :** toucher une erreur ouvre la
   fiche du lieu juste. C'est le moment où la fiche aide le plus à retenir.
   La partie est finie, donc la règle « jamais pendant une partie » tient.
3. **Point culminant et fête nationale** dans la fiche d'un pays. Le point
   culminant n'attend pas le J5 (#7) : la fiche donne son nom et son
   altitude, pas sa place sur la carte.

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
    (CC BY-SA l'exige) ; texte alternatif : le nom du lieu ;
  - mers : l'image de Wikidata est souvent une carte (pour la Méditerranée,
    une carte politique en SVG, vu le 16/11). Il faut donc prendre leurs
    photos ailleurs : lieux de la côte, catégories de Commons.
- **Hébergement des photos :** sur notre site. Le chiffrage est plus bas.
- **Outil de relecture des photos :** une page locale pour garder, écarter
  ou remplacer chaque photo.
- **Hors ligne :** le texte des fiches dans le cache du service worker (#22).
- **Tests :**
  - chaque lieu des trois sujets a sa fiche ;
  - aucun champ n'est vide sans le vouloir ;
  - chaque photo a son auteur et sa licence.

## Photos sur notre site : l'offre gratuite suffit (chiffré le 16/11)

Choix de l'utilisateur : servir les photos par Firebase Hosting, avec le
site, si l'offre gratuite suffit. Elle suffit, à deux conditions données à
la fin de cette section.

**Quotas de Spark** (page des tarifs de Firebase, lue le 16/11) : 10 Go de
stockage et 360 Mo de transfert par jour, pour tout le projet. Spark ne
facture jamais.

**Poids mesuré** sur 9 photos de Commons : Tour Eiffel, Taj Mahal, Fuji,
Machu Picchu, Piton de la Fournaise, Grande Muraille, Pétra, Mafate, Angkor.
Elles sont recadrées en 3:2 et enregistrées en WebP qualité 60 (Pillow,
`method=6`) :

| Taille | Moyenne | Écart |
|---|---|---|
| vignette 480 × 320 | 20 Ko | 9 à 38 Ko |
| fiche 720 × 480 | 47 Ko | 20 à 88 Ko |
| plein écran 1 080 × 720 | 106 Ko | 43 à 198 Ko |

En qualité 75, c'est ≈ 20 % de plus.

**Nombre :** ≈ 1 200 photos (estimé) :

- 197 pays × 4 ;
- 48 territoires × 3 ;
- 12 zones contestées × 2 ;
- 50 mers × 3 ;
- 24 communes × 3.

**Stockage :** une vignette et un plein écran font ≈ 127 Ko par photo, donc
≈ 150 Mo en tout. Le site lui-même pèse 5 Mo (`dist/`). Le stockage tient
donc largement… pour une seule version.

Or Firebase garde chaque version déployée pour le retour arrière, et ces
versions comptent dans le stockage. Terramemo se déploie plusieurs fois par
jour. Rien ne dit qu'un fichier identique d'une version à l'autre ne compte
qu'une fois : si les photos comptent à chaque version, 60 versions font
9 Go.

**Transfert :** une vignette se charge à l'ouverture de la fiche, les
suivantes en glissant, et le plein écran au toucher d'une photo. Les
données des fiches arrivent au premier toucher de la barre (≈ 50 Ko,
estimé). Le budget est de 1,8 Mo par nouveau visiteur (décision
« Hébergement ») :

| Visiteur | Ce qu'il fait | Coût | Part du budget |
|---|---|---|---|
| moyen | 3 fiches, 1 photo agrandie | ≈ 0,2 Mo | + 12 % |
| curieux | 10 fiches, 3 photos agrandies | ≈ 0,6 Mo | + 32 % |
| curieux, 4 vignettes chargées d'un coup par fiche | 10 fiches, 3 photos agrandies | ≈ 1,2 Mo | + 65 % |

Avec le chargement à la demande, on passe d'≈ 200 nouveaux visiteurs par
jour à ≈ 150 à 180. Un visiteur qui revient ne retélécharge pas les photos
déjà vues : le service worker (#22) garde déjà en cache ce qui est chargé à
l'usage, comme les drapeaux (`src/sw/logique.ts`). Une photo fait comme
eux, tant que son empreinte ne change pas.

**APK :** il ne passe pas par Hosting (plan, § Technique). Il embarque les
vignettes (≈ 24 Mo). Le plein écran se charge depuis le site, en ligne
seulement : embarqué, il ferait ≈ 150 Mo de plus, trop lourd.

**Repli :** Cloudflare Pages (décision « Hébergement ») n'a pas de plafond
de transfert et accepte 20 000 fichiers par site en gratuit, à revérifier le
jour venu. Les photos font ≈ 2 400 fichiers, le site ≈ 250 : ça tient.

**Les deux conditions :**

1. Charger les photos une par une, à la demande, et jamais au premier
   affichage.
2. Avant le premier déploiement des photos, limiter le nombre de versions
   gardées : console, historique des versions, « Release storage settings ».
   Avec 10 versions, c'est 1,5 Go au plus.

**À lire alors dans la console** (Hosting, Utilisation) : le transfert réel
par jour. Les 1,8 Mo par visiteur sont une estimation du 04/11.
