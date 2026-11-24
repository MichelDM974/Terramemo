#!/usr/bin/env python3
"""Traitement des photos des fiches (#34, lot P2 ; étude
docs/etudes/2026-11-16-fiche-lieu-conception.md, § 3.3 et § 3.8).

npm run photos:traiter : pour chaque photo gardée d'un lieu relu de
geodata/photos/choix.json (npm run photos:relecture), la miniature de Commons
(1 920 px de large, jamais l'original de plusieurs Mo ; plus large seulement
pour un panorama, dont le recadrage 3:2 doit garder 720 px de haut), puis :
  - l'orientation (exif_transpose), le passage en sRGB ;
  - le recadrage 3:2 au point d'intérêt choisi dans l'outil (le calcul de
    cadrage(), geodata/photos/relecture-logique.mjs, pour que l'aperçu dise
    vrai), au centre sans lui ;
  - deux WebP, qualité 60, method=6 (LANCZOS) : la vignette 480 × 320 et le
    plein écran 1 080 × 720, chacun nommé par les 10 premiers caractères
    hexadécimaux de son SHA-256, sous public/photos/v/ et public/photos/p/ ;
  - une copie dans ~/Sauvegardes/terramemo/photos/ (les WebP sont hors de git,
    D59 : la copie du PC est celle que npm run photos:restaurer reprend) ;
  - sa ligne dans geodata/photos/licences.json : auteur, licence, titre, page,
    point, date, empreintes et poids des deux WebP ; en tête, les versions de
    Pillow et de libwebp.
Un encodeur WebP ne rend pas les mêmes octets d'une version à l'autre : les WebP
sont gardés, jamais refaits par le build. Une photo déjà dans licences.json, avec
le même point et ses deux fichiers justes, n'est pas refaite (--refaire pour la
forcer). Une photo qui n'est plus gardée sort de licences.json ; ses fichiers
restent, signalés comme orphelins (--elaguer les retire de --vers).

Réseau : une requête à la fois, une seconde de pause, le User-Agent générique
du projet (geodata/photos/reseau.mjs) ; une erreur passagère (429, 5xx) est
retentée deux fois, après la pause que dit Retry-After (au moins 5 s).

Options :
  --donnees <dossier>  où lire choix.json et écrire licences.json
                       (TERRAMEMO_PHOTOS_DONNEES, sinon geodata/photos/)
  --vers <dossier>     le dossier photos/ du site (public/photos/ par défaut)
  --sauvegarde <dossier> | --sans-sauvegarde
  --sources <dossier>  lit les images à traiter dans ce dossier (par leur nom de
                       fichier Commons) au lieu de Commons : essais, sans réseau
  --max <n>            n photos nouvelles au plus (essai : les 50 premières, S50)
  --refaire            refait les photos déjà traitées
  --elaguer            retire de --vers les WebP cités par aucune photo
Python 3 et Pillow (12.1.1 sur le PC, WebP compris) ; rien d'autre.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from PIL import Image, ImageOps, features
except ImportError:  # pragma: no cover - dit à l'utilisateur ce qui manque
    sys.exit("traiter.py : Pillow manque (python3 -m pip install Pillow, ou le paquet python3-pil).")

DOSSIER = Path(__file__).resolve().parent
RACINE = DOSSIER.parent.parent
UA = "Terramemo-geodata/1.0 (+https://terramemo-geo.web.app)"
API_COMMONS = "https://commons.wikimedia.org/w/api.php"
SAUVEGARDE = Path.home() / "Sauvegardes" / "terramemo" / "photos"
PAUSE_S = 1.0
LARGEUR_MINIATURE = 1920
TAILLES = {"v": (480, 320), "p": (1080, 720)}
QUALITE = 60
METHODE = 6
LONGUEUR_NOM = 10
PAR_LOT = 50
RATIO = 1.5


def cadrage(w: float, h: float, point: list[float] | None) -> tuple[float, float, float, float]:
    """Le cadre 3:2 (x, y, largeur, hauteur) centré sur le point (fractions), borné à l'image.

    Exactement cadrage() de relecture-logique.mjs (tests/photos-traiter.test.ts les compare)."""
    fx, fy = point if point else (0.5, 0.5)
    large = w / h > RATIO
    cw = h * RATIO if large else w
    ch = h if large else w / RATIO
    ox = min(max(fx * w - cw / 2, 0), w - cw)
    oy = min(max(fy * h - ch / 2, 0), h - ch)
    return ox, oy, cw, ch


def largeur_voulue(w: int, h: int) -> int:
    """La largeur de miniature à demander : 1 920 px, plus pour un panorama (720 px de haut après recadrage)."""
    besoin = LARGEUR_MINIATURE
    if w / h > RATIO:
        besoin = max(besoin, math.ceil(TAILLES["p"][1] * w / h))
    return min(w, besoin)


def en_srgb(im: Image.Image) -> Image.Image:
    """L'image en RGB, son profil de couleur converti en sRGB s'il en a un (le WebP n'en garde aucun)."""
    icc = im.info.get("icc_profile")
    if icc:
        try:
            from PIL import ImageCms

            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            dst = ImageCms.createProfile("sRGB")
            base = im.convert("RGB") if im.mode not in ("RGB",) else im
            return ImageCms.profileToProfile(base, src, dst, outputMode="RGB") or base
        except Exception:  # profil illisible : les valeurs telles quelles
            pass
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        fond = Image.new("RGB", im.size, (17, 18, 20))  # --panel : le fond de la fiche
        fond.paste(im, mask=im.split()[-1])
        return fond
    return im.convert("RGB")


def webp(im: Image.Image, cadre: tuple[float, float, float, float], taille: tuple[int, int]) -> bytes:
    ox, oy, cw, ch = cadre
    r = im.resize(taille, Image.LANCZOS, box=(ox, oy, ox + cw, oy + ch))
    tampon = io.BytesIO()
    r.save(tampon, "WEBP", quality=QUALITE, method=METHODE)
    return tampon.getvalue()


def traiter_image(octets: bytes, point: list[float] | None) -> dict:
    """Les deux WebP d'une image source : {taille: (nom, octets)} et les dimensions de la source."""
    with Image.open(io.BytesIO(octets)) as brute:
        im = ImageOps.exif_transpose(brute)
        im = en_srgb(im)
    w, h = im.size
    cadre = cadrage(w, h, point)
    if cadre[2] < TAILLES["p"][0] - 0.5 or cadre[3] < TAILLES["p"][1] - 0.5:
        raise ValueError(f"source trop petite pour 1 080 × 720 après recadrage ({w} × {h})")
    sortie = {}
    for t, dim in TAILLES.items():
        b = webp(im, cadre, dim)
        sortie[t] = (hashlib.sha256(b).hexdigest(), b)
    return {"fichiers": sortie, "w": w, "h": h}


# --- Réseau ---------------------------------------------------------------------------


class Reseau:
    def __init__(self) -> None:
        self.dernier = 0.0

    def lire(self, url: str) -> bytes:
        for essai in range(3):
            attente = PAUSE_S - (time.monotonic() - self.dernier)
            if attente > 0:
                time.sleep(attente)
            self.dernier = time.monotonic()
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code not in (429, 500, 502, 503, 504) or essai == 2:
                    raise
                try:
                    pause = max(5.0, float(e.headers.get("Retry-After") or 0))
                except ValueError:
                    pause = 5.0
                print(f"  HTTP {e.code}, nouvel essai dans {pause:.0f} s", file=sys.stderr)
                time.sleep(pause)
        raise RuntimeError("inaccessible")  # pragma: no cover

    def json(self, params: dict) -> dict:
        q = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
        return json.loads(self.lire(f"{API_COMMONS}?{q}"))


def infos_commons(reseau: Reseau, fichiers: list[str], largeur: int | None = None) -> dict[str, dict]:
    """Par fichier : {w, h, url, thumburl?} (imageinfo de Commons, 50 titres par requête)."""
    r: dict[str, dict] = {}
    for i in range(0, len(fichiers), PAR_LOT):
        lot = fichiers[i : i + PAR_LOT]
        params = {"action": "query", "prop": "imageinfo", "iiprop": "url|size", "titles": "|".join(f"File:{f}" for f in lot)}
        if largeur:
            params["iiurlwidth"] = str(largeur)
        d = reseau.json(params)
        normal = {n["to"]: n["from"] for n in d.get("query", {}).get("normalized", [])}
        for p in d.get("query", {}).get("pages", []):
            titre = normal.get(p.get("title"), p.get("title", ""))
            nom = titre.split(":", 1)[1] if ":" in titre else titre
            ii = (p.get("imageinfo") or [None])[0]
            if ii:
                r[nom] = ii
    return r


def sources_commons(reseau: Reseau, fichiers: list[str]) -> dict[str, str]:
    """L'adresse à télécharger de chaque fichier : la miniature de la largeur voulue, ou l'original s'il est plus petit."""
    tailles = infos_commons(reseau, fichiers)
    groupes: dict[int, list[str]] = {}
    adresses: dict[str, str] = {}
    for f in fichiers:
        ii = tailles.get(f)
        if not ii:
            continue
        lv = largeur_voulue(ii["width"], ii["height"])
        if lv >= ii["width"]:
            adresses[f] = ii["url"]
        else:
            groupes.setdefault(lv, []).append(f)
    for lv, liste in sorted(groupes.items()):
        for f, ii in infos_commons(reseau, liste, lv).items():
            if ii.get("thumburl"):
                adresses[f] = ii["thumburl"]
    return adresses


# --- Fichiers -------------------------------------------------------------------------


def lire_json(chemin: Path, defaut):
    return json.loads(chemin.read_text("utf-8")) if chemin.exists() else defaut


def ecrire_json(chemin: Path, donnees) -> None:
    tmp = chemin.with_suffix(chemin.suffix + ".tmp")
    tmp.write_text(json.dumps(donnees, ensure_ascii=False, indent=1, sort_keys=False) + "\n", "utf-8")
    os.replace(tmp, chemin)


def gardees(choix: dict) -> dict[str, dict]:
    """Les photos gardées des lieux relus, une fois chacune : fichier → {garde, lieux}. Le premier point l'emporte."""
    r: dict[str, dict] = {}
    for lieu, e in (choix.get("lieux") or {}).items():
        if (e or {}).get("etat") != "relu":
            continue
        for g in e.get("gardees") or []:
            x = r.setdefault(g["fichier"], {"garde": g, "lieux": []})
            x["lieux"].append(lieu)
            if g.get("point") != x["garde"].get("point"):
                print(f"  {g['fichier']} : point différent pour {lieu}, celui de {x['lieux'][0]} gardé", file=sys.stderr)
    return r


def juste(chemin: Path, sha: str) -> bool:
    return chemin.exists() and hashlib.sha256(chemin.read_bytes()).hexdigest() == sha


def principal(argv: list[str]) -> int:
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("--donnees", type=Path, default=Path(os.environ.get("TERRAMEMO_PHOTOS_DONNEES") or DOSSIER))
    a.add_argument("--vers", type=Path, default=RACINE / "public" / "photos")
    a.add_argument("--sauvegarde", type=Path, default=SAUVEGARDE)
    a.add_argument("--sans-sauvegarde", action="store_true")
    a.add_argument("--sources", type=Path)
    a.add_argument("--max", type=int)
    a.add_argument("--refaire", action="store_true")
    a.add_argument("--elaguer", action="store_true")
    o = a.parse_args(argv)
    sauvegarde = None if o.sans_sauvegarde else o.sauvegarde

    choix = lire_json(o.donnees / "choix.json", {"v": 1, "lieux": {}})
    chemin_licences = o.donnees / "licences.json"
    anciennes = lire_json(chemin_licences, {"v": 1, "photos": {}}).get("photos", {})
    voulues = gardees(choix)

    def deja(f: str, g: dict) -> bool:
        l = anciennes.get(f)
        if o.refaire or not l or l.get("point") != g.get("point"):
            return False
        ok = True
        for t in TAILLES:
            cible = o.vers / t / f"{l[t]}.webp"
            if juste(cible, l[f"sha256_{t}"]):
                continue
            copie = sauvegarde / t / f"{l[t]}.webp" if sauvegarde else None
            if copie and juste(copie, l[f"sha256_{t}"]):
                cible.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(copie, cible)
            else:
                ok = False
        return ok

    a_faire = [f for f, x in voulues.items() if not deja(f, x["garde"])]
    if o.max is not None:
        a_faire = a_faire[: o.max]
    print(f"Photos : {len(voulues)} gardée(s) dans les lieux relus, {len(a_faire)} à traiter.")

    reseau = Reseau()
    adresses: dict[str, str] = {}
    if a_faire and not o.sources:
        adresses = sources_commons(reseau, a_faire)

    photos = {f: anciennes[f] for f in voulues if f in anciennes and f not in a_faire}
    echecs: list[str] = []
    versions = {"pillow": Image.__version__, "libwebp": features.version("webp")}
    for i, f in enumerate(a_faire, 1):
        g = voulues[f]["garde"]
        try:
            if o.sources:
                octets = (o.sources / f).read_bytes()
                source = {"origine": "locale"}
            else:
                url = adresses.get(f)
                if not url:
                    raise ValueError("inconnu de Commons")
                octets = reseau.lire(url)
                source = {"origine": url}
            t = traiter_image(octets, g.get("point"))
        except Exception as e:  # une photo ratée n'arrête pas les autres
            echecs.append(f"{f} : {e}")
            print(f"  [{i}/{len(a_faire)}] échec : {f} : {e}", file=sys.stderr)
            continue
        ligne = {
            "lieux": voulues[f]["lieux"],
            "auteur": g.get("auteur"),
            "licence": g["licence"],
            "licence_url": g.get("licence_url"),
            "titre": g.get("titre"),
            "page": g["page"],
            "point": g.get("point"),
            "source": {**source, "w": t["w"], "h": t["h"]},
            "traite_le": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        for taille, (sha, b) in t["fichiers"].items():
            nom = sha[:LONGUEUR_NOM]
            for base in [o.vers, *([sauvegarde] if sauvegarde else [])]:
                cible = base / taille / f"{nom}.webp"
                cible.parent.mkdir(parents=True, exist_ok=True)
                if not juste(cible, sha):
                    cible.write_bytes(b)
            ligne[taille] = nom
            ligne[f"sha256_{taille}"] = sha
            ligne[f"octets_{taille}"] = len(b)
        photos[f] = ligne
        print(f"  [{i}/{len(a_faire)}] {f} → v/{ligne['v']}.webp ({ligne['octets_v']} o), p/{ligne['p']}.webp ({ligne['octets_p']} o)")

    # Les lieux de chaque photo, relus à chaque passage (une photo déjà traitée peut servir un lieu de plus).
    for f, l in photos.items():
        l["lieux"] = voulues[f]["lieux"]
    for f in voulues:
        if f in anciennes and f not in photos:
            photos[f] = anciennes[f]  # au-delà de --max, ou en échec : l'ancienne ligne reste
    noms: dict[str, str] = {}
    for f, l in photos.items():
        for taille in TAILLES:
            autre = noms.setdefault(f"{taille}/{l[taille]}", f)
            if autre != f:
                echecs.append(f"collision de nom {taille}/{l[taille]} : {autre} et {f}")
    sortie = {"v": 1, **versions, "photos": dict(sorted(photos.items()))}
    ecrire_json(chemin_licences, sortie)

    cites = {t: {l[t] for l in photos.values()} for t in TAILLES}
    orphelins = [p for t in TAILLES if (o.vers / t).exists() for p in sorted((o.vers / t).glob("*.webp")) if p.stem not in cites[t]]
    for p in orphelins:
        if o.elaguer:
            p.unlink()
    if orphelins:
        print(f"Photos : {len(orphelins)} WebP orphelin(s) dans {o.vers}" + (" retiré(s)." if o.elaguer else " (--elaguer pour les retirer)."))
    retirees = sorted(set(anciennes) - set(voulues))
    print(f"Photos : {len(photos)} dans licences.json ({len(retirees)} retirée(s)), {len(echecs)} échec(s).")
    for e in echecs:
        print(f"  {e}", file=sys.stderr)
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
