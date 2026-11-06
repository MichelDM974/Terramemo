"""Touchers par le vrai chemin d'Android (adb shell input tap : InputManager,
comme un doigt, sans DevTools) sur les pays des touchers du pilote (vue Carte,
zoom 1), puis Event Timing lu dans la page (window.terramemo.rapport()) : le
critère du toucher du J0 (décision « Critère du toucher », 06/11 : médiane
< 100 ms par ce chemin, dans l'APK et dans Chrome).

Un toucher du pilote (Input.dispatchTouchEvent) est horodaté quand DevTools le
reçoit, puis le fil principal du navigateur attend une réponse mojo ~17 à
20 ms avant de le transmettre (RenderWidgetHostInputEventRouter::
ForwardEmulatedTouchEvent, trace du 06/11) : le pilote surestime d'autant
l'attente d'un toucher, qu'un doigt n'a pas.

  python3 .claude/skills/run-terramemo/outils/touchers_reels.py <chrome|webview> <sortie.json> [--url http://localhost:8060/] [--rendu canvas] [--tours 3]

chrome : la page du PC par adb reverse (serve --preview) ; webview : l'APK
installé (apk --installer). Téléphone déverrouillé, écran allumé (svc power
stayon usb), sans y toucher ; un toucher d'étalonnage au centre de l'écran
donne la place du contenu (barre d'adresse de Chrome).
"""
import argparse
import importlib.util
import json
import pathlib
import statistics as st
import subprocess

RACINE = pathlib.Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("driver", f"{RACINE}/.claude/skills/run-terramemo/driver.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

PAYS = [p for nom, _, _, pays in d.TOUCHERS if nom == "monde" for p in pays]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cible", choices=("chrome", "webview"))
    ap.add_argument("sortie")
    ap.add_argument("--url", default=d.URL_DEFAUT)
    ap.add_argument("--rendu", default="canvas", choices=("canvas", "webgl", "g", "css"))
    ap.add_argument("--tours", type=int, default=3)
    ap.add_argument("--serie")
    args = ap.parse_args()
    adb = [str(d.ADB), *(["-s", args.serie] if args.serie else [])]

    def tap(x, y):
        subprocess.run([*adb, "shell", "input", "tap", str(int(round(x))), str(int(round(y)))], check=True, capture_output=True)

    with d.Session(args.cible, serie=args.serie) as s:
        p = s.page
        base = args.url.rstrip("/") + "/" if args.cible == "chrome" else "https://localhost/"
        s.reverse(base)
        p.goto(f"{base}?rendu={args.rendu}&mesures=0#carte")
        p.attendre_carte(120)
        p.pause(1500)
        p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
        p.pause(800)
        p.js("window.__dernier = null; addEventListener('pointerdown', (e) => { window.__dernier = [e.clientX, e.clientY]; }, {capture: true})")
        W, H = map(int, subprocess.run([*adb, "shell", "wm", "size"], capture_output=True, text=True).stdout.split()[-1].split("x"))
        dpr = p.js("devicePixelRatio")
        tap(W / 2, H / 2)
        p.pause(800)
        cx, cy = p.js("window.__dernier")
        ox, oy = W / 2 - cx * dpr, H / 2 - cy * dpr
        d.dire(f"écran {W}×{H}, dpr {dpr}, contenu à ({ox:.1f}, {oy:.1f}) px physiques")
        p.js("window.terramemo.reinitialiser()")
        vises = []
        for _ in range(args.tours):
            for ident in PAYS:
                pt = d.position(p, ident)
                if not pt:
                    continue
                tap(ox + pt["x"] * dpr, oy + pt["y"] * dpr)
                vises.append(ident)
                p.pause(700)
        p.pause(1000)
        r = p.js("window.terramemo.rapport()")
        pathlib.Path(args.sortie).write_text(json.dumps({"outil": "touchers_reels.py", "chemin": "adb shell input tap", "cible": args.cible,
                                                          "rendu": args.rendu, "navigateur": s.navigateur, "code": d.code_mesure(args.cible, args.serie),
                                                          "vises": vises, "rapport": r}, indent=1, ensure_ascii=False))
    T = r["touchers"]
    E = [t for t in T if t.get("event_timing")]
    justes = sum(1 for v, t in zip(vises, T) if (t.get("pick") or {}).get("id") == v)
    d.dire(f"{len(T)} touchers reçus sur {len(vises)}, {justes} justes, {len(E)} avec Event Timing")
    if not E:
        return 1
    m = lambda k: round(st.median([t["event_timing"][k] for t in E]), 1)
    D = sorted(t["event_timing"]["duree_ms"] for t in E)
    q = lambda f: D[min(len(D) - 1, int(len(D) * f))]
    ok = m("duree_ms") < d.CRITERE_TOUCHER_MS
    d.dire(f"[{'OK ' if ok else 'NON'}] toucher < {d.CRITERE_TOUCHER_MS} ms en médiane (vrai chemin) : médiane {m('duree_ms')} ms "
           f"(p90 {q(0.9)}, max {D[-1]}, {sum(x >= d.CRITERE_TOUCHER_MS for x in D)}/{len(D)} au-dessus) = attente {m('attente_ms')} "
           f"+ traitement {m('traitement_ms')} + présentation {m('presentation_ms')}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
