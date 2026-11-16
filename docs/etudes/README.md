# Études préparatoires (04/11/2026)

*Chaque étude décrit l'état du projet et les choix connus à sa date (le
dépôt est public depuis sa création ; certaines disent encore « privé »).
J0, J1a… sont les jalons de `docs/plan.md`, les #N mes tickets de suivi.*

Faites avant toute ligne de code, par un workflow de cinq agents :

- `2026-11-04-pedagogie.md` : science de l'apprentissage, catalogue d'exercices ;
- `2026-11-04-donnees.md` : sources géographiques, licences, poids mesurés ;
- `2026-11-04-technique.md` : architecture site + APK, comparaison des options ;
- `2026-11-04-synthese-agents.md` : premier plan, écrit sans les réponses de l'utilisateur ;
- `2026-11-04-critique.md` : relecture adverse de ce premier plan.

Étude suivante, faite seule :

- `2026-11-04-points-classement.md` : points des épreuves (modes, barème
  par la distance, chiffré sur la carte) et classement sur Firebase
  (proposition, à trancher, ticket #14).

Conception, faite seule (06/11/2026) :

- `2026-11-06-reunion.md` : quiz des communes de La Réunion (J1c, avancé
  avant le J1a) et Nommer : données de l'IGN, carte de l'île, bascule de
  terrain, séries, QCM à 4 choix, Chrono de l'île, crédits, unités
  d'implémentation et vérifications (ticket #15).
- `2026-11-06-j1a-conception.md` : MVP des pays (J1a) : ts-fsrs, journal
  et rejeu, jour local, note, séance, grappes, interface, carte de la
  mémoire, synchro Firestore, lots, et les décisions en attente de
  l'utilisateur avec leur défaut codé (ticket #2) ; faite par un workflow
  (plan, relecture adverse, carte du code).

Conception du J1b (07/11/2026) :

- `2026-11-07-j1b-conception.md` : comptes et synchro (Google sur le
  site et dans l'APK, e-mail et mot de passe, lien de l'invité, envoi
  par lots, union du journal, session perdue), suppression du compte,
  export, confidentialité, outil du propriétaire, étapes de la console,
  lots 0 à 9 et décisions D15 à D35 (tickets #3 et #13). La saisie libre
  n'y est pas conçue. Faite par un workflow : trois relevés, un jet,
  trois relectures adverses, une synthèse.

Conception du J2 (10/11/2026) :

- `2026-11-10-j2-conception.md` : capitales, drapeaux, océans et mers, quiz
  général (tickets #4, #27 et #26) : données (Wikidata, flag-icons, zones
  marines de Natural Earth, notoriété), modèle, couche marine de la carte,
  exercices, mémoire à plusieurs sujets, Jouer, classements, quiz à quatre
  difficultés, lots 0a à 6 et décisions D36 à D55. Faite par un workflow :
  six relevés, une rédaction, deux relectures adverses (code existant ;
  produit, pédagogie et données), une correction.

Besoin (16/11/2026) :

- `2026-11-16-fiche-lieu.md` : fiche d'un lieu touché à l'accueil (pays
  et territoires, océans et mers, communes de La Réunion) : choix de
  l'utilisateur, contenu, propositions à trancher, points de conception
  (ticket #34).

Conception de la fiche d'un lieu (16/11/2026) :

- `2026-11-16-fiche-lieu-conception.md` : 332 lieux, données (Banque
  mondiale, Wikidata, CLDR, tz, IGN, tables relues), barre et fiche,
  historique et retours, voisins, bilans, garde de la partie en suspens,
  « Apprendre ce lieu », photos (candidats, licences, outil de relecture,
  service worker, APK), tests, lots F1 à F9 et P1 à P3, décisions D56 à
  D61 (ticket #34). Faite par un workflow : cinq relevés, une rédaction,
  deux relectures adverses, une correction.

Le plan arrêté, qui tient compte des réponses de l'utilisateur et de la
critique, est `../plan.md` : il fait foi là où ces études divergent.
