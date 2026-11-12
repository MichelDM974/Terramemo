// Le sujet Océans et mers dans le jeu (étude J2, § 5.4, § 4.4 et § 6.1 ; lot
// 3b, partie A) : son rendu (énoncé, consigne, révélation, bilans, jamais
// l'id brut), ses leurres (voisins marins d'abord, jamais un ancêtre ni un
// descendant, jamais la mer d'Arabie et le golfe d'Oman ensemble), ses
// parties en zones admises du seul sujet Mers et leur rétroaction (« Juste :
// mer des Caraïbes, dans l'Atlantique »), notées par la carte sur les données
// réelles.
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { acceptesDe, construireAcceptes } from '../src/map/acceptes';
import { assembler, type DonneesCarte } from '../src/map/donnees';
import { versEcran } from '../src/map/geo';
import { indexLieux } from '../src/map/lieux';
import { assemblerMers, IDS_MERS, parenteMer, zonesParties } from '../src/map/mers';
import { calculerPastilles } from '../src/map/pastilles';
import { noter, type ContexteCarte } from '../src/map/pick';
import { cadre, placer, projectionDe, transfoDe } from '../src/map/vue';
import { fmtKm, optionsNoter, texteAdmis, zonesDuSujet } from '../src/vues/commun';
import { choix } from '../src/vues/qcm';
import { dansZone, rendu, type RenduSujet } from '../src/vues/sujets';
import { remplir, textes } from '../src/vues/textes';

const lire = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'));
const texte = (f: string) => readFileSync(`public/geo/${f}`, 'utf8');
const donnees: DonneesCarte = assembler(lire('monde.topo.json') as Topology<never>, lire('pays.json'), lire('contestees.json'), lire('noms.fr.json'));
const couche = assemblerMers({ topo: texte('mers.topo.json'), leger: texte('mers-leger.topo.json'), mers: texte('mers.json'), fr: texte('mers.fr.json') });
const avecMers: DonneesCarte = { ...donnees, mers: couche.mers };
const zones = couche.mers.map((e) => e.pays);
const T = textes.toucher;
/** Le rendu des mers sur le monde, la couche posée (comme une partie lancée). */
const rs: RenduSujet = rendu('mers', { ...avecMers, nomsMers: couche.noms });
/** Les 9 zones qui ont des parties (zonesParties non vide). */
const AVEC_PARTIES = ['atlant', 'pacif', 'indien', 'arctique', 'medit', 'noire', 'baltique', 'barents', 'chinemer'];

describe('les 50 zones', () => {
  it('IDS_MERS : les ids de mers.json, dans son ordre (la série « mers » sans rien charger)', () => {
    expect(IDS_MERS).toEqual((lire('mers.json') as { id: string }[]).map((m) => m.id));
    expect(IDS_MERS).toHaveLength(50);
  });
});

describe('rendu des mers (§ 5.4)', () => {
  it('Trouver « Touche : mer Égée » ; Reconnaître « Quelle est cette mer ? », « Quel est cet océan ? » ; quatre noms ; « Révéler » donne le nom ; les bilans par le nom', () => {
    expect(rs.sujet).toBe('mers');
    expect(rs.enonce('egee')).toEqual({ invite: 'Touche : ', objet: { texte: 'mer Égée' } });
    expect(rs.consigneQcm('egee')).toBe('Quelle est cette mer ?');
    expect(rs.consigneQcm('mozamb')).toBe('Quelle est cette mer ?');
    for (const o of ['atlant', 'pacif', 'indien', 'arctique', 'austral']) expect(rs.consigneQcm(o), o).toBe('Quel est cet océan ?');
    expect(rs.choix('medit')).toEqual({ texte: 'mer Méditerranée' });
    expect(rs.nomChoix('oman')).toBe("golfe d'Oman");
    expect(rs.revelation('manche')).toEqual({ texte: 'Manche' });
    for (const sens of ['localiser', 'nommer'] as const) expect(rs.nomBilan('azov', sens)).toBe("mer d'Azov");
    expect(rs.retro('egee')).toBe('');
    expect(rs.visuel).toBe(false);
    expect(rs.point('egee')).toBeNull();
    expect(rs.qcmPosable('caspien')).toBe(true);
  });

  it('« tu as touché » : une autre mer par son nom, un pays par le sien, rien sous le doigt : « hors de la carte », jamais « la mer »', () => {
    expect(rs.touche('noire')).toBe('mer Noire');
    expect(rs.touche('ITA')).toBe('Italie');
    expect(rs.touche(null)).toBe('hors de la carte');
    expect(rs.touche(null)).not.toBe(textes.sujets.pays.la_mer);
    expect(rs.fauxSuite('egee')).toBe('La bonne mer est en vert : touche-la.');
    expect(rs.expire('egee')).toBe('Temps écoulé. La bonne mer est en vert.');
  });

  it('aucun id brut affiché, pour chacune des 50 zones, par chaque méthode qui nomme', () => {
    for (const id of IDS_MERS) {
      const nom = couche.noms[id]!;
      expect(nom, id).toBeTruthy();
      const vus = [
        (rs.enonce(id).objet as { texte: string }).texte,
        (rs.choix(id) as { texte: string }).texte,
        rs.nomChoix(id),
        (rs.revelation(id) as { texte: string }).texte,
        rs.nomBilan(id, 'localiser'),
        rs.nomBilan(id, 'nommer'),
        rs.lieu(id),
        rs.touche(id),
      ];
      for (const v of vus) expect(v, id).toBe(nom);
      expect(rs.consigneQcm(id)).not.toContain(id);
    }
  });

  it('sans la couche lue : une erreur, jamais l’id brut', () => {
    expect(() => rendu('mers', { noms: donnees.noms })).toThrow(/mers : couche pas chargée/);
  });
});

describe('leurres marins (§ 5.4)', () => {
  const z = zonesDuSujet('mers', { donnees: avecMers, jouables: [] });
  /** Un hasard à graine (mulberry32), pour des tirages reproductibles. */
  const graine = (n: number) => () => {
    n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tirer = (id: string, k: number) => choix(id, z.lieux, z.jouables, graine(k), { exclus: rs.qcmExclus(id), pareils: rs.qcmPareils });

  it('les zones du sujet : les 50 mers posées, jamais un pays ; leur emprise pour le cadrage', () => {
    expect([...z.jouables].sort()).toEqual([...IDS_MERS].sort());
    expect(z.lieux.has('FRA')).toBe(false);
    expect(z.contours.get('pacif')!.length).toBeGreaterThan(4);
  });

  it('jamais un ancêtre ni un descendant de la cible, pour chaque zone et 40 tirages', () => {
    for (const id of IDS_MERS) {
      const parente = parenteMer(id, zones);
      for (let k = 0; k < 40; k++) {
        const c = tirer(id, k);
        expect(c).toHaveLength(4);
        expect(c).toContain(id);
        for (const x of c) if (x !== id) expect(parente.has(x), `${id} : ${x}`).toBe(false);
      }
    }
    // Le rendu exclut toute la parenté, ancêtres et descendants (un leurre proche ou non) ; rien d'autre.
    for (const id of IDS_MERS) expect(rs.qcmExclus(id), id).toEqual(parenteMer(id, zones));
    // Les cas de l'étude : la Méditerranée pour l'Adriatique, l'Atlantique pour les Sargasses, l'inverse.
    expect(parenteMer('adriat', zones)).toEqual(new Set(['medit', 'atlant']));
    expect(parenteMer('sargasse', zones).has('atlant')).toBe(true);
    expect(parenteMer('atlant', zones).has('sargasse')).toBe(true);
    expect(parenteMer('medit', zones)).toEqual(new Set(['atlant', 'adriat', 'egee', 'ionienne', 'tyrrhen']));
  });

  it('jamais la mer d’Arabie et le golfe d’Oman ensemble (« mer d’Oman »), ni avec la cible ni entre leurres', () => {
    for (const id of IDS_MERS) {
      for (let k = 0; k < 40; k++) {
        const c = tirer(id, k);
        expect(c.includes('arabie') && c.includes('oman'), `${id}, tirage ${k}`).toBe(false);
      }
    }
  });

  it('les voisins marins d’abord, puis les plus proches', () => {
    for (let k = 0; k < 20; k++) {
      // La Méditerranée : ses seuls voisins permis, la mer Noire.
      expect(tirer('medit', k)).toContain('noire');
      // Le golfe de Botnie : le golfe de Finlande (la Baltique, son parent, exclue).
      expect(tirer('botnie', k)).toContain('finlande');
      // Le golfe d'Oman : le golfe Persique (la mer d'Arabie, pareille, exclue).
      expect(tirer('oman', k)).toContain('persique');
      // L'Atlantique : trois des quatre autres océans voisins (ses mers, descendantes, exclues).
      expect(tirer('atlant', k).filter((x) => ['arctique', 'austral', 'indien', 'pacif'].includes(x))).toHaveLength(3);
    }
  });
});

describe('parties d’une mer : zones admises du seul sujet Mers, et leur rétroaction (§ 4.4)', () => {
  it('admisEnPlus : zonesParties en sorte « partie » pour les 9 zones qui en ont, null ailleurs ; jamais sous Pays, jamais dans la table commune', () => {
    const avec = IDS_MERS.filter((id) => rs.admisEnPlus(id) !== null);
    expect(avec.sort()).toEqual([...AVEC_PARTIES].sort());
    for (const id of AVEC_PARTIES) expect(rs.admisEnPlus(id), id).toEqual({ zones: zonesParties(id, zones), sorte: 'partie' });
    const atl = rs.admisEnPlus('atlant')!.zones;
    expect(atl).toContain('caraibes');
    expect(atl).toContain('hudson');
    for (const non of ['medit', 'noire', 'baltique', 'adriat', 'caspien']) expect(atl, non).not.toContain(non);
    expect(rendu('pays', avecMers).admisEnPlus('atlant')).toBeNull();
    const commune = construireAcceptes(avecMers);
    for (const l of commune.values()) for (const za of l) expect(za.sorte, za.zone).not.toBe('partie');
    expect(commune.has('atlant')).toBe(false);
  });

  it('« dans … » : le bon article pour chacune des 9 zones qui ont des parties', () => {
    const attendus: Record<string, string> = {
      atlant: "dans l'Atlantique",
      pacif: 'dans le Pacifique',
      indien: "dans l'océan Indien",
      arctique: "dans l'Arctique",
      medit: 'dans la Méditerranée',
      noire: 'dans la mer Noire',
      baltique: 'dans la Baltique',
      barents: 'dans la mer de Barents',
      chinemer: 'dans la mer de Chine méridionale',
    };
    expect(Object.keys(attendus).sort()).toEqual([...AVEC_PARTIES].sort());
    for (const id of AVEC_PARTIES) {
      expect(dansZone(id, rs.lieu(id)), id).toBe(attendus[id]);
      const partie = zonesParties(id, zones)[0]!;
      expect(texteAdmis(rs, id, { zone: partie, tenant: partie, sorte: 'partie' }), id).toBe(` : ${rs.lieu(partie)}, ${attendus[id]}`);
    }
    // À défaut d'une forme écrite, l'article du générique.
    expect(dansZone('egee', 'mer Égée')).toBe('dans la mer Égée');
    expect(dansZone('austral', 'océan Austral')).toBe("dans l'océan Austral");
    expect(dansZone('mexique', 'golfe du Mexique')).toBe('dans le golfe du Mexique');
    // Les autres sortes, inchangées.
    const pays = rendu('pays', donnees);
    expect(texteAdmis(pays, 'KAZ', { zone: 'NE_KAB', tenant: 'NE_KAB', sorte: 'enclave' })).toBe(' (enclave : Baïkonour)');
    expect(texteAdmis(pays, 'IDN', { zone: 'MCO', tenant: 'MCO', sorte: 'jumeau' })).toBe(' (même drapeau : Monaco)');
  });

  describe('notée par la carte (données réelles, téléphone de mesure)', () => {
    const C = cadre(384, 723);
    const lieux = indexLieux(avecMers);
    /** Le contexte de la vue au zoom k centrée sur ll, la couche posée, et le doigt sur ll. */
    function au(ll: [number, number], k: number): { ctx: ContexteCarte; x: number; y: number } {
      const v = placer(C, ll, 192, 361, k, true);
      const proj = projectionDe(v.r, C);
      const ctx: ContexteCarte = { proj, t: transfoDe(v, C), entites: donnees.entites, pastilles: calculerPastilles(donnees.entites, proj, v.k), acceptes: acceptesDe(donnees), mers: couche.mers, lieux };
      const b = proj(ll) as [number, number];
      const [x, y] = versEcran(ctx.t, b[0], b[1]);
      return { ctx, x, y };
    }
    const terrain = { donnees: avecMers };

    it('la mer des Caraïbes touchée pour l’Atlantique : juste, « Juste : mer des Caraïbes, dans l’Atlantique · 1 essai · … »', () => {
      const { ctx, x, y } = au([-75, 15], 4);
      const note = noter(ctx, 'atlant', x, y, optionsNoter(rs, terrain, 'atlant'));
      expect(note.juste).toBe(true);
      expect(note.admis).toEqual({ zone: 'caraibes', tenant: 'caraibes', sorte: 'partie' });
      const via = texteAdmis(rs, 'atlant', note.admis);
      expect(remplir(T.juste, { via, essais: remplir(T.essai_un, { n: 1 }), temps: '1,2 s' })).toBe("Juste : mer des Caraïbes, dans l'Atlantique · 1 essai · 1,2 s");
      expect(remplir(textes.epreuves.juste, { admis: via })).toBe("Juste : mer des Caraïbes, dans l'Atlantique");
      // Sans les zones du sujet (de fait strict, ou sous un autre sujet) : faux.
      expect(noter(ctx, 'atlant', x, y, { acceptes: true }).juste).toBe(false);
    });

    it('la mer Noire touchée pour l’Atlantique : faux, la mer Noire nommée, à sa distance du bord (jamais « la mer »)', () => {
      const { ctx, x, y } = au([34, 43.5], 4);
      const note = noter(ctx, 'atlant', x, y, optionsNoter(rs, terrain, 'atlant'));
      expect(note.juste).toBe(false);
      expect(note.pick?.id).toBe('noire');
      const retro = remplir(T.faux, { touche: rs.touche(note.pick?.id ?? null), ou: remplir(T.faux_ou, { km: fmtKm(note.distance_km!) }), suite: rs.fauxSuite('atlant') });
      expect(retro).toMatch(/^Faux : mer Noire, à [\d ]+ km du bord\. La bonne mer est en vert : touche-la\.$/);
      expect(retro).not.toContain('la mer,');
    });

    it('l’Adriatique pour la Méditerranée : juste, « dans la Méditerranée » ; la Méditerranée pour l’Atlantique : faux', () => {
      const adr = au([16, 42.5], 8);
      const n1 = noter(adr.ctx, 'medit', adr.x, adr.y, optionsNoter(rs, terrain, 'medit'));
      expect(n1.juste).toBe(true);
      expect(texteAdmis(rs, 'medit', n1.admis)).toBe(' : mer Adriatique, dans la Méditerranée');
      const med = au([18, 34], 4);
      expect(noter(med.ctx, 'atlant', med.x, med.y, optionsNoter(rs, terrain, 'atlant')).juste).toBe(false);
    });
  });
});
