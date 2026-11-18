#!/usr/bin/env python3
"""Driver de Terramemo : lance le site, le vérifie, le photographie et le
MESURE, sur le PC (chromium local) et sur le téléphone (Chrome ou l'APK, par
adb). Python stdlib seule ; à lancer depuis Terramemo/ :

    serve [--preview] [--lan]   Vite sur le port 8060 (au premier plan)
    smoke                       page, fichiers /geo/*.json et /geo/reunion/,
                                un drapeau, rien de l'île, des capitales, des
                                drapeaux ni des mers au premier affichage, carte
                                peinte en canvas (défaut) et en SVG, shaders
                                du rendu webgl compilés, service worker
                                (build) et rechargement hors ligne
    ui [--width 384] [--rendu r]
                                captures des vues (téléphone ou PC), île
                                de La Réunion et Nommer compris, séance
                                du J1a, capitales, drapeaux et mers, puis les
                                épreuves des capitales, des drapeaux et des
                                mers, et l'écran de connexion
    seance [--width 384]        la séance du J1a seule (Révision du jour,
                                Apprendre, le lendemain par ?horloge=1)
    accueil [--width 384]       l'écran de connexion de la première ouverture
                                seul (ui_accueil, aussi en fin de ui)
    drapeaux [--width 384]      le sujet Drapeaux seul (ui_drapeaux, aussi
                                dans ui), sur un profil neuf
    mers [--width 384]          le sujet Océans et mers seul (ui_mers puis
                                ses épreuves, ui_epreuves_mers, aussi dans
                                ui), sur un profil neuf
    fiche [--width 384] [--cible local|chrome|webview]
                                la fiche d'un lieu seule (ui_fiche, aussi
                                dans ui) : barre, fiche, voisins, retours,
                                voile, Échap, ⚙, territoire, mer, île, le
                                scénario de mesure (10 fiches, 10 voisins ;
                                gels ≥ 46 ms et leur cause), la carte de
                                situation (F8),
                                depuis un bilan (F6), « Apprendre ce lieu »
                                (F7 ; le lendemain : serveur de dev) ;
                                chrome et webview : le scénario seul
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
# Sujet gardé de la carte de la mémoire du monde (src/vues/carte-memoire.ts, CLE_SUJET_MEMOIRE) :
# « mers » y cache les pastilles des micro-États (choix de l'utilisateur du 12/11), que mesurer touche.
CLE_SUJET_MEMOIRE_MONDE = "terramemo.sujetMemoire.monde"
ATTENTE_STOCKAGE_MS = 6000  # localStorage de la WebView écrit sur disque (~5 s de délai de Chromium)
DEMARRAGE_APRES_INSTALLATION_S = 8  # appli relancée après adb install : démarrage à froid fini avant de s'y attacher
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
FICHIERS_GEO_REUNION = ("communes.topo.json", "communes.json", "noms.fr.json", "sources.json", "fiches.json", "fiches.fr.json")
# Les capitales (lot 1 du J2, #4) : chargées au lancement d'une partie de
# capitales, à la première frappe dans la recherche ou pour une séance qui en
# a, jamais au premier affichage ni à l'ouverture de Jouer (sa vignette est
# rangée dans le code) ; smoke et ui_capitales le vérifient.
FICHIERS_GEO_CAPITALES = ("capitales.json", "capitales.fr.json")
# Les drapeaux (lot 2 du J2, #4) : le manifeste, chargé au lancement d'une partie
# de drapeaux ou pour une séance qui en a, et un fichier par drapeau
# (/geo/drapeaux/<sha8>.svg, immuable), chargé à l'affichage ou un peu avant ;
# rien au premier affichage ni à l'ouverture de Jouer (l'icône du sujet est
# dessinée) ; smoke et ui_drapeaux le vérifient.
FICHIERS_GEO_DRAPEAUX = ("drapeaux.json",)
# Les océans et mers (lots 3a et 3b du J2, #27) : la couche marine, chargée à
# la demande (src/map/mers.ts) : la fine (chargerMers : sujet des mers, séance
# qui en a, une mer choisie dans la recherche, mémoire des mers, ?mers=demo),
# la légère d'abord au premier toucher en mer à l'accueil (D45 a : le nom), puis la
# fine pour allumer la mer touchée (choix du 14/11/2026), mers.json et mers.fr.json à la première frappe dans la
# recherche ; jamais au premier affichage ni à l'ouverture de Jouer (étude J2,
# § 2.3 ; la vignette du sujet est rangée dans le code) ; smoke et ui_mers le
# vérifient.
FICHIERS_GEO_MERS = ("mers.topo.json", "mers-leger.topo.json", "mers.json", "mers.fr.json")
# Le quiz général (lots 4a et 4b du J2, #26) : la notoriété des lieux et les paires de drapeaux proches,
# chargées avec le quiz seul (src/quiz/donnees.ts : au choix d'une difficulté), jamais au premier
# affichage ni à l'ouverture de Jouer ; smoke et ui_quiz le vérifient.
FICHIERS_GEO_QUIZ = ("notoriete.json", "drapeaux-proches.json")
# La fiche d'un lieu (#34, lot F1) : les fiches du monde, chargées au premier toucher
# d'un lieu (src/fiches/donnees.ts), jamais au premier affichage (étude fiche-lieu
# § 6.1) ; rien sous /photos/ non plus (lot P2) ; smoke et ui_fiche le vérifient.
# Lot F4 : celles des mers, au premier toucher en mer seulement, avec la couche légère.
FICHIERS_GEO_FICHES = ("fiches-monde.json", "fiches-monde.fr.json")
FICHIERS_GEO_FICHES_MERS = ("fiches-mers.json", "fiches-mers.fr.json")
# Lot F5 : celles des communes, sous /geo/reunion/, au premier toucher sur l'île seulement (rien de l'île au
# premier affichage : smoke le vérifie déjà pour tout /geo/reunion/).
FICHIERS_GEO_FICHES_COMMUNES = ("fiches.json", "fiches.fr.json")
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
    manifeste = None
    for nom in FICHIERS_GEO + tuple("reunion/" + n for n in FICHIERS_GEO_REUNION) + FICHIERS_GEO_CAPITALES + FICHIERS_GEO_DRAPEAUX + FICHIERS_GEO_MERS + FICHIERS_GEO_QUIZ + FICHIERS_GEO_FICHES:
        code, _, corps = http(base + "geo/" + nom)
        try:
            lu = json.loads(corps)
            valide = True
        except ValueError:
            valide = False
        if nom == "notoriete.json" and valide:
            # Un niveau de 1 à 3 par lieu de chaque sujet du J2 (src/quiz/donnees.ts, lireNotoriete).
            valide = isinstance(lu, dict) and lu.get("v") == 1 and all(isinstance(lu.get(k), dict) and lu[k] for k in ("pays", "capitales", "drapeaux", "mers"))
        if nom in FICHIERS_GEO_FICHES and valide:
            # Une entrée par entité de la carte, les 258 (src/fiches/donnees.ts, lireFichesMonde).
            valide = isinstance(lu, dict) and lu.get("v") == 1 and isinstance(lu.get("lieux"), dict) and len(lu["lieux"]) >= 258
        if nom == "drapeaux.json" and valide:
            manifeste = lu
            # 195 jouables, plus Kosovo et Taïwan ; chaque ligne a son drapeau montré (d[0]).
            valide = isinstance(lu, dict) and len(lu.get("pays", [])) >= 197 and all(l.get("d") for l in lu["pays"])
        verifier(f"geo/{nom}", code == 200 and valide, f"-> {code}, {len(corps)} octets, JSON {'valide' if valide else 'INVALIDE'}")
    # Un drapeau servi : le montré de la France, un SVG sous son empreinte (sans id de pays).
    fra = next((l for l in (manifeste or {}).get("pays", []) if l.get("pays") == "FRA"), None)
    if fra:
        code, entetes, corps = http(base + f"geo/drapeaux/{fra['d'][0]}.svg")
        verifier("un drapeau servi (France)", code == 200 and corps.lstrip().startswith(b"<svg") and b"flag-icons" not in corps,
                 f"-> {code}, {len(corps)} octets, {entetes.get('Cache-Control') or 'sans Cache-Control'}")
    else:
        verifier("un drapeau servi (France)", False, "pas de ligne FRA dans drapeaux.json")
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
            drapeaux = ressources_drapeaux(p)
            verifier("rien des drapeaux au premier affichage", not drapeaux, ", ".join(drapeaux) or "aucune ressource /geo/drapeaux* après pret et repos")
            mers = p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/geo/mers'))")
            verifier("rien des mers au premier affichage", not mers, ", ".join(mers) or "aucune ressource /geo/mers* après pret et repos")
            quiz = ressources_quiz(p)
            verifier("rien du quiz au premier affichage", not quiz, ", ".join(quiz) or "aucune ressource notoriete.json ni drapeaux-proches.json après pret et repos")
            fiches = ressources_fiches(p)
            verifier("rien des fiches ni des photos au premier affichage", not fiches, ", ".join(fiches) or "aucune ressource /geo/fiches-*, /photos/ ni morceau de la fiche après pret et repos")
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
        # Après les deux vérifications ci-dessus : la sonde hors ligne échoue exprès.
        smoke_service_worker(s, base, args.budget, verifier, dev=mode == "développement")
    dire("\nsmoke : " + ("OK" if not echecs else f"{echecs} échec(s)"))
    return 1 if echecs else 0


# Service worker du site (#22, src/sw/) : son état vu de la page (enregistré,
# actif, contrôle la page, cache de sa version et son nombre de fichiers).
JS_ETAT_SW = """(async () => {
  if (!('serviceWorker' in navigator)) return {absent: true};
  const r = await navigator.serviceWorker.getRegistration();
  const noms = typeof caches === 'undefined' ? [] : (await caches.keys()).filter((n) => n.startsWith('terramemo-'));
  const fichiers = noms.length ? (await (await caches.open(noms[noms.length - 1])).keys()).length : 0;
  return {enregistres: (await navigator.serviceWorker.getRegistrations()).length, actif: r && r.active ? r.active.state : null,
          script: r && r.active ? r.active.scriptURL : null, controle: !!navigator.serviceWorker.controller, caches: noms, fichiers};
})()"""
HORS_LIGNE = dict(offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)


def couper_reseau_sw(nav, base, couper):
    """Coupe (ou rend) le réseau au service worker de l'origine de `base` :
    l'émulation d'une page ne vaut que pour elle, le service worker est une
    cible à part (Target.attachToTarget). Rend la session, ou None sans
    service worker trouvé."""
    o = origine(base)
    for t in nav.commande("Target.getTargets").get("targetInfos", []):
        if t.get("type") == "service_worker" and t.get("url", "").startswith(o + "/"):
            sid = nav.commande("Target.attachToTarget", targetId=t["targetId"], flatten=True)["sessionId"]
            nav.commande("Network.enable", session=sid)
            nav.commande("Network.emulateNetworkConditions", session=sid, **dict(HORS_LIGNE, offline=couper))
            return sid
    return None


def smoke_service_worker(s, base, budget, verifier, dev):
    """En build (preview ou hébergé) : le service worker s'enregistre, prend
    la page et range la coquille, puis le site se recharge réseau coupé (page
    et service worker), carte peinte. En développement, aucun (vite.config.ts
    y sert un service worker qui se retire)."""
    p = s.page
    if dev:
        etat = p.js(JS_ETAT_SW) or {}
        verifier("aucun service worker en développement", not etat.get("enregistres"), f"{etat.get('enregistres')} enregistré(s)")
        return
    try:
        p.goto(base + "?mesures=0")
        p.attendre_carte(budget)
        fin = time.monotonic() + budget
        etat = p.js(JS_ETAT_SW) or {}
        while not (etat.get("actif") == "activated" and etat.get("controle") and etat.get("fichiers")) and time.monotonic() < fin:
            p.pause(250)
            etat = p.js(JS_ETAT_SW) or {}
    except RuntimeError as e:
        verifier("service worker enregistré (build)", False, str(e))
        return
    ok = (etat.get("actif") == "activated" and (etat.get("script") or "").endswith("/sw.js") and etat.get("controle")
          and len(etat.get("caches") or []) == 1 and (etat.get("fichiers") or 0) >= 8)
    verifier("service worker enregistré (build)", ok,
             f"{etat.get('script')} {etat.get('actif')}, contrôle la page : {etat.get('controle')}, "
             f"caches {etat.get('caches')}, {etat.get('fichiers')} fichiers rangés")
    if not ok:
        return
    sid = None
    erreurs = len(p.erreurs)
    try:
        p.cdp("Network.emulateNetworkConditions", **HORS_LIGNE)
        # Un service worker au repos est arrêté (sa cible disparaît) : une requête qu'il sert le réveille.
        for _ in range(5):
            p.js("fetch('/geo/pays.json').then((r) => r.status, () => 0)")
            sid = couper_reseau_sw(s.nav, base, True)
            if sid:
                break
            p.pause(200)
        # Sonde : une adresse avec paramètres passe au réseau (src/sw/logique.ts, aiguiller) ; elle doit échouer.
        sonde = p.js("fetch('/geo/sources.json?hors-ligne=' + Date.now()).then(() => 'joint', () => 'coupé')")
        verifier("réseau coupé (page et service worker)", sonde == "coupé" and not p.js("navigator.onLine") and sid is not None,
                 f"sonde {sonde}, navigator.onLine {p.js('navigator.onLine')}, service worker {'coupé' if sid else 'introuvable'}")
        debut = time.monotonic()
        p.goto(base + "?mesures=0&hors-ligne=1")
        p.attendre_carte(budget)
        n = p.js("[document.querySelector('#carte').dataset.dessin, (window.terramemo.carte.dessin() || {}).parties]")
        verifier("rechargé hors ligne", n[0] == "complet" and (n[1] or 0) > 150,
                 f"carte peinte en {time.monotonic() - debut:.1f} s, dessin {n[0]}, {n[1]} parties")
        verifier("aucune erreur JS hors ligne", len(p.erreurs) == erreurs, "; ".join(p.erreurs[erreurs:])[:300])
    except RuntimeError as e:
        verifier("rechargé hors ligne", False, str(e))
    finally:
        p.cdp("Network.emulateNetworkConditions", **dict(HORS_LIGNE, offline=False))
        if sid:
            try:
                s.nav.commande("Network.emulateNetworkConditions", session=sid, **dict(HORS_LIGNE, offline=False))
                s.nav.commande("Target.detachFromTarget", sessionId=sid)
            except RuntimeError:
                pass  # service worker arrêté entre-temps : sa session est partie avec lui


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


# Les épreuves classées d'une série, dans l'ordre de Jouer. Minute, retiré le 12/11/2026 (décision « Barème et
# classements », #30), n'y est plus : ses ids `minute:…` restent réservés, jamais réutilisés.
EPREUVES = ("chrono", "sansfaute")
MODES_RETIRES = ("minute",)


def sans_insecables(t):
    """Le texte lu, ses espaces insécables (« 97\u00a0% », les milliers) en espaces simples : pour les comparer."""
    return (t or "").replace("\u00a0", " ").replace("\u202f", " ")


# Un score d'épreuve affiché (décision « Barème et classements » : src/vues/scores.ts, fmtPart) :
# « 190/195 · 97 % », le pourcentage TRONQUÉ (194/195 montre 99 %), sur le texte passé par sans_insecables.
MOTIF_PART = re.compile(r"(\d+)/(\d+) · (\d+) %")


def part_juste(m):
    """Le pourcentage d'un MOTIF_PART trouvé est-il la part tronquée de ses justes (jamais arrondie) ?"""
    justes, total, pourcent = int(m[1]), int(m[2]), int(m[3])
    return total > 0 and pourcent == 100 * justes // total
# Les séries des pays dans Jouer, dans l'ordre de partout (décision « Écran Jouer »).
SERIES_PAYS = ["tous", "Africa", "North America", "South America", "Asia", "Europe", "Oceania"]
# Les sujets de Classé, ceux de EPREUVES_SUJETS (src/epreuve/chrono.ts ; décision « Ouverture des épreuves
# d'un sujet », 12/11 : ouverts dès leur livraison, sans date), dans l'ordre de D53 b (Communes en dernier).
# Océans et mers depuis ses épreuves (lot 3b, partie B).
SUJETS_CLASSE = ["pays", "capitales", "drapeaux", "mers", "communes"]
NOMS_CLASSE = "Pays, Capitales, Drapeaux, Océans et mers, Communes"
# Les titres des sujets (h4) du 🏆 sous chaque mode, quand tous y ont des lignes (sans pseudo : toutes les épreuves).
H4_CLASSEMENTS = ["Pays", "Capitales", "Drapeaux", "Océans et mers", "Communes"]


# Les sujets d'Entraînement, dans l'ordre de D53 b (Communes en dernier), depuis le lot 3b du J2 (Océans et mers).
SUJETS_ENTRAINEMENT = ["pays", "capitales", "drapeaux", "mers", "communes"]
NOMS_ENTRAINEMENT = "Pays, Capitales, Drapeaux, Océans et mers, Communes"
# Le choix du sujet de la carte de la mémoire du monde (D47 a), depuis le lot 3b.
SUJETS_MEMOIRE = ["pays", "capitales", "drapeaux", "mers"]


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
    chrono ou sansfaute), la partie en cours abandonnée ; attend sa
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
                          "Checker Framework Annotations", "END OF TERMS AND CONDITIONS") if m not in lu]
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
    """Captures 20 et 21 (#14 ; décision « Barème et classements » du 12/11,
    #30) : Sans faute sur l'Amérique du Sud, deux justes puis une erreur,
    jusqu'au bilan « 2 d'affilée sur N · P % » (P : 200 ÷ N, tronqué). Minute,
    retiré ce jour-là, n'a plus de partie (ses captures 22 et 23 ne sont plus
    faites)."""
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
    m = re.search(r"2 d'affilée sur (\d+) · (\d+) %", sans_insecables(lu))
    if not m or int(m[2]) != 200 // int(m[1]):
        defauts.append(f"Sans faute : bilan sans « 2 d'affilée sur N · P % », P tronqué ({lu!r})")
    titre = texte(p, "#chrono-bilan h2")
    if titre != "Sans faute · Amérique du Sud":
        defauts.append(f"bilan de Sans faute titré {titre!r}")
    capturer("21-sansfaute-bilan")
    croix_vers_carte(p, defauts, "bilan de Sans faute", "#chrono-bilan")


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
    Capitales, Drapeaux, Océans et mers, Communes sous Entraînement
    (SUJETS_ENTRAINEMENT) comme sous Classé (SUJETS_CLASSE : les épreuves
    des mers depuis le lot 3b, partie B ; Classé › Océans et mers saute sa
    série unique, comme Communes).
    `15-jouer` (Entraînement et Classé, sans Rejouer), `15b-classe-sujets`,
    `15c-classe-pays-series` (les 7 séries dans l'ordre), `15d-classe-pays-
    ams-epreuves` (les deux épreuves, Chrono et Sans faute, sans Minute,
    retiré le 12/11 ; leurs records en pourcentage, « 11/12 · 91 % » ; les
    règles ouvertes par « ? », sans Minute non plus),
    `15e-entrainement-communes` (le niveau des séries sauté) ; le retour
    arrière et « ‹ » remontent d'un niveau, une adresse invalide
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
    # Les sujets, dans l'ordre de D53 b (Communes en dernier), sous Entraînement comme sous Classé.
    cliquer(p, '#jouer-panneau [data-branche="entrainement"]')
    if lire("data-sujet") != SUJETS_ENTRAINEMENT:
        defauts.append(f"Entraînement : sujets {lire('data-sujet')} au lieu de {NOMS_ENTRAINEMENT}")
    cliquer(p, "#jouer-haut")
    p.pause(300)
    cliquer(p, '#jouer-panneau [data-branche="classe"]')
    if lire("data-sujet") != SUJETS_CLASSE:
        defauts.append(f"Classé : sujets {lire('data-sujet')} au lieu de {NOMS_CLASSE}")
    panneau_jouer(p, defauts, "Classé")
    capturer("15b-classe-sujets")
    # Classé › Océans et mers : sa série unique sautée (D44 a), Chrono et Sans faute (ui_epreuves_mers les joue).
    cliquer(p, '#jouer-panneau [data-sujet="mers"]')
    p.pause(200)
    if ou() != ["#jouer/classe/mers/mers", "exercices"] or lire("data-mode") != list(EPREUVES):
        defauts.append(f"Classé › Océans et mers : {ou()}, {lire('data-mode')} (la série sautée, Chrono et Sans faute attendus)")
    p.js("history.back()")
    p.pause(400)
    if ou() != ["#jouer/classe", "sujets"]:
        defauts.append(f"retour arrière depuis Classé › Océans et mers : {ou()} au lieu des sujets (le niveau sauté a une entrée ?)")
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
        defauts.append(f"Classé › Pays › série sans ses 2 épreuves (Chrono, Sans faute) : {modes}")
    if any(m in modes for m in MODES_RETIRES):
        defauts.append(f"Classé › Pays › Amérique du Sud propose encore Minute, retiré le 12/11 : {modes}")
    if not all(records):
        defauts.append(f"Classé › Pays › Amérique du Sud : un record manque ({records})")
    # Les records en pourcentage (décision « Barème et classements ») : « 11/12 · 91 % », « 2/12 · 16 % ».
    for m, r in zip(modes, records):
        trouve = MOTIF_PART.search(sans_insecables(r))
        if r and (not trouve or not part_juste(trouve) or "pts" in r):
            defauts.append(f"Classé › Pays › Amérique du Sud, record de {m} sans « justes/total · P % » tronqué : {r!r}")
    if [x.strip() for x in fil.split("›")] != ["Classé", "Pays", "Amérique du Sud"]:
        defauts.append(f"fil d'Ariane {fil!r} au lieu de « Classé › Pays › Amérique du Sud »")
    cliquer(p, "#jouer-aide")
    if not visible(p, "#jouer-regles"):
        defauts.append("« ? » n'ouvre pas les règles des épreuves")
    elif "Minute" in texte(p, "#jouer-regles"):
        defauts.append(f"« ? » des épreuves : Minute, retiré le 12/11, y est encore ({texte(p, '#jouer-regles')!r})")
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
    # Les noms des communes (et les capitales) arrivent à la première frappe
    # d'un profil neuf : la ligne attendue, pas une pause fixe.
    attendre_visible(p, '#recherche-liste [data-terrain="reunion"][data-id="97411"]')
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
        lu = p.js('document.getElementById("chrono-bilan").innerText') or ""
        dire(f"  Chrono, bilan : {lu!r}")
        # Le score en pourcentage (décision « Barème et classements », #30) : une seule erreur, la première,
        # donc « 11/12 · 91 % » (N − 1 sur N, tronqué), le temps total à part, plus aucun point.
        m = MOTIF_PART.search(sans_insecables(lu))
        if not m or int(m[1]) != int(m[2]) - 1 or not part_juste(m) or "Temps total" not in lu or "point" in lu.lower():
            defauts.append(f"bilan du Chrono : pas de « N−1/N · P % » (P tronqué) et « Temps total », ou des points ({lu[:160]!r})")
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
        # De même, sa grappe de drapeaux (Amérique du Sud) finie.
        ui_drapeaux(p, capturer, defauts, base, rendu, ecran, telephone)
        # De même, sa grappe des océans finie (sur une page rechargée : l'accueil sans couche marine d'abord).
        ui_mers(p, capturer, defauts, base, rendu)
        ui_seance(p, capturer, defauts, base, rendu)
        # Après la séance (son ?horloge= décale le journal) : chaque étape recharge la page sans.
        ui_epreuves_capitales(p, capturer, defauts, base, rendu)
        ui_epreuves_drapeaux(p, capturer, defauts, base, rendu)
        ui_epreuves_mers(p, capturer, defauts, base, rendu)
        # Le quiz général (lot 4b du J2, #26) : sur une page rechargée, Facile joué jusqu'au bilan.
        ui_quiz(p, capturer, defauts, base, rendu)
        # Les lignes de repère (#11) : la page rechargée sans, puis avec ; le choix gardé retiré à la fin.
        ui_lignes(p, capturer, defauts, base, rendu)
        # La fiche d'un lieu (#34, lot F1) : sur une page rechargée, la barre, la fiche, les voisins, les retours.
        ui_fiche(p, capturer, defauts, base, rendu, telephone)
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


_IDS_MERS = None


def ids_mers():
    """Les ids des 50 océans et mers (public/geo/mers.fr.json du dépôt), lus une fois."""
    global _IDS_MERS
    if _IDS_MERS is None:
        _IDS_MERS = frozenset(json.loads((RACINE / "public/geo/mers.fr.json").read_text())["noms"])
    return _IDS_MERS


def verifier_pastilles(p, defauts, quoi, cachees):
    """Décision « Pastilles cachées pendant une question de mer » (16/11/2026) :
    #carte data-pastilles (celles du monde, calculées à tout zoom pour les
    micro-États) à 0 pendant une question de mer (cachees vrai), > 0 sinon
    (une question d'un autre sujet, un bilan, la partie quittée). Rend le
    nombre lu."""
    n = p.js("+document.querySelector('#carte').dataset.pastilles")
    if cachees and n:
        defauts.append(f"{quoi} : {n} pastilles sur la carte du monde (aucune pendant une question de mer)")
    elif not cachees and not n:
        defauts.append(f"{quoi} : aucune pastille sur la carte du monde (rendues hors d'une question de mer)")
    return n


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
    """Où toucher `ident` dans la partie visible de la carte (hors de la
    barre) : sa position (pastille ou point d'étiquette) si elle y est, sinon
    le premier point d'une grille de 10 px où pick() le désigne (la Russie
    cadrée avec l'Europe de l'Est : son point d'étiquette, en Sibérie, est
    hors de l'écran) ; None s'il n'est pas à l'écran. Sur l'île (communes),
    la carte de l'île. Seul le rectangle de la barre est exclu : sur le PC,
    la barre est centrée, et l'Antarctique cadré se touche de part et
    d'autre d'elle (la grille va de haut en bas : au-dessus d'elle d'abord)."""
    return p.js(f"""(() => {{
      const c = window.terramemo.terrain() === 'reunion' ? window.terramemo.ile : window.terramemo.carte, r = c.rect();
      const b = document.querySelector({json.dumps(barre)});
      const rb = b && !b.hidden ? b.getBoundingClientRect() : null;
      const sousBarre = q => rb && q.x >= rb.left && q.x <= rb.right && q.y >= rb.top && q.y <= rb.bottom;
      // Ni sous un bouton posé sur la carte (zoom en bas à droite sur le PC, légende, liens).
      const libre = q => {{ const el = document.elementFromPoint(q.x, q.y); return !el || !el.closest('button, a, input, select, label'); }};
      const dans = q => q && q.x >= r.x && q.x <= r.x + r.largeur && q.y >= r.y && q.y <= r.y + r.hauteur && !sousBarre(q) && libre(q);
      const cercle = document.querySelector('circle.pastille[data-id="{ident}"]');
      let q = null;
      if (cercle) {{ const e = cercle.getBoundingClientRect(); q = {{x: e.x + e.width / 2, y: e.y + e.height / 2}}; }}
      else q = c.ecran("{ident}");
      if (dans(q)) return q;
      for (let y = r.y + 5; y < r.y + r.hauteur; y += 10)
        for (let x = r.x + 5; x < r.x + r.largeur; x += 10)
          if (c.pick(x, y)?.id === "{ident}" && !sousBarre({{x, y}}) && libre({{x, y}})) return {{x, y}};
      return null; }})()""")


def toucher_pays(p, ident, barre="#barre-essai"):
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    pt = position_visible(p, ident, barre)
    if not pt:
        raise RuntimeError(f"pas de position pour {ident}")
    p.toucher(pt["x"], pt["y"])


def cliquer_apres_pause(p, selecteur):
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    cliquer(p, selecteur)


def jouer_seance(p, capturer, defauts, quoi, connu=False, rater_rappel=False, arret_qcm=False, captures=None, toucher=None):
    """Joue la séance affichée jusqu'au bilan ; rend le nombre de réponses
    (une par question finie : le journal en a autant). connu : « Je connais
    déjà » au premier QCM ; rater_rappel : premier rappel touché faux (puis
    juste) ; arret_qcm : « Terminer » au premier QCM (la grappe suivante
    n'est pas jouée). captures : {forme ou 'rappel': nom} prises une fois.
    toucher(p, cible) : le toucher d'un rappel (toucher_pays par défaut ;
    toucher_mer pour une séance des mers). À chaque question, les pastilles
    du monde selon son sujet (verifier_pastilles : aucune pour une mer), et
    rendues au bilan."""
    toucher = toucher or toucher_pays
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
        # Une question de mer sans les pastilles des micro-États, une autre avec (décision du 16/11).
        verifier_pastilles(p, defauts, f"{quoi} ({forme} {cible})", cible in ids_mers())
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
            toucher(p, cible)
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
    else:
        verifier_pastilles(p, defauts, f"{quoi}, bilan", False)
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
    Capitales, Drapeaux, Communes, la vignette des capitales en points, rien de
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
    if sujets != SUJETS_ENTRAINEMENT:
        defauts.append(f"Entraînement : sujets {sujets} au lieu de {NOMS_ENTRAINEMENT}")
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
    if fautes and "tu avais choisi" not in bilan:
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


def ressources_drapeaux(p):
    """Les ressources /geo/drapeaux* chargées par la page (manifeste et images)."""
    return p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/geo/drapeaux'))")


# Un drapeau servi : nommé par son empreinte seule (rien n'y nomme le pays).
MOTIF_ADRESSE_DRAPEAU = re.compile(r"^/geo/drapeaux/[0-9a-f]{8}\.svg$")

# La grille de Reconnaître sous Drapeaux, telle qu'affichée : la barre, ses
# boutons-images et leurs drapeaux (attributs, taille, place, chargés ou non).
ETAT_GRILLE_DRAPEAUX = """(() => {
  const b = document.getElementById('barre-nommer'), r = b.getBoundingClientRect();
  const boutons = [...b.querySelectorAll('.nommer-choix')].map(x => {
    const q = x.getBoundingClientRect(), i = x.querySelector('img'), ir = i && i.getBoundingClientRect(), s = getComputedStyle(x);
    return { id: x.dataset.id, aria: x.getAttribute('aria-label'), title: x.getAttribute('title'), texte: x.innerText.trim(),
             classe: x.className, fond: s.backgroundColor, ombre: s.boxShadow,
             dedans: q.left >= r.left - 0.5 && q.right <= r.right + 0.5 && q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5,
             img: i && { src: i.getAttribute('src'), alt: i.getAttribute('alt'), title: i.getAttribute('title'), drag: i.getAttribute('draggable'),
                         w: ir.width, h: ir.height, charge: i.classList.contains('charge') && i.naturalWidth > 0,
                         dedans: ir.left >= q.left - 0.5 && ir.right <= q.right + 0.5 && ir.top >= q.top - 0.5 && ir.bottom <= q.bottom + 0.5 } };
  });
  return { boutons, deborde: b.scrollWidth > b.clientWidth + 1, l: r.left, r: r.right, haut: r.top, bas: r.bottom,
           largeur: innerWidth, hauteur: innerHeight, images: b.querySelector('.nommer-grille').classList.contains('nommer-grille-images'),
           consigne: b.querySelector('.essai-consigne').innerText.trim(), retro: b.querySelector('.essai-retro').innerText.trim() };
})()"""


def ui_drapeaux(p, capturer, defauts, base, parametres="", ecran=None, telephone=True):
    """Captures 100 à 110 (lot 2 du J2, partie B, #4 ; étude § 5.3, 6.4, 7.2) :
    le sujet Drapeaux en Entraînement, sur une page rechargée. Rien de
    drapeaux* au premier affichage ni à l'ouverture de Jouer ; Jouer :
    Pays, Capitales, Drapeaux, Océans et mers, Communes sous Entraînement, l'icône du sujet,
    « 54 drapeaux », le « ? » des exercices visuels ; Drapeaux sous Classé
    aussi (ses épreuves : ui_epreuves_drapeaux). Trouver sur l'Amérique du Sud joué
    jusqu'au bilan (« Pays de ce drapeau : » et le drapeau, alt « Drapeau à
    reconnaître », jamais le pays avant la réponse ; « Juste : pays ») ;
    Reconnaître sur l'Afrique à 375 px de large sur le téléphone (la grille
    2 × 2 de boutons-images « Choix 1 » à « Choix 4 », sans title, drapeaux
    chargés à leur taille fixe, rien ne déborde, la zone allumée visible
    au-dessus de la barre, une faute : contour rouge sans fond, « tu avais
    choisi ») ; Apprendre sur l'Amérique du Sud (le conseil de D39 b, puis la
    grappe jusqu'au bilan) ; le journal en drapeaux: seulement ; la carte de
    la mémoire (Pays, Capitales, Drapeaux, Mers, « Drapeau : vu 1 fois »). DÉFAUT
    à tout écart."""
    p.goto("about:blank")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    if ressources_drapeaux(p):
        defauts.append(f"drapeaux* chargé au premier affichage : {ressources_drapeaux(p)}")
    fiches_avant = collections.Counter(p.js(FICHES_JOURNAL) or [])
    _, _, corps = http(base + "geo/noms.fr.json")
    noms = json.loads(corps)

    def lire(attr):
        return p.js(f"[...document.querySelectorAll('#jouer-panneau [{attr}]')].map(b => b.getAttribute('{attr}'))")

    def sans_pays(quoi, t, ids):
        """Aucun nom ni id de ces pays dans `t` (avant la réponse)."""
        vus = [i for i in ids if re.search(rf"\b{re.escape(i)}\b", t or "") or (noms.get(i) and noms[i] in (t or ""))]
        if vus:
            defauts.append(f"{quoi} : le pays nommé avant la réponse ({vus} dans {t!r})")

    # Jouer › Entraînement : les sujets, l'icône des drapeaux (rien à charger).
    p.js('location.hash = "#jouer"')
    attendre_visible(p, "#jouer-panneau")
    cliquer(p, '#jouer-panneau [data-branche="entrainement"]')
    if lire("data-sujet") != SUJETS_ENTRAINEMENT:
        defauts.append(f"Entraînement : sujets {lire('data-sujet')} au lieu de {NOMS_ENTRAINEMENT}")
    if not p.js("!!document.querySelector('#jouer-panneau [data-sujet=\"drapeaux\"] .vignette-icone')"):
        defauts.append("Drapeaux sans son icône (D53 a)")
    panneau_jouer(p, defauts, "Entraînement (Drapeaux)")
    capturer("100-drapeaux-sujets")
    cliquer(p, '#jouer-panneau [data-sujet="drapeaux"]')
    series = lire("data-serie")
    if series != SERIES_PAYS or "54 drapeaux" not in texte(p, "#jouer-panneau"):
        defauts.append(f"Drapeaux : séries {series}, sans « 54 drapeaux » ?")
    capturer("101-drapeaux-series")
    cliquer(p, '#jouer-panneau [data-serie="Africa"]')
    modes = lire("data-mode")
    if modes != ["apprendre", "localiser", "nommer"]:
        defauts.append(f"Drapeaux › Afrique : exercices {modes}")
    if not p.js("!!document.getElementById('jouer-aide')"):
        defauts.append("Drapeaux › Afrique : pas de « ? » (exercices visuels)")
    else:
        cliquer(p, "#jouer-aide")
        aide = texte(p, "#jouer-regles")
        dire(f"  Drapeaux, « ? » : {aide!r}")
        if "visuel" not in aide:
            defauts.append(f"le « ? » des drapeaux ne dit pas que l'exercice est visuel : {aide!r}")
    capturer("102-drapeaux-afrique-exercices")
    if ressources_drapeaux(p):
        defauts.append(f"drapeaux* chargé à l'ouverture de Jouer : {ressources_drapeaux(p)}")
    # Classé : Drapeaux aussi (décision « Ouverture des épreuves d'un sujet », 12/11).
    p.js('location.hash = "#jouer/classe"')
    p.pause(300)
    if "drapeaux" not in lire("data-sujet"):
        defauts.append(f"Classé : sujets {lire('data-sujet')}, sans Drapeaux")

    # Trouver sur l'Amérique du Sud, jusqu'au bilan.
    jouer_partie(p, "localiser", "South America", "drapeaux")
    p.pause(300)
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    premier = True
    for _ in range(20):
        if visible(p, "#essai-bilan"):
            break
        cible = p.js('document.querySelector("#barre-essai .essai-consigne").dataset.cible')
        e = p.js("""(() => { const c = document.querySelector('#barre-essai .essai-consigne'), i = c.querySelector('img.drapeau');
            // Les attributs de la barre et de tout ce qu'elle contient (consigne, <strong>, image : title, aria-*…), data-* exceptés.
            const attrs = [...document.querySelectorAll('#barre-essai, #barre-essai *')].flatMap((x) =>
                [...x.attributes].filter((a) => !a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`)).join(' ');
            return { texte: c.innerText.trim(), barre: document.getElementById('barre-essai').innerText, attrs,
                     img: i && { src: i.getAttribute('src'), alt: i.getAttribute('alt'), title: i.getAttribute('title'),
                                 drag: i.getAttribute('draggable'), w: i.getBoundingClientRect().width } }; })()""")
        img = e["img"] or {}
        if not e["texte"].startswith("Pays de ce drapeau") or not e["img"]:
            defauts.append(f"Trouver sous Drapeaux : consigne {e['texte']!r}, image {e['img']}")
        elif img["alt"] != "Drapeau à reconnaître" or img["title"] is not None or img["drag"] != "false" or not MOTIF_ADRESSE_DRAPEAU.match(img["src"] or ""):
            defauts.append(f"Trouver sous Drapeaux, {cible} : image {img}")
        sans_pays("Trouver sous Drapeaux", e["barre"] + " " + e["attrs"], [cible])
        if premier:
            dire(f"  Drapeaux, Trouver : {e['texte']!r}, drapeau {img.get('src')} ({img.get('w')} px de large)")
            capturer("103-drapeaux-trouver")
        toucher_pays(p, cible)
        p.pause(250)
        retro = texte(p, "#barre-essai .essai-retro")
        if not re.match(r"Juste( \([^)]*\))? : ", retro) or noms.get(cible, cible) not in retro:
            defauts.append(f"Trouver sous Drapeaux, {cible} : rétroaction {retro!r} sans « Juste : {noms.get(cible)} »")
            cliquer_apres_pause(p, "#essai-passer")
        if premier:
            dire(f"  Drapeaux, Trouver, juste ({cible}) : {retro!r}")
            capturer("104-drapeaux-trouver-juste")
            premier = False
        p.pause(1300)
    bilan = texte(p, "#essai-bilan")
    dire(f"  Drapeaux, Trouver, bilan : {bilan!r}")
    if not visible(p, "#essai-bilan"):
        defauts.append("Trouver sous Drapeaux : pas de bilan au bout de l'Amérique du Sud")

    # Reconnaître sur l'Afrique, à 375 px de large sur le téléphone : trois questions (une faute), puis « Terminer ».
    if telephone and ecran:
        p.emuler(dict(ecran, largeur=375), tactile=True)
    try:
        jouer_partie(p, "nommer", "Africa", "drapeaux")
        fautes = 0
        for k in range(3):
            attendre_fin_vol(p)
            fin = time.monotonic() + 5
            g = p.js(ETAT_GRILLE_DRAPEAUX)
            while time.monotonic() < fin and not all((b["img"] or {}).get("charge") for b in g["boutons"]):
                p.pause(100)
                g = p.js(ETAT_GRILLE_DRAPEAUX)
            cible = p.js('document.querySelector("#barre-nommer .essai-consigne").dataset.cible')
            ids = [b["id"] for b in g["boutons"]]
            haut = 66 if g["largeur"] < 600 else 98  # 64 px (96 au-delà de 600 px) et le liseré de 1 px
            if g["consigne"] != "Quel est son drapeau ?" or not g["images"] or len(ids) != 4:
                defauts.append(f"Reconnaître sous Drapeaux : consigne {g['consigne']!r}, grille d'images {g['images']}, choix {ids}")
            for n, b in enumerate(g["boutons"], 1):
                i = b["img"] or {}
                if b["aria"] != f"Choix {n}" or b["title"] is not None or b["texte"]:
                    defauts.append(f"Reconnaître sous Drapeaux, bouton {n} : aria-label {b['aria']!r}, title {b['title']!r}, texte {b['texte']!r}")
                if not b["img"] or i["alt"] != "" or i["title"] is not None or i["drag"] != "false" or not MOTIF_ADRESSE_DRAPEAU.match(i["src"] or ""):
                    defauts.append(f"Reconnaître sous Drapeaux, bouton {n} : image {b['img']}")
                elif not i["charge"]:
                    defauts.append(f"Reconnaître sous Drapeaux, bouton {n} : drapeau pas chargé ({i['src']})")
                elif abs(i["h"] - haut) > 1 or abs(i["w"] - (haut - 2) * 4 / 3 - 2) > 1.5 or not i["dedans"] or not b["dedans"]:
                    defauts.append(f"Reconnaître sous Drapeaux, bouton {n} : drapeau de {i['w']:.0f} × {i['h']:.0f} px (attendu {haut} de haut), dans son bouton {i['dedans']}, bouton dans la barre {b['dedans']}")
            if g["deborde"] or g["l"] < 0 or g["r"] > g["largeur"] or g["haut"] < 0 or g["bas"] > g["hauteur"]:
                defauts.append(f"Reconnaître sous Drapeaux : la barre déborde ({g['l']:.0f}–{g['r']:.0f} sur {g['largeur']}, {g['haut']:.0f}–{g['bas']:.0f} sur {g['hauteur']})")
            if ids.count("IDN") + ids.count("MCO") > 1 or ids.count("ROU") + ids.count("TCD") > 1:
                defauts.append(f"Reconnaître sous Drapeaux : deux jumeaux dans la grille ({ids})")
            # Tout ce que la barre et ses boutons disent, data-id excepté (la page le lit, ne le dit ni ne le montre).
            dits = json.dumps([{c: v for c, v in b.items() if c != "id"} for b in g["boutons"]], ensure_ascii=False)
            sans_pays("Reconnaître sous Drapeaux", texte(p, "#barre-nommer") + " " + dits, [i for i in ids if i])
            verifier_cadrage(p, defauts, f"Reconnaître sous Drapeaux, {g['largeur']} px")
            if k == 0:
                dire(f"  Drapeaux, Reconnaître ({cible}, {g['largeur']} px) : barre {g['haut']:.0f}–{g['bas']:.0f}, choix {ids}")
                capturer("105-drapeaux-reconnaitre-375")
            choisi = next(i for i in ids if i != cible) if k == 1 else cible
            fautes += choisi != cible
            cliquer_apres_pause(p, f'#barre-nommer .nommer-choix[data-id="{choisi}"]')
            p.pause(200)
            g = p.js(ETAT_GRILLE_DRAPEAUX)
            retro = g["retro"]
            if choisi == cible and not retro.startswith(f"Juste : {noms.get(cible, cible)}"):
                defauts.append(f"Reconnaître sous Drapeaux : rétroaction juste {retro!r} sans « Juste : {noms.get(cible)} »")
            if k == 1:
                dire(f"  Drapeaux, Reconnaître, faux : {retro!r}")
                if retro != f"Faux · bonne réponse : {noms.get(cible, cible)} · tu avais choisi : {noms.get(choisi, choisi)}":
                    defauts.append(f"Reconnaître sous Drapeaux, faux : rétroaction {retro!r}")
                faux = next(b for b in g["boutons"] if b["id"] == choisi)
                bon = next(b for b in g["boutons"] if b["id"] == cible)
                # Contour de 3 px, jamais de fond vert ou rouge (il se confondrait avec les couleurs d'un drapeau).
                for quoi, b in (("le mauvais choix", faux), ("le bon", bon)):
                    if "3px" not in b["ombre"] or b["fond"] not in ("rgba(0, 0, 0, 0)", "transparent"):
                        defauts.append(f"Reconnaître sous Drapeaux, {quoi} : contour {b['ombre']!r}, fond {b['fond']!r}")
                capturer("106-drapeaux-reconnaitre-faux")
            p.pause(1900)
        cliquer_apres_pause(p, "#nommer-terminer")
        attendre_visible(p, "#essai-bilan")
        bilan = texte(p, "#essai-bilan")
        dire(f"  Drapeaux, Reconnaître, bilan : {bilan!r}")
        if fautes and "tu avais choisi" not in bilan:
            defauts.append(f"bilan de Reconnaître sous Drapeaux sans sa faute : {bilan!r}")
    finally:
        if telephone and ecran:
            p.emuler(ecran, tactile=True)

    # Apprendre sur l'Amérique du Sud : le conseil (pays pas appris), puis la grappe jusqu'au bilan.
    jouer_jusqua(p, "apprendre", "South America", "drapeaux")
    cliquer_apres_pause(p, '#jouer-panneau [data-mode="apprendre"]')
    attendre_visible(p, "#essai-bilan", 20)
    conseil = texte(p, "#essai-bilan")
    dire(f"  Drapeaux, Apprendre, ouverture : {conseil!r}")
    if not p.js("!!document.getElementById('seance-commencer')") or "Pays › Amérique du Sud › Apprendre" not in conseil:
        defauts.append(f"Apprendre sous Drapeaux sans le conseil de D39 b à l'ouverture : {conseil!r}")
    else:
        capturer("107-drapeaux-apprendre-conseil")
        cliquer_apres_pause(p, "#seance-commencer")
    jouer_seance(p, capturer, defauts, "Apprendre Drapeaux", captures={"qcm": "108-drapeaux-apprendre-qcm"})
    bilan = texte(p, "#essai-bilan")
    dire(f"  Drapeaux, Apprendre, bilan : {bilan!r}")
    if "Apprendre · Amérique du Sud" not in bilan or "Nouveaux" not in bilan:
        defauts.append(f"bilan d'Apprendre sous Drapeaux sans titre ou sans « Nouveaux » : {bilan!r}")
    capturer("109-drapeaux-apprendre-bilan")
    nouvelles = collections.Counter(p.js(FICHES_JOURNAL) or []) - fiches_avant
    hors = [f for f in nouvelles.elements() if not f.startswith("drapeaux:")]
    dire(f"  journal : {sum(nouvelles.values())} événements de drapeaux, {len(hors)} hors drapeaux:")
    if hors or not nouvelles:
        defauts.append(f"journal des parties de drapeaux : {hors[:5]} hors drapeaux: ({sum(nouvelles.values())} événements)")
    cliquer_apres_pause(p, "#seance-carte")
    p.pause(400)

    # La carte de la mémoire : Pays, Capitales, Drapeaux, Mers au choix ; un pays de la grappe touché (« Drapeau : vu 1 fois · … »).
    sujets = p.js("[...document.querySelectorAll('#legende-sujet option')].map(o => o.value)")
    if sujets != SUJETS_MEMOIRE:
        defauts.append(f"carte de la mémoire : sujets {sujets} au lieu de Pays, Capitales, Drapeaux, Mers")
    else:
        p.js("(() => { const s = document.getElementById('legende-sujet'); s.value = 'drapeaux'; s.dispatchEvent(new Event('change')); })()")
        p.pause(300)
        appris = sorted({f.split(":")[1] for f in nouvelles if f.startswith("drapeaux:") and f.endswith(":localiser")})
        for ident in appris:
            pt = position_visible(p, ident, "#barre-carte")
            if pt:
                break
        if not appris or not pt:
            defauts.append(f"carte de la mémoire : aucun pays de la grappe de drapeaux à l'écran ({appris})")
        else:
            p.pause(PAUSE_AVANT_TOUCHER_MS)
            p.toucher(pt["x"], pt["y"])
            p.pause(300)
            barre = texte(p, "#barre-carte")
            dire(f"  carte de la mémoire (Drapeaux), {ident} touché : {barre!r}")
            if not re.search(r"Drapeau : vu \d+ fois · (revient|à revoir)", barre):
                defauts.append(f"carte de la mémoire : {ident} touché sans « Drapeau : vu N fois · revient… » ({barre!r})")
            capturer("110-drapeaux-memoire")
        # Le choix gardé sur l'appareil : Pays de nouveau, pour la suite (ui_seance, ui_memoire).
        p.js("(() => { const s = document.getElementById('legende-sujet'); s.value = 'pays'; s.dispatchEvent(new Event('change')); })()")
        p.pause(200)


# --- Le sujet Océans et mers (lot 3b du J2, partie A, #27) ---------------------

def ressources_mers(p):
    """Les fichiers /geo/mers* chargés par la page (sans le dossier)."""
    return p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/geo/mers')).map(n => n.split('/').pop().split('?')[0])")


def position_mer(p, ident, barre="#barre-essai", sans_pays=False):
    """Où toucher la zone marine `ident` pour qu'elle soit notée juste, dans
    la partie visible de la carte (au-dessus de la barre) : son point
    d'étiquette (ecran) si noter() l'y dit juste, sinon le premier point
    d'une grille de 12 px où il l'est ; None sinon. La couche marine doit
    être posée (une partie ou une séance de mers : noter lève avant).
    sans_pays : à l'accueil, où un pays l'emporte sur la mer, aussi aucun
    pays au point (pick n'y rend rien, ou la mer elle-même) : le point
    d'étiquette de la Méditerranée tombe parfois sur la pastille de Malte."""
    libre = f'(k => !k || k.id === "{ident}")(c.pick(q.x, q.y))' if sans_pays else "true"
    return p.js(f"""(() => {{
      const c = window.terramemo.carte, r = c.rect();
      const b = document.querySelector({json.dumps(barre)});
      const bas = b && !b.hidden ? b.getBoundingClientRect().top : r.y + r.hauteur;
      const dans = q => q && q.x >= r.x && q.x <= r.x + r.largeur && q.y >= r.y && q.y <= bas;
      const juste = q => {{ try {{ return c.noter("{ident}", q.x, q.y).juste && {libre}; }} catch (e) {{ return false; }} }};
      const q = c.ecran("{ident}");
      if (dans(q) && juste(q)) return q;
      for (let y = r.y + 6; y < bas; y += 12)
        for (let x = r.x + 6; x < r.x + r.largeur; x += 12)
          if (juste({{x, y}})) return {{x, y}};
      return null; }})()""")


def toucher_mer(p, ident, barre="#barre-essai"):
    """Touche la zone marine `ident` là où elle est juste ; la carte cadrée
    sur elle d'abord (zoomerSur : son emprise) si elle n'est pas à l'écran."""
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    pt = position_mer(p, ident, barre)
    if not pt:
        p.js(f'window.terramemo.carte.zoomerSur("{ident}")')
        attendre_fin_vol(p)
        pt = position_mer(p, ident, barre)
    if not pt:
        raise RuntimeError(f"pas de position pour la mer {ident}")
    p.toucher(pt["x"], pt["y"])


def ui_mers(p, capturer, defauts, base, parametres=""):
    """Captures 120 à 133 (lot 3b du J2, partie A, #27 ; étude § 5.4, 6, 7.2,
    7.3 ; D44 a, D45 a, D47 a) : le sujet Océans et mers en Entraînement, sur
    une page rechargée. Rien de mers* au premier affichage ni à l'ouverture
    de Jouer ; Jouer : Pays, Capitales, Drapeaux, Océans et mers, Communes
    sous Entraînement (et sous Classé : ses épreuves, ui_epreuves_mers), la vignette des
    mers éclairées, « 50 océans et mers », la série unique sautée ; à
    l'accueil, un pays touché ne charge rien de marin, l'eau touchée donne le
    nom de la mer par la couche légère, puis la mer allumée en bleu (la couche
    fine posée, choix du 14/11/2026), sans teinte ; la recherche « Manche » (« bras de mer ») cadre et
    allume la Manche ; Trouver (« Touche : » et un nom, jamais l'id ; la mer
    Égée trouvée ; une partie touchée : « Juste : …, dans … » ; une autre mer
    touchée : « Faux : mer …, à … du bord » ; le bilan par les noms) ;
    Reconnaître (« Quelle est cette mer ? » ou « Quel est cet océan ? »,
    quatre noms, une faute, le bilan) ; Apprendre jusqu'au bilan (la grappe
    « Océans ») ; le journal en mers: seulement ; la carte de la mémoire
    « Mers » (ses zones teintées, « n/50 maîtrisées », le carré « Jamais
    vu » de la légende couleur d'eau, celui de la terre sous Pays ; un océan
    touché : sa mémoire ; aucune pastille, #carte data-disques à 0, rendues
    de retour à Pays). Pendant chaque question de mer (Trouver, Reconnaître,
    Apprendre), #carte data-pastilles à 0, et > 0 à chaque bilan (décision
    « Pastilles cachées pendant une question de mer », 16/11 :
    verifier_pastilles). DÉFAUT à tout écart."""
    p.goto("about:blank")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    if ressources_mers(p):
        defauts.append(f"mers* chargé au premier affichage : {ressources_mers(p)}")
    fiches_avant = collections.Counter(p.js(FICHES_JOURNAL) or [])
    _, _, corps = http(base + "geo/mers.fr.json")
    noms = json.loads(corps)["noms"]
    ids = set(noms)
    # Les zones qui ont des parties, et l'une d'elles (Note.admis, « dans … ») ; une mer intérieure, jamais une partie de l'Atlantique.
    PARTIES = {"atlant": "caraibes", "pacif": "japon", "indien": "arabie", "arctique": "kara", "medit": "adriat",
               "noire": "azov", "baltique": "botnie", "barents": "blanche", "chinemer": "thailand"}

    def lire(attr):
        return p.js(f"[...document.querySelectorAll('#jouer-panneau [{attr}]')].map(b => b.getAttribute('{attr}'))")

    def sans_id(quoi, t):
        vus = sorted(i for i in ids if re.search(rf"(?<![\w']){re.escape(i)}(?![\w'])", t or ""))
        if vus:
            defauts.append(f"{quoi} : un id brut affiché ({vus} dans {t!r})")

    # Jouer › Entraînement : Océans et mers, sa vignette (rangée dans le code), « 50 océans et mers ».
    p.js('location.hash = "#jouer"')
    attendre_visible(p, "#jouer-panneau")
    cliquer(p, '#jouer-panneau [data-branche="entrainement"]')
    if lire("data-sujet") != SUJETS_ENTRAINEMENT:
        defauts.append(f"Entraînement : sujets {lire('data-sujet')} au lieu de {NOMS_ENTRAINEMENT}")
    tuile = texte(p, '#jouer-panneau [data-sujet="mers"]')
    if "Océans et mers" not in tuile or "50 océans et mers" not in tuile:
        defauts.append(f"tuile Océans et mers : {tuile!r} (« 50 océans et mers » attendu)")
    if not p.js("!!document.querySelector('#jouer-panneau [data-sujet=\"mers\"] .vignette-eaux')"):
        defauts.append("Océans et mers sans sa vignette (les mers éclairées, D53 a)")
    panneau_jouer(p, defauts, "Entraînement (Océans et mers)")
    capturer("120-mers-sujets")
    cliquer(p, '#jouer-panneau [data-sujet="mers"]')
    # Une seule série (D44 a) : son niveau sauté, comme Communes.
    if niveau_jouer(p) != "exercices" or lire("data-mode") != ["apprendre", "localiser", "nommer"]:
        defauts.append(f"Océans et mers : niveau {niveau_jouer(p)}, exercices {lire('data-mode')} (la série sautée, Apprendre, Trouver, Reconnaître attendus)")
    capturer("121-mers-exercices")
    if ressources_mers(p):
        defauts.append(f"mers* chargé à l'ouverture de Jouer : {ressources_mers(p)}")
    p.js('location.hash = "#jouer/classe"')
    p.pause(300)
    if lire("data-sujet") != SUJETS_CLASSE:
        defauts.append(f"Classé : sujets {lire('data-sujet')} au lieu de {NOMS_CLASSE} (les épreuves des mers, partie B)")
    if ressources_mers(p):
        defauts.append(f"mers* chargé à l'ouverture de Classé : {ressources_mers(p)}")

    # L'accueil : un pays touché ne charge rien de marin ; l'eau, le nom de la mer par la couche légère seule.
    p.js('location.hash = "#carte"')
    p.pause(300)
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    p.pause(300)
    pt = position(p, "BRA")
    p.toucher(pt["x"], pt["y"])
    p.pause(400)
    if ressources_mers(p):
        defauts.append(f"un pays touché à l'accueil charge mers* : {ressources_mers(p)}")
    eau = p.js("""(() => { const c = window.terramemo.carte, r = c.rect(), b = document.getElementById('barre-carte').getBoundingClientRect();
        const x = r.x + r.largeur / 2;
        for (let y = r.y + r.hauteur * 0.55; y < Math.min(b.top, r.y + r.hauteur) - 6; y += 6) if (!c.pick(x, y)) return {x, y};
        for (let y = r.y + r.hauteur * 0.45; y > r.y + 6; y -= 6) if (!c.pick(x, y)) return {x, y};
        return null; })()""")
    if not eau:
        defauts.append("accueil : aucun point d'eau trouvé au milieu de la carte")
    else:
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        p.toucher(eau["x"], eau["y"])
        fin = time.monotonic() + 8
        while time.monotonic() < fin and (texte(p, "#barre-carte .barre-nom") not in noms.values() or "mers.topo.json" not in ressources_mers(p)):
            p.pause(100)
        p.pause(300)
        nom = texte(p, "#barre-carte .barre-nom")
        lus = ressources_mers(p)
        dire(f"  accueil, l'eau touchée : {nom!r} ; lu {lus}")
        if nom not in noms.values():
            defauts.append(f"accueil : l'eau touchée sans le nom de la mer ({nom!r})")
        if sorted(set(lus)) != sorted(FICHIERS_GEO_MERS):
            defauts.append(f"accueil : {lus} lus (la légère pour le nom, puis la fine pour allumer la mer : {', '.join(FICHIERS_GEO_MERS)})")
        if p.js("window.terramemo.carte.teintes()"):
            defauts.append("accueil : des zones teintées sans la carte de la mémoire des mers")
        capturer("122-mers-accueil-eau")

    # La recherche « Manche » : « bras de mer », puis la Manche cadrée et allumée.
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text="Manche")
    fin = time.monotonic() + 8
    while time.monotonic() < fin and "bras de mer" not in texte(p, "#recherche-liste"):
        p.pause(100)
    liste = texte(p, "#recherche-liste")
    dire(f"  recherche « Manche » : {liste!r}")
    if "bras de mer" not in liste:
        defauts.append(f"recherche « Manche » sans « bras de mer » : {liste!r}")
    capturer("123-mers-recherche")
    avant = p.js("window.terramemo.carte.transfo().k")
    p.js("""[...document.querySelectorAll('#recherche-liste [role="option"]')].find(o => o.dataset.id === 'manche')?.click()""")
    fin = time.monotonic() + 8
    while time.monotonic() < fin and texte(p, "#barre-carte .barre-nom") != "Manche":
        p.pause(100)
    attendre_fin_vol(p)
    barre = texte(p, "#barre-carte")
    k = p.js("window.terramemo.carte.transfo().k")
    dire(f"  recherche → Manche : {barre!r}, zoom {avant:.2f} → {k:.2f}")
    if not barre.startswith("Manche") or k <= avant:
        defauts.append(f"recherche « Manche » : {barre!r}, zoom {avant:.2f} → {k:.2f} (la Manche nommée, cadrée attendue)")
    if "mers.topo.json" not in ressources_mers(p):
        defauts.append("recherche « Manche » : la couche fine pas chargée (pour allumer la zone)")
    capturer("124-mers-recherche-manche")

    # Trouver : 50 zones dans le désordre ; la mer Égée trouvée, une partie touchée, une autre mer touchée, puis « Terminer ».
    jouer_partie(p, "localiser", "mers", "mers")
    p.pause(300)
    egee = partie = faux = False
    for _ in range(52):
        if visible(p, "#essai-bilan") or (egee and partie and faux):
            break
        cible = p.js('document.querySelector("#barre-essai .essai-consigne").dataset.cible')
        consigne = texte(p, "#barre-essai .essai-consigne")
        sans_id("Trouver sous Mers", texte(p, "#barre-essai"))
        verifier_pastilles(p, defauts, f"Trouver sous Mers ({cible})", True)
        if consigne != f"Touche : {noms.get(cible)}":
            defauts.append(f"Trouver sous Mers, {cible} : consigne {consigne!r}")
        retro = ""
        if cible == "egee" and not egee:
            capturer("125-mers-trouver-egee")
            toucher_mer(p, "egee")
            p.pause(250)
            retro = texte(p, "#barre-essai .essai-retro")
            dire(f"  Mers, Trouver la mer Égée : {retro!r}")
            if not retro.startswith("Juste"):
                defauts.append(f"Trouver la mer Égée : {retro!r}")
            egee = True
        elif cible in PARTIES and not partie:
            z = PARTIES[cible]
            toucher_mer(p, z)
            p.pause(250)
            retro = texte(p, "#barre-essai .essai-retro")
            dire(f"  Mers, Trouver {cible}, {z} touchée : {retro!r}")
            if not re.match(rf"Juste : {re.escape(noms[z])}, dans ", retro):
                defauts.append(f"Trouver {noms.get(cible)}, {noms[z]} touchée : {retro!r} (« Juste : {noms[z]}, dans … » attendu)")
            capturer("126-mers-trouver-partie")
            partie = True
        elif not faux and cible not in ("noire", "azov", "medit", "atlant") and cible != "egee":
            # La mer Noire : jamais une partie ni ce qu'allume une autre cible que celles-là. La carte
            # cadrée sur elle d'abord, comme au Sans faute : un Trouver part de la vue du monde (#26,
            # 15/11), où une petite mer voisine (l'Ionienne) a son halo de 12 px jusqu'à la mer Noire,
            # et le toucher y serait juste « au plus près », comme la décision « Océans et mers » le veut.
            p.js('window.terramemo.carte.zoomerSur("noire")')
            attendre_fin_vol(p)
            toucher_mer(p, "noire")
            p.pause(250)
            retro = texte(p, "#barre-essai .essai-retro")
            dire(f"  Mers, Trouver {cible}, la mer Noire touchée : {retro!r}")
            if not retro.startswith("Faux : mer Noire, à "):
                defauts.append(f"Trouver {noms.get(cible)}, la mer Noire touchée : {retro!r} (« Faux : mer Noire, à … du bord » attendu)")
            capturer("127-mers-trouver-faux")
            faux = True
            cliquer_apres_pause(p, "#essai-passer")
            p.pause(300)
            continue
        else:
            cliquer_apres_pause(p, "#essai-passer")
            p.pause(300)
            continue
        if retro.startswith("Juste"):
            p.pause(1300)
        else:
            cliquer_apres_pause(p, "#essai-passer")
            p.pause(300)
    if not (egee and partie and faux):
        defauts.append(f"Trouver sous Mers : Égée {egee}, partie {partie}, faux {faux} (les trois attendus)")
    if not visible(p, "#essai-bilan"):
        cliquer_apres_pause(p, "#essai-terminer")
        attendre_visible(p, "#essai-bilan")
    bilan = texte(p, "#essai-bilan")
    dire(f"  Mers, Trouver, bilan : {bilan[:200]!r} ; {verifier_pastilles(p, defauts, 'bilan de Trouver sous Mers', False)} pastilles")
    sans_id("bilan de Trouver sous Mers", bilan)
    if "Océans et mers" not in bilan:
        defauts.append(f"bilan de Trouver sous Mers sans « Océans et mers » : {bilan[:200]!r}")
    capturer("128-mers-trouver-bilan")

    # Reconnaître : trois questions, une faute, puis « Terminer ».
    jouer_partie(p, "nommer", "mers", "mers")
    for k in range(3):
        attendre_fin_vol(p)
        cible = p.js('document.querySelector("#barre-nommer .essai-consigne").dataset.cible')
        consigne = texte(p, "#barre-nommer .essai-consigne")
        boutons = p.js("[...document.querySelectorAll('#barre-nommer .nommer-choix')].map(b => [b.dataset.id, b.innerText.trim()])")
        if consigne not in ("Quelle est cette mer ?", "Quel est cet océan ?") or len(boutons) != 4:
            defauts.append(f"Reconnaître sous Mers : consigne {consigne!r}, choix {boutons}")
        if any(t != noms.get(i) for i, t in boutons):
            defauts.append(f"Reconnaître sous Mers : un choix sans son nom ({boutons})")
        sans_id("Reconnaître sous Mers", texte(p, "#barre-nommer"))
        verifier_pastilles(p, defauts, f"Reconnaître sous Mers ({cible})", True)
        verifier_cadrage(p, defauts, f"Reconnaître sous Mers ({cible})")
        if k == 0:
            dire(f"  Mers, Reconnaître ({cible}) : {consigne!r}, {[t for _, t in boutons]}")
            capturer("129-mers-reconnaitre")
        choisi = next(i for i, _ in boutons if i != cible) if k == 1 else cible
        cliquer_apres_pause(p, f'#barre-nommer .nommer-choix[data-id="{choisi}"]')
        p.pause(200)
        retro = texte(p, "#barre-nommer .essai-retro")
        if k == 1:
            dire(f"  Mers, Reconnaître, faux : {retro!r}")
            if retro != f"Faux · bonne réponse : {noms.get(cible)}":
                defauts.append(f"Reconnaître sous Mers, faux : {retro!r}")
            capturer("130-mers-reconnaitre-faux")
        p.pause(1900)
    cliquer_apres_pause(p, "#nommer-terminer")
    attendre_visible(p, "#essai-bilan")
    bilan = texte(p, "#essai-bilan")
    dire(f"  Mers, Reconnaître, bilan : {bilan!r}")
    verifier_pastilles(p, defauts, "bilan de Reconnaître sous Mers", False)
    sans_id("bilan de Reconnaître sous Mers", bilan)
    if "tu avais choisi" not in bilan:
        defauts.append(f"bilan de Reconnaître sous Mers sans sa faute : {bilan!r}")

    # Apprendre : la grappe « Océans », jusqu'au bilan ; aucun prérequis (pas de conseil).
    jouer_jusqua(p, "apprendre", "mers", "mers")
    cliquer_apres_pause(p, '#jouer-panneau [data-mode="apprendre"]')
    attendre_question(p, delai_s=15)
    if p.js("!!document.getElementById('seance-commencer')"):
        defauts.append("Apprendre sous Mers : un conseil de prérequis (D39 : rien pour les mers)")
        cliquer_apres_pause(p, "#seance-commencer")
    jouer_seance(p, capturer, defauts, "Apprendre Mers", captures={"qcm": "131-mers-apprendre-qcm"}, toucher=toucher_mer)
    bilan = texte(p, "#essai-bilan")
    dire(f"  Mers, Apprendre, bilan : {bilan!r}")
    if "Apprendre · Océans et mers" not in bilan or "océan" not in bilan:
        defauts.append(f"bilan d'Apprendre sous Mers sans titre ou sans les océans : {bilan!r}")
    sans_id("bilan d'Apprendre sous Mers", bilan)
    capturer("132-mers-apprendre-bilan")
    nouvelles = collections.Counter(p.js(FICHES_JOURNAL) or []) - fiches_avant
    hors = [f for f in nouvelles.elements() if not f.startswith("mers:")]
    dire(f"  journal : {sum(nouvelles.values())} événements de mers, {len(hors)} hors mers:")
    if hors or not nouvelles:
        defauts.append(f"journal des parties de mers : {hors[:5]} hors mers: ({sum(nouvelles.values())} événements)")
    cliquer_apres_pause(p, "#seance-carte")
    p.pause(400)

    # La carte de la mémoire « Mers » : ses zones teintées, « n/50 maîtrisées », un océan appris touché (sa mémoire).
    sujets = p.js("[...document.querySelectorAll('#legende-sujet option')].map(o => o.value)")
    if sujets != SUJETS_MEMOIRE:
        defauts.append(f"carte de la mémoire : sujets {sujets} au lieu de Pays, Capitales, Drapeaux, Mers")
    else:
        p.js("(() => { const s = document.getElementById('legende-sujet'); s.value = 'mers'; s.dispatchEvent(new Event('change')); })()")
        fin = time.monotonic() + 8
        while time.monotonic() < fin and not p.js("window.terramemo.carte.teintes()"):
            p.pause(100)
        legende = texte(p, "#legende-memoire")
        dire(f"  carte de la mémoire (Mers) : {p.js('window.terramemo.carte.teintes()')} zones teintées, {legende!r}")
        if not p.js("window.terramemo.carte.teintes()") or not re.search(r"\d+/50 maîtrisées", legende):
            defauts.append(f"carte de la mémoire (Mers) : aucune zone teintée, ou pas de « n/50 maîtrisées » ({legende!r})")
        # La légende dit ce que montre la carte : une mer jamais vue garde l'eau (--mer), pas la terre neutre des pays.
        cases = p.js("""(() => { const c = document.querySelector('#legende-memoire .legende-jamais');
            const fond = (v) => { const e = document.createElement('span'); e.style.background = `var(${v})`; document.body.append(e);
                const r = getComputedStyle(e).backgroundColor; e.remove(); return r; };
            return c && { mer: c.classList.contains('legende-jamais-mer'), fond: getComputedStyle(c).backgroundColor, eau: fond('--mer') }; })()""")
        dire(f"  carte de la mémoire (Mers), « Jamais vu » : {cases}")
        if not cases or not cases["mer"] or cases["fond"] != cases["eau"]:
            defauts.append(f"carte de la mémoire (Mers) : le carré « Jamais vu » n'a pas la couleur de l'eau ({cases})")
        p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
        p.pause(300)
        pt = p.js('window.terramemo.carte.ecran("pacif")')
        if pt:
            p.pause(PAUSE_AVANT_TOUCHER_MS)
            p.toucher(pt["x"], pt["y"])
            p.pause(300)
            barre = texte(p, "#barre-carte")
            dire(f"  carte de la mémoire (Mers), le Pacifique touché : {barre!r}")
            if "océan Pacifique" not in barre or not re.search(r"Vu \d+ fois · (revient|à revoir)", barre):
                defauts.append(f"carte de la mémoire (Mers) : le Pacifique touché sans sa mémoire ({barre!r})")
        # Choix de l'utilisateur du 12/11 : sous « Mers », aucune pastille des micro-États (ni dessinée ni touchable).
        disques = p.js("[+document.querySelector('#carte').dataset.disques, +document.querySelector('#carte').dataset.pastilles]")
        dire(f"  carte de la mémoire (Mers) : {disques[0]} disques, {disques[1]} pastilles")
        if disques != [0, 0]:
            defauts.append(f"carte de la mémoire (Mers) : {disques[0]} disques, {disques[1]} pastilles (aucune attendue)")
        capturer("133-mers-memoire")
        # Le choix gardé sur l'appareil : Pays de nouveau, pour la suite ; le carré « Jamais vu » reprend la terre.
        p.js("(() => { const s = document.getElementById('legende-sujet'); s.value = 'pays'; s.dispatchEvent(new Event('change')); })()")
        p.pause(200)
        if p.js("!!document.querySelector('#legende-memoire .legende-jamais.legende-jamais-mer')"):
            defauts.append("carte de la mémoire (Pays) : le carré « Jamais vu » garde la couleur de l'eau")
        # De retour à Pays : les pastilles reviennent (au zoom 1, les micro-États ont leur disque).
        disques = p.js("+document.querySelector('#carte').dataset.disques")
        dire(f"  carte de la mémoire (Pays) : {disques} disques")
        if not disques:
            defauts.append("carte de la mémoire (Pays) : les pastilles ne reviennent pas (data-disques à 0)")


def ui_epreuves_capitales(p, capturer, defauts, base, parametres=""):
    """Captures 92 à 96 (lot 1 du J2, partie C ; décision « Ouverture des
    épreuves d'un sujet », 12/11) : les épreuves classées des capitales,
    sur une page rechargée. Classé › Capitales (92 : Pays, Capitales,
    Drapeaux, Océans et mers, Communes), ses 7 séries, Océanie et ses deux épreuves (93 :
    Chrono, Sans faute ; plus de Minute),
    un Chrono des capitales d'Océanie joué en entier (94 : « Pays dont la capitale est : »,
    une ville et jamais un Qid ; 95 : le bilan « Chrono · Capitales ·
    Océanie », « 14/14 · 100 % »), le record « 14/14 · 100 % » dans Jouer,
    puis le 🏆 (96) : les épreuves des capitales sous leur sujet. Sans pseudo (invité du pilote) : rien n'est publié. DÉFAUT à
    tout écart."""

    def lire(attr):
        return p.js(f"[...document.querySelectorAll('#jouer-panneau [{attr}]')].map(b => b.getAttribute('{attr}'))")

    def recharger():
        # Vrai rechargement (vers la même adresse, seul le « # » changerait) : sans le ?horloge= de la séance.
        p.goto("about:blank")
        p.goto(base + "?mesures=0" + parametres + "#carte")
        p.attendre_carte()

    def classe():
        p.js('location.hash = "#jouer/classe"')
        attendre_visible(p, "#jouer-panneau")
        p.pause(200)
        return lire("data-sujet")

    recharger()
    sujets = classe()
    dire(f"  Classé : {sujets}")
    if sujets != SUJETS_CLASSE:
        defauts.append(f"Classé : sujets {sujets} au lieu de {NOMS_CLASSE}")
    panneau_jouer(p, defauts, "Classé (Capitales)")
    capturer("92-classe-capitales")
    cliquer(p, '#jouer-panneau [data-sujet="capitales"]')
    series = lire("data-serie")
    if series != SERIES_PAYS:
        defauts.append(f"Classé › Capitales : séries {series} au lieu de celles des pays (D37 c)")
    cliquer(p, '#jouer-panneau [data-serie="Oceania"]')
    modes = lire("data-mode")
    fil = texte(p, "#jouer-panneau .jouer-fil")
    dire(f"  Classé › Capitales › Océanie : {modes}, fil {fil!r}")
    if modes != list(EPREUVES):
        defauts.append(f"Classé › Capitales › Océanie : exercices {modes}")
    if [x.strip() for x in fil.split("›")] != ["Classé", "Capitales", "Océanie"]:
        defauts.append(f"fil d'Ariane {fil!r} au lieu de « Classé › Capitales › Océanie »")
    capturer("93-classe-capitales-oceanie")

    # Le Chrono des capitales d'Océanie, joué en entier (14 pays), chaque toucher sur le pays demandé.
    cliquer(p, '#jouer-panneau [data-mode="chrono"]')
    attendre_visible(p, "#barre-chrono", 20)
    p.pause(300)
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    bilan = '!document.getElementById("chrono-bilan").hidden'
    vus = set()
    for i in range(20):
        if p.js(bilan):
            break
        consigne = texte(p, "#barre-chrono .essai-consigne")
        cible = p.js('document.querySelector("#barre-chrono .essai-consigne").dataset.cible')
        if not consigne.startswith("Pays dont la capitale est") or MOTIF_QID.search(consigne):
            defauts.append(f"Chrono des capitales, {cible} : consigne {consigne!r}")
        vus.add(cible)
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        pt = position_visible(p, cible, "#barre-chrono")
        if not pt:
            defauts.append(f"Chrono des capitales : pas de position pour {cible}")
            break
        p.toucher(pt["x"], pt["y"])
        p.pause(250)
        retro = texte(p, "#barre-chrono .essai-retro")
        if i == 0:
            dire(f"  Chrono des capitales ({cible}) : {consigne!r} → {retro!r}")
            capturer("94-capitales-chrono")
        if not retro.startswith("Juste"):
            defauts.append(f"Chrono des capitales, {cible} touché : rétroaction {retro!r}")
        p.pause(1900)
    fin = time.monotonic() + 5
    while not p.js(bilan) and time.monotonic() < fin:
        p.pause(100)
    lu = p.js('document.getElementById("chrono-bilan").innerText') or ""
    titre = texte(p, "#chrono-bilan h2")
    dire(f"  Chrono des capitales, bilan ({len(vus)} pays) : {titre!r}, {lu[:160]!r}")
    if titre != "Chrono · Capitales · Océanie":
        defauts.append(f"bilan du Chrono des capitales titré {titre!r} (nomEpreuve : « Chrono · Capitales · Océanie »)")
    if len(vus) != 14 or "14/14 · 100 %" not in sans_insecables(lu):
        defauts.append(f"Chrono des capitales d'Océanie : {len(vus)} pays posés, bilan {lu[:120]!r} (« 14/14 · 100 % » attendu)")
    if MOTIF_QID.search(lu):
        defauts.append(f"bilan du Chrono des capitales : un Qid affiché ({lu[:120]!r})")
    capturer("95-capitales-chrono-bilan")
    croix_vers_carte(p, defauts, "bilan du Chrono des capitales", "#chrono-bilan")

    # Le record dans Jouer, puis le 🏆 : les épreuves des capitales sous leur sujet (h4).
    p.js('location.hash = "#jouer/classe/capitales/Oceania"')
    attendre_visible(p, "#jouer-panneau")
    p.pause(200)
    record = p.js("(document.querySelector('#jouer-panneau [data-mode=\"chrono\"] .jouer-record') || {}).innerText || ''")
    if "14/14 · 100 %" not in sans_insecables(record):
        defauts.append(f"Classé › Capitales › Océanie : pas de record « 14/14 · 100 % » du Chrono ({record!r})")
    cliquer(p, "#jouer-fermer")
    p.pause(300)
    cliquer(p, "#classement-btn")
    attendre_visible(p, "#classement-general .essai-serie")
    h4 = p.js("[...document.querySelectorAll('#classement-general .classements-sujet h4')].map(h => h.textContent)")
    ligne = texte(p, '#classement-general .essai-serie[data-epreuve="chrono:capitales:Oceania"]')
    dire(f"  🏆 : sujets {h4[:5]}…, ligne {ligne!r}")
    # Sous le titre de son sujet (h4), la série seule (tableau du 🏆, choix du 12/11) : « Océanie », pas « Capitales · Océanie ».
    if h4[:5] != H4_CLASSEMENTS or ligne.split("\n")[0].strip() != "Océanie" or "Capitales ·" in ligne:
        defauts.append(f"🏆 : sujets {h4}, ligne des capitales d'Océanie {ligne!r}")
    # Sa place (lue en ligne, absente hors ligne) en pourcentage, jamais en points (décision « Barème et classements »).
    if "pts" in ligne or "point" in ligne.lower():
        defauts.append(f"🏆 : ligne des capitales d'Océanie encore en points ({ligne!r})")
    capturer("96-classements-capitales")
    croix_vers_carte(p, defauts, "🏆", "#classement-general")


def ui_epreuves_drapeaux(p, capturer, defauts, base, parametres=""):
    """Captures 111 à 115 (lot 2 du J2, partie C ; décision « Ouverture des
    épreuves d'un sujet », 12/11) : les épreuves classées des drapeaux,
    juste après ui_epreuves_capitales. Sur une page rechargée : Classé ›
    Drapeaux (111 : Pays, Capitales, Drapeaux, Océans et mers, Communes), ses 7 séries,
    Océanie et ses deux épreuves (112 : Chrono, Sans faute ; le « ? » dit
    leurs règles et les exercices visuels, sans Minute), un Chrono des
    drapeaux d'Océanie joué en entier (113 : « Pays de ce drapeau : »
    et le drapeau d[0], alt « Drapeau à reconnaître », jamais le pays avant
    la réponse ; chaque drapeau déjà chargé quand sa question part, à
    partir de la 2e : la partie est préchargée au départ ; 114 : le bilan
    « Chrono · Drapeaux · Océanie », « 14/14 · 100 % »), le record
    « 14/14 · 100 % » sous Classé › Drapeaux › Océanie, puis le 🏆 (115) :
    la ligne « Océanie » sous son sujet « Drapeaux ». Sans pseudo (invité du pilote) :
    rien n'est publié. DÉFAUT à tout écart."""
    _, _, corps = http(base + "geo/noms.fr.json")
    noms = json.loads(corps)
    _, _, corps = http(base + "geo/drapeaux.json")
    montre = {l["pays"]: f"/geo/drapeaux/{l['d'][0]}.svg" for l in json.loads(corps)["pays"]}

    def lire(attr):
        return p.js(f"[...document.querySelectorAll('#jouer-panneau [{attr}]')].map(b => b.getAttribute('{attr}'))")

    def recharger():
        p.goto("about:blank")
        p.goto(base + "?mesures=0" + parametres + "#carte")
        p.attendre_carte()

    recharger()
    p.js('location.hash = "#jouer/classe"')
    attendre_visible(p, "#jouer-panneau")
    p.pause(200)
    sujets = lire("data-sujet")
    dire(f"  Classé (drapeaux) : {sujets}")
    if sujets != SUJETS_CLASSE:
        defauts.append(f"Classé (drapeaux) : sujets {sujets} au lieu de {NOMS_CLASSE}")
    panneau_jouer(p, defauts, "Classé (Drapeaux)")
    capturer("111-classe-drapeaux")
    cliquer(p, '#jouer-panneau [data-sujet="drapeaux"]')
    series = lire("data-serie")
    if series != SERIES_PAYS:
        defauts.append(f"Classé › Drapeaux : séries {series} au lieu de celles des pays")
    cliquer(p, '#jouer-panneau [data-serie="Oceania"]')
    modes = lire("data-mode")
    fil = texte(p, "#jouer-panneau .jouer-fil")
    dire(f"  Classé › Drapeaux › Océanie : {modes}, fil {fil!r}")
    if modes != list(EPREUVES):
        defauts.append(f"Classé › Drapeaux › Océanie : exercices {modes}")
    if [x.strip() for x in fil.split("›")] != ["Classé", "Drapeaux", "Océanie"]:
        defauts.append(f"fil d'Ariane {fil!r} au lieu de « Classé › Drapeaux › Océanie »")
    if p.js("!!document.getElementById('jouer-aide')"):
        cliquer(p, "#jouer-aide")
        aide = texte(p, "#jouer-regles")
        # Les règles des deux épreuves (Sans faute la dernière), sans Minute, retiré le 12/11.
        if "Sans faute" not in aide or "visuel" not in aide or "Minute" in aide:
            defauts.append(f"Classé › Drapeaux › Océanie : le « ? » sans les règles ou les exercices visuels, ou avec Minute ({aide!r})")
    else:
        defauts.append("Classé › Drapeaux › Océanie : pas de « ? »")
    capturer("112-classe-drapeaux-oceanie")

    # Le Chrono des drapeaux d'Océanie, joué en entier (14 pays), chaque toucher sur le pays demandé.
    cliquer(p, '#jouer-panneau [data-mode="chrono"]')
    attendre_visible(p, "#barre-chrono", 20)
    # La partie ne part qu'une fois tous ses drapeaux chargés (décision « Images d'une épreuve ») :
    # la barre peut d'abord dire « Chargement des drapeaux… n / N », sans question posée.
    fin = time.monotonic() + 30
    pret = """(() => { const ch = document.getElementById('chrono-chargement'), c = document.querySelector('#barre-chrono .essai-consigne');
        return (!ch || ch.hidden) && !!c && !!c.dataset.cible && c.offsetParent !== null; })()"""
    while time.monotonic() < fin and not p.js(pret):
        p.pause(100)
    if not p.js(pret):
        defauts.append(f"Chrono des drapeaux : la partie n'a pas commencé en 30 s ({texte(p, '#barre-chrono')!r})")
    p.pause(300)
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    bilan = '!document.getElementById("chrono-bilan").hidden'
    vus = []
    for i in range(20):
        if p.js(bilan):
            break
        e = p.js("""(() => { const c = document.querySelector('#barre-chrono .essai-consigne'), i = c.querySelector('img.drapeau');
            const attrs = [...document.querySelectorAll('#barre-chrono, #barre-chrono *')].flatMap((x) =>
                [...x.attributes].filter((a) => !a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`)).join(' ');
            return { cible: c.dataset.cible, texte: c.innerText.trim(), barre: document.getElementById('barre-chrono').innerText, attrs,
                     img: i && { src: i.getAttribute('src'), alt: i.getAttribute('alt'), title: i.getAttribute('title'), complet: i.complete && i.naturalWidth > 0 } }; })()""")
        cible = e["cible"]
        img = e["img"] or {}
        vus.append(cible)
        if not e["texte"].startswith("Pays de ce drapeau") or not e["img"]:
            defauts.append(f"Chrono des drapeaux, {cible} : consigne {e['texte']!r}, image {e['img']}")
        elif img["alt"] != "Drapeau à reconnaître" or img["title"] is not None or img["src"] != montre.get(cible):
            defauts.append(f"Chrono des drapeaux, {cible} : image {img} (attendu : alt neutre, sans title, le drapeau montré {montre.get(cible)})")
        # Attendue au départ : dès la 1re question, le drapeau est là quand elle est posée.
        if not img.get("complet"):
            defauts.append(f"Chrono des drapeaux, question {i + 1} ({cible}) : drapeau pas encore chargé à sa pose (préchargement ?)")
        t = e["barre"] + " " + e["attrs"]
        if re.search(rf"\b{re.escape(cible or '')}\b", t) or (noms.get(cible) and noms[cible] in t):
            defauts.append(f"Chrono des drapeaux : le pays {cible} nommé avant la réponse ({t!r})")
        # La question part au décodage de son drapeau : l'attendre avant de toucher.
        fin = time.monotonic() + 5
        while time.monotonic() < fin and not p.js("(() => { const i = document.querySelector('#barre-chrono .essai-consigne img'); return !i || (i.complete && i.naturalWidth > 0); })()"):
            p.pause(100)
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        pt = position_visible(p, cible, "#barre-chrono")
        if not pt:
            defauts.append(f"Chrono des drapeaux : pas de position pour {cible}")
            break
        p.toucher(pt["x"], pt["y"])
        p.pause(250)
        retro = texte(p, "#barre-chrono .essai-retro")
        if i == 0:
            dire(f"  Chrono des drapeaux ({cible}) : {e['texte']!r}, {img.get('src')} → {retro!r}")
            capturer("113-drapeaux-chrono")
        if not retro.startswith("Juste") or noms.get(cible, cible) not in retro:
            defauts.append(f"Chrono des drapeaux, {cible} touché : rétroaction {retro!r} (« Juste … · {noms.get(cible)} » attendu)")
        p.pause(1900)
    dire(f"  Chrono des drapeaux : préchargés {len(set(ressources_drapeaux(p)) - {base.rstrip('/') + '/geo/drapeaux.json'})} fichiers /geo/drapeaux/ vus par la page")
    fin = time.monotonic() + 5
    while not p.js(bilan) and time.monotonic() < fin:
        p.pause(100)
    lu = p.js('document.getElementById("chrono-bilan").innerText') or ""
    titre = texte(p, "#chrono-bilan h2")
    dire(f"  Chrono des drapeaux, bilan ({len(set(vus))} pays) : {titre!r}, {lu[:160]!r}")
    if titre != "Chrono · Drapeaux · Océanie":
        defauts.append(f"bilan du Chrono des drapeaux titré {titre!r} (nomEpreuve : « Chrono · Drapeaux · Océanie »)")
    if len(set(vus)) != 14 or "14/14 · 100 %" not in sans_insecables(lu):
        defauts.append(f"Chrono des drapeaux d'Océanie : {len(set(vus))} pays posés, bilan {lu[:120]!r} (« 14/14 · 100 % » attendu)")
    if not p.js("!!document.querySelector('#chrono-bilan .chrono-classement[data-epreuve=\"chrono:drapeaux:Oceania\"]')"):
        defauts.append("bilan du Chrono des drapeaux : pas de classement de chrono:drapeaux:Oceania")
    capturer("114-drapeaux-chrono-bilan")
    croix_vers_carte(p, defauts, "bilan du Chrono des drapeaux", "#chrono-bilan")

    # Le record dans Jouer, puis le 🏆 : les épreuves des drapeaux sous leur sujet (h4).
    p.js('location.hash = "#jouer/classe/drapeaux/Oceania"')
    attendre_visible(p, "#jouer-panneau")
    p.pause(200)
    record = p.js("(document.querySelector('#jouer-panneau [data-mode=\"chrono\"] .jouer-record') || {}).innerText || ''")
    if "14/14 · 100 %" not in sans_insecables(record):
        defauts.append(f"Classé › Drapeaux › Océanie : pas de record « 14/14 · 100 % » du Chrono ({record!r})")
    cliquer(p, "#jouer-fermer")
    p.pause(300)
    cliquer(p, "#classement-btn")
    attendre_visible(p, "#classement-general .essai-serie")
    h4 = p.js("[...document.querySelectorAll('#classement-general .classements-sujet h4')].map(h => h.textContent)")
    ligne = texte(p, '#classement-general .essai-serie[data-epreuve="chrono:drapeaux:Oceania"]')
    dire(f"  🏆 : sujets {h4[:5]}…, ligne {ligne!r}")
    if h4[:5] != H4_CLASSEMENTS or ligne.split("\n")[0].strip() != "Océanie" or "Drapeaux ·" in ligne:
        defauts.append(f"🏆 : sujets {h4}, ligne des drapeaux d'Océanie {ligne!r}")
    if "pts" in ligne or "point" in ligne.lower():
        defauts.append(f"🏆 : ligne des drapeaux d'Océanie encore en points ({ligne!r})")
    capturer("115-classements-drapeaux")
    croix_vers_carte(p, defauts, "🏆", "#classement-general")


def ui_epreuves_mers(p, capturer, defauts, base, parametres=""):
    """Captures 134 à 138 (lot 3b du J2, partie B, #27 ; décisions « Ouverture
    des épreuves d'un sujet », « Océans et mers ») : les épreuves classées
    des mers, après celles des drapeaux. Sur une page rechargée : Classé
    (134 : Pays, Capitales, Drapeaux, Océans et mers, Communes), Classé ›
    Océans et mers, sa série unique sautée (D44 a), ses deux épreuves (135 :
    Chrono, Sans faute ; le « ? » dit leurs règles, sans Minute ni exercices
    visuels) ; un Sans faute des mers joué jusqu'à sa fin : la couche marine
    chargée avant le départ (aucune question posée avant), « Touche : » et
    un nom (jamais l'id), la vue jamais cadrée par l'appli sur la mer
    demandée (seul le pilote zoome pour toucher), quelques justes dont une
    partie si elle vient (136 : « Juste : mer des Caraïbes, dans
    l'Atlantique »), puis la mer Noire touchée pour une autre mer : fausse,
    nommée, la partie finie ; le bilan (137) « Sans faute · Océans et mers »,
    « n d'affilée sur 50 », le raté par les noms, le classement de
    sansfaute:mers:mers ; le record sous Classé › Océans et mers ; le 🏆
    (138) : la ligne « Océans et mers » sous son sujet. Aucune pastille
    pendant ses questions, rendues au bilan (décision du 16/11 :
    verifier_pastilles). Sans pseudo (invité du pilote) : rien n'est publié.
    DÉFAUT à tout écart."""
    _, _, corps = http(base + "geo/mers.fr.json")
    noms = json.loads(corps)["noms"]
    ids = set(noms)
    # Les zones qui ont des parties, et l'une d'elles (Note.admis, « dans … ») : celles de ui_mers.
    PARTIES = {"atlant": "caraibes", "pacif": "japon", "indien": "arabie", "arctique": "kara", "medit": "adriat",
               "noire": "azov", "baltique": "botnie", "barents": "blanche", "chinemer": "thailand"}
    # La mer Noire touchée pour finir : jamais pour elle, ni pour ce qui la contient ou qu'elle contient (sa partie, l'Azov),
    # ni pour l'Égée, sa voisine, qu'un halo de 12 px (petite mer) pourrait dire juste.
    PAS_NOIRE = ("noire", "azov", "medit", "atlant", "egee")
    JUSTES_AVANT_FIN = 4

    def lire(attr):
        return p.js(f"[...document.querySelectorAll('#jouer-panneau [{attr}]')].map(b => b.getAttribute('{attr}'))")

    def sans_id(quoi, t):
        vus = sorted(i for i in ids if re.search(rf"(?<![\w']){re.escape(i)}(?![\w'])", t or ""))
        if vus:
            defauts.append(f"{quoi} : un id brut affiché ({vus} dans {t!r})")

    def transfo():
        return p.js("(() => { const t = window.terramemo.carte.transfo(); return [Math.round(t.k * 1000), Math.round(t.x), Math.round(t.y), Math.round((t.r || 0) * 1000)]; })()")

    p.goto("about:blank")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    p.js('location.hash = "#jouer/classe"')
    attendre_visible(p, "#jouer-panneau")
    p.pause(200)
    sujets = lire("data-sujet")
    dire(f"  Classé (mers) : {sujets}")
    if sujets != SUJETS_CLASSE:
        defauts.append(f"Classé (mers) : sujets {sujets} au lieu de {NOMS_CLASSE}")
    tuile = texte(p, '#jouer-panneau [data-sujet="mers"]')
    if "50 océans et mers" not in tuile:
        defauts.append(f"Classé : tuile Océans et mers {tuile!r} (« 50 océans et mers » attendu)")
    panneau_jouer(p, defauts, "Classé (Océans et mers)")
    capturer("134-classe-mers")
    cliquer(p, '#jouer-panneau [data-sujet="mers"]')
    p.pause(200)
    modes = lire("data-mode")
    fil = texte(p, "#jouer-panneau .jouer-fil")
    hash_ = p.js("decodeURIComponent(location.hash)")
    dire(f"  Classé › Océans et mers : {hash_}, {modes}, fil {fil!r}")
    if hash_ != "#jouer/classe/mers/mers" or niveau_jouer(p) != "exercices":
        defauts.append(f"Classé › Océans et mers : {hash_}, niveau {niveau_jouer(p)} (la série unique sautée attendue)")
    if modes != list(EPREUVES):
        defauts.append(f"Classé › Océans et mers : exercices {modes} (Chrono, Sans faute attendus)")
    if [x.strip() for x in fil.split("›")] != ["Classé", "Océans et mers", "Océans et mers"]:
        defauts.append(f"fil d'Ariane {fil!r} au lieu de « Classé › Océans et mers › Océans et mers »")
    if p.js("!!document.getElementById('jouer-aide')"):
        cliquer(p, "#jouer-aide")
        aide = texte(p, "#jouer-regles")
        if "Sans faute" not in aide or "Minute" in aide or "visuel" in aide:
            defauts.append(f"Classé › Océans et mers : le « ? » sans les règles, ou avec Minute ou les exercices visuels ({aide!r})")
    else:
        defauts.append("Classé › Océans et mers : pas de « ? »")
    # Une fiche mers: au journal (ui_mers a fait Apprendre « Océans » sur ce profil) : la séance charge et pose la couche
    # en fond dès l'ouverture de la page (seances.completer, comme les capitales et les drapeaux) ; sinon rien de mers*.
    if ressources_mers(p) and not any(f.startswith("mers:") for f in (p.js(FICHES_JOURNAL) or [])):
        defauts.append(f"mers* chargé avant le choix d'une épreuve : {ressources_mers(p)}")
    elif ressources_mers(p):
        dire("  mers* déjà lu à l'ouverture : une grappe de mers est entamée sur ce profil (la séance la charge en fond)")
    capturer("135-classe-mers-exercices")

    # Le Sans faute des mers : la couche marine lue et posée avant le départ (avecSujet), puis la partie.
    cliquer(p, '#jouer-panneau [data-mode="sansfaute"]')
    attendre_visible(p, "#barre-chrono", 30)
    if "mers.topo.json" not in ressources_mers(p):
        defauts.append(f"Sans faute des mers parti sans la couche fine ({ressources_mers(p)})")
    p.pause(300)
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    attendre_fin_vol(p)
    bilan = '!document.getElementById("chrono-bilan").hidden'
    vus, justes, partie, faux = [], 0, False, None
    apres_toucher = transfo()
    for i in range(52):
        if p.js(bilan):
            break
        cible = p.js('document.querySelector("#barre-chrono .essai-consigne").dataset.cible')
        consigne = texte(p, "#barre-chrono .essai-consigne")
        sans_id("Sans faute des mers", texte(p, "#barre-chrono"))
        verifier_pastilles(p, defauts, f"Sans faute des mers ({cible})", True)
        if consigne != f"Touche : {noms.get(cible)}":
            defauts.append(f"Sans faute des mers, {cible} : consigne {consigne!r}")
        # L'appli ne cadre jamais la vue sur la mer demandée (ce serait donner la réponse) : la vue de la question
        # posée est celle laissée par le dernier toucher du pilote.
        if transfo() != apres_toucher:
            defauts.append(f"Sans faute des mers, {cible} : la vue a bougé à la pose de la question ({apres_toucher} → {transfo()})")
        vus.append(cible)
        if justes >= JUSTES_AVANT_FIN and cible not in PAS_NOIRE:
            # La fin : la mer Noire touchée pour une autre mer, fausse et nommée ; la partie s'arrête. La carte cadrée sur
            # elle par le pilote : une petite mer voisine n'y a plus son halo de 12 px.
            p.js('window.terramemo.carte.zoomerSur("noire")')
            attendre_fin_vol(p)
            toucher_mer(p, "noire", "#barre-chrono")
            p.pause(250)
            retro = texte(p, "#barre-chrono .essai-retro")
            dire(f"  Sans faute des mers, {cible}, la mer Noire touchée : {retro!r}")
            if not retro.startswith("Faux : mer Noire, à "):
                defauts.append(f"Sans faute des mers, {noms.get(cible)}, la mer Noire touchée : {retro!r} (« Faux : mer Noire, à … du bord » attendu)")
            faux = cible
            break
        z = PARTIES.get(cible) if not partie else None
        toucher_mer(p, z or cible, "#barre-chrono")
        apres_toucher = transfo()
        p.pause(250)
        retro = texte(p, "#barre-chrono .essai-retro")
        if z:
            dire(f"  Sans faute des mers, {cible}, {z} touchée : {retro!r}")
            if not re.match(rf"Juste : {re.escape(noms[z])}, dans ", retro):
                defauts.append(f"Sans faute des mers, {noms.get(cible)}, {noms[z]} touchée : {retro!r} (« Juste : {noms[z]}, dans … » attendu)")
            capturer("136-mers-sansfaute-partie")
            partie = True
        elif i == 0:
            dire(f"  Sans faute des mers ({cible}) : {consigne!r} → {retro!r}")
            capturer("136-mers-sansfaute-partie")
        if not retro.startswith("Juste"):
            defauts.append(f"Sans faute des mers, {cible} touchée : rétroaction {retro!r}")
            break
        justes += 1
        p.pause(1100)
    fin = time.monotonic() + 6
    while not p.js(bilan) and time.monotonic() < fin:
        p.pause(100)
    lu = p.js('document.getElementById("chrono-bilan").innerText') or ""
    titre = texte(p, "#chrono-bilan h2")
    dire(f"  Sans faute des mers, bilan ({justes} justes, {len(vus)} posées, partie {partie}) : {titre!r}, {lu[:200]!r}")
    if not p.js(bilan):
        defauts.append(f"Sans faute des mers : pas de bilan après la mer Noire touchée ({faux})")
    if titre != "Sans faute · Océans et mers":
        defauts.append(f"bilan du Sans faute des mers titré {titre!r} (nomEpreuve : « Sans faute · Océans et mers »)")
    if f"{justes} d'affilée sur 50" not in sans_insecables(lu):
        defauts.append(f"bilan du Sans faute des mers sans « {justes} d'affilée sur 50 » ({lu[:160]!r})")
    if faux and f"{noms.get(faux)} → mer Noire" not in lu:
        defauts.append(f"bilan du Sans faute des mers : le raté {noms.get(faux)} → mer Noire absent ({lu[:200]!r})")
    if not p.js("!!document.querySelector('#chrono-bilan .chrono-classement[data-epreuve=\"sansfaute:mers:mers\"]')"):
        defauts.append("bilan du Sans faute des mers : pas de classement de sansfaute:mers:mers")
    sans_id("bilan du Sans faute des mers", lu)
    verifier_pastilles(p, defauts, "bilan du Sans faute des mers", False)
    capturer("137-mers-sansfaute-bilan")
    croix_vers_carte(p, defauts, "bilan du Sans faute des mers", "#chrono-bilan")

    # Le record dans Jouer, puis le 🏆 : les épreuves des mers sous leur sujet (h4), la ligne au nom de la série.
    p.js('location.hash = "#jouer/classe/mers/mers"')
    attendre_visible(p, "#jouer-panneau")
    p.pause(200)
    record = p.js("(document.querySelector('#jouer-panneau [data-mode=\"sansfaute\"] .jouer-record') || {}).innerText || ''")
    if f"{justes}/50" not in sans_insecables(record):
        defauts.append(f"Classé › Océans et mers : pas de record « {justes}/50 » du Sans faute ({record!r})")
    cliquer(p, "#jouer-fermer")
    p.pause(300)
    cliquer(p, "#classement-btn")
    attendre_visible(p, "#classement-general .essai-serie")
    h4 = p.js("[...document.querySelectorAll('#classement-general .classements-sujet h4')].map(h => h.textContent)")
    ligne = texte(p, '#classement-general .essai-serie[data-epreuve="sansfaute:mers:mers"]')
    chrono = texte(p, '#classement-general .essai-serie[data-epreuve="chrono:mers:mers"]')
    dire(f"  🏆 : sujets {h4[:5]}…, ligne {ligne!r}")
    if h4[:5] != H4_CLASSEMENTS or ligne.split("\n")[0].strip() != "Océans et mers" or "Océans et mers ·" in ligne or not chrono:
        defauts.append(f"🏆 : sujets {h4}, lignes des mers {ligne!r} / {chrono!r} (« Océans et mers » sous son sujet attendu)")
    if "pts" in ligne or "point" in ligne.lower():
        defauts.append(f"🏆 : ligne des mers encore en points ({ligne!r})")
    capturer("138-classements-mers")
    croix_vers_carte(p, defauts, "🏆", "#classement-general")


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
    # Les noms des communes (et les capitales) arrivent à la première frappe
    # d'un profil neuf : la ligne attendue, pas une pause fixe.
    attendre_visible(p, '#recherche-liste [data-terrain="reunion"][data-id="97411"]')
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


# --- Lignes de repère (#11, décision « Lignes de repère » du 14/11) ---------

# Les lignes de ?lignes=tout : 6 nommées, 12 méridiens et 5 parallèles de la grille, sans redoubler 0° (src/map/lignes.ts).
LIGNES_TOUT = 6 + 12 + 5 - 2
ETAT_LIGNES = """(() => {
  const h = document.querySelector('header').getBoundingClientRect();
  const c = document.getElementById('carte');
  const couche = c && c.querySelector('.lignes-noms');
  const noms = couche && !couche.hidden ? [...couche.querySelectorAll('.ligne-nom')].map((s) => {
    const r = s.getBoundingClientRect();
    return {id: s.dataset.ligne, texte: s.textContent, x: r.left, y: r.top, d: r.right, b: r.bottom};
  }) : [];
  const rc = c.getBoundingClientRect();
  // Ce qui est posé sur la carte et se voit (noms-lignes.ts, DESSUS) : aucun nom dessous.
  const dessus = [...document.querySelectorAll('#app > .carte-barre, #app > .legende-memoire, #app > .zoom-carte')].map((e) => {
    const r = e.getBoundingClientRect();
    return {id: e.id || e.className, x: r.left, y: r.top, d: r.right, b: r.bottom, l: r.width};
  }).filter((r) => r.l > 0);
  return {lignes: window.terramemo.carte.lignes(), dataset: c.dataset.lignes || null, noms, entete: h.bottom, dessus,
          carte: {x: rc.left, y: rc.top, d: rc.right, b: rc.bottom},
          ile: window.terramemo.ile ? window.terramemo.ile.lignes() : null,
          cases: [...document.querySelectorAll('#reglage-lignes input[data-ligne]')].map((e) => e.dataset.ligne + ':' + (e.checked ? 1 : 0))};
})()"""


def etat_lignes(p):
    return p.js(ETAT_LIGNES)


def verifier_noms(defauts, quoi, e):
    """Les noms posés : dans la carte, sous l'en-tête, hors des barres, de la
    légende et des boutons de zoom, sans se chevaucher."""
    for n in e["noms"]:
        if n["y"] < e["entete"] - 0.5 or n["x"] < e["carte"]["x"] - 0.5 or n["d"] > e["carte"]["d"] + 0.5 or n["b"] > e["carte"]["b"] + 0.5:
            defauts.append(f"{quoi} : le nom {n['texte']!r} sort de la carte ou passe sur l'en-tête ({n})")
        for o in e.get("dessus", []):
            if n["x"] < o["d"] and o["x"] < n["d"] and n["y"] < o["b"] and o["y"] < n["b"]:
                defauts.append(f"{quoi} : le nom {n['texte']!r} est posé sous {o['id']!r}")
    for i, a in enumerate(e["noms"]):
        for b in e["noms"][i + 1:]:
            if a["x"] < b["d"] and b["x"] < a["d"] and a["y"] < b["b"] and b["y"] < a["b"]:
                defauts.append(f"{quoi} : les noms {a['texte']!r} et {b['texte']!r} se chevauchent")


def ui_lignes(p, capturer, defauts, base, parametres=""):
    """Captures 50 à 55 (#11) : les lignes de repère, aucune par défaut ; deux
    cases cochées dans ⚙ (l'équateur et les tropiques : trois lignes,
    nommées) puis relues après rechargement (terramemo.lignes) ; toutes par
    ?lignes=tout à l'accueil, zoomées et tournées ; pendant une partie
    (Trouver, Europe : toujours là, un toucher juste reste juste) ; sur l'île
    de La Réunion, aucune. DÉFAUT si une ligne manque ou reste, si un nom
    sort de la carte, passe sur l'en-tête, sous une barre (ou la légende, les
    boutons de zoom) ou en chevauche un autre, si le
    choix n'est pas gardé, ou si le toucher change. Retire le choix gardé à
    la fin."""
    p.js("localStorage.removeItem('terramemo.lignes')")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    # La vue entière : dans le passage complet, la carte garde la vue du passage
    # d'avant (l'Ukraine zoomée), où ni l'équateur ni les tropiques ne passent.
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0, r: 0})")
    p.pause(300)
    e = etat_lignes(p)
    dire(f"  lignes, par défaut : {e['lignes']} posées, cases {e['cases']}")
    if e["lignes"] or e["noms"] or any(c.endswith(":1") for c in e["cases"]):
        defauts.append(f"lignes de repère par défaut : {e['lignes']} posées, cases {e['cases']} (toutes décochées attendues)")
    if len(e["cases"]) != 5:
        defauts.append(f"⚙ : {len(e['cases'])} cases de lignes au lieu de 5 ({e['cases']})")
    cliquer(p, "#settings-btn")
    cliquer(p, "#reglage-ligne-equateur")
    cliquer(p, "#reglage-ligne-tropiques")
    capturer("50-lignes-reglages")
    p.js('document.getElementById("settings-btn").click()')
    p.pause(400)
    e = etat_lignes(p)
    textes = [n["texte"] for n in e["noms"]]
    dire(f"  ⚙ équateur + tropiques : {e['lignes']} lignes, noms {textes}")
    # Au zoom 1 d'un téléphone, un nom de tropique peut manquer : les pastilles
    # (Caraïbes, Égypte, Bangladesh) prennent toute sa bande, et un nom ne couvre
    # jamais une pastille ; il revient au premier zoom. Sur un écran large, tous.
    attendus = {"Équateur", "Tropique du Cancer", "Tropique du Capricorne"}
    large = p.js("innerWidth") >= 600
    if e["lignes"] != 3 or not (attendus <= set(textes) if large else ("Équateur" in textes and len(set(textes) & attendus) >= 2)):
        defauts.append(f"équateur et tropiques cochés : {e['lignes']} lignes, noms {textes} ({'les trois noms' if large else 'l’équateur et un tropique nommés au moins'} attendus)")
    verifier_noms(defauts, "accueil, équateur et tropiques", e)
    capturer("51-lignes-accueil")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    garde = p.js("localStorage.getItem('terramemo.lignes')")
    e = etat_lignes(p)
    dire(f"  rechargée : terramemo.lignes = {garde!r}, {e['lignes']} lignes, cases {e['cases']}")
    if garde != "equateur,tropiques" or e["lignes"] != 3:
        defauts.append(f"choix des lignes non gardé : {garde!r}, {e['lignes']} lignes après rechargement")
    # ?lignes=tout : pour la page seule (le choix gardé reste).
    p.goto(base + "?mesures=0&lignes=tout" + parametres + "#carte")
    p.attendre_carte()
    p.pause(300)
    e = etat_lignes(p)
    dire(f"  ?lignes=tout : {e['lignes']} lignes, {len(e['noms'])} noms : {[n['texte'] for n in e['noms']]}")
    if e["lignes"] != LIGNES_TOUT or len(e["noms"]) < 6:
        defauts.append(f"?lignes=tout : {e['lignes']} lignes au lieu de {LIGNES_TOUT}, {len(e['noms'])} noms")
    if p.js("localStorage.getItem('terramemo.lignes')") != "equateur,tropiques":
        defauts.append("?lignes=tout a changé le choix gardé")
    verifier_noms(defauts, "?lignes=tout, zoom 1", e)
    capturer("52-lignes-tout")
    # Une case changée dans ⚙ sous ?lignes= : la page suit, le choix gardé reste.
    cliquer(p, "#settings-btn")
    cliquer(p, "#reglage-ligne-grille")
    sans_grille = etat_lignes(p)["lignes"]
    cliquer(p, "#reglage-ligne-grille")
    p.js('document.getElementById("settings-btn").click()')
    p.pause(300)
    garde = p.js("localStorage.getItem('terramemo.lignes')")
    dire(f"  ?lignes=tout, grille décochée puis recochée : {sans_grille} lignes sans elle, terramemo.lignes = {garde!r}")
    if sans_grille >= LIGNES_TOUT or garde != "equateur,tropiques":
        defauts.append(f"?lignes=tout et une case de ⚙ : {sans_grille} lignes sans la grille, choix gardé {garde!r} (\"equateur,tropiques\" attendu)")
    # Zoomée sur l'Indonésie, vers 120° E, que canvas et webgl tournent au centre
    # (en SVG, la carte plane ne tourne pas) : un zoomer({k: 3, x: 0, y: 0})
    # cadrait en SVG le coin haut gauche, vide, de la carte plane.
    p.js("window.terramemo.carte.zoomerSur('IDN')")
    p.pause(1500)
    e = etat_lignes(p)
    dire(f"  zoomée sur l'Indonésie (≈ 120° E) : {len(e['noms'])} noms : {[n['texte'] for n in e['noms']]}")
    verifier_noms(defauts, "?lignes=tout, zoomée sur l'Indonésie", e)
    if not e["noms"]:
        defauts.append("zoomée sur l'Indonésie : aucun nom de ligne")
    capturer("53-lignes-tournee")
    # Une partie : les lignes restent, le toucher et la notation sont ceux d'avant.
    jouer_partie(p, "localiser", "Europe")
    p.pause(300)
    cible = p.js('document.querySelector("#barre-essai .essai-consigne").dataset.cible')
    p.js(f"window.terramemo.carte.zoomerSur({json.dumps(cible)})")
    p.pause(400)
    e = etat_lignes(p)
    dire(f"  Trouver, Europe : {e['lignes']} lignes, {len(e['noms'])} noms, cible {cible}")
    if e["lignes"] != LIGNES_TOUT:
        defauts.append(f"pendant une partie : {e['lignes']} lignes au lieu de {LIGNES_TOUT}")
    verifier_noms(defauts, "Trouver, Europe", e)
    pt = position_visible(p, cible, "#barre-essai") or position(p, cible)
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    p.toucher(pt["x"], pt["y"])
    p.pause(300)
    retro = texte(p, "#barre-essai .essai-retro")
    dire(f"  Trouver, {cible} touché : {retro!r}")
    if p.js(f"window.terramemo.carte.pick({pt['x']}, {pt['y']})?.id") != cible:
        defauts.append(f"pendant une partie, avec les lignes : pick sur {cible} ne donne pas {cible}")
    capturer("54-lignes-partie")
    cliquer(p, "#essai-terminer")
    p.pause(200)
    # L'île : aucune ligne ne la croise, rien n'y est dessiné.
    jouer_partie(p, "localiser", "reunion")
    p.pause(300)
    e = etat_lignes(p)
    noms_ile = p.js("(() => { const c = document.querySelector('#carte-ile .lignes-noms'); return c ? c.querySelectorAll('.ligne-nom').length : 0; })()")
    dire(f"  île : {e['ile']} lignes, {noms_ile} noms")
    if e["ile"] or noms_ile:
        defauts.append(f"île de La Réunion : {e['ile']} lignes, {noms_ile} noms (aucune ne la croise)")
    capturer("55-lignes-ile")
    cliquer(p, "#essai-terminer")
    p.pause(200)
    p.js("localStorage.removeItem('terramemo.lignes')")


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


def ressources_quiz(p):
    """Les données du quiz seul chargées par la page (FICHIERS_GEO_QUIZ)."""
    return p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => /\\/geo\\/(notoriete|drapeaux-proches)\\.json/.test(n))")


# Les difficultés du quiz dans Jouer, dans l'ordre (src/quiz/types.ts, DIFFICULTES).
DIFFICULTES_QUIZ = ["facile", "moyen", "difficile", "expert"]


def ui_quiz(p, capturer, defauts, base, parametres=""):
    """Captures 16-quiz-* (lot 4b du J2, #26 ; étude § 7.1, § 9.3 ; décisions
    « Quiz général », « Écran Jouer », « Images d'une épreuve ») : sur une
    page rechargée, rien du quiz au premier affichage ni à l'ouverture de
    Jouer ; #jouer : trois tuiles, Quiz général en tête (data-racine), puis
    Entraînement et Classé (16-quiz-racine) ; Quiz général : #jouer/quiz, ses
    quatre difficultés, le fil « Quiz général », les règles derrière « ? »
    (16-quiz-difficultes) ; Facile : ses données chargées au choix (la
    notoriété, une fois), puis 20 questions à 4 choix jouées par le pilote,
    la troisième fausse (16-quiz-question, 16-quiz-faux) ; le bilan « 19/20 ·
    95 % », « Quiz général · Facile », le premier record, le détail par
    sujet, le raté (16-quiz-bilan) ; « Rejouer » : un nouveau tirage, puis
    « Abandonner » dès sa première question, qui compte (D55 a : bilan,
    « Partie abandonnée à la question 1 », record à battre ; 16-quiz-abandon) ;
    « Autre difficulté » : #jouer/quiz, le record « 19/20 · 95 % » sur Facile
    (16-quiz-record) ; le retour arrière : la racine de Jouer ; « × » : la
    carte ; une partie laissée en cours (deux justes, la page rechargée) :
    l'avis « … a compté : 2/20 · 10 % » à l'accueil (16-quiz-interrompue).
    Question par question, des mers et d'autres sujets : aucune pastille
    pendant une mer, des pastilles sinon, et aux deux bilans (décision du
    16/11 : verifier_pastilles). Sans pseudo (invité du pilote) : rien
    n'est publié. DÉFAUT à tout écart."""
    def lire(attr):
        return p.js(f"[...document.querySelectorAll('#jouer-panneau [{attr}]')].map(b => b.getAttribute('{attr}'))")

    def ou():
        return [p.js("decodeURIComponent(location.hash)"), p.js("document.body.dataset.vue"), niveau_jouer(p)]

    barre = "#barre-quiz"
    cible = f'document.querySelector("{barre} .essai-consigne").dataset.cible'
    ouverte = f'(() => {{ const b = document.querySelector("{barre}"); const c = b && b.querySelector(".nommer-choix"); return !!b && !b.hidden && !!c && !c.disabled; }})()'
    bilan_vu = '!document.getElementById("quiz-bilan").hidden'

    def attendre(expression, quoi, delai_s=20):
        fin = time.monotonic() + delai_s
        while not p.js(expression):
            if time.monotonic() > fin:
                raise RuntimeError(f"quiz : {quoi} pas venu en {delai_s} s")
            p.pause(100)

    def choisir(juste):
        """Le bouton juste de la question ouverte, ou un autre ; rend la cible."""
        c = p.js(cible)
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        ok = p.js(f"""(() => {{
          const bs = [...document.querySelectorAll('{barre} .nommer-choix')];
          const b = bs.find(x => {'x.dataset.id === ' + json.dumps(c) if juste else 'x.dataset.id && x.dataset.id !== ' + json.dumps(c)});
          if (!b) return false; b.click(); return true; }})()""")
        if not ok:
            raise RuntimeError(f"quiz : pas de bouton {'juste' if juste else 'faux'} pour {c}")
        return c

    p.goto("about:blank")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    if ressources_quiz(p):
        defauts.append(f"quiz : ses données au premier affichage ({ressources_quiz(p)})")
    # La racine de Jouer : Quiz général en tête, pleine largeur, puis les deux branches.
    p.js('location.hash = "#jouer"')
    attendre_visible(p, "#jouer-panneau")
    p.pause(300)
    racine, branches = lire("data-racine"), lire("data-branche")
    tuile = texte(p, '#jouer-panneau [data-racine="quiz"]')
    dire(f"  Jouer : {racine} {branches}, tuile {tuile!r}")
    if racine != ["quiz"] or branches != ["entrainement", "classe"] or "Quiz général" not in tuile:
        defauts.append(f"Jouer : {racine} {branches} (Quiz général, Entraînement, Classé attendus), tuile {tuile!r}")
    if not p.js("document.querySelector('#jouer-panneau [data-racine=\"quiz\"]').classList.contains('jouer-large')"):
        defauts.append("Jouer : la tuile du quiz n'est pas pleine largeur (jouer-large)")
    if ressources_quiz(p):
        defauts.append(f"quiz : ses données à l'ouverture de Jouer ({ressources_quiz(p)})")
    panneau_jouer(p, defauts, "Jouer (trois tuiles)")
    capturer("16-quiz-racine")
    # Ses difficultés : #jouer/quiz, quatre lignes, le fil, « ? ».
    cliquer(p, '#jouer-panneau [data-racine="quiz"]')
    p.pause(300)
    difficultes = lire("data-difficulte")
    fil = texte(p, "#jouer-panneau .jouer-fil")
    dire(f"  Quiz général : {ou()}, {difficultes}, fil {fil!r}")
    if ou() != ["#jouer/quiz", "jouer", "quiz"] or difficultes != DIFFICULTES_QUIZ or fil.strip() != "Quiz général":
        defauts.append(f"Quiz général : {ou()}, {difficultes}, fil {fil!r}")
    cliquer(p, "#jouer-aide")
    regles = texte(p, "#jouer-regles")
    if not visible(p, "#jouer-regles") or "hors du général" not in regles:
        defauts.append(f"« ? » du quiz : règles {regles!r}")
    panneau_jouer(p, defauts, "Quiz général")
    capturer("16-quiz-difficultes")
    # Facile : ses données chargées au choix, puis la première question (QCM, 20 sur 20 au facile).
    cliquer(p, '#jouer-panneau [data-difficulte="facile"]')
    attendre(ouverte, "la première question", 30)
    lus = ressources_quiz(p)
    if len(lus) != 2:
        defauts.append(f"quiz : données lues au choix de Facile {lus} (notoriete.json et drapeaux-proches.json, une fois)")
    compte = texte(p, f"{barre} .essai-compte")
    if not compte.startswith("1 / 20"):
        defauts.append(f"quiz : compte {compte!r} au lieu de « 1 / 20 »")
    capturer("16-quiz-question")
    sujets_vus = collections.Counter()
    for i in range(20):
        attendre(ouverte, f"la question {i + 1}")
        # Question par question : sans les pastilles pour une mer, avec pour un autre sujet (décision du 16/11).
        id_q = p.js(cible)
        sujets_vus["mer" if id_q in ids_mers() else "autre"] += 1
        verifier_pastilles(p, defauts, f"quiz, question {i + 1} ({id_q})", id_q in ids_mers())
        if visible(p, f"{barre} .nommer-grille") is False:
            defauts.append(f"quiz facile : question {i + 1} sans grille (20 QCM sur 20 au facile)")
        choisir(i != 2)
        p.pause(300)
        if i == 2:
            retro = texte(p, f"{barre} .essai-retro")
            dire(f"  quiz, faux : {retro!r}")
            if not retro.startswith("Faux"):
                defauts.append(f"quiz : rétroaction d'un faux {retro!r}")
            capturer("16-quiz-faux")
        if i < 19:
            p.pause(1600)
    attendre(bilan_vu, "le bilan", 10)
    lu = sans_insecables(texte(p, "#quiz-bilan"))
    titre = texte(p, "#quiz-bilan h2")
    dire(f"  quiz, bilan : {lu[:200]!r} ; questions {dict(sujets_vus)}")
    if not sujets_vus["mer"] or not sujets_vus["autre"]:
        defauts.append(f"quiz facile : questions {dict(sujets_vus)} (des mers et d'autres sujets attendus, à parts égales)")
    verifier_pastilles(p, defauts, "bilan du quiz", False)
    m = MOTIF_PART.search(lu)
    if titre != "Quiz général · Facile" or not m or (int(m[1]), int(m[2])) != (19, 20) or not part_juste(m) or "Premier record pour cette difficulté." not in lu or "Temps total" not in lu:
        defauts.append(f"bilan du quiz : {titre!r}, {lu[:200]!r} (« 19/20 · 95 % », « Temps total », le premier record attendus)")
    if p.js("document.querySelectorAll('#quiz-bilan .essai-rates li').length") != 1:
        defauts.append("bilan du quiz : pas un raté et un seul")
    if p.js("location.hash") != "#quiz":
        defauts.append(f"bilan du quiz à l'adresse {p.js('location.hash')}")
    capturer("16-quiz-bilan")
    # « Rejouer » : un nouveau tirage ; « Abandonner » dès la première question : elle compte (D55 a).
    cliquer(p, "#quiz-rejouer")
    attendre(ouverte, "la première question rejouée")
    cliquer(p, "#quiz-abandonner")
    attendre(bilan_vu, "le bilan après l'abandon", 5)
    verifier_pastilles(p, defauts, "bilan du quiz abandonné", False)
    lu = sans_insecables(texte(p, "#quiz-bilan"))
    dire(f"  quiz, abandon : {lu[:200]!r}")
    if "Partie abandonnée à la question 1" not in lu or "0/20 · 0 %" not in lu or "Record à battre : 19/20 · 95 %" not in lu:
        defauts.append(f"abandon du quiz (D55 a) : {lu[:200]!r} (« 0/20 · 0 % », l'abandon dit, le record à battre attendus)")
    capturer("16-quiz-abandon")
    # « Autre difficulté » : les difficultés, le record sur Facile.
    cliquer(p, "#quiz-autre")
    p.pause(500)
    record = sans_insecables(texte(p, '#jouer-panneau [data-difficulte="facile"] .jouer-record'))
    dire(f"  « Autre difficulté » : {ou()}, record {record!r}")
    if ou() != ["#jouer/quiz", "jouer", "quiz"] or "19/20 · 95 %" not in record:
        defauts.append(f"« Autre difficulté » : {ou()}, record de Facile {record!r}")
    if p.js("document.querySelector('#jouer-panneau [data-difficulte=\"facile\"]').getAttribute('aria-current')") != "true":
        defauts.append("« Autre difficulté » : Facile, la dernière partie, n'est pas marquée")
    capturer("16-quiz-record")
    # Le retour arrière remonte à la racine de Jouer (la partie n'a pas laissé d'entrée de plus).
    p.js("history.back()")
    p.pause(500)
    if ou() != ["#jouer", "jouer", "racine"]:
        defauts.append(f"retour arrière depuis les difficultés : {ou()} au lieu de la racine de Jouer")
    cliquer(p, "#jouer-fermer")
    p.pause(400)
    if p.js("document.body.dataset.vue") != "carte":
        defauts.append(f"« × » de Jouer après le quiz : vue {p.js('document.body.dataset.vue')}")
    # Une partie laissée en cours (D55 a) : deux justes, puis la page rechargée en pleine partie ;
    # au démarrage, elle compte (record inchangé : 19/20 le bat) et l'accueil le dit sous « Touche un pays ».
    p.js('location.hash = "#jouer/quiz"')
    attendre_visible(p, "#jouer-panneau")
    cliquer(p, '#jouer-panneau [data-difficulte="facile"]')
    for i in range(2):
        attendre(ouverte, f"la question {i + 1} de la partie interrompue")
        choisir(True)
        p.pause(300 if i else 1900)
    # Un vrai rechargement : vers la même adresse, seul le # changerait (la vue quittée, qui finit la partie).
    p.goto("about:blank")
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    p.pause(300)
    avis = sans_insecables(texte(p, "#barre-carte .barre-detail"))
    reste = p.js("localStorage.getItem('terramemo.quiz.en_cours')")
    dire(f"  partie interrompue, au démarrage : {avis!r}")
    if avis != "La partie du quiz laissée en cours (Facile) a compté : 2/20 · 10 %." or reste is not None:
        defauts.append(f"partie du quiz interrompue : avis {avis!r} (« … (Facile) a compté : 2/20 · 10 %. » attendu), en cours {reste!r}")
    capturer("16-quiz-interrompue")


# --- Fiche d'un lieu (#34, lot F1) ---------------------------------------------

def ressources_fiches(p):
    """Ce que la fiche d'un lieu charge (étude fiche-lieu § 6.1) : /geo/fiches-*, les drapeaux des territoires (lot F3 :
    /geo/drapeaux-territoires*), /photos/, le morceau de la fiche (assets/fiche-*.js)."""
    return p.js("performance.getEntriesByType('resource').map(r => r.name).filter(n => /\\/geo\\/fiches-|\\/geo\\/drapeaux-territoires|\\/photos\\/|\\/fiche(-[\\w-]+)?\\.(js|ts)/.test(n)).map(n => n.split('?')[0])")


# L'état de la fiche vu de la page : ouverte, son lieu et son titre, l'entrée d'historique, le focus,
# la barre (lieu, chevron, ligne de faits, inerte), les boutons de zoom, le voile.
JS_ETAT_FICHE = """(() => {
  const f = document.getElementById('fiche-lieu'), b = document.getElementById('barre-carte'),
        z = document.getElementById('zoom-carte'), v = document.getElementById('fiche-voile');
  const ouverte = !!f && !f.hidden;
  return { ouverte, id: ouverte ? f.dataset.id : null, titre: ouverte ? (document.getElementById('fiche-titre') || {}).textContent : null,
    etat: history.state && history.state.fiche ? history.state.fiche : null, hash: location.hash, focus: document.activeElement ? document.activeElement.id : null,
    barre: b ? b.dataset.id || null : null, barre_cachee: !b || b.hidden, inerte: !!b && b.hasAttribute('inert'),
    chevron: !!b && !b.querySelector('.barre-chevron').hidden, faits: b ? b.querySelector('.barre-faits').textContent : '',
    statut: ouverte ? ((f.querySelector('.fiche-statut') || {}).textContent || '') : '',
    lignes: ouverte ? [...f.querySelectorAll('.fiche-fait')].map(x => x.innerText.replace(/\\s+/g, ' ').trim()) : [],
    voisins: ouverte ? [...f.querySelectorAll('.fiche-voisin')].map(x => x.dataset.id) : [],
    drapeaux: ouverte ? f.querySelectorAll('.fiche-drapeaux img').length : 0,
    avant: ouverte && !f.querySelector('.fiche-avant').hidden,
    zoom: z ? getComputedStyle(z).display : null, voile: !!v && !v.hidden, fiche_body: document.body.dataset.fiche || null,
    reglages: !document.getElementById('settings-popup').hidden };
})()"""


def etat_fiche(p):
    return p.js(JS_ETAT_FICHE)


def attendre_fiche(p, condition, quoi, delai_s=8):
    """Attend que l'état de la fiche vérifie `condition` ; rend l'état (le dernier lu si le délai passe, avec un DÉFAUT à la charge de l'appelant)."""
    fin = time.monotonic() + delai_s
    e = etat_fiche(p)
    while not condition(e) and time.monotonic() < fin:
        p.pause(100)
        e = etat_fiche(p)
    if not condition(e):
        dire(f"  {quoi} : pas atteint en {delai_s} s ({e})")
    return e


def toucher_element(p, selecteur):
    """Un toucher (ou un clic hors tactile) au centre de l'élément, après la pause de règle. La position est
    lue après la pause : lue avant, elle pouvait dater d'une animation en cours (la fiche qui monte), et le
    doigt tombait à côté (le voisin France de l'Espagne, sur l'A37, le 16/11)."""
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    r = p.js(f"(() => {{ const e = document.querySelector({json.dumps(selecteur)}); if (!e) return null; const r = e.getBoundingClientRect(); return {{x: r.x + r.width / 2, y: r.y + r.height / 2}}; }})()")
    if not r:
        raise RuntimeError(f"rien à toucher : {selecteur}")
    p.toucher(r["x"], r["y"])


def glisser(p, x, y0, y1, pas=6):
    """Un doigt qui glisse verticalement de y0 à y1 (tactile seulement), en `pas` images de 16 ms."""
    p.geste([[(x, y0 + (y1 - y0) * k / pas)] for k in range(pas + 1)], 16)


def toucher_lieu_accueil(p, ident):
    """Le lieu `ident` cadré (zoomerSur), puis touché là où pick() le désigne, au-dessus de la barre."""
    p.js(f'window.terramemo.carte.zoomerSur("{ident}")')
    attendre_fin_vol(p)
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    pt = position_visible(p, ident, "#barre-carte")
    if not pt:
        raise RuntimeError(f"accueil : {ident} pas à l'écran")
    p.toucher(pt["x"], pt["y"])


def ouvrir_fiche(p, ident, defauts, quoi):
    """Touche `ident` sur l'accueil, attend le chevron, touche la barre ; rend l'état de la fiche ouverte."""
    toucher_lieu_accueil(p, ident)
    e = attendre_fiche(p, lambda e: e["barre"] == ident and e["chevron"], f"{quoi} : chevron de {ident}")
    if not e["chevron"]:
        defauts.append(f"{quoi} : {ident} touché, pas de chevron ({e})")
        return e
    toucher_element(p, "#barre-fiche")
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == ident, f"{quoi} : fiche de {ident}")
    if not e["ouverte"]:
        defauts.append(f"{quoi} : la barre touchée n'ouvre pas la fiche de {ident} ({e})")
    else:
        attendre_feuille_posee(p)
    return e


def attendre_feuille_posee(p):
    """Attend la fin de l'animation d'ouverture de la fiche : « ouverte » est vrai dès qu'elle commence, la feuille
    encore sous l'écran. Depuis que son morceau part avec les données au premier toucher (lot F6), la fiche s'ouvre
    sans attendre : le voile mesuré alors tombait sous l'écran (y 1203 sur 832), et son toucher était perdu."""
    p.js("""(async () => { const f = document.getElementById('fiche-lieu');
      for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r));
      if (f) await Promise.all(f.getAnimations({subtree: true}).map(a => a.finished.catch(() => null))); return true; })()""")


# La carte de situation en tête de la fiche (#34, lot F8, D61 b ; src/vues/situation.ts) : sa place, son état
# (data-etat « attente » puis « prete »), sa région, son anneau, sa taille, et ce qu'elle chevauche dans la tête :
# « × », « ‹ » (« ‹ Bilan » compris), chaque drapeau, les lignes du titre et du statut (un bloc passe sous un
# flottant, ses lignes non : on mesure les lignes, par un Range). `haut_vide` : la hauteur de la tête sans la carte
# (son SVG retiré du rendu le temps d'une lecture, sans image entre les deux), pour juger le saut de la tête quel que
# soit l'état lu en premier (une carte gardée, ou déjà posée à la première lecture, n'est jamais vue « attente »).
JS_SITUATION = """(() => { const f = document.getElementById('fiche-lieu'); if (!f || f.hidden) return null;
  const t = f.querySelector('.fiche-tete'), s = t ? t.querySelector(':scope > .fiche-situation') : null;
  if (!s) return { present: false };
  const boite = (q) => ({ g: q.left, d: q.right, h: q.top, b: q.bottom });
  const r = (e) => { if (!e || e.closest('[hidden]')) return []; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 ? [boite(q)] : []; };
  const lignes = (e) => { if (!e) return []; const g = document.createRange(); g.selectNodeContents(e); return [...g.getClientRects()].filter(q => q.width > 0).map(boite); };
  const sur = (a, b) => a.d > b.g + 0.5 && a.g < b.d - 0.5 && a.b > b.h + 0.5 && a.h < b.b - 0.5;
  const rs = s.getBoundingClientRect(), x = boite(rs), rt = t.getBoundingClientRect(), rf = f.getBoundingClientRect();
  const autres = { croix: r(t.querySelector(':scope > .croix')), avant: r(t.querySelector(':scope > .fiche-avant')),
    drapeaux: [...t.querySelectorAll('.fiche-drapeaux .drapeau')].flatMap(r), titre: lignes(document.getElementById('fiche-titre')),
    statut: lignes(t.querySelector('.fiche-statut')) };
  const svg = s.querySelector('svg'), h2 = document.getElementById('fiche-titre');
  let haut_vide = rt.height;
  if (svg) { const avant = svg.style.display; svg.style.display = 'none'; haut_vide = t.getBoundingClientRect().height; svg.style.display = avant; }
  return { present: true, haut_vide, eclaire: s.dataset.eclaire ?? null, etat: s.dataset.etat || null, region: s.dataset.region || null, anneau: s.dataset.anneau !== undefined,
    lieu: s.dataset.lieu || null, aria: s.getAttribute('aria-hidden'), chemins: svg ? [...svg.children].map(c => c.getAttribute('class')) : [],
    l: rs.width, h: rs.height, haut_tete: rt.height, largeur: innerWidth, page: document.documentElement.scrollWidth - innerWidth,
    dans_tete: rs.top >= rt.top - 0.5 && rs.bottom <= rt.bottom + 0.5 && rs.left >= rt.left - 0.5 && rs.right <= rt.right + 0.5,
    dans_fiche: rs.left >= rf.left - 0.5 && rs.right <= rf.right + 0.5,
    chevauche: Object.entries(autres).filter(([, l]) => l.some(q => sur(x, q))).map(([k]) => k),
    tete_deborde: t.scrollWidth > t.clientWidth + 1, titre_deborde: !!h2 && h2.scrollWidth > h2.clientWidth + 1 }; })()"""


def verifier_situation(p, defauts, quoi, region=None, anneau=None, delai_s=10):
    """La carte de situation de la fiche ouverte (lot F8) : présente dans la tête dès l'ouverture, puis posée (son état
    attendu, `delai_s` au plus, jamais une durée fixe : en ligne, le réseau et l'appareil sont plus lents) ; de 96 × 64
    (téléphone) ou 120 × 80 (au-delà de 700 px) ; dans la tête et dans la feuille, sans rien chevaucher (« × », « ‹ »,
    drapeaux, titre, statut), sans débordement de la tête, du titre ni de la page ; décorative (aria-hidden) ; le lieu
    éclairé (ou l'eau d'une mer), et c'est bien lui (data-eclaire) ; sa région et son anneau s'ils sont donnés ; la tête
    de même hauteur vide et posée (elle ne saute pas : la hauteur vide lue à la première lecture « attente », sinon
    mesurée la carte retirée du rendu, haut_vide). Rend l'état lu ; DÉFAUT à chaque écart."""
    s = p.js(JS_SITUATION)
    vide = s["haut_tete"] if s and s.get("present") and s.get("etat") == "attente" else None
    fin = time.monotonic() + delai_s
    while s and s.get("present") and s.get("etat") != "prete" and time.monotonic() < fin:
        p.pause(100)
        s = p.js(JS_SITUATION)
    if not s or not s.get("present"):
        defauts.append(f"{quoi} : pas de carte de situation dans la tête ({s})")
        return s
    dire(f"  carte de situation ({quoi}) : {s['etat']}, région {s['region']}, anneau {s['anneau']}, {s['l']:.0f} × {s['h']:.0f} px, "
         f"chemins {s['chemins']}, chevauche {s['chevauche'] or 'rien'}, tête {s['haut_tete']:.0f} px"
         + (f" (vide : {vide:.0f} px)" if vide is not None else ""))
    attendu = (96, 64) if s["largeur"] <= 700 else (120, 80)
    if s["etat"] != "prete" or not s["chemins"]:
        defauts.append(f"{quoi} : carte de situation pas posée en {delai_s} s ({s['etat']})")
    elif not ({"situation-lieu", "situation-eau"} & set(s["chemins"]) or (s["anneau"] and "situation-anneau" in s["chemins"])):
        defauts.append(f"{quoi} : carte de situation sans lieu éclairé ni anneau ({s['chemins']})")
    elif s["lieu"] not in (s.get("eclaire") or "").split():
        defauts.append(f"{quoi} : carte de situation qui éclaire {s.get('eclaire')!r} au lieu de {s['lieu']}")
    if abs(s["l"] - attendu[0]) > 0.5 or abs(s["h"] - attendu[1]) > 0.5:
        defauts.append(f"{quoi} : carte de situation de {s['l']:.1f} × {s['h']:.1f} px au lieu de {attendu[0]} × {attendu[1]}")
    if not s["dans_tete"] or not s["dans_fiche"] or s["chevauche"] or s["tete_deborde"] or s["titre_deborde"] or s["page"] > 0:
        defauts.append(f"{quoi} : carte de situation dans la tête {s['dans_tete']}, dans la feuille {s['dans_fiche']}, chevauche {s['chevauche']}, "
                       f"tête qui déborde {s['tete_deborde']}, titre qui déborde {s['titre_deborde']}, page {s['page']} px")
    if s["aria"] != "true":
        defauts.append(f"{quoi} : carte de situation lue par le lecteur d'écran (aria-hidden {s['aria']!r})")
    if region is not None and s["region"] != region:
        defauts.append(f"{quoi} : carte de situation sur {s['region']} au lieu de {region}")
    if anneau is not None and s["anneau"] != anneau:
        defauts.append(f"{quoi} : carte de situation {'sans' if anneau else 'avec'} anneau, {'avec' if anneau else 'sans'} attendu")
    if vide is None and s["etat"] == "prete":
        vide = s["haut_vide"]
    if vide is not None and abs(s["haut_tete"] - vide) > 0.5:
        defauts.append(f"{quoi} : la tête saute à l'arrivée de la carte de situation ({vide:.1f} → {s['haut_tete']:.1f} px)")
    return s


# Les images d'une page, mesurées par requestAnimationFrame pendant un scénario : les écarts entre deux images,
# et chaque image longue (≥ 25 ms) datée, pour la rattacher au geste qui la précède (marquer_scenario).
JS_IMAGES_DEBUT = """(() => { window.__fiche_images = []; window.__fiche_longues = []; window.__fiche_marques = [];
  window.__fiche_mesure = true; let t0 = performance.now(); window.__fiche_t0 = t0; window.__fiche_loaf = [];
  // Les Long Animation Frames (Chromium 123 et plus) : ce qui a tenu le fil principal pendant une image longue.
  try { if (window.__fiche_loaf_obs) window.__fiche_loaf_obs.disconnect();
    window.__fiche_loaf_obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__fiche_loaf.push({ t: e.startTime, d: e.duration,
      b: e.blockingDuration || 0, rendu: e.renderStart ? Math.round(e.startTime + e.duration - e.renderStart) : 0,
      scripts: (e.scripts || []).map(x => ({ qui: x.invoker || x.invokerType || '', src: (x.sourceURL || '').split('/').pop() + (x.sourceFunctionName ? ':' + x.sourceFunctionName : ''),
        d: Math.round(x.duration) })) }); });
    window.__fiche_loaf_obs.observe({ type: 'long-animation-frame' }); } catch (e) { window.__fiche_loaf = null; }
  const f = (t) => { const d = t - t0; window.__fiche_images.push(d); if (d >= 25) window.__fiche_longues.push([t, d]); t0 = t;
    if (window.__fiche_mesure) requestAnimationFrame(f); };
  requestAnimationFrame(f); return true; })()"""
JS_IMAGES_FIN = """(() => { window.__fiche_mesure = false; const d = (window.__fiche_images || []).slice(1);
  const duree = d.reduce((a, b) => a + b, 0);
  if (window.__fiche_loaf_obs) { window.__fiche_loaf_obs.disconnect(); window.__fiche_loaf_obs = null; }
  // Les tranches de la carte de situation (src/vues/situation.ts : performance.measure « situation:… »).
  const situation = performance.getEntriesByType('measure').filter(m => m.name.startsWith('situation:') && m.startTime >= (window.__fiche_t0 || 0))
    .map(m => [m.startTime, Math.round(m.duration * 10) / 10, m.name.slice(10)]);
  return { images: d.length, duree_ms: Math.round(duree), acoups: d.filter(x => x >= 25).length, gels: d.filter(x => x >= 46).length,
           max_ms: Math.round(Math.max(0, ...d) * 10) / 10, longues: window.__fiche_longues || [], marques: window.__fiche_marques || [],
           loaf: window.__fiche_loaf, situation }; })()"""


def marquer_scenario(p, nom):
    """Date un geste du scénario (horloge de la page), pour situer les images longues."""
    p.js(f"(window.__fiche_marques || []).push([performance.now(), {json.dumps(nom)}])")


def cause_image(m, t, d):
    """La cause d'une image longue finie à `t` (horloge de la page), de `d` ms : (texte, due à la carte de situation).
    D'abord les tranches de la carte de situation qui la recouvrent (performance.measure « situation:… », lot F8), puis
    les Long Animation Frames : le script le plus long (son appelant, son fichier et sa fonction), ou le rendu seul."""
    debut = t - d
    situ = [x for x in m.get("situation") or [] if x[0] < t and x[0] + x[1] > debut]
    if situ:
        return "carte de situation (" + ", ".join(f"{nom} {duree:.0f} ms" for _, duree, nom in situ) + ")", True
    loaf = m.get("loaf")
    if loaf is None:
        return "inconnue (pas de Long Animation Frames dans ce navigateur)", False
    recouvre = [x for x in loaf if x["t"] < t and x["t"] + x["d"] > debut]
    scripts = sorted((s for x in recouvre for s in x["scripts"]), key=lambda s: -s["d"])
    if scripts:
        return "script : " + ", ".join(f"{s['qui']} {s['src']} {s['d']} ms" for s in scripts[:2]), False
    if recouvre:
        return f"rendu (aucun script ; rendu {max(x['rendu'] for x in recouvre)} ms, blocage {max(x['b'] for x in recouvre):.0f} ms)", False
    return "inconnue (aucune Long Animation Frame : hors du fil principal, ou le compositeur)", False


def situer_images(m):
    """Chaque image longue de JS_IMAGES_FIN, avec le geste qui la précède : [(durée ms, « geste +N ms »)]."""
    sorties = []
    for t, d in m["longues"]:
        avant = [x for x in m["marques"] if x[0] <= t - d]
        quand = f"{avant[-1][1]} +{round(t - d - avant[-1][0])} ms" if avant else "avant le premier geste"
        sorties.append((round(d, 1), quand))
    return sorties


# Les voisins du scénario de mesure, depuis l'Espagne : de vrais vols sous la fiche (S55, D61), du court
# (la France) au plus long (la Guyane fait du Brésil un voisin de la France), puis l'Argentine. Le premier
# voisin de chaque liste faisait Espagne → Andorre → Espagne → Andorre : la carte bougeait à peine. Lot F8 :
# dix voisins (§ 8), chacun nouveau, et trois régions de la carte de situation (l'Europe, l'Amérique du Sud,
# l'Amérique du Nord avec le Panamá) : un fond à tracer, puis des lieux sur un fond gardé.
CHEMIN_VOISINS = ("FRA", "BRA", "ARG", "CHL", "BOL", "PER", "COL", "PAN", "CRI", "NIC")


def scenario_fiches(p, defauts, n=10, voisins=10, verdict=False):
    """Le scénario de mesure de l'étude (§ 6.4, S41 et S55) : ouvrir et fermer `n` fiches (la barre touchée,
    puis « × »), puis passer par `voisins` voisins depuis la fiche de l'Espagne (CHEMIN_VOISINS), les images de la page
    mesurées par requestAnimationFrame (critère de saccade : à-coup ≥ 25 ms, gel ≥ 46 ms). Le toucher
    est celui de DevTools : la médiane du toucher se juge à part (touchers_reels.py, critère du toucher).
    Indicatif sur le PC (chromium sans écran) : le verdict est celui de l'A37 (`verdict`, cibles chrome et
    webview : un DÉFAUT par gel, et au-delà de 3 à-coups par seconde). Chaque gel est situé par le geste qui le
    précède, et sa cause dite (cause_image : la carte de situation, un script, le rendu) ; un gel dû à la carte de
    situation est un DÉFAUT même sur le PC (lot F8 : aucun gel de 50 ms qu'elle cause)."""
    toucher_lieu_accueil(p, "ESP")
    attendre_fiche(p, lambda e: e["chevron"], "scénario : chevron de l'Espagne")
    p.js(JS_IMAGES_DEBUT)
    for i in range(n):
        marquer_scenario(p, f"barre touchée ({i + 1})")
        toucher_element(p, "#barre-fiche")
        attendre_fiche(p, lambda e: e["ouverte"], "scénario : fiche ouverte")
        marquer_scenario(p, f"fiche ouverte ({i + 1})")
        p.pause(300)
        marquer_scenario(p, f"« × » touchée ({i + 1})")
        toucher_element(p, "#fiche-lieu .croix")
        attendre_fiche(p, lambda e: not e["ouverte"], "scénario : fiche fermée")
        marquer_scenario(p, f"fiche fermée ({i + 1})")
        p.pause(200)
    marquer_scenario(p, "barre touchée (Espagne)")
    toucher_element(p, "#barre-fiche")
    e = attendre_fiche(p, lambda e: e["ouverte"], "scénario : fiche de l'Espagne")
    marquer_scenario(p, "fiche ouverte (Espagne)")
    for suivant in CHEMIN_VOISINS[:voisins]:
        if suivant not in e["voisins"]:
            defauts.append(f"scénario : {suivant} pas parmi les voisins de la fiche {e['id']} ({e['voisins']})")
            break
        marquer_scenario(p, f"voisin {suivant} touché")
        toucher_element(p, f'#fiche-lieu .fiche-voisin[data-id="{suivant}"]')
        e = attendre_fiche(p, lambda x, s=suivant: x["ouverte"] and x["id"] == s, f"scénario : voisin {suivant}")
        marquer_scenario(p, f"fiche {e['id']} ouverte")
        p.pause(2200)  # le vol de la carte sous la fiche (S55), 2 s au plus
    marquer_scenario(p, "« × » touchée (fin)")
    toucher_element(p, "#fiche-lieu .croix")
    attendre_fiche(p, lambda e: not e["ouverte"], "scénario : fiche fermée")
    m = p.js(JS_IMAGES_FIN)
    par_s = m["acoups"] / (m["duree_ms"] / 1000) if m["duree_ms"] else 0
    dire(f"  scénario « {n} fiches, {voisins} voisins » : {m['images']} images en {m['duree_ms']} ms, {m['acoups']} à-coups "
         f"({par_s:.2f}/s), {m['gels']} gels, plus long {m['max_ms']} ms" + ("" if verdict else " (indicatif hors de l'A37)"))
    gels = [(round(d, 1), quand, *cause_image(m, t, d)) for (t, d), (_, quand) in zip(m["longues"], situer_images(m)) if d >= 46]
    dus = [g for g in gels if g[3]]
    dire(f"  gels ≥ 46 ms : {len(gels)}, dont {len(dus)} dus à la carte de situation"
         + ("" if m.get("loaf") is not None else " (Long Animation Frames absentes : causes hors de la carte inconnues)"))
    for d, quand, cause, situation in gels:
        dire(f"    gel de {d} ms : {quand} ; cause : {cause}")
        if verdict:
            defauts.append(f"scénario : gel de {d} ms ({quand} ; {cause}), critère de saccade : aucun gel de 46 ms ou plus")
        elif situation:
            defauts.append(f"scénario : gel de {d} ms dû à la carte de situation ({quand} ; {cause}), lot F8 : aucun")
    tranches = m.get("situation") or []
    if tranches:
        longue = max(tranches, key=lambda x: x[1])
        dire(f"  carte de situation : {len(tranches)} tranches, {sum(x[1] for x in tranches):.0f} ms en tout, "
             f"la plus longue {longue[1]:.1f} ms ({longue[2]})")
    else:
        dire("  carte de situation : aucune tranche mesurée (rien à calculer, ou User Timing absent)")
    if verdict and par_s > 3:
        defauts.append(f"scénario : {par_s:.2f} à-coups par seconde, critère de saccade : 3 au plus")
    return m


# Les erreurs touchables d'un bilan (#34, lot F6, commun.ts : ligneFiche) : chaque bouton, sa hauteur, sa place dans
# le bilan, ce qui déborde, son chevron, son nom ; et la page sans défilement horizontal.
JS_LIGNES_BILAN = """((sel) => { const b = document.querySelector(sel); if (!b || b.hidden) return null; const r = b.getBoundingClientRect();
  const lignes = [...b.querySelectorAll('.essai-rates .ligne-fiche')].map(x => { const q = x.getBoundingClientRect(),
      t = x.querySelector('.ligne-fiche-texte'), c = x.querySelector('.ligne-fiche-chevron'), cr = c ? c.getBoundingClientRect() : null;
    return { id: x.dataset.id, label: x.getAttribute('aria-label'), texte: t ? t.textContent : '', haut: q.height, gauche: q.left, droite: q.right,
      deborde: x.scrollWidth > x.clientWidth + 1 || (!!t && t.scrollWidth > t.clientWidth + 1),
      chevron: !!cr && cr.width > 0 && getComputedStyle(c).visibility !== 'hidden' && cr.right <= q.right + 0.5 && cr.left >= q.left + q.width / 2 }; });
  return { lignes, gauche: r.left, droite: r.right, page: document.documentElement.scrollWidth - innerWidth }; })"""
JS_APRES_RETOUR_BILAN = """((id) => { const f = document.getElementById('fiche-lieu'), b = document.getElementById(id), a = document.activeElement;
  return { hash: location.hash, bilan: !!b && !b.hidden, fiche: !!f && !f.hidden, terrain: window.terramemo.terrain(),
    focus: a && a.classList && a.classList.contains('ligne-fiche') ? a.dataset.id : (a ? a.tagName + '#' + a.id : null) }; })"""
JS_AVANT_FICHE = "(() => { const a = document.querySelector('#fiche-lieu .fiche-avant'); return a && !a.hidden ? a.getAttribute('aria-label') : null; })()"


def verifier_lignes_bilan(p, defauts, quoi, sel="#essai-bilan"):
    """Les erreurs du bilan `sel` : des boutons de 44 px au moins, dans le bilan, sans débordement, chevron à droite,
    nommés « Fiche : {nom}. {texte} » ; la page sans défilement horizontal. Rend les lignes."""
    m = p.js(f"{JS_LIGNES_BILAN}({json.dumps(sel)})")
    if not m:
        defauts.append(f"{quoi} : bilan {sel} pas affiché")
        return []
    dire(f"  {quoi} : {len(m['lignes'])} erreur(s) touchable(s) : "
         + "; ".join(f"{l['id']} {l['haut']:.0f} px{' DÉBORDE' if l['deborde'] else ''}{'' if l['chevron'] else ' sans chevron'} {l['label']!r}" for l in m["lignes"]))
    if not m["lignes"]:
        defauts.append(f"{quoi} : aucune erreur touchable au bilan")
    for l in m["lignes"]:
        if l["haut"] < 43.5:
            defauts.append(f"{quoi} : la ligne de {l['id']} fait {l['haut']:.1f} px de haut (44 au moins)")
        if l["deborde"] or l["gauche"] < m["gauche"] - 0.5 or l["droite"] > m["droite"] + 0.5:
            defauts.append(f"{quoi} : la ligne de {l['id']} déborde ({l['gauche']:.0f}–{l['droite']:.0f} dans {m['gauche']:.0f}–{m['droite']:.0f})")
        if not l["chevron"]:
            defauts.append(f"{quoi} : la ligne de {l['id']} sans chevron visible à droite")
        if not (l["label"] or "").startswith("Fiche : ") or l["texte"] not in (l["label"] or ""):
            defauts.append(f"{quoi} : la ligne de {l['id']} nommée {l['label']!r} (« Fiche : nom. texte » attendu)")
    if m["page"] > 0:
        defauts.append(f"{quoi} : la page défile en largeur ({m['page']} px)")
    return m["lignes"]


def attendre_bilan(p, delai_s=6, bilan="essai-bilan"):
    """Le bilan d'id `bilan` affiché (« ‹ Retour au bilan », Échap, le retour du navigateur), puis les deux images
    du focus rendu à la ligne ; rend JS_APRES_RETOUR_BILAN."""
    fin = time.monotonic() + delai_s
    while not visible(p, f"#{bilan}") and time.monotonic() < fin:
        p.pause(100)
    p.pause(300)
    return p.js(f"{JS_APRES_RETOUR_BILAN}({json.dumps(bilan)})")


def echap(p):
    """La touche Échap, au clavier (CDP)."""
    p.cdp("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    p.cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)


def fiche_depuis_autre_bilan(p, capturer, defauts, quoi, bilan, adresse, capture, par_echap):
    """Une erreur du bilan `bilan` (Chrono, quiz : leur propre ligne, leur propre activer) : le bouton de 44 px, sans
    débordement, chevron à droite (verifier_lignes_bilan, capture `capture`) ; touchée, la fiche de son lieu, « ‹ »
    nommé « Retour au bilan » ; puis le retour au bilan par « ‹ », ou par Échap (`par_echap`) : `adresse`, le bilan
    visible, la fiche fermée, le focus à la ligne touchée. DÉFAUT à chaque écart."""
    lignes = verifier_lignes_bilan(p, defauts, quoi, f"#{bilan}")
    capturer(capture)
    if not lignes:
        return
    cible = lignes[0]["id"]
    toucher_element(p, f'#{bilan} .ligne-fiche[data-id="{cible}"]')
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == cible, f"{quoi} : fiche de {cible}")
    attendre_fin_vol(p)
    libelle = p.js(JS_AVANT_FICHE)
    dire(f"  {quoi} : fiche {e['titre']!r}, {e['hash']}, barre {e['barre']}, focus {e['focus']}, ‹ {libelle!r}")
    if e["hash"] != "#carte" or e["barre"] != cible or e["focus"] != "fiche-titre" or libelle != "Retour au bilan":
        defauts.append(f"{quoi} : erreur touchée, la carte, {cible} dans la barre, sa fiche, focus au titre, « Retour au bilan » attendus ({e}, ‹ {libelle!r})")
    capturer(capture + "-fiche")
    if par_echap:
        echap(p)
    else:
        toucher_element(p, "#fiche-lieu .fiche-avant")
    r = attendre_bilan(p, bilan=bilan)
    dire(f"  {quoi} : {'Échap' if par_echap else '« ‹ Retour au bilan »'} : {r}")
    if r["hash"] != adresse or not r["bilan"] or r["fiche"] or r["focus"] != cible:
        defauts.append(f"{quoi} : {'Échap' if par_echap else '« ‹ Retour au bilan »'} : le bilan ({adresse}), la fiche fermée, le focus à la ligne de {cible} attendus ({r})")


# Les 24 communes de La Réunion, par code INSEE (97401 à 97424).
COMMUNES_REUNION = [f"974{n:02d}" for n in range(1, 25)]


def ui_fiche_bilan(p, capturer, defauts):
    """Captures 162 à 167 (#34, lot F6 ; étude fiche-lieu § 4.6, § 4.4 et § 8) : une partie de Trouver
    (Amérique du Sud) jouée avec une erreur (un faux toucher, puis « Passer »), « Terminer » ; au bilan, l'erreur
    est un bouton de 44 px au moins, sans débordement, chevron à droite (capture 162) ; touchée, la carte et la
    fiche du lieu juste, « ‹ » nommé « Retour au bilan », le focus au titre (163) ; un voisin (164), « ‹ », puis
    « ‹ Retour au bilan » : le bilan (#toucher), la fiche fermée, le focus à la ligne touchée (165) ; « × » laisse
    la carte, le lieu dans la barre, et le retour du navigateur rend le bilan. Puis l'île : une commune ratée
    (166), sa fiche sur l'île (167), « ‹ Retour au bilan » : le bilan, l'île gardée. Enfin les bilans qui ont leur
    propre ligne et leur propre activer() : Sans faute (une erreur, 168), sa fiche, Échap rend le bilan (#chrono),
    le focus à la ligne ; le quiz Facile abandonné à la première question (169), sa fiche, « ‹ » rend le bilan
    (#quiz). DÉFAUT à chaque écart."""
    consigne = 'document.querySelector("#barre-essai .essai-consigne").dataset.cible'

    def partie_avec_erreur(serie, faux_de):
        jouer_partie(p, "localiser", serie)
        cible = p.js(consigne)
        faux = faux_de(cible)
        if serie == "reunion":
            # La partie cadre l'île sur la commune demandée : une commune fixe peut être hors de l'écran (Saint-Denis
            # à y −43 quand Le Tampon est demandé, pilote du lot F6). Le faux toucher prend la première commune
            # visible, autre que la cible, dès que l'île est posée (8 s au plus).
            attendre_fin_vol(p, "ile")
            fin = time.monotonic() + 8
            faux = None
            while not faux and time.monotonic() < fin:
                faux = next((c for c in COMMUNES_REUNION if c != cible and position_visible(p, c)), None)
                if not faux:
                    p.pause(200)
            if not faux:
                raise RuntimeError(f"île : aucune commune touchable autre que {cible}")
        toucher_pays(p, faux)
        p.pause(300)
        cliquer_apres_pause(p, "#essai-passer")
        cliquer_apres_pause(p, "#essai-terminer")
        attendre_visible(p, "#essai-bilan")
        return cible

    # Le monde : Trouver, la première question touchée faux puis passée.
    cible = partie_avec_erreur("South America", lambda c: "BRA" if c == "ARG" else "ARG")
    lignes = verifier_lignes_bilan(p, defauts, "bilan de Trouver")
    if [l["id"] for l in lignes] != [cible]:
        defauts.append(f"bilan de Trouver : l'erreur sur {cible} seule attendue, touchable ({[l['id'] for l in lignes]})")
    capturer("162-bilan-lignes")
    toucher_element(p, f'#essai-bilan .ligne-fiche[data-id="{cible}"]')
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == cible, f"fiche de {cible} depuis le bilan")
    attendre_fin_vol(p)
    libelle = p.js(JS_AVANT_FICHE)
    dire(f"  depuis le bilan : fiche {e['titre']!r}, {e['hash']}, barre {e['barre']}, focus {e['focus']}, ‹ {libelle!r}, entrée {e['etat']}")
    if e["hash"] != "#carte" or e["barre"] != cible or e["focus"] != "fiche-titre" or libelle != "Retour au bilan" or not (e["etat"] or {}).get("bilan"):
        defauts.append(f"erreur touchée : la carte (#carte), {cible} dans la barre, sa fiche, focus au titre, « ‹ » « Retour au bilan » attendus ({e}, ‹ {libelle!r})")
    # « ‹ Bilan » en clair (décision « Fiche depuis le bilan », 18/11) : 44 px de haut, dans la tête, sans chevaucher le drapeau.
    vu = p.js("""(() => { const a = document.querySelector('#fiche-lieu .fiche-avant'), r = a.getBoundingClientRect();
      const d = document.querySelector('#fiche-lieu .fiche-drapeaux'), rd = d ? d.getBoundingClientRect() : null;
      return {texte: a.innerText.replace(/\\s+/g, ''), h: r.height, l: r.width,
              chevauche: !!rd && rd.width > 0 && r.right > rd.left && r.left < rd.right && r.bottom > rd.top && r.top < rd.bottom}; })()""")
    dire(f"  « ‹ Bilan » : {vu}")
    if vu["texte"] != "‹Bilan" or vu["h"] < 43.5 or vu["chevauche"]:
        defauts.append(f"« ‹ Bilan » visible, 44 px de haut, sans chevaucher le drapeau attendu ({vu})")
    # Lot F8 : la carte de situation à côté de « ‹ Bilan », du drapeau et de « × » (384 px : la tête la plus chargée).
    verifier_situation(p, defauts, "fiche depuis le bilan", "continent:South America", False)
    capturer("163-bilan-fiche")
    if e["voisins"]:
        v = e["voisins"][0]
        toucher_element(p, f'#fiche-lieu .fiche-voisins .fiche-voisin[data-id="{v}"]')
        e = attendre_fiche(p, lambda x: x["ouverte"] and x["id"] == v, f"voisin {v} depuis le bilan")
        libelle = p.js(JS_AVANT_FICHE)
        if e["id"] != v or libelle != "Fiche d'avant":
            defauts.append(f"voisin depuis le bilan : la fiche de {v}, « ‹ » « Fiche d'avant » attendus ({e}, ‹ {libelle!r})")
        capturer("164-bilan-voisin")
        toucher_element(p, "#fiche-lieu .fiche-avant")
        e = attendre_fiche(p, lambda x: x["ouverte"] and x["id"] == cible, f"« ‹ » vers {cible}")
        if p.js(JS_AVANT_FICHE) != "Retour au bilan":
            defauts.append(f"« ‹ » depuis le voisin : la fiche de {cible} et « Retour au bilan » attendus ({e})")
    else:
        defauts.append(f"fiche de {cible} : aucun voisin")
    toucher_element(p, "#fiche-lieu .fiche-avant")
    r = attendre_bilan(p)
    dire(f"  « ‹ Retour au bilan » : {r}")
    if r["hash"] != "#toucher" or not r["bilan"] or r["fiche"] or r["focus"] != cible:
        defauts.append(f"« ‹ Retour au bilan » : le bilan (#toucher), la fiche fermée, le focus à la ligne de {cible} attendus ({r})")
    capturer("165-bilan-retour")
    # « × » : la carte, le lieu montré ; le retour du navigateur rend le bilan.
    toucher_element(p, f'#essai-bilan .ligne-fiche[data-id="{cible}"]')
    attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == cible, f"fiche de {cible}, de nouveau")
    toucher_element(p, "#fiche-lieu .croix")
    e = attendre_fiche(p, lambda e: not e["ouverte"] and e["hash"] == "#carte", "« × » depuis le bilan")
    if e["ouverte"] or e["hash"] != "#carte" or e["barre"] != cible:
        defauts.append(f"« × » depuis le bilan : la carte, {cible} dans la barre, la fiche fermée attendus ({e})")
    p.js("history.back()")
    r = attendre_bilan(p)
    if r["hash"] != "#toucher" or not r["bilan"]:
        defauts.append(f"retour du navigateur après « × » : le bilan attendu ({r})")

    # L'île : une commune ratée, sa fiche sur l'île, le bilan rendu sur l'île.
    cible = partie_avec_erreur("reunion", lambda c: "97416" if c == "97411" else "97411")
    lignes = verifier_lignes_bilan(p, defauts, "bilan de Trouver sur l'île")
    if [l["id"] for l in lignes] != [cible]:
        defauts.append(f"bilan de l'île : l'erreur sur {cible} seule attendue, touchable ({[l['id'] for l in lignes]})")
    capturer("166-bilan-ile")
    toucher_element(p, f'#essai-bilan .ligne-fiche[data-id="{cible}"]')
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == cible, f"fiche de la commune {cible} depuis le bilan")
    attendre_fin_vol(p, "ile")
    terrain = p.js("window.terramemo.terrain()")
    dire(f"  depuis le bilan de l'île : fiche {e['titre']!r}, terrain {terrain}, ‹ {p.js(JS_AVANT_FICHE)!r}")
    if terrain != "reunion" or (e["etat"] or {}).get("terrain") != "reunion" or p.js(JS_AVANT_FICHE) != "Retour au bilan":
        defauts.append(f"commune touchée au bilan : sa fiche sur l'île, « Retour au bilan » attendus ({e}, terrain {terrain})")
    capturer("167-bilan-ile-fiche")
    toucher_element(p, "#fiche-lieu .fiche-avant")
    r = attendre_bilan(p)
    dire(f"  « ‹ Retour au bilan » (île) : {r}")
    if r["hash"] != "#toucher" or not r["bilan"] or r["fiche"] or r["terrain"] != "reunion" or r["focus"] != cible:
        defauts.append(f"« ‹ Retour au bilan » (île) : le bilan sur l'île, le focus à la ligne de {cible} attendus ({r})")
    croix_vers_carte(p, defauts, "bilan de Trouver (île)", "#essai-bilan")

    # Les bilans du Chrono et du quiz (leur ligne, leur activer() qui rend le focus) : Sans faute, une erreur au
    # premier toucher ; puis Échap pour revenir. Le quiz Facile abandonné à sa première question (une question sans
    # réponse est une erreur) ; puis « ‹ ».
    jouer_partie(p, "sansfaute", "South America")
    c = p.js('document.querySelector("#barre-chrono .essai-consigne").dataset.cible')
    faux = "BRA" if c == "ARG" else "ARG"
    # La carte vole vers la série après la barre : sur le site en ligne (PC), l'Argentine n'était pas encore à l'écran.
    attendre_fin_vol(p)
    fin = time.monotonic() + 8
    while not position_visible(p, faux, "#barre-chrono") and time.monotonic() < fin:
        p.pause(200)
    toucher_pays(p, faux, "#barre-chrono")
    fin = time.monotonic() + 8
    while not visible(p, "#chrono-bilan") and time.monotonic() < fin:
        p.pause(100)
    fiche_depuis_autre_bilan(p, capturer, defauts, "bilan de Sans faute", "chrono-bilan", "#chrono", "168-bilan-chrono", par_echap=True)
    croix_vers_carte(p, defauts, "bilan de Sans faute", "#chrono-bilan")
    p.js('location.hash = "#jouer"')
    attendre_visible(p, "#jouer-panneau")
    cliquer(p, '#jouer-panneau [data-racine="quiz"]')
    cliquer(p, '#jouer-panneau [data-difficulte="facile"]')
    fin = time.monotonic() + 30
    # Le choix doit être montré (aucun ancêtre caché), et non seulement actif : au lancement, les boutons existent déjà,
    # actifs, dans la barre cachée, et « Abandonner » pendant le chargement des images ramène aux difficultés sans
    # bilan (D55 a). Vu au pilote du lot F6 sur le site en ligne, où les drapeaux mettent ≈ 1 s à venir.
    while not p.js('(() => { const c = document.querySelector("#barre-quiz .nommer-choix"); return !!c && !c.disabled && !c.closest("[hidden]"); })()') and time.monotonic() < fin:
        p.pause(100)
    cliquer_apres_pause(p, "#quiz-abandonner")
    fin = time.monotonic() + 8
    while not visible(p, "#quiz-bilan") and time.monotonic() < fin:
        p.pause(100)
    fiche_depuis_autre_bilan(p, capturer, defauts, "bilan du quiz", "quiz-bilan", "#quiz", "169-bilan-quiz", par_echap=False)
    croix_vers_carte(p, defauts, "bilan du quiz", "#quiz-bilan")


# Le bloc Mémoire de la fiche ouverte et « Apprendre ce lieu » (#34, lot F7) : ses lignes, ses textes, chaque bouton
# (montré : aucun ancêtre caché), sa hauteur, sa place dans la feuille ; le lieu retenu (D58 b) ; la page sans
# défilement horizontal ; le focus.
JS_BLOC_APPRENDRE = """(() => { const f = document.getElementById('fiche-lieu'); if (!f || f.hidden) return null;
  const b = f.querySelector('.fiche-memoire'), fr = f.getBoundingClientRect();
  const bouton = (id) => { const e = document.getElementById(id); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect();
    return { texte: e.textContent, haut: r.height, dans: r.left >= fr.left - 0.5 && r.right <= fr.right + 0.5, deborde: e.scrollWidth > e.clientWidth + 1 }; };
  return { bloc: !!b, lignes: b ? [...b.querySelectorAll('li')].map(l => l.textContent) : [],
    textes: b ? [...b.querySelectorAll('p')].map(x => x.textContent) : [],
    apprendre: bouton('fiche-apprendre'), retenir: bouton('fiche-retenir'), oublier: bouton('fiche-oublier'),
    retenu: localStorage.getItem('terramemo.apprendre.pays'), focus: document.activeElement ? document.activeElement.id : null,
    annonce: (document.getElementById('fiche-annonce') || {}).textContent || '',
    page: document.documentElement.scrollWidth - innerWidth }; })()"""
TEXTE_GRAPPE_FAITE = "La grappe du jour est déjà apprise."
TEXTE_RETENU = "Noté : sa région sera ta prochaine grappe."


def ouvrir_fiche_par_recherche(p, defauts, quoi, cherche, ident):
    """Le lieu `ident` choisi dans la recherche (« Maurice » : une île, mal placée pour un toucher), la carte posée,
    puis sa barre touchée : sa fiche, posée (attendre_feuille_posee). Rend l'état de la fiche."""
    p.js('document.getElementById("recherche-champ").value = ""')
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text=cherche)
    choix = f'#recherche-liste [data-terrain="monde"][data-id="{ident}"]'
    attendre_visible(p, choix)
    cliquer(p, choix)
    attendre_fin_vol(p)
    e = attendre_fiche(p, lambda e: e["barre"] == ident and e["chevron"], f"{quoi} : {ident} montré")
    if not e["chevron"]:
        defauts.append(f"{quoi} : {ident} choisi dans la recherche, pas de chevron ({e})")
        return e
    toucher_element(p, "#barre-fiche")
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == ident, f"{quoi} : fiche de {ident}")
    if not e["ouverte"]:
        defauts.append(f"{quoi} : la barre touchée n'ouvre pas la fiche de {ident} ({e})")
    else:
        attendre_feuille_posee(p)
    return e


def lire_bloc_apprendre(p, defauts, quoi):
    """Le bloc Mémoire amené au milieu de la fiche (il est en bas), puis lu (JS_BLOC_APPRENDRE) : chaque bouton
    montré fait 44 px au moins, tient dans la feuille, sans débordement ; la page ne défile pas en largeur."""
    p.js("(() => { const b = document.querySelector('#fiche-lieu .fiche-apprendre') || document.querySelector('#fiche-lieu .fiche-memoire'); if (b) b.scrollIntoView({block: 'center'}); })()")
    p.pause(300)
    m = p.js(JS_BLOC_APPRENDRE)
    if not m or not m["bloc"]:
        defauts.append(f"{quoi} : pas de bloc Mémoire dans la fiche ({m})")
        return m or {"bloc": False, "lignes": [], "textes": [], "apprendre": None, "retenir": None, "oublier": None, "retenu": None, "focus": None, "annonce": "", "page": 0}
    boutons = {k: m[k] for k in ("apprendre", "retenir", "oublier") if m[k]}
    dire(f"  {quoi} : lignes {m['lignes']}, textes {m['textes']}, boutons "
         + (", ".join(f"{b['texte']!r} {b['haut']:.0f} px" for b in boutons.values()) or "aucun") + f", retenu {m['retenu']!r}")
    for k, b in boutons.items():
        if b["haut"] < 43.5 or not b["dans"] or b["deborde"]:
            defauts.append(f"{quoi} : le bouton {b['texte']!r} fait {b['haut']:.1f} px, dans la feuille {b['dans']}, déborde {b['deborde']} (44 px, dans la feuille, sans débordement)")
    if m["page"] > 0:
        defauts.append(f"{quoi} : la page défile en largeur ({m['page']} px)")
    return m


def ui_fiche_apprendre(p, capturer, defauts, base, parametres=""):
    """Captures 170 à 176 (#34, lot F7 ; étude fiche-lieu § 5, § 8 et D58). La fiche de Maurice (par la recherche) :
    sur un journal neuf (commande fiche), « Apprendre ce lieu » et « avec N pays voisins » dessous, bouton de 44 px
    (capture 170) ; touché, la séance Apprendre (#toucher) sur la grappe de Maurice (QCM, 171) : au bilan « Apprendre ·
    Afrique » (172), et le journal n'a que des fiches pays: de pays d'Afrique, Maurice compris, une par réponse ; le
    retour du navigateur rouvre sa fiche, sans bouton, « Pays : vu … » (173). Puis le Nigeria, la grappe du jour prise :
    « La grappe du jour est déjà apprise. » et « Retenir ce lieu » (174) ; touché : « Noté », « Annuler », qui prend le
    focus, la clé terramemo.apprendre.pays, rien au journal (175). Le lendemain (?horloge=1, serveur de développement
    seulement) : le Nigeria, « Apprendre ce lieu » et « Noté » (176), Maurice sans bouton ; « Annuler » efface la clé.
    Un journal pas neuf (commande ui : la séance a pris la grappe du jour) : la séance est sautée et Maurice tient le
    rôle du Nigeria. DÉFAUT à chaque écart."""
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    continents = {x["id"]: x["continent"] for x in json.loads((RACINE / "public/geo/pays.json").read_text())}
    fiches0 = collections.Counter(p.js(FICHES_JOURNAL) or [])
    ouvrir_fiche_par_recherche(p, defauts, "Apprendre ce lieu", "Maurice", "MUS")
    m = lire_bloc_apprendre(p, defauts, "fiche de Maurice")
    capturer("170-apprendre-maurice")
    appris = False
    if m["apprendre"]:
        detail = sans_insecables(" · ".join(m["textes"]))
        if m["apprendre"]["texte"] != "Apprendre ce lieu" or not re.search(r"avec \d+ pays voisins?", detail):
            defauts.append(f"fiche de Maurice : « Apprendre ce lieu » et « avec N pays voisins » attendus ({m['apprendre']}, {m['textes']})")
        toucher_element(p, "#fiche-apprendre")
        fin = time.monotonic() + 10
        while p.js("location.hash") != "#toucher" and time.monotonic() < fin:
            p.pause(100)
        if p.js("location.hash") != "#toucher":
            defauts.append(f"« Apprendre ce lieu » touché : {p.js('location.hash')} au lieu de #toucher")
        n_rep = jouer_seance(p, capturer, defauts, "Apprendre ce lieu", captures={"qcm": "171-apprendre-maurice-qcm"})
        bilan = sans_insecables(texte(p, "#essai-bilan"))
        dire(f"  Apprendre ce lieu, bilan : {bilan[:200]!r}")
        if "Apprendre · Afrique" not in bilan or not p.js("!!document.querySelector('#essai-bilan #essai-autre')"):
            defauts.append(f"bilan d'« Apprendre ce lieu » : « Apprendre · Afrique » et « Autre série » attendus ({bilan[:200]!r})")
        capturer("172-apprendre-maurice-bilan")
        # getAll() rend les événements dans l'ordre de leur id, pas de leur écriture : la différence des deux lectures.
        nouvelles = list((collections.Counter(p.js(FICHES_JOURNAL) or []) - fiches0).elements())
        ids = sorted({f.split(":")[1] for f in nouvelles})
        dire(f"  Apprendre ce lieu : {len(nouvelles)} événements pour {n_rep} réponses, lieux {ids}")
        if len(nouvelles) != n_rep or "MUS" not in ids or not all(f.startswith("pays:") for f in nouvelles) or any(continents.get(i) != "Africa" for i in ids):
            defauts.append(f"Apprendre ce lieu : la grappe de Maurice en fiches pays:, une par réponse, attendue ({len(nouvelles)} pour {n_rep}, {ids}, {nouvelles[:4]})")
        appris = "MUS" in ids
        # Le retour du navigateur : l'entrée de la fiche, sous celle de la partie ; Maurice appris, plus de bouton.
        p.js("history.back()")
        e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "MUS", "retour : la fiche de Maurice")
        if not e["ouverte"]:
            defauts.append(f"retour du navigateur depuis le bilan : la fiche de Maurice attendue ({e})")
        else:
            attendre_feuille_posee(p)
        m = lire_bloc_apprendre(p, defauts, "fiche de Maurice, apprise")
        if m["apprendre"] or m["retenir"] or not any(l.startswith("Pays : vu") for l in m["lignes"]):
            defauts.append(f"fiche de Maurice apprise : ni bouton ni « Retenir », « Pays : vu … » attendus ({m})")
        capturer("173-apprendre-maurice-apprise")
        autre = ("Nigeria", "NGA")
        ouvrir_fiche_par_recherche(p, defauts, "grappe du jour prise", *autre)
    else:
        dire("  fiche de Maurice sans « Apprendre ce lieu » (journal pas neuf : la grappe du jour est prise) : la séance est sautée, "
             "le critère du lot est à la commande fiche, sur un profil neuf")
        autre = ("Maurice", "MUS")
    # La grappe du jour prise (D58 b) : pourquoi, « Retenir ce lieu », puis « Noté » et « Annuler » ; rien au journal.
    m = lire_bloc_apprendre(p, defauts, f"fiche de {autre[0]}, grappe du jour prise")
    # Sur un journal pas neuf, la raison peut être une autre (des révisions d'abord) : « Retenir ce lieu » y est aussi.
    if m["apprendre"] or not m["retenir"] or (appris and TEXTE_GRAPPE_FAITE not in m["textes"]):
        defauts.append(f"fiche de {autre[0]}, grappe du jour prise : « {TEXTE_GRAPPE_FAITE} » et « Retenir ce lieu » sans « Apprendre ce lieu » attendus ({m})")
    capturer("174-apprendre-retenir")
    if m["retenir"]:
        n1 = p.js(COMPTER_JOURNAL)
        toucher_element(p, "#fiche-retenir")
        fin = time.monotonic() + 5
        while not visible(p, "#fiche-oublier") and time.monotonic() < fin:
            p.pause(100)
        m = lire_bloc_apprendre(p, defauts, f"fiche de {autre[0]}, retenu")
        if m["retenu"] != autre[1] or TEXTE_RETENU not in m["textes"] or not m["oublier"] or m["retenir"] or m["focus"] != "fiche-oublier":
            defauts.append(f"« Retenir ce lieu » touché : « {TEXTE_RETENU} », « Annuler » (le focus), la clé à {autre[1]} attendus ({m})")
        # « Noté » dit au lecteur d'écran : la région live de la feuille (#fiche-annonce), posée vide avant le geste.
        if m.get("annonce") != TEXTE_RETENU:
            defauts.append(f"« Retenir ce lieu » touché : « {TEXTE_RETENU} » attendu dans la région annoncée #fiche-annonce ({m.get('annonce')!r})")
        if p.js(COMPTER_JOURNAL) != n1:
            defauts.append("« Retenir ce lieu » : un événement écrit au journal (rien attendu, D58 b)")
        capturer("175-apprendre-retenu")
    if m["oublier"] and serveur_de_dev(base):
        # Le lendemain : sa grappe passe en tête, le bouton revient, « Noté » reste ; Maurice appris, toujours sans bouton.
        p.goto(base + "?mesures=0&horloge=1" + parametres + "#carte")
        p.attendre_carte()
        ouvrir_fiche_par_recherche(p, defauts, "le lendemain", *autre)
        m = lire_bloc_apprendre(p, defauts, f"le lendemain, fiche de {autre[0]}")
        if not m["apprendre"] or not m["oublier"] or TEXTE_RETENU not in m["textes"]:
            defauts.append(f"le lendemain, fiche de {autre[0]} retenu : « Apprendre ce lieu », « Noté » et « Annuler » attendus ({m})")
        capturer("176-apprendre-lendemain")
        if m["oublier"]:
            toucher_element(p, "#fiche-oublier")
            p.pause(300)
            m = lire_bloc_apprendre(p, defauts, f"le lendemain, {autre[0]} oublié")
        if appris:
            ouvrir_fiche_par_recherche(p, defauts, "le lendemain", "Maurice", "MUS")
            mm = lire_bloc_apprendre(p, defauts, "le lendemain, fiche de Maurice")
            if mm["apprendre"] or mm["retenir"]:
                defauts.append(f"le lendemain, fiche de Maurice : plus de bouton attendu ({mm})")
    else:
        if m["oublier"]:
            dire("  lendemain : sauté (?horloge= n'agit qu'en serveur de développement)")
            toucher_element(p, "#fiche-oublier")
            p.pause(300)
            m = lire_bloc_apprendre(p, defauts, f"fiche de {autre[0]}, « Annuler »")
    if m["retenu"] is not None or m["oublier"]:
        defauts.append(f"« Annuler » : la clé terramemo.apprendre.pays effacée, « Annuler » retiré attendus ({m})")
    # La suite sans l'horloge de test.
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()


def ui_fiche(p, capturer, defauts, base, parametres="", telephone=True):
    """Captures 150 à 159 (#34, lot F1 ; étude fiche-lieu § 4 et § 7) : sur une page rechargée,
    rien des fiches au premier affichage ; le Japon touché (sa ligne « Tokyo », son chevron, les
    fiches chargées à ce toucher seulement, la hauteur de la barre inchangée à leur arrivée) ; la
    barre touchée (ou glissée vers le haut, au doigt) ouvre la fiche : titre, focus, entrée
    d'historique, barre inerte mais en place, zoom caché ; le retour du navigateur la ferme sans
    quitter la carte ; l'Espagne et ses voisins (France, puis « ‹ ») ; « × », le voile, Échap ;
    ⚙ par-dessus (Échap ne ferme que la popup) ; lot F3 : le Groenland (barre, lignes, drapeau à part), Hong Kong, le Sahara occidental et Bir Tawil (zones), l'Antarctique ;
    lot F4 : l'eau touchée (les fiches des mers lues à ce toucher, avec la couche, le chevron), la Méditerranée
    (barre « océan Atlantique », fiche, capture 158), son océan touché dans la fiche (l'Atlantique, capture 159),
    « ‹ », l'Adriatique et sa mère, la mer des Sargasses ; lot F5 : Saint-Denis par la recherche (les fiches des
    communes lues à ce moment seulement, la barre « 156 000 hab. », capture 154), Saint-Pierre touché sur l'île et sa
    fiche (habitants de 2023, superficie, CIVIS, cinq voisines, capture 160), une voisine touchée (Le Tampon, la carte
    de l'île vole sous la fiche, capture 161), « ‹ », « × », « Monde » ; puis le scénario de mesure ; lot F6 : depuis
    le bilan d'une partie de Trouver, au monde et sur l'île (ui_fiche_bilan, captures 162 à 169) ; lot F7 : « Apprendre
    ce lieu » depuis la fiche de Maurice, puis le lieu retenu (ui_fiche_apprendre, captures 170 à 176) ; lot F8 : la carte de
    situation de chaque fiche vérifiée (verifier_situation : sa région, son anneau, sa place dans la tête), le Japon (177),
    le titre le plus long (Saint-Vincent-et-les-Grenadines, 178), la Russie (179), et le scénario de mesure sur une page
    rechargée, dix voisins, chaque gel avec sa cause. Les superficies,
    profondeurs et riverains des mers sont tus jusqu'à leur relecture (LIGNES_RELUES) : la fiche d'une mer n'a que sa
    sorte, sa mère, son océan, la mémoire et le lien ; le gentilé d'une commune aussi. DÉFAUT à chaque écart."""
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    debut = ressources_fiches(p)
    if debut:
        defauts.append(f"fiche : chargé au premier affichage : {debut}")
    longueur = p.js("history.length")

    # Le Japon : la barre, sa ligne de faits, son chevron.
    toucher_lieu_accueil(p, "JPN")
    h0 = p.js("document.getElementById('barre-carte').getBoundingClientRect().height")
    e = attendre_fiche(p, lambda e: e["barre"] == "JPN" and e["chevron"], "Japon touché")
    h1 = p.js("document.getElementById('barre-carte').getBoundingClientRect().height")
    lus = [n.split("/")[-1] for n in ressources_fiches(p) if "/geo/" in n]
    dire(f"  Japon touché : faits {e['faits']!r}, chevron {e['chevron']}, barre {h0:.0f} → {h1:.0f} px, lu {lus}")
    # Lot F2 : « capitale · habitants », trois chiffres au plus (espaces insécables possibles).
    faits = re.sub(r"\s+", " ", e["faits"])
    if faits != "Tokyo · 123 millions d'hab." or not e["chevron"]:
        defauts.append(f"Japon touché : ligne de faits « Tokyo · 123 millions d'hab. » et chevron attendus ({e})")
    if sorted(set(lus)) != sorted(FICHIERS_GEO_FICHES):
        defauts.append(f"Japon touché : {lus} lus au lieu des fiches du monde ({', '.join(FICHIERS_GEO_FICHES)})")
    if abs(h1 - h0) > 0.5:
        defauts.append(f"barre : sa hauteur change à l'arrivée de la ligne de faits ({h0:.1f} → {h1:.1f} px)")
    # La barre la plus haute des 258 noms (un nom long sur deux lignes reste possible) : la réserve suit-elle ?
    plus_haute = p.js("""(async () => { const noms = await (await fetch('/geo/noms.fr.json')).json();
      const b = document.getElementById('barre-carte'), n = b.querySelector('.barre-nom'), avant = n.textContent;
      let max = 0, qui = '';
      for (const [id, nom] of Object.entries(noms)) { n.textContent = nom; const h = b.getBoundingClientRect().height; if (h > max) { max = h; qui = nom; } }
      n.textContent = avant; return [Math.round(max), qui]; })()""")
    dire(f"  barre la plus haute des noms : {plus_haute[0]} px ({plus_haute[1]!r}), Japon {h1:.0f} px")
    capturer("150-fiche-barre")

    # La barre touchée : la fiche.
    toucher_element(p, "#barre-fiche")
    # Le drapeau arrive après la fiche (chargé à part, au premier affichage d'une fiche) : on l'attend aussi.
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "JPN" and e["drapeaux"], "fiche du Japon")
    dire(f"  fiche du Japon : {e['titre']!r}, lignes {e['lignes']}, {e['drapeaux']} drapeau(x), état {e['etat']}, focus {e['focus']}, zoom {e['zoom']}")
    if e["titre"] != "Japon" or e["focus"] != "fiche-titre" or not e["etat"] or e["hash"] != "#carte":
        defauts.append(f"fiche du Japon : titre, focus au titre, entrée d'historique sur #carte attendus ({e})")
    if e["barre_cachee"] or not e["inerte"] or e["fiche_body"] != "ouverte" or not e["voile"]:
        defauts.append(f"fiche ouverte : barre en place et inerte, body[data-fiche], voile attendus ({e})")
    if e["zoom"] not in (None, "none"):
        defauts.append(f"fiche ouverte : boutons de zoom visibles ({e['zoom']})")
    if not any(l.startswith("Capitale") and "Tokyo" in l for l in e["lignes"]) or not e["drapeaux"]:
        defauts.append(f"fiche du Japon : capitale et drapeau attendus ({e['lignes']}, {e['drapeaux']} drapeau)")
    # Lot F2 : les lignes servies sans relecture (habitants, monnaie, heure), dans l'ordre du § 4.2 ; les lignes
    # à relire (superficie, langues, gentilé, sommet, fête) tues tant que LIGNES_RELUES les tient.
    libelles = [l.split(" ")[0] for l in e["lignes"]]
    attendus = ["Capitale", "Habitants", "Monnaie", "Heure", "Continent"]
    if libelles != attendus or not any(l.startswith("Heure à Tokyo") for l in e["lignes"]):
        defauts.append(f"fiche du Japon : lignes {attendus} attendues, dans l'ordre ({e['lignes']})")
    # L'entrée d'historique : celle de la première fiche (rang 1). history.length seulement sous le plafond
    # de Chromium (50 entrées) : après les autres ui_*, pushState ne l'augmente plus.
    if (e["etat"] or {}).get("rang") != 1:
        defauts.append(f"fiche du Japon : entrée d'historique de rang 1 attendue ({e['etat']})")
    if longueur < 50 and p.js("history.length") != longueur + 1:
        defauts.append(f"fiche du Japon : {p.js('history.length') - longueur} entrées d'historique au lieu d'une")
    # La tête (§ 4.2) : « × » à droite, le nom à gauche sous le drapeau. Une règle globale de l'en-tête du
    # site (header en grille) l'a déjà mise en colonnes, la « × » à gauche, sans qu'aucun test ne le voie.
    g = p.js("""(() => { const f = document.querySelector('.fiche'), c = f && f.querySelector('.fiche-tete > .croix'),
      t = document.getElementById('fiche-titre'); if (!f || !c || !t) return null; const r = (e) => e.getBoundingClientRect();
      return {fiche_g: Math.round(r(f).left), fiche_d: Math.round(r(f).right), croix_d: Math.round(r(c).right), titre_g: Math.round(r(t).left)}; })()""")
    if not g or g["croix_d"] < g["fiche_d"] - 40 or g["titre_g"] > g["fiche_g"] + 40:
        defauts.append(f"tête de la fiche : « × » à droite et nom à gauche attendus ({g})")
    capturer("151-fiche-japon")
    # Lot F8 : la carte de situation, l'Asie, le Japon éclairé.
    verifier_situation(p, defauts, "fiche du Japon", "continent:Asia", False)
    capturer("177-situation-japon")
    # Le retour du navigateur (celui d'Android fait history.back()) : la fiche se ferme, on reste sur la carte.
    p.js("history.back()")
    # Le focus revient à la barre deux images après la fermeture : Chromium applique d'abord l'ancre #carte
    # (l'hôte de la carte), qui le retire de la page (explorer.ts, fermerFiche). On attend donc l'état entier.
    e = attendre_fiche(p, lambda e: not e["ouverte"] and e["focus"] == "barre-fiche", "retour du navigateur")
    dire(f"  retour du navigateur : ouverte {e['ouverte']}, {e['hash']}, barre {e['barre']}, focus {e['focus']}")
    if e["ouverte"] or e["hash"] != "#carte" or e["barre"] != "JPN" or e["focus"] != "barre-fiche":
        defauts.append(f"retour du navigateur : fiche fermée, carte gardée, focus à la barre attendus ({e})")
    if telephone:
        # Au doigt : la barre glissée vers le haut (24 px et plus) ouvre aussi.
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        r = p.js("(() => { const r = document.getElementById('barre-fiche').getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()")
        glisser(p, r["x"], r["y"], r["y"] - 60)
        e = attendre_fiche(p, lambda e: e["ouverte"], "glissé vers le haut")
        if not e["ouverte"]:
            defauts.append("barre glissée vers le haut : la fiche ne s'ouvre pas")
        else:
            # Et la tête glissée vers le bas (60 px et plus) la ferme.
            p.pause(PAUSE_AVANT_TOUCHER_MS)
            t = p.js("(() => { const r = document.querySelector('#fiche-lieu .fiche-tete').getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()")
            glisser(p, t["x"], t["y"], t["y"] + 120)
            e = attendre_fiche(p, lambda e: not e["ouverte"], "tête glissée vers le bas")
            if e["ouverte"]:
                defauts.append("tête de la fiche glissée vers le bas : la fiche reste ouverte")

    # L'Espagne et ses voisins : la France, puis « ‹ », puis « × » (une seule remontée).
    e = ouvrir_fiche(p, "ESP", defauts, "Espagne")
    dire(f"  fiche de l'Espagne : voisins {e['voisins']}, lignes {e['lignes']}")
    if e["voisins"][:4] != ["AND", "FRA", "MAR", "PRT"] or "GIB" not in e["voisins"]:
        defauts.append(f"fiche de l'Espagne : voisins jouables par ordre alphabétique puis Gibraltar attendus ({e['voisins']})")
    toucher_element(p, '#fiche-lieu .fiche-voisin[data-id="FRA"]')
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "FRA", "voisin France")
    attendre_fin_vol(p)
    e = etat_fiche(p)
    dire(f"  voisin France : {e['titre']!r}, barre {e['barre']}, « ‹ » {e['avant']}, rang {e['etat'] and e['etat'].get('rang')}")
    if e["titre"] != "France" or e["barre"] != "FRA" or not e["avant"] or (e["etat"] or {}).get("rang") != 2:
        defauts.append(f"voisin France : sa fiche, la carte sur elle, « ‹ », rang 2 attendus ({e})")
    capturer("152-fiche-voisin")
    toucher_element(p, "#fiche-lieu .fiche-avant")
    # La barre suit la fiche d'une image (≈ 50 ms, sous la feuille) depuis que le morceau est là d'avance (lot F6).
    e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "ESP" and e["barre"] == "ESP", "« ‹ » vers l'Espagne")
    if e["id"] != "ESP" or e["barre"] != "ESP":
        defauts.append(f"« ‹ » : la fiche de l'Espagne et son lieu attendus ({e})")
    toucher_element(p, '#fiche-lieu .fiche-voisin[data-id="PRT"]')
    attendre_fiche(p, lambda e: e["id"] == "PRT", "voisin Portugal")
    toucher_element(p, "#fiche-lieu .croix")
    e = attendre_fiche(p, lambda e: not e["ouverte"], "« × »")
    dire(f"  « × » après un voisin : ouverte {e['ouverte']}, {e['hash']}, état {e['etat']}, barre {e['barre']}")
    if e["ouverte"] or e["etat"] or e["hash"] != "#carte" or e["barre"] != "PRT":
        defauts.append(f"« × » : toutes les fiches fermées, la carte sur le dernier lieu vu attendues ({e})")

    # Le voile : un toucher à côté ferme la fiche, sans toucher la carte ; ⚙ ouverte, il ne ferme que la popup.
    e = ouvrir_fiche(p, "PRT", defauts, "Portugal")
    pt = p.js("""(() => { const a = document.getElementById('app').getBoundingClientRect(), f = document.getElementById('fiche-lieu').getBoundingClientRect();
      if (f.left - a.left >= 6) return {x: (a.left + f.left) / 2, y: (f.top + f.bottom) / 2};
      return {x: (f.left + f.right) / 2, y: (f.bottom + a.bottom) / 2}; })()""")
    cliquer(p, "#settings-btn")
    p.pause(200)
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    p.toucher(pt["x"], pt["y"])
    p.pause(300)
    e = etat_fiche(p)
    dire(f"  ⚙ puis le voile : popup {e['reglages']}, fiche {e['ouverte']}")
    if e["reglages"] or not e["ouverte"]:
        defauts.append(f"⚙ par-dessus la fiche : un toucher sur le voile ferme la popup seule attendu ({e})")
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    p.toucher(pt["x"], pt["y"])
    e = attendre_fiche(p, lambda e: not e["ouverte"], "voile")
    if e["ouverte"] or e["barre"] != "PRT":
        defauts.append(f"voile : la fiche fermée sans rien toucher sur la carte attendue ({e})")

    # Échap : un pas ; ⚙ par-dessus : Échap ne ferme que la popup.
    e = ouvrir_fiche(p, "PRT", defauts, "Portugal")
    cliquer(p, "#settings-btn")
    p.pause(200)
    p.cdp("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    p.cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    p.pause(200)
    e = etat_fiche(p)
    dire(f"  ⚙ puis Échap : popup {e['reglages']}, fiche {e['ouverte']}")
    if e["reglages"] or not e["ouverte"]:
        defauts.append(f"⚙ par-dessus la fiche : Échap ferme la popup seule attendu ({e})")
    p.cdp("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    p.cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    e = attendre_fiche(p, lambda e: not e["ouverte"], "Échap")
    if e["ouverte"]:
        defauts.append("Échap : la fiche reste ouverte")

    # 🏆 par-dessus une fiche (puis un voisin) : sa « × » mène à la carte seule, sans rouvrir la fiche (« Croix vers la carte »).
    e = ouvrir_fiche(p, "PRT", defauts, "Portugal")
    toucher_element(p, '#fiche-lieu .fiche-voisin[data-id="ESP"]')
    attendre_fiche(p, lambda e: e["id"] == "ESP", "voisin Espagne")
    cliquer(p, "#classement-btn")
    attendre_visible(p, "#classement-general")
    p.pause(800)
    croix_vers_carte(p, defauts, "🏆 ouvert depuis une fiche", "#classement-general")
    p.pause(300)
    e = etat_fiche(p)
    dire(f"  🏆 puis sa « × » : fiche {e['ouverte']}, état {e['etat']}")
    if e["ouverte"] or e["etat"]:
        defauts.append(f"🏆 ouvert depuis une fiche, sa « × » : la carte sans fiche ni entrée de fiche attendue ({e})")

    # Lot F3 : un territoire, une zone contestée, Bir Tawil, Hong Kong, l'Antarctique. Les lignes à relire
    # (statut écrit, capitale, superficie, langues, gentilé, sommet, habitants des zones) restent tues tant que
    # LIGNES_RELUES les tient : la barre du Groenland dit ses habitants seuls, sa fiche « Heure locale ».
    debut_t = [n for n in ressources_fiches(p) if "drapeaux-territoires" in n]
    if debut_t:
        defauts.append(f"drapeaux des territoires lus avant la première fiche de territoire : {debut_t}")
    e = ouvrir_fiche(p, "GRL", defauts, "Groenland")
    faits = re.sub(r"\s+", " ", e["faits"])
    e = attendre_fiche(p, lambda x: x["ouverte"] and x["drapeaux"], "drapeau du Groenland")
    libelles = [l.split(" ")[0] for l in e["lignes"]]
    # L'entrée de l'image n'est notée qu'à la fin de son chargement : sur le site en ligne, le drapeau
    # est souvent encore en route quand la fiche est prête (en local, il arrive avant).
    for _ in range(25):
        lus_t = [n.split("/geo/")[-1] for n in ressources_fiches(p) if "drapeaux-territoires" in n]
        if any(n.startswith("drapeaux-territoires/") for n in lus_t):
            break
        p.pause(200)
    dire(f"  fiche du Groenland : barre {faits!r}, statut {e['statut']!r}, lignes {e['lignes']}, {e['drapeaux']} drapeau, lu {lus_t}")
    if faits != "56 800 hab.":
        defauts.append(f"barre du Groenland : « 56 800 hab. » attendu tant que les capitales ne sont pas relues ({faits!r})")
    if e["statut"] != "territoire" or libelles != ["Habitants", "Monnaie", "Heure", "Continent"] or not any(l.startswith("Heure locale") for l in e["lignes"]):
        defauts.append(f"fiche du Groenland : statut « territoire », lignes Habitants, Monnaie, Heure locale, Continent attendues ({e})")
    if e["drapeaux"] != 1 or "drapeaux-territoires.json" not in lus_t or not any(n.startswith("drapeaux-territoires/") for n in lus_t):
        defauts.append(f"fiche du Groenland : son drapeau, par drapeaux-territoires.json, attendu ({e['drapeaux']} drapeau, lu {lus_t})")
    # Son point est au nord du cadre de l'Amérique du Nord : le monde.
    verifier_situation(p, defauts, "fiche du Groenland", "monde:0", False)
    capturer("153-fiche-territoire")
    p.js("history.back()")
    attendre_fiche(p, lambda e: not e["ouverte"], "Groenland fermé")
    e = ouvrir_fiche(p, "HKG", defauts, "Hong Kong")
    dire(f"  fiche de Hong Kong : barre {e['faits']!r}, lignes {e['lignes']}")
    if [l.split(" ")[0] for l in e["lignes"]] != ["Habitants", "Monnaie", "Heure", "Continent"]:
        defauts.append(f"fiche de Hong Kong : lignes Habitants, Monnaie, Heure locale, Continent attendues ({e['lignes']})")
    p.js("history.back()")
    attendre_fiche(p, lambda e: not e["ouverte"], "Hong Kong fermé")
    # Une zone contestée (D57 a) : le statut de la barre, le continent seul (habitants à relire), ni drapeau.
    for ident, nom_z in (("ESH", "Sahara occidental"), ("NE_BRT", "Bir Tawil")):
        e = ouvrir_fiche(p, ident, defauts, nom_z)
        dire(f"  fiche de {nom_z} : barre {e['faits']!r}, statut {e['statut']!r}, lignes {e['lignes']}, {e['drapeaux']} drapeau")
        if e["statut"] != "statut contesté" or [l.split(" ")[0] for l in e["lignes"]] != ["Continent"] or e["drapeaux"] or e["faits"]:
            defauts.append(f"fiche de {nom_z} : statut contesté, continent seul, ni drapeau ni ligne de faits attendus ({e})")
        if ident == "ESH":
            verifier_situation(p, defauts, f"fiche de {nom_z}", "continent:Africa", True)
            capturer("156-fiche-zone")
        p.js("history.back()")
        attendre_fiche(p, lambda e: not e["ouverte"], f"{nom_z} fermé")
    e = ouvrir_fiche(p, "ATA", defauts, "Antarctique")
    lien = p.js("(document.querySelector('#fiche-lieu .fiche-wikipedia') || {}).href || null")
    dire(f"  fiche de l'Antarctique : statut {e['statut']!r}, lignes {e['lignes']}, lien {lien}")
    if e["statut"] != "continent" or [l.split(" ")[0] for l in e["lignes"]] != ["Continent"] or e["drapeaux"] or not (lien or "").endswith("/Antarctique"):
        defauts.append(f"fiche de l'Antarctique : statut « continent », continent seul, lien Wikipédia, sans drapeau attendus ({e}, {lien})")
    verifier_situation(p, defauts, "fiche de l'Antarctique", "monde:0", False)
    capturer("157-fiche-antarctique")
    p.js("history.back()")
    attendre_fiche(p, lambda e: not e["ouverte"], "Antarctique fermé")

    # Une mer (lot F4) : l'eau touchée, ses fiches lues à ce toucher (avec la couche légère), puis le chevron.
    p.js("window.terramemo.carte.zoomer({k: 1, x: 0, y: 0})")
    p.pause(300)
    eau = p.js("""(() => { const c = window.terramemo.carte, r = c.rect(), b = document.getElementById('barre-carte').getBoundingClientRect();
        const x = r.x + r.largeur / 2;
        for (let y = r.y + r.hauteur * 0.55; y < Math.min(b.top, r.y + r.hauteur) - 6; y += 6) if (!c.pick(x, y)) return {x, y};
        for (let y = r.y + r.hauteur * 0.45; y > r.y + 6; y -= 6) if (!c.pick(x, y)) return {x, y};
        return null; })()""")
    if not eau:
        defauts.append("une mer : aucun point d'eau trouvé à l'écran")
    else:
        avant_mers = [n for n in ressources_fiches(p) if "fiches-mers" in n]
        if avant_mers:
            defauts.append(f"fiches des mers lues avant le premier toucher en mer : {avant_mers}")
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        p.toucher(eau["x"], eau["y"])
        e = attendre_fiche(p, lambda e: e["chevron"] and (e["barre"] or "").islower(), "une mer touchée")
        lus = sorted({n.split("/")[-1] for n in ressources_fiches(p) if "fiches-mers" in n})
        dire(f"  une mer touchée : {texte(p, '#barre-carte .barre-nom')!r} ({e['barre']}), faits {e['faits']!r}, chevron {e['chevron']}, lu {lus}")
        if not e["chevron"]:
            defauts.append(f"une mer touchée : pas de chevron ({e})")
        if lus != sorted(FICHIERS_GEO_FICHES_MERS):
            defauts.append(f"une mer touchée : {lus} lus au lieu de {', '.join(FICHIERS_GEO_FICHES_MERS)}")

        # La Méditerranée (la couche fine est posée depuis ce toucher) : « océan Atlantique » dans la barre (la
        # superficie attend sa relecture), puis sa fiche.
        p.js('window.terramemo.carte.zoomerSur("medit")')
        attendre_fin_vol(p)
        p.pause(PAUSE_AVANT_TOUCHER_MS)
        # Sur le site en ligne, le cadrage se perd parfois (vu le 18/11 : la carte restée sur l'Europe entière,
        # aucun point juste hors des pays) : on recadre et on recommence, trois fois au plus.
        for essai in range(3):
            pt = position_mer(p, "medit", "#barre-carte", sans_pays=True)
            if pt:
                break
            p.js('window.terramemo.carte.zoomerSur("medit")')
            attendre_fin_vol(p)
            p.pause(PAUSE_AVANT_TOUCHER_MS)
        if not pt:
            diag = p.js("""(() => { const c = window.terramemo.carte, q = c.ecran("medit"), r = c.rect();
              let n = null; try { n = q && c.noter("medit", q.x, q.y); } catch (e) { n = String(e); }
              const ids = {};
              for (let y = r.y + 6; y < r.y + r.hauteur; y += 12) for (let x = r.x + 6; x < r.x + r.largeur; x += 12) {
                let j = false; try { j = c.noter("medit", x, y).juste; } catch (e) {}
                if (j) { const k = c.pick(x, y); const i = k ? k.id + "/" + k.via : "rien"; ids[i] = (ids[i] || 0) + 1; } }
              return {q, rect: r, noter: n, pick: q && c.pick(q.x, q.y), justes: ids}; })()""")
            defauts.append(f"la Méditerranée : pas de point où la toucher au-dessus de la barre ({diag})")
        else:
            p.toucher(pt["x"], pt["y"])
            e = attendre_fiche(p, lambda e: e["barre"] == "medit" and e["chevron"], "Méditerranée touchée")
            faits = re.sub(r"\s+", " ", e["faits"])
            dire(f"  Méditerranée touchée : faits {faits!r}, chevron {e['chevron']}")
            if faits != "océan Atlantique" or not e["chevron"]:
                defauts.append(f"Méditerranée touchée : ligne de faits « océan Atlantique » (la superficie tue jusqu'à sa relecture) et chevron attendus ({e})")
            toucher_element(p, "#barre-fiche")
            e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "medit", "fiche de la Méditerranée")
            dire(f"  fiche de la Méditerranée : {e['titre']!r}, statut {e['statut']!r}, lignes {e['lignes']}, boutons {e['voisins']}, focus {e['focus']}")
            if e["titre"] != "mer Méditerranée" or e["statut"] != "mer intérieure" or e["lignes"] != ["Océan océan Atlantique"] or e["voisins"] != ["atlant"] or e["drapeaux"]:
                defauts.append(f"fiche de la Méditerranée : « mer intérieure », la ligne « Océan » et son bouton seuls, sans drapeau ni riverains attendus ({e})")
            verifier_situation(p, defauts, "fiche de la Méditerranée", "mer:medit", False)
            capturer("158-fiche-mer")
            # L'océan se touche comme un voisin : la fiche de l'Atlantique, « ‹ » montré ; la carte vole dessous.
            toucher_element(p, '#fiche-lieu .fiche-liens [data-id="atlant"]')
            e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "atlant", "fiche de l'Atlantique")
            dire(f"  fiche de l'Atlantique : statut {e['statut']!r}, lignes {e['lignes']}, ‹ {e['avant']}, focus {e['focus']}")
            if e["titre"] != "océan Atlantique" or e["statut"] != "océan" or e["lignes"] or e["voisins"] or not e["avant"] or e["focus"] != "fiche-titre":
                defauts.append(f"fiche de l'Atlantique (son océan touché) : « océan », aucune ligne, « ‹ », focus au titre attendus ({e})")
            attendre_fin_vol(p)
            verifier_situation(p, defauts, "fiche de l'Atlantique", "monde:0", False)
            capturer("159-fiche-ocean")
            toucher_element(p, "#fiche-lieu .fiche-avant")
            e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "medit", "« ‹ » vers la Méditerranée")
            if e["id"] != "medit":
                defauts.append(f"« ‹ » depuis l'Atlantique : la Méditerranée attendue ({e})")
            toucher_element(p, "#fiche-lieu .croix")
            attendre_fiche(p, lambda e: not e["ouverte"], "fiche de la mer fermée")

        # L'Adriatique, par la recherche : sa mère se touche ; la mer des Sargasses, « mer sans côte ».
        for ident, nom_m, statut, lignes, mere in (
            ("adriat", "mer Adriatique", "mer", ["Fait partie de mer Méditerranée", "Océan océan Atlantique"], "medit"),
            ("sargasse", "mer des Sargasses", "mer sans côte", ["Océan océan Atlantique"], None),
        ):
            p.js('document.getElementById("recherche-champ").focus()')
            p.cdp("Input.insertText", text=nom_m)
            attendre_visible(p, f'#recherche-liste [data-terrain="monde"][data-id="{ident}"]')
            cliquer(p, f'#recherche-liste [data-terrain="monde"][data-id="{ident}"]')
            e = attendre_fiche(p, lambda e, i=ident: e["barre"] == i and e["chevron"], f"{nom_m} montrée")
            attendre_fin_vol(p)
            toucher_element(p, "#barre-fiche")
            e = attendre_fiche(p, lambda e, i=ident: e["ouverte"] and e["id"] == i, f"fiche de {nom_m}")
            dire(f"  fiche de {nom_m} : statut {e['statut']!r}, lignes {e['lignes']}")
            if e["statut"] != statut or e["lignes"] != lignes:
                defauts.append(f"fiche de {nom_m} : statut « {statut} » et lignes {lignes} attendus ({e})")
            if mere:
                toucher_element(p, f'#fiche-lieu .fiche-liens [data-id="{mere}"]')
                e = attendre_fiche(p, lambda e, m=mere: e["ouverte"] and e["id"] == m, f"mère de {nom_m}")
                if e["id"] != mere:
                    defauts.append(f"fiche de {nom_m} : sa mère touchée n'ouvre pas sa fiche ({e})")
            toucher_element(p, "#fiche-lieu .croix")
            attendre_fiche(p, lambda e: not e["ouverte"], f"{nom_m} fermée")
    # L'île (lot F5) : Saint-Denis par la recherche ; les fiches des communes lues à ce moment, jamais avant ; la
    # barre « 156 000 hab. » et son chevron (la fiche passe sous la mention de l'IGN : capture 160).
    fiches_ile = "performance.getEntriesByType('resource').map(r => r.name.split('?')[0]).filter(n => /\\/geo\\/reunion\\/fiches/.test(n)).map(n => n.split('/').pop())"
    avant_ile = p.js(fiches_ile)
    if avant_ile:
        defauts.append(f"fiches des communes lues avant le premier lieu de l'île : {avant_ile}")
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text="saint-denis")
    attendre_visible(p, '#recherche-liste [data-terrain="reunion"][data-id="97411"]')
    cliquer(p, '#recherche-liste [data-terrain="reunion"][data-id="97411"]')
    fin = time.monotonic() + 10
    while p.js("window.terramemo.terrain()") != "reunion" and time.monotonic() < fin:
        p.pause(100)
    attendre_fin_vol(p, "ile")
    e = attendre_fiche(p, lambda e: e["barre"] == "97411" and e["chevron"], "Saint-Denis montrée")
    lus = sorted(set(p.js(fiches_ile)))
    faits = re.sub(r"\s+", " ", e["faits"])
    dire(f"  une commune (Saint-Denis) : faits {faits!r}, chevron {e['chevron']}, lu {lus}")
    if faits != "156 000 hab." or not e["chevron"]:
        defauts.append(f"Saint-Denis montrée : ligne de faits « 156 000 hab. » et chevron attendus ({e})")
    if lus != sorted(FICHIERS_GEO_FICHES_COMMUNES):
        defauts.append(f"Saint-Denis montrée : {lus} lus au lieu des fiches des communes ({', '.join(FICHIERS_GEO_FICHES_COMMUNES)})")
    capturer("154-fiche-ile")
    # Saint-Pierre touché sur la carte de l'île, puis sa fiche (critère de fin du lot F5, § 8).
    p.js('window.terramemo.ile.zoomerSur("97416")')
    attendre_fin_vol(p, "ile")
    p.pause(PAUSE_AVANT_TOUCHER_MS)
    pt = position_visible(p, "97416", "#barre-carte")
    if not pt:
        defauts.append("Saint-Pierre : pas de point où le toucher au-dessus de la barre")
    else:
        p.toucher(pt["x"], pt["y"])
        e = attendre_fiche(p, lambda e: e["barre"] == "97416" and e["chevron"], "Saint-Pierre touchée")
        toucher_element(p, "#barre-fiche")
        e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "97416", "fiche de Saint-Pierre")
        sources = texte(p, "#fiche-lieu .fiche-sources")
        dire(f"  fiche de Saint-Pierre : {e['titre']!r}, statut {e['statut']!r}, lignes {e['lignes']}, voisines {e['voisins']}, focus {e['focus']}, {sources!r}")
        attendues = ["Habitants 85 038 (recensement de 2023)", "Superficie 96 km²", "Intercommunalité CIVIS"]
        if e["titre"] != "Saint-Pierre" or e["statut"] or e["lignes"] != attendues or e["drapeaux"] or e["focus"] != "fiche-titre":
            defauts.append(f"fiche de Saint-Pierre : lignes {attendues} (le gentilé tu jusqu'à sa relecture), sans statut ni drapeau, focus au titre attendus ({e})")
        if e["voisins"] != ["97403", "97422", "97405", "97412", "97414"]:
            defauts.append(f"fiche de Saint-Pierre : voisines Entre-Deux, Le Tampon, Petite-Île, Saint-Joseph, Saint-Louis attendues ({e['voisins']})")
        if "IGN" not in sources or "INSEE" not in sources:
            defauts.append(f"fiche de Saint-Pierre : l'IGN et le recensement de l'INSEE dans les sources attendus ({sources!r})")
        # La fiche sous la mention de l'IGN (§ 4.2 : 40 px du haut sur l'île, comme le bilan), lue après son
        # animation (200 ms), et rien qui déborde (lignes, boutons des voisines) à la largeur de la page.
        p.pause(300)
        g = p.js("""(() => { const f = document.getElementById('fiche-lieu').getBoundingClientRect(),
            m = document.querySelector('#carte-ile .carte-credit'), r = m ? m.getBoundingClientRect() : null,
            larges = [...document.querySelectorAll('#fiche-lieu .fiche-fait, #fiche-lieu .fiche-voisin')].filter(e => e.scrollWidth > e.clientWidth + 1).length;
            return { haut: f.top, mention: r ? r.bottom : null, larges }; })()""")
        dire(f"  fiche de Saint-Pierre : haut à {g['haut']:.0f} px, mention de l'IGN jusqu'à {g['mention']} px, {g['larges']} élément(s) qui débordent")
        if g["mention"] is None:
            defauts.append("fiche de Saint-Pierre : pas de mention de l'IGN sur la carte de l'île")
        elif g["haut"] < g["mention"]:
            defauts.append(f"fiche de Saint-Pierre : elle couvre la mention de l'IGN (haut {g['haut']:.0f} < {g['mention']:.0f})")
        if g["larges"]:
            defauts.append(f"fiche de Saint-Pierre : {g['larges']} ligne(s) ou voisine(s) qui débordent")
        verifier_situation(p, defauts, "fiche de Saint-Pierre", "ile", False)
        capturer("160-fiche-commune")
        # Une voisine : sa fiche, « ‹ » montré ; la carte de l'île vole dessous (le terrain reste l'île).
        toucher_element(p, '#fiche-lieu .fiche-voisins [data-id="97422"]')
        e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "97422", "fiche du Tampon")
        attendre_fin_vol(p, "ile")
        terrain = p.js("window.terramemo.terrain()")
        dire(f"  voisine (Le Tampon) : lignes {e['lignes']}, ‹ {e['avant']}, focus {e['focus']}, terrain {terrain}, barre {e['barre']}")
        if e["titre"] != "Le Tampon" or not e["avant"] or e["focus"] != "fiche-titre" or terrain != "reunion" or "Intercommunalité CASUD" not in e["lignes"]:
            defauts.append(f"voisine de Saint-Pierre : la fiche du Tampon (CASUD), « ‹ », focus au titre, l'île gardée attendus ({e}, {terrain})")
        verifier_situation(p, defauts, "fiche du Tampon", "ile", False)
        capturer("161-fiche-commune-voisine")
        toucher_element(p, "#fiche-lieu .fiche-avant")
        e = attendre_fiche(p, lambda e: e["ouverte"] and e["id"] == "97416", "« ‹ » vers Saint-Pierre")
        if e["id"] != "97416":
            defauts.append(f"« ‹ » depuis Le Tampon : Saint-Pierre attendu ({e})")
        toucher_element(p, "#fiche-lieu .croix")
        e = attendre_fiche(p, lambda e: not e["ouverte"], "fiche de la commune fermée")
        if e["ouverte"] or e["barre"] != "97416" or p.js("window.terramemo.terrain()") != "reunion":
            defauts.append(f"« × » sur une commune : la fiche fermée, Saint-Pierre dans la barre, l'île gardée attendus ({e})")
    cliquer(p, "#carte-monde")
    p.pause(300)

    # La recherche ferme la fiche ouverte et montre son lieu dans la barre.
    e = ouvrir_fiche(p, "JPN", defauts, "Japon")
    p.js('document.getElementById("recherche-champ").focus()')
    p.cdp("Input.insertText", text="Chine")
    attendre_visible(p, '#recherche-liste [data-terrain="monde"][data-id="CHN"]')
    cliquer(p, '#recherche-liste [data-terrain="monde"][data-id="CHN"]')
    e = attendre_fiche(p, lambda e: not e["ouverte"] and e["barre"] == "CHN", "recherche")
    if e["ouverte"] or e["barre"] != "CHN":
        defauts.append(f"recherche pendant une fiche : la fiche fermée, la Chine dans la barre attendues ({e})")
    attendre_fin_vol(p)

    # Lot F8 : la carte de situation à côté du titre le plus long (Saint-Vincent-et-les-Grenadines, micro : son
    # anneau) et de son drapeau ; la Russie, dont le point est en Sibérie : le monde.
    e = ouvrir_fiche_par_recherche(p, defauts, "titre long", "Saint-Vincent", "VCT")
    if e["ouverte"]:
        e = attendre_fiche(p, lambda x: x["ouverte"] and x["drapeaux"], "drapeau de Saint-Vincent-et-les-Grenadines")
        verifier_situation(p, defauts, "fiche de Saint-Vincent-et-les-Grenadines", "continent:North America", True)
        capturer("178-situation-titre-long")
        toucher_element(p, "#fiche-lieu .croix")
        attendre_fiche(p, lambda e: not e["ouverte"], "Saint-Vincent fermée")
    e = ouvrir_fiche(p, "RUS", defauts, "Russie")
    if e["ouverte"]:
        verifier_situation(p, defauts, "fiche de la Russie", "monde:0", False)
        capturer("179-situation-russie")
        toucher_element(p, "#fiche-lieu .croix")
        attendre_fiche(p, lambda e: not e["ouverte"], "Russie fermée")

    # Le scénario de mesure (§ 6.4) : ouvrir et fermer 10 fiches, passer par 10 voisins (lot F8), sur une page
    # rechargée : la carte de situation sans rien de gardé (ses fonds et ses lieux à tracer), le pire cas.
    p.goto(base + "?mesures=0" + parametres + "#carte")
    p.attendre_carte()
    m = scenario_fiches(p, defauts)
    capturer("155-fiche-apres-scenario")
    # Lot F6 : depuis le bilan (après la mesure, qui reste sur la carte d'avant).
    ui_fiche_bilan(p, capturer, defauts)
    # Lot F7 : « Apprendre ce lieu », sur le journal du profil (neuf avec la commande fiche).
    ui_fiche_apprendre(p, capturer, defauts, base, parametres)
    return m


def commande_fiche(args):
    """ui_fiche seul, sur un profil neuf du PC (l'écran de connexion passé en invité) ; sur le téléphone
    (--cible chrome ou webview), le scénario de mesure seul, sur la page déjà ouverte de l'utilisateur."""
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    telephone = args.width < 700
    ecran = dict(TELEPHONE, largeur=args.width) if telephone else dict(PC, largeur=args.width)
    url = args.url or (URL_APK if args.cible == "webview" else URL_SITE if args.cible == "chrome" else URL_DEFAUT)
    base = url.rstrip("/") + "/"
    rendu = f"&rendu={args.rendu}" + ("&logiciel=1" if args.rendu == "webgl" else "") if args.rendu else ""
    faites, defauts = [], []
    with Session(args.cible, serie=args.serie) as s:
        s.couper_synchro(base)
        p = s.page
        if args.cible == "local":
            s.passer_accueil(base)
            p.emuler(ecran, tactile=telephone)

        def capturer(nom):
            chemin = out / f"{nom}.png"
            p.pause(350)
            p.capture(chemin)
            faites.append(chemin)

        if args.cible == "local":
            ui_fiche(p, capturer, defauts, base, rendu, telephone)
        else:
            p.goto(base + "?mesures=0#carte")
            p.attendre_carte()
            if p.js("(() => { const s = document.getElementById('accueil'); return !!s && !s.hidden; })()"):
                # Le choix de l'écran de connexion est celui de l'utilisateur (passer_accueil) : on s'arrête.
                raise RuntimeError(f"l'écran de connexion couvre la carte ({args.cible}) : à passer à la main "
                                 "sur le téléphone (compte ou « Continuer en invité »), puis relancer")
            scenario_fiches(p, defauts, verdict=True)
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures dans {out}")
    return 1 if erreurs or defauts else 0


def commande_drapeaux(args):
    """ui_drapeaux seul, sur un profil neuf : l'écran de connexion passé en invité (passer_accueil)."""
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

        ui_drapeaux(p, capturer, defauts, base, rendu, ecran, telephone)
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures dans {out}")
    return 1 if erreurs or defauts else 0


def commande_mers(args):
    """ui_mers puis ses épreuves (ui_epreuves_mers), sur un profil neuf : l'écran de connexion passé en invité (passer_accueil)."""
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

        ui_mers(p, capturer, defauts, base, rendu)
        ui_epreuves_mers(p, capturer, defauts, base, rendu)
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures dans {out}")
    return 1 if erreurs or defauts else 0


def commande_quiz(args):
    """ui_quiz seul, sur un profil neuf : l'écran de connexion passé en invité (passer_accueil)."""
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

        ui_quiz(p, capturer, defauts, base, rendu)
        erreurs = p.erreurs + p.echecs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures dans {out}")
    return 1 if erreurs or defauts else 0


def commande_lignes(args):
    """ui_lignes seul, sur un profil neuf (l'écran de connexion passé en invité)."""
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

        ui_lignes(p, capturer, defauts, base, rendu)
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
# Le corps d'essai() dans firestore.rules : fermé jusqu'au lot 6 (ouvert alors sur l'émulateur seulement), ouvert depuis.
ESSAI_FERME = re.compile(r"function essai\(\) \{\n\s*return false;\n\s*\}")
ESSAI_OUVERT = re.compile(r"function essai\(\) \{\n\s*return true;\n\s*\}")


def preparer_emulateurs():
    """Règles du dépôt avec essai() ouvert, chargées dans l'émulateur
    Firestore (jamais le vrai projet), puis base et comptes de l'émulateur
    vidés : chaque pilote part de zéro. Depuis l'ouverture des comptes à tous
    (32d4b52, #3), essai() est vrai dans le dépôt : ses règles telles quelles."""
    regles = (RACINE / "firestore.rules").read_text()
    ouvertes, n = ESSAI_FERME.subn("function essai() { return true; }", regles)
    if not n and not ESSAI_OUVERT.search(regles):
        raise RuntimeError("essai() introuvable dans firestore.rules (ni fermé ni ouvert)")
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


def pilote_aux_emulateurs(args):
    """Ce que demandent les pilotes des comptes (synchro, suppression,
    export) : le serveur de dev et les deux émulateurs lancés à part, les
    règles d'essai chargées, base et comptes vidés. Rend (out, ecran,
    telephone, base)."""
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
    return out, ecran, telephone, base


def commande_synchro(args):
    """ui_synchro : deux navigateurs au site de dev avec ?emulateurs (Vite sur
    8060, émulateurs Firestore 8062 et Auth 8063 lancés à part)."""
    out, ecran, telephone, base = pilote_aux_emulateurs(args)
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


# --- suppression et export du compte (J1b, lot 5 : pilotes ui_suppression, ui_export) ---

def emulateur(url, corps=None):
    """Une requête aux API REST d'un émulateur (127.0.0.1, jamais le vrai
    projet) en propriétaire (`Bearer owner` : les règles ne s'y appliquent
    pas) ; (code, JSON), GET sans corps, POST avec."""
    req = urllib.request.Request(url, data=None if corps is None else json.dumps(corps).encode(),
                                 method="GET" if corps is None else "POST",
                                 headers={"Authorization": "Bearer owner", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}


def en_ligne(uid):
    """Ce que les émulateurs gardent du compte `uid` : auth (le compte est
    dans Auth), profil et demande (les champs de joueurs/{uid} et de
    demandes/{uid}, valeurs simples ; None sans document), lots (le nombre
    de joueurs/{uid}/lots)."""
    docs = f"http://127.0.0.1:{PORT_FIRESTORE}/v1/projects/{PROJET_EMULATEURS}/databases/(default)/documents"

    def doc(chemin):
        code, d = emulateur(f"{docs}/{chemin}")
        if code == 404:
            return None
        if code != 200:
            raise RuntimeError(f"émulateur Firestore : {chemin} illisible ({code})")
        return {k: next(iter(v.values()), None) for k, v in (d.get("fields") or {}).items()}

    code, lots = emulateur(f"{docs}/joueurs/{uid}/lots?pageSize=300")
    if code != 200:
        raise RuntimeError(f"émulateur Firestore : lots de {uid} illisibles ({code})")
    code, auth = emulateur(f"http://127.0.0.1:{PORT_AUTH}/identitytoolkit.googleapis.com/v1/projects/"
                           f"{PROJET_EMULATEURS}/accounts:lookup", {"localId": [uid]})
    if code != 200:
        raise RuntimeError(f"émulateur Auth : compte {uid} illisible ({code})")
    return {"auth": bool(auth.get("users")), "profil": doc(f"joueurs/{uid}"), "demande": doc(f"demandes/{uid}"),
            "lots": len(lots.get("documents") or [])}


def attendre_en_ligne(p, uid, condition, quoi, delai_s=30):
    """Attend que en_ligne(uid) vérifie `condition` ; le rend (RuntimeError sinon)."""
    fin = time.monotonic() + delai_s
    while True:
        e = en_ligne(uid)
        if condition(e):
            return e
        if time.monotonic() > fin:
            raise RuntimeError(f"{quoi} : pas atteint en {delai_s} s ; en ligne = {e}")
        p.pause(500)


def attendre_texte(p, selecteur, condition, quoi, delai_s=30):
    """Attend que le texte de `selecteur` vérifie `condition` ; le rend (RuntimeError sinon)."""
    fin = time.monotonic() + delai_s
    while True:
        t = texte(p, selecteur)
        if condition(t):
            return t
        if time.monotonic() > fin:
            raise RuntimeError(f"{quoi} : {selecteur} dit {t!r} au bout de {delai_s} s")
        p.pause(200)


def choisir_pseudo(p, pseudo):
    """Vue Compte d'un compte connecté : « Choisir », le pseudo tapé comme au clavier, envoyé."""
    cliquer_apres_pause(p, "#compte-vers-pseudo")
    attendre_visible(p, "#compte-pseudo")
    p.js("(() => { const c = document.getElementById('compte-pseudo'); c.focus(); c.select(); })()")
    p.cdp("Input.insertText", text=pseudo)
    cliquer_apres_pause(p, "#compte-pseudo-ok")
    attendre_visible(p, "#compte-adresse-connectee", 30)


def confirmer_suppression(p, mdp, mot="supprimer"):
    """Le formulaire de la suppression (« Supprimer mon compte », ou sa reprise) : le mot, le mot de passe, le bouton."""
    attendre_visible(p, "#compte-supprimer-mdp")
    p.js(f"document.getElementById('compte-supprimer-mot').value = {json.dumps(mot)}; "
         f"document.getElementById('compte-supprimer-mdp').value = {json.dumps(mdp)};")
    cliquer_apres_pause(p, "#compte-supprimer-ok")


def textes_compte():
    """Les textes de la vue Compte (src/vues/textes.fr.json, clé « compte »), tels que l'appli les affiche."""
    return json.loads((RACINE / "src/vues/textes.fr.json").read_text())["compte"]


def cles_du_joueur():
    """CLES_DU_JOUEUR relevées dans src/sync/effacement.ts (ce qu'effacerJoueurLocal retire de l'appareil), pas recopiées."""
    source = (RACINE / "src/sync/effacement.ts").read_text()
    m = re.search(r"export const CLES_DU_JOUEUR[^=]*=\s*\[(.*?)\]", source, re.S)
    cles = re.findall(r"'([^']+)'", m.group(1)) if m else []
    if not cles:
        raise RuntimeError("CLES_DU_JOUEUR introuvables dans src/sync/effacement.ts")
    return cles


def textes_visibles(p, textes):
    """Ceux de `textes` qu'un élément affiché de la page (dans la mise en page, pas caché) contient."""
    return p.js(f"""(() => {{
        const cherches = {json.dumps(textes)};
        const vus = new Set();
        for (const e of document.body.querySelectorAll('*')) {{
            if (!e.getClientRects().length || e.closest('[hidden]')) continue;
            const s = getComputedStyle(e);
            if (s.visibility === 'hidden' || s.display === 'none') continue;
            const t = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
            for (const c of cherches) if (t.includes(c)) vus.add(c);
        }}
        return [...vus];
    }})()""") or []


def ui_suppression(p, capturer, defauts, base):
    """La suppression du compte comme un joueur (étude du J1b, § 7.1), au
    site de dev avec ?emulateurs, vérifiée aux émulateurs (API REST en
    propriétaire) et sur l'appareil :
    1. un compte e-mail créé, un pseudo choisi (⚙ › Compte), la Révision du
       jour jouée et partie en lots ;
    2. « Supprimer mon compte » : le texte du classement nomme le pseudo
       (`56`) ; un mot de passe faux est refusé (`57`) et rien n'est
       commencé (ni drapeau, ni pierre tombale, ni demande, lots en place) ;
    3. le bon mot de passe, la requête de deleteUser coupée
       (Network.setBlockedURLs, le réseau perdu entre les lots supprimés et
       Auth) : « Suppression inachevée : reprendre ? » (`58`), pierre tombale
       et demande posées, lots partis, le compte encore dans Auth ;
    4. l'appli rouverte : aucun texte ni élément de la suppression
       inachevée affiché avant ⚙ › Compte, l'écran dans ⚙ › Compte (`59`),
       « Annuler la suppression » refusé (déjà engagée), puis la reprise
       (« Supprimer », casse ignorée) jusqu'à « Compte supprimé. » (`62`) :
       compte parti de Auth, pierre tombale seule (v, maj, supprime),
       demande au pseudo, aucun lot, appareil vidé (journal, uid, toutes les
       CLES_DU_JOUEUR de src/sync/effacement.ts) ; rouverte, l'écran de connexion de la
       première ouverture (`63`)."""
    url = base + "?emulateurs&mesures=0"
    marque = int(time.time())
    adresse, mdp, pseudo = f"pilote{marque}@exemple.fr", "motdepasse-pilote", f"Pilote{marque % 100000}"

    def defaut(quoi):
        defauts.append(f"suppression : {quoi}")

    def comptes_etat():
        return (p.js("window.terramemo.comptes()") or {}).get("etat") or {}

    # 1. Le compte, son pseudo, une séance en ligne.
    p.goto(url + "#carte")
    p.attendre_carte()
    formulaire_compte(p, "creer", adresse, mdp)
    attendre_visible(p, "#compte-adresse-connectee", 30)
    uid = attendre_synchro(p, lambda r: r.get("uid"), "compte dans la session")["uid"]
    choisir_pseudo(p, pseudo)
    attendre_en_ligne(p, uid, lambda e: (e["profil"] or {}).get("pseudo") == pseudo, "pseudo au profil en ligne")
    ligne, desactivee = revision_du_jour(p)
    if desactivee:
        raise RuntimeError(f"Révision du jour désactivée ({ligne!r})")
    cliquer_apres_pause(p, "#jouer-revision")
    n = jouer_seance(p, capturer, defauts, "Révision du jour, avant la suppression")
    cliquer_apres_pause(p, "#seance-carte")
    attendre_synchro(p, lambda r: r["evenements"] == n and (r.get("lots") or {}).get("attente") == 0, "séance envoyée")
    avant = attendre_en_ligne(p, uid, lambda e: e["lots"] >= 1, "lots en ligne")
    dire(f"  compte {adresse} ({uid}), pseudo {pseudo}, {n} réponses, {avant['lots']} lot(s) en ligne")

    # 2. « Supprimer mon compte », un mot de passe faux d'abord.
    p.js('location.hash = "#compte"')
    attendre_visible(p, "#compte-vers-supprimer", 30)
    cliquer_apres_pause(p, "#compte-vers-supprimer")
    attendre_visible(p, "#compte-supprimer-classement", 20)
    classement = texte(p, "#compte-supprimer-classement")
    if pseudo not in classement:
        defaut(f"le texte du classement ne nomme pas le pseudo {pseudo} : {classement!r}")
    capturer("56-supprimer-confirmation")
    confirmer_suppression(p, "mauvais-mot-de-passe")
    erreur = attendre_texte(p, "#compte-erreur", lambda t: t.strip(), "mot de passe faux")
    dire(f"  mot de passe faux : {erreur!r}")
    if "Mot de passe incorrect" not in erreur:
        defaut(f"mot de passe faux sans « Mot de passe incorrect » : {erreur!r}")
    capturer("57-mot-de-passe-faux")
    ses = synchro_de(p).get("session") or {}
    e = en_ligne(uid)
    if ses.get("suppression") or not e["auth"] or (e["profil"] or {}).get("supprime") or e["demande"] or e["lots"] != avant["lots"]:
        defaut(f"mot de passe faux, mais la suppression a commencé : drapeau {ses.get('suppression')!r}, en ligne {e}")

    # 3. Le bon mot de passe, le réseau coupé au moment de deleteUser (les lots déjà supprimés).
    p.cdp("Network.setBlockedURLs", urls=["*accounts:delete*"])
    try:
        confirmer_suppression(p, mdp)
        attendre_visible(p, "#compte-suppression-inachevee", 60)
        erreur = attendre_texte(p, "#compte-erreur", lambda t: t.strip(), "erreur de la suppression coupée")
    finally:
        p.cdp("Network.setBlockedURLs", urls=[])
    dire(f"  coupée avant deleteUser : {texte(p, '#compte-suppression-inachevee')!r}, {erreur!r}")
    # La requête de deleteUser bloquée échoue comme un réseau perdu : auth/network-request-failed (src/sync/erreurs.ts).
    attendu = textes_compte()["erreurs"]["auth/network-request-failed"]
    if attendu not in erreur:
        defaut(f"coupée avant deleteUser : erreur sans « {attendu} » : {erreur!r}")
    capturer("58-suppression-inachevee")
    e = en_ligne(uid)
    dire(f"  en ligne : {e}")
    if not e["auth"] or not (e["profil"] or {}).get("supprime") or (e["demande"] or {}).get("pseudo") != pseudo or e["lots"]:
        defaut(f"coupée avant deleteUser : en ligne {e} (attendu : compte dans Auth, pierre tombale, demande au pseudo {pseudo}, aucun lot)")
    ses = synchro_de(p).get("session") or {}
    etat = comptes_etat()
    if ses.get("suppression") != uid or etat.get("etat") != "suppression" or not etat.get("connecte"):
        defaut(f"coupée avant deleteUser : drapeau {ses.get('suppression')!r}, état {etat}")

    # 4. L'appli rouverte : l'écran dans ⚙ › Compte, l'annulation refusée, la reprise jusqu'au bout.
    p.goto(url + "&rouvert=1#carte")
    p.attendre_carte()
    p.pause(1500)
    # § 7.1 : pas d'avis à l'ouverture de l'appli, l'écran n'est que dans ⚙ › Compte. (#accueil ne dit rien ici :
    # le choix de l'écran de connexion, posé par passer_accueil, le tient fermé.)
    T = textes_compte()
    avis = textes_visibles(p, [T["suppression_inachevee"], T["en_suppression"], T["erreurs"]["terramemo/suppression-inachevee"]])
    ids = p.js("[...document.querySelectorAll('[id$=\"suppression-inachevee\"]')].filter((e) => e.getClientRects().length && !e.closest('[hidden]')).map((e) => e.id)")
    if avis or ids:
        defaut(f"un avis à l'ouverture pendant la suppression inachevée (attendu : rien avant ⚙ › Compte) : {avis} {ids}")
    p.js('location.hash = "#compte"')
    attendre_visible(p, "#compte-suppression-inachevee", 30)
    capturer("59-suppression-rouverte")
    cliquer_apres_pause(p, "#compte-suppression-annuler")
    erreur = attendre_texte(p, "#compte-erreur", lambda t: t.strip(), "« Annuler la suppression » après la pierre tombale")
    dire(f"  « Annuler la suppression » : {erreur!r}")
    if "déjà engagée" not in erreur:
        defaut(f"« Annuler la suppression » après la pierre tombale sans « déjà engagée » : {erreur!r}")
    if (synchro_de(p).get("session") or {}).get("suppression") != uid:
        defaut("« Annuler la suppression » a levé le drapeau après la pierre tombale")
    confirmer_suppression(p, mdp, mot="Supprimer")
    message = attendre_texte(p, "#compte-message", lambda t: "Compte supprimé" in t or texte(p, "#compte-erreur").strip(),
                             "reprise de la suppression", 60)
    if "Compte supprimé" not in message:
        raise RuntimeError(f"reprise de la suppression : {texte(p, '#compte-erreur')!r}")
    capturer("62-compte-supprime")
    e = en_ligne(uid)
    dire(f"  supprimé, en ligne : {e}")
    if e["auth"]:
        defaut("le compte est encore dans Auth")
    tombe = e["profil"] or {}
    if tombe.get("supprime") is not True or set(tombe) - {"v", "maj", "supprime"}:
        defaut(f"profil sans pierre tombale seule : {tombe}")
    if (e["demande"] or {}).get("pseudo") != pseudo:
        defaut(f"demande de retrait sans le pseudo {pseudo} : {e['demande']}")
    if e["lots"]:
        defaut(f"{e['lots']} lot(s) encore en ligne")
    r = synchro_de(p)
    ses = r.get("session") or {}
    cles = cles_du_joueur()
    local = p.js(f"Object.fromEntries({json.dumps(cles)}.map((k) => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null))")
    etat = comptes_etat()
    dire(f"  appareil : {r['evenements']} événements, uid {r['uid']}, état {etat.get('etat')}, "
         f"{len(cles)} clés du joueur, restées : {local}")
    if r["evenements"] or r["uid"] or ses.get("suppression") or ses.get("effacement") or local or etat.get("etat") != "invite":
        defaut(f"appareil pas vidé : {r['evenements']} événements, uid {r['uid']}, session {ses}, clés du joueur restées {local}, état {etat}")
    p.goto(url + "&apres=1#carte")
    p.attendre_carte()
    attendre_visible(p, "#accueil", 20)
    capturer("63-accueil-apres-suppression")


def commande_suppression(args):
    """ui_suppression : un navigateur au site de dev avec ?emulateurs (Vite
    sur 8060, émulateurs Firestore 8062 et Auth 8063 lancés à part)."""
    out, ecran, telephone, base = pilote_aux_emulateurs(args)
    faites, defauts = [], []
    with Session("local") as s:
        p = s.page
        s.passer_accueil(base)
        p.emuler(ecran, tactile=telephone)

        def capturer(nom):
            chemin = out / f"{nom}.png"
            p.pause(350)
            p.capture(chemin)
            faites.append(chemin)

        ui_suppression(p, capturer, defauts, base)
        erreurs = p.erreurs
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures dans {out}")
    dire("  ui_suppression : " + ("ÉCHEC" if erreurs or defauts else "OK, compte supprimé après une reprise"))
    return 1 if erreurs or defauts else 0


def exporter(p, dossier, delai_s=60):
    """« Exporter mes données » (vue Compte), le fichier reçu par le
    navigateur dans `dossier` (Browser.setDownloadBehavior) : (message de la
    vue, chemin, contenu lu)."""
    dossier.mkdir(parents=True, exist_ok=True)
    for f in dossier.iterdir():
        f.unlink()
    p.nav.commande("Browser.setDownloadBehavior", behavior="allow", downloadPath=str(dossier))
    p.js('location.hash = "#compte"')
    attendre_visible(p, "#compte-exporter", 30)
    cliquer_apres_pause(p, "#compte-exporter")
    message = attendre_texte(p, "#compte-message", lambda t: "Export prêt" in t or texte(p, "#compte-erreur").strip(),
                             "export", delai_s)
    if "Export prêt" not in message:
        raise RuntimeError(f"export refusé : {texte(p, '#compte-erreur')!r}")
    fin = time.monotonic() + delai_s
    while True:
        fichiers = sorted(dossier.iterdir())
        if fichiers and all(f.suffix == ".json" for f in fichiers):
            break
        if time.monotonic() > fin:
            raise RuntimeError(f"export : aucun fichier .json fini dans {dossier} en {delai_s} s ({[f.name for f in fichiers]})")
        p.pause(200)
    if len(fichiers) != 1:
        raise RuntimeError(f"export : {len(fichiers)} fichiers dans {dossier}")
    return message, fichiers[0], json.loads(fichiers[0].read_text())


def verifier_export(p, defauts, quoi, message, fichier, x, compte=None):
    """L'export face au journal de la page (lire_journal) : même nombre
    d'événements, mêmes ids, aucun que refuse probleme() de
    src/srs/journal.ts ; le format, le nom ; `compte` (uid, adresse) : la
    lecture complète, sinon aucun compte. Rend le nombre d'événements."""
    def defaut(d):
        defauts.append(f"export {quoi} : {d}")

    _, journal = lire_journal(p)
    ev = x.get("evenements") or []
    pb = problemes_journal(ev)
    dire(f"  export {quoi} : {fichier.name}, {len(ev)} événements (journal de la page : {len(journal)}), "
         f"{len(pb)} invalide(s), {message!r}")
    if not re.fullmatch(r"terramemo-\d{4}-\d{2}-\d{2}\.json", fichier.name):
        defaut(f"nom du fichier : {fichier.name}")
    if x.get("format") != "terramemo-export" or x.get("v") != 1:
        defaut(f"format {x.get('format')!r}, v {x.get('v')!r}")
    if len(ev) != len(journal) or sorted(e.get("id") for e in ev) != sorted(e.get("id") for e in journal):
        defaut(f"{len(ev)} événements dans le fichier, {len(journal)} au journal de la page (ou d'autres ids)")
    if pb:
        defaut(f"{len(pb)} événement(s) invalide(s) : {pb[:3]}")
    if not ev:
        defaut("aucun événement")
    if compte:
        c = x.get("compte") or {}
        if c.get("uid") != compte["uid"] or c.get("adresse") != compte["adresse"] or c.get("fournisseurs") != ["password"]:
            defaut(f"compte {c} (attendu {compte['uid']}, {compte['adresse']}, password)")
        if (x.get("lecture") or {}).get("complete") is not True:
            defaut(f"lecture {x.get('lecture')} : des séances en ligne peuvent manquer")
        if "manquer" in message or "partiel" in message:
            defaut(f"la vue dit l'export partiel : {message!r}")
    elif "compte" in x or "lecture" in x:
        defaut(f"un invité exporte un compte : {x.get('compte')}, {x.get('lecture')}")
    return len(ev)


def ui_export(sur_un_appareil, defauts, base, out):
    """L'export JSON (étude du J1b, § 7.2) au site de dev avec ?emulateurs,
    chaque fichier reçu du navigateur vérifié par verifier_export :
    appareil 1, l'invité joue la Révision du jour et exporte (`65`, sans
    compte), crée un compte (ses progrès partent en lots), exporte de
    nouveau (`66`, son compte, lecture complète) ; puis un appareil neuf
    (profil neuf, l'un après l'autre : un seul chromium) s'y connecte et
    exporte (`67`) : les mêmes événements, lus en ligne.
    `sur_un_appareil(faire)` ouvre un navigateur et rend faire(p, capturer)."""
    url = base + "?emulateurs&mesures=0"
    adresse, mdp = f"pilote{int(time.time())}@exemple.fr", "motdepasse-pilote"
    ids = {}

    def appareil1(p, capturer):
        p.goto(url + "#carte")
        p.attendre_carte()
        ligne, desactivee = revision_du_jour(p)
        if desactivee:
            raise RuntimeError(f"Révision du jour désactivée ({ligne!r})")
        cliquer_apres_pause(p, "#jouer-revision")
        n = jouer_seance(p, capturer, defauts, "Révision du jour de l'invité, avant l'export")
        cliquer_apres_pause(p, "#seance-carte")
        attendre_synchro(p, lambda r: r["evenements"] == n, "séance au journal")
        message, fichier, x = exporter(p, out / "export-invite")
        capturer("65-export-invite")
        verifier_export(p, defauts, "de l'invité", message, fichier, x)
        formulaire_compte(p, "creer", adresse, mdp)
        attendre_visible(p, "#compte-adresse-connectee", 30)
        uid = attendre_synchro(p, lambda r: r.get("uid") and (r.get("lots") or {}).get("attente") == 0
                               and r["evenements"] == n, "compte créé, séance envoyée")["uid"]
        ids["uid"] = uid
        message, fichier, x = exporter(p, out / "export-compte")
        capturer("66-export-compte")
        verifier_export(p, defauts, "du compte", message, fichier, x, {"uid": uid, "adresse": adresse})
        ids["evenements"] = sorted(e["id"] for e in x["evenements"])

    def appareil2(p, capturer):
        p.goto(url + "#carte")
        p.attendre_carte()
        formulaire_compte(p, "connecter", adresse, mdp)
        attendre_visible(p, "#compte-adresse-connectee", 30)
        message, fichier, x = exporter(p, out / "export-appareil-neuf")
        capturer("67-export-appareil-neuf")
        verifier_export(p, defauts, "d'un appareil neuf", message, fichier, x, {"uid": ids["uid"], "adresse": adresse})
        if sorted(e["id"] for e in x["evenements"]) != ids["evenements"]:
            defauts.append(f"export d'un appareil neuf : {len(x['evenements'])} événements, pas ceux de l'appareil 1 "
                           f"({len(ids['evenements'])})")

    sur_un_appareil(appareil1)
    sur_un_appareil(appareil2)


def commande_export(args):
    """ui_export : deux navigateurs l'un après l'autre au site de dev avec
    ?emulateurs (Vite sur 8060, émulateurs Firestore 8062 et Auth 8063
    lancés à part) ; les fichiers exportés dans --out."""
    out, ecran, telephone, base = pilote_aux_emulateurs(args)
    faites, defauts, erreurs = [], [], []

    def sur_un_appareil(faire):
        with Session("local") as s:
            p = s.page
            s.passer_accueil(base)
            p.emuler(ecran, tactile=telephone)

            def capturer(nom):
                chemin = out / f"{nom}.png"
                p.pause(350)
                p.capture(chemin)
                faites.append(chemin)

            try:
                return faire(p, capturer)
            finally:
                erreurs.extend(p.erreurs)

    ui_export(sur_un_appareil, defauts, base, out)
    for e in erreurs:
        dire(f"  erreur : {e}")
    for d in defauts:
        dire(f"  DÉFAUT : {d}")
    dire(f"  {len(faites)} captures et les fichiers exportés dans {out}")
    dire("  ui_export : " + ("ÉCHEC" if erreurs or defauts else "OK, chaque export égal au journal de la page"))
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
# service_workers (le service worker du site, #22, et le cache de sa
# version : sans eux, la répétition 1 sortirait du cache d'une visite
# d'avant ; vérifiés vides ensuite, JS_RESTES_SW), shader_cache (shaders compilés gardés sur disque par le
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


# Ce qui reste du service worker après le vidage : [enregistrements, caches du site].
JS_RESTES_SW = ("(async () => [('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0, "
                "typeof caches === 'undefined' ? 0 : (await caches.keys()).filter((n) => n.startsWith('terramemo-')).length])()")


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
        restes = p.js(JS_RESTES_SW) or [0, 0]
        if any(restes):
            raise RuntimeError(f"service worker ({restes[0]}) ou cache du site ({restes[1]}) resté après Storage.clearDataForOrigin")
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
    # La carte de la mémoire « Mers » gardée sur l'appareil (choisie à la main, ou ui_mers interrompu) : sans
    # pastilles, les touchers de MCO, VAT, MLT… n'auraient plus de cible et le dessin ne serait plus le même.
    # ?mers=demo et ?teintes=demo coupent la carte de la mémoire ; ailleurs (?mer= compris), le choix est celui
    # de l'utilisateur : rien n'y touche, comme pour l'écran de connexion.
    demo = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    if (demo.get("mers") != ["demo"] and demo.get("teintes") != ["demo"]
            and page.js(f"localStorage.getItem({json.dumps(CLE_SUJET_MEMOIRE_MONDE)})") == "mers"):
        raise RuntimeError("carte de la mémoire sous « Mers » (pastilles cachées) : choisir Pays dans sa légende "
                           "sur l'appareil, puis relancer")
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
        # Démarrage à froid d'abord : attachée tout de suite, la session voyait la WebView
        # recharger sa page et fermer le WebSocket avant le retrait (drapeau resté posé à
        # chacune des trois installations du 15/11, retiré par le sauver_journal suivant).
        # Puis une seconde session relit le drapeau, et le cycle est refait s'il est resté.
        adb(args.serie, "shell", "am", "start", "-n", f"{APPID}/.MainActivity", verifier=False)
        time.sleep(DEMARRAGE_APRES_INSTALLATION_S)
        cle = json.dumps(DRAPEAU_SANS_SYNCHRO)
        reste, erreur = True, None
        for _ in range(3):
            try:
                with Session("webview", serie=args.serie) as s:
                    s.couper_synchro(URL_APK)
                with Session("webview", serie=args.serie) as s:
                    reste = s.page.js(f"localStorage.getItem({cle})", delai=10) is not None
            except RuntimeError as e:
                erreur = e
                time.sleep(3)
                continue
            if not reste:
                break
            time.sleep(3)
        if reste:
            dire(f"ATTENTION : appli installée, drapeau {DRAPEAU_SANS_SYNCHRO} "
                 + (f"non vérifié ({erreur})" if erreur else "resté posé après trois essais")
                 + f" : relancer sauver_journal pour le retirer ({AIDE_USB})")
        else:
            dire(f"appli relancée : {DRAPEAU_SANS_SYNCHRO} absent, synchro de l'utilisateur rendue")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="commande", required=True)

    s = sub.add_parser("serve", help="Vite sur le port 8060, au premier plan")
    s.add_argument("--lan", action="store_true", help="écoute aussi sur le réseau local (--host 0.0.0.0)")
    s.add_argument("--preview", action="store_true", help="construit puis sert le build (vite preview)")
    s.add_argument("--sortie", default="/tmp/terramemo-preview", help="dossier du build de --preview (pas dist/)")

    s = sub.add_parser("smoke", help="page, /geo/*.json, rien de l'île, des capitales, des drapeaux, des mers, du quiz ni des fiches au premier affichage, carte peinte (canvas, SVG, webgl)")
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

    s = sub.add_parser("drapeaux", help="le sujet Drapeaux seul (ui_drapeaux) : Jouer, Trouver, Reconnaître à 375 px, Apprendre, carte de la mémoire")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), help="rendu de la carte du monde")

    s = sub.add_parser("mers", help="le sujet Océans et mers seul (ui_mers, ui_epreuves_mers) : Jouer, l'accueil (couche légère), la recherche, Trouver, Reconnaître, Apprendre, carte de la mémoire, puis Classé › Océans et mers (un Sans faute joué jusqu'à sa fin)")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), help="rendu de la carte du monde")

    s = sub.add_parser("fiche", help="la fiche d'un lieu seule (ui_fiche, aussi dans ui) : barre, fiche, voisins, retours, voile, Échap, ⚙, "
                                     "territoire, mer, île, scénario de mesure, depuis un bilan (lot F6), « Apprendre ce lieu » (lot F7 ; le lendemain par ?horloge=1 : serveur de dev) ; --cible chrome|webview : le scénario seul, sur le téléphone")
    s.add_argument("--url", help=f"défaut : {URL_DEFAUT} (chrome : {URL_SITE} ; webview : {URL_APK})")
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), help="rendu de la carte du monde")
    s.add_argument("--cible", choices=("local", "chrome", "webview"), default="local")
    s.add_argument("--serie", help="numéro de série adb si plusieurs appareils")

    s = sub.add_parser("quiz", help="le quiz général seul (ui_quiz, aussi dans ui) : #jouer, Quiz général, Facile, 20 questions, bilan, record, Rejouer, Autre difficulté, retour arrière")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), help="rendu de la carte du monde")

    s = sub.add_parser("lignes", help="les lignes de repère seules (ui_lignes, aussi dans ui) : ⚙, choix gardé, ?lignes=tout, carte tournée, une partie, l'île")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")
    s.add_argument("--rendu", choices=("g", "css", "canvas", "webgl"), help="rendu de la carte du monde")

    s = sub.add_parser("synchro", help="ui_synchro (J1b) : deux navigateurs aux émulateurs, l'un hors ligne, au même état")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")

    s = sub.add_parser("suppression", help="ui_suppression (J1b) : compte supprimé comme un joueur, mot de passe faux, "
                                           "suppression coupée avant deleteUser puis reprise, vérifiée aux émulateurs")
    s.add_argument("--url", default=URL_DEFAUT)
    s.add_argument("--width", type=int, default=TELEPHONE["largeur"], help="< 700 : téléphone (toucher), sinon PC")
    s.add_argument("--out", default="/tmp/terramemo-captures")

    s = sub.add_parser("export", help="ui_export (J1b) : l'export JSON de l'invité, du compte et d'un appareil neuf, "
                                      "chaque fichier téléchargé vérifié par probleme() face au journal de la page")
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

    for nom in ("smoke", "ui", "seance", "accueil", "drapeaux", "mers", "fiche", "quiz", "lignes", "synchro", "suppression", "export", "mesurer"):
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
    commandes = {"serve": commande_serve, "smoke": commande_smoke, "ui": commande_ui, "seance": commande_seance, "accueil": commande_accueil, "drapeaux": commande_drapeaux, "mers": commande_mers, "fiche": commande_fiche, "quiz": commande_quiz, "lignes": commande_lignes, "synchro": commande_synchro,
                 "suppression": commande_suppression, "export": commande_export,
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
