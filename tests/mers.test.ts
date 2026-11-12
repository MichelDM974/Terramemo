import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assembler, chargerDonnees, chargerLeger, type DonneesCarte } from '../src/map/donnees';
import { indexLieux } from '../src/map/lieux';
import { assemblerMers, chargeurMers, FICHIERS_MERS, formeContour, zonesAllumees, type CoucheMers } from '../src/map/mers';

// Couche marine (étude J2, § 2.3 et § 4.2 ; lot 3a, partie B) : assemblage des
// fichiers servis, chargement à la demande (une lecture, un échec non gardé,
// rien au premier affichage), index commun, et l'océan allumé avec la mer
// qu'il enclave sans côte (décision « Océans et mers », 12/11).

const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const lire = (f: string) => JSON.parse(texte(f));
const couche: CoucheMers = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
const mers = couche.mers.map((e) => e.pays);

afterEach(() => vi.unstubAllGlobals());

describe('couche marine assemblée', () => {
  it('50 zones jouables, jamais micro, dans l’ordre de mers.topo.json ; chacune sa forme légère et son nom', () => {
    expect(couche.mers).toHaveLength(50);
    const topo = lire('mers.topo.json') as { objects: { mers: { geometries: { properties: { id: string } }[] } } };
    expect(couche.mers.map((e) => e.pays.id)).toEqual(topo.objects.mers.geometries.map((g) => g.properties.id));
    for (const e of couche.mers) {
      expect(e.pays).toMatchObject({ statut: 'jouable', micro: false });
      expect(e.pays.partie_max_km2).toBe(e.pays.superficie_km2);
      expect(e.forme.properties.id).toBe(e.pays.id);
      expect(couche.leger.get(e.pays.id), e.pays.id).toBeTruthy();
      expect(couche.noms[e.pays.id], e.pays.id).toBeTruthy();
    }
    expect(couche.alias.arabie).toContain("mer d'Oman");
    expect(mers.filter((m) => m.enclavee).map((m) => m.id)).toEqual(['sargasse']);
  });

  it('les mers ne sont jamais dans entites ; donnees.mers est vide tant que rien n’est chargé', () => {
    const d: DonneesCarte = assembler(lire('monde.topo.json'), lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
    expect(d.mers).toEqual([]);
    const ids = new Set(d.entites.map((e) => e.pays.id));
    for (const m of mers) expect(ids.has(m.id), m.id).toBe(false);
  });

  it('index commun : pays et mers par id, avec leur couche et leur place', () => {
    const d: DonneesCarte = assembler(lire('monde.topo.json'), lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
    expect(indexLieux(d).get('atlant')).toBeUndefined();
    d.mers = couche.mers;
    const index = indexLieux(d);
    expect(index.size).toBe(d.entites.length + 50);
    const fra = index.get('FRA');
    expect(fra?.couche).toBe('pays');
    expect(d.entites[fra?.i ?? -1]?.pays.id).toBe('FRA');
    const atl = index.get('atlant');
    expect(atl?.couche).toBe('mers');
    expect(d.mers[atl?.i ?? -1]?.pays.id).toBe('atlant');
    expect(atl?.forme).toBe(d.mers[atl?.i ?? -1]?.forme);
  });
});

describe('océan allumé : sa pleine mer et la mer qu’il enclave sans côte (12/11)', () => {
  it('l’Atlantique allume les Sargasses ; les Sargasses seules n’allument qu’elles', () => {
    expect(zonesAllumees('atlant', mers)).toEqual(['atlant', 'sargasse']);
    expect(zonesAllumees('sargasse', mers)).toEqual(['sargasse']);
  });

  it('jamais une mer côtière : un océan n’allume que des mers enclavées dont il est le parent ; une mer, un golfe, une baie n’allument qu’eux', () => {
    for (const m of mers) {
      const z = zonesAllumees(m.id, mers);
      expect(z[0]).toBe(m.id);
      if (m.sorte !== 'océan') expect(z, m.id).toEqual([m.id]);
      for (const autre of z.slice(1)) {
        const a = mers.find((x) => x.id === autre);
        expect(a?.enclavee, `${m.id} → ${autre}`).toBe(true);
        expect(a?.parents).toContain(m.id);
      }
    }
    // Les Caraïbes, la mer du Nord, le golfe de Guinée sont de l'Atlantique, mais côtiers.
    for (const cotiere of ['caraibes', 'nord', 'guinee', 'manche', 'medit']) expect(zonesAllumees('atlant', mers)).not.toContain(cotiere);
    expect(zonesAllumees('pacif', mers)).toEqual(['pacif']);
    expect(zonesAllumees('FRA', mers)).toEqual(['FRA']);
  });

  it('le contour de l’Atlantique allumé est celui de l’union : sans l’anneau des Sargasses, ses îles gardées ; les autres zones, leur forme', () => {
    const atl = couche.mers.find((e) => e.pays.id === 'atlant')!;
    const g = atl.forme.geometry;
    const avant = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const c = formeContour(atl, couche.mers).geometry;
    const apres = c.type === 'Polygon' ? [c.coordinates] : c.coordinates;
    const anneaux = (ps: typeof avant) => ps.reduce((n, p) => n + p.length, 0);
    expect(anneaux(apres)).toBe(anneaux(avant) - 1);
    // L'anneau ôté est le bord des Sargasses : mêmes sommets (un trou de l'Atlantique).
    const sar = couche.mers.find((e) => e.pays.id === 'sargasse')!.forme.geometry;
    const bordSar = new Set((sar.type === 'Polygon' ? sar.coordinates[0]! : sar.coordinates[0]![0]!).map((p) => `${p[0]},${p[1]}`));
    const otes = avant.flat().filter((a) => !apres.flat().includes(a));
    expect(otes).toHaveLength(1);
    expect(otes[0]!.every((p) => bordSar.has(`${p[0]},${p[1]}`))).toBe(true);
    for (const e of couche.mers) if (e.pays.id !== 'atlant') expect(formeContour(e, couche.mers), e.pays.id).toBe(e.forme);
  });
});

describe('chargement à la demande', () => {
  const fichiers: Record<string, string> = Object.fromEntries(FICHIERS_MERS.map((f) => [f, texte(f)]));

  it('une seule lecture de chaque fichier, appels simultanés ou suivants', async () => {
    const lus: string[] = [];
    const charger = chargeurMers(async (nom) => {
      lus.push(nom);
      return fichiers[nom] as string;
    });
    const [a, b] = await Promise.all([charger(), charger()]);
    const c = await charger();
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(lus.sort()).toEqual([...FICHIERS_MERS].sort());
    expect(a.mers).toHaveLength(50);
  });

  it('un échec (hors ligne) ne reste pas en cache : l’appel suivant relit tout', async () => {
    let hors = true;
    const lus: string[] = [];
    const charger = chargeurMers(async (nom) => {
      lus.push(nom);
      if (hors && nom === 'mers.json') throw new TypeError('Failed to fetch');
      return fichiers[nom] as string;
    });
    await expect(charger()).rejects.toThrow('Failed to fetch');
    hors = false;
    const c = await charger();
    expect(c.mers).toHaveLength(50);
    expect(lus.filter((n) => n === 'mers.json')).toHaveLength(2);
    expect(await charger()).toBe(c);
    expect(lus).toHaveLength(8);
  });

  it('rien des mers au premier affichage : chargerDonnees et la carte allégée ne demandent aucun fichier mers*', async () => {
    const demandes: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      demandes.push(url);
      const nom = url.replace('/geo/', '');
      return { ok: true, status: 200, text: async () => texte(nom), json: async () => lire(nom) };
    });
    const { donnees } = await chargerDonnees();
    await chargerLeger();
    expect(demandes.length).toBeGreaterThanOrEqual(5);
    expect(demandes.filter((u) => /\/mers/.test(u))).toEqual([]);
    expect(donnees.mers).toEqual([]);
  });
});
