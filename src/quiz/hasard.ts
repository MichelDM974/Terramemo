// Hasard à graine du tirage (tests : une graine, la même partie à chaque fois ;
// la vue : Math.random). mulberry32, 32 bits : assez pour mélanger 20 questions.
// Le mélange est celui des séries (src/vues/cibles.ts, melanger).

/** Un générateur de nombres dans [0, 1), déterminé par la graine. */
export function graine(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un élément au hasard ; undefined pour une liste vide. */
export const auHasard = <T>(t: readonly T[], hasard: () => number): T | undefined => t[Math.floor(hasard() * t.length)];
