# Architecture technique : site web + APK de géographie

## 1. Ce que Light nous apprend

Chiffres relevés dans le dépôt Light :
- **Le double code pèse lourd.** Sur 494 commits, 172 touchent `android/`, soit environ un sur trois.
- **La logique métier est recopiée.** `model.js` (454 lignes) a son jumeau `data/Model.kt`. Pour que les deux restent d'accord, il faut des cas de test communs (`tests/stats_cases/`), à corriger à la main des deux côtés.
- **Le rendu 3D a été refait deux fois.** Les démos tournent avec three.js sur le site et Filament sur Android : vérification au pixel près, APK limité aux téléphones ARM, un ticket de performance ouvert de chaque côté.
- **La connexion Google native coûte cher.** Il faut l'empreinte SHA-1 de la clé, Credential Manager et un client OAuth. L'erreur 28444 a déjà fait perdre du temps.
- **La CI a un coût.** Le job Android (environ 4 min) prenait 757 min d'Actions par mois avant qu'on le limite aux chemins modifiés.

Pour une appli de géographie, le cœur est **la carte interactive**. Le modèle Light obligerait à la refaire en Compose Canvas : projection, gestes, détection du pays touché, tests. On retomberait sur le cas three.js/Filament, mais au centre de l'appli au lieu d'une fiche.

## 2. Les quatre options comparées

| Critère | (a) Site statique + Kotlin/Compose natif (Light) | (b) PWA + Capacitor | (c) PWA + TWA (Bubblewrap) | (d) Flutter / Compose Multiplatform |
|---|---|---|---|---|
| Une seule base de code | Non : la logique et la carte écrites deux fois | Oui | Oui, et l'APK n'est qu'une coquille | Oui, mais le web est second |
| Carte au doigt | À refaire en Compose Canvas | d3-geo dans la WebView | d3-geo dans Chrome | flutter_map ou dessin à la main ; pas d'équivalent de d3-geo en Kotlin |
| Hors ligne complet | Oui | **Oui dès l'installation** (fichiers dans l'APK) | Seulement après un premier chargement en ligne (service worker) | Oui |
| Performance sur téléphone moyen | La meilleure | Bonne pour ~250 tracés SVG ; WebView Chromium | Comme Chrome, souvent un peu mieux que la WebView | Bonne sur Android. Web lourd : CanvasKit/skwasm, plusieurs Mo au premier chargement |
| Maintenance seul + Claude Code | Lourde (exemple de Light) | **Faible** : un code, une coquille générée qu'on touche peu | La plus faible, mais dépend de Chrome et des Digital Asset Links | Moyenne. Flutter : nouveau langage (Dart). Compose web : cible wasm encore jeune (statut 2026 à vérifier) |
| Tests | Deux jeux de tests | Vitest + navigateur headless sur le DOM | Pareil | flutter test (widgets, captures de référence) ; pas de DOM pour le web |
| APK publié par la CI comme Light | Oui | Oui : même workflow Gradle, même release glissante | Oui. Bubblewrap en CI non interactif est faisable mais délicat (à vérifier) | Oui |
| Connexion Google | Native (SHA-1) | Interdite par Google dans une WebView : plugin natif + SHA-1, comme Light. E-mail/mot de passe sans souci | Marche comme sur le web | Plugins natifs |
| Notifications locales (« 12 pays à revoir ») | Oui | Oui (`@capacitor/local-notifications`) | Notifications web seulement, plus fragiles | Oui |

Une variante gratuite existe aussi : la PWA « installée » depuis Chrome, sans APK du tout (Chrome génère une WebAPK). Il faut demander si cela suffit à l'utilisateur.

## 3. Rendu de la carte

| | SVG + d3-geo | Canvas 2D + d3-geo | MapLibre GL + tuiles vectorielles locales |
|---|---|---|---|
| Détection du pays touché | Gratuite : l'événement sur le `<path>` | À écrire (`geoContains` ou image cachée colorée par pays) | `queryRenderedFeatures`, gratuite |
| Zoom et déplacement | d3-zoom ; transformation CSS pendant le geste, appliquée à la fin | Redessin à chaque image : à soigner | Le meilleur, rendu GPU |
| Volume à ~1:50 000 000 | TopoJSON simplifié, ordre de 0,5 à 1 Mo (à mesurer) | Pareil | Bibliothèque ~800 Ko + tuiles + polices des étiquettes, tout servi en local |
| Tests de l'interface | **Faciles** : sélecteurs `path[data-iso=MC]` | Par coordonnées seulement | Par coordonnées, WebGL en headless parfois capricieux |
| Hors ligne | Trivial | Trivial | Fichier PMTiles en local : lectures par plages depuis les fichiers de l'APK **non vérifiées** sous Capacitor |
| Où il excelle | Pays, frontières, ~250 entités | Beaucoup de traits (fleuves, plus de 10 000 éléments) | Plusieurs niveaux de zoom, relief, villes, globe |

**Choix : SVG + d3-geo + d3-zoom.**
- **Projection** : Equal Earth (`geoEqualEarth`). Des projections par continent pour les zooms régionaux.
- **Micro-États** (Monaco, Vatican, Nauru…) :
  - zone de toucher invisible (cercle d'au moins 44 px CSS au zoom courant), recalculée à la fin du geste ;
  - en cas d'ambiguïté, centre de pays le plus proche dans un rayon donné ;
  - pour l'affichage, géométrie 1:10 000 000 pour les plus petits.
- **Bascule vers Canvas** si une mesure sur téléphone moyen montre des saccades. La détection du pays touché se garde en isolant la carte derrière une interface `pick(x, y) → iso`.
- **MapLibre** seulement si le contenu dépasse les pays : relief, villes à fort zoom.

**Données** (à confirmer à la construction) :
- Natural Earth (domaine public). Ses variantes « point de vue » incluent la France : utile pour Kosovo, Taïwan, Sahara occidental, Crimée. Champ `NAME_FR` pour les noms.
- Capitales et populations : Wikidata (CC0).
- Drapeaux : `flag-icons` (MIT).
- Pipeline : `mapshaper` produit le TopoJSON à la construction.

## 4. Recommandation : (b) une seule base web (PWA hors ligne), emballée par Capacitor

**Pile technique**
- TypeScript + Vite, sans framework d'interface (comme Light, avec le typage en plus).
- d3-geo, d3-zoom, topojson-client.
- Algorithme de répétition espacée : FSRS (bibliothèque `ts-fsrs`, MIT) ou une version maison plus simple. À trancher dans l'axe « apprentissage ».
- Stockage : IndexedDB.

**Pourquoi pas les autres**
- **(a)** : la carte serait écrite deux fois.
- **(c)** : hors ligne seulement après un premier chargement, dépendance à Chrome, pas de vraie appli.
- **(d)** : web dégradé, nouveau langage, pas d'équivalent de d3-geo.

Capacitor garde tout ce qui marche dans Light : APK signé par la clé de la CI, release glissante `android`, numéro de version tiré du nombre de commits.

**Risques**
1. **Fluidité de la WebView** sur téléphone d'entrée de gamme avec la carte 1:50m. À mesurer dès le prototype (prochaine étape 1). Repli : Canvas, ou géométrie plus simplifiée au dézoom.
2. **APK reconstruit à chaque changement du web.** Avec un seul code, toute modification du site change l'APK, contrairement à Light où `android/` était à part. Garder le quota de minutes Actions :
   - publier l'APK sur tag ou sur `workflow_dispatch`, pas à chaque push ;
   - l'appli lit un `version.json` sur Hosting et propose le lien de la release quand une version plus récente existe.
3. **Connexion Google** si des comptes arrivent : impossible dans la WebView, il faut un plugin natif (`@capacitor-firebase/authentication`) + SHA-1. On retombe sur la difficulté de Light. Contournement : e-mail/mot de passe seul.
4. **Android 15+ affiche l'appli bord à bord** : gérer `env(safe-area-inset-*)` en CSS et le bouton retour (`@capacitor/app`).
5. **Effacement possible du stockage IndexedDB** dans le navigateur : appeler `navigator.storage.persist()` et proposer un export. Dans l'APK, le stockage est dans le bac à sable de l'appli : plus sûr.
6. **Mises à jour de Capacitor** (version majeure environ une fois par an), plus le SDK Android et JDK 21, déjà connus grâce à Light.

## 5. Comptes et synchronisation

**Étape 1 : sans compte.** Progrès dans IndexedDB, export/import d'un fichier JSON pour passer du téléphone au PC. Zéro service, zéro règle, zéro SHA-1.

**À décider dès le premier jour : le format des données.**
- Les progrès sont un **journal de réponses en ajout seul** : `{id unique, carte, date, note}`.
- L'état de chaque carte (prochaine échéance, stabilité) en est **recalculé** de façon déterministe.
- Synchroniser revient alors à faire l'union des deux journaux : aucun conflit possible, et l'import d'un fichier fusionne au lieu d'écraser.

**Étape 2, seulement si plusieurs appareils sont vraiment utilisés : Firebase Spark.**
- Nouveau projet, pas `light-243b1`.
- Firebase Auth par e-mail/mot de passe ; Google en option, avec le coût vu plus haut.
- Firestore : `users/{uid}/reviews/{id}` en ajout seul, plus un instantané compacté de temps en temps pour qu'un nouvel appareil ne relise pas tout.
- Cache hors ligne du SDK JS (`persistentLocalCache`), qui marche aussi dans la WebView.
- Quotas Spark : 50 000 lectures et 20 000 écritures par jour, très large pour quelques personnes.
- Règles simples : chacun ne lit et n'écrit que son `uid`.

**Pas de serveur à moi.** Aucun backend n'est nécessaire, rien ne tourne sur le Pi.

## 6. Structure du dépôt

```
<nom>/
  README.md
  package.json  vite.config.ts  tsconfig.json  capacitor.config.ts
  src/
    srs/        répétition espacée : pur, sans DOM, horloge injectée
    quiz/       générateurs de questions (pays→capitale, carte→nom, drapeau…), purs
    map/        rendu SVG d3-geo, gestes, pick(x,y), zones des micro-États
    store/      IndexedDB, journal de réponses, export/import (puis sync Firebase)
    ui/         écrans
    sw.ts       service worker (précache de tout le build)
  public/       vendor/inter/, icônes, manifest.webmanifest
  geodata/
    build.mjs   Natural Earth + Wikidata → public/geo/*.topojson, countries.json
    sources/    téléchargements bruts (non versionnés, sommes de contrôle versionnées)
  tests/
    unit/       Vitest : srs, quiz, données
    e2e/        navigateur headless, viewport téléphone, touchers
    cases/      cas de référence JSON de la répétition espacée
  android/      projet généré par `cap add android`, versionné, rarement touché
  firebase/     firebase.json, .firebaserc (+ firestore.rules à l'étape 2)
  .github/workflows/  ci.yml (web), android.yml (APK)
```

- Serveur de développement Vite sur 8060, driver du skill `run-<projet>` sur 8061+.
- La géométrie générée est versionnée dans `public/geo/` : construction reproductible, sans réseau en CI.

## 7. Tests

**Répétition espacée (Vitest)**
- Fonctions pures, horloge passée en paramètre.
- Cas de référence JSON : suite de réponses → échéances attendues.
- Propriétés (fast-check) : l'intervalle ne baisse jamais après une bonne réponse ; un rejeu du journal dans n'importe quel ordre donne le même état ; import puis export rend le même journal.

**Données**
- Chaque entité du quiz a une géométrie, un nom français, une capitale et un drapeau.
- Chaque micro-État a sa zone de toucher.
- Budget de taille du TopoJSON.
- Codes ISO uniques.

**Carte (navigateur headless, viewport 360×800, toucher activé)**
- Toucher `path[data-iso=FR]` → bonne réponse.
- Toucher aux coordonnées de Monaco au zoom monde → Monaco choisi, pas la France.
- Pincer pour zoomer (événements tactiles par CDP) → la transformation change, le trait garde son épaisseur.
- Mode avion après un premier chargement → l'appli démarre.

Point à faire valider : la convention prévoit un driver en stdlib qui pilote chromium par CDP, sans installer playwright. En CI Node, `@playwright/test` serait plus simple.

**Android**
- Pas d'émulateur en CI (environ 10 min par lancement) : le code est le même que celui testé sur le web.
- Contrôle à la main sur le téléphone à chaque version publiée, et `./gradlew assembleRelease` doit réussir.

## 8. Déploiement

- **Firebase Hosting, offre Spark, comme Light.** GitHub Pages ne sert pas un dépôt privé sans offre payante : écarté. Quotas Hosting (environ 10 Go stockés, transfert mensuel gratuit limité, chiffres à vérifier) largement suffisants si le build reste sous 5 Mo.
- **Déploiement** depuis le PC juste après le commit (`npx firebase deploy --only hosting`), comme Light. Pas de compte de service dans la CI.
- **APK** : `npm ci && npm run build && npx cap sync android && ./gradlew assembleRelease`. Signature par une nouvelle clé de CI (secrets du dépôt, copie de sauvegarde à garder), publication dans la release `android` au même lien fixe.

## 9. Ce qui reste incertain

- Fluidité réelle du SVG à 1:50m dans la WebView d'un téléphone moyen : à mesurer avant tout le reste.
- Bubblewrap non interactif en CI, et lecture de PMTiles en local sous Capacitor : non vérifiés, mais ce ne sont pas les options retenues.
- Statut 2026 de Compose Multiplatform pour le web (wasm).
- Couverture des micro-États par Natural Earth au 1:50m, et contenu exact de sa variante « point de vue France ».
- Tailles et quotas cités : ordres de grandeur.

## 10. Questions techniques à poser à l'utilisateur

1. **Un APK est-il indispensable**, ou la PWA « installée » depuis Chrome suffirait-elle (zéro CI Android) ?
2. **Qui s'en sert ?** Lui seul, sa famille, des élèves, le public ? Cela décide des comptes, et donc de Firebase Auth/Firestore ou non.
3. **Sur combien d'appareils**, et faut-il une synchronisation automatique, ou un export/import de fichier suffit-il au début ?
4. **Quel contenu ?** Pays et capitales seulement, ou aussi drapeaux, fleuves, montagnes, villes, régions françaises, départements et territoires d'outre-mer (La Réunion) ? Au-delà des pays, la question MapLibre revient.
5. **Frontières contestées** : suivre la position officielle française (variante « point de vue France » de Natural Earth) ?
6. **TypeScript + Vite** au lieu du JS sans outil de construction de Light : d'accord ?
7. **Tests de l'interface** : d'accord pour `@playwright/test` en CI, ou garder le driver CDP en stdlib ?
8. **Fréquence de l'APK** : à chaque push qui change l'appli (coûteux en minutes Actions) ou sur demande / sur tag, avec un avis « nouvelle version » dans l'appli ?
9. **Rappels quotidiens** (« N cartes à revoir ») sur le téléphone : voulus ?
10. **Nom du projet** (dossier, dépôt GitHub privé, projet Firebase, nom de paquet Android) et **couleur d'accent** ?