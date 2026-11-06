// Le retour d'Android ne se branche que dans l'APK (src/retour-android.ts) :
// le site ne doit jamais charger @capacitor/app.
import { describe, expect, it } from 'vitest';
import { dansApk } from '../src/retour-android';

describe('retour Android', () => {
  it("n'est branché que sous le pont natif de Capacitor", () => {
    expect(dansApk({})).toBe(false);
    expect(dansApk({ Capacitor: {} })).toBe(false);
    expect(dansApk({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(dansApk({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
  });
});
