# Plan arrêté — 04/11/2026

Plan issu de cinq études (`docs/etudes/2026-11-04-*.md` : pédagogie,
données, technique, synthèse des agents, critique adverse) et des réponses
de l'utilisateur le même jour. Ce plan fait foi là où les études divergent ;
les décisions vivantes sont au registre de cdc (`terramemo`).

Mis à jour le 06/11/2026 (décision « Contenu ») : le J1c (La Réunion) passe
avant le J1a ; conception `docs/etudes/2026-11-06-reunion.md`.

Conception du J1a (06/11/2026, #2) : `docs/etudes/2026-11-06-j1a-conception.md`
(décisions en attente au § 12, faits chiffrés dans `docs/questions-j1a.md`).
Le 06/11 (décision « Comptes ») : la synchro Firestore des séances passe du J1a
au J1b, avec la relecture sur un autre appareil, la page de confidentialité et
la suppression des données ; au J1a, les progrès restent sur l'appareil.

## Choix de l'utilisateur (04/11/2026)

| Sujet | Choix |
|---|---|
| Public | **Public** (n'importe qui), gratuit, sans pub, code privé |
| Objectif | **Culture géographique large** ; au départ : pays du monde, capitales, drapeaux |
| Comptes | Synchronisés entre appareils ; **on joue sans compte** (Firebase Auth anonyme), « Se connecter avec Google » ou un compte e-mail et mot de passe (choix du 04/11, #13) rattache les progrès |
| Langue | **Français, prêt à traduire** (textes et noms dans des fichiers de langue dès le départ) |
| Diffusion | **Le site seul pour le public jusqu'au Play Store** ; l'APK reste pour l'utilisateur dans la release privée d'ici là |
| Hébergement | **Firebase Hosting** (offre Spark) ; plan B : Cloudflare Pages si le quota de transfert est atteint |
| Frontières | **De fait** (Natural Earth par défaut), zones contestées hachurées, jamais posées en question |
| Points et classement | **Classement global**, ouvert à tous (choix du 04/11, ticket #14, retire « Motivation ») : par épreuve et général (somme des records), de toujours et de la semaine ; épreuves notées, le Chrono d'abord (points selon la justesse et la distance, `docs/etudes/2026-11-04-points-classement.md`), puis Sans faute et Minute (06/11 : au toucher, classements par épreuve, hors du général) ; les séances de révision restent sans points |
| Identité | Nom **Terramemo**, accent bleu océan `#3d72f0` ; téléphone de mesure : Android récent (2023+) |

## Pédagogie

- **FSRS** par `ts-fsrs` (licence à vérifier), en dépendance figée : pas de
  recopie des formules (une seule base de code).
- Une fiche = (fait, sens) : « où est X ? » et « quel est ce pays ? » sont
  deux fiches sœurs, jamais le même jour (jour local, bascule à 4 h).
- **Le QCM est une étape d'apprentissage hors FSRS** (comme les learning
  steps d'Anki) ; FSRS démarre au premier rappel sans aide. Sinon la
  probabilité de rappel est surestimée.
- Nouveautés par grappe régionale (5 à 8 par séance), révisions mélangées
  entre régions. Leurres tirés de la matrice des confusions de
  l'utilisateur (dès qu'elle a des données).
- « Je connais déjà » et test de placement → première note « Easy ». Pas de
  modèle Elo au MVP ; plus tard, difficulté de chaque pays apprise des
  réponses de tous les joueurs (le public le rend possible).
- **Maîtrisé = stabilité ≥ 21 jours.** La carte se colore selon la
  stabilité (pas la probabilité du jour, qui récompenserait le bachotage) ;
  une carte par domaine, la fiche la plus faible du pays décide. Échelle
  d'une seule teinte, sans vert ni rouge (réservés au juste et au faux),
  « jamais vu » distinct de « faible ».
- Rythme à annoncer : ~390 fiches pays (deux sens), ~780 capitales et
  drapeaux ; à 8 nouveautés par jour, ~5 mois pour tout voir.
- Justesse des prévisions mesurée sur les premières réponses des fiches
  dues (≥ 300 réponses), pas sur un examen de 20 questions.

## Données

- **Frontières : Natural Earth v5.1.2** (domaine public), 1:10m simplifié à
  ~2 km : 434 Ko compressés (mesuré). Version de mapshaper figée.
- **Liste : 193 membres de l'ONU + Vatican + Palestine** ; Kosovo et Taïwan
  en paquet optionnel, territoires (Groenland, Nouvelle-Calédonie…) en
  paquet à part.
- **Micro-États en pastilles** ; test : aucune géométrie vide.
- **Noms par langue : CLDR** + fichier maison d'alias par pays (aucun
  retrait de mots à la normalisation : « république de » confondrait les
  deux Congo). Test de collision sur toutes les paires de noms normalisés.
- **Capitales, populations : Wikidata** (CC0), extrait figé et daté ;
  capitales multiples gérées à la main.
- **Drapeaux : flag-icons** (MIT), 454 Ko.
- **Identifiants maison stables** (`pays:TUR:localiser`) : Natural Earth
  donne -99 en ISO_A2 à 22 entités.
- Pas de tuiles : tout dessiné par le code, rien d'externe.
- Script `geodata/build.mjs` (Node), sorties versionnées, `sources.json`
  daté (mention de source et de date obligatoire pour la Licence Ouverte
  d'IGN, dès les communes de La Réunion, J1c).

## Technique

- **TypeScript + Vite, sans framework**, une base pour le site et l'APK
  (**Capacitor**). Natif Kotlin écarté : la carte et la logique en double
  (le coût vu dans Light).
- **Carte en Canvas 2D par défaut** (décision « Rendu par défaut » du 06/11,
  séance du J0 sur le téléphone : seul rendu sans saccade, Chrome et APK),
  projection Equal Earth qui tourne comme un globe (décision « Carte qui
  tourne », départ Monde ou Pacifique), carte allégée pendant les gestes ;
  WebGL2 et SVG (d3-geo + d3-zoom, rendus g et css) au choix dans ⚙ ; la
  carte de l'île en SVG.
- **Notation par rapport à la cible demandée** (dedans, ou dans la
  tolérance d'un micro-État) ; `pick(x, y)` sert seulement à la rétroaction
  et aux confusions. Distance au bord le plus proche du bon pays
  (géodésique). Seuil entre toucher et déplacer.
- **Journal de réponses en ajout seul** (IndexedDB) :
  `{v, id, appareil, ts, fiche, type, mode, réponse, correct, durée_ms,
  distance_km?}`, avec des événements hors réponse (« je connais déjà »,
  suspendre, réinitialiser). Rejeu déterministe (`ts`, `appareil`, `id`).
- **`server.androidScheme` et `hostname` figés** dans
  `capacitor.config.ts`, avec un test : les changer rendrait la base locale
  invisible.
- **Service worker sur le web seulement** (`!Capacitor.isNativePlatform()`),
  cache versionné.
- **Firebase (Spark)** : Auth anonyme au premier lancement, Google ensuite
  (web : flux habituel ; APK : plugin Capacitor natif puis
  `signInWithCredential` du SDK web), ou e-mail et mot de passe (SDK web
  partout : mot de passe oublié, adresse vérifiée). La connexion **lie** le compte
  anonyme (`linkWithCredential`), qui garde son identifiant, donc ses
  progrès et ses scores ; un compte Google déjà lié ailleurs demande de
  fusionner les journaux. Empreintes SHA-1 : clé de la CI, puis
  celle de Play App Signing. Firestore : **un document par séance** (pas par
  réponse) + un résumé par joueur + son meilleur score par épreuve
  (classement) ; 20 000 écritures et 50 000 lectures par
  jour → ~10 000 séances par jour (estimé).
- **Hosting Spark : 360 Mo de transfert par jour** → ~200 nouveaux
  visiteurs par jour à ~2 Mo le premier chargement (estimé) ; plan B
  Cloudflare Pages. L'APK ne passe pas par Hosting.
- Saisie : `autocomplete`, `autocorrect`, `autocapitalize` à « off »,
  `spellcheck="false"`, à vérifier avec Gboard ; sinon clavier de lettres
  dans l'appli.
- Pas de serveur, rien sur le Pi, pas de Docker.
- Tests : Vitest (rejeu et fusion du journal, générateurs, normalisation et
  collisions, données : géométries non vides, identifiants uniques, budget
  de poids) ; règles Firestore sur l'émulateur ; UI par le pilote CDP de la
  convention (skill `run-terramemo`, port 8060, driver 8061).
- CI : `ci.yml` à chaque push ; `android.yml` sur tag ou à la demande (APK,
  puis AAB pour le Store).

## Play Store (à préparer tôt)

- Compte personnel récent : **test fermé de 12 testeurs pendant 14 jours
  d'affilée**, par appli (sources tierces concordantes, page officielle à
  relire), 25 $ une fois, politique de confidentialité, formulaire sur les
  données collectées, **suppression du compte depuis l'appli et le web**.
- Vérification des développeurs Android en cours de déploiement
  (2026-2027) : conditions finales à vérifier.

## Jalons

| # | Contenu | Critère de fin | Taille |
|---|---|---|---|
| J0 Risques | Script de données (pays, pastilles) ; carte dans Chrome sur le téléphone puis dans un APK Capacitor ; zoom, déplacement, micro-États, Pacifique ; saisie avec Gboard ; projet Firebase créé | Sur le téléphone : aucune saccade visible au déplacement, rendu < 1 s, toucher → réponse < 100 ms ; sinon décision écrite (Canvas, simplification au dézoom) | S |
| J1c La Réunion | **Avant le J1a** (décision « Contenu » du 06/11, #15). Les 24 communes (IGN ADMIN EXPRESS COG CARTO, Licence Ouverte 2.0, source et date affichées sur la carte de l'île), série « La Réunion » de Toucher et du Chrono (classement propre, compte dans le général, barème 500 × e^(−d/5 km)) ; Nommer (zone allumée, 4 noms, un seul essai) pour toutes les séries, pays compris ; la répétition espacée leur viendra avec le J1a. **Fait le 06/11** (branche `reunion`) : données et tests, carte de l'île, Toucher, Nommer, Chrono, règles, pilote ; reste l'essai sur le téléphone (Chrome puis APK) | 24 communes jouables au doigt, site et APK ; données vérifiées par test en CI | S |
| J1a MVP pays | Localiser et nommer (QCM d'apprentissage puis rappel au toucher) ; FSRS ; séances ; rétroaction et distance ; carte colorée ; journal local + Auth anonyme et Firestore ; App Check (l'épreuve Chrono et ses classements sont en ligne depuis le 04/11, avant le J1a) ; site déployé, APK (release privée), écran Crédits | 195 pays jouables au doigt ; CI au vert ; une semaine d'usage sans blocage | L |
| J1b Comptes et saisie | Saisie libre tolérante + tests de collision ; connexion Google (site et APK) et compte e-mail et mot de passe (#13) ; suppression du compte ; politique de confidentialité ; export JSON | Deux appareils, l'un hors ligne, au même état après reconnexion | M |
| J2 Capitales et drapeaux | Capitales (deux sens, multiples) ; drapeaux ; leurres par confusions ; test de placement ; justesse des prévisions ; objectif quotidien ; notification optionnelle | Capitales et drapeaux vérifiés par test ; écart prévu/réel mesurable dès 300 réponses | M |
| J3 Play Store | Fiche, formulaire de données, test fermé 14 j, AAB en CI ; anglais possible | Appli en production | M |
| J4 Culture large I | Voisins ; placer une ville (note par distance) ; ordres de grandeur (curseur logarithmique) ; silhouettes (sans rien de quotidien ni de flèche de direction) | Chaque exercice : générateur testé + fiches | M |
| J5 Géographie physique | Mers, détroits, montagnes, déserts, puis une centaine de fleuves | Poids dans le budget, aucun nom manquant | L |
| J6 France et DROM | Régions, départements, DROM en encarts (IGN Admin Express, Licence Ouverte) ; les communes de La Réunion sont au J1c | 101 départements jouables, encarts compris | M |

## Risques

| Risque | Parade |
|---|---|
| Carte qui saccade dans la WebView | Mesure au J0 ; repli Canvas derrière `pick(x, y)` |
| Micro-États et Caraïbes intouchables | Pastilles, tolérance, zoom, essai au J0 |
| Quota Hosting atteint par un public | Cache du service worker ; plan B Cloudflare Pages |
| Quotas Firestore | Un document par séance, résumé par joueur, un meilleur score par épreuve et par joueur |
| Triche au classement (pas de serveur sur Spark) | Règles Firestore (bornes, durée par `request.time`), App Check, réponses gardées pour un audit sur le PC |
| Perte des progrès (origine changée, clé perdue) | Origine figée et testée, Firestore dès J1a, clé de signature sauvegardée hors GitHub |
| Saisie injuste ou trop large | Alias explicites, test de collision, tolérance selon la longueur |
| Frontières contestées | De fait + hachures, jamais en question |
| Données qui vieillissent | Script relançable, sources datées |
| Ressembler à un jeu existant | Conception originale : pas de défi quotidien façon Worldle, mise en page propre |
