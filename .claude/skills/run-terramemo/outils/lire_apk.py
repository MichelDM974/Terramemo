"""Lit le rapport de mesure de l'APK (WebView, adb forward déjà fait sur 8061)
et le résume par type de geste. Usage : lire_apk.py <sortie.json> [rendu à charger ensuite]"""
import importlib.util
from pathlib import Path
import json
import sys
import time
from collections import defaultdict

RACINE = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("driver", f"{RACINE}/.claude/skills/run-terramemo/driver.py")
d = importlib.util.module_from_spec(spec)
sys.argv, args = ["driver"], sys.argv[1:]
spec.loader.exec_module(d)


def page():
    code, _, c = d.http("http://localhost:8061/json/list")
    o = [t for t in json.loads(c) if t.get("type") == "page"][0]
    nav = d.Navigateur(d.WebSocket(o["webSocketDebuggerUrl"]))
    return lambda e: nav.commande("Runtime.evaluate", expression=e, returnByValue=True, awaitPromise=True)["result"].get("value")


ev = page()
r = json.loads(ev("JSON.stringify(window.terramemo.rapport())"))
json.dump(r, open(args[0], "w"))
print("rendu", r["rendu"], "écran au repos", r["ecran"]["periode_ms"], "ms")
agg = defaultdict(lambda: dict(n=0, dur=0, acoups=0, gels=0, sacc=0, per=[], maxi=0, tenue=[]))
for g in r["gestes"]:
    s = g["stats"]
    a = agg[g["type"]]
    a["n"] += 1; a["dur"] += s["duree_ms"]; a["acoups"] += s["acoups"]; a["gels"] += s["gels"]
    a["sacc"] += bool(s["saccade"]); a["per"].append(s["periode_geste_ms"]); a["maxi"] = max(a["maxi"], s["max_ms"] or 0)
    a["tenue"].append(s["tenue_120"])
for t, a in agg.items():
    per = sorted(a["per"])
    print(f"  {t:8} {a['n']:2} gestes {a['dur']/1000:5.1f} s  à-coups {a['acoups']} ({a['acoups']/(a['dur']/1000):.2f}/s)  "
          f"gels {a['gels']}  saccadent seuls {a['sacc']}  période médiane {per[len(per)//2]} ms  max {a['maxi']} ms  "
          f"tenue 120 médiane {sorted(a['tenue'])[len(a['tenue'])//2]}")
if len(args) > 1:
    ev(f"location.href = 'https://localhost/?rendu={args[1]}&mesures=1'")
    time.sleep(3)
    print("page rechargée en", args[1], ":", page()("location.href"))
