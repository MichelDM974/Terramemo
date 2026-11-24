# Photos des fiches (#34)

Conception : `docs/etudes/2026-11-16-fiche-lieu-conception.md`, § 3 et lots P1 à P3 ;
écarts du code au lot P2 : § 22 de la même étude.

## Avant le premier déploiement (à faire par l'utilisateur)

La branche `photos-p2` (lot P2) est codée et testée sur des lieux d'essai, **jamais
déployée**. Dans l'ordre :

1. **Relire les photos** : `npm run photos:relecture`, puis http://localhost:8064/
   (au clavier, sur le PC ; 1 à 2 h pour les lieux riches, d'après le relevé). Le 25/11,
   `choix.json` n'a encore aucun lieu relu. On peut commencer par 2 ou 3 lieux (le Japon,
   Cilaos) pour juger le rendu avant de relire les 332.
2. **Borner les versions gardées de Hosting à 10** : console de Firebase, Hosting,
   historique des versions, « Release storage settings » (S48 ; 1,4 Go au plus sur 10).
   Terramemo se déploie plusieurs fois par jour : sans cette borne, chaque version
   garderait sa copie des 105 à 138 Mo de photos.
3. **Traiter les photos relues** : `npm run photos:traiter -- --max 50` d'abord (S50 :
   la miniature de Commons se télécharge-t-elle sans blocage, une requête à la fois ?),
   puis `npm run photos:traiter`. Écrit `public/photos/` (ignoré par git), une copie
   sous `~/Sauvegardes/terramemo/photos/` et `geodata/photos/licences.json`, à commiter
   avec `choix.json`.
4. **Regarder le rendu** : `driver.py serve`, une fiche avec photos sur le PC puis sur
   l'A37 (S52 : une vignette de 480 × 320 est-elle nette sur le téléphone ?).
5. **Fusionner `photos-p2` dans `main`** (la décision est à l'utilisateur), puis un
   **déploiement d'essai** de quelques photos (`npm run build && npx firebase deploy
   --only hosting` ; le predeploy lance `verifier.mjs --dist`), et lire dans la console :
   une limite de fichiers par site (S48 ; ≈ 630 fichiers avec les listes, 2 400 à 3 000 avec
   les photos) ; un fichier inchangé compte-t-il une fois ou à chaque version (S49, après
   un second déploiement) ; `curl -sI` d'une photo répond `immutable`.
6. **Relire S54** : des photos CC BY-SA dans la fiche ne changent pas la licence du code
   ni des autres données (une collection) ; la phrase des Crédits le dit.

Le lot P3 (l'APK : vignettes embarquées, plein écran en ligne ; D59 d : l'archive des WebP
jointe à une release GitHub ; `verifier.mjs --reseau`) vient après.

## Fichiers

| Fichier | Rôle | Versionné |
|---|---|---|
| `candidats.json` | 10 candidats par lieu (`npm run photos:candidats`, lot P1) | oui |
| `choix.json` | la relecture de l'utilisateur (`npm run photos:relecture`) | oui |
| `licences.json` | par photo traitée : auteur, licence, titre, page, point, noms et SHA-256 des deux WebP, versions de Pillow et de libwebp (`npm run photos:traiter`) | oui |
| `public/photos/v/<nom>.webp` | vignette 480 × 320, WebP qualité 60 | non (D59) |
| `public/photos/p/<nom>.webp` | plein écran 1 080 × 720 | non (D59) |
| `photos/l/<id>.json`, `photos/credits.json` | écrits par le build (`listes.mjs`, plugin de `vite.config.ts`) : une liste par lieu (vide sans photo), les crédits | non (build) |

Le nom d'un WebP : les 10 premiers caractères hexadécimaux de son SHA-256 ; la vignette
et le plein écran ont chacun le leur.

## Commandes

```bash
npm run photos:relecture                 # relire (lot P1)
npm run photos:traiter                   # télécharger, recadrer, WebP, licences.json (Pillow)
npm run photos:traiter -- --max 50       # les 50 premières seulement
npm run photos:traiter -- --elaguer      # retirer de public/photos/ les WebP cités par rien
npm run photos:restaurer                 # un arbre de travail neuf : les WebP depuis ~/Sauvegardes
npm run photos:verifier                  # public/photos/ contre licences.json
node geodata/photos/verifier.mjs --dist  # dist/ (le predeploy de firebase.json)
```

**Arbre de travail neuf** (un `git worktree`, la CI) : il n'a aucun WebP. Les listes
s'écrivent quand même (les tests tournent partout), mais un build à déployer demande
d'abord `npm run photos:restaurer`, sinon le predeploy refuse.

## Lieux d'essai (pilote, sans réseau)

`tests/photos-essai/choix.json` (le Japon, Cilaos, Salazie ; un lieu en cours, le golfe
d'Aden sans photo) et `tests/photos-essai/sources.py` (des images fabriquées, marquées
« ESSAI ») :

```bash
D=/chemin/hors/du/depot
mkdir -p $D/donnees && cp tests/photos-essai/choix.json $D/donnees/
python3 tests/photos-essai/sources.py tests/photos-essai/choix.json $D/src
python3 geodata/photos/traiter.py --donnees $D/donnees --vers $D/donnees/photos --sans-sauvegarde --sources $D/src
TERRAMEMO_PHOTOS_DONNEES=$D/donnees python3 .claude/skills/run-terramemo/driver.py serve
```

Le serveur (et `vite build`) lit alors `choix.json` et `licences.json` dans `$D/donnees`,
et sert les WebP de `$D/donnees/photos/` : rien n'est écrit dans `public/`.
