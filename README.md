# Terramemo

Un site et une appli Android pour devenir bon en géographie : placer chaque
pays sur la carte, connaître capitales et drapeaux, puis le relief, les
fleuves et les ordres de grandeur. Gratuit, sans publicité, en français
(prêt à traduire).

*En construction. Le site est en ligne sur https://terramemo-geo.web.app
(J1a, depuis le 06/11/2026) ; l'appli Android n'est pas encore sur le Play
Store (son APK sert aux essais).*

## Le concept

Terramemo n'est pas un quiz qu'on enchaîne, mais un entraînement par
**répétition espacée sur la carte** : chaque fait (« où est le Pérou ? »,
« quel est ce pays ? ») revient au moment où l'on est sur le point de
l'oublier, jusqu'à tenir des mois.

- L'accueil est une **carte du monde colorée selon la solidité de sa
  mémoire** : on voit ses lacunes là où elles sont.
- Chaque erreur se montre **sur la carte** : là où l'on a touché, là où
  était la réponse, et la distance entre les deux.
- Les mauvais choix proposés viennent de **ses propres confusions** (Niger
  et Nigeria, Slovénie et Slovaquie), et les nouveautés arrivent par petits
  groupes de voisins.
- Des **épreuves chronométrées** (tous les pays d'un continent, score en
  pourcentage de justes, départagé par le temps) et un classement de tous
  les joueurs ; les séances de révision, courtes, s'arrêtent quand on veut.
- Deux exercices pour chaque série : **Trouver** (toucher la zone nommée)
  et **Reconnaître** (la zone s'allume, choisir son nom parmi quatre, ses
  voisines en leurres).
- En haut, une **recherche** (un pays, un territoire, une commune de La
  Réunion : la carte vole jusqu'à lui) et le bouton **Jouer**, qui ouvre
  un arbre de gros boutons, un choix par écran : **Entraînement** ou
  **Classé**, puis le sujet (Pays, Communes), la série (tous les pays, un
  continent ; La Réunion), et l'exercice en dernier, qui lance la partie :
  en entraînement Trouver et Reconnaître, en épreuves classées **Chrono**
  (toute la série) et **Sans faute** (jusqu'à la première erreur), 15 s
  par question, chaque réponse juste ou fausse : le score est la part de
  justes (« 190/195 · 97 % »), le temps départage ; chacune avec son
  record dans la série et ses classements ; le 🏆 les montre toutes.
  **Rejouer**, au bilan de chaque partie, relance la même d'une touche.
- Sur ordinateur, des boutons **+**, **−** et « toute la carte » en bas à
  droite (et les touches + et −) pour zoomer sans molette.
- **La Réunion** : ses 24 communes sur une carte de l'île, en série de
  Toucher et des épreuves classées (avec leurs classements).

## Approche technique

- Une seule base de code web (TypeScript, Vite) pour le site et l'appli
  Android, emballée en APK par Capacitor ; carte du monde qui tourne comme
  un globe, dessinée en Canvas 2D (d3-geo pour les données ; WebGL et SVG
  au choix dans ⚙), hors ligne : l'APK embarque ses fichiers, le site les
  garde après une première visite (service worker, sur le web seulement,
  un cache par version : `src/sw/`).
- Planification des révisions par FSRS (bibliothèque `ts-fsrs`).
- Progrès en journal de réponses, sur l'appareil seulement pour l'instant.
  On joue sans compte ; la synchro par Firebase arrive au J1b, pour les
  comptes Google ou e-mail et mot de passe (retrouver ses progrès
  ailleurs). Le compte anonyme ne sert qu'à publier ses scores au
  classement.
- Données libres préparées par un script reproductible : frontières de
  Natural Earth (domaine public), noms du référentiel Unicode CLDR,
  capitales et populations de Wikidata (CC0), drapeaux de flag-icons (MIT).

Le détail des études préparatoires est dans [`docs/etudes/`](docs/etudes/)
et le plan arrêté dans [`docs/plan.md`](docs/plan.md).

## Développement

Prérequis : Node 24 (`.nvmrc`) ; pour l'APK, le SDK Android et un JDK 21.

```bash
npm ci               # dépendances, versions figées (package-lock.json)
npm run dev          # site en développement sur http://localhost:8060
npm test             # tests (Vitest), aussi lancés par la CI à chaque push
npm run test:regles  # règles Firestore sur l'émulateur (JDK 21), aussi en CI
npm run typecheck    # vérification des types (TypeScript)
npm run build        # site statique dans dist/ (servi par Firebase Hosting)
```

- **Déploiement** (projet Firebase `terramemo-geo`) : depuis le PC, juste
  après le commit, sur un arbre propre, `npm run build` puis
  `npx firebase deploy --only hosting` ; `--only firestore` après un
  changement de `firestore.rules` ou des index. La vérification sur le
  site en ligne et le reste de la procédure sont dans le skill
  `run-terramemo` (`.claude/skills/run-terramemo/SKILL.md`).

- **Données de la carte** : `npm run geodata` télécharge les sources
  épinglées (version et empreinte dans `geodata/sources.lock.json`) et
  régénère `public/geo/` ; deux lancements donnent des fichiers identiques
  octet pour octet. La liste des pays (193 membres de l'ONU, Vatican,
  Palestine, et un paquet optionnel) est dans `geodata/liste.json`.
- **Communes de La Réunion** : `npm run geodata:reunion` régénère
  `public/geo/reunion/` depuis l'archive de l'IGN (empreinte dans
  `geodata/reunion.lock.json`, archive gardée dans `geodata/raw/ign/`).
- **APK de débogage** : `npm run build && npx cap sync android`, puis
  `./gradlew assembleDebug` dans `android/` avec `JAVA_HOME` sur un JDK 21 ;
  la CI le construit aussi à la demande (workflow « Android »).
- **Crédits** : frontières Natural Earth (domaine public), noms Unicode
  CLDR (Unicode License v3), police Inter (SIL OFL 1.1), communes de La
  Réunion : IGN, ADMIN EXPRESS COG CARTO (Licence Ouverte 2.0 d'Etalab :
  source et date de mise à jour affichées sur la carte de l'île) ; le
  détail des sources est dans `public/geo/sources.json` et
  `public/geo/reunion/sources.json`. L'écran Crédits de l'appli (⚙ ›
  Crédits et licences) les reprend, avec les bibliothèques que le site
  et l'APK embarquent et leurs licences (MIT, ISC, BSD-3-Clause,
  Apache-2.0, 0BSD), dont il déplie les textes et avis de copyright :
  `licences-tierces.txt`, produit à chaque build (`licences/tierces.ts`).
  Les bibliothèques Android y viennent de `licences/android.json`, relevé
  par Gradle : `npm run licences:android` (JDK 21) après une mise à jour de
  Capacitor ou d'AndroidX, que la CI Android et `driver.py apk` vérifient.
