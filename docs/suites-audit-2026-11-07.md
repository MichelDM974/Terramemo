# Restes de l'audit du 07/11/2026 (#25)

L'audit de « Mes Projets » du 07/11 a relevé, pour Terramemo, les constats
`terramemo-code-1` à `-3`, `terramemo-suivi-1`, `-2`, `-4` et `git-4`. Tout est
corrigé, en ligne et vérifié :

- règles du classement : la clé est le pseudo en minuscules, et le pseudo
  stocké reste à score égal (`cleDuPseudo`, copiée dans l'appli par
  `clePermise`, #14) ;
- file des scores faits hors ligne (`terramemo.chrono.attente`, #14) ;
- outil de mesure de Q3, `outils/pastilles.py` du skill `run-terramemo` (#2) ;
- README, plan et étude du J1a à jour (#2) ;
- CI lue dans `CI_RUNNER`.

Deux relectures adverses par des agents ont suivi chaque correctif. Ce qui
suit en reste. Chaque point se clôt par un correctif avec son test, ou par un
« non » de l'utilisateur.

Le 14/11, les défauts 1 à 4 sont corrigés (branche `audit-restes`), chacun
avec son test ; seul le point 5 reste, à vérifier en production.

## Défauts

1. **File des scores : une erreur qui n'est pas du réseau passe pour une
   coupure.** `envoyer()` (`src/vues/classement.ts`) met dans la file tout
   envoi rejeté. `publier()` (`src/epreuve/classement.ts`) ne traite à part
   que `permission-denied`. Un quota Spark épuisé (`resource-exhausted`) ou
   une connexion anonyme refusée (`auth/too-many-requests`,
   `auth/admin-restricted-operation`) affichent donc « Score non publié (hors
   ligne ?) : il partira au retour du réseau. ». Le joueur est pourtant en
   ligne, et toute la file repart à chaque déclencheur.
   *Correctif* : ne mettre en file que les erreurs réseau (`unavailable`,
   `deadline-exceeded`, `auth/network-request-failed`, échec du chargement
   du SDK). Pour les autres, compter un échec sans rien promettre, ou
   plafonner les essais par entrée.
   **Corrigé** (827ce72) : `erreurReseau` (`src/sync/firebase.ts`) ; un
   autre échec sort de la file et se compte à part (`Publication.locaux`),
   avec « Score non publié : il reste sur cet appareil pour l'instant. ».
   Écart au correctif : `unknown` compte aussi pour le réseau, car
   Firestore lite le rend quand `fetch` échoue (hors ligne, sans statut
   HTTP) ; `unavailable` n'est qu'un 503. `charger()` donne le code
   `terramemo/sdk-indisponible` à toute erreur sans code. Pas de plafond
   d'essais (il changeait le format de la file). Une erreur sans code
   (SyntaxError d'un portail captif qui répond 200 en HTML) reste hors
   réseau : vérifié dans les SDK, elle n'arrive pas jusque-là, Firestore
   lite en fait un `unknown` et Auth un `auth/network-request-failed` ;
   sans code, c'est un bogue de l'appli (12600bd).

2. **File sans stockage : l'avis promet un départ qui n'aura pas lieu.**
   Quand `localStorage` est refusé ou plein, `ecrireAttente` avale l'erreur
   et rien n'entre dans la file. L'avis dit pourtant « il partira au retour
   du réseau ». Le record lui-même n'est pas gardé non plus (`enregistrer`),
   donc rien n'est perdu de plus qu'avant : seul l'avis est faux.
   *Correctif* : `ecrireAttente` et `marquer` rendent un booléen, et l'avis
   reprend « il reste sur cet appareil » quand la file n'a pas pu s'écrire.
   **Corrigé** (75f572b) : même avis que pour le point 1. `marquer` relit
   la file quand l'écriture échoue : une entrée déjà là d'un échec d'avant
   reste promise.

3. **Règles : la forme du pseudo n'est pas vérifiée.** `scoreValide`
   (`firestore.rules`) accepte des caractères invisibles (`\p{C}`, par
   exemple U+200B ou le trait d'union conditionnel), des espaces au bord ou
   doublées, et la forme NFD. `pseudoValide` les retire ou les refuse ; un
   client modifié, lui, peut créer des lignes qui s'affichent comme un nom
   existant, même ASCII (« Michel » + U+200B).
   *Correctif* : ajouter à `scoreValide`
   `d.pseudo.matches('[^\\s\\p{C}]+( [^\\s\\p{C}]+)*')` et la même règle à
   `pseudoValide`, avec un cas au test croisé de `tests/regles.test.ts`. Les
   homoglyphes (і cyrillique) et le NFD restent : on ne les arrête pas sans
   serveur.
   **Corrigé** (df73435) : `formePseudo` des règles, recopiée dans l'appli,
   avec le motif `[^\p{Z}\p{C}]+( [^\p{Z}\p{C}]+)*`. `\p{Z}` remplace
   `\s`, qui n'est que l'ASCII dans le RE2 des règles : l'espace insécable
   ou fine serait passée. Prix : les emojis composés par U+200D (famille,
   drapeau arc-en-ciel) sont refusés. Le test croisé compte 17 cas de
   forme, dont « Élodie » + U+200B (branche masquée de `cleDuPseudo`) et
   « Michel », « Wiwi » ; il est à lancer sur l'émulateur
   (`npm run test:regles`), puis les règles à déployer avant le site.
   Puis (8ed2cbb) : dans l'appli, `\p{C}` écrit en entier
   (`\p{Cc}\p{Cf}\p{Co}\p{Cs}`), car celui de JS compte aussi les points
   de code non assignés (Cn), que celui de RE2 n'a pas : un emoji plus
   récent que l'Unicode d'une vieille WebView y faisait perdre au joueur
   son pseudo. Cas U+0378 (accepté) et usage privé (refusé) au test croisé.

4. **Test instable sous charge.** Dans `tests/carte-webgl.test.ts`, « chaque
   entité et zone est maillée, plages contiguës, indices dans les sommets »
   dépasse le délai de 5 s quand le PC est chargé : 5,5 s le 07/11, charge
   17, lors d'un `npx vitest run` complet. Seul, le fichier passe (34 sur
   34).
   *Correctif* : un délai propre à ce test, ou un maillage du test allégé.
   Critère : la suite complète passe sous forte charge.
   **Corrigé** (a791724) : ni délai ni maillage allégé, la lenteur venait
   d'un `expect` par indice de triangle (~340 000). Les écarts sont comptés
   en boucle, puis un seul `expect` : 1,7 s → 11 ms à vide. Même chose pour
   « milieux : chaque sommet porte le milieu… » (1,8 s à vide, le suivant à
   dépasser). Le plus lent du fichier fait 0,9 s. La suite complète sous
   forte charge reste à voir.

## À vérifier au premier vrai usage

5. **La branche masquée de `cleDuPseudo` en production.** Elle juge les
   pseudos à majuscule non ASCII (« Élodie »). Elle n'est vérifiée que sur
   l'émulateur : 37 couples clé–pseudo confrontés aux règles et à
   `clePermise`. En production, le 07/11, la clé fausse et le renommage à
   score égal ont été refusés, et la republication de « Michel » acceptée.
   Mais aucun pseudo en ligne n'est accentué (« Michel », « Wiwi »). Le
   premier joueur à majuscule accentuée qui publie le dira. S'il voit
   « Score refusé par le classement », c'est que `replace` ou `matches` se
   comportent autrement en ligne sur l'Unicode : comparer avec la sonde de
   l'émulateur, dans le commentaire de `cleDuPseudo`.

   *Vérifié le 14/11/2026 en production*, une fois les règles de la forme du
   pseudo déployées : un invité anonyme a publié au Chrono Océanie
   (`toujours`) « Élodie » sous la clé `élodie`, accepté par la branche
   masquée ; « Élodie » sous `élodiex` et « Élodie » + U+200B ont été refusés
   (`formePseudo` et RE2 en ligne). La ligne d'essai a été effacée aussitôt
   par le SDK Admin (relue après lecture, `lastUpdateTime`).

## Gestes de l'utilisateur, suivis ailleurs

- #24 : `python3 centre-de-controle/scripts/relais_ci.py installer Terramemo`
  (runner du PC pour le relais de la CI).
- #18 : essai au doigt sur l'A37 de l'arbre de Jouer, de « Rejouer » et du
  bouton retour.
- #2 : fait le 14/11, Q3 tranchée (A, rien à changer).
