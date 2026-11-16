# Relevés de mesure

Rapports bruts de `.claude/skills/run-terramemo/driver.py mesurer` : des
gestes (pincer, glisser, tourner) et des touchers rejoués sur la carte du
monde, avec les temps de script, les à-coups et les gels, pour chaque rendu
de la carte (`canvas` : Canvas 2D ; `webgl` ; `g` et `css` : deux variantes
SVG) et chaque cible (Chromium sur le PC, Chrome ou WebView de l'appli sur
un téléphone Android). Chaque JSON garde aussi le navigateur, ses options et
le commit mesuré. Ils servent de preuve aux choix de rendu des études
(`docs/etudes/`) ; le nom d'un fichier dit sa date, sa cible, son rendu et sa
projection.

| Dossier | Ce qui a été mesuré |
|---|---|
| `j0/` | 04-06/11/2026 : les quatre rendus, sur le PC (GPU, rendu logiciel, processeur ralenti ×4) puis dans Chrome et la WebView du téléphone, au doigt et par toucher simulé, à 60 et 120 Hz. |
| `j1a/` | 06/11/2026 : touchers réels rejoués dans Chrome et dans la WebView (Canvas 2D). |
| `plein-soleil/` | 11/11/2026 : la palette lisible en plein soleil, Canvas 2D et WebGL dans Chrome. |
| `j2/` | 12/11/2026 : le calque des océans et mers (avec, sans, démonstration, projection Pacifique) ; notes `mers-trace.md` et `mers-pilote.md`. |
| `lignes/` | 14/11/2026 : le coût des lignes de repère (équateur, tropiques…), voir son `README.md`. |
