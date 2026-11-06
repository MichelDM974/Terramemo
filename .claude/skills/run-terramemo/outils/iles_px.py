"""Taches des îles pendant un geste, en canvas (critère de src/map/dessin.ts) :
par vue (pays au centre, zoom k), une capture pendant un geste (doigt posé,
glissé de 24 px, immobile : carte allégée) et une au repos (même vue, doigt
levé), puis les petites taches (composantes connexes de moins de 2 000 pixels
physiques qui ne sont pas la mer) de l'une et de l'autre :
- du geste absentes au repos (rien du repos à moins de 3 pixels physiques,
  ~1 px CSS) ;
- du repos absentes du geste ;
- du geste renforcées : présentes au repos, mais avec plus de deux fois son
  encre (somme des écarts à la mer) sur ses pixels (+ 60), comme les carrés
  cerclés d'avant le 06/11, là où le repos ne montre qu'un trait d'un pixel
  physique.
La mer est la couleur bleutée la plus fréquente (celle de l'ovale) : la plus
fréquente tout court est au zoom 1 le fond de page autour de l'ovale, et
l'ovale entier n'y faisait qu'une tache (la relecture du 04/11 ne voyait
rien au zoom 1).

  python3 .claude/skills/run-terramemo/outils/iles_px.py [--url http://localhost:8060/] [--ks 1,1.5,2,3,4,8] [--ids DOM,GRC,…] [--dossier D] [-v]

Demande numpy, scipy et Pillow (hors du driver, Python stdlib seule) ; un
serveur (`driver.py serve --preview`) ; ~10 s par vue (analyse comprise).
"""
import argparse
import importlib.util
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

RACINE = pathlib.Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("driver", f"{RACINE}/.claude/skills/run-terramemo/driver.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

IDS = "DOM,GRC,IDN,MDV,PYF,CAN/GRL,PHL,JPN,CHL,FJI,KIR,SYC,CPV,BHS,TON,NOR"
GRANDE = 2000  # pixels physiques : au-delà, une terre et non une île


def placer(page, ix, iy, k):
    """Zoom k, le point de ix au centre en x (rotation en canvas), celui de iy en y."""
    page.js(f"""(() => {{ const c = window.terramemo.carte; c.zoomer({{k: 1, x: 0, y: 0}});
        const r = c.rect(), x = c.ecran("{ix}").x - r.x;
        c.zoomer({{k: 1, x: r.largeur / 2 - x, y: 0}});
        const y = c.ecran("{iy}").y - r.y, x2 = c.ecran("{ix}").x - r.x;
        c.zoomer({{k: {k}, x: r.largeur / 2 - {k} * x2, y: r.hauteur / 2 - {k} * y}}); }})()""")


def capturer(page, dossier, base, cx, cy, glisse):
    page.cdp("Input.dispatchTouchEvent", type="touchStart", touchPoints=[d._doigt(cx, cy)])
    for i in range(1, glisse // 2 + 1):
        page.cdp("Input.dispatchTouchEvent", type="touchMove", touchPoints=[d._doigt(cx + 2 * i, cy)])
        page.pause(17)
    page.pause(250)
    dessin = page.js("document.querySelector('#carte').dataset.dessin")
    page.capture(dossier / f"{base}-geste.png")
    page.cdp("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
    page.pause(500)
    page.capture(dossier / f"{base}-repos.png")
    return dessin


def analyser(geste, repos, zone, verbeux=False, nom=""):
    """(absentes au repos, renforcées, absentes du geste) pour une paire de captures."""
    ag = np.asarray(Image.open(geste).convert("RGB")).astype(int)
    ar = np.asarray(Image.open(repos).convert("RGB")).astype(int)
    cols, cnt = np.unique(ar.reshape(-1, 3), axis=0, return_counts=True)
    bleues = [i for i in np.argsort(-cnt) if cols[i][2] - cols[i][0] > 12]
    mer = cols[bleues[0]]
    er, eg = np.abs(ar - mer).sum(2), np.abs(ag - mer).sum(2)
    mr, mg = (er > 24) & zone, (eg > 24) & zone
    dil_r, dil_g = ndimage.binary_dilation(mr, iterations=3), ndimage.binary_dilation(mg, iterations=3)
    absentes = renforcees = manques = 0
    lab, _ = ndimage.label(mg)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        comp = lab[sl] == i + 1
        if comp.sum() > GRANDE:
            continue
        if not dil_r[sl][comp].any():
            absentes += 1
            if verbeux:
                print(f"    {nom} : tache du geste absente au repos à ({sl[1].start}, {sl[0].start}) px physiques, {int(comp.sum())} px")
            continue
        sl2 = tuple(slice(max(0, s.start - 1), s.stop + 1) for s in sl)
        c2 = ndimage.binary_dilation(lab[sl2] == i + 1, iterations=1)
        if eg[sl2][c2].sum() > 2 * er[sl2][c2].sum() + 60:
            renforcees += 1
    labr, _ = ndimage.label(mr)
    for i, sl in enumerate(ndimage.find_objects(labr)):
        comp = labr[sl] == i + 1
        if comp.sum() <= GRANDE and not dil_g[sl][comp].any():
            manques += 1
            if verbeux:
                print(f"    {nom} : tache du repos absente du geste à ({sl[1].start}, {sl[0].start}) px physiques, {int(comp.sum())} px")
    return absentes, renforcees, manques


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=d.URL_DEFAUT)
    ap.add_argument("--ks", default="1,1.5,2,3,4,8")
    ap.add_argument("--ids", default=IDS)
    ap.add_argument("--glisse", type=int, default=24)
    ap.add_argument("--dossier", default="/tmp/terramemo-iles")
    ap.add_argument("-v", action="store_true", help="chaque tache absente, avec sa place")
    args = ap.parse_args()
    dossier = pathlib.Path(args.dossier)
    dossier.mkdir(parents=True, exist_ok=True)
    ks = [float(x) for x in args.ks.split(",")]
    totaux = {k: [0, 0, 0, 0] for k in ks}
    with d.Session("local") as s:
        page = s.page
        page.emuler(d.TELEPHONE, tactile=True)
        page.goto(args.url.rstrip("/") + "/?rendu=canvas&mesures=0#carte")
        page.attendre_carte()
        page.pause(2000)
        r = page.js("window.terramemo.carte.rect()")
        cx, cy = r["x"] + r["largeur"] / 2, r["y"] + r["hauteur"] / 2
        dpr = d.TELEPHONE["dpr"]
        for spec_ in args.ids.split(","):
            ix, iy = (spec_.split("/") + [spec_])[:2]
            for k in ks:
                placer(page, ix, iy, k)
                page.pause(300)
                base = f"{ix}-k{k:g}"
                dessin = capturer(page, dossier, base, cx, cy, args.glisse)
                g = Image.open(dossier / f"{base}-geste.png")
                # La carte seule, sans 4 pixels physiques de ses bords (en-tête, barre, bords de l'écran).
                zone = np.zeros((g.height, g.width), dtype=bool)
                zone[int(r["y"] * dpr) + 4:int((r["y"] + r["hauteur"]) * dpr) - 4, 4:-4] = True
                a, ren, m = analyser(dossier / f"{base}-geste.png", dossier / f"{base}-repos.png", zone, args.v, base)
                t = totaux[k]
                t[0] += 1; t[1] += a; t[2] += ren; t[3] += m
                print(f"  {base:10} geste {dessin} : {a} absente(s) au repos, {ren} renforcée(s), {m} du repos absente(s) du geste", flush=True)
        if page.erreurs:
            print("ERREURS JS :", page.erreurs)
    print()
    for k, (n, a, ren, m) in totaux.items():
        print(f"zoom {k:g} : {n} vues ; taches du geste absentes au repos {a}, renforcées {ren} ; taches du repos absentes du geste {m}")


if __name__ == "__main__":
    main()
