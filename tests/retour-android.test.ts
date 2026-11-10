// Le retour d'Android ne se branche que dans l'APK (src/retour-android.ts) :
// le site ne doit jamais charger @capacitor/app.
import { describe, expect, it, vi } from 'vitest';
import { dansApk, surRetour } from '../src/retour-android';

describe('retour Android', () => {
  it("n'est branché que sous le pont natif de Capacitor", () => {
    expect(dansApk({})).toBe(false);
    expect(dansApk({ Capacitor: {} })).toBe(false);
    expect(dansApk({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(dansApk({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
  });

  it('l’écran de connexion passe avant l’historique : sous-écran refermé, ou l’appli réduite sans history.back', () => {
    const appui = (canGoBack: boolean, avant?: () => 'fait' | 'reduire' | null) => {
      const back = vi.fn();
      const reduire = vi.fn();
      surRetour(canGoBack, { avant, back, reduire });
      return [back.mock.calls.length, reduire.mock.calls.length];
    };
    // Sans panneau : l'historique, puis l'arrière-plan à la racine.
    expect(appui(true)).toEqual([1, 0]);
    expect(appui(false)).toEqual([0, 1]);
    expect(appui(true, () => null)).toEqual([1, 0]);
    // Un sous-écran du panneau refermé : rien d'autre.
    expect(appui(true, () => 'fait')).toEqual([0, 0]);
    expect(appui(false, () => 'fait')).toEqual([0, 0]);
    // Les entrées du panneau : l'appli réduite, même avec un historique (l'adresse est retenue dessous).
    expect(appui(true, () => 'reduire')).toEqual([0, 1]);
  });
});
