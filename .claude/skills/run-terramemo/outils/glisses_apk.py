"""Glissés par l'écran tactile (adb shell input swipe) dans l'APK, puis rapport
de la page : l'écran monte-t-il à 120 Hz quand l'entrée passe par le vrai
chemin du toucher (pas DevTools) ? Usage : glisses_apk.py <rendu> <sortie.json>"""
import importlib.util
from pathlib import Path
import json
import subprocess
import sys
import time

RACINE = Path(__file__).resolve().parents[4]
ADB = str(Path.home() / "Android/Sdk/platform-tools/adb")
spec = importlib.util.spec_from_file_location("driver", f"{RACINE}/.claude/skills/run-terramemo/driver.py")
d = importlib.util.module_from_spec(spec)
sys.argv, args = ["driver"], sys.argv[1:]
spec.loader.exec_module(d)
rendu, sortie = args


def page():
    code, _, c = d.http("http://localhost:8061/json/list")
    o = [t for t in json.loads(c) if t.get("type") == "page"][0]
    nav = d.Navigateur(d.WebSocket(o["webSocketDebuggerUrl"]))
    return lambda e: nav.commande("Runtime.evaluate", expression=e, returnByValue=True, awaitPromise=True)["result"].get("value")


ev = page()
ev(f"location.href = 'https://localhost/?rendu={rendu}&mesures=1'")
time.sleep(4)
ev = page()
print("page :", ev("location.href"), "rendu :", ev("window.terramemo.rapport().rendu"))
ev("window.terramemo.pret")
time.sleep(2)
ev("window.terramemo.reinitialiser()")

# Carte : y entre ~400 et ~1700 px physiques (écran 1080×2340).
def glisser(x1, y1, x2, y2, ms):
    subprocess.run([ADB, "shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(ms)], check=True)
    time.sleep(0.6)

for _ in range(5):          # tour du monde, rapide, même sens
    glisser(950, 1100, 150, 1100, 250)
for _ in range(3):          # lents
    glisser(200, 1000, 900, 1050, 1200)
for _ in range(4):          # dans tous les sens
    glisser(540, 800, 540, 1400, 400)
    glisser(300, 1300, 800, 900, 400)

r = json.loads(ev("JSON.stringify(window.terramemo.rapport())"))
json.dump(r, open(sortie, "w"))
print("écran au repos :", r["ecran"]["periode_ms"], "ms")
for g in r["gestes"]:
    s = g["stats"]
    print(f"  {g['type']:8} {s['duree_ms']:5} ms  période {s['periode_geste_ms']} ms  "
          f"médiane {s['mediane_ms']}  max {s['max_ms']}  à-coups {s['acoups']}  gels {s['gels']}  "
          f"tenue 120 {s['tenue_120']}  dessin {g.get('dessin_ms') and g['dessin_ms'].get('p95_ms')}")
