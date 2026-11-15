"""Mesure promise par Q3 (docs/questions-j1a.md, #2) : la part des réponses
justes « par pastille » (champ `via` du journal) des micro-États cibles, au
zoom faible et par tranche de zoom, pour décider après la semaine d'usage
s'ils sont surestimés (options B, disque plus petit quand il est posé sur un
voisin, ou C, zoom minimal en séance).

Lit le journal de l'appareil, base `terramemo-journal`, dans les sauvegardes
de `driver.py sauver_journal` (~/Sauvegardes/terramemo/journal-*.json), ou
d'abord sur le téléphone (--sauver : une sauvegarde de plus, jamais écrasée).
Sans fichier donné : la dernière sauvegarde de chaque origine (APK, site),
fusionnées sans doublon d'id ; celles du PC (cible « local », essais du
driver) seulement nommées.

    python3 .claude/skills/run-terramemo/outils/pastilles.py                 # la dernière sauvegarde de l'APK et du site
    python3 .claude/skills/run-terramemo/outils/pastilles.py FICHIER...      # ces sauvegardes (ou listes d'événements)
    python3 .claude/skills/run-terramemo/outils/pastilles.py --sauver        # APK par adb (--cible chrome pour le site)
    python3 .claude/skills/run-terramemo/outils/pastilles.py --depuis 07/11 --json

Compté : les réponses de sens « où est » (fiches `<domaine>:<id>:localiser`)
au toucher. Les séances se rangent en réponses notées par FSRS (rappel et
révision avec une note) et en reprises (même modes, note null : la fiche
revient en fin de séance après un échec, ou a déjà sa note du jour) ; les
parties libres (Toucher) à part ; ni QCM ni carte retournée (fiches
`:nommer`), communes à part. Une réponse juste dit par quoi la carte l'a
désignée : tracé, pastille (le disque d'un micro-État, sur un pays voisin
ou en mer) ou proche (en mer, à moins de 22 px) ; une fausse n'a pas de via.
Le zoom est l'échelle de la carte au toucher (1 : le monde entier à l'écran,
ou l'île entière pour les communes ; il vaut plus de pixels en paysage ou
sur un plus grand écran : les réponses sont aussi comptées par appareil).

La ligne « => Q3 » compte ensemble les Trouver de pays, de capitales et de
drapeaux (fiches `pays:`, `capitales:` et `drapeaux:` d'un même pays : la
cible est le pays, avec le même disque ; étude du J2, § 6.5), jamais les
mers. Elle ne compte que les micro-États (`micro` de
public/geo/pays.json), au zoom faible (sous --faible, 3 par défaut), en deux
groupes : disque posé sur un pays (micro-État qui a des voisins terrestres :
Vatican, Saint-Marin, Monaco, Liechtenstein, Andorre…), le biais que vise B,
et disque en mer (îles, où « par pastille » est la règle et ne dit rien du
biais ; une île près d'une côte, comme Malte, y est rangée). Le tableau par
fiche liste chaque micro-État répondu. Le seuil qui ferait choisir B ou C
reste à l'utilisateur.
"""
import argparse
import contextlib
import datetime
import importlib.util
import json
import pathlib
import statistics
import sys

RACINE = pathlib.Path(__file__).resolve().parents[4]
SAUVEGARDES = pathlib.Path.home() / "Sauvegardes/terramemo"
MODES_SEANCE = ("rappel", "revision")
VIAS = ("trace", "pastille", "proche")
TRANCHES = (1.5, 3, 6, 12)
FAIBLE = 3.0
# Les sujets dont le Trouver touche un pays, avec le même disque pour un
# micro-État : Q3 les compte ensemble (étude du J2, § 6.5). Pas les mers.
DOMAINES_Q3 = ("pays", "capitales", "drapeaux")
GROUPES = {"fsrs": "séances, réponses notées par FSRS (rappel et révision)",
           "reprises": "séances, reprises (note null : hors FSRS)",
           "libre": "parties libres (hors FSRS)"}


def driver():
    spec = importlib.util.spec_from_file_location("driver", RACINE / ".claude/skills/run-terramemo/driver.py")
    d = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(d)
    return d


def _entete(f):
    try:
        brut = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return brut if isinstance(brut, dict) else None


def dernieres_sauvegardes(dossier=SAUVEGARDES):
    """La sauvegarde la plus récente (sauve_le, sinon date du fichier) de
    chaque origine, celles du PC (cible « local ») à part : (retenues, écartées)."""
    par_origine, locales = {}, []
    for f in dossier.glob("journal-*.json"):
        e = _entete(f)
        if e is None:
            continue
        if e.get("cible") == "local":
            locales.append(f)
            continue
        cle = (str(e.get("sauve_le") or ""), f.stat().st_mtime)
        o = e.get("origine")
        if o not in par_origine or cle > par_origine[o][0]:
            par_origine[o] = (cle, f)
    return [f for _, f in par_origine.values()], sorted(locales)


def charger(fichiers):
    """(événements fusionnés sans doublon d'id, une ligne par source). Écartés
    et comptés : les événements que la sauvegarde dit invalides (probleme()
    de l'appli), et ceux qui ne sont pas un objet à id texte."""
    vus, evenements, sources = set(), [], []
    for f in fichiers:
        brut = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))
        evts = (brut.get("evenements") if isinstance(brut, dict) else brut) or []
        invalides = {r.get("i") for r in (brut.get("invalides") or []) if isinstance(r, dict)} if isinstance(brut, dict) else set()
        retenus = ecartes = 0
        for i, e in enumerate(evts):
            if i in invalides or not isinstance(e, dict) or not isinstance(e.get("id"), str):
                ecartes += 1
                continue
            if e["id"] in vus:
                continue
            vus.add(e["id"])
            evenements.append(e)
            retenus += 1
        if isinstance(brut, dict):
            quoi = f"{brut.get('cible') or '?'}, {brut.get('origine')}, sauvé le {brut.get('sauve_le')}"
        else:
            quoi = "liste"
        sources.append({"fichier": str(f), "source": quoi, "evenements": len(evts), "ajoutes": retenus, "ecartes": ecartes})
    return evenements, sources


def tranche(zoom, bornes):
    """Libellé de la tranche du zoom : « < 1,5 », « 1,5 à 3 »… « ≥ 12 », « sans zoom »."""
    if isinstance(zoom, bool) or not isinstance(zoom, (int, float)) or zoom <= 0:
        return "sans zoom"
    f = lambda x: f"{x:g}".replace(".", ",")
    if zoom < bornes[0]:
        return f"< {f(bornes[0])}"
    for a, b in zip(bornes, bornes[1:]):
        if zoom < b:
            return f"{f(a)} à {f(b)}"
    return f"≥ {f(bornes[-1])}"


def libelles(bornes):
    return [tranche(bornes[0] / 2, bornes)] + [tranche(b, bornes) for b in bornes] + ["sans zoom"]


def vide():
    return {"n": 0, "justes": 0, "faux": 0, **{v: 0 for v in VIAS}, "sans_via": 0}


def compter(c, e):
    c["n"] += 1
    if e.get("correct") is True:
        c["justes"] += 1
        via = e.get("via")
        c[via if via in VIAS else "sans_via"] += 1
    else:
        c["faux"] += 1


def parts(c):
    """Parts en % : justes sur n, et chaque via sur les justes."""
    j = c["justes"]
    return {**c, "justes_pc": round(100 * j / c["n"], 1) if c["n"] else None,
            **{f"{v}_pc": round(100 * c[v] / j, 1) if j else None for v in VIAS}}


def faible_(e, seuil):
    z = e.get("zoom")
    return not isinstance(z, bool) and isinstance(z, (int, float)) and 0 < z < seuil


def lire_pays():
    try:
        return {p["id"]: p for p in json.loads((RACINE / "public/geo/pays.json").read_text(encoding="utf-8"))}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def groupe_de(e):
    if e.get("mode") == "libre":
        return "libre"
    if e.get("mode") in MODES_SEANCE:
        return "fsrs" if e.get("note") in (1, 2, 3, 4) else "reprises"
    return None


def analyser(evenements, depuis=None, bornes=TRANCHES, faible=FAIBLE, pays=None):
    """Les comptes de Q3 (dictionnaire, aussi la sortie --json). `depuis` :
    une date ; une réponse compte si son jour local (ts + tz) n'est pas avant."""
    pays = lire_pays() if pays is None else pays
    reponses = []
    for e in evenements:
        if e.get("type") != "reponse" or groupe_de(e) is None:
            continue
        parties = str(e.get("fiche", "")).split(":")
        if len(parties) != 3 or parties[2] != "localiser":
            continue
        if depuis is not None:
            ts, tz = e.get("ts"), e.get("tz") if isinstance(e.get("tz"), int) else 0
            if not isinstance(ts, (int, float)):
                continue
            if datetime.datetime.fromtimestamp((ts + tz * 60_000) / 1000, datetime.UTC).date() < depuis:
                continue
        reponses.append((parties[0], parties[1], e))
    res = {"bornes": list(bornes), "faible": faible, "reponses": len(reponses), "domaines": {}, "fiches": [],
           "appareils": {}, "q3": {"voisin": vide(), "mer": vide(), "tous_pays": vide()}}
    ts = [e["ts"] for _, _, e in reponses if isinstance(e.get("ts"), (int, float))]
    res["du"], res["au"] = (min(ts), max(ts)) if ts else (None, None)
    fiches = {}
    for domaine, ident, e in reponses:
        groupe = groupe_de(e)
        res["appareils"][str(e.get("appareil"))] = res["appareils"].get(str(e.get("appareil")), 0) + 1
        d = res["domaines"].setdefault(domaine, {})
        g = d.setdefault(groupe, {"tranches": {t: vide() for t in libelles(bornes)}, "total": vide(), "faible": vide()})
        compter(g["tranches"][tranche(e.get("zoom"), bornes)], e)
        compter(g["total"], e)
        bas = faible_(e, faible)
        if bas:
            compter(g["faible"], e)
        if groupe != "fsrs" or domaine not in DOMAINES_Q3:
            continue
        info = pays.get(ident, {})
        micro, voisin = bool(info.get("micro")), bool(info.get("voisins"))
        if bas:
            compter(res["q3"]["tous_pays"], e)
            if micro:
                compter(res["q3"]["voisin" if voisin else "mer"], e)
        f = fiches.setdefault(ident, {"id": ident, "domaines": {}, "micro": micro, "sur_voisin": micro and voisin,
                                      **vide(), "zooms_pastille": [], "faible": vide()})
        f["domaines"][domaine] = f["domaines"].get(domaine, 0) + 1
        compter(f, e)
        if bas:
            compter(f["faible"], e)
        if e.get("correct") is True and e.get("via") == "pastille" and not isinstance(e.get("zoom"), bool) \
                and isinstance(e.get("zoom"), (int, float)):
            f["zooms_pastille"].append(e["zoom"])
    for d in res["domaines"].values():
        for g in d.values():
            g["tranches"] = {t: parts(c) for t, c in g["tranches"].items() if c["n"]}
            g["total"], g["faible"] = parts(g["total"]), parts(g["faible"])
    res["q3"] = {k: parts(c) for k, c in res["q3"].items()}
    retenues = [f for f in fiches.values() if f["micro"] or f["pastille"]]
    for f in sorted(retenues, key=lambda f: (not f["sur_voisin"], not f["micro"], -f["pastille"], -f["n"], f["id"])):
        z = f.pop("zooms_pastille")
        res["fiches"].append({**parts(f), "faible": parts(f["faible"]),
                              "zoom_pastille_median": round(statistics.median(z), 2) if z else None})
    return res


def noms():
    try:
        return json.loads((RACINE / "public/geo/noms.fr.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def pc(x):
    return "—" if x is None else f"{x:.0f} %"


def quand(ms):
    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%d/%m/%Y %H:%M") if ms else "?"


def afficher(res, sources, ecartees=()):
    for s in sources:
        ecart = f", {s['ecartes']} écarté(s) (invalides)" if s["ecartes"] else ""
        print(f"{s['fichier']} : {s['evenements']} événement(s) ({s['source']}), {s['ajoutes']} retenu(s){ecart}")
    for f in ecartees:
        print(f"{f} : sauvegarde du PC (cible local), non comptée ; la nommer pour la compter")
    appareils = ", ".join(f"{a[:8]} : {n}" for a, n in sorted(res["appareils"].items(), key=lambda x: -x[1]))
    print(f"{res['reponses']} réponse(s) « où est » au toucher, du {quand(res['du'])} au {quand(res['au'])}"
          + (f" (par appareil : {appareils})" if appareils else ""))
    if not res["reponses"]:
        print("rien à mesurer : aucune réponse de séance ni de partie libre au toucher")
        return
    seuil = f"{res['faible']:g}".replace(".", ",")
    for domaine, d in sorted(res["domaines"].items()):
        for groupe, titre in GROUPES.items():
            g = d.get(groupe)
            if not g:
                continue
            print(f"\n{domaine}, {titre}")
            print(f"  {'zoom':<11} {'réponses':>8} {'justes':>7} {'% justes':>9} {'tracé':>7} {'pastille':>9} {'proche':>7}")
            for t, c in list(g["tranches"].items()) + [("total", g["total"]), (f"< {seuil}", g["faible"])]:
                if not c["n"] and t != "total":
                    continue
                print(f"  {t:<11} {c['n']:>8} {c['justes']:>7} {pc(c['justes_pc']):>9} {pc(c['trace_pc']):>7} "
                      f"{pc(c['pastille_pc']):>9} {pc(c['proche_pc']):>7}")
    q = res["q3"]
    print(f"\n=> Q3 (réponses notées par FSRS, Trouver de pays, capitales et drapeaux, zoom < {seuil}) :")
    for cle, quoi in (("voisin", "micro-États au disque posé sur un pays (le biais que vise B)"),
                      ("mer", "micro-États au disque en mer (îles : par pastille est la règle)"),
                      ("tous_pays", "tous les pays, pour repère")):
        c = q[cle]
        print(f"   {quoi} : {c['n']} réponse(s), {c['justes']} juste(s) ({pc(c['justes_pc'])}), "
              f"dont {c['pastille']} par pastille ({pc(c['pastille_pc'])} des justes)")
    if res["fiches"]:
        n = noms()
        print("\nMicro-États répondus (réponses notées par FSRS, pays, capitales et drapeaux ensemble),"
              " et toute fiche juste par pastille :")
        print(f"  {'fiche':<36} {'disque':>8} {'réponses':>8} {'justes':>7} {'pastille':>9} {'tracé':>6} {'faux':>5} "
              f"{'pastille <' + seuil:>12} {'zoom méd.':>10}")
        for f in res["fiches"]:
            nom = n.get(f["id"], f["id"])
            etiquette = f"{nom[:36 - len(f['id']) - 3]} ({f['id']})"
            disque = "voisin" if f["sur_voisin"] else ("mer" if f["micro"] else "—")
            fa = f["faible"]
            faibles = f"{fa['pastille']}/{fa['justes']}"
            mediane = "—" if f["zoom_pastille_median"] is None else f"{f['zoom_pastille_median']:g}"
            print(f"  {etiquette:<36} {disque:>8} {f['n']:>8} {f['justes']:>7} {f['pastille']:>9} "
                  f"{f['trace']:>6} {f['faux']:>5} {faibles:>12} {mediane:>10}")


def date_depuis(texte, aujourd_hui=None):
    """« 07/11 » ou « 07/11/2026 » en date ; sans année, la dernière qui
    ne soit pas à venir."""
    morceaux = [int(x) for x in texte.split("/")]
    aujourd_hui = aujourd_hui or datetime.date.today()
    if len(morceaux) > 2:
        return datetime.date(morceaux[2], morceaux[1], morceaux[0])
    d = datetime.date(aujourd_hui.year, morceaux[1], morceaux[0])
    return d if d <= aujourd_hui else d.replace(year=d.year - 1)


def bornes_de(texte):
    try:
        bornes = sorted({float(x) for x in texte.split(",")})
    except ValueError:
        raise argparse.ArgumentTypeError(f"--tranches : des nombres séparés par des virgules (point décimal) : {texte}")
    if not bornes or bornes[0] <= 0:
        raise argparse.ArgumentTypeError(f"--tranches : des bornes > 0 : {texte}")
    return tuple(bornes)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("fichiers", nargs="*", help="sauvegardes journal-*.json (défaut : la dernière de chaque origine)")
    p.add_argument("--sauver", action="store_true", help="lire d'abord le journal du téléphone (driver.py sauver_journal)")
    p.add_argument("--cible", default="webview", choices=["webview", "chrome", "local"], help="avec --sauver (défaut : l'APK)")
    p.add_argument("-s", "--serie", help="avec --sauver : numéro de série adb (plusieurs appareils)")
    p.add_argument("--depuis", help="réponses depuis ce jour local (JJ/MM ou JJ/MM/AAAA)")
    p.add_argument("--tranches", type=bornes_de, default=TRANCHES, help="bornes du zoom, point décimal (défaut 1.5,3,6,12)")
    p.add_argument("--faible", type=float, default=FAIBLE, help="zoom « faible » de Q3 : en dessous (défaut 3)")
    p.add_argument("--json", action="store_true", help="sortie JSON (comptes seuls)")
    a = p.parse_args(argv)
    fichiers = [pathlib.Path(f) for f in a.fichiers]
    if a.sauver:
        d = driver()
        try:
            # Ce que dit le driver va sur stderr : stdout reste au résultat (--json).
            with contextlib.redirect_stdout(sys.stderr):
                nouvelle = d.sauver_journal(a.cible, a.serie)
        except (RuntimeError, OSError, ValueError) as e:
            print(f"ECHEC : {e} ({d.AIDE_USB})", file=sys.stderr)
            return 1
        # Seule, elle s'ajoute aux dernières sauvegardes des autres origines (l'APK et le site).
        if fichiers or a.cible == "local":
            fichiers.append(nouvelle)
    ecartees = []
    if not fichiers:
        fichiers, ecartees = dernieres_sauvegardes()
        if not fichiers:
            print(f"aucune sauvegarde journal-*.json du téléphone dans {SAUVEGARDES} : --sauver la fait d'abord",
                  file=sys.stderr)
            return 1
    evenements, sources = charger(fichiers)
    res = analyser(evenements, date_depuis(a.depuis) if a.depuis else None, a.tranches, a.faible)
    if a.json:
        print(json.dumps({**res, "sources": sources, "ecartees": [str(f) for f in ecartees]}, ensure_ascii=False, indent=1))
    else:
        afficher(res, sources, ecartees)
    return 0


if __name__ == "__main__":
    sys.exit(main())
