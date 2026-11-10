#!/usr/bin/env python3
"""Driver de Terramemo : lance le site, le vérifie, le photographie et le
MESURE, sur le PC (chromium local) et sur le téléphone (Chrome ou l'APK, par
adb). Python stdlib seule ; à lancer depuis Terramemo/ :

    serve [--preview] [--lan]   Vite sur le port 8060 (au premier plan)
    smoke                       page, fichiers /geo/*.json et /geo/reunion/,
                                rien de l'île au premier affichage, carte
                                peinte en canvas (défaut) et en SVG, shaders
                                du rendu webgl compilés
    ui [--width 384] [--rendu r]
                                captures des vues (téléphone ou PC), île
                                de La Réunion et Nommer compris, séance
                                du J1a en dernier
    seance [--width 384]        la séance du J1a seule (Révision du jour,
                                Apprendre, le lendemain par ?horloge=1)
    accueil [--width 384]       l'écran de connexion de la première ouverture
                                seul (ui_accueil, aussi en fin de ui)
    mesurer --cible local|chrome|webview [--rendu canvas|webgl|g|css]
                                gestes et touchers rejoués par DevTools,
                                rapport JSON dans docs/mesures/j0/
    resumer FICHIER.json… [--sec] [--json]
                                résumé recalculé sur les rapports bruts
                                d'un JSON de mesurer (critères changés)
    apk [--installer]           APK de débogage, installé par adb (après
                                sauver_journal de l'appli en place)
    sauver_journal [--cible webview|chrome|local]
                                journal de l'appareil lu brut, sauvé dans
                                ~/Sauvegardes/terramemo/journal-{date}.json
    restaurer_journal [FICHIER] [--cible …]
                                ajoute les événements valides d'une
                                sauvegarde, un à un

Chaque commande pose le drapeau terramemo.sans-synchro sur l'origine
qu'elle pilote (aucun envoi au vrai projet pendant un essai) et le retire à
la fin, même après une erreur.
Sur le profil neuf du PC, ui, seance, synchro et mesurer passent l'écran
de connexion en invité (terramemo.accueil posé, sans pseudo : rien n'est
publié) ; ui_accueil l'éprouve à part.
Mode d'emploi, pièges et dépannage : SKILL.md à côté.
"""
import argparse
import base64
import collections
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import select
import signal
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
# Clé de signature unique de l'APK (décision « Signature de l'APK ») : jamais dans le
# dépôt ; son certificat (public) est vérifié avant toute installation, car un APK signé
# autrement ne peut remplacer l'appli qu'en la désinstallant, journal et compte compris.
SIGNATURE = pathlib.Path.home() / "Sauvegardes/terramemo/cle-apk/cle.properties"
EMPREINTE_APK = "4F9CD6CEBAC6D2202F03BB03F6FB09F8EE69DA8CC956C03B3590302D7A98B8CB"  # SHA-256 du certificat
APK = RACINE / "android/app/build/outputs/apk/debug/app-debug.apk"
# Synchro coupée pendant un essai (src/sync/drapeaux.ts, étude du J1b § 8) :
# posé par Session.couper_synchro au début de chaque commande, retiré à la fin.
DRAPEAU_SANS_SYNCHRO = "terramemo.sans-synchro"
# Choix gardé de l'écran de connexion de la première ouverture (src/vues/accueil.ts) :
# posé à « invite » sur le profil neuf du PC par Session.passer_accueil (le pilote
# arrive alors sur la carte, comme un joueur qui a déjà choisi) ; ui_accueil le
# retire pour éprouver le panneau. Jamais posé sur un appareil de l'utilisateur.
CLE_ACCUEIL = "terramemo.accueil"
ATTENTE_STOCKAGE_MS = 6000  # localStorage de la WebView écrit sur disque (~5 s de délai de Chromium)
SIGNAUX_ARRET = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)
# Journal des réponses de l'appareil (src/journal/depot.ts : base, version, magasin).
BASE_JOURNAL, VERSION_JOURNAL, MAGASIN_JOURNAL = "terramemo-journal", 1, "evenements"
SAUVEGARDES = pathlib.Path.home() / "Sauvegardes/terramemo"  # journal-{date}.json de sauver_journal
URL_SITE = "https://terramemo-geo.web.app/"  # les données de l'utilisateur dans Chrome
URL_APK = "https://localhost/"  # origine de l'APK (Capacitor)
VALIDER_JOURNAL = pathlib.Path(__file__).resolve().parent / "outils/valider_journal.mjs"
FICHIERS_GEO = ("monde.topo.json", "pays.json", "contestees.json", "noms.fr.json", "sources.json")
# La Réunion (#15) : chargée au choix de la série seulement, jamais au premier
# affichage (décision « Hébergement ») ; smoke vérifie l'un et l'autre.
FICHIERS_GEO_REUNION = ("communes.topo.json", "communes.json", "noms.fr.json", "sources.json")
# Les capitales (lot 1 du J2, #4) : chargées au lancement d'une partie de
# capitales, à la première frappe dans la recherche ou pour une séance qui en
# a, jamais au premier affichage ni à l'ouverture de Jouer (sa vignette est
# rangée dans le code) ; smoke et ui_capitales le vérifient.
FICHIERS_GEO_CAPITALES = ("capitales.json", "capitales.fr.json")
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
    nouveau = f"{base}/json/new?{urllib.parse.quote(url, safe=':/?=&')}"
    code, _, corps = http(nouveau, methode="PUT")
    if code == 200:
        return json.loads(corps)
    erreur = f"/json/new en PUT : {code} {corps[:200]!r}"
    code, _, corps = http(nouveau)  # anciens Chrome (GET seul)
    if code == 200:
        return json.loads(corps)
    # Chrome 156 d'Android (A37, 06/11/2026) répond 500 « Could not create
    # new page » au PUT ; Target.createTarget sur le WebSocket du navigateur
    # ouvre l'onglet, qui survit à la fermeture de ce WebSocket.
    version = json.loads(http(f"{base}/json/version", delai=3)[2])
    lien = WebSocket(version["webSocketDebuggerUrl"])
    try:
        cible = Navigateur(lien).commande("Target.createTarget", url=url, delai=15)["targetId"]
    except RuntimeError as e:
        raise RuntimeError(f"{erreur} ; Target.createTarget : {e}") from None
    finally:
        lien.fermer()
    fin = time.monotonic() + delai
    while time.monotonic() < fin:
        code, _, corps = http(f"{base}/json/list", delai=3)
        for onglet in (json.loads(corps) if code == 200 else []):
            if onglet.get("id") == cible and onglet.get("webSocketDebuggerUrl"):
                return onglet
        time.sleep(0.3)
    raise RuntimeError(f"{erreur} ; onglet {cible} ouvert par Target.createTarget, absent de /json/list")


class Session:
    """Un onglet piloté, ouvert selon la cible ; ferme tout à la sortie, et
    retire d'abord le drapeau de synchro coupée (`couper_synchro`), même
    après une erreur."""

    def __init__(self, cible, serie=None, ws_local=False):
        self.cible, self.serie, self.ws_local = cible, serie, ws_local
        self.tube = self.nav = self.page = None
        self.onglet = None
        self.a_retirer = []  # (forward|reverse, port) à défaire à la fin
        self.navigateur = ""
        self.drapeau = None  # origine où couper_synchro a posé DRAPEAU_SANS_SYNCHRO

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

    def couper_synchro(self, url):
        """Pose DRAPEAU_SANS_SYNCHRO (src/sync/drapeaux.ts) sur l'origine de
        `url`, avant toute action du driver : un essai n'envoie rien au vrai
        projet et n'y lit rien (étude du J1b, § 8). __exit__ le retire, même
        après une erreur : resté posé, il couperait la synchro de
        l'utilisateur sans qu'il le sache. Chrome et le PC passent par
        PAGE_SANS_APPLI de l'origine, où rien de l'appli ne tourne ; dans
        l'APK, la page est l'appli elle-même, jamais quittée : on attend
        qu'elle soit à son origine (au démarrage à froid, la WebView est
        d'abord sur about:blank). L'appli relit le drapeau à chaque envoi :
        pas de rechargement. Sur le téléphone, appeler après `reverse`."""
        o = origine(url)
        if self.cible == "webview":
            self._attendre_origine(o)
        elif self._origine_page() != o:
            self.page.goto(urllib.parse.urljoin(o + "/", PAGE_SANS_APPLI))
        self.drapeau = o
        cle = json.dumps(DRAPEAU_SANS_SYNCHRO)
        avant = self.page.js(f"(() => {{ const a = localStorage.getItem({cle}); localStorage.setItem({cle}, '1'); "
                             "return a; })()")
        if self.cible != "local":
            dire(f"synchro coupée sur {o} ({DRAPEAU_SANS_SYNCHRO}, retiré à la fin)"
                 + (" ; il l'était déjà : resté d'une commande interrompue ?" if avant is not None else ""))

    def passer_accueil(self, url):
        """L'écran de connexion de la première ouverture passé en invité, sur le
        profil neuf du PC seulement : le choix gardé (CLE_ACCUEIL = invite) posé
        sur l'origine de `url` avant le premier chargement, sans pseudo (le
        pilote ne publie rien au classement). Pas de drapeau à part : c'est la
        clé qu'un joueur garde en choisissant « Continuer en invité ». Sur le
        téléphone (chrome, webview), rien : le choix est celui de l'utilisateur,
        et mesurer s'arrête si le panneau est ouvert."""
        if self.cible != "local":
            return
        o = origine(url)
        if self._origine_page() != o:
            self.page.goto(urllib.parse.urljoin(o + "/", PAGE_SANS_APPLI))
        self.page.js(f"localStorage.setItem({json.dumps(CLE_ACCUEIL)}, 'invite')")

    def _origine_page(self, delai=30):
        try:
            return self.page.js("location.origin", delai=delai)
        except RuntimeError:  # contexte détruit pendant une navigation
            return None

    def _attendre_origine(self, o, secondes=20):
        fin = time.monotonic() + secondes
        while self._origine_page(delai=5) != o:
            if time.monotonic() > fin:
                raise RuntimeError(f"la page n'arrive pas à {o} en {secondes} s (appli qui ne démarre pas ?)")
            self.page.pause(250)

    def _rendre_synchro(self):
        """Retire le drapeau ; délais courts (une page figée ne bloque pas la
        sortie). Dans la WebView, jamais de navigation (l'appli resterait sur
        un fichier texte), puis 6 s d'attente : Chromium n'écrit le
        localStorage sur disque qu'avec un délai (~5 s), et une installation ou
        une appli fermée juste après garderait le drapeau."""
        o, self.drapeau = self.drapeau, None
        cle = json.dumps(DRAPEAU_SANS_SYNCHRO)
        try:
            if self._origine_page(delai=5) != o:
                if self.cible == "webview":
                    raise RuntimeError(f"la WebView n'est plus sur {o}")
                self.page.goto(urllib.parse.urljoin(o + "/", PAGE_SANS_APPLI), delai=10)
            if self.page.js(f"(localStorage.removeItem({cle}), localStorage.getItem({cle}))", delai=5) is not None:
                raise RuntimeError("toujours là après removeItem")
            if self.cible == "webview":
                self.page.pause(ATTENTE_STOCKAGE_MS)
            if self.cible != "local":
                dire(f"synchro rendue sur {o} ({DRAPEAU_SANS_SYNCHRO} retiré)")
        except Exception as e:  # nettoyage : jamais d'exception par-dessus celle de la commande
            if self.cible == "local":
                return  # profil neuf du PC, effacé à la fermeture
            dire(f"ATTENTION : {DRAPEAU_SANS_SYNCHRO} est RESTÉ POSÉ sur {o} ({self.cible}) : la synchro de "
                 f"l'utilisateur y reste coupée ({e}). Le retirer : relancer une commande du driver sur "
                 "l'appareil (sauver_journal suffit, elle le retire à la fin)"
                 + (f", ou ouvrir {o}/?sans-synchro=0 dans Chrome" if self.cible == "chrome" else "")
                 + ". Débogage USB coupé ? Le rallumer sur le téléphone.")

    def __exit__(self, *exc):
        # Un Ctrl-C ou un SIGTERM pendant le nettoyage attend sa fin (drapeau
        # retiré, forwards défaits), puis s'applique.
        recus, anciens = [], {}
        for sig in SIGNAUX_ARRET:
            try:
                anciens[sig] = signal.signal(sig, lambda n, _f: recus.append(n))
            except (ValueError, OSError):
                pass
        try:
            self._nettoyer()
        finally:
            for sig, h in anciens.items():
                signal.signal(sig, h)
        if recus:
            dire("interruption reçue pendant le nettoyage : appliquée après lui")
            if signal.SIGINT in recus:
                raise KeyboardInterrupt
            raise SystemExit(143)

    def _nettoyer(self):
        if self.drapeau and self.page:
            self._rendre_synchro()
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
    for nom in FICHIERS_GEO + tuple("reunion/" + n for n in FICHIERS_GEO_REUNION) + FICHIERS_GEO_CAPITALES:
        code, _, corps = http(base + "geo/" + nom)
        try:
            json.loads(corps)
            valide = True
        except ValueError:
            valide = False
        verifier(f"geo/{nom}", code == 200 and valide, f"-> {code}, {len(corps)} octets, JSON {'valide' if valide else 'INVALIDE'}")
    with Session("local") as s:
        s.couper_synchro(base)
        p = s.page
        p.emuler(TELEPHONE, tactile=True)
        debut = time.monotonic()
        try:
            p.goto(base + "?mesures=0")
            periode = p.attendre_carte(args.budget)
            verifier("carte peinte", True, f"en {time.monotonic() - debut:.1f} s, période {periode} ms")
            # Rendu par défaut : canvas (décision « Rendu par défaut », RENDU_DEFAUT de
            # src/main.ts). Aucun path.pays : le dernier dessin dit ce qui est tracé.
            n = p.js("[document.querySelector('#carte').dataset.rendu, document.querySelector('#carte').dataset.dessin,"
                     " window.terramemo.carte.dessin(), +document.querySelector('#carte').dataset.disques, window.terramemo.version]")
            d = n[2] or {}
            verifier("rendu par défaut canvas", n[0] == "canvas", f"rendu {n[0]}, version {n[4]}")
            verifier("tracés des pays", n[1] == "complet" and (d.get("parties") or 0) > 150,
                     f"dessin {n[1]}, {d.get('parties')} parties, {d.get('emis')} sommets émis, {n[3]} pastilles visibles")
            ile = p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/geo/reunion/'))")
            verifier("rien de l'île au premier affichage", not ile, ", ".join(ile) or "aucune ressource /geo/reunion/ après pret et repos")
            capitales = p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/geo/capitales'))")
            verifier("rien des capitales au premier affichage", not capitales, ", ".join(capitales) or "aucune ressource /geo/capitales* après pret et repos")
        except RuntimeError as e:
            verifier("carte peinte", False, str(e))
        # Rendus SVG (au choix dans ⚙) : un path.pays par entité.
        try:
            p.goto(base + "?rendu=css&mesures=0")
            p.attendre_carte(args.budget)
            n = p.js("[document.querySelectorAll('path.pays').length, document.querySelectorAll('circle.pastille').length,"
                     " document.querySelector('#carte').dataset.rendu]")
            verifier("tracés des pays en SVG (?rendu=css)", n[2] == "css" and n[0] > 150, f"{n[0]} path.pays, {n[1]} pastilles visibles, rendu {n[2]}")
        except RuntimeError as e:
            verifier("tracés des pays en SVG (?rendu=css)", False, str(e))
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


def visible(page, selecteur):
    return page.js(f"(() => {{ const e = document.querySelector({json.dumps(selecteur)}); return !!e && !e.hidden; }})()")


def attendre_visible(page, selecteur, delai_s=15):
    fin = time.monotonic() + delai_s
    while not visible(page, selecteur):
        if time.monotonic() > fin:
            raise RuntimeError(f"{selecteur} pas affiché en {delai_s} s")
        page.pause(100)


def cliquer(page, selecteur):
    if not page.js(f"(() => {{ const e = document.querySelector({json.dumps(selecteur)}); if (!e) return false; e.click(); return true; }})()"):
        raise RuntimeError(f"rien à cliquer : {selecteur}")


def texte(page, selecteur):
    return page.js(f"(document.querySelector({json.dumps(selecteur)}) || {{}}).innerText || ''")


EPREUVES = ("chrono", "sansfaute", "minute")
# Les séries des pays dans Jouer, dans l'ordre de partout (décision « Écran Jouer »).
SERIES_PAYS = ["tous", "Africa", "North America", "South America", "Asia", "Europe", "Oceania"]


def niveau_jouer(page):
    """Le niveau affiché de Jouer (racine, sujets, series, exercices) ; None s'il est fermé."""
    return page.js("(() => { const p = document.getElementById('jouer-panneau'); return p && !p.hidden ? p.dataset.niveau : null; })()")


def jouer_jusqua(page, mode, serie, sujet=None):
    """Les exercices de cette série dans l'arbre de Jouer (décision « Écran
    Jouer »), au doigt : la branche (Entraînement pour localiser et nommer,
    Classé pour les épreuves), le sujet (`sujet`, sinon Communes pour l'île,
    Pays ailleurs), la série (niveau sauté pour l'île)."""
    branche = "classe" if mode in EPREUVES else "entrainement"
    sujet = sujet or ("communes" if serie == "reunion" else "pays")
    page.js('location.hash = "#jouer"')
    attendre_visible(page, "#jouer-panneau")
    cliquer(page, f'#jouer-panneau [data-branche="{branche}"]')
    cliquer(page, f'#jouer-panneau [data-sujet="{sujet}"]')
    if niveau_jouer(page) == "series":
        cliquer(page, f'#jouer-panneau [data-serie="{serie}"]')
    if niveau_jouer(page) != "exercices":
        raise RuntimeError(f"Jouer : pas d'exercices pour {mode} sur {serie} (niveau {niveau_jouer(page)})")


def jouer_partie(page, mode, serie, sujet=None):
    """Une partie par Jouer (jouer_jusqua, puis l'exercice : localiser, nommer,
    chrono, sansfaute ou minute), la partie en cours abandonnée ; attend sa
    barre (l'île, les capitales se chargent au premier choix)."""
    jouer_jusqua(page, mode, serie, sujet)
    cliquer(page, f'#jouer-panneau [data-mode="{mode}"]')
    attendre_visible(page, "#barre-chrono" if mode in EPREUVES else "#barre-nommer" if mode == "nommer" else "#barre-essai")


def ui_credits(p, capturer, defauts):
    """Captures 6b à 6d (J1a, #20) : l'écran Crédits ouvert par « Crédits et
    licences » de ⚙ (popup ouverte en entrant), en haut puis en bas, les
    textes des licences dépliés, et « Retour » qui ramène à la carte. DÉFAUT
    s'il manque une donnée, une bibliothèque (AndroidX compris), la police,
    la date de l'IGN, si les textes des licences ne viennent pas, ou si
    « Retour » ne ramène pas à la carte."""
    cliquer(p, "#lien-credits")
    attendre_visible(p, "#vue-credits")
    p.pause(400)
    # La date de l'IGN arrive par un fetch (sources.json de l'île) : sur le site en
    # ligne, plus de 400 ms depuis La Réunion. Jusqu'à 8 s avant d'en faire un DÉFAUT.
    fin = time.monotonic() + 8
    while "à jour au" not in texte(p, "#vue-credits") and time.monotonic() < fin:
        p.pause(200)
    vue = p.js("document.body.dataset.vue")
    texte_credits = texte(p, "#vue-credits")
    attendus = ["Natural Earth", "Domaine public", "Unicode CLDR", "Unicode License v3", "ADMIN\u00a0EXPRESS",
                "Licence\u00a0Ouverte\u00a02.0", "à jour au", "ts-fsrs", "d3-geo", "topojson-client", "earcut",
                "firebase", "@capacitor/core", "AndroidX", "Apache Cordova", "Inter", "SIL Open Font License 1.1"]
    manque = [m for m in attendus if m not in texte_credits]
    dire(f"  Crédits : vue {vue!r}, {len(texte_credits)} caractères, manque {manque}")
    if vue != "credits" or manque:
        defauts.append(f"écran Crédits : vue {vue!r}, manque {manque}")
    if p.js("!document.getElementById('settings-popup').hidden"):
        defauts.append("⚙ › Crédits : la popup reste ouverte sur l'écran")
    capturer("6b-credits")
    p.js("document.getElementById('vue-credits').scrollTop = 1e6")
    p.pause(300)
    capturer("6c-credits-bas")
    # Les textes des licences (#20), dépliés : téléchargés à l'ouverture (licences-tierces.txt).
    cliquer(p, "#credits-licences summary")
    fin = time.monotonic() + 8
    while "END OF TERMS AND CONDITIONS" not in texte(p, "#credits-licences-texte") and time.monotonic() < fin:
        p.pause(200)
    lu = texte(p, "#credits-licences-texte")
    manque = [m for m in ("ts-fsrs", "Charles Karney", "org.apache.cordova:framework", "Apache Cordova\nCopyright",
                          "END OF TERMS AND CONDITIONS") if m not in lu]
    dire(f"  Crédits, textes des licences : {len(lu)} caractères, manque {manque}")
    if manque:
        defauts.append(f"textes des licences : {len(lu)} caractères, manque {manque} ({lu[:80]!r})")
    p.js("document.getElementById('credits-licences').scrollIntoView()")
    p.pause(300)
    capturer("6d-credits-licences")
    cliquer(p, "#credits-retour")
    p.pause(400)
    if p.js("document.body.dataset.vue") != "carte":
        defauts.append(f"« Retour » des Crédits : vue {p.js('document.body.dataset.vue')} au lieu de la carte")


def ui_epreuves(p, capturer, defauts):
    """Captures 20 à 23 (#14, décision « Sans faute et Minute ») : Sans faute
    sur l'Amérique du Sud, deux justes puis une erreur, jusqu'au bilan ; Minute
    sur l'Amérique du Sud, une erreur au premier toucher (rétroaction, jauge de
    la minute), puis tout juste jusqu'à la série vidée."""
    consigne = 'document.querySelector("#barre-chrono .essai-consigne").dataset.cible'
    bilan = '!document.getElementById("chrono-bilan").hidden'

    def toucher(ident):
        pt = position(p, ident)
        p.toucher(pt["x"], pt["y"])

    def faux_de(cible):
        return "ARG" if cible == "BRA" else "BRA"

    def jusqu_au_bilan(fin_s=40):
        fin = time.monotonic() + fin_s
        while not p.js(bilan) and time.monotonic() < fin:
            p.pause(100)

    jouer_partie(p, "sansfaute", "South America")
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    for i in range(3):
        cible = p.js(consigne)
        toucher(cible if i < 2 else faux_de(cible))
        p.pause(300)
        if i < 2:
            p.pause(700)  # la rétroaction d'une juste (0,9 s)
    dire(f"  Sans faute, erreur : {texte(p, '#barre-chrono .essai-retro')!r}")
    capturer("20-sansfaute-faux")
    jusqu_au_bilan(5)
    lu = p.js('document.getElementById("chrono-bilan").innerText')
    dire(f"  Sans faute, bilan : {lu!r}")
    if "2 d'affilée" not in lu:
        defauts.append(f"Sans faute : bilan sans « 2 d'affilée » ({lu!r})")
    titre = texte(p, "#chrono-bilan h2")
    if titre != "Sans faute · Amérique du Sud":
        defauts.append(f"bilan de Sans faute titré {titre!r}")
    capturer("21-sansfaute-bilan")
    croix_vers_carte(p, defauts, "bilan de Sans faute", "#chrono-bilan")

    jouer_partie(p, "minute", "South America")
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    toucher(faux_de(p.js(consigne)))
    p.pause(300)
    dire(f"  Minute, erreur : {texte(p, '#barre-chrono')!r}")
    capturer("22-minute-faux")
    p.pause(1600)  # la rétroaction d'une erreur (1,8 s)
    for _ in range(14):
        if p.js(bilan):
            break
        toucher(p.js(consigne))
        p.pause(1000)
    jusqu_au_bilan(5)
    lu = p.js('document.getElementById("chrono-bilan").innerText')
    dire(f"  Minute, bilan : {lu!r}")
    if "série vidée" not in lu or "1 erreur" not in lu:
        defauts.append(f"Minute : bilan sans « série vidée » ni « 1 erreur » ({lu!r})")
    titre = texte(p, "#chrono-bilan h2")
    if titre != "Minute · Amérique du Sud":
        defauts.append(f"bilan de Minute titré {titre!r}")
    capturer("23-minute-bilan")
    croix_vers_carte(p, defauts, "bilan de Minute", "#chrono-bilan")


def panneau_jouer(p, defauts, quoi):
    """Le panneau de Jouer tient dans l'écran (rien ne déborde, 1 100 px au
    plus) et couvre la carte presque en entier (12 px de marge, 8 sur le
    téléphone : choix du 09/11), ses gros boutons font 48 px au moins, « ‹ » et « × » 44 px, et
    aucun n'est en bleu plein (le bleu reste au bouton Jouer de l'en-tête) ;
    aucune série « essai » ; aucun nom coupé au milieu d'un mot (un .jouer-nom
    sur plus de lignes qu'il n'a de mots : « Entraînemen / t » à 320 px, que
    le contrôle du débordement ne voit pas). Ajoute à `defauts` ce qui manque."""
    m = p.js("""(() => { const p = document.getElementById('jouer-panneau'), r = p.getBoundingClientRect(),
        accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        sonde = document.createElement('i'); sonde.style.color = accent; document.body.append(sonde);
        const bleu = getComputedStyle(sonde).color; sonde.remove();
        const els = [...p.querySelectorAll('button, a')].filter(e => e.getClientRects().length).map(e => {
            const b = e.getBoundingClientRect(), s = getComputedStyle(e);
            return { t: e.textContent.trim().slice(0, 32), l: b.left, r: b.right, h: b.height, w: b.width, cls: e.className, fond: s.backgroundColor }; });
        const z = p.parentElement.getBoundingClientRect();
        return { large: p.scrollWidth > p.clientWidth + 1, l: r.left, r: r.right, w: r.width, haut: r.top, largeur: innerWidth, bleu,
                 vide: Math.max(r.top - z.top, z.bottom - r.bottom), zl: z.width,
                 hors: els.filter(e => e.l < r.left - 1 || e.r > r.right + 1).map(e => e.t),
                 petits: els.filter(e => e.cls.includes('jouer-bouton') && e.h < 48).map(e => `${e.t} (${Math.round(e.h)} px)`),
                 icones: els.filter(e => e.cls.includes('jouer-icone') && (e.h < 44 || e.w < 44)).map(e => e.t),
                 bleus: els.filter(e => e.fond === bleu).map(e => e.t),
                 sans_vignette: [...p.querySelectorAll('.jouer-bouton')].filter(b => !b.querySelector('.jouer-vignette svg path')).map(b => b.textContent.trim().slice(0, 32)),
                 essai: !!p.querySelector('[data-serie="essai"]') || p.innerText.includes('Essai J0'),
                 coupes: [...p.querySelectorAll('.jouer-nom')].filter(e => {
                     const g = document.createRange(); g.selectNodeContents(e);
                     const lignes = new Set([...g.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size;
                     return lignes > e.textContent.trim().split(/\\s+/).length; }).map(e => e.textContent.trim()) }; })()""")
    if m["large"] or m["hors"] or m["l"] < 0 or m["r"] > m["largeur"] or m["haut"] < 0:
        defauts.append(f"{quoi} : le panneau de Jouer déborde ({m['l']:.0f}–{m['r']:.0f} sur {m['largeur']}, en haut à {m['haut']:.0f}) ; hors du panneau : {m['hors']}")
    if m["w"] > 1101:
        defauts.append(f"{quoi} : panneau de Jouer de {m['w']:.0f} px (1 100 au plus)")
    if m["vide"] > 13 or (m["zl"] <= 1124 and m["w"] < m["zl"] - 25):
        defauts.append(f"{quoi} : le panneau de Jouer ne couvre pas la carte ({m['w']:.0f} px de large sur {m['zl']:.0f}, {m['vide']:.0f} px de vide en haut ou en bas)")
    if m["petits"]:
        defauts.append(f"{quoi} : boutons de Jouer sous 48 px : {m['petits']}")
    if m["icones"]:
        defauts.append(f"{quoi} : « ‹ » ou « × » sous 44 px : {m['icones']}")
    if m["bleus"]:
        defauts.append(f"{quoi} : bouton bleu dans Jouer : {m['bleus']}")
    if m["sans_vignette"]:
        defauts.append(f"{quoi} : boutons de Jouer sans vignette (carte ou icône) : {m['sans_vignette']}")
    if m["essai"]:
        defauts.append(f"{quoi} : une série « essai » dans Jouer")
    if m["coupes"]:
        defauts.append(f"{quoi} : nom coupé au milieu d'un mot dans Jouer : {m['coupes']}")


LIBELLE_CROIX = "Retour à la carte"  # textes.croix.carte
LIBELLE_CROIX_REGLAGES = "Fermer les paramètres"  # textes.croix.reglages


def croix_de(p, conteneur):
    """La « × » visible de ce conteneur (#18) et ce qui l'entoure : centre,
    taille, libellé, si elle est bien sous le doigt en son centre
    (elementFromPoint), et ce qu'elle chevauche : le texte des titres,
    paragraphes, libellés (rectangles de leurs lignes, pas de leur boîte : le
    titre passe à côté d'elle, sa boîte non) et les boutons, liens, champs ;
    None sans « × » visible."""
    return p.js(f"""(() => {{ const c = document.querySelector({json.dumps(conteneur)});
      const x = c && [...c.querySelectorAll('.croix')].find(e => e.getClientRects().length);
      if (!x) return null;
      const r = x.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const sous = document.elementFromPoint(cx, cy);
      const chevauche = q => q.width > 0 && q.left < r.right - 1 && r.left < q.right - 1 && q.top < r.bottom - 1 && r.top < q.bottom - 1;
      const nom = e => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + ' ' + e.textContent.trim().slice(0, 24);
      const lignes = e => {{ const g = document.createRange(); g.selectNodeContents(e); return [...g.getClientRects()]; }};
      const vis = e => e !== x && !x.contains(e) && e.getClientRects().length;
      const textes = [...c.querySelectorAll('h1, h2, h3, p, li, label, summary')].filter(vis).filter(e => lignes(e).some(chevauche)).map(nom);
      const commandes = [...c.querySelectorAll('button, a, input, select, .seg')].filter(vis).filter(e => [...e.getClientRects()].some(chevauche)).map(nom);
      return {{ x: cx, y: cy, l: r.width, h: r.height, gauche: r.left, droite: r.right, haut: r.top, largeur: innerWidth,
               libelle: x.getAttribute('aria-label'), titre: x.getAttribute('title'), texte: x.textContent.trim(),
               sous_le_doigt: !!sous && x.contains(sous), chevauche: [...textes, ...commandes] }}; }})()""")


def verifier_croix(p, defauts, quoi, conteneur, libelle=LIBELLE_CROIX, chevauchement=True):
    """La « × » de cet écran (#18) : visible, 44 px, dans l'écran, sous le
    doigt en son centre, libellée, sans rien chevaucher (chevauchement faux :
    écran défilé, où le texte passe sous la « × » collée en haut). Rend son
    centre, ou None (DÉFAUT) s'il n'y en a pas."""
    m = croix_de(p, conteneur)
    if not m:
        defauts.append(f"{quoi} : pas de « × » visible ({conteneur} .croix)")
        return None
    dire(f"  {quoi}, « × » : {m['l']:.0f}×{m['h']:.0f} px à ({m['gauche']:.0f}, {m['haut']:.0f}), chevauche {m['chevauche']}")
    if m["l"] < 44 or m["h"] < 44:
        defauts.append(f"{quoi} : « × » de {m['l']:.0f}×{m['h']:.0f} px (44 au moins)")
    if m["gauche"] < 0 or m["droite"] > m["largeur"] or m["haut"] < 0:
        defauts.append(f"{quoi} : « × » hors de l'écran ({m['gauche']:.0f}–{m['droite']:.0f} sur {m['largeur']}, en haut à {m['haut']:.0f})")
    if not m["sous_le_doigt"]:
        defauts.append(f"{quoi} : « × » couverte en son centre")
    if chevauchement and m["chevauche"]:
        defauts.append(f"{quoi} : « × » sur {m['chevauche']}")
    if m["texte"] != "×" or m["libelle"] != libelle or m["titre"] != libelle:
        defauts.append(f"{quoi} : « × » {m['texte']!r} libellée {m['libelle']!r} / {m['titre']!r} au lieu de {libelle!r}")
    return m


def croix_vers_carte(p, defauts, quoi, conteneur, capturer=None, capture=None):
    """La « × » de cet écran (verifier_croix), puis touchée au doigt (à la
    souris sur PC) : la carte (#carte, vue carte), l'écran fermé. DÉFAUT
    sinon. `capture` : prise avant le toucher."""
    m = verifier_croix(p, defauts, quoi, conteneur)
    if capture:
        capturer(capture)
    if not m:
        return
    p.toucher(m["x"], m["y"])
    p.pause(500)
    ou = [p.js("location.hash"), p.js("document.body.dataset.vue")]
    ouvert = p.js(f"(() => {{ const c = document.querySelector({json.dumps(conteneur)}); return !!c && c.getClientRects().length > 0; }})()")
    if ou != ["#carte", "carte"] or ouvert:
        defauts.append(f"{quoi} : « × » mène à {ou}{', écran encore ouvert' if ouvert else ''} au lieu de la carte")


def ui_croix(p, capturer, defauts):
    """Captures 60 à 65 (#18 : « toujours moyen de revenir à la carte depuis
    un menu ») : chaque écran qui couvre la carte a sa « × » (verifier_croix),
    qui mène à la carte (croix_vers_carte) : ⚙ (la popup se ferme, la carte
    est dessous), la Saisie, Crédits, Confidentialité, Compte (s'il se
    montre), 🏆 (liste, puis le détail d'une épreuve), les bilans de Toucher
    et de Reconnaître. Ceux des épreuves (9, 21, 23) se vérifient à leur
    capture, ceux des séances (34, 37) dans ui_seance ; la « × » de Jouer
    dans ui_jouer et ui_jouer_parties."""
    p.js('location.hash = "#carte"')
    p.pause(300)
    cliquer(p, "#settings-btn")
    p.pause(200)
    m = verifier_croix(p, defauts, "⚙", "#settings-popup", LIBELLE_CROIX_REGLAGES)
    capturer("60-croix-reglages")
    if m:
        p.toucher(m["x"], m["y"])
        p.pause(300)
        if not p.js("document.getElementById('settings-popup').hidden") or p.js("document.body.dataset.vue") != "carte":
            defauts.append(f"⚙ : « × » ne ferme pas la popup sur la carte (vue {p.js('document.body.dataset.vue')})")
    for vue, conteneur, capture in (("saisie", "#vue-saisie", None), ("credits", "#vue-credits", None),
                                    ("confidentialite", "#vue-confidentialite", "61-croix-confidentialite")):
        p.js(f'location.hash = "#{vue}"')
        attendre_visible(p, conteneur)
        p.pause(400)
        if vue == "credits":
            # Défilés jusqu'en bas (licences dépliées par ui_credits) : la « × » reste à portée, collée en haut.
            p.js("document.getElementById('vue-credits').scrollTop = 1e6")
            p.pause(300)
            verifier_croix(p, defauts, "Crédits, en bas", conteneur, chevauchement=False)
            capturer("61b-croix-credits-bas")
            p.js("document.getElementById('vue-credits').scrollTop = 0")
            p.pause(300)
        croix_vers_carte(p, defauts, vue, conteneur, capturer, capture)
    if p.js("!document.getElementById('reglage-compte').hidden"):
        p.js('location.hash = "#compte"')
        fin = time.monotonic() + 15
        while not visible(p, "#vue-compte") and time.monotonic() < fin:
            p.pause(200)
        p.pause(400)
        croix_vers_carte(p, defauts, "Compte", "#vue-compte" if visible(p, "#vue-compte") else "#compte-attente", capturer, "62-croix-compte")
    else:
        dire("  Compte : caché (comptes fermés au public), sans « × » à vérifier")
    cliquer(p, "#classement-btn")
    attendre_visible(p, "#classement-general")
    p.pause(800)
    croix_vers_carte(p, defauts, "🏆", "#classement-general")
    cliquer(p, "#classement-btn")
    attendre_visible(p, "#classement-general .essai-serie")
    cliquer(p, "#classement-general .essai-serie")
    p.pause(1200)  # les dix premiers se lisent en ligne
    croix_vers_carte(p, defauts, "🏆, une épreuve", "#classement-general", capturer, "63-croix-classement-epreuve")
    jouer_partie(p, "localiser", "Europe")
    cliquer(p, "#essai-terminer")
    attendre_visible(p, "#essai-bilan")
    croix_vers_carte(p, defauts, "bilan de Trouver", "#essai-bilan", capturer, "64-croix-trouver-bilan")
    jouer_partie(p, "nommer", "Europe")
    cliquer(p, "#nommer-terminer")
    attendre_visible(p, "#essai-bilan")
    croix_vers_carte(p, defauts, "bilan de Reconnaître", "#essai-bilan", capturer, "65-croix-reconnaitre-bilan")


def ui_jouer(p, capturer, defauts):
    """Captures 15 à 15e (décision « Écran Jouer », #18) : l'arbre de Jouer,
    après les épreuves (records de l'Amérique du Sud). Sujets : Pays,
    Capitales, Communes sous Entraînement ; Pays, Communes sous Classé.
    `15-jouer` (Entraînement et Classé, sans Rejouer), `15b-classe-sujets`,
    `15c-classe-pays-series` (les 7 séries dans l'ordre), `15d-classe-pays-
    ams-epreuves` (les trois épreuves, leurs records, les règles ouvertes par
    « ? »), `15e-entrainement-communes` (le niveau des séries sauté) ; le
    retour arrière et « ‹ » remontent d'un niveau, une adresse invalide
    retombe sur le niveau le plus proche, « × » ramène à la carte."""
    def lire(attr):
        return p.js(f"[...document.querySelectorAll('#jouer-panneau [{attr}]')].map(b => b.getAttribute('{attr}'))")

    def ou():
        return [p.js("decodeURIComponent(location.hash)"), niveau_jouer(p)]

    p.js('location.hash = "#carte"')
    p.pause(300)
    cliquer(p, "#jouer-btn")
    attendre_visible(p, "#jouer-panneau")
    if lire("data-branche") != ["entrainement", "classe"]:
        defauts.append(f"Jouer sans ses deux branches : {lire('data-branche')}")
    if p.js("!!document.querySelector('#jouer-rejouer')"):
        defauts.append("Jouer : « Rejouer » en tête de Jouer (choix du 10/11 : il ne vit plus qu'au bilan)")
    panneau_jouer(p, defauts, "Jouer")
    capturer("15-jouer")
    # Les sujets, dans l'ordre de D53 b (Communes en dernier) ; Capitales sous Entraînement seulement (ses épreuves : partie C du lot 1).
    cliquer(p, '#jouer-panneau [data-branche="entrainement"]')
    if lire("data-sujet") != ["pays", "capitales", "communes"]:
        defauts.append(f"Entraînement : sujets {lire('data-sujet')} au lieu de Pays, Capitales, Communes")
    cliquer(p, "#jouer-haut")
    p.pause(300)
    cliquer(p, '#jouer-panneau [data-branche="classe"]')
    if lire("data-sujet") != ["pays", "communes"]:
        defauts.append(f"Classé : sujets {lire('data-sujet')} au lieu de Pays, Communes")
    panneau_jouer(p, defauts, "Classé")
    capturer("15b-classe-sujets")
    cliquer(p, '#jouer-panneau [data-sujet="pays"]')
    series = lire("data-serie")
    dire(f"  Classé › Pays : {series}")
    if series != SERIES_PAYS:
        defauts.append(f"Classé › Pays sans ses 7 séries dans l'ordre : {series}")
    panneau_jouer(p, defauts, "Classé › Pays")
    capturer("15c-classe-pays-series")
    cliquer(p, '#jouer-panneau [data-serie="South America"]')
    modes = lire("data-mode")
    records = p.js("[...document.querySelectorAll('#jouer-panneau [data-mode]')].map(b => (b.querySelector('.jouer-record') || {}).innerText || '')")
    fil = texte(p, "#jouer-panneau .jouer-fil")
    dire(f"  Classé › Pays › Amérique du Sud : {modes}, records {records}, fil {fil!r}")
    if modes != list(EPREUVES):
        defauts.append(f"Classé › Pays › série sans ses 3 épreuves : {modes}")
    if not all(records):
        defauts.append(f"Classé › Pays › Amérique du Sud : un record manque ({records})")
    if [x.strip() for x in fil.split("›")] != ["Classé", "Pays", "Amérique du Sud"]:
        defauts.append(f"fil d'Ariane {fil!r} au lieu de « Classé › Pays › Amérique du Sud »")
    cliquer(p, "#jouer-aide")
    if not visible(p, "#jouer-regles"):
        defauts.append("« ? » n'ouvre pas les règles des épreuves")
    panneau_jouer(p, defauts, "Classé › Pays › Amérique du Sud")
    capturer("15d-classe-pays-ams-epreuves")
    # Le retour arrière remonte d'un niveau, « ‹ » aussi.
    p.js("history.back()")
    p.pause(400)
    if ou() != ["#jouer/classe/pays", "series"]:
        defauts.append(f"retour arrière depuis les épreuves : {ou()} au lieu des séries")
    cliquer(p, "#jouer-haut")
    p.pause(400)
    if ou() != ["#jouer/classe", "sujets"]:
        defauts.append(f"« ‹ » depuis les séries : {ou()} au lieu des sujets")
    # Entraînement › Communes : le niveau des séries (La Réunion seule) est sauté, sans entrée d'historique.
    p.js('location.hash = "#jouer"')
    p.pause(300)
    cliquer(p, '#jouer-panneau [data-branche="entrainement"]')
    cliquer(p, '#jouer-panneau [data-sujet="communes"]')
    p.pause(200)
    dire(f"  Entraînement › Communes : {ou()}, {lire('data-mode')}, fil {texte(p, '#jouer-panneau .jouer-fil')!r}")
    if ou() != ["#jouer/entrainement/communes/reunion", "exercices"] or lire("data-mode") != ["apprendre", "localiser", "nommer"]:
        defauts.append(f"Communes ne saute pas la série : {ou()}, {lire('data-mode')}")
    panneau_jouer(p, defauts, "Entraînement › Communes")
    capturer("15e-entrainement-communes")
    p.js("history.back()")
    p.pause(400)
    if ou() != ["#jouer/entrainement", "sujets"]:
        defauts.append(f"retour arrière depuis La Réunion : {ou()} au lieu des sujets (le niveau sauté a une entrée ?)")
    # Une adresse invalide retombe sur le niveau valide le plus proche.
    p.js('location.hash = "#jouer/classe/pays/Atlantide"')
    p.pause(300)
    if ou() != ["#jouer/classe/pays", "series"]:
        defauts.append(f"adresse invalide #jouer/classe/pays/Atlantide : {ou()}")
    # « × » : la vue d'avant Jouer (la carte).
    cliquer(p, "#jouer-fermer")
    p.pause(400)
    if p.js("location.hash") not in ("#carte", "") or not p.js("document.body.dataset.vue === 'carte'"):
        defauts.append(f"« × » de Jouer : {p.js('location.hash')}, vue {p.js('document.body.dataset.vue')}")


def ui_jouer_parties(p, defauts):
    """Jouer et les parties, de bout en bout (relecture de #18 : src/navigation.ts,
    tests/navigation.test.ts pour le détail) : « Abandonner » ramène aux
    exercices de la série, qui disent « Partie abandonnée » ; « Autre série »
    de Toucher mène aux séries, et sur l'île à ses exercices (niveau des
    séries sauté) ; ensuite, #chrono et #toucher tapés (plus de partie ni de
    bilan) mènent à Jouer ; après chacun, « × » ferme Jouer (la carte) au
    lieu de rouvrir la partie, qui renvoyait à Jouer. Sans capture ; DÉFAUT
    à chaque écart. Avant, un bilan resté affiché se remontre (pas Jouer)."""
    def ou():
        return [p.js("decodeURIComponent(location.hash)"), p.js("document.body.dataset.vue"), niveau_jouer(p)]

    def fermer(quoi):
        cliquer(p, "#jouer-fermer")
        p.pause(400)
        if ou()[:2] != ["#carte", "carte"]:
            defauts.append(f"« × » de Jouer après {quoi} : {ou()} au lieu de la carte")

    jouer_partie(p, "chrono", "South America")
    cliquer(p, "#chrono-abandonner")
    p.pause(500)
    statut = texte(p, "#jouer-panneau .jouer-statut")
    dire(f"  Abandonner : {ou()}, statut {statut!r}")
    if ou() != ["#jouer/classe/pays/South America", "jouer", "exercices"] or "abandonnée" not in statut:
        defauts.append(f"« Abandonner » : {ou()}, statut {statut!r}, au lieu des exercices de l'Amérique du Sud qui disent l'abandon")
    fermer("« Abandonner »")

    jouer_partie(p, "localiser", "Europe")
    cliquer(p, "#essai-terminer")
    attendre_visible(p, "#essai-autre")
    cliquer(p, "#essai-autre")
    p.pause(500)
    dire(f"  Toucher, « Autre série » : {ou()}")
    if ou() != ["#jouer/entrainement/pays", "jouer", "series"]:
        defauts.append(f"« Autre série » de Toucher : {ou()} au lieu des séries des pays")
    fermer("« Autre série »")

    jouer_partie(p, "localiser", "reunion")
    cliquer(p, "#essai-terminer")
    attendre_visible(p, "#essai-autre")
    cliquer(p, "#essai-autre")
    p.pause(500)
    dire(f"  La Réunion, « Autre série » : {ou()}")
    if ou() != ["#jouer/entrainement/communes/reunion", "jouer", "exercices"]:
        defauts.append(f"« Autre série » sur l'île : {ou()} au lieu de ses exercices (niveau des séries sauté)")
    fermer("« Autre série » sur l'île")

    # Plus de partie ni de bilan à montrer (abandon, « Autre série ») : l'adresse
    # tapée mène à Jouer, aux exercices de la dernière partie de la vue.
    for vue, attendu in (("chrono", "#jouer/classe/pays/South America"), ("toucher", "#jouer/entrainement/communes/reunion")):
        p.js(f'location.hash = "#{vue}"')
        p.pause(400)
        dire(f"  #{vue} sans partie : {ou()}")
        if ou()[:2] != [attendu, "jouer"]:
            defauts.append(f"#{vue} sans partie : {ou()} au lieu de Jouer ({attendu})")
        fermer(f"#{vue} sans partie")


def cadre_ile(page, barre):
    """L'île à l'écran (union des communes) et le haut de la barre, en px CSS."""
    return page.js(f"""(() => {{
        const rs = [...document.querySelectorAll('#carte-ile path.pays')].map(e => e.getBoundingClientRect());
        const b = document.querySelector({json.dumps(barre)}).getBoundingClientRect();
        const c = document.querySelector('#carte-ile .carte-credit');
        const cr = c && c.getBoundingClientRect();
        const lh = c && parseFloat(getComputedStyle(c).lineHeight);
        return {{ x0: Math.min(...rs.map(r => r.left)), x1: Math.max(...rs.map(r => r.right)),
                 y0: Math.min(...rs.map(r => r.top)), y1: Math.max(...rs.map(r => r.bottom)),
                 n: rs.length, largeur: innerWidth, barre: b.top,
                 credit: c ? c.textContent : null, credit_h: cr ? cr.height : 0, credit_lh: lh || 0,
                 credit_x0: cr ? cr.left : 0, credit_bas: cr ? cr.bottom : 0 }};
    }})()""")


def attendre_fin_vol(p, carte="carte", max_ms=4000):
    """Attend la fin du vol de montrer() : 700 ms (la transition peut ne pas
    avoir commencé, ses premières images bougent à peine), puis deux lectures
    égales de la transformation à 100 ms d'écart (4 s au plus ; le vol dure
    2 s au plus, DUREE_MONTRER_MS de carte.ts). Une durée fixe capturait le
    vol en cours (disques du zoom 1 sur l'Europe)."""
    lire = f"(() => {{ const t = window.terramemo.{carte}.transfo(); return [t.k, t.x, t.y, t.r ?? 0].map(v => Math.round(v * 1000)).join(); }})()"
    p.pause(700)
    avant = p.js(lire)
    for _ in range(max_ms // 100):
        p.pause(100)
        apres = p.js(lire)
        if apres == avant:
            return
        avant = apres


def cible_cadree(p, carte="carte"):
    """La question de Nommer : son point est-il à l'écran, au-dessus de la barre
    (comme doitCadrer) ? Rend (cible, point, haut visible, largeur)."""
    return p.js(f"""(() => {{
      const cible = document.querySelector('#barre-nommer .essai-consigne').dataset.cible;
      const c = window.terramemo.{carte};
      const r = c.rect();
      const haut = document.getElementById('barre-nommer').getBoundingClientRect().top - r.y;
      const p = c.ecran(cible);
      return {{ cible, e: p && [p.x - r.x, p.y - r.y], haut, l: r.largeur, k: c.transfo().k }};
    }})()""")


def verifier_cadrage(p, defauts, quoi, carte="carte"):
    m = cible_cadree(p, carte)
    e = m["e"]
    dire(f"  {quoi} : {m['cible']} à {e and [round(v) for v in e]}, partie visible {m['l']:.0f} × {m['haut']:.0f}, zoom {m['k']:.2f}")
    if not e or not (0 <= e[0] <= m["l"] and 0 <= e[1] <= m["haut"]):
        defauts.append(f"{quoi} : {m['cible']} hors de la partie visible au-dessus de la barre ({e})")
    return m


def ui_reunion(p, capturer, defauts):
    """Captures 10 à 14 (#15) : La Réunion en Localiser (juste puis faux),
    Nommer dans le monde et sur l'île, Chrono de l'île, chacun lancé par
    Jouer ; puis le monde vérifié inchangé. Ajoute à `defauts` ce qui
    est faux (l'île coupée, la mention sur deux lignes, un code INSEE à
    l'écran…)."""
    textes_lus = []

    def lire(nom, selecteur):
        t = texte(p, selecteur)
        textes_lus.append(t)
        dire(f"  {nom} : {t!r}")
        return t

    # Sauf le sources.json de l'île, que l'écran Crédits lit à son ouverture (ui_credits, plus tôt) pour
    # la date de l'IGN ; l'île chargée trop tôt se verrait aux trois autres fichiers, lus avec lui.
    avant = p.js("performance.getEntriesByType('resource').filter(r => r.name.includes('/geo/reunion/') && !r.name.endsWith('/sources.json')).length")
    if avant:
        defauts.append(f"{avant} ressource(s) /geo/reunion/ avant le choix de l'île")
    jouer_partie(p, "localiser", "reunion")
    if p.js("window.terramemo.terrain()") != "reunion":
        defauts.append("Toucher → La Réunion : terrain() n'est pas reunion")
    lire("La Réunion, consigne", "#barre-essai .essai-consigne")
    c = cadre_ile(p, "#barre-essai")
    dire(f"  île : x {c['x0']:.0f}–{c['x1']:.0f} sur {c['largeur']}, y {c['y0']:.0f}–{c['y1']:.0f}, "
         f"barre à y {c['barre']:.0f}, {c['n']} communes ; mention : {c['credit']!r} "
         f"({c['credit_h']:.0f} px de haut, ligne {c['credit_lh']:.0f} px, bas à y {c['credit_bas']:.0f})")
    if c["n"] != 24:
        defauts.append(f"{c['n']} communes tracées au lieu de 24")
    if c["x0"] < 0 or c["x1"] > c["largeur"] or c["y0"] < 0:
        defauts.append("l'île sort de l'écran")
    if c["y1"] > c["barre"]:
        defauts.append(f"le sud de l'île ({c['y1']:.0f}) passe sous la barre ({c['barre']:.0f})")
    if not c["credit"] or "IGN" not in c["credit"]:
        defauts.append("mention de l'IGN absente de la carte de l'île")
    elif c["credit_bas"] > c["y0"]:
        defauts.append("mention de l'IGN sur l'île")
    elif c["largeur"] >= TELEPHONE["largeur"] and c["credit_h"] > 1.5 * c["credit_lh"]:
        defauts.append("mention de l'IGN sur deux lignes à la largeur du téléphone")
    capturer("10-reunion")
    # Les boutons de zoom sur la carte de l'île (SVG, #23), qui revient à sa vue de départ.
    ui_zoom(p, capturer, defauts, p.tactile, "ile")
    # Saint-Denis demandé (« Passer » jusqu'à lui), Saint-Paul touché.
    for _ in range(24):
        if p.js('document.querySelector("#barre-essai .essai-consigne").dataset.cible') == "97411":
            break
        cliquer(p, "#essai-passer")
        p.pause(50)
    pt = p.js('window.terramemo.ile.ecran("97415")')
    p.toucher(pt["x"], pt["y"])
    p.pause(300)
    lire("La Réunion, faux (Saint-Paul pour Saint-Denis)", "#barre-essai .essai-retro")
    capturer("11-reunion-faux")
    # Nommer, l'Europe : la zone allumée, quatre boutons.
    jouer_partie(p, "nommer", "Europe")
    attendre_fin_vol(p)  # le vol éventuel jusqu'à la zone
    verifier_cadrage(p, defauts, "Nommer, Europe")
    lire("Nommer, Europe", "#barre-nommer")
    capturer("12-nommer-monde")
    # Nommer sur l'île : un mauvais choix, rouge et vert.
    jouer_partie(p, "nommer", "reunion")
    p.pause(300)
    m = verifier_cadrage(p, defauts, "Nommer, La Réunion", "ile")
    if abs(m["k"] - 1) > 1e-6:
        defauts.append(f"Nommer, La Réunion : la carte de l'île a bougé (zoom {m['k']:.2f}) au lieu de rester au zoom 1")
    sud = p.js("Math.max(...[...document.querySelectorAll('#carte-ile path.pays')].map(e => e.getBoundingClientRect().bottom)) - window.terramemo.ile.rect().y")
    if sud > m["haut"]:
        defauts.append(f"Nommer, La Réunion : le sud de l'île ({sud:.0f}) passe sous la barre ({m['haut']:.0f})")
    cible = m["cible"]
    faux = p.js(f'[...document.querySelectorAll(".nommer-choix")].map(b => b.dataset.id).find(i => i !== "{cible}")')
    cliquer(p, f'.nommer-choix[data-id="{faux}"]')
    p.pause(200)
    lire("Nommer, La Réunion, faux", "#barre-nommer")
    marques = p.js("[...document.querySelectorAll('.nommer-choix')].map(b => b.className.replace('secondary nommer-choix', '').trim())")
    dire(f"  boutons après le choix : {marques}")
    if sorted(m for m in marques if m) != ["faux", "juste"]:
        defauts.append(f"Nommer : boutons après un mauvais choix {marques} (attendu un faux et un juste)")
    capturer("13-nommer-reunion-retro")
    # Chrono de l'île : la première question et la jauge.
    jouer_partie(p, "chrono", "reunion")
    p.pause(600)
    lire("Chrono, La Réunion", "#barre-chrono")
    capturer("14-chrono-reunion")
    cliquer(p, "#chrono-abandonner")
    p.pause(200)
    # Le monde au retour : la Carte, la Suisse au toucher.
    p.js('location.hash = "#carte"')
    p.pause(300)
    monde = p.js("""(() => { const c = window.terramemo.carte, e = c.ecran("CHE"), r = e && c.pick(e.x, e.y);
        return [window.terramemo.terrain(), r && r.id]; })()""")
    dire(f"  retour sur la Carte : terrain {monde[0]}, pick sur la Suisse {monde[1]}")
    if monde != ["monde", "CHE"]:
        defauts.append(f"le monde a changé au retour : {monde}")
    codes = [t for t in textes_lus if re.search(r"\b974\d\d\b", t)]
    if codes:
        defauts.append(f"code INSEE à l'écran : {codes}")


def visibilite_recherche(p):
    return p.js("getComputedStyle(document.querySelector('header .recherche')).visibility")


def ui_zoom(p, capturer, defauts, telephone, carte="carte"):
    """Boutons de zoom (#23) : sur ordinateur, +, − et « toute la carte » en
    bas à droite de la carte, cliqués à la souris (rien ne les couvre), puis
    les touches + et − ; cachés sur le téléphone (écran tactile) et hors des
    vues de la carte (Jouer). carte : l'aide de la carte visible (« ile »
    pendant une partie à La Réunion)."""
    lire_k = f"window.terramemo.{carte}.transfo().k"
    vu = p.js("""(() => { const g = document.getElementById('zoom-carte'), r = g.getBoundingClientRect(),
        a = document.getElementById('app').getBoundingClientRect();
        return { affiche: getComputedStyle(g).display !== 'none', droite: a.right - r.right, bas: a.bottom - r.bottom,
                 l: r.width, h: r.height }; })()""")
    if telephone:
        dire(f"  zoom ({carte}) : boutons {'affichés' if vu['affiche'] else 'cachés'} sur l'écran tactile")
        if vu["affiche"]:
            defauts.append("boutons de zoom affichés sur le téléphone (écran tactile)")
        return
    if not vu["affiche"]:
        defauts.append(f"boutons de zoom cachés sur ordinateur ({carte})")
        return

    def clic(ident):
        # Une vraie souris au centre du bouton : il reçoit le clic s'il n'est pas couvert.
        c = p.js(f"""(() => {{ const r = document.getElementById('{ident}').getBoundingClientRect();
            return [r.x + r.width / 2, r.y + r.height / 2]; }})()""")
        dessus = p.js(f"document.elementFromPoint({c[0]}, {c[1]})?.closest('#{ident}') != null")
        if not dessus:
            defauts.append(f"bouton {ident} couvert ({carte})")
        p.toucher(c[0], c[1])
        attendre_fin_vol(p, carte)
        return p.js(lire_k)

    def touche(cle):
        for t in ("keyDown", "keyUp"):
            p.cdp("Input.dispatchKeyEvent", type=t, key=cle, text=cle if t == "keyDown" else "")
        attendre_fin_vol(p, carte)
        return p.js(lire_k)

    k0 = p.js(lire_k)
    ks = [clic("zoom-plus"), clic("zoom-plus"), clic("zoom-moins"), touche("+"), touche("-")]
    capturer("1b-zoom" if carte == "carte" else "10b-zoom-ile")
    ks.append(clic("zoom-tout"))
    vus = " → ".join(f"{k:.2f}" for k in [k0, *ks])
    dire(f"  zoom ({carte}) : boutons {vu['l']:.0f}×{vu['h']:.0f} px à {vu['droite']:.0f} px du bord droit, "
         f"{vu['bas']:.0f} du bas ; zoom {vus}")
    attendus = [2 * k0, 4 * k0, 2 * k0, 4 * k0, 2 * k0, 1]
    if any(abs(k - a) > 1e-3 * a for k, a in zip(ks, attendus)):
        defauts.append(f"zoom ({carte}) : {vus}, attendu {' → '.join(f'{a:.2f}' for a in [k0, *attendus])}")
    if carte == "carte":
        # Hors des vues de la carte (Jouer, son panneau en bas) : cachés.
        p.js('location.hash = "#jouer"')
        attendre_visible(p, "#jouer-panneau")
        if p.js("getComputedStyle(document.getElementById('zoom-carte')).display") != "none":
            defauts.append("boutons de zoom affichés dans Jouer")
        p.js('location.hash = "#carte"')
        p.pause(300)


def ui_entete(p, capturer, defauts, telephone):
    """Captures 16 à 19 (décision « En-tête ») : la recherche (sa liste, un
    pays montré, une commune qui ouvre l'île), le classement général. Après
    ui_reunion : le premier usage de la recherche demande les noms des
    communes (/geo/reunion/noms.fr.json)."""
    p.js('location.hash = "#carte"')
    p.pause(300)
    h = p.js("""(() => { const r = document.querySelector('header').getBoundingClientRect(),
        c = document.getElementById('recherche-champ').getBoundingClientRect(),
        j = document.getElementById('jouer-btn').getBoundingClientRect();
        return { haut: r.height, champ: c.width, champ_y: c.top, jouer_y: j.top, droite: j.right, largeur: innerWidth }; })()""")
    dire(f"  en-tête : {h['haut']:.0f} px de haut, champ de {h['champ']:.0f} px")
    if telephone and h["haut"] > 64:
        defauts.append(f"en-tête du téléphone sur plus d'une ligne ({h['haut']:.0f} px)")
    if h["champ"] < 140:
        defauts.append(f"champ de recherche trop étroit ({h['champ']:.0f} px)")
    # Jouer (#19) : son nom toujours lu ; à 360 px et moins, ▶ seul à l'écran (le nom masqué, pas retiré).
    j = p.js("""(() => { const b = document.getElementById('jouer-btn'), n = b.querySelector('.jouer-nom'),
        i = b.querySelector('svg');
        return { nom: b.textContent.trim(), nom_l: n.getBoundingClientRect().width, icone: getComputedStyle(i).display !== 'none',
                 l: b.getBoundingClientRect().width }; })()""")
    dire(f"  Jouer : {j['l']:.0f} px, nom {j['nom']!r} ({j['nom_l']:.0f} px à l'écran), ▶ {'montré' if j['icone'] else 'caché'}")
    etroit = h["largeur"] <= 360
    if j["nom"] != "Jouer" or (etroit and (j["nom_l"] > 1 or not j["icone"])) or (not etroit and j["nom_l"] < 20):
        defauts.append(f"bouton Jouer à {h['largeur']} px : {j}")
    # Le texte d'aide du champ tient sans être coupé (« Pays, commun » à 384 px).
    aide = p.js("""(() => { const c = document.getElementById('recherche-champ'), s = getComputedStyle(c),
        x = document.createElement('canvas').getContext('2d');
        x.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        return [c.placeholder, x.measureText(c.placeholder).width, c.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)]; })()""")
    dire(f"  texte d'aide {aide[0]!r} : {aide[1]:.0f} px pour {aide[2]:.0f}")
    if aide[1] > aide[2]:
        defauts.append(f"texte d'aide de la recherche coupé : {aide[0]!r} ({aide[1]:.0f} px pour {aide[2]:.0f})")
    # Trouver (mode localiser), l'Europe : la recherche s'efface pendant la partie, revient après.
    jouer_partie(p, "localiser", "Europe")
    if visibilite_recherche(p) != "hidden":
        defauts.append("recherche visible pendant une partie")
    cliquer(p, "#essai-terminer")
    p.pause(200)
    if visibilite_recherche(p) != "visible":
        defauts.append("recherche cachée après la partie")
    # La recherche : « sain », pays et communes mêlés.
    p.js('location.hash = "#carte"')
    p.pause(200)
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text="sain")
    p.pause(500)  # les noms des communes, demandés au premier usage
    lus = p.js("[...document.querySelectorAll('#recherche-liste [role=option]')].map(l => l.dataset.terrain + ':' + l.innerText.replace(/\\s+/g, ' '))")
    dire(f"  recherche « sain » : {lus}")
    if not any(x.startswith("reunion:") for x in lus) or not any(x.startswith("monde:") for x in lus):
        defauts.append(f"recherche « sain » : pays et communes attendus, lu {lus}")
    capturer("16-recherche")
    # Le Vatican, à la touche Entrée : la carte vole jusqu'à lui (anneau, minuscule).
    p.js('document.getElementById("recherche-champ").value = ""')
    p.cdp("Input.insertText", text="vatican")
    p.pause(200)
    p.cdp("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    p.cdp("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    attendre_fin_vol(p)
    barre = texte(p, "#barre-carte")
    vat = p.js("""(() => { const c = window.terramemo.carte, e = c.ecran("VAT"), r = c.rect();
        return [document.getElementById('barre-carte').dataset.id, c.transfo().k, !!e && e.x > r.x && e.x < r.x + r.largeur && e.y > r.y && e.y < r.y + r.hauteur]; })()""")
    dire(f"  recherche → Vatican : barre {barre!r}, zoom {vat[1]:.1f}, à l'écran {vat[2]}")
    if vat[0] != "VAT" or vat[1] < 2 or not vat[2]:
        defauts.append(f"recherche → Vatican : {vat}")
    capturer("17-recherche-pays")
    # Saint-Denis, la commune (au doigt) : la carte de l'île, puis « Monde ».
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text="saint-denis")
    p.pause(300)
    cliquer(p, '#recherche-liste [data-terrain="reunion"][data-id="97411"]')
    fin = time.monotonic() + 10
    while p.js("window.terramemo.terrain()") != "reunion" and time.monotonic() < fin:
        p.pause(100)
    attendre_fin_vol(p, "ile")
    barre = texte(p, "#barre-carte")
    dire(f"  recherche → Saint-Denis : terrain {p.js('window.terramemo.terrain()')}, barre {barre!r}")
    if p.js("window.terramemo.terrain()") != "reunion" or "Saint-Denis" not in barre:
        defauts.append(f"recherche → Saint-Denis : terrain {p.js('window.terramemo.terrain()')}, barre {barre!r}")
    capturer("18-recherche-commune")
    cliquer(p, "#carte-monde")
    p.pause(200)
    if p.js("window.terramemo.terrain()") != "monde":
        defauts.append("« Monde » ne ramène pas au monde")
    # Les classements (🏆 : mes places, le général et chaque épreuve), puis « Retour » à la carte.
    cliquer(p, "#classement-btn")
    attendre_visible(p, "#classement-general")
    p.pause(1500)  # le classement se lit en ligne (indisponible sans émulateurs : dit tel quel)
    capturer("19-classement")
    cliquer(p, "#classement-retour")
    p.pause(200)
    if p.js("location.hash") != "#carte":
        defauts.append(f"« Retour » du classement : {p.js('location.hash')}")


def commande_ui(args):
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    telephone = args.width < 700
    ecran = dict(TELEPHONE, largeur=args.width) if telephone else dict(PC, largeur=args.width)
    base = args.url.rstrip("/") + "/"
    # --rendu : la carte du monde dans ce rendu (l'île est toujours en SVG).
    rendu = f"&rendu={args.rendu}" + ("&logiciel=1" if args.rendu == "webgl" else "") if args.rendu else ""
    faites = []
    defauts = []
    with Session("local") as s:
        s.couper_synchro(base)
        s.passer_accueil(base)
        p = s.page
        p.emuler(ecran, tactile=telephone)

        def capturer(nom):
            chemin = out / f"{nom}.png"
            p.pause(350)
            p.capture(chemin)
            faites.append(chemin)

        p.goto(base + "?mesures=0" + rendu + "#carte")
        p.attendre_carte()
        capturer("1-carte")
        ui_zoom(p, capturer, defauts, telephone)
        p.js('window.terramemo.carte.zoomerSur("CHE")')
        pt = position(p, "CHE")
        p.toucher(pt["x"], pt["y"])
        p.pause(300)
        dire(f"  pays touché : {p.js('document.getElementById(\"barre-carte\").textContent')!r}")
        capturer("2-pays-touche")
        # L'Essai J0 (la série que visent les mesures), lancé depuis ⚙ : hors de
        # Jouer (décision « Écran Jouer »), Trouver sur la série « essai ».
        cliquer(p, "#settings-btn")
        cliquer(p, '#reglage-essai [data-mode="localiser"]')
        attendre_visible(p, "#barre-essai")
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
        essai_j0 = p.js("[...document.querySelectorAll('#settings-popup #reglage-essai button[data-mode]')].map(b => b.dataset.mode + ':' + b.textContent)")
        dire(f"  ⚙, Essai J0 : {essai_j0}")
        if essai_j0 != ["localiser:Trouver", "nommer:Reconnaître"]:
            defauts.append(f"⚙ sans l'Essai J0 (Trouver, Reconnaître) : {essai_j0}")
        capturer("6-reglages")
        ui_credits(p, capturer, defauts)
        # Chrono : l'Amérique du Sud (12 pays) jouée jusqu'au bilan, la
        # première question fausse (le Brésil, ou l'Argentine s'il est demandé).
        # Ses exercices dans Jouer d'abord (Classé › Pays › Amérique du Sud).
        jouer_jusqua(p, "chrono", "South America")
        capturer("7-classe-ams-epreuves")
        cliquer(p, '#jouer-panneau [data-mode="chrono"]')
        attendre_visible(p, "#barre-chrono")
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
        croix_vers_carte(p, defauts, "bilan du Chrono", "#chrono-bilan")
        ui_reunion(p, capturer, defauts)
        ui_entete(p, capturer, defauts, telephone)
        ui_epreuves(p, capturer, defauts)
        ui_jouer(p, capturer, defauts)
        ui_jouer_parties(p, defauts)
        ui_croix(p, capturer, defauts)
        # Avant la séance : sa grappe de capitales (Océanie) finie, la Révision du jour reste « À jour » après celle des pays.
        ui_capitales(p, capturer, defauts, base, rendu)
        ui_seance(p, capturer, defauts, base, rendu)
        # En dernier : il donne un pseudo à l'invité (retiré ensuite), qu'aucune partie ne doit publier.
        ui_accueil(p, capturer, defauts, base, rendu)
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures ({ecran['largeur']}×{ecran['hauteur']}, DPR {ecran['dpr']}) dans {out} — "
         "à regarder : carte vide, pays non marqué ou texte coupé = échec")
    return 1 if erreurs or defauts else 0


# --- Séance du J1a (#2) : Révision du jour, Apprendre, carte retournée ------

COMPTER_JOURNAL = """new Promise(async ok => {
  const bases = indexedDB.databases ? await indexedDB.databases() : [];
  if (!bases.some(b => b.name === 'terramemo-journal')) return ok(0);
  const r = indexedDB.open('terramemo-journal');
  r.onerror = () => ok(-1);
  r.onsuccess = () => { const db = r.result;
    if (!db.objectStoreNames.contains('evenements')) { db.close(); return ok(-1); }
    const c = db.transaction('evenements').objectStore('evenements').count();
    c.onsuccess = () => { ok(c.result); db.close(); }; c.onerror = () => { ok(-1); db.close(); }; };
})"""
# Une requête vers Firestore ou l'Auth de Firebase (la séance n'envoie rien au J1a).
MOTIF_FIREBASE = re.compile(r"firestore\.googleapis|identitytoolkit|securetoken|firebaseinstallations|googleapis\.com/google\.firestore")
PAUSE_AVANT_TOUCHER_MS = 400  # consigne : jamais un toucher sans 0,4 s d'attente
# Zones teintées par la carte de la mémoire, monde et île (0 hors de l'accueil).
TEINTES_POSEES = "(window.terramemo.carte.teintes() + (window.terramemo.ile ? window.terramemo.ile.teintes() : 0))"


def seance_question(p):
    """La question de séance affichée : (forme, cible) ; forme trouver, qcm,
    retournee, bilan ou None (rien encore)."""
    return p.js("""(() => {
      const vis = id => { const e = document.getElementById(id); return e && !e.hidden ? e : null; };
      let b;
      if ((b = vis('barre-retournee'))) return ['retournee', b.querySelector('.essai-consigne').dataset.cible];
      if ((b = vis('barre-nommer'))) return ['qcm', b.querySelector('.essai-consigne').dataset.cible];
      if ((b = vis('barre-essai'))) return ['trouver', b.querySelector('.essai-consigne').dataset.cible];
      if (vis('essai-bilan')) return ['bilan', null];
      return [null, null]; })()""")


def attendre_question(p, avant=None, delai_s=8):
    """Attend une nouvelle question (autre cible ou autre forme que `avant`) ou le bilan."""
    fin = time.monotonic() + delai_s
    while time.monotonic() < fin:
        q = seance_question(p)
        if q[0] and q != avant:
            return q
        p.pause(100)
    return seance_question(p)


def position_visible(p, ident, barre="#barre-essai"):
    """Où toucher `ident` dans la partie visible de la carte (au-dessus de la
    barre) : sa position (pastille ou point d'étiquette) si elle y est, sinon
    le premier point d'une grille de 10 px où pick() le désigne (la Russie
    cadrée avec l'Europe de l'Est : son point d'étiquette, en Sibérie, est
    hors de l'écran) ; None s'il n'est pas à l'écran. Sur l'île (communes),
    la carte de l'île."""
    return p.js(f"""(() => {{
      const c = window.terramemo.terrain() === 'reunion' ? window.terramemo.ile : window.terramemo.carte, r = c.rect();
      const b = document.querySelector({json.dumps(barre)});
      const bas = b && !b.hidden ? b.getBoundingClientRect().top : r.y + r.hauteur;
      const dans = q => q && q.x >= r.x && q.x <= r.x + r.largeur && q.y >= r.y && q.y <= bas;
      const cercle = document.querySelector('circle.pastille[data-id="{ident}"]');
      let q = null;
      if (cercle) {{ const e = cercle.getBoundingClientRect(); q = {{x: e.x + e.width / 2, y: e.y + e.height / 2}}; }}
      else q = c.ecran("{ident}");
      if (dans(q)) return q;
      for (let y = r.y + 5; y < bas; y += 10)
        for (let x = r.x + 5; x < r.x + r.largeur; x += 10)
          if (c.pick(x, y)?.id === "{ident}") return {{x, y}};
      return null; }})()""")


def toucher_pays(p, ident):
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    pt = position_visible(p, ident)
    if not pt:
        raise RuntimeError(f"pas de position pour {ident}")
    p.toucher(pt["x"], pt["y"])


def cliquer_apres_pause(p, selecteur):
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    cliquer(p, selecteur)


def jouer_seance(p, capturer, defauts, quoi, connu=False, rater_rappel=False, arret_qcm=False, captures=None):
    """Joue la séance affichée jusqu'au bilan ; rend le nombre de réponses
    (une par question finie : le journal en a autant). connu : « Je connais
    déjà » au premier QCM ; rater_rappel : premier rappel touché faux (puis
    juste) ; arret_qcm : « Terminer » au premier QCM (la grappe suivante
    n'est pas jouée). captures : {forme ou 'rappel': nom} prises une fois."""
    captures = dict(captures or {})
    reponses = 0
    deja_connu = deja_rate = False
    premier_qcm_rate = False
    q = attendre_question(p)
    for _ in range(80):
        forme, cible = q
        if forme in (None, "bilan"):
            break
        # La carte de la question : celle de l'île pour les communes (bloc de la Révision du jour, Apprendre sous La Réunion).
        carte = "ile" if p.js("window.terramemo.terrain()") == "reunion" else "carte"
        # Jamais de teinte de la carte de la mémoire pendant une séance (elle trahirait les lieux jamais vus).
        teintes = p.js(TEINTES_POSEES)
        if teintes:
            defauts.append(f"{quoi} : {teintes} zone(s) teintée(s) pendant la séance ({forme} {cible})")
        if forme == "qcm":
            if arret_qcm:
                cliquer_apres_pause(p, "#nommer-terminer")
                q = attendre_question(p, q)
                continue
            attendre_fin_vol(p, carte)
            if "qcm" in captures:
                capturer(captures.pop("qcm"))
            if connu and not deja_connu:
                deja_connu = True
                dire(f"  {quoi} : « Je connais déjà » sur {cible}")
                cliquer_apres_pause(p, "#nommer-connu")
                q = attendre_question(p, q)
                continue
            choix = p.js("[...document.querySelectorAll('#barre-nommer .nommer-choix')].map(b => b.dataset.id)")
            if not premier_qcm_rate and deja_connu:
                # Un QCM raté exprès : il revient en fin de QCM.
                premier_qcm_rate = True
                autre = next(c for c in choix if c != cible)
                cliquer_apres_pause(p, f'#barre-nommer .nommer-choix[data-id="{autre}"]')
                p.pause(1900)
            else:
                cliquer_apres_pause(p, f'#barre-nommer .nommer-choix[data-id="{cible}"]')
                p.pause(1000)
            reponses += 1
        elif forme == "retournee":
            attendre_fin_vol(p, carte)
            cliquer_apres_pause(p, "#retournee-reveler")
            p.pause(200)
            if "retournee" in captures:
                capturer(captures.pop("retournee"))
            dire(f"  {quoi}, carte retournée : {texte(p, '#barre-retournee')!r}")
            cliquer_apres_pause(p, "#retournee-savais")
            p.pause(250)
            ligne = texte(p, "#barre-retournee .essai-retro")
            if not re.search(r"Revient|revoir", ligne):
                defauts.append(f"{quoi} : carte retournée sans ligne « Revient dans… » ({ligne!r})")
            p.pause(900)
            reponses += 1
        else:  # trouver
            # Le cadrage de la question (monde, région de la grappe) vole : toucher
            # avant la fin du vol raterait un pays touché à sa position.
            attendre_fin_vol(p, carte)
            if "rappel" in captures:
                k = p.js(f"window.terramemo.{carte}.transfo().k")
                dire(f"  {quoi}, premier Trouver : zoom {k:.2f}")
                if carte == "carte" and k < 1.5:
                    defauts.append(f"{quoi} : le rappel de la grappe n'est pas cadré sur sa région (zoom {k:.2f})")
                capturer(captures.pop("rappel"))
            if rater_rappel and not deja_rate:
                deja_rate = True
                # Un autre pays de la grappe de l'Europe de l'Est, à l'écran une fois cadrée.
                autre = next(i for i in ("UKR", "POL", "BLR") if i != cible)
                toucher_pays(p, autre)
                p.pause(300)
                retro = texte(p, "#barre-essai .essai-retro")
                dire(f"  {quoi}, rappel faux ({cible} touché en {autre}) : {retro!r}")
                if "Faux" not in retro:
                    defauts.append(f"{quoi} : un toucher faux au rappel ne dit pas « Faux » ({retro!r})")
                if "faux" in captures:
                    capturer(captures.pop("faux"))
            toucher_pays(p, cible)
            p.pause(250)
            retro = texte(p, "#barre-essai .essai-retro")
            if "Juste" not in retro:
                # Une question sur une zone mal placée à l'écran : Passer, pour ne pas bloquer.
                defauts.append(f"{quoi} : {cible} touché à sa position, pas juste ({retro!r})")
                cliquer_apres_pause(p, "#essai-passer")
            elif not re.search(r"Revient|revoir", retro):
                defauts.append(f"{quoi} : pas de ligne « Revient dans… » après {cible} ({retro!r})")
            else:
                dire(f"  {quoi}, {cible} : {retro!r}")
            p.pause(1300)
            reponses += 1
        q = attendre_question(p, q)
    if seance_question(p)[0] != "bilan":
        defauts.append(f"{quoi} : pas de bilan au bout de la séance ({seance_question(p)})")
    return reponses


# Les fiches du journal (terramemo-journal), toutes ; null si la base est illisible.
FICHES_JOURNAL = """new Promise(async ok => {
  const bases = indexedDB.databases ? await indexedDB.databases() : [];
  if (!bases.some(b => b.name === 'terramemo-journal')) return ok([]);
  const r = indexedDB.open('terramemo-journal');
  r.onerror = () => ok(null);
  r.onsuccess = () => { const db = r.result;
    if (!db.objectStoreNames.contains('evenements')) { db.close(); return ok([]); }
    const q = db.transaction('evenements').objectStore('evenements').getAll();
    q.onsuccess = () => { ok(q.result.map(e => e.fiche)); db.close(); }; q.onerror = () => { ok(null); db.close(); }; };
})"""
# Un Qid de Wikidata (capitales.json) : jamais affiché.
MOTIF_QID = re.compile(r"\bQ\d+\b")


def ressources_capitales(p):
    return p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/geo/capitales'))")


def ui_capitales(p, capturer, defauts, base, parametres=""):
    """Captures 80 à 91 (lot 1 du J2, #4 ; étude § 5.2, 7.2, 7.3) : le sujet
    Capitales en Entraînement, sur une page rechargée. Jouer : Pays,
    Capitales, Communes, la vignette des capitales en points, rien de
    capitales* chargé avant le choix d'un exercice ; Trouver sur l'Océanie
    joué jusqu'au bilan (« Pays dont la capitale est : », rétroaction
    « ville (pays) » et l'anneau à la ville) ; Reconnaître (« Quelle est sa
    capitale ? », quatre capitales, une faute, bilan) ; Apprendre sur
    l'Océanie (le conseil de D39 b avant la première question, puis la
    grappe jusqu'au bilan, le journal en capitales: seulement) ; la recherche
    « La Paz » (siège du gouvernement, la Bolivie montrée et l'anneau).
    DÉFAUT si un Qid ou une fiche pays: apparaît, ou si capitales* est chargé
    au premier affichage."""
    # Vrai rechargement : vers la même adresse, seul le « # » changerait (même
    # document, sans loaderId), et les ressources de la recherche « sain »
    # d'avant (capitales* comprises) resteraient comptées.
    p.goto("about:blank")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    if ressources_capitales(p):
        defauts.append(f"capitales* chargé au premier affichage : {ressources_capitales(p)}")
    fiches_avant = collections.Counter(p.js(FICHES_JOURNAL) or [])

    def sans_qid(quoi, t):
        if MOTIF_QID.search(t or ""):
            defauts.append(f"{quoi} : un Qid affiché ({t!r})")

    # Jouer › Entraînement : les sujets, la vignette des capitales (rangée dans le code).
    p.js('location.hash = "#jouer"')
    attendre_visible(p, "#jouer-panneau")
    cliquer(p, '#jouer-panneau [data-branche="entrainement"]')
    sujets = p.js("[...document.querySelectorAll('#jouer-panneau [data-sujet]')].map(b => b.dataset.sujet)")
    if sujets != ["pays", "capitales", "communes"]:
        defauts.append(f"Entraînement : sujets {sujets} au lieu de Pays, Capitales, Communes")
    if not p.js("!!document.querySelector('#jouer-panneau [data-sujet=\"capitales\"] .vignette-points')"):
        defauts.append("Capitales sans sa vignette (le monde et ses capitales en points)")
    panneau_jouer(p, defauts, "Entraînement (Capitales)")
    capturer("80-capitales-sujets")
    cliquer(p, '#jouer-panneau [data-sujet="capitales"]')
    series = p.js("[...document.querySelectorAll('#jouer-panneau [data-serie]')].map(b => b.dataset.serie)")
    if series != SERIES_PAYS or "54 capitales" not in texte(p, "#jouer-panneau"):
        defauts.append(f"Capitales : séries {series}, sans « 54 capitales » ?")
    capturer("81-capitales-series")
    cliquer(p, '#jouer-panneau [data-serie="Oceania"]')
    modes = p.js("[...document.querySelectorAll('#jouer-panneau [data-mode]')].map(b => b.dataset.mode)")
    if modes != ["apprendre", "localiser", "nommer"]:
        defauts.append(f"Capitales › Océanie : exercices {modes}")
    if ressources_capitales(p):
        defauts.append(f"capitales* chargé à l'ouverture de Jouer : {ressources_capitales(p)}")
    capturer("82-capitales-oceanie-exercices")

    # Trouver sur l'Océanie, jusqu'au bilan.
    cliquer(p, '#jouer-panneau [data-mode="localiser"]')
    attendre_visible(p, "#barre-essai", 20)
    p.pause(300)
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    consigne = texte(p, "#barre-essai .essai-consigne")
    dire(f"  Capitales, Trouver : {consigne!r}")
    if not consigne.startswith("Pays dont la capitale est"):
        defauts.append(f"Trouver sous Capitales : consigne {consigne!r}")
    capturer("83-capitales-trouver")
    premier = True
    for _ in range(20):
        if visible(p, "#essai-bilan"):
            break
        cible = p.js('document.querySelector("#barre-essai .essai-consigne").dataset.cible')
        sans_qid("Trouver", texte(p, "#barre-essai"))
        toucher_pays(p, cible)
        p.pause(250)
        retro = texte(p, "#barre-essai .essai-retro")
        # « Juste : Wellington (Nouvelle-Zélande) · 1 essai · … », « Juste (pastille) : Majuro (Îles Marshall) · … ».
        if not re.match(r"Juste( \([^)]*\))? : [^·]+\(", retro):
            defauts.append(f"Trouver sous Capitales, {cible} : rétroaction {retro!r} sans « Juste : ville (pays) »")
            cliquer_apres_pause(p, "#essai-passer")
        elif p.js("window.terramemo.carte.anneaux()") < 1:
            defauts.append(f"Trouver sous Capitales, {cible} : pas d'anneau à la ville (D53 c)")
        if premier:
            dire(f"  Capitales, Trouver, juste ({cible}) : {retro!r}")
            capturer("84-capitales-trouver-juste")
            premier = False
        p.pause(1300)
    bilan = texte(p, "#essai-bilan")
    dire(f"  Capitales, Trouver, bilan : {bilan!r}")
    sans_qid("bilan de Trouver", bilan)
    if not visible(p, "#essai-bilan"):
        defauts.append("Trouver sous Capitales : pas de bilan au bout de l'Océanie")

    # Reconnaître : trois questions (une faute), puis « Terminer ».
    jouer_partie(p, "nommer", "Oceania", "capitales")
    fautes = 0
    for k in range(3):
        attendre_fin_vol(p)
        consigne = texte(p, "#barre-nommer .essai-consigne")
        if consigne != "Quelle est sa capitale ?":
            defauts.append(f"Reconnaître sous Capitales : consigne {consigne!r}")
        boutons = p.js("[...document.querySelectorAll('#barre-nommer .nommer-choix')].map(b => [b.dataset.id, b.innerText])")
        sans_qid("Reconnaître", " ".join(t for _, t in boutons))
        cible = p.js('document.querySelector("#barre-nommer .essai-consigne").dataset.cible')
        if k == 0:
            dire(f"  Capitales, Reconnaître ({cible}) : {[t for _, t in boutons]}")
            capturer("85-capitales-reconnaitre")
        choisi = next(i for i, _ in boutons if i != cible) if k == 1 else cible
        fautes += choisi != cible
        cliquer_apres_pause(p, f'#barre-nommer .nommer-choix[data-id="{choisi}"]')
        p.pause(200)
        retro = texte(p, "#barre-nommer .essai-retro")
        if choisi == cible and not retro.startswith("Juste :"):
            defauts.append(f"Reconnaître sous Capitales : rétroaction juste {retro!r} sans « Juste : ville (pays) »")
        if k == 1:
            dire(f"  Capitales, Reconnaître, faux : {retro!r}")
            capturer("86-capitales-reconnaitre-faux")
        p.pause(1900)
    cliquer_apres_pause(p, "#nommer-terminer")
    attendre_visible(p, "#essai-bilan")
    bilan = texte(p, "#essai-bilan")
    dire(f"  Capitales, Reconnaître, bilan : {bilan!r}")
    sans_qid("bilan de Reconnaître", bilan)
    if fautes and "tu as choisi" not in bilan:
        defauts.append(f"bilan de Reconnaître sous Capitales sans sa faute : {bilan!r}")

    # Apprendre sur l'Océanie : le conseil (pays pas appris) avant la première question.
    jouer_jusqua(p, "apprendre", "Oceania", "capitales")
    cliquer_apres_pause(p, '#jouer-panneau [data-mode="apprendre"]')
    attendre_visible(p, "#essai-bilan", 20)
    conseil = texte(p, "#essai-bilan")
    dire(f"  Capitales, Apprendre, ouverture : {conseil!r}")
    if not p.js("!!document.getElementById('seance-commencer')") or "Pays › Océanie › Apprendre" not in conseil:
        defauts.append(f"Apprendre sous Capitales sans le conseil de D39 b à l'ouverture : {conseil!r}")
    else:
        capturer("87-capitales-apprendre-conseil")
        cliquer_apres_pause(p, "#seance-commencer")
    jouer_seance(p, capturer, defauts, "Apprendre Capitales", captures={"qcm": "88-capitales-apprendre-qcm"})
    bilan = texte(p, "#essai-bilan")
    dire(f"  Capitales, Apprendre, bilan : {bilan!r}")
    sans_qid("bilan d'Apprendre", bilan)
    if "Apprendre · Océanie" not in bilan or "Nouveaux" not in bilan:
        defauts.append(f"bilan d'Apprendre sous Capitales sans titre ou sans « Nouveaux » : {bilan!r}")
    capturer("89-capitales-apprendre-bilan")
    nouvelles = collections.Counter(p.js(FICHES_JOURNAL) or []) - fiches_avant
    hors = [f for f in nouvelles.elements() if not f.startswith("capitales:")]
    dire(f"  journal : {sum(nouvelles.values())} événements de capitales, {len(hors)} hors capitales:")
    if hors or not nouvelles:
        defauts.append(f"journal des parties de capitales : {hors[:5]} hors capitales: ({sum(nouvelles.values())} événements)")
    cliquer_apres_pause(p, "#seance-carte")
    p.pause(400)

    # La recherche « La Paz » : siège du gouvernement, la Bolivie montrée et l'anneau à la ville.
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text="La Paz")
    fin = time.monotonic() + 8
    while time.monotonic() < fin and "Bolivie" not in texte(p, "#recherche-liste"):
        p.pause(100)
    liste = texte(p, "#recherche-liste")
    dire(f"  recherche « La Paz » : {liste!r}")
    if "siège du gouvernement (Bolivie)" not in liste:
        defauts.append(f"recherche « La Paz » sans « siège du gouvernement (Bolivie) » : {liste!r}")
    sans_qid("recherche", liste)
    capturer("90-capitales-recherche")
    p.js("""[...document.querySelectorAll('#recherche-liste [role="option"]')].find(o => o.innerText.includes('Bolivie'))?.click()""")
    attendre_fin_vol(p)
    barre = texte(p, "#barre-carte")
    anneaux = p.js("window.terramemo.carte.anneaux()")
    dire(f"  recherche → La Paz : {barre!r}, {anneaux} anneau(x)")
    if "Bolivie" not in barre or anneaux < 1:
        defauts.append(f"recherche « La Paz » : {barre!r}, {anneaux} anneau (la Bolivie et l'anneau à la ville attendus)")
    capturer("91-capitales-recherche-la-paz")


def revision_du_jour(p):
    """La ligne « Révision du jour » d'Entraînement : (texte, désactivée)."""
    p.js('location.hash = "#jouer/entrainement"')
    attendre_visible(p, "#jouer-panneau")
    fin = time.monotonic() + 5
    while time.monotonic() < fin and "…" in texte(p, "#jouer-revision"):
        p.pause(100)
    return texte(p, "#jouer-revision"), p.js("document.getElementById('jouer-revision')?.disabled ?? null")


def ui_seance(p, capturer, defauts, base, parametres=""):
    """Captures 30 à 37 (J1a, #2 ; décisions « Apprendre et Révision du
    jour », « Sens « quel est ce pays ? » », « Cadrage et disques en
    séance ») : la ligne « Révision du jour » et ses comptes ; Apprendre sur
    l'Europe jusqu'au bilan (QCM, « Je connais déjà » sur un pays, un QCM
    raté, rappel cadré sur la grappe, un rappel faux puis sa reprise,
    réponses par position) ; les comptes à jour au retour ; le même jour,
    Apprendre sous La Réunion (ui_apprendre_reunion : sa propre grappe) ;
    puis le lendemain (?horloge=1, serveur de développement) : une révision
    avec des cartes retournées (pays, puis communes sur l'île), arrêtée au
    QCM de la grappe suivante. DÉFAUT si le
    journal (terramemo-journal) n'a pas un événement par réponse ou si une
    requête part vers Firebase pendant une séance."""
    requetes_avant = len(p.requetes)
    n0 = p.js(COMPTER_JOURNAL)
    ligne, desactivee = revision_du_jour(p)
    dire(f"  Révision du jour : {ligne!r} (désactivée : {desactivee})")
    if "Révision du jour" not in ligne or "nouveaux" not in ligne or desactivee:
        defauts.append(f"Entraînement sans « Révision du jour » active ni ses nouveaux : {ligne!r}, désactivée {desactivee}")
    panneau_jouer(p, defauts, "Entraînement (Révision du jour)")
    capturer("30-revision-du-jour")
    # Apprendre sur l'Europe.
    cliquer(p, '#jouer-panneau [data-sujet="pays"]')
    cliquer(p, '#jouer-panneau [data-serie="Europe"]')
    modes = p.js("[...document.querySelectorAll('#jouer-panneau [data-mode]')].map(b => b.dataset.mode)")
    if modes[:1] != ["apprendre"]:
        defauts.append(f"Entraînement › Pays › Europe sans Apprendre en tête : {modes}")
    panneau_jouer(p, defauts, "Entraînement › Pays › Europe")
    cliquer_apres_pause(p, '#jouer-panneau [data-mode="apprendre"]')
    n_apprendre = jouer_seance(p, capturer, defauts, "Apprendre", connu=True, rater_rappel=True,
                               captures={"qcm": "31-apprendre-qcm", "rappel": "32-apprendre-rappel-cadre", "faux": "33-apprendre-rappel-faux"})
    bilan = texte(p, "#essai-bilan")
    dire(f"  Apprendre, bilan : {bilan!r}")
    if "Nouveaux" not in bilan or "Apprendre · Europe" not in bilan or "points" in bilan.lower():
        defauts.append(f"bilan d'Apprendre sans titre ou sans « Nouveaux », ou avec des points : {bilan!r}")
    if not p.js("!!document.querySelector('#essai-bilan #essai-autre')"):
        defauts.append("bilan d'Apprendre sans « Autre série »")
    capturer("34-apprendre-bilan")
    verifier_croix(p, defauts, "bilan d'Apprendre", "#essai-bilan")
    n1 = p.js(COMPTER_JOURNAL)
    dire(f"  journal : {n1 - n0} événements pour {n_apprendre} réponses")
    if n1 - n0 != n_apprendre:
        defauts.append(f"Apprendre : {n1 - n0} événements dans terramemo-journal pour {n_apprendre} réponses")
    # « Carte » : l'accueil ; au retour dans Entraînement, les comptes à jour (grappe du jour prise).
    cliquer_apres_pause(p, "#seance-carte")
    p.pause(400)
    if p.js("document.body.dataset.vue") != "carte":
        defauts.append(f"« Carte » du bilan : vue {p.js('document.body.dataset.vue')}")
    ligne, desactivee = revision_du_jour(p)
    dire(f"  Révision du jour après Apprendre : {ligne!r} (désactivée : {desactivee})")
    if "À jour" not in ligne:
        defauts.append(f"Révision du jour après la grappe du jour : {ligne!r} au lieu de « À jour »")
    # La carte de la mémoire à l'accueil, après cette séance (et absente d'une partie).
    ui_memoire(p, capturer, defauts)
    # Le même jour, Apprendre sous La Réunion : sa propre grappe (un budget par domaine,
    # décision « Apprendre et Révision du jour »), puis la Révision du jour à jour (elle n'en ouvre pas d'autre).
    ui_apprendre_reunion(p, capturer, defauts)
    ligne, desactivee = revision_du_jour(p)
    dire(f"  Révision du jour après les deux grappes : {ligne!r} (désactivée : {desactivee})")
    if "À jour" not in ligne:
        defauts.append(f"Révision du jour après une grappe de pays et une de communes : {ligne!r} au lieu de « À jour »")
    # Le lendemain, par l'horloge de test (serveur de développement seulement).
    if not serveur_de_dev(base):
        dire("  lendemain : sauté (?horloge= n'agit qu'en serveur de développement)")
    else:
        p.goto(base + "?mesures=0&horloge=1" + parametres + "#carte")
        p.attendre_carte()
        n2 = p.js(COMPTER_JOURNAL)
        requetes_avant = len(p.requetes)
        ligne, desactivee = revision_du_jour(p)
        dire(f"  lendemain, Révision du jour : {ligne!r}")
        if "à revoir" not in ligne or desactivee:
            defauts.append(f"le lendemain, rien à revoir : {ligne!r}")
        capturer("35-lendemain-revision")
        cliquer_apres_pause(p, "#jouer-revision")
        p.pause(300)
        if p.js("location.hash") != "#toucher":
            defauts.append(f"la Révision du jour ne s'ouvre pas comme une partie : {p.js('location.hash')}")
        n_rev = jouer_seance(p, capturer, defauts, "Révision", arret_qcm=True, captures={"retournee": "36-carte-retournee"})
        bilan = texte(p, "#essai-bilan")
        dire(f"  Révision, bilan : {bilan!r}")
        if "Révisions :" not in bilan or "du premier coup" not in bilan:
            defauts.append(f"bilan de la révision sans « Révisions : n/m du premier coup » : {bilan!r}")
        capturer("37-revision-bilan")
        verifier_croix(p, defauts, "bilan de la Révision du jour", "#essai-bilan")
        n3 = p.js(COMPTER_JOURNAL)
        dire(f"  journal : {n3 - n2} événements pour {n_rev} réponses")
        if n3 - n2 != n_rev:
            defauts.append(f"Révision : {n3 - n2} événements dans terramemo-journal pour {n_rev} réponses")
        p.js("history.back()")
        p.pause(500)
        if not p.js("location.hash").startswith("#jouer/entrainement"):
            defauts.append(f"retour arrière depuis la révision : {p.js('location.hash')} au lieu d'Entraînement")
    reseau = [u for u in list(p.requetes.values())[requetes_avant:] if MOTIF_FIREBASE.search(u)]
    if reseau:
        defauts.append(f"requêtes vers Firebase pendant une séance : {reseau[:3]}")


def etat_memoire(p, carte="carte"):
    """La carte de la mémoire telle qu'affichée : (texte de la légende ou None si cachée, zones teintées de cette carte)."""
    return p.js(f"""(() => {{ const l = document.getElementById('legende-memoire');
      return [l && !l.hidden ? l.innerText.replace(/\\s+/g, ' ').trim() : null, window.terramemo.{carte}.teintes()]; }})()""")


def regler_memoire(p, actif):
    """Le réglage « Carte de la mémoire » de ⚙ mis à `actif`, la popup refermée."""
    cliquer(p, "#settings-btn")
    if p.js("document.getElementById('reglage-memoire').checked") != actif:
        cliquer(p, "#reglage-memoire")
    p.js('document.getElementById("settings-btn").click()')
    p.pause(300)


def ui_memoire(p, capturer, defauts):
    """Captures 38 à 40 (J1a, étude § 7, D7) : l'accueil teinté après la
    séance d'Apprendre (légende « Jamais vu · faible → maîtrisé · N/195
    maîtrisés »), un pays appris touché (« Vu N fois · revient dans N j »),
    le réglage de ⚙ coupé puis remis, et une partie (Trouver) sans aucune
    teinte. DÉFAUT si la légende manque, si rien n'est teinté, ou si une
    teinte reste visible pendant la partie."""
    p.js('location.hash = "#carte"')
    p.pause(400)
    legende, n = etat_memoire(p)
    dire(f"  accueil après Apprendre : légende {legende!r}, {n} pays teintés")
    if not legende or "maîtrisés" not in legende or "Jamais vu" not in legende:
        defauts.append(f"accueil sans la légende de la carte de la mémoire : {legende!r}")
    if n < 1:
        defauts.append("accueil après une séance d'Apprendre : aucun pays teinté")
    capturer("38-accueil-memoire")
    # Un pays de la grappe apprise (l'Europe de l'Est), touché sur l'accueil.
    for ident in ("POL", "UKR", "BLR"):
        pt = position_visible(p, ident, "#barre-carte")
        if pt:
            break
    if not pt:
        defauts.append("accueil : aucun pays de la grappe apprise à l'écran")
    else:
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        p.toucher(pt["x"], pt["y"])
        p.pause(300)
        barre = texte(p, "#barre-carte")
        dire(f"  accueil, {ident} touché : {barre!r}")
        # Deux sujets jouables sur le monde (Pays, Capitales, lot 1) : « Pays : vu 1 fois · revient demain · Capitale : jamais vue ».
        if not re.search(r"[Vv]u \d+ fois · (revient|à revoir)", barre):
            defauts.append(f"accueil : {ident} appris touché sans « Vu N fois · revient dans N j » ({barre!r})")
        capturer("39-accueil-pays-vu")
    # Le réglage de ⚙ : coupé, ni teinte ni légende ; remis, les teintes reviennent.
    regler_memoire(p, False)
    coupe = etat_memoire(p)
    regler_memoire(p, True)
    remis = etat_memoire(p)
    dire(f"  ⚙ « Carte de la mémoire » coupée : {coupe} ; remise : {remis[1]} pays teintés")
    if coupe[0] is not None or coupe[1]:
        defauts.append(f"réglage « Carte de la mémoire » coupé : légende ou teintes restées ({coupe})")
    if remis[1] != n or not remis[0]:
        defauts.append(f"réglage « Carte de la mémoire » remis : {remis} au lieu de {n} pays teintés")
    # Une partie : la carte sans teinte (elle trahirait les pays jamais vus).
    jouer_partie(p, "localiser", "Europe")
    p.pause(300)
    legende, n = etat_memoire(p)
    teintes = p.js(TEINTES_POSEES)
    dire(f"  Trouver, Europe : légende {legende!r}, {teintes} zones teintées")
    if teintes or legende:
        defauts.append(f"teinte de la carte de la mémoire pendant une partie : {teintes} zones, légende {legende!r}")
    capturer("40-partie-sans-teinte")
    cliquer(p, "#essai-terminer")
    p.pause(200)


def ui_apprendre_reunion(p, capturer, defauts):
    """Captures 41 à 44 (J1a, défaut D6) : Apprendre sous La Réunion
    (Entraînement › Communes) jusqu'au bilan, un événement du journal par
    réponse, puis l'île teintée à l'accueil quand on y va par la recherche.
    Joué le jour même d'une grappe de pays (ui_seance) : les communes ont
    leur propre budget, Apprendre sous La Réunion n'est pas refusé."""
    n0 = p.js(COMPTER_JOURNAL)
    jouer_jusqua(p, "apprendre", "reunion")
    modes = p.js("[...document.querySelectorAll('#jouer-panneau [data-mode]')].map(b => b.dataset.mode)")
    if modes[:1] != ["apprendre"]:
        defauts.append(f"Entraînement › Communes sans Apprendre en tête : {modes}")
    cliquer_apres_pause(p, '#jouer-panneau [data-mode="apprendre"]')
    n = jouer_seance(p, capturer, defauts, "Apprendre La Réunion", captures={"qcm": "41-reunion-qcm", "rappel": "42-reunion-rappel"})
    bilan = texte(p, "#essai-bilan")
    dire(f"  Apprendre La Réunion, bilan : {bilan!r}")
    if "Apprendre · La Réunion" not in bilan or "Nouveaux" not in bilan or re.search(r"\b974\d\d\b", bilan):
        defauts.append(f"bilan d'Apprendre sous La Réunion sans titre ou sans « Nouveaux », ou un code INSEE : {bilan!r}")
    capturer("43-reunion-bilan")
    n1 = p.js(COMPTER_JOURNAL)
    dire(f"  journal : {n1 - n0} événements pour {n} réponses")
    if n1 - n0 != n or n < 12:
        defauts.append(f"Apprendre La Réunion : {n1 - n0} événements pour {n} réponses (6 QCM et 6 rappels au moins)")
    # L'île à l'accueil, par la recherche : ses communes apprises teintées, la légende sur 24.
    cliquer_apres_pause(p, "#seance-carte")
    p.pause(400)
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text="saint-denis")
    p.pause(300)
    cliquer(p, '#recherche-liste [data-terrain="reunion"][data-id="97411"]')
    fin = time.monotonic() + 10
    while p.js("window.terramemo.terrain()") != "reunion" and time.monotonic() < fin:
        p.pause(100)
    attendre_fin_vol(p, "ile")
    legende, teintes = etat_memoire(p, "ile")
    dire(f"  recherche → Saint-Denis : légende {legende!r}, {teintes} communes teintées")
    if not legende or "/24 maîtrisés" not in legende or teintes < 6:
        defauts.append(f"l'île à l'accueil sans ses teintes ou sa légende : {legende!r}, {teintes} communes teintées")
    capturer("44-ile-memoire")
    cliquer(p, "#carte-monde")
    p.pause(300)
    if p.js("window.terramemo.ile.teintes()"):
        defauts.append("« Monde » : l'île garde ses teintes")


def commande_seance(args):
    """ui_seance seul, sur un profil neuf (journal vide)."""
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    telephone = args.width < 700
    ecran = dict(TELEPHONE, largeur=args.width) if telephone else dict(PC, largeur=args.width)
    base = args.url.rstrip("/") + "/"
    rendu = f"&rendu={args.rendu}" + ("&logiciel=1" if args.rendu == "webgl" else "") if args.rendu else ""
    faites, defauts = [], []
    with Session("local") as s:
        s.couper_synchro(base)
        s.passer_accueil(base)
        p = s.page
        p.emuler(ecran, tactile=telephone)

        def capturer(nom):
            chemin = out / f"{nom}.png"
            p.pause(350)
            p.capture(chemin)
            faites.append(chemin)

        p.goto(base + "?mesures=0" + rendu + "#carte")
        p.attendre_carte()
        ui_seance(p, capturer, defauts, base, rendu)
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures dans {out}")
    return 1 if erreurs or defauts else 0


# --- Écran de connexion de la première ouverture (#3, décision « Écran de connexion ») ---

ETAT_ACCUEIL = """(() => {
  const s = document.getElementById('accueil');
  if (!s || s.hidden) return null;
  const r = s.querySelector('.accueil-panneau').getBoundingClientRect();
  const sous = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('#accueil'); };
  const j = document.getElementById('jouer-btn').getBoundingClientRect();
  const visibles = [...s.querySelectorAll('button, input, a')].filter((e) => e.getClientRects().length);
  return {
    role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'),
    titre: document.getElementById('accueil-titre').innerText,
    entete: document.querySelector('header').inert, zone: document.getElementById('app').inert,
    marque: document.body.dataset.accueil || '', vue: document.body.dataset.vue || '',
    focus: !!document.activeElement && !!document.activeElement.closest('#accueil'),
    actif: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
    gauche: r.left, droite: innerWidth - r.right, largeur: r.width,
    deborde: document.documentElement.scrollWidth > innerWidth || s.scrollWidth > s.clientWidth,
    jouer_couvert: sous(j.x + j.width / 2, j.y + j.height / 2),
    carte_couverte: sous(6, innerHeight - 6),
    carte_visible: getComputedStyle(document.getElementById('carte')).visibility === 'visible',
    petits: visibles.filter((e) => e.tagName === 'BUTTON' && !e.classList.contains('compte-voir')
      && e.getBoundingClientRect().height < 44).map((e) => e.id),
    google: !!document.getElementById('accueil-compte-google'),
    invite: !!document.getElementById('accueil-invite') && !document.getElementById('accueil-partie-invite').hidden,
  };
})()"""


def saisir_pseudo(p, valeur):
    """Le champ du pseudo de l'invité vidé, puis `valeur` tapée comme au
    clavier (Input.insertText : un événement input, comme un vrai joueur)."""
    p.js("(() => { const c = document.getElementById('accueil-pseudo'); c.focus(); c.select(); })()")
    p.cdp("Input.insertText", text=valeur)
    p.pause(100)


def ui_accueil(p, capturer, defauts, base, parametres="", avant=None):
    """L'écran de connexion de la première ouverture (décision « Écran de
    connexion »), sur un appareil qui n'a pas choisi : le choix gardé et le
    pseudo retirés, la page rechargée. `70-accueil` (le panneau par-dessus
    la carte), les adresses retenues (#jouer, #compte : la carte sous le
    panneau), les touches de zoom sans effet, Confidentialité lisible et son
    « Retour » au panneau ; `71-accueil-invite` (le pseudo), refusé (« a »),
    puis « Pilote » : le panneau fermé, le choix et le pseudo gardés, aucune
    requête vers Firebase, la carte de nouveau touchable (`72-accueil-carte`) ;
    rechargée, pas de panneau ; le choix retiré de nouveau, « Se connecter par
    e-mail » (`73-accueil-email`, champs pour le remplissage automatique).
    `avant` : une capture de la carte d'abord, le choix posé (la première
    ouverture sans panneau, pour comparer). À la fin, le choix « invite »
    reposé et le pseudo retiré (aucune partie ne doit le publier)."""
    def defaut(quoi):
        defauts.append(f"écran de connexion : {quoi}")

    chargements = iter(range(1, 100))
    # Une adresse neuve à chaque chargement : la même, au fragment près, ne recharge pas la page.
    url = lambda: base + f"?mesures=0&accueil={next(chargements)}" + parametres + "#carte"
    if avant:
        p.js(f"localStorage.setItem({json.dumps(CLE_ACCUEIL)}, 'invite')")
        p.goto(url())
        p.attendre_carte()
        capturer(avant)
    p.js(f"localStorage.removeItem({json.dumps(CLE_ACCUEIL)}); localStorage.removeItem('terramemo.pseudo')")
    requetes_avant = len(p.requetes)
    p.goto(url())
    p.attendre_carte()
    attendre_visible(p, "#accueil")
    attendre_visible(p, "#accueil-compte-vers-connecter")  # les écrans des comptes, montés
    e = p.js(ETAT_ACCUEIL)
    dire(f"  écran de connexion : {json.dumps(e, ensure_ascii=False)}")
    if not e:
        raise RuntimeError("écran de connexion absent à la première ouverture")
    attendu = {"role": "dialog", "modal": "true", "titre": "Terramemo", "entete": True, "zone": True,
               "marque": "ouvert", "vue": "carte", "focus": True, "deborde": False, "jouer_couvert": True,
               "carte_couverte": True, "carte_visible": True, "invite": True}
    for k, v in attendu.items():
        if e[k] != v:
            defaut(f"{k} = {e[k]!r} (attendu {v!r})")
    if e["gauche"] < 7 or e["droite"] < 7:
        defaut(f"panneau collé au bord ({e['gauche']:.0f} / {e['droite']:.0f} px)")
    if e["largeur"] > 441:
        defaut(f"panneau de {e['largeur']:.0f} px (440 au plus)")
    if e["petits"]:
        defaut(f"boutons sous 44 px : {e['petits']}")
    if serveur_de_dev(base) and not e["google"]:
        defaut("pas de « Continuer avec Google » sur le site")
    capturer("70-accueil")
    # Les adresses de l'en-tête (tapées ou d'un lien) restent sous le panneau.
    for ancre in ("#jouer", "#compte", "#classement"):
        p.js(f'location.hash = "{ancre}"')
        p.pause(250)
        vue = p.js("document.body.dataset.vue")
        if vue != "carte" or not visible(p, "#accueil") or visible(p, "#vue-compte") or visible(p, "#jouer-panneau"):
            defaut(f"{ancre} contourne le panneau (vue {vue!r})")
    p.js('location.hash = "#carte"')
    p.pause(200)
    k = p.js("window.terramemo.carte.transfo().k")
    p.cdp("Input.dispatchKeyEvent", type="keyDown", key="+", text="+")
    p.cdp("Input.dispatchKeyEvent", type="keyUp", key="+")
    p.pause(300)
    if p.js("window.terramemo.carte.transfo().k") != k:
        defaut("la touche + zoome la carte sous le panneau")
    # Confidentialité se lit sans avoir choisi ; son « Retour » ramène au panneau.
    cliquer(p, "#accueil-confidentialite")
    attendre_visible(p, "#vue-confidentialite")
    if visible(p, "#accueil") or not p.js("document.querySelector('header').inert"):
        defaut("Confidentialité : le panneau reste dessus, ou l'en-tête redevient utilisable")
    cliquer(p, "#confidentialite-retour")
    p.pause(400)
    if not visible(p, "#accueil") or visible(p, "#vue-confidentialite"):
        defaut("le « Retour » de Confidentialité ne ramène pas au panneau")
    # L'invité : son pseudo, refusé puis accepté.
    cliquer(p, "#accueil-invite")
    attendre_visible(p, "#accueil-form-invite")
    champ = p.js("[document.activeElement.id, document.getElementById('accueil-pseudo').autocomplete]")
    if champ != ["accueil-pseudo", "nickname"]:
        defaut(f"pseudo de l'invité : focus ou autocomplete inattendus ({champ})")
    saisir_pseudo(p, "a")
    cliquer(p, "#accueil-commencer")
    p.pause(200)
    erreur = texte(p, "#accueil-erreur")
    if "2 à 20 caractères" not in erreur or not visible(p, "#accueil"):
        defaut(f"un pseudo d'un caractère n'est pas refusé ({erreur!r})")
    # Saisi comme au clavier (événements input) : l'avis du pseudo refusé s'efface.
    saisir_pseudo(p, "Pilote")
    if texte(p, "#accueil-erreur"):
        defaut(f"l'avis du pseudo refusé reste sous « Pilote » ({texte(p, '#accueil-erreur')!r})")
    capturer("71-accueil-invite")
    cliquer(p, "#accueil-commencer")
    p.pause(400)
    apres = p.js(f"""[!!document.getElementById('accueil'), document.querySelector('header').inert,
        document.getElementById('app').inert, document.body.dataset.accueil || '',
        localStorage.getItem({json.dumps(CLE_ACCUEIL)}), localStorage.getItem('terramemo.pseudo')]""")
    dire(f"  invité choisi : {apres}")
    if apres != [False, False, False, "", "invite", "Pilote"]:
        defaut(f"après « Commencer » : {apres} (attendu panneau fermé, en-tête rendu, choix et pseudo gardés)")
    reseau = [u for u in list(p.requetes.values())[requetes_avant:] if MOTIF_FIREBASE.search(u)]
    if reseau:
        defaut(f"l'invité a appelé Firebase : {reseau[:3]}")
    # Ni appel ni SDK : charger() sans utilisateur ne fait aucune requête, d'où le contrat de la page
    # et les morceaux du SDK servis par le site lui-même (dev : deps de vite ; build : index.esm-*).
    sdk = p.js(r"""[window.terramemo.sdkDemande(), performance.getEntriesByType('resource').map((r) => r.name)
        .filter((n) => /node_modules\/.*firebase|\/assets\/index\.esm-/.test(n))]""")
    if sdk[0] or sdk[1]:
        defaut(f"l'invité a chargé le SDK de Firebase : demandé {sdk[0]}, morceaux {sdk[1][:3]}")
    p.js('window.terramemo.carte.zoomerSur("CHE")')
    p.pause(600)
    pt = position(p, "CHE")
    p.toucher(pt["x"], pt["y"])
    p.pause(300)
    barre = texte(p, "#barre-carte")
    if "Suisse" not in barre:
        defaut(f"la carte ne répond pas après le choix ({barre!r})")
    capturer("72-accueil-carte")
    # Le choix gardé : plus de panneau.
    p.goto(url())
    p.attendre_carte()
    p.pause(300)
    if visible(p, "#accueil"):
        defaut("le panneau revient alors que le choix est gardé")
    # Les entrées des comptes : « Se connecter par e-mail ».
    p.js(f"localStorage.removeItem({json.dumps(CLE_ACCUEIL)})")
    p.goto(url())
    p.attendre_carte()
    attendre_visible(p, "#accueil-compte-vers-connecter")
    cliquer(p, "#accueil-compte-vers-connecter")
    attendre_visible(p, "#accueil-compte-form-connecter")
    champs = p.js("['accueil-compte-adresse', 'accueil-compte-mdp'].map((i) => document.getElementById(i).autocomplete)")
    if champs != ["email", "current-password"] or visible(p, "#accueil-partie-invite"):
        defaut(f"formulaire de connexion : autocomplete {champs}, ou « Continuer en invité » montré dessous")
    # Le focus suit l'écran dans le dialogue (le bouton activé a disparu) : le champ Adresse.
    actif = p.js("document.activeElement && document.activeElement.id")
    if actif != "accueil-compte-adresse":
        defaut(f"« Se connecter par e-mail » : focus sur {actif!r} (attendu le champ Adresse)")
    capturer("73-accueil-email")
    cliquer(p, "#accueil-compte-annuler")
    p.pause(200)
    if not visible(p, "#accueil-compte-vers-connecter") or not visible(p, "#accueil-partie-invite"):
        defaut("« Annuler » ne ramène pas aux entrées")
    actif = p.js("document.activeElement && document.activeElement.id")
    if actif != "accueil-compte-vers-connecter":
        defaut(f"« Annuler » : focus sur {actif!r} (attendu « Se connecter par e-mail »)")
    p.js(f"localStorage.setItem({json.dumps(CLE_ACCUEIL)}, 'invite'); localStorage.removeItem('terramemo.pseudo')")


def commande_accueil(args):
    """ui_accueil seul, sur un profil neuf : la carte d'abord (le choix posé,
    `69-carte-avant`), puis le panneau."""
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    telephone = args.width < 700
    ecran = dict(TELEPHONE, largeur=args.width) if telephone else dict(PC, largeur=args.width)
    base = args.url.rstrip("/") + "/"
    faites, defauts = [], []
    with Session("local") as s:
        s.couper_synchro(base)
        p = s.page
        p.emuler(ecran, tactile=telephone)

        def capturer(nom):
            chemin = out / f"{nom}.png"
            p.pause(350)
            p.capture(chemin)
            faites.append(chemin)

        ui_accueil(p, capturer, defauts, base, avant="69-carte-avant")
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures ({ecran['largeur']}×{ecran['hauteur']}) dans {out}")
    dire("  ui_accueil : " + ("ÉCHEC" if erreurs or defauts else "OK"))
    return 1 if erreurs or defauts else 0


# --- synchro (J1b, lot 4 : pilote ui_synchro) ----------------------------

PORT_FIRESTORE, PORT_AUTH = 8062, 8063
# Le projet passé à `emulators:start` (celui de la config du site avec ?emulateurs).
PROJET_EMULATEURS = "terramemo-geo"
# Le corps fermé d'essai() dans firestore.rules (jusqu'au lot 6) : ouvert sur l'émulateur seulement.
ESSAI_FERME = re.compile(r"function essai\(\) \{\n\s*return false;\n\s*\}")


def preparer_emulateurs():
    """Règles du dépôt avec essai() ouvert, chargées dans l'émulateur
    Firestore (jamais le vrai projet), puis base et comptes de l'émulateur
    vidés : chaque pilote part de zéro."""
    regles = (RACINE / "firestore.rules").read_text()
    ouvertes, n = ESSAI_FERME.subn("function essai() { return true; }", regles)
    if not n:
        raise RuntimeError("essai() fermé introuvable dans firestore.rules")
    corps = json.dumps({"rules": {"files": [{"content": ouvertes}]}}).encode()
    base_fs = f"http://127.0.0.1:{PORT_FIRESTORE}/emulator/v1/projects/{PROJET_EMULATEURS}"
    req = urllib.request.Request(base_fs + ":securityRules", data=corps, method="PUT", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        if r.status != 200:
            raise RuntimeError(f"règles d'essai refusées par l'émulateur : {r.status}")
    for url in (base_fs + "/databases/(default)/documents",
                f"http://127.0.0.1:{PORT_AUTH}/emulator/v1/projects/{PROJET_EMULATEURS}/accounts"):
        code, _, corps = http(url, methode="DELETE", delai=20)
        if code != 200:
            raise RuntimeError(f"émulateur pas vidé ({url}) : {code} {corps[:200]!r}")


def synchro_de(p):
    """window.terramemo.synchro() (sans Firebase), son empreinte et ses comptes."""
    return p.js("window.terramemo.synchro()")


def attendre_synchro(p, condition, quoi, delai_s=40):
    """Attend que synchro() vérifie `condition` ; rend le dernier rapport (RuntimeError sinon)."""
    fin = time.monotonic() + delai_s
    r = None
    while time.monotonic() < fin:
        r = synchro_de(p)
        if condition(r):
            return r
        p.pause(500)
    raise RuntimeError(f"{quoi} : pas atteint en {delai_s} s ; synchro() = {json.dumps(r, ensure_ascii=False)[:600]}")


def resume_synchro(r):
    """Ce que ui_synchro compare d'un appareil à l'autre (étude du J1b, § 5.8, 2)."""
    lots = r.get("lots") or {}
    ses = r.get("session") or {}
    return {
        "uid": r.get("uid"), "coupee": r.get("coupee"), "evenements": r.get("evenements"), "empreinte": r.get("empreinte"),
        "attente": lots.get("attente"), "refusees": lots.get("refusees"), "a_relire": r.get("a_relire"),
        "drapeaux": {k: ses.get(k) for k in ("deconnexion", "effacement", "connexion", "profil_a_ecrire")},
    }


def formulaire_compte(p, quoi, adresse, mdp):
    """Vue Compte : « Créer un compte » ou « Se connecter par e-mail », champs remplis, envoyé."""
    p.js('location.hash = "#compte"')
    attendre_visible(p, "#vue-compte")
    attendre_visible(p, "#compte-vers-creer" if quoi == "creer" else "#compte-vers-connecter")
    cliquer(p, "#compte-vers-creer" if quoi == "creer" else "#compte-vers-connecter")
    attendre_visible(p, "#compte-adresse")
    p.js(f"document.getElementById('compte-adresse').value = {json.dumps(adresse)}; "
         f"document.getElementById('compte-mdp').value = {json.dumps(mdp)};")
    cliquer_apres_pause(p, "#compte-creer-ok" if quoi == "creer" else "#compte-connecter-ok")


def ui_synchro(p1, p2, capturer, defauts, base):
    """Le pilote du critère de #3 (étude du J1b, § 5.8, 2), sur deux
    navigateurs sans stockage partagé, au site de dev avec ?emulateurs :
    1. l'appareil 1 crée un compte (vue Compte) et joue la Révision du jour ;
    2. l'appareil 2 joue Apprendre sous La Réunion en invité, puis se connecte :
       la question D22, « Ajouter » ; il reçoit la séance de l'appareil 1 ;
    3. l'appareil 2, le lendemain (?horloge=1), passe hors ligne
       (Network.emulateNetworkConditions), joue une Révision, puis revient ;
    4. l'appareil 1 rouvert relit les lots (lecture incrémentale) ;
    verdict : window.terramemo.synchro() égal des deux côtés (empreinte de
    l'état FSRS, événements, lots en attente et refusés, a_relire, uid,
    drapeaux) ; 5. l'appareil 2 se déconnecte (D24 a) : son journal est vidé."""
    url = base + "?emulateurs&mesures=0"
    adresse, mdp = f"pilote{int(time.time())}@exemple.fr", "motdepasse-pilote"
    # 1. Appareil 1 : le compte, puis la Révision du jour (la grappe de pays du jour).
    p1.goto(url + "#carte")
    p1.attendre_carte()
    formulaire_compte(p1, "creer", adresse, mdp)
    attendre_visible(p1, "#compte-adresse-connectee", 30)
    uid = attendre_synchro(p1, lambda r: r.get("uid"), "appareil 1 : compte dans la session")["uid"]
    dire(f"  appareil 1 : compte {adresse} ({uid})")
    ligne, desactivee = revision_du_jour(p1)
    if desactivee:
        raise RuntimeError(f"appareil 1 : Révision du jour désactivée ({ligne!r})")
    cliquer_apres_pause(p1, "#jouer-revision")
    n1 = jouer_seance(p1, capturer, defauts, "Appareil 1, Révision du jour")
    cliquer_apres_pause(p1, "#seance-carte")
    r1 = attendre_synchro(p1, lambda r: r["evenements"] == n1 and (r.get("lots") or {}).get("attente") == 0, "appareil 1 : séance envoyée")
    dire(f"  appareil 1 : {n1} réponses, en ligne ({r1['lots']['lots']})")
    # 2. Appareil 2 : une grappe de communes en invité, puis la connexion et la question D22.
    p2.goto(url + "#carte")
    p2.attendre_carte()
    jouer_jusqua(p2, "apprendre", "reunion")
    cliquer_apres_pause(p2, '#jouer-panneau [data-mode="apprendre"]')
    n2 = jouer_seance(p2, capturer, defauts, "Appareil 2 (invité), Apprendre La Réunion")
    cliquer_apres_pause(p2, "#seance-carte")
    p2.pause(500)
    formulaire_compte(p2, "connecter", adresse, mdp)
    attendre_visible(p2, "#compte-fusion-question", 30)
    question = texte(p2, "#compte-fusion-question")
    dire(f"  appareil 2 : {question!r}")
    if f"({n2} réponses)" not in question:
        defauts.append(f"question D22 sans les {n2} réponses de l'appareil : {question!r}")
    capturer("50-question-fusion")
    cliquer_apres_pause(p2, "#compte-fusion-ajouter")
    attendre_visible(p2, "#compte-adresse-connectee", 30)
    message = texte(p2, "#compte-message")
    if "Ton compte a reçu les progrès de cet appareil" not in message:
        defauts.append(f"connexion après « Ajouter » sans le message des progrès reçus : {message!r}")
    r2 = attendre_synchro(p2, lambda r: r["evenements"] == n1 + n2 and (r.get("lots") or {}).get("attente") == 0, "appareil 2 : union et envoi")
    p2.pause(800)
    capturer("51-compte-a-jour")
    synchro_ligne = texte(p2, "#compte-synchro")
    if "à jour" not in synchro_ligne.lower():
        defauts.append(f"vue Compte de l'appareil 2 : la synchro n'est pas « À jour » ({synchro_ligne!r})")
    # 3. Le lendemain, hors ligne : une Révision (cartes dues des deux grappes), puis le réseau revient.
    p2.goto(url + "&horloge=1#carte")
    p2.attendre_carte()
    attendre_synchro(p2, lambda r: r["evenements"] == n1 + n2, "appareil 2 rouvert le lendemain")
    hors = dict(offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
    p2.cdp("Network.emulateNetworkConditions", **hors)
    if p2.js("navigator.onLine"):
        defauts.append("hors ligne émulé, mais navigator.onLine reste vrai")
    ligne, desactivee = revision_du_jour(p2)
    dire(f"  appareil 2, hors ligne, le lendemain : {ligne!r}")
    if desactivee or "à revoir" not in ligne:
        raise RuntimeError(f"appareil 2 : rien à revoir le lendemain ({ligne!r})")
    cliquer_apres_pause(p2, "#jouer-revision")
    n3 = jouer_seance(p2, capturer, defauts, "Appareil 2 (hors ligne), Révision", arret_qcm=True)
    cliquer_apres_pause(p2, "#seance-carte")
    r2 = attendre_synchro(p2, lambda r: r["evenements"] == n1 + n2 + n3 and (r.get("lots") or {}).get("attente", 0) >= 1,
                          "appareil 2 : la séance hors ligne attend")
    dire(f"  appareil 2 : {n3} réponses hors ligne, {r2['lots']['attente']} séance(s) en attente")
    p2.cdp("Network.emulateNetworkConditions", **dict(hors, offline=False))
    r2 = attendre_synchro(p2, lambda r: (r.get("lots") or {}).get("attente") == 0, "appareil 2 : envoi au retour du réseau", 60)
    # 4. Appareil 1 rouvert (une autre adresse : la même, au fragment près, ne recharge pas la page) :
    # la lecture incrémentale apporte les séances de l'appareil 2.
    p1.goto(url + "&rouvert=1#carte")
    p1.attendre_carte()
    # Le même rapport des deux côtés, attendu (événements, puis fiches en ligne : deux écritures d'IndexedDB).
    try:
        r1 = attendre_synchro(p1, lambda r: resume_synchro(r) == resume_synchro(r2), "appareil 1 : lecture des lots de l'appareil 2")
    except RuntimeError:
        r1 = synchro_de(p1)
    a, b = resume_synchro(r1), resume_synchro(r2)
    dire(f"  appareil 1 : {json.dumps(a, ensure_ascii=False)}")
    dire(f"  appareil 2 : {json.dumps(b, ensure_ascii=False)}")
    if a != b:
        defauts.append(f"synchro() diffère d'un appareil à l'autre : {a} ≠ {b}")
    if a["coupee"] or a["attente"] or a["refusees"] or a["a_relire"] or any(a["drapeaux"].values()):
        defauts.append(f"état de synchro inattendu : {a}")
    # 5. Déconnexion de l'appareil 2 (D24 a) : tout est parti, il repart vierge.
    p2.js('location.hash = "#compte"')
    attendre_visible(p2, "#compte-deconnecter", 30)
    cliquer_apres_pause(p2, "#compte-deconnecter")
    fin = time.monotonic() + 30
    while "Déconnecté" not in texte(p2, "#compte-message") and time.monotonic() < fin:
        p2.pause(200)
    capturer("52-deconnecte")
    r = synchro_de(p2)
    dire(f"  appareil 2 déconnecté : {texte(p2, '#compte-message')!r}, {r['evenements']} événements, uid {r['uid']}")
    if r["evenements"] or r["uid"]:
        defauts.append(f"déconnexion : l'appareil n'est pas vidé ({r['evenements']} événements, uid {r['uid']})")


def commande_synchro(args):
    """ui_synchro : deux navigateurs au site de dev avec ?emulateurs (Vite sur
    8060, émulateurs Firestore 8062 et Auth 8063 lancés à part)."""
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    telephone = args.width < 700
    ecran = dict(TELEPHONE, largeur=args.width) if telephone else dict(PC, largeur=args.width)
    base = args.url.rstrip("/") + "/"
    if not serveur_de_dev(base):
        raise RuntimeError(f"{base} n'est pas le serveur de dev (`driver.py serve`) : ?emulateurs et ?horloge n'y agissent pas")
    for port, nom in ((PORT_FIRESTORE, "Firestore"), (PORT_AUTH, "Auth")):
        if not port_ouvert(port):
            raise RuntimeError(f"émulateur {nom} absent du port {port} : "
                               f"npx firebase emulators:start --only firestore,auth --project {PROJET_EMULATEURS}")
    preparer_emulateurs()
    faites, defauts = [], []
    # Pas de couper_synchro : la synchro est ce qu'on éprouve, et tout va aux émulateurs.
    with Session("local") as s1, Session("local") as s2:
        p1, p2 = s1.page, s2.page
        for s in (s1, s2):
            s.passer_accueil(base)
        for p in (p1, p2):
            p.emuler(ecran, tactile=telephone)

        def capturer(nom):
            chemin = out / f"{nom}.png"
            p2.pause(350)
            p2.capture(chemin)
            faites.append(chemin)

        ui_synchro(p1, p2, capturer, defauts, base)
        erreurs = p1.erreurs + p2.erreurs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures dans {out}")
    dire("  ui_synchro : " + ("ÉCHEC" if erreurs or defauts else "OK, les deux appareils au même état"))
    return 1 if erreurs or defauts else 0


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


# Première visite : avant la répétition 1, ce qui change le chargement est
# vidé pour l'origine mesurée, en plus du cache HTTP coupé. Sur le
# téléphone, Chrome et la WebView gardent leurs données d'une séance à
# l'autre, et après `adb install -r` : sans cela, le maillage du rendu webgl
# sortait du cache IndexedDB dès la répétition 1, et la première visite
# n'était jamais mesurée. Sur le PC, le profil du chromium est neuf à chaque
# lancement : la répétition 1 y est toujours une première visite.
# Storage.clearDataForOrigin vide des types entiers : cache_storage et
# service_workers (aucun aujourd'hui ; un site hors ligne y garderait ses
# fichiers), shader_cache (shaders compilés gardés sur disque par le
# navigateur : sans lui, le contexte et la compilation de la répétition 1
# profiteraient d'une séance d'avant). Jamais « indexeddb » ni « all » : ce
# serait aussi le journal des réponses (base terramemo-journal,
# src/journal/depot.ts) et le compte anonyme de Firebase
# (firebaseLocalStorageDb), perdus pendant l'usage réel du téléphone ; ni
# local_storage (id de l'appareil, records et pseudo des épreuves, réglages :
# sans effet sur le chargement, ?mesures=0 et ?rendu= sont dans l'adresse).
# L'IndexedDB se vide donc base par base (BASES_VIDEES : le cache du
# maillage webgl, src/map/maillage.worker.ts) ; toute autre base est gardée.
# Un nouveau cache qui change le chargement doit entrer dans l'une des deux
# listes ; une donnée de l'utilisateur, jamais.
STOCKAGE_VIDE = "cache_storage,service_workers,shader_cache"
BASES_VIDEES = ("terramemo",)
# Bases de l'utilisateur, jamais vidées ; vider_premiere_visite vérifie en
# outre qu'aucune autre base ni aucune clé du localStorage (terramemo.appareil,
# records et pseudo des épreuves…) n'a disparu. terramemo-synchro : l'état
# d'envoi du J1b (étude du J1b, § 5.1), nommé ici pour la trace.
BASES_GARDEES = ("terramemo-journal", "terramemo-synchro", "firebaseLocalStorageDb")
TYPES_INTERDITS = ("all", "indexeddb", "local_storage", "cookies", "websql", "file_systems", "storage_buckets")
# IndexedDB.deleteDatabase de CDP veut un document de l'origine : une page
# du site sans script (copiée de public/, dans le site servi comme dans
# l'APK), pour que rien de l'appli ne tourne ni n'écrive avant la répétition 1.
PAGE_SANS_APPLI = "geo/LICENSE-CLDR.txt"
# Les répétitions : la première visite (stockage vidé, ou profil neuf du PC),
# les suivantes (cache du maillage écrit à la première), ou inconnue
# (stockage du téléphone gardé, ou non vidé).
NOMS_VISITES = {"premiere": "première visite", "suivante": "suivantes", "inconnue": "visite inconnue"}


def origine(url):
    """Origine d'une adresse (schéma, hôte et port) : celle dont le stockage
    est vidé."""
    u = urllib.parse.urlsplit(url)
    return f"{u.scheme}://{u.netloc}"


def vider_premiere_visite(p, url_base):
    """Vide pour l'origine de url_base ce qui change le premier chargement
    (STOCKAGE_VIDE, puis les bases BASES_VIDEES), jamais les données de
    l'utilisateur (BASES_GARDEES, toute autre base, le localStorage) : leur
    disparition est une erreur. Rend le relevé du rapport :
    vide (tout a été vidé), types, bases supprimées et gardées, nombre de
    clés du localStorage (gardées), connexion_chaude (la page sans appli a
    ouvert la connexion avant la répétition 1), erreur."""
    if set(STOCKAGE_VIDE.split(",")) & set(TYPES_INTERDITS) or set(BASES_VIDEES) & set(BASES_GARDEES):
        raise SystemExit("driver.py : STOCKAGE_VIDE ou BASES_VIDEES viderait des données de l'utilisateur")
    o = origine(url_base)
    stockage = {"vide": False, "origine": o, "types": None, "bases_supprimees": [], "bases_gardees": None,
                "cles_gardees": None, "connexion_chaude": False, "erreur": None}
    cles = "Object.keys(localStorage).sort()"
    try:
        p.goto(urllib.parse.urljoin(url_base, PAGE_SANS_APPLI))
        # La connexion à l'origine reste ouverte : la répétition 1 n'a plus ni
        # DNS, ni TCP, ni TLS (négligeable en local, ~100-300 ms de TLS sur le
        # site en ligne depuis le téléphone) ; son chargement est un peu
        # optimiste, et le rapport le dit.
        stockage["connexion_chaude"] = True
        avant = p.cdp("IndexedDB.requestDatabaseNames", securityOrigin=o).get("databaseNames", [])
        cles_avant = p.js(cles)
        p.cdp("Storage.clearDataForOrigin", origin=o, storageTypes=STOCKAGE_VIDE)
        stockage["types"] = STOCKAGE_VIDE
        for base in BASES_VIDEES:
            # Ferme de force les connexions ouvertes (un onglet de l'appli resté
            # ouvert sur le téléphone) au lieu d'attendre ; sans erreur si absente.
            p.cdp("IndexedDB.deleteDatabase", securityOrigin=o, databaseName=base)
            if base in avant:
                stockage["bases_supprimees"].append(base)
        apres = p.cdp("IndexedDB.requestDatabaseNames", securityOrigin=o).get("databaseNames", [])
        stockage["bases_gardees"] = sorted(apres)
        restees = [b for b in BASES_VIDEES if b in apres]
        if restees:
            raise RuntimeError(f"base(s) {', '.join(restees)} toujours là après IndexedDB.deleteDatabase")
        perdues = [b for b in avant if b not in apres and b not in BASES_VIDEES]
        perdues += [f"localStorage {k}" for k in cles_avant if k not in p.js(cles)]
        stockage["cles_gardees"] = len(cles_avant)
        if perdues:
            raise RuntimeError(f"données de l'utilisateur disparues : {', '.join(perdues)} (à signaler)")
        stockage["vide"] = True
    except RuntimeError as e:
        stockage["erreur"] = str(e)
    return stockage


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
    # L'écran de connexion de la première ouverture figerait la carte : sur le téléphone, le choix est
    # celui de l'utilisateur (passer_accueil n'y touche pas).
    if page.js("document.body.dataset.accueil || ''") in ("ouvert", "attente"):
        raise RuntimeError("écran de connexion ouvert : choisir d'abord sur l'appareil (« Continuer en invité » "
                           "ou un compte), puis relancer")
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
        s.couper_synchro(url_base)
        s.passer_accueil(url_base)
        if args.cible == "local":
            p.emuler(TELEPHONE, tactile=True, ralenti=args.ralenti)
        else:
            p.tactile = True
        p.cdp("Network.setCacheDisabled", cacheDisabled=not args.cache)
        # Première visite : caches de l'origine mesurée vidés (STOCKAGE_VIDE,
        # BASES_VIDEES), données de l'utilisateur gardées.
        stockage = {"vide": False, "origine": origine(url), "types": None, "bases_supprimees": [],
                    "bases_gardees": None, "cles_gardees": None, "connexion_chaude": False, "erreur": None}
        if not args.garder_stockage:
            stockage = vider_premiere_visite(p, url_base)
            if stockage["erreur"]:
                dire(f"  ATTENTION : caches de {stockage['origine']} non vidés ({stockage['erreur']}) : la "
                     "répétition 1 n'est peut-être pas une première visite")
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
             + (f"caches de {stockage['origine']} vidés ({STOCKAGE_VIDE} ; base(s) "
                f"{', '.join(BASES_VIDEES)} ; gardées : {', '.join(stockage['bases_gardees']) or 'aucune'})"
                if stockage["vide"] else
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
        # Caches de l'origine vidés avant la répétition 1 (STOCKAGE_VIDE, BASES_VIDEES) ; visite de
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

# --- journal de l'appareil : sauver_journal, restaurer_journal ---------
#
# Étude du J1b, § 8 : avant toute installation d'APK, le journal des
# réponses (base terramemo-journal de l'origine, src/journal/depot.ts) est
# lu BRUT par Runtime.evaluate (getAll sans filtre : un événement que
# l'appli refuserait est gardé aussi, et compté) et écrit dans
# ~/Sauvegardes/terramemo/journal-{date}.json, jamais par-dessus une
# sauvegarde existante. La WebView de l'APK est inspectable (build
# « debug ») ; Chrome lit le site (URL_SITE) depuis une page sans appli.
# La règle des invalides est celle de l'appli (outils/valider_journal.mjs),
# appliquée sur le PC : l'APK d'avant le lot 0 ne l'expose pas.
# restaurer_journal ajoute les événements valides un à un, chacun dans sa
# transaction (un échec n'emporte pas les autres), sans jamais rien
# effacer ni réécrire : un id déjà gardé est laissé tel quel.

# Ouvre la base SANS version, comme elle est : si elle n'existe pas,
# onupgradeneeded l'annulerait plutôt que de la créer vide (sans magasin),
# ce qui casserait l'appli (son open en version 1 ne la monterait plus).
_OUVRIR_JOURNAL = """
const NOM = %(nom)s, MAGASIN = %(magasin)s;
const bases = indexedDB.databases ? (await indexedDB.databases()).map((b) => b.name) : null;
if (bases && !bases.includes(NOM)) return { absente: true, bases };
const db = await new Promise((ok, ko) => {
  const r = indexedDB.open(NOM);
  let neuve = false;
  r.onupgradeneeded = () => { neuve = true; r.transaction.abort(); };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(neuve ? 'absente' : String(r.error && r.error.name));
  r.onblocked = () => ko('bloquee');
}).catch((e) => ({ erreur: e }));
if (db.erreur === 'absente') return { absente: true, bases };
if (db.erreur) return { erreur: 'ouverture de ' + NOM + ' : ' + db.erreur };
if (!db.objectStoreNames.contains(MAGASIN)) {
  const magasins = [...db.objectStoreNames];
  db.close();
  return { erreur: NOM + ' v' + db.version + ' sans magasin ' + MAGASIN + ' (' + (magasins.join(', ') || 'aucun') + ')' };
}
"""

_LIRE_JOURNAL = """(async () => {
%(ouvrir)s
const tous = await new Promise((ok, ko) => {
  const r = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).getAll();
  r.onsuccess = () => ok(r.result);
  r.onerror = () => ko(r.error);
});
const version = db.version;
db.close();
// Ce que JSON ne sait pas écrire (NaN, ±Infinity, BigInt, Date, Map…) n'est jamais changé en
// silence (null, {}) : marqué {"__non_json__": "…"} et l'événement relevé. undefined reste
// retiré, comme un champ absent (l'appli les lit pareil).
const nonJson = [];
let courant = -1;
const marquer = (genre) => { if (nonJson[nonJson.length - 1] !== courant) nonJson.push(courant); return { __non_json__: genre }; };
const remplacer = function (cle, v) {
  if (this === tous) courant = Number(cle);
  const o = this[cle]; // la valeur gardée, avant son toJSON (une Date arrive ici en chaîne)
  if (typeof o === 'number' && !Number.isFinite(o)) return marquer(String(o));
  if (typeof o === 'bigint') return marquer('bigint ' + o);
  if (typeof o === 'function' || typeof o === 'symbol') return marquer(typeof o);
  if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
    const proto = Object.getPrototypeOf(o);
    if (proto !== Object.prototype && proto !== null) return marquer(Object.prototype.toString.call(o));
  }
  return v;
};
// JSON en ASCII seul : le texte se découpe et se recolle à l'identique de part et d'autre.
const texte = JSON.stringify(tous, remplacer).replace(/[\\u007f-\\uffff]/g, (c) => '\\\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
window.__terramemoSauvegarde = texte;
const local = {};
try { for (const k of Object.keys(localStorage)) local[k] = localStorage.getItem(k); } catch (e) { /* refusé */ }
return { n: tous.length, longueur: texte.length, version, origine: location.origin, bases, non_json: nonJson,
         appli: (window.terramemo && window.terramemo.version) || null, local };
})()"""

_AJOUTER_JOURNAL = """(async () => {
%(ouvrir)s
const evts = window.__terramemoRestauration || [];
delete window.__terramemoRestauration;
const res = { ajoutes: 0, presents: 0, echecs: [] };
for (const e of evts) {
  await new Promise((fin) => {
    let tx;
    try { tx = db.transaction(MAGASIN, 'readwrite'); } catch (err) { res.echecs.push({ id: e.id, erreur: String(err && err.name) }); return fin(); }
    const r = tx.objectStore(MAGASIN).add(e);
    let present = false;
    r.onerror = (ev) => {
      if (r.error && r.error.name === 'ConstraintError') { present = true; ev.preventDefault(); ev.stopPropagation(); }
    };
    tx.oncomplete = () => { if (present) res.presents++; else res.ajoutes++; fin(); };
    tx.onabort = () => { res.echecs.push({ id: e.id, erreur: String(tx.error && tx.error.name) }); fin(); };
  });
}
db.close();
return res;
})()"""

MORCEAU_JOURNAL = 400_000  # caractères par Runtime.evaluate (le texte est en ASCII)
LOT_RESTAURATION = 300  # événements envoyés à la page par Runtime.evaluate


def _script_journal(modele):
    ouvrir = _OUVRIR_JOURNAL % {"nom": json.dumps(BASE_JOURNAL), "magasin": json.dumps(MAGASIN_JOURNAL)}
    return modele % {"ouvrir": ouvrir}


def problemes_journal(evenements):
    """Les événements que refuse probleme() de src/srs/journal.ts, en
    [{i, id, probleme}] (outils/valider_journal.mjs, node du PC)."""
    r = subprocess.run(["node", str(VALIDER_JOURNAL)], input=json.dumps(evenements), capture_output=True,
                       text=True, cwd=RACINE, timeout=180)
    if r.returncode:
        raise RuntimeError(f"valider_journal.mjs : {(r.stderr or r.stdout).strip()[-300:]}")
    return json.loads(r.stdout)


def lire_journal(p):
    """Le journal de l'origine de la page, brut : (relevé, événements). Le
    relevé dit l'origine, la version de la base et de l'appli, les bases et
    le localStorage de l'origine. Lève si la base manque ou ne s'ouvre pas."""
    info = p.js(_script_journal(_LIRE_JOURNAL), delai=180)
    if info.get("absente"):
        raise RuntimeError(f"aucune base {BASE_JOURNAL} sur {p.js('location.origin')} (bases : "
                           f"{', '.join(info.get('bases') or []) or 'aucune'}) : l'appli n'y a jamais tourné ?")
    if info.get("erreur"):
        raise RuntimeError(info["erreur"])
    morceaux = []
    try:
        for debut in range(0, info["longueur"], MORCEAU_JOURNAL):
            morceaux.append(p.js(f"window.__terramemoSauvegarde.slice({debut}, {debut + MORCEAU_JOURNAL})", delai=120))
    finally:
        try:
            p.js("delete window.__terramemoSauvegarde")
        except RuntimeError:
            pass
    texte = "".join(morceaux)
    if len(texte) != info["longueur"]:
        raise RuntimeError(f"journal lu en partie : {len(texte)} caractères sur {info['longueur']}")
    evenements = json.loads(texte)
    if len(evenements) != info["n"]:
        raise RuntimeError(f"journal relu : {len(evenements)} événements sur {info['n']}")
    return info, evenements


def _ecrire_sans_ecraser(dossier, nom, contenu):
    """dossier/nom.json, ou nom-2.json, nom-3.json… : jamais par-dessus une
    sauvegarde. Écrit à côté puis lié d'un coup (pas de fichier à moitié
    écrit sous le nom final), lisible par l'utilisateur seul."""
    dossier.mkdir(parents=True, exist_ok=True)
    temporaire = dossier / f".{nom}.{os.getpid()}.tmp"
    fd = os.open(temporaire, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(contenu)
            f.flush()
            os.fsync(f.fileno())
        k = 1
        while True:
            chemin = dossier / (f"{nom}.json" if k == 1 else f"{nom}-{k}.json")
            try:
                os.link(temporaire, chemin)
                return chemin
            except FileExistsError:
                k += 1
    finally:
        temporaire.unlink(missing_ok=True)


def _quand(ts_ms):
    return datetime.datetime.fromtimestamp(ts_ms / 1000).strftime("%d/%m/%Y %H:%M")


def _decrire(evenements):
    ts = [e["ts"] for e in evenements if isinstance(e, dict) and isinstance(e.get("ts"), (int, float))]
    seances = {e.get("seance") for e in evenements if isinstance(e, dict) and e.get("seance")}
    if not ts:
        return "vide"
    return f"{len(seances)} séance(s), du {_quand(min(ts))} au {_quand(max(ts))}"


def url_journal(cible, url):
    if cible == "webview":
        return URL_APK
    return url or (URL_SITE if cible == "chrome" else URL_DEFAUT)


def ouvrir_journal(s, cible, url):
    """L'onglet à l'origine du journal : dans l'APK, l'appli elle-même,
    jamais quittée ; ailleurs, PAGE_SANS_APPLI de l'origine (rien de l'appli
    n'y tourne). couper_synchro y mène déjà."""
    s.reverse(url)
    s.couper_synchro(url)
    if s.page.js("location.origin") != origine(url):
        raise RuntimeError(f"la page n'est pas sur {origine(url)}")


def sauver_journal(cible="webview", serie=None, url=None):
    """Sauve le journal de l'appareil ; rend le chemin du fichier écrit."""
    url = url_journal(cible, url)
    with Session(cible, serie=serie) as s:
        ouvrir_journal(s, cible, url)
        info, evenements = lire_journal(s.page)
        navigateur = s.navigateur
    try:
        refuses = problemes_journal(evenements)
        erreur_validation = None
    except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError) as e:
        refuses, erreur_validation = None, str(e)
    maintenant = datetime.datetime.now().astimezone()
    sauvegarde = {
        "format": 1,
        "sauve_le": maintenant.isoformat(timespec="seconds"),
        "cible": cible, "serie": serie, "origine": info["origine"], "navigateur": navigateur,
        "appli": info["appli"], "base": BASE_JOURNAL, "version_base": info["version"], "magasin": MAGASIN_JOURNAL,
        "bases": info.get("bases"),
        "n": len(evenements),
        # Événements dont une valeur n'avait pas d'écriture JSON (NaN, Date…), marquée {"__non_json__"} :
        "non_json": info.get("non_json") or [],
        "invalides": refuses,
        **({"invalides_erreur": erreur_validation} if erreur_validation else {}),
        "stockage_local": info.get("local") or {},
        "evenements": evenements,
    }
    # En ASCII : un demi-surrogate isolé (texte abîmé) s'écrit quand même, échappé.
    texte = json.dumps(sauvegarde, ensure_ascii=True, indent=1)
    chemin = _ecrire_sans_ecraser(SAUVEGARDES, f"journal-{maintenant.date().isoformat()}", texte)
    relu = json.loads(chemin.read_text(encoding="utf-8"))
    if relu["evenements"] != evenements:
        raise RuntimeError(f"{chemin} relu différent de ce qui a été lu sur l'appareil")
    invalides = "non comptés (" + erreur_validation + ")" if refuses is None else str(len(refuses))
    dire(f"journal sauvé : {len(evenements)} événement(s), dont {invalides} invalide(s), {_decrire(evenements)}")
    dire(f"  {info['origine']}, appli {info['appli'] or '?'}, base v{info['version']} -> {chemin} "
         f"({len(texte.encode()) / 1024:.0f} Ko)")
    for r in (refuses or [])[:10]:
        dire(f"  invalide n° {r['i']} ({r['id'] or 'sans id'}) : {r['probleme']}")
    if info.get("non_json"):
        dire(f"  {len(info['non_json'])} événement(s) avec une valeur sans écriture JSON (marquée __non_json__) : "
             f"n° {', '.join(map(str, info['non_json'][:10]))}")
    return chemin


def derniere_sauvegarde():
    fichiers = sorted(SAUVEGARDES.glob("journal-*.json"), key=lambda f: f.stat().st_mtime)
    if not fichiers:
        raise RuntimeError(f"aucune sauvegarde journal-*.json dans {SAUVEGARDES}")
    return fichiers[-1]


def restaurer_journal(fichier=None, cible="webview", serie=None, url=None):
    """Ajoute au journal de l'appareil les événements valides d'une
    sauvegarde (défaut : la plus récente), un à un ; rend les comptes."""
    chemin = pathlib.Path(fichier) if fichier else derniere_sauvegarde()
    sauvegarde = json.loads(chemin.read_text(encoding="utf-8"))
    evenements = sauvegarde["evenements"] if isinstance(sauvegarde, dict) else sauvegarde
    refuses = problemes_journal(evenements)
    ecartes = {r["i"] for r in refuses}
    valides = [e for i, e in enumerate(evenements) if i not in ecartes]
    dire(f"sauvegarde {chemin} : {len(evenements)} événement(s), {len(refuses)} écarté(s) (invalides)")
    for r in refuses:
        dire(f"  écarté n° {r['i']} ({r['id'] or 'sans id'}) : {r['probleme']}")
    url = url_journal(cible, url)
    with Session(cible, serie=serie) as s:
        ouvrir_journal(s, cible, url)
        p = s.page
        o = p.js("location.origin")
        if isinstance(sauvegarde, dict) and sauvegarde.get("origine") not in (None, o):
            dire(f"  attention : sauvegarde de {sauvegarde['origine']}, restaurée sur {o}")
        p.js("window.__terramemoRestauration = []")
        for debut in range(0, len(valides), LOT_RESTAURATION):
            lot = json.dumps(valides[debut:debut + LOT_RESTAURATION])
            p.js(f"window.__terramemoRestauration.push(...{lot}), window.__terramemoRestauration.length", delai=60)
        res = p.js(_script_journal(_AJOUTER_JOURNAL), delai=600)
        if res.get("absente"):
            raise RuntimeError(f"aucune base {BASE_JOURNAL} sur {o} : ouvrir l'appli une fois (elle la crée), "
                               "puis relancer")
        if res.get("erreur"):
            raise RuntimeError(res["erreur"])
        if cible == "webview":
            # L'appli relit son journal au démarrage (src/journal/memoire.ts).
            p.goto(URL_APK)
    dire(f"journal restauré sur {o} : {res['ajoutes']} ajouté(s), {res['presents']} déjà là, "
         f"{len(refuses)} écarté(s), {len(res['echecs'])} échec(s)")
    for e in res["echecs"][:20]:
        dire(f"  échec {e['id']} : {e['erreur']}")
    if cible != "webview":
        dire("  un onglet de l'appli déjà ouvert ne les voit qu'après un rechargement")
    return {"ajoutes": res["ajoutes"], "presents": res["presents"], "ecartes": refuses, "echecs": res["echecs"]}


AIDE_USB = ("téléphone branché, déverrouillé, débogage USB actif ? Il décroche parfois après une installation : "
            "le rallumer sur le téléphone (Options de développement › Débogage USB)")


def commande_sauver_journal(args):
    try:
        sauver_journal(args.cible, args.serie, args.url)
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as e:
        dire(f"ECHEC : {e}" + (f" ({AIDE_USB})" if args.cible != "local" else ""))
        return 1
    return 0


def commande_restaurer_journal(args):
    try:
        restaurer_journal(args.fichier, args.cible, args.serie, args.url)
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as e:
        dire(f"ECHEC : {e}" + (f" ({AIDE_USB})" if args.cible != "local" else ""))
        return 1
    return 0


def empreinte_apk(apk, env):
    """SHA-256 du certificat qui signe l'APK (apksigner du SDK), en hexadécimal majuscule."""
    outils = sorted((pathlib.Path(env["ANDROID_HOME"]) / "build-tools").glob("*/apksigner"))
    if not outils:
        raise RuntimeError("apksigner introuvable dans $ANDROID_HOME/build-tools")
    r = subprocess.run([str(outils[-1]), "verify", "--print-certs", str(apk)], env=env,
                       capture_output=True, text=True)
    m = re.search(r"certificate SHA-256 digest: ([0-9a-fA-F]{64})", r.stdout)
    if r.returncode or not m:
        raise RuntimeError(f"signature illisible : {(r.stderr or r.stdout).strip()[:300]}")
    return m.group(1).upper()


def commande_apk(args):
    env = dict(os.environ, JAVA_HOME=JAVA_HOME)
    env.setdefault("ANDROID_HOME", str(pathlib.Path.home() / "Android/Sdk"))
    if "TERRAMEMO_SIGNATURE" not in env and SIGNATURE.exists():
        env["TERRAMEMO_SIGNATURE"] = str(SIGNATURE)
    if "TERRAMEMO_SIGNATURE" not in env:
        dire(f"attention : pas de clé ({SIGNATURE} absent) : APK signé par la clé de débogage, "
             "installation refusée")
    debut = time.monotonic()
    # Après cap sync, le relevé des bibliothèques Android (#20) : le fichier des licences du build les liste.
    for cmd, dossier in ((["npm", "run", "build"], RACINE), (["npx", "cap", "sync", "android"], RACINE),
                         (["node", "licences/android.mjs", "--verifier"], RACINE),
                         (["./gradlew", "assembleDebug"], RACINE / "android")):
        dire(f"$ {' '.join(cmd)}")
        if subprocess.run(cmd, cwd=dossier, env=env).returncode:
            dire(f"ECHEC : {' '.join(cmd)}")
            return 1
    dire(f"APK : {APK} ({APK.stat().st_size / 1e6:.2f} Mo) en {time.monotonic() - debut:.0f} s")
    try:
        empreinte = empreinte_apk(APK, env)
    except RuntimeError as e:
        dire(f"ECHEC : {e}")
        return 1
    stable = empreinte == EMPREINTE_APK
    dire(f"signature : {'clé stable' if stable else 'AUTRE clé'} (SHA-256 {empreinte[:16]}…)")
    if args.installer:
        if not stable:
            dire("ECHEC : APK non signé par la clé stable : l'installer exigerait de désinstaller "
                 "l'appli (journal et compte perdus). Clé : " + str(SIGNATURE))
            return 1
        try:
            adb_appareil(args.serie)
            # Étude du J1b, § 8 : avant toute installation, le journal de l'appli
            # en place est sauvé ; sans sauvegarde, pas d'installation.
            if adb(args.serie, "shell", "pm", "path", APPID, verifier=False).strip() and not args.sans_sauvegarde:
                dire("journal de l'appli installée d'abord (sauver_journal) :")
                try:
                    sauver_journal("webview", args.serie)
                except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as e:
                    dire(f"ECHEC : journal non sauvé ({e}) : rien n'a été installé (--sans-sauvegarde pour "
                         f"passer outre si l'appli en place ne démarre plus ; {AIDE_USB})")
                    return 1
            dire(adb(args.serie, "install", "-r", str(APK), delai=300).strip())
        except RuntimeError as e:
            dire(f"ECHEC : {e}")
            return 1
        # L'installation a tué l'appli : un retrait du drapeau pas encore écrit sur disque
        # serait perdu. L'appli relancée est vérifiée (et le drapeau retiré s'il est revenu).
        try:
            with Session("webview", serie=args.serie) as s:
                s.couper_synchro(URL_APK)
        except RuntimeError as e:
            dire(f"ATTENTION : appli installée, drapeau {DRAPEAU_SANS_SYNCHRO} non vérifié ({e}) : relancer "
                 f"sauver_journal pour le retirer s'il est resté ({AIDE_USB})")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="commande", required=True)

    s = sub.add_parser("serve", help="Vite sur le port 8060, au premier plan")
    s.add_argument("--lan", action="store_true", help="écoute aussi sur le réseau local (--host 0.0.0.0)")
    s.add_argument("--preview", action="store_true", help="construit puis sert le build (vite preview)")
    s.add_argument("--sortie", default="/tmp/terramemo-preview", help="dossier du build de --preview (pas dist/)")

    s = sub.add_parser("smoke", help="page, /geo/*.json, rien de l'île au premier affichage, carte peinte (canvas, SVG, webgl)")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--budget", type=int, default=60, help="secondes au plus pour que la carte se peigne")

    s = sub.add_parser("ui", help="captures des vues")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"),
                   help="rendu de la carte du monde (?rendu=, webgl avec logiciel=1) ; défaut : celui de la page")

    s = sub.add_parser("seance", help="la séance du J1a seule (ui_seance) : Révision du jour, Apprendre, carte retournée")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), help="rendu de la carte du monde")

    s = sub.add_parser("accueil", help="l'écran de connexion de la première ouverture seul (ui_accueil), la carte d'abord")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")

    s = sub.add_parser("synchro", help="ui_synchro (J1b) : deux navigateurs aux émulateurs, l'un hors ligne, au même état")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")

    s = sub.add_parser("mesurer", help="gestes et touchers rejoués, rapport JSON")
    s.add_argument("--cible", choices=("local", "chrome", "webview"), default="local")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), default="canvas",
                   help="g et css : carte SVG ; canvas (défaut, celui de la page) et webgl : la carte qui "
                        "tourne (Canvas 2D, WebGL2)")
    s.add_argument("--projection", choices=("monde", "pacifique"), default="monde")
    s.add_argument("--ralenti", type=float, default=1, help="ralenti du processeur (local seulement)")
    s.add_argument("--repetitions", type=int, default=3)
    s.add_argument("--url", help=f"défaut : {URL_DEFAUT} (webview : https://localhost/)")
    s.add_argument("--cache", action="store_true", help="garde le cache HTTP (désactivé par défaut)")
    s.add_argument("--garder-stockage", action="store_true",
                   help="ne vide pas les caches de l'origine avant la répétition 1 (cache du maillage webgl, "
                        "shaders… : vidés par défaut, première visite ; les données de l'utilisateur ne sont "
                        "jamais vidées)")
    s.add_argument("--ws", action="store_true", help="local : passe par HTTP + WebSocket comme le téléphone")
    s.add_argument("--serie", help="numéro de série adb si plusieurs appareils")
    s.add_argument("--out", help=f"dossier du rapport (défaut : {MESURES.relative_to(RACINE)})")

    s = sub.add_parser("resumer", help="résumé d'un JSON de mesurer recalculé sur ses rapports bruts")
    s.add_argument("fichiers", nargs="+")
    s.add_argument("--pourquoi", default="critères du driver changés", help="noté dans resume_recalcule")
    s.add_argument("--sec", action="store_true", help="affiche sans réécrire le fichier")
    s.add_argument("--json", action="store_true", help="résumés et critère de saccade en JSON (tests)")

    s = sub.add_parser("apk", help="APK de débogage (npm run build, cap sync, gradlew)")
    s.add_argument("--installer", action="store_true",
                   help="puis adb install -r, après sauver_journal de l'appli déjà installée")
    s.add_argument("--sans-sauvegarde", action="store_true",
                   help="installe sans sauver d'abord le journal (appli en place qui ne démarre plus)")
    s.add_argument("--serie")

    for nom, aide in (("sauver_journal", f"journal de l'appareil, lu brut, dans {SAUVEGARDES}/journal-{{date}}.json"),
                      ("restaurer_journal", "ajoute au journal de l'appareil les événements valides d'une sauvegarde")):
        s = sub.add_parser(nom, aliases=[nom.replace("_", "-")], help=aide)
        if nom == "restaurer_journal":
            s.add_argument("fichier", nargs="?", help="sauvegarde à restaurer (défaut : la plus récente)")
        s.add_argument("--cible", choices=("webview", "chrome", "local"), default="webview",
                       help="webview (défaut) : l'APK ; chrome : le site dans Chrome du téléphone ; local : chromium du PC")
        s.add_argument("--url", help=f"origine du journal (chrome : {URL_SITE} ; local : {URL_DEFAUT}) ; "
                                     "sans effet en webview")
        s.add_argument("--serie", help="numéro de série adb si plusieurs appareils")

    for nom in ("smoke", "ui", "seance", "accueil", "synchro", "mesurer"):
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
    commandes = {"serve": commande_serve, "smoke": commande_smoke, "ui": commande_ui, "seance": commande_seance, "accueil": commande_accueil, "synchro": commande_synchro,
                 "mesurer": commande_mesurer, "resumer": commande_resumer, "apk": commande_apk,
                 "sauver_journal": commande_sauver_journal, "restaurer_journal": commande_restaurer_journal}
    commandes.update({k.replace("_", "-"): v for k, v in commandes.items() if "_" in k})
    # Un arrêt demandé (kill, délai d'un outil, terminal fermé) défait les
    # sessions comme une erreur : drapeau sans-synchro retiré, adb forward défaits.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    signal.signal(signal.SIGHUP, lambda *_: sys.exit(129))  # terminal ou onglet fermé
    try:
        return commandes[args.commande](args) or 0
    except RuntimeError as e:
        dire(f"ECHEC : {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
