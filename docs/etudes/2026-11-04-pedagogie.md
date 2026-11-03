# Pédagogie et contenu : comment devenir bon en géographie, et ce que l'appli doit faire

*Je n'ai fait aucune recherche web pour cette étape. Les références viennent de ma mémoire de la littérature. Les auteurs et les années sont fiables pour les classiques. Le détail des versions de FSRS et des portages existants est à revérifier avant de coder (marqué « à vérifier »).*

## 1. Ce que dit la science de l'apprentissage

**Répétition espacée.** Réviser à intervalles croissants retient beaucoup mieux que réviser en bloc. Cepeda et al. (2006, *Psychological Bulletin*) le montrent dans une méta-analyse de plus de 300 expériences. Le meilleur écart entre deux révisions grandit avec la durée pendant laquelle on veut retenir (Cepeda et al., 2008). C'est le cœur de l'appli : chaque fait devient une carte mémoire planifiée.

**SM-2 ou FSRS : FSRS.**
- **SM-2** (Woźniak, 1987) : environ 30 lignes. Un « facteur de facilité » par carte, des intervalles qui se multiplient. Défauts connus : la facilité s'effondre après quelques échecs (« ease hell »), et l'algorithme ne modélise pas la probabilité de se souvenir.
- **FSRS** (Ye, Su, Cao, KDD 2022, « A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling » ; FSRS par défaut dans Anki depuis la version 23.10). Il suit trois variables par carte : difficulté, stabilité et probabilité de rappel R(t). Il planifie pour une rétention visée, par exemple 90 %. Sur les jeux de données publics d'Anki, il fait moins de révisions que SM-2 pour la même rétention.
- **Ce qui décide** : R(t) est exactement ce qu'il faut pour la carte de chaleur et pour un « % du monde maîtrisé » honnête (§4). SM-2 ne le donne pas.
- **Coût** : le planificateur avec les paramètres par défaut tient en 100 à 150 lignes de formules pures, à recopier dans `model.js` puis en Kotlin. Comme dans Light, il faut des tests sur des vecteurs communs aux deux langages. L'optimiseur des paramètres demande un historique et du Rust ou du Python : on l'écarte du jalon 1. Les paramètres par défaut suffisent pour environ 1 000 cartes. Il existe des portages ouverts (ts-fsrs en TypeScript ; du Kotlin, à vérifier) : soit on recopie leurs formules, soit on vendorise le code. Licences à vérifier.

**Savoir déjà connu : modèle Elo de Pelánek.** Le précédent le plus pertinent est le travail de l'équipe Pelánek (Brno) sur l'entraînement adaptatif en géographie, autour de slepemapy.cz : Papoušek, Pelánek & Stanislav, « Adaptive practice of facts in domains with varied prior knowledge », EDM 2014. Leur constat : en géographie, on connaît déjà beaucoup avant de commencer (la France, le Brésil…). Ils estiment donc la difficulté de chaque fait et le niveau de l'élève par un modèle de type Elo, et choisissent la question pour viser environ 75 % de réussite. Pour nous, cela donne :
- un **test de placement** court, ou un « je connais déjà » ;
- une **difficulté a priori** par pays (Chine facile, Burkina Faso moyen, Kiribati dur), qui sert de difficulté initiale dans FSRS.

Cela évite de faire réviser « France » à un Français. On s'en inspire comme méthode, pas comme copie d'interface.

**Récupération active (effet de test).** Se tester retient mieux que relire (Roediger & Karpicke, 2006, *Psychological Science* ; Karpicke & Roediger, 2008, *Science*). Conséquence : aucun mode « consulter la carte » ne compte comme une révision. Le mode exploration existe, mais tout ce qui compte est un rappel.

**Rappel libre ou QCM.** Produire la réponse (rappel) retient mieux que la reconnaître parmi des choix (Kang, McDermott & Roediger, 2007). Mais un QCM dont les leurres sont plausibles fait lui aussi travailler la mémoire (Little, Bjork et al., 2012, *Psychological Science*). Conséquence, une **échelle par fait** :
1. QCM avec des leurres proches (voisins, noms qui se ressemblent) ;
2. rappel : saisie libre, ou désigner sur la carte sans aide ;
3. production dans le sens inverse.

Le QCM sert de rampe d'accès, puis disparaît. Avec des leurres choisis au hasard (« Mongolie ? Pérou ? Islande ? »), il n'apprend presque rien. Les leurres viennent donc d'une matrice de confusions, alimentée par les erreurs réelles de l'utilisateur.

**Difficulté désirable.** Bjork (1994) : ce qui rend l'apprentissage un peu plus pénible sur le moment (espacer, varier, produire la réponse) le renforce. Pyc & Rawson (2009) : plus un rappel réussi a demandé d'effort, plus il consolide. Conséquence : viser environ 75 à 85 % de réussite par séance, ni 100 %, ni l'échec.

**Entrelacement.** Mélanger des items qu'on confond aide à les distinguer (Rohrer & Taylor, 2007 ; Kornell & Bjork, 2008). En géographie, les confusions sont spatiales et orthographiques : Guinée, Guinée-Bissau et Guinée équatoriale ; Niger et Nigeria ; Slovaquie et Slovénie ; les « -stan » d'Asie centrale ; les départements de Bourgogne. Conséquence : on **introduit** les nouveautés par grappe régionale (5 à 8 par séance, voisins ensemble), puis on **révise** en mélangeant les régions.

**La carte plutôt que des listes.** Les travaux de Kulhavy, Verdi et collègues sur les cartes comme aide à la mémoire montrent qu'une carte se retient comme un tout. On y lit les relations entre lieux, et le texte associé à un lieu se retient mieux (Kulhavy, Lee & Caterino, 1985 ; Verdi & Kulhavy, 2002). Apprendre « pays et capitale » en liste perd cette structure. Conséquences :
- toute question montre le lieu sur la carte, avant ou après la réponse ;
- en cas d'erreur, la rétroaction montre la bonne réponse **et** l'endroit où on a cliqué, avec la distance entre les deux.

**Rétroaction immédiate et calibrage.** Corriger tout de suite, y compris les bonnes réponses données au hasard. Facultatif : une note de confiance. Une erreur commise avec assurance, puis corrigée, se retient bien (« hypercorrection », Butterfield & Metcalfe, 2001).

## 2. Catalogue des exercices

Une carte FSRS correspond à un couple (fait, sens). « Où est le Pérou ? » et « Quel est ce pays surligné ? » sont deux cartes sœurs. Comme dans Anki, on ne les pose pas le même jour.

| Exercice | Ce qu'il entraîne | Implémentation | Intérêt |
|---|---|---|---|
| **Localiser** : « touche le Pérou » | rappel spatial, sens nom → lieu | moyenne : carte SVG cliquable, test d'appartenance, cas des petits pays (§3) | très fort, c'est le cœur |
| **Nommer le pays surligné** (QCM puis saisie) | rappel du nom, sens lieu → nom | facile pour le QCM ; saisie : tolérance aux fautes (§3) | très fort |
| **Capitales**, dans les deux sens | association | facile ; plusieurs capitales par pays (§3) | fort, classique de culture générale |
| **Placer une ville sur une carte vierge**, note selon la distance | spatial fin | moyenne : distance sur le globe (haversine), barème | fort, et original par rapport aux quiz « par pays » |
| **Drapeaux** → pays, et pays → drapeau en QCM | mémoire visuelle | facile : SVG libres, par exemple flag-icons (MIT) | moyen : c'est de la vexillologie, pas de la géographie, mais très demandé et motivant |
| **Silhouettes** (contour isolé, sans contexte) | forme | facile : même géométrie, sans le voisinage | moyen. Sans contexte, c'est plus dur et plus abstrait |
| **Voisins** : « nomme les voisins de la Hongrie », « X touche-t-il Y ? » | relations spatiales | facile si on calcule les adjacences depuis la géométrie ou une liste existante | fort : structure la carte mentale |
| **Régions et départements français** : nom, numéro, préfecture | culture nationale | moyenne : géométrie IGN Admin Express ou COG de l'INSEE (Licence ouverte), à simplifier | fort pour un francophone |
| **DROM et La Réunion** : placer les DROM, les communes et cirques de La Réunion | géographie locale | moyenne : encarts de carte, données IGN ; les 24 communes sont faciles | fort, personnel (à confirmer, §5) |
| **Fleuves** | physique | dure : des lignes, pas des surfaces ; cliquer près d'un tracé ; noms de fleuves à traduire | moyen |
| **Montagnes, déserts, mers, détroits** | physique | moyenne : Natural Earth fournit des polygones et des points ; noms français à reprendre | moyen |
| **Ordres de grandeur** : population, superficie, « A est-il plus grand que B ? », classer 4 pays | quantitatif | facile côté code ; noter un ordre de grandeur sur une échelle logarithmique ; les données datent | fort et rarement entraîné, original |
| **Estimation sur un curseur** : « Population du Nigeria ? » | calibrage numérique | facile | moyen à fort |
| **Hémisphères, fuseaux, latitudes** : « Quel pays est plus au nord ? » | repérage | facile | faible à moyen |

**Noyau du jalon 1** (un seul jeu de données et une seule carte, mais les quatre exercices qui portent le plus) :
1. pays du monde : localiser et nommer (QCM, puis saisie) ;
2. capitales dans les deux sens ;
3. drapeaux ;
4. départements et régions de France, plus les DROM en encart ;

avec FSRS, l'échelle QCM → rappel, la carte de chaleur et la tolérance de saisie.

**Extensions** : voisins, villes placées à la distance, ordres de grandeur, silhouettes ; puis géographie physique (fleuves et montagnes en dernier, car les données sont les plus coûteuses) ; puis communes de La Réunion.

**Sources de données** (à vérifier une par une) :
- frontières : Natural Earth (domaine public) ;
- noms français et noms alternatifs : Wikidata (CC0) et CLDR ;
- population et superficie : Banque mondiale ou ONU WPP (CC BY), à citer ;
- France : IGN et INSEE.

Toutes ces données sont embarquées dans l'appli, sans appel à un site externe.

## 3. Cas difficiles

**Micro-États et petits pays au doigt.** Il y en a une trentaine sous le seuil d'environ 48 dp, la taille de cible minimale recommandée sur Android : Vatican, Monaco, Saint-Marin, Liechtenstein, Andorre, Malte, Singapour, Bahreïn, Caraïbes, Pacifique, Comores, Maurice, Seychelles… Combinaison proposée :
- un **cercle cible** de taille fixe à l'écran, dessiné autour des pays sous un seuil de superficie, comme le font les atlas ;
- un **zoom et déplacement** à deux doigts, avec en plus une loupe au toucher prolongé ;
- en mode localiser, on **accroche le toucher** au pays dont la cible est la plus proche, dans un rayon. La note dépend de la distance : juste, proche (un voisin), loin ;
- les archipels (Kiribati, Polynésie) se jouent sur le cercle, et la géométrie réelle s'affiche en rétroaction.

Incertain : la lisibilité de la Caraïbe sur un écran de téléphone. Il faudra la tester tôt sur un vrai appareil.

**Territoires disputés.** Natural Earth publie des variantes « point de vue » par pays (worldviews), dont une pour la France (à vérifier). Proposition :
- prendre la position de la France comme défaut, et la dire dans l'appli ;
- **ne pas interroger** sur les entités contestées dans le noyau (Kosovo, Taïwan, Palestine, Sahara occidental, Chypre du Nord, Somaliland), ou les mettre dans un paquet « territoires à statut particulier », désactivé par défaut ;
- la Crimée et le Cachemire restent tracés selon le point de vue choisi, sans question dessus ;
- liste de base : les 193 États membres de l'ONU + 2 observateurs, plus des paquets optionnels pour les territoires (Groenland, Nouvelle-Calédonie, Porto Rico…).

**Noms alternatifs et fautes de frappe en saisie libre.**
- **Normalisation** : minuscules ; accents retirés (décomposition NFD puis suppression des marques) ; tirets et apostrophes unifiés ; articles retirés (« le », « la », « les », « l' », « république de ») ; espaces compressés.
- **Synonymes** depuis Wikidata/CLDR plus une liste à la main : Tchéquie / République tchèque, Birmanie / Myanmar, Macédoine du Nord, Swaziland → Eswatini, Cap-Vert / Cabo Verde, Turquie / Türkiye, Côte d'Ivoire, États-Unis / USA. Un ancien nom est accepté avec une remarque.
- **Tolérance** : distance de Damerau-Levenshtein bornée selon la longueur : 0 faute jusqu'à 4 lettres, 1 jusqu'à 8, 2 au-delà.
- **Règle de collision**, décisive : si la saisie est aussi proche ou plus proche d'une **autre** réponse valide du même domaine, c'est faux. Paires concernées : Niger / Nigeria, Iran / Irak, Autriche / Australie, Guinée / Guinée-Bissau, Mali / Malawi, Slovénie / Slovaquie, Gambie / Zambie.
- Une réponse acceptée avec une faute compte comme réussie, avec l'orthographe affichée. Option possible : un mode « orthographe exacte ».
- **Capitales multiples** : Bolivie (Sucre / La Paz), Afrique du Sud (3), Eswatini, Pays-Bas (Amsterdam, gouvernement à La Haye), Côte d'Ivoire (Yamoussoukro / Abidjan), Malaisie, Sri Lanka. On accepte la liste, la réponse officielle est affichée.
- **Au clavier du téléphone**, la saisie est lente : on peut proposer une autocomplétion **après** 3 lettres. Elle transforme le rappel en reconnaissance partielle : à réserver aux niveaux bas, ou en option.

## 4. Progression, motivation, mesure de la maîtrise

**Mesure honnête.**
- Pour chaque fait, la probabilité de rappel R aujourd'hui est donnée par FSRS.
- **% du monde maîtrisé** = part des faits avec R ≥ 0,9 **et** une stabilité ≥ 21 jours. La stabilité exclut ce qu'on vient d'apprendre et qui s'oubliera. On l'affiche par domaine (pays, capitales, drapeaux, France) et par continent.
- **Carte de chaleur** : chaque pays coloré selon son R (gris : jamais vu). C'est l'écran d'accueil naturel, original et utile : on voit ses lacunes où elles sont. Il faut une échelle séquentielle lisible en mode sombre et pour les daltoniens.
- **Examen** de temps en temps : 20 questions tirées au hasard, sans aide, mélangées. Il vérifie que les R estimés sont justes (calibrage) et donne un score qu'on peut suivre dans le temps.
- **Matrice des confusions** personnelle (« tu confonds Laos et Cambodge ») : elle nourrit les leurres et les séances d'entrelacement ciblées.

**Motivation sans manipulation** (théorie de l'autodétermination, Ryan & Deci : autonomie, compétence, lien).
- La compétence se montre par la carte qui se colore et le nombre de pays maîtrisés, pas par des points.
- L'autonomie : choix des paquets, objectif quotidien réglable, séances courtes (5 minutes ou 20 cartes), et la possibilité de s'arrêter à tout moment sans pénalité.
- **Pas de série culpabilisante.** Au mieux, un compteur « jours pratiqués cette semaine » sans remise à zéro.
- Les révisions dues sont plafonnées par jour : après une absence, on ne revient pas devant 400 cartes en retard. FSRS trie par R décroissant, ce qui est sain.
- Pas de notifications par défaut ; une seule, opt-in, à l'heure choisie (fuseau du téléphone).
- Jalons concrets plutôt que des badges arbitraires : « Afrique de l'Ouest maîtrisée », « 101 départements ».

**Parcours type.** Placement rapide (1 à 2 minutes), puis séance : révisions dues d'abord, puis 5 à 8 nouveautés de la grappe régionale suivante, introduites en QCM. Elles passent en rappel dès la 2e réussite. Une rétroaction sur la carte à chaque question.

**Incertain.**
- Le seuil exact de maîtrise (0,9 et 21 jours) est un choix raisonnable, pas une donnée publiée.
- Le modèle Elo de départ demande des données de difficulté : soit des estimations à la main, soit les erreurs de l'utilisateur. Sans comptes partagés, pas de difficulté calculée sur plusieurs utilisateurs.

## 5. Questions qui changent réellement la conception

1. **Pour qui ?** Toi seul, ta famille, des élèves (quel âge, quel programme), ou un public ouvert ? Cela décide du niveau de langue, des comptes, de la modération des données, et de l'opportunité d'un classement.
2. **Pour quoi faire ?** Culture générale (quiz, voyages), concours ou examen précis, ou programme scolaire (collège ou lycée, alors aligné sur ses repères) ? Le contenu prioritaire en dépend.
3. **Quel périmètre du noyau ?** Monde seul, monde plus France, ou France d'abord ? Et La Réunion jusqu'à quel détail : position des DROM, ou communes, cirques et sommets ?
4. **Géographie physique** (fleuves, reliefs, mers) : importante pour toi, ou extension lointaine ? C'est le poste de données le plus coûteux.
5. **Saisie libre au clavier sur téléphone** : acceptable pour toi, ou préfères-tu localiser et QCM sur mobile, et la saisie réservée au site ?
6. **Comptes et synchronisation** site ↔ appli (Firebase Auth + Firestore comme Light), ou tout en local au départ ? La synchronisation de l'historique FSRS entre deux appareils hors ligne pose des conflits à trancher.
7. **Territoires disputés** : position de la France par défaut et paquet séparé désactivé, ça te va ? Ou tu préfères les exclure tout à fait ?
8. **Social** : comparer ou défier quelqu'un, ou strictement personnel ? Un défi « même série de questions pour deux personnes » est simple ; un classement implique des comptes et de la triche.
9. **Temps visé par jour** (5 minutes ? 20 ?) et **ordres de grandeur** (population, superficie) : dans le noyau ou plus tard ? C'est l'exercice le plus original du catalogue, mais il s'éloigne de la carte.
10. **Drapeaux** : dans le noyau (motivant, facile) ou hors sujet pour toi ?