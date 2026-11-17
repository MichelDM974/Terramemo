// Nombres, listes et chargeur des fiches des lieux (#34, étude
// docs/etudes/2026-11-16-fiche-lieu-conception.md, § 4.1, § 6.1 et § 6.5 ; lot F1).
// Lot F2 : habitants, superficie, dates des fêtes, heure d'un pays et son écart à
// l'heure d'ici (Katmandou, les îles Chatham, un jour de changement d'heure), zone
// inconnue, formateurs gardés.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { chargerFichesMonde, fichesMondeChargees, lireFichesMonde, oublierFichesMonde, type FichierMonde, type FichierMondeLangue } from '../src/fiches/donnees';
import {
  fmtEcart,
  fmtEntier,
  fmtHabitants,
  fmtHabitantsCourt,
  fmtHeureLieu,
  fmtJourMois,
  fmtNombreCourt,
  fmtPart,
  fmtSuperficie,
  heureDe,
  listeEt,
  nombreFormateurs,
  prechaufferZone,
  troisChiffres,
} from '../src/fiches/format';

/** Espaces insécables (milliers, unités) en espaces simples, pour comparer. */
const simple = (s: string) => s.replace(/[  ]/g, ' ');

describe('nombres des fiches', () => {
  it('trois chiffres au plus dans la barre : 836, 56 800, 5,41 millions, 68,7 millions, 123 millions, 1,42 milliard', () => {
    expect(troisChiffres(56_789)).toBe(56_800);
    expect(troisChiffres(836)).toBe(836);
    expect(troisChiffres(0)).toBe(0);
    expect(simple(fmtNombreCourt(836))).toBe('836');
    expect(simple(fmtNombreCourt(56_789))).toBe('56 800');
    expect(simple(fmtNombreCourt(5_412_345))).toBe('5,41 millions');
    expect(simple(fmtNombreCourt(68_712_000))).toBe('68,7 millions');
    expect(simple(fmtNombreCourt(123_366_734))).toBe('123 millions');
    expect(simple(fmtNombreCourt(1_416_096_094))).toBe('1,42 milliard');
    expect(simple(fmtNombreCourt(1_500_000))).toBe('1,5 million');
    expect(simple(fmtNombreCourt(2_000_000))).toBe('2 millions');
    // Arrondi qui change d'unité : 999 500 000 donne un milliard, pas « 1 000 millions ».
    expect(simple(fmtNombreCourt(999_500_000))).toBe('1 milliard');
  });

  it('la fiche donne le nombre entier', () => {
    expect(simple(fmtEntier(123_366_734))).toBe('123 366 734');
    expect(simple(fmtEntier(836))).toBe('836');
  });

  it('listes : « La Paz et Sucre », « A, B et C », un seul élément tel quel', () => {
    expect(listeEt(['La Paz', 'Sucre'])).toBe('La Paz et Sucre');
    expect(listeEt(['Pretoria', 'Le Cap', 'Bloemfontein'])).toBe('Pretoria, Le Cap et Bloemfontein');
    expect(listeEt(['Tokyo'])).toBe('Tokyo');
  });
});

describe('chiffres, dates et heures des fiches (lot F2)', () => {
  it('habitants : le nombre entier et son année dans la fiche, trois chiffres et « hab. » dans la barre', () => {
    expect(simple(fmtHabitants(123_366_734, 2025))).toBe('123 366 734 (2025)');
    expect(simple(fmtHabitantsCourt(123_366_734))).toBe("123 millions d'hab.");
    expect(simple(fmtHabitantsCourt(1_406_585_000))).toBe("1,41 milliard d'hab.");
    expect(simple(fmtHabitantsCourt(5_324_700))).toBe("5,32 millions d'hab.");
    expect(simple(fmtHabitantsCourt(56_789))).toBe('56 800 hab.');
    expect(simple(fmtHabitantsCourt(949))).toBe('949 hab.');
    // L'arrondi qui passe le million : « d'hab. », comme le mot.
    expect(simple(fmtHabitantsCourt(999_600))).toBe("1 million d'hab.");
  });

  it('superficie en km², au centième sous 100 km² ; part d’une langue', () => {
    expect(simple(fmtSuperficie(377_974))).toBe('377 974 km²');
    expect(simple(fmtSuperficie(0.44))).toBe('0,44 km²');
    expect(simple(fmtSuperficie(2.08))).toBe('2,08 km²');
    expect(simple(fmtPart('umbundu', 29))).toBe('umbundu 29 %');
  });

  it('fêtes : « 23 février », « 1er août », le 29 février', () => {
    expect(fmtJourMois(23, 2)).toBe('23 février');
    expect(fmtJourMois(14, 7)).toBe('14 juillet');
    expect(fmtJourMois(1, 8)).toBe('1er août');
    expect(fmtJourMois(29, 2)).toBe('29 février');
    expect(fmtJourMois(31, 12)).toBe('31 décembre');
  });

  it('l’écart : « +5 h », « −9 h », « +1 h 45 », « −2 h 30 », « même heure qu’ici »', () => {
    expect(simple(fmtEcart(300))).toBe('+5 h');
    expect(simple(fmtEcart(-540))).toBe('−9 h');
    expect(simple(fmtEcart(105))).toBe('+1 h 45');
    expect(simple(fmtEcart(-150))).toBe('−2 h 30');
    expect(simple(fmtEcart(-30))).toBe('−30 min');
    expect(simple(fmtEcart(45))).toBe('+45 min');
    expect(fmtEcart(0)).toBe("même heure qu'ici");
  });

  it('l’heure d’un pays depuis La Réunion (UTC+4) : Tokyo, Katmandou (+5 h 45), les îles Chatham (+13 h 45 l’été austral), New York, un jour d’avance', () => {
    const t = new Date('2026-11-18T12:20:00Z');
    const R = 'Indian/Reunion';
    expect(simple(fmtHeureLieu('Asia/Tokyo', 1, t, R))).toBe('21 h 20 · +5 h');
    expect(simple(fmtHeureLieu('Asia/Kathmandu', 1, t, R))).toBe('18 h 05 · +1 h 45');
    // Téhéran (UTC+3 h 30, sans heure d'été depuis 2022) : moins d'une heure d'écart.
    expect(simple(fmtHeureLieu('Asia/Tehran', 1, t, R))).toBe('15 h 50 · −30 min');
    expect(simple(fmtHeureLieu('Pacific/Chatham', 1, t, R))).toBe('2 h 05 · +9 h 45');
    expect(simple(fmtHeureLieu('America/New_York', 6, t, R))).toBe('7 h 20 · −9 h · 6 fuseaux dans le pays');
    expect(simple(fmtHeureLieu('Indian/Mauritius', 1, t, R))).toBe("16 h 20 · même heure qu'ici");
    // Kiritimati (UTC+14) : déjà le lendemain ; l'écart reste juste.
    expect(heureDe('Pacific/Kiritimati', t, R)).toEqual({ heures: 2, minutes: 20, ecart: 600 });
    // Minuit : « 0 h 00 », jamais « 24 h ».
    expect(simple(fmtHeureLieu('UTC', 1, new Date('2026-11-18T00:00:00Z'), 'UTC'))).toBe("0 h 00 · même heure qu'ici");
  });

  it('un jour de changement d’heure : Paris passe de +1 h à +2 h sur l’UTC le 29 mars 2026 à 1 h UTC ; l’hiver et l’été', () => {
    expect(heureDe('Europe/Paris', new Date('2026-03-29T00:30:00Z'), 'UTC').ecart).toBe(60);
    expect(heureDe('Europe/Paris', new Date('2026-03-29T01:30:00Z'), 'UTC').ecart).toBe(120);
    expect(simple(fmtHeureLieu('Europe/Paris', 5, new Date('2026-01-15T12:00:00Z'), 'UTC'))).toBe('13 h 00 · +1 h · 5 fuseaux dans le pays');
    expect(simple(fmtHeureLieu('Europe/Paris', 5, new Date('2026-07-15T12:00:00Z'), 'UTC'))).toBe('14 h 00 · +2 h · 5 fuseaux dans le pays');
    // Les îles Chatham à l'heure d'hiver austral (juillet) : +8 h 45 depuis La Réunion.
    expect(simple(fmtHeureLieu('Pacific/Chatham', 1, new Date('2026-07-15T12:00:00Z'), 'Indian/Reunion'))).toBe('0 h 45 · +8 h 45');
  });

  it('sans zone d’ici : l’heure de l’appareil (l’écart d’une zone à elle-même est nul)', () => {
    const t = new Date('2026-11-18T12:20:00Z');
    const ici = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(heureDe(ici, t).ecart).toBe(0);
    // getTimezoneOffset : l'UTC moins l'heure d'ici, en minutes (−240 à La Réunion) ; « + 0 » : jamais −0.
    expect(heureDe('UTC', t).ecart).toBe(t.getTimezoneOffset() + 0);
  });

  it('une zone inconnue lève une RangeError, sans recréer son formateur à chaque calcul ; une zone préparée n’en crée plus', () => {
    const t = new Date('2026-11-18T12:20:00Z');
    expect(() => fmtHeureLieu('Mars/Olympus_Mons', 1, t)).toThrow(RangeError);
    const n = nombreFormateurs();
    expect(() => fmtHeureLieu('Mars/Olympus_Mons', 1, t)).toThrow(RangeError);
    expect(nombreFormateurs()).toBe(n);
    prechaufferZone('Asia/Kolkata');
    const m = nombreFormateurs();
    fmtHeureLieu('Asia/Kolkata', 1, t, 'Asia/Kolkata');
    fmtHeureLieu('Asia/Kolkata', 1, new Date(t.getTime() + 30_000), 'Asia/Kolkata');
    expect(nombreFormateurs()).toBe(m);
    // Les noms récents de zone.tab 2026e (§ 2.1) acceptés par Intl.
    for (const z of ['Asia/Kolkata', 'Asia/Kathmandu', 'Europe/Kyiv', 'America/Nuuk']) expect(() => heureDe(z, t)).not.toThrow();
  });
});

describe('chargeur des fiches du monde', () => {
  afterEach(() => oublierFichesMonde());
  const m = JSON.parse(readFileSync('public/geo/fiches-monde.json', 'utf8')) as FichierMonde;
  const fr = JSON.parse(readFileSync('public/geo/fiches-monde.fr.json', 'utf8')) as FichierMondeLangue;

  it('assemble les deux fichiers : sorte, titre de Wikipédia et chiffres par lieu, les noms résolus ; noms des sous-régions', () => {
    const d = lireFichesMonde(m, fr);
    expect(d.lieux.size).toBe(258);
    expect(d.lieux.get('JPN')).toEqual({
      sorte: 'pays',
      wp: 'Japon',
      habitants: { n: 123_366_734, annee: 2025, source: 'bm' },
      superficie: 377_974,
      langues: { officielles: ['japonais'], parlees: [] },
      monnaies: ['yen japonais'],
      gentils: 'Japonais',
      heure: { zone: 'Asia/Tokyo', fuseaux: 1 },
      culminant: { nom: 'mont Fuji', altitude: 3776 },
      fete: { jour: 23, mois: 2, nom: "Anniversaire de l'empereur" },
    });
    expect(d.lieux.get('AGO')!.langues).toEqual({ officielles: ['portugais'], parlees: [{ nom: 'umbundu', part: 29 }, { nom: 'kimboundou', part: 25 }] });
    expect(d.lieux.get('VAT')!.habitants).toEqual({ n: 949, annee: 2024, source: 'wd' });
    expect(d.lieux.get('FRA')!.heure).toEqual({ zone: 'Europe/Paris', fuseaux: 5 });
    // Pas de sommet pour la Somalie, pas de fête pour le Royaume-Uni : pas de champ, donc pas de ligne.
    expect(d.lieux.get('SOM')!.culminant).toBeUndefined();
    expect(d.lieux.get('GBR')!.fete).toBeUndefined();
    expect(d.lieux.get('GRL')).toEqual({ sorte: 'territoire', wp: null });
    expect(d.lieux.get('ATA')?.sorte).toBe('continent');
    expect(d.sousRegions['Eastern Asia']).toBe("Asie de l'Est");
    expect(() => lireFichesMonde({ ...m, v: 2 }, fr)).toThrow(/version/);
  });

  it('lit les deux fichiers une fois ; un échec ne reste pas en cache, le toucher suivant réessaie', async () => {
    const lus: string[] = [];
    let echoue = true;
    const lire = async (chemin: string) => {
      lus.push(chemin);
      if (echoue) throw new Error('hors ligne');
      return chemin.endsWith('.fr.json') ? fr : m;
    };
    await expect(chargerFichesMonde(lire)).rejects.toThrow('hors ligne');
    expect(fichesMondeChargees()).toBeNull();
    echoue = false;
    const [a, b] = await Promise.all([chargerFichesMonde(lire), chargerFichesMonde(lire)]);
    expect(a).toBe(b);
    expect(fichesMondeChargees()).toBe(a);
    await chargerFichesMonde(lire);
    expect(lus).toEqual(['/geo/fiches-monde.json', '/geo/fiches-monde.fr.json', '/geo/fiches-monde.json', '/geo/fiches-monde.fr.json']);
  });
});
