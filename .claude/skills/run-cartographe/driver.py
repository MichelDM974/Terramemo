#!/usr/bin/env python3
"""Driver de Cartographe : lance le site, le vérifie, le photographie et le
MESURE, sur le PC (chromium local) et sur le téléphone (Chrome ou l'APK, par
adb). Python stdlib seule ; à lancer depuis Cartographe/ :

    serve [--preview] [--lan]   Vite sur le port 8060 (au premier plan)
    smoke                       page, fichiers /geo/*.json, carte peinte
    ui [--width 384]            captures des vues (téléphone ou PC)
    mesurer --cible local|chrome|webview [--rendu css|g|canvas]
                                gestes et touchers rejoués par DevTools,
                                rapport JSON dans docs/mesures/j0/
    resumer FICHIER.json…       résumé recalculé sur les rapports bruts
                                d'un JSON de mesurer (critères changés)
    apk [--installer]           APK de débogage, installé par adb

Pas de données serveur au J0 : tout le stockage est dans le navigateur.
Mode d'emploi, pièges et dépannage : SKILL.md à côté.
"""
import argparse
import base64
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import select
import socket
import statistics
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parents[3]
PORT = 8060  # Vite (dev et preview)
PORT_CDP = 8061  # DevTools : adb forward vers le téléphone, ou chromium local en --ws
URL_DEFAUT = f"http://localhost:{PORT}/"
APPID = "io.github.micheldm974.cartographe"
ADB = pathlib.Path.home() / "Android/Sdk/platform-tools/adb"
JAVA_HOME = "/usr/lib/jvm/java-21-openjdk-amd64"
APK = RACINE / "android/app/build/outputs/apk/debug/app-debug.apk"
FICHIERS_GEO = ("monde.topo.json", "pays.json", "contestees.json", "noms.fr.json", "sources.json")
MESURES = RACINE / "docs/mesures/j0"
# Le téléphone cible (Galaxy A37 : 1080 × 2340 à 450 dpi) en px CSS.
TELEPHONE = {"largeur": 384, "hauteur": 832, "dpr": 2.8125}
PC = {"largeur": 1280, "hauteur": 800, "dpr": 1}

# Critères du J0 (docs/plan.md).
CRITERE_RENDU_MS = 1000
CRITERE_TOUCHER_MS = 100
# Fin de geste (Event Timing du touchend, pointerup ou mouseup) : seuil
# proposé, le même que le toucher (le doigt levé attend la carte nette).
CRITERE_FIN_GESTE_MS = 100
# Event Timing ne garde que les entrées de 16 ms et plus (durationThreshold).
SEUIL_EVENT_TIMING_MS = 16
# Saccade (décision de l'utilisateur du 04/11/2026, ticket #1) : un à-coup
# visible même à 60 images/s, un intervalle ≥ 1,5 × 16,67 = 25 ms (à 0,5 ms
# près : trois périodes à 120 Hz arrondies au dixième), quelle que soit la
# fréquence de l'écran ; recopie de src/mesure/stats.ts (estSaccade,
# sansSaccade), recalculée ici sur les intervalles bruts pour relire aussi les
# rapports v3. [NON] au-delà de 5 % de saccades sur un type de geste ou d'un
# intervalle de plus de 50 ms. Monotone : plus d'images à 120 i/s ne change
# ni le compte ni le maximum et baisse la part. La tenue de la cadence de
# l'écran (120 Hz sur le téléphone) est rapportée à part, sans verdict.
SEUIL_SACCADE_MS = 1.5 * 1000 / 60
TOLERANCE_SACCADE_MS = 0.5
SACCADE_PART = 0.05
SACCADE_MAX_MS = 50
FACTEUR_PERDUE = 1.5
VERSION_RAPPORT = 4  # src/mesure/rapport.ts ; resumer relit aussi la v3


CRITERE_SACCADE = {"seuil_ms": round(SEUIL_SACCADE_MS, 2), "tolerance_ms": TOLERANCE_SACCADE_MS,
                   "part": SACCADE_PART, "max_ms": SACCADE_MAX_MS,
                   "tenue": "part des intervalles ≤ 1,5 × la période la plus courte de l'écran (repos ou "
                            "gestes, sur le fichier), et images/s ; sans verdict"}


def est_saccade(d):
    return d > SEUIL_SACCADE_MS - TOLERANCE_SACCADE_MS


def sans_saccade(saccades, intervalles, max_ms):
    return not ((intervalles and saccades / intervalles > SACCADE_PART) or (max_ms or 0) > SACCADE_MAX_MS)
# Fin de geste écartée du verdict (artefact prouvé, src/mesure/rapport.ts,
# Geste.fin) : rendu g, close par l'entrée suivante, image_ms sous ce seuil
# et aucune longue image.
ARTEFACT_IMAGE_MS = 100


def dire(texte=""):
    print(texte, flush=True)


# --- HTTP ------------------------------------------------------------

def http(url, methode="GET", delai=10):
    """(code, en-têtes, corps) ; code 0 et l'erreur en corps si rien ne répond."""
    req = urllib.request.Request(url, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=delai) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()
    except (urllib.error.URLError, OSError) as e:
        return 0, {}, str(e).encode()


def serveur_de_dev(base):
    """Vrai si c'est `vite` (dev) qui répond : lui seul sert /@vite/client en
    JavaScript (preview renvoie index.html à toute adresse inconnue, Firebase
    un 404 : firebase.json n'a pas de rewrites)."""
    code, entetes, _ = http(base.rstrip("/") + "/@vite/client")
    return code == 200 and "javascript" in (entetes.get("content-type") or "")


# --- serve -----------------------------------------------------------

def commande_serve(args):
    vite = RACINE / "node_modules/.bin/vite"
    if not vite.exists():
        sys.exit("node_modules absent : npm ci d'abord")
    hote = ["--host", "0.0.0.0"] if args.lan else []
    if args.preview:
        # Construit hors de dist/ : dist/ est celui de l'APK (npx cap sync) et
        # d'autres sessions peuvent s'en servir en même temps.
        sortie = pathlib.Path(args.sortie).resolve()
        subprocess.run([str(vite), "build", "--outDir", str(sortie), "--emptyOutDir"], cwd=RACINE, check=True)
        cmd = [str(vite), "preview", "--outDir", str(sortie), "--port", str(PORT), "--strictPort", *hote]
        quoi = f"build de {sortie} (vite preview, gzip)"
    else:
        cmd = [str(vite), "--port", str(PORT), "--strictPort", *hote]
        quoi = "serveur de développement (modules non groupés : chargement plus lent qu'en preview)"
    dire(f"Cartographe sur {URL_DEFAUT} — {quoi}")
    if args.lan:
        ip = subprocess.run(["hostname", "-I"], capture_output=True, text=True).stdout.split()
        dire(f"  réseau local : http://{ip[0] if ip else '<ip du PC>'}:{PORT}/ (pas un contexte sûr sur le "
             "téléphone : préférer adb reverse, cf. SKILL.md)")
    os.chdir(RACINE)
    os.execv(str(vite), cmd)


# --- DevTools : deux transports, un tube ou un WebSocket --------------

def _binaires(motif):
    """Binaires de ~/.cache/ms-playwright, du plus ancien au plus récent : tri
    sur le numéro du dossier (chromium-1243), pas sur la chaîne (999 > 1243)."""
    numero = lambda p: int(p.relative_to(pathlib.Path.home() / ".cache/ms-playwright").parts[0].rsplit("-", 1)[1])
    return sorted(pathlib.Path.home().glob(".cache/ms-playwright/" + motif), key=numero)


# Deux binaires : chrome-headless-shell (l'ancien headless) mesure juste ;
# chromium-* en nouveau headless fausse Event Timing sur nos touchers (la
# présentation n'est signalée qu'au prochain événement : des secondes en
# escalier, cf. SKILL.md, Pièges). Le shell passe donc en premier partout ;
# `--binaire chromium` force l'autre.
SHELLS = _binaires("chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell")
CHROMIUMS = _binaires("chromium-*/chrome-linux*/chrome")
# Le trousseau GNOME, verrouillé au démarrage, figerait chromium sans `basic`.
OPTIONS_CHROMIUM = [
    "--headless", "--no-sandbox", "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb",
    "--no-first-run", "--no-default-browser-check", "--password-store=basic",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
]


class Tube:
    """Chromium lancé ici, piloté par `--remote-debugging-pipe` : du JSON
    terminé par un octet nul, lu sur son fd 3, écrit sur son fd 4 (repris
    réduit de run-cdc). Option `port` : chromium écoute aussi en HTTP et
    WebSocket sur ce port (pour éprouver le chemin du téléphone)."""

    def __init__(self, binaire, port=None):
        self.profil = tempfile.TemporaryDirectory(prefix="cartographe-chromium-")
        self.journal = pathlib.Path(self.profil.name) / "chromium.log"
        lecture, self.vers = os.pipe()
        self.depuis, ecriture = os.pipe()
        # Recopiés au-dessus de 4 : les dup2 de l'enfant vers 3 et 4 ne
        # peuvent plus s'écraser l'un l'autre.
        enfant = [fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 5) for fd in (lecture, ecriture)]
        os.close(lecture)
        os.close(ecriture)
        options = [f"--remote-debugging-port={port}"] if port else []
        with open(self.journal, "wb") as journal:
            self.processus = subprocess.Popen(
                [str(binaire), *OPTIONS_CHROMIUM, *options, f"--user-data-dir={self.profil.name}",
                 "--remote-debugging-pipe", "about:blank"],
                stdout=journal, stderr=journal, close_fds=False,
                preexec_fn=lambda: (os.dup2(enfant[0], 3), os.dup2(enfant[1], 4)))
        for fd in enfant:
            os.close(fd)
        self.tampon = b""

    def ecrire(self, message):
        donnees = json.dumps(message).encode() + b"\0"
        while donnees:
            donnees = donnees[os.write(self.vers, donnees):]

    def lire(self, delai):
        """Le prochain message de chromium, ou None passé `delai` secondes."""
        fin = time.monotonic() + delai
        while b"\0" not in self.tampon:
            if not select.select([self.depuis], [], [], max(0, fin - time.monotonic()))[0]:
                return None
            morceau = os.read(self.depuis, 1 << 20)
            if not morceau:
                raise RuntimeError("chromium s'est arrêté : " + self.journal.read_text(errors="replace")[-500:])
            self.tampon += morceau
        message, _, self.tampon = self.tampon.partition(b"\0")
        return json.loads(message)

    def fermer(self):
        if self.profil is None:
            return
        try:
            self.ecrire({"id": 0, "method": "Browser.close"})
            self.processus.wait(10)
        except (OSError, subprocess.TimeoutExpired):
            self.processus.kill()
            self.processus.wait()
        os.close(self.vers)
        os.close(self.depuis)
        self.profil.cleanup()
        self.profil = None


GUID_WS = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"  # RFC 6455


class WebSocket:
    """Client WebSocket minimal (RFC 6455) pour DevTools : poignée de main,
    trames texte masquées à l'envoi, fragments et ping à la lecture. Sert au
    téléphone (Chrome ou WebView derrière `adb forward`) et au chromium local
    lancé avec --remote-debugging-port."""

    def __init__(self, url, delai=10):
        u = urllib.parse.urlsplit(url)
        self.sock = socket.create_connection((u.hostname, u.port or 80), timeout=delai)
        cle = base64.b64encode(os.urandom(16)).decode()
        chemin = u.path + ("?" + u.query if u.query else "")
        # Pas d'en-tête Origin : Chrome refuse un WebSocket DevTools qui en
        # porte un sans --remote-allow-origins.
        self.sock.sendall((f"GET {chemin} HTTP/1.1\r\nHost: {u.hostname}:{u.port or 80}\r\n"
                           "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                           f"Sec-WebSocket-Key: {cle}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        tampon = b""
        while b"\r\n\r\n" not in tampon:
            morceau = self.sock.recv(4096)
            if not morceau:
                raise RuntimeError(f"WebSocket {url} : fermé pendant la poignée de main")
            tampon += morceau
        entete, _, self.tampon = tampon.partition(b"\r\n\r\n")
        lignes = entete.decode("latin-1").split("\r\n")
        if lignes[0].split(" ")[1:2] != ["101"]:
            raise RuntimeError(f"WebSocket {url} : {lignes[0]}")
        entetes = {k.strip().lower(): v.strip() for k, _, v in (ligne.partition(":") for ligne in lignes[1:])}
        attendu = base64.b64encode(hashlib.sha1((cle + GUID_WS).encode()).digest()).decode()
        if entetes.get("sec-websocket-accept") != attendu:
            raise RuntimeError(f"WebSocket {url} : Sec-WebSocket-Accept inattendu")
        self.sock.settimeout(60)
        self.fragments, self.op_fragments = [], None

    def _envoyer_trame(self, opcode, donnees):
        n = len(donnees)
        entete = bytearray([0x80 | opcode])
        if n < 126:
            entete.append(0x80 | n)
        elif n < 1 << 16:
            entete += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            entete += bytes([0x80 | 127]) + struct.pack(">Q", n)
        masque = os.urandom(4)
        repete = (masque * (n // 4 + 1))[:n]
        corps = (int.from_bytes(donnees, "big") ^ int.from_bytes(repete, "big")).to_bytes(n, "big") if n else b""
        self.sock.sendall(bytes(entete) + masque + corps)

    def ecrire(self, message):
        self._envoyer_trame(0x1, json.dumps(message).encode())

    def _trame(self):
        """(fin, opcode, données) de la première trame entière du tampon,
        retirée du tampon ; None si elle n'est pas encore toute arrivée."""
        t = self.tampon
        if len(t) < 2:
            return None
        fin, opcode, masque, n = t[0] & 0x80, t[0] & 0x0F, t[1] & 0x80, t[1] & 0x7F
        i = 2
        if n == 126:
            if len(t) < 4:
                return None
            n, i = struct.unpack(">H", t[2:4])[0], 4
        elif n == 127:
            if len(t) < 10:
                return None
            n, i = struct.unpack(">Q", t[2:10])[0], 10
        cle = b""
        if masque:
            cle, i = t[i:i + 4], i + 4
        if len(t) < i + n:
            return None
        donnees, self.tampon = t[i:i + n], t[i + n:]
        if masque:
            repete = (cle * (n // 4 + 1))[:n]
            donnees = (int.from_bytes(donnees, "big") ^ int.from_bytes(repete, "big")).to_bytes(n, "big")
        return bool(fin), opcode, donnees

    def lire(self, delai):
        """Le prochain message JSON, ou None passé `delai` secondes."""
        fin_attente = time.monotonic() + delai
        while True:
            trame = self._trame()
            if trame is None:
                reste = fin_attente - time.monotonic()
                if reste <= 0 or not select.select([self.sock], [], [], reste)[0]:
                    return None
                morceau = self.sock.recv(1 << 20)
                if not morceau:
                    raise RuntimeError("WebSocket fermé par l'autre bout (onglet ou appli fermés ?)")
                self.tampon += morceau
                continue
            fin, opcode, donnees = trame
            if opcode == 0x9:  # ping
                self._envoyer_trame(0xA, donnees)
            elif opcode == 0x8:
                raise RuntimeError("WebSocket fermé par l'autre bout (onglet ou appli fermés ?)")
            elif opcode in (0x0, 0x1, 0x2):
                if opcode:
                    self.fragments, self.op_fragments = [], opcode
                self.fragments.append(donnees)
                if fin:
                    message = b"".join(self.fragments)
                    self.fragments = []
                    return json.loads(message.decode())

    def fermer(self):
        try:
            self._envoyer_trame(0x8, struct.pack(">H", 1000))
        except OSError:
            pass
        self.sock.close()


class Navigateur:
    """Commandes DevTools sur un transport (Tube ou WebSocket). Avec le tube,
    chaque onglet a sa session (`Target.attachToTarget`, flatten) ; sur un
    WebSocket d'onglet, la session est None."""

    def __init__(self, lien):
        self.lien = lien
        self.numero, self.reponses, self.pages = 0, {}, {}
        self.sans_attente, self.erreurs_envoi = set(), []

    def attendre(self, condition, secondes):
        """Traite ce qu'envoie le navigateur jusqu'à ce que `condition()` soit
        vraie ; faux si elle ne l'est pas au bout de `secondes`."""
        fin = time.monotonic() + secondes
        while not condition():
            reste = fin - time.monotonic()
            if reste <= 0:
                return False
            message = self.lien.lire(reste)
            if message is None:
                continue
            if "id" in message:
                if message["id"] in self.sans_attente:
                    self.sans_attente.discard(message["id"])
                    if "error" in message:
                        self.erreurs_envoi.append(message["error"].get("message"))
                else:
                    self.reponses[message["id"]] = message
            elif message.get("sessionId") in self.pages:
                self.pages[message.get("sessionId")].evenement(message["method"], message.get("params", {}))
        return True

    def pause(self, secondes):
        self.attendre(lambda: False, secondes)

    def _envoyer(self, methode, session, params):
        self.numero += 1
        self.lien.ecrire({"id": self.numero, "method": methode, "params": params,
                          **({"sessionId": session} if session else {})})
        return self.numero

    def commande(self, methode, session=None, delai=30, **params):
        numero = self._envoyer(methode, session, params)
        if not self.attendre(lambda: numero in self.reponses, delai):
            raise RuntimeError(f"{methode} : pas de réponse du navigateur en {delai} s")
        reponse = self.reponses.pop(numero)
        if "error" in reponse:
            raise RuntimeError(f"{methode} : {reponse['error'].get('message')}")
        return reponse.get("result", {})

    def envoyer(self, methode, session=None, **params):
        """Sans attendre la réponse (gestes à cadence fixe) ; `vider()` les attend."""
        self.sans_attente.add(self._envoyer(methode, session, params))

    def vider(self, delai=30):
        if not self.attendre(lambda: not self.sans_attente, delai):
            raise RuntimeError(f"{len(self.sans_attente)} commande(s) sans réponse en {delai} s")
        erreurs, self.erreurs_envoi = self.erreurs_envoi, []
        if erreurs:
            raise RuntimeError("commande refusée : " + "; ".join(sorted(set(erreurs))))

    def page_du_tube(self):
        """Un onglet neuf (chromium local, tube)."""
        cible = self.commande("Target.createTarget", url="about:blank")["targetId"]
        session = self.commande("Target.attachToTarget", targetId=cible, flatten=True)["sessionId"]
        return self._page(session)

    def page_du_websocket(self):
        """Le WebSocket est celui d'un onglet : pas de session."""
        return self._page(None)

    def _page(self, session):
        page = self.pages[session] = Page(self, session)
        for domaine in ("Page", "Runtime", "Network"):
            page.cdp(f"{domaine}.enable")
        return page

    def fermer(self):
        self.lien.fermer()


class Page:
    def __init__(self, nav, session):
        self.nav, self.session = nav, session
        self.chargements = 0
        self.erreurs = []  # exceptions JS
        self.echecs = []  # réponses HTTP ≥ 400 et requêtes échouées
        self.requetes = {}
        self.tactile = False

    def cdp(self, methode, delai=30, **params):
        return self.nav.commande(methode, self.session, delai, **params)

    def envoyer(self, methode, **params):
        self.nav.envoyer(methode, self.session, **params)

    def evenement(self, methode, params):
        if methode == "Page.loadEventFired":
            self.chargements += 1
        elif methode == "Runtime.exceptionThrown":
            d = params["exceptionDetails"]
            self.erreurs.append(d.get("exception", {}).get("description") or d.get("text"))
        elif methode == "Network.requestWillBeSent":
            self.requetes[params["requestId"]] = params["request"]["url"]
        elif methode == "Network.responseReceived":
            if params["response"]["status"] >= 400:
                self.echecs.append(f"{params['response']['status']} {params['response']['url']}")
        elif methode == "Network.loadingFailed" and not params.get("canceled"):
            self.echecs.append(f"{params.get('errorText')} {self.requetes.get(params['requestId'], '?')}")

    def js(self, expression, delai=30):
        r = self.cdp("Runtime.evaluate", delai=delai, expression=expression, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            d = r["exceptionDetails"]
            raise RuntimeError("script : " + (d.get("exception", {}).get("description") or d.get("text")))
        return r["result"].get("value")

    def pause(self, ms):
        self.nav.pause(ms / 1000)

    def goto(self, url, delai=60):
        avant = self.chargements
        r = self.cdp("Page.navigate", url=url)
        if r.get("errorText"):
            raise RuntimeError(f"{url} : {r['errorText']}")
        if "loaderId" in r and not self.nav.attendre(lambda: self.chargements > avant, delai):
            raise RuntimeError(f"{url} : aucune page chargée en {delai} s")

    def attendre_carte(self, delai=60):
        """Attend body[data-repos] (carte peinte, période de l'écran mesurée) ;
        rend la période en ms. Échec si body[data-pret="erreur"]."""
        fin = time.monotonic() + delai
        while time.monotonic() < fin:
            try:
                etat = self.js("document.body ? [document.body.dataset.pret || '', document.body.dataset.repos || ''] : ['', '']")
            except RuntimeError:  # contexte détruit pendant une navigation
                etat = ["", ""]
            if etat[0] == "erreur":
                texte = self.js("(document.querySelector('.status.error') || {}).textContent || ''")
                raise RuntimeError(f"la carte ne s'est pas chargée : {texte}")
            if etat[1] == "1":
                return self.js("window.cartographe.repos")
            self.pause(100)
        raise RuntimeError(f"carte pas prête en {delai} s (body[data-repos] absent)")

    def emuler(self, ecran, tactile, ralenti=1):
        """Viewport, densité, toucher et ralenti du processeur (chromium local)."""
        self.cdp("Emulation.setDeviceMetricsOverride", width=ecran["largeur"], height=ecran["hauteur"],
                 deviceScaleFactor=ecran["dpr"], mobile=tactile)
        self.cdp("Emulation.setTouchEmulationEnabled", enabled=tactile, maxTouchPoints=5 if tactile else 1)
        self.cdp("Emulation.setFocusEmulationEnabled", enabled=True)
        self.cdp("Emulation.setCPUThrottlingRate", rate=ralenti)
        self.tactile = tactile

    def capture(self, chemin):
        donnees = self.cdp("Page.captureScreenshot", format="png")["data"]
        pathlib.Path(chemin).write_bytes(base64.b64decode(donnees))

    # Gestes : coordonnées clientX/clientY de la fenêtre.

    def toucher(self, x, y, duree_ms=60):
        """Un toucher (ou un clic hors mode tactile) sans déplacement."""
        if not self.tactile:
            for t in ("mouseMoved", "mousePressed", "mouseReleased"):
                self.cdp("Input.dispatchMouseEvent", type=t, x=x, y=y, clickCount=1,
                         button="none" if t == "mouseMoved" else "left")
            return
        self.cdp("Input.dispatchTouchEvent", type="touchStart", touchPoints=[_doigt(x, y)])
        self.pause(duree_ms)
        self.cdp("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])

    def geste(self, positions, pas_ms):
        """Rejoue `positions` (une liste de doigts [(x, y), …] par image) en
        tactile : un touchMove tous les `pas_ms`, sans attendre l'accusé de
        chacun, comme un doigt qui ne s'arrête pas."""
        doigts = lambda pts: [_doigt(x, y, i) for i, (x, y) in enumerate(pts)]
        self.cdp("Input.dispatchTouchEvent", type="touchStart", touchPoints=doigts(positions[0]))
        t0 = time.monotonic()
        for i, pts in enumerate(positions[1:], 1):
            reste = t0 + i * pas_ms / 1000 - time.monotonic()
            if reste > 0:
                self.nav.pause(reste)
            self.envoyer("Input.dispatchTouchEvent", type="touchMove", touchPoints=doigts(pts))
        self.nav.pause(pas_ms / 1000)
        self.envoyer("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
        self.nav.vider()
        return (time.monotonic() - t0) * 1000


def _doigt(x, y, ident=0):
    return {"x": round(x, 2), "y": round(y, 2), "id": ident, "radiusX": 4, "radiusY": 4, "force": 1}


BINAIRE = "shell"  # réglé par --binaire (main)


def chromium_binaire():
    """Le plus récent chrome-headless-shell, sinon chromium (ou l'inverse
    avec --binaire chromium) ; un chemin donné à --binaire tel quel."""
    if BINAIRE not in ("shell", "chromium"):
        return pathlib.Path(BINAIRE)
    ordre = (SHELLS, CHROMIUMS) if BINAIRE == "shell" else (CHROMIUMS, SHELLS)
    trouves = ordre[0] or ordre[1]
    if not trouves:
        sys.exit("ECHEC : aucun chromium dans ~/.cache/ms-playwright (cf. SKILL.md, Dépannage)")
    return trouves[-1]


def ouvrir_onglet_http(port, url="about:blank", delai=15):
    """Onglet neuf par l'API HTTP de DevTools (/json/new, en PUT depuis
    Chrome 111) ; rend sa description (id, webSocketDebuggerUrl)."""
    base = f"http://localhost:{port}"
    fin = time.monotonic() + delai
    while True:
        code, _, corps = http(f"{base}/json/version", delai=3)
        if code == 200:
            break
        if time.monotonic() > fin:
            raise RuntimeError(f"DevTools ne répond pas sur {base}/json/version : {corps[:200]!r}")
        time.sleep(0.3)
    code, _, corps = http(f"{base}/json/new?{urllib.parse.quote(url, safe=':/?=&')}", methode="PUT")
    if code != 200:
        code, _, corps = http(f"{base}/json/new?{urllib.parse.quote(url, safe=':/?=&')}")  # anciens Chrome
    if code != 200:
        raise RuntimeError(f"/json/new : {code} {corps[:200]!r}")
    return json.loads(corps)


class Session:
    """Un onglet piloté, ouvert selon la cible ; ferme tout à la sortie."""

    def __init__(self, cible, serie=None, ws_local=False):
        self.cible, self.serie, self.ws_local = cible, serie, ws_local
        self.tube = self.nav = self.page = None
        self.onglet = None
        self.a_retirer = []  # (forward|reverse, port) à défaire à la fin
        self.navigateur = ""

    def __enter__(self):
        try:
            if self.cible == "local":
                self._local()
            elif self.cible == "chrome":
                self._chrome()
            else:
                self._webview()
            self.navigateur = self.page.js("navigator.userAgent")
        except BaseException:
            self.__exit__()
            raise
        return self

    def _local(self):
        if not self.ws_local:
            self.tube = Tube(chromium_binaire())
            self.nav = Navigateur(self.tube)
            self.page = self.nav.page_du_tube()
            return
        # Même chemin que le téléphone : HTTP /json/new puis WebSocket.
        if port_ouvert(PORT_CDP):
            raise RuntimeError(f"port {PORT_CDP} déjà pris (adb forward resté ? `adb forward --remove-all`)")
        self.tube = Tube(chromium_binaire(), port=PORT_CDP)
        self.onglet = ouvrir_onglet_http(PORT_CDP)
        self.nav = Navigateur(WebSocket(self.onglet["webSocketDebuggerUrl"]))
        self.page = self.nav.page_du_websocket()

    def _chrome(self):
        adb_appareil(self.serie)
        adb(self.serie, "forward", f"tcp:{PORT_CDP}", "localabstract:chrome_devtools_remote")
        self.a_retirer.append(("forward", f"tcp:{PORT_CDP}"))
        if http(f"http://localhost:{PORT_CDP}/json/version", delai=3)[0] != 200:
            # Le socket n'existe qu'une fois Chrome lancé.
            adb(self.serie, "shell", "am", "start", "-n",
                "com.android.chrome/com.google.android.apps.chrome.Main", "-d", "about:blank")
        self.onglet = ouvrir_onglet_http(PORT_CDP, delai=20)
        http(f"http://localhost:{PORT_CDP}/json/activate/{self.onglet['id']}")
        self.nav = Navigateur(WebSocket(self.onglet["webSocketDebuggerUrl"]))
        self.page = self.nav.page_du_websocket()

    def _webview(self):
        adb_appareil(self.serie)
        adb(self.serie, "shell", "am", "start", "-n", f"{APPID}/.MainActivity")
        pid = ""
        fin = time.monotonic() + 15
        while not pid and time.monotonic() < fin:
            pid = adb(self.serie, "shell", "pidof", APPID, verifier=False).strip()
            if not pid:
                time.sleep(0.5)
        if not pid:
            raise RuntimeError(f"{APPID} ne tourne pas (APK installé ? `driver.py apk --installer`)")
        adb(self.serie, "forward", f"tcp:{PORT_CDP}", f"localabstract:webview_devtools_remote_{pid.split()[0]}")
        self.a_retirer.append(("forward", f"tcp:{PORT_CDP}"))
        fin = time.monotonic() + 20
        while True:
            code, _, corps = http(f"http://localhost:{PORT_CDP}/json/list", delai=3)
            onglets = [o for o in json.loads(corps) if o.get("type") == "page"] if code == 200 else []
            if onglets:
                break
            if time.monotonic() > fin:
                raise RuntimeError("aucune page dans la WebView (débogage WebView actif ? APK de debug seulement)")
            time.sleep(0.5)
        self.nav = Navigateur(WebSocket(onglets[0]["webSocketDebuggerUrl"]))
        self.page = self.nav.page_du_websocket()

    def reverse(self, url):
        """La page du PC vue du téléphone à la même adresse (contexte sûr)."""
        u = urllib.parse.urlsplit(url)
        if self.cible == "chrome" and u.hostname in ("localhost", "127.0.0.1"):
            port = u.port or 80
            adb(self.serie, "reverse", f"tcp:{port}", f"tcp:{port}")
            self.a_retirer.append(("reverse", f"tcp:{port}"))

    def __exit__(self, *exc):
        if self.nav:
            try:
                self.nav.fermer()
            except OSError:
                pass
        if self.onglet and self.cible == "chrome":
            http(f"http://localhost:{PORT_CDP}/json/close/{self.onglet['id']}", delai=3)
        if self.tube:
            self.tube.fermer()
        for sens, port in self.a_retirer:
            adb(self.serie, sens, "--remove", port, verifier=False)


def port_ouvert(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


# --- adb ---------------------------------------------------------------

def adb(serie, *args, verifier=True, delai=120):
    if not ADB.exists():
        raise RuntimeError(f"adb absent : {ADB}")
    cmd = [str(ADB), *(["-s", serie] if serie else []), *args]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=delai)
    if verifier and r.returncode:
        raise RuntimeError(f"{' '.join(args)} : {(r.stderr or r.stdout).strip()}")
    return r.stdout


def adb_appareil(serie):
    lignes = [ligne.split() for ligne in adb(None, "devices").splitlines()[1:] if ligne.strip()]
    prets = [ligne[0] for ligne in lignes if len(ligne) > 1 and ligne[1] == "device"]
    autres = [" ".join(ligne) for ligne in lignes if len(ligne) > 1 and ligne[1] != "device"]
    if serie and serie not in prets or not prets:
        raise RuntimeError("aucun téléphone prêt pour adb" + (f" ({', '.join(autres)} : autoriser le débogage "
                           "USB sur le téléphone)" if autres else " (câble, débogage USB activé ?)"))
    if not serie and len(prets) > 1:
        raise RuntimeError(f"plusieurs appareils ({', '.join(prets)}) : préciser --serie")


# --- smoke -----------------------------------------------------------

def commande_smoke(args):
    base = args.url.rstrip("/") + "/"
    echecs = 0

    def verifier(nom, ok, detail=""):
        nonlocal echecs
        echecs += not ok
        dire(f"  [{'ok ' if ok else 'KO '}] {nom} {detail}")

    code, _, corps = http(base)
    if code == 0:
        dire(f"ECHEC : rien ne répond sur {base} (serve lancé ?)")
        return 1
    verifier("page", code == 200 and b"<title>Cartographe</title>" in corps, f"-> {code}")
    mode = "développement" if serveur_de_dev(base) else "build (preview ou hébergé)"
    dire(f"  serveur : {mode}")
    for nom in FICHIERS_GEO:
        code, _, corps = http(base + "geo/" + nom)
        try:
            json.loads(corps)
            valide = True
        except ValueError:
            valide = False
        verifier(f"geo/{nom}", code == 200 and valide, f"-> {code}, {len(corps)} octets, JSON {'valide' if valide else 'INVALIDE'}")
    with Session("local") as s:
        p = s.page
        p.emuler(TELEPHONE, tactile=True)
        debut = time.monotonic()
        try:
            p.goto(base + "?mesures=0")
            periode = p.attendre_carte(args.budget)
            verifier("carte peinte", True, f"en {time.monotonic() - debut:.1f} s, période {periode} ms")
            n = p.js("[document.querySelectorAll('path.pays').length, document.querySelectorAll('circle.pastille').length,"
                     " window.cartographe.version, document.querySelector('#carte').dataset.rendu]")
            verifier("tracés des pays", n[0] > 150, f"{n[0]} path.pays, {n[1]} pastilles visibles, version {n[2]}, rendu {n[3]}")
        except RuntimeError as e:
            verifier("carte peinte", False, str(e))
        verifier("aucune erreur JS", not p.erreurs, "; ".join(p.erreurs)[:300])
        verifier("aucune requête en échec", not p.echecs, "; ".join(p.echecs)[:300])
    dire("\nsmoke : " + ("OK" if not echecs else f"{echecs} échec(s)"))
    return 1 if echecs else 0


# --- ui --------------------------------------------------------------

def position(page, ident):
    """Point de la fenêtre où toucher `ident` : le centre de sa pastille
    dessinée (lu dans le DOM), sinon cartographe.carte.ecran()."""
    return page.js(f"""(() => {{
        const c = document.querySelector('circle.pastille[data-id="{ident}"]');
        if (c) {{ const r = c.getBoundingClientRect(); return {{x: r.x + r.width / 2, y: r.y + r.height / 2, via: 'pastille'}}; }}
        const p = window.cartographe.carte.ecran("{ident}");
        return p && {{x: p.x, y: p.y, via: 'carte'}};
    }})()""")


def commande_ui(args):
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    telephone = args.width < 700
    ecran = dict(TELEPHONE, largeur=args.width) if telephone else dict(PC, largeur=args.width)
    base = args.url.rstrip("/") + "/"
    faites = []
    with Session("local") as s:
        p = s.page
        p.emuler(ecran, tactile=telephone)

        def capturer(nom):
            chemin = out / f"{nom}.png"
            p.pause(350)
            p.capture(chemin)
            faites.append(chemin)

        p.goto(base + "?mesures=0#carte")
        p.attendre_carte()
        capturer("1-carte")
        p.js('window.cartographe.carte.zoomerSur("CHE")')
        pt = position(p, "CHE")
        p.toucher(pt["x"], pt["y"])
        p.pause(300)
        dire(f"  pays touché : {p.js('document.getElementById(\"barre-carte\").textContent')!r}")
        capturer("2-pays-touche")
        p.js('location.hash = "#toucher"')
        p.pause(300)
        p.js("window.cartographe.carte.zoomer({k: 1, x: 0, y: 0})")
        cible = p.js('document.querySelector(".essai-consigne").dataset.cible')
        faux = "CAN" if cible == "BRA" else "BRA"
        pt = position(p, faux)
        p.toucher(pt["x"], pt["y"])
        p.pause(300)
        dire(f"  Toucher, faux : {p.js('document.querySelector(\".essai-retro\").textContent')!r}")
        capturer("3-toucher-faux")
        pt = position(p, cible)
        p.toucher(pt["x"], pt["y"])
        p.pause(200)
        dire(f"  Toucher, juste ({cible}) : {p.js('document.querySelector(\".essai-retro\").textContent')!r}")
        capturer("4-toucher-juste")
        p.js('location.hash = "#saisie"')
        p.pause(300)
        p.js('document.getElementById("saisie-regle").focus()')
        p.cdp("Input.insertText", text="sai")
        p.pause(200)
        dire(f"  Saisie « sai » : {p.js('[...document.querySelectorAll(\"#saisie-liste li\")].map(l => l.textContent)')}")
        capturer("5-saisie")
        p.js('location.hash = "#carte"')
        p.pause(200)
        p.js('document.getElementById("settings-btn").click()')
        capturer("6-reglages")
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    dire(f"  {len(faites)} captures ({ecran['largeur']}×{ecran['hauteur']}, DPR {ecran['dpr']}) dans {out} — "
         "à regarder : carte vide, pays non marqué ou texte coupé = échec")
    return 1 if erreurs else 0


# --- mesurer -----------------------------------------------------------

# Scénario de gestes (celui des premières mesures de l'agent de la carte,
# pour comparer) : écarts des doigts en px pour pincer, déplacement pour
# glisser, autour du centre de la carte. zoomerSur et zoomer ne comptent pas
# comme gestes. À la fin, le tour du monde : au zoom 2, trois longs glissés
# horizontaux de 300 px (de la droite vers la gauche de l'écran), soit plus
# d'un tour en Canvas (la carte tourne : 360° ≈ 2 × la largeur de l'ovale au
# zoom 2) ; en SVG, la carte plane va jusqu'à son bord et s'y arrête. La
# carte reste tournée pour les touchers qui suivent (Canvas) : ils éprouvent
# carte.ecran(id) et pick sur une carte tournée.
SCENARIO = [
    ("pincer", 60, 260), ("glisser", -150, 40), ("glisser", 150, -40), ("pincer", 80, 300),
    ("glisser", -120, 120), ("pincer", 300, 80), ("pincer", 300, 60), ("zoomerSur", "DEU"),
    ("glisser", 160, 0), ("glisser", -160, 100), ("pincer", 100, 250), ("pincer", 250, 80),
    ("zoomer", 2), ("tourner", -300, 0), ("tourner", -300, 0), ("tourner", -300, 0),
]
DUREE_GLISSER_MS, DUREE_PINCER_MS, DUREE_TOURNER_MS = 640, 480, 960
# Nom de chaque geste du scénario (« tourner » est un glissé pour la page).
NOMS_GESTES = [g[0] for g in SCENARIO if g[0] in ("pincer", "glisser", "tourner")]
TYPE_PAGE = {"pincer": "pincer", "glisser": "glisser", "tourner": "glisser"}
# Touchers : (vue, centre, zoom, pays). Micro-États et Caraïbes au zoom 1
# (centres des pastilles), puis zoomés.
TOUCHERS = [
    ("monde", None, 1, ["BRA", "RUS", "FRA", "MCO", "VAT", "SMR", "LIE", "AND", "MLT", "SGP", "BHR", "MDV",
                        "JAM", "GRD", "KNA", "ATG", "DMA", "LCA", "VCT", "BRB", "TTO", "FJI"]),
    ("Italie", "ITA", None, ["VAT", "SMR", "ITA", "MLT"]),
    ("Caraïbes", "LCA", 8, ["JAM", "HTI", "DOM", "KNA", "ATG", "DMA", "LCA", "VCT", "BRB", "GRD", "TTO"]),
]


def centrer(page, ident, k):
    """Zoom k, centré sur le point de toucher de `ident`. En Canvas, le x qui
    ne centre pas l'ovale devient une rotation (zoomer, src/main.ts) : le pays
    vient au centre par le méridien central."""
    page.js(f"""(() => {{ const c = window.cartographe.carte; c.zoomer({{k: 1, x: 0, y: 0}});
        const r = c.rect(), p = c.ecran("{ident}"), x = p.x - r.x, y = p.y - r.y;
        c.zoomer({{k: {k}, x: r.largeur / 2 - {k} * x, y: r.hauteur / 2 - {k} * y}}); }})()""")


def zoomer_au_centre(page, k):
    """Zoom k autour du centre de la carte (rotation gardée en Canvas)."""
    page.js(f"""(() => {{ const c = window.cartographe.carte, r = c.rect(); c.zoomer({{k: 1, x: 0, y: 0}});
        c.zoomer({{k: {k}, x: r.largeur / 2 * (1 - {k}), y: r.hauteur / 2 * (1 - {k})}}); }})()""")


# Cadence de rejeu sur le téléphone : au moins celle d'un écran 120 Hz (Galaxy
# A37). Son écran peut tenir 60 Hz au repos et passer à 120 Hz pendant un
# geste : rejoué à la seule période du repos, un doigt à 60 Hz n'en ferait
# qu'une image sur deux, et le geste ne dirait rien du 120 Hz. Sur le PC
# (headless, 60 Hz fixe), la période du repos, comme les mesures d'avant.
PAS_TELEPHONE_MS = 1000 / 120


def pas_de_rejeu(periode, cible):
    return min(periode, PAS_TELEPHONE_MS) if cible != "local" else periode


def une_mesure(page, url, journal, cible):
    """Un chargement, le scénario de gestes, les touchers ; rend le rapport
    de la page, la liste des touchers visés, les durées réelles des gestes,
    le pas de rejeu et la transformation après le tour du monde."""
    page.goto(url)
    periode = pas_de_rejeu(page.attendre_carte() or 1000 / 60, cible)
    page.js("window.cartographe.reinitialiser()")
    r = page.js("window.cartographe.carte.rect()")
    cx, cy = r["x"] + r["largeur"] / 2, r["y"] + r["hauteur"] / 2
    duree_reelle = []
    for geste in SCENARIO:
        if geste[0] == "zoomerSur":
            page.js(f'window.cartographe.carte.zoomerSur("{geste[1]}")')
            page.pause(500)
            continue
        if geste[0] == "zoomer":
            zoomer_au_centre(page, geste[1])
            page.pause(500)
            continue
        quoi, a, b = geste
        duree = {"glisser": DUREE_GLISSER_MS, "pincer": DUREE_PINCER_MS, "tourner": DUREE_TOURNER_MS}[quoi]
        n = max(10, round(duree / periode))
        if quoi == "glisser":
            positions = [[(cx + a * i / n, cy + b * i / n)] for i in range(n + 1)]
        elif quoi == "tourner":
            # Centré sur le centre de la carte : 300 px tiennent dans l'écran.
            positions = [[(cx - a / 2 + a * i / n, cy - b / 2 + b * i / n)] for i in range(n + 1)]
        else:
            ecart = lambda i: a + (b - a) * i / n
            positions = [[(cx - ecart(i) / 2, cy), (cx + ecart(i) / 2, cy)] for i in range(n + 1)]
        duree_reelle.append(round(page.geste(positions, periode), 1))
        page.pause(500)
    apres_tour = page.js("window.cartographe.carte.transfo()")
    vises = []
    for nom, centre, k, pays in TOUCHERS:
        if centre is None:
            page.js(f"window.cartographe.carte.zoomer({{k: {k}, x: 0, y: 0}})")
        elif k is None:
            page.js(f'window.cartographe.carte.zoomerSur("{centre}")')
        else:
            centrer(page, centre, k)
        page.pause(400)
        zone = page.js("window.cartographe.carte.rect()")
        t = page.js("window.cartographe.carte.transfo()")
        for ident in pays:
            pt = position(page, ident)
            dedans = pt and zone["x"] <= pt["x"] <= zone["x"] + zone["largeur"] and zone["y"] <= pt["y"] <= zone["y"] + zone["hauteur"]
            if not dedans:
                journal.append(f"{ident} hors de la carte ({nom}), pas touché")
                continue
            page.toucher(pt["x"], pt["y"])
            vises.append({"vue": nom, "zoom": round(t["k"], 2), "id": ident, "via": pt["via"],
                          "x": round(pt["x"], 1), "y": round(pt["y"], 1),
                          **({"rotation": round(t["r"], 1)} if t.get("r") is not None else {})})
            page.pause(450)
    # Les entrées Event Timing arrivent quelques images après la présentation :
    # au moins 0,5 s après le dernier geste (src/mesure/rapport.ts).
    page.pause(800)
    rapport = page.js("window.cartographe.rapport()")
    if len(rapport["touchers"]) != len(vises):
        journal.append(f"{len(vises)} touchers envoyés, {len(rapport['touchers'])} reçus par la page")
    for v, t in zip(vises, rapport["touchers"]):
        v["pick"] = (t.get("pick") or {}).get("id")
        v["juste"] = v["pick"] == v["id"]
    return rapport, vises, duree_reelle, round(periode, 2), apres_tour


def _med(valeurs):
    valeurs = [v for v in valeurs if v is not None]
    return round(statistics.median(valeurs), 1) if valeurs else None


def noms_des_gestes(r, journal=None):
    """Le nom de chaque geste du rapport dans le scénario (« tourner » pour le
    tour du monde, que la page appelle glisser) ; à défaut (un geste sans
    mouvement n'est pas rapporté : décompte différent), son type."""
    types = [g["type"] for g in r["gestes"]]
    if types == [TYPE_PAGE[n] for n in NOMS_GESTES]:
        return list(NOMS_GESTES)
    if journal is not None:
        journal.append(f"{len(types)} gestes rapportés pour {len(NOMS_GESTES)} rejoués : rangés par type")
    return types


def _verdict(*oks):
    """False si l'un est faux, None si l'un est à juger, sinon True."""
    return False if any(o is False for o in oks) else None if any(o is None for o in oks) else True


def resumer(rapports, vises, journal=None):
    """Résumé face aux critères du J0, sur toutes les répétitions (rapports v4,
    ou v3 relus par `resumer`,
    src/mesure/rapport.ts : chaque règle ci-dessous y est décrite)."""
    chargements = [r["chargement"]["total_ms"] for r in rapports if r.get("chargement")]
    periode = _med([r["ecran"]["periode_ms"] for r in rapports]) or 1000 / 60
    # Période de l'écran pour la tenue : la plus courte vue au repos ou
    # pendant un geste, sur tout le fichier (8,33 ms dès que l'écran tient
    # 120 Hz quelque part), pour juger toutes les lignes sur la même base.
    ecran = [st.get("periode_geste_ms") for r in rapports for g in r["gestes"]
             if g["type"] in ("glisser", "pincer") for st in [g["stats"]]]
    ecran += [r["ecran"]["periode_ms"] for r in rapports]
    periode_ecran = min((x for x in ecran if x), default=periode)
    gestes = {}
    for r in rapports:
        for g, quoi in zip(r["gestes"], noms_des_gestes(r, journal)):
            if g["type"] not in ("glisser", "pincer"):
                continue
            rendu = g.get("rendu", r["rendu"])
            # Un fichier = un rendu ; la clé le garde quand même (rapports mêlés).
            cle = quoi if rendu == r["rendu"] else f"{quoi} ({rendu})"
            e = gestes.setdefault(cle, {"rendu": rendu, "gestes": 0, "intervalles": 0, "saccades": 0,
                                        "duree_ms": 0, "tenues": 0, "perdues": 0,
                                        "perdues_repos": 0, "bascule_images": 0, "max_ms": 0, "p95_ms": [],
                                        "longues_images": 0, "periodes_ms": [],
                                        "ecarts_periode": {"plus_rapide": 0, "plus_lent": 0},
                                        "dessins": [], "fin_et": [], "fin_et_en_attente": 0,
                                        "fin_et_absente": 0, "fin_et_artefacts": [], "fin_image": []})
            st = g["stats"]
            iv = g["intervalles_ms"]
            e["gestes"] += 1
            e["intervalles"] += len(iv)
            e["saccades"] += sum(est_saccade(d) for d in iv)
            e["duree_ms"] += sum(iv)
            e["tenues"] += sum(d <= FACTEUR_PERDUE * periode_ecran for d in iv)
            # Informatifs (plus la base du verdict depuis le rapport v4) :
            # perdues sur la période du geste (bascule de tête sur celle du
            # repos), perdues_repos sur celle du repos (stats.ts, statsGeste).
            e["perdues"] += st["perdues"]
            e["perdues_repos"] += st.get("perdues_repos", 0)
            # Bascule de tête : seulement si l'écran accélère vraiment. La page
            # en v3 en comptait aussi quand la période du geste était à peine
            # sous celle du repos (16,67 contre 16,7 ms) : des images perdues
            # en tête, pas une bascule (corrigé en v4, filtre gardé pour la v3).
            if st.get("ecart_sens") == "plus_rapide":
                e["bascule_images"] += st.get("bascule_images", 0)
            e["max_ms"] = max(e["max_ms"], st["max_ms"] or 0)
            e["p95_ms"].append(st["p95_ms"])
            e["periodes_ms"].append(st.get("periode_geste_ms"))
            if st.get("ecart_sens"):
                e["ecarts_periode"][st["ecart_sens"]] += 1
            e["longues_images"] += g["longues_images"]["nombre"]
            d = g.get("dessin_ms")
            if d:
                # Rendu Canvas : le script de chaque image du geste, face à la
                # période de ce geste (celle du repos à défaut).
                e["dessins"].append({**d, "periode_ms": st.get("periode_geste_ms") or st.get("periode_repos_ms") or periode})
            f = g["fin"]
            etat, fin = f.get("event_timing_etat"), f.get("event_timing_ms")
            if fin is not None:
                # Artefact prouvé (rapport.ts, Geste.fin) : en g, une fin qui ne
                # change aucun pixel n'a d'entrée close qu'à l'image suivante,
                # quelle qu'elle soit. Close par l'entrée suivante, fil
                # principal court, aucune longue image : écartée, montrée. En
                # css la fin repeint toujours : jamais écartée.
                artefact = (rendu == "g" and f.get("close_par_entree_suivante") is True
                            and f.get("image_ms") is not None and f["image_ms"] < ARTEFACT_IMAGE_MS
                            and not g["longues_images"]["nombre"])
                e["fin_et_artefacts" if artefact else "fin_et"].append(fin)
            elif etat == "sous_seuil":
                e["fin_et"].append(SEUIL_EVENT_TIMING_MS)  # une entrée postérieure est arrivée : sous le seuil de l'API
            elif etat == "en_attente":
                e["fin_et_en_attente"] += 1  # image peut-être pas encore présentée : durée inconnue, jamais 16
            else:
                e["fin_et_absente"] += 1
            e["fin_image"].append(f["image_ms"])
    for e in gestes.values():
        n = e["intervalles"]
        e["part_saccades"] = round(e["saccades"] / n, 3) if n else None
        duree, tenues = e.pop("duree_ms"), e.pop("tenues")
        e["tenue"] = {"periode_ecran_ms": periode_ecran, "part": round(tenues / n, 3) if n else None,
                      "cadence_ips": round(n * 1000 / duree, 1) if duree else None}
        e["part_perdues"] = round(e["perdues"] / e["intervalles"], 3) if e["intervalles"] else None
        e["part_perdues_repos"] = round(e["perdues_repos"] / e["intervalles"], 3) if e["intervalles"] else None
        e["p95_ms"] = _med(e["p95_ms"])
        periodes = [x for x in e.pop("periodes_ms") if x is not None]
        e["periode_ms"] = {"mediane": _med(periodes), "min": min(periodes, default=None),
                           "max": max(periodes, default=None)}
        # Saccade : ≥ 25 ms, sans période estimée (une cadence plus lente que
        # l'écran n'en est pas une : elle se lit dans la tenue, sans verdict).
        e["saccade_ok"] = sans_saccade(e["saccades"], n, e["max_ms"])
        dessins = e.pop("dessins")
        au_dessus = sum(d["p95"] >= d["periode_ms"] for d in dessins)
        e["dessin_ms"] = None if not dessins else {
            "gestes": len(dessins), "images": sum(d["images"] for d in dessins),
            "mediane": _med([d["mediane"] for d in dessins]), "p95": _med([d["p95"] for d in dessins]),
            "p95_max": max(d["p95"] for d in dessins), "max": max(d["max"] for d in dessins),
            "periode_ms": _med([d["periode_ms"] for d in dessins]),
            "p95_au_dessus_periode": au_dessus, "ok": not au_dessus}
        fins = e.pop("fin_et")
        e["fin_event_timing_ms"] = {"mediane": _med(fins), "max": max(fins, default=None), "n": len(fins),
                                    "en_attente": e.pop("fin_et_en_attente"),
                                    "sans_entree": e.pop("fin_et_absente"),
                                    "artefacts": e.pop("fin_et_artefacts")}
        f = e["fin_event_timing_ms"]
        f["ok"] = (False if fins and max(fins) >= CRITERE_FIN_GESTE_MS
                   else None if not fins or f["en_attente"] or f["sans_entree"] else True)
        images = [x for x in e.pop("fin_image") if x is not None]
        e["fin_image_ms"] = {"mediane": _med(images), "max": max(images, default=None)}
    # Toucher : Event Timing partout (de l'entrée à l'image présentée).
    # 'sous_seuil' = l'API n'a rien gardé, donc sous 16 ms : compté 16 (borne
    # haute). 'non_pris_en_charge' : repli sur fin_fil_principal_ms, signalé,
    # car il s'arrête avant rastérisation et présentation (sous-estime).
    latences, mesures, sous_seuil, repli, fil = [], [], 0, 0, []
    for r in rapports:
        for t in r["touchers"]:
            etat = t.get("event_timing_etat")
            if t.get("fin_fil_principal_ms") is not None:
                fil.append(t["fin_fil_principal_ms"])
            if etat == "mesure" and t.get("event_timing"):
                latences.append(t["event_timing"]["duree_ms"])
                mesures.append(t["event_timing"]["duree_ms"])
            elif etat == "sous_seuil":
                latences.append(SEUIL_EVENT_TIMING_MS)
                sous_seuil += 1
            elif t.get("fin_fil_principal_ms") is not None:
                latences.append(t["fin_fil_principal_ms"])
                repli += 1
    justes = sum(v.get("juste", False) for v in vises)
    faux = sorted({f"{v['id']}→{v.get('pick')} ({v['vue']})" for v in vises if not v.get("juste")})
    ecarts = {s: sum(e["ecarts_periode"][s] for e in gestes.values()) for s in ("plus_rapide", "plus_lent")}
    dessins = [e["dessin_ms"]["ok"] for e in gestes.values() if e["dessin_ms"]]
    fins = [e["fin_event_timing_ms"] for e in gestes.values()]
    return {
        "periode_ms": periode,
        "chargement_ms": {"mediane": _med(chargements), "min": min(chargements, default=None),
                          "max": max(chargements, default=None), "n": len(chargements),
                          "ok": bool(chargements) and max(chargements) < CRITERE_RENDU_MS},
        "gestes": gestes,
        "ecarts_periode": ecarts,
        "periode_ecran_ms": periode_ecran,
        # True ou False (None sans geste) : la tenue n'a pas de verdict.
        "saccade_ok": _verdict(*(e["saccade_ok"] for e in gestes.values())) if gestes else None,
        # None sans dessin rapporté (rendus SVG) : sans objet.
        "dessin_ok": _verdict(*dessins) if dessins else None,
        # True, False, ou None : à juger (fin en attente ou sans entrée).
        "fin_geste_ok": (_verdict(*(e["fin_event_timing_ms"]["ok"] for e in gestes.values()))
                         if gestes else False),
        # Fins en attente sur toutes les lignes : si elles dominent sur le
        # téléphone, le critère de fin est muet (SKILL.md, « fin de geste »).
        "fins": {"total": sum(f["n"] + f["en_attente"] + f["sans_entree"] + len(f["artefacts"]) for f in fins),
                 "en_attente": sum(f["en_attente"] for f in fins)},
        "touchers": {"n": len(latences), "verdict_sur": "event_timing",
                     "event_timing_ms": {"mediane": _med(latences), "max": max(latences, default=None),
                                         "mesures": len(mesures), "sous_seuil": sous_seuil, "repli": repli},
                     "fin_fil_principal_ms": {"mediane": _med(fil), "max": max(fil, default=None)},
                     "ok": bool(latences) and max(latences) < CRITERE_TOUCHER_MS,
                     "justes": justes, "vises": len(vises), "faux": faux},
    }


def afficher_resume(res, entete):
    ok = lambda b: " ? " if b is None else "OK " if b else "NON"
    dire(f"\n=== {entete} ===")
    dire(f"période de l'écran au repos : {res['periode_ms']} ms ({1000 / res['periode_ms']:.0f} Hz)")
    c = res["chargement_ms"]
    dire(f"[{ok(c['ok'])}] rendu < {CRITERE_RENDU_MS} ms : médiane {c['mediane']}, de {c['min']} à {c['max']} "
         f"({c['n']} chargements)")
    dire(f"[{ok(res['saccade_ok'])}] pas de saccade (à-coup visible même à 60 images/s : intervalle ≥ "
         f"{SEUIL_SACCADE_MS:g} ms ; [NON] au-delà de {SACCADE_PART:.0%} d'entre eux ou d'un intervalle > "
         f"{SACCADE_MAX_MS} ms) :")
    for quoi, e in res["gestes"].items():
        dire(f"      {quoi:8} [{ok(e['saccade_ok'])}] {e['gestes']:2} gestes, {e['saccades']}/{e['intervalles']} "
             f"intervalles ≥ {SEUIL_SACCADE_MS:g} ms ({(e['part_saccades'] or 0):.1%}), le plus long {e['max_ms']} ms, "
             f"p95 {e['p95_ms']} ms, {e['longues_images']} longue(s) image(s)")
    ec = res["ecarts_periode"]
    # Sans verdict : pour comparer les rendus (la cadence en images/s d'abord,
    # monotone ; la part tenue suit l'estimation de la période des gestes).
    dire(f"[ — ] tenue de la cadence de l'écran pendant les gestes (sans verdict) : période de l'écran "
         f"{res['periode_ecran_ms']} ms ({1000 / res['periode_ecran_ms']:.0f} Hz), repos {res['periode_ms']} ms"
         + ("" if not ec["plus_rapide"] and not ec["plus_lent"] else
            f" ; {ec['plus_rapide']} geste(s) plus rapides que le repos (l'écran accélère), {ec['plus_lent']} plus "
            "lents (cadence de l'appli sous celle de l'écran au repos)"))
    for quoi, e in res["gestes"].items():
        pg, ee, t = e["periode_ms"], e["ecarts_periode"], e["tenue"]
        dire(f"      {quoi:8} {t['cadence_ips']} images/s, {(t['part'] or 0):.1%} des intervalles à "
             f"{t['periode_ecran_ms']} ms ; période des gestes : médiane {pg['mediane']} ms (de {pg['min']} à "
             f"{pg['max']}) ; {ee['plus_rapide']} plus rapide(s), {ee['plus_lent']} plus lent(s)"
             + (f", {e['bascule_images']} image(s) de bascule en tête" if e["bascule_images"] else "")
             + (f" ; perdues (indicatif) : {e['perdues']} sur la période du geste, {e['perdues_repos']} sur celle "
                "du repos"))
    if res["dessin_ok"] is None:
        dire("[ — ] dessin des images < période de l'écran : sans objet (rendu SVG, aucun dessin rapporté)")
    else:
        dire(f"[{ok(res['dessin_ok'])}] dessin des images < période de l'écran (95e centile du script de chaque "
             "image, par geste ; ni rastérisation ni présentation) :")
        for quoi, e in res["gestes"].items():
            d = e["dessin_ms"]
            if d:
                dire(f"      {quoi:8} [{ok(d['ok'])}] {d['images']} images sur {d['gestes']} gestes : médiane "
                     f"{d['mediane']}, p95 {d['p95']} (max des p95 {d['p95_max']}), max {d['max']} ms ; période "
                     f"{d['periode_ms']} ms, {d['p95_au_dessus_periode']} geste(s) au-dessus")
    fa = res["fins"]
    dire(f"[{ok(res['fin_geste_ok'])}] fin de geste < {CRITERE_FIN_GESTE_MS} ms (Event Timing de l'événement qui "
         "le finit, jusqu'à la présentation)"
         + (f" ; {fa['en_attente']}/{fa['total']} fins en attente"
            + (" : la MAJORITÉ, critère muet (SKILL.md, « fin de geste »)" if 2 * fa["en_attente"] > fa["total"] else "")
            if fa["en_attente"] else "") + " :")
    for quoi, e in res["gestes"].items():
        f, i = e["fin_event_timing_ms"], e["fin_image_ms"]
        dire(f"      {quoi:8} rendu {e['rendu']} : médiane {f['mediane']}, max {f['max']} ms ({f['n']} fins)"
             + (f" ; {f['en_attente']} en attente (image peut-être pas présentée : à juger)" if f["en_attente"] else "")
             + (f" ; {f['sans_entree']} sans entrée" if f["sans_entree"] else "")
             + (f" ; {len(f['artefacts'])} écartée(s), artefact du rendu g (close par l'entrée suivante) : "
                f"{', '.join(str(x) for x in f['artefacts'])} ms" if f["artefacts"] else "")
             + f" ; fil principal seul (image_ms) : médiane {i['mediane']}, max {i['max']} ms")
    t = res["touchers"]
    et, m = t["event_timing_ms"], t["fin_fil_principal_ms"]
    dire(f"[{ok(t['ok'])}] toucher → réponse < {CRITERE_TOUCHER_MS} ms ({t['n']} touchers, Event Timing) :")
    dire(f"      Event Timing : médiane {et['mediane']}, max {et['max']} ms ({et['mesures']} mesurés, "
         f"{et['sous_seuil']} sous son seuil de {SEUIL_EVENT_TIMING_MS} ms, comptés {SEUIL_EVENT_TIMING_MS})")
    if et["repli"]:
        dire(f"      REPLI : {et['repli']} toucher(s) sans Event Timing (navigateur sans l'API), jugés sur la fin "
             "du fil principal, qui sous-estime (ni rastérisation ni présentation)")
    dire(f"      fin du fil principal (indicatif, avant rastérisation) : médiane {m['mediane']}, max {m['max']} ms")
    dire(f"[{ok(t['justes'] == t['vises'])}] pays touchés justes : {t['justes']}/{t['vises']}"
         + (f" ; faux : {', '.join(t['faux'])}" if t["faux"] else ""))


def code_mesure(cible, serie):
    """Quel code est mesuré : commit, arbre propre ou modifié ; pour la
    WebView, l'APK installé (date de mise à jour sur le téléphone) et celui du
    disque (date du fichier). Le site servi est censé venir de cet arbre
    (serve --preview le construit au lancement : le relancer après un
    changement)."""
    git = lambda *a: subprocess.run(["git", *a], cwd=RACINE, capture_output=True, text=True).stdout
    # Les rapports de mesure eux-mêmes ne comptent pas : ce sont des sorties,
    # pas le code mesuré (sinon une série de mesures marque l'arbre modifié).
    modifies = [ligne for ligne in git("status", "--porcelain").splitlines()
                if not ligne[3:].startswith(str(MESURES.relative_to(RACINE)) + "/")]
    code = {"commit": git("rev-parse", "--short", "HEAD").strip() or None, "arbre_modifie": bool(modifies),
            "fichiers_modifies": modifies[:20]}
    if cible == "webview":
        installe = None
        try:
            for ligne in adb(serie, "shell", "dumpsys", "package", APPID, verifier=False).splitlines():
                if "lastUpdateTime=" in ligne:
                    installe = ligne.split("=", 1)[1].strip()
                    break
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
        fichier = (datetime.datetime.fromtimestamp(APK.stat().st_mtime).astimezone().isoformat(timespec="seconds")
                   if APK.exists() else None)
        code["apk"] = {"installe_le": installe, "fichier_du": fichier}
    return code


def commande_mesurer(args):
    if args.cible != "local" and args.ralenti != 1:
        sys.exit("--ralenti ne vaut que pour --cible local (le téléphone tourne à sa vitesse)")
    url_base = args.url or ("https://localhost/" if args.cible == "webview" else URL_DEFAUT)
    sep = "&" if "?" in url_base else "?"
    url = f"{url_base}{sep}rendu={args.rendu}&projection={args.projection}&mesures=0"
    if args.cible != "webview" and http(url_base)[0] == 0:
        dire(f"ECHEC : rien ne répond sur {url_base} (serve --preview lancé ?)")
        return 1
    if args.cible == "local" and serveur_de_dev(url_base):
        dire("  attention : serveur de développement, chargement plus lent qu'en build (serve --preview)")
    rapports, vises, journal, durees, pas_ms, apres_tour = [], [], [], [], [], []
    code = code_mesure(args.cible, args.serie)
    with Session(args.cible, serie=args.serie, ws_local=args.ws) as s:
        p = s.page
        s.reverse(url_base)
        if args.cible == "local":
            p.emuler(TELEPHONE, tactile=True, ralenti=args.ralenti)
        else:
            p.tactile = True
        p.cdp("Network.setCacheDisabled", cacheDisabled=not args.cache)
        dire(f"navigateur : {s.navigateur}" + (f" ({chromium_binaire()})" if args.cible == "local" else ""))
        dire(f"code : {code['commit']}{' (arbre modifié)' if code['arbre_modifie'] else ''}"
             + (f" ; APK du {code['apk']['installe_le']}" if code.get("apk") else ""))
        dire(f"url : {url} ; ralenti ×{args.ralenti:g} ; cache {'actif' if args.cache else 'désactivé'}")
        for i in range(args.repetitions):
            debut = time.monotonic()
            rapport, v, d, pas, tour = une_mesure(p, url, journal, args.cible)
            if rapport.get("v") != VERSION_RAPPORT:
                raise RuntimeError(f"rapport v{rapport.get('v')} de la page, le driver lit la v{VERSION_RAPPORT} "
                                   "(src/mesure/rapport.ts) : site à reconstruire ?")
            if rapport.get("rendu") != args.rendu:
                raise RuntimeError(f"la page dit rendu {rapport.get('rendu')!r}, demandé {args.rendu!r} : "
                                   "site à reconstruire ?")
            rapports.append(rapport)
            vises.extend(v)
            durees.append(d)
            pas_ms.append(pas)
            apres_tour.append(tour)
            dire(f"  répétition {i + 1}/{args.repetitions} : chargement {rapport['chargement']['total_ms']} ms, "
                 f"{len(rapport['gestes'])} gestes, {len(rapport['touchers'])} touchers ({time.monotonic() - debut:.0f} s)")
        erreurs = p.erreurs + p.echecs
    res = resumer(rapports, vises, journal)  # avant les notes : il en ajoute (gestes rangés par type)
    for ligne in sorted(set(journal)):
        dire(f"  note : {ligne}")
    for e in erreurs:
        dire(f"  erreur de la page : {e}")
    afficher_resume(res, f"{args.cible}, rendu {args.rendu}, {args.projection}, ralenti ×{args.ralenti:g}")
    jour = datetime.date.today().isoformat()
    nom = f"{jour}-{args.cible}-{args.rendu}-{args.projection}" + (f"-x{args.ralenti:g}" if args.ralenti != 1 else "")
    sortie = pathlib.Path(args.out).resolve() if args.out else MESURES
    sortie.mkdir(parents=True, exist_ok=True)
    fichier = sortie / f"{nom}.json"
    fichier.write_text(json.dumps({
        "v": VERSION_RAPPORT,
        "outil": ".claude/skills/run-cartographe/driver.py mesurer",
        "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "code": code,
        "cible": args.cible, "navigateur": s.navigateur,
        "binaire": str(chromium_binaire()) if args.cible == "local" else None,
        "url": url, "ralenti": args.ralenti,
        "cache": args.cache, "repetitions": args.repetitions,
        "ecran_emule": TELEPHONE if args.cible == "local" else None,
        "scenario": {"gestes": SCENARIO, "duree_glisser_ms": DUREE_GLISSER_MS, "duree_pincer_ms": DUREE_PINCER_MS,
                     "duree_tourner_ms": DUREE_TOURNER_MS, "transfo_apres_tour": apres_tour,
                     "cadence": "un touchMove par période de l'écran au repos (window.cartographe.repos) ; "
                                "sur le téléphone, au plus 8,33 ms (120 Hz)",
                     "pas_ms": pas_ms, "durees_reelles_ms": durees, "touchers": TOUCHERS},
        "criteres": {"rendu_ms": CRITERE_RENDU_MS, "toucher_ms": CRITERE_TOUCHER_MS,
                     "fin_geste_ms": CRITERE_FIN_GESTE_MS, "ecart_periode": 0.25,
                     "fin_artefact": {"rendu": "g", "close_par_entree_suivante": True,
                                      "image_ms_sous": ARTEFACT_IMAGE_MS, "longues_images": 0},
                     "dessin": "p95 du script de chaque image < période du geste, sur chaque geste",
                     "saccade": CRITERE_SACCADE},
        "resume": res,
        "touchers_vises": vises,
        "notes": sorted(set(journal)),
        "erreurs_page": erreurs,
        "rapports": rapports,
    }, ensure_ascii=False, indent=1) + "\n")
    dire(f"\nrapport : {fichier}")
    return 1 if erreurs else 0


def commande_resumer(args):
    """Recalcule le résumé d'un JSON de `mesurer` sur ses rapports bruts
    (rapports v3 ou v4, touchers visés), aux critères actuels du driver : un
    critère qui change n'oblige pas à refaire les mesures. Réécrit le fichier,
    rapports bruts intacts, et note le recalcul dans `resume_recalcule`."""
    for chemin in args.fichiers:
        fichier = pathlib.Path(chemin)
        d = json.loads(fichier.read_text())
        versions = {r.get("v") for r in d["rapports"]}
        if not versions <= {3, VERSION_RAPPORT}:
            dire(f"ECHEC : {fichier} : rapports v{sorted(versions)}, le driver relit la v3 et la v{VERSION_RAPPORT}")
            return 1
        journal = []
        res = resumer(d["rapports"], d["touchers_vises"], journal)
        d["resume"] = res
        d["criteres"]["saccade"] = CRITERE_SACCADE
        d["notes"] = sorted(set(d.get("notes", [])) | set(journal))
        d["resume_recalcule"] = {
            "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "outil": ".claude/skills/run-cartographe/driver.py resumer",
            "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=RACINE,
                                     capture_output=True, text=True).stdout.strip() or None,
            # Le driver qui a recalculé diffère-t-il de ce commit (pas encore commité) ?
            "driver_modifie": subprocess.run(["git", "diff", "--quiet", "HEAD", "--", __file__],
                                             cwd=RACINE).returncode != 0,
            "pourquoi": args.pourquoi}
        if not args.sec:
            fichier.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        afficher_resume(res, f"{fichier.name} (recalculé{', non écrit' if args.sec else ''})")
    return 0


# --- apk ---------------------------------------------------------------

def commande_apk(args):
    env = dict(os.environ, JAVA_HOME=JAVA_HOME)
    env.setdefault("ANDROID_HOME", str(pathlib.Path.home() / "Android/Sdk"))
    debut = time.monotonic()
    for cmd, dossier in ((["npm", "run", "build"], RACINE), (["npx", "cap", "sync", "android"], RACINE),
                         (["./gradlew", "assembleDebug"], RACINE / "android")):
        dire(f"$ {' '.join(cmd)}")
        if subprocess.run(cmd, cwd=dossier, env=env).returncode:
            dire(f"ECHEC : {' '.join(cmd)}")
            return 1
    dire(f"APK : {APK} ({APK.stat().st_size / 1e6:.2f} Mo) en {time.monotonic() - debut:.0f} s")
    if args.installer:
        try:
            adb_appareil(args.serie)
            dire(adb(args.serie, "install", "-r", str(APK), delai=300).strip())
        except RuntimeError as e:
            dire(f"ECHEC : {e}")
            return 1
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="commande", required=True)

    s = sub.add_parser("serve", help="Vite sur le port 8060, au premier plan")
    s.add_argument("--lan", action="store_true", help="écoute aussi sur le réseau local (--host 0.0.0.0)")
    s.add_argument("--preview", action="store_true", help="construit puis sert le build (vite preview)")
    s.add_argument("--sortie", default="/tmp/cartographe-preview", help="dossier du build de --preview (pas dist/)")

    s = sub.add_parser("smoke", help="page, /geo/*.json et carte peinte")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--budget", type=int, default=60, help="secondes au plus pour que la carte se peigne")

    s = sub.add_parser("ui", help="captures des vues")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/cartographe-captures")

    s = sub.add_parser("mesurer", help="gestes et touchers rejoués, rapport JSON")
    s.add_argument("--cible", choices=("local", "chrome", "webview"), default="local")
    s.add_argument("--rendu", choices=("g", "css", "canvas"), default="css",
                   help="g et css : carte SVG ; canvas : la carte qui tourne")
    s.add_argument("--projection", choices=("monde", "pacifique"), default="monde")
    s.add_argument("--ralenti", type=float, default=1, help="ralenti du processeur (local seulement)")
    s.add_argument("--repetitions", type=int, default=3)
    s.add_argument("--url", help=f"défaut : {URL_DEFAUT} (webview : https://localhost/)")
    s.add_argument("--cache", action="store_true", help="garde le cache HTTP (désactivé par défaut)")
    s.add_argument("--ws", action="store_true", help="local : passe par HTTP + WebSocket comme le téléphone")
    s.add_argument("--serie", help="numéro de série adb si plusieurs appareils")
    s.add_argument("--out", help=f"dossier du rapport (défaut : {MESURES.relative_to(RACINE)})")

    s = sub.add_parser("resumer", help="résumé d'un JSON de mesurer recalculé sur ses rapports bruts")
    s.add_argument("fichiers", nargs="+")
    s.add_argument("--pourquoi", default="critères du driver changés", help="noté dans resume_recalcule")
    s.add_argument("--sec", action="store_true", help="affiche sans réécrire le fichier")

    s = sub.add_parser("apk", help="APK de débogage (npm run build, cap sync, gradlew)")
    s.add_argument("--installer", action="store_true", help="puis adb install -r")
    s.add_argument("--serie")

    for nom in ("smoke", "ui", "mesurer"):
        sub.choices[nom].add_argument(
            "--binaire", default="shell",
            help="navigateur local : shell (chrome-headless-shell, défaut : Event Timing juste), chromium "
                 "(nouveau headless : Event Timing faussé), ou un chemin")

    args = p.parse_args()
    global BINAIRE
    BINAIRE = getattr(args, "binaire", BINAIRE)
    commandes = {"serve": commande_serve, "smoke": commande_smoke, "ui": commande_ui,
                 "mesurer": commande_mesurer, "resumer": commande_resumer, "apk": commande_apk}
    try:
        return commandes[args.commande](args) or 0
    except RuntimeError as e:
        dire(f"ECHEC : {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
