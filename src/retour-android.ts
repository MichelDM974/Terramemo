// Bouton retour d'Android, dans l'APK seulement (décision « Écran Jouer », #18) :
// il remonte l'historique de la WebView, donc l'arbre de Jouer d'un niveau à la
// fois (src/navigation.ts : un niveau = une entrée, un niveau sauté aucune) ;
// sans historique à remonter (la carte, l'accueil), l'appli passe en
// arrière-plan, comme le veut Android. Le plugin @capacitor/app, sans écouteur,
// ferait bien le premier geste, mais ne fait rien à la racine : d'où
// l'écouteur. Sans plugin, le retour fermait l'appli à tout niveau.
//
// L'écran de connexion ouvert (src/vues/accueil.ts) passe avant l'historique :
// le retour referme son sous-écran (pseudo de l'invité, formulaire e-mail,
// question D22) ; à ses entrées, l'appli passe en arrière-plan, sans
// history.back (l'adresse est retenue sous le panneau, rien ne changerait).
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

/**
 * Ce qui passe avant l'historique : 'fait' (un sous-écran refermé), 'reduire'
 * (rien à refermer : l'appli en arrière-plan), null (l'historique décide).
 */
export type RetourAvant = () => 'fait' | 'reduire' | null;

/** Un appui sur le retour d'Android. */
export function surRetour(canGoBack: boolean, o: { avant?: RetourAvant; back(): void; reduire(): void }): void {
  const r = o.avant?.() ?? null;
  if (r === 'fait') return;
  if (r === 'reduire' || !canGoBack) o.reduire();
  else o.back();
}

/** Branche le retour d'Android sur l'historique (après `avant`) ; sans effet sur le site. */
export function brancherRetourAndroid(avant?: RetourAvant): void {
  if (!dansApk()) return;
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('backButton', ({ canGoBack }) => surRetour(canGoBack, { avant, back: () => history.back(), reduire: () => void App.minimizeApp() })),
  );
}
