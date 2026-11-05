# Terramemo

Un site et une appli Android pour devenir bon en géographie : placer chaque
pays sur la carte, connaître capitales et drapeaux, puis le relief, les
fleuves et les ordres de grandeur. Gratuit, sans publicité, en français
(prêt à traduire).

*En construction : aucune version n'est encore publiée.*

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
- Des **épreuves chronométrées** (tous les pays d'un continent, points
  selon la justesse et la distance) et un classement de tous les joueurs ;
  les séances de révision, courtes, s'arrêtent quand on veut.
- Deux exercices pour chaque série : **Localiser** (toucher la zone nommée)
  et **Nommer** (la zone s'allume, choisir son nom parmi quatre, ses
  voisines en leurres).
- **La Réunion** : ses 24 communes sur une carte de l'île, en série de
  Toucher et du Chrono (avec son classement).

## Approche technique

- Une seule base de code web (TypeScript, Vite) pour le site et l'appli
  Android, emballée en APK par Capacitor ; carte en SVG (d3-geo), hors
  ligne.
- Planification des révisions par FSRS (bibliothèque `ts-fsrs`).
- Progrès en journal de réponses sur l'appareil, synchronisé par Firebase
  (compte anonyme d'abord, connexion Google ou compte e-mail et mot de
  passe pour retrouver ses progrès ailleurs).
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
npm run typecheck    # vérification des types (TypeScript)
npm run build        # site statique dans dist/ (servi par Firebase Hosting)
```

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
  `public/geo/reunion/sources.json`.
