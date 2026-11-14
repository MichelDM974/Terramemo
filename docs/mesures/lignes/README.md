# Lignes de repère et fluidité (#11, 14/11/2026)

`driver.py mesurer --cible local --gpu` (vrai GPU du PC, sans ralenti), même
build (branche `lignes-repere`), sans lignes puis avec `?lignes=tout` (21
lignes, leurs noms à l'arrêt) :

| Rendu | Lignes | À-coups / gels | Script p95 (pincer, glisser, tourner) | Fin de geste (médiane) |
|---|---|---|---|---|
| canvas | sans | 0 / 0 | 1,3 · 1,3 · 2,6 ms | 32 ms |
| canvas | toutes | 0 / 0 | 1,4 · 1,5 · 2,8 ms | 32 ms |
| webgl | sans | 0 / 0 | 0,4 · 0,4 · 0,4 ms | 32 ms |
| webgl | toutes | 0 / 0 | 0,4 · 0,4 · 0,4 ms | 32 ms |

Aucune perte mesurable. À `--ralenti 4` sans GPU (rastérisation logicielle,
qui ne dit rien du téléphone, skill « Pièges »), le canvas donne aussi un
script à peine plus long (p95 3,8 → 5,1 ms au pincement) et des fins de geste
plus longues d'environ 20 % (noms reposés à l'arrêt). À refaire sur l'A37
(`--cible chrome`) à sa prochaine séance de mesures.
