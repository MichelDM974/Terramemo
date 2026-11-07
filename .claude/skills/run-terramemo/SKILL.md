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
sur le téléphone, `mesurer` vide les caches de l'origine mesurée, jamais
le journal ni le compte, cf. « Première visite »), sauf les **classements du Chrono** : Firestore et
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
python3 .claude/skills/run-terramemo/driver.py seance             # la séance du J1a seule (ui_seance), sur un journal vide
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
- `ui` écrit `1-carte`, `1b-zoom` (`ui_zoom`, #23 : sur PC, +, +, − à la
  vraie souris puis les touches + et −, zoom attendu 1 → 2 → 4 → 2 → 4 → 2,
  « toute la carte » ramène à 1 ; cachés dans Jouer ; sur le téléphone,
  seulement « cachés »), `2-pays-touche` (Suisse), `3-toucher-faux` et
  `4-toucher-juste` (l'Essai J0, lancé depuis ⚙ : `#reglage-essai
  [data-mode=localiser]`), `5-saisie` (« sai » dans le champ réglé),
  `6-reglages` (⚙, avec l'Essai J0), `6b-credits`, `6c-credits-bas` et
  `6d-credits-licences` (#20 : textes des licences dépliés, lus en entier)
  (`ui_credits` : l'écran Crédits par « Crédits et licences » de ⚙, en
  haut puis en bas ; `DÉFAUT` s'il manque une donnée, une bibliothèque,
  la police ou la date de l'IGN, ou si « Retour » ne ramène pas à la
  carte), `7-classe-ams-epreuves` (Jouer ›
  Classé › Pays › Amérique du Sud : les trois épreuves, sans record sur le
  profil neuf), `8-chrono-faux` et `9-chrono-bilan` (l'Amérique du Sud
  jouée jusqu'au bilan, ~25 s) dans `--out`
  (`/tmp/terramemo-captures`), et affiche les textes lus (barre,
  rétroaction, liste de la Saisie, bilan du Chrono). Puis La Réunion et
  Nommer (#15) : `10-reunion` (Toucher → La Réunion : l'île entière, barre
  en bas, mention de l'IGN), `10b-zoom-ile` (`ui_zoom` sur l'île, en SVG), `11-reunion-faux` (Saint-Paul touché pour
  Saint-Denis : « Passer » jusqu'à Saint-Denis, l'ordre étant tiré au
  hasard), `12-nommer-monde` (Nommer, Europe : zone en accent, 4 boutons,
  prise une fois le vol fini : `attendre_fin_vol`, transformation stable),
  `13-nommer-reunion-retro` (mauvais choix rouge, bon vert),
  `14-chrono-reunion` (première question, jauge) ; il vérifie le monde au
  retour (la Carte, `pick` sur la Suisse = CHE).
  Chaque partie se lance par l'arbre de Jouer (décision « Écran Jouer »,
  `jouer_partie(page, mode, serie)` : `#jouer`, puis dans `#jouer-panneau`
  `[data-branche=entrainement|classe]`, `[data-sujet=pays|communes]`,
  `[data-serie=<id>]` (sauf l'île : niveau sauté), et `[data-mode=localiser|
  nommer|chrono|sansfaute|minute]`, qui lance la partie ; `jouer_jusqua`
  s'arrête aux exercices). Plus de départ dans Toucher ni dans les épreuves :
  `#toucher` ou `#chrono` sans partie renvoie à Jouer. Puis l'en-tête
  (décision « En-tête ») : `16-recherche` (« sain » : pays et communes mêlés),
  `17-recherche-pays` (le Vatican à Entrée : vol, anneau),
  `18-recherche-commune` (Saint-Denis au doigt : la carte de l'île, puis
  « Monde » ramène au monde), `19-classement` (🏆 : mes places par épreuve, « Retour » à la carte).
  Puis Sans faute et Minute (#14) sur l'Amérique du Sud :
  `20-sansfaute-faux` (deux justes, puis une erreur), `21-sansfaute-bilan`
  (« 2 d'affilée »), `22-minute-faux` (une erreur au premier toucher : la
  barre compte justes et erreurs, la jauge est la minute),
  `23-minute-bilan` (tout juste ensuite : « série vidée », « 1 erreur »).
  Enfin l'arbre de Jouer (#18), après les épreuves pour en avoir les
  records : `15-jouer` (« Rejouer · Minute · Amérique du Sud » et son
  record, puis Entraînement et Classé), `15b-classe-sujets` (Pays, Communes),
  `15c-classe-pays-series` (Tous les pays puis les six continents),
  `15d-classe-pays-ams-epreuves` (les trois épreuves avec leurs records,
  les règles ouvertes par `#jouer-aide`), `15e-entrainement-communes`
  (Trouver et Reconnaître sur La Réunion, le niveau des séries sauté) ; il
  y vérifie aussi le retour arrière et `#jouer-haut` (« ‹ ») d'un niveau,
  une adresse invalide (`#jouer/classe/pays/Atlantide` → `#jouer/classe/pays`)
  et « × » (`#jouer-fermer`) qui ramène à la carte.
  Hors émulateurs, leur bloc de classement lit la base en ligne : sans
  l'index de Minute (`firestore.indexes.json`), « Classement indisponible ».
  Faites après l'île : le premier usage de la recherche demande
  `/geo/reunion/noms.fr.json`, que `10-reunion` veut absent avant son choix.
  `DÉFAUT : …` et code 1 si les boutons de zoom manquent sur PC, se montrent
  sur le téléphone ou dans Jouer, sont couverts ou ne zooment pas comme
  attendu (monde et île), si l'en-tête du téléphone dépasse une ligne (64 px),
  si le champ de recherche fait moins de 140 px ou coupe son texte d'aide,
  si Jouer n'est pas ▶ seul à 360 px et moins (#19 : nom masqué mais lu ;
  `ui --width 320` pour l'exercer) ou perd son nom au-delà,
  s'il reste visible pendant
  une partie ou ne revient pas après, si la recherche ne montre pas le
  Vatican ou Saint-Denis, si l'île sort de l'écran ou passe sous la barre,
  si la mention manque, couvre l'île ou fait deux lignes à 384 px, si la
  zone de Nommer n'est pas au-dessus de sa barre (monde et île), si l'île
  a bougé du zoom 1 ou passe sous la barre de Nommer, si les
  boutons de Nommer n'ont pas un rouge et un vert, si un code INSEE
  (`974xx`) s'affiche, si le monde a changé, si Sans faute et Minute n'ont
  pas leur titre ou leur bilan attendu, si ⚙ n'a pas l'Essai J0, si Jouer
  n'a pas ses deux branches, Classé › Pays ses 7 séries dans l'ordre ou la
  série ses 3 épreuves (et leurs records), si Communes ne saute pas la série,
  si une série « essai » s'y montre, si le retour arrière, « ‹ », une
  adresse invalide ou « × » mènent ailleurs, si `#chrono` ou `#toucher`
  tapés ne mènent pas à Jouer, si « Abandonner » ne ramène pas aux
  exercices de la série avec « Partie abandonnée », si « Autre série » ne
  mène pas aux séries (sur l'île : à ses exercices), si « × » ne ferme pas
  Jouer après l'un d'eux (`ui_jouer_parties`), et si le panneau de Jouer
  déborde (320 px compris), passe 560 px, a un bouton sous 48 px (« ‹ » et
  « × » sous 44), un bouton en bleu plein ou un nom coupé au milieu d'un
  mot (`panneau_jouer` ; « Entraînemen / t » à 320 px ne déborde pas : seul
  ce contrôle le voit, `ui --width 320` pour l'exercer). **Regarder les captures.** Les records des épreuves vivent dans
  le `localStorage` : le profil neuf du driver repart sans record.
- Séance du J1a (#2), en dernier dans `ui` (`ui_seance`) ou seule :
  `driver.py seance [--width 384] [--out …]` (profil neuf, journal vide).
  `30-revision-du-jour` (Entraînement : `#jouer-revision`, « 5 nouveaux »),
  `31-apprendre-qcm` (Apprendre sur l'Europe : QCM, `#nommer-connu`),
  `32-apprendre-rappel-cadre` (rappel cadré sur la grappe, zoom ≥ 1,5),
  `33-apprendre-rappel-faux`, `34-apprendre-bilan` ; puis
  `?horloge=1` (le lendemain : **serveur de développement seulement**,
  sauté en `--preview`) : `35-lendemain-revision` (« 11 à revoir · 9
  nouveaux » : 5 pays, 6 communes), `36-carte-retournee` (« Révéler » touché), `37-revision-bilan`
  (arrêtée par « Terminer » au QCM de la grappe suivante). « Je connais
  déjà » au premier QCM, un QCM raté exprès (il revient), le premier rappel
  touché faux (sa reprise en fin de séance), réponses par position
  (`position_visible` : pastille, point d'étiquette, sinon le premier point
  de la partie visible où `pick` le désigne : la Russie cadrée avec
  l'Europe de l'Est), 0,4 s avant chaque toucher, la fin du vol de
  cadrage attendue avant chaque Trouver (`attendre_fin_vol`). Le journal se lit dans
  la page (`COMPTER_JOURNAL` : `count` du magasin `evenements` de
  `terramemo-journal`). `DÉFAUT` si la ligne manque ou n'a pas ses
  comptes, si Apprendre n'est pas en tête des exercices, si le rappel
  n'est pas cadré, si un pays touché à sa position n'est pas juste, s'il
  manque la ligne « Revient dans… » / « À revoir aujourd'hui », si le
  journal n'a pas un événement par réponse (QCM, rappel, reprise, carte
  retournée ; « Je connais déjà » n'en écrit pas), si le bilan n'a pas
  son titre et « Nouveaux » / « Révisions : n/m du premier coup » ou parle
  de points, si le bilan d'Apprendre n'a pas « Autre série », si « Carte » ne mène pas à l'accueil, si la ligne ne dit pas
  « À jour » après la grappe du jour, si « Rejouer » ne relance pas
  Apprendre, si la révision ne s'ouvre pas en `#toucher` ou si le retour
  arrière ne revient pas à Entraînement, et si une requête part vers
  Firebase (Firestore, Auth) pendant une séance.
- Carte de la mémoire et communes (#2, `ui_memoire`, `ui_apprendre_reunion`,
  dans `ui_seance`) : `38-accueil-memoire` (l'accueil après Apprendre :
  légende `#legende-memoire` « Jamais vu · faible → maîtrisé · N/195
  maîtrisés », pays appris teintés), `39-accueil-pays-vu` (un pays de la
  grappe touché : « Vu N fois · revient dans N j »), le réglage de ⚙
  (`#reglage-memoire`) coupé puis remis, `40-partie-sans-teinte` (Trouver
  sur l'Europe) ; le même jour (les communes ont leur propre budget, une
  grappe de pays et une de communes possibles le même jour) :
  `41-reunion-qcm`, `42-reunion-rappel`, `43-reunion-bilan` (Apprendre
  sous La Réunion jusqu'au bilan), `44-ile-memoire` (l'île par la recherche, teintée,
  « N/24 maîtrisés »). Zones teintées lues par
  `terramemo.carte.teintes()` / `terramemo.ile.teintes()` (`TEINTES_POSEES`,
  aussi à chaque question de séance). `DÉFAUT` si la légende manque, si
  rien n'est teinté après Apprendre, si un pays appris touché n'a pas
  « Vu N fois », si le réglage coupé laisse une teinte, si une teinte
  reste pendant une partie ou une séance, si Apprendre sous La Réunion ne
  va pas au bilan le jour d'une grappe de pays, si son bilan ou son
  journal manque, si l'île n'est pas teintée à l'accueil, ou si la
  Révision du jour n'est pas « À jour » après les deux grappes (elle ne
  finit qu'une grappe de communes commencée, sans en ouvrir une).
- `--rendu` (ui) : rendu de la carte du monde (sans : celui de la page,
  canvas) ; l'île est toujours en SVG, au-dessus du monde en canvas.
  `--url` ne peut pas porter `?rendu=` (le pilote y ajoute `?mesures=0`).
- Carte de la mémoire (#2) : `?teintes=demo` teinte chaque pays jouable
  du monde d'un seau 0 à 4 tiré de son id (`teintesDemo`,
  `src/map/teintes.ts` : le même à chaque chargement), dans tout rendu,
  pour les captures et les mesures de la carte teintée (couleurs
  `--memoire-0` à `4` de `src/carte.css`). Crochet d'essai : les teintes
  restent pendant les parties. Au pilote, `terramemo.carte.teinter({FRA: 3})`
  (ou `null`) et `terramemo.carte.teintesDemo()` ; le dessin qui suit
  (`dessin()` : `carte: true`, `ms`) est le coût d'un changement de
  teintes. Mesure : `mesurer --url "http://localhost:8060/?teintes=demo"`
  (le driver y ajoute `&rendu=…`), avec `--out` à part pour ne pas
  écraser le rapport du jour sans teintes.
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
driver vide les caches du chargement pour l'origine mesurée
(`vider_premiere_visite`) : `Storage.clearDataForOrigin` types
`cache_storage,service_workers,shader_cache` (un éventuel service worker
et ses fichiers, les shaders compilés gardés sur disque), puis la seule
base IndexedDB `terramemo` (maillage du webgl, `BASES_VIDEES`) par
`IndexedDB.deleteDatabase`, qui ferme de force ses connexions et demande
un document de l'origine : le driver charge d'abord `geo/LICENSE-CLDR.txt`
(page du site sans script). La connexion à l'origine reste alors ouverte :
la répétition 1 n'a ni DNS, ni TCP, ni TLS, et son chargement est un peu
optimiste (négligeable en local, ~100-300 ms de TLS sur le site en ligne
depuis le téléphone) ; `stockage.connexion_chaude` le note. **Jamais** le type `indexeddb` ni `all` ni le
`localStorage` : la base `terramemo-journal` (journal des réponses),
`firebaseLocalStorageDb` (compte anonyme), toute autre base et les clés
`terramemo.*` (appareil, records, pseudo, réglages) restent ; leur
disparition, ou la base du maillage restée, met une erreur dans
`stockage` (répétition 1 alors « visite inconnue » sur le téléphone).
`tests/mesure-driver.test.ts` le vérifie. Sur le téléphone, Chrome et
l'APK gardent sinon leurs données d'une séance à l'autre et après `adb
install -r` : la répétition 1 lirait le maillage du cache. La répétition 1
est donc une **première visite** (cache HTTP coupé, rien de gardé ; avec
`--cache` sur le téléphone, le cache HTTP des séances d'avant reste : la
répétition 1 y est « visite inconnue »), les
suivantes des **visites suivantes** (en webgl : maillage lu dans le cache
écrit à la première). Sur le PC, le profil du chromium est neuf à chaque
lancement : la répétition 1 y est toujours une première visite.
`--garder-stockage` ne vide rien du tout (sur le téléphone, la répétition 1
devient « visite inconnue » ; sur le PC, profil neuf, elle reste une
première visite). Un nouveau cache qui change le chargement entre dans
`STOCKAGE_VIDE` ou `BASES_VIDEES` ; une donnée de l'utilisateur, jamais.
Le cache des shaders en
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
non, origine, types, bases supprimées et gardées, nombre de clés du
`localStorage` gardées, `connexion_chaude` (connexion ouverte par la page
sans appli avant la répétition 1), erreur ; `visites` : par répétition, `premiere`,
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
  indicatif. Verdict sur le maximum, **indicatif sur le téléphone** (décision
  « Critère du toucher », 06/11) : un toucher injecté par DevTools est
  horodaté à sa réception, puis le navigateur attend ~17 à 20 ms (réponse
  mojo) avant `ForwardEmulatedTouchEvent`, attente qu'un doigt n'a pas. Le
  critère du J0 est la médiane < 100 ms par le vrai chemin d'Android :
  `outils/touchers_reels.py` (APK 72 ms, Chrome 80 le 06/11, canvas, 60 Hz).
- **pays touchés justes** : `pick` de la page = pays visé.

## Chemin humain

« Lance Terramemo » = ouvrir https://terramemo-geo.web.app (une fois
déployé) ou l'appli Terramemo sur le téléphone : **rien à démarrer**,
pas de serveur. Pour essayer le code non déployé sur le PC : `serve`, puis
http://localhost:8060.

## Journal de l'appareil : sauver, restaurer

```bash
python3 .claude/skills/run-terramemo/driver.py sauver_journal                 # APK (WebView) par adb : ~/Sauvegardes/terramemo/journal-{date}.json
python3 .claude/skills/run-terramemo/driver.py sauver_journal --cible chrome  # le site (terramemo-geo.web.app) dans Chrome du téléphone
python3 .claude/skills/run-terramemo/driver.py restaurer_journal [FICHIER]    # ajoute les événements valides (défaut : la sauvegarde la plus récente)
```

(`sauver-journal` et `restaurer-journal` marchent aussi.) Étude du J1b, § 8 :
**avant toute installation d'APK sur l'A37**, et `apk --installer` le fait
de lui-même pour une appli déjà installée (pas d'installation si la
sauvegarde échoue ; `--sans-sauvegarde` seulement si l'appli en place ne
démarre plus). De jour, l'utilisateur présent : l'A37 est verrouillé par
code la nuit (`-s RFGL606Q5WM` s'il y a plusieurs appareils).

- **Lecture brute** de la base `terramemo-journal` de l'origine
  (`Runtime.evaluate`, `getAll` sans filtre) : l'APK de debug a la WebView
  inspectable ; Chrome lit depuis `geo/LICENSE-CLDR.txt` de l'origine, où
  rien de l'appli ne tourne. La base est ouverte **sans version**, et
  jamais créée si elle manque (`onupgradeneeded` annulé) : une base vide
  sans magasin casserait l'appli. Texte transféré en morceaux de 400 000
  caractères, en JSON ASCII (rien ne se coupe au milieu d'un caractère).
- **Invalides comptés** par la vraie règle de l'appli, `probleme()` de
  `src/srs/journal.ts`, appliquée sur le PC
  (`outils/valider_journal.mjs`, empaquetée à la volée par rolldown, celui
  de Vite) : l'APK d'avant le lot 0 ne l'expose pas. Ils restent dans la
  sauvegarde.
- Fichier : `journal-{date}.json`, puis `-2`, `-3`… le même jour, **jamais
  écrasé**, droits 600, relu après écriture. Il garde aussi l'origine, la
  version de l'appli et de la base, les noms des bases et le localStorage
  de l'origine (pseudo, records, id de l'appareil), pour mémoire : la
  restauration ne remet que les événements.
- **Restauration** : chaque événement valide dans sa propre transaction
  (un échec n'emporte pas les autres), `add` seul (un id déjà gardé n'est
  pas réécrit) ; elle liste les écartés et leur raison, puis recharge
  l'appli (WebView), qui rejoue son journal. Base absente (appli jamais
  ouverte depuis l'installation) : l'ouvrir une fois, puis relancer.
- « aucun téléphone prêt » juste après une installation : le débogage USB
  décroche parfois ; le rallumer sur le téléphone.

### Mesure des pastilles (Q3 du J1a, #2)

```bash
python3 .claude/skills/run-terramemo/outils/pastilles.py --sauver                 # APK : sauver_journal, puis la mesure
python3 .claude/skills/run-terramemo/outils/pastilles.py --sauver --cible chrome  # le site dans Chrome du téléphone
python3 .claude/skills/run-terramemo/outils/pastilles.py                          # sans téléphone : la dernière sauvegarde de chaque origine
python3 .claude/skills/run-terramemo/outils/pastilles.py FICHIER... --depuis 07/11 --json
```

Q3 (`docs/questions-j1a.md`, « A, mesurer d'abord ») : après la semaine
d'usage (13/11), la part des réponses justes « par pastille » des
micro-États au zoom faible dit s'il faut B (disque plus petit quand il est
posé sur un voisin) ou C (zoom minimal en séance). L'outil lit les
sauvegardes de `sauver_journal` (une de plus à chaque `--sauver`, jamais
écrasée ; sans fichier nommé, la plus récente de chaque origine par
`sauve_le`, APK et site fusionnés sans doublon d'id, celles du PC, cible
`local`, écartées) et compte les réponses « où est » au toucher, en trois
groupes : notées par FSRS (rappel, révision), reprises (note null, la fiche
revenue en fin de séance), parties libres ; ni QCM ni carte retournée
(fiches `:nommer`), communes à part, invalides de la sauvegarde écartés.
Par tranche de zoom (`--tranches 1.5,3,6,12` ; 1 = le monde entier à
l'écran, plus de pixels en paysage, d'où le compte par appareil) :
réponses, % de justes, part de chaque `via` parmi les justes. La ligne
« => Q3 » ne compte que les micro-États (`micro` de `public/geo/pays.json`)
sous `--faible` (3), en deux groupes : disque posé sur un pays (micro-État
à voisins terrestres : Vatican, Saint-Marin, Monaco, Liechtenstein…), le
biais que vise B, et disque en mer (îles, où « par pastille » est la règle ;
Malte y est rangée) ; tous les pays en repère. Puis chaque micro-État
répondu, sa part par pastille au zoom faible et son zoom médian. Le seuil
qui ferait choisir B ou C reste à l'utilisateur. `--depuis JJ/MM` : jour
local de chaque réponse (ts + tz). Essayé sur l'A37 le 07/11 (APK : 10
événements ; site dans Chrome : vide).
Testé par `tests/pastilles-outil.test.ts` (journal fabriqué).

**Drapeau `terramemo.sans-synchro`** (`src/sync/drapeaux.ts`) : chaque
commande qui ouvre une page (smoke, ui, seance, mesurer, sauver_journal,
restaurer_journal) le pose sur l'origine qu'elle pilote, avant toute
action (`Session.couper_synchro`), et le retire à la fin, même après une
erreur, un Ctrl-C ou un `kill` (SIGTERM). Il coupe envois et lectures de
`joueurs/` (J1b : le profil dès le lot 2, les lots des séances au lot 3). S'il n'a pas pu être retiré (USB
débranché en cours), le driver écrit « ATTENTION : … RESTÉ POSÉ » : relancer
une commande sur l'appareil (`sauver_journal` suffit), ou, dans Chrome,
ouvrir l'adresse avec `?sans-synchro=0`. `?sans-synchro` dans l'adresse
coupe la page seule, sans rien garder. Comptes cachés (jusqu'au lot 8) :
`?comptes` les montre et s'en souvient (`terramemo.comptes`), `?comptes=0`
les recache ; toujours visibles au serveur de dev.

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

Chaque mesure vide d'abord les caches de l'origine (« Première visite »
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
- `outils/touchers_reels.py <chrome|webview> <sortie.json> [--url …]` :
  les touchers du pilote (vue Carte, zoom 1) par `adb shell input tap`, le
  vrai chemin d'un doigt, et leur Event Timing lu dans la page ; verdict
  « Critère du toucher » (médiane < 100 ms). Mesures du 06/11 :
  `docs/mesures/j0/toucher/` (avant et après la couche du dessus) ;
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
   D'abord en **première visite**, sans perdre de données pendant l'usage
   réel : dans Chrome, ouvrir avec `?rendu=webgl&maillage=0` (maillage
   recalculé sans lire le cache) ; dans l'APK, pas de chemin au doigt sans
   perte : sa première visite se juge par la répétition 1 de `driver.py
   mesurer --rendu webgl`, qui ne vide que la base `terramemo` (cache du
   maillage). Hors usage réel seulement, « Effacer les données » (Chrome :
   paramètres du site, depuis l'icône à gauche de l'adresse ; APK :
   Paramètres → Applications → Terramemo → Stockage) donne aussi une
   première visite, mais efface le journal des réponses et le compte
   anonyme. Puis ouvrir en webgl : le maillage se calcule,
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
python3 .claude/skills/run-terramemo/driver.py apk                # npm run build, npx cap sync android, relevé Android vérifié, gradlew assembleDebug
python3 .claude/skills/run-terramemo/driver.py apk --installer    # puis sauver_journal de l'appli en place, et adb install -r
```

**Aucune installation sur l'A37 avant le 13/11/2026** (semaine d'usage du
J1a, ticket #2 ; étude du J1b, § 8).

APK : `android/app/build/outputs/apk/debug/app-debug.apk`. Le driver met
`JAVA_HOME` sur le JDK 21 et `ANDROID_HOME` sur `~/Android/Sdk` (ou
`android/local.properties`, ignoré par git, avec
`sdk.dir=/home/delhomme/Android/Sdk`). En CI : `.github/workflows/android.yml`
(à la demande ou sur tag `v*`, APK en artefact).

**Signature** (décision « Signature de l'APK », 06/11) : une seule clé signe
tous les APK, le « debug » compris (WebView inspectable, signé par elle). Elle
n'est jamais dans le dépôt : `~/Sauvegardes/terramemo/cle-apk/` (`terramemo.jks`,
`cle.properties`, droits 600). Le driver passe ce fichier à Gradle par
`TERRAMEMO_SIGNATURE` (`android/app/build.gradle`, `signingConfigs.stable`),
puis vérifie le certificat de l'APK (`apksigner`, `EMPREINTE_APK` du driver,
SHA-256 `4F9CD6CE…98B8CB`) et **refuse `--installer`** si ce n'est pas la clé
stable : un APK signé autrement ne remplace l'appli qu'après une
désinstallation, qui efface le journal (IndexedDB) et le compte anonyme. La CI
lit les secrets `TERRAMEMO_KEYSTORE_B64` (le `.jks` en base64) et
`TERRAMEMO_KEYSTORE_PASSWORD` (magasin et clé, alias `terramemo`), échoue s'ils
manquent et vérifie le même certificat. Les poser (depuis `Terramemo/`) :
`base64 -w0 ~/Sauvegardes/terramemo/cle-apk/terramemo.jks | gh secret set
TERRAMEMO_KEYSTORE_B64` puis `grep ^storePassword= ~/Sauvegardes/terramemo/cle-apk/cle.properties
| cut -d= -f2 | tr -d '\n' | gh secret set TERRAMEMO_KEYSTORE_PASSWORD`. Clé
perdue = plus de mise à jour sans désinstaller : garder la copie de
`~/Sauvegardes` ailleurs que sur ce PC.

## Données de La Réunion

`npm run geodata:reunion` (`geodata/reunion.mjs`, à part de `build.mjs`)
télécharge l'archive de l'IGN (ADMIN EXPRESS COG CARTO, GeoPackage du
territoire REU, `.7z`) dans `geodata/raw/ign/` (ignoré par git, absent d'un
worktree neuf : le script la retélécharge), la vérifie contre
`geodata/reunion.lock.json` et régénère `public/geo/reunion/` (octet pour
octet). Demande `7z` et Node 24 (`node:sqlite`) ; pas la CI, qui ne lit que
les sorties versionnées (`tests/donnees-reunion.test.ts`).

## Classements et comptes : émulateurs et règles

```bash
npm run test:regles                                                           # règles Firestore sur l'émulateur (aussi en CI)
npm run test:comptes                                                          # comptes e-mail, profil, envoi et suppression (J1b) sur les émulateurs Auth et Firestore (aussi en CI)
npx firebase emulators:start --only firestore,auth --project terramemo-geo  # Firestore 8062, Auth 8063, en arrière-plan
```

Puis le site de dev avec `?emulateurs` (`http://localhost:8060/?emulateurs#jouer/classe`) :
comptes et classements y vont aux émulateurs (serveur de dev seulement ;
le site construit parle toujours au vrai projet). Les deux ne tournent
pas ensemble : `test:regles` lance son propre émulateur sur 8062. Base
d'émulateur vidée par `curl -X DELETE
"http://127.0.0.1:8062/emulator/v1/projects/terramemo-geo/databases/(default)/documents"`.
Java 21+ requis (celui du PC suffit). L'émulateur écrit
`firestore-debug.log` dans le dossier courant (ignoré par git).

**Comptes (J1b, lot 1)** : `src/sync/comptes.ts` (création, lien de
l'anonyme, connexion, oubli, mot de passe, session perdue), vue
`src/vues/compte.ts` chargée à la demande (⚙ › Compte, `#compte`), visible
au serveur de dev ou avec `?comptes` (`src/sync/drapeaux.ts`). Au site de
dev avec `?emulateurs` et l'émulateur Auth lancé, tout passe à
l'émulateur ; e-mails « envoyés » lisibles par `curl
http://127.0.0.1:8063/emulator/v1/projects/terramemo-geo/oobCodes` (le
projet passé à `emulators:start`, pas celui de la config du site).
`npm run test:comptes` lance ses propres émulateurs Auth et Firestore
(projet `demo-terramemo`) : 8062 et 8063 doivent être libres (donc jamais
en même temps que `test:regles`), et il vide comptes et base à chaque
test ; ses fichiers (comptes, profil, envoi, suppression) passent l'un après l'autre
(`--no-file-parallelism`), car chacun vide les comptes de l'émulateur.
`window.terramemo.comptes()` rend l'état, les claims du dernier jeton
(`identities`, `sign_in_provider`, S16) et les dix dernières erreurs brutes
(le message anglais ne s'affiche jamais) ; `null` tant qu'un invité n'a pas
ouvert `#compte` (Firebase pas chargé). Un mot de passe changé ne révoque
que les jetons émis avant sa seconde : dans un essai, attendre 1 s entre la
connexion et le changement, sinon l'autre appareil ne passe pas en session
perdue.

**Profil (J1b, lot 2)** : `joueurs/{uid}` (pseudo et records du compte,
`src/sync/profil.ts`), lu et fusionné à chaque connexion et à chaque
ouverture de l'appli d'un compte, écrit par transaction quand l'appareil a
mieux, et à chaque record ou pseudo nouveau (pont `src/sync/pont.ts` :
rien pour un invité, anonyme compris). Les règles du dépôt gardent
`joueurs/` **fermé** (`essai()` rend faux jusqu'au lot 6) : sur le vrai
site comme à l'émulateur lancé par `emulators:start`, la synchro répond
« refuse » et garde `profil_a_ecrire` dans la session, sans rien perdre sur
l'appareil. Pour l'essayer au site de dev, charger dans l'émulateur
Firestore lancé les règles avec `essai()` ouvert (à refaire après chaque
redémarrage de l'émulateur ; jamais sur le vrai projet) :

```bash
node -e "const r=require('fs').readFileSync('firestore.rules','utf8').replace(/function essai\(\) \{\n\s*return false;\n\s*\}/,'function essai() { return true; }');fetch('http://127.0.0.1:8062/emulator/v1/projects/terramemo-geo:securityRules',{method:'PUT',body:JSON.stringify({rules:{files:[{content:r}]}})}).then(x=>console.log(x.status))"
```

`window.terramemo.comptes()` rend aussi `profil` (dernière synchro :
`etat` a_jour, cree, ecrit, refuse, echec, coupee, sans_compte, supprime ou
trop_gros ; pseudo retenu, ancien pseudo remplacé, records reçus et
envoyés) et `profil_a_ecrire` (drapeau de la session). Le pseudo se fusionne
à trois : `terramemo.pseudo.compte` (localStorage) garde le pseudo du compte
au dernier envoi ; un pseudo de l'appareil qui en diffère l'emporte, sinon
celui du compte. `terramemo.pseudo.remplace` garde l'ancien pseudo remplacé
par celui du compte, dit une fois (vue Compte ou zone du pseudo). `?sans-synchro` coupe aussi
le profil (aucune lecture de `joueurs/`).

**Envoi des séances (J1b, lot 3)** : les événements du journal qu'aucun lot
du compte ne contient partent en lots `joueurs/{uid}/lots/{lotId}`
(`src/sync/envoi.ts`, `src/sync/lots.ts`), en création seule, pour un
compte seulement (un invité ne charge rien). Une séance close (bilan,
« Terminer », vue Toucher quittée, autre partie) part aussitôt ; la séance
en cours seulement au passage en arrière-plan. Aussi à l'ouverture, au
retour du réseau, au premier plan (5 min au plus), après une connexion et
au « Réessayer » de la vue Compte. L'état de chaque lot est dans
`terramemo-synchro` (magasin `lots`). Avec les règles du dépôt (`essai()`
fermé), chaque lot est « refusé par les règles » et reste sur l'appareil ;
au site de dev, charger les règles d'essai ouvertes (commande ci-dessus).
`window.terramemo.synchro()` (sans Firebase) rend l'uid de la session,
`coupee`, le nombre d'événements, l'empreinte de l'état FSRS, les comptes
des lots (`horsLots`, séances en attente, refusées, fiches par état) et le
rapport de l'envoi de la page (dernière passe, erreurs brutes, `horsLigne`,
`quota`). Vérifié le 07/11 au site de dev avec `?emulateurs` : compte créé
dans la vue Compte, une séance Apprendre jouée par le pilote, un lot de 10
réponses en ligne au bilan, « Synchro : à jour ». `window.terramemo.version`
est le commit du build (`src/version.ts`, « +modifie » si l'arbre de
travail diffère) : les lots refusés se relancent à chaque nouvelle version.

**Lecture et union (J1b, lot 4)** : dans la même passe, sous le même
verrou et avant de composer, l'envoi lit les lots du compte
(`orderBy('fin')`, pages de 100) : depuis la marque moins 5 min
(`session.marque`) à l'ouverture et au premier plan, tout à la connexion
d'un autre compte, à la reconnexion après une déconnexion, ou quand un id
en ligne manque au journal (contrôle à l'ouverture). Les événements vont
au journal par `Memoire.fusionner` (fiches `en_ligne` et marque seulement
après) ; l'état se rejoue au repos, jamais pendant une séance active. Un
lot que la version ne sait pas lire va brut dans `a_relire`
(`terramemo-synchro`) et se relit à la version suivante, sans réseau.
`window.terramemo.synchro()` rend aussi `a_relire` (lots), `lecture`
(dernière lecture : mode, lots, événements, illisibles, relus, arrêt) et
`session` (marque, `deconnexion`, `effacement`, `connexion`,
`profil_a_ecrire`). Connexion à un compte existant avec des progrès sur
l'appareil : la question D22 (`#compte-fusion-ajouter`,
`#compte-fusion-ne-pas` puis `#compte-fusion-effacer`,
`#compte-fusion-annuler`) avant que rien ne parte ; déconnexion reprenable
(`#compte-deconnecter`, puis `#compte-deconnexion-reessayer` ou
`#compte-deconnexion-quand-meme` s'il reste quelque chose) ; session
perdue : `#compte-effacer`. Les onglets se préviennent par
`BroadcastChannel('terramemo')` : une déconnexion recharge les autres.

**Suppression, export, confidentialité (J1b, lot 5)** : vue Compte,
`#compte-vers-supprimer` (en bas), puis `#compte-supprimer-mot`
(« supprimer », casse ignorée), `#compte-supprimer-mdp` (compte
`password`) et `#compte-supprimer-ok` ; une suppression coupée laisse
`session.suppression` (`window.terramemo.synchro().session.suppression`)
et l'état `suppression` (`window.terramemo.comptes().etat`, `connecte`) :
« Suppression inachevée : reprendre ? », même formulaire. Rien ne part
pendant ce temps (ni lots, ni profil). Avec les règles du dépôt
(`joueurs/` fermé), la suppression s'arrête à la lecture du profil
(« Action non autorisée. ») : à essayer avec les règles d'essai ouvertes
(commande ci-dessus). Export : `#compte-exporter` (invité, compte, session
perdue) et `#compte-exporter-dabord` (seconde confirmation de « Ne pas les
ajouter », déconnexion qui n'a pas tout envoyé, « Effacer cet appareil ») ;
le fichier part par un Blob et un `<a download>` (`src/sync/export.ts`) ;
dans l'APK, un renvoi au site à la place (D26 a). Politique et page de suppression :
`public/confidentialite.html` et `public/suppression.html`, statiques
(`public/documents.css`), servies à la racine ; la vue `#confidentialite`
(⚙, Crédits, création de compte) insère le `<main>` de la première.
Vérifier une page construite : `npm run build && npx vite preview --port
8065 --strictPort`, puis `curl` sur `/confidentialite.html` **et son
contenu** (vite preview rend `index.html`, en 200, à toute adresse
inconnue). L'adresse de contact y est provisoire
(`CONTACT_A_REMPLIR@googlegroups.invalid`) jusqu'au groupe Google de D20.

Supprimer un compte à l'émulateur Auth (invité anonyme que Firebase
supprimerait au bout de 30 jours, compte d'essai) : `curl -X POST -H
'Authorization: Bearer owner' -H 'Content-Type: application/json' -d
'{"localId":"<uid>"}'
http://127.0.0.1:8063/identitytoolkit.googleapis.com/v1/projects/<projet>/accounts:delete`.
Piège : le jeton d'un compte supprimé s'y rafraîchit en
INVALID_REFRESH_TOKEN, et le SDK **reste connecté** ; en production
(USER_NOT_FOUND → `auth/user-token-expired`) il se déconnecte. Le code
traite les deux (`compteDisparu`, `src/sync/firebase.ts`).

```bash
npm run test:synchro    # critère de #3 : deux appareils aux émulateurs (ports 8062 et 8063 libres), aussi en CI
python3 .claude/skills/run-terramemo/driver.py synchro --out /tmp/terramemo-synchro   # pilote ui_synchro
```

`synchro` (pilote `ui_synchro`, critère de #3 au navigateur) demande le
serveur de dev (`driver.py serve`) et les émulateurs lancés à part
(`npx firebase emulators:start --only firestore,auth --project
terramemo-geo`) ; il charge lui-même dans l'émulateur les règles avec
`essai()` ouvert et vide base et comptes de l'émulateur (jamais le vrai
projet), sans poser `sans-synchro`. Deux chromium sans stockage partagé :
l'appareil 1 crée un compte et joue la Révision du jour ; l'appareil 2
joue Apprendre sous La Réunion en invité, se connecte, répond « Ajouter »
à la question ; le lendemain (`?horloge=1`) il passe hors ligne
(`Network.emulateNetworkConditions`), joue une Révision, revient ;
l'appareil 1 rouvert relit. Verdict : `synchro()` égal des deux côtés
(empreinte, événements, lots en attente et refusés, `a_relire`, uid,
drapeaux), puis la déconnexion de l'appareil 2 le vide. Captures 50 à 52.
Vérifié le 07/11 : 27 événements et la même empreinte des deux côtés.
Piège : `goto` vers l'adresse de la page au fragment près ne recharge pas
(navigation dans le document) ; changer un paramètre pour rouvrir.

Chrono de l'île jusqu'au classement, par le pilote (vérifié le 06/11) : le
choix `#jouer/classe/communes/reunion` puis `#jouer-panneau [data-mode="chrono"]`
(`jouer_partie(p, "chrono", "reunion")`), chaque réponse
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
« Score non publié (hors ligne ?)… », et attend dans la file
`terramemo.chrono.attente` du `localStorage` ([épreuve, période], sans le
score : `relancerAttente` renvoie le meilleur record publiable du moment).
Elle repart 3 s après le démarrage, à l'événement `online`, au retour au
premier plan (`visibilitychange`), à l'ouverture d'un classement (bloc ou
🏆), un onglet à la fois (Web Locks) ; une semaine passée en sort sans
envoi. Elle ne bouge que sur la réponse du serveur : un score refusé
d'avance (trop rapide) n'efface pas l'envoi qui attendait. Un 403 sur `documents:commit` pour
un score qui ne bat pas la place n'est pas un refus : la place est celle
du **pseudo** (en minuscules), partagée par tous ses appareils, et
`publier()` relit la place pour s'en assurer.

Publier sans jouer (serveur de dev seulement) : les modules s'importent
depuis la page, `await import('/src/vues/classement.ts')` (et
`/src/epreuve/chrono.ts`, `/src/epreuve/classement.ts`) ; un record posé
par `enregistrerPartie(localStorage, …)` part par `publierTout(pseudo)`.
Chaque `driver.Session('local')` a un profil neuf, donc un autre compte
anonyme : deux sessions sous le même pseudo = deux appareils, une place.

## Outil du propriétaire (`scripts/admin/`, J1b lot 5b)

Purge, demandes de retrait et abus, sur le SDK Admin (étude § 7.5, D33 a).
**Sur le PC, à la main** : jamais sur le Pi, jamais en CI (refusé), jamais
par un agent de workflow sur le vrai projet. À blanc par défaut : il
affiche le plan et son **empreinte** (12 caractères, et la commande qui
l'exécute). `--appliquer --attendu <empreinte>` recalcule le plan et ne
l'exécute que s'il a cette empreinte, donc exactement le plan relu : une
demande, une pierre tombale, un compte inactif de plus, ou une place
réécrite entre-temps, et rien n'est fait (relire le nouveau plan, avec sa
nouvelle empreinte). `--appliquer` sans `--attendu` est refusé.
L'empreinte porte sur ce qui serait supprimé (chemins, comptes, heure lue
de chaque document), pas sur les rangs affichés. Pendant l'exécution, un
document réécrit arrête tout (`lastUpdateTime`). Sa première ligne dit sur
quoi il travaille.

```bash
npm run admin -- --aide
npm run admin -- tournee                    # à blanc : demandes, tombes, orphelins, relevé
npm run admin -- tournee --trimestrielle    # … et les comptes inactifs
npm run admin -- demandes                   # puis, après lecture : demandes --appliquer --attendu <empreinte>
npm run test:admin                          # tests aux émulateurs (8062 et 8063 libres), aussi en CI
```

**Cible** : avec `FIRESTORE_EMULATOR_HOST` et `FIREBASE_AUTH_EMULATOR_HOST`
posés (tous les deux), les émulateurs, sans clé (projet `GCLOUD_PROJECT`,
sinon `demo-terramemo`) ; un seul des deux est refusé. Sinon le vrai projet
`terramemo-geo`, par la clé du compte de service : le seul `.json` de
`~/Sauvegardes/terramemo/admin/`, ou le chemin de `TERRAMEMO_CLE_ADMIN` ;
une clé dans le dépôt ou d'un autre projet est refusée, et `.gitignore`
ignore les noms des clés de Google. Aux émulateurs lancés à part
(`npx firebase emulators:start --only firestore,auth --project
terramemo-geo`) : `FIRESTORE_EMULATOR_HOST=127.0.0.1:8062
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:8063 GCLOUD_PROJECT=terramemo-geo npm
run admin -- …`. `TERRAMEMO_MAINTENANT` (une date ISO) déplace l'heure de
référence, aux émulateurs seulement (tests). `--json` : la sortie d'un
programme (plan, notes, actions faites).

**Commandes** (aucune ne touche aux invités anonymes, sans fournisseur :
Firebase les supprime 30 jours après leur création) :
- `inactifs` : comptes sans activité depuis 2 ans, d'après
  `metadata.lastRefreshTime` (dernier jeton rafraîchi ; à défaut la dernière
  connexion, puis la création), jamais `lastSignInTime` seul ; leurs lots
  et leur profil, puis `deleteUsers` par 1 000. Un compte bloqué pour abus
  y passe aussi, au bout de 2 ans ;
- `tombes [--finir]` : pierres tombales de plus d'un jour. Compte parti et
  lots vides : effacée. Compte parti, lots restants : les lots, puis la
  pierre tombale redatée. Compte encore dans Auth : « suppression restée en
  route », signalée ; `--finir` la finit (lots, puis le compte), pierre
  tombale redatée. Redatée, elle a moins d'un jour : effacée à la tournée
  suivante, quand plus aucun jeton du compte ne vaut ;
- `orphelins` : lots et profil d'un uid absent de Auth (une pierre tombale
  est laissée à `tombes`) ;
- `demandes [--uid U] [--avec-a-juger | --garder-a-juger]` (D27 b) : pour
  chaque pseudo demandé, ses places dans chaque épreuve et chaque période
  (toujours, chaque semaine passée), **à la clé exacte**
  `pseudo.toLowerCase()` (`clePseudo`), avec rang, points et date, puis la
  demande. « Élodie » ne retire ni `elodie`, ni `ölodie` (que le masque des
  règles laisse écrire sous « Élodie »), « Michel » ni `michél` ni
  `MICHEL`. Les demandes d'un même pseudo vont ensemble. Une place écrite
  plus d'une heure après la demande n'est pas du compte supprimé : « à
  juger », gardée avec sa demande, jusqu'à `--uid U --avec-a-juger` (la
  retirer aussi) ou `--garder-a-juger` (la garder, retirer la demande).
  **Lire le plan avant `--appliquer --attendu`** : le pseudo n'est pas réservé, et un
  compte peut avoir pris celui d'un autre avant de se supprimer ;
- `abus <uid>` : ses lots et son profil, puis `updateUser(uid, {disabled:
  true})`. Le jeton déjà donné vaut encore une heure : relancer une heure
  après (il ne refait que ce qui reste) ;
- `releve [--n N] [--uid U] [--taille [--max-lectures M]]` : par uid, le
  nombre de lots, **compté sans les lire** (agrégation `count()`, une
  lecture par tranche de 1 000), les plus gros d'abord, compte actif,
  bloqué ou absent ; c'est ce que fait la tournée. `--taille` lit chaque
  lot (une lecture chacun) pour ses événements et ses octets (calcul de
  taille de Firestore) : refusé avant toute lecture au-delà de M lots
  (5 000 par défaut) ; `--uid U` pour un seul compte (`n` n'est pas
  indexé : pas de somme par agrégation). Le relevé affiche ses lectures.

**Tournée** :
- **mensuelle** (la politique promet 30 jours au plus pour les demandes) :
  `tournee` à blanc, lire, puis `demandes`, `tombes` et `orphelins`, chacune
  `--appliquer --attendu <son empreinte>` (la tournée donne celle de chaque
  tâche, la même que la commande seule) ; trancher les places « à juger » et
  les suppressions restées en route (`tombes --finir --appliquer`) ;
  regarder le relevé (un uid qui grossit hors de proportion : `abus`) ;
- **trimestrielle** (2 ans et 3 mois d'inactivité au plus) : `tournee
  --trimestrielle`, puis `inactifs --appliquer --attendu <empreinte>`.

Coût : des appels ordinaires de Spark, sur le quota de 50 000 lectures
par jour **partagé avec l'appli** (dépassé, la synchro et les classements
de tous les joueurs échouent jusqu'à 11 h, heure de La Réunion). `tombes`
lit tout `joueurs/` (`supprime` n'est pas indexé), `releve` un profil et
un comptage par uid (`--taille` : chaque lot), `demandes` une place
par épreuve et par période (les semaines s'accumulent) et deux ou trois
comptes par place trouvée.

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

- **Serveur de dev qui sert des modules périmés** : si sa sortie dit
  `ENOSPC: System limit for number of file watchers reached`, la limite
  d'inotify du PC (`fs.inotify.max_user_watches`, 65 536, partagée avec
  VS Code et les autres sessions) est atteinte, et Vite ne voit plus les
  changements (vu le 07/11 : un `main.ts` d'avant servi sans erreur).
  `android/` et `dist/` ne sont plus surveillés (`vite.config.ts`) ; si ça
  revient, relancer `serve` après chaque modification.

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
- Jouer garde la dernière partie lancée dans le `localStorage`
  (`terramemo.jouer.derniere` : branche, sujet, série, exercice ; « Rejouer »
  en tête de Jouer, ignorée si elle n'est plus dans l'arbre). Le profil neuf
  du pilote part sans elle ; `terramemo.toucher.mode` et
  `terramemo.toucher.serie` ne servent plus (restes sans effet).
- Ids de l'arbre de Jouer : branches `entrainement`, `classe` ; sujets
  `pays`, `communes` ; séries `tous`, les continents en anglais (`South
  America`, `%20` dans l'adresse), `reunion` ; exercices `localiser`,
  `nommer`, `chrono`, `sansfaute`, `minute`. L'Essai J0 (série `essai`)
  n'est que dans ⚙ (`#reglage-essai`).
- L'historique de Jouer et des parties vit dans `src/navigation.ts`, testé
  avec un historique factice (`tests/navigation.test.ts`) : chaque entrée
  garde la pile des adresses d'avant (`history.state`), « ‹ », « × » et
  les retours des parties remontent l'historique (`history.go`, différé)
  au lieu d'empiler. Une traversée donne popstate PUIS hashchange (Chromium
  aussi pour un lien) : le second, qui lit encore l'ancienne ancre, est
  ignoré quand la navigation vient de demander un `go` (sinon double
  remontée). « × » ne rouvre une vue de partie que si elle a encore
  quelque chose à montrer (`aMontrer()`), sinon la carte ou la Saisie.
- Le retour d'Android dans l'APK remonte l'historique de la WebView, donc
  Jouer d'un niveau à la fois, comme le retour du navigateur ; à la racine
  (la carte), l'appli passe en arrière-plan (`src/retour-android.ts`,
  plugin `@capacitor/app` : sans écouteur, il ne ferait rien à la racine,
  et sans plugin le retour fermait l'appli à tout niveau). Le pilote ne le
  joue pas : à essayer au doigt sur l'A37 après un `apk --installer`.
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
| `licences/android.json périmé` (`apk`, CI Android) | Capacitor ou AndroidX a changé ses bibliothèques : `npm run licences:android`, puis `npm test` (un nouveau groupe Maven va sous une ligne de `credits.android`, sa licence vérifiée). |
| Build : `… n'est sous aucune ligne de textes.credits.android` | Même cause : ranger le groupe sous une ligne de `credits.android` (`textes.fr.json`), après avoir vérifié sa licence. |
