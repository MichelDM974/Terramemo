---
name: run-cartographe
description: Lancer, piloter, photographier et MESURER Cartographe (site TypeScript + Vite et APK Capacitor, carte du monde en SVG ou en Canvas). À utiliser pour servir le site, vérifier qu'un changement marche dans un vrai navigateur, prendre des captures des vues, rejouer gestes et touchers et mesurer chargement, saccades et latence (chromium du PC, Chrome du téléphone ou APK par adb), construire et installer l'APK, déployer sur Firebase Hosting.
---

# Lancer, piloter et mesurer Cartographe

Site statique TypeScript + Vite sans framework (`src/`, carte d3-geo : SVG
en rendus `g` et `css`, Canvas en rendu `canvas`, la carte qui tourne),
emballé en APK par Capacitor (`android/`). **Aucun serveur ni donnée
serveur au J0** : tout le stockage est dans le navigateur (profil jetable
du chromium du driver, rien à nettoyer). Tout passe par
`.claude/skills/run-cartographe/driver.py` (Python stdlib seule) ; chemins
relatifs à `Cartographe/`. Contrat de la page avec le pilote :
`window.cartographe` (`src/main.ts`, `src/mesure/rapport.ts`).

## Prérequis

- `node_modules/` (`npm ci`), Node de `.nvmrc`.
- Le navigateur de `~/.cache/ms-playwright` : le plus récent
  `chromium_headless_shell-*` (chrome-headless-shell, celui qui mesure
  juste), à défaut `chromium-*` ; tri sur le numéro du dossier.
  `--binaire chromium|shell|<chemin>` sur smoke, ui et mesurer. Pas besoin
  d'installer playwright.
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
python3 .claude/skills/run-cartographe/driver.py mesurer --cible local --rendu canvas --ralenti 4  # processeur ralenti 4×
python3 .claude/skills/run-cartographe/driver.py mesurer --cible chrome --rendu canvas           # Chrome du téléphone (adb)
python3 .claude/skills/run-cartographe/driver.py mesurer --cible webview --rendu canvas          # l'APK (adb)
```

Options : `--rendu css|g|canvas|webgl` (défaut css ; `g` et `css` : carte
SVG, `canvas` et `webgl` : la carte qui tourne, Canvas 2D ou WebGL2 ; sur
le PC, le WebGL de chrome-headless-shell est SwiftShader, logiciel : ses
images perdues ne disent rien du GPU du téléphone ; `--gpu` prend le vrai
GPU du PC, rapport suffixé `-gpu`), `--projection monde|pacifique` (en
canvas : le méridien central au chargement, « Départ » dans ⚙),
`--repetitions N` (défaut 3 : chaque répétition recharge la page et rejoue
tout), `--url`, `--cache` (garde le cache HTTP, désactivé par défaut :
première visite), `--ws` (local par HTTP + WebSocket, le chemin du
téléphone), `--serie` (adb), `--out`, `--binaire`.

Chaque répétition : chargement de `?rendu=…&projection=…&mesures=0` (sans
panneau : sa mise à jour présenterait une image et fausserait les fins, cf.
`rapport.ts`), attente de `window.cartographe.repos` (période de l'écran
mesurée), puis 14 gestes par `Input.dispatchTouchEvent` (un `touchMove` par
période d'écran au repos — sur le téléphone au plus 8,33 ms, la cadence
d'un écran 120 Hz, car il peut tenir 60 Hz au repos et 120 Hz pendant un
geste) :
- 6 pincements à deux doigts et 5 glissés à un doigt, zooms de 1 à ~36,
  `zoomerSur("DEU")` au milieu ;
- le **tour du monde** (`tourner` dans le résumé) : au zoom 2, trois longs
  glissés horizontaux de 300 px en 960 ms. En canvas ils font tourner le
  globe d'un peu plus d'un tour (`scenario.transfo_apres_tour` : `r`, le
  méridien central à la fin) ; en SVG la carte plane va jusqu'à son bord.

Puis des touchers sur des pays et des pastilles (micro-États, Caraïbes au
zoom 1, Italie zoomée, Caraïbes au zoom 8 ; coordonnées lues dans le DOM :
`circle.pastille[data-id]`, sinon `cartographe.carte.ecran(id)`, seul
chemin en canvas). En canvas, la carte reste tournée par le tour du monde :
les touchers au zoom 1 éprouvent `ecran` et `pick` sur un globe tourné
(`touchers_vises[].rotation`). Enfin `cartographe.rapport()` (v6).

Sortie : un résumé `[OK ]`/`[NON]`/`[ ? ]` (à juger) par critère et le JSON
complet (v6 : rapports v6 bruts, touchers visés, scénario et pas de rejeu,
navigateur et binaire, `code` : commit, arbre modifié ou non, et pour la
WebView les dates de l'APK installé et du fichier) dans
`docs/mesures/j0/AAAA-MM-JJ-<cible>-<rendu>-<projection>[-x<ralenti>].json`
(réécrit si relancé le même jour). **Les commiter** : ce sont les preuves
du J0. Critère changé dans le driver : `driver.py resumer FICHIER.json…
[--pourquoi …] [--sec] [--json]` recalcule le résumé sur les rapports bruts
(v3 à v6) sans refaire les mesures, réécrit le fichier (rapports intacts) et
le note dans `resume_recalcule` ; `--sec` affiche sans écrire, `--json` donne
les résumés en JSON (`tests/mesure-driver.test.ts` s'en sert pour confronter
le critère recopié dans le driver à `src/mesure/stats.ts` : changer l'un
sans l'autre casse `npm test`). Champs du rapport : `src/mesure/rapport.ts` (le contrat, qui fait
foi). Lignes du résumé, par type de geste (pincer, glisser, tourner) :

- **rendu < 1 s** : `chargement.total_ms`.
- **pas de saccade** (décision de l'utilisateur, 04/11/2026, registre) : un
  à-coup est une image qui tarde 25 ms ou plus (trois rafraîchissements à
  120 Hz, un et demi à 60 i/s), compté dès 21 ms (`SEUIL_ACOUP_MS` : loin de
  16,67 et 25 ms, les valeurs exactes de l'écran, l'arrondi et la gigue ne
  le font pas compter au hasard), quelle que soit la fréquence de l'écran
  (`stats.acoups`, recalculé par le driver sur les intervalles bruts). Un
  gel est une image qui tarde 50 ms (trois images à 60 Hz), compté dès
  46 ms (`SEUIL_GEL_MS`, loin de 41,67 et 50 ms ; `stats.gels`). `[NON]`,
  par type de geste et quel que soit le rendu, si :
  - plus de 3 à-coups par seconde de geste en moyenne sur toutes les
    répétitions (à-coups × 1000 / somme des intervalles) ;
  - ou un seul geste saccade (`stats.saccade`, colonne « geste(s) qui
    saccadent seuls », le pire taux entre parenthèses) : un gel (visible
    seul, que la moyenne laisserait passer), ou plus de 3 à-coups par
    seconde de ce geste avec au moins 2 (un geste qui saccade franchement,
    que les gestes propres dilueraient ; un à-coup isolé dans un geste
    court, 1 en 0,3 s, ne compte pas).

  Sinon `[OK ]`, jamais `[ ? ]`. Le plus long (`max_ms`) est affiché, hors
  verdict. Un type d'un seul geste court se juge aussi sur sa moyenne : un
  à-coup en 0,3 s, seul de son type, y fait NON (3,3/s). Compté par seconde, pas par intervalle, pour ne pas avantager le
  rendu le plus rapide (3/s, ce sont les 5 % des intervalles à 60 i/s) ;
  monotone : à durée fixe, plus d'images à 120 i/s ne change rien.
- **tenue des 120 i/s** (`[ — ]`, sans verdict, pour comparer les rendus) :
  images/s de chaque type de geste et part des intervalles ≤ 12,5 ms
  (1,5 × 8,33, seuil fixe, `stats.tenue_120` : elle suit exactement la part
  d'images à 120 i/s, même sous ± 2 ms de gigue ; 0 % sur un écran à 60 Hz).
  **La lire avec la cadence affichée à côté** (images/s) : un écran à 90 Hz
  donne aussi 100 % (11,1 ms ≤ 12,5), à 90 i/s et non 120 ; seul un écran à
  60 ou 120 Hz se lit sur la part seule.
  La ligne donne la fréquence de l'écran au repos (`ecran.periode_ms`) et,
  par type, la médiane de `stats.periode_geste_ms` (estimée : médiane de la
  grappe basse, calée sur 144, 120, 90, 60 Hz ou 30 images/s), l'écart
  au-delà de 25 % selon `stats.ecart_sens`
  (`plus_rapide` : l'écran monte à 120 Hz pendant le geste ; `plus_lent` :
  l'appli tient une cadence sous celle de l'écran au repos, ex. 60 i/s sur
  120 Hz), `stats.bascule_images` (intervalles de tête encore à la
  fréquence du repos, quand l'écran accélère) et, en indicatif, les images
  perdues sur la période du geste et sur celle du repos.
- **dessin des images < période de l'écran** (canvas seulement, `[ — ]`
  sans objet en SVG) : `gestes[].dessin_ms` (script de chaque image
  dessinée pendant le geste), le 95e centile de chaque geste face à sa
  période ; `[NON]` dès qu'un geste le dépasse (leur nombre est affiché).
  Ni rastérisation ni présentation : un dessin court ne prouve pas l'image
  à l'heure, les images perdues le disent.
- **fin de geste < 100 ms** (seuil proposé, celui du toucher) :
  `gestes[].fin.event_timing_ms`, Event Timing du touchend qui finit le
  geste jusqu'à la présentation (en css : transformation posée, nouvelle
  peinture et rastérisation de toute la carte ; en canvas : la carte
  complète redessinée à la place de l'allégée), médiane et max ;
  `fin.image_ms` (fil principal seul) en indicatif. Selon
  `fin.event_timing_etat` : `sous_seuil` (une entrée postérieure est
  arrivée, l'image de la fin a pris moins de 16 ms) compté 16 ;
  `en_attente` (rien de postérieur : image peut-être pas encore présentée,
  durée inconnue) jamais compté, il met la ligne à `[ ? ]`, comme une fin
  sans entrée ; leur total est en tête de ligne (« N/M fins en attente »,
  « la MAJORITÉ, critère muet » au-delà de la moitié). Ça n'arrive pas sur
  le PC (toutes `mesure`), mais sur le téléphone à 120 Hz les fins et ce
  qui les suit peuvent tous passer sous les 16 ms de l'API, sans entrée
  postérieure pour le prouver. **S'ils dominent** : ne rien conclure de la
  ligne, ni OK ni NON ; regarder `fin.image_ms` (fil principal, indicatif)
  et juger la fin à l'œil (point 1, le lever du doigt) ; puis noter au
  ticket qu'il faut une preuve de présentation de la fin (piste : un
  toucher en mer du driver juste après chaque geste, rapporté à part). **Écartée du verdict** (montrée à part) seulement l'artefact
  prouvé du rendu g : `rendu` g ET `fin.close_par_entree_suivante` ET
  `image_ms` < 100 ET aucune longue image (la fin ne change aucun pixel,
  son entrée attend la première image présentée ensuite ; en css la fin
  repeint toujours, jamais écartée). Aucune fin comptée : `[ ? ]`.
- **toucher < 100 ms** : Event Timing du pointerup partout
  (`event_timing_etat` 'mesure') ; 'sous_seuil' (aucune entrée, donc sous
  16 ms) compté 16 ; 'non_pris_en_charge' : repli sur
  `fin_fil_principal_ms`, signalé `REPLI` (il sous-estime : ni
  rastérisation ni présentation). `fin_fil_principal_ms` reste affiché en
  indicatif.
- **pays touchés justes** : `pick` de la page = pays visé.

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

Déroulé d'une séance avec le téléphone (l'ordre compte : les mesures
d'abord, téléphone au calme, puis l'œil, panneau affiché) :
1. préparer (ci-dessus), `serve --preview` sur le PC, arbre propre
   (`git status`) : le JSON note le commit mesuré ;
2. mesurer Chrome dans les trois rendus, puis `apk --installer` et
   mesurer l'APK dans les trois rendus (commandes ci-dessous) ; lire les
   résumés, regarder les `[ ? ]` ;
3. « À l'œil », point 0 d'abord (le doigt monte-t-il l'écran à 120 Hz
   quand le driver ne le fait pas ?), puis les autres, dont la rotation
   (point 2) ;
4. commiter les JSON de `docs/mesures/j0/` et noter au registre ce que
   l'œil a vu, rendu par rendu ; le verdict des mesures cite chaque ligne
   (pincer, glisser, tourner = le tour du monde) de chaque critère, pas
   seulement le pincement (une fin lente peut n'être que sur le tour du
   monde) ; `adb shell svc power stayon false`.

Mesurer (même code, autre transport : `adb forward tcp:8061` vers le
socket DevTools, client WebSocket du driver) :

```bash
python3 .claude/skills/run-cartographe/driver.py serve --preview        # en arrière-plan, sur le PC
for r in css g canvas; do python3 .claude/skills/run-cartographe/driver.py mesurer --cible chrome --rendu $r; done
python3 .claude/skills/run-cartographe/driver.py apk --installer        # APK de debug sur le téléphone
for r in css g canvas; do python3 .claude/skills/run-cartographe/driver.py mesurer --cible webview --rendu $r; done
python3 .claude/skills/run-cartographe/driver.py mesurer --cible webview --rendu canvas --projection pacifique
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
- Aucun ralenti sur le téléphone (`--ralenti` refusé). L'écran est à
  120 Hz mais peut tenir 60 Hz au repos : `ecran.periode_ms` (repos) et la
  période des gestes sont affichées côte à côte dans la ligne de tenue
  (sans verdict ; les à-coups, ≥ 21 ms, n'en dépendent pas). Les touchers injectés par DevTools ne
  passent pas par l'écran tactile : ils ne font peut-être pas monter
  l'écran à 120 Hz (point 0 de « À l'œil »).
- **À l'œil en plus des chiffres** : déplacer et pincer soi-même la carte
  (saccades du compositeur, tuiles non peintes : invisibles aux
  intervalles rAF), toucher les micro-États et les Caraïbes au doigt.
- DevTools à la main : `chrome://inspect` sur le Chrome du PC (le
  forward du driver doit être retiré : `adb forward --remove-all`).

### À l'œil, avec le téléphone (après les mesures)

Noter chaque point (OK, ou ce qui est vu) dans le registre. Chrome
(`http://localhost:8060` après `adb reverse tcp:8060 tcp:8060`, que le
driver retire en fin de mesure, ou le site déployé) **puis** l'APK ; rendu
changé dans ⚙ → Rendu (la page se recharge), les trois : `css`, `g`,
`canvas`.

0. **Le doigt et le driver voient-ils le même écran ?** ⚙ → « Afficher
   les mesures ». Pincer au doigt de l'Europe à la Suisse, puis glisser :
   le panneau donne `Écran … Hz (… ms)` (repos) et, par geste, « N
   à-coup(s) ≥ 21 ms (x/s)[, G gel(s) ≥ 46 ms][ : NON, saccade] · période
   P ms » (P : la période du geste ; « NON » si ce geste seul saccade, et
   sur plusieurs gestes « saccade : glisser OK, pincer NON… », le verdict
   par type comme le driver),
   « tenue 120 i/s T %, C i/s » et « ⚠ geste plus rapide que le repos : X Hz
   contre Y Hz » si elle change. Le faire dans Chrome
   puis dans l'APK, et comparer P à `stats.periode_geste_ms` des JSON du
   driver (même cible, même rendu). Si le doigt donne 8,3 ms (120 Hz) et le
   driver 16,7 ms, les gestes injectés ne font pas monter l'écran : ne
   retenir du driver que les fins, les touchers et `dessin_ms`, et juger la
   fluidité au doigt (panneau affiché). Panneau affiché, une fin en g peut
   valoir ~270 ms (sa mise à jour clôt l'entrée) : ne pas la lire comme
   une vraie fin lente. Au doigt, le geste ralentit à la fin et l'écran
   peut redescendre à 60 Hz : des intervalles de 16,7 ms en fin de geste
   baissent la tenue des 120 i/s (et comptent en « perdues » sur la période
   du geste, indicatif), mais ce ne sont pas des saccades de l'appli, et le
   compte d'à-coups (≥ 21 ms) ne les voit pas.
1. **g / css / canvas pendant un pincement** : pincer de l'Europe entière
   jusqu'à la Suisse, doigts posés, puis lever. En css la couche entière
   est agrandie par le compositeur jusqu'au lever du doigt : carte floue,
   disques des pastilles et traits des frontières grossis avec le zoom,
   puis net d'un coup au lever (coût lu dans `fin.event_timing_ms`). En g :
   net tout du long, mais saccades possibles. En canvas : net tout du long
   (redessinée à chaque image), carte allégée pendant le geste. Dire
   lequel gêne le plus (tranche `RENDU_DEFAUT`, src/main.ts).
2. **La carte qui tourne (canvas)** : au zoom 1 puis zoomé (Europe),
   glisser horizontalement, long et vite, plusieurs fois dans le même sens
   (le tour du monde), puis lentement. Le globe tourne-t-il sans à-coup,
   le point sous le doigt reste-t-il sous le doigt ? La **carte allégée**
   se voit-elle pendant le mouvement (côtes simplifiées, petites îles qui
   changent), et le passage à la carte complète au lever (saut, flou,
   éclair) ? Les frontières (un pixel physique, `--frontiere-fine`) :
   trop marquées, trop fines ? Les hachures (Sahara occidental…) glissent
   sous la carte pendant le geste : gênant ? « Voir » dans la vue Toucher
   (le globe tourne et zoome jusqu'au pays) : fluide ? Enfin toucher des
   micro-États sur le globe tourné (la carte rend le bon pays).
3. **Clavier et hauteur de page dans l'APK** : vue Saisie, toucher un
   champ ; le clavier rétrécit-il la page (fond qui remonte, carte
   retracée au retour dans la vue Carte, centre gardé) ou passe-t-il
   par-dessus ? Revenir à la Carte clavier ouvert puis fermé : même vue.
4. **Écran de lancement** : fermer l'appli (balayer dans les récentes),
   la rouvrir : icône sur fond sombre, puis la carte, **sans éclair
   blanc** entre les deux (`backgroundColor` de capacitor.config.ts).
5. **Bord à bord** : rien sous l'encoche ni sous la barre de navigation ;
   dans `chrome://inspect` → la WebView → console :
   `getComputedStyle(document.body).padding` doit donner des valeurs
   **non nulles** en haut et en bas (env(safe-area-inset-*) reçues).
6. **Icônes des barres du téléphone** : passer le téléphone en **thème
   clair** (Paramètres → Affichage → Clair) et rouvrir l'APK : heure,
   batterie et boutons de navigation doivent rester **clairs** sur le fond
   sombre (`style: 'DARK'` du plugin SystemBars), pas sombres sur sombre.
   Remettre le thème d'avant.
7. **Touchers au doigt** (les trois rendus) : micro-États (Vatican,
   Saint-Marin, Monaco) et Caraïbes au zoom 1 puis zoomés, dans la vue
   Toucher ; un glissé léger du doigt (moins de 10 px) doit compter comme
   toucher au point visé.

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

- **Event Timing est faussé par `chromium-*` en nouveau headless**, pas
  par le headless en général : sur nos touchers (Caraïbes au zoom 1), la
  présentation n'y est signalée qu'au prochain événement, d'où des
  secondes en escalier décroissant (JAM 5304, GRD 4768 … TTO 1024 ms).
  chrome-headless-shell, sur la même suite, donne 16 à 40 ms partout :
  c'est le binaire par défaut du driver (`--binaire`). Un escalier pareil
  sur le téléphone serait donc un vrai défaut à creuser, pas cet artefact.
- Headless tourne à 60 Hz et `--ralenti` ne ralentit que le fil principal
  du moteur de rendu (ni compositeur, ni rastérisation, ni GPU) : le PC
  avantage le rendu `css`. En canvas, à l'inverse, le PC sans GPU
  rastérise le canvas au processeur : ses images perdues à ×4 ne disent
  rien du téléphone, `dessin_ms` (le script) se compare mieux. Seul le
  téléphone tranche.
- Les mesures du PC sont faussées si la machine est chargée (autre build,
  autre session) : relancer au calme avant d'en conclure quoi que ce soit.
- `dist/` est partagé : `apk` et `npm run build` le réécrivent ; `serve
  --preview` construit ailleurs exprès.
- `vite preview` renvoie `index.html` à toute adresse inconnue : un
  fichier de `/geo/` absent y répond 200… en HTML (smoke le voit au JSON
  invalide). Firebase répond 404 (pas de rewrites dans `firebase.json`).
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
| `aucun chromium dans ~/.cache/ms-playwright` | `npx playwright install chromium chromium-headless-shell` dans un dossier jetable. |
| `aucun téléphone prêt pour adb (… unauthorized)` | Accepter l'empreinte du PC sur le téléphone ; sinon `adb kill-server`. |
| `port 8061 déjà pris` (`--ws`) ou `/json/version` muet | Un `adb forward` est resté : `adb forward --remove-all`. |
| `aucune page dans la WebView` | APK de release (pas de DevTools) ou appli fermée : `apk --installer`. |
| Mesure du téléphone figée, `pas de réponse du navigateur` | Écran éteint ou verrouillé : `adb shell svc power stayon usb`, déverrouiller. |
| Gradle : `JAVA_COMPILER` ou SDK introuvable | Passer par `driver.py apk` (JDK 21, `ANDROID_HOME`). |
