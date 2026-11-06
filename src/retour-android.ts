// Bouton retour d'Android, dans l'APK seulement (décision « Écran Jouer », #18) :
// il remonte l'historique de la WebView, donc l'arbre de Jouer d'un niveau à la
// fois (src/navigation.ts : un niveau = une entrée, un niveau sauté aucune) ;
// sans historique à remonter (la carte, l'accueil), l'appli passe en
// arrière-plan, comme le veut Android. Le plugin @capacitor/app, sans écouteur,
// ferait bien le premier geste, mais ne fait rien à la racine : d'où
// l'écouteur. Sans plugin, le retour fermait l'appli à tout niveau.
//
// Chargé à part (import dynamique) et seulement dans l'APK : le site n'en
// télécharge rien. window.Capacitor.isNativePlatform est posé par le pont
// natif (native-bridge.js de @capacitor/android) avant tout script de la page.

interface PontNatif {
  isNativePlatform?: () => boolean;
}

/** Vrai dans l'APK (pont natif de Capacitor), faux sur le site. */
export function dansApk(w: { Capacitor?: PontNatif } = window as { Capacitor?: PontNatif }): boolean {
  return w.Capacitor?.isNativePlatform?.() === true;
}

/** Branche le retour d'Android sur l'historique ; sans effet sur le site. */
export function brancherRetourAndroid(): void {
  if (!dansApk()) return;
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) history.back();
      else void App.minimizeApp();
    }),
  );
}
