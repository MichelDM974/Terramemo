"""Chaque image d'une vidéo (Chromium headless du PC, requestVideoFrameCallback) :
luminance moyenne et part de pixels presque blancs, pour voir un éclair blanc
au lancement de l'APK. Usage : images_video.py <video.mp4> [dossier des vignettes]"""
import base64
import importlib.util
from pathlib import Path
import json
import os
import sys

RACINE = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("driver", f"{RACINE}/.claude/skills/run-terramemo/driver.py")
d = importlib.util.module_from_spec(spec)
sys.argv, args = ["driver"], sys.argv[1:]
spec.loader.exec_module(d)
video = os.path.abspath(args[0])
vignettes = args[1] if len(args) > 1 else None

tube = d.Tube(d.chromium_binaire())
nav = d.Navigateur(tube)
page = nav.page_du_tube()
donnees = base64.b64encode(open(video, "rb").read()).decode()
js = """
(async () => {
  const v = document.createElement('video');
  v.muted = true; v.src = 'data:video/mp4;base64,%s';
  await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(String(v.error && v.error.message)); });
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  const out = [];
  let derniere = -1;
  const lire = (t) => {
    x.drawImage(v, 0, 0);
    const p = x.getImageData(0, 0, c.width, c.height).data;
    let somme = 0, blancs = 0;
    for (let i = 0; i < p.length; i += 4) {
      const l = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
      somme += l; if (l > 220) blancs++;
    }
    const n = p.length / 4;
    out.push({ t: Math.round(t * 1000), lum: Math.round(somme / n), blancs: Math.round(1000 * blancs / n) / 10, png: c.toDataURL('image/png') });
  };
  await new Promise((fin) => {
    const suivante = (now, meta) => { if (meta.mediaTime !== derniere) { derniere = meta.mediaTime; lire(meta.mediaTime); } v.requestVideoFrameCallback(suivante); };
    v.requestVideoFrameCallback(suivante);
    v.onended = fin;
    v.playbackRate = 0.25;
    v.play();
  });
  return JSON.stringify({ w: c.width, h: c.height, images: out });
})()
""" % donnees
res = nav.commande("Runtime.evaluate", page.session, delai=120, expression=js, awaitPromise=True, returnByValue=True)
r = res["result"].get("value")
res = json.loads(r)
print(f"{len(res['images'])} images {res['w']}×{res['h']}")
for i, im in enumerate(res["images"]):
    print(f"  {im['t']:5} ms  luminance {im['lum']:3}  presque blancs {im['blancs']:5} %")
    if vignettes:
        os.makedirs(vignettes, exist_ok=True)
        open(f"{vignettes}/{i:03}-{im['t']}.png", "wb").write(base64.b64decode(im["png"].split(",", 1)[1]))
