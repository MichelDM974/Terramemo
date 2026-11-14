// Côté page du service worker (#22, src/sw/logique.ts pour le reste) : sur
// le site en production seulement, jamais dans l'APK (ses fichiers y sont
// déjà locaux, et un cache y servirait l'ancien bundle après une mise à
// jour) ni en développement (vite.config.ts y sert à /sw.js un service worker
// qui se retire, au cas où un build servi à la même adresse en aurait laissé
// un). Aucun import de logique.ts : sw.js doit rester d'un seul tenant (un
// module partagé deviendrait un morceau importé) ; les messages en ont donc
// leur copie, que tests/service-worker.test.ts compare.
import { dansApk } from '../retour-android';

export const MESSAGE_ACTIVER = 'terramemo:activer';
export const MESSAGE_CHARGES = 'terramemo:charges';
/** Au-delà, une relève qui arrive ne recharge plus la page (on a pu commencer à jouer). */
export const RECHARGE_MAX_MS = 15_000;

/** Le service worker est-il voulu ici ? Build de production, site (pas l'APK), navigateur qui l'accepte, contexte sûr. */
export function swVoulu(o: { prod: boolean; apk: boolean; avecSw: boolean; contexteSur: boolean }): boolean {
  return o.prod && !o.apk && o.avecSw && o.contexteSur;
}

const voulu = (): boolean =>
  swVoulu({ prod: import.meta.env.PROD, apk: dansApk(), avecSw: 'serviceWorker' in navigator, contexteSur: isSecureContext });

/** Les adresses de l'origine que la page a chargées (elle-même comprise), pour logique.ts, retenir. */
export function chargesDeLaPage(page: string, ressources: readonly string[], origine: string): string[] {
  return [page, ...ressources].filter((u) => {
    try {
      return new URL(u).origin === origine;
    } catch {
      return false;
    }
  });
}

/**
 * Au tout début du chargement : une version installée pendant une visite
 * d'avant attend la relève. La page la demande (elle ne sera accordée que si
 * c'est la seule fenêtre ouverte) et se recharge une fois la nouvelle version
 * aux commandes, avant qu'on ait joué : la page servie par l'ancienne version
 * perdrait sinon son cache, effacé à l'activation.
 */
export function prendreMiseAJour(): void {
  if (!voulu() || !navigator.serviceWorker.controller) return;
  const sw = navigator.serviceWorker;
  void sw
    .getRegistration()
    .then((reg) => {
      const attente = reg?.waiting;
      if (!attente) return;
      let recharge = false;
      sw.addEventListener('controllerchange', () => {
        if (recharge || performance.now() > RECHARGE_MAX_MS) return;
        recharge = true;
        location.reload();
      });
      attente.postMessage({ type: MESSAGE_ACTIVER });
    })
    .catch(() => undefined);
}

/**
 * Après le premier affichage (pour ne rien lui disputer) : enregistre
 * /sw.js, ce qui vérifie aussi s'il a changé (une nouvelle version s'installe
 * alors en fond, prise au prochain chargement), puis lui passe ce que la page
 * a déjà chargé, à ranger.
 */
export function enregistrerServiceWorker(): void {
  if (!voulu()) return;
  const sw = navigator.serviceWorker;
  sw.register('/sw.js')
    .then(() => sw.ready)
    .then((reg) => {
      const ressources = performance.getEntriesByType('resource').map((e) => e.name);
      reg.active?.postMessage({ type: MESSAGE_CHARGES, urls: chargesDeLaPage(location.href, ressources, location.origin) });
    })
    .catch((e: unknown) => console.warn('Service worker non enregistré :', e));
}
