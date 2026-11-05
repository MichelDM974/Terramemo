#!/usr/bin/env python3
"""Driver de Terramemo : lance le site, le vérifie, le photographie et le
MESURE, sur le PC (chromium local) et sur le téléphone (Chrome ou l'APK, par
adb). Python stdlib seule ; à lancer depuis Terramemo/ :

    serve [--preview] [--lan]   Vite sur le port 8060 (au premier plan)
    smoke                       page, fichiers /geo/*.json, carte peinte,
                                shaders du rendu webgl compilés
    ui [--width 384]            captures des vues (téléphone ou PC)
    mesurer --cible local|chrome|webview [--rendu css|g|canvas|webgl]
                                gestes et touchers rejoués par DevTools,
                                rapport JSON dans docs/mesures/j0/
    resumer FICHIER.json… [--sec] [--json]
                                résumé recalculé sur les rapports bruts
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
APPID = "io.github.micheldm974.terramemo"
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
# Saccade (décision de l'utilisateur du 04/11/2026, registre, ticket #1) :
# recopie de src/mesure/stats.ts (SEUIL_ACOUP_MS, SEUIL_GEL_MS, estAcoup,
# estGel, gesteSaccade, sansSaccade, SEUIL_120_MS), recalculée ici sur les
# intervalles bruts pour relire aussi les rapports v3 à v5 ;
# tests/mesure-driver.test.ts la confronte à stats.ts.
# Un à-coup est une image qui tarde 25 ms ou plus (trois rafraîchissements à
# 120 Hz, un et demi à 60 i/s), compté dès 21 ms : loin des valeurs exactes
# d'un écran à 60 ou 120 Hz (16,67 et 25 ms), l'arrondi et la gigue ne le
# font pas compter au hasard. Un gel est une image qui tarde 50 ms (trois
# images à 60 Hz), compté dès 46 ms, loin de 41,67 (cinq images à 120 Hz) et
# de 50 ms. Pas à 90 Hz : 22,2 ms (deux images) et 44,4 ms (quatre) tombent
# près des seuils ; sous ± 2 ms de gigue par horodatage, 22,2 ms compte
# à-coup environ 77 fois sur 100 et 44,4 ms compte gel environ 19 fois sur
# 100, et la règle n'y est pas monotone (même durée, 44,4 + 2 × 22,2 +
# 83 × 11,1 ms : 3 à-coups, 2,97/s, OK ; 4 × 22,2 + 83 × 11,1 ms, une image
# de plus et aucune plus longue : 4 à-coups, 3,96/s, NON). Ça ne compte que
# si le Galaxy A37 a un mode 90 Hz (question posée à l'utilisateur) ; seuils
# inchangés (décision de l'utilisateur). Verdict par
# type de geste, quel que soit le rendu : [NON] au-delà de 3 à-coups par
# seconde de geste en moyenne sur toutes les répétitions (à-coups × 1000 /
# somme des intervalles), compté par seconde pour ne pas avantager le rendu
# le plus rapide (5 % des intervalles à 60 i/s), ou si un seul geste saccade :
# un gel (visible seul, que la moyenne laisserait passer), ou plus de 3
# à-coups par seconde de ce geste avec au moins 2 (un geste qui saccade
# franchement, que les gestes propres dilueraient ; un à-coup isolé dans un
# geste court ne compte pas). Monotone à 60 et 120 Hz : à durée fixe, des
# images plus rapides ne changent ni les comptes, ni la durée (pas à 90 Hz,
# ci-dessus). La tenue des 120 i/s (part
# des intervalles ≤ 12,5 ms, seuil fixe) est rapportée à part, sans verdict.
SEUIL_ACOUP_MS = 21
ACOUPS_PAR_S_MAX = 3
ACOUPS_MIN_GESTE = 2
SEUIL_GEL_MS = 46
SEUIL_120_MS = 12.5
FREQUENCES_CONNUES = (144, 120, 90, 60, 30)  # Hz, comme PERIODES_CONNUES de stats.ts
VERSION_RAPPORT = 6  # src/mesure/rapport.ts ; resumer relit aussi les v3 à v5


CRITERE_SACCADE = {"acoup_des_ms": SEUIL_ACOUP_MS, "acoups_par_s_max": ACOUPS_PAR_S_MAX,
                   "acoups_min_geste": ACOUPS_MIN_GESTE, "gel_des_ms": SEUIL_GEL_MS,
                   "tenue_120_ms": SEUIL_120_MS,
                   "verdict": "NON si, par type de geste, plus de 3 à-coups par seconde en moyenne, ou un seul "
                              "geste avec un gel, ou plus de 3 à-coups par seconde avec au moins 2",
                   "tenue": "part des intervalles ≤ 12,5 ms (120 i/s), et images/s ; sans verdict"}


def est_acoup(d):
    return d >= SEUIL_ACOUP_MS


def est_gel(d):
    return d >= SEUIL_GEL_MS


def acoups_par_s(acoups, duree_ms):
    return acoups * 1000 / duree_ms if duree_ms > 0 else 0


def geste_saccade(acoups, duree_ms, gels):
    """Ce geste, à lui seul, fait dire NON : un gel, ou plus de 3 à-coups par
    seconde avec au moins 2."""
    return gels > 0 or (acoups >= ACOUPS_MIN_GESTE and acoups_par_s(acoups, duree_ms) > ACOUPS_PAR_S_MAX)


def sans_saccade(acoups, duree_ms, gestes_saccades):
    """Verdict d'un type de geste : à-coups et durée de toutes ses
    répétitions, et nombre de gestes qui saccadent seuls."""
    return not (acoups_par_s(acoups, duree_ms) > ACOUPS_PAR_S_MAX or gestes_saccades)


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
    dire(f"Terramemo sur {URL_DEFAUT} — {quoi}")
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
# --gpu : le vrai GPU du PC au lieu de SwiftShader (logiciel, le WebGL par
# défaut du headless, très pessimiste). Le pilote ANGLE GL passe sur la
# GTX 970 ; sans --ignore-gpu-blocklist, headless reste en logiciel.
OPTIONS_GPU = ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=gl"]
GPU = False  # réglé par --gpu (main)


class Tube:
    """Chromium lancé ici, piloté par `--remote-debugging-pipe` : du JSON
    terminé par un octet nul, lu sur son fd 3, écrit sur son fd 4 (repris
    réduit de run-cdc). Option `port` : chromium écoute aussi en HTTP et
    WebSocket sur ce port (pour éprouver le chemin du téléphone)."""

    def __init__(self, binaire, port=None):
        self.profil = tempfile.TemporaryDirectory(prefix="terramemo-chromium-")
        self.journal = pathlib.Path(self.profil.name) / "chromium.log"
        lecture, self.vers = os.pipe()
        self.depuis, ecriture = os.pipe()
        # Recopiés au-dessus de 4 : les dup2 de l'enfant vers 3 et 4 ne
        # peuvent plus s'écraser l'un l'autre.
        enfant = [fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 5) for fd in (lecture, ecriture)]
        os.close(lecture)
        os.close(ecriture)
        options = [f"--remote-debugging-port={port}"] if port else []
        options += OPTIONS_GPU if GPU else []
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
                return self.js("window.terramemo.repos")
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
    verifier("page", code == 200 and b"<title>Terramemo</title>" in corps, f"-> {code}")
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
                     " window.terramemo.version, document.querySelector('#carte').dataset.rendu]")
            verifier("tracés des pays", n[0] > 150, f"{n[0]} path.pays, {n[1]} pastilles visibles, version {n[2]}, rendu {n[3]}")
        except RuntimeError as e:
            verifier("carte peinte", False, str(e))
        # Rendu webgl : les shaders compilés et liés par le vrai navigateur (les tests
        # ne font que les traduire en JS). Un shader refusé ne casse rien de visible :
        # la carte reste en Canvas 2D (data-relais="repli"), d'où cette vérification.
        # ?logiciel=1 : sans --gpu, le WebGL du PC est SwiftShader, refusé sinon.
        try:
            p.goto(base + "?rendu=webgl&logiciel=1&mesures=0")
            p.attendre_carte(args.budget)
            fin = time.monotonic() + args.budget
            while p.js("document.querySelector('#carte').dataset.relais") == "attente" and time.monotonic() < fin:
                p.pause(100)
            w = p.js("window.terramemo.carte && window.terramemo.carte.webgl()") or {}
            verifier("rendu webgl (shaders compilés et liés)", w.get("etape") == "webgl",
                     f"relais {w.get('etape')}, GPU {w.get('renderer')}" + (f", raison : {w.get('raison')}" if w.get("raison") else ""))
        except RuntimeError as e:
            verifier("rendu webgl (shaders compilés et liés)", False, str(e))
        verifier("aucune erreur JS", not p.erreurs, "; ".join(p.erreurs)[:300])
        verifier("aucune requête en échec", not p.echecs, "; ".join(p.echecs)[:300])
    dire("\nsmoke : " + ("OK" if not echecs else f"{echecs} échec(s)"))
    return 1 if echecs else 0


# --- ui --------------------------------------------------------------

def position(page, ident):
    """Point de la fenêtre où toucher `ident` : le centre de sa pastille
    dessinée (lu dans le DOM), sinon terramemo.carte.ecran()."""
    return page.js(f"""(() => {{
        const c = document.querySelector('circle.pastille[data-id="{ident}"]');
        if (c) {{ const r = c.getBoundingClientRect(); return {{x: r.x + r.width / 2, y: r.y + r.height / 2, via: 'pastille'}}; }}
        const p = window.terramemo.carte.ecran("{ident}");
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
        p.js('window.terramemo.carte.zoomerSur("CHE")')
        pt = position(p, "CHE")
        p.toucher(pt["x"], pt["y"])
        p.pause(300)
        dire(f"  pays touché : {p.js('document.getElementById(\"barre-carte\").textContent')!r}")
        capturer("2-pays-touche")
        p.js('location.hash = "#toucher"')
        p.pause(300)
        # Toucher s'ouvre sur le choix de la série : sans ce choix, pas de
        # consigne à lire. L'essai J0, la série que visent les mesures.
        p.js('document.querySelector(\'.essai-serie[data-serie="essai"]\').click()')
        p.pause(300)
        p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
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
        p.js('document.getElementById("settings-btn").click()')
        # Chrono : l'Amérique du Sud (12 pays) jouée jusqu'au bilan, la
        # première question fausse (le Brésil, ou l'Argentine s'il est demandé).
        p.js('location.hash = "#chrono"')
        p.pause(300)
        capturer("7-chrono-depart")
        p.js('document.querySelector(\'#chrono-depart .essai-serie[data-serie="South America"]\').click()')
        p.pause(300)
        p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
        consigne = 'document.querySelector("#barre-chrono .essai-consigne").dataset.cible'
        retro = 'document.querySelector("#barre-chrono .essai-retro").textContent'
        cible = p.js(consigne)
        pt = position(p, "ARG" if cible == "BRA" else "BRA")
        p.toucher(pt["x"], pt["y"])
        p.pause(300)
        dire(f"  Chrono, faux ({cible}) : {p.js(retro)!r}")
        capturer("8-chrono-faux")
        for _ in range(20):
            p.pause(1900)
            if p.js('!document.getElementById("chrono-bilan").hidden'):
                break
            pt = position(p, p.js(consigne))
            p.toucher(pt["x"], pt["y"])
        dire(f"  Chrono, bilan : {p.js('document.getElementById(\"chrono-bilan\").innerText')!r}")
        capturer("9-chrono-bilan")
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
    page.js(f"""(() => {{ const c = window.terramemo.carte; c.zoomer({{k: 1, x: 0, y: 0}});
        const r = c.rect(), p = c.ecran("{ident}"), x = p.x - r.x, y = p.y - r.y;
        c.zoomer({{k: {k}, x: r.largeur / 2 - {k} * x, y: r.hauteur / 2 - {k} * y}}); }})()""")


def zoomer_au_centre(page, k):
    """Zoom k autour du centre de la carte (rotation gardée en Canvas)."""
    page.js(f"""(() => {{ const c = window.terramemo.carte, r = c.rect(); c.zoomer({{k: 1, x: 0, y: 0}});
        c.zoomer({{k: {k}, x: r.largeur / 2 * (1 - {k}), y: r.hauteur / 2 * (1 - {k})}}); }})()""")


# Cadence de rejeu sur le téléphone : au moins celle d'un écran 120 Hz (Galaxy
# A37). Son écran peut tenir 60 Hz au repos et passer à 120 Hz pendant un
# geste : rejoué à la seule période du repos, un doigt à 60 Hz n'en ferait
# qu'une image sur deux, et le geste ne dirait rien du 120 Hz. Sur le PC
# (headless, 60 Hz fixe), la période du repos, comme les mesures d'avant.
PAS_TELEPHONE_MS = 1000 / 120


def pas_de_rejeu(periode, cible):
    return min(periode, PAS_TELEPHONE_MS) if cible != "local" else periode


# Première visite : avant la répétition 1, le stockage de l'origine mesurée
# est vidé (Storage.clearDataForOrigin), en plus du cache HTTP coupé. Sur le
# téléphone, Chrome et la WebView gardent leurs données d'une séance à
# l'autre, et après `adb install -r` : sans cela, le maillage du rendu webgl
# sortait du cache IndexedDB dès la répétition 1, et la première visite
# n'était jamais mesurée. Sur le PC, le profil du chromium est neuf à chaque
# lancement : la répétition 1 y est toujours une première visite.
# Les types vidés sont ceux qui changent ce que fait le chargement :
# indexeddb (maillage du webgl, src/map/maillage.worker.ts), cache_storage et
# service_workers (aucun aujourd'hui ; un site hors ligne y garderait ses
# fichiers), shader_cache (shaders compilés gardés sur disque par le
# navigateur : sans lui, le contexte et la compilation de la répétition 1
# profiteraient d'une séance d'avant). Pas « all » : local_storage garde les
# réglages de l'utilisateur (série choisie, panneau des mesures), sans effet
# sur le chargement mesuré (?mesures=0 et ?rendu= sont dans l'adresse).
# Un nouveau stockage qui change le chargement doit entrer dans la liste.
STOCKAGE_VIDE = "indexeddb,cache_storage,service_workers,shader_cache"
# Les répétitions : la première visite (stockage vidé, ou profil neuf du PC),
# les suivantes (cache du maillage écrit à la première), ou inconnue
# (stockage du téléphone gardé, ou non vidé).
NOMS_VISITES = {"premiere": "première visite", "suivante": "suivantes", "inconnue": "visite inconnue"}


def origine(url):
    """Origine d'une adresse (schéma, hôte et port) : celle dont le stockage
    est vidé."""
    u = urllib.parse.urlsplit(url)
    return f"{u.scheme}://{u.netloc}"


def visites_du_fichier(d):
    """Visite de chaque répétition d'un JSON de mesurer : notée depuis le
    stockage vidé (champ visites) ; avant, déduite : sur le PC, profil neuf à
    chaque lancement, donc la répétition 1 est une première visite ; sur le
    téléphone, inconnue."""
    if d.get("visites"):
        return [v.get("visite") for v in d["visites"]]
    return [("premiere" if d.get("cible") == "local" else "inconnue") if i == 0 else "suivante"
            for i in range(len(d["rapports"]))]


def source_maillage(rapport):
    """« calcul/absent », « cache/lu »… : source du maillage du webgl et état
    du cache vu par le Worker (rapports[].webgl.maillage) ; None hors webgl."""
    m = (rapport.get("webgl") or {}).get("maillage")
    if not m:
        return None
    return f"{m.get('source')}/{m.get('cache')}" if m.get("source") else "aucun"


def est_repli(rapport):
    """Le webgl demandé a fini en Canvas 2D (WebGL2 absent ou logiciel,
    shader refusé, contexte perdu) : rapport.webgl.etape 'repli'."""
    return (rapport.get("webgl") or {}).get("etape") == "repli"


def une_mesure(page, url, journal, cible):
    """Un chargement, le scénario de gestes, les touchers ; rend le rapport
    de la page, la liste des touchers visés, les durées réelles des gestes,
    le pas de rejeu et la transformation après le tour du monde."""
    page.goto(url)
    periode = pas_de_rejeu(page.attendre_carte() or 1000 / 60, cible)
    page.js("window.terramemo.reinitialiser()")
    r = page.js("window.terramemo.carte.rect()")
    cx, cy = r["x"] + r["largeur"] / 2, r["y"] + r["hauteur"] / 2
    duree_reelle = []
    for geste in SCENARIO:
        if geste[0] == "zoomerSur":
            page.js(f'window.terramemo.carte.zoomerSur("{geste[1]}")')
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
    apres_tour = page.js("window.terramemo.carte.transfo()")
    vises = []
    for nom, centre, k, pays in TOUCHERS:
        if centre is None:
            page.js(f"window.terramemo.carte.zoomer({{k: {k}, x: 0, y: 0}})")
        elif k is None:
            page.js(f'window.terramemo.carte.zoomerSur("{centre}")')
        else:
            centrer(page, centre, k)
        page.pause(400)
        zone = page.js("window.terramemo.carte.rect()")
        t = page.js("window.terramemo.carte.transfo()")
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
    rapport = page.js("window.terramemo.rapport()")
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


def _stats(valeurs):
    valeurs = [v for v in valeurs if v is not None]
    return {"mediane": _med(valeurs), "min": min(valeurs, default=None), "max": max(valeurs, default=None),
            "n": len(valeurs)}


def resumer(rapports, vises, journal=None, visites=None):
    """Résumé face aux critères du J0, sur toutes les répétitions (rapports v6,
    ou v3 à v5 relus par `resumer`, src/mesure/rapport.ts : chaque règle
    ci-dessous y est décrite). `visites` : celle de chaque répétition
    (premiere, suivante, inconnue ; visites_du_fichier), pour le chargement
    et le relais du webgl."""
    visites = list(visites or [None] * len(rapports))
    chargements = [r["chargement"]["total_ms"] for r in rapports if r.get("chargement")]
    par_visite = {}
    for r, v in zip(rapports, visites):
        if r.get("chargement") and v:
            par_visite.setdefault(v, []).append(r["chargement"]["total_ms"])
    periode = _med([r["ecran"]["periode_ms"] for r in rapports]) or 1000 / 60
    # Un fichier = un rendu, sauf un webgl qui se replie en cours de série
    # (des répétitions en webgl, d'autres en canvas) : les gestes d'un autre
    # rendu que celui de la plupart des rapports ont leur propre ligne.
    principal = statistics.mode([r["rendu"] for r in rapports]) if rapports else None
    gestes = {}
    for r in rapports:
        for g, quoi in zip(r["gestes"], noms_des_gestes(r, journal)):
            if g["type"] not in ("glisser", "pincer"):
                continue
            rendu = g.get("rendu", r["rendu"])
            cle = quoi if rendu == principal else f"{quoi} ({rendu})"
            e = gestes.setdefault(cle, {"rendu": rendu, "gestes": 0, "intervalles": 0, "acoups": 0,
                                        "duree_ms": 0, "gels": 0, "gestes_saccades": 0,
                                        "geste_max_acoups_par_s": None, "a_120": 0, "perdues": 0,
                                        "perdues_repos": 0, "bascule_images": 0, "max_ms": 0, "p95_ms": [],
                                        "longues_images": 0, "periodes_ms": [],
                                        "ecarts_periode": {"plus_rapide": 0, "plus_lent": 0},
                                        "dessins": [], "fin_et": [], "fin_et_en_attente": 0,
                                        "fin_et_absente": 0, "fin_et_artefacts": [], "fin_image": []})
            st = g["stats"]
            iv = g["intervalles_ms"]
            e["gestes"] += 1
            e["intervalles"] += len(iv)
            acoups, gels, duree_g = sum(est_acoup(d) for d in iv), sum(est_gel(d) for d in iv), sum(iv)
            e["acoups"] += acoups
            e["duree_ms"] += duree_g
            e["gels"] += gels
            # Règle par geste : un gel, ou plus de 3/s avec au moins 2 à-coups.
            e["gestes_saccades"] += geste_saccade(acoups, duree_g, gels)
            if acoups >= ACOUPS_MIN_GESTE:
                taux = round(acoups_par_s(acoups, duree_g), 2)
                e["geste_max_acoups_par_s"] = max(e["geste_max_acoups_par_s"] or 0, taux)
            e["a_120"] += sum(d <= SEUIL_120_MS for d in iv)
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
        duree, a_120 = e["duree_ms"], e.pop("a_120")
        e["duree_ms"] = round(duree, 1)
        e["acoups_par_s"] = round(acoups_par_s(e["acoups"], duree), 2)
        e["tenue_120"] = {"part": round(a_120 / n, 3) if n else None,
                          "cadence_ips": round(n * 1000 / duree, 1) if duree else None}
        e["part_perdues"] = round(e["perdues"] / e["intervalles"], 3) if e["intervalles"] else None
        e["part_perdues_repos"] = round(e["perdues_repos"] / e["intervalles"], 3) if e["intervalles"] else None
        e["p95_ms"] = _med(e["p95_ms"])
        periodes = [x for x in e.pop("periodes_ms") if x is not None]
        e["periode_ms"] = {"mediane": _med(periodes), "min": min(periodes, default=None),
                           "max": max(periodes, default=None)}
        # À-coups ≥ 21 ms par seconde de geste, sans période estimée (une
        # cadence plus lente que l'écran n'en est pas une : elle se lit dans
        # la tenue, sans verdict), et gestes qui saccadent seuls. Sur la
        # durée brute, comme stats.ts. max_ms : informatif (v5 : > 50 ms).
        e["saccade_ok"] = sans_saccade(e["acoups"], duree, e["gestes_saccades"])
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
        "hz": frequence(periode),
        # Le critère vaut pour le premier affichage, donc aussi à la première
        # visite (maillage du webgl à calculer, rien en cache) : ok sur toutes.
        "chargement_ms": {"mediane": _med(chargements), "min": min(chargements, default=None),
                          "max": max(chargements, default=None), "n": len(chargements),
                          "ok": bool(chargements) and max(chargements) < CRITERE_RENDU_MS,
                          "par_visite": {v: _stats(par_visite[v]) for v in NOMS_VISITES if v in par_visite}},
        "relais_webgl": resumer_relais(rapports, visites, journal),
        "gestes": gestes,
        "ecarts_periode": ecarts,
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


# Étapes du relais à lire sur le téléphone (src/map/relais-webgl.ts,
# temps.etapes) : « contexte » (getContext, 131 à 181 ms à froid sur le PC),
# « nom du GPU » (110 ms une fois au tout premier lancement du PC),
# « premiere image » (47 ms à ×4 quand les triangles viennent d'être calculés).
ETAPES_RELAIS = ("contexte", "nom du GPU", "premiere image")


def resumer_relais(rapports, visites, journal=None):
    """Relais du rendu webgl (rapports[].webgl, src/map/relais-webgl.ts), par
    visite : source du maillage, durées du Worker, apres_affichage_ms (du
    premier affichage en Canvas 2D au relais), étapes du fil principal ; et
    les replis. None hors webgl. Sans verdict."""
    groupes, replis, gpus = {}, [], []
    for i, (r, v) in enumerate(zip(rapports, visites)):
        w = r.get("webgl")
        if not w:
            continue
        v = v or "inconnue"
        if w.get("gpu") and w["gpu"] not in gpus:
            gpus.append(w["gpu"])
        if est_repli(r):
            replis.append({"repetition": i + 1, "raison": w.get("raison"), "gpu": w.get("gpu"),
                           "logiciel": w.get("logiciel")})
        m = w.get("maillage") or {}
        if v == "premiere" and m.get("source") == "cache" and journal is not None:
            journal.append(f"répétition {i + 1} : première visite, mais maillage lu dans le cache "
                           "(stockage pas vidé ?)")
        e = groupes.setdefault(v, {"n": 0, "maillage": {}, "worker_total": [], "maillage_ms": [],
                                   "apres_affichage": [], "etapes": {}, "plus_longue": None})
        e["n"] += 1
        source = source_maillage(r)
        e["maillage"][source] = e["maillage"].get(source, 0) + 1
        worker = m.get("worker") or {}
        e["worker_total"].append(worker.get("total_ms"))
        e["maillage_ms"].append(worker.get("maillage_ms"))
        tp = w.get("temps") or {}
        e["apres_affichage"].append(tp.get("apres_affichage_ms"))
        for etape in tp.get("etapes") or []:
            e["etapes"].setdefault(etape["nom"], []).append(etape["ms"])
            if e["plus_longue"] is None or etape["ms"] > e["plus_longue"]["ms"]:
                e["plus_longue"] = {"nom": etape["nom"], "ms": etape["ms"], "repetition": i + 1}
    if not groupes:
        return None
    return {
        "gpu": gpus,
        "replis": replis,
        "par_visite": {v: {"n": e["n"], "maillage": e["maillage"],
                           "worker_total_ms": _stats(e["worker_total"]), "maillage_ms": _stats(e["maillage_ms"]),
                           "apres_affichage_ms": _stats(e["apres_affichage"]),
                           "etapes_ms": {nom: _stats(e["etapes"].get(nom, [])) for nom in ETAPES_RELAIS},
                           "plus_longue_etape": e["plus_longue"]}
                       for v, e in sorted(groupes.items(), key=lambda kv: list(NOMS_VISITES).index(kv[0]))},
    }


def frequence(periode_ms):
    """Fréquence d'une période (Hz) : la fréquence connue la plus proche à 6 %
    près (16,7 ms → 60, 8,3 → 120), sinon arrondie (13,3 → 75)."""
    f = 1000 / periode_ms
    connue = min(FREQUENCES_CONNUES, key=lambda c: abs(f - c) / c)
    return connue if abs(f - connue) / connue <= 0.06 else round(f)


def hz(periode_ms):
    return f"{frequence(periode_ms)} Hz"


def _en_clair(s, unite=" ms"):
    """Une valeur seule, ou médiane, min et max de plusieurs (_stats)."""
    if not s or not s["n"]:
        return "—"
    if s["n"] == 1:
        return f"{s['mediane']}{unite}"
    return f"médiane {s['mediane']}, de {s['min']} à {s['max']}{unite} ({s['n']})"


def afficher_resume(res, entete, ralenti=1):
    ok = lambda b: " ? " if b is None else "OK " if b else "NON"
    dire(f"\n=== {entete} ===")
    dire(f"période de l'écran au repos : {res['periode_ms']} ms ({hz(res['periode_ms'])})")
    c = res["chargement_ms"]
    pv = c.get("par_visite")
    if pv:
        # Le critère vaut pour le premier affichage, première visite comprise.
        dire(f"[{ok(c['ok'])}] rendu < {CRITERE_RENDU_MS} ms (premier affichage, à chaque visite) : "
             + " ; ".join(f"{NOMS_VISITES[v]} {_en_clair(s)}" for v, s in pv.items()))
    else:
        dire(f"[{ok(c['ok'])}] rendu < {CRITERE_RENDU_MS} ms : médiane {c['mediane']}, de {c['min']} à {c['max']} "
             f"({c['n']} chargements)")
    afficher_relais(res.get("relais_webgl"), ralenti)
    dire(f"[{ok(res['saccade_ok'])}] pas de saccade (à-coup : intervalle ≥ {SEUIL_ACOUP_MS} ms, une image qui "
         f"tarde 25 ms ou plus ; gel : ≥ {SEUIL_GEL_MS} ms, une image qui tarde 50 ms ; [NON] au-delà de "
         f"{ACOUPS_PAR_S_MAX} à-coups par seconde en moyenne par type de geste, ou si un seul geste a un gel ou "
         f"plus de {ACOUPS_PAR_S_MAX} à-coups par seconde avec au moins {ACOUPS_MIN_GESTE}) :")
    for quoi, e in res["gestes"].items():
        pire = e.get("geste_max_acoups_par_s")
        dire(f"      {quoi:8} [{ok(e['saccade_ok'])}] {e['gestes']:2} gestes, {e['acoups']} à-coup(s) en "
             f"{e['duree_ms'] / 1000:.1f} s ({e['acoups_par_s']:g}/s, {e['intervalles']} intervalles), "
             f"{e['gels']} gel(s), {e['gestes_saccades']} geste(s) qui saccadent seuls"
             + (f" (le pire à {pire:g}/s)" if pire is not None else "")
             + f" ; le plus long {e['max_ms']} ms, p95 {e['p95_ms']} ms, {e['longues_images']} longue(s) image(s)")
    ec = res["ecarts_periode"]
    # Sans verdict : pour comparer les rendus. Seuil fixe de 12,5 ms, aucune
    # période estimée : la part suit celle des images à 120 i/s.
    dire(f"[ — ] tenue des 120 i/s pendant les gestes (sans verdict) : part des intervalles ≤ {SEUIL_120_MS:g} ms ; "
         f"écran au repos {res['periode_ms']} ms ({hz(res['periode_ms'])})"
         + ("" if not ec["plus_rapide"] and not ec["plus_lent"] else
            f" ; {ec['plus_rapide']} geste(s) plus rapides que le repos (l'écran accélère), {ec['plus_lent']} plus "
            "lents (cadence de l'appli sous celle de l'écran au repos)"))
    for quoi, e in res["gestes"].items():
        pg, ee, t = e["periode_ms"], e["ecarts_periode"], e["tenue_120"]
        dire(f"      {quoi:8} {t['cadence_ips']} images/s, {(t['part'] or 0):.1%} des intervalles à 120 i/s ; "
             f"période estimée des gestes : médiane {pg['mediane']} ms ; {ee['plus_rapide']} plus rapide(s), "
             f"{ee['plus_lent']} plus lent(s)"
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


def afficher_relais(rw, ralenti=1):
    """Lignes du relais du webgl (resumer_relais), sans verdict."""
    if not rw:
        return
    x4 = (f" ; À ×{ralenti:g}, TROP OPTIMISTE : le ralenti ne touche pas le Worker du maillage, la première "
          f"visite d'un téléphone lent maillerait jusqu'à ~{ralenti:g} fois plus longtemps") if ralenti != 1 else ""
    dire(f"[ — ] relais WebGL (sans verdict : du premier affichage en Canvas 2D au WebGL, apres_affichage_ms)"
         f"{x4} ; GPU : {', '.join(rw['gpu']) or '?'} :")
    for v, e in rw["par_visite"].items():
        maillage = ", ".join(f"{s} ×{n}" if n > 1 else str(s) for s, n in e["maillage"].items())
        et = e["etapes_ms"]
        pl = e["plus_longue_etape"]
        relaye = e["apres_affichage_ms"]["n"]
        dire(f"      {NOMS_VISITES[v]} : "
             + (f"maillage {maillage} (Worker {_en_clair(e['worker_total_ms'])}, dont maillage "
                f"{_en_clair(e['maillage_ms'])}) ; relais {_en_clair(e['apres_affichage_ms'])} après l'affichage"
                + (f" ({e['n'] - relaye} sans relais)" if relaye < e["n"] else "") if relaye else
                f"aucun relais (maillage {maillage})")
             + " ; " + ", ".join(f"« {nom} » {_en_clair(et[nom])}" for nom in ETAPES_RELAIS if et[nom]["n"])
             + (f" ; plus longue étape « {pl['nom']} » {pl['ms']} ms" if pl else ""))
    for r in rw["replis"]:
        dire(f"      REPLI (répétition {r['repetition']}) : {r['raison']} ; GPU {r['gpu'] or '?'}"
             f"{' (logiciel)' if r['logiciel'] else ''} : la carte est restée en Canvas 2D, les lignes "
             "ci-dessous sont celles du Canvas de repli")


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
    visites = []  # par répétition : première visite ou suivante, et le maillage du webgl
    logiciel = "1" in urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("logiciel", [])
    code = code_mesure(args.cible, args.serie)
    with Session(args.cible, serie=args.serie, ws_local=args.ws) as s:
        p = s.page
        s.reverse(url_base)
        if args.cible == "local":
            p.emuler(TELEPHONE, tactile=True, ralenti=args.ralenti)
        else:
            p.tactile = True
        p.cdp("Network.setCacheDisabled", cacheDisabled=not args.cache)
        # Première visite : le stockage de l'origine mesurée vidé (STOCKAGE_VIDE).
        stockage = {"vide": False, "origine": origine(url), "types": None, "erreur": None}
        if not args.garder_stockage:
            try:
                p.cdp("Storage.clearDataForOrigin", origin=stockage["origine"], storageTypes=STOCKAGE_VIDE)
                stockage.update(vide=True, types=STOCKAGE_VIDE)
            except RuntimeError as e:
                stockage["erreur"] = str(e)
                dire(f"  ATTENTION : stockage de {stockage['origine']} non vidé ({e}) : la répétition 1 n'est "
                     "peut-être pas une première visite")
        # Sur le PC, profil neuf à chaque lancement : première visite même sans vider.
        # Sur le téléphone, --cache garde le cache HTTP des séances d'avant (aucun
        # type de STOCKAGE_VIDE ne le vide) : la répétition 1 n'est alors pas sûre.
        premiere = (stockage["vide"] and not args.cache) or args.cible == "local"
        dire(f"navigateur : {s.navigateur}" + (f" ({chromium_binaire()})" if args.cible == "local" else ""))
        dire(f"code : {code['commit']}{' (arbre modifié)' if code['arbre_modifie'] else ''}"
             + (f" ; APK du {code['apk']['installe_le']}" if code.get("apk") else ""))
        if args.cible == "local":
            dire("GPU : " + (" ".join(OPTIONS_GPU) if GPU else "défaut du headless (WebGL en SwiftShader)"))
        dire(f"url : {url} ; ralenti ×{args.ralenti:g} ; cache HTTP {'actif' if args.cache else 'désactivé'} ; "
             + (f"stockage de {stockage['origine']} vidé ({STOCKAGE_VIDE})" if stockage["vide"] else
                "stockage gardé" + (" (profil neuf du PC)" if args.cible == "local" else "")))
        if args.ralenti != 1 and args.rendu == "webgl":
            dire(f"  attention : le ralenti ×{args.ralenti:g} ne touche pas le Worker du maillage (SKILL.md, Pièges) : "
                 "durées du relais trop optimistes")
        for i in range(args.repetitions):
            debut = time.monotonic()
            rapport, v, d, pas, tour = une_mesure(p, url, journal, args.cible)
            if rapport.get("v") != VERSION_RAPPORT:
                raise RuntimeError(f"rapport v{rapport.get('v')} de la page, le driver lit la v{VERSION_RAPPORT} "
                                   "(src/mesure/rapport.ts) : site à reconstruire ?")
            if args.rendu == "webgl" and rapport.get("rendu") == "canvas" and est_repli(rapport):
                w = rapport["webgl"]
                dire(f"  REPLI du webgl (répétition {i + 1}) : {w.get('raison')} ; GPU {w.get('gpu') or '?'}"
                     f"{' (logiciel)' if w.get('logiciel') else ''} : la carte est restée en Canvas 2D")
            elif rapport.get("rendu") != args.rendu:
                raise RuntimeError(f"la page dit rendu {rapport.get('rendu')!r}, demandé {args.rendu!r} : "
                                   "site à reconstruire ?")
            rapports.append(rapport)
            vises.extend(v)
            durees.append(d)
            pas_ms.append(pas)
            apres_tour.append(tour)
            visite = ("premiere" if premiere else "inconnue") if i == 0 else "suivante"
            relais = (rapport.get("webgl") or {}).get("temps") or {}
            visites.append({"repetition": i + 1, "visite": visite, "maillage": source_maillage(rapport),
                            "rendu": rapport.get("rendu"),
                            "repli": rapport["webgl"].get("raison") if est_repli(rapport) else None})
            dire(f"  répétition {i + 1}/{args.repetitions} ({NOMS_VISITES[visite].replace('suivantes', 'visite suivante')}) : chargement "
                 f"{rapport['chargement']['total_ms']} ms"
                 + (", repli en canvas" if est_repli(rapport) else
                    f", maillage {source_maillage(rapport)}, relais {relais.get('apres_affichage_ms')} ms après "
                    "l'affichage" if rapport.get("webgl") else "")
                 + f", {len(rapport['gestes'])} gestes, {len(rapport['touchers'])} touchers "
                 f"({time.monotonic() - debut:.0f} s)")
        erreurs = p.erreurs + p.echecs
    # Avant les notes : il en ajoute (gestes rangés par type, maillage lu à la première visite).
    res = resumer(rapports, vises, journal, [v["visite"] for v in visites])
    for ligne in sorted(set(journal)):
        dire(f"  note : {ligne}")
    for e in erreurs:
        dire(f"  erreur de la page : {e}")
    repli = [v for v in visites if v["repli"]]
    afficher_resume(res, f"{args.cible}, rendu {args.rendu}" + (" (REPLI en canvas)" if repli else "")
                    + f", {args.projection}, ralenti ×{args.ralenti:g}", args.ralenti)
    jour = datetime.date.today().isoformat()
    # -logiciel : WebGL logiciel accepté (?logiciel=1, SwiftShader) ; -repli :
    # le webgl demandé a fini en Canvas 2D, le résumé est celui du repli.
    nom = (f"{jour}-{args.cible}-{args.rendu}-{args.projection}" + (f"-x{args.ralenti:g}" if args.ralenti != 1 else "")
           + ("-gpu" if GPU and args.cible == "local" else "") + ("-logiciel" if logiciel else "")
           + ("-repli" if repli else ""))
    sortie = pathlib.Path(args.out).resolve() if args.out else MESURES
    sortie.mkdir(parents=True, exist_ok=True)
    fichier = sortie / f"{nom}.json"
    fichier.write_text(json.dumps({
        "v": VERSION_RAPPORT,
        "outil": ".claude/skills/run-terramemo/driver.py mesurer",
        "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "code": code,
        "cible": args.cible, "navigateur": s.navigateur,
        "binaire": str(chromium_binaire()) if args.cible == "local" else None,
        "options_gpu": (OPTIONS_GPU if GPU else []) if args.cible == "local" else None,
        "url": url, "ralenti": args.ralenti,
        "cache": args.cache, "repetitions": args.repetitions,
        # Stockage de l'origine vidé avant la répétition 1 (STOCKAGE_VIDE) ; visite de
        # chaque répétition et, en webgl, source du maillage (rapports[].webgl.maillage).
        "stockage": stockage, "visites": visites,
        # L'adresse porte logiciel=1 (WebGL logiciel accepté) ; à ne pas confondre
        # avec rapports[].webgl.logiciel (WebGL refusé parce que logiciel).
        "logiciel_accepte": logiciel,
        "repli": [{"repetition": v["repetition"], "raison": v["repli"]} for v in repli] or None,
        "ecran_emule": TELEPHONE if args.cible == "local" else None,
        "scenario": {"gestes": SCENARIO, "duree_glisser_ms": DUREE_GLISSER_MS, "duree_pincer_ms": DUREE_PINCER_MS,
                     "duree_tourner_ms": DUREE_TOURNER_MS, "transfo_apres_tour": apres_tour,
                     "cadence": "un touchMove par période de l'écran au repos (window.terramemo.repos) ; "
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
    (rapports v3 à v6, touchers visés), aux critères actuels du driver : un
    critère qui change n'oblige pas à refaire les mesures. Réécrit le fichier,
    rapports bruts intacts, et note le recalcul dans `resume_recalcule`.
    --json : les résumés et le critère de saccade en JSON sur la sortie, au
    lieu du texte (tests/mesure-driver.test.ts les confronte à stats.ts)."""
    sortie = []
    for chemin in args.fichiers:
        fichier = pathlib.Path(chemin)
        d = json.loads(fichier.read_text())
        versions = {r.get("v") for r in d["rapports"]}
        if not versions <= {3, 4, 5, VERSION_RAPPORT}:
            dire(f"ECHEC : {fichier} : rapports v{sorted(versions)}, le driver relit les v3 à v{VERSION_RAPPORT}")
            return 1
        journal = []
        res = resumer(d["rapports"], d["touchers_vises"], journal, visites_du_fichier(d))
        d["resume"] = res
        d["criteres"]["saccade"] = CRITERE_SACCADE
        d["notes"] = sorted(set(d.get("notes", [])) | set(journal))
        d["resume_recalcule"] = {
            "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "outil": ".claude/skills/run-terramemo/driver.py resumer",
            "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=RACINE,
                                     capture_output=True, text=True).stdout.strip() or None,
            # Le driver qui a recalculé diffère-t-il de ce commit (pas encore commité) ?
            "driver_modifie": subprocess.run(["git", "diff", "--quiet", "HEAD", "--", __file__],
                                             cwd=RACINE).returncode != 0,
            "pourquoi": args.pourquoi}
        if not args.sec:
            fichier.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        if args.json:
            sortie.append({"fichier": str(fichier), "resume": res, "notes": d["notes"]})
        else:
            afficher_resume(res, f"{fichier.name} (recalculé{', non écrit' if args.sec else ''})",
                            d.get("ralenti") or 1)
    if args.json:
        print(json.dumps({"criteres": CRITERE_SACCADE, "resumes": sortie}, ensure_ascii=False))
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
    s.add_argument("--sortie", default="/tmp/terramemo-preview", help="dossier du build de --preview (pas dist/)")

    s = sub.add_parser("smoke", help="page, /geo/*.json et carte peinte")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--budget", type=int, default=60, help="secondes au plus pour que la carte se peigne")

    s = sub.add_parser("ui", help="captures des vues")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")

    s = sub.add_parser("mesurer", help="gestes et touchers rejoués, rapport JSON")
    s.add_argument("--cible", choices=("local", "chrome", "webview"), default="local")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), default="css",
                   help="g et css : carte SVG ; canvas et webgl : la carte qui tourne (Canvas 2D, WebGL2)")
    s.add_argument("--projection", choices=("monde", "pacifique"), default="monde")
    s.add_argument("--ralenti", type=float, default=1, help="ralenti du processeur (local seulement)")
    s.add_argument("--repetitions", type=int, default=3)
    s.add_argument("--url", help=f"défaut : {URL_DEFAUT} (webview : https://localhost/)")
    s.add_argument("--cache", action="store_true", help="garde le cache HTTP (désactivé par défaut)")
    s.add_argument("--garder-stockage", action="store_true",
                   help="ne vide pas le stockage de l'origine avant la répétition 1 (IndexedDB… : vidé par "
                        "défaut, première visite) ; ex. pour garder des données de l'utilisateur sur le téléphone")
    s.add_argument("--ws", action="store_true", help="local : passe par HTTP + WebSocket comme le téléphone")
    s.add_argument("--serie", help="numéro de série adb si plusieurs appareils")
    s.add_argument("--out", help=f"dossier du rapport (défaut : {MESURES.relative_to(RACINE)})")

    s = sub.add_parser("resumer", help="résumé d'un JSON de mesurer recalculé sur ses rapports bruts")
    s.add_argument("fichiers", nargs="+")
    s.add_argument("--pourquoi", default="critères du driver changés", help="noté dans resume_recalcule")
    s.add_argument("--sec", action="store_true", help="affiche sans réécrire le fichier")
    s.add_argument("--json", action="store_true", help="résumés et critère de saccade en JSON (tests)")

    s = sub.add_parser("apk", help="APK de débogage (npm run build, cap sync, gradlew)")
    s.add_argument("--installer", action="store_true", help="puis adb install -r")
    s.add_argument("--serie")

    for nom in ("smoke", "ui", "mesurer"):
        sub.choices[nom].add_argument(
            "--binaire", default="shell",
            help="navigateur local : shell (chrome-headless-shell, défaut : Event Timing juste), chromium "
                 "(nouveau headless : Event Timing faussé), ou un chemin")
        sub.choices[nom].add_argument(
            "--gpu", action="store_true",
            help="navigateur local : le vrai GPU du PC (" + " ".join(OPTIONS_GPU) + ") au lieu de SwiftShader")

    args = p.parse_args()
    global BINAIRE, GPU
    BINAIRE = getattr(args, "binaire", BINAIRE)
    GPU = getattr(args, "gpu", GPU)
    commandes = {"serve": commande_serve, "smoke": commande_smoke, "ui": commande_ui,
                 "mesurer": commande_mesurer, "resumer": commande_resumer, "apk": commande_apk}
    try:
        return commandes[args.commande](args) or 0
    except RuntimeError as e:
        dire(f"ECHEC : {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
