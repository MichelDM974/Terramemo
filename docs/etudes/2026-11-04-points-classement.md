# Points et classement (04/11/2026)

*Réponse à la question de l'utilisateur sur le ticket #14 (« comment on
calcule les points ? temps imparti pour chaque question, avec des points
en fonction de la distance, comme GeoGuessr ? il peut y avoir plusieurs
modes »). Proposition tranchée par l'utilisateur le même jour (§ 5). Les
chiffres de distance viennent des vraies données de la carte
(`public/geo`, fonction `distanceAuBordKm` de `src/map/geo.ts`) ; la méthode
est en fin de fichier.*

## 1. Où vivent les points : des épreuves à part

Les séances de répétition espacée ne se prêtent pas à un classement :
chacun y révise ses propres fiches dues (FSRS choisit ce qu'il est sur le
point d'oublier), donc deux scores de séance ne se comparent pas, et des
points y pousseraient à bachoter au lieu d'apprendre (étude « pédagogie »,
§ 4).

D'où un onglet **Épreuves**, à côté des séances :

- une épreuve = un **ensemble** (les 54 pays d'Afrique, les 44 d'Europe…,
  les 195 du monde ; plus tard capitales, drapeaux, villes) × un
  **exercice** (localiser au toucher, nommer en QCM, puis saisie au J1b) ×
  un **mode** (§ 2) ; un classement par épreuve ;
- **les mêmes questions pour tous** dans le mode Chrono (tout l'ensemble,
  dans un ordre tiré au hasard) : les scores se comparent sans que la
  chance du tirage compte ;
- chaque réponse va au journal (`mode: 'epreuve'`) et compte comme une
  révision FSRS : c'est un vrai rappel sans aide, et la carte colorée suit
  ce qu'on sait vraiment. Une épreuve remplace aussi l'« examen » de
  l'étude « pédagogie » (score à suivre dans le temps) ;
- les séances restent sans points (elles ne se comparent pas) ; la
  décision « Motivation », qui excluait tout classement, est retirée
  (§ 5).

## 2. Les modes

Le Chrono d'abord, dès le J1a ; Sans faute et Minute ensuite.

| Mode | Déroulé | Score | Départage |
|---|---|---|---|
| **Chrono** (l'idée de l'utilisateur) | Tout l'ensemble, une question à la fois, **15 s par question** pour localiser (10 s en QCM) ; un seul toucher | Jusqu'à **1 000 points par question** : 1 000 si juste, sinon selon la distance (§ 3), 0 si le temps est écoulé | Temps total le plus court |
| **Sans faute** | Questions tirées au hasard dans l'ensemble, sans répétition, 10 s chacune, jusqu'à la première erreur | Nombre de justes d'affilée (l'ensemble vidé = score maximal) | Temps total |
| **Minute** | Le plus de questions justes en 60 s ; une erreur fait passer à la suivante | Nombre de justes | Moins d'erreurs |

- Le Chrono fait le classement « sérieux » (mêmes questions pour tous) ;
  Sans faute et Minute sont plus courts et plus joueurs, avec la part de
  chance d'un tirage (le meilleur score gardé avantage qui rejoue
  beaucoup, comme tout classement de jeu d'arcade).
- Le Chrono du monde entier (195 questions, ~10 à 20 min) est un
  marathon : à proposer à part des continents.
- La carte d'une épreuve part cadrée sur sa région (question 4 de
  `docs/questions-j1a.md`), le zoom reste libre mais le temps court.
- Les mêmes barèmes servent aux défis entre proches (#9) : un défi est
  une épreuve dont deux joueurs comparent le score.

## 3. Le barème du Chrono

### Localiser un pays : juste, ou proche

```
points = 1000                     si le toucher est juste (noter() de src/map/pick.ts)
points = 500 × e^(−d / 300 km)    sinon, d = distance au bord le plus proche du pays demandé
points = 0                        si le temps est écoulé
```

**Pourquoi un plafond de moitié pour une erreur.** La distance se mesure
au bord du pays demandé (pas à son centre : la Russie) : un toucher juste
de l'autre côté de la frontière est donc à quelques kilomètres. Sans
plafond, le voisin rapporterait presque autant que la bonne réponse, comme
si l'on cherchait un point au lieu d'un pays. Avec le plafond, une
confusion de voisins rapporte une part, jamais plus que la moitié.

**Ce que ça donne** (toucher au centre du pays confondu) :

| Demandé | Touché | Distance au bord | Points |
|---|---|---|---|
| République dominicaine | Haïti | 50 km | 423 |
| Macédoine du Nord | Albanie | 58 km | 412 |
| Lettonie | Lituanie | 106 km | 351 |
| Suède | Norvège | 127 km | 327 |
| Autriche | Suisse | 158 km | 295 |
| Slovaquie | Slovénie | 310 km | 178 |
| Mauritanie | Mali | 408 km | 128 |
| Nigeria | Niger | 469 km | 105 |
| Irak | Iran | 676 km | 53 |
| Suisse | Suède | 1 978 km | 1 |
| Autriche | Australie | 13 745 km | 0 |

- Voisin touché en son centre, sur les 624 paires de voisins des 195
  pays : distance médiane 286 km (quartiles 132 à 572 km), soit ~190
  points en médiane (320 à 75 entre les quartiles).
- **Toucher au hasard ne rapporte presque rien** : un toucher tiré au
  hasard sur les terres du continent vaut en moyenne 5 % du maximum en
  Europe, 4 % en Afrique, 3 % en Asie, 12 % en Amérique du Sud (12 grands
  pays : 8 % de justes par hasard), 1 % sur le monde. Répondre vite et
  n'importe quoi ne paie pas.
- Échelle de 300 km choisie entre 100 km (une confusion de voisins ne
  rapporte presque plus rien : Slovénie pour Slovaquie, 23 points) et
  1 000 km (le hasard rapporte 8 à 21 % selon le continent). À recaler par ensemble si l'essai
  le demande (l'Europe a des pays plus petits que l'Afrique).

**Le temps.** 15 s par question pour localiser, avec zoom compris (les
micro-États demandent de zoomer : à caler à l'essai sur le téléphone),
10 s en QCM. Le temps ne donne pas de points : il les coupe à la fin du
délai et départage les égalités (temps total). Un bonus de vitesse
(points multipliés par le temps restant) n'est pas proposé : il
récompense le toucher précipité plus que la justesse et rend le score
plus dur à expliquer ; le départage suffit à classer les joueurs qui font
le maximum (fréquent sur l'Amérique du Sud, 12 pays).

**Nommer (QCM, puis saisie)** : 1 000 si juste, 0 sinon ; il n'y a pas de
distance (ou alors celle entre le pays montré et le pays choisi, à voir
si l'on veut un barème proche du toucher).

### Plus tard : les points (capitales, villes, sommets)

Pour une cible ponctuelle (capitale localisée au J2, ville sur carte
vierge au J4), la distance est tout le barème, à la manière de ce que
demandait l'utilisateur : `points = 1000 × e^(−d / L)` au-delà d'un rayon
où l'on a tout (une vingtaine de kilomètres), `L` selon l'échelle de
l'épreuve (~300 km sur le monde, ~50 km sur la France). À caler au J4
(#6) sur les vraies données, comme ici.

## 4. Le classement sur Firebase (offre Spark)

- **Un document par épreuve et par joueur** : le meilleur score seul
  (`classements/{epreuve}/scores/{uid}` : pseudo, score, justes, temps,
  date, version du barème). Écrit en fin d'épreuve s'il bat l'ancien.
  Possible en plus : un classement « cette semaine » (un document de plus,
  remis à zéro chaque lundi), pour qu'un nouveau venu ait sa chance (à
  trancher, § 5).
- **Classement global** (choix de l'utilisateur) : ouvert à tous les
  joueurs ; ce qui range les joueurs toutes épreuves confondues reste à
  trancher (§ 5). Le plus simple sans serveur : un document par joueur,
  la somme de ses records Chrono, que l'appli réécrit quand un record
  tombe (une écriture de plus).
- **Coût** : afficher un classement = 20 lectures (les 20 premiers) + 1
  pour son rang (`count()` des meilleurs scores, une lecture par tranche
  de 1 000) ; finir une épreuve = 1 ou 2 écritures. Avec 50 000 lectures et
  20 000 écritures par jour (Spark), ~2 000 affichages de classement par
  jour, partagés avec les séances : à surveiller si le public grandit.
- **Pseudo public**, choisi à la première entrée au classement, jamais le
  nom du compte Google ; liste de mots refusés et suppression à la main
  par l'utilisateur (le propriétaire). Les invités y figurent avec un
  pseudo ; se connecter (#3, #13) garde leurs scores.
- **Triche** : sans serveur (les Cloud Functions demandent l'offre Blaze,
  exclue par la décision « Hébergement »), c'est l'appli qui écrit son
  score. Parades possibles sans payer :
  - règles Firestore : uid du joueur seul, score ≤ 1 000 × nombre de
    questions, durée déclarée ≥ écart réel entre le document de début et
    celui de fin (`request.time`), une écriture qui n'améliore pas le
    score refusée ;
  - App Check (reCAPTCHA v3, comme Light) : refuse les écritures qui ne
    viennent pas de l'appli ;
  - les réponses stockées avec le score (pays touché, distance, temps) :
    un script d'audit sur le PC (SDK Admin) recalcule chaque score du
    haut du classement et retire les impossibles.
  Un client modifié peut encore mentir de façon plausible ; pour une
  appli gratuite, à reprendre seulement si la triche apparaît.
- **Version du barème** dans chaque score : changer une formule ouvre un
  nouveau classement (les anciens scores ne se comparent plus).
- Pseudo et scores publics : à la politique de confidentialité (#3), et
  la suppression du compte efface ses scores.

## 5. Tranché le 04/11/2026 (utilisateur)

1. **Place des points** : la décision « Motivation » (pas de classement ni
   de série de jours) est retirée en entier, et le classement est global,
   ouvert à tous les joueurs. Les séances de révision restent sans points
   (§ 1 : elles ne se comparent pas d'un joueur à l'autre).
2. **Mode d'abord** : le Chrono (§ 2, § 3) ; Sans faute et Minute ensuite.
3. **Erreur proche** : jusqu'à la moitié, `500 × e^(−d / 300 km)` (§ 3).
4. **Jalon** : épreuve Chrono et classement dès le J1a (#2), sur l'Auth
   anonyme : les scores d'un invité suivent son compte quand il se
   connecte à Google (J1b, #3), la connexion gardant son identifiant.

Restent à trancher : ce que range le classement global (par épreuve, total
des records Chrono, fiches maîtrisées) et le classement de la semaine.

## Méthode des chiffres

Simulation lancée le 04/11/2026 sur `public/geo` (Natural Earth v5.1.2
simplifié, 195 pays jouables), par les fonctions de l'appli (`assembler`,
`contient`, `distanceAuBordKm`) :

- confusions : distance du point d'étiquette du pays touché au bord du
  pays demandé ;
- voisins : même calcul pour les 624 paires de `voisins` de `pays.json` ;
- hasard : 300 points tirés uniformément sur la sphère dans l'emprise du
  continent et gardés s'ils tombent sur un de ses pays jouables (donc au
  prorata des superficies), croisés avec chaque pays du continent ; un
  toucher dedans compte 1 000, sinon le barème.

Le script, jetable, n'est pas versionné : refaire le calcul au moment
d'écrire le barème (test des générateurs d'épreuves).
