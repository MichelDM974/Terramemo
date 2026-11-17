// Page de relecture des photos (#34, lot P1 ; étude docs/etudes/2026-11-16-fiche-lieu-conception.md,
// § 3.4) : sa logique, sortie de la page dans geodata/photos/relecture-logique.mjs
// (brouillon, lieu pauvre, ajouts de « R », recadrage, garde de la validation). Sans DOM :
// la mise en page et le focus se voient sur les captures du pilote de la session principale.
import { describe, expect, it } from 'vitest';

type Candidat = { fichier: string; sujet: string | null; licence: string; licence_url: string | null; auteur: string | null; titre?: string | null; page: string; w: number; h: number; sensible?: string; nofop?: string };
type Lieu = { id: string; nom: string; sensible?: string; pauvre?: string; candidats: Candidat[] };
type Gardee = { fichier: string; sujet: string; point?: [number, number] };
type Entree = { etat: string; gardees: Gardee[]; ecartees: Record<string, string>; pauvre?: string; ajouts?: (Candidat & { remplace: string | null })[] };
type Garde = { occupe: boolean; montre: (t: number) => void; relache: () => void; essai: (t: number) => 'avertir' | 'valider' | 'attendre'; debut: () => void; fin: () => void };
type Logique = {
  candidatsDe: (l: Lieu, e?: Entree) => Candidat[];
  brouillon: (l: Lieu, e: Entree | undefined, max: number) => Entree;
  entreePauvre: (l: Lieu, e: Entree | undefined, raison: string | null, max: number) => Entree;
  cadrage: (c: { w: number; h: number }, point?: [number, number]) => { cw: number; ch: number; ox: number; oy: number; position: string };
  gardeValidation: (o: { delai: number; pause?: number }) => Garde;
};
const logique = import('../geodata/photos/relecture-logique.mjs' as string) as Promise<Logique>;

const cand = (i: number, x: Partial<Candidat> = {}): Candidat => ({
  fichier: `f${i}.jpg`, sujet: `sujet ${i}`, licence: 'CC0', licence_url: null, auteur: null, page: `https://commons.wikimedia.org/wiki/File:F${i}.jpg`, w: 3000, h: 2000, ...x,
});
const riche: Lieu = { id: 'FRA', nom: 'France', candidats: Array.from({ length: 8 }, (_, i) => cand(i)) };

describe('page de relecture (relecture-logique.mjs)', () => {
  it('brouillon : les 5 premiers cochés d’avance, sauf candidat sensible ou NoFoP ; rien pour un lieu sensible ou pauvre', async () => {
    const { brouillon } = await logique;
    expect(brouillon(riche, undefined, 5).gardees.map((g) => g.fichier)).toEqual(['f0.jpg', 'f1.jpg', 'f2.jpg', 'f3.jpg', 'f4.jpg']);
    const avecDoutes: Lieu = { ...riche, candidats: riche.candidats.map((c, i) => (i === 1 ? { ...c, nofop: 'France' } : i === 2 ? { ...c, sensible: 'Palestine' } : c)) };
    expect(brouillon(avecDoutes, undefined, 5).gardees.map((g) => g.fichier)).toEqual(['f0.jpg', 'f3.jpg', 'f4.jpg', 'f5.jpg', 'f6.jpg']);
    expect(brouillon({ ...riche, sensible: 'zone contestée' }, undefined, 5).gardees).toEqual([]);
    expect(brouillon({ ...riche, pauvre: '1 candidat' }, undefined, 5).gardees).toEqual([]);
    // Une entrée existante est rendue telle quelle (une copie).
    const e: Entree = { etat: 'en_cours', gardees: [{ fichier: 'f7.jpg', sujet: 'x' }], ecartees: {} };
    const b = brouillon(riche, e, 5);
    expect(b).toEqual(e);
    expect(b).not.toBe(e);
  });

  it('P sur un lieu riche sans entrée : rien de coché (le brouillon en cochait 5) ; avec une entrée, ses photos restent', async () => {
    const { entreePauvre, brouillon } = await logique;
    const e = entreePauvre(riche, undefined, 'aucune vue de la mer', 5);
    expect(e).toMatchObject({ etat: 'en_cours', gardees: [], pauvre: 'aucune vue de la mer' });
    // Une fois marqué, le brouillon (qui lit l'entrée) ne recoche rien.
    expect(brouillon(riche, e, 5).gardees).toEqual([]);
    const deja: Entree = { etat: 'en_cours', gardees: [{ fichier: 'f3.jpg', sujet: 'x' }], ecartees: {} };
    expect(entreePauvre(riche, deja, 'r', 5).gardees.map((g) => g.fichier)).toEqual(['f3.jpg']);
    expect(entreePauvre(riche, { ...deja, pauvre: 'r' }, null, 5)).not.toHaveProperty('pauvre');
  });

  it('les ajouts de « R » prennent la place du candidat remplacé, ou viennent à la suite', async () => {
    const { candidatsDe } = await logique;
    const e: Entree = { etat: 'en_cours', gardees: [], ecartees: {}, ajouts: [{ ...cand(20), remplace: 'f1.jpg' }, { ...cand(21), remplace: null }] };
    expect(candidatsDe(riche, e).map((c) => c.fichier)).toEqual(['f0.jpg', 'f20.jpg', 'f2.jpg', 'f3.jpg', 'f4.jpg', 'f5.jpg', 'f6.jpg', 'f7.jpg', 'f21.jpg']);
  });

  it('recadrage 3:2 centré sur le point, borné à l’image', async () => {
    const { cadrage } = await logique;
    expect(cadrage({ w: 3000, h: 2000 })).toMatchObject({ cw: 3000, ch: 2000, ox: 0, oy: 0, position: '50.0% 50.0%' });
    // 4:3 paysage : on coupe en haut et en bas ; le point en haut colle le cadre en haut.
    expect(cadrage({ w: 4000, h: 3000 }, [0.5, 0])).toMatchObject({ cw: 4000, oy: 0, position: '50.0% 0.0%' });
    expect(cadrage({ w: 4000, h: 3000 }, [0.5, 1]).position).toBe('50.0% 100.0%');
    // Panorama : on coupe à gauche et à droite.
    const k = cadrage({ w: 6000, h: 2000 }, [0.9, 0.5]);
    expect(k).toMatchObject({ cw: 3000, ch: 2000, ox: 3000 });
  });

  it('garde de la validation : Entrée gardé enfoncé ne confirme jamais ; relâcher puis attendre confirme ; rien pendant un enregistrement', async () => {
    const { gardeValidation } = await logique;
    const g = gardeValidation({ delai: 2000, pause: 400 });
    g.montre(0);
    expect(g.essai(100)).toBe('avertir');
    // La répétition du clavier (≈ 30 par seconde) sans relâchement : jamais « valider ».
    for (let t = 133; t < 2000; t += 33) expect(g.essai(t), String(t)).toBe('attendre');
    // Relâché mais trop tôt après l'avertissement : on attend encore.
    const h = gardeValidation({ delai: 2000, pause: 400 });
    h.montre(0);
    expect(h.essai(100)).toBe('avertir');
    h.relache();
    expect(h.essai(300)).toBe('attendre');
    expect(h.essai(600)).toBe('valider');
    // Le lieu suivant s'affiche : la touche encore enfoncée ne compte pas pour un relâchement.
    h.montre(700);
    expect(h.essai(710)).toBe('avertir');
    // Après le délai, un appui franc valide sans avertissement.
    h.montre(1000);
    expect(h.essai(3100)).toBe('valider');
    h.debut();
    expect(h.essai(9000)).toBe('attendre');
    h.fin();
    expect(h.essai(9000)).toBe('valider');
  });
});
