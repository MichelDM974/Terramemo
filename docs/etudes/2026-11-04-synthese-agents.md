# Plan : appli pour devenir bon en géographie (site + APK)

*Ce plan reprend trois études faites sans écrire de code : pédagogie, données, technique. Les chiffres de poids ont été mesurés sur des fichiers d'essai, sauf mention « estimé ». Les points incertains sont marqués « à vérifier ».*

## 1. Le concept en 3 phrases

L'écran d'accueil est **une carte du monde colorée selon ce que tu retiens** : chaque pays prend la couleur de ta probabilité de t'en souvenir aujourd'hui, et un pays jamais vu reste gris. Tu vois ainsi tes lacunes là où elles sont, pas un score abstrait. Chaque fait est révisé au bon moment par une méthode de répétition espacée, en tenant compte de ce que tu sais déjà. Les nouveautés arrivent par petits groupes de voisins. Les mauvais choix proposés viennent de **tes propres confusions** (Niger et Nigeria, Slovénie et Slovaquie). Chaque erreur montre sur la carte où tu as touché, où se trouvait la bonne réponse et la distance entre les deux. Tout marche hors ligne, sur le site comme dans l'APK.

## 2. Choix recommandés

### Pédagogie
- **Répétition espacée avec FSRS.** Elle donne pour chaque fait une probabilité de rappel, nécessaire à la carte colorée et à un « % maîtrisé » honnête. Elle fait aussi moins réviser que les méthodes plus anciennes. *Écartés : SM-2, qui ne donne pas cette probabilité et dont la note de facilité s'effondre après quelques échecs ; les boîtes de Leitner, trop grossières.*
- **Un même fait se joue dans les deux sens** (« où est le Pérou ? », « quel est ce pays ? »), et chaque sens a sa propre fiche de révision, jamais posée le même jour que l'autre.
- **Trois niveaux par fait** : QCM avec des choix proches, puis réponse libre (saisie ou toucher sans aide), puis le sens inverse. Le QCM ne sert qu'à démarrer. *Écarté : un QCM permanent avec des choix au hasard, qui n'apprend presque rien.*
- **Nouveautés par région** (5 à 8 par séance, des voisins ensemble), puis **révisions mélangées** entre régions : mélanger aide à distinguer ce qu'on confond.
- **Point de départ selon ce que tu sais déjà.** Chaque pays a une difficulté de départ, il y a un bouton « je connais déjà », puis un test de placement court. On ne fait pas réviser « France » à un Français. La méthode s'inspire de travaux de recherche sur la géographie (Pelánek, 2014), sans reprendre leur interface.
- **Maîtrise mesurée de façon stricte** : un fait compte comme maîtrisé si sa probabilité de rappel est d'au moins 90 % et que le souvenir tient au moins 21 jours. Un examen de 20 questions sans aide, de temps en temps, vérifie que l'estimation est juste. *Ce seuil est un choix raisonnable, pas une valeur publiée.*
- **Motivation sans manipulation** : pas de série de jours qui retombe à zéro, révisions en retard plafonnées par jour, séances courtes qu'on peut arrêter à tout moment, notifications désactivées par défaut. Des jalons concrets (« Afrique de l'Ouest maîtrisée ») remplacent les badges. *Écartés : points, classements, séries culpabilisantes.*

### Données
- **Frontières : Natural Earth v5.1.2** (domaine public), au niveau de détail le plus fin, simplifié à environ 2 km : 434 Ko compressés, mesuré. Natural Earth publie des variantes de frontières « vues par un pays » ; on prend la **variante française**, qui suit la position officielle de la France sur les territoires contestés. *Écartés : world-atlas (version plus ancienne, sans variante française ni noms français), GADM (sa licence interdit la redistribution, donc pas dans un APK), geoBoundaries (attribution obligatoire, frontières disputées selon le Département d'État américain).*
- **Micro-États en pastilles** (Vatican, Monaco, Nauru…). Aucune simplification ne les rend touchables sous forme de contour. Un test refuse toute géométrie vide : une simplification mal réglée a fait disparaître le Vatican pendant l'étude.
- **France : IGN Admin Express** (Licence Ouverte 2.0, gratuit) : 101 départements pour 54 Ko, les 24 communes de La Réunion pour environ 10 Ko. *Écartée : la couche départements de Natural Earth, qui contient des coquilles (« Seien-et-Marne ») et pas de régions.*
- **Noms français** : `NAME_FR` de Natural Earth + le référentiel Unicode CLDR + un fichier maison d'alias et de corrections. Les deux sources divergent (« Birmanie » ou « Myanmar »), il faut donc trancher.
- **Population, superficie, noms des fleuves** : Wikidata (CC0), extrait une seule fois à la préparation. *Écarté : REST Countries, dont l'API gratuite est dépréciée et la suite payante.*
- **Drapeaux : flag-icons** (MIT), 207 drapeaux pour 454 Ko compressés.
- **Voisins** calculés à partir des frontières communes, pas recopiés d'une liste.
- **Pas de fond de carte en images** (tuiles) : tout est dessiné par le code. *Écartées : les tuiles OpenStreetMap, dont la politique interdit l'usage hors ligne ; des tuiles auto-hébergées, trop lourdes.*
- **Script de préparation en Node** (`geodata/build.mjs`). L'outil de simplification, mapshaper, est déjà en Node : on reste ainsi sur un seul langage. L'étude données proposait Python 3.14 : je recommande Node, mais c'est à confirmer.

### Technique
- **Une seule base de code web** (TypeScript + Vite, sans framework d'interface), **emballée en APK par Capacitor**. Le cœur de l'appli est la carte : avec une appli native comme Light, il faudrait l'écrire deux fois. Dans Light, environ un commit sur trois touche `android/`, et le rendu 3D y a été refait deux fois. Capacitor garde ce qui marche dans Light : APK signé par la CI, release au lien fixe. *Écartés : Kotlin natif (carte et logique en double) ; une PWA emballée par Chrome (TWA, hors ligne seulement après un premier chargement) ; Flutter ou Compose Multiplatform (site web de seconde zone, nouveau langage, pas d'équivalent de la bibliothèque de carte d3-geo).*
- **Carte en SVG avec d3-geo et d3-zoom**, projection Equal Earth. Savoir quel pays a été touché est gratuit, et les tests sont faciles (sélecteur `path[data-iso=MC]`). Les micro-États ont une zone de toucher invisible d'au moins 44 px, et un toucher ambigu va au pays le plus proche. Une fonction `pick(x, y) → pays` isole tout cela : on peut passer au dessin Canvas si la carte saccade. *Écarté pour l'instant : MapLibre, à reconsidérer seulement pour un zoom jusqu'aux villes ou le relief.*
- **Progrès stockés dans le navigateur (IndexedDB) sous forme de journal de réponses en ajout seul** : `{id, fiche, date, note}`. L'état de chaque fiche en est recalculé. Synchroniser deux appareils ou importer un fichier revient alors à réunir deux journaux, sans conflit possible. À fixer dès le premier jour.
- **Pas de compte au départ** : export et import d'un fichier JSON. Firebase (offre gratuite, nouveau projet, connexion par e-mail et mot de passe) seulement si plusieurs appareils sont vraiment utilisés.
- **Site sur Firebase Hosting, offre gratuite**, déployé depuis le PC comme Light. Pas de serveur à moi, rien sur le Pi. *Écarté : GitHub Pages, qui ne sert pas un dépôt privé sans offre payante.*

## 3. Jalons

| # | Contenu | Critère de fin | Taille |
|---|---|---|---|
| **J0 — Test des risques** | Premier passage du script de données (pays, pastilles des micro-États, variante française) ; carte SVG monde dans un APK Capacitor installé à la main ; pincer pour zoomer, déplacer, toucher. | Mesure sur ton téléphone : fluidité acceptable au zoom monde, Caraïbes et micro-États touchables sans erreur. Sinon, décision écrite : passer à Canvas, ou simplifier davantage au dézoom. | S |
| **J1 — MVP : les pays du monde** | Localiser et nommer (QCM puis saisie tolérante aux fautes, avec la règle anti-confusion Niger/Nigeria) ; FSRS avec des cas de test communs repris d'une version de référence ; séances (révisions dues, puis 5 à 8 nouveautés par région) ; rétroaction sur la carte avec la distance ; accueil en carte colorée et « % maîtrisé » par continent ; « je connais déjà » ; journal local, export et import ; hors ligne ; écran Crédits et fichier des sources ; site déployé et APK publié. | Les 195 pays sont jouables sur téléphone, micro-États compris ; tests et CI au vert ; tu l'utilises une semaine sur le téléphone sans blocage. | L |
| **J2 — Capitales, drapeaux, réglage fin** | Capitales dans les deux sens (plusieurs réponses acceptées : Bolivie, Afrique du Sud…) ; drapeaux ; test de placement ; tableau personnel de tes confusions, qui choisit les mauvais choix des QCM ; examen de 20 questions ; plafond quotidien et objectif réglable. | Chaque pays a une capitale et un drapeau vérifiés par un test ; l'examen confirme les probabilités estimées. | M |
| **J3 — France et La Réunion** | Régions et départements (nom, numéro, préfecture) ; DROM en encarts ; puis les 24 communes de La Réunion (cirques et sommets : à voir). | Les 101 départements et les 18 régions jouables, encarts compris ; les tests de données passent. | M |
| **J4 — Relations et chiffres** | Voisins (« nomme les voisins de la Hongrie ») ; placer une ville sur carte vierge, avec une note selon la distance ; ordres de grandeur (« lequel est le plus peuplé », classer 4 pays, estimer sur un curseur à échelle logarithmique) ; silhouettes. | Chaque exercice a son générateur testé et ses fiches de révision. | M |
| **J5 — Géographie physique** | Mers, détroits, chaînes de montagnes, déserts (liste choisie à la main), puis fleuves (une centaine, noms français ajoutés à la main), toucher près d'un tracé. | Poids mesuré et dans le budget (300 à 600 Ko estimés) ; aucune entité sans nom français. | L |
| **J6 — Comptes et synchronisation** *(seulement si besoin)* | Firebase Auth par e-mail, journal dans Firestore, chacun ne lit et n'écrit que ses données, plus un résumé périodique pour qu'un nouvel appareil ne relise pas tout. | Deux appareils, l'un hors ligne, arrivent au même état après reconnexion. | M |
| *Option* | Défi « même série de questions pour deux personnes », par un lien. | — | S |

## 4. Dépôt et checklist nouveau-projet

```
<nom>/
  README.md  package.json  vite.config.ts  tsconfig.json  capacitor.config.ts
  src/srs/     FSRS pur, horloge passée en paramètre
  src/quiz/    générateurs de questions, purs
  src/map/     rendu SVG, gestes, pick(x,y), zones des micro-États
  src/store/   IndexedDB, journal, export/import (sync Firebase au J6)
  src/ui/      écrans ; src/sw.ts : service worker (tout le build en cache)
  public/      vendor/inter/, icônes, manifest, geo/*.topojson générés et versionnés
  geodata/     build.mjs, corrections et alias, sommes de contrôle des sources
               (téléchargements bruts non versionnés)
  tests/unit/  Vitest : srs, quiz, données ; tests/cases/ : cas de référence FSRS
  android/     généré par `cap add android`, versionné, rarement touché
  firebase/    firebase.json, .firebaserc (+ firestore.rules au J6)
  .github/workflows/ci.yml, android.yml
  .claude/skills/run-<nom>/SKILL.md + driver.py
```

Ce que la checklist implique concrètement ici :
- **README** : le concept, l'approche technique, les fonctionnalités, l'installation (site, APK, développement). Ni décisions ni feuille de route : elles vont au registre de cdc.
- **GitHub** : dépôt privé dès le premier commit significatif.
- **Docker : aucun.** Il n'y a pas de serveur, seulement un site statique, comme Light.
- **Python, `constraints.txt`, SQLite : sans objet**, sauf si on garde un script de données en Python. Les dépendances Node sont figées par `package-lock.json` et installées par `npm ci`.
- **CI** :
  - `ci.yml` à chaque push : vérification des types, Vitest, tests de données (géométrie non vide, codes uniques, budget de taille), tests d'interface en tactile à 360×800 ;
  - `android.yml` sur tag ou lancement manuel, pas à chaque push : avec une seule base de code, chaque changement du site changerait l'APK et consommerait des minutes de CI. Il signe avec une nouvelle clé (secret du dépôt, plus une copie de sauvegarde hors de GitHub), publie dans la release `android` au lien fixe et numérote la version d'après le nombre de commits. Un `version.json` sur le site permet à l'appli de signaler qu'une nouvelle version existe.
- **Skill `run-<nom>`** :
  - `serve` : le build servi sur le port 8061 avec un profil de navigateur jetable, donc un stockage vide ;
  - `smoke` : sans dépendance, le code de sortie échoue au moindre problème ;
  - `ui` : captures en largeur téléphone, par le pilote CDP en stdlib ;
  - chemin humain : `npm run dev` sur le port 8060, ou le site déployé ;
  - déploiement : `firebase deploy --only hosting` juste après le commit, puis vérification sur le site.
- **Sauvegarde horaire : pas nécessaire**, car il n'y a pas de base côté serveur. Les données à protéger sont tes progrès sur le téléphone. Je propose donc un export JSON en un geste et un rappel discret si le dernier export date de plus de 30 jours. Au J6, Firestore sert de seconde copie.
- **Style** : mode sombre seul, Inter servie localement, palette dérivée d'une couleur d'accent à choisir. En-tête à trois pages : Séance, Carte, Progrès. Roue ⚙ pour l'objectif quotidien, les paquets, l'export et la notification. La palette de la carte colorée doit rester lisible sur fond sombre et pour les daltoniens.

## 5. Risques et parades

| Risque | Parade |
|---|---|
| La carte saccade dans la WebView d'un téléphone moyen | Mesure au J0, avant tout le reste. Repli par la fonction `pick(x, y)` : passage au dessin Canvas, ou géométrie plus simplifiée au dézoom. |
| Caraïbes et Pacifique impossibles à toucher au doigt | Pastilles de taille fixe à l'écran, toucher attribué au pays le plus proche, loupe sur appui long, zoom. Essai sur un vrai téléphone au J0. |
| FSRS mal recopié | Cas de test repris de la version de référence ts-fsrs, plus des tests de propriétés : rejouer le journal dans n'importe quel ordre donne le même état. Licence et version de ts-fsrs à vérifier. |
| Saisie libre injuste (faute refusée) ou trop large (Iran accepté pour Irak) | Texte normalisé (accents, articles), tolérance de fautes selon la longueur du mot, et règle stricte : si la saisie est aussi proche d'une autre réponse valide, c'est faux. Les paires à risque ont leurs propres cas de test. |
| Territoires contestés, sujet politique | Variante française des frontières, annoncée dans l'appli. Pas de question sur les entités contestées dans le jeu de base : elles vont dans un paquet séparé, désactivé par défaut. **Palestine à vérifier** : la France l'a reconnue, en septembre 2025 si je me souviens bien, alors que les données Natural Earth de 2022 la classent encore à part. |
| Données qui vieillissent (Natural Earth 2022, populations 2019) | Populations à jour depuis Wikidata ; un script de préparation qu'on peut relancer, et un fichier des sources qui date chaque élément. |
| Coût de la CI pour l'APK | Construction sur tag ou à la demande, et avis « nouvelle version » dans l'appli. |
| Perte des progrès (téléphone perdu, stockage du navigateur effacé) | Demande de stockage persistant au navigateur, export JSON avec rappel, synchronisation au J6 si besoin. |
| Ajouter du contenu avant que le cœur soit bon (le relief coûte cher) | Physique au J5 seulement, sur une liste choisie à la main ; un budget de poids testé en CI. |
| Bord à bord sur Android 15+, bouton retour, mises à jour de Capacitor | Marges de l'écran gérées en CSS dès le J0, plugin `@capacitor/app` pour le bouton retour, mise à jour de Capacitor une fois par an, tests à l'appui. |
| Connexion Google, si des comptes arrivent | Impossible dans une WebView, et elle demande la même configuration de clé que dans Light. On s'en tient à l'e-mail et au mot de passe. |
| Licences des drapeaux | Risque faible pour une appli pédagogique, non vérifié drapeau par drapeau. On garde la licence MIT de flag-icons et on se limite aux drapeaux d'États. |

## 6. Questions, triées par impact

Les premières changent l'architecture. Pour chacune, l'option marquée ★ est celle que je recommande.

**A. Celles qui changent l'architecture**
1. **Pour qui ?** (a) Toi seul. (b) ★ Toi et tes proches. (c) Des élèves : quel âge, quel programme ? (d) Le public. Cela décide des comptes, du niveau de langue et d'un éventuel classement.
2. **APK indispensable ?** (a) ★ Un vrai APK par Capacitor : hors ligne dès l'installation, notifications possibles. (b) Le site « installé » depuis Chrome, sans APK ni CI Android. (c) Une appli native Kotlin comme Light : la carte et la logique écrites deux fois, déconseillé.
3. **Comptes et synchronisation ?** (a) ★ Aucun au départ : export et import d'un fichier, le format de journal permettant d'ajouter la synchronisation plus tard. (b) Firebase avec e-mail dès le MVP. (c) Firebase avec connexion Google : coûteux, comme dans Light. Sur combien d'appareils comptes-tu jouer ?
4. **Pour quoi faire ?** (a) ★ Culture générale. (b) Un programme scolaire précis. (c) Un concours ou un examen. Le contenu à faire en premier en dépend.

**B. Contenu et pédagogie**

5. **Par où commencer ?** (a) ★ Le monde (J1-J2), puis la France (J3). (b) Le monde et la France dès le MVP. (c) La France d'abord.
6. **Saisie au clavier du téléphone ?** (a) ★ Oui, tolérante aux fautes, avec en option des suggestions après 3 lettres aux premiers niveaux. (b) Pas de saisie sur téléphone, seulement toucher et QCM ; la saisie sur le site. (c) Une orthographe exacte exigée.
7. **Drapeaux ?** (a) ★ Oui au J2, drapeaux d'États seulement. (b) Avec aussi ceux des régions et territoires. (c) Hors sujet pour toi.
8. **Quel détail pour La Réunion ?** (a) Seulement la position des DROM. (b) ★ Les DROM, puis les 24 communes. (c) Aussi les cirques, les sommets et les ravines : données à trouver, non étudiées.
9. **Géographie physique ?** (a) ★ Extension au J5, sur une liste choisie (une centaine de fleuves, les grandes chaînes, mers et détroits). (b) Prioritaire. (c) Jamais.
10. **Ordres de grandeur** (population, superficie) ? (a) ★ Au J4 : exercice original, mais loin de la carte. (b) Dès le J2. (c) Non.
11. **Temps par jour et rappels ?** (a) ★ 10 minutes par défaut, réglable ; une seule notification que tu actives toi-même, à l'heure choisie. (b) 5 minutes. (c) 20 minutes ou plus. Aucune notification : à toi de voir.
12. **Social ?** (a) ★ Strictement personnel, plus tard un défi « même série de questions » par un lien. (b) Un classement : il faut des comptes, et il y aura de la triche. (c) Rien, jamais.

**C. Données sensibles**

13. **Frontières contestées ?** (a) ★ Variante française, annoncée dans l'appli, avec le Sahara occidental au Maroc et la Crimée à l'Ukraine. (b) Les frontières de fait, marquées « contesté ». (c) Exclure toutes les zones contestées.
14. **Quelle liste de « pays » ?** (a) ★ Les 193 membres de l'ONU + le Vatican et la Palestine, avec un paquet « statut particulier » désactivé par défaut (Kosovo, Taïwan, Sahara occidental…) et un paquet « territoires » (Groenland, Nouvelle-Calédonie…). (b) Les 193 seulement. (c) Tout, territoires compris, comme réponses à part entière.
15. **Quels noms de référence ?** (a) ★ Le nom français usuel affiché (Tchéquie, Birmanie, Eswatini), les autres acceptés comme alias, un ancien nom accepté avec une remarque. (b) Les noms officiels ou CLDR (« Myanmar (Birmanie) »). (c) Seulement le nom affiché.
16. **Mises à jour des données ?** (a) ★ Figées et datées, avec un script qu'on peut relancer quand on veut. (b) Rafraîchies régulièrement. Des populations de 2019 à 2023 te conviennent-elles ?

**D. Technique**

17. **TypeScript + Vite** au lieu du JavaScript sans outil de construction de Light ? (a) ★ Oui. (b) JavaScript pur, comme Light.
18. **Tests d'interface ?** (a) ★ Le pilote CDP en stdlib de la convention, lancé aussi en CI avec le Chrome de la machine de CI. (b) `@playwright/test`, plus simple à écrire mais une dépendance de plus.
19. **Quand publier l'APK ?** (a) ★ Sur tag ou à la demande, avec un avis « nouvelle version » dans l'appli. (b) À chaque push qui change l'appli : coûteux en minutes de CI.
20. **Carte et zoom ?** (a) ★ Projection Equal Earth, zoom jusqu'au niveau d'un pays, sans villes ni routes. (b) Un zoom jusqu'aux villes, donc MapLibre et un APK plus lourd. (c) Un globe en 3D : plus coûteux, à décider maintenant si c'est voulu.
21. **Poids de l'APK ?** (a) ★ Tout embarqué, environ 2 à 5 Mo. (b) Les extensions (physique, drapeaux) téléchargées à la demande.

**E. Identité**

22. **Nom du projet** : il sert pour le dossier, le dépôt, le projet Firebase et le paquet Android. Idées : *Repère*, *Méridien*, *Boussole*. **Couleur d'accent** : par exemple un bleu-vert océan, ou ce que tu préfères.

Rien n'est encore créé : aucun dossier, aucun dépôt, aucun registre cdc. Les fichiers d'essai de l'étude données (`ne/`, `out/`, `tools/`) sont dans le scratchpad, qui sera vidé au prochain redémarrage : /tmp/claude-1000/-home-delhomme-Documents-GitHub-Mes-Projets/e204b7b8-1814-4712-ad00-0929e45b0524/scratchpad