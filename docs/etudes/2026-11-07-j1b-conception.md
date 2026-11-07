# J1b, comptes et synchro : conception (07/11/2026, #3 et #13)

**Étude finale** du 07/11, à coder sans re-concevoir. Elle est faite par un
workflow :
- trois relevés : carte du code au commit `b948f87`, comptes de Light,
  faits externes sourcés ;
- un premier jet ;
- trois relectures adverses : perte de données et synchro ; sécurité, vie
  privée et quotas ; usage réel et faisabilité.

Chaque constat a été revérifié dans le code ou à la source avant d'entrer
ici. Ce qui a été écarté ou nuancé est au § 14.

Ce que couvre l'étude :
- comptes : Google sur le site et dans l'APK, e-mail et mot de passe,
  lien de l'invité ;
- synchro des séances (suite du § 8 de `2026-11-06-j1a-conception.md`) ;
- suppression, export, confidentialité, outil du propriétaire.

La **saisie libre** du J1b (#3) vient après, dans un lot à part (§ 9,
lot 9). Elle n'est pas conçue ici. La synchro est toutefois faite pour
qu'elle puisse ajouter un mode ou un champ sans casser un APK resté en
retard (§ 5.3).

Décisions actées qui priment en cas d'écart :
- « Comptes », « Public et modèle », « Diffusion », « Hébergement » ;
- « Une place par pseudo », « Signature de l'APK » ;
- « App Check et service worker hors du J1a », « Langue » ;
- et aussi « Une seule base web » et « Licences tierces ».

Fin du jalon :
- **#3** : deux appareils, l'un hors ligne, au même état après
  reconnexion, à version égale de l'appli (§ 5.3) ;
- **#13** : un compte e-mail créé sur le site, retrouvé dans l'APK avec ses
  progrès et ses scores.

Les choix de l'utilisateur sont au § 10 : D8, D9 et D15, reprises du J1a,
puis D16 à D35. En attendant une réponse, le code prend un **défaut
réversible** : une constante nommée, commentée « défaut en attente de
l'utilisateur, #3 ». Trois décisions n'ont pas de défaut : D15 (ouverture
au public), D20 (adresses de contact) et D25 (identité dans la
politique).

Rien n'est visible pour le public avant le lot 8. Il faut d'abord :
- la politique, la page de suppression et la suppression du compte, en
  ligne ;
- la réponse à D15.

Chaque lot est quand même déployé sur Hosting après son commit (règle de
« Mes Projets »), avec les comptes cachés.

Le J1a reste dans sa semaine d'usage jusqu'au 13/11 (§ 8).

Résumé des choix :

- **synchro réservée aux comptes** (D16) : l'invité anonyme n'envoie rien,
  et son journal part au lien. Les règles l'imposent par les **identités
  du compte** (`firebase.identities` : `email` ou `google.com`). Elles ne
  regardent pas `sign_in_provider`, dont la valeur après un lien n'est
  prouvée nulle part (§ 6) ;
- invité anonyme créé **à la demande** (D9 b), comme dans le code actuel.
  La version du 06/11 de « Comptes » ne fixe plus le moment ;
- lien de l'invité par `linkWithCredential` (l'uid est gardé), puis
  `getIdToken(true)`. Si le compte existe déjà : `signInWithCredential`,
  puis **union** du journal local, après la question D22 ;
- un document par **lot** d'une séance
  (`joueurs/{uid}/lots/{id du premier événement}`), en création seule
  (D32). Les événements y forment une **chaîne bornée**, encodée par
  position (≈ 100 octets par réponse). Les règles bornent ainsi la taille
  de chaque document (D34) ;
- état d'envoi dans une base IndexedDB à part, **`terramemo-synchro`**.
  `terramemo-journal` reste en version 1, sans migration ;
- « déjà en ligne » se juge sur les ids **lus en ligne**, jamais sur la
  composition locale. Un refus des règles est relancé plus tard. Un lot
  d'une version plus récente de l'appli est gardé brut et relu après la
  mise à jour ;
- une **session perdue** (mot de passe changé ou compte supprimé ailleurs)
  n'est pas une déconnexion : le journal est gardé, rien ne part, et
  l'appli demande de se reconnecter ;
- profil `joueurs/{uid}` = pseudo et records, écrit **par transaction**
  (le maximum par clé) ;
- Google : popup sur le site. Dans l'APK, plugin natif
  `@capawesome/capacitor-google-sign-in` 0.1.4 (MIT), puis lien par le SDK
  web. Ni `google-services.json`, ni SDK Firebase natif ;
- déconnexion : journal local effacé une fois tout envoyé, de façon
  reprenable (D24) ;
- suppression par le client, sans Cloud Functions : réauthentification,
  **pierre tombale** (les règles refusent alors les écritures des autres
  appareils du compte), lots, puis `deleteUser` ;
- confidentialité : `public/confidentialite.html`, plus
  `public/suppression.html`, le lien web qu'exige Play. Un **outil du
  propriétaire**, lancé à la main sur le PC (D33), tient les durées de
  conservation, les abus et les demandes.

## 1. Ce qui existe et ce qui manque

| Élément | Existe (`b948f87`) | Manque |
|---|---|---|
| Firebase | `charger()` et `compte()` privées (`classement.ts:61,90`) ; `firebase/auth` chargé en entier, à la demande ; Firestore lite, avec `runTransaction` et `writeBatch` | `src/sync/firebase.ts` partagé ; `auth.languageCode = 'fr'` |
| Auth | anonyme seulement, créé à la première publication (`classement.ts:106-108`) | e-mail et mot de passe, Google, lien, conflits, réauthentification, session perdue, suppression |
| Fournisseurs | `firebase.json` : `auth.providers.anonymous: true` | e-mail et Google, activés dans la console (§ 4.3, D29) |
| Journal | `Depot { ajouter, tous }` ; `ajouter` refuse tout le lot au premier invalide (`depot.ts:51-56`) et ignore un id déjà gardé (`:188-196`) ; `tous()` filtre par `valider` (`:201-205`) ; base v1, index `seance` | `Depot.vider()` ; état d'envoi ; `Memoire.fusionner()` et `Memoire.effacer()` |
| Mémoire | `ecrire` applique tout de suite, puis écrit dans une file qui ne rejette jamais (`memoire.ts:113-125`) ; repli `depotMemoire` si la lecture échoue (`:83-89`) | événements de la page gardés (rejeu d'union) ; rejeu complet différé si l'horloge recule |
| Rejeu | invariant par union et par doublons (`rejeu.ts:7-10`) ; `appliquer()` ne vaut que pour un événement plus récent que l'état (`:76-86`) | rien |
| Séance | un uuid par séance, tous blocs compris (`vues/seance.ts:189-193`) ; une écriture par réponse (`:230`) ; `terminer()`, `bilan()` (`:235-238`) ; partie libre : un uuid, sans fin (`:288-300`) | règle « séance close » (§ 5.2) |
| Règles | `classements/**` seul, le reste fermé ; 15 tests, dont « `joueurs/ana` refusé » (`regles.test.ts:229-235`) | `joueurs/{uid}`, `lots/{id}` ; tests de propriété, de bornes, de pierre tombale |
| Index | 4 index composites des `scores` ; `fieldOverrides` vide | exemptions pour les champs des lots et du profil (§ 6) |
| Pseudo, records | localStorage : `terramemo.pseudo`, `terramemo.chrono.records` (24 épreuves de toujours, plus celles de la semaine en cours : `chrono.ts:232,303-318`) | les deux dans le compte (critère de #13) |
| Interface | ⚙ avec un lien Crédits (`index.html:61`, `main.ts:144`) ; vues `NomVue` et `VUES` (`main.ts:235-238`) | vue `compte`, vue `confidentialite`, liens, invites |
| Textes | `textes.fr.json`, tutoiement | objets `compte`, `synchro`, `confidentialite` |
| Pilote | `window.terramemo` (`main.ts:363-375`) ; le driver ne vide que `terramemo` et vérifie qu'aucune autre base ne disparaît (`driver.py:2166-2229`) | `synchro()` ; `sauver_journal`, `restaurer_journal` (§ 8) ; `terramemo-synchro` dans `BASES_GARDEES` |
| Garde-fous | `?emulateurs`, en DEV seulement | `?sans-synchro` et `terramemo.sans-synchro` ; `comptesVisibles()` (§ 8) |
| APK | clé stable, SHA-1 `F3:97:0D:57:74:3B:B7:AB:0E:EE:8A:B8:55:9E:81:46:08:7F:94:FA` ; build « debug » de production (`npm run build`, puis `assembleDebug` : `driver.py:2949-2951`), 5,31 Mo | plugin Google, client OAuth Android, licences, drapeau `terramemo.comptes` |

**Constat qui simplifie** : l'uid anonyme ne porte aujourd'hui **aucune
donnée**.
- Les places du classement sont nommées par le pseudo, sans champ uid
  (`firestore.rules:105-123`).
- Aucune séance n'est en ligne.

Perdre ou changer cet uid ne coûte donc rien. Ce qui compte, c'est le
journal IndexedDB de l'appareil, et c'est lui qu'il faut protéger (§ 8).

## 2. Modèle des comptes

### 2.1 Quatre états

| État | Auth | Synchro | Pseudo, records |
|---|---|---|---|
| **Invité, sans uid** | aucun utilisateur (rien chargé de Firebase) | non | localStorage |
| **Invité anonyme** | `isAnonymous`, créé par `compte()` à la première publication (D9 b) | **non** (D16) | localStorage |
| **Compte** | fournisseur `password` et/ou `google.com` | oui | profil `joueurs/{uid}`, recopié en localStorage |
| **Session perdue** | aucun utilisateur, mais `session.uid` connu (`terramemo-synchro`, § 2.5) | en pause | localStorage, gardés |

- Le passage invité → compte se fait toujours depuis la vue Compte (§ 3),
  par un geste de l'utilisateur.
- Un invité sans uid devient un compte par simple création
  (`createUserWithEmailAndPassword`, `signInWithCredential`). Il n'y a
  rien à lier.
- `session.uid` (dernier compte connecté) dit au démarrage s'il faut
  charger Firebase, sans le charger pour un invité.

### 2.2 Lier l'invité (nouveau compte)

S'il existe un `currentUser` anonyme :
- **e-mail** :
  `linkWithCredential(user, EmailAuthProvider.credential(adresse, mdp))`.
  - Le SDK 13.2 lie par `/v1/accounts:signUp` avec l'`idToken`
    (`_linkToIdToken`, dans
    `node_modules/@firebase/auth/dist/esm/index-Bz2J43nW.js:4228-4237`).
  - C'est la voie que donne la doc de la protection contre l'énumération.
    Elle permet ce lien dès le SDK web 10.6.0.
  - Essai réel au premier passage sur le vrai projet (S15).
- **Google** :
  - sur le site : `linkWithPopup(user, GoogleAuthProvider)` ;
  - dans l'APK :
    `linkWithCredential(user, GoogleAuthProvider.credential(idToken))`,
    avec l'`idToken` du plugin (§ 4).

Dans les deux cas :
- l'uid est gardé ;
- puis `getIdToken(true)`, et le pilote relève les claims (`identities`,
  `sign_in_provider`, S16) ;
- puis `assurerProfil()` (§ 5.4, sur le modèle de l'`ensureProfile` de
  Light) ;
- puis un envoi complet du journal local (§ 5.2).

**Jamais de `signOut` avant le lien** : il ferait perdre l'anonyme, contre
la décision « Comptes » (lien, pas copie).

### 2.3 « Ce compte existe déjà » (deuxième appareil, ou compte créé ailleurs)

Comment le reconnaître :

| Cas | Signe | Pour se connecter |
|---|---|---|
| Google | `auth/credential-already-in-use` au lien | site : `GoogleAuthProvider.credentialFromError(err)` ; APK : le même `idToken`, sinon un second `signIn()` (S23) |
| Google, adresse déjà prise par un compte à mot de passe | `auth/email-already-in-use` au lien | `signInWithCredential` du même credential. Pour une adresse `@gmail.com` non vérifiée, Google remplace le mot de passe (S5). Sinon `auth/account-exists-with-different-credential`, avec le message « Ce compte se connecte par mot de passe : connecte-toi avec ton adresse » |
| E-mail, formulaire « Créer un compte » | `auth/email-already-in-use` (toujours renvoyé, même sous la protection contre l'énumération) | aucun : on bascule vers « Se connecter », adresse pré-remplie |
| E-mail, formulaire « Se connecter » | pas de lien tenté | `signInWithEmailAndPassword` |

Étapes, pour un appareil B (journal local J_B) qui rejoint le compte A :

1. **Avant de quitter l'état présent**, noter `uidAvant` (l'anonyme, ou
   l'uid d'une session perdue), puis :
   - J_B vide, ou J_B déjà celui de A (session perdue de A) : aucune
     question ;
   - J_B contient des séances non envoyées d'un autre compte (session
     perdue de X) : « {n} séances d'un autre compte n'ont pas été
     envoyées. Les ajouter à ce compte ? » ;
   - sinon (D22) : « Ajouter les progrès de cet appareil ({n} réponses) à
     ton compte ? ».

   Boutons :
   - **Ajouter** : bouton principal, en premier ;
   - **Ne pas les ajouter** : style danger, puis une seconde
     confirmation : « {n} réponses de cet appareil seront effacées. ».
     Sur le site, elle propose « Exporter d'abord » ;
   - **Annuler**.
2. Se connecter :
   - `signInWithCredential(cred)` ou `signInWithEmailAndPassword` ;
   - `currentUser.uid` devient A, puis `getIdToken(true)` ;
   - l'anonyme B reste orphelin dans Auth. Il ne porte rien (D16), et
     l'outil du propriétaire le retire au bout de 30 jours (D33).
3. Si « Ne pas les ajouter » est confirmé : `memoire.effacer()`
   **maintenant**, avant la restauration. Plus tard, l'effacement viderait
   aussi le journal restauré.
4. `session.uid = A` dans `terramemo-synchro` (les envois sont rangés par
   uid, § 5.1).
5. **Restaurer** :
   - lire `joueurs/A/lots` (§ 5.3) ;
   - `memoire.fusionner(evts)` ;
   - noter `en_ligne` les ids lus.
6. **Envoyer** les événements locaux qui ne sont pas en ligne pour A
   (§ 5.2). Ce sont ceux de J_B si l'utilisateur a choisi « Ajouter ».
7. **Profil** (§ 5.4) :
   - le pseudo du compte l'emporte sur celui de l'appareil. L'ancien
     pseudo local est dit une fois : « Ton pseudo est maintenant {pseudo}
     (celui du compte) » ;
   - les records sont fusionnés au maximum par épreuve, par la transaction
     du § 5.4.

Ce qui arrive aux données :

| Donnée | Sort |
|---|---|
| Événements de B | ajoutés au journal de A, sans perte ni doublon (union par `id`). Le rejeu donne le même état partout (§ 5.6) |
| Séances déjà envoyées sous `uidAvant` | aucune avec D16 a. Avec D16 b, elles restent orphelines sous `joueurs/B` ; le journal local les contient et les renvoie sous A |
| Places du classement | rien ne change : elles appartiennent au pseudo, pas à l'uid (D23) |
| Records de B | fusionnés au maximum dans le profil de A. Ceux qui progressent sont republiés sous le pseudo du compte par le `publierTout` existant |
| Anonyme B dans Auth | orphelin : l'outil du propriétaire le retire au bout de 30 jours sans donnée (D33), sinon il est gardé. Le nettoyage à 30 jours de Firebase exige Identity Platform, refusé (§ 4.4) |

Le lien (« lien, pas copie ») ne vaut que pour le premier appareil.
Firebase ne fusionne pas deux comptes : un second appareil se connecte, et
son journal s'unit à celui du compte.

### 2.4 Mot de passe et adresse

- **Mot de passe** : 8 caractères au moins, comme dans Light (D17).
  - Validation locale : « Mot de passe : 8 caractères au moins ».
  - Politique Firebase au même minimum (mode Require, § 4.3), si la
    console le permet sans Identity Platform.
- **Vérification d'adresse** : `sendEmailVerification` à l'inscription et
  au lien. Elle **ne bloque pas** la synchro (D18 b).
  - La vue Compte affiche « Adresse non vérifiée · Renvoyer l'e-mail ».
  - `user.reload()` à l'ouverture de la vue Compte et au retour au premier
    plan : sans lui, `emailVerified` reste faux dans l'APK après le clic
    dans le navigateur.
- **Mot de passe oublié** : `sendPasswordResetEmail`, avec un message
  générique : « Si un compte existe pour cette adresse, un e-mail vient de
  partir. ».
  - Quota Spark : **150 par jour pour tout le projet**.
  - Au-delà (`auth/too-many-requests` ou `auth/quota-exceeded`, S12) :
    « Limite du jour atteinte : réessaie après {heure} » (§ 3.3).
- **Fuite résiduelle**, acceptée et bornée par les limites de débit :
  - malgré la protection contre l'énumération, l'inscription répond
    toujours `EMAIL_EXISTS` ;
  - sans vérification bloquante, n'importe qui peut faire envoyer par
    Terramemo des e-mails de vérification à une adresse tierce (1 000 par
    jour), ou épuiser le quota de réinitialisations du jour.

  D'où **Google en premier** dans la vue Compte : ni mot de passe, ni
  e-mail à envoyer.
- **Changer le mot de passe** : comme le `setPassword` de Light
  (réauthentification, refus sans fournisseur `password`). Le changement
  révoque les sessions des autres appareils, qui passent en session
  perdue (§ 2.5).
- **Changer d'adresse** (`verifyBeforeUpdateEmail`) : hors J1b (§ 11).
- **Mot de passe ajouté à un compte Google** : non, comme dans Light
  (D19).
- **Même adresse en Google et en mot de passe** : Firebase est réglé sur
  « un compte par adresse ».
  - Pour une adresse `@gmail.com` non vérifiée, Google remplace le
    fournisseur `password` (fournisseur fiable contre non fiable), et
    l'uid est sans doute gardé (S5).
  - Ailleurs : `auth/account-exists-with-different-credential` (§ 2.3).
  - Aucun lien automatique au J1b.

### 2.5 Session perdue (sans déconnexion)

- **Causes** : mot de passe changé ou réinitialisé sur un autre appareil
  (jetons révoqués), compte supprimé ou désactivé ailleurs.
  - Le SDK se déconnecte alors seul au rafraîchissement du jeton, sur
    `user-token-expired` ou `user-disabled` (`_logoutIfInvalidated`,
    `index-Bz2J43nW.js:1337-1358`).
  - Un compte supprimé (`USER_NOT_FOUND`) y donne aussi
    `user-token-expired` (`:818`).
  - L'appli ne peut donc pas distinguer un mot de passe changé d'un compte
    supprimé.
- **Repérage** : `session.uid` connu, `session.deconnexion` vide, et aucun
  utilisateur après `authStateReady()`, ou un `onAuthStateChanged(null)`
  en cours de route.
- **Conduite** :
  - rien n'est effacé, rien ne part, et l'on joue comme avant ;
  - la vue Compte et une ligne discrète du bilan disent : « Session
    expirée : reconnecte-toi pour envoyer {n} séances. » ;
  - trois boutons : « Se reconnecter » ; « Continuer sans compte » (après
    une confirmation, l'appareil redevient invité avec ce journal) ;
    « Effacer cet appareil » (style danger, confirmation avec le nombre de
    réponses).
- **Reconnexion** au même uid : reprise sans question. À un autre compte :
  la question du § 2.3, étape 1.

## 3. Écran Compte

### 3.1 Où

- **⚙** : un lien « Compte » au-dessus de « Crédits », sur le modèle de
  `#lien-credits`, et un lien « Confidentialité » à côté de Crédits.
  Visibles si `comptesVisibles()` (§ 8).
- **Vue `compte`** (hash `#compte`), sur le modèle de
  `vueCredits(ctx, {retour})` : `NomVue`, `VUES`, `PASSAGE`, `vues.set`.
  Elle est dans un morceau à part, importé à la demande (lot 1).
- **Invites** discrètes : un lien vers `#compte`, jamais une fenêtre qui
  s'impose.
  - Au bilan de séance, une ligne sous l'avis `non_garde` (`vues/seance.ts:245`) :
    « Crée un compte pour retrouver tes progrès sur un autre appareil ».
    Pour un invité seulement, une fois par jour au plus (drapeau en
    localStorage).
  - Au classement, dans la zone pseudo (`vues/classement.ts:197-204`) :
    - pour un compte, le pseudo vient du compte et se modifie depuis la
      vue Compte ;
    - pour un invité : « Avec un compte, ton pseudo et tes records te
      suivent ».
- **Chargement de Firebase** :
  - pour un invité, à l'ouverture de `#compte`, jamais au démarrage
    (D9 b) ;
  - pour un compte ou une session perdue (`session.uid` connu), au
    démarrage, après le premier affichage de la carte (§ 5.3).

### 3.2 États et contenu

| État | Contenu |
|---|---|
| Invité | « Tes progrès restent sur cet appareil. » ; boutons « Continuer avec Google » (en premier), « Se connecter par e-mail », « Créer un compte ». Dans l'APK, sous Google : « Google affichera le nom du projet (terramemo-geo) : c'est bien Terramemo. » (S18) |
| Créer un compte | adresse (`type="email"`, `autocomplete="email"`, `inputmode="email"`) ; mot de passe (`autocomplete="new-password"`, montrer/masquer) ; « Créer » ; lien « J'ai déjà un compte » ; ligne « En créant un compte, tu acceptes la [politique de confidentialité] » |
| Se connecter | adresse ; mot de passe (`autocomplete="current-password"`) ; « Se connecter » ; « Mot de passe oublié ? » |
| Question de fusion (§ 2.3, D22) | trois boutons et le nombre de réponses ; seconde confirmation pour « Ne pas les ajouter » |
| Compte | adresse, ou « Compte Google ({adresse}) » ; pseudo (modifiable, `pseudoValide`) ; « Adresse non vérifiée · Renvoyer » s'il le faut ; état de la synchro ; « Exporter mes données » (site) ; « Changer le mot de passe » (fournisseur `password`) ; « Se déconnecter » ; en bas, à part, « Supprimer mon compte » (style danger) |
| Session expirée (§ 2.5) | « Session expirée : reconnecte-toi pour envoyer {n} séances. » et les trois boutons |
| Suppression | « Suppression inachevée : reprendre ? » (drapeau local) ; « Ce compte est en cours de suppression. » (profil marqué, § 7.1) |

Ces attributs `autocomplete` et `inputmode` permettent au remplissage
automatique d'Android (gestionnaire de mots de passe de Google) de
fonctionner dans la WebView.

**État de la synchro** (une ligne, `aria-live="polite"`) :
- « À jour » ;
- « {n} séances en attente d'envoi » ;
- « Hors ligne : envoi à la reconnexion » ;
- « {n} séances refusées par le serveur, gardées sur cet appareil ·
  Réessayer » ;
- « Mets à jour l'appli : {n} réponses venues d'un autre appareil
  attendent » ;
- « Synchro coupée (essai) », quand `sans-synchro` est posé.

### 3.3 Erreurs en français (`textes.fr.json`, objet `compte.erreurs`)

- Dictionnaire `AUTH_MESSAGES` de Light, repris clé par clé
  (`auth/…` → texte).
- Fonction `traduire(err)` : `auth/*`, puis `firestore/*`, puis le plugin,
  puis un texte générique « Erreur inattendue ({code}) ». Le message
  anglais brut n'est jamais affiché ; il va au rapport du pilote.

Repris de Light :

| Code | Texte |
|---|---|
| `auth/invalid-credential`, `auth/user-not-found`, `auth/wrong-password` | Adresse ou mot de passe incorrect (un seul texte, contre l'énumération) |
| `auth/invalid-email` | Adresse e-mail invalide |
| `auth/missing-email` | Saisis ton adresse e-mail |
| `auth/email-already-in-use` (formulaire) | Un compte existe déjà avec cette adresse : connecte-toi (bascule de formulaire, § 2.3) |
| `auth/weak-password` | Mot de passe trop faible (8 caractères au moins) |
| `auth/too-many-requests` | Trop de tentatives : réessaie dans quelques minutes. |
| `auth/network-request-failed` | Réseau injoignable |
| `auth/popup-blocked` | Fenêtre de connexion Google bloquée par le navigateur |
| `auth/popup-closed-by-user`, `auth/cancelled-popup-request` | (rien : retour silencieux) |
| `auth/user-disabled` | Compte désactivé |
| `permission-denied` / `unavailable` | Action non autorisée. / Serveur injoignable |

Nouveaux :

| Code | Texte |
|---|---|
| `auth/requires-recent-login` | Pour ta sécurité, reconnecte-toi avant de continuer (ouvre la réauthentification) |
| `auth/credential-already-in-use` ; `auth/email-already-in-use` au lien Google | (pas affiché : déclenche le § 2.3) |
| `auth/provider-already-linked` | Ce compte est déjà relié à ce moyen de connexion |
| `auth/account-exists-with-different-credential` | Ce compte se connecte par mot de passe : connecte-toi avec ton adresse |
| `auth/operation-not-allowed` | Ce moyen de connexion n'est pas encore ouvert |
| `auth/unauthorized-domain` | Connexion impossible depuis cette adresse du site |
| `auth/user-token-expired` | (pas affiché : session perdue, § 2.5) |
| `auth/quota-exceeded`, `resource-exhausted` | Limite du jour atteinte : réessaie après {heure}. L'heure est minuit à Los Angeles, calculée par `Intl` : 12 h à La Réunion l'hiver boréal, 11 h l'été |
| plugin `NO_CREDENTIAL_AVAILABLE` | Aucun compte Google sur ce téléphone. |
| plugin `PROVIDER_CONFIGURATION_ERROR` | Services Google Play absents ou à mettre à jour. |
| plugin `SIGN_IN_CANCELED`, message par défaut (« The user canceled the sign-in flow. ») | (rien : retour silencieux) |
| plugin `SIGN_IN_CANCELED` avec un autre message | Connexion Google impossible (réglage de l'appli). D'après le README du plugin, Play signale ainsi un client Android manquant (`Account reauth failed`). Le message brut va au pilote |
| plugin, autre échec | Connexion Google impossible : réessaie plus tard. (le code va au pilote seulement) |

Notes :
- `auth.languageCode = 'fr'` : les e-mails de Firebase partent en
  français.
- Le skill note un piège : « Aucun compte Google » ou « réglage de
  l'appli » sur un téléphone qui a bien un compte = vérifier le client
  OAuth Android (paquet + SHA-1).

### 3.4 Déconnexion (D24 a), reprenable

1. Tenter l'envoi de tout ce qui attend (lots et profil).
2. Si quelque chose n'est pas parti :
   - « {n} séances ne sont pas encore dans ton compte : elles seront
     perdues. » ;
   - sur le site, « Exporter d'abord » ;
   - s'il y a des lots refusés, « Réessayer » d'abord ;
   - puis « Se déconnecter quand même » (style danger).
3. Poser `session.deconnexion = 'voulue'` et `session.effacement = uid`.
4. `signOut`.
5. Effacer :
   - `memoire.effacer()`. Elle attend la file d'écriture, vide le magasin
     (`Depot.vider()`), l'état et `enAttente`. Elle prévient les autres
     onglets par `BroadcastChannel('terramemo')`, et ils se rechargent ;
   - l'espace de cet uid dans `terramemo-synchro` ;
   - `terramemo.pseudo` et `terramemo.chrono.records`.
6. Lever `session.effacement`. L'appareil repart en invité vierge :
   « Déconnecté : tes progrès sont dans ton compte. »

Règles annexes :
- si `session.effacement` est posé au démarrage (appli tuée en cours de
  route), l'étape 5 se termine avant tout le reste ;
- `terramemo.appareil` est gardé : c'est l'id de l'appareil, pas du
  joueur.

Raison : un appareil partagé ne doit pas fondre le journal d'un compte
dans celui du suivant. Light Android fait de même (base locale vidée au
changement de compte).

### 3.5 Parcours sur l'A37 : touches et textes

| Parcours | Touches | Ce que voit l'utilisateur |
|---|---|---|
| Invité → Google, nouveau compte (lien) | ⚙ (1), Compte (2), « Continuer avec Google » (3), un compte dans la feuille de Google (4), « Continuer » au premier consentement (5) | la feuille de Google, qui nomme le projet et non « Terramemo » tant que la marque n'est pas vérifiée (S18) ; puis « Connecté avec Google : {adresse}. Tes progrès vont dans ton compte. » |
| Invité → e-mail, création | ⚙, Compte, « Créer un compte » (3), adresse et mot de passe (remplissage automatique possible), « Créer » (4) | « Compte créé. Un e-mail de vérification est parti à {adresse}. » |
| Second appareil → compte existant (critère de #13) | ⚙, Compte, « Se connecter par e-mail » (3), saisie, « Se connecter » (4), « Ajouter » (5) | « Ajouter les progrès de cet appareil ({n} réponses) à ton compte ? », puis « Connecté. {n} réponses ajoutées à ton compte. » |
| Déconnexion | ⚙, Compte, « Se déconnecter » (3), confirmation si quelque chose attend (4) | « Déconnecté : tes progrès sont dans ton compte. » |
| Suppression | ⚙, Compte, « Supprimer mon compte » (3), « supprimer » et le mot de passe (ou la feuille de Google), « Supprimer définitivement » (4 à 5) | l'avertissement sur les places du classement (D27), puis « Compte supprimé. » |
| Session expirée | aucune pour le voir ; puis ⚙, Compte | « Session expirée : reconnecte-toi pour envoyer {n} séances. » |

## 4. Google

### 4.1 Sur le site

- Création : `signInWithPopup(auth, new GoogleAuthProvider())`. Lien :
  `linkWithPopup`. Réauthentification : `reauthenticateWithPopup`.
  Toujours lancés par un geste (bouton).
- `authDomain` reste `terramemo-geo.firebaseapp.com`.
  - La redirection casse sous le stockage partitionné (Chrome 115+,
    Firefox 109+, Safari 16.1+), sauf si `authDomain` est le domaine du
    site.
  - Il faudrait alors passer `authDomain` à `terramemo-geo.web.app` et
    ajouter son `/__/auth/handler` au client OAuth web.
  - Non retenue au J1b (§ 11) : la popup suffit.
- Popup dans Chrome sur Android : non testée (S3). Essai au lot 6, sur
  l'A37.

### 4.2 Dans l'APK

La WebView ne peut pas faire l'OAuth de Google (`disallowed_useragent`).
La voie est donc native :
- le plugin renvoie un `idToken` ;
- le SDK web appelle `GoogleAuthProvider.credential(idToken)`, puis
  `linkWithCredential` (ou `signInWithCredential`) ;
- il n'y a qu'un état d'auth : celui du SDK web.

Plugins comparés :

| | **`@capawesome/capacitor-google-sign-in` 0.1.4** (recommandé, D28 a) | `@capacitor-firebase/authentication` 8.6.0 (repli, D28 b) |
|---|---|---|
| Licence, poids npm | MIT, 135 Ko | Apache-2.0, 847 Ko |
| Capacitor | `peerDependencies @capacitor/core >= 8.0.0` (projet en 8.6.0) | `>= 8` |
| Firebase 13 | aucun conflit (installation à blanc réussie) | `firebase ^12.6.0` en dépendance optionnelle : ERESOLVE. Il faut un `overrides` hors garantie de l'éditeur |
| Android | Credential Manager : credentials 1.5.0, googleid 1.1.1, play-services-auth 21.5.0 (`android/build.gradle` du paquet) | SDK Firebase Auth natif 24.0.1, `google-services.json`, `rgcfaIncludeGoogle` |
| Usage | `initialize({clientId: ID_CLIENT_WEB})`, puis `signIn()` → `idToken` | `signInWithGoogle({skipNativeAuth: true})` → `credential.idToken`. Ses `linkWith*` exigent l'auth native : ne jamais s'en servir |
| Risque | jeune (0.1.x) : version figée, code lu avant l'adoption | deux couches d'auth, un override |

Choix :
- **`@capawesome/capacitor-google-sign-in` 0.1.4**, version exacte dans
  `package.json` (D28 a).
- Importé seulement si `Capacitor.isNativePlatform()`. Il n'entre ainsi
  jamais dans le site, où sa partie web ferait sa propre redirection
  OAuth.
- `ID_CLIENT_WEB` (public) en constante dans `src/sync/firebase.ts`.
- **Pas de `google-services.json`** : `build.gradle:79-84` appliquerait
  sinon le plugin google-services.
- `licences:android` à refaire. Chaque nouvel artefact fait échouer
  `--verifier`, donc `driver.py apk`, tant que le relevé n'est pas refait.
  Il fait aussi échouer le test des Crédits tant qu'il n'a pas sa ligne
  dans `textes.credits.android` (`licences/android.mjs:10-13, 66-70`).
  - Une dizaine d'artefacts attendus : `play-services-*`, `credentials`,
    `googleid`.
  - Licences : celle du SDK Android (non libre), ou Apache-2.0.
  - Ils sont listés et nommés dans Crédits au lot 7.
- Réauthentification Google (suppression, § 7) : un nouvel `idToken` par
  `signIn()`, puis `reauthenticateWithCredential`.

**Poids** :
- estimation : +2 à 3,5 Mo sur les 5,31 Mo de l'APK, soit +40 à 65 %.
  L'APK utilisateur est un build « debug » sans minification ;
- base de l'estimation : les AAR voisins de Light dans `~/.gradle/caches`
  (play-services-base 604 Ko, basement 432 Ko, fido 424 Ko, auth-base
  324 Ko, identity-credentials 252 Ko, credentials-play-services-auth
  176 Ko…) ;
- mesure au lot 7 : la sortie « APK : … Mo » de `driver.py apk`, avant et
  après (S20). Le plafond se fixe à la mesure ;
- jusqu'au J3, l'APK ne va qu'à l'utilisateur (« Diffusion »).

Persistance dans l'APK :
- `getAuth()` est gardé tel quel au J1b. Il utilise l'IndexedDB
  `firebaseLocalStorageDb` de l'origine `https://localhost`, que l'APK
  installé utilise déjà.
- `initializeAuth` sans résolveur de popup (conseil de Capawesome) reste
  une optimisation, à mesurer avant tout usage, pas à livrer à l'aveugle
  (S4).

Empreintes :

| Clé | SHA-1 | Quand |
|---|---|---|
| Clé unique (PC et CI, décision « Signature de l'APK ») | `F3:97:0D:57:74:3B:B7:AB:0E:EE:8A:B8:55:9E:81:46:08:7F:94:FA` | lot 7 |
| Play App Signing | lue dans la Play Console | J3 (#5) : ajoutée à la même appli Android de Firebase |
| Clé de débogage du PC | — | jamais : le driver refuse un APK signé par une autre clé |

Si la clé change, Google échoue dans l'APK (erreur 28444, piège de
Light).

**Appareil d'essai** (D30) :
- tout APK au même `applicationId` et à la même clé **met à jour** celui
  de l'A37. Le journal reste, mais le code d'essai tourne alors sur le
  vrai journal ;
- premier choix proposé : un AVD avec Google Play sur le PC, avec l'APK
  signé par la clé stable (même SHA-1, aucun client OAuth de plus) ;
- ensuite seulement l'A37, après le 13/11 et après `sauver_journal` ;
- un suffixe `.test` ferait une appli à part, avec ses propres données,
  mais demanderait un second client OAuth Android.

### 4.3 Étapes manuelles de l'utilisateur, pas à pas

Toutes se font **sur le PC, dans le navigateur**, sur le projet
**terramemo-geo**. Elles sont rangées par le lot qui en a besoin (§ 9).
Aucune ne sert aux lots 0 à 5, qui tournent aux émulateurs.

**A. Avant le premier essai sur le vrai projet** (dès la fin du lot 1
pour S15, au plus tard au début du lot 6) :

1. **E-mail et mot de passe**. console.firebase.google.com › terramemo-geo
   › **Security › Authentication** (selon la console) › onglet
   **Sign-in method** › **Ajouter un fournisseur** › **E-mail/Mot de
   passe** :
   - activer la première case seulement, pas « Lien envoyé par e-mail » ;
   - **Enregistrer** ;
   - **Anonyme** reste activé.
2. **Politique de mot de passe**. Onglet **Settings** › **Password
   policy** : longueur minimale 8, mode **Require**, aucune autre
   exigence. Si la console demande de passer à Identity Platform pour ce
   réglage : refuser et ne rien régler, la validation locale suffit
   (§ 4.4).
3. **Énumération**. Settings › **User actions** : vérifier que **Email
   enumeration protection** est active (c'est le défaut des projets
   récents).
4. **Domaines autorisés**. Settings › **Authorized domains** :
   - vérifier `localhost`, `terramemo-geo.web.app` et
     `terramemo-geo.firebaseapp.com` ; **Add domain** s'il en manque un ;
   - ne jamais retirer `localhost`. L'APK a l'origine `https://localhost`
     (`capacitor.config.ts:19-20`), et le SDK envoie `http://localhost`
     comme `requestUri` des connexions par jeton (précaution, S24).
5. **Modèles d'e-mail**. Onglet **Templates** :
   - langue **Français** ;
   - pour Vérification, Réinitialisation et Changement d'adresse
     (crayon) : nom d'expéditeur **Terramemo**, et « Répondre à » = le
     contact public de D20 ;
   - garder le domaine d'envoi par défaut.

**B. Lot 6, Google sur le site** (après la réponse à D20) :

6. Si D20 a1 : groups.google.com › **Créer un groupe** :
   - nom « Terramemo contact », adresse `terramemo-…@googlegroups.com`,
     soi-même propriétaire ;
   - **Qui peut publier** : « Tout le monde sur le Web », sinon les
     messages du public sont refusés.
7. **Google**. Sign-in method › **Ajouter un fournisseur** › **Google** :
   - activer ;
   - nom public **Terramemo** ;
   - e-mail d'assistance : choisir dans la liste l'adresse de D20. Seuls
     le compte connecté et les groupes qu'il gère y figurent ;
   - **Enregistrer**. Firebase crée alors le **client OAuth web** ;
   - rouvrir le fournisseur, **Configuration du SDK Web** : copier l'**ID
     client Web** (public) et le donner à Claude.
8. **Écran de consentement**. console.cloud.google.com › projet
   terramemo-geo › **Google Auth Platform** :
   - **Branding** : nom « Terramemo », e-mail d'assistance de D20 ;
     **pas de logo** (un logo déclenche la vérification de la marque) ;
     page d'accueil et politique laissées vides jusqu'au lot 8 ;
   - **Audience** : laisser **Testing** ; dans **Test users**, **Add
     users** : l'adresse Google de l'utilisateur, et celles de ses
     essais.
9. Donner à Claude la liste des **adresses d'essai**, vérifiées. Jusqu'au
   lot 8, les règles n'ouvrent `joueurs/` qu'à elles (§ 6).
   - Accepter aussi le déploiement des règles
     (`npx firebase deploy --only firestore`).
   - Seul `--only hosting` fait partie des permissions accordées d'office.

**C. Lot 7, Google dans l'APK** :

10. **Appli Android**. Firebase › ⚙ **Paramètres du projet** ›
    **Général** › **Ajouter une application** › **Android** :
    - paquet `io.github.micheldm974.terramemo`, surnom « Terramemo » ;
    - SHA-1 `F3:97:0D:57:74:3B:B7:AB:0E:EE:8A:B8:55:9E:81:46:08:7F:94:FA` ;
    - **Enregistrer l'application** ;
    - passer le téléchargement de `google-services.json`, qui ne va jamais
      dans le dépôt ; terminer.
11. **Clients OAuth**. console.cloud.google.com › **API et services** ›
    **Identifiants** :
    - vérifier qu'il y a « Android client (auto created by Google
      Service) », avec le paquet et la SHA-1, et « Web client (auto
      created by Google Service) » ;
    - s'il n'y a pas de client Android : **Créer des identifiants** ›
      **ID client OAuth** › **Android**, avec le paquet et la SHA-1 (S2) ;
    - si Google refuse le couple paquet + SHA-1 parce qu'il est déjà pris
      (piège 28444 de Light) : il existe dans un autre projet, peut-être
      l'ancien `cartographe-geo`. L'y supprimer, puis retirer et rajouter
      la SHA-1 dans Firebase.
12. Si D30 b : créer un AVD « Google Play » (Android Studio › Device
    Manager) et s'y connecter à un compte Google. Ce compte doit figurer
    dans les testeurs de l'étape 8.

**D. Lot 8, ouverture** (juste après le déploiement Hosting de la
politique) :

13. Google Auth Platform :
    - **Branding** : page d'accueil `https://terramemo-geo.web.app`,
      règles de confidentialité
      `https://terramemo-geo.web.app/confidentialite.html` ;
    - **Audience** › **Publier l'application** (passage en production).
      Sinon Google est refusé à qui n'est pas testeur (piège de Light).
    - Sans marque vérifiée, l'écran montre le domaine, pas le nom (D30).

**E. Outil du propriétaire** (si D33 a) :

14. Firebase › ⚙ **Paramètres du projet** › **Comptes de service** ›
    **Générer une nouvelle clé privée**. Ranger le fichier dans
    `~/Sauvegardes/terramemo/admin/`, comme la clé de l'APK, jamais dans
    le dépôt.

**F. J3 (#5)** :

15. Ajouter la SHA-1 de Play App Signing (Play Console › Test et
    publication › Configuration › Signature de l'appli) à l'appli Android
    de l'étape 10.

**Autre voie** pour les étapes 1 et 7 (D29 b) : déclarer `emailPassword`
et `googleSignIn` dans `firebase.json`, puis lancer
`npx firebase deploy --only auth`. Cette commande passe par une API de
provisionnement en `v1alpha` et prend l'appli « Default Web App », sinon
la première venue (`firebase-tools/lib/deploy/auth/prepare.js:14-21`).
C'est déconseillé.

### 4.4 Ce qu'on n'active pas

- **Identity Platform** : non. Il impose un plafond de 3 000 utilisateurs
  actifs par jour sur Spark, et on ne sait pas si le passage est
  réversible.
- **SMTP personnalisé** : non. Rien ne dit qu'il lève le plafond de 150
  réinitialisations par jour.
- **Lien de connexion par e-mail** : non (5 par jour sur Spark).
- **Logo** sur l'écran de consentement : non, car il déclenche la
  vérification de la marque.

## 5. Synchro

### 5.1 État d'envoi : base `terramemo-synchro`

Base IndexedDB **à part**, en version 1. Trois magasins :
- **`lots`** (clé `[uid, id]`) :
  `{uid, id, seance, appareil, ids, etat, cause, essais, prochain, version}` ;
  - `etat` vaut `a_envoyer` (composé, pas encore accepté), `envoye`
    (accepté, ou trouvé en ligne avec ces ids), `en_ligne` (lu en ligne)
    ou `refuse` (cause `regles` ou `invalide`) ;
  - `version` = la version de l'appli qui a composé ou refusé le lot
    (`src/version.ts` : le commit du build, posé par `vite.config.ts` ;
    celle de `package.json` restait à 0.0.0, précision du lot 3) ;
- **`a_relire`** (clé `[uid, id]`) : un lot lu en ligne que cette version
  ne sait pas lire en entier (`v` inconnu, carte refusée par `valider()`).
  Il est gardé **brut** ;
- **`session`** (une seule fiche) :
  `{uid, fournisseurs, marque, profil_a_ecrire, deconnexion, effacement, suppression, version}`.

Pourquoi une base à part :
- `terramemo-journal` reste en version 1. À une montée de version,
  `depot.ts:130` recréerait `evenements`, et la base n'a pas
  d'`onblocked` ;
- aucune migration sur l'APK de la semaine d'usage ;
- le driver ne vide que `terramemo` et vérifie qu'aucune autre base ne
  disparaît (`driver.py:2166-2229`). `terramemo-synchro` entre quand même
  dans `BASES_GARDEES`, pour la trace.

Repli sans IndexedDB :
- même dépôt, en mémoire, le temps de la page ;
- l'envoi reste permis, car c'est alors le seul moyen de garder ses
  progrès ;
- l'issue « présent » du § 5.2 rend sans perte le renvoi depuis une page
  suivante.

« À envoyer », pour l'uid connecté = les événements du journal dont l'`id`
n'est dans aucun lot de cet uid, quel que soit son état. Un lot
`a_envoyer` ou `refuse` se renvoie par sa propre fiche (§ 5.2).
15 000 ids par an en mémoire : sans gêne.

**Une seule synchro à la fois par origine** :
`navigator.locks.request('terramemo-synchro', …)`. Les Web Locks existent
dans Chromium depuis la 69, donc dans la WebView, et dans Node 24 pour les
tests. Deux onglets du site ne composent ainsi jamais en même temps.

### 5.2 Envoi

**Séance close** :
- toute séance qui n'est pas celle de la page en cours est close (appli
  tuée, page rechargée, onglet fermé) ;
- la séance en cours devient envoyable :
  - à son `bilan()` et à `terminer()` ;
  - au passage en arrière-plan (`visibilitychange` vers `hidden`), le seul
    moment sûr sur Android, où l'appli est souvent tuée en arrière-plan ;
- une partie libre n'a pas de bilan (`vues/seance.ts:288-300`). Elle est
  envoyable quand on quitte sa vue, et en arrière-plan ;
- une séance reprise après un envoi donne un lot de plus, c'est prévu. En
  arrière-plan, une même séance n'est pas envoyée plus d'une fois toutes
  les 2 min ;
- avant de composer, attendre la file d'écriture de la mémoire :
  `await memoire.ecrire([])` rend la file en cours (`memoire.ts:114`).
  Sinon, la dernière réponse part dans un lot de plus.

**Lot** : les événements à envoyer d'une même séance et d'un même
appareil, triés par `(ts, id)`, coupés par 200. `seance: null` forme son
propre groupe.
- `lotId` = l'`id` du premier événement du lot (un uuid, donc unique).
- La composition est écrite dans `terramemo-synchro` (`a_envoyer`)
  **avant** l'envoi. Un renvoi envoie donc le même document.

Document `joueurs/{uid}/lots/{lotId}`, en création seule :

| Champ | Contenu |
|---|---|
| `v` | 1 (format du lot et des événements) |
| `appareil` | uuid de l'appareil (36 caractères) |
| `seance` | uuid ou `null` |
| `fin` | `== request.time` |
| `n` | 1 à 200 |
| `evenements` | **chaîne** de `n` cartes, encodées par position (voir ci-dessous) ; au plus `n × 160` caractères |

Encodage des cartes de `evenements` :
- chaque carte est un tableau JSON dont les champs ont une place fixe,
  avec une disposition par `type` ;
- les ids uuid sont écrits en base64url (22 caractères), tout autre id
  tel quel ;
- `ts` est l'écart au premier événement du lot ;
- `v`, `appareil` et `seance` sont mis en facteur dans le lot ;
- taille par réponse, mesurée sur 40 réponses types : ≈ 100 caractères,
  contre 200 en cartes à clés et 360 en événements entiers.

Pourquoi une chaîne plutôt qu'une liste de cartes : les règles ne savent
pas borner la taille d'une carte dans une liste, mais elles bornent une
chaîne (§ 6, D34).

`compacter(evts)` et `deplier(lot)` vivent dans `src/sync/lots.ts`, purs.
Tests :
- `deplier(compacter(e)) ≡ e` au champ près, `null` et absent compris ;
- `valider()` vrai, pour chaque `type` et chaque champ optionnel ;
- 200 réponses aux champs les plus longs passent la borne des règles.

Différences avec le § 8 du J1a :
- `justes`, `mode` et la borne basse de `duree_ms` sont retirés : ils
  servaient l'anti-abus d'un classement, et aucun classement ne lit ces
  documents ;
- un lot au lieu d'un document par séance (D32) ;
- une partie libre « tous » de plus de 195 réponses donne 2 lots.

**Quand envoyer** (jamais à chaque réponse) :
- à la clôture d'une séance (ci-dessus) ;
- à l'ouverture de l'appli ;
- à l'événement `online` ;
- au retour au premier plan, au plus une fois toutes les 5 min ;
- juste après une connexion ou un lien ;
- au bouton « Réessayer » de la vue Compte.

Jamais pendant une session perdue (§ 2.5), ni pendant une suppression
(§ 7.1).

**Issues** :

| Réponse | Suite |
|---|---|
| succès | `envoye` |
| réseau, `unavailable`, `deadline-exceeded` | nouvel essai : 30 s, 2 min, 10 min, puis 1 h, et à chaque déclencheur |
| `permission-denied` | `getDoc` du lot, puis selon le cas ci-dessous |
| `resource-exhausted` (quota Spark) | essai au premier déclencheur après la remise à zéro : minuit à Los Angeles, calculé par `Intl` (12 h à La Réunion l'hiver boréal, 11 h l'été) |
| lot invalide côté client (`lotValide` recopié des règles, avec un test de cohérence) | `refuse`, cause `invalide` ; jamais envoyé |

Après `permission-denied`, le `getDoc` du lot décide :
- **présent** : déplier ses ids. Ceux-là passent `envoye`. Ceux de la
  fiche qui n'y sont pas forment un nouveau lot, dont l'id est le premier
  restant ;
- **absent** : `refuse`, cause `regles` ;
- **`getDoc` refusé** : `refuse`, cause `regles`. Un refus de lecture ne
  vaut jamais « absent ».

**Relance des lots refusés** :
- cause `regles` : à chaque nouvelle version de l'appli, à chaque
  changement de jeton (lien, connexion, adresse vérifiée), au bouton
  « Réessayer », et au plus une fois par jour ;
- cause `invalide` : le lot est reconstruit à chaque nouvelle version ;
- le pilote les compte (`synchro().refuses`).

Un échec ne bloque rien : le journal local fait foi.

**Coût** : une écriture par lot, plus une lecture dans les règles (§ 6),
soit 1 à 3 écritures par séance.

### 5.3 Lecture sur un nouvel appareil et union

**Restauration** (connexion, lien, reconnexion après une déconnexion) :
- `getDocs(joueurs/{uid}/lots)` par pages de 100 (`orderBy('fin')`,
  `startAfter`) : N lectures, 1 si la liste est vide ;
- chaque lot est déplié, et chaque carte validée :
  - les cartes valides vont à `memoire.fusionner()` ;
  - si le lot a un `v` inconnu ou une carte refusée, il est gardé
    **brut** dans `a_relire`. L'appareil affiche « Mets à jour l'appli :
    {n} réponses venues d'un autre appareil attendent » ;
- chaque lot lu passe en fiche `en_ligne` (avec ses ids), et
  `marque = max(fin)` avance, **seulement après un `fusionner` réussi**.

**Relecture de `a_relire`** : à chaque nouvelle version de l'appli
(`session.version` ≠ version). Elle se fait sans réseau, puisque les lots
bruts sont sur l'appareil.

Ainsi, à version égale, deux appareils arrivent au même état. Un APK en
retard sur le site attend sa mise à jour, puis rattrape (lot 9).

**Lecture incrémentale**, à l'ouverture d'un appareil connecté :
- `where('fin', '>', marque − 5 min)` : 1 lecture au moins, plus les
  lots nouveaux (index simple de `fin`) ;
- après le premier affichage de la carte, jamais pendant une séance ;
- aussi au retour au premier plan, au plus une fois toutes les 5 min.

**`Memoire.fusionner(evts)`** :
- passe par la même file que `ecrire`, et **rejette** en cas d'échec, au
  lieu de passer `garde` à faux en silence ;
- `depot.ajouter(evts)` (les doublons sont ignorés) ;
- puis `etat = rejouer(union(depot.tous(), événements de la page))`. Un
  événement appliqué en mémoire mais pas encore écrit (file en cours,
  dépôt en échec) n'est donc pas perdu ;
- puis `surCharge` : Jouer et la carte de la mémoire sont redessinés ;
- jamais pendant une séance active : le travail est différé à sa fin ;
- sur l'A37, le rejeu d'un an coûte plusieurs centaines de ms : il se
  fait au repos (`requestIdleCallback`).

**Contrôle au démarrage** : si un id d'une fiche `en_ligne` manque au
journal (base vidée, dépôt en mémoire lors d'une page précédente),
restauration complète.

**Horloge qui recule** :
- un événement local plus ancien que le dernier appliqué (`ts` inférieur
  au plus grand `ts` vu) n'est pas traité comme le rejeu complet le
  traiterait (`rejeu.ts:85-86`) ;
- la mémoire note l'écart et refait un rejeu complet au repos.

**Bord de `fin`** :
- `fin` est l'heure du serveur à l'écriture ;
- un lot écrit pendant la lecture d'un autre appareil peut avoir un `fin`
  antérieur à la marque ;
- d'où la relecture depuis `marque − 5 min`. Les doublons coûtent quelques
  lectures, et l'union est idempotente (S14).

### 5.4 Profil `joueurs/{uid}` (D8, D21)

| Champ | Contenu |
|---|---|
| `v` | 1 |
| `pseudo` | 2 à 20 caractères (`pseudoValide`), ou absent |
| `records` | **chaîne** JSON des records (clés d'épreuve, et `épreuve@sNNNN` pour la semaine en cours), sans `publiable` ; 32 Ko au plus, ≈ 7 Ko aujourd'hui pour 48 clés |
| `maj` | `== request.time` |
| `supprime` | absent, ou `true` : pierre tombale (§ 7.1) |

- **Lu** à la connexion, puis à chaque ouverture (1 lecture). Un profil
  marqué `supprime` affiche « Ce compte est en cours de suppression », et
  la synchro est coupée.
- **Écrit** par `runTransaction` (une lecture et une écriture, Firestore
  lite) :
  - la transaction relit le profil ;
  - elle garde, par clé, le **maximum**, dans l'ordre de `chrono.ts` :
    plus de points, puis moins de temps ;
  - elle oublie les semaines passées ;
  - deux appareils ne s'effacent donc jamais un record.
- **Moments d'écriture** :
  - à la création, par `assurerProfil`, idempotent. Il couvre Google, un
    lien fait hors ligne et une création échouée ;
  - au changement de pseudo ;
  - à un nouveau record.
- **Hors ligne** : `session.profil_a_ecrire` est posé à chaque record ou
  pseudo nouveau, et levé après une transaction réussie. La déconnexion
  le vérifie comme les lots.
- Jamais à chaque lot (§ 5.7).
- `publiable` n'est pas gardé en ligne : la place en ligne du pseudo en
  tient lieu.
- Le général reste « par épreuve, le meilleur de l'appareil et de la
  place en ligne » (« Une place par pseudo »).
  - L'« appareil » d'un compte = ses records fusionnés.
  - Les places en ligne gardent de toute façon le meilleur score publié du
    pseudo : un record perdu n'enlève rien au classement.

### 5.5 Hors ligne

- Tout s'écrit d'abord au journal local, et l'appli reste entière.
- **APK** : les morceaux de Firebase sont dans le `dist/` embarqué, servis
  depuis `https://localhost` (`capacitor.config.ts:9`).
  - Ils se chargent hors ligne.
  - Ce sont les appels à Auth et à Firestore qui échouent
    (`network-request-failed`, `unavailable`), puis qui passent par les
    nouveaux essais du § 5.2.
- **Site** : sans service worker (#22), un morceau absent du cache HTTP ne
  se charge pas hors ligne.
  - `charger()` échoue et remet le service à `null`, comme aujourd'hui.
  - Nouvel essai au déclencheur suivant.
- La file `a_envoyer` survit au redémarrage (`terramemo-synchro`).
- Une connexion tentée hors ligne échoue avec « Réseau injoignable ». Rien
  n'est perdu.
- Les tests « hors ligne » coupent le réseau (faux `fetch`,
  `Network.emulateNetworkConditions`). Ils ne coupent pas l'import.

### 5.6 Deux appareils le même jour

- Règle du rejeu (J1a, § 2) : par fiche et par jour local, seul le
  **premier événement noté** applique FSRS, dans l'ordre
  `(ts, appareil, id)`.
- Exemple :
  - A, hors ligne, révise `pays:FRA:localiser` à 9 h (Again) ;
  - B, en ligne, la révise à 10 h (Good) ;
  - après union, les deux appareils retiennent Again ;
  - B change donc **après coup** : sa note de 10 h devient sans effet.
    C'est voulu : même état partout, ordre déterministe.
- Le jour local est tiré du `tz` stocké dans chaque événement : deux
  fuseaux différents ne changent rien.
- **Budget des grappes** :
  - A et B peuvent prendre chacun une grappe nouvelle le même jour ;
  - après union, le jour compte 2 grappes, ce qui est accepté (pas de
    fusion des budgets, § 11) ;
  - le planificateur voit la grappe du jour prise et n'en propose pas de
    troisième.

### 5.7 Quotas et stockage de Spark

| Opération | Lectures | Écritures |
|---|---|---|
| Séance finie | 1 par lot (règles : pierre tombale) | 1 à 3 (lots) |
| Ouverture, compte connecté | 1 (profil) + 1 (lots, même vides) + nouveaux lots | 0 |
| Retour au premier plan (au plus 12 par heure) | 1 + nouveaux lots | 0 |
| Nouveau record ou nouveau pseudo | 1 (transaction) | 1 (profil) + les places, comme aujourd'hui |
| Restauration d'un an (≈ 500 lots), et chaque reconnexion après une déconnexion (D24 a) | ≈ 500 | 0 |
| Lien d'un invité qui a un an de journal | ≈ 500 (règles) | ≈ 500 |
| Suppression d'un an | ≈ 500 | ≈ 500 suppressions |

Plafonds de Spark :
- par jour : 50 000 lectures, 20 000 écritures, 20 000 suppressions ;
- sortie de données : 10 Gio par mois.

Ordres de grandeur :
- 1 000 comptes actifs, à 3 ouvertures et 3 retours au premier plan par
  jour, donnent ≈ 13 500 lectures et ≈ 4 500 écritures par jour ;
- ce sont donc les lectures qui serrent d'abord : elles tiennent
  ≈ 3 500 comptes actifs par jour (les écritures, ≈ 4 400), sans compter
  les lectures des classements ;
- les liens de gros journaux mangent surtout les écritures, mais ils
  sont rares ;
- sortie : une restauration d'un an pèse ≈ 2,2 Mo en encodage par
  position, soit ≈ 4 500 restaurations par mois.

**Stockage** : c'est le seul quota qui ne se remet pas à zéro.
- ≈ 2,3 Mo par joueur assidu (60 réponses par jour) et par an, avec les
  exemptions d'index (§ 6) ;
- 1 Gio tient donc ≈ 450 joueurs-années assidus, et plusieurs milliers à
  10 réponses par jour ;
- à comparer : 4,4 Mo par an en cartes à clés, 7,8 Mo en événements
  entiers ;
- la purge des inactifs (D33), puis un instantané plus tard (D35),
  repoussent la limite.

### 5.8 Critère de fin testable (#3, #13)

**1. Test d'intégration** `tests/synchro-emulateurs.test.ts`.

Lancement : `npm run test:synchro` =
`firebase emulators:exec --only firestore,auth --project demo-terramemo`.
Il prend les ports 8062 et 8063 : jamais en même temps que `test:regles`.

Montage :
- deux appareils, A et B. Chacun a ses bases (une fabrique fake-indexeddb
  par appareil, pour le journal et pour `terramemo-synchro`), son
  `initializeApp` nommée, sa `Memoire` et son horloge ;
- vrais jetons de l'émulateur Auth, vraies règles ;
- un « redémarrage » rouvre les bases et la mémoire, entre la composition
  d'un lot et la réponse du serveur ;
- « hors ligne » = un faux `fetch` qui échoue.

Scénarios :
- (a) A anonyme, lien e-mail, `getIdToken(true)`, lot accepté : l'uid est
  le même avant et après, et les claims sont relevés (S16) ;
- (b) B se connecte au compte et répond « Ajouter » ;
- (c) A hors ligne joue ; B joue plus tard la même fiche le même jour, et
  une autre ; reconnexion dans un ordre, puis dans l'autre ;
- (d) A et B hors ligne en même temps ;
- (e) l'horloge de B a un jour d'avance ;
- (f) séance reprise après un envoi, état de synchro perdu, puis
  recomposition : aucun id perdu ;
- (g) carte d'une version inconnue (validateur de test plus large) :
  gardée dans `a_relire`, puis relue après la « mise à jour » ;
- (h) deux onglets : deux mémoires sur les mêmes bases ;
- (i) session perdue (mot de passe changé depuis l'autre appareil), puis
  reconnexion ;
- (j) refus des règles (règles d'essai), puis acceptation après une
  « nouvelle version ».

Attendu :
- sur chaque appareil : `memoire.etat()` ≡ `rejouer(depot.tous())` ;
- entre appareils : mêmes `etat()` et mêmes ids ;
- en ligne : chaque id local est présent dans un lot ;
- un renvoi n'écrit aucun doublon ;
- après « Ne pas les ajouter », le journal égale les événements en ligne
  de A.

**2. Pilote `ui_synchro`** (DEV et `?emulateurs`) :
- deux contextes Chrome, sans stockage partagé ;
- le contexte 2 passe hors ligne (`Network.emulateNetworkConditions`),
  joue une Révision, puis revient en ligne ;
- verdict par `window.terramemo.synchro()` : empreinte de l'état FSRS,
  nombre d'événements, lots en attente et refusés, `a_relire`, uid,
  drapeaux. Il doit être égal des deux côtés ;
- documenté dans le skill `run-terramemo`.

**3. Critère de #13, à la main** (lot 8, sur le vrai projet), de jour,
l'utilisateur présent :
- sur le PC, dans le navigateur : créer un compte e-mail sur
  https://terramemo-geo.web.app, puis y jouer une Révision et un Chrono ;
- juste avant la connexion de l'A37 : `sauver_journal` de l'A37 (en plus
  de celui du lot 0) ;
- sur le téléphone, dans l'appli : ⚙, Compte, « Se connecter par
  e-mail ». À la question « Ajouter les progrès de cet appareil ({n}
  réponses) ? », répondre **Ajouter** ;
- attendre « À jour » dans la vue Compte de l'A37, puis **recharger le
  site** sur le PC ;
- attendu, des deux côtés : mêmes comptes dans « Révision du jour », même
  carte de la mémoire, même pseudo, mêmes records dans Jouer, mêmes
  places du général.

## 6. Règles Firestore, index et tests

```
// Un compte, pas un invité (D16) : ce que le compte possède (ses
// identités), pas la méthode de la session (sign_in_provider, non prouvé
// après un lien : S16).
function compte() {
  return request.auth != null
    && request.auth.token.firebase.identities.keys().hasAny(['email', 'google.com']);
}
// Lots 2 à 5 : `return false;` (rien d'ouvert si les règles partent pour
// une autre raison). Lots 6 et 7 : les adresses vérifiées de l'utilisateur
// seulement (ci-dessous). Lot 8 : `return true;`.
// Urgence : `return false;` ferme tout joueurs/.
function essai() {
  return request.auth.token.email_verified == true
    && request.auth.token.email in ['…'];
}
function moi(uid) {
  return compte() && request.auth.uid == uid && essai();
}
// Pierre tombale (§ 7.1) : une lecture de plus par création de lot.
function tombe(uid) {
  let p = /databases/$(database)/documents/joueurs/$(uid);
  return exists(p) && get(p).data.get('supprime', false) == true;
}
match /joueurs/{uid} {
  allow read: if moi(uid);
  allow create: if moi(uid) && profilValide();
  allow update: if moi(uid) && profilValide()
    && resource.data.get('supprime', false) != true;
  // pas de delete par le client : la pierre tombale reste (§ 7.1)
  match /lots/{lot} {
    allow read, delete: if moi(uid);
    allow create: if moi(uid) && lotValide(lot) && !tombe(uid);
    // pas d'update
  }
}
match /demandes/{uid} {            // D27 b seulement
  allow create: if moi(uid) && demandeValide();
}
```

**`profilValide()`** :
- `keys().hasOnly(['v','pseudo','records','maj','supprime'])`, et
  `hasAll(['v','maj'])` ;
- `v == 1`, `maj == request.time` ;
- `pseudo` absent, ou une chaîne de 2 à 20 caractères, comme dans
  `scoreValide` ;
- `records` absent, ou une chaîne de 32 768 caractères au plus ;
- `supprime` absent, ou `== true` sans `pseudo` ni `records` (pierre
  tombale).

**`lotValide(lot)`** :
- `lot.size() == 36` ;
- `hasOnly` et `hasAll` de
  `['v','appareil','seance','fin','n','evenements']` ;
- `v == 1` ; `appareil`, une chaîne de 36 caractères ; `seance`, une
  chaîne de 36 caractères ou `null` ;
- `fin == request.time`, `n` entier de 1 à 200 ;
- `evenements`, une chaîne de `n × 160` caractères au plus.

`evenements[0].id == lot` se vérifie côté client (`lotValide` recopié),
car la carte est dans une chaîne.

**`demandeValide()`** (D27 b) : `{pseudo, cree}` seulement, `pseudo` de 2
à 20 caractères, `cree == request.time`.

**Bornes et risque résiduel** :
- un lot pèse au plus ≈ 32 Ko, et un profil au plus ≈ 32 Ko ;
- sans ces chaînes, un compte malveillant remplirait le Gio de Spark avec
  environ 1 000 documents de 1 Mio, soit quelques minutes de script ;
- avec elles, il lui faut ≈ 33 000 lots, soit 1,6 jour du quota
  d'écriture de tout le projet. Les écritures de tous seraient refusées
  pendant ce temps ;
- c'est le risque accepté de D34.

Comptes jetables : une adresse e-mail se crée sans vérification, par
l'API publique (100 comptes par heure et par IP).

App Check (#21, avec le Play Store) protégera Firestore, donc ce vecteur.
Il ne protège pas la création de comptes : pour Auth, la doc ne décrit
cette protection qu'avec Identity Platform, et l'étude ne tranche pas ce
point.

**Urgence** :
- `essai()` → `false`, puis `npx firebase deploy --only firestore`, ferme
  tout `joueurs/` en une commande ;
- rien n'est perdu : le journal de chaque appareil fait foi, et les lots
  refusés (cause `regles`) se relancent plus tard ;
- l'outil du propriétaire retire les lots d'un uid fautif (§ 7.5) ;
- le stockage se relève une fois par mois dans la console (Firestore ›
  Utilisation). Spark n'envoie aucune alerte.

**Index** (`firestore.indexes.json`, `fieldOverrides`) :
- `lots` : `evenements`, `appareil`, `seance`, `n` et `v` sans index ;
  `fin` en ordre croissant seulement ;
- `joueurs` : `records`, `pseudo`, `maj`, `v` et `supprime` sans index.

Une grande chaîne indexée coûterait jusqu'à ≈ 1,5 Ko par entrée d'index,
dans le Gio.

**Vérification d'adresse** : si D18 = a, `compte()` exige aussi
`email_verified == true` pour le fournisseur `password`.

**Tests** : `tests/regles.test.ts`. `authenticatedContext(uid, jeton)`
reçoit les claims voulus (`firebase.identities`,
`firebase.sign_in_provider`, `email`, `email_verified`).

| Cas | Attendu |
|---|---|
| Sans compte ; autre uid ; anonyme (identités vides) | refusé (lecture, création, suppression) |
| Compte `password` ou `google.com` ; anonyme lié simulé (`sign_in_provider: 'anonymous'` avec l'identité `email`) | accepté : la règle ne dépend pas de la méthode de la session |
| Règles d'essai (lots 6 et 7) : adresse hors de la liste, ou non vérifiée | refusé |
| Profil : champ en trop, `v` ≠ 1, `maj` ≠ `request.time`, pseudo de 1 ou de 21 caractères, `records` de plus de 32 768 caractères | refusé |
| Pierre tombale | posée par le propriétaire ; ensuite, mise à jour du profil et création de lot refusées, aussi depuis un 2e contexte du même uid |
| Lot valide (n = 1 ; n = 200 à la borne) | accepté |
| Lot : `n = 0` ou `201`, chaîne de plus de `n × 160`, liste au lieu d'une chaîne, champ en trop ou manquant, `fin` ≠ `request.time`, id de 35 caractères | refusé |
| Lot : update | refusé ; delete accepté par le propriétaire, refusé à un autre |
| Lecture d'une liste de `joueurs/` | refusée |
| `demandes/{uid}` (D27 b) | création par le propriétaire acceptée ; lecture et update refusés |
| Le reste de la base, `joueurs/ana` hors propriétaire (adapte le 15e test, `regles.test.ts:229-235`) | fermé |
| `classements/**` | les 14 autres tests passent inchangés |

- Les tests chargent les règles avec `essai()` remplacé au chargement
  (vrai, puis la liste d'essai) ; un test à part vérifie la version du
  dépôt (fermée jusqu'au lot 6).
- `npm run test:regles` reste sur Firestore seul : les jetons y sont
  écrits à la main.
- Les vrais jetons d'un lien sont l'affaire de `test:synchro` (§ 5.8) et
  du premier essai réel (S16).
- Déploiement : `npx firebase deploy --only firestore` (règles et index).
  - Il se fait **avant** tout essai sur le vrai projet (lot 6, règles
    d'essai) et avant l'appli qui attend ces règles.
  - Il demande l'accord de l'utilisateur : seul `--only hosting` est
    permis d'office.

## 7. Suppression, export, confidentialité

### 7.1 Suppression du compte (sans Cloud Functions)

Vue Compte, « Supprimer mon compte », puis confirmation : saisir
« supprimer », et le mot de passe pour un compte `password`. Avant la
confirmation, le texte de D27 sur les places du classement.

1. **Réauthentifier**, toujours, plutôt que d'attendre
   `requires-recent-login` :
   - compte à mot de passe :
     `reauthenticateWithCredential(EmailAuthProvider.credential(adresse, mdp))` ;
   - compte Google sur le site : `reauthenticateWithPopup` ;
   - compte Google dans l'APK : un nouvel `idToken` par le plugin.
2. Poser `session.suppression = uid`. **Tout envoi est coupé** sur cet
   appareil.
3. Lire le profil (le pseudo). Si D27 b : créer
   `demandes/{uid} = {pseudo, cree}`.
4. **Pierre tombale** : `setDoc(joueurs/{uid}, {v: 1, maj, supprime: true})`,
   étape sautée si elle est déjà posée.
   - Dès lors, les règles refusent toute écriture de lots ou de profil, de
     cet appareil comme des autres.
   - Le jeton des autres appareils vaut pourtant encore jusqu'à une heure.
5. Supprimer les lots : `getDocs` par 400, puis `writeBatch`, jusqu'à une
   page vide. N lectures et N suppressions.
6. `deleteUser(currentUser)`.
7. Effacer l'appareil comme à la déconnexion (§ 3.4), lever le drapeau,
   puis afficher « Compte supprimé. ».

**Pierre tombale** :
- elle ne contient que l'uid et la date ;
- l'outil du propriétaire l'efface au bout d'un jour (D33) ; sans lui,
  elle reste ;
- elle ne porte aucune donnée personnelle hors de l'uid, et Play permet de
  garder ce qui sert à la sécurité.

**Reprise** :
- si le drapeau est resté, l'ouverture propose « Suppression inachevée :
  reprendre ? » ;
- on repart de l'étape 1 : les étapes sont idempotentes ;
- un compte déjà supprimé dans Auth passe directement à l'étape 7.

**Autre appareil connecté au même compte** :
- dès l'étape 4, ses lots et son profil sont refusés (refus des règles,
  gardés sur l'appareil) ;
- à sa prochaine ouverture, il lit `supprime` : « Ce compte est en cours
  de suppression » ;
- quand son jeton n'est plus rafraîchi, il passe en session perdue
  (§ 2.5). L'utilisateur y choisit de garder ou d'effacer ses progrès.

**Places du classement** : elles portent le pseudo, pas l'uid, et sont
partagées par tous ceux qui jouent ce pseudo (D27).

**Anonymes orphelins** : sans données. L'outil du propriétaire les retire
au bout de 30 jours (D33) ; sinon, ils restent dans Auth, sous forme d'un
uid sans donnée personnelle.

### 7.2 Export JSON

- Vue Compte, « Exporter mes données ».
- Fichier `terramemo-{AAAA-MM-JJ}.json` :
  `{format: 'terramemo-export', v: 1, exporte_le, compte: {uid, adresse, fournisseurs, cree_le}, profil, evenements: Evenement[], a_relire, records, pseudo}`.
  - Les événements y sont entiers, pas compactés.
  - `a_relire` contient les lots bruts.
- **Site** : `Blob` + `<a download>`.
- **APK** (D26 a) :
  - `<a download>` n'est pas fiable dans la WebView ;
  - il faudrait `@capacitor/filesystem` 8.1.5 et `@capacitor/share` 8.0.3
    (MIT) ;
  - défaut : au J1b, export sur le site seulement. Le compte a tout en
    ligne, il suffit de se connecter sur le site. Dans l'APK, le bouton
    dit « Exporte depuis le site : terramemo-geo.web.app » ;
  - les plugins viennent au J3 si Play le demande.
- Un invité peut aussi exporter son journal local sur le site (même code,
  sans `compte`).
- L'export est proposé avant « Ne pas les ajouter » (§ 2.3) et avant une
  déconnexion qui perdrait des séances (§ 3.4).

### 7.3 Politique de confidentialité et page de suppression

**Où** :
- **`public/confidentialite.html`**, page statique servie à
  `https://terramemo-geo.web.app/confidentialite.html` (Hosting sans
  rewrites).
  - C'est l'URL de l'écran de consentement (§ 4.3, étape 13) et, au J3,
    celle de la Play Console.
  - Style commun, thème sombre, lisible sans JS.
- **`public/suppression.html`**, le lien web qu'exige Play :
  - elle nomme « Terramemo », comme la fiche du store ;
  - elle donne les étapes (dans l'appli ou sur le site : ⚙ › Compte ›
    Supprimer mon compte) et le lien `https://terramemo-geo.web.app/#compte` ;
  - elle donne l'adresse de D20 pour une demande faite sans se connecter.
    Une telle demande n'est traitée que si elle vient de l'adresse du
    compte ;
  - elle dit ce qui est supprimé et ce qui est gardé : places (D27),
    pierre tombale (un jour), sauvegardes de Google (180 jours).
- **Dans l'appli**, une vue `#confidentialite` :
  - elle télécharge la même page et insère son `<main>`, comme les
    licences tierces (décision « Licences tierces »). Dans l'APK, la page
    est locale et s'affiche donc hors ligne ;
  - un lien direct vers le fichier remplacerait la page de l'appli dans
    l'APK ;
  - un seul texte, sans copie dans `textes.fr.json` : c'est un document,
    pas un texte d'interface. L'anglais viendra dans
    `confidentialite.en.html` et `suppression.en.html` (décision
    « Langue »).
- Liens vers la page : ⚙, formulaire de création de compte, Crédits.

**Contenu minimal** (titre « Politique de confidentialité ») :

1. **Responsable et contact** : nom ou nom d'usage, et adresse de contact
   (D20, D25). La LCEN permet de ne publier que l'hébergeur, mais le RGPD
   veut un contact.
2. **Données et finalités** :

| Donnée | Pourquoi | Base |
|---|---|---|
| Journal des réponses, sur l'appareil seulement pour un invité | répétition espacée | — (local) |
| Adresse e-mail, uid, fournisseur de connexion | compte | art. 6.1.b (service demandé) |
| Séances (réponses horodatées, fuseau, id d'appareil), pseudo, records | synchro entre appareils | 6.1.b |
| Pseudo et scores publics au classement, uid anonyme | classement | 6.1.b ; intérêt légitime (anti-abus) |
| Adresse IP, vue par Google (Firebase, journaux d'accès d'Hosting) | fonctionnement du service | intérêt légitime |
| Connexion Google dans l'APK : Credential Manager et services Google Play de l'appareil | connexion | 6.1.b (traitement de Google, sous sa propre politique) |

3. **Destinataires** :
   - Google (Firebase), sous-traitant ;
   - Auth aux États-Unis, sous le Data Privacy Framework UE–USA ;
   - Firestore en Europe (`eur3`) ;
   - aucune publicité, aucune mesure d'audience.
4. **Durées** (D33) :
   - compte et séances : jusqu'à leur suppression, ou au bout de 2 ans
     sans activité ;
   - comptes anonymes sans donnée : 30 jours ;
   - pierre tombale : 1 jour ;
   - sauvegardes de Google : effacées sous 180 jours ;
   - adresses IP : gardées quelques semaines ;
   - places du classement : selon D27.
5. **Droits** :
   - accès et portabilité (export JSON), rectification (pseudo),
     effacement (bouton, page de suppression, e-mail) ;
   - limitation, opposition ;
   - réponse sous un mois ;
   - réclamation auprès de la CNIL.
6. **Suppression** : le chemin dans l'appli, et la page
   `suppression.html`. Play exige les deux (§ 7.4).
7. **Stockage sur l'appareil** :
   - IndexedDB et localStorage, strictement nécessaires ;
   - pas de bandeau de cookies tant qu'il n'y a pas de mesure d'audience.
8. **Mineurs** : D31.
9. Date de la version, et ce qui se passe en cas de changement.

### 7.4 Exigences du Play Store, notées pour le J3 (#5)

- **Suppression** :
  - un chemin visible dans l'appli : la vue Compte ;
  - **et** un lien web : `suppression.html`. Il nomme l'appli, marche sans
    réinstaller, et accepte une connexion, un e-mail ou un formulaire ;
  - données associées supprimées ; ce qui est gardé ne l'est que pour la
    sécurité, la fraude ou la loi, et c'est dit (D27).
- Formulaire « Sécurité des données » : données collectées et partagées
  (e-mail, identifiants, activité dans l'appli), chiffrées en transit,
  suppression possible, URL de suppression.
- URL de la politique : publique, active, pas un PDF, dans la Console et
  dans l'appli.
- SHA-1 de Play App Signing ajoutée à Firebase (§ 4.3, étape 15).
- Families Policy si l'on vise les moins de 13 ans (D31).
- Export dans l'APK si la revue le demande (D26).

### 7.5 Outil du propriétaire (D33)

**Forme** :
- `scripts/admin/*.mjs`, sur le SDK Admin (`firebase-admin`, en
  dépendance de développement) ;
- lancé à la main **sur le PC**, jamais sur le Pi ni en CI ;
- clé du compte de service dans `~/Sauvegardes/terramemo/admin/` ;
- à blanc par défaut : il faut `--appliquer` pour agir.

**Tâches** :
- comptes sans activité depuis 2 ans :
  - critère : `metadata.lastRefreshTime` (dernier jeton rafraîchi). **Pas**
    `lastSignInTime`, qui ne bouge pas tant que la session dure : un
    joueur fidèle connecté une seule fois serait purgé ;
  - leurs lots et leur profil d'abord, puis `deleteUsers` (par 1 000) ;
- anonymes sans fournisseur ni donnée depuis 30 jours ;
- pierres tombales de plus d'un jour ;
- lots sans compte (orphelins) ;
- `demandes/` (D27 b) : places du pseudo retirées, puis la demande ;
- uid abusif : ses lots et son profil, puis
  `updateUser(uid, {disabled: true})` ;
- relevé du nombre de lots et de leur taille par uid, les plus gros
  d'abord (surveillance du Gio, D34).

**Coût** : des appels ordinaires de Spark (lectures, suppressions), sans
facturation ni Cloud Functions.

**Tournée** : trimestrielle, notée au skill `run-terramemo`. La politique
en annonce les durées.

## 8. Sûreté pendant la semaine d'usage (jusqu'au 13/11), et après

| Risque | Correction |
|---|---|
| Un nouvel APK casse le journal de l'A37 (migration ratée, bug d'union) | `terramemo-journal` reste en v1, et l'état d'envoi va dans une base neuve. **Aucune installation sur l'A37 avant le 13/11** (D30). Avant toute installation : `sauver_journal`. Installation de jour, l'utilisateur présent : le téléphone est verrouillé la nuit, et le débogage USB se coupe parfois après une installation (`restaurer_journal` demande alors de le rallumer à la main, sur le téléphone) |
| Perte du journal | `sauver_journal` (lot 0) : `Runtime.evaluate` dans la WebView inspectable (build « debug »), lecture **brute** de `terramemo-journal` (`getAll` sans filtre), invalides comptés, écriture dans `~/Sauvegardes/terramemo/journal-{date}.json`, nombre d'événements affiché. `restaurer_journal` ajoute un événement à la fois (un invalide n'emporte pas les autres) et liste ceux qu'il écarte |
| Changement de persistance d'Auth | `getAuth()` gardé au J1b (§ 4.2) |
| Déconnexion ou « Ne pas les ajouter » qui efface le journal | l'invité n'a pas de bouton « Se déconnecter » ; l'effacement ne se fait qu'après un envoi vérifié, ou après une confirmation qui donne le nombre de réponses ; une session perdue n'est pas une déconnexion (§ 2.5) |
| Comptes visibles du public avant la politique | `comptesVisibles()` est vrai en DEV, ou si `COMPTES_OUVERTS` est vrai (faux jusqu'au lot 8, D15), ou avec le drapeau `localStorage` `terramemo.comptes`. Le drapeau est posé par `?comptes` et retiré par `?comptes=0` ; dans l'APK, qui n'a pas d'adresse à modifier, le pilote le pose (`Runtime.evaluate`, puis rechargement) |
| `?comptes` deviné en production ; fournisseurs activés tôt | ce drapeau ne protège rien : la clé d'API est publique. La protection est dans les règles : `joueurs/` reste fermé jusqu'au lot 6, puis ouvert aux seules adresses vérifiées de l'utilisateur jusqu'au lot 8 (`essai()`, § 6). Un compte créé avant par REST ne peut rien stocker |
| Écriture dans le vrai projet pendant un test | `?sans-synchro`, ou le drapeau `terramemo.sans-synchro`, lu en production aussi, coupe envois et lectures de `joueurs/`. Le driver le pose hors émulateurs. **Sur un appareil de l'utilisateur (l'A37, son Chrome), il le pose au début de chaque commande et le retire à la fin, même en cas d'erreur** : sinon la synchro de l'utilisateur resterait coupée sans qu'il le sache. `synchro()` et la vue Compte disent s'il est resté posé |
| Règles déployées avant l'appli qui les attend | sans risque : `classements/**` ne change pas, et ses tests restent au vert |
| Déploiement Hosting pendant la semaine d'usage | chaque lot est déployé, comptes cachés. Le lot 0 (déplacement de `charger` et `compte`) garde un comportement identique, et les tests du classement ne changent pas |

`SYNCHRO_SITE_PUBLIC` (J1a) est remplacé par D16 et par
`comptesVisibles()`. Le site et l'APK ont le même code : seule la
visibilité des comptes diffère, jusqu'au lot 8.

## 9. Lots

Chaque lot finit par `npm run typecheck`, `npx vitest run` et
`npm run build` au vert, par un commit « … (#3) » ou « … (#13) », puis
par un déploiement Hosting, comptes cachés. Jusqu'au lot 8, rien n'est
visible en production.

| Lot | Contenu | Critère | Début bloqué par |
|---|---|---|---|
| 0. Socle sans effet | `src/sync/firebase.ts` (`charger`, `compte`, `uid()`, `languageCode`) sorti de `classement.ts`, même comportement ; `comptesVisibles()` ; `?sans-synchro` et les drapeaux (retirés par le driver sur les appareils de l'utilisateur) ; `sauver_journal` et `restaurer_journal` bruts ; `terramemo-synchro` dans `BASES_GARDEES` | tests du classement inchangés ; journal de l'A37 sauvé une fois dans `~/Sauvegardes` | rien |
| 1. Comptes e-mail | vue `compte` à la demande (états, formulaires avec `autocomplete`, erreurs, oubli, vérification non bloquante et `reload()`, changement de mot de passe) ; lien de l'invité et `getIdToken(true)` ; `session` (dernier uid, session perdue, § 2.5) ; textes `compte` ; `npm run test:comptes` (émulateur Auth) | aux émulateurs : créer, lier un anonyme (uid égal avant et après), se connecter, oubli, chaque erreur traduite, session perdue après un mot de passe changé depuis un 2e contexte ; tests DOM ; morceau principal + 3 Ko gzip au plus | rien : D17, D18 et D19 ont un défaut. S15 dès que l'étape A de la console est faite |
| 2. Profil | règles `joueurs/{uid}` (identités, `profilValide`, pierre tombale) et leurs tests ; `assurerProfil` ; pseudo et records par transaction ; `profil_a_ecrire` ; zone pseudo du classement | tests de règles ; deux contextes aux records croisés, aucun perdu ; pseudo retrouvé sur un 2e contexte | rien : D8 et D21 ont un défaut |
| 3. Envoi | `terramemo-synchro` ; `src/sync/lots.ts` (encodage par position) ; séance close, arrière-plan, Web Locks ; issues (réconciliation par les ids lus, refus relancés) ; règles `lots`, exemptions d'index et tests ; état de la synchro et « Réessayer » | aller-retour exact ; borne des règles tenue à 200 réponses ; renvoi sans doublon ; recomposition sans perte après un état perdu ; refus relancé ; hors ligne ; rien n'est envoyé pour un anonyme | rien : D16, D32, D34 et D35 ont un défaut |
| 4. Lecture et union | restauration par pages, lecture incrémentale, `a_relire` ; `Memoire.fusionner` et `effacer`, événements de la page, rejeu différé ; connexion à un compte existant (D22) ; déconnexion reprenable (D24) ; session perdue, reconnexion | **critère de #3** : `test:synchro` (§ 5.8, 1) et `ui_synchro` (§ 5.8, 2) | rien : D22, D23 et D24 ont un défaut |
| 5. Suppression, export, confidentialité | § 7.1 (pierre tombale, reprise) ; export JSON (site) ; `public/confidentialite.html`, `public/suppression.html`, vue `#confidentialite` ; liens dans ⚙, Crédits et le formulaire | aux émulateurs : suppression complète, reprise après une coupure, écriture d'un 2e contexte refusée après la pierre tombale ; export relu par `valider()` ; pages servies en preview | rien pour le code (D26 a un défaut). Le **texte publiable** attend D20, D25, D27, D31 et D33 |
| 5b. Outil du propriétaire | `scripts/admin/` (§ 7.5) | à blanc sur le vrai projet : la liste de ce qui serait supprimé | D33 ; clé du compte de service (étape E) |
| 6. Google sur le site | popup : création, lien, conflits (§ 2.3), réauthentification ; puis essai réel avec `?comptes` et les règles d'essai déployées | aux émulateurs (Google simulé, S9) ; puis sur le vrai site, dans Chrome sur le PC et sur l'A37 : lien d'un invité, synchro, S3, S5, S15, S16 | lot 1 (partie émulateurs) ; lot 3 pour l'essai réel ; D20 ; étapes A et B de la console ; accord pour `deploy --only firestore` |
| 7. Google dans l'APK | plugin figé, importé seulement en natif ; `ID_CLIENT_WEB` ; erreurs du plugin ; `licences:android` et Crédits ; poids mesuré avant et après ; comptes montrés dans l'APK par le drapeau | sur l'AVD (si D30 b), puis sur l'A37 **après le 13/11 et après `sauver_journal`** : lien Google d'un invité, connexion au compte du site, S4, S11, S18 à S20 | lot 6 ; D28 et D30 ; étape C de la console ; le 13/11 pour l'A37 |
| 8. Ouverture | `essai()` → vrai, règles déployées ; Hosting ; `COMPTES_OUVERTS = true` ; consentement Google en production ; `smoke` et `ui` en ligne, avec `sans-synchro` ; APK sur l'A37 | **critère de #13** à la main (§ 5.8, 3) ; politique et page de suppression en ligne | lots 5 et 7 ; D15, D20, D25, D27, D31, D33, D34 ; étape D de la console |
| 9. Saisie libre (#3), jalon à part | saisie tolérante, collisions des noms, claviers de l'A37, fiches `nommer` en saisie | conçue à part, après le lot 8 | lot 4 au moins : `a_relire` doit être en place avant que le site écrive un mode ou un champ nouveau. De préférence, APK mis à jour avant le site |

**Précisions du lot 4** (07/11, fait ; écarts assumés au texte d'avant) :
- question D22 (§ 2.3) : le compte est connecté *avant* la question,
  seul moyen de connaître son uid (une session perdue du même compte
  reprend sans question). La session ne le prend qu'après la réponse :
  `pourSynchro` et la passe du profil ne servent que le compte de la
  session. `session.connexion` (instant) dit à une page suivante qu'une
  question a été tuée en route : le compte n'est pas pris, puis il est
  déconnecté au bout de 10 min. « Annuler », ou un échec avant la prise
  (effacement, lecture du journal), le déconnectent ;
- la question compte aussi les records de l'appareil (« 12 réponses et
  3 records ») : un appareil qui n'a joué que des Chrono a des progrès ;
- « Créer un compte » depuis une session perdue d'un autre compte pose la
  même question, avant la création ; « Ne pas les ajouter » n'efface
  qu'une fois le compte créé ;
- déconnexion (§ 3.4) : un effacement inachevé (journal qui ne se vide
  pas) se finit au démarrage, avant la lecture du journal, et avant toute
  nouvelle connexion ; l'envoi et les comptes lisent le journal en
  strict (une lecture ratée ne vaut jamais « rien à envoyer ») ; les
  autres onglets gèlent leurs écritures pendant l'effacement
  (BroadcastChannel `terramemo`), puis se rechargent ;
- « Exporter d'abord » (question et déconnexion) vient avec l'export, au
  lot 5 ;
- `a_relire` (§ 5.3) se relit par lot, quand la version qui l'a lu n'est
  plus celle de l'appli, plutôt que par `session.version` ;
- `test:synchro` (§ 5.8, 1) : « hors ligne » = les appels Firestore de
  l'appareil échouent comme un fetch coupé. Un faux `fetch` global
  couperait les deux appareils, qui tournent dans le même processus.
  Les 10 scénarios y sont, plus « Ne pas les ajouter », la déconnexion
  suivie d'un retour, et la pagination réelle de la lecture.

Ordre et parallélisme :
- 0, puis 1, puis 2, puis 3, puis 4, puis 5 : en série ;
- 6 : la partie aux émulateurs commence dès le lot 1 ; l'essai réel
  vient après le lot 3, pour essayer la synchro avec ;
- 5b : dès la réponse à D33, après le lot 2 (pierre tombale) ;
- 7 : après le 6, et après le 13/11 pour l'A37 ;
- 8 en dernier ;
- 9 : sa conception peut commencer tout de suite ; son code après le
  lot 4, sans toucher `textes.fr.json` en même temps qu'un autre lot
  (conflits).

## 10. Décisions en attente de l'utilisateur

Chaque réponse se note au registre. Une réponse qui contredit une
décision actée la **remplace** (`noter_decision`, `remplace`).

### Bloquent l'ouverture au public (lot 8) et le texte de la politique

**D15. Comptes et synchro sur le site public.** Elle remplace
`SYNCHRO_SITE_PUBLIC` du J1a.
- Options :
  - a) comptes et synchro ouverts sur le site et dans l'APK au lot 8,
    une fois la politique, la page de suppression et la suppression du
    compte en ligne ;
  - b) APK seul (l'utilisateur) jusqu'au J3 ;
  - c) site ouvert dès le lot 4, politique ensuite.
- Coût / apport :
  - a) le critère de #13 exige le site ;
  - b) le critère de #13 n'est pas tenu ;
  - c) envoi de données sans politique ni suppression, contraire à
    « Public et modèle ».
- Recommandation : **a**.
- Défaut : aucun. `COMPTES_OUVERTS = false` jusqu'à la réponse.

**D20. Adresses de contact.** Deux usages, aux contraintes différentes :
- l'**e-mail d'assistance de Google** (fournisseur Google de Firebase,
  écran de consentement) : une liste fermée. Ne s'y trouvent que
  l'adresse du compte Google connecté et les groupes Google qu'il gère.
  Un alias Gmail n'y figure pas ;
- le **contact public** (politique, demandes RGPD, « Répondre à » des
  e-mails de Firebase) : une adresse libre, un alias est possible.
- Options :
  - a1) un groupe Google `terramemo-…@googlegroups.com` géré par
    l'utilisateur, pour les deux usages ;
  - a2) un compte Google dédié, ajouté propriétaire du projet ;
  - b) l'adresse personnelle pour Google, un alias pour le contact
    public ;
  - c) l'adresse personnelle partout.
- Coût / apport :
  - a1) 5 min ; les messages arrivent dans sa boîte, et l'adresse
    personnelle reste cachée ;
  - a2) un compte de plus à garder ;
  - b) l'adresse personnelle est visible sur l'écran de Google ;
  - c) rien à faire, tout est exposé.
- Recommandation : **a1**.
- Défaut : **aucun** (donnée de l'utilisateur). D20 bloque l'activation
  de Google (étape 7) et la politique.

**D25. Page de confidentialité : lieu, identité, date de mise en ligne.**
- Options :
  - lieu :
    - a) page statique sur Hosting, plus une vue de l'appli qui la charge
      (§ 7.3) ;
    - b) texte dans `textes.fr.json`, rendu par l'appli et par une page
      générée au build ;
    - c) page externe (Google Sites ; GitHub Pages est exclu, le dépôt
      étant privé) ;
  - identité : nom complet, ou nom d'usage avec l'adresse de D20 ;
  - mise en ligne : dès sa rédaction (lot 5), ou au lot 8.
- Coût / apport :
  - a) un fichier, un seul texte ;
  - b) un générateur de plus ;
  - c) hors du projet, sans lien avec le domaine du consentement Google ;
  - mise en ligne dès le lot 5 : le classement actuel (pseudo, scores,
    uid anonyme) en demande déjà une. La page se met à jour au lot 8.
- Recommandation : **a**, avec le nom d'usage et l'adresse dédiée, en
  ligne dès le lot 5.
- Défaut : a pour le lieu, mise en ligne au lot 8. L'identité est **sans
  défaut**.

**D27. Places du classement à la suppression du compte.** Elles
appartiennent au pseudo, partagé par tous ceux qui le jouent, sans uid.
Play exige de supprimer « les données associées au compte » ; ce qui
reste ne doit servir qu'à la sécurité, à la fraude ou à la loi.
- Options :
  - a) gardées sous le pseudo, et dit clairement avant la confirmation.
    Le retrait se demande par e-mail, et n'est accepté que depuis
    l'adresse du compte qui porte ce pseudo, vérifiée par le
    propriétaire avant la suppression ;
  - b) à la suppression, l'appli écrit `demandes/{uid} = {pseudo, cree}`.
    Cette demande est authentifiée par le compte lui-même. L'outil du
    propriétaire (D33) retire ensuite les places de ce pseudo, et la
    politique annonce un délai (30 jours au plus) ;
  - c) les places portent l'uid du dernier compte (D23 b), et l'appli les
    retire elle-même.
- Coût / apport :
  - a) rien à coder ; la conformité à Play n'est pas garantie, puisque des
    données associées restent ; sans authentification, une demande par
    e-mail permettrait de faire retirer les places d'un autre ;
  - b) une règle, un document, l'outil et sa tournée ;
  - c) règles, tests et décision « Une place par pseudo » à revoir.
  - Dans les trois cas, une place partagée disparaît pour tous ceux qui
    jouent ce pseudo : c'est le prix de « Une place par pseudo ».
- Recommandation : **b** si D33 a, sinon **a**.
- Défaut : a, avec son texte avant la confirmation.

**D31. Âge minimum.** C'est une question de droit, que l'étude ne
tranche pas.
- Options :
  - a) pas d'âge minimum déclaré, sur la base 6.1.b. Il n'y a pas de
    consentement, donc pas la règle des 15 ans ; reste la capacité d'un
    mineur à conclure ce « contrat », discutable ;
  - b) 15 ans et plus pour créer un compte ; on joue sans compte avant ;
  - c) public d'élèves visé : Families Policy au J3, comptes Google des
    moins de 13 ans gérés par Family Link.
- Recommandation : **a** au J1b, faute de public jeune visé, à revoir au
  J3 (#5). La page le dit.
- Défaut : a.

**D33. Outil du propriétaire et durées de conservation.**
- Options :
  - a) l'outil du § 7.5, avec 2 ans sans activité (la durée que la CNIL
    recommande dans un cas voisin) et une tournée trimestrielle ;
  - b) pas d'outil. La politique dit « jusqu'à la suppression par
    l'utilisateur », et les anonymes et pierres tombales ne sont jamais
    nettoyés ;
  - c) un outil sans purge des inactifs : abus et demandes seulement.
- Coût / apport :
  - a) un script et une tournée ; une clé de compte de service à garder
    hors du dépôt (elle donne tous les droits sur le projet) ;
  - b) rien à faire, mais une durée floue (la CNIL a sanctionné Discord
    pour cela), et aucun recours contre un abus ;
  - c) entre les deux.
- Recommandation : **a**.
- Défaut : a, codé à blanc. Rien n'est supprimé sans l'utilisateur, et la
  politique attend la réponse.

**D34. Abus du stockage : risque accepté ?**
- Options :
  - a) bornes de taille (chaînes, § 6), procédure d'urgence, retrait d'un
    uid par l'outil (D33). Le risque résiduel est accepté ;
  - b) a, plus un débit plafonné par compte : chaque lot ferait avancer un
    compteur du profil dans le même lot d'écriture, vérifié par
    `getAfter` ;
  - c) a, plus une adresse vérifiée exigée (D18 a) ;
  - d) attendre App Check (#21, avec le Play Store).
- Coût / apport :
  - a) déjà dans la conception ; un abus déterminé brûlerait le quota
    d'écriture du jour ;
  - b) double les écritures de la synchro ;
  - c) une vraie boîte par compte ; la vérification gêne un peu ;
  - d) rien avant le J3.
- Recommandation : **a**, puis c si un abus se voit.
- Défaut : a.

### Bloquent Google (lots 6 et 7)

**D28. Plugin Google natif.**
- Options :
  - a) `@capawesome/capacitor-google-sign-in` 0.1.4 (MIT), figé ;
  - b) `@capacitor-firebase/authentication` 8.6.0, avec `skipNativeAuth`
    et un `overrides` de `firebase` ;
  - c) un plugin Kotlin maison sur Credential Manager (≈ 100 lignes).
- Coût / apport :
  - a) léger, sans `google-services.json`, mais jeune. D'après son README,
    il signale un client Android manquant comme une annulation, ce que
    § 3.3 traite ;
  - b) mûr, mais deux couches d'auth et un override hors garantie de
    l'éditeur ;
  - c) aucune dépendance, mais du code natif à maintenir, ce que la
    décision « Une seule base web » évite.
- Recommandation : **a**, avec c en repli si a casse.
- Défaut : a.

**D29. Activation des fournisseurs.**
- Options :
  - a) à la main dans la console (§ 4.3, étapes 1 et 7) ;
  - b) déclarés dans `firebase.json`, puis
    `npx firebase deploy --only auth`.
- Coût / apport :
  - a) 10 min ; la trace est dans cette étude ;
  - b) la configuration est tracée dans git. Mais la commande passe par
    une API de provisionnement en `v1alpha`. Elle prend l'appli « Default
    Web App » ou la première venue (l'appli Android après le lot 7), et
    en crée une s'il n'y en a pas. Son effet sur le type d'Auth du projet
    n'est pas vérifié (S1). Elle exige enfin une permission.
  - Dans les deux cas : une fois l'appli Android déclarée, ne plus lancer
    `deploy` sans `--only`, car le bloc `auth` de `firebase.json`
    passerait par cette API.
- Recommandation : **a**.
- Défaut : a.

**D30. Appareil d'essai, calendrier de l'APK, marque Google.**
- Options :
  - essai de Google dans l'APK :
    - a) sur l'A37 seulement, après le 13/11 et après `sauver_journal` ;
    - b) d'abord sur un AVD avec Google Play sur le PC, signé par la clé
      stable, puis sur l'A37 ;
    - c) un APK `.test` à part, avec un 2e client OAuth Android ;
  - écran de consentement :
    - en Testing jusqu'au lot 8, puis publié en production avec le
      domaine affiché ;
    - vérification de la marque tentée ensuite, ou attendue. Pour
      `web.app`, seule une propriété « préfixe d'URL » est possible dans
      Search Console, et son acceptation n'est pas confirmée.
- Coût / apport :
  - a) rien à installer, mais le code d'essai tourne sur le vrai journal ;
  - b) un émulateur de 2 à 4 Go de mémoire, à ne pas lancer pendant un
    workflow (risque de gel du PC), et un compte Google à y connecter ;
  - c) une configuration de plus.
- Recommandation : **b**, puis l'A37 ; consentement en Testing, puis en
  production au lot 8, et la vérification tentée ensuite.
- Défaut : a.

### Défauts codés dès les lots 1 à 5 (à confirmer avant le lot 8)

**D9. Moment de l'invité anonyme.**
- Contexte : la version du 06/11 de « Comptes » dit « Firebase Auth
  anonyme », sans plus fixer le moment. Celle du 04/11 disait « au
  premier lancement ». Le code le crée à la première publication.
- Options :
  - a) au premier lancement ;
  - b) à la demande (publication d'un score, connexion).
- Coût / apport :
  - a) ≈ 85 Ko gzip de Firebase pour chaque visiteur (quota Hosting), et
    un compte Auth par visiteur, qui n'apporte rien avec D16 ;
  - b) rien à changer. Le lien garde l'uid quand il existe ; sans uid, la
    création du compte en donne un.
- Recommandation et défaut : **b**. Il ne remplace rien dans la décision.

**D16. Synchro réservée aux comptes.**
- Options :
  - a) l'anonyme n'envoie rien, et tout part au lien. Les règles
    l'imposent par les identités ;
  - b) l'anonyme envoie aussi (prévu au § 8 du J1a).
- Coût / apport :
  - a) aucune donnée en ligne pour qui n'a rien demandé (RGPD plus simple,
    quota épargné), et pas d'orphelin chargé. Le lien d'un gros journal
    coûte quelques centaines d'écritures ;
  - b) rien à envoyer au lien, mais des séances orphelines à chaque
    appareil perdu, et des données personnelles sans compte.
- Recommandation et défaut : **a**.

**D17. Mot de passe.**
- Options : a) 8 caractères au moins, sans autre exigence (Light) ; b) 6
  (défaut de Firebase) ; c) avec majuscule, chiffre et symbole.
- Recommandation et défaut : **a**, mode Require, si la console le permet
  sans Identity Platform.

**D18. Vérification d'adresse.**
- Options :
  - a) obligatoire avant la synchro (`email_verified` dans `compte()`) ;
  - b) envoyée, non bloquante, rappelée dans la vue Compte.
- Coût / apport :
  - a) protège « mot de passe oublié » et freine les comptes jetables
    (D34), comme la doc de Google le recommande. Mais une adresse mal
    tapée bloque la synchro (pas de changement d'adresse au J1b), et le
    critère de #13 gagne une étape ;
  - b) jeu et synchro immédiats ; une adresse fausse ne perd que la
    réinitialisation. Les comptes Google sont vérifiés d'office.
- Recommandation : **b**, et a si un abus se voit (une ligne de règles).
- Défaut : b.

**D19. Mot de passe ajouté à un compte Google.**
- Options : a) non (décision de Light du 08/10) ; b) oui
  (`linkWithCredential` d'un `EmailAuthProvider`).
- Recommandation et défaut : **a**.

**D8. Résumé par joueur (`joueurs/{uid}`)**, recadrée.
- Options :
  - a) profil écrit seulement au changement de pseudo ou de record, par
    transaction (§ 5.4) ;
  - b) résumé réécrit à chaque séance (plan du J1a), avec un compteur et
    la dernière `fin` ;
  - c) aucun profil.
- Coût / apport :
  - a) quelques écritures par semaine ; pseudo et records suivent le
    compte ;
  - b) double les écritures, pour une lecture qui ne coûte pas moins que
    la requête sur `fin` ;
  - c) il faut retaper son pseudo, et des records sont perdus : le
    critère de #13 n'est pas tenu.
- Recommandation et défaut : **a**.

**D21. Pseudo et records dans le compte ; pseudo réservé ?**
- Options :
  - a) pseudo et records dans le profil, pseudo **non réservé** (« Une
    place par pseudo » inchangée) ;
  - b) a, plus une réservation `pseudos/{cle} = {uid}` en création seule
    pour les comptes. Un invité ne pourrait plus prendre un pseudo
    réservé ;
  - c) rien dans le compte.
- Coût / apport :
  - a) petit ;
  - b) règles du classement à changer (vérifier la réservation à chaque
    `setDoc`, une lecture de plus dans les règles), et une décision à
    remplacer. Les places d'avant restent partagées ;
  - c) le critère de #13 n'est pas tenu.
- Recommandation : **a** au J1b, et b en ticket si l'usurpation se voit.
- Défaut : a.

**D32. Un document par lot plutôt que par séance.** C'est une précision
de « Comptes », qui dit « un document Firestore par séance, jamais par
réponse ».
- Options :
  - a) des lots (§ 5.2) : un par séance, plus un par reprise après un
    envoi ou un passage en arrière-plan ;
  - b) un document par séance, complété par des `update`.
- Coût / apport :
  - a) 1 à 3 écritures par séance, jamais une par réponse : la raison de
    la décision (le quota) tient. Création seule, renvoi idempotent ;
  - b) une règle d'`update` qui ne ferait que croître, impossible à
    vérifier sur une chaîne bornée, et des conflits entre onglets, pour
    le même nombre d'écritures (un `update` par envoi).
- Recommandation et défaut : **a**. La décision « Comptes » est à
  préciser : « un document par lot d'une séance ».

**D35. Capacité de stockage de Spark** (usage normal, § 5.7).
- Options :
  - a) encodage par position dès la v1, exemptions d'index, relevé
    mensuel du stockage. Un instantané (état FSRS de chaque fiche en
    ligne, lots anciens retirés) devient un ticket quand le stockage
    passe la moitié du Gio ;
  - b) un instantané dès le J1b ;
  - c) les cartes à clés du premier jet.
- Coût / apport :
  - a) un encodage un peu plus long à écrire, sans coût à l'usage :
    ≈ 450 joueurs-années assidus ;
  - b) un format et des règles de plus, avant tout besoin ;
  - c) plus lisible dans la console, mais deux fois plus lourd
    (≈ 245 joueurs-années).
- Recommandation et défaut : **a**.

**D22. Fusion à la connexion d'un compte existant.**
- Options :
  - a) union automatique du journal local ;
  - b) une question quand le journal local n'est pas vide (§ 2.3) :
    - « Ajouter », bouton principal, en premier ;
    - « Ne pas les ajouter », en danger, avec une seconde confirmation
      qui donne le nombre de réponses, et « Exporter d'abord » sur le
      site ;
    - « Annuler » ;
    - pas de question si c'est le journal du même compte (session
      perdue) ; une question à part s'il contient des séances non
      envoyées d'un autre compte ;
  - c) refuser la connexion tant qu'il y a un journal local.
- Coût / apport :
  - a) aucune question, mais sur un appareil partagé, les progrès d'un
    autre se mêlent au compte sans retour ;
  - b) une question, une fois ;
  - c) bloque le cas courant : le critère de #13 lui-même.
- Recommandation et défaut : **b**.

**D23. Classement d'un uid fusionné ou abandonné.**
- Options :
  - a) rien : les places appartiennent au pseudo ;
  - b) ajouter l'uid aux places, puis les réattribuer à la fusion.
- Coût / apport :
  - a) rien ;
  - b) règles, tests et décision « Une place par pseudo » à revoir, et un
    uid public dans chaque place.
- Recommandation et défaut : **a**.

**D24. Déconnexion et session perdue : le journal local.**
- Options pour la déconnexion :
  - a) journal effacé après un envoi vérifié (sinon avertissement, et
    export sur le site), de façon reprenable (§ 3.4) ;
  - b) journal gardé : l'appareil redevient invité avec ce journal ;
  - c) un journal par compte (une base par uid).
- Session perdue (§ 2.5) : le journal est toujours gardé, et
  l'utilisateur choisit « Se reconnecter », « Continuer sans compte » ou
  « Effacer cet appareil ».
- Coût / apport :
  - a) appareil propre pour le suivant ; il faut une restauration à la
    reconnexion ;
  - b) rien à relire, mais le compte suivant se voit proposer ce journal
    (D22) ;
  - c) le plus juste, mais il touche `terramemo-journal` (un nom par uid)
    et le pilote.
- Recommandation et défaut : **a**, avec cette conduite pour la session
  perdue.

**D26. Export dans l'APK.**
- Options :
  - a) sur le site seulement au J1b (le compte a tout en ligne), avec un
    renvoi vers le site dans l'APK ;
  - b) `@capacitor/filesystem` et `@capacitor/share` dès le J1b.
- Coût / apport :
  - a) rien à coder. Mais un invité de l'APK, ou un compte dont des lots
    sont refusés, ne peut rien exporter avant « Ne pas les ajouter » ou
    une déconnexion forcée ;
  - b) deux plugins natifs, leurs licences, un essai sur l'A37.
- Recommandation : **a**, et b au J3 si Play le demande.
- Défaut : a.

## 11. Non retenu

- **Synchro par le cache persistant de Firestore**, comme dans Light :
  Firestore lite n'en a pas, et passer au Firestore complet ajouterait
  ≈ 100 Ko gzip.
- **Magasin d'envoi dans `terramemo-journal` v2** : migration risquée sur
  l'APK installé (§ 5.1).
- **Règles fondées sur `sign_in_provider`** : sa valeur après un lien et
  après un rafraîchissement du jeton n'est prouvée nulle part. Les
  identités du compte la remplacent (§ 6).
- **Cartes en liste de maps** : les règles ne savent pas borner leur
  taille (§ 6).
- **« Absent » déduit d'un `getDoc` refusé** : un refus de lecture ne dit
  rien de l'existence du lot.
- **Effacement automatique sur session perdue** : un mot de passe changé
  et un compte supprimé donnent le même code (§ 2.5). L'effacement
  perdrait des séances après un simple changement de mot de passe.
- **Débit plafonné par compte** : il doublerait les écritures (D34 b).
- **Un document par séance, complété par la suite** : D32 b.
- **Supprimer l'anonyme abandonné avant de quitter sa session** : il ne
  porte rien (D16). Un `deleteUser` d'anonyme ancien peut exiger une
  connexion récente impossible à refaire, et l'outil du propriétaire le
  retire au bout de 30 jours (D33).
- **Redirection Google avec `authDomain` sur `web.app`** : la popup
  suffit. À reprendre si elle est trop souvent bloquée sur mobile.
- **`initializeAuth` sans résolveur dans l'APK au J1b** : gain non
  mesuré, risque sur l'uid de l'A37.
- **Fusion des budgets de grappes de deux appareils** : 2 grappes le même
  jour est un cas rare et sans dommage.
- **Changement d'adresse e-mail** (`verifyBeforeUpdateEmail`) : à
  reprendre si quelqu'un le demande.
- **Identity Platform, SMTP personnalisé, lien de connexion par e-mail,
  logo sur le consentement** (§ 4.4).
- **`deploy --only auth`** (D29).
- **Connexion Apple** : 99 $ par an, déjà refusée dans Light.

## 12. Suppositions à vérifier

| # | Supposition | Comment vérifier | Quand |
|---|---|---|---|
| S1 | `deploy --only auth` active e-mail et Google sans changer le type d'Auth du projet | GET `admin/v2/projects/terramemo-geo/config` avant et après (`subtype == FIREBASE_AUTH`) | si D29 b |
| S2 | Ajouter l'appli Android avec sa SHA-1 dans Firebase crée le client OAuth Android | console, étape 11 | lot 7 |
| S3 | `signInWithPopup` marche dans Chrome sur Android, avec `authDomain` sur `firebaseapp.com` | essai sur l'A37 | lot 6 |
| S4 | Garder `getAuth()` dans l'APK n'empêche pas `linkWithCredential` (le résolveur de popup ouvre un iframe, sans gêne) | AVD, puis A37 | lot 7 |
| S5 | Google qui remplace un fournisseur `password` non vérifié garde l'uid ; le lien Google sur une adresse déjà prise répond `email-already-in-use` | émulateur Auth, puis vrai projet avec une adresse d'essai | lot 6 |
| S6 | `deleteUser` d'un anonyme ancien lève `requires-recent-login` | — | sans objet avec D16 a |
| S7 | Les règles ne bornent ni une carte dans une liste ni une valeur de map | doc des règles : d'où les chaînes (§ 6) | fait |
| S8 | `@firebase/rules-unit-testing` reçoit les claims voulus dans `authenticatedContext` | `test:regles` | lot 2 |
| S9 | L'émulateur Auth simule Google (faux `idToken`) pour la popup et `signInWithCredential` | doc de l'émulateur | lot 6 |
| S10 | Un `writeBatch` lite de 400 suppressions passe | émulateurs | lot 5 |
| S11 | Le plugin 0.1.4 tourne sur l'A37 (Android 16, Credential Manager) | AVD, puis A37 | lot 7 |
| S12 | Le quota de 150 réinitialisations par jour donne `auth/too-many-requests` ou `auth/quota-exceeded` | non vérifiable sans l'atteindre : les deux codes sont traduits | lot 1 |
| S13 | `Runtime.evaluate` dans la WebView lit `terramemo-journal` en entier, brut, quelle que soit sa taille | `sauver_journal` | lot 0 |
| S14 | La relecture depuis `marque − 5 min` suffit contre les `fin` en retard | émulateurs, écritures croisées | lot 4 |
| S15 | Le lien e-mail d'un anonyme marche sur le vrai projet, sous la protection contre l'énumération (le code passe par `signUp` avec `idToken`) | adresse d'essai | dès l'étape A, au plus tard au lot 6 |
| S16 | Claims du jeton juste après un lien, puis après un rafraîchissement : `identities` contient `email` ou `google.com` ; valeur de `sign_in_provider` | `test:synchro` (émulateur), puis vrai projet | lots 4 et 6 |
| S17 | `navigator.locks` et `BroadcastChannel` existent dans la WebView de l'A37 | pilote | lot 3 |
| S18 | Ce que montre la feuille de Credential Manager sans marque vérifiée (domaine ou id du projet) | essai | lot 7 |
| S19 | Un client Android manquant donne `SIGN_IN_CANCELED` avec « Account reauth failed » (README du plugin), et non `NO_CREDENTIAL_AVAILABLE` | AVD sans le client, avant l'étape 11 | lot 7 |
| S20 | Poids réel ajouté à l'APK : +2 à 3,5 Mo estimés | `driver.py apk`, avant et après | lot 7 |
| S21 | Ce que fait Spark au-delà de 1 Gio stocké (écritures refusées ? service coupé ?) | non documenté officiellement : surveillance mensuelle (§ 6) | — |
| S22 | Un envoi lancé au passage en arrière-plan aboutit dans la WebView de l'A37, sinon il repart à l'ouverture | pilote | lot 3 |
| S23 | Le même `idToken` Google sert encore à `signInWithCredential` après un lien refusé | émulateur, puis A37 | lot 7 |
| S24 | `localhost` dans les domaines autorisés n'est pas exigé par la connexion par jeton de l'APK (précaution : ne jamais le retirer) | — | — |
| S25 | `lastRefreshTime` du SDK Admin suit bien l'activité d'un joueur dont la session dure | essai à blanc de l'outil | lot 5b |

## 13. Sources

- Carte du code, au commit `b948f87` :
  - `src/epreuve/{classement,chrono}.ts`, `src/journal/*.ts`,
    `src/srs/{journal,rejeu,seance}.ts`, `src/vues/{seance,classement}.ts` ;
  - `firestore.rules`, `firestore.indexes.json`, `firebase.json`,
    `tests/regles.test.ts` ;
  - `android/app/build.gradle`, `capacitor.config.ts`, `main.ts`,
    `licences/android.mjs` ;
  - `.claude/skills/run-terramemo/driver.py`.
- Code des outils : `node_modules/@firebase/auth/dist/esm/index-Bz2J43nW.js`
  (`_linkToIdToken`, `_logoutIfInvalidated`, table des erreurs) ;
  `node_modules/firebase-tools/lib/deploy/auth/*.js` et
  `lib/management/provisioning/provision.js`.
- Light : `firebase/public/backend.js` (`AUTH_MESSAGES`, `signup`,
  `ensureProfile`, `setPassword`), `firestore.rules`, `Accounts.kt`,
  `LoginScreen.kt`, `confidentialite.html` ; registre de Light (07/10 et
  08/10) ; AAR dans `~/.gradle/caches`.
- Firebase :
  [account-linking](https://firebase.google.com/docs/auth/web/account-linking),
  [google-signin](https://firebase.google.com/docs/auth/web/google-signin),
  [redirect-best-practices](https://firebase.google.com/docs/auth/web/redirect-best-practices),
  [custom-dependencies](https://firebase.google.com/docs/auth/web/custom-dependencies),
  [password-auth](https://firebase.google.com/docs/auth/web/password-auth) (chemin « Security › Authentication »),
  [manage-users](https://firebase.google.com/docs/auth/web/manage-users),
  [anonymous-auth](https://firebase.google.com/docs/auth/web/anonymous-auth),
  [limits](https://firebase.google.com/docs/auth/limits),
  [users](https://firebase.google.com/docs/auth/users),
  [manage-sessions](https://firebase.google.com/docs/auth/admin/manage-sessions),
  [Firestore quotas](https://firebase.google.com/docs/firestore/quotas),
  [pricing](https://firebase.google.com/pricing),
  [privacy](https://firebase.google.com/support/privacy),
  [notes de version JS](https://firebase.google.com/support/release-notes/js),
  [énumération](https://docs.cloud.google.com/identity-platform/docs/admin/email-enumeration-protection) (relue le 07/11),
  [Config v2](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config).
- Plugins : tarballs npm de `@capawesome/capacitor-google-sign-in` 0.1.4
  (`GoogleSignIn.java:107-116, 286-296`, README : marque vérifiée, un
  client par empreinte, « Account reauth failed ») et de
  `@capacitor-firebase/authentication` 8.6.0 ;
  [firebase-js-sdk.md](https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/firebase-js-sdk.md) ;
  [legacy-gsi-migration](https://developer.android.com/identity/sign-in/legacy-gsi-migration).
- Google Cloud : [10311615](https://support.google.com/cloud/answer/10311615)
  (e-mail d'assistance, logo), [13463073](https://support.google.com/cloud/answer/13463073)
  (marque).
- Play : [13327111](https://support.google.com/googleplay/android-developer/answer/13327111)
  (relue le 07/11),
  [10144311](https://support.google.com/googleplay/android-developer/answer/10144311).
- CNIL : [durée des comptes inactifs](https://cnil.fr/fr/achat-de-contenus-numeriques-quelle-duree-de-conservation-des-comptes-inactifs).
- Tailles des encodages : mesurées le 07/11 sur 40 réponses types
  (≈ 357, 200 et 98 caractères par réponse).

## 14. Relecture du 07/11 : constats écartés ou nuancés

Les trois relectures ont produit 44 constats. Sauf ce qui suit, ils sont
intégrés ci-dessus, souvent en un seul endroit quand plusieurs
relectures disaient la même chose (`sign_in_provider`, refus définitifs,
suppression concurrente, question D22 sur l'A37).

**Écartés ou nuancés** :
- *Lien e-mail refusé sous la protection contre l'énumération* (sécurité) :
  - le SDK 13.2 lie par `/v1/accounts:signUp` avec l'`idToken`, la voie que
    donne la même page, qui permet ce lien dès le SDK web 10.6.0 ;
  - la phrase citée vise l'ancienne méthode (`setAccountInfo`) ;
  - gardé comme essai réel (S15), pas comme risque bloquant.
- *App Check n'est pas une défense* (sécurité) :
  - nuancé : il protégerait Firestore, qui est justement le vecteur du
    remplissage du Gio ;
  - juste en revanche : il ne protège pas la création de comptes, et il
    n'est pas au J1b.
- *Effacer l'appareil sur `user-not-found` ou `user-token-expired`*
  (sécurité) : écarté. Un compte supprimé et un mot de passe changé
  donnent le même code (§ 2.5), d'où la session perdue.
- *Records en chaîne de 8 Ko* (sécurité) : les records d'aujourd'hui
  pèsent déjà ≈ 7 Ko pour 48 clés, sans marge pour les épreuves du J2.
  Borne portée à 32 Ko.
- *Ne pas avancer `marque` au-delà d'un lot incomplet* (données) :
  remplacé par le lot brut gardé (`a_relire`), sans relecture réseau.
- *`terramemo-synchro` à mettre dans `BASES_GARDEES`* (données) : ce
  n'est pas un défaut, car le driver ne supprime que `terramemo` et
  vérifie qu'aucune autre base ne disparaît. Ajouté pour la trace.
- *Un APK d'essai remplace celui de l'utilisateur avec son journal*
  (usage) : nuancé. Avec la même clé, c'est une mise à jour et le journal
  reste ; le risque est le code d'essai qui tourne sur le vrai journal.
- *Sans service worker, `charger()` échoue hors ligne* (données) : vrai
  pour le site seulement. Dans l'APK, les morceaux sont locaux (relecture
  usage).
- *Conseiller Google pour retrouver l'accès à une adresse Gmail*
  (sécurité) : écarté, car Google y remplace alors le mot de passe non
  vérifié (S5).
- *Ordre de la console qui tourne en rond* (usage) : la publication en
  production n'exige peut-être pas l'URL de la politique. Testing jusqu'au
  lot 8 est retenu de toute façon.
- *Débit plafonné dans les règles* (sécurité) : non retenu au J1b, car il
  doublerait les écritures (D34 b).

**Erreurs du premier jet corrigées** :
- « Plugin A en 0.1.4 » : le nom exact est désormais écrit ;
- remise à zéro des quotas « après 11 h » : 12 h l'hiver boréal ;
- « purge impossible sur Spark » : faux, le SDK Admin lancé depuis le PC
  la permet ;
- « 20 000 documents par jour » pour remplir le Gio : en réalité ≈ 1 000
  documents de 1 Mio ;
- « 14 tests » de règles : il y en a 15, dont un à adapter ;
- « Firebase ne se charge pas hors ligne » : faux dans l'APK ;
- refus « plus jamais relancé » : les lots refusés se relancent
  désormais ;
- `getDoc` refusé lu comme « absent » ;
- union marquée en ligne même quand le dépôt avait échoué.

**Ajouts de la vérification**, absents des trois relectures :
- capacité de stockage pour un usage normal (§ 5.7, D35) ;
- exemptions d'index (§ 6) ;
- piège de `lastSignInTime` pour la purge (§ 7.5) ;
- drapeau `sans-synchro` à retirer des appareils de l'utilisateur (§ 8) ;
- annulation du plugin qui masque une erreur de réglage (§ 3.3) ;
- « Comptes » du 06/11, qui ne fixe plus le moment de l'anonyme (D9) ;
- lettre de « Comptes » (« un document par séance ») à préciser (D32).
