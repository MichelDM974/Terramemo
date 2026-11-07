// La version de l'appli : le commit du build (vite.config.ts, versionAppli),
// suivi de « +modifie » si des fichiers suivis différaient du commit. Elle
// change donc à chaque build déployé (site, APK), ce que la synchro du J1b
// attend d'une « nouvelle version » (étude docs/etudes/2026-11-07-j1b-conception.md,
// § 5.2 et 5.3 : lots refusés relancés, `a_relire` relu). Le `version` de
// package.json (0.0.0) ne bouge jamais, et ne servait qu'à l'affichage.
declare const __VERSION_APPLI__: string | undefined;

export const VERSION: string = typeof __VERSION_APPLI__ === 'string' && __VERSION_APPLI__ ? __VERSION_APPLI__ : 'inconnue';
