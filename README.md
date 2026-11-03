# Cartographe

Un site et une appli Android pour devenir bon en géographie : placer chaque
pays sur la carte, connaître capitales et drapeaux, puis le relief, les
fleuves et les ordres de grandeur. Gratuit, sans publicité, en français
(prêt à traduire).

*En construction : aucune version n'est encore publiée.*

## Le concept

Cartographe n'est pas un quiz qu'on enchaîne, mais un entraînement par
**répétition espacée sur la carte** : chaque fait (« où est le Pérou ? »,
« quel est ce pays ? ») revient au moment où l'on est sur le point de
l'oublier, jusqu'à tenir des mois.

- L'accueil est une **carte du monde colorée selon la solidité de sa
  mémoire** : on voit ses lacunes là où elles sont.
- Chaque erreur se montre **sur la carte** : là où l'on a touché, là où
  était la réponse, et la distance entre les deux.
- Les mauvais choix proposés viennent de **ses propres confusions** (Niger
  et Nigeria, Slovénie et Slovaquie), et les nouveautés arrivent par petits
  groupes de voisins.
- Rien qui culpabilise : pas de série de jours qui retombe à zéro, des
  séances courtes qu'on arrête quand on veut.

## Approche technique

- Une seule base de code web (TypeScript, Vite) pour le site et l'appli
  Android, emballée en APK par Capacitor ; carte en SVG (d3-geo), hors
  ligne.
- Planification des révisions par FSRS (bibliothèque `ts-fsrs`).
- Progrès en journal de réponses sur l'appareil, synchronisé par Firebase
  (compte anonyme d'abord, connexion Google pour retrouver ses progrès
  ailleurs).
- Données libres préparées par un script reproductible : frontières de
  Natural Earth (domaine public), noms du référentiel Unicode CLDR,
  capitales et populations de Wikidata (CC0), drapeaux de flag-icons (MIT).

Le détail des études préparatoires est dans [`docs/etudes/`](docs/etudes/)
et le plan arrêté dans [`docs/plan.md`](docs/plan.md).
