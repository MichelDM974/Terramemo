# Renommage Cartographe → Terramemo (#10) : inventaire et brouillon de procédure

Préparé le 04/11/2026 en lecture seule par un agent (rien renommé), relu en partie
(compose l. 50, hook SessionStart). Brouillon : choix C1 à C9 à trancher avec l'utilisateur
avant toute exécution (#10). Chemins : `MP` = `~/Documents/GitHub/Mes Projets`,
`C` = `MP/Cartographe`, `CDC` = `MP/centre-de-controle`.

## 0. Constats clés

1. **Le piège n° 1 est le hook SessionStart** (`CDC/scripts/new-project-stub.sh`, lancé
   par `~/.claude/settings.json` à chaque session ouverte sous `MP`) : il parcourt
   *tous* les dossiers de `MP` et crée un registre stub pour chaque dossier sans
   `journaux/<slug>.jsonl` (slug = nom du dossier en minuscules, espaces → `-`).
   Dossier renommé avant le registre → `terramemo.jsonl` stub créé (puis collision) ;
   registre renommé avant le dossier → `cartographe.jsonl` stub recréé. Les deux
   `mv` doivent partir dans **une seule commande**, puis vérifier `ls journaux/`. Les
   liens symboliques sont ignorés par le hook (`[ -L ]`) : un lien de transition
   `Cartographe → Terramemo` ne recrée rien.
2. **Docker recrée le dossier disparu** : `CDC/docker-compose.yml:50` monte
   `../Cartographe/docs:/projets/cartographe:ro` (syntaxe courte). Si le conteneur de
   cdc est recréé/redémarré avant la correction de cette ligne, Docker crée
   `MP/Cartographe/docs` (vide, root) → le hook voit un dossier « Cartographe » →
   nouveau registre `cartographe.jsonl`. Corriger la ligne **dans la même étape**
   (et `tests/test_compose.py` de cdc échoue tant que montage et dossiers diffèrent).
3. **La synchro du Pi n'a pas de notion de renommage** (`CDC/scripts/sync_pi.py`,
   union par identifiant, toutes les 30 s) : après le renommage sur le PC, le Pi
   reçoit `terramemo.jsonl` entier (« nouveau projet »), mais garde
   `cartographe.jsonl` (affiché dans le cdc du Pi en double) ; tout ce qui y serait
   écrit depuis le téléphone est « sur le Pi seulement, ignoré », donc perdu.
   Procédure documentée pour *supprimer* un projet (run-cdc, `telephone-apk.md:43`) :
   des deux côtés et dans le miroir `~/.local/state/cdc-sync/pi/`. Idem
   `documents/cartographe/` sur le Pi (copie sens unique par slug, l'ancien reste).
4. **cdc n'a ni fonction de renommage ni moyen de changer titre/chemin** : le
   registre accepte un événement `projet` avec `titre` et `chemin`
   (`CDC/cdc/registre.py:64`, `PROJET = ("titre","chemin","couleur","vue",…)`) mais
   aucun geste (page, MCP `modifier_vue`) ne l'écrit. Or `chemin` sert : en-tête
   du `.md`, nom du dépôt pour les commits (`registre._depot`, l.507) et
   `machine.depots_suivis` (le relais trouve le dépôt git du projet par ce chemin).
   Précédent : jdb → cdc (cdc #92, 14/10, à la main, transitions retirées par #98 :
   lien `journal-de-bord`, `ANCIENS_SLUGS`, alias `jdb` dans `ALIAS_PROJETS`).
5. **Rien n'est publié ni lié à un compte** : pas de Play Store, pas d'Auth/Firestore
   (J1a), pas de release GitHub (`gh release list` vide), dépôt privé. Changer
   l'appId, les clés de stockage et le site ne coûte aujourd'hui que des réglages
   de dev. Après J1a (progrès des joueurs liés à l'origine, risque nommé dans
   `docs/plan.md:138`) et surtout après le Play Store (appId définitif), ce ne
   sera plus vrai → **renommer avant J1a**.
6. **Travail en cours sur Cartographe** (état du 04/11, 18 h) : la séance téléphone du J0
   reste à faire ; reprises déposées dans cdc avec `projet: cartographe`
   (`CDC/machine/reprises/`) à consommer ou retirer avant ; plus de worktree
   (`~/Cartographe-wt` supprimé, branches du lot final reportées sur main). Une session
   dont le cwd est sous `C/` perd son dossier au `mv`.

## 1. Inventaire dans Cartographe (hors `.git`, `node_modules`, `dist`, `android/app/build`)

Légende : **R** = à renommer ; **G** = à garder (raison) ; **U** = conséquence utilisateur.

### Identité Android (R, U)
- `capacitor.config.ts:7` appId `io.github.micheldm974.cartographe` ; `:8` appName `Cartographe`.
- `android/app/build.gradle:4` namespace, `:7` applicationId.
- `android/app/src/main/java/io/github/micheldm974/cartographe/MainActivity.java:1` package
  → `git mv` du dossier `…/cartographe/` en `…/terramemo/` + ligne `package`.
- `android/app/src/main/res/values/strings.xml:3-6` app_name, title_activity_main,
  package_name, custom_url_scheme.
- `android/app/src/main/assets/capacitor.config.json` et `assets/public/**` : **générés,
  non suivis** (refaits par `npx cap sync android`), rien à éditer.
- U : appId changé = **autre appli** sur le téléphone ; désinstaller l'ancienne
  (`adb uninstall io.github.micheldm974.cartographe`), ses données (cache IndexedDB,
  réglages) partent avec. Rien de publié : aucun autre utilisateur.

### Web, npm, titres (R)
- `package.json:2` `"name": "cartographe"` ; `package-lock.json` (2 lignes, `name` racine et `packages[""]`).
- `index.html:7` `<title>Cartographe</title>`, `:19` h1. Le driver vérifie ce titre :
  `driver.py:758` (`b"<title>Cartographe</title>"`) → les deux ensemble.
- `README.md:1`, `:12`.
- `vite.config.ts:3-4` (commentaire : port, skill).
- `docs/plan.md:6` (registre `cartographe`), `:20` (« Nom **Cartographe** » → Terramemo), `:104` (skill).

### Contrat du driver `window.cartographe` (R)
- `src/main.ts:236` `RapportCartographe`, `:238` `interface Cartographe`, `:249` déclaration
  `window.cartographe`, `:255`, `:333` ; commentaires `:45`, `:205`.
- `src/mesure/rapport.ts:2,4,109`, `src/mesure/stats.ts:98`, `src/map/carte.ts:66`,
  `src/map/carte-canvas.ts:3` (commentaires).
- `.claude/skills/run-cartographe/driver.py` : ~25 appels `window.cartographe.*`
  (l.529, 778, 796, 821, 833, 900-981) → `window.terramemo` en une passe avec `src/`.
- `tests/carte.test.ts:435` (commentaire).

### Stockage navigateur (R, U)
- `src/main.ts:78` `CLE_MESURES = 'cartographe.mesures'` (localStorage, affichage des mesures).
- `src/vues/essai.ts:33` `CLE_SERIE = 'cartographe.toucher.serie'` (dernière série de Toucher).
- `src/map/maillage.worker.ts:43` `BASE = 'cartographe'` (IndexedDB du cache des triangles WebGL).
- U : réglage perdu / cache recalculé une fois. **Sans effet supplémentaire** : le site
  change d'origine (terramemo.web.app) et l'APK d'appId, donc ces données sont
  perdues de toute façon. Seule l'origine de dev `localhost:8060` garde une base
  IndexedDB `cartographe` orpheline (sans importance). Pas de migration à écrire.

### Skill run-cartographe (R)
- Dossier `.claude/skills/run-cartographe/` → `run-terramemo/` (`git mv`).
- `SKILL.md` : `name:` l.2, description l.3, titre l.6, ~27 occurrences (chemins
  `.claude/skills/run-cartographe/driver.py`, `window.cartographe`, `/tmp/cartographe-*`,
  « Lance Cartographe » l.189-190, `am start -n io.github.micheldm974.cartographe/.MainActivity` l.240,
  section Déploiement l.351-355 et URL `cartographe-geo.web.app` l.51, 189, 237, 355 → `terramemo.web.app`).
- `driver.py` : docstring l.2-4, `APPID` l.44, message l.172, préfixes temporaires
  `cartographe-chromium-` l.218, `/tmp/cartographe-preview` l.1447, `/tmp/cartographe-captures` l.1456,
  champ `"outil"` des rapports l.1347, 1399.
- `__pycache__/` ignoré (à effacer).

### Tests (R)
- `tests/capacitor.test.ts:15` appId attendu.
- `tests/mesure-driver.test.ts:2,32` (chemin du driver du skill), `:223` préfixe `cartographe-driver-`.

### CI (R)
- `.github/workflows/ci.yml:19` (commentaire skill), `.github/workflows/android.yml:47`
  artefact `cartographe-debug-${{ github.sha }}`.

### Firebase (G / R)
- `.firebaserc:3` `"default": "cartographe-geo"` → **G** : ID de projet non renommable.
- `firebase.json` : pas de `site` → déploie sur le site par défaut `cartographe-geo` → **R** (voir §5).

### Archives (G recommandé)
- `docs/mesures/j0/*.json` (10 fichiers) : `"outil": ".claude/skills/run-cartographe/driver.py mesurer"`,
  `window.cartographe.repos` dans `cadence` → données de mesure datées, les réécrire
  falsifierait l'enregistrement. Vérifier que `driver.py resumer` ne relit pas `outil`.
- `docs/etudes/2026-11-04-synthese-agents.md:143` : liste d'idées de noms (Cartographe parmi
  d'autres) dans une étude datée → G.

## 2. cdc : comment un projet est identifié

- **Clé = slug du nom de dossier** (`tr '[:upper:]' '[:lower:]' | tr ' ' '-'`) : nom du
  registre `journaux/<slug>.jsonl` (+ `.md` généré), montage docs `/projets/<slug>`,
  `sync_pi.slug_projet`, `machine.projet_du_dossier` (session rattachée au projet par
  le 1er dossier de son cwd sous `MP`), `projet_du_depot` (commits d'un dépôt = projet
  dont le slug = nom du dossier du dépôt).
- **Dans le registre** : 1er événement `projet` `{"titre":"Cartographe","chemin":"Mes Projets/Cartographe"}`
  (`CDC/journaux/cartographe.jsonl` l.1), couleur `#3d72f0` (l.3, à garder). Les
  événements ne portent pas le slug : renommer le fichier suffit pour les données.
  Un événement `projet` postérieur avec `titre`/`chemin` les remplace (à vérifier
  dans `registre.charger`, comme pour `couleur` et `vue`).
- **Relais (`scripts/machine.py`)** : projet d'une session = outils MCP `journaux`
  appelés avec `projet` (l.885, avec `ALIAS_PROJETS`), `resume.py <slug>`, éditions de
  `journaux/<slug>.md`, puis cwd ; commits cités « (#N) » dans le dépôt du projet ou
  « (cartographe #N) » ailleurs (`tickets_des_commits`, l.3264). Après renommage,
  « cartographe #N » ne sera plus reconnu sans alias.
- **Alias** : `ALIAS_PROJETS = {"cdc": …, "jdb": …}` en double (`cdc/registre.py:1047`,
  `scripts/machine.py:203`). `scripts/cdc_mcp.py:64` (`charger`) **n'applique pas** l'alias :
  un `projet("cartographe")` sera refusé (message qui liste les projets connus).
- **Références croisées** : aucun autre registre ne cite « cartographe #N » ; aucun autre
  projet ne nomme Cartographe dans ses fichiers suivis (vérifié par `git grep`).
- **Commits enregistrés** : `"depot": "Cartographe"` et liens
  `https://github.com/MichelDM974/Cartographe/commit/…` stockés tels quels → G
  (historique ; GitHub redirige après renommage).
- **Pi** : `rasp@pi:cdc/journaux/` (synchro `cdc-sync.timer` toutes les 30 s, union par
  id ; registre absent du PC = ignoré, jamais supprimé), `rasp@pi:cdc/documents/<slug>/`
  (docs, sens unique, `--delete` limité au slug). Rien de Cartographe déployé sur le Pi.
- **Scribe** (relais seul à commiter `journaux/`) : prend les fichiers de
  `git status --porcelain journaux/`, donc commitera la suppression de
  `cartographe.*` et l'ajout de `terramemo.*` (à vérifier : `message_scribe` sur un
  fichier supprimé). Ne pas faire de `git mv` (indexerait `journaux/` à la main).
- **État vivant** à vider/attendre : `~/.local/state/cdc-machine/fond.json` et
  `fond/cartographe#*.json` (sessions de fond), `CDC/machine/reprises/*.json`
  (`projet: cartographe`), `CDC/machine/etat.json`, `fils/*.json` (transitoires),
  `~/.local/state/cdc-sync/{pi,envoi}/cartographe.jsonl` (miroir de la synchro).
- **Runner CI** : aucun `~/actions-runners/Cartographe` → rien à renommer (le relais CI
  ne couvre pas ce dépôt ; non retenu ici).

**Renommer dans cdc = suite d'étapes à la main aujourd'hui** (fichier registre, `.md`,
événement `projet` écrit par script sous le verrou `journaux/.verrou`, ligne compose,
Pi, miroir, alias). Une commande `scripts/registre.py renommer <ancien> <nouveau>`
(verrou, événement `projet`, `mv` atomique registre + dossier, alias, contrôle du
compose, rappel Pi) rendrait ça sûr et réutilisable : ticket cdc à ouvrir si choisi (C6).

## 3. Dépôt racine, réglages, hors dépôts

- `MP/CLAUDE.md`, `MP/.claude/` (settings, hooks, skills `cdc`, `nouveau-projet`, `pistes`,
  `scripts/claude-vscode.sh`, `nouvelle_session.py`), `.mcp.json` : **aucune occurrence**.
  (`nouveau-projet/SKILL.md:49-50` réserve la dizaine 8060 sans nommer le projet.)
  Non retenu : `CLAUDE.md` liste les projets déployés (« Light → Firebase ») sans Cartographe ;
  y ajouter « Terramemo → Firebase » serait cohérent (à proposer, hors #10).
- `~/.claude/settings.json` : hook SessionStart (cf. constat 1), rien de nommé.
- `~/.claude.json` : aucune occurrence. Pas de dossier de transcripts
  `~/.claude/projects/-…-Mes-Projets-Cartographe` (sessions ouvertes à la racine) : `--resume` non affecté.
- Mémoire `~/.claude/projects/-home-delhomme-Documents-GitHub-Mes-Projets/memory/` :
  `MEMORY.md:18` et `pc_gel_surcharge_workflows.md:13` (« workflows Cartographe », fait daté
  du 04/11) → G ou « Terramemo (ex-Cartographe) » (C8).
- `~/Cartographe-wt/{mesures,shaders}` : worktrees (gitdir absolu vers `C/.git/worktrees/…`)
  → cassés par le `mv` de `C` ; `git worktree prune` si finis, sinon `mv` + `git worktree repair`.
- `~/Sauvegardes/cartographe/` (19 dossiers de sorties d'agents, + ce `renommage/`) →
  `mv` en `~/Sauvegardes/terramemo/` (rien ne les lit automatiquement ; les notes du
  registre qui les citent restent de l'historique).
- `/tmp/cartographe-*` : jetables.

## 4. GitHub

- `gh repo view` : `MichelDM974/Cartographe`, PRIVATE, branche `main` ; `MichelDM974/Terramemo`
  n'existe pas (nom libre). Aucune release, aucun tag `android` (cdc l'interrogerait par
  `git ls-remote`).
- `gh repo rename Terramemo -R MichelDM974/Cartographe --yes` : GitHub redirige l'ancien nom
  (web, git, API) tant qu'aucun dépôt `Cartographe` n'est recréé ; variables/secrets
  Actions, historique CI suivent.
- Remote : `origin = https://github.com/MichelDM974/Cartographe.git` dans `C` ; les worktrees
  partagent la config → un seul `git remote set-url`.
- Artefacts CI déjà produits gardent leur nom `cartographe-debug-*` (expirent seuls).

## 5. Firebase

- `firebase hosting:sites:list --project cartographe-geo` : sites `cartographe-geo`
  (défaut) et `terramemo` (réservé, vide). ID de projet `cartographe-geo` **permanent**
  (visible aussi dans `cartographe-geo.firebaseapp.com`, futur `authDomain` de l'écran
  Google au J1b) ; nom d'affichage du projet modifiable dans la console.
- Le site par défaut **ne peut pas être supprimé** ; on peut le désactiver
  (`firebase hosting:disable --site cartographe-geo`) ou y servir une redirection.
- Déployer sur terramemo sans cible nommée : `firebase.json` en tableau avec `"site"` :
  ```json
  { "hosting": [
    { "site": "terramemo", "public": "dist", "ignore": [...], "headers": [...actuels] },
    { "site": "cartographe-geo", "public": "dist",
      "redirects": [{ "source": "/:chemin*", "destination": "https://terramemo.web.app/:chemin*", "type": 301 }] }
  ] }
  ```
  `.firebaserc` inchangé. Commandes : `npx firebase deploy --only hosting:terramemo`,
  `--only hosting:cartographe-geo`. (Variante `target` + `firebase target:apply` : inutile ici.)
- Au J1b : `authDomain: "terramemo.web.app"` possible (Hosting sert `/__/auth/` sur ses
  sites ; ajouter l'URI de redirection OAuth), pour ne pas afficher `cartographe-geo`.

## 6. Brouillon de procédure

**Préalables** (tous vrais avant de commencer) : J0 clos et commité/poussé ; marques
vérifiées (C2) ; aucune session ouverte dans `C/` ni sur Cartographe (session de fond
J0 finie, `fond.json` sans `en_cours`) ; reprises `projet: cartographe` consommées ou
retirées de cdc ; worktrees fusionnés ; Pi joignable ; la session qui exécute a pour
cwd `MP` (racine), pas `C/`.

1. **Code de Cartographe (réversible, commit « (#10) »)** — dans `C`, encore sous l'ancien nom :
   - `git mv .claude/skills/run-cartographe .claude/skills/run-terramemo` ;
     `git mv android/app/src/main/java/io/github/micheldm974/cartographe …/terramemo` ;
   - remplacer selon §1 (casse : `cartographe`→`terramemo`, `Cartographe`→`Terramemo`,
     `RapportCartographe`→`RapportTerramemo`) **sauf** `.firebaserc`, `docs/mesures/`,
     `docs/etudes/` ; `firebase.json` en tableau (§5) ; `npm install` (lock) ;
   - Vérif : `npm test`, `npx tsc --noEmit`, `driver.py smoke` (titre), `command grep -rni cartographe`
     hors `.git node_modules dist android/app/build docs/mesures docs/etudes` → seul `.firebaserc`
     et `firebase.json` (site `cartographe-geo` de la redirection).
   - Commit, push (encore vers l'ancien nom, OK).
2. **Site** : `npm run build && npx firebase deploy --only hosting:terramemo` ; vérif
   `driver.py smoke --url https://terramemo.web.app/`. Puis `--only hosting:cartographe-geo`
   (redirection, C4) ; vérif `curl -sI https://cartographe-geo.web.app/x` → 301 vers terramemo.
3. **APK** : `adb uninstall io.github.micheldm974.cartographe` (**irréversible** pour ses
   données locales : cache, réglages de dev) ; `driver.py apk --installer` ; vérif : appli
   « Terramemo » lancée, `am start -n io.github.micheldm974.terramemo/.MainActivity`.
4. **GitHub** : `gh repo rename Terramemo -R MichelDM974/Cartographe --yes` ;
   `git -C C remote set-url origin https://github.com/MichelDM974/Terramemo.git` ;
   vérif `gh repo view MichelDM974/Terramemo`, `git fetch`, CI verte au push suivant.
5. **cdc, en une fenêtre courte** (cdc #92 en exemple ; ou la commande de C6) :
   a. `systemctl --user start cdc-sync.service` (dernier passage : rien du téléphone
      n'est laissé sur le Pi), puis `systemctl --user stop cdc-sync.timer` ;
   b. éditer `CDC/docker-compose.yml:50` → `../Terramemo/docs:/projets/terramemo:ro`
      (+ alias `"cartographe": "terramemo"` dans les deux `ALIAS_PROJETS` si C7) ;
   c. **une seule commande, sous le verrou** :
      `flock CDC/journaux/.verrou sh -c 'mv -n CDC/journaux/cartographe.jsonl CDC/journaux/terramemo.jsonl && rm CDC/journaux/cartographe.md && mv -n MP/Cartographe MP/Terramemo'`
      (`mv -n` : ne jamais écraser un stub surgi entre-temps) ;
   d. écrire l'événement `projet` `{titre: "Terramemo", chemin: "Mes Projets/Terramemo"}`
      par `registre.ajouter("terramemo", …)` (petit script Python, verrou pris par l'API),
      qui régénère `terramemo.md` ;
   e. vérif : `ls CDC/journaux | grep -E 'cartographe|terramemo'` (seulement `terramemo.*`),
      `python3 CDC/scripts/resume.py terramemo` (titre, chemin, 11 tickets) ;
   f. `docker compose up -d` dans `CDC` (montage corrigé), `systemctl --user restart cdc-machine` ;
      tests cdc (`test_compose`), commit cdc « (cdc #N) » si code changé, `deploy/deploy.sh` ;
   g. Pi (ssh, permission « ask ») : supprimer `cdc/journaux/cartographe.{jsonl,md}` et
      `cdc/documents/cartographe/` ; localement `~/.local/state/cdc-sync/{pi,envoi}/cartographe.jsonl` ;
   h. `systemctl --user start cdc-sync.timer` ; vérif sur le téléphone : Terramemo avec tout
      son journal, plus de Cartographe ; ouvrir une session neuve à la racine et revérifier
      que le hook n'a rien créé ;
   i. le scribe commite `journaux/` seul (ne pas le faire à la main).
6. **Hors dépôts** : worktrees (`git worktree prune` ou `mv ~/Cartographe-wt ~/Terramemo-wt
   && git -C MP/Terramemo worktree repair ~/Terramemo-wt/*`) ; `mv ~/Sauvegardes/cartographe
   ~/Sauvegardes/terramemo` ; mémoire (C8) ; console Firebase : nom d'affichage « Terramemo ».
7. **Fin** : `command grep -rni cartographe MP/Terramemo` (exclusions) + `CDC` hors `journaux/`
   et `.git` → seules les traces gardées listées ; note au registre terramemo ; ticket de
   retrait des transitions (alias, redirection si temporaire) comme cdc #98 ; #10 archivé.

**Irréversible / à sens unique** : désinstaller l'ancien APK (données locales) ; ID du
projet Firebase et site par défaut `cartographe-geo` (restent) ; appId une fois sur le
Play Store (pas encore). Renommage GitHub et registre : réversibles.

## 7. Choix pour l'utilisateur

- **C1 Quand** : (a) maintenant, J0 en cours ; (b) **juste après le verdict du J0, avant
  J1a** ; (c) après J1a. → **(b)** : la session J0 touche le skill et le driver (conflits,
  sessions cassées par le `mv`), et après J1a l'origine porte des progrès (plan, risque l.138).
- **C2 Marques** : (a) **vérifier TMview/INPI (classes 9, 41) avant de renommer** ; (b) après,
  avant publication. → **(a)** : un conflit découvert après coûterait un second renommage.
- **C3 appId** : (a) **`io.github.micheldm974.terramemo` maintenant** ; (b) garder
  `…cartographe` (invisible aux joueurs mais trace à vie après le Play Store) ; (c) un id de
  domaine (`fr.terramemo.app`) si `terramemo.fr` doit être acheté. → **(a)** (ou (c) si le
  domaine est prévu) : gratuit tant que rien n'est publié.
- **C4 cartographe-geo.web.app** : (a) **redirection 301 vers terramemo.web.app** ; (b) site
  désactivé (`hosting:disable`) ; (c) laissé tel quel (vieille version servie). → **(a)** :
  marque-pages du téléphone et liens des notes du registre restent bons, le nom du projet
  Firebase reste de toute façon ; repasser à (b) plus tard si voulu.
- **C5 Projet Firebase** : (a) **garder `cartographe-geo`**, nom d'affichage changé,
  `authDomain` terramemo.web.app au J1b ; (b) nouveau projet maintenant (vide), en
  libérant puis recréant le site `terramemo` (risque de le perdre entre deux). → **(a)**.
- **C6 cdc** : (a) à la main cette fois (§6 étape 5) ; (b) **commande `registre.py renommer`
  dans cdc (ticket cdc), puis l'utiliser** ; (c) script jetable au scratchpad. → **(b)** :
  hook, compose, verrou et Pi sont les pièges qu'une commande testée évite, et « tout gérer
  depuis cdc » ; (a) acceptable si l'utilisateur veut renommer vite (précédent #92).
- **C7 Transitions** : (a) **alias `cartographe → terramemo` quelques jours, sans lien
  symbolique** (aucune session ouverte au moment du `mv`), retirés par un ticket comme cdc #98 ;
  (b) alias + lien `Cartographe → Terramemo` ; (c) coupure franche. → **(a)**.
- **C8 Archives** (`docs/mesures/j0/*.json`, étude des noms, entrées du registre, mémoire) :
  (a) **garder tel quel (historique daté)**, mémoire en « Terramemo (ex-Cartographe) » ;
  (b) tout réécrire. → **(a)** : réécrire des mesures fausserait les données.
- **C9 Stockage** : (a) **renommer les clés et la base IndexedDB sans migration** ; (b) migrer.
  → **(a)** : origine et appId changent, les anciennes données sont perdues de toute façon.
