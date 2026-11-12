# Mers : tracé du Canvas sans navigateur (12/11/2026, lot 3a, #27)

Étape 1 des mesures de l'étude J2 (§ 4.6) : ce que le calque marin ajoute au
tracé du rendu Canvas, sans navigateur. Les étapes 2 (pilote, `?mers=demo`,
canvas, ralenti 4×, webgl) et 3 (A37) restent à faire.

- **Comment** : `tests/mesure-mers.test.ts` (`npx vitest run
  tests/mesure-mers.test.ts --silent=false`). Le tracé de `dessinerCarte`
  (`parcourir` puis `tracerPartie`) dans un contexte qui ne fait que compter
  ses `moveTo` et `lineTo` ; même bascule vers la carte allégée que la carte
  (`sommetsVisibles` compte les mers quand la base les trace). Carte de
  384 × 723 px CSS (le téléphone de mesure), 16 rotations, zooms 1, 2 et 8
  (zoomé : centré sur 30° N), au repos et en mouvement. Le calque marin n'est
  tracé qu'avec une teinte de mer (carte de la mémoire des mers, `?mers=demo`) :
  c'est ce cas, contre la même carte sans mers.
- **Machine** : PC (Ryzen 5 3600), Node 24.19, charge ≈ 1. Deux passages, les
  sommets identiques, les temps à 0,15 ms près ; ci-dessous le second.
- **Calque** : 15 049 sommets au repos (10 km), 7 881 en mouvement (50 km),
  coutures de l'antiméridien densifiées à 1° comprises ; terres : 127 972
  (complète), 35 737 (allégée).

| Zoom | État | Allégée sur 16 vues (sans / avec mers) | Mers : parcourus | Mers : émis | Terres : émis | JS sans mers | JS avec mers |
|---|---|---|---|---|---|---|---|
| 1 | repos | 0 / 0 | 20 654 | 13 841 | 31 393 | 1,85 ms | 2,12 ms |
| 1 | mouvement | 16 / 16 | 11 011 | 6 356 | 10 578 | 0,70 ms | 0,84 ms |
| 2 | repos | 0 / 0 | 20 087 | 9 940 | 32 339 | 1,80 ms | 2,05 ms |
| 2 | mouvement | 16 / 16 | 10 728 | 5 041 | 11 380 | 0,93 ms | 1,03 ms |
| 8 | repos | 0 / 0 | 8 235 | 1 643 | 11 384 | 0,52 ms | 0,60 ms |
| 8 | mouvement | 9 / 13 | 5 183 | 862 | 3 856 | 0,51 ms | 0,53 ms |

Sommets : moyennes des 16 rotations (parcourus : copies du bord comptées deux
fois). Temps : médiane des 16 rotations, chacune la moyenne de 5 tracés.

**Lecture** :
- en mouvement au zoom 1, le calque marin émet 6 356 sommets pour 10 578 aux
  terres : **+60 %** de sommets, comme l'étude l'estimait (§ 4.6 : ≈ 7 600 à
  50 km pour ≈ 13 000) ; le temps JS du tracé ne prend que **+20 %**
  (0,70 → 0,84 ms), loin de la période d'une image (8,3 ms à 120 Hz) ;
- au repos, +15 % (1,85 → 2,12 ms) ;
- zoomé (8), les mers font basculer vers l'allégée 4 vues de plus sur 16
  (9 → 13) : la bascule compte bien le calque marin ;
- ce que ce test **ne mesure pas** : la rastérisation des remplissages
  (de grandes surfaces de mer, un `Path2D` par seau) et, à la couche du
  dessus, celle de l'effacement `destination-out` d'une mer marquée. C'est là
  que le Canvas peut saccader (rastérisation logicielle du PC ralenti 4×) :
  les étapes 2 et 3 le tranchent. Le tracé JS de cet effacement, lui, est
  mesuré ci-dessous.

## Une mer marquée (couche du dessus)

Ajouté après relecture : une mer marquée (allumée, juste, fausse) est tracée
à chaque image sur la couche du dessus, puis effacée sous les terres de son
emprise, que `dessinerMarquesMers` retrace en entier (remplies et bordées).
Même test (second `describe`), mêmes vues, sans teinte de mer (la bascule des
terres seules, celle d'une partie de mers après une réponse, lot 3b).

| Mer | Zoom | État | Marque : émis | Effacement : émis | Terres de la base : émis | Effacement / terres | JS marque et effacement |
|---|---|---|---|---|---|---|---|
| Pacifique | 1 | repos | 2 358 | 25 991 | 31 393 | 83 % | 1,73 ms |
| Pacifique | 1 | mouvement | 1 158 | 8 511 | 10 578 | 80 % | 0,63 ms |
| Pacifique | 2 | mouvement | 772 | 8 620 | 11 380 | 76 % | 0,80 ms |
| Pacifique | 8 | mouvement | 249 | 1 984 | 3 856 | 51 % | 0,42 ms |
| Atlantique | 1 | repos | 1 486 | 11 348 | 31 393 | 36 % | 0,90 ms |
| Atlantique | 1 | mouvement | 770 | 3 717 | 10 578 | 35 % | 0,42 ms |
| Méditerranée | 1 | repos | 247 | 3 467 | 31 393 | 11 % | 0,41 ms |
| Méditerranée | 1 | mouvement | 131 | 1 177 | 10 578 | 11 % | 0,29 ms |

(Le reste des lignes : sortie du test. Zoomé, la mer n'est à l'écran qu'à
une partie des 16 rotations : moyennes zéros compris, médiane des temps
parfois nulle.)

**Lecture** : l'effacement d'un océan qui fait le tour du monde (Pacifique,
emprise de -180 à 180) retrace **≈ 80 %** des terres de la base à chaque
image, au repos comme en mouvement ; l'Atlantique ≈ 35 %, la Méditerranée
≈ 10 %. Le temps JS reste sous la milliseconde en mouvement (0,63 ms pour le
Pacifique, contre 0,70 ms pour toutes les terres de la base), mais la bascule
vers l'allégée (`sommetsVisibles`, `BUDGET_SOMMETS`) ne compte pas ces
sommets : zoomé, une vue dont la complète passe tout juste dans le budget
peut presque doubler son tracé par image sans basculer. Compter l'effacement
dans la bascule, ou le garder d'une image à l'autre tant que la vue ne
change pas, reste à décider d'après les étapes 2 et 3 (la rastérisation du
`destination-out`, que Node ne voit pas).
