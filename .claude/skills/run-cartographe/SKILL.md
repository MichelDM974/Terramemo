---
name: run-cartographe
description: Lancer, piloter, photographier et MESURER Cartographe (site TypeScript + Vite et APK Capacitor, carte SVG du monde). À utiliser pour servir le site, vérifier qu'un changement marche dans un vrai navigateur, prendre des captures des vues, rejouer gestes et touchers et mesurer chargement, saccades et latence (chromium du PC, Chrome du téléphone ou APK par adb), construire et installer l'APK, déployer sur Firebase Hosting.
---

# Lancer, piloter et mesurer Cartographe

Site statique TypeScript + Vite sans framework (`src/`, carte SVG d3-geo),
emballé en APK par Capacitor (`android/`). **Aucun serveur ni donnée
serveur au J0** : tout le stockage est dans le navigateur (profil jetable
du chromium du driver, rien à nettoyer). Tout passe par
`.claude/skills/run-cartographe/driver.py` (Python stdlib seule) ; chemins
relatifs à `Cartographe/`. Contrat de la page avec le pilote :
`window.cartographe` (`src/main.ts`, `src/mesure/rapport.ts`).

## Prérequis

- `node_modules/` (`npm ci`), Node de `.nvmrc`.
- Le chromium de `~/.cache/ms-playwright` (le plus récent `chromium-*`) :
  pas besoin d'installer playwright.
- Téléphone et APK : `~/Android/Sdk` (adb dans `platform-tools/`), JDK 21
  (`/usr/lib/jvm/java-21-openjdk-amd64`).

## Chemin agent

```bash
python3 .claude/skills/run-cartographe/driver.py serve              # vite (dev) sur 8060, au premier plan
python3 .claude/skills/run-cartographe/driver.py serve --preview    # build hors de dist/ puis vite preview sur 8060
python3 .claude/skills/run-cartographe/driver.py serve --lan        # aussi sur le réseau local (0.0.0.0)
python3 .claude/skills/run-cartographe/driver.py smoke              # page, /geo/*.json, carte peinte ; code ≠ 0 au moindre échec
python3 .claude/skills/run-cartographe/driver.py ui                 # captures téléphone (384×832, DPR 2.8125, toucher émulé)
python3 .claude/skills/run-cartographe/driver.py ui --width 1280    # captures PC (souris)
```

- `serve` en arrière-plan, puis les autres. `--preview` construit dans
  `/tmp/cartographe-preview` (`--sortie`), jamais dans `dist/` (celui de
  l'APK et de Firebase). **Pour mesurer, toujours `--preview`** : le
  serveur de dev sert des modules non groupés, son chargement ne dit rien
  du site (smoke et mesurer le signalent).
- `smoke` : `[ok ]`/`[KO ]` par vérification (HTTP 200 et JSON valide des
  cinq fichiers de `/geo/`, `body[data-pret="1"]`, nombre de `path.pays`,
  aucune exception JS ni requête en échec), puis `smoke : OK`.
- `ui` écrit `1-carte`, `2-pays-touche` (Suisse), `3-toucher-faux`,
  `4-toucher-juste`, `5-saisie` (« sai » dans le champ réglé), `6-reglages`
  (⚙) dans `--out` (`/tmp/cartographe-captures`), et affiche les textes lus
  (barre, rétroaction, liste de la Saisie). **Regarder les captures.**
- Option `--url` partout (ex. `https://cartographe-geo.web.app/`) : smoke
  et ui marchent aussi sur le site déployé.

### Mesurer (critères du J0)

```bash
python3 .claude/skills/run-cartographe/driver.py mesurer --cible local --rendu css               # PC, vitesse réelle
python3 .claude/skills/run-cartographe/driver.py mesurer --cible local --rendu g --ralenti 4     # processeur ralenti 4×
python3 .claude/skills/run-cartographe/driver.py mesurer --cible chrome --rendu css              # Chrome du téléphone (adb)
python3 .claude/skills/run-cartographe/driver.py mesurer --cible webview --rendu css             # l'APK (adb)
```

Options : `--projection monde|pacifique`, `--repetitions N` (défaut 3 :
chaque répétition recharge la page et rejoue tout), `--url`, `--cache`
(garde le cache HTTP, désactivé par défaut : première visite), `--ws`
(local par HTTP + WebSocket, le chemin du téléphone), `--serie` (adb),
`--out`.

Chaque répétition : chargement de `?rendu=…&projection=…&mesures=0`,
attente de `window.cartographe.repos` (période de l'écran mesurée), puis
11 gestes par `Input.dispatchTouchEvent` (pincements à deux doigts et
glissers à un doigt, un `touchMove` par période d'écran, zooms de 1 à ~36,
`zoomerSur("DEU")` au milieu), puis des touchers sur des pays et des
pastilles (micro-États, Caraïbes au zoom 1, Italie zoomée, Caraïbes au
zoom 8 ; coordonnées lues dans le DOM : `circle.pastille[data-id]`, sinon
`cartographe.carte.ecran(id)`) ; enfin `cartographe.rapport()`.

Sortie : un résumé `[OK ]`/`[NON]` par critère (rendu < 1 s, pas de
saccade, toucher < 100 ms, pays touchés justes) et le JSON complet
(rapports bruts, touchers visés, scénario, navigateur) dans
`docs/mesures/j0/AAAA-MM-JJ-<cible>-<rendu>-<projection>[-x<ralenti>].json`
(réécrit si relancé le même jour). **Les commiter** : ce sont les preuves
du J0. « Saccade » au sens du driver : plus de 5 % d'images perdues
(intervalle > 1,5 période) sur un type de geste, ou un intervalle > 50 ms ;
l'œil sur le téléphone tranche. L'image de fin de geste est donnée à part.

## Chemin humain

« Lance Cartographe » = ouvrir https://cartographe-geo.web.app (une fois
déployé) ou l'appli Cartographe sur le téléphone : **rien à démarrer**,
pas de serveur. Pour essayer le code non déployé sur le PC : `serve`, puis
http://localhost:8060.

## Téléphone (Galaxy A37, Chrome et APK)

Préparer, une fois :
1. Options de développement (Paramètres → À propos du téléphone →
   Informations sur le logiciel → toucher 7 fois « Numéro de version »),
   puis **Débogage USB** activé.
2. Brancher en USB, accepter l'empreinte du PC sur le téléphone ;
   `~/Android/Sdk/platform-tools/adb devices` doit dire `device` (pas
   `unauthorized`).
3. Écran allumé et déverrouillé pendant les mesures (sinon plus d'images,
   tout se fige) : `adb shell svc power stayon usb` (remettre `false` après).

Mesurer (même code, autre transport : `adb forward tcp:8061` vers le
socket DevTools, client WebSocket du driver) :

```bash
python3 .claude/skills/run-cartographe/driver.py serve --preview        # en arrière-plan, sur le PC
python3 .claude/skills/run-cartographe/driver.py mesurer --cible chrome --rendu css
python3 .claude/skills/run-cartographe/driver.py mesurer --cible chrome --rendu g
python3 .claude/skills/run-cartographe/driver.py apk --installer        # APK de debug sur le téléphone
python3 .claude/skills/run-cartographe/driver.py mesurer --cible webview --rendu css
python3 .claude/skills/run-cartographe/driver.py mesurer --cible webview --rendu g
python3 .claude/skills/run-cartographe/driver.py mesurer --cible webview --rendu css --projection pacifique
```

- `chrome` : `adb forward tcp:8061 localabstract:chrome_devtools_remote`
  (Chrome lancé par `am start` si le socket manque), onglet neuf par
  `PUT /json/new`, page servie par le PC via `adb reverse tcp:8060
  tcp:8060` (`http://localhost:8060` est un contexte sûr sur le
  téléphone). `--url https://cartographe-geo.web.app/` mesure le site
  déployé (sans reverse). L'onglet est fermé et les redirections adb
  retirées à la fin.
- `webview` : `am start -n io.github.micheldm974.cartographe/.MainActivity`,
  pid par `pidof`, `adb forward` vers `webview_devtools_remote_<pid>` ; la
  page est `https://localhost/` (fichiers de l'APK, pas le PC). Seul
  l'**APK de debug** ouvre DevTools.
- Aucun ralenti sur le téléphone (`--ralenti` refusé) ; l'écran est à
  120 Hz, la période mesurée le dit.
- **À l'œil en plus des chiffres** : déplacer et pincer soi-même la carte
  (saccades du compositeur, tuiles non peintes : invisibles aux
  intervalles rAF), toucher les micro-États et les Caraïbes au doigt.
- DevTools à la main : `chrome://inspect` sur le Chrome du PC (le
  forward du driver doit être retiré : `adb forward --remove-all`).

### Essai de saisie (clavier Samsung puis Gboard)

1. Gboard : Play Store → « Gboard » → installer ; puis Paramètres →
   Gestion globale → Liste des claviers et clavier par défaut → Clavier
   par défaut : basculer entre « Clavier Samsung » et « Gboard ».
2. Pour chaque clavier, dans Chrome **et** dans l'APK, vue **Saisie** :
   taper « fra » puis « sai » dans les trois champs. Attendu : rien au-dessus
   des touches dans « Champ réglé » (et la variante `type=url`), des
   suggestions dans « Champ témoin » (le témoin prouve que le clavier en
   fait). Majuscule automatique et correction en tapant aussi à surveiller.
3. Noter le résultat (clavier × navigateur × champ) dans le registre ; si
   le champ réglé souffle encore : décision (variante url, ou clavier de
   lettres dans l'appli, plan « Technique »).

## APK

```bash
python3 .claude/skills/run-cartographe/driver.py apk                # npm run build, npx cap sync android, gradlew assembleDebug
python3 .claude/skills/run-cartographe/driver.py apk --installer    # puis adb install -r
```

APK : `android/app/build/outputs/apk/debug/app-debug.apk`. Le driver met
`JAVA_HOME` sur le JDK 21 et `ANDROID_HOME` sur `~/Android/Sdk` (ou
`android/local.properties`, ignoré par git, avec
`sdk.dir=/home/delhomme/Android/Sdk`). En CI : `.github/workflows/android.yml`
(à la demande ou sur tag `v*`, APK en artefact).

## Déploiement (Firebase Hosting, projet `cartographe-geo`)

```bash
npm run build && npx firebase deploy --only hosting
python3 .claude/skills/run-cartographe/driver.py smoke --url https://cartographe-geo.web.app/
```

Depuis le PC, juste après le commit. **`deploy` publie `dist/` tel qu'il
est sur le disque, pas le dernier commit** : rebâtir juste avant, sur un
arbre propre (`git status`).

## Pièges

- **Event Timing est faussé en headless** (chromium du PC) : la
  présentation de l'image n'est signalée qu'au prochain événement, si
  bien qu'un toucher sur une page au repos affiche des secondes (durées en
  escalier décroissant d'un toucher à l'autre) alors que la mesure maison
  (`latence_peinte_ms`) reste de l'ordre d'une image. Rien n'y fait (`--disable-gpu`,
  `--disable-gpu-vsync`… ; swiftshader le supprime tout court). Le verdict
  local suit donc la mesure maison, celui du téléphone Event Timing ; les
  deux sont toujours affichés.
- Headless tourne à 60 Hz et `--ralenti` ne ralentit que le fil principal
  du moteur de rendu (ni compositeur, ni rastérisation, ni GPU) : le PC
  avantage le rendu `css`. Seul le téléphone tranche.
- Les mesures du PC sont faussées si la machine est chargée (autre build,
  autre session) : relancer au calme avant d'en conclure quoi que ce soit.
- `dist/` est partagé : `apk` et `npm run build` le réécrivent ; `serve
  --preview` construit ailleurs exprès.
- `vite preview` et Firebase renvoient `index.html` à toute adresse
  inconnue : un fichier de `/geo/` absent répond 200… en HTML (smoke le
  voit au JSON invalide).
- Changer le rendu ou la projection dans ⚙ recharge la page (mesures d'un
  chargement propre) ; `?rendu=`, `?projection=`, `?mesures=1` font de
  même par l'adresse.
- `http://<ip du PC>:8060` (`serve --lan`) n'est pas un contexte sûr sur le
  téléphone (service worker refusé) : préférer `adb reverse`.
- Arrêter un serveur : `fuser -k -n tcp 8060`, jamais `pkill -f`.

## Dépannage

| Symptôme | Cause et correctif |
|---|---|
| `ECHEC : rien ne répond sur http://localhost:8060/` | `serve` non lancé. |
| `Port 8060 is already in use` | Un `serve` traîne : `fuser -k -n tcp 8060`. |
| `carte pas prête en 60 s` | Erreur de chargement (voir `erreur de la page`), ou `/geo/` absent : `npm run geodata`. |
| `aucun chromium dans ~/.cache/ms-playwright` | `npx playwright install chromium` dans un dossier jetable. |
| `aucun téléphone prêt pour adb (… unauthorized)` | Accepter l'empreinte du PC sur le téléphone ; sinon `adb kill-server`. |
| `port 8061 déjà pris` (`--ws`) ou `/json/version` muet | Un `adb forward` est resté : `adb forward --remove-all`. |
| `aucune page dans la WebView` | APK de release (pas de DevTools) ou appli fermée : `apk --installer`. |
| Mesure du téléphone figée, `pas de réponse du navigateur` | Écran éteint ou verrouillé : `adb shell svc power stayon usb`, déverrouiller. |
| Gradle : `JAVA_COMPILER` ou SDK introuvable | Passer par `driver.py apk` (JDK 21, `ANDROID_HOME`). |
