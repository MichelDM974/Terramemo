# Mers : la carte au pilote, avec et sans les mers (12/11/2026, lot 3a, #27)

Étape 2 des mesures de l'étude J2 (§ 4.6), après l'étape 1 sans navigateur
(`2026-11-12-mers-trace.md`). L'étape 3 (A37, de jour, Chrome puis APK)
vient après la semaine d'usage du J1a (13/11).

- **Comment** : `driver.py mesurer --cible local` (3 répétitions, 14 gestes,
  111 touchers), une mesure à la fois, sur le build de j2-socle (010d226,
  `serve --preview`). Trois cas :
  - **sans** les mers ;
  - **demo** (`?mers=demo`) : le calque marin teinté, tracé par la couche de
    base (la carte de la mémoire des mers) ;
  - **pacif** (`?mer=pacif`) : le Pacifique allumé, sans teinte. Il est peint
    sur la couche du dessus, puis effacé sous les terres de son emprise à
    chaque image (≈ 80 % des terres de la base, étape 1) : le pire cas d'une
    mer allumée.

  Rendus : canvas en rastérisation logicielle (chrome-headless-shell, ×1 et
  ralenti ×4), canvas et webgl `--gpu` (GTX 970). Rapports JSON dans
  `pilote-mers/` (`<cas>-local-<rendu>-monde[-x4|-gpu].json`).
- **Machine** : PC (Ryzen 5 3600), headless à 60 Hz, aucun agent ni test en
  même temps.

| Rendu | Cas | Saccades : pincer / glisser / tourner | Script au p95, tourner | Fin d'un tour du monde, médiane (max) | Toucher, médiane |
|---|---|---|---|---|---|
| canvas logiciel ×1 | sans | OK / OK / OK | 2,4 ms | 72 (88) ms | 24 ms |
| canvas logiciel ×1 | demo | OK / OK / OK | 2,8 ms | 80 (104) ms | 24 ms |
| canvas logiciel ×1 | pacif | **NON** (2 gestes, images de 33 ms) / OK / OK (0,86 à-coup/s) | 3,5 ms | **112 (136) ms** | 24 ms |
| canvas logiciel ×4 | sans | NON / NON / NON (17 à 22 à-coups/s) | 6,6 ms | 248 (328) ms | 24 ms |
| canvas logiciel ×4 | demo | NON / NON / NON | 7,4 ms | 264 (336) ms | 32 ms |
| canvas logiciel ×4 | pacif | NON / NON / NON | 9,8 ms | 424 (584) ms | 32 ms |
| canvas GPU | sans | NON (1 gel de 50 ms) / OK / OK | 2,4 ms | 32 (32) ms | 16 ms |
| canvas GPU | demo | NON (1 gel de 50 ms) / OK / OK | 2,8 ms | 32 (32) ms | 16 ms |
| canvas GPU | pacif | NON (1 gel de 67 ms, 2 à-coups) / OK / OK | 3,8 ms | 32 (40) ms | 16 ms |
| webgl GPU | sans, demo, pacif | OK / OK / OK | 0,3 ms | 32 (32) ms | 16 ms |

Rendu < 1 s partout (première visite de 196 à 741 ms), pays touchés justes
111/111 partout.

**Lecture** :
- **WebGL** : les mers ne coûtent rien de mesurable (maillage marin dessiné
  avant les terres, sans effacement).
- **Canvas au GPU**, la rastérisation du téléphone : le Pacifique allumé
  ajoute ≈ 1,4 ms de script au p95 d'un tour du monde (2,4 → 3,8 ms), et
  aucune saccade au glissé ni au tour. Au pincement, le gel unique est déjà
  là sans les mers (50 ms ; 67 ms avec le Pacifique). La fin de geste ne
  change pas (32 ms). La carte teintée (demo) ne change rien.
- **Canvas logiciel** : l'effacement coûte cher à rastériser. La fin d'un
  tour du monde passe de 72 à 112 ms à ×1, de 248 à 424 ms à ×4, avec des
  à-coups au pincement. Le script, lui, reste bas : c'est la rastérisation
  au processeur du PC sans GPU, qui ne dit rien du téléphone (skill
  run-terramemo, « Pièges »). La carte teintée y coûte peu (fin de geste
  72 → 80 ms à ×1, un maximum de 104 ms au seuil).

**Coût de l'effacement d'une mer allumée** (note de #27 du 12/11) : rien
n'est changé avant l'A37.
- **Pas d'effacement compté dans la bascule vers l'allégée** : son script ne
  coûte que ≈ 1,4 ms, et la rastérisation d'un remplissage tient à sa
  surface plus qu'à ses sommets.
- **Pas d'effacement gardé d'une image à l'autre** : il ne servirait qu'au
  repos, où le toucher reste de 16 à 32 ms.
- **Verdict à l'étape 3, sur l'A37** (canvas, Chrome et APK, une mer allumée,
  gestes et `touchers_reels.py`).
- **Si l'A37 saccade avec une mer allumée** : pendant un geste, peindre la mer
  allumée sur la carte de base, sous les terres, comme le calque marin. La
  base est redessinée à chaque image d'un geste : ni effacement, ni terres
  retracées. Elle ne revient sur la couche du dessus qu'au repos, où un
  toucher ne redessine qu'elle. Piste préférée aux deux de la note.
