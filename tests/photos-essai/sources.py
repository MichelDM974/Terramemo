#!/usr/bin/env python3
"""Images d'essai des photos (#34, lot P2) : pour chaque fichier gardé de
tests/photos-essai/choix.json, une image fabriquée (un dégradé, une grille et le
mot « ESSAI » avec le sujet), aux proportions du fichier de Commons (clé
dimensions), réduite à 1 920 px de large comme la miniature que traiter.py
télécharge. Aucun réseau : le pilote et tests/photos-traiter.test.ts passent ces
images à traiter.py --sources. Une marque au centre et une au tiers haut font voir
le recadrage au point d'intérêt.

Usage : python3 tests/photos-essai/sources.py <choix.json> <dossier de sortie>
"""

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def image(fichier: str, sujet: str, w: int, h: int) -> Image.Image:
    if w > 1920:
        w, h = 1920, round(h * 1920 / w)
    teinte = hashlib.sha256(fichier.encode()).digest()
    a = (teinte[0], teinte[1], teinte[2])
    b = (255 - teinte[0], 255 - teinte[1] // 2, teinte[3])
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        ligne = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))
        for x in range(w):
            px[x, y] = ligne
    d = ImageDraw.Draw(im)
    pas = max(w, h) // 12
    for x in range(0, w, pas):
        d.line([(x, 0), (x, h)], fill=(255, 255, 255), width=2)
    for y in range(0, h, pas):
        d.line([(0, y), (w, y)], fill=(255, 255, 255), width=2)
    r = min(w, h) // 10
    d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], outline=(255, 255, 0), width=8)
    d.rectangle([w / 2 - r, h * 0.3 - r / 2, w / 2 + r, h * 0.3 + r / 2], outline=(255, 0, 255), width=8)
    taille = max(24, w // 18)
    try:
        police = ImageFont.truetype("DejaVuSans.ttf", taille)  # les accents ; la police par défaut ne les a pas
    except OSError:
        try:
            police = ImageFont.load_default(size=taille)
        except TypeError:  # Pillow ancien
            police = ImageFont.load_default()
    d.text((w * 0.06, h * 0.08), f"ESSAI · {sujet}", fill=(255, 255, 255), font=police, stroke_width=3, stroke_fill=(0, 0, 0))
    return im


def main(choix_json: str, sortie: str) -> None:
    c = json.loads(Path(choix_json).read_text("utf-8"))
    dossier = Path(sortie)
    dossier.mkdir(parents=True, exist_ok=True)
    faits = set()
    for e in c["lieux"].values():
        for g in e.get("gardees") or []:
            if g["fichier"] in faits:
                continue
            faits.add(g["fichier"])
            w, h = c["dimensions"][g["fichier"]]
            image(g["fichier"], g["sujet"], w, h).save(dossier / g["fichier"], "JPEG", quality=85)
    print(f"{len(faits)} image(s) d'essai dans {dossier}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
