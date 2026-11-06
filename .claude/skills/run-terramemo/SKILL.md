---
name: run-terramemo
description: Lancer, piloter, photographier et MESURER Terramemo (site TypeScript + Vite et APK Capacitor, carte du monde en Canvas 2D par défaut, en WebGL ou en SVG). À utiliser pour servir le site, vérifier qu'un changement marche dans un vrai navigateur, prendre des captures des vues, rejouer gestes et touchers et mesurer chargement, saccades et latence (chromium du PC, Chrome du téléphone ou APK par adb), construire et installer l'APK, déployer sur Firebase Hosting.
---

# Lancer, piloter et mesurer Terramemo

Site statique TypeScript + Vite sans framework (`src/`, carte d3-geo : la
carte qui tourne en Canvas 2D (rendu `canvas`, **celui par défaut**,
décision « Rendu par défaut » du 06/11) ou en WebGL2 (rendu `webgl`) ; SVG
en rendus `g` et `css` ; tous au choix dans ⚙ ; l'île toujours en SVG),
emballé en APK par Capacitor (`android/`). **Pas de serveur à soi** : le
stockage est dans le navigateur (profil jetable du chromium du driver ;
sur le téléphone, `mesurer` vide celui de l'origine mesurée, cf.
« Première visite »), sauf les **classements du Chrono** : Firestore et
Auth anonyme de Firebase (`src/epreuve/classement.ts`, règles
`firestore.rules`), chargés seulement à l'ouverture d'un classement. Le
driver (`ui`) y lit les vrais classements sans publier ni créer de
compte ; pour publier, les émulateurs (ci-dessous). Tout passe par
`.claude/skills/run-terramemo/driver.py` (Python stdlib seule) ; chemins
relatifs à `Terramemo/`. Contrat de la page avec le pilote :
`window.terramemo` (`src/main.ts`, `src/mesure/rapport.ts`).

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
python3 .claude/skills/run-terramemo/driver.py serve              # vite (dev) sur 8060, au premier plan
python3 .claude/skills/run-terramemo/driver.py serve --preview    # build hors de dist/ puis vite preview sur 8060
python3 .claude/skills/run-terramemo/driver.py serve --lan        # aussi sur le réseau local (0.0.0.0)
python3 .claude/skills/run-terramemo/driver.py smoke              # page, /geo/*.json, carte peinte (canvas, SVG), shaders webgl compilés ; code ≠ 0 au moindre échec
python3 .claude/skills/run-terramemo/driver.py ui                 # captures téléphone (384×832, DPR 2.8125, toucher émulé)
python3 .claude/skills/run-terramemo/driver.py ui --width 1280    # captures PC (souris)
python3 .claude/skills/run-terramemo/driver.py ui --rendu webgl   # carte du monde en webgl (logiciel=1), ou g, css (défaut : canvas, celui de la page)
```

- `serve` en arrière-plan, puis les autres. `--preview` construit dans
  `/tmp/terramemo-preview` (`--sortie`), jamais dans `dist/` (celui de
  l'APK et de Firebase). **Pour mesurer, toujours `--preview`** : le
  serveur de dev sert des modules non groupés, son chargement ne dit rien
  du site (smoke et mesurer le signalent).
- `smoke` : `[ok ]`/`[KO ]` par vérification (HTTP 200 et JSON valide des
  cinq fichiers de `/geo/` et des quatre de `/geo/reunion/`,
  `body[data-pret="1"]`, **rendu par défaut `canvas`** (`#carte[data-rendu]`)
  et son dessin complet (plus de 150 parties tracées, `terramemo.carte.dessin()`),
  **rien de `/geo/reunion/` chargé au premier affichage** (après `pret` et
  `repos`, décision « Hébergement »), nombre de `path.pays` en
  `?rendu=css` (les rendus SVG), rendu webgl, aucune exception JS ni requête
  en échec), puis `smoke : OK`.
  Le rendu webgl (`?rendu=webgl&logiciel=1`) doit finir en `data-relais="webgl"` :
  **seule vérification où le vrai compilateur voit les shaders** (`npm test`
  les traduit en JS, un shader refusé par le pilote y passerait) ; un refus
  y sort en `[KO ]` avec le journal du compilateur (sinon la carte retombe
  sans bruit sur le Canvas 2D). Smoke après tout changement de shader.
- `ui` écrit `1-carte`, `2-pays-touche` (Suisse), `3-toucher-faux`,
  `4-toucher-juste`, `5-saisie` (« sai » dans le champ réglé), `6-reglages`
  (⚙), `7-chrono-depart`, `8-chrono-faux` et `9-chrono-bilan` (l'Amérique
  du Sud jouée jusqu'au bilan, ~25 s) dans `--out`
  (`/tmp/terramemo-captures`), et affiche les textes lus (barre,
  rétroaction, liste de la Saisie, bilan du Chrono). Puis La Réunion et
  Nommer (#15) : `10-reunion` (Toucher → La Réunion : l'île entière, barre
  en bas, mention de l'IGN), `11-reunion-faux` (Saint-Paul touché pour
  Saint-Denis : « Passer » jusqu'à Saint-Denis, l'ordre étant tiré au
  hasard), `12-nommer-monde` (Nommer, Europe : zone en accent, 4 boutons,
  prise une fois le vol fini : `attendre_fin_vol`, transformation stable),
  `13-nommer-reunion-retro` (mauvais choix rouge, bon vert),
  `14-chrono-reunion` (première question, jauge) ; il remet Localiser et
  vérifie le monde au retour (la Carte, `pick` sur la Suisse = CHE).
  L'exercice se choisit par Jouer (`choisir_exercice` : `#jouer`, puis
  `#jouer-depart [data-mode=localiser|nommer|chrono|sansfaute|minute]` ; les
  trois épreuves classées partagent `#chrono-depart`), plus dans le départ
  de Toucher. Puis l'en-tête (décision « En-tête ») : `15-jouer` (les cinq
  exercices, en deux groupes), `16-recherche` (« sain » : pays et communes mêlés),
  `17-recherche-pays` (le Vatican à Entrée : vol, anneau),
  `18-recherche-commune` (Saint-Denis au doigt : la carte de l'île, puis
  « Monde » ramène au monde), `19-classement` (🏆 : mes places par épreuve, « Retour » à la carte).
  Puis Sans faute et Minute (#14) sur l'Amérique du Sud :
  `20-sansfaute-faux` (deux justes, puis une erreur), `21-sansfaute-bilan`
  (« 2 d'affilée »), `22-minute-faux` (une erreur au premier toucher : la
  barre compte justes et erreurs, la jauge est la minute),
  `23-minute-bilan` (tout juste ensuite : « série vidée », « 1 erreur »).
  Hors émulateurs, leur bloc de classement lit la base en ligne : sans
  l'index de Minute (`firestore.indexes.json`), « Classement indisponible ».
  Faites après l'île : le premier usage de la recherche demande
  `/geo/reunion/noms.fr.json`, que `10-reunion` veut absent avant son choix.
  `DÉFAUT : …` et code 1 si l'en-tête du téléphone dépasse une ligne (64 px),
  si le champ de recherche fait moins de 140 px ou coupe son texte d'aide,
  s'il reste visible pendant
  une partie ou ne revient pas après, si la recherche ne montre pas le
  Vatican ou Saint-Denis, si l'île sort de l'écran ou passe sous la barre,
  si la mention manque, couvre l'île ou fait deux lignes à 384 px, si la
  zone de Nommer n'est pas au-dessus de sa barre (monde et île), si l'île
  a bougé du zoom 1 ou passe sous la barre de Nommer, si les
  boutons de Nommer n'ont pas un rouge et un vert, si un code INSEE
  (`974xx`) s'affiche, si le monde a changé, si Jouer n'a pas ses cinq
  exercices, ou si Sans faute et Minute n'ont pas leur titre ou leur bilan
  attendu. **Regarder les captures.** Les records des épreuves vivent dans
  le `localStorage` : le profil neuf du driver repart sans record.
- `--rendu` (ui) : rendu de la carte du monde (sans : celui de la page,
  canvas) ; l'île est toujours en SVG, au-dessus du monde en canvas.
  `--url` ne peut pas porter `?rendu=` (le pilote y ajoute `?mesures=0`).
- Contrat de l'île avec le pilote : `window.terramemo.carte` reste **le
  monde** (mesures, captures 1 à 9) ; `terramemo.terrain()` dit le terrain
  affiché, `terramemo.ile` (`null` avant le premier choix de l'île) donne
  `pick`, `ecran(id)` (point d'étiquette d'une commune), `rect`, `transfo`,
  `zoomer`. Ids des communes : codes INSEE (`97411` Saint-Denis, `97415`
  Saint-Paul).
- Option `--url` partout (ex. `https://terramemo-geo.web.app/`) : smoke
  et ui marchent aussi sur le site déployé.

### Mesurer (critères du J0)

```bash
python3 .claude/skills/run-terramemo/driver.py mesurer --cible local --rendu canvas            # PC, vitesse réelle
python3 .claude/skills/run-terramemo/driver.py mesurer --cible local --rendu canvas --ralenti 4  # processeur ralenti 4×
python3 .claude/skills/run-terramemo/driver.py mesurer --cible chrome --rendu canvas           # Chrome du téléphone (adb)
python3 .claude/skills/run-terramemo/driver.py mesurer --cible webview --rendu canvas          # l'APK (adb)
```

Options : `--rendu canvas|webgl|g|css` (défaut canvas, celui de la page ;
`g` et `css` : carte SVG, `canvas` et `webgl` : la carte qui tourne,
Canvas 2D ou WebGL2 ; sur
le PC, le WebGL de chrome-headless-shell est SwiftShader, logiciel : ses
images perdues ne disent rien du GPU du téléphone ; `--gpu` prend le vrai
GPU du PC, rapport suffixé `-gpu`), `--projection monde|pacifique` (en
canvas : le méridien central au chargement, « Départ » dans ⚙),
`--repetitions N` (défaut 3 : chaque répétition recharge la page et rejoue
tout), `--url` (avec `?logiciel=1` : WebGL logiciel accepté, rapport
suffixé `-logiciel`), `--cache` (garde le cache HTTP, désactivé par
défaut), `--garder-stockage` (voir ci-dessous), `--ws` (local par HTTP +
WebSocket, le chemin du téléphone), `--serie` (adb), `--out`, `--binaire`.

**Première visite, puis visites suivantes.** Avant la répétition 1, le
driver vide le stockage de l'origine mesurée (`Storage.clearDataForOrigin`,
types `indexeddb,cache_storage,service_workers,shader_cache` : le maillage
du webgl gardé en IndexedDB, un éventuel service worker et ses fichiers,
les shaders compilés gardés sur disque ; pas le `localStorage`, réglages de
l'utilisateur sans effet sur le chargement). Sur le téléphone, Chrome et
l'APK gardent sinon leurs données d'une séance à l'autre et après `adb
install -r` : la répétition 1 lirait le maillage du cache. La répétition 1
est donc une **première visite** (cache HTTP coupé, rien de gardé ; avec
`--cache` sur le téléphone, le cache HTTP des séances d'avant reste : la
répétition 1 y est « visite inconnue »), les
suivantes des **visites suivantes** (en webgl : maillage lu dans le cache
écrit à la première). Sur le PC, le profil du chromium est neuf à chaque
lancement : la répétition 1 y est toujours une première visite. Le vidage
efface TOUT l'IndexedDB de l'origine (`https://localhost` pour l'APK) : le
jour où l'appli y garde des données de l'utilisateur, `--garder-stockage`
(sur le téléphone, la répétition 1 devient « visite inconnue » ; sur le PC,
profil neuf, elle reste une première visite). Le cache des shaders en
mémoire du processus GPU, lui, survit tant que le navigateur tourne : pour
un premier lancement à froid, fermer Chrome ou l'APK avant (`adb shell am
force-stop com.android.chrome`, ou `io.github.micheldm974.terramemo`).

**Rendu webgl** : la carte s'affiche d'abord en Canvas 2D, le WebGL prend
le relais quand le maillage est prêt (`src/map/relais-webgl.ts`). Le
résumé y ajoute une ligne `[ — ] relais WebGL` (sans verdict), première
visite et suivantes à part : source du maillage
(`rapports[].webgl.maillage` : `calcul/absent` à la première visite,
`cache/lu` ensuite), durées du Worker (`maillage.worker.total_ms`,
`maillage_ms`), `temps.apres_affichage_ms` (du premier affichage au
relais), les étapes du fil principal à surveiller (`temps.etapes` :
« contexte », « nom du GPU », « premiere image ») et la plus longue.
**À `--ralenti 4`, ces durées sont trop optimistes** : le ralenti ne touche
pas le Worker (`maillage_ms` 208 à 224 ms à ×4 contre 241 à 259 à ×1),
la ligne le dit ; sur un téléphone lent, le maillage de la première visite
durerait jusqu'à ~4 fois plus. Si le WebGL est refusé (WebGL2 absent ou
logiciel, shader refusé, contexte perdu : `rapport.rendu` `canvas` et
`webgl.etape` `repli`), le driver dit « REPLI du webgl » avec
`webgl.raison` et le GPU, et écrit quand même le JSON, suffixé `-repli`
(champ `repli`) : son résumé est celui du Canvas 2D de repli. Sur le PC,
`--rendu webgl` sans `--gpu` se replie toujours (SwiftShader, logiciel
refusé), sauf avec `?logiciel=1`.

Chaque répétition : chargement de `?rendu=…&projection=…&mesures=0` (sans
panneau : sa mise à jour présenterait une image et fausserait les fins, cf.
`rapport.ts`), attente de `window.terramemo.repos` (période de l'écran
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
`circle.pastille[data-id]`, sinon `terramemo.carte.ecran(id)`, seul
chemin en canvas). En canvas, la carte reste tournée par le tour du monde :
les touchers au zoom 1 éprouvent `ecran` et `pick` sur un globe tourné
(`touchers_vises[].rotation`). Enfin `terramemo.rapport()` (v6).

Sortie : un résumé `[OK ]`/`[NON]`/`[ ? ]` (à juger) par critère et le JSON
complet (v6 : rapports v6 bruts, touchers visés, scénario et pas de rejeu,
navigateur et binaire, `code` : commit, arbre modifié ou non, et pour la
WebView les dates de l'APK installé et du fichier ; `stockage` : vidé ou
non, origine, types, erreur ; `visites` : par répétition, `premiere`,
`suivante` ou `inconnue`, le maillage du webgl (`calcul/absent`,
`cache/lu`), le rendu et la raison d'un repli ; `logiciel_accepte` :
l'adresse porte `logiciel=1`, à ne pas confondre avec `webgl.logiciel` des
rapports, WebGL refusé parce que logiciel ; `repli`) dans
`docs/mesures/j0/AAAA-MM-JJ-<cible>-<rendu>-<projection>[-x<ralenti>][-gpu][-logiciel][-repli].json`
(`-gpu` : vrai GPU du PC ; `-logiciel` : l'adresse porte `logiciel=1`,
WebGL SwiftShader accepté ; `-repli` : le webgl demandé a fini en Canvas
2D ; réécrit si relancé le même jour). **Les commiter** : ce sont les preuves
du J0. Critère changé dans le driver : `driver.py resumer FICHIER.json…
[--pourquoi …] [--sec] [--json]` recalcule le résumé sur les rapports bruts
(v3 à v6) sans refaire les mesures, réécrit le fichier (rapports intacts) et
le note dans `resume_recalcule` ; `--sec` affiche sans écrire, `--json` donne
les résumés en JSON (`tests/mesure-driver.test.ts` s'en sert pour confronter
le critère recopié dans le driver à `src/mesure/stats.ts` : changer l'un
sans l'autre casse `npm test`). Champs du rapport : `src/mesure/rapport.ts` (le contrat, qui fait
foi). Lignes du résumé, par type de geste (pincer, glisser, tourner) :

- **rendu < 1 s** : `chargement.total_ms`, première visite et suivantes à
  part (`resume.chargement_ms.par_visite`) ; le critère vaut pour le premier
  affichage, donc aussi à la première visite (verdict sur toutes). `resumer`
  relit `visites` ; dans un JSON plus ancien, la répétition 1 du PC est une
  première visite (profil neuf), celle du téléphone « inconnue ».
- **pas de saccade** (décision de l'utilisateur, 04/11/2026, registre) : un
  à-coup est une image qui tarde 25 ms ou plus (trois rafraîchissements à
  120 Hz, un et demi à 60 i/s), compté dès 21 ms (`SEUIL_ACOUP_MS` : loin de
  16,67 et 25 ms, les valeurs exactes d'un écran à 60 ou 120 Hz, l'arrondi
  et la gigue ne le font pas compter au hasard), quelle que soit la fréquence de l'écran
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
  monotone : à durée fixe, plus d'images à 120 i/s ne change rien. **Pas à
  90 Hz** : 22,2 ms (deux images) et 44,4 ms (quatre) tombent près des
  seuils (sous ± 2 ms de gigue, à-coup ~77 fois sur 100, gel ~19 fois sur
  100) et la règle n'y est plus monotone (`src/mesure/stats.ts`,
  `SEUIL_ACOUP_MS`). Ne compte que si le Galaxy A37 a un mode 90 Hz
  (question posée à l'utilisateur) ; seuils inchangés.
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

« Lance Terramemo » = ouvrir https://terramemo-geo.web.app (une fois
déployé) ou l'appli Terramemo sur le téléphone : **rien à démarrer**,
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
   (`git status`) : le JSON note le commit mesuré ; **d'abord, avec
   l'utilisateur** : l'A37 a-t-il un mode 90 Hz (Paramètres → Affichage →
   Fluidité des mouvements, ou un mode adaptatif qui y passe) ? Si oui,
   s'arrêter avant de mesurer : à 90 Hz les seuils de 21 et 46 ms comptent
   au hasard (« pas de saccade » ci-dessus), à revoir avec lui (décision
   « Critère de saccade ») ; le noter au registre dans tous les cas ;
2. mesurer Chrome dans les quatre rendus (css, g, canvas, webgl), puis
   `apk --installer` et mesurer l'APK dans les quatre (commandes
   ci-dessous) ; lire les résumés, regarder les `[ ? ]`, et en webgl la
   ligne du relais (première visite et suivantes) et un éventuel REPLI
   (« Rendu webgl sur le téléphone » ci-dessous) ;
3. « À l'œil », point 0 d'abord (le doigt monte-t-il l'écran à 120 Hz
   quand le driver ne le fait pas ?), puis les autres, dont la rotation
   (point 2) et le relais du webgl (point 8) ;
4. commiter les JSON de `docs/mesures/j0/` (les `-repli` aussi) et noter
   au registre ce que l'œil a vu, rendu par rendu ; le verdict des mesures cite chaque ligne
   (pincer, glisser, tourner = le tour du monde) de chaque critère, pas
   seulement le pincement (une fin lente peut n'être que sur le tour du
   monde) ; `adb shell svc power stayon false`.

Mesurer (même code, autre transport : `adb forward tcp:8061` vers le
socket DevTools, client WebSocket du driver) :

```bash
python3 .claude/skills/run-terramemo/driver.py serve --preview        # en arrière-plan, sur le PC
for r in css g canvas webgl; do python3 .claude/skills/run-terramemo/driver.py mesurer --cible chrome --rendu $r; done
python3 .claude/skills/run-terramemo/driver.py apk --installer        # APK de debug sur le téléphone
for r in css g canvas webgl; do python3 .claude/skills/run-terramemo/driver.py mesurer --cible webview --rendu $r; done
python3 .claude/skills/run-terramemo/driver.py mesurer --cible webview --rendu canvas --projection pacifique
```

- `chrome` : `adb forward tcp:8061 localabstract:chrome_devtools_remote`
  (Chrome lancé par `am start` si le socket manque), onglet neuf par
  `PUT /json/new`, à défaut `Target.createTarget` sur le WebSocket du
  navigateur (Chrome 156 de l'A37 répond 500 « Could not create new
  page » au PUT), page servie par le PC via `adb reverse tcp:8060
  tcp:8060` (`http://localhost:8060` est un contexte sûr sur le
  téléphone). `--url https://terramemo-geo.web.app/` mesure le site
  déployé (sans reverse). L'onglet est fermé et les redirections adb
  retirées à la fin.
- `webview` : `am start -n io.github.micheldm974.terramemo/.MainActivity`,
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

#### Rendu webgl sur le téléphone

Chaque mesure vide d'abord le stockage de l'origine (« Première visite »
plus haut) : répétition 1 = première visite (maillage calculé par le
Worker), les suivantes lisent le maillage gardé en IndexedDB. Le résumé
en donne la ligne `[ — ] relais WebGL` ; le détail est dans
`rapports[].webgl` (`EtatRelais`, `src/map/relais-webgl.ts`) :
- `etape` : `webgl` (le WebGL a pris le relais), `repli` (Canvas 2D pour
  de bon) ; `raison` : pourquoi le repli ; `gpu` : le processeur graphique
  (`UNMASKED_RENDERER_WEBGL`) ; `logiciel` : WebGL refusé parce que
  logiciel ;
- `maillage.source` / `maillage.cache` : `calcul` / `absent` à la
  première visite, `cache` / `lu` ensuite (`perime`, `erreur : …` : à
  creuser) ; `maillage.ecrit` (« gardé (… ms) » ou l'erreur) ;
  `maillage.worker` : `cle_ms`, `lecture_ms`, `analyse_ms`, `maillage_ms`,
  `total_ms` ;
- `temps.apres_affichage_ms` (du premier affichage en Canvas 2D au
  relais), `temps.contexte_ms`, `compilation_ms`, `televersement_ms`, et
  `temps.etapes[]` (`nom`, `a_ms`, `ms` : chaque tâche du fil principal,
  « contexte », « nom du GPU », « deballage », « televersement N »,
  « premiere image », « diagnostic » en repli).

À surveiller (relecture de l'assemblage, sur le PC) : **« nom du GPU »**
(une fois 110 ms au tout premier lancement du PC ; si elle est longue au
premier lancement de l'APK, piste : ne lire le nom qu'après le relais,
`lireGpu` de `src/map/relais-webgl.ts`) ;
**« contexte »** (131 à 181 ms à froid sur le PC, avant le premier
affichage) ; **« premiere image »** (47 ms à ×4 quand les triangles
viennent d'être calculés : à découper seulement si elle dépasse 46 ms sur
le téléphone, un gel). Toute étape ≥ 46 ms après le premier affichage
fige la carte une image (gel) ; la ligne du relais donne la plus longue.

**WebGL refusé** (REPLI au résumé : WebGL2 absent ou logiciel, shader
refusé, contexte perdu) : le JSON est écrit quand même, suffixé `-repli`
(champ `repli`, `webgl.raison`, `webgl.gpu`) ; son résumé est celui du
Canvas 2D de repli : au repli, la page télécharge la carte allégée (51 Ko,
décision « Chargement du rendu WebGL »), servie aux gestes dès qu'elle
arrive, comme en rendu canvas. Noter la raison et le GPU au registre : sur
ce téléphone, le webgl ne peut pas être jugé, seulement son repli.

#### Réglages de l'A37 qui changent les mesures (séance du 06/11)

- **Économie d'énergie** (`settings get global low_power` = 1, celle de
  l'utilisateur) : écran bloqué à 60 Hz (« Fluidité des mouvements » grisée)
  et processeur bridé (dessin canvas p95 9 ms contre 5 ms sans). La couper
  pour mesurer (`settings put global low_power 0`), la remettre après (`1`).
- **Fluidité des mouvements** (`settings get secure refresh_rate_mode` :
  0 Standard 60 Hz, 1 Adaptative jusqu'à 120 Hz ; l'utilisateur est en
  Standard) : à changer par l'interface (Paramètres → Écran → Fluidité des
  mouvements → Appliquer), puis la remettre.
- À 120 Hz, les gestes injectés par DevTools restent à 60 Hz dans Chrome ;
  dans l'APK ils passent à 120 Hz mais le driver y compte des à-coups (≈ 2/s,
  un gel) que le doigt n'a pas (canvas : 0 à-coup, 100 % à 120 Hz) : à
  120 Hz, juger au doigt ou par l'écran tactile, pas au driver.
- Noter les réglages d'avant et tout remettre à la fin (veille
  `screen_off_timeout`, `svc power stayon`, thème `cmd uimode night`). Le
  téléphone peut couper le débogage USB : il faut alors le réactiver à la
  main (Options de développement).

#### Au doigt, sans recopier le panneau (`outils/`)

Les gestes de l'utilisateur sont lus par DevTools pendant qu'il les fait
(page avec `?mesures=1` ; Chrome : `adb forward tcp:8061
localabstract:chrome_devtools_remote` ; APK : `…webview_devtools_remote_<pid>`) :
- `outils/lire_apk.py <sortie.json> [rendu]` : rapport de l'APK résumé par
  type de geste (période, à-coups, gels, tenue des 120 i/s), puis recharge
  la page dans `rendu` pour l'essai suivant ;
- `outils/glisses_apk.py <rendu> <sortie.json>` : glissés par l'écran
  tactile (`adb shell input swipe`, le vrai chemin du toucher : il fait
  monter l'écran à 120 Hz, DevTools non ; pas de pincement) dans l'APK ;
- `outils/iles_px.py [--url …] [--ks 1,1.5,2,3,4,8] [-v]` (sur le PC, pas
  le téléphone ; numpy, scipy et Pillow) : en canvas, captures pendant un
  glissé et au repos de 16 vues d'archipels par zoom, et les petites taches
  du geste absentes au repos, du repos absentes du geste, et du geste
  renforcées (un îlot qui s'allume pendant le geste) ; à 0 partout depuis le
  06/11 sauf une côte de l'allégée au bord de la carte au zoom 4
  (src/map/dessin.ts) ;
- `outils/images_video.py <video.mp4> [dossier]` : luminance de chaque image
  d'un `adb shell screenrecord` (H.264, lu par le chromium de playwright ;
  le ffmpeg de playwright ne lit pas le H.264), pour l'éclair blanc au
  lancement (point 4) sans l'œil de l'utilisateur.
Rapports du 06/11 : `docs/mesures/j0/doigt/` (`doigt-` : doigt de
l'utilisateur, `tactile-` : `input swipe`) et `docs/mesures/j0/adaptative/`
(driver à 120 Hz, sans économie d'énergie).

### À l'œil, avec le téléphone (après les mesures)

Noter chaque point (OK, ou ce qui est vu) dans le registre. Chrome
(`http://localhost:8060` après `adb reverse tcp:8060 tcp:8060`, que le
driver retire en fin de mesure, ou le site déployé) **puis** l'APK ; rendu
changé dans ⚙ → Rendu (la page se recharge), les quatre : `css`, `g`,
`canvas`, `webgl`.

0. **Le doigt et le driver voient-ils le même écran ?** ⚙ → « Afficher
   les mesures ». Pincer au doigt de l'Europe à la Suisse, puis glisser :
   le panneau donne `Écran … Hz (… ms)` (repos) et, par geste, « N
   à-coup(s) ≥ 21 ms (x/s)[, G gel(s) ≥ 46 ms][ : NON, saccade] · période
   P ms » (P : la période du geste ; « NON » si ce geste seul saccade, et
   sur plusieurs gestes « saccade : glisser OK, pincer NON… », le verdict
   par type ; la page ne sait pas reconnaître un tour du monde fait au
   doigt et le range dans glisser, quand le driver juge `tourner` à part :
   leurs verdicts par type peuvent donc différer, **celui du driver fait
   foi pour le J0**),
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
1. **g / css / canvas / webgl pendant un pincement** : pincer de l'Europe entière
   jusqu'à la Suisse, doigts posés, puis lever. En css la couche entière
   est agrandie par le compositeur jusqu'au lever du doigt : carte floue,
   disques des pastilles et traits des frontières grossis avec le zoom,
   puis net d'un coup au lever (coût lu dans `fin.event_timing_ms`). En g :
   net tout du long, mais saccades possibles. En canvas : net tout du long
   (redessinée à chaque image), carte allégée pendant le geste. En webgl :
   net et complet tout du long (aucune carte allégée). Dire lequel gêne le
   plus (`RENDU_DEFAUT`, src/main.ts : canvas depuis la séance du 06/11,
   décision « Rendu par défaut »).
2. **La carte qui tourne (canvas, webgl)** : au zoom 1 puis zoomé (Europe),
   glisser horizontalement, long et vite, plusieurs fois dans le même sens
   (le tour du monde), puis lentement. Le globe tourne-t-il sans à-coup,
   le point sous le doigt reste-t-il sous le doigt ? La **carte allégée**
   se voit-elle pendant le mouvement (canvas : côtes simplifiées ; les
   petites îles y sont tracées comme au repos depuis le 06/11 : un îlot qui
   s'allume pendant le geste est un défaut, `outils/iles_px.py`), et le
   passage à la carte complète au lever (saut, flou,
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
7. **Touchers au doigt** (les quatre rendus) : micro-États (Vatican,
   Saint-Marin, Monaco) et Caraïbes au zoom 1 puis zoomés, dans la vue
   Toucher ; un glissé léger du doigt (moins de 10 px) doit compter comme
   toucher au point visé.
8. **Le relais du webgl** (Chrome puis l'APK) : à l'ouverture, la carte
   s'affiche en Canvas 2D puis le WebGL prend le relais. **Le passage se
   voit-il** (saut, éclair, traits ou couleurs qui changent, image figée) ?
   D'abord en **première visite** : effacer les données du site (Chrome :
   paramètres du site, depuis l'icône à gauche de l'adresse ; APK :
   Paramètres → Applications → Terramemo → Stockage → Effacer les
   données ; dans Chrome, `?rendu=webgl&maillage=0` recalcule aussi le
   maillage sans lire le cache), puis ouvrir en webgl : le maillage se calcule,
   le relais tarde (~0,5 s sur le PC, plus sur le téléphone) ; glisser
   pendant ce temps : la carte suit-elle, le relais casse-t-il le geste ?
   Puis les **visites suivantes** (recharger) : relais plus rapide. Si le
   driver a dit REPLI, faire un pincement et un tour du monde dans le
   rendu de repli (Canvas 2D, carte allégée pendant les gestes) : fluide ?

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
python3 .claude/skills/run-terramemo/driver.py apk                # npm run build, npx cap sync android, gradlew assembleDebug
python3 .claude/skills/run-terramemo/driver.py apk --installer    # puis adb install -r
```

APK : `android/app/build/outputs/apk/debug/app-debug.apk`. Le driver met
`JAVA_HOME` sur le JDK 21 et `ANDROID_HOME` sur `~/Android/Sdk` (ou
`android/local.properties`, ignoré par git, avec
`sdk.dir=/home/delhomme/Android/Sdk`). En CI : `.github/workflows/android.yml`
(à la demande ou sur tag `v*`, APK en artefact).

## Données de La Réunion

`npm run geodata:reunion` (`geodata/reunion.mjs`, à part de `build.mjs`)
télécharge l'archive de l'IGN (ADMIN EXPRESS COG CARTO, GeoPackage du
territoire REU, `.7z`) dans `geodata/raw/ign/` (ignoré par git, absent d'un
worktree neuf : le script la retélécharge), la vérifie contre
`geodata/reunion.lock.json` et régénère `public/geo/reunion/` (octet pour
octet). Demande `7z` et Node 24 (`node:sqlite`) ; pas la CI, qui ne lit que
les sorties versionnées (`tests/donnees-reunion.test.ts`).

## Classements : émulateurs et règles

```bash
npm run test:regles                                                           # règles Firestore sur l'émulateur (aussi en CI)
npx firebase emulators:start --only firestore,auth --project terramemo-geo  # Firestore 8062, Auth 8063, en arrière-plan
```

Puis le site de dev avec `?emulateurs` (`http://localhost:8060/?emulateurs#chrono`) :
comptes et classements y vont aux émulateurs (serveur de dev seulement ;
le site construit parle toujours au vrai projet). Les deux ne tournent
pas ensemble : `test:regles` lance son propre émulateur sur 8062. Base
d'émulateur vidée par `curl -X DELETE
"http://127.0.0.1:8062/emulator/v1/projects/terramemo-geo/databases/(default)/documents"`.
Java 21+ requis (celui du PC suffit). L'émulateur écrit
`firestore-debug.log` dans le dossier courant (ignoré par git).

Chrono de l'île jusqu'au classement, par le pilote (vérifié le 06/11) : le
choix `#chrono-depart .essai-serie[data-serie="reunion"]`, chaque réponse
juste par `terramemo.ile.ecran(<cible>)` (cible :
`#barre-chrono .essai-consigne` `data-cible`), puis le pseudo dans
`#chrono-bilan .chrono-pseudo-form input` et son bouton ; le classement de
l'épreuve et le général (`#classement-btn` de l'en-tête, vue `#classement`,
somme des records de toutes les séries) montrent le score. **Attendre ≥ 0,4 s avant chaque toucher** : les
règles refusent moins de 0,2 s par question (`temps_ms >= questions ×
200`), et un tel score n'est même pas envoyé (`vraisemblable()`,
`src/epreuve/chrono.ts`, mêmes bornes que `firestore.rules`) ; il reste
le record de l'appareil, mais le général et un nouveau pseudo prennent
pour sa série le meilleur score publiable (`recordPubliable`), et l'avis
`.chrono-classement-avis` (sous le pseudo) dit « Score refusé par le
classement… ». Chaque score part seul : un refus n'emporte ni les autres
séries ni le général ; un envoi échoué (hors ligne) a son propre avis,
« Score non publié (hors ligne ?)… ». Un 403 sur `documents:commit` pour
un score qui ne bat pas la place n'est pas un refus : la place est celle
du **pseudo** (en minuscules), partagée par tous ses appareils, et
`publier()` relit la place pour s'en assurer.

Publier sans jouer (serveur de dev seulement) : les modules s'importent
depuis la page, `await import('/src/vues/classement.ts')` (et
`/src/epreuve/chrono.ts`, `/src/epreuve/classement.ts`) ; un record posé
par `enregistrerPartie(localStorage, …)` part par `publierTout(pseudo)`.
Chaque `driver.Session('local')` a un profil neuf, donc un autre compte
anonyme : deux sessions sous le même pseudo = deux appareils, une place.

## Déploiement (Firebase Hosting, projet `terramemo-geo`)

```bash
npm run build && npx firebase deploy --only hosting
python3 .claude/skills/run-terramemo/driver.py smoke --url https://terramemo-geo.web.app/
npx firebase deploy --only firestore    # après un changement de firestore.rules ou des index
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
  du moteur de rendu (ni compositeur, ni rastérisation, ni GPU, **ni les Web
  Workers**) : le PC avantage le rendu `css`. En webgl, le maillage se fait
  dans un Worker : à ×4, `maillage.worker.maillage_ms` vaut 208 à 224 ms
  contre 241 à 259 à ×1 (relecture de l'assemblage). Toutes les durées du
  relais à ×4 (`apres_affichage_ms` de la première visite surtout) sont
  donc trop optimistes : sur un téléphone lent, le maillage de la
  première visite durerait jusqu'à ~4 fois plus. Seul le téléphone le dit. En canvas, à l'inverse, le PC sans GPU
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
- Arrêter un serveur : `fuser -k -n tcp 8060`, jamais `pkill -f` (la tâche
  de fond de `serve` finit alors en code 137 : attendu). Émulateurs :
  `fuser -k -n tcp 8062 8063`.
- Le mode Nommer est gardé dans le `localStorage`
  (`terramemo.toucher.mode`) : un profil réutilisé (téléphone, `--cible
  chrome`) peut ouvrir Toucher en Nommer ; le profil neuf du driver part en
  Localiser, et `ui` le remet après ses captures.
- Petits écrans (320 × 560) : la mention de l'IGN passe sur deux lignes
  (sous ~370 px) et la barre de Nommer couvre le bas de l'île, d'où un vol
  vers la commune demandée (`doitCadrer`) ; à 384 px (Galaxy A37), l'île
  tient entière au-dessus de chaque barre.

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
