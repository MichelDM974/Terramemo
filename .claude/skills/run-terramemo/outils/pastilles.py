"""Mesure promise par Q3 (docs/questions-j1a.md, #2) : la part des réponses
justes « par pastille » (champ `via` du journal) et par tranche de zoom, pour
décider après la semaine d'usage si les micro-États cibles sont surestimés
(options B, disque plus petit sur un voisin, ou C, zoom minimal en séance).

Lit le journal de l'appareil, base `terramemo-journal`, dans les sauvegardes
de `driver.py sauver_journal` (~/Sauvegardes/terramemo/journal-*.json), ou
d'abord sur le téléphone (--sauver : une sauvegarde de plus, jamais écrasée).
Plusieurs sauvegardes (APK et site) se fusionnent, sans doublon (id).

    python3 .claude/skills/run-terramemo/outils/pastilles.py                 # la dernière sauvegarde de chaque origine
    python3 .claude/skills/run-terramemo/outils/pastilles.py FICHIER...      # ces sauvegardes (ou listes d'événements)
    python3 .claude/skills/run-terramemo/outils/pastilles.py --sauver        # APK par adb (puis --cible chrome pour le site)
    python3 .claude/skills/run-terramemo/outils/pastilles.py --depuis 07/11 --json

Compté : les réponses de sens « où est » (fiches `<domaine>:<id>:localiser`)
au toucher, en séance (rappel et révision, celles que note FSRS) et, à part,
en partie libre ; ni QCM ni carte retournée, sans toucher. Une réponse juste
dit par quoi la carte l'a désignée : tracé, pastille (le disque d'un
micro-État) ou proche (en mer, à moins de 22 px) ; une fausse n'a pas de via.
Le zoom est l'échelle de la carte au toucher (1 : le monde, ou l'île entière
pour les communes, qui ont leur propre tableau). La part « par pastille » au
zoom faible (sous --faible, 3 par défaut) est le chiffre de Q3 ; le tableau
par fiche montre les micro-États où elle se concentre. Le seuil qui ferait
choisir B ou C reste à l'utilisateur.
"""
import argparse
import datetime
import importlib.util
import json
import pathlib
import statistics
import sys

RACINE = pathlib.Path(__file__).resolve().parents[4]
SAUVEGARDES = pathlib.Path.home() / "Sauvegardes/terramemo"
MODES_FSRS = ("rappel", "revision")
VIAS = ("trace", "pastille", "proche")
TRANCHES = (1.5, 3, 6, 12)
FAIBLE = 3.0


def driver():
    spec = importlib.util.spec_from_file_location("driver", RACINE / ".claude/skills/run-terramemo/driver.py")
    d = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(d)
    return d


def dernieres_sauvegardes(dossier=SAUVEGARDES):
    """La sauvegarde la plus récente de chaque origine (APK, site, local)."""
    par_origine = {}
    for f in sorted(dossier.glob("journal-*.json"), key=lambda f: f.stat().st_mtime):
        try:
            origine = json.loads(f.read_text(encoding="utf-8")).get("origine")
        except (OSError, ValueError, AttributeError):
            continue
        par_origine[origine] = f
    return list(par_origine.values())


def charger(fichiers):
    """(événements fusionnés sans doublon d'id, une ligne par source)."""
    vus, evenements, sources = set(), [], []
    for f in fichiers:
        brut = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))
        evts = brut.get("evenements", []) if isinstance(brut, dict) else brut
        nouveaux = 0
        for e in evts:
            if not isinstance(e, dict) or e.get("id") in vus:
                continue
            vus.add(e.get("id"))
            evenements.append(e)
            nouveaux += 1
        quoi = f"{brut.get('origine')}, sauvé le {brut.get('sauve_le')}" if isinstance(brut, dict) else "liste"
        sources.append({"fichier": str(f), "source": quoi, "evenements": len(evts), "ajoutes": nouveaux})
    return evenements, sources


def tranche(zoom, bornes):
    """Libellé de la tranche du zoom : « < 1,5 », « 1,5 à 3 »… « ≥ 12 », « sans zoom »."""
    if not isinstance(zoom, (int, float)) or zoom <= 0:
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
    return {"justes_pc": round(100 * j / c["n"], 1) if c["n"] else None,
            **{f"{v}_pc": round(100 * c[v] / j, 1) if j else None for v in VIAS}}


def analyser(evenements, depuis_ms=None, bornes=TRANCHES, faible=FAIBLE):
    """Les comptes de Q3 (dictionnaire, aussi la sortie --json)."""
    reponses = []
    for e in evenements:
        if not isinstance(e, dict) or e.get("type") != "reponse":
            continue
        if depuis_ms is not None and not (isinstance(e.get("ts"), (int, float)) and e["ts"] >= depuis_ms):
            continue
        parties = str(e.get("fiche", "")).split(":")
        if len(parties) != 3 or parties[2] != "localiser":
            continue
        if e.get("mode") not in MODES_FSRS + ("libre",):
            continue
        reponses.append((parties[0], parties[1], e))
    res = {"bornes": list(bornes), "faible": faible, "reponses": len(reponses), "domaines": {}, "fiches": []}
    ts = [e["ts"] for _, _, e in reponses if isinstance(e.get("ts"), (int, float))]
    res["du"], res["au"] = (min(ts), max(ts)) if ts else (None, None)
    fiches = {}
    for domaine, ident, e in reponses:
        groupe = "fsrs" if e["mode"] in MODES_FSRS else "libre"
        d = res["domaines"].setdefault(domaine, {})
        g = d.setdefault(groupe, {"tranches": {t: vide() for t in libelles(bornes)}, "total": vide(), "faible": vide()})
        compter(g["tranches"][tranche(e.get("zoom"), bornes)], e)
        compter(g["total"], e)
        if isinstance(e.get("zoom"), (int, float)) and 0 < e["zoom"] < faible:
            compter(g["faible"], e)
        if groupe == "fsrs":
            f = fiches.setdefault((domaine, ident), {"domaine": domaine, "id": ident, **vide(), "zooms_pastille": [],
                                                     "faible": vide()})
            compter(f, e)
            if isinstance(e.get("zoom"), (int, float)) and 0 < e["zoom"] < faible:
                compter(f["faible"], e)
            if e.get("correct") is True and e.get("via") == "pastille" and isinstance(e.get("zoom"), (int, float)):
                f["zooms_pastille"].append(e["zoom"])
    for d in res["domaines"].values():
        for g in d.values():
            g["tranches"] = {t: {**c, **parts(c)} for t, c in g["tranches"].items() if c["n"]}
            g["total"] = {**g["total"], **parts(g["total"])}
            g["faible"] = {**g["faible"], **parts(g["faible"])}
    for f in sorted(fiches.values(), key=lambda f: (-f["pastille"], -f["n"], f["id"])):
        if not f["pastille"]:
            continue
        z = f.pop("zooms_pastille")
        res["fiches"].append({**f, **parts(f), "faible": {**f["faible"], **parts(f["faible"])},
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


def afficher(res, sources):
    for s in sources:
        print(f"{s['fichier']} : {s['evenements']} événement(s) ({s['source']}), {s['ajoutes']} retenu(s)")
    print(f"{res['reponses']} réponse(s) « où est » au toucher, du {quand(res['du'])} au {quand(res['au'])}")
    if not res["reponses"]:
        print("rien à mesurer : aucune réponse de séance ni de partie libre au toucher")
        return
    seuil = f"{res['faible']:g}".replace(".", ",")
    for domaine, d in sorted(res["domaines"].items()):
        for groupe in ("fsrs", "libre"):
            g = d.get(groupe)
            if not g:
                continue
            titre = "séances (rappel et révision, notées par FSRS)" if groupe == "fsrs" else "parties libres (hors FSRS)"
            print(f"\n{domaine}, {titre}")
            print(f"  {'zoom':<11} {'réponses':>8} {'justes':>7} {'% justes':>9} {'tracé':>7} {'pastille':>9} {'proche':>7}")
            lignes = list(g["tranches"].items()) + [("total", g["total"]), (f"< {seuil}", g["faible"])]
            for t, c in lignes:
                if not c["n"] and t != "total":
                    continue
                print(f"  {t:<11} {c['n']:>8} {c['justes']:>7} {pc(c['justes_pc']):>9} {pc(c['trace_pc']):>7} "
                      f"{pc(c['pastille_pc']):>9} {pc(c['proche_pc']):>7}")
            if groupe == "fsrs":
                f = g["faible"]
                print(f"  => Q3 : au zoom < {seuil}, {f['pastille']} juste(s) sur {f['justes']} par pastille "
                      f"({pc(f['pastille_pc'])} des justes) ; parts des via comptées sur les justes")
    if res["fiches"]:
        n = noms()
        print("\nFiches justes par pastille (séances) :")
        print(f"  {'fiche':<28} {'réponses':>8} {'justes':>7} {'pastille':>9} {'tracé':>6} {'faux':>5} "
              f"{'pastille <' + seuil:>12} {'zoom méd.':>10}")
        for f in res["fiches"]:
            nom = n.get(f["id"], f["id"]) if f["domaine"] == "pays" else f["id"]
            fa = f["faible"]
            etiquette = f"{nom} ({f['id']})"[:28]
            faibles = f"{fa['pastille']}/{fa['justes']}"
            mediane = "—" if f["zoom_pastille_median"] is None else f"{f['zoom_pastille_median']:g}"
            print(f"  {etiquette:<28} {f['n']:>8} {f['justes']:>7} {f['pastille']:>9} "
                  f"{f['trace']:>6} {f['faux']:>5} {faibles:>12} {mediane:>10}")


def date_depuis(texte):
    """« 07/11 » ou « 07/11/2026 » (jour local, 0 h) en ms depuis 1970."""
    morceaux = [int(x) for x in texte.split("/")]
    j, m = morceaux[0], morceaux[1]
    a = morceaux[2] if len(morceaux) > 2 else datetime.date.today().year
    return int(datetime.datetime(a, m, j).timestamp() * 1000)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("fichiers", nargs="*", help="sauvegardes journal-*.json (défaut : la dernière de chaque origine)")
    p.add_argument("--sauver", action="store_true", help="lire d'abord le journal du téléphone (driver.py sauver_journal)")
    p.add_argument("--cible", default="webview", choices=["webview", "chrome", "local"], help="avec --sauver (défaut : l'APK)")
    p.add_argument("-s", "--serie", help="avec --sauver : numéro de série adb (plusieurs appareils)")
    p.add_argument("--depuis", help="réponses depuis ce jour (JJ/MM ou JJ/MM/AAAA, 0 h locale)")
    p.add_argument("--tranches", default=",".join(f"{b:g}" for b in TRANCHES), help="bornes du zoom (défaut 1.5,3,6,12)")
    p.add_argument("--faible", type=float, default=FAIBLE, help="zoom « faible » de Q3 : en dessous (défaut 3)")
    p.add_argument("--json", action="store_true", help="sortie JSON (comptes seuls)")
    a = p.parse_args(argv)
    fichiers = [pathlib.Path(f) for f in a.fichiers]
    if a.sauver:
        d = driver()
        try:
            nouvelle = d.sauver_journal(a.cible, a.serie)
        except (RuntimeError, OSError, ValueError) as e:
            print(f"ECHEC : {e} ({d.AIDE_USB})", file=sys.stderr)
            return 1
        # Seule, elle s'ajoute aux dernières sauvegardes des autres origines (l'APK et le site).
        if fichiers:
            fichiers.append(nouvelle)
    if not fichiers:
        fichiers = dernieres_sauvegardes()
        if not fichiers:
            print(f"aucune sauvegarde journal-*.json dans {SAUVEGARDES} : --sauver la fait d'abord", file=sys.stderr)
            return 1
    bornes = tuple(sorted(float(x) for x in a.tranches.split(",")))
    evenements, sources = charger(fichiers)
    res = analyser(evenements, date_depuis(a.depuis) if a.depuis else None, bornes, a.faible)
    if a.json:
        print(json.dumps({**res, "sources": sources}, ensure_ascii=False, indent=1))
    else:
        afficher(res, sources)
    return 0


if __name__ == "__main__":
    sys.exit(main())
