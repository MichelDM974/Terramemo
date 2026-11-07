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

2. **File sans stockage : l'avis promet un départ qui n'aura pas lieu.**
   Quand `localStorage` est refusé ou plein, `ecrireAttente` avale l'erreur
   et rien n'entre dans la file. L'avis dit pourtant « il partira au retour
   du réseau ». Le record lui-même n'est pas gardé non plus (`enregistrer`),
   donc rien n'est perdu de plus qu'avant : seul l'avis est faux.
   *Correctif* : `ecrireAttente` et `marquer` rendent un booléen, et l'avis
   reprend « il reste sur cet appareil » quand la file n'a pas pu s'écrire.

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

4. **Test instable sous charge.** Dans `tests/carte-webgl.test.ts`, « chaque
   entité et zone est maillée, plages contiguës, indices dans les sommets »
   dépasse le délai de 5 s quand le PC est chargé : 5,5 s le 07/11, charge
   17, lors d'un `npx vitest run` complet. Seul, le fichier passe (34 sur
   34).
   *Correctif* : un délai propre à ce test, ou un maillage du test allégé.
   Critère : la suite complète passe sous forte charge.

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

## Gestes de l'utilisateur, suivis ailleurs

- #24 : `python3 centre-de-controle/scripts/relais_ci.py installer Terramemo`
  (runner du PC pour le relais de la CI).
- #18 : essai au doigt sur l'A37 de l'arbre de Jouer, de « Rejouer » et du
  bouton retour.
- #2 : le 13/11, `outils/pastilles.py --sauver`, puis trancher Q3 (B, C, ou
  rien) sur la ligne « => Q3 ».
